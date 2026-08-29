// 車庫見取り図（駐車場所の記録）
// ページ: /garage（左サイドバー「便利」ハブ配下）
// 閲覧: 管理画面アカウントなら誰でも可（index.ts でページ権限チェックを免除・便利/CC名簿と同じ扱い）
// 編集: フル権限アカウント（admins.permissions IS NULL）のみ。各書き込みAPIで requireEdit により二重に防御する
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { garagePage, type GarageSlotRow, type GarageMarkerRow } from '../html/garage';
import { getAdminPermissions } from '../permissions';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<{ id: number; name: string }> {
  const id = c.get('adminId');
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(id).first<{ username: string }>();
  return { id, name: row?.username ?? `id:${id}` };
}

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null;
}

function requireEdit(c: { json: (body: unknown, status: 403) => Response }, editable: boolean): Response | null {
  if (!editable) return c.json({ error: 'この操作はフル権限アカウントのみ行えます' }, 403);
  return null;
}

const S = (v: unknown, max = 20): string => String(v ?? '').slice(0, max);

// ===== ページ =====
app.get('/garage', async (c) => {
  const editable = await canEdit(c);
  const [slots, markers] = await Promise.all([
    c.env.DB.prepare('SELECT section, slot_key, car_no FROM garage_slots').all<GarageSlotRow>(),
    c.env.DB.prepare('SELECT id, section, x, y, w, h, car_no FROM garage_markers').all<GarageMarkerRow>(),
  ]);
  return c.html(layout('車庫', garagePage(slots.results ?? [], markers.results ?? [], editable), 'benri'));
});

// ===== API =====

// 固定マスの車番を保存（空文字なら削除）
app.post('/api/garage/slot', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const b = await c.req.json<{ section?: string; slot_key?: string; car_no?: string }>();
  const section = S(b.section, 20);
  const slotKey = S(b.slot_key, 20);
  const carNo = S(b.car_no, 4).trim();
  if (!section || !slotKey) return c.json({ error: '不正なリクエストです' }, 400);

  const { id: adminId, name: opName } = await adminName(c);
  if (!carNo) {
    await c.env.DB.prepare('DELETE FROM garage_slots WHERE section = ? AND slot_key = ?').bind(section, slotKey).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO garage_slots (section, slot_key, car_no, updated_at, updated_by) VALUES (?, ?, ?, datetime('now','localtime'), ?)
       ON CONFLICT(section, slot_key) DO UPDATE SET car_no = excluded.car_no, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).bind(section, slotKey, carNo, opName).run();
  }
  await c.env.DB.prepare(
    'INSERT INTO garage_edit_logs (admin_id, admin_name, action, target, detail) VALUES (?, ?, ?, ?, ?)'
  ).bind(adminId, opName, 'slot', `${section}:${slotKey}`, carNo ? `車番${carNo}を記録` : '車番を削除').run();

  return c.json({ ok: true });
});

// 自由マーカーの作成
app.post('/api/garage/markers', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const b = await c.req.json<{ section?: string; x?: number; y?: number; w?: number; h?: number; car_no?: string }>();
  const section = S(b.section, 20);
  if (!section) return c.json({ error: '不正なリクエストです' }, 400);
  const x = Number.isFinite(b.x) ? Math.max(0, Math.min(100, b.x as number)) : 5;
  const y = Number.isFinite(b.y) ? Math.max(0, Math.min(100, b.y as number)) : 5;
  const w = Number.isFinite(b.w) ? Math.max(1, Math.min(50, b.w as number)) : 6;
  const h = Number.isFinite(b.h) ? Math.max(1, Math.min(50, b.h as number)) : 4;
  const carNo = S(b.car_no, 4).trim();

  const { id: adminId, name: opName } = await adminName(c);
  const result = await c.env.DB.prepare(
    `INSERT INTO garage_markers (section, x, y, w, h, car_no, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?)`
  ).bind(section, x, y, w, h, carNo, opName).run();
  await c.env.DB.prepare(
    'INSERT INTO garage_edit_logs (admin_id, admin_name, action, target, detail) VALUES (?, ?, ?, ?, ?)'
  ).bind(adminId, opName, 'marker_add', section, '車マーカーを追加').run();

  return c.json({ ok: true, id: result.meta.last_row_id });
});

// 自由マーカーの位置・車番を更新
app.put('/api/garage/markers/:id', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'));
  const marker = await c.env.DB.prepare('SELECT section FROM garage_markers WHERE id = ?').bind(id).first<{ section: string }>();
  if (!marker) return c.json({ error: 'マーカーが見つかりません' }, 404);

  const b = await c.req.json<{ x?: number; y?: number; car_no?: string }>();
  const sets: string[] = [];
  const params: unknown[] = [];
  if (Number.isFinite(b.x)) { sets.push('x = ?'); params.push(Math.max(0, Math.min(100, b.x as number))); }
  if (Number.isFinite(b.y)) { sets.push('y = ?'); params.push(Math.max(0, Math.min(100, b.y as number))); }
  if (typeof b.car_no === 'string') { sets.push('car_no = ?'); params.push(S(b.car_no, 4).trim()); }
  if (sets.length === 0) return c.json({ ok: true });
  sets.push(`updated_at = datetime('now','localtime')`);

  const { id: adminId, name: opName } = await adminName(c);
  sets.push('updated_by = ?');
  params.push(opName);
  params.push(id);
  await c.env.DB.prepare(`UPDATE garage_markers SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run();

  if (typeof b.car_no === 'string') {
    await c.env.DB.prepare(
      'INSERT INTO garage_edit_logs (admin_id, admin_name, action, target, detail) VALUES (?, ?, ?, ?, ?)'
    ).bind(adminId, opName, 'marker_update', marker.section, `車マーカーの車番を更新`).run();
  }
  return c.json({ ok: true });
});

// 自由マーカーの削除
app.delete('/api/garage/markers/:id', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'));
  const marker = await c.env.DB.prepare('SELECT section FROM garage_markers WHERE id = ?').bind(id).first<{ section: string }>();
  if (!marker) return c.json({ error: 'マーカーが見つかりません' }, 404);
  const { id: adminId, name: opName } = await adminName(c);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM garage_markers WHERE id = ?').bind(id),
    c.env.DB.prepare('INSERT INTO garage_edit_logs (admin_id, admin_name, action, target, detail) VALUES (?, ?, ?, ?, ?)')
      .bind(adminId, opName, 'marker_delete', marker.section, '車マーカーを削除'),
  ]);
  return c.json({ ok: true });
});

export default app;
