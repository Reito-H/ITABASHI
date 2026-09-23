// シーズナル演出: ハロウィン/クリスマス/イースター/年末年始カウントダウン/謹賀新年の期間中、
// 管理画面の全ページ（デジタルサイネージの一覧/編集/投影/印刷ページを除く）に控えめな演出を出す。
// layout.ts の <body> 直後に seasonalFxHtml() を1つ配置し、seasonalFxScript() でポーリング・描画を行う。
// 誕生日ポップアップと違い全アカウント共通表示（対象者ホワイトリストなし）で、業務操作を一切邪魔しない
// 「隅の小さいアイコン」＋「数秒〜十数秒に1回、画面端を流れる落ち葉/雪」程度に留める。
// 絵文字は使わずSVGアイコンのみで演出する。

// 他ページのボタン等に季節アイコンを差し込みたい場合、この属性を付けるだけでよい
// 例: `<button${seasonalIconSlot()} onclick="save()">保存</button>`
export function seasonalIconSlot(): string {
  return ' data-seasonal-icon';
}

export function seasonalFxHtml(): string {
  return `
  <style>
    #seasonal-fx-layer, #seasonal-fx-corner { position: fixed; pointer-events: none; z-index: 55; }
    #seasonal-fx-layer { inset: 0; overflow: hidden; display: none; }
    #seasonal-fx-corner {
      right: 18px; bottom: 88px; width: 40px; height: 40px; opacity: 0.65; display: none;
      animation: seasonalFxCornerFloat 3.5s ease-in-out infinite;
    }
    @keyframes seasonalFxCornerFloat {
      0%, 100% { transform: translateY(0); }
      50%      { transform: translateY(-4px); }
    }
    .seasonal-fx-particle {
      position: absolute; top: 0; width: 18px; height: 18px; pointer-events: none;
      animation-name: seasonalFxDrift; animation-timing-function: linear; animation-fill-mode: forwards;
    }
    @keyframes seasonalFxDrift {
      0%   { transform: translate(0, -10vh) rotate(0deg); opacity: 0; }
      10%  { opacity: 0.55; }
      85%  { opacity: 0.5; }
      100% { transform: translate(var(--fx-dx, 0), 100vh) rotate(var(--fx-rot, 180deg)); opacity: 0; }
    }
    .seasonal-fx-inline-icon { display: inline-block; width: 14px; height: 14px; vertical-align: -2px; margin-right: 4px; }
    @media (prefers-reduced-motion: reduce) {
      #seasonal-fx-layer { display: none !important; }
    }
  </style>
  <div id="seasonal-fx-layer"></div>
  <div id="seasonal-fx-corner"></div>`;
}

export function seasonalFxScript(): string {
  return `
    var FX_ICONS = {
      halloween: '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 3c.8 0 1.4.9 1.4 2.1 2.9.4 5.1 2.9 5.1 6.4 0 4.1-2.9 7-6.5 7s-6.5-2.9-6.5-7c0-3.5 2.2-6 5.1-6.4C10.6 3.9 11.2 3 12 3z" fill="#f97316"/><path d="M12 3v3.4" stroke="#7c3f13" stroke-width="1.2" stroke-linecap="round" fill="none"/><path d="M9 12c.6-.8 1.3-1.2 2-1.2M15 12c-.6-.8-1.3-1.2-2-1.2" stroke="#7c3f13" stroke-width="1" fill="none" stroke-linecap="round"/></svg>',
      christmas: '<svg viewBox="0 0 24 24" width="100%" height="100%"><g stroke="#7dd3fc" stroke-width="1.6" stroke-linecap="round"><path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19"/></g></svg>',
      easter: '<svg viewBox="0 0 24 24" width="100%" height="100%"><ellipse cx="12" cy="13" rx="7" ry="9" fill="#fbcfe8"/><circle cx="9" cy="10" r="1" fill="#f472b6"/><circle cx="14" cy="8" r="1" fill="#a78bfa"/><circle cx="15" cy="14" r="1" fill="#93c5fd"/></svg>',
      year_end_countdown: '<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z" fill="#fbbf24"/></svg>',
      new_year: '<svg viewBox="0 0 24 24" width="100%" height="100%"><circle cx="12" cy="14" r="5" fill="#fca5a5"/><path d="M2 19h20M12 4v3M5 8l2 2M19 8l-2 2" stroke="#f87171" stroke-width="1.4" stroke-linecap="round" fill="none"/></svg>'
    };
    var FX_THEMES = {
      halloween:           { icon: FX_ICONS.halloween,           particle: FX_ICONS.halloween },
      christmas:            { icon: FX_ICONS.christmas,            particle: FX_ICONS.christmas },
      easter:               { icon: FX_ICONS.easter,               particle: FX_ICONS.easter },
      year_end_countdown:   { icon: FX_ICONS.year_end_countdown,   particle: FX_ICONS.year_end_countdown },
      new_year:              { icon: FX_ICONS.new_year,              particle: FX_ICONS.new_year }
    };
    var FX_CACHE_KEY = 'ho_seasonal_fx_cache_v1';
    var FX_CACHE_MS = 5 * 60 * 1000;
    var FX_MAX_PARTICLES = 3;

    var _fxCurrentTheme = null;
    var _fxParticleTimer = null;
    var _fxParticleCount = 0;
    var _fxPollTimer = null;
    var _fxPreviewKey = null; // null = 通常表示。値があればそのイベントを強制的に表示し続ける（管理画面のプレビューON/OFF用）

    // サイドバーは幅200pxで左側を占有し重なると隠れてしまうため、実際のサイドバー右端より右側にだけ出す
    function fxSidebarRightEdge() {
      try {
        var sb = document.getElementById('sidebar');
        if (!sb) return 0;
        var rect = sb.getBoundingClientRect();
        return rect.width > 0 ? Math.max(0, rect.right) : 0;
      } catch (e) { return 0; }
    }

    function fxReadCache() {
      try {
        var raw = sessionStorage.getItem(FX_CACHE_KEY);
        if (!raw) return undefined;
        var obj = JSON.parse(raw);
        if (!obj || (Date.now() - obj.t) > FX_CACHE_MS) return undefined;
        return obj.key;
      } catch (e) { return undefined; }
    }
    function fxWriteCache(key) {
      try { sessionStorage.setItem(FX_CACHE_KEY, JSON.stringify({ key: key, t: Date.now() })); } catch (e) {}
    }
    async function fxFetchActiveKey() {
      try {
        var res = await fetch('/api/seasonal/active');
        if (!res.ok) return null;
        var data = await res.json();
        return (data.event && data.event.key) ? data.event.key : null;
      } catch (e) { return null; }
    }

    function fxEnhanceIconSlots(key) {
      var theme = key ? FX_THEMES[key] : null;
      var els = document.querySelectorAll('[data-seasonal-icon]');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        var mark = el.querySelector('.seasonal-fx-inline-icon');
        if (!theme) { if (mark) mark.remove(); continue; }
        if (mark) { mark.innerHTML = theme.icon; continue; }
        var span = document.createElement('span');
        span.className = 'seasonal-fx-inline-icon';
        span.innerHTML = theme.icon;
        el.insertBefore(span, el.firstChild);
      }
    }

    function fxSpawnParticle() {
      if (!_fxCurrentTheme || _fxParticleCount >= FX_MAX_PARTICLES) return;
      var layer = document.getElementById('seasonal-fx-layer');
      if (!layer) return;
      var el = document.createElement('div');
      el.className = 'seasonal-fx-particle';
      el.innerHTML = _fxCurrentTheme.particle;
      var minVw = Math.min(70, (fxSidebarRightEdge() + 24) / Math.max(window.innerWidth, 1) * 100);
      var startX = minVw + Math.random() * (94 - minVw);
      var dx = (Math.random() * 10 - 5);
      var duration = 6 + Math.random() * 4;
      el.style.left = startX + 'vw';
      el.style.setProperty('--fx-dx', dx + 'vw');
      el.style.setProperty('--fx-rot', (Math.random() < 0.5 ? '' : '-') + '180deg');
      el.style.animationDuration = duration + 's';
      _fxParticleCount++;
      el.addEventListener('animationend', function () {
        el.remove();
        _fxParticleCount--;
      });
      layer.appendChild(el);
    }
    function fxScheduleNextParticle() {
      clearTimeout(_fxParticleTimer);
      if (!_fxCurrentTheme) return;
      var delay = 8000 + Math.random() * 7000;
      _fxParticleTimer = setTimeout(function () {
        fxSpawnParticle();
        fxScheduleNextParticle();
      }, delay);
    }

    function fxApplyTheme(key) {
      _fxCurrentTheme = key ? FX_THEMES[key] : null;
      var layer = document.getElementById('seasonal-fx-layer');
      var corner = document.getElementById('seasonal-fx-corner');
      clearTimeout(_fxParticleTimer);
      if (!_fxCurrentTheme) {
        if (layer) layer.style.display = 'none';
        if (corner) corner.style.display = 'none';
        fxEnhanceIconSlots(null);
        return;
      }
      if (layer) layer.style.display = 'block';
      if (corner) { corner.style.display = 'block'; corner.innerHTML = _fxCurrentTheme.icon; }
      if (!document.hidden) { fxSpawnParticle(); fxScheduleNextParticle(); }
      fxEnhanceIconSlots(key);
    }

    async function fxLoad(force) {
      if (!force && _fxPreviewKey !== null) return; // プレビュー中は実際の表示状態で上書きしない
      var key;
      var cached = force ? undefined : fxReadCache();
      if (cached !== undefined) {
        key = cached;
      } else {
        key = await fxFetchActiveKey();
        fxWriteCache(key);
      }
      fxApplyTheme(key);
    }

    // 管理画面の「プレビュー表示」ボタンから呼ばれる。もう一度同じキーで呼ぶとOFFに戻る（自動では消えない）
    window.seasonalFxPreviewToggle = function (key) {
      if (_fxPreviewKey === key) {
        _fxPreviewKey = null;
        fxLoad(true);
        return false;
      }
      _fxPreviewKey = key;
      fxApplyTheme(key);
      return true;
    };
    window.seasonalFxIsPreviewing = function (key) { return _fxPreviewKey === key; };

    fxLoad(false);
    _fxPollTimer = setInterval(function () { fxLoad(false); }, FX_CACHE_MS);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearTimeout(_fxParticleTimer);
      } else if (_fxCurrentTheme) {
        fxScheduleNextParticle();
      }
    });`;
}
