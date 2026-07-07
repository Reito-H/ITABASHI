import { Hono } from 'hono';
import type { Env } from '../../auth';

const app = new Hono<{ Bindings: Env }>();

// 社員一覧
app.get('/', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT * FROM employees WHERE is_active = 1 ORDER BY entry_type, seq_no, id
  `).all();
  return c.json({ employees: rows.results });
});

// 社員登録
app.post('/', async (c) => {
  const data = await c.req.json<{
    emp_no: string;
    name: string;
    name_kana?: string;
    division?: number;
    team?: number;
    locker_no?: string;
    phone?: string;
    entry_type?: string;
    hire_date?: string;
    birth_date?: string;
    seq_no?: number;
    work_schedule?: string;
    start_time?: string;
    car_no?: string;
    enrollment_status?: string;
    work_hours_type?: string;
    is_caution?: number;
    is_sales_followup?: number;
    problem_notes?: string;
    retirement_date?: string;
  }>();

  if (!data.emp_no || !data.name) {
    return c.json({ error: '社員番号と氏名は必須です' }, 400);
  }
  if (!/^\d{8}$/.test(data.emp_no)) {
    return c.json({ error: '社員番号は8桁の数字で入力してください' }, 400);
  }

  const VALID_SCHEDULES = ['a', 'b', 'B', 'D', 'H'];
  if (data.work_schedule && !VALID_SCHEDULES.includes(data.work_schedule)) {
    return c.json({ error: '勤務体系が不正です' }, 400);
  }
  const VALID_ENROLLMENT = ['通常', '育休', '病欠', '傷病'];
  if (data.enrollment_status && !VALID_ENROLLMENT.includes(data.enrollment_status)) {
    return c.json({ error: '在籍状態が不正です' }, 400);
  }

  try {
    const result = await c.env.DB.prepare(`
      INSERT INTO employees (emp_no, name, name_kana, division, team, locker_no, phone, entry_type,
        hire_date, birth_date, seq_no, work_schedule, start_time, car_no, enrollment_status,
        work_hours_type, is_caution, is_sales_followup, problem_notes, retirement_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      data.emp_no,
      data.name,
      data.name_kana ?? null,
      data.division ?? null,
      data.team ?? null,
      data.locker_no ?? null,
      data.phone ?? null,
      data.entry_type ?? '新卒',
      data.hire_date ?? null,
      data.birth_date ?? null,
      data.seq_no ?? null,
      data.work_schedule ?? null,
      data.start_time ?? null,
      data.car_no ?? null,
      data.enrollment_status ?? '通常',
      data.work_hours_type ?? null,
      data.is_caution ?? 0,
      data.is_sales_followup ?? 0,
      data.problem_notes ?? null,
      data.retirement_date ?? null
    ).run();

    return c.json({ ok: true, id: result.meta.last_row_id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      return c.json({ error: `社員番号「${data.emp_no}」は既に登録されています` }, 400);
    }
    return c.json({ error: `登録に失敗しました: ${msg}` }, 500);
  }
});

// 社員更新
// 送信されたフィールドのみ更新。null を明示的に送ればクリア可能。
app.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);
  const data = await c.req.json<{
    name?: string;
    name_kana?: string | null;
    division?: number | null;
    team?: number | null;
    locker_no?: string | null;
    phone?: string | null;
    entry_type?: string;
    hire_date?: string | null;
    first_duty_date?: string | null;
    birth_date?: string | null;
    seq_no?: number | null;
    training_completed?: number;
    status?: string;
    interview_target?: number;
    work_schedule?: string | null;
    start_time?: string | null;
    car_no?: string | null;
    enrollment_status?: string | null;
    work_hours_type?: string | null;
    is_caution?: number;
    is_sales_followup?: number;
    problem_notes?: string | null;
    retirement_date?: string | null;
    avg_return_time?: string | null;
    exclude_retirement_candidate?: number;
    is_hanchyo?: number;
  }>();

  const sets: string[] = [];
  const vals: (string | number | null)[] = [];

  // フォームフィールド: undefined でない場合のみ更新（null も許可してクリア可能にする）
  if (data.name !== undefined)           { sets.push('name = COALESCE(?, name)'); vals.push(data.name); }
  if (data.name_kana !== undefined)      { sets.push('name_kana = ?');            vals.push(data.name_kana ?? null); }
  if (data.division !== undefined)       { sets.push('division = ?');             vals.push(data.division ?? null); }
  if (data.team !== undefined)           { sets.push('team = ?');                 vals.push(data.team ?? null); }
  if (data.locker_no !== undefined)      { sets.push('locker_no = ?');            vals.push(data.locker_no ?? null); }
  if (data.phone !== undefined)          { sets.push('phone = ?');                vals.push(data.phone ?? null); }
  if (data.entry_type !== undefined)     { sets.push('entry_type = COALESCE(?, entry_type)'); vals.push(data.entry_type); }
  if (data.hire_date !== undefined)      { sets.push('hire_date = ?');            vals.push(data.hire_date ?? null); }
  if (data.first_duty_date !== undefined){ sets.push('first_duty_date = ?');      vals.push(data.first_duty_date ?? null); }
  if (data.birth_date !== undefined)     { sets.push('birth_date = ?');           vals.push(data.birth_date ?? null); }
  if (data.seq_no !== undefined)         { sets.push('seq_no = ?');               vals.push(data.seq_no ?? null); }
  // 部分更新フィールド（ボタン操作などから単体で更新）
  if (data.training_completed !== undefined) { sets.push('training_completed = ?'); vals.push(data.training_completed); }
  if (data.status !== undefined)         { sets.push('status = ?');               vals.push(data.status); }
  if (data.interview_target !== undefined) { sets.push('interview_target = ?');   vals.push(data.interview_target); }
  if (data.work_schedule !== undefined)  { sets.push('work_schedule = ?');        vals.push(data.work_schedule ?? null); }
  if (data.start_time !== undefined)     { sets.push('start_time = ?');           vals.push(data.start_time ?? null); }
  if (data.car_no !== undefined)         { sets.push('car_no = ?');               vals.push(data.car_no ?? null); }
  if (data.enrollment_status !== undefined) { sets.push('enrollment_status = ?'); vals.push(data.enrollment_status ?? '通常'); }
  if (data.work_hours_type !== undefined){ sets.push('work_hours_type = ?');      vals.push(data.work_hours_type ?? null); }
  if (data.is_caution !== undefined)     { sets.push('is_caution = ?');           vals.push(data.is_caution); }
  if (data.is_sales_followup !== undefined) { sets.push('is_sales_followup = ?'); vals.push(data.is_sales_followup); }
  if (data.problem_notes !== undefined)  { sets.push('problem_notes = ?');        vals.push(data.problem_notes ?? null); }
  if (data.retirement_date !== undefined)  { sets.push('retirement_date = ?');   vals.push(data.retirement_date ?? null); }
  if (data.avg_return_time !== undefined)  { sets.push('avg_return_time = ?');   vals.push(data.avg_return_time ?? null); }
  if (data.exclude_retirement_candidate !== undefined) { sets.push('exclude_retirement_candidate = ?'); vals.push(data.exclude_retirement_candidate); }
  if (data.is_hanchyo !== undefined)       { sets.push('is_hanchyo = ?');        vals.push(data.is_hanchyo); }

  if (sets.length === 0) return c.json({ ok: true });

  sets.push("updated_at = datetime('now', 'localtime')");
  vals.push(id);

  await c.env.DB.prepare(
    `UPDATE employees SET ${sets.join(', ')} WHERE id = ?`
  ).bind(...vals).run();

  return c.json({ ok: true });
});

// 社員無効化（論理削除 = 退職処理）
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);
  await c.env.DB.prepare(
    "UPDATE employees SET is_active = 0, updated_at = datetime('now', 'localtime') WHERE id = ?"
  ).bind(id).run();
  return c.json({ ok: true });
});

// 在籍復帰
app.post('/:id/reinstate', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);
  await c.env.DB.prepare(
    "UPDATE employees SET is_active = 1, retirement_date = NULL, updated_at = datetime('now', 'localtime') WHERE id = ?"
  ).bind(id).run();
  return c.json({ ok: true });
});

// CSV一括インポート（emp_no ベースで新規挿入 or 更新）
// D1 batch API を使い、リクエスト数を最小化（1 SELECT + N/100 batch calls）
app.post('/csv-import', async (c) => {
  const data = await c.req.json<{
    employees: Array<{
      emp_no: string;
      name: string;
      name_kana?: string | null;
      division?: number | null;
      team?: number | null;
      work_schedule?: string | null;
      start_time?: string | null;
      avg_return_time?: string | null;
      used_cars?: string | null;
      isLongAbsent?: boolean;
    }>;
  }>();

  if (!Array.isArray(data?.employees) || data.employees.length === 0) {
    return c.json({ error: 'データがありません' }, 400);
  }

  const valid = data.employees.filter(emp =>
    emp.emp_no && emp.name && /^\d{8}$/.test(emp.emp_no)
  );
  if (valid.length === 0) return c.json({ error: '有効なデータがありません' }, 400);

  // 既存社員はUPDATE、未登録社員はINSERT（status='completed'で一般社員として追加）
  // status='completed' にすることで新人シフト管理には一切出てこない
  const LOOKUP_CHUNK = 100;
  const existingSet = new Set<string>();
  for (let ci = 0; ci < valid.length; ci += LOOKUP_CHUNK) {
    const lc = valid.slice(ci, ci + LOOKUP_CHUNK);
    const ph = lc.map(() => '?').join(',');
    const rows = await c.env.DB.prepare(
      `SELECT emp_no FROM employees WHERE emp_no IN (${ph})`
    ).bind(...lc.map(e => e.emp_no)).all<{ emp_no: string }>();
    for (const r of (rows.results ?? [])) existingSet.add(r.emp_no);
  }

  const toInsert = valid.filter(e => !existingSet.has(e.emp_no));
  const toUpdate = valid.filter(e =>  existingSet.has(e.emp_no));

  type D1Stmt = ReturnType<typeof c.env.DB.prepare>;
  const statements: D1Stmt[] = [];

  for (const emp of toInsert) {
    const enrollStatus = emp.isLongAbsent ? '長欠' : '通常';
    statements.push(
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO employees
           (emp_no, name, name_kana, division, team, work_schedule, start_time,
            avg_return_time, used_cars, status, enrollment_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`
      ).bind(
        emp.emp_no, emp.name, emp.name_kana ?? null,
        emp.division ?? null, emp.team ?? null,
        emp.work_schedule ?? null, emp.start_time ?? null,
        emp.avg_return_time ?? null, emp.used_cars ?? null,
        enrollStatus
      )
    );
  }

  for (const emp of toUpdate) {
    statements.push(
      c.env.DB.prepare(
        `UPDATE employees SET
           name_kana       = COALESCE(?, name_kana),
           division        = COALESCE(?, division),
           team            = COALESCE(?, team),
           work_schedule   = COALESCE(?, work_schedule),
           start_time      = COALESCE(?, start_time),
           avg_return_time = COALESCE(?, avg_return_time),
           used_cars       = ?,
           enrollment_status = CASE WHEN ? = 1 THEN '長欠' ELSE enrollment_status END,
           updated_at      = datetime('now', 'localtime')
         WHERE emp_no = ?`
      ).bind(
        emp.name_kana ?? null,
        emp.division ?? null, emp.team ?? null,
        emp.work_schedule ?? null, emp.start_time ?? null,
        emp.avg_return_time ?? null,
        emp.used_cars ?? null,
        emp.isLongAbsent ? 1 : 0,
        emp.emp_no
      )
    );
  }

  // DB.batch() で 100件ずつまとめて送信（1チャンク = 1 subrequest）
  const CHUNK = 100;
  const errors: string[] = [];
  for (let i = 0; i < statements.length; i += CHUNK) {
    try {
      await c.env.DB.batch(statements.slice(i, i + CHUNK));
    } catch (e) {
      errors.push(`batch[${i}–${i + CHUNK - 1}]: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return c.json({ ok: true, inserted: toInsert.length, updated: toUpdate.length, errors });
});

// emp_noベースの一括退職処理（CSVインポート退職候補向け）
app.post('/retire-by-empno', async (c) => {
  const data = await c.req.json<{ empNos: string[] }>();
  if (!Array.isArray(data?.empNos) || data.empNos.length === 0) return c.json({ error: 'emp_noが指定されていません' }, 400);
  const valid = data.empNos.filter(n => /^\d{8}$/.test(n));
  if (valid.length === 0) return c.json({ error: '有効なemp_noがありません' }, 400);
  const placeholders = valid.map(() => '?').join(',');
  const result = await c.env.DB.prepare(
    `UPDATE employees SET is_active = 0,
       retirement_date = COALESCE(NULLIF(retirement_date,''), date('now','localtime')),
       updated_at = datetime('now','localtime')
     WHERE emp_no IN (${placeholders})`
  ).bind(...valid).run();
  return c.json({ ok: true, count: result.meta.changes });
});

// emp_noベースの一括完全削除（CSVインポート退職候補向け）
app.post('/purge-by-empno', async (c) => {
  const data = await c.req.json<{ empNos: string[] }>();
  if (!Array.isArray(data?.empNos) || data.empNos.length === 0) return c.json({ error: 'emp_noが指定されていません' }, 400);
  const valid = data.empNos.filter(n => /^\d{8}$/.test(n));
  if (valid.length === 0) return c.json({ error: '有効なemp_noがありません' }, 400);
  const placeholders = valid.map(() => '?').join(',');
  const rows = await c.env.DB.prepare(
    `SELECT id FROM employees WHERE emp_no IN (${placeholders})`
  ).bind(...valid).all<{ id: number }>();
  const ids = (rows.results ?? []).map(r => r.id);
  if (ids.length > 0) {
    const relTables = ['shift_entries','sales_records','bad_events','new_employee_info','invite_codes','line_users','interview_records'];
    const CHUNK = 100;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const ph = chunk.map(() => '?').join(',');
      await c.env.DB.batch([
        ...relTables.map(t => c.env.DB.prepare(`DELETE FROM ${t} WHERE emp_id IN (${ph})`).bind(...chunk)),
        c.env.DB.prepare(`DELETE FROM employees WHERE id IN (${ph})`).bind(...chunk),
      ]);
    }
  }
  return c.json({ ok: true, count: ids.length });
});

// 一括退職処理（論理削除）
app.post('/bulk-retire', async (c) => {
  try {
    const data = await c.req.json<{ ids: number[] }>();
    if (!Array.isArray(data?.ids) || data.ids.length === 0) return c.json({ error: 'IDが指定されていません' }, 400);
    const ids = data.ids.filter(id => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return c.json({ error: '有効なIDがありません' }, 400);
    // D1 はパラメータ数に上限があるため 100 件ずつ処理
    const CHUNK = 100;
    let total = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => '?').join(',');
      await c.env.DB.prepare(
        `UPDATE employees SET is_active = 0,
           retirement_date = COALESCE(NULLIF(retirement_date,''), date('now','localtime')),
           updated_at = datetime('now','localtime')
         WHERE id IN (${placeholders})`
      ).bind(...chunk).run();
      total += chunk.length;
    }
    return c.json({ ok: true, count: total });
  } catch (e: unknown) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// 一括完全削除（物理削除）
app.post('/bulk-purge', async (c) => {
  try {
    const data = await c.req.json<{ ids: number[] }>();
    if (!Array.isArray(data?.ids) || data.ids.length === 0) return c.json({ error: 'IDが指定されていません' }, 400);
    const ids = data.ids.filter(id => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return c.json({ error: '有効なIDがありません' }, 400);
    const CHUNK = 100;
    const relTables = ['shift_entries','sales_records','bad_events','new_employee_info','invite_codes','line_users','interview_records'];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const ph = chunk.map(() => '?').join(',');
      await c.env.DB.batch([
        ...relTables.map(t => c.env.DB.prepare(`DELETE FROM ${t} WHERE emp_id IN (${ph})`).bind(...chunk)),
        c.env.DB.prepare(`DELETE FROM employees WHERE id IN (${ph})`).bind(...chunk),
      ]);
    }
    return c.json({ ok: true, count: ids.length });
  } catch (e: unknown) {
    return c.json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// 社員完全削除（物理削除・関連データも全削除）
app.delete('/:id/purge', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);
  const tables = [
    'shift_entries',
    'sales_records',
    'bad_events',
    'new_employee_info',
    'invite_codes',
    'line_users',
    'interview_records',
  ];
  await c.env.DB.batch([
    ...tables.map(t => c.env.DB.prepare(`DELETE FROM ${t} WHERE emp_id = ?`).bind(id)),
    c.env.DB.prepare('DELETE FROM employees WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

export default app;
