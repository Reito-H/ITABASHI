import { Context, Next } from 'hono';
import { getSessionFromCookie, validateSession } from '../auth';
import type { Env } from '../auth';
import { ADMIN_PATH } from '../config';

export async function requireAuth(c: Context<{ Bindings: Env }>, next: Next) {
  const cookie = c.req.header('Cookie') ?? null;
  const sessionId = getSessionFromCookie(cookie);

  if (!sessionId) {
    return c.redirect(`${ADMIN_PATH}/login`);
  }

  const adminId = await validateSession(c.env.DB, sessionId);
  if (!adminId) {
    const res = c.redirect(`${ADMIN_PATH}/login`);
    res.headers.set('Set-Cookie', 'session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
    return res;
  }

  c.set('adminId', adminId);
  return next();
}

// 日本国内IPチェック（Cloudflare CF-IPCountryヘッダー利用）
// ヘッダーがない場合もCloudflare経由でないリクエストとして拒否する
export function requireJapan(c: Context, next: Next) {
  const country = c.req.header('CF-IPCountry');
  // ローカル開発（wrangler dev）ではCloudflareの国判定ヘッダーが付かない。.dev.vars に DEV_SKIP_JAPAN_CHECK=1 を
  // 置いた環境だけ通す（本番の secret には登録しないこと。wrangler dev では Host が bentenclub.com に見えるためホスト名では判定できない）
  if (!country && (c.env as { DEV_SKIP_JAPAN_CHECK?: string } | undefined)?.DEV_SKIP_JAPAN_CHECK === '1') return next();
  if (!country || country !== 'JP') {
    return c.text('Access denied', 403);
  }
  return next();
}
