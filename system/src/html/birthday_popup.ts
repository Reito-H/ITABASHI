// ハッピーバースデーモード: 誕生日当日の設定時刻に全ページへ表示するお祝いポップアップ
// layout.ts の <body> 直後に birthdayPopupHtml() を1つ配置し、
// birthdayPopupScript() でポーリング・表示・自動クローズを行う。
// サーバー側に既読管理テーブルはなく、同一イベントを再表示しないための既読IDはブラウザのlocalStorageで管理する
// （announcement_bar.ts の dismiss はアカウント単位でサーバー保存するが、こちらはブラウザ単位で十分なため簡略化）
// 絵文字は使わず【】等の記号と紙吹雪風のCSSアニメーションで演出する

export function birthdayPopupHtml(): string {
  return `
  <style>
    #bday-overlay {
      display: none; position: fixed; inset: 0; z-index: 2000;
      background: rgba(15, 23, 42, 0.55);
      align-items: center; justify-content: center;
    }
    #bday-confetti { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
    .bday-confetti-piece {
      position: absolute; top: -20px; width: 8px; height: 14px; opacity: 0.9;
      animation: bdayFall linear infinite;
    }
    @keyframes bdayFall {
      0%   { transform: translateY(0) rotate(0deg); }
      100% { transform: translateY(110vh) rotate(360deg); }
    }
    #bday-card {
      position: relative; background: linear-gradient(160deg, #fff 0%, #fff7ed 100%);
      border-radius: 20px; padding: 32px 28px 28px; max-width: 380px; width: 92vw;
      text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.35);
      animation: bdayPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes bdayPop {
      0%   { transform: scale(0.7); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }
    #bday-close {
      position: absolute; top: 10px; right: 12px; width: 26px; height: 26px; border-radius: 50%;
      border: none; background: #f3f4f6; color: #6b7280; font-size: 14px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    #bday-close:hover { background: #e5e7eb; }
    .bday-tag {
      display: inline-block; font-size: 11px; font-weight: 800; letter-spacing: 0.08em;
      color: #b45309; background: #fef3c7; border-radius: 999px; padding: 4px 14px; margin-bottom: 14px;
    }
    #bday-title { font-size: 20px; font-weight: 800; color: #1e3a5f; margin: 0 0 18px; letter-spacing: 0.02em; }
    #bday-people { display: flex; flex-direction: column; gap: 12px; margin-bottom: 6px; }
    .bday-person { display: flex; align-items: center; gap: 12px; justify-content: center; }
    .bday-person-photo { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; border: 3px solid #fbbf24; flex-shrink: 0; }
    .bday-person-photo-fallback {
      width: 56px; height: 56px; border-radius: 50%; border: 3px solid #fbbf24; flex-shrink: 0;
      background: #fef3c7; color: #b45309; font-size: 20px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
    }
    .bday-person-name { font-size: 15px; font-weight: 700; color: #1f2937; }
  </style>
  <div id="bday-overlay">
    <div id="bday-confetti"></div>
    <div id="bday-card">
      <button type="button" id="bday-close" onclick="closeBirthdayPopup()" aria-label="閉じる" title="閉じる">×</button>
      <div class="bday-tag">HAPPY BIRTHDAY</div>
      <div id="bday-title">本日お誕生日です</div>
      <div id="bday-people"></div>
    </div>
  </div>`;
}

export function birthdayPopupScript(): string {
  return `
    var BDAY_LAST_KEY = 'ho_birthday_last_event_id';
    var BDAY_COLORS = ['#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa', '#f472b6'];
    var _bdayAutoCloseTimer = null;

    function escBdayText(s) {
      return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function spawnBdayConfetti() {
      var wrap = document.getElementById('bday-confetti');
      wrap.innerHTML = '';
      var count = 60;
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
    function showBirthdayPopup(evt) {
      var peopleWrap = document.getElementById('bday-people');
      peopleWrap.innerHTML = (evt.celebrants || []).map(function (p) {
        var photo = p.hasPhoto
          ? '<img class="bday-person-photo" src="/api/birthday/photo/' + p.id + '">'
          : '<div class="bday-person-photo-fallback">' + escBdayText((p.name || '?').slice(0, 1)) + '</div>';
        return '<div class="bday-person">' + photo + '<div class="bday-person-name">' + escBdayText(p.name) + '</div></div>';
      }).join('');
      document.getElementById('bday-title').textContent =
        (evt.celebrants || []).length > 1 ? '本日お誕生日です' : ((evt.celebrants[0] && evt.celebrants[0].name) + '　本日お誕生日です');
      spawnBdayConfetti();
      document.getElementById('bday-overlay').style.display = 'flex';
      clearTimeout(_bdayAutoCloseTimer);
      _bdayAutoCloseTimer = setTimeout(closeBirthdayPopup, 12000);
      try { localStorage.setItem(BDAY_LAST_KEY, String(evt.id)); } catch (e) {}
    }
    function closeBirthdayPopup() {
      clearTimeout(_bdayAutoCloseTimer);
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
