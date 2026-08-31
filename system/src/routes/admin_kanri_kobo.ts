// 管理者公休予定表（2026年度版レイアウト）
//   ページ : /{SECRET}/admin/kanri-kobo（グリッド） /kanri-kobo/print（印刷用）
//   API    : /{SECRET}/admin/api/kanri-kobo/*（編集系は index.ts の権限ミドルウェアで kanri-kobo.edit 必須）
//   班長シフト(kancho_*)とは別テーブル・別機能。月度は前月11日〜当月10日 固定。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { getAdminPermissions } from '../permissions';
import {
  kanriKoboPage, kanriKoboPrintPage, kkPeriodNavHtml, kkPeriodRange, kkAdjacent,
  type KkPageData, type KkMember, type KkType, type KkWeekendResp, type KkToitsuCount,
} from '../html/kanri_kobo';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<string> {
  const id = c.get('adminId');
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(id).first<{ username: string }>();
  return row?.username ?? `id:${id}`;
}

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('kanri-kobo.edit');
}

function parseYM(c: { req: { query: (k: string) => string | undefined } }): { year: number; month: number } {
  const now = new Date();
  // 今日が11日以降なら「翌月度」、10日以前なら「当月度」
  const day = now.getDate();
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  if (day >= 11) { m += 1; if (m > 12) { m = 1; y += 1; } }
  const year = parseInt(c.req.query('year') ?? '') || y;
  const month = parseInt(c.req.query('month') ?? '') || m;
  return { year, month };
}

async function logEdit(
  db: D1Database, admin: string, action: string, target: string,
  date: string | null, oldV: string | null, newV: string | null
): Promise<void> {
  await db.prepare(
    'INSERT INTO kk_edit_logs (admin_name, action, target, date, old_value, new_value) VALUES (?,?,?,?,?,?)'
  ).bind(admin, action, target, date, oldV, newV).run();
}

// ===== ページデータ読み込み =====
async function loadPageData(env: Env, year: number, month: number, canEditFlag: boolean): Promise<KkPageData> {
  const [members, types, cells, asahi, dayNotes, memos, weekend, toitsu] = await Promise.all([
    env.DB.prepare('SELECT * FROM kk_members WHERE year = ? AND month = ? ORDER BY block, sort_order, id')
      .bind(year, month).all<KkMember>(),
    env.DB.prepare('SELECT * FROM kk_shift_types ORDER BY sort_order, id').all<KkType>(),
    env.DB.prepare(
      `SELECT c.member_id, c.date, c.code FROM kk_cells c
       JOIN kk_members m ON m.id = c.member_id
       WHERE m.year = ? AND m.month = ?`
    ).bind(year, month).all<{ member_id: number; date: string; code: string }>(),
    env.DB.prepare('SELECT date, name FROM kk_asahi WHERE year = ? AND month = ?').bind(year, month).all<{ date: string; name: string }>(),
    env.DB.prepare('SELECT date, content FROM kk_day_notes WHERE year = ? AND month = ?').bind(year, month).all<{ date: string; content: string }>(),
    env.DB.prepare('SELECT kind, content FROM kk_memos WHERE year = ? AND month = ?').bind(year, month).all<{ kind: string; content: string }>(),
    env.DB.prepare('SELECT date, kind, name FROM kk_weekend_resp WHERE year = ? AND month = ?').bind(year, month).all<KkWeekendResp>(),
    env.DB.prepare('SELECT person, ym, cnt, sort_order FROM kk_toitsu_counts ORDER BY sort_order, person').all<KkToitsuCount>(),
  ]);

  const cellMap: Record<string, string> = {};
  for (const r of (cells.results ?? [])) cellMap[`${r.member_id}_${r.date}`] = r.code;
  const asahiMap: Record<string, string> = {};
  for (const r of (asahi.results ?? [])) asahiMap[r.date] = r.name;
  const dayNoteMap: Record<string, string> = {};
  for (const r of (dayNotes.results ?? [])) dayNoteMap[r.date] = r.content;

  let memoNote = '', toitsuRotation = '';
  let holidays: string[] = [];
  for (const r of (memos.results ?? [])) {
    if (r.kind === 'note') memoNote = r.content;
    else if (r.kind === 'toitsu_rotation') toitsuRotation = r.content;
    else if (r.kind === 'holidays') { try { const a = JSON.parse(r.content); if (Array.isArray(a)) holidays = a.map(String); } catch { /* noop */ } }
  }

  return {
    members: members.results ?? [],
    types: types.results ?? [],
    cellMap,
    asahi: asahiMap,
    dayNotes: dayNoteMap,
    memoNote,
    holidays,
    weekendResp: weekend.results ?? [],
    toitsu: toitsu.results ?? [],
    toitsuRotation,
    year, month,
    canEdit: canEditFlag,
  };
}

// ===== ページ =====
app.get('/kanri-kobo', async (c) => {
  const { year, month } = parseYM(c);
  const data = await loadPageData(c.env, year, month, await canEdit(c));
  const html = kanriKoboPage(data);
  return c.html(layout('管理者公休表', html, 'kanri-kobo', kkPeriodNavHtml(year, month)));
});

app.get('/kanri-kobo/print', async (c) => {
  const { year, month } = parseYM(c);
  const data = await loadPageData(c.env, year, month, false);
  return c.html(kanriKoboPrintPage(data));
});

// ===== API: セル =====
app.post('/api/kanri-kobo/cell', async (c) => {
  const b = await c.req.json<{ member_id: number; date: string; code: string }>();
  if (!b.member_id || !DATE_RE.test(b.date ?? '')) return c.json({ error: '入力が不正です' }, 400);
  const code = (b.code ?? '').trim();
  const admin = await adminName(c);
  const mrow = await c.env.DB.prepare('SELECT name FROM kk_members WHERE id = ?').bind(b.member_id).first<{ name: string }>();
  if (!mrow) return c.json({ error: 'メンバーが見つかりません' }, 404);
  const old = await c.env.DB.prepare('SELECT code FROM kk_cells WHERE member_id = ? AND date = ?').bind(b.member_id, b.date).first<{ code: string }>();
  if (code === '') {
    await c.env.DB.prepare('DELETE FROM kk_cells WHERE member_id = ? AND date = ?').bind(b.member_id, b.date).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO kk_cells (member_id, date, code, updated_at, updated_by)
       VALUES (?,?,?,datetime('now','localtime'),?)
       ON CONFLICT(member_id, date) DO UPDATE SET code = excluded.code, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).bind(b.member_id, b.date, code, admin).run();
  }
  await logEdit(c.env.DB, admin, 'cell', mrow.name, b.date, old?.code ?? '', code);
  return c.json({ ok: true });
});

// ===== API: 祝日 =====
app.post('/api/kanri-kobo/holidays', async (c) => {
  const b = await c.req.json<{ year: number; month: number; dates: string[] }>();
  const list = (b.dates ?? []).filter(d => DATE_RE.test(d));
  await c.env.DB.prepare('DELETE FROM kk_memos WHERE year = ? AND month = ? AND kind = ?').bind(b.year, b.month, 'holidays').run();
  await c.env.DB.prepare("INSERT INTO kk_memos (year, month, kind, content) VALUES (?,?,?,?)").bind(b.year, b.month, 'holidays', JSON.stringify(list)).run();
  await logEdit(c.env.DB, await adminName(c), 'memo', '祝日', null, null, list.join(' '));
  return c.json({ ok: true });
});

// ===== API: メモ（特記事項 / 当直ローテ順） =====
app.post('/api/kanri-kobo/memo', async (c) => {
  const b = await c.req.json<{ year: number; month: number; kind: string; content: string }>();
  const kind = b.kind === 'toitsu_rotation' ? 'toitsu_rotation' : 'note';
  await c.env.DB.prepare('DELETE FROM kk_memos WHERE year = ? AND month = ? AND kind = ?').bind(b.year, b.month, kind).run();
  await c.env.DB.prepare('INSERT INTO kk_memos (year, month, kind, content) VALUES (?,?,?,?)').bind(b.year, b.month, kind, b.content ?? '').run();
  await logEdit(c.env.DB, await adminName(c), 'memo', kind, null, null, (b.content ?? '').slice(0, 200));
  return c.json({ ok: true });
});

// ===== API: アサヒ担当 =====
app.post('/api/kanri-kobo/asahi', async (c) => {
  const b = await c.req.json<{ year: number; month: number; date: string; name: string }>();
  if (!DATE_RE.test(b.date ?? '')) return c.json({ error: '日付が不正です' }, 400);
  const name = (b.name ?? '').trim();
  if (name === '') {
    await c.env.DB.prepare('DELETE FROM kk_asahi WHERE year = ? AND month = ? AND date = ?').bind(b.year, b.month, b.date).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO kk_asahi (year, month, date, name) VALUES (?,?,?,?)
       ON CONFLICT(year, month, date) DO UPDATE SET name = excluded.name`
    ).bind(b.year, b.month, b.date, name).run();
  }
  await logEdit(c.env.DB, await adminName(c), 'asahi', 'アサヒ', b.date, null, name);
  return c.json({ ok: true });
});

// ===== API: 日別メモ =====
app.post('/api/kanri-kobo/day-note', async (c) => {
  const b = await c.req.json<{ year: number; month: number; date: string; content: string }>();
  if (!DATE_RE.test(b.date ?? '')) return c.json({ error: '日付が不正です' }, 400);
  const content = b.content ?? '';
  if (content.trim() === '') {
    await c.env.DB.prepare('DELETE FROM kk_day_notes WHERE year = ? AND month = ? AND date = ?').bind(b.year, b.month, b.date).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO kk_day_notes (year, month, date, content) VALUES (?,?,?,?)
       ON CONFLICT(year, month, date) DO UPDATE SET content = excluded.content`
    ).bind(b.year, b.month, b.date, content).run();
  }
  await logEdit(c.env.DB, await adminName(c), 'daynote', '日別メモ', b.date, null, content.slice(0, 100));
  return c.json({ ok: true });
});

// ===== API: 土日責任者 =====
app.post('/api/kanri-kobo/weekend', async (c) => {
  const b = await c.req.json<{ year: number; month: number; date: string; kind: string; name: string }>();
  if (!DATE_RE.test(b.date ?? '')) return c.json({ error: '日付が不正です' }, 400);
  const kind = ['resp', 'akake', 'chinshime'].includes(b.kind) ? b.kind : 'resp';
  const name = (b.name ?? '').trim();
  if (name === '') {
    await c.env.DB.prepare('DELETE FROM kk_weekend_resp WHERE year = ? AND month = ? AND date = ? AND kind = ?').bind(b.year, b.month, b.date, kind).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO kk_weekend_resp (year, month, date, kind, name) VALUES (?,?,?,?,?)
       ON CONFLICT(year, month, date, kind) DO UPDATE SET name = excluded.name`
    ).bind(b.year, b.month, b.date, kind, name).run();
  }
  await logEdit(c.env.DB, await adminName(c), 'weekend', kind, b.date, null, name);
  return c.json({ ok: true });
});

// ===== API: 当直回数 =====
app.post('/api/kanri-kobo/toitsu', async (c) => {
  const b = await c.req.json<{ person: string; ym: string; cnt: number }>();
  const person = (b.person ?? '').trim();
  if (!person) return c.json({ error: '氏名が必要です' }, 400);
  const ym = (b.ym ?? '').trim();
  if (ym !== 'prev' && !/^\d{4}-\d{2}$/.test(ym)) return c.json({ error: '年月が不正です' }, 400);
  const cnt = Number.isFinite(b.cnt) ? Math.max(0, Math.trunc(b.cnt)) : 0;
  await c.env.DB.prepare(
    `INSERT INTO kk_toitsu_counts (person, ym, cnt) VALUES (?,?,?)
     ON CONFLICT(person, ym) DO UPDATE SET cnt = excluded.cnt`
  ).bind(person, ym, cnt).run();
  await logEdit(c.env.DB, await adminName(c), 'toitsu', `${person} ${ym}`, null, null, String(cnt));
  return c.json({ ok: true });
});

app.post('/api/kanri-kobo/toitsu/delete', async (c) => {
  const b = await c.req.json<{ person: string }>();
  const person = (b.person ?? '').trim();
  if (!person) return c.json({ error: '氏名が必要です' }, 400);
  await c.env.DB.prepare('DELETE FROM kk_toitsu_counts WHERE person = ?').bind(person).run();
  await logEdit(c.env.DB, await adminName(c), 'toitsu', person, null, null, '(削除)');
  return c.json({ ok: true });
});

// ===== API: 名簿一括保存 =====
app.post('/api/kanri-kobo/members/batch', async (c) => {
  const b = await c.req.json<{ year: number; month: number; members: Array<{ id: number; block: string; name: string; abbr: string; sort_order: number; is_active: number }> }>();
  const { year, month } = b;
  const validBlocks = new Set(['kanai', 'kanri', 'job', 'sub2']);
  const rows = (b.members ?? []).filter(m => m.name?.trim() && validBlocks.has(m.block));
  const admin = await adminName(c);

  const existing = await c.env.DB.prepare('SELECT id FROM kk_members WHERE year = ? AND month = ?').bind(year, month).all<{ id: number }>();
  const existingIds = new Set((existing.results ?? []).map(r => r.id));
  const keepIds = new Set(rows.filter(r => r.id > 0).map(r => r.id));
  const toDelete = [...existingIds].filter(id => !keepIds.has(id));

  const stmts: D1PreparedStatement[] = [];
  for (const id of toDelete) {
    stmts.push(c.env.DB.prepare('DELETE FROM kk_cells WHERE member_id = ?').bind(id));
    stmts.push(c.env.DB.prepare('DELETE FROM kk_members WHERE id = ?').bind(id));
  }
  for (const m of rows) {
    const abbr = (m.abbr ?? '').trim() || null;
    const active = m.is_active ? 1 : 0;
    if (m.id > 0 && existingIds.has(m.id)) {
      stmts.push(c.env.DB.prepare(
        `UPDATE kk_members SET block = ?, name = ?, abbr = ?, sort_order = ?, is_active = ?, updated_at = datetime('now','localtime') WHERE id = ? AND year = ? AND month = ?`
      ).bind(m.block, m.name.trim(), abbr, m.sort_order | 0, active, m.id, year, month));
    } else {
      stmts.push(c.env.DB.prepare(
        `INSERT INTO kk_members (year, month, block, name, abbr, sort_order, is_active) VALUES (?,?,?,?,?,?,?)`
      ).bind(year, month, m.block, m.name.trim(), abbr, m.sort_order | 0, active));
    }
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  await logEdit(c.env.DB, admin, 'member', `${year}年${month}月度`, null, null, `${rows.length}名 / 削除${toDelete.length}`);
  return c.json({ ok: true });
});

// ===== API: 前月度から名簿コピー =====
app.post('/api/kanri-kobo/members/clone', async (c) => {
  const b = await c.req.json<{ year: number; month: number }>();
  const { year, month } = b;
  const { prevYear, prevMonth } = kkAdjacent(year, month);
  const [prev, cur] = await Promise.all([
    c.env.DB.prepare('SELECT block, name, abbr, sort_order, is_active FROM kk_members WHERE year = ? AND month = ?').bind(prevYear, prevMonth).all<{ block: string; name: string; abbr: string | null; sort_order: number; is_active: number }>(),
    c.env.DB.prepare('SELECT block, name FROM kk_members WHERE year = ? AND month = ?').bind(year, month).all<{ block: string; name: string }>(),
  ]);
  const have = new Set((cur.results ?? []).map(r => `${r.block} ${r.name}`));
  const stmts: D1PreparedStatement[] = [];
  let n = 0;
  for (const m of (prev.results ?? [])) {
    if (have.has(`${m.block} ${m.name}`)) continue;
    stmts.push(c.env.DB.prepare(
      'INSERT INTO kk_members (year, month, block, name, abbr, sort_order, is_active) VALUES (?,?,?,?,?,?,?)'
    ).bind(year, month, m.block, m.name, m.abbr, m.sort_order, m.is_active));
    n++;
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  await logEdit(c.env.DB, await adminName(c), 'member', `${year}年${month}月度`, null, null, `前月度から${n}名コピー`);
  return c.json({ ok: true, copied: n });
});

// ===== API: 記号一括保存（テーブル全置換。cells はテキスト保存なので id 変更は無害） =====
app.post('/api/kanri-kobo/types/batch', async (c) => {
  const b = await c.req.json<{ types: Array<{ code: string; label: string; color: string; counts_as_work: number; counts_as_off: number; is_shitei: number; sort_order: number; is_active: number }> }>();
  const seen = new Set<string>();
  const rows = (b.types ?? []).filter(t => {
    const code = t.code?.trim();
    if (!code || seen.has(code)) return false;
    seen.add(code);
    return true;
  });
  const stmts: D1PreparedStatement[] = [c.env.DB.prepare('DELETE FROM kk_shift_types')];
  for (const t of rows) {
    const color = /^#[0-9a-fA-F]{6}$/.test(t.color ?? '') ? t.color : '#e5e7eb';
    stmts.push(c.env.DB.prepare(
      `INSERT INTO kk_shift_types (code, label, color, counts_as_work, counts_as_off, is_shitei, sort_order, is_active)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(t.code.trim(), (t.label ?? '').trim(), color, t.counts_as_work ? 1 : 0, t.counts_as_off ? 1 : 0, t.is_shitei ? 1 : 0, t.sort_order | 0, t.is_active ? 1 : 0));
  }
  await c.env.DB.batch(stmts);
  await logEdit(c.env.DB, await adminName(c), 'type', '記号マスタ', null, null, `${rows.length}件`);
  return c.json({ ok: true });
});

// ===== API: 履歴 =====
app.get('/api/kanri-kobo/logs', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT admin_name, action, target, date, old_value, new_value, created_at FROM kk_edit_logs ORDER BY id DESC LIMIT 200'
  ).all();
  return c.json({ logs: rows.results ?? [] });
});

// ===== API: Excel取込 =====
type ImportMonth = {
  kind: 'month';
  members: Array<{ tmp: string; block: string; name: string; abbr: string; sort_order: number }>;
  cells: Array<{ tmp: string; date: string; code: string }>;
  asahi: Array<{ date: string; name: string }>;
  dayNotes: Array<{ date: string; content: string }>;
};
type ImportWeekend = { kind: 'weekend'; entries: Array<{ date: string; kind: string; name: string }> };
type ImportToitsu = { kind: 'toitsu'; counts: Array<{ person: string; ym: string; cnt: number }>; rotation: string };

app.post('/api/kanri-kobo/import', async (c) => {
  const b = await c.req.json<{ year: number; month: number; payload: ImportMonth | ImportWeekend | ImportToitsu }>();
  const { year, month, payload } = b;
  if (!year || !month || !payload?.kind) return c.json({ error: 'パラメータ不足' }, 400);
  const admin = await adminName(c);
  const { start, end } = kkPeriodRange(year, month);

  if (payload.kind === 'month') {
    const validBlocks = new Set(['kanai', 'kanri', 'job', 'sub2']);
    const members = (payload.members ?? []).filter(m => m.name?.trim() && validBlocks.has(m.block));

    // この月度の既存データを全消去
    const oldIds = await c.env.DB.prepare('SELECT id FROM kk_members WHERE year = ? AND month = ?').bind(year, month).all<{ id: number }>();
    const wipe: D1PreparedStatement[] = [];
    for (const r of (oldIds.results ?? [])) wipe.push(c.env.DB.prepare('DELETE FROM kk_cells WHERE member_id = ?').bind(r.id));
    wipe.push(c.env.DB.prepare('DELETE FROM kk_members WHERE year = ? AND month = ?').bind(year, month));
    wipe.push(c.env.DB.prepare('DELETE FROM kk_asahi WHERE year = ? AND month = ?').bind(year, month));
    wipe.push(c.env.DB.prepare('DELETE FROM kk_day_notes WHERE year = ? AND month = ?').bind(year, month));
    if (wipe.length) await c.env.DB.batch(wipe);

    // メンバーを挿入して tmp -> id を得る
    const idByTmp: Record<string, number> = {};
    for (const m of members) {
      const row = await c.env.DB.prepare(
        `INSERT INTO kk_members (year, month, block, name, abbr, sort_order, is_active) VALUES (?,?,?,?,?,?,1) RETURNING id`
      ).bind(year, month, m.block, m.name.trim(), (m.abbr ?? '').trim() || null, m.sort_order | 0).first<{ id: number }>();
      if (row) idByTmp[m.tmp] = row.id;
    }

    // セル（月度範囲内のみ）
    const cellStmts: D1PreparedStatement[] = [];
    for (const cell of (payload.cells ?? [])) {
      const mid = idByTmp[cell.tmp];
      if (!mid || !DATE_RE.test(cell.date) || cell.date < start || cell.date > end) continue;
      const code = (cell.code ?? '').trim();
      if (!code) continue;
      cellStmts.push(c.env.DB.prepare('INSERT OR REPLACE INTO kk_cells (member_id, date, code, updated_by) VALUES (?,?,?,?)').bind(mid, cell.date, code, 'excel-import'));
    }
    // アサヒ・日別メモ
    for (const a of (payload.asahi ?? [])) {
      if (!DATE_RE.test(a.date) || a.date < start || a.date > end || !a.name?.trim()) continue;
      cellStmts.push(c.env.DB.prepare('INSERT OR REPLACE INTO kk_asahi (year, month, date, name) VALUES (?,?,?,?)').bind(year, month, a.date, a.name.trim()));
    }
    for (const dn of (payload.dayNotes ?? [])) {
      if (!DATE_RE.test(dn.date) || dn.date < start || dn.date > end || !dn.content?.trim()) continue;
      cellStmts.push(c.env.DB.prepare('INSERT OR REPLACE INTO kk_day_notes (year, month, date, content) VALUES (?,?,?,?)').bind(year, month, dn.date, dn.content.trim()));
    }
    // チャンクして実行（サブリクエスト過多・CPU制限対策）
    for (let i = 0; i < cellStmts.length; i += 80) await c.env.DB.batch(cellStmts.slice(i, i + 80));

    await logEdit(c.env.DB, admin, 'import', `${year}年${month}月度`, null, null, `月度シート: 名簿${members.length} セル${cellStmts.length}`);
    return c.json({ ok: true });
  }

  if (payload.kind === 'weekend') {
    const entries = (payload.entries ?? []).filter(e => DATE_RE.test(e.date) && e.date >= start && e.date <= end && e.name?.trim());
    const stmts: D1PreparedStatement[] = [c.env.DB.prepare('DELETE FROM kk_weekend_resp WHERE year = ? AND month = ?').bind(year, month)];
    const seen = new Set<string>();
    for (const e of entries) {
      const kind = ['resp', 'akake', 'chinshime'].includes(e.kind) ? e.kind : 'resp';
      const key = `${e.date} ${kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      stmts.push(c.env.DB.prepare('INSERT OR REPLACE INTO kk_weekend_resp (year, month, date, kind, name) VALUES (?,?,?,?,?)').bind(year, month, e.date, kind, e.name.trim()));
    }
    await c.env.DB.batch(stmts);
    await logEdit(c.env.DB, admin, 'import', `${year}年${month}月度`, null, null, `土日責任者: ${seen.size}件`);
    return c.json({ ok: true });
  }

  if (payload.kind === 'toitsu') {
    const counts = (payload.counts ?? []).filter(t => t.person?.trim() && (t.ym === 'prev' || /^\d{4}-\d{2}$/.test(t.ym)));
    const stmts: D1PreparedStatement[] = [];
    for (const t of counts) {
      stmts.push(c.env.DB.prepare(
        `INSERT INTO kk_toitsu_counts (person, ym, cnt) VALUES (?,?,?)
         ON CONFLICT(person, ym) DO UPDATE SET cnt = excluded.cnt`
      ).bind(t.person.trim(), t.ym, Math.max(0, Math.trunc(t.cnt) || 0)));
    }
    if ((payload.rotation ?? '').trim()) {
      stmts.push(c.env.DB.prepare('DELETE FROM kk_memos WHERE year = ? AND month = ? AND kind = ?').bind(year, month, 'toitsu_rotation'));
      stmts.push(c.env.DB.prepare('INSERT INTO kk_memos (year, month, kind, content) VALUES (?,?,?,?)').bind(year, month, 'toitsu_rotation', payload.rotation.trim()));
    }
    for (let i = 0; i < stmts.length; i += 80) await c.env.DB.batch(stmts.slice(i, i + 80));
    await logEdit(c.env.DB, admin, 'import', `${year}年${month}月度`, null, null, `当直回数: ${counts.length}件`);
    return c.json({ ok: true });
  }

  return c.json({ error: '未知の取込種別です' }, 400);
});

export default app;
