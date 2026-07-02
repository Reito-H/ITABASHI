import { Hono } from 'hono';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

// 指導者スケジュール保存
app.post('/', async (c) => {
  const { instructor_id, date, entry, note } = await c.req.json<{
    instructor_id: number;
    date: string;
    entry: string;
    note: string;
  }>();

  if (!instructor_id || !date) {
    return c.json({ error: '必須パラメータ不足' }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: '日付フォーマットエラー' }, 400);
  }

  await c.env.DB.prepare(`
    INSERT INTO instructor_schedules (instructor_id, date, entry, note, updated_at)
    VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(instructor_id, date) DO UPDATE SET
      entry = excluded.entry,
      note = excluded.note,
      updated_at = datetime('now', 'localtime')
  `).bind(instructor_id, date, entry || null, note || null).run();

  return c.json({ ok: true });
});

export default app;
