// 出勤者の判定ロジック（社員カルテ「シフト」タブ・出勤者ボードで共用）
//
// 方針: 「乗務員シフト（crew_shifts / PDF取込・手修正）を優先し、無ければ社員マスタの勤務体系で補完」
//   - crew_shifts はその日の勤務記号（Ｈ/Ｄ/Ｂ/ａ/ｂ/公/指/内 …全角）を1メンバー1日1件で持つ。
//     crew_shift_members.emp_code = employees.emp_no で社員に紐づく。
//   - 補完は employees.work_schedule（a/b/B/D/H 半角）＋ start_time。公休は判別できないため
//     「その日にシフトデータが1件も無い」場合のみ全員を補完対象にする（データがある日は
//     シフトに無い人＝未取込の人だけ補完）。
//
// 勤務記号と勤務体系は別の記法なので、表示用グループへ正規化してまとめる。

export type AttendancePerson = {
  empId: number;
  empNo: string;
  name: string;
  division: number | null;
  team: number | null;
  carNo: string | null;
  groupKey: string;
  groupLabel: string;
  groupOrder: number;
  detail: string; // 勤務記号ラベル or 出勤時刻
  source: 'shift' | 'schedule';
};

export type AttendanceResult = {
  hasShiftData: boolean; // その日に crew_shifts の行が存在したか
  people: AttendancePerson[];
};

export type MonthShiftDay = {
  date: string; // YYYY-MM-DD
  label: string; // 表示ラベル（記号ラベル / 「17:00」 / 「—」）
  working: boolean;
  source: 'shift' | 'schedule' | 'none';
};

type ShiftType = { code: string; label: string; category: string };

// 勤務記号（crew_shift_types.code・全角）→ 表示グループ
const SHIFT_CODE_GROUP: Record<string, { key: string; label: string; order: number }> = {
  'Ｈ': { key: 'kaku_h', label: '隔勤（H番）', order: 10 },
  'Ｄ': { key: 'kaku_d', label: '隔勤（D番）', order: 11 },
  'Ｂ': { key: 'kaku_b', label: '隔勤（B番）', order: 12 },
  'ａ': { key: 'nikkin_a', label: '日勤Ａ', order: 20 },
  'ｂ': { key: 'nikkin_b', label: '日勤Ｂ', order: 21 },
  '内': { key: 'naikin', label: '内勤', order: 40 },
};

// 社員マスタの勤務体系（employees.work_schedule・半角）→ 表示グループ
// （メモ: b=日勤B / B=B勤ナイト / a=早番 / D=日勤 / H=半夜）
const WORK_SCHEDULE_GROUP: Record<string, { key: string; label: string; order: number }> = {
  a: { key: 'ws_a', label: '早番（a）', order: 22 },
  b: { key: 'ws_b', label: '日勤Ｂ（b）', order: 23 },
  B: { key: 'ws_bn', label: 'Ｂ勤（B）', order: 24 },
  D: { key: 'ws_d', label: '日勤（D）', order: 25 },
  H: { key: 'ws_h', label: '半夜（H）', order: 26 },
};

const OTHER_GROUP = { key: 'other', label: 'その他 / 未設定', order: 90 };

function workScheduleLabel(ws: string | null): string {
  if (!ws) return '';
  return WORK_SCHEDULE_GROUP[ws]?.label ?? ws;
}

async function loadShiftTypes(db: D1Database): Promise<Map<string, ShiftType>> {
  const rows = (await db.prepare('SELECT code, label, category FROM crew_shift_types').all<ShiftType>()).results ?? [];
  const m = new Map<string, ShiftType>();
  for (const r of rows) m.set(r.code, r);
  return m;
}

type EmpRow = {
  id: number; emp_no: string; name: string;
  division: number | null; team: number | null;
  car_no: string | null; work_schedule: string | null; start_time: string | null;
};

/** 指定日の出勤者を勤務区分ごとに解決する */
export async function resolveAttendance(db: D1Database, dateStr: string): Promise<AttendanceResult> {
  const [types, shiftRowsRes, empRowsRes] = await Promise.all([
    loadShiftTypes(db),
    db.prepare(
      `SELECT m.emp_code AS emp_code, s.code AS code
       FROM crew_shifts s JOIN crew_shift_members m ON m.id = s.member_id
       WHERE s.date = ?`
    ).bind(dateStr).all<{ emp_code: string; code: string }>(),
    db.prepare(
      `SELECT id, emp_no, name, division, team, car_no, work_schedule, start_time
       FROM employees WHERE is_active = 1`
    ).all<EmpRow>(),
  ]);

  const shiftRows = shiftRowsRes.results ?? [];
  const shiftByEmpNo = new Map<string, string>();
  for (const r of shiftRows) shiftByEmpNo.set(r.emp_code, r.code);
  const hasShiftData = shiftRows.length > 0;

  const people: AttendancePerson[] = [];
  for (const e of empRowsRes.results ?? []) {
    const code = shiftByEmpNo.get(e.emp_no);
    if (code) {
      const t = types.get(code);
      if (t && t.category === 'off') continue; // 公休・指定公休は出勤者ではない
      const g = SHIFT_CODE_GROUP[code] ?? { ...OTHER_GROUP, label: t?.label || code };
      people.push({
        empId: e.id, empNo: e.emp_no, name: e.name, division: e.division, team: e.team, carNo: e.car_no,
        groupKey: g.key, groupLabel: g.label, groupOrder: g.order,
        detail: t?.label || code, source: 'shift',
      });
      continue;
    }
    // シフトに無い人: 「その日にシフトデータが全く無い」or「未取込の人」を勤務体系で補完
    if (!e.work_schedule) continue;
    const g = WORK_SCHEDULE_GROUP[e.work_schedule] ?? OTHER_GROUP;
    people.push({
      empId: e.id, empNo: e.emp_no, name: e.name, division: e.division, team: e.team, carNo: e.car_no,
      groupKey: g.key, groupLabel: g.label, groupOrder: g.order,
      detail: e.start_time ? `${e.start_time}出` : workScheduleLabel(e.work_schedule),
      source: 'schedule',
    });
  }

  people.sort((a, b) =>
    a.groupOrder - b.groupOrder ||
    (a.division ?? 99) - (b.division ?? 99) ||
    (a.team ?? 99) - (b.team ?? 99) ||
    a.name.localeCompare(b.name, 'ja')
  );
  return { hasShiftData, people };
}

/** 指定社員の指定月（1-12）の日別シフトを解決する。カルテ「シフト」タブ用 */
export async function resolveEmployeeMonthShifts(
  db: D1Database, empId: number, year: number, month: number
): Promise<MonthShiftDay[]> {
  const emp = await db.prepare(
    'SELECT id, emp_no, work_schedule, start_time FROM employees WHERE id = ?'
  ).bind(empId).first<{ id: number; emp_no: string; work_schedule: string | null; start_time: string | null }>();
  if (!emp) return [];

  const mm = String(month).padStart(2, '0');
  const first = `${year}-${mm}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const last = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;

  const [types, shiftRowsRes] = await Promise.all([
    loadShiftTypes(db),
    db.prepare(
      `SELECT s.date AS date, s.code AS code
       FROM crew_shifts s JOIN crew_shift_members m ON m.id = s.member_id
       WHERE m.emp_code = ? AND s.date >= ? AND s.date <= ?`
    ).bind(emp.emp_no, first, last).all<{ date: string; code: string }>(),
  ]);
  const shiftByDate = new Map<string, string>();
  for (const r of shiftRowsRes.results ?? []) shiftByDate.set(r.date, r.code);

  const days: MonthShiftDay[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const date = `${year}-${mm}-${String(d).padStart(2, '0')}`;
    const code = shiftByDate.get(date);
    if (code) {
      const t = types.get(code);
      days.push({
        date,
        label: t?.label || code,
        working: !(t && t.category === 'off'),
        source: 'shift',
      });
    } else if (emp.work_schedule) {
      days.push({
        date,
        label: emp.start_time ? `${emp.start_time}` : workScheduleLabel(emp.work_schedule),
        working: true,
        source: 'schedule',
      });
    } else {
      days.push({ date, label: '—', working: false, source: 'none' });
    }
  }
  return days;
}
