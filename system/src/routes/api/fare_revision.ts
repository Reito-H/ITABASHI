// 運賃改定影響分析 API（2026-04-20の運賃改定前後の売上・労働時間比較。ルールベースのみ、外部AI API不使用）
// DB照会＋集計ロジックはcompute*()としてexportし、admin_fare_revision.tsの印刷ページからも再利用する。
import { Hono } from 'hono';
import type { Env } from '../../auth';
import {
  resolveComparisonPeriods, resolveYoyMonthPeriods, compareEmployeePeriods, buildOverviewAggregate, estimateLaborHoursForRow, daysBetween, addDays,
  representativeDutyCode, adjustRowsForKakujitsuMajority,
  DEFAULT_FARE_REVISION_THRESHOLDS,
  type FareRevisionThresholds, type FareRevisionDailyRow, type ComparisonPeriodQuery, type EmployeeComparison,
  type ResolvedPeriods, type OverviewAggregate,
} from '../../utils/fare_revision_analysis';
import { wageCategoryOfDuty, type WageCategory } from '../../utils/wage_estimate';

const app = new Hono<{ Bindings: Env }>();

function parseNum(v: string | undefined, def: number, min: number, max: number): number {
  const n = v !== undefined ? Number(v) : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

export function parseThresholds(q: Record<string, string | undefined>): FareRevisionThresholds {
  const d = DEFAULT_FARE_REVISION_THRESHOLDS;
  return {
    achievementThresholdPct: parseNum(q.achievementThresholdPct, d.achievementThresholdPct, 100, 300),
    salesFlatBandPct: parseNum(q.salesFlatBandPct, d.salesFlatBandPct, 0, 50),
    laborHoursDropThresholdPct: parseNum(q.laborHoursDropThresholdPct, d.laborHoursDropThresholdPct, 50, 100),
    minDutyDaysPerPeriod: parseNum(q.minDutyDaysPerPeriod, d.minDutyDaysPerPeriod, 1, 60),
    minLaborHoursCoverageRatio: parseNum(q.minLaborHoursCoverageRatio, d.minLaborHoursCoverageRatio, 0, 1),
  };
}

function parsePeriodQuery(q: Record<string, string | undefined>): ComparisonPeriodQuery {
  return { afterStart: q.afterStart, afterEnd: q.afterEnd };
}

// compareMode='yoyMonth'（前年同月比較）が有効な指定なら優先し、それ以外は既定の運賃改定前後比較を使う。
function resolvePeriods(q: Record<string, string | undefined>, todayStr: string): ResolvedPeriods {
  if (q.compareMode === 'yoyMonth') {
    const month = Number(q.yoyMonth);
    const year = Number(q.yoyYear);
    if (Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year) && year >= 2000 && year <= 2100) {
      return resolveYoyMonthPeriods({ year, month }, todayStr);
    }
  }
  return resolveComparisonPeriods(parsePeriodQuery(q), todayStr);
}

const VALID_DUTY_CODES = new Set(['a', 'b', 'B', 'D', 'H']);
const VALID_WAGE_CATEGORIES = new Set<WageCategory>(['hiru', 'yoru', 'kakujitsu']);

export function parseFilters(q: Record<string, string | undefined>): { division: number | null; team: number | null; dutyCode: string | null } {
  const division = q.division ? Number(q.division) : NaN;
  const team = q.team ? Number(q.team) : NaN;
  return {
    division: Number.isInteger(division) && division >= 1 && division <= 4 ? division : null,
    team: Number.isInteger(team) && team >= 1 && team <= 8 ? team : null,
    dutyCode: q.dutyCode && VALID_DUTY_CODES.has(q.dutyCode) ? q.dutyCode : null,
  };
}

type SalesRow = {
  emp_id: number; date: string; amount: number; duty_code: string | null;
  labor_hours: number | null; start_time: string | null; return_time: string | null;
  ride_count: number | null; distance_km: number | null;
};

// 社員ごとの「一番古い乗務記録の日付」（全期間・絞り込みなし）。
// 前の期間の開始日より後にしか記録がない社員（＝比較する前の期間の途中で入社した新人など）を
// 除外するために使う。前の期間の一部にしか在籍していないと、単に在籍日数が少ないだけで
// 売上の伸び率が数百〜千数百%に跳ね上がってしまい、運賃改定の影響とは無関係な誤解を生むため。
export async function fetchFirstSalesDateByEmp(db: D1Database): Promise<Map<number, string>> {
  const rows = (await db.prepare('SELECT emp_id, MIN(date) as first_date FROM sales_records GROUP BY emp_id')
    .all<{ emp_id: number; first_date: string }>()).results ?? [];
  return new Map(rows.map(r => [r.emp_id, r.first_date]));
}

// 「前の期間の開始日より後に入社した社員を除外する」の基準日を決める。
// sales_records の取り込み自体がある時点（データ全体の最古日）より前には遡れないため、
// 単純に periodStart と比べると「データ取り込み開始時点で在籍していた古参社員」まで
// 新人扱いで除外されてしまう。そこで「データ全体の最古日＋30日（取り込み初期のばらつき許容）」と
// periodStart のうち、より遅い方を基準日として使う。
export function computeTenureCutoff(firstDateByEmp: Map<number, string>, periodStart: string, bufferDays = 30): string {
  let dataFloor: string | null = null;
  for (const d of firstDateByEmp.values()) {
    if (dataFloor === null || d < dataFloor) dataFloor = d;
  }
  if (dataFloor === null) return periodStart;
  const dataFloorCutoff = addDays(dataFloor, bufferDays);
  return dataFloorCutoff > periodStart ? dataFloorCutoff : periodStart;
}

function toDailyRow(r: SalesRow): FareRevisionDailyRow {
  return {
    date: r.date, amount: r.amount, dutyCode: r.duty_code,
    laborHours: r.labor_hours, startTime: r.start_time, returnTime: r.return_time,
    rideCount: r.ride_count, distanceKm: r.distance_km,
  };
}

// 社員1人分の全期間の行から主たる勤務区分（最多区分）を求め、隔日勤務が主な社員については
// 日勤で乗務した日の売上を2倍補正する（adjustRowsForKakujitsuMajority参照）。
function resolveEmployeeCategoryRows(allRows: FareRevisionDailyRow[]): { repCategory: WageCategory; rows: FareRevisionDailyRow[] } {
  const repDutyCode = representativeDutyCode(allRows);
  const repCategory: WageCategory = repDutyCode ? wageCategoryOfDuty(repDutyCode) : 'kakujitsu';
  return { repCategory, rows: adjustRowsForKakujitsuMajority(allRows, repCategory) };
}

// 社員×勤務区分ごとにグループ分けする（従来の単純な区分別グルーピング）。
// 主たる勤務区分が隔日勤務の社員は resolveEmployeeCategoryRows で1グループに統合済みなので、
// ここでは非隔日主体の社員（途中で本当に勤務区分が変わった等）だけが複数グループに分かれる。
function groupRowsByEmpCategory(salesRows: SalesRow[], empById: Map<number, unknown>): Map<string, FareRevisionDailyRow[]> {
  const rowsByEmp = new Map<number, FareRevisionDailyRow[]>();
  for (const r of salesRows) {
    if (!empById.has(r.emp_id)) continue;
    if (!rowsByEmp.has(r.emp_id)) rowsByEmp.set(r.emp_id, []);
    rowsByEmp.get(r.emp_id)!.push(toDailyRow(r));
  }
  const result = new Map<string, FareRevisionDailyRow[]>();
  for (const [empId, allRows] of rowsByEmp) {
    const { repCategory, rows } = resolveEmployeeCategoryRows(allRows);
    if (repCategory === 'kakujitsu') {
      result.set(`${empId}:kakujitsu`, rows);
      continue;
    }
    const byCat = new Map<WageCategory, FareRevisionDailyRow[]>();
    for (const r of rows) {
      const cat = wageCategoryOfDuty(r.dutyCode);
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat)!.push(r);
    }
    for (const [cat, catRows] of byCat) result.set(`${empId}:${cat}`, catRows);
  }
  return result;
}

export type FareRevisionOverviewResult = OverviewAggregate & {
  periods: ResolvedPeriods; thresholds: FareRevisionThresholds;
  filters: { division: number | null; team: number | null; dutyCode: string | null };
  employees: EmployeeComparison[];
  excludeBelowGrowthPct: number | null;
  excludedCount: number;
};

// 病気・休職等で売上が著しく落ち込んだ人を「早めに切り上げている」等の傾向とは別の異常値として
// 集計対象から除外するための任意フィルタ。指定時のみ、1日あたり売上の伸び率がこれ未満の人
// （データ十分な人のみ判定対象。データ不足の人は元々別区分のためそのまま残す）を除外する。
function parseExcludeBelowGrowthPct(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 200) : null;
}

// 全社員: 運賃改定前後（or 前年同期/カスタム）の比較一覧＋全体集計
export async function computeFareRevisionOverview(db: D1Database, q: Record<string, string | undefined>): Promise<FareRevisionOverviewResult> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const periods = resolvePeriods(q, todayStr);
  const thresholds = parseThresholds(q);
  const filters = parseFilters(q);

  const queryStart = periods.before.start < periods.after.start ? periods.before.start : periods.after.start;
  const queryEnd = periods.before.end > periods.after.end ? periods.before.end : periods.after.end;

  let empSql = 'SELECT id, name, emp_no, division, team FROM employees WHERE is_active = 1';
  const empParams: unknown[] = [];
  if (filters.division !== null) { empSql += ' AND division = ?'; empParams.push(filters.division); }
  if (filters.team !== null) { empSql += ' AND team = ?'; empParams.push(filters.team); }

  let salesSql = 'SELECT emp_id, date, amount, duty_code, labor_hours, start_time, return_time, ride_count, distance_km FROM sales_records WHERE date >= ? AND date <= ?';
  const salesParams: unknown[] = [queryStart, queryEnd];
  if (filters.dutyCode !== null) { salesSql += ' AND duty_code = ?'; salesParams.push(filters.dutyCode); }

  const [empRows, salesRows, firstDateByEmp] = await Promise.all([
    db.prepare(empSql).bind(...empParams).all<{ id: number; name: string; emp_no: string; division: number | null; team: number | null }>(),
    db.prepare(salesSql).bind(...salesParams).all<SalesRow>(),
    fetchFirstSalesDateByEmp(db),
  ]);

  const empById = new Map<number, { id: number; name: string; division: number | null; team: number | null }>();
  for (const e of empRows.results ?? []) empById.set(e.id, e);

  // 昼日勤務・夜日勤務・隔日勤務のように途中で勤務区分が変わった社員は、1人分としてまとめて
  // 平均を出すと（区分ごとに1乗務あたりの金額の水準が大きく異なるため）伸び率が実態と無関係にブレる。
  // そのため社員IDだけでなく勤務区分（wageCategory）ごとにグループ分けして、区分ごとに別々の比較として扱う
  // （ただし隔日勤務が主な社員がたまたま日勤で乗務した日は、groupRowsByEmpCategory内で2倍補正のうえ
  // 隔日勤務のグループに統合する）。
  const rowsByEmpCategory = groupRowsByEmpCategory(salesRows.results ?? [], empById);

  const tenureCutoff = computeTenureCutoff(firstDateByEmp, periods.before.start);
  const comparisons: EmployeeComparison[] = [];
  for (const [key, rows] of rowsByEmpCategory) {
    const empId = Number(key.slice(0, key.lastIndexOf(':')));
    const emp = empById.get(empId)!;
    const beforeRows = rows.filter(r => r.date >= periods.before.start && r.date <= periods.before.end);
    const afterRows = rows.filter(r => r.date >= periods.after.start && r.date <= periods.after.end);
    if (!beforeRows.length) continue; // 運賃改定前の乗務記録がない社員（新人など）は比較対象外
    const firstDate = firstDateByEmp.get(empId);
    if (firstDate && firstDate > tenureCutoff) continue; // 前の期間の途中で入社した社員は公平な比較ができないため除外
    comparisons.push(compareEmployeePeriods(emp, beforeRows, afterRows, periods.before, periods.after, thresholds, { skipReasoning: true }));
  }

  // 同じ社員が複数の勤務区分にまたがっている場合のみ、氏名に区分名を付けて区別できるようにする
  // （区分が1つしかない大多数の社員には付けず、表示をシンプルに保つ）
  const empIdOccurrences = new Map<number, number>();
  for (const c of comparisons) empIdOccurrences.set(c.empId, (empIdOccurrences.get(c.empId) ?? 0) + 1);
  for (const c of comparisons) {
    if ((empIdOccurrences.get(c.empId) ?? 0) > 1 && c.wageCategoryLabel) {
      c.empName = `${c.empName}（${c.wageCategoryLabel}）`;
    }
  }

  comparisons.sort((a, b) => (a.salesGrowthPct ?? -Infinity) - (b.salesGrowthPct ?? -Infinity));

  const excludeBelowGrowthPct = parseExcludeBelowGrowthPct(q.excludeBelowGrowthPct);
  const filteredComparisons = excludeBelowGrowthPct === null
    ? comparisons
    : comparisons.filter(c => !(c.dataSufficient && c.salesGrowthPct !== null && c.salesGrowthPct < excludeBelowGrowthPct));
  const excludedCount = comparisons.length - filteredComparisons.length;

  const overview = buildOverviewAggregate(filteredComparisons);

  return { periods, thresholds, filters, employees: filteredComparisons, excludeBelowGrowthPct, excludedCount, ...overview };
}

export type FareRevisionEmployeeResult = {
  emp: { id: number; name: string; empNo: string; division: number | null; team: number | null };
  periods: ResolvedPeriods; thresholds: FareRevisionThresholds; comparison: EmployeeComparison;
  dailyBefore: Array<FareRevisionDailyRow & { dayOffset: number; laborHoursResolved: number | null; laborHoursSource: string }>;
  dailyAfter: Array<FareRevisionDailyRow & { dayOffset: number; laborHoursResolved: number | null; laborHoursSource: string }>;
};

// 社員別: 運賃改定前後（or 前年同期/カスタム）の日次系列＋比較結果＋判定根拠
export async function computeFareRevisionEmployee(db: D1Database, empId: number, q: Record<string, string | undefined>): Promise<FareRevisionEmployeeResult | null> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const periods = resolvePeriods(q, todayStr);
  const thresholds = parseThresholds(q);

  const emp = await db.prepare('SELECT id, name, emp_no, division, team FROM employees WHERE id = ?')
    .bind(empId).first<{ id: number; name: string; emp_no: string; division: number | null; team: number | null }>();
  if (!emp) return null;

  const queryStart = periods.before.start < periods.after.start ? periods.before.start : periods.after.start;
  const queryEnd = periods.before.end > periods.after.end ? periods.before.end : periods.after.end;

  const salesRows = (await db.prepare(
    'SELECT emp_id, date, amount, duty_code, labor_hours, start_time, return_time, ride_count, distance_km FROM sales_records WHERE emp_id = ? AND date >= ? AND date <= ? ORDER BY date'
  ).bind(empId, queryStart, queryEnd).all<SalesRow>()).results ?? [];

  const allRows = salesRows.map(toDailyRow);
  const { repCategory, rows: adjustedRows } = resolveEmployeeCategoryRows(allRows);

  // 一覧で勤務区分ごとに分けて表示している社員を選んだ場合、その区分の記録だけに絞り込む
  // （指定がなければ従来通り全区分をまとめて表示）。ただし主たる勤務区分が隔日勤務の社員は
  // 日勤で乗務した日も2倍補正のうえ隔日勤務の実績に統合済みのため、区分での絞り込みは行わない。
  const wageCategoryFilter = VALID_WAGE_CATEGORIES.has(q.wageCategory as WageCategory) ? (q.wageCategory as WageCategory) : null;
  const rows = repCategory === 'kakujitsu'
    ? adjustedRows
    : (wageCategoryFilter ? adjustedRows.filter(r => wageCategoryOfDuty(r.dutyCode) === wageCategoryFilter) : adjustedRows);

  const beforeRows = rows.filter(r => r.date >= periods.before.start && r.date <= periods.before.end);
  const afterRows = rows.filter(r => r.date >= periods.after.start && r.date <= periods.after.end);

  const comparison = compareEmployeePeriods(emp, beforeRows, afterRows, periods.before, periods.after, thresholds);

  function annotate(r: FareRevisionDailyRow, rangeStart: string) {
    const { hours, source } = estimateLaborHoursForRow(r);
    return { ...r, dayOffset: daysBetween(rangeStart, r.date), laborHoursResolved: hours, laborHoursSource: source };
  }
  const dailyBefore = beforeRows.map(r => annotate(r, periods.before.start));
  const dailyAfter = afterRows.map(r => annotate(r, periods.after.start));

  const empName = wageCategoryFilter && comparison.wageCategoryLabel
    ? `${emp.name}（${comparison.wageCategoryLabel}）`
    : emp.name;

  return {
    emp: { id: emp.id, name: empName, empNo: emp.emp_no, division: emp.division, team: emp.team },
    periods, thresholds, comparison, dailyBefore, dailyAfter,
  };
}

// ===================================================
// 全社員: 運賃改定前後（or 前年同期/カスタム）の比較一覧＋全体集計
// ===================================================
app.get('/overview', async (c) => {
  const result = await computeFareRevisionOverview(c.env.DB, c.req.query());
  return c.json(result);
});

// ===================================================
// 社員別: 運賃改定前後（or 前年同期/カスタム）の日次系列＋比較結果＋判定根拠
// ===================================================
app.get('/employee/:empId', async (c) => {
  const empId = parseInt(c.req.param('empId'));
  if (isNaN(empId)) return c.json({ error: '不正な社員IDです' }, 400);

  const result = await computeFareRevisionEmployee(c.env.DB, empId, c.req.query());
  if (!result) return c.json({ error: '社員が見つかりません' }, 404);
  return c.json(result);
});

export default app;
