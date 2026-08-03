// 引き継ぎシート「リミット」機能（何時までにやるべきタスクを設定し、時刻到達で全ページにポップアップ）
// シート単位のCRUD: /api/handover/:division/:date/limits（handover権限でガード）
// グローバル通知用: /api/limits/*（ページ権限に依存せず、アカウントの所属課だけで判定。index.tsでバイパス設定）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { getAdminPermissions } from '../permissions';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

type LimitRow = {
  id: number; division: number; date: string; task: string; limit_time: string;
  created_by_name: string | null; created_at: string;
};

function isValidDivision(v: string): boolean {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 1 && n <= 4;
}
function isValidDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}
function isValidTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('handover.edit');
}

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<string> {
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?')
    .bind(c.get('adminId')).first<{ username: string }>();
  return row?.username ?? `id:${c.get('adminId')}`;
}

// ===== シート単位のCRUD（handover権限） =====

app.get('/api/handover/:division/:date/limits', async (c) => {
  const division = c.req.param('division');
  const date = c.req.param('date');
  if (!isValidDivision(division) || !isValidDate(date)) return c.json({ error: '指定が不正です' }, 400);
  const rows = await c.env.DB.prepare(
    `SELECT id, division, date, task, limit_time, created_by_name, created_at
     FROM handover_limits WHERE division = ? AND date = ? AND dismissed_at IS NULL
     ORDER BY limit_time`
  ).bind(parseInt(division, 10), date).all<LimitRow>();
  return c.json({ limits: rows.results ?? [] });
});

app.post('/api/handover/:division/:date/limits', async (c) => {
  const division = c.req.param('division');
  const date = c.req.param('date');
  if (!isValidDivision(division) || !isValidDate(date)) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);

  const b = await c.req.json<{ task?: string; limit_time?: string }>().catch(() => ({}) as { task?: string; limit_time?: string });
  const task = (b.task ?? '').trim();
  const limitTime = b.limit_time ?? '';
  if (!task) return c.json({ error: 'タスク内容を入力してください' }, 400);
  if (!isValidTime(limitTime)) return c.json({ error: '時刻の指定が不正です' }, 400);

  const name = await adminName(c);
  const result = await c.env.DB.prepare(
    `INSERT INTO handover_limits (division, date, task, limit_time, created_by, created_by_name)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(parseInt(division, 10), date, task, limitTime, c.get('adminId'), name).run();

  return c.json({ ok: true, id: result.meta.last_row_id });
});

app.delete('/api/handover/:division/:date/limits/:id', async (c) => {
  const division = c.req.param('division');
  const date = c.req.param('date');
  const id = parseInt(c.req.param('id'), 10);
  if (!isValidDivision(division) || !isValidDate(date) || !Number.isInteger(id)) {
    return c.json({ error: '指定が不正です' }, 400);
  }
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);

  await c.env.DB.prepare(
    'DELETE FROM handover_limits WHERE id = ? AND division = ? AND date = ?'
  ).bind(id, parseInt(division, 10), date).run();
  return c.json({ ok: true });
});

// ===== グローバル通知（ページ権限に依存しない。所属課のみで判定） =====

app.get('/api/limits/pending', async (c) => {
  const admin = await c.env.DB.prepare('SELECT division FROM admins WHERE id = ?')
    .bind(c.get('adminId')).first<{ division: string | null }>();
  const myDivision = admin?.division ?? null;
  if (!myDivision) return c.json({ limits: [] });

  // date/limit_time はJST(日本時間)の壁時計値。D1の'localtime'修飾子はTZDBが無くUTCのまま返るため、
  // 「現在時刻」側を'+9 hours'で明示的にJSTへ補正してから比較する（他機能でも同じ補正パターンを使用）。
  const base = `SELECT id, division, date, task, limit_time, created_by_name, created_at
    FROM handover_limits
    WHERE dismissed_at IS NULL
      AND datetime(date || ' ' || limit_time) <= datetime('now', '+9 hours')`;

  const rows = myDivision === 'all'
    ? await c.env.DB.prepare(`${base} ORDER BY limit_time`).all<LimitRow>()
    : await c.env.DB.prepare(`${base} AND division = ? ORDER BY limit_time`).bind(parseInt(myDivision, 10)).all<LimitRow>();

  return c.json({ limits: rows.results ?? [] });
});

app.post('/api/limits/:id/dismiss', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id)) return c.json({ error: '指定が不正です' }, 400);
  const name = await adminName(c);
  await c.env.DB.prepare(
    `UPDATE handover_limits SET dismissed_at = datetime('now','localtime'), dismissed_by = ?
     WHERE id = ? AND dismissed_at IS NULL`
  ).bind(name, id).run();
  return c.json({ ok: true });
});

export default app;
