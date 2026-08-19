// 新人紹介モニター表示（ログイン不要・常時表示用）
// 事故モニター(accidents_monitor.ts)と同じく別デバイスに映しっぱなしにする想定の独立ページ。
// 新人紹介カード（写真・名前・課/班・一言コメント）を1人ずつ大きく表示し、一定間隔で自動的に次のカードへ送る。
// レイアウト(layout.ts)は使わず、完全に独立したスタンドアロンページとして描画する。
export function newcomerMonitorPage(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>新人紹介モニター表示</title>
<style>
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0; height: 100%;
    background: #ffffff;
    color: #111827;
    font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif;
    overflow: hidden;
  }

  #board {
    display: none; height: 100vh; padding: clamp(20px, 3vw, 44px); flex-direction: column;
    background: linear-gradient(165deg, #eff6ff 0%, #ffffff 45%);
  }
  #board.show { display: flex; }

  .top-row { display: flex; justify-content: space-between; align-items: flex-start; flex: none; }
  .page-label {
    display: inline-block; font-size: clamp(15px, 1.7vw, 21px); color: #ffffff; font-weight: 800; letter-spacing: .1em;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: clamp(8px, 1.1vh, 12px) clamp(18px, 2vw, 26px);
    border-radius: 999px; box-shadow: 0 10px 24px rgba(37, 99, 235, .3);
  }
  .clock { text-align: right; }
  .clock-time { font-size: clamp(24px, 3vw, 42px); font-weight: 800; font-variant-numeric: tabular-nums; color: #111827; }
  .clock-date { font-size: clamp(13px, 1.4vw, 18px); color: #6b7280; margin-top: 2px; }

  #card-area { flex: 1; position: relative; min-height: 0; margin-top: clamp(12px, 2vh, 24px); }

  .empty-msg {
    height: 100%; display: flex; align-items: center; justify-content: center;
    font-size: clamp(20px, 2.6vw, 34px); color: #6b7280; font-weight: 700;
  }

  .card-view {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    gap: clamp(32px, 5.5vw, 72px);
    opacity: 0; transition: opacity .5s ease; pointer-events: none;
  }
  .card-view.show { opacity: 1; }

  .card-photo-wrap {
    flex: 0 0 auto; width: clamp(240px, 32vw, 480px); height: clamp(240px, 32vw, 480px); border-radius: 32px;
    overflow: hidden; background: linear-gradient(160deg, #dbeafe, #eff6ff); border: 8px solid #2563eb;
    box-shadow: 0 24px 56px rgba(37, 99, 235, .28), 0 0 0 6px rgba(37, 99, 235, .08);
  }
  .card-photo-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .card-photo-wrap.no-photo { display: flex; align-items: center; justify-content: center; }
  .card-photo-placeholder { width: clamp(64px, 8.5vw, 130px); height: clamp(64px, 8.5vw, 130px); color: #93c5fd; }

  .card-info { flex: 1 1 auto; min-width: 0; max-width: 660px; }
  .card-welcome { font-size: clamp(17px, 1.9vw, 25px); color: #2563eb; font-weight: 800; letter-spacing: .1em; margin-bottom: 10px; }
  .card-name { font-size: clamp(52px, 7.4vw, 118px); font-weight: 900; line-height: 1.1; color: #0f172a; word-break: break-word; }
  .card-division {
    display: inline-block; margin-top: clamp(12px, 1.8vh, 20px); font-size: clamp(17px, 1.9vw, 25px); font-weight: 800;
    color: #ffffff; background: linear-gradient(135deg, #3b82f6, #1d4ed8); border-radius: 999px; padding: 7px 24px;
    box-shadow: 0 10px 22px rgba(37, 99, 235, .3);
  }
  .card-comment {
    margin-top: clamp(20px, 3.2vh, 36px); font-size: clamp(19px, 2.3vw, 32px); font-weight: 700; color: #1e293b;
    line-height: 1.6; background: #eff6ff; border-left: 7px solid #2563eb; border-radius: 12px;
    padding: clamp(16px, 2.2vh, 24px) clamp(20px, 2.2vw, 28px);
    box-shadow: 0 6px 20px rgba(15, 23, 42, .06);
  }

  .foot { display: flex; justify-content: space-between; align-items: center; margin-top: clamp(10px, 1.6vh, 18px); font-size: clamp(13px, 1.2vw, 16px); color: #9ca3af; flex: none; }
  .dots { display: flex; gap: 8px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #dbeafe; }
  .dot.active { background: #2563eb; }

  #err-banner {
    display: none; position: fixed; top: 0; left: 0; right: 0; background: #dc2626; color: #fff;
    text-align: center; padding: 8px; font-size: 13px; font-weight: 700;
  }
</style>
</head>
<body>

<div id="err-banner"></div>

<div id="board">
  <div class="top-row">
    <div class="page-label">WELCOME NEW MEMBER</div>
    <div class="clock">
      <div class="clock-time" id="clock-time">--:--:--</div>
      <div class="clock-date" id="clock-date">&nbsp;</div>
    </div>
  </div>

  <div id="card-area"></div>

  <div class="foot">
    <div class="dots" id="dots"></div>
    <span>ホシコン 新人紹介</span>
  </div>
</div>

<script>
(function () {
  var REFRESH_MS = 3 * 60 * 60 * 1000;
  var CARD_INTERVAL_MS = 8000; // データ取得後、設定値（cardIntervalSeconds）に置き換わる

  function showError(msg) {
    var el = document.getElementById('err-banner');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 6000);
  }

  function fmt2(n) { return String(n).padStart(2, '0'); }

  function tickClock() {
    var now = new Date();
    document.getElementById('clock-time').textContent =
      fmt2(now.getHours()) + ':' + fmt2(now.getMinutes()) + ':' + fmt2(now.getSeconds());
    var days = ['日', '月', '火', '水', '木', '金', '土'];
    document.getElementById('clock-date').textContent =
      now.getFullYear() + '年' + (now.getMonth() + 1) + '月' + now.getDate() + '日（' + days[now.getDay()] + '）';
  }
  tickClock();
  setInterval(tickClock, 1000);

  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function cardHtml(intro) {
    var photo = intro.photoUrl
      ? '<div class="card-photo-wrap"><img src="' + intro.photoUrl + '" alt=""></div>'
      : '<div class="card-photo-wrap no-photo"><svg class="card-photo-placeholder" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.6"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></div>';
    var division = intro.division ? (intro.division + '課' + (intro.team ? '・' + intro.team + '班' : '')) : '所属未定';
    var comment = intro.comment
      ? '<div class="card-comment">' + escHtml(intro.comment) + '</div>'
      : '';
    return photo +
      '<div class="card-info">' +
        '<div class="card-welcome">新人紹介</div>' +
        '<div class="card-name">' + escHtml(intro.name) + '</div>' +
        '<div class="card-division">' + division + '</div>' +
        comment +
      '</div>';
  }

  var cycleTimer = null;
  var cycleIndex = 0;
  var intros = [];

  function renderDots() {
    var wrap = document.getElementById('dots');
    if (intros.length <= 1) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = intros.map(function (_, i) {
      return '<div class="dot' + (i === cycleIndex ? ' active' : '') + '"></div>';
    }).join('');
  }

  function showCard(index) {
    var area = document.getElementById('card-area');
    var view = document.createElement('div');
    view.className = 'card-view';
    view.innerHTML = cardHtml(intros[index]);
    area.appendChild(view);
    // 1フレーム後にopacityを上げてトランジションさせる
    requestAnimationFrame(function () { view.classList.add('show'); });

    var prevViews = Array.prototype.slice.call(area.querySelectorAll('.card-view')).filter(function (v) { return v !== view; });
    prevViews.forEach(function (v) {
      v.classList.remove('show');
      setTimeout(function () { if (v.parentNode) v.parentNode.removeChild(v); }, 600);
    });
    cycleIndex = index;
    renderDots();
  }

  function startCycle() {
    if (cycleTimer) { clearInterval(cycleTimer); cycleTimer = null; }
    var area = document.getElementById('card-area');
    area.innerHTML = '';

    if (intros.length === 0) {
      area.innerHTML = '<div class="empty-msg">新人紹介カードを準備中です</div>';
      document.getElementById('dots').innerHTML = '';
      return;
    }

    showCard(0);
    if (intros.length > 1) {
      cycleTimer = setInterval(function () {
        showCard((cycleIndex + 1) % intros.length);
      }, CARD_INTERVAL_MS);
    }
  }

  function renderData(data) {
    intros = data.intros || [];
    if (data.cardIntervalSeconds && data.cardIntervalSeconds >= 2) CARD_INTERVAL_MS = data.cardIntervalSeconds * 1000;
    startCycle();
    document.getElementById('board').classList.add('show');
  }

  async function loadData() {
    var res = await fetch('/api/public/newcomer-intros');
    if (!res.ok) throw new Error('http ' + res.status);
    return res.json();
  }

  function scheduleRefresh() {
    setTimeout(function () { location.reload(); }, REFRESH_MS);
  }

  var FORCE_REFRESH_POLL_MS = 30 * 1000;
  var forceRefreshBaseline = null;

  async function checkForceRefresh() {
    try {
      var res = await fetch('/api/public/newcomer-monitor-refresh-flag');
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
