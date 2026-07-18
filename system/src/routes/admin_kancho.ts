// 班長シフト（管理者公休予定表のWeb版）
// ページ: /kancho-shift（グリッド） /kancho-shift/print（印刷用）
// API   : /api/kancho/*（管理パス配下。編集系は権限ミドルウェアで <kancho-shift.edit> 必須）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { getPeriodSettings, getPeriodRange, getShiftDisplayRange, getPeriod } from '../auth';
import { layout } from '../html/layout';
import { kanchoShiftPage, kanchoPrintPage, type KanchoMember, type KanchoShiftType, type KanchoMemo, type KanchoCell } from '../html/kancho_shift';
import { getAdminPermissions } from '../permissions';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

// 操作した管理者名（履歴用）
async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<{ id: number; name: string }> {
  const id = c.get('adminId');
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(id).first<{ username: string }>();
  return { id, name: row?.username ?? `id:${id}` };
}

// 編集権限があるか（permissions NULL=全権限）
async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('kancho-shift.edit');
}

function parseYearMonth(c: { req: { query: (k: string) => string | undefined } }): { year: number; month: number } {
  const now = getPeriod(new Date().toISOString().split('T')[0]);
  const year = parseInt(c.req.query('year') ?? '') || now.year;
  const month = parseInt(c.req.query('month') ?? '') || now.month;
  return { year, month };
}

// ===== ページ =====
app.get('/kancho-shift', async (c) => {
  const { year, month } = parseYearMonth(c);
  const periodCfg = await getPeriodSettings(c.env.DB);
  const { start: periodStart, end: periodEnd } = getPeriodRange(year, month, periodCfg);
  const { start: dispStart, end: dispEnd, dates } = getShiftDisplayRange(year, month, periodCfg);

  const [members, types, shifts, memos] = await Promise.all([
    // 無効メンバーも取得（名簿管理モーダルで再有効化できるように。表への表示は画面側で絞る）
    c.env.DB.prepare('SELECT * FROM kancho_members ORDER BY section, sort_order, id').all<KanchoMember>(),
    c.env.DB.prepare('SELECT * FROM kancho_shift_types ORDER BY sort_order, id').all<KanchoShiftType>(),
    c.env.DB.prepare('SELECT member_id, date, code, is_diagonal, is_wish, cell_color FROM kancho_shifts WHERE date BETWEEN ? AND ?')
      .bind(dispStart, dispEnd).all<{ member_id: number; date: string; code: string; is_diagonal: number; is_wish: number; cell_color: string | null }>(),
    c.env.DB.prepare('SELECT * FROM kancho_memos WHERE year = ? AND month = ? ORDER BY kind, sort_order, id')
      .bind(year, month).all<KanchoMemo>(),
  ]);

  const shiftMap: Record<string, KanchoCell> = {};
  for (const s of (shifts.results ?? [])) {
    shiftMap[`${s.member_id}_${s.date}`] = { code: s.code, dg: s.is_diagonal, ws: s.is_wish, cl: s.cell_color };
  }

  const editable = await canEdit(c);
  const html = kanchoShiftPage(
    members.results ?? [], types.results ?? [], shiftMap, memos.results ?? [],
    dates, year, month, periodStart, periodEnd, editable
  );
  return c.html(layout('班長シフト', html, 'kancho-shift'));
});

app.get('/kancho-shift/print', async (c) => {
  const { year, month } = parseYearMonth(c);
  const periodCfg = await getPeriodSettings(c.env.DB);
  const { start: periodStart, end: periodEnd } = getPeriodRange(year, month, periodCfg);

  // 印刷は月度内のみ（前後の余白日は含めない）
  const dates: string[] = [];
  const cur = new Date(periodStart);
  const endD = new Date(periodEnd);
  while (cur <= endD) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }

  const [members, types, shifts, memos] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM kancho_members WHERE is_active = 1 ORDER BY section, sort_order, id').all<KanchoMember>(),
    c.env.DB.prepare('SELECT * FROM kancho_shift_types ORDER BY sort_order, id').all<KanchoShiftType>(),
    c.env.DB.prepare('SELECT member_id, date, code, is_diagonal, is_wish, cell_color FROM kancho_shifts WHERE date BETWEEN ? AND ?')
      .bind(periodStart, periodEnd).all<{ member_id: number; date: string; code: string; is_diagonal: number; is_wish: number; cell_color: string | null }>(),
    c.env.DB.prepare('SELECT * FROM kancho_memos WHERE year = ? AND month = ? ORDER BY kind, sort_order, id')
      .bind(year, month).all<KanchoMemo>(),
  ]);

  const shiftMap: Record<string, KanchoCell> = {};
  for (const s of (shifts.results ?? [])) {
    shiftMap[`${s.member_id}_${s.date}`] = { code: s.code, dg: s.is_diagonal, ws: s.is_wish, cl: s.cell_color };
  }

  return c.html(kanchoPrintPage(
    members.results ?? [], types.results ?? [], shiftMap, memos.results ?? [],
    dates, year, month, periodStart, periodEnd
  ));
});

// ===== API: シフト一括保存 =====
// 履歴用のセル値表記（例: 直(斜め)(希望休)[#ff99cc]）
function cellLabel(code: string, dg: number, ws: number, cl: string | null): string {
  if (!code && !dg && !ws && !cl) return '';
  return `${code}${dg ? '(斜め)' : ''}${ws ? '(希望休)' : ''}${cl ? `[${cl}]` : ''}`;
}

app.post('/api/kancho/shifts/batch', async (c) => {
  const body = await c.req.json<{ entries: Array<{ member_id: number; date: string; code: string | null; is_diagonal?: number; is_wish?: number; cell_color?: string | null }> }>();
  const entries = body.entries ?? [];
  if (entries.length === 0) return c.json({ ok: true, saved: 0 });
  if (entries.length > 500) return c.json({ error: '一度に保存できるのは500件までです' }, 400);

  const { id: adminId, name } = await adminName(c);

  // メンバー名（履歴用）
  const memberRows = await c.env.DB.prepare('SELECT id, name FROM kancho_members').all<{ id: number; name: string }>();
  const memberNames = new Map((memberRows.results ?? []).map(m => [m.id, m.name]));

  let saved = 0;
  for (const e of entries) {
    if (!e.member_id || !/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? '')) continue;
    const code = (e.code ?? '').trim();
    const dg = e.is_diagonal ? 1 : 0;
    const ws = e.is_wish ? 1 : 0;
    const cl = (e.cell_color && /^#[0-9a-fA-F]{6}$/.test(e.cell_color)) ? e.cell_color.toLowerCase() : null;
    const old = await c.env.DB.prepare('SELECT code, is_diagonal, is_wish, cell_color FROM kancho_shifts WHERE member_id = ? AND date = ?')
      .bind(e.member_id, e.date).first<{ code: string; is_diagonal: number; is_wish: number; cell_color: string | null }>();
    const oldLabel = old ? cellLabel(old.code, old.is_diagonal, old.is_wish, old.cell_color) : '';
    const newLabel = cellLabel(code, dg, ws, cl);
    if (oldLabel === newLabel) continue;

    const stmts = [];
    if (code === '' && !dg && !ws && !cl) {
      // 完全な空（色上書きもなし）は行ごと削除 = 自動表示（班色出勤）に戻る
      stmts.push(c.env.DB.prepare('DELETE FROM kancho_shifts WHERE member_id = ? AND date = ?').bind(e.member_id, e.date));
    } else {
      stmts.push(c.env.DB.prepare(
        `INSERT INTO kancho_shifts (member_id, date, code, is_diagonal, is_wish, cell_color, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?)
         ON CONFLICT(member_id, date) DO UPDATE SET code = excluded.code, is_diagonal = excluded.is_diagonal, is_wish = excluded.is_wish, cell_color = excluded.cell_color, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
      ).bind(e.member_id, e.date, code, dg, ws, cl, name));
    }
    stmts.push(c.env.DB.prepare(
      'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, date, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(adminId, name, 'shift', memberNames.get(e.member_id) ?? `member:${e.member_id}`, e.date, oldLabel, newLabel));
    await c.env.DB.batch(stmts);
    saved++;
  }
  return c.json({ ok: true, saved });
});

// ===== API: 編集履歴 =====
app.get('/api/kancho/logs', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '200') || 200, 500);
  const rows = await c.env.DB.prepare(
    'SELECT admin_name, action, target, date, old_value, new_value, created_at FROM kancho_edit_logs ORDER BY id DESC LIMIT ?'
  ).bind(limit).all();
  return c.json({ logs: rows.results ?? [] });
});

// ===== API: メンバー名簿 =====
app.post('/api/kancho/members', async (c) => {
  const b = await c.req.json<{ name?: string; role?: string; section?: string; sort_order?: number; team_color?: string | null; is_indoor?: number }>();
  const nm = (b.name ?? '').trim();
  if (!nm) return c.json({ error: '名前を入力してください' }, 400);
  const section = ['main', 's1', 's2'].includes(b.section ?? '') ? b.section : 'main';
  const color = (b.team_color && /^#[0-9a-fA-F]{6}$/.test(b.team_color)) ? b.team_color.toLowerCase() : null;
  const { id: adminId, name } = await adminName(c);
  await c.env.DB.prepare(
    'INSERT INTO kancho_members (name, role, section, sort_order, team_color, is_indoor) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(nm, b.role || null, section, b.sort_order ?? 0, color, b.is_indoor === 0 ? 0 : 1).run();
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, new_value) VALUES (?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'member', nm, `追加（${b.role || section}）`).run();
  return c.json({ ok: true });
});

app.put('/api/kancho/members/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ name?: string; role?: string; section?: string; sort_order?: number; is_active?: number; team_color?: string | null; is_indoor?: number }>();
  const old = await c.env.DB.prepare('SELECT * FROM kancho_members WHERE id = ?').bind(id).first<KanchoMember>();
  if (!old) return c.json({ error: 'メンバーが見つかりません' }, 404);
  const nm = (b.name ?? old.name).trim();
  if (!nm) return c.json({ error: '名前を入力してください' }, 400);
  const section = ['main', 's1', 's2'].includes(b.section ?? '') ? b.section! : old.section;
  let color = old.team_color;
  if (b.team_color !== undefined) {
    color = (b.team_color && /^#[0-9a-fA-F]{6}$/.test(b.team_color)) ? b.team_color.toLowerCase() : null;
  }
  const indoor = b.is_indoor !== undefined ? (b.is_indoor ? 1 : 0) : old.is_indoor;
  const { id: adminId, name } = await adminName(c);
  const memberDesc = (m: { name: string; role: string | null; section: string; sort_order: number; is_active: number }, tc: string | null, ind: number) =>
    `${m.name}/${m.role ?? ''}/${m.section}/順${m.sort_order}/${tc ?? '色なし'}/${ind ? '内勤' : '乗務'}/${m.is_active ? '有効' : '無効'}`;
  await c.env.DB.prepare(
    `UPDATE kancho_members SET name = ?, role = ?, section = ?, sort_order = ?, is_active = ?, team_color = ?, is_indoor = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).bind(nm, b.role !== undefined ? (b.role || null) : old.role, section,
         b.sort_order ?? old.sort_order, b.is_active ?? old.is_active, color, indoor, id).run();
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'member', old.name,
         memberDesc(old, old.team_color, old.is_indoor),
         memberDesc({ name: nm, role: b.role !== undefined ? (b.role || null) : old.role, section, sort_order: b.sort_order ?? old.sort_order, is_active: b.is_active ?? old.is_active }, color, indoor)).run();
  return c.json({ ok: true });
});

// ===== API: 記号マスタ =====
app.post('/api/kancho/types', async (c) => {
  const b = await c.req.json<{ code?: string; label?: string; color?: string; section?: string; daily_required?: number; sort_order?: number; use_team_color?: number; counts_as_work?: number; counts_as_off?: number }>();
  const code = (b.code ?? '').trim();
  if (!code) return c.json({ error: '記号を入力してください' }, 400);
  const section = ['main', 'sub', 'all'].includes(b.section ?? '') ? b.section : 'main';
  const { id: adminId, name } = await adminName(c);
  try {
    await c.env.DB.prepare(
      'INSERT INTO kancho_shift_types (code, label, color, section, daily_required, sort_order, use_team_color, counts_as_work, counts_as_off) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(code, b.label ?? '', b.color ?? '#e5e7eb', section, b.daily_required ?? 0, b.sort_order ?? 0,
           b.use_team_color ? 1 : 0, b.counts_as_work ? 1 : 0, b.counts_as_off ? 1 : 0).run();
  } catch {
    return c.json({ error: '同じ記号が既に登録されています' }, 400);
  }
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, new_value) VALUES (?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'type', code, '記号追加').run();
  return c.json({ ok: true });
});

app.put('/api/kancho/types/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ code?: string; label?: string; color?: string; section?: string; daily_required?: number; sort_order?: number; is_active?: number; use_team_color?: number; counts_as_work?: number; counts_as_off?: number }>();
  const old = await c.env.DB.prepare('SELECT * FROM kancho_shift_types WHERE id = ?').bind(id).first<KanchoShiftType>();
  if (!old) return c.json({ error: '記号が見つかりません' }, 404);
  const code = (b.code ?? old.code).trim();
  if (!code) return c.json({ error: '記号を入力してください' }, 400);
  const section = ['main', 'sub', 'all'].includes(b.section ?? '') ? b.section! : old.section;
  const { id: adminId, name } = await adminName(c);
  try {
    await c.env.DB.prepare(
      'UPDATE kancho_shift_types SET code = ?, label = ?, color = ?, section = ?, daily_required = ?, sort_order = ?, is_active = ?, use_team_color = ?, counts_as_work = ?, counts_as_off = ? WHERE id = ?'
    ).bind(code, b.label ?? old.label, b.color ?? old.color, section,
           b.daily_required ?? old.daily_required,
           b.sort_order ?? old.sort_order, b.is_active ?? old.is_active,
           b.use_team_color ?? old.use_team_color, b.counts_as_work ?? old.counts_as_work, b.counts_as_off ?? old.counts_as_off, id).run();
  } catch {
    return c.json({ error: '同じ記号が既に登録されています' }, 400);
  }
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'type', code, `${old.code}/${old.label}/${old.color}`, `${code}/${b.label ?? old.label}/${b.color ?? old.color}`).run();
  return c.json({ ok: true });
});

// ===== API: メモ（特記事項・希望休を月度ごとに丸ごと置き換え）=====
app.post('/api/kancho/memos', async (c) => {
  const b = await c.req.json<{ year: number; month: number; tokki?: string; kibou?: Array<{ title: string; content: string }> }>();
  if (!b.year || !b.month) return c.json({ error: 'year/month が必要です' }, 400);
  const { id: adminId, name } = await adminName(c);

  const stmts = [
    c.env.DB.prepare('DELETE FROM kancho_memos WHERE year = ? AND month = ?').bind(b.year, b.month),
  ];
  const tokki = (b.tokki ?? '').trim();
  if (tokki) {
    stmts.push(c.env.DB.prepare(
      'INSERT INTO kancho_memos (year, month, kind, title, content, sort_order) VALUES (?, ?, ?, ?, ?, 0)'
    ).bind(b.year, b.month, 'tokki', '', tokki));
  }
  (b.kibou ?? []).forEach((k, i) => {
    const title = (k.title ?? '').trim();
    const content = (k.content ?? '').trim();
    if (!title && !content) return;
    stmts.push(c.env.DB.prepare(
      'INSERT INTO kancho_memos (year, month, kind, title, content, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(b.year, b.month, 'kibou', title, content, (i + 1) * 10));
  });
  stmts.push(c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, new_value) VALUES (?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'memo', `${b.year}年${b.month}月度`, 'メモ更新'));
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

export default app;
