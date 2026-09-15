// 設定: SR（S.RIDE 迎車注文リスト分析）
// S.RIDE管理画面から書き出す「注文リストCSV」を取り込み、
//   ・どのエリアからよく呼ばれているか（迎車地の市区町村別ランキング／地図ヒートマップ・点マップ／同一地点の繰り返し）
//   ・曜日別の傾向（エリア×曜日クロス集計）
//   ・同じ電話番号からの繰り返し利用（リピーター、利用回数順・累計金額順）
// を分析する。ページ権限(settings.sr)に加え、CC名簿と同様に開くたび専用パスワードを
// ヘッダー(X-SR-Password)で要求する二重ロック方式。
// 「探車失敗」（配車できなかった注文）は実際の乗車ではないため、エリア/依頼元/時間帯/リピーター等の
// ランキング系集計からはデフォルトで除外する（画面上部のチェックで含めることも可能）。
// 上部サマリーカードの総件数・完了・探車失敗・キャンセル件数だけは、除外設定に関わらず常に全件で表示する。
// 地図は「空港・ディズニー定額マップ」(html/airport_map_paths.ts) の東京23区＋武蔵野市・三鷹市の
// 境界パスをそのまま流用する（それ以外の地域は表には出るが地図には出せない）。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout, safeJson, escHtml } from '../html/layout';
import { ADMIN_PATH } from '../config';
import { settingsSubHeader } from './admin';
import { AIRPORT_MAP_AREAS, AIRPORT_MAP_VIEWBOX } from '../html/airport_map_paths';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

// パスワードはソースに書かず wrangler secret put SR_PASSWORD で設定する（wrangler.toml参照）
function checkPassword(c: { req: { header: (n: string) => string | undefined }; env: Env }): boolean {
  const expected = c.env.SR_PASSWORD;
  return !!expected && c.req.header('X-SR-Password') === expected;
}

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<string> {
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?')
    .bind(c.get('adminId')).first<{ username: string }>();
  return row?.username ?? `id:${c.get('adminId')}`;
}

function isValidDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// ===== S.RIDE管理画面への自動ログイン＆CSV取得 =====
// S.RIDEの「CSV出力」ボタンが裏側で叩いているAPIを直接呼び出す。Cloudflare Workersの
// fetch()はブラウザと違い自動のCookie jarを持たないため、リダイレクトを手動で追跡しながら
// Set-CookieをMapに蓄積し、次のリクエストのCookieヘッダーに手動で付与する。
const SRIDE_REDIRECT_URL = 'https://api.sride.taxi/v2/redirect/manager';
const SRIDE_CSV_URL = 'https://api.sride.taxi/v2/order/orders/csv';
const SRIDE_UA = 'Mozilla/5.0 (compatible; BentenSRImporter/1.0)';

type CookieJar = Map<string, string>;

function srideCookieHeader(jar: CookieJar): string {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

function srideMergeSetCookies(res: Response, jar: CookieJar): void {
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

// リダイレクトを手動で追跡しつつ、3xxでなくなった時点のレスポンスを返す（最大10ホップ）。
async function srideFollow(
  url: string,
  init: { method: 'GET' | 'POST'; body?: string; headers?: Record<string, string> },
  jar: CookieJar,
): Promise<Response> {
  let currentUrl = url;
  let method: 'GET' | 'POST' = init.method;
  let body = init.body;
  const extraHeaders = init.headers ?? {};
  for (let hop = 0; hop < 10; hop++) {
    const headers: Record<string, string> = {
      'User-Agent': SRIDE_UA,
      Cookie: srideCookieHeader(jar),
      ...(hop === 0 ? extraHeaders : {}),
    };
    const res = await fetch(currentUrl, {
      method,
      headers,
      body: hop === 0 ? body : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    srideMergeSetCookies(res, jar);
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      currentUrl = new URL(loc, currentUrl).toString();
      method = 'GET';
      body = undefined;
      continue;
    }
    return res;
  }
  throw new Error('リダイレクトの回数が上限を超えました（S.RIDE側の仕様変更の可能性）');
}

async function srideLoginAndFetchCsv(
  loginId: string,
  password: string,
  orderDateFrom: string,
  orderDateTo: string,
): Promise<{ ok: true; bytes: ArrayBuffer } | { ok: false; status: 400 | 401 | 500 | 502; message: string }> {
  const jar: CookieJar = new Map();

  const loginPage = await srideFollow(SRIDE_REDIRECT_URL, { method: 'GET' }, jar);
  const loginHtml = await loginPage.text();
  const actionMatch = loginHtml.match(/<form[^>]+action="([^"]+)"/i);
  if (!actionMatch) {
    return { ok: false, status: 502, message: 'ログインフォームの抽出に失敗しました（S.RIDE側の画面仕様が変わった可能性があります）' };
  }
  const actionUrl = actionMatch[1].replace(/&amp;/g, '&');

  const form = new URLSearchParams({ username: loginId, password });
  const afterLogin = await srideFollow(
    actionUrl,
    { method: 'POST', body: form.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    jar,
  );
  const afterLoginText = await afterLogin.text().catch(() => '');
  if (afterLoginText.includes('無効なユーザー名またはパスワードです')) {
    return { ok: false, status: 401, message: 'S.RIDEのログインID・パスワードが正しくありません' };
  }
  if (!jar.has('SESSION')) {
    return { ok: false, status: 502, message: 'S.RIDEへのログインに失敗しました（セッションCookieを取得できませんでした）' };
  }

  const csvUrl = `${SRIDE_CSV_URL}?order_date_from=${encodeURIComponent(orderDateFrom)}&order_date_to=${encodeURIComponent(orderDateTo)}`;
  const csvRes = await fetch(csvUrl, {
    headers: { 'User-Agent': SRIDE_UA, Cookie: srideCookieHeader(jar) },
    signal: AbortSignal.timeout(20000),
  });
  if (!csvRes.ok) {
    return { ok: false, status: 502, message: `CSV取得に失敗しました（S.RIDE側ステータス: ${csvRes.status}）` };
  }
  const bytes = await csvRes.arrayBuffer();
  return { ok: true, bytes };
}

// sr_orders のカラム（order_no先頭、以降はCSV列準拠 + 派生列pickup_area）。
// INSERT文の組み立てとクライアント側の送信ペイロード双方でこの並びに合わせる。
const SR_COLUMNS = [
  'order_no', 'status', 'dispatch_status', 'memo', 'customer_name', 'member_type', 'phone',
  'source_type', 'fare_type', 'fixed_route', 'order_type', 'flat_fare_type', 'ordered_at',
  'pickup_address', 'pickup_area', 'pickup_detail', 'destination', 'order_memo1', 'order_memo2',
  'substitute_request', 'accepted_at', 'eta_at', 'arrived_at', 'arrived_point', 'boarded_at', 'boarded_point',
  'dropped_at', 'dropped_point', 'ride_minutes', 'radio_no', 'plate_no', 'car_type', 'car_color',
  'driver_name', 'driver_id', 'group_name', 'group_code', 'company_name', 'company_code', 'office_name', 'office_code',
  'door_no', 'individual_taxi_name', 'arrived_message_at', 'payment_method_ordered', 'amount_collected',
  'payment_method_actual', 'fixed_fare', 'highway_fee', 'cancelled_at', 'cancel_reason', 'cancel_fee_flag',
] as const;
const SR_INT_COLUMNS = new Set(['ride_minutes', 'amount_collected', 'fixed_fare', 'highway_fee']);

const SR_INSERT_SQL = (() => {
  const placeholders = SR_COLUMNS.map(() => '?').join(', ');
  const updateSet = SR_COLUMNS.filter(col => col !== 'order_no').map(col => `${col} = excluded.${col}`).join(', ');
  return `INSERT INTO sr_orders (${SR_COLUMNS.join(', ')}) VALUES (${placeholders})
    ON CONFLICT(order_no) DO UPDATE SET ${updateSet}, updated_at = datetime('now','localtime')`;
})();

// 分析系クエリの WHERE 句を組み立てる。weekday(0=日〜6=土)・excludeFailed(探車失敗を除く)は任意。
function srWhere(start: string, end: string, opts: { weekday?: number; excludeFailed?: boolean }): { sql: string; params: (string | number)[] } {
  let sql = 'ordered_at BETWEEN ? AND ?';
  const params: (string | number)[] = [start, end];
  if (opts.weekday !== undefined) {
    sql += " AND CAST(strftime('%w', ordered_at) AS INTEGER) = ?";
    params.push(opts.weekday);
  }
  if (opts.excludeFailed) {
    sql += " AND dispatch_status <> '探車失敗'";
  }
  return { sql, params };
}

// ===== ページ =====
app.get('/settings/sr', async (c) => {
  const html = settingsSubHeader('SR（S.RIDE 迎車注文リスト分析）') + `
    <div style="max-width:1180px;">
      <div id="sr-gate" style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:40px 24px;text-align:center;max-width:360px;margin:60px auto;">
        <div style="font-size:32px;margin-bottom:10px;">🔒</div>
        <div style="font-size:15px;font-weight:700;color:#1e3a5f;margin-bottom:14px;">SR分析はパスワードが必要です</div>
        <input type="password" id="sr-pw-input" placeholder="パスワード" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:10px 12px;font-size:15px;text-align:center;letter-spacing:0.1em;box-sizing:border-box;margin-bottom:10px;">
        <div id="sr-pw-error" style="display:none;color:#dc2626;font-size:12px;margin-bottom:10px;">パスワードが違います</div>
        <button type="button" id="sr-pw-submit" style="width:100%;padding:10px;background:#1e3a5f;color:white;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">開く</button>
      </div>

      <div id="sr-main" style="display:none;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
          <button type="button" class="sr-tab-btn" data-tab="analysis" onclick="srShowTab('analysis')">📊 分析</button>
          <button type="button" class="sr-tab-btn" data-tab="upload" onclick="srShowTab('upload')">📥 データ取込</button>
        </div>

        <!-- ===== 分析タブ ===== -->
        <div class="sr-tab-panel" data-tab="analysis" style="display:none;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px;background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:12px 16px;">
            <label style="font-size:12px;color:#374151;">期間：</label>
            <input type="date" id="sr-start" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
            〜
            <input type="date" id="sr-end" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
            <label style="font-size:12px;color:#374151;margin-left:6px;">曜日：</label>
            <select id="sr-weekday" onchange="srLoadSummary()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
              <option value="">全曜日</option>
              <option value="0">日</option><option value="1">月</option><option value="2">火</option>
              <option value="3">水</option><option value="4">木</option><option value="5">金</option><option value="6">土</option>
            </select>
            <label style="font-size:12px;color:#374151;display:flex;align-items:center;gap:5px;margin-left:6px;cursor:pointer;">
              <input type="checkbox" id="sr-include-failed" onchange="srLoadSummary()"> 探車失敗を含める
            </label>
            <button type="button" onclick="srLoadSummary()" style="padding:7px 16px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">絞り込み</button>
            <button type="button" onclick="srClearRange()" style="padding:7px 14px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">全期間</button>
            <span id="sr-loading" style="font-size:12px;color:#9ca3af;margin-left:6px;"></span>
          </div>
          <div id="sr-filter-note" style="font-size:11px;color:#9ca3af;margin-bottom:12px;padding-left:4px;"></div>

          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
            <button type="button" class="sr-subtab-btn" data-subtab="now" onclick="srShowSubTab('now')">🕐 今すぐ</button>
            <button type="button" class="sr-subtab-btn" data-subtab="overview" onclick="srShowSubTab('overview')">概要</button>
            <button type="button" class="sr-subtab-btn" data-subtab="area" onclick="srShowSubTab('area')">エリア</button>
            <button type="button" class="sr-subtab-btn" data-subtab="map" onclick="srShowSubTab('map')">地図</button>
            <button type="button" class="sr-subtab-btn" data-subtab="spot" onclick="srShowSubTab('spot')">頻出地点</button>
            <button type="button" class="sr-subtab-btn" data-subtab="repeater" onclick="srShowSubTab('repeater')">リピーター</button>
          </div>

          <!-- ---- サブタブ: 今すぐ（現在時刻の前後で一番単価が良い場所） ---- -->
          <div class="sr-subtab-panel" data-subtab="now" style="display:none;">
            <div style="background:linear-gradient(135deg,#1e3a8a,#1d4ed8);border-radius:12px;padding:20px 24px;color:white;margin-bottom:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                <div style="font-size:14px;font-weight:700;">🕐 今すぐ向かうなら</div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                  <label style="font-size:12px;opacity:0.9;">現在地：</label>
                  <select id="sr-now-ward" onchange="srLoadNow()" style="border:1px solid rgba(255,255,255,0.5);border-radius:6px;padding:4px 8px;font-size:12px;background:rgba(255,255,255,0.15);color:white;">
                    <option value="" style="color:#111827;">全体（エリア指定なし）</option>
                    ${AIRPORT_MAP_AREAS.map((a) => `<option value="${escHtml('東京都' + a.label)}" style="color:#111827;">${escHtml(a.label)}</option>`).join('')}
                  </select>
                  <span id="sr-now-clock" style="font-size:13px;opacity:0.9;"></span>
                  <button type="button" onclick="srLoadNow()" style="padding:5px 14px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.5);border-radius:14px;font-size:11px;color:white;cursor:pointer;">更新</button>
                </div>
              </div>
              <div id="sr-now-headline" style="font-size:21px;font-weight:700;margin-top:14px;">読み込み中…</div>
              <div id="sr-now-sub" style="font-size:12px;opacity:0.9;margin-top:4px;"></div>
            </div>

            <div id="sr-now-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;" class="sr-grid2">
              <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
                <div id="sr-now-spot-title" style="padding:12px 18px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:700;color:#1a3a5c;">この時間帯の高単価スポット（住所）</div>
                <div style="overflow-x:auto;">
                  <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead style="background:#f9fafb;">
                      <tr>
                        <th style="padding:7px 12px;text-align:left;font-size:11px;color:#6b7280;">迎車地（住所）</th>
                        <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">平均単価</th>
                        <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">実績</th>
                      </tr>
                    </thead>
                    <tbody id="sr-now-spot-tbody"></tbody>
                  </table>
                </div>
              </div>
              <div id="sr-now-area-card" style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
                <div style="padding:12px 18px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:700;color:#1a3a5c;">この時間帯の高単価エリア（全体・上位5）</div>
                <div style="overflow-x:auto;">
                  <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead style="background:#f9fafb;">
                      <tr>
                        <th style="padding:7px 12px;text-align:left;font-size:11px;color:#6b7280;">エリア</th>
                        <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">平均単価</th>
                        <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">実績</th>
                      </tr>
                    </thead>
                    <tbody id="sr-now-area-tbody"></tbody>
                  </table>
                </div>
              </div>
            </div>
            <div style="font-size:11px;color:#9ca3af;margin-top:10px;">※ これまでの全データから、現在時刻の前後1時間（計3時間分）に絞って平均収受金額が高い順に集計しています。探車失敗や、実績件数が少ない住所（2件未満）・エリア（3件未満）は除外しています。曜日は問わず集計します。</div>
          </div>

          <!-- ---- サブタブ: 概要 ---- -->
          <div class="sr-subtab-panel" data-subtab="overview" style="display:none;">
            <div id="sr-cards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:18px;"></div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;" class="sr-grid2">
              <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:16px 18px;">
                <div style="font-size:13px;font-weight:700;color:#1a3a5c;margin-bottom:10px;">時間帯別 件数</div>
                <div id="sr-hour-chart" style="display:flex;align-items:flex-end;gap:2px;height:120px;"></div>
              </div>
              <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:16px 18px;">
                <div style="font-size:13px;font-weight:700;color:#1a3a5c;margin-bottom:10px;">曜日別 件数</div>
                <div id="sr-weekday-chart" style="display:flex;align-items:flex-end;gap:6px;height:120px;"></div>
              </div>
            </div>

            <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:16px 18px;">
              <div style="font-size:13px;font-weight:700;color:#1a3a5c;margin-bottom:10px;">依頼元別 内訳</div>
              <div id="sr-source-list" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
            </div>
          </div>

          <!-- ---- サブタブ: エリア ---- -->
          <div class="sr-subtab-panel" data-subtab="area" style="display:none;">
            <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;margin-bottom:16px;">
              <div style="padding:12px 18px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:700;color:#1a3a5c;">
                エリア×曜日 クロス集計（件数が多い上位15エリア。期間は上の絞り込みに従いますが、曜日プルダウンの影響は受けません）
              </div>
              <div style="overflow-x:auto;">
                <table id="sr-area-weekday-table" style="width:100%;border-collapse:collapse;min-width:560px;"></table>
              </div>
            </div>

            <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 18px;border-bottom:1px solid #f3f4f6;">
                <div style="font-size:13px;font-weight:700;color:#1a3a5c;">エリア別ランキング（迎車地・市区町村単位）</div>
                <div style="display:flex;gap:6px;">
                  <span style="font-size:11px;color:#9ca3af;align-self:center;">並び替え：</span>
                  <button type="button" class="sr-area-sort-btn" data-key="c" onclick="srSetAreaSort('c')">件数順</button>
                  <button type="button" class="sr-area-sort-btn" data-key="revenue" onclick="srSetAreaSort('revenue')">売上合計順</button>
                </div>
              </div>
              <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:760px;">
                  <thead style="background:#f9fafb;">
                    <tr>
                      <th style="padding:7px 12px;text-align:left;font-size:11px;color:#6b7280;">エリア</th>
                      <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">件数</th>
                      <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">割合</th>
                      <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">完了</th>
                      <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">探車失敗</th>
                      <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">失敗率</th>
                      <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">平均収受金額</th>
                      <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">売上合計</th>
                    </tr>
                  </thead>
                  <tbody id="sr-area-tbody"></tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- ---- サブタブ: 地図 ---- -->
          <div class="sr-subtab-panel" data-subtab="map" style="display:none;">
            <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:16px 18px;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
                <div style="font-size:13px;font-weight:700;color:#1a3a5c;">迎車地マップ（東京23区＋武蔵野市・三鷹市）</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                  <span style="font-size:11px;color:#9ca3af;">指標：</span>
                  <button type="button" class="sr-map-btn" data-metric="count" onclick="srSetMapMetric('count')">件数</button>
                  <button type="button" class="sr-map-btn" data-metric="revenue" onclick="srSetMapMetric('revenue')">売上合計</button>
                  <span style="width:1px;height:16px;background:#e5e7eb;margin:0 4px;"></span>
                  <span style="font-size:11px;color:#9ca3af;">表示：</span>
                  <button type="button" class="sr-map-btn" data-mode="heat" onclick="srSetMapMode('heat')">ヒートマップ</button>
                  <button type="button" class="sr-map-btn" data-mode="dot" onclick="srSetMapMode('dot')">点マップ</button>
                </div>
              </div>
              <div id="sr-map-legend" style="display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:#374151;margin-bottom:10px;"></div>
              <div id="sr-map-svg"></div>
              <div style="font-size:11px;color:#9ca3af;margin-top:8px;">※ 対応エリアは東京23区＋武蔵野市・三鷹市のみです。それ以外（近隣県など）は「エリア」タブの表には含まれますが、この地図には表示されません。</div>
            </div>
          </div>

          <!-- ---- サブタブ: 頻出地点 ---- -->
          <div class="sr-subtab-panel" data-subtab="spot" style="display:none;">
            <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
              <div style="padding:12px 18px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:700;color:#1a3a5c;">頻出乗車地点（同一住所からの繰り返し呼び出し、2回以上）</div>
              <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:640px;">
                  <thead style="background:#f9fafb;">
                    <tr>
                      <th style="padding:7px 12px;text-align:left;font-size:11px;color:#6b7280;">迎車地（住所）</th>
                      <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">件数</th>
                      <th style="padding:7px 12px;text-align:left;font-size:11px;color:#6b7280;">最終利用</th>
                    </tr>
                  </thead>
                  <tbody id="sr-spot-tbody"></tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- ---- サブタブ: リピーター ---- -->
          <div class="sr-subtab-panel" data-subtab="repeater" style="display:none;">
            <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 18px;border-bottom:1px solid #f3f4f6;">
                <div style="font-size:13px;font-weight:700;color:#1a3a5c;">
                  リピーター一覧（電話番号が記録されている注文のみ集計。2回以上利用）
                </div>
                <div style="display:flex;gap:6px;">
                  <span style="font-size:11px;color:#9ca3af;align-self:center;">並び替え：</span>
                  <button type="button" class="sr-repeater-sort-btn" data-key="count" onclick="srSetRepeaterSort('count')">利用回数順</button>
                  <button type="button" class="sr-repeater-sort-btn" data-key="value" onclick="srSetRepeaterSort('value')">累計金額順（高単価×高頻度）</button>
                </div>
              </div>
              <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:760px;">
                  <thead style="background:#f9fafb;">
                    <tr>
                      <th style="padding:7px 12px;text-align:left;font-size:11px;color:#6b7280;">電話番号</th>
                      <th style="padding:7px 12px;text-align:left;font-size:11px;color:#6b7280;">お客様名（最新）</th>
                      <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">利用回数</th>
                      <th style="padding:7px 12px;text-align:left;font-size:11px;color:#6b7280;">初回</th>
                    <th style="padding:7px 12px;text-align:left;font-size:11px;color:#6b7280;">最終</th>
                    <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">累計収受金額</th>
                    <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">平均単価</th>
                    <th style="padding:7px 12px;"></th>
                  </tr>
                </thead>
                <tbody id="sr-repeater-tbody"></tbody>
              </table>
            </div>
          </div>
          </div>
        </div>

        <!-- ===== データ取込タブ ===== -->
        <div class="sr-tab-panel" data-tab="upload" style="display:none;">
          <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
            <h2 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">注文リストCSVの取込</h2>
            <p style="font-size:12px;color:#6b7280;margin:0 0 14px;line-height:1.7;">
              S.RIDE管理画面からダウンロードした「注文リスト」CSV（Shift-JIS）を選択してください。注文番号をキーに、既存の注文は最新の内容へ更新、未登録の注文は追加します。同じ注文が複数回のCSVに重複して含まれていても問題ありません。
            </p>

            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
              <div style="font-size:12px;font-weight:700;color:#1a3a5c;margin-bottom:8px;">S.RIDEから直接取得</div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <label style="font-size:12px;color:#6b7280;">開始日
                  <input type="date" id="sr-remote-start" style="margin-left:4px;padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;">
                </label>
                <label style="font-size:12px;color:#6b7280;">終了日
                  <input type="date" id="sr-remote-end" style="margin-left:4px;padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px;">
                </label>
                <button type="button" id="sr-remote-fetch-btn" onclick="srFetchRemote()" style="padding:6px 16px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">取得する</button>
              </div>
              <div id="sr-remote-status" style="font-size:11px;color:#9ca3af;margin-top:6px;"></div>
            </div>

            <input type="file" id="sr-csv-file" accept=".csv,.CSV" style="display:none;" onchange="srHandleFile(this.files[0])">
            <label id="sr-drop-zone" for="sr-csv-file"
              style="display:block;border:2px dashed #d1d5db;border-radius:8px;padding:28px;text-align:center;cursor:pointer;margin-bottom:14px;"
              ondragover="event.preventDefault();this.style.borderColor='#1a3a5c'"
              ondragleave="this.style.borderColor='#d1d5db'"
              ondrop="srHandleDrop(event)">
              <div style="font-size:13px;color:#6b7280;">クリックまたはドラッグでCSVファイルを選択</div>
              <div style="font-size:11px;color:#9ca3af;margin-top:4px;">SRIDE_OrderList形式（Shift-JIS）</div>
            </label>

            <div id="sr-progress" style="display:none;margin-bottom:10px;">
              <div style="font-size:12px;color:#374151;margin-bottom:4px;" id="sr-progress-label">処理中…</div>
              <div style="background:#e5e7eb;border-radius:4px;height:6px;overflow:hidden;">
                <div id="sr-progress-bar" style="background:#1a3a5c;height:6px;width:0%;transition:width 0.2s;"></div>
              </div>
            </div>

            <div id="sr-preview" style="display:none;background:#f9fafb;border-radius:8px;padding:14px 16px;margin-bottom:12px;font-size:13px;color:#374151;"></div>

            <div id="sr-upload-actions" style="display:none;justify-content:flex-end;gap:10px;">
              <button onclick="srClearImport()" style="padding:8px 16px;background:#f3f4f6;color:#374151;border:none;border-radius:6px;font-size:13px;cursor:pointer;">キャンセル</button>
              <button id="sr-import-btn" onclick="srExecuteImport()" style="padding:8px 20px;background:#166534;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">取り込む</button>
            </div>

            <div id="sr-import-result" style="display:none;margin-top:12px;font-size:13px;"></div>
          </div>

          <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
            <div style="padding:12px 18px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:700;color:#1a3a5c;">取込履歴</div>
            <div style="overflow-x:auto;">
              <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead style="background:#f9fafb;">
                  <tr>
                    <th style="padding:7px 12px;text-align:left;font-size:11px;color:#6b7280;">日時</th>
                    <th style="padding:7px 12px;text-align:left;font-size:11px;color:#6b7280;">ファイル名</th>
                    <th style="padding:7px 12px;text-align:left;font-size:11px;color:#6b7280;">取込者</th>
                    <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">処理件数</th>
                    <th style="padding:7px 12px;text-align:right;font-size:11px;color:#6b7280;">取込後 総件数</th>
                  </tr>
                </thead>
                <tbody id="sr-uploads-tbody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== リピーター詳細モーダル ===== -->
      <div id="sr-customer-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;padding:16px;">
        <div style="background:white;border-radius:12px;padding:22px;width:100%;max-width:820px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h3 id="sr-customer-title" style="font-size:15px;font-weight:700;color:#1e3a5f;margin:0;">利用履歴</h3>
            <button type="button" onclick="srCloseCustomerModal()" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:680px;">
              <thead style="background:#f9fafb;">
                <tr>
                  <th style="padding:6px 10px;text-align:left;color:#6b7280;">注文日時</th>
                  <th style="padding:6px 10px;text-align:left;color:#6b7280;">迎車地</th>
                  <th style="padding:6px 10px;text-align:left;color:#6b7280;">目的地</th>
                  <th style="padding:6px 10px;text-align:left;color:#6b7280;">ドライバー</th>
                  <th style="padding:6px 10px;text-align:left;color:#6b7280;">状況</th>
                  <th style="padding:6px 10px;text-align:right;color:#6b7280;">収受金額</th>
                </tr>
              </thead>
              <tbody id="sr-customer-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <style>
      .sr-tab-btn { padding:9px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #d1d5db;background:white;color:#374151; }
      .sr-tab-btn.active { background:#1a3a5c;border-color:#1a3a5c;color:white; }
      .sr-card { background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:14px 16px; }
      .sr-card .num { font-size:22px;font-weight:700;color:#1a3a5c; }
      .sr-card .lbl { font-size:11px;color:#6b7280;margin-top:2px; }
      .sr-map-btn, .sr-area-sort-btn, .sr-repeater-sort-btn {
        padding:4px 12px;border-radius:14px;font-size:11px;font-weight:600;cursor:pointer;border:1px solid #d1d5db;background:white;color:#374151;
      }
      .sr-map-btn.active, .sr-area-sort-btn.active, .sr-repeater-sort-btn.active { background:#1d4ed8;border-color:#1d4ed8;color:white; }
      .sr-subtab-btn {
        padding:6px 16px;border-radius:16px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid #cbd5e1;background:#f8fafc;color:#475569;
      }
      .sr-subtab-btn.active { background:#1d4ed8;border-color:#1d4ed8;color:white; }
      @media (max-width:800px) { .sr-grid2 { grid-template-columns:1fr !important; } }
    </style>

    <script>
    var ADMIN_PATH = ${JSON.stringify(ADMIN_PATH)};
    var MAP_AREAS = ${safeJson(AIRPORT_MAP_AREAS)};
    var MAP_VIEWBOX = ${JSON.stringify(AIRPORT_MAP_VIEWBOX)};
    var srPassword = '';

    // ===== パスワードゲート =====
    document.getElementById('sr-pw-submit').addEventListener('click', srTryOpen);
    document.getElementById('sr-pw-input').addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); srTryOpen(); } });

    function srApi(method, path, body) {
      return fetch(ADMIN_PATH + '/api/sr' + path, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'X-SR-Password': srPassword },
        body: body ? JSON.stringify(body) : undefined,
      }).then(function(r) {
        if (r.status === 401) { throw new Error('PASSWORD'); }
        return r.json();
      });
    }

    function srTryOpen() {
      srPassword = document.getElementById('sr-pw-input').value;
      srApi('GET', '/summary').then(function() {
        document.getElementById('sr-gate').style.display = 'none';
        document.getElementById('sr-main').style.display = 'block';
        srShowTab('analysis');
      }).catch(function() {
        srPassword = '';
        document.getElementById('sr-pw-error').style.display = 'block';
      });
    }

    function srShowTab(id) {
      document.querySelectorAll('.sr-tab-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === id); });
      document.querySelectorAll('.sr-tab-panel').forEach(function(p) { p.style.display = (p.dataset.tab === id) ? 'block' : 'none'; });
      if (id === 'analysis') { srShowSubTab('now'); srLoadSummary(); }
      if (id === 'upload') srLoadUploads();
    }

    // 横タブ（分析タブ内の今すぐ／概要／エリア／地図／頻出地点／リピーター切替）。
    // 「今すぐ」以外は srLoadSummary() で毎回まとめて取得済みなので、ここでは表示切替のみ行う。
    function srShowSubTab(id) {
      if (id === 'now') srLoadNow();
      document.querySelectorAll('.sr-subtab-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.subtab === id); });
      document.querySelectorAll('.sr-subtab-panel').forEach(function(p) { p.style.display = (p.dataset.subtab === id) ? 'block' : 'none'; });
    }

    function srEsc(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function srYen(n) { return (n == null) ? '—' : Math.round(n).toLocaleString() + '円'; }
    function srPct(a, b) { return b > 0 ? Math.round(a / b * 1000) / 10 + '%' : '—'; }

    // ===== 今すぐ（現在時刻の前後1時間で一番単価が良い場所） =====
    function srLoadNow() {
      var now = new Date();
      var hour = now.getHours();
      var ward = document.getElementById('sr-now-ward').value;
      document.getElementById('sr-now-clock').textContent = '現在 ' + String(hour).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      var qs = 'hour=' + hour + (ward ? '&area=' + encodeURIComponent(ward) : '');
      srApi('GET', '/now?' + qs).then(function(data) {
        srRenderNow(data);
      }).catch(function() {
        document.getElementById('sr-now-headline').textContent = '読み込みに失敗しました';
        document.getElementById('sr-now-sub').textContent = '';
      });
    }

    function srRenderNow(data) {
      var spots = data.spots || [];
      var areas = data.areas || [];
      var ward = data.area || '';
      var hoursLabel = (data.hours || []).slice().sort(function(a, b) { return a - b; })
        .map(function(h) { return String(h).padStart(2, '0') + '時台'; }).join('・');

      document.getElementById('sr-now-spot-title').textContent = ward
        ? 'この時間帯の高単価スポット（' + ward + '内）'
        : 'この時間帯の高単価スポット（住所・全体）';

      if (spots.length) {
        var top = spots[0];
        document.getElementById('sr-now-headline').textContent = '📍 ' + top.addr;
        var lowSample = top.c < 2 ? '　※実績1件のみの参考値です' : '';
        document.getElementById('sr-now-sub').textContent = top.area + '　平均単価 ' + srYen(top.avg_fare) + '（実績' + top.c + '件／' + hoursLabel + 'の実績から算出）' + lowSample;
      } else if (!ward && areas.length) {
        var topA = areas[0];
        document.getElementById('sr-now-headline').textContent = '📍 ' + topA.area;
        document.getElementById('sr-now-sub').textContent = 'エリア平均単価 ' + srYen(topA.avg_fare) + '（実績' + topA.c + '件／' + hoursLabel + '）※ 住所単位ではまだ十分な実績がありません';
      } else {
        document.getElementById('sr-now-headline').textContent = ward ? ward + '内はこの時間帯のデータがまだありません' : 'この時間帯のデータがまだ十分にありません';
        document.getElementById('sr-now-sub').textContent = ward ? '「全体」に切り替えるか、CSVの取込件数が増えると表示されるようになります' : 'CSVの取込件数が増えると表示されるようになります';
      }

      document.getElementById('sr-now-spot-tbody').innerHTML = spots.map(function(r) {
        return '<tr style="border-bottom:1px solid #f3f4f6;">' +
          '<td style="padding:7px 12px;">' + srEsc(r.addr) + '</td>' +
          '<td style="padding:7px 12px;text-align:right;font-weight:700;color:#1a3a5c;">' + srYen(r.avg_fare) + '</td>' +
          '<td style="padding:7px 12px;text-align:right;color:#6b7280;">' + r.c + '件</td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="3" style="padding:20px;text-align:center;color:#9ca3af;">十分な実績がありません</td></tr>';

      document.getElementById('sr-now-area-tbody').innerHTML = areas.map(function(r) {
        return '<tr style="border-bottom:1px solid #f3f4f6;">' +
          '<td style="padding:7px 12px;font-weight:600;">' + srEsc(r.area) + '</td>' +
          '<td style="padding:7px 12px;text-align:right;font-weight:700;color:#1a3a5c;">' + srYen(r.avg_fare) + '</td>' +
          '<td style="padding:7px 12px;text-align:right;color:#6b7280;">' + r.c + '件</td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="3" style="padding:20px;text-align:center;color:#9ca3af;">十分な実績がありません</td></tr>';
    }

    function srClearRange() {
      document.getElementById('sr-start').value = '';
      document.getElementById('sr-end').value = '';
      srLoadSummary();
    }

    // ===== 分析タブ =====
    var srAreaRows = [];
    var srAreaSort = 'c';
    var srRepeatersByCount = [];
    var srRepeatersByValue = [];
    var srRepeaterSort = 'count';
    var srCurrentRepeaterList = [];
    var srMapMetric = 'count';
    var srMapMode = 'heat';

    function srLoadSummary() {
      var start = document.getElementById('sr-start').value;
      var end = document.getElementById('sr-end').value;
      var weekday = document.getElementById('sr-weekday').value;
      var includeFailed = document.getElementById('sr-include-failed').checked;
      var qs = [];
      if (start) qs.push('start=' + encodeURIComponent(start));
      if (end) qs.push('end=' + encodeURIComponent(end));
      if (weekday !== '') qs.push('weekday=' + encodeURIComponent(weekday));
      if (includeFailed) qs.push('include_failed=1');
      document.getElementById('sr-loading').textContent = '読み込み中…';
      document.getElementById('sr-filter-note').textContent = includeFailed
        ? '探車失敗を含めて集計しています。'
        : '探車失敗（配車できなかった注文）は集計から除外しています（上のカードの件数のみ常に全件表示）。';
      srApi('GET', '/summary' + (qs.length ? '?' + qs.join('&') : '')).then(function(data) {
        document.getElementById('sr-loading').textContent = '';
        srRenderSummary(data);
      }).catch(function() {
        document.getElementById('sr-loading').textContent = '読み込みに失敗しました';
      });
    }

    function srRenderSummary(data) {
      var ov = data.overview || {};
      var cards = [
        { num: (ov.total || 0).toLocaleString(), lbl: '総注文件数（全件）' },
        { num: (ov.completed || 0).toLocaleString(), lbl: '完了（支払完了・全件）' },
        { num: (ov.failed || 0).toLocaleString() + srPctSuffix(ov.failed, ov.total), lbl: '探車失敗（全件）' },
        { num: ((ov.user_cancel || 0) + (ov.company_cancel || 0)).toLocaleString(), lbl: 'キャンセル（全件）' },
        { num: (ov.unique_phones || 0).toLocaleString(), lbl: '電話番号ユニーク数' },
        { num: (data.repeatersByCount || []).length.toLocaleString() + '名', lbl: 'リピーター（2回以上）' },
        { num: srYen(ov.avg_fare), lbl: '平均収受金額' },
      ];
      document.getElementById('sr-cards').innerHTML = cards.map(function(cd) {
        return '<div class="sr-card"><div class="num">' + cd.num + '</div><div class="lbl">' + cd.lbl + '</div></div>';
      }).join('');

      srRenderBarChart('sr-hour-chart', (data.byHour || []), 'h', 24, function(h) { return h; });
      srRenderBarChart('sr-weekday-chart', (data.byWeekday || []), 'w', 7, function(w) { return ['日','月','火','水','木','金','土'][w] || w; });

      srRenderAreaWeekdayGrid(data.areaWeekdayGrid || []);

      var totalSrc = (data.bySource || []).reduce(function(s, r) { return s + r.c; }, 0);
      document.getElementById('sr-source-list').innerHTML = (data.bySource || []).map(function(r) {
        return '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 14px;font-size:12px;">' +
          '<b style="color:#1d4ed8;">' + srEsc(r.source) + '</b> ' + r.c.toLocaleString() + '件（' + srPct(r.c, totalSrc) + '）</div>';
      }).join('') || '<span style="color:#9ca3af;font-size:12px;">データがありません</span>';

      srAreaRows = data.byArea || [];
      srRenderAreaTable();
      srRenderGeoMap();

      document.getElementById('sr-spot-tbody').innerHTML = (data.bySpot || []).map(function(r) {
        return '<tr style="border-bottom:1px solid #f3f4f6;">' +
          '<td style="padding:7px 12px;">' + srEsc(r.addr) + '</td>' +
          '<td style="padding:7px 12px;text-align:right;font-weight:700;color:#1a3a5c;">' + r.c.toLocaleString() + '</td>' +
          '<td style="padding:7px 12px;color:#6b7280;">' + srEsc((r.last_at || '').slice(0, 16)) + '</td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="3" style="padding:20px;text-align:center;color:#9ca3af;">データがありません</td></tr>';

      srRepeatersByCount = data.repeatersByCount || [];
      srRepeatersByValue = data.repeatersByValue || [];
      srRenderRepeaterTable();
    }

    function srPctSuffix(part, total) {
      if (!total) return '';
      return '（' + srPct(part || 0, total) + '）';
    }

    function srRenderBarChart(elId, rows, keyField, size, labelFn) {
      var byKey = {};
      (rows || []).forEach(function(r) { byKey[r[keyField]] = r.c; });
      var max = 1;
      for (var k = 0; k < size; k++) { if ((byKey[k] || 0) > max) max = byKey[k]; }
      var html = '';
      for (var i = 0; i < size; i++) {
        var v = byKey[i] || 0;
        var h = Math.round(v / max * 100);
        html += '<div title="' + labelFn(i) + ': ' + v + '件" style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;height:100%;">' +
          '<div style="width:100%;background:#1a3a5c;border-radius:2px 2px 0 0;height:' + Math.max(h, v > 0 ? 3 : 0) + '%;"></div>' +
          '<div style="font-size:9px;color:#9ca3af;margin-top:3px;">' + labelFn(i) + '</div></div>';
      }
      document.getElementById(elId).innerHTML = html;
    }

    // ===== エリア×曜日 クロス集計（ヒートマップ表） =====
    function srRenderAreaWeekdayGrid(rows) {
      var table = document.getElementById('sr-area-weekday-table');
      var totals = {};
      rows.forEach(function(r) { totals[r.area] = (totals[r.area] || 0) + r.c; });
      var topAreas = Object.keys(totals).sort(function(a, b) { return totals[b] - totals[a]; }).slice(0, 15);
      if (!topAreas.length) {
        table.innerHTML = '<tbody><tr><td style="padding:20px;text-align:center;color:#9ca3af;">データがありません</td></tr></tbody>';
        return;
      }
      var cell = {};
      var max = 0;
      rows.forEach(function(r) {
        cell[r.area + '|' + r.w] = r.c;
        if (topAreas.indexOf(r.area) >= 0 && r.c > max) max = r.c;
      });
      var wLabels = ['日', '月', '火', '水', '木', '金', '土'];
      var html = '<thead><tr><th style="padding:6px 10px;text-align:left;font-size:11px;color:#6b7280;background:#f9fafb;white-space:nowrap;">エリア</th>';
      wLabels.forEach(function(l) { html += '<th style="padding:6px 10px;text-align:center;font-size:11px;color:#6b7280;background:#f9fafb;">' + l + '</th>'; });
      html += '</tr></thead><tbody>';
      topAreas.forEach(function(area) {
        html += '<tr><td style="padding:6px 10px;font-size:12px;font-weight:600;white-space:nowrap;border-bottom:1px solid #f3f4f6;">' + srEsc(area) + '</td>';
        for (var w = 0; w < 7; w++) {
          var v = cell[area + '|' + w] || 0;
          var alpha = max > 0 ? Math.min(1, v / max) : 0;
          var bg = 'rgba(29,78,216,' + (alpha * 0.85).toFixed(2) + ')';
          var textColor = alpha > 0.55 ? '#fff' : '#374151';
          html += '<td style="padding:6px 10px;text-align:center;font-size:12px;border-bottom:1px solid #f3f4f6;background:' + bg + ';color:' + textColor + ';">' + (v || '') + '</td>';
        }
        html += '</tr>';
      });
      html += '</tbody>';
      table.innerHTML = html;
    }

    // ===== エリア別ランキング表（件数順／売上合計順を切替） =====
    function srSetAreaSort(key) { srAreaSort = key; srRenderAreaTable(); }
    function srRenderAreaTable() {
      document.querySelectorAll('.sr-area-sort-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.key === srAreaSort); });
      var totalArea = srAreaRows.reduce(function(s, r) { return s + r.c; }, 0);
      var sorted = srAreaRows.slice().sort(function(a, b) { return (b[srAreaSort] || 0) - (a[srAreaSort] || 0); });
      document.getElementById('sr-area-tbody').innerHTML = sorted.map(function(r) {
        var failRate = r.c > 0 ? r.failed / r.c : 0;
        var rateColor = failRate >= 0.15 ? '#dc2626' : (failRate >= 0.08 ? '#d97706' : '#374151');
        return '<tr style="border-bottom:1px solid #f3f4f6;">' +
          '<td style="padding:7px 12px;font-weight:600;">' + srEsc(r.area) + '</td>' +
          '<td style="padding:7px 12px;text-align:right;">' + r.c.toLocaleString() + '</td>' +
          '<td style="padding:7px 12px;text-align:right;color:#6b7280;">' + srPct(r.c, totalArea) + '</td>' +
          '<td style="padding:7px 12px;text-align:right;color:#166534;">' + (r.completed || 0).toLocaleString() + '</td>' +
          '<td style="padding:7px 12px;text-align:right;color:#dc2626;">' + (r.failed || 0).toLocaleString() + '</td>' +
          '<td style="padding:7px 12px;text-align:right;color:' + rateColor + ';font-weight:700;">' + srPct(r.failed || 0, r.c) + '</td>' +
          '<td style="padding:7px 12px;text-align:right;">' + srYen(r.avg_fare) + '</td>' +
          '<td style="padding:7px 12px;text-align:right;font-weight:700;color:#1a3a5c;">' + srYen(r.revenue) + '</td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="8" style="padding:20px;text-align:center;color:#9ca3af;">データがありません</td></tr>';
    }

    // ===== 迎車地マップ（ヒートマップ／点マップ） =====
    var SR_SCALE = ['#eff6ff', '#bfdbfe', '#60a5fa', '#3b82f6', '#1d4ed8', '#1e3a8a'];
    var SR_GREY = '#e5e7eb';

    function srBuildBuckets(vals) {
      var v = vals.filter(function(x) { return x !== null && x !== undefined; }).slice().sort(function(a, b) { return a - b; });
      if (!v.length) return { th: [], min: 0, max: 0 };
      var uniq = [];
      v.forEach(function(x) { if (uniq[uniq.length - 1] !== x) uniq.push(x); });
      var min = uniq[0], max = uniq[uniq.length - 1];
      var th;
      if (uniq.length <= 6) {
        th = uniq.slice(1);
      } else {
        var raw = [];
        for (var i = 1; i < 6; i++) raw.push(v[Math.floor(i / 6 * v.length)]);
        th = [];
        raw.forEach(function(x) { if (x > min && x < max && th.indexOf(x) < 0) th.push(x); });
        th.sort(function(a, b) { return a - b; });
      }
      return { th: th, min: min, max: max };
    }
    function srBucketIdx(val, bk) {
      var i = 0;
      while (i < bk.th.length && val >= bk.th[i]) i++;
      return i;
    }
    function srBucketColor(val, bk) {
      if (val === null || val === undefined) return SR_GREY;
      var count = bk.th.length + 1;
      var idx = srBucketIdx(val, bk);
      if (count <= 1) return SR_SCALE[Math.floor(SR_SCALE.length / 2)];
      return SR_SCALE[Math.round(idx / (count - 1) * (SR_SCALE.length - 1))];
    }
    function srAreaLabelKey(area) {
      return (area || '').replace(/^(東京都|埼玉県|神奈川県|千葉県)/, '');
    }
    function srMapValueMap(metric) {
      var m = {};
      srAreaRows.forEach(function(r) {
        var key = srAreaLabelKey(r.area);
        var v = metric === 'revenue' ? (r.revenue || 0) : r.c;
        m[key] = (m[key] || 0) + v;
      });
      return m;
    }
    function srSetMapMetric(m) { srMapMetric = m; srRenderGeoMap(); }
    function srSetMapMode(m) { srMapMode = m; srRenderGeoMap(); }

    function srRenderGeoMap() {
      document.querySelectorAll('.sr-map-btn[data-metric]').forEach(function(b) { b.classList.toggle('active', b.dataset.metric === srMapMetric); });
      document.querySelectorAll('.sr-map-btn[data-mode]').forEach(function(b) { b.classList.toggle('active', b.dataset.mode === srMapMode); });

      var valueMap = srMapValueMap(srMapMetric);
      var vals = MAP_AREAS.map(function(a) { return (valueMap[a.label] !== undefined) ? valueMap[a.label] : null; });
      var bk = srBuildBuckets(vals);
      var maxVal = 0;
      vals.forEach(function(v) { if (v !== null && v > maxVal) maxVal = v; });

      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + MAP_VIEWBOX + '" style="width:100%;max-width:640px;height:auto;display:block;margin:0 auto;">';
      MAP_AREAS.forEach(function(a) {
        var v = (valueMap[a.label] !== undefined) ? valueMap[a.label] : null;
        var fill = (srMapMode === 'heat') ? srBucketColor(v, bk) : '#f3f4f6';
        var tip = v !== null ? (srMapMetric === 'revenue' ? srYen(v) : v.toLocaleString() + '件') : 'データなし';
        svg += '<path d="' + a.d + '" fill="' + fill + '" stroke="#1f2937" stroke-width="1" stroke-linejoin="round"><title>' + srEsc(a.label) + '：' + tip + '</title></path>';
      });
      if (srMapMode === 'dot') {
        var maxR = 26;
        MAP_AREAS.forEach(function(a) {
          var v = (valueMap[a.label] !== undefined) ? valueMap[a.label] : null;
          if (!v || maxVal <= 0) return;
          var r = Math.max(3, Math.sqrt(v / maxVal) * maxR);
          var tip = srMapMetric === 'revenue' ? srYen(v) : v.toLocaleString() + '件';
          svg += '<circle cx="' + a.lx + '" cy="' + a.ly + '" r="' + r.toFixed(1) + '" fill="#1d4ed8" fill-opacity="0.55" stroke="#1e3a8a" stroke-width="1"><title>' + srEsc(a.label) + '：' + tip + '</title></circle>';
        });
      } else {
        MAP_AREAS.forEach(function(a) {
          svg += '<text x="' + a.lx + '" y="' + a.ly + '" text-anchor="middle" font-size="11" fill="#111827" style="pointer-events:none;">' + srEsc(a.label) + '</text>';
        });
      }
      svg += '</svg>';
      document.getElementById('sr-map-svg').innerHTML = svg;
      srRenderMapLegend(bk);
    }

    function srRenderMapLegend(bk) {
      var el = document.getElementById('sr-map-legend');
      if (srMapMode === 'dot') {
        el.innerHTML = '<span style="color:#6b7280;">円が大きいほど値が大きいエリアです（' + (srMapMetric === 'revenue' ? '売上合計' : '件数') + '）</span>';
        return;
      }
      if (bk.max === 0 && bk.min === 0) { el.innerHTML = '<span style="color:#9ca3af;">データがありません</span>'; return; }
      var count = bk.th.length + 1;
      var fmt = function(v) { return srMapMetric === 'revenue' ? srYen(v) : v.toLocaleString() + '件'; };
      var parts = [];
      for (var i = 0; i < count; i++) {
        var label;
        if (count === 1) label = fmt(bk.min);
        else if (i === 0) label = '〜' + fmt(bk.th[0]);
        else if (i === count - 1) label = fmt(bk.th[i - 1]) + '〜';
        else label = fmt(bk.th[i - 1]) + '〜' + fmt(bk.th[i]);
        var color = count <= 1 ? SR_SCALE[Math.floor(SR_SCALE.length / 2)] : SR_SCALE[Math.round(i / (count - 1) * (SR_SCALE.length - 1))];
        parts.push('<span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:13px;height:13px;border-radius:3px;background:' + color + ';display:inline-block;border:1px solid #d1d5db;"></span>' + label + '</span>');
      }
      parts.push('<span style="display:inline-flex;align-items:center;gap:4px;"><span style="width:13px;height:13px;border-radius:3px;background:' + SR_GREY + ';display:inline-block;border:1px solid #d1d5db;"></span>データなし</span>');
      el.innerHTML = parts.join('');
    }

    // ===== リピーター一覧（利用回数順／累計金額順を切替） =====
    function srSetRepeaterSort(key) { srRepeaterSort = key; srRenderRepeaterTable(); }
    function srRenderRepeaterTable() {
      document.querySelectorAll('.sr-repeater-sort-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.key === srRepeaterSort); });
      var list = srRepeaterSort === 'value' ? srRepeatersByValue : srRepeatersByCount;
      srCurrentRepeaterList = list;
      document.getElementById('sr-repeater-tbody').innerHTML = list.map(function(r, i) {
        var avgFare = r.c > 0 ? r.total_fare / r.c : null;
        return '<tr style="border-bottom:1px solid #f3f4f6;">' +
          '<td style="padding:7px 12px;font-family:monospace;">' + srEsc(r.phone) + '</td>' +
          '<td style="padding:7px 12px;">' + srEsc(r.name || '—') + '</td>' +
          '<td style="padding:7px 12px;text-align:right;font-weight:700;color:#1a3a5c;">' + r.c + '回</td>' +
          '<td style="padding:7px 12px;color:#6b7280;">' + srEsc((r.first_at || '').slice(0, 16)) + '</td>' +
          '<td style="padding:7px 12px;color:#6b7280;">' + srEsc((r.last_at || '').slice(0, 16)) + '</td>' +
          '<td style="padding:7px 12px;text-align:right;">' + srYen(r.total_fare) + '</td>' +
          '<td style="padding:7px 12px;text-align:right;color:#6b7280;">' + srYen(avgFare) + '</td>' +
          '<td style="padding:7px 12px;"><button onclick="srOpenCustomerModal(' + i + ')" style="padding:3px 10px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:11px;cursor:pointer;">履歴</button></td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="8" style="padding:20px;text-align:center;color:#9ca3af;">2回以上利用した電話番号付きの注文がありません</td></tr>';
    }

    function srOpenCustomerModal(idx) {
      var r = srCurrentRepeaterList[idx];
      if (!r) return;
      document.getElementById('sr-customer-title').textContent = '利用履歴：' + (r.name || r.phone) + '（' + r.phone + '）';
      document.getElementById('sr-customer-tbody').innerHTML = '<tr><td colspan="6" style="padding:16px;text-align:center;color:#9ca3af;">読み込み中…</td></tr>';
      document.getElementById('sr-customer-modal').style.display = 'flex';
      srApi('GET', '/customer?phone=' + encodeURIComponent(r.phone)).then(function(data) {
        var items = data.items || [];
        document.getElementById('sr-customer-tbody').innerHTML = items.map(function(o) {
          return '<tr style="border-bottom:1px solid #f3f4f6;">' +
            '<td style="padding:6px 10px;white-space:nowrap;">' + srEsc((o.ordered_at || '').slice(0, 16)) + '</td>' +
            '<td style="padding:6px 10px;">' + srEsc(o.pickup_address || '—') + '</td>' +
            '<td style="padding:6px 10px;">' + srEsc(o.destination || '—') + '</td>' +
            '<td style="padding:6px 10px;">' + srEsc(o.driver_name || '—') + '</td>' +
            '<td style="padding:6px 10px;">' + srEsc(o.dispatch_status || '—') + '</td>' +
            '<td style="padding:6px 10px;text-align:right;">' + srYen(o.amount_collected) + '</td>' +
            '</tr>';
        }).join('') || '<tr><td colspan="6" style="padding:16px;text-align:center;color:#9ca3af;">履歴がありません</td></tr>';
      });
    }
    function srCloseCustomerModal() { document.getElementById('sr-customer-modal').style.display = 'none'; }
    document.getElementById('sr-customer-modal').addEventListener('click', function(e) { if (e.target === this) srCloseCustomerModal(); });

    // ===== データ取込タブ =====
    function srLoadUploads() {
      srApi('GET', '/uploads').then(function(data) {
        document.getElementById('sr-uploads-tbody').innerHTML = (data.items || []).map(function(u) {
          return '<tr style="border-bottom:1px solid #f3f4f6;">' +
            '<td style="padding:7px 12px;color:#6b7280;">' + srEsc((u.uploaded_at || '').slice(0, 16)) + '</td>' +
            '<td style="padding:7px 12px;">' + srEsc(u.file_name || '—') + '</td>' +
            '<td style="padding:7px 12px;">' + srEsc(u.uploaded_by || '—') + '</td>' +
            '<td style="padding:7px 12px;text-align:right;">' + (u.row_count || 0).toLocaleString() + '</td>' +
            '<td style="padding:7px 12px;text-align:right;font-weight:700;color:#1a3a5c;">' + (u.total_after || 0).toLocaleString() + '</td>' +
            '</tr>';
        }).join('') || '<tr><td colspan="5" style="padding:20px;text-align:center;color:#9ca3af;">まだ取込履歴がありません</td></tr>';
      });
    }

    var srParsedRows = [];
    var srFileName = '';

    function srHandleDrop(event) {
      event.preventDefault();
      document.getElementById('sr-drop-zone').style.borderColor = '#d1d5db';
      var file = event.dataTransfer.files[0];
      if (file) srHandleFile(file);
    }

    function srFetchRemote() {
      var start = document.getElementById('sr-remote-start').value;
      var end = document.getElementById('sr-remote-end').value;
      var statusEl = document.getElementById('sr-remote-status');
      var btn = document.getElementById('sr-remote-fetch-btn');
      if (!start || !end) {
        statusEl.style.color = '#dc2626';
        statusEl.textContent = '開始日と終了日を指定してください';
        return;
      }
      btn.disabled = true;
      statusEl.style.color = '#6b7280';
      statusEl.textContent = 'S.RIDEに接続中…（数秒〜十数秒かかることがあります）';
      document.getElementById('sr-import-result').style.display = 'none';
      srSetProgress(0, 'S.RIDEから取得中…');

      fetch(ADMIN_PATH + '/api/sr/fetch_remote?start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end), {
        headers: { 'X-SR-Password': srPassword }
      }).then(function(r) {
        var ct = r.headers.get('content-type') || '';
        if (!r.ok || ct.indexOf('text/csv') === -1) {
          return r.json().then(function(j) { throw new Error(j.error || ('取得に失敗しました（' + r.status + '）')); });
        }
        return r.arrayBuffer();
      }).then(function(buf) {
        var text;
        try { text = new TextDecoder('shift-jis').decode(buf); }
        catch (err) { text = new TextDecoder('utf-8').decode(buf); }
        srFileName = 'sride_' + start + '_' + end + '.csv';
        srParseCsv(text);
        btn.disabled = false;
        statusEl.style.color = '#166534';
        statusEl.textContent = '取得完了。内容を確認のうえ「取り込む」を押してください。';
      }).catch(function(err) {
        btn.disabled = false;
        srSetProgress(null, '');
        statusEl.style.color = '#dc2626';
        statusEl.textContent = err.message || '取得に失敗しました';
      });
    }

    function srSetProgress(pct, label) {
      var wrap = document.getElementById('sr-progress');
      var bar = document.getElementById('sr-progress-bar');
      var lbl = document.getElementById('sr-progress-label');
      if (pct === null) { wrap.style.display = 'none'; return; }
      wrap.style.display = 'block';
      bar.style.width = pct + '%';
      lbl.textContent = label;
    }

    function srHandleFile(file) {
      if (!file) return;
      srFileName = file.name;
      document.getElementById('sr-import-result').style.display = 'none';
      srSetProgress(0, 'ファイル読み込み中…');
      var reader = new FileReader();
      reader.onload = function(e) {
        var buf = e.target.result;
        var text;
        try { text = new TextDecoder('shift-jis').decode(buf); }
        catch (err) { text = new TextDecoder('utf-8').decode(buf); }
        srParseCsv(text);
      };
      reader.readAsArrayBuffer(file);
    }

    function srNormDate(s) {
      if (!s) return null;
      var t = s.trim();
      if (!t) return null;
      var m = t.match(/^(\\d{4})\\/(\\d{1,2})\\/(\\d{1,2})\\s+(\\d{1,2}):(\\d{2}):(\\d{2})$/);
      if (!m) return t;
      var p2 = function(v) { return v.length < 2 ? '0' + v : v; };
      return m[1] + '-' + p2(m[2]) + '-' + p2(m[3]) + ' ' + p2(m[4]) + ':' + m[5] + ':' + m[6];
    }
    function srIntOrNull(s) {
      if (s == null) return null;
      var t = String(s).replace(/[^0-9\\-]/g, '');
      if (t === '') return null;
      var n = parseInt(t, 10);
      return isNaN(n) ? null : n;
    }
    function srExtractArea(addr) {
      if (!addr) return '(不明)';
      var m = addr.match(/([^0-9０-９,、\\s]{2,4}?[都道府県])([^0-9０-９,、\\s]+?[市区町村])/);
      if (m) return m[1] + m[2];
      var m2 = addr.match(/([^0-9０-９,、\\s]+?[市区町村])/);
      if (m2) return m2[1];
      return addr.trim().slice(0, 10) || '(不明)';
    }

    // RFC4180準拠の簡易CSVパーサ。迎車地・目的地に「,」を含む住所（ダブルクォート囲み）が
    // 実データに存在するため、単純な split(',') では列がずれる。1文字ずつ状態遷移で読む。
    function srCsvToRows(text) {
      var rows = [];
      var row = [];
      var field = '';
      var inQuotes = false;
      var i = 0, len = text.length;
      while (i < len) {
        var ch = text.charAt(i);
        if (inQuotes) {
          if (ch === '"') {
            if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
            inQuotes = false; i++; continue;
          }
          field += ch; i++; continue;
        }
        if (ch === '"') { inQuotes = true; i++; continue; }
        if (ch === ',') { row.push(field); field = ''; i++; continue; }
        if (ch === '\\r') { i++; continue; }
        if (ch === '\\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
        field += ch; i++; continue;
      }
      if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
      return rows;
    }

    function srParseCsv(text) {
      var table = srCsvToRows(text);
      var firstCols = table[0] || [];
      if (firstCols.length < 51 || (firstCols[0] || '').trim() !== '実行状況' || (firstCols[6] || '').trim() !== '注文番号') {
        srSetProgress(null, '');
        document.getElementById('sr-preview').style.display = 'block';
        document.getElementById('sr-preview').innerHTML = '<span style="color:#dc2626;">CSVの形式が正しくないようです（SRIDE_OrderListの注文リストCSVを選択してください）</span>';
        document.getElementById('sr-upload-actions').style.display = 'none';
        srParsedRows = [];
        return;
      }
      var rows = [];
      var minDate = '', maxDate = '';
      for (var i = 1; i < table.length; i++) {
        var c = table[i];
        if (c.length <= 1 && (!c[0] || !c[0].trim())) continue;
        if (c.length < 51) continue;
        var orderNo = (c[6] || '').trim();
        if (!orderNo) continue;
        var pickupAddr = (c[13] || '').trim();
        var orderedAt = srNormDate(c[12]);
        if (orderedAt) { if (!minDate || orderedAt < minDate) minDate = orderedAt; if (!maxDate || orderedAt > maxDate) maxDate = orderedAt; }
        rows.push({
          order_no: orderNo,
          status: (c[0] || '').trim(),
          dispatch_status: (c[1] || '').trim(),
          memo: (c[2] || '').trim(),
          customer_name: (c[3] || '').trim(),
          member_type: (c[4] || '').trim(),
          phone: (c[5] || '').trim(),
          source_type: (c[7] || '').trim(),
          fare_type: (c[8] || '').trim(),
          fixed_route: (c[9] || '').trim(),
          order_type: (c[10] || '').trim(),
          flat_fare_type: (c[11] || '').trim(),
          ordered_at: orderedAt,
          pickup_address: pickupAddr,
          pickup_area: srExtractArea(pickupAddr),
          pickup_detail: (c[14] || '').trim(),
          destination: (c[15] || '').trim(),
          order_memo1: (c[16] || '').trim(),
          order_memo2: (c[17] || '').trim(),
          substitute_request: (c[18] || '').trim(),
          accepted_at: srNormDate(c[19]),
          eta_at: srNormDate(c[20]),
          arrived_at: srNormDate(c[21]),
          arrived_point: (c[22] || '').trim(),
          boarded_at: srNormDate(c[23]),
          boarded_point: (c[24] || '').trim(),
          dropped_at: srNormDate(c[25]),
          dropped_point: (c[26] || '').trim(),
          ride_minutes: srIntOrNull(c[27]),
          radio_no: (c[28] || '').trim(),
          plate_no: (c[29] || '').trim(),
          car_type: (c[30] || '').trim(),
          car_color: (c[31] || '').trim(),
          driver_name: (c[32] || '').trim(),
          driver_id: (c[33] || '').trim(),
          group_name: (c[34] || '').trim(),
          group_code: (c[35] || '').trim(),
          company_name: (c[36] || '').trim(),
          company_code: (c[37] || '').trim(),
          office_name: (c[38] || '').trim(),
          office_code: (c[39] || '').trim(),
          door_no: (c[40] || '').trim(),
          individual_taxi_name: (c[41] || '').trim(),
          arrived_message_at: srNormDate(c[42]),
          payment_method_ordered: (c[43] || '').trim(),
          amount_collected: srIntOrNull(c[44]),
          payment_method_actual: (c[45] || '').trim(),
          fixed_fare: srIntOrNull(c[46]),
          highway_fee: srIntOrNull(c[47]),
          cancelled_at: srNormDate(c[48]),
          cancel_reason: (c[49] || '').trim(),
          cancel_fee_flag: (c[50] || '').trim(),
        });
      }
      srParsedRows = rows;
      srSetProgress(null, '');
      var prev = document.getElementById('sr-preview');
      prev.style.display = 'block';
      prev.innerHTML = '解析結果： <strong>' + rows.length.toLocaleString() + '件</strong>' +
        (minDate ? '　（注文日時 ' + minDate.slice(0, 10) + ' 〜 ' + maxDate.slice(0, 10) + '）' : '') +
        '<div style="font-size:11px;color:#9ca3af;margin-top:4px;">注文番号が重複するものは既存データを新しい内容で上書きします。</div>';
      document.getElementById('sr-upload-actions').style.display = rows.length ? 'flex' : 'none';
    }

    function srClearImport() {
      srParsedRows = [];
      document.getElementById('sr-csv-file').value = '';
      document.getElementById('sr-preview').style.display = 'none';
      document.getElementById('sr-upload-actions').style.display = 'none';
      document.getElementById('sr-import-result').style.display = 'none';
    }

    function srExecuteImport() {
      if (!srParsedRows.length) return;
      var btn = document.getElementById('sr-import-btn');
      btn.disabled = true;
      var CHUNK = 300;
      var total = srParsedRows.length;
      var saved = 0;
      var idx = 0;

      function nextChunk() {
        if (idx >= total) {
          return srApi('POST', '/import/finish', { file_name: srFileName, row_count: total }).then(function(res) {
            btn.disabled = false;
            srSetProgress(null, '');
            document.getElementById('sr-import-result').style.display = 'block';
            document.getElementById('sr-import-result').innerHTML =
              '<span style="color:#166534;font-weight:700;">取込完了：' + saved.toLocaleString() + '件を処理しました（sr_orders 総件数：' + (res.total || 0).toLocaleString() + '件）</span>';
            document.getElementById('sr-upload-actions').style.display = 'none';
            srLoadUploads();
          });
        }
        var chunk = srParsedRows.slice(idx, idx + CHUNK);
        srSetProgress(Math.floor(idx / total * 100), '送信中… ' + idx.toLocaleString() + ' / ' + total.toLocaleString() + '件');
        return srApi('POST', '/import/rows', { rows: chunk }).then(function(res) {
          saved += (res.saved || 0);
          idx += CHUNK;
          return nextChunk();
        });
      }

      nextChunk().catch(function() {
        btn.disabled = false;
        srSetProgress(null, '');
        document.getElementById('sr-import-result').style.display = 'block';
        document.getElementById('sr-import-result').innerHTML = '<span style="color:#dc2626;">取込中にエラーが発生しました。もう一度お試しください。</span>';
      });
    }
    </script>
  `;
  return c.html(layout('SR分析', html, 'settings'));
});

// ===== API（すべて X-SR-Password ヘッダー必須） =====

app.get('/api/sr/summary', async (c) => {
  if (!checkPassword(c)) return c.json({ error: 'パスワードが違います' }, 401);
  const start = isValidDate(c.req.query('start')) ? `${c.req.query('start')} 00:00:00` : '2000-01-01 00:00:00';
  const end = isValidDate(c.req.query('end')) ? `${c.req.query('end')} 23:59:59` : '2999-12-31 23:59:59';
  const weekdayParam = c.req.query('weekday');
  const weekday = weekdayParam !== undefined && /^[0-6]$/.test(weekdayParam) ? Number(weekdayParam) : undefined;
  const includeFailed = c.req.query('include_failed') === '1';

  const full = srWhere(start, end, { weekday });
  const ranked = srWhere(start, end, { weekday, excludeFailed: !includeFailed });
  const grid = srWhere(start, end, { excludeFailed: !includeFailed });

  const [overviewFull, overviewRanked, source, area, spot, hour, weekdayChart, areaWeekday, repByCount, repByValue] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN dispatch_status = '支払完了' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN dispatch_status = '探車失敗' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN dispatch_status = '利用者キャンセル' THEN 1 ELSE 0 END) AS user_cancel,
        SUM(CASE WHEN dispatch_status = '事業者キャンセル' THEN 1 ELSE 0 END) AS company_cancel
       FROM sr_orders WHERE ${full.sql}`
    ).bind(...full.params).first(),
    c.env.DB.prepare(
      `SELECT AVG(CASE WHEN amount_collected > 0 THEN amount_collected END) AS avg_fare,
        COUNT(DISTINCT CASE WHEN phone IS NOT NULL AND phone <> '' AND phone <> '00000000000' THEN phone END) AS unique_phones
       FROM sr_orders WHERE ${ranked.sql}`
    ).bind(...ranked.params).first(),
    c.env.DB.prepare(
      `SELECT CASE WHEN source_type = '' OR source_type IS NULL THEN '電話・直接配車' ELSE source_type END AS source, COUNT(*) AS c
       FROM sr_orders WHERE ${ranked.sql} GROUP BY source ORDER BY c DESC`
    ).bind(...ranked.params).all(),
    c.env.DB.prepare(
      `SELECT COALESCE(NULLIF(pickup_area, ''), '(不明)') AS area, COUNT(*) AS c,
        SUM(CASE WHEN dispatch_status = '支払完了' THEN 1 ELSE 0 END) AS completed,
        SUM(CASE WHEN dispatch_status = '探車失敗' THEN 1 ELSE 0 END) AS failed,
        AVG(CASE WHEN amount_collected > 0 THEN amount_collected END) AS avg_fare,
        SUM(CASE WHEN amount_collected > 0 THEN amount_collected ELSE 0 END) AS revenue
       FROM sr_orders WHERE ${ranked.sql} GROUP BY area ORDER BY c DESC LIMIT 200`
    ).bind(...ranked.params).all(),
    c.env.DB.prepare(
      `SELECT pickup_address AS addr, COUNT(*) AS c, MAX(ordered_at) AS last_at
       FROM sr_orders WHERE ${ranked.sql} AND pickup_address IS NOT NULL AND pickup_address <> ''
       GROUP BY pickup_address HAVING COUNT(*) >= 2 ORDER BY c DESC LIMIT 30`
    ).bind(...ranked.params).all(),
    c.env.DB.prepare(
      `SELECT CAST(strftime('%H', ordered_at) AS INTEGER) AS h, COUNT(*) AS c
       FROM sr_orders WHERE ${ranked.sql} AND ordered_at IS NOT NULL GROUP BY h`
    ).bind(...ranked.params).all(),
    c.env.DB.prepare(
      `SELECT CAST(strftime('%w', ordered_at) AS INTEGER) AS w, COUNT(*) AS c
       FROM sr_orders WHERE ${ranked.sql} AND ordered_at IS NOT NULL GROUP BY w`
    ).bind(...ranked.params).all(),
    c.env.DB.prepare(
      `SELECT COALESCE(NULLIF(pickup_area, ''), '(不明)') AS area, CAST(strftime('%w', ordered_at) AS INTEGER) AS w, COUNT(*) AS c
       FROM sr_orders WHERE ${grid.sql} AND ordered_at IS NOT NULL GROUP BY area, w`
    ).bind(...grid.params).all(),
    c.env.DB.prepare(
      `SELECT phone, MAX(customer_name) AS name, COUNT(*) AS c,
        MIN(ordered_at) AS first_at, MAX(ordered_at) AS last_at,
        SUM(CASE WHEN amount_collected > 0 THEN amount_collected ELSE 0 END) AS total_fare
       FROM sr_orders
       WHERE ${ranked.sql} AND phone IS NOT NULL AND phone <> '' AND phone <> '00000000000'
       GROUP BY phone HAVING COUNT(*) >= 2 ORDER BY c DESC LIMIT 100`
    ).bind(...ranked.params).all(),
    c.env.DB.prepare(
      `SELECT phone, MAX(customer_name) AS name, COUNT(*) AS c,
        MIN(ordered_at) AS first_at, MAX(ordered_at) AS last_at,
        SUM(CASE WHEN amount_collected > 0 THEN amount_collected ELSE 0 END) AS total_fare
       FROM sr_orders
       WHERE ${ranked.sql} AND phone IS NOT NULL AND phone <> '' AND phone <> '00000000000'
       GROUP BY phone HAVING COUNT(*) >= 2 ORDER BY total_fare DESC LIMIT 100`
    ).bind(...ranked.params).all(),
  ]);

  return c.json({
    overview: { ...(overviewFull ?? {}), ...(overviewRanked ?? {}) },
    bySource: source.results ?? [],
    byArea: area.results ?? [],
    bySpot: spot.results ?? [],
    byHour: hour.results ?? [],
    byWeekday: weekdayChart.results ?? [],
    areaWeekdayGrid: areaWeekday.results ?? [],
    repeatersByCount: repByCount.results ?? [],
    repeatersByValue: repByValue.results ?? [],
  });
});

// 「今すぐ向かうなら」: 現在時刻(±1時間、計3時間分)に絞って過去全データから平均単価が高い
// 住所／エリアを算出する。日付範囲・曜日フィルタ・探車失敗の設定（画面上部）とは独立して、
// 常に全期間・探車失敗除外・実際に支払われた金額(amount_collected>0)のみで集計する。
app.get('/api/sr/now', async (c) => {
  if (!checkPassword(c)) return c.json({ error: 'パスワードが違います' }, 401);
  const hourParam = c.req.query('hour');
  const hour = hourParam !== undefined && /^\d{1,2}$/.test(hourParam) ? Number(hourParam) % 24 : new Date().getUTCHours();
  const hours = [(hour + 23) % 24, hour, (hour + 1) % 24];
  const hourStrs = hours.map((h) => String(h).padStart(2, '0'));
  // 現在地（区）の絞り込み。任意。未指定なら東京23区＋武蔵野市・三鷹市＋その他全エリアが対象（従来通り）
  const areaFilter = (c.req.query('area') ?? '').trim();
  const areaWhere = areaFilter ? 'AND pickup_area = ?' : '';
  const areaParams = areaFilter ? [areaFilter] : [];
  // 現在地を絞ると母数が減るため、住所単位の最低件数を1件まで緩める（右側の「全体」エリアランキングは常に2件以上を要求）
  const spotMinCount = areaFilter ? 1 : 2;

  const [areas, spots] = await Promise.all([
    // エリア別ランキングは現在地の絞り込みに関わらず常に全体（東京全域）から算出する
    c.env.DB.prepare(
      `SELECT COALESCE(NULLIF(pickup_area, ''), '(不明)') AS area, COUNT(*) AS c, AVG(amount_collected) AS avg_fare
       FROM sr_orders
       WHERE dispatch_status <> '探車失敗' AND amount_collected > 0 AND strftime('%H', ordered_at) IN (?, ?, ?)
       GROUP BY area HAVING COUNT(*) >= 3 ORDER BY avg_fare DESC LIMIT 5`
    ).bind(...hourStrs).all(),
    // 住所別ランキングは現在地（区）が指定されていればそのエリア内だけに絞る
    c.env.DB.prepare(
      `SELECT pickup_address AS addr, COALESCE(NULLIF(pickup_area, ''), '(不明)') AS area, COUNT(*) AS c,
        AVG(amount_collected) AS avg_fare, MAX(ordered_at) AS last_at
       FROM sr_orders
       WHERE dispatch_status <> '探車失敗' AND amount_collected > 0 AND strftime('%H', ordered_at) IN (?, ?, ?) ${areaWhere}
         AND pickup_address IS NOT NULL AND pickup_address <> ''
       GROUP BY pickup_address HAVING COUNT(*) >= ${spotMinCount} ORDER BY avg_fare DESC LIMIT 10`
    ).bind(...hourStrs, ...areaParams).all(),
  ]);

  return c.json({
    hour,
    hours,
    area: areaFilter || null,
    areas: areas.results ?? [],
    spots: spots.results ?? [],
  });
});

app.get('/api/sr/customer', async (c) => {
  if (!checkPassword(c)) return c.json({ error: 'パスワードが違います' }, 401);
  const phone = (c.req.query('phone') ?? '').trim();
  if (!phone) return c.json({ error: 'phoneが必要です' }, 400);
  const rows = await c.env.DB.prepare(
    `SELECT order_no, ordered_at, customer_name, pickup_address, destination, driver_name, plate_no,
            dispatch_status, amount_collected, source_type
     FROM sr_orders WHERE phone = ? ORDER BY ordered_at DESC LIMIT 200`
  ).bind(phone).all();
  return c.json({ items: rows.results ?? [] });
});

app.get('/api/sr/uploads', async (c) => {
  if (!checkPassword(c)) return c.json({ error: 'パスワードが違います' }, 401);
  const rows = await c.env.DB.prepare('SELECT * FROM sr_uploads ORDER BY id DESC LIMIT 50').all();
  return c.json({ items: rows.results ?? [] });
});

// S.RIDE管理画面に自動ログインして注文リストCSVを取得し、生バイト列（Shift_JIS）をそのまま返す。
// サーバー側ではパースせず、ブラウザ側の既存ロジック（srParseCsv）にそのまま渡す。
app.get('/api/sr/fetch_remote', async (c) => {
  if (!checkPassword(c)) return c.json({ error: 'パスワードが違います' }, 401);

  const loginId = c.env.SRIDE_LOGIN_ID;
  const loginPw = c.env.SRIDE_PASSWORD;
  if (!loginId || !loginPw) {
    return c.json({ error: 'S.RIDEの自動取得用アカウントが未設定です（SRIDE_LOGIN_ID / SRIDE_PASSWORD）' }, 500);
  }

  const start = c.req.query('start');
  const end = c.req.query('end');
  if (!isValidDate(start) || !isValidDate(end)) {
    return c.json({ error: '取得期間（開始日・終了日）が不正です' }, 400);
  }

  try {
    const result = await srideLoginAndFetchCsv(loginId, loginPw, `${start}T00:00`, `${end}T23:59`);
    if (!result.ok) {
      return c.json({ error: result.message }, result.status);
    }
    return new Response(result.bytes, {
      headers: { 'Content-Type': 'text/csv;charset=Shift_JIS' },
    });
  } catch (err) {
    console.error('sr fetch_remote failed', err);
    const message = err instanceof Error && err.name === 'TimeoutError'
      ? 'S.RIDEへの接続がタイムアウトしました。時間をおいて再度お試しください。'
      : 'S.RIDEからの取得中にエラーが発生しました。S.RIDE側の仕様変更の可能性があります。手動アップロードをご利用ください。';
    return c.json({ error: message }, 502);
  }
});

app.post('/api/sr/import/rows', async (c) => {
  if (!checkPassword(c)) return c.json({ error: 'パスワードが違います' }, 401);
  const body = await c.req.json<{ rows?: Array<Record<string, unknown>> }>().catch(() => ({}) as { rows?: Array<Record<string, unknown>> });
  const rows = body.rows ?? [];
  if (rows.length === 0) return c.json({ ok: true, saved: 0 });
  if (rows.length > 1000) return c.json({ error: '一度に取り込めるのは1000件までです' }, 400);

  const stmts: ReturnType<typeof c.env.DB.prepare>[] = [];
  for (const row of rows) {
    const orderNo = String(row.order_no ?? '').trim();
    if (!orderNo || orderNo.length > 100) continue;
    const values = SR_COLUMNS.map((col) => {
      if (col === 'order_no') return orderNo;
      const v = row[col];
      if (SR_INT_COLUMNS.has(col)) {
        const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
        return Number.isFinite(n) ? n : null;
      }
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s === '' ? null : s.slice(0, 500);
    });
    stmts.push(c.env.DB.prepare(SR_INSERT_SQL).bind(...values));
  }
  if (stmts.length > 0) await c.env.DB.batch(stmts);
  return c.json({ ok: true, saved: stmts.length });
});

app.post('/api/sr/import/finish', async (c) => {
  if (!checkPassword(c)) return c.json({ error: 'パスワードが違います' }, 401);
  const body = await c.req.json<{ file_name?: string; row_count?: number }>().catch(() => ({}) as { file_name?: string; row_count?: number });
  const name = await adminName(c);
  const totalRow = await c.env.DB.prepare('SELECT COUNT(*) AS c FROM sr_orders').first<{ c: number }>();
  const total = totalRow?.c ?? 0;
  await c.env.DB.prepare(
    'INSERT INTO sr_uploads (file_name, uploaded_by, row_count, total_after) VALUES (?, ?, ?, ?)'
  ).bind((body.file_name ?? '').slice(0, 200), name, body.row_count ?? 0, total).run();
  return c.json({ ok: true, total });
});

export default app;
