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

// 簡易パスワード（ホシコンのログインに加えて、画面を開くたびに必ず聞く）。wrangler secret put KM_CONSOLE_PASSWORD で変更可。未設定なら 0724
// Cookie は使わない: 正しいパスワードで POST されたときだけ画面を返し、その画面に埋め込んだ使い捨てトークン（HMAC署名・12時間）を
// API 呼び出しのヘッダー X-KM-Token で検証する。ページを開き直す／再読み込みすると再びパスワード入力になる。
const DEFAULT_CONSOLE_PASSWORD = '0724';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const BASE = `${ADMIN_PATH}/km-console`;

// 書き込み系 API（読み取り専用なので GET でも通さない）
// 名前が create_ticket / delete_csv / dispatch_request のように続く形でも引っかかるよう、語頭一致で判定する
const WRITE_API = /(^|\/)(create|update|delete|send|confirm|dispatch|request_csv|switching|logout|login|change_password|register|cancel|save)/i;

function consolePassword(env: Env): string {
  return env.KM_CONSOLE_PASSWORD || DEFAULT_CONSOLE_PASSWORD;
}

async function hmacHex(env: Env, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('km-console-token:' + consolePassword(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// 画面に埋め込む使い捨てトークン: <有効期限ms>.<乱数>.<署名>
async function issueToken(env: Env): Promise<string> {
  const exp = Date.now() + TOKEN_TTL_MS;
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const body = `${exp}.${nonce}`;
  return `${body}.${await hmacHex(env, body)}`;
}

async function isUnlocked(c: { req: { header: (n: string) => string | undefined }; env: Env }): Promise<boolean> {
  const t = c.req.header('X-KM-Token') ?? '';
  const m = t.match(/^(\d+)\.([0-9a-f]+)\.([0-9a-f]+)$/);
  if (!m) return false;
  if (Date.now() > Number(m[1])) return false;
  return (await hmacHex(c.env, `${m[1]}.${m[2]}`)) === m[3];
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

function buildIndexHtml(token: string): string {
  let html = KM_CONSOLE_INDEX_HTML;
  // Google Fonts はホシコンの CSP で許可していないので外す（システムフォントで表示）
  html = html.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\s*/g, '');
  // 同梱スクリプトをホシコン配下のパスに
  html = html.replace(/<script src="(screens|map|live)\.js"><\/script>/g, (_m, n: string) => `<script src="${BASE}/asset/${n}.js?v=${KM_CONSOLE_VERSION}"></script>`);
  // ベースパスを埋め込む（live.js がこれを見てホシコンの中継 API を使う）＋ ホシコンへ戻るリンク
  const boot = `<script>window.__KMX_BASE=${JSON.stringify(BASE)};window.__KMX_TOKEN=${JSON.stringify(token)};history.replaceState(null,'',${JSON.stringify(BASE)});document.addEventListener('DOMContentLoaded',function(){var u=document.querySelector('.user');if(!u)return;var a=document.createElement('a');a.className='linkbtn';a.href=${JSON.stringify(ADMIN_PATH)};a.textContent='ホシコンへ戻る';u.prepend(a);var lo=u.querySelector('button:last-of-type');if(lo&&lo.textContent==='ログアウト')lo.remove();});</script>`;
  html = html.replace('<title>', `${boot}\n<title>`);
  html = html.replace('<title>km 配車コンソール</title>', '<title>配車コンソール - ホシコン</title>');
  return html;
}

// 画面を開くたびにパスワード入力ページ（Cookie で記憶しない）
app.get('/km-console', (c) => c.html(gatePage(c.req.query('e') === '1')));

app.post('/km-console/unlock', async (c) => {
  const form = await c.req.parseBody();
  const pw = typeof form.password === 'string' ? form.password.trim() : '';
  if (pw !== consolePassword(c.env)) return c.redirect(`${BASE}?e=1`);
  // 正しいときだけ画面本体を返す（URL は history.replaceState で /km-console に戻す。再読み込みすると再びパスワード入力）
  return c.html(buildIndexHtml(await issueToken(c.env)), 200, { 'Cache-Control': 'no-store' });
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
  if (!(await isUnlocked(c))) return c.json({ loggedIn: false, message: 'パスワード認証が切れました。ページを開き直してください。' }, 401);
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

// ZENRIN 地図の鍵（Referer 認証方式の公開用キー）だけを取り出して返す。
// 同じ応答に入っている経路探索CGIのID/パスワード類はブラウザへ渡さない。
app.get('/km-console/zenrin-key', async (c) => {
  if (!(await isUnlocked(c))) return c.json({ ok: false, message: 'パスワード認証が切れました' }, 401);
  const r = await kmApiGet(c.env, c.env.DB, 'tickets/get_init_display_data', '');
  if (!r.ok) return c.json({ ok: false, message: r.message }, r.status as 502 | 503);
  try {
    const body = JSON.parse(r.body) as { companyConfigAdmin?: { companyConfigAdminList?: Array<Record<string, unknown>> } };
    const cfg = body.companyConfigAdmin?.companyConfigAdminList?.[0] ?? {};
    const key = typeof cfg.zenrinKey === 'string' ? cfg.zenrinKey : '';
    const domain = typeof cfg.zenrinDomain === 'string' ? cfg.zenrinDomain : '';
    if (!key) return c.json({ ok: false, message: 'ZENRIN の地図キーが取得できませんでした' }, 404);
    return c.json({ ok: true, key, domain }, 200, { 'Cache-Control': 'no-store' });
  } catch {
    return c.json({ ok: false, message: 'km-operator の設定応答を解析できませんでした' }, 502);
  }
});

app.post('/km-console/relogin', async (c) => {
  await clearSession(c.env.DB);
  const r = await ensureSession(c.env, c.env.DB, true);
  if (!r.ok) return c.json({ ok: false, message: r.message }, 503);
  return c.json({ ok: true });
});

app.all('/km-console/kmx/api/v1/*', async (c) => {
  if (!(await isUnlocked(c))) return c.json({ isSuccess: false, msgs: [{ type: 'ERROR', msg: 'パスワード認証が切れました。ページを開き直してください。' }] }, 401);
  if (c.req.method !== 'GET') {
    return c.json({ isSuccess: false, msgs: [{ type: 'INVALID', msg: '配車コンソールは読み取り専用です（書き込み操作は中継しません）' }] }, 403);
  }
  const url = new URL(c.req.url);
  const apiPath = url.pathname.slice(`${BASE}/kmx/api/v1/`.length);
  // get_init_display_data は ZENRIN の経路探索CGIのID/パスワード等まで丸ごと含むので素通しにしない（地図鍵だけ /zenrin-key で渡す）
  if (apiPath === 'tickets/get_init_display_data') {
    return c.json({ isSuccess: false, msgs: [{ type: 'INVALID', msg: 'この応答は認証情報を含むため配車コンソールでは中継しません' }] }, 403);
  }
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

