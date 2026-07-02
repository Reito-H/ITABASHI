import { Hono } from 'hono';
import type { Env } from '../../auth';
import { invalidatePeriodSettingsCache } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM period_settings ORDER BY month').all();
  return c.json({ settings: rows.results });
});

app.post('/', async (c) => {
  const { month, close_day, start_day } = await c.req.json<{
    month: number; close_day: number; start_day: number;
  }>();
  if (!month || month < 1 || month > 12) return c.json({ error: '無効な月度' }, 400);
  if (!close_day || close_day < 1 || close_day > 31) return c.json({ error: '無効な締め日' }, 400);
  if (!start_day || start_day < 1 || start_day > 31) return c.json({ error: '無効な開始日' }, 400);

  await c.env.DB.prepare(
    'INSERT OR REPLACE INTO period_settings (month, close_day, start_day) VALUES (?, ?, ?)'
  ).bind(month, close_day, start_day).run();
  invalidatePeriodSettingsCache();
  return c.json({ ok: true });
});

export default app;
