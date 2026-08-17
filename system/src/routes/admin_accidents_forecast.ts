// 事故データ予測AI（統計処理による日別「事故発生しやすさスコア」）
// ページ: /accidents/forecast
// API   : /api/accidents/forecast-today（引き継ぎシートのポップアップ警告用、軽量JSON）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { accidentsForecastPage } from '../html/accidents_forecast';
import { buildForecastModel, scoreYear, scoreForDate, selectForecastRecords, type AccidentDateLike } from '../utils/accident_forecast';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

app.get('/accidents/forecast', async (c) => {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const qYear = parseInt(c.req.query('year') || '', 10);
  const year = qYear >= 2000 && qYear <= 2100 ? qYear : jstNow.getUTCFullYear();
  const qDivision = parseInt(c.req.query('division') || '', 10);
  const selectedDivision = [1, 2, 3, 4].includes(qDivision) ? qDivision : null;

  const allRes = await c.env.DB.prepare(`SELECT occurred_date, division FROM accident_records`).all<AccidentDateLike>();
  const all = allRes.results ?? [];
  const { records, usedFallback } = selectForecastRecords(all, selectedDivision);
  const model = buildForecastModel(records);
  const dayScores = scoreYear(model, year);

  const content = accidentsForecastPage({
    year,
    selectedDivision,
    usedFallback,
    insufficientData: model.insufficientData,
    totalCount: model.totalCount,
    totalDays: model.totalDays,
    dayScores,
  });

  return c.html(layout('事故予測カレンダー', content, 'accidents'));
});

app.get('/api/accidents/forecast-today', async (c) => {
  const allRes = await c.env.DB.prepare(`SELECT occurred_date, division FROM accident_records`).all<AccidentDateLike>();
  const model = buildForecastModel(allRes.results ?? []);
  if (model.insufficientData) {
    return c.json({ ok: true, insufficientData: true, isAlert: false });
  }

  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayStr = jstNow.toISOString().slice(0, 10);
  const score = scoreForDate(model, todayStr);
  if (!score) return c.json({ ok: true, insufficientData: true, isAlert: false });

  return c.json({ ok: true, date: score.date, score100: score.score100, tier: score.tier, isAlert: score.isAlert, insufficientData: false });
});

export default app;
