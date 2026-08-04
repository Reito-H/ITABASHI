// 要望欄 API
// POST: 誰でも投稿可（ルートAPI書き込み権限 requests.edit・permissions.ts参照）
// PATCH/DELETE: 収集一覧の管理操作のためフル権限admin（permissions=NULL）のみ許可
import { Hono } from 'hono';
import type { Env } from '../../auth';
import { getAdminPermissions } from '../../permissions';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const CATEGORIES = ['機能追加', '不具合', '使いにくい点', 'その他'];
const STATUSES = ['未対応', '確認済み', '対応済み'];

type RequestRow = {
  id: number; admin_id: number; admin_name: string;
  category: string; content: string; status: string;
  created_at: string; updated_at: string;
};

async function getUsername(db: D1Database, adminId: number): Promise<string> {
  const row = await db.prepare('SELECT username FROM admins WHERE id = ?').bind(adminId).first<{ username: string }>();
  return row?.username ?? `id:${adminId}`;
}

// 統括管理者への即時通知
async function notifyGeneralManagers(env: Env, text: string): Promise<void> {
  const token = env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return;
  const rows = await env.DB.prepare(
    "SELECT line_uid FROM line_liff_users WHERE role = 'general_manager'"
  ).all<{ line_uid: string }>();
  const uids = (rows.results ?? []).map(r => r.line_uid).slice(0, 500);
  if (uids.length === 0) return;
  await fetch('https://api.line.me/v2/bot/message/multicast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: uids, messages: [{ type: 'text', text }] }),
  });
}

// 一覧: フル権限adminは全件、制限付きアカウントは自分の投稿のみ
app.get('/', async (c) => {
  const adminId = c.get('adminId');
  const perms = await getAdminPermissions(c.env.DB, adminId);
  const rows = perms === null
    ? await c.env.DB.prepare('SELECT * FROM feature_requests ORDER BY created_at DESC').all<RequestRow>()
    : await c.env.DB.prepare('SELECT * FROM feature_requests WHERE admin_id = ? ORDER BY created_at DESC').bind(adminId).all<RequestRow>();
  return c.json(rows.results ?? []);
});

// 投稿
app.post('/', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const category = String(body.category ?? '').trim();
  const content = String(body.content ?? '').trim();
  if (!content) return c.json({ error: '要望の内容を入力してください' }, 400);
  if (!CATEGORIES.includes(category)) return c.json({ error: 'カテゴリを選択してください' }, 400);

  const adminId = c.get('adminId');
  const adminName = await getUsername(c.env.DB, adminId);

  await c.env.DB.prepare(
    'INSERT INTO feature_requests (admin_id, admin_name, category, content) VALUES (?, ?, ?, ?)'
  ).bind(adminId, adminName, category, content).run();

  const text = `【要望】${category}\n投稿者: ${adminName}\n\n${content}`;
  c.executionCtx.waitUntil(notifyGeneralManagers(c.env, text));

  return c.json({ ok: true });
});

// ステータス更新（フル権限adminのみ）
app.patch('/:id', async (c) => {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  if (perms !== null) return c.json({ error: 'この操作を行う権限がありません' }, 403);

  const id = parseInt(c.req.param('id'), 10);
  const body = await c.req.json().catch(() => ({}));
  const status = String(body.status ?? '');
  if (!STATUSES.includes(status)) return c.json({ error: '不正なステータスです' }, 400);

  await c.env.DB.prepare(
    "UPDATE feature_requests SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  ).bind(status, id).run();

  return c.json({ ok: true });
});

// 削除（フル権限adminのみ）
app.delete('/:id', async (c) => {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  if (perms !== null) return c.json({ error: 'この操作を行う権限がありません' }, 403);

  const id = parseInt(c.req.param('id'), 10);
  await c.env.DB.prepare('DELETE FROM feature_requests WHERE id = ?').bind(id).run();

  return c.json({ ok: true });
});

export default app;
