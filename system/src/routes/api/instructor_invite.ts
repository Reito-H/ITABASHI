import { Hono } from 'hono';
import { generateInviteCode } from '../../auth';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

// 班長向け招待コード発行
app.post('/', async (c) => {
  const { instructor_id } = await c.req.json<{ instructor_id: number }>();
  if (!instructor_id) return c.json({ error: 'instructor_id は必須です' }, 400);

  const inst = await c.env.DB.prepare('SELECT id, name FROM instructors WHERE id = ? AND is_active = 1').bind(instructor_id).first<{ id: number; name: string }>();
  if (!inst) return c.json({ error: '指定された班長・指導者が見つかりません' }, 404);

  // 既存の未使用コードを削除
  await c.env.DB.prepare("DELETE FROM invite_codes WHERE instructor_id = ? AND is_used = 0").bind(instructor_id).run();

  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await c.env.DB.prepare(
    "INSERT INTO invite_codes (code, instructor_id, expires_at) VALUES (?, ?, ?)"
  ).bind(code, instructor_id, expiresAt).run();

  return c.json({ ok: true, code, expires_at: expiresAt });
});

// LINE 連携解除
app.delete('/:instructorId', async (c) => {
  const instructorId = parseInt(c.req.param('instructorId'));
  await c.env.DB.prepare('UPDATE instructors SET line_uid = NULL WHERE id = ?').bind(instructorId).run();
  return c.json({ ok: true });
});

export default app;
