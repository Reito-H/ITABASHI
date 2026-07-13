// パスワードハッシュ・セッション管理（Web Crypto API / D1使用）

export type Env = {
  DB: D1Database;
  SETUP_KEY?: string;
  LINE_CHANNEL_SECRET?: string;
  LINE_CHANNEL_ACCESS_TOKEN?: string;
  // PATTERN1=新人 / PATTERN2=運行管理者 / PATTERN3=統括管理者
  RICHMENU_ID_PATTERN1?: string;
  RICHMENU_ID_PATTERN2?: string;
  RICHMENU_ID_PATTERN3?: string;
  // LIFF アプリID
  LIFF_ID_LOST_ITEM?: string;
  LIFF_ID_ACCIDENT?: string;
  LIFF_ID_STAFF_LOOKUP?: string;
  LIFF_ID_STAFF_LOOKUP_PLUS?: string;
  LIFF_ID_OTHER_FEATURES?: string;
  LIFF_ID_VIOLATION?: string;
  // 登録パスワード（wrangler secret put で設定）
  LINE_REG_PWD_VEHICLE?: string;    // 車番管理者
  LINE_REG_PWD_OPERATIONS?: string; // 運行管理者
  LINE_REG_PWD_GENERAL?: string;    // 統括管理者
  LINE_REG_PWD_BENTEN?: string;         // ベンテンクラブ会員
  LINE_REG_PWD_BENTEN_MASTER?: string;  // ベンテンクラブシフトマスター
  // ベンテンクラブ シフト
  LIFF_ID_BENTEN_SHIFT?: string;
  RICHMENU_ID_BENTEN?: string;
  BENTEN_LINE_GROUP_ID?: string;    // 日次送信先LINEグループ（benten_configが優先）
  BENTEN_FONT_URL?: string;         // PDF用 日本語TTFフォントのURL（R2未使用時）
  BENTEN_FONTS?: R2Bucket;          // PDF用フォント置き場（NotoSansJP-Regular.ttf）
  // 乗務社員 + 売上管理拡張 + ODOメーター記録
  RICHMENU_ID_CREW_MEMBER?: string;
  LINE_REG_PWD_CREW_MEMBER?: string; // 乗務社員・新人（LINE連携メニュー経由）共通の登録パスワード
  LIFF_ID_SALES?: string;
  // 権限不明者（友達追加直後・未登録）用リッチメニュー。「LINE連携」ボタンでステータス選択を起動
  RICHMENU_ID_UNKNOWN?: string;
};

// Cloudflare Workers の Web Crypto は PBKDF2 の反復回数が最大100000回
// （超えると NotSupportedError で500になる）
const PBKDF2_ITERATIONS = 100000;

// PBKDF2でパスワードをハッシュ化（v2プレフィックスでイテレーション数を記録）
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const hash = new Uint8Array(bits);
  const toHex = (arr: Uint8Array) => Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  return `v2:${toHex(salt)}:${toHex(hash)}`;
}

// パスワード検証（v2プレフィックスなし=旧ハッシュは100000回で検証）
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  let iterations = 100000;
  let saltHex: string, hashHex: string;

  if (stored.startsWith('v2:')) {
    iterations = PBKDF2_ITERATIONS;
    const parts = stored.slice(3).split(':');
    [saltHex, hashHex] = parts;
  } else {
    const parts = stored.split(':');
    [saltHex, hashHex] = parts;
  }

  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)));
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const computed = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return computed === hashHex;
}

// セッションID生成（UUID v4）
export function generateSessionId(): string {
  return crypto.randomUUID();
}

// セッション作成（有効期限24時間）
export async function createSession(db: D1Database, adminId: number): Promise<string> {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await db.prepare(
    'INSERT INTO sessions (id, admin_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, adminId, expiresAt).run();
  return sessionId;
}

// セッション検証
export async function validateSession(db: D1Database, sessionId: string): Promise<number | null> {
  const now = new Date().toISOString();
  const row = await db.prepare(
    'SELECT admin_id FROM sessions WHERE id = ? AND expires_at > ?'
  ).bind(sessionId, now).first<{ admin_id: number }>();
  return row?.admin_id ?? null;
}

// セッション削除（ログアウト）
export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}

// 期限切れセッション削除
export async function cleanExpiredSessions(db: D1Database): Promise<void> {
  const now = new Date().toISOString();
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
}

// ブルートフォース判定（5回/15分でロック）
export async function isLockedOut(db: D1Database, ip: string): Promise<boolean> {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const result = await db.prepare(
    'SELECT COUNT(*) as cnt FROM login_attempts WHERE ip = ? AND failed_at > ?'
  ).bind(ip, since).first<{ cnt: number }>();
  return (result?.cnt ?? 0) >= 5;
}

// 残り試行回数を返す（0以下でロック）
export async function remainingAttempts(db: D1Database, ip: string): Promise<number> {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const result = await db.prepare(
    'SELECT COUNT(*) as cnt FROM login_attempts WHERE ip = ? AND failed_at > ?'
  ).bind(ip, since).first<{ cnt: number }>();
  return Math.max(0, 5 - (result?.cnt ?? 0));
}

// ログイン失敗記録（挿入と同時に期限切れレコードを削除）
export async function recordFailedLogin(db: D1Database, ip: string): Promise<void> {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await db.batch([
    db.prepare('DELETE FROM login_attempts WHERE failed_at < ?').bind(cutoff),
    db.prepare('INSERT INTO login_attempts (ip) VALUES (?)').bind(ip),
  ]);
}

// Cookieからセッションを取得
export function getSessionFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/session=([^;]+)/);
  return match?.[1] ?? null;
}

// 招待コード生成（6桁英数字）
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) {
    code += chars[b % chars.length];
  }
  return code;
}

// 月度設定の型
export type PeriodSettings = Record<number, { close_day: number; start_day: number }>;

// モジュールスコープキャッシュ（同一Workerインスタンス内で共有）
let _periodSettingsCache: PeriodSettings | null = null;
let _periodSettingsCachedAt = 0;
const PERIOD_SETTINGS_TTL_MS = 60 * 60 * 1000; // 1時間

// 月度設定をDBから取得（1時間キャッシュ）
export async function getPeriodSettings(db: D1Database): Promise<PeriodSettings> {
  if (_periodSettingsCache && Date.now() - _periodSettingsCachedAt < PERIOD_SETTINGS_TTL_MS) {
    return _periodSettingsCache;
  }
  const settings: PeriodSettings = {};
  for (let m = 1; m <= 12; m++) settings[m] = { close_day: 17, start_day: 18 };
  try {
    const rows = await db.prepare('SELECT month, close_day, start_day FROM period_settings').all<{ month: number; close_day: number; start_day: number }>();
    for (const r of (rows.results ?? [])) settings[r.month] = { close_day: r.close_day, start_day: r.start_day };
  } catch { /* テーブルが存在しない場合はデフォルト値を使用 */ }
  _periodSettingsCache = settings;
  _periodSettingsCachedAt = Date.now();
  return settings;
}

// 月度設定のキャッシュを明示的にクリア（設定変更時に呼び出す）
export function invalidatePeriodSettingsCache(): void {
  _periodSettingsCache = null;
  _periodSettingsCachedAt = 0;
}

// 月度計算（デフォルト17日締め18日スタート）
export function getPeriod(dateStr: string): { year: number; month: number } {
  const d = new Date(dateStr);
  const day = d.getDate();
  let year = d.getFullYear();
  let month = d.getMonth() + 1;
  if (day >= 18) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return { year, month };
}

// 月度の開始日・終了日を計算（月度設定対応）
export function getPeriodRange(year: number, month: number, settings?: PeriodSettings): { start: string; end: string } {
  const s = settings?.[month] ?? { close_day: 17, start_day: 18 };
  let startYear = year, startMonth = month - 1;
  if (startMonth < 1) { startMonth = 12; startYear -= 1; }
  const start = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(s.start_day).padStart(2, '0')}`;
  const end   = `${year}-${String(month).padStart(2, '0')}-${String(s.close_day).padStart(2, '0')}`;
  return { start, end };
}

// シフト画面表示用の日付範囲（月度より前後3日広げる）
export function getShiftDisplayRange(year: number, month: number, settings?: PeriodSettings): { start: string; end: string; dates: string[] } {
  const { start, end } = getPeriodRange(year, month, settings);
  // 表示範囲: 開始の3日前〜終了の3日後
  const startDate = new Date(start);
  startDate.setDate(startDate.getDate() - 3);
  const endDate = new Date(end);
  endDate.setDate(endDate.getDate() + 3);

  const dates: string[] = [];
  const cur = new Date(startDate);
  while (cur <= endDate) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return {
    start: startDate.toISOString().split('T')[0],
    end: endDate.toISOString().split('T')[0],
    dates
  };
}
