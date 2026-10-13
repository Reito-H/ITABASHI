// ホシコンパズル（公開・ゲームページ）
// ログイン不要。共有URL {PUZZLE_PATH} を開き、社員番号（employees と照合）または ニックネーム で参戦する。
// 味方キャラ（バースデーから取り込んだ社員写真）から数人選んでチームを組み、3マッチパズルで敵を順番に倒す。
// ページ: {PUZZLE_PATH}    API: /api/public/puzzle/*
// 認証は一切行わない。書き込みは puzzle_players の登録と puzzle_scores の追加に限定する。
// 端末には token（合言葉）を localStorage に保存し、2回目以降はそれで本人を特定する。
// 管理側（設定 → バトル設定）は routes/admin_puzzle.ts を参照。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { PUZZLE_PATH } from '../config';
import { puzzlePageHtml } from '../html/puzzle_page';

const app = new Hono<{ Bindings: Env }>();

export const ELEMENTS = ['fire', 'water', 'wood', 'light', 'dark'] as const;
export type Element = typeof ELEMENTS[number];
export const ELEMENT_LABEL: Record<Element, string> = { fire: '火', water: '水', wood: '木', light: '光', dark: '闇' };

export type PuzzleSettings = { title: string; is_open: number; team_size: number; enemy_interval: number };

export async function loadPuzzleSettings(db: D1Database): Promise<PuzzleSettings> {
  const row = await db.prepare('SELECT title, is_open, team_size, enemy_interval FROM puzzle_settings WHERE id = 1').first<PuzzleSettings>();
  return {
    title: row?.title ?? 'ホシコンパズル',
    is_open: row?.is_open ?? 0,
    team_size: Math.min(4, Math.max(1, row?.team_size ?? 3)),
    enemy_interval: Math.min(6, Math.max(1, row?.enemy_interval ?? 3)),
  };
}

export type AllyRow = { id: number; name: string; photo_r2_key: string | null; photo_offset_x: number; photo_offset_y: number; photo_scale: number; hp: number; atk: number; element: string; is_active: number; sort_order: number };
export type EnemyRow = { id: number; name: string; photo_r2_key: string | null; hp: number; atk: number; element: string; is_active: number; sort_order: number };

export async function loadAllies(db: D1Database, activeOnly: boolean): Promise<AllyRow[]> {
  const r = await db.prepare(`SELECT id, name, photo_r2_key, photo_offset_x, photo_offset_y, photo_scale, hp, atk, element, is_active, sort_order
    FROM puzzle_allies ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY sort_order ASC, id ASC`).all<AllyRow>();
  return r.results ?? [];
}
export async function loadEnemies(db: D1Database, activeOnly: boolean): Promise<EnemyRow[]> {
  const r = await db.prepare(`SELECT id, name, photo_r2_key, hp, atk, element, is_active, sort_order
    FROM puzzle_enemies ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY sort_order ASC, id ASC`).all<EnemyRow>();
  return r.results ?? [];
}

// スコア計算（サーバー側で一元化。クライアントの申告値は範囲チェックしてから使う）
export function calcScore(stagesCleared: number, cleared: boolean, hpLeftPct: number, moves: number): number {
  return stagesCleared * 10000 + (cleared ? 5000 : 0) + hpLeftPct * 20 + Math.max(0, 200 - moves) * 5;
}

function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}
export function normalizeNick(s: string): string {
  return s.replace(/[\s　]+/g, ' ').trim().slice(0, 12);
}
function newToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

type PlayerRow = { id: number; emp_no: string; real_name: string; nickname: string; token: string };

async function bestOf(db: D1Database, playerId: number) {
  return db.prepare('SELECT score, stages_cleared, stages_total, cleared, hp_left, moves FROM puzzle_scores WHERE player_id = ? ORDER BY score DESC, id ASC LIMIT 1')
    .bind(playerId).first<{ score: number; stages_cleared: number; stages_total: number; cleared: number; hp_left: number; moves: number }>();
}

async function serveImage(c: { env: Env; text: (s: string, st: 404) => Response }, key: string | null, mime: string | null): Promise<Response> {
  if (!key) return c.text('Not found', 404);
  const obj = await c.env.DOCUMENTS_BUCKET.get(key);
  if (!obj) return c.text('Not found', 404);
  const m = mime ?? obj.httpMetadata?.contentType ?? '';
  return new Response(obj.body, {
    headers: {
      'Content-Type': /^image\/(jpeg|png|gif|webp|avif)$/.test(m) ? m : 'application/octet-stream',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

// ===== API =====

// ゲームの設定・味方・敵（公開情報のみ）
app.get('/api/public/puzzle/config', async (c) => {
  const s = await loadPuzzleSettings(c.env.DB);
  const allies = (await loadAllies(c.env.DB, true)).map(a => ({
    id: a.id, name: a.name, hp: a.hp, atk: a.atk, element: a.element, img: !!a.photo_r2_key,
    ox: a.photo_offset_x, oy: a.photo_offset_y, sc: a.photo_scale,
  }));
  const enemies = (await loadEnemies(c.env.DB, true)).map(e => ({ id: e.id, name: e.name, hp: e.hp, atk: e.atk, element: e.element, img: !!e.photo_r2_key }));
  return c.json({ title: s.title, open: !!s.is_open, team_size: s.team_size, enemy_interval: s.enemy_interval, allies, enemies });
});

app.get('/api/public/puzzle/img/ally/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const row = await c.env.DB.prepare('SELECT photo_r2_key, photo_mime FROM puzzle_allies WHERE id = ?').bind(id).first<{ photo_r2_key: string | null; photo_mime: string | null }>();
  return serveImage(c, row?.photo_r2_key ?? null, row?.photo_mime ?? null);
});
app.get('/api/public/puzzle/img/enemy/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const row = await c.env.DB.prepare('SELECT photo_r2_key, photo_mime FROM puzzle_enemies WHERE id = ?').bind(id).first<{ photo_r2_key: string | null; photo_mime: string | null }>();
  return serveImage(c, row?.photo_r2_key ?? null, row?.photo_mime ?? null);
});

// 社員番号の確認（本名を返す。登録済みならニックネームも）
app.post('/api/public/puzzle/lookup', async (c) => {
  const b = await c.req.json<{ emp_no?: string }>().catch(() => ({} as { emp_no?: string }));
  const empNo = toHalfWidth(String(b.emp_no ?? '').trim());
  if (!empNo) return c.json({ error: '社員番号を入力してください' }, 400);
  const emp = await c.env.DB.prepare('SELECT emp_no, name FROM employees WHERE emp_no = ? AND is_active = 1').bind(empNo).first<{ emp_no: string; name: string }>();
  if (!emp) return c.json({ error: '社員番号が確認できませんでした。番号を確認するか、「ニックネームで参戦」を使ってください' }, 404);
  const p = await c.env.DB.prepare('SELECT id, nickname, token FROM puzzle_players WHERE emp_no = ?').bind(emp.emp_no).first<{ id: number; nickname: string; token: string }>();
  if (p) {
    // 登録済み: 別の端末からでも社員番号で復帰できる
    const best = await bestOf(c.env.DB, p.id);
    return c.json({ registered: true, name: emp.name, nickname: p.nickname, token: p.token, best });
  }
  return c.json({ registered: false, name: emp.name });
});

// 参戦登録（社員番号あり: emp_no + nickname ／ なし: nickname のみ）
app.post('/api/public/puzzle/register', async (c) => {
  const s = await loadPuzzleSettings(c.env.DB);
  if (!s.is_open) return c.json({ error: 'ただいま準備中です' }, 400);
  const b = await c.req.json<{ emp_no?: string; nickname?: string }>().catch(() => ({} as { emp_no?: string; nickname?: string }));
  const nickname = normalizeNick(String(b.nickname ?? ''));
  if (!nickname) return c.json({ error: 'ニックネームを入力してください' }, 400);
  const empNo = toHalfWidth(String(b.emp_no ?? '').trim());
  let realName = '';
  if (empNo) {
    const emp = await c.env.DB.prepare('SELECT emp_no, name FROM employees WHERE emp_no = ? AND is_active = 1').bind(empNo).first<{ emp_no: string; name: string }>();
    if (!emp) return c.json({ error: '社員番号が確認できませんでした' }, 404);
    realName = emp.name;
    const exists = await c.env.DB.prepare('SELECT id, nickname, token FROM puzzle_players WHERE emp_no = ?').bind(emp.emp_no).first<PlayerRow>();
    if (exists) return c.json({ token: exists.token, nickname: exists.nickname, by_emp: true });
  }
  const dup = await c.env.DB.prepare('SELECT id FROM puzzle_players WHERE nickname = ?').bind(nickname).first<{ id: number }>();
  if (dup) return c.json({ error: 'そのニックネームはもう使われています。別の名前にしてください' }, 409);
  const token = newToken();
  await c.env.DB.prepare('INSERT INTO puzzle_players (emp_no, real_name, nickname, token) VALUES (?, ?, ?, ?)')
    .bind(empNo, realName, nickname, token).run();
  return c.json({ token, nickname, by_emp: !!empNo });
});

// 端末に保存した token から本人情報
app.post('/api/public/puzzle/me', async (c) => {
  const b = await c.req.json<{ token?: string }>().catch(() => ({} as { token?: string }));
  const token = String(b.token ?? '');
  if (!/^[0-9a-f]{48}$/.test(token)) return c.json({ error: '未登録' }, 404);
  const p = await c.env.DB.prepare('SELECT id, emp_no, real_name, nickname, token FROM puzzle_players WHERE token = ?').bind(token).first<PlayerRow>();
  if (!p) return c.json({ error: '未登録' }, 404);
  const best = await bestOf(c.env.DB, p.id);
  return c.json({ nickname: p.nickname, by_emp: !!p.emp_no, best });
});

// ニックネーム変更
app.post('/api/public/puzzle/nickname', async (c) => {
  const b = await c.req.json<{ token?: string; nickname?: string }>().catch(() => ({} as { token?: string; nickname?: string }));
  const token = String(b.token ?? '');
  const nickname = normalizeNick(String(b.nickname ?? ''));
  if (!nickname) return c.json({ error: 'ニックネームを入力してください' }, 400);
  const p = await c.env.DB.prepare('SELECT id FROM puzzle_players WHERE token = ?').bind(token).first<{ id: number }>();
  if (!p) return c.json({ error: '未登録' }, 404);
  const dup = await c.env.DB.prepare('SELECT id FROM puzzle_players WHERE nickname = ? AND id <> ?').bind(nickname, p.id).first<{ id: number }>();
  if (dup) return c.json({ error: 'そのニックネームはもう使われています' }, 409);
  await c.env.DB.prepare('UPDATE puzzle_players SET nickname = ? WHERE id = ?').bind(nickname, p.id).run();
  return c.json({ ok: true, nickname });
});

// プレイ結果の登録
app.post('/api/public/puzzle/result', async (c) => {
  const b = await c.req.json<{ token?: string; stages_cleared?: number; stages_total?: number; hp_left?: number; moves?: number; cleared?: boolean; team?: number[] }>()
    .catch(() => ({} as Record<string, never>));
  const token = String(b.token ?? '');
  const p = await c.env.DB.prepare('SELECT id FROM puzzle_players WHERE token = ?').bind(token).first<{ id: number }>();
  if (!p) return c.json({ error: '未登録' }, 404);
  const enemies = await loadEnemies(c.env.DB, true);
  const total = enemies.length;
  const toInt = (v: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number(v) || 0)));
  const stagesCleared = toInt(b.stages_cleared, 0, total);
  const cleared = total > 0 && stagesCleared >= total;
  const hpLeft = cleared ? toInt(b.hp_left, 0, 100) : 0;
  const moves = toInt(b.moves, stagesCleared, 9999);
  const team = Array.isArray(b.team) ? b.team.filter(x => Number.isInteger(x)).slice(0, 6) : [];
  const score = calcScore(stagesCleared, cleared, hpLeft, moves);
  await c.env.DB.prepare(`INSERT INTO puzzle_scores (player_id, stages_cleared, stages_total, hp_left, moves, cleared, score, team)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(p.id, stagesCleared, total, hpLeft, moves, cleared ? 1 : 0, score, JSON.stringify(team)).run();
  await c.env.DB.prepare("UPDATE puzzle_players SET last_played_at = datetime('now','localtime') WHERE id = ?").bind(p.id).run();
  const best = await bestOf(c.env.DB, p.id);
  const rank = await c.env.DB.prepare(`SELECT COUNT(*) + 1 AS r FROM (SELECT player_id, MAX(score) AS m FROM puzzle_scores GROUP BY player_id) t WHERE t.m > ?`)
    .bind(best?.score ?? 0).first<{ r: number }>();
  return c.json({ ok: true, score, best, rank: rank?.r ?? 1, is_best: (best?.score ?? 0) === score });
});

// ランキング（参加者ごとの最高スコア・上位50人）
app.get('/api/public/puzzle/ranking', async (c) => {
  const r = await c.env.DB.prepare(`
    SELECT p.nickname, MAX(s.score) AS score, MAX(s.cleared) AS cleared, COUNT(s.id) AS plays
    FROM puzzle_players p JOIN puzzle_scores s ON s.player_id = p.id
    GROUP BY p.id ORDER BY score DESC, MIN(s.id) ASC LIMIT 50`).all<{ nickname: string; score: number; cleared: number; plays: number }>();
  const total = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM puzzle_players').first<{ n: number }>();
  return c.json({ rows: r.results ?? [], players: total?.n ?? 0 });
});

// ===== ページ =====
app.get(PUZZLE_PATH, (c) => c.html(puzzlePageHtml()));

export default app;
