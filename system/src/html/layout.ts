// 共通HTMLレイアウト
import { ADMIN_PATH, APP_VERSION } from '../config';
import { quickReportModalHtml, quickReportModalScript } from './quick_report_modal';
import { announcementBarHtml, announcementBarScript } from './announcement_bar';
import { birthdayPopupHtml, birthdayPopupScript } from './birthday_popup';

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

// フローティング新規報告ボタンを表示しないページ（設定・点検管理・班長シフト・便利＝車庫を含む）
const REPORT_FAB_HIDDEN_PAGES = new Set(['settings', 'inspection', 'kancho-shift', 'kanri-kobo', 'benri']);

// embed=true: サイドバー・ヘッダー・お知らせ・リミットポーリング等を全て省いた最小限のHTML文書を返す。
// 引き継ぎシートのフローティングパネル（やることリスト）のようにiframeへ埋め込む用途専用。
// hideReportFab=true: activePage単位ではなく、このページ1枚だけフローティング新規報告ボタンを消す
// （例: 乗務員証証明写真＝画面右下をカメラ操作等で使うため。同じactivePageの他ページには影響しない）。
export function layout(title: string, content: string, activePage: string = '', headerExtra: string = '', embed: boolean = false, hideReportFab: boolean = false): string {
  if (embed) {
    return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${escHtml(title)}</title>
  <style>
    :root {
      --color-primary: #232a6b; --color-primary-dark: #171c4d; --color-primary-hover: #2f3888;
      --color-action: #5666ff; --color-action-soft: #ecefff;
      --color-accent: #f4a621; --color-danger: #dc2626; --color-danger-bg: #fef2f2; --color-danger-border: #fecaca;
      --color-success: #166534; --color-success-bg: #f0fdf4; --color-warning: #d97706; --color-warning-bg: #fffbeb;
      --color-text: #141d2c; --color-text-muted: #566178; --color-border: #e4eaf5; --color-bg: #f5f8fd;
      --radius-sm: 5px; --radius-md: 8px; --radius-lg: 12px;
      --font-xs: 11px; --font-sm: 12px; --font-base: 14px; --font-lg: 16px;
    }
    * { box-sizing: border-box; }
    body { font-family: 'Hiragino Sans', 'Meiryo', sans-serif; background: #fff; margin: 0; color: var(--color-text); }
  </style>
</head>
<body>
  <div class="page-content" style="padding:10px;">
    ${content}
  </div>
</body>
</html>`;
  }
  const showReportFab = !hideReportFab && !REPORT_FAB_HIDDEN_PAGES.has(activePage);
  // permKey省略時は id をそのまま権限キーとして使う（filterHtmlByPermissionsのdata-nav-id判定用）。
  // 報告センターは専用の権限キーを持たず、既存の5つの報告権限のいずれかで表示する（スペース区切り＝OR）
  const REPORT_CENTER_PERM = 'settings.lost-items settings.accidents settings.violations settings.general-reports settings.handover-memos';
  // public:true の項目は data-nav-id を出さず、全アカウントで常に表示する（権限フィルタの対象外）
  const navItems: Array<{ href: string; label: string; id: string; permKey?: string; highlight?: boolean; public?: boolean }> = [
    { href: `${ADMIN_PATH}`,               label: 'ホーム',          id: 'home' },
    { href: `${ADMIN_PATH}/settings/reports`, label: '報告センター', id: 'report-center', permKey: REPORT_CENTER_PERM, highlight: true },
    { href: `${ADMIN_PATH}/kancho-shift`,  label: '班長シフト',      id: 'kancho-shift' },
    { href: `${ADMIN_PATH}/kanri-kobo`,    label: '課長・職員シフト',    id: 'kanri-kobo' },
    { href: `${ADMIN_PATH}/handover`,      label: '引き継ぎシート',  id: 'handover' },
    { href: `${ADMIN_PATH}/newcomers`,     label: '総合新人管理',    id: 'newcomers' },
    { href: `${ADMIN_PATH}/staff`,         label: '社員管理',        id: 'staff' },
    { href: `${ADMIN_PATH}/attendance-board`, label: '出勤者ボード',   id: 'attendance-board', permKey: 'crew-shift' },
    { href: `${ADMIN_PATH}/kacho-mission`, label: '課長ミッション',  id: 'kacho-mission', permKey: 'kacho-mission staff' },
    { href: `${ADMIN_PATH}/settings/study-sessions`, label: '板橋ページ', id: 'office-page', permKey: 'settings.study-sessions settings.office-opinions settings.hiyari settings.surveys settings.daihon' },
    { href: `${ADMIN_PATH}/sales-ai`,      label: 'AI売上分析',      id: 'sales-ai' },
    { href: `${ADMIN_PATH}/accidents`,     label: '事故分析',        id: 'accidents' },
    // 車両検索はサイドバーから廃止（ホームの横断検索バーへ一本化）。/vehicles ルートと vehicles 権限は存置。
    { href: `${ADMIN_PATH}/benri`,         label: '便利',            id: 'benri', permKey: 'benri' },
    { href: `${ADMIN_PATH}/shuttle`,       label: 'シャトルバス',    id: 'shuttle', permKey: 'shuttle' },
    { href: `${ADMIN_PATH}/inspection`,    label: '点検管理',        id: 'inspection' },
    { href: `${ADMIN_PATH}/settings`,      label: '設定',            id: 'settings' },
  ];

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>${escHtml(title)} | ホシコン</title>
  <link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
  <style>
    /* ===== デザイントークン =====
       新規実装・改修時はここを参照する。既存の直書き色は無理に置換しない。
       ブレークポイントはCSS変数に出来ないため運用ルールとして明記: モバイル<768px / タブレット768-1024px / PC>1024px */
    :root {
      /* 明るい近未来パレット v3（2026-09〜 デザイン刷新 Phase 1）
         主色は旧ネイビー #1a3a5c を深いインディゴへ。対話的な操作（主CTA・現在地・
         アクティブ表示）は --color-action（アイリス）を1画面に1つだけ使う。
         --color-accent（アンバー＝星）は強調の差し色。直書き色は段階的にこれらへ寄せる。 */
      --color-primary: #232a6b;
      --color-primary-dark: #171c4d;
      --color-primary-hover: #2f3888;
      --color-action: #5666ff;
      --color-action-soft: #ecefff;
      --color-accent: #f4a621;
      --color-danger: #dc2626;
      --color-danger-bg: #fef2f2;
      --color-danger-border: #fecaca;
      --color-success: #166534;
      --color-success-bg: #f0fdf4;
      --color-warning: #d97706;
      --color-warning-bg: #fffbeb;
      --color-text: #141d2c;
      --color-text-muted: #566178;
      --color-border: #e4eaf5;
      --color-bg: #f5f8fd;
      --radius-sm: 5px;
      --radius-md: 8px;
      --radius-lg: 12px;
      --font-xs: 11px;
      --font-sm: 12px;
      --font-base: 14px;
      --font-lg: 16px;
      --ann-bar-h: 0px;
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
    body { font-family: 'Hiragino Sans', 'Meiryo', sans-serif; background: var(--color-bg); margin: 0; }
    .sidebar {
      width: 200px; height: calc(100vh - var(--ann-bar-h, 0px)); background: var(--color-primary);
      position: fixed; top: var(--ann-bar-h, 0px); left: 0; z-index: 40;
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
    .nav-item.active { background: rgba(255,255,255,0.12); color: white; border-left-color: var(--color-action); }
    .nav-item.nav-item-highlight { color: var(--color-accent); font-weight: 700; background: rgba(242,193,78,0.08); }
    .nav-item.nav-item-highlight:hover { background: rgba(242,193,78,0.16); color: var(--color-accent); }
    .nav-item.nav-item-highlight.active { background: rgba(242,193,78,0.22); border-left-color: var(--color-accent); color: var(--color-accent); }
    /* ビルドタグ: 以前は目立つゴールドのピルだったが、情報量に対して主張が強すぎたため
       控えめなモノスペースのタグへ格下げ（デザイン刷新 Phase 1）。 */
    .version-pill {
      font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 10px; font-weight: 600;
      letter-spacing: 0.04em; color: var(--color-text-muted);
      background: transparent;
      border: 1px solid var(--color-border);
      border-radius: 6px; padding: 2px 7px; line-height: 1.4;
      user-select: none; white-space: nowrap;
    }
    .version-pill-m { color: #c7d2fe; background: transparent; border: 1px solid rgba(255,255,255,0.25); }
    .sidebar-collapse-btn {
      flex-shrink: 0; width: 24px; height: 24px; border-radius: 6px; border: none;
      background: rgba(255,255,255,0.12); color: #cbd5e1; cursor: pointer;
      display: flex; align-items: center; justify-content: center; font-size: 13px;
    }
    .sidebar-collapse-btn:hover { background: rgba(255,255,255,0.22); color: #fff; }
    .sidebar-reopen-btn {
      display: none; position: fixed; top: calc(14px + var(--ann-bar-h, 0px)); left: 0; z-index: 41;
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
      position: sticky; top: var(--ann-bar-h, 0px); z-index: 50;
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
      #bell-dropdown { top: calc(50px + var(--ann-bar-h, 0px)); right: 8px; left: 8px; width: auto; max-width: none; }
    }
    @media (min-width: 769px) and (max-width: 1024px) {
      .sidebar { width: 180px; }
      .main-content { margin-left: 180px; }
    }
    /* リミット到達アラート（引き継ぎシート＋メーター検査・車検の期限通知が共用。PCの大画面で見やすいよう大きめに表示する） */
    .limit-alert-card {
      background: #fff; border-radius: 20px; padding: 40px 40px 34px; width: 100%;
      max-width: 960px; max-height: 86vh; overflow-y: auto; box-shadow: 0 24px 70px rgba(0,0,0,0.45);
    }
    .limit-alert-card .limit-alert-heading { font-size: 30px; font-weight: 800; color: #dc2626; }
    .limit-alert-card .limit-alert-icon { font-size: 34px; }
    .limit-alert-card .limit-alert-sub { font-size: 14px; color: #6b7280; margin-top: 6px; margin-bottom: 22px; }
    .limit-alert-item { font-size: 17px; padding: 18px 22px; }
    .limit-alert-item .limit-alert-item-title { font-size: 16px; }
    .limit-alert-item .limit-alert-item-body { font-size: 18px; }
    .limit-alert-item button { font-size: 15px; padding: 10px 20px; }
    @media (max-width: 1024px) {
      .limit-alert-card { max-width: 480px; padding: 26px 24px; border-radius: 16px; }
      .limit-alert-card .limit-alert-heading { font-size: 19px; }
      .limit-alert-card .limit-alert-icon { font-size: 28px; }
      .limit-alert-card .limit-alert-sub { font-size: 12px; margin-bottom: 14px; }
      .limit-alert-item { font-size: 13px; padding: 12px 14px; }
      .limit-alert-item .limit-alert-item-title { font-size: 13px; }
      .limit-alert-item .limit-alert-item-body { font-size: 14px; }
      .limit-alert-item button { font-size: 13px; padding: 8px 14px; }
    }
  </style>
</head>
<body>
  ${announcementBarHtml()}
  ${birthdayPopupHtml()}
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
    <div style="display:flex;align-items:center;gap:8px;">
      <button id="bell-btn-m" onclick="toggleBellDropdown()" aria-label="お知らせ" title="お知らせ" style="position:relative;background:none;border:none;cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;color:#e5e7eb;">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <span id="bell-badge-m" style="display:none;position:absolute;top:0;right:0;background:#dc2626;color:#fff;font-size:9px;font-weight:700;min-width:14px;height:14px;border-radius:8px;align-items:center;justify-content:center;padding:0 3px;line-height:1;"></span>
      </button>
      <span class="version-pill version-pill-m">v${escHtml(APP_VERSION)}</span>
      <span style="font-size:12px;color:#93c5fd;" id="current-time-m"></span>
    </div>
  </div>

  <!-- サイドバーオーバーレイ（モバイル） -->
  <div class="sidebar-overlay" id="sidebar-overlay" onclick="toggleSidebar()"></div>

  <!-- サイドバー -->
  <div class="sidebar" id="sidebar">
    <div style="padding:18px 18px 14px;border-bottom:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div style="color:white;font-weight:700;font-size:13px;letter-spacing:0.04em;">ホシコン</div>
      <button class="sidebar-collapse-btn" onclick="toggleSidebarCollapse()" aria-label="サイドバーを折りたたむ" title="折りたたむ">«</button>
    </div>
    <nav style="flex:1;overflow-y:auto;overscroll-behavior:contain;padding:6px 0;">
      ${navItems.map(item => `
        <a href="${item.href}"${item.public ? '' : ` data-nav-id="${item.permKey ?? item.id}"`} class="nav-item${item.highlight ? ' nav-item-highlight' : ''}${activePage === item.id ? ' active' : ''}" onclick="closeSidebar()">
          ${escHtml(item.label)}
        </a>
      `).join('')}
      <!-- nojico は「課長ミッション」内へ移設したためサイドバー直下のリンクは廃止（ルート自体は残存） -->
    </nav>
    <div style="padding:12px 0;border-top:1px solid rgba(255,255,255,0.1);">
      <form method="POST" action="${ADMIN_PATH}/logout" style="margin:0;">
        <button type="submit" class="nav-item" style="color:#fca5a5;background:none;border:none;width:100%;text-align:left;font:inherit;cursor:pointer;">ログアウト</button>
      </form>
    </div>
  </div>

  <!-- メインコンテンツ -->
  <div class="main-content">
    <div class="desktop-header bg-white shadow-sm px-5 py-3 flex items-center justify-between">
      <div style="display:flex;align-items:center;gap:14px;flex:1;min-width:0;">
        <h1 style="font-size:20px;font-weight:700;color:var(--color-text);white-space:nowrap;">${escHtml(title)}</h1>
        ${headerExtra}
      </div>
      <div style="display:flex;align-items:center;gap:14px;flex-shrink:0;">
        <button id="bell-btn-d" onclick="toggleBellDropdown()" aria-label="お知らせ" title="お知らせ" style="position:relative;background:none;border:none;cursor:pointer;padding:6px;display:flex;align-items:center;justify-content:center;color:#4b5563;border-radius:6px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          <span id="bell-badge-d" style="display:none;position:absolute;top:2px;right:2px;background:#dc2626;color:#fff;font-size:10px;font-weight:700;min-width:15px;height:15px;border-radius:8px;align-items:center;justify-content:center;padding:0 3px;line-height:1;"></span>
        </button>
        <span class="version-pill" title="バージョン ${escHtml(APP_VERSION)}">v${escHtml(APP_VERSION)}</span>
        <span style="font-size:12px;color:#9ca3af;" id="current-time"></span>
      </div>
    </div>
    <div class="page-content" style="padding:16px;">
      ${content}
    </div>
  </div>

  <!-- お知らせ（ベルマーク）ドロップダウン -->
  <div id="bell-dropdown" style="display:none;position:fixed;top:calc(54px + var(--ann-bar-h, 0px));right:20px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.2);width:340px;max-width:92vw;max-height:70vh;overflow-y:auto;z-index:70;">
    <div style="padding:12px 16px;border-bottom:1px solid #f1f5f9;font-size:13px;font-weight:700;color:#1e293b;position:sticky;top:0;background:#fff;">お知らせ</div>
    <div id="bell-list"></div>
  </div>
  <div id="bell-overlay" onclick="closeBellDropdown()" style="display:none;position:fixed;inset:0;z-index:65;"></div>

  <!-- お知らせ 詳細モーダル（長文タップで全文表示） -->
  <div id="bell-detail-overlay" onclick="closeBellDetail()" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:80;align-items:center;justify-content:center;padding:16px;">
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:14px;padding:22px 22px 20px;width:100%;max-width:440px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 50px rgba(0,0,0,0.3);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;">
        <div id="bell-detail-title" style="font-size:15px;font-weight:700;color:#12263f;"></div>
        <button onclick="closeBellDetail()" aria-label="閉じる" style="background:none;border:none;font-size:20px;color:#9ca3af;cursor:pointer;line-height:1;padding:2px;flex-shrink:0;">×</button>
      </div>
      <div id="bell-detail-message" style="font-size:13.5px;color:#1c2733;line-height:1.75;white-space:pre-wrap;"></div>
      <div id="bell-detail-date" style="font-size:11px;color:#9ca3af;margin-top:14px;"></div>
    </div>
  </div>

  <!-- リミット到達ポップアップ（引き継ぎシートの締切タスク＋メーター検査・車検の期限通知。全ページ共通・所属課ベースでサーバ側フィルタ済み） -->
  <div id="limit-alert-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2000;align-items:center;justify-content:center;padding:16px;">
    <div class="limit-alert-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <span class="limit-alert-icon" style="line-height:1;">⏰</span>
        <span class="limit-alert-heading">リミット到達</span>
      </div>
      <div class="limit-alert-sub">設定した期限になりました。対応が終わったものは「完了」または「一旦閉じる」を押してください。</div>
      <div id="limit-alert-list"></div>
    </div>
  </div>

  ${showReportFab ? `
  <div id="report-fab-wrap" style="position:fixed;right:20px;bottom:20px;z-index:60;display:flex;flex-direction:column;align-items:flex-end;gap:10px;">
    <a href="javascript:void(0)" id="report-fab-memo-btn" onclick="createHandoverMemoFromFab();return false;" data-perm-key="settings.handover-memos" aria-label="引き継ぎメモを新規作成" title="引き継ぎメモを新規作成"
      style="width:40px;height:40px;border-radius:50%;background:#fff;color:#1e3a5f;border:2px solid #1e3a5f;box-shadow:0 4px 10px rgba(0,0,0,0.2);font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;text-decoration:none;">メモ</a>
    <button id="report-fab-btn" onclick="openQrModal()" aria-label="新規報告" title="新規報告"
      style="width:54px;height:54px;border-radius:50%;background:#1e3a5f;color:#fff;border:none;box-shadow:0 4px 14px rgba(0,0,0,0.3);font-size:26px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;">＋</button>
  </div>
  <div id="phone-search-wrap" style="position:fixed;right:84px;bottom:20px;z-index:60;display:flex;align-items:flex-end;gap:8px;">
    <div id="phone-search-panel" style="display:none;background:#fff;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,0.25);padding:8px;flex-direction:column;gap:6px;width:260px;max-width:calc(100vw - 140px);">
      <div style="display:flex;gap:6px;">
        <input id="phone-search-input" type="tel" inputmode="tel" placeholder="電話番号で案件検索" autocomplete="off"
          style="flex:1;min-width:0;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:14px;"
          onkeydown="if(event.key==='Enter'){searchReportByPhone();}">
        <button onclick="searchReportByPhone()" style="background:#1e3a5f;color:#fff;border:none;border-radius:6px;padding:0 14px;font-size:13px;font-weight:600;cursor:pointer;">検索</button>
      </div>
      <div id="phone-search-results" style="display:none;max-height:280px;overflow-y:auto;border-top:1px solid #f3f4f6;"></div>
    </div>
    <button id="phone-search-toggle-btn" onclick="togglePhoneSearchPanel(event)" aria-label="電話番号で案件検索" title="電話番号で案件検索"
      style="width:44px;height:44px;border-radius:50%;background:#fff;color:#1e3a5f;border:2px solid #1e3a5f;box-shadow:0 4px 10px rgba(0,0,0,0.2);font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;">TEL</button>
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
    var VEHICLE_ALERT_STYLES = {
      notice:   { bg: '#eff6ff', border: '#bfdbfe', text: '#1e3a8a', tag: '【予告】' },
      warning:  { bg: '#fffbeb', border: '#fde68a', text: '#92400e', tag: '【注意】' },
      critical: { bg: '#fef2f2', border: '#fecaca', text: '#7f1d1d', tag: '【警告】' },
    };
    function vehicleDaysLabel(days) {
      if (days < 0) return '期限を' + (-days) + '日超過しています';
      if (days === 0) return '本日が期限です';
      if (days === 1) return '明日が期限です（前日）';
      return 'あと' + days + '日です';
    }
    function renderLimitAlerts(items) {
      var wrap = document.getElementById('limit-alert-overlay');
      var list = document.getElementById('limit-alert-list');
      if (!items || !items.length) { wrap.style.display = 'none'; list.innerHTML = ''; return; }
      list.innerHTML = items.map(function (l) {
        if (l.kind === 'vehicle') {
          var st = VEHICLE_ALERT_STYLES[l.severity] || VEHICLE_ALERT_STYLES.notice;
          return '<div class="limit-alert-item" style="display:flex;align-items:flex-start;gap:10px;background:' + st.bg + ';border:1px solid ' + st.border + ';border-radius:10px;margin-bottom:10px;">'
            + '<div style="flex:1;min-width:0;">'
            + '<div class="limit-alert-item-title" style="font-weight:800;color:' + st.text + ';">板橋' + l.ka + '課・車番 ' + escLimitText(l.car_no) + '・' + escLimitText(l.field_label) + '</div>'
            + '<div class="limit-alert-item-body" style="color:#111;margin-top:4px;word-break:break-all;">' + st.tag + ' ' + vehicleDaysLabel(l.days_remaining) + '（期限: ' + escLimitText(l.limit_date) + '）</div>'
            + '</div>'
            + '<button onclick="snoozeVehicleAlert(\\'' + l.source + '\\', \\'' + l.car_no + '\\')" style="flex-shrink:0;background:#4b5563;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">一旦閉じる</button>'
            + '</div>';
        }
        return '<div class="limit-alert-item" style="display:flex;align-items:flex-start;gap:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;margin-bottom:10px;">'
          + '<div style="flex:1;min-width:0;">'
          + '<div class="limit-alert-item-title" style="font-weight:800;color:#7f1d1d;">板橋' + l.division + '課・' + escLimitText(l.limit_time) + 'まで</div>'
          + '<div class="limit-alert-item-body" style="color:#111;margin-top:4px;word-break:break-all;">' + escLimitText(l.task) + '</div>'
          + '</div>'
          + '<button onclick="dismissLimitAlert(' + l.id + ')" style="flex-shrink:0;background:#16a34a;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">完了</button>'
          + '</div>';
      }).join('');
      wrap.style.display = 'flex';
    }
    async function checkLimits() {
      try {
        var results = await Promise.all([
          fetch('${ADMIN_PATH}/api/limits/pending').then(function (r) { return r.ok ? r.json() : { limits: [] }; }).catch(function () { return { limits: [] }; }),
          fetch('${ADMIN_PATH}/api/vehicle-deadlines/alerts/pending').then(function (r) { return r.ok ? r.json() : { alerts: [] }; }).catch(function () { return { alerts: [] }; }),
        ]);
        var handoverItems = (results[0].limits || []).map(function (l) { l.kind = 'handover'; return l; });
        var vehicleItems = (results[1].alerts || []).map(function (l) { l.kind = 'vehicle'; return l; });
        renderLimitAlerts(handoverItems.concat(vehicleItems));
      } catch (e) { /* 通信エラー時は次回ポーリングに委ねる */ }
    }
    async function dismissLimitAlert(id) {
      try { await fetch('${ADMIN_PATH}/api/limits/' + id + '/dismiss', { method: 'POST' }); } catch (e) {}
      checkLimits();
    }
    async function snoozeVehicleAlert(source, carNo) {
      try {
        await fetch('${ADMIN_PATH}/api/vehicle-deadlines/alerts/snooze', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: source, car_no: carNo }),
        });
      } catch (e) {}
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

    function escBellText(s) {
      return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
    function setBellBadge(n) {
      ['bell-badge-d', 'bell-badge-m'].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        if (n > 0) { el.textContent = n > 99 ? '99+' : String(n); el.style.display = 'flex'; }
        else { el.style.display = 'none'; }
      });
    }
    async function loadBellUnreadCount() {
      try {
        var res = await fetch('/api/announcements/web/unread-count');
        if (!res.ok) return;
        var data = await res.json();
        setBellBadge(data.count || 0);
      } catch (e) { /* 通信エラー時は次回ページ遷移時に再取得 */ }
    }
    var _bellItems = {};
    function renderBellList(items) {
      var list = document.getElementById('bell-list');
      _bellItems = {};
      items.forEach(function (a) { _bellItems[a.id] = a; });
      if (!items || !items.length) {
        list.innerHTML = '<div style="padding:24px 16px;text-align:center;color:#9ca3af;font-size:13px;">お知らせはありません</div>';
        return;
      }
      list.innerHTML = items.map(function (a) {
        return '<div class="bell-item" data-id="' + a.id + '" onclick="openBellDetail(' + a.id + ')" style="padding:12px 16px;border-bottom:1px solid #f4f6f9;cursor:pointer;position:relative;' + (a.read ? '' : 'background:#f0f7ff;') + '">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">'
          + '<div style="font-size:13px;font-weight:700;color:#12263f;margin-bottom:3px;flex:1;min-width:0;">' + escBellText(a.title) + '</div>'
          + '<button onclick="event.stopPropagation();dismissBellAnnouncement(' + a.id + ')" aria-label="削除" title="削除" style="flex-shrink:0;background:none;border:none;color:#c1c9d4;cursor:pointer;font-size:15px;line-height:1;padding:2px 4px;">×</button>'
          + '</div>'
          + '<div style="font-size:12.5px;color:#4b5563;line-height:1.6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + escBellText(a.message) + '</div>'
          + '<div style="font-size:11px;color:#9ca3af;margin-top:5px;">' + escBellText((a.created_at || '').slice(0, 16)) + '</div>'
          + '</div>';
      }).join('');
    }
    async function loadBellList() {
      var list = document.getElementById('bell-list');
      list.innerHTML = '<div style="padding:24px 16px;text-align:center;color:#9ca3af;font-size:13px;">読み込み中...</div>';
      try {
        var res = await fetch('/api/announcements/web/list');
        if (!res.ok) return;
        var data = await res.json();
        renderBellList(data.announcements || []);
        setBellBadge(0);
        fetch('/api/announcements/web/mark-read', { method: 'POST' }).catch(function () {});
      } catch (e) {
        list.innerHTML = '<div style="padding:24px 16px;text-align:center;color:#9ca3af;font-size:13px;">読み込みに失敗しました</div>';
      }
    }
    function openBellDetail(id) {
      var a = _bellItems[id];
      if (!a) return;
      document.getElementById('bell-detail-title').textContent = a.title;
      document.getElementById('bell-detail-message').textContent = a.message;
      document.getElementById('bell-detail-date').textContent = (a.created_at || '').slice(0, 16);
      document.getElementById('bell-detail-overlay').style.display = 'flex';
    }
    function closeBellDetail() {
      document.getElementById('bell-detail-overlay').style.display = 'none';
    }
    async function dismissBellAnnouncement(id) {
      var el = document.querySelector('.bell-item[data-id="' + id + '"]');
      try {
        await fetch('/api/announcements/web/' + id + '/dismiss', { method: 'POST' });
      } catch (e) { /* 通信エラー時は次回開いた際に再表示される */ }
      delete _bellItems[id];
      if (el) el.remove();
      var list = document.getElementById('bell-list');
      if (list && !list.querySelector('.bell-item')) {
        list.innerHTML = '<div style="padding:24px 16px;text-align:center;color:#9ca3af;font-size:13px;">お知らせはありません</div>';
      }
    }
    var _bellOpen = false;
    function toggleBellDropdown() {
      _bellOpen = !_bellOpen;
      document.getElementById('bell-dropdown').style.display = _bellOpen ? 'block' : 'none';
      document.getElementById('bell-overlay').style.display = _bellOpen ? 'block' : 'none';
      if (_bellOpen) loadBellList();
    }
    function closeBellDropdown() {
      _bellOpen = false;
      document.getElementById('bell-dropdown').style.display = 'none';
      document.getElementById('bell-overlay').style.display = 'none';
    }
    loadBellUnreadCount();
    ${announcementBarScript()}
    ${birthdayPopupScript()}
    function createHandoverMemoFromFab() {
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
    (function () {
      // 権限フィルタでタブが1つも残らなかった場合は「＋」ボタンごと非表示にする
      const wrap = document.getElementById('report-fab-wrap');
      const reportBtn = document.getElementById('report-fab-btn');
      const hasAnyTab = ['lost', 'accident', 'violation', 'general'].some(function (t) { return !!document.getElementById('qr-tab-' + t); });
      if (reportBtn && !hasAnyTab) reportBtn.style.display = 'none';
      if (wrap && !hasAnyTab && !document.getElementById('report-fab-memo-btn')) wrap.style.display = 'none';
    })();
    function escPhoneSearchHtml(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
    function togglePhoneSearchPanel(ev) {
      if (ev) ev.stopPropagation();
      const panel = document.getElementById('phone-search-panel');
      const opening = panel.style.display !== 'flex';
      panel.style.display = opening ? 'flex' : 'none';
      if (opening) {
        document.getElementById('phone-search-input').focus();
      } else {
        document.getElementById('phone-search-results').style.display = 'none';
        document.getElementById('phone-search-results').innerHTML = '';
      }
    }
    document.addEventListener('click', function (ev) {
      const wrap = document.getElementById('phone-search-wrap');
      if (wrap && wrap.style.display !== 'none' && !wrap.contains(ev.target)) {
        const panel = document.getElementById('phone-search-panel');
        if (panel) panel.style.display = 'none';
      }
    });
    function searchReportByPhone() {
      const input = document.getElementById('phone-search-input');
      const phone = input.value.trim();
      const resultsBox = document.getElementById('phone-search-results');
      if (!phone) { return; }
      resultsBox.style.display = 'block';
      resultsBox.innerHTML = '<div style="padding:10px;font-size:12px;color:#9ca3af;">検索中...</div>';
      fetch('${ADMIN_PATH}/settings/reports/search-by-phone?phone=' + encodeURIComponent(phone))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          const results = data.results || [];
          if (results.length === 0) {
            resultsBox.innerHTML = '<div style="padding:10px;font-size:12px;color:#9ca3af;">該当する案件が見つかりませんでした</div>'
              + '<div style="padding:0 10px 10px;"><button type="button" onclick="openReportFromPhoneSearch()" style="width:100%;padding:8px;background:#1e3a5f;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">この電話番号で新規報告を追加</button></div>';
            return;
          }
          if (results.length === 1) {
            window.open(results[0].href, '_blank');
          }
          resultsBox.innerHTML = results.map(function (r) {
            const dateStr = (r.createdAt || '').slice(5, 16).replace('-', '/');
            return '<div class="phone-search-result-row" data-href="' + escPhoneSearchHtml(r.href) + '" '
              + 'style="padding:8px 6px;border-bottom:1px solid #f3f4f6;cursor:pointer;font-size:12px;">'
              + '<div style="font-weight:700;color:#111827;">[' + escPhoneSearchHtml(r.kindLabel) + '] ' + escPhoneSearchHtml(r.name || '(名前なし)') + ' ' + escPhoneSearchHtml(r.phone || '') + '</div>'
              + '<div style="color:#9ca3af;">' + escPhoneSearchHtml(dateStr) + '　' + escPhoneSearchHtml(r.caseId || '') + '　' + (r.resolved ? '対応済' : '対応中') + '</div>'
              + '</div>';
          }).join('');
          resultsBox.querySelectorAll('.phone-search-result-row').forEach(function (row) {
            row.addEventListener('mouseover', function () { row.style.background = '#f9fafb'; });
            row.addEventListener('mouseout', function () { row.style.background = ''; });
            row.addEventListener('click', function () { window.open(row.getAttribute('data-href'), '_blank'); });
          });
        })
        .catch(function () {
          resultsBox.innerHTML = '<div style="padding:10px;font-size:12px;color:#dc2626;">通信エラーが発生しました</div>';
        });
    }
    function openReportFromPhoneSearch() {
      const phone = document.getElementById('phone-search-input').value.trim();
      const panel = document.getElementById('phone-search-panel');
      if (panel) panel.style.display = 'none';
      const resultsBox = document.getElementById('phone-search-results');
      if (resultsBox) { resultsBox.style.display = 'none'; resultsBox.innerHTML = ''; }
      if (typeof openQrModal === 'function') openQrModal(null, phone);
    }
    ${showReportFab ? quickReportModalScript() : ''}
  </script>
</body>
</html>`;
}


export const FAVICON_DATA_URI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+CiAgPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTQiIGZpbGw9IiMyZTEzNTQiLz4KICA8cG9seWdvbiBwb2ludHM9IjMyLjAwLDEwLjAwIDM3LjI5LDI0LjcyIDUyLjkyLDI1LjIwIDQwLjU2LDM0Ljc4IDQ0LjkzLDQ5LjgwIDMyLjAwLDQxLjAwIDE5LjA3LDQ5LjgwIDIzLjQ0LDM0Ljc4IDExLjA4LDI1LjIwIDI2LjcxLDI0LjcyIiBmaWxsPSIjZjJjMTRlIi8+Cjwvc3ZnPgo=';

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
  <link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: 'Hiragino Sans', 'Meiryo', -apple-system, sans-serif;
      min-height: 100vh;
      background: linear-gradient(155deg, #3b40b4 0%, #262a80 54%, #1b1f5c 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
    }
    .wrap { width: 100%; max-width: 380px; }
    .brand {
      text-align: center;
      color: #f4a621;
      font-size: 15px;
      font-weight: 700;
      letter-spacing: 0.1em;
      margin-bottom: 6px;
    }
    .lead {
      text-align: center;
      color: #c7cbf3;
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
      box-shadow: 0 8px 24px rgba(15,20,60,0.35);
      -webkit-tap-highlight-color: transparent;
      transition: transform 0.1s;
    }
    .choice:active { transform: scale(0.98); }
    .choice-row { display: flex; align-items: center; gap: 14px; }
    .choice-icon {
      flex-shrink: 0;
      width: 44px; height: 44px;
      border-radius: 10px;
      background: #ecefff;
      display: flex; align-items: center; justify-content: center;
    }
    .choice-title { font-size: 15px; font-weight: 700; color: #232a6b; }
    .choice-sub { font-size: 11.5px; color: #6b7593; margin-top: 2px; }
    .choice-arrow { margin-left: auto; color: #94a0b6; font-size: 18px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand">ホシコン 管理システム</div>
    <div class="lead">ご利用の端末を選択してください</div>

    <a class="choice" href="${ADMIN_PATH}/login?mode=pc">
      <div class="choice-row">
        <div class="choice-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="13" rx="1.5" stroke="#232a6b" stroke-width="1.8"/><path d="M8 21h8M12 17v4" stroke="#232a6b" stroke-width="1.8" stroke-linecap="round"/></svg>
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
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="6" y="2" width="12" height="20" rx="2" stroke="#232a6b" stroke-width="1.8"/><path d="M11 19h2" stroke="#232a6b" stroke-width="1.8" stroke-linecap="round"/></svg>
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
  // 背景写真を全画面（cover）で見せる。写真の左上に写っているロゴが隠れないよう
  // 位置は left top 固定にし、入力欄は右下の小さなカードにまとめる。
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>ホシコン ログイン</title>
  <link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: 'Hiragino Sans', 'Meiryo', -apple-system, sans-serif;
      min-height: 100vh;
      background: #0a0f1e;
      color: #141d2c;
      overflow: hidden;
    }
    .bg {
      position: fixed;
      inset: 0;
      background-image: url('${ADMIN_PATH}/login-bg.jpg');
      background-size: cover;
      background-position: left top;
      background-repeat: no-repeat;
    }
    /* コントラスト確保のスクリムは右下のカード周辺だけ。左上のロゴには掛けない。 */
    .bg::after {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(720px 560px at 100% 100%, rgba(10,15,30,0.44) 0, rgba(10,15,30,0.12) 56%, transparent 80%);
      pointer-events: none;
    }
    .card {
      position: fixed;
      right: clamp(16px, 4vw, 48px);
      bottom: clamp(16px, 4vw, 48px);
      width: min(370px, calc(100vw - 32px));
      background: rgba(255,255,255,0.90);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      border: 1px solid rgba(255,255,255,0.6);
      border-radius: 18px;
      box-shadow: 0 24px 60px rgba(10,15,30,0.38);
      padding: 26px 26px 24px;
    }
    .brand {
      display: flex; align-items: center; gap: 8px;
      font-size: 12px; font-weight: 700; letter-spacing: 0.12em;
      color: #232a6b; margin-bottom: 16px;
    }
    .brand .star { color: #f4a621; font-size: 14px; line-height: 1; }
    .headline { font-size: 20px; font-weight: 800; color: #141d2c; letter-spacing: 0.02em; margin-bottom: 3px; }
    .sub { font-size: 12px; color: #566178; margin-bottom: 20px; }
    .error-box { background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; padding:10px 13px; border-radius:8px; font-size:12px; margin-bottom:16px; line-height:1.6; }
    .field { margin-bottom: 14px; }
    .field label { display:block; font-size:11px; font-weight:700; color:#566178; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:6px; }
    .field input { width:100%; border:1px solid #ccd6ea; border-radius:9px; padding:11px 13px; font-size:14px; color:#141d2c; outline:none; transition:border-color .15s, box-shadow .15s; font-family:inherit; background:#fff; }
    .field input:focus { border-color:#5666ff; box-shadow:0 0 0 3px rgba(86,102,255,0.18); }
    .btn { width:100%; background:#5666ff; color:#fff; border:none; border-radius:9px; padding:12px; font-size:14px; font-weight:700; letter-spacing:0.06em; cursor:pointer; margin-top:4px; box-shadow:0 10px 24px rgba(86,102,255,0.34); transition:background .15s, transform .05s; font-family:inherit; }
    .btn:hover { background:#4553e6; }
    .btn:active { transform: translateY(1px); }
    .switch-link { display:block; text-align:center; margin-top:16px; font-size:11px; color:#566178; text-decoration:none; }
    .switch-link:hover { text-decoration:underline; color:#232a6b; }
    @media (max-width: 560px) {
      body { overflow: auto; }
      .bg::after { background: linear-gradient(0deg, rgba(10,15,30,0.52) 0, rgba(10,15,30,0.08) 44%, transparent 66%); }
      .card {
        right: 12px; left: 12px; bottom: 12px; width: auto;
        padding: 22px 20px calc(20px + env(safe-area-inset-bottom));
      }
    }
  </style>
</head>
<body>
  <div class="bg"></div>
  <div class="card">
    <div class="brand"><span class="star">★</span>ホシコン 管理システム</div>
    <div class="headline">管理者ログイン</div>
    <div class="sub">ID とパスワードを入力してください（PC）</div>
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
</body>
</html>`;
}

function loginPageSp(error: string = '', csrfToken: string = ''): string {
  // 背景写真を全画面（cover）で表示し、入力欄は下部のシートへ寄せる。
  // 写真は画面上側にしっかり見え、入力中もシートだけが手元にある。
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>ホシコン ログイン</title>
  <link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }
    body {
      font-family: 'Hiragino Sans', 'Meiryo', -apple-system, sans-serif;
      min-height: 100vh;
      background: #0a0f1e;
      color: #141d2c;
    }
    .bg {
      position: fixed;
      inset: 0;
      background-image: url('${ADMIN_PATH}/login-bg.jpg');
      background-size: cover;
      background-position: left top;
      background-repeat: no-repeat;
    }
    .bg::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(0deg, rgba(10,15,30,0.5) 0, rgba(10,15,30,0.05) 46%, transparent 70%);
      pointer-events: none;
    }
    .sheet {
      position: fixed;
      left: 0; right: 0; bottom: 0;
      z-index: 3;
      background: rgba(255,255,255,0.93);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-radius: 22px 22px 0 0;
      box-shadow: 0 -16px 46px rgba(10,15,30,0.4);
      padding: 22px 20px calc(20px + env(safe-area-inset-bottom));
      max-height: 86vh;
      overflow-y: auto;
    }
    .grip {
      width: 40px; height: 4px;
      border-radius: 999px;
      background: #ccd6ea;
      margin: 0 auto 16px;
    }
    .brand-line {
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      color: #232a6b; margin-bottom: 10px;
    }
    .brand-line .star { color: #f4a621; }
    .card-title {
      font-size: 18px;
      font-weight: 800;
      color: #141d2c;
      margin-bottom: 4px;
    }
    .card-sub {
      font-size: 13px;
      color: #566178;
      margin-bottom: 20px;
    }
    .error-box {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      padding: 12px 14px;
      border-radius: 10px;
      font-size: 13px;
      margin-bottom: 16px;
      line-height: 1.6;
    }
    .field { margin-bottom: 15px; }
    .field label {
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: #566178;
      letter-spacing: 0.04em;
      margin-bottom: 7px;
    }
    .field input {
      width: 100%;
      border: 1px solid #ccd6ea;
      border-radius: 12px;
      padding: 14px;
      /* 16px未満だとiOS Safariでフォーカス時に自動ズームされてしまうため固定 */
      font-size: 16px;
      color: #141d2c;
      outline: none;
      transition: border-color 0.15s, box-shadow 0.15s;
      font-family: inherit;
      background: #ffffff;
      min-height: 52px;
    }
    .field input:focus {
      border-color: #5666ff;
      box-shadow: 0 0 0 3px rgba(86,102,255,0.18);
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
      color: #566178;
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
      background: #5666ff;
      color: #ffffff;
      border: none;
      border-radius: 13px;
      padding: 16px;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0.04em;
      cursor: pointer;
      margin-top: 6px;
      min-height: 52px;
      box-shadow: 0 10px 24px rgba(86,102,255,0.32);
      transition: background 0.15s;
      font-family: inherit;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    .btn:active { background: #4553e6; }
    .switch-link {
      display: block;
      text-align: center;
      margin-top: 18px;
      font-size: 12.5px;
      color: #566178;
      text-decoration: none;
      padding: 8px;
    }
    .switch-link:active { opacity: 0.7; }
  </style>
</head>
<body>
  <div class="bg"></div>
  <div class="sheet">
    <div class="grip"></div>
    <div class="brand-line"><span class="star">★</span> ホシコン 管理システム</div>
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
    <a class="switch-link" href="${ADMIN_PATH}/login?reset=1">PC表示に切り替える</a>
  </div>
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
