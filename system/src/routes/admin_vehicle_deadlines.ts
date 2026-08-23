// メーター検査（仮検査/本検査）・車検管理のAPI
// ページ本体は「点検管理」(/inspection, admin_inspection.ts)の中の2タブとして表示される（このファイルはページを持たない）
// 車両行はvehicle_teams(car_no, team 1-8)を正として自動反映する。team→課の対応は既存のinsTeamNum()/line_bot.tsと同じ:
//   ka = ceil(team/2)（1,2班=1課 / 3,4班=2課 / 5,6班=3課 / 7,8班=4課）
// 班番号(team)は課ごとに1-2へ振り直さず、会社全体の実際の番号(1-8)をそのまま表示・フィルタに使う
// 大画面アラート（10日前/5日前/前日で表示、課ベースで絞り込み）: /api/vehicle-deadlines/alerts/*
//   ページ権限に依存せず全アカウントが使える（index.tsでバイパス設定。引き継ぎリミットの/api/limits/と同じ扱い）
import { Hono } from 'hono';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

function isValidDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// ka(1-4)+team(実際の班番号1-8、省略可)から対象team範囲を返す。ka='all'または不正値はnull（絞り込みなし）
// 班番号は課ごとに1-2へ振り直さず、会社全体の実際の番号(1-8)をそのまま使う（例: 2課の班は3班・4班）
function teamRangeFromQuery(ka: string | undefined, team: string | undefined): [number, number] | null {
  if (!ka || !/^[1-4]$/.test(ka)) return null;
  const kaNum = parseInt(ka, 10);
  const lo = (kaNum - 1) * 2 + 1;
  const hi = (kaNum - 1) * 2 + 2;
  if (team && /^[1-8]$/.test(team)) {
    const t = parseInt(team, 10);
    if (t === lo || t === hi) return [t, t];
  }
  return [lo, hi];
}

// ===== 社員検索（担当者オートコンプリート用） =====

app.get('/api/vehicle-deadlines/search-employees', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 40);
  if (!q) return c.json([]);
  const rows = await c.env.DB.prepare(
    `SELECT id, name, emp_no, division, team FROM employees
     WHERE is_active = 1 AND (name LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)
     ORDER BY division, team, seq_no LIMIT 20`
  ).bind(`%${q}%`, `%${q}%`, `%${q}%`).all<{ id: number; name: string; emp_no: string; division: number | null; team: number | null }>();
  return c.json(rows.results ?? []);
});

// ===== メーター検査 =====

type MeterRow = {
  car_no: string; team: number;
  tentative_limit: string | null; tentative_assignee_id: number | null; tentative_assignee_name: string | null;
  honkensa_limit: string | null; honkensa_assignee_id: number | null; honkensa_assignee_name: string | null;
  registration_no: string | null; meter_device_no: string | null; prev_inspection_date: string | null;
  cert_no: string | null; inspection_date: string | null; update_kind: string | null; checker_name: string | null;
  initial_year: string | null; registration_date: string | null; confirmed_date: string | null; confirmed_type: string | null;
};

app.get('/api/vehicle-deadlines/meter', async (c) => {
  const range = teamRangeFromQuery(c.req.query('ka'), c.req.query('team'));
  const where = range ? 'WHERE vt.team BETWEEN ? AND ?' : '';
  const rows = await c.env.DB.prepare(
    `SELECT vt.car_no, vt.team,
       mi.tentative_limit, mi.tentative_assignee_id, mi.tentative_assignee_name,
       mi.honkensa_limit, mi.honkensa_assignee_id, mi.honkensa_assignee_name,
       mi.registration_no, mi.meter_device_no, mi.prev_inspection_date,
       mi.cert_no, mi.inspection_date, mi.update_kind, mi.checker_name,
       mi.initial_year, mi.registration_date, mi.confirmed_date, mi.confirmed_type
     FROM vehicle_teams vt
     LEFT JOIN meter_inspections mi ON mi.car_no = vt.car_no
     ${where}
     ORDER BY COALESCE(mi.tentative_limit, '9999-12-31') ASC, CAST(vt.car_no AS INTEGER) ASC`
  ).bind(...(range ?? [])).all<MeterRow>();

  const results = (rows.results ?? []).map(r => ({ ...r, ka: Math.ceil(r.team / 2) }));
  return c.json({ rows: results });
});

const METER_FIELDS = ['car_no', 'tentative_limit', 'tentative_assignee_id', 'tentative_assignee_name', 'honkensa_limit', 'honkensa_assignee_id', 'honkensa_assignee_name',
  'registration_no', 'meter_device_no', 'prev_inspection_date', 'cert_no', 'inspection_date', 'update_kind', 'checker_name',
  'initial_year', 'registration_date', 'confirmed_date', 'confirmed_type'] as const;
type MeterField = typeof METER_FIELDS[number];
const METER_DATE_FIELDS = new Set(['tentative_limit', 'honkensa_limit', 'prev_inspection_date', 'inspection_date', 'registration_date', 'confirmed_date']);
const METER_UPDATE_KIND_VALUES = new Set(['renewal', 'exchange', 'substitute']);
const METER_CONFIRMED_TYPE_VALUES = new Set(['3', '6', 'S', '車検', '代替']);
const METER_INITIAL_YEAR_RE = /^\d{4}-\d{2}$/;

app.put('/api/vehicle-deadlines/meter/:carNo', async (c) => {
  const carNo = c.req.param('carNo');
  const vehicle = await c.env.DB.prepare('SELECT 1 FROM vehicle_teams WHERE car_no = ?').bind(carNo).first();
  if (!vehicle) return c.json({ error: '存在しない車番です' }, 404);

  type MeterBody = Partial<Record<MeterField, string | number | null>>;
  const body = await c.req.json<MeterBody>().catch(() => ({}) as MeterBody);

  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  for (const field of METER_FIELDS) {
    if (field === 'car_no' || !(field in body)) continue;
    if (METER_DATE_FIELDS.has(field) && body[field] !== null && !isValidDate(body[field])) {
      return c.json({ error: '日付の形式が不正です' }, 400);
    }
    if (field === 'update_kind' && body[field] !== null && !METER_UPDATE_KIND_VALUES.has(String(body[field]))) {
      return c.json({ error: '更新種別の値が不正です' }, 400);
    }
    if (field === 'confirmed_type' && body[field] !== null && !METER_CONFIRMED_TYPE_VALUES.has(String(body[field]))) {
      return c.json({ error: '実施内容の値が不正です' }, 400);
    }
    if (field === 'initial_year' && body[field] !== null && !METER_INITIAL_YEAR_RE.test(String(body[field]))) {
      return c.json({ error: '初年度の形式が不正です' }, 400);
    }
    sets.push(`${field} = ?`);
    values.push(body[field] === undefined ? null : (body[field] as string | number | null));
  }
  if (!sets.length) return c.json({ error: '更新項目がありません' }, 400);

  await c.env.DB.prepare('INSERT OR IGNORE INTO meter_inspections (car_no) VALUES (?)').bind(carNo).run();
  await c.env.DB.prepare(
    `UPDATE meter_inspections SET ${sets.join(', ')}, updated_at = datetime('now','localtime') WHERE car_no = ?`
  ).bind(...values, carNo).run();
  return c.json({ ok: true });
});

// ===== 車検管理 =====

type ShakenRow = {
  car_no: string; team: number;
  shaken_date: string | null; shaken_limit: string | null; cert_exchange_limit: string | null;
};

app.get('/api/vehicle-deadlines/shaken', async (c) => {
  const range = teamRangeFromQuery(c.req.query('ka'), c.req.query('team'));
  const where = range ? 'WHERE vt.team BETWEEN ? AND ?' : '';
  const rows = await c.env.DB.prepare(
    `SELECT vt.car_no, vt.team, sr.shaken_date, sr.shaken_limit, sr.cert_exchange_limit
     FROM vehicle_teams vt
     LEFT JOIN shaken_records sr ON sr.car_no = vt.car_no
     ${where}
     ORDER BY MIN(COALESCE(sr.shaken_date,'9999-12-31'), COALESCE(sr.shaken_limit,'9999-12-31'), COALESCE(sr.cert_exchange_limit,'9999-12-31')) ASC,
       CAST(vt.car_no AS INTEGER) ASC`
  ).bind(...(range ?? [])).all<ShakenRow>();

  const results = (rows.results ?? []).map(r => ({ ...r, ka: Math.ceil(r.team / 2) }));
  return c.json({ rows: results });
});

const SHAKEN_FIELDS = ['car_no', 'shaken_date', 'shaken_limit', 'cert_exchange_limit'] as const;
type ShakenField = typeof SHAKEN_FIELDS[number];

app.put('/api/vehicle-deadlines/shaken/:carNo', async (c) => {
  const carNo = c.req.param('carNo');
  const vehicle = await c.env.DB.prepare('SELECT 1 FROM vehicle_teams WHERE car_no = ?').bind(carNo).first();
  if (!vehicle) return c.json({ error: '存在しない車番です' }, 404);

  type ShakenBody = Partial<Record<ShakenField, string | null>>;
  const body = await c.req.json<ShakenBody>().catch(() => ({}) as ShakenBody);

  const sets: string[] = [];
  const values: (string | null)[] = [];
  for (const field of SHAKEN_FIELDS) {
    if (field === 'car_no' || !(field in body)) continue;
    if (body[field] !== null && !isValidDate(body[field])) {
      return c.json({ error: '日付の形式が不正です' }, 400);
    }
    sets.push(`${field} = ?`);
    values.push(body[field] === undefined ? null : (body[field] as string | null));
  }
  if (!sets.length) return c.json({ error: '更新項目がありません' }, 400);

  await c.env.DB.prepare('INSERT OR IGNORE INTO shaken_records (car_no) VALUES (?)').bind(carNo).run();
  await c.env.DB.prepare(
    `UPDATE shaken_records SET ${sets.join(', ')}, updated_at = datetime('now','localtime') WHERE car_no = ?`
  ).bind(...values, carNo).run();
  return c.json({ ok: true });
});

// ===== 大画面アラート（グローバル通知。所属課だけで判定し、ページ権限は問わない） =====

type AlertRow = {
  car_no: string; team: number; source: string; field_label: string;
  limit_date: string; days_remaining: number;
};

const ALERT_THRESHOLD_DAYS = 10;

app.get('/api/vehicle-deadlines/alerts/pending', async (c) => {
  const admin = await c.env.DB.prepare('SELECT division FROM admins WHERE id = ?')
    .bind(c.get('adminId')).first<{ division: string | null }>();
  const myDivision = admin?.division ?? null;
  if (!myDivision) return c.json({ alerts: [] });

  const teamFilter = myDivision === 'all' ? '' : 'AND vt.team BETWEEN ? AND ?';
  const teamBind = myDivision === 'all' ? [] : (() => {
    const d = parseInt(myDivision, 10);
    return [(d - 1) * 2 + 1, (d - 1) * 2 + 2];
  })();

  const meterSql = `
    SELECT mi.car_no, vt.team, 'meter_tentative' AS source, '仮検査期限' AS field_label, mi.tentative_limit AS limit_date,
      CAST(julianday(mi.tentative_limit) - julianday(date('now','+9 hours')) AS INTEGER) AS days_remaining
    FROM meter_inspections mi JOIN vehicle_teams vt ON vt.car_no = mi.car_no
    WHERE mi.tentative_limit IS NOT NULL
      AND julianday(mi.tentative_limit) - julianday(date('now','+9 hours')) <= ${ALERT_THRESHOLD_DAYS}
      ${teamFilter}
    UNION ALL
    SELECT mi.car_no, vt.team, 'meter_honkensa', '本検査期限', mi.honkensa_limit,
      CAST(julianday(mi.honkensa_limit) - julianday(date('now','+9 hours')) AS INTEGER)
    FROM meter_inspections mi JOIN vehicle_teams vt ON vt.car_no = mi.car_no
    WHERE mi.honkensa_limit IS NOT NULL
      AND julianday(mi.honkensa_limit) - julianday(date('now','+9 hours')) <= ${ALERT_THRESHOLD_DAYS}
      ${teamFilter}
  `;
  const shakenSql = `
    SELECT sr.car_no, vt.team, 'shaken_date' AS source, '車検日' AS field_label, sr.shaken_date AS limit_date,
      CAST(julianday(sr.shaken_date) - julianday(date('now','+9 hours')) AS INTEGER) AS days_remaining
    FROM shaken_records sr JOIN vehicle_teams vt ON vt.car_no = sr.car_no
    WHERE sr.shaken_date IS NOT NULL
      AND julianday(sr.shaken_date) - julianday(date('now','+9 hours')) <= ${ALERT_THRESHOLD_DAYS}
      ${teamFilter}
    UNION ALL
    SELECT sr.car_no, vt.team, 'shaken_limit', '車検リミット', sr.shaken_limit,
      CAST(julianday(sr.shaken_limit) - julianday(date('now','+9 hours')) AS INTEGER)
    FROM shaken_records sr JOIN vehicle_teams vt ON vt.car_no = sr.car_no
    WHERE sr.shaken_limit IS NOT NULL
      AND julianday(sr.shaken_limit) - julianday(date('now','+9 hours')) <= ${ALERT_THRESHOLD_DAYS}
      ${teamFilter}
    UNION ALL
    SELECT sr.car_no, vt.team, 'shaken_cert', '車検証交換リミット', sr.cert_exchange_limit,
      CAST(julianday(sr.cert_exchange_limit) - julianday(date('now','+9 hours')) AS INTEGER)
    FROM shaken_records sr JOIN vehicle_teams vt ON vt.car_no = sr.car_no
    WHERE sr.cert_exchange_limit IS NOT NULL
      AND julianday(sr.cert_exchange_limit) - julianday(date('now','+9 hours')) <= ${ALERT_THRESHOLD_DAYS}
      ${teamFilter}
  `;

  const [meterRows, shakenRows, snoozeRows] = await Promise.all([
    c.env.DB.prepare(meterSql).bind(...teamBind, ...teamBind).all<AlertRow>(),
    c.env.DB.prepare(shakenSql).bind(...teamBind, ...teamBind, ...teamBind).all<AlertRow>(),
    c.env.DB.prepare(
      `SELECT source, car_no FROM deadline_alert_snoozes WHERE datetime(snoozed_until) > datetime('now','+9 hours')`
    ).all<{ source: string; car_no: string }>(),
  ]);

  const snoozed = new Set((snoozeRows.results ?? []).map(s => `${s.source}:${s.car_no}`));
  const all = [...(meterRows.results ?? []), ...(shakenRows.results ?? [])]
    .filter(r => !snoozed.has(`${r.source}:${r.car_no}`))
    .map(r => ({
      source: r.source,
      car_no: r.car_no,
      ka: Math.ceil(r.team / 2),
      field_label: r.field_label,
      limit_date: r.limit_date,
      days_remaining: r.days_remaining,
      severity: r.days_remaining <= 1 ? 'critical' : r.days_remaining <= 5 ? 'warning' : 'notice',
    }))
    .sort((a, b) => a.days_remaining - b.days_remaining);

  return c.json({ alerts: all });
});

app.post('/api/vehicle-deadlines/alerts/snooze', async (c) => {
  const b = await c.req.json<{ source?: string; car_no?: string }>().catch(() => ({}) as { source?: string; car_no?: string });
  const source = String(b.source ?? '');
  const carNo = String(b.car_no ?? '');
  const validSources = ['meter_tentative', 'meter_honkensa', 'shaken_date', 'shaken_limit', 'shaken_cert'];
  if (!validSources.includes(source) || !carNo) {
    return c.json({ error: '指定が不正です' }, 400);
  }
  await c.env.DB.prepare(
    `INSERT INTO deadline_alert_snoozes (source, car_no, snoozed_until)
     VALUES (?, ?, datetime('now', '+9 hours', '+1 hours'))
     ON CONFLICT (source, car_no) DO UPDATE SET snoozed_until = datetime('now', '+9 hours', '+1 hours')`
  ).bind(source, carNo).run();
  return c.json({ ok: true });
});

export default app;
