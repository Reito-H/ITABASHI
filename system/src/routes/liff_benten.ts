// ベンテンクラブ シフト LIFF ページ & API
// /liff/benten-shift   : シフト入力（カレンダー）+ シフト表（Excel風）
// /liff/benten-pdf     : シフト表PDF（トークン付き公開URL・LINEグループ配信用）
// /api/liff/benten/*   : LIFFアクセストークン認証API
//
// 権限: benten_member=自分のシフトのみ / benten_shift_master・general_manager=全員
//       運行管理者・車番管理者・新人・権限不明者は403

import { Hono } from 'hono';
import type { Env } from '../auth';
import {
  BENTEN_MASTER_ROLES, BASE_URL,
  bentenUidFromRequest, bentenRoleFromUid, getActiveRange,
  bentenPdfToken, bentenPdfAvailable, generateBentenPdf,
  addDays,
  type BentenGroup, type BentenShiftType, type BentenMember, type BentenShift,
} from '../benten';
import { logLineActivity } from '../utils/activity_log';

const app = new Hono<{ Bindings: Env }>();

// 認証 + ベンテン権限チェック（403対象: 運行管理者含む全非対象ロール）
async function bentenAuth(c: { req: { raw: Request }; env: Env }): Promise<{ uid: string; role: string } | null> {
  const uid = await bentenUidFromRequest(c.req.raw);
  if (!uid) return null;
  const role = await bentenRoleFromUid(c.env.DB, uid);
  if (!role) return null;
  return { uid, role };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ===================================================
// LIFF ページ
// ===================================================
app.get('/liff/benten-shift', (c) => {
  const liffId = c.env.LIFF_ID_BENTEN_SHIFT ?? '';
  return c.html(bentenShiftPage(liffId));
});

// ===================================================
// 公開PDF（トークン検証・LINEグループに貼るURL）
// ===================================================
app.get('/liff/benten-pdf', async (c) => {
  const from = c.req.query('from') ?? '';
  const to = c.req.query('to') ?? '';
  const t = c.req.query('t') ?? '';
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) return c.text('Bad Request', 400);
  const expected = await bentenPdfToken(from, to);
  if (t !== expected) return c.text('Not Found', 404);

  const bytes = await generateBentenPdf(c.env, from, to);
  if (!bytes) return c.text('PDF未設定（フォントが設定されていません）', 503);
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="benten-shift_${from}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
});

// ===================================================
// API: 初期データ（権限・マスタ・期間）
// ===================================================
app.get('/api/liff/benten/bootstrap', async (c) => {
  const auth = await bentenAuth(c);
  if (!auth) return c.json({ error: 'forbidden' }, 403);

  await logLineActivity(c.env.DB, auth.uid, 'liff', 'api', 'ベンテンシフト閲覧', '画面表示');

  const db = c.env.DB;
  const [groups, types, members, range, me] = await Promise.all([
    db.prepare('SELECT id, name, color, display_order FROM benten_groups ORDER BY display_order, id').all<BentenGroup>(),
    db.prepare('SELECT id, code, label, color, text_color, is_absent, triggers_ake, display_order FROM benten_shift_types ORDER BY display_order, id').all<BentenShiftType>(),
    db.prepare('SELECT id, name, group_id, is_indoor, auto_ake, display_order, allowed_codes FROM benten_members WHERE is_active = 1 ORDER BY display_order, id').all<BentenMember>(),
    getActiveRange(db),
    db.prepare('SELECT id FROM benten_members WHERE line_uid = ? AND is_active = 1').bind(auth.uid).first<{ id: number }>(),
  ]);

  return c.json({
    role: auth.role,
    canEditAll: BENTEN_MASTER_ROLES.includes(auth.role),
    myMemberId: me?.id ?? null,
    groups: groups.results ?? [],
    shiftTypes: types.results ?? [],
    members: members.results ?? [],
    range,
    pdfAvailable: bentenPdfAvailable(c.env),
  });
});

// ===================================================
// API: シフト取得
// ===================================================
app.get('/api/liff/benten/shifts', async (c) => {
  const auth = await bentenAuth(c);
  if (!auth) return c.json({ error: 'forbidden' }, 403);

  const from = c.req.query('from') ?? '';
  const to = c.req.query('to') ?? '';
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) return c.json({ error: 'bad request' }, 400);

  const rows = await c.env.DB.prepare(
    'SELECT member_id, date, shift_type_id, is_ake FROM benten_shifts WHERE date >= ? AND date <= ?'
  ).bind(from, to).all<BentenShift>();
  return c.json(rows.results ?? []);
});

// ===================================================
// API: シフト登録・更新（明け含む）
// body: { member_id, date, shift_type_id | null, is_ake }
// ===================================================
app.put('/api/liff/benten/shift', async (c) => {
  const auth = await bentenAuth(c);
  if (!auth) return c.json({ error: 'forbidden' }, 403);
  const canEditAll = BENTEN_MASTER_ROLES.includes(auth.role);

  const body = await c.req.json<{ member_id: number; date: string; shift_type_id: number | null; is_ake: boolean }>();
  if (!body.member_id || !DATE_RE.test(body.date ?? '')) return c.json({ error: 'bad request' }, 400);

  const member = await c.env.DB.prepare(
    'SELECT id, line_uid, auto_ake, allowed_codes FROM benten_members WHERE id = ? AND is_active = 1'
  ).bind(body.member_id).first<BentenMember>();
  if (!member) return c.json({ error: 'member not found' }, 404);

  // 権限: マスター・統括は全員 / 会員は自分のみ
  if (!canEditAll && member.line_uid !== auth.uid) return c.json({ error: 'forbidden' }, 403);

  let shiftTypeId: number | null = null;
  let triggersAke = false;

  if (!body.is_ake) {
    if (body.shift_type_id == null) return c.json({ error: 'shift_type_id required' }, 400);
    const type = await c.env.DB.prepare('SELECT id, code, triggers_ake FROM benten_shift_types WHERE id = ?')
      .bind(body.shift_type_id).first<{ id: number; code: string; triggers_ake: number }>();
    if (!type) return c.json({ error: 'shift type not found' }, 404);
    // 会員は入力可能種別の制限を受ける（マスター・統括は制限なし）
    if (!canEditAll && member.allowed_codes) {
      const allowed: string[] = JSON.parse(member.allowed_codes);
      if (allowed.length > 0 && !allowed.includes(type.code)) {
        return c.json({ error: 'この種別は入力できません' }, 403);
      }
    }
    shiftTypeId = type.id;
    triggersAke = type.triggers_ake === 1;
  }

  await c.env.DB.prepare(`
    INSERT INTO benten_shifts (member_id, date, shift_type_id, is_ake, input_by_uid, updated_at)
    VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(member_id, date) DO UPDATE SET
      shift_type_id = excluded.shift_type_id, is_ake = excluded.is_ake,
      input_by_uid = excluded.input_by_uid, updated_at = excluded.updated_at
  `).bind(body.member_id, body.date, shiftTypeId, body.is_ake ? 1 : 0, auth.uid).run();

  await logLineActivity(c.env.DB, auth.uid, 'liff', 'api', 'ベンテンシフト入力',
    `${body.date} member:${body.member_id}${body.is_ake ? ' 明け' : ''}`);

  // 明け自動設定: 会員のauto_ake × 種別のtriggers_ake。翌日が未入力のときだけ設定
  if (!body.is_ake && triggersAke && member.auto_ake === 1) {
    const next = addDays(body.date, 1);
    const existing = await c.env.DB.prepare(
      'SELECT member_id FROM benten_shifts WHERE member_id = ? AND date = ?'
    ).bind(body.member_id, next).first();
    if (!existing) {
      await c.env.DB.prepare(`
        INSERT INTO benten_shifts (member_id, date, shift_type_id, is_ake, input_by_uid, updated_at)
        VALUES (?, ?, NULL, 1, ?, datetime('now', 'localtime'))
      `).bind(body.member_id, next, auth.uid).run();
    }
  }

  return c.json({ ok: true });
});

// ===================================================
// API: シフト一括登録・更新（カレンダー入力タブ：スタンプ方式の一括保存）
// body: { member_id, entries: [{ date, shift_type_id | null, is_ake }] }
// shift_type_id=null & is_ake=false のエントリは「消去」＝DELETE扱い
// ===================================================
const BENTEN_BATCH_MAX = 62; // 2ヶ月分程度を上限に

app.put('/api/liff/benten/shifts/batch', async (c) => {
  const auth = await bentenAuth(c);
  if (!auth) return c.json({ error: 'forbidden' }, 403);
  const canEditAll = BENTEN_MASTER_ROLES.includes(auth.role);

  const body = await c.req.json<{
    member_id: number;
    entries: Array<{ date: string; shift_type_id: number | null; is_ake: boolean }>;
  }>();
  if (!body.member_id || !Array.isArray(body.entries)) return c.json({ error: 'bad request' }, 400);
  if (body.entries.length === 0) return c.json({ ok: true, saved: 0 });
  if (body.entries.length > BENTEN_BATCH_MAX) {
    return c.json({ error: `一度に保存できるのは${BENTEN_BATCH_MAX}件までです` }, 400);
  }
  for (const e of body.entries) {
    if (!DATE_RE.test(e.date ?? '')) return c.json({ error: 'bad request' }, 400);
  }

  const member = await c.env.DB.prepare(
    'SELECT id, line_uid, auto_ake, allowed_codes FROM benten_members WHERE id = ? AND is_active = 1'
  ).bind(body.member_id).first<BentenMember>();
  if (!member) return c.json({ error: 'member not found' }, 404);

  // 権限: マスター・統括は全員 / 会員は自分のみ
  if (!canEditAll && member.line_uid !== auth.uid) return c.json({ error: 'forbidden' }, 403);

  const typeRows = await c.env.DB.prepare('SELECT id, code, triggers_ake FROM benten_shift_types')
    .all<{ id: number; code: string; triggers_ake: number }>();
  const typeById = new Map((typeRows.results ?? []).map((t) => [t.id, t]));

  let allowedCodes: string[] | null = null;
  if (!canEditAll && member.allowed_codes) {
    const parsed: string[] = JSON.parse(member.allowed_codes);
    if (parsed.length > 0) allowedCodes = parsed;
  }

  const explicitDates = new Set(body.entries.map((e) => e.date));
  const stmts = [];

  for (const e of body.entries) {
    const isClear = !e.is_ake && e.shift_type_id == null;
    if (isClear) {
      stmts.push(c.env.DB.prepare('DELETE FROM benten_shifts WHERE member_id = ? AND date = ?').bind(body.member_id, e.date));
      continue;
    }
    let shiftTypeId: number | null = null;
    if (!e.is_ake) {
      const type = typeById.get(e.shift_type_id as number);
      if (!type) return c.json({ error: 'shift type not found' }, 404);
      // 会員は入力可能種別の制限を受ける（マスター・統括は制限なし）
      if (allowedCodes && !allowedCodes.includes(type.code)) {
        return c.json({ error: 'この種別は入力できません' }, 403);
      }
      shiftTypeId = type.id;
    }
    stmts.push(c.env.DB.prepare(`
      INSERT INTO benten_shifts (member_id, date, shift_type_id, is_ake, input_by_uid, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(member_id, date) DO UPDATE SET
        shift_type_id = excluded.shift_type_id, is_ake = excluded.is_ake,
        input_by_uid = excluded.input_by_uid, updated_at = excluded.updated_at
    `).bind(body.member_id, e.date, shiftTypeId, e.is_ake ? 1 : 0, auth.uid));
  }

  // 明け自動設定: 会員のauto_ake × 種別のtriggers_ake。
  // 翌日がこのバッチ内で明示操作されておらず、既存データも無い場合のみサーバー側で確定させる
  if (member.auto_ake === 1) {
    for (const e of body.entries) {
      if (e.is_ake || e.shift_type_id == null) continue;
      const type = typeById.get(e.shift_type_id);
      if (!type || type.triggers_ake !== 1) continue;
      const next = addDays(e.date, 1);
      if (explicitDates.has(next)) continue;
      const existing = await c.env.DB.prepare(
        'SELECT member_id FROM benten_shifts WHERE member_id = ? AND date = ?'
      ).bind(body.member_id, next).first();
      if (existing) continue;
      stmts.push(c.env.DB.prepare(`
        INSERT INTO benten_shifts (member_id, date, shift_type_id, is_ake, input_by_uid, updated_at)
        VALUES (?, ?, NULL, 1, ?, datetime('now', 'localtime'))
      `).bind(body.member_id, next, auth.uid));
    }
  }

  await c.env.DB.batch(stmts);

  await logLineActivity(c.env.DB, auth.uid, 'liff', 'api', 'ベンテンシフト一括入力',
    `${body.entries.length}件 member:${body.member_id}`);

  return c.json({ ok: true, saved: body.entries.length });
});

// ===================================================
// API: シフト削除（会員は自分のみ / マスター・統括は全員）
// ===================================================
app.delete('/api/liff/benten/shift', async (c) => {
  const auth = await bentenAuth(c);
  if (!auth) return c.json({ error: 'forbidden' }, 403);
  const canEditAll = BENTEN_MASTER_ROLES.includes(auth.role);

  const memberId = parseInt(c.req.query('member_id') ?? '');
  const date = c.req.query('date') ?? '';
  if (!memberId || !DATE_RE.test(date)) return c.json({ error: 'bad request' }, 400);

  const member = await c.env.DB.prepare('SELECT line_uid FROM benten_members WHERE id = ?')
    .bind(memberId).first<{ line_uid: string | null }>();
  if (!member) return c.json({ error: 'member not found' }, 404);
  if (!canEditAll && member.line_uid !== auth.uid) return c.json({ error: 'forbidden' }, 403);

  await c.env.DB.prepare('DELETE FROM benten_shifts WHERE member_id = ? AND date = ?')
    .bind(memberId, date).run();
  await logLineActivity(c.env.DB, auth.uid, 'liff', 'api', 'ベンテンシフト削除', `${date} member:${memberId}`);
  return c.json({ ok: true });
});

// ===================================================
// API: PDFリンク取得（LIFF内のPDFボタン用）
// ===================================================
app.get('/api/liff/benten/pdf-link', async (c) => {
  const auth = await bentenAuth(c);
  if (!auth) return c.json({ error: 'forbidden' }, 403);
  if (!bentenPdfAvailable(c.env)) return c.json({ error: 'PDF未設定（フォントが設定されていません）' }, 503);

  const range = await getActiveRange(c.env.DB);
  const from = c.req.query('from') && DATE_RE.test(c.req.query('from')!) ? c.req.query('from')! : range.start;
  const to = c.req.query('to') && DATE_RE.test(c.req.query('to')!) ? c.req.query('to')! : range.end;
  const token = await bentenPdfToken(from, to);
  return c.json({ url: `${BASE_URL}/liff/benten-pdf?from=${from}&to=${to}&t=${token}` });
});

// ===================================================
// LIFF ページ HTML
// ===================================================
function bentenShiftPage(liffId: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>ベンテンクラブ シフト</title>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { margin: 0; padding: 0; background: #f0f4f8; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; font-size: 15px; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: #6b7280; font-size: 14px; }
    .header { background: #1e3a5f; color: white; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; }
    .header h1 { margin: 0; font-size: 16px; font-weight: 700; }
    .header .sub { font-size: 11px; opacity: 0.8; }
    .tabs { display: flex; background: white; border-bottom: 1px solid #e5e7eb; }
    .tab { flex: 1; text-align: center; padding: 12px 8px; font-size: 14px; font-weight: 600; color: #6b7280; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid transparent; }
    .tab.active { color: #1e3a5f; border-bottom-color: #1e3a5f; }

    /* ===== カレンダー入力 ===== */
    #view-input { padding: 12px 12px 84px; max-width: 520px; margin: 0 auto; }
    .member-sel { margin-bottom: 10px; }
    .member-sel select { width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-size: 15px; background: white; -webkit-appearance: none; }

    /* 種別スタンプバー（上部・選択式） */
    .stamp-bar { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 10px 10px 12px; margin-bottom: 10px; }
    .stamp-info { font-size: 12px; color: #6b7280; margin-bottom: 8px; text-align: center; }
    .stamp-grid { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .stamp { border: 2px solid transparent; border-radius: 10px; padding: 10px 0; width: calc(25% - 6px); font-size: 14px; font-weight: 700; cursor: pointer; opacity: 0.55; }
    .stamp.active { opacity: 1; border-color: #1e3a5f; box-shadow: 0 0 0 2px rgba(30,58,95,0.15); }
    .stamp.ake { background: #e5e7eb; color: #374151; }
    .stamp.del { background: white; color: #991b1b; border-color: #fca5a5; opacity: 1; }
    .stamp.del.active { border-color: #991b1b; }
    #sheet .stamp { opacity: 1; }

    .cal-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .cal-nav button { border: 1px solid #d1d5db; background: white; border-radius: 8px; padding: 8px 18px; font-size: 16px; cursor: pointer; }
    .cal-nav .ym { font-size: 16px; font-weight: 700; color: #1e3a5f; }
    .cal { background: white; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden; }
    .cal-week { display: grid; grid-template-columns: repeat(7, 1fr); background: #f9fafb; border-bottom: 1px solid #f3f4f6; }
    .cal-week div { text-align: center; font-size: 11px; color: #6b7280; padding: 6px 0; font-weight: 600; }
    .cal-week div:first-child { color: #dc2626; }
    .cal-week div:last-child { color: #2563eb; }
    .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); }
    .cal-day { min-height: 52px; border-bottom: 1px solid #f3f4f6; border-right: 1px solid #f3f4f6; padding: 3px 2px; text-align: center; cursor: pointer; position: relative; }
    .cal-day.out { background: #fafafa; }
    .cal-day.sel { outline: 2px solid #1e3a5f; outline-offset: -2px; border-radius: 4px; z-index: 1; }
    .cal-day.dirty { outline: 2px dashed #d97706; outline-offset: -2px; border-radius: 4px; z-index: 1; }
    .cal-day.dirty::after { content: ''; position: absolute; top: 3px; right: 3px; width: 6px; height: 6px; border-radius: 50%; background: #d97706; }
    .cal-day .dnum { font-size: 12px; color: #374151; }
    .cal-day.sun .dnum { color: #dc2626; }
    .cal-day.sat .dnum { color: #2563eb; }
    .cal-day.out .dnum { color: #c4c8ce; }
    .chip { display: inline-block; margin-top: 2px; padding: 1px 5px; border-radius: 5px; font-size: 11px; font-weight: 700; min-width: 20px; }
    .chip.ake { background: #e5e7eb; color: #6b7280; }
    .chip.preview { opacity: 0.55; }

    /* 保存バー（下部固定） */
    .save-bar { position: fixed; left: 0; right: 0; bottom: 0; background: white; border-top: 1px solid #e5e7eb; box-shadow: 0 -4px 16px rgba(0,0,0,0.08); padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); z-index: 20; }
    .save-bar .save-btn { display: block; width: 100%; max-width: 520px; margin: 0 auto; border: none; border-radius: 10px; padding: 13px 0; font-size: 15px; font-weight: 700; color: white; background: #1e3a5f; cursor: pointer; }
    .save-bar .save-btn:disabled { background: #9ca3af; cursor: default; }

    /* ===== シフト表 ===== */
    #view-table { display: none; }
    .table-bar { display: flex; gap: 8px; padding: 10px 12px; align-items: center; background: white; border-bottom: 1px solid #e5e7eb; overflow-x: auto; }
    .table-bar button { border: 1px solid #d1d5db; background: white; border-radius: 8px; padding: 7px 12px; font-size: 13px; cursor: pointer; white-space: nowrap; color: #374151; }
    .table-bar .range-label { font-size: 12px; color: #6b7280; margin-left: auto; white-space: nowrap; }
    #table-wrap { overflow: auto; max-height: calc(100vh - 150px); background: white; }
    #shift-table { border-collapse: collapse; }
    #shift-table th, #shift-table td { border: 1px solid #e5e7eb; padding: 0; }
    #shift-table .g-head { color: white; font-size: var(--fs, 12px); font-weight: 700; padding: 3px 4px; text-align: center; }
    #shift-table .m-head { background: white; padding: 4px 2px; vertical-align: top; min-width: calc(var(--fs, 12px) * 2.2); }
    #shift-table .m-head.indoor { background: #fef9c3; }
    #shift-table .m-name { writing-mode: vertical-rl; text-orientation: upright; font-size: var(--fs, 12px); font-weight: 600; color: #1f2937; margin: 0 auto; letter-spacing: 1px; max-height: calc(var(--fs, 12px) * 8); overflow: hidden; }
    #shift-table .d-cell { background: white; font-size: calc(var(--fs, 12px) * 0.9); color: #374151; padding: 2px 6px; white-space: nowrap; position: sticky; left: 0; z-index: 2; border-right: 2px solid #d1d5db; }
    #shift-table tr.sat .d-cell { background: #dbeafe; }
    #shift-table tr.sun .d-cell { background: #fee2e2; }
    #shift-table thead th { position: sticky; z-index: 3; }
    #shift-table thead tr:first-child th { top: 0; }
    #shift-table .corner { background: #f9fafb; left: 0; z-index: 4 !important; }
    #shift-table .s-cell { text-align: center; font-size: var(--fs, 12px); font-weight: 700; min-width: calc(var(--fs, 12px) * 2.2); height: calc(var(--fs, 12px) * 1.9); cursor: pointer; }
    #shift-table .s-cell.editable:active { opacity: 0.6; }

    /* ボトムシート */
    #sheet-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 30; }
    #sheet { position: fixed; left: 0; right: 0; bottom: -100%; background: white; border-radius: 16px 16px 0 0; padding: 16px 16px calc(20px + env(safe-area-inset-bottom)); z-index: 31; transition: bottom 0.2s; max-width: 560px; margin: 0 auto; }
    #sheet.open { bottom: 0; }
    #sheet .sheet-title { font-size: 15px; font-weight: 700; color: #1e3a5f; margin-bottom: 12px; text-align: center; }
    #sheet .stamp-grid { margin-bottom: 4px; }

    .err-page { text-align: center; padding: 60px 24px; color: #6b7280; }
    .err-page .icon { font-size: 44px; margin-bottom: 12px; }
    .toast { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); background: #1e3a5f; color: white; padding: 9px 18px; border-radius: 20px; font-size: 13px; z-index: 50; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>
  <div id="loading">読み込み中...</div>
  <div id="app" style="display:none;">
    <div class="header">
      <div>
        <h1>ベンテンクラブ シフト</h1>
        <div class="sub" id="role-label"></div>
      </div>
    </div>
    <div class="tabs">
      <button class="tab active" id="tab-input" onclick="switchTab('input')">シフト入力</button>
      <button class="tab" id="tab-table" onclick="switchTab('table')">シフト表</button>
    </div>

    <!-- シフト入力（カレンダー） -->
    <div id="view-input">
      <div class="member-sel" id="member-sel-wrap" style="display:none;">
        <select id="member-sel" onchange="onMemberChange()"></select>
      </div>
      <div class="stamp-bar" id="stamp-bar">
        <div class="stamp-info" id="stamp-info">種別を選んで日付をタップしてください</div>
        <div class="stamp-grid" id="stamp-grid"></div>
      </div>
      <div class="cal-nav">
        <button onclick="moveMonth(-1)">‹</button>
        <div class="ym" id="cal-ym"></div>
        <button onclick="moveMonth(1)">›</button>
      </div>
      <div class="cal">
        <div class="cal-week"><div>日</div><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div></div>
        <div class="cal-grid" id="cal-grid"></div>
      </div>
    </div>
    <div class="save-bar" id="save-bar" style="display:none;">
      <button class="save-btn" id="save-btn" onclick="savePending()">保存</button>
    </div>

    <!-- シフト表 -->
    <div id="view-table">
      <div class="table-bar">
        <button onclick="setZoom(-10)">－</button>
        <button onclick="setZoom(10)">＋</button>
        <span id="zoom-label" style="font-size:12px;color:#6b7280;">100%</span>
        <button onclick="reloadShifts()">↻ 更新</button>
        <button id="pdf-btn" onclick="openPdf()" style="display:none;">📄 PDF</button>
        <span class="range-label" id="range-label"></span>
      </div>
      <div id="table-wrap"></div>
    </div>
  </div>

  <div id="err" style="display:none;" class="err-page">
    <div class="icon">🔒</div>
    <div id="err-msg">この機能を利用する権限がありません。</div>
  </div>

  <div id="sheet-overlay" onclick="closeSheet()"></div>
  <div id="sheet">
    <div class="sheet-title" id="sheet-title"></div>
    <div class="stamp-grid" id="sheet-grid"></div>
  </div>
  <div class="toast" id="toast"></div>

  <script>
  var AT = '';
  var BOOT = null;
  var SHIFTS = {};            // 'memberId:date' -> {t: shift_type_id|null, a: is_ake}
  var TYPE_BY_ID = {};
  var MEMBER_BY_ID = {};
  var ORDERED_MEMBERS = [];
  var targetMemberId = null;  // カレンダーで入力中の会員
  var calY = 0, calM = 0;     // 表示中の年月（Mは1-12）
  var lastTapDate = null;     // 直近タップ日（見た目のフォーカス表示用）
  var zoom = 100;
  var sheetCtx = null;        // {memberId, date}

  // ===== スタンプ方式・一括保存用の状態 =====
  var currentStamp = null;    // 上部バーで選択中の種別: shift_type_id | 'ake' | 'del' | null
  var pending = {};           // date -> {t, a} 未保存の編集（targetMemberId分のみ）
  var previewAke = {};        // date -> true（隔日勤務タップ翌日の「明け」プレビュー・保存対象外）

  liff.init({ liffId: ${JSON.stringify(liffId || 'LIFF_ID_NOT_SET')} })
    .then(function() {
      AT = liff.getAccessToken() || '';
      return api('/api/liff/benten/bootstrap');
    })
    .then(function(boot) {
      BOOT = boot;
      boot.shiftTypes.forEach(function(t) { TYPE_BY_ID[t.id] = t; });
      boot.members.forEach(function(m) { MEMBER_BY_ID[m.id] = m; });
      buildOrderedMembers();
      var today = jstToday();
      calY = parseInt(today.slice(0, 4)); calM = parseInt(today.slice(5, 7));
      lastTapDate = today;
      targetMemberId = boot.myMemberId || (boot.canEditAll && ORDERED_MEMBERS.length > 0 ? ORDERED_MEMBERS[0].id : null);
      setupMemberSelector();
      document.getElementById('role-label').textContent = roleLabel(boot.role);
      if (boot.pdfAvailable) document.getElementById('pdf-btn').style.display = '';
      document.getElementById('range-label').textContent = boot.range.start.slice(5).replace('-','/') + '〜' + boot.range.end.slice(5).replace('-','/');
      return reloadShifts();
    })
    .then(function() {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('app').style.display = 'block';
    })
    .catch(function(err) {
      document.getElementById('loading').style.display = 'none';
      var e = document.getElementById('err');
      e.style.display = 'block';
      if (err && err.status === 403) {
        document.getElementById('err-msg').textContent = 'この機能を利用する権限がありません。ベンテンクラブ会員登録がお済みでない方は、LINEで「ベンテン会員登録」と送信してください。';
      } else {
        document.getElementById('err-msg').textContent = 'エラー: ' + (err && err.message ? err.message : '読み込みに失敗しました');
      }
    });

  // ===== 共通 =====
  function api(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    opts.headers['Authorization'] = 'Bearer ' + AT;
    if (opts.body) opts.headers['Content-Type'] = 'application/json';
    return fetch(path, opts).then(function(res) {
      if (!res.ok) {
        return res.json().catch(function() { return {}; }).then(function(j) {
          var e = new Error(j.error || ('HTTP ' + res.status));
          e.status = res.status;
          throw e;
        });
      }
      return res.json();
    });
  }
  function jstToday() { return new Date(Date.now() + 9*3600*1000).toISOString().slice(0, 10); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function addDaysStr(d, n) {
    var dt = new Date(d + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + n);
    return dt.toISOString().slice(0, 10);
  }
  function dow(d) { return new Date(d + 'T00:00:00Z').getUTCDay(); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function roleLabel(r) {
    return r === 'general_manager' ? '統括管理者' : r === 'benten_shift_master' ? 'シフトマスター' : '会員';
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.className = 'toast show';
    setTimeout(function() { t.className = 'toast'; }, 1600);
  }
  function canEdit(memberId) {
    return BOOT.canEditAll || memberId === BOOT.myMemberId;
  }
  function buildOrderedMembers() {
    ORDERED_MEMBERS = [];
    BOOT.groups.forEach(function(g) {
      BOOT.members.forEach(function(m) { if (m.group_id === g.id) ORDERED_MEMBERS.push(m); });
    });
    BOOT.members.forEach(function(m) {
      if (!BOOT.groups.some(function(g) { return g.id === m.group_id; })) ORDERED_MEMBERS.push(m);
    });
  }

  // ===== データ読込 =====
  function fetchSpan() {
    // カレンダー表示月と表示期間の両方をカバーする範囲
    var mStart = calY + '-' + pad2(calM) + '-01';
    var nextY = calM === 12 ? calY + 1 : calY;
    var nextM = calM === 12 ? 1 : calM + 1;
    var mEnd = addDaysStr(nextY + '-' + pad2(nextM) + '-01', -1);
    var from = BOOT.range.start < mStart ? BOOT.range.start : mStart;
    var to = BOOT.range.end > mEnd ? BOOT.range.end : mEnd;
    return { from: from, to: to };
  }
  function reloadShifts() {
    var span = fetchSpan();
    return api('/api/liff/benten/shifts?from=' + span.from + '&to=' + span.to).then(function(rows) {
      SHIFTS = {};
      rows.forEach(function(s) { SHIFTS[s.member_id + ':' + s.date] = { t: s.shift_type_id, a: s.is_ake }; });
      recomputeAkePreview();
      renderCalendar();
      renderStampBar();
      renderTable();
      updateSaveBar();
    });
  }

  // ===== タブ =====
  function switchTab(tab) {
    if (tab === 'table' && !confirmDiscard()) return;
    if (tab === 'table') { pending = {}; previewAke = {}; renderCalendar(); }
    document.getElementById('tab-input').className = 'tab' + (tab === 'input' ? ' active' : '');
    document.getElementById('tab-table').className = 'tab' + (tab === 'table' ? ' active' : '');
    document.getElementById('view-input').style.display = tab === 'input' ? 'block' : 'none';
    document.getElementById('view-table').style.display = tab === 'table' ? 'block' : 'none';
    updateSaveBar();
  }

  // ===== メンバー選択（マスター・統括のみ） =====
  function setupMemberSelector() {
    if (!BOOT.canEditAll) return;
    var wrap = document.getElementById('member-sel-wrap');
    var sel = document.getElementById('member-sel');
    wrap.style.display = 'block';
    var html = '';
    ORDERED_MEMBERS.forEach(function(m) {
      var g = BOOT.groups.filter(function(gg) { return gg.id === m.group_id; })[0];
      html += '<option value="' + m.id + '"' + (m.id === targetMemberId ? ' selected' : '') + '>'
        + esc(m.name) + (g ? '（' + esc(g.name) + '）' : '') + '</option>';
    });
    sel.innerHTML = html;
  }
  function onMemberChange() {
    var sel = document.getElementById('member-sel');
    if (!confirmDiscard()) { sel.value = targetMemberId; return; }
    pending = {}; previewAke = {};
    targetMemberId = parseInt(sel.value);
    currentStamp = null;
    renderCalendar();
    renderStampBar();
    updateSaveBar();
  }

  // ===== 未保存編集の破棄確認 =====
  function hasPending() { return Object.keys(pending).length > 0; }
  function confirmDiscard() {
    if (!hasPending()) return true;
    return confirm('保存していない変更があります。破棄しますか？');
  }

  // ===== カレンダー =====
  function moveMonth(n) {
    if (!confirmDiscard()) return;
    pending = {}; previewAke = {};
    calM += n;
    if (calM < 1) { calM = 12; calY--; }
    if (calM > 12) { calM = 1; calY++; }
    reloadShifts();
  }
  function effectiveShift(memberId, date) {
    if (memberId === targetMemberId) {
      if (pending[date]) return pending[date];
      if (previewAke[date]) return { t: null, a: true };
    }
    return SHIFTS[memberId + ':' + date];
  }
  function chipHtml(memberId, date) {
    var s = effectiveShift(memberId, date);
    if (!s) return '';
    var isPreview = memberId === targetMemberId && !pending[date] && previewAke[date] ? ' preview' : '';
    if (s.a) return '<span class="chip ake' + isPreview + '">明</span>';
    var t = TYPE_BY_ID[s.t];
    if (!t) return '';
    return '<span class="chip' + isPreview + '" style="background:' + esc(t.color) + ';color:' + esc(t.text_color) + ';">' + esc(t.code) + '</span>';
  }
  function renderCalendar() {
    document.getElementById('cal-ym').textContent = calY + '年' + calM + '月';
    var first = calY + '-' + pad2(calM) + '-01';
    var startDow = dow(first);
    var gridStart = addDaysStr(first, -startDow);
    var html = '';
    for (var i = 0; i < 42; i++) {
      var d = addDaysStr(gridStart, i);
      var inMonth = d.slice(0, 7) === (calY + '-' + pad2(calM));
      var w = dow(d);
      var cls = 'cal-day' + (inMonth ? '' : ' out') + (d === lastTapDate ? ' sel' : '') + (pending[d] ? ' dirty' : '') + (w === 0 ? ' sun' : w === 6 ? ' sat' : '');
      html += '<div class="' + cls + '" onclick="tapDate(\\'' + d + '\\')">'
        + '<div class="dnum">' + parseInt(d.slice(8)) + '</div>'
        + (targetMemberId ? chipHtml(targetMemberId, d) : '')
        + '</div>';
    }
    document.getElementById('cal-grid').innerHTML = html;
  }
  function sameShift(a, b) { return a.t === b.t && !!a.a === !!b.a; }
  function tapDate(d) {
    var inMonth = d.slice(0, 7) === (calY + '-' + pad2(calM));
    if (!inMonth) {
      if (!confirmDiscard()) return;
      pending = {}; previewAke = {};
      calY = parseInt(d.slice(0, 4)); calM = parseInt(d.slice(5, 7));
      reloadShifts();
      return;
    }
    if (!targetMemberId || !canEdit(targetMemberId)) return;
    if (currentStamp === null) { toast('まず上のバーで種別を選んでください'); return; }

    lastTapDate = d;
    var val = currentStamp === 'del' ? { t: null, a: false }
      : currentStamp === 'ake' ? { t: null, a: true }
      : { t: currentStamp, a: false };
    var saved = SHIFTS[targetMemberId + ':' + d];
    var savedVal = saved ? { t: saved.t, a: saved.a } : { t: null, a: false };
    if (sameShift(val, savedVal)) {
      delete pending[d];
    } else {
      pending[d] = val;
    }
    recomputeAkePreview();
    renderCalendar();
    updateSaveBar();
  }

  // ===== 明けカスケードのプレビュー（表示のみ・確定計算はサーバー側で再判定） =====
  function recomputeAkePreview() {
    previewAke = {};
    if (!targetMemberId) return;
    var m = MEMBER_BY_ID[targetMemberId];
    if (!m || m.auto_ake !== 1) return;
    Object.keys(pending).forEach(function(d) {
      var v = pending[d];
      if (v.a || v.t == null) return;
      var type = TYPE_BY_ID[v.t];
      if (!type || type.triggers_ake !== 1) return;
      var next = addDaysStr(d, 1);
      if (pending[next]) return; // 翌日を明示操作済みなら上書きしない
      if (SHIFTS[targetMemberId + ':' + next]) return; // 翌日に既存データがあれば上書きしない
      previewAke[next] = true;
    });
  }

  // ===== スタンプバー（種別選択） =====
  function typesForMember(memberId) {
    var m = MEMBER_BY_ID[memberId];
    var list = BOOT.shiftTypes;
    if (m && m.allowed_codes && !BOOT.canEditAll) {
      try {
        var allowed = JSON.parse(m.allowed_codes);
        if (allowed && allowed.length > 0) {
          list = list.filter(function(t) { return allowed.indexOf(t.code) >= 0; });
        }
      } catch (e) {}
    }
    return list;
  }
  function stampButtons(memberId, onclickName, activeVal) {
    var html = '';
    typesForMember(memberId).forEach(function(t) {
      var active = activeVal !== undefined && activeVal !== null && String(activeVal) === String(t.id);
      html += '<button class="stamp' + (active ? ' active' : '') + '" style="background:' + esc(t.color) + ';color:' + esc(t.text_color) + ';" onclick="' + onclickName + '(' + t.id + ')">' + esc(t.label) + '</button>';
    });
    html += '<button class="stamp ake' + (activeVal === 'ake' ? ' active' : '') + '" onclick="' + onclickName + '(\\'ake\\')">明け</button>';
    html += '<button class="stamp del' + (activeVal === 'del' ? ' active' : '') + '" onclick="' + onclickName + '(\\'del\\')">消</button>';
    return html;
  }
  function renderStampBar() {
    var info = document.getElementById('stamp-info');
    var grid = document.getElementById('stamp-grid');
    if (!targetMemberId) {
      info.textContent = 'シフト入力する会員が未設定です。管理者にお問い合わせください。';
      grid.innerHTML = '';
      return;
    }
    if (!canEdit(targetMemberId)) {
      info.textContent = '閲覧のみ（自分のシフトのみ入力できます）';
      grid.innerHTML = '';
      return;
    }
    info.textContent = '種別を選んで日付をタップしてください';
    grid.innerHTML = stampButtons(targetMemberId, 'selectStamp', currentStamp);
  }
  function selectStamp(v) {
    currentStamp = (currentStamp !== null && String(currentStamp) === String(v)) ? null : v;
    renderStampBar();
  }

  // ===== 一括保存 =====
  function updateSaveBar() {
    var bar = document.getElementById('save-bar');
    var btn = document.getElementById('save-btn');
    var n = Object.keys(pending).length;
    var onInputTab = document.getElementById('view-input').style.display !== 'none';
    bar.style.display = (onInputTab && n > 0) ? 'block' : 'none';
    btn.textContent = n > 0 ? '保存（' + n + '件）' : '保存';
  }
  function savePending() {
    var entries = Object.keys(pending).map(function(d) {
      var v = pending[d];
      return { date: d, shift_type_id: v.t, is_ake: !!v.a };
    });
    if (entries.length === 0) return;
    var btn = document.getElementById('save-btn');
    btn.disabled = true;
    api('/api/liff/benten/shifts/batch', {
      method: 'PUT',
      body: JSON.stringify({ member_id: targetMemberId, entries: entries }),
    }).then(function(r) {
      pending = {}; previewAke = {};
      toast('保存しました（' + (r && r.saved != null ? r.saved : entries.length) + '件）');
      return reloadShifts();
    }).then(function() {
      btn.disabled = false;
    }).catch(function(e) {
      btn.disabled = false;
      updateSaveBar();
      toast(e.message || '保存に失敗しました');
    });
  }

  // ===== 単発保存（シフト表タブのボトムシート用） =====
  function saveShift(memberId, date, v) {
    var p;
    if (v === 'del') {
      p = api('/api/liff/benten/shift?member_id=' + memberId + '&date=' + date, { method: 'DELETE' });
    } else {
      p = api('/api/liff/benten/shift', {
        method: 'PUT',
        body: JSON.stringify({
          member_id: memberId, date: date,
          shift_type_id: v === 'ake' ? null : v,
          is_ake: v === 'ake',
        }),
      });
    }
    return p.then(function() {
      return reloadShifts();
    }).catch(function(e) {
      toast(e.message || '保存に失敗しました');
    });
  }

  // ===== シフト表 =====
  function setZoom(n) {
    zoom = Math.max(40, Math.min(200, zoom + n));
    document.getElementById('zoom-label').textContent = zoom + '%';
    document.getElementById('table-wrap').style.setProperty('--fs', (12 * zoom / 100) + 'px');
  }
  function renderTable() {
    var wrap = document.getElementById('table-wrap');
    wrap.style.setProperty('--fs', (12 * zoom / 100) + 'px');
    if (ORDERED_MEMBERS.length === 0) {
      wrap.innerHTML = '<div style="padding:32px;text-align:center;color:#9ca3af;">会員が登録されていません</div>';
      return;
    }
    var html = '<table id="shift-table"><thead>';
    // グループ行
    html += '<tr><th class="corner" rowspan="2" style="top:0;"></th>';
    BOOT.groups.forEach(function(g) {
      var cnt = ORDERED_MEMBERS.filter(function(m) { return m.group_id === g.id; }).length;
      if (cnt > 0) html += '<th class="g-head" colspan="' + cnt + '" style="background:' + esc(g.color) + ';">' + esc(g.name) + '</th>';
    });
    var noGroup = ORDERED_MEMBERS.filter(function(m) { return !BOOT.groups.some(function(g) { return g.id === m.group_id; }); }).length;
    if (noGroup > 0) html += '<th class="g-head" colspan="' + noGroup + '" style="background:#6b7280;">未所属</th>';
    html += '</tr><tr>';
    ORDERED_MEMBERS.forEach(function(m) {
      html += '<th class="m-head' + (m.is_indoor ? ' indoor' : '') + '" style="top:calc(var(--fs,12px) * 1.9);"><div class="m-name">' + esc(m.name.replace(/[\\s　]/g, '').slice(0, 6)) + '</div></th>';
    });
    html += '</tr></thead><tbody>';
    for (var d = BOOT.range.start; d <= BOOT.range.end; d = addDaysStr(d, 1)) {
      var w = dow(d);
      html += '<tr class="' + (w === 0 ? 'sun' : w === 6 ? 'sat' : '') + '">';
      html += '<td class="d-cell">' + d.slice(5).replace('-', '/') + '(' + '日月火水木金土'[w] + ')</td>';
      ORDERED_MEMBERS.forEach(function(m) {
        var s = SHIFTS[m.id + ':' + d];
        var style = '', txt = '';
        if (s) {
          if (s.a) { style = 'background:#f3f4f6;color:#9ca3af;'; txt = '明'; }
          else {
            var t = TYPE_BY_ID[s.t];
            if (t) { style = 'background:' + esc(t.color) + ';color:' + esc(t.text_color) + ';'; txt = esc(t.code); }
          }
        }
        var editable = canEdit(m.id);
        html += '<td class="s-cell' + (editable ? ' editable' : '') + '" style="' + style + '"'
          + (editable ? ' onclick="openSheet(' + m.id + ',\\'' + d + '\\')"' : '') + '>' + txt + '</td>';
      });
      html += '</tr>';
    }
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  // ===== ボトムシート（シフト表のインライン編集） =====
  function openSheet(memberId, date) {
    sheetCtx = { memberId: memberId, date: date };
    var m = MEMBER_BY_ID[memberId];
    document.getElementById('sheet-title').textContent =
      (m ? m.name : '') + '　' + date.slice(5).replace('-', '/') + '（' + '日月火水木金土'[dow(date)] + '）';
    document.getElementById('sheet-grid').innerHTML = stampButtons(memberId, 'sheetInput');
    document.getElementById('sheet-overlay').style.display = 'block';
    document.getElementById('sheet').className = 'open';
  }
  function closeSheet() {
    document.getElementById('sheet-overlay').style.display = 'none';
    document.getElementById('sheet').className = '';
    sheetCtx = null;
  }
  function sheetInput(v) {
    if (!sheetCtx) return;
    var ctx = sheetCtx;
    closeSheet();
    saveShift(ctx.memberId, ctx.date, v);
  }

  // ===== PDF =====
  function openPdf() {
    api('/api/liff/benten/pdf-link').then(function(r) {
      if (liff.isInClient()) { liff.openWindow({ url: r.url, external: true }); }
      else { window.open(r.url, '_blank'); }
    }).catch(function(e) { toast(e.message || 'PDFを開けませんでした'); });
  }
  </script>
</body>
</html>`;
}

export default app;
