// admin（username='admin'）ログインの2段階認証まわりの共通ロジック。
// ・第2要素は「顔」または「第二パスワード」。どちらも使えない時のために「バックアップコード」。
// ・ゲートは fail-open: 前提（顔・第二パスワード・バックアップコード）が1つでも欠けたらパスワードのみで通す。
// ・顔照合はブラウザ側で作った128次元ベクトルをサーバーで距離計算（顔認証ページと同じ式）。
import { hashPassword, verifyPassword } from '../auth';

export type GateStatus = {
  enabled: boolean;      // system_settings の auth_gate_enabled
  threshold: number;     // 一致とみなす最低%（既定55）
  hasFace: boolean;      // admin本人の顔ベクトルが1件以上
  hasSecondPw: boolean;  // 第二パスワードが設定済み
  hasBackup: boolean;    // 未使用バックアップコードあり
  ready: boolean;        // enabled かつ 上記3つ全部そろい、実際にゲートを強制する状態
  adminId: number | null;
};

export async function getAdminAccountId(db: D1Database): Promise<number | null> {
  const row = await db.prepare("SELECT id FROM admins WHERE username = 'admin'").first<{ id: number }>();
  return row?.id ?? null;
}

async function getSetting(db: D1Database, key: string, dflt: string): Promise<string> {
  try {
    const row = await db.prepare('SELECT value FROM system_settings WHERE key = ?').bind(key).first<{ value: string }>();
    return row?.value ?? dflt;
  } catch { return dflt; }
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db.prepare(
    "INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, datetime('now','localtime')) " +
    "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
  ).bind(key, value).run();
}

export async function getGateStatus(db: D1Database): Promise<GateStatus> {
  const adminId = await getAdminAccountId(db);
  const enabled = (await getSetting(db, 'auth_gate_enabled', '0')) === '1';
  const thRaw = parseInt(await getSetting(db, 'auth_gate_threshold', '55'), 10);
  const threshold = Number.isFinite(thRaw) ? Math.min(95, Math.max(0, thRaw)) : 55;
  const hasSecondPw = (await getSetting(db, 'auth_gate_second_pw_hash', '')).length > 0;
  let hasFace = false, hasBackup = false;
  if (adminId != null) {
    hasFace = !!(await db.prepare('SELECT 1 FROM face_auth_faces WHERE admin_id = ? LIMIT 1').bind(adminId).first());
    hasBackup = !!(await db.prepare('SELECT 1 FROM admin_backup_codes WHERE admin_id = ? AND used_at IS NULL LIMIT 1').bind(adminId).first());
  }
  const ready = enabled && adminId != null && hasFace && hasSecondPw && hasBackup;
  return { enabled, threshold, hasFace, hasSecondPw, hasBackup, ready, adminId };
}

// ---- 第二パスワード（顔が使えない時用。PBKDF2ハッシュを system_settings に保存）----
export async function setSecondPassword(db: D1Database, plain: string): Promise<void> {
  await setSetting(db, 'auth_gate_second_pw_hash', await hashPassword(plain));
}
export async function verifySecondPassword(db: D1Database, input: string): Promise<boolean> {
  const stored = await getSetting(db, 'auth_gate_second_pw_hash', '');
  if (!stored || !input) return false;
  return verifyPassword(input, stored);
}

// ---- 距離 → 一致度%（顔認証ページ MATCH_JS の simPct と同じ）----
export function euclid(a: number[] | Float32Array, b: number[] | Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = (a[i] as number) - (b[i] as number); s += d * d; }
  return Math.sqrt(s);
}
export function simPct(dist: number): number {
  if (dist <= 0.6) return Math.round(100 - (dist / 0.6) * 50);
  return Math.round(Math.max(0, 50 - ((dist - 0.6) / 0.4) * 50));
}

export const MAX_ADMIN_FACES = 3;

// adminログイン認証に使う顔の一覧（最大 MAX_ADMIN_FACES 人。誰か1人でも一致すれば通る）
export async function listAdminFaces(db: D1Database, adminId: number): Promise<Array<{ id: number; label: string; created_at: string; sample_count: number }>> {
  const r = await db.prepare(
    'SELECT id, label, created_at, sample_count FROM face_auth_faces WHERE admin_id = ? ORDER BY created_at'
  ).bind(adminId).all<{ id: number; label: string; created_at: string; sample_count: number }>();
  return r.results ?? [];
}

// admin本人の登録ベクトルに対する最良一致%を返す（顔登録が無ければ null）
export async function bestFaceMatchPct(db: D1Database, adminId: number, descriptor: number[]): Promise<number | null> {
  const r = await db.prepare('SELECT descriptor FROM face_auth_faces WHERE admin_id = ?').bind(adminId).all<{ descriptor: string }>();
  const rows = r.results ?? [];
  if (!rows.length) return null;
  let best = 0;
  for (const row of rows) {
    let vec: unknown;
    try { vec = JSON.parse(row.descriptor); } catch { continue; }
    if (!Array.isArray(vec) || vec.length !== 128) continue;
    const pct = simPct(euclid(descriptor, vec as number[]));
    if (pct > best) best = pct;
  }
  return best;
}

// ---- 保留チャレンジ ----
export type Challenge = {
  token: string; admin_id: number; status: string; method: string;
  face_tries: number; ip: string; ua: string; created_at: string; expires_at: string;
};

export function newChallengeToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
}

export async function createChallenge(db: D1Database, o: { token: string; adminId: number; ip: string; ua: string; ttlMinutes?: number }): Promise<void> {
  const ttl = Math.max(1, Math.min(60, o.ttlMinutes ?? 5));
  // 期限は SQLite の datetime() 形式で保存し、判定も datetime('now') で行う（ISO文字列と混ぜない）
  await db.batch([
    db.prepare("DELETE FROM login_challenges WHERE expires_at < datetime('now')"),
    db.prepare("INSERT INTO login_challenges (token, admin_id, ip, ua, expires_at) VALUES (?, ?, ?, ?, datetime('now', ?))")
      .bind(o.token, o.adminId, o.ip.slice(0, 64), o.ua.slice(0, 256), '+' + ttl + ' minutes'),
  ]);
}

export async function getChallenge(db: D1Database, token: string): Promise<Challenge | null> {
  if (!token) return null;
  const row = await db.prepare(
    "SELECT * FROM login_challenges WHERE token = ? AND expires_at > datetime('now')"
  ).bind(token).first<Challenge>();
  return row ?? null;
}

// 第2要素の誤り回数（顔・第二パスワード共通）を1つ増やして新しい値を返す。列名は既存の face_tries を流用。
export async function bumpTries(db: D1Database, token: string): Promise<number> {
  await db.prepare('UPDATE login_challenges SET face_tries = face_tries + 1 WHERE token = ?').bind(token).run();
  const row = await db.prepare('SELECT face_tries FROM login_challenges WHERE token = ?').bind(token).first<{ face_tries: number }>();
  return row?.face_tries ?? 99;
}

// 保留チャレンジを1回だけ消費する（競合しても2つ目は false）。
export async function consumeChallenge(db: D1Database, token: string): Promise<boolean> {
  const r = await db.prepare(
    "UPDATE login_challenges SET status = 'consumed' WHERE token = ? AND status = 'pending'"
  ).bind(token).run();
  return (r.meta?.changes ?? 0) > 0;
}

// ---- バックアップコード ----
// 表示は XXXX-XXXX-XXXX（紛らわしい文字を除いた32種×12文字 ≒ 60bit）。
// 保存は SHA-256（Workers の10ms CPU制限があるため PBKDF2 は使わない。高エントロピーなので総当りは非現実的）。
// 照合はハッシュ完全一致の直接引き（ループ無し＝定数時間・CPU安全）。
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  let s = '';
  for (let i = 0; i < 12; i++) { s += CODE_CHARS[bytes[i] % CODE_CHARS.length]; if (i === 3 || i === 7) s += '-'; }
  return s;
}
function normCode(input: string): string | null {
  const raw = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length !== 12) return null;
  if (!/^[A-Z0-9]{12}$/.test(raw)) return null;
  return raw.slice(0, 4) + '-' + raw.slice(4, 8) + '-' + raw.slice(8, 12);
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function regenerateBackupCodes(db: D1Database, adminId: number, count = 10): Promise<string[]> {
  const codes: string[] = [];
  const stmts: D1PreparedStatement[] = [
    db.prepare('DELETE FROM admin_backup_codes WHERE admin_id = ?').bind(adminId),
  ];
  for (let i = 0; i < count; i++) {
    const c = randCode();
    codes.push(c);
    stmts.push(db.prepare('INSERT INTO admin_backup_codes (admin_id, code_hash) VALUES (?, ?)').bind(adminId, await sha256Hex(c)));
  }
  await db.batch(stmts);
  return codes;
}

export async function consumeBackupCode(db: D1Database, adminId: number, input: string): Promise<boolean> {
  const norm = normCode(input);
  if (!norm) return false;
  const hash = await sha256Hex(norm);
  const r = await db.prepare(
    "UPDATE admin_backup_codes SET used_at = datetime('now','localtime') WHERE admin_id = ? AND code_hash = ? AND used_at IS NULL"
  ).bind(adminId, hash).run();
  return (r.meta?.changes ?? 0) > 0;
}

export async function unusedBackupCount(db: D1Database, adminId: number): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM admin_backup_codes WHERE admin_id = ? AND used_at IS NULL').bind(adminId).first<{ n: number }>();
  return row?.n ?? 0;
}
