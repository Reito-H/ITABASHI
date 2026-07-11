// ベンテンクラブ シフト 共通ロジック
// 権限判定・表示期間・PDF生成・日次LINE送信
// 権限: benten_member=自分のみ / benten_shift_master・general_manager=全員編集可
//       operations_manager 以下はアクセス不可（サーバー側で403）

import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Env } from './auth';
import { SECRET } from './config';

export const BENTEN_VIEW_ROLES = ['benten_member', 'benten_shift_master', 'general_manager'];
export const BENTEN_MASTER_ROLES = ['benten_shift_master', 'general_manager'];

export const BASE_URL = 'https://bentenclub.com';

// ===================================================
// 型
// ===================================================

export type BentenGroup = { id: number; name: string; color: string; display_order: number };
export type BentenShiftType = {
  id: number; code: string; label: string; color: string; text_color: string;
  is_absent: number; triggers_ake: number; display_order: number;
};
export type BentenMember = {
  id: number; line_uid: string | null; name: string; group_id: number | null;
  is_indoor: number; auto_ake: number; display_order: number;
  allowed_codes: string | null; is_active: number;
};
export type BentenShift = {
  member_id: number; date: string; shift_type_id: number | null; is_ake: number;
};

// ===================================================
// 日付ユーティリティ（JST）
// ===================================================

export function todayJST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

export function weekdayJa(dateStr: string): string {
  return WEEKDAY_JA[new Date(dateStr + 'T00:00:00Z').getUTCDay()];
}

export function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T00:00:00Z').getUTCDay();
}

// ===================================================
// 設定・表示期間
// ===================================================

export async function getBentenConfig(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare('SELECT value FROM benten_config WHERE key = ?')
    .bind(key).first<{ value: string | null }>();
  return row?.value ?? null;
}

export async function setBentenConfig(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare(`
    INSERT INTO benten_config (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(key, value).run();
}

// 最新の表示期間（なければ今日から45日間）
export async function getActiveRange(db: D1Database): Promise<{ start: string; end: string; label: string }> {
  const row = await db.prepare(
    'SELECT label, start_date, end_date FROM benten_schedule_ranges ORDER BY created_at DESC, id DESC LIMIT 1'
  ).first<{ label: string; start_date: string; end_date: string }>();
  if (row) return { start: row.start_date, end: row.end_date, label: row.label };
  const today = todayJST();
  return { start: today, end: addDays(today, 45), label: 'シフト表' };
}

// ===================================================
// LIFF認証（liff.ts と同方式）
// ===================================================

export async function bentenUidFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const res = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json<{ userId?: string }>();
  return data.userId ?? null;
}

// role確認。BENTEN_VIEW_ROLES 以外（運行管理者・車番管理者・新人・不明）は null を返す
export async function bentenRoleFromUid(db: D1Database, uid: string): Promise<string | null> {
  const row = await db.prepare('SELECT role FROM line_liff_users WHERE line_uid = ?')
    .bind(uid).first<{ role: string }>();
  if (!row || !BENTEN_VIEW_ROLES.includes(row.role)) return null;
  return row.role;
}

// ===================================================
// 会員の自動紐付け（LINE登録時）
// 1. 既にline_uid連携済みならそのまま
// 2. 同名・未連携の会員がいれば紐付け
// 3. いなければ新規会員として作成
// ===================================================

export async function linkBentenMember(db: D1Database, lineUid: string, name: string): Promise<number> {
  const existing = await db.prepare('SELECT id FROM benten_members WHERE line_uid = ?')
    .bind(lineUid).first<{ id: number }>();
  if (existing) return existing.id;

  const byName = await db.prepare(
    'SELECT id FROM benten_members WHERE name = ? AND line_uid IS NULL AND is_active = 1 ORDER BY id LIMIT 1'
  ).bind(name).first<{ id: number }>();
  if (byName) {
    await db.prepare(
      "UPDATE benten_members SET line_uid = ?, updated_at = datetime('now', 'localtime') WHERE id = ?"
    ).bind(lineUid, byName.id).run();
    return byName.id;
  }

  const res = await db.prepare(`
    INSERT INTO benten_members (line_uid, name, display_order)
    VALUES (?, ?, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM benten_members))
  `).bind(lineUid, name).run();
  return Number(res.meta.last_row_id);
}

// ===================================================
// PDF リンク用トークン（グループに貼る公開URLを推測不能にする）
// ===================================================

export async function bentenPdfToken(from: string, to: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(`benten-pdf:${from}:${to}`));
  return Array.from(new Uint8Array(sig)).slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ===================================================
// PDF生成（pdf-lib / A4横）
// フォント: R2の NotoSansJP-Regular.ttf → BENTEN_FONT_URL の順で取得
// ===================================================

export function bentenPdfAvailable(env: Env): boolean {
  return !!(env.BENTEN_FONTS || env.BENTEN_FONT_URL);
}

async function loadBentenFont(env: Env): Promise<ArrayBuffer | null> {
  if (env.BENTEN_FONTS) {
    const obj = await env.BENTEN_FONTS.get('NotoSansJP-Regular.ttf');
    if (obj) return obj.arrayBuffer();
  }
  if (env.BENTEN_FONT_URL) {
    const cache = caches.default;
    const cacheKey = new Request(env.BENTEN_FONT_URL);
    let res = await cache.match(cacheKey);
    if (!res) {
      // リダイレクトするURL（github.com等）でも取得できるよう明示的にfollow
      res = await fetch(env.BENTEN_FONT_URL, { redirect: 'follow' });
      if (!res.ok) return null;
      try {
        const toCache = new Response(res.clone().body, { status: 200, headers: { 'Cache-Control': 'public, max-age=86400' } });
        await cache.put(cacheKey, toCache);
      } catch { /* キャッシュ失敗は無視（毎回fetchになるだけ） */ }
    }
    return res.arrayBuffer();
  }
  return null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0.5, g: 0.5, b: 0.5 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

export async function generateBentenPdf(env: Env, from: string, to: string): Promise<Uint8Array | null> {
  const fontBytes = await loadBentenFont(env);
  if (!fontBytes) return null;

  const db = env.DB;
  const [groupsRes, typesRes, membersRes, shiftsRes] = await Promise.all([
    db.prepare('SELECT * FROM benten_groups ORDER BY display_order, id').all<BentenGroup>(),
    db.prepare('SELECT * FROM benten_shift_types ORDER BY display_order, id').all<BentenShiftType>(),
    db.prepare('SELECT * FROM benten_members WHERE is_active = 1 ORDER BY display_order, id').all<BentenMember>(),
    db.prepare('SELECT member_id, date, shift_type_id, is_ake FROM benten_shifts WHERE date >= ? AND date <= ?')
      .bind(from, to).all<BentenShift>(),
  ]);
  const groups = groupsRes.results ?? [];
  const types = typesRes.results ?? [];
  const allMembers = membersRes.results ?? [];
  const shifts = shiftsRes.results ?? [];

  // グループ順に会員を並べる（未所属は末尾）
  const orderedMembers: BentenMember[] = [];
  for (const g of groups) orderedMembers.push(...allMembers.filter(m => m.group_id === g.id));
  orderedMembers.push(...allMembers.filter(m => !groups.some(g => g.id === m.group_id)));

  const typeById = new Map(types.map(t => [t.id, t]));
  const shiftMap = new Map(shifts.map(s => [`${s.member_id}:${s.date}`, s]));

  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  // subset:true はCJKフォントでグリフ欠けが起きるため全体埋め込み（軽量な日本語TTF推奨）
  const font = await pdf.embedFont(fontBytes, { subset: false });

  // A4横
  const PW = 841.89, PH = 595.28, M = 24;
  const titleH = 22, groupRowH = 16, nameRowH = 60, rowH = 14;
  const dateColW = 58;
  const memberColW = orderedMembers.length > 0
    ? Math.min(26, (PW - M * 2 - dateColW) / orderedMembers.length)
    : 26; // 会員0人でも日付だけの空シフト表を生成する
  const headerH = groupRowH + nameRowH;
  const rowsPerPage = Math.floor((PH - M * 2 - titleH - headerH) / rowH);

  const gray = rgb(0.85, 0.85, 0.85);
  const black = rgb(0.1, 0.1, 0.1);

  const drawCellText = (page: import('pdf-lib').PDFPage, s: string, x: number, y: number, w: number, size: number, color = black) => {
    const tw = font.widthOfTextAtSize(s, size);
    page.drawText(s, { x: x + (w - tw) / 2, y, size, font, color });
  };

  for (let pageIdx = 0; pageIdx * rowsPerPage < dates.length; pageIdx++) {
    const page = pdf.addPage([PW, PH]);
    const pageDates = dates.slice(pageIdx * rowsPerPage, (pageIdx + 1) * rowsPerPage);
    let y = PH - M;

    // タイトル
    const title = `ベンテンクラブ シフト表（${from.slice(5).replace('-', '/')}〜${to.slice(5).replace('-', '/')}）`;
    page.drawText(title, { x: M, y: y - 14, size: 12, font, color: black });
    y -= titleH;

    // グループヘッダー行
    let x = M + dateColW;
    page.drawRectangle({ x: M, y: y - headerH, width: dateColW, height: headerH, borderColor: gray, borderWidth: 0.5 });
    drawCellText(page, '日付', M, y - headerH / 2 - 3, dateColW, 8);
    for (const g of [...groups, null]) {
      const gm = g ? orderedMembers.filter(m => m.group_id === g.id)
                   : orderedMembers.filter(m => !groups.some(gg => gg.id === m.group_id));
      if (gm.length === 0) continue;
      const w = gm.length * memberColW;
      const gc = hexToRgb(g?.color ?? '#6b7280');
      page.drawRectangle({ x, y: y - groupRowH, width: w, height: groupRowH, color: rgb(gc.r, gc.g, gc.b), borderColor: gray, borderWidth: 0.5 });
      const gname = g?.name ?? '';
      if (gname) drawCellText(page, gname, x, y - groupRowH + 4, w, 8, rgb(1, 1, 1));
      // 会員名（縦書き風: 1文字ずつ縦に）
      for (let i = 0; i < gm.length; i++) {
        const mx = x + i * memberColW;
        const indoor = gm[i].is_indoor === 1;
        page.drawRectangle({
          x: mx, y: y - headerH, width: memberColW, height: nameRowH,
          color: indoor ? rgb(0.996, 0.976, 0.765) : undefined,
          borderColor: gray, borderWidth: 0.5,
        });
        const chars = gm[i].name.replace(/[\s　]/g, '').split('').slice(0, 6);
        const fs = 7;
        chars.forEach((ch, ci) => {
          drawCellText(page, ch, mx, y - groupRowH - 10 - ci * (fs + 1.5), memberColW, fs);
        });
      }
      x += w;
    }
    y -= headerH;

    // 日付行
    for (const d of pageDates) {
      const dow = dayOfWeek(d);
      const dateBg = dow === 0 ? rgb(0.99, 0.9, 0.9) : dow === 6 ? rgb(0.88, 0.93, 0.99) : undefined;
      page.drawRectangle({ x: M, y: y - rowH, width: dateColW, height: rowH, color: dateBg, borderColor: gray, borderWidth: 0.5 });
      drawCellText(page, `${d.slice(5).replace('-', '/')}(${weekdayJa(d)})`, M, y - rowH + 4, dateColW, 7);

      let cx = M + dateColW;
      for (const m of orderedMembers) {
        const s = shiftMap.get(`${m.id}:${d}`);
        const t = s && !s.is_ake && s.shift_type_id != null ? typeById.get(s.shift_type_id) : undefined;
        if (t) {
          const bc = hexToRgb(t.color);
          page.drawRectangle({ x: cx, y: y - rowH, width: memberColW, height: rowH, color: rgb(bc.r, bc.g, bc.b), borderColor: gray, borderWidth: 0.5 });
          const tc = hexToRgb(t.text_color);
          drawCellText(page, t.code, cx, y - rowH + 4, memberColW, 7, rgb(tc.r, tc.g, tc.b));
        } else {
          // 明け・未入力は空欄
          page.drawRectangle({ x: cx, y: y - rowH, width: memberColW, height: rowH, borderColor: gray, borderWidth: 0.5 });
        }
        cx += memberColW;
      }
      y -= rowH;
    }
  }

  return pdf.save();
}

// ===================================================
// 日次LINE送信（cron・手動テスト共用）
// 当日出勤者コメント + シフト表リンクをベンテンLINEグループへ
// ===================================================

async function pushToGroup(env: Env, groupId: string, messages: object[]): Promise<void> {
  const at = env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!at) return;
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${at}` },
    body: JSON.stringify({ to: groupId, messages }),
  });
}

export async function sendBentenDaily(env: Env): Promise<string> {
  const groupId = (await getBentenConfig(env.DB, 'line_group_id')) ?? env.BENTEN_LINE_GROUP_ID ?? '';
  if (!groupId) return 'LINEグループ未設定のため送信しませんでした。グループ内で「ベンテングループ登録」を送信してください。';

  const today = todayJST();

  // 当日出勤者（明け・休み種別を除く）
  const attendees = await env.DB.prepare(`
    SELECT m.name
    FROM benten_shifts s
    JOIN benten_members m ON m.id = s.member_id
    JOIN benten_shift_types t ON t.id = s.shift_type_id
    WHERE s.date = ? AND s.is_ake = 0 AND t.is_absent = 0 AND m.is_active = 1
    ORDER BY m.display_order, m.id
  `).bind(today).all<{ name: string }>();

  const names = (attendees.results ?? []).map(r => r.name);
  const md = `${parseInt(today.slice(5, 7))}月${parseInt(today.slice(8, 10))}日（${weekdayJa(today)}）`;
  const msg1 = names.length > 0
    ? `📋 ${md} 本日出勤\n${names.join('、')}`
    : `📋 ${md} 本日出勤\n出勤者なし`;

  const messages: object[] = [{ type: 'text', text: msg1 }];

  // シフト表リンク（PDF範囲は翌日〜期間末尾）
  const range = await getActiveRange(env.DB);
  const from = addDays(today, 1) > range.end ? range.start : addDays(today, 1);
  const lines: string[] = [];
  if (bentenPdfAvailable(env)) {
    const token = await bentenPdfToken(from, range.end);
    lines.push(`📄 シフト表PDF（${from.slice(5).replace('-', '/')}〜）\n${BASE_URL}/liff/benten-pdf?from=${from}&to=${range.end}&t=${token}`);
  }
  if (env.LIFF_ID_BENTEN_SHIFT) {
    lines.push(`📱 シフト入力・確認\nhttps://liff.line.me/${env.LIFF_ID_BENTEN_SHIFT}`);
  }
  if (lines.length > 0) messages.push({ type: 'text', text: lines.join('\n\n') });

  await pushToGroup(env, groupId, messages);
  return `送信しました（出勤者 ${names.length}名）`;
}
