// 班長シフト（管理者公休予定表のWeb版）
// ページ: /kancho-shift（グリッド） /kancho-shift/print（印刷用）
// API   : /api/kancho/*（管理パス配下。編集系は権限ミドルウェアで <kancho-shift.edit> 必須）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { getPeriodSettings, getPeriodRange, getShiftDisplayRange, getPeriod } from '../auth';
import { layout } from '../html/layout';
import { kanchoShiftPage, kanchoPrintPage, kanchoPeriodNavHtml, VACANT_SLOT_LABEL, type KanchoMember, type KanchoShiftType, type KanchoMemo, type KanchoCell, type KanchoWish, type KanchoForbiddenPair } from '../html/kancho_shift';
import { getAdminPermissions } from '../permissions';
import { runNotification } from '../cron';

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

// ===== 枠(slot_key)の変更を、既に存在する将来の月度へ自動反映 =====
// 「意図的に変更しない限り同じ設定を使い続ける」運用のため、枠設定・担当者変更・
// 社員管理照合での編集はすべてこの関数を通して将来の月度に伝播させる
async function propagateForward(db: D1Database, memberId: number): Promise<void> {
  const row = await db.prepare(
    'SELECT slot_key, year, month, name, role, section, sort_order, team_color, is_indoor, is_rookie, is_active, emp_no FROM kancho_members WHERE id = ?'
  ).bind(memberId).first<KanchoMember>();
  if (!row?.slot_key) return;
  const periodKey = row.year * 100 + row.month;
  await db.prepare(
    `UPDATE kancho_members
       SET name = ?, role = ?, section = ?, sort_order = ?, team_color = ?, is_indoor = ?, is_rookie = ?, is_active = ?, emp_no = ?,
           updated_at = datetime('now','localtime')
     WHERE slot_key = ? AND (year * 100 + month) > ?`
  ).bind(row.name, row.role, row.section, row.sort_order, row.team_color, row.is_indoor, row.is_rookie, row.is_active, row.emp_no, row.slot_key, periodKey).run();
}

// 新規に枠を作った時、既に存在する将来の月度にも同じ枠(slot_key)を複製する
async function createInFuturePeriods(
  db: D1Database,
  src: { name: string; role: string | null; section: string; sort_order: number; team_color: string | null; is_indoor: number; is_rookie: number; emp_no: string | null; slot_key: string },
  afterYear: number, afterMonth: number
): Promise<void> {
  const periodKey = afterYear * 100 + afterMonth;
  const periods = await db.prepare(
    'SELECT DISTINCT year, month FROM kancho_members WHERE (year * 100 + month) > ?'
  ).bind(periodKey).all<{ year: number; month: number }>();
  for (const p of (periods.results ?? [])) {
    await db.prepare(
      'INSERT INTO kancho_members (name, role, section, sort_order, is_active, team_color, is_indoor, is_rookie, emp_no, slot_key, year, month) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(src.name, src.role, src.section, src.sort_order, src.team_color, src.is_indoor, src.is_rookie, src.emp_no, src.slot_key, p.year, p.month).run();
  }
}

// 名簿・記号が月度ごとに独立データ化されているため、直前の月度から探して見つける
// （前が無ければ後ろで妥協）。「その月度を初めて開いた」ことの判定にも使う。
async function findNearestKanchoPeriod(
  db: D1Database, table: 'kancho_members' | 'kancho_shift_types', key: number
): Promise<{ year: number; month: number } | null> {
  const prior = await db.prepare(
    `SELECT year, month FROM ${table} WHERE (year * 100 + month) < ? GROUP BY year, month ORDER BY (year * 100 + month) DESC LIMIT 1`
  ).bind(key).first<{ year: number; month: number }>();
  if (prior) return prior;
  const next = await db.prepare(
    `SELECT year, month FROM ${table} WHERE (year * 100 + month) > ? GROUP BY year, month ORDER BY (year * 100 + month) ASC LIMIT 1`
  ).bind(key).first<{ year: number; month: number }>();
  return next ?? null;
}

// その月度の名簿・記号が無ければ、直前の月度から複製して初期化する
// （新しい月度を初めて開いたときに1回だけ実行される。以降は何もしない）
export async function ensureKanchoPeriod(db: D1Database, year: number, month: number): Promise<void> {
  const key = year * 100 + month;

  const memberCount = await db.prepare(
    'SELECT COUNT(*) AS n FROM kancho_members WHERE year = ? AND month = ?'
  ).bind(year, month).first<{ n: number }>();
  if ((memberCount?.n ?? 0) === 0) {
    const src = await findNearestKanchoPeriod(db, 'kancho_members', key);
    if (src) {
      const rows = await db.prepare(
        'SELECT * FROM kancho_members WHERE year = ? AND month = ? ORDER BY id'
      ).bind(src.year, src.month).all<KanchoMember>();
      const idMap = new Map<number, number>();
      for (const m of (rows.results ?? [])) {
        const res = await db.prepare(
          'INSERT INTO kancho_members (name, role, section, sort_order, is_active, team_color, is_indoor, is_rookie, emp_no, slot_key, year, month) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(m.name, m.role, m.section, m.sort_order, m.is_active, m.team_color, m.is_indoor, m.is_rookie, m.emp_no, m.slot_key, year, month).run();
        idMap.set(m.id, res.meta.last_row_id as number);
      }
      const pairs = await db.prepare(
        `SELECT member_id_a, member_id_b, reason FROM kancho_forbidden_pairs
         WHERE member_id_a IN (SELECT id FROM kancho_members WHERE year = ? AND month = ?)
           AND member_id_b IN (SELECT id FROM kancho_members WHERE year = ? AND month = ?)`
      ).bind(src.year, src.month, src.year, src.month).all<{ member_id_a: number; member_id_b: number; reason: string }>();
      for (const p of (pairs.results ?? [])) {
        const na = idMap.get(p.member_id_a);
        const nb = idMap.get(p.member_id_b);
        if (!na || !nb) continue;
        await db.prepare(
          'INSERT OR IGNORE INTO kancho_forbidden_pairs (member_id_a, member_id_b, reason) VALUES (?, ?, ?)'
        ).bind(Math.min(na, nb), Math.max(na, nb), p.reason).run();
      }
    }
  }

  const typeCount = await db.prepare(
    'SELECT COUNT(*) AS n FROM kancho_shift_types WHERE year = ? AND month = ?'
  ).bind(year, month).first<{ n: number }>();
  if ((typeCount?.n ?? 0) === 0) {
    const src = await findNearestKanchoPeriod(db, 'kancho_shift_types', key);
    if (src) {
      const rows = await db.prepare(
        'SELECT * FROM kancho_shift_types WHERE year = ? AND month = ?'
      ).bind(src.year, src.month).all<KanchoShiftType>();
      for (const t of (rows.results ?? [])) {
        await db.prepare(
          `INSERT INTO kancho_shift_types
             (code, label, color, section, daily_required, count_in_summary, sort_order, is_active, use_team_color, counts_as_work, counts_as_off, show_in_input, year, month)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(t.code, t.label, t.color, t.section, t.daily_required, t.count_in_summary, t.sort_order, t.is_active,
               t.use_team_color, t.counts_as_work, t.counts_as_off, t.show_in_input, year, month).run();
      }
    }
  }
}

// ===== ページ =====
app.get('/kancho-shift', async (c) => {
  const { year, month } = parseYearMonth(c);
  await ensureKanchoPeriod(c.env.DB, year, month);
  const periodCfg = await getPeriodSettings(c.env.DB);
  const { start: periodStart, end: periodEnd } = getPeriodRange(year, month, periodCfg);
  const { start: dispStart, end: dispEnd, dates } = getShiftDisplayRange(year, month, periodCfg);
  let prevYear = year, prevMonth = month - 1;
  if (prevMonth < 1) { prevMonth = 12; prevYear--; }
  let nextYear = year, nextMonth = month + 1;
  if (nextMonth > 12) { nextMonth = 1; nextYear++; }

  // 月またぎのグレー表示・「旧名→新名」は前月度/次月度の同一人物を自動で引き当てる。
  // 社員番号(emp_no)が紐付いていればそれを最優先（内勤/乗務が不規則に入れ替わっても
  // ズレない）。未紐付けの行だけ、従来通り「行」（section・班色・role・並び順）で
  // フォールバック照合する（NULLがあり得るのでIS比較）
  const rowMatchSql = (col: string) => `
    (SELECT p.${col} FROM kancho_members p WHERE p.year = ? AND p.month = ?
       AND (
         (m.emp_no IS NOT NULL AND m.emp_no != '' AND p.emp_no = m.emp_no)
         OR ((m.emp_no IS NULL OR m.emp_no = '') AND p.section = m.section AND p.team_color IS m.team_color AND p.role IS m.role AND p.sort_order = m.sort_order)
       )
     LIMIT 1)`;

  const [members, types, shifts, memos, wishes, forbiddenPairs] = await Promise.all([
    // 無効メンバーも取得（名簿管理モーダルで再有効化できるように。表への表示は画面側で絞る）
    c.env.DB.prepare(
      `SELECT m.*,
         ${rowMatchSql('id')} AS prev_id,
         ${rowMatchSql('id')} AS next_id
       FROM kancho_members m
       WHERE m.year = ? AND m.month = ? ORDER BY m.section, m.sort_order, m.id`
    ).bind(prevYear, prevMonth, nextYear, nextMonth, year, month)
      .all<KanchoMember & { prev_id: number | null; next_id: number | null }>(),
    c.env.DB.prepare('SELECT * FROM kancho_shift_types WHERE year = ? AND month = ? ORDER BY sort_order, id')
      .bind(year, month).all<KanchoShiftType>(),
    c.env.DB.prepare('SELECT member_id, date, code, is_diagonal, is_wish, cell_color, is_locked FROM kancho_shifts WHERE date BETWEEN ? AND ?')
      .bind(dispStart, dispEnd).all<{ member_id: number; date: string; code: string; is_diagonal: number; is_wish: number; cell_color: string | null; is_locked: number }>(),
    c.env.DB.prepare('SELECT * FROM kancho_memos WHERE year = ? AND month = ? ORDER BY kind, sort_order, id')
      .bind(year, month).all<KanchoMemo>(),
    c.env.DB.prepare('SELECT id, member_id, date, note FROM kancho_wishes WHERE date BETWEEN ? AND ? ORDER BY date')
      .bind(dispStart, dispEnd).all<KanchoWish>(),
    c.env.DB.prepare(
      `SELECT id, member_id_a, member_id_b, reason FROM kancho_forbidden_pairs
       WHERE member_id_a IN (SELECT id FROM kancho_members WHERE year = ? AND month = ?)
         AND member_id_b IN (SELECT id FROM kancho_members WHERE year = ? AND month = ?)`
    ).bind(year, month, year, month).all<KanchoForbiddenPair>(),
  ]);

  const shiftMap: Record<string, KanchoCell> = {};
  for (const s of (shifts.results ?? [])) {
    shiftMap[`${s.member_id}_${s.date}`] = { code: s.code, dg: s.is_diagonal, ws: s.is_wish, cl: s.cell_color, lk: s.is_locked };
  }

  // 月またぎのグレー表示日は名簿IDが月度ごとに別なので、行一致した前月度/次月度のIDから
  // 別名として引き当てる（読み取り専用。保存は現月度の自分のIDに対して行われる）
  const memberList = members.results ?? [];
  for (const m of memberList) {
    for (const d of dates) {
      if (d >= periodStart) continue;
      if (!m.prev_id) continue;
      const key = `${m.id}_${d}`;
      const srcKey = `${m.prev_id}_${d}`;
      if (!shiftMap[key] && shiftMap[srcKey]) shiftMap[key] = shiftMap[srcKey];
    }
    for (const d of dates) {
      if (d <= periodEnd) continue;
      if (!m.next_id) continue;
      const key = `${m.id}_${d}`;
      const srcKey = `${m.next_id}_${d}`;
      if (!shiftMap[key] && shiftMap[srcKey]) shiftMap[key] = shiftMap[srcKey];
    }
  }

  const editable = await canEdit(c);
  const headerNav = kanchoPeriodNavHtml(year, month, periodStart, periodEnd);
  const html = kanchoShiftPage(
    memberList, types.results ?? [], shiftMap, memos.results ?? [],
    dates, year, month, periodStart, periodEnd, editable, wishes.results ?? [], forbiddenPairs.results ?? []
  );
  return c.html(layout('班長シフト', html, 'kancho-shift', headerNav));
});

app.get('/kancho-shift/print', async (c) => {
  const { year, month } = parseYearMonth(c);
  await ensureKanchoPeriod(c.env.DB, year, month);
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
    c.env.DB.prepare('SELECT * FROM kancho_members WHERE is_active = 1 AND year = ? AND month = ? ORDER BY section, sort_order, id')
      .bind(year, month).all<KanchoMember>(),
    c.env.DB.prepare('SELECT * FROM kancho_shift_types WHERE year = ? AND month = ? ORDER BY sort_order, id')
      .bind(year, month).all<KanchoShiftType>(),
    c.env.DB.prepare('SELECT member_id, date, code, is_diagonal, is_wish, cell_color, is_locked FROM kancho_shifts WHERE date BETWEEN ? AND ?')
      .bind(periodStart, periodEnd).all<{ member_id: number; date: string; code: string; is_diagonal: number; is_wish: number; cell_color: string | null; is_locked: number }>(),
    c.env.DB.prepare('SELECT * FROM kancho_memos WHERE year = ? AND month = ? ORDER BY kind, sort_order, id')
      .bind(year, month).all<KanchoMemo>(),
  ]);

  const shiftMap: Record<string, KanchoCell> = {};
  for (const s of (shifts.results ?? [])) {
    shiftMap[`${s.member_id}_${s.date}`] = { code: s.code, dg: s.is_diagonal, ws: s.is_wish, cl: s.cell_color, lk: s.is_locked };
  }

  return c.html(kanchoPrintPage(
    members.results ?? [], types.results ?? [], shiftMap, memos.results ?? [],
    dates, year, month, periodStart, periodEnd
  ));
});

// ===== API: シフト一括保存 =====
// 履歴用のセル値表記（例: 直(斜め)(希望休)[#ff99cc](確定)）
function cellLabel(code: string, dg: number, ws: number, cl: string | null, lk: number): string {
  if (!code && !dg && !ws && !cl && !lk) return '';
  return `${code}${dg ? '(斜め)' : ''}${ws ? '(希望休)' : ''}${cl ? `[${cl}]` : ''}${lk ? '(確定)' : ''}`;
}

app.post('/api/kancho/shifts/batch', async (c) => {
  const body = await c.req.json<{ entries: Array<{ member_id: number; date: string; code: string | null; is_diagonal?: number; is_wish?: number; cell_color?: string | null; is_locked?: number }> }>();
  const rawEntries = body.entries ?? [];
  if (rawEntries.length === 0) return c.json({ ok: true, saved: 0 });
  if (rawEntries.length > 500) return c.json({ error: '一度に保存できるのは500件までです' }, 400);

  const { id: adminId, name } = await adminName(c);

  // メンバー名（履歴用）
  const memberRows = await c.env.DB.prepare('SELECT id, name FROM kancho_members').all<{ id: number; name: string }>();
  const memberNames = new Map((memberRows.results ?? []).map(m => [m.id, m.name]));

  const entries = rawEntries.filter(e => e.member_id && /^\d{4}-\d{2}-\d{2}$/.test(e.date ?? ''));
  if (entries.length === 0) return c.json({ ok: true, saved: 0, blocked: 0 });

  // 対象セルの既存値をまとめて1回で取得（エントリ毎の個別SELECTを避ける）
  const memberIds = [...new Set(entries.map(e => e.member_id))];
  const sortedDates = entries.map(e => e.date).sort();
  const placeholders = memberIds.map(() => '?').join(',');
  const existingRows = await c.env.DB.prepare(
    `SELECT member_id, date, code, is_diagonal, is_wish, cell_color, is_locked FROM kancho_shifts WHERE member_id IN (${placeholders}) AND date BETWEEN ? AND ?`
  ).bind(...memberIds, sortedDates[0], sortedDates[sortedDates.length - 1])
    .all<{ member_id: number; date: string; code: string; is_diagonal: number; is_wish: number; cell_color: string | null; is_locked: number }>();
  const oldMap = new Map((existingRows.results ?? []).map(r => [`${r.member_id}_${r.date}`, r]));

  let saved = 0;
  let blocked = 0;
  const stmts: ReturnType<typeof c.env.DB.prepare>[] = [];
  for (const e of entries) {
    const code = (e.code ?? '').trim();
    const dg = e.is_diagonal ? 1 : 0;
    const ws = e.is_wish ? 1 : 0;
    const cl = (e.cell_color && /^#[0-9a-fA-F]{6}$/.test(e.cell_color)) ? e.cell_color.toLowerCase() : null;
    const old = oldMap.get(`${e.member_id}_${e.date}`);
    const oldLocked = old?.is_locked ?? 0;
    // is_locked省略時は現状維持（コピペ編集・希望休自動反映など、ロックを意識しない書き込み経路のため）
    const lk = typeof e.is_locked === 'number' ? (e.is_locked ? 1 : 0) : oldLocked;
    const contentChanged = !old
      ? !!(code || dg || ws || cl)
      : (old.code !== code || old.is_diagonal !== dg || old.is_wish !== ws || old.cell_color !== cl);
    // 確定（ロック）中のセルは、ロックを外さない限り内容変更をブロック（誤操作防止）
    if (oldLocked === 1 && lk === 1 && contentChanged) {
      blocked++;
      continue;
    }
    const oldLabel = old ? cellLabel(old.code, old.is_diagonal, old.is_wish, old.cell_color, oldLocked) : '';
    const newLabel = cellLabel(code, dg, ws, cl, lk);
    if (oldLabel === newLabel) continue;

    if (code === '' && !dg && !ws && !cl && !lk) {
      // 完全な空（色上書き・確定もなし）は行ごと削除 = 自動表示（班色出勤）に戻る
      stmts.push(c.env.DB.prepare('DELETE FROM kancho_shifts WHERE member_id = ? AND date = ?').bind(e.member_id, e.date));
    } else {
      stmts.push(c.env.DB.prepare(
        `INSERT INTO kancho_shifts (member_id, date, code, is_diagonal, is_wish, cell_color, is_locked, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?)
         ON CONFLICT(member_id, date) DO UPDATE SET code = excluded.code, is_diagonal = excluded.is_diagonal, is_wish = excluded.is_wish, cell_color = excluded.cell_color, is_locked = excluded.is_locked, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
      ).bind(e.member_id, e.date, code, dg, ws, cl, lk, name));
    }
    stmts.push(c.env.DB.prepare(
      'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, date, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(adminId, name, 'shift', memberNames.get(e.member_id) ?? `member:${e.member_id}`, e.date, oldLabel, newLabel));
    saved++;
  }
  if (stmts.length > 0) await c.env.DB.batch(stmts);
  return c.json({ ok: true, saved, blocked });
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
  const b = await c.req.json<{ name?: string; role?: string; section?: string; sort_order?: number; team_color?: string | null; is_indoor?: number; is_rookie?: number; emp_no?: string | null; year?: number; month?: number }>();
  const nm = (b.name ?? '').trim();
  if (!nm) return c.json({ error: '名前を入力してください' }, 400);
  if (!b.year || !b.month) return c.json({ error: 'year/month が必要です' }, 400);
  const section = ['main', 's1', 's2'].includes(b.section ?? '') ? b.section : 'main';
  const color = (b.team_color && /^#[0-9a-fA-F]{6}$/.test(b.team_color)) ? b.team_color.toLowerCase() : null;
  const { id: adminId, name } = await adminName(c);
  const slotKey = crypto.randomUUID();
  const indoor = b.is_indoor === 0 ? 0 : 1;
  const rookie = b.is_rookie ? 1 : 0;
  const empNo = (b.emp_no ?? '').trim() || null;
  await c.env.DB.prepare(
    'INSERT INTO kancho_members (name, role, section, sort_order, team_color, is_indoor, is_rookie, emp_no, slot_key, year, month) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(nm, b.role || null, section, b.sort_order ?? 0, color, indoor, rookie, empNo, slotKey, b.year, b.month).run();
  await createInFuturePeriods(c.env.DB, { name: nm, role: b.role || null, section: section!, sort_order: b.sort_order ?? 0, team_color: color, is_indoor: indoor, is_rookie: rookie, emp_no: empNo, slot_key: slotKey }, b.year, b.month);
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, new_value) VALUES (?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'member', nm, `追加（${b.role || section}）`).run();
  return c.json({ ok: true });
});

function memberDescStr(
  m: { name: string; role: string | null; section: string; sort_order: number; is_active: number },
  tc: string | null, ind: number, rk: number, empNo: string | null
): string {
  return `${m.name}/${m.role ?? ''}/${m.section}/順${m.sort_order}/${tc ?? '色なし'}/${ind ? '内勤' : '乗務'}/${rk ? '新人班長' : ''}/番${empNo ?? ''}/${m.is_active ? '有効' : '無効'}`;
}

app.put('/api/kancho/members/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ name?: string; role?: string; section?: string; sort_order?: number; is_active?: number; team_color?: string | null; is_indoor?: number; is_rookie?: number; emp_no?: string | null }>();
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
  const rookie = b.is_rookie !== undefined ? (b.is_rookie ? 1 : 0) : old.is_rookie;
  const empNo = b.emp_no !== undefined ? ((b.emp_no ?? '').trim() || null) : old.emp_no;
  const { id: adminId, name } = await adminName(c);
  await c.env.DB.prepare(
    `UPDATE kancho_members SET name = ?, role = ?, section = ?, sort_order = ?, is_active = ?, team_color = ?, is_indoor = ?, is_rookie = ?, emp_no = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).bind(nm, b.role !== undefined ? (b.role || null) : old.role, section,
         b.sort_order ?? old.sort_order, b.is_active ?? old.is_active, color, indoor, rookie, empNo, id).run();
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'member', old.name,
         memberDescStr(old, old.team_color, old.is_indoor, old.is_rookie, old.emp_no),
         memberDescStr({ name: nm, role: b.role !== undefined ? (b.role || null) : old.role, section, sort_order: b.sort_order ?? old.sort_order, is_active: b.is_active ?? old.is_active }, color, indoor, rookie, empNo)).run();
  await propagateForward(c.env.DB, id);
  return c.json({ ok: true });
});

// 名簿の一括保存（社員番号などをまとめて入力してからまとめて保存する用途）
app.post('/api/kancho/members/batch', async (c) => {
  const body = await c.req.json<{ entries: Array<{ id: number; name?: string; role?: string; section?: string; sort_order?: number; team_color?: string | null; is_indoor?: number; is_rookie?: number; emp_no?: string | null }> }>();
  const entries = body.entries ?? [];
  if (entries.length === 0) return c.json({ ok: true, saved: 0 });
  if (entries.length > 200) return c.json({ error: '一度に保存できるのは200件までです' }, 400);
  const { id: adminId, name: adminUser } = await adminName(c);

  // 対象メンバーの既存値をまとめて1回で取得（エントリ毎の個別SELECTを避ける）
  const targetIds = [...new Set(entries.map(e => e.id).filter(Boolean))];
  const oldRows = targetIds.length > 0
    ? await c.env.DB.prepare(`SELECT * FROM kancho_members WHERE id IN (${targetIds.map(() => '?').join(',')})`).bind(...targetIds).all<KanchoMember>()
    : { results: [] };
  const oldMemberMap = new Map((oldRows.results ?? []).map(m => [m.id, m]));

  let saved = 0;
  for (const e of entries) {
    if (!e.id) continue;
    const old = oldMemberMap.get(e.id);
    if (!old) continue;
    const nm = (e.name ?? old.name).trim();
    if (!nm) continue;
    const section = ['main', 's1', 's2'].includes(e.section ?? '') ? e.section! : old.section;
    let color = old.team_color;
    if (e.team_color !== undefined) {
      color = (e.team_color && /^#[0-9a-fA-F]{6}$/.test(e.team_color)) ? e.team_color.toLowerCase() : null;
    }
    const indoor = e.is_indoor !== undefined ? (e.is_indoor ? 1 : 0) : old.is_indoor;
    const rookie = e.is_rookie !== undefined ? (e.is_rookie ? 1 : 0) : old.is_rookie;
    const empNo = e.emp_no !== undefined ? ((e.emp_no ?? '').trim() || null) : old.emp_no;
    const role = e.role !== undefined ? (e.role || null) : old.role;
    const sortOrder = e.sort_order ?? old.sort_order;

    const oldDesc = memberDescStr(old, old.team_color, old.is_indoor, old.is_rookie, old.emp_no);
    const newDesc = memberDescStr({ name: nm, role, section, sort_order: sortOrder, is_active: old.is_active }, color, indoor, rookie, empNo);
    if (oldDesc === newDesc) continue;

    await c.env.DB.prepare(
      `UPDATE kancho_members SET name = ?, role = ?, section = ?, sort_order = ?, team_color = ?, is_indoor = ?, is_rookie = ?, emp_no = ?, updated_at = datetime('now','localtime') WHERE id = ?`
    ).bind(nm, role, section, sortOrder, color, indoor, rookie, empNo, e.id).run();
    await c.env.DB.prepare(
      'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(adminId, adminUser, 'member', old.name, oldDesc, newDesc).run();
    await propagateForward(c.env.DB, e.id);
    saved++;
  }
  return c.json({ ok: true, saved });
});

// ===== API: 当直禁忌ペア =====
app.post('/api/kancho/forbidden-pairs', async (c) => {
  const b = await c.req.json<{ member_id_a?: number; member_id_b?: number; reason?: string }>();
  if (!b.member_id_a || !b.member_id_b || b.member_id_a === b.member_id_b) {
    return c.json({ error: '異なる2名を指定してください' }, 400);
  }
  const a = Math.min(b.member_id_a, b.member_id_b);
  const bId = Math.max(b.member_id_a, b.member_id_b);
  const members = await c.env.DB.prepare('SELECT id, name FROM kancho_members WHERE id IN (?, ?)').bind(a, bId).all<{ id: number; name: string }>();
  const rows = members.results ?? [];
  if (rows.length !== 2) return c.json({ error: 'メンバーが見つかりません' }, 404);
  const nameOf = (id: number) => rows.find(r => r.id === id)?.name ?? `id:${id}`;
  const { id: adminId, name } = await adminName(c);
  try {
    await c.env.DB.prepare(
      'INSERT INTO kancho_forbidden_pairs (member_id_a, member_id_b, reason) VALUES (?, ?, ?)'
    ).bind(a, bId, (b.reason ?? '').trim()).run();
  } catch {
    return c.json({ error: 'このペアは既に登録されています' }, 400);
  }
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, new_value) VALUES (?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'member', `${nameOf(a)} × ${nameOf(bId)}`, `禁忌ペア追加${b.reason ? `（${b.reason.trim()}）` : ''}`).run();
  return c.json({ ok: true });
});

app.delete('/api/kancho/forbidden-pairs/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const old = await c.env.DB.prepare(
    'SELECT p.reason, ma.name AS name_a, mb.name AS name_b FROM kancho_forbidden_pairs p ' +
    'JOIN kancho_members ma ON ma.id = p.member_id_a JOIN kancho_members mb ON mb.id = p.member_id_b WHERE p.id = ?'
  ).bind(id).first<{ reason: string; name_a: string; name_b: string }>();
  if (!old) return c.json({ error: '禁忌ペアが見つかりません' }, 404);
  const { id: adminId, name } = await adminName(c);
  await c.env.DB.prepare('DELETE FROM kancho_forbidden_pairs WHERE id = ?').bind(id).run();
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, old_value) VALUES (?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'member', `${old.name_a} × ${old.name_b}`, '禁忌ペア削除').run();
  return c.json({ ok: true });
});

// ===== API: 記号マスタ =====
app.post('/api/kancho/types', async (c) => {
  const b = await c.req.json<{ code?: string; label?: string; color?: string; section?: string; daily_required?: number; sort_order?: number; use_team_color?: number; counts_as_work?: number; counts_as_off?: number; show_in_input?: number; year?: number; month?: number }>();
  const code = (b.code ?? '').trim();
  if (!code) return c.json({ error: '記号を入力してください' }, 400);
  if (!b.year || !b.month) return c.json({ error: 'year/month が必要です' }, 400);
  const section = ['main', 'sub', 'all'].includes(b.section ?? '') ? b.section : 'main';
  const { id: adminId, name } = await adminName(c);
  try {
    await c.env.DB.prepare(
      'INSERT INTO kancho_shift_types (code, label, color, section, daily_required, sort_order, use_team_color, counts_as_work, counts_as_off, show_in_input, year, month) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(code, b.label ?? '', b.color ?? '#e5e7eb', section, b.daily_required ?? 0, b.sort_order ?? 0,
           b.use_team_color ? 1 : 0, b.counts_as_work ? 1 : 0, b.counts_as_off ? 1 : 0, b.show_in_input === 0 ? 0 : 1, b.year, b.month).run();
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
  const b = await c.req.json<{ code?: string; label?: string; color?: string; section?: string; daily_required?: number; sort_order?: number; is_active?: number; use_team_color?: number; counts_as_work?: number; counts_as_off?: number; show_in_input?: number }>();
  const old = await c.env.DB.prepare('SELECT * FROM kancho_shift_types WHERE id = ?').bind(id).first<KanchoShiftType>();
  if (!old) return c.json({ error: '記号が見つかりません' }, 404);
  const code = (b.code ?? old.code).trim();
  if (!code) return c.json({ error: '記号を入力してください' }, 400);
  const section = ['main', 'sub', 'all'].includes(b.section ?? '') ? b.section! : old.section;
  const { id: adminId, name } = await adminName(c);
  try {
    await c.env.DB.prepare(
      'UPDATE kancho_shift_types SET code = ?, label = ?, color = ?, section = ?, daily_required = ?, sort_order = ?, is_active = ?, use_team_color = ?, counts_as_work = ?, counts_as_off = ?, show_in_input = ? WHERE id = ?'
    ).bind(code, b.label ?? old.label, b.color ?? old.color, section,
           b.daily_required ?? old.daily_required,
           b.sort_order ?? old.sort_order, b.is_active ?? old.is_active,
           b.use_team_color ?? old.use_team_color, b.counts_as_work ?? old.counts_as_work, b.counts_as_off ?? old.counts_as_off,
           b.show_in_input ?? old.show_in_input, id).run();
  } catch {
    return c.json({ error: '同じ記号が既に登録されています' }, 400);
  }
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'type', code, `${old.code}/${old.label}/${old.color}`, `${code}/${b.label ?? old.label}/${b.color ?? old.color}`).run();
  return c.json({ ok: true });
});

// 記号の削除（月度ごとに独立データのため、この月度からのみ削除される）
app.delete('/api/kancho/types/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const old = await c.env.DB.prepare('SELECT * FROM kancho_shift_types WHERE id = ?').bind(id).first<KanchoShiftType>();
  if (!old) return c.json({ error: '記号が見つかりません' }, 404);
  const { id: adminId, name } = await adminName(c);
  await c.env.DB.prepare('DELETE FROM kancho_shift_types WHERE id = ?').bind(id).run();
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, old_value) VALUES (?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'type', old.code, `${old.year}年${old.month}月度から削除`).run();
  return c.json({ ok: true });
});

// 記号の一括保存
app.post('/api/kancho/types/batch', async (c) => {
  const body = await c.req.json<{ entries: Array<{ id: number; code?: string; label?: string; color?: string; section?: string; daily_required?: number; sort_order?: number; use_team_color?: number; counts_as_work?: number; counts_as_off?: number; show_in_input?: number }> }>();
  const entries = body.entries ?? [];
  if (entries.length === 0) return c.json({ ok: true, saved: 0 });
  if (entries.length > 200) return c.json({ error: '一度に保存できるのは200件までです' }, 400);
  const { id: adminId, name: adminUser } = await adminName(c);

  // 対象記号の既存値をまとめて1回で取得（エントリ毎の個別SELECTを避ける）
  const targetIds = [...new Set(entries.map(e => e.id).filter(Boolean))];
  const oldRows = targetIds.length > 0
    ? await c.env.DB.prepare(`SELECT * FROM kancho_shift_types WHERE id IN (${targetIds.map(() => '?').join(',')})`).bind(...targetIds).all<KanchoShiftType>()
    : { results: [] };
  const oldTypeMap = new Map((oldRows.results ?? []).map(t => [t.id, t]));

  let saved = 0;
  const errors: string[] = [];
  for (const e of entries) {
    if (!e.id) continue;
    const old = oldTypeMap.get(e.id);
    if (!old) continue;
    const code = (e.code ?? old.code).trim();
    if (!code) continue;
    const section = ['main', 'sub', 'all'].includes(e.section ?? '') ? e.section! : old.section;
    const label = e.label ?? old.label;
    const color = e.color ?? old.color;
    const dailyRequired = e.daily_required ?? old.daily_required;
    const sortOrder = e.sort_order ?? old.sort_order;
    const useTeamColor = e.use_team_color ?? old.use_team_color;
    const countsAsWork = e.counts_as_work ?? old.counts_as_work;
    const countsAsOff = e.counts_as_off ?? old.counts_as_off;
    const showInInput = e.show_in_input ?? old.show_in_input;

    const oldDesc = `${old.code}/${old.label}/${old.color}`;
    const newDesc = `${code}/${label}/${color}`;
    if (oldDesc === newDesc && dailyRequired === old.daily_required && sortOrder === old.sort_order
      && useTeamColor === old.use_team_color && countsAsWork === old.counts_as_work
      && countsAsOff === old.counts_as_off && showInInput === old.show_in_input && section === old.section) continue;

    try {
      await c.env.DB.prepare(
        'UPDATE kancho_shift_types SET code = ?, label = ?, color = ?, section = ?, daily_required = ?, sort_order = ?, use_team_color = ?, counts_as_work = ?, counts_as_off = ?, show_in_input = ? WHERE id = ?'
      ).bind(code, label, color, section, dailyRequired, sortOrder, useTeamColor, countsAsWork, countsAsOff, showInInput, e.id).run();
    } catch {
      errors.push(code);
      continue;
    }
    await c.env.DB.prepare(
      'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(adminId, adminUser, 'type', code, oldDesc, newDesc).run();
    saved++;
  }
  if (errors.length > 0) return c.json({ ok: true, saved, error: `記号が重複しているため保存できませんでした: ${errors.join('、')}` });
  return c.json({ ok: true, saved });
});

// ===== API: 希望休枠（構造化。従来のフリーテキストメモとは別）=====
app.post('/api/kancho/wishes', async (c) => {
  const b = await c.req.json<{ member_id?: number; date?: string; note?: string }>();
  if (!b.member_id || !/^\d{4}-\d{2}-\d{2}$/.test(b.date ?? '')) {
    return c.json({ error: 'member_id と date が必要です' }, 400);
  }
  const member = await c.env.DB.prepare('SELECT name FROM kancho_members WHERE id = ?').bind(b.member_id).first<{ name: string }>();
  if (!member) return c.json({ error: 'メンバーが見つかりません' }, 404);
  const { id: adminId, name } = await adminName(c);
  await c.env.DB.prepare(
    `INSERT INTO kancho_wishes (member_id, date, note) VALUES (?, ?, ?)
     ON CONFLICT(member_id, date) DO UPDATE SET note = excluded.note`
  ).bind(b.member_id, b.date, (b.note ?? '').trim()).run();
  const row = await c.env.DB.prepare('SELECT id FROM kancho_wishes WHERE member_id = ? AND date = ?')
    .bind(b.member_id, b.date).first<{ id: number }>();
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, date, new_value) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'wish', member.name, b.date, `希望休 追加${b.note ? `（${b.note.trim()}）` : ''}`).run();
  return c.json({ ok: true, id: row?.id });
});

app.delete('/api/kancho/wishes/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const old = await c.env.DB.prepare(
    'SELECT w.date, m.name FROM kancho_wishes w JOIN kancho_members m ON m.id = w.member_id WHERE w.id = ?'
  ).bind(id).first<{ date: string; name: string }>();
  if (!old) return c.json({ error: '希望休が見つかりません' }, 404);
  const { id: adminId, name } = await adminName(c);
  await c.env.DB.prepare('DELETE FROM kancho_wishes WHERE id = ?').bind(id).run();
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, date, old_value) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'wish', old.name, old.date, '希望休 削除').run();
  return c.json({ ok: true });
});

// ===== API: 0時LINE通知の設定 =====
app.get('/api/kancho/notify', async (c) => {
  const [setting, users] = await Promise.all([
    c.env.DB.prepare("SELECT is_enabled FROM notification_settings WHERE type = 'kancho_attendance'")
      .first<{ is_enabled: number }>(),
    c.env.DB.prepare(`
      SELECT u.line_uid, u.name, u.role, (o.line_uid IS NOT NULL) AS optin
      FROM line_liff_users u
      LEFT JOIN kancho_notify_optin o ON o.line_uid = u.line_uid
      WHERE u.role IN ('general_manager', 'operations_manager')
      ORDER BY u.role, u.name
    `).all<{ line_uid: string; name: string; role: string; optin: number }>(),
  ]);
  return c.json({ enabled: setting?.is_enabled ?? 0, recipients: users.results ?? [] });
});

app.post('/api/kancho/notify', async (c) => {
  const b = await c.req.json<{ master?: number; line_uid?: string; optin?: number }>();
  const { id: adminId, name } = await adminName(c);

  if (b.master !== undefined) {
    await c.env.DB.prepare(
      "UPDATE notification_settings SET is_enabled = ?, updated_at = datetime('now','localtime') WHERE type = 'kancho_attendance'"
    ).bind(b.master ? 1 : 0).run();
    await c.env.DB.prepare(
      'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, new_value) VALUES (?, ?, ?, ?, ?)'
    ).bind(adminId, name, 'notify', '0時通知', b.master ? '有効化' : '無効化').run();
    return c.json({ ok: true });
  }

  if (b.line_uid) {
    // 対象ロールのユーザーのみオプトイン可
    const user = await c.env.DB.prepare(
      "SELECT name FROM line_liff_users WHERE line_uid = ? AND role IN ('general_manager', 'operations_manager')"
    ).bind(b.line_uid).first<{ name: string }>();
    if (!user) return c.json({ error: '統括管理者・運行管理者のみ設定できます' }, 400);
    if (b.optin) {
      await c.env.DB.prepare('INSERT OR IGNORE INTO kancho_notify_optin (line_uid) VALUES (?)').bind(b.line_uid).run();
    } else {
      await c.env.DB.prepare('DELETE FROM kancho_notify_optin WHERE line_uid = ?').bind(b.line_uid).run();
    }
    await c.env.DB.prepare(
      'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, new_value) VALUES (?, ?, ?, ?, ?)'
    ).bind(adminId, name, 'notify', user.name, b.optin ? '通知オン' : '通知オフ').run();
    return c.json({ ok: true });
  }

  return c.json({ error: 'master または line_uid を指定してください' }, 400);
});

// テスト送信（現在のオプトイン先に今すぐ送る）
app.post('/api/kancho/notify/test', async (c) => {
  await runNotification(c.env, 'kancho_attendance');
  const { id: adminId, name } = await adminName(c);
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, new_value) VALUES (?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'notify', '0時通知', 'テスト送信').run();
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

// ===== API: 班長シフト表から直接、この枠の担当者を変更する（名前セルをタップ）=====
// 枠（役割・班色・並び順）は固定で、担当する人だけをここで入れ替える。
// 候補は班長リスト（employees.is_hanchyo=1）全員。既に他の枠に入っている人も選べるが、
// 選ぶとその人が元々入っていた枠は自動で空き枠になる（人数と枠数が一致していると
// 誰も選べなくなる問題への対処。入れ替え・異動をこの画面だけで完結できるようにする）
app.get('/api/kancho/members/:id/link-candidates', async (c) => {
  const id = parseInt(c.req.param('id'));
  const member = await c.env.DB.prepare('SELECT name, year, month, emp_no FROM kancho_members WHERE id = ?')
    .bind(id).first<{ name: string; year: number; month: number; emp_no: string | null }>();
  if (!member) return c.json({ error: 'メンバーが見つかりません' }, 404);

  const [candidates, assigned] = await Promise.all([
    c.env.DB.prepare('SELECT emp_no, name FROM employees WHERE is_hanchyo = 1 AND is_active = 1 ORDER BY name')
      .all<{ emp_no: string; name: string }>(),
    c.env.DB.prepare(
      `SELECT emp_no, name AS slot_name, role FROM kancho_members
       WHERE year = ? AND month = ? AND id != ? AND emp_no IS NOT NULL AND emp_no != ''`
    ).bind(member.year, member.month, id).all<{ emp_no: string; slot_name: string; role: string | null }>(),
  ]);
  const otherByEmpNo = new Map((assigned.results ?? []).map(a => [a.emp_no, a]));
  const list = (candidates.results ?? []).map(e => {
    const other = otherByEmpNo.get(e.emp_no);
    return { emp_no: e.emp_no, name: e.name, other_slot: other ? `${other.slot_name}${other.role ? `・${other.role}` : ''}` : null };
  });
  return c.json({ candidates: list, current_emp_no: member.emp_no, current_name: member.name });
});

app.post('/api/kancho/members/:id/link', async (c) => {
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ emp_no?: string; name?: string }>();
  const empNo = (b.emp_no ?? '').trim();
  const displayName = (b.name ?? '').trim();
  if (!empNo || !displayName) return c.json({ error: '社員番号・表示名の両方が必要です' }, 400);

  const old = await c.env.DB.prepare('SELECT name, year, month, emp_no FROM kancho_members WHERE id = ?')
    .bind(id).first<{ name: string; year: number; month: number; emp_no: string | null }>();
  if (!old) return c.json({ error: 'メンバーが見つかりません' }, 404);
  const { id: adminId, name: adminUser } = await adminName(c);

  const emp = await c.env.DB.prepare('SELECT name FROM employees WHERE emp_no = ? AND is_hanchyo = 1 AND is_active = 1')
    .bind(empNo).first<{ name: string }>();
  if (!emp) return c.json({ error: '班長として登録されている社員が見つかりません' }, 404);

  // 既に同じ月度の別の枠に入っている場合は、その枠を空き枠にしてからこちらへ移す
  const other = await c.env.DB.prepare('SELECT id, name FROM kancho_members WHERE year = ? AND month = ? AND emp_no = ? AND id != ?')
    .bind(old.year, old.month, empNo, id).first<{ id: number; name: string }>();
  if (other) {
    await c.env.DB.prepare(`UPDATE kancho_members SET name = ?, emp_no = NULL, updated_at = datetime('now','localtime') WHERE id = ?`)
      .bind(VACANT_SLOT_LABEL, other.id).run();
    await c.env.DB.prepare(
      'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(adminId, adminUser, 'member', other.name, `${other.name}（番${empNo}）`, `${VACANT_SLOT_LABEL}（${emp.name}が他の枠へ移動）`).run();
    await propagateForward(c.env.DB, other.id);
  }

  await c.env.DB.prepare(`UPDATE kancho_members SET name = ?, emp_no = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .bind(displayName, empNo, id).run();
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(adminId, adminUser, 'member', old.name, `${old.name}（番${old.emp_no ?? ''}）`, `${displayName}（番${empNo}・${emp.name}・シフト表から割当変更）`).run();
  await propagateForward(c.env.DB, id);
  return c.json({ ok: true, moved_from: other ? other.name : null });
});

// ===== API: 枠設定で「現在の担当」名をタップした時の社員管理照合 =====
// 名簿は苗字だけ・下の名前だけで登録されていることが多いため、社員マスタの氏名から
// 空白を除いた部分一致で候補を検索する（is_hanchyoフラグの有無は問わない。まだ班長登録
// されていない社員もここから見つけて紐付け・登録できるようにするため）
app.get('/api/kancho/members/:id/employee-match', async (c) => {
  const id = parseInt(c.req.param('id'));
  const member = await c.env.DB.prepare('SELECT name, emp_no FROM kancho_members WHERE id = ?')
    .bind(id).first<{ name: string; emp_no: string | null }>();
  if (!member) return c.json({ error: 'メンバーが見つかりません' }, 404);

  const current = member.emp_no
    ? await c.env.DB.prepare('SELECT emp_no, name, is_hanchyo FROM employees WHERE emp_no = ?')
        .bind(member.emp_no).first<{ emp_no: string; name: string; is_hanchyo: number }>()
    : null;

  const nameForSearch = member.name.replace(/[　\s]/g, '');
  let candidates: Array<{ emp_no: string; name: string; is_hanchyo: number }> = [];
  if (nameForSearch && member.name !== VACANT_SLOT_LABEL) {
    const rows = await c.env.DB.prepare(
      `SELECT emp_no, name, is_hanchyo FROM employees
       WHERE is_active = 1 AND REPLACE(REPLACE(name, ' ', ''), '　', '') LIKE '%' || ? || '%'
       ORDER BY name LIMIT 20`
    ).bind(nameForSearch).all<{ emp_no: string; name: string; is_hanchyo: number }>();
    candidates = rows.results ?? [];
  }
  return c.json({ current, candidates, row_name: member.name });
});

app.post('/api/kancho/members/:id/employee-link', async (c) => {
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ emp_no?: string }>();
  const empNo = (b.emp_no ?? '').trim();
  if (!empNo) return c.json({ error: '社員番号が必要です' }, 400);

  const old = await c.env.DB.prepare('SELECT name, year, month, emp_no FROM kancho_members WHERE id = ?')
    .bind(id).first<{ name: string; year: number; month: number; emp_no: string | null }>();
  if (!old) return c.json({ error: 'メンバーが見つかりません' }, 404);

  const emp = await c.env.DB.prepare('SELECT name, is_hanchyo FROM employees WHERE emp_no = ? AND is_active = 1')
    .bind(empNo).first<{ name: string; is_hanchyo: number }>();
  if (!emp) return c.json({ error: '社員が見つかりません' }, 404);

  const dup = await c.env.DB.prepare('SELECT id FROM kancho_members WHERE year = ? AND month = ? AND emp_no = ? AND id != ?')
    .bind(old.year, old.month, empNo, id).first<{ id: number }>();
  if (dup) return c.json({ error: 'この社員番号は同じ月度の別の枠で既に使われています' }, 400);

  const { id: adminId, name: adminUser } = await adminName(c);
  if (!emp.is_hanchyo) {
    await c.env.DB.prepare('UPDATE employees SET is_hanchyo = 1 WHERE emp_no = ?').bind(empNo).run();
  }
  await c.env.DB.prepare(`UPDATE kancho_members SET emp_no = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .bind(empNo, id).run();
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(adminId, adminUser, 'member', old.name, `番${old.emp_no ?? ''}`, `番${empNo}（${emp.name}・社員管理と照合して紐付け）`).run();
  await propagateForward(c.env.DB, id);
  return c.json({ ok: true });
});

app.post('/api/kancho/members/:id/employee-register', async (c) => {
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ emp_no?: string; name?: string }>();
  const empNo = (b.emp_no ?? '').trim();
  const fullName = (b.name ?? '').trim();
  if (!/^\d{8}$/.test(empNo)) return c.json({ error: '社員番号は8桁の数字で入力してください' }, 400);
  if (!fullName) return c.json({ error: '氏名を入力してください' }, 400);

  const old = await c.env.DB.prepare('SELECT name, year, month FROM kancho_members WHERE id = ?')
    .bind(id).first<{ name: string; year: number; month: number }>();
  if (!old) return c.json({ error: 'メンバーが見つかりません' }, 404);

  const { id: adminId, name: adminUser } = await adminName(c);
  try {
    await c.env.DB.prepare('INSERT INTO employees (emp_no, name, is_hanchyo, is_active) VALUES (?, ?, 1, 1)')
      .bind(empNo, fullName).run();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes('unique')) return c.json({ error: `社員番号「${empNo}」は既に登録されています` }, 400);
    return c.json({ error: `登録に失敗しました: ${msg}` }, 500);
  }

  await c.env.DB.prepare(`UPDATE kancho_members SET emp_no = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .bind(empNo, id).run();
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(adminId, adminUser, 'member', old.name, '', `番${empNo}（${fullName}・社員管理に新規登録して紐付け）`).run();
  await propagateForward(c.env.DB, id);
  return c.json({ ok: true });
});

export default app;
