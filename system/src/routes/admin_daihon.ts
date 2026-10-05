// 台本（板橋ページ「台本」タブ）— スライド＋台本デッキ
//   ページ : /daihon/:id            編集（settings.study-sessions[.edit]）
//            /daihon/:id/present     全画面プレゼン（settings.study-sessions で閲覧可）
//            /daihon/:id/print       印刷（台本つき）
//            /daihon/:id/pdf         PDF保存用（スライドのみ・16:9）
//            /daihon/img/*           写真スライドの画像（R2: DOCUMENTS_BUCKET の daihon/ 配下）
//            /daihon/flyer/:id       ビラ（A4縦1枚）の編集、/daihon/flyer/:id/print で印刷・PDF（daihon_flyers・migration_171）
//   API    : /api/daihon/*           書き込みは settings.study-sessions.edit（またはフル権限）
//   一覧は /settings/study-sessions の「台本」タブが /api/daihon/decks を呼んで描画する。
//   権限は permissions.ts の PATH_PERMISSIONS で /daihon・/api/daihon → settings.study-sessions にマッピング。
//   既存機能とはテーブル非共有の完全新規（daihon_*・migration_139）。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { ADMIN_PATH } from '../config';
import { layout } from '../html/layout';
import { getAdminPermissions } from '../permissions';
import {
  daihonEditPage, daihonPresentPage, daihonPrintPage, daihonPdfPage, slideImages,
  normLayout, normAccent,
  type DaihonDeck, type DaihonSlide,
} from '../html/daihon';
import { daihonFlyerEditPage, daihonFlyerPrintPage, normalizeFlyer, type DaihonFlyer } from '../html/daihon_flyer';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('settings.study-sessions.edit') || perms.includes('settings.daihon.edit');
}
function requireEdit(c: { json: (b: unknown, s: 403) => Response }, editable: boolean): Response | null {
  return editable ? null : c.json({ error: 'この操作を行う権限がありません' }, 403);
}
async function username(db: D1Database, adminId: number): Promise<string> {
  const row = await db.prepare('SELECT username FROM admins WHERE id = ?').bind(adminId).first<{ username: string }>();
  return row?.username ?? '';
}

async function loadDeck(db: D1Database, id: number): Promise<DaihonDeck | null> {
  return await db.prepare('SELECT * FROM daihon_decks WHERE id = ?').bind(id).first<DaihonDeck>();
}
async function loadSlides(db: D1Database, deckId: number): Promise<DaihonSlide[]> {
  const r = await db.prepare('SELECT * FROM daihon_slides WHERE deck_id = ? ORDER BY sort_order, id').bind(deckId).all<DaihonSlide>();
  return r.results ?? [];
}
async function renumber(db: D1Database, orderedIds: number[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await db.prepare('UPDATE daihon_slides SET sort_order = ? WHERE id = ?').bind(i, orderedIds[i]).run();
  }
}
async function deleteImages(env: Env, keys: string[]): Promise<void> {
  for (const k of keys) await env.DOCUMENTS_BUCKET.delete(k).catch(() => {});
}
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;

function S(v: unknown, max: number): string {
  return String(v ?? '').replace(/\r\n/g, '\n').slice(0, max);
}

// =====================  ページ: ビラ  =====================
async function loadFlyer(db: D1Database, id: number): Promise<DaihonFlyer | null> {
  return await db.prepare('SELECT * FROM daihon_flyers WHERE id = ?').bind(id).first<DaihonFlyer>();
}
app.get('/daihon/flyer/:id', async (c) => {
  const editable = await canEdit(c);
  const f = await loadFlyer(c.env.DB, parseInt(c.req.param('id'), 10));
  if (!f) return c.html(layout('ビラ', '<p style="padding:20px;">ビラが見つかりません。<a href="' + ADMIN_PATH + '/settings/study-sessions?tab=script">一覧へ戻る</a></p>', 'office-page'), 404);
  return c.html(layout(`${f.title} ― ビラ編集`, daihonFlyerEditPage(f, ADMIN_PATH, editable), 'office-page'));
});
app.get('/daihon/flyer/:id/print', async (c) => {
  const f = await loadFlyer(c.env.DB, parseInt(c.req.param('id'), 10));
  if (!f) return c.text('ビラが見つかりません', 404);
  return c.html(daihonFlyerPrintPage(f, c.req.query('preview') === '1'));
});

// =====================  ページ  =====================
app.get('/daihon/:id', async (c) => {
  const editable = await canEdit(c);
  const id = parseInt(c.req.param('id'), 10);
  const deck = await loadDeck(c.env.DB, id);
  if (!deck) return c.html(layout('台本', '<p style="padding:20px;">台本が見つかりません。<a href="' + ADMIN_PATH + '/settings/study-sessions?tab=script">一覧へ戻る</a></p>', 'office-page'), 404);
  const slides = await loadSlides(c.env.DB, id);
  return c.html(layout(`${deck.title} ― 台本編集`, daihonEditPage(deck, slides, ADMIN_PATH, editable), 'office-page'));
});

app.get('/daihon/:id/present', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const deck = await loadDeck(c.env.DB, id);
  if (!deck) return c.text('台本が見つかりません', 404);
  const slides = await loadSlides(c.env.DB, id);
  return c.html(daihonPresentPage(deck, slides));
});

app.get('/daihon/:id/print', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const deck = await loadDeck(c.env.DB, id);
  if (!deck) return c.text('台本が見つかりません', 404);
  const slides = await loadSlides(c.env.DB, id);
  return c.html(daihonPrintPage(deck, slides));
});

app.get('/daihon/:id/pdf', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const deck = await loadDeck(c.env.DB, id);
  if (!deck) return c.text('台本が見つかりません', 404);
  const slides = await loadSlides(c.env.DB, id);
  return c.html(daihonPdfPage(deck, slides));
});

app.get('/daihon/img/*', async (c) => {
  const rest = c.req.path.split('/daihon/img/')[1] ?? '';
  if (!/^[\w./-]+$/.test(rest) || rest.includes('..')) return c.text('Not found', 404);
  const obj = await c.env.DOCUMENTS_BUCKET.get('daihon/' + rest);
  if (!obj) return c.text('Not found', 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'private, max-age=86400',
    },
  });
});

// =====================  API: デッキ  =====================
app.get('/api/daihon/decks', async (c) => {
  const editable = await canEdit(c);
  const r = await c.env.DB.prepare(
    `SELECT d.*, (SELECT COUNT(*) FROM daihon_slides s WHERE s.deck_id = d.id) AS slide_count
       FROM daihon_decks d ORDER BY d.sort_order, d.id`
  ).all<DaihonDeck & { slide_count: number }>();
  return c.json({ editable, decks: r.results ?? [] });
});

app.post('/api/daihon/decks', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = S(body.title, 120).trim();
  if (!title) return c.json({ error: 'タイトルを入力してください' }, 400);
  const maxRow = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM daihon_decks').first<{ m: number }>();
  const ins = await c.env.DB.prepare(
    'INSERT INTO daihon_decks (title, subtitle, speaker, intro, sort_order, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    title, S(body.subtitle, 160), S(body.speaker, 80), S(body.intro, 600),
    (maxRow?.m ?? -1) + 1, await username(c.env.DB, c.get('adminId')),
  ).run();
  const deckId = Number(ins.meta.last_row_id);
  // 使い始めやすいよう表紙を1枚だけ用意
  await c.env.DB.prepare(
    "INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle) VALUES (?, 0, 'cover', 'blue', ?, ?)"
  ).bind(deckId, title, S(body.subtitle, 160)).run();
  return c.json({ ok: true, id: deckId });
});

app.patch('/api/daihon/decks/:id', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  const deck = await loadDeck(c.env.DB, id);
  if (!deck) return c.json({ error: '見つかりません' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields: string[] = [];
  const vals: unknown[] = [];
  if ('title' in body) {
    const t = S(body.title, 120).trim();
    if (!t) return c.json({ error: 'タイトルは空にできません' }, 400);
    fields.push('title = ?'); vals.push(t);
  }
  if ('subtitle' in body) { fields.push('subtitle = ?'); vals.push(S(body.subtitle, 160)); }
  if ('speaker' in body) { fields.push('speaker = ?'); vals.push(S(body.speaker, 80)); }
  if ('intro' in body) { fields.push('intro = ?'); vals.push(S(body.intro, 600)); }
  if (!fields.length) return c.json({ error: '更新項目がありません' }, 400);
  fields.push("updated_at = datetime('now','localtime')");
  vals.push(id);
  await c.env.DB.prepare(`UPDATE daihon_decks SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/api/daihon/decks/:id', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  const all = await loadSlides(c.env.DB, id);
  await deleteImages(c.env, all.flatMap((s) => slideImages(s)));
  await c.env.DB.prepare('DELETE FROM daihon_slides WHERE deck_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM daihon_decks WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// =====================  API: ビラ  =====================
app.get('/api/daihon/flyers', async (c) => {
  const r = await c.env.DB.prepare('SELECT id, title, updated_at FROM daihon_flyers ORDER BY sort_order, id').all<{ id: number; title: string; updated_at: string }>();
  return c.json({ editable: await canEdit(c), flyers: r.results ?? [] });
});

app.post('/api/daihon/flyers', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = S(body.title, 120).trim();
  if (!title) return c.json({ error: '名前を入力してください' }, 400);
  const maxRow = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM daihon_flyers').first<{ m: number }>();
  const data = normalizeFlyer({ headline: title });
  const ins = await c.env.DB.prepare(
    'INSERT INTO daihon_flyers (title, data, sort_order, created_by) VALUES (?, ?, ?, ?)'
  ).bind(title, JSON.stringify(data), (maxRow?.m ?? -1) + 1, await username(c.env.DB, c.get('adminId'))).run();
  return c.json({ ok: true, id: Number(ins.meta.last_row_id) });
});

app.patch('/api/daihon/flyers/:id', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  if (!(await loadFlyer(c.env.DB, id))) return c.json({ error: '見つかりません' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = S(body.title, 120).trim();
  if (!title) return c.json({ error: '名前は空にできません' }, 400);
  await c.env.DB.prepare(
    "UPDATE daihon_flyers SET title = ?, data = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  ).bind(title, JSON.stringify(normalizeFlyer(body.data)), id).run();
  return c.json({ ok: true });
});

app.delete('/api/daihon/flyers/:id', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  await c.env.DB.prepare('DELETE FROM daihon_flyers WHERE id = ?').bind(parseInt(c.req.param('id'), 10)).run();
  return c.json({ ok: true });
});

// =====================  API: スライド  =====================
app.post('/api/daihon/decks/:id/slides', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const deckId = parseInt(c.req.param('id'), 10);
  const deck = await loadDeck(c.env.DB, deckId);
  if (!deck) return c.json({ error: '台本が見つかりません' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const ins = await c.env.DB.prepare(
    'INSERT INTO daihon_slides (deck_id, sort_order, layout, accent, title, subtitle, body, notes) VALUES (?, 9999, ?, ?, ?, ?, ?, ?)'
  ).bind(
    deckId, normLayout(body.layout), normAccent(body.accent),
    S(body.title, 120), S(body.subtitle, 160), S(body.body, 4000), S(body.notes, 4000),
  ).run();
  const newId = Number(ins.meta.last_row_id);

  const ordered = await loadSlides(c.env.DB, deckId);
  const arr = ordered.map((s) => s.id).filter((sid) => sid !== newId);
  const after = /^\d+$/.test(String(body.after ?? '')) ? parseInt(String(body.after), 10) : null;
  const pos = after != null && arr.indexOf(after) >= 0 ? arr.indexOf(after) + 1 : arr.length;
  arr.splice(pos, 0, newId);
  await renumber(c.env.DB, arr);
  return c.json({ ok: true, id: newId });
});

app.patch('/api/daihon/slides/:id', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  const found = await c.env.DB.prepare('SELECT id FROM daihon_slides WHERE id = ?').bind(id).first<{ id: number }>();
  if (!found) return c.json({ error: 'スライドが見つかりません' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields: string[] = [];
  const vals: unknown[] = [];
  if ('layout' in body) { fields.push('layout = ?'); vals.push(normLayout(body.layout)); }
  if ('accent' in body) { fields.push('accent = ?'); vals.push(normAccent(body.accent)); }
  if ('title' in body) { fields.push('title = ?'); vals.push(S(body.title, 120)); }
  if ('subtitle' in body) { fields.push('subtitle = ?'); vals.push(S(body.subtitle, 160)); }
  if ('body' in body) { fields.push('body = ?'); vals.push(S(body.body, 4000)); }
  if ('notes' in body) { fields.push('notes = ?'); vals.push(S(body.notes, 4000)); }
  if (!fields.length) return c.json({ error: '更新項目がありません' }, 400);
  vals.push(id);
  await c.env.DB.prepare(`UPDATE daihon_slides SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/api/daihon/slides/:id', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  const row = await c.env.DB.prepare('SELECT deck_id, images FROM daihon_slides WHERE id = ?').bind(id).first<{ deck_id: number; images: string }>();
  if (!row) return c.json({ error: '見つかりません' }, 404);
  await deleteImages(c.env, slideImages(row));
  await c.env.DB.prepare('DELETE FROM daihon_slides WHERE id = ?').bind(id).run();
  const ordered = await loadSlides(c.env.DB, row.deck_id);
  await renumber(c.env.DB, ordered.map((s) => s.id));
  return c.json({ ok: true });
});

// 写真スライドに画像を1枚追加（本文は画像のバイナリそのもの。クライアント側で縮小済み）
app.post('/api/daihon/slides/:id/images', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  const row = await c.env.DB.prepare('SELECT id, images FROM daihon_slides WHERE id = ?').bind(id).first<{ id: number; images: string }>();
  if (!row) return c.json({ error: 'スライドが見つかりません' }, 404);
  const keys = slideImages(row);
  if (keys.length >= 4) return c.json({ error: '写真は1枚のスライドに4枚までです' }, 400);
  const type = (c.req.header('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const ext = IMAGE_TYPES[type];
  if (!ext) return c.json({ error: 'JPEG・PNG・WebP・GIFの画像を選んでください' }, 400);
  const buf = await c.req.arrayBuffer();
  if (!buf.byteLength) return c.json({ error: '画像が空です' }, 400);
  if (buf.byteLength > IMAGE_MAX_BYTES) return c.json({ error: '画像が大きすぎます（8MBまで）' }, 400);
  const key = `daihon/${id}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await c.env.DOCUMENTS_BUCKET.put(key, buf, { httpMetadata: { contentType: type } });
  keys.push(key);
  await c.env.DB.prepare('UPDATE daihon_slides SET images = ? WHERE id = ?').bind(JSON.stringify(keys), id).run();
  return c.json({ ok: true, key });
});

app.delete('/api/daihon/slides/:id/images', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  const key = c.req.query('key') || '';
  const row = await c.env.DB.prepare('SELECT id, images FROM daihon_slides WHERE id = ?').bind(id).first<{ id: number; images: string }>();
  if (!row) return c.json({ error: 'スライドが見つかりません' }, 404);
  const keys = slideImages(row);
  if (!keys.includes(key)) return c.json({ error: '写真が見つかりません' }, 404);
  await deleteImages(c.env, [key]);
  await c.env.DB.prepare('UPDATE daihon_slides SET images = ? WHERE id = ?').bind(JSON.stringify(keys.filter((k) => k !== key)), id).run();
  return c.json({ ok: true });
});

app.post('/api/daihon/slides/:id/move', async (c) => {
  const denied = requireEdit(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  const row = await c.env.DB.prepare('SELECT deck_id FROM daihon_slides WHERE id = ?').bind(id).first<{ deck_id: number }>();
  if (!row) return c.json({ error: '見つかりません' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const dir = body.dir === 'up' ? 'up' : body.dir === 'down' ? 'down' : null;
  if (!dir) return c.json({ error: 'dir が不正です' }, 400);
  const arr = (await loadSlides(c.env.DB, row.deck_id)).map((s) => s.id);
  const i = arr.indexOf(id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= arr.length) return c.json({ ok: true });
  [arr[i], arr[j]] = [arr[j], arr[i]];
  await renumber(c.env.DB, arr);
  return c.json({ ok: true });
});

export default app;
