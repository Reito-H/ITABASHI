// km-operator（配車オペレーター画面 smartaxicenter.com）への「中継」クライアント。
//
// Cloudflare Workers から km-operator へ直接つなぐと接続が遮断される（522）ため、
// 社内PC（日本国内IP）に置いた cloudflared（Cloudflare Tunnel）を経由する:
//   ホシコン(Worker) → https://km-relay.bentenclub.com（Tunnel, Cloudflare Access のサービストークンで保護）
//     → 社内PCの cloudflared → https://km-operator.smartaxicenter.com
//
// ログインは Worker 側が KM_OPERATOR_LOGIN_ID / KM_OPERATOR_PASSWORD で自動的に行い、
// Cookie（JSESSIONID 等）と X-CLTFT-Token を D1（km_console_session）に保持して使い回す。
// ブラウザには km-operator の Cookie を一切渡さない（ホシコンのログインだけで使える）。
//
// API の仕様は docs/KM_OPERATOR_API.md 参照。X-CLTFT-Token は「直前の応答の値をヘッダーと Cookie の両方に載せる」。
import type { Env } from '../auth';

export const KM_ORIGIN = 'https://km-operator.smartaxicenter.com';
export const KM_RELAY_ORIGIN = 'https://km-relay.bentenclub.com';
const KM_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 BentenKmConsole/1.0';
const TIMEOUT_MS = 20000;
const LOGIN_PAGE = '/kmx/HS/HSHS/HSHS0199.do';
const LOGIN_API = '/kmx/api/v1/auth/login';
const MAIN_PAGE = '/kmx/HS/HSHS/HSHS9999.do?pageId=HSHS1000';

export type KmSession = {
  cookies: Record<string, string>;
  token: string | null;
  user: KmUser | null;
  loggedInAt: number;
};

export type KmUser = {
  operatorId?: string;
  accountId?: string;
  roleId?: string;
  companyId?: string;
  loginName?: string;
  userName?: string;
  officeName?: string;
};

export type KmResult =
  | { ok: true; status: number; body: string; contentType: string }
  | { ok: false; status: number; message: string };

// ---------- D1 に保存するセッション ----------
export async function loadSession(db: D1Database): Promise<KmSession | null> {
  const row = await db.prepare('SELECT cookies, token, user_json, logged_in_at FROM km_console_session WHERE id = 1').first<{
    cookies: string; token: string | null; user_json: string | null; logged_in_at: number;
  }>();
  if (!row) return null;
  try {
    return {
      cookies: JSON.parse(row.cookies || '{}'),
      token: row.token,
      user: row.user_json ? JSON.parse(row.user_json) : null,
      loggedInAt: row.logged_in_at,
    };
  } catch {
    return null;
  }
}

export async function saveSession(db: D1Database, s: KmSession): Promise<void> {
  await db.prepare(
    `INSERT INTO km_console_session (id, cookies, token, user_json, logged_in_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET cookies = excluded.cookies, token = excluded.token,
       user_json = excluded.user_json, logged_in_at = excluded.logged_in_at, updated_at = excluded.updated_at`,
  ).bind(JSON.stringify(s.cookies), s.token, s.user ? JSON.stringify(s.user) : null, s.loggedInAt, Date.now()).run();
}

export async function clearSession(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM km_console_session WHERE id = 1').run();
}

// ---------- 低レベル: 中継経由の fetch ----------
function relayHeaders(env: Env, s: KmSession | null, extra?: Record<string, string>): Headers {
  const h = new Headers();
  h.set('User-Agent', KM_UA);
  h.set('Accept', 'application/json, text/plain, */*');
  h.set('Accept-Language', 'ja,en;q=0.8');
  h.set('Referer', KM_ORIGIN + MAIN_PAGE);
  // 旧UIの $cf.ajax が常に付けているヘッダー。X-Use-Cookie は「トークンを Cookie から読む」指示で、
  // これが無いと画面 GET が本体に届かず短いエラーページになる（実機確認）
  h.set('X-Requested-With', 'XMLHttpRequest');
  h.set('X-Use-Cookie', 'true');
  if (env.KM_RELAY_ACCESS_ID && env.KM_RELAY_ACCESS_SECRET) {
    h.set('CF-Access-Client-Id', env.KM_RELAY_ACCESS_ID);
    h.set('CF-Access-Client-Secret', env.KM_RELAY_ACCESS_SECRET);
  }
  if (s) {
    const pairs = Object.entries(s.cookies).map(([k, v]) => `${k}=${v}`);
    if (s.token) {
      pairs.push(`X-CLTFT-Token=${s.token}`);
      h.set('X-CLTFT-Token', s.token);
    }
    if (pairs.length) h.set('Cookie', pairs.join('; '));
  }
  for (const [k, v] of Object.entries(extra ?? {})) h.set(k, v);
  return h;
}

function absorbResponse(res: Response, s: KmSession): void {
  const hh = res.headers as Headers & { getSetCookie?: () => string[] };
  const list: string[] = typeof hh.getSetCookie === 'function'
    ? hh.getSetCookie()
    : (res.headers.get('set-cookie') ?? '').split(/,(?=\s*[A-Za-z0-9_-]+=)/).map((x) => x.trim()).filter(Boolean);
  for (const sc of list) {
    const pair = sc.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    const k = pair.slice(0, eq).trim();
    const v = pair.slice(eq + 1).trim();
    if (k === 'X-CLTFT-Token') s.token = v;
    else s.cookies[k] = v;
  }
  const tok = res.headers.get('x-cltft-token');
  if (tok) s.token = tok;
}

async function relayFetch(env: Env, s: KmSession | null, path: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}): Promise<Response> {
  return fetch(KM_RELAY_ORIGIN + path, {
    method: init.method ?? 'GET',
    headers: relayHeaders(env, s, init.headers),
    body: init.body,
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

function describeFetchError(err: unknown): string {
  if (err instanceof Error && err.name === 'TimeoutError') return '中継PC（km-relay）への接続がタイムアウトしました。社内PCの電源とログイン状態を確認してください。';
  return '中継PC（km-relay）に接続できませんでした。社内PCの電源とログイン状態を確認してください。';
}

// Cloudflare Access に弾かれた（サービストークン不一致）／トンネル未接続（社内PCが落ちている）を見分ける
function relayProblem(res: Response): string | null {
  if (res.status === 530 || res.status === 502 || res.status === 503 || res.status === 522 || res.status === 524) {
    return '中継PC（km-relay）がオフラインです。社内PCの電源を入れてログインすると自動で復帰します。';
  }
  if (res.headers.get('cf-access-domain') || res.headers.get('location')?.includes('cloudflareaccess.com')) {
    return '中継の認証（Cloudflare Access）に失敗しました。KM_RELAY_ACCESS_ID / SECRET を確認してください。';
  }
  return null;
}

// ---------- ログイン ----------
function parseKmxUser(html: string): KmUser | null {
  const m = html.match(/const\s+KMX_USER\s*=\s*\{([\s\S]*?)\};/);
  if (!m) return null;
  const user: Record<string, string> = {};
  for (const mm of m[1].matchAll(/(\w+)\s*:\s*("([^"]*)"|'([^']*)'|[^,\n]+)/g)) {
    user[mm[1]] = (mm[3] ?? mm[4] ?? mm[2]).trim();
  }
  return {
    operatorId: user.operatorId, accountId: user.accountId, roleId: user.roleId, companyId: user.companyId,
    loginName: (user.userName || '').replace(/^ログイン\s*/, '') || user.loginName,
    userName: user.loginName, officeName: user.officeName,
  };
}

export type LoginResult = { ok: true; session: KmSession } | { ok: false; message: string };

export async function kmLogin(env: Env): Promise<LoginResult> {
  const id = env.KM_OPERATOR_LOGIN_ID;
  const pw = env.KM_OPERATOR_PASSWORD;
  if (!id || !pw) return { ok: false, message: 'km-operator のログインID/パスワード（KM_OPERATOR_LOGIN_ID / KM_OPERATOR_PASSWORD）が未設定です。' };
  const s: KmSession = { cookies: {}, token: null, user: null, loggedInAt: 0 };
  try {
    const page = await relayFetch(env, s, LOGIN_PAGE);
    const p1 = relayProblem(page);
    if (p1) return { ok: false, message: p1 };
    absorbResponse(page, s);
    if (!s.cookies.JSESSIONID) return { ok: false, message: `km-operator のログイン画面からセッションを取得できませんでした（HTTP ${page.status}）。` };

    const login = await relayFetch(env, s, LOGIN_API, {
      method: 'POST',
      body: JSON.stringify({ loginName: id, password: pw }),
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', Origin: KM_ORIGIN, Referer: KM_ORIGIN + LOGIN_PAGE },
    });
    absorbResponse(login, s);
    const body = await login.json<{ isSuccess?: boolean; msgs?: Array<{ msg?: string }> }>().catch(() => null);
    if (!body?.isSuccess) {
      const msg = body?.msgs?.[0]?.msg;
      return { ok: false, message: msg ? `km-operator ログイン失敗: ${msg}` : `km-operator へのログインに失敗しました（HTTP ${login.status}）。` };
    }

    // 実画面を1回踏む（トークン更新＋ KMX_USER（operatorId 等）の取得）
    const main = await relayFetch(env, s, MAIN_PAGE);
    absorbResponse(main, s);
    const html = await main.text().catch(() => '');
    s.user = parseKmxUser(html);
    s.loggedInAt = Date.now();
    return { ok: true, session: s };
  } catch (err) {
    return { ok: false, message: describeFetchError(err) };
  }
}

// ---------- API 呼び出し（GET のみ・ログイン切れなら1回だけ再ログイン） ----------
function looksLoggedOut(res: Response, body: string): boolean {
  if (res.status === 401 || res.status === 403) return true;
  if (res.status >= 300 && res.status < 400) return true; // ログイン画面へのリダイレクト
  const ct = res.headers.get('content-type') ?? '';
  if (/text\/html/i.test(ct)) return true; // API なのに HTML（ログイン画面）が返った
  if (/"code"\s*:\s*"[A-Z]*SESSION|セッション.*(切れ|無効|タイムアウト)|ログインし(て|直)/.test(body)) return true;
  return false;
}

export async function ensureSession(env: Env, db: D1Database, force = false): Promise<LoginResult> {
  if (!force) {
    const s = await loadSession(db);
    if (s && s.cookies.JSESSIONID) return { ok: true, session: s };
  }
  const r = await kmLogin(env);
  if (r.ok) await saveSession(db, r.session);
  return r;
}

export async function kmApiGet(env: Env, db: D1Database, apiPath: string, search: string): Promise<KmResult> {
  const first = await ensureSession(env, db);
  if (!first.ok) return { ok: false, status: 503, message: first.message };
  let s = first.session;
  const path = `/kmx/api/v1/${apiPath}${search}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await relayFetch(env, s, path, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    } catch (err) {
      return { ok: false, status: 503, message: describeFetchError(err) };
    }
    const p = relayProblem(res);
    if (p) return { ok: false, status: 503, message: p };
    absorbResponse(res, s);
    const body = await res.text();
    if (looksLoggedOut(res, body)) {
      if (attempt === 1) return { ok: false, status: 502, message: 'km-operator のセッションを再確立できませんでした。' };
      const re = await ensureSession(env, db, true);
      if (!re.ok) return { ok: false, status: 503, message: re.message };
      s = re.session;
      continue;
    }
    await saveSession(db, s);
    return { ok: true, status: res.status, body, contentType: res.headers.get('content-type') ?? 'application/json;charset=UTF-8' };
  }
  return { ok: false, status: 502, message: 'km-operator への問い合わせに失敗しました。' };
}
