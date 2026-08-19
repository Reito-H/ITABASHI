// 事故モニター表示（ログイン不要・完全公開・パスワードなしで直接表示）
// ページ: {MONITOR_ACCIDENTS_PATH}   API: /api/public/accidents-monitor
// 管理画面ログイン（24時間でセッション切れ）だと、モニターに映しっぱなしにする用途では
// 翌日に再ログインが必要になり運用が崩れるため、通常のadmin認証を一切通さない別ルートにしている。
// URLの推測困難なランダム文字列自体をアクセス制御として扱う。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { MONITOR_ACCIDENTS_PATH } from '../config';
import { accidentsMonitorPage } from '../html/accidents_monitor';
import { bucketHourBands } from '../html/accidents';
import { fetchPublicNewcomerIntros, getNewcomerCardIntervalSeconds } from './public_newcomer_monitor';

const app = new Hono<{ Bindings: Env }>();

// 表示モード: 'accidents'=事故のみ（既定・現行動作） / 'newcomers'=新人紹介のみ / 'alternate'=交互表示
export const DISPLAY_MODE_KEY = 'accidents_monitor_display_mode';
export const ALTERNATE_SECONDS_KEY = 'accidents_monitor_alternate_seconds';
export const DEFAULT_ALTERNATE_SECONDS = 15;
export const MIN_ALTERNATE_SECONDS = 2;

export type MonitorDisplayMode = 'accidents' | 'newcomers' | 'alternate';

export async function getMonitorDisplaySettings(db: D1Database): Promise<{ mode: MonitorDisplayMode; alternateSeconds: number }> {
  const rows = await db.prepare(
    `SELECT key, value FROM system_settings WHERE key IN (?, ?)`
  ).bind(DISPLAY_MODE_KEY, ALTERNATE_SECONDS_KEY).all<{ key: string; value: string }>();
  const map = new Map((rows.results ?? []).map(r => [r.key, r.value]));

  const rawMode = map.get(DISPLAY_MODE_KEY);
  const mode: MonitorDisplayMode = (rawMode === 'newcomers' || rawMode === 'alternate') ? rawMode : 'accidents';

  const rawSeconds = parseInt(map.get(ALTERNATE_SECONDS_KEY) ?? '', 10);
  const alternateSeconds = Number.isFinite(rawSeconds) && rawSeconds >= MIN_ALTERNATE_SECONDS ? rawSeconds : DEFAULT_ALTERNATE_SECONDS;

  return { mode, alternateSeconds };
}

export async function saveMonitorDisplaySettings(db: D1Database, mode: MonitorDisplayMode, alternateSeconds: number): Promise<void> {
  const seconds = Math.max(MIN_ALTERNATE_SECONDS, Math.round(alternateSeconds));
  await db.batch([
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(DISPLAY_MODE_KEY, mode),
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(ALTERNATE_SECONDS_KEY, String(seconds)),
  ]);
}

function prevYm(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// 設定ページの「強制更新」ボタンから呼ばれる。system_settings の updated_at を更新するだけで、
// 実際のリロードはモニター画面側が /api/public/accidents-monitor-refresh-flag をポーリングして行う
// （モニターは別デバイスのため、サーバー経由でしか合図を送れない）
export async function triggerAccidentsMonitorForceRefresh(db: D1Database): Promise<void> {
  await db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES ('accidents_monitor_force_refresh_at', '1', datetime('now', 'localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run();
}

async function getForceRefreshUpdatedAt(db: D1Database): Promise<string> {
  try {
    const row = await db.prepare("SELECT updated_at FROM system_settings WHERE key = 'accidents_monitor_force_refresh_at'")
      .first<{ updated_at: string }>();
    return row?.updated_at ?? '';
  } catch {
    return '';
  }
}

app.get(MONITOR_ACCIDENTS_PATH, (c) => c.html(accidentsMonitorPage()));

app.get('/api/public/accidents-monitor-refresh-flag', async (c) => {
  return c.json({ updatedAt: await getForceRefreshUpdatedAt(c.env.DB) });
});

app.get('/api/public/accidents-monitor', async (c) => {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const ym = jstNow.toISOString().slice(0, 7);
  const prevYmStr = prevYm(ym);

  const displaySettings = await getMonitorDisplaySettings(c.env.DB);
  const needsNewcomers = displaySettings.mode === 'newcomers' || displaySettings.mode === 'alternate';

  const [rows, prevCountRow, divisionRows, newcomers, newcomerCardIntervalSeconds] = await Promise.all([
    c.env.DB.prepare(`SELECT occurred_time FROM accident_records WHERE substr(occurred_date, 1, 7) = ?`)
      .bind(ym).all<{ occurred_time: string | null }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM accident_records WHERE substr(occurred_date, 1, 7) = ?`)
      .bind(prevYmStr).first<{ cnt: number }>(),
    c.env.DB.prepare(
      `SELECT division, COUNT(*) AS cnt FROM accident_records WHERE substr(occurred_date, 1, 7) = ? GROUP BY division ORDER BY division`
    ).bind(ym).all<{ division: number | null; cnt: number }>(),
    needsNewcomers ? fetchPublicNewcomerIntros(c.env.DB) : Promise.resolve([]),
    needsNewcomers ? getNewcomerCardIntervalSeconds(c.env.DB) : Promise.resolve(8),
  ]);

  const times = (rows.results ?? []).map(r => r.occurred_time);
  const [y, m] = ym.split('-');

  // 事故が0件の課も含めて1〜4課を必ず全て表示する（データが無い＝欠落ではなく「0件」として見せる）
  const cntByDivision = new Map((divisionRows.results ?? []).map(r => [r.division, r.cnt]));
  const divisions: Array<{ division: number | null; cnt: number }> =
    [1, 2, 3, 4].map(division => ({ division, cnt: cntByDivision.get(division) ?? 0 }));
  const unknownCnt = cntByDivision.get(null) ?? 0;
  if (unknownCnt > 0) divisions.push({ division: null, cnt: unknownCnt });

  return c.json({
    monthLabel: `${y}年${parseInt(m, 10)}月度`,
    count: times.length,
    prevCount: prevCountRow?.cnt ?? null,
    divisions,
    bands: bucketHourBands(times),
    generatedAt: jstNow.toISOString(),
    displayMode: displaySettings.mode,
    alternateSeconds: displaySettings.alternateSeconds,
    newcomers,
    newcomerCardIntervalSeconds,
  });
});

export default app;
