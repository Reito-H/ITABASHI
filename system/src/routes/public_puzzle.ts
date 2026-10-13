// バジル&ドラゴンズ（公開・ゲームページ）
// ログイン不要。共有URL {PUZZLE_PATH} を開き、社員番号（employees と照合）または ニックネーム で参戦する。
// 味方キャラ（社員写真＝全員所持、オリジナルキャラ＝ガチャで入手）からチームを組み、3マッチパズルで敵を順番に倒す。
// コインでガチャ・強化（育成）。レベルは経験値から計算（expToLevel）。
// ページ: {PUZZLE_PATH}    API: /api/public/puzzle/*
// 認証は一切行わない（端末の token で本人特定）。例外は裏パネル（/cheat/*）で、管理画面の admin セッションCookieが必要。
// 管理側（設定 → バトル設定）は routes/admin_puzzle.ts、画面は html/puzzle_page.ts を参照。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { getSessionFromCookie, validateSession } from '../auth';
import { PUZZLE_PATH } from '../config';
import { isAdminAccount } from '../utils/maintenance';
import { puzzlePageHtml } from '../html/puzzle_page';

const app = new Hono<{ Bindings: Env }>();

export const ELEMENTS = ['fire', 'water', 'wood', 'light', 'dark'] as const;
export type Element = typeof ELEMENTS[number];
export const ELEMENT_LABEL: Record<Element, string> = { fire: '火', water: '水', wood: '木', light: '光', dark: '闇' };
const ELEMENT_COLOR: Record<string, string> = { fire: '#ff5a5f', water: '#3fa9ff', wood: '#41d47d', light: '#ffd93d', dark: '#b66dff' };

// 裏パネルを出す合言葉（ゲーム画面のロゴを5回タップ → 入力欄に打つ）。admin セッションがないと通らない
export const CHEAT_COMMAND = '/basil';
export const MAX_LEVEL = 50;
export const GUIDE_IMG_KEY = 'puzzle/guide.jpg';
export const GUIDE_PROMPT = 'photorealistic cute small fairy girl made of fresh basil leaves, green leaf wings, glowing green light, friendly smile, fantasy, cinematic lighting, dark background, 8k';

export type PuzzleSettings = { title: string; is_open: number; team_size: number; enemy_interval: number; gacha_cost: number; train_cost: number };

export async function loadPuzzleSettings(db: D1Database): Promise<PuzzleSettings> {
  const row = await db.prepare('SELECT title, is_open, team_size, enemy_interval, gacha_cost, train_cost FROM puzzle_settings WHERE id = 1').first<PuzzleSettings>();
  return {
    title: row?.title ?? 'バジル&ドラゴンズ',
    is_open: row?.is_open ?? 0,
    team_size: Math.min(4, Math.max(1, row?.team_size ?? 3)),
    enemy_interval: Math.min(6, Math.max(1, row?.enemy_interval ?? 3)),
    gacha_cost: Math.max(1, row?.gacha_cost ?? 300),
    train_cost: Math.max(1, row?.train_cost ?? 100),
  };
}

export type AllyRow = { id: number; name: string; kind: string; rarity: number; in_gacha: number; description: string; art_prompt: string; photo_r2_key: string | null; photo_offset_x: number; photo_offset_y: number; photo_scale: number; hp: number; atk: number; element: string; is_active: number; sort_order: number };
export type EnemyRow = { id: number; name: string; photo_r2_key: string | null; hp: number; atk: number; element: string; is_boss: number; is_final: number; description: string; art_prompt: string; is_active: number; sort_order: number };

export async function loadAllies(db: D1Database, activeOnly: boolean): Promise<AllyRow[]> {
  const r = await db.prepare(`SELECT id, name, kind, rarity, in_gacha, description, art_prompt, photo_r2_key, photo_offset_x, photo_offset_y, photo_scale, hp, atk, element, is_active, sort_order
    FROM puzzle_allies ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY sort_order ASC, id ASC`).all<AllyRow>();
  return r.results ?? [];
}
export async function loadEnemies(db: D1Database, activeOnly: boolean): Promise<EnemyRow[]> {
  const r = await db.prepare(`SELECT id, name, photo_r2_key, hp, atk, element, is_boss, is_final, description, art_prompt, is_active, sort_order
    FROM puzzle_enemies ${activeOnly ? 'WHERE is_active = 1' : ''} ORDER BY sort_order ASC, id ASC`).all<EnemyRow>();
  return r.results ?? [];
}

// ---- 育成 ----
// 経験値→レベル（Lv n に必要な累計exp = 40 * (n-1)^2）。ステータス倍率 = 1 + 0.05 * (Lv-1)
export function expToLevel(exp: number): number {
  return Math.min(MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, exp) / 40)) + 1);
}
export function expForLevel(level: number): number {
  return 40 * (level - 1) * (level - 1);
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
const esc = (s: string) => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));

type PlayerRow = { id: number; emp_no: string; real_name: string; nickname: string; token: string; coins: number; is_cheater: number };

async function playerByToken(db: D1Database, token: string): Promise<PlayerRow | null> {
  if (!/^[0-9a-f]{48}$/.test(token)) return null;
  return db.prepare('SELECT id, emp_no, real_name, nickname, token, coins, is_cheater FROM puzzle_players WHERE token = ?').bind(token).first<PlayerRow>();
}

async function bestOf(db: D1Database, playerId: number) {
  return db.prepare('SELECT score, stages_cleared, stages_total, cleared, hp_left, moves FROM puzzle_scores WHERE player_id = ? AND cheated = 0 ORDER BY score DESC, id ASC LIMIT 1')
    .bind(playerId).first<{ score: number; stages_cleared: number; stages_total: number; cleared: number; hp_left: number; moves: number }>();
}

// 所持キャラ（写真キャラは全員所持。exp は puzzle_player_chars にあればその値）
async function ownedChars(db: D1Database, playerId: number, allies: AllyRow[]) {
  const rows = (await db.prepare('SELECT ally_id, exp FROM puzzle_player_chars WHERE player_id = ?').bind(playerId).all<{ ally_id: number; exp: number }>()).results ?? [];
  const expMap = new Map(rows.map(r => [r.ally_id, r.exp]));
  return allies.filter(a => a.kind === 'photo' || expMap.has(a.id)).map(a => {
    const exp = expMap.get(a.id) ?? 0;
    return { id: a.id, exp, level: expToLevel(exp) };
  });
}

// 画像が未登録のキャラ・敵は仮の絵（SVG）を返す
function placeholderSvg(name: string, element: string, opts: { rarity?: number; boss?: boolean; final?: boolean }): string {
  const col = ELEMENT_COLOR[element] ?? '#94a3b8';
  const glyph = name.replace(/【.*?】/g, '').trim().charAt(0) || '?';
  const stars = opts.rarity ? '★'.repeat(opts.rarity) : '';
  const tag = opts.final ? 'FINAL BOSS' : opts.boss ? 'BOSS' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <defs>
    <radialGradient id="g" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="${col}" stop-opacity="0.95"/><stop offset="1" stop-color="#0b1020"/></radialGradient>
    <radialGradient id="s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="400" height="400" fill="url(#g)"/>
  <circle cx="200" cy="170" r="120" fill="url(#s)"/>
  <circle cx="200" cy="170" r="96" fill="#0b1020" fill-opacity="0.55" stroke="${col}" stroke-width="6"/>
  <text x="200" y="208" text-anchor="middle" font-family="'Hiragino Sans','Meiryo',sans-serif" font-size="110" font-weight="900" fill="#fff">${esc(glyph)}</text>
  ${stars ? `<text x="200" y="312" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#ffd93d">${stars}</text>` : ''}
  ${tag ? `<text x="200" y="312" text-anchor="middle" font-family="sans-serif" font-size="30" font-weight="900" fill="#ff5a5f" letter-spacing="4">${tag}</text>` : ''}
  <text x="200" y="372" text-anchor="middle" font-family="'Hiragino Sans','Meiryo',sans-serif" font-size="22" fill="#cbd5e1">画像 準備中</text>
</svg>`;
}

async function serveImage(c: { env: Env }, key: string | null, mime: string | null, fallback: () => string): Promise<Response> {
  if (key) {
    const obj = await c.env.DOCUMENTS_BUCKET.get(key);
    if (obj) {
      const m = mime ?? obj.httpMetadata?.contentType ?? '';
      return new Response(obj.body, { headers: { 'Content-Type': /^image\/(jpeg|png|gif|webp|avif)$/.test(m) ? m : 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' } });
    }
  }
  return new Response(fallback(), { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=600' } });
}

// ===== API: 公開情報 =====
app.get('/api/public/puzzle/config', async (c) => {
  const s = await loadPuzzleSettings(c.env.DB);
  const allies = (await loadAllies(c.env.DB, true)).map(a => ({
    id: a.id, name: a.name, kind: a.kind, rarity: a.rarity, in_gacha: !!a.in_gacha, desc: a.description, hp: a.hp, atk: a.atk, element: a.element, img: !!a.photo_r2_key,
    ox: a.photo_offset_x, oy: a.photo_offset_y, sc: a.photo_scale,
  }));
  const enemies = (await loadEnemies(c.env.DB, true)).map(e => ({ id: e.id, name: e.name, hp: e.hp, atk: e.atk, element: e.element, boss: !!e.is_boss, final: !!e.is_final, desc: e.description, img: !!e.photo_r2_key }));
  const guide = await c.env.DOCUMENTS_BUCKET.head(GUIDE_IMG_KEY).catch(() => null);
  return c.json({ title: s.title, open: !!s.is_open, team_size: s.team_size, enemy_interval: s.enemy_interval, gacha_cost: s.gacha_cost, train_cost: s.train_cost, max_level: MAX_LEVEL, guide_img: !!guide, allies, enemies });
});

// 案内人 妖精バジルの画像（管理画面の「AIで作る」で R2 に保存。無ければ 404 → 画面側はSVGのまま）
app.get('/api/public/puzzle/img/guide', async (c) => {
  const obj = await c.env.DOCUMENTS_BUCKET.get(GUIDE_IMG_KEY);
  if (!obj) return c.text('Not found', 404);
  return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg', 'Cache-Control': 'public, max-age=600' } });
});

app.get('/api/public/puzzle/img/ally/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const row = await c.env.DB.prepare('SELECT name, element, rarity, kind, photo_r2_key, photo_mime FROM puzzle_allies WHERE id = ?').bind(id).first<{ name: string; element: string; rarity: number; kind: string; photo_r2_key: string | null; photo_mime: string | null }>();
  if (!row) return c.text('Not found', 404);
  return serveImage(c, row.photo_r2_key, row.photo_mime, () => placeholderSvg(row.name, row.element, { rarity: row.kind === 'art' ? row.rarity : 0 }));
});
app.get('/api/public/puzzle/img/enemy/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const row = await c.env.DB.prepare('SELECT name, element, is_boss, is_final, photo_r2_key, photo_mime FROM puzzle_enemies WHERE id = ?').bind(id).first<{ name: string; element: string; is_boss: number; is_final: number; photo_r2_key: string | null; photo_mime: string | null }>();
  if (!row) return c.text('Not found', 404);
  return serveImage(c, row.photo_r2_key, row.photo_mime, () => placeholderSvg(row.name, row.element, { boss: !!row.is_boss, final: !!row.is_final }));
});

// ===== API: 参戦 =====
app.post('/api/public/puzzle/lookup', async (c) => {
  const b = await c.req.json<{ emp_no?: string }>().catch(() => ({} as { emp_no?: string }));
  const empNo = toHalfWidth(String(b.emp_no ?? '').trim());
  if (!empNo) return c.json({ error: '社員番号を入力してください' }, 400);
  const emp = await c.env.DB.prepare('SELECT emp_no, name FROM employees WHERE emp_no = ? AND is_active = 1').bind(empNo).first<{ emp_no: string; name: string }>();
  if (!emp) return c.json({ error: '社員番号が確認できませんでした。番号を確認するか、「ニックネームで参戦」を使ってください' }, 404);
  const p = await c.env.DB.prepare('SELECT id, nickname, token FROM puzzle_players WHERE emp_no = ?').bind(emp.emp_no).first<{ id: number; nickname: string; token: string }>();
  if (p) return c.json({ registered: true, name: emp.name, nickname: p.nickname, token: p.token });
  return c.json({ registered: false, name: emp.name });
});

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
    const exists = await c.env.DB.prepare('SELECT nickname, token FROM puzzle_players WHERE emp_no = ?').bind(emp.emp_no).first<{ nickname: string; token: string }>();
    if (exists) return c.json({ token: exists.token, nickname: exists.nickname, by_emp: true });
  }
  const dup = await c.env.DB.prepare('SELECT id FROM puzzle_players WHERE nickname = ?').bind(nickname).first<{ id: number }>();
  if (dup) return c.json({ error: 'そのニックネームはもう使われています。別の名前にしてください' }, 409);
  const token = newToken();
  await c.env.DB.prepare('INSERT INTO puzzle_players (emp_no, real_name, nickname, token) VALUES (?, ?, ?, ?)').bind(empNo, realName, nickname, token).run();
  return c.json({ token, nickname, by_emp: !!empNo });
});

// 本人の状態（コイン・所持キャラとレベル・自己ベスト）
app.post('/api/public/puzzle/state', async (c) => {
  const b = await c.req.json<{ token?: string }>().catch(() => ({} as { token?: string }));
  const p = await playerByToken(c.env.DB, String(b.token ?? ''));
  if (!p) return c.json({ error: '未登録' }, 404);
  const allies = await loadAllies(c.env.DB, true);
  const chars = await ownedChars(c.env.DB, p.id, allies);
  const best = await bestOf(c.env.DB, p.id);
  return c.json({ nickname: p.nickname, by_emp: !!p.emp_no, coins: p.coins, chars, best });
});

app.post('/api/public/puzzle/nickname', async (c) => {
  const b = await c.req.json<{ token?: string; nickname?: string }>().catch(() => ({} as { token?: string; nickname?: string }));
  const nickname = normalizeNick(String(b.nickname ?? ''));
  if (!nickname) return c.json({ error: 'ニックネームを入力してください' }, 400);
  const p = await playerByToken(c.env.DB, String(b.token ?? ''));
  if (!p) return c.json({ error: '未登録' }, 404);
  const dup = await c.env.DB.prepare('SELECT id FROM puzzle_players WHERE nickname = ? AND id <> ?').bind(nickname, p.id).first<{ id: number }>();
  if (dup) return c.json({ error: 'そのニックネームはもう使われています' }, 409);
  await c.env.DB.prepare('UPDATE puzzle_players SET nickname = ? WHERE id = ?').bind(nickname, p.id).run();
  return c.json({ ok: true, nickname });
});

// ===== API: ガチャ =====
const RARITY_WEIGHT: Record<number, number> = { 5: 4, 4: 26, 3: 70, 2: 0, 1: 0 };
app.post('/api/public/puzzle/gacha', async (c) => {
  const b = await c.req.json<{ token?: string; n?: number }>().catch(() => ({} as { token?: string; n?: number }));
  const p = await playerByToken(c.env.DB, String(b.token ?? ''));
  if (!p) return c.json({ error: '未登録' }, 404);
  const s = await loadPuzzleSettings(c.env.DB);
  const n = Number(b.n) === 10 ? 10 : 1;
  const cost = n === 10 ? s.gacha_cost * 9 : s.gacha_cost;   // 10連は1回ぶんおトク
  if (p.coins < cost) return c.json({ error: 'コインが足りません（あと ' + (cost - p.coins) + ' コイン）' }, 400);
  const pool = (await loadAllies(c.env.DB, true)).filter(a => a.kind === 'art' && a.in_gacha);
  if (!pool.length) return c.json({ error: 'ガチャの準備中です' }, 400);
  const owned = new Set((((await c.env.DB.prepare('SELECT ally_id FROM puzzle_player_chars WHERE player_id = ?').bind(p.id).all<{ ally_id: number }>()).results) ?? []).map(r => r.ally_id));
  const byRarity = new Map<number, AllyRow[]>();
  pool.forEach(a => { const arr = byRarity.get(a.rarity) ?? []; arr.push(a); byRarity.set(a.rarity, arr); });
  const rarities = [...byRarity.keys()];
  const totalW = rarities.reduce((t, r) => t + (RARITY_WEIGHT[r] ?? 10), 0);
  const results: Array<{ id: number; dup: boolean; bonus_exp: number }> = [];
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < n; i++) {
    let roll = Math.random() * totalW; let rarity = rarities[0];
    for (const r of rarities) { roll -= (RARITY_WEIGHT[r] ?? 10); if (roll <= 0) { rarity = r; break; } }
    // 10連の最後の1枚は★4以上を保証
    if (n === 10 && i === 9 && rarity < 4 && rarities.some(r => r >= 4)) rarity = Math.max(...rarities.filter(r => r >= 4));
    const arr = byRarity.get(rarity)!;
    const pick = arr[Math.floor(Math.random() * arr.length)];
    if (owned.has(pick.id)) {
      const bonus = pick.rarity * 100;
      stmts.push(c.env.DB.prepare('UPDATE puzzle_player_chars SET exp = exp + ? WHERE player_id = ? AND ally_id = ?').bind(bonus, p.id, pick.id));
      results.push({ id: pick.id, dup: true, bonus_exp: bonus });
    } else {
      owned.add(pick.id);
      stmts.push(c.env.DB.prepare('INSERT OR IGNORE INTO puzzle_player_chars (player_id, ally_id, exp) VALUES (?, ?, 0)').bind(p.id, pick.id));
      results.push({ id: pick.id, dup: false, bonus_exp: 0 });
    }
  }
  stmts.push(c.env.DB.prepare('UPDATE puzzle_players SET coins = coins - ? WHERE id = ?').bind(cost, p.id));
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, results, coins: p.coins - cost, cost });
});

// ===== API: 強化（育成） =====
app.post('/api/public/puzzle/train', async (c) => {
  const b = await c.req.json<{ token?: string; ally_id?: number }>().catch(() => ({} as { token?: string; ally_id?: number }));
  const p = await playerByToken(c.env.DB, String(b.token ?? ''));
  if (!p) return c.json({ error: '未登録' }, 404);
  const s = await loadPuzzleSettings(c.env.DB);
  const allyId = Number(b.ally_id);
  const ally = await c.env.DB.prepare('SELECT id, kind FROM puzzle_allies WHERE id = ? AND is_active = 1').bind(allyId).first<{ id: number; kind: string }>();
  if (!ally) return c.json({ error: 'キャラが見つかりません' }, 404);
  const row = await c.env.DB.prepare('SELECT exp FROM puzzle_player_chars WHERE player_id = ? AND ally_id = ?').bind(p.id, allyId).first<{ exp: number }>();
  if (!row && ally.kind !== 'photo') return c.json({ error: 'まだ持っていないキャラです' }, 400);
  if (expToLevel(row?.exp ?? 0) >= MAX_LEVEL) return c.json({ error: 'もうレベルMAXです' }, 400);
  if (p.coins < s.train_cost) return c.json({ error: 'コインが足りません' }, 400);
  const gain = 150;
  await c.env.DB.batch([
    c.env.DB.prepare('INSERT INTO puzzle_player_chars (player_id, ally_id, exp) VALUES (?, ?, ?) ON CONFLICT(player_id, ally_id) DO UPDATE SET exp = exp + ?').bind(p.id, allyId, gain, gain),
    c.env.DB.prepare('UPDATE puzzle_players SET coins = coins - ? WHERE id = ?').bind(s.train_cost, p.id),
  ]);
  const exp = (row?.exp ?? 0) + gain;
  return c.json({ ok: true, exp, level: expToLevel(exp), coins: p.coins - s.train_cost, leveled: expToLevel(exp) > expToLevel(row?.exp ?? 0) });
});

// ===== API: プレイ結果（報酬つき） =====
app.post('/api/public/puzzle/result', async (c) => {
  const b = await c.req.json<{ token?: string; stages_cleared?: number; hp_left?: number; moves?: number; cleared?: boolean; team?: number[]; cheated?: boolean }>()
    .catch(() => ({} as Record<string, never>));
  const p = await playerByToken(c.env.DB, String(b.token ?? ''));
  if (!p) return c.json({ error: '未登録' }, 404);
  const enemies = await loadEnemies(c.env.DB, true);
  const total = enemies.length;
  const toInt = (v: unknown, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number(v) || 0)));
  const stagesCleared = toInt(b.stages_cleared, 0, total);
  const cleared = total > 0 && stagesCleared >= total;
  const hpLeft = cleared ? toInt(b.hp_left, 0, 100) : 0;
  const moves = toInt(b.moves, stagesCleared, 9999);
  const cheated = !!b.cheated;
  const team = Array.isArray(b.team) ? b.team.filter(x => Number.isInteger(x)).slice(0, 6) as number[] : [];
  const score = calcScore(stagesCleared, cleared, hpLeft, moves);
  // 報酬: コインは倒した敵の数とスコアから、経験値はチーム全員に
  const coins = cheated ? 0 : Math.round(score / 25) + 50 + stagesCleared * 30;
  const expGain = cheated ? 0 : stagesCleared * 120 + 50 + (cleared ? 500 : 0);
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(`INSERT INTO puzzle_scores (player_id, stages_cleared, stages_total, hp_left, moves, cleared, score, team, cheated, coins_earned)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(p.id, stagesCleared, total, hpLeft, moves, cleared ? 1 : 0, score, JSON.stringify(team), cheated ? 1 : 0, coins),
    c.env.DB.prepare("UPDATE puzzle_players SET last_played_at = datetime('now','localtime'), coins = coins + ? WHERE id = ?").bind(coins, p.id),
  ];
  const before = new Map<number, number>();
  if (expGain > 0 && team.length) {
    const rows = (await c.env.DB.prepare(`SELECT ally_id, exp FROM puzzle_player_chars WHERE player_id = ? AND ally_id IN (${team.map(() => '?').join(',')})`).bind(p.id, ...team).all<{ ally_id: number; exp: number }>()).results ?? [];
    rows.forEach(r => before.set(r.ally_id, r.exp));
    for (const id of team) {
      stmts.push(c.env.DB.prepare('INSERT INTO puzzle_player_chars (player_id, ally_id, exp) VALUES (?, ?, ?) ON CONFLICT(player_id, ally_id) DO UPDATE SET exp = exp + ?').bind(p.id, id, expGain, expGain));
    }
  }
  await c.env.DB.batch(stmts);
  const levelUps = team.map(id => { const e0 = before.get(id) ?? 0; return { id, from: expToLevel(e0), to: expToLevel(e0 + expGain) }; }).filter(x => x.to > x.from);
  const best = await bestOf(c.env.DB, p.id);
  const rank = await c.env.DB.prepare(`SELECT COUNT(*) + 1 AS r FROM (SELECT player_id, MAX(score) AS m FROM puzzle_scores WHERE cheated = 0 GROUP BY player_id) t WHERE t.m > ?`)
    .bind(best?.score ?? 0).first<{ r: number }>();
  return c.json({ ok: true, score, best, rank: rank?.r ?? 1, is_best: !cheated && (best?.score ?? 0) === score, coins_earned: coins, coins: p.coins + coins, exp_gain: expGain, level_ups: levelUps, cheated });
});

app.get('/api/public/puzzle/ranking', async (c) => {
  const r = await c.env.DB.prepare(`
    SELECT p.nickname, MAX(s.score) AS score, MAX(s.cleared) AS cleared, COUNT(s.id) AS plays
    FROM puzzle_players p JOIN puzzle_scores s ON s.player_id = p.id AND s.cheated = 0
    GROUP BY p.id ORDER BY score DESC, MIN(s.id) ASC LIMIT 50`).all<{ nickname: string; score: number; cleared: number; plays: number }>();
  const total = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM puzzle_players').first<{ n: number }>();
  return c.json({ rows: r.results ?? [], players: total?.n ?? 0 });
});

// ===== API: 裏パネル（admin セッション必須） =====
async function isAdminSession(c: { env: Env; req: { header: (n: string) => string | undefined } }): Promise<boolean> {
  const sid = getSessionFromCookie(c.req.header('Cookie') ?? null);
  if (!sid) return false;
  const adminId = await validateSession(c.env.DB, sid);
  if (!adminId) return false;
  return isAdminAccount(c.env.DB, adminId);
}
app.post('/api/public/puzzle/cheat/auth', async (c) => {
  const b = await c.req.json<{ command?: string }>().catch(() => ({} as { command?: string }));
  if (String(b.command ?? '').trim() !== CHEAT_COMMAND) return c.json({ error: '合言葉がちがいます' }, 403);
  if (!(await isAdminSession(c))) return c.json({ error: '裏パネルは admin アカウントで管理画面にログインしているブラウザだけで使えます' }, 403);
  return c.json({ ok: true });
});
app.post('/api/public/puzzle/cheat/apply', async (c) => {
  const b = await c.req.json<{ token?: string; command?: string; action?: string }>().catch(() => ({} as { token?: string; command?: string; action?: string }));
  if (String(b.command ?? '').trim() !== CHEAT_COMMAND || !(await isAdminSession(c))) return c.json({ error: '権限がありません' }, 403);
  const p = await playerByToken(c.env.DB, String(b.token ?? ''));
  if (!p) return c.json({ error: '未登録' }, 404);
  const action = String(b.action ?? '');
  const allies = await loadAllies(c.env.DB, true);
  if (action === 'coins') {
    await c.env.DB.prepare('UPDATE puzzle_players SET coins = coins + 10000, is_cheater = 1 WHERE id = ?').bind(p.id).run();
  } else if (action === 'unlock_all') {
    await c.env.DB.batch([
      ...allies.filter(a => a.kind === 'art').map(a => c.env.DB.prepare('INSERT OR IGNORE INTO puzzle_player_chars (player_id, ally_id, exp) VALUES (?, ?, 0)').bind(p.id, a.id)),
      c.env.DB.prepare('UPDATE puzzle_players SET is_cheater = 1 WHERE id = ?').bind(p.id),
    ]);
  } else if (action === 'level_max') {
    const maxExp = expForLevel(MAX_LEVEL);
    await c.env.DB.batch([
      ...allies.map(a => c.env.DB.prepare('INSERT INTO puzzle_player_chars (player_id, ally_id, exp) VALUES (?, ?, ?) ON CONFLICT(player_id, ally_id) DO UPDATE SET exp = ?').bind(p.id, a.id, maxExp, maxExp)),
      c.env.DB.prepare('UPDATE puzzle_players SET is_cheater = 1 WHERE id = ?').bind(p.id),
    ]);
  } else if (action === 'reset_me') {
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM puzzle_player_chars WHERE player_id = ?').bind(p.id),
      c.env.DB.prepare('DELETE FROM puzzle_scores WHERE player_id = ?').bind(p.id),
      c.env.DB.prepare('UPDATE puzzle_players SET coins = 500, is_cheater = 0 WHERE id = ?').bind(p.id),
    ]);
  } else {
    return c.json({ error: '不明な操作' }, 400);
  }
  const np = await playerByToken(c.env.DB, p.token);
  return c.json({ ok: true, coins: np?.coins ?? 0 });
});

// ===== ページ =====
app.get(PUZZLE_PATH, (c) => c.html(puzzlePageHtml()));

export default app;
