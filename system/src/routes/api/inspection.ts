import { Hono } from 'hono';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

export interface InspectionEntry {
  id: number;
  year_month: string;
  ka: number;
  day: number;
  han: number;
  vehicle_num: string;
  type: string;
  dep_time: string | null;
}

// 月・課のスケジュール取得
app.get('/schedule', async (c) => {
  const ym = c.req.query('ym');
  const ka = parseInt(c.req.query('ka') ?? '0');
  if (!ym || !ka) return c.json({ error: 'パラメータ不足' }, 400);

  const rows = await c.env.DB.prepare(
    'SELECT id, day, han, vehicle_num, type, dep_time FROM inspection_schedules WHERE year_month = ? AND ka = ? ORDER BY day, han, id'
  ).bind(ym, ka).all<InspectionEntry>();

  return c.json(rows.results ?? []);
});

// 特定日・全課のデータ取得（日次出力用）
app.get('/day', async (c) => {
  const ym = c.req.query('ym');
  const day = parseInt(c.req.query('day') ?? '0');
  if (!ym || !day) return c.json({ error: 'パラメータ不足' }, 400);

  const rows = await c.env.DB.prepare(
    'SELECT id, ka, day, han, vehicle_num, type, dep_time FROM inspection_schedules WHERE year_month = ? AND day = ? ORDER BY ka, han, id'
  ).bind(ym, day).all<InspectionEntry>();

  return c.json(rows.results ?? []);
});

// データのある年月一覧（過去データ閲覧用）
app.get('/months', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT DISTINCT year_month FROM inspection_schedules ORDER BY year_month DESC'
  ).all<{ year_month: string }>();

  return c.json(rows.results ?? []);
});

// 車両追加
app.post('/schedule', async (c) => {
  const body = await c.req.json<{
    ym: string; ka: number; day: number; han: number;
    vehicle_num: string; type: string; dep_time?: string;
  }>();

  const { ym, ka, day, han, vehicle_num, type, dep_time } = body;
  if (!ym || !ka || !day || !han || !vehicle_num || !type) {
    return c.json({ error: 'パラメータ不足' }, 400);
  }

  const result = await c.env.DB.prepare(
    'INSERT INTO inspection_schedules (year_month, ka, day, han, vehicle_num, type, dep_time) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(ym, ka, day, han, vehicle_num.trim(), type, dep_time?.trim() || null).run();

  return c.json({ id: result.meta.last_row_id });
});

// 車両更新
app.put('/schedule/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json<{ vehicle_num: string; type: string; dep_time?: string }>();

  await c.env.DB.prepare(
    'UPDATE inspection_schedules SET vehicle_num = ?, type = ?, dep_time = ?, updated_at = datetime(\'now\', \'localtime\') WHERE id = ?'
  ).bind(body.vehicle_num.trim(), body.type, body.dep_time?.trim() || null, id).run();

  return c.json({ ok: true });
});

// 車両削除
app.delete('/schedule/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM inspection_schedules WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// 月・課のデータ一括削除
app.delete('/schedule', async (c) => {
  const ym = c.req.query('ym');
  const ka = parseInt(c.req.query('ka') ?? '0');
  if (!ym || !ka) return c.json({ error: 'パラメータ不足' }, 400);

  await c.env.DB.prepare(
    'DELETE FROM inspection_schedules WHERE year_month = ? AND ka = ?'
  ).bind(ym, ka).run();

  return c.json({ ok: true });
});

export default app;
