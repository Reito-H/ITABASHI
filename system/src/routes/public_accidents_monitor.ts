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

const app = new Hono<{ Bindings: Env }>();

function prevYm(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export type PublicAccidentBoard = {
  monthLabel: string;
  count: number;
  prevCount: number | null;
  divisions: Array<{ division: number | null; cnt: number }>;
  bands: number[];
};

// 今月の事故件数ボード（総数・前月比・課別・時間帯）を組み立てる共通関数。
// 事故モニター単独ページと、統合デジタルサイネージの 'accidents' スライドの両方から使う。
export async function fetchPublicAccidentBoard(db: D1Database): Promise<PublicAccidentBoard> {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const ym = jstNow.toISOString().slice(0, 7);
  const prevYmStr = prevYm(ym);

  const [rows, prevCountRow, divisionRows] = await Promise.all([
    db.prepare(`SELECT occurred_time FROM accident_records WHERE substr(occurred_date, 1, 7) = ?`)
      .bind(ym).all<{ occurred_time: string | null }>(),
    db.prepare(`SELECT COUNT(*) AS cnt FROM accident_records WHERE substr(occurred_date, 1, 7) = ?`)
      .bind(prevYmStr).first<{ cnt: number }>(),
    db.prepare(
      `SELECT division, COUNT(*) AS cnt FROM accident_records WHERE substr(occurred_date, 1, 7) = ? GROUP BY division ORDER BY division`
    ).bind(ym).all<{ division: number | null; cnt: number }>(),
  ]);

  const times = (rows.results ?? []).map(r => r.occurred_time);
  const [y, m] = ym.split('-');

  const cntByDivision = new Map((divisionRows.results ?? []).map(r => [r.division, r.cnt]));
  const divisions: Array<{ division: number | null; cnt: number }> =
    [1, 2, 3, 4].map(division => ({ division, cnt: cntByDivision.get(division) ?? 0 }));
  const unknownCnt = cntByDivision.get(null) ?? 0;
  if (unknownCnt > 0) divisions.push({ division: null, cnt: unknownCnt });

  return {
    monthLabel: `${y}年${parseInt(m, 10)}月度`,
    count: times.length,
    prevCount: prevCountRow?.cnt ?? null,
    divisions,
    bands: bucketHourBands(times),
  };
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
  const board = await fetchPublicAccidentBoard(c.env.DB);

  return c.json({
    monthLabel: board.monthLabel,
    count: board.count,
    prevCount: board.prevCount,
    divisions: board.divisions,
    bands: board.bands,
    generatedAt: jstNow.toISOString(),
  });
});

export default app;
