// 事故データ（保険会社システムのCSVエクスポート取込）
// ページ: /accidents
// API   : /api/accidents/*
// 紙/Excelで手入力していた「無事故キロ数計算」用の事故集計の代わりに、事故件数・時間帯を
// 常時見える形（ホームのカード）と詳細一覧（このページ）で確認できるようにする機能。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { accidentsPage, type AccidentRecord } from '../html/accidents';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

function prevYm(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// ===== ページ =====

app.get('/accidents', async (c) => {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayYm = jstNow.toISOString().slice(0, 7);
  const qMonth = c.req.query('month');
  const selectedMonth = qMonth && /^\d{4}-\d{2}$/.test(qMonth) ? qMonth : todayYm;
  const prevMonth = prevYm(selectedMonth);

  const [monthsRes, recordsRes, prevCountRow, divisionRes] = await Promise.all([
    c.env.DB.prepare(`SELECT DISTINCT substr(occurred_date, 1, 7) AS ym FROM accident_records ORDER BY ym DESC`)
      .all<{ ym: string }>(),
    c.env.DB.prepare(
      `SELECT * FROM accident_records WHERE substr(occurred_date, 1, 7) = ? ORDER BY occurred_date DESC, occurred_time DESC`
    ).bind(selectedMonth).all<AccidentRecord>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM accident_records WHERE substr(occurred_date, 1, 7) = ?`)
      .bind(prevMonth).first<{ cnt: number }>(),
    c.env.DB.prepare(
      `SELECT division, COUNT(*) AS cnt FROM accident_records WHERE substr(occurred_date, 1, 7) = ? GROUP BY division ORDER BY division`
    ).bind(selectedMonth).all<{ division: number | null; cnt: number }>(),
  ]);

  const availableMonths = Array.from(new Set([todayYm, selectedMonth, ...(monthsRes.results ?? []).map(r => r.ym)]))
    .sort().reverse();

  const [py, pm] = prevMonth.split('-');
  const prevMonthLabel = `${py}年${parseInt(pm, 10)}月`;

  const content = accidentsPage({
    selectedMonth,
    availableMonths,
    totalCount: (recordsRes.results ?? []).length,
    prevMonthCount: prevCountRow?.cnt ?? null,
    prevMonthLabel,
    divisionBreakdown: divisionRes.results ?? [],
    records: recordsRes.results ?? [],
  });

  return c.html(layout('事故データ', content, 'accidents'));
});

// ===== API =====

interface AccidentImportRow {
  accident_no?: string;
  office?: string | null;
  vehicle_code?: string | null;
  plate_no?: string | null;
  division?: number | null;
  team?: string | null;
  emp_no?: string | null;
  emp_name?: string | null;
  accident_category?: string | null;
  occurred_date?: string;
  occurred_time?: string | null;
  weather?: string | null;
  loc_city?: string | null;
  loc_town?: string | null;
  loc_addr?: string | null;
  fault_pct_planned?: number | null;
  fault_pct_final?: number | null;
  damage_amount?: number | null;
  accident_target?: string | null;
  accident_form?: string | null;
  road_condition?: string | null;
  business_status?: string | null;
  emp_age?: number | null;
  emp_tenure_years?: number | null;
  memo?: string | null;
  past3y_accident_count?: number | null;
  road_shape?: string | null;
  cause_reason?: string | null;
  cause_direct?: string | null;
}

app.post('/api/accidents/import', async (c) => {
  let data: { records?: AccidentImportRow[] };
  try {
    data = await c.req.json();
  } catch {
    return c.json({ error: 'データがありません' }, 400);
  }

  const rows = Array.isArray(data?.records) ? data.records : [];
  const valid = rows.filter(r => r.accident_no && /^\d{4}-\d{2}-\d{2}$/.test(r.occurred_date ?? ''));
  if (valid.length === 0) return c.json({ error: '有効なデータがありません' }, 400);

  type D1Stmt = ReturnType<typeof c.env.DB.prepare>;
  const statements: D1Stmt[] = valid.map(r => c.env.DB.prepare(`
    INSERT INTO accident_records (
      accident_no, office, vehicle_code, plate_no, division, team, emp_no, emp_name,
      accident_category, occurred_date, occurred_time, weather, loc_city, loc_town, loc_addr,
      fault_pct_planned, fault_pct_final, damage_amount, accident_target, accident_form,
      road_condition, business_status, emp_age, emp_tenure_years, memo, past3y_accident_count,
      road_shape, cause_reason, cause_direct, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now','localtime'))
    ON CONFLICT(accident_no) DO UPDATE SET
      office = excluded.office, vehicle_code = excluded.vehicle_code, plate_no = excluded.plate_no,
      division = excluded.division, team = excluded.team, emp_no = excluded.emp_no, emp_name = excluded.emp_name,
      accident_category = excluded.accident_category, occurred_date = excluded.occurred_date,
      occurred_time = excluded.occurred_time, weather = excluded.weather,
      loc_city = excluded.loc_city, loc_town = excluded.loc_town, loc_addr = excluded.loc_addr,
      fault_pct_planned = excluded.fault_pct_planned, fault_pct_final = excluded.fault_pct_final,
      damage_amount = excluded.damage_amount, accident_target = excluded.accident_target,
      accident_form = excluded.accident_form, road_condition = excluded.road_condition,
      business_status = excluded.business_status, emp_age = excluded.emp_age,
      emp_tenure_years = excluded.emp_tenure_years, memo = excluded.memo,
      past3y_accident_count = excluded.past3y_accident_count, road_shape = excluded.road_shape,
      cause_reason = excluded.cause_reason, cause_direct = excluded.cause_direct,
      updated_at = datetime('now','localtime')
  `).bind(
    String(r.accident_no), r.office ?? null, r.vehicle_code ?? null, r.plate_no ?? null,
    r.division ?? null, r.team ?? null, r.emp_no ?? null, r.emp_name ?? null,
    r.accident_category ?? null, String(r.occurred_date), r.occurred_time ?? null, r.weather ?? null,
    r.loc_city ?? null, r.loc_town ?? null, r.loc_addr ?? null,
    r.fault_pct_planned ?? null, r.fault_pct_final ?? null, r.damage_amount ?? null,
    r.accident_target ?? null, r.accident_form ?? null, r.road_condition ?? null, r.business_status ?? null,
    r.emp_age ?? null, r.emp_tenure_years ?? null, r.memo ?? null, r.past3y_accident_count ?? null,
    r.road_shape ?? null, r.cause_reason ?? null, r.cause_direct ?? null
  ));

  const CHUNK = 50;
  const errors: string[] = [];
  for (let i = 0; i < statements.length; i += CHUNK) {
    try {
      await c.env.DB.batch(statements.slice(i, i + CHUNK));
    } catch (e) {
      errors.push(`batch[${i}-${i + CHUNK - 1}]: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return c.json({ ok: errors.length === 0, imported: valid.length, errors });
});

app.delete('/api/accidents/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM accident_records WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
