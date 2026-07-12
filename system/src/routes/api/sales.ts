import { Hono } from 'hono';
import { getPeriod } from '../../auth';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

// 売上記録・更新
app.post('/', async (c) => {
  const data = await c.req.json<{
    emp_id: number;
    date: string;
    amount: number;
    ride_count?: number;
    distance_km?: number;
    duty_code?: string;
  }>();

  if (!data.emp_id || !data.date || data.amount === undefined) {
    return c.json({ error: '必須パラメータ不足' }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    return c.json({ error: '日付フォーマットエラー' }, 400);
  }

  // 翌日以降は管理者のみ（Workerは内部からのみ呼ばれるため、ここではLINEからの呼び出しに対応）
  // 翌日チェックは LINE Webhook 側で実施

  const { year, month } = getPeriod(data.date);

  await c.env.DB.prepare(`
    INSERT INTO sales_records (emp_id, date, amount, ride_count, distance_km, duty_code, period_year, period_month, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(emp_id, date) DO UPDATE SET
      amount = excluded.amount,
      ride_count = excluded.ride_count,
      distance_km = excluded.distance_km,
      duty_code = excluded.duty_code,
      period_year = excluded.period_year,
      period_month = excluded.period_month,
      updated_at = datetime('now', 'localtime')
  `).bind(
    data.emp_id, data.date, data.amount,
    data.ride_count ?? null, data.distance_km ?? null, data.duty_code ?? null,
    year, month
  ).run();

  return c.json({ ok: true });
});

// 売上削除
app.delete('/:emp_id/:date', async (c) => {
  const empId = parseInt(c.req.param('emp_id'));
  const date = c.req.param('date');
  await c.env.DB.prepare(
    'DELETE FROM sales_records WHERE emp_id = ? AND date = ?'
  ).bind(empId, date).run();
  return c.json({ ok: true });
});

// 月度別売上一覧
app.get('/period', async (c) => {
  const year = parseInt(c.req.query('year') ?? '0');
  const month = parseInt(c.req.query('month') ?? '0');
  if (!year || !month) return c.json({ error: 'パラメータ不足' }, 400);

  const rows = await c.env.DB.prepare(`
    SELECT s.*, e.name, e.emp_no, e.division, e.team
    FROM sales_records s
    JOIN employees e ON s.emp_id = e.id
    WHERE s.period_year = ? AND s.period_month = ?
    ORDER BY e.division, e.team, e.seq_no, s.date
  `).bind(year, month).all();

  return c.json({ records: rows.results });
});

// 社員別月度サマリー
app.get('/summary', async (c) => {
  const year = parseInt(c.req.query('year') ?? '0');
  const month = parseInt(c.req.query('month') ?? '0');
  if (!year || !month) return c.json({ error: 'パラメータ不足' }, 400);

  const rows = await c.env.DB.prepare(`
    SELECT
      e.id, e.name, e.emp_no, e.division, e.team,
      SUM(s.amount) as total_amount,
      SUM(s.ride_count) as total_rides,
      SUM(s.distance_km) as total_distance,
      COUNT(s.date) as working_days,
      AVG(s.amount) as avg_amount
    FROM employees e
    LEFT JOIN sales_records s ON e.id = s.emp_id AND s.period_year = ? AND s.period_month = ?
    WHERE e.is_active = 1
    GROUP BY e.id
    ORDER BY e.division, e.team, e.seq_no
  `).bind(year, month).all();

  return c.json({ summary: rows.results });
});

// CSV出力用データ
app.get('/csv', async (c) => {
  const year = parseInt(c.req.query('year') ?? '0');
  const month = parseInt(c.req.query('month') ?? '0');
  if (!year || !month) return c.text('パラメータ不足', 400);

  const { getPeriodRange } = await import('../../auth');
  const { start, end } = getPeriodRange(year, month);

  const employees = await c.env.DB.prepare(
    'SELECT id, name, emp_no, division, team FROM employees WHERE is_active = 1 ORDER BY division, team, seq_no'
  ).all<{ id: number; name: string; emp_no: string; division: number; team: number }>();

  const records = await c.env.DB.prepare(
    'SELECT emp_id, date, amount, ride_count, distance_km FROM sales_records WHERE period_year = ? AND period_month = ? ORDER BY emp_id, date'
  ).bind(year, month).all<{ emp_id: number; date: string; amount: number; ride_count: number; distance_km: number }>();

  // 日付リスト生成
  const dates: string[] = [];
  const cur = new Date(start);
  const endDate = new Date(end);
  while (cur <= endDate) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }

  // 売上マップ
  const saleMap: Record<string, { amount: number; rides: number; dist: number }> = {};
  for (const r of (records.results ?? [])) {
    saleMap[`${r.emp_id}_${r.date}`] = {
      amount: r.amount, rides: r.ride_count, dist: r.distance_km
    };
  }

  // CSV生成
  const header = ['課', '班', '社員番号', '氏名', ...dates.flatMap(d => [`${d}_売上`, `${d}_乗車`, `${d}_距離`]), '月計売上', '月計乗車', '月計距離'].join(',');
  const body = (employees.results ?? []).map(e => {
    let totalAmt = 0, totalRides = 0, totalDist = 0;
    const cells = dates.flatMap(d => {
      const s = saleMap[`${e.id}_${d}`];
      const amt = s?.amount ?? 0;
      const rides = s?.rides ?? 0;
      const dist = s?.dist ?? 0;
      totalAmt += amt; totalRides += rides; totalDist += dist;
      return [amt || '', rides || '', dist || ''];
    });
    return [e.division ?? '', e.team ?? '', e.emp_no, `"${e.name}"`, ...cells, totalAmt, totalRides, totalDist].join(',');
  }).join('\n');

  const csv = `﻿${header}\n${body}`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sales_${year}_${month}.csv"`
    }
  });
});

export default app;
