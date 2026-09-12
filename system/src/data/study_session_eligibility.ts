// 板橋イベントの「対象者の絞り込み」条件。admin / public 両方で同じ判定を使う。
//   mode:'all'        … 誰でも対象
//   mode:'conditions' … 指定した条件を AND で満たす社員のみ対象
//     - tenure_max_months : 入社(hire_date)から今日までが N ヶ月以内
//     - tenure_min_months : 入社から今日までが N ヶ月以上
//     - entry_types       : 入社区分（'新卒'|'キャリア'|'縁故'）のいずれか。空配列=不問
//     - newcomers_only    : 新人登録中（is_newcomer=1）のみ
//     - emp_nos           : この社員番号のみ。空配列=不問
//   hire_date 未登録の社員は、在籍年数の条件が付いている場合は「対象外」扱い（判定できないため）。

export type Eligibility = {
  mode: 'all' | 'conditions';
  tenure_max_months: number | null;
  tenure_min_months: number | null;
  entry_types: string[];
  newcomers_only: boolean;
  emp_nos: string[];
};

export type EmpForEligibility = {
  emp_no: string;
  hire_date: string | null;
  entry_type: string | null;
  is_newcomer: number | null;
};

export const ENTRY_TYPES = ['新卒', 'キャリア', '縁故'] as const;

const EMPTY: Eligibility = {
  mode: 'all',
  tenure_max_months: null,
  tenure_min_months: null,
  entry_types: [],
  newcomers_only: false,
  emp_nos: [],
};

function toInt(v: unknown): number | null {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

// 記入欄「◯年◯ヶ月」→ 総月数
export function ymToMonths(years: unknown, months: unknown): number | null {
  const y = toInt(years) ?? 0;
  const m = toInt(months) ?? 0;
  const total = y * 12 + m;
  return total > 0 ? total : null;
}

export function monthsToYm(total: number | null): { years: number; months: number } {
  const t = total && total > 0 ? total : 0;
  return { years: Math.floor(t / 12), months: t % 12 };
}

// DB 保存値（JSON 文字列 or null）から Eligibility を復元
export function parseEligibility(raw: string | null | undefined): Eligibility {
  if (!raw) return { ...EMPTY };
  let j: Record<string, unknown>;
  try { j = JSON.parse(raw) as Record<string, unknown>; } catch { return { ...EMPTY }; }
  if (!j || typeof j !== 'object') return { ...EMPTY };
  const mode = j.mode === 'conditions' ? 'conditions' : 'all';
  const entryTypes = Array.isArray(j.entry_types)
    ? (j.entry_types as unknown[]).map(String).filter((t) => (ENTRY_TYPES as readonly string[]).includes(t))
    : [];
  const empNos = Array.isArray(j.emp_nos)
    ? (j.emp_nos as unknown[]).map((x) => String(x).trim()).filter(Boolean).slice(0, 500)
    : [];
  return {
    mode,
    tenure_max_months: toInt(j.tenure_max_months),
    tenure_min_months: toInt(j.tenure_min_months),
    entry_types: entryTypes,
    newcomers_only: j.newcomers_only === true || j.newcomers_only === 1,
    emp_nos: empNos,
  };
}

// フォーム入力（クライアント JSON）→ 保存する JSON 文字列 or null（＝全員）
export function serializeEligibility(input: unknown): string | null {
  const j = (input && typeof input === 'object') ? input as Record<string, unknown> : {};
  const e = parseEligibility(JSON.stringify(j));
  if (e.mode !== 'conditions') return null;
  const hasAny =
    e.tenure_max_months != null || e.tenure_min_months != null ||
    e.entry_types.length > 0 || e.newcomers_only || e.emp_nos.length > 0;
  if (!hasAny) return null; // 条件なし＝全員
  return JSON.stringify({
    mode: 'conditions',
    tenure_max_months: e.tenure_max_months,
    tenure_min_months: e.tenure_min_months,
    entry_types: e.entry_types,
    newcomers_only: e.newcomers_only,
    emp_nos: e.emp_nos,
  });
}

// from(YYYY-MM-DD) から to(YYYY-MM-DD) までの満月数。from が無効なら null。
export function monthsBetween(from: string | null | undefined, to: string): number | null {
  if (!from || !/^\d{4}-\d{2}-\d{2}/.test(from)) return null;
  const f = from.slice(0, 10).split('-').map(Number);
  const t = to.slice(0, 10).split('-').map(Number);
  let months = (t[0] - f[0]) * 12 + (t[1] - f[1]);
  if (t[2] < f[2]) months -= 1;
  return months;
}

export function isEligible(e: Eligibility, emp: EmpForEligibility, today: string): boolean {
  if (e.mode !== 'conditions') return true;
  if (e.emp_nos.length > 0 && !e.emp_nos.includes(String(emp.emp_no).trim())) return false;
  if (e.entry_types.length > 0 && !e.entry_types.includes(emp.entry_type ?? '')) return false;
  if (e.newcomers_only && emp.is_newcomer !== 1) return false;
  if (e.tenure_max_months != null || e.tenure_min_months != null) {
    const m = monthsBetween(emp.hire_date, today);
    if (m == null) return false; // 入社日不明＝在籍年数を判定できない
    if (e.tenure_max_months != null && m > e.tenure_max_months) return false;
    if (e.tenure_min_months != null && m < e.tenure_min_months) return false;
  }
  return true;
}

// 管理画面の一覧などに出す説明文
export function describeEligibility(e: Eligibility): string {
  if (e.mode !== 'conditions') return '全員';
  const parts: string[] = [];
  if (e.tenure_max_months != null) {
    const { years, months } = monthsToYm(e.tenure_max_months);
    parts.push('入社' + (years ? years + '年' : '') + (months ? months + 'ヶ月' : '') + '以内');
  }
  if (e.tenure_min_months != null) {
    const { years, months } = monthsToYm(e.tenure_min_months);
    parts.push('入社' + (years ? years + '年' : '') + (months ? months + 'ヶ月' : '') + '以上');
  }
  if (e.entry_types.length > 0) parts.push(e.entry_types.join('・'));
  if (e.newcomers_only) parts.push('新人登録中');
  if (e.emp_nos.length > 0) parts.push('社員番号' + e.emp_nos.length + '名を指定');
  return parts.length ? parts.join(' / ') : '全員';
}
