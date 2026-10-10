// 星専用 引き継ぎシート
// ページ: /handover/hoshi（板橋1〜4課の /handover とは別ページ。課切替ドロップダウンの「星」から遷移）
// API   : /api/handover-hoshi/*（/api/handover/:division/:date と衝突しないよう別プレフィックス。
//          権限は permissions.ts の /^\/api\/handover/ にマッチするため handover / handover.edit がそのまま効く）
//
// データは課の引き継ぎシートとは完全に独立（migration_178 の hoshi_* テーブル）。
// 星のシフトだけは例外で、班長シフト（kancho_shifts）を直接読み書きする（ここで変えると班長シフトにも反映される）。
// 当初は hoshi_shift_overrides に「このシート内だけの上書き」を持つ方式だったが、要望により班長シフト連動に変更した
// （hoshi_shift_overrides テーブルは残っているが、もう読み書きしない）。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { loadHoshiCalendar, buildHoshiSchedulePdf, saveHoshiShift, saveHoshiWorkTime, saveHoshiMemo } from '../utils/hoshi_schedule';
import { layout } from '../html/layout';
import { handoverHoshiPage, handoverHoshiHeaderTabs } from '../html/handover_hoshi';
import { getAdminPermissions } from '../permissions';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();


function isValidDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}
function isValidTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().split('T')[0];
}

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<string> {
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(c.get('adminId')).first<{ username: string }>();
  return row?.username ?? `id:${c.get('adminId')}`;
}

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('handover.edit');
}

// シフト変更は班長シフトへ書き込むため、引き継ぎシートの編集権限に加えて班長シフトの編集権限も必要
async function canEditShift(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || (perms.includes('handover.edit') && perms.includes('kancho-shift.edit'));
}

// ===== ページ =====
app.get('/handover/hoshi', async (c) => {
  const editable = await canEdit(c);
  return c.html(layout('引き継ぎシート', handoverHoshiPage(editable), 'handover', handoverHoshiHeaderTabs()));
});

// ===== 左列：日次の引き継ぎ本文 =====
app.get('/api/handover-hoshi/dates', async (c) => {
  const rows = await c.env.DB.prepare('SELECT date FROM hoshi_sheets ORDER BY date DESC LIMIT 90').all<{ date: string }>();
  return c.json({ dates: (rows.results ?? []).map(r => r.date) });
});

app.get('/api/handover-hoshi/sheet/:date', async (c) => {
  const date = c.req.param('date');
  if (!isValidDate(date)) return c.json({ error: '日付の指定が不正です' }, 400);
  const sheet = await c.env.DB.prepare('SELECT date, main_content, updated_at, updated_by FROM hoshi_sheets WHERE date = ?')
    .bind(date).first<{ date: string; main_content: string; updated_at: string; updated_by: string | null }>();
  return c.json({ sheet: sheet ?? null });
});

app.put('/api/handover-hoshi/sheet/:date', async (c) => {
  const date = c.req.param('date');
  if (!isValidDate(date)) return c.json({ error: '日付の指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ main_content?: string }>().catch(() => ({}) as { main_content?: string });
  const by = await adminName(c);
  await c.env.DB.prepare(`
    INSERT INTO hoshi_sheets (date, main_content, updated_at, updated_by)
    VALUES (?, ?, datetime('now','localtime'), ?)
    ON CONFLICT(date) DO UPDATE SET main_content = excluded.main_content, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).bind(date, b.main_content ?? '', by).run();
  const saved = await c.env.DB.prepare('SELECT updated_at FROM hoshi_sheets WHERE date = ?').bind(date).first<{ updated_at: string }>();
  return c.json({ ok: true, updated_at: saved?.updated_at ?? null });
});

// 翌日のシートを作成（本文は前日の内容をそのまま引き継ぐ。既にあれば何もしない）
app.post('/api/handover-hoshi/sheet/:date/next', async (c) => {
  const date = c.req.param('date');
  if (!isValidDate(date)) return c.json({ error: '日付の指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const next = addDays(date, 1);
  const cur = await c.env.DB.prepare('SELECT main_content FROM hoshi_sheets WHERE date = ?').bind(date).first<{ main_content: string }>();
  const by = await adminName(c);
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO hoshi_sheets (date, main_content, updated_at, updated_by) VALUES (?, ?, datetime('now','localtime'), ?)`
  ).bind(next, cur?.main_content ?? '', by).run();
  return c.json({ nextDate: next });
});

app.delete('/api/handover-hoshi/sheet/:date', async (c) => {
  const date = c.req.param('date');
  if (!isValidDate(date)) return c.json({ error: '日付の指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  await c.env.DB.prepare('DELETE FROM hoshi_sheets WHERE date = ?').bind(date).run();
  return c.json({ ok: true });
});

// ===== 右列①：時系列ToDo =====
type TodoRow = { id: number; due_date: string | null; due_time: string | null; content: string; done: number; updated_at: string; updated_by: string | null };

app.get('/api/handover-hoshi/todos', async (c) => {
  // 未完了は全件、完了済みは直近の更新分だけ（溜まり続けても重くならないように）
  const rows = await c.env.DB.prepare(`
    SELECT id, due_date, due_time, content, done, updated_at, updated_by FROM hoshi_todos WHERE done = 0
    UNION ALL
    SELECT * FROM (
      SELECT id, due_date, due_time, content, done, updated_at, updated_by FROM hoshi_todos WHERE done = 1
      ORDER BY updated_at DESC LIMIT 100
    )
  `).all<TodoRow>();
  return c.json({ todos: rows.results ?? [] });
});

type TodoBody = { due_date?: string | null; due_time?: string | null; content?: string; done?: boolean };
function validateTodoBody(b: TodoBody): string | null {
  if (b.due_date != null && b.due_date !== '' && !isValidDate(b.due_date)) return '日付の形式が不正です';
  if (b.due_time != null && b.due_time !== '' && !isValidTime(b.due_time)) return '時刻の形式が不正です';
  return null;
}

app.post('/api/handover-hoshi/todos', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<TodoBody>().catch(() => ({}) as TodoBody);
  const err = validateTodoBody(b);
  if (err) return c.json({ error: err }, 400);
  const content = (b.content || '').trim().slice(0, 300);
  if (!content) return c.json({ error: '内容を入力してください' }, 400);
  const by = await adminName(c);
  const r = await c.env.DB.prepare(
    `INSERT INTO hoshi_todos (due_date, due_time, content, updated_by) VALUES (?, ?, ?, ?)`
  ).bind(b.due_date || null, b.due_time || null, content, by).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

app.patch('/api/handover-hoshi/todos/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!id) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<TodoBody>().catch(() => ({}) as TodoBody);
  const err = validateTodoBody(b);
  if (err) return c.json({ error: err }, 400);

  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (b.due_date !== undefined) { sets.push('due_date = ?'); values.push(b.due_date || null); }
  if (b.due_time !== undefined) { sets.push('due_time = ?'); values.push(b.due_time || null); }
  if (b.content !== undefined) {
    const content = b.content.trim().slice(0, 300);
    if (!content) return c.json({ error: '内容を入力してください' }, 400);
    sets.push('content = ?'); values.push(content);
  }
  if (b.done !== undefined) { sets.push('done = ?'); values.push(b.done ? 1 : 0); }
  if (!sets.length) return c.json({ error: '更新項目がありません' }, 400);

  const by = await adminName(c);
  const r = await c.env.DB.prepare(
    `UPDATE hoshi_todos SET ${sets.join(', ')}, updated_at = datetime('now','localtime'), updated_by = ? WHERE id = ?`
  ).bind(...values, by, id).run();
  if (r.meta.changes === 0) return c.json({ error: 'データが存在しません' }, 404);
  return c.json({ ok: true });
});

app.delete('/api/handover-hoshi/todos/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!id) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const r = await c.env.DB.prepare('DELETE FROM hoshi_todos WHERE id = ?').bind(id).run();
  if (r.meta.changes === 0) return c.json({ error: 'データが存在しません' }, 404);
  return c.json({ ok: true });
});

// ===== 右列②③：星のシフト＋予定メモの縦型カレンダー（月度単位） =====
app.get('/api/handover-hoshi/calendar', async (c) => {
  const [cal, shiftEditable] = await Promise.all([
    loadHoshiCalendar(c.env.DB, parseInt(c.req.query('year') || '', 10), parseInt(c.req.query('month') || '', 10)),
    canEditShift(c),
  ]);
  return c.json({ ...cal, canEditShift: shiftEditable });
});

// シフト・予定表のPDF（A4縦1枚。LINEのその他機能からも同じ内容を出力する）
app.get('/api/handover-hoshi/pdf', async (c) => {
  const cal = await loadHoshiCalendar(c.env.DB, parseInt(c.req.query('year') || '', 10), parseInt(c.req.query('month') || '', 10));
  const bytes = await buildHoshiSchedulePdf(c.env, cal);
  if (!bytes) return c.text('PDF未設定（フォントが設定されていません）', 503);
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="hoshi_schedule_${cal.year}_${cal.month}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
});


// 星のシフト変更 → 班長シフトにそのまま書き込む（ルールは utils/hoshi_schedule.ts の saveHoshiShift）
app.put('/api/handover-hoshi/shift/:date', async (c) => {
  const date = c.req.param('date');
  if (!isValidDate(date)) return c.json({ error: '日付の指定が不正です' }, 400);
  if (!(await canEditShift(c))) return c.json({ error: '班長シフトの編集権限がありません' }, 403);
  const b = await c.req.json<{ code?: string; diagonal?: boolean }>().catch(() => ({}) as { code?: string; diagonal?: boolean });
  const by = await adminName(c);
  const r = await saveHoshiShift(c.env.DB, date, b.code ?? '', !!b.diagonal, { adminId: c.get('adminId'), by, logName: `${by}（星引き継ぎシート）` });
  return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
});

// 出勤時間（星シート専用。空文字で削除）
app.put('/api/handover-hoshi/work-time/:date', async (c) => {
  const date = c.req.param('date');
  if (!isValidDate(date)) return c.json({ error: '日付の指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ time?: string }>().catch(() => ({}) as { time?: string });
  const r = await saveHoshiWorkTime(c.env.DB, date, b.time ?? '', await adminName(c));
  return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
});

app.put('/api/handover-hoshi/memo/:date', async (c) => {
  const date = c.req.param('date');
  if (!isValidDate(date)) return c.json({ error: '日付の指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ content?: string }>().catch(() => ({}) as { content?: string });
  const r = await saveHoshiMemo(c.env.DB, date, b.content ?? '', await adminName(c));
  return r.ok ? c.json({ ok: true }) : c.json({ error: r.error }, r.status);
});

export default app;
