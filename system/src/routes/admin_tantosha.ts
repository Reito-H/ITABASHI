// 担当車表（班ごとの車両担当者一覧表）
// ページ: /tantosha（編集グリッド） /tantosha/print?group=ID（印刷用）
// API   : /api/tantosha/*（管理パス配下。編集系は権限ミドルウェアで <tantosha.edit> 必須）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import {
  tantoshaPage, tantoshaPrintPage,
  type TantoshaGroup, type TantoshaRow, type TantoshaSide, type TantoshaGroupData,
} from '../html/tantosha';
import { getAdminPermissions } from '../permissions';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<{ id: number; name: string }> {
  const id = c.get('adminId');
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(id).first<{ username: string }>();
  return { id, name: row?.username ?? `id:${id}` };
}

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('tantosha.edit');
}

async function loadGroups(db: D1Database): Promise<TantoshaGroupData[]> {
  const [groups, rows, side] = await Promise.all([
    db.prepare('SELECT * FROM tantosha_groups WHERE is_active = 1 ORDER BY sort_order, id').all<TantoshaGroup>(),
    db.prepare('SELECT * FROM tantosha_rows ORDER BY group_id, sort_order, id').all<TantoshaRow & { group_id: number }>(),
    db.prepare('SELECT * FROM tantosha_side ORDER BY group_id, sort_order, id').all<TantoshaSide & { group_id: number }>(),
  ]);
  return (groups.results ?? []).map(g => ({
    ...g,
    rows: (rows.results ?? []).filter(r => r.group_id === g.id),
    side: (side.results ?? []).filter(s => s.group_id === g.id),
  }));
}

// ===== ページ =====
app.get('/tantosha', async (c) => {
  const groups = await loadGroups(c.env.DB);
  const editable = await canEdit(c);
  return c.html(layout('担当車表', tantoshaPage(groups, editable), 'tantosha'));
});

app.get('/tantosha/print', async (c) => {
  const id = parseInt(c.req.query('group') ?? '');
  const groups = await loadGroups(c.env.DB);
  const group = groups.find(g => g.id === id) ?? groups[0];
  if (!group) return c.text('班が登録されていません', 404);
  return c.html(tantoshaPrintPage(group));
});

// ===== API =====
const S = (v: unknown, max = 40): string => String(v ?? '').slice(0, max);

// 一括保存（班の本表・付帯リスト・メタを丸ごと置き換え）
app.post('/api/tantosha/groups/:id/save', async (c) => {
  const id = parseInt(c.req.param('id'));
  const group = await c.env.DB.prepare('SELECT id, name FROM tantosha_groups WHERE id = ?').bind(id).first<{ id: number; name: string }>();
  if (!group) return c.json({ error: '班が見つかりません' }, 404);

  const b = await c.req.json<{ name?: string; month_label?: string; note?: string; rows?: TantoshaRow[]; side?: TantoshaSide[] }>();
  const rows = Array.isArray(b.rows) ? b.rows : [];
  const side = Array.isArray(b.side) ? b.side : [];
  if (rows.length > 300 || side.length > 300) return c.json({ error: '行数が多すぎます（各300行まで）' }, 400);
  const name = S(b.name, 20).trim() || group.name;

  const stmts = [
    c.env.DB.prepare(`UPDATE tantosha_groups SET name = ?, month_label = ?, note = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
      .bind(name, S(b.month_label, 20), S(b.note, 60), id),
    c.env.DB.prepare('DELETE FROM tantosha_rows WHERE group_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM tantosha_side WHERE group_id = ?').bind(id),
  ];
  rows.forEach((r, i) => {
    stmts.push(c.env.DB.prepare(
      `INSERT INTO tantosha_rows (group_id, sort_order, shift, door, row_color,
         p1_letter, p1_name, p1_badge, p1_color, p1_hl,
         p2_letter, p2_name, p2_badge, p2_color, p2_hl,
         r_letter, r_name, r_badge, r_color, r_hl)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, (i + 1) * 10, S(r.shift, 10), S(r.door, 10), S(r.row_color, 10),
      S(r.p1_letter, 4), S(r.p1_name), S(r.p1_badge, 10), S(r.p1_color, 10), S(r.p1_hl, 10),
      S(r.p2_letter, 4), S(r.p2_name), S(r.p2_badge, 10), S(r.p2_color, 10), S(r.p2_hl, 10),
      S(r.r_letter, 4), S(r.r_name), S(r.r_badge, 10), S(r.r_color, 10), S(r.r_hl, 10)));
  });
  side.forEach((s, i) => {
    stmts.push(c.env.DB.prepare(
      'INSERT INTO tantosha_side (group_id, section, sort_order, col1, col2, name, badge, color, hl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, S(s.section, 20) || 'その他', (i + 1) * 10,
      S(s.col1, 4), S(s.col2, 10), S(s.name), S(s.badge, 10), S(s.color, 10), S(s.hl, 10)));
  });

  const { id: adminId, name: opName } = await adminName(c);
  stmts.push(c.env.DB.prepare(
    'INSERT INTO tantosha_edit_logs (admin_id, admin_name, action, target, detail) VALUES (?, ?, ?, ?, ?)'
  ).bind(adminId, opName, 'save', name, `本表${rows.length}行 / 付帯${side.length}行を保存`));

  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// 班の追加
app.post('/api/tantosha/groups', async (c) => {
  const b = await c.req.json<{ name?: string }>();
  const name = S(b.name, 20).trim();
  if (!name) return c.json({ error: '班名を入力してください' }, 400);
  const max = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM tantosha_groups').first<{ m: number }>();
  await c.env.DB.prepare('INSERT INTO tantosha_groups (name, sort_order) VALUES (?, ?)').bind(name, (max?.m ?? 0) + 10).run();
  const { id: adminId, name: opName } = await adminName(c);
  await c.env.DB.prepare(
    'INSERT INTO tantosha_edit_logs (admin_id, admin_name, action, target, detail) VALUES (?, ?, ?, ?, ?)'
  ).bind(adminId, opName, 'group_add', name, '班を追加').run();
  return c.json({ ok: true });
});

// 班の削除（本表・付帯リストごと）
app.delete('/api/tantosha/groups/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const group = await c.env.DB.prepare('SELECT name FROM tantosha_groups WHERE id = ?').bind(id).first<{ name: string }>();
  if (!group) return c.json({ error: '班が見つかりません' }, 404);
  const { id: adminId, name: opName } = await adminName(c);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM tantosha_rows WHERE group_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM tantosha_side WHERE group_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM tantosha_groups WHERE id = ?').bind(id),
    c.env.DB.prepare('INSERT INTO tantosha_edit_logs (admin_id, admin_name, action, target, detail) VALUES (?, ?, ?, ?, ?)')
      .bind(adminId, opName, 'group_delete', group.name, '班を削除'),
  ]);
  return c.json({ ok: true });
});

// 編集履歴
app.get('/api/tantosha/logs', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '100') || 100, 500);
  const rows = await c.env.DB.prepare(
    'SELECT admin_name, action, target, detail, created_at FROM tantosha_edit_logs ORDER BY id DESC LIMIT ?'
  ).bind(limit).all();
  return c.json({ logs: rows.results ?? [] });
});

export default app;
