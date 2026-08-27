// 事故研修記録（実施した事故研修の5W1H記録＋担当者所感）
// ページ: /accidents/training-record, /accidents/training-record/:id/print
// API   : /api/accidents/training-record (POST), /api/accidents/training-record/:id (DELETE)
import { Hono } from 'hono';
import type { Env } from '../auth';
import { ADMIN_PATH } from '../config';
import { layout } from '../html/layout';
import { accidentsTrainingRecordPage, type TrainingRecordRow } from '../html/accidents_training_record';
import { renderAccidentsTrainingRecordPrintPage } from '../html/accidents_training_record_print';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

app.get('/accidents/training-record', async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT * FROM accident_training_records ORDER BY conducted_date DESC, id DESC`
  ).all<TrainingRecordRow>();

  const content = accidentsTrainingRecordPage({
    records: res.results ?? [],
    searchEmployeesHref: `${ADMIN_PATH}/accidents/training-record/search-employees`,
    createHref: `${ADMIN_PATH}/api/accidents/training-record`,
    printHrefBase: `${ADMIN_PATH}/accidents/training-record`,
    deleteHrefBase: `${ADMIN_PATH}/api/accidents/training-record`,
  });
  return c.html(layout('事故研修記録', content, 'accidents'));
});

app.get('/accidents/training-record/search-employees', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 40);
  if (!q) return c.json([]);
  const rows = await c.env.DB.prepare(
    `SELECT id, name, emp_no, division, team FROM employees
     WHERE is_active = 1 AND (name LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)
     ORDER BY division, team, seq_no LIMIT 20`
  ).bind(`%${q}%`, `%${q}%`, `%${q}%`).all<{ id: number; name: string; emp_no: string; division: number | null; team: number | null }>();
  return c.json(rows.results ?? []);
});

app.get('/accidents/training-record/:id/print', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const record = await c.env.DB.prepare(`SELECT * FROM accident_training_records WHERE id = ?`).bind(id).first<TrainingRecordRow>();
  if (!record) return c.text('研修記録が見つかりません', 404);

  return c.html(renderAccidentsTrainingRecordPrintPage({
    record,
    backHref: `${ADMIN_PATH}/accidents/training-record`,
  }));
});

app.post('/api/accidents/training-record', async (c) => {
  let data: {
    employee_id?: number; employee_name?: string; emp_no?: string | null;
    division?: number | null; team?: string | null; conducted_date?: string;
    location?: string; trainer_name?: string; content?: string; reason?: string;
    method?: string; comment?: string;
  };
  try {
    data = await c.req.json();
  } catch {
    return c.json({ error: 'データがありません' }, 400);
  }

  if (!data.employee_id || !data.employee_name) return c.json({ error: '対象者を選択してください' }, 400);
  if (!data.conducted_date || !/^\d{4}-\d{2}-\d{2}$/.test(data.conducted_date)) return c.json({ error: '実施日を入力してください' }, 400);

  const adminId = c.get('adminId');
  await c.env.DB.prepare(
    `INSERT INTO accident_training_records
      (employee_id, employee_name, emp_no, division, team, conducted_date, location, trainer_name, content, reason, method, comment, created_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`
  ).bind(
    data.employee_id, data.employee_name, data.emp_no ?? null, data.division ?? null,
    data.team != null ? String(data.team) : null,
    data.conducted_date, data.location || null, data.trainer_name || null, data.content || null,
    data.reason || null, data.method || null, data.comment || null, adminId ?? null
  ).run();

  return c.json({ ok: true });
});

app.delete('/api/accidents/training-record/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  await c.env.DB.prepare('DELETE FROM accident_training_records WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
