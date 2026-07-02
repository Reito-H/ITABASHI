import { Hono } from 'hono';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

export type InterviewRecord = {
  id: number; emp_id: number;
  interview_date: string; next_interview_date: string | null; interviewer: string | null;
  chk_mental_exp: number | null; chk_mental_exp_note: string | null;
  chk_mental_stress: number | null; chk_mental_stress_note: string | null;
  chk_mental_family: number | null; chk_mental_family_note: string | null;
  chk_life_sleep: number | null; chk_life_sleep_note: string | null;
  chk_life_appetite: number | null; chk_life_appetite_note: string | null;
  chk_life_health: number | null; chk_life_health_note: string | null;
  chk_work_motivation: number | null; chk_work_motivation_note: string | null;
  chk_work_instructor: number | null; chk_work_instructor_note: string | null;
  chk_work_rules: number | null; chk_work_rules_note: string | null;
  chk_money: number | null; chk_money_note: string | null;
  chk_relation: number | null; chk_relation_note: string | null;
  chk_appearance: number | null; chk_appearance_note: string | null;
  chk_attendance: number | null; chk_attendance_note: string | null;
  chk_future: number | null; chk_future_note: string | null;
  concerns: string | null; followup_plan: string | null; employee_comment: string | null;
  created_at: string;
};

const FIELDS = [
  'chk_mental_exp','chk_mental_stress','chk_mental_family',
  'chk_life_sleep','chk_life_appetite','chk_life_health',
  'chk_work_motivation','chk_work_instructor','chk_work_rules',
  'chk_money','chk_relation','chk_appearance','chk_attendance','chk_future',
];

// 一覧（社員別）
app.get('/by-emp/:empId', async (c) => {
  const empId = parseInt(c.req.param('empId'));
  const rows = await c.env.DB.prepare(
    'SELECT * FROM interview_records WHERE emp_id = ? ORDER BY interview_date DESC'
  ).bind(empId).all<InterviewRecord>();
  return c.json({ records: rows.results });
});

// 1件取得
app.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT * FROM interview_records WHERE id = ?').bind(id).first<InterviewRecord>();
  if (!row) return c.json({ error: '見つかりません' }, 404);
  return c.json(row);
});

// 新規作成
app.post('/', async (c) => {
  const data = await c.req.json<Record<string, unknown>>();
  if (!data.emp_id || !data.interview_date) return c.json({ error: '必須項目不足' }, 400);

  const cols = ['emp_id','interview_date','next_interview_date','interviewer',
    ...FIELDS.flatMap(f => [f, f+'_note']),
    'concerns','followup_plan','employee_comment'];
  const vals = cols.map(k => data[k] ?? null);

  const r = await c.env.DB.prepare(
    `INSERT INTO interview_records (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`
  ).bind(...vals).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

// 更新
app.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const data = await c.req.json<Record<string, unknown>>();

  const cols = ['interview_date','next_interview_date','interviewer',
    ...FIELDS.flatMap(f => [f, f+'_note']),
    'concerns','followup_plan','employee_comment'];
  const sets = cols.map(k => `${k} = ?`).join(', ');
  const vals = [...cols.map(k => data[k] ?? null), id];

  await c.env.DB.prepare(
    `UPDATE interview_records SET ${sets}, updated_at = datetime('now','localtime') WHERE id = ?`
  ).bind(...vals).run();
  return c.json({ ok: true });
});

// 削除
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM interview_records WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
