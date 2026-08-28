// 退職者リスト: 乗務員退職者名簿PDFの取込
// PDF解析はブラウザ側（src/utils/retiree_pdf.ts）で行い、CPU時間上限を避ける。
// サーバー側は emp_no 照合によるプレビューと、確認後のバッチ更新のみを担当する。
import { Hono } from 'hono';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<{ id: number; name: string }> {
  const id = c.get('adminId');
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(id).first<{ username: string }>();
  return { id, name: row?.username ?? `id:${id}` };
}

type ParsedRow = {
  division: number;
  team: number | null;
  emp_no: string;
  name: string;
  retirement_date: string;
  hire_date: string | null;
  reason: string | null;
  work_type: string | null;
};

type EmployeeMatch = {
  id: number;
  emp_no: string;
  name: string;
  division: number | null;
  team: number | null;
  hire_date: string | null;
  is_active: number;
  retirement_date: string | null;
  retirement_reason: string | null;
};

// PDF解析用バンドル配信（unpdfによるPDF座標解析はWorker CPU時間上限に収まらないため、ブラウザで実行する）
// 配車PDF・乗務員シフトPDF・退職者名簿PDFの3機能で共通バンドルを配信する（unpdfの重複を避けるため）。
// src/utils/retiree_pdf.ts を編集したら `npm run build:pdf-parsers-bundle` で再生成すること。
app.get('/parser.js', async (c) => {
  // 2.1MBのbase64定数。コールドスタートのCPU予算を圧迫するため、この配信時のみ動的import。
  const { PDF_PARSERS_CLIENT_JS_BASE64 } = await import('../../assets/pdf_parsers_client_bundle');
  const bytes = Uint8Array.from(atob(PDF_PARSERS_CLIENT_JS_BASE64), (ch) => ch.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
});

// PDF解析結果を employees と emp_no で突き合わせ、確定前のプレビューを返す
app.post('/preview', async (c) => {
  const data = await c.req.json<{ rows: ParsedRow[] }>();
  if (!Array.isArray(data?.rows) || data.rows.length === 0) {
    return c.json({ error: 'rowsが指定されていません' }, 400);
  }

  const empNos = [...new Set(data.rows.map(r => r.emp_no).filter(n => /^\d{8}$/.test(n)))];
  const byEmpNo = new Map<string, EmployeeMatch>();
  const CHUNK = 100;
  for (let i = 0; i < empNos.length; i += CHUNK) {
    const chunk = empNos.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = await c.env.DB.prepare(
      `SELECT id, emp_no, name, division, team, hire_date, is_active, retirement_date, retirement_reason
       FROM employees WHERE emp_no IN (${placeholders})`
    ).bind(...chunk).all<EmployeeMatch>();
    for (const r of rows.results ?? []) byEmpNo.set(r.emp_no, r);
  }

  const seenInPdf = new Set<string>();
  const summary = { matched: 0, already_retired: 0, unmatched: 0, duplicate_in_pdf: 0 };
  const divisionTotals: Record<number, number> = {};

  const rows = data.rows.map(r => {
    divisionTotals[r.division] = (divisionTotals[r.division] ?? 0) + 1;

    if (seenInPdf.has(r.emp_no)) {
      summary.duplicate_in_pdf++;
      return { ...r, match_status: 'duplicate_in_pdf' as const, employee_id: null, db_name: null, db_hire_date: null, db_retirement_date: null, db_retirement_reason: null, mismatches: [] as string[] };
    }
    seenInPdf.add(r.emp_no);

    const emp = byEmpNo.get(r.emp_no);
    if (!emp) {
      summary.unmatched++;
      return { ...r, match_status: 'unmatched' as const, employee_id: null, db_name: null, db_hire_date: null, db_retirement_date: null, db_retirement_reason: null, mismatches: [] as string[] };
    }

    const mismatches: string[] = [];
    if (r.hire_date && emp.hire_date && r.hire_date !== emp.hire_date) {
      mismatches.push(`入社日相違: DB ${emp.hire_date} / PDF ${r.hire_date}`);
    }
    if (emp.division != null && emp.division !== r.division) {
      mismatches.push(`課相違: DB ${emp.division}課 / PDF ${r.division}課`);
    }

    const status = emp.is_active === 0 ? ('already_retired' as const) : ('matched' as const);
    if (status === 'already_retired') summary.already_retired++; else summary.matched++;

    return {
      ...r,
      match_status: status,
      employee_id: emp.id,
      db_name: emp.name,
      db_hire_date: emp.hire_date,
      db_retirement_date: emp.retirement_date,
      db_retirement_reason: emp.retirement_reason,
      mismatches,
    };
  });

  return c.json({ rows, summary, divisionTotals });
});

// プレビューで確認済みの行を確定反映する
app.post('/confirm', async (c) => {
  const data = await c.req.json<{
    file_name?: string;
    rows: Array<{ employee_id: number; retirement_date: string; retirement_reason: string | null; fill_only?: boolean }>;
  }>();
  if (!Array.isArray(data?.rows) || data.rows.length === 0) {
    return c.json({ error: 'rowsが指定されていません' }, 400);
  }
  const rows = data.rows.filter(r => Number.isInteger(r.employee_id) && r.employee_id > 0 && r.retirement_date);
  if (rows.length === 0) return c.json({ error: '有効な行がありません' }, 400);

  const newRetirements = rows.filter(r => !r.fill_only);
  const fillOnly = rows.filter(r => r.fill_only);

  const CHUNK = 100;
  let updated = 0;
  let filled = 0;

  for (let i = 0; i < newRetirements.length; i += CHUNK) {
    const chunk = newRetirements.slice(i, i + CHUNK);
    const stmts = chunk.map(r => c.env.DB.prepare(
      `UPDATE employees SET is_active = 0, retirement_date = ?, retirement_reason = ?, updated_at = datetime('now','localtime')
       WHERE id = ? AND is_active = 1`
    ).bind(r.retirement_date, r.retirement_reason ?? null, r.employee_id));
    const results = await c.env.DB.batch(stmts);
    updated += results.reduce((sum, res) => sum + (res.meta.changes ?? 0), 0);
  }

  for (let i = 0; i < fillOnly.length; i += CHUNK) {
    const chunk = fillOnly.slice(i, i + CHUNK);
    const stmts = chunk.map(r => c.env.DB.prepare(
      `UPDATE employees SET
         retirement_date = COALESCE(NULLIF(retirement_date,''), ?),
         retirement_reason = COALESCE(NULLIF(retirement_reason,''), ?),
         updated_at = datetime('now','localtime')
       WHERE id = ? AND is_active = 0`
    ).bind(r.retirement_date, r.retirement_reason ?? null, r.employee_id));
    const results = await c.env.DB.batch(stmts);
    filled += results.reduce((sum, res) => sum + (res.meta.changes ?? 0), 0);
  }

  const { name } = await adminName(c);
  await c.env.DB.prepare(
    `INSERT INTO retiree_pdf_imports (file_name, divisions, matched_count, already_retired_count, unmatched_count, detail_json, imported_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    data.file_name ?? null,
    null,
    updated,
    filled,
    0,
    JSON.stringify({ updated, filled }),
    name
  ).run();

  return c.json({ ok: true, updated, filled });
});

export default app;
