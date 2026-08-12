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

app.get(MONITOR_ACCIDENTS_PATH, (c) => c.html(accidentsMonitorPage()));

app.get('/api/public/accidents-monitor', async (c) => {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const ym = jstNow.toISOString().slice(0, 7);
  const prevYmStr = prevYm(ym);

  const [rows, prevCountRow, divisionRows] = await Promise.all([
    c.env.DB.prepare(`SELECT occurred_time FROM accident_records WHERE substr(occurred_date, 1, 7) = ?`)
      .bind(ym).all<{ occurred_time: string | null }>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM accident_records WHERE substr(occurred_date, 1, 7) = ?`)
      .bind(prevYmStr).first<{ cnt: number }>(),
    c.env.DB.prepare(
      `SELECT division, COUNT(*) AS cnt FROM accident_records WHERE substr(occurred_date, 1, 7) = ? GROUP BY division ORDER BY division`
    ).bind(ym).all<{ division: number | null; cnt: number }>(),
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
  });
});

export default app;
