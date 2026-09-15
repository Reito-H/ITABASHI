import { Hono } from 'hono';
import { requireAuth, requireJapan } from './middleware/auth';
import { getAdminPermissions, isPathAllowed, isRootApiWriteAllowed, filterHtmlByPermissions } from './permissions';
import adminRoutes from './routes/admin';
import adminExtraRoutes from './routes/admin_extra';
import adminStaffRoutes from './routes/admin_staff';
import adminSalesAiRoutes from './routes/admin_sales_ai';
import adminFareRevisionRoutes from './routes/admin_fare_revision';
import adminPeriodComparisonRoutes from './routes/admin_period_comparison';
import adminWageSettingsRoutes from './routes/admin_wage_settings';
import adminDrivingRiskSettingsRoutes from './routes/admin_driving_risk_settings';
import adminCrewPortalRoutes from './routes/admin_crew_portal';
import shiftApi from './routes/api/shift';
import employeesApi from './routes/api/employees';
import retireePdfApi from './routes/api/retiree_pdf';
import salesAiApi from './routes/api/sales_ai';
import fareRevisionApi from './routes/api/fare_revision';
import periodComparisonApi from './routes/api/period_comparison';
import salesApi from './routes/api/sales';
import infoApi from './routes/api/info';
import instructorApi from './routes/api/instructor';
import lineApiRoutes from './routes/api/line_api';
import announcementsWebApi from './routes/api/announcements_web';
import scheduleTypesApi from './routes/api/schedule_types';
import interviewsApi from './routes/api/interviews';
import coachesApi from './routes/api/coaches';
import instructorsApi from './routes/api/instructors';
import periodSettingsApi from './routes/api/period_settings';
import wageEstimateSettingsApi from './routes/api/wage_estimate_settings';
import drivingRiskSettingsApi from './routes/api/driving_risk_settings';
import notificationsApi from './routes/api/notifications';
import instructorInviteApi from './routes/api/instructor_invite';
import lineRegApi from './routes/api/line_reg';
import liffRegisterRoutes from './routes/liff_register';
import { handleLineEvent } from './line_bot';
import { handleCron } from './cron';
import liffRoutes from './routes/liff';
import liffSalesRoutes from './routes/liff_sales';
import adminLiffRoutes from './routes/admin_liff';
import adminLineUsageRoutes from './routes/admin_line_usage';
import adminPresentationRoutes from './routes/admin_presentation';
import adminInspectionRoutes from './routes/admin_inspection';
import adminVehicleDeadlinesRoutes from './routes/admin_vehicle_deadlines';
import inspectionApi from './routes/api/inspection';
import adminDocumentsRoutes from './routes/admin_documents';
import documentsApi from './routes/api/documents';
import adminStudyNotesRoutes from './routes/admin_study_notes';
import studyNotesApi from './routes/api/study_notes';
import adminKachoMissionRoutes from './routes/admin_kacho_mission';
import adminKachoHiyariRoutes from './routes/admin_kacho_hiyari';
import adminSummerSafety2026Routes from './routes/admin_summer_safety_2026';
import kachoMissionApi from './routes/api/kacho_mission';
import adminKanchoRoutes from './routes/admin_kancho';
import adminKanchoWishRoutes from './routes/admin_kancho_wish';
import adminKanchoRosterRoutes from './routes/admin_kancho_roster';
import adminKanchoPersonalRoutes from './routes/admin_kancho_personal';
import adminKanchoLogicRoutes from './routes/admin_kancho_logic';
import adminKanriKoboRoutes from './routes/admin_kanri_kobo';
import adminAccountsRoutes from './routes/admin_accounts';
import adminDiaRoutes from './routes/admin_dia';
import diaApi from './routes/api/dia';
import adminTantoshaRoutes from './routes/admin_tantosha';
import adminTodoRoutes from './routes/admin_todo';
import adminCrewShiftRoutes from './routes/admin_crew_shift';
import adminAttendanceBoardRoutes from './routes/admin_attendance_board';
import adminDispatchRoutes from './routes/admin_dispatch';
import adminHandoverRoutes from './routes/admin_handover';
import adminHandoverLimitsRoutes from './routes/admin_handover_limits';
import adminAnnouncementBarRoutes, { announcementBarPublicApi } from './routes/admin_announcement_bar';
import adminBirthdayRoutes, { birthdayPublicApi } from './routes/admin_birthday';
import adminRequestsRoutes from './routes/admin_requests';
import adminCcListRoutes from './routes/admin_cc_list';
import adminBenriRoutes from './routes/admin_benri';
import adminAirportRoutes from './routes/admin_airport';
import adminNojicoRoutes from './routes/admin_nojico';
import adminGarageRoutes from './routes/admin_garage';
import adminShuttleRoutes from './routes/admin_shuttle';
import adminDriverReportsRoutes from './routes/admin_driver_reports';
import adminAccidentsRoutes from './routes/admin_accidents';
import adminAccidentsAnalysisRoutes from './routes/admin_accidents_analysis';
import adminAccidentsRiskRoutes from './routes/admin_accidents_risk';
import adminAccidentsRiskReportRoutes from './routes/admin_accidents_risk_report';
import adminAccidentsForecastRoutes from './routes/admin_accidents_forecast';
import adminAccidentsTrainingRoutes from './routes/admin_accidents_training';
import adminAccidentsTrainingRecordRoutes from './routes/admin_accidents_training_record';
import adminAccidentsPersonRoutes from './routes/admin_accidents_person';
import adminAccidentsDivisionRoutes from './routes/admin_accidents_division';
import adminAccidentsMaterialRoutes from './routes/admin_accidents_material';
import adminStudySessionsRoutes from './routes/admin_study_sessions';
import adminChoseiRoutes from './routes/admin_chosei';
import adminSignageRoutes from './routes/admin_signage';
import adminDaihonRoutes from './routes/admin_daihon';
import adminSrRoutes from './routes/admin_sr';
import requestsApi from './routes/api/requests';
import liffKanchoRoutes from './routes/liff_kancho';
import publicKanchoWishRoutes from './routes/public_kancho_wish';
import publicAccidentsMonitorRoutes from './routes/public_accidents_monitor';
import publicAccidentsUploadRoutes from './routes/public_accidents_upload';
import publicStudyNotesUploadRoutes from './routes/public_study_notes_upload';
import publicStudySessionsRoutes from './routes/public_study_sessions';
import publicChoseiRoutes from './routes/public_chosei';
import publicHiyariRoutes from './routes/public_hiyari';
import publicSignageRoutes from './routes/public_signage';
import type { Env } from './auth';
import { getSessionFromCookie, validateSession } from './auth';
import { isMaintenanceActive, isAdminAccount, maintenancePage, replyMaintenanceToLineEvent } from './utils/maintenance';
import { ADMIN_PATH, SECRET, SIGNAGE_PUBLIC_PATH } from './config';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

// 管理画面配下で認証・メンテナンス・権限チェックを免除してよいサブパス（login/logout/setupの本体のみ。
// 前方一致にすると "login-logs" のように "login" で始まる無関係なパスまで巻き込むため、必ずセグメント単位で判定する）
function isPublicAdminSubPath(subPath: string): boolean {
  return (
    subPath === '/login' || subPath.startsWith('/login/') ||
    subPath === '/login-bg.jpg' ||
    subPath === '/logout' || subPath.startsWith('/logout/') ||
    subPath === '/setup' || subPath.startsWith('/setup/')
  );
}

// =====================
// セキュリティミドルウェア
// =====================

// HTTP → HTTPS 強制リダイレクト（Cloudflare経由でHTTPが来た場合）
app.use('*', (c, next) => {
  const url = new URL(c.req.url);
  if (url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    url.protocol = 'https:';
    return c.redirect(url.toString(), 301);
  }
  return next();
});

// 日本国内限定アクセス
app.use('*', async (c, next) => {
  return requireJapan(c, next);
});

// セキュリティヘッダー
app.use('*', async (c, next) => {
  await next();
  const reqUrl = new URL(c.req.url);
  const pathname = reqUrl.pathname;
  const isLiff = pathname.startsWith('/liff');
  const isForm = pathname.startsWith('/form');
  const isNojicoPage = pathname === `/${SECRET}/admin/nojico`;
  // やることリスト: 引き継ぎシートのフローティングパネルにiframe埋め込みするため、
  // embed=1指定時のみ同一オリジンからのフレーム表示を許可する（他ページは引き続き全面禁止）
  const isTodoEmbed = pathname === `/${SECRET}/admin/todo` && reqUrl.searchParams.get('embed') === '1';
  // 事故防止AI: 引き継ぎシートのポップアップに課別傾向分析レポートをiframe埋め込みするため、
  // このレポートページのみ同一オリジンからのフレーム表示を許可する（他ページは引き続き全面禁止）
  const isAccidentAiEmbed = pathname.startsWith(`/${SECRET}/admin/accidents/division/`) && pathname.endsWith('/report/print');
  // 秋の全国交通安全運動 手札: 編集ページが印刷イメージを同一オリジンでiframeプレビュー表示するため、
  // この印刷ページのみ同一オリジンからのフレーム表示を許可する（他ページは引き続きDENY）
  const isAutumnTefudaPrint = pathname === `/${SECRET}/admin/kacho-mission/autumn-safety-tefuda/print`;
  // デジタルサイネージの編集ページが、投影プレビューを同一オリジンでiframe表示するため、
  // present ページのみフレーム表示を許可する（他ページは引き続きDENY）
  // デジタルサイネージの投影/印刷ページは Google Fonts（見出し用 Anton など）を読み込むため CSP を個別に緩める。
  // present は編集ページから同一オリジンで iframe プレビュー表示する
  const isSignageDeckPage = /^\/[^/]+\/admin\/signage\/\d+\/(present|print)$/.test(pathname);
  // 統合デジタルサイネージのログイン不要ページも Google Fonts（Anton など）を読み込むため CSP を同じく緩める
  const isSignagePublicPage = pathname === SIGNAGE_PUBLIC_PATH;
  // 乗務員証 証明写真: MediaPipe(WebAssembly)による顔検出とカメラ撮影のため、
  // このページのみ CSP に wasm-unsafe-eval / blob: を、Permissions-Policy にカメラ許可を追加する。
  const isIdPhotosPage = pathname === `/${SECRET}/admin/kacho-mission/id-photos`;
  const isWasmCameraPage = isIdPhotosPage;
  c.res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('Cache-Control', 'no-store');
  c.res.headers.set('Permissions-Policy',
    (isWasmCameraPage ? 'camera=(self)' : 'camera=()') + ', microphone=(), geolocation=(), payment=()');
  if (isWasmCameraPage) {
    c.res.headers.set('X-Frame-Options', 'DENY');
    c.res.headers.set('Referrer-Policy', 'no-referrer');
    c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    c.res.headers.set('Content-Security-Policy',
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval' https://cdn.jsdelivr.net https://static.cloudflareinsights.com blob:; " +
      "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; " +
      "connect-src 'self' https://cloudflareinsights.com https://cdn.jsdelivr.net blob: data:; " +
      "worker-src 'self' blob:; frame-ancestors 'none';"
    );
  } else if (isLiff) {
    // LIFF ページ: LINE SDKを許可、フレーム制限を緩和
    c.res.headers.set('Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.line-scdn.net; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://api.line.me https://liff.line.me;"
    );
  } else if (isForm) {
    // フォームページ: LINE外ブラウザでも開けるよう X-Frame-Options を外す
    c.res.headers.set('Referrer-Policy', 'no-referrer');
    c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    c.res.headers.set('Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';"
    );
  } else if (isSignageDeckPage || isSignagePublicPage) {
    // デジタルサイネージ投影/印刷・ログイン不要の固定URLページ: Google Fonts を許可。
    // present は編集ページから同一オリジンで iframe 表示する
    c.res.headers.set('X-Frame-Options', 'SAMEORIGIN');
    c.res.headers.set('Referrer-Policy', 'no-referrer');
    c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    c.res.headers.set('Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self';"
    );
  } else {
    // やることリスト・事故防止AIレポートのembedページのみ、引き継ぎシートのフローティングパネル/ポップアップから
    // 同一オリジンでiframe表示できるようフレーム制限を緩和する（他のadminページは従来通りDENY）
    const allowSameOriginFrame = isTodoEmbed || isAccidentAiEmbed || isAutumnTefudaPrint;
    c.res.headers.set('X-Frame-Options', allowSameOriginFrame ? 'SAMEORIGIN' : 'DENY');
    c.res.headers.set('Referrer-Policy', 'no-referrer');
    c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    // nojicoページのみ、アプリ内ブラウザとして外部サイト(app.no-jico.com)をiframe表示できるようframe-srcを追加で許可する
    const frameSrc = isNojicoPage ? ' frame-src https://app.no-jico.com;' : '';
    const frameAncestors = allowSameOriginFrame ? "frame-ancestors 'self';" : "frame-ancestors 'none';";
    c.res.headers.set('Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://cloudflareinsights.com https://cdn.jsdelivr.net; " + frameAncestors + frameSrc
    );
  }
});

// =====================
// メンテナンスモード
// ON中は admin アカウント以外の全アクセス（管理画面・API・LIFF・フォーム）に
// メンテナンス画面を返す。ログイン関連はメンテ中も通す（解除不能になるのを防ぐ）。
// LINE Webhook は署名検証後にメンテ中メッセージを返信する（下の専用ルート参照）。
// cron（定時通知）はHTTPを通らないためメンテ中も通常稼働。
// =====================
app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === '/' || path === '/robots.txt' || path === '/api/line/webhook') return next();
  if (path.startsWith(`/${SECRET}/admin`) && isPublicAdminSubPath(path.slice(`/${SECRET}/admin`.length) || '/')) return next();

  if (!(await isMaintenanceActive(c.env.DB))) return next();

  // admin アカウントのセッションのみ通常利用可
  const sessionId = getSessionFromCookie(c.req.header('Cookie') ?? null);
  if (sessionId) {
    const adminId = await validateSession(c.env.DB, sessionId);
    if (adminId && (await isAdminAccount(c.env.DB, adminId))) return next();
  }

  if (path.startsWith('/api/') || /\/api\//.test(path)) {
    return c.json({ error: 'ただいまメンテナンス中です。しばらくお待ちください。', maintenance: true }, 503);
  }
  return c.html(maintenancePage(), 503);
});

// robots.txt
app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /\n'));

// =====================
// 管理者画面ルーティング
// 秘密パス配下のみ許可。login・logout・setup は認証不要
// =====================
app.use(`/${SECRET}/admin/*`, async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const subPath = path.slice(`/${SECRET}/admin`.length) || '/';
  if (isPublicAdminSubPath(subPath)) return next();
  return requireAuth(c, next);
});

// アカウント別ページ権限（admins.permissions が NULL のアカウントは全ページ可）
app.use(`/${SECRET}/admin/*`, async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const subPath = path.slice(`/${SECRET}/admin`.length) || '/';
  if (isPublicAdminSubPath(subPath)) return next();
  // リミット機能のグローバル通知は所属課だけで判定するため、ページ権限(handover等)の有無に関わらず全アカウントが利用できる
  if (subPath.startsWith('/api/limits/')) return next();
  // メーター検査・車検の大画面アラートも同様に、ページ権限(inspection)の有無に関わらず所属課だけで判定する
  if (subPath.startsWith('/api/vehicle-deadlines/alerts/')) return next();
  // 班長個人別確認: 書き込み(その他メモ保存)も含めて閲覧権限(kancho-shift)だけで利用可能にする
  // （<key>.edit を要求する既定ルールを外し、ルート側で kancho-shift の有無だけをチェックする）
  if (subPath.startsWith('/api/kancho-personal/')) return next();

  const adminId = c.get('adminId');
  const perms = adminId ? await getAdminPermissions(c.env.DB, adminId) : null;
  if (!perms) return next(); // 全権限アカウント

  // nojico: 外部サイトをアプリ内ブラウザで開くだけのページ。ページ権限は使わず全アカウント共通でアクセス可
  const isNojico = subPath.startsWith('/nojico');

  // 「以前は全アカウント共通で表示」だった機能に、アカウント別の閲覧ON/OFFキーを付与（migration_140）。
  //   キーを持っていれば従来どおり通す（編集の可否は各ルートが requireEdit / requireFull / 専用パスワード で判定）。
  //   キーが無ければ 403。既存の制限付きアカウントには migration_140 で5キーを追記済み。
  const commonFeatureKey =
    (subPath.startsWith('/benri')   || subPath.startsWith('/api/benri'))   ? 'benri'   :
    (subPath.startsWith('/garage')  || subPath.startsWith('/api/garage'))  ? 'garage'  :
    (subPath.startsWith('/shuttle') || subPath.startsWith('/api/shuttle')) ? 'shuttle' :
    (subPath.startsWith('/signage') || subPath.startsWith('/api/signage')) ? 'signage' :
    (subPath.startsWith('/cc-list') || subPath.startsWith('/api/cc-list')) ? 'cc-list' :
    null;

  const deny403 = () => {
    if (subPath.startsWith('/api/')) {
      return c.json({ error: 'この操作を行う権限がありません' }, 403);
    }
    return c.html(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>アクセス権限がありません</title>
    <style>body{font-family:'Hiragino Sans','Meiryo',sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.box{background:#fff;padding:2rem;border-radius:.75rem;box-shadow:0 1px 3px rgba(0,0,0,.1);text-align:center}h1{font-size:1.05rem;margin:0 0 .5rem}p{font-size:.85rem;color:#6b7280;margin:0 0 1rem}a{display:inline-block;background:#2563eb;color:#fff;border-radius:.25rem;padding:.5rem 1.25rem;font-size:.85rem;text-decoration:none}</style></head>
    <body><div class="box"><h1>アクセス権限がありません</h1><p>このページを表示する権限がこのアカウントにはありません。</p><a href="${ADMIN_PATH}">ホームに戻る</a></div></body></html>`, 403);
  };

  if (commonFeatureKey !== null) {
    if (!perms.includes(commonFeatureKey)) return deny403();
    // キーあり: 権限チェック通過（編集可否はルート側で判定）
  } else if (!isNojico && !isPathAllowed(perms, subPath, c.req.method)) {
    return deny403();
  }

  await next();
  // メニュー・設定カードから権限のない項目を除去
  const contentType = c.res.headers.get('Content-Type') ?? '';
  if (contentType.includes('text/html')) {
    c.res = filterHtmlByPermissions(c.res, perms);
  }
});

// 管理者画面（秘密パス配下にマウント）
app.route(`/${SECRET}/admin`, adminRoutes);
app.route(`/${SECRET}/admin`, adminExtraRoutes);
app.route(`/${SECRET}/admin`, adminStaffRoutes);
app.route(`/${SECRET}/admin`, adminSalesAiRoutes);
app.route(`/${SECRET}/admin`, adminFareRevisionRoutes);
app.route(`/${SECRET}/admin`, adminPeriodComparisonRoutes);
app.route(`/${SECRET}/admin`, adminWageSettingsRoutes);
app.route(`/${SECRET}/admin`, adminDrivingRiskSettingsRoutes);
app.route(`/${SECRET}/admin`, adminCrewPortalRoutes);
app.route(`/${SECRET}/admin`, adminLiffRoutes);
app.route(`/${SECRET}/admin`, adminLineUsageRoutes);
app.route(`/${SECRET}/admin`, adminPresentationRoutes);
app.route(`/${SECRET}/admin`, adminInspectionRoutes);
app.route(`/${SECRET}/admin`, adminVehicleDeadlinesRoutes);
app.route(`/${SECRET}/admin`, adminDocumentsRoutes);
app.route(`/${SECRET}/admin`, adminStudyNotesRoutes);
app.route(`/${SECRET}/admin`, adminKachoMissionRoutes);
app.route(`/${SECRET}/admin`, adminKachoHiyariRoutes);
app.route(`/${SECRET}/admin`, adminSummerSafety2026Routes);
app.route(`/${SECRET}/admin`, adminKanchoRoutes);
app.route(`/${SECRET}/admin`, adminKanchoWishRoutes);
app.route(`/${SECRET}/admin`, adminKanchoRosterRoutes);
app.route(`/${SECRET}/admin`, adminKanchoPersonalRoutes);
app.route(`/${SECRET}/admin`, adminKanchoLogicRoutes);
app.route(`/${SECRET}/admin`, adminKanriKoboRoutes);
app.route(`/${SECRET}/admin`, adminAccountsRoutes);
app.route(`/${SECRET}/admin`, adminDiaRoutes);
app.route(`/${SECRET}/admin`, adminTantoshaRoutes);
app.route(`/${SECRET}/admin`, adminTodoRoutes);
app.route(`/${SECRET}/admin`, adminCrewShiftRoutes);
app.route(`/${SECRET}/admin`, adminAttendanceBoardRoutes);
app.route(`/${SECRET}/admin`, adminDispatchRoutes);
app.route(`/${SECRET}/admin`, adminSrRoutes);
app.route(`/${SECRET}/admin`, adminHandoverRoutes);
app.route(`/${SECRET}/admin`, adminHandoverLimitsRoutes);
app.route(`/${SECRET}/admin`, adminAnnouncementBarRoutes);
app.route(`/${SECRET}/admin`, adminBirthdayRoutes);
app.route(`/${SECRET}/admin`, adminRequestsRoutes);
app.route(`/${SECRET}/admin`, adminCcListRoutes);
app.route(`/${SECRET}/admin`, adminBenriRoutes);
app.route(`/${SECRET}/admin`, adminAirportRoutes);
app.route(`/${SECRET}/admin`, adminNojicoRoutes);
app.route(`/${SECRET}/admin`, adminGarageRoutes);
app.route(`/${SECRET}/admin`, adminShuttleRoutes);
app.route(`/${SECRET}/admin`, adminDriverReportsRoutes);
app.route(`/${SECRET}/admin`, adminAccidentsRoutes);
app.route(`/${SECRET}/admin`, adminAccidentsAnalysisRoutes);
app.route(`/${SECRET}/admin`, adminAccidentsRiskRoutes);
app.route(`/${SECRET}/admin`, adminAccidentsRiskReportRoutes);
app.route(`/${SECRET}/admin`, adminAccidentsForecastRoutes);
app.route(`/${SECRET}/admin`, adminAccidentsTrainingRoutes);
app.route(`/${SECRET}/admin`, adminAccidentsTrainingRecordRoutes);
app.route(`/${SECRET}/admin`, adminAccidentsPersonRoutes);
app.route(`/${SECRET}/admin`, adminAccidentsDivisionRoutes);
app.route(`/${SECRET}/admin`, adminAccidentsMaterialRoutes);
app.route(`/${SECRET}/admin`, adminStudySessionsRoutes);
app.route(`/${SECRET}/admin`, adminChoseiRoutes);
app.route(`/${SECRET}/admin`, adminSignageRoutes);
app.route(`/${SECRET}/admin`, adminDaihonRoutes);

// =====================
// API（認証必須）
// LINE Webhook は除外（後で定義）
// =====================
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === '/api/line/webhook') return next(); // Webhook は署名検証
  if (path.startsWith('/api/liff/')) return next(); // LIFF API は LINE UID検証
  if (path.startsWith('/api/public/')) return next(); // 完全公開API（希望休フォーム等・書き込み範囲は各ルート側で厳しく限定）
  return requireAuth(c, next);
});

// アカウント別権限: 制限付きアカウントのルートAPIへの書き込みにはページ権限（<key>.edit）が必要
app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === '/api/line/webhook') return next();
  if (path.startsWith('/api/liff/')) return next();
  if (path.startsWith('/api/public/')) return next();
  // Web内お知らせ（ベルマーク）の既読化は個人の閲覧状態にすぎず、ページ権限に関わらず全アカウントが利用できる
  if (path.startsWith('/api/announcements/web/')) return next();
  // アナウンスバーの表示・一時非表示も同様に、管理側の権限(settings.announcement-bar)に関わらず全アカウントが利用できる
  if (path.startsWith('/api/announcement-bar/')) return next();

  const adminId = c.get('adminId');
  const perms = adminId ? await getAdminPermissions(c.env.DB, adminId) : null;
  if (perms && !isRootApiWriteAllowed(perms, path, c.req.method)) {
    return c.json({ error: 'この操作を行う権限がありません' }, 403);
  }
  return next();
});

app.route('/api/shift', shiftApi);
app.route('/api/instructor-schedule', instructorApi);
app.route('/api/employees', employeesApi);
app.route('/api/employees/retiree-pdf', retireePdfApi);
app.route('/api/sales-ai', salesAiApi);
app.route('/api/fare-revision', fareRevisionApi);
app.route('/api/period-comparison', periodComparisonApi);
app.route('/api/sales', salesApi);
app.route('/api/info', infoApi);
app.route('/api/line', lineApiRoutes);
app.route('/api/announcements/web', announcementsWebApi);
app.route('/api/announcement-bar', announcementBarPublicApi);
app.route('/api/birthday', birthdayPublicApi);
app.route('/api/schedule-types', scheduleTypesApi);
app.route('/api/interviews', interviewsApi);
app.route('/api/coaches', coachesApi);
app.route('/api/instructors', instructorsApi);
app.route('/api/period-settings', periodSettingsApi);
app.route('/api/wage-estimate-settings', wageEstimateSettingsApi);
app.route('/api/driving-risk-settings', drivingRiskSettingsApi);
app.route('/api/notifications', notificationsApi);
app.route('/api/instructor-invite', instructorInviteApi);
app.route('/api/line-reg', lineRegApi);
app.route('/api/inspection', inspectionApi);
app.route('/api/dia', diaApi);
app.route('/api/documents', documentsApi);
app.route('/api/study-notes', studyNotesApi);
app.route('/api/kacho-mission', kachoMissionApi);
app.route('/api/requests', requestsApi);

// =====================
// LINE Webhook（署名検証あり・認証不要）
// =====================
app.post('/api/line/webhook', async (c) => {
  const channelSecret = c.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) return c.text('LINE未設定', 500);

  const signature = c.req.header('x-line-signature');
  if (!signature) return c.text('Unauthorized', 401);

  const body = await c.req.text();

  // 署名検証
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(channelSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const expectedSig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  if (signature !== expectedSig) return c.text('Invalid signature', 401);

  const events: Record<string, unknown>[] = JSON.parse(body)?.events ?? [];

  // メンテナンス中はBot処理を止め、メンテ中メッセージのみ返信する
  if (await isMaintenanceActive(c.env.DB)) {
    c.executionCtx.waitUntil(
      Promise.all(events.map(event => replyMaintenanceToLineEvent(c.env, event)))
    );
    return c.text('OK');
  }

  c.executionCtx.waitUntil(
    Promise.all(events.map(event => handleLineEvent(c.env, event)))
  );

  return c.text('OK');
});

// LIFF ページ（認証不要・公開）
app.route('', liffRoutes);
app.route('', liffSalesRoutes);
app.route('', liffRegisterRoutes);
app.route('', liffKanchoRoutes);

// 完全公開ページ（ログイン不要・LINEログインも不要）
app.route('', publicKanchoWishRoutes);
app.route('', publicAccidentsMonitorRoutes);
app.route('', publicAccidentsUploadRoutes);
app.route('', publicStudyNotesUploadRoutes);
app.route('', publicStudySessionsRoutes);
app.route('', publicChoseiRoutes);
app.route('', publicHiyariRoutes);
app.route('', publicSignageRoutes);

// ルートは秘密パスへリダイレクト
app.get('/', (c) => c.redirect(`${ADMIN_PATH}/login`));

export default {
  fetch: app.fetch.bind(app),
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleCron(env));
  }
};
