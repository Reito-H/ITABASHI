import { Hono } from 'hono';
import type { Env } from '../../auth';
import { invalidatePeriodSettingsCache } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM period_settings ORDER BY month').all();
  return c.json({ settings: rows.results });
});

type PeriodSetting = { month: number; close_day: number; start_day: number };

function validatePeriod(p: PeriodSetting): string | null {
  if (!p.month || p.month < 1 || p.month > 12) return '無効な月度';
  if (!p.close_day || p.close_day < 1 || p.close_day > 31) return '無効な締め日';
  if (!p.start_day || p.start_day < 1 || p.start_day > 31) return '無効な開始日';
  return null;
}

// 単月オブジェクト または 全月度の配列を受け付ける（配列は1リクエストで一括保存）
app.post('/', async (c) => {
  const body = await c.req.json<PeriodSetting | PeriodSetting[]>();
  const items = Array.isArray(body) ? body : [body];
  if (items.length === 0 || items.length > 12) return c.json({ error: '件数が不正です' }, 400);

  for (const p of items) {
    const err = validatePeriod(p);
    if (err) return c.json({ error: `${p.month ?? '?'}月度: ${err}` }, 400);
  }

  const stmt = c.env.DB.prepare(
    'INSERT OR REPLACE INTO period_settings (month, close_day, start_day) VALUES (?, ?, ?)'
  );
  await c.env.DB.batch(items.map(p => stmt.bind(p.month, p.close_day, p.start_day)));
  invalidatePeriodSettingsCache();
  return c.json({ ok: true });
});

export default app;
