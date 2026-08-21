// 事故データ（保険会社システムのCSVエクスポート取込）
// ページ: /accidents
// API   : /api/accidents/*
// 紙/Excelで手入力していた「無事故キロ数計算」用の事故集計の代わりに、事故件数・時間帯を
// 常時見える形（ホームのカード）と詳細一覧（このページ）で確認できるようにする機能。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { accidentsPage, type AccidentRecord } from '../html/accidents';
import { upsertAccidentRecords, type AccidentImportRow } from '../utils/accident_csv';

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

  return c.html(layout('事故分析', content, 'accidents'));
});

// ===== API =====

app.post('/api/accidents/import', async (c) => {
  let data: { records?: AccidentImportRow[] };
  try {
    data = await c.req.json();
  } catch {
    return c.json({ error: 'データがありません' }, 400);
  }

  const rows = Array.isArray(data?.records) ? data.records : [];
  const result = await upsertAccidentRecords(c.env.DB, rows);
  if (!result.ok && result.imported === 0) return c.json({ error: result.errors[0] ?? '有効なデータがありません' }, 400);
  return c.json(result);
});

app.delete('/api/accidents/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM accident_records WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
