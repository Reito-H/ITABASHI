import { Hono } from 'hono';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

// 管理者メモ保存
app.post('/:id/memo', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { memo } = await c.req.json<{ memo: string }>();
  await c.env.DB.prepare(
    'UPDATE bad_events SET admin_memo = ? WHERE id = ?'
  ).bind(memo || null, id).run();
  return c.json({ ok: true });
});

// 報告削除
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM bad_events WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// 報告一覧（LINE用）
app.get('/by-emp/:empId', async (c) => {
  const empId = parseInt(c.req.param('empId'));
  const rows = await c.env.DB.prepare(
    'SELECT id, category, content, created_at FROM bad_events WHERE emp_id = ? ORDER BY created_at DESC LIMIT 20'
  ).bind(empId).all();
  return c.json({ events: rows.results });
});

export default app;
