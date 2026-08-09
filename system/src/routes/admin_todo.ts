// やることリスト（1〜4課 個別チェックリスト + 当直共通タスク）
// ページ: /todo（?ka=1..4|toban&date=YYYY-MM-DD）
// API   : /api/todo/*（管理パス配下。編集系は権限ミドルウェアで <todo.edit> 必須）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { todoListPage, type TodoTaskRow } from '../html/todo_list';
import { getAdminPermissions } from '../permissions';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<{ id: number; name: string }> {
  const id = c.get('adminId');
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(id).first<{ username: string }>();
  return { id, name: row?.username ?? `id:${id}` };
}

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('todo.edit');
}

function todayUtcStr(): string {
  return new Date().toISOString().split('T')[0];
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WEEKDAY_JA[d.getUTCDay()]}）`;
}

// ka クエリ('1'〜'4'|'toban') → DB上のka値(1〜4|null)。不正値はnullを返す
function parseKaParam(raw: string | undefined): { ka: number | null; kaParam: string } | null {
  if (raw === 'toban') return { ka: null, kaParam: 'toban' };
  const n = parseInt(raw ?? '', 10);
  if (n >= 1 && n <= 4) return { ka: n, kaParam: String(n) };
  return null;
}

function cookieValue(cookieHeader: string | undefined, name: string): string | undefined {
  return cookieHeader?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1];
}

// ===== ページ =====
app.get('/todo', async (c) => {
  // ?ka= が無い場合は前回開いた課をCookieから復元する（無ければ1課）
  const kaCookie = cookieValue(c.req.header('Cookie'), 'todo_ka');
  const parsedKa = parseKaParam(c.req.query('ka')) ?? parseKaParam(kaCookie) ?? { ka: 1, kaParam: '1' };
  const dateRaw = c.req.query('date') ?? '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : todayUtcStr();

  const rows = await c.env.DB.prepare(
    `SELECT t.id, t.ka, t.title, t.time_label, t.weekdays, t.note, t.note_day_of_month, t.sort_order,
            c.is_done, c.done_by, c.done_at
     FROM todo_tasks t
     LEFT JOIN todo_completions c ON c.task_id = t.id AND c.date = ?
     WHERE t.is_active = 1 AND (t.ka = ? OR (? IS NULL AND t.ka IS NULL))
     ORDER BY t.sort_order, t.id`
  ).bind(date, parsedKa.ka, parsedKa.ka).all<TodoTaskRow>();

  const editable = await canEdit(c);
  const html = todoListPage({
    ka: parsedKa.kaParam,
    date,
    prevDate: shiftDate(date, -1),
    nextDate: shiftDate(date, 1),
    todayDate: todayUtcStr(),
    dateLabel: formatDateLabel(date),
    tasks: rows.results ?? [],
    editable,
  });
  const res = c.html(layout('やることリスト', html, 'todo'));
  res.headers.append('Set-Cookie', `todo_ka=${parsedKa.kaParam}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=15552000`);
  return res;
});

// ===== API =====
const S = (v: unknown, max = 200): string => String(v ?? '').slice(0, max);

app.post('/api/todo/completions/toggle', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ task_id?: number; date?: string; is_done?: boolean }>();
  const taskId = parseInt(String(b.task_id ?? ''), 10);
  const date = S(b.date, 10);
  if (!taskId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: '不正なパラメータです' }, 400);

  const { name } = await adminName(c);
  const isDone = b.is_done ? 1 : 0;
  await c.env.DB.prepare(
    `INSERT INTO todo_completions (task_id, date, is_done, done_by, done_at)
     VALUES (?, ?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(task_id, date) DO UPDATE SET is_done = excluded.is_done, done_by = excluded.done_by, done_at = excluded.done_at`
  ).bind(taskId, date, isDone, isDone ? name : null).run();
  return c.json({ ok: true });
});

app.post('/api/todo/tasks', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{
    ka?: number | null; title?: string; time_label?: string | null;
    weekdays?: string | null; note?: string | null; note_day_of_month?: number | null;
  }>();
  const title = S(b.title, 60).trim();
  if (!title) return c.json({ error: 'タイトルを入力してください' }, 400);
  const ka = (b.ka === null || b.ka === undefined) ? null : parseInt(String(b.ka), 10);
  if (ka !== null && (Number.isNaN(ka) || ka < 1 || ka > 4)) return c.json({ error: '不正な課番号です' }, 400);
  const domVal = b.note_day_of_month ? parseInt(String(b.note_day_of_month), 10) : null;
  if (domVal !== null && (Number.isNaN(domVal) || domVal < 1 || domVal > 31)) return c.json({ error: '注意書きの日付は1〜31で指定してください' }, 400);

  const max = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) AS m FROM todo_tasks WHERE is_active = 1 AND (ka = ? OR (? IS NULL AND ka IS NULL))'
  ).bind(ka, ka).first<{ m: number }>();
  await c.env.DB.prepare(
    `INSERT INTO todo_tasks (ka, title, time_label, weekdays, note, note_day_of_month, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    ka, title,
    b.time_label ? S(b.time_label, 20) : null,
    b.weekdays ? S(b.weekdays, 20) : null,
    b.note ? S(b.note, 200) : null,
    domVal,
    (max?.m ?? 0) + 10,
  ).run();
  return c.json({ ok: true });
});

app.put('/api/todo/tasks/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'), 10);
  const existing = await c.env.DB.prepare('SELECT id FROM todo_tasks WHERE id = ? AND is_active = 1').bind(id).first();
  if (!existing) return c.json({ error: 'タスクが見つかりません' }, 404);

  const b = await c.req.json<{
    title?: string; time_label?: string | null; weekdays?: string | null;
    note?: string | null; note_day_of_month?: number | null;
  }>();
  const title = S(b.title, 60).trim();
  if (!title) return c.json({ error: 'タイトルを入力してください' }, 400);
  const domVal = b.note_day_of_month ? parseInt(String(b.note_day_of_month), 10) : null;
  if (domVal !== null && (Number.isNaN(domVal) || domVal < 1 || domVal > 31)) return c.json({ error: '注意書きの日付は1〜31で指定してください' }, 400);

  await c.env.DB.prepare(
    `UPDATE todo_tasks SET title = ?, time_label = ?, weekdays = ?, note = ?, note_day_of_month = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).bind(
    title,
    b.time_label ? S(b.time_label, 20) : null,
    b.weekdays ? S(b.weekdays, 20) : null,
    b.note ? S(b.note, 200) : null,
    domVal,
    id,
  ).run();
  return c.json({ ok: true });
});

// 論理削除（誤削除対策。完了履歴は保持したままタスク定義のみ非表示にする）
app.post('/api/todo/tasks/:id/delete', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'), 10);
  await c.env.DB.prepare(
    `UPDATE todo_tasks SET is_active = 0, updated_at = datetime('now','localtime') WHERE id = ?`
  ).bind(id).run();
  return c.json({ ok: true });
});

app.post('/api/todo/tasks/reorder', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ ids?: number[] }>();
  const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(n => Number.isInteger(n)) : [];
  if (ids.length === 0 || ids.length > 200) return c.json({ error: '不正なパラメータです' }, 400);
  const stmts = ids.map((id, i) =>
    c.env.DB.prepare('UPDATE todo_tasks SET sort_order = ? WHERE id = ?').bind((i + 1) * 10, id)
  );
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

export default app;
