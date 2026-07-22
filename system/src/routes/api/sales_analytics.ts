import { Hono } from 'hono';
import type { Env } from '../../auth';
import { getPeriod, getPeriodRange, getPeriodSettings } from '../../auth';
import { getDayFactors, type DayFactors } from '../../utils/taxi_calendar';
import { buildShiftSalesPdf } from '../../utils/shift_sales_pdf';

const app = new Hono<{ Bindings: Env }>();

type Row = { date: string; amount: number; duty_code: string | null; period_year: number | null; period_month: number | null };

function dutyWeight(dutyCode: string | null): number {
  if (!dutyCode) return 1.0;
  return dutyCode === dutyCode.toUpperCase() ? 1.0 : 0.5;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}

type FactorBucket = { label: string; avgTrue: number | null; avgFalse: number | null; countTrue: number; countFalse: number; diffPct: number | null };

function bucketBy(rows: { amount: number; f: DayFactors }[], label: string, pick: (f: DayFactors) => boolean): FactorBucket {
  const trueVals = rows.filter(r => pick(r.f)).map(r => r.amount);
  const falseVals = rows.filter(r => !pick(r.f)).map(r => r.amount);
  const avgTrue = avg(trueVals);
  const avgFalse = avg(falseVals);
  const diffPct = avgTrue !== null && avgFalse !== null && avgFalse > 0
    ? Math.round(((avgTrue - avgFalse) / avgFalse) * 1000) / 10
    : null;
  return { label, avgTrue, avgFalse, countTrue: trueVals.length, countFalse: falseVals.length, diffPct };
}

function buildFactorBreakdown(rows: { amount: number; f: DayFactors }[]) {
  return [
    bucketBy(rows, '金・土（週末夜間）', f => f.isFriOrSat),
    bucketBy(rows, '土日', f => f.isWeekend),
    bucketBy(rows, '五十日（ごとおび）', f => f.isGotobi),
    bucketBy(rows, '祝日', f => f.isHoliday),
    bucketBy(rows, '大型連休', f => f.isLongHoliday),
    bucketBy(rows, '忘新年会シーズン', f => f.isYearEndNewYearParty),
    bucketBy(rows, '送別会シーズン', f => f.isFarewellSeason),
    bucketBy(rows, '月末', f => f.isMonthEnd),
    bucketBy(rows, '月初', f => f.isMonthStart),
    bucketBy(rows, 'ボーナス月', f => f.isBonusMonth),
  ];
}

function weekdayBreakdown(rows: { amount: number; f: DayFactors }[]) {
  const labels = ['日', '月', '火', '水', '木', '金', '土'];
  return labels.map((label, wd) => {
    const vals = rows.filter(r => r.f.weekday === wd).map(r => r.amount);
    return { label, avg: avg(vals), count: vals.length };
  });
}

// ===================================================
// 社員別: 直近N月の日次データ＋暦要因別集計
// ===================================================
app.get('/employee/:empId', async (c) => {
  const empId = parseInt(c.req.param('empId'));
  if (isNaN(empId)) return c.json({ error: '不正な社員IDです' }, 400);
  const months = Math.min(Math.max(parseInt(c.req.query('months') ?? '6') || 6, 1), 24);

  const emp = await c.env.DB.prepare('SELECT id, name FROM employees WHERE id = ?')
    .bind(empId).first<{ id: number; name: string }>();
  if (!emp) return c.json({ error: '社員が見つかりません' }, 404);

  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().slice(0, 10);

  const dbRows = (await c.env.DB.prepare(
    'SELECT date, amount, duty_code, period_year, period_month FROM sales_records WHERE emp_id = ? AND date >= ? ORDER BY date'
  ).bind(empId, sinceStr).all<Row>()).results ?? [];

  const enriched = dbRows.map(r => ({ ...r, f: getDayFactors(r.date) }));

  // 月度集計
  const monthlyMap = new Map<string, { year: number; month: number; total: number; weighted: number; count: number }>();
  for (const r of dbRows) {
    if (r.period_year == null || r.period_month == null) continue;
    const key = `${r.period_year}-${r.period_month}`;
    if (!monthlyMap.has(key)) monthlyMap.set(key, { year: r.period_year, month: r.period_month, total: 0, weighted: 0, count: 0 });
    const m = monthlyMap.get(key)!;
    m.total += r.amount;
    m.weighted += dutyWeight(r.duty_code);
    m.count += 1;
  }
  const monthly = [...monthlyMap.values()].sort((a, b) => a.year - b.year || a.month - b.month)
    .map(m => ({ ...m, avgPerDuty: m.count ? Math.round(m.total / m.count) : 0 }));

  const daily = enriched.map(r => ({
    date: r.date, amount: r.amount, dutyCode: r.duty_code,
    weekdayLabel: r.f.weekdayLabel, labels: r.f.labels,
  }));

  return c.json({
    empName: emp.name,
    daily,
    monthly,
    factorBreakdown: buildFactorBreakdown(enriched.map(r => ({ amount: r.amount, f: r.f }))),
    weekdayBreakdown: weekdayBreakdown(enriched.map(r => ({ amount: r.amount, f: r.f }))),
  });
});

// ===================================================
// 全社員一覧: 今月度・前月度の実績サマリー
// ===================================================
app.get('/overview', async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const { year: curY, month: curM } = getPeriod(today);
  let prevY = curY, prevM = curM - 1;
  if (prevM < 1) { prevM = 12; prevY -= 1; }

  const settings = await getPeriodSettings(c.env.DB);
  const cur = getPeriodRange(curY, curM, settings);
  const prev = getPeriodRange(prevY, prevM, settings);

  const [empRows, curRows, prevRows] = await Promise.all([
    c.env.DB.prepare('SELECT id, name, division, team FROM employees WHERE is_active = 1').all<{ id: number; name: string; division: number | null; team: number | null }>(),
    c.env.DB.prepare('SELECT emp_id, amount, duty_code, date FROM sales_records WHERE date >= ? AND date <= ?').bind(cur.start, cur.end).all<{ emp_id: number; amount: number; duty_code: string | null; date: string }>(),
    c.env.DB.prepare('SELECT emp_id, amount FROM sales_records WHERE date >= ? AND date <= ?').bind(prev.start, prev.end).all<{ emp_id: number; amount: number }>(),
  ]);

  const curByEmp = new Map<number, { total: number; weighted: number; count: number }>();
  for (const r of curRows.results ?? []) {
    if (!curByEmp.has(r.emp_id)) curByEmp.set(r.emp_id, { total: 0, weighted: 0, count: 0 });
    const e = curByEmp.get(r.emp_id)!;
    e.total += r.amount; e.weighted += dutyWeight(r.duty_code); e.count += 1;
  }
  const prevByEmp = new Map<number, number>();
  for (const r of prevRows.results ?? []) {
    prevByEmp.set(r.emp_id, (prevByEmp.get(r.emp_id) ?? 0) + r.amount);
  }

  const employees = (empRows.results ?? []).map(e => {
    const c2 = curByEmp.get(e.id);
    const p = prevByEmp.get(e.id) ?? 0;
    const total = c2?.total ?? 0;
    const changePct = p > 0 ? Math.round(((total - p) / p) * 1000) / 10 : null;
    return {
      empId: e.id, name: e.name, division: e.division, team: e.team,
      curTotal: total, curAvgPerDuty: c2?.count ? Math.round(c2.total / c2.count) : null,
      curDutyCount: c2?.count ?? 0, prevTotal: p, changePct,
    };
  }).filter(e => e.curTotal > 0 || e.prevTotal > 0);

  // 全社横断の暦要因分析（直近実績のある月度データ全体）
  const enriched = (curRows.results ?? []).map(r => ({ amount: r.amount, f: getDayFactors(r.date) }));

  return c.json({
    period: { year: curY, month: curM, start: cur.start, end: cur.end },
    employees,
    factorBreakdown: buildFactorBreakdown(enriched),
    weekdayBreakdown: weekdayBreakdown(enriched),
  });
});

// ===================================================
// 社員別: 指定月度の勤務実績・売上PDF（紙帳票風）
// ===================================================
app.get('/employee/:empId/pdf', async (c) => {
  const empId = parseInt(c.req.param('empId'));
  if (isNaN(empId)) return c.text('不正な社員IDです', 400);
  const year = parseInt(c.req.query('year') ?? '0');
  const month = parseInt(c.req.query('month') ?? '0');
  if (!year || !month) return c.text('年月を指定してください', 400);

  const emp = await c.env.DB.prepare('SELECT id, emp_no, name, division, team FROM employees WHERE id = ?')
    .bind(empId).first<{ id: number; emp_no: string; name: string; division: number | null; team: number | null }>();
  if (!emp) return c.text('社員が見つかりません', 404);

  const settings = await getPeriodSettings(c.env.DB);
  const { start, end } = getPeriodRange(year, month, settings);

  const dbRows = (await c.env.DB.prepare(
    'SELECT date, amount, duty_code FROM sales_records WHERE emp_id = ? AND date >= ? AND date <= ? ORDER BY date'
  ).bind(empId, start, end).all<{ date: string; amount: number; duty_code: string | null }>()).results ?? [];
  const rows = dbRows.map(r => ({ date: r.date, amount: r.amount, dutyCode: r.duty_code }));

  const bytes = await buildShiftSalesPdf({
    env: c.env, empName: emp.name, empNo: emp.emp_no, division: emp.division, team: emp.team,
    year, month, start, end, rows,
  });
  if (!bytes) return c.text('PDF未設定（フォントが設定されていません）', 503);

  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="shift_sales_${emp.emp_no}_${year}_${month}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
});

export default app;
