// 引き継ぎシート（課ごとの日次引き継ぎ）
// ページ: /handover
// API   : /api/handover/:division/*（編集系は権限ミドルウェアで <handover.edit> 必須）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { handoverPage, handoverHeaderTabs } from '../html/handover_sheet';
import { getAdminPermissions } from '../permissions';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

type Sheet = {
  division: number; date: string;
  kabu_yotei: number | null; kabu_jisseki: number | null; douta: string;
  main_content: string; toka_content: string; jiko_content: string;
  tenken_content: string; joshu_content: string; jomu_content: string;
  updated_at: string | null;
};

function isValidDivision(v: string): boolean {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= 1 && n <= 4;
}
function isValidDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().split('T')[0];
}

// 点検・車検・リコール欄の自動反映（点検車検表 inspection_schedules から生成）
// 色分けは点検管理画面（admin_inspection.ts）の凡例と統一: 点検=黒/車検=赤/ボンベ=青/代替=緑。
// リコールは黒だと点検と見分けがつかないため下線で区別する。
const INSPECTION_TYPE_STYLES: Record<string, string> = {
  inspect: 'color:#000',
  shaken: 'color:#c00',
  bomb: 'color:#0055bb',
  sub: 'color:#077',
  recall: 'color:#000;text-decoration:underline',
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function ymDay(date: string): { ym: string; day: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { ym: `${y}${String(m).padStart(2, '0')}`, day: d };
}

// 引き継ぎシートの日付(当日)と翌日の2日分、点検車検表(inspection_schedules)から
// 該当課の予定を組み立てる。日付は出さず「今日」「明日」の2行固定。予定が無い日は
// 行ごと省略し、両日とも無ければ空文字（手入力できるよう真っさらな状態）を返す。
async function buildTenkenContent(db: Env['DB'], division: number, sheetDate: string): Promise<string> {
  const days: { label: string; date: string }[] = [
    { label: '今日', date: sheetDate },
    { label: '明日', date: addDays(sheetDate, 1) },
  ];
  const lines: string[] = [];
  for (const { label, date } of days) {
    const { ym, day } = ymDay(date);
    const rows = await db.prepare(
      'SELECT vehicle_num, type FROM inspection_schedules WHERE ka = ? AND year_month = ? AND day = ? ORDER BY han, id'
    ).bind(division, ym, day).all<{ vehicle_num: string; type: string }>();
    const entries = rows.results ?? [];
    if (entries.length === 0) continue;
    const items = entries
      .map(e => `<span style="${INSPECTION_TYPE_STYLES[e.type] ?? 'color:#000'}">${escapeHtml(e.vehicle_num)}</span>`)
      .join('、');
    lines.push(`${label}：${items}`);
  }
  return lines.join('<br>');
}

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<{ id: number; name: string }> {
  const id = c.get('adminId');
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(id).first<{ username: string }>();
  return { id, name: row?.username ?? `id:${id}` };
}

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('handover.edit');
}

async function logAction(c: { env: Env; get: (k: 'adminId') => number }, action: string, division: number, date: string): Promise<void> {
  const { id, name } = await adminName(c);
  await c.env.DB.prepare(
    'INSERT INTO handover_edit_logs (admin_id, admin_name, action, division, date) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, name, action, division, date).run();
}

// ===== ページ =====
app.get('/handover', async (c) => {
  const editable = await canEdit(c);
  return c.html(layout('引き継ぎシート', handoverPage(editable), 'handover', handoverHeaderTabs()));
});

// ===== API =====
app.get('/api/handover/:division/dates', async (c) => {
  const division = c.req.param('division');
  if (!isValidDivision(division)) return c.json({ error: '課の指定が不正です' }, 400);
  const rows = await c.env.DB.prepare(
    'SELECT date FROM handover_sheets WHERE division = ? ORDER BY date DESC LIMIT 90'
  ).bind(parseInt(division, 10)).all<{ date: string }>();
  return c.json({ dates: (rows.results ?? []).map(r => r.date) });
});

// 当欠欄オートコンプリート用: 課内の在籍社員名を部分一致検索
app.get('/api/handover/:division/employee-suggest', async (c) => {
  const division = c.req.param('division');
  if (!isValidDivision(division)) return c.json({ error: '課の指定が不正です' }, 400);
  const q = (c.req.query('q') || '').trim();
  if (!q) return c.json({ names: [] });
  const rows = await c.env.DB.prepare(
    `SELECT name FROM employees WHERE division = ? AND is_active = 1 AND (name LIKE ? OR name_kana LIKE ?) ORDER BY name LIMIT 8`
  ).bind(parseInt(division, 10), `%${q}%`, `%${q}%`).all<{ name: string }>();
  return c.json({ names: (rows.results ?? []).map(r => r.name) });
});

// 点検・車検・車両異常欄オートコンプリート用: 課内の車番を前方一致検索
// 課は vehicle_teams.team から導出（1,2班=1課 / 3,4班=2課 / 5,6班=3課 / 7,8班=4課）
app.get('/api/handover/:division/car-suggest', async (c) => {
  const division = c.req.param('division');
  if (!isValidDivision(division)) return c.json({ error: '課の指定が不正です' }, 400);
  const q = (c.req.query('q') || '').trim();
  if (!q) return c.json({ car_nos: [] });
  const divNum = parseInt(division, 10);
  const t1 = divNum * 2 - 1;
  const t2 = divNum * 2;
  const rows = await c.env.DB.prepare(
    `SELECT car_no FROM vehicle_teams WHERE team IN (?, ?) AND car_no LIKE ?
     UNION
     SELECT car_no FROM employees WHERE division = ? AND car_no IS NOT NULL AND car_no != '' AND car_no LIKE ?
     ORDER BY car_no LIMIT 8`
  ).bind(t1, t2, `${q}%`, divNum, `${q}%`).all<{ car_no: string }>();
  return c.json({ car_nos: (rows.results ?? []).map(r => r.car_no) });
});

// 課ごとの本文文字サイズ設定（system_settings に handover_font_size_<課番号> で保存）
const FONT_SIZE_OPTIONS = new Set([12, 14, 16, 18]);

app.get('/api/handover/font-sizes', async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT key, value FROM system_settings WHERE key LIKE 'handover_font_size_%'"
  ).all<{ key: string; value: string }>();
  const sizes: Record<number, number> = { 1: 14, 2: 14, 3: 14, 4: 14 };
  for (const row of rows.results ?? []) {
    const d = parseInt(row.key.replace('handover_font_size_', ''), 10);
    const v = parseInt(row.value, 10);
    if (d >= 1 && d <= 4 && FONT_SIZE_OPTIONS.has(v)) sizes[d] = v;
  }
  return c.json({ sizes });
});

app.put('/api/handover/:division/font-size', async (c) => {
  const division = c.req.param('division');
  if (!isValidDivision(division)) return c.json({ error: '課の指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);

  const b = await c.req.json<{ size?: number }>().catch(() => ({}) as { size?: number });
  const size = Number(b.size);
  if (!FONT_SIZE_OPTIONS.has(size)) return c.json({ error: '文字サイズの指定が不正です' }, 400);

  const key = `handover_font_size_${parseInt(division, 10)}`;
  await c.env.DB.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, datetime('now','localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(key, String(size)).run();

  return c.json({ ok: true, size });
});

app.get('/api/handover/:division/:date', async (c) => {
  const division = c.req.param('division');
  const date = c.req.param('date');
  if (!isValidDivision(division) || !isValidDate(date)) return c.json({ error: '指定が不正です' }, 400);
  const sheet = await c.env.DB.prepare(
    'SELECT * FROM handover_sheets WHERE division = ? AND date = ?'
  ).bind(parseInt(division, 10), date).first<Sheet>();
  return c.json({ sheet: sheet ?? null });
});

app.put('/api/handover/:division/:date', async (c) => {
  const division = c.req.param('division');
  const date = c.req.param('date');
  if (!isValidDivision(division) || !isValidDate(date)) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);

  const b = await c.req.json<Partial<Sheet>>().catch(() => ({} as Partial<Sheet>));
  const divNum = parseInt(division, 10);
  await c.env.DB.prepare(`
    INSERT INTO handover_sheets
      (division, date, kabu_yotei, kabu_jisseki, douta, main_content, toka_content, jiko_content, tenken_content, joshu_content, jomu_content, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?)
    ON CONFLICT(division, date) DO UPDATE SET
      kabu_yotei = excluded.kabu_yotei, kabu_jisseki = excluded.kabu_jisseki, douta = excluded.douta,
      main_content = excluded.main_content, toka_content = excluded.toka_content, jiko_content = excluded.jiko_content,
      tenken_content = excluded.tenken_content, joshu_content = excluded.joshu_content, jomu_content = excluded.jomu_content,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).bind(
    divNum, date, b.kabu_yotei ?? null, b.kabu_jisseki ?? null, b.douta || '未',
    b.main_content ?? '', b.toka_content ?? '', b.jiko_content ?? '',
    b.tenken_content ?? '', b.joshu_content ?? '', b.jomu_content ?? '',
    (await adminName(c)).name,
  ).run();

  const saved = await c.env.DB.prepare('SELECT updated_at FROM handover_sheets WHERE division = ? AND date = ?')
    .bind(divNum, date).first<{ updated_at: string }>();
  await logAction(c, 'save', divNum, date);
  return c.json({ ok: true, updated_at: saved?.updated_at ?? null });
});

// 項目単位の部分保存。同じ課を複数アカウントが同時編集しても、他人が編集中の別項目を
// 上書きしないよう、保存のたびに全項目を送る方式（PUT）ではなく変更のあった1項目だけを更新する。
const PATCHABLE_FIELDS = new Set([
  'kabu_yotei', 'kabu_jisseki', 'douta', 'main_content', 'toka_content',
  'jiko_content', 'tenken_content', 'joshu_content', 'jomu_content',
]);
const NUMERIC_FIELDS = new Set(['kabu_yotei', 'kabu_jisseki']);

app.patch('/api/handover/:division/:date/field', async (c) => {
  const division = c.req.param('division');
  const date = c.req.param('date');
  if (!isValidDivision(division) || !isValidDate(date)) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);

  const b = await c.req.json<{ field?: string; value?: unknown }>().catch(() => ({}) as { field?: string; value?: unknown });
  const field = b.field;
  if (!field || !PATCHABLE_FIELDS.has(field)) return c.json({ error: '項目の指定が不正です' }, 400);

  const divNum = parseInt(division, 10);
  const exists = await c.env.DB.prepare(
    'SELECT 1 FROM handover_sheets WHERE division = ? AND date = ?'
  ).bind(divNum, date).first();
  if (!exists) return c.json({ error: 'シートが存在しません' }, 404);

  const value = NUMERIC_FIELDS.has(field)
    ? (b.value === null || b.value === undefined || b.value === '' ? null : Number(b.value))
    : (b.value ?? (field === 'douta' ? '未' : ''));

  await c.env.DB.prepare(
    `UPDATE handover_sheets SET ${field} = ?, updated_at = datetime('now','localtime'), updated_by = ? WHERE division = ? AND date = ?`
  ).bind(value, (await adminName(c)).name, divNum, date).run();

  const saved = await c.env.DB.prepare('SELECT updated_at FROM handover_sheets WHERE division = ? AND date = ?')
    .bind(divNum, date).first<{ updated_at: string }>();
  await logAction(c, 'save', divNum, date);
  return c.json({ ok: true, updated_at: saved?.updated_at ?? null });
});

app.delete('/api/handover/:division/:date', async (c) => {
  const division = c.req.param('division');
  const date = c.req.param('date');
  if (!isValidDivision(division) || !isValidDate(date)) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);

  const divNum = parseInt(division, 10);
  await c.env.DB.prepare('DELETE FROM handover_sheets WHERE division = ? AND date = ?').bind(divNum, date).run();
  await logAction(c, 'delete', divNum, date);
  return c.json({ ok: true });
});

app.post('/api/handover/:division/:date/next', async (c) => {
  const division = c.req.param('division');
  const date = c.req.param('date');
  if (!isValidDivision(division) || !isValidDate(date)) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);

  const divNum = parseInt(division, 10);
  const next = addDays(date, 1);

  // メイン引き継ぎ・事故車・車両異常/修理予定・乗務希望は前日の内容をそのまま引き継ぐ。
  // 点検・車検・リコールだけは前日の手入力メモを引き継がず、点検車検表(inspection_schedules)
  // の当日・翌日分から都度作り直す（内容が古くなるのを防ぐため）。空なら手入力用に空欄のまま。
  const cur = await c.env.DB.prepare(
    'SELECT main_content, jiko_content, joshu_content, jomu_content FROM handover_sheets WHERE division = ? AND date = ?'
  ).bind(divNum, date).first<{ main_content: string; jiko_content: string; joshu_content: string; jomu_content: string }>();
  const tenkenContent = await buildTenkenContent(c.env.DB, divNum, next);

  await c.env.DB.prepare(`
    INSERT OR IGNORE INTO handover_sheets
      (division, date, main_content, jiko_content, tenken_content, joshu_content, jomu_content, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?)
  `).bind(
    divNum, next,
    cur?.main_content ?? '', cur?.jiko_content ?? '', tenkenContent, cur?.joshu_content ?? '', cur?.jomu_content ?? '',
    (await adminName(c)).name,
  ).run();

  await logAction(c, 'next', divNum, next);
  return c.json({ nextDate: next });
});

export default app;
