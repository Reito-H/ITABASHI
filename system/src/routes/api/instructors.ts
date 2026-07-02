import { Hono } from 'hono';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

app.get('/', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM instructors ORDER BY sort_order, id'
  ).all();
  return c.json({ instructors: rows.results });
});

app.post('/', async (c) => {
  const { name, role, sort_order } = await c.req.json<{ name: string; role?: string; sort_order?: number }>();
  if (!name?.trim()) return c.json({ error: '名前は必須です' }, 400);
  const result = await c.env.DB.prepare(
    'INSERT INTO instructors (name, role, sort_order) VALUES (?, ?, ?)'
  ).bind(name.trim(), role?.trim() || null, sort_order ?? 0).run();
  return c.json({ ok: true, id: result.meta.last_row_id });
});

app.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const data = await c.req.json<{ name?: string; role?: string; sort_order?: number; is_active?: number }>();
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (data.name !== undefined)              { sets.push('name = ?');              vals.push(data.name.trim()); }
  if (data.role !== undefined)              { sets.push('role = ?');              vals.push(data.role?.trim() || null); }
  if (data.sort_order !== undefined)        { sets.push('sort_order = ?');        vals.push(data.sort_order); }
  if (data.is_active !== undefined)         { sets.push('is_active = ?');         vals.push(data.is_active); }
  if (sets.length === 0) return c.json({ ok: true });
  vals.push(id);
  await c.env.DB.prepare(`UPDATE instructors SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('UPDATE instructors SET is_active = 0 WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
