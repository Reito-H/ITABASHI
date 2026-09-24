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
function isValidMonth(v: string): boolean {
  return /^\d{4}-\d{2}$/.test(v);
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

async function logAction(c: { env: Env; get: (k: 'adminId') => number }, action: string, division: number, date: string, admin?: { id: number; name: string }): Promise<void> {
  const { id, name } = admin ?? await adminName(c);
  await c.env.DB.prepare(
    'INSERT INTO handover_edit_logs (admin_id, admin_name, action, division, date) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, name, action, division, date).run();
}

// ===== ページ =====
app.get('/handover', async (c) => {
  const editable = await canEdit(c);
  const row = await c.env.DB.prepare('SELECT division FROM admins WHERE id = ?')
    .bind(c.get('adminId')).first<{ division: string | null }>();
  return c.html(layout('引き継ぎシート', handoverPage(editable, row?.division ?? null), 'handover', handoverHeaderTabs()));
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

// 当欠・理由欄のパーサー。「名前 -0.5」「名前 -1.0」のように候補選択で正しく入力された
// 行を当欠として扱う（+の代走行は対象外）。±数値ピッカーで確定すると自動で改行が
// 入り理由は次の行に続けて書く形になるため、当欠行の直後の行が別の当欠行でなければ
// それを理由として扱う（例:「山田 -1.0」の次の行が「通院」ならreason="通院"）。
//
// 値の後ろに文字が続く行（同じ行に理由や注記を続けて書いた場合。例:「井出 -1.0 8/6-8特休」
// 「岩崎 -0.5（B→a）」）は、以前は行全体が当欠行として認識されず該当者が丸ごと集計から
// 消えていた。名前と値の間に空白が最低1つあれば当欠行とみなし、値より後ろの文字列は
// そのまま同じ行の理由として扱う（日付表記「8/6-8」等を誤って当欠行として拾わないよう、
// 名前と値の間の空白は必須にしている）。値も±数値ピッカーの0.5/1.0限定ではなく、
// 手入力された任意の小数（例:「入力ミス-2.5」）まで対象にし、誤入力の記録も
// 当欠記録に表示されて気づけるようにする。
// toka-summary/toka-detailで共用する。
const TOKA_ENTRY_RE = /^(.+?)\s+-(\d+(?:\.\d+)?)(.*)$/;
function parseTokaLines(content: string): { name: string; value: number; reason: string }[] {
  const lines = (content || '').split('\n');
  const isEntryLine = (s: string) => TOKA_ENTRY_RE.test(s.trim());
  const entries: { name: string; value: number; reason: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const m = line.match(TOKA_ENTRY_RE);
    if (!m) continue;
    const name = m[1].trim();
    if (!name) continue;
    const value = parseFloat(m[2]);
    if (!Number.isFinite(value) || value <= 0) continue;
    const sameLineReason = m[3].trim();
    let reason = sameLineReason;
    if (!reason) {
      const nextLine = (lines[i + 1] || '').trim();
      reason = (nextLine && !isEntryLine(nextLine)) ? nextLine : '';
    }
    entries.push({ name, value: -value, reason });
  }
  return entries;
}

// 「＋」ボタン経由の登録（handover_toka_entries）は本文（toka_content）に理由を書かないため、
// parseTokaLinesだけでは理由が空になる。同じ日の構造化データを名前・数値が一致する行の
// 出現順に1件ずつ消費して割り当て、理由を補完する（本文の行が編集・削除されて一致しなくなった
// 構造化データは、以後どの集計にも登場しなくなる＝本文が唯一の正になる設計）。
type TokaEntry = { name: string; value: number; reason: string };
type StructuredTokaRow = { name: string; value: number; reason: string };
function mergeStructuredReasons(parsed: TokaEntry[], structured: StructuredTokaRow[]): TokaEntry[] {
  const pool = structured.slice();
  return parsed.map(e => {
    const idx = pool.findIndex(s => s.name === e.name && Math.abs(s.value - e.value) < 0.001);
    if (idx === -1) return e;
    const [s] = pool.splice(idx, 1);
    return s.reason ? { ...e, reason: s.reason } : e;
  });
}
async function loadStructuredTokaByDate(db: Env['DB'], divNum: number, dateFrom: string, dateTo: string): Promise<Map<string, StructuredTokaRow[]>> {
  const rows = await db.prepare(
    'SELECT date, name, value, reason FROM handover_toka_entries WHERE division = ? AND date >= ? AND date < ? ORDER BY date, id'
  ).bind(divNum, dateFrom, dateTo).all<{ date: string; name: string; value: number; reason: string }>();
  const map = new Map<string, StructuredTokaRow[]>();
  for (const r of rows.results ?? []) {
    const list = map.get(r.date) ?? [];
    list.push({ name: r.name, value: r.value, reason: r.reason || '' });
    map.set(r.date, list);
  }
  return map;
}

// 当欠・理由欄の月間集計（記録ページ用）。日別の一覧・理由別ランキングに加え、当欠回数が多い人のランキングも返す。
app.get('/api/handover/:division/toka-summary', async (c) => {
  const division = c.req.param('division');
  if (!isValidDivision(division)) return c.json({ error: '課の指定が不正です' }, 400);
  const month = c.req.query('month') || '';
  if (!isValidMonth(month)) return c.json({ error: '月の指定が不正です' }, 400);
  const divNum = parseInt(division, 10);

  const rows = await c.env.DB.prepare(
    'SELECT date, toka_content FROM handover_sheets WHERE division = ? AND date LIKE ? ORDER BY date'
  ).bind(divNum, `${month}%`).all<{ date: string; toka_content: string }>();
  const structuredByDate = await loadStructuredTokaByDate(c.env.DB, divNum, `${month}-01`, `${month}-32`);

  const entries: { date: string; name: string; value: number; reason: string }[] = [];
  for (const row of rows.results ?? []) {
    const parsed = mergeStructuredReasons(parseTokaLines(row.toka_content || ''), structuredByDate.get(row.date) ?? []);
    for (const e of parsed) entries.push({ date: row.date, name: e.name, value: e.value, reason: e.reason });
  }

  const byName = new Map<string, { count: number; total: number }>();
  const byReason = new Map<string, number>();
  for (const e of entries) {
    const cur = byName.get(e.name) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += Math.abs(e.value);
    byName.set(e.name, cur);
    const reasonKey = e.reason || '(理由未記入)';
    byReason.set(reasonKey, (byReason.get(reasonKey) ?? 0) + 1);
  }
  const ranking = [...byName.entries()]
    .map(([name, v]) => ({ name, count: v.count, total: v.total }))
    .sort((a, b) => b.count - a.count || b.total - a.total);
  const reasonRanking = [...byReason.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return c.json({ entries, count: entries.length, ranking, reasonRanking });
});

// 個人別の当欠傾向詳細。指定月を末尾として過去monthsヶ月分を走査し、対象nameに完全一致する
// 当欠行だけを抽出して月別推移・曜日別件数・理由の内訳を返す。
app.get('/api/handover/:division/toka-detail', async (c) => {
  const division = c.req.param('division');
  if (!isValidDivision(division)) return c.json({ error: '課の指定が不正です' }, 400);
  const month = c.req.query('month') || '';
  if (!isValidMonth(month)) return c.json({ error: '月の指定が不正です' }, 400);
  const name = (c.req.query('name') || '').trim();
  if (!name) return c.json({ error: '氏名の指定が不正です' }, 400);
  const months = Math.min(24, Math.max(1, parseInt(c.req.query('months') || '6', 10) || 6));

  const [endY, endM] = month.split('-').map(Number);
  const endMonthIndex = endY * 12 + (endM - 1);
  const startMonthIndex = endMonthIndex - (months - 1);
  const startYm = `${Math.floor(startMonthIndex / 12)}-${String(startMonthIndex % 12 + 1).padStart(2, '0')}`;

  const divNum = parseInt(division, 10);
  const rows = await c.env.DB.prepare(
    'SELECT date, toka_content FROM handover_sheets WHERE division = ? AND date >= ? AND date < ? ORDER BY date'
  ).bind(divNum, `${startYm}-01`, `${month}-32`).all<{ date: string; toka_content: string }>();
  const structuredByDate = await loadStructuredTokaByDate(c.env.DB, divNum, `${startYm}-01`, `${month}-32`);

  const monthlyMap = new Map<string, { count: number; total: number }>();
  const weekday = [0, 0, 0, 0, 0, 0, 0];
  const reasonMap = new Map<string, number>();
  const entries: { date: string; value: number; reason: string }[] = [];

  for (const row of rows.results ?? []) {
    const ym = row.date.slice(0, 7);
    const dayParsed = mergeStructuredReasons(parseTokaLines(row.toka_content || ''), structuredByDate.get(row.date) ?? []);
    for (const parsed of dayParsed) {
      if (parsed.name !== name) continue;
      const cur = monthlyMap.get(ym) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += Math.abs(parsed.value);
      monthlyMap.set(ym, cur);
      weekday[new Date(row.date + 'T00:00:00Z').getUTCDay()] += 1;
      const reasonKey = parsed.reason || '(理由未記入)';
      reasonMap.set(reasonKey, (reasonMap.get(reasonKey) ?? 0) + 1);
      entries.push({ date: row.date, value: parsed.value, reason: parsed.reason });
    }
  }

  const monthly: { ym: string; count: number; total: number }[] = [];
  for (let i = 0; i < months; i++) {
    const idx = startMonthIndex + i;
    const ym = `${Math.floor(idx / 12)}-${String(idx % 12 + 1).padStart(2, '0')}`;
    const v = monthlyMap.get(ym) ?? { count: 0, total: 0 };
    monthly.push({ ym, count: v.count, total: v.total });
  }
  const reasons = [...reasonMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return c.json({ name, monthly, weekday, reasons, entries });
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

// ===== 車両管理（事故車・故障車の稼働離脱管理表。課ごとの表、行の追加・削除は手動） =====
type VehicleStatusRow = {
  id: number; car_no: string; expected_return_date: string | null; note: string;
  accident_report_id: number | null; sort_order: number;
  acc_created_at: string | null; acc_employee_name: string | null; acc_accident_type: string | null; acc_location: string | null;
};
const VEHICLE_STATUS_CATEGORIES = new Set(['accident', 'breakdown']);

function vehicleStatusJson(r: VehicleStatusRow) {
  return {
    id: r.id, car_no: r.car_no, expected_return_date: r.expected_return_date, note: r.note,
    accidentReportId: r.accident_report_id,
    accidentSummary: r.accident_report_id ? {
      date: (r.acc_created_at || '').slice(0, 10), employeeName: r.acc_employee_name || '',
      accidentType: r.acc_accident_type || '', location: r.acc_location || '',
    } : null,
  };
}

// 代替（点検管理表 inspection_schedules の type='sub' を自動反映するだけの読み取り専用リスト。
// 手動追加・削除は無く、編集は点検管理表側で行う）。本日以降の予定のみ、日付の早い順に返す。
async function loadUpcomingSubstitutes(db: Env['DB'], divNum: number): Promise<{ car_no: string; date: string }[]> {
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayStr = nowJST.toISOString().split('T')[0];
  const rows = await db.prepare(`
    SELECT vehicle_num, year_month, day
    FROM inspection_schedules
    WHERE ka = ? AND type = 'sub'
      AND (substr(year_month,1,4) || '-' || substr(year_month,5,2) || '-' || substr('00' || day, -2)) >= ?
    ORDER BY year_month, day
  `).bind(divNum, todayStr).all<{ vehicle_num: string; year_month: string; day: number }>();
  return (rows.results ?? []).map(r => ({
    car_no: r.vehicle_num,
    date: `${r.year_month.slice(0, 4)}-${r.year_month.slice(4, 6)}-${String(r.day).padStart(2, '0')}`,
  }));
}

app.get('/api/handover/:division/vehicle-status', async (c) => {
  const division = c.req.param('division');
  if (!isValidDivision(division)) return c.json({ error: '課の指定が不正です' }, 400);
  const divNum = parseInt(division, 10);
  const rows = await c.env.DB.prepare(`
    SELECT v.id, v.category, v.car_no, v.expected_return_date, v.note, v.accident_report_id, v.sort_order,
           a.created_at AS acc_created_at, a.employee_name AS acc_employee_name,
           a.accident_type AS acc_accident_type, a.location AS acc_location
    FROM handover_vehicle_status v
    LEFT JOIN accident_reports a ON a.id = v.accident_report_id
    WHERE v.division = ?
    ORDER BY v.category, v.sort_order, v.id
  `).bind(divNum).all<VehicleStatusRow & { category: string }>();

  const accident: ReturnType<typeof vehicleStatusJson>[] = [];
  const breakdown: ReturnType<typeof vehicleStatusJson>[] = [];
  for (const r of rows.results ?? []) {
    (r.category === 'breakdown' ? breakdown : accident).push(vehicleStatusJson(r));
  }
  const substitute = await loadUpcomingSubstitutes(c.env.DB, divNum);
  return c.json({ accident, breakdown, substitute });
});

app.post('/api/handover/:division/vehicle-status', async (c) => {
  const division = c.req.param('division');
  if (!isValidDivision(division)) return c.json({ error: '課の指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ category?: string; car_no?: string }>().catch(() => ({}) as { category?: string; car_no?: string });
  const category = b.category || '';
  const carNo = (b.car_no || '').trim();
  if (!VEHICLE_STATUS_CATEGORIES.has(category)) return c.json({ error: '区分の指定が不正です' }, 400);
  if (!carNo) return c.json({ error: '車番を入力してください' }, 400);

  const divNum = parseInt(division, 10);
  const admin = await adminName(c);
  const maxRow = await c.env.DB.prepare(
    'SELECT MAX(sort_order) AS m FROM handover_vehicle_status WHERE division = ? AND category = ?'
  ).bind(divNum, category).first<{ m: number | null }>();
  const sortOrder = (maxRow?.m ?? -1) + 1;

  const r = await c.env.DB.prepare(
    `INSERT INTO handover_vehicle_status (division, category, car_no, sort_order, created_by) VALUES (?, ?, ?, ?, ?)`
  ).bind(divNum, category, carNo, sortOrder, admin.name).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

app.patch('/api/handover/:division/vehicle-status/:id', async (c) => {
  const division = c.req.param('division');
  const id = parseInt(c.req.param('id'), 10);
  if (!isValidDivision(division) || !id) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const divNum = parseInt(division, 10);
  const existing = await c.env.DB.prepare(
    'SELECT id, car_no FROM handover_vehicle_status WHERE id = ? AND division = ?'
  ).bind(id, divNum).first<{ id: number; car_no: string }>();
  if (!existing) return c.json({ error: 'データが存在しません' }, 404);

  const b = await c.req.json<{ car_no?: string; expected_return_date?: string | null; note?: string }>()
    .catch(() => ({}) as { car_no?: string; expected_return_date?: string | null; note?: string });

  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  // 車番を変更した場合、旧車番に紐づけていた事故記録は無関係になるため紐づけを解除する
  // （紐づけ直しは車両管理パネルの「事故紐付け」から改めて行う想定）
  if (b.car_no !== undefined) {
    const carNo = b.car_no.trim();
    if (!carNo) return c.json({ error: '車番を入力してください' }, 400);
    sets.push('car_no = ?'); values.push(carNo);
    if (carNo !== existing.car_no) { sets.push('accident_report_id = NULL'); }
  }
  if (b.expected_return_date !== undefined) {
    const v = b.expected_return_date;
    if (v !== null && v !== '' && !isValidDate(v)) return c.json({ error: '日付の形式が不正です' }, 400);
    sets.push('expected_return_date = ?'); values.push(v === '' ? null : v);
  }
  if (b.note !== undefined) { sets.push('note = ?'); values.push(b.note.slice(0, 200)); }
  if (!sets.length) return c.json({ error: '更新項目がありません' }, 400);

  await c.env.DB.prepare(
    `UPDATE handover_vehicle_status SET ${sets.join(', ')} WHERE id = ?`
  ).bind(...values, id).run();
  return c.json({ ok: true });
});

app.delete('/api/handover/:division/vehicle-status/:id', async (c) => {
  const division = c.req.param('division');
  const id = parseInt(c.req.param('id'), 10);
  if (!isValidDivision(division) || !id) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const r = await c.env.DB.prepare(
    'DELETE FROM handover_vehicle_status WHERE id = ? AND division = ?'
  ).bind(id, parseInt(division, 10)).run();
  if (r.meta.changes === 0) return c.json({ error: 'データが存在しません' }, 404);
  return c.json({ ok: true });
});

// 事故紐付け候補の検索。その行の現在の車番(vehicle_no)で事故記録を新しい順に最大10件返す
app.get('/api/handover/:division/vehicle-status/:id/accident-candidates', async (c) => {
  const division = c.req.param('division');
  const id = parseInt(c.req.param('id'), 10);
  if (!isValidDivision(division) || !id) return c.json({ error: '指定が不正です' }, 400);
  const divNum = parseInt(division, 10);
  const row = await c.env.DB.prepare(
    `SELECT car_no FROM handover_vehicle_status WHERE id = ? AND division = ? AND category = 'accident'`
  ).bind(id, divNum).first<{ car_no: string }>();
  if (!row) return c.json({ error: 'データが存在しません' }, 404);

  const rows = await c.env.DB.prepare(
    `SELECT id, created_at, employee_name, accident_type, location, status
     FROM accident_reports WHERE vehicle_no = ? ORDER BY created_at DESC LIMIT 10`
  ).bind(row.car_no).all<{ id: number; created_at: string; employee_name: string; accident_type: string; location: string; status: string }>();
  return c.json({
    car_no: row.car_no,
    candidates: (rows.results ?? []).map(r => ({
      id: r.id, date: (r.created_at || '').slice(0, 10), employeeName: r.employee_name || '',
      accidentType: r.accident_type || '', location: r.location || '', status: r.status,
    })),
  });
});

// 事故紐付けの確定/解除。accidentReportId に null を渡すと解除する
app.post('/api/handover/:division/vehicle-status/:id/link-accident', async (c) => {
  const division = c.req.param('division');
  const id = parseInt(c.req.param('id'), 10);
  if (!isValidDivision(division) || !id) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const divNum = parseInt(division, 10);
  const existing = await c.env.DB.prepare(
    `SELECT id, car_no FROM handover_vehicle_status WHERE id = ? AND division = ? AND category = 'accident'`
  ).bind(id, divNum).first<{ id: number; car_no: string }>();
  if (!existing) return c.json({ error: 'データが存在しません' }, 404);

  const b = await c.req.json<{ accidentReportId?: number | null }>().catch(() => ({}) as { accidentReportId?: number | null });
  if (b.accidentReportId === null) {
    await c.env.DB.prepare('UPDATE handover_vehicle_status SET accident_report_id = NULL WHERE id = ?').bind(id).run();
    return c.json({ ok: true });
  }
  const accidentReportId = Number(b.accidentReportId);
  if (!Number.isInteger(accidentReportId) || accidentReportId <= 0) return c.json({ error: '事故記録の指定が不正です' }, 400);
  const accident = await c.env.DB.prepare('SELECT id, vehicle_no FROM accident_reports WHERE id = ?')
    .bind(accidentReportId).first<{ id: number; vehicle_no: string }>();
  if (!accident) return c.json({ error: '事故記録が見つかりません' }, 404);
  if (accident.vehicle_no !== existing.car_no) return c.json({ error: '車番が一致しない事故記録です' }, 400);

  await c.env.DB.prepare('UPDATE handover_vehicle_status SET accident_report_id = ? WHERE id = ?')
    .bind(accidentReportId, id).run();
  return c.json({ ok: true });
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

// ===== 表示セクション構成（右カラムの特別枠5項目＋自由追加できるカスタム枠） =====
type SectionRow = {
  id: number; division: number; section_key: string; kind: 'special' | 'custom';
  label: string; sort_order: number; height_size: string; is_active: number;
};
const HEIGHT_SIZES = new Set(['small', 'normal', 'large', 'xlarge']);

app.get('/api/handover/:division/sections', async (c) => {
  const division = c.req.param('division');
  if (!isValidDivision(division)) return c.json({ error: '課の指定が不正です' }, 400);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM handover_sections WHERE division = ? ORDER BY sort_order, id'
  ).bind(parseInt(division, 10)).all<SectionRow>();
  return c.json({ sections: rows.results ?? [] });
});

app.post('/api/handover/:division/sections', async (c) => {
  const division = c.req.param('division');
  if (!isValidDivision(division)) return c.json({ error: '課の指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ label?: string }>().catch(() => ({}) as { label?: string });
  const label = (b.label || '').trim();
  if (!label) return c.json({ error: 'セクション名を入力してください' }, 400);

  const divNum = parseInt(division, 10);
  const maxRow = await c.env.DB.prepare(
    'SELECT MAX(sort_order) AS m FROM handover_sections WHERE division = ?'
  ).bind(divNum).first<{ m: number | null }>();
  const sortOrder = (maxRow?.m ?? -1) + 1;
  const sectionKey = `custom_${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`;

  const r = await c.env.DB.prepare(
    `INSERT INTO handover_sections (division, section_key, kind, label, sort_order, height_size, updated_at)
     VALUES (?, ?, 'custom', ?, ?, 'normal', datetime('now','localtime'))`
  ).bind(divNum, sectionKey, label, sortOrder).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

app.patch('/api/handover/:division/sections/:id', async (c) => {
  const division = c.req.param('division');
  const id = parseInt(c.req.param('id'), 10);
  if (!isValidDivision(division) || !id) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ label?: string; height_size?: string; is_active?: boolean }>().catch(() => ({}) as { label?: string; height_size?: string; is_active?: boolean });

  const divNum = parseInt(division, 10);
  const existing = await c.env.DB.prepare(
    'SELECT * FROM handover_sections WHERE id = ? AND division = ?'
  ).bind(id, divNum).first<SectionRow>();
  if (!existing) return c.json({ error: 'セクションが存在しません' }, 404);

  const label = b.label !== undefined ? b.label.trim() : existing.label;
  if (!label) return c.json({ error: 'セクション名を入力してください' }, 400);
  const heightSize = b.height_size !== undefined ? b.height_size : existing.height_size;
  if (!HEIGHT_SIZES.has(heightSize)) return c.json({ error: '高さの指定が不正です' }, 400);
  const isActive = b.is_active !== undefined ? (b.is_active ? 1 : 0) : existing.is_active;

  await c.env.DB.prepare(
    `UPDATE handover_sections SET label = ?, height_size = ?, is_active = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).bind(label, heightSize, isActive, id).run();
  return c.json({ ok: true });
});

app.put('/api/handover/:division/sections/reorder', async (c) => {
  const division = c.req.param('division');
  if (!isValidDivision(division)) return c.json({ error: '課の指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ order?: number[] }>().catch(() => ({}) as { order?: number[] });
  const order = b.order;
  if (!Array.isArray(order) || order.length === 0 || order.length > 50) {
    return c.json({ error: 'リクエストが不正です' }, 400);
  }
  const divNum = parseInt(division, 10);
  const stmt = c.env.DB.prepare(
    `UPDATE handover_sections SET sort_order = ?, updated_at = datetime('now','localtime') WHERE id = ? AND division = ?`
  );
  await c.env.DB.batch(order.map((id, idx) => stmt.bind(idx, id, divNum)));
  return c.json({ ok: true });
});

app.delete('/api/handover/:division/sections/:id', async (c) => {
  const division = c.req.param('division');
  const id = parseInt(c.req.param('id'), 10);
  if (!isValidDivision(division) || !id) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);

  const divNum = parseInt(division, 10);
  const existing = await c.env.DB.prepare(
    'SELECT * FROM handover_sections WHERE id = ? AND division = ?'
  ).bind(id, divNum).first<SectionRow>();
  if (!existing) return c.json({ error: 'セクションが存在しません' }, 404);
  if (existing.kind === 'special') return c.json({ error: '特別枠は削除できません。非表示にしてください' }, 400);

  await c.env.DB.prepare('DELETE FROM handover_section_content WHERE section_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM handover_sections WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ===== メーター検査フローティング表（引き継ぎシート専用の簡易台帳） =====
// 点検管理ページの meter_inspections（vehicle_teams連動の全社共通台帳）とは完全に独立したデータ。
// 車番も手入力で、行の追加・削除も自由に行える（紙の台帳をそのままデジタル化したもの）。
type MeterEntryRow = {
  id: number; division: number; team: number; car_no: string;
  tentative_assignee_name: string | null; inspection_date: string | null; tentative_limit: string | null;
  honkensa_assignee_name: string | null; honkensa_limit: string | null; sort_order: number;
};
const METER_ENTRY_FIELDS = ['car_no', 'tentative_assignee_name', 'inspection_date', 'tentative_limit', 'honkensa_assignee_name', 'honkensa_limit'] as const;
type MeterEntryField = typeof METER_ENTRY_FIELDS[number];
const METER_ENTRY_DATE_FIELDS = new Set(['inspection_date', 'tentative_limit', 'honkensa_limit']);

function teamsForDivision(divNum: number): [number, number] {
  const lo = (divNum - 1) * 2 + 1;
  return [lo, lo + 1];
}

app.get('/api/handover/:division/meter-entries', async (c) => {
  const division = c.req.param('division');
  if (!isValidDivision(division)) return c.json({ error: '課の指定が不正です' }, 400);
  const [t1, t2] = teamsForDivision(parseInt(division, 10));
  const rows = await c.env.DB.prepare(
    'SELECT * FROM handover_meter_entries WHERE team IN (?, ?) ORDER BY team, sort_order, id'
  ).bind(t1, t2).all<MeterEntryRow>();
  return c.json({ entries: rows.results ?? [] });
});

app.post('/api/handover/:division/meter-entries', async (c) => {
  const division = c.req.param('division');
  if (!isValidDivision(division)) return c.json({ error: '課の指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const divNum = parseInt(division, 10);
  const [t1, t2] = teamsForDivision(divNum);
  const b = await c.req.json<{ team?: number }>().catch(() => ({}) as { team?: number });
  const team = b.team === t1 || b.team === t2 ? b.team : t1;

  const maxRow = await c.env.DB.prepare(
    'SELECT MAX(sort_order) AS m FROM handover_meter_entries WHERE team = ?'
  ).bind(team).first<{ m: number | null }>();
  const sortOrder = (maxRow?.m ?? -1) + 1;

  const r = await c.env.DB.prepare(
    `INSERT INTO handover_meter_entries (division, team, sort_order, updated_at) VALUES (?, ?, ?, datetime('now','localtime'))`
  ).bind(divNum, team, sortOrder).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

app.patch('/api/handover/:division/meter-entries/:id', async (c) => {
  const division = c.req.param('division');
  const id = parseInt(c.req.param('id'), 10);
  if (!isValidDivision(division) || !id) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);

  type MeterEntryBody = Partial<Record<MeterEntryField, string | null>>;
  const body = await c.req.json<MeterEntryBody>().catch(() => ({}) as MeterEntryBody);

  const sets: string[] = [];
  const values: (string | null)[] = [];
  for (const field of METER_ENTRY_FIELDS) {
    if (!(field in body)) continue;
    const v = body[field];
    if (METER_ENTRY_DATE_FIELDS.has(field) && v != null && !isValidDate(v)) {
      return c.json({ error: '日付の形式が不正です' }, 400);
    }
    if (field === 'car_no' && v == null) {
      return c.json({ error: '車番を入力してください' }, 400);
    }
    sets.push(`${field} = ?`);
    values.push(v === undefined ? null : v);
  }
  if (!sets.length) return c.json({ error: '更新項目がありません' }, 400);

  const r = await c.env.DB.prepare(
    `UPDATE handover_meter_entries SET ${sets.join(', ')}, updated_at = datetime('now','localtime') WHERE id = ? AND division = ?`
  ).bind(...values, id, parseInt(division, 10)).run();
  if (r.meta.changes === 0) return c.json({ error: 'データが存在しません' }, 404);
  return c.json({ ok: true });
});

app.delete('/api/handover/:division/meter-entries/:id', async (c) => {
  const division = c.req.param('division');
  const id = parseInt(c.req.param('id'), 10);
  if (!isValidDivision(division) || !id) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);

  const r = await c.env.DB.prepare(
    'DELETE FROM handover_meter_entries WHERE id = ? AND division = ?'
  ).bind(id, parseInt(division, 10)).run();
  if (r.meta.changes === 0) return c.json({ error: 'データが存在しません' }, 404);
  return c.json({ ok: true });
});

// カスタムセクションの日次内容の保存（項目単位PATCHと同じ発想のupsert）
app.patch('/api/handover/:division/:date/section-content/:sectionId', async (c) => {
  const division = c.req.param('division');
  const date = c.req.param('date');
  const sectionId = parseInt(c.req.param('sectionId'), 10);
  if (!isValidDivision(division) || !isValidDate(date) || !sectionId) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);

  const divNum = parseInt(division, 10);
  const section = await c.env.DB.prepare(
    `SELECT id FROM handover_sections WHERE id = ? AND division = ? AND kind = 'custom'`
  ).bind(sectionId, divNum).first();
  if (!section) return c.json({ error: 'セクションが存在しません' }, 404);

  const b = await c.req.json<{ value?: string }>().catch(() => ({}) as { value?: string });
  const value = b.value ?? '';
  const updatedBy = (await adminName(c)).name;
  await c.env.DB.prepare(`
    INSERT INTO handover_section_content (section_id, date, content, updated_at, updated_by)
    VALUES (?, ?, ?, datetime('now','localtime'), ?)
    ON CONFLICT(section_id, date) DO UPDATE SET
      content = excluded.content, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).bind(sectionId, date, value, updatedBy).run();
  const saved = await c.env.DB.prepare(
    'SELECT updated_at FROM handover_section_content WHERE section_id = ? AND date = ?'
  ).bind(sectionId, date).first<{ updated_at: string }>();
  return c.json({ ok: true, updated_at: saved?.updated_at ?? null });
});

// このシート（メイン項目＋カスタム枠の内容）の中で最も新しい更新時刻を1つの値にまとめて返す。
// 他端末での更新を検知するためのポーリング比較に使う（フルデータより軽量）。
async function sheetVersion(db: D1Database, divNum: number, date: string): Promise<string | null> {
  const row = await db.prepare(`
    SELECT MAX(v) AS version FROM (
      SELECT updated_at AS v FROM handover_sheets WHERE division = ? AND date = ?
      UNION ALL
      SELECT c.updated_at AS v FROM handover_section_content c
        JOIN handover_sections s ON s.id = c.section_id
        WHERE s.division = ? AND c.date = ?
    )
  `).bind(divNum, date, divNum, date).first<{ version: string | null }>();
  return row?.version ?? null;
}

app.get('/api/handover/:division/:date', async (c) => {
  const division = c.req.param('division');
  const date = c.req.param('date');
  if (!isValidDivision(division) || !isValidDate(date)) return c.json({ error: '指定が不正です' }, 400);
  const divNum = parseInt(division, 10);
  const sheet = await c.env.DB.prepare(
    'SELECT * FROM handover_sheets WHERE division = ? AND date = ?'
  ).bind(divNum, date).first<Sheet>();
  const customRows = await c.env.DB.prepare(
    `SELECT s.id AS sectionId, c.content AS content
     FROM handover_sections s
     LEFT JOIN handover_section_content c ON c.section_id = s.id AND c.date = ?
     WHERE s.division = ? AND s.kind = 'custom' AND s.is_active = 1`
  ).bind(date, divNum).all<{ sectionId: number; content: string | null }>();
  const customContent = (customRows.results ?? []).map(r => ({ sectionId: r.sectionId, content: r.content ?? '' }));
  const tokaEntryRows = await c.env.DB.prepare(
    'SELECT name, value, reason FROM handover_toka_entries WHERE division = ? AND date = ? ORDER BY id'
  ).bind(divNum, date).all<{ name: string; value: number; reason: string }>();
  const version = await sheetVersion(c.env.DB, divNum, date);
  return c.json({ sheet: sheet ?? null, customContent, tokaEntries: tokaEntryRows.results ?? [], version });
});

// ＋ボタンからの当欠・稼働追加登録。本文（toka_content）には「名前 -1.0」「名前 +0.5」のみを
// 追記し（理由は書かない）、理由はhandover_toka_entriesに構造化して保存する。フロント側は
// 名前にカーソルを当てるとこの理由をポップアップ表示する（本文中の行と名前・数値が一致する分だけ
// 紐付ける方式のため、本文の行が手動で編集・削除されればこの登録も以後の集計・表示から自動的に外れる）。
// プラス（稼働追加・代走等）は既存のparseTokaLines/TOKA_ENTRY_REがマイナス行しか当欠として
// 拾わない仕様（既存コメント「+の代走行は対象外」）のため、当欠記録の集計には出てこないが、
// クライアント側の稼働実績自動計算（calcTokaDelta、+/-両対応）には反映される。
const TOKA_ADD_VALUES = new Set([-1.0, -0.5, 0.5, 1.0]);
app.post('/api/handover/:division/:date/toka-entry', async (c) => {
  const division = c.req.param('division');
  const date = c.req.param('date');
  if (!isValidDivision(division) || !isValidDate(date)) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);

  const b = await c.req.json<{ name?: string; value?: number; reason?: string }>().catch(() => ({}) as { name?: string; value?: number; reason?: string });
  const name = (b.name || '').trim();
  const value = Number(b.value);
  const reason = (b.reason || '').trim().slice(0, 200);
  if (!name) return c.json({ error: '名前を入力してください' }, 400);
  if (!TOKA_ADD_VALUES.has(value)) return c.json({ error: '数値の指定が不正です' }, 400);

  const divNum = parseInt(division, 10);
  const sheet = await c.env.DB.prepare(
    'SELECT toka_content FROM handover_sheets WHERE division = ? AND date = ?'
  ).bind(divNum, date).first<{ toka_content: string }>();
  if (!sheet) return c.json({ error: 'シートが存在しません' }, 404);

  const signStr = value >= 0 ? '+' : '';
  const line = `${name} ${signStr}${value.toFixed(1)}`;
  const newContent = sheet.toka_content ? `${sheet.toka_content}\n${line}` : line;
  const admin = await adminName(c);

  await c.env.DB.prepare(
    `UPDATE handover_sheets SET toka_content = ?, updated_at = datetime('now','localtime'), updated_by = ? WHERE division = ? AND date = ?`
  ).bind(newContent, admin.name, divNum, date).run();
  const r = await c.env.DB.prepare(
    `INSERT INTO handover_toka_entries (division, date, name, value, reason, created_by) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(divNum, date, name, value, reason, admin.name).run();

  const saved = await c.env.DB.prepare('SELECT updated_at FROM handover_sheets WHERE division = ? AND date = ?')
    .bind(divNum, date).first<{ updated_at: string }>();
  await logAction(c, 'save', divNum, date, admin);
  return c.json({ ok: true, id: r.meta.last_row_id, toka_content: newContent, updated_at: saved?.updated_at ?? null });
});

// 他端末での更新検知用の軽量ポーリングエンドポイント（フルデータを含まない）
app.get('/api/handover/:division/:date/version', async (c) => {
  const division = c.req.param('division');
  const date = c.req.param('date');
  if (!isValidDivision(division) || !isValidDate(date)) return c.json({ error: '指定が不正です' }, 400);
  const version = await sheetVersion(c.env.DB, parseInt(division, 10), date);
  return c.json({ version });
});

app.put('/api/handover/:division/:date', async (c) => {
  const division = c.req.param('division');
  const date = c.req.param('date');
  if (!isValidDivision(division) || !isValidDate(date)) return c.json({ error: '指定が不正です' }, 400);
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);

  const b = await c.req.json<Partial<Sheet>>().catch(() => ({} as Partial<Sheet>));
  const divNum = parseInt(division, 10);
  const admin = await adminName(c);
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
    admin.name,
  ).run();

  const saved = await c.env.DB.prepare('SELECT updated_at FROM handover_sheets WHERE division = ? AND date = ?')
    .bind(divNum, date).first<{ updated_at: string }>();
  await logAction(c, 'save', divNum, date, admin);
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

  const admin = await adminName(c);
  await c.env.DB.prepare(
    `UPDATE handover_sheets SET ${field} = ?, updated_at = datetime('now','localtime'), updated_by = ? WHERE division = ? AND date = ?`
  ).bind(value, admin.name, divNum, date).run();

  const saved = await c.env.DB.prepare('SELECT updated_at FROM handover_sheets WHERE division = ? AND date = ?')
    .bind(divNum, date).first<{ updated_at: string }>();
  await logAction(c, 'save', divNum, date, admin);
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

  const admin = await adminName(c);
  const updatedBy = admin.name;
  await c.env.DB.prepare(`
    INSERT OR IGNORE INTO handover_sheets
      (division, date, main_content, jiko_content, tenken_content, joshu_content, jomu_content, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?)
  `).bind(
    divNum, next,
    cur?.main_content ?? '', cur?.jiko_content ?? '', tenkenContent, cur?.joshu_content ?? '', cur?.jomu_content ?? '',
    updatedBy,
  ).run();

  // カスタムセクション（自由追加した枠）の内容も前日からそのまま引き継ぐ
  const customSections = await c.env.DB.prepare(
    `SELECT id FROM handover_sections WHERE division = ? AND kind = 'custom' AND is_active = 1`
  ).bind(divNum).all<{ id: number }>();
  if (customSections.results && customSections.results.length > 0) {
    const curCustom = await c.env.DB.prepare(
      `SELECT section_id, content FROM handover_section_content WHERE date = ? AND section_id IN (${customSections.results.map(() => '?').join(',')})`
    ).bind(date, ...customSections.results.map(s => s.id)).all<{ section_id: number; content: string }>();
    const contentBySection = new Map((curCustom.results ?? []).map(r => [r.section_id, r.content]));
    const stmt = c.env.DB.prepare(`
      INSERT INTO handover_section_content (section_id, date, content, updated_at, updated_by)
      VALUES (?, ?, ?, datetime('now','localtime'), ?)
      ON CONFLICT(section_id, date) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at, updated_by = excluded.updated_by
    `);
    await c.env.DB.batch(customSections.results.map(s =>
      stmt.bind(s.id, next, contentBySection.get(s.id) ?? '', updatedBy)
    ));
  }

  await logAction(c, 'next', divNum, next, admin);
  return c.json({ nextDate: next });
});

export default app;
