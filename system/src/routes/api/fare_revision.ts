// 運賃改定影響分析 API（2026-04-20の運賃改定前後の売上・労働時間比較。ルールベースのみ、外部AI API不使用）
// DB照会＋集計ロジックはcompute*()としてexportし、admin_fare_revision.tsの印刷ページからも再利用する。
import { Hono } from 'hono';
import type { Env } from '../../auth';
import {
  resolveComparisonPeriods, compareEmployeePeriods, buildOverviewAggregate, estimateLaborHoursForRow, daysBetween,
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
    fareGrowthExpectationPct: parseNum(q.fareGrowthExpectationPct, d.fareGrowthExpectationPct, 100, 300),
    fareGrowthToleranceBandPct: parseNum(q.fareGrowthToleranceBandPct, d.fareGrowthToleranceBandPct, 0, 50),
    laborHoursDropThresholdPct: parseNum(q.laborHoursDropThresholdPct, d.laborHoursDropThresholdPct, 50, 100),
    minDutyDaysPerPeriod: parseNum(q.minDutyDaysPerPeriod, d.minDutyDaysPerPeriod, 1, 60),
    minLaborHoursCoverageRatio: parseNum(q.minLaborHoursCoverageRatio, d.minLaborHoursCoverageRatio, 0, 1),
  };
}

function parsePeriodQuery(q: Record<string, string | undefined>): ComparisonPeriodQuery {
  return { mode: q.mode, beforeStart: q.beforeStart, beforeEnd: q.beforeEnd, afterStart: q.afterStart, afterEnd: q.afterEnd };
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

  const [empRows, salesRows] = await Promise.all([
    db.prepare(empSql).bind(...empParams).all<{ id: number; name: string; emp_no: string; division: number | null; team: number | null }>(),
    db.prepare(salesSql).bind(...salesParams).all<SalesRow>(),
  ]);

  const empById = new Map<number, { id: number; name: string; division: number | null; team: number | null }>();
  for (const e of empRows.results ?? []) empById.set(e.id, e);

  const rowsByEmp = new Map<number, FareRevisionDailyRow[]>();
  for (const r of salesRows.results ?? []) {
    if (!empById.has(r.emp_id)) continue; // 課・班フィルタで対象外になった社員は除外
    if (!rowsByEmp.has(r.emp_id)) rowsByEmp.set(r.emp_id, []);
    rowsByEmp.get(r.emp_id)!.push(toDailyRow(r));
  }

  const comparisons: EmployeeComparison[] = [];
  for (const [empId, rows] of rowsByEmp) {
    const emp = empById.get(empId)!;
    const beforeRows = rows.filter(r => r.date >= periods.before.start && r.date <= periods.before.end);
    const afterRows = rows.filter(r => r.date >= periods.after.start && r.date <= periods.after.end);
    if (!beforeRows.length && !afterRows.length) continue;
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
