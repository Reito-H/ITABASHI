// LINE LIFF ページ & LIFF専用API
// /liff/* : LIFFアプリのHTMLページ（認証不要・LIFF SDKで識別）
// /api/liff/* : LIFFから呼ばれるAPI（LIFFアクセストークンをLINE APIで検証）

import { Hono } from 'hono';
import type { Env } from '../auth';
import { logLineActivity } from '../utils/activity_log';

const app = new Hono<{ Bindings: Env }>();

// LIFFアクセストークンをLINEサーバーで検証してユーザーIDを返す
async function verifyLiffToken(accessToken: string): Promise<string | null> {
  if (!accessToken) return null;
  const res = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json<{ userId?: string }>();
  return data.userId ?? null;
}

// リクエストヘッダーからBearerトークンを取り出してUID検証
async function uidFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return verifyLiffToken(token);
}

// LINE push メッセージ送信
async function pushMessage(to: string, accessToken: string, text: string): Promise<void> {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  });
}

// ===== LIFF: 忘れ物対応フォーム =====
app.get('/liff/lost-item', (c) => {
  const liffId = c.env.LIFF_ID_LOST_ITEM ?? '';
  const html = liffLostItemPage(liffId);
  return c.html(html);
});

// ===== LIFF: 事故報告フォーム =====
app.get('/liff/accident', (c) => {
  const liffId = c.env.LIFF_ID_ACCIDENT ?? '';
  const html = liffAccidentPage(liffId);
  return c.html(html);
});

// ===== LIFF: 違反報告フォーム =====
app.get('/liff/violation', (c) => {
  const liffId = c.env.LIFF_ID_VIOLATION ?? '';
  const html = liffViolationPage(liffId);
  return c.html(html);
});

// ===== LIFF: 一般報告フォーム（事故・違反に当てはまらない単純な報告）=====
app.get('/liff/general-report', (c) => {
  const liffId = c.env.LIFF_ID_GENERAL_REPORT ?? '';
  const html = liffGeneralReportPage(liffId);
  return c.html(html);
});

// ===== LIFF: 社員照会 =====
app.get('/liff/staff-lookup', (c) => {
  const liffId = c.env.LIFF_ID_STAFF_LOOKUP ?? '';
  const html = liffStaffLookupPage(liffId);
  return c.html(html);
});

// ===== LIFF: 社員照会＋（課選択→絞り込み検索）=====
app.get('/liff/staff-lookup-plus', (c) => {
  const liffId = c.env.LIFF_ID_STAFF_LOOKUP_PLUS ?? '';
  const html = liffStaffLookupPlusPage(liffId);
  return c.html(html);
});

// ===== LIFF: その他機能（示達事項＋各種便利機能へのアクセス）=====
app.get('/liff/other-features', (c) => {
  const liffId = c.env.LIFF_ID_OTHER_FEATURES ?? '';
  const html = liffOtherFeaturesPage(liffId);
  return c.html(html);
});

// ===== LIFF API: 社員検索 =====
app.get('/api/liff/employees', async (c) => {
  const uid = await uidFromRequest(c.req.raw);
  if (!uid) return c.json({ error: 'unauthorized' }, 401);

  const liffUser = await c.env.DB.prepare(
    'SELECT role FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string }>();
  if (!liffUser || !['general_manager', 'operations_manager'].includes(liffUser.role)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 1) return c.json([]);

  await logLineActivity(c.env.DB, uid, 'liff', 'api', '社員照会', `検索: ${q}`);

  const like = `%${q}%`;
  const rows = await c.env.DB.prepare(`
    SELECT id, emp_no, name, division, team
    FROM employees
    WHERE is_active = 1 AND status = 'completed'
      AND (name LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)
    ORDER BY division, team, seq_no, id
    LIMIT 20
  `).bind(like, like, like).all<{ id: number; emp_no: string; name: string; division: number | null; team: number | null }>();

  return c.json(rows.results ?? []);
});

// ===== LIFF API: 課ごとの在籍人数（社員照会＋の課選択画面用）=====
app.get('/api/liff/staff-lookup/divisions', async (c) => {
  const uid = await uidFromRequest(c.req.raw);
  if (!uid) return c.json({ error: 'unauthorized' }, 401);

  const liffUser = await c.env.DB.prepare(
    'SELECT role FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string }>();
  if (!liffUser || !['general_manager', 'operations_manager'].includes(liffUser.role)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const rows = await c.env.DB.prepare(`
    SELECT division, COUNT(*) AS cnt
    FROM employees
    WHERE is_active = 1 AND division IS NOT NULL
    GROUP BY division
    ORDER BY division
  `).all<{ division: number; cnt: number }>();

  return c.json(rows.results ?? []);
});

// ===== LIFF API: 社員照会検索（課・班での絞り込みに対応）=====
app.get('/api/liff/staff-lookup', async (c) => {
  const uid = await uidFromRequest(c.req.raw);
  if (!uid) return c.json({ error: 'unauthorized' }, 401);

  const liffUser = await c.env.DB.prepare(
    'SELECT role FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string }>();
  if (!liffUser || !['general_manager', 'operations_manager'].includes(liffUser.role)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const q = (c.req.query('q') ?? '').trim();
  const division = parseInt(c.req.query('division') ?? '', 10) || null;
  const team = parseInt(c.req.query('team') ?? '', 10) || null;

  // キーワードなしでも課が指定されていればその課の一覧を返す（社員照会＋の課別一覧表示用）
  if (q.length < 1 && !division) return c.json([]);

  await logLineActivity(c.env.DB, uid, 'liff', 'api', '社員照会',
    `検索: ${[q, division ? `${division}課` : '', team ? `${team}班` : ''].filter(Boolean).join(' ')}`);

  const conditions = ['is_active = 1'];
  const params: (string | number)[] = [];
  if (division) { conditions.push('division = ?'); params.push(division); }
  if (team) { conditions.push('team = ?'); params.push(team); }
  if (q.length >= 1) {
    // 苗字は先頭にくるため前方一致にする（例:「タカ」で検索した時に「フルサワ タカユキ」のような
    // 名前側の途中一致を拾って絞り込みにくくなるのを防ぐ）
    conditions.push('(name LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)');
    const like = `${q}%`;
    params.push(like, like, like);
  }
  const limit = division && q.length < 1 ? 100 : 30;

  const rows = await c.env.DB.prepare(`
    SELECT id, emp_no, name, name_kana, division, team,
           work_schedule, start_time, car_no, enrollment_status,
           retirement_date, is_hanchyo, phone, hire_date
    FROM employees
    WHERE ${conditions.join(' AND ')}
    ORDER BY division, team, seq_no, id
    LIMIT ${limit}
  `).bind(...params).all<{
    id: number;
    emp_no: string;
    name: string;
    name_kana: string | null;
    division: number | null;
    team: number | null;
    work_schedule: string | null;
    start_time: string | null;
    car_no: string | null;
    enrollment_status: string | null;
    retirement_date: string | null;
    is_hanchyo: number;
    phone: string | null;
    hire_date: string | null;
  }>();

  return c.json(rows.results ?? []);
});

// ===== LIFF API: 社員情報編集 =====
app.post('/api/liff/staff-edit', async (c) => {
  const uid = await uidFromRequest(c.req.raw);
  if (!uid) return c.json({ error: 'unauthorized' }, 401);

  const liffUser = await c.env.DB.prepare(
    'SELECT role FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string }>();
  if (!liffUser || !['general_manager', 'operations_manager'].includes(liffUser.role)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{
    id: number;
    name: string;
    name_kana?: string | null;
    division?: number | null;
    team?: number | null;
    work_schedule?: string | null;
    start_time?: string | null;
    car_no?: string | null;
    phone?: string | null;
    hire_date?: string | null;
    is_hanchyo?: number;
  }>();

  if (!body.id || !body.name) return c.json({ error: 'id と name は必須です' }, 400);

  await c.env.DB.prepare(`
    UPDATE employees SET
      name=?, name_kana=?, division=?, team=?,
      work_schedule=?, start_time=?, car_no=?, phone=?, hire_date=?, is_hanchyo=?
    WHERE id=?
  `).bind(
    body.name,
    body.name_kana ?? null,
    body.division ?? null,
    body.team ?? null,
    body.work_schedule ?? null,
    body.start_time ?? null,
    body.car_no ?? null,
    body.phone ?? null,
    body.hire_date ?? null,
    body.is_hanchyo ?? 0,
    body.id,
  ).run();

  await logLineActivity(c.env.DB, uid, 'liff', 'api', '社員情報編集', body.name);

  return c.json({ ok: true, updated: {
    name: body.name,
    name_kana: body.name_kana ?? null,
    division: body.division ?? null,
    team: body.team ?? null,
    work_schedule: body.work_schedule ?? null,
    start_time: body.start_time ?? null,
    car_no: body.car_no ?? null,
    phone: body.phone ?? null,
    hire_date: body.hire_date ?? null,
    is_hanchyo: body.is_hanchyo ?? 0,
  }});
});

// ===== LIFF API: 退職処理 =====
app.post('/api/liff/staff-retire', async (c) => {
  const uid = await uidFromRequest(c.req.raw);
  if (!uid) return c.json({ error: 'unauthorized' }, 401);

  const liffUser = await c.env.DB.prepare(
    'SELECT role FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string }>();
  if (!liffUser || !['general_manager', 'operations_manager'].includes(liffUser.role)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{ id: number; retirement_date: string }>();
  if (!body.id || !body.retirement_date) {
    return c.json({ error: 'id と retirement_date は必須です' }, 400);
  }

  const result = await c.env.DB.prepare(`
    UPDATE employees SET is_active = 0, retirement_date = ? WHERE id = ? AND is_active = 1
  `).bind(body.retirement_date, body.id).run();

  if ((result.meta.changes ?? 0) === 0) {
    return c.json({ error: '対象社員が見つからないか、すでに退職処理済みです' }, 404);
  }
  await logLineActivity(c.env.DB, uid, 'liff', 'api', '退職処理', `社員ID: ${body.id} (${body.retirement_date})`);
  return c.json({ ok: true });
});

// ===== LIFF API: 社員新規追加 =====
app.post('/api/liff/staff-add', async (c) => {
  const uid = await uidFromRequest(c.req.raw);
  if (!uid) return c.json({ error: 'unauthorized' }, 401);

  const liffUser = await c.env.DB.prepare(
    'SELECT role FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string }>();
  if (!liffUser || !['general_manager', 'operations_manager'].includes(liffUser.role)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{
    name: string;
    name_kana?: string | null;
    emp_no: string;
    division: number;
    team: number;
    work_schedule?: string | null;
    start_time?: string | null;
    car_no?: string | null;
    phone?: string | null;
    hire_date?: string | null;
  }>();

  if (!body.name || !body.emp_no || !body.division || !body.team) {
    return c.json({ error: '氏名・社員番号・課・班は必須です' }, 400);
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM employees WHERE emp_no = ?'
  ).bind(body.emp_no).first();
  if (existing) return c.json({ error: 'この社員番号はすでに登録されています' }, 409);

  await c.env.DB.prepare(`
    INSERT INTO employees
      (name, name_kana, emp_no, division, team, work_schedule, start_time,
       car_no, phone, hire_date, is_active, status, enrollment_status)
    VALUES (?,?,?,?,?,?,?,?,?,?,1,'completed','在籍')
  `).bind(
    body.name,
    body.name_kana ?? null,
    body.emp_no,
    body.division,
    body.team,
    body.work_schedule ?? null,
    body.start_time ?? null,
    body.car_no ?? null,
    body.phone ?? null,
    body.hire_date ?? null,
  ).run();

  await logLineActivity(c.env.DB, uid, 'liff', 'api', '社員追加', `${body.name} (${body.emp_no})`);

  return c.json({ ok: true });
});

// ===== LIFF API: 会社の主要連絡先一覧（その他機能の電話番号一覧）=====
app.get('/api/liff/offices', async (c) => {
  const uid = await uidFromRequest(c.req.raw);
  if (!uid) return c.json({ error: 'unauthorized' }, 401);

  const liffUser = await c.env.DB.prepare(
    'SELECT role FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string }>();
  if (!liffUser) return c.json({ error: 'forbidden' }, 403);

  await logLineActivity(c.env.DB, uid, 'liff', 'api', 'その他機能', '連絡先一覧表示');

  const rows = await c.env.DB.prepare(`
    SELECT short_name, phone
    FROM offices
    WHERE phone IS NOT NULL AND phone != ''
    ORDER BY sort_order, id
  `).all<{ short_name: string; phone: string }>();

  return c.json(rows.results ?? []);
});

// ===== LIFF API: 忘れ物報告 送信 =====
app.post('/api/liff/lost-item', async (c) => {
  const uid = await uidFromRequest(c.req.raw);
  if (!uid) return c.json({ error: 'unauthorized' }, 401);

  const liffUser = await c.env.DB.prepare(
    'SELECT role FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string }>();
  if (!liffUser || !['general_manager', 'operations_manager'].includes(liffUser.role)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{
    report_type: string;
    received_at?: string;
    vehicle_no?: string;
    employee_name?: string;
    employee_emp_no?: string;
    employee_division?: number | null;
    employee_team?: number | null;
    item_description?: string;
    pickup_location?: string;
    dropoff_location?: string;
    customer_name?: string;
    customer_phone?: string;
    return_method?: string;
    notes?: string;
  }>();

  const reportType = body.report_type === 'customer' ? 'customer' : 'staff';

  await c.env.DB.prepare(`
    INSERT INTO lost_item_reports
      (report_type, received_at, vehicle_no, employee_name, employee_emp_no,
       employee_division, employee_team, item_description, pickup_location, dropoff_location,
       customer_name, customer_phone, return_method, notes, reported_by_uid)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    reportType,
    body.received_at ?? null,
    body.vehicle_no ?? null,
    body.employee_name ?? null,
    body.employee_emp_no ?? null,
    body.employee_division ?? null,
    body.employee_team ?? null,
    body.item_description ?? null,
    body.pickup_location ?? null,
    body.dropoff_location ?? null,
    body.customer_name ?? null,
    body.customer_phone ?? null,
    body.return_method ?? null,
    body.notes ?? null,
    uid,
  ).run();

  await logLineActivity(c.env.DB, uid, 'liff', 'api', '忘れ物報告送信',
    `${body.vehicle_no ?? ''} ${(body.item_description ?? '').slice(0, 50)}`.trim());

  // 報告まとめテキストを生成してLINEに送信
  const summary = buildLostItemSummary(body);
  const at = c.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
  if (at) await pushMessage(uid, at, summary);

  return c.json({ ok: true, summary });
});

// ===== LIFF API: 事故報告 送信 =====
app.post('/api/liff/accident', async (c) => {
  const uid = await uidFromRequest(c.req.raw);
  if (!uid) return c.json({ error: 'unauthorized' }, 401);

  const liffUser = await c.env.DB.prepare(
    'SELECT role FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string }>();
  if (!liffUser || !['general_manager', 'operations_manager'].includes(liffUser.role)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{
    received_at?: string;
    vehicle_no?: string;
    employee_name?: string;
    employee_emp_no?: string;
    employee_division?: number | null;
    employee_team?: number | null;
    accident_type?: string;
    location?: string;
    car_status?: string;
    substitute_requested?: boolean;
    police_notified?: boolean;
    passenger_delivered?: boolean;
    additional_info?: string;
  }>();

  const summary = buildAccidentSummary(body);

  await c.env.DB.prepare(`
    INSERT INTO accident_reports
      (received_at, vehicle_no, employee_name, employee_emp_no,
       employee_division, employee_team, accident_type, location, car_status,
       substitute_requested, police_notified, passenger_delivered,
       additional_info, summary_text, reported_by_uid)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    body.received_at ?? null,
    body.vehicle_no ?? null,
    body.employee_name ?? null,
    body.employee_emp_no ?? null,
    body.employee_division ?? null,
    body.employee_team ?? null,
    body.accident_type ?? null,
    body.location ?? null,
    body.car_status ?? null,
    body.substitute_requested ? 1 : 0,
    body.police_notified ? 1 : 0,
    body.passenger_delivered ? 1 : 0,
    body.additional_info ?? null,
    summary,
    uid,
  ).run();

  await logLineActivity(c.env.DB, uid, 'liff', 'api', '事故報告送信',
    `${body.vehicle_no ?? ''} ${body.accident_type ?? ''}`.trim());

  const at = c.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
  if (at) await pushMessage(uid, at, summary);

  return c.json({ ok: true, summary });
});

// ===== LIFF API: 違反種類マスタ（点数・反則金付き）=====
app.get('/api/liff/violation-types', async (c) => {
  const uid = await uidFromRequest(c.req.raw);
  if (!uid) return c.json({ error: 'unauthorized' }, 401);

  const liffUser = await c.env.DB.prepare(
    'SELECT role FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string }>();
  if (!liffUser || !['general_manager', 'operations_manager'].includes(liffUser.role)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const rows = await c.env.DB.prepare(`
    SELECT id, name, points, fine_amount
    FROM violation_types
    WHERE is_active = 1
    ORDER BY sort_order, id
  `).all<{ id: number; name: string; points: number; fine_amount: number }>();

  return c.json(rows.results ?? []);
});

// ===== LIFF API: 違反報告 送信 =====
app.post('/api/liff/violation', async (c) => {
  const uid = await uidFromRequest(c.req.raw);
  if (!uid) return c.json({ error: 'unauthorized' }, 401);

  const liffUser = await c.env.DB.prepare(
    'SELECT role FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string }>();
  if (!liffUser || !['general_manager', 'operations_manager'].includes(liffUser.role)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{
    received_at?: string;
    vehicle_no?: string;
    violation_at?: string;
    employee_name?: string;
    employee_emp_no?: string;
    employee_division?: number | null;
    employee_team?: number | null;
    violation_type_id?: number | null;
    notes?: string;
  }>();

  // クライアント値は信用せず、選択されたIDからサーバー側で点数・反則金を引き直してスナップショットする
  let violationTypeName: string | null = null;
  let violationPoints: number | null = null;
  let violationFineAmount: number | null = null;
  if (body.violation_type_id) {
    const vt = await c.env.DB.prepare(
      'SELECT name, points, fine_amount FROM violation_types WHERE id = ?'
    ).bind(body.violation_type_id).first<{ name: string; points: number; fine_amount: number }>();
    if (vt) {
      violationTypeName = vt.name;
      violationPoints = vt.points;
      violationFineAmount = vt.fine_amount;
    }
  }

  await c.env.DB.prepare(`
    INSERT INTO violation_reports
      (received_at, vehicle_no, violation_at, employee_name, employee_emp_no,
       employee_division, employee_team, violation_type_id, violation_type_name,
       violation_points, violation_fine_amount, notes, reported_by_uid)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    body.received_at ?? null,
    body.vehicle_no ?? null,
    body.violation_at ?? null,
    body.employee_name ?? null,
    body.employee_emp_no ?? null,
    body.employee_division ?? null,
    body.employee_team ?? null,
    body.violation_type_id ?? null,
    violationTypeName,
    violationPoints,
    violationFineAmount,
    body.notes ?? null,
    uid,
  ).run();

  await logLineActivity(c.env.DB, uid, 'liff', 'api', '違反報告送信',
    `${body.vehicle_no ?? ''} ${violationTypeName ?? ''}`.trim());

  const summary = buildViolationSummary({
    ...body,
    violation_type_name: violationTypeName,
    violation_points: violationPoints,
    violation_fine_amount: violationFineAmount,
  });
  const at = c.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
  if (at) await pushMessage(uid, at, summary);

  return c.json({ ok: true, summary });
});

// ===== LIFF API: 一般報告 送信 =====
app.post('/api/liff/general-report', async (c) => {
  const uid = await uidFromRequest(c.req.raw);
  if (!uid) return c.json({ error: 'unauthorized' }, 401);

  const liffUser = await c.env.DB.prepare(
    'SELECT role FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string }>();
  if (!liffUser || !['general_manager', 'operations_manager'].includes(liffUser.role)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{
    received_at?: string;
    vehicle_no?: string;
    employee_name?: string;
    employee_emp_no?: string;
    employee_division?: number | null;
    employee_team?: number | null;
    content?: string;
  }>();

  await c.env.DB.prepare(`
    INSERT INTO general_reports
      (received_at, vehicle_no, employee_name, employee_emp_no,
       employee_division, employee_team, content, reported_by_uid)
    VALUES (?,?,?,?,?,?,?,?)
  `).bind(
    body.received_at ?? null,
    body.vehicle_no ?? null,
    body.employee_name ?? null,
    body.employee_emp_no ?? null,
    body.employee_division ?? null,
    body.employee_team ?? null,
    body.content ?? null,
    uid,
  ).run();

  await logLineActivity(c.env.DB, uid, 'liff', 'api', '一般報告送信',
    `${body.vehicle_no ?? ''} ${(body.content ?? '').slice(0, 30)}`.trim());

  const summary = buildGeneralReportSummary(body);
  const at = c.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
  if (at) await pushMessage(uid, at, summary);

  return c.json({ ok: true, summary });
});

// ===================================================
// テキスト生成ユーティリティ
// ===================================================

function buildLostItemSummary(body: Record<string, unknown>): string {
  const lines: string[] = [];
  if (body.report_type === 'customer') {
    lines.push('【客からの忘れ物問い合わせ】');
  } else {
    lines.push('【忘れ物報告】');
  }
  if (body.received_at)       lines.push(`受電: ${body.received_at}`);
  if (body.vehicle_no)        lines.push(`車番: ${body.vehicle_no}`);
  if (body.employee_name) {
    const div = body.employee_division ? `${body.employee_division}課` : '';
    const team = body.employee_team ? `${body.employee_team}班` : '';
    lines.push(`乗務員: ${div}${team} ${body.employee_name}${body.employee_emp_no ? `（${body.employee_emp_no}）` : ''}`);
  }
  if (body.item_description)  lines.push(`忘れ物: ${body.item_description}`);
  if (body.pickup_location)   lines.push(`乗車地: ${body.pickup_location}`);
  if (body.dropoff_location)  lines.push(`降車地: ${body.dropoff_location}`);
  if (body.customer_name)     lines.push(`客名: ${body.customer_name}`);
  if (body.customer_phone)    lines.push(`電話: ${body.customer_phone}`);
  if (body.return_method)     lines.push(`返却方法: ${body.return_method}`);
  if (body.notes)             lines.push(`備考: ${body.notes}`);
  return lines.join('\n');
}

function buildAccidentSummary(body: Record<string, unknown>): string {
  const lines: string[] = ['【事故報告】'];
  if (body.received_at) lines.push(`受電: ${body.received_at}`);
  if (body.vehicle_no)  lines.push(`車番: ${body.vehicle_no}`);
  if (body.employee_name) {
    const div = body.employee_division ? `${body.employee_division}課` : '';
    const team = body.employee_team ? `${body.employee_team}班` : '';
    lines.push(`乗務員: ${div}${team} ${body.employee_name}${body.employee_emp_no ? `（${body.employee_emp_no}）` : ''}`);
  }
  if (body.accident_type) lines.push(`事故形態: ${body.accident_type}`);
  if (body.car_status)    lines.push(`状態: ${body.car_status}`);
  if (body.location)      lines.push(`場所: ${body.location}`);
  if (body.car_status === '実車' || body.car_status === '迎車') {
    lines.push(`代車要請: ${body.substitute_requested ? '済み' : '未'}`);
    if (body.car_status === '実車') {
      lines.push(`乗客送り届け: ${body.passenger_delivered ? '済み' : '未'}`);
    }
  }
  lines.push(`警察対応: ${body.police_notified ? '指示済み' : '未指示'}`);
  if (body.additional_info) lines.push(`\n${body.additional_info}`);
  return lines.join('\n');
}

function buildViolationSummary(body: Record<string, unknown>): string {
  const lines: string[] = ['【違反報告】'];
  if (body.received_at)    lines.push(`受電: ${body.received_at}`);
  if (body.vehicle_no)     lines.push(`車番: ${body.vehicle_no}`);
  if (body.violation_at)   lines.push(`違反発生日時: ${body.violation_at}`);
  if (body.employee_name) {
    const div = body.employee_division ? `${body.employee_division}課` : '';
    const team = body.employee_team ? `${body.employee_team}班` : '';
    lines.push(`乗務員: ${div}${team} ${body.employee_name}${body.employee_emp_no ? `（${body.employee_emp_no}）` : ''}`);
  }
  if (body.violation_type_name) {
    const pts = typeof body.violation_points === 'number' ? `${body.violation_points}点` : '';
    const fine = typeof body.violation_fine_amount === 'number' ? `反則金${body.violation_fine_amount.toLocaleString()}円` : '';
    lines.push(`違反種類: ${body.violation_type_name}（${[pts, fine].filter(Boolean).join(' / ')}）`);
  }
  if (body.notes) lines.push(`備考: ${body.notes}`);
  return lines.join('\n');
}

function buildGeneralReportSummary(body: Record<string, unknown>): string {
  const lines: string[] = ['【報告】'];
  if (body.received_at) lines.push(`受電: ${body.received_at}`);
  if (body.vehicle_no)  lines.push(`車番: ${body.vehicle_no}`);
  if (body.employee_name) {
    const div = body.employee_division ? `${body.employee_division}課` : '';
    const team = body.employee_team ? `${body.employee_team}班` : '';
    lines.push(`乗務員: ${div}${team} ${body.employee_name}${body.employee_emp_no ? `（${body.employee_emp_no}）` : ''}`);
  }
  if (body.content) lines.push(`\n${body.content}`);
  return lines.join('\n');
}

// ===================================================
// LIFF ページ HTML
// ===================================================

function liffLostItemPage(liffId: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>忘れ物対応</title>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { margin: 0; padding: 0; background: #f0f4f8; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; font-size: 15px; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: #6b7280; font-size: 14px; }
    .page { max-width: 520px; margin: 0 auto; padding: 16px 16px 40px; }
    .header { background: #1e3a5f; color: white; padding: 14px 16px; border-radius: 12px; margin-bottom: 16px; }
    .header h1 { margin: 0; font-size: 17px; font-weight: 700; }
    .header p { margin: 4px 0 0; font-size: 12px; opacity: 0.8; }
    .card { background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card-title { font-size: 13px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .field { margin-bottom: 12px; }
    .field:last-child { margin-bottom: 0; }
    label { display: block; font-size: 13px; color: #374151; margin-bottom: 5px; font-weight: 500; }
    input[type=text], input[type=tel], input[type=time], textarea, select {
      width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px;
      font-size: 15px; font-family: inherit; background: #f9fafb; color: #111827;
      -webkit-appearance: none; appearance: none; outline: none;
      transition: border-color 0.15s, background 0.15s;
    }
    input:focus, textarea:focus, select:focus { border-color: #2563eb; background: white; }
    textarea { resize: vertical; min-height: 72px; }
    .type-toggle { display: flex; background: #f3f4f6; border-radius: 10px; padding: 3px; margin-bottom: 16px; }
    .type-btn { flex: 1; text-align: center; padding: 9px 8px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; background: transparent; color: #6b7280; transition: all 0.15s; }
    .type-btn.active { background: white; color: #1e3a5f; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
    .emp-wrap { position: relative; }
    .emp-suggestions { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #d1d5db; border-radius: 8px; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.12); max-height: 200px; overflow-y: auto; margin-top: 2px; display: none; }
    .emp-item { padding: 10px 12px; font-size: 14px; cursor: pointer; border-bottom: 1px solid #f3f4f6; }
    .emp-item:last-child { border-bottom: none; }
    .emp-item:hover { background: #eff6ff; }
    .emp-meta { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .emp-selected { font-size: 13px; color: #059669; margin-top: 4px; font-weight: 600; }
    .customer-fields { display: none; }
    .customer-fields.visible { display: block; }
    .btn-submit { width: 100%; background: #1e3a5f; color: white; border: none; border-radius: 12px; padding: 15px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 8px; transition: background 0.15s; }
    .btn-submit:active { background: #152d4a; }
    .btn-submit:disabled { background: #9ca3af; cursor: default; }
    .success { text-align: center; padding: 32px 16px; }
    .success-icon { font-size: 48px; margin-bottom: 16px; }
    .success-title { font-size: 20px; font-weight: 700; color: #1e3a5f; margin-bottom: 8px; }
    .success-summary { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: left; font-size: 13px; color: #374151; white-space: pre-line; margin: 16px 0; line-height: 1.7; }
    .btn-close { background: #f3f4f6; color: #374151; border: none; border-radius: 10px; padding: 12px 24px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px; }
    .return-radio { display: flex; gap: 12px; }
    .return-radio label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 400; }
    .return-radio input[type=radio] { width: auto; }
  </style>
</head>
<body>
  <div id="loading">読み込み中...</div>
  <div id="app" style="display:none;">
    <div class="page" id="form-page">
      <div class="header">
        <h1>忘れ物対応</h1>
        <p>必須項目はありません。わかる範囲で入力してください</p>
      </div>

      <!-- 種別切替 -->
      <div class="type-toggle">
        <button class="type-btn active" id="btn-staff" onclick="setType('staff')">社員からの報告</button>
        <button class="type-btn" id="btn-customer" onclick="setType('customer')">客からの問い合わせ</button>
      </div>

      <!-- 基本情報 -->
      <div class="card">
        <div class="card-title">基本情報</div>
        <div class="field">
          <label>受電時刻</label>
          <input type="time" id="received_at">
        </div>
        <div class="field">
          <label>車番</label>
          <input type="text" id="vehicle_no" placeholder="例: 5232" inputmode="numeric">
        </div>
      </div>

      <!-- 乗務員情報 -->
      <div class="card">
        <div class="card-title">乗務員</div>
        <div class="field">
          <div class="emp-wrap">
            <input type="text" id="emp-search" placeholder="氏名・社員番号で検索" autocomplete="off"
              oninput="empSearchDebounce()">
            <div class="emp-suggestions" id="emp-suggestions"></div>
          </div>
          <div class="emp-selected" id="emp-selected" style="display:none;"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;" id="emp-detail-row">
          <div class="field" style="margin-bottom:0;">
            <label>課</label>
            <input type="text" id="employee_division" placeholder="3" readonly style="background:#f3f4f6;color:#6b7280;">
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>班</label>
            <input type="text" id="employee_team" placeholder="6" readonly style="background:#f3f4f6;color:#6b7280;">
          </div>
        </div>
      </div>

      <!-- 忘れ物情報 -->
      <div class="card">
        <div class="card-title">忘れ物情報</div>
        <div class="field">
          <label>忘れ物の内容</label>
          <textarea id="item_description" placeholder="例: 黒い財布、iPhone"></textarea>
        </div>
        <div class="field">
          <label>乗車地</label>
          <input type="text" id="pickup_location" placeholder="例: 板橋駅">
        </div>
        <div class="field">
          <label>降車地</label>
          <input type="text" id="dropoff_location" placeholder="例: 池袋駅">
        </div>
      </div>

      <!-- 客情報（客問い合わせ時のみ） -->
      <div class="card customer-fields" id="customer-section">
        <div class="card-title">お客様情報</div>
        <div class="field">
          <label>お客様氏名</label>
          <input type="text" id="customer_name" placeholder="田中 一郎">
        </div>
        <div class="field">
          <label>お客様電話番号</label>
          <input type="tel" id="customer_phone" placeholder="090-0000-0000" inputmode="tel">
        </div>
        <div class="field">
          <label>返却方法</label>
          <div class="return-radio">
            <label><input type="radio" name="return_method" value="着払い"> 着払い</label>
            <label><input type="radio" name="return_method" value="来社受け取り"> 来社受け取り</label>
          </div>
        </div>
      </div>

      <!-- 備考 -->
      <div class="card">
        <div class="card-title">備考</div>
        <div class="field">
          <textarea id="notes" placeholder="その他、特記事項があれば"></textarea>
        </div>
      </div>

      <button class="btn-submit" id="btn-submit" onclick="submitForm()">送信する</button>
    </div>

    <!-- 送信完了画面 -->
    <div class="page success" id="success-page" style="display:none;">
      <div class="success-icon">✅</div>
      <div class="success-title">送信しました</div>
      <p style="color:#6b7280;font-size:14px;">LINEにも同じ内容を送信しました。<br>コピーして転送にご利用ください。</p>
      <div class="success-summary" id="summary-text"></div>
      <button class="btn-close" onclick="if(liff.isInClient())liff.closeWindow();">閉じる</button>
    </div>
  </div>

  <script>
  var LIFF_ACCESS_TOKEN = '';
  var selectedEmp = null;
  var currentType = 'staff';
  var empSearchTimer = null;

  liff.init({ liffId: ${JSON.stringify(liffId || 'LIFF_ID_NOT_SET')} })
    .then(function() {
      LIFF_ACCESS_TOKEN = liff.getAccessToken() || '';
      document.getElementById('loading').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      // 現在時刻をデフォルト設定
      var now = new Date();
      var hh = String(now.getHours()).padStart(2, '0');
      var mm = String(now.getMinutes()).padStart(2, '0');
      document.getElementById('received_at').value = hh + ':' + mm;
    })
    .catch(function(err) {
      document.getElementById('loading').textContent = 'エラー: ' + err.message;
    });

  function setType(type) {
    currentType = type;
    document.getElementById('btn-staff').className = 'type-btn' + (type === 'staff' ? ' active' : '');
    document.getElementById('btn-customer').className = 'type-btn' + (type === 'customer' ? ' active' : '');
    var cs = document.getElementById('customer-section');
    cs.className = 'card customer-fields' + (type === 'customer' ? ' visible' : '');
  }

  function empSearchDebounce() {
    clearTimeout(empSearchTimer);
    empSearchTimer = setTimeout(doEmpSearch, 300);
  }

  function doEmpSearch() {
    var q = document.getElementById('emp-search').value.trim();
    var sug = document.getElementById('emp-suggestions');
    if (q.length < 1) { sug.style.display = 'none'; return; }
    fetch('/api/liff/employees?q=' + encodeURIComponent(q), {
      headers: { 'Authorization': 'Bearer ' + LIFF_ACCESS_TOKEN }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || data.length === 0) { sug.style.display = 'none'; return; }
      sug.innerHTML = data.map(function(e) {
        var div = e.division ? e.division + '課' : '';
        var team = e.team ? e.team + '班' : '';
        return '<div class="emp-item" onclick="selectEmp(' + JSON.stringify(e).replace(/</g,'\\u003c').replace(/"/g,'&quot;') + ')">'
          + '<div>' + e.name + '</div>'
          + '<div class="emp-meta">' + div + team + ' / ' + e.emp_no + '</div>'
          + '</div>';
      }).join('');
      sug.style.display = 'block';
    })
    .catch(function() { sug.style.display = 'none'; });
  }

  function selectEmp(e) {
    selectedEmp = e;
    document.getElementById('emp-search').value = '';
    document.getElementById('emp-suggestions').style.display = 'none';
    var div = e.division ? e.division + '課' : '';
    var team = e.team ? e.team + '班' : '';
    document.getElementById('emp-selected').style.display = 'block';
    document.getElementById('emp-selected').textContent = '✓ ' + e.name + '（' + div + team + ' / ' + e.emp_no + '）';
    document.getElementById('employee_division').value = e.division || '';
    document.getElementById('employee_team').value = e.team || '';
  }

  document.addEventListener('click', function(e) {
    var sug = document.getElementById('emp-suggestions');
    if (!document.getElementById('emp-search').contains(e.target) && !sug.contains(e.target)) {
      sug.style.display = 'none';
    }
  });

  function submitForm() {
    var btn = document.getElementById('btn-submit');
    btn.disabled = true;
    btn.textContent = '送信中...';

    var returnMethod = '';
    var radios = document.querySelectorAll('input[name=return_method]');
    for (var i = 0; i < radios.length; i++) {
      if (radios[i].checked) { returnMethod = radios[i].value; break; }
    }

    var payload = {
      report_type: currentType,
      received_at: document.getElementById('received_at').value || null,
      vehicle_no: document.getElementById('vehicle_no').value.trim() || null,
      employee_name: selectedEmp ? selectedEmp.name : null,
      employee_emp_no: selectedEmp ? selectedEmp.emp_no : null,
      employee_division: selectedEmp ? selectedEmp.division : null,
      employee_team: selectedEmp ? selectedEmp.team : null,
      item_description: document.getElementById('item_description').value.trim() || null,
      pickup_location: document.getElementById('pickup_location').value.trim() || null,
      dropoff_location: document.getElementById('dropoff_location').value.trim() || null,
      customer_name: document.getElementById('customer_name').value.trim() || null,
      customer_phone: document.getElementById('customer_phone').value.trim() || null,
      return_method: returnMethod || null,
      notes: document.getElementById('notes').value.trim() || null,
    };

    fetch('/api/liff/lost-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LIFF_ACCESS_TOKEN },
      body: JSON.stringify(payload),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        document.getElementById('form-page').style.display = 'none';
        document.getElementById('success-page').style.display = 'block';
        document.getElementById('summary-text').textContent = data.summary;
      } else {
        btn.disabled = false;
        btn.textContent = '送信する';
        alert('送信に失敗しました: ' + (data.error || '不明なエラー'));
      }
    })
    .catch(function(err) {
      btn.disabled = false;
      btn.textContent = '送信する';
      alert('通信エラーが発生しました');
    });
  }
  </script>
</body>
</html>`;
}

function liffAccidentPage(liffId: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>事故報告</title>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { margin: 0; padding: 0; background: #f0f4f8; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; font-size: 15px; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: #6b7280; font-size: 14px; }
    .page { max-width: 520px; margin: 0 auto; padding: 16px 16px 40px; }
    .header { background: #7f1d1d; color: white; padding: 14px 16px; border-radius: 12px; margin-bottom: 16px; }
    .header h1 { margin: 0; font-size: 17px; font-weight: 700; }
    .header p { margin: 4px 0 0; font-size: 12px; opacity: 0.8; }
    .card { background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card-title { font-size: 13px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .field { margin-bottom: 12px; }
    .field:last-child { margin-bottom: 0; }
    label { display: block; font-size: 13px; color: #374151; margin-bottom: 5px; font-weight: 500; }
    input[type=text], input[type=time], textarea, select {
      width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px;
      font-size: 15px; font-family: inherit; background: #f9fafb; color: #111827;
      -webkit-appearance: none; appearance: none; outline: none;
    }
    input:focus, textarea:focus, select:focus { border-color: #dc2626; background: white; }
    textarea { resize: vertical; min-height: 72px; }
    .emp-wrap { position: relative; }
    .emp-suggestions { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #d1d5db; border-radius: 8px; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.12); max-height: 200px; overflow-y: auto; margin-top: 2px; display: none; }
    .emp-item { padding: 10px 12px; font-size: 14px; cursor: pointer; border-bottom: 1px solid #f3f4f6; }
    .emp-item:last-child { border-bottom: none; }
    .emp-item:hover { background: #fef2f2; }
    .emp-meta { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .emp-selected { font-size: 13px; color: #059669; margin-top: 4px; font-weight: 600; }
    .toggle-group { display: flex; gap: 10px; flex-wrap: wrap; }
    .toggle-btn { padding: 8px 16px; border: 2px solid #d1d5db; border-radius: 8px; background: white; color: #374151; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
    .toggle-btn.active { border-color: #dc2626; background: #fef2f2; color: #dc2626; }
    .check-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
    .check-row:last-child { border-bottom: none; }
    .check-row label { margin: 0; flex: 1; font-weight: 400; cursor: pointer; }
    .check-row input[type=checkbox] { width: 20px; height: 20px; accent-color: #dc2626; flex-shrink: 0; }
    .car-status-dep { display: none; }
    .car-status-dep.visible { display: block; }
    .btn-submit { width: 100%; background: #991b1b; color: white; border: none; border-radius: 12px; padding: 15px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 8px; }
    .btn-submit:disabled { background: #9ca3af; }
    .success { text-align: center; padding: 32px 16px; }
    .success-icon { font-size: 48px; margin-bottom: 16px; }
    .success-title { font-size: 20px; font-weight: 700; color: #7f1d1d; margin-bottom: 8px; }
    .success-summary { background: #fff7f7; border: 1px solid #fecaca; border-radius: 8px; padding: 14px; text-align: left; font-size: 13px; color: #374151; white-space: pre-line; margin: 16px 0; line-height: 1.7; }
    .btn-close { background: #f3f4f6; color: #374151; border: none; border-radius: 10px; padding: 12px 24px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .forward-note { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 12px; font-size: 13px; color: #92400e; margin-top: 12px; }
  </style>
</head>
<body>
  <div id="loading">読み込み中...</div>
  <div id="app" style="display:none;">
    <div class="page" id="form-page">
      <div class="header">
        <h1>事故報告</h1>
        <p>必須項目はありません。確認できた範囲で入力してください</p>
      </div>

      <!-- 基本情報 -->
      <div class="card">
        <div class="card-title">受電情報</div>
        <div class="field">
          <label>受電時刻</label>
          <input type="time" id="received_at">
        </div>
        <div class="field">
          <label>車番</label>
          <input type="text" id="vehicle_no" placeholder="例: 5232" inputmode="numeric">
        </div>
      </div>

      <!-- 乗務員 -->
      <div class="card">
        <div class="card-title">乗務員</div>
        <div class="field">
          <div class="emp-wrap">
            <input type="text" id="emp-search" placeholder="氏名・社員番号で検索" autocomplete="off"
              oninput="empSearchDebounce()">
            <div class="emp-suggestions" id="emp-suggestions"></div>
          </div>
          <div class="emp-selected" id="emp-selected" style="display:none;"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="field" style="margin-bottom:0;">
            <label>課</label>
            <input type="text" id="employee_division" readonly style="background:#f3f4f6;color:#6b7280;">
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>班</label>
            <input type="text" id="employee_team" readonly style="background:#f3f4f6;color:#6b7280;">
          </div>
        </div>
      </div>

      <!-- 事故状況 -->
      <div class="card">
        <div class="card-title">事故状況</div>
        <div class="field">
          <label>乗車状態</label>
          <div class="toggle-group">
            <button class="toggle-btn" id="cs-kusha" onclick="setCarStatus('空車')">空車</button>
            <button class="toggle-btn" id="cs-jissha" onclick="setCarStatus('実車')">実車</button>
            <button class="toggle-btn" id="cs-geisha" onclick="setCarStatus('迎車')">迎車</button>
          </div>
        </div>
        <div class="field">
          <label>事故形態</label>
          <input type="text" id="accident_type" placeholder="例: 単独接触事故、追突事故">
        </div>
        <div class="field">
          <label>事故発生場所</label>
          <input type="text" id="location" placeholder="例: 足立区栗原3丁目の住宅街">
        </div>
      </div>

      <!-- 乗客・代車（実車・迎車時） -->
      <div class="card car-status-dep" id="dep-section">
        <div class="card-title">乗客・代車対応</div>
        <div id="passenger-check" class="check-row" style="display:none;">
          <input type="checkbox" id="passenger_delivered">
          <label for="passenger_delivered">乗客を目的地まで送り届けた</label>
        </div>
        <div class="check-row">
          <input type="checkbox" id="substitute_requested">
          <label for="substitute_requested">代車要請は済んでいる</label>
        </div>
      </div>

      <!-- 対応状況 -->
      <div class="card">
        <div class="card-title">対応状況</div>
        <div class="check-row">
          <input type="checkbox" id="police_notified">
          <label for="police_notified">警察対応するよう指示した</label>
        </div>
      </div>

      <!-- 追加情報 -->
      <div class="card">
        <div class="card-title">追加情報・メモ</div>
        <div class="field">
          <textarea id="additional_info" placeholder="経緯・詳細など"></textarea>
        </div>
      </div>

      <button class="btn-submit" id="btn-submit" onclick="submitForm()">報告書を作成・送信</button>
    </div>

    <!-- 完了 -->
    <div class="page" id="success-page" style="display:none;">
      <div class="success">
        <div class="success-icon">🚨</div>
        <div class="success-title">報告書を作成しました</div>
        <p style="color:#6b7280;font-size:14px;">LINEに報告書を送信しました。<br>管理LINEへは手動で転送してください。</p>
        <div class="success-summary" id="summary-text"></div>
        <div class="forward-note">⚠️ 管理LINEへの転送は各自で行ってください</div>
        <button class="btn-close" onclick="if(liff.isInClient())liff.closeWindow();" style="margin-top:16px;">閉じる</button>
      </div>
    </div>
  </div>

  <script>
  var LIFF_ACCESS_TOKEN = '';
  var selectedEmp = null;
  var currentCarStatus = '';
  var empSearchTimer = null;

  liff.init({ liffId: ${JSON.stringify(liffId || 'LIFF_ID_NOT_SET')} })
    .then(function() {
      LIFF_ACCESS_TOKEN = liff.getAccessToken() || '';
      document.getElementById('loading').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      var now = new Date();
      var hh = String(now.getHours()).padStart(2, '0');
      var mm = String(now.getMinutes()).padStart(2, '0');
      document.getElementById('received_at').value = hh + ':' + mm;
    })
    .catch(function(err) {
      document.getElementById('loading').textContent = 'エラー: ' + err.message;
    });

  function setCarStatus(s) {
    currentCarStatus = s;
    ['kusha','jissha','geisha'].forEach(function(id) {
      document.getElementById('cs-' + id).className = 'toggle-btn';
    });
    var map = { '空車': 'kusha', '実車': 'jissha', '迎車': 'geisha' };
    if (map[s]) document.getElementById('cs-' + map[s]).className = 'toggle-btn active';

    var dep = document.getElementById('dep-section');
    var pc = document.getElementById('passenger-check');
    if (s === '実車' || s === '迎車') {
      dep.className = 'card car-status-dep visible';
      pc.style.display = s === '実車' ? 'flex' : 'none';
    } else {
      dep.className = 'card car-status-dep';
    }
  }

  function empSearchDebounce() {
    clearTimeout(empSearchTimer);
    empSearchTimer = setTimeout(doEmpSearch, 300);
  }

  function doEmpSearch() {
    var q = document.getElementById('emp-search').value.trim();
    var sug = document.getElementById('emp-suggestions');
    if (q.length < 1) { sug.style.display = 'none'; return; }
    fetch('/api/liff/employees?q=' + encodeURIComponent(q), {
      headers: { 'Authorization': 'Bearer ' + LIFF_ACCESS_TOKEN }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || data.length === 0) { sug.style.display = 'none'; return; }
      sug.innerHTML = data.map(function(e) {
        var div = e.division ? e.division + '課' : '';
        var team = e.team ? e.team + '班' : '';
        return '<div class="emp-item" onclick="selectEmp(' + JSON.stringify(e).replace(/</g,'\\u003c').replace(/"/g,'&quot;') + ')">'
          + '<div>' + e.name + '</div>'
          + '<div class="emp-meta">' + div + team + ' / ' + e.emp_no + '</div>'
          + '</div>';
      }).join('');
      sug.style.display = 'block';
    })
    .catch(function() { sug.style.display = 'none'; });
  }

  function selectEmp(e) {
    selectedEmp = e;
    document.getElementById('emp-search').value = '';
    document.getElementById('emp-suggestions').style.display = 'none';
    var div = e.division ? e.division + '課' : '';
    var team = e.team ? e.team + '班' : '';
    document.getElementById('emp-selected').style.display = 'block';
    document.getElementById('emp-selected').textContent = '✓ ' + e.name + '（' + div + team + ' / ' + e.emp_no + '）';
    document.getElementById('employee_division').value = e.division || '';
    document.getElementById('employee_team').value = e.team || '';
  }

  document.addEventListener('click', function(e) {
    var sug = document.getElementById('emp-suggestions');
    if (!document.getElementById('emp-search').contains(e.target) && !sug.contains(e.target)) {
      sug.style.display = 'none';
    }
  });

  function submitForm() {
    var btn = document.getElementById('btn-submit');
    btn.disabled = true;
    btn.textContent = '送信中...';

    var payload = {
      received_at: document.getElementById('received_at').value || null,
      vehicle_no: document.getElementById('vehicle_no').value.trim() || null,
      employee_name: selectedEmp ? selectedEmp.name : null,
      employee_emp_no: selectedEmp ? selectedEmp.emp_no : null,
      employee_division: selectedEmp ? selectedEmp.division : null,
      employee_team: selectedEmp ? selectedEmp.team : null,
      accident_type: document.getElementById('accident_type').value.trim() || null,
      location: document.getElementById('location').value.trim() || null,
      car_status: currentCarStatus || null,
      substitute_requested: document.getElementById('substitute_requested').checked,
      police_notified: document.getElementById('police_notified').checked,
      passenger_delivered: document.getElementById('passenger_delivered').checked,
      additional_info: document.getElementById('additional_info').value.trim() || null,
    };

    fetch('/api/liff/accident', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LIFF_ACCESS_TOKEN },
      body: JSON.stringify(payload),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        document.getElementById('form-page').style.display = 'none';
        document.getElementById('success-page').style.display = 'block';
        document.getElementById('summary-text').textContent = data.summary;
      } else {
        btn.disabled = false;
        btn.textContent = '報告書を作成・送信';
        alert('送信に失敗しました: ' + (data.error || '不明なエラー'));
      }
    })
    .catch(function() {
      btn.disabled = false;
      btn.textContent = '報告書を作成・送信';
      alert('通信エラーが発生しました');
    });
  }
  </script>
</body>
</html>`;
}

function liffViolationPage(liffId: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>違反報告</title>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { margin: 0; padding: 0; background: #f0f4f8; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; font-size: 15px; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: #6b7280; font-size: 14px; }
    .page { max-width: 520px; margin: 0 auto; padding: 16px 16px 40px; }
    .header { background: #7c2d12; color: white; padding: 14px 16px; border-radius: 12px; margin-bottom: 16px; }
    .header h1 { margin: 0; font-size: 17px; font-weight: 700; }
    .header p { margin: 4px 0 0; font-size: 12px; opacity: 0.8; }
    .card { background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card-title { font-size: 13px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .field { margin-bottom: 12px; }
    .field:last-child { margin-bottom: 0; }
    label { display: block; font-size: 13px; color: #374151; margin-bottom: 5px; font-weight: 500; }
    input[type=text], input[type=tel], input[type=time], input[type=date], textarea, select {
      width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px;
      font-size: 15px; font-family: inherit; background: #f9fafb; color: #111827;
      -webkit-appearance: none; appearance: none; outline: none;
      transition: border-color 0.15s, background 0.15s;
    }
    input:focus, textarea:focus, select:focus { border-color: #2563eb; background: white; }
    textarea { resize: vertical; min-height: 72px; }
    .emp-wrap { position: relative; }
    .emp-suggestions { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #d1d5db; border-radius: 8px; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.12); max-height: 200px; overflow-y: auto; margin-top: 2px; display: none; }
    .emp-item { padding: 10px 12px; font-size: 14px; cursor: pointer; border-bottom: 1px solid #f3f4f6; }
    .emp-item:last-child { border-bottom: none; }
    .emp-item:hover { background: #eff6ff; }
    .emp-meta { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .emp-selected { font-size: 13px; color: #059669; margin-top: 4px; font-weight: 600; }
    .violation-info { display: none; margin-top: 8px; padding: 10px 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; font-size: 14px; color: #991b1b; font-weight: 600; }
    .violation-info.visible { display: block; }
    .btn-submit { width: 100%; background: #7c2d12; color: white; border: none; border-radius: 12px; padding: 15px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 8px; transition: background 0.15s; }
    .btn-submit:active { background: #5c2109; }
    .btn-submit:disabled { background: #9ca3af; cursor: default; }
    .success { text-align: center; padding: 32px 16px; }
    .success-icon { font-size: 48px; margin-bottom: 16px; }
    .success-title { font-size: 20px; font-weight: 700; color: #7c2d12; margin-bottom: 8px; }
    .success-summary { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: left; font-size: 13px; color: #374151; white-space: pre-line; margin: 16px 0; line-height: 1.7; }
    .btn-close { background: #f3f4f6; color: #374151; border: none; border-radius: 10px; padding: 12px 24px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px; }
  </style>
</head>
<body>
  <div id="loading">読み込み中...</div>
  <div id="app" style="display:none;">
    <div class="page" id="form-page">
      <div class="header">
        <h1>違反報告</h1>
        <p>必須項目はありません。わかる範囲で入力してください</p>
      </div>

      <!-- 基本情報 -->
      <div class="card">
        <div class="card-title">基本情報</div>
        <div class="field">
          <label>受電時刻</label>
          <input type="time" id="received_at">
        </div>
        <div class="field">
          <label>車番</label>
          <input type="text" id="vehicle_no" placeholder="例: 5232" inputmode="numeric">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="field" style="margin-bottom:0;">
            <label>違反発生日</label>
            <input type="date" id="violation_date">
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>違反発生時刻</label>
            <input type="time" id="violation_time">
          </div>
        </div>
      </div>

      <!-- 乗務員情報 -->
      <div class="card">
        <div class="card-title">乗務員</div>
        <div class="field">
          <div class="emp-wrap">
            <input type="text" id="emp-search" placeholder="氏名・社員番号で検索" autocomplete="off"
              oninput="empSearchDebounce()">
            <div class="emp-suggestions" id="emp-suggestions"></div>
          </div>
          <div class="emp-selected" id="emp-selected" style="display:none;"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;" id="emp-detail-row">
          <div class="field" style="margin-bottom:0;">
            <label>課</label>
            <input type="text" id="employee_division" placeholder="3" readonly style="background:#f3f4f6;color:#6b7280;">
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>班</label>
            <input type="text" id="employee_team" placeholder="6" readonly style="background:#f3f4f6;color:#6b7280;">
          </div>
        </div>
      </div>

      <!-- 違反情報 -->
      <div class="card">
        <div class="card-title">違反情報</div>
        <div class="field">
          <label>違反の種類</label>
          <select id="violation_type_id" onchange="onViolationTypeChange()">
            <option value="">選択してください</option>
          </select>
          <div class="violation-info" id="violation-info"></div>
        </div>
      </div>

      <!-- 備考 -->
      <div class="card">
        <div class="card-title">備考</div>
        <div class="field">
          <textarea id="notes" placeholder="その他、特記事項があれば"></textarea>
        </div>
      </div>

      <button class="btn-submit" id="btn-submit" onclick="submitForm()">送信する</button>
    </div>

    <!-- 送信完了画面 -->
    <div class="page success" id="success-page" style="display:none;">
      <div class="success-icon">✅</div>
      <div class="success-title">送信しました</div>
      <p style="color:#6b7280;font-size:14px;">LINEにも同じ内容を送信しました。<br>コピーして転送にご利用ください。</p>
      <div class="success-summary" id="summary-text"></div>
      <button class="btn-close" onclick="if(liff.isInClient())liff.closeWindow();">閉じる</button>
    </div>
  </div>

  <script>
  var LIFF_ACCESS_TOKEN = '';
  var selectedEmp = null;
  var empSearchTimer = null;
  var violationTypes = [];

  liff.init({ liffId: ${JSON.stringify(liffId || 'LIFF_ID_NOT_SET')} })
    .then(function() {
      LIFF_ACCESS_TOKEN = liff.getAccessToken() || '';
      document.getElementById('loading').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      var now = new Date();
      var hh = String(now.getHours()).padStart(2, '0');
      var mm = String(now.getMinutes()).padStart(2, '0');
      document.getElementById('received_at').value = hh + ':' + mm;
      var yyyy = now.getFullYear();
      var mo = String(now.getMonth() + 1).padStart(2, '0');
      var dd = String(now.getDate()).padStart(2, '0');
      document.getElementById('violation_date').value = yyyy + '-' + mo + '-' + dd;
      document.getElementById('violation_time').value = hh + ':' + mm;
      loadViolationTypes();
    })
    .catch(function(err) {
      document.getElementById('loading').textContent = 'エラー: ' + err.message;
    });

  function loadViolationTypes() {
    fetch('/api/liff/violation-types', {
      headers: { 'Authorization': 'Bearer ' + LIFF_ACCESS_TOKEN }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      violationTypes = data || [];
      var sel = document.getElementById('violation_type_id');
      violationTypes.forEach(function(vt) {
        var opt = document.createElement('option');
        opt.value = vt.id;
        opt.textContent = vt.name;
        sel.appendChild(opt);
      });
    });
  }

  function onViolationTypeChange() {
    var id = document.getElementById('violation_type_id').value;
    var info = document.getElementById('violation-info');
    var vt = violationTypes.find(function(v) { return String(v.id) === String(id); });
    if (!vt) { info.className = 'violation-info'; return; }
    info.textContent = '違反点数: ' + vt.points + '点 / 反則金: ' + vt.fine_amount.toLocaleString() + '円';
    info.className = 'violation-info visible';
  }

  function empSearchDebounce() {
    clearTimeout(empSearchTimer);
    empSearchTimer = setTimeout(doEmpSearch, 300);
  }

  function doEmpSearch() {
    var q = document.getElementById('emp-search').value.trim();
    var sug = document.getElementById('emp-suggestions');
    if (q.length < 1) { sug.style.display = 'none'; return; }
    fetch('/api/liff/employees?q=' + encodeURIComponent(q), {
      headers: { 'Authorization': 'Bearer ' + LIFF_ACCESS_TOKEN }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || data.length === 0) { sug.style.display = 'none'; return; }
      sug.innerHTML = data.map(function(e) {
        var div = e.division ? e.division + '課' : '';
        var team = e.team ? e.team + '班' : '';
        return '<div class="emp-item" onclick="selectEmp(' + JSON.stringify(e).replace(/</g,'\\u003c').replace(/"/g,'&quot;') + ')">'
          + '<div>' + e.name + '</div>'
          + '<div class="emp-meta">' + div + team + ' / ' + e.emp_no + '</div>'
          + '</div>';
      }).join('');
      sug.style.display = 'block';
    })
    .catch(function() { sug.style.display = 'none'; });
  }

  function selectEmp(e) {
    selectedEmp = e;
    document.getElementById('emp-search').value = '';
    document.getElementById('emp-suggestions').style.display = 'none';
    var div = e.division ? e.division + '課' : '';
    var team = e.team ? e.team + '班' : '';
    document.getElementById('emp-selected').style.display = 'block';
    document.getElementById('emp-selected').textContent = '✓ ' + e.name + '（' + div + team + ' / ' + e.emp_no + '）';
    document.getElementById('employee_division').value = e.division || '';
    document.getElementById('employee_team').value = e.team || '';
  }

  document.addEventListener('click', function(e) {
    var sug = document.getElementById('emp-suggestions');
    if (!document.getElementById('emp-search').contains(e.target) && !sug.contains(e.target)) {
      sug.style.display = 'none';
    }
  });

  function submitForm() {
    var btn = document.getElementById('btn-submit');
    btn.disabled = true;
    btn.textContent = '送信中...';

    var vDate = document.getElementById('violation_date').value;
    var vTime = document.getElementById('violation_time').value;
    var violationAt = vDate ? (vDate + (vTime ? ' ' + vTime : '')) : null;

    var payload = {
      received_at: document.getElementById('received_at').value || null,
      vehicle_no: document.getElementById('vehicle_no').value.trim() || null,
      violation_at: violationAt,
      employee_name: selectedEmp ? selectedEmp.name : null,
      employee_emp_no: selectedEmp ? selectedEmp.emp_no : null,
      employee_division: selectedEmp ? selectedEmp.division : null,
      employee_team: selectedEmp ? selectedEmp.team : null,
      violation_type_id: document.getElementById('violation_type_id').value || null,
      notes: document.getElementById('notes').value.trim() || null,
    };

    fetch('/api/liff/violation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LIFF_ACCESS_TOKEN },
      body: JSON.stringify(payload),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        document.getElementById('form-page').style.display = 'none';
        document.getElementById('success-page').style.display = 'block';
        document.getElementById('summary-text').textContent = data.summary;
      } else {
        btn.disabled = false;
        btn.textContent = '送信する';
        alert('送信に失敗しました: ' + (data.error || '不明なエラー'));
      }
    })
    .catch(function() {
      btn.disabled = false;
      btn.textContent = '送信する';
      alert('通信エラーが発生しました');
    });
  }
  </script>
</body>
</html>`;
}

function liffGeneralReportPage(liffId: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>報告</title>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { margin: 0; padding: 0; background: #f0f4f8; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; font-size: 15px; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: #6b7280; font-size: 14px; }
    .page { max-width: 520px; margin: 0 auto; padding: 16px 16px 40px; }
    .header { background: #0f766e; color: white; padding: 14px 16px; border-radius: 12px; margin-bottom: 16px; }
    .header h1 { margin: 0; font-size: 17px; font-weight: 700; }
    .header p { margin: 4px 0 0; font-size: 12px; opacity: 0.8; }
    .card { background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card-title { font-size: 13px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .field { margin-bottom: 12px; }
    .field:last-child { margin-bottom: 0; }
    label { display: block; font-size: 13px; color: #374151; margin-bottom: 5px; font-weight: 500; }
    input[type=text], input[type=tel], input[type=time], input[type=date], textarea, select {
      width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px;
      font-size: 15px; font-family: inherit; background: #f9fafb; color: #111827;
      -webkit-appearance: none; appearance: none; outline: none;
      transition: border-color 0.15s, background 0.15s;
    }
    input:focus, textarea:focus, select:focus { border-color: #2563eb; background: white; }
    textarea { resize: vertical; min-height: 120px; }
    .emp-wrap { position: relative; }
    .emp-suggestions { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #d1d5db; border-radius: 8px; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.12); max-height: 200px; overflow-y: auto; margin-top: 2px; display: none; }
    .emp-item { padding: 10px 12px; font-size: 14px; cursor: pointer; border-bottom: 1px solid #f3f4f6; }
    .emp-item:last-child { border-bottom: none; }
    .emp-item:hover { background: #eff6ff; }
    .emp-meta { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .emp-selected { font-size: 13px; color: #059669; margin-top: 4px; font-weight: 600; }
    .btn-submit { width: 100%; background: #0f766e; color: white; border: none; border-radius: 12px; padding: 15px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 8px; transition: background 0.15s; }
    .btn-submit:active { background: #0b5b54; }
    .btn-submit:disabled { background: #9ca3af; cursor: default; }
    .success { text-align: center; padding: 32px 16px; }
    .success-icon { font-size: 48px; margin-bottom: 16px; }
    .success-title { font-size: 20px; font-weight: 700; color: #0f766e; margin-bottom: 8px; }
    .success-summary { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: left; font-size: 13px; color: #374151; white-space: pre-line; margin: 16px 0; line-height: 1.7; }
    .btn-close { background: #f3f4f6; color: #374151; border: none; border-radius: 10px; padding: 12px 24px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px; }
  </style>
</head>
<body>
  <div id="loading">読み込み中...</div>
  <div id="app" style="display:none;">
    <div class="page" id="form-page">
      <div class="header">
        <h1>報告</h1>
        <p>事故・違反・忘れ物以外の連絡事項はこちらから</p>
      </div>

      <!-- 基本情報 -->
      <div class="card">
        <div class="card-title">基本情報</div>
        <div class="field">
          <label>受電時刻</label>
          <input type="time" id="received_at">
        </div>
        <div class="field">
          <label>車番（あれば）</label>
          <input type="text" id="vehicle_no" placeholder="例: 5232" inputmode="numeric">
        </div>
      </div>

      <!-- 乗務員情報 -->
      <div class="card">
        <div class="card-title">乗務員（あれば）</div>
        <div class="field">
          <div class="emp-wrap">
            <input type="text" id="emp-search" placeholder="氏名・社員番号で検索" autocomplete="off"
              oninput="empSearchDebounce()">
            <div class="emp-suggestions" id="emp-suggestions"></div>
          </div>
          <div class="emp-selected" id="emp-selected" style="display:none;"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;" id="emp-detail-row">
          <div class="field" style="margin-bottom:0;">
            <label>課</label>
            <input type="text" id="employee_division" placeholder="3" readonly style="background:#f3f4f6;color:#6b7280;">
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>班</label>
            <input type="text" id="employee_team" placeholder="6" readonly style="background:#f3f4f6;color:#6b7280;">
          </div>
        </div>
      </div>

      <!-- 報告内容 -->
      <div class="card">
        <div class="card-title">報告内容</div>
        <div class="field">
          <textarea id="content" placeholder="報告したい内容を自由に入力してください"></textarea>
        </div>
      </div>

      <button class="btn-submit" id="btn-submit" onclick="submitForm()">送信する</button>
    </div>

    <!-- 送信完了画面 -->
    <div class="page success" id="success-page" style="display:none;">
      <div class="success-icon">✅</div>
      <div class="success-title">送信しました</div>
      <p style="color:#6b7280;font-size:14px;">LINEにも同じ内容を送信しました。<br>コピーして転送にご利用ください。</p>
      <div class="success-summary" id="summary-text"></div>
      <button class="btn-close" onclick="if(liff.isInClient())liff.closeWindow();">閉じる</button>
    </div>
  </div>

  <script>
  var LIFF_ACCESS_TOKEN = '';
  var selectedEmp = null;
  var empSearchTimer = null;

  liff.init({ liffId: ${JSON.stringify(liffId || 'LIFF_ID_NOT_SET')} })
    .then(function() {
      LIFF_ACCESS_TOKEN = liff.getAccessToken() || '';
      document.getElementById('loading').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      var now = new Date();
      var hh = String(now.getHours()).padStart(2, '0');
      var mm = String(now.getMinutes()).padStart(2, '0');
      document.getElementById('received_at').value = hh + ':' + mm;
    })
    .catch(function(err) {
      document.getElementById('loading').textContent = 'エラー: ' + err.message;
    });

  function empSearchDebounce() {
    clearTimeout(empSearchTimer);
    empSearchTimer = setTimeout(doEmpSearch, 300);
  }

  function doEmpSearch() {
    var q = document.getElementById('emp-search').value.trim();
    var sug = document.getElementById('emp-suggestions');
    if (q.length < 1) { sug.style.display = 'none'; return; }
    fetch('/api/liff/employees?q=' + encodeURIComponent(q), {
      headers: { 'Authorization': 'Bearer ' + LIFF_ACCESS_TOKEN }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || data.length === 0) { sug.style.display = 'none'; return; }
      sug.innerHTML = data.map(function(e) {
        var div = e.division ? e.division + '課' : '';
        var team = e.team ? e.team + '班' : '';
        return '<div class="emp-item" onclick="selectEmp(' + JSON.stringify(e).replace(/</g,'\\u003c').replace(/"/g,'&quot;') + ')">'
          + '<div>' + e.name + '</div>'
          + '<div class="emp-meta">' + div + team + ' / ' + e.emp_no + '</div>'
          + '</div>';
      }).join('');
      sug.style.display = 'block';
    })
    .catch(function() { sug.style.display = 'none'; });
  }

  function selectEmp(e) {
    selectedEmp = e;
    document.getElementById('emp-search').value = '';
    document.getElementById('emp-suggestions').style.display = 'none';
    var div = e.division ? e.division + '課' : '';
    var team = e.team ? e.team + '班' : '';
    document.getElementById('emp-selected').style.display = 'block';
    document.getElementById('emp-selected').textContent = '✓ ' + e.name + '（' + div + team + ' / ' + e.emp_no + '）';
    document.getElementById('employee_division').value = e.division || '';
    document.getElementById('employee_team').value = e.team || '';
  }

  document.addEventListener('click', function(e) {
    var sug = document.getElementById('emp-suggestions');
    if (!document.getElementById('emp-search').contains(e.target) && !sug.contains(e.target)) {
      sug.style.display = 'none';
    }
  });

  function submitForm() {
    var content = document.getElementById('content').value.trim();
    if (!content) { alert('報告内容を入力してください'); return; }

    var btn = document.getElementById('btn-submit');
    btn.disabled = true;
    btn.textContent = '送信中...';

    var payload = {
      received_at: document.getElementById('received_at').value || null,
      vehicle_no: document.getElementById('vehicle_no').value.trim() || null,
      employee_name: selectedEmp ? selectedEmp.name : null,
      employee_emp_no: selectedEmp ? selectedEmp.emp_no : null,
      employee_division: selectedEmp ? selectedEmp.division : null,
      employee_team: selectedEmp ? selectedEmp.team : null,
      content: content,
    };

    fetch('/api/liff/general-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LIFF_ACCESS_TOKEN },
      body: JSON.stringify(payload),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        document.getElementById('form-page').style.display = 'none';
        document.getElementById('success-page').style.display = 'block';
        document.getElementById('summary-text').textContent = data.summary;
      } else {
        btn.disabled = false;
        btn.textContent = '送信する';
        alert('送信に失敗しました: ' + (data.error || '不明なエラー'));
      }
    })
    .catch(function() {
      btn.disabled = false;
      btn.textContent = '送信する';
      alert('通信エラーが発生しました');
    });
  }
  </script>
</body>
</html>`;
}

function liffStaffLookupPage(liffId: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>社員照会</title>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
    body { background: #f0f4f8; font-family: 'Hiragino Sans','Meiryo',sans-serif; font-size: 15px; height: 100dvh; overflow: hidden; position: relative; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100dvh; color: #6b7280; font-size: 14px; }

    /* ビュー切替 */
    .view { position: absolute; inset: 0; display: flex; flex-direction: column; transition: transform 0.28s cubic-bezier(.4,0,.2,1); background: #f0f4f8; }
    #view-search { transform: translateX(0); }
    #view-add { transform: translateX(100%); }
    #view-add.slide-in { transform: translateX(0); }
    #view-search.slide-out { transform: translateX(-25%); }

    /* ヘッダー */
    .header { background: #1e1b4b; color: white; padding: 14px 16px 12px; flex-shrink: 0; display: flex; align-items: center; gap: 10px; }
    .header h1 { font-size: 17px; font-weight: 700; flex: 1; }
    .header-sub { font-size: 11px; opacity: 0.6; }
    .btn-back { background: none; border: none; color: white; font-size: 24px; line-height: 1; cursor: pointer; padding: 0 4px 0 0; }

    /* 検索 */
    .search-area { padding: 12px 16px; background: #1e1b4b; flex-shrink: 0; }
    .search-box { display: flex; align-items: center; background: white; border-radius: 10px; padding: 0 12px; gap: 8px; }
    .search-box input { border: none; outline: none; font-size: 15px; padding: 11px 0; flex: 1; background: transparent; color: #111827; }
    .search-box input::placeholder { color: #9ca3af; }
    .btn-clear { background: none; border: none; color: #9ca3af; font-size: 18px; cursor: pointer; padding: 4px; display: none; }

    /* リスト */
    #results-area { flex: 1; overflow-y: auto; padding: 10px 12px 80px; }
    .hint { text-align: center; color: #9ca3af; font-size: 13px; padding: 48px 16px; line-height: 1.8; }
    .result-count { font-size: 12px; color: #6b7280; padding: 4px 4px 8px; }
    .emp-card { background: white; border-radius: 12px; padding: 13px 14px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); cursor: pointer; display: flex; align-items: center; gap: 12px; }
    .emp-card:active { background: #f5f3ff; }
    .emp-avatar { width: 40px; height: 40px; border-radius: 50%; background: #ede9fe; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: #4c1d95; flex-shrink: 0; }
    .emp-name { font-size: 15px; font-weight: 700; color: #111827; }
    .emp-kana { font-size: 11px; color: #6b7280; margin-top: 1px; }
    .emp-sub { display: flex; gap: 6px; margin-top: 5px; flex-wrap: wrap; }
    .badge { font-size: 11px; padding: 2px 8px; border-radius: 99px; font-weight: 600; }
    .bdg-div { background: #ede9fe; color: #5b21b6; }
    .bdg-no { background: #f3f4f6; color: #6b7280; }
    .bdg-hanchyo { background: #fef3c7; color: #92400e; }
    .no-results { text-align: center; color: #9ca3af; font-size: 13px; padding: 40px 16px; }

    /* FAB */
    .fab { position: fixed; right: 20px; bottom: 24px; width: 56px; height: 56px; background: #4f46e5; color: white; border: none; border-radius: 50%; font-size: 28px; cursor: pointer; box-shadow: 0 4px 14px rgba(79,70,229,.45); z-index: 50; display: flex; align-items: center; justify-content: center; line-height: 1; }

    /* 追加フォーム */
    #view-add .scroll-area { flex: 1; overflow-y: auto; padding: 16px 16px 32px; }
    .fcard { background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
    .fcard-title { font-size: 12px; font-weight: 700; color: #6b7280; letter-spacing: .05em; text-transform: uppercase; margin-bottom: 12px; }
    .field { margin-bottom: 12px; }
    .field:last-child { margin-bottom: 0; }
    label { display: block; font-size: 13px; color: #374151; margin-bottom: 5px; font-weight: 500; }
    .req { color: #ef4444; margin-left: 2px; }
    input[type=text],input[type=tel],input[type=time],input[type=date],input[type=number],select {
      width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px;
      font-size: 15px; font-family: inherit; background: #f9fafb; color: #111827;
      -webkit-appearance: none; appearance: none; outline: none;
    }
    input:focus,select:focus { border-color: #4f46e5; background: white; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .btn-primary { width: 100%; background: #1e1b4b; color: white; border: none; border-radius: 12px; padding: 15px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 8px; }
    .btn-primary:disabled { background: #9ca3af; }

    /* ボトムシート */
    #sheet-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 100; display: none; }
    #sheet-overlay.open { display: block; }
    #bottom-sheet { position: fixed; left: 0; right: 0; bottom: 0; background: white; border-radius: 20px 20px 0 0; z-index: 101; transform: translateY(100%); transition: transform .3s ease; max-height: 90dvh; display: flex; flex-direction: column; }
    #bottom-sheet.open { transform: translateY(0); }
    .sh-handle { width: 36px; height: 4px; background: #d1d5db; border-radius: 2px; margin: 10px auto 0; flex-shrink: 0; }

    /* 詳細パネル */
    #panel-detail { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    #panel-detail.hidden { display: none; }
    .sh-head { padding: 12px 20px 14px; border-bottom: 1px solid #f3f4f6; flex-shrink: 0; }
    .sh-name { font-size: 22px; font-weight: 800; color: #111827; }
    .sh-kana { font-size: 13px; color: #6b7280; margin-top: 2px; }
    .sh-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .sh-body { overflow-y: auto; padding: 16px 20px; flex: 1; }
    .ds { margin-bottom: 20px; }
    .ds-title { font-size: 11px; font-weight: 700; color: #6b7280; letter-spacing: .06em; margin-bottom: 8px; }
    .dr { display: flex; align-items: baseline; padding: 8px 0; border-bottom: 1px solid #f9fafb; gap: 8px; }
    .dr:last-child { border-bottom: none; }
    .dl { font-size: 12px; color: #9ca3af; min-width: 80px; flex-shrink: 0; }
    .dv { font-size: 15px; color: #111827; font-weight: 500; flex: 1; }
    .dv.empty { color: #d1d5db; font-weight: 400; font-size: 13px; }
    .sh-foot { padding: 12px 20px 20px; display: flex; gap: 10px; flex-shrink: 0; }
    .btn-sheet-close { flex: 1; background: #f3f4f6; color: #374151; border: none; border-radius: 12px; padding: 13px; font-size: 15px; font-weight: 600; cursor: pointer; }
    .btn-retire { flex: 1; background: #fee2e2; color: #dc2626; border: none; border-radius: 12px; padding: 13px; font-size: 15px; font-weight: 700; cursor: pointer; }

    /* 退職確認パネル */
    #panel-retire { display: none; flex-direction: column; flex: 1; overflow: hidden; }
    #panel-retire.open { display: flex; }
    .ret-body { padding: 20px; flex: 1; overflow-y: auto; }
    .ret-warn { background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 14px; margin-bottom: 20px; }
    .ret-warn-name { font-size: 18px; font-weight: 800; color: #111827; margin-bottom: 4px; }
    .ret-warn-text { font-size: 13px; color: #991b1b; }
    .ret-foot { padding: 12px 20px 20px; display: flex; gap: 10px; flex-shrink: 0; }
    .btn-cancel { flex: 1; background: #f3f4f6; color: #374151; border: none; border-radius: 12px; padding: 13px; font-size: 15px; font-weight: 600; cursor: pointer; }
    .btn-exec { flex: 1; background: #dc2626; color: white; border: none; border-radius: 12px; padding: 13px; font-size: 15px; font-weight: 700; cursor: pointer; }
    .btn-exec:disabled { background: #9ca3af; }

    /* 編集パネル */
    #panel-edit { display: none; flex-direction: column; flex: 1; overflow: hidden; }
    #panel-edit.open { display: flex; }
    .edit-scroll { flex: 1; overflow-y: auto; padding: 12px 20px 8px; }
    .btn-edit { flex: 1; background: #ede9fe; color: #5b21b6; border: none; border-radius: 12px; padding: 13px; font-size: 15px; font-weight: 700; cursor: pointer; }
    .btn-save { flex: 1; background: #4f46e5; color: white; border: none; border-radius: 12px; padding: 13px; font-size: 15px; font-weight: 700; cursor: pointer; }
    .btn-save:disabled { background: #9ca3af; }
  </style>
</head>
<body>
  <div id="loading">読み込み中...</div>

  <!-- 検索ビュー -->
  <div class="view" id="view-search" style="display:none;">
    <div class="header">
      <h1>社員照会</h1>
      <span class="header-sub">統括・運行管理者専用</span>
    </div>
    <div class="search-area">
      <div class="search-box">
        <span style="color:#9ca3af;font-size:16px;flex-shrink:0;">🔍</span>
        <input type="text" id="search-input" placeholder="氏名・ふりがな・社員番号" autocomplete="off" spellcheck="false">
        <button class="btn-clear" id="clear-btn" onclick="clearSearch()">✕</button>
      </div>
    </div>
    <div id="results-area">
      <div class="hint" id="hint">氏名・ふりがな・社員番号で検索<br>右下の ＋ から新規追加もできます</div>
      <div id="result-count" class="result-count" style="display:none;"></div>
      <div id="results-list"></div>
    </div>
    <button class="fab" onclick="showAdd()">＋</button>
  </div>

  <!-- 新規追加ビュー -->
  <div class="view" id="view-add" style="display:none;">
    <div class="header">
      <button class="btn-back" onclick="showSearch()">‹</button>
      <h1>新規社員追加</h1>
    </div>
    <div class="scroll-area">
      <div class="fcard">
        <div class="fcard-title">基本情報</div>
        <div class="field"><label>氏名<span class="req">*</span></label><input type="text" id="a-name" placeholder="板橋 一郎"></div>
        <div class="field"><label>ふりがな</label><input type="text" id="a-kana" placeholder="いたばし いちろう"></div>
        <div class="field"><label>社員番号<span class="req">*</span></label><input type="text" id="a-empno" placeholder="12345" inputmode="numeric"></div>
      </div>
      <div class="fcard">
        <div class="fcard-title">所属</div>
        <div class="grid2">
          <div class="field" style="margin-bottom:0;"><label>課<span class="req">*</span></label><input type="number" id="a-div" placeholder="3" min="1"></div>
          <div class="field" style="margin-bottom:0;"><label>班<span class="req">*</span></label><input type="number" id="a-team" placeholder="6" min="1"></div>
        </div>
      </div>
      <div class="fcard">
        <div class="fcard-title">勤務情報</div>
        <div class="field"><label>勤務体系</label><input type="text" id="a-sched" placeholder="例: 日勤、夜勤"></div>
        <div class="field"><label>出勤時間</label><input type="time" id="a-start"></div>
        <div class="field" style="margin-bottom:0;"><label>担当車番</label><input type="text" id="a-car" placeholder="5232" inputmode="numeric"></div>
      </div>
      <div class="fcard">
        <div class="fcard-title">連絡先・入社</div>
        <div class="field"><label>電話番号</label><input type="tel" id="a-phone" placeholder="090-0000-0000" inputmode="tel"></div>
        <div class="field" style="margin-bottom:0;"><label>入社日</label><input type="date" id="a-hire"></div>
      </div>
      <button class="btn-primary" id="btn-add" onclick="submitAdd()">追加する</button>
    </div>
  </div>

  <!-- ボトムシート -->
  <div id="sheet-overlay" onclick="closeSheet()"></div>
  <div id="bottom-sheet">
    <div class="sh-handle"></div>

    <!-- 詳細パネル -->
    <div id="panel-detail">
      <div class="sh-head">
        <div class="sh-name" id="s-name"></div>
        <div class="sh-kana" id="s-kana"></div>
        <div class="sh-badges" id="s-badges"></div>
      </div>
      <div class="sh-body" id="s-body"></div>
      <div class="sh-foot">
        <button class="btn-sheet-close" onclick="closeSheet()">閉じる</button>
        <button class="btn-edit" onclick="showEdit()">編集</button>
        <button class="btn-retire" onclick="showRetire()">退職処理</button>
      </div>
    </div>

    <!-- 編集パネル -->
    <div id="panel-edit">
      <div class="sh-head">
        <div style="font-size:12px;color:#6b7280;margin-bottom:2px;">編集中</div>
        <div class="sh-name" id="e-label"></div>
      </div>
      <div class="edit-scroll">
        <div class="fcard">
          <div class="fcard-title">基本情報</div>
          <div class="field"><label>氏名<span class="req">*</span></label><input type="text" id="e-name"></div>
          <div class="field" style="margin-bottom:0;"><label>ふりがな</label><input type="text" id="e-kana"></div>
        </div>
        <div class="fcard">
          <div class="fcard-title">所属</div>
          <div class="grid2">
            <div class="field" style="margin-bottom:0;"><label>課</label><input type="number" id="e-div" min="1"></div>
            <div class="field" style="margin-bottom:0;"><label>班</label><input type="number" id="e-team" min="1"></div>
          </div>
        </div>
        <div class="fcard">
          <div class="fcard-title">勤務情報</div>
          <div class="field"><label>勤務体系</label><input type="text" id="e-sched" placeholder="例: 日勤、夜勤"></div>
          <div class="field"><label>出勤時間</label><input type="time" id="e-start"></div>
          <div class="field" style="margin-bottom:0;"><label>担当車番</label><input type="text" id="e-car" inputmode="numeric"></div>
        </div>
        <div class="fcard">
          <div class="fcard-title">連絡先・入社</div>
          <div class="field"><label>電話番号</label><input type="tel" id="e-phone" inputmode="tel"></div>
          <div class="field" style="margin-bottom:0;"><label>入社日</label><input type="date" id="e-hire"></div>
        </div>
        <div class="fcard" style="display:flex;align-items:center;gap:12px;">
          <input type="checkbox" id="e-hanchyo" style="width:22px;height:22px;accent-color:#4f46e5;flex-shrink:0;">
          <label for="e-hanchyo" style="font-size:15px;cursor:pointer;font-weight:500;">班長</label>
        </div>
      </div>
      <div class="ret-foot">
        <button class="btn-cancel" onclick="backFromEdit()">戻る</button>
        <button class="btn-save" id="btn-save" onclick="saveEdit()">保存する</button>
      </div>
    </div>

    <!-- 退職確認パネル -->
    <div id="panel-retire">
      <div class="ret-body">
        <div class="ret-warn">
          <div class="ret-warn-name" id="r-name"></div>
          <div class="ret-warn-text">この社員を退職処理します。元に戻せません。</div>
        </div>
        <div class="field"><label>退職日<span class="req">*</span></label><input type="date" id="retire-date"></div>
      </div>
      <div class="ret-foot">
        <button class="btn-cancel" onclick="backToDetail()">戻る</button>
        <button class="btn-exec" id="btn-exec" onclick="execRetire()">実行する</button>
      </div>
    </div>
  </div>

  <script>
  var AT = '';
  var _list = [];
  var _cur = null;
  var _timer = null;

  liff.init({ liffId: ${JSON.stringify(liffId || 'LIFF_ID_NOT_SET')} })
    .then(function() {
      AT = liff.getAccessToken() || '';
      document.getElementById('loading').style.display = 'none';
      document.getElementById('view-search').style.display = 'flex';
      document.getElementById('view-add').style.display = 'flex';
      document.getElementById('search-input').focus();
      var t = new Date(), yyyy = t.getFullYear(), mm = String(t.getMonth()+1).padStart(2,'0'), dd = String(t.getDate()).padStart(2,'0'), today = yyyy+'-'+mm+'-'+dd;
      document.getElementById('retire-date').value = today;
      document.getElementById('a-hire').value = today;
    })
    .catch(function(e) { document.getElementById('loading').textContent = 'エラー: '+e.message; });

  /* ビュー切替 */
  function showAdd() {
    document.getElementById('view-search').classList.add('slide-out');
    document.getElementById('view-add').classList.add('slide-in');
  }
  function showSearch() {
    document.getElementById('view-search').classList.remove('slide-out');
    document.getElementById('view-add').classList.remove('slide-in');
  }

  /* 検索 */
  document.getElementById('search-input').addEventListener('input', function() {
    document.getElementById('clear-btn').style.display = this.value ? 'block' : 'none';
    clearTimeout(_timer);
    var q = this.value;
    _timer = setTimeout(function() { doSearch(q.trim()); }, 280);
  });
  function clearSearch() {
    document.getElementById('search-input').value = '';
    document.getElementById('clear-btn').style.display = 'none';
    document.getElementById('hint').style.display = 'block';
    document.getElementById('result-count').style.display = 'none';
    document.getElementById('results-list').innerHTML = '';
    _list = [];
  }
  function doSearch(q) {
    if (!q) { document.getElementById('hint').style.display='block'; document.getElementById('result-count').style.display='none'; document.getElementById('results-list').innerHTML=''; return; }
    document.getElementById('hint').style.display = 'none';
    fetch('/api/liff/staff-lookup?q='+encodeURIComponent(q), { headers: { Authorization: 'Bearer '+AT } })
    .then(function(r){ return r.json(); }).then(function(d){ _list=d||[]; renderList(_list); })
    .catch(function(){ document.getElementById('results-list').innerHTML='<div class="no-results">通信エラー</div>'; });
  }
  function renderList(list) {
    var cnt = document.getElementById('result-count'), el = document.getElementById('results-list');
    if (!list.length) { cnt.style.display='none'; el.innerHTML='<div class="no-results">該当する社員が見つかりませんでした</div>'; return; }
    cnt.style.display='block'; cnt.textContent=list.length+'件'+(list.length>=30?'（上位30件）':'');
    el.innerHTML = list.map(function(e,i){
      var div=e.division?e.division+'課':'', team=e.team?e.team+'班':'', loc=(div+team)||'所属未設定';
      return '<div class="emp-card" onclick="openDetail('+i+')">'
        +'<div class="emp-avatar">'+ini(e.name)+'</div>'
        +'<div style="flex:1;min-width:0;">'
        +'<div class="emp-name">'+esc(e.name)+'</div>'
        +(e.name_kana?'<div class="emp-kana">'+esc(e.name_kana)+'</div>':'')
        +'<div class="emp-sub"><span class="badge bdg-div">'+loc+'</span><span class="badge bdg-no">No.'+esc(e.emp_no)+'</span>'+(e.is_hanchyo?'<span class="badge bdg-hanchyo">班長</span>':'')+'</div>'
        +'</div><div style="color:#d1d5db;font-size:14px;">›</div></div>';
    }).join('');
  }

  /* 詳細シート */
  function openDetail(i) {
    var e=_list[i]; if(!e) return;
    _cur=e;
    var div=e.division?e.division+'課':'', team=e.team?e.team+'班':'';
    document.getElementById('s-name').textContent=e.name;
    document.getElementById('s-kana').textContent=e.name_kana||'';
    var b=''; if(div||team) b+='<span class="badge bdg-div">'+(div+team)+'</span>'; if(e.is_hanchyo) b+='<span class="badge bdg-hanchyo">班長</span>';
    document.getElementById('s-badges').innerHTML=b;
    function row(l,v,ph){ var d=v?esc(String(v)):'<span class="dv empty">—</span>'; if(ph&&v) d='<a href="tel:'+esc(v)+'" style="color:#2563eb;font-weight:600;text-decoration:none;">'+esc(v)+'</a>'; return '<div class="dr"><span class="dl">'+l+'</span><span class="dv">'+d+'</span></div>'; }
    document.getElementById('s-body').innerHTML=
      '<div class="ds"><div class="ds-title">基本情報</div>'+row('社員番号',e.emp_no)+row('氏名',e.name)+row('ふりがな',e.name_kana)+row('課・班',(div+team)||null)+row('班長',e.is_hanchyo?'はい':null)+'</div>'
      +'<div class="ds"><div class="ds-title">勤務情報</div>'+row('勤務体系',e.work_schedule)+row('出勤時間',e.start_time)+row('担当車番',e.car_no)+'</div>'
      +'<div class="ds"><div class="ds-title">在籍情報</div>'+row('在籍状態',e.enrollment_status)+row('入社日',e.hire_date)+row('退職予定日',e.retirement_date)+'</div>'
      +'<div class="ds"><div class="ds-title">連絡先</div>'+row('電話番号',e.phone,true)+'</div>';
    document.getElementById('panel-detail').classList.remove('hidden');
    document.getElementById('panel-retire').classList.remove('open');
    document.getElementById('sheet-overlay').classList.add('open');
    document.getElementById('bottom-sheet').classList.add('open');
    document.body.style.overflow='hidden';
  }
  function closeSheet() {
    document.getElementById('sheet-overlay').className='';
    document.getElementById('bottom-sheet').className='';
    document.body.style.overflow='';
    _cur=null;
  }

  /* 編集 */
  function showEdit() {
    if (!_cur) return;
    document.getElementById('e-label').textContent = _cur.name;
    document.getElementById('e-name').value = _cur.name || '';
    document.getElementById('e-kana').value = _cur.name_kana || '';
    document.getElementById('e-div').value = _cur.division || '';
    document.getElementById('e-team').value = _cur.team || '';
    document.getElementById('e-sched').value = _cur.work_schedule || '';
    document.getElementById('e-start').value = _cur.start_time || '';
    document.getElementById('e-car').value = _cur.car_no || '';
    document.getElementById('e-phone').value = _cur.phone || '';
    document.getElementById('e-hire').value = _cur.hire_date || '';
    document.getElementById('e-hanchyo').checked = !!_cur.is_hanchyo;
    document.getElementById('panel-detail').classList.add('hidden');
    document.getElementById('panel-edit').classList.add('open');
  }
  function backFromEdit() {
    document.getElementById('panel-detail').classList.remove('hidden');
    document.getElementById('panel-edit').classList.remove('open');
  }
  function saveEdit() {
    if (!_cur) return;
    var name = document.getElementById('e-name').value.trim();
    if (!name) { alert('氏名は必須です'); return; }
    var btn = document.getElementById('btn-save'); btn.disabled = true; btn.textContent = '保存中...';
    fetch('/api/liff/staff-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AT },
      body: JSON.stringify({
        id: _cur.id, name: name,
        name_kana: document.getElementById('e-kana').value.trim() || null,
        division: parseInt(document.getElementById('e-div').value, 10) || null,
        team: parseInt(document.getElementById('e-team').value, 10) || null,
        work_schedule: document.getElementById('e-sched').value.trim() || null,
        start_time: document.getElementById('e-start').value || null,
        car_no: document.getElementById('e-car').value.trim() || null,
        phone: document.getElementById('e-phone').value.trim() || null,
        hire_date: document.getElementById('e-hire').value || null,
        is_hanchyo: document.getElementById('e-hanchyo').checked ? 1 : 0,
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      btn.disabled = false; btn.textContent = '保存する';
      if (data.ok) {
        Object.assign(_cur, data.updated);
        _list = _list.map(function(e) { return e.id === _cur.id ? Object.assign({}, e, data.updated) : e; });
        renderList(_list);
        backFromEdit();
        var idx = _list.findIndex(function(e) { return e.id === _cur.id; });
        if (idx >= 0) openDetail(idx);
      } else { alert('エラー: ' + (data.error || '不明')); }
    })
    .catch(function() { btn.disabled = false; btn.textContent = '保存する'; alert('通信エラー'); });
  }

  /* 退職処理 */
  function showRetire() {
    if(!_cur) return;
    document.getElementById('r-name').textContent=_cur.name;
    document.getElementById('panel-detail').classList.add('hidden');
    document.getElementById('panel-retire').classList.add('open');
  }
  function backToDetail() {
    document.getElementById('panel-detail').classList.remove('hidden');
    document.getElementById('panel-retire').classList.remove('open');
  }
  function execRetire() {
    if(!_cur) return;
    var d=document.getElementById('retire-date').value;
    if(!d){ alert('退職日を入力してください'); return; }
    var btn=document.getElementById('btn-exec'); btn.disabled=true; btn.textContent='処理中...';
    fetch('/api/liff/staff-retire',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+AT }, body:JSON.stringify({ id:_cur.id, retirement_date:d }) })
    .then(function(r){ return r.json(); }).then(function(data){
      if(data.ok){ var n=_cur.name; _list=_list.filter(function(e){ return e.id!==_cur.id; }); renderList(_list); closeSheet(); alert(n+' の退職処理が完了しました'); }
      else { btn.disabled=false; btn.textContent='実行する'; alert('エラー: '+(data.error||'不明')); }
    }).catch(function(){ btn.disabled=false; btn.textContent='実行する'; alert('通信エラー'); });
  }

  /* 新規追加 */
  function submitAdd() {
    var name=document.getElementById('a-name').value.trim(), empno=document.getElementById('a-empno').value.trim();
    var div=parseInt(document.getElementById('a-div').value,10), team=parseInt(document.getElementById('a-team').value,10);
    if(!name||!empno||!div||!team){ alert('氏名・社員番号・課・班は必須です'); return; }
    var btn=document.getElementById('btn-add'); btn.disabled=true; btn.textContent='追加中...';
    fetch('/api/liff/staff-add',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+AT }, body:JSON.stringify({
      name:name, name_kana:document.getElementById('a-kana').value.trim()||null, emp_no:empno, division:div, team:team,
      work_schedule:document.getElementById('a-sched').value.trim()||null, start_time:document.getElementById('a-start').value||null,
      car_no:document.getElementById('a-car').value.trim()||null, phone:document.getElementById('a-phone').value.trim()||null,
      hire_date:document.getElementById('a-hire').value||null
    }) })
    .then(function(r){ return r.json(); }).then(function(data){
      btn.disabled=false; btn.textContent='追加する';
      if(data.ok){ ['a-name','a-kana','a-empno','a-sched','a-start','a-car','a-phone','a-div','a-team'].forEach(function(id){ document.getElementById(id).value=''; }); showSearch(); alert(name+' を追加しました'); }
      else { alert('エラー: '+(data.error||'不明')); }
    }).catch(function(){ btn.disabled=false; btn.textContent='追加する'; alert('通信エラー'); });
  }

  function ini(n){ return n?n.charAt(0):'?'; }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  </script>
</body>
</html>`;
}

function liffStaffLookupPlusPage(liffId: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>社員照会＋</title>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; padding: 0; }
    body { background: #f0f4f8; font-family: 'Hiragino Sans','Meiryo',sans-serif; font-size: 15px; height: 100dvh; overflow: hidden; position: relative; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100dvh; color: #6b7280; font-size: 14px; }

    /* ビュー切替 */
    .view { position: absolute; inset: 0; display: flex; flex-direction: column; transition: transform 0.28s cubic-bezier(.4,0,.2,1); background: #f0f4f8; }
    #view-division { transform: translateX(0); }
    #view-search { transform: translateX(100%); }
    #view-search.slide-in { transform: translateX(0); }
    #view-division.slide-out { transform: translateX(-25%); }
    #view-add { transform: translateX(100%); }
    #view-add.slide-in { transform: translateX(0); }
    #view-search.slide-out-add { transform: translateX(-25%); }

    /* ヘッダー */
    .header { background: #1e1b4b; color: white; padding: 14px 16px 12px; flex-shrink: 0; display: flex; align-items: center; gap: 10px; }
    .header h1 { font-size: 17px; font-weight: 700; flex: 1; }
    .header-sub { font-size: 11px; opacity: 0.6; }
    .btn-back { background: none; border: none; color: white; font-size: 24px; line-height: 1; cursor: pointer; padding: 0 4px 0 0; }

    /* 課選択 */
    .div-scroll { flex: 1; overflow-y: auto; padding: 20px 16px; }
    .div-lead { text-align: center; color: #6b7280; font-size: 13px; margin-bottom: 20px; line-height: 1.7; }
    .div-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .div-card { background: white; border-radius: 16px; padding: 22px 12px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.07); cursor: pointer; }
    .div-card:active { background: #ede9fe; }
    .div-card-num { font-size: 26px; font-weight: 800; color: #4c1d95; }
    .div-card-label { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .div-card-cnt { font-size: 11px; color: #9ca3af; margin-top: 6px; }
    .div-all-btn { display: block; width: 100%; margin-top: 16px; background: white; border: 1.5px dashed #a5b4fc; color: #4c1d95; font-size: 14px; font-weight: 700; border-radius: 14px; padding: 16px; cursor: pointer; }
    .div-all-btn:active { background: #ede9fe; }

    /* 検索ビュー用ヘッダー */
    .div-badge-btn { background: rgba(255,255,255,0.15); border: none; color: white; font-size: 13px; font-weight: 700; border-radius: 99px; padding: 6px 12px; cursor: pointer; display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

    /* 検索 */
    .search-area { padding: 12px 16px; background: #1e1b4b; flex-shrink: 0; }
    .search-box { display: flex; align-items: center; background: white; border-radius: 10px; padding: 0 12px; gap: 8px; }
    .search-box input { border: none; outline: none; font-size: 16px; padding: 11px 0; flex: 1; background: transparent; color: #111827; }
    .search-box input::placeholder { color: #9ca3af; }
    .btn-clear { background: none; border: none; color: #9ca3af; font-size: 18px; cursor: pointer; padding: 4px; display: none; }

    /* 班チップ */
    .team-chips { display: flex; gap: 6px; padding: 10px 16px 0; overflow-x: auto; flex-shrink: 0; }
    .team-chip { background: white; border: 1px solid #e5e7eb; color: #374151; font-size: 12px; font-weight: 600; padding: 6px 12px; border-radius: 99px; white-space: nowrap; cursor: pointer; flex-shrink: 0; }
    .team-chip.active { background: #4f46e5; border-color: #4f46e5; color: white; }

    /* リスト */
    #results-area { flex: 1; overflow-y: auto; padding: 10px 12px 80px; }
    .hint { text-align: center; color: #9ca3af; font-size: 13px; padding: 48px 16px; line-height: 1.8; }
    .result-count { font-size: 12px; color: #6b7280; padding: 4px 4px 8px; }
    .emp-card { background: white; border-radius: 12px; padding: 13px 14px; margin-bottom: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); cursor: pointer; display: flex; align-items: center; gap: 12px; }
    .emp-card:active { background: #f5f3ff; }
    .emp-avatar { width: 40px; height: 40px; border-radius: 50%; background: #ede9fe; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: #4c1d95; flex-shrink: 0; }
    .emp-name { font-size: 15px; font-weight: 700; color: #111827; }
    .emp-kana { font-size: 11px; color: #6b7280; margin-top: 1px; }
    .emp-sub { display: flex; gap: 6px; margin-top: 5px; flex-wrap: wrap; align-items: center; }
    .badge { font-size: 11px; padding: 2px 8px; border-radius: 99px; font-weight: 600; }
    .bdg-div { background: #ede9fe; color: #5b21b6; }
    .bdg-no { background: #f3f4f6; color: #6b7280; }
    .bdg-hanchyo { background: #fef3c7; color: #92400e; }
    .bdg-sched { background: #dbeafe; color: #1e40af; }
    .emp-start { font-size: 11px; color: #6b7280; margin-top: 3px; }
    .no-results { text-align: center; color: #9ca3af; font-size: 13px; padding: 40px 16px; }

    /* FAB */
    .fab { position: fixed; right: 20px; bottom: 24px; width: 56px; height: 56px; background: #4f46e5; color: white; border: none; border-radius: 50%; font-size: 28px; cursor: pointer; box-shadow: 0 4px 14px rgba(79,70,229,.45); z-index: 50; display: flex; align-items: center; justify-content: center; line-height: 1; }

    /* 追加フォーム */
    #view-add .scroll-area { flex: 1; overflow-y: auto; padding: 16px 16px 32px; }
    .fcard { background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.07); }
    .fcard-title { font-size: 12px; font-weight: 700; color: #6b7280; letter-spacing: .05em; text-transform: uppercase; margin-bottom: 12px; }
    .field { margin-bottom: 12px; }
    .field:last-child { margin-bottom: 0; }
    label { display: block; font-size: 13px; color: #374151; margin-bottom: 5px; font-weight: 500; }
    .req { color: #ef4444; margin-left: 2px; }
    input[type=text],input[type=tel],input[type=time],input[type=date],input[type=number],select {
      width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px;
      font-size: 16px; font-family: inherit; background: #f9fafb; color: #111827;
      -webkit-appearance: none; appearance: none; outline: none;
    }
    input:focus,select:focus { border-color: #4f46e5; background: white; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .btn-primary { width: 100%; background: #1e1b4b; color: white; border: none; border-radius: 12px; padding: 15px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 8px; }
    .btn-primary:disabled { background: #9ca3af; }

    /* ボトムシート */
    #sheet-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); z-index: 100; display: none; }
    #sheet-overlay.open { display: block; }
    #bottom-sheet { position: fixed; left: 0; right: 0; bottom: 0; background: white; border-radius: 20px 20px 0 0; z-index: 101; transform: translateY(100%); transition: transform .3s ease; max-height: 90dvh; display: flex; flex-direction: column; }
    #bottom-sheet.open { transform: translateY(0); }
    .sh-handle { width: 36px; height: 4px; background: #d1d5db; border-radius: 2px; margin: 10px auto 0; flex-shrink: 0; }

    /* 詳細パネル */
    #panel-detail { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
    #panel-detail.hidden { display: none; }
    .sh-head { padding: 12px 20px 14px; border-bottom: 1px solid #f3f4f6; flex-shrink: 0; }
    .sh-name { font-size: 22px; font-weight: 800; color: #111827; }
    .sh-kana { font-size: 13px; color: #6b7280; margin-top: 2px; }
    .sh-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .sh-body { overflow-y: auto; padding: 16px 20px; flex: 1; }
    .ds { margin-bottom: 20px; }
    .ds-title { font-size: 11px; font-weight: 700; color: #6b7280; letter-spacing: .06em; margin-bottom: 8px; }
    .dr { display: flex; align-items: baseline; padding: 8px 0; border-bottom: 1px solid #f9fafb; gap: 8px; }
    .dr:last-child { border-bottom: none; }
    .dl { font-size: 12px; color: #9ca3af; min-width: 80px; flex-shrink: 0; }
    .dv { font-size: 15px; color: #111827; font-weight: 500; flex: 1; }
    .dv.empty { color: #d1d5db; font-weight: 400; font-size: 13px; }
    .sh-foot { padding: 12px 20px 20px; display: flex; gap: 10px; flex-shrink: 0; }
    .btn-sheet-close { flex: 1; background: #f3f4f6; color: #374151; border: none; border-radius: 12px; padding: 13px; font-size: 15px; font-weight: 600; cursor: pointer; }
    .btn-retire { flex: 1; background: #fee2e2; color: #dc2626; border: none; border-radius: 12px; padding: 13px; font-size: 15px; font-weight: 700; cursor: pointer; }

    /* 退職確認パネル */
    #panel-retire { display: none; flex-direction: column; flex: 1; overflow: hidden; }
    #panel-retire.open { display: flex; }
    .ret-body { padding: 20px; flex: 1; overflow-y: auto; }
    .ret-warn { background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 14px; margin-bottom: 20px; }
    .ret-warn-name { font-size: 18px; font-weight: 800; color: #111827; margin-bottom: 4px; }
    .ret-warn-text { font-size: 13px; color: #991b1b; }
    .ret-foot { padding: 12px 20px 20px; display: flex; gap: 10px; flex-shrink: 0; }
    .btn-cancel { flex: 1; background: #f3f4f6; color: #374151; border: none; border-radius: 12px; padding: 13px; font-size: 15px; font-weight: 600; cursor: pointer; }
    .btn-exec { flex: 1; background: #dc2626; color: white; border: none; border-radius: 12px; padding: 13px; font-size: 15px; font-weight: 700; cursor: pointer; }
    .btn-exec:disabled { background: #9ca3af; }

    /* 編集パネル */
    #panel-edit { display: none; flex-direction: column; flex: 1; overflow: hidden; }
    #panel-edit.open { display: flex; }
    .edit-scroll { flex: 1; overflow-y: auto; padding: 12px 20px 8px; }
    .btn-edit { flex: 1; background: #ede9fe; color: #5b21b6; border: none; border-radius: 12px; padding: 13px; font-size: 15px; font-weight: 700; cursor: pointer; }
    .btn-save { flex: 1; background: #4f46e5; color: white; border: none; border-radius: 12px; padding: 13px; font-size: 15px; font-weight: 700; cursor: pointer; }
    .btn-save:disabled { background: #9ca3af; }
  </style>
</head>
<body>
  <div id="loading">読み込み中...</div>

  <!-- 課選択ビュー -->
  <div class="view" id="view-division" style="display:none;">
    <div class="header">
      <h1>社員照会＋</h1>
      <span class="header-sub">課から探す</span>
    </div>
    <div class="div-scroll">
      <div class="div-lead">まず課を選んでください</div>
      <div class="div-grid" id="div-grid"></div>
      <button class="div-all-btn" onclick="selectAllDivisions()">🔍 全課から検索する</button>
    </div>
  </div>

  <!-- 検索ビュー -->
  <div class="view" id="view-search" style="display:none;">
    <div class="header">
      <button class="btn-back" onclick="showDivision()">‹</button>
      <h1 id="search-title">社員照会＋</h1>
      <button class="div-badge-btn" id="div-badge-btn" onclick="showDivision()">課を変更</button>
    </div>
    <div class="search-area">
      <div class="search-box">
        <span style="color:#9ca3af;font-size:16px;flex-shrink:0;">🔍</span>
        <input type="text" id="search-input" placeholder="氏名・ふりがな・社員番号（絞り込み）" autocomplete="off" spellcheck="false">
        <button class="btn-clear" id="clear-btn" onclick="clearSearch()">✕</button>
      </div>
    </div>
    <div class="team-chips" id="team-chips"></div>
    <div id="results-area">
      <div class="hint" id="hint" style="display:none;">課をまたいで氏名・ふりがな・社員番号で検索できます</div>
      <div class="result-count" id="result-count" style="display:none;"></div>
      <div id="results-list"></div>
    </div>
    <button class="fab" onclick="showAdd()">＋</button>
  </div>

  <!-- 新規追加ビュー -->
  <div class="view" id="view-add" style="display:none;">
    <div class="header">
      <button class="btn-back" onclick="showSearch()">‹</button>
      <h1>新規社員追加</h1>
    </div>
    <div class="scroll-area">
      <div class="fcard">
        <div class="fcard-title">基本情報</div>
        <div class="field"><label>氏名<span class="req">*</span></label><input type="text" id="a-name" placeholder="板橋 一郎"></div>
        <div class="field"><label>ふりがな</label><input type="text" id="a-kana" placeholder="いたばし いちろう"></div>
        <div class="field"><label>社員番号<span class="req">*</span></label><input type="text" id="a-empno" placeholder="12345" inputmode="numeric"></div>
      </div>
      <div class="fcard">
        <div class="fcard-title">所属</div>
        <div class="grid2">
          <div class="field" style="margin-bottom:0;"><label>課<span class="req">*</span></label><input type="number" id="a-div" placeholder="3" min="1"></div>
          <div class="field" style="margin-bottom:0;"><label>班<span class="req">*</span></label><input type="number" id="a-team" placeholder="6" min="1"></div>
        </div>
      </div>
      <div class="fcard">
        <div class="fcard-title">勤務情報</div>
        <div class="field"><label>勤務体系</label><input type="text" id="a-sched" placeholder="例: 日勤、夜勤"></div>
        <div class="field"><label>出勤時間</label><input type="time" id="a-start"></div>
        <div class="field" style="margin-bottom:0;"><label>担当車番</label><input type="text" id="a-car" placeholder="5232" inputmode="numeric"></div>
      </div>
      <div class="fcard">
        <div class="fcard-title">連絡先・入社</div>
        <div class="field"><label>電話番号</label><input type="tel" id="a-phone" placeholder="090-0000-0000" inputmode="tel"></div>
        <div class="field" style="margin-bottom:0;"><label>入社日</label><input type="date" id="a-hire"></div>
      </div>
      <button class="btn-primary" id="btn-add" onclick="submitAdd()">追加する</button>
    </div>
  </div>

  <!-- ボトムシート -->
  <div id="sheet-overlay" onclick="closeSheet()"></div>
  <div id="bottom-sheet">
    <div class="sh-handle"></div>

    <!-- 詳細パネル -->
    <div id="panel-detail">
      <div class="sh-head">
        <div class="sh-name" id="s-name"></div>
        <div class="sh-kana" id="s-kana"></div>
        <div class="sh-badges" id="s-badges"></div>
      </div>
      <div class="sh-body" id="s-body"></div>
      <div class="sh-foot">
        <button class="btn-sheet-close" onclick="closeSheet()">閉じる</button>
        <button class="btn-edit" onclick="showEdit()">編集</button>
        <button class="btn-retire" onclick="showRetire()">退職処理</button>
      </div>
    </div>

    <!-- 編集パネル -->
    <div id="panel-edit">
      <div class="sh-head">
        <div style="font-size:12px;color:#6b7280;margin-bottom:2px;">編集中</div>
        <div class="sh-name" id="e-label"></div>
      </div>
      <div class="edit-scroll">
        <div class="fcard">
          <div class="fcard-title">基本情報</div>
          <div class="field"><label>氏名<span class="req">*</span></label><input type="text" id="e-name"></div>
          <div class="field" style="margin-bottom:0;"><label>ふりがな</label><input type="text" id="e-kana"></div>
        </div>
        <div class="fcard">
          <div class="fcard-title">所属</div>
          <div class="grid2">
            <div class="field" style="margin-bottom:0;"><label>課</label><input type="number" id="e-div" min="1"></div>
            <div class="field" style="margin-bottom:0;"><label>班</label><input type="number" id="e-team" min="1"></div>
          </div>
        </div>
        <div class="fcard">
          <div class="fcard-title">勤務情報</div>
          <div class="field"><label>勤務体系</label><input type="text" id="e-sched" placeholder="例: 日勤、夜勤"></div>
          <div class="field"><label>出勤時間</label><input type="time" id="e-start"></div>
          <div class="field" style="margin-bottom:0;"><label>担当車番</label><input type="text" id="e-car" inputmode="numeric"></div>
        </div>
        <div class="fcard">
          <div class="fcard-title">連絡先・入社</div>
          <div class="field"><label>電話番号</label><input type="tel" id="e-phone" inputmode="tel"></div>
          <div class="field" style="margin-bottom:0;"><label>入社日</label><input type="date" id="e-hire"></div>
        </div>
        <div class="fcard" style="display:flex;align-items:center;gap:12px;">
          <input type="checkbox" id="e-hanchyo" style="width:22px;height:22px;accent-color:#4f46e5;flex-shrink:0;">
          <label for="e-hanchyo" style="font-size:15px;cursor:pointer;font-weight:500;">班長</label>
        </div>
      </div>
      <div class="ret-foot">
        <button class="btn-cancel" onclick="backFromEdit()">戻る</button>
        <button class="btn-save" id="btn-save" onclick="saveEdit()">保存する</button>
      </div>
    </div>

    <!-- 退職確認パネル -->
    <div id="panel-retire">
      <div class="ret-body">
        <div class="ret-warn">
          <div class="ret-warn-name" id="r-name"></div>
          <div class="ret-warn-text">この社員を退職処理します。元に戻せません。</div>
        </div>
        <div class="field"><label>退職日<span class="req">*</span></label><input type="date" id="retire-date"></div>
      </div>
      <div class="ret-foot">
        <button class="btn-cancel" onclick="backToDetail()">戻る</button>
        <button class="btn-exec" id="btn-exec" onclick="execRetire()">実行する</button>
      </div>
    </div>
  </div>

  <script>
  var AT = '';
  var _list = [];
  var _cur = null;
  var _timer = null;
  var _division = null;
  var _team = null;
  var _divCounts = {};
  var _allMode = false;

  // iOS: キーボード表示時にビジュアルビューポートがずれてページが左に流れたまま戻らなくなる対策
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function(){ window.scrollTo(0, 0); });
    window.visualViewport.addEventListener('scroll', function(){ window.scrollTo(0, 0); });
  }

  liff.init({ liffId: ${JSON.stringify(liffId || 'LIFF_ID_NOT_SET')} })
    .then(function() {
      AT = liff.getAccessToken() || '';
      document.getElementById('loading').style.display = 'none';
      document.getElementById('view-division').style.display = 'flex';
      document.getElementById('view-search').style.display = 'flex';
      document.getElementById('view-add').style.display = 'flex';
      var t = new Date(), yyyy = t.getFullYear(), mm = String(t.getMonth()+1).padStart(2,'0'), dd = String(t.getDate()).padStart(2,'0'), today = yyyy+'-'+mm+'-'+dd;
      document.getElementById('retire-date').value = today;
      document.getElementById('a-hire').value = today;
      loadDivisionCounts();
    })
    .catch(function(e) { document.getElementById('loading').textContent = 'エラー: '+e.message; });

  /* 課選択 */
  function loadDivisionCounts() {
    fetch('/api/liff/staff-lookup/divisions', { headers: { Authorization: 'Bearer '+AT } })
    .then(function(r){ return r.json(); })
    .then(function(d){
      _divCounts = {};
      (d||[]).forEach(function(row){ _divCounts[row.division] = row.cnt; });
      renderDivisionGrid();
    })
    .catch(function(){ renderDivisionGrid(); });
  }
  function renderDivisionGrid() {
    var el = document.getElementById('div-grid');
    el.innerHTML = [1,2,3,4].map(function(n){
      var cnt = _divCounts[n];
      return '<div class="div-card" onclick="selectDivision('+n+')">'
        +'<div class="div-card-num">'+n+'課</div>'
        +'<div class="div-card-label">を見る</div>'
        +(cnt!=null?'<div class="div-card-cnt">'+cnt+'名</div>':'')
        +'</div>';
    }).join('');
  }
  function selectDivision(n) {
    _division = n;
    _team = null;
    _allMode = false;
    document.getElementById('search-title').textContent = n+'課の社員照会＋';
    document.getElementById('div-badge-btn').textContent = '課を変更';
    document.getElementById('view-division').classList.add('slide-out');
    document.getElementById('view-search').classList.add('slide-in');
    document.getElementById('search-input').value = '';
    document.getElementById('clear-btn').style.display = 'none';
    renderTeamChips();
    doSearch('');
    setTimeout(function(){ document.getElementById('search-input').focus(); }, 300);
  }
  function selectAllDivisions() {
    _division = null;
    _team = null;
    _allMode = true;
    document.getElementById('search-title').textContent = '全課の社員照会＋';
    document.getElementById('div-badge-btn').textContent = '課で絞り込む';
    document.getElementById('view-division').classList.add('slide-out');
    document.getElementById('view-search').classList.add('slide-in');
    document.getElementById('search-input').value = '';
    document.getElementById('clear-btn').style.display = 'none';
    document.getElementById('team-chips').innerHTML = '';
    document.getElementById('team-chips').style.display = 'none';
    doSearch('');
    setTimeout(function(){ document.getElementById('search-input').focus(); }, 300);
  }
  function showDivision() {
    document.getElementById('view-division').classList.remove('slide-out');
    document.getElementById('view-search').classList.remove('slide-in');
  }

  /* 班チップ（社内の班番号は自由入力運用のため、結果に出てきた班から動的に生成） */
  function renderTeamChips() {
    var teams = [];
    _list.forEach(function(e){ if(e.team && teams.indexOf(e.team)===-1) teams.push(e.team); });
    teams.sort(function(a,b){ return a-b; });
    var el = document.getElementById('team-chips');
    if (!teams.length) { el.innerHTML=''; el.style.display='none'; return; }
    el.style.display='flex';
    var chips = ['<button class="team-chip'+(_team===null?' active':'')+'" onclick="selectTeam(null)">全班</button>'];
    teams.forEach(function(t){
      chips.push('<button class="team-chip'+(_team===t?' active':'')+'" onclick="selectTeam('+t+')">'+t+'班</button>');
    });
    el.innerHTML = chips.join('');
  }
  function selectTeam(t) {
    _team = t;
    doSearch(document.getElementById('search-input').value.trim());
  }

  /* ビュー切替（追加フォーム） */
  function showAdd() {
    document.getElementById('a-div').value = _division || '';
    document.getElementById('view-search').classList.add('slide-out-add');
    document.getElementById('view-add').classList.add('slide-in');
  }
  function showSearch() {
    document.getElementById('view-search').classList.remove('slide-out-add');
    document.getElementById('view-add').classList.remove('slide-in');
  }

  /* 検索（ひらがな入力は自動でカタカナに変換してから検索する。ふりがなはDB上カタカナ管理のため） */
  function toKatakana(s) {
    return s.replace(/[ぁ-ゖ]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) + 0x60); });
  }
  var _searchInputEl = document.getElementById('search-input');
  // 画面上のテキストは書き換えない（IME変換中に値を書き換えると変換内容が壊れるため）。
  // カタカナ変換は検索クエリを組み立てる時にだけ裏側で行う。
  _searchInputEl.addEventListener('input', onSearchInput);
  function onSearchInput() {
    var el = _searchInputEl;
    document.getElementById('clear-btn').style.display = el.value ? 'block' : 'none';
    clearTimeout(_timer);
    var q = toKatakana(el.value.trim());
    _timer = setTimeout(function() { doSearch(q); }, 280);
  }
  function clearSearch() {
    document.getElementById('search-input').value = '';
    document.getElementById('clear-btn').style.display = 'none';
    doSearch('');
  }
  function doSearch(q) {
    if (!_division && !_allMode) return;
    // 全課モードはキーワードなしだと対象が広すぎるため、絞り込み前はヒントを出すだけにする
    if (_allMode && !q) {
      document.getElementById('hint').style.display = 'block';
      document.getElementById('result-count').style.display = 'none';
      document.getElementById('results-list').innerHTML = '';
      _list = [];
      return;
    }
    document.getElementById('hint').style.display = 'none';
    var url = _division
      ? '/api/liff/staff-lookup?division='+_division+(_team?'&team='+_team:'')+(q?'&q='+encodeURIComponent(q):'')
      : '/api/liff/staff-lookup?q='+encodeURIComponent(q);
    fetch(url, { headers: { Authorization: 'Bearer '+AT } })
    .then(function(r){ return r.json(); }).then(function(d){
      _list=d||[];
      // 班チップは絞り込み前の課全体のリストから作りたいので、課選択時・班未指定・キーワードなしの時だけ再構築
      if (_division && !_team && !q) renderTeamChips();
      renderList(_list);
    })
    .catch(function(){ document.getElementById('results-list').innerHTML='<div class="no-results">通信エラー</div>'; });
  }
  function renderList(list) {
    var cnt = document.getElementById('result-count'), el = document.getElementById('results-list');
    if (!list.length) { cnt.style.display='none'; el.innerHTML='<div class="no-results">該当する社員が見つかりませんでした</div>'; return; }
    cnt.style.display='block'; cnt.textContent=list.length+'件'+(list.length>=100?'（上位100件）':(list.length>=30?'（上位30件）':''));
    el.innerHTML = list.map(function(e,i){
      var div=e.division?e.division+'課':'', team=e.team?e.team+'班':'', loc=(div+team)||'所属未設定';
      return '<div class="emp-card" onclick="openDetail('+i+')">'
        +'<div class="emp-avatar">'+ini(e.name)+'</div>'
        +'<div style="flex:1;min-width:0;">'
        +'<div class="emp-name">'+esc(e.name)+'</div>'
        +(e.name_kana?'<div class="emp-kana">'+esc(e.name_kana)+'</div>':'')
        +'<div class="emp-sub"><span class="badge bdg-div">'+loc+'</span><span class="badge bdg-no">No.'+esc(e.emp_no)+'</span>'+(e.is_hanchyo?'<span class="badge bdg-hanchyo">班長</span>':'')+(e.work_schedule?'<span class="badge bdg-sched">'+esc(e.work_schedule)+'</span>':'')+'</div>'
        +(e.start_time?'<div class="emp-start">出勤 '+esc(e.start_time)+'</div>':'')
        +'</div><div style="color:#d1d5db;font-size:14px;">›</div></div>';
    }).join('');
  }

  /* 詳細シート */
  function openDetail(i) {
    var e=_list[i]; if(!e) return;
    _cur=e;
    var div=e.division?e.division+'課':'', team=e.team?e.team+'班':'';
    document.getElementById('s-name').textContent=e.name;
    document.getElementById('s-kana').textContent=e.name_kana||'';
    var b=''; if(div||team) b+='<span class="badge bdg-div">'+(div+team)+'</span>'; if(e.is_hanchyo) b+='<span class="badge bdg-hanchyo">班長</span>';
    document.getElementById('s-badges').innerHTML=b;
    function row(l,v,ph){ var d=v?esc(String(v)):'<span class="dv empty">—</span>'; if(ph&&v) d='<a href="tel:'+esc(v)+'" style="color:#2563eb;font-weight:600;text-decoration:none;">'+esc(v)+'</a>'; return '<div class="dr"><span class="dl">'+l+'</span><span class="dv">'+d+'</span></div>'; }
    document.getElementById('s-body').innerHTML=
      '<div class="ds"><div class="ds-title">基本情報</div>'+row('社員番号',e.emp_no)+row('氏名',e.name)+row('ふりがな',e.name_kana)+row('課・班',(div+team)||null)+row('班長',e.is_hanchyo?'はい':null)+'</div>'
      +'<div class="ds"><div class="ds-title">勤務情報</div>'+row('勤務体系',e.work_schedule)+row('出勤時間',e.start_time)+row('担当車番',e.car_no)+'</div>'
      +'<div class="ds"><div class="ds-title">在籍情報</div>'+row('在籍状態',e.enrollment_status)+row('入社日',e.hire_date)+row('退職予定日',e.retirement_date)+'</div>'
      +'<div class="ds"><div class="ds-title">連絡先</div>'+row('電話番号',e.phone,true)+'</div>';
    document.getElementById('panel-detail').classList.remove('hidden');
    document.getElementById('panel-retire').classList.remove('open');
    document.getElementById('sheet-overlay').classList.add('open');
    document.getElementById('bottom-sheet').classList.add('open');
    document.body.style.overflow='hidden';
  }
  function closeSheet() {
    document.getElementById('sheet-overlay').className='';
    document.getElementById('bottom-sheet').className='';
    document.body.style.overflow='';
    _cur=null;
  }

  /* 編集 */
  function showEdit() {
    if (!_cur) return;
    document.getElementById('e-label').textContent = _cur.name;
    document.getElementById('e-name').value = _cur.name || '';
    document.getElementById('e-kana').value = _cur.name_kana || '';
    document.getElementById('e-div').value = _cur.division || '';
    document.getElementById('e-team').value = _cur.team || '';
    document.getElementById('e-sched').value = _cur.work_schedule || '';
    document.getElementById('e-start').value = _cur.start_time || '';
    document.getElementById('e-car').value = _cur.car_no || '';
    document.getElementById('e-phone').value = _cur.phone || '';
    document.getElementById('e-hire').value = _cur.hire_date || '';
    document.getElementById('e-hanchyo').checked = !!_cur.is_hanchyo;
    document.getElementById('panel-detail').classList.add('hidden');
    document.getElementById('panel-edit').classList.add('open');
  }
  function backFromEdit() {
    document.getElementById('panel-detail').classList.remove('hidden');
    document.getElementById('panel-edit').classList.remove('open');
  }
  function saveEdit() {
    if (!_cur) return;
    var name = document.getElementById('e-name').value.trim();
    if (!name) { alert('氏名は必須です'); return; }
    var btn = document.getElementById('btn-save'); btn.disabled = true; btn.textContent = '保存中...';
    fetch('/api/liff/staff-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AT },
      body: JSON.stringify({
        id: _cur.id, name: name,
        name_kana: document.getElementById('e-kana').value.trim() || null,
        division: parseInt(document.getElementById('e-div').value, 10) || null,
        team: parseInt(document.getElementById('e-team').value, 10) || null,
        work_schedule: document.getElementById('e-sched').value.trim() || null,
        start_time: document.getElementById('e-start').value || null,
        car_no: document.getElementById('e-car').value.trim() || null,
        phone: document.getElementById('e-phone').value.trim() || null,
        hire_date: document.getElementById('e-hire').value || null,
        is_hanchyo: document.getElementById('e-hanchyo').checked ? 1 : 0,
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      btn.disabled = false; btn.textContent = '保存する';
      if (data.ok) {
        Object.assign(_cur, data.updated);
        // 課を変更された場合は現在の絞り込みビューから外れるため再検索
        backFromEdit();
        closeSheet();
        doSearch(document.getElementById('search-input').value.trim());
      } else { alert('エラー: ' + (data.error || '不明')); }
    })
    .catch(function() { btn.disabled = false; btn.textContent = '保存する'; alert('通信エラー'); });
  }

  /* 退職処理 */
  function showRetire() {
    if(!_cur) return;
    document.getElementById('r-name').textContent=_cur.name;
    document.getElementById('panel-detail').classList.add('hidden');
    document.getElementById('panel-retire').classList.add('open');
  }
  function backToDetail() {
    document.getElementById('panel-detail').classList.remove('hidden');
    document.getElementById('panel-retire').classList.remove('open');
  }
  function execRetire() {
    if(!_cur) return;
    var d=document.getElementById('retire-date').value;
    if(!d){ alert('退職日を入力してください'); return; }
    var btn=document.getElementById('btn-exec'); btn.disabled=true; btn.textContent='処理中...';
    fetch('/api/liff/staff-retire',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+AT }, body:JSON.stringify({ id:_cur.id, retirement_date:d }) })
    .then(function(r){ return r.json(); }).then(function(data){
      if(data.ok){ var n=_cur.name; closeSheet(); alert(n+' の退職処理が完了しました'); doSearch(document.getElementById('search-input').value.trim()); loadDivisionCounts(); }
      else { btn.disabled=false; btn.textContent='実行する'; alert('エラー: '+(data.error||'不明')); }
    }).catch(function(){ btn.disabled=false; btn.textContent='実行する'; alert('通信エラー'); });
  }

  /* 新規追加 */
  function submitAdd() {
    var name=document.getElementById('a-name').value.trim(), empno=document.getElementById('a-empno').value.trim();
    var div=parseInt(document.getElementById('a-div').value,10), team=parseInt(document.getElementById('a-team').value,10);
    if(!name||!empno||!div||!team){ alert('氏名・社員番号・課・班は必須です'); return; }
    var btn=document.getElementById('btn-add'); btn.disabled=true; btn.textContent='追加中...';
    fetch('/api/liff/staff-add',{ method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer '+AT }, body:JSON.stringify({
      name:name, name_kana:document.getElementById('a-kana').value.trim()||null, emp_no:empno, division:div, team:team,
      work_schedule:document.getElementById('a-sched').value.trim()||null, start_time:document.getElementById('a-start').value||null,
      car_no:document.getElementById('a-car').value.trim()||null, phone:document.getElementById('a-phone').value.trim()||null,
      hire_date:document.getElementById('a-hire').value||null
    }) })
    .then(function(r){ return r.json(); }).then(function(data){
      btn.disabled=false; btn.textContent='追加する';
      if(data.ok){ ['a-name','a-kana','a-empno','a-sched','a-start','a-car','a-phone','a-div','a-team'].forEach(function(id){ document.getElementById(id).value=''; }); showSearch(); alert(name+' を追加しました'); loadDivisionCounts(); if(div===_division) doSearch(document.getElementById('search-input').value.trim()); }
      else { alert('エラー: '+(data.error||'不明')); }
    }).catch(function(){ btn.disabled=false; btn.textContent='追加する'; alert('通信エラー'); });
  }

  function ini(n){ return n?n.charAt(0):'?'; }
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  </script>
</body>
</html>`;
}

// 曜日ごとの示達事項（getDay(): 0=日 … 6=土）
const WEEKLY_NOTICES: { day: string; items: string[] }[] = [
  { day: '日', items: ['他県ナンバー注意　ゆずりあい運転を', '忘れ物防止　降車時は一声かけて一目見る'] },
  { day: '月', items: ['目視で確認　急な動作をしない', '乗車拒否と苦情の絶無'] },
  { day: '火', items: ['適切な休憩をとる', '無線をとって了解率向上'] },
  { day: '水', items: ['車間距離は十分に　スピードは控えめに', '正しい回送表示'] },
  { day: '木', items: ['後車に対する思いやり　静かに停止', '料金メーターは正しく　操作再度の確認'] },
  { day: '金', items: ['交差点に注意　近づいたらアクセルからブレーキに', '乗禁ルールの徹底'] },
  { day: '土', items: ['だろう運転をしない　かもしれない運転を', '大きな声で明るい挨拶　行先コースの確認'] },
];

function liffOtherFeaturesPage(liffId: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>その他機能</title>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { margin: 0; padding: 0; background: #f0f4f8; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; font-size: 15px; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: #6b7280; font-size: 14px; }
    .page { max-width: 520px; margin: 0 auto; padding: 16px 16px 40px; }
    .header { background: #0f766e; color: white; padding: 14px 16px; border-radius: 12px; margin-bottom: 16px; }
    .header h1 { margin: 0; font-size: 17px; font-weight: 700; }
    .card { background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card-title { font-size: 13px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; }
    .notice-day { display: inline-block; font-size: 13px; font-weight: 700; color: #0f766e; background: #ccfbf1; border-radius: 6px; padding: 2px 10px; margin-bottom: 8px; }
    .notice-item { font-size: 14.5px; color: #111827; line-height: 1.6; margin-bottom: 4px; }
    .notice-item:last-child { margin-bottom: 0; }
    .btn-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .feature-btn { background: white; border: none; border-radius: 12px; padding: 20px 8px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08); cursor: pointer; }
    .feature-btn .icon { font-size: 26px; margin-bottom: 8px; }
    .feature-btn .label { font-size: 13px; font-weight: 700; color: #1f2937; }
    .sub-header { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
    .btn-back { background: none; border: none; color: #0f766e; font-size: 14px; font-weight: 600; cursor: pointer; padding: 4px 0; }
    .office-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 4px; border-bottom: 1px solid #f3f4f6; }
    .office-row:last-child { border-bottom: none; }
    .office-name { font-size: 14.5px; color: #111827; font-weight: 600; }
    .office-call { color: #0f766e; font-size: 14px; font-weight: 700; text-decoration: none; }
    .empty-note { color: #6b7280; font-size: 13px; text-align: center; padding: 24px 8px; }
    .soon-note { color: #6b7280; font-size: 14px; text-align: center; padding: 32px 8px; line-height: 1.7; }

    .segment { display: flex; background: #e5e7eb; border-radius: 10px; padding: 3px; margin-bottom: 16px; }
    .segment button { flex: 1; border: none; background: transparent; padding: 10px 0; border-radius: 8px; font-size: 14px; font-weight: 700; color: #6b7280; cursor: pointer; }
    .segment button.active { background: white; color: #111827; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
    .btn-icon { background: none; border: none; font-size: 20px; color: #0f766e; cursor: pointer; padding: 4px 8px; margin-left: auto; }
    .picker-wrap { display: flex; align-items: center; justify-content: center; gap: 6px; position: relative; height: 180px; margin-bottom: 14px; }
    .picker-highlight { position: absolute; left: 8px; right: 8px; top: 72px; height: 36px; background: rgba(15,118,110,0.08); border-top: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db; pointer-events: none; border-radius: 6px; }
    .picker-col { width: 70px; height: 180px; overflow-y: scroll; scroll-snap-type: y mandatory; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
    .picker-col::-webkit-scrollbar { display: none; }
    .picker-item { height: 36px; line-height: 36px; text-align: center; font-size: 18px; color: #9ca3af; scroll-snap-align: center; font-variant-numeric: tabular-nums; }
    .picker-item.selected { color: #111827; font-weight: 700; font-size: 20px; }
    .picker-sep { font-size: 20px; font-weight: 700; color: #111827; }
    .btn-now { display: block; width: 100%; background: #0f766e; color: white; border: none; border-radius: 8px; padding: 10px; font-size: 14px; font-weight: 700; cursor: pointer; }
    .result-card { border-radius: 12px; padding: 16px; margin-bottom: 12px; color: white; }
    .result-card .result-label { font-size: 12.5px; font-weight: 700; opacity: 0.9; margin-bottom: 4px; }
    .result-card .result-value { font-size: 30px; font-weight: 800; letter-spacing: 0.02em; }
    .result-card .result-note { font-size: 12px; opacity: 0.9; margin-top: 6px; line-height: 1.5; }
    .result-teal { background: linear-gradient(135deg,#0f766e,#14b8a6); }
    .result-indigo { background: linear-gradient(135deg,#4338ca,#6366f1); }
    .result-orange { background: linear-gradient(135deg,#c2410c,#f97316); }
    .result-pink { background: linear-gradient(135deg,#be185d,#ec4899); }
    .hint-text { font-size: 12px; color: #6b7280; text-align: center; line-height: 1.6; margin-top: 4px; }
  </style>
</head>
<body>
  <div id="loading">読み込み中...</div>
  <div id="app" style="display:none;">

    <!-- メイン画面 -->
    <div class="page" id="view-main">
      <div class="header"><h1>その他機能</h1></div>

      <div class="card">
        <div class="card-title">本日の示達事項</div>
        <div class="notice-day" id="notice-day"></div>
        <div id="notice-items"></div>
      </div>

      <div class="btn-grid">
        <button class="feature-btn" onclick="showOffices()">
          <div class="icon">📞</div>
          <div class="label">電話番号一覧</div>
        </button>
        <button class="feature-btn" onclick="showTimeCalc()">
          <div class="icon">⏱️</div>
          <div class="label">時間計算</div>
        </button>
      </div>
    </div>

    <!-- 電話番号一覧 -->
    <div class="page" id="view-offices" style="display:none;">
      <div class="sub-header">
        <button class="btn-back" onclick="showMain()">← 戻る</button>
      </div>
      <div class="card">
        <div class="card-title">電話番号一覧</div>
        <div id="office-list"></div>
      </div>
    </div>

    <!-- 時間計算 -->
    <div class="page" id="view-timecalc" style="display:none;">
      <div class="sub-header">
        <button class="btn-back" onclick="showMain()">← 戻る</button>
        <button class="btn-icon" onclick="tcResetToNow()" title="現在時刻にリセット">↻</button>
      </div>
      <div class="card">
        <div class="segment" id="tc-segment">
          <button class="active" data-type="day" onclick="tcSelectType('day')">日勤</button>
          <button data-type="sequential" onclick="tcSelectType('sequential')">隔日勤務</button>
        </div>

        <div class="picker-wrap">
          <div class="picker-highlight"></div>
          <div class="picker-col" id="tc-hour"></div>
          <div class="picker-sep">:</div>
          <div class="picker-col" id="tc-minute"></div>
        </div>

        <button class="btn-now" onclick="tcResetToNow()">現在時刻</button>
      </div>

      <div class="result-card result-teal" id="tc-card-teiji">
        <div class="result-label">定時帰庫時間</div>
        <div class="result-value" id="tc-teiji">--:--</div>
      </div>
      <div class="result-card result-orange">
        <div class="result-label">アルコール検査リミット</div>
        <div class="result-value" id="tc-alcohol">--:--</div>
        <div class="result-note">この時間までにアルコール検査を実施してください</div>
      </div>
      <div class="result-card result-pink">
        <div class="result-label">最大帰庫時間（MAX）</div>
        <div class="result-value" id="tc-max">--:--</div>
      </div>

      <div class="hint-text">日付をまたぐ場合は先頭に「翌」を表示します</div>
    </div>
  </div>

  <script>
  var LIFF_ACCESS_TOKEN = '';
  var WEEKLY_NOTICES = ${JSON.stringify(WEEKLY_NOTICES)};
  var TC_ITEM_H = 36;
  var tcInitialized = false;
  var tcHour = 0, tcMinute = 0;
  var tcWorkType = 'day';
  var tcScrollTimers = {};

  liff.init({ liffId: ${JSON.stringify(liffId || 'LIFF_ID_NOT_SET')} })
    .then(function() {
      LIFF_ACCESS_TOKEN = liff.getAccessToken() || '';
      document.getElementById('loading').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      renderNotice();
    })
    .catch(function(err) {
      document.getElementById('loading').textContent = 'エラー: ' + err.message;
    });

  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function renderNotice() {
    var notice = WEEKLY_NOTICES[new Date().getDay()];
    document.getElementById('notice-day').textContent = notice.day + '曜日';
    document.getElementById('notice-items').innerHTML = notice.items.map(function(t, i) {
      return '<div class="notice-item">' + (i + 1) + '. ' + esc(t) + '</div>';
    }).join('');
  }

  function showMain() {
    document.getElementById('view-main').style.display = 'block';
    document.getElementById('view-offices').style.display = 'none';
    document.getElementById('view-timecalc').style.display = 'none';
  }

  function showTimeCalc() {
    document.getElementById('view-main').style.display = 'none';
    document.getElementById('view-timecalc').style.display = 'block';
    if (!tcInitialized) { tcInitialized = true; tcInit(); }
  }

  function tcBuildPicker(id, count) {
    var el = document.getElementById(id);
    var html = '<div style="height:' + (TC_ITEM_H * 2) + 'px;"></div>';
    for (var i = 0; i < count; i++) {
      html += '<div class="picker-item" data-val="' + i + '">' + (i < 10 ? '0' + i : i) + '</div>';
    }
    html += '<div style="height:' + (TC_ITEM_H * 2) + 'px;"></div>';
    el.innerHTML = html;
    el.addEventListener('scroll', function() {
      clearTimeout(tcScrollTimers[id]);
      tcScrollTimers[id] = setTimeout(function() { tcOnScrollSettle(id, count); }, 120);
    });
  }

  function tcOnScrollSettle(id, count) {
    var el = document.getElementById(id);
    var idx = Math.round(el.scrollTop / TC_ITEM_H);
    if (idx < 0) idx = 0;
    if (idx > count - 1) idx = count - 1;
    el.scrollTo({ top: idx * TC_ITEM_H, behavior: 'auto' });
    if (id === 'tc-hour') tcHour = idx; else tcMinute = idx;
    tcRenderSelected(id, idx);
    tcCompute();
  }

  function tcRenderSelected(id, idx) {
    var el = document.getElementById(id);
    var items = el.querySelectorAll('.picker-item');
    for (var i = 0; i < items.length; i++) { items[i].classList.remove('selected'); }
    if (items[idx]) items[idx].classList.add('selected');
  }

  function tcScrollTo(id, idx, smooth) {
    var el = document.getElementById(id);
    el.scrollTo({ top: idx * TC_ITEM_H, behavior: smooth ? 'smooth' : 'auto' });
    tcRenderSelected(id, idx);
  }

  function tcSelectType(type) {
    tcWorkType = type;
    var buttons = document.querySelectorAll('#tc-segment button');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle('active', buttons[i].getAttribute('data-type') === type);
    }
    document.getElementById('tc-card-teiji').className = 'result-card ' + (type === 'day' ? 'result-teal' : 'result-indigo');
    tcCompute();
  }

  function tcResetToNow() {
    var now = new Date();
    tcHour = now.getHours();
    tcMinute = now.getMinutes();
    tcScrollTo('tc-hour', tcHour, true);
    tcScrollTo('tc-minute', tcMinute, true);
    tcCompute();
  }

  function tcFmt(totalMinutes) {
    var dayOffset = Math.floor(totalMinutes / 1440);
    var m = ((totalMinutes % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60);
    var mm = m % 60;
    var hh = (h < 10 ? '0' + h : h) + ':' + (mm < 10 ? '0' + mm : mm);
    return (dayOffset >= 1 ? '翌 ' : '') + hh;
  }

  function tcCompute() {
    var base = tcHour * 60 + tcMinute;
    var conf = tcWorkType === 'day' ? { teiji: 525, max: 750 } : { teiji: 1050, max: 1200 };
    var teiji = base + conf.teiji;
    var max = base + conf.max;
    var alcohol = max - 5;
    document.getElementById('tc-teiji').textContent = tcFmt(teiji);
    document.getElementById('tc-max').textContent = tcFmt(max);
    document.getElementById('tc-alcohol').textContent = tcFmt(alcohol);
  }

  function tcInit() {
    tcBuildPicker('tc-hour', 24);
    tcBuildPicker('tc-minute', 60);
    var now = new Date();
    tcHour = now.getHours();
    tcMinute = now.getMinutes();
    tcScrollTo('tc-hour', tcHour, false);
    tcScrollTo('tc-minute', tcMinute, false);
    tcCompute();
  }

  function showOffices() {
    document.getElementById('view-main').style.display = 'none';
    document.getElementById('view-offices').style.display = 'block';
    var list = document.getElementById('office-list');
    list.innerHTML = '<div class="empty-note">読み込み中...</div>';
    fetch('/api/liff/offices', { headers: { 'Authorization': 'Bearer ' + LIFF_ACCESS_TOKEN } })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data || data.length === 0) { list.innerHTML = '<div class="empty-note">登録されている連絡先がありません</div>'; return; }
        list.innerHTML = data.map(function(o) {
          return '<div class="office-row"><div class="office-name">' + esc(o.short_name) + '</div>'
            + '<a class="office-call" href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a></div>';
        }).join('');
      })
      .catch(function() { list.innerHTML = '<div class="empty-note">読み込みに失敗しました</div>'; });
  }
  </script>
</body>
</html>`;
}

export default app;
