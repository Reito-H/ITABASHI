// アンケート機能（migration_129）の共有ロジック：設問タイプ・設定の正規化・回答検証・集計。
// 管理側（admin_study_sessions.ts）と公開側（public_study_sessions.ts）の両方から使う。外部依存なし。

export type SurveyQType =
  | 'radio' | 'checkbox' | 'text' | 'textarea' | 'scale' | 'yesno' | 'number' | 'date';

export const SURVEY_QTYPES: { value: SurveyQType; label: string }[] = [
  { value: 'radio', label: '単一選択（ラジオ）' },
  { value: 'checkbox', label: '複数選択（チェック）' },
  { value: 'text', label: '自由記述（短文）' },
  { value: 'textarea', label: '自由記述（長文）' },
  { value: 'scale', label: '段階評価' },
  { value: 'yesno', label: 'はい・いいえ' },
  { value: 'number', label: '数値' },
  { value: 'date', label: '日付' },
];
const QTYPE_SET = new Set(SURVEY_QTYPES.map(t => t.value));
export function isQType(v: unknown): v is SurveyQType {
  return typeof v === 'string' && QTYPE_SET.has(v as SurveyQType);
}

export interface QSettings {
  choices: string[];       // radio/checkbox
  allowOther: boolean;     // radio/checkbox
  minSel: number;          // checkbox 最小選択数（0=指定なし）
  maxSel: number;          // checkbox 最大選択数（0=指定なし）
  scaleMin: number;        // scale
  scaleMax: number;        // scale
  minLabel: string;        // scale 左端ラベル
  maxLabel: string;        // scale 右端ラベル
  numMin: number | null;   // number
  numMax: number | null;   // number
  unit: string;            // number 単位表示
  yesLabel: string;        // yesno
  noLabel: string;         // yesno
}

const num = (v: unknown, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
};
const str = (v: unknown, max: number): string => String(v ?? '').slice(0, max).trim();

export function normalizeSettings(qtype: SurveyQType, raw: unknown): QSettings {
  const r = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const choices = Array.isArray(r.choices)
    ? (r.choices as unknown[]).map(c => str(c, 200)).filter(Boolean).slice(0, 50)
    : [];
  let scaleMin = Math.round(num(r.scaleMin, 1));
  let scaleMax = Math.round(num(r.scaleMax, 5));
  if (scaleMin < 0) scaleMin = 0;
  if (scaleMax > 10) scaleMax = 10;
  if (scaleMax <= scaleMin) scaleMax = scaleMin + 1;
  const numMinRaw = r.numMin === '' || r.numMin == null ? null : num(r.numMin, NaN);
  const numMaxRaw = r.numMax === '' || r.numMax == null ? null : num(r.numMax, NaN);
  return {
    choices: (qtype === 'radio' || qtype === 'checkbox') ? choices : [],
    allowOther: (qtype === 'radio' || qtype === 'checkbox') ? !!r.allowOther : false,
    minSel: qtype === 'checkbox' ? Math.max(0, Math.round(num(r.minSel, 0))) : 0,
    maxSel: qtype === 'checkbox' ? Math.max(0, Math.round(num(r.maxSel, 0))) : 0,
    scaleMin: qtype === 'scale' ? scaleMin : 1,
    scaleMax: qtype === 'scale' ? scaleMax : 5,
    minLabel: qtype === 'scale' ? str(r.minLabel, 30) : '',
    maxLabel: qtype === 'scale' ? str(r.maxLabel, 30) : '',
    numMin: qtype === 'number' && numMinRaw != null && Number.isFinite(numMinRaw) ? numMinRaw : null,
    numMax: qtype === 'number' && numMaxRaw != null && Number.isFinite(numMaxRaw) ? numMaxRaw : null,
    unit: qtype === 'number' ? str(r.unit, 20) : '',
    yesLabel: qtype === 'yesno' ? (str(r.yesLabel, 20) || 'はい') : 'はい',
    noLabel: qtype === 'yesno' ? (str(r.noLabel, 20) || 'いいえ') : 'いいえ',
  };
}

export interface QuestionForValidate {
  qtype: SurveyQType;
  required: boolean;
  settings: QSettings;
}

type ValidateResult = { ok: true; stored: string } | { ok: false; error: string };

// rawValue: radio/text/textarea/date/number/scale/yesno は string、checkbox は string[]
export function validateAnswer(q: QuestionForValidate, rawValue: unknown): ValidateResult {
  const s = q.settings;
  const empty = (v: string) => v.trim() === '';

  if (q.qtype === 'checkbox') {
    const arr = Array.isArray(rawValue)
      ? (rawValue as unknown[]).map(v => String(v ?? '').slice(0, 200).trim()).filter(Boolean)
      : [];
    const uniq = [...new Set(arr)];
    if (uniq.length === 0) {
      return q.required ? { ok: false, error: '選択してください' } : { ok: true, stored: '' };
    }
    if (!s.allowOther) {
      const bad = uniq.find(v => !s.choices.includes(v));
      if (bad) return { ok: false, error: '不正な選択肢です' };
    }
    if (s.minSel > 0 && uniq.length < s.minSel) return { ok: false, error: `${s.minSel}個以上選択してください` };
    if (s.maxSel > 0 && uniq.length > s.maxSel) return { ok: false, error: `${s.maxSel}個以下で選択してください` };
    return { ok: true, stored: JSON.stringify(uniq) };
  }

  const v = String(rawValue ?? '').slice(0, 2000).trim();
  if (empty(v)) {
    return q.required ? { ok: false, error: '入力してください' } : { ok: true, stored: '' };
  }

  switch (q.qtype) {
    case 'radio':
      if (!s.allowOther && !s.choices.includes(v)) return { ok: false, error: '不正な選択肢です' };
      return { ok: true, stored: v };
    case 'yesno':
      if (v !== s.yesLabel && v !== s.noLabel) return { ok: false, error: '不正な値です' };
      return { ok: true, stored: v };
    case 'scale': {
      const n = Number(v);
      if (!Number.isInteger(n) || n < s.scaleMin || n > s.scaleMax) return { ok: false, error: '不正な評価値です' };
      return { ok: true, stored: String(n) };
    }
    case 'number': {
      const n = Number(v);
      if (!Number.isFinite(n)) return { ok: false, error: '数値を入力してください' };
      if (s.numMin != null && n < s.numMin) return { ok: false, error: `${s.numMin} 以上で入力してください` };
      if (s.numMax != null && n > s.numMax) return { ok: false, error: `${s.numMax} 以下で入力してください` };
      return { ok: true, stored: String(n) };
    }
    case 'date':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: '日付の形式が不正です' };
      return { ok: true, stored: v };
    case 'text':
      return { ok: true, stored: v.slice(0, 300) };
    case 'textarea':
      return { ok: true, stored: v.slice(0, 2000) };
    default:
      return { ok: false, error: '不明な設問です' };
  }
}

// 集計。answers = その設問への value_text の配列（空文字は未回答として除外済みで渡す）
export interface AggResult {
  answered: number;
  counts?: { label: string; n: number }[];   // radio/checkbox/yesno
  other?: string[];                           // radio/checkbox の choices 外の記入
  stat?: { n: number; avg: number; min: number; max: number; dist: { value: number; n: number }[] }; // scale/number
  values?: string[];                          // text/textarea/date
}

export function aggregateQuestion(qtype: SurveyQType, settings: QSettings, answers: string[]): AggResult {
  const nonEmpty = answers.filter(a => a.trim() !== '');
  const res: AggResult = { answered: nonEmpty.length };

  if (qtype === 'radio' || qtype === 'checkbox' || qtype === 'yesno') {
    const known = qtype === 'yesno' ? [settings.yesLabel, settings.noLabel] : settings.choices;
    const map = new Map<string, number>();
    for (const k of known) map.set(k, 0);
    const other: string[] = [];
    for (const a of nonEmpty) {
      let picks: string[];
      if (qtype === 'checkbox') {
        try { const arr = JSON.parse(a); picks = Array.isArray(arr) ? arr.map(String) : [a]; }
        catch { picks = [a]; }
      } else {
        picks = [a];
      }
      for (const p of picks) {
        if (map.has(p)) map.set(p, (map.get(p) ?? 0) + 1);
        else other.push(p);
      }
    }
    res.counts = [...map.entries()].map(([label, n]) => ({ label, n }));
    if (other.length) res.other = other;
    return res;
  }

  if (qtype === 'scale' || qtype === 'number') {
    const nums = nonEmpty.map(Number).filter(n => Number.isFinite(n));
    if (nums.length) {
      const sum = nums.reduce((a, b) => a + b, 0);
      const distMap = new Map<number, number>();
      for (const n of nums) distMap.set(n, (distMap.get(n) ?? 0) + 1);
      res.stat = {
        n: nums.length,
        avg: Math.round((sum / nums.length) * 100) / 100,
        min: Math.min(...nums),
        max: Math.max(...nums),
        dist: [...distMap.entries()].sort((a, b) => a[0] - b[0]).map(([value, n]) => ({ value, n })),
      };
    } else {
      res.stat = { n: 0, avg: 0, min: 0, max: 0, dist: [] };
    }
    return res;
  }

  // text / textarea / date
  res.values = nonEmpty.slice(0, 2000);
  return res;
}

// CSV セル用（checkbox は " / " 連結、それ以外は素の値）
export function answerToCsvCell(qtype: SurveyQType, valueText: string): string {
  if (qtype === 'checkbox' && valueText) {
    try { const arr = JSON.parse(valueText); if (Array.isArray(arr)) return arr.join(' / '); }
    catch { /* fallthrough */ }
  }
  return valueText;
}

// 公開フォームへ復元する形（checkbox は配列、それ以外は文字列）
export function answerForClient(qtype: SurveyQType, valueText: string): string | string[] {
  if (qtype === 'checkbox') {
    if (!valueText) return [];
    try { const arr = JSON.parse(valueText); return Array.isArray(arr) ? arr.map(String) : []; }
    catch { return []; }
  }
  return valueText;
}
