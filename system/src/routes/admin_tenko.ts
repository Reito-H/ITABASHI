// 点呼（仮眠室集合パワポ）— 左サイドバー「点呼」
//   ページ : /tenko                  一覧（この日の点呼を作る＝直近デッキを複製）
//            /tenko/:id/edit          編集（表紙・スライド・ネタ箱）
//            /tenko/:id/present       プレゼン投影（全画面）
//            /tenko/:id/print         印刷 / PDF（回線断時の保険）
//            /tenko/library           定型スライド（唱和など）の管理
//   API    : /api/tenko/*             （管理パス配下）
//   権限   : tenko（閲覧・投影） / tenko.edit（作成・編集）
//   素材   : R2 benten-tenko バケット（tenko/<uuid>.<ext>）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { getAdminPermissions } from '../permissions';
import { fetchTenkoWeather } from '../utils/tenko_weather';
import {
  tenkoListPage, tenkoEditPage, tenkoPresentPage, tenkoPrintPage, tenkoLibraryPage,
  type TenkoDeck, type TenkoSlide, type TenkoMedia, type TenkoIdea,
} from '../html/tenko';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const SLIDE_KINDS = new Set(['cover', 'notice', 'message', 'image', 'video', 'pdf', 'accident', 'library', 'freeform']);
const MEDIA_KINDS = new Set(['image', 'video', 'pdf']);
const EXT_BY_KIND: Record<string, string[]> = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  video: ['mp4', 'mov', 'm4v', 'webm'],
  pdf: ['pdf'],
};
const MAX_SIZE_BY_KIND: Record<string, number> = {
  image: 30 * 1024 * 1024,
  video: 300 * 1024 * 1024,
  pdf: 40 * 1024 * 1024,
};

async function getUsername(db: D1Database, adminId: number): Promise<string> {
  const row = await db.prepare('SELECT username FROM admins WHERE id = ?').bind(adminId).first<{ username: string }>();
  return row?.username ?? '';
}
async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('tenko.edit');
}

function todayJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function isYmd(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function dateLabel(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return d;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const w = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
  return `${Number(m[2])}月${Number(m[3])}日（${w}）`;
}

async function loadDeck(db: D1Database, id: number): Promise<TenkoDeck | null> {
  return await db.prepare('SELECT * FROM tenko_decks WHERE id = ?').bind(id).first<TenkoDeck>();
}
async function loadSlides(db: D1Database, deckId: number): Promise<TenkoSlide[]> {
  const r = await db.prepare('SELECT * FROM tenko_slides WHERE deck_id = ? ORDER BY sort_order, id').bind(deckId).all<TenkoSlide>();
  return r.results ?? [];
}
async function loadLibrary(db: D1Database): Promise<TenkoMedia[]> {
  const r = await db.prepare('SELECT * FROM tenko_media WHERE is_library = 1 ORDER BY sort_order, id').all<TenkoMedia>();
  return r.results ?? [];
}

// =====================  ページ  =====================
app.get('/tenko', async (c) => {
  const [editable, r] = await Promise.all([
    canEdit(c),
    c.env.DB.prepare('SELECT * FROM tenko_decks ORDER BY deck_date DESC, id DESC LIMIT 60').all<TenkoDeck>(),
  ]);
  return c.html(layout('点呼', tenkoListPage(r.results ?? [], editable, todayJst()), 'tenko'));
});

app.get('/tenko/library', async (c) => {
  const [editable, media] = await Promise.all([canEdit(c), loadLibrary(c.env.DB)]);
  return c.html(layout('定型スライド管理', tenkoLibraryPage(media, editable), 'tenko'));
});

app.get('/tenko/:id/edit', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const deck = await loadDeck(c.env.DB, id);
  if (!deck) return c.html(layout('点呼', '<p style="padding:20px;">点呼が見つかりません。</p>', 'tenko'), 404);
  const [slides, library, ideasRes] = await Promise.all([
    loadSlides(c.env.DB, id),
    loadLibrary(c.env.DB),
    c.env.DB.prepare("SELECT * FROM tenko_ideas WHERE status = 'open' ORDER BY created_at DESC, id DESC").all<TenkoIdea>(),
  ]);
  return c.html(layout(`${dateLabel(deck.deck_date)} 点呼`, tenkoEditPage(deck, slides, library, ideasRes.results ?? []), 'tenko'));
});

app.get('/tenko/:id/present', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const deck = await loadDeck(c.env.DB, id);
  if (!deck) return c.text('点呼が見つかりません', 404);
  const slides = await loadSlides(c.env.DB, id);
  return c.html(tenkoPresentPage(deck, slides));
});

app.get('/tenko/:id/print', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const deck = await loadDeck(c.env.DB, id);
  if (!deck) return c.text('点呼が見つかりません', 404);
  const slides = await loadSlides(c.env.DB, id);
  return c.html(tenkoPrintPage(deck, slides));
});

// =====================  API: デッキ  =====================
app.post('/api/tenko/decks', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const date = body.date;
  if (!isYmd(date)) return c.json({ error: '日付を指定してください' }, 400);
  const username = await getUsername(c.env.DB, c.get('adminId'));

  // 下敷きデッキの決定
  let srcId: number | null = null;
  const copyFrom = String(body.copyFrom ?? '');
  if (copyFrom === 'latest') {
    const row = await c.env.DB.prepare('SELECT id FROM tenko_decks ORDER BY deck_date DESC, id DESC LIMIT 1').first<{ id: number }>();
    srcId = row?.id ?? null;
  } else if (/^\d+$/.test(copyFrom)) {
    srcId = parseInt(copyFrom, 10);
  }

  let title = '点呼', headline = '';
  if (srcId) {
    const src = await loadDeck(c.env.DB, srcId);
    if (src) { title = src.title || '点呼'; headline = src.headline; }
  }

  const ins = await c.env.DB.prepare(
    `INSERT INTO tenko_decks (deck_date, title, headline, created_by) VALUES (?, ?, ?, ?)`
  ).bind(date, title, headline, username).run();
  const newId = Number(ins.meta.last_row_id);

  // スライドを複製（無ければ表紙1枚）
  if (srcId) {
    const srcSlides = await loadSlides(c.env.DB, srcId);
    if (srcSlides.length) {
      await c.env.DB.batch(srcSlides.map((s, i) =>
        c.env.DB.prepare('INSERT INTO tenko_slides (deck_id, sort_order, kind, payload) VALUES (?, ?, ?, ?)')
          .bind(newId, i, s.kind, s.payload)
      ));
    }
  }
  const cnt = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM tenko_slides WHERE deck_id = ?').bind(newId).first<{ n: number }>();
  if (!cnt || cnt.n === 0) {
    await c.env.DB.prepare('INSERT INTO tenko_slides (deck_id, sort_order, kind, payload) VALUES (?, 0, ?, ?)')
      .bind(newId, 'cover', '{}').run();
  }

  // 天候・気温を気象庁予報から自動セット（失敗しても作成は成功させる）
  try {
    const w = await fetchTenkoWeather(date);
    if (w.weather || w.tempMax || w.tempMin) {
      await c.env.DB.prepare(
        `UPDATE tenko_decks SET weather = ?, temp_max = ?, temp_min = ?, updated_at = datetime('now','localtime') WHERE id = ?`
      ).bind(w.weather, w.tempMax, w.tempMin, newId).run();
    }
  } catch { /* noop */ }

  return c.json({ ok: true, id: newId });
});

app.patch('/api/tenko/decks/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const deck = await loadDeck(c.env.DB, id);
  if (!deck) return c.json({ error: '点呼が見つかりません' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;

  const fields: string[] = [];
  const vals: unknown[] = [];
  const strKeys = ['title', 'confirmer', 'weather', 'temp_max', 'temp_min', 'headline'] as const;
  for (const k of strKeys) {
    if (k in body) { fields.push(`${k} = ?`); vals.push(String(body[k] ?? '').slice(0, 2000)); }
  }
  if ('deck_date' in body) {
    if (!isYmd(body.deck_date)) return c.json({ error: '日付の形式が不正です' }, 400);
    fields.push('deck_date = ?'); vals.push(body.deck_date);
  }
  if ('status' in body) {
    const st = body.status === 'ready' ? 'ready' : 'draft';
    fields.push('status = ?'); vals.push(st);
  }
  if (!fields.length) return c.json({ error: '更新項目がありません' }, 400);
  fields.push(`updated_at = datetime('now','localtime')`);
  vals.push(id);
  await c.env.DB.prepare(`UPDATE tenko_decks SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();

  const newDate = 'deck_date' in body ? String(body.deck_date) : deck.deck_date;
  return c.json({ ok: true, dateLabel: dateLabel(newDate) });
});

app.get('/api/tenko/decks/:id/weather', async (c) => {
  const date = c.req.query('date');
  if (!isYmd(date)) return c.json({ error: '日付を指定してください' }, 400);
  const w = await fetchTenkoWeather(date);
  return c.json({ ok: true, weather: w.weather, tempMax: w.tempMax, tempMin: w.tempMin });
});

app.delete('/api/tenko/decks/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM tenko_slides WHERE deck_id = ?').bind(id),
    c.env.DB.prepare("UPDATE tenko_ideas SET used_deck_id = NULL WHERE used_deck_id = ?").bind(id),
    c.env.DB.prepare('DELETE FROM tenko_decks WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

// =====================  API: スライド  =====================
app.post('/api/tenko/decks/:id/slides', async (c) => {
  const deckId = parseInt(c.req.param('id'), 10);
  const deck = await loadDeck(c.env.DB, deckId);
  if (!deck) return c.json({ error: '点呼が見つかりません' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = String(body.kind ?? '');
  if (!SLIDE_KINDS.has(kind) || kind === 'cover') return c.json({ error: 'スライド種別が不正です' }, 400);
  let payloadStr = '{}';
  try { payloadStr = JSON.stringify(body.payload ?? {}); } catch { payloadStr = '{}'; }
  if (payloadStr.length > 200000) return c.json({ error: 'データが大きすぎます' }, 400);

  const mx = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM tenko_slides WHERE deck_id = ?').bind(deckId).first<{ m: number }>();
  const ins = await c.env.DB.prepare('INSERT INTO tenko_slides (deck_id, sort_order, kind, payload) VALUES (?, ?, ?, ?)')
    .bind(deckId, (mx?.m ?? -1) + 1, kind, payloadStr).run();

  const fromIdea = body.fromIdea;
  if (fromIdea != null && /^\d+$/.test(String(fromIdea))) {
    await c.env.DB.prepare("UPDATE tenko_ideas SET status = 'used', used_deck_id = ?, used_at = datetime('now','localtime') WHERE id = ?")
      .bind(deckId, parseInt(String(fromIdea), 10)).run();
  }
  return c.json({ ok: true, id: Number(ins.meta.last_row_id) });
});

app.post('/api/tenko/decks/:id/slides/reorder', async (c) => {
  const deckId = parseInt(c.req.param('id'), 10);
  const body = (await c.req.json().catch(() => ({}))) as { ids?: unknown };
  const ids: number[] = Array.isArray(body.ids)
    ? body.ids.map((x: unknown) => Number(x)).filter((n: number) => Number.isInteger(n))
    : [];
  if (!ids.length) return c.json({ error: '並び順が不正です' }, 400);
  await c.env.DB.batch(ids.map((sid: number, i: number) =>
    c.env.DB.prepare('UPDATE tenko_slides SET sort_order = ? WHERE id = ? AND deck_id = ?').bind(i, sid, deckId)
  ));
  return c.json({ ok: true });
});

app.patch('/api/tenko/slides/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const found = await c.env.DB.prepare('SELECT id, kind FROM tenko_slides WHERE id = ?').bind(id).first<{ id: number; kind: string }>();
  if (!found) return c.json({ error: 'スライドが見つかりません' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!('payload' in body) || typeof body.payload !== 'object' || body.payload === null) {
    return c.json({ error: 'payload が不正です' }, 400);
  }
  let payloadStr = '{}';
  try { payloadStr = JSON.stringify(body.payload); } catch { return c.json({ error: 'payload が不正です' }, 400); }
  if (payloadStr.length > 200000) return c.json({ error: 'データが大きすぎます' }, 400);
  await c.env.DB.prepare('UPDATE tenko_slides SET payload = ? WHERE id = ?').bind(payloadStr, id).run();
  return c.json({ ok: true });
});

app.delete('/api/tenko/slides/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const found = await c.env.DB.prepare('SELECT kind FROM tenko_slides WHERE id = ?').bind(id).first<{ kind: string }>();
  if (found?.kind === 'cover') return c.json({ error: '表紙は削除できません' }, 400);
  await c.env.DB.prepare('DELETE FROM tenko_slides WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// =====================  API: 素材（R2）  =====================
app.post('/api/tenko/media', async (c) => {
  let form: FormData;
  try { form = await c.req.formData(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }
  const file = form.get('file');
  const kind = String(form.get('kind') ?? 'image');
  const isLibrary = String(form.get('is_library') ?? '') === '1';
  const label = String(form.get('label') ?? '').slice(0, 200);
  if (!MEDIA_KINDS.has(kind)) return c.json({ error: '種別が不正です' }, 400);
  if (!(file instanceof File) || file.size === 0) return c.json({ error: 'ファイルを選択してください' }, 400);
  if (file.size > MAX_SIZE_BY_KIND[kind]) {
    return c.json({ error: `ファイルサイズは ${Math.round(MAX_SIZE_BY_KIND[kind] / 1024 / 1024)}MB 以下にしてください` }, 400);
  }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!EXT_BY_KIND[kind].includes(ext)) {
    return c.json({ error: `${kind} で使える拡張子: ${EXT_BY_KIND[kind].join(', ')}` }, 400);
  }
  const username = await getUsername(c.env.DB, c.get('adminId'));
  const r2Key = `tenko/${crypto.randomUUID()}.${ext}`;
  await c.env.TENKO_BUCKET.put(r2Key, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  });
  const ins = await c.env.DB.prepare(
    `INSERT INTO tenko_media (r2_key, kind, filename, mime_type, size_bytes, is_library, label, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(r2Key, kind, file.name, file.type || 'application/octet-stream', file.size, isLibrary ? 1 : 0, label, username).run();
  return c.json({ ok: true, id: Number(ins.meta.last_row_id), kind });
});

app.get('/api/tenko/media/:id/file', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const row = await c.env.DB.prepare('SELECT r2_key, mime_type, filename, size_bytes FROM tenko_media WHERE id = ?').bind(id)
    .first<{ r2_key: string; mime_type: string; filename: string; size_bytes: number }>();
  if (!row) return c.text('見つかりません', 404);

  const rangeHeader = c.req.header('Range');
  const m = rangeHeader ? /bytes=(\d*)-(\d*)/.exec(rangeHeader) : null;
  if (m && (m[1] || m[2])) {
    const total = row.size_bytes || 0;
    const offset = m[1] ? parseInt(m[1], 10) : 0;
    const end = m[2] ? Math.min(parseInt(m[2], 10), (total || Infinity) - 1) : (total ? total - 1 : undefined);
    const obj = await c.env.TENKO_BUCKET.get(row.r2_key, {
      range: end != null ? { offset, length: end - offset + 1 } : { offset },
    });
    if (!obj) return c.text('ファイルがありません', 404);
    const realEnd = end != null ? end : (total ? total - 1 : offset + obj.size - 1);
    const headers = new Headers();
    headers.set('Content-Type', row.mime_type || 'application/octet-stream');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'private, max-age=3600');
    headers.set('Content-Range', `bytes ${offset}-${realEnd}/${total || '*'}`);
    headers.set('Content-Length', String(realEnd - offset + 1));
    return new Response(obj.body, { status: 206, headers });
  }

  const obj = await c.env.TENKO_BUCKET.get(row.r2_key);
  if (!obj) return c.text('ファイルがありません', 404);
  const headers = new Headers();
  headers.set('Content-Type', row.mime_type || 'application/octet-stream');
  headers.set('Content-Length', String(obj.size));
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'private, max-age=3600');
  headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(row.filename || 'file')}"`);
  return new Response(obj.body, { headers });
});

app.patch('/api/tenko/media/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields: string[] = [];
  const vals: unknown[] = [];
  if ('label' in body) { fields.push('label = ?'); vals.push(String(body.label ?? '').slice(0, 200)); }
  if ('sort_order' in body) { fields.push('sort_order = ?'); vals.push(parseInt(String(body.sort_order), 10) || 0); }
  if (!fields.length) return c.json({ error: '更新項目がありません' }, 400);
  vals.push(id);
  await c.env.DB.prepare(`UPDATE tenko_media SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/api/tenko/media/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const row = await c.env.DB.prepare('SELECT r2_key FROM tenko_media WHERE id = ?').bind(id).first<{ r2_key: string }>();
  if (!row) return c.json({ error: '見つかりません' }, 404);
  const used = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM tenko_slides WHERE payload LIKE ?`
  ).bind(`%"media_id":${id}%`).first<{ n: number }>();
  if (used && used.n > 0) return c.json({ error: `この素材は ${used.n} 枚のスライドで使われています。先にそのスライドを変更してください。` }, 409);
  await c.env.TENKO_BUCKET.delete(row.r2_key).catch(() => {});
  await c.env.DB.prepare('DELETE FROM tenko_media WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// =====================  API: ネタ箱  =====================
app.get('/api/tenko/ideas', async (c) => {
  const status = c.req.query('status') || 'open';
  const r = await c.env.DB.prepare('SELECT * FROM tenko_ideas WHERE status = ? ORDER BY created_at DESC, id DESC').bind(status).all<TenkoIdea>();
  return c.json({ ideas: r.results ?? [] });
});

app.post('/api/tenko/ideas', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const text = String(body.body ?? '').trim();
  if (!text) return c.json({ error: '内容を入力してください' }, 400);
  const mediaId = /^\d+$/.test(String(body.media_id ?? '')) ? parseInt(String(body.media_id), 10) : null;
  const username = await getUsername(c.env.DB, c.get('adminId'));
  const ins = await c.env.DB.prepare(
    'INSERT INTO tenko_ideas (body, media_id, submitted_by) VALUES (?, ?, ?)'
  ).bind(text.slice(0, 4000), mediaId, username).run();
  const row = await c.env.DB.prepare('SELECT created_at FROM tenko_ideas WHERE id = ?').bind(Number(ins.meta.last_row_id)).first<{ created_at: string }>();
  return c.json({ ok: true, id: Number(ins.meta.last_row_id), submitted_by: username, created_at: row?.created_at ?? '' });
});

app.patch('/api/tenko/ideas/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const st = String(body.status ?? '');
  if (!['open', 'used', 'dismissed'].includes(st)) return c.json({ error: 'status が不正です' }, 400);
  await c.env.DB.prepare('UPDATE tenko_ideas SET status = ? WHERE id = ?').bind(st, id).run();
  return c.json({ ok: true });
});

app.delete('/api/tenko/ideas/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await c.env.DB.prepare('DELETE FROM tenko_ideas WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
