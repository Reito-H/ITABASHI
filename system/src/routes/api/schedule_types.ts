import { Hono } from 'hono';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

export type ScheduleType = {
  id: number;
  code: string;
  color: string;
  sort_order: number;
  is_active: number;
};

// 一覧取得
app.get('/', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM schedule_types ORDER BY sort_order, id'
  ).all<ScheduleType>();
  return c.json({ types: rows.results });
});

// 新規作成
app.post('/', async (c) => {
  const { code, color, sort_order } = await c.req.json<{ code: string; color: string; sort_order?: number }>();
  if (!code?.trim()) return c.json({ error: '区分名は必須です' }, 400);
  try {
    const r = await c.env.DB.prepare(
      'INSERT INTO schedule_types (code, color, sort_order) VALUES (?, ?, ?)'
    ).bind(code.trim(), color ?? '#f3f4f6', sort_order ?? 99).run();
    return c.json({ ok: true, id: r.meta.last_row_id });
  } catch {
    return c.json({ error: 'すでに同じ区分名が存在します' }, 409);
  }
});

// 更新
app.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json<{
    code?: string; color?: string; sort_order?: number; is_active?: number; target?: number | null;
  }>();
  // target は null を明示的に送れるよう COALESCE を使わない
  const hasTarget = 'target' in body;
  const targetSql = hasTarget ? ', target = ?' : '';
  const params: unknown[] = [
    body.code ?? null, body.color ?? null, body.sort_order ?? null, body.is_active ?? null,
  ];
  if (hasTarget) params.push(body.target ?? null);
  params.push(id);
  await c.env.DB.prepare(
    `UPDATE schedule_types SET
      code = COALESCE(?, code),
      color = COALESCE(?, color),
      sort_order = COALESCE(?, sort_order),
      is_active = COALESCE(?, is_active)
      ${targetSql}
     WHERE id = ?`
  ).bind(...params).run();
  return c.json({ ok: true });
});

// 削除
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM schedule_types WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
