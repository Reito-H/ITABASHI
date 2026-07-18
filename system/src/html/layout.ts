// 共通HTMLレイアウト
import { ADMIN_PATH } from '../config';

export function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/\//g, '\\u002F');
}

export function layout(title: string, content: string, activePage: string = ''): string {
  const navItems = [
    { href: `${ADMIN_PATH}`,              label: 'ホーム',          id: 'home' },
    { href: `${ADMIN_PATH}/shift`,        label: '新人シフト管理',  id: 'shift' },
    { href: `${ADMIN_PATH}/kancho-shift`, label: '班長シフト',      id: 'kancho-shift' },
    { href: `${ADMIN_PATH}/newcomers`,    label: '総合新人管理',    id: 'newcomers' },
    { href: `${ADMIN_PATH}/staff`,        label: '社員管理',        id: 'staff' },
    { href: `${ADMIN_PATH}/staff/search`, label: '社員絞り込み検索', id: 'staff-search' },
    { href: `${ADMIN_PATH}/events`,       label: '報告一覧',        id: 'events' },
    { href: `${ADMIN_PATH}/vehicles`,     label: '車両検索',        id: 'vehicles' },
    { href: `${ADMIN_PATH}/inspection`,   label: '点検管理',        id: 'inspection' },
    { href: `${ADMIN_PATH}/manual-chat`,  label: 'マニュアルBot',   id: 'manual-chat' },
    { href: `${ADMIN_PATH}/announcements`, label: 'お知らせ配信',   id: 'announcements' },
    // LINE利用状況はどの権限キーにも属さないID（フル権限adminのみ表示・アクセス可）
    { href: `${ADMIN_PATH}/usage`,        label: 'LINE利用状況',    id: 'line-activity' },
    { href: `${ADMIN_PATH}/settings`,     label: '設定',            id: 'settings' },
  ];

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${escHtml(title)} | Benten管理システム</title>
  <style>
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
      width: 200px; min-height: 100vh; background: #1a3a5c;
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
    .mobile-header {
      display: none; background: #1a3a5c; color: white;
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
    <div style="padding:18px 18px 14px;border-bottom:1px solid rgba(255,255,255,0.1);">
      <div style="color:white;font-weight:700;font-size:13px;letter-spacing:0.04em;">Benten管理システム</div>
      <div style="color:#7cb3d8;font-size:10px;margin-top:3px;letter-spacing:0.06em;">CREW MANAGEMENT</div>
    </div>
    <nav style="flex:1;overflow-y:auto;padding:6px 0;">
      ${navItems.map(item => `
        <a href="${item.href}" data-nav-id="${item.id}" class="nav-item${activePage === item.id ? ' active' : ''}" onclick="closeSidebar()">
          ${escHtml(item.label)}
        </a>
      `).join('')}
    </nav>
    <div style="padding:12px 0;border-top:1px solid rgba(255,255,255,0.1);">
      <a href="${ADMIN_PATH}/logout" class="nav-item" style="color:#fca5a5;">ログアウト</a>
    </div>
  </div>

  <!-- メインコンテンツ -->
  <div class="main-content">
    <div class="desktop-header bg-white shadow-sm px-5 py-3 flex items-center justify-between">
      <h1 style="font-size:16px;font-weight:600;color:#374151;">${escHtml(title)}</h1>
      <span style="font-size:12px;color:#9ca3af;" id="current-time"></span>
    </div>
    <div class="page-content" style="padding:16px;">
      ${content}
    </div>
  </div>

  <script>
    function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebar-overlay').classList.toggle('open');
    }
    function closeSidebar() {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebar-overlay').classList.remove('open');
    }
    function updateTime() {
      const s = new Date().toLocaleString('ja-JP', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
      const el  = document.getElementById('current-time');
      const elm = document.getElementById('current-time-m');
      if (el)  el.textContent  = s;
      if (elm) elm.textContent = s;
    }
    updateTime();
    setInterval(updateTime, 60000);
  </script>
</body>
</html>`;
}

const LOGO_B64 = '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';

export function loginPage(error: string = '', csrfToken: string = ''): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>管理システム ログイン</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Hiragino Sans', 'Meiryo', -apple-system, sans-serif;
      background: #f0f2f5;
      min-height: 100vh;
      display: flex;
      align-items: stretch;
    }
    .left {
      width: 220px;
      flex-shrink: 0;
      background: #1a3a5c;
      display: flex;
      flex-direction: column;
      padding: 32px 0 24px;
    }
    .left-logo {
      padding: 0 20px 28px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    .left-logo-title {
      font-size: 13px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.04em;
    }
    .left-logo-sub {
      font-size: 10px;
      color: #7cb3d8;
      margin-top: 3px;
      letter-spacing: 0.06em;
    }
    .left-nav {
      margin-top: 20px;
      flex: 1;
    }
    .left-nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 11px 20px;
      color: #7cb3d8;
      font-size: 13px;
      opacity: 0.5;
    }
    .left-nav-item.active {
      background: rgba(255,255,255,0.08);
      color: #ffffff;
      opacity: 1;
    }
    .left-footer {
      padding: 16px 20px 0;
      border-top: 1px solid rgba(255,255,255,0.1);
    }
    .admin-badge {
      background: rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .admin-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #4ade80;
      box-shadow: 0 0 6px #4ade80;
      flex-shrink: 0;
    }
    .admin-texts { min-width: 0; }
    .admin-label {
      font-size: 9px;
      color: #7cb3d8;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .admin-name {
      font-size: 15px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    .right {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
    }
    .card {
      width: 100%;
      max-width: 380px;
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(26,58,92,0.10), 0 1px 4px rgba(0,0,0,0.06);
      overflow: hidden;
    }
    .card-header {
      background: #1a3a5c;
      padding: 22px 28px;
    }
    .card-header-title {
      font-size: 16px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: 0.04em;
    }
    .card-header-sub {
      font-size: 11px;
      color: #7cb3d8;
      margin-top: 3px;
    }
    .card-body { padding: 28px 28px 24px; }
    .error-box {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      padding: 10px 14px;
      border-radius: 6px;
      font-size: 12px;
      margin-bottom: 20px;
      line-height: 1.6;
    }
    .field { margin-bottom: 16px; }
    .field label {
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      letter-spacing: 0.08em;
      margin-bottom: 6px;
    }
    .field input {
      width: 100%;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      padding: 10px 12px;
      font-size: 14px;
      color: #1e293b;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
      font-family: inherit;
      background: #f8fafc;
    }
    .field input:focus {
      border-color: #2d6a9f;
      box-shadow: 0 0 0 3px rgba(45,106,159,0.12);
      background: #ffffff;
    }
    .btn {
      width: 100%;
      background: #1a3a5c;
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
    .btn:hover { background: #2d6a9f; }
    .btn:active { background: #153050; }
    .card-footer {
      border-top: 1px solid #f1f5f9;
      padding: 12px 28px;
      text-align: right;
      font-size: 11px;
      color: #94a3b8;
    }
    @media (max-width: 600px) {
      .left { display: none; }
    }
  </style>
</head>
<body>
  <div class="left">
    <div class="left-logo">
      <div class="left-logo-title">Benten管理システム</div>
      <div class="left-logo-sub">CREW MANAGEMENT</div>
    </div>
    <nav class="left-nav">
      <div class="left-nav-item active">ログイン</div>
      <div class="left-nav-item">新人シフト管理</div>
      <div class="left-nav-item">総合新人管理</div>
      <div class="left-nav-item">社員管理</div>
    </nav>
    <div class="left-footer">
      <div class="admin-badge">
        <div class="admin-dot"></div>
        <div class="admin-texts">
          <div class="admin-label">システム管理者</div>
          <div class="admin-name">星</div>
        </div>
      </div>
    </div>
  </div>
  <div class="right">
    <div class="card">
      <div class="card-header">
        <div class="card-header-title">管理者ログイン</div>
        <div class="card-header-sub">認証情報を入力してください</div>
      </div>
      <div class="card-body">
        ${error ? `<div class="error-box">${escHtml(error)}</div>` : ''}
        <form method="POST" action="${ADMIN_PATH}/login">
          ${csrfToken ? `<input type="hidden" name="csrf_token" value="${escHtml(csrfToken)}">` : ''}
          <div class="field">
            <label>ユーザー名</label>
            <input type="text" name="username" required autocomplete="username" placeholder="ID">
          </div>
          <div class="field">
            <label>パスワード</label>
            <input type="password" name="password" required autocomplete="current-password" placeholder="••••••••">
          </div>
          <button type="submit" class="btn">ログイン</button>
        </form>
      </div>
      <div class="card-footer">提供：ベンテンクラブ</div>
    </div>
  </div>
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
