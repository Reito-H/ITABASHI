// 課別・安全運転リスクレポート 印刷
// ページ: /accidents/risk/division/:div/report/print
// 安全運転リスクランキング（accidents_risk.ts）の絞り込み条件をクエリパラメータで受け取り、
// 該当課・該当条件の乗務員だけに絞ってA4横1枚の印刷レポートを生成する。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { getPeriod } from '../auth';
import { computeDrivingRiskRanking, type DrivingRiskRankingRow } from './api/sales_ai';
import { renderAccidentsRiskReportPrintPage, type AccidentsRiskReportFilterSummary } from '../html/accidents_risk_report_print';
import { ADMIN_PATH } from '../config';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

function jstTodayLabel(): string {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${jstNow.getUTCFullYear()}年${jstNow.getUTCMonth() + 1}月${jstNow.getUTCDate()}日`;
}

function parseDivisionParam(raw: string): number | null {
  const n = parseInt(raw, 10);
  return [1, 2, 3, 4].includes(n) ? n : null;
}

function parseNumParam(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function parseRiskLevels(raw: string | undefined): Array<DrivingRiskRankingRow['riskLevel']> {
  if (!raw) return ['high', 'medium', 'low'];
  const levels = raw.split(',').filter((v): v is DrivingRiskRankingRow['riskLevel'] => v === 'high' || v === 'medium' || v === 'low');
  return levels.length ? levels : ['high', 'medium', 'low'];
}

app.get('/accidents/risk/division/:div/report/print', async (c) => {
  const division = parseDivisionParam(c.req.param('div'));
  if (division == null) return c.text('課の指定が不正です', 400);

  const today = new Date().toISOString().slice(0, 10);
  const { year: todayY, month: todayM } = getPeriod(today);
  const qYear = parseInt(c.req.query('year') ?? '');
  const qMonth = parseInt(c.req.query('month') ?? '');
  const periodYear = !isNaN(qYear) ? qYear : todayY;
  const periodMonth = !isNaN(qMonth) ? qMonth : todayM;

  const filter: AccidentsRiskReportFilterSummary = {
    minHarsh: parseNumParam(c.req.query('minHarsh')),
    minPerDuty: parseNumParam(c.req.query('minPerDuty')),
    minSpeedingDays: parseNumParam(c.req.query('minSpeedingDays')),
    minAccidents: parseNumParam(c.req.query('minAccidents')),
    maxMonthsSinceAccident: parseNumParam(c.req.query('maxMonthsSinceAccident')),
    riskLevels: parseRiskLevels(c.req.query('riskLevels')),
  };

  const ranking = await computeDrivingRiskRanking(c.env.DB, periodYear, periodMonth);
  const rows = ranking.filter(r => {
    if (r.division !== division) return false;
    if (filter.minHarsh != null && r.totalHarshEvents < filter.minHarsh) return false;
    if (filter.minPerDuty != null && r.harshEventsPerDuty < filter.minPerDuty) return false;
    if (filter.minSpeedingDays != null && r.speedingDays < filter.minSpeedingDays) return false;
    if (filter.minAccidents != null && r.accidentCount < filter.minAccidents) return false;
    if (filter.maxMonthsSinceAccident != null) {
      if (r.monthsSinceLastAccident == null) return false; // 事故歴なし＝経過月数は判定不能のため除外
      if (r.monthsSinceLastAccident > filter.maxMonthsSinceAccident) return false;
    }
    if (!filter.riskLevels.includes(r.riskLevel)) return false;
    return true;
  });

  return c.html(renderAccidentsRiskReportPrintPage({
    division,
    issuedDateLabel: jstTodayLabel(),
    periodLabel: `${periodYear}年${periodMonth}月度`,
    filter,
    rows,
    backHref: `${ADMIN_PATH}/accidents/risk`,
  }));
});

export default app;
