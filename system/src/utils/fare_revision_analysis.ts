// 運賃改定影響分析 — 2026-04-20の東京都特別区・武三地区タクシー運賃改定（約10%値上げ）の前後で
// 乗務員一人ひとりの売上・労働時間がどう変化したかをルールベースで分析する。
// 「AI」を名乗る他の分析機能（sales_trend_analysis.ts 等）と同じ方針で、外部AI/LLM APIへの通信は一切行わない。
import { wageCategoryOfDuty, WAGE_CATEGORY_LABELS, type WageCategory } from './wage_estimate';

export const FARE_REVISION_DATE = '2026-04-20';

// ===== 日付ユーティリティ（UTC基準、DBの日付文字列'YYYY-MM-DD'のみを扱う） =====
function parseDateUTC(dateStr: string): Date {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new Error(`invalid date: ${dateStr}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}
function formatDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr: string, days: number): string {
  const d = parseDateUTC(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateUTC(d);
}
function diffDaysInclusive(startStr: string, endStr: string): number {
  return Math.round((parseDateUTC(endStr).getTime() - parseDateUTC(startStr).getTime()) / 86400000) + 1;
}
// 年だけ±deltaYearsする（2/29は非うるう年では2/28に丸め）
function shiftYears(dateStr: string, deltaYears: number): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)!;
  const y = Number(m[1]) + deltaYears, mo = Number(m[2]), da = Number(m[3]);
  const d = new Date(Date.UTC(y, mo - 1, da));
  if (d.getUTCMonth() !== mo - 1) d.setUTCDate(0); // 繰り上がった場合は前月末に丸める
  return formatDateUTC(d);
}
export function daysBetween(startStr: string, endStr: string): number {
  return Math.round((parseDateUTC(endStr).getTime() - parseDateUTC(startStr).getTime()) / 86400000);
}

// ===== 時刻('HH:MM')ユーティリティ（api/sales_ai.ts と同じロジック） =====
function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}
function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24, mn = Math.round(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
}
function avgTimeOfDay(times: Array<string | null | undefined>): string | null {
  const mins = times.map(timeToMinutes).filter((v): v is number => v !== null);
  if (!mins.length) return null;
  return minutesToTime(Math.round(mins.reduce((s, n) => s + n, 0) / mins.length));
}

// ===== 期間解決 =====
export type ComparisonMode = 'fare_revision' | 'yoy' | 'custom';
export interface ComparisonPeriodQuery {
  mode?: string;
  beforeStart?: string; beforeEnd?: string;
  afterStart?: string; afterEnd?: string;
}
export interface PeriodRange { start: string; end: string; label: string; days: number }
export interface ResolvedPeriods { mode: ComparisonMode; before: PeriodRange; after: PeriodRange }

function makeRange(start: string, end: string, label: string): PeriodRange {
  const safeEnd = end < start ? start : end;
  return { start, end: safeEnd, label, days: diffDaysInclusive(start, safeEnd) };
}

// mode省略時は'fare_revision'。
//  - fare_revision: after=[afterStart??改定日, afterEnd??今日]。beforeはafterと同じ日数を改定前日から遡って算出（公平な日数比較）。
//  - yoy: afterは上と同様に解決。beforeはafterの開始・終了日をそれぞれ年-1した前年同期。
//  - custom: 4つのパラメータが揃っていればそのまま使用。不足時はfare_revisionにフォールバック。
export function resolveComparisonPeriods(q: ComparisonPeriodQuery, todayStr: string): ResolvedPeriods {
  let mode: ComparisonMode = q.mode === 'yoy' ? 'yoy' : q.mode === 'custom' ? 'custom' : 'fare_revision';

  if (mode === 'custom') {
    if (q.beforeStart && q.beforeEnd && q.afterStart && q.afterEnd) {
      return {
        mode,
        before: makeRange(q.beforeStart, q.beforeEnd, '指定した前の期間'),
        after: makeRange(q.afterStart, q.afterEnd, '指定した後の期間'),
      };
    }
    mode = 'fare_revision';
  }

  const afterStart = q.afterStart ?? FARE_REVISION_DATE;
  const afterEndRaw = q.afterEnd ?? todayStr;
  const after = makeRange(afterStart, afterEndRaw, mode === 'yoy' ? '今年同期' : '運賃改定後');

  if (mode === 'yoy') {
    const before = makeRange(shiftYears(after.start, -1), shiftYears(after.end, -1), '前年同期');
    return { mode, before, after };
  }

  const beforeEnd = addDays(after.start, -1);
  const beforeStart = addDays(beforeEnd, -(after.days - 1));
  const before = makeRange(beforeStart, beforeEnd, '運賃改定前');
  return { mode, before, after };
}

// ===== 日次データ・労働時間フォールバック =====
export interface FareRevisionDailyRow {
  date: string; amount: number; dutyCode: string | null;
  laborHours: number | null; startTime: string | null; returnTime: string | null;
  rideCount?: number | null; distanceKm?: number | null;
}

export type LaborHoursSource = 'actual' | 'estimated' | 'none';

// labor_hours（ホシコンCSV由来の実労働時間＝拘束時間-休憩時間）があれば実績値、
// なければ start_time/return_time から拘束時間相当を概算（休憩込みのため実労働時間よりやや長め）。
export function estimateLaborHoursForRow(
  row: Pick<FareRevisionDailyRow, 'laborHours' | 'startTime' | 'returnTime'>
): { hours: number | null; source: LaborHoursSource } {
  if (row.laborHours !== null && row.laborHours !== undefined && row.laborHours > 0) {
    return { hours: row.laborHours, source: 'actual' };
  }
  const s = timeToMinutes(row.startTime);
  const e0 = timeToMinutes(row.returnTime);
  if (s === null || e0 === null) return { hours: null, source: 'none' };
  const e = e0 <= s ? e0 + 24 * 60 : e0; // 日跨ぎ（夜勤等）
  const durationMin = e - s;
  if (durationMin <= 0 || durationMin > 20 * 60) return { hours: null, source: 'none' }; // 異常値除外
  return { hours: Math.round((durationMin / 60) * 100) / 100, source: 'estimated' };
}

// ===== 期間集計 =====
export interface PeriodAggregate {
  range: PeriodRange;
  dutyDays: number;
  totalAmount: number;
  avgPerDuty: number | null;
  laborHoursTotal: number;
  laborHoursActualDays: number;
  laborHoursEstimatedDays: number;
  laborHoursMissingDays: number;
  hourlyRate: number | null; // totalAmount / laborHoursTotal
  avgReturnTime: string | null;
  avgReturnTimeCount: number;
  avgRidePerDuty: number | null;
  avgDistancePerDuty: number | null;
}

export function aggregatePeriod(rows: FareRevisionDailyRow[], range: PeriodRange): PeriodAggregate {
  const dutyDays = rows.length;
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const avgPerDuty = dutyDays > 0 ? Math.round(totalAmount / dutyDays) : null;

  let laborHoursTotal = 0, actualDays = 0, estimatedDays = 0, missingDays = 0;
  for (const r of rows) {
    const { hours, source } = estimateLaborHoursForRow(r);
    if (source === 'actual') { actualDays++; laborHoursTotal += hours!; }
    else if (source === 'estimated') { estimatedDays++; laborHoursTotal += hours!; }
    else missingDays++;
  }
  const hourlyRate = laborHoursTotal > 0 ? Math.round(totalAmount / laborHoursTotal) : null;

  const returnTimes = rows.map(r => r.returnTime).filter((t): t is string => !!t);
  const avgReturnTime = avgTimeOfDay(returnTimes);

  const rideRows = rows.filter(r => r.rideCount != null && r.rideCount! > 0);
  const avgRidePerDuty = rideRows.length
    ? Math.round((rideRows.reduce((s, r) => s + (r.rideCount ?? 0), 0) / rideRows.length) * 10) / 10 : null;
  const distRows = rows.filter(r => r.distanceKm != null && r.distanceKm! > 0);
  const avgDistancePerDuty = distRows.length
    ? Math.round((distRows.reduce((s, r) => s + (r.distanceKm ?? 0), 0) / distRows.length) * 10) / 10 : null;

  return {
    range, dutyDays, totalAmount, avgPerDuty,
    laborHoursTotal: Math.round(laborHoursTotal * 100) / 100,
    laborHoursActualDays: actualDays, laborHoursEstimatedDays: estimatedDays, laborHoursMissingDays: missingDays,
    hourlyRate, avgReturnTime, avgReturnTimeCount: returnTimes.length,
    avgRidePerDuty, avgDistancePerDuty,
  };
}

function laborHoursCoverageRatio(p: PeriodAggregate): number {
  return p.dutyDays > 0 ? (p.laborHoursActualDays + p.laborHoursEstimatedDays) / p.dutyDays : 0;
}

function growthPct(before: number | null, after: number | null): number | null {
  if (before === null || after === null || before <= 0) return null;
  return Math.round((after / before) * 1000) / 10;
}

// ===== 閾値（すべて可変、UIから調整可能） =====
export interface FareRevisionThresholds {
  achievementThresholdPct: number;    // 達成率の目標ライン（既定110）
  fareGrowthExpectationPct: number;   // 運賃改定による単価上昇の期待値（既定110＝10%増）
  fareGrowthToleranceBandPct: number; // 上記からの許容乖離幅（既定5）
  laborHoursDropThresholdPct: number; // これ未満なら「労働時間が明確に減少」とみなす（既定97）
  minDutyDaysPerPeriod: number;       // 判定に必要な最低乗務日数/期間（既定5）
  minLaborHoursCoverageRatio: number; // 労働時間データが必要な最低カバレッジ比率（既定0.5）
}
export const DEFAULT_FARE_REVISION_THRESHOLDS: FareRevisionThresholds = {
  achievementThresholdPct: 110,
  fareGrowthExpectationPct: 110,
  fareGrowthToleranceBandPct: 5,
  laborHoursDropThresholdPct: 97,
  minDutyDaysPerPeriod: 5,
  minLaborHoursCoverageRatio: 0.5,
};

// ===== 達成率区分 =====
export type AchievementCategory = 'above' | 'met' | 'below' | 'insufficient_data';

export function classifyAchievement(salesGrowthPct: number | null, thresholdPct: number): AchievementCategory {
  if (salesGrowthPct === null) return 'insufficient_data';
  if (salesGrowthPct >= thresholdPct) return 'above';
  if (salesGrowthPct >= 100) return 'met';
  return 'below';
}

// ===== 早期切り上げ疑い判定 =====
// 達成率が目標未満 かつ 時間単価の伸びは運賃改定分をほぼ反映している一方、労働時間が明確に減少している場合、
// 「従来通りの目標額に早く到達し、早めに切り上げて帰っている」可能性が高いとみなす。
export function detectEarlyLeaveSuspicion(
  achievementCategory: AchievementCategory,
  hourlyRateGrowthPct: number | null,
  laborHoursGrowthPct: number | null,
  before: PeriodAggregate, after: PeriodAggregate,
  dataSufficient: boolean, laborHoursDataSufficient: boolean,
  t: FareRevisionThresholds,
): { flag: boolean; confidence: 'high' | 'medium' | null } {
  if (!dataSufficient || !laborHoursDataSufficient) return { flag: false, confidence: null };
  if (achievementCategory !== 'met' && achievementCategory !== 'below') return { flag: false, confidence: null };
  if (hourlyRateGrowthPct === null || laborHoursGrowthPct === null) return { flag: false, confidence: null };

  const fareOk = hourlyRateGrowthPct >= t.fareGrowthExpectationPct - t.fareGrowthToleranceBandPct;
  const hoursDown = laborHoursGrowthPct < t.laborHoursDropThresholdPct;
  if (!(fareOk && hoursDown)) return { flag: false, confidence: null };

  const actualDays = before.laborHoursActualDays + after.laborHoursActualDays;
  const estimatedDays = before.laborHoursEstimatedDays + after.laborHoursEstimatedDays;
  return { flag: true, confidence: actualDays >= estimatedDays ? 'high' : 'medium' };
}

// ===== ルールベース文章生成（外部AI API不使用。if/thresholdとテンプレート文言のみ） =====
export interface ReasoningInput {
  achievementCategory: AchievementCategory; salesGrowthPct: number | null;
  hourlyRateGrowthPct: number | null; laborHoursGrowthPct: number | null;
  earlyLeaveSuspicion: boolean; earlyLeaveConfidence: 'high' | 'medium' | null;
  dataSufficient: boolean; laborHoursDataSufficient: boolean;
  before: PeriodAggregate; after: PeriodAggregate;
}
export function buildEmployeeReasoning(cmp: ReasoningInput, t: FareRevisionThresholds): string[] {
  const lines: string[] = [];
  const beforeLabel = cmp.before.range.label;
  const afterLabel = cmp.after.range.label;

  if (!cmp.dataSufficient) {
    lines.push(`比べる日数が少なく（${beforeLabel} ${cmp.before.dutyDays}日・${afterLabel} ${cmp.after.dutyDays}日、判定には各期間${t.minDutyDaysPerPeriod}日以上のデータが必要です）、今回は判断を保留しています。`);
    return lines;
  }
  if (cmp.salesGrowthPct !== null) {
    lines.push(`売上は${beforeLabel}の1日平均 ${cmp.before.avgPerDuty?.toLocaleString() ?? '-'}円 から、${afterLabel}は ${cmp.after.avgPerDuty?.toLocaleString() ?? '-'}円 になりました（${cmp.salesGrowthPct}%）。`);
  }
  if (cmp.achievementCategory === 'above') {
    lines.push(`目標の${t.achievementThresholdPct}%以上に伸びています。`);
  } else if (cmp.achievementCategory === 'met') {
    lines.push(`売上は伸びていますが、目標の${t.achievementThresholdPct}%までは届いていません。`);
  } else if (cmp.achievementCategory === 'below') {
    lines.push(`売上が${beforeLabel}より減っています。`);
  }
  if (!cmp.laborHoursDataSufficient) {
    lines.push(`働いた時間の記録が少ないため、単価や労働時間についての詳しい分析はできません。`);
  } else {
    if (cmp.hourlyRateGrowthPct !== null) lines.push(`1時間あたりの売上（単価）は ${cmp.hourlyRateGrowthPct}% になりました。`);
    if (cmp.laborHoursGrowthPct !== null) lines.push(`働いた時間の合計は ${cmp.laborHoursGrowthPct}% になりました。`);
    if (cmp.earlyLeaveSuspicion) {
      lines.push(`【早めに切り上げている可能性】1時間あたりの単価はほぼ運賃改定分だけ上がっている一方、働いた時間ははっきり短くなっています。いつもの目標額に早く届くため、早めに仕事を切り上げている可能性があります（確からしさ: ${cmp.earlyLeaveConfidence === 'high' ? '高い（実際の記録が中心）' : '中くらい（出退庫の時刻からの推定を含む）'}）。`);
    }
  }
  if (cmp.before.avgReturnTime && cmp.after.avgReturnTime) {
    const beforeMin = timeToMinutes(cmp.before.avgReturnTime)!;
    const afterMinRaw = timeToMinutes(cmp.after.avgReturnTime)!;
    const afterMin = afterMinRaw < beforeMin - 12 * 60 ? afterMinRaw + 24 * 60 : afterMinRaw; // 日跨ぎ帰庫の大きな逆転を補正
    const diff = afterMin - beforeMin;
    if (Math.abs(diff) >= 10) {
      lines.push(`帰る時間の平均は ${cmp.before.avgReturnTime} から ${cmp.after.avgReturnTime} に変わりました（${diff > 0 ? `約${diff}分遅く` : `約${Math.abs(diff)}分早く`}）。`);
    }
  }
  return lines;
}

// ===== 社員別比較 =====
export interface EmployeeComparison {
  empId: number; empName: string; division: number | null; team: number | null;
  repDutyCode: string | null; wageCategory: WageCategory | null; wageCategoryLabel: string | null;
  before: PeriodAggregate; after: PeriodAggregate;
  salesGrowthPct: number | null;
  avgPerDutyGrowthPct: number | null;
  hourlyRateGrowthPct: number | null;
  laborHoursGrowthPct: number | null;
  dutyDaysGrowthPct: number | null;
  achievementCategory: AchievementCategory;
  dataSufficient: boolean;
  laborHoursDataSufficient: boolean;
  earlyLeaveSuspicion: boolean;
  earlyLeaveConfidence: 'high' | 'medium' | null;
  reasoning: string[];
}

function representativeDutyCode(rows: FareRevisionDailyRow[]): string | null {
  const freq = new Map<string, number>();
  for (const r of rows) { if (r.dutyCode) freq.set(r.dutyCode, (freq.get(r.dutyCode) ?? 0) + 1); }
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function compareEmployeePeriods(
  emp: { id: number; name: string; division: number | null; team: number | null },
  beforeRows: FareRevisionDailyRow[], afterRows: FareRevisionDailyRow[],
  before: PeriodRange, after: PeriodRange, thresholds: FareRevisionThresholds,
): EmployeeComparison {
  const beforeAgg = aggregatePeriod(beforeRows, before);
  const afterAgg = aggregatePeriod(afterRows, after);

  const salesGrowthPct = growthPct(beforeAgg.totalAmount, afterAgg.totalAmount);
  const avgPerDutyGrowthPct = growthPct(beforeAgg.avgPerDuty, afterAgg.avgPerDuty);
  const hourlyRateGrowthPct = growthPct(beforeAgg.hourlyRate, afterAgg.hourlyRate);
  const laborHoursGrowthPct = growthPct(beforeAgg.laborHoursTotal, afterAgg.laborHoursTotal);
  const dutyDaysGrowthPct = growthPct(beforeAgg.dutyDays, afterAgg.dutyDays);

  const dataSufficient = beforeAgg.dutyDays >= thresholds.minDutyDaysPerPeriod && afterAgg.dutyDays >= thresholds.minDutyDaysPerPeriod;
  const laborHoursDataSufficient = dataSufficient
    && laborHoursCoverageRatio(beforeAgg) >= thresholds.minLaborHoursCoverageRatio
    && laborHoursCoverageRatio(afterAgg) >= thresholds.minLaborHoursCoverageRatio;

  const achievementCategory = dataSufficient ? classifyAchievement(salesGrowthPct, thresholds.achievementThresholdPct) : 'insufficient_data';

  const { flag, confidence } = detectEarlyLeaveSuspicion(
    achievementCategory, hourlyRateGrowthPct, laborHoursGrowthPct, beforeAgg, afterAgg, dataSufficient, laborHoursDataSufficient, thresholds
  );

  const repDutyCode = representativeDutyCode([...afterRows, ...beforeRows]);
  const wageCategory = repDutyCode ? wageCategoryOfDuty(repDutyCode) : null;

  const reasoning = buildEmployeeReasoning({
    achievementCategory, salesGrowthPct, hourlyRateGrowthPct, laborHoursGrowthPct,
    earlyLeaveSuspicion: flag, earlyLeaveConfidence: confidence,
    dataSufficient, laborHoursDataSufficient, before: beforeAgg, after: afterAgg,
  }, thresholds);

  return {
    empId: emp.id, empName: emp.name, division: emp.division, team: emp.team,
    repDutyCode, wageCategory, wageCategoryLabel: wageCategory ? WAGE_CATEGORY_LABELS[wageCategory] : null,
    before: beforeAgg, after: afterAgg,
    salesGrowthPct, avgPerDutyGrowthPct, hourlyRateGrowthPct, laborHoursGrowthPct, dutyDaysGrowthPct,
    achievementCategory, dataSufficient, laborHoursDataSufficient,
    earlyLeaveSuspicion: flag, earlyLeaveConfidence: confidence, reasoning,
  };
}

// ===== 全体集計 =====
export interface OverviewAggregate {
  histogram: Array<{ bucketLabel: string; count: number }>;
  divisionBreakdown: Array<{ division: number; avgSalesGrowthPct: number | null; empCount: number }>;
  teamBreakdown: Array<{ team: number; division: number; avgSalesGrowthPct: number | null; empCount: number }>;
  dutyCategoryBreakdown: Array<{ category: WageCategory; label: string; avgSalesGrowthPct: number | null; empCount: number }>;
  flagged: EmployeeComparison[];
  counts: { above: number; met: number; below: number; insufficientData: number };
  dataCoverage: { totalRecordDays: number; actualLaborHoursDays: number; estimatedLaborHoursDays: number; missingLaborHoursDays: number; coverageRatio: number };
}

const HISTOGRAM_LABELS = ['90%未満', '90〜100%', '100〜110%', '110〜120%', '120%以上', 'データ不足'] as const;
function bucketFor(pct: number): typeof HISTOGRAM_LABELS[number] {
  if (pct < 90) return '90%未満';
  if (pct < 100) return '90〜100%';
  if (pct < 110) return '100〜110%';
  if (pct < 120) return '110〜120%';
  return '120%以上';
}

// データ不足（各期間の乗務日数が最低ラインに満たない）社員は、少数レコードによる不安定な成長率で
// 課別・班別・勤務区分別の平均を歪めてしまうため、集計対象から除外する。
function avgGrowth(list: EmployeeComparison[]): number | null {
  const vals = list.filter(c => c.dataSufficient).map(c => c.salesGrowthPct).filter((v): v is number => v !== null);
  return vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : null;
}

export function buildOverviewAggregate(comparisons: EmployeeComparison[]): OverviewAggregate {
  const histMap = new Map<string, number>();
  for (const l of HISTOGRAM_LABELS) histMap.set(l, 0);
  for (const c of comparisons) {
    const label = c.salesGrowthPct === null ? 'データ不足' : bucketFor(c.salesGrowthPct);
    histMap.set(label, (histMap.get(label) ?? 0) + 1);
  }
  const histogram = HISTOGRAM_LABELS.map(label => ({ bucketLabel: label, count: histMap.get(label) ?? 0 }));

  const divMap = new Map<number, EmployeeComparison[]>();
  const teamMap = new Map<number, EmployeeComparison[]>();
  const dutyMap = new Map<WageCategory, EmployeeComparison[]>();
  for (const c of comparisons) {
    if (c.division != null) { if (!divMap.has(c.division)) divMap.set(c.division, []); divMap.get(c.division)!.push(c); }
    if (c.team != null) { if (!teamMap.has(c.team)) teamMap.set(c.team, []); teamMap.get(c.team)!.push(c); }
    if (c.wageCategory) { if (!dutyMap.has(c.wageCategory)) dutyMap.set(c.wageCategory, []); dutyMap.get(c.wageCategory)!.push(c); }
  }
  const divisionBreakdown = [...divMap.entries()].sort((a, b) => a[0] - b[0])
    .map(([division, list]) => ({ division, avgSalesGrowthPct: avgGrowth(list), empCount: list.length }));
  const teamBreakdown = [...teamMap.entries()].sort((a, b) => a[0] - b[0])
    .map(([team, list]) => ({ team, division: Math.ceil(team / 2), avgSalesGrowthPct: avgGrowth(list), empCount: list.length }));
  const dutyCategoryBreakdown = (['hiru', 'yoru', 'kakujitsu'] as WageCategory[])
    .filter(k => dutyMap.has(k))
    .map(k => ({ category: k, label: WAGE_CATEGORY_LABELS[k], avgSalesGrowthPct: avgGrowth(dutyMap.get(k)!), empCount: dutyMap.get(k)!.length }));

  const flagged = comparisons.filter(c => c.earlyLeaveSuspicion).sort((a, b) => {
    const rank = (c: EmployeeComparison) => c.earlyLeaveConfidence === 'high' ? 0 : 1;
    const rc = rank(a) - rank(b);
    if (rc !== 0) return rc;
    return (a.salesGrowthPct ?? 0) - (b.salesGrowthPct ?? 0);
  });

  const counts = {
    above: comparisons.filter(c => c.achievementCategory === 'above').length,
    met: comparisons.filter(c => c.achievementCategory === 'met').length,
    below: comparisons.filter(c => c.achievementCategory === 'below').length,
    insufficientData: comparisons.filter(c => c.achievementCategory === 'insufficient_data').length,
  };

  let totalRecordDays = 0, actualLaborHoursDays = 0, estimatedLaborHoursDays = 0, missingLaborHoursDays = 0;
  for (const c of comparisons) {
    for (const p of [c.before, c.after]) {
      totalRecordDays += p.dutyDays;
      actualLaborHoursDays += p.laborHoursActualDays;
      estimatedLaborHoursDays += p.laborHoursEstimatedDays;
      missingLaborHoursDays += p.laborHoursMissingDays;
    }
  }
  const coverageRatio = totalRecordDays > 0
    ? Math.round(((actualLaborHoursDays + estimatedLaborHoursDays) / totalRecordDays) * 1000) / 10 : 0;

  return {
    histogram, divisionBreakdown, teamBreakdown, dutyCategoryBreakdown, flagged, counts,
    dataCoverage: { totalRecordDays, actualLaborHoursDays, estimatedLaborHoursDays, missingLaborHoursDays, coverageRatio },
  };
}
