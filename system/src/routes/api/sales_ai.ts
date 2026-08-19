// AI売上分析 API（旧 routes/api/sales_analytics.ts を拡張・移設。/api/sales-ai にマウント）
import { Hono } from 'hono';
import type { Env } from '../../auth';
import { getPeriod, getPeriodRange, getPeriodSettings } from '../../auth';
import { getDayFactors, type DayFactors } from '../../utils/taxi_calendar';
import { buildShiftSalesPdf } from '../../utils/shift_sales_pdf';
import { buildRuleBasedSalesAnalysis, type SalesAnalysisInput } from '../../utils/sales_trend_analysis';

const app = new Hono<{ Bindings: Env }>();

type Row = {
  date: string; amount: number; duty_code: string | null;
  period_year: number | null; period_month: number | null;
  ride_count: number | null; distance_km: number | null;
  start_time: string | null; return_time: string | null;
};

function dutyWeight(dutyCode: string | null): number {
  if (!dutyCode) return 1.0;
  return dutyCode === dutyCode.toUpperCase() ? 1.0 : 0.5;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round(nums.reduce((s, n) => s + n, 0) / nums.length);
}

// ===== 時刻('HH:MM')ユーティリティ =====
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
function avgTime(times: Array<string | null | undefined>): string | null {
  const mins = times.map(timeToMinutes).filter((v): v is number => v !== null);
  if (!mins.length) return null;
  return minutesToTime(Math.round(mins.reduce((s, n) => s + n, 0) / mins.length));
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

type MonthlyEntry = { year: number; month: number; total: number; weighted: number; count: number; avgPerDuty: number };

// 直近半分 vs それ以前半分（各最大3ヶ月）の平均日商を比較
function buildTrend(monthly: MonthlyEntry[]): { recentAvg: number; earlyAvg: number; changePct: number | null; recentMonths: string[]; earlyMonths: string[] } | null {
  if (monthly.length < 4) return null;
  const n = Math.min(3, Math.floor(monthly.length / 2));
  const recent = monthly.slice(monthly.length - n);
  const early = monthly.slice(monthly.length - 2 * n, monthly.length - n);
  if (!recent.length || !early.length) return null;
  const recentAvg = Math.round(recent.reduce((s, m) => s + m.avgPerDuty, 0) / recent.length);
  const earlyAvg = Math.round(early.reduce((s, m) => s + m.avgPerDuty, 0) / early.length);
  const changePct = earlyAvg > 0 ? Math.round(((recentAvg - earlyAvg) / earlyAvg) * 1000) / 10 : null;
  return {
    recentAvg, earlyAvg, changePct,
    recentMonths: recent.map(m => `${m.year}年${m.month}月度`),
    earlyMonths: early.map(m => `${m.year}年${m.month}月度`),
  };
}

export type EmployeeAnalytics = {
  emp: { id: number; name: string; division: number | null; team: number | null };
  daily: Array<{ date: string; amount: number; dutyCode: string | null; weekdayLabel: string; labels: string[]; periodYear: number | null; periodMonth: number | null; rideCount: number | null; distanceKm: number | null; startTime: string | null; returnTime: string | null }>;
  monthly: MonthlyEntry[];
  factorBreakdown: FactorBucket[];
  weekdayBreakdown: ReturnType<typeof weekdayBreakdown>;
  trend: ReturnType<typeof buildTrend>;
  relative: SalesAnalysisInput['relative'];
  returnTime: SalesAnalysisInput['returnTime'];
} | null;

// 社員別の集計一式（詳細画面・印刷レポートで共用）
export async function computeEmployeeAnalytics(db: D1Database, empId: number, months: number): Promise<EmployeeAnalytics> {
  const emp = await db.prepare('SELECT id, name, division, team FROM employees WHERE id = ?')
    .bind(empId).first<{ id: number; name: string; division: number | null; team: number | null }>();
  if (!emp) return null;

  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().slice(0, 10);

  const dbRows = (await db.prepare(
    'SELECT date, amount, duty_code, period_year, period_month, ride_count, distance_km, start_time, return_time FROM sales_records WHERE emp_id = ? AND date >= ? ORDER BY date'
  ).bind(empId, sinceStr).all<Row>()).results ?? [];

  const enriched = dbRows.map(r => ({ ...r, f: getDayFactors(r.date) }));

  const monthlyMap = new Map<string, MonthlyEntry>();
  for (const r of dbRows) {
    if (r.period_year == null || r.period_month == null) continue;
    const key = `${r.period_year}-${r.period_month}`;
    if (!monthlyMap.has(key)) monthlyMap.set(key, { year: r.period_year, month: r.period_month, total: 0, weighted: 0, count: 0, avgPerDuty: 0 });
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
    periodYear: r.period_year, periodMonth: r.period_month,
    rideCount: r.ride_count, distanceKm: r.distance_km,
    startTime: r.start_time, returnTime: r.return_time,
  }));

  const trend = buildTrend(monthly);

  // 帰庫時間（データが十分蓄積されるまでは「傾向あり」と断定しない）
  const returnTimes = dbRows.map(r => r.return_time).filter((t): t is string => !!t);
  const returnTime: SalesAnalysisInput['returnTime'] = {
    avg: avgTime(returnTimes), count: returnTimes.length, sufficientData: returnTimes.length >= 10,
  };

  // 同条件比較（相対評価）: 当月度・同じ課の他の乗務員 / 同じ勤務区分の他の乗務員
  let relative: SalesAnalysisInput['relative'] = null;
  if (emp.division != null) {
    const settings = await getPeriodSettings(db);
    const today = new Date().toISOString().slice(0, 10);
    const { year: curY, month: curM } = getPeriod(today);
    const cur = getPeriodRange(curY, curM, settings);

    const selfCurRows = (await db.prepare(
      'SELECT amount, duty_code FROM sales_records WHERE emp_id = ? AND date >= ? AND date <= ?'
    ).bind(empId, cur.start, cur.end).all<{ amount: number; duty_code: string | null }>()).results ?? [];

    if (selfCurRows.length) {
      const peerRows = (await db.prepare(
        `SELECT sr.emp_id, sr.amount, sr.duty_code FROM sales_records sr
         JOIN employees e ON e.id = sr.emp_id
         WHERE e.division = ? AND sr.emp_id != ? AND sr.date >= ? AND sr.date <= ?`
      ).bind(emp.division, empId, cur.start, cur.end).all<{ emp_id: number; amount: number; duty_code: string | null }>()).results ?? [];

      const selfAvg = Math.round(selfCurRows.reduce((s, r) => s + r.amount, 0) / selfCurRows.length);
      const peerAvg = peerRows.length ? Math.round(peerRows.reduce((s, r) => s + r.amount, 0) / peerRows.length) : null;
      const divisionDiffPct = peerAvg && peerAvg > 0 ? Math.round(((selfAvg - peerAvg) / peerAvg) * 1000) / 10 : null;
      const peerCount = new Set(peerRows.map(r => r.emp_id)).size;

      const selfByDuty = new Map<string, { total: number; count: number }>();
      for (const r of selfCurRows) {
        if (!r.duty_code) continue;
        if (!selfByDuty.has(r.duty_code)) selfByDuty.set(r.duty_code, { total: 0, count: 0 });
        const d = selfByDuty.get(r.duty_code)!;
        d.total += r.amount; d.count += 1;
      }
      const peerByDuty = new Map<string, { total: number; count: number }>();
      for (const r of peerRows) {
        if (!r.duty_code) continue;
        if (!peerByDuty.has(r.duty_code)) peerByDuty.set(r.duty_code, { total: 0, count: 0 });
        const d = peerByDuty.get(r.duty_code)!;
        d.total += r.amount; d.count += 1;
      }
      const dutyComparison = [...selfByDuty.entries()].map(([dutyCode, s]) => {
        const p = peerByDuty.get(dutyCode);
        const selfDutyAvg = Math.round(s.total / s.count);
        const peerDutyAvg = p && p.count ? Math.round(p.total / p.count) : null;
        const diffPct = peerDutyAvg && peerDutyAvg > 0 ? Math.round(((selfDutyAvg - peerDutyAvg) / peerDutyAvg) * 1000) / 10 : null;
        return { dutyCode, selfAvg: selfDutyAvg, peerAvg: peerDutyAvg, diffPct, selfCount: s.count };
      });

      relative = { periodLabel: `${curY}年${curM}月度`, selfAvg, peerAvg, peerCount, divisionDiffPct, dutyComparison };
    }
  }

  return {
    emp, daily, monthly,
    factorBreakdown: buildFactorBreakdown(enriched.map(r => ({ amount: r.amount, f: r.f }))),
    weekdayBreakdown: weekdayBreakdown(enriched.map(r => ({ amount: r.amount, f: r.f }))),
    trend, relative, returnTime,
  };
}

// ===================================================
// 社員別: 直近N月の日次データ＋暦要因別・曜日別・トレンド・相対評価・帰庫時間
// ===================================================
app.get('/employee/:empId', async (c) => {
  const empId = parseInt(c.req.param('empId'));
  if (isNaN(empId)) return c.json({ error: '不正な社員IDです' }, 400);
  const months = Math.min(Math.max(parseInt(c.req.query('months') ?? '6') || 6, 1), 24);

  const data = await computeEmployeeAnalytics(c.env.DB, empId, months);
  if (!data) return c.json({ error: '社員が見つかりません' }, 404);

  return c.json({
    empName: data.emp.name, division: data.emp.division, team: data.emp.team,
    daily: data.daily, monthly: data.monthly,
    factorBreakdown: data.factorBreakdown, weekdayBreakdown: data.weekdayBreakdown,
    trend: data.trend, relative: data.relative, returnTime: data.returnTime,
  });
});

// ===================================================
// 社員別: AI分析レポート（ルールベース・印刷ページ用）
// ===================================================
app.get('/employee/:empId/report', async (c) => {
  const empId = parseInt(c.req.param('empId'));
  if (isNaN(empId)) return c.json({ error: '不正な社員IDです' }, 400);
  const months = Math.min(Math.max(parseInt(c.req.query('months') ?? '6') || 6, 1), 24);

  const data = await computeEmployeeAnalytics(c.env.DB, empId, months);
  if (!data) return c.json({ error: '社員が見つかりません' }, 404);

  const content = buildRuleBasedSalesAnalysis({
    empName: data.emp.name,
    weekdayBreakdown: data.weekdayBreakdown,
    factorBreakdown: data.factorBreakdown,
    trend: data.trend,
    relative: data.relative,
    returnTime: data.returnTime,
  });

  const cnt = data.daily.length;
  const totalAmount = data.daily.reduce((s, d) => s + d.amount, 0);
  const lastDate = cnt ? data.daily[cnt - 1].date : null;

  return c.json({
    empName: data.emp.name, division: data.emp.division, team: data.emp.team,
    cnt, totalAmount, lastDate, monthCount: data.monthly.length,
    weekdayBreakdown: data.weekdayBreakdown,
    content,
  });
});

// ===================================================
// 全社員一覧: 今月度・前月度の実績サマリー＋班別/課別比較＋帰庫時間
// ===================================================
app.get('/overview', async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const { year: todayY, month: todayM } = getPeriod(today);

  // year/month省略時は当月度。指定時はその月度を表示（月度切り替えナビゲーション用）
  const qYear = parseInt(c.req.query('year') ?? '');
  const qMonth = parseInt(c.req.query('month') ?? '');
  const curY = !isNaN(qYear) ? qYear : todayY;
  const curM = !isNaN(qMonth) ? qMonth : todayM;

  let prevY = curY, prevM = curM - 1;
  if (prevM < 1) { prevM = 12; prevY -= 1; }

  const settings = await getPeriodSettings(c.env.DB);
  const cur = getPeriodRange(curY, curM, settings);
  const prev = getPeriodRange(prevY, prevM, settings);
  const isCurrentPeriod = curY === todayY && curM === todayM;

  const [empRows, curRows, prevRows] = await Promise.all([
    c.env.DB.prepare('SELECT id, name, division, team FROM employees WHERE is_active = 1').all<{ id: number; name: string; division: number | null; team: number | null }>(),
    c.env.DB.prepare('SELECT emp_id, amount, duty_code, date, return_time FROM sales_records WHERE date >= ? AND date <= ?').bind(cur.start, cur.end).all<{ emp_id: number; amount: number; duty_code: string | null; date: string; return_time: string | null }>(),
    c.env.DB.prepare('SELECT emp_id, amount FROM sales_records WHERE date >= ? AND date <= ?').bind(prev.start, prev.end).all<{ emp_id: number; amount: number }>(),
  ]);

  const empDivTeam = new Map<number, { division: number | null; team: number | null }>();
  for (const e of empRows.results ?? []) empDivTeam.set(e.id, { division: e.division, team: e.team });

  const curByEmp = new Map<number, { total: number; weighted: number; count: number; returnTimes: string[] }>();
  for (const r of curRows.results ?? []) {
    if (!curByEmp.has(r.emp_id)) curByEmp.set(r.emp_id, { total: 0, weighted: 0, count: 0, returnTimes: [] });
    const e = curByEmp.get(r.emp_id)!;
    e.total += r.amount; e.weighted += dutyWeight(r.duty_code); e.count += 1;
    if (r.return_time) e.returnTimes.push(r.return_time);
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
    const curAvgReturnTime = c2?.returnTimes.length ? avgTime(c2.returnTimes) : null;
    return {
      empId: e.id, name: e.name, division: e.division, team: e.team,
      curTotal: total, curAvgPerDuty: c2?.count ? Math.round(c2.total / c2.count) : null,
      curDutyCount: c2?.count ?? 0, prevTotal: p, changePct,
      curAvgReturnTime, curAvgReturnTimeMinutes: curAvgReturnTime ? timeToMinutes(curAvgReturnTime) : null,
      curReturnTimeCount: c2?.returnTimes.length ?? 0,
    };
  }).filter(e => e.curTotal > 0 || e.prevTotal > 0);

  // 班別・課別比較（当月度の実績データをプールして集計。平均の平均ではなく合計÷件数）
  const divisionMap = new Map<number, { total: number; count: number; empIds: Set<number> }>();
  const teamMap = new Map<number, { total: number; count: number; empIds: Set<number> }>();
  for (const r of curRows.results ?? []) {
    const dt = empDivTeam.get(r.emp_id);
    if (dt?.division != null) {
      if (!divisionMap.has(dt.division)) divisionMap.set(dt.division, { total: 0, count: 0, empIds: new Set() });
      const d = divisionMap.get(dt.division)!;
      d.total += r.amount; d.count += 1; d.empIds.add(r.emp_id);
    }
    if (dt?.team != null) {
      if (!teamMap.has(dt.team)) teamMap.set(dt.team, { total: 0, count: 0, empIds: new Set() });
      const t = teamMap.get(dt.team)!;
      t.total += r.amount; t.count += 1; t.empIds.add(r.emp_id);
    }
  }
  const divisionBreakdown = [...divisionMap.entries()].sort((a, b) => a[0] - b[0])
    .map(([division, d]) => ({ division, avgPerDuty: d.count ? Math.round(d.total / d.count) : 0, total: d.total, empCount: d.empIds.size }));
  const teamBreakdown = [...teamMap.entries()].sort((a, b) => a[0] - b[0])
    .map(([team, t]) => ({ team, division: Math.ceil(team / 2), avgPerDuty: t.count ? Math.round(t.total / t.count) : 0, total: t.total, empCount: t.empIds.size }));

  // 全社横断の暦要因分析（当月度実績データ全体）
  const enriched = (curRows.results ?? []).map(r => ({ amount: r.amount, f: getDayFactors(r.date) }));

  let nextY = curY, nextM = curM + 1;
  if (nextM > 12) { nextM = 1; nextY += 1; }

  return c.json({
    period: {
      year: curY, month: curM, start: cur.start, end: cur.end, isCurrentPeriod,
      prevYear: prevY, prevMonth: prevM, nextYear: nextY, nextMonth: nextM,
    },
    employees,
    divisionBreakdown, teamBreakdown,
    factorBreakdown: buildFactorBreakdown(enriched),
    weekdayBreakdown: weekdayBreakdown(enriched),
  });
});

// ===================================================
// 社員別: 指定月度の勤務実績・売上PDF（紙帳票風、既存機能のまま維持）
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
