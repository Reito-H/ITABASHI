import { Hono } from 'hono';
import type { Env } from '../../auth';

type AppEnv = { Bindings: Env; Variables: { adminId: number } };
const app = new Hono<AppEnv>();

app.post('/', async (c) => {
  const body = await c.req.json<{
    emp_id: number;
    date: string;
    entry_am?: string | null;
    entry_pm?: string | null;
    coach_id?: number | null;
  }>();

  const { emp_id, date } = body;
  if (!emp_id || !date) return c.json({ error: '必須パラメータ不足' }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: '日付フォーマットエラー' }, 400);

  const entry_am = body.entry_am?.trim() || null;
  const entry_pm = body.entry_pm?.trim() || null;
  const coach_id = (body.coach_id != null && !isNaN(Number(body.coach_id))) ? Number(body.coach_id) : null;

  await c.env.DB.prepare(`
    INSERT INTO shift_entries (emp_id, date, entry_am, entry_pm, coach_id, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(emp_id, date) DO UPDATE SET
      entry_am  = excluded.entry_am,
      entry_pm  = excluded.entry_pm,
      coach_id  = excluded.coach_id,
      updated_at = datetime('now', 'localtime')
  `).bind(emp_id, date, entry_am, entry_pm, coach_id).run();

  return c.json({ ok: true });
});

app.get('/period', async (c) => {
  const year = parseInt(c.req.query('year') ?? '0');
  const month = parseInt(c.req.query('month') ?? '0');
  if (!year || !month) return c.json({ error: 'パラメータ不足' }, 400);

  const { getShiftDisplayRange } = await import('../../auth');
  const { dates } = getShiftDisplayRange(year, month);

  const rows = await c.env.DB.prepare(`
    SELECT emp_id, date, entry_am, entry_pm, coach_id
    FROM shift_entries WHERE date >= ? AND date <= ?
    ORDER BY emp_id, date
  `).bind(dates[0], dates[dates.length - 1]).all();

  return c.json({ entries: rows.results, dates });
});

// バッチ保存
app.post('/batch', async (c) => {
  const body = await c.req.json<{
    entries: Array<{
      emp_id: number;
      date: string;
      entry_am?: string | null;
      entry_pm?: string | null;
      coach_id?: number | null;
    }>;
  }>();

  if (!Array.isArray(body?.entries) || body.entries.length === 0) {
    return c.json({ error: '変更がありません' }, 400);
  }

  const stmt = c.env.DB.prepare(`
    INSERT INTO shift_entries (emp_id, date, entry_am, entry_pm, coach_id, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(emp_id, date) DO UPDATE SET
      entry_am   = excluded.entry_am,
      entry_pm   = excluded.entry_pm,
      coach_id   = excluded.coach_id,
      updated_at = datetime('now', 'localtime')
  `);

  const ops: D1PreparedStatement[] = [];
  for (const e of body.entries) {
    if (!e.emp_id || !e.date || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    const entry_am = (typeof e.entry_am === 'string' ? e.entry_am.trim() : null) || null;
    const entry_pm = (typeof e.entry_pm === 'string' ? e.entry_pm.trim() : null) || null;
    const coach_id = (e.coach_id != null && !isNaN(Number(e.coach_id))) ? Number(e.coach_id) : null;
    ops.push(stmt.bind(e.emp_id, e.date, entry_am, entry_pm, coach_id));
  }

  if (ops.length === 0) return c.json({ error: '有効なエントリがありません' }, 400);
  await c.env.DB.batch(ops);
  return c.json({ ok: true, count: ops.length });
});

// ロック状態確認
app.get('/lock', async (c) => {
  const year = parseInt(c.req.query('year') ?? '0');
  const month = parseInt(c.req.query('month') ?? '0');
  if (!year || !month) return c.json({ error: 'パラメータ不足' }, 400);

  const lock = await c.env.DB.prepare(`
    SELECT admin_id, admin_name, locked_at, expires_at
    FROM shift_edit_locks WHERE year = ? AND month = ?
  `).bind(year, month).first<{ admin_id: number; admin_name: string; locked_at: string; expires_at: string }>();

  if (!lock) return c.json({ locked: false });

  if (new Date(lock.expires_at) < new Date()) {
    await c.env.DB.prepare(`DELETE FROM shift_edit_locks WHERE year = ? AND month = ?`).bind(year, month).run();
    return c.json({ locked: false });
  }

  const adminId = c.get('adminId');
  if (lock.admin_id === adminId) return c.json({ locked: false });

  return c.json({ locked: true, admin_name: lock.admin_name, locked_at: lock.locked_at });
});

// ロック取得・更新（ハートビートも兼用）
app.post('/lock', async (c) => {
  const body = await c.req.json<{ year: number; month: number }>();
  const { year, month } = body;
  if (!year || !month) return c.json({ error: 'パラメータ不足' }, 400);

  const adminId = c.get('adminId');
  const admin = await c.env.DB.prepare(`SELECT username FROM admins WHERE id = ?`)
    .bind(adminId).first<{ username: string }>();
  if (!admin) return c.json({ error: '管理者情報が取得できません' }, 500);

  const now = new Date();
  const expires = new Date(now.getTime() + 5 * 60 * 1000);

  const existing = await c.env.DB.prepare(`
    SELECT admin_id, admin_name, expires_at FROM shift_edit_locks WHERE year = ? AND month = ?
  `).bind(year, month).first<{ admin_id: number; admin_name: string; expires_at: string }>();

  if (existing && new Date(existing.expires_at) >= now && existing.admin_id !== adminId) {
    return c.json({ locked: true, admin_name: existing.admin_name });
  }

  await c.env.DB.prepare(`
    INSERT INTO shift_edit_locks (year, month, admin_id, admin_name, locked_at, expires_at)
    VALUES (?, ?, ?, ?, datetime('now', 'localtime'), ?)
    ON CONFLICT(year, month) DO UPDATE SET
      admin_id   = excluded.admin_id,
      admin_name = excluded.admin_name,
      locked_at  = CASE WHEN admin_id = excluded.admin_id THEN locked_at ELSE excluded.locked_at END,
      expires_at = excluded.expires_at
  `).bind(year, month, adminId, admin.username, expires.toISOString()).run();

  return c.json({ ok: true });
});

// ロック解放
app.post('/lock-release', async (c) => {
  const body = await c.req.json<{ year: number; month: number }>();
  const { year, month } = body;
  const adminId = c.get('adminId');

  if (year && month) {
    await c.env.DB.prepare(`
      DELETE FROM shift_edit_locks WHERE year = ? AND month = ? AND admin_id = ?
    `).bind(year, month, adminId).run();
  }

  return c.json({ ok: true });
});

export default app;
