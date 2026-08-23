// アナウンスバー（管理画面全ページの最上部に表示する常時テロップ）
// layout.ts の <body> 直後に announcementBarHtml() を1つ配置し、
// announcementBarScript() で表示中のバー取得・スクロール制御・一時非表示を行う。
// 「お知らせ」ベルマーク(bell-dropdown、announcements テーブル)とは別物 —
// あちらは都度開いて確認する通知一覧、こちらは見なくても常に視界に入る帯。

export function announcementBarHtml(): string {
  return `
  <style>
    .ann-bar-wrap { position: sticky; top: 0; left: 0; width: 100%; z-index: 1000; display: none; }
    .ann-bar {
      display: flex; align-items: center; gap: 12px; padding: 10px 14px; overflow: hidden;
      background: #fff; color: #1f2937; box-shadow: 0 2px 10px rgba(0,0,0,0.12);
      border-bottom: 3px solid transparent;
    }
    .ann-bar-normal   { border-bottom-color: var(--color-primary); }
    .ann-bar-warning  { border-bottom-color: var(--color-warning); }
    .ann-bar-critical { border-bottom-color: var(--color-danger); animation: annBarPulse 1.1s ease-in-out infinite; }
    @keyframes annBarPulse {
      0%, 100% { box-shadow: 0 2px 10px rgba(0,0,0,0.12); }
      50%      { box-shadow: 0 2px 16px rgba(220,38,38,0.55); }
    }
    .ann-bar-tag {
      flex-shrink: 0; font-size: 12px; font-weight: 800; letter-spacing: 0.02em; white-space: nowrap;
      color: #fff; padding: 4px 12px; border-radius: 999px;
    }
    .ann-bar-normal   .ann-bar-tag { background: var(--color-primary); }
    .ann-bar-warning  .ann-bar-tag { background: var(--color-warning); }
    .ann-bar-critical .ann-bar-tag { background: var(--color-danger); }
    .ann-bar-viewport { flex: 1; min-width: 0; overflow: hidden; }
    .ann-bar-track { display: flex; white-space: nowrap; width: max-content; }
    .ann-bar-track.ann-bar-scrolling { animation-name: annBarScroll; animation-timing-function: linear; animation-iteration-count: infinite; }
    .ann-bar-track.ann-bar-scrolling:hover { animation-play-state: paused; }
    @keyframes annBarScroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
    .ann-bar-msg { font-size: 13.5px; font-weight: 700; color: #1f2937; padding-right: 64px; }
    .ann-bar-close {
      flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; border: none;
      background: #f3f4f6; color: #6b7280; font-size: 14px; line-height: 1;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
    }
    .ann-bar-close:hover { background: #e5e7eb; color: #1f2937; }
    @media (max-width: 768px) {
      .ann-bar { padding: 8px 10px; }
      .ann-bar-tag { font-size: 11px; }
      .ann-bar-msg { font-size: 12px; }
    }
  </style>
  <div id="ann-bar-wrap" class="ann-bar-wrap">
    <div id="ann-bar" class="ann-bar ann-bar-normal">
      <span id="ann-bar-tag" class="ann-bar-tag"></span>
      <div class="ann-bar-viewport">
        <div id="ann-bar-track" class="ann-bar-track">
          <span id="ann-bar-msg-a" class="ann-bar-msg"></span>
          <span id="ann-bar-msg-b" class="ann-bar-msg" style="display:none;" aria-hidden="true"></span>
        </div>
      </div>
      <button type="button" class="ann-bar-close" onclick="dismissAnnouncementBar()" aria-label="このお知らせを閉じる" title="このお知らせを閉じる">×</button>
    </div>
  </div>`;
}

export function announcementBarScript(): string {
  return `
    var ANN_BAR_PRIORITY = {
      normal:   { cls: 'ann-bar-normal',   tag: '【お知らせ】', speed: 40 },
      warning:  { cls: 'ann-bar-warning',  tag: '【注意】',     speed: 55 },
      critical: { cls: 'ann-bar-critical', tag: '【緊急】',     speed: 75 },
    };
    var _annBarIds = [];
    function escAnnBarText(s) {
      return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function setAnnBarHeightVar(show) {
      var bar = document.getElementById('ann-bar');
      document.documentElement.style.setProperty('--ann-bar-h', show ? (bar.offsetHeight + 'px') : '0px');
    }
    function renderAnnouncementBar(items) {
      var wrap = document.getElementById('ann-bar-wrap');
      if (!items || !items.length) {
        wrap.style.display = 'none';
        setAnnBarHeightVar(false);
        return;
      }
      var order = { critical: 3, warning: 2, normal: 1 };
      var top = items[0];
      items.forEach(function (i) { if ((order[i.priority] || 1) > (order[top.priority] || 1)) top = i; });
      var conf = ANN_BAR_PRIORITY[top.priority] || ANN_BAR_PRIORITY.normal;
      var bar = document.getElementById('ann-bar');
      bar.className = 'ann-bar ' + conf.cls;
      document.getElementById('ann-bar-tag').textContent = conf.tag;

      var text = items.map(function (i) { return escAnnBarText(i.message); }).join('　◆　');
      var msgA = document.getElementById('ann-bar-msg-a');
      var msgB = document.getElementById('ann-bar-msg-b');
      msgA.innerHTML = text;
      msgB.innerHTML = text;
      _annBarIds = items.map(function (i) { return i.id; });
      wrap.style.display = 'block';

      requestAnimationFrame(function () {
        setAnnBarHeightVar(true);
        var viewport = bar.querySelector('.ann-bar-viewport');
        var track = document.getElementById('ann-bar-track');
        var fits = msgA.offsetWidth <= viewport.offsetWidth;
        if (fits) {
          track.classList.remove('ann-bar-scrolling');
          track.style.animationDuration = '';
          msgB.style.display = 'none';
        } else {
          msgB.style.display = 'inline';
          var duration = (msgA.offsetWidth * 2) / conf.speed;
          track.style.animationDuration = duration + 's';
          track.classList.add('ann-bar-scrolling');
        }
      });
    }
    async function loadAnnouncementBar() {
      try {
        var res = await fetch('/api/announcement-bar/active');
        if (!res.ok) return;
        var data = await res.json();
        renderAnnouncementBar(data.banners || []);
      } catch (e) { /* 通信エラー時は次回ポーリングに委ねる */ }
    }
    async function dismissAnnouncementBar() {
      var ids = _annBarIds.slice();
      document.getElementById('ann-bar-wrap').style.display = 'none';
      setAnnBarHeightVar(false);
      try {
        await fetch('/api/announcement-bar/dismiss', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: ids }),
        });
      } catch (e) { /* 通信エラー時は次回読み込み時に再表示される */ }
    }
    loadAnnouncementBar();
    var _annBarInterval = setInterval(loadAnnouncementBar, 60000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearInterval(_annBarInterval);
      } else {
        loadAnnouncementBar();
        _annBarInterval = setInterval(loadAnnouncementBar, 60000);
      }
    });`;
}
