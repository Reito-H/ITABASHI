// 事故モニター表示（ログイン不要・常時表示用）
// かつて「無事故キロ数計算」を印刷して時計下に掲示していた運用の置き換え。
// 事故の総数・課別件数（0件の課も含め1〜4課すべて）・時間帯を表示し、モニターに映しっぱなしにする想定。
// 文字は原則黒。強調したい数字（総数・実績のある課・時間帯のピーク）だけ赤／黄色を使う。
// レイアウト(layout.ts)は使わず、完全に独立したスタンドアロンページとして描画する。
//
// 表示モード（設定画面「モニター表示」から切替。既定は'accidents'で従来通りの見た目）:
//   'accidents' = 事故データのみ（従来通り） / 'newcomers' = 新人紹介のみ / 'alternate' = 両方を交互表示（秒数設定可）
export function accidentsMonitorPage(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>事故モニター表示</title>
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; height: 100%;
    background: #0f172a;
    color: #111827;
    font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif;
    overflow: hidden;
  }

  /* ===== モード切替（事故ビュー／新人紹介ビュー）===== */
  .mode-view { position: fixed; inset: 0; display: none; opacity: 0; transition: opacity .5s ease; }
  .mode-view.ready { display: flex; }
  .mode-view.show { opacity: 1; }

  /* ===== 事故データ表示 ===== */
  #accidents-view { flex-direction: column; padding: clamp(16px, 2.6vw, 36px); background: #f4f6f8; color: #111827; }

  .top-row { display: flex; justify-content: space-between; align-items: flex-start; flex: none; }
  .month-label { font-size: clamp(20px, 2.6vw, 34px); color: #111827; font-weight: 700; letter-spacing: .04em; }
  .clock { text-align: right; }
  .clock-time { font-size: clamp(28px, 3.6vw, 50px); font-weight: 800; font-variant-numeric: tabular-nums; color: #111827; }
  .clock-date { font-size: clamp(14px, 1.5vw, 20px); color: #4b5563; margin-top: 2px; }

  .main-row {
    display: flex; gap: clamp(14px, 2vw, 28px); align-items: stretch;
    margin: clamp(10px, 1.6vh, 18px) 0; flex: none;
  }

  .total-panel {
    background: linear-gradient(155deg, #ef4444 0%, #dc2626 55%, #991b1b 100%);
    border-radius: 26px;
    padding: clamp(18px, 2.6vh, 34px) clamp(26px, 3.2vw, 52px);
    display: flex; flex-direction: column; align-items: flex-start; justify-content: center;
    flex: 0 0 auto;
    position: relative;
    box-shadow: 0 18px 44px rgba(153, 27, 27, .38);
    animation: warn-pulse-ring 1.7s ease-in-out infinite;
  }
  @keyframes warn-pulse-ring {
    0%, 100% { box-shadow: 0 18px 44px rgba(153, 27, 27, .38), 0 0 0 0 rgba(239, 68, 68, .45); }
    50% { box-shadow: 0 18px 44px rgba(153, 27, 27, .38), 0 0 0 16px rgba(239, 68, 68, 0); }
  }
  .total-label {
    font-size: clamp(18px, 2vw, 26px); color: #fecaca; font-weight: 800; letter-spacing: .08em;
    margin-bottom: 6px; display: flex; align-items: center; gap: 9px;
  }
  .total-label svg { flex: none; width: clamp(18px, 2vw, 26px); height: clamp(18px, 2vw, 26px); }
  .total-count-row { display: flex; align-items: baseline; }
  .total-count { font-size: clamp(130px, 22vw, 280px); font-weight: 900; line-height: .82; color: #ffffff; font-variant-numeric: tabular-nums; text-shadow: 0 6px 26px rgba(0,0,0,.28); }
  .total-unit { font-size: clamp(30px, 3.6vw, 52px); font-weight: 800; color: #fecaca; margin-left: 10px; }
  .hero-diff { margin-top: 14px; font-size: clamp(17px, 1.9vw, 26px); font-weight: 800; padding: 7px 18px; border-radius: 999px; white-space: nowrap; }
  .hero-diff.up { background: #ffffff; color: #b91c1c; }
  .hero-diff.flat { background: rgba(255,255,255,.2); color: #ffffff; }

  .division-panel {
    background: #ffffff; border: 1px solid #e2e7ee; border-radius: 18px;
    padding: clamp(14px, 2vh, 24px) clamp(16px, 2vw, 28px);
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; justify-content: center;
  }
  .division-title { font-size: clamp(17px, 1.8vw, 24px); color: #111827; font-weight: 700; letter-spacing: .05em; margin-bottom: clamp(10px, 1.8vh, 20px); }
  .division-grid { display: flex; gap: clamp(10px, 1.6vw, 24px); flex-wrap: wrap; }
  .division-item {
    flex: 1; min-width: 90px; text-align: center;
    background: #fafafa; border: 1px solid #e5e7eb; border-radius: 12px;
    padding: clamp(10px, 1.8vh, 20px) 6px;
  }
  .division-item.has-count {
    background: #fef9c3; border: 1px solid #f4d35e;
  }
  .division-name { font-size: clamp(16px, 1.7vw, 22px); color: #111827; font-weight: 700; margin-bottom: 6px; }
  .division-count { font-size: clamp(42px, 7.2vw, 100px); font-weight: 800; color: #111827; line-height: 1; font-variant-numeric: tabular-nums; }
  .division-item.has-count .division-count { color: #b45309; }
  .division-unit { font-size: clamp(14px, 1.4vw, 19px); color: #4b5563; font-weight: 600; margin-left: 3px; }

  .band-title { font-size: clamp(17px, 1.8vw, 24px); color: #111827; font-weight: 700; letter-spacing: .06em; margin-bottom: 10px; flex: none; }
  .bands {
    flex: 1; position: relative; min-height: 0; overflow: hidden;
    background: #ffffff; border: 1px solid #e2e7ee; border-radius: 16px;
  }
  .bands.empty { display: flex; align-items: center; justify-content: center; }
  .bands-empty-msg { font-size: clamp(20px, 2.6vw, 32px); color: #4b5563; font-weight: 700; }

  .band-view {
    position: absolute; inset: 0; padding: clamp(10px, 1.6vh, 18px);
    opacity: 0; transition: opacity .4s ease; pointer-events: none;
  }
  .band-view.show { opacity: 1; }

  .band-grid-view {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); grid-auto-rows: 1fr;
    gap: clamp(6px, 1vw, 12px);
  }
  .band-cell {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    border-radius: 10px; background: #fafafa; border: 1px solid #eef0f3;
    min-width: 0; min-height: 0;
  }
  .band-cell.peak { background: #fee2e2; border: 1px solid #f3a5a5; }
  .band-range { font-size: clamp(16px, 2vw, 26px); color: #111827; font-weight: 700; }
  .band-count { font-size: clamp(38px, 7vw, 100px); font-weight: 800; color: #111827; line-height: 1.15; font-variant-numeric: tabular-nums; }
  .band-cell.peak .band-count { color: #dc2626; }
  .band-unit { font-size: clamp(14px, 1.4vw, 19px); color: #4b5563; font-weight: 600; margin-left: 2px; }

  .band-hero-view {
    display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
  }
  .band-hero-main {
    display: flex; align-items: baseline; justify-content: center; flex-wrap: wrap;
    gap: clamp(4px, 1vw, 12px); max-width: 100%;
  }
  .band-hero-range { font-size: clamp(40px, 6.5vw, 110px); font-weight: 800; color: #dc2626; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .band-hero-label { font-size: clamp(26px, 3.6vw, 60px); font-weight: 800; color: #dc2626; line-height: 1.1; }
  .band-hero-count { font-size: clamp(18px, 2vw, 28px); color: #6b7280; font-weight: 700; margin-top: clamp(10px, 1.6vh, 18px); }

  .foot { display: flex; justify-content: space-between; align-items: center; margin-top: clamp(8px, 1.4vh, 16px); font-size: clamp(13px, 1.2vw, 16px); color: #6b7280; flex: none; }

  /* ===== 新人紹介表示 ===== */
  #newcomers-view { flex-direction: column; padding: clamp(20px, 3vw, 44px); background: linear-gradient(165deg, #eff6ff 0%, #ffffff 45%); color: #111827; }

  .nc-top-row { display: flex; justify-content: space-between; align-items: flex-start; flex: none; }
  .nc-page-label {
    display: inline-block; font-size: clamp(15px, 1.7vw, 21px); color: #ffffff; font-weight: 800; letter-spacing: .1em;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: clamp(8px, 1.1vh, 12px) clamp(18px, 2vw, 26px);
    border-radius: 999px; box-shadow: 0 10px 24px rgba(37, 99, 235, .3);
  }
  .nc-clock { text-align: right; }
  .nc-clock-time { font-size: clamp(24px, 3vw, 42px); font-weight: 800; font-variant-numeric: tabular-nums; color: #111827; }
  .nc-clock-date { font-size: clamp(13px, 1.4vw, 18px); color: #6b7280; margin-top: 2px; }

  #nc-card-area { flex: 1; position: relative; min-height: 0; margin-top: clamp(12px, 2vh, 24px); }

  .nc-empty-msg {
    height: 100%; display: flex; align-items: center; justify-content: center;
    font-size: clamp(20px, 2.6vw, 34px); color: #6b7280; font-weight: 700;
  }

  .nc-card-view {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    gap: clamp(32px, 5.5vw, 72px);
    opacity: 0; transition: opacity .5s ease; pointer-events: none;
  }
  .nc-card-view.show { opacity: 1; }

  .nc-card-photo-wrap {
    flex: 0 0 auto; width: clamp(240px, 32vw, 480px); height: clamp(240px, 32vw, 480px); border-radius: 32px;
    overflow: hidden; background: linear-gradient(160deg, #dbeafe, #eff6ff); border: 8px solid #2563eb;
    box-shadow: 0 24px 56px rgba(37, 99, 235, .28), 0 0 0 6px rgba(37, 99, 235, .08);
  }
  .nc-card-photo-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .nc-card-photo-wrap.no-photo { display: flex; align-items: center; justify-content: center; }
  .nc-card-photo-placeholder { width: clamp(64px, 8.5vw, 130px); height: clamp(64px, 8.5vw, 130px); color: #93c5fd; }

  .nc-card-info { flex: 1 1 auto; min-width: 0; max-width: 660px; }
  .nc-card-welcome { font-size: clamp(17px, 1.9vw, 25px); color: #2563eb; font-weight: 800; letter-spacing: .1em; margin-bottom: 10px; }
  .nc-card-name { font-size: clamp(52px, 7.4vw, 118px); font-weight: 900; line-height: 1.1; color: #0f172a; word-break: break-word; }
  .nc-card-division {
    display: inline-block; margin-top: clamp(12px, 1.8vh, 20px); font-size: clamp(17px, 1.9vw, 25px); font-weight: 800;
    color: #ffffff; background: linear-gradient(135deg, #3b82f6, #1d4ed8); border-radius: 999px; padding: 7px 24px;
    box-shadow: 0 10px 22px rgba(37, 99, 235, .3);
  }
  .nc-card-comment {
    margin-top: clamp(20px, 3.2vh, 36px); font-size: clamp(19px, 2.3vw, 32px); font-weight: 700; color: #1e293b;
    line-height: 1.6; background: #eff6ff; border-left: 7px solid #2563eb; border-radius: 12px;
    padding: clamp(16px, 2.2vh, 24px) clamp(20px, 2.2vw, 28px);
    box-shadow: 0 6px 20px rgba(15, 23, 42, .06);
  }

  .nc-foot { display: flex; justify-content: space-between; align-items: center; margin-top: clamp(10px, 1.6vh, 18px); font-size: clamp(13px, 1.2vw, 16px); color: #9ca3af; flex: none; }
  .nc-dots { display: flex; gap: 8px; }
  .nc-dot { width: 10px; height: 10px; border-radius: 50%; background: #dbeafe; }
  .nc-dot.active { background: #2563eb; }

  #err-banner {
    display: none; position: fixed; top: 0; left: 0; right: 0; background: #dc2626; color: #fff;
    text-align: center; padding: 8px; font-size: 13px; font-weight: 700; z-index: 10;
  }
</style>
</head>
<body>

<div id="err-banner"></div>

<div id="accidents-view" class="mode-view">
  <div class="top-row">
    <div class="month-label" id="month-label">&nbsp;</div>
    <div class="clock">
      <div class="clock-time" id="clock-time">--:--:--</div>
      <div class="clock-date" id="clock-date">&nbsp;</div>
    </div>
  </div>

  <div class="main-row">
    <div class="total-panel">
      <div class="total-label">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3L22 20H2L12 3Z" stroke="#fecaca" stroke-width="2" stroke-linejoin="round"/><path d="M12 9.5V14" stroke="#fecaca" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.15" fill="#fecaca"/></svg>
        今月の事故 総数
      </div>
      <div class="total-count-row">
        <span class="total-count" id="hero-count">0</span>
        <span class="total-unit">件</span>
      </div>
      <div class="hero-diff flat" id="hero-diff">&nbsp;</div>
    </div>
    <div class="division-panel">
      <div class="division-title">課別件数（1〜4課）</div>
      <div class="division-grid" id="division-grid"></div>
    </div>
  </div>

  <div class="band-title">発生時間帯（最多）</div>
  <div class="bands" id="bands"></div>

  <div class="foot">
    <span id="foot-updated">&nbsp;</span>
    <span>ホシコン 事故モニター</span>
  </div>
</div>

<div id="newcomers-view" class="mode-view">
  <div class="nc-top-row">
    <div class="nc-page-label">WELCOME NEW MEMBER</div>
    <div class="nc-clock">
      <div class="nc-clock-time" id="nc-clock-time">--:--:--</div>
      <div class="nc-clock-date" id="nc-clock-date">&nbsp;</div>
    </div>
  </div>

  <div id="nc-card-area"></div>

  <div class="nc-foot">
    <div class="nc-dots" id="nc-dots"></div>
    <span>ホシコン 新人紹介</span>
  </div>
</div>

<script>
(function () {
  var REFRESH_MS = 3 * 60 * 60 * 1000;
  var BAND_HOURS = 2;
  var BAND_COUNT = 12;
  var NC_CARD_INTERVAL_MS = 8000; // データ取得後、設定値（newcomerCardIntervalSeconds）に置き換わる

  function showError(msg) {
    var el = document.getElementById('err-banner');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 6000);
  }

  function fmt2(n) { return String(n).padStart(2, '0'); }
  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function tickClock() {
    var now = new Date();
    var time = fmt2(now.getHours()) + ':' + fmt2(now.getMinutes()) + ':' + fmt2(now.getSeconds());
    var days = ['日', '月', '火', '水', '木', '金', '土'];
    var date = now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日（' + days[now.getDay()] + '）';
    document.getElementById('clock-time').textContent = time;
    document.getElementById('clock-date').textContent = date;
    document.getElementById('nc-clock-time').textContent = time;
    document.getElementById('nc-clock-date').textContent = date;
  }
  tickClock();
  setInterval(tickClock, 1000);

  function renderDivisions(divisions) {
    var wrap = document.getElementById('division-grid');
    wrap.innerHTML = '';
    if (!divisions || !divisions.length) {
      wrap.innerHTML = '<div style="color:#4b5563;font-size:14px;">データなし</div>';
      return;
    }
    divisions.forEach(function (d) {
      var name = d.division != null ? d.division + '課' : '不明';
      var item = document.createElement('div');
      item.className = 'division-item' + (d.cnt > 0 ? ' has-count' : '');
      item.innerHTML =
        '<div class="division-name">' + name + '</div>' +
        '<div><span class="division-count">' + d.cnt + '</span><span class="division-unit">件</span></div>';
      wrap.appendChild(item);
    });
  }

  // 「全時間帯のグリッド表示」と「最多の時間帯だけを大きく見せる表示」を3秒ごとに
  // 交互に切り替える。0件の時間帯はグリッドから除外し、最多の時間帯だけ赤で目立たせる。
  var bandCycleTimer = null;

  function renderBands(bands) {
    if (bandCycleTimer) { clearInterval(bandCycleTimer); bandCycleTimer = null; }

    var max = 0;
    for (var i = 0; i < BAND_COUNT; i++) if ((bands[i] || 0) > max) max = bands[i] || 0;

    var wrap = document.getElementById('bands');
    wrap.innerHTML = '';

    if (max === 0) {
      wrap.className = 'bands empty';
      wrap.innerHTML = '<div class="bands-empty-msg">今月はまだ事故が発生していません</div>';
      return;
    }
    wrap.className = 'bands';

    var peaks = [];
    for (var j = 0; j < BAND_COUNT; j++) {
      if ((bands[j] || 0) === max) peaks.push(j);
    }

    var gridView = document.createElement('div');
    gridView.className = 'band-view band-grid-view show';
    for (var k = 0; k < BAND_COUNT; k++) {
      var cnt = bands[k] || 0;
      if (cnt === 0) continue;
      var from = k * BAND_HOURS;
      var to = from + BAND_HOURS;
      var isPeak = cnt === max;
      var cell = document.createElement('div');
      cell.className = 'band-cell' + (isPeak ? ' peak' : '');
      cell.innerHTML =
        '<div class="band-range">' + from + '-' + to + '時</div>' +
        '<div><span class="band-count">' + cnt + '</span><span class="band-unit">件</span></div>';
      gridView.appendChild(cell);
    }
    wrap.appendChild(gridView);

    var rangeText = peaks.map(function (idx) {
      return (idx * BAND_HOURS) + '時から' + (idx * BAND_HOURS + BAND_HOURS) + '時';
    }).join('・');

    var heroView = document.createElement('div');
    heroView.className = 'band-view band-hero-view';
    heroView.innerHTML =
      '<div class="band-hero-main">' +
        '<span class="band-hero-range">' + rangeText + '</span>' +
        '<span class="band-hero-label">が最多です！</span>' +
      '</div>' +
      '<div class="band-hero-count">' + max + '件発生</div>';
    wrap.appendChild(heroView);

    bandCycleTimer = setInterval(function () {
      gridView.classList.toggle('show');
      heroView.classList.toggle('show');
    }, 3000);
  }

  function renderAccidents(data) {
    document.getElementById('month-label').textContent = data.monthLabel + '　現在';
    document.getElementById('hero-count').textContent = data.count;

    var diffEl = document.getElementById('hero-diff');
    if (data.prevCount === null || data.prevCount === undefined) {
      diffEl.textContent = '前月比 —';
      diffEl.className = 'hero-diff flat';
    } else {
      var diff = data.count - data.prevCount;
      if (diff === 0) {
        diffEl.textContent = '前月比 ±0（前月 ' + data.prevCount + '件）';
        diffEl.className = 'hero-diff flat';
      } else {
        diffEl.textContent = '前月比 ' + (diff > 0 ? '+' : '') + diff + '（前月 ' + data.prevCount + '件）';
        diffEl.className = 'hero-diff ' + (diff > 0 ? 'up' : 'flat');
      }
    }

    renderDivisions(data.divisions);
    renderBands(data.bands);

    var gen = new Date(data.generatedAt);
    document.getElementById('foot-updated').textContent =
      'データ更新: ' + fmt2(gen.getHours()) + ':' + fmt2(gen.getMinutes());
  }

  // ===== 新人紹介ビュー（newcomer_monitor.tsと同じカード送りロジック） =====
  var ncIntros = [];
  var ncCycleTimer = null;
  var ncCycleIndex = 0;

  function ncCardHtml(intro) {
    var photo = intro.photoUrl
      ? '<div class="nc-card-photo-wrap"><img src="' + intro.photoUrl + '" alt=""></div>'
      : '<div class="nc-card-photo-wrap no-photo"><svg class="nc-card-photo-placeholder" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></div>';
    var division = intro.division ? (intro.division + '課' + (intro.team ? '・' + intro.team + '班' : '')) : '所属未定';
    var comment = intro.comment ? '<div class="nc-card-comment">' + escHtml(intro.comment) + '</div>' : '';
    return photo +
      '<div class="nc-card-info">' +
        '<div class="nc-card-welcome">新人紹介</div>' +
        '<div class="nc-card-name">' + escHtml(intro.name) + '</div>' +
        '<div class="nc-card-division">' + division + '</div>' +
        comment +
      '</div>';
  }

  function ncRenderDots() {
    var wrap = document.getElementById('nc-dots');
    if (ncIntros.length <= 1) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = ncIntros.map(function (_, i) {
      return '<div class="nc-dot' + (i === ncCycleIndex ? ' active' : '') + '"></div>';
    }).join('');
  }

  function ncShowCard(index) {
    var area = document.getElementById('nc-card-area');
    var view = document.createElement('div');
    view.className = 'nc-card-view';
    view.innerHTML = ncCardHtml(ncIntros[index]);
    area.appendChild(view);
    requestAnimationFrame(function () { view.classList.add('show'); });

    var prevViews = Array.prototype.slice.call(area.querySelectorAll('.nc-card-view')).filter(function (v) { return v !== view; });
    prevViews.forEach(function (v) {
      v.classList.remove('show');
      setTimeout(function () { if (v.parentNode) v.parentNode.removeChild(v); }, 600);
    });
    ncCycleIndex = index;
    ncRenderDots();
  }

  function renderNewcomers(intros) {
    ncIntros = intros || [];
    if (ncCycleTimer) { clearInterval(ncCycleTimer); ncCycleTimer = null; }

    var area = document.getElementById('nc-card-area');
    area.innerHTML = '';

    if (ncIntros.length === 0) {
      area.innerHTML = '<div class="nc-empty-msg">新人紹介カードを準備中です</div>';
      document.getElementById('nc-dots').innerHTML = '';
      return;
    }

    ncShowCard(0);
    if (ncIntros.length > 1) {
      ncCycleTimer = setInterval(function () {
        ncShowCard((ncCycleIndex + 1) % ncIntros.length);
      }, NC_CARD_INTERVAL_MS);
    }
  }

  // ===== モード切替（事故のみ／新人紹介のみ／交互表示） =====
  var alternateTimer = null;

  function applyDisplayMode(mode, alternateSeconds) {
    var accidentsEl = document.getElementById('accidents-view');
    var newcomersEl = document.getElementById('newcomers-view');
    accidentsEl.classList.add('ready');
    newcomersEl.classList.add('ready');

    if (alternateTimer) { clearInterval(alternateTimer); alternateTimer = null; }

    if (mode === 'newcomers') {
      accidentsEl.classList.remove('show');
      newcomersEl.classList.add('show');
    } else if (mode === 'alternate') {
      accidentsEl.classList.add('show');
      newcomersEl.classList.remove('show');
      var showingAccidents = true;
      var seconds = alternateSeconds && alternateSeconds >= 2 ? alternateSeconds : 15;
      alternateTimer = setInterval(function () {
        showingAccidents = !showingAccidents;
        accidentsEl.classList.toggle('show', showingAccidents);
        newcomersEl.classList.toggle('show', !showingAccidents);
      }, seconds * 1000);
    } else {
      accidentsEl.classList.add('show');
      newcomersEl.classList.remove('show');
    }
  }

  function renderData(data) {
    renderAccidents(data);
    if (data.displayMode === 'newcomers' || data.displayMode === 'alternate') {
      if (data.newcomerCardIntervalSeconds && data.newcomerCardIntervalSeconds >= 2) {
        NC_CARD_INTERVAL_MS = data.newcomerCardIntervalSeconds * 1000;
      }
      renderNewcomers(data.newcomers);
    }
    applyDisplayMode(data.displayMode, data.alternateSeconds);
  }

  async function loadData() {
    var res = await fetch('/api/public/accidents-monitor');
    if (!res.ok) throw new Error('http ' + res.status);
    return res.json();
  }

  function scheduleRefresh() {
    // 長時間映しっぱなしにする前提のため、フル再読み込みでメモリ肥大・状態のズレを防ぐ
    setTimeout(function () { location.reload(); }, REFRESH_MS);
  }

  // 設定ページの「強制更新」ボタンや新人紹介カードの追加・編集が行われたら、通常の更新間隔を待たずにリロードする。
  // モニターは別デバイスのためサーバー経由の合図が必要 → 軽量なフラグだけを短い間隔でポーリングする。
  var FORCE_REFRESH_POLL_MS = 30 * 1000;
  var forceRefreshBaseline = null;

  async function checkForceRefresh() {
    try {
      var res = await fetch('/api/public/accidents-monitor-refresh-flag');
      if (!res.ok) return;
      var data = await res.json();
      if (forceRefreshBaseline === null) {
        forceRefreshBaseline = data.updatedAt;
        return;
      }
      if (data.updatedAt && data.updatedAt !== forceRefreshBaseline) {
        location.reload();
      }
    } catch (e) { /* 通信エラーは無視し次回のポーリングに任せる */ }
  }

  async function boot() {
    try {
      var data = await loadData();
      renderData(data);
      scheduleRefresh();
    } catch (e) {
      showError('データの取得に失敗しました。しばらくして自動で再試行します。');
      setTimeout(function () { location.reload(); }, 30000);
    }
  }

  boot();
  checkForceRefresh();
  setInterval(checkForceRefresh, FORCE_REFRESH_POLL_MS);
})();
</script>
</body>
</html>`;
}
