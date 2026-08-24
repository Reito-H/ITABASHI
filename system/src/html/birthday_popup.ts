// ハッピーバースデーモード: 誕生日当日の設定時刻に全ページへ表示するお祝いポップアップ
// layout.ts の <body> 直後に birthdayPopupHtml() を1つ配置し、
// birthdayPopupScript() でポーリング・表示・自動クローズを行う。
// サーバー側に既読管理テーブルはなく、同一イベントを再表示しないための既読IDはブラウザのlocalStorageで管理する
// （announcement_bar.ts の dismiss はアカウント単位でサーバー保存するが、こちらはブラウザ単位で十分なため簡略化）
// 絵文字は使わず【】等の記号と紙吹雪風のCSSアニメーションで演出する
// 画面全体を使い切る演出（横長のPC画面でも文字・顔写真が大きく表示されるようmin(vw,vh)ベースでサイズ指定）。
// 対象者が複数いる場合は1人ずつ自動で画面が切り替わるスライドショー形式にする。

// 「HAPPY」「BIRTHDAY」を1文字ずつ<span>に分割し、文字ごとに異なるアニメ遅延をつけて波打つように動かす
function buildHugeWord(word: string, delayOffset: number): string {
  return word
    .split('')
    .map((ch, i) => `<span class="bday-letter" style="animation-delay:${(delayOffset + i * 0.07).toFixed(2)}s,${(i * 0.18).toFixed(2)}s;">${ch}</span>`)
    .join('');
}

export function birthdayPopupHtml(): string {
  const hugeHtml = `
    <div class="bday-huge-line">${buildHugeWord('HAPPY', 0)}</div>
    <div class="bday-huge-line">${buildHugeWord('BIRTHDAY', 0.35)}</div>`;

  return `
  <style>
    #bday-overlay {
      display: none; position: fixed; inset: 0; z-index: 2000;
      background: radial-gradient(circle at 50% 20%, rgba(30,58,95,0.55), rgba(15,23,42,0.85));
      align-items: center; justify-content: center; overflow: hidden;
    }
    #bday-confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
    .bday-confetti-piece {
      position: absolute; top: -20px; width: 10px; height: 16px; opacity: 0.9;
      animation: bdayFall linear infinite;
    }
    @keyframes bdayFall {
      0%   { transform: translateY(0) rotate(0deg); }
      100% { transform: translateY(110vh) rotate(360deg); }
    }
    #bday-close {
      position: fixed; top: 18px; right: 18px; width: 40px; height: 40px; border-radius: 50%;
      border: none; background: rgba(255,255,255,0.85); color: #374151; font-size: 20px; cursor: pointer;
      display: flex; align-items: center; justify-content: center; z-index: 2001; box-shadow: 0 2px 10px rgba(0,0,0,0.25);
    }
    #bday-close:hover { background: #fff; }
    #bday-content {
      position: relative; width: 100%; height: 100%; box-sizing: border-box;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: min(3vh, 22px); padding: 3vh 4vw; text-align: center;
      animation: bdayPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes bdayPop {
      0%   { transform: scale(0.85); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }
    #bday-huge { line-height: 1.02; flex-shrink: 0; }
    .bday-huge-line { white-space: nowrap; }
    .bday-letter {
      display: inline-block;
      font-size: clamp(30px, min(15vw, 15vh), 160px); font-weight: 900; letter-spacing: 0.01em;
      background: linear-gradient(90deg, #f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f472b6, #f87171);
      background-size: 400% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
      text-shadow: 0 2px 0 rgba(0,0,0,0.06);
      animation: bdayLetterBounce 1.15s ease-in-out infinite, bdayGradientShift 3.5s linear infinite;
    }
    @keyframes bdayLetterBounce {
      0%, 100% { transform: translateY(0) rotate(0deg) scale(1); }
      50%      { transform: translateY(-14px) rotate(-6deg) scale(1.08); }
    }
    @keyframes bdayGradientShift {
      0%   { background-position: 0% 50%; }
      100% { background-position: 400% 50%; }
    }
    #bday-slide {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: min(2vh, 16px); min-height: 0;
      animation: bdaySlideIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes bdaySlideIn {
      0%   { opacity: 0; transform: translateY(24px) scale(0.92); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    #bday-photo-wrap { flex-shrink: 0; }
    #bday-photo {
      display: flex; align-items: center; justify-content: center;
      width: min(34vw, 40vh); height: min(34vw, 40vh); max-width: 420px; max-height: 420px;
      border-radius: 50%; object-fit: cover; border: 7px solid #fbbf24;
      background: #fef3c7; color: #b45309; font-weight: 900; font-size: min(14vw, 16vh);
      box-shadow: 0 10px 40px rgba(0,0,0,0.35);
      animation: bdayPersonWiggle 1.3s ease-in-out infinite;
    }
    @keyframes bdayPersonWiggle {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      25%      { transform: translateY(-10px) rotate(-6deg); }
      75%      { transform: translateY(-3px) rotate(6deg); }
    }
    #bday-name-big {
      font-size: clamp(26px, min(9vw, 10vh), 110px); font-weight: 900; color: #fff;
      text-shadow: 0 3px 14px rgba(0,0,0,0.5); letter-spacing: 0.02em; flex-shrink: 0;
    }
    #bday-counter { font-size: 15px; font-weight: 700; color: #fef3c7; opacity: 0.85; letter-spacing: 0.08em; flex-shrink: 0; }
  </style>
  <div id="bday-overlay">
    <button type="button" id="bday-close" onclick="closeBirthdayPopup()" aria-label="閉じる" title="閉じる">×</button>
    <div id="bday-confetti"></div>
    <div id="bday-content">
      <div id="bday-huge">${hugeHtml}</div>
      <div id="bday-slide">
        <div id="bday-photo-wrap"></div>
        <div id="bday-name-big"></div>
      </div>
      <div id="bday-counter"></div>
    </div>
  </div>`;
}

export function birthdayPopupScript(): string {
  return `
    var BDAY_LAST_KEY = 'ho_birthday_last_event_id';
    var BDAY_COLORS = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6'];
    var BDAY_SLIDE_MS = 4500;
    var _bdayAutoCloseTimer = null;
    var _bdaySlideTimer = null;

    function escBdayText(s) {
      return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function spawnBdayConfetti() {
      var wrap = document.getElementById('bday-confetti');
      wrap.innerHTML = '';
      var count = 80;
      for (var i = 0; i < count; i++) {
        var piece = document.createElement('div');
        piece.className = 'bday-confetti-piece';
        piece.style.left = (Math.random() * 100) + '%';
        piece.style.background = BDAY_COLORS[i % BDAY_COLORS.length];
        piece.style.animationDuration = (2.4 + Math.random() * 2.2) + 's';
        piece.style.animationDelay = (Math.random() * 1.5) + 's';
        wrap.appendChild(piece);
      }
    }
    function renderBdaySlide(person, num, total) {
      var photoWrap = document.getElementById('bday-photo-wrap');
      photoWrap.innerHTML = person.hasPhoto
        ? '<img id="bday-photo" src="/api/birthday/photo/' + person.id + '">'
        : '<div id="bday-photo">' + escBdayText((person.name || '?').slice(0, 1)) + '</div>';
      document.getElementById('bday-name-big').textContent = person.name || '';
      document.getElementById('bday-counter').textContent = total > 1 ? (num + ' / ' + total) : '';
      var slide = document.getElementById('bday-slide');
      slide.style.animation = 'none';
      void slide.offsetWidth;
      slide.style.animation = '';
    }
    function showBirthdayPopup(evt) {
      var people = (evt.celebrants || []).filter(function (p) { return p; });
      if (!people.length) return;
      spawnBdayConfetti();
      document.getElementById('bday-overlay').style.display = 'flex';

      var idx = 0;
      renderBdaySlide(people[0], 1, people.length);
      clearInterval(_bdaySlideTimer);
      if (people.length > 1) {
        _bdaySlideTimer = setInterval(function () {
          idx++;
          if (idx >= people.length) { clearInterval(_bdaySlideTimer); return; }
          renderBdaySlide(people[idx], idx + 1, people.length);
        }, BDAY_SLIDE_MS);
      }

      clearTimeout(_bdayAutoCloseTimer);
      var totalMs = Math.max(12000, people.length * BDAY_SLIDE_MS + 4000);
      _bdayAutoCloseTimer = setTimeout(closeBirthdayPopup, totalMs);
      try { localStorage.setItem(BDAY_LAST_KEY, String(evt.id)); } catch (e) {}
    }
    function closeBirthdayPopup() {
      clearTimeout(_bdayAutoCloseTimer);
      clearInterval(_bdaySlideTimer);
      document.getElementById('bday-overlay').style.display = 'none';
    }
    async function loadBirthdayPopup() {
      try {
        var res = await fetch('/api/birthday/active');
        if (!res.ok) return;
        var data = await res.json();
        var evt = data.event;
        if (!evt || !evt.celebrants || !evt.celebrants.length) return;
        var lastId = null;
        try { lastId = localStorage.getItem(BDAY_LAST_KEY); } catch (e) {}
        if (lastId !== null && Number(lastId) === Number(evt.id)) return;
        showBirthdayPopup(evt);
      } catch (e) { /* 通信エラー時は次回ポーリングに委ねる */ }
    }
    loadBirthdayPopup();
    var _bdayInterval = setInterval(loadBirthdayPopup, 45000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearInterval(_bdayInterval);
      } else {
        loadBirthdayPopup();
        _bdayInterval = setInterval(loadBirthdayPopup, 45000);
      }
    });`;
}
