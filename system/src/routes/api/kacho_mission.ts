// 課長ミッション用API
//  - 課長マスタ（kacho_masters）の一覧・追加・無効化
//  - 乗務員の所属労組・始業終業時間（crew_labor_supply_info）の取得・保存
//  - 労供上申書 / 労供契約書作成依頼書 のフォーム自動入力データ
// フォームxlsxのパッチ（書式非破壊）はブラウザ側で行う。ここはデータを返すだけ。
import { Hono } from 'hono';
import type { Env } from '../../auth';
import { contractDateForBirthday, LABOR_UNION_MIN_AGE, LABOR_UNION_MAX_AGE } from '../../utils/contract_alerts';
import { todayIsoJST } from '../../utils/accident_period';
import { parseSS2026Import, SS2026_DAYS_IN_MONTH } from '../../data/summer_safety_2026';
import { defaultDoc } from '../../html/autumn_safety_tefuda';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number) { return String(n).padStart(2, '0'); }
function jpDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  return `${+m[1]}年　${+m[2]}月　${+m[3]}日`;
}
function addYearsMinus1Day(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y + years, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
// 出力日 iso の「前月度」を末とする直近6完了月度の日付範囲 [start(=18日), end(=17日)]。
// 月度 = 17日締め・18日スタート（auth.ts getPeriod と同じ）。
function prevGetsudo6mRange(iso: string): { start: string; end: string } {
  const [y, m, d] = iso.split('-').map(Number);
  // 出力日が属する月度（day>=18 なら翌月ラベル）
  let py = y, pm = m;
  if (d >= 18) { pm += 1; if (pm > 12) { pm = 1; py += 1; } }
  // 前月度
  pm -= 1; if (pm < 1) { pm = 12; py -= 1; }
  // 前月度(py,pm) は (pm-1)月18日 〜 pm月17日 をカバー → end
  const end = `${py}-${pad2(pm)}-17`;
  // 6完了月度前の月度 = (py, pm-5) の開始 = その前月の18日
  let sy = py, sm = pm - 5;
  while (sm < 1) { sm += 12; sy -= 1; }
  let sty = sy, stm = sm - 1;
  if (stm < 1) { stm = 12; sty -= 1; }
  const start = `${sty}-${pad2(stm)}-18`;
  return { start, end };
}

function fullYearsBetween(fromIso: string, toIso: string): number {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(fromIso);
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(toIso);
  if (!a || !b) return 0;
  let y = +b[1] - +a[1];
  if (+b[2] < +a[2] || (+b[2] === +a[2] && +b[3] < +a[3])) y -= 1;
  return Math.max(0, y);
}

/** birth_date から「今日以降で最も近い労供契約日」と満了日・その時点の満年齢を返す */
function nextContractPeriod(birthIso: string, todayIso: string) {
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(birthIso);
  if (!b) return null;
  const by = +b[1], bm = +b[2], bd = +b[3];
  let start: string | null = null;
  for (let age = LABOR_UNION_MIN_AGE - 1; age <= LABOR_UNION_MAX_AGE; age++) {
    const cd = contractDateForBirthday(by + age, bm, bd);
    if (cd >= todayIso) { start = cd; break; }
  }
  if (!start) start = contractDateForBirthday(by + LABOR_UNION_MAX_AGE, bm, bd);
  const end = addYearsMinus1Day(start, 1);
  // 契約開始時点の満年齢
  const s = start.split('-').map(Number);
  let age = s[0] - by;
  if (s[1] < bm || (s[1] === bm && s[2] < bd)) age -= 1;
  return { start, end, age };
}

// ============ 乗務員検索（帳票の氏名→課/班/コード 自動入力用） ============
// 社員が多いので全件返さず q（氏名・フリガナ・社員番号の部分一致）で絞る。
app.get('/employees', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 40);
  if (!q) return c.json({ employees: [] });
  const like = `%${q}%`;
  const rows = await c.env.DB.prepare(
    `SELECT id, emp_no, name, name_kana, division, team
       FROM employees
      WHERE is_active = 1 AND (name LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)
      ORDER BY division, team, name
      LIMIT 30`
  ).bind(like, like, like).all<{ id: number; emp_no: string; name: string; name_kana: string | null; division: number | null; team: number | null }>();
  return c.json({ employees: rows.results ?? [] });
});

// ============ 課長マスタ ============
app.get('/kacho-masters', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, name, division, role, sort_order FROM kacho_masters WHERE is_active = 1 ORDER BY sort_order, id'
  ).all();
  return c.json({ kacho: rows.results ?? [] });
});

app.post('/kacho-masters', async (c) => {
  const d = await c.req.json<{ name?: string; division?: number | null; role?: string | null }>().catch(
    () => ({} as { name?: string; division?: number | null; role?: string | null })
  );
  const name = typeof d.name === 'string' ? d.name.trim() : '';
  if (!name) return c.json({ error: '氏名を入力してください' }, 400);
  const division = Number.isInteger(d.division) && (d.division as number) >= 1 && (d.division as number) <= 4 ? d.division : null;
  const role = typeof d.role === 'string' && d.role.trim() ? d.role.trim() : null;
  const r = await c.env.DB.prepare(
    'INSERT INTO kacho_masters (name, division, role, sort_order) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order),0)+10 FROM kacho_masters))'
  ).bind(name, division, role).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

app.put('/kacho-masters/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'bad id' }, 400);
  const d = await c.req.json<{ name?: string; division?: number | null; role?: string | null }>().catch(
    () => ({} as { name?: string; division?: number | null; role?: string | null })
  );
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  if (typeof d.name === 'string') { sets.push('name = ?'); vals.push(d.name.trim()); }
  if (d.division !== undefined) {
    const dv = Number.isInteger(d.division) && (d.division as number) >= 1 && (d.division as number) <= 4 ? d.division as number : null;
    sets.push('division = ?'); vals.push(dv);
  }
  if (d.role !== undefined) { sets.push('role = ?'); vals.push(typeof d.role === 'string' && d.role.trim() ? d.role.trim() : null); }
  if (sets.length === 0) return c.json({ ok: true });
  vals.push(id);
  await c.env.DB.prepare(`UPDATE kacho_masters SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ ok: true });
});

app.delete('/kacho-masters/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'bad id' }, 400);
  await c.env.DB.prepare('UPDATE kacho_masters SET is_active = 0 WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// 所長（1名）と 各課の課長 をまとめて設定。role/division をキーに upsert。
app.post('/kacho-masters/bulk', async (c) => {
  const d = await c.req.json<{ shocho?: string | null; kacho?: Array<{ division?: number; name?: string }> }>().catch(
    () => ({} as { shocho?: string | null; kacho?: Array<{ division?: number; name?: string }> })
  );
  type D1Stmt = ReturnType<typeof c.env.DB.prepare>;
  const stmts: D1Stmt[] = [];

  const upsertRole = (role: string, division: number | null, name: string) => {
    // 既存(active)があれば name 更新、無ければ insert
    stmts.push(c.env.DB.prepare(
      `UPDATE kacho_masters SET name = ?, is_active = 1
         WHERE id = (SELECT id FROM kacho_masters WHERE role = ? AND ((? IS NULL AND division IS NULL) OR division = ?) ORDER BY is_active DESC, id LIMIT 1)`
    ).bind(name, role, division, division));
    stmts.push(c.env.DB.prepare(
      `INSERT INTO kacho_masters (name, division, role, sort_order)
       SELECT ?, ?, ?, (SELECT COALESCE(MAX(sort_order),0)+10 FROM kacho_masters)
       WHERE NOT EXISTS (SELECT 1 FROM kacho_masters WHERE role = ? AND ((? IS NULL AND division IS NULL) OR division = ?))`
    ).bind(name, division, role, role, division, division));
  };

  if (typeof d.shocho === 'string' && d.shocho.trim()) {
    upsertRole('所長', null, d.shocho.trim());
  }
  for (const k of (d.kacho ?? [])) {
    const dv = Number.isInteger(k.division) && (k.division as number) >= 1 && (k.division as number) <= 4 ? k.division as number : null;
    const nm = typeof k.name === 'string' ? k.name.trim() : '';
    if (dv && nm) upsertRole('課長', dv, nm);
  }
  if (stmts.length === 0) return c.json({ ok: true });
  await c.env.DB.batch(stmts);
  return c.json({ ok: true });
});

// ============ 所属労組・始業終業時間 ============
app.get('/labor-supply-info', async (c) => {
  const idsRaw = (c.req.query('emp_ids') ?? '').split(',').map(s => parseInt(s)).filter(Number.isInteger);
  if (idsRaw.length === 0) return c.json({ info: {} });
  const ph = idsRaw.map(() => '?').join(',');
  const rows = await c.env.DB.prepare(
    `SELECT emp_id, union_name, start_hh, start_mm, end_hh, end_mm FROM crew_labor_supply_info WHERE emp_id IN (${ph})`
  ).bind(...idsRaw).all<{ emp_id: number; union_name: string | null; start_hh: number | null; start_mm: number | null; end_hh: number | null; end_mm: number | null }>();
  const info: Record<number, unknown> = {};
  for (const r of (rows.results ?? [])) info[r.emp_id] = r;
  return c.json({ info });
});

type LaborInfoBody = { emp_id?: number; union_name?: string | null; start_hh?: number | null; start_mm?: number | null; end_hh?: number | null; end_mm?: number | null };
app.post('/labor-supply-info', async (c) => {
  const d = await c.req.json<LaborInfoBody>().catch(() => ({} as LaborInfoBody));
  const empId = Number(d.emp_id);
  if (!Number.isInteger(empId) || empId <= 0) return c.json({ error: 'emp_id不正' }, 400);
  const num = (v: unknown) => (Number.isInteger(v) ? (v as number) : null);
  const uni = typeof d.union_name === 'string' && d.union_name.trim() ? d.union_name.trim() : null;
  await c.env.DB.prepare(
    `INSERT INTO crew_labor_supply_info (emp_id, union_name, start_hh, start_mm, end_hh, end_mm, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(emp_id) DO UPDATE SET
       union_name = excluded.union_name, start_hh = excluded.start_hh, start_mm = excluded.start_mm,
       end_hh = excluded.end_hh, end_mm = excluded.end_mm, updated_at = datetime('now','localtime')`
  ).bind(empId, uni, num(d.start_hh), num(d.start_mm), num(d.end_hh), num(d.end_mm)).run();
  return c.json({ ok: true });
});

// ============ 上申書 自動入力データ ============
app.get('/joshinsho-data', async (c) => {
  const ids = (c.req.query('emp_ids') ?? '').split(',').map(s => parseInt(s)).filter(Number.isInteger);
  if (ids.length === 0) return c.json({ error: 'emp_ids がありません' }, 400);
  const submitDate = ISO.test(c.req.query('submit_date') ?? '') ? c.req.query('submit_date')! : todayIsoJST();
  const today = todayIsoJST();
  const oneYearAgo = addYearsMinus1Day(today, -1); // 約1年前

  // 売上・乗務数は「出力日の前月度」を末とする直近6完了月度で集計する。
  // （月の途中で出力すると当月度が不完全で乗務数が過少になるため）
  const salesRange = prevGetsudo6mRange(submitDate);

  const ph = ids.map(() => '?').join(',');
  const emps = await c.env.DB.prepare(
    `SELECT id, emp_no, name, division, team, birth_date, hire_date, work_hours_type, contract_type
       FROM employees WHERE id IN (${ph})`
  ).bind(...ids).all<{ id: number; emp_no: string; name: string; division: number | null; team: number | null; birth_date: string | null; hire_date: string | null; work_hours_type: string | null; contract_type: string | null }>();

  // 前回の課長コメント
  const cmtRows = await c.env.DB.prepare(
    `SELECT emp_id, comment FROM joshinsho_comments WHERE emp_id IN (${ph})`
  ).bind(...ids).all<{ emp_id: number; comment: string | null }>().catch(() => ({ results: [] as { emp_id: number; comment: string | null }[] }));
  const cmtMap = new Map<number, string>();
  for (const r of (cmtRows.results ?? [])) if (r.comment) cmtMap.set(r.emp_id, r.comment);

  const out: unknown[] = [];
  for (const e of (emps.results ?? [])) {
    let accCnt = 0, vioCnt = 0, avgSales = 0, avgRides = 0;
    if (e.emp_no) {
      const a = await c.env.DB.prepare(
        `SELECT COUNT(*) n FROM accident_records WHERE emp_no = ? AND occurred_date >= ?`
      ).bind(e.emp_no, oneYearAgo).first<{ n: number }>();
      accCnt = a?.n ?? 0;
      const v = await c.env.DB.prepare(
        `SELECT COUNT(*) n FROM violation_reports WHERE employee_emp_no = ? AND substr(violation_at,1,10) >= ?`
      ).bind(e.emp_no, oneYearAgo).first<{ n: number }>().catch(() => ({ n: 0 }));
      vioCnt = v?.n ?? 0;
    }
    const s = await c.env.DB.prepare(
      `SELECT AVG(amount) avg_amt, COUNT(*) cnt FROM sales_records WHERE emp_id = ? AND date >= ? AND date <= ?`
    ).bind(e.id, salesRange.start, salesRange.end).first<{ avg_amt: number | null; cnt: number }>();
    avgSales = Math.round(s?.avg_amt ?? 0);
    avgRides = s?.cnt ? Math.round((s.cnt / 6) * 100) / 100 : 0;

    const period = e.birth_date ? nextContractPeriod(e.birth_date, today) : null;
    const workStyle = (e.work_hours_type ?? '').includes('短') ? '短時間' : 'フルタイム';

    out.push({
      last_comment: cmtMap.get(e.id) ?? '',
      id: e.id,
      emp_no: e.emp_no,
      name: e.name,
      division: e.division ?? null,
      code_no: /^\d+$/.test(e.emp_no) ? Number(e.emp_no) : e.emp_no,
      work_style: workStyle,
      birth_jp: e.birth_date ? jpDate(e.birth_date) : '',
      age: period ? period.age : null,
      hire_jp: e.hire_date ? jpDate(e.hire_date) : '',
      tenure_years: e.hire_date && period ? fullYearsBetween(e.hire_date, period.start) : null,
      contract_start_jp: period ? jpDate(period.start) : '',
      contract_end_jp: period ? jpDate(period.end) : '',
      submit_serial: dateToSerial(submitDate),
      accident_text: accCnt > 0 ? `${accCnt}件` : '無し',
      complaint_text: vioCnt > 0 ? `${vioCnt}件` : '無し',
      avg_sales: avgSales,
      avg_rides: avgRides,
    });
  }
  return c.json({ people: out, sales_period: salesRange });
});

// 課長コメントの保存（次回の上申書で流用）
app.post('/joshinsho-comments', async (c) => {
  const body = await c.req.json<{ comments?: Array<{ emp_id?: number; comment?: string | null }> }>().catch(
    () => ({} as { comments?: Array<{ emp_id?: number; comment?: string | null }> })
  );
  const list = (body.comments ?? []).filter(x => Number.isInteger(x.emp_id) && (x.emp_id as number) > 0);
  if (list.length === 0) return c.json({ ok: true, saved: 0 });
  type D1Stmt = ReturnType<typeof c.env.DB.prepare>;
  const stmts: D1Stmt[] = list.map(x => c.env.DB.prepare(
    `INSERT INTO joshinsho_comments (emp_id, comment, updated_at)
     VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(emp_id) DO UPDATE SET comment = excluded.comment, updated_at = datetime('now','localtime')`
  ).bind(x.emp_id as number, typeof x.comment === 'string' && x.comment.trim() ? x.comment.trim() : null));
  for (let i = 0; i < stmts.length; i += 50) {
    await c.env.DB.batch(stmts.slice(i, i + 50));
  }
  return c.json({ ok: true, saved: list.length });
});

// Excelのシリアル値（1900日付システム, 1899-12-30 起点）
function dateToSerial(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const utc = Date.UTC(y, m - 1, d);
  return Math.round((utc - Date.UTC(1899, 11, 30)) / 86400000);
}

// ============ 契約書作成依頼書 自動入力データ（指定月度に契約更新する乗務員一覧） ============
app.get('/keiyakusho-data', async (c) => {
  const year = parseInt(c.req.query('year') ?? '');
  const month = parseInt(c.req.query('month') ?? '');
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return c.json({ error: 'year / month が不正です' }, 400);
  }
  const kaRaw = c.req.query('ka') ?? 'all';
  const target = `${year}-${pad2(month)}-18`; // その月度の契約日（18日）

  const conds = ['is_active = 1', "birth_date IS NOT NULL", "birth_date != ''"];
  const params: (string | number)[] = [];
  if (/^[1-4]$/.test(kaRaw)) { conds.push('division = ?'); params.push(parseInt(kaRaw)); }
  const emps = await c.env.DB.prepare(
    `SELECT id, emp_no, name, division, team, birth_date, work_hours_type
       FROM employees WHERE ${conds.join(' AND ')}`
  ).bind(...params).all<{ id: number; emp_no: string; name: string; division: number | null; team: number | null; birth_date: string; work_hours_type: string | null }>();

  const hits: Array<{ id: number }> = [];
  const rows: unknown[] = [];
  for (const e of (emps.results ?? [])) {
    const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.birth_date);
    if (!b) continue;
    const by = +b[1], bm = +b[2], bd = +b[3];
    let match = false;
    for (let age = LABOR_UNION_MIN_AGE; age <= LABOR_UNION_MAX_AGE; age++) {
      if (contractDateForBirthday(by + age, bm, bd) === target) { match = true; break; }
    }
    if (!match) continue;
    hits.push({ id: e.id });
    const style = (e.work_hours_type ?? '').includes('短') ? '短' : 'フル';
    rows.push({
      id: e.id, emp_no: e.emp_no, name: e.name,
      division: e.division ?? null, team: e.team ?? null,
      code_no: /^\d+$/.test(e.emp_no) ? Number(e.emp_no) : e.emp_no,
      contract_now: style, contract_next: style,
    });
  }

  // 所属労組・始業終業時間をまとめて付与
  const info: Record<number, { union_name: string | null; start_hh: number | null; start_mm: number | null; end_hh: number | null; end_mm: number | null }> = {};
  if (hits.length) {
    const ph = hits.map(() => '?').join(',');
    const lr = await c.env.DB.prepare(
      `SELECT emp_id, union_name, start_hh, start_mm, end_hh, end_mm FROM crew_labor_supply_info WHERE emp_id IN (${ph})`
    ).bind(...hits.map(h => h.id)).all<{ emp_id: number; union_name: string | null; start_hh: number | null; start_mm: number | null; end_hh: number | null; end_mm: number | null }>();
    for (const r of (lr.results ?? [])) info[r.emp_id] = r;
  }
  for (const r of rows as Array<{ id: number; union_name?: unknown; start_hh?: unknown }>) {
    const i = info[r.id];
    r.union_name = i?.union_name ?? '';
    (r as Record<string, unknown>).start_hh = i?.start_hh ?? '';
    (r as Record<string, unknown>).start_mm = i?.start_mm ?? '';
    (r as Record<string, unknown>).end_hh = i?.end_hh ?? '';
    (r as Record<string, unknown>).end_mm = i?.end_mm ?? '';
  }

  rows.sort((a, z) => {
    const A = a as { division: number | null; team: number | null };
    const Z = z as { division: number | null; team: number | null };
    return (A.division ?? 9) - (Z.division ?? 9) || (A.team ?? 99) - (Z.team ?? 99);
  });
  return c.json({ year, month, contract_date: target, rows });
});

// ============ 夏季の交通事故をゼロにする運動（2026）手札の集計 ============
// テーブル: summer_safety_2026_people / _entries / _meta（migration_134）
const divFromTeam = (t: number | null) => (t == null ? null : Math.ceil(t / 2));

// AIレポート欄（総括）の保存
app.post('/summer-safety-2026/report', async (c) => {
  const body = await c.req.json<{ text?: string }>().catch(() => ({} as { text?: string }));
  const text = (body.text ?? '').slice(0, 8000);
  await c.env.DB.prepare(
    `INSERT INTO summer_safety_2026_meta (key, value, updated_at) VALUES ('ai_report', ?, datetime('now','localtime'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(text).run();
  return c.json({ ok: true });
});

// 1セル（person × day）の値を更新。value が null/0 なら削除。
app.post('/summer-safety-2026/entry', async (c) => {
  const b = await c.req.json<{ person_key?: string; day?: number; value?: number | null }>().catch(() => ({} as Record<string, unknown>));
  const key = String(b.person_key ?? '').trim();
  const day = Number(b.day);
  if (!key || !Number.isInteger(day) || day < 1 || day > SS2026_DAYS_IN_MONTH) {
    return c.json({ error: 'パラメータが不正です' }, 400);
  }
  const exists = await c.env.DB.prepare('SELECT 1 FROM summer_safety_2026_people WHERE person_key = ?').bind(key).first();
  if (!exists) return c.json({ error: '対象の乗務員が見つかりません' }, 404);

  const v = b.value == null ? null : Number(b.value);
  if (v == null || v === 0) {
    await c.env.DB.prepare('DELETE FROM summer_safety_2026_entries WHERE person_key = ? AND day = ?').bind(key, day).run();
    return c.json({ ok: true, value: null });
  }
  if (v !== 1 && v !== 2 && v !== 3) return c.json({ error: '値は 1/2/3 のみです' }, 400);
  await c.env.DB.prepare(
    `INSERT INTO summer_safety_2026_entries (person_key, day, value, updated_at) VALUES (?, ?, ?, datetime('now','localtime'))
     ON CONFLICT(person_key, day) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(key, day, v).run();
  return c.json({ ok: true, value: v });
});

// 手札の氏名・社員番号・班を修正（社員名簿に紐づけ直す）。person_key（内部ID）は変えない。
app.post('/summer-safety-2026/person-meta', async (c) => {
  const b = await c.req.json<{ person_key?: string; emp_no?: string | null; emp_name?: string; team?: number | null }>()
    .catch(() => ({} as Record<string, unknown>));
  const key = String(b.person_key ?? '').trim();
  const name = String(b.emp_name ?? '').trim().slice(0, 40);
  if (!key || !name) return c.json({ error: '氏名は必須です' }, 400);

  const row = await c.env.DB.prepare('SELECT person_key FROM summer_safety_2026_people WHERE person_key = ?').bind(key).first();
  if (!row) return c.json({ error: '対象が見つかりません' }, 404);

  const empNo = b.emp_no == null || String(b.emp_no).trim() === '' ? null : String(b.emp_no).trim().slice(0, 20);
  const team = b.team == null || !Number.isInteger(Number(b.team)) ? null : Number(b.team);
  const div = team == null ? null : Math.ceil(team / 2);

  let dupWarning: string | null = null;
  if (empNo) {
    const dup = await c.env.DB.prepare(
      'SELECT emp_name FROM summer_safety_2026_people WHERE emp_no = ? AND person_key != ?'
    ).bind(empNo, key).first<{ emp_name: string }>();
    if (dup) dupWarning = `社員番号 ${empNo} は既に「${dup.emp_name}」に紐づいています`;
  }

  await c.env.DB.prepare(
    `UPDATE summer_safety_2026_people
        SET emp_name = ?, emp_no = ?, team = ?, division = ?, updated_at = datetime('now','localtime')
      WHERE person_key = ?`
  ).bind(name, empNo, team, div, key).run();

  return c.json({ ok: true, emp_name: name, emp_no: empNo, team, division: div, warning: dupWarning });
});

// 貼り付けテキストの一括取込（社員番号 or 氏名で突き合わせ、同じ人・同じ日の値は上書き）
app.post('/summer-safety-2026/import', async (c) => {
  const body = await c.req.json<{ text?: string }>().catch(() => ({} as { text?: string }));
  const parsed = parseSS2026Import(body.text ?? '');
  if (!parsed.people.length) return c.json({ error: parsed.errors[0] ?? '取り込める行がありません', errors: parsed.errors }, 400);

  const existing = await c.env.DB.prepare('SELECT person_key, emp_no, emp_name FROM summer_safety_2026_people')
    .all<{ person_key: string; emp_no: string | null; emp_name: string }>();
  const byEmpNo = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const r of existing.results ?? []) {
    if (r.emp_no) byEmpNo.set(r.emp_no, r.person_key);
    byName.set(r.emp_name, r.person_key);
  }
  let maxSheet = 0;
  const sheetRs = await c.env.DB.prepare('SELECT COALESCE(MAX(sheet_no),0) AS m FROM summer_safety_2026_people').first<{ m: number }>();
  maxSheet = sheetRs?.m ?? 0;

  const stmts: D1PreparedStatement[] = [];
  let entryCount = 0;
  for (const p of parsed.people) {
    let key = '';
    if (p.emp_no && byEmpNo.has(p.emp_no)) key = byEmpNo.get(p.emp_no)!;
    else if (!p.emp_no && byName.has(p.emp_name)) key = byName.get(p.emp_name)!;
    else key = p.emp_no || `imp:${p.emp_name}`;

    const div = divFromTeam(p.team);
    const isNew = !(byEmpNo.has(p.emp_no) || byName.has(p.emp_name)) && !((existing.results ?? []).some(r => r.person_key === key));
    if (isNew) maxSheet++;
    stmts.push(c.env.DB.prepare(
      `INSERT INTO summer_safety_2026_people (person_key, emp_no, emp_name, team, division, sheet_no)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(person_key) DO UPDATE SET
         emp_no = COALESCE(NULLIF(excluded.emp_no,''), summer_safety_2026_people.emp_no),
         emp_name = excluded.emp_name,
         team = COALESCE(excluded.team, summer_safety_2026_people.team),
         division = COALESCE(excluded.division, summer_safety_2026_people.division),
         updated_at = datetime('now','localtime')`
    ).bind(key, p.emp_no || null, p.emp_name, p.team, div, isNew ? maxSheet : null));
    byName.set(p.emp_name, key);
    if (p.emp_no) byEmpNo.set(p.emp_no, key);

    for (const [dStr, v] of Object.entries(p.days)) {
      stmts.push(c.env.DB.prepare(
        `INSERT INTO summer_safety_2026_entries (person_key, day, value, updated_at)
         VALUES (?, ?, ?, datetime('now','localtime'))
         ON CONFLICT(person_key, day) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(key, Number(dStr), v));
      entryCount++;
    }
  }
  // sheet_no を後から詰める（NULL のままだと一覧末尾）
  await c.env.DB.batch(stmts);
  await c.env.DB.prepare(
    `UPDATE summer_safety_2026_people SET sheet_no = (SELECT COUNT(*) FROM summer_safety_2026_people p2 WHERE p2.rowid <= summer_safety_2026_people.rowid)
     WHERE sheet_no IS NULL`
  ).run().catch(() => {});
  return c.json({ ok: true, people: parsed.people.length, entries: entryCount, warnings: parsed.errors });
});

// ============ 乗務員証 証明写真 — 作業一式の保存（migration_137/138 / R2: ID_PHOTO_BUCKET） ============
// バッチ = 追加した写真＋切り取り設定＋人物＋出力設定＋保存時に生成した印刷シート(A4/L・表裏の各ページ画像＋PDF) の一式。
// 自動削除はしない（手動削除ボタンのみ。expires_at は名残の列で実質使わない）。
const IDP_NEVER = '9999-12-31T00:00:00.000Z';

// 保存開始: 空のバッチ行を作る
app.post('/id-photos/batches', async (c) => {
  const b = await c.req.json<{ label?: string }>().catch(() => ({} as { label?: string }));
  const label = String(b.label ?? '').trim().slice(0, 100) || '(名称未設定)';
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO id_photo_batches (id, label, photo_count, settings_json, photos_json, created_by, expires_at)
     VALUES (?, ?, 0, '{}', '[]', ?, ?)`
  ).bind(id, label, c.get('adminId') ?? null, IDP_NEVER).run();
  return c.json({ id });
});

// 写真1枚アップロード（本体はリクエストボディの生バイト = image/jpeg）
app.put('/id-photos/batches/:id/photo/:idx', async (c) => {
  const id = c.req.param('id');
  const idx = parseInt(c.req.param('idx'), 10);
  if (!Number.isInteger(idx) || idx < 0 || idx > 199) return c.json({ error: 'idxが不正です' }, 400);
  const row = await c.env.DB.prepare('SELECT id FROM id_photo_batches WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'バッチが見つかりません' }, 404);
  const buf = await c.req.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > 8_000_000) return c.json({ error: '画像サイズが不正です' }, 400);
  await c.env.ID_PHOTO_BUCKET.put(`${id}/photo-${idx}.jpg`, buf, { httpMetadata: { contentType: 'image/jpeg' } });
  return c.json({ ok: true });
});

// 印刷シート1ページ分の画像アップロード（保存時点のA4/L表裏ページをそのまま保持する）
app.put('/id-photos/batches/:id/sheet/:idx', async (c) => {
  const id = c.req.param('id');
  const idx = parseInt(c.req.param('idx'), 10);
  if (!Number.isInteger(idx) || idx < 0 || idx > 199) return c.json({ error: 'idxが不正です' }, 400);
  const row = await c.env.DB.prepare('SELECT id FROM id_photo_batches WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'バッチが見つかりません' }, 404);
  const buf = await c.req.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > 12_000_000) return c.json({ error: '画像サイズが不正です' }, 400);
  await c.env.ID_PHOTO_BUCKET.put(`${id}/sheet-${idx}.jpg`, buf, { httpMetadata: { contentType: 'image/jpeg' } });
  return c.json({ ok: true });
});

// 印刷シート一式のPDFをアップロード
app.put('/id-photos/batches/:id/pdf', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT id FROM id_photo_batches WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'バッチが見つかりません' }, 404);
  const buf = await c.req.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > 40_000_000) return c.json({ error: 'PDFサイズが不正です' }, 400);
  await c.env.ID_PHOTO_BUCKET.put(`${id}/sheet.pdf`, buf, { httpMetadata: { contentType: 'application/pdf' } });
  return c.json({ ok: true });
});

// 上書き保存の後始末: 写真/印刷シートが減った場合に、不要になった旧インデックスのR2オブジェクトを削除する
app.post('/id-photos/batches/:id/trim', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT id FROM id_photo_batches WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'バッチが見つかりません' }, 404);
  const b = await c.req.json<{ photo_count?: number; sheet_count?: number }>().catch(() => ({} as Record<string, unknown>));
  const photoCount = Number.isInteger(b.photo_count) ? Math.max(0, b.photo_count as number) : null;
  const sheetCount = Number.isInteger(b.sheet_count) ? Math.max(0, b.sheet_count as number) : null;
  if (photoCount == null && sheetCount == null) return c.json({ ok: true, deleted: 0 });
  const listed = await c.env.ID_PHOTO_BUCKET.list({ prefix: `${id}/` });
  const toDelete: string[] = [];
  for (const o of listed.objects) {
    const key = o.key.slice(id.length + 1);
    const mPhoto = /^photo-(\d+)\.jpg$/.exec(key);
    const mSheet = /^sheet-(\d+)\.jpg$/.exec(key);
    if (mPhoto && photoCount != null && parseInt(mPhoto[1], 10) >= photoCount) toDelete.push(o.key);
    else if (mSheet && sheetCount != null && parseInt(mSheet[1], 10) >= sheetCount) toDelete.push(o.key);
  }
  if (toDelete.length) await c.env.ID_PHOTO_BUCKET.delete(toDelete);
  return c.json({ ok: true, deleted: toDelete.length });
});

// 保存確定: メタを書き込む
app.post('/id-photos/batches/:id/finalize', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT id FROM id_photo_batches WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'バッチが見つかりません' }, 404);
  const b = await c.req.json<{ label?: string; photo_count?: number; settings?: unknown; photos?: unknown; sheet_count?: number; has_sheets?: boolean }>()
    .catch(() => ({} as Record<string, unknown>));
  const label = String(b.label ?? '').trim().slice(0, 100) || '(名称未設定)';
  const count = Number.isInteger(b.photo_count) ? Math.max(0, Math.min(200, b.photo_count as number)) : 0;
  const sheetCount = Number.isInteger(b.sheet_count) ? Math.max(0, Math.min(200, b.sheet_count as number)) : 0;
  const hasSheets = b.has_sheets && sheetCount > 0 ? 1 : 0;
  const settingsStr = JSON.stringify(b.settings ?? {}).slice(0, 20_000);
  const photosStr = JSON.stringify(b.photos ?? []).slice(0, 400_000);
  await c.env.DB.prepare(
    `UPDATE id_photo_batches SET label = ?, photo_count = ?, settings_json = ?, photos_json = ?, has_sheets = ?, sheet_count = ? WHERE id = ?`
  ).bind(label, count, settingsStr, photosStr, hasSheets, sheetCount, id).run();
  return c.json({ ok: true });
});

// 一覧（新しい順・全件＝自動削除しないため期限フィルタなし）
app.get('/id-photos/batches', async (c) => {
  const rs = await c.env.DB.prepare(
    `SELECT id, label, photo_count, has_sheets, sheet_count, created_at
       FROM id_photo_batches ORDER BY created_at DESC LIMIT 200`
  ).all();
  return c.json({ batches: rs.results ?? [] });
});

// 1バッチのメタ取得
app.get('/id-photos/batches/:id', async (c) => {
  const row = await c.env.DB.prepare(
    'SELECT id, label, photo_count, settings_json, photos_json, has_sheets, sheet_count, created_at FROM id_photo_batches WHERE id = ?'
  ).bind(c.req.param('id')).first<{ id: string; label: string; photo_count: number; settings_json: string; photos_json: string; has_sheets: number; sheet_count: number; created_at: string }>();
  if (!row) return c.json({ error: 'バッチが見つかりません' }, 404);
  let settings: unknown = {}, photos: unknown = [];
  try { settings = JSON.parse(row.settings_json || '{}'); } catch { /* noop */ }
  try { photos = JSON.parse(row.photos_json || '[]'); } catch { /* noop */ }
  return c.json({
    id: row.id, label: row.label, photo_count: row.photo_count, settings, photos,
    has_sheets: !!row.has_sheets, sheet_count: row.sheet_count, created_at: row.created_at,
  });
});

// 写真1枚を取得（R2からストリーム）
app.get('/id-photos/batches/:id/photo/:idx', async (c) => {
  const id = c.req.param('id');
  const idx = parseInt(c.req.param('idx'), 10);
  if (!Number.isInteger(idx) || idx < 0) return c.json({ error: 'idxが不正です' }, 400);
  const obj = await c.env.ID_PHOTO_BUCKET.get(`${id}/photo-${idx}.jpg`);
  if (!obj) return c.json({ error: '画像が見つかりません' }, 404);
  return new Response(obj.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } });
});

// 印刷シート1ページを取得（R2からストリーム）
app.get('/id-photos/batches/:id/sheet/:idx', async (c) => {
  const id = c.req.param('id');
  const idx = parseInt(c.req.param('idx'), 10);
  if (!Number.isInteger(idx) || idx < 0) return c.json({ error: 'idxが不正です' }, 400);
  const obj = await c.env.ID_PHOTO_BUCKET.get(`${id}/sheet-${idx}.jpg`);
  if (!obj) return c.json({ error: 'シートが見つかりません' }, 404);
  return new Response(obj.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } });
});

// 保存時のPDFを取得（そのままダウンロード/表示）
app.get('/id-photos/batches/:id/pdf', async (c) => {
  const id = c.req.param('id');
  const obj = await c.env.ID_PHOTO_BUCKET.get(`${id}/sheet.pdf`);
  if (!obj) return c.json({ error: 'PDFが見つかりません' }, 404);
  return new Response(obj.body, {
    headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store', 'Content-Disposition': `inline; filename="idphotos-${id}.pdf"` },
  });
});

// 手動削除（R2オブジェクト＋行）— 削除できるのはこの操作のみ（自動削除なし）
app.delete('/id-photos/batches/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT id FROM id_photo_batches WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'バッチが見つかりません' }, 404);
  const listed = await c.env.ID_PHOTO_BUCKET.list({ prefix: `${id}/` });
  if (listed.objects.length) await c.env.ID_PHOTO_BUCKET.delete(listed.objects.map(o => o.key));
  await c.env.DB.prepare('DELETE FROM id_photo_batches WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ============ 秋の全国交通安全運動 手札（自由配置エディタの版下を1行だけ保存） ============
app.get('/autumn-safety-2026-tefuda', async (c) => {
  const tpl = c.req.query('tpl');
  if (tpl === 'blocks' || tpl === 'row') {
    return c.json({ data: defaultDoc(tpl) });
  }
  const row = await c.env.DB.prepare('SELECT data_json, updated_at FROM autumn_safety_2026_tefuda WHERE id = 1')
    .first<{ data_json: string; updated_at: string }>().catch(() => null);
  let data: unknown = {};
  try { data = row?.data_json ? JSON.parse(row.data_json) : {}; } catch { data = {}; }
  return c.json({ data, updated_at: row?.updated_at ?? null });
});

app.post('/autumn-safety-2026-tefuda', async (c) => {
  const body = await c.req.json<{ data?: unknown }>().catch(() => ({} as { data?: unknown }));
  const json = JSON.stringify(body.data ?? {}).slice(0, 120000);
  await c.env.DB.prepare(
    `INSERT INTO autumn_safety_2026_tefuda (id, data_json, updated_at)
       VALUES (1, ?, datetime('now','localtime'))
     ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`
  ).bind(json).run();
  return c.json({ ok: true });
});

export default app;
