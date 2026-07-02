import { Hono } from 'hono';
import { requireAuth, requireJapan } from './middleware/auth';
import adminRoutes from './routes/admin';
import adminExtraRoutes from './routes/admin_extra';
import adminStaffRoutes from './routes/admin_staff';
import shiftApi from './routes/api/shift';
import employeesApi from './routes/api/employees';
import salesApi from './routes/api/sales';
import infoApi from './routes/api/info';
import instructorApi from './routes/api/instructor';
import eventsApi from './routes/api/events';
import lineApiRoutes from './routes/api/line_api';
import scheduleTypesApi from './routes/api/schedule_types';
import interviewsApi from './routes/api/interviews';
import coachesApi from './routes/api/coaches';
import instructorsApi from './routes/api/instructors';
import periodSettingsApi from './routes/api/period_settings';
import notificationsApi from './routes/api/notifications';
import instructorInviteApi from './routes/api/instructor_invite';
import { handleLineEvent } from './line_bot';
import { handleCron } from './cron';
import type { Env } from './auth';
import { ADMIN_PATH, SECRET } from './config';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

// =====================
// セキュリティミドルウェア
// =====================

// HTTP → HTTPS 強制リダイレクト（Cloudflare経由でHTTPが来た場合）
app.use('*', (c, next) => {
  const url = new URL(c.req.url);
  if (url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    url.protocol = 'https:';
    return c.redirect(url.toString(), 301);
  }
  return next();
});

// 日本国内限定アクセス
app.use('*', requireJapan);

// セキュリティヘッダー
app.use('*', async (c, next) => {
  await next();
  c.res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('X-Frame-Options', 'DENY');
  c.res.headers.set('Referrer-Policy', 'no-referrer');
  // HSTS: 1年間HTTPSを強制
  c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.res.headers.set('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com https://cdn.jsdelivr.net; frame-ancestors 'none';"
  );
});

// robots.txt
app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /\n'));

// =====================
// 管理者画面ルーティング
// 秘密パス配下のみ許可。login・logout・setup は認証不要
// =====================
app.use(`/${SECRET}/admin/*`, async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const re = new RegExp(`^\\/${SECRET}\\/admin\\/(login|logout|setup)`);
  if (re.test(path)) return next();
  return requireAuth(c, next);
});

// 管理者画面（秘密パス配下にマウント）
app.route(`/${SECRET}/admin`, adminRoutes);
app.route(`/${SECRET}/admin`, adminExtraRoutes);
app.route(`/${SECRET}/admin`, adminStaffRoutes);

// =====================
// API（認証必須）
// LINE Webhook は除外（後で定義）
// =====================
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === '/api/line/webhook') return next(); // Webhook は署名検証
  return requireAuth(c, next);
});

app.route('/api/shift', shiftApi);
app.route('/api/instructor-schedule', instructorApi);
app.route('/api/employees', employeesApi);
app.route('/api/sales', salesApi);
app.route('/api/info', infoApi);
app.route('/api/events', eventsApi);
app.route('/api/line', lineApiRoutes);
app.route('/api/schedule-types', scheduleTypesApi);
app.route('/api/interviews', interviewsApi);
app.route('/api/coaches', coachesApi);
app.route('/api/instructors', instructorsApi);
app.route('/api/period-settings', periodSettingsApi);
app.route('/api/notifications', notificationsApi);
app.route('/api/instructor-invite', instructorInviteApi);

// =====================
// LINE Webhook（署名検証あり・認証不要）
// =====================
app.post('/api/line/webhook', async (c) => {
  const channelSecret = c.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) return c.text('LINE未設定', 500);

  const signature = c.req.header('x-line-signature');
  if (!signature) return c.text('Unauthorized', 401);

  const body = await c.req.text();

  // 署名検証
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(channelSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  if (signature !== expectedSig) return c.text('Invalid signature', 401);

  const events: Record<string, unknown>[] = JSON.parse(body)?.events ?? [];
  c.executionCtx.waitUntil(
    Promise.all(events.map(event => handleLineEvent(c.env, event)))
  );

  return c.text('OK');
});

// ルートは秘密パスへリダイレクト
app.get('/', (c) => c.redirect(`${ADMIN_PATH}/login`));

export default {
  fetch: app.fetch.bind(app),
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleCron(env));
  }
};
