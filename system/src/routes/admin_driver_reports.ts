// ドライバー報告
// ページ: /driver-reports, /driver-reports/:empId
// API   : /api/driver-reports/*
// 全権限アカウント（admins.permissions IS NULL）のみ使用可。permissions.ts のPATH_PERMISSIONS/
// PERMISSION_CATALOGに意図的に登録していないため、制限付きアカウントは自動的にアクセス不可になる。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import {
  driverReportsListPage,
  driverReportDetailPage,
  DRIVER_REPORT_CATEGORIES,
  type DriverReportEmployeeSummary,
  type DriverReportEntry,
} from '../html/driver_reports';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<string> {
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?')
    .bind(c.get('adminId')).first<{ username: string }>();
  return row?.username ?? `id:${c.get('adminId')}`;
}

// ===== ページ =====

app.get('/driver-reports', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT e.id, e.name, e.emp_no, e.division, e.team,
      COUNT(d.id) as report_count, MAX(d.report_date) as last_report_date
    FROM driver_reports d
    JOIN employees e ON d.emp_id = e.id
    GROUP BY e.id
    ORDER BY last_report_date DESC
  `).all<DriverReportEmployeeSummary>();

  return c.html(layout('ドライバー報告', driverReportsListPage(rows.results ?? []), 'driver-reports'));
});

app.get('/driver-reports/:empId', async (c) => {
  const empId = parseInt(c.req.param('empId'));
  const emp = await c.env.DB.prepare('SELECT id, name, emp_no, division, team FROM employees WHERE id = ?')
    .bind(empId).first<{ id: number; name: string; emp_no: string; division: number | null; team: number | null }>();
  if (!emp) return c.text('社員が見つかりません', 404);

  const entries = await c.env.DB.prepare(
    'SELECT id, report_date, category, content, created_by_name, created_at FROM driver_reports WHERE emp_id = ? ORDER BY report_date DESC, id DESC'
  ).bind(empId).all<DriverReportEntry>();

  return c.html(layout(`ドライバー報告 — ${emp.name}`, driverReportDetailPage(emp, entries.results ?? []), 'driver-reports'));
});

// ===== API =====

app.get('/api/driver-reports/search-employees', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 40);
  if (!q) return c.json([]);
  const rows = await c.env.DB.prepare(
    `SELECT id, name, emp_no, division, team FROM employees
     WHERE is_active = 1 AND (name LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)
     ORDER BY division, team, seq_no LIMIT 20`
  ).bind(`%${q}%`, `%${q}%`, `%${q}%`).all<{ id: number; name: string; emp_no: string; division: number | null; team: number | null }>();
  return c.json(rows.results ?? []);
});

app.post('/api/driver-reports', async (c) => {
  const b = await c.req.json<{ emp_id?: number; report_date?: string; category?: string; content?: string }>();
  const empId = Number(b.emp_id);
  const reportDate = String(b.report_date ?? '').slice(0, 10);
  const category = DRIVER_REPORT_CATEGORIES.includes(String(b.category)) ? String(b.category) : 'その他';
  const content = String(b.content ?? '').trim().slice(0, 2000);
  if (!empId || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate) || !content) {
    return c.json({ error: '不正なリクエストです' }, 400);
  }

  const emp = await c.env.DB.prepare('SELECT id FROM employees WHERE id = ?').bind(empId).first();
  if (!emp) return c.json({ error: '社員が見つかりません' }, 404);

  const opName = await adminName(c);
  await c.env.DB.prepare(
    'INSERT INTO driver_reports (emp_id, report_date, category, content, created_by, created_by_name) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(empId, reportDate, category, content, c.get('adminId'), opName).run();

  return c.json({ ok: true });
});

app.delete('/api/driver-reports/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM driver_reports WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
