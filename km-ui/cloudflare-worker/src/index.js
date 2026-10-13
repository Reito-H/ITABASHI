/**
 * km-operator 新UI用 リバースプロキシ (Cloudflare Workers)
 *
 * 役割
 *  1. /kmx/*            → ORIGIN(https://km-operator.smartaxicenter.com)へ透過プロキシ。Cookie を往復させ、
 *                         Set-Cookie の Domain 属性を除去して Worker のドメインに発行し直す。
 *  2. /api/session      → ログイン中ユーザー情報(operatorId 等)を JSON で返す。
 *                         旧画面 HTML に埋め込まれた `const KMX_USER = {...}` を抽出するだけで、独自の認証は持たない。
 *  3. それ以外 (/ , /ui/*) → 静的アセット(新UI)。wrangler.toml の [assets] で配信。
 *
 * ブラウザから見ると UI と API が同一オリジンになるため、CORS 不要。
 * ログインは /kmx/HS/HSHS/HSHS0199.do(旧ログイン画面)をプロキシ越しに通すことで、
 * JSESSIONID 等のセッション Cookie が Worker ドメインに対して発行される。
 */

const HOP_BY_HOP = ['connection', 'keep-alive', 'transfer-encoding', 'te', 'trailer', 'upgrade', 'proxy-authorization', 'proxy-authenticate', 'content-length'];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = (env.ORIGIN || 'https://km-operator.smartaxicenter.com').replace(/\/$/, '');

    // 簡易アクセス制限(任意): ALLOWED_IPS="1.2.3.4,5.6.7.8" を設定した場合のみ有効。
    // 本格的には Cloudflare Access(Zero Trust)を Worker の前段に置くこと。
    if (env.ALLOWED_IPS) {
      const ip = request.headers.get('cf-connecting-ip') || '';
      const ok = env.ALLOWED_IPS.split(',').map(s => s.trim()).filter(Boolean).includes(ip);
      if (!ok) return new Response('Forbidden', { status: 403 });
    }

    if (url.pathname === '/api/session') return session(request, origin);
    if (url.pathname === '/api/health') return Response.json({ ok: true, origin, time: new Date().toISOString() });

    if (url.pathname.startsWith('/kmx/')) {
      if (env.READ_ONLY === 'true' && isWrite(request, url)) {
        return Response.json({ isSuccess: false, msgs: [{ type: 'INVALID', msg: 'このプロキシは読み取り専用です: ' + url.pathname }] }, { status: 403 });
      }
      return proxy(request, url, origin);
    }

    // 静的アセット(新UI)。wrangler の assets バインディングがある場合はそれに委譲。
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  }
};

/** 書き込み系 API の判定(読み取り専用モード用)。POST はすべて書き込み扱い。 */
function isWrite(request, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    // ログイン画面の POST だけは許可
    return !/\/kmx\/HS\/HSHS\/HSHS0199\.do$/.test(url.pathname);
  }
  return /\/(create|update|delete|send|confirm|dispatch_request|request_csv|delete_csv|switching_exclusion_lock)(\/|$|\?)/.test(url.pathname + '?');
}

/** /kmx/* を ORIGIN に転送する。 */
async function proxy(request, url, origin) {
  const target = origin + url.pathname + url.search;
  const headers = new Headers(request.headers);
  for (const h of HOP_BY_HOP) headers.delete(h);
  headers.set('host', new URL(origin).host);
  // 旧画面/ZENRIN は Referer を見る場合があるため、オリジン側の URL に差し替える
  headers.set('origin', origin);
  headers.set('referer', origin + '/kmx/HS/HSHS/HSHS9999.do?pageId=HSHS1000');
  headers.delete('cf-connecting-ip'); headers.delete('cf-ray'); headers.delete('cf-visitor'); headers.delete('x-forwarded-for');

  const init = { method: request.method, headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = await request.arrayBuffer();

  const res = await fetch(target, init);
  const out = new Headers(res.headers);
  for (const h of HOP_BY_HOP) out.delete(h);

  // Set-Cookie: Domain を除去し、Worker ドメインに発行し直す(Path/HttpOnly/Secure は維持)
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  out.delete('set-cookie');
  for (const c of cookies) out.append('set-cookie', rewriteCookie(c));

  // リダイレクト先がオリジンなら Worker 側に書き換える
  const loc = out.get('location');
  if (loc && loc.startsWith(origin)) out.set('location', url.origin + loc.slice(origin.length));

  // API 応答はキャッシュさせない
  out.set('cache-control', url.pathname.startsWith('/kmx/api/') ? 'no-store' : (out.get('cache-control') || 'no-cache'));
  out.delete('content-security-policy'); // 旧画面を Worker ドメインで表示できるように(必要なら新UI用に再設定)
  out.set('x-proxied-by', 'km-ui-worker');

  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
}

function rewriteCookie(c) {
  return c
    .split(';').map(s => s.trim())
    .filter(s => !/^domain=/i.test(s))
    .map(s => /^samesite=none$/i.test(s) ? 'SameSite=Lax' : s)
    .join('; ') + (/secure/i.test(c) ? '' : '; Secure');
}

/** 旧画面の HTML から KMX_USER を抽出して返す。未ログインなら 401。 */
async function session(request, origin) {
  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  if (!cookie) return Response.json({ loggedIn: false }, { status: 401 });
  headers.set('cookie', cookie);
  headers.set('referer', origin + '/kmx/');
  const res = await fetch(origin + '/kmx/HS/HSHS/HSHS9999.do?pageId=HSHS1000', { headers, redirect: 'manual' });
  if (res.status !== 200) return Response.json({ loggedIn: false, status: res.status }, { status: 401 });
  const html = await res.text();
  const m = html.match(/const\s+KMX_USER\s*=\s*\{([\s\S]*?)\};/);
  if (!m || /type="password"/.test(html)) return Response.json({ loggedIn: false }, { status: 401 });
  const user = {};
  for (const [, k, v] of m[1].matchAll(/(\w+)\s*:\s*("([^"]*)"|[^,\n]+)/g)) user[k] = v.replace(/^"|"$/g, '').trim();
  return Response.json({
    loggedIn: true,
    operatorId: user.operatorId, accountId: user.accountId, roleId: user.roleId, companyId: user.companyId,
    loginName: (user.userName || '').replace(/^ログイン\s*/, ''), userName: user.loginName, isOfficeUser: user.isOfficeUser === 'true'
  }, { headers: { 'cache-control': 'no-store' } });
}
