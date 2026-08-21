// 事故データ 安全運転リスクランキング
// ページ: /accidents/risk
import { Hono } from 'hono';
import type { Env } from '../auth';
import { getPeriod, getPeriodSettings, getPeriodRange } from '../auth';
import { layout } from '../html/layout';
import { accidentsRiskPage } from '../html/accidents_risk';
import { computeDrivingRiskRanking } from './api/sales_ai';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

app.get('/accidents/risk', async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const { year: todayY, month: todayM } = getPeriod(today);

  // year/month省略時は当月度。指定時はその月度を表示（月度切り替えナビゲーション用）
  const qYear = parseInt(c.req.query('year') ?? '');
  const qMonth = parseInt(c.req.query('month') ?? '');
  const curY = !isNaN(qYear) ? qYear : todayY;
  const curM = !isNaN(qMonth) ? qMonth : todayM;

  let prevY = curY, prevM = curM - 1;
  if (prevM < 1) { prevM = 12; prevY -= 1; }
  let nextY = curY, nextM = curM + 1;
  if (nextM > 12) { nextM = 1; nextY += 1; }
  const isCurrentPeriod = curY === todayY && curM === todayM;

  const settings = await getPeriodSettings(c.env.DB);
  const { start, end } = getPeriodRange(curY, curM, settings);

  const drivingRiskRanking = await computeDrivingRiskRanking(c.env.DB, curY, curM);
  const content = accidentsRiskPage({
    drivingRiskRanking,
    period: {
      year: curY, month: curM, start, end, isCurrentPeriod,
      prevYear: prevY, prevMonth: prevM, nextYear: nextY, nextMonth: nextM,
    },
  });

  return c.html(layout('安全運転リスクランキング', content, 'accidents'));
});

export default app;
