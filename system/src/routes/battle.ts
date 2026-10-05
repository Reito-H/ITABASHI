// ITABASHI BATTLE 2（新卒 繁忙期勉強会のゲームアプリ）
//   公開側  : BATTLE_PUBLIC_PATH          参加者のスマホ画面（ログイン不要の秘密URL・社員番号で参加）
//            BATTLE_PUBLIC_PATH/api/join  参加（名簿にある社員番号だけ）
//            BATTLE_PUBLIC_PATH/ws        参加者のWebSocket（token で本人確認）
//            BATTLE_PUBLIC_PATH/media/:id 画像・曲の配信（Range対応・iPhoneの音声再生用）
//   管理側  : /admin/ib2                  管理者画面（ホシコンのアカウント。権限は settings.study-sessions）
//            /admin/ib2/screen           プロジェクター画面
//            /admin/ib2/ws               管理者・プロジェクターのWebSocket
//            /admin/ib2/api/*            メニュー・名簿・素材・タイムアタックの保存
//   リアルタイム進行は Durable Object（src/battle/room.ts）。設定を保存したら notify で即反映する。
import { Hono } from 'hono';
import qrcode from 'qrcode-generator';
import type { Env } from '../auth';
import { ADMIN_PATH, BATTLE_PUBLIC_PATH } from '../config';
import { getAdminPermissions } from '../permissions';
import { battlePlayerPage } from '../battle/player_html';
import { battleScreenPage } from '../battle/screen_html';
import { battleAdminPage } from '../battle/admin_html';
import { BATTLE_PRESET, defaultStepConfig, defaultQuestion } from '../battle/preset';
import { STEP_KIND_SET, TEAMS, parseJson, type QuestionRow, type StepRow } from '../battle/types';

type AdminCtx = { Bindings: Env; Variables: { adminId: number } };

function qrSvg(data: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
function joinUrl(reqUrl: string): string {
  return `${new URL(reqUrl).origin}${BATTLE_PUBLIC_PATH}/`;
}
function randToken(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
// 全角数字・空白を吸収
function normEmp(v: unknown): string {
  return String(v ?? '').replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)).replace(/\s/g, '').slice(0, 20);
}

async function activeGame(db: D1Database, create: boolean): Promise<{ id: number; title: string } | null> {
  let g = await db.prepare('SELECT id, title FROM ib2_games WHERE is_active = 1 ORDER BY id DESC LIMIT 1').first<{ id: number; title: string }>();
  if (!g && create) {
    const ins = await db.prepare("INSERT INTO ib2_games (title, is_active) VALUES ('ITABASHI BATTLE 2', 1)").run();
    g = { id: Number(ins.meta.last_row_id), title: 'ITABASHI BATTLE 2' };
  }
  return g;
}
function room(env: Env, gameId: number): DurableObjectStub {
  return env.BATTLE_ROOM.get(env.BATTLE_ROOM.idFromName(`game-${gameId}`));
}
async function notify(env: Env, gameId: number): Promise<void> {
  try { await room(env, gameId).fetch('https://ib2/notify', { headers: { 'X-Game': String(gameId) } }); } catch { /* 進行中でなければ何もしない */ }
}
function forwardWs(req: Request, env: Env, gameId: number, extra: Record<string, string>): Promise<Response> {
  const h = new Headers(req.headers);
  h.set('X-Game', String(gameId));
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return room(env, gameId).fetch(new Request('https://ib2/ws', { headers: h }));
}

// =====================================================================
//  公開側（参加者）
// =====================================================================
export const battlePublicRoutes = new Hono<{ Bindings: Env }>();

battlePublicRoutes.get(BATTLE_PUBLIC_PATH, (c) => c.redirect(`${BATTLE_PUBLIC_PATH}/`));
battlePublicRoutes.get(`${BATTLE_PUBLIC_PATH}/`, (c) => c.html(battlePlayerPage(BATTLE_PUBLIC_PATH)));

battlePublicRoutes.post(`${BATTLE_PUBLIC_PATH}/api/join`, async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const emp = normEmp(body.emp_no);
  if (!emp) return c.json({ error: '社員番号を入力してください' }, 400);
  const g = await activeGame(c.env.DB, false);
  if (!g) return c.json({ error: 'まだ受付が始まっていません' }, 400);
  const r = await c.env.DB.prepare('SELECT name, team FROM ib2_roster WHERE game_id = ? AND emp_no = ?').bind(g.id, emp).first<{ name: string; team: string }>();
  if (!r) return c.json({ error: 'この社員番号は名簿にありません。講師に声をかけてください' }, 404);
  const ex = await c.env.DB.prepare('SELECT token FROM ib2_players WHERE game_id = ? AND emp_no = ?').bind(g.id, emp).first<{ token: string }>();
  if (ex) return c.json({ token: ex.token, name: r.name, team: r.team });
  const token = randToken();
  await c.env.DB.prepare('INSERT INTO ib2_players (game_id, emp_no, name, team, token) VALUES (?, ?, ?, ?, ?)').bind(g.id, emp, r.name, r.team, token).run();
  return c.json({ token, name: r.name, team: r.team });
});

battlePublicRoutes.get(`${BATTLE_PUBLIC_PATH}/ws`, async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') return c.text('expected websocket', 426);
  const token = c.req.query('token') || '';
  const g = await activeGame(c.env.DB, false);
  const p = g && token ? await c.env.DB.prepare('SELECT emp_no, name, team FROM ib2_players WHERE game_id = ? AND token = ?').bind(g.id, token).first<{ emp_no: string; name: string; team: string }>() : null;
  if (!g || !p) {
    // 名簿から外れた・リセットされた端末には、参加し直してもらう合図を送る
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    server.send(JSON.stringify({ t: 'kicked', soft: false }));
    server.close(4001, 'unknown token');
    return new Response(null, { status: 101, webSocket: client });
  }
  return forwardWs(c.req.raw, c.env, g.id, { 'X-Role': 'player', 'X-Emp': p.emp_no, 'X-Name': encodeURIComponent(p.name), 'X-Team': p.team });
});

battlePublicRoutes.get(`${BATTLE_PUBLIC_PATH}/media/:id`, async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const m = await c.env.DB.prepare('SELECT r2_key, mime, size FROM ib2_media WHERE id = ?').bind(id).first<{ r2_key: string; mime: string; size: number }>();
  if (!m) return c.text('Not found', 404);
  const range = c.req.header('Range');
  const mm = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null;
  if (mm && m.size) {
    const start = mm[1] ? parseInt(mm[1], 10) : Math.max(0, m.size - parseInt(mm[2] || '0', 10));
    const end = mm[1] && mm[2] ? Math.min(parseInt(mm[2], 10), m.size - 1) : m.size - 1;
    if (start >= m.size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${m.size}` } });
    const obj = await c.env.DOCUMENTS_BUCKET.get(m.r2_key, { range: { offset: start, length: end - start + 1 } });
    if (!obj) return c.text('Not found', 404);
    return new Response(obj.body, { status: 206, headers: {
      'Content-Type': m.mime, 'Content-Range': `bytes ${start}-${end}/${m.size}`, 'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable',
    } });
  }
  const obj = await c.env.DOCUMENTS_BUCKET.get(m.r2_key);
  if (!obj) return c.text('Not found', 404);
  return new Response(obj.body, { headers: {
    'Content-Type': m.mime, 'Content-Length': String(m.size || obj.size), 'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=31536000, immutable',
  } });
});

// =====================================================================
//  管理側（ホシコンのアカウント）
// =====================================================================
export const battleAdminRoutes = new Hono<AdminCtx>();

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('settings.study-sessions.edit');
}
async function adminName(db: D1Database, id: number): Promise<string> {
  const r = await db.prepare('SELECT username FROM admins WHERE id = ?').bind(id).first<{ username: string }>();
  return r?.username ?? '';
}
const S = (v: unknown, max: number) => String(v ?? '').replace(/\r\n/g, '\n').slice(0, max);

battleAdminRoutes.get('/ib2', async (c) => {
  const ju = joinUrl(c.req.url);
  return c.html(battleAdminPage({
    adminPath: ADMIN_PATH, apiBase: `${ADMIN_PATH}/ib2/api`, wsPath: `${ADMIN_PATH}/ib2/ws?role=admin`,
    screenUrl: `${ADMIN_PATH}/ib2/screen`, joinUrl: ju, qrSvg: qrSvg(ju), editable: await canEdit(c),
    hoshikonUrl: `${ADMIN_PATH}/settings/study-sessions`,
  }));
});
battleAdminRoutes.get('/ib2/screen', async (c) => {
  const g = await activeGame(c.env.DB, true);
  const ju = joinUrl(c.req.url);
  return c.html(battleScreenPage({ wsPath: `${ADMIN_PATH}/ib2/ws?role=screen`, mediaBase: BATTLE_PUBLIC_PATH, joinUrl: ju, qrSvg: qrSvg(ju), title: g?.title ?? '' }));
});
battleAdminRoutes.get('/ib2/ws', async (c) => {
  if (c.req.header('Upgrade') !== 'websocket') return c.text('expected websocket', 426);
  const g = await activeGame(c.env.DB, true);
  const wantAdmin = c.req.query('role') === 'admin';
  const role = wantAdmin && (await canEdit(c)) ? 'admin' : 'screen';
  return forwardWs(c.req.raw, c.env, g!.id, { 'X-Role': role, 'X-Admin': encodeURIComponent(await adminName(c.env.DB, c.get('adminId'))) });
});

// ---------- 読み込み ----------
battleAdminRoutes.get('/ib2/api/game', async (c) => {
  const db = c.env.DB;
  const g = (await activeGame(db, true))!;
  const steps = (await db.prepare('SELECT * FROM ib2_steps WHERE game_id = ? ORDER BY sort_order, id').bind(g.id).all<StepRow>()).results ?? [];
  const qs = (await db.prepare('SELECT q.* FROM ib2_questions q JOIN ib2_steps s ON s.id = q.step_id WHERE s.game_id = ? ORDER BY q.sort_order, q.id').bind(g.id).all<QuestionRow>()).results ?? [];
  const roster = (await db.prepare('SELECT emp_no, name, team FROM ib2_roster WHERE game_id = ? ORDER BY team, id').bind(g.id).all()).results ?? [];
  const media = (await db.prepare('SELECT id, kind, name, mime, size FROM ib2_media ORDER BY id DESC').all()).results ?? [];
  const timeattack = (await db.prepare('SELECT * FROM ib2_timeattack ORDER BY seconds ASC, id ASC').all()).results ?? [];
  const scores = (await db.prepare('SELECT * FROM ib2_scores WHERE game_id = ? ORDER BY id DESC LIMIT 300').bind(g.id).all()).results ?? [];
  return c.json({
    game: g, roster, media, timeattack, scores, gradYear: 2026,
    steps: steps.map((s) => ({
      id: s.id, kind: s.kind, title: s.title, config: parseJson<Record<string, unknown>>(s.config, {}),
      questions: qs.filter((q) => q.step_id === s.id).map((q) => ({ ...q, choices: parseJson<string[]>(q.choices, []) })),
    })),
  });
});

// ---------- 名簿 ----------
battleAdminRoutes.get('/ib2/api/roster/candidates', async (c) => {
  const year = parseInt(c.req.query('year') || '2026', 10) || 2026;
  const r = await c.env.DB.prepare(
    `SELECT emp_no, name, division, team, hire_date,
            CASE WHEN newcomer_type = 'shinsotsu' AND graduate_year = ? THEN 1 ELSE 0 END AS is_primary
       FROM employees
      WHERE is_active = 1
        AND ((newcomer_type = 'shinsotsu' AND graduate_year = ?)
          OR (entry_type = '新卒' AND hire_date >= ? AND hire_date < ?))
      ORDER BY is_primary DESC, division, team, emp_no`
  ).bind(year, year, `${year}-04-01`, `${year + 1}-04-01`).all<{ emp_no: string; name: string; division: number; team: number; hire_date: string; is_primary: number }>();
  return c.json({ candidates: (r.results ?? []).map((x) => ({ ...x, primary: x.is_primary === 1 })) });
});
battleAdminRoutes.get('/ib2/api/roster/lookup', async (c) => {
  const emp = normEmp(c.req.query('emp_no'));
  const r = await c.env.DB.prepare('SELECT emp_no, name FROM employees WHERE emp_no = ?').bind(emp).first<{ emp_no: string; name: string }>();
  if (!r) return c.json({ error: 'その社員番号はホシコンに登録がありません' }, 404);
  return c.json(r);
});
battleAdminRoutes.put('/ib2/api/roster', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '編集権限がありません' }, 403);
  const g = (await activeGame(c.env.DB, true))!;
  const body = (await c.req.json().catch(() => ({}))) as { roster?: Array<{ emp_no: string; name: string; team: string }> };
  const list = (body.roster ?? []).map((r) => ({ emp_no: normEmp(r.emp_no), name: S(r.name, 40), team: (TEAMS as readonly string[]).includes(r.team) ? r.team : 'A' })).filter((r) => r.emp_no && r.name);
  const stmts = [c.env.DB.prepare('DELETE FROM ib2_roster WHERE game_id = ?').bind(g.id)];
  for (const r of list) {
    stmts.push(c.env.DB.prepare('INSERT OR IGNORE INTO ib2_roster (game_id, emp_no, name, team) VALUES (?, ?, ?, ?)').bind(g.id, r.emp_no, r.name, r.team));
    stmts.push(c.env.DB.prepare('UPDATE ib2_players SET team = ?, name = ? WHERE game_id = ? AND emp_no = ?').bind(r.team, r.name, g.id, r.emp_no));
  }
  for (let i = 0; i < stmts.length; i += 50) await c.env.DB.batch(stmts.slice(i, i + 50));
  await notify(c.env, g.id);
  return c.json({ ok: true, count: list.length });
});

// ---------- メニュー ----------
async function stepOfGame(db: D1Database, stepId: number, gameId: number): Promise<StepRow | null> {
  return await db.prepare('SELECT * FROM ib2_steps WHERE id = ? AND game_id = ?').bind(stepId, gameId).first<StepRow>();
}
async function insertQuestion(db: D1Database, stepId: number, sort: number, q: { prompt?: string; choices?: string[]; answer?: string; points?: number; time_limit?: number; note?: string }) {
  await db.prepare('INSERT INTO ib2_questions (step_id, sort_order, prompt, choices, answer, points, time_limit, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(stepId, sort, q.prompt ?? '', JSON.stringify(q.choices ?? []), q.answer ?? '', q.points ?? 10, q.time_limit ?? 20, q.note ?? '').run();
}

battleAdminRoutes.post('/ib2/api/steps', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '編集権限がありません' }, 403);
  const g = (await activeGame(c.env.DB, true))!;
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = String(body.kind || '');
  if (!STEP_KIND_SET.has(kind)) return c.json({ error: '種類が不正です' }, 400);
  const mx = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM ib2_steps WHERE game_id = ?').bind(g.id).first<{ m: number }>();
  const ins = await c.env.DB.prepare('INSERT INTO ib2_steps (game_id, sort_order, kind, title, config) VALUES (?, ?, ?, ?, ?)')
    .bind(g.id, (mx?.m ?? -1) + 1, kind, S(body.title, 80) || kind, JSON.stringify(defaultStepConfig(kind))).run();
  const id = Number(ins.meta.last_row_id);
  if (['buzzer', 'choice', 'number', 'order', 'vote', 'ranking'].includes(kind)) await insertQuestion(c.env.DB, id, 0, defaultQuestion(kind));
  await notify(c.env, g.id);
  return c.json({ ok: true, id });
});
battleAdminRoutes.patch('/ib2/api/steps/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '編集権限がありません' }, 403);
  const g = (await activeGame(c.env.DB, true))!;
  const st = await stepOfGame(c.env.DB, parseInt(c.req.param('id'), 10), g.id);
  if (!st) return c.json({ error: '見つかりません' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = 'title' in body ? S(body.title, 80) || st.title : st.title;
  const config = body.config && typeof body.config === 'object' ? JSON.stringify(body.config).slice(0, 4000) : st.config;
  await c.env.DB.prepare('UPDATE ib2_steps SET title = ?, config = ? WHERE id = ?').bind(title, config, st.id).run();
  await notify(c.env, g.id);
  return c.json({ ok: true });
});
battleAdminRoutes.delete('/ib2/api/steps/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '編集権限がありません' }, 403);
  const g = (await activeGame(c.env.DB, true))!;
  const st = await stepOfGame(c.env.DB, parseInt(c.req.param('id'), 10), g.id);
  if (!st) return c.json({ error: '見つかりません' }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM ib2_questions WHERE step_id = ?').bind(st.id),
    c.env.DB.prepare('DELETE FROM ib2_steps WHERE id = ?').bind(st.id),
  ]);
  await notify(c.env, g.id);
  return c.json({ ok: true });
});
battleAdminRoutes.post('/ib2/api/steps/reorder', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '編集権限がありません' }, 403);
  const g = (await activeGame(c.env.DB, true))!;
  const body = (await c.req.json().catch(() => ({}))) as { ids?: number[] };
  const ids = (body.ids ?? []).map(Number).filter(Number.isFinite);
  await c.env.DB.batch(ids.map((id, i) => c.env.DB.prepare('UPDATE ib2_steps SET sort_order = ? WHERE id = ? AND game_id = ?').bind(i, id, g.id)));
  await notify(c.env, g.id);
  return c.json({ ok: true });
});
battleAdminRoutes.post('/ib2/api/preset', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '編集権限がありません' }, 403);
  const g = (await activeGame(c.env.DB, true))!;
  const has = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM ib2_steps WHERE game_id = ?').bind(g.id).first<{ n: number }>();
  if ((has?.n ?? 0) > 0) return c.json({ error: 'すでにメニューがあります。一括作成は空のときだけ使えます' }, 400);
  for (let i = 0; i < BATTLE_PRESET.length; i++) {
    const p = BATTLE_PRESET[i];
    const ins = await c.env.DB.prepare('INSERT INTO ib2_steps (game_id, sort_order, kind, title, config) VALUES (?, ?, ?, ?, ?)')
      .bind(g.id, i, p.kind, p.title, JSON.stringify({ ...defaultStepConfig(p.kind), ...(p.config ?? {}) })).run();
    const sid = Number(ins.meta.last_row_id);
    const qs = p.qs ?? [];
    for (let j = 0; j < qs.length; j++) await insertQuestion(c.env.DB, sid, j, { ...defaultQuestion(p.kind), ...qs[j] });
  }
  await notify(c.env, g.id);
  return c.json({ ok: true });
});

// ---------- 問題 ----------
async function questionOfGame(db: D1Database, qid: number, gameId: number): Promise<QuestionRow | null> {
  return await db.prepare('SELECT q.* FROM ib2_questions q JOIN ib2_steps s ON s.id = q.step_id WHERE q.id = ? AND s.game_id = ?').bind(qid, gameId).first<QuestionRow>();
}
battleAdminRoutes.post('/ib2/api/steps/:id/questions', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '編集権限がありません' }, 403);
  const g = (await activeGame(c.env.DB, true))!;
  const st = await stepOfGame(c.env.DB, parseInt(c.req.param('id'), 10), g.id);
  if (!st) return c.json({ error: '見つかりません' }, 404);
  const mx = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM ib2_questions WHERE step_id = ?').bind(st.id).first<{ m: number }>();
  await insertQuestion(c.env.DB, st.id, (mx?.m ?? -1) + 1, defaultQuestion(st.kind));
  await notify(c.env, g.id);
  return c.json({ ok: true });
});
battleAdminRoutes.post('/ib2/api/steps/:id/questions/reorder', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '編集権限がありません' }, 403);
  const g = (await activeGame(c.env.DB, true))!;
  const st = await stepOfGame(c.env.DB, parseInt(c.req.param('id'), 10), g.id);
  if (!st) return c.json({ error: '見つかりません' }, 404);
  const body = (await c.req.json().catch(() => ({}))) as { ids?: number[] };
  const ids = (body.ids ?? []).map(Number).filter(Number.isFinite);
  await c.env.DB.batch(ids.map((id, i) => c.env.DB.prepare('UPDATE ib2_questions SET sort_order = ? WHERE id = ? AND step_id = ?').bind(i, id, st.id)));
  await notify(c.env, g.id);
  return c.json({ ok: true });
});
battleAdminRoutes.patch('/ib2/api/questions/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '編集権限がありません' }, 403);
  const g = (await activeGame(c.env.DB, true))!;
  const q = await questionOfGame(c.env.DB, parseInt(c.req.param('id'), 10), g.id);
  if (!q) return c.json({ error: '見つかりません' }, 404);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const sets: string[] = [];
  const vals: unknown[] = [];
  if ('prompt' in b) { sets.push('prompt = ?'); vals.push(S(b.prompt, 400)); }
  if ('answer' in b) { sets.push('answer = ?'); vals.push(S(b.answer, 200)); }
  if ('note' in b) { sets.push('note = ?'); vals.push(S(b.note, 300)); }
  if ('points' in b) { sets.push('points = ?'); vals.push(Math.max(0, Math.min(1000, Math.round(Number(b.points) || 0)))); }
  if ('time_limit' in b) { sets.push('time_limit = ?'); vals.push(Math.max(3, Math.min(600, Math.round(Number(b.time_limit) || 20)))); }
  if ('image_id' in b) { sets.push('image_id = ?'); vals.push(b.image_id ? Number(b.image_id) : null); }
  if ('choices' in b && Array.isArray(b.choices)) { sets.push('choices = ?'); vals.push(JSON.stringify((b.choices as unknown[]).map((x) => S(x, 80)).filter((x) => x).slice(0, 10))); }
  if (!sets.length) return c.json({ error: '更新項目がありません' }, 400);
  vals.push(q.id);
  await c.env.DB.prepare(`UPDATE ib2_questions SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  await notify(c.env, g.id);
  return c.json({ ok: true });
});
battleAdminRoutes.delete('/ib2/api/questions/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '編集権限がありません' }, 403);
  const g = (await activeGame(c.env.DB, true))!;
  const q = await questionOfGame(c.env.DB, parseInt(c.req.param('id'), 10), g.id);
  if (!q) return c.json({ error: '見つかりません' }, 404);
  await c.env.DB.prepare('DELETE FROM ib2_questions WHERE id = ?').bind(q.id).run();
  await notify(c.env, g.id);
  return c.json({ ok: true });
});

// ---------- 素材（画像・曲） ----------
// 動画は Workers のリクエスト上限（無料プラン100MB）に収まるよう 95MB まで。メモリに載せずそのまま R2 へ流す
const MEDIA_TYPES: Record<string, { kind: 'image' | 'audio' | 'video'; ext: string; max: number }> = {
  'video/mp4': { kind: 'video', ext: 'mp4', max: 95 << 20 }, 'video/webm': { kind: 'video', ext: 'webm', max: 95 << 20 },
  'video/quicktime': { kind: 'video', ext: 'mov', max: 95 << 20 },
  'image/jpeg': { kind: 'image', ext: 'jpg', max: 10 << 20 }, 'image/png': { kind: 'image', ext: 'png', max: 10 << 20 },
  'image/webp': { kind: 'image', ext: 'webp', max: 10 << 20 }, 'image/gif': { kind: 'image', ext: 'gif', max: 10 << 20 },
  'audio/mpeg': { kind: 'audio', ext: 'mp3', max: 15 << 20 }, 'audio/mp3': { kind: 'audio', ext: 'mp3', max: 15 << 20 },
  'audio/mp4': { kind: 'audio', ext: 'm4a', max: 15 << 20 }, 'audio/x-m4a': { kind: 'audio', ext: 'm4a', max: 15 << 20 },
  'audio/aac': { kind: 'audio', ext: 'aac', max: 15 << 20 }, 'audio/wav': { kind: 'audio', ext: 'wav', max: 15 << 20 },
  'audio/x-wav': { kind: 'audio', ext: 'wav', max: 15 << 20 }, 'audio/ogg': { kind: 'audio', ext: 'ogg', max: 15 << 20 },
};
battleAdminRoutes.post('/ib2/api/media', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '編集権限がありません' }, 403);
  const type = (c.req.header('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const t = MEDIA_TYPES[type];
  if (!t) return c.json({ error: '画像（JPEG/PNG/WebP/GIF）、曲（MP3/M4A/WAV/OGG）、動画（MP4/WebM/MOV）を選んでください' }, 400);
  const len = Number(c.req.header('Content-Length') || 0);
  if (len > t.max) return c.json({ error: `ファイルが大きすぎます（${t.max >> 20}MBまで）` }, 400);
  let name = '';
  try { name = decodeURIComponent(c.req.header('X-Name') || ''); } catch { name = ''; }
  const key = `ib2/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${t.ext}`;
  let size = 0;
  if (t.kind === 'video' && len > 0 && c.req.raw.body) {
    const obj = await c.env.DOCUMENTS_BUCKET.put(key, c.req.raw.body.pipeThrough(new FixedLengthStream(len)), { httpMetadata: { contentType: type } });
    size = obj?.size ?? len;
  } else {
    const buf = await c.req.arrayBuffer();
    if (!buf.byteLength) return c.json({ error: 'ファイルが空です' }, 400);
    if (buf.byteLength > t.max) return c.json({ error: `ファイルが大きすぎます（${t.max >> 20}MBまで）` }, 400);
    await c.env.DOCUMENTS_BUCKET.put(key, buf, { httpMetadata: { contentType: type } });
    size = buf.byteLength;
  }
  if (!size) return c.json({ error: 'ファイルが空です' }, 400);
  const ins = await c.env.DB.prepare('INSERT INTO ib2_media (kind, r2_key, name, mime, size) VALUES (?, ?, ?, ?, ?)')
    .bind(t.kind, key, S(name || key, 120), type, size).run();
  return c.json({ ok: true, id: Number(ins.meta.last_row_id) });
});
battleAdminRoutes.delete('/ib2/api/media/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '編集権限がありません' }, 403);
  const id = parseInt(c.req.param('id'), 10);
  const m = await c.env.DB.prepare('SELECT r2_key FROM ib2_media WHERE id = ?').bind(id).first<{ r2_key: string }>();
  if (!m) return c.json({ error: '見つかりません' }, 404);
  await c.env.DOCUMENTS_BUCKET.delete(m.r2_key).catch(() => {});
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE ib2_questions SET image_id = NULL WHERE image_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM ib2_media WHERE id = ?').bind(id),
  ]);
  const g = await activeGame(c.env.DB, false);
  if (g) await notify(c.env, g.id);
  return c.json({ ok: true });
});

// ---------- 車椅子タイムアタック ----------
battleAdminRoutes.post('/ib2/api/timeattack', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '編集権限がありません' }, 403);
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = S(b.name, 40).trim();
  const sec = Number(b.seconds);
  if (!name || !(sec > 0 && sec < 3600)) return c.json({ error: '氏名とタイムを確認してください' }, 400);
  await c.env.DB.prepare('INSERT INTO ib2_timeattack (emp_no, name, seconds, note) VALUES (?, ?, ?, ?)')
    .bind(normEmp(b.emp_no), name, Math.round(sec * 10) / 10, S(b.note, 80)).run();
  const g = await activeGame(c.env.DB, false);
  if (g) await notify(c.env, g.id);
  return c.json({ ok: true });
});
battleAdminRoutes.delete('/ib2/api/timeattack/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '編集権限がありません' }, 403);
  await c.env.DB.prepare('DELETE FROM ib2_timeattack WHERE id = ?').bind(parseInt(c.req.param('id'), 10)).run();
  const g = await activeGame(c.env.DB, false);
  if (g) await notify(c.env, g.id);
  return c.json({ ok: true });
});

// ---------- 得点の取り消し ----------
battleAdminRoutes.delete('/ib2/api/scores/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '編集権限がありません' }, 403);
  const g = (await activeGame(c.env.DB, true))!;
  await c.env.DB.prepare('DELETE FROM ib2_scores WHERE id = ? AND game_id = ?').bind(parseInt(c.req.param('id'), 10), g.id).run();
  await notify(c.env, g.id);
  return c.json({ ok: true });
});
