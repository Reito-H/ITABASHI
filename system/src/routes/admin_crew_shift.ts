// 乗務員シフト（月間勤務予定表PDFのWeb版）+ 夏季稼働計画対実績
// ページ: /crew-shift（グリッド） /summer-report（Excel再現）
// API   : /api/crew-shift/* /api/summer-report/*（管理パス配下。編集系は <crew-shift.edit> 必須）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { crewShiftPage, type CrewShiftMember, type CrewShiftType, type CrewShiftCell } from '../html/crew_shift';
import { todayJST } from '../benten';
import { summerReportPage, type SummerReportPeriod, type SummerReportDailyRow, type ForecastByDate } from '../html/summer_report';
import { crewPortalSubNav } from '../html/crew_portal_nav';
import { getAdminPermissions } from '../permissions';
import { parseCrewShiftPdf } from '../utils/crew_shift_pdf';
import { renderUtilizationReportPage, type UtilizationCapacityRow, type UtilizationReportRow, type UtilizationAutoRow } from '../html/vehicle_utilization_report';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<{ id: number; name: string }> {
  const id = c.get('adminId');
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(id).first<{ username: string }>();
  return { id, name: row?.username ?? `id:${id}` };
}

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('crew-shift.edit');
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00Z');
  const endD = new Date(end + 'T00:00:00Z');
  while (cur <= endD) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

const DIVISION = '板橋2課';

// ===== ページ: 乗務員シフト =====
app.get('/crew-shift', async (c) => {
  const divisionsRes = await c.env.DB.prepare(
    'SELECT DISTINCT division FROM crew_shift_members WHERE is_active = 1 ORDER BY division'
  ).all<{ division: string }>();
  const divisions = (divisionsRes.results ?? []).map(r => r.division);
  if (divisions.length === 0) divisions.push(DIVISION);

  const reqDivision = c.req.query('division');
  const division = (reqDivision && divisions.includes(reqDivision)) ? reqDivision : divisions[0];

  const periodsRes = await c.env.DB.prepare(
    'SELECT DISTINCT start_date, end_date FROM crew_shift_imports WHERE division = ? ORDER BY start_date DESC'
  ).bind(division).all<{ start_date: string; end_date: string }>();
  const periods = periodsRes.results ?? [];

  let start = c.req.query('start');
  let end = c.req.query('end');
  if (!start || !end) {
    if (periods[0]) { start = periods[0].start_date; end = periods[0].end_date; }
    else {
      const today = new Date().toISOString().slice(0, 10);
      start = today; end = today;
    }
  }

  const [membersRes, typesRes, shiftsRes] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM crew_shift_members WHERE division = ? AND is_active = 1 ORDER BY team, sort_order, id').bind(division).all<CrewShiftMember>(),
    c.env.DB.prepare('SELECT * FROM crew_shift_types WHERE is_active = 1 ORDER BY sort_order, id').all<CrewShiftType>(),
    c.env.DB.prepare('SELECT cs.member_id, cs.date, cs.code FROM crew_shifts cs JOIN crew_shift_members m ON m.id = cs.member_id WHERE m.division = ? AND cs.date BETWEEN ? AND ?')
      .bind(division, start, end).all<{ member_id: number; date: string; code: string }>(),
  ]);

  const shiftMap: Record<string, CrewShiftCell> = {};
  for (const s of (shiftsRes.results ?? [])) shiftMap[`${s.member_id}_${s.date}`] = { code: s.code };

  const dates = dateRange(start!, end!);
  const editable = await canEdit(c);
  const html = crewShiftPage(membersRes.results ?? [], typesRes.results ?? [], shiftMap, dates, division, start!, end!, editable, periods, divisions, todayJST());
  return c.html(layout('乗務員シフト', crewPortalSubNav('crew-shift') + html, 'crew-portal'));
});

// ===== ページ: 夏季稼働計画対実績 =====
app.get('/summer-report', async (c) => {
  const now = new Date();
  const fy = parseInt(c.req.query('fy') ?? '') || now.getFullYear();

  let period = await c.env.DB.prepare('SELECT * FROM summer_report_periods WHERE fiscal_year = ? AND division = ?')
    .bind(fy, DIVISION).first<SummerReportPeriod>();
  if (!period) {
    const start = `${fy}-08-01`;
    const end = `${fy}-08-17`;
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO summer_report_periods (fiscal_year, division, start_date, end_date) VALUES (?, ?, ?, ?)'
    ).bind(fy, DIVISION, start, end).run();
    period = await c.env.DB.prepare('SELECT * FROM summer_report_periods WHERE fiscal_year = ? AND division = ?')
      .bind(fy, DIVISION).first<SummerReportPeriod>();
  }

  const periodListRes = await c.env.DB.prepare('SELECT * FROM summer_report_periods WHERE division = ? ORDER BY fiscal_year DESC').bind(DIVISION).all<SummerReportPeriod>();

  if (!period) {
    return c.html(layout('夏季稼働計画対実績', crewPortalSubNav('crew-shift') + summerReportPage(null, [], {}, {}, false, periodListRes.results ?? []), 'crew-portal'));
  }

  const dates = dateRange(period.start_date, period.end_date);
  const [dailyRes, forecastRes] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM summer_report_daily WHERE period_id = ?').bind(period.id).all<SummerReportDailyRow>(),
    c.env.DB.prepare(`
      SELECT cs.date, t.category, SUM(t.count_weight) as total
      FROM crew_shifts cs
      JOIN crew_shift_members m ON m.id = cs.member_id
      JOIN crew_shift_types t ON t.code = cs.code
      WHERE m.division = ? AND cs.date BETWEEN ? AND ?
      GROUP BY cs.date, t.category
    `).bind(DIVISION, period.start_date, period.end_date).all<{ date: string; category: string; total: number }>(),
  ]);

  const daily: Record<string, SummerReportDailyRow> = {};
  for (const r of (dailyRes.results ?? [])) daily[r.date] = r;

  const forecast: ForecastByDate = {};
  for (const d of dates) forecast[d] = { nikkin_a: 0, nikkin_b: 0, kakukin: 0 };
  for (const r of (forecastRes.results ?? [])) {
    if (!forecast[r.date]) continue;
    if (r.category === 'nikkin_a') forecast[r.date].nikkin_a = r.total;
    else if (r.category === 'nikkin_b') forecast[r.date].nikkin_b = r.total;
    else if (r.category === 'kakukin') forecast[r.date].kakukin = r.total;
  }

  const editable = await canEdit(c);
  const html = summerReportPage(period, dates, daily, forecast, editable, periodListRes.results ?? []);
  return c.html(layout('夏季稼働計画対実績', crewPortalSubNav('crew-shift') + html, 'crew-portal'));
});

// ===== API: シフト一括保存 =====
app.post('/api/crew-shift/shifts/batch', async (c) => {
  const body = await c.req.json<{ entries: Array<{ member_id: number; date: string; code: string | null }> }>();
  const rawEntries = body.entries ?? [];
  if (rawEntries.length === 0) return c.json({ ok: true, saved: 0 });
  if (rawEntries.length > 500) return c.json({ error: '一度に保存できるのは500件までです' }, 400);

  const { id: adminId, name } = await adminName(c);
  const memberRows = await c.env.DB.prepare('SELECT id, name FROM crew_shift_members').all<{ id: number; name: string }>();
  const memberNames = new Map((memberRows.results ?? []).map(m => [m.id, m.name]));

  const entries = rawEntries.filter(e => e.member_id && /^\d{4}-\d{2}-\d{2}$/.test(e.date ?? ''));
  if (entries.length === 0) return c.json({ ok: true, saved: 0 });

  // 対象セルの既存コードをまとめて1回で取得（エントリ毎の個別SELECTを避ける）
  const memberIds = [...new Set(entries.map(e => e.member_id))];
  const sortedDates = entries.map(e => e.date).sort();
  const placeholders = memberIds.map(() => '?').join(',');
  const existingRows = await c.env.DB.prepare(
    `SELECT member_id, date, code FROM crew_shifts WHERE member_id IN (${placeholders}) AND date BETWEEN ? AND ?`
  ).bind(...memberIds, sortedDates[0], sortedDates[sortedDates.length - 1])
    .all<{ member_id: number; date: string; code: string }>();
  const oldMap = new Map((existingRows.results ?? []).map(r => [`${r.member_id}_${r.date}`, r.code]));

  let saved = 0;
  const stmts: ReturnType<typeof c.env.DB.prepare>[] = [];
  for (const e of entries) {
    const code = (e.code ?? '').trim();
    const oldCode = oldMap.get(`${e.member_id}_${e.date}`) ?? '';
    if (oldCode === code) continue;

    if (code === '') {
      stmts.push(c.env.DB.prepare('DELETE FROM crew_shifts WHERE member_id = ? AND date = ?').bind(e.member_id, e.date));
    } else {
      stmts.push(c.env.DB.prepare(
        `INSERT INTO crew_shifts (member_id, date, code, updated_at, updated_by) VALUES (?, ?, ?, datetime('now','localtime'), ?)
         ON CONFLICT(member_id, date) DO UPDATE SET code = excluded.code, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
      ).bind(e.member_id, e.date, code, name));
    }
    stmts.push(c.env.DB.prepare(
      'INSERT INTO crew_shift_edit_logs (admin_id, admin_name, action, target, date, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(adminId, name, 'shift', memberNames.get(e.member_id) ?? `member:${e.member_id}`, e.date, oldCode, code));
    saved++;
  }
  if (stmts.length > 0) await c.env.DB.batch(stmts);
  return c.json({ ok: true, saved });
});

// ===== API: PDF取込 =====
app.post('/api/crew-shift/import-pdf', async (c) => {
  const body = await c.req.json<{ file_name?: string; data?: string }>();
  if (!body.data) return c.json({ error: 'PDFデータがありません' }, 400);

  let bytes: Uint8Array;
  try {
    const bin = atob(body.data);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return c.json({ error: 'PDFファイルの読み込みに失敗しました' }, 400);
  }

  let parsed;
  try {
    parsed = await parseCrewShiftPdf(bytes);
  } catch (err) {
    console.error('crew-shift pdf parse error', err);
    return c.json({ error: `PDFの解析に失敗しました: ${err instanceof Error ? err.message : String(err)}` }, 400);
  }
  if (parsed.members.length === 0) {
    return c.json({ error: 'PDFから乗務員データを読み取れませんでした。「月初勤務予定表」形式のPDFか確認してください', warnings: parsed.warnings }, 400);
  }

  const { id: adminId, name } = await adminName(c);

  // PDFに含まれる課（1課〜4課など複数のことがある）ごとに削除・集計を行う
  const divisions = [...new Set(parsed.members.map(m => m.division))].sort();
  const empDivision = new Map(parsed.members.map(m => [m.emp_code, m.division]));

  try {
    // メンバーをupsert（emp_codeで一意）。既存は氏名・車両コード・班を最新化
    // まとめてbatch実行し、その後emp_code→idをまとめて引く（1件ずつ往復しない）
    const UPSERT_BATCH = 100;
    let sortBase = 0;
    const memberStmts = parsed.members.map(m => {
      sortBase += 10;
      return c.env.DB.prepare(
        `INSERT INTO crew_shift_members (emp_code, name, car_no, division, team, sort_order) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(emp_code) DO UPDATE SET name = excluded.name, car_no = excluded.car_no, division = excluded.division, team = excluded.team,
           is_active = 1, updated_at = datetime('now','localtime')`
      ).bind(m.emp_code, m.name, m.car_no, m.division, m.team, sortBase);
    });
    for (let i = 0; i < memberStmts.length; i += UPSERT_BATCH) {
      await c.env.DB.batch(memberStmts.slice(i, i + UPSERT_BATCH));
    }

    const empIdMap = new Map<string, number>();
    const empCodes = parsed.members.map(m => m.emp_code);
    const LOOKUP_BATCH = 100;
    for (let i = 0; i < empCodes.length; i += LOOKUP_BATCH) {
      const chunk = empCodes.slice(i, i + LOOKUP_BATCH);
      const placeholders = chunk.map(() => '?').join(',');
      const rows = await c.env.DB.prepare(`SELECT id, emp_code FROM crew_shift_members WHERE emp_code IN (${placeholders})`)
        .bind(...chunk).all<{ id: number; emp_code: string }>();
      for (const r of (rows.results ?? [])) empIdMap.set(r.emp_code, r.id);
    }

    // 同一期間は上書き（対象課ごとに、期間内の既存シフトを削除してから入れ直す）
    for (const div of divisions) {
      await c.env.DB.prepare(
        `DELETE FROM crew_shifts WHERE date BETWEEN ? AND ? AND member_id IN (SELECT id FROM crew_shift_members WHERE division = ?)`
      ).bind(parsed.startDate, parsed.endDate, div).run();
    }

    const SHIFT_BATCH = 100;
    let cellCount = 0;
    const cellCountByDivision = new Map<string, number>();
    for (let i = 0; i < parsed.shifts.length; i += SHIFT_BATCH) {
      const chunk = parsed.shifts.slice(i, i + SHIFT_BATCH);
      const stmts = chunk.map(s => {
        const memberId = empIdMap.get(s.emp_code);
        if (!memberId) return null;
        cellCount++;
        const div = empDivision.get(s.emp_code) ?? '';
        cellCountByDivision.set(div, (cellCountByDivision.get(div) ?? 0) + 1);
        return c.env.DB.prepare(
          `INSERT INTO crew_shifts (member_id, date, code, updated_at, updated_by) VALUES (?, ?, ?, datetime('now','localtime'), 'pdf-import')
           ON CONFLICT(member_id, date) DO UPDATE SET code = excluded.code, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
        ).bind(memberId, s.date, s.code);
      }).filter((x): x is NonNullable<typeof x> => x !== null);
      if (stmts.length) await c.env.DB.batch(stmts);
    }

    const memberCountByDivision = new Map<string, number>();
    for (const m of parsed.members) memberCountByDivision.set(m.division, (memberCountByDivision.get(m.division) ?? 0) + 1);

    const logStmts = [];
    for (const div of divisions) {
      const mCount = memberCountByDivision.get(div) ?? 0;
      const cCount = cellCountByDivision.get(div) ?? 0;
      logStmts.push(c.env.DB.prepare(
        'INSERT INTO crew_shift_imports (division, team, start_date, end_date, file_name, member_count, cell_count, imported_by) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)'
      ).bind(div, parsed.startDate, parsed.endDate, body.file_name ?? '', mCount, cCount, name));
      logStmts.push(c.env.DB.prepare(
        'INSERT INTO crew_shift_edit_logs (admin_id, admin_name, action, target, date, new_value) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(adminId, name, 'import', `${div} / ${body.file_name ?? 'PDF'}`, parsed.startDate, `${mCount}名 / ${cCount}件 取込（〜${parsed.endDate}）`));
    }
    await c.env.DB.batch(logStmts);

    return c.json({
      ok: true,
      member_count: parsed.members.length,
      cell_count: cellCount,
      start_date: parsed.startDate,
      end_date: parsed.endDate,
      divisions,
      warnings: parsed.warnings,
    });
  } catch (err) {
    console.error('crew-shift pdf import error', err);
    return c.json({ error: `PDFの取込中にエラーが発生しました: ${err instanceof Error ? err.message : String(err)}` }, 500);
  }
});

// ===== API: 整合性チェック（隔勤の翌日に予定が入っていないか） =====
// 隔勤（Ｈ/Ｄ/Ｂ）は1回の出番が実質2日にまたがるため、暦日で翌日は必ず「明け」（記号なし）。
// 翌日に何か記号が入っていれば、同じ記号のBB連続や、明けの日に公休が来ているなど矛盾がある。
app.get('/api/crew-shift/integrity-check', async (c) => {
  const division = c.req.query('division') ?? DIVISION;
  const rows = await c.env.DB.prepare(`
    SELECT m.id as member_id, m.name, m.team, a.date as date1, a.code as code1, b.date as date2, b.code as code2
    FROM crew_shifts a
    JOIN crew_shift_members m ON m.id = a.member_id
    JOIN crew_shifts b ON b.member_id = a.member_id AND date(b.date) = date(a.date, '+1 day')
    WHERE m.division = ? AND m.is_active = 1 AND a.code IN ('Ｈ', 'Ｄ', 'Ｂ')
    ORDER BY m.team, m.sort_order, a.date
  `).bind(division).all<{ member_id: number; name: string; team: number; date1: string; code1: string; date2: string; code2: string }>();
  return c.json({ violations: rows.results ?? [] });
});

// ===== API: 乗務員証挿しチェック（日付ごと・サーバー保存） =====
app.get('/api/crew-shift/card-check', async (c) => {
  const division = c.req.query('division') ?? DIVISION;
  const date = c.req.query('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'date が不正です' }, 400);

  const [membersRes, shiftsRes, checksRes] = await Promise.all([
    c.env.DB.prepare('SELECT id, name, team, car_no FROM crew_shift_members WHERE division = ? AND is_active = 1 ORDER BY team, sort_order, id')
      .bind(division).all<{ id: number; name: string; team: number; car_no: string | null }>(),
    c.env.DB.prepare('SELECT cs.member_id, cs.code FROM crew_shifts cs JOIN crew_shift_members m ON m.id = cs.member_id WHERE m.division = ? AND cs.date = ?')
      .bind(division, date).all<{ member_id: number; code: string }>(),
    c.env.DB.prepare('SELECT cc.member_id, cc.checked_by, cc.checked_at FROM crew_card_checks cc JOIN crew_shift_members m ON m.id = cc.member_id WHERE m.division = ? AND cc.date = ?')
      .bind(division, date).all<{ member_id: number; checked_by: string; checked_at: string }>(),
  ]);

  const codeMap = new Map((shiftsRes.results ?? []).map(s => [s.member_id, s.code]));
  const checkMap = new Map((checksRes.results ?? []).map(r => [r.member_id, r]));

  const members = (membersRes.results ?? []).map(m => ({
    id: m.id, name: m.name, team: m.team, car_no: m.car_no,
    code: codeMap.get(m.id) ?? '',
    checked_by: checkMap.get(m.id)?.checked_by ?? null,
    checked_at: checkMap.get(m.id)?.checked_at ?? null,
  }));
  return c.json({ date, members });
});

app.post('/api/crew-shift/card-check', async (c) => {
  const body = await c.req.json<{ member_id?: number; date?: string; checked?: boolean }>();
  if (!body.member_id || !/^\d{4}-\d{2}-\d{2}$/.test(body.date ?? '')) return c.json({ error: 'member_id / date が不正です' }, 400);

  if (body.checked) {
    const { name } = await adminName(c);
    await c.env.DB.prepare(
      `INSERT INTO crew_card_checks (member_id, date, checked_by, checked_at) VALUES (?, ?, ?, datetime('now','localtime'))
       ON CONFLICT(member_id, date) DO UPDATE SET checked_by = excluded.checked_by, checked_at = excluded.checked_at`
    ).bind(body.member_id, body.date, name).run();
  } else {
    await c.env.DB.prepare('DELETE FROM crew_card_checks WHERE member_id = ? AND date = ?').bind(body.member_id, body.date).run();
  }
  return c.json({ ok: true });
});

// ===== API: 履歴 =====
app.get('/api/crew-shift/logs', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '200') || 200, 500);
  const rows = await c.env.DB.prepare(
    'SELECT admin_name, action, target, date, old_value, new_value, created_at FROM crew_shift_edit_logs ORDER BY id DESC LIMIT ?'
  ).bind(limit).all();
  return c.json({ logs: rows.results ?? [] });
});

// ===== API: 夏季稼働レポート保存 =====
app.post('/api/summer-report/save', async (c) => {
  const b = await c.req.json<{
    period_id?: number; vehicle_count?: number; target_paid_users?: number | null;
    working_headcount_forecast?: number | null; input_name?: string;
    daily?: Record<string, Partial<SummerReportDailyRow>>;
  }>();
  if (!b.period_id) return c.json({ error: 'period_id が必要です' }, 400);
  const period = await c.env.DB.prepare('SELECT id FROM summer_report_periods WHERE id = ?').bind(b.period_id).first<{ id: number }>();
  if (!period) return c.json({ error: '期間が見つかりません' }, 404);

  await c.env.DB.prepare(
    `UPDATE summer_report_periods SET vehicle_count = ?, target_paid_users = ?, working_headcount_forecast = ?, input_name = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).bind(b.vehicle_count ?? 0, b.target_paid_users ?? null, b.working_headcount_forecast ?? null, (b.input_name ?? '').slice(0, 40), b.period_id).run();

  const daily = b.daily ?? {};
  const stmts = [];
  for (const [date, v] of Object.entries(daily)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    stmts.push(c.env.DB.prepare(
      `INSERT INTO summer_report_daily (period_id, date, nikkin_a_actual, nikkin_b_actual, kakukin_actual, paid_leave_planned_days, paid_leave_actual_days, last_year_nikkin_a, last_year_nikkin_b, last_year_kakukin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(period_id, date) DO UPDATE SET
         nikkin_a_actual = excluded.nikkin_a_actual, nikkin_b_actual = excluded.nikkin_b_actual, kakukin_actual = excluded.kakukin_actual,
         paid_leave_planned_days = excluded.paid_leave_planned_days, paid_leave_actual_days = excluded.paid_leave_actual_days,
         last_year_nikkin_a = excluded.last_year_nikkin_a, last_year_nikkin_b = excluded.last_year_nikkin_b, last_year_kakukin = excluded.last_year_kakukin`
    ).bind(
      b.period_id, date,
      v.nikkin_a_actual ?? null, v.nikkin_b_actual ?? null, v.kakukin_actual ?? null,
      v.paid_leave_planned_days ?? null, v.paid_leave_actual_days ?? null,
      v.last_year_nikkin_a ?? null, v.last_year_nikkin_b ?? null, v.last_year_kakukin ?? null,
    ));
  }
  if (stmts.length) await c.env.DB.batch(stmts);

  const { id: adminId, name } = await adminName(c);
  await c.env.DB.prepare(
    'INSERT INTO crew_shift_edit_logs (admin_id, admin_name, action, target, new_value) VALUES (?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'summer_report', `期間ID:${b.period_id}`, '保存').run();

  return c.json({ ok: true });
});

// ===== ページ: 稼働台数報告表 =====
app.get('/utilization-report', async (c) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('date') ?? '') ? c.req.query('date')! : todayJST();

  const [capacityRes, reportRes, autoRes] = await Promise.all([
    c.env.DB.prepare('SELECT division, capacity FROM vehicle_utilization_capacity ORDER BY division').all<UtilizationCapacityRow>(),
    c.env.DB.prepare('SELECT * FROM vehicle_utilization_reports WHERE date = ?').bind(date).all<UtilizationReportRow>(),
    c.env.DB.prepare(`
      SELECT m.division, t.category, SUM(t.count_weight) as total
      FROM crew_shifts cs
      JOIN crew_shift_members m ON m.id = cs.member_id
      JOIN crew_shift_types t ON t.code = cs.code
      WHERE cs.date = ? AND m.is_active = 1
      GROUP BY m.division, t.category
    `).bind(date).all<{ division: string; category: string; total: number }>(),
  ]);

  const reportMap: Record<string, UtilizationReportRow> = {};
  for (const r of (reportRes.results ?? [])) reportMap[r.division] = r;

  const autoMap: Record<string, UtilizationAutoRow> = {};
  for (const row of (capacityRes.results ?? [])) autoMap[row.division] = { kakukin: 0, nikkin: 0 };
  for (const r of (autoRes.results ?? [])) {
    if (!autoMap[r.division]) autoMap[r.division] = { kakukin: 0, nikkin: 0 };
    if (r.category === 'kakukin') autoMap[r.division].kakukin += r.total;
    else if (r.category === 'nikkin_a' || r.category === 'nikkin_b') autoMap[r.division].nikkin += r.total;
  }

  const editable = await canEdit(c);
  return c.html(renderUtilizationReportPage(date, capacityRes.results ?? [], reportMap, autoMap, editable));
});

// ===== API: 稼働台数報告表 保存 =====
app.post('/api/utilization-report/save', async (c) => {
  if (!await canEdit(c)) return c.json({ error: '権限がありません' }, 403);

  const b = await c.req.json<{
    date?: string;
    capacity?: Array<{ division: string; capacity: number }>;
    rows?: Array<{
      division: string; accident_off?: number; breakdown_off?: number; a_off?: number; b_off?: number;
      full_off?: number; operating?: number | null; float_a?: number; float_b?: number; float_kaku?: number;
    }>;
  }>();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date ?? '')) return c.json({ error: 'date が不正です' }, 400);

  const { id: adminId, name } = await adminName(c);
  const stmts = [];

  for (const cap of (b.capacity ?? [])) {
    if (!cap.division) continue;
    stmts.push(c.env.DB.prepare(
      `UPDATE vehicle_utilization_capacity SET capacity = ?, updated_at = datetime('now','localtime'), updated_by = ? WHERE division = ?`
    ).bind(cap.capacity ?? 0, name, cap.division));
  }

  for (const r of (b.rows ?? [])) {
    if (!r.division) continue;
    stmts.push(c.env.DB.prepare(
      `INSERT INTO vehicle_utilization_reports
         (date, division, accident_off, breakdown_off, a_off, b_off, full_off, operating, float_a, float_b, float_kaku, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?)
       ON CONFLICT(date, division) DO UPDATE SET
         accident_off = excluded.accident_off, breakdown_off = excluded.breakdown_off,
         a_off = excluded.a_off, b_off = excluded.b_off, full_off = excluded.full_off,
         operating = excluded.operating, float_a = excluded.float_a, float_b = excluded.float_b, float_kaku = excluded.float_kaku,
         updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).bind(
      b.date, r.division,
      r.accident_off ?? 0, r.breakdown_off ?? 0, r.a_off ?? 0, r.b_off ?? 0, r.full_off ?? 0,
      r.operating ?? null, r.float_a ?? 0, r.float_b ?? 0, r.float_kaku ?? 0, name,
    ));
  }

  if (stmts.length) await c.env.DB.batch(stmts);

  await c.env.DB.prepare(
    'INSERT INTO crew_shift_edit_logs (admin_id, admin_name, action, target, date, new_value) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'utilization', '稼働台数報告表', b.date, '保存').run();

  return c.json({ ok: true });
});

export default app;
