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
import { loadDrivingRiskSettings } from './api/sales_ai';
import { summarizeDrivingRisk, type DrivingRiskSummary, type DrivingSafetyRow } from '../utils/driving_risk_analysis';

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

type SafetyDbRow = {
  emp_id: number; date: string;
  harsh_start_loaded: number | null; harsh_start_empty: number | null;
  harsh_accel_loaded: number | null; harsh_accel_empty: number | null;
  harsh_decel_loaded: number | null; harsh_decel_empty: number | null;
  max_speed_loaded_highway: number | null; max_speed_loaded_local: number | null;
};

function toDrivingSafetyRow(r: SafetyDbRow): DrivingSafetyRow {
  return {
    date: r.date,
    harshStartLoaded: r.harsh_start_loaded, harshStartEmpty: r.harsh_start_empty,
    harshAccelLoaded: r.harsh_accel_loaded, harshAccelEmpty: r.harsh_accel_empty,
    harshDecelLoaded: r.harsh_decel_loaded, harshDecelEmpty: r.harsh_decel_empty,
    maxSpeedLoadedHighway: r.max_speed_loaded_highway, maxSpeedLoadedLocal: r.max_speed_loaded_local,
  };
}

// 事故ランキングのkey（emp_no優先）を安全運転データ（driving_safety_records）とemp_noで照合し、
// 期間内の総合リスク判定をまとめて取得する（事故データ側から安全運転傾向を参照できるようにするための逆方向照合）。
async function fetchDrivingRiskByEmpNo(
  c: Context<{ Bindings: Env; Variables: { adminId: number } }>,
  empNos: string[],
  period: AccidentPeriod
): Promise<Map<string, { empId: number; summary: DrivingRiskSummary | null }>> {
  const result = new Map<string, { empId: number; summary: DrivingRiskSummary | null }>();
  if (!empNos.length) return result;

  const idByEmpNo = new Map<string, number>();
  const LOOKUP_CHUNK = 100;
  for (let i = 0; i < empNos.length; i += LOOKUP_CHUNK) {
    const chunk = empNos.slice(i, i + LOOKUP_CHUNK);
    const ph = chunk.map(() => '?').join(',');
    const rows = await c.env.DB.prepare(`SELECT id, emp_no FROM employees WHERE emp_no IN (${ph})`).bind(...chunk).all<{ id: number; emp_no: string }>();
    for (const r of rows.results ?? []) idByEmpNo.set(r.emp_no, r.id);
  }
  if (!idByEmpNo.size) return result;

  const ids = [...idByEmpNo.values()];
  const dateParts: string[] = [];
  const dateBindings: string[] = [];
  if (period.since) { dateParts.push('date >= ?'); dateBindings.push(period.since); }
  if (period.until) { dateParts.push('date <= ?'); dateBindings.push(period.until); }
  const dateWhere = dateParts.length ? ' AND ' + dateParts.join(' AND ') : '';

  // D1（SQLite）はプレースホルダ数に上限があるため、IN句のidは小さめのチャンクに分けて問い合わせる
  const QUERY_CHUNK = 50;
  const rowsByEmp = new Map<number, DrivingSafetyRow[]>();
  const dutyByEmp = new Map<number, number>();
  const riskSettings = await loadDrivingRiskSettings(c.env.DB);
  for (let i = 0; i < ids.length; i += QUERY_CHUNK) {
    const chunk = ids.slice(i, i + QUERY_CHUNK);
    const ph2 = chunk.map(() => '?').join(',');
    const [safetyRows, dutyRows] = await Promise.all([
      c.env.DB.prepare(
        `SELECT emp_id, date, harsh_start_loaded, harsh_start_empty, harsh_accel_loaded, harsh_accel_empty,
                harsh_decel_loaded, harsh_decel_empty, max_speed_loaded_highway, max_speed_loaded_local
         FROM driving_safety_records WHERE emp_id IN (${ph2})${dateWhere}`
      ).bind(...chunk, ...dateBindings).all<SafetyDbRow>(),
      c.env.DB.prepare(
        `SELECT emp_id, COUNT(*) as cnt FROM sales_records WHERE emp_id IN (${ph2})${dateWhere} GROUP BY emp_id`
      ).bind(...chunk, ...dateBindings).all<{ emp_id: number; cnt: number }>(),
    ]);
    for (const r of safetyRows.results ?? []) {
      if (!rowsByEmp.has(r.emp_id)) rowsByEmp.set(r.emp_id, []);
      rowsByEmp.get(r.emp_id)!.push(toDrivingSafetyRow(r));
    }
    for (const r of dutyRows.results ?? []) dutyByEmp.set(r.emp_id, r.cnt);
  }

  for (const [empNo, empId] of idByEmpNo) {
    const rows = rowsByEmp.get(empId);
    if (!rows || !rows.length) { result.set(empNo, { empId, summary: null }); continue; }
    const dutyDays = dutyByEmp.get(empId) ?? rows.length;
    result.set(empNo, { empId, summary: summarizeDrivingRisk(rows, dutyDays, riskSettings) });
  }
  return result;
}

app.get('/accidents/person', async (c) => {
  const qDivision = parseInt(c.req.query('division') || '', 10);
  const selectedDivision = [1, 2, 3, 4].includes(qDivision) ? qDivision : null;
  const period = readPeriod(c);

  const records = await fetchRecordsInPeriod(c, period, selectedDivision);
  const ranking = buildIndividualRanking(records);
  const empNos = ranking.map(r => r.key).filter(k => /^\d{8}$/.test(k));
  const drivingRiskByEmpNo = await fetchDrivingRiskByEmpNo(c, empNos, period);
  const content = accidentsPersonListPage({ ranking, selectedDivision, period, drivingRiskByEmpNo });
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

  const drivingRiskMap = /^\d{8}$/.test(key) ? await fetchDrivingRiskByEmpNo(c, [key], period) : new Map();
  const drivingRisk = drivingRiskMap.get(key) ?? null;

  return c.html(renderAccidentPersonDetailPrintPage({
    key, name, division, team, records: personRecords, period, issuedDateLabel: jstTodayLabel(),
    empId: drivingRisk?.empId ?? null, drivingRisk: drivingRisk?.summary ?? null,
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
