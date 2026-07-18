import { Hono } from 'hono';
import { generateInviteCode } from '../../auth';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

async function lineMulticast(token: string, uids: string[], messages: object[]): Promise<void> {
  const batches: string[][] = [];
  for (let i = 0; i < uids.length; i += 500) batches.push(uids.slice(i, i + 500));
  const results = await Promise.allSettled(batches.map(batch =>
    fetch('https://api.line.me/v2/bot/message/multicast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: batch, messages })
    }).then(res => { if (!res.ok) throw new Error(`LINE multicast failed: ${res.status}`); })
  ));
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) console.error(`LINE multicast: ${failed.length}/${batches.length} batches failed`, failed);
}

// 招待コード発行
app.post('/invite', async (c) => {
  const { emp_id } = await c.req.json<{ emp_id: number }>();
  if (!emp_id) return c.json({ error: '社員IDが必要です' }, 400);

  // 社員存在確認
  const emp = await c.env.DB.prepare('SELECT id FROM employees WHERE id = ? AND is_active = 1').bind(emp_id).first();
  if (!emp) return c.json({ error: '社員が見つかりません' }, 404);

  const code = generateInviteCode();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await c.env.DB.prepare(
    'INSERT INTO invite_codes (code, emp_id, expires_at) VALUES (?, ?, ?)'
  ).bind(code, emp_id, expiresAt).run();

  return c.json({ ok: true, code, expires_at: expiresAt });
});

// 招待コード削除
app.delete('/invite/:code', async (c) => {
  const code = c.req.param('code');
  await c.env.DB.prepare('DELETE FROM invite_codes WHERE code = ?').bind(code).run();
  return c.json({ ok: true });
});

// お知らせ配信履歴
app.get('/announcements', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50'
  ).all<{ id: number; title: string; message: string; target_type: string; target_data: string; sent_count: number; created_at: string }>();
  return c.json({ announcements: rows.results ?? [] });
});

// お知らせ一括配信
app.post('/announcements', async (c) => {
  const { title, message, target_type, target_data } = await c.req.json<{
    title: string; message: string; target_type: string; target_data?: string;
  }>();
  if (!title || !message) return c.json({ error: 'タイトルと本文が必要です' }, 400);
  if (!c.env.LINE_CHANNEL_ACCESS_TOKEN) return c.json({ error: 'LINE未設定' }, 500);

  let uids: string[] = [];

  if (target_type === 'all') {
    const rows = await c.env.DB.prepare('SELECT line_uid FROM line_users').all<{ line_uid: string }>();
    uids = (rows.results ?? []).map(u => u.line_uid);
  } else if (target_type === 'entry_month' && target_data) {
    const rows = await c.env.DB.prepare(`
      SELECT lu.line_uid FROM line_users lu
      JOIN employees e ON lu.emp_id = e.id
      WHERE e.hire_date LIKE ? AND e.is_active = 1
    `).bind(`${target_data}%`).all<{ line_uid: string }>();
    uids = (rows.results ?? []).map(u => u.line_uid);
  } else if (target_type === 'individual' && target_data) {
    const empIds = target_data.split(',').map(s => parseInt(s.trim())).filter(Boolean);
    if (empIds.length > 0) {
      const placeholders = empIds.map(() => '?').join(',');
      const rows = await c.env.DB.prepare(
        `SELECT line_uid FROM line_users WHERE emp_id IN (${placeholders})`
      ).bind(...empIds).all<{ line_uid: string }>();
      uids = (rows.results ?? []).map(r => r.line_uid);
    }
  } else if (target_type === 'liff' && target_data) {
    // LINE連携者（line_liff_users）: target_dataはカンマ区切りのline_liff_users.id
    const liffIds = target_data.split(',').map(s => parseInt(s.trim())).filter(Boolean);
    if (liffIds.length > 0) {
      const placeholders = liffIds.map(() => '?').join(',');
      const rows = await c.env.DB.prepare(
        `SELECT line_uid FROM line_liff_users WHERE id IN (${placeholders}) AND role != 'unknown'`
      ).bind(...liffIds).all<{ line_uid: string }>();
      uids = (rows.results ?? []).map(r => r.line_uid);
    }
  }

  uids = [...new Set(uids)];

  if (uids.length === 0) {
    await c.env.DB.prepare(
      'INSERT INTO announcements (title, message, target_type, target_data, sent_count) VALUES (?, ?, ?, ?, 0)'
    ).bind(title, message, target_type, target_data ?? null).run();
    return c.json({ ok: true, sent: 0, warning: '送信対象のLINE紐付き社員がいません' });
  }

  const lineMessage = [{ type: 'text', text: `📢 ${title}\n\n${message}` }];
  await lineMulticast(c.env.LINE_CHANNEL_ACCESS_TOKEN, uids, lineMessage);

  await c.env.DB.prepare(
    'INSERT INTO announcements (title, message, target_type, target_data, sent_count) VALUES (?, ?, ?, ?, ?)'
  ).bind(title, message, target_type, target_data ?? null, uids.length).run();

  return c.json({ ok: true, sent: uids.length });
});

// アンケート一斉配信
app.post('/survey', async (c) => {
  const { title, url } = await c.req.json<{ title: string; url: string }>();
  if (!title || !url) return c.json({ error: 'タイトルとURLが必要です' }, 400);
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error();
  } catch {
    return c.json({ error: '有効なURLを入力してください' }, 400);
  }
  if (!c.env.LINE_CHANNEL_ACCESS_TOKEN) return c.json({ error: 'LINE未設定' }, 500);

  // 紐付け済みユーザー全員に送信
  const users = await c.env.DB.prepare('SELECT line_uid FROM line_users').all<{ line_uid: string }>();

  await c.env.DB.prepare(
    'INSERT INTO survey_logs (title, url, target_type) VALUES (?, ?, ?)'
  ).bind(title, url, 'all').run();

  const messages = [
    { type: 'text', text: `📋 アンケートのお願い\n\n「${title}」\n\nご回答をお願いします。\n${url}` }
  ];

  const uids = (users.results ?? []).map(u => u.line_uid);
  await lineMulticast(c.env.LINE_CHANNEL_ACCESS_TOKEN, uids, messages);

  return c.json({ ok: true, sent: uids.length });
});

export default app;
