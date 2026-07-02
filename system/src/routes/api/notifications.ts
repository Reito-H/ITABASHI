import { Hono } from 'hono';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM notification_settings ORDER BY type').all();
  return c.json({ settings: rows.results });
});

app.put('/:type', async (c) => {
  const type = c.req.param('type');
  const data = await c.req.json<{ send_hour?: number; send_minute?: number; is_enabled?: number }>();
  const sets: string[] = [];
  const vals: (string | number)[] = [];
  if (data.send_hour !== undefined)   { sets.push('send_hour = ?');   vals.push(data.send_hour); }
  if (data.send_minute !== undefined) { sets.push('send_minute = ?'); vals.push(data.send_minute); }
  if (data.is_enabled !== undefined)  { sets.push('is_enabled = ?');  vals.push(data.is_enabled); }
  if (sets.length === 0) return c.json({ ok: true });
  sets.push("updated_at = datetime('now','localtime')");
  vals.push(type);
  await c.env.DB.prepare(`UPDATE notification_settings SET ${sets.join(', ')} WHERE type = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

// 送信済みフラグリセット（再送可能にする）
app.post('/reset', async (c) => {
  const body = await c.req.json<{ type?: string }>();
  if (body.type) {
    await c.env.DB.prepare('UPDATE notification_settings SET last_sent_date = NULL WHERE type = ?').bind(body.type).run();
  } else {
    await c.env.DB.prepare('UPDATE notification_settings SET last_sent_date = NULL').run();
  }
  return c.json({ ok: true });
});

// 手動送信
app.post('/send', async (c) => {
  const { type } = await c.req.json<{ type: string }>();
  if (!type) return c.json({ error: 'type は必須です' }, 400);
  const { runNotification } = await import('../../cron');
  await runNotification(c.env, type);
  return c.json({ ok: true });
});

export default app;
