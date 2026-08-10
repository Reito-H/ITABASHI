// 事故モニター表示（ログイン不要・常時表示用）
// かつて「無事故キロ数計算」を印刷して時計下に掲示していた運用の置き換え。
// 事故の総数・課別件数（0件の課も含め1〜4課すべて）・時間帯を表示し、モニターに映しっぱなしにする想定。
// 文字は原則黒。強調したい数字（総数・実績のある課・時間帯のピーク）だけ赤／黄色を使う。
// レイアウト(layout.ts)は使わず、完全に独立したスタンドアロンページとして描画する。
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
    background: #f4f6f8;
    color: #111827;
    font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', Meiryo, sans-serif;
    overflow: hidden;
  }

  /* ===== パスワードゲート ===== */
  #gate {
    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    background: #f4f6f8;
  }
  #gate-box {
    background: #ffffff; border: 1px solid #dde3ea; border-radius: 16px;
    box-shadow: 0 2px 16px rgba(20,30,45,.06);
    padding: 40px 36px; width: 100%; max-width: 340px; text-align: center;
  }
  #gate-box .icon { font-size: 30px; margin-bottom: 10px; }
  #gate-box h1 { font-size: 16px; font-weight: 700; margin: 0 0 18px; color: #111827; }
  #gate-box input {
    width: 100%; background: #f7f8fa; border: 1px solid #ccd4dd; border-radius: 8px;
    color: #111827; font-size: 20px; text-align: center; letter-spacing: .3em;
    padding: 12px; margin-bottom: 12px; outline: none;
  }
  #gate-box input:focus { border-color: #dc2626; }
  #gate-error { display: none; color: #dc2626; font-weight: 700; font-size: 12.5px; margin-bottom: 10px; }
  #gate-box button {
    width: 100%; padding: 12px; background: #111827; color: #fff; border: none;
    border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer;
  }

  /* ===== 表示本体 ===== */
  #board { display: none; height: 100vh; padding: clamp(16px, 2.6vw, 36px); flex-direction: column; }
  #board.show { display: flex; }

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
    background: #ffffff; border: 2px solid #f1c3c3; border-radius: 18px;
    padding: clamp(14px, 2vh, 26px) clamp(20px, 2.4vw, 40px);
    display: flex; flex-direction: column; align-items: flex-start; justify-content: center;
    flex: 0 0 auto;
  }
  .total-label { font-size: clamp(18px, 2vw, 26px); color: #111827; font-weight: 700; letter-spacing: .04em; margin-bottom: 4px; }
  .total-count-row { display: flex; align-items: baseline; }
  .total-count { font-size: clamp(110px, 20vw, 260px); font-weight: 800; line-height: .85; color: #dc2626; font-variant-numeric: tabular-nums; }
  .total-unit { font-size: clamp(28px, 3.4vw, 48px); font-weight: 700; color: #dc2626; margin-left: 8px; }
  .hero-diff { margin-top: 12px; font-size: clamp(17px, 1.9vw, 26px); font-weight: 700; padding: 6px 16px; border-radius: 999px; white-space: nowrap; }
  .hero-diff.up { background: #fee2e2; color: #dc2626; }
  .hero-diff.flat { background: #eef1f4; color: #111827; }

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
    flex: 1; display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); grid-auto-rows: 1fr;
    gap: clamp(6px, 1vw, 12px); min-height: 0;
    background: #ffffff; border: 1px solid #e2e7ee; border-radius: 16px;
    padding: clamp(10px, 1.6vh, 18px);
  }
  .bands.empty { display: flex; align-items: center; justify-content: center; }
  .bands-empty-msg { font-size: clamp(20px, 2.6vw, 32px); color: #4b5563; font-weight: 700; }
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

  .foot { display: flex; justify-content: space-between; align-items: center; margin-top: clamp(8px, 1.4vh, 16px); font-size: clamp(13px, 1.2vw, 16px); color: #6b7280; flex: none; }

  #err-banner {
    display: none; position: fixed; top: 0; left: 0; right: 0; background: #dc2626; color: #fff;
    text-align: center; padding: 8px; font-size: 13px; font-weight: 700;
  }
</style>
</head>
<body>

<div id="err-banner"></div>

<div id="gate">
  <div id="gate-box">
    <div class="icon">&#128274;</div>
    <h1>事故モニター表示にはパスワードが必要です</h1>
    <input type="password" id="gate-input" inputmode="numeric" placeholder="表示用パスワード" autofocus>
    <div id="gate-error">パスワードが違います</div>
    <button type="button" id="gate-submit">表示する</button>
  </div>
</div>

<div id="board">
  <div class="top-row">
    <div class="month-label" id="month-label">&nbsp;</div>
    <div class="clock">
      <div class="clock-time" id="clock-time">--:--:--</div>
      <div class="clock-date" id="clock-date">&nbsp;</div>
    </div>
  </div>

  <div class="main-row">
    <div class="total-panel">
      <div class="total-label">今月の事故 総数</div>
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

  <div class="band-title">発生時間帯（2時間刻み）</div>
  <div class="bands" id="bands"></div>

  <div class="foot">
    <span id="foot-updated">&nbsp;</span>
    <span>ホシコン 事故モニター</span>
  </div>
</div>

<script>
(function () {
  var STORAGE_KEY = 'accidents_monitor_pw';
  var REFRESH_MS = 5 * 60 * 1000;
  var BAND_HOURS = 2;
  var BAND_COUNT = 12;

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

  // 棒グラフではなく文字（件数）で読み取れるよう、時間帯ごとのマス目で表示する。
  // 0件の時間帯は表示せず、事故が発生した時間帯だけを並べる。最多の時間帯だけ赤で目立たせる。
  function renderBands(bands) {
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

    for (var j = 0; j < BAND_COUNT; j++) {
      var cnt = bands[j] || 0;
      if (cnt === 0) continue;
      var from = j * BAND_HOURS;
      var to = from + BAND_HOURS;
      var isPeak = cnt === max;
      var cell = document.createElement('div');
      cell.className = 'band-cell' + (isPeak ? ' peak' : '');
      cell.innerHTML =
        '<div class="band-range">' + from + '-' + to + '時</div>' +
        '<div><span class="band-count">' + cnt + '</span><span class="band-unit">件</span></div>';
      wrap.appendChild(cell);
    }
  }

  function renderData(data) {
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

    document.getElementById('gate').style.display = 'none';
    document.getElementById('board').classList.add('show');
  }

  async function loadData(password) {
    var res = await fetch('/api/public/accidents-monitor', {
      headers: { 'X-Monitor-Password': password }
    });
    if (res.status === 401) {
      localStorage.removeItem(STORAGE_KEY);
      throw new Error('unauthorized');
    }
    if (!res.ok) throw new Error('http ' + res.status);
    return res.json();
  }

  function scheduleRefresh() {
    // 長時間映しっぱなしにする前提のため、フル再読み込みでメモリ肥大・状態のズレを防ぐ
    setTimeout(function () { location.reload(); }, REFRESH_MS);
  }

  async function boot(password) {
    try {
      var data = await loadData(password);
      localStorage.setItem(STORAGE_KEY, password);
      renderData(data);
      scheduleRefresh();
    } catch (e) {
      if (e.message === 'unauthorized') {
        document.getElementById('gate-error').style.display = 'block';
        document.getElementById('board').classList.remove('show');
        document.getElementById('gate').style.display = 'flex';
      } else {
        showError('データの取得に失敗しました。しばらくして自動で再試行します。');
        setTimeout(function () { location.reload(); }, 30000);
      }
    }
  }

  document.getElementById('gate-submit').addEventListener('click', function () {
    var pw = document.getElementById('gate-input').value.trim();
    if (!pw) return;
    boot(pw);
  });
  document.getElementById('gate-input').addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') document.getElementById('gate-submit').click();
  });

  var saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    boot(saved);
  }
})();
</script>
</body>
</html>`;
}
