// 期間比較 API — 任意の2つの期間（単純な日付ベース）で、乗務員一人ひとりの売上・労働時間を比べる。
// 運賃改定影響分析（fare_revision.ts）と違い、期間は完全に自由入力。判定ロジック自体は共通のものを再利用する
// （ルールベースのみ、外部AI/LLM APIへの通信は一切行わない）。
import { Hono } from 'hono';
import type { Env } from '../../auth';
import {
  makeRange, compareEmployeePeriods, buildOverviewAggregate,
  type FareRevisionThresholds, type FareRevisionDailyRow, type PeriodRange, type EmployeeComparison,
  type OverviewAggregate,
} from '../../utils/fare_revision_analysis';
import { parseThresholds, parseFilters, fetchFirstSalesDateByEmp, computeTenureCutoff } from './fare_revision';

const app = new Hono<{ Bindings: Env }>();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// 前後の期間×2ヶ月ずつ、既定では「先月」対「今月」を初期値として提示する
function defaultRangeQuery(q: Record<string, string | undefined>): { beforeStart: string; beforeEnd: string; afterStart: string; afterEnd: string } {
  const today = new Date();
  const y = today.getUTCFullYear(), m = today.getUTCMonth();
  const thisMonthStart = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const lastMonthStart = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
  const lastMonthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return {
    beforeStart: q.beforeStart || lastMonthStart,
    beforeEnd: q.beforeEnd || lastMonthEnd,
    afterStart: q.afterStart || thisMonthStart,
    afterEnd: q.afterEnd || todayStr(),
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

export type PeriodComparisonOverviewResult = OverviewAggregate & {
  before: PeriodRange; after: PeriodRange; thresholds: FareRevisionThresholds;
  filters: { division: number | null; team: number | null; dutyCode: string | null };
  employees: EmployeeComparison[];
};

export async function computePeriodComparisonOverview(db: D1Database, q: Record<string, string | undefined>): Promise<PeriodComparisonOverviewResult> {
  const range = defaultRangeQuery(q);
  const before = makeRange(range.beforeStart, range.beforeEnd, '前の期間');
  const after = makeRange(range.afterStart, range.afterEnd, '後の期間');
  const thresholds = parseThresholds(q);
  const filters = parseFilters(q);

  const queryStart = before.start < after.start ? before.start : after.start;
  const queryEnd = before.end > after.end ? before.end : after.end;

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
    if (!empById.has(r.emp_id)) continue;
    if (!rowsByEmp.has(r.emp_id)) rowsByEmp.set(r.emp_id, []);
    rowsByEmp.get(r.emp_id)!.push(toDailyRow(r));
  }

  const tenureCutoff = computeTenureCutoff(firstDateByEmp, before.start);
  const comparisons: EmployeeComparison[] = [];
  for (const [empId, rows] of rowsByEmp) {
    const emp = empById.get(empId)!;
    const beforeRows = rows.filter(r => r.date >= before.start && r.date <= before.end);
    const afterRows = rows.filter(r => r.date >= after.start && r.date <= after.end);
    if (!beforeRows.length) continue; // 前の期間に乗務記録がない社員は比べる相手がいないため対象外
    const firstDate = firstDateByEmp.get(empId);
    if (firstDate && firstDate > tenureCutoff) continue; // 前の期間の途中で入社した社員は公平な比較ができないため除外
    comparisons.push(compareEmployeePeriods(emp, beforeRows, afterRows, before, after, thresholds));
  }
  comparisons.sort((a, b) => (a.salesGrowthPct ?? -Infinity) - (b.salesGrowthPct ?? -Infinity));

  const overview = buildOverviewAggregate(comparisons);

  return { before, after, thresholds, filters, employees: comparisons, ...overview };
}

// ===================================================
// 全社員: 任意の2期間の比較一覧＋全体集計
// ===================================================
app.get('/overview', async (c) => {
  const result = await computePeriodComparisonOverview(c.env.DB, c.req.query());
  return c.json(result);
});

export default app;
