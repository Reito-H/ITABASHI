// 事故防止研修「教材」機能の実データ集計
// 文言は accidents_material_content.ts に固定で持たせ、数字（件数・割合）だけは
// 教材を開くたびに accident_records から毎回ライブ集計する（事故記録は今後も増え続けるため）。
// 外部AI/LLM APIへの通信は一切行わない。頻度集計のみの同期処理。
import { type AccidentRecord, bucketHourBands } from '../html/accidents';
import { freqRanking, pct } from './accident_trend_analysis';

// 教材P5-14で扱う5テーマ。ページの並び順もこの並びに一致させる。
export type ThemeId = 'lane_change' | 'left_turn' | 'forward' | 'assumption' | 'impatience';

export const THEME_ORDER: ThemeId[] = ['lane_change', 'left_turn', 'forward', 'assumption', 'impatience'];

// テーマ判定キー（実データの自由記述語彙に対する完全一致。正規表現より明快・安全なため採用）
const THEME_CAUSE_DIRECT_KEYS: Partial<Record<ThemeId, string[]>> = {
  lane_change: ['車線変更不注意', '後方不注意'],
  left_turn: ['左折不注意'],
  forward: ['前方不注意', '漫然', '脇見'],
};
const THEME_CAUSE_REASON_KEYS: Partial<Record<ThemeId, string[]>> = {
  assumption: ['見込み運転'],
  impatience: ['焦り'],
};

// 単独物損事故として扱う対象（電柱・ポール・縁石等、構造物への接触）
const SOLO_OBJECT_TARGETS = ['縁石', 'ポール', '電柱', '塀', 'ガードレール'];

export interface RankedItem {
  key: string;
  cnt: number;
  pct: number;
}

export interface ThemeStat {
  cnt: number;
  pct: number;
}

export interface MaterialStats {
  totalCount: number;
  causeDirectRanking: RankedItem[];
  causeReasonRanking: RankedItem[];
  accidentFormRanking: RankedItem[];
  accidentTargetRanking: RankedItem[];
  soloObjectCount: number;
  soloObjectPct: number;
  hourBands: number[]; // 2時間刻み12本
  peakHourLabels: { label: string; cnt: number }[]; // 件数上位2枠
  dryRoadPct: number;
  themes: Record<ThemeId, ThemeStat>;
  impatienceByBusinessStatus: RankedItem[]; // 「焦り」原因の事故を営業状況別に集計
}

function toRanked(list: Array<{ key: string; cnt: number }>, total: number): RankedItem[] {
  return list.map(({ key, cnt }) => ({ key, cnt, pct: pct(cnt, total) }));
}

function countByKeys(records: AccidentRecord[], field: 'cause_direct' | 'cause_reason', keys: string[]): number {
  const set = new Set(keys);
  return records.reduce((n, r) => n + (r[field] && set.has(r[field] as string) ? 1 : 0), 0);
}

// 事故記録の集合からテーマ別件数・割合を集計する（全社集計・個人集計の両方で共用）
function computeThemeStats(records: AccidentRecord[]): Record<ThemeId, ThemeStat> {
  const totalCount = records.length;
  const themes = {} as Record<ThemeId, ThemeStat>;
  for (const id of THEME_ORDER) {
    const directKeys = THEME_CAUSE_DIRECT_KEYS[id];
    const reasonKeys = THEME_CAUSE_REASON_KEYS[id];
    const cnt = directKeys
      ? countByKeys(records, 'cause_direct', directKeys)
      : countByKeys(records, 'cause_reason', reasonKeys || []);
    themes[id] = { cnt, pct: pct(cnt, totalCount) };
  }
  return themes;
}

// テーマ別件数から最も件数の多いテーマを判定する（同数の場合はTHEME_ORDERの先頭を優先、全て0件ならnull）
function dominantThemeOf(themes: Record<ThemeId, ThemeStat>): ThemeId | null {
  let best: ThemeId | null = null;
  let bestCnt = 0;
  for (const id of THEME_ORDER) {
    if (themes[id].cnt > bestCnt) {
      best = id;
      bestCnt = themes[id].cnt;
    }
  }
  return best;
}

export function buildMaterialStats(records: AccidentRecord[]): MaterialStats {
  const totalCount = records.length;

  const causeDirectRanking = toRanked(freqRanking(records, r => r.cause_direct), totalCount);
  const causeReasonRanking = toRanked(freqRanking(records, r => r.cause_reason), totalCount);
  const accidentFormRanking = toRanked(freqRanking(records, r => r.accident_form), totalCount);
  const accidentTargetRanking = toRanked(freqRanking(records, r => r.accident_target), totalCount);

  const soloObjectCount = records.reduce(
    (n, r) => n + (r.accident_target && SOLO_OBJECT_TARGETS.includes(r.accident_target) ? 1 : 0),
    0
  );

  const hourBands = bucketHourBands(records.map(r => r.occurred_time));
  const peakHourLabels = hourBands
    .map((cnt, i) => ({ label: `${i * 2}-${i * 2 + 2}時`, cnt }))
    .sort((a, b) => b.cnt - a.cnt)
    .slice(0, 2);

  const dryCount = records.reduce((n, r) => n + (r.road_condition === '乾' ? 1 : 0), 0);

  const themes = computeThemeStats(records);

  const impatienceRecords = records.filter(r => r.cause_reason === '焦り');
  const impatienceByBusinessStatus = toRanked(
    freqRanking(impatienceRecords, r => r.business_status),
    impatienceRecords.length
  );

  return {
    totalCount,
    causeDirectRanking,
    causeReasonRanking,
    accidentFormRanking,
    accidentTargetRanking,
    soloObjectCount,
    soloObjectPct: pct(soloObjectCount, totalCount),
    hourBands,
    peakHourLabels,
    dryRoadPct: pct(dryCount, totalCount),
    themes,
    impatienceByBusinessStatus,
  };
}

// 個人別教材（表紙の氏名欄・個人の事故傾向ページ・まとめページで使用）
export interface PersonalStats {
  key: string;
  name: string;
  division: number | null;
  team: string | null;
  totalCount: number;
  dominantTheme: ThemeId | null;
  themes: Record<ThemeId, ThemeStat>;
  causeDirectRanking: RankedItem[];
}

// 指定した乗務員(key)自身の事故記録だけを渡して集計する。事故記録が0件の場合も
// totalCount=0のPersonalStatsを返す（「対象者は選んだが事故記録なし」を表現するため）。
export function buildPersonalStats(key: string, name: string, division: number | null, team: string | null, personRecords: AccidentRecord[]): PersonalStats {
  const totalCount = personRecords.length;
  const themes = computeThemeStats(personRecords);
  return {
    key,
    name,
    division,
    team,
    totalCount,
    dominantTheme: dominantThemeOf(themes),
    themes,
    causeDirectRanking: toRanked(freqRanking(personRecords, r => r.cause_direct), totalCount),
  };
}
