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
