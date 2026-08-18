// 事故データ 課別レポート「事故防止AI」
// ページ: /accidents/division, /accidents/division/:div（詳細データ一覧・印刷可）, /accidents/division/:div/report/print（傾向分析レポート印刷）
// ※「事故防止AI」は名称のみで、実体は事故記録データを集計してテンプレート文に流し込む
//   ルールベースの生成（外部AI/LLM APIへの通信は一切行わない）。
import { Hono, type Context } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { accidentsDivisionListPage, buildDivisionSummaries, renderAccidentDivisionDetailPrintPage } from '../html/accidents_division';
import { renderAccidentDivisionReportPrintPage, type DivisionForecastSummary } from '../html/accidents_division_report_print';
import type { AccidentRecord } from '../html/accidents';
import { buildRuleBasedTrendAnalysis } from '../utils/accident_trend_analysis';
import { parsePeriodParams, buildPeriodWhere, periodLabel, isoDateMonthsAgo, todayIsoJST, type AccidentPeriod } from '../utils/accident_period';
import { buildForecastModel, scoreYear, selectForecastRecords, WEEKDAY_LABELS_JA as FORECAST_WEEKDAY_LABELS, type AccidentDateLike } from '../utils/accident_forecast';
import { ADMIN_PATH } from '../config';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

function jstTodayLabel(): string {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${jstNow.getUTCFullYear()}年${jstNow.getUTCMonth() + 1}月${jstNow.getUTCDate()}日`;
}

function readPeriod(c: Context<{ Bindings: Env; Variables: { adminId: number } }>): AccidentPeriod {
  return parsePeriodParams(c.req.query('since'), c.req.query('until'), isoDateMonthsAgo(12));
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

app.get('/accidents/division', async (c) => {
  const period = readPeriod(c);

  const records = await fetchRecordsInPeriod(c, period);
  const summaries = buildDivisionSummaries(records);
  const content = accidentsDivisionListPage({ period, summaries });
  return c.html(layout('課別事故レポート', content, 'accidents'));
});

function parseDivisionParam(raw: string): number | null {
  const n = parseInt(raw, 10);
  return [1, 2, 3, 4].includes(n) ? n : null;
}

// 課の事故記録・詳細データ一覧（印刷可能な独立ページとして表示。管理画面共通レイアウトは使わない）
app.get('/accidents/division/:div', async (c) => {
  const division = parseDivisionParam(c.req.param('div'));
  if (division == null) return c.text('課の指定が不正です', 400);
  const period = readPeriod(c);

  const records = await fetchRecordsInPeriod(c, period, division);

  return c.html(renderAccidentDivisionDetailPrintPage({
    division, period, records, issuedDateLabel: jstTodayLabel(),
  }));
});

// 過去の全履歴（月×曜日ベース率モデル用。分析対象期間とは別に、統計モデル構築には多年度分のデータが要る）から
// 「毎年の傾向」（今月は例年多い/少ない月か）と「事故多発注意日」（今月中で統計的にリスクが高い曜日の日付）を組み立てる
function buildForecastSummary(allRecords: AccidentDateLike[], division: number, year: number, month: number): DivisionForecastSummary {
  const { records, usedFallback } = selectForecastRecords(allRecords, division);
  const model = buildForecastModel(records);
  if (model.insufficientData) {
    return { insufficientData: true, usedFallback, yearlyTrendText: '', cautionDays: [] };
  }

  const monthIdx = month - 1;
  const factor = model.monthFactor[monthIdx];
  const rank = [...model.monthFactor]
    .map((f, i) => ({ f, i }))
    .sort((a, b) => b.f - a.f)
    .findIndex(x => x.i === monthIdx) + 1;
  const pct = Math.round((factor - 1) * 100);

  let yearlyTrendText: string;
  if (pct >= 10) {
    yearlyTrendText = `例年のデータでは、${month}月は他の月と比べて事故が発生しやすい傾向があります（平均比+${pct}%、全12ヶ月中${rank}番目に多い月）。`;
  } else if (pct <= -10) {
    yearlyTrendText = `例年のデータでは、${month}月は他の月と比べて事故が少ない傾向があります（平均比${pct}%、全12ヶ月中${rank}番目に多い月）。`;
  } else {
    yearlyTrendText = `例年のデータでは、${month}月は事故発生率に大きな偏りのない月です（全12ヶ月中${rank}番目に多い月）。`;
  }

  // 「事故多発注意日」は曜日別ベース率(weekdayFactor)が平均を大きく上回る曜日のみを対象とする。
  // このモデルは「月別係数×曜日別係数」の乗法モデルのため、月×曜日セルの絶対スコアで曜日を選ぶと
  // 月自体が突出している場合に全曜日が高スコアになってしまう（＝それは既に「毎年の傾向」で触れている月の効果であり、
  // 特定曜日の偏りではない）。weekdayFactorは月に依存しない指標なので、これで曜日の偏りだけを抽出する。
  const cautionWeekdays = model.weekdayFactor
    .map((factor, weekday) => ({ factor, weekday }))
    .filter(x => x.factor >= 1.3)
    .sort((a, b) => b.factor - a.factor)
    .slice(0, 3)
    .map(x => x.weekday);

  const cautionDays = scoreYear(model, year)
    .filter(s => s.month === month && cautionWeekdays.includes(s.weekday))
    .map(s => ({ date: s.date, weekday: FORECAST_WEEKDAY_LABELS[s.weekday] }));

  return { insufficientData: false, usedFallback, yearlyTrendText, cautionDays };
}

app.get('/accidents/division/:div/report/print', async (c) => {
  const division = parseDivisionParam(c.req.param('div'));
  if (division == null) return c.text('課の指定が不正です', 400);
  const period = readPeriod(c);
  const includeForecast = c.req.query('forecast') === '1';

  const records = await fetchRecordsInPeriod(c, period, division);
  if (records.length === 0) return c.text('対象期間の事故データが見つかりません', 404);

  const lastDate = records[0].occurred_date;
  const faultVals = records.map(r => r.fault_pct_planned).filter((v): v is number => v != null);
  const avgFault = faultVals.length ? Math.round(faultVals.reduce((a, b) => a + b, 0) / faultVals.length) : null;
  const damageSum = records.reduce((s, r) => s + (r.damage_amount || 0), 0);

  const content = buildRuleBasedTrendAnalysis(records);

  let forecast: DivisionForecastSummary | undefined;
  if (includeForecast) {
    const allRes = await c.env.DB.prepare('SELECT occurred_date, division FROM accident_records').all<AccidentDateLike>();
    const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    forecast = buildForecastSummary(allRes.results ?? [], division, jstNow.getUTCFullYear(), jstNow.getUTCMonth() + 1);
  }

  return c.html(renderAccidentDivisionReportPrintPage({
    division,
    periodLabel: `${periodLabel(period, todayIsoJST())}（全${records.length}件）`,
    cnt: records.length,
    avgFault,
    damageSum,
    lastDate,
    issuedDateLabel: jstTodayLabel(),
    content,
    forecast,
    backHref: `${ADMIN_PATH}/accidents/division/${division}${periodQuery(period)}`,
  }));
});

export default app;
