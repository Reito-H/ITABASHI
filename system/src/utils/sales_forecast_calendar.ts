// AI売上分析 — 年間売上予想カレンダー（全社合計・ルールベース）
// 「AI」は表示名のみで外部AI/LLM APIへの通信は一切行わない。過去の実績（曜日別・暦要因別の平均日商）から
// 単純な加算モデルで日別の予想平均日商を組み立てる。天気は将来日には分からないため予想には使用しない。
import { getDayFactors, type DayFactors } from './taxi_calendar';

export type DailyAggregate = { date: string; avgAmount: number; count: number };

// 予想モデルに使う暦要因（未来の日付でも判定できるもののみ。曜日は別枠でベースラインとして扱うため除外。
// 天気・五十日は対象外）
type ForecastFactorKey =
  | 'isHoliday' | 'isBeforeLongWeekend' | 'isAfterLongWeekend' | 'isLongHoliday'
  | 'isYearEndNewYearParty' | 'isFarewellSeason' | 'isMonthEnd' | 'isMonthStart' | 'isBonusMonth';

const FORECAST_FACTORS: Array<{ key: ForecastFactorKey; label: string }> = [
  { key: 'isHoliday', label: '祝日' },
  { key: 'isBeforeLongWeekend', label: '連休前日（2連休以上の前日）' },
  { key: 'isAfterLongWeekend', label: '連休明け（2連休以上の翌日）' },
  { key: 'isLongHoliday', label: '大型連休（GW・お盆・年末年始）' },
  { key: 'isYearEndNewYearParty', label: '忘新年会シーズン' },
  { key: 'isFarewellSeason', label: '送別会シーズン' },
  { key: 'isMonthEnd', label: '月末' },
  { key: 'isMonthStart', label: '月初' },
  { key: 'isBonusMonth', label: 'ボーナス月' },
];

const MIN_SAMPLE_FOR_FACTOR = 8;   // この件数未満の要因は予想モデルから除外（信頼性が低いため）
const MAX_ADJUSTMENT = 0.5;        // 加算調整の上限（+50%）
const MIN_ADJUSTMENT = -0.4;       // 加算調整の下限（-40%）

export type FactorEffect = { key: string; label: string; diffPct: number; countTrue: number };

export type ForecastDay = {
  date: string;
  weekday: number;
  weekdayLabel: string;
  predicted: number;
  baseWeekdayAvg: number;
  colorScore: number; // -1(低い) 〜 +1(高い)。全体平均との乖離をクランプして正規化した値
  holidayName: string | null;
  longHolidayName: string | null;
  isBeforeLongWeekend: boolean;
  isAfterLongWeekend: boolean;
  appliedFactors: Array<{ label: string; diffPct: number }>;
  actual: number | null;       // 実績の平均日商（実績データがある日のみ）
  diffAmount: number | null;   // 実績 - 予想（円）
  diffPct: number | null;      // 実績 - 予想（%）
};

export type ForecastCalendarResult = {
  sufficientData: boolean;
  sampleDayCount: number;
  overallMean: number | null;
  weekdayAvg: Array<{ weekday: number; label: string; avg: number | null; count: number }>;
  factorEffects: FactorEffect[];
  days: ForecastDay[];
};

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

function daysInYear(year: number): string[] {
  const dates: string[] = [];
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return dates;
}

// 過去の日別集計（companywide・1日1行）から、曜日別平均・暦要因別の効果(diffPct)を学習し、
// 指定年の365/366日分の予想日商を組み立てる
export function buildForecastCalendar(historical: DailyAggregate[], targetYear: number): ForecastCalendarResult {
  const enriched = historical.map(h => ({ ...h, f: getDayFactors(h.date) }));
  const sampleDayCount = enriched.length;

  if (sampleDayCount < 30) {
    return { sufficientData: false, sampleDayCount, overallMean: null, weekdayAvg: [], factorEffects: [], days: [] };
  }

  // 曜日別（件数=cnt で重み付け）
  const wdSum = new Array(7).fill(0);
  const wdWeight = new Array(7).fill(0);
  let overallSum = 0, overallWeight = 0;
  for (const r of enriched) {
    wdSum[r.f.weekday] += r.avgAmount * r.count;
    wdWeight[r.f.weekday] += r.count;
    overallSum += r.avgAmount * r.count;
    overallWeight += r.count;
  }
  const overallMean = overallWeight > 0 ? overallSum / overallWeight : null;
  const weekdayAvg = WEEKDAY_LABELS.map((label, wd) => ({
    weekday: wd, label,
    avg: wdWeight[wd] > 0 ? Math.round(wdSum[wd] / wdWeight[wd]) : null,
    count: wdWeight[wd],
  }));

  // 暦要因別（true/false を件数重み付けした加重平均の差分%）
  const factorEffects: FactorEffect[] = [];
  for (const { key, label } of FORECAST_FACTORS) {
    let trueSum = 0, trueW = 0, falseSum = 0, falseW = 0;
    for (const r of enriched) {
      const flag = r.f[key as keyof DayFactors] as boolean;
      if (flag) { trueSum += r.avgAmount * r.count; trueW += r.count; }
      else { falseSum += r.avgAmount * r.count; falseW += r.count; }
    }
    if (trueW < MIN_SAMPLE_FOR_FACTOR || falseW === 0) continue;
    const trueAvg = trueSum / trueW;
    const falseAvg = falseSum / falseW;
    if (falseAvg <= 0) continue;
    const diffPct = Math.round(((trueAvg - falseAvg) / falseAvg) * 1000) / 10;
    factorEffects.push({ key, label, diffPct, countTrue: trueW });
  }
  const factorEffectByKey = new Map(factorEffects.map(f => [f.key, f]));

  // 実績（日別平均日商）。同じ集計データを予想日の実績表示にも流用する
  const actualByDate = new Map(historical.map(h => [h.date, h.avgAmount]));

  // 予想日の組み立て
  const days: ForecastDay[] = daysInYear(targetYear).map(date => {
    const f = getDayFactors(date);
    const wdInfo = weekdayAvg[f.weekday];
    const base = wdInfo.avg ?? overallMean ?? 0;

    const appliedFactors: Array<{ label: string; diffPct: number }> = [];
    let adjustmentSum = 0;
    for (const { key, label } of FORECAST_FACTORS) {
      if (!(f[key as keyof DayFactors] as boolean)) continue;
      const effect = factorEffectByKey.get(key);
      if (!effect) continue;
      appliedFactors.push({ label, diffPct: effect.diffPct });
      adjustmentSum += effect.diffPct / 100;
    }
    const cappedAdjustment = Math.max(MIN_ADJUSTMENT, Math.min(MAX_ADJUSTMENT, adjustmentSum));
    const predicted = Math.round(base * (1 + cappedAdjustment));

    const rawScore = overallMean && overallMean > 0 ? (predicted - overallMean) / overallMean : 0;
    const colorScore = Math.max(-1, Math.min(1, rawScore / 0.3)); // ±30%を色の振り切り幅とする

    const rawActual = actualByDate.get(date);
    const actual = rawActual !== undefined ? Math.round(rawActual) : null;
    const diffAmount = actual !== null ? actual - predicted : null;
    const diffPct = actual !== null && predicted > 0 ? Math.round(((actual - predicted) / predicted) * 1000) / 10 : null;

    return {
      date, weekday: f.weekday, weekdayLabel: f.weekdayLabel,
      predicted, baseWeekdayAvg: Math.round(base), colorScore,
      holidayName: f.holidayName, longHolidayName: f.longHolidayName,
      isBeforeLongWeekend: f.isBeforeLongWeekend, isAfterLongWeekend: f.isAfterLongWeekend,
      appliedFactors, actual, diffAmount, diffPct,
    };
  });

  return {
    sufficientData: true, sampleDayCount,
    overallMean: overallMean !== null ? Math.round(overallMean) : null,
    weekdayAvg, factorEffects, days,
  };
}
