import { Hono } from 'hono';
import type { Env } from '../../auth';
import { getPeriod } from '../../auth';
import { normalizeKana } from '../../utils/kana';

const app = new Hono<{ Bindings: Env }>();

// 在籍社員数（ステータス確認用の軽量エンドポイント）
app.get('/count', async (c) => {
  const row = await c.env.DB.prepare('SELECT COUNT(*) AS cnt FROM employees WHERE is_active = 1')
    .first<{ cnt: number }>();
  return c.json({ count: row?.cnt ?? 0 });
});

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
      normalizeKana(data.name_kana),
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
  if (data.name_kana !== undefined)      { sets.push('name_kana = ?');            vals.push(normalizeKana(data.name_kana)); }
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

// 新人登録・種別/新卒年度の設定（newcomers.register 権限でのみ書き込み可）
app.put('/:id/newcomer', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);
  const data = await c.req.json<{
    is_newcomer?: number;
    newcomer_type?: 'normal' | 'shinsotsu' | null;
    graduate_year?: number | null;
  }>();

  const isNewcomer = data.is_newcomer ? 1 : 0;
  const newcomerType = isNewcomer ? (data.newcomer_type ?? null) : null;
  const graduateYear = isNewcomer && newcomerType === 'shinsotsu' ? (data.graduate_year ?? null) : null;

  if (newcomerType !== null && newcomerType !== 'normal' && newcomerType !== 'shinsotsu') {
    return c.json({ error: '種別が不正です' }, 400);
  }

  await c.env.DB.prepare(
    `UPDATE employees SET is_newcomer = ?, newcomer_type = ?, graduate_year = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`
  ).bind(isNewcomer, newcomerType, graduateYear, id).run();

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
  let data: {
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
      salesEntries?: Array<{ date: string; dutyCode: string; amount: number; startTime?: string | null; returnTime?: string | null; rideCount?: number | null; distanceKm?: number | null; laborHours?: number | null; nightHours?: number | null; overtimeHours?: number | null; rawCsv?: string | null }>;
      safetyEntries?: Array<{
        date: string;
        harshStartLoaded: number | null; harshStartEmpty: number | null;
        harshAccelLoaded: number | null; harshAccelEmpty: number | null;
        harshDecelLoaded: number | null; harshDecelEmpty: number | null;
        maxSpeedLoadedHighway: number | null; maxSpeedEmptyHighway: number | null;
        maxSpeedLoadedLocal: number | null; maxSpeedEmptyLocal: number | null;
      }>;
    }>;
  };
  try {
    data = await c.req.json();
  } catch {
    return c.json({ error: 'データがありません' }, 400);
  }

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
        emp.emp_no, emp.name, normalizeKana(emp.name_kana),
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
        normalizeKana(emp.name_kana),
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

  // 税込売上（CSV最終列）を各社員の売上記録(sales_records)へ反映
  // 会社公式データのため上書き優先。ride_count/distance_kmは行に無ければ既存値を保持する（従来形式のCSVは未指定）
  let salesUpdated = 0;
  const DUTY_CODES = ['a', 'b', 'B', 'D', 'H'];
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const salesByEmpNo = new Map<string, Array<{ date: string; dutyCode: string; amount: number; startTime?: string | null; returnTime?: string | null; rideCount?: number | null; distanceKm?: number | null; laborHours?: number | null; nightHours?: number | null; overtimeHours?: number | null; rawCsv?: string | null }>>();
  for (const emp of valid) {
    if (emp.salesEntries?.length) salesByEmpNo.set(emp.emp_no, emp.salesEntries);
  }

  if (salesByEmpNo.size > 0) {
    const empNos = [...salesByEmpNo.keys()];
    const idMap = new Map<string, number>();
    for (let ci = 0; ci < empNos.length; ci += LOOKUP_CHUNK) {
      const lc = empNos.slice(ci, ci + LOOKUP_CHUNK);
      const ph = lc.map(() => '?').join(',');
      const rows = await c.env.DB.prepare(
        `SELECT id, emp_no FROM employees WHERE emp_no IN (${ph})`
      ).bind(...lc).all<{ id: number; emp_no: string }>();
      for (const r of (rows.results ?? [])) idMap.set(r.emp_no, r.id);
    }

    const salesStatements: D1Stmt[] = [];
    for (const [empNo, entries] of salesByEmpNo) {
      const empId = idMap.get(empNo);
      if (!empId) continue;
      for (const entry of entries) {
        const amount = Math.round(Number(entry.amount));
        if (!Number.isFinite(amount) || amount < 0 || amount > 999999) continue;
        if (!DATE_RE.test(entry.date) || !DUTY_CODES.includes(entry.dutyCode)) continue;
        const { year, month } = getPeriod(entry.date);
        const startTime = /^\d{2}:\d{2}$/.test(entry.startTime ?? '') ? entry.startTime! : null;
        const returnTime = /^\d{2}:\d{2}$/.test(entry.returnTime ?? '') ? entry.returnTime! : null;
        const rideCount = Number.isFinite(entry.rideCount) ? Math.round(entry.rideCount as number) : null;
        const distanceKm = Number.isFinite(entry.distanceKm) ? Math.round(entry.distanceKm as number) : null;
        const laborHours = Number.isFinite(entry.laborHours) ? entry.laborHours as number : null;
        const nightHours = Number.isFinite(entry.nightHours) ? entry.nightHours as number : null;
        const overtimeHours = Number.isFinite(entry.overtimeHours) ? entry.overtimeHours as number : null;
        const rawCsv = entry.rawCsv ?? null;
        salesStatements.push(
          c.env.DB.prepare(`
            INSERT INTO sales_records (emp_id, date, amount, duty_code, period_year, period_month, start_time, return_time, ride_count, distance_km, labor_hours, night_hours, overtime_hours, raw_csv_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
            ON CONFLICT(emp_id, date) DO UPDATE SET
              amount = excluded.amount,
              duty_code = excluded.duty_code,
              period_year = excluded.period_year,
              period_month = excluded.period_month,
              start_time = COALESCE(excluded.start_time, sales_records.start_time),
              return_time = COALESCE(excluded.return_time, sales_records.return_time),
              ride_count = COALESCE(excluded.ride_count, sales_records.ride_count),
              distance_km = COALESCE(excluded.distance_km, sales_records.distance_km),
              labor_hours = COALESCE(excluded.labor_hours, sales_records.labor_hours),
              night_hours = COALESCE(excluded.night_hours, sales_records.night_hours),
              overtime_hours = COALESCE(excluded.overtime_hours, sales_records.overtime_hours),
              raw_csv_json = COALESCE(excluded.raw_csv_json, sales_records.raw_csv_json),
              updated_at = datetime('now', 'localtime')
          `).bind(empId, entry.date, amount, entry.dutyCode, year, month, startTime, returnTime, rideCount, distanceKm, laborHours, nightHours, overtimeHours, rawCsv)
        );
      }
    }

    for (let i = 0; i < salesStatements.length; i += CHUNK) {
      const chunk = salesStatements.slice(i, i + CHUNK);
      try {
        await c.env.DB.batch(chunk);
        salesUpdated += chunk.length;
      } catch (e) {
        errors.push(`sales[${i}–${i + CHUNK - 1}]: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // 安全運転データ（ホシコン形式CSVのみ、無ければ空）を driving_safety_records へ反映
  let safetyUpdated = 0;
  const safetyByEmpNo = new Map<string, NonNullable<typeof valid[number]['safetyEntries']>>();
  for (const emp of valid) {
    if (emp.safetyEntries?.length) safetyByEmpNo.set(emp.emp_no, emp.safetyEntries);
  }

  if (safetyByEmpNo.size > 0) {
    const empNos = [...safetyByEmpNo.keys()];
    const idMap = new Map<string, number>();
    for (let ci = 0; ci < empNos.length; ci += LOOKUP_CHUNK) {
      const lc = empNos.slice(ci, ci + LOOKUP_CHUNK);
      const ph = lc.map(() => '?').join(',');
      const rows = await c.env.DB.prepare(
        `SELECT id, emp_no FROM employees WHERE emp_no IN (${ph})`
      ).bind(...lc).all<{ id: number; emp_no: string }>();
      for (const r of (rows.results ?? [])) idMap.set(r.emp_no, r.id);
    }

    const numOrNull = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v)) ? Math.round(v) : null;
    const safetyStatements: D1Stmt[] = [];
    for (const [empNo, entries] of safetyByEmpNo) {
      const empId = idMap.get(empNo);
      if (!empId) continue;
      for (const entry of entries) {
        if (!DATE_RE.test(entry.date)) continue;
        safetyStatements.push(
          c.env.DB.prepare(`
            INSERT INTO driving_safety_records (
              emp_id, date, harsh_start_loaded, harsh_start_empty, harsh_accel_loaded, harsh_accel_empty,
              harsh_decel_loaded, harsh_decel_empty, max_speed_loaded_highway, max_speed_empty_highway,
              max_speed_loaded_local, max_speed_empty_local, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
            ON CONFLICT(emp_id, date) DO UPDATE SET
              harsh_start_loaded = excluded.harsh_start_loaded,
              harsh_start_empty = excluded.harsh_start_empty,
              harsh_accel_loaded = excluded.harsh_accel_loaded,
              harsh_accel_empty = excluded.harsh_accel_empty,
              harsh_decel_loaded = excluded.harsh_decel_loaded,
              harsh_decel_empty = excluded.harsh_decel_empty,
              max_speed_loaded_highway = excluded.max_speed_loaded_highway,
              max_speed_empty_highway = excluded.max_speed_empty_highway,
              max_speed_loaded_local = excluded.max_speed_loaded_local,
              max_speed_empty_local = excluded.max_speed_empty_local,
              updated_at = datetime('now', 'localtime')
          `).bind(
            empId, entry.date,
            numOrNull(entry.harshStartLoaded), numOrNull(entry.harshStartEmpty),
            numOrNull(entry.harshAccelLoaded), numOrNull(entry.harshAccelEmpty),
            numOrNull(entry.harshDecelLoaded), numOrNull(entry.harshDecelEmpty),
            numOrNull(entry.maxSpeedLoadedHighway), numOrNull(entry.maxSpeedEmptyHighway),
            numOrNull(entry.maxSpeedLoadedLocal), numOrNull(entry.maxSpeedEmptyLocal),
          )
        );
      }
    }

    for (let i = 0; i < safetyStatements.length; i += CHUNK) {
      const chunk = safetyStatements.slice(i, i + CHUNK);
      try {
        await c.env.DB.batch(chunk);
        safetyUpdated += chunk.length;
      } catch (e) {
        errors.push(`safety[${i}–${i + CHUNK - 1}]: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return c.json({ ok: true, inserted: toInsert.length, updated: toUpdate.length, salesUpdated, safetyUpdated, errors });
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
    const relTables = ['shift_entries','sales_records','driving_safety_records','new_employee_info','invite_codes','line_users','interview_records'];
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

// 一括在籍復帰（誤って退職処理された社員のまとめ取り消し）
app.post('/bulk-reinstate', async (c) => {
  try {
    const data = await c.req.json<{ ids: number[] }>();
    if (!Array.isArray(data?.ids) || data.ids.length === 0) return c.json({ error: 'IDが指定されていません' }, 400);
    const ids = data.ids.filter(id => Number.isInteger(id) && id > 0);
    if (ids.length === 0) return c.json({ error: '有効なIDがありません' }, 400);
    const CHUNK = 100;
    let total = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => '?').join(',');
      await c.env.DB.prepare(
        `UPDATE employees SET is_active = 1, retirement_date = NULL, updated_at = datetime('now','localtime')
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
    const relTables = ['shift_entries','sales_records','driving_safety_records','new_employee_info','invite_codes','line_users','interview_records'];
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
    'driving_safety_records',
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

// ============================================================================
// 社員動態表（人事システム出力の xlsx）取込
//   ブラウザ側で SheetJS 解析 → 差分を JSON でこのAPIに渡す。
//   在籍者一覧=upsert / 退職一覧=退職 or 退職予定 or 取下 / 異動一覧=在籍除外 / 配属一覧=新規追加
// ============================================================================

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMPNO_RE = /^\d{8}$/;
const ENTRY_TYPES = new Set(['新卒', 'キャリア', '縁故']);

// 差分計算用の軽量スナップショット（在籍・退職とも全件）
app.get('/dotai-snapshot', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, emp_no, name, name_kana, division, team, birth_date, hire_date,
            first_duty_date, entry_type, status, is_active, retirement_date, contract_type
       FROM employees`
  ).all();
  return c.json({ employees: rows.results ?? [] });
});

type DotaiUpsert = {
  emp_no: string;
  name?: string;
  name_kana?: string | null;
  birth_date?: string | null;
  hire_date?: string | null;
  first_duty_date?: string | null;
  division?: number | null;
  entry_type?: string | null;
  contract_type?: string | null;
};

app.post('/dotai-import', async (c) => {
  let data: {
    updates?: DotaiUpsert[];
    inserts?: DotaiUpsert[];
    retire?: Array<{ emp_no: string; retirement_date?: string | null; retirement_reason?: string | null; deactivate?: boolean }>;
    reactivate?: Array<{ emp_no: string }>;
    deactivateMoved?: Array<{ emp_no: string; moved_date?: string | null; note?: string | null }>;
  };
  try {
    data = await c.req.json();
  } catch {
    return c.json({ error: 'データがありません' }, 400);
  }

  type D1Stmt = ReturnType<typeof c.env.DB.prepare>;
  const statements: D1Stmt[] = [];
  const skipped: string[] = [];

  const cleanDate = (v: unknown): string | null =>
    typeof v === 'string' && DATE_RE.test(v.trim()) ? v.trim() : null;
  const cleanDiv = (v: unknown): number | null =>
    typeof v === 'number' && v >= 1 && v <= 4 ? v : null;
  const cleanEntry = (v: unknown): string | null =>
    typeof v === 'string' && ENTRY_TYPES.has(v) ? v : null;
  const cleanContract = (v: unknown): string | null =>
    v === '一般' || v === '労共' ? v : null;

  // --- 既存社員の更新（項目が来ているものだけ SET）---
  for (const u of data.updates ?? []) {
    if (!EMPNO_RE.test(u.emp_no ?? '')) { skipped.push(`update:${u.emp_no}`); continue; }
    const sets: string[] = [];
    const vals: (string | number | null)[] = [];
    if (typeof u.name === 'string' && u.name.trim()) { sets.push('name = ?'); vals.push(u.name.trim()); }
    if (u.name_kana !== undefined) { sets.push('name_kana = ?'); vals.push(normalizeKana(u.name_kana)); }
    if (u.birth_date !== undefined) { const d = cleanDate(u.birth_date); if (d) { sets.push('birth_date = ?'); vals.push(d); } }
    if (u.hire_date !== undefined) { const d = cleanDate(u.hire_date); if (d) { sets.push('hire_date = ?'); vals.push(d); } }
    if (u.first_duty_date !== undefined) { const d = cleanDate(u.first_duty_date); if (d) { sets.push('first_duty_date = ?'); vals.push(d); } }
    if (u.division !== undefined) { const d = cleanDiv(u.division); if (d) { sets.push('division = ?'); vals.push(d); } }
    if (u.entry_type !== undefined) { const e = cleanEntry(u.entry_type); if (e) { sets.push('entry_type = ?'); vals.push(e); } }
    if (u.contract_type !== undefined) { const t = cleanContract(u.contract_type); if (t) { sets.push('contract_type = ?'); vals.push(t); } }
    if (sets.length === 0) continue;
    sets.push("updated_at = datetime('now', 'localtime')");
    vals.push(u.emp_no);
    statements.push(c.env.DB.prepare(`UPDATE employees SET ${sets.join(', ')} WHERE emp_no = ?`).bind(...vals));
  }

  // --- 新規追加（DB未登録の在籍者・入社予定者）---
  for (const ins of data.inserts ?? []) {
    if (!EMPNO_RE.test(ins.emp_no ?? '') || !(typeof ins.name === 'string' && ins.name.trim())) {
      skipped.push(`insert:${ins.emp_no}`); continue;
    }
    statements.push(c.env.DB.prepare(
      `INSERT OR IGNORE INTO employees
         (emp_no, name, name_kana, division, birth_date, hire_date, first_duty_date,
          entry_type, contract_type, status, enrollment_status, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', '通常', 1)`
    ).bind(
      ins.emp_no, ins.name.trim(),
      normalizeKana(ins.name_kana),
      cleanDiv(ins.division), cleanDate(ins.birth_date),
      cleanDate(ins.hire_date), cleanDate(ins.first_duty_date),
      cleanEntry(ins.entry_type) ?? 'キャリア',
      cleanContract(ins.contract_type),
    ));
  }

  // --- 退職一覧 ---
  for (const r of data.retire ?? []) {
    if (!EMPNO_RE.test(r.emp_no ?? '')) { skipped.push(`retire:${r.emp_no}`); continue; }
    const rd = cleanDate(r.retirement_date);
    const reason = typeof r.retirement_reason === 'string' && r.retirement_reason.trim()
      ? r.retirement_reason.trim() : null;
    if (r.deactivate) {
      statements.push(c.env.DB.prepare(
        `UPDATE employees SET is_active = 0,
           retirement_date = COALESCE(?, NULLIF(retirement_date,''), date('now','localtime')),
           retirement_reason = COALESCE(?, retirement_reason),
           updated_at = datetime('now','localtime')
         WHERE emp_no = ?`
      ).bind(rd, reason, r.emp_no));
    } else {
      // 退職予定：在籍のまま予定日だけ入れる
      statements.push(c.env.DB.prepare(
        `UPDATE employees SET
           retirement_date = COALESCE(?, retirement_date),
           retirement_reason = COALESCE(?, retirement_reason),
           updated_at = datetime('now','localtime')
         WHERE emp_no = ?`
      ).bind(rd, reason, r.emp_no));
    }
  }

  // --- 退職取下 ---
  for (const r of data.reactivate ?? []) {
    if (!EMPNO_RE.test(r.emp_no ?? '')) { skipped.push(`reactivate:${r.emp_no}`); continue; }
    statements.push(c.env.DB.prepare(
      `UPDATE employees SET is_active = 1, retirement_date = NULL,
         updated_at = datetime('now','localtime')
       WHERE emp_no = ?`
    ).bind(r.emp_no));
  }

  // --- 異動で板橋営業所外へ（在籍除外）---
  for (const m of data.deactivateMoved ?? []) {
    if (!EMPNO_RE.test(m.emp_no ?? '')) { skipped.push(`moved:${m.emp_no}`); continue; }
    const md = cleanDate(m.moved_date);
    statements.push(c.env.DB.prepare(
      `UPDATE employees SET is_active = 0,
         retirement_date = COALESCE(?, NULLIF(retirement_date,''), date('now','localtime')),
         retirement_reason = COALESCE(retirement_reason, '他営業所へ異動'),
         updated_at = datetime('now','localtime')
       WHERE emp_no = ?`
    ).bind(md, m.emp_no));
  }

  if (statements.length === 0) return c.json({ error: '反映対象がありません', skipped }, 400);

  const CHUNK = 100;
  const errors: string[] = [];
  for (let i = 0; i < statements.length; i += CHUNK) {
    try {
      await c.env.DB.batch(statements.slice(i, i + CHUNK));
    } catch (e) {
      errors.push(`batch[${i}]: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return c.json({
    ok: errors.length === 0,
    updated: (data.updates ?? []).length,
    inserted: (data.inserts ?? []).length,
    retired: (data.retire ?? []).filter(r => r.deactivate).length,
    retirePlanned: (data.retire ?? []).filter(r => !r.deactivate).length,
    reactivated: (data.reactivate ?? []).length,
    deactivatedMoved: (data.deactivateMoved ?? []).length,
    skipped,
    errors,
  });
});

// 労共契約の更新アラート「対応済み」記録の登録／取消
app.post('/contract-ack', async (c) => {
  let data: {
    emp_id?: number;
    contract_date?: string;
    renewal_type?: string;
    birthday_date?: string | null;
    note?: string | null;
    undo?: boolean;
  };
  try {
    data = await c.req.json();
  } catch {
    return c.json({ error: 'データがありません' }, 400);
  }
  const empId = Number(data.emp_id);
  const cd = typeof data.contract_date === 'string' && DATE_RE.test(data.contract_date) ? data.contract_date : null;
  if (!Number.isInteger(empId) || empId <= 0 || !cd) {
    return c.json({ error: 'emp_id / contract_date が不正です' }, 400);
  }
  if (data.undo) {
    await c.env.DB.prepare('DELETE FROM contract_renewal_acks WHERE emp_id = ? AND contract_date = ?')
      .bind(empId, cd).run();
    return c.json({ ok: true, undone: true });
  }
  const renewalType = data.renewal_type === 'transition65' || data.renewal_type === 'annual'
    ? data.renewal_type : 'annual';
  const bd = typeof data.birthday_date === 'string' && DATE_RE.test(data.birthday_date) ? data.birthday_date : null;
  const note = typeof data.note === 'string' && data.note.trim() ? data.note.trim() : null;
  await c.env.DB.prepare(
    `INSERT INTO contract_renewal_acks (emp_id, renewal_type, contract_date, birthday_date, note)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(emp_id, contract_date) DO UPDATE SET
       renewal_type = excluded.renewal_type,
       birthday_date = COALESCE(excluded.birthday_date, contract_renewal_acks.birthday_date),
       note = COALESCE(excluded.note, contract_renewal_acks.note),
       acked_at = datetime('now','localtime')`
  ).bind(empId, renewalType, cd, bd, note).run();
  return c.json({ ok: true });
});

export default app;
