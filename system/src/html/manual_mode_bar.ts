// マニュアルモード（ブラウザごとのフローティング・クイックリンクバー）
//
// layout.ts の <body> 内に manualModeBarHtml() を1つ置き、manualModeBarScript() で
// localStorage(mm_active_profile_id) が指す登録者のマスを取得して画面下・中央に表示する。
// マスは最大 2段×10。登録されたマスだけを詰めて表示し、クリックで同じタブ遷移する。
// 選択が無い / マス0件 / 該当登録者が消えている 場合はバー自体を表示しない。
// 設定は /{SECRET}/admin/settings/manual-mode（routes/admin_manual_mode.ts）。

export function manualModeBarHtml(): string {
  return `
  <style>
    #mm-bar-wrap {
      position: fixed; left: 50%; bottom: 10px; transform: translateX(-50%);
      z-index: 850; display: none;
    }
    #mm-bar {
      display: flex; flex-wrap: wrap; gap: 5px;
      max-width: 396px; padding: 7px 8px;
      background: rgba(15, 39, 64, 0.96); border-radius: 12px;
      box-shadow: 0 6px 24px rgba(0,0,0,0.32); backdrop-filter: blur(2px);
    }
    .mm-cell {
      width: 32px; height: 32px; flex: 0 0 32px;
      display: flex; align-items: center; justify-content: center;
      background: #1a3a5c; color: #fff; border-radius: 7px;
      font-size: 15px; font-weight: 700; text-decoration: none;
      transition: background 0.12s, transform 0.12s;
      font-family: 'Hiragino Sans', 'Meiryo', sans-serif;
    }
    .mm-cell:hover { background: var(--color-accent, #f2c14e); color: #1f2937; transform: translateY(-2px); }
    .mm-cell.mm-cell-active { background: var(--color-accent, #f2c14e); color: #1f2937; }
    @media (max-width: 768px) {
      #mm-bar-wrap { bottom: 8px; }
      #mm-bar { max-width: 330px; }
      .mm-cell { width: 28px; height: 28px; flex-basis: 28px; font-size: 13px; }
    }
    @media print { #mm-bar-wrap { display: none !important; } }
  </style>
  <div id="mm-bar-wrap"><div id="mm-bar"></div></div>`;
}

export function manualModeBarScript(): string {
  return `
    (function () {
      var LS_KEY = 'mm_active_profile_id';
      function escMm(s) {
        return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }
      function hrefOk(h) {
        return typeof h === 'string' && h.charAt(0) === '/' && h.charAt(1) !== '/' && h.indexOf('..') === -1;
      }
      function renderMmBar(slots) {
        var wrap = document.getElementById('mm-bar-wrap');
        var bar = document.getElementById('mm-bar');
        if (!wrap || !bar) return;
        var here = location.pathname;
        var cells = (slots || []).filter(function (s) { return s && s.label && hrefOk(s.href); }).slice(0, 20);
        if (!cells.length) { wrap.style.display = 'none'; bar.innerHTML = ''; return; }
        bar.innerHTML = cells.map(function (s) {
          var active = (s.href === here) ? ' mm-cell-active' : '';
          var t = s.title ? s.title : s.label;
          return '<a class="mm-cell' + active + '" href="' + escMm(s.href) + '" title="' + escMm(t) + '">' + escMm(String(s.label).slice(0, 2)) + '</a>';
        }).join('');
        wrap.style.display = 'block';
      }
      function loadMmBar() {
        var id = null;
        try { id = localStorage.getItem(LS_KEY); } catch (e) {}
        if (!id) { renderMmBar([]); return; }
        fetch('/api/manual-mode/bar/profiles/' + encodeURIComponent(id) + '/slots')
          .then(function (r) { return r.ok ? r.json() : { slots: [] }; })
          .then(function (d) { renderMmBar(d.slots || []); })
          .catch(function () { /* 通信エラー時はバー非表示のまま */ });
      }
      loadMmBar();
      // 他タブで設定を変えたら追従
      window.addEventListener('storage', function (e) { if (e.key === LS_KEY) loadMmBar(); });
    })();`;
}
