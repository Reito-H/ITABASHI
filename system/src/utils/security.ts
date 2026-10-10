// ===================================================
// サイバー（セキュリティ監視）
//   security_events（migration_180）へ検知イベントを記録する。
//   記録失敗（テーブル未作成など）は本来の処理を止めないよう握りつぶす。
//   国外アクセス・攻撃パターン探索のように大量に来うるものは、同じIP×種類を
//   10分に1回だけ記録する（Workerインスタンス内のメモリで間引き。D1書き込み量の抑制）。
//   画面: routes/admin_cyber.ts（設定 → サイバー）
// ===================================================

import type { Context } from 'hono';

export type SecurityEventType =
  | 'login_success'      // 管理画面ログイン成功
  | 'login_failed'       // ログイン失敗（ユーザー名・パスワード不一致）
  | 'login_locked'       // 失敗回数超過でロック中にログインを試みた
  | 'csrf_failed'        // ログインフォームの不正送信（CSRFトークン不一致）
  | 'foreign_blocked'    // 日本国外からのアクセスを遮断
  | 'probe'              // 攻撃ツールがよく狙うパス（.env / wp-admin 等）へのアクセス
  | 'perm_denied'        // ログイン済みアカウントが権限のないページ・操作にアクセス
  | 'webhook_bad_sig'    // LINE Webhookの署名不正（なりすまし送信の疑い）
  | 'session_revoked'    // サイバーページから端末を強制ログアウト
  | 'maintenance_changed'; // メンテナンスモードの切替・期間設定

export type Severity = 'info' | 'warn' | 'critical';

export const EVENT_LABELS: Record<SecurityEventType, string> = {
  login_success: 'ログイン成功',
  login_failed: 'ログイン失敗',
  login_locked: 'ロック中の再試行',
  csrf_failed: '不正なログイン送信',
  foreign_blocked: '国外アクセス遮断',
  probe: '攻撃パターンの探索',
  perm_denied: '権限外アクセス',
  webhook_bad_sig: 'LINE署名不正',
  session_revoked: '強制ログアウト',
  maintenance_changed: 'メンテナンス切替',
};

export interface SecurityEventInput {
  type: SecurityEventType;
  severity?: Severity;
  ip?: string | null;
  country?: string | null;
  asOrg?: string | null;
  username?: string | null;
  adminId?: number | null;
  path?: string | null;
  userAgent?: string | null;
  detail?: string | null;
}

// ログイン失敗の上限（IP単位：既存の5回/15分、アカウント単位：10回/15分）
export const ACCOUNT_LOCK_THRESHOLD = 10;
export const LOCK_WINDOW_MINUTES = 15;

// 攻撃ツールが無差別に探しに来る代表的なパス（このシステムには存在しないもの）
const PROBE_RE = /(^|\/)(\.env|\.git|\.svn|\.aws|\.ssh|\.DS_Store|wp-admin|wp-login|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|pma|cgi-bin|actuator|server-status|vendor\/phpunit|boaform|HNAP1|owa|autodiscover|telescope|_ignition|solr|druid)(\/|$|\.)|\.(php|asp|aspx|jsp|cgi|sql|bak|old|swp)$/i;

export function isProbePath(pathname: string): boolean {
  return PROBE_RE.test(pathname);
}

// リクエストから接続元情報を取り出す
export function clientInfo(c: Context): { ip: string; country: string | null; asOrg: string | null; userAgent: string | null } {
  const cf = ((c.req.raw as any).cf ?? {}) as Record<string, unknown>;
  return {
    ip: c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown',
    country: (cf.country as string | undefined) ?? c.req.header('CF-IPCountry') ?? null,
    asOrg: (cf.asOrganization as string | undefined) ?? null,
    userAgent: c.req.header('User-Agent') ?? null,
  };
}

export async function logSecurityEvent(db: D1Database, ev: SecurityEventInput): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO security_events (event_type, severity, ip, country, as_org, username, admin_id, path, user_agent, detail)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      ev.type, ev.severity ?? 'info', ev.ip ?? null, ev.country ?? null, ev.asOrg ?? null,
      ev.username ? ev.username.slice(0, 64) : null, ev.adminId ?? null,
      ev.path ? ev.path.slice(0, 300) : null,
      ev.userAgent ? ev.userAgent.slice(0, 300) : null,
      ev.detail ? ev.detail.slice(0, 500) : null,
    ).run();
  } catch { /* 記録失敗は本来の処理を妨げない */ }
}

// 同一キーの記録を10分に1回へ間引く（メモリ上。インスタンスが変われば再記録されるが許容）
const THROTTLE_MS = 10 * 60 * 1000;
const throttleMap = new Map<string, number>();
function shouldRecord(key: string): boolean {
  const now = Date.now();
  const last = throttleMap.get(key);
  if (last && now - last < THROTTLE_MS) return false;
  if (throttleMap.size > 2000) throttleMap.clear();
  throttleMap.set(key, now);
  return true;
}

// レスポンスを待たせずに記録する（throttleKey 指定時は間引き対象）
export function logSecurityEventBg(c: Context, ev: SecurityEventInput, throttleKey?: string): void {
  if (throttleKey && !shouldRecord(throttleKey)) return;
  const db = (c.env as { DB: D1Database }).DB;
  const p = logSecurityEvent(db, ev);
  try { c.executionCtx.waitUntil(p); } catch { /* executionCtx がない環境ではそのまま流す */ }
}

// アカウント単位のロック判定（パスワード総当たり・使い回し攻撃対策）。
// テーブル未作成時はロックしない（フェイルオープン：管理者が締め出されるのを防ぐ）
export async function isAccountLocked(db: D1Database, username: string): Promise<boolean> {
  if (!username) return false;
  try {
    const r = await db.prepare(`
      SELECT COUNT(*) AS cnt FROM security_events
      WHERE event_type = 'login_failed' AND username = ?
        AND created_at > datetime('now', '+9 hours', '-${LOCK_WINDOW_MINUTES} minutes')
    `).bind(username).first<{ cnt: number }>();
    return (r?.cnt ?? 0) >= ACCOUNT_LOCK_THRESHOLD;
  } catch {
    return false;
  }
}

// ログイン成功時の「いつもと違う環境」判定。
// 過去にログイン実績があるアカウントで、その回線（AS組織）からのログインが初めてなら warn にする
export async function loginSuccessSeverity(db: D1Database, username: string, asOrg: string | null): Promise<{ severity: Severity; detail: string | null }> {
  if (!asOrg) return { severity: 'info', detail: null };
  try {
    const r = await db.prepare(`
      SELECT COUNT(*) AS total, SUM(CASE WHEN as_org = ? THEN 1 ELSE 0 END) AS same
      FROM security_events WHERE event_type = 'login_success' AND username = ?
    `).bind(asOrg, username).first<{ total: number; same: number | null }>();
    if ((r?.total ?? 0) > 0 && (r?.same ?? 0) === 0) {
      return { severity: 'warn', detail: `初めての回線からのログイン（${asOrg}）` };
    }
  } catch { /* noop */ }
  return { severity: 'info', detail: null };
}
