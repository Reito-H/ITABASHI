// Web内お知らせ（右上ベルマーク）API
// 送信（/api/line/announcements）とは異なり、閲覧・既読化は権限に関わらず全管理アカウント共通で利用可能
import { Hono } from 'hono';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

type AnnouncementRow = {
  id: number; title: string; message: string; created_at: string;
};

// 未読件数
app.get('/unread-count', async (c) => {
  const adminId = c.get('adminId');
  const row = await c.env.DB.prepare(`
    SELECT COUNT(*) AS n FROM announcements a
    WHERE a.channel IN ('web', 'both')
      AND NOT EXISTS (SELECT 1 FROM admin_announcement_reads r WHERE r.admin_id = ? AND r.announcement_id = a.id)
  `).bind(adminId).first<{ n: number }>();
  return c.json({ count: row?.n ?? 0 });
});

// 最新一覧（既読フラグ付き）
app.get('/list', async (c) => {
  const adminId = c.get('adminId');
  const rows = await c.env.DB.prepare(`
    SELECT a.id, a.title, a.message, a.created_at,
      CASE WHEN r.admin_id IS NULL THEN 0 ELSE 1 END AS is_read
    FROM announcements a
    LEFT JOIN admin_announcement_reads r ON r.admin_id = ? AND r.announcement_id = a.id
    WHERE a.channel IN ('web', 'both')
    ORDER BY a.created_at DESC
    LIMIT 30
  `).bind(adminId).all<AnnouncementRow & { is_read: number }>();
  return c.json({
    announcements: (rows.results ?? []).map(r => ({
      id: r.id, title: r.title, message: r.message, created_at: r.created_at, read: r.is_read === 1,
    })),
  });
});

// 現在Web向けお知らせをすべて既読化
app.post('/mark-read', async (c) => {
  const adminId = c.get('adminId');
  const rows = await c.env.DB.prepare(
    `SELECT id FROM announcements WHERE channel IN ('web', 'both')`
  ).all<{ id: number }>();
  const ids = (rows.results ?? []).map(r => r.id);
  for (const id of ids) {
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO admin_announcement_reads (admin_id, announcement_id) VALUES (?, ?)'
    ).bind(adminId, id).run();
  }
  return c.json({ ok: true });
});

export default app;
