// 事故データ 分析・ランキング
// ページ: /accidents/analysis
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { accidentsAnalysisPage } from '../html/accidents_analysis';
import type { AccidentRecord } from '../html/accidents';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

function isoDateMonthsAgo(months: number): string {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() - months, jstNow.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

app.get('/accidents/analysis', async (c) => {
  const qMonths = parseInt(c.req.query('months') || '12', 10);
  const months = [6, 12, 24, 36].includes(qMonths) ? qMonths : 12;
  const qDivision = parseInt(c.req.query('division') || '', 10);
  const selectedDivision = [1, 2, 3, 4].includes(qDivision) ? qDivision : null;

  const since = isoDateMonthsAgo(months);
  const prevSince = isoDateMonthsAgo(months * 2);

  const curSql = `SELECT * FROM accident_records WHERE occurred_date >= ?1${selectedDivision != null ? ' AND division = ?2' : ''} ORDER BY occurred_date DESC`;
  const curBindings = selectedDivision != null ? [since, selectedDivision] : [since];
  const prevSql = `SELECT * FROM accident_records WHERE occurred_date >= ?1 AND occurred_date < ?2${selectedDivision != null ? ' AND division = ?3' : ''} ORDER BY occurred_date DESC`;
  const prevBindings = selectedDivision != null ? [prevSince, since, selectedDivision] : [prevSince, since];

  const [recordsRes, prevRes] = await Promise.all([
    c.env.DB.prepare(curSql).bind(...curBindings).all<AccidentRecord>(),
    c.env.DB.prepare(prevSql).bind(...prevBindings).all<AccidentRecord>(),
  ]);

  const content = accidentsAnalysisPage({
    months,
    selectedDivision,
    records: recordsRes.results ?? [],
    prevRecords: prevRes.results ?? [],
  });

  return c.html(layout('事故データ分析', content, 'accidents'));
});

export default app;
