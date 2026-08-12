// メーター検査（仮検査/本検査）・車検管理
// ページ: /vehicle-deadlines?tab=meter|shaken&ka=1-4
// API   : /api/vehicle-deadlines/*
// 大画面アラート（10日前/5日前/前日で表示、課ベースで絞り込み）: /api/vehicle-deadlines/alerts/*
//   ページ権限に依存せず全アカウントが使える（index.tsでバイパス設定。引き継ぎリミットの/api/limits/と同じ扱い）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { vehicleDeadlinesPage, type MeterInspectionRow, type ShakenRow } from '../html/vehicle_deadlines';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

function isValidKa(v: string): boolean {
  return /^[1-4]$/.test(v);
}
function isValidDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// ===== ページ =====

app.get('/vehicle-deadlines', async (c) => {
  const tab = c.req.query('tab') === 'shaken' ? 'shaken' : 'meter';
  const kaParam = c.req.query('ka') ?? '1';
  const ka = isValidKa(kaParam) ? parseInt(kaParam, 10) : 1;

  if (tab === 'shaken') {
    const rows = await c.env.DB.prepare(
      `SELECT id, ka, car_no, shaken_date, shaken_limit, cert_exchange_limit
       FROM shaken_records WHERE ka = ? ORDER BY car_no`
    ).bind(ka).all<ShakenRow>();
    return c.html(layout('メーター検査・車検管理', vehicleDeadlinesPage('shaken', ka, [], rows.results ?? []), 'vehicle-deadlines'));
  }

  const rows = await c.env.DB.prepare(
    `SELECT id, ka, car_no, tentative_limit, tentative_assignee_id, tentative_assignee_name,
            honkensa_limit, honkensa_assignee_id, honkensa_assignee_name
     FROM meter_inspections WHERE ka = ? ORDER BY car_no`
  ).bind(ka).all<MeterInspectionRow>();
  return c.html(layout('メーター検査・車検管理', vehicleDeadlinesPage('meter', ka, rows.results ?? [], []), 'vehicle-deadlines'));
});

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

// ===== メーター検査 CRUD =====

const METER_FIELDS = ['car_no', 'tentative_limit', 'tentative_assignee_id', 'tentative_assignee_name', 'honkensa_limit', 'honkensa_assignee_id', 'honkensa_assignee_name'] as const;
type MeterField = typeof METER_FIELDS[number];

app.post('/api/vehicle-deadlines/meter', async (c) => {
  const b = await c.req.json<{ ka?: number }>().catch(() => ({}) as { ka?: number });
  const ka = Number(b.ka);
  if (!Number.isInteger(ka) || ka < 1 || ka > 4) return c.json({ error: '課の指定が不正です' }, 400);
  const result = await c.env.DB.prepare(
    `INSERT INTO meter_inspections (ka, car_no) VALUES (?, '')`
  ).bind(ka).run();
  return c.json({ ok: true, id: result.meta.last_row_id });
});

app.put('/api/vehicle-deadlines/meter/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id)) return c.json({ error: '指定が不正です' }, 400);
  type MeterBody = Partial<Record<MeterField, string | number | null>>;
  const body = await c.req.json<MeterBody>().catch(() => ({}) as MeterBody);

  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  for (const field of METER_FIELDS) {
    if (!(field in body)) continue;
    if ((field === 'tentative_limit' || field === 'honkensa_limit') && body[field] !== null && !isValidDate(body[field])) {
      return c.json({ error: '日付の形式が不正です' }, 400);
    }
    sets.push(`${field} = ?`);
    values.push(body[field] === undefined ? null : (body[field] as string | number | null));
  }
  if (!sets.length) return c.json({ error: '更新項目がありません' }, 400);

  await c.env.DB.prepare(
    `UPDATE meter_inspections SET ${sets.join(', ')}, updated_at = datetime('now','localtime') WHERE id = ?`
  ).bind(...values, id).run();
  return c.json({ ok: true });
});

app.delete('/api/vehicle-deadlines/meter/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id)) return c.json({ error: '指定が不正です' }, 400);
  await c.env.DB.prepare('DELETE FROM meter_inspections WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ===== 車検管理 CRUD =====

const SHAKEN_FIELDS = ['car_no', 'shaken_date', 'shaken_limit', 'cert_exchange_limit'] as const;
type ShakenField = typeof SHAKEN_FIELDS[number];

app.post('/api/vehicle-deadlines/shaken', async (c) => {
  const b = await c.req.json<{ ka?: number }>().catch(() => ({}) as { ka?: number });
  const ka = Number(b.ka);
  if (!Number.isInteger(ka) || ka < 1 || ka > 4) return c.json({ error: '課の指定が不正です' }, 400);
  const result = await c.env.DB.prepare(
    `INSERT INTO shaken_records (ka, car_no) VALUES (?, '')`
  ).bind(ka).run();
  return c.json({ ok: true, id: result.meta.last_row_id });
});

app.put('/api/vehicle-deadlines/shaken/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id)) return c.json({ error: '指定が不正です' }, 400);
  type ShakenBody = Partial<Record<ShakenField, string | null>>;
  const body = await c.req.json<ShakenBody>().catch(() => ({}) as ShakenBody);

  const sets: string[] = [];
  const values: (string | null)[] = [];
  for (const field of SHAKEN_FIELDS) {
    if (!(field in body)) continue;
    if (field !== 'car_no' && body[field] !== null && !isValidDate(body[field])) {
      return c.json({ error: '日付の形式が不正です' }, 400);
    }
    sets.push(`${field} = ?`);
    values.push(body[field] === undefined ? null : (body[field] as string | null));
  }
  if (!sets.length) return c.json({ error: '更新項目がありません' }, 400);

  await c.env.DB.prepare(
    `UPDATE shaken_records SET ${sets.join(', ')}, updated_at = datetime('now','localtime') WHERE id = ?`
  ).bind(...values, id).run();
  return c.json({ ok: true });
});

app.delete('/api/vehicle-deadlines/shaken/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id)) return c.json({ error: '指定が不正です' }, 400);
  await c.env.DB.prepare('DELETE FROM shaken_records WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ===== 大画面アラート（グローバル通知。所属課だけで判定し、ページ権限は問わない） =====

type AlertRow = {
  id: number; ka: number; car_no: string; source: string; field_label: string;
  limit_date: string; days_remaining: number;
};

const ALERT_THRESHOLD_DAYS = 10;

app.get('/api/vehicle-deadlines/alerts/pending', async (c) => {
  const admin = await c.env.DB.prepare('SELECT division FROM admins WHERE id = ?')
    .bind(c.get('adminId')).first<{ division: string | null }>();
  const myDivision = admin?.division ?? null;
  if (!myDivision) return c.json({ alerts: [] });

  const kaFilter = myDivision === 'all' ? '' : 'AND ka = ?';
  const kaBind = myDivision === 'all' ? [] : [parseInt(myDivision, 10)];

  const meterSql = `
    SELECT id, ka, car_no, 'meter_tentative' AS source, '仮検査期限' AS field_label, tentative_limit AS limit_date,
      CAST(julianday(tentative_limit) - julianday(date('now','+9 hours')) AS INTEGER) AS days_remaining
    FROM meter_inspections
    WHERE tentative_limit IS NOT NULL
      AND julianday(tentative_limit) - julianday(date('now','+9 hours')) <= ${ALERT_THRESHOLD_DAYS}
      ${kaFilter}
    UNION ALL
    SELECT id, ka, car_no, 'meter_honkensa', '本検査期限', honkensa_limit,
      CAST(julianday(honkensa_limit) - julianday(date('now','+9 hours')) AS INTEGER)
    FROM meter_inspections
    WHERE honkensa_limit IS NOT NULL
      AND julianday(honkensa_limit) - julianday(date('now','+9 hours')) <= ${ALERT_THRESHOLD_DAYS}
      ${kaFilter}
  `;
  const shakenSql = `
    SELECT id, ka, car_no, 'shaken_date' AS source, '車検日' AS field_label, shaken_date AS limit_date,
      CAST(julianday(shaken_date) - julianday(date('now','+9 hours')) AS INTEGER) AS days_remaining
    FROM shaken_records
    WHERE shaken_date IS NOT NULL
      AND julianday(shaken_date) - julianday(date('now','+9 hours')) <= ${ALERT_THRESHOLD_DAYS}
      ${kaFilter}
    UNION ALL
    SELECT id, ka, car_no, 'shaken_limit', '車検リミット', shaken_limit,
      CAST(julianday(shaken_limit) - julianday(date('now','+9 hours')) AS INTEGER)
    FROM shaken_records
    WHERE shaken_limit IS NOT NULL
      AND julianday(shaken_limit) - julianday(date('now','+9 hours')) <= ${ALERT_THRESHOLD_DAYS}
      ${kaFilter}
    UNION ALL
    SELECT id, ka, car_no, 'shaken_cert', '車検証交換リミット', cert_exchange_limit,
      CAST(julianday(cert_exchange_limit) - julianday(date('now','+9 hours')) AS INTEGER)
    FROM shaken_records
    WHERE cert_exchange_limit IS NOT NULL
      AND julianday(cert_exchange_limit) - julianday(date('now','+9 hours')) <= ${ALERT_THRESHOLD_DAYS}
      ${kaFilter}
  `;

  const [meterRows, shakenRows, snoozeRows] = await Promise.all([
    c.env.DB.prepare(meterSql).bind(...kaBind, ...kaBind).all<AlertRow>(),
    c.env.DB.prepare(shakenSql).bind(...kaBind, ...kaBind, ...kaBind).all<AlertRow>(),
    c.env.DB.prepare(
      `SELECT source, record_id FROM deadline_alert_snoozes WHERE datetime(snoozed_until) > datetime('now','+9 hours')`
    ).all<{ source: string; record_id: number }>(),
  ]);

  const snoozed = new Set((snoozeRows.results ?? []).map(s => `${s.source}:${s.record_id}`));
  const all = [...(meterRows.results ?? []), ...(shakenRows.results ?? [])]
    .filter(r => !snoozed.has(`${r.source}:${r.id}`))
    .map(r => ({
      source: r.source,
      record_id: r.id,
      ka: r.ka,
      car_no: r.car_no,
      field_label: r.field_label,
      limit_date: r.limit_date,
      days_remaining: r.days_remaining,
      severity: r.days_remaining <= 1 ? 'critical' : r.days_remaining <= 5 ? 'warning' : 'notice',
    }))
    .sort((a, b) => a.days_remaining - b.days_remaining);

  return c.json({ alerts: all });
});

app.post('/api/vehicle-deadlines/alerts/snooze', async (c) => {
  const b = await c.req.json<{ source?: string; record_id?: number }>().catch(() => ({}) as { source?: string; record_id?: number });
  const source = String(b.source ?? '');
  const recordId = Number(b.record_id);
  const validSources = ['meter_tentative', 'meter_honkensa', 'shaken_date', 'shaken_limit', 'shaken_cert'];
  if (!validSources.includes(source) || !Number.isInteger(recordId)) {
    return c.json({ error: '指定が不正です' }, 400);
  }
  await c.env.DB.prepare(
    `INSERT INTO deadline_alert_snoozes (source, record_id, snoozed_until)
     VALUES (?, ?, datetime('now', '+9 hours', '+1 hours'))
     ON CONFLICT (source, record_id) DO UPDATE SET snoozed_until = datetime('now', '+9 hours', '+1 hours')`
  ).bind(source, recordId).run();
  return c.json({ ok: true });
});

export default app;
