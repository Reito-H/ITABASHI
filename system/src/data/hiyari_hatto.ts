// ヒヤリハット関連の共通定義。
// - 選択肢リスト（公開フォーム・入力検証・集計の並び順の単一の出所）
// - DB行の型と集計ヘルパー（外部依存なし）
//
// 実データは D1 の hiyari_reports テーブル（migration_128）。
// 初期31件（2026年8月20日 集約分・紙シート）は同 migration で source='sheet' として投入済み。

export const HIYARI_SOURCE_LABEL = 'ヒヤリハット報告シート（2026年8月20日 集約分・31枚）を初期データとしてWeb収集を開始';

// ---- 選択肢（フォームのプルダウン＝この順で集計にも並ぶ） ----
export const HIYARI_WEATHER_OPTS = ['晴', '曇', '雨', '雪', '夜間', 'その他'] as const;
export const HIYARI_AREA_OPTS = [
  '新宿エリア', '外苑・六本木エリア', '池袋エリア', '恵比寿エリア', '羽田空港', '営業所周辺', 'その他',
] as const;
export const HIYARI_COUNTERPART_OPTS = [
  '四輪車', '自転車', '歩行者', '二輪車', '路上横臥者', '信号・自車判断', '複合',
] as const;
export const HIYARI_SITUATION_OPTS = [
  '右左折時', '進路変更・車線変更時', '割り込み・幅寄せ', '飛び出し', '前車の急な動作',
  '逆走', '信号・交差点内滞留', '狭路・待機トラブル', 'その他', '複合',
] as const;
export const HIYARI_CAUSE_OPTS = [
  '相手の予測外行動', '自分の確認不足', '判断ミス・焦り', '相手の交通違反',
  '車間距離不足', '環境要因（暗さ・狭さ）',
] as const;

export function isValidChoice(v: string | undefined | null, opts: readonly string[]): boolean {
  return !!v && opts.includes(v);
}

// ---- DB行 ----
export interface HiyariRow {
  id: number;
  source: string;          // 'web' | 'sheet'
  emp_no: string;
  division: number | null;
  team: number | null;
  occurred_at: string;
  weather: string;
  place_area: string;
  place_detail: string;
  counterpart: string;
  situation: string;
  situation_text: string;
  cause: string;
  cause_text: string;
  measure_text: string;
  severe: number;          // 0 | 1
  status: string;          // 'open' | 'reviewed'
  admin_note: string;
  created_at: string;
  updated_at: string;
}

// ---- 集計 ----
export interface TallyItem { label: string; count: number }

// 選択肢の順序を尊重して集計（未選択・想定外の値は「未選択・その他」にまとめる）
function tallyByOptions(rows: HiyariRow[], pick: (r: HiyariRow) => string, opts: readonly string[]): TallyItem[] {
  const m = new Map<string, number>();
  for (const o of opts) m.set(o, 0);
  let other = 0;
  for (const r of rows) {
    const v = pick(r);
    if (m.has(v)) m.set(v, (m.get(v) ?? 0) + 1);
    else other += 1;
  }
  const out = [...m.entries()].map(([label, count]) => ({ label, count }));
  if (other > 0) out.push({ label: '未選択・その他', count: other });
  return out.filter(i => i.count > 0);
}

export interface HiyariStats {
  total: number;
  severe: number;
  webCount: number;
  sheetCount: number;
  datetimeKnown: number;
  badWeather: number;
  byCounterpart: TallyItem[];
  bySituation: TallyItem[];
  byArea: TallyItem[];
  byCause: TallyItem[];
  byKa: TallyItem[];
}

export function computeHiyariStats(rows: HiyariRow[]): HiyariStats {
  const kaLabel = (r: HiyariRow): string => (r.division ? `${r.division}課` : '課の記入なし');
  const kaOrder = ['1課', '2課', '3課', '4課', '5課', '6課', '7課', '8課', '課の記入なし'];
  const byKa = tallyByOptions(rows, kaLabel, kaOrder);
  return {
    total: rows.length,
    severe: rows.filter(r => r.severe).length,
    webCount: rows.filter(r => r.source === 'web').length,
    sheetCount: rows.filter(r => r.source === 'sheet').length,
    datetimeKnown: rows.filter(r => r.occurred_at.trim() !== '').length,
    badWeather: rows.filter(r => /雨|雪/.test(r.weather)).length,
    byCounterpart: tallyByOptions(rows, r => r.counterpart, HIYARI_COUNTERPART_OPTS),
    bySituation: tallyByOptions(rows, r => r.situation, HIYARI_SITUATION_OPTS),
    byArea: tallyByOptions(rows, r => r.place_area, HIYARI_AREA_OPTS),
    byCause: tallyByOptions(rows, r => r.cause, HIYARI_CAUSE_OPTS),
    byKa,
  };
}
