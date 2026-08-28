// 新人紹介モニター表示（ログイン不要・完全公開・パスワードなしで直接表示）
// ページ: {MONITOR_NEWCOMERS_PATH}   API: /api/public/newcomer-intros, /api/public/newcomer-photo/:id
// 事故モニターと別の物理サイネージに映す用途のため別URLにしている（表示モードの切替設定には関係なく常に新人紹介のみを表示する）。
// URLの推測困難なランダム文字列自体をアクセス制御として扱う（public_accidents_monitor.tsと同じ設計）。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { MONITOR_NEWCOMERS_PATH } from '../config';
import { newcomerMonitorPage } from '../html/newcomer_monitor';

const app = new Hono<{ Bindings: Env }>();

// /api/public/newcomer-intros・/api/public/newcomer-photo は完全公開のためパスさえ知れば誰でも叩けてしまう。
// モニターページの秘密パス自体をトークンとして要求することで、モニターURLを知らない第三者からのアクセスを防ぐ
// （モニターページ本体はこのモジュールの外に秘密パスを漏らさないので、URL方式と同じ強度を維持できる）
const MONITOR_TOKEN = MONITOR_NEWCOMERS_PATH.replace(/^\//, '');

// 新人紹介カードを何秒ごとに次のカードへ自動送りするか（新人紹介専用モニター・事故モニターの新人紹介表示 共通）
export const CARD_INTERVAL_KEY = 'newcomer_card_interval_seconds';
export const DEFAULT_CARD_INTERVAL_SECONDS = 8;
export const MIN_CARD_INTERVAL_SECONDS = 2;

export async function getNewcomerCardIntervalSeconds(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT value FROM system_settings WHERE key = ?').bind(CARD_INTERVAL_KEY).first<{ value: string }>();
  const raw = parseInt(row?.value ?? '', 10);
  return Number.isFinite(raw) && raw >= MIN_CARD_INTERVAL_SECONDS ? raw : DEFAULT_CARD_INTERVAL_SECONDS;
}

export async function saveNewcomerCardIntervalSeconds(db: D1Database, seconds: number): Promise<void> {
  const value = String(Math.max(MIN_CARD_INTERVAL_SECONDS, Math.round(seconds)));
  await db.prepare(`
    INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(CARD_INTERVAL_KEY, value).run();
}

type NewcomerIntroRow = {
  id: number;
  name: string;
  team: number | null;
  comment: string | null;
  photo_r2_key: string | null;
  photo_mime_type: string | null;
};

// 新人紹介カードが追加・編集・削除・並び替えされたら呼ばれる。system_settings の updated_at を更新するだけで、
// 実際のリロードはモニター画面側が /api/public/newcomer-monitor-refresh-flag をポーリングして行う
export async function triggerNewcomerMonitorForceRefresh(db: D1Database): Promise<void> {
  await db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES ('newcomer_monitor_force_refresh_at', '1', datetime('now', 'localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run();
}

async function getForceRefreshUpdatedAt(db: D1Database): Promise<string> {
  try {
    const row = await db.prepare("SELECT updated_at FROM system_settings WHERE key = 'newcomer_monitor_force_refresh_at'")
      .first<{ updated_at: string }>();
    return row?.updated_at ?? '';
  } catch {
    return '';
  }
}

app.get(MONITOR_NEWCOMERS_PATH, (c) => c.html(newcomerMonitorPage(MONITOR_TOKEN)));

app.get('/api/public/newcomer-monitor-refresh-flag', async (c) => {
  return c.json({ updatedAt: await getForceRefreshUpdatedAt(c.env.DB) });
});

export type PublicNewcomerIntro = {
  id: number;
  name: string;
  division: number | null;
  team: number | null;
  comment: string | null;
  photoUrl: string | null;
};

// 事故モニター（新人紹介モード/交互表示モード）からも同じデータ形式で参照するための共通取得関数
export async function fetchPublicNewcomerIntros(db: D1Database): Promise<PublicNewcomerIntro[]> {
  const rows = await db.prepare(
    'SELECT id, name, team, comment, photo_r2_key, photo_mime_type FROM newcomer_intros ORDER BY display_order ASC, id ASC'
  ).all<NewcomerIntroRow>();
  return (rows.results ?? []).map(r => ({
    id: r.id,
    name: r.name,
    division: r.team != null ? Math.ceil(r.team / 2) : null,
    team: r.team,
    comment: r.comment,
    photoUrl: r.photo_r2_key ? `/api/public/newcomer-photo/${r.id}?t=${encodeURIComponent(MONITOR_TOKEN)}` : null,
  }));
}

app.get('/api/public/newcomer-intros', async (c) => {
  if (c.req.query('t') !== MONITOR_TOKEN) return c.json({ error: 'Not found' }, 404);
  const [intros, cardIntervalSeconds] = await Promise.all([
    fetchPublicNewcomerIntros(c.env.DB),
    getNewcomerCardIntervalSeconds(c.env.DB),
  ]);
  return c.json({ intros, cardIntervalSeconds, generatedAt: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString() });
});

app.get('/api/public/newcomer-photo/:id', async (c) => {
  if (c.req.query('t') !== MONITOR_TOKEN) return c.json({ error: 'Not found' }, 404);
  const id = parseInt(c.req.param('id'), 10);
  const row = await c.env.DB.prepare('SELECT photo_r2_key, photo_mime_type FROM newcomer_intros WHERE id = ?')
    .bind(id).first<{ photo_r2_key: string | null; photo_mime_type: string | null }>();
  if (!row || !row.photo_r2_key) return c.json({ error: '見つかりません' }, 404);

  const obj = await c.env.DOCUMENTS_BUCKET.get(row.photo_r2_key);
  if (!obj) return c.json({ error: '写真が見つかりません' }, 404);

  const headers = new Headers();
  headers.set('Content-Type', row.photo_mime_type || 'application/octet-stream');
  return new Response(obj.body, { headers });
});

export default app;
