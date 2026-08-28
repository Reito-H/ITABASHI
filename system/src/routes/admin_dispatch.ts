// 配車管理（乗務員シフトの新ビュー：日別配車ボード・車両ローテーション表）
// ページ: /dispatch-board（車番ごとの日別配車編集） /vehicle-rotation（車両×日付一覧、後続フェーズで実装）
// API   : /api/dispatch/*（管理パス配下。編集系は <crew-shift.edit> 必須。乗務員シフトと同一権限キーで運用）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { dispatchBoardPage, type DispatchVehicleRow, type DispatchAssignmentRow, type DispatchMember, type DispatchType } from '../html/dispatch_board';
import { crewPortalSubNav } from '../html/crew_portal_nav';
import { getAdminPermissions } from '../permissions';
import { todayJST } from '../benten';
import { loadTimeMasterMap, computeDailyAlerts, type CarAssignmentForAlert } from '../utils/dispatch_alerts';
import { getTantoshaPriorityMap } from '../utils/tantosha_lookup';
import { vehicleRotationPage, type RotationVehicleRow, type RotationCell, type RotationAlertLevel } from '../html/vehicle_rotation';
import type { DispatchLimitInfo as RotationLimitInfo } from '../html/dispatch_board';

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

// ka(1-4)+team(実際の班番号1-8、省略可)から対象team範囲を返す。ka省略/'all'/不正値はnull（絞り込みなし）
// 班番号は課ごとに1-2へ振り直さず、会社全体の実際の番号(1-8)をそのまま使う（admin_vehicle_deadlines.tsと同じ規約）
function teamRangeFromQuery(ka: string | undefined, team: string | undefined): [number, number] | null {
  if (!ka || !/^[1-4]$/.test(ka)) return null;
  const kaNum = parseInt(ka, 10);
  const lo = (kaNum - 1) * 2 + 1;
  const hi = (kaNum - 1) * 2 + 2;
  if (team && /^[1-8]$/.test(team)) {
    const t = parseInt(team, 10);
    if (t === lo || t === hi) return [t, t];
  }
  return [lo, hi];
}

function isValidDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export type VehicleLimitInfo = { status: 'none' | 'inspection_default' | 'extended' | 'blocked'; usableFrom: string | null; note: string };
const INSPECTION_DEFAULT_USABLE_FROM = '08:00';

// 点検・車検の期限日が当日と一致する車両に「8:00まで使用制限」をデフォルト適用し、
// dispatch_vehicle_daily_limits に明示的な上書き（延長/終日不可/解除）があればそちらを優先する
async function computeVehicleLimits(db: Env['DB'], date: string): Promise<Map<string, VehicleLimitInfo>> {
  const [overridesRes, meterRes, shakenRes] = await Promise.all([
    db.prepare('SELECT car_no, usable_from, is_blocked, note FROM dispatch_vehicle_daily_limits WHERE date = ?')
      .bind(date).all<{ car_no: string; usable_from: string | null; is_blocked: number; note: string }>(),
    db.prepare('SELECT car_no FROM meter_inspections WHERE tentative_limit = ? OR honkensa_limit = ?')
      .bind(date, date).all<{ car_no: string }>(),
    db.prepare('SELECT car_no FROM shaken_records WHERE shaken_date = ? OR shaken_limit = ? OR cert_exchange_limit = ?')
      .bind(date, date, date).all<{ car_no: string }>(),
  ]);

  const inspectionCars = new Set([...(meterRes.results ?? []), ...(shakenRes.results ?? [])].map(r => r.car_no));
  const result = new Map<string, VehicleLimitInfo>();
  for (const o of (overridesRes.results ?? [])) {
    if (o.is_blocked) result.set(o.car_no, { status: 'blocked', usableFrom: null, note: o.note ?? '' });
    else if (o.usable_from) result.set(o.car_no, { status: 'extended', usableFrom: o.usable_from, note: o.note ?? '' });
    else result.set(o.car_no, { status: 'none', usableFrom: null, note: o.note ?? '' }); // 明示的な制限解除
  }
  for (const carNo of inspectionCars) {
    if (!result.has(carNo)) result.set(carNo, { status: 'inspection_default', usableFrom: INSPECTION_DEFAULT_USABLE_FROM, note: '' });
  }
  return result;
}

// ===== ページ: 日別配車ボード =====
app.get('/dispatch-board', async (c) => {
  const date = isValidDate(c.req.query('date')) ? c.req.query('date')! : todayJST();
  const ka = c.req.query('ka') ?? '';
  const team = c.req.query('team') ?? '';
  const range = teamRangeFromQuery(ka, team);

  const where = range ? 'WHERE vt.team BETWEEN ? AND ?' : '';
  const vehiclesRes = await c.env.DB.prepare(
    `SELECT vt.car_no, vt.team FROM vehicle_teams vt ${where} ORDER BY CAST(vt.car_no AS INTEGER)`
  ).bind(...(range ?? [])).all<{ car_no: string; team: number }>();
  const vehicles: DispatchVehicleRow[] = vehiclesRes.results ?? [];

  const assignWhere = range ? 'AND da.team BETWEEN ? AND ?' : '';
  const assignRes = await c.env.DB.prepare(
    `SELECT da.car_no, da.team, da.shift_code, m.emp_code, m.name as member_name, da.note
     FROM dispatch_assignments da
     LEFT JOIN crew_shift_members m ON m.id = da.member_id
     WHERE da.date = ? ${assignWhere}
     ORDER BY da.car_no, da.shift_code`
  ).bind(date, ...(range ?? [])).all<DispatchAssignmentRow>();
  const assignments: DispatchAssignmentRow[] = assignRes.results ?? [];

  // 前日の配車（日またぎのアラート判定に使う。前勤務者の帰庫見込みと当日最初の出庫を比較する）
  const prevDate = new Date(date + 'T00:00:00Z');
  prevDate.setUTCDate(prevDate.getUTCDate() - 1);
  const prevDateStr = prevDate.toISOString().slice(0, 10);
  const prevAssignRes = await c.env.DB.prepare(
    `SELECT car_no, shift_code FROM dispatch_assignments da WHERE da.date = ? ${assignWhere}`
  ).bind(prevDateStr, ...(range ?? [])).all<CarAssignmentForAlert>();

  const [timeMasterMap, priorityMap, limitMap] = await Promise.all([
    loadTimeMasterMap(c.env.DB),
    getTantoshaPriorityMap(c.env.DB),
    computeVehicleLimits(c.env.DB, date),
  ]);
  const alertMap = computeDailyAlerts(prevAssignRes.results ?? [], assignments, timeMasterMap);

  // 社員コード検索用に全乗務員をクライアントへ渡す（人数は数百人規模のため一括埋め込みで十分）
  const membersRes = await c.env.DB.prepare(
    `SELECT emp_code, name, division, team FROM crew_shift_members WHERE is_active = 1 ORDER BY division, team, sort_order`
  ).all<DispatchMember>();

  const typesRes = await c.env.DB.prepare(
    `SELECT code, label, color FROM crew_shift_types WHERE is_active = 1 ORDER BY sort_order`
  ).all<DispatchType>();

  const teamsRes = await c.env.DB.prepare('SELECT DISTINCT team FROM vehicle_teams ORDER BY team').all<{ team: number }>();
  const allTeams = (teamsRes.results ?? []).map(r => r.team);

  const editable = await canEdit(c);
  const html = dispatchBoardPage({
    date, ka, team, allTeams,
    vehicles, assignments,
    members: membersRes.results ?? [],
    types: typesRes.results ?? [],
    editable,
    alerts: Object.fromEntries(alertMap),
    priorities: Object.fromEntries(priorityMap),
    limits: Object.fromEntries(limitMap),
  });
  return c.html(layout('配車管理', crewPortalSubNav('dispatch-board') + html, 'staff'));
});

// ===== API: 参照リスト（公休者・明番者・車両未割当者） =====
app.get('/api/dispatch/roster', async (c) => {
  const date = c.req.query('date') ?? '';
  if (!isValidDate(date)) return c.json({ error: 'date が不正です' }, 400);
  const ka = c.req.query('ka') ?? '';
  const team = c.req.query('team') ?? '';
  const range = teamRangeFromQuery(ka, team);
  const teamWhere = range ? 'AND m.team BETWEEN ? AND ?' : '';
  const teamBind = range ?? [];

  const [todayRes, prevRes, assignedRes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT m.emp_code, m.name, m.team, cs.code
       FROM crew_shifts cs JOIN crew_shift_members m ON m.id = cs.member_id
       WHERE cs.date = ? AND m.is_active = 1 ${teamWhere}`
    ).bind(date, ...teamBind).all<{ emp_code: string; name: string; team: number; code: string }>(),
    c.env.DB.prepare(
      `SELECT m.emp_code, m.name, m.team
       FROM crew_shifts cs JOIN crew_shift_members m ON m.id = cs.member_id
       WHERE cs.date = date(?, '-1 day') AND cs.code IN ('Ｈ','Ｄ','Ｂ') AND m.is_active = 1 ${teamWhere}
         AND NOT EXISTS (SELECT 1 FROM crew_shifts cs2 WHERE cs2.member_id = cs.member_id AND cs2.date = ?)`
    ).bind(date, ...teamBind, date).all<{ emp_code: string; name: string; team: number }>(),
    c.env.DB.prepare(
      `SELECT DISTINCT m.emp_code
       FROM dispatch_assignments da JOIN crew_shift_members m ON m.id = da.member_id
       WHERE da.date = ?`
    ).bind(date).all<{ emp_code: string }>(),
  ]);

  const assignedCodes = new Set((assignedRes.results ?? []).map(r => r.emp_code));
  const kokyu: Array<{ emp_code: string; name: string; team: number }> = [];
  const unassigned: Array<{ emp_code: string; name: string; team: number; code: string }> = [];
  for (const r of (todayRes.results ?? [])) {
    if (r.code === '公' || r.code === '指') { kokyu.push({ emp_code: r.emp_code, name: r.name, team: r.team }); continue; }
    if ((r.code === 'Ｈ' || r.code === 'Ｄ' || r.code === 'Ｂ' || r.code === 'ａ' || r.code === 'ｂ') && !assignedCodes.has(r.emp_code)) {
      unassigned.push({ emp_code: r.emp_code, name: r.name, team: r.team, code: r.code });
    }
  }

  return c.json({
    date,
    kokyu,
    meiban: prevRes.results ?? [],
    unassigned,
  });
});

// ===== API: 配車の一括保存（車両単位で洗い替え） =====
app.post('/api/dispatch/assignments/batch', async (c) => {
  if (!await canEdit(c)) return c.json({ error: '権限がありません' }, 403);

  const body = await c.req.json<{
    date?: string;
    cars?: Array<{ car_no: string; team: number; slots: Array<{ shift_code: string; emp_code: string | null; note: string }> }>;
  }>();
  const date = body.date ?? '';
  if (!isValidDate(date)) return c.json({ error: 'date が不正です' }, 400);
  const cars = body.cars ?? [];
  if (cars.length === 0) return c.json({ ok: true, saved: 0 });
  if (cars.length > 300) return c.json({ error: '一度に保存できるのは300台までです' }, 400);

  const { id: adminId, name } = await adminName(c);

  // emp_code -> member_id の解決テーブルを一括取得
  const empCodes = [...new Set(cars.flatMap(car => car.slots.map(s => s.emp_code).filter((v): v is string => !!v)))];
  const memberMap = new Map<string, number>();
  if (empCodes.length > 0) {
    const placeholders = empCodes.map(() => '?').join(',');
    const res = await c.env.DB.prepare(`SELECT id, emp_code FROM crew_shift_members WHERE emp_code IN (${placeholders})`)
      .bind(...empCodes).all<{ id: number; emp_code: string }>();
    for (const r of (res.results ?? [])) memberMap.set(r.emp_code, r.id);
  }

  const stmts: ReturnType<typeof c.env.DB.prepare>[] = [];
  let saved = 0;
  const notFound: string[] = [];
  for (const car of cars) {
    if (!/^[0-9A-Za-z-]{1,10}$/.test(car.car_no)) continue;
    stmts.push(c.env.DB.prepare('DELETE FROM dispatch_assignments WHERE date = ? AND car_no = ?').bind(date, car.car_no));
    for (const slot of car.slots) {
      const code = (slot.shift_code ?? '').trim();
      if (!code) continue;
      const empCode = (slot.emp_code ?? '').trim();
      let memberId: number | null = null;
      if (empCode) {
        const found = memberMap.get(empCode);
        if (found === undefined) { notFound.push(empCode); continue; }
        memberId = found;
      }
      stmts.push(c.env.DB.prepare(
        `INSERT INTO dispatch_assignments (date, car_no, team, shift_code, member_id, note, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'), ?)`
      ).bind(date, car.car_no, car.team, code, memberId, (slot.note ?? '').slice(0, 200), name));
      saved++;
    }
    stmts.push(c.env.DB.prepare(
      'INSERT INTO dispatch_edit_logs (admin_id, admin_name, action, target, date, new_value) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(adminId, name, 'assignment', car.car_no, date, `${car.slots.length}枠 保存`));
  }
  if (stmts.length > 0) await c.env.DB.batch(stmts);
  return c.json({ ok: true, saved, notFound: [...new Set(notFound)] });
});

// ===== API: 点検由来の車両使用制限（延長・終日不可・解除） =====
app.post('/api/dispatch/vehicle-limits', async (c) => {
  if (!await canEdit(c)) return c.json({ error: '権限がありません' }, 403);
  const body = await c.req.json<{ car_no?: string; date?: string; action?: 'extend' | 'block' | 'clear'; usable_from?: string; note?: string }>();
  const carNo = (body.car_no ?? '').trim();
  const date = body.date ?? '';
  if (!carNo || !isValidDate(date)) return c.json({ error: 'car_no / date が不正です' }, 400);
  const { name } = await adminName(c);
  const note = (body.note ?? '').slice(0, 200);

  if (body.action === 'clear') {
    await c.env.DB.prepare(
      `INSERT INTO dispatch_vehicle_daily_limits (car_no, date, usable_from, is_blocked, source, note, updated_at, updated_by)
       VALUES (?, ?, NULL, 0, 'manual_clear', ?, datetime('now','localtime'), ?)
       ON CONFLICT(car_no, date) DO UPDATE SET usable_from = NULL, is_blocked = 0, source = 'manual_clear', note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).bind(carNo, date, note, name).run();
  } else if (body.action === 'block') {
    await c.env.DB.prepare(
      `INSERT INTO dispatch_vehicle_daily_limits (car_no, date, usable_from, is_blocked, source, note, updated_at, updated_by)
       VALUES (?, ?, NULL, 1, 'manual_block', ?, datetime('now','localtime'), ?)
       ON CONFLICT(car_no, date) DO UPDATE SET usable_from = NULL, is_blocked = 1, source = 'manual_block', note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).bind(carNo, date, note, name).run();
  } else if (body.action === 'extend') {
    if (!/^\d{2}:\d{2}$/.test(body.usable_from ?? '')) return c.json({ error: 'usable_from が不正です' }, 400);
    await c.env.DB.prepare(
      `INSERT INTO dispatch_vehicle_daily_limits (car_no, date, usable_from, is_blocked, source, note, updated_at, updated_by)
       VALUES (?, ?, ?, 0, 'manual_extend', ?, datetime('now','localtime'), ?)
       ON CONFLICT(car_no, date) DO UPDATE SET usable_from = excluded.usable_from, is_blocked = 0, source = 'manual_extend', note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).bind(carNo, date, body.usable_from, note, name).run();
  } else {
    return c.json({ error: 'action が不正です' }, 400);
  }

  const { id: adminId } = await adminName(c);
  await c.env.DB.prepare(
    'INSERT INTO dispatch_edit_logs (admin_id, admin_name, action, target, date, new_value) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'limit', carNo, date, body.action).run();
  return c.json({ ok: true });
});

// ===== API: 勤務時間マスタ（出庫/定時帰庫/残業MAX） =====
app.get('/api/dispatch/time-master', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, shift_code, variant_label, departure_time, standard_return_time, return_days_offset,
            max_overtime_return_time, overtime_days_offset, is_default, sort_order, is_active
     FROM dispatch_shift_time_master ORDER BY sort_order, id`
  ).all();
  return c.json({ rows: rows.results ?? [] });
});

app.post('/api/dispatch/time-master/save', async (c) => {
  if (!await canEdit(c)) return c.json({ error: '権限がありません' }, 403);
  const body = await c.req.json<{
    rows?: Array<{
      id?: number; shift_code: string; variant_label: string;
      departure_time: string; standard_return_time: string; return_days_offset: number;
      max_overtime_return_time: string; overtime_days_offset: number; is_default: number;
    }>;
  }>();
  const rows = body.rows ?? [];
  const timePattern = /^\d{2}:\d{2}$/;
  for (const r of rows) {
    if (!r.shift_code || !timePattern.test(r.departure_time) || !timePattern.test(r.standard_return_time) || !timePattern.test(r.max_overtime_return_time)) {
      return c.json({ error: '入力内容が不正です' }, 400);
    }
  }

  const { id: adminId, name } = await adminName(c);
  const stmts: ReturnType<typeof c.env.DB.prepare>[] = [];
  for (const r of rows) {
    if (r.id) {
      stmts.push(c.env.DB.prepare(
        `UPDATE dispatch_shift_time_master SET variant_label = ?, departure_time = ?, standard_return_time = ?, return_days_offset = ?,
           max_overtime_return_time = ?, overtime_days_offset = ?, is_default = ?, updated_at = datetime('now','localtime') WHERE id = ?`
      ).bind(r.variant_label ?? '', r.departure_time, r.standard_return_time, r.return_days_offset ?? 0,
        r.max_overtime_return_time, r.overtime_days_offset ?? 0, r.is_default ? 1 : 0, r.id));
    } else {
      stmts.push(c.env.DB.prepare(
        `INSERT INTO dispatch_shift_time_master (shift_code, variant_label, departure_time, standard_return_time, return_days_offset, max_overtime_return_time, overtime_days_offset, is_default)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(r.shift_code, r.variant_label ?? '', r.departure_time, r.standard_return_time, r.return_days_offset ?? 0,
        r.max_overtime_return_time, r.overtime_days_offset ?? 0, r.is_default ? 1 : 0));
    }
  }
  if (stmts.length > 0) await c.env.DB.batch(stmts);
  await c.env.DB.prepare(
    'INSERT INTO dispatch_edit_logs (admin_id, admin_name, action, target, new_value) VALUES (?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'time_master', '勤務時間マスタ', `${rows.length}件 保存`).run();
  return c.json({ ok: true });
});

// ===== PDF解析用バンドル配信 =====
// PDF解析（座標マッチング等の重い処理）はサーバーではなくブラウザ側で実行する。
// 配車PDF・乗務員シフトPDF・退職者名簿PDFの3機能で共通バンドルを配信する（unpdfの重複を避けるため）。
// src/utils/dispatch_pdf.ts を編集したら `npm run build:pdf-parsers-bundle` で再生成すること。
app.get('/api/dispatch/pdf-parser.js', async (c) => {
  // 2.1MBのbase64定数。コールドスタートのCPU予算を圧迫するため、この配信時のみ動的import。
  const { PDF_PARSERS_CLIENT_JS_BASE64 } = await import('../assets/pdf_parsers_client_bundle');
  const bytes = Uint8Array.from(atob(PDF_PARSERS_CLIENT_JS_BASE64), (ch) => ch.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
});

// ===== API: PDF取込（ブラウザ側で解析済みのデータをチャンク分割で受け取る） =====
// 月×全課分では数百ページに及ぶため、対象(date,team)の既存データ削除→配車チャンク登録→
// 備考登録→完了ログ記録の4段階に分割する（crew_shift.tsのimportパターンを踏襲）。

app.post('/api/dispatch/import/clear', async (c) => {
  if (!await canEdit(c)) return c.json({ error: '権限がありません' }, 403);
  const body = await c.req.json<{ targets?: Array<{ date: string; team: number }> }>();
  const targets = body.targets ?? [];
  if (targets.length === 0) return c.json({ ok: true });
  if (targets.length > 2000) return c.json({ error: '一度に指定できるのは2000件までです' }, 400);

  const stmts = targets.map(t => c.env.DB.prepare('DELETE FROM dispatch_assignments WHERE date = ? AND team = ?').bind(t.date, t.team));
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

app.post('/api/dispatch/import/assignments', async (c) => {
  if (!await canEdit(c)) return c.json({ error: '権限がありません' }, 403);
  const body = await c.req.json<{
    assignments?: Array<{ date: string; car_no: string; team: number; shift_code: string; emp_code: string | null; note: string }>;
  }>();
  const assignments = body.assignments ?? [];
  if (assignments.length === 0) return c.json({ ok: true, saved: 0, notFound: [] });
  if (assignments.length > 3000) return c.json({ error: '一度に取り込めるのは3000件までです' }, 400);

  // emp_code -> member_id を事前にまとめて解決する（未登録の社員コードを取込結果として可視化するため）
  const empCodes = [...new Set(assignments.map(a => a.emp_code).filter((v): v is string => !!v))];
  const memberMap = new Map<string, number>();
  if (empCodes.length > 0) {
    const placeholders = empCodes.map(() => '?').join(',');
    const res = await c.env.DB.prepare(`SELECT id, emp_code FROM crew_shift_members WHERE emp_code IN (${placeholders})`)
      .bind(...empCodes).all<{ id: number; emp_code: string }>();
    for (const r of (res.results ?? [])) memberMap.set(r.emp_code, r.id);
  }
  const notFound = new Set<string>();

  const stmts = assignments.map(a => {
    let memberId: number | null = null;
    if (a.emp_code) {
      const found = memberMap.get(a.emp_code);
      if (found === undefined) notFound.add(a.emp_code);
      else memberId = found;
    }
    return c.env.DB.prepare(
      `INSERT INTO dispatch_assignments (date, car_no, team, shift_code, member_id, note, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'), 'pdf-import')
       ON CONFLICT(date, car_no, shift_code) DO UPDATE SET team = excluded.team, member_id = excluded.member_id, note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).bind(a.date, a.car_no, a.team, a.shift_code, memberId, a.note ?? '');
  });
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, saved: assignments.length, notFound: [...notFound] });
});

app.post('/api/dispatch/import/remarks', async (c) => {
  if (!await canEdit(c)) return c.json({ error: '権限がありません' }, 403);
  const body = await c.req.json<{ remarks?: Array<{ date: string; team: number; content: string }> }>();
  const { name } = await adminName(c);
  const remarks = (body.remarks ?? []).filter(r => r.content && r.content.trim());
  if (remarks.length === 0) return c.json({ ok: true });
  const stmts = remarks.map(r => c.env.DB.prepare(
    `INSERT INTO dispatch_remarks (date, team, content, updated_at, updated_by) VALUES (?, ?, ?, datetime('now','localtime'), ?)
     ON CONFLICT(date, team) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  ).bind(r.date, r.team, r.content.trim(), name));
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

app.post('/api/dispatch/import/finish', async (c) => {
  if (!await canEdit(c)) return c.json({ error: '権限がありません' }, 403);
  const body = await c.req.json<{
    file_name?: string; start_date?: string; end_date?: string;
    teams?: number[]; page_count?: number; assignment_count?: number; skipped_count?: number;
  }>();
  if (!isValidDate(body.start_date ?? '') || !isValidDate(body.end_date ?? '')) return c.json({ error: 'パラメータ不足' }, 400);

  const { id: adminId, name } = await adminName(c);
  await c.env.DB.prepare(
    `INSERT INTO dispatch_imports (start_date, end_date, teams, file_name, page_count, assignment_count, skipped_count, imported_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(body.start_date, body.end_date, (body.teams ?? []).join(','), body.file_name ?? '',
    body.page_count ?? 0, body.assignment_count ?? 0, body.skipped_count ?? 0, name).run();
  await c.env.DB.prepare(
    'INSERT INTO dispatch_edit_logs (admin_id, admin_name, action, target, date, new_value) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(adminId, name, 'import', `${body.file_name ?? 'PDF'}`, body.start_date,
    `${body.page_count ?? 0}頁 / ${body.assignment_count ?? 0}件 取込（〜${body.end_date}、未照合${body.skipped_count ?? 0}件）`).run();
  return c.json({ ok: true });
});

// ===== ページ: 車両ローテーション表 =====
app.get('/vehicle-rotation', async (c) => {
  const start = isValidDate(c.req.query('start')) ? c.req.query('start')! : todayJST();
  const days = 7;
  const ka = c.req.query('ka') ?? '';
  const team = c.req.query('team') ?? '';
  const range = teamRangeFromQuery(ka, team);

  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00Z');
  for (let i = 0; i < days; i++) { dates.push(cur.toISOString().slice(0, 10)); cur.setUTCDate(cur.getUTCDate() + 1); }
  const prevDate = new Date(start + 'T00:00:00Z');
  prevDate.setUTCDate(prevDate.getUTCDate() - 1);
  const prevDateStr = prevDate.toISOString().slice(0, 10);
  const endDate = dates[dates.length - 1];

  const where = range ? 'WHERE vt.team BETWEEN ? AND ?' : '';
  const vehiclesRes = await c.env.DB.prepare(
    `SELECT vt.car_no, vt.team FROM vehicle_teams vt ${where} ORDER BY CAST(vt.car_no AS INTEGER)`
  ).bind(...(range ?? [])).all<RotationVehicleRow>();
  const vehicles = vehiclesRes.results ?? [];

  const assignWhere = range ? 'AND da.team BETWEEN ? AND ?' : '';
  const assignRes = await c.env.DB.prepare(
    `SELECT da.car_no, da.date, da.shift_code, m.emp_code, m.name as member_name
     FROM dispatch_assignments da LEFT JOIN crew_shift_members m ON m.id = da.member_id
     WHERE da.date BETWEEN ? AND ? ${assignWhere}
     ORDER BY da.car_no, da.date`
  ).bind(prevDateStr, endDate, ...(range ?? [])).all<{ car_no: string; date: string; shift_code: string; emp_code: string | null; member_name: string | null }>();
  const allAssignments = assignRes.results ?? [];

  const timeMasterMap = await loadTimeMasterMap(c.env.DB);

  const cellsByCarDate: Record<string, Record<string, RotationCell[]>> = {};
  const assignmentsByDate = new Map<string, CarAssignmentForAlert[]>();
  for (const a of allAssignments) {
    if (!assignmentsByDate.has(a.date)) assignmentsByDate.set(a.date, []);
    assignmentsByDate.get(a.date)!.push({ car_no: a.car_no, shift_code: a.shift_code });
    if (a.date === prevDateStr) continue; // 前日分は境界アラート計算のみに使い、セル表示はしない
    if (!cellsByCarDate[a.car_no]) cellsByCarDate[a.car_no] = {};
    if (!cellsByCarDate[a.car_no][a.date]) cellsByCarDate[a.car_no][a.date] = [];
    cellsByCarDate[a.car_no][a.date].push({ shift_code: a.shift_code, emp_code: a.emp_code, member_name: a.member_name });
  }
  const departureMinutes = (code: string): number => {
    const m = timeMasterMap.get(code);
    if (!m) return 0;
    const [h, mi] = m.departure_time.split(':').map(Number);
    return h * 60 + mi;
  };
  for (const carNo in cellsByCarDate) {
    for (const d in cellsByCarDate[carNo]) {
      cellsByCarDate[carNo][d].sort((x, y) => departureMinutes(x.shift_code) - departureMinutes(y.shift_code));
    }
  }

  const boundaryAlerts: Record<string, Record<string, RotationAlertLevel>> = {};
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const prevD = i === 0 ? prevDateStr : dates[i - 1];
    const dayAlerts = computeDailyAlerts(assignmentsByDate.get(prevD) ?? [], assignmentsByDate.get(d) ?? [], timeMasterMap);
    for (const [carNo, info] of dayAlerts) {
      if (!boundaryAlerts[carNo]) boundaryAlerts[carNo] = {};
      boundaryAlerts[carNo][d] = info.boundary;
    }
  }

  const limits: Record<string, Record<string, RotationLimitInfo>> = {};
  for (const d of dates) {
    const limitMap = await computeVehicleLimits(c.env.DB, d);
    for (const [carNo, info] of limitMap) {
      if (!limits[carNo]) limits[carNo] = {};
      limits[carNo][d] = info;
    }
  }

  const teamsRes = await c.env.DB.prepare('SELECT DISTINCT team FROM vehicle_teams ORDER BY team').all<{ team: number }>();
  const allTeams = (teamsRes.results ?? []).map(r => r.team);

  const html = vehicleRotationPage({ start, days, ka, team, allTeams, vehicles, dates, cellsByCarDate, boundaryAlerts, limits });
  return c.html(layout('車両ローテーション', crewPortalSubNav('vehicle-rotation') + html, 'staff'));
});

export default app;
