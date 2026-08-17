// やることリスト（1〜4課 個別チェックリスト + 当直共通タスク）
// ページ: /todo（?ka=1..4|toban&date=YYYY-MM-DD）
// API   : /api/todo/*（管理パス配下。編集系は権限ミドルウェアで <todo.edit> 必須）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { todoListPage, todoCombinedPage, type TodoTaskRow, type TodoWorkerCheckRow } from '../html/todo_list';
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

// 指定ka（1〜4|null=当直）・日付のタスク一覧＋勤務者チェックリストをまとめて取得
async function fetchTodoGroup(db: Env['DB'], ka: number | null, date: string): Promise<{ tasks: TodoTaskRow[]; workerChecks: TodoWorkerCheckRow[] }> {
  const rows = await db.prepare(
    `SELECT t.id, t.ka, t.title, t.time_label, t.weekdays, t.note, t.note_day_of_month, t.sort_order,
            c.is_done, c.done_by, c.done_at
     FROM todo_tasks t
     LEFT JOIN todo_completions c ON c.task_id = t.id AND c.date = ?
     WHERE t.is_active = 1 AND (t.ka = ? OR (? IS NULL AND t.ka IS NULL))
     ORDER BY t.sort_order, t.id`
  ).bind(date, ka, ka).all<TodoTaskRow>();

  const workerRows = await db.prepare(
    `SELECT id, ka, date, work_type, employee_id, employee_name, is_done, done_by, done_at, sort_order
     FROM todo_worker_checks
     WHERE date = ? AND (ka = ? OR (? IS NULL AND ka IS NULL))
     ORDER BY work_type, sort_order, id`
  ).bind(date, ka, ka).all<TodoWorkerCheckRow>();

  return { tasks: rows.results ?? [], workerChecks: workerRows.results ?? [] };
}

// ===== ページ =====
app.get('/todo', async (c) => {
  // ?ka= が無い場合は前回開いた課をCookieから復元する（無ければ1課）
  const kaCookie = cookieValue(c.req.header('Cookie'), 'todo_ka');
  const parsedKa = parseKaParam(c.req.query('ka')) ?? parseKaParam(kaCookie) ?? { ka: 1, kaParam: '1' };
  const dateRaw = c.req.query('date') ?? '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : todayUtcStr();
  const embed = c.req.query('embed') === '1';
  // 引き継ぎシートのフローティングパネル専用: 開いている課＋当直のやることリストを
  // タブ切り替え無しで1画面にまとめて表示する（当直そのものを開いている時は組み合わせ不要なので通常表示）
  const combined = embed && c.req.query('combined') === '1' && parsedKa.ka !== null;

  const editable = await canEdit(c);

  if (combined) {
    const [divisionGroup, tobanGroup] = await Promise.all([
      fetchTodoGroup(c.env.DB, parsedKa.ka, date),
      fetchTodoGroup(c.env.DB, null, date),
    ]);
    const html = todoCombinedPage({
      division: parsedKa.ka as number,
      date,
      prevDate: shiftDate(date, -1),
      nextDate: shiftDate(date, 1),
      todayDate: todayUtcStr(),
      dateLabel: formatDateLabel(date),
      divisionTasks: divisionGroup.tasks,
      divisionWorkerChecks: divisionGroup.workerChecks,
      tobanTasks: tobanGroup.tasks,
      tobanWorkerChecks: tobanGroup.workerChecks,
    });
    const res = c.html(layout('やることリスト', html, 'todo', '', true));
    res.headers.append('Set-Cookie', `todo_ka=${parsedKa.kaParam}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=15552000`);
    return res;
  }

  const group = await fetchTodoGroup(c.env.DB, parsedKa.ka, date);
  const html = todoListPage({
    ka: parsedKa.kaParam,
    date,
    prevDate: shiftDate(date, -1),
    nextDate: shiftDate(date, 1),
    todayDate: todayUtcStr(),
    dateLabel: formatDateLabel(date),
    tasks: group.tasks,
    workerChecks: group.workerChecks,
    editable,
    embed,
  });
  const res = c.html(layout('やることリスト', html, 'todo', '', embed));
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

// ===== 勤務者チェックリスト（勤務種別ごとに氏名検索で登録し、一人ずつ完了をチェックする） =====

app.get('/api/todo/employees/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 40);
  if (!q) return c.json([]);
  const rows = await c.env.DB.prepare(
    `SELECT id, name, emp_no, division, team FROM employees
     WHERE is_active = 1 AND (name LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)
     ORDER BY division, team, seq_no LIMIT 20`
  ).bind(`%${q}%`, `%${q}%`, `%${q}%`).all<{ id: number; name: string; emp_no: string; division: number | null; team: number | null }>();
  return c.json(rows.results ?? []);
});

app.get('/api/todo/worker-checks/work-types', async (c) => {
  const parsedKa = parseKaParam(c.req.query('ka'));
  if (!parsedKa) return c.json({ error: '不正な課番号です' }, 400);
  const rows = await c.env.DB.prepare(
    `SELECT work_type, MAX(id) AS last_id FROM todo_worker_checks
     WHERE (ka = ? OR (? IS NULL AND ka IS NULL))
     GROUP BY work_type ORDER BY last_id DESC LIMIT 15`
  ).bind(parsedKa.ka, parsedKa.ka).all<{ work_type: string }>();
  return c.json((rows.results ?? []).map(r => r.work_type));
});

app.post('/api/todo/worker-checks', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ ka?: number | null; date?: string; work_type?: string; employee_id?: number }>();
  const ka = (b.ka === null || b.ka === undefined) ? null : parseInt(String(b.ka), 10);
  if (ka !== null && (Number.isNaN(ka) || ka < 1 || ka > 4)) return c.json({ error: '不正な課番号です' }, 400);
  const date = S(b.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: '不正な日付です' }, 400);
  const workType = S(b.work_type, 30).trim();
  if (!workType) return c.json({ error: '勤務種別を入力してください' }, 400);
  const empId = parseInt(String(b.employee_id ?? ''), 10);
  if (!empId) return c.json({ error: '勤務者を選択してください' }, 400);

  const emp = await c.env.DB.prepare('SELECT id, name FROM employees WHERE id = ? AND is_active = 1')
    .bind(empId).first<{ id: number; name: string }>();
  if (!emp) return c.json({ error: '社員が見つかりません' }, 404);

  const max = await c.env.DB.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM todo_worker_checks
     WHERE date = ? AND (ka = ? OR (? IS NULL AND ka IS NULL)) AND work_type = ?`
  ).bind(date, ka, ka, workType).first<{ m: number }>();
  await c.env.DB.prepare(
    `INSERT INTO todo_worker_checks (ka, date, work_type, employee_id, employee_name, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(ka, date, workType, emp.id, emp.name, (max?.m ?? 0) + 10).run();
  return c.json({ ok: true });
});

app.post('/api/todo/worker-checks/:id/toggle', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'), 10);
  const b = await c.req.json<{ is_done?: boolean }>();
  const { name } = await adminName(c);
  const isDone = b.is_done ? 1 : 0;
  await c.env.DB.prepare(
    `UPDATE todo_worker_checks SET is_done = ?, done_by = ?, done_at = CASE WHEN ? = 1 THEN datetime('now','localtime') ELSE NULL END WHERE id = ?`
  ).bind(isDone, isDone ? name : null, isDone, id).run();
  return c.json({ ok: true });
});

app.post('/api/todo/worker-checks/:id/delete', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'), 10);
  await c.env.DB.prepare('DELETE FROM todo_worker_checks WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
