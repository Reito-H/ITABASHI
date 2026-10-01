// 個人別シフト（1人1ページ形式の月間勤務予定表PDFの取込＋社員ごとの検索・出力）
// ページ: /personal-shift
// API   : /api/crew-shift/import/* を共用（データはcrew_shift_members/crew_shiftsに一体化）
//         印刷帳票のみ GET /personal-shift/print（POSTのdata変更ではないため .edit 権限を要求しないGETにしている）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { crewPortalSubNav } from '../html/crew_portal_nav';
import { personalShiftPage } from '../html/personal_shift';
import { personalShiftPrintPage, type PersonalShiftPrintMember } from '../html/personal_shift_print';
import type { CrewShiftMember, CrewShiftType, CrewShiftCell } from '../html/crew_shift';
import { getAdminPermissions } from '../permissions';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

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

// ===== ページ: 個人別シフト =====
app.get('/personal-shift', async (c) => {
  const periodsRes = await c.env.DB.prepare(
    'SELECT DISTINCT start_date, end_date FROM crew_shift_imports ORDER BY start_date DESC'
  ).all<{ start_date: string; end_date: string }>();
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
    c.env.DB.prepare('SELECT * FROM crew_shift_members WHERE is_active = 1 ORDER BY division, team, sort_order, id').all<CrewShiftMember>(),
    c.env.DB.prepare('SELECT * FROM crew_shift_types WHERE is_active = 1 ORDER BY sort_order, id').all<CrewShiftType>(),
    c.env.DB.prepare('SELECT member_id, date, code FROM crew_shifts WHERE date BETWEEN ? AND ?').bind(start, end).all<{ member_id: number; date: string; code: string }>(),
  ]);

  const shiftMap: Record<string, CrewShiftCell> = {};
  for (const s of (shiftsRes.results ?? [])) shiftMap[`${s.member_id}_${s.date}`] = { code: s.code };

  const dates = dateRange(start!, end!);
  const editable = await canEdit(c);
  const html = personalShiftPage(membersRes.results ?? [], typesRes.results ?? [], shiftMap, dates, start!, end!, editable, periods);
  return c.html(layout('個人別シフト', crewPortalSubNav('personal-shift') + html, 'staff'));
});

// ===== 印刷帳票（GET。データ変更を伴わないため .edit 権限は要求しない） =====
app.get('/personal-shift/print', async (c) => {
  const idsParam = c.req.query('ids') ?? '';
  const memberIds = idsParam.split(',').map(s => parseInt(s, 10)).filter(n => Number.isInteger(n) && n > 0);
  const start = c.req.query('start') ?? '';
  const end = c.req.query('end') ?? '';
  if (memberIds.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return c.text('パラメータが不正です', 400);
  }
  if (memberIds.length > 200) return c.text('一度に印刷できるのは200名までです', 400);

  const placeholders = memberIds.map(() => '?').join(',');
  const [membersRes, typesRes, shiftsRes] = await Promise.all([
    c.env.DB.prepare(`SELECT emp_code, name, car_no, division, team, sheet_left_days FROM crew_shift_members WHERE id IN (${placeholders}) ORDER BY division, team, sort_order, id`)
      .bind(...memberIds).all<PersonalShiftPrintMember>(),
    c.env.DB.prepare('SELECT code, label, count_weight FROM crew_shift_types').all<{ code: string; label: string; count_weight: number }>(),
    c.env.DB.prepare(
      `SELECT m.emp_code, cs.date, cs.code FROM crew_shifts cs JOIN crew_shift_members m ON m.id = cs.member_id
       WHERE cs.member_id IN (${placeholders}) AND cs.date BETWEEN ? AND ?`
    ).bind(...memberIds, start, end).all<{ emp_code: string; date: string; code: string }>(),
  ]);

  const shiftMap: Record<string, string> = {};
  for (const s of (shiftsRes.results ?? [])) shiftMap[`${s.emp_code}_${s.date}`] = s.code;

  const dates = dateRange(start, end);
  const printedAt = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  const html = personalShiftPrintPage(membersRes.results ?? [], shiftMap, typesRes.results ?? [], dates, start, end, printedAt);
  return c.html(html);
});

export default app;
