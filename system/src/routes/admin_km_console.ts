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

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const BASE = `${ADMIN_PATH}/km-console`;

// 書き込み系 API（読み取り専用なので GET でも通さない）
// 名前が create_ticket / delete_csv / dispatch_request のように続く形でも引っかかるよう、語頭一致で判定する
const WRITE_API = /(^|\/)(create|update|delete|send|confirm|dispatch|request_csv|switching|logout|login|change_password|register|cancel|save)/i;

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

app.get('/km-console', (c) => c.html(buildIndexHtml()));

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

