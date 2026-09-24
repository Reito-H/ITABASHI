// 羽田空港 到着便一覧（ログイン不要・完全公開・複雑なURLでのみアクセス可能）
// タクシー乗務員が付け待ち中にタブレット等で開き、ブックマークして毎回同じURLで確認する想定。
// データ元: tokyo-haneda.com の非公式API（POST /app/api/v2/flight/search）。サーバー側から直接叩く
// （ブラウザと違いCORS制約を受けないため、公式サイトのようなCORSプロキシは不要）。
// ページ: {HANEDA_ARRIVALS_PATH}   API: /api/public/haneda-flights
import { Hono } from 'hono';
import type { Env } from '../auth';
import { HANEDA_ARRIVALS_PATH } from '../config';
import { FAVICON_DATA_URI } from '../html/layout';
import { todayJST } from '../liff_common';

const app = new Hono<{ Bindings: Env }>();

const HANEDA_API_URL = 'https://tokyo-haneda.com/app/api/v2/flight/search';

type RawFlight = {
  flightType: string;
  area_name: string;
  via_area_name: string;
  airlines: { airline: string; flightNumber: string }[];
  date: { key: string };
  on_time: string;
  change_time: string;
  terminal: { terminal: string };
  status: { color: string; text: string; reason: string };
  options?: { type: string; items?: { name: string }[] }[];
};

type Flight = {
  flightType: 'domestic' | 'international';
  from: string;
  airline: string;
  terminal: string;
  scheduled: string;
  actual: string;
  changed: boolean;
  statusColor: string;
  statusText: string;
  reason: string;
  estPax: number | null;
};

// 機種コード→おおよその座席数（羽田到着便APIは国際線のみ機種コードを返す。国内線は取得不可）。
// タクシー乗務員向けの「だいたいの規模感」の目安であり、実座席数・実搭乗率とは異なる推定値。
const SEATS_BY_MODEL_CODE: Record<string, number> = {
  '788': 240, '789': 290, '78X': 330, '78I': 280, '78E': 280, '781': 280, '780': 280, '78J': 330,
  '333': 280, '332': 250, '359': 300, '351': 350,
  '77W': 300, '773': 280, '77N': 300, '772': 280, '77I': 300, '777': 300,
  '763': 210, '76E': 210, '76W': 220,
  '321': 190, '32E': 200, '32Q': 200, '320': 165, '21N': 200,
  '738': 170, '73H': 175, '739': 180,
  '748': 400, '388': 500,
};
const SEATS_BY_PREFIX: Record<string, number> = {
  '74': 400, '77': 300, '78': 280, '35': 320, '33': 270, '76': 210, '32': 190, '31': 160, '21': 190, '73': 170,
};
const INTL_LOAD_FACTOR = 0.8;

function estimatePax(modelCode: string): number | null {
  const c = modelCode.toUpperCase().trim();
  if (!c) return null;
  const seats = SEATS_BY_MODEL_CODE[c] ?? SEATS_BY_PREFIX[c.slice(0, 2)] ?? null;
  return seats == null ? null : Math.round(seats * INTL_LOAD_FACTOR);
}

async function fetchHanedaArrivals(flightType: 1 | 2, searchDt: string): Promise<RawFlight[]> {
  const res = await fetch(HANEDA_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-requested-with': 'XMLHttpRequest',
      'Origin': 'https://tokyo-haneda.com',
    },
    body: JSON.stringify({
      flightType, arrivalType: 2, searchDt,
      airportCodes: [], airlineCodes: [], flightNumber: '', status: [0],
    }),
  });
  if (!res.ok) throw new Error(`haneda api ${flightType}: ${res.status}`);
  const data = await res.json<{ flightlists?: RawFlight[] }>();
  return data.flightlists ?? [];
}

function mapFlight(item: RawFlight): Flight {
  const kind: 'domestic' | 'international' = item.flightType === 'international' ? 'international' : 'domestic';
  const scheduled = item.on_time || '';
  const actual = (item.change_time && item.change_time !== '-') ? item.change_time : '';
  const modelOpt = (item.options ?? []).find(o => o.type === 'modelCode');
  const modelCode = modelOpt?.items?.[0]?.name ?? '';
  return {
    flightType: kind,
    from: item.area_name + (item.via_area_name ? `（経由 ${item.via_area_name}）` : ''),
    airline: (item.airlines ?? []).map(a => `${a.airline} ${a.flightNumber}`).join(' / '),
    terminal: item.terminal?.terminal ?? '',
    scheduled,
    actual,
    changed: !!(actual && scheduled && actual !== scheduled),
    statusColor: item.status?.color ?? '',
    statusText: item.status?.text ?? '',
    reason: item.status?.reason ?? '',
    estPax: modelCode ? estimatePax(modelCode) : null,
  };
}

// ===== API: 到着便一覧（60秒キャッシュ。多数の乗務員が同時に開いても上流APIへの負荷を抑える）=====
app.get('/api/public/haneda-flights', async (c) => {
  const searchDt = todayJST().replace(/-/g, '');
  const cache = caches.default;
  const cacheKey = new Request(`https://internal-cache.example/haneda-flights/${searchDt}`);

  const cached = await cache.match(cacheKey);
  if (cached) return new Response(cached.body, cached);

  let flights: Flight[];
  try {
    const [domestic, international] = await Promise.all([
      fetchHanedaArrivals(1, searchDt),
      fetchHanedaArrivals(2, searchDt),
    ]);
    flights = [...domestic, ...international].map(mapFlight);
    flights.sort((a, b) => (a.actual || a.scheduled).localeCompare(b.actual || b.scheduled));
  } catch (e) {
    return c.json({ error: '羽田空港のフライト情報を取得できませんでした。しばらくしてから再読み込みしてください' }, 502);
  }

  const body = JSON.stringify({ updatedAt: new Date().toISOString(), searchDt, flights });
  const res = new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
  });
  c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
});

// ===== ページ =====
app.get(HANEDA_ARRIVALS_PATH, (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="robots" content="noindex, nofollow">
  <title>羽田空港 到着便一覧</title>
  <link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<style>
  * { box-sizing: border-box; }
  html, body { height:100%; }
  :root { --header-h: 92px; }
  body {
    font-family:'Hiragino Sans','Meiryo',sans-serif; background:#f5f6f8; margin:0; color:#1f2937;
    -webkit-text-size-adjust:100%;
  }
  /* position:sticky が効かない環境でも確実に上部固定されるよう fixed にする
     （実際の高さは JS で測って --header-h に反映し、.page-content の余白と .list-head の位置に使う） */
  header {
    position:fixed; top:0; left:0; right:0; z-index:20; background:#1e3a5f; color:#fff; padding:8px 14px 0;
  }
  header .top-row { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:6px; }
  header h1 { font-size:15px; margin:0; font-weight:800; }
  header .updated { font-size:11px; opacity:0.85; white-space:nowrap; }
  .note {
    font-size:11.5px; background:#0f2743; color:#cbd5e1; padding:6px 14px; line-height:1.6;
  }
  .filters { display:flex; gap:6px; padding-bottom:8px; overflow-x:auto; }
  .chip {
    flex:0 0 auto; padding:7px 14px; border-radius:999px; font-size:13px; font-weight:700;
    background:rgba(255,255,255,0.12); color:#e5edf7; border:1px solid rgba(255,255,255,0.25); cursor:pointer;
    -webkit-tap-highlight-color:transparent; user-select:none;
  }
  .chip.active { background:#fff; color:#1e3a5f; }
  .chip-toggle { margin-left:auto; }
  .chip-toggle.active { background:#facc15; color:#1e3a5f; border-color:#facc15; }
  .page-content { padding-top: var(--header-h); }
  .legend { display:flex; flex-wrap:wrap; gap:10px 14px; padding:8px 14px; font-size:11px; color:#4b5563; background:#eef1f5; }
  .legend span { display:inline-flex; align-items:center; gap:5px; }
  .legend i { width:11px; height:11px; border-radius:3px; display:inline-block; }
  .list-wrap { padding:8px 8px 40px; max-width:1100px; margin:0 auto; }
  .list-head { display:none; }

  /* ---- 行: 縦持ち・狭い画面 = カード表示 ---- */
  .row {
    display:grid;
    grid-template-columns: 64px 1fr 72px;
    grid-template-areas: "time from term" "time air kind" "time pax status";
    align-items:center; column-gap:10px; row-gap:2px;
    background:#fff; border:1px solid #e5e7eb; border-radius:10px;
    padding:10px 12px; margin-bottom:6px;
  }
  .row.now-mark { border:2px solid #2563eb; }
  .row.st-arrived { background:#e2e4e8; }
  .row.st-baggage { background:#fef08a; }
  .row.st-delayed { background:#fbc9d2; }
  .row.st-cancelled { background:#f8b4b4; }
  .c-time { grid-area:time; text-align:center; }
  .time-label { display:block; font-size:9.5px; font-weight:800; letter-spacing:.04em; }
  .lbl-actual { color:#15803d; }
  .lbl-expected { color:#c2410c; }
  .c-time .t { display:block; font-size:22px; font-weight:800; line-height:1.15; }
  .c-time .sched { display:block; font-size:11px; color:rgba(31,41,55,.55); }
  .c-time .sched.strike { text-decoration:line-through; }
  .c-from { grid-area:from; font-size:15.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; align-self:end; }
  .c-air { grid-area:air; font-size:10.5px; color:#9ca3af; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; align-self:start; }
  .c-pax { grid-area:pax; font-size:11px; color:#6b7280; align-self:end; }
  .c-pax b { color:#374151; font-size:12.5px; }
  .c-term { grid-area:term; justify-self:end; }
  .c-kind { grid-area:kind; justify-self:end; }
  .c-status { grid-area:status; justify-self:end; }
  .badge-term {
    font-size:11.5px; font-weight:800; padding:2px 8px; border-radius:5px; color:#fff; white-space:nowrap;
  }
  .term-T1 { background:#2563eb; }
  .term-T2 { background:#0d9488; }
  .term-T3 { background:#7c3aed; }
  .kind-tag {
    font-size:10px; font-weight:700; padding:1px 6px; border-radius:4px; white-space:nowrap;
  }
  .kind-domestic { background:#e0e7ff; color:#3730a3; }
  .kind-international { background:#fce7f3; color:#9d174d; }
  .status-tag {
    font-size:11.5px; font-weight:800; padding:3px 8px; border-radius:6px; white-space:nowrap; background:rgba(255,255,255,0.6); color:#374151;
  }
  .empty, .loading, .err {
    text-align:center; color:#6b7280; font-size:14px; padding:40px 20px;
  }
  .err { color:#dc2626; }

  /* ---- 横長画面（タブレット横向き等）= 表形式 ---- */
  @media (min-width: 680px) {
    .list-head {
      display:grid; grid-template-columns: 96px 1.5fr 0.8fr 66px 60px 62px 130px;
      gap:8px; padding:6px 14px; font-size:11.5px; font-weight:700; color:#6b7280;
      position:sticky; top:var(--header-h); z-index:9; background:#eef1f5; border-bottom:1px solid #dbe0e6;
    }
    .row {
      grid-template-columns: 96px 1.5fr 0.8fr 66px 60px 62px 130px;
      grid-template-areas: "time from air pax term kind status";
      row-gap:0; padding:8px 14px;
    }
    .c-time { text-align:left; }
    .c-from, .c-air { align-self:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .c-pax { align-self:center; }
    .c-term, .c-kind, .c-status { justify-self:start; }
  }
</style>
</head>
<body>
  <header>
    <div class="top-row">
      <h1>羽田空港 到着便一覧</h1>
      <div class="updated" id="updated">読み込み中…</div>
    </div>
    <div class="filters">
      <div class="chip active" data-f="all">すべて</div>
      <div class="chip" data-f="domestic">国内線</div>
      <div class="chip" data-f="international">国際線</div>
      <div class="chip" data-f="T1">T1</div>
      <div class="chip" data-f="T2">T2</div>
      <div class="chip" data-f="T3">T3</div>
      <div class="chip chip-toggle" id="toggle-all">全便表示</div>
    </div>
  </header>
  <div class="page-content">
    <div class="note">国際線はT3のほか、T2の一部（国内線とは別の入口・4号乗り場側）にも到着します。ターミナル表示をよく確認してください。表示は既定で現在〜3時間後まで（遅延で未着の便・到着後1時間以内の便は時間外でも表示）。想定人数は機種から算出したおおまかな目安（国際線のみ・実際の搭乗率とは異なります）。</div>
    <div class="legend">
      <span><i style="background:#fef08a"></i>手荷物引渡中（まもなくロビーへ）</span>
      <span><i style="background:#fbc9d2"></i>遅延</span>
      <span><i style="background:#f8b4b4"></i>欠航</span>
      <span><i style="background:#e2e4e8"></i>到着済み</span>
    </div>
    <div class="list-wrap">
      <div class="list-head">
        <div>時刻</div><div>出発地</div><div>航空会社</div><div>人数目安</div><div>T</div><div>種別</div><div>状況</div>
      </div>
      <div id="list"><div class="loading">読み込み中…</div></div>
    </div>
  </div>

<script>
function syncHeaderHeight() {
  var h = document.querySelector('header').offsetHeight;
  document.documentElement.style.setProperty('--header-h', h + 'px');
}
syncHeaderHeight();
window.addEventListener('resize', syncHeaderHeight);
window.addEventListener('load', syncHeaderHeight);
var ALL_FLIGHTS = [];
var CUR_FILTER = 'all';
var SHOW_ALL = false;
var WINDOW_AHEAD_MIN = 180;
var WINDOW_BEHIND_ARRIVED_MIN = 60;

function statusClass(f) {
  if (f.statusColor === '2') return 'st-cancelled';
  if (f.statusText && f.statusText.indexOf('手荷物') !== -1) return 'st-baggage';
  if (f.statusColor === '3') return 'st-delayed';
  if (f.statusColor === '4') return 'st-arrived';
  return '';
}
function toMinutes(hm) {
  if (!hm || hm.indexOf(':') === -1) return null;
  var p = hm.split(':');
  var n = parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  return isNaN(n) ? null : n;
}
function nowMinutes() {
  var jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.getUTCHours() * 60 + jst.getUTCMinutes();
}
function nowHM() {
  var n = nowMinutes();
  return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
}
function inTimeWindow(f, nowMin) {
  if (SHOW_ALL) return true;
  var stCls = statusClass(f);
  var effMin = toMinutes(f.actual || f.scheduled);
  if (effMin == null) return true;
  var isSettled = stCls === 'st-arrived' || stCls === 'st-cancelled';
  if (isSettled) return effMin >= nowMin - WINDOW_BEHIND_ARRIVED_MIN;
  // 遅延等でまだ到着していない便は、定刻を過ぎていても表示し続ける
  return effMin <= nowMin + WINDOW_AHEAD_MIN;
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function render() {
  var listEl = document.getElementById('list');
  var now = nowHM();
  var nowMin = nowMinutes();
  var filtered = ALL_FLIGHTS.filter(function (f) {
    if (CUR_FILTER === 'domestic' || CUR_FILTER === 'international') { if (f.flightType !== CUR_FILTER) return false; }
    else if (CUR_FILTER !== 'all') { if (f.terminal !== CUR_FILTER) return false; }
    return inTimeWindow(f, nowMin);
  });
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty">' + (SHOW_ALL ? '該当する便がありません' : '直近3時間以内の該当便はありません（「全便表示」で1日分を確認できます）') + '</div>';
    return;
  }
  var placedNowMark = false;
  var html = filtered.map(function (f) {
    var mainTime = f.actual || f.scheduled || '--:--';
    var showSched = f.changed && f.scheduled;
    var isCancelled = f.statusColor === '2';
    var stCls = statusClass(f);
    var isLanded = stCls === 'st-arrived' || stCls === 'st-baggage';
    var timeLabel = (showSched && !isCancelled)
      ? '<span class="time-label ' + (isLanded ? 'lbl-actual' : 'lbl-expected') + '">' + (isLanded ? '実績' : '予想') + '</span>'
      : '';
    var isPast = stCls === 'st-arrived' && mainTime < now;
    var isNow = !placedNowMark && !isPast && mainTime >= now;
    if (isNow) placedNowMark = true;
    var termSafeCls = (f.terminal || '').replace(/[^A-Za-z0-9]/g, '');
    var termBadge = f.terminal ? '<span class="badge-term term-' + termSafeCls + '">' + escapeHtml(f.terminal) + '</span>' : '';
    var kindTag = '<span class="kind-tag kind-' + f.flightType + '">' + (f.flightType === 'domestic' ? '国内' : '国際') + '</span>';
    var stText = f.statusText || '定刻';
    var paxHtml = f.estPax ? '約<b>' + f.estPax + '</b>名' : '';
    return '' +
      '<div class="row' + (stCls ? ' ' + stCls : '') + (isNow ? ' now-mark' : '') + '">' +
        '<div class="c-time">' +
          timeLabel +
          '<span class="t"' + (isCancelled ? ' style="text-decoration:line-through;color:#dc2626"' : '') + '>' + escapeHtml(mainTime) + '</span>' +
          (showSched ? '<span class="sched strike">' + escapeHtml(f.scheduled) + '</span>' : '') +
        '</div>' +
        '<div class="c-from">' + escapeHtml(f.from) + '</div>' +
        '<div class="c-air">' + escapeHtml(f.airline) + '</div>' +
        '<div class="c-pax">' + paxHtml + '</div>' +
        '<div class="c-term">' + termBadge + '</div>' +
        '<div class="c-kind">' + kindTag + '</div>' +
        '<div class="c-status"><span class="status-tag">' + escapeHtml(stText) + '</span></div>' +
      '</div>';
  }).join('');
  listEl.innerHTML = html;
  if (placedNowMark) {
    var el = listEl.querySelector('.now-mark');
    if (el) el.scrollIntoView({ block: 'center' });
  }
}
function setFilter(f) {
  CUR_FILTER = f;
  document.querySelectorAll('.chip[data-f]').forEach(function (c) {
    c.classList.toggle('active', c.getAttribute('data-f') === f);
  });
  render();
}
document.querySelectorAll('.chip[data-f]').forEach(function (c) {
  c.addEventListener('click', function () { setFilter(c.getAttribute('data-f')); });
});
document.getElementById('toggle-all').addEventListener('click', function () {
  SHOW_ALL = !SHOW_ALL;
  this.classList.toggle('active', SHOW_ALL);
  render();
});

var firstLoad = true;
function load() {
  fetch('/api/public/haneda-flights')
    .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
    .then(function (res) {
      if (!res.ok) throw new Error(res.j && res.j.error ? res.j.error : 'エラー');
      ALL_FLIGHTS = res.j.flights || [];
      var d = new Date(res.j.updatedAt);
      var jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      var hm = String(jst.getUTCHours()).padStart(2, '0') + ':' + String(jst.getUTCMinutes()).padStart(2, '0');
      document.getElementById('updated').textContent = hm + ' 時点';
      render();
    })
    .catch(function (e) {
      if (firstLoad) {
        document.getElementById('list').innerHTML = '<div class="err">' + escapeHtml(e.message || '取得に失敗しました') + '</div>';
      }
    })
    .finally(function () { firstLoad = false; });
}
load();
setInterval(load, 60000);
</script>
</body>
</html>`);
});

export default app;
