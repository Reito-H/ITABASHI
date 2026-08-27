// 運賃改定影響分析 API（2026-04-20の運賃改定前後の売上・労働時間比較。ルールベースのみ、外部AI API不使用）
// DB照会＋集計ロジックはcompute*()としてexportし、admin_fare_revision.tsの印刷ページからも再利用する。
import { Hono } from 'hono';
import type { Env } from '../../auth';
import {
  resolveComparisonPeriods, compareEmployeePeriods, buildOverviewAggregate, estimateLaborHoursForRow, daysBetween, addDays,
  DEFAULT_FARE_REVISION_THRESHOLDS,
  type FareRevisionThresholds, type FareRevisionDailyRow, type ComparisonPeriodQuery, type EmployeeComparison,
  type ResolvedPeriods, type OverviewAggregate,
} from '../../utils/fare_revision_analysis';

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

const VALID_DUTY_CODES = new Set(['a', 'b', 'B', 'D', 'H']);

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

export type FareRevisionOverviewResult = OverviewAggregate & {
  periods: ResolvedPeriods; thresholds: FareRevisionThresholds;
  filters: { division: number | null; team: number | null; dutyCode: string | null };
  employees: EmployeeComparison[];
};

// 全社員: 運賃改定前後（or 前年同期/カスタム）の比較一覧＋全体集計
export async function computeFareRevisionOverview(db: D1Database, q: Record<string, string | undefined>): Promise<FareRevisionOverviewResult> {
  const todayStr = new Date().toISOString().slice(0, 10);
  const periods = resolveComparisonPeriods(parsePeriodQuery(q), todayStr);
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

  const rowsByEmp = new Map<number, FareRevisionDailyRow[]>();
  for (const r of salesRows.results ?? []) {
    if (!empById.has(r.emp_id)) continue; // 課・班フィルタで対象外になった社員は除外
    if (!rowsByEmp.has(r.emp_id)) rowsByEmp.set(r.emp_id, []);
    rowsByEmp.get(r.emp_id)!.push(toDailyRow(r));
  }

  const tenureCutoff = computeTenureCutoff(firstDateByEmp, periods.before.start);
  const comparisons: EmployeeComparison[] = [];
  for (const [empId, rows] of rowsByEmp) {
    const emp = empById.get(empId)!;
    const beforeRows = rows.filter(r => r.date >= periods.before.start && r.date <= periods.before.end);
    const afterRows = rows.filter(r => r.date >= periods.after.start && r.date <= periods.after.end);
    if (!beforeRows.length) continue; // 運賃改定前の乗務記録がない社員（新人など）は比較対象外
    const firstDate = firstDateByEmp.get(empId);
    if (firstDate && firstDate > tenureCutoff) continue; // 前の期間の途中で入社した社員は公平な比較ができないため除外
    comparisons.push(compareEmployeePeriods(emp, beforeRows, afterRows, periods.before, periods.after, thresholds));
  }
  comparisons.sort((a, b) => (a.salesGrowthPct ?? -Infinity) - (b.salesGrowthPct ?? -Infinity));

  const overview = buildOverviewAggregate(comparisons);

  return { periods, thresholds, filters, employees: comparisons, ...overview };
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
  const periods = resolveComparisonPeriods(parsePeriodQuery(q), todayStr);
  const thresholds = parseThresholds(q);

  const emp = await db.prepare('SELECT id, name, emp_no, division, team FROM employees WHERE id = ?')
    .bind(empId).first<{ id: number; name: string; emp_no: string; division: number | null; team: number | null }>();
  if (!emp) return null;

  const queryStart = periods.before.start < periods.after.start ? periods.before.start : periods.after.start;
  const queryEnd = periods.before.end > periods.after.end ? periods.before.end : periods.after.end;

  const salesRows = (await db.prepare(
    'SELECT emp_id, date, amount, duty_code, labor_hours, start_time, return_time, ride_count, distance_km FROM sales_records WHERE emp_id = ? AND date >= ? AND date <= ? ORDER BY date'
  ).bind(empId, queryStart, queryEnd).all<SalesRow>()).results ?? [];

  const rows = salesRows.map(toDailyRow);
  const beforeRows = rows.filter(r => r.date >= periods.before.start && r.date <= periods.before.end);
  const afterRows = rows.filter(r => r.date >= periods.after.start && r.date <= periods.after.end);

  const comparison = compareEmployeePeriods(emp, beforeRows, afterRows, periods.before, periods.after, thresholds);

  function annotate(r: FareRevisionDailyRow, rangeStart: string) {
    const { hours, source } = estimateLaborHoursForRow(r);
    return { ...r, dayOffset: daysBetween(rangeStart, r.date), laborHoursResolved: hours, laborHoursSource: source };
  }
  const dailyBefore = beforeRows.map(r => annotate(r, periods.before.start));
  const dailyAfter = afterRows.map(r => annotate(r, periods.after.start));

  return {
    emp: { id: emp.id, name: emp.name, empNo: emp.emp_no, division: emp.division, team: emp.team },
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
