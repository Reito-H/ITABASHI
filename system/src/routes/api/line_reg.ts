// LINE登録QR 発行・失効API（管理画面「LINE連携」ページから使用）

import { Hono } from 'hono';
import qrcode from 'qrcode-generator';
import { generateRegQrToken } from '../../auth';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

function tokenToQrSvg(token: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(token);
  qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true })
    .replace(/black/g, '#1e3a5f').replace(/white/g, '#ffffff');
}

const VALID_ROLES = [
  'general_manager', 'operations_manager', 'vehicle_manager', 'newcomer',
  'benten_shift_master', 'benten_member', 'crew_member',
];

// QRコード発行
app.post('/issue', async (c) => {
  const body = await c.req.json<{
    target_type: 'role' | 'instructor';
    role?: string;
    instructor_id?: number;
    hours?: number;
    created_by?: string;
  }>();

  const hours = body.hours && body.hours > 0 ? body.hours : 24;
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const token = generateRegQrToken();

  if (body.target_type === 'role') {
    if (!body.role || !VALID_ROLES.includes(body.role)) {
      return c.json({ error: '不正なロールです' }, 400);
    }
    await c.env.DB.prepare(
      `INSERT INTO line_reg_qrcodes (token, target_type, role, expires_at, created_by)
       VALUES (?, 'role', ?, ?, ?)`
    ).bind(token, body.role, expiresAt, body.created_by ?? null).run();
  } else if (body.target_type === 'instructor') {
    if (!body.instructor_id) return c.json({ error: '班長・指導者を選択してください' }, 400);
    const inst = await c.env.DB.prepare(
      'SELECT id FROM instructors WHERE id = ? AND is_active = 1'
    ).bind(body.instructor_id).first();
    if (!inst) return c.json({ error: '指定された班長・指導者が見つかりません' }, 404);

    await c.env.DB.prepare(
      `INSERT INTO line_reg_qrcodes (token, target_type, instructor_id, expires_at, created_by)
       VALUES (?, 'instructor', ?, ?, ?)`
    ).bind(token, body.instructor_id, expiresAt, body.created_by ?? null).run();
  } else {
    return c.json({ error: '不正なリクエストです' }, 400);
  }

  return c.json({ ok: true, token, expires_at: expiresAt, qr_svg: tokenToQrSvg(token) });
});

// QRコード失効
app.delete('/:token', async (c) => {
  const token = c.req.param('token');
  await c.env.DB.prepare('DELETE FROM line_reg_qrcodes WHERE token = ?').bind(token).run();
  return c.json({ ok: true });
});

export default app;
