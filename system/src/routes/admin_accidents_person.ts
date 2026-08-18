// 事故データ 個人別レポート
// ページ: /accidents/person, /accidents/person/:key, /accidents/person/:key/report/print（「AI分析」表記の傾向レポート印刷）
// ※「AI事故傾向分析レポート」は名称のみで、実体は事故記録データを集計してテンプレート文に流し込む
//   ルールベースの生成（外部AI/LLM APIへの通信は一切行わない）。
import { Hono, type Context } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { accidentsPersonListPage, renderAccidentPersonDetailPrintPage, filterRecordsForKey } from '../html/accidents_person';
import { renderAccidentPersonReportPrintPage } from '../html/accidents_person_report_print';
import { buildIndividualRanking } from '../html/accidents_analysis';
import { type AccidentRecord } from '../html/accidents';
import { buildRuleBasedTrendAnalysis } from '../utils/accident_trend_analysis';
import { parsePeriodParams, buildPeriodWhere, periodLabel, todayIsoJST, type AccidentPeriod } from '../utils/accident_period';
import { ADMIN_PATH } from '../config';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

function jstTodayLabel(): string {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${jstNow.getUTCFullYear()}年${jstNow.getUTCMonth() + 1}月${jstNow.getUTCDate()}日`;
}

// 個人別は「全期間の累計」がデフォルト（キャリア全体を見る用途）。指定があればその期間に絞り込む。
function readPeriod(c: Context<{ Bindings: Env; Variables: { adminId: number } }>): AccidentPeriod {
  return parsePeriodParams(c.req.query('since'), c.req.query('until'), null);
}

function periodQuery(period: AccidentPeriod): string {
  const parts: string[] = [];
  if (period.since) parts.push('since=' + period.since);
  if (period.until) parts.push('until=' + period.until);
  return parts.length ? '?' + parts.join('&') : '';
}

async function fetchRecordsInPeriod(c: Context<{ Bindings: Env; Variables: { adminId: number } }>, period: AccidentPeriod, division: number | null = null) {
  const bindings: (string | number)[] = [];
  const whereParts: string[] = [];
  const periodWhere = buildPeriodWhere(period, 1);
  if (periodWhere.clause) { whereParts.push(periodWhere.clause); bindings.push(...periodWhere.bindings); }
  if (division != null) { whereParts.push(`division = ?${bindings.length + 1}`); bindings.push(division); }
  const sql = `SELECT * FROM accident_records${whereParts.length ? ' WHERE ' + whereParts.join(' AND ') : ''} ORDER BY occurred_date DESC`;
  const res = await c.env.DB.prepare(sql).bind(...bindings).all<AccidentRecord>();
  return res.results ?? [];
}

app.get('/accidents/person', async (c) => {
  const qDivision = parseInt(c.req.query('division') || '', 10);
  const selectedDivision = [1, 2, 3, 4].includes(qDivision) ? qDivision : null;
  const period = readPeriod(c);

  const records = await fetchRecordsInPeriod(c, period, selectedDivision);
  const ranking = buildIndividualRanking(records);
  const content = accidentsPersonListPage({ ranking, selectedDivision, period });
  return c.html(layout('個人別事故レポート', content, 'accidents'));
});

// 個人の事故記録・詳細データ一覧（印刷可能な独立ページとして表示。管理画面共通レイアウトは使わない）
app.get('/accidents/person/:key', async (c) => {
  const key = decodeURIComponent(c.req.param('key'));
  const period = readPeriod(c);
  const records = await fetchRecordsInPeriod(c, period);
  const personRecords = filterRecordsForKey(records, key);
  if (personRecords.length === 0) return c.text('対象者の事故データが見つかりません（指定期間内にデータがない可能性があります）', 404);

  const name = personRecords[0].emp_name || '不明';
  const division = personRecords[0].division;
  const team = personRecords[0].team;

  return c.html(renderAccidentPersonDetailPrintPage({
    key, name, division, team, records: personRecords, period, issuedDateLabel: jstTodayLabel(),
  }));
});

app.get('/accidents/person/:key/report/print', async (c) => {
  const key = decodeURIComponent(c.req.param('key'));
  const period = readPeriod(c);

  const records = await fetchRecordsInPeriod(c, period);
  const personRecords = filterRecordsForKey(records, key);
  if (personRecords.length === 0) return c.text('対象者の事故データが見つかりません（指定期間内にデータがない可能性があります）', 404);

  const name = personRecords[0].emp_name || '不明';
  const division = personRecords[0].division;
  const team = personRecords[0].team;
  const lastDate = personRecords[0].occurred_date;
  const faultVals = personRecords.map(r => r.fault_pct_planned).filter((v): v is number => v != null);
  const avgFault = faultVals.length ? Math.round(faultVals.reduce((a, b) => a + b, 0) / faultVals.length) : null;
  const damageSum = personRecords.reduce((s, r) => s + (r.damage_amount || 0), 0);

  const content = buildRuleBasedTrendAnalysis(personRecords);

  return c.html(renderAccidentPersonReportPrintPage({
    name,
    division,
    team,
    periodLabel: `${periodLabel(period, todayIsoJST())}（全${personRecords.length}件）`,
    cnt: personRecords.length,
    avgFault,
    damageSum,
    lastDate,
    issuedDateLabel: jstTodayLabel(),
    content,
    backHref: `${ADMIN_PATH}/accidents/person/${encodeURIComponent(key)}${periodQuery(period)}`,
  }));
});

export default app;
