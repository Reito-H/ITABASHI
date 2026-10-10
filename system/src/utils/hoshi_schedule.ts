// 星専用 引き継ぎシートの「シフト・予定」カレンダー（月度単位）のデータ取得とPDF生成。
// 管理画面（/handover/hoshi）・LINEのその他機能LIFF・両方のPDF出力で同じデータを使うため共通化している。
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Env } from '../auth';
import { getPeriod, getPeriodRange, getPeriodSettings } from '../auth';
import { loadBentenFont } from '../liff_common';

// 班長シフト名簿（kancho_members, section='main'）上の登録名。月度ごとに別レコードになっているため名前で引く
export const HOSHI_MEMBER_NAME = '星';

export type HoshiDay = {
  date: string; code: string; locked: boolean;
  dg: boolean;          // 斜め直
  ws: boolean;          // 希望休の反映（赤文字）
  cl: string | null;    // セル色（記号なしの色マス＝早日勤）
  memo: string; workTime: string;
};
export type HoshiCalendar = {
  year: number; month: number; start: string; end: string; today: string;
  days: HoshiDay[];
  types: { code: string; label: string; color: string }[];
  hasMember: boolean;
};

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().split('T')[0];
}
export function todayJst(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0];
}

// year/monthが不正・未指定なら今日が属する月度
export async function loadHoshiCalendar(db: D1Database, yearIn?: number, monthIn?: number): Promise<HoshiCalendar> {
  let year = yearIn ?? NaN, month = monthIn ?? NaN;
  if (!(year >= 2000 && year <= 2100 && month >= 1 && month <= 12)) {
    ({ year, month } = getPeriod(todayJst()));
  }
  const periodCfg = await getPeriodSettings(db);
  const { start, end } = getPeriodRange(year, month, periodCfg);

  const [shifts, memos, types, member, workTimes] = await Promise.all([
    // 名簿は月度ごとに別レコードのため名前で突き合わせる（各日のシフトはその月度のレコードに付いている）
    db.prepare(`
      SELECT s.date, s.code, s.is_locked, s.is_diagonal, s.is_wish, s.cell_color FROM kancho_shifts s
      JOIN kancho_members m ON m.id = s.member_id
      WHERE m.name = ? AND m.section = 'main' AND s.date BETWEEN ? AND ?
      ORDER BY m.year, m.month
    `).bind(HOSHI_MEMBER_NAME, start, end).all<{ date: string; code: string; is_locked: number; is_diagonal: number; is_wish: number; cell_color: string | null }>(),
    db.prepare('SELECT date, content FROM hoshi_day_memos WHERE date BETWEEN ? AND ?')
      .bind(start, end).all<{ date: string; content: string }>(),
    db.prepare(`
      SELECT code, label, color, use_team_color FROM kancho_shift_types
      WHERE year = ? AND month = ? AND section IN ('main','all') AND is_active = 1
      ORDER BY sort_order, id
    `).bind(year, month).all<{ code: string; label: string; color: string; use_team_color: number }>(),
    db.prepare(`SELECT id, team_color FROM kancho_members WHERE name = ? AND section = 'main' AND year = ? AND month = ? LIMIT 1`)
      .bind(HOSHI_MEMBER_NAME, year, month).first<{ id: number; team_color: string | null }>(),
    db.prepare('SELECT date, start_time FROM hoshi_work_times WHERE date BETWEEN ? AND ?')
      .bind(start, end).all<{ date: string; start_time: string }>(),
  ]);

  const shiftMap = new Map((shifts.results ?? []).map(r => [r.date, r]));
  const memoMap = new Map((memos.results ?? []).map(r => [r.date, r.content]));
  const timeMap = new Map((workTimes.results ?? []).map(r => [r.date, r.start_time]));

  // 表示は班長シフト画面と同じルールにする（セル色が最優先・希望休は赤文字・斜め直は斜体）
  const days: HoshiDay[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const sh = shiftMap.get(d);
    days.push({
      date: d, code: sh?.code ?? '', locked: sh?.is_locked === 1,
      dg: sh?.is_diagonal === 1, ws: sh?.is_wish === 1, cl: sh?.cell_color ?? null,
      memo: memoMap.get(d) ?? '', workTime: timeMap.get(d) ?? '',
    });
  }
  const teamColor = member?.team_color || null;
  const shiftTypes = (types.results ?? []).map(t => ({
    code: t.code, label: t.label,
    color: t.use_team_color && teamColor ? teamColor : t.color,
  }));
  return { year, month, start, end, today: todayJst(), days, types: shiftTypes, hasMember: !!member };
}

// ===== 保存処理（管理画面とLINE(LIFF)の両方から使う） =====
export type SaveResult = { ok: true } | { ok: false; status: 400 | 404 | 409; error: string };

// 星のシフト変更 → 班長シフト（kancho_shifts）にそのまま書き込む。
// 班長シフト画面の一括保存（admin_kancho.ts /api/kancho/shifts/batch）と同じルールに合わせる:
// 確定（ロック）済みのセルは変更不可・希望休/セル色は維持・完全に空なら行削除・編集履歴を残す。
// 斜め（斜め直）は「直」のときだけ付けられ、直以外を選んだら自動で外す
// （以前は記号だけ書き換えて斜めが残り、班長シフト側で「公」が斜体表示される不具合があった）。
// editor.logName は班長シフトの編集履歴に出す名前（例:「itabashi2（星引き継ぎシート）」「山田（LINE 星）」）
export async function saveHoshiShift(
  db: D1Database, date: string, codeIn: string, diagonal: boolean,
  editor: { adminId: number | null; by: string; logName: string },
): Promise<SaveResult> {
  const code = codeIn.trim().slice(0, 10);
  const dg = code === '直' && diagonal ? 1 : 0;

  // この日が属する月度の「星」の名簿レコードを探す（名簿は月度ごとに別レコード）
  const periodCfg = await getPeriodSettings(db);
  const p = getPeriod(date);
  const candidates = [-1, 0, 1].map(delta => {
    const idx = p.year * 12 + (p.month - 1) + delta;
    return { year: Math.floor(idx / 12), month: idx % 12 + 1 };
  });
  const target = candidates.find(ym => {
    const r = getPeriodRange(ym.year, ym.month, periodCfg);
    return date >= r.start && date <= r.end;
  }) ?? p;
  const member = await db.prepare(
    `SELECT id FROM kancho_members WHERE name = ? AND section = 'main' AND year = ? AND month = ? LIMIT 1`
  ).bind(HOSHI_MEMBER_NAME, target.year, target.month).first<{ id: number }>();
  if (!member) return { ok: false, status: 404, error: `班長シフトに${target.month}月度の「${HOSHI_MEMBER_NAME}」の行がありません。先に班長シフトでその月度を開いてください` };

  const old = await db.prepare(
    'SELECT code, is_diagonal, is_wish, cell_color, is_locked FROM kancho_shifts WHERE member_id = ? AND date = ?'
  ).bind(member.id, date).first<{ code: string; is_diagonal: number; is_wish: number; cell_color: string | null; is_locked: number }>();
  if (old?.is_locked === 1) return { ok: false, status: 409, error: '班長シフトで確定済みの日です。変更は班長シフト画面で確定を外してから行ってください' };
  if ((old?.code ?? '') === code && (old?.is_diagonal ?? 0) === dg) return { ok: true };

  const ws = old?.is_wish ?? 0;
  const cl = old?.cell_color ?? null;
  const label = (cd: string, d: number) => `${cd}${d ? '(斜め)' : ''}${ws ? '(希望休)' : ''}${cl ? `[${cl}]` : ''}`;
  const stmts: D1PreparedStatement[] = [];
  if (!code && !dg && !ws && !cl) {
    stmts.push(db.prepare('DELETE FROM kancho_shifts WHERE member_id = ? AND date = ?').bind(member.id, date));
  } else {
    stmts.push(db.prepare(
      `INSERT INTO kancho_shifts (member_id, date, code, is_diagonal, is_wish, cell_color, is_locked, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now','localtime'), ?)
       ON CONFLICT(member_id, date) DO UPDATE SET code = excluded.code, is_diagonal = excluded.is_diagonal, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
    ).bind(member.id, date, code, dg, ws, cl, editor.by));
  }
  stmts.push(db.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, date, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(editor.adminId, editor.logName, 'shift', HOSHI_MEMBER_NAME, date, old ? label(old.code, old.is_diagonal) : '', code || dg || ws || cl ? label(code, dg) : ''));
  await db.batch(stmts);
  return { ok: true };
}

// 出勤時間（星シート専用。空文字で削除）
export async function saveHoshiWorkTime(db: D1Database, date: string, timeIn: string, by: string): Promise<SaveResult> {
  const time = timeIn.trim();
  if (!time) {
    await db.prepare('DELETE FROM hoshi_work_times WHERE date = ?').bind(date).run();
    return { ok: true };
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { ok: false, status: 400, error: '時刻の形式が不正です' };
  await db.prepare(`
    INSERT INTO hoshi_work_times (date, start_time, updated_at, updated_by) VALUES (?, ?, datetime('now','localtime'), ?)
    ON CONFLICT(date) DO UPDATE SET start_time = excluded.start_time, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).bind(date, time, by).run();
  return { ok: true };
}

// 予定メモ（1日1件。空なら削除）
export async function saveHoshiMemo(db: D1Database, date: string, contentIn: string, by: string): Promise<SaveResult> {
  const content = contentIn.slice(0, 200);
  if (!content.trim()) {
    await db.prepare('DELETE FROM hoshi_day_memos WHERE date = ?').bind(date).run();
    return { ok: true };
  }
  await db.prepare(`
    INSERT INTO hoshi_day_memos (date, content, updated_at, updated_by) VALUES (?, ?, datetime('now','localtime'), ?)
    ON CONFLICT(date) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  `).bind(date, content, by).run();
  return { ok: true };
}

function hexToRgb(hex: string | null | undefined): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

const WD = ['日', '月', '火', '水', '木', '金', '土'];

// A4縦1枚の「星 シフト・予定表」。列: 日付 / シフト / 出勤 / 予定メモ。フォント未設定ならnull
export async function buildHoshiSchedulePdf(env: Env, cal: HoshiCalendar): Promise<Uint8Array | null> {
  const fontBytes = await loadBentenFont(env);
  if (!fontBytes) return null;

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: false }); // subset:true はCJKでグリフ欠けするため禁止
  pdf.setTitle(`星 シフト・予定表 ${cal.year}年${cal.month}月度`);

  const PW = 595.28, PH = 841.89, M = 36;
  const page = pdf.addPage([PW, PH]);
  const ink = rgb(0.06, 0.09, 0.16);
  const sub = rgb(0.39, 0.45, 0.55);
  const line = rgb(0.86, 0.88, 0.93);
  const blue = rgb(0.15, 0.39, 0.92);
  const red = rgb(0.86, 0.15, 0.15);
  const accent = rgb(0.31, 0.27, 0.9);

  // ヘッダー（夜空色の帯）
  page.drawRectangle({ x: 0, y: PH - 78, width: PW, height: 78, color: rgb(0.09, 0.14, 0.35) });
  page.drawText('星 シフト・予定表', { x: M, y: PH - 40, size: 20, font, color: rgb(1, 1, 1) });
  const fmt = (s: string) => { const [, m, d] = s.split('-'); return `${parseInt(m, 10)}/${parseInt(d, 10)}`; };
  page.drawText(`${cal.year}年${cal.month}月度（${fmt(cal.start)}〜${fmt(cal.end)}）`, { x: M, y: PH - 62, size: 11, font, color: rgb(0.85, 0.87, 0.95) });
  const printed = `出力日 ${todayJst().replace(/-/g, '/')}`;
  page.drawText(printed, { x: PW - M - font.widthOfTextAtSize(printed, 9), y: PH - 62, size: 9, font, color: rgb(0.85, 0.87, 0.95) });

  // 表
  const top = PH - 100;
  const colDate = M, colShift = M + 78, colTime = M + 142, colMemo = M + 200;
  const shiftW = 50;
  const headH = 20;
  const rowH = Math.min(22, (top - headH - M - 10) / Math.max(cal.days.length, 1));
  const fs = Math.min(11, rowH * 0.5);

  page.drawText('日付', { x: colDate + 4, y: top - 14, size: 9, font, color: sub });
  page.drawText('シフト', { x: colShift + 10, y: top - 14, size: 9, font, color: sub });
  page.drawText('出勤', { x: colTime + 8, y: top - 14, size: 9, font, color: sub });
  page.drawText('予定メモ', { x: colMemo + 4, y: top - 14, size: 9, font, color: sub });
  page.drawLine({ start: { x: M, y: top - headH }, end: { x: PW - M, y: top - headH }, thickness: 1, color: ink });

  const memoMaxW = PW - M - colMemo - 6;
  const fitText = (s: string, size: number, maxW: number) => {
    if (font.widthOfTextAtSize(s, size) <= maxW) return s;
    let t = s;
    while (t.length > 0 && font.widthOfTextAtSize(t + '…', size) > maxW) t = t.slice(0, -1);
    return t + '…';
  };

  let y = top - headH;
  for (const d of cal.days) {
    const rowTop = y, rowBot = y - rowH;
    const dow = new Date(d.date + 'T00:00:00Z').getUTCDay();
    if (d.date === cal.today) page.drawRectangle({ x: M, y: rowBot, width: PW - 2 * M, height: rowH, color: rgb(0.93, 0.94, 1) });
    // 週の区切り（月曜の上）は少し濃い線
    page.drawLine({ start: { x: M, y: rowBot }, end: { x: PW - M, y: rowBot }, thickness: 0.5, color: line });
    if (dow === 1) page.drawLine({ start: { x: M, y: rowTop }, end: { x: PW - M, y: rowTop }, thickness: 0.8, color: rgb(0.7, 0.73, 0.82) });

    const textY = rowBot + (rowH - fs) / 2 + 1.5;
    const dayColor = dow === 0 ? red : dow === 6 ? blue : ink;
    const dayLabel = `${fmt(d.date)}`;
    page.drawText(dayLabel, { x: colDate + 4, y: textY, size: fs + 1, font, color: dayColor });
    page.drawText(WD[dow], { x: colDate + 4 + font.widthOfTextAtSize(dayLabel, fs + 1) + 4, y: textY, size: fs - 1.5, font, color: dayColor });

    // シフト（セル色が最優先、なければ記号の色。希望休は赤文字、斜め直は斜体）
    const bg = hexToRgb(d.cl) ?? (d.code ? hexToRgb(cal.types.find(t => t.code === d.code)?.color) : null);
    const boxH = rowH - 5, boxY = rowBot + 2.5;
    if (bg || d.code) {
      const c = bg ?? { r: 1, g: 1, b: 1 };
      page.drawRectangle({ x: colShift + 6, y: boxY, width: shiftW, height: boxH, color: rgb(c.r, c.g, c.b), borderColor: rgb(0.8, 0.82, 0.88), borderWidth: 0.5 });
    }
    if (d.code) {
      const c = bg ?? { r: 1, g: 1, b: 1 };
      const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
      const color = d.ws ? red : lum > 0.6 ? ink : rgb(1, 1, 1);
      const w = font.widthOfTextAtSize(d.code, fs);
      page.drawText(d.code, { x: colShift + 6 + (shiftW - w) / 2, y: textY, size: fs, font, color, ySkew: d.dg ? degrees(14) : undefined });
    }

    if (d.workTime) page.drawText(d.workTime, { x: colTime + 6, y: textY, size: fs, font, color: accent });
    if (d.memo) page.drawText(fitText(d.memo, fs - 0.5, memoMaxW), { x: colMemo + 4, y: textY, size: fs - 0.5, font, color: ink });
    y = rowBot;
  }

  page.drawText('斜体の記号＝斜め直（14:00〜翌8:00）／ 記号なしの色マス＝早日勤 ／ 赤文字＝希望休の反映', { x: M, y: M - 14, size: 8, font, color: sub });
  return pdf.save();
}
