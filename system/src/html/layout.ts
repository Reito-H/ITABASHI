// 共通HTMLレイアウト
import { ADMIN_PATH } from '../config';
import { quickReportModalHtml, quickReportModalScript } from './quick_report_modal';

export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/\//g, '\\u002F');
}

// 保存完了トースト（crew_shift/shift/kancho_shift/summer_report で共用）
// 呼び出し側は saveToastHtml() をページ内に1つ配置し、saveToastScript() で showToast(msg) を使えるようにする
export function saveToastHtml(): string {
  return `<div id="save-toast" style="display:none;position:fixed;bottom:24px;right:24px;background:#166534;color:white;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.25);"></div>`;
}

export function saveToastScript(): string {
  return `
function showToast(msg) {
  var el = document.querySelector('#save-toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(function() { el.style.display = 'none'; }, 3000);
}`;
}

// フローティング新規報告ボタンを表示しないページ（設定・点検管理・班長シフト）
const REPORT_FAB_HIDDEN_PAGES = new Set(['settings', 'inspection', 'kancho-shift']);

export function layout(title: string, content: string, activePage: string = '', headerExtra: string = ''): string {
  const showReportFab = !REPORT_FAB_HIDDEN_PAGES.has(activePage);
  const navItems = [
    { href: `${ADMIN_PATH}`,              label: 'ホーム',          id: 'home' },
    { href: `${ADMIN_PATH}/kancho-shift`, label: '班長シフト',      id: 'kancho-shift' },
    { href: `${ADMIN_PATH}/handover`,     label: '引き継ぎシート',  id: 'handover' },
    { href: `${ADMIN_PATH}/crew-portal`,  label: '乗務員ポータル',  id: 'crew-portal' },
    { href: `${ADMIN_PATH}/newcomers`,    label: '総合新人管理',    id: 'newcomers' },
    { href: `${ADMIN_PATH}/staff`,        label: '社員管理',        id: 'staff' },
    { href: `${ADMIN_PATH}/vehicles`,     label: '車両検索',        id: 'vehicles' },
    { href: `${ADMIN_PATH}/inspection`,   label: '点検管理',        id: 'inspection' },
    { href: `${ADMIN_PATH}/settings`,     label: '設定',            id: 'settings' },
  ];

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${escHtml(title)} | ホシコン</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+CiAgPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTQiIGZpbGw9IiMyZTEzNTQiLz4KICA8cG9seWdvbiBwb2ludHM9IjMyLjAwLDEwLjAwIDM3LjI5LDI0LjcyIDUyLjkyLDI1LjIwIDQwLjU2LDM0Ljc4IDQ0LjkzLDQ5LjgwIDMyLjAwLDQxLjAwIDE5LjA3LDQ5LjgwIDIzLjQ0LDM0Ljc4IDExLjA4LDI1LjIwIDI2LjcxLDI0LjcyIiBmaWxsPSIjZjJjMTRlIi8+Cjwvc3ZnPgo=">
  <style>
    /* ===== デザイントークン =====
       新規実装・改修時はここを参照する。既存の直書き色は無理に置換しない。
       ブレークポイントはCSS変数に出来ないため運用ルールとして明記: モバイル<768px / タブレット768-1024px / PC>1024px */
    :root {
      --color-primary: #1a3a5c;
      --color-primary-dark: #0f2740;
      --color-primary-hover: #244a70;
      --color-accent: #f2c14e;
      --color-danger: #dc2626;
      --color-danger-bg: #fef2f2;
      --color-danger-border: #fecaca;
      --color-success: #166534;
      --color-success-bg: #f0fdf4;
      --color-warning: #d97706;
      --color-warning-bg: #fffbeb;
      --color-text: #1e293b;
      --color-text-muted: #6b7280;
      --color-border: #e5e7eb;
      --radius-sm: 4px;
      --radius-md: 6px;
      --radius-lg: 8px;
      --font-xs: 11px;
      --font-sm: 12px;
      --font-base: 13px;
      --font-lg: 15px;
    }
    /* Tailwind utility subset — CDN不要のインラインCSS */
    .flex{display:flex}.grid{display:grid}.grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.hidden{display:none}.block{display:block}.inline-block{display:inline-block}
    .items-center{align-items:center}.justify-between{justify-content:space-between}.justify-center{justify-content:center}
    .gap-1{gap:.25rem}.gap-2{gap:.5rem}.gap-3{gap:.75rem}.gap-4{gap:1rem}
    .space-y-2>*+*{margin-top:.5rem}.space-y-4>*+*{margin-top:1rem}.space-y-5>*+*{margin-top:1.25rem}
    .min-h-screen{min-height:100vh}.overflow-auto{overflow:auto}.overflow-hidden{overflow:hidden}
    .w-full{width:100%}.w-80{width:20rem}.w-12{width:3rem}
    .max-w-xs{max-width:20rem}.max-w-xl{max-width:36rem}.max-w-2xl{max-width:42rem}.max-w-3xl{max-width:48rem}
    .p-6{padding:1.5rem}.p-8{padding:2rem}
    .px-3{padding-left:.75rem;padding-right:.75rem}.px-4{padding-left:1rem;padding-right:1rem}.px-5{padding-left:1.25rem;padding-right:1.25rem}.px-6{padding-left:1.5rem;padding-right:1.5rem}
    .py-1{padding-top:.25rem;padding-bottom:.25rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}.py-3{padding-top:.75rem;padding-bottom:.75rem}.py-4{padding-top:1rem;padding-bottom:1rem}.py-8{padding-top:2rem;padding-bottom:2rem}
    .pt-2{padding-top:.5rem}.pb-4{padding-bottom:1rem}
    .mb-1{margin-bottom:.25rem}.mb-2{margin-bottom:.5rem}.mb-3{margin-bottom:.75rem}.mb-4{margin-bottom:1rem}.mb-5{margin-bottom:1.25rem}.mb-6{margin-bottom:1.5rem}
    .mt-1{margin-top:.25rem}.mt-2{margin-top:.5rem}.mt-6{margin-top:1.5rem}
    .bg-white{background:#fff}.bg-gray-50{background:#f9fafb}.bg-gray-100{background:#f3f4f6}.bg-gray-600{background:#4b5563}.bg-gray-700{background:#374151}.bg-blue-600{background:#2563eb}.bg-indigo-600{background:#4f46e5}
    .text-white{color:#fff}.text-gray-300{color:#d1d5db}.text-gray-400{color:#9ca3af}.text-gray-500{color:#6b7280}.text-gray-600{color:#4b5563}.text-gray-700{color:#374151}.text-gray-800{color:#1f2937}.text-red-500{color:#ef4444}.text-red-600{color:#dc2626}
    .text-xs{font-size:.75rem;line-height:1rem}.text-sm{font-size:.875rem;line-height:1.25rem}.text-lg{font-size:1.125rem;line-height:1.75rem}.text-4xl{font-size:2.25rem;line-height:2.5rem}
    .font-bold{font-weight:700}.font-semibold{font-weight:600}.font-medium{font-weight:500}.font-mono{font-family:ui-monospace,monospace}
    .text-center{text-align:center}.text-left{text-align:left}.uppercase{text-transform:uppercase}.tracking-wider{letter-spacing:.05em}
    .rounded{border-radius:.25rem}.rounded-lg{border-radius:.5rem}.rounded-xl{border-radius:.75rem}
    .shadow{box-shadow:0 1px 3px 0 rgba(0,0,0,.1),0 1px 2px -1px rgba(0,0,0,.1)}.shadow-sm{box-shadow:0 1px 2px 0 rgba(0,0,0,.05)}
    .border{border:1px solid #e5e7eb}.border-b{border-bottom:1px solid #e5e7eb}.border-gray-200{border-color:#e5e7eb}.border-gray-300{border-color:#d1d5db}
    .cursor-pointer{cursor:pointer}
    .hover\:bg-gray-50:hover{background:#f9fafb}.hover\:bg-gray-200:hover{background:#e5e7eb}.hover\:bg-gray-700:hover{background:#374151}.hover\:bg-blue-700:hover{background:#1d4ed8}
    .focus\:ring-2:focus{box-shadow:0 0 0 2px rgba(59,130,246,.5)}.focus\:ring-blue-500:focus{outline:2px solid #3b82f6}
    /* ===== */
    * { box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', 'Meiryo', sans-serif; background: #f5f5f5; margin: 0; }
    .sidebar {
      width: 200px; min-height: 100vh; background: var(--color-primary);
      position: fixed; top: 0; left: 0; z-index: 40;
      display: flex; flex-direction: column;
      transition: transform 0.25s ease;
    }
    .main-content { margin-left: 200px; min-height: 100vh; }
    .nav-item {
      display: flex; align-items: center;
      padding: 11px 18px; color: #cbd5e1;
      text-decoration: none; font-size: 13px; transition: all 0.15s;
      border-left: 3px solid transparent;
    }
    .nav-item:hover { background: rgba(255,255,255,0.08); color: white; }
    .nav-item.active { background: rgba(255,255,255,0.12); color: white; border-left-color: #60a5fa; }
    .sidebar-collapse-btn {
      flex-shrink: 0; width: 24px; height: 24px; border-radius: 6px; border: none;
      background: rgba(255,255,255,0.12); color: #cbd5e1; cursor: pointer;
      display: flex; align-items: center; justify-content: center; font-size: 13px;
    }
    .sidebar-collapse-btn:hover { background: rgba(255,255,255,0.22); color: #fff; }
    .sidebar-reopen-btn {
      display: none; position: fixed; top: 14px; left: 0; z-index: 41;
      width: 26px; height: 34px; border-radius: 0 8px 8px 0; border: none;
      background: var(--color-primary); color: #cbd5e1; cursor: pointer; font-size: 13px;
      align-items: center; justify-content: center; box-shadow: 2px 2px 6px rgba(0,0,0,0.15);
    }
    .sidebar-reopen-btn:hover { background: var(--color-primary-hover); color: #fff; }
    @media (min-width: 769px) {
      body.sidebar-collapsed .sidebar { transform: translateX(-100%); }
      body.sidebar-collapsed .main-content { margin-left: 0; }
      body.sidebar-collapsed .sidebar-reopen-btn { display: flex; }
      body.sidebar-collapsed .desktop-header { padding-left: 44px; }
    }
    .mobile-header {
      display: none; background: var(--color-primary); color: white;
      padding: 12px 16px; align-items: center; justify-content: space-between;
      position: sticky; top: 0; z-index: 50;
    }
    .hamburger {
      background: none; border: none; cursor: pointer; padding: 4px;
      display: flex; flex-direction: column; gap: 5px; touch-action: manipulation;
    }
    .hamburger span { display: block; width: 22px; height: 2px; background: white; border-radius: 2px; }
    .sidebar-overlay {
      display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 39;
    }
    @media (max-width: 768px) {
      .sidebar { transform: translateX(-100%); }
      .sidebar.open { transform: translateX(0); }
      .sidebar-overlay.open { display: block; }
      .main-content { margin-left: 0; }
      .mobile-header { display: flex; }
      .desktop-header { display: none; }
    }
    @media (min-width: 769px) and (max-width: 1024px) {
      .sidebar { width: 180px; }
      .main-content { margin-left: 180px; }
    }
  </style>
</head>
<body>
  <script>
    try { if (localStorage.getItem('ho_sidebar_collapsed') === '1') document.body.classList.add('sidebar-collapsed'); } catch {}
  </script>
  <button class="sidebar-reopen-btn" id="sidebar-reopen-btn" onclick="toggleSidebarCollapse()" aria-label="サイドバーを開く" title="サイドバーを開く">»</button>

  <!-- モバイルヘッダー -->
  <div class="mobile-header">
    <button class="hamburger" onclick="toggleSidebar()" aria-label="メニュー">
      <span></span><span></span><span></span>
    </button>
    <span style="font-size:13px;font-weight:600;">${escHtml(title)}</span>
    <span style="font-size:12px;color:#93c5fd;" id="current-time-m"></span>
  </div>

  <!-- サイドバーオーバーレイ（モバイル） -->
  <div class="sidebar-overlay" id="sidebar-overlay" onclick="toggleSidebar()"></div>

  <!-- サイドバー -->
  <div class="sidebar" id="sidebar">
    <div style="padding:18px 18px 14px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div style="color:white;font-weight:700;font-size:13px;letter-spacing:0.04em;">ホシコン</div>
      <button class="sidebar-collapse-btn" onclick="toggleSidebarCollapse()" aria-label="サイドバーを折りたたむ" title="折りたたむ">«</button>
    </div>
    <nav style="flex:1;overflow-y:auto;padding:6px 0;">
      ${navItems.map(item => `
        <a href="${item.href}" data-nav-id="${item.id}" class="nav-item${activePage === item.id ? ' active' : ''}" onclick="closeSidebar()">
          ${escHtml(item.label)}
        </a>
      `).join('')}
      <!-- nojico: 権限フィルタ対象外（data-nav-id無し）で全アカウント共通表示。外部サイトをアプリ内ブラウザ（iframe）で表示するだけ -->
      <a href="${ADMIN_PATH}/nojico" class="nav-item${activePage === 'nojico' ? ' active' : ''}" onclick="closeSidebar()">
        nojico
      </a>
    </nav>
    <div style="padding:12px 0;border-top:1px solid rgba(255,255,255,0.1);">
      <a href="${ADMIN_PATH}/logout" class="nav-item" style="color:#fca5a5;">ログアウト</a>
    </div>
  </div>

  <!-- メインコンテンツ -->
  <div class="main-content">
    <div class="desktop-header bg-white shadow-sm px-5 py-3 flex items-center justify-between">
      <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;">
        <h1 style="font-size:20px;font-weight:700;color:#1e293b;white-space:nowrap;">${escHtml(title)}</h1>
        ${headerExtra}
      </div>
      <span style="font-size:12px;color:#9ca3af;flex-shrink:0;" id="current-time"></span>
    </div>
    <div class="page-content" style="padding:16px;">
      ${content}
    </div>
  </div>

  <!-- リミット到達ポップアップ（引き継ぎシートで設定した締切タスクの通知。全ページ共通・所属課ベースでサーバ側フィルタ済み） -->
  <div id="limit-alert-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;align-items:center;justify-content:center;padding:16px;">
    <div style="background:#fff;border-radius:16px;padding:26px 24px;width:100%;max-width:480px;max-height:82vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.4);">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <span style="font-size:28px;line-height:1;">⏰</span>
        <span style="font-size:19px;font-weight:800;color:#dc2626;">リミット到達</span>
      </div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:14px;">設定した時刻になりました。対応が終わったタスクは「完了」を押してください。</div>
      <div id="limit-alert-list"></div>
    </div>
  </div>

  ${showReportFab ? `
  <div id="report-fab-wrap" style="position:fixed;right:20px;bottom:20px;z-index:60;">
    <div id="report-fab-menu" style="display:none;position:absolute;bottom:66px;right:0;background:white;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.22);min-width:220px;overflow:hidden;border:1px solid #e5e7eb;">
      <a href="javascript:void(0)" onclick="openQrModal('lost');return false;" data-perm-key="settings.lost-items" style="display:block;padding:18px 22px;font-size:17px;font-weight:600;color:#1e3a5f;text-decoration:none;border-bottom:1px solid #f3f4f6;">忘れ物報告</a>
      <a href="javascript:void(0)" onclick="openQrModal('accident');return false;" data-perm-key="settings.accidents" style="display:block;padding:18px 22px;font-size:17px;font-weight:600;color:#1e3a5f;text-decoration:none;border-bottom:1px solid #f3f4f6;">事故報告</a>
      <a href="javascript:void(0)" onclick="openQrModal('violation');return false;" data-perm-key="settings.violations" style="display:block;padding:18px 22px;font-size:17px;font-weight:600;color:#1e3a5f;text-decoration:none;border-bottom:1px solid #f3f4f6;">違反報告</a>
      <a href="javascript:void(0)" onclick="openQrModal('general');return false;" data-perm-key="settings.general-reports" style="display:block;padding:18px 22px;font-size:17px;font-weight:600;color:#1e3a5f;text-decoration:none;border-bottom:1px solid #f3f4f6;">一般報告</a>
      <a href="javascript:void(0)" onclick="createHandoverMemoFromFab();return false;" data-perm-key="settings.handover-memos" style="display:block;padding:18px 22px;font-size:17px;font-weight:600;color:#1e3a5f;text-decoration:none;">引き継ぎメモ</a>
    </div>
    <button id="report-fab-btn" onclick="toggleReportFab()" aria-label="新規報告" title="新規報告"
      style="width:54px;height:54px;border-radius:50%;background:#1e3a5f;color:#fff;border:none;box-shadow:0 4px 14px rgba(0,0,0,0.3);font-size:26px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">＋</button>
  </div>
  ${quickReportModalHtml()}
  ` : ''}

  <script>
    function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebar-overlay').classList.toggle('open');
    }
    function closeSidebar() {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebar-overlay').classList.remove('open');
    }
    function toggleSidebarCollapse() {
      const collapsed = document.body.classList.toggle('sidebar-collapsed');
      try { localStorage.setItem('ho_sidebar_collapsed', collapsed ? '1' : '0'); } catch {}
    }
    function updateTime() {
      const s = new Date().toLocaleString('ja-JP', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
      const el  = document.getElementById('current-time');
      const elm = document.getElementById('current-time-m');
      if (el)  el.textContent  = s;
      if (elm) elm.textContent = s;
    }
    updateTime();
    var _timeInterval = setInterval(updateTime, 60000);

    function escLimitText(s) {
      return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function renderLimitAlerts(items) {
      var wrap = document.getElementById('limit-alert-overlay');
      var list = document.getElementById('limit-alert-list');
      if (!items || !items.length) { wrap.style.display = 'none'; list.innerHTML = ''; return; }
      list.innerHTML = items.map(function (l) {
        return '<div style="display:flex;align-items:flex-start;gap:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;margin-bottom:10px;">'
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-size:13px;font-weight:800;color:#7f1d1d;">板橋' + l.division + '課・' + escLimitText(l.limit_time) + 'まで</div>'
          + '<div style="font-size:14px;color:#111;margin-top:4px;word-break:break-all;">' + escLimitText(l.task) + '</div>'
          + '</div>'
          + '<button onclick="dismissLimitAlert(' + l.id + ')" style="flex-shrink:0;background:#16a34a;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;">完了</button>'
          + '</div>';
      }).join('');
      wrap.style.display = 'flex';
    }
    async function checkLimits() {
      try {
        var res = await fetch('${ADMIN_PATH}/api/limits/pending');
        if (!res.ok) return;
        var data = await res.json();
        renderLimitAlerts(data.limits || []);
      } catch (e) { /* 通信エラー時は次回ポーリングに委ねる */ }
    }
    async function dismissLimitAlert(id) {
      try { await fetch('${ADMIN_PATH}/api/limits/' + id + '/dismiss', { method: 'POST' }); } catch (e) {}
      checkLimits();
    }
    var _limitsInterval = null;
    function startLimitsPolling() {
      if (_limitsInterval) return;
      checkLimits();
      _limitsInterval = setInterval(checkLimits, 20000);
    }
    function stopLimitsPolling() {
      if (_limitsInterval) { clearInterval(_limitsInterval); _limitsInterval = null; }
    }
    startLimitsPolling();
    // タブが非表示の間はポーリングを止め、復帰時に即再開・即時反映する（長時間開きっぱなし運用でのメモリ増加対策）
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stopLimitsPolling();
        clearInterval(_timeInterval);
      } else {
        updateTime();
        _timeInterval = setInterval(updateTime, 60000);
        startLimitsPolling();
      }
    });

    function toggleReportFab() {
      const menu = document.getElementById('report-fab-menu');
      if (menu) menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
    }
    function createHandoverMemoFromFab() {
      const menu = document.getElementById('report-fab-menu');
      if (menu) menu.style.display = 'none';
      fetch('${ADMIN_PATH}/api/handover-memos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.ok) { location.href = '${ADMIN_PATH}/settings/handover-memos/' + data.id; }
        else { alert('作成に失敗しました'); }
      })
      .catch(function() { alert('通信エラーが発生しました'); });
    }
    document.addEventListener('click', function (e) {
      const wrap = document.getElementById('report-fab-wrap');
      const menu = document.getElementById('report-fab-menu');
      if (wrap && menu && menu.style.display === 'block' && !wrap.contains(e.target)) menu.style.display = 'none';
    });
    (function () {
      // 権限フィルタで全リンクが除去された場合はボタンごと非表示にする
      const wrap = document.getElementById('report-fab-wrap');
      const menu = document.getElementById('report-fab-menu');
      if (wrap && menu && !menu.querySelector('a')) wrap.style.display = 'none';
    })();
    ${showReportFab ? quickReportModalScript() : ''}
  </script>
</body>
</html>`;
}


const LOGIN_FAVICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+CiAgPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTQiIGZpbGw9IiMyZTEzNTQiLz4KICA8cG9seWdvbiBwb2ludHM9IjMyLjAwLDEwLjAwIDM3LjI5LDI0LjcyIDUyLjkyLDI1LjIwIDQwLjU2LDM0Ljc4IDQ0LjkzLDQ5LjgwIDMyLjAwLDQxLjAwIDE5LjA3LDQ5LjgwIDIzLjQ0LDM0Ljc4IDExLjA4LDI1LjIwIDI2LjcxLDI0LjcyIiBmaWxsPSIjZjJjMTRlIi8+Cjwvc3ZnPgo=';

export type LoginMode = 'pc' | 'sp';

// ログイン方式（PC／スマホ）の選択画面
export function loginSelectPage(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>ホシコン ログイン</title>
  <link rel="icon" type="image/svg+xml" href="${LOGIN_FAVICON}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: 'Hiragino Sans', 'Meiryo', -apple-system, sans-serif;
      min-height: 100vh;
      background: linear-gradient(160deg, #3d1a6e 0%, #2e1354 60%, #200d3d 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
    }
    .wrap { width: 100%; max-width: 380px; }
    .brand {
      text-align: center;
      color: var(--color-accent);
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.1em;
      margin-bottom: 6px;
    }
    .lead {
      text-align: center;
      color: #d9cdf0;
      font-size: 13px;
      margin-bottom: 28px;
    }
    .choice {
      display: block;
      width: 100%;
      background: rgba(255,255,255,0.97);
      border: none;
      border-radius: 14px;
      padding: 20px 20px;
      margin-bottom: 16px;
      text-align: left;
      text-decoration: none;
      box-shadow: 0 8px 24px rgba(20,6,45,0.35);
      -webkit-tap-highlight-color: transparent;
      transition: transform 0.1s;
    }
    .choice:active { transform: scale(0.98); }
    .choice-row { display: flex; align-items: center; gap: 14px; }
    .choice-icon {
      flex-shrink: 0;
      width: 44px; height: 44px;
      border-radius: 10px;
      background: #ede6f9;
      display: flex; align-items: center; justify-content: center;
    }
    .choice-title { font-size: 15px; font-weight: 700; color: #2e1354; }
    .choice-sub { font-size: 11.5px; color: #7a6a99; margin-top: 2px; }
    .choice-arrow { margin-left: auto; color: #9a8ac0; font-size: 18px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">ホシコン 管理システム</div>
    <div class="lead">ご利用の端末を選択してください</div>

    <a class="choice" href="${ADMIN_PATH}/login?mode=pc">
      <div class="choice-row">
        <div class="choice-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="13" rx="1.5" stroke="#3d1a6e" stroke-width="1.8"/><path d="M8 21h8M12 17v4" stroke="#3d1a6e" stroke-width="1.8" stroke-linecap="round"/></svg>
        </div>
        <div>
          <div class="choice-title">PCでログイン</div>
          <div class="choice-sub">パソコンの画面に最適化された表示</div>
        </div>
        <div class="choice-arrow">›</div>
      </div>
    </a>

    <a class="choice" href="${ADMIN_PATH}/login?mode=sp">
      <div class="choice-row">
        <div class="choice-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="6" y="2" width="12" height="20" rx="2" stroke="#3d1a6e" stroke-width="1.8"/><path d="M11 19h2" stroke="#3d1a6e" stroke-width="1.8" stroke-linecap="round"/></svg>
        </div>
        <div>
          <div class="choice-title">スマホでログイン</div>
          <div class="choice-sub">スマートフォンの画面に最適化された表示</div>
        </div>
        <div class="choice-arrow">›</div>
      </div>
    </a>
  </div>
</body>
</html>`;
}

export function loginPage(mode: LoginMode, error: string = '', csrfToken: string = ''): string {
  return mode === 'sp' ? loginPageSp(error, csrfToken) : loginPagePc(error, csrfToken);
}

function loginPagePc(error: string = '', csrfToken: string = ''): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>ホシコン ログイン</title>
  <link rel="icon" type="image/svg+xml" href="${LOGIN_FAVICON}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: 'Hiragino Sans', 'Meiryo', -apple-system, sans-serif;
      min-height: 100vh;
      background: #2e1354;
      position: relative;
      overflow-x: hidden;
    }
    .bg-frame {
      position: fixed;
      inset: 0;
      padding: 6vh 6vw;
      box-sizing: border-box;
    }
    .bg-frame img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: 16px;
    }
    .center {
      position: relative;
      z-index: 1;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      width: 100%;
      max-width: 340px;
      background: rgba(238,231,247,0.96);
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(20,6,45,0.45);
      padding: 28px 26px 24px;
      backdrop-filter: blur(2px);
    }
    .card-title {
      font-size: 15px;
      font-weight: 700;
      color: #2e1354;
      letter-spacing: 0.04em;
      margin-bottom: 2px;
    }
    .card-sub {
      font-size: 11px;
      color: #6b5a8a;
      margin-bottom: 20px;
    }
    .error-box {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 12px;
      margin-bottom: 18px;
      line-height: 1.6;
    }
    .field { margin-bottom: 14px; }
    .field label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #5b4a7a;
      letter-spacing: 0.06em;
      margin-bottom: 6px;
    }
    .field input {
      width: 100%;
      border: 1px solid #cabde0;
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 14px;
      color: #2e1354;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
      font-family: inherit;
      background: #ffffff;
    }
    .field input:focus {
      border-color: #6a3fb5;
      box-shadow: 0 0 0 3px rgba(106,63,181,0.15);
    }
    .btn {
      width: 100%;
      background: #3d1a6e;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 12px;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 0.04em;
      cursor: pointer;
      margin-top: 4px;
      transition: background 0.15s;
      font-family: inherit;
    }
    .btn:hover { background: #5a2ba0; }
    .btn:active { background: #2e1354; }
    .switch-link {
      display: block;
      text-align: center;
      margin-top: 16px;
      font-size: 11px;
      color: #6b5a8a;
      text-decoration: none;
    }
    .switch-link:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="bg-frame">
    <img src="${ADMIN_PATH}/login-bg.jpg" alt="">
  </div>
  <div class="center">
    <div class="card">
      <div class="card-title">管理者ログイン（PC）</div>
      <div class="card-sub">IDとパスワードを入力してください</div>
      ${error ? `<div class="error-box">${escHtml(error)}</div>` : ''}
      <form method="POST" action="${ADMIN_PATH}/login">
        ${csrfToken ? `<input type="hidden" name="csrf_token" value="${escHtml(csrfToken)}">` : ''}
        <div class="field">
          <label>ログインID</label>
          <input type="text" name="username" required autocomplete="username" placeholder="ID">
        </div>
        <div class="field">
          <label>パスワード</label>
          <input type="password" name="password" required autocomplete="current-password" placeholder="••••••••">
        </div>
        <button type="submit" class="btn">ログイン</button>
      </form>
      <a class="switch-link" href="${ADMIN_PATH}/login?reset=1">スマホ表示に切り替える</a>
    </div>
  </div>
</body>
</html>`;
}

function loginPageSp(error: string = '', csrfToken: string = ''): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>ホシコン ログイン</title>
  <link rel="icon" type="image/svg+xml" href="${LOGIN_FAVICON}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: 'Hiragino Sans', 'Meiryo', -apple-system, sans-serif;
      min-height: 100vh;
      background: linear-gradient(160deg, #3d1a6e 0%, #2e1354 55%, #200d3d 100%);
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: center;
      padding: 20px;
      padding-top: max(20px, env(safe-area-inset-top));
      padding-bottom: max(20px, env(safe-area-inset-bottom));
    }
    .brand {
      text-align: center;
      color: var(--color-accent);
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.08em;
      margin-bottom: 18px;
    }
    .card {
      width: 100%;
      background: #ffffff;
      border-radius: 18px;
      box-shadow: 0 10px 30px rgba(20,6,45,0.4);
      padding: 26px 20px 22px;
    }
    .card-title {
      font-size: 17px;
      font-weight: 700;
      color: #2e1354;
      margin-bottom: 4px;
    }
    .card-sub {
      font-size: 13px;
      color: #6b5a8a;
      margin-bottom: 22px;
    }
    .error-box {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      padding: 12px 14px;
      border-radius: 10px;
      font-size: 13px;
      margin-bottom: 18px;
      line-height: 1.6;
    }
    .field { margin-bottom: 16px; }
    .field label {
      display: block;
      font-size: 12.5px;
      font-weight: 600;
      color: #5b4a7a;
      letter-spacing: 0.03em;
      margin-bottom: 7px;
    }
    .field input {
      width: 100%;
      border: 1px solid #cabde0;
      border-radius: 10px;
      padding: 14px 14px;
      /* 16px未満だとiOS Safariでフォーカス時に自動ズームされてしまうため固定 */
      font-size: 16px;
      color: #2e1354;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
      font-family: inherit;
      background: #faf8fd;
      min-height: 52px;
    }
    .field input:focus {
      border-color: #6a3fb5;
      box-shadow: 0 0 0 3px rgba(106,63,181,0.15);
      background: #ffffff;
    }
    .pw-wrap { position: relative; }
    .pw-wrap input { padding-right: 52px; }
    .pw-toggle {
      position: absolute;
      right: 4px;
      top: 4px;
      bottom: 4px;
      width: 44px;
      border: none;
      background: transparent;
      color: #7a6a99;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }
    .pw-toggle svg { pointer-events: none; }
    .btn {
      width: 100%;
      background: #3d1a6e;
      color: #ffffff;
      border: none;
      border-radius: 12px;
      padding: 16px;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0.04em;
      cursor: pointer;
      margin-top: 6px;
      min-height: 52px;
      transition: background 0.15s;
      font-family: inherit;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    .btn:active { background: #2e1354; }
    .switch-link {
      display: block;
      text-align: center;
      margin-top: 20px;
      font-size: 12.5px;
      color: #d9cdf0;
      text-decoration: none;
      padding: 8px;
    }
    .switch-link:active { opacity: 0.7; }
  </style>
</head>
<body>
  <div class="brand">ホシコン 管理システム</div>
  <div class="card">
    <div class="card-title">管理者ログイン</div>
    <div class="card-sub">IDとパスワードを入力してください</div>
    ${error ? `<div class="error-box">${escHtml(error)}</div>` : ''}
    <form method="POST" action="${ADMIN_PATH}/login">
      ${csrfToken ? `<input type="hidden" name="csrf_token" value="${escHtml(csrfToken)}">` : ''}
      <div class="field">
        <label>ログインID</label>
        <input type="text" name="username" required autocomplete="username" placeholder="ID" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false">
      </div>
      <div class="field">
        <label>パスワード</label>
        <div class="pw-wrap">
          <input type="password" name="password" id="pw-input" required autocomplete="current-password" placeholder="••••••••">
          <button type="button" class="pw-toggle" id="pw-toggle" aria-label="パスワードを表示">
            <svg id="pw-icon-show" width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>
            <svg id="pw-icon-hide" width="20" height="20" viewBox="0 0 24 24" fill="none" style="display:none"><path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.5 5.2A11 11 0 0 1 12 5c7 0 11 7 11 7a13.3 13.3 0 0 1-3.4 4M6.1 6.7C3.3 8.5 1 12 1 12s4 7 11 7c1.4 0 2.7-.3 3.9-.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>
      <button type="submit" class="btn">ログイン</button>
    </form>
  </div>
  <a class="switch-link" href="${ADMIN_PATH}/login?reset=1">PC表示に切り替える</a>
  <script>
    (function () {
      var toggle = document.getElementById('pw-toggle');
      var input = document.getElementById('pw-input');
      var iconShow = document.getElementById('pw-icon-show');
      var iconHide = document.getElementById('pw-icon-hide');
      if (!toggle || !input) return;
      toggle.addEventListener('click', function () {
        var showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        iconShow.style.display = showing ? '' : 'none';
        iconHide.style.display = showing ? 'none' : '';
        toggle.setAttribute('aria-label', showing ? 'パスワードを表示' : 'パスワードを隠す');
      });
    })();
  </script>
</body>
</html>`;
}

export function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// DB保存の日時文字列（datetime('now','localtime')）をJSTとして整形する。
// Cloudflare D1にはタイムゾーンDBが無く 'localtime' 指定でもUTCのまま保存されるため、
// 表示側でUTC→JST（+9時間）に変換する。
export function formatJst(raw: string | null | undefined, withWeekday: boolean = false): string {
  if (!raw) return '—';
  const d = new Date(raw.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
    ...(withWeekday ? { weekday: 'short' as const } : {}),
  });
}
