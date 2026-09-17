// km-operator（国際自動車グループの配車オペレーター画面 smartaxicenter.com）連携
// 「営業情報」画面が使っている trip_infos/search を叩いて、配車と流し営業の両方を含む
// 乗車・降車地点データを取得する。非公式API（HAR解析による調査結果）。詳細は docs/KM_OPERATOR_API.md 参照。
//
// fetch()はブラウザと違い自動のCookie jarを持たないため、admin_sr.tsのS.RIDE連携と同様に
// Set-CookieをMapに手動で蓄積し、以降のリクエストのCookieヘッダーに付与する。
// km-operatorは日本国外IPからのアクセスを遮断していることを確認済み（Workersの実行リージョンが
// 日本国外だとログイン自体が失敗しうる。エラーメッセージで判別できないため、まずタイムアウト/
// 接続エラーとして扱う）。

const KM_BASE = 'https://km-operator.smartaxicenter.com';
const KM_LOGIN_PAGE_URL = `${KM_BASE}/kmx/HS/HSHS/HSHS0199.do`;
const KM_LOGIN_API_URL = `${KM_BASE}/kmx/api/v1/auth/login`;
const KM_TRIP_INFOS_SEARCH_URL = `${KM_BASE}/kmx/api/v1/trip_infos/search`;
const KM_UA = 'Mozilla/5.0 (compatible; BentenKmPinCollector/1.0)';
const KM_TIMEOUT_MS = 15000;

type CookieJar = Map<string, string>;

function cookieHeader(jar: CookieJar): string {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

function mergeSetCookies(res: Response, jar: CookieJar): void {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  const list: string[] = typeof h.getSetCookie === 'function'
    ? h.getSetCookie()
    : (res.headers.get('set-cookie') ?? '')
        .split(/,(?=\s*[A-Za-z0-9_-]+=)/)
        .map((s) => s.trim())
        .filter(Boolean);
  for (const sc of list) {
    const pair = sc.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq <= 0) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

export type KmLoginResult =
  | { ok: true; jar: CookieJar }
  | { ok: false; message: string };

// ①ログイン画面GET（JSESSIONID等の発行）→②/api/v1/auth/loginにJSON POST
// ログイン成功時は新しいSet-Cookieが発行されない仕様（①で発行済みの同じセッションが
// 認証済みに切り替わるだけ）なので、①のCookieをそのまま使い続ける。
export async function kmOperatorLogin(loginId: string, password: string): Promise<KmLoginResult> {
  const jar: CookieJar = new Map();
  try {
    const loginPage = await fetch(KM_LOGIN_PAGE_URL, {
      headers: { 'User-Agent': KM_UA },
      signal: AbortSignal.timeout(KM_TIMEOUT_MS),
    });
    mergeSetCookies(loginPage, jar);
    if (!jar.has('JSESSIONID')) {
      return { ok: false, message: 'km-operatorのログイン画面からセッションCookieを取得できませんでした（日本国外IP判定でブロックされている可能性があります）' };
    }

    const loginRes = await fetch(KM_LOGIN_API_URL, {
      method: 'POST',
      headers: {
        'User-Agent': KM_UA,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: cookieHeader(jar),
      },
      body: JSON.stringify({ loginName: loginId, password }),
      signal: AbortSignal.timeout(KM_TIMEOUT_MS),
    });
    mergeSetCookies(loginRes, jar);
    const body = await loginRes.json<{ isSuccess?: boolean; msgs?: Array<{ msg?: string }> }>().catch(() => null);
    if (!body?.isSuccess) {
      const msg = body?.msgs?.[0]?.msg;
      return { ok: false, message: msg ? `km-operatorログイン失敗: ${msg}` : 'km-operatorへのログインに失敗しました（ID/パスワードが正しくないか、km-operator側の仕様変更の可能性）' };
    }
    return { ok: true, jar };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    return {
      ok: false,
      message: isTimeout
        ? 'km-operatorへの接続がタイムアウトしました（日本国外IP判定でブロックされている可能性があります）'
        : 'km-operatorへの接続中にエラーが発生しました',
    };
  }
}

export interface KmTripInfo {
  tripId: string;
  ticketNumber?: string;
  ticketStatus?: string;
  onServiceAt?: string;
  onServiceLatitude?: string;
  onServiceLongitude?: string;
  outServiceAt?: string;
  outServiceLatitude?: string;
  outServiceLongitude?: string;
  distance?: string;
  driveMin?: string;
  fare?: string;
  customerFullNameKana?: string;
  passengerNameKana?: string;
}

export type KmTripSearchResult =
  | { ok: true; driverName: string | null; trips: KmTripInfo[] }
  | { ok: false; notFound: true } // 対象車両なし／その日時に勤怠なし（想定内・エラー扱いしない）
  | { ok: false; notFound: false; message: string };

// 1回の呼び出し＝1台・1シフト分。dateは "YYYY/MM/DD HH:mm" 形式（JST）。
export async function kmOperatorSearchTripInfos(
  jar: CookieJar,
  wirelessLineNumber: number,
  date: string,
): Promise<KmTripSearchResult> {
  const url = `${KM_TRIP_INFOS_SEARCH_URL}?wirelessLineNumber=${encodeURIComponent(String(wirelessLineNumber))}&userName=&date=${encodeURIComponent(date)}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': KM_UA,
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: cookieHeader(jar),
      },
      signal: AbortSignal.timeout(KM_TIMEOUT_MS),
    });
    mergeSetCookies(res, jar);
    const body = await res.json<{
      isSuccess?: boolean;
      driverName?: string;
      tripInfoList?: Array<Record<string, unknown>>;
      msgs?: Array<{ code?: string; msg?: string }>;
    }>().catch(() => null);

    if (!body) return { ok: false, notFound: false, message: 'km-operatorからの応答を解析できませんでした' };

    if (!body.isSuccess) {
      // EHS006200L004（対象の勤怠が見つかりませんでした）／「対象の車両が見つかりませんでした」系は想定内
      const msg = body.msgs?.[0]?.msg ?? '';
      const isNotFound = /見つかりませんでした/.test(msg);
      if (isNotFound) return { ok: false, notFound: true };
      return { ok: false, notFound: false, message: msg || 'trip_infos/searchが失敗しました' };
    }

    const trips: KmTripInfo[] = (body.tripInfoList ?? [])
      .filter((t) => typeof t.tripId === 'string' || typeof t.tripId === 'number')
      .map((t) => ({
        tripId: String(t.tripId),
        ticketNumber: t.ticketNumber != null ? String(t.ticketNumber) : undefined,
        ticketStatus: t.ticketStatus != null ? String(t.ticketStatus) : undefined,
        onServiceAt: t.onServiceAt != null ? String(t.onServiceAt) : undefined,
        onServiceLatitude: t.onServiceLatitude != null ? String(t.onServiceLatitude) : undefined,
        onServiceLongitude: t.onServiceLongitude != null ? String(t.onServiceLongitude) : undefined,
        outServiceAt: t.outServiceAt != null ? String(t.outServiceAt) : undefined,
        outServiceLatitude: t.outServiceLatitude != null ? String(t.outServiceLatitude) : undefined,
        outServiceLongitude: t.outServiceLongitude != null ? String(t.outServiceLongitude) : undefined,
        distance: t.distance != null ? String(t.distance) : undefined,
        driveMin: t.driveMin != null ? String(t.driveMin) : undefined,
        fare: t.fare != null ? String(t.fare) : undefined,
        customerFullNameKana: t.customerFullNameKana != null ? String(t.customerFullNameKana) : undefined,
        passengerNameKana: t.passengerNameKana != null ? String(t.passengerNameKana) : undefined,
      }));

    return { ok: true, driverName: body.driverName ?? null, trips };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    return { ok: false, notFound: false, message: isTimeout ? '接続タイムアウト' : '接続エラー' };
  }
}

// 現在時刻（JST）を km-operator が受け付ける "YYYY/MM/DD HH:mm" 形式にフォーマット
export function kmNowParam(): string {
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${nowJST.getUTCFullYear()}/${pad(nowJST.getUTCMonth() + 1)}/${pad(nowJST.getUTCDate())} ${pad(nowJST.getUTCHours())}:${pad(nowJST.getUTCMinutes())}`;
}
