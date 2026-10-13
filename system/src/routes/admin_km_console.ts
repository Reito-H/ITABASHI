// 配車コンソール: km-operator（スマタク）の画面を作り直した新UI（km-ui/ui/）をホシコンの中に組み込んで配信するページ。
//
// ・ホシコンにログイン済み（＋権限キー km-console）のアカウントだけが使える。
// ・km-operator へのログインはサーバー側（utils/km_relay.ts）が自動で行う。利用者が km-operator の ID/パスワードを打つことはない。
// ・読み取り専用: km-operator の API は GET だけを中継し、POST（伝票作成・配車・メッセージ送信等）は一切通さない。
// ・km-operator への経路は「社内PCの cloudflared（Cloudflare Tunnel）」経由。社内PCが落ちていると使えない（画面上に表示）。
//
// パス構成（ADMIN_PATH 配下）:
//   GET /km-console                      画面本体（index.html を変換して配信）
//   GET /km-console/asset/<name>.js      screens.js / map.js / live.js（?v=ハッシュでブラウザ長期キャッシュ）
//   GET /km-console/session              km-operator ログイン状態（必要なら自動ログイン）
//   GET /km-console/kmx/api/v1/*         km-operator API の中継（GET のみ）
//   POST /km-console/relogin             セッションを捨てて再ログイン（詰まった時用）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { ADMIN_PATH } from '../config';
import { KM_CONSOLE_INDEX_HTML, KM_CONSOLE_SCREENS_JS, KM_CONSOLE_MAP_JS, KM_CONSOLE_LIVE_JS, KM_CONSOLE_VERSION } from '../assets/km_console_ui';
import { ensureSession, kmApiGet, clearSession } from '../utils/km_relay';

// 簡易パスワード（ホシコンのログインに加えて、開くたびに1回聞く）。wrangler secret put KM_CONSOLE_PASSWORD で変更可。未設定なら 0724
const DEFAULT_CONSOLE_PASSWORD = '0724';
const PW_COOKIE = 'km_console_pw';
const PW_COOKIE_MAX_AGE = 12 * 60 * 60; // 12時間（開き直しても同じ日のうちは聞かない）

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const BASE = `${ADMIN_PATH}/km-console`;

// 書き込み系 API（読み取り専用なので GET でも通さない）
// 名前が create_ticket / delete_csv / dispatch_request のように続く形でも引っかかるよう、語頭一致で判定する
const WRITE_API = /(^|\/)(create|update|delete|send|confirm|dispatch|request_csv|switching|logout|login|change_password|register|cancel|save)/i;

function consolePassword(env: Env): string {
  return env.KM_CONSOLE_PASSWORD || DEFAULT_CONSOLE_PASSWORD;
}

// Cookie に入れる値 = パスワードのハッシュ。パスワードを変えると過去の Cookie は無効になる
async function pwToken(env: Env): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('km-console:' + consolePassword(env)));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function isUnlocked(c: { req: { header: (n: string) => string | undefined }; env: Env }): Promise<boolean> {
  const m = (c.req.header('Cookie') ?? '').match(new RegExp(`(?:^|;\\s*)${PW_COOKIE}=([0-9a-f]+)`));
  return !!m && m[1] === (await pwToken(c.env));
}

function gatePage(error: boolean): string {
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>配車コンソール - ホシコン</title>
<style>body{font-family:'Hiragino Sans','Meiryo',sans-serif;background:#f3f5f8;margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh}
.box{background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:36px 28px;text-align:center;width:340px;box-sizing:border-box}
h1{font-size:15px;color:#1e3a5f;margin:0 0 14px}input{width:100%;border:1px solid #d1d5db;border-radius:6px;padding:10px 12px;font-size:16px;text-align:center;letter-spacing:.15em;box-sizing:border-box;margin-bottom:10px}
button{width:100%;padding:10px;background:#1e3a5f;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer}.err{color:#dc2626;font-size:12px;margin-bottom:10px}
a{display:block;margin-top:14px;font-size:12px;color:#6b7280}</style></head>
<body><form class="box" method="post" action="${BASE}/unlock"><h1>配車コンソールを開くにはパスワードが必要です</h1>
<input type="password" name="password" inputmode="numeric" autocomplete="off" autofocus placeholder="パスワード">${error ? '<div class="err">パスワードが違います</div>' : ''}
<button type="submit">開く</button><a href="${ADMIN_PATH}">ホシコンに戻る</a></form></body></html>`;
}

function buildIndexHtml(): string {
  let html = KM_CONSOLE_INDEX_HTML;
  // Google Fonts はホシコンの CSP で許可していないので外す（システムフォントで表示）
  html = html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, '');
  // 同梱スクリプトをホシコン配下のパスに
  html = html.replace(/<script src="(screens|map|live)\.js"><\/script>/g, (_m, n: string) => `<script src="${BASE}/asset/${n}.js?v=${KM_CONSOLE_VERSION}"></script>`);
  // ベースパスを埋め込む（live.js がこれを見てホシコンの中継 API を使う）＋ ホシコンへ戻るリンク
  const boot = `<script>window.__KMX_BASE=${JSON.stringify(BASE)};document.addEventListener('DOMContentLoaded',function(){var u=document.querySelector('.user');if(!u)return;var a=document.createElement('a');a.className='linkbtn';a.href=${JSON.stringify(ADMIN_PATH)};a.textContent='ホシコンへ戻る';u.prepend(a);var lo=u.querySelector('button:last-of-type');if(lo&&lo.textContent==='ログアウト')lo.remove();});</script>`;
  html = html.replace('<title>', `${boot}\n<title>`);
  html = html.replace('<title>km 配車コンソール</title>', '<title>配車コンソール - ホシコン</title>');
  return html;
}

app.get('/km-console', async (c) => {
  if (!(await isUnlocked(c))) return c.html(gatePage(c.req.query('e') === '1'));
  return c.html(buildIndexHtml());
});

app.post('/km-console/unlock', async (c) => {
  const form = await c.req.parseBody();
  const pw = typeof form.password === 'string' ? form.password.trim() : '';
  if (pw !== consolePassword(c.env)) return c.redirect(`${BASE}?e=1`);
  c.header('Set-Cookie', `${PW_COOKIE}=${await pwToken(c.env)}; Path=${BASE}; Max-Age=${PW_COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
  return c.redirect(BASE);
});

app.get('/km-console/asset/:name', (c) => {
  const name = c.req.param('name');
  const body = name === 'screens.js' ? KM_CONSOLE_SCREENS_JS : name === 'map.js' ? KM_CONSOLE_MAP_JS : name === 'live.js' ? KM_CONSOLE_LIVE_JS : null;
  if (body === null) return c.text('not found', 404);
  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
});

app.get('/km-console/session', async (c) => {
  if (!(await isUnlocked(c))) return c.json({ loggedIn: false, message: 'パスワード未入力です。ページを開き直してください。' }, 401);
  const r = await ensureSession(c.env, c.env.DB);
  if (!r.ok) return c.json({ loggedIn: false, message: r.message }, 503);
  const u = r.session.user ?? {};
  return c.json({
    loggedIn: true,
    operatorId: u.operatorId ?? '', accountId: u.accountId ?? '', roleId: u.roleId ?? '',
    loginName: u.loginName ?? c.env.KM_OPERATOR_LOGIN_ID ?? '', officeName: u.officeName ?? '板橋営業所',
    loggedInAt: r.session.loggedInAt,
  });
});

app.post('/km-console/relogin', async (c) => {
  await clearSession(c.env.DB);
  const r = await ensureSession(c.env, c.env.DB, true);
  if (!r.ok) return c.json({ ok: false, message: r.message }, 503);
  return c.json({ ok: true });
});

app.all('/km-console/kmx/api/v1/*', async (c) => {
  if (!(await isUnlocked(c))) return c.json({ isSuccess: false, msgs: [{ type: 'ERROR', msg: 'パスワード未入力です。ページを開き直してください。' }] }, 401);
  if (c.req.method !== 'GET') {
    return c.json({ isSuccess: false, msgs: [{ type: 'INVALID', msg: '配車コンソールは読み取り専用です（書き込み操作は中継しません）' }] }, 403);
  }
  const url = new URL(c.req.url);
  const apiPath = url.pathname.slice(`${BASE}/kmx/api/v1/`.length);
  if (!apiPath || WRITE_API.test(apiPath)) {
    return c.json({ isSuccess: false, msgs: [{ type: 'INVALID', msg: '配車コンソールは読み取り専用です: ' + apiPath }] }, 403);
  }
  url.searchParams.delete('_'); // キャッシュ避けのダミー
  const search = url.searchParams.toString() ? `?${url.searchParams.toString()}` : '';
  const r = await kmApiGet(c.env, c.env.DB, apiPath, search);
  if (!r.ok) return c.json({ isSuccess: false, relayError: true, msgs: [{ type: 'ERROR', msg: r.message }] }, r.status as 502 | 503);
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.contentType, 'Cache-Control': 'no-store' } });
});

export default app;

