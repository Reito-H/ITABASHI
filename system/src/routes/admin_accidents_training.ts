// 事故研修のお知らせ 対象者抽出・一括印刷
// ページ: /accidents/training, /accidents/training/print
import { Hono, type Context } from 'hono';
import type { Env } from '../auth';
import { ADMIN_PATH } from '../config';
import { layout } from '../html/layout';
import { accidentsTrainingPage } from '../html/accidents_training';
import { renderAccidentsTrainingPrintPage, type TrainingNoticeItem } from '../html/accidents_training_print';
import { renderAccidentsRideAlongNoticePrintPage } from '../html/accidents_ride_along_notice_print';
import { buildIndividualRanking } from '../html/accidents_analysis';
import type { AccidentRecord } from '../html/accidents';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

function isoDateMonthsAgo(months: number): string {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const d = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() - months, jstNow.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

function jstTodayLabel(): string {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return `${jstNow.getUTCFullYear()}年${jstNow.getUTCMonth() + 1}月${jstNow.getUTCDate()}日`;
}

function slashDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${y}/${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

async function fetchCandidates(c: Context<{ Bindings: Env; Variables: { adminId: number } }>, months: number, selectedDivision: number | null) {
  const since = isoDateMonthsAgo(months);
  const sql = `SELECT * FROM accident_records WHERE occurred_date >= ?1${selectedDivision != null ? ' AND division = ?2' : ''} ORDER BY occurred_date DESC`;
  const bindings = selectedDivision != null ? [since, selectedDivision] : [since];
  const res = await c.env.DB.prepare(sql).bind(...bindings).all<AccidentRecord>();
  return buildIndividualRanking(res.results ?? []);
}

app.get('/accidents/training', async (c) => {
  const qMonths = parseInt(c.req.query('months') || '12', 10);
  const months = [3, 6, 12, 24, 36].includes(qMonths) ? qMonths : 12;
  const qMinCount = parseInt(c.req.query('min_count') || '2', 10);
  const minCount = qMinCount >= 1 && qMinCount <= 10 ? qMinCount : 2;
  const qDivision = parseInt(c.req.query('division') || '', 10);
  const selectedDivision = [1, 2, 3, 4].includes(qDivision) ? qDivision : null;

  const ranking = await fetchCandidates(c, months, selectedDivision);
  const candidates = ranking.filter(r => r.cnt >= minCount);

  const content = accidentsTrainingPage({ months, minCount, selectedDivision, candidates });
  return c.html(layout('事故研修案内', content, 'accidents'));
});

app.get('/accidents/training/print', async (c) => {
  const qMonths = parseInt(c.req.query('months') || '12', 10);
  const months = [3, 6, 12, 24, 36].includes(qMonths) ? qMonths : 12;
  const qDivision = parseInt(c.req.query('division') || '', 10);
  const selectedDivision = [1, 2, 3, 4].includes(qDivision) ? qDivision : null;
  const rawKeys = c.req.query('keys') || '';
  const keys = new Set(rawKeys.split(',').map(k => decodeURIComponent(k.trim())).filter(Boolean));
  if (keys.size === 0) return c.text('対象者が指定されていません', 400);

  const ranking = await fetchCandidates(c, months, selectedDivision);
  const selected = ranking.filter(r => keys.has(r.key));
  if (selected.length === 0) return c.text('対象者が見つかりません', 400);

  const since = isoDateMonthsAgo(months);
  const todayIso = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const periodLabel = `${slashDate(since)} 〜 ${slashDate(todayIso)}`;

  const items: TrainingNoticeItem[] = selected.map(r => ({
    name: r.name, division: r.division, team: r.team, cnt: r.cnt, lastDate: r.lastDate,
  }));

  return c.html(renderAccidentsTrainingPrintPage({
    pageTitle: `事故研修のお知らせ（${items.length}名）`,
    periodLabel,
    issuedDateLabel: jstTodayLabel(),
    items,
    backHref: `${ADMIN_PATH}/accidents/training?months=${months}${selectedDivision != null ? '&division=' + selectedDivision : ''}`,
  }));
});

app.get('/accidents/training/notice/print', async (c) => {
  return c.html(renderAccidentsRideAlongNoticePrintPage({
    backHref: `${ADMIN_PATH}/accidents/training`,
    searchEmployeesHref: `${ADMIN_PATH}/accidents/training/notice/search-employees`,
  }));
});

// 事故記録がない（=accident_records経由では検索できない）社員も対象にできるよう、
// 社員名簿(employees)を直接検索する。他機能の検索employees系APIと同じSQL・レスポンス形。
app.get('/accidents/training/notice/search-employees', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 40);
  if (!q) return c.json([]);
  const rows = await c.env.DB.prepare(
    `SELECT id, name, emp_no, division, team FROM employees
     WHERE is_active = 1 AND (name LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)
     ORDER BY division, team, seq_no LIMIT 20`
  ).bind(`%${q}%`, `%${q}%`, `%${q}%`).all<{ id: number; name: string; emp_no: string; division: number | null; team: number | null }>();
  return c.json(rows.results ?? []);
});

export default app;
