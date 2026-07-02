import { Hono } from 'hono';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

// 新卒Info更新（UPSERT）
app.put('/:id', async (c) => {
  const empId = parseInt(c.req.param('id'));
  const data = await c.req.json<{
    hobbies?: string;
    favorite_food?: string;
    alcohol?: string;
    alcohol_note?: string;
    driving_skill?: string;
    driving_note?: string;
    mental_status?: string;
    mental_note?: string;
    other_notes?: string;
  }>();

  await c.env.DB.prepare(`
    INSERT INTO new_employee_info
      (emp_id, hobbies, favorite_food, alcohol, alcohol_note, driving_skill, driving_note, mental_status, mental_note, other_notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(emp_id) DO UPDATE SET
      hobbies = excluded.hobbies,
      favorite_food = excluded.favorite_food,
      alcohol = excluded.alcohol,
      alcohol_note = excluded.alcohol_note,
      driving_skill = excluded.driving_skill,
      driving_note = excluded.driving_note,
      mental_status = excluded.mental_status,
      mental_note = excluded.mental_note,
      other_notes = excluded.other_notes,
      updated_at = datetime('now', 'localtime')
  `).bind(
    empId,
    data.hobbies || null, data.favorite_food || null,
    data.alcohol || null, data.alcohol_note || null,
    data.driving_skill || null, data.driving_note || null,
    data.mental_status || null, data.mental_note || null,
    data.other_notes || null
  ).run();

  return c.json({ ok: true });
});

export default app;
