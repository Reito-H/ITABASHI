// デジタルサイネージ（営業所モニター用 周知スライド）
//   ページ : /signage                  デッキ一覧（全アカウント閲覧可）
//            /signage/:id               編集（フル権限アカウントのみ）
//            /signage/:id/present       投影・全画面（全アカウント）
//            /signage/:id/print         回線断時の保険・1面1ページ（全アカウント）
//   API    : /api/signage/*             書き込みはフル権限アカウント（admins.permissions IS NULL）のみ
//   閲覧の権限チェックは index.ts で免除（車庫・シャトルと同じ扱い）。
//   既存機能とはテーブル非共有の完全新規（signage_*）。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { ADMIN_PATH } from '../config';
import { layout } from '../html/layout';
import { getAdminPermissions } from '../permissions';
import {
  SIGNAGE_KINDS,
  signageListPage, signageEditPage, signagePresentPage, signagePrintPage,
  type SignageDeck, type SignageSlide,
} from '../html/signage';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const KIND_SET = new Set(SIGNAGE_KINDS.map((k) => k.kind));

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null;
}
function requireFull(c: { json: (b: unknown, s: 403) => Response }, editable: boolean): Response | null {
  return editable ? null : c.json({ error: 'この操作はフル権限アカウントのみ行えます' }, 403);
}
async function username(db: D1Database, adminId: number): Promise<string> {
  const row = await db.prepare('SELECT username FROM admins WHERE id = ?').bind(adminId).first<{ username: string }>();
  return row?.username ?? '';
}

async function loadDeck(db: D1Database, id: number): Promise<SignageDeck | null> {
  return await db.prepare('SELECT * FROM signage_decks WHERE id = ?').bind(id).first<SignageDeck>();
}
async function loadSlides(db: D1Database, deckId: number): Promise<SignageSlide[]> {
  const r = await db.prepare('SELECT * FROM signage_slides WHERE deck_id = ? ORDER BY sort_order, id').bind(deckId).all<SignageSlide>();
  return r.results ?? [];
}
async function renumber(db: D1Database, orderedIds: number[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await db.prepare('UPDATE signage_slides SET sort_order = ? WHERE id = ?').bind(i, orderedIds[i]).run();
  }
}
function cleanPayload(v: unknown): string {
  if (v === null || typeof v !== 'object') return '{}';
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    out[String(k).slice(0, 40)] = String(val ?? '').slice(0, 4000);
  }
  const s = JSON.stringify(out);
  return s.length > 100000 ? '{}' : s;
}

// =====================  ページ  =====================
app.get('/signage', async (c) => {
  const [editable, r] = await Promise.all([
    canEdit(c),
    c.env.DB.prepare('SELECT * FROM signage_decks ORDER BY sort_order, id').all<SignageDeck>(),
  ]);
  return c.html(layout('デジタルサイネージ', signageListPage(r.results ?? [], editable, ADMIN_PATH), 'settings'));
});

app.get('/signage/:id', async (c) => {
  if (!(await canEdit(c))) return c.redirect(`${ADMIN_PATH}/signage`);
  const id = parseInt(c.req.param('id'), 10);
  const deck = await loadDeck(c.env.DB, id);
  if (!deck) return c.html(layout('デジタルサイネージ', '<p style="padding:20px;">デッキが見つかりません。</p>', 'settings'), 404);
  const slides = await loadSlides(c.env.DB, id);
  return c.html(layout(`${deck.title} ― 編集`, signageEditPage(deck, slides, ADMIN_PATH), 'settings'));
});

app.get('/signage/:id/present', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const deck = await loadDeck(c.env.DB, id);
  if (!deck) return c.text('デッキが見つかりません', 404);
  const slides = await loadSlides(c.env.DB, id);
  return c.html(signagePresentPage(deck, slides));
});

app.get('/signage/:id/print', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const deck = await loadDeck(c.env.DB, id);
  if (!deck) return c.text('デッキが見つかりません', 404);
  const slides = await loadSlides(c.env.DB, id);
  return c.html(signagePrintPage(deck, slides));
});

// =====================  API: デッキ  =====================
app.post('/api/signage/decks', async (c) => {
  const denied = requireFull(c, await canEdit(c)); if (denied) return denied;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = String(body.title ?? '').trim().slice(0, 120);
  if (!title) return c.json({ error: 'タイトルを入力してください' }, 400);
  const maxRow = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM signage_decks').first<{ m: number }>();
  const ins = await c.env.DB.prepare(
    "INSERT INTO signage_decks (title, sort_order, created_by) VALUES (?, ?, ?)"
  ).bind(title, (maxRow?.m ?? -1) + 1, await username(c.env.DB, c.get('adminId'))).run();
  return c.json({ ok: true, id: Number(ins.meta.last_row_id) });
});

app.patch('/api/signage/decks/:id', async (c) => {
  const denied = requireFull(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  const deck = await loadDeck(c.env.DB, id);
  if (!deck) return c.json({ error: '見つかりません' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields: string[] = [];
  const vals: unknown[] = [];
  if ('title' in body) {
    const t = String(body.title ?? '').trim().slice(0, 120);
    if (!t) return c.json({ error: 'タイトルは空にできません' }, 400);
    fields.push('title = ?'); vals.push(t);
  }
  if ('seconds' in body) {
    let s = Number(body.seconds);
    if (!isFinite(s)) s = 7;
    s = Math.min(12, Math.max(3, s));
    fields.push('seconds = ?'); vals.push(s);
  }
  if ('fx_mode' in body) {
    const f = body.fx_mode === 'lux' ? 'lux' : 'std';
    fields.push('fx_mode = ?'); vals.push(f);
  }
  if (!fields.length) return c.json({ error: '更新項目がありません' }, 400);
  fields.push("updated_at = datetime('now','localtime')");
  vals.push(id);
  await c.env.DB.prepare(`UPDATE signage_decks SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/api/signage/decks/:id', async (c) => {
  const denied = requireFull(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  await c.env.DB.prepare('DELETE FROM signage_slides WHERE deck_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM signage_decks WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// =====================  API: スライド  =====================
app.post('/api/signage/decks/:id/slides', async (c) => {
  const denied = requireFull(c, await canEdit(c)); if (denied) return denied;
  const deckId = parseInt(c.req.param('id'), 10);
  const deck = await loadDeck(c.env.DB, deckId);
  if (!deck) return c.json({ error: 'デッキが見つかりません' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = String(body.kind ?? '');
  if (!KIND_SET.has(kind)) return c.json({ error: 'kind が不正です' }, 400);
  const payloadStr = cleanPayload(body.payload ?? {});
  const ins = await c.env.DB.prepare(
    'INSERT INTO signage_slides (deck_id, sort_order, kind, payload) VALUES (?, 9999, ?, ?)'
  ).bind(deckId, kind, payloadStr).run();
  const newId = Number(ins.meta.last_row_id);

  const ordered = await loadSlides(c.env.DB, deckId);
  const arr = ordered.map((s) => s.id).filter((sid) => sid !== newId);
  const after = /^\d+$/.test(String(body.after ?? '')) ? parseInt(String(body.after), 10) : null;
  const pos = after != null && arr.indexOf(after) >= 0 ? arr.indexOf(after) + 1 : arr.length;
  arr.splice(pos, 0, newId);
  await renumber(c.env.DB, arr);
  return c.json({ ok: true, id: newId });
});

app.patch('/api/signage/slides/:id', async (c) => {
  const denied = requireFull(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  const found = await c.env.DB.prepare('SELECT id FROM signage_slides WHERE id = ?').bind(id).first<{ id: number }>();
  if (!found) return c.json({ error: 'スライドが見つかりません' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields: string[] = [];
  const vals: unknown[] = [];
  if ('kind' in body) {
    const kind = String(body.kind ?? '');
    if (!KIND_SET.has(kind)) return c.json({ error: 'kind が不正です' }, 400);
    fields.push('kind = ?'); vals.push(kind);
  }
  if ('payload' in body) {
    fields.push('payload = ?'); vals.push(cleanPayload(body.payload));
  }
  if (!fields.length) return c.json({ error: '更新項目がありません' }, 400);
  vals.push(id);
  await c.env.DB.prepare(`UPDATE signage_slides SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/api/signage/slides/:id', async (c) => {
  const denied = requireFull(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  const row = await c.env.DB.prepare('SELECT deck_id FROM signage_slides WHERE id = ?').bind(id).first<{ deck_id: number }>();
  if (!row) return c.json({ error: '見つかりません' }, 404);
  await c.env.DB.prepare('DELETE FROM signage_slides WHERE id = ?').bind(id).run();
  const ordered = await loadSlides(c.env.DB, row.deck_id);
  await renumber(c.env.DB, ordered.map((s) => s.id));
  return c.json({ ok: true });
});

app.post('/api/signage/slides/:id/move', async (c) => {
  const denied = requireFull(c, await canEdit(c)); if (denied) return denied;
  const id = parseInt(c.req.param('id'), 10);
  const row = await c.env.DB.prepare('SELECT deck_id FROM signage_slides WHERE id = ?').bind(id).first<{ deck_id: number }>();
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
