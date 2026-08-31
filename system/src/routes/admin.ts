import { Hono } from 'hono';
import {
  verifyPassword, hashPassword, createSession, deleteSession,
  isLockedOut, recordFailedLogin, getSessionFromCookie,
  getShiftDisplayRange, getPeriodRange, getPeriodSettings,
} from '../auth';
import { layout, loginPage, loginSelectPage, escHtml, formatJst, type LoginMode } from '../html/layout';
import { shiftPage } from '../html/shift';
import type { Env } from '../auth';
import type {
  Employee, ShiftEntry, Instructor, InstructorSchedule, ScheduleType, Coach
} from '../html/shift';
import { ADMIN_PATH, MONITOR_ACCIDENTS_PATH, MONITOR_NEWCOMERS_PATH } from '../config';
import qrcode from 'qrcode-generator';
import {
  getMaintenanceMode, setMaintenanceMode, isAdminAccount,
  getMaintenanceSchedule, setMaintenanceSchedule, isWithinSchedule, isMaintenanceActive,
} from '../utils/maintenance';
import { triggerAccidentsMonitorForceRefresh, getMonitorDisplaySettings, saveMonitorDisplaySettings, type MonitorDisplayMode } from './public_accidents_monitor';
import { agoLabel } from './admin_line_usage';
import { bucketCoarseBands, COARSE_BAND_LABELS } from '../html/accidents';
import { LOGIN_BG_JPEG_BASE64 } from '../assets/login_bg';
import { getAdminPermissions } from '../permissions';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

// ===== ログイン背景画像（ブラウザキャッシュさせるため別ルートで配信） =====
app.get('/login-bg.jpg', (c) => {
  const bytes = Uint8Array.from(atob(LOGIN_BG_JPEG_BASE64), (ch) => ch.charCodeAt(0));
  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
});

// ===== ログイン =====
function getLoginMode(cookieHeader: string | null): LoginMode | null {
  const m = (cookieHeader ?? '').match(/login_mode=(pc|sp)/);
  return (m?.[1] as LoginMode) ?? null;
}

app.get('/login', (c) => {
  const cookie = c.req.header('Cookie') ?? null;
  const sid = getSessionFromCookie(cookie);
  if (sid) return c.redirect(ADMIN_PATH);

  // 表示切替のやり直し要求 → 選択画面へ
  if (c.req.query('reset') === '1') {
    const res = c.html(loginSelectPage());
    res.headers.append('Set-Cookie', 'login_mode=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return res;
  }

  const queryMode = c.req.query('mode');
  const mode: LoginMode | null =
    queryMode === 'pc' || queryMode === 'sp' ? queryMode : getLoginMode(cookie);

  if (!mode) {
    return c.html(loginSelectPage());
  }

  // CSRFトークン生成
  const csrfToken = crypto.randomUUID();
  const res = c.html(loginPage(mode, '', csrfToken));
  res.headers.append('Set-Cookie', `csrf_login=${csrfToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`);
  if (queryMode === 'pc' || queryMode === 'sp') {
    res.headers.append('Set-Cookie', `login_mode=${mode}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=15552000`);
  }
  return res;
});

app.post('/login', async (c) => {
  const ip = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown';
  const mode: LoginMode = getLoginMode(c.req.header('Cookie') ?? null) ?? 'pc';

  if (await isLockedOut(c.env.DB, ip)) {
    return c.html(loginPage(mode, 'しばらく時間をおいてから再試行してください。', ''));
  }

  // 空ボディ・不正コンテンツタイプは400で返す（500を防ぐ）
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.html(loginPage(mode, '不正なリクエストです。', ''), 400);
  }

  const username = form.get('username')?.toString() ?? '';
  const password = form.get('password')?.toString() ?? '';
  const csrfForm = form.get('csrf_token')?.toString() ?? '';

  // CSRFトークン検証
  const cookies = c.req.header('Cookie') ?? '';
  const csrfCookie = cookies.match(/csrf_login=([a-f0-9-]+)/)?.[1] ?? '';
  if (!csrfForm || !csrfCookie || csrfForm !== csrfCookie) {
    const newToken = crypto.randomUUID();
    const res = c.html(loginPage(mode, 'セッションが無効です。再度お試しください。', newToken), 403);
    res.headers.append('Set-Cookie', `csrf_login=${newToken}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600`);
    return res;
  }

  if (!username || !password) {
    return c.html(loginPage(mode, 'ユーザー名とパスワードを入力してください。', csrfForm), 400);
  }

  const admin = await c.env.DB.prepare(
    'SELECT id, password FROM admins WHERE username = ?'
  ).bind(username).first<{ id: number; password: string }>();

  if (!admin || !(await verifyPassword(password, admin.password))) {
    await recordFailedLogin(c.env.DB, ip);
    return c.html(loginPage(mode, 'ユーザー名またはパスワードが正しくありません。', ''));
  }

  const sessionId = await createSession(c.env.DB, admin.id);

  // ログイン情報を記録
  const cf = (c.req.raw as any).cf ?? {};
  await c.env.DB.prepare(
    'INSERT INTO login_logs (ip, country, city, latitude, longitude, timezone, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    c.req.header('CF-Connecting-IP') ?? ip,
    cf.country ?? c.req.header('CF-IPCountry') ?? null,
    cf.city ?? null,
    cf.latitude ? String(cf.latitude) : null,
    cf.longitude ? String(cf.longitude) : null,
    cf.timezone ?? null,
    c.req.header('User-Agent') ?? null
  ).run();

  const res = c.redirect(ADMIN_PATH);
  res.headers.set('Set-Cookie',
    `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
  );
  return res;
});

// ===== ログアウト =====
// GETだと単なるリンク・プリフェッチ・クローラ巡回でもログアウトが発火してしまうためPOST限定にしている
app.post('/logout', async (c) => {
  const cookie = c.req.header('Cookie') ?? null;
  const sid = getSessionFromCookie(cookie);
  if (sid) await deleteSession(c.env.DB, sid);
  const res = c.redirect(`${ADMIN_PATH}/login`);
  res.headers.set('Set-Cookie', 'session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0');
  return res;
});

// ===== 管理者パスワード初期設定エンドポイント（初回のみ） =====
app.get('/setup', async (c) => {
  const setupKey = c.env.SETUP_KEY;
  if (!setupKey) return c.text('SETUP_KEY が設定されていません。wrangler.toml を確認してください。', 403);
  const key = c.req.query('key');
  if (key !== setupKey) return c.text('Access denied', 403);

  // 既にパスワード設定済みの場合は使用不可
  const admin = await c.env.DB.prepare(
    'SELECT password FROM admins WHERE username = ?'
  ).bind('admin').first<{ password: string }>();
  if (admin && admin.password !== 'CHANGE_ME_PLACEHOLDER') {
    return c.text('セットアップは既に完了しています。ログイン画面からログインしてください。', 403);
  }

  return c.html(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>初期設定</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Hiragino Sans','Meiryo',sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh}.box{background:#fff;padding:2rem;border-radius:.75rem;box-shadow:0 1px 3px rgba(0,0,0,.1);width:20rem}h1{font-size:1.1rem;font-weight:700;margin-bottom:1rem}p{font-size:.875rem;color:#6b7280;margin-bottom:1rem}input{width:100%;border:1px solid #e5e7eb;border-radius:.25rem;padding:.5rem .75rem;margin-bottom:.75rem;font-size:.875rem}button,a{display:block;width:100%;background:#2563eb;color:#fff;border:none;border-radius:.25rem;padding:.5rem;font-size:.875rem;text-align:center;cursor:pointer;text-decoration:none}</style></head>
  <body><div class="box">
    <h1>管理者パスワード設定</h1>
    <p>8文字以上のパスワードを設定してください。</p>
    <form method="POST" action="${ADMIN_PATH}/setup?key=${escHtml(setupKey)}">
      <input type="password" name="password" placeholder="新しいパスワード（8文字以上）" required minlength="8">
      <button type="submit">設定する</button>
    </form>
  </div></body></html>`);
});

app.post('/setup', async (c) => {
  const setupKey = c.env.SETUP_KEY;
  if (!setupKey) return c.text('SETUP_KEY が設定されていません。', 403);
  const key = c.req.query('key');
  if (key !== setupKey) return c.text('Access denied', 403);

  // 既にパスワード設定済みの場合は使用不可
  const admin = await c.env.DB.prepare(
    'SELECT password FROM admins WHERE username = ?'
  ).bind('admin').first<{ password: string }>();
  if (admin && admin.password !== 'CHANGE_ME_PLACEHOLDER') {
    return c.text('セットアップは既に完了しています。', 403);
  }

  const form = await c.req.formData();
  const password = form.get('password')?.toString() ?? '';
  if (password.length < 8) return c.text('パスワードは8文字以上にしてください', 400);
  const hash = await hashPassword(password);
  await c.env.DB.prepare(
    'UPDATE admins SET password = ? WHERE username = ?'
  ).bind(hash, 'admin').run();
  return c.html(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>設定完了</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Hiragino Sans','Meiryo',sans-serif;background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh}.box{background:#fff;padding:2rem;border-radius:.75rem;box-shadow:0 1px 3px rgba(0,0,0,.1);width:20rem;text-align:center}.emo{font-size:2.25rem;margin-bottom:1rem}h1{font-size:1.1rem;font-weight:700;margin-bottom:.5rem}p{font-size:.875rem;color:#6b7280;margin-bottom:1rem}a{display:block;background:#2563eb;color:#fff;border-radius:.25rem;padding:.5rem;font-size:.875rem;text-align:center;text-decoration:none}</style></head>
  <body><div class="box">
    <div class="emo">✅</div>
    <h1>パスワード設定完了</h1>
    <p>ログイン画面からログインしてください。</p>
    <a href="${ADMIN_PATH}/login">ログイン画面へ</a>
  </div></body></html>`);
});

// ===== ダッシュボード =====
app.get('/', async (c) => {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = jstNow.toISOString().split('T')[0];

  // 直近6ヶ月の "YYYY-MM" リスト（分析グラフ用）
  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() - i, 1));
    months.push(d.toISOString().slice(0, 7));
  }
  const sinceMonth = `${months[0]}-01`;
  const curY = jstNow.getUTCFullYear();
  const curM = jstNow.getUTCMonth() + 1;
  const prevY = curM === 1 ? curY - 1 : curY;
  const prevM = curM === 1 ? 12 : curM - 1;

  // ===== ダッシュボード表示用データを一括取得 =====
  // 互いに依存しない17クエリを単一のPromise.allにまとめ、D1への往復を1回に集約する
  // （旧実装は Promise.all を2回 + 個別await5回に分かれており、直列の往復が発生していた）
  const selfAdminId = c.get('adminId');
  const [
    empStats, overdueInterviews, openReports, lastLogin,
    hireTrend, reportTrend, divisionComp, salesStats, lineUsage,
    overdueList, selfAdmin, maintenanceOn, dbHealthOk,
    accidentTimes, prevAccidentCount,
  ] = await Promise.all([
    c.env.DB.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN (status IS NULL OR status != 'completed') THEN 1 ELSE 0 END) AS training_count,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS regular_count
      FROM employees WHERE is_active = 1
    `).first<{ total: number; training_count: number; regular_count: number }>(),
    c.env.DB.prepare(`
      SELECT COUNT(DISTINCT emp_id) as cnt FROM interview_records
      WHERE next_interview_date < ? AND next_interview_date != ''
        AND emp_id NOT IN (
          SELECT emp_id FROM interview_records WHERE interview_date >= ?
        )
    `).bind(today, today).first<{ cnt: number }>(),
    c.env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM lost_item_reports WHERE status != 'resolved') AS lost,
        (SELECT COUNT(*) FROM accident_reports WHERE status != 'resolved') AS accident,
        (SELECT COUNT(*) FROM violation_reports WHERE status != 'resolved') AS violation,
        (SELECT COUNT(*) FROM general_reports WHERE status != 'resolved') AS general
    `).first<{ lost: number; accident: number; violation: number; general: number }>().catch(() => null),
    c.env.DB.prepare('SELECT * FROM login_logs ORDER BY logged_at DESC LIMIT 5').all<{
      id: number; ip: string; country: string; city: string;
      latitude: string; longitude: string; user_agent: string; logged_at: string;
    }>(),
    // 入社人数の推移（退職者含む・hire_date基準）
    c.env.DB.prepare(`
      SELECT substr(hire_date, 1, 7) AS ym, COUNT(*) AS cnt
      FROM employees
      WHERE hire_date >= ? AND hire_date != ''
      GROUP BY ym
    `).bind(sinceMonth).all<{ ym: string; cnt: number }>().catch(() => null),
    // 報告件数の推移（忘れ物・事故・違反・一般の合算）
    c.env.DB.prepare(`
      SELECT ym, SUM(cnt) AS cnt FROM (
        SELECT substr(created_at, 1, 7) AS ym, COUNT(*) AS cnt FROM lost_item_reports  WHERE created_at >= ? GROUP BY 1
        UNION ALL SELECT substr(created_at, 1, 7), COUNT(*) FROM accident_reports   WHERE created_at >= ? GROUP BY 1
        UNION ALL SELECT substr(created_at, 1, 7), COUNT(*) FROM violation_reports  WHERE created_at >= ? GROUP BY 1
        UNION ALL SELECT substr(created_at, 1, 7), COUNT(*) FROM general_reports    WHERE created_at >= ? GROUP BY 1
      ) GROUP BY ym
    `).bind(sinceMonth, sinceMonth, sinceMonth, sinceMonth)
      .all<{ ym: string; cnt: number }>().catch(() => null),
    // 課別の在籍構成
    c.env.DB.prepare(`
      SELECT division, COUNT(*) AS cnt FROM employees
      WHERE is_active = 1 GROUP BY division ORDER BY division
    `).all<{ division: number | null; cnt: number }>().catch(() => null),
    // 売上（今月度・前月度）
    c.env.DB.prepare(`
      SELECT period_year AS y, period_month AS m,
             SUM(amount) AS total, COUNT(DISTINCT emp_id) AS people
      FROM sales_records
      WHERE (period_year = ? AND period_month = ?) OR (period_year = ? AND period_month = ?)
      GROUP BY y, m
    `).bind(curY, curM, prevY, prevM)
      .all<{ y: number; m: number; total: number; people: number }>().catch(() => null),
    // LINE利用（本日・直近7日）
    c.env.DB.prepare(`
      SELECT
        SUM(CASE WHEN date(created_at) = date('now','localtime') THEN 1 ELSE 0 END) AS today_cnt,
        SUM(CASE WHEN created_at >= datetime('now','localtime','-7 days') THEN 1 ELSE 0 END) AS week_cnt,
        COUNT(DISTINCT CASE WHEN created_at >= datetime('now','localtime','-7 days') THEN line_uid END) AS week_users
      FROM line_activity_logs
    `).first<{ today_cnt: number; week_cnt: number; week_users: number }>().catch(() => null),
    c.env.DB.prepare(`
      SELECT e.id, e.name, e.emp_no, e.division, e.team,
        ir.next_interview_date,
        MAX(ir.interview_date) as last_interview
      FROM interview_records ir
      JOIN employees e ON ir.emp_id = e.id
      WHERE ir.next_interview_date < ? AND ir.next_interview_date != ''
        AND ir.emp_id NOT IN (
          SELECT emp_id FROM interview_records WHERE interview_date >= ?
        )
      GROUP BY ir.emp_id
      ORDER BY ir.next_interview_date
      LIMIT 8
    `).bind(today, today).all<{
      id: number; name: string; emp_no: string; division: number; team: number;
      next_interview_date: string; last_interview: string;
    }>(),
    selfAdminId
      ? c.env.DB.prepare('SELECT username, permissions FROM admins WHERE id = ?')
          .bind(selfAdminId).first<{ username: string; permissions: string | null }>()
      : Promise.resolve(null),
    isMaintenanceActive(c.env.DB).catch(() => false),
    c.env.DB.prepare('SELECT 1').first().then(() => true).catch(() => false),
    // 今月の事故（件数・時間帯）
    c.env.DB.prepare(`SELECT occurred_time FROM accident_records WHERE substr(occurred_date, 1, 7) = ?`)
      .bind(`${curY}-${String(curM).padStart(2, '0')}`).all<{ occurred_time: string | null }>().catch(() => null),
    c.env.DB.prepare(`SELECT COUNT(*) AS cnt FROM accident_records WHERE substr(occurred_date, 1, 7) = ?`)
      .bind(`${prevY}-${String(prevM).padStart(2, '0')}`).first<{ cnt: number }>().catch(() => null),
  ]);
  const empCount     = { cnt: empStats?.total         ?? 0 };
  const trainingCount = { cnt: empStats?.training_count ?? 0 };
  const regularCount  = { cnt: empStats?.regular_count  ?? 0 };

  const statusCheckedAt = jstNow.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });

  const openReportTotal = (openReports?.lost ?? 0) + (openReports?.accident ?? 0) + (openReports?.violation ?? 0) + (openReports?.general ?? 0);
  const statCards = [
    { label: '面談期限超過',     value: overdueInterviews?.cnt ?? 0, sub: '次回予定日を過ぎた社員',
      color: (overdueInterviews?.cnt ?? 0) > 0 ? '#b45309' : '#1a3a5c', href: `${ADMIN_PATH}/interviews` },
    { label: '対応中の現場報告', value: openReportTotal,
      sub: `忘れ物 ${openReports?.lost ?? 0} / 事故 ${openReports?.accident ?? 0} / 違反 ${openReports?.violation ?? 0} / 一般 ${openReports?.general ?? 0}`,
      color: openReportTotal > 0 ? '#b91c1c' : '#1a3a5c',
      href: `${ADMIN_PATH}/settings/reports` },
  ].map((s: { label: string; value: number; sub: string; color: string; href?: string }) => {
    const inner = `
      <div class="hm-stat-label">${escHtml(s.label)}</div>
      <div class="hm-stat-value" style="color:${s.color};">${s.value}</div>
      <div class="hm-stat-sub">${escHtml(s.sub)}</div>`;
    return s.href
      ? `<a href="${s.href}" class="hm-stat">${inner}</a>`
      : `<div class="hm-stat">${inner}</div>`;
  }).join('');

  // ===== 上部の指針（標語）=====
  // 設定画面からの入力は不可。定期的にここを直接書き換える運用。
  const HOME_MOTTO = '現状維持は、後退';

  // ===== よく使う操作（権限フィルタ: data-nav-id / data-perm-key で自動非表示）=====
  // サイドバーと重複するため、利用頻度の高い項目だけに絞る
  const quickLinks = [
    { href: `${ADMIN_PATH}/staff`,            nav: 'staff',         label: '社員管理' },
    { href: `${ADMIN_PATH}/vehicles`,         nav: 'vehicles',      label: '車両検索' },
    { href: `${ADMIN_PATH}/shift`,            nav: 'shift',         label: '新人シフト管理' },
  ];
  const quickHtml = quickLinks.map(q =>
    `<a href="${q.href}" data-nav-id="${q.nav}" class="hm-quick">${escHtml(q.label)}</a>`
  ).join('') +
    `<a href="${ADMIN_PATH}/settings/reports" data-perm-key="settings.lost-items settings.accidents settings.violations settings.general-reports settings.handover-memos" class="hm-quick">報告センター</a>`;

  // ===== 分析グラフ（縦棒: 直近6ヶ月） =====
  const monthLabel = (ym: string) => `${parseInt(ym.slice(5, 7))}月`;
  const toSeries = (rows: Array<{ ym: string; cnt: number }> | undefined) => {
    const map = new Map((rows ?? []).map(r => [r.ym, r.cnt]));
    return months.map(ym => ({ label: monthLabel(ym), value: map.get(ym) ?? 0 }));
  };
  const barChart = (data: Array<{ label: string; value: number }>, color: string) => {
    const max = Math.max(...data.map(d => d.value), 1);
    return `<div class="hm-bars">` + data.map(d => `
      <div class="hm-bar-col">
        <div class="hm-bar-val">${d.value > 0 ? d.value : ''}</div>
        <div class="hm-bar" style="height:${d.value > 0 ? Math.max(Math.round(d.value / max * 74), 5) : 2}px;background:${color};"></div>
        <div class="hm-bar-lb">${escHtml(d.label)}</div>
      </div>`).join('') + `</div>`;
  };
  const hireSeries   = toSeries(hireTrend?.results);
  const reportSeries = toSeries(reportTrend?.results);
  const hireTotal6   = hireSeries.reduce((a, b) => a + b.value, 0);
  const reportTotal6 = reportSeries.reduce((a, b) => a + b.value, 0);

  // 課別構成（横棒）
  const divRows = divisionComp?.results ?? [];
  const divMax = Math.max(...divRows.map(r => r.cnt), 1);
  const divisionHtml = divRows.length === 0
    ? '<div class="hm-empty">データなし</div>'
    : divRows.map(r => `
      <div class="hm-div-row">
        <span class="hm-div-name">${r.division != null ? `${r.division}課` : '未配属'}</span>
        <div class="hm-div-track"><div class="hm-div-fill" style="width:${Math.round(r.cnt / divMax * 100)}%;"></div></div>
        <span class="hm-div-cnt">${r.cnt}名</span>
      </div>`).join('');

  // 売上サマリー（今月度 vs 前月度）
  const salesRows = salesStats?.results ?? [];
  const curSales  = salesRows.find(r => r.y === curY && r.m === curM);
  const prevSales = salesRows.find(r => r.y === prevY && r.m === prevM);
  const salesDiffHtml = (() => {
    if (!curSales || !prevSales || !prevSales.total) return '<span class="hm-kpi-note">前月比 —</span>';
    const pct = Math.round((curSales.total / prevSales.total - 1) * 1000) / 10;
    const up = pct >= 0;
    return `<span class="hm-kpi-note" style="color:${up ? '#16a34a' : '#b91c1c'};font-weight:700;">前月比 ${up ? '+' : ''}${pct}%</span>`;
  })();
  const salesCardHtml = `
    <a href="${ADMIN_PATH}/staff" data-nav-id="staff" class="hm-card hm-card-link">
      <div class="hm-card-head"><span class="hm-card-title">今月度の売上</span><span class="hm-card-sub">${curM}月度</span></div>
      <div class="hm-card-body">
        <div class="hm-kpi-main">${curSales ? '¥' + curSales.total.toLocaleString('ja-JP') : '記録なし'}</div>
        <div class="hm-kpi-row">
          ${salesDiffHtml}
          <span class="hm-kpi-note">記録 ${curSales?.people ?? 0}名</span>
          <span class="hm-kpi-note">前月 ${prevSales ? '¥' + prevSales.total.toLocaleString('ja-JP') : '—'}</span>
        </div>
      </div>
    </a>`;

  // LINE利用サマリー
  const lineCardHtml = `
    <div class="hm-card">
      <div class="hm-card-head"><span class="hm-card-title">LINE利用状況</span><span class="hm-card-sub">Bot・LIFF操作</span></div>
      <div class="hm-card-body">
        <div class="hm-kpi-main">${lineUsage?.today_cnt ?? 0}<span class="hm-kpi-unit">件 / 本日</span></div>
        <div class="hm-kpi-row">
          <span class="hm-kpi-note">直近7日 ${lineUsage?.week_cnt ?? 0}件</span>
          <span class="hm-kpi-note">利用者 ${lineUsage?.week_users ?? 0}名</span>
        </div>
      </div>
    </div>`;

  // 今月の事故（件数・時間帯） — 「無事故キロ数」は見る人が少ないため、代わりに件数・時間帯を常時表示する
  const accidentCount = (accidentTimes?.results ?? []).length;
  const accidentDiffHtml = (() => {
    const prevCnt = prevAccidentCount?.cnt;
    if (prevCnt === undefined || prevCnt === null) return '<span class="hm-kpi-note">前月比 —</span>';
    const diff = accidentCount - prevCnt;
    if (diff === 0) return `<span class="hm-kpi-note">前月比 ±0（前月 ${prevCnt}件）</span>`;
    const up = diff > 0;
    return `<span class="hm-kpi-note" style="color:${up ? '#b91c1c' : '#16a34a'};font-weight:700;">前月比 ${up ? '+' : ''}${diff}（前月 ${prevCnt}件）</span>`;
  })();
  const accidentBands = bucketCoarseBands((accidentTimes?.results ?? []).map(r => r.occurred_time));
  const accidentBandMax = Math.max(...accidentBands, 1);
  const accidentBandHtml = accidentBands.map((cnt, i) => `
    <div class="hm-div-row">
      <span class="hm-div-name" style="width:auto;">${COARSE_BAND_LABELS[i].split('（')[0]}</span>
      <div class="hm-div-track"><div class="hm-div-fill" style="width:${Math.round(cnt / accidentBandMax * 100)}%;background:linear-gradient(90deg,#f59e0b,#b45309);"></div></div>
      <span class="hm-div-cnt">${cnt}件</span>
    </div>`).join('');
  const accidentCardHtml = `
    <a href="${ADMIN_PATH}/accidents" data-nav-id="accidents" class="hm-card hm-card-link">
      <div class="hm-card-head"><span class="hm-card-title">今月の事故</span><span class="hm-card-sub">${curM}月度</span></div>
      <div class="hm-card-body">
        <div class="hm-kpi-main">${accidentCount}<span class="hm-kpi-unit">件</span></div>
        <div class="hm-kpi-row">${accidentDiffHtml}</div>
        <div style="margin-top:10px;">${accidentBandHtml}</div>
      </div>
    </a>`;


  const overdueRows = (overdueList.results ?? []).length === 0
    ? '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">期限超過なし</div>'
    : (overdueList.results ?? []).map(e => {
        const overDays = Math.floor((new Date(today).getTime() - new Date(e.next_interview_date).getTime()) / 86400000);
        return `
      <a href="${ADMIN_PATH}/interviews/${e.id}" style="display:block;padding:10px 16px;border-bottom:1px solid #f3f4f6;text-decoration:none;transition:background 0.1s;" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background='white'">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:600;color:#1e293b;">${escHtml(e.name)}</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:1px;">${e.division ?? ''}課 ${e.team ?? ''}班</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:11px;color:#b45309;">予定: ${escHtml(e.next_interview_date)}</div>
            <div style="font-size:11px;font-weight:700;color:#b91c1c;">${overDays}日超過</div>
          </div>
        </div>
      </a>`;
      }).join('');

  // ホームのプレビューでは詳細な監査目的の全IPは見せず、一部伏せ字にする（全件は権限のある/login-logsで確認）
  const maskIpForPreview = (ip: string | null | undefined): string => {
    if (!ip) return '不明';
    if (ip.includes(':')) {
      const groups = ip.split(':');
      return `${groups.slice(0, 2).join(':')}:****`;
    }
    const parts = ip.split('.');
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.**.**` : '****';
  };

  const loginRows = (lastLogin?.results ?? []).map(l => {
    const loc = [l.city, l.country].filter(Boolean).join(' / ');
    return `
      <div style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <div>
          <span style="font-weight:600;color:#374151;font-family:monospace;">${escHtml(maskIpForPreview(l.ip))}</span>
          <span style="color:#9ca3af;margin-left:8px;">${escHtml(loc || '—')}</span>
        </div>
        <span style="color:#9ca3af;white-space:nowrap;">${escHtml(formatJst(l.logged_at))}</span>
      </div>`;
  }).join('') || '<div style="color:#9ca3af;font-size:13px;padding:8px 0;">ログイン記録なし</div>';

  // ===== ヘッダー: アカウント名・権限バッジ =====
  const isFullAdmin = selfAdmin ? selfAdmin.permissions === null : false;
  const headerExtra = selfAdmin ? `
    <span style="display:flex;align-items:center;gap:8px;">
      <span style="background:${isFullAdmin ? '#eff6ff' : '#f3f4f6'};color:${isFullAdmin ? '#1d4ed8' : '#4b5563'};font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;white-space:nowrap;">${isFullAdmin ? '全権限' : '管理者'}</span>
      <span style="font-size:12px;color:#6b7280;white-space:nowrap;">${escHtml(selfAdmin.username)}</span>
    </span>` : '';

  // ===== システム状態ミニウィジェット（実測値のみ。詳細は/settings/statusへ） =====
  const statusRows = [
    { label: 'システム稼働', ok: true },
    { label: 'データベース', ok: dbHealthOk },
    { label: 'メンテナンスモード', ok: !maintenanceOn, okLabel: 'OFF', ngLabel: '稼働中' },
  ].map(s => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;">
      <span style="font-size:12px;color:#475569;">${escHtml(s.label)}</span>
      <span style="font-size:11px;font-weight:700;color:${s.ok ? '#16a34a' : '#b91c1c'};display:flex;align-items:center;gap:4px;">
        <span style="width:6px;height:6px;border-radius:50%;background:${s.ok ? '#22c55e' : '#dc2626'};display:inline-block;"></span>
        ${escHtml(s.ok ? (s.okLabel ?? '正常') : (s.ngLabel ?? '異常'))}
      </span>
    </div>`).join('');

  const content = `
<style>
  .hm { font-family:'Hiragino Sans','Meiryo',sans-serif; max-width:1160px; }
  .hm-sec-title { font-size:14px; font-weight:700; color:#64748b; letter-spacing:.06em; margin:0 2px 10px; }
  /* 指針バナー */
  .hm-motto { display:flex; align-items:center; gap:16px; background:linear-gradient(135deg,#1a3a5c,#2d6a9f); border-radius:14px; padding:18px 26px; margin-bottom:24px; box-shadow:0 4px 16px rgba(26,58,92,.18); }
  .hm-motto-label { flex:none; font-size:12px; font-weight:700; letter-spacing:.1em; color:#cfe0f2; border:1px solid rgba(255,255,255,.35); border-radius:999px; padding:5px 12px; }
  .hm-motto-text { font-size:24px; font-weight:800; color:#fff; letter-spacing:.03em; line-height:1.3; }
  @media (max-width: 560px) {
    .hm-motto { flex-direction:column; align-items:flex-start; gap:10px; padding:16px 20px; }
    .hm-motto-text { font-size:19px; }
  }
  /* サマリーカード */
  .hm-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:10px; }
  .hm-stat { display:flex; flex-direction:column; gap:6px; background:#fff; border:1px solid #e8edf3; border-radius:12px; padding:18px 20px; text-decoration:none; transition:border-color .15s, box-shadow .15s; }
  a.hm-stat:hover { border-color:#c3d3e4; box-shadow:0 4px 14px rgba(26,58,92,.08); }
  .hm-stat-label { font-size:13px; color:#475569; font-weight:700; letter-spacing:.02em; }
  .hm-stat-value { font-size:32px; font-weight:800; line-height:1; }
  .hm-stat-sub { font-size:12px; color:#94a3b8; }
  /* クイックアクセス */
  .hm-quicks { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:12px; margin-bottom:26px; }
  .hm-quick { display:flex; align-items:center; background:#fff; border:1px solid #e8edf3; border-left:5px solid #1a3a5c; border-radius:12px; padding:20px 22px; font-size:17px; font-weight:700; color:#1e3a5f; text-decoration:none; transition:background .15s, border-color .15s, box-shadow .15s; }
  .hm-quick:hover { background:#f4f8fc; border-color:#c3d3e4; border-left-color:#2d6a9f; box-shadow:0 3px 10px rgba(26,58,92,.08); }
  /* 分析カード */
  .hm-ana { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:14px; }
  .hm-ana4 { display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:14px; margin-bottom:26px; }
  .hm-card { background:#fff; border:1px solid #e8edf3; border-radius:12px; overflow:hidden; display:flex; flex-direction:column; }
  .hm-card-link { text-decoration:none; transition:border-color .15s, box-shadow .15s; }
  .hm-card-link:hover { border-color:#c3d3e4; box-shadow:0 4px 14px rgba(26,58,92,.08); }
  .hm-card-head { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:13px 16px; border-bottom:1px solid #f1f5f9; }
  .hm-card-title { font-size:13px; font-weight:700; color:#1e293b; }
  .hm-card-sub { font-size:11px; color:#94a3b8; }
  .hm-card-more { font-size:12px; color:#2563eb; text-decoration:none; }
  .hm-card-body { padding:14px 16px; flex:1; }
  .hm-empty { padding:20px; text-align:center; color:#9ca3af; font-size:13px; }
  /* 縦棒グラフ */
  .hm-bars { display:flex; align-items:flex-end; gap:8px; height:118px; padding-top:4px; }
  .hm-bar-col { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:4px; min-width:0; }
  .hm-bar-val { font-size:11px; font-weight:700; color:#475569; line-height:1; height:12px; }
  .hm-bar { width:100%; max-width:38px; border-radius:4px 4px 2px 2px; transition:height .2s; }
  .hm-bar-lb { font-size:10px; color:#94a3b8; white-space:nowrap; }
  /* 課別横棒 */
  .hm-div-row { display:flex; align-items:center; gap:10px; padding:5px 0; }
  .hm-div-name { font-size:12px; color:#475569; font-weight:600; width:44px; flex:none; }
  .hm-div-track { flex:1; height:10px; background:#f1f5f9; border-radius:5px; overflow:hidden; }
  .hm-div-fill { height:100%; background:linear-gradient(90deg,#2d6a9f,#1a3a5c); border-radius:5px; }
  .hm-div-cnt { font-size:12px; color:#1e293b; font-weight:700; width:38px; text-align:right; flex:none; }
  /* KPI */
  .hm-kpi-main { font-size:26px; font-weight:800; color:#1a3a5c; line-height:1.1; }
  .hm-kpi-unit { font-size:12px; font-weight:600; color:#94a3b8; margin-left:5px; }
  .hm-kpi-row { display:flex; flex-wrap:wrap; gap:6px 14px; margin-top:10px; }
  .hm-kpi-note { font-size:11px; color:#64748b; }
  /* 下段リスト */
  .hm-lists { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:26px; }
  @media (max-width: 900px) {
    .hm-stats { grid-template-columns:1fr; }
    .hm-ana, .hm-lists { grid-template-columns:1fr; }
    .hm-ana4 { grid-template-columns:1fr 1fr; }
  }
  @media (max-width: 560px) {
    .hm-ana4 { grid-template-columns:1fr; }
  }
</style>
<div class="hm">

  <!-- 指針 -->
  <div class="hm-motto">
    <span class="hm-motto-label">指針</span>
    <span class="hm-motto-text">${escHtml(HOME_MOTTO)}</span>
  </div>

  <!-- よく使う操作 -->
  <div class="hm-sec-title">よく使う操作</div>
  <div class="hm-quicks">
    ${quickHtml}
  </div>

  <!-- 今日の対応 -->
  <div class="hm-sec-title">今日の対応</div>
  <div class="hm-stats">
    ${statCards}
  </div>

  <!-- 今日の対応の詳細 -->
  <div class="hm-lists">
    <div class="hm-card">
      <div class="hm-card-head">
        <span class="hm-card-title">面談期限超過</span>
        <a href="${ADMIN_PATH}/interviews" class="hm-card-more">面談一覧へ</a>
      </div>
      ${overdueRows}
    </div>
  </div>

  <!-- 今月の状況 -->
  <div class="hm-sec-title">今月の状況（直近6ヶ月の推移）</div>
  <div class="hm-ana">
    <div class="hm-card">
      <div class="hm-card-head"><span class="hm-card-title">入社人数の推移</span><span class="hm-card-sub">合計 ${hireTotal6}名・在籍 ${empCount.cnt}名（研修中${trainingCount.cnt}／配属済${regularCount.cnt}）</span></div>
      <div class="hm-card-body">${barChart(hireSeries, '#2d6a9f')}</div>
    </div>
    <div class="hm-card">
      <div class="hm-card-head"><span class="hm-card-title">報告件数の推移</span><span class="hm-card-sub">全報告合算 ${reportTotal6}件</span></div>
      <div class="hm-card-body">${barChart(reportSeries, '#b45309')}</div>
    </div>
  </div>
  <div class="hm-ana4">
    <div class="hm-card">
      <div class="hm-card-head"><span class="hm-card-title">課別の在籍構成</span><span class="hm-card-sub">在籍 ${empCount.cnt}名</span></div>
      <div class="hm-card-body">${divisionHtml}</div>
    </div>
    ${salesCardHtml}
    ${accidentCardHtml}
    ${lineCardHtml}
    <div class="hm-card hm-card-link" style="cursor:default;">
      <div class="hm-card-head"><span class="hm-card-title">システム状態</span><span class="hm-card-sub">${statusCheckedAt}時点</span></div>
      <div class="hm-card-body">
        ${statusRows}
        <a href="${ADMIN_PATH}/settings/status" style="display:block;margin-top:8px;font-size:11px;color:#2563eb;text-decoration:none;">詳細を見る →</a>
      </div>
    </div>
  </div>

  <!-- ログイン履歴 -->
  <div class="hm-card" style="padding:0 20px 12px;">
    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0 10px;">
      <span class="hm-card-title">最近のログイン</span>
      <a href="${ADMIN_PATH}/login-logs" class="hm-card-more">すべて見る</a>
    </div>
    ${loginRows}
  </div>

</div>`;

  return c.html(layout('ホーム', content, 'home', headerExtra));
});

// ===== ログイン履歴 =====
app.get('/login-logs', async (c) => {
  const logs = await c.env.DB.prepare(
    `SELECT *, CAST(strftime('%s','now') AS INTEGER) - CAST(strftime('%s', logged_at) AS INTEGER) AS diff_sec
     FROM login_logs ORDER BY logged_at DESC LIMIT 200`
  ).all<{ id: number; ip: string; country: string; city: string; latitude: string; longitude: string; timezone: string; user_agent: string; logged_at: string; diff_sec: number | null }>();

  const todayJst = new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
  let lastDateLabel = '';

  const rows = (logs.results ?? []).map(l => {
    const loc = [l.city, l.country].filter(Boolean).join(' / ') || '不明';
    const coords = (l.latitude && l.longitude)
      ? `<a href="https://www.google.com/maps?q=${l.latitude},${l.longitude}" target="_blank" style="color:#2563eb;">📍地図</a>`
      : '<span style="color:#d1d5db;">—</span>';
    const dateTimeJst = formatJst(l.logged_at, true);
    const [datePart, timePart] = dateTimeJst.split(' ');
    const isToday = datePart.slice(0, 10) === todayJst;
    const dateSep = datePart !== lastDateLabel
      ? `<tr><td colspan="6" style="padding:10px 12px 4px;font-size:11px;font-weight:700;color:#94a3b8;background:#f9fafb;border-bottom:1px solid #f1f5f9;">${escHtml(datePart)}${isToday ? '<span style="margin-left:6px;color:#2563eb;">今日</span>' : ''}</td></tr>`
      : '';
    lastDateLabel = datePart;
    return `${dateSep}<tr style="border-bottom:1px solid #f3f4f6;">
      <td class="px-3 py-2 text-sm border-b" style="white-space:nowrap;">
        <span style="font-weight:700;color:#1e293b;font-variant-numeric:tabular-nums;">${escHtml(timePart)}</span>
        <span style="font-size:11px;color:#9ca3af;margin-left:6px;">${escHtml(agoLabel(l.diff_sec))}</span>
      </td>
      <td class="px-3 py-2 text-sm font-mono text-gray-700 border-b">${escHtml(l.ip ?? '—')}</td>
      <td class="px-3 py-2 text-sm text-gray-600 border-b">${escHtml(loc)}</td>
      <td class="px-3 py-2 text-xs text-gray-500 border-b">${escHtml(l.timezone ?? '—')}</td>
      <td class="px-3 py-2 text-xs border-b">${coords}</td>
      <td class="px-3 py-2 text-xs text-gray-400 border-b" style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(l.user_agent ?? '')}">${escHtml((l.user_agent ?? '').slice(0, 50))}</td>
    </tr>`;
  }).join('');

  const content = `
    <div class="bg-white rounded-xl shadow overflow-auto">
      <table class="w-full" style="border-collapse:collapse;">
        <thead style="background:#f9fafb;position:sticky;top:0;z-index:1;">
          <tr>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">日時</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">IPアドレス</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">場所</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">タイムゾーン</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">座標</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">ブラウザ</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">記録なし</td></tr>'}</tbody>
      </table>
    </div>`;
  return c.html(layout('ログイン履歴', content, 'home'));
});

// ===== シフト管理 =====
app.get('/shift', async (c) => {
  const now = new Date();
  const year = parseInt(c.req.query('year') ?? String(now.getFullYear()));
  const month = parseInt(c.req.query('month') ?? String(now.getMonth() + 1));
  const mode = c.req.query('mode') ?? 'training'; // 'training' | 'completed'

  const periodCfg = await getPeriodSettings(c.env.DB);
  const { start: periodStart, end: periodEnd } = getPeriodRange(year, month, periodCfg);
  const { dates } = getShiftDisplayRange(year, month, periodCfg);

  // シフト表の表示に使うカラムのみ取得（birth_date/phone等の個人情報を無駄に転送しない）
  const SHIFT_EMP_COLS = 'id, emp_no, name, division, team, entry_type, seq_no, status';
  const empQuery = mode === 'completed'
    ? `SELECT ${SHIFT_EMP_COLS} FROM employees WHERE is_active = 1 AND status = 'completed' ORDER BY entry_type DESC, seq_no, id`
    : `SELECT ${SHIFT_EMP_COLS} FROM employees WHERE is_active = 1 AND (status IS NULL OR status != 'completed') ORDER BY entry_type DESC, seq_no, id`;

  const [employeesRes, shiftsRes, instructorsRes, instSchedulesRes, scheduleTypesRes, coachesRes] = await Promise.all([
    c.env.DB.prepare(empQuery).all<Employee>(),
    c.env.DB.prepare(
      'SELECT emp_id, date, entry_am, entry_pm, coach_id FROM shift_entries WHERE date >= ? AND date <= ?'
    ).bind(dates[0], dates[dates.length - 1]).all<ShiftEntry>(),
    c.env.DB.prepare(
      'SELECT * FROM instructors WHERE is_active = 1 ORDER BY sort_order'
    ).all<Instructor>(),
    c.env.DB.prepare(
      'SELECT * FROM instructor_schedules WHERE date >= ? AND date <= ?'
    ).bind(dates[0], dates[dates.length - 1]).all<InstructorSchedule>(),
    c.env.DB.prepare('SELECT * FROM schedule_types WHERE is_active = 1 ORDER BY sort_order').all<ScheduleType>(),
    c.env.DB.prepare('SELECT * FROM coaches WHERE is_active = 1 ORDER BY sort_order, id').all<Coach>(),
  ]);

  const shiftMap: Record<string, ShiftEntry> = {};
  for (const s of (shiftsRes.results ?? [])) {
    shiftMap[`${s.emp_id}_${s.date}`] = s;
  }

  const instSchedMap: Record<string, InstructorSchedule> = {};
  for (const s of (instSchedulesRes.results ?? [])) {
    instSchedMap[`${s.instructor_id}_${s.date}`] = s;
  }

  const content = shiftPage(
    employeesRes.results ?? [],
    shiftMap,
    instructorsRes.results ?? [],
    instSchedMap,
    dates, year, month, periodStart, periodEnd,
    scheduleTypesRes?.results ?? [],
    coachesRes?.results ?? [],
    mode
  );

  return c.html(layout(`シフト管理 — ${year}年${month}月度`, content, 'shift'));
});

// ===== 総合新人管理ハブ =====
app.get('/newcomers', (c) => {
  const ADMIN = ADMIN_PATH;
  const items = [
    { href: `${ADMIN}/shift`,      title: '新人シフト管理',   desc: '研修シフトの作成・班長/コーチの割当' },
    { href: `${ADMIN}/employees`,  title: '新人リスト',       desc: '登録済み新人の一覧・ステータス・種別（通常新人/新卒）・新卒Info（趣味・運転技術・メンタル状態）の管理' },
    { href: `${ADMIN}/followup`,   title: 'フォローリスト',   desc: '要フォロー社員の一覧確認' },
    { href: `${ADMIN}/interviews`, title: '面談管理',          desc: '面談記録・次回面談予定日の管理' },
  ];
  const cards = items.map(item => `
    <a href="${item.href}" style="display:flex;align-items:center;gap:16px;background:white;border-radius:12px;padding:20px 22px;box-shadow:0 1px 4px rgba(0,0,0,0.08);text-decoration:none;color:inherit;border:1px solid #e5e7eb;transition:box-shadow 0.15s;"
      onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.12)'" onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,0.08)'">
      <div style="flex:1;min-width:0;">
        <div style="font-size:15px;font-weight:700;color:#1e3a5f;margin-bottom:3px;">${item.title}</div>
        <div style="font-size:12px;color:#6b7280;">${item.desc}</div>
      </div>
      <div style="color:#9ca3af;font-size:20px;flex-shrink:0;">›</div>
    </a>`).join('');
  const html = `
    <div style="max-width:560px;">
      <h2 style="font-size:18px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">総合新人管理</h2>
      <p style="font-size:13px;color:#6b7280;margin-bottom:20px;">新人に関する各機能へのアクセスはこちらから。</p>
      <div style="display:flex;flex-direction:column;gap:12px;">${cards}</div>
    </div>`;
  return c.html(layout('総合新人管理', html, 'newcomers'));
});

// ===== シフトCSV出力 =====
app.get('/shift/export', async (c) => {
  const year = parseInt(c.req.query('year') ?? '0');
  const month = parseInt(c.req.query('month') ?? '0');
  if (!year || !month) return c.text('パラメータ不足', 400);

  const periodCfgExp = await getPeriodSettings(c.env.DB);
  const { dates } = getShiftDisplayRange(year, month, periodCfgExp);

  const [employeesRes, shiftsRes, coachesRes2] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM employees WHERE is_active = 1 ORDER BY entry_type DESC, seq_no, id').all<Employee>(),
    c.env.DB.prepare('SELECT emp_id, date, entry_am, entry_pm, coach_id FROM shift_entries WHERE date >= ? AND date <= ?')
      .bind(dates[0], dates[dates.length - 1]).all<ShiftEntry>(),
    c.env.DB.prepare('SELECT id, name FROM coaches WHERE is_active = 1').all<{ id: number; name: string }>(),
  ]);
  const employees = employeesRes;
  const coachNameMap2: Record<number, string> = {};
  for (const c of (coachesRes2.results ?? [])) coachNameMap2[c.id] = c.name;

  const shiftMap: Record<string, ShiftEntry> = {};
  for (const s of (shiftsRes.results ?? [])) {
    shiftMap[`${s.emp_id}_${s.date}`] = s;
  }

  const csvField = (v: string | null | undefined) => '"' + (v ?? '').replace(/"/g, '""') + '"';
  const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];
  const header = ['NO', '課', '班', '社員番号', '氏名', '区分',
    ...dates.flatMap(d => {
      const dt = new Date(d);
      const dow = WEEKDAY[dt.getUTCDay()];
      return [`${d}(${dow})_午前`, `${d}(${dow})_午後`, `${d}(${dow})_研修担当`];
    })
  ].join(',');

  const body = (employees.results ?? []).map(e => {
    const cells = dates.flatMap(d => {
      const s = shiftMap[`${e.id}_${d}`];
      const coach = s?.coach_id ? (coachNameMap2[s.coach_id] ?? '') : '';
      return [csvField(s?.entry_am), csvField(s?.entry_pm), csvField(coach)];
    });
    return [e.seq_no ?? '', e.division ?? '', e.team ?? '', csvField(e.emp_no), csvField(e.name), csvField(e.entry_type), ...cells].join(',');
  }).join('\n');

  const csv = `﻿${header}\n${body}`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="shift_${year}_${month}.csv"`
    }
  });
});

// ===== 個人予定表印刷（2カラム勤務予定表形式） =====
app.get('/shift/print/:empId', async (c) => {
  const empId = parseInt(c.req.param('empId'));
  const year = parseInt(c.req.query('year') ?? '0');
  const month = parseInt(c.req.query('month') ?? '0');

  const emp = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(empId).first<Employee>();
  if (!emp) return c.text('社員が見つかりません', 404);

  const periodCfgPrint = await getPeriodSettings(c.env.DB);
  const { start: periodStart, end: periodEnd } = getPeriodRange(year, month, periodCfgPrint);

  const [shifts, sales, scheduleTypesRes] = await Promise.all([
    c.env.DB.prepare(
      'SELECT date, entry_am, entry_pm FROM shift_entries WHERE emp_id = ? AND date >= ? AND date <= ? ORDER BY date'
    ).bind(empId, periodStart, periodEnd).all<{ date: string; entry_am: string; entry_pm: string }>(),
    c.env.DB.prepare(
      'SELECT date, amount FROM sales_records WHERE emp_id = ? AND date >= ? AND date <= ? ORDER BY date'
    ).bind(empId, periodStart, periodEnd).all<{ date: string; amount: number }>(),
    c.env.DB.prepare('SELECT code, color FROM schedule_types WHERE is_active = 1').all<{ code: string; color: string }>(),
  ]);

  const shiftByDate: Record<string, { main: string; sub: string }> = {};
  for (const s of (shifts.results ?? [])) shiftByDate[s.date] = { main: s.entry_am ?? '', sub: s.entry_pm ?? '' };
  const salesByDate: Record<string, number> = {};
  for (const s of (sales.results ?? [])) salesByDate[s.date] = s.amount;
  const colorMap: Record<string, string> = {};
  for (const t of (scheduleTypesRes.results ?? [])) colorMap[t.code] = t.color;

  const dates: string[] = [];
  const cur = new Date(periodStart);
  const endDate = new Date(periodEnd);
  while (cur <= endDate) { dates.push(cur.toISOString().split('T')[0]); cur.setDate(cur.getDate() + 1); }

  const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];
  const half = Math.ceil(dates.length / 2);
  const leftDates = dates.slice(0, half);
  const rightDates = dates.slice(half);

  let workDays = 0;
  let cumulative = 0;

  function renderRow(d: string, showSales: boolean): string {
    const dt = new Date(d);
    const day = dt.getUTCDate();
    const dow = dt.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const dayColor = dow === 0 ? 'color:#dc2626;' : dow === 6 ? 'color:#2563eb;' : '';
    const bgRow = isWeekend ? 'background:#fafafa;' : '';
    const shift = shiftByDate[d] ?? { main: '', sub: '' };
    const entryAm = shift.main;
    const entryPm = shift.sub;
    const displayEntry = (entryAm || entryPm)
      ? `${entryAm ? `<span style="font-size:9px;color:#059669;font-weight:700;">午前</span>${escHtml(entryAm)}` : ''}${entryPm ? `${entryAm ? '<br>' : ''}<span style="font-size:9px;color:#d97706;font-weight:700;">午後</span>${escHtml(entryPm)}` : ''}`
      : '';
    const entryColor = colorMap[entryAm] ?? (entryAm ? '#fff7ed' : '#ffffff');
    const amount = salesByDate[d];
    if (entryAm && entryAm !== '公休' && entryAm !== '休') workDays++;
    if (amount) cumulative += amount;
    const amountStr = amount ? amount.toLocaleString('ja-JP') : '';
    const cumulStr = amount ? cumulative.toLocaleString('ja-JP') : '';

    return `<tr style="${bgRow}">
      <td style="width:28px;text-align:center;padding:3px 4px;border:1px solid #9ca3af;font-size:12px;font-weight:600;${dayColor}">${String(day).padStart(2,'0')}</td>
      <td style="width:22px;text-align:center;padding:3px 2px;border:1px solid #9ca3af;font-size:12px;${dayColor}">${WEEKDAY[dow]}</td>
      <td style="width:60px;text-align:center;padding:3px 4px;border:1px solid #9ca3af;font-size:11px;background:${entryColor};">${displayEntry}</td>
      ${showSales ? `<td style="width:70px;text-align:right;padding:3px 6px;border:1px solid #9ca3af;font-size:11px;">${amountStr}</td>
      <td style="width:70px;text-align:right;padding:3px 6px;border:1px solid #9ca3af;font-size:11px;">${cumulStr}</td>` : ''}
    </tr>`;
  }

  const colHeader = (showSales: boolean) => `<tr style="background:#1a3a5c;color:white;">
    <th style="padding:4px 2px;border:1px solid #9ca3af;font-size:11px;text-align:center;">日付</th>
    <th style="padding:4px 2px;border:1px solid #9ca3af;font-size:11px;text-align:center;">曜日</th>
    <th style="padding:4px 4px;border:1px solid #9ca3af;font-size:11px;text-align:center;">勤務</th>
    ${showSales ? `<th style="padding:4px 4px;border:1px solid #9ca3af;font-size:11px;text-align:center;">営業収入</th>
    <th style="padding:4px 4px;border:1px solid #9ca3af;font-size:11px;text-align:center;">累計</th>` : ''}
  </tr>`;

  const hasSales = Object.keys(salesByDate).length > 0;
  const leftRows = leftDates.map(d => renderRow(d, hasSales)).join('');
  const rightRows = rightDates.map(d => renderRow(d, hasSales)).join('');
  const maxRows = Math.max(leftDates.length, rightDates.length);
  const rightPadding = Array(maxRows - rightDates.length).fill(
    `<tr><td colspan="${hasSales ? 5 : 3}" style="border:1px solid #9ca3af;padding:5px;"></td></tr>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="robots" content="noindex">
  <title>${escHtml(emp.name)} 勤務予定表</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Hiragino Sans', 'MS Gothic', 'Meiryo', sans-serif; background: white; padding: 16px; font-size: 12px; }
    .print-btn { margin-bottom: 12px; padding: 8px 20px; background: #1a3a5c; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
    .sheet { max-width: 800px; margin: 0 auto; }
    .sheet-title { text-align: center; font-size: 20px; font-weight: 900; letter-spacing: 0.3em; margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 6px; }
    .sheet-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; font-size: 12px; flex-wrap: wrap; gap: 4px; }
    .emp-info { font-size: 13px; font-weight: 700; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 2px solid #374151; }
    .col { border-collapse: collapse; width: 100%; }
    .col td, .col th { border: 1px solid #9ca3af; }
    .col-divider { border-right: 2px solid #374151; }
    .footer { margin-top: 8px; display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .work-count { font-size: 13px; font-weight: 600; border: 1px solid #9ca3af; padding: 6px 14px; }
    .notes-box { flex: 1; border: 1px solid #374151; padding: 8px 10px; min-height: 48px; font-size: 12px; }
    .notes-title { font-size: 11px; font-weight: 700; border-bottom: 1px solid #374151; margin-bottom: 4px; padding-bottom: 2px; }
    @media print {
      .print-btn { display: none; }
      body { padding: 8px; }
      @page { margin: 8mm; size: A4 portrait; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ 印刷 / PDF保存</button>
  <div class="sheet">
    <div class="sheet-title">勤 務 予 定 表</div>
    <div class="sheet-header">
      <div>${year}年${month < 10 ? '0' : ''}${month}月度（${periodStart} 〜 ${periodEnd}）</div>
      <div class="emp-info">${emp.division ?? ''}課 ${emp.team ?? ''}班 &nbsp; ${escHtml(emp.emp_no)} &nbsp; ${escHtml(emp.name)} 様</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;border:2px solid #374151;">
      <table style="border-collapse:collapse;width:100%;border-right:2px solid #374151;">
        <thead>${colHeader(hasSales)}</thead>
        <tbody>${leftRows}</tbody>
      </table>
      <table style="border-collapse:collapse;width:100%;">
        <thead>${colHeader(hasSales)}</thead>
        <tbody>${rightRows}${rightPadding}</tbody>
      </table>
    </div>
    <div class="footer">
      <div class="notes-box">
        <div class="notes-title">連絡事項</div>
      </div>
      <div class="work-count">勤務数：${workDays} 日</div>
    </div>
  </div>
</body>
</html>`;

  return c.html(html);
});

// ===== 設定：スケジュール区分管理 =====
// ===== 設定トップ（カード一覧）=====
app.get('/settings', async (c) => {
  const ADMIN = ADMIN_PATH;
  const displaySettings = await getMonitorDisplaySettings(c.env.DB);
  type SettingCard = { href: string; perm: string; title: string; desc: string; highlight?: boolean; newTab?: boolean };
  // グループごとに見出しを付けて表示。権限のないカードは自動で非表示になる
  const groups: Array<{ heading: string; cards: SettingCard[]; extraHtml?: string }> = [
    { heading: '日々の運用', cards: [
      // 報告センター・便利（車庫を含む）は左サイドバーに独立項目として配置したため、ここには表示しない
      { href: `${ADMIN}/requests`,         perm: 'requests',       title: '要望欄',       desc: 'ホシコンについての要望・意見・欲しい機能などを自由に投稿' },
    ]},
    { heading: '権限・アカウント', cards: [
      { href: `${ADMIN}/settings/accounts`,    perm: 'settings.accounts',   title: 'アカウント権限管理', desc: '管理画面アカウントの作成・機能ごとの閲覧/編集権限の設定', highlight: true },
      { href: `${ADMIN}/settings/liff`,        perm: 'settings.liff',       title: 'LINE連携',   desc: 'QRコード発行での新人・運行管理者等の登録・連携済みユーザー管理', highlight: true },
    ]},
    { heading: 'アナウンス', cards: [
      { href: `${ADMIN}/settings/announcement-bar`, perm: 'settings.announcement-bar', title: 'アナウンスバー', desc: '管理画面全ページ最上部に表示する常時テロップの投稿・期限設定' },
      { href: `${ADMIN}/settings/birthday`,          perm: 'settings.birthday',         title: 'ハッピーバースデーモード', desc: '対象者の誕生日当日、設定時刻に全ページへお祝いポップアップを表示' },
    ]},
    { heading: '画面カスタマイズ', cards: [
      { href: `${ADMIN}/settings/manual-mode`, perm: 'settings', title: 'マニュアルモード', desc: '管理画面の下・中央に、よく使うページへのショートカットを並べた小さなバーを常時表示。中身は「登録者」ごとに設定し、どの登録者のバーを出すかは各ブラウザで選択（同じアカウントを複数人で使う場合向け）' },
    ]},
    { heading: 'シフト関連の設定', cards: [
      { href: `${ADMIN}/settings/shift`, perm: 'settings', title: 'シフト関連の設定', desc: 'シフト区分・勤務ダイヤ・研修担当・班長指導者・月度設定・ベンテンクラブ・班長関連 の一覧', highlight: true },
    ]},
    { heading: 'LINE関連', cards: [
      { href: `${ADMIN}/line`,                   perm: 'line',                   title: 'LINE管理',     desc: '新人招待コード発行・紐付け状況' },
      { href: `${ADMIN}/announcements`,          perm: 'announcements',         title: 'お知らせ配信', desc: '全員・入社月・個別指定・LINE連携者への一斉配信、Web管理画面のお知らせベル、アンケート' },
      { href: `${ADMIN}/settings/notifications`, perm: 'settings.notifications', title: 'LINE通知設定', desc: '朝レポート・報告アラート・ベンテン/班長通知の時刻とON/OFF' },
      { href: `${ADMIN}/usage`,                  perm: 'settings.line-usage',    title: 'LINE利用状況', desc: 'トーク・LIFF操作のユーザー別利用集計（フル権限adminのみ）' },
    ]},
    { heading: 'マスタ管理', cards: [
      { href: `${ADMIN}/settings/offices`,         perm: 'settings.offices',         title: '営業所',              desc: '各営業所の電話番号・住所の管理' },
      { href: `${ADMIN}/settings/violation-types`, perm: 'settings.violation-types', title: '違反種類・点数/反則金', desc: '違反報告フォームの選択肢と点数・反則金の管理' },
      { href: `${ADMIN}/cc-list`,                  perm: '',                         title: 'CC名簿',              desc: 'クレーム客の記録台帳（専用パスワードが必要）' },
    ]},
    { heading: '調整', cards: [
      { href: `${ADMIN}/settings/chosei`, perm: 'settings.chosei', title: '調整', desc: '日程調整（調整さん形式）。調整を作ると推測されない共有URLが1本発行され、回答者はURLから社員番号を入力して各候補に ○/△/× とコメントを登録。集計表で最有力の候補が分かる' },
    ]},
    { heading: 'AI売上分析の設定', cards: [
      { href: `${ADMIN}/settings/wage-estimate`, perm: 'settings.wage-estimate', title: '賃金試算設定', desc: 'AI売上分析「賃金インパクト試算」で使う成果手当の概算計算パラメータ（曜日別基準額・歩合率）' },
      { href: `${ADMIN}/settings/driving-risk`,  perm: 'settings.driving-risk',  title: '運転リスク検証設定', desc: 'AI売上分析「安全運転リスク」判定のしきい値（急挙動件数・最高速度）' },
      { href: `${ADMIN}/settings/fare-revision-guide`, perm: 'settings', title: '運賃改定影響分析のしくみ', desc: '「運賃改定影響分析」が何をどう計算しているか、やさしい言葉で解説' },
    ]},
    { heading: '経営・対外資料', cards: [
      { href: `${ADMIN}/presentation`, perm: 'settings.presentation', title: 'ホシコン発表資料', desc: '社内システムのDX事例プレゼンテーション（横スライド・印刷対応、フル権限adminのみ）' },
    ]},
    { heading: 'モニター表示', cards: [
      { href: MONITOR_ACCIDENTS_PATH, perm: 'accidents', title: '事故モニター表示', desc: '事故件数・時間帯を大きく常時表示するページ（ログイン不要・専用パスワードが必要、モニターに映しっぱなしにする用途）。下の表示モード設定に従って表示内容が変わります', newTab: true },
      { href: MONITOR_NEWCOMERS_PATH, perm: 'newcomers', title: '新人紹介モニター表示', desc: '新人紹介カードだけを常時表示するページ（ログイン不要。別の物理サイネージに映す用途で、表示モード設定に関わらず常に新人紹介のみ表示）', newTab: true },
      { href: `${ADMIN}/newcomer-intros`, perm: 'settings.newcomer-intros', title: '新人紹介カード管理', desc: '事故モニターサイネージの「新人紹介」表示用カード（写真・名前・班・一言コメント）の登録' },
    ], extraHtml: `
      <div data-perm-key="accidents" style="background:white;border-radius:12px;padding:18px 20px;box-shadow:0 1px 4px rgba(0,0,0,0.08);border:1px solid #e5e7eb;margin-top:12px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:10px;">事故モニター表示の表示モード</div>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;color:#374151;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="radio" name="monitor-mode" value="accidents" ${displaySettings.mode === 'accidents' ? 'checked' : ''} onchange="onMonitorModeChange()"> 事故データのみ（既定）
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="radio" name="monitor-mode" value="newcomers" ${displaySettings.mode === 'newcomers' ? 'checked' : ''} onchange="onMonitorModeChange()"> 新人紹介のみ
          </label>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="radio" name="monitor-mode" value="alternate" ${displaySettings.mode === 'alternate' ? 'checked' : ''} onchange="onMonitorModeChange()"> 事故データと新人紹介を交互表示
          </label>
          <div id="monitor-alternate-seconds-wrap" style="margin-left:26px;display:${displaySettings.mode === 'alternate' ? 'flex' : 'none'};align-items:center;gap:8px;">
            <span style="color:#6b7280;">切替間隔:</span>
            <input type="number" id="monitor-alternate-seconds" min="2" value="${displaySettings.alternateSeconds}" style="width:70px;border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:13px;">
            <span style="color:#6b7280;">秒ごと</span>
          </div>
        </div>
        <div id="monitor-mode-msg" style="font-size:12px;color:#dc2626;margin-top:10px;"></div>
        <button type="button" id="monitor-mode-save-btn" onclick="saveMonitorMode()" style="margin-top:12px;padding:7px 20px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">表示モードを保存</button>
      </div>` },
    { heading: 'ガイド・システム', cards: [
      { href: `${ADMIN}/settings/documents`,            perm: 'settings.documents',            title: 'データセンター',     desc: '資料保存に加え、社員CSV・点検写真AI取込・乗務員シフトPDFのアップロード窓口を集約' },
      { href: `${ADMIN}/settings/tutorial`,             perm: 'settings.tutorial',             title: 'チュートリアル',     desc: 'システムの使い方ガイド（印刷・PDF出力対応）' },
      { href: `${ADMIN}/settings/vehicle-search-guide`, perm: 'settings.vehicle-search-guide', title: '車番検索ガイド',     desc: '班長・指導者向けLINE車番検索の使い方ページ（配布用）' },
      { href: `${ADMIN}/settings/status`,               perm: 'settings.status',               title: 'システムステータス', desc: 'サーバー・DB・通信状態・利用統計・DB統計・アクセスQRコード' },
      { href: `${ADMIN}/request-review`,                perm: 'settings.requests-admin',       title: '要望欄（収集一覧）', desc: '設定ページ「要望欄」から寄せられた要望・意見の一覧（フル権限adminのみ）' },
    ]},
  ];
  const cardHtml = (card: SettingCard) => {
    const linkTag = `
          <a href="${card.href}" ${card.newTab ? 'target="_blank" rel="noopener"' : ''} ${card.href === MONITOR_ACCIDENTS_PATH ? '' : `data-perm-key="${card.perm}"`} style="display:flex;align-items:center;gap:16px;background:${card.highlight ? '#eff6ff' : 'white'};border-radius:12px;padding:18px 20px;box-shadow:0 1px 4px rgba(0,0,0,0.08);text-decoration:none;color:inherit;border:1px solid ${card.highlight ? '#bfdbfe' : '#e5e7eb'};transition:box-shadow 0.15s;"
            onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.12)'" onmouseout="this.style.boxShadow='0 1px 4px rgba(0,0,0,0.08)'">
            <div>
              <div style="font-size:15px;font-weight:700;color:${card.highlight ? '#1d4ed8' : '#1e3a5f'};margin-bottom:3px;">${card.title}</div>
              <div style="font-size:12px;color:#6b7280;">${card.desc}</div>
            </div>
            <div style="margin-left:auto;color:#9ca3af;font-size:18px;">›</div>
          </a>`;
    if (card.href !== MONITOR_ACCIDENTS_PATH) return linkTag;
    return `
          <div data-perm-key="${card.perm}" style="display:flex;flex-direction:column;gap:8px;">
            ${linkTag}
            <button type="button" id="monitor-force-refresh-btn" onclick="forceRefreshAccidentsMonitor(this)"
              style="align-self:flex-start;font-size:12px;font-weight:700;color:#b45309;background:#fef3c7;border:1px solid #f4d35e;border-radius:8px;padding:8px 14px;cursor:pointer;">
              【強制更新】表示中のモニター画面を今すぐリロード
            </button>
          </div>`;
  };
  const html = `
    <div style="max-width:560px;">
      <h2 style="font-size:18px;font-weight:700;color:#1e3a5f;margin-bottom:20px;">設定</h2>

      ${groups.map(g => `
      <div style="margin-bottom:24px;">
        <div style="font-size:12px;font-weight:700;color:#9ca3af;letter-spacing:0.08em;margin-bottom:10px;">${g.heading}</div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${g.cards.map(cardHtml).join('')}
        </div>
        ${g.extraHtml || ''}
      </div>`).join('')}
    </div>
    <script>
      var ADMIN_PATH = ${JSON.stringify(ADMIN_PATH)};
      function forceRefreshAccidentsMonitor(btn) {
        var original = btn.textContent;
        btn.disabled = true;
        btn.textContent = '更新をリクエスト中…';
        fetch(ADMIN_PATH + '/api/accidents-monitor-force-refresh', { method: 'POST', credentials: 'include' })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (res) {
            btn.disabled = false;
            btn.textContent = original;
            if (!res.ok) { alert(res.j.error || '強制更新に失敗しました'); return; }
            alert('モニター画面に更新をリクエストしました。反映まで少し時間がかかる場合があります。');
          })
          .catch(function () {
            btn.disabled = false;
            btn.textContent = original;
            alert('通信エラーで強制更新できませんでした');
          });
      }

      function onMonitorModeChange() {
        var mode = document.querySelector('input[name="monitor-mode"]:checked').value;
        document.getElementById('monitor-alternate-seconds-wrap').style.display = mode === 'alternate' ? 'flex' : 'none';
      }
      function saveMonitorMode() {
        var mode = document.querySelector('input[name="monitor-mode"]:checked').value;
        var seconds = parseInt(document.getElementById('monitor-alternate-seconds').value, 10) || 15;
        var msg = document.getElementById('monitor-mode-msg');
        var btn = document.getElementById('monitor-mode-save-btn');
        msg.textContent = '';
        btn.disabled = true;
        btn.textContent = '保存中…';
        fetch(ADMIN_PATH + '/api/accidents-monitor-display-mode', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: mode, alternateSeconds: seconds })
        })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (res) {
            btn.disabled = false;
            btn.textContent = '表示モードを保存';
            if (!res.ok) { msg.textContent = res.j.error || '保存に失敗しました'; return; }
            alert('表示モードを保存しました。モニター画面に反映まで少し時間がかかる場合があります。');
          })
          .catch(function () {
            btn.disabled = false;
            btn.textContent = '表示モードを保存';
            msg.textContent = '通信エラーが発生しました';
          });
      }
    </script>`;
  return c.html(layout('設定', html, 'settings'));
});

// 事故モニターの強制更新（設定ページの「事故モニター表示」カードから実行）
app.post('/api/accidents-monitor-force-refresh', async (c) => {
  await triggerAccidentsMonitorForceRefresh(c.env.DB);
  return c.json({ ok: true });
});

// 事故モニターの表示モード保存（設定ページ「モニター表示」の表示モード切替から実行）
app.post('/api/accidents-monitor-display-mode', async (c) => {
  let body: { mode?: string; alternateSeconds?: number };
  try { body = await c.req.json(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }

  const mode = body.mode;
  if (mode !== 'accidents' && mode !== 'newcomers' && mode !== 'alternate') {
    return c.json({ error: '表示モードの値が不正です' }, 400);
  }
  const alternateSeconds = Number(body.alternateSeconds);
  if (!Number.isFinite(alternateSeconds) || alternateSeconds < 2) {
    return c.json({ error: '切替間隔は2秒以上の数値を指定してください' }, 400);
  }

  await saveMonitorDisplaySettings(c.env.DB, mode as MonitorDisplayMode, alternateSeconds);
  await triggerAccidentsMonitorForceRefresh(c.env.DB);
  return c.json({ ok: true });
});

// ===== 設定サブページ共通ヘッダー =====
export function settingsSubHeader(title: string): string {
  return `<div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 設定に戻る</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">${title}</h2>
  </div>`;
}

// ===== シフト関連の設定 ハブページ =====
app.get('/settings/shift', (c) => {
  const ADMIN = ADMIN_PATH;
  type ShiftCard = { href: string; perm: string; title: string; desc: string };
  const cards: ShiftCard[] = [
    { href: `${ADMIN}/settings/schedule-types`, perm: 'settings.schedule-types', title: 'シフト区分',   desc: 'プリセットボタンの区分名・色・目標回数' },
    { href: `${ADMIN}/settings/dia`,            perm: 'settings.dia',            title: '勤務ダイヤ・サイクル', desc: 'ダイヤマスター（勤務時間帯・指導基準）とサイクル一覧表の管理' },
    { href: `${ADMIN}/settings/coaches`,        perm: 'settings.coaches',        title: '研修担当',     desc: 'シフト表の研修担当者（コーチ）一覧' },
    { href: `${ADMIN}/settings/instructors`,    perm: 'settings.instructors',    title: '班長・指導者', desc: 'シフト表下部の班長・指導者一覧' },
    { href: `${ADMIN}/settings/periods`,        perm: 'settings.periods',        title: '月度設定',     desc: '各月度の開始日・締め日の設定' },
    { href: `${ADMIN}/settings/benten`,         perm: 'settings.benten',         title: 'ベンテンクラブ シフト', desc: '会員・グループ・シフト種別・表示期間・LINE自動送信の管理' },
    { href: `${ADMIN}/settings/kancho`,         perm: 'settings.kancho settings.kancho-roster settings.kancho-wish settings.kancho-logic', title: '班長関連', desc: '班長リスト（社員番号・内勤）、希望休フォームの設定、ロジック仕様' },
  ];
  const html = settingsSubHeader('シフト関連の設定') + `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;max-width:820px;">
      ${cards.map(card => `
      <a href="${card.href}" data-perm-key="${card.perm}" style="display:block;background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;text-decoration:none;color:inherit;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
        <div style="font-weight:700;color:#1e3a5f;margin-bottom:4px;">${card.title}</div>
        <div style="font-size:12px;color:#6b7280;">${card.desc}</div>
      </a>`).join('')}
    </div>`;
  return c.html(layout('シフト関連の設定', html, 'settings'));
});

// ===== シフト区分設定 =====
app.get('/settings/schedule-types', async (c) => {
  const typesRes = await c.env.DB.prepare('SELECT * FROM schedule_types ORDER BY sort_order, id')
    .all<{ id: number; code: string; color: string; sort_order: number; is_active: number; target: number | null }>();
  const rows = (typesRes.results ?? []).map((t: any) => `
    <tr id="row-${t.id}" data-changed="false" style="opacity:${t.is_active ? '1' : '0.45'};">
      <td class="px-3 py-2 border-b">
        <input type="text" value="${escHtml(t.code)}" id="code-${t.id}"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:90px;" oninput="markChanged(${t.id})">
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;align-items:center;gap:8px;">
          <input type="color" value="${escHtml(t.color)}" id="color-${t.id}" style="width:36px;height:28px;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;" oninput="markChanged(${t.id})">
          <span id="preview-${t.id}" style="background:${escHtml(t.color)};padding:2px 10px;border-radius:4px;border:1px solid #d1d5db;font-size:13px;">${escHtml(t.code)}</span>
        </div>
      </td>
      <td class="px-3 py-2 border-b">
        <input type="number" value="${t.sort_order}" id="sort-${t.id}" min="0" max="99"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:55px;" oninput="markChanged(${t.id})">
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;align-items:center;gap:4px;">
          <input type="number" value="${t.target ?? ''}" id="target-${t.id}" min="1" max="999" placeholder="—"
            style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:58px;" oninput="markChanged(${t.id})">
          <span style="font-size:11px;color:#9ca3af;">回</span>
        </div>
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;gap:4px;">
          <span id="changed-${t.id}" style="display:none;font-size:11px;color:#d97706;font-weight:600;">未保存</span>
          <button onclick="toggleType(${t.id},${t.is_active})" style="padding:4px 8px;background:${t.is_active ? '#f3f4f6' : '#bbf7d0'};border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">
            ${t.is_active ? '非表示' : '表示'}
          </button>
          <button onclick="deleteType(${t.id},'${escHtml(t.code)}')" style="padding:4px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">削除</button>
        </div>
      </td>
    </tr>`).join('');
  const html = settingsSubHeader('シフト区分の設定') + `
    <div class="bg-white rounded-xl shadow p-6 max-w-2xl">
      <p class="text-sm text-gray-500 mb-4">プリセットボタンと凡例に使われます。<strong>目標回数</strong>を設定するとシフト表の集計で達成状況を確認できます。</p>
      <table class="w-full mb-4">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">区分名</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">色</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">順番</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">目標回数</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-bottom:16px;">
        <button onclick="saveAll()" id="save-all-btn" style="padding:9px 24px;background:#2563eb;color:white;border:none;border-radius:7px;font-size:14px;font-weight:600;cursor:pointer;">変更を一括保存</button>
      </div>
      <div style="border-top:1px solid #e5e7eb;padding-top:16px;">
        <h4 class="text-sm font-semibold text-gray-700 mb-3">新しい区分を追加</h4>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input type="text" id="new-code" placeholder="区分名（例: 実地）"
            style="border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;width:130px;">
          <input type="color" id="new-color" value="#e0f2fe"
            style="width:40px;height:34px;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;">
          <input type="number" id="new-sort" value="99" min="0" max="99"
            style="border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:13px;width:60px;">
          <button onclick="addType()" style="padding:7px 18px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;">追加</button>
        </div>
      </div>
    </div>
    <script>
    var _changed = new Set();
    function markChanged(id) {
      _changed.add(id);
      var el = document.getElementById('changed-' + id);
      if (el) el.style.display = 'inline';
      // カラープレビューをリアルタイム更新
      var colorEl = document.getElementById('color-' + id);
      var codeEl  = document.getElementById('code-' + id);
      var prev    = document.getElementById('preview-' + id);
      if (prev && colorEl && codeEl) { prev.style.background = colorEl.value; prev.textContent = codeEl.value; }
    }
    async function saveAll() {
      var btn = document.getElementById('save-all-btn');
      var ids = Array.from(document.querySelectorAll('tr[id^="row-"]')).map(function(r) { return parseInt(r.id.replace('row-','')); });
      var items = [];
      for (var i = 0; i < ids.length; i++) {
        var id = ids[i];
        var code = document.getElementById('code-' + id).value.trim();
        var color = document.getElementById('color-' + id).value;
        var sort_order = parseInt(document.getElementById('sort-' + id).value) || 0;
        var targetEl = document.getElementById('target-' + id); var target = targetEl.value ? parseInt(targetEl.value) : null;
        if (!code) { alert('区分名が空の行があります'); return; }
        items.push({id:id,code:code,color:color,sort_order:sort_order,target:target});
      }
      btn.disabled = true; btn.textContent = '保存中...';
      var res = await fetch('/api/schedule-types/bulk', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(items) });
      btn.disabled = false;
      if (!res.ok) {
        btn.textContent = '変更を一括保存';
        var j = await res.json().catch(function(){ return {}; });
        alert('保存に失敗しました' + (j.error ? ': ' + j.error : ''));
      } else {
        ids.forEach(function(id) { var el = document.getElementById('changed-' + id); if (el) el.style.display = 'none'; });
        btn.textContent = '✓ 保存完了'; setTimeout(function(){ btn.textContent = '変更を一括保存'; }, 2000);
      }
    }
    async function toggleType(id, current) {
      await fetch('/api/schedule-types/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({is_active: current?0:1}) });
      location.reload();
    }
    async function deleteType(id, name) {
      if (!confirm('「' + name + '」を削除しますか？')) return;
      await fetch('/api/schedule-types/' + id, { method:'DELETE' });
      location.reload();
    }
    async function addType() {
      var code = document.getElementById('new-code').value.trim();
      var color = document.getElementById('new-color').value;
      var sort_order = parseInt(document.getElementById('new-sort').value) || 99;
      if (!code) { alert('区分名を入力してください'); return; }
      var res = await fetch('/api/schedule-types', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({code,color,sort_order}) });
      if (res.ok) location.reload();
      else { var j = await res.json(); alert(j.error ?? '追加に失敗しました'); }
    }
    </script>`;
  return c.html(layout('シフト区分設定', html, 'settings'));
});

// ===== 研修担当設定 =====
app.get('/settings/coaches', async (c) => {
  const coachesRes = await c.env.DB.prepare('SELECT * FROM coaches ORDER BY sort_order, id')
    .all<{ id: number; name: string; is_active: number; sort_order: number }>();
  const coachRows = (coachesRes.results ?? []).map((c: any) => `
    <tr style="opacity:${c.is_active ? 1 : 0.4}">
      <td class="px-3 py-2 border-b">
        <input type="text" value="${escHtml(c.name)}" id="cname-${c.id}"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:150px;">
      </td>
      <td class="px-3 py-2 border-b">
        <input type="number" value="${c.sort_order}" id="csort-${c.id}" min="0" max="99"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:55px;">
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;gap:4px;">
          <button onclick="saveCoach(${c.id})" style="padding:4px 10px;background:#2563eb;color:white;border:none;border-radius:4px;font-size:12px;cursor:pointer;">保存</button>
          <button onclick="deleteCoach(${c.id},'${escHtml(c.name)}')" style="padding:4px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">削除</button>
        </div>
      </td>
    </tr>`).join('');
  const html = settingsSubHeader('研修担当（コーチ）の登録') + `
    <div class="bg-white rounded-xl shadow p-6 max-w-xl">
      <p class="text-sm text-gray-500 mb-4">シフト管理画面の各セル3行目に表示されます。</p>
      <table class="w-full mb-4">
        <thead class="bg-gray-50"><tr>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">氏名</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">順番</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">操作</th>
        </tr></thead>
        <tbody>${coachRows || '<tr><td colspan="3" class="px-3 py-4 text-center text-sm text-gray-400 border-b">未登録</td></tr>'}</tbody>
      </table>
      <div style="border-top:1px solid #e5e7eb;padding-top:14px;">
        <div style="display:flex;gap:8px;align-items:center;">
          <input type="text" id="new-coach-name" placeholder="氏名（例: 山田 太郎）"
            style="border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;flex:1;">
          <button onclick="addCoach()" style="padding:8px 18px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;white-space:nowrap;">追加</button>
        </div>
      </div>
    </div>
    <script>
    async function saveCoach(id) {
      var name = document.getElementById('cname-' + id).value.trim();
      var sort_order = parseInt(document.getElementById('csort-' + id).value) || 0;
      if (!name) { alert('名前を入力してください'); return; }
      var res = await fetch('/api/coaches/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,sort_order}) });
      if (res.ok) location.reload(); else alert('保存に失敗しました');
    }
    async function deleteCoach(id, name) {
      if (!confirm(name + ' を削除しますか？')) return;
      await fetch('/api/coaches/' + id, { method:'DELETE' });
      location.reload();
    }
    async function addCoach() {
      var name = document.getElementById('new-coach-name').value.trim();
      if (!name) { alert('名前を入力してください'); return; }
      var res = await fetch('/api/coaches', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name}) });
      if (res.ok) location.reload();
      else { var j = await res.json(); alert(j.error ?? '追加に失敗しました'); }
    }
    </script>`;
  return c.html(layout('研修担当設定', html, 'settings'));
});

// ===== 班長・指導者設定 =====
app.get('/settings/instructors', async (c) => {
  const instRes = await c.env.DB.prepare('SELECT * FROM instructors ORDER BY sort_order, id')
    .all<{ id: number; name: string; role: string | null; is_active: number; sort_order: number; line_uid: string | null }>();
  const instRows = (instRes.results ?? []).map((inst: any) => {
    const linked = !!inst.line_uid;
    const lineStatus = linked
      ? `<span style="color:#059669;font-size:11px;font-weight:600;">連携済</span>
         <button onclick="unlinkLine(${inst.id},'${escHtml(inst.name)}')" style="padding:2px 6px;background:#fee2e2;color:#991b1b;border:none;border-radius:3px;font-size:11px;cursor:pointer;">解除</button>`
      : `<span style="color:#9ca3af;font-size:11px;">未連携</span>
         <a href="${ADMIN_PATH}/settings/liff" style="padding:2px 8px;background:#dbeafe;color:#1d4ed8;border-radius:3px;font-size:11px;text-decoration:none;white-space:nowrap;">LINE連携ページでQR発行</a>`;
    return `
    <tr style="opacity:${inst.is_active ? 1 : 0.4}">
      <td class="px-3 py-2 border-b">
        <input type="text" value="${escHtml(inst.name)}" id="iname-${inst.id}"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:130px;">
      </td>
      <td class="px-3 py-2 border-b">
        <input type="text" value="${escHtml(inst.role ?? '')}" id="irole-${inst.id}" placeholder="例: 4課 新人教育"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:160px;">
      </td>
      <td class="px-3 py-2 border-b">
        <input type="number" value="${inst.sort_order}" id="isort-${inst.id}" min="0" max="99"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:55px;">
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;gap:4px;align-items:center;">${lineStatus}</div>
      </td>
      <td class="px-3 py-2 border-b">
        <div style="display:flex;gap:4px;">
          <button onclick="saveInst(${inst.id})" style="padding:4px 10px;background:#2563eb;color:white;border:none;border-radius:4px;font-size:12px;cursor:pointer;">保存</button>
          <button onclick="toggleInst(${inst.id},${inst.is_active})" style="padding:4px 8px;background:${inst.is_active ? '#f3f4f6' : '#bbf7d0'};border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">
            ${inst.is_active ? '非表示' : '表示'}
          </button>
          <button onclick="deleteInst(${inst.id},'${escHtml(inst.name)}')" style="padding:4px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">削除</button>
        </div>
      </td>
    </tr>`;
  }).join('');
  const html = settingsSubHeader('班長・指導者の登録') + `
    <div class="bg-white rounded-xl shadow p-6 max-w-3xl">
      <p class="text-sm text-gray-500 mb-4">シフト管理画面の下部「班長・指導者スケジュール」に表示されます。LINE連携で定時通知を受け取れます。</p>
      <table class="w-full mb-4">
        <thead class="bg-gray-50"><tr>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">氏名</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">役職・備考</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">順番</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">LINE連携</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">操作</th>
        </tr></thead>
        <tbody>${instRows || '<tr><td colspan="5" class="px-3 py-4 text-center text-sm text-gray-400 border-b">未登録</td></tr>'}</tbody>
      </table>
      <div style="border-top:1px solid #e5e7eb;padding-top:14px;">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <input type="text" id="new-inst-name" placeholder="氏名（例: 松本班長）"
            style="border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;width:140px;">
          <input type="text" id="new-inst-role" placeholder="役職（例: 4課 新人教育）"
            style="border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;width:170px;">
          <button onclick="addInst()" style="padding:8px 18px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;white-space:nowrap;">追加</button>
        </div>
      </div>
    </div>
    <script>
    async function saveInst(id) {
      var name = document.getElementById('iname-' + id).value.trim();
      var role = document.getElementById('irole-' + id).value.trim();
      var sort_order = parseInt(document.getElementById('isort-' + id).value) || 0;
      if (!name) { alert('名前を入力してください'); return; }
      var res = await fetch('/api/instructors/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,role:role||null,sort_order}) });
      if (res.ok) location.reload(); else alert('保存に失敗しました');
    }
    async function toggleInst(id, current) {
      await fetch('/api/instructors/' + id, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({is_active:current?0:1}) });
      location.reload();
    }
    async function deleteInst(id, name) {
      if (!confirm(name + ' を削除しますか？')) return;
      await fetch('/api/instructors/' + id, { method:'DELETE' });
      location.reload();
    }
    async function addInst() {
      var name = document.getElementById('new-inst-name').value.trim();
      var role = document.getElementById('new-inst-role').value.trim();
      if (!name) { alert('名前を入力してください'); return; }
      var res = await fetch('/api/instructors', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,role:role||null}) });
      if (res.ok) location.reload();
      else { var j = await res.json(); alert(j.error ?? '追加に失敗しました'); }
    }
    async function unlinkLine(id, name) {
      if (!confirm(name + ' のLINE連携を解除しますか？')) return;
      await fetch('/api/instructor-invite/' + id, { method:'DELETE' });
      location.reload();
    }
    </script>`;
  return c.html(layout('班長・指導者設定', html, 'settings'));
});

// ===== 月度設定 =====
app.get('/settings/periods', async (c) => {
  const periodCfg = await getPeriodSettings(c.env.DB);
  const MONTH_NAMES = ['1月度','2月度','3月度','4月度','5月度','6月度','7月度','8月度','9月度','10月度','11月度','12月度'];
  const periodRows = Array.from({length: 12}, (_, i) => {
    const m = i + 1;
    const cfg = periodCfg[m] ?? { close_day: 17, start_day: 18 };
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;color:#374151;">${MONTH_NAMES[i]}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        前月 <input type="number" id="ps_start_${m}" value="${cfg.start_day}" min="1" max="31"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;font-size:13px;width:52px;text-align:center;"> 日〜
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        当月 <input type="number" id="ps_close_${m}" value="${cfg.close_day}" min="1" max="31"
          style="border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;font-size:13px;width:52px;text-align:center;"> 日
      </td>
    </tr>`;
  }).join('');
  const html = settingsSubHeader('月度設定') + `
    <div class="bg-white rounded-xl shadow p-6 max-w-xl">
      <p class="text-sm text-gray-500 mb-4">各月度の開始日（前月）と締め日（当月）を設定します。<br>例: 6月度 = 前月18日〜当月17日</p>
      <table class="w-full mb-5">
        <thead class="bg-gray-50"><tr>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">月度</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">開始（前月）</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">締め（当月）</th>
        </tr></thead>
        <tbody>${periodRows}</tbody>
      </table>
      <button onclick="saveAllPeriods()" id="save-period-btn" style="padding:10px 28px;background:#2563eb;color:white;border:none;border-radius:7px;font-size:14px;font-weight:600;cursor:pointer;">全月度を一括保存</button>
    </div>
    <script>
    async function saveAllPeriods() {
      var btn = document.getElementById('save-period-btn');
      var items = [];
      for (var m = 1; m <= 12; m++) {
        var start = parseInt(document.getElementById('ps_start_' + m).value);
        var close = parseInt(document.getElementById('ps_close_' + m).value);
        if (!start||start<1||start>31||!close||close<1||close>31) { alert(m + '月度: 日付が不正です'); return; }
        items.push({month:m,start_day:start,close_day:close});
      }
      btn.disabled = true; btn.textContent = '保存中...';
      var res = await fetch('/api/period-settings', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(items) });
      btn.disabled = false;
      if (!res.ok) {
        btn.textContent = '全月度を一括保存';
        var j = await res.json().catch(function(){ return {}; });
        alert('保存に失敗しました' + (j.error ? ': ' + j.error : ''));
      }
      else { btn.textContent = '✓ 保存完了'; setTimeout(function(){ btn.textContent = '全月度を一括保存'; }, 2500); }
    }
    </script>`;
  return c.html(layout('月度設定', html, 'settings'));
});

// ===== LINE通知設定 =====
app.get('/settings/notifications', async (c) => {
  const settingsRes = await c.env.DB.prepare('SELECT * FROM notification_settings ORDER BY type').all<{
    type: string; send_hour: number; send_minute: number; is_enabled: number; last_sent_date: string | null; updated_at: string;
  }>();

  const TYPE_LABELS: Record<string, { label: string; desc: string; dest: string }> = {
    morning_report:     { label: '朝の出勤レポート',       desc: '当直・出勤担当者一覧 / 今月度平均売上', dest: 'LINE連携済みの班長・指導者' },
    benten_shift_daily: { label: 'ベンテンシフト通知',     desc: '当日のベンテンクラブシフトをLINEグループへ自動送信（設定 → ベンテンクラブ シフト でも管理可）', dest: 'ベンテンクラブのLINEグループ' },
    kancho_attendance:  { label: '班長出勤通知【停止中】',   desc: 'LINE無料枠(月200通)対策で毎日0時の一斉送信は停止。出勤班長はLINE「その他機能」ページ→出勤班長（今日・明日）で確認する運用に移行。※ONにすると再び通数を消費します', dest: 'オプトイン済みの統括・運行管理者（個人宛）' },
  };

  const rows = (settingsRes.results ?? []).map((s: any) => {
    const info = TYPE_LABELS[s.type] ?? { label: s.type, desc: '', dest: '' };
    return `
    <div style="background:white;border-radius:10px;border:1px solid #e5e7eb;padding:18px 20px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:15px;font-weight:700;color:#1e3a5f;">${escHtml(info.label)}</div>
          <div style="font-size:12px;color:#6b7280;margin-top:3px;">${escHtml(info.desc)}</div>
          ${info.dest ? `<div style="font-size:11px;color:#6b7280;margin-top:4px;">送信先: ${escHtml(info.dest)}</div>` : ''}
          <div style="font-size:11px;color:#9ca3af;margin-top:4px;">最終送信: ${escHtml(s.last_sent_date ?? '未送信')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <label style="font-size:13px;color:#374151;">送信時刻</label>
          <input type="number" id="hour-${escHtml(s.type)}" value="${s.send_hour}" min="0" max="23"
            style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:56px;text-align:center;">
          <span style="font-size:13px;">時</span>
          <input type="number" id="min-${escHtml(s.type)}" value="${s.send_minute}" min="0" max="59" step="5"
            style="border:1px solid #d1d5db;border-radius:4px;padding:4px 8px;font-size:13px;width:56px;text-align:center;">
          <span style="font-size:13px;">分</span>
          <label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="enabled-${escHtml(s.type)}" ${s.is_enabled ? 'checked' : ''}
              style="width:15px;height:15px;cursor:pointer;">
            有効
          </label>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
        <button data-type="${escHtml(s.type)}" onclick="saveNotif(this.dataset.type)"
          style="padding:6px 16px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;font-weight:600;">保存</button>
        <button data-type="${escHtml(s.type)}" onclick="sendNow(this.dataset.type)"
          style="padding:6px 16px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;">今すぐ送信</button>
        <button data-type="${escHtml(s.type)}" onclick="resetSent(this.dataset.type)"
          style="padding:6px 14px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">送信済みリセット</button>
      </div>
    </div>`;
  }).join('');

  const html = settingsSubHeader('LINE通知設定') + `
    <div style="max-width:640px;">
      <p style="font-size:13px;color:#6b7280;margin-bottom:16px;">すべての定時LINE通知をここで管理できます。送信先が未設定・未連携の通知は送信されません。</p>
      ${rows || '<p style="color:#9ca3af;font-size:13px;">通知設定が見つかりません。migration_008.sql を実行してください。</p>'}
    </div>
    <script>
    async function saveNotif(type) {
      var hour = parseInt(document.getElementById('hour-' + type).value);
      var min  = parseInt(document.getElementById('min-' + type).value);
      var enabled = document.getElementById('enabled-' + type).checked ? 1 : 0;
      if (isNaN(hour)||hour<0||hour>23||isNaN(min)||min<0||min>59) { alert('時刻が不正です'); return; }
      var res = await fetch('/api/notifications/' + type, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({send_hour:hour,send_minute:min,is_enabled:enabled}) });
      if (res.ok) { alert('保存しました'); location.reload(); } else alert('保存に失敗しました');
    }
    async function sendNow(type) {
      if (!confirm('今すぐ送信しますか？')) return;
      var res = await fetch('/api/notifications/send', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type}) });
      if (res.ok) alert('送信しました');
      else alert('送信に失敗しました');
    }
    async function resetSent(type) {
      await fetch('/api/notifications/reset', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type}) });
      alert('リセットしました'); location.reload();
    }
    </script>`;
  return c.html(layout('LINE通知設定', html, 'settings'));
});

// ===== 車番検索ガイド =====
app.get('/settings/vehicle-search-guide', (c) => {
  const html = settingsSubHeader('車番検索ガイド — 班長・指導者向け') + `
<style>
  .vg-body { max-width:680px;font-family:'Hiragino Sans','Meiryo',sans-serif;color:#1f2937;line-height:1.7; }
  .vg-cover { text-align:center;padding:40px 0 32px;border-bottom:3px solid #1e3a5f;margin-bottom:32px; }
  .vg-cover-title { font-size:26px;font-weight:900;color:#1e3a5f;letter-spacing:0.06em;margin-bottom:8px; }
  .vg-cover-sub { font-size:13px;color:#6b7280; }
  .vg-section { margin-top:28px;padding-top:20px;border-top:1px solid #f3f4f6; }
  .vg-section h3 { font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:10px;display:flex;align-items:center;gap:8px; }
  .vg-section h3 .num { display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;background:#1e3a5f;color:white;border-radius:50%;font-size:12px;font-weight:700;flex-shrink:0; }
  .vg-steps { counter-reset:step;list-style:none;padding:0;margin:10px 0; }
  .vg-steps li { counter-increment:step;display:flex;gap:10px;margin-bottom:8px;font-size:13px; }
  .vg-steps li::before { content:counter(step);display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;background:#dbeafe;color:#1e3a5f;border-radius:50%;font-size:11px;font-weight:700;flex-shrink:0;margin-top:2px; }
  .vg-note { background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;font-size:12px;color:#92400e;margin:8px 0; }
  .vg-tip  { background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:8px 12px;font-size:12px;color:#166534;margin:8px 0; }
  .vg-table { width:100%;border-collapse:collapse;font-size:12px;margin:10px 0; }
  .vg-table th { background:#1e3a5f;color:white;padding:7px 12px;text-align:left;font-weight:600; }
  .vg-table td { padding:7px 12px;border-bottom:1px solid #e5e7eb; }
  .vg-table tr:last-child td { border-bottom:none; }
  .vg-mock { background:#f1f5f9;border-radius:8px;padding:14px 18px;font-size:13px;font-family:monospace;line-height:2.2;margin:10px 0;border:1px solid #e2e8f0; }
  .vg-mock .you { color:#1e3a5f;font-weight:700; }
  .vg-mock .bot { color:#374151; }
  .vg-cmd { display:inline-block;background:#1e3a5f;color:white;border-radius:4px;padding:2px 10px;font-family:monospace;font-size:13px;font-weight:700;letter-spacing:0.05em; }
  .print-btn { padding:8px 20px;background:#1e3a5f;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:24px; }
  @media print {
    @page { size: A4 portrait; margin: 15mm 18mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .sidebar, .sidebar-overlay, .mobile-header, .desktop-header,
    .no-print, .print-btn { display: none !important; }
    .main-content { margin-left: 0 !important; }
    .page-content { padding: 0 !important; }
    body { background: white !important; }
    .vg-body { max-width: 100% !important; }
    .vg-cover { break-after: page; page-break-after: always; }
    .vg-section { break-inside: avoid; page-break-inside: avoid; }
    .vg-mock { break-inside: avoid; page-break-inside: avoid; }
    .vg-table { break-inside: avoid; page-break-inside: avoid; }
    a { color: inherit !important; text-decoration: none !important; }
  }
</style>

<div class="vg-body">
  <button class="print-btn" onclick="window.print()">印刷 / PDF保存</button>

  <div class="vg-cover">
    <div style="font-size:11px;color:#9ca3af;letter-spacing:0.15em;margin-bottom:16px;">LINE VEHICLE SEARCH GUIDE</div>
    <div class="vg-cover-title">LINE 車番検索<br>使い方ガイド</div>
    <div style="margin:14px auto;width:40px;height:3px;background:#1e3a5f;border-radius:2px;"></div>
    <div class="vg-cover-sub">班長・指導者の方へ（社内機密）</div>
  </div>


  <div style="text-align:center;padding:24px 0 20px;border-bottom:1px solid #f3f4f6;margin-bottom:8px;">
    <p style="font-size:14px;font-weight:700;color:#1e3a5f;margin-bottom:14px;">まず公式LINEを友達追加してください</p>
    <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAhwAAAIcCAYAAAC9/nd8AACAAElEQVR4XuydZ5wcxbnu76d7nLNx4DjH45x9nI9tcDzOJieRkyxAJJGFAAECBMhkk01G5ByNCNYmbZJWm1fSRq2kzatdaRX6ztPcoXve6q7u3qme7pl9/vo9HyRV6pqZrqerq976PxYhhBBCSMz8H/kPhBBCCCGmoeEghBBCSOzQcBBCCCEkdmg4CCGEEBI7NByEEEIIiR0aDkIIIYTEDg0HIYQQQmKHhoMQQgghsUPDQQghhJDYoeEghBBCSOzQcBBCCCEkdmg4CCGEEBI7NByEEEIIiR0aDkIIIYTEDg0HIYQQQmKHhoMQQgghsUPDQQghhJDYoeEghBBCSOzQcBBCCCEkdmg4CCGEEBI7NByEEEIIiR0aDkIIIYTEDg0HIYQQQmKHhoMQQgghsUPDQQghhJDYoeEghBBCSOwUreEY3DZuPTRQZp227g7rr82LrK/VzrU+U32M9Zayva3/u3wPKqNPZ/rjCzVzrD80XmiduPZW658bXrK6t26SXUkIIQVly44pa9nIKuvi7getA1qvsL5XP8++f7+34kDlPjZTtWvVYXaf/LzhbOvYjhusJb2PW/Wb18quLCqKynD0Tw3bnf6DlacpHw4VXjAhC7rus9on18suJoSQWJjMmIz7N/3b+mPTRdY7y/dT7ktUOH2o8hDrqPbrrJdHVssuTj1FYTgaJ7qtg1v/ztmLGPTbxvOL8ovrx7otG+wnJpgqPB146b9q/mbt07LYapnsldmNce36p21jLOt2C091V/c9ae3M/JGMbZ+0Z6W+Xvf6zJ2ffr36POuF4XqZ3RjPDtVav1q9QKnXrW/UnWidsvZ2a3zHFpm9pHh8sMravWG+cv1ufbPuJOuMdXfag6tkR+ZzvrTnYeu79aco+dz6yaozrVs3vCizFy0D28bsB5wPVh6s3H+o/PSl2uOs2zb8y5rauV12eypJteHAjAaMxpuW76l0NGVWv2g412rKGLtiBgP3V2tPUK7NT7i5Y2rXNHdufFmpSyevweXwtmuUdH56e/m+VmsM5glG/21l+yj1+emY9utlESVDzXiH9eayvZRr9hPMogSzszKdTjA4xQwGwUsyBouvSeLXZ6uPtR4brJQfQepIreG4qf95a5fKWUrHUvEJg8s5nfdY24rELUvwikheU5CqMwOJafZruVypR6c9my+VRVi7Vh2qpNMJMyqmiTpAfmzFEbKIkuGi7geV69UJM2ySX65eoKTTCe/ti5WKsVbrK7XHK9dExas/NV1krZ8akh9Hakid4RjdPmHt33KF0pFU4YQp3a4iXFyKBVXyWoL0yqj510n40ct6dPrfxgtkEda7yvdX0ul0Wc8jsoi8iTrIvr/iIFlEyXB2593K9erkZb5+tPJ0JZ1Os1qXyCKKgit6H7PeytffiekjVYdbL8b4mjUfUmU4ercO2u+sZQdShRdWSK8Yb5cfUaqh4TALDYcDDUcwmBnFK3B5HVThhdd/N6x/Vn5EiZMaw4F30NjGKTuOSk549/rSyCr5UaUWGg6z0HA40HDowSLZ3zcuVK6BSlYLu5fKjypRUmE4erYO0GykVO+pOMCqHGuTH1kqoeEwCw2HAw2HP9t37rD+0rRIaT+VDl3Z+7j8yBIjccOBNRt8jZJufbjykKKI2UHDYRYaDgcaDn+wO0m2nUqPsMvz3k2vyo8tERI3HFwgWhxC7IA4tpCahIbDLDQcDjQc3iAGhGw3lT69O3M/wTb3pEnUcGDrq+wYKr06fs3N8iNMFTQcZqHhcKDhUGme6LEHMtluKp1CgL6kHxoTMxwI6sU4G8UlTM2Vj7XIjzI19E0NKm0OUhzBzo5oDx+0C8LKfknUNU140jTNjREfCBDBtVT5e98TyvXq9K26k2QRkY3oSR7Bw9IEoq7KNlPp1gUJLyJNzHAc0naV0hlU+oVXKwjRnFb2aL5EabOfELLbK6x4vpRlTFnYOAQI1+81y4IZC5nWT59YcZR9mKFpNm4btT5adYRSn58QKKxUgZnFWiZ5zX76R/9zsgjrqaHq0NFKcdbIys3rZBGp4e6NryhtptIvfK/WbOmXH2fBSMRw4F0Sw5UXr5Zu+rf8SFMDYgHc3P+CHaXxsLarPXV0+3XWdeufiXV6EYPFmZ13KXW7dfq6O6w6zemPTwxWWSesuVnJ5xZCR2+YGpZZjYGohYt6HlLqdQttfDozmJY6OGn5wu4HlOt3CyHNdWfbYMfXqWtvV/K5hWi/eF2RVrAr5fM1s5X7AlUcwgxsUiRiOBgcprj17fqTY5kZIISkn7sinhVEpUs4wqJzy0b5sRaEghsOrN0oxKmvOIsCi2R2a5g/Y/Tf9adaH19xpNIXcWhZEQUEI4SY4/sr5yn3A9NC/B+sCZL3uFLWT1edZR8oWYjxEbOrSVBwwxH1QKgowmr/W/pfjHWKuRjA0eb3b/q3dWDrlaHXEkQVTjMlhMwssMha3gtM6Wu1c+1XVmnYvpkkeGW1bKTBOnntbZEPcQwrrPtKYi1ewQ1HHO4YznD5aLOsimRom+yz9mlZrPRZvnpfxYHW1p3bZHVGwGLFtVs2+CquetPIhqkR5frdwhHgQeAgPpkvqzCH9KG/ZT638HkVAjxIyLrdCnPKMaaSZb6sEPG4WMBMsWy/W3ENJlhfIu8F+eqTmcHv9g0vxdbmYmZk+4Td51jsKfstXyUxS11QwzGwbcz4YtGzOu/iFzUE2DaJd3ey//LRyyPq7op8wOppvBaS9UjhOpKaEiwULZO91jfrTlKuXert5fta53XdJ7PbPDpYEWpnBZ6inhxaIbPbIP4E6pB5pLCuB+Y2DhomOq0vhzjq/B2ZdmIRrRf3bXrN+kCIbfjYlfP8cJ3MnhpqxjvsVw2y3VKI43J135Mye978MGIskSD9ouFce1wgemrH11ifqj5a6b98hEXthaaghuOhgTLlovMRXp+Q8GD7pUmnvMBnoJsuUeMUPDtUK4soGXAjlterk9xai9dqOHxPpvMTgnZN7NiaU8a/RlYq6XT6beP5OflNESVg1n9kHmjkKcebto1G+t7DpIWZLUmCMCY0KzzcrZ7okkVMGzxtm1xfgFe+ae3nNIJZra/WnqD043SF31WhKajhwFOpvOjpKgl3Vgogpr7sy+nqd40LZfF58ZGqw5U6dML73lIFr6zk9eokD2iqGm9T0gRJbtG9tOdhJY1OH8oM1HEQdZCTx3LjfbhMEyScXp02sI0bhkq2Vac7Ni6TxUwbTMHL8qerH686I9Zt6aUKzrT6YOXBSn9OR5gpLrThK6jh+GuzmRMFsWaDr1Gmz+yOG5Q+nY6wF98kYab/3fJ7lVAK5BvaHMHHZJogyZmBtIQ2l/UE6dr1T+fkjzpTA6Vx4eLmHVuUdgbJZARaGDlZ/nSEHSi9Wwdl8SQkjwxUKH06XRXaWBfUcGAVsrzg6YgLRPMDU3P40ct+jSpETTS5gJOGw4GGw0HWEyQaDkcmDQd2TcjypyPTr2JnIj9bdbbSr9MRot8WkoIajqhT5l7yOuiKROc0Q6+3TG5BpuFwoOFwkPUEiYbDkUnDgSiosvyowroirC8i+TGd77SXTL5yC0NBDYeJkwURtprkD0Isy76djjq2rJdFTxsaDgcaDgdZT5BoOByZNBx7NV+qlB9VezdfJosl0wCxOkzE6JC/lbgpqOGIuuBJCvnxOoDkD0KTRzmYy08mD5ii4XCg4XCQ9QRJ3kRpOMyAReKy/Kgq9BN1KWNixmlx76Oy2FgpqOGQFxtVGJCIOaJuvfRSvebwsajQcDjQcDjIeoJEw+HIpOHA62xZflRh9xQxQ9RdZF6S9424KSrDgT3oxByzWpcofRxVJg1H1CnCUjYcUV8/yhtH+TQMR/V4R04ZUQ3HLpWzcvKbIurMqAnDgRDeaQNxUmQ7g5Q2w8HdKea408AhevK+ETdFZTh2b5gviyR5MHfNLUofR5VJw4G9+bJ8nXBqZanyrQgBnqCHB8pz8mMxb5SovthxNLhtPKcMnMcj0+n0vfp5OflN8YWaOUpdOj03nBsQbt2WDZFMC+ITYDYhjXxsRbTXoK+ONsoipo0Jw2FyV9tM5+mhaqV/o4qGQyO8AiDmOHHtrUofR5VJw4FQ6ZiWl3V4CeYzzDkixQoGzbBbl/FuHYvIJBd0Lw010CLNop6HZHY7KNCvV5+npPcSdh9gJiEOHh+sCv2KaY/mS+z1SRIECpRpvQTj9fe+J2T21LA0YwLDhJqHEMnTJCYMRyn/ZgvNM0M1Sv9GFQ2HRjQcZkmb4QAIQ40zQHCYk5/wumAmBH7DwW0I8iOv3y28E/caYLPgTBZEl5X5ssL/6c5AQdnY0STzuYXPK+4D3NZPDdmzOLJut+QrIQlek9yz0b8vMKNjctdVXOC1BI6JkO3PCgszcfaGaWg40gUNRwDyYqOKhsMsaTQchJB0QsORLmg4ApAXG1WFMByI7//icL1164YX7UWJhdY/+p+zHhustEa3T8imGYeGgxASlmIxHJjdwUwPXhPK+2vcwus4nEyMdUNxQ8MRgLzYqIrTcOBUxQNarwj93jxuYeEaTt/EgUlxQcNBCAlLmg0HFjyfse5O65MrjlLqTErfrj/ZfoCM64A0Go4A5MVGVRyGA6um53TcaC8Wk/WlRTi2PY535KVqOBomOu332PLdtlvyZNQ00rV1k72uQLbdrZcyhtRrwSgxDwbL54frlM/ArQcGllt9U/Fu/cQ6E91aFMjk7pQsaTUcmI3+QOUspa606Eu1x9nroExDwxGAvNioMm04MIj/z6ozlXrSqM9VzzYejKgUDcfC7qVKG/106trbZfbU8MRglfWOkLsRdmuYH9tTFHkdxMD4/sp5St97CbOkcc1Mwki/tWxvpU4v+e3YmS5pMxy4NhNb+wuhd5bvZy/QNgkNRwDyYqPKpOHAzEaxmI2sPlV9tNHQ7qVmOIa3b440U4XtoN1bN8liUsHX66KdrPzgQJksghgEZzjJPtcJ95Y4iHoA5rKRBlnEtEmb4Tin8x6l/DTrLRmjiBkyU9BwBCAvNqpMGg68RpHlF4N+3nC2saeWUjMcONdFti9IcUw9myDfSKPELGd33q30uU4fX3GkLCJvSiHSqCnDgdgsYWLMpE149dOzdUBezrSg4QhAXmxUmTIcWCAa5Uk4bULwHxOUmuFAW2T7gvTK6GpZTCoIG+gqq0LfOGYaUQ0HIoKaphTOUjFhOFBG1OizadKR7dfKS5oWNBwByIuNKlOGA7tRZNnFpK/VzpWXNC1oOGg4SDhoONJjOLAoVpZbTMLDroltszQcAciLjSoThgNxNhCGWZZdbDKxgJSGg4aDhIOGIz2GA7v2ZLnFpiW9j8vLigwNRwDyYqPKhOFAUC9ZbjHqSgNfWBoOGg4SDhqOdBgO7MbCjg9ZbrEJMZbyhYYjAHmxUWXCcERdbZ5WnbDmZnlpkaHhoOEg4aDhSIfhwK4yWWYx6os1c+SlRYaGIwB5sVFlwnDgBE1ZbjFqn5bF8tIiQ8NBw0HCQcORDsOBAFqyzGIUXuvnCw1HAPJio8qE4Yh640ir8B4zX0rNcGBdi2xfkMrGWmQxqeD9FQcpbdXJxCs24s+CrvuUPtfp09XHyCLyBrGDom4FvXPjy7KYaZMGw4EHBFlmMQrB2/KFhiMAebFRRcPhiIZDBTezD1ceorTRT3jKGCnAIXnT4Terz1faq9Py0WZZBDFI1Jv7vgZmIL34bv0pSl1+wm6I5okeWcS0oeEwJxqOAiAvNqpoOBzRcHiDs0U+W32s0k4pBGZ6cmiFzJ4acF7GT0JEwn1fxjQV+qYxU0FkyzCHO+7eMN/q3RrPeSqrNnda36o7SalT6oOVB1s39j8vs+cFDYc50XAUAHmxUUXD4YiGgxBSSGg4zImGowDIi40qGg5HNByEkEJCw2FONBwFQF5sVNFwOKLhIIQUEhoOc6LhKADyYqOKhsMRDQchpJDQcJgTDUcBkBcbVTQcjkrVcOCY9b91/MM6rO1qX53ZeZe11ucsAoSuv7rvSSWP1BW9j9lxDbzAgr/5nfcoedw6tuMG6+6Nr8isb1A+1mL3r8zn1tw1t6R+d0nnlo3WWZn+lm13a3amL0wdKOgHtnce0369Urdb53bda62fGpJZbca2T1qLex9V8rh1eNs11jV9T/kOiljIe/q6O5R8buG7+8hAhcz6BljUfPyam5V8bp289jarzud3tcPaacfWOLr9OiWfW+d13Wdt3DYqs+cFDYc50XAUAHmxUUXD4agUDcflmQFBlu8nrMLvm1J3Avy+caGS1k8/W3V25va9Myf/wLYxO2iTTOsnGBMJbophTyNGun+NrJRFpIL+qWFr16pDlTb7aVHPQ7III5yx7k6lLj99YsVR1vD2zTn5MUj/aOXpSlo//aVpUU5+gAiXu1TOUtL66aqM6ZU8OlgROo7G28r2sWrGO2QRdoRhmdZPn6+ZbY37mOrpQMNhTjQcBUBebFTRcDgqRcPx5drjlfJ1wtOoG8xMyDRBWj3RlVPGHRuXKWl0+miVGlEST5gynU4HtS6RRaSCG9Y/q7RVJwxwcRAltgp076ZXc/JjtkCmCdKGqZGcMhBYTabR6Rt1J+bkB39ovFBJpxNmwNzAOIXZluvW44NVOWXkAw2HOdFwFAB5sVFFw+GoFA1H1IEF08ZuTIQ2xymOMo1OXjeOqKdZ4kaeRi7qflBpq06IjhoHsp4gXbv+6Zz8mEGSaYIkT2OOet/wCm0eZZYFmiWMKEOb03C4oeEIQF5sVNFwOKLhoOGIGxoOh6j3DRoOb9FwvC6v+0ZUaDgCkBcbVTQcjmg4aDjihobDIep9g4bDWzQcr8vrvhEVGo4A5MVGFQ2HIxoOGo64oeFwiHrfoOHwFg3H6/K6b0SFhiMAebFRRcPhiIaDhiNuaDgcot43aDi8RcPxurzuG1Gh4QhAXmxU0XA4ouGg4YgbGg6HqPcNGg5v0XC8Lq/7RlRoOAKQFxtVNByOaDhoOOKGhsMh6n2DhsNbNByvy+u+ERUajgDkxUYVDYejUjQcn6k+RilfJwQKc4NIkDJNkGRwpZv6n1fS6PSBylk5+cEBrVco6XTau/kyWUQqQPAq2VadPr7iSFmEEaLGnrh9w0s5+SvGWpU0QerauimnDAQ1k2l0+mLNnJz84FerFyjpdEIEVzfbMoM1AoLJdDqZjABLw2FONBwFQF5sVNFwOCpFw3FShPbgxiufQhE19Ft1Jylp/fSFzKAgb4Drtmyw3l2+v5LWTwiHLbk/c5OX6XRC2O400jLZa72jfF+lvX6a03GjLMIIeNKXdfnpvRUH2lFB3SDc/Werj1XS+ul79fNy8oOVm9fZg4RM66fT1t0hi7BnXmQ6nZ4dqpVFWHs2X6qk8xPMsAxglg80HOZEw1EA5MVGFQ2Ho1I0HBgYzu+639qtYb5Wf2662DcceM/WAevI9muVPFKHtF3lex4Lzjf5a/MiJY8UzhjxCx19S/+L1m8bz1fyuIX/v7H/eZk1VSwbabD7W7ZdakHXfdZk5vOLA5yDgjNMZJ1SezRfYs9meIHZLxgXmUcKZ5R4hcwHzw/X2b87mcet3TNa2L3Uc2BFpFCc8/Pr1ecp+dz6XeNCJVpqlpHtE/ZZKzKPFGbN5OxdvtBwmBMNRwGQFxtVNByOStFwEELSCw2HOdFwFAB5sVFFw+GIhoMQUkhoOMyJhqMAyIuNKhoORzQchJBCQsNhTjQcBUBebFTRcDii4SCEFBIaDnOi4SgA8mKjiobDUSkaDiwO/FvHP6wv1R5nb5H10w9WnmY9OFAms6cG7Ja5pOdh65t1Jyltdwv/j1gXSJ9WHh2ssH648nSl7W7h8zq24wZ7QaMECyUv6F5qH9cu87mF3UWLxTZnk+CIeizSlfVKYeEpFph6gd1H3185T8nj1pdrj7eOW3OT52Li7Tt32Pefr9fNVfK59e36k61r+p6S2ROHhsOcaDgKgLzYqKLhcFSKhuOY9uuV8v305rK9jK/CN8WtG15U2qvTP/qfk0WkAmwFfUuEraBeW4SjbgWNY4swAmZ9tOoIpS4/fSVjGqQJrBxrs960fE8lrZ+8tgjj5i7T6fRQykw1DYc50XAUAHmxUUXD4agUDcenqo9Wytfp0p6HZRGpYN+WxUpbdcJTdRq5MmLUVQzqkj9GjLp6kIiuaQJsc5b1BAnxWNxc2P2Akkanz9fMzskPsGVWptMJW3TTBA2HOdFwFAB5sVFlwnAgXoAstxhlYpBKm+HIN7R5WmBoc4dfRoyuicBWpimV0OZJkwbDUTbWopRZjHpX+f7y0iJDwxGAvNioMmE4rl//rFJuMQprHfKFhiMeaDgcaDgcaDjyNxxrtvQrZRajPletzoBFhYYjAHmxUWXCcDwxWKWUW4zCYJAvNBzxQMPhQMPhQMORv+FANFus35LlFpt+3nC2vLTI0HAEIC82qkwYjuHtmyMfgJRGlY+1yEuLDA1HPNBwONBwONBw5G84wG4N5yjlFptwhEO+0HAEIC82qkwYDoDtcbLsYhJO5ZSr6KcDDUc80HA40HA40HCYMRxLIi5mTqNM3DdpOAKQFxtVpgzHspFVStnFJBwbbgIajnig4XCg4XCg4TBjOEa3T1i7Vh2qlF0s+n3jQnlJ04KGIwB5sVFlynCAqINCWoQj1bfu3CYvZ1rQcMRD1O8WDYcjGg5HNBz+RI3vkhZhOyzi25iAhiMAebFRZdJwbNo2aq8UlnWkWe+tONBatblTXsq0SZvhQARGWb5O2HGURo5qv05pq06HtF0li0gFN/e/oLRVpy9mzLDkgNYrlHQ6mdh9JWmY6FTq0ek/lu9pDWwbyykDx8rLdDp9p/6UnPzgL02LlHQ6nbL2dllEoqTJcOCV8n4tlyvlp103GLxn0XAEIC82qkwaDoCnmE+uOEqpJ42C2XhuuFZeQl6kzXBEGeCwjgWmMY2sGG+33lG+r9JmL709k87EAuA4GNo2HikYm5cBfG20KfQi7XeW72eHIDcNBqffrA6/butQDwO4YWo4dLRSGJbbN7wki7BeGK4PHbn1PRUHWM0TPbKIREmT4QATO7Zav159nlJHWnVu173yEvKChiMAebFRZdpwgP7MjQRblGRdaRJeo5ic2ciSNsMBEEkQK7jxusRPWDS2MaVmI0tTxswiEqpsu1s4b0VO3acNmLq/9z2htN0tfF7LRhpk1jfADMOinoeUfG6hr1ome2VWY2CgQ8h5Wa/UfZtes89/8QKmA9FXZR63cG4MTJYfMFQXdz+o5HMLg4DfeS5JkjbDAXA+De5jUcLOF1p4WLwrhpD9NBwByIuNqjgMRxYczPTV2hOUOpMU3gNjKtf0jzRLGg0HISSdpNFwZIGRw2LMNBmPd5fvb5+pA6MaBzQcAciLjao4DUcWTGNe3vuodfyam619WhZbuzXML5jwjhenbuJpECF844aGgxASljQbjiwbpkbsmazT1t1hr42S99g4hdd2h7Vdbb86QYBJBCmLExqOAOTFRlUhDMdMgoaDEBKWYjAcMwkajgDkxUYVDYdZaDjiBesf1m7Z4Ku0r0PJMrZ9Umm7Wz1bB2QWBVyrzOeW3BXiRffWTUo+t3AMvQ4MdjKPlN/6jSyIASHzuNU3NSizxELnlo1K3W5hQaVpaDjSBQ1HAPJio4qGwyw0HPGAATrsrgh8pzGIpZWTMt8R7LqQ7ZbCwmYslJXgKIGwoah/17jQ0zTUjHdYn64+RkkvhTM2/HYCYNcITuiUeaR2qZxlT4dLsNMFW3Zlei9hLVj7ZDyLPvGqFTu0ZJ1S2A2DV7MmoeFIFzQcAciLjSoaDrPQcMQDdm3IftLpnM57ZBGpANuwZVt1QpAvyenr7lDS6YQdHJLv1c9T0ukktxnjvT62H8t0fvpAxnTIgfGRgQolnU5/bro4J78poixsh1E0FWQK0HCkCxqOAOTFRtV3PYLpkOmDBU6yj6OKhkPlr83RAjz9ofFCWUQqwLZd2VadPlh5sCwi9ExPVlioLYl6OqiMB4ItuzJNkFrFFl3MnMg0OiG+j2m27JgKNdvk1j894oFMFxOGA+aPmAFbuGX/RhUNh0YIvEPMEXUw8BINhwpDmzuYCG0u0wQJYa/dpCW0eb7gdZOsJ0i3bfiXLGbamDAccQR2m6kgJozs36ii4dAIe6zT/L672Pivmr8pfRxVJqdsSwUaDgcaDnOUguF4aKBMFkumCWJ8yP6NqpI2HAhdLC84qpZu+rcslkwDxBuRfTsdyalnQsPhhobDHEkbjj2aL1HKj6oj26+VxZJp8tnqY5X+japr+p6SxcZKQQ3HrlWHKRccVTgMiuQPVrDLvp2O1k8NyaJnPDQcDjQc5kjacBzc+nel/KjCGLCNC0fzpnZ8jdK305HXmT9xUlDDgdMk5QVHFY73bZvsk0WTCIxnblxhD6LSCQvY4tjvX+zQcDjQcJgjacOB6Muy/OnI5ImpM5V9WxYr/TodPTpYIYuOlYIaDuyzlxc8HXmtZCfhWdi9VOnT6egTMazELwVoOBxoOMyRtOG4qu9JpfzpCA87eOgh06NirDXybiU/xXEoqI6CGg4TcR+yMvlDmkksH22OFJNAJ8ZF8QYxGGRf6QQjnkYQE0O2VScEzZL8KqLh2MvDcES9uUrD8dLIKiVNkGQQM8RKkWl0QnAu02A2UdYTJJNT5s8ORYvLotP+LVfYwdRINAa3jRt5UwBhu3nc571ICmo4sCdcXvR0hUETR5mT8CDk8X8aWEeT1Slrb5dVkAynZvpF9pVOc9fcIotIBQ8OlClt1emHK0+XRUReSX9W512yCOvLtccr6XR6cbg+Jz9Cokc5RfQdmXuLfFV4x8ZlSjqddm+Yn5PfFJ+qPlqpSyc8YJiif2o4svnTCQHySHi27txm/Xr1eUo/Tldfr5srq4idghoO/PDlRecj7Hq5Z+OrshriAW48Js0G9NRQtayGWIhsOWx9JeQg+aXa4wp2/kZUcK5I2NdDiM756mijLMI+ZyXs9mvcAL3Ol8GT9XsrDlTSe+mg1iUyu80F3UtDDZZYI+a1xgARMsPGrdm16lCrcqxNFmEEvHPHseeyTi8d1X6dzJ43X6udq9STj45bcxMXkYYA95SfrjpL6b98hDU5haaghgPgBisvPF/hSHd8IEQF70qxZsPUa5Ss3la2D2OiaEBUSAw6y0ZW+QrvYpEu7SC4m2y7W5hpHNF8FzBti2uV+dyqGm+zn+D8GNo2biFiqMzn1uqJLpktB8zwyTxSvVv9zR9eASBwlczjFkxX3L8LHHQn65WSr4RMcYKhhaNuYSCtHu+QVZH/z/2b/h15ZiuMHhuslFXFTsENR9QQwWH1nooDrNPW3WHf2IhltUz22ltfTexG8RL25BNCZhaYKZX3AhPC7BN2XmDWtNDrCtIIZvqwTvEHK09T+sqEMCOZxMNOwQ0HtrSGmdrMR1iwtVvDfOuQtqvsw6MWdN1X8sKitkMz14tFeqYWFen08EC5/GgJITMAnAws7wcmhVdGP1t1tm1AMKMi73WlqqPbr7NfYX5/5bzI5wdF1THt18uPtSAU3HCA3zaGexdKpVOY3uOpj4TMTEyc4UElJzzwI3BYEiRiOF4eWa10AlU8ktsOTbJmS79118aX7e18fsK7R937/nzBIjZM7cp63cKuhbjDurdPrrfrkXW79cRgVazmD2U/nqlD1uvWnZnPq2PLepnVKHhFiF1usm63ns58Ztt37pBZjYEpaHz3ZL1u4buLtSJxghghsl6p54Zr7UW/cYB1YVgYK+8LVHHoj00XyY+0YCRiOEDUgEBUOoTZjbjesT45tCL04tbv1J+ibF00AQbYsKvBsaMBR0THAbakonxZp5d+tPL0WAwYBtjv1c9T6vMSFhHHFbUQhuYtIfsCr1Lj2PWAQfabdScp9XkJ22qxsyYObux/PvR0OwLKxWU6Fvc+qtRHpV/YHo4F2kmRmOGAS8dNSnYIlW7FuXYj7OCWVRzB33B9sh6dsOUzDsJuq80KK9lNg6d1WY9OGJDj4NPVxyh16YRZH9P8o/85pR6dfrzqDFmEEaLOLCDKahzAmH+19gSlPirdwo7OJEnMcICo4YKpZIUFTXHy4cpDlDp1Oq/rPllE3iyJ+H4asxBx8K6QsRayiuOYaROhzU0g6wlSHK/8ot6rSjG0uQSvxqMEVKOS1UeqDre3VCdJooYDU58/WXWm0jFU+oRzU7yCMpmEhsOBhsNB1hMkGg5HcRoOMD9iyHcqGeE1XFyzXVFI1HCArq2bjBxbT8UnrKvwiiJpGhoOBxoOB1lPkGg4HMVtOLBIl+vx0i9E2k0DiRsOsGK8PXToYqqwwpRpHOsDvKDhcKDhcJD1BImGw1HchgMgyuy3609W6qbSoThC3E+XVBgOgBMdES1UdhaVnGA2sFiuUNBwONBwOMh6gkTD4agQhgPgYDcuIk2f9mu5PNat4lFJjeEACEsedRU2FY/wGqVQMxtZaDgcaDgcZD1BouFwVCjDAbAgEbtzZBuoZISTmuPaFj1dUmU4AIIdIcaC7DyqcMIC0UKs2ZDQcDjQcDjIeoJEw+GokIYDoI04YkG2gyqcEG7i6r4n5UeTClJnOAACDuHoXG65Kryw9TXu3Sh+4CYt26MTBkTTYLCS9eiEcx/iYJfKWUpdOsEomQYmRtajE2Yn4yBqvJ44XgPC3Mp6dELsENMguFvUeyJiqSQBop3CgMr2UPEK52glGdgriFQajizlYy3WdznbURAhgmicQb3CsE/LYqVdOuG4ctPUjHdEuqn/ZvX5sggj/KHxQqUuP+FshDhOSf73aJNSl05/bV4kizDC7g3zlbr8hM9u1eZOWUTevDBcr9Sl04GtV8oijPDDlacrdfkJ0VlxWGZSrJ8asg5qXaK0izKvd5bvZ+9EiSPisElSbTgA3kEt3fRv61shwwpT0QSjcU3fU7GFK48CblAYwINCen+o8hDr8t5HZXZjXL/+2cCt2tjXjjDa62I6NwPbxX/RcG5gSG/MKuDziwvMnAS96sLnhVOKe7cOyuxGwDktP284OzCkNwIb3dT/vMxujEU9D1kfrDxYqdctzMb8rnGhvYgyDponeuzYRUEnbmO2ECHh0wB2Ie7RfElgm6nowqvXk9beavVNxfPbM03qDYebZSOrrMPbruEW2jyFmyJuAJjRiPPgL0IIyYLDDs/pvCdyqHpKFWa68Pp3U0Kvv6dLURmOLJg2QljdBV332VPPOM9CfiCUIzzt4An01LW326egjm2flF1KCCEFA6+9sLBx7+bL7DN4cOCdvG9Rr+sDlbOsH6w8zTq6/Tr79OierQOyO4uGojQcfnRu2WgfDU05iuPkTEIIMc2GqRHl/jXTNbp9QnZTUVNShoMQQggh6YSGg6QKLHQ7ov0a67C2q3114tpbrZbJXpnVBnEAsLhP5pE6v+t+OyRzXGC90d86/qHU6xb+3+9ApZ2ZP4ihgDVLMp9bJ6+9zV5UmWaeH66zZnfcoLTdLQQpemV0tcxacuCVJo4Il9cv+6JsrEVmtcGMJRY1yzxSp6+7I7ZFvIRMFxoOkhqiBJp6X8WB9k4OSZSDpPBeNI5IfC8O14dekY90zw7VyiIiBZrCrp24dkXkyxODVUp7/YQtrVibVaogcq+8Zj9hR47XVmeYFZnWT9iBVmpT8qS4oeEgqQFBa+RNU6erRDS97owBkWmC1DBhPmbDIREjLR7QeoUswo72KtPpFOd20HzAokDZVp2ObL9WFlEy/L5xoXK9Op2w5uac/DgTI2oE2kcHK3LKICRJaDhIagiK9yAlQ5vXb16rpAlSHNP4iNYq69HpfxsvkEVEHljiCG1ugigzTtCezZfKIkqGH0UI2gXNal2Sk78YQpsTooOGg6QGGg4HGo7Sg4aDzHRoOEhqoOFwoOEoPWg4yEyHhoOkBhoOBxqO0oOGg8x0aDhIaqDhcKDhKD1oOMhMh4aDpAYaDgcajtKDhoPMdGg4SGqg4XCg4Sg9aDjITIeGg6SGz1XPVm6YOl3R+1hOfpw9INMEqS5jUkxzYOuVSj067dOyWBZhH7Uu0+mE6JNp5K/Ni5S26nRo21WyiJLhN6vPV65XJ0SidYM4HG+PeMjZgwNlOWUQkiQ0HCQ1nLbuDuWG6SecLonjriXfXzlPSeunr9QeH8vhdg8PlCt16YQIlJLj1tykpPPTeyoOsNZlzFYauWvjy0p7dUJk0lLlxv7nlev1EyLQeoW937/lCiWtnzBjWGzHl5PShoaDpAYM/pf0PGw/Ce7WMN9XiF65fLRZZrfBiZPHr7lZySOFsz3iPOb5no2vWn9uulip1y28esHZMV5s3bnNWti91Pr16vOUfG7t13K5VTXeJrOnits3vGT9MXOtsu1uoa+WehivUgOm4w+NFyrX79Zfmhb5Rggd37HFDnuPV1Uyn1t4HbN6oktmJyRRaDgIIYQQEjs0HIQQQgiJHRoOQgghhMQODQchhBBCYqdoDceaLf32QrTPVB+j1Y9XnWG9PGI+1kKWy3sftb5WO1ep160v1MyxTlp7q7Vlx5TMbo1tn7SO7bjB3hIq87n1jboTfY8gb5nstX7XuFDJI/U/q860ysZaZHabJ4dWWN+rn6fkkdq3ZbHVNzUosxthePtm64j2a6zPVh+r1OvWt+pO8l1siePmsdBS5pHareEca8V4u8xug10m36k/RckjdVDrEnuRalqpHV9j7d4wX2m3FBYgIoYJ0YOYFt/MfPdk/7mF3/FR7ddZI9snZHYjYKEzFk3LeqWwW+uZoRqZ3ea10SbrJ5l7gcwj9fvMPaV9cr3MboNt2LgnyTxufb5mtr21Fwtd4wA7s7DAVtYrhfgnL42sktlt8O/4f5lHCvXEtRMM/YN+Qn/Jet1Cf6d1+3tYitZw/Hf9qco2MD+9v+Iga2MM28MeGihT6tJJBqoCczpuVNL5CVvlvMwTtnfKtH76UOUhys0Q5i3K/v7fNp6fk98Uh7ddo9Tlpzdl+qJyLHd3xg5rp21WZFo/IdbFxI6tOWU0TXRbby3bW0nrpz2aL8nJnxawy+XjK45U2uunT1UfHcsW4VIBu6Lw+5P95qdj2q+XRRjhFw3nKnX56Z3l+1ldWzfl5B/aNm59oHKWktZPMFgSbNeV6XQ6MfOwFQdRAqm9t+JAq39qOCc//o5/l2n9hPriAP0j69LJa7t0sVCUhmMw86ORH0KQnh6qlsXkDVyprEcnzDBIvlR7nJJOp3O77s3JjycemSZIy0Yacsq4Y+MyJY1Obyvbxx7cTfPJFUcpdemELbRuMNMj0wRJmhY8Qcg0OuGGlUYwuyHbGiTMDhFvsEVZ9pdOmOkwzVTGEL4lghmG7t30ak4ZLwzXK2mCtEEM1Gd23qWk0enrdXNz8psAM8NRDCD02GBlThn4u0yjE+pDvaZB/8i6dEL/FytFaTh6tw4qH0KQME1umihP5BBmZSSfrj5GSacTgmO5aZvsU9IE6dmh2pwyogQkygo3P9OkIbT5kt7HlTQ6YTYkjeDVmWxrkPxeMRHLjn0h+0unj604QhaRNyZCmyOwmkwTJPkqAa+HZRqd/qvmbzn5TYAZa1lPkGSAPfxdpglSHDPl6B9Zj07o/2KFhiMPaDjMQsNhDhoOs9BwONBwmIWGI+XQcDjQcDjQcDjQcJiFhsOBhsMsNBwph4bDgYbDgYbDgYbDLDQcDjQcZqHhSDk0HA40HA40HA40HGah4XCg4TALDUfKoeFwoOFwoOFwoOEwCw2HAw2HWWg4Ug4NhwMNhwMNhwMNh1loOBxoOMxCw5FyENQIsSDkB6GT33Hm+XBWxP3oiIwqiRK8BroyMyC6Gd0+YQfBkul0klElH494E9q16tCc/KZAkCFZl07/6H8uJz+ifso0QYJhc3PfpteUNDohYFYawSAh2xokGHnizbXrn1b6Syevh4t82Zn5s0uEoF2QjDYKUynT6IS4HzI43qU9DyvpdPrZqrNz8psAQeoQ2EzWpZMMmoi/yzQ6ob44guOhf2RdOqH/i5WiNBzg9MyTvvwg/ITwznEEqlqbual/sPJgpT4vwSB5hdd9cKDMenPZXkp6L31ixVGeobSPX3OzktZPCFeMG5cbhFxHKG+Z1k+Lex/NyW8KhCsPa54QURRREyUIjS7T+mmv5ktldvsp8qu1Jyhp/YSBKK3s33KF0l4/Hdz6d5mduBjYNmabS9lvXsLvWQbcMsXF3Q8q9fkJ4c3lTCR++wj9L9P66eS1t+XkB4jQ+dGqI5S0XoJheXSwQhZhhHM671Hq8xMG9e07d+Tkx9+jDPaoLw7QP2EDuqHfZcTUYqJoDQfAq4ELupfaU+t+wiAmf3QmwbkiV/U9qdTrFs5b0UVxrB7vsF2rzOcWBjbc9PzAWSjnd92v5HMLN0E/h46nmFv6X1TyuHVR5ma3zMM0maRirNWOICrrdgvRQL3MRhZEEJR5pB4YWO5rQhFNEOfWyDxu4cb/6mijzJoqcH0Ivy/bLvXIQIViQokKIhxft/4Zpf/cwne3ajw3eq1p8OByYfcDSt1u4VXKpMfZTQD3gLs3vqLkcQv3El10ZrxauKbvKSWfW5f1PGJHvI2T54fr7Ciwsm63/rnhJXtW3Av8O/5f5nEL5aOeOEE/ob9k3W6hv+N4pVNIitpwEEIIIaQ4oOEghBBCSOzQcBBCCCEkdhI1HJ1bNtoLL/3ktUDSDd6/yTxS2MWhA0e1yzxSQWtAsIhH5nGrWxwR7QV2Fch8bgW9u8PCT5lHKo6TDiXrp4aUet3C6bZxg/Uosl6p8R1bZDbjYH2PrNetoF0hWIMh80jp1vUALIKVeaTkLgQJ6pB5pOJeA4IFfrJOKd26HoDPXOaR8lv3kCawBkO2W2p4+2aZzTi4P8t63cL9PW5wb5b1SuEer8PEGIATdWUet7pCjAH5jofFQCKGA50XdifAHs2XeC50xHavMFvEsPrXb1cFFpyG2SGC+BBeO0wwyGPXh0zvpW/VneQ5wLRO9lpfqJmjpPfSAa1XeC50xKK/91UcqKSXwk6ZuHZVYGD75eoFSp1e+l79vNh+PNjW+u7y/ZU6pd5Rvq91c/8LMrsRcAMLu/r9J6vO9Bwoa8Y7rE+uOEpJ76U5HTfK7Da3b3gp1NbBd2X6666NL8vsNsd23KCk9xLiycjt1qYoH2sJtSsCx4fPW/dPmd3mhvXPhtpK/97M7wg7x9IKtnJiW7pstxR2e53bda/MbgSYv31aFit1eunLtcdbHVvWyyKM8MJwfahdghgDsMjbC/x7mB0iqAf1SfDQ++emi5X0XvpG3YmexgP9g36S6b2Efpe7bYqJRAwHBk7ZkTphx4AbPE19pOpwJZ2f8ONrn8z90q/a3GnfoGRaP2EbpgS7U2Q6nY5sv1YWYf2laZGSTqd7NuZut4MZ+0AI45UVflxxzDIs6nlIqUunE9bcLIvIGzyphzEbWWEA2hQwczQd5kfYrgedse5OWYT1PxkjItPpJFfR4wkXpkqm8xOMiZwBe2qoWkmn024N83Pym+Lb9Scrden02mhTTn7MQCJAm0znJ5h3v10NSfPFkA8nWcWxSwS7OmQ9Ou3dfJkswggIEyDr8hPu9U0T3Tn58fcoYwDqk2DXkkyn0yFtV8ki7P6R6XTCg0Sxkojh+FrtXKUTdZKDE24gMk2Q5F5wDNwyTZDkDRkGQqbRCfviJTAyMp1OcnBas6VfSRMkOTiZIKqJ3K3hHFlE3mDrsawnSP8Wg5MJoppIzJJJ8KQt0+mErdduKsfalDRBkoNTVBOJp8A4CBubJSsMAm6wlVumCVLLZG9OGWkAr3tkO4MEc2CaU9bertSjE0ySabBFWdYTJGyFd4O/yzRBQr1uZoecAcwK5lkS1USi/4uVRAzHV0JOH2V13JqbcvKbCG2OKWSZJkjyvWiphDY3wX4tlyv16BRH9EEToc1N8Kemi5R6dPrfxgtkEfZrDplOJ+zhd2MitDnirsg0Or2/4qCc/KaQ9QRJvjb818hKJU2QGsXTcBowEdrcBAxt7nBM+/VKGp0QTVnC0OYxQ8PhQMNhDhoOBxoOBxoOs9BwONBwRIOGI4JoOPyh4XCg4TCLrCdINByOaDgc0XAkDw1HBNFw+EPD4UDDYRZZT5BoOBzRcDii4UgeGo4IouHwh4bDgYbDLLKeINFwOKLhcETDkTw0HBFEw+EPDYcDDYdZZD1BouFwRMPhiIYjeRIxHFG3xeL4dTeIZinTBAnBsdzgtESZJkgyammUo9AhE9tiTxeGA0FjZJogPTds3nBEOQodimNbLGKryHqCJGM2mCBsIKCsfuexLfY9FQco6XSSwe1w6q5MEyQEG3MT5Sh0CPFg4iDqtlhpOBC0T6YJUvNET04ZaWA622LjiNmAI+tlPTrFsS0W0W9lPUFaKgwH/i7TBElG9g0bGC8rE9ti0f/FSiKGI2qgE7mvHoG/PlR5iJLOTwjuIm8guLnKdDp5BX1B7AOZTievoC9hI5VmJW8gCLkbJWYDbt5xhBxG1FZZl07Yv24aPAFGCXaFIGgISWwaxEqRdenkta8e5lSm0wlButzgxhgl2BWCoMkQ0IhdI9PphGBlcRD1AQVxN9xgRjRMROGsMLuEKMJpJOoDCoynaRCIUdajE+LSxMF/Vh2m1KUTHkjcRH1AQX2SqMEfEa9IEjVujwyEWUwkYjgQVOczIV8lIFy2148f4YfDRJWE2UDkRy9ODRnABgP6k0MrZHZ7gAsbwhrTZgjpLsGXPmzEvD80XugZ5h2vh8IMtLjp+oX4zRcMVj9YeZpSp5fwSs0rzLsJbul/MVQIa5iNJb2Py+xGQPTS79SfotTpJUyxeoV5Xz7aHCqENTSrdYnnWSZ40g9jOpAGob8lKDPsqzLcjOMY3AAMRNhouke3Xyez22AGKIzpeHvmdxRHsCxT4HUoXl3Jdntp7ppbZHYjIArrbxvPV+rz0qeqj47t9RQMcZiZQIwBZ3beJbPb4N/DRBtFPTJ4JMCsEyLsyvRe+lz1bCXiNUD/oJ9kei+h39MaBTcMiRgOABOBd8a4mfhp9USXzJYDzqB4dbRRyedW0MCGg9VkHrcQiVI++UlgGmQ+t6rHO7RfEnxpERlS5nNLhuWVIAIe1iPIfG4hQmucYIDCOgpZr1uYWQo6CClf8HSPMydk3W55DfImwXkHdQF9gf/XnYuAw8ZwjojM51bQORUwP8tGGpR8jhoCw7tjnZCazxGMBsx3nCDKL9alyLrd8jL0bjCbJfO4he+MjCSZRnA/wn1Jtt8trzM7TIOBUtbrVtV4W+yH4WFdHV6LyrrdCjrKAf8v87iF8uX6PQmiHMt8bmGs83pwzoJ+Qn/JfG7FZdwKSWKGgxBCCCEzBxoOQgghhMQODQchhBBCYicxw4H3rVjUdl7Xfb7C1lXduzO808VOEZkvK8QRwGLPHR4L6gDenz8+WGUt7F6q5M3qit7H7HdrcYKFRNf0PaXU7da9m15VtuWaBOsqsHUYu01k3Vld2fu4cqJoGsH7zkt7HlbanxVOQY3jxFw3WC+DBayybrdu7n/B3uIdJy8M11uXaPoC/4c4FWkH612wyFe2P6vzu+63Y+3EvT6oFMBaK+xqwv1R9mNWWGSrO0kZ60hw4rbM5xbuaTjNOs1gDHgiMwZc2P2A0v6sMMboFkRjLSEW7st8bmGnZRy7A4uNRAwH9sWH2VUBITCW1wI/fEFkWj8hEJNcxQ8T8qvVC5S0fsJgGwfPDNWE2lUBYacLvtymwc6Xn646S6nPS9hWe73Hjoa0cGKEoESHtV0tsxsBu7BwVLusz0u7VM4KXBw9XbBjQ9bnpzkdN8rsqQHGLGwsjh+tPJ2mI4A9mi9R+s1PCzKDpQSLssNuz8Wun7jN/XTBmIAYOLLNfsJDjAQPFmF3GWK7dRyBBouJRAzHr1efp3wYOuGJ1A1uKGENS1bYBeIGq/NlGp2wFU2aFhMgdoGsS6er+56UReQNnnZkPTp57UdPA7gRhtni5lYcT2B/6/iHUo9OR/ls5cwH7L6S9QQp7l1M0yXsDT0rr+2L5HUwQyn7Syc8DMndFZj1lel0wrbRNIIZHNlWnRCGQe4qixp/CHGXZjKJGI5SCW1ugnxDm5vgxoiBfKA0PkWWUmjzfDER2jwtyHYGSUYaJQ54fSD7K0jrxHbjNIQ2N0FaQpvPJGg4IoiGwxENhz80HGaR7QwSDYc/NBwONByFh4Yjgmg4HNFw+EPDYRbZziDRcPhDw+FAw1F4aDgiiIbDEQ2HPzQcZpHtDBINhz80HA40HIWHhiOCaDgc0XD4Q8NhFtnOINFw+EPD4UDDUXhoOCKIhsMRDYc/NBxmke0MEg2HPzQcDjQchYeGI4JoOBzRcPhDw2EW2c4g0XD4Q8PhQMNReBIxHN+uP1n5IHQ6ee1tOflxuqVMEyR5vPzSiF82xHeY2LE1pwwTfLFmjlKXTud03iOLyJvbN7yk1KMTjnb3i96aJM0TPUpbg6SLIDhd9mq+VKlHpz83XSyLyBucyivrCRJOPU4jCB4l26oTDDTx5rnhWqW/giSj4Z6eeeiRaXT6Wu3cnPxpAZGVZVuDJE8OP37NzUoanb6/cl5O/plGIobjhIgfklcgn6/XzVXS+QkBW2RQI4SZjXIj+8HK03LymwJBn2RdOsURta91std6a8ZEyLr8lNZAPoiY+vEVRyrt9dOHKg+xj4A3DYKzybp0QiAl0+C4612rDlPq8tNHqg63tu7cJotJBVECBcIMl8Ix3nGBJ/T3Vhyo9JufvlR7nCwicqBABMJLI5gpf2f5fkp7/fSd+lNkEdYDA8uVdDqdsvZ2WcSMIhHDgTNBDmpdYr0v4Iv/0aojrIu7H5TZbXBT+dmqswPDgsNdP535gXgBh4sflMzjFkzJ7pkBtm2yT2Y3wuC2cWvflsWBNwEMpHEMTFnu2/SaPfUp63UL0V1x85dTrGkCrwVgDt9ctpfS/qwwW/XdzM0jjtcpANEIMe0MQyPrdgvhz2G+43o9tXy02frv+lO1YcHRT9+rnxfLTI8purZusn7beH7g4PD5mtn2q1KiB7Mc36g7Uek/t/AAgijIfrNeCPP9sRVHKPncwj3tgNYrYnkVbQqcpRX0ih9jzG4N59hHFniBaKOIvizzuYVI1Ye0XRXLA04xkYjhIIQQQsjMgoaDEEIIIbFDw0EIIYSQ2KHhIIQQQkjsJGY47t74ir19EDse/HRE+zV2PAEvsEX1ou4H7eN+Zb6sfrl6gb2lFquRSfz8a2SldXDr35XPwa39Wi733HVUajw7VGsd2Hqlcv1uYUEdVvwTPdh99Pe+J+z4JrIP3UK8Hr/F3didgRg2WPQs82WFeCgLuu6zF7V7gaPdEXdB5nNrj+ZLrJv7X7B2pnDbeKmBnVjYVPCHxguVzyErjAFYwN29dZPMboN/x/8jncybFcpHPagvrWzescVa2L1UOx7+KnONp669XdnmXEgSMRzX9D2lrOL1E1ZL121eK4uwf9gyrZ+weh0fCImPZSMN2t0QUtgVU6o8M1SjXK9OWClP/JnTcaPSZ376cOUh1oapkZz82AUUtCvDrV80nJuTH8DIvKt8fyWtny7sfkAWQQyD3X2y3/2EAItyhwj+HiXwIupLK3+MEGwQsZ+SMk+JGI4frzpD6QSdzu68Oyf/2PbJSIMbhKdvEh/Hdtyg9LlOeFotVTDLI69Xp/1brpBFEBe7VM5S+kwnuTW2ehpB0PqmcmdFL+t5REmj01drT8jJT8yCARMxV2S/64RZRzf4u0yjE+pLaqDWgW3H2Oov26tTXCEBgkjEcATte5aKI7Q5MQtelcg+1wkxVEqVNIQ2LyVkfwVJhjbHw4ZMEyQZPAwPPTKNTohRQeIDr8hknwcJoczdmAhtngYQF0m2M0gIcZ8ENBzECDQcDjQcZpH9FSQajtKHhsOBhiMAGo7Sg4bDgYbDLLK/gkTDUfrQcDjQcARAw1F60HA40HCYRfZXkGg4Sh8aDgcajgBoOEoPGg4HGg6zyP4KEg1H6UPD4UDDEQANR+lBw+FAw2EW2V9BouEofWg4HGg4AqDhKD1oOBxoOMwi+ytINBylDw2HAw1HAD9aebrSATqd1XlXTn7G4UgfiMAo+1wnBKopVWa1LlGuVyeYNeIPjvaWfabTnSIOx4rxdiVNkGR04qhxOPBQReIDkaaTiMOBetPG0LZxxuHQgTDFsgP8hEijNeMdsgjrz00XK2n99JnqYxhpNGZg6KJ86RHavlR5cmiFcr06PTJQ+qHe8yFKULkP2ZFGh3PyI9IoAnHJtH7areGcnPygdbLXekf5vkpaP53fdb8sghgGR2PIfvfTJ1ccZT+ousHf8e8yrZ9QX1r5XeNCpb1++q+avyUWwCwRwwFu3fCi9ZemRUq8d7fwpPjqaKPMaoOwtOd13Wf9tvF8JZ9bJ6y52eryiaNPzPLccK39tC4/A7f2zPxoHxhYLrOWHDAdezdfply/W7iBPTZYKbMSAQwDZhh050RAmGVrnuiR2W36MyYE5yohbLnMlxXOWcFsKiI3elE13mYd1na1ks8tvE67bv0z1g6epRI7eIiEscMrSfk5uIVX8njt4AX+Hf8v87iF8lFPmh9aYZ7O7brX+s1q//Fw94zmrrnF6tk6ILMXjMQMByGEEEJmDjQchBBCCIkdGg5CCCGExA4NByGEEEJiJxHDgQUuR7RfY30g4NjpT1cfYy8WiwvsRf5m3Una3RXvKt/fXoizZku/zG6zsHtp4EpnrJyf3XFDKrdUZXlooMz6Wu1cpe1uvTvTF1i4F9ci3E3bRu1Fp0HbILHK+sb+52V2QkoeLHLEIkb8FuXvwq1v1J1oPTrovfsJO8q+W3+K9eayvZR8WWFHDhYayngkWa7sfdze/SfzuYX7+6FtV1mj2ydk9tTw9FC19a0QY8CvVi+w2ib7ZHabi7sftD5VfbSSz60PVh5sHd1+nefCU/QP+iloPER/o9+LmUQMx4lrb1U6U6c4gpR0ZwbNKNvcEDtEct+m15R0OiF4UBrBD+ltZfso7fUTVvrHQZT4FbhBLB9tlkUQUtIgYJ78Lfjp7Zn721qxOwOm/n0VBypp/eQVTyRq/Io5HTfKIlJB39SgbSZke/303/WnyiLsgJIynU7z1v1TFmH3j0ynk4wnUkwkYji+XX+y0ok6nbL2dllE3mBrpqxHJwxwcoYCsxYynU4/WXVmTv60cPuGl5S26oTYKHFs+/v4iiOVunRa1POQLIKQkgXbg3WzEl66Z+OrOWU8P1ynpAkSthS7OWPdnUoanTBzmkYwAyTbqhPGADlbc/yam5V0On1/5byc/CBoZlkK/V+sJGI48g1tboK7Nr6s1BMkuT//8LZrlDQ6eTnkNIDXE7KtQcLNzzQfrjxEqUcnxGEhZKaA6Xj5GwjSbRv+lVMGZotlmiDJGBYnRZyhxivQNGIitHnUCMt4hS9B/8h0OqH/ixUajgii4XBEw0FIYaHhMAsNR+Gh4YggGg5HNByEFBYaDrPQcBQeGo4IouFwRMNBSGGh4TALDUfhoeGIIBoORzQchBQWGg6z0HAUHhqOCKLhcETDQUhhoeEwCw1H4aHhiCAaDkc0HIQUFhoOs9BwFJ5EDAeitslO1AmR3EyzbGSVUo9OCJYjY0+c03mPkk6nPzddnJM/LeAoddlWnXatOkwWYYSo8VluYrRRMsNAxEr5O9DpueHcIFE14x1KGp0Qc2dyx1ROGYt7H1XS6bRbwzk5+dPCq6ONSlt1QpCw7Tt35JSBY+tlOp1+17gwJz9A/8h0OqH/i5VEDMeLw/V2FDzZkV76xIqjrA0i8IwJYB4QulfW5yevEOuIVvqfmcFXpvXSO8v3s7/gaQSzFYikKtvsJQS/uXb907IIIyzNPHG8JXODk3V66Uu1xylBeAgpdZb0Pq78Fvz001VnWds8ZiL/1HSRktZPXtGR8ZSPYydkWi8hgvEzQzWyiFSAMSDKw+9FHg++iFb60aojlLReQmRrPOhK0D9hIz2j3+UsSzGRiOEACKd9Vd+T9rS4nzAdOLhtXGY1Bn6MCE0r63ULRkMXQhsf/s39Lyj53Lo6c50yxHDa2Lpzmz3gy7a7BWddMdYqsxpl1eZO+7wAWbdbeB2G83gImYmUj7XY9yX5u3DrwYEy39eeGGgfG6y0LuhequTL6pKehzODY4PM+gZDmfsyIhTLfG79ve8Jq2WyV2ZNFRgDHhmosGcqZPuzujTTF6+NNsmsbzCwbcy6pf9FJZ9bGOs6tqyXWd8A/YT+kvncQn+j34uZxAwHIWliftc91hdq5mj19boTrTs2LpNZC8oLw/XWD1aerrRNCgdS4ZWTnAL2Ak/NMr/Ul2uPt+7dlBsm2yQ7M39wU5b1eulnDWdbKzevk0UolI22WD/NpJX5CynMxJ2+7g7ZNEJmJDQcZMZzy4YXlKlLP+Ek2x07zZ8jEwYs3oty4CAUNJ39UsS1TCvG22URRnh5dLVSl04wQNstfzM1tH088PTNQmqxxytZQmYaNBxkxvPeCKdnQnjtkwSLe6It1oOOaLtGFpPDmevuUvLo9Inqo2J5nXVu171KXUHqmPSfosY0uUyfpN5dfoBsIiEzjhlvOLAgFQt5/IT3peM7tshsRsG7Vqwel3W7tWZLv8xGDCEHhyDhO5EEC7uWKm0J0oGtV8picsBJzDJPkI5o15uY6YDXDrKeIDVP9Mhi3mA6Wx7jVqnRnjF88j7lFu5pfutITAHzW5b5Pcq63dowNSKzGad1slep1626zWu1rzfDjAHobx1YRI/1hjKfowZrU8ILTme04Tiz8y5714W8MUhhGj1oanq6rJ7oCr3i+6/NizxXnZP8kP0cpJluOPCb+Uf/c7KovKDhKB4wOP4x5E6Xz1YfG9vCUWznR7gCWafUmzLfV8ygxcGWHVOhd7pgTY/X5gH0D/pJpvcS+t3LxGGR8LvL91fSS725bK9YwkyEZcYaDjhO+WHo9Knqo2URRvhD44VKXTolvWixFJF9HKSZbjigXSpnWS2aAT8qNBzFA3ZkyGvTaY/mS2QRRgi7HRWCScbDnWmu6XtKqUung1qXyCLs/pHpdEL/u8GuoyjrlWDAkpoxn7GG4+6NrygfRJDiiPsQ1tlmdca6O2URJE9kHweJhuN1faPuRHt3iQloOIqHqN+ZL2ae7E2DraiyniBh279pZnfcoNSjE4IbStA/Mp1O6H83XVs3KWmChNmhJJixhsNEaHMThH2dktVp3GJnHNnHQaLhcHRY69XWTgO7dmg4ioc0hDZH/CNZT5DwnTBNGkKbY/eaTBMkhLhPAhqOCKLhKE1kHweJhsMRpmexIC1faDiKBxoOBxqOaNBwRBANR2ki+zhINByqercOyqIjQcNRPNBwONBwRIOGI4JoOEoT2cdBouFQ9bma2Z6r58NS6oYDh66VCjQcDjQc0aDhiCAajtJE9nGQaDi8hSBi06XUDUcp7S6j4XCg4YgGDUcE0XCUJrKPg0TD4a03le1lPT7NG1kpG469mi+VzStqaDgcaDiiMWMNxz0bX1U+hCBxW2xpIvs4SDQc/vroiiOszi0bZTWBpMFw/HPjSx7RGfMTokeWGlG/M2nZFvvAwHJZTN4U67bYp4aqc8ooFDPWcOC0Sfkh6ISZiDj4U8iIfVlhZoaYRfZxkGg49Nq9Yb4djCgKaTAcTRPdshjiwW0b/qX0nU57xjTD87EV0QJ/Ncbw+V67/mmlLp1meQT+Qv/IdDqh/93gt4Y1QjKdn7CzzCviaSGYsYYDzO+8x+58+YFIIYobjgWPA9w0P1c9W6nTS3s3X6aNx0+mh+znINFwBCvqkew0HMUDjlcIGx0TrwvaJvtkEUbAcROIeCvrlEI47wu6l8rsRkBo8981LlTq9NJXao+3X39I0D9hX6ug372Ot3h0sCLUIZRvKdvbWtz7qMxeMGa04QCYmnt5ZLUyFZpV1XibNZn5UsUJHGr95rVK3W71bB2Q2Ygh5I8ySDQcwXrz8r2s5kl/QyCh4Sg+urduUu5TbuGeFnWmKyoTO7ZalWNtSt1ZvTK62hrcNi6zGQdGQtbtVtAJ02HGAPS3js07tlgVY61KvqxeHW20hgrQFzpmvOEgRA48QaLhCKddKmZZW3Zuk1V6QsNBSOlDw0FmPHLgCRINR3j9cOVpnlPAEhoOQkofGg4y45EDT5BoOKLp731PyGoVaDgIKX0SMxxYMXxl7+PWeV33+eqG9c9am7aNyqxv8K+RldZF3Q8q+dzCVii/JyxERrx306tKHrcW9Txkr/FIO88N11oXdj+gtN+thwfKfRedYvETdsDIPG5d0vOw9dpok8z6BuunhuzjmmU+tzD4dGxZL7Mmihx4gkTDEU3YIVAW0Gc0HDMPfH5BY8D1mTEAMTfiAmPAfZteU+p16+LMGIM1EHHSMNFpXdH7mFK3Wzf2P2+vOfQDGxuCxsMHB8p8x4BCkIjheHao1npr2d7KD95LH606wh7IJGd33q2k9dOvV5+nLF5Cp/901VlKWj/hg0wrUQLx/LnpYpnd2rpzm/X9lfOUtH7yemLFSmvs5pFpvfSu8v0TG7S9kO0LUlJtL1bDAX2m+hjtw0MaDMeJa2+xFnYvNapLMg8sTw/V+D70zFTwsPi2sn2Uz8BL/1l1WCyL5jEm7NYwX6nPTxiw4wBHxYcdDz+x4ihrw9SwLMIOCCnT+gm7anbGvJjXj0QMxy9XL1A6QSc52GOAfHv5vko6neQg8VLGsco0OmHLkTQtaWBs+6S97Uu2VyfEIHGDqHMyjU67Vh2akx9EMT3Qfi2XyyISQ7YtSPK7VCjSYDjeVBa8jdxP+Mx3+BxlnwbDEadKLdpovvxv4wVKH+kUx2CPHSyyHp3woBSHcfx5w9lKXTpd1vNITn7s1MF2V5lOp+qEAtIlYjiwH1l2gE7HrbkpJz9OppRpgoTXCW7SEto8XzCzINsZJMwwucFUnUwTJHlQFwYTmUann606Oyd/ksi2BWkmGw6clxLV4LqFaWMvSt1wQMQBIb5l/+iEEOKmmc53JI7XO2FjcGTF0OYRoeEwBw1H/si2BWkmGw4cQnZpz8PKv4fVO8v3s9ZuVYMf0XDMLGg4HGg4YoaGwxw0HPkj2xakmW44MK28Z1O4SJNe8jrMi4ZjZkHD4UDDETM0HOag4cgf2bYgzXTDAfoyv8GPVYU/y0IKYfrda6JoOGYWNBwONBwxQ8NhDhqO/JFtCxINx+ssH2tS/j+s/iMjbNHLQsMxs6DhcKDhiBkaDnPQcOSPbFuQaDgcLup5UEkTRa3//2AvGo6ZBQ2HAw1HzNBwmIOGI39k24JEw+GA9RxfiHjDdAs3W2zro+GYWdBwONBwxMx36k9ROkAn3BTdINqaTBOkp4aqc8pABFKZRiccY48bY9rACYKyrUGSUfP+ueElJY1OCFIjY5Ic2naVkk4nBGNLC7JtQaLhyAWxNcIGffPSyZkbKA3HzOIHK09T+kenE9bcLIvIGxzpLuvRCRFzR7dPyGLy5ut1c5W6dDpj3Z05+funhpU0QXp+uC6njEKRiOGIepOTZgF8u/5kJZ2fELRrw9RITn5ErkMgF5nWT/+z6syc/GniS7XHKe310wcrD1ZmahBqPEogNS+zENW0IGR8WpBtCxINhwpC3k83PgfM/OdrZiv/HqRiMhy7ZAwZccCgKftIJ5gD0yCC9XsqDlDq8hNMUhzATMm6dPIyC1+rDW9a3l9xkDZEepwkYjjGd2yxZnfcYEeslJ3h1hdq5lhLeh+X2W3wKuG3jedrvzB4EkfIboTR9eKZoRrru/WnaKO0waz8ofFCe9oqreBcGkRvfbfGQCGM8A9Xnm69Otoos9vgBw0Th5u/zJsVvqh/bV7kGWYYoXLP77rfDmEt87n1sRVHZJ5ob7OjxaYF2cYg0XB4g9DgMn2cKhbD8eHMfa5yrE02cUaD2eI5HTdmxoDDlP5yC68bFvc+KrMbA4P3f9efGjgGIBz4mi39MrsREC366PbrrA9XHqLU7RYeLHFWlRctk732g2DQGADTtGykQWYvGIkYDkLShPxhBomGwxus5/hZxDDN+ci04bh74yv2TI1J4dC60R3mp+EJKUZoOMiMRw48QaLh8Aczjx8KeFIzJdOGg6fFEhIvNBxkxiMHniDRcOh5ZLDCXmAn85oWDQchxQUNB5nxyIEnSDQcwcxdE/96DhoOQoqLRAwHFhjesP5Z649NF1m7Ncz31T4ti5UtnFmwPenszrutX61eoORz69iOG6y1MS74xKIjHD0t63Xrz00XW7f0vyiz2mB7KRYCYWGqzOfW/i1X2O+E08yTQyusPQP64i9Ni+wYKGlCDjxBouEIZnLHlL1YUuY3KRqOmQ0WW57TeY+9WFLeZ9zCgky/BZ/4d/y/zOMWykc9qM8LbEpAqH6Zz60/Zca6m/qfl1ltMAZct/6ZwPEQsY5eGV0ts9uMZMbDMzvvsjcPyHxu/a3jH1bnlo0ye8FIxHDgiGr5Y/cTVg+vGG+XRdgDtEzrp09VH23vjDENDIBuV4cUTJZkYXf4QQSrjBsmOmURqeCF4fpI0+hhB65CINsWJBqOcGA309vK91HKMCUajpkNdszJz9BPH19xpBJDA3/Hv8u0fkJ9EtwLomwH99plckmE05ex87Ju81pZhPWb1ecraf302epjE4splYjhwPZM2Qk6nZVxbm7wRYky0EMvZgZE00SdNt494zAl36g7UUmn04XdD8giUgGeEmRbdYKbTwuybUGi4QgPzkuJ+lsNKxqOmQsGzCgDPYQwCG7wd5lGJ9QnB+pTI/5+frrqrJz8AKEZZDqdFnTdl5N/cNt4pIc96OUR75mSuEnEcKQhtLkJDm+7RqlHJ+z3lnw6IG6F1Gnr7pBFpAKGNo+fYjQcAK8DZTkmRMMxc0GIcfn5BQnfCTfT+Y7I0OYIuS7T6ISQ7hKGNo8ZGg4HGo7kkW0LEj53vNM1LcSBkE9QborVcGy3dlhfrT1BKStfmTYcCEYoP5N8haBVZaPJGNRShobDgYYjABoOBxqO5JFtS1LndN4tm/cGxWo4QP342khHCYSRacMRlzAVjzVOxBw0HA40HAHQcDjQcCSPbFuS+lzNbNm8NyhmwwGuXf+0Ul4+KhbDAX2o8mDZRJIHNBwONBwB0HA40HAkj2xbkvpI1eGyeW9Q7IYD2/8Oal2ilDldFZPhgIg5aDgcaDgCoOFwoOFIHtm2JFXKhgPglEpT8TloOGYuNBwONBwB0HA40HAkj2xbkip1wwGqx9uVcqcjGo6ZCw2HAw1HAD9ZdabSATphtbcbBPGKugf7JZ+IpfmAY9ZlPTohKqoER8LLdDpd3P2gLCIVIKKrbKtOiL6aFmTbktRMMBzgyr7HI8cOkKLhmLkgkq3uSHkvPTdcm1MG/i7T6IT6UK+b0zMPgDKdTrs1nJOTH3x/5TwlnU7nd92fk394++bIv6VXRxtzyigUiRgOhHGVHeAnRNdcuXmdLMIOJSvT+ukLNXO02w2nS9V4W6Qv/e0bXpJFWJf3Pqqk89M7y/ezWid7ZRGpACF3owR4emBguSwiMWTbktRMMRxYz/HThrOU8qOIhmNmc0Br+PguiK65WUSbxt/x7zKtn1CfpHZ8jR39U6b1k1d486v6nlTS+ekd5ftajR7xYnBkhEzrpy/XHm9tEcapUCRiOMDSzA3hiPZrrMParvbVnI4b7UHdC3TYZT2PKHmk8Aqif2pYZjfG8tFmOz69rNetI9uvtR4ZqJBZ3wDxF/B6RuZzC33hFdI2TSB6HWIZyLa7dVT7dfaZK2lC/iCT1EwxHACm42MrjlDqCCsajpnN1p3b7Dgn8h4jNW/dP62+qUGZ3Qb/jv+XeaRQD+rzAoEAg8YAjHWIuuvHvZteDTUGVI93yKw2mHlBiHSZR+qMdXdaG6ZGZPaCkZjhICQtyIEhSc0kwwHwQPGmsvAzY27RcBBSXNBwkBlPlCnRuIXDpPzA+h2ZPkhBhgNPdzKPTqYNB8BZSbKeMGrRvF58YNNyJX2SekvZXrKJhMw4aDjIjGd2e7QFr3Hqr03qiZRZlo81KemDdEF37gIzyW0b/qXk0elpcQCWCaZ2bo902iWE9UI4ktsPnIsi8ySpWa1LZBMJmXHQcJAZz7bMgId3sF+smWP9V/XfEtPuq8+12ib7ZPNyuKbvaWuXilnKgOal79SfYvX6vLvOgoVzWDkv83oJ2/cGt4/LIozQuWVjpJOTl/Q9LotQuGPDMrsPZD8XUl+qOc46bs2Nvu//CZlJJGI4sI1nn5bF1rsDzlb4UOUh1nniKN40sTPzB4twPlh5sNJ2t95TcYA9tY3tvGnlzo0vW5+qPlppu1t49bBbw3yrY8t6mZ0QUgBgSH/ecHbg7jjE98FCxLi4qPtB68OZ+7Os1y2cnbNX86X28emS0e0T9inCuDfKfG5hDJBhEbJgtwZCLASFSPhc9WzfRfv4d/y/zOMWykc9XrtDTID+QT8FnTWE/ka/e1G/ea31g5WnBe4UxEPVU0PVMnvBSMRwIJCX7Aid4gjaZYK7MoO0bKtOaQ3ahcV3QTcwt3DDI4QUnh+vOkP5PfoJDwjtk+YfDhA0StalE2L0SBC8SqbTSQbtAt+qO0lJ5ydsJ+3ZOpCTH3/Hv8u0fkJ9cRA1hpFX0C6EfpDp/IQH/aR2qiRiOKJ8USAE2EojUb8ouFmkkajv8WFOtu/cIYshhMQIXssEPcFKYcu9aaIGu/pq7QmyCOt79dGCXclo01i/I9MESc5y4O8yTZB064amC/pH1qMT+t/N+qkhJU2QZBC0QpGI4cg3tHlaMBHaPA3c2P+80tYgYaEfIaRwYL2N/B0GCQ8Tpok6O4G1PxKE+JbpdEIIcTdpCW1uAoY2jxkajnRBw0FI+qHhcKDhcKDhCICGI13QcBCSfmg4HGg4HGg4AqDhSBc0HISkHxoOBxoOBxqOAGg40gUNByHph4bDgYbDgYYjABqOdEHDQUj6oeFwoOFwoOEIgIYjXdBwEJJ+aDgcaDgcaDgCiHpuwqU9D8siUsGCrvuUtuq0R/MlsohU8MxQjdJWnT5adYQsghBSAIKie0q9OFwvi8ibK3sfV+rRafeG+bII649NFynpdLqw+4Gc/DusnYFRSqWWjzbnlIG/yzQ6oT7Uaxr0j6xLJ/S/my07pqy3le2jpNOpbvPanDIKRSKG4+WR1YFhXLP6bPWx1qYYXKUJEHDlEyuOUtrspfdWHGiVj7XIIlIBgnghZLlss5cQeOim/udlEYSQAnDd+mdCB//61eoFsQyQQ9vGQz+Vv7N8P+tfIytlEda/R5tCGwaEad8wNSyLsK7ofcz6j5B98aeMwcFRFG7wd/y7TOsl1IP64gD9g36SdXoJ/Y7+l8CQybR+2rdlscxeMBIxHACHNeH8jts3vOSrBwaW2zH30ww+/KWb/q203S2EQJdhddMGDjDDNJtsu1TDRKfMSggpICs3r1N+l1JPDq2INRrw2PZJ68GBMqVet+7YuMye7veja+sm+94o87mFMUAX3bNmvEPJI4UZXD/jhX/H/8s8UqgnTtBP6C9Zr1vob/S7H5VjbUoeqeeH62S2gpKY4SCEEELIzIGGgxBCCCGxQ8NBCCGEkNhJzHBgi1fFWKu1bGSVr+o3r/V992aKji3rlXrdemV0tTXosUgnC96TYsWvzOcW3q1N7NgqsxoF27VkvVJ4Z5p2sGYHq8dl290KWkfSPzWs5JEKWlPTPNGj5HHrtdEma3j7ZpntDXCyZ/V4h5LPrRXj7Xa6tLN6oktpu1tYABj3Wiv09aujjUrdbrVM9spsOXRnvv8yj1TQsd2rNncqedwqG2vRvmc3Ae5HuC/Jut2K41h6N1hwibUksl63sEh+PHOfj5OBbWP2JgRZt1trtvTLbCQhEjEcTRPd1idD7u7YreEca3LHlCzCCHPX3KLU56V3l+9vPTqYe7QxwI3lRytPV9J7CbttYG7i4J8bXgq1LQqr2y/oXiqzpwYYs12rDlPa7aU/N13suSjuhvXPWm8t21tJL/Xmsr2sxb2Pyuz2jfSg1iVKei99oHKWfUOTwPx9o+5EJb2XcDQ1DFIagdnfs/lSpc1ewnZNue3QFNja+f6Kg5Q6vXRY29Uyu83F3Q+G2t2B39Et/S/K7Pai6t83LlTSe+kjVYfbZjMOsBgUO95knV6a03GjzG4EbMP85eoFSn1e+viKI22TFgdYRBl2t+Opa2+X2UkCJGI4wt7Esrp2/dOyiLzBDUHWo9PHVqixJy7reURJp9OszEBmGgTggiGSdfkJN13dyvEk+XnD2Up7dZKBfPA09fbyfZV0foLpkIP9s0O1SjqdvlV3Uk5+cNq6O5R0OslAPmnh4YFypa06/XjVGbIII8CUybp0ktswMZsVxmxkhS2K8iEHuylkOp0wIMcBtojKunSKYyt+1ECB2HoaB2EfTrLCjAxJlkQMR9QbyPFrbpZF5M3dG19R6gmSnDY+oj1apNHv1c/LyW8CzJrIeoL03HCtLCYVRL2BnN91f05+PEnJNEHCqxE3f+97QkmjE56IJZh9kel0+l3myTmNYFZAtlUnzPjEQdhYC1nJB5SXRlYpaYKEV2puzum8R0mjE57sTQMTJOsJErZCmubktbcp9ej0hZo5soi8QWwmWU+QEL6AJEsihiMNoc2jPrFA8p19GkKbt032KfUECU/xaSRqFMXzuu7LyY81PzJNkPAu3M2SiFEU8fpGEjaYUFb/23iBLCIVXBTRcOC1RxzIeoIkDQdmPGSaIDVOdOeUcXbn3UoanbxmRPOllEKb54uJ0Oak8NBwRBANR7zQcKQLGg4HGg4HGg4yXWg4IoiGI15oONIFDYcDDYcDDQeZLjQcEUTDES80HOmChsOBhsOBhoNMFxqOCKLhiBcajnRBw+FAw+FAw0GmCw1HBNFwxAsNR7qg4XCg4XCg4SDTJRHD8fW6ucqXQacTYtgWe8/GV5V6giQjCB7Vfp2SRqcfrDwtJ78JEEVP1hOkpE8M9OM/I26LlUHMEIFUpgkSomS6uarvSSWNTu8o3zcnP/hL0yIlnU4IKJVGFvU8pLRVpw9WHiyLMALipci6dLp+/bM5+RGcTaYJkoxaOj/itlgENjQNtsVG3SKMoICmOWXt7Uo9On2p9jhZRN4g2qqsJ0g4eZYkSyKGI2wkx6y8Iv/lC8I1R/nxfr5mtizCuqbvKSWdTkdnDIppEG0TN3pZl5/wRN67dVAWkwp+23i+0l6dHh+sysmPG3LYKIwQgoQhNLIbhEmW6XT64crTc/KDBV33Kel0OqvzLllEKsCx3bKtOv2i4VxZhBG+W3+KUpdOMuLphqnhUJF4s8JMDQLquXlooExJp9MfYwp29eUIs8O4v+HYBdPgGHVZl077tiyWRRjhU9VHK3X5CYHfpIkkhScRw9G5ZaP1zbqTlC+Fl/BlRVjhOMAT3FtChMFGQCoMRBKcgxE2yBNep/RNxTPQP5EZeHepnKXUKYUBFqG/0wpC3mP6VbbbS7M7bpDZbfAUE8Z0IJqkX1Ckeev+GcqM4oZX4xHCGgHidm+Yr6T3EqKryld1aQKvM2WbvfS56tmBZ9xMF4S8/0SIoxAwqJzpY95u7n/Bno2SeaRgNh4ZUI8xQMj7I9uvVdJ76Ys1c6zWmAY3BKpD6HRZpxRmheQMoCkQ8v7A1iuVOr30tdq51tqYIhsjoNuuVYcqdUrhIcvrGANSeBIxHFkQchhfRj/Jp884QDhsWa9U0AFyiHon87gVl9FwA1Mm65WK+wA5U+CQOdl2t4Y0h+kBPJ3KPFI4D0LHSMY0yDxuhQkPjydrmc8tGVY9rcAQyba7hQeIQiDrlZKRgCWYAZN5pOTMhgTfPZnHLRwQFzcwP7JeKfn6Nw5wf5b1uhV0QKIJcG+W9UrFfYAcCU+ihoMQQgghMwMaDkIIIYTEDg0HIYQQQmInMcOB4+GxaBOxFPyEkzt16x+wWFLmkbp1w4v24s64wHqDK3sfV+p169Keh+0YEX5UjLXaJ3PKfG5hu+aGqRGZ9Q1wlLjMI4Utcn7vqPGeEwtKZR63cDrri8P1MiuJCSxUXti9VPkc3ELMiTgXnWLNAnZjyXrdurD7AevV0UaZ9Q0Q0+KynkeUfG5d3vuo1T65XmY1BtY43bnxZaVeKexGwRqJNINt7fgtyra7hSPkEbcjzdSOr7EuydwbZdvdQlycQqwFyQe0D+2UbXcL14nrjZPHBiuVeqUQl8VvDCgEiRgOdEzYvfUIBuW1ECvKEck/W3V24MLP6YCj4cPsDoGwUtor/sV9m16zV9fL9F76aNUR9kJECXZsyLR++s3q85UbKhbThd01BMEokni5bv0zSr/7CTt7ghZMTgcYmc9WH6vU56ebMoOcpGysxd4dJdN66d3l+1srN6+TRRgBsU5kfX7CbpS0gp0nsr1++k79KbE+bOXD00PVoXYIQtj2H2aRdhKgXWHDEuB6cd1xcPyam5X6/IQddHGMh2FIxHCE3TKYFZ7y3GCHQZR99ZAM8GQCbMGT9ej0h8YLZRF2HAeZTqcreh/LyY+BJqxhyUruzYcBlGl0ggkk8YJtprLfdUJsBNMg/o2sRyevAE9ht09mNafjRllE3iDmjqxHJ2yJRmCptIEHBWzble3VKa4BLl/w4CPbqtO5XffKIlIB2iXbqhOu2zSYyQpr3rKqGm+TxRSERAxHvqHNEbhKpgkSXjmYxkRo809XH6Ok0+m0dXfk5DcR2hzTrzJNkJKclpsJvCvztC/7XCe8sjCNidDmv1y9QEmn057Nl8oi8sZEaPM0kJbQ5iaIMqMKHdN+vSwiFaBdsq064bpNg1kWWU+QsBwhCWg48oCGg8QFDYc5aDjSBw2HOWg4AqDhcKDhIF7QcJiDhiN90HCYg4YjABoOBxoO4gUNhzloONIHDYc5aDgCoOFwoOEgXtBwmIOGI33QcJiDhiMAGg4HGg7iBQ2HOWg40gcNhzloOAKg4XCg4SBe0HCYg4YjfdBwmIOGI4Dv1p+idIBOp669PSc/9sjLNEGKYz86YgbIenT66aqzZBHWlyOaL7kfHVHuZJogLRtpyCkDMRxkGp0QAyWpwDEzhQ9VHqL0u06IBmoaRNCV9eiEY9Mlf2y6SEmn00GtS2QReYMYPLKeIOGU0bQBkx813sK9m16VxaSCqPGH5q65RRaRCtAu2VadcN2mQTBIWU+QXkgoYnQihuOMdXcqHaCTV4TOH6w8TUnnJ0QDxRHypnl0sEKpSydECZScECFCHAISeYWQ/nrdXCWtn3atOlSJSgmH/I6Q0SAhRG0k8XJA6xVKv/sJgxCCW5kG4fjDRgSGDmm7ShZhh+SX6XS6fcNLsoi8Qdh+mCFZl58QwExG400Lv159ntJeP2GWzCtKcxqY33mP0l6dnorhgdEEaJdsq0647jj4dv3JSl1+QmRUHFmQBIkYjokdW60T195q/7A/U32Mr75Vd5J9vocXnVs22tOvMo8UwprHEWU0C26omCaT9bqFWYx56/7pGWYYN0PMlHyxZo6Szy18ofxuxjiD4s9NFyt5pHZrmG9VjnlHmMNrlh9l3LfM4xbCXOMJtN8jvDoxC2bx8Mru8zWzlc/Bre/Vz7MeGaiQ2Y3xwMBy+1WgrNcthFZHOHCvM10wE4ab7FdrT1DyuQXTjPOE4hrocXbTLxrOVeqVwoxM62SvzJ4acLYUorfKdkv9eNUZiT3FhgHRonE8RdAYgHsrzgtKM2hf0BiA68T14rrjADNyf21epNQr9fOGs63ysRaZvWAkYjgIIYQQMrOg4SCEEEJI7NBwEEIIISR2aDgIIYQQEjuJGI7tO3fYW+5wVC8WMvoJCyH9VidjUR0Wnso8UrNal1gtPovAGiY67d0AMo8UYl+MiJ0dWRDf409NFyl53Ppt4/n2wiKvraTbdm63Lu152F59LvO59ZemRb6LwDZuG7Vjlcg8Uoe2XWWt+X/tnXmcHVWB7/99b0bHUWdGHUbcl+cyo350Rp1xGYeZ0Tduo6OyyCJLCBIRgywCAsomIKBsIiAIsstOgGERCItk6XQ6nU46ayfpdHfWTtJJpzvpJNS7v5p3qbq/U3WqTt9Tfeve/n35/P5ocpa6t7qrfnXqnN/ZtYGriwLAUmOs5uFzEBf+vcicBKxQOG7ltUa/LGQJINsmCUy4xuRsrhMXsjawAitpUrQoH5hk/p3lVxrnkYUVdIN7dnD1EEwyxzWJ68SFa9rlAw+F13sG10JMuMe1kevFhXvAjJTMCExSPmX1LUYdFia6F5mrguPDcXK/ceFz4vMm3QN8gPOE88X9snDecf4bRUMMxyWVGywv1UnT/3rpm4mzal2Wh71l3hRjKShOEJaIctk0YQYwM3OoK1yqymXTdHXlF45BrgaXS9OfzjowWLBzNTcRfLbrTKNsmjBTGauERHFgZQd/7zbducl/VgIu8lgZwn2lCbPs+WKIUDmX5dK44Ilyg/Cwt8+bapy7NOEmxcwbXum0XPqChDiAXww8bJRLE+4BSXEAX+m+0CibJiyLTlpFVS84Lhwf95cmfO4iwHnivtKE84/fg0bQEMPhkqEBIbcjDkYbXG70EGd5uGZoIOuAlzS5ZGhASX+8LhkaEGd5YIkql8nSiwUuExZBuGyRv3ObDlx6KTdRNxi9436yxCOBrhkab6tcyES5wUMSn7cs8SiHa4bG33eeUlMfuDwkQRjJiIMbpovpgdJGy+sBx8X92ITP7RucH+4nS/g9aAQNMRxliDa/fdNzRpkssUNulWhz4Re8YuPv3KYvdp/PTdTNrB3LjH6yhCfXOD6izUW5QKQ1n7csIRgwzg9X/9YoYxNyWph6o83xGpnLZOn3m/9Y04YPFG3uhgyHg2Q4RB5kOERZkeHwiwyHGzIcDpLhEHmQ4RBlRYbDLzIcbshwOEiGQ+RBhkOUFRkOv8hwuCHD4SAZDpEHGQ5RVmQ4/CLD4YYMh4NkOEQeZDhEWZHh8IsMhxsyHA6S4RB5kOEQZUWGwy8yHG40xHC4rsFGOFac8azBnjm0qKaN/97abpSxCQFISAWN47oGG8mqDNaoczmbEJoWB2uwXTNJ0raoF35Aoit/5zYht8M32GKd+8kStriO8+v1TxhlbHpP+7Sa+qJ8IDmWz5tNCLXilGUEeXE5m5C7xLgEVUGcxYRMJAQhcjmb0pKa6wHHxf3YlJTFVC84Py7hYxB+DxpBQwzHTRueNr6ANL1m9iHBkoRYWsTVctk0IXGRQ7tgWt47f5pRNk2IiGY6hlcFr5p1kFE2TXdtNhMlr1n3mFEuTa+bc2hiNPk3ll5ilE0TDA4bJ+EXhOrkvQCgXBEXwpcr//3LorOM/tL0b4t+wk0E68e2Bm+ae6RRNk0X9t3LTYiSMVb523cZXTh42WXcRGhm/3z2t42yabquYlwZRP9zuTS9uvKw17Wzl5sIjl5xtVE2Te+ff0IwSvcAH+C4cHzcX5rwuYsA54n7ShPOP34PGkFDDAd4eMvcYFrPdeEvTZqwV8rCnWu4aghumtifhOuwfrr27nDflSQ2jg0FZ/feadSJC69Nrt/wZOJ+AKB9uCeYvuomo15c3+u5PhxRSeO+wVnB8Rnfxcmrb040XgB7WFy57hGjDgsppfxaSBQDIo9PXHWjcQ7iwqtCHnnzyXDFVGNEjPtlXdr/YGrUMQzuaWt+Z9SJC2b8jk3Pc1VRUrZWrofnrf29cR5Z2Ioh7ca0eGRt+GqF68SFa9qDg3O46is8unVeeG3kenHhHpC0nQPAPQCjcFyHhRHyzXu2c3Vv4PhwnNxvXPic+LxFgfOE88X9snDecf4bRcMMhxBCCCEmDzIcQgghhCgcGQ4hhBBCFI4MhxBCCCEKpyGGAxN4kFWQtazp9XMOCyesJTF/uCfXbOu3zJuSuv4aM4b/pu1oow4L+RlJs6TLAjIXsBKHj5v19nlTw8m6Sdyw4algv7ajjDqsTy08PVg60s/Vw0m1WJOeNXsdM7oPWXZ5OKGxCJ4bWhzOSOd+We9q/27w+Nb5XN0LmMSLCVpYYcX9xoWl1kcsv8JYQeWLp7YtCJeqcr8s5CQ8W9B21SP7dofLfvFZud+48Htz7MpfpU5SrBdM2MuTefPBjhODFxu0ZDAPmKz5yYWnGcfN2q9yXfvtxqe5esj9g7OCt8471qjD+vCC6alL6M/svT34i8r1mevE9SeV6/uXuy8IMzMYTOT/+pKLM+8BWJmHyalYdcVgsubHOk826rD2b5sS3LnJXCHYSuA84XzxZ2fhvOP8N4qGGA7MXuYvwqZ7EgzD+3LcVKrCTQ5hYXF6dq3P/GWP66MFBLb4AH+IMBJ8vGl6beXCzhcAXMRcck0+3XVGTX2AFUNcziasDvINbla40HJfaUJQ1XbKGPDBZQMPGX3ZdFHffdxE3WDVyRvmHmH0lSYsfy3C+GBWPPdlE1Zb+Qaz8vHwwn2lCTeotFVpjeYTndlmoyrc8JeNDtTU3zC2LdMIxwVjzmDlCZezacrKa7iJcIUWl7MJQY1MnoesqhBf0LtrEzfRMuA88WdOE84/fg8aQUMMR56RibjgcOOMJ2WOk9Uw6sFlbEK4VtrSwUYynpS5Z4YW1rSBJyEuYxPMCV+Q8aTO5WxKyn2ol+6RPqOfLGF0yDffXPpzox+bMNrnG6SGcj9Z6kxZflgPSFHlfmzC6Jdvnt++2OgnS0jwLRsYOcub71LVbXSjRsowl8nSurHahzWkHXMZm5AszWDUmMvZdELPDTX1sbyfy2SJ06ZbBZwf/qxZalTadEMMR6tEm5cBH9HmeJ3CZbLEQ9+4UXAZmz7XdVZNfR/ghsn9ZAk3I9+0SrS5D/598U+NfmyCWfMNDDb3kyWY17KBBx4+zizdvPGZmjYUbd56jOehkx/AJwoZDgfJcESS4UhHhiNChsMfMhwRMhwRMhwZyHD4Q4YjQoYjQoYjQoYjQoaj9ZDhyECGwx8yHBEyHBEyHBEyHBEyHK2HDEcGMhz+kOGIkOGIkOGIkOGIkOFoPWQ4MpDh8IcMR4QMR4QMR4QMR4QMR+shw5FBvYZjPMuAfBiOoQIyG+pl5eh64ziz5MNw8Bb3ZTAc2FmY+8kSdnX1TRkMx+xxGA7sfOybZjUcaTszNxKEqPFxZsmH4eD8ijIYDoRHcpkstarhwPnhz5qlSWU4vtR9gfEF2HT5wEM19XGzQ4AVl7MJyaRxkCbIZWx649zvJKbdNRpchBBqw8drEyeFIpGSy9iEtDrmdMe1+UeuuIqbqBsEPLnmFKzdvZmbqRtsS8/92DSt5zpuom7Wj20Ns2O4rzThe+NAOB8gPZT7sunk1TdzE3WDkD/uxyYEZu3YO8rNlII8ychxzaQEWSQmcxmbkBCL/I84V6171Chn0+crppP52pKLjHI2cTjevsq1OCvplDVnx/KaNloFnJ+sJF9Wo5KzG2I4MNyb95cFUcO4kTD4pc97czl8+RVcPTQP31h6iVE2SQi6wihAWbmk/4HcN5epK6/l6uEfb96AJlyMOUwI4DXXO9qPM8on6a/nHlnYkPVP1t5l9Jem6atu4upeWL1rYxipz/0l6c1tx4SjVEVw6upbjP7ShKjqIkDSZd70VxjZIgwgQHAU95emC/ru4eqlASF9+BvkY04SRtqSHpIQu89lk4RrCj/sAYz0fqgjO0YbQsJr0ihi2/CKMOmXyycJqdKDe3ZwE2G6cd57wMHLLuPqLQXOU957AM5/o2iI4QC4QWGI65aNz6Zqxpa28Ak+DURy/y6hXlzYW8MG9pDgOnFhv5UyDq8yeJ3Ax876o2WPCJiOp7d1GnXiwmuo5RSVHAcXIsQec7247hucFWwcG+KqXukYXmX0yyr6aQd7ReA1HvcbF/Y0SLqQ+gQXdu6XVcSrlDgY/sZn5X7jwu9N0XOk8KDD/bKKSFv1DUwcTD8fe1x4jZRkNqrABHCduHBdtT0Fj+4bC6/PXC8uXN/7dw9y1VfAKBy2reB6cWHvJ1vCMx5ccI3menHxKE+rgvOVdT9MMn8TScMMhxBCCCEmDzIcQgghhCgcGQ4hhBBCFI4MhygVeI8/c2hR+N41TZhzYHs/jXXpXIdV1ETNKnjHjTkD3G9cL21fGpZLA/NAuA6LV1+VEczDwvwhPva48F3tsnwXWEHDdVhFz7/APCdklXC/tVpU+PL5jWPbEvqtlW3+RSuBiAT+7KysCer4d67D4h1z42DV5NwdK4w6cWHuxLBlLspkQYZDlAYsVX7D3COMWdVJ+sLic40sEHDFwIxwVRGXZ2FG9/kFrUbAZLj3zz/B6DNJ750/LXFiHSbw5l3JhdUIuBmWEWQEvLv9eOOYk4QVaUkTih/b2p57GTxWI9jM6HjB0sN/XXSO0V+SsIQeOShFgMm3r5l9iNFnko4qYOl5mbhj0/O5IwG+13M9Vw/B/+eySUI/6I/B8umPd55qlE/S/m1TwoUOkxkZDlEaPtt1pvFHatOdm16oqY8//j/NuWQQwpI625PLeDnFYTkq9INVN3ITwcc6TzbK2fTQljncRCnIe0Gv6ow1t3ETuc1bVciV8Q1m/3M/Nh1QMSdF8LZ5U42+bIKJb0VgKt8090jj89qE1Wtx8DOXsQn9sZnFclQuZ9OBSy+tqT/ZkOEQpWG/tqOMP1Cbzl17d039siSNuoYaIQiPyftEX9VlCXkJZQChT3ysNn0rIWk0b75AVchn8M3ZvXca/diUFI5XLz6SRlsFH0mj+JnLZAn9xjm+5zqjjE0fXfDDmvqTDRkOURoQCMZ/oDax4WilvVT+3NFwXNr/IDdRCnxEm3OZLBVhOM7qvcPoxyYEv/nGx14qrYKPvVTGYzg4jReR61zGJkS6T2ZkOERpkOGIkOGI4DJZkuGIJMMRSYaj8chwiNIgwxEhwxHBZbIkwxFJhiOSDEfjkeEQpUGGI0KGI4LLZEmGI5IMRyQZjsYjwyFKgwxHhAxHBJfJkgxHJBmOSDIcjUeGQ5QGGY4IGY4ILpMlGY5IMhyRZDgajwyHKA3Yqp3/QG3ibcQRqsNlsoS0T9/819KLjX5s+kr3hdxE7tCvqn4x8DA3UQr+7+LzjGO16aCEbcTzbsde1a/XP8FN1M1P1t5l9GPT2+dN5SbqBkmsrkuEsZNqK7J1z7DxWbOEnarj4GcukyX0G8c1Z+YfOk+pqT/ZkOEQpQE3Xv4Dtem/t7bX1McF+S/nHG6USxMSG/kC4gMYIe7LJtzMGARHcTmbEKldRs7svd04Vpsu6X+Amwj+ceGPjHI2IWbaN9gmnfuxCaazCD68YLrRV5pgTlo54vw97dOMz5wmpA/zdgb4OU8qcVXoj7lxwx+McjZNXXktNzGpkOEQpQEXgI8sOMn4I2XhInHy6pu5esijW+eF0dJchwVjcvfmF7m6FzD0/dWcr1XwOgUJqcySkb4w6pvLs/D0j+H+soJ9RRBDz8edpK8vuThxbxm8KkMEPJdnIWWWR718gkRYpNNyvyyEO63atYGrewFm6p3t3zX6ZL169sFhCmYrgxTVPMmrf1b5LtJes+H/49+5Dgv9JKW27n15X3DkiquM8kn6TNeZwYaxbdzEpEKGQ5QO/FGu3rUxVUhczAIbuHG9uDiiuAgwesL9xpVndAX7snC9uJJu0GUEG9HxsceFTfuyQAw914vLtvmbL2Amud+4sLHaRID9d7jvuMYS9hlqVfp2bzY+f1xJey7Fwb9znbjQfhbbK8aa68XFcz8mKzIcQgghhCicpjYccJXPDnUF165/PPjh6t8GR6+4Ojhk2eXh++/Jrm8svST8Pk7ouSG4at2j4XyHiXr6EkIIIZimMxx4t42NlP5p4elOE36k/9GHOqYH01fdVMjqDCGEECKNpjAcmJhz+6bngk8uPM24gUrj1/+Z/73glwMzwvfSrQJ+V7CVODI6bPrNhqdS33MP7tkRfi9ch/X41vlc1StPbusw+mRhOSzvYFkFn++mDU8bdVjIakh7z71xbCicfMh1WE9v6+Sqr4BJnxf23WvUieuivvvCh4k0MBmY67CuqJyztHkxu1/eE1y/4UmjDuu2ynUGv0NJYA4JduXlOqznhtKzXdqHe8KJrVwnrov77w+Wjw5w1Vd4cHCOUYeFUU1M2C2Ktbs3h9kv3C/rjwkTLX1yz+Y/Gn2yMDF0uMBrHCYI/7z/AaPfuM6vnPM5O5Zz1UlH6Q0HjEaeGerS+IVt4XEhTbsBNxPIceDPl6b/6D7PmDyKi/S72483yqYpaRmnD2AkuK80vaP9uMQbbd6VMlDSMk4YL2yzzmXTdM26x7iJ8OaL1SNcNklYLYAbMuOyzBgmmlf94By7BJAdvvyKmvoAE5n3azvaKJsmGD3mia0duUdlEfyGXBnGZZkxRjOLmFQMs5FnJRiEpbl3bnqBm/ACRmq5vzQh/6KI6xtW1uXNzMEKJ5jFyUxpDcfSkf5wLgKfNKk4/W3Hidans7KDFR38mbKE37M4d2x63ihjE27IRfCuHEsf47pl47M19Xt2rTfKZAk3kjgYBeIyNr1v/gk19cGhy39hlLNpWs913ITTjR7CU28cZFFwGZtwk+RRI4wYcDmbPtZ5ck198LUlFxnlbOKl3zBOeW9uVWFkyDcYjeJ+bMJyUN/APGDpL/dl08yhLm6mbvB6n/ux6fMV4zuZKaXhwBDvax2jnSU/ggs/p/JHlDasXGZ8RJtjWJ7L2ISn9yKoN9p81o5lRpkszRteWdPGzxxvLMg2YVxGFqAios2fGVpolMlSN73e8RFt/qmFpxvlbDqCRlrKEm2OCfrcj00YdfKNj2hzHyja3I1SGQ7c5FxPoFSMcKMo8h1wEchwRMhwRMhw+EWGI8L1fiXDURIQ5oSkQT5BUuOEYWG8pmgWZDgiZDgiZDj8IsMRIcPhRikMB2bIf7n7AuPkSI3X33X8IJw82AzIcETIcETIcPhFhiNChsONhhsOTITKm0UvNUaf7jqjKZbOynBEyHBEyHD4RYYjQobDjYYbDpflf1LjdFTFFJYdGY4IGY4IGQ6/yHBEyHC40VDDMbtyUXzVrIOMkyKVU7z0smzIcETIcETIcPhFhiNChsONhhkOrKPG/AA+IVJ5hRtKmSeRrhhdZxxzlvgmizRKLmNT0k3WB38990ijL5v4Jjse88U3WVfztX+beZP9T4fwMYhvssDVfP12Y23o1njMF3YbjuNqvpJusv+26CdGOZtwM4uDuW55Q9SqunvzizVt+MDVfBVxk0VyKJbwc182PbKljZupm5MczRdM52SmYYYDCY18MqTy67Dlv+RTWRr2BS8HH+w40TjmNCGhk7c0R3KgS6AQgq2KwGVeE0YJOcAMht4lMRU3SM5eWTTS63SDO3blr2rqA2ysyOVsSkqlPHDppUa5NL1m9iHhduBxsALOJTH1wwum19QHMKZ5U0KhH6y6kZsII+K5nE0PbTFTKV0m179+zmFhHLtvXtjeHYajcX9pOmPNbdyEF1yCId8w9wgjzM0HT21bYPRlEyLOJzMNMRxY9YA/Bj4ZUvmFCw2PCpQJ7GuAG9R72qeFaZ1pQpQ3P9FXwUUEFzOuExdSWZGKuW3vTq7uBWSgYKdf9MN9x3XAorNT93RZNjoQvqKA8eB6VeF7+lalDEaHkkBS5ee6zjLqxYWRyhMrN1iOFAcwgdhnAkusuV5ciJ6+et2jXD0Ese3Hrbw2NJNcL65/rZwzvD5JAuYJy+65TlzYQuHgZZcZhqXK/YOzgs92nWnUiwtx4n1655wAACKlSURBVEgITZpkDUOHG85HK0/8XC+uT3SeFtyw4SmuHoJXCVNWXhN8oOP7Rr24kGj5YoH7mNy1+YXwaZ37jQvG7fQ1txqm3hcYbYUxR8It9x0XtjAoch8T7N30jwt/ZPQbF0Z5kEpaRLx6M9EQw/HTtXcbNzKpefSNpZfwKRVCCCGsTLjhwGZCeTf+kcopvDvF07MQQgiRlwk3HJgpzDcwX3rdnEPD3UKxxXTb8IqgjzajanU2jm0LFuxcHTwwODscdnXd9MpFGB4UQggh8jLhhsNly+y8gtHAa5qkd8iTGcxqx6qLN7cdY3xn9QrvJXlrdyGEECKNCTUcmDyEWeR886pHSMEc2O1/JnYrgSVk317mtk14HmHbb5/gdRuW3P195ynGpKu4vtR9QfDktg6uHoIt1jGRzDbZEhPusLoEW7gngWwOGGOuFxcm/p26+pZUkwuj989dPzbqxYUJiFjFURSYQHv48iusEwwxEfM7y680loH6AqYUS3bxd8p9x4WJqTdu+ANX98by0YHgkGWXB++3TDDE78zRK64O+ncPcnUvYAItlhr/U8ZkS0xYxihtEphA+/1Vvwk+suAko15VmAiMSdEY5W1lsOoEE7cxOZW/g6owERgTpzHymwT+P/4d5bhuVWgf/RSxygVgIukFffcEH+881eg7ri8sPjd4cNBcudRMTKjhmDnUZdy06hGWaBY1A7oVOW/t743vsB5dlbKqYLxgKSH3kSYs18TKgzi4ueFCzGXThAvz7pf31LSBFQouuQ8wNwyWdnI5mzDL3TcY3cLNlftKE262uCH6BiaC+7Lp3sGXuIm6gZF9Z+WCzX2lCYa3CPD3wn3Z9NjWdm7CaYNLZMRsGNvGTbQMuAHzZ04Tcm22VMxaHPzskneD/orgnN47jb7ShPlzyJVpVibUcFzYd6/xBY5XCNHBRVW4gacj/i7HKywh9AlcPPdh02UDD9XUx4gFl8nS/OGemjawHJHL2IT1/YzraBKWpfoGo0/cT5Y4y8MHX1tykdGPTRht8Q0SjbmfLGGkzDeuqavHV56q4+B655rMfE8B6ZplAMuOXYO/sMQ7Dn7mMjahv6TlzvWC0VLuy6Zmnj83oYYDw7v85Y1Hb583tWl2MC0buGhhqJ+/0/HId4Kgy9MGdO7au2vqjydds4hoc9d0zS92n89N1M140jWLyFdxvckmRZvXi49ocx+0SrR5GfARbT6eBQzo1zcI3eN+bEK0fLMyoYbjkwtPM7688ajse3qUHdxYXJIC04T5OD6H4WU4/CHDESHD0XrIcDQnE2o43jZvqvHluQpJfj5vcpMVTKDj73Y88jnSJMPhDxmOCBmO1kOGozmZUMOBSUz85bnqor77uFkxDlzfX6bJ5+oGGQ5/yHBEyHC0HjIczcmEGg6XzY/StHhkLTcrxgFm7iO/hL9fV/FKkXqQ4fCHDEeEDEfrIcPRnEyo4eAvzlXY8E34AzkQ/B27Cjd5X8hw+EOGI0KGo/WQ4WhOmspwIFdA+MNl2+80yXDIcNiQ4YiQ4fCHDEdz0lSG418WncVNijrwkcnh03AgfIrbtwkJlnGQOMtlssQ3FiQ8chmb3jJvSk19cMyKa4xyNvGNxQfYbp77yZLP+ThVXCcnf3flr7mJuhmPEd04NsTN1I3rtg4n0Y0Fk+VdX4PO2NJW00argMA+10wSGM84rkYU/XFQoA9cjejPmngeY1MZDoR9CX/ggsbfsat8Go4r1z1itJ8mjIasH9vKTTgFTSFCmveDQXS0y2oqpLcyL25fEvzJrAONsklCuZlDi7iJusHnckliRFx8EfxhW2fuuVsYLZqzYzk3UTe4UbtkzxQRxAZw888bVvVnsw9OjOM+efXNRtk0vW/+CYUEVZUFBKPxZ04T4sk5lRo/4/9z2TRxEJsvEPPAfaXpL+YcFm5Z0KzIcExiymY4AC7KGHnBnhZpwkZ9aUmQ2Jfg1+ufCKauvNaoVxV20r163aPByL7dXD0EcdDY24DrxXVCzw3WGG4kmJ6y+hajXly4eRTxGqMKLqgYBcLn5b6rOnblr8IyRTy5VYGJwGflvuPCvjS+f5fi4MaLaHGMPnHfVeF35rrK7w5+h4oCZhR/d9x3XD9ac2vq5HgYyds3PRfu7cH14rq4/34jyrvVgJHEzRpGgD9/XJf2Pxhs27uTq4fg/+PfuU5caB/9FBnH8NS2BeHWDtx3XNhnauVo8v5PzYIMxySmjIZDCCFEayLDkQLeZ2MPBmw4N1HCBEZsHlbkE1YcGQ4hhBAThQzH/wc3eezaiYldiOzmvidSeOd9wKKzwxUTQ3tH+FC9IcMhhBBiopDhqPDwlrnhBCvurwzar+0oYzWGL8pqODBxEyM9adr78j6u0rIgOp4/f1x53itj9Q7Xq2rd2BYuXlo279luHH9ceejfPWjUqyppEjKDzQ+5Xlz43c1ix95Ro15cPLkxCSzP5HpV5V1thHlQXLeqPNva4yGN68WV52Fpe6UM14srz9yijZVj5XpV9e7axMVbGpw3/g6qSpv3NpFMasOBCVjY6tfHRmZFC8sLfc84L5vhwIXy011nGH2wMALVzFs05wHLWj/Rmb3Z4Z/P/nbqMjnE17+57RijDgtLex/fOp+rlwYsXcbOxHzcLCwZ/eXADK4ecv/grIp5P9qow3pH+3HBs0NdXD3k9DW3hqtHuA4LgXp9CRd3TFDMk9GC1TqY3Apzw+DvLc/ycaxmuHb941w95I5NzwdvypF58572aeEkVwbXzemrbgpeneO7wEqwJPMC8/gf3ecZ5VlYiooJsknGeu6OFWE2E9dh/dXcI4KbNjzN1VsKnCecL/7sLJx3nP9GMakNB/5ouI8yC8scfT7dl81wfH3JxUb7NmFmd6vyecfALL4x4CkaNx0ulyZclNNW7TSazzgk4uLhoX24p6Y+RolgzLhsmjCqyDd7172HEKrHuCxphZIMw8c6TzbKpQlLcDlnBiNaeYxCVVgizkvH73EMzDpyxVU19QFMBJezKWmH8DxmoyosP2/m5aQ2cH5clvLj/DdqZHPSGo7fbnzaaL8ZxGFA9VA2w7F/2xSjfZsu7LuXm2gZXMwCxE/2bcMrjDJZ8nkufZI306QqLG2N89zQYqNMljDCFAdLsbmMTRgpYVyyQCAshYyDVy2uo7EIsouDkSwukyW8kotz2prfGWVs+mDHiTX1wT90nmKUswnL0OPg1RWXyRJGuVqR8QQeNmpEc1IaDqxPf0PliY7bbwbhqaVjeBV/pHFRNsNRb7R5K+HyRA4hSyBOWaLNfcDHmSWe8+SaKAnxyAAyELiMTUkJtK6JkpxA6yPa/JEtbUaZLPGcEERrcxmbEN3N5HlFFhcn0PqINm8VcH74s2YJvweNYFIajjPW3Ga03Uz6sqdUSBmO8iLDEcHHmSUZjkgyHJFkOCLJcOSQD8OB911vd3jfVUZh2ayPvR5kOMqLDEcEH2eWZDgiyXBEkuGIJMORQz4MByaUcbvNKL6QjAcZjvIiwxHBx5klGY5IfJ2Q4Wg9ZDhS4A/tKh+Gw3U30LIKE7fqRYajvMhwRPBxZkmGI5IMRyQZjkgyHDnkw3D8vP8Bo91m1OEetjSX4SgvMhwRfJxZkuGIJMMRSYYjkgxHDvkwHK4XjrIKAUL1UjbDgfwDbt+mVjYcr63TcGAfIC6TJc6vKAuuS0F9GI4ldRqOt847tqY+yBNqFxcbDuSkcJks+TAcnNbpajiQ4sx8tE7DgeAwLpOlVjUcOD/8WbMkw5FDMhyRWtFwuD4BcsZAK/GRBScZn9cmzhhAuiOWUHO5NGEiMgKyysh752cnKMbFGQOIdXYxLUj65FRf19yez3WdVVMfYFSSy9mE7A/GNasGGSRxMHLDZWzCSBtvJnnNuseMcjYhUZT5xtJLjHI2YWQ6Dib/I6yOy9mEbJpWBOfHdUSUR/AmChmOJlUrGg5ESr8+Z+AVLuh59lloVv57a3vuiwhSSTkZE/xk7V1G2TRd0HcPVy8NDwzOzhUpDuHvIikG+9TVtxhlkwSTdvnAQ1w9DN3KO0KB0Da+0QOMmuSJmoc+0PH98LUBc+emF8K4by6fpIOXXcbVQ77Xc71RNkkwoTxaBIYrZixvcBfyjubsWM5NBAsq1428r1A/vGB6GAvPIK48byjcUQlpp60EzhPOF3/uJOH8NwoZjiZVKxoOgCdzPK0jyjhNz29f7DXivawgfvi+jO8CkeZJN9gqi0fWBrdves6oVxX+jV8flBHsTXLv4EvG8ceFeSs2unb2BrdummnUqwo382WjA1ztFWDqYCS4XlwwR7Yl69jQbMaWNqNeXE9u6whGLRu4YQgdrwe4XlzYZ8QGbvjYHZvrVXXX5heClaPrudor4KkaDwhcL64HB+eErz7SQFroQ1vmGPXienpbp/XBAnHld29+0agX1/ySvir0Dc4Xzht//qpwvnHeG4kMR5OqVQ2HEEKI1kSGo0klwyGEEKKZkOFoUslwCCGEaCZkOJpUrWo4fMzhWDrSH9yx6XmjXlVY3bJopJereQVLGB/b2m70HRe2POfVEHE0hyPCxxwOUS58zOHwAeZ4cL9xYY5I0VvbY64L5rxw33FhzgyvGGo2ZDiaVK1oOHysUrm4//7cSyDP7L2dq3sBN8d3tn/X6C9J2NeHg5WAVqlE+FilIsqFj1UqPsDqFe4vSVgNg1UxRYBVPHl3L8fqIKwSalZkOJpUrWg46s3hwAqAvMvkIBiT/t2DNW34wPV7PaHnBm5CORwx6s3hEOWj3hwOHyCXg/uxCbkfyP/wDXJKuC+bkIPSrMhwNKla0XDUmzS6cOcao0yWXtjeXdOGD3BuuB+bvth9PjehpNEYeUesqkrKjhDlot6kUR9gaTH3kyXbMt/xgiRW7scmJL02KzIcTapWNBx5h1irYsOBY+EyWcJ8EN/4MBx5X6dUxYZDe6mIMlPvXio+GI/hSApjqxfsNcP92CTDkRP+4lwlwxFJhkOGIy4ZjkgyHOVHhiNChqMg+ItzlQxHJBkOGY64ZDgiyXCUHxmOCBmOguAvzlUyHJFkOGQ44pLhiCTDUX5kOCJkOAqCvzhXyXBEkuGQ4YhLhiOSDEf5keGIkOEoCP7iXCXDEUmGQ4YjLhmOSDIc5UeGI0KGoyD4i3OVDEekVjQc+7dNMdq36cK+e2vqd4/0GWWy9NL2pTVt+MA1Y+CrCecSW5xzOZt+OTCjpr5rxgDk81z6xCVbBbpu/RPchCgZebe3ryopq6ZekF3D/WQJ6ai++WDHiUY/Np225nfcRNMgw9GkakXD8fUlFxvt2/TUtgU19ZE8+sa53zHKpel1cw4tJMHwor77jL5sOm/t77mJMD2Uy9mEiPM4O/aOOpkWhBohjr2MfKbrTON404TMjrLmiYiIaT3XGefOJkR7+wZx5S5m9v3zT+AmvHBkzrTTqu7Z/EduommQ4WhStaLhQMT3p7vOMPpgvWb2IcHZvXdy9RCYkLfNm2rUYf1N29HhPg5FMLpvLDhk2eVheif3GxeSQA9adlnifiorRtcFn+g8zajDwquXn1UMThLYq+XNbccYdVhvmTel1OmcGLnKMwQPA8kjPaKcIEArT8Lmq2YdFJqTouLqEVcOs839smA25u5YwdW9gFTgAxadY/TJevXsg4Ppq24qJO10opDhaFK1ouGogmHL1RXzkSbbxm1VsPEZ16uqiDjzJDBiwH3HlWQ0GMSNc7248lyIB3anfxf4npoF3KT4+OMSzcf2vSPGeYwrab+kIujdtcnou6qNFUMwEWBrBu47rmbfuA3IcDSpWtlwCCGEaD1kOJpUMhxCCCGaCRmOJpUMhxBCiGZChqNJJcNRHJjEdUHfPcHRK65OFZbp3Tv4ElctFbv2jYWZFFNWXmMcf1XHrvxVWGai3pWPl7s3vxh8r+d64/jjwjLpjWNDXLWlwITB2zc9F06k5M8f18X99wdbUpZwYgUTJtdynbiQe3Hjhj/kmi81XmYOdYWTILnvuM7svT1YNjrAVUMwfwmrV47P+C6QUZO2Gg3/H//OdeJC++gnz3yp8YLJ7j9YdaPRd1y4d60cXc9VQ3CecL5w3rheXDjvOP+NQoajSSXDUQyYsJpnlUtVSUtaywBuTF9YfK5xvGn6UvcF3ERpwIokPt40vbP9u+Hku1bl5NU3G585Tdj2nCcm73l5b67VT1V9Z/mVNfV94RK6hZVYS0f6uYnQCHDZNH14wfTQgMfBz/j/XDZN6K8IYGa4rzRhqTuW8zI4T1w2TTj/+D1oBDIcTSoZjmK4rfL0yJ/RJiwpLSNYVsvHmiUsSy4jrgm0GA1pRfCEjaW//HltmrGlraYN1wRaLN0u4okY13Luy6Yf995eUx8jclgyy+VsemZoYU0b+JnL2IT+ihgJ/NTC042+bOJl8Dg/OE9czib8HjSCSWc4XJ6WyqyvLbmIP5ozMhwmVwzMMD6jTX8660BuohS43lggRZuXG4xW8GfN0s0bn6lp45GKAeEyWSrCiObJVYmLo80RMc5lsoRRlTguoyxVlTHaHOeHy2QJvweNYNIZjivXPWK024zCe/l6keEwkeEoH3ycWZLhiCTDEUmGI5IMRw75MBzj+SUro9KSNl2Q4TCR4SgffJxZkuGIJMMRSYYjkgxHDvkwHDg52G+B22428bvZ8SDDYSLDUT74OLMkwxFJhiOSDEckGY4c8mE4wMc6Tzbabia9dva3vWy0JcNhIsNRPvg4syTDEUmGI5IMRyQZjhzyZTiu3/Ck0XYzyddWzTIcJjIc5YOPM0syHJFkOCLJcESS4cghX4YDa5A/2HGi0X4z6PVzDvO2mZAMh4kMR/ng48ySDEckGY5IMhyRZDhyyJfhANhqGNuccx9lF1IGfSHDYXLDhqeMz2jTG+YewU2Ugq6dvcaxZikpXKkMuGZP8E22VcCDkmv2xD10k312qMsokyXs0uubT3edYfRjE99kYb5csyce3Tqvpg38zGVsQn8cpOaDjzqaL14wgPPDZbKE34NGMGkNB7hr8wvBn1SeULmfsuocDytT4shwmGAbaCQb8udM05ErruImSgFuTu+ff4JxvGn6244TC41urodDl//CON40wZys3b2Zm2gZvr7kYuMzp+kv5xwexvTHQUjU/m1TjLJp+mzXmTX1fYHode4rTZjkjxh0xiVJF+FxHPWOn11C5dBfEeC6zn2lCaYnKbQL54nLpgnnv4gwtzxMasMBkGGPp1Tuq0zCsP1165/gQ68bGY5knt++OPjqkp8F72r/bqrwVHLq6lsa9oebB0QgH778iuADHd83jr8qvFpELHIRw+a+2L53JHzCxTA8H39V724/PkzffWn7Uq7eUiB6//urfhN8ZMFJxndQ1XvapwX/tfTioG14BVcPWTyyNjho2WVh9DnXrepDHdODqSuvNQyLL7D3x8/7HwhjtrnvuHDN51chVfBkjz1lEE/O9ap67/xpwTeX/jxYkHKdwv/Hv6Mc160K7aOfIkZ6wFjl4QB7N32881Sj77hgeB4cnMPVQ3CecL5w3rheVTjfOO84/41i0hsO0L97MNzE6n/P+pbRZ6OFPS4wPF4EMhxCCCEmChmOGHjKw6TBL1du8pjI4/ruuF7h/SycKD4nNgVbuHMNH6JXZDiEEEJMFDIckxgZDiGEEBOFDMckRoZDCCHERCHDMYkpm+EY3rcrPCbbxCfon7t+HDy8ZS5XD8FEyQOXXhpOnON6cWFSXfdIH1cvDUN7R8KAN6we4WOP64BFZwePb53P1UOWjQ6EE+IwoZLrVYXv6VuVMtjOPgksHfxc11lGvbj+ruMHwYmrbkycQIuVL5gciHRfrhfXP3SeEly97lGu3lJgouT5ffeEE47588eFiZRYnp0EciCwcaNtIjD0+cU/DV7cvoSrewMr/LCtOvcbFya2nr7m1mDXvjGu7oX1Y1vDVWK2ya/Qf3SfF8zZsZyre+N3G58N/nHhj4x+48KEZyxnxQTRIujbvTk4bPkvw6kA3HdcX+m+MJg/3MPVJwwZjklM2QwHZoJz+2nCcmaeeY6bm0ug2zvajyvsYlgvuJDy8aYJc384QwMXNhgNLpsmXKhwQ4yzaKQ3XCHFZdOEidfMtesfN8rZdOemF7iJluHygYeMz2vTQ1vMFQmYX8bl0oSQwHVjW7iJunlhe7fTflRnrLmNm/DCAYvOMfpKE1YiFrHKBKscuS+bYDiLAIaH+0rTfm1Hhw80jaCpDAfCYoQ/jne4wafJp+F4Z8WBc/s2Xdr/YE19PKVzmSyVNV3TJR8A4nRNnBcukyUe8XFNXcX6fgZLVbmcTUcsv4KbaBnwwMSf1yZO10S2iosBhO7e/GJNGz44q/cOox+b8HTvG4yGugZ/FZGu6frQhlEh32wcGzL6ydIzQwu5mQmhqQwHhoSEP7625CLjO3aVT8PhepM9d+3dNfXHc5NF5kYZcQkfg9h8+Yg2/1nffUYZmxA0xfz74p8a5WzCK6BWBTcb/rw2sfnyEW3uA2SicD82YfTMNz6izX0AU8j92FSE+VK0eQr8oV316tkHG8O+YvzgvTl/x66S4SgGGY7WQ4bDHzIcETIcKbgOByZp5tAiblaMA/zB+gg6W+Jx4qUMR4QMR+shw+EPGY4IGY4U3jj3O8YHdxVv4iPGBy5E/N2OR5gd7QsZjggZjtZDhsMfMhwRMhwpYA4Gf3BX7dd2VMNm2LYKL1f+c5nVbJPPcyHDESHD0XrIcPhDhiNChiMFZAbwBx+PeHte4Qa2rObvdDzyvTW7DEeEDEfrIcPhDxmOCBmOFI5bea3xwccjXIw7hldx8yIHG8e2hfkT/J2OR76XeMlwRMhwtB4yHP6Q4YiQ4UjhqnWPGh98vMJNs6itk1sVhFwhpZO/y/EqKeipHpAwyn3YhFCpOEge5DJZ4sCssuD6+vGWjc/W1O/Ztd4ok6W1NB/nNxueMsrYhMRH5tDlvzDK2YTwt1bFdRn6yatvrqmPV6F/Mecwo5xNSIr1zUWORvQzXWdyE3WDYDusWuS+bJo51MXN1A1G27kfm5AA6xtkkrguACgyedXGhBoOJEPyB69HiFReObqeuxEJbNkzHHxh8bnGd1iPbt00k7upi+vWP2H0kSaETCHwhjlo2WVG2TQh8hgX8TLyi4GHjeNNE8z31sr5Zb7qELqFqHdmcM+O4K3zjjXKpumadY9xE8FzQ4tzr077s8oNpL2BsctF88TWjtw3BoxwLR5Zy00EZ/bebpRNEwz8aAFJujCmeRcAIJG0qPTY6atuMvpLEyIAiogVx/0nrwlEUNmDg2Z6rA9c3h7AADYqXmJCDQcu7q7D5lnCL35RJ7FVgJt9f+Xpk7+7etW/e5C7qptnK08heFViEyKi00a38IeEp32uw8LTexEXIJ88ua3DOG4WjElaZDM+300bnjbqsDDsjhTLJGDq8H1zHdbT2zq56ivgVdeFffcadeLCU7PPJdZlBYbqgr57jM8f18X99wfLRwe46ivgesd1WBhN9jmhm4HpwGs87pf1xwL3cwGYj8Z9spDCi1GAosD+TdgviPuNC5HmRY4q4N4KY8f9sn5deagb2bebq08YE2o4wFQHJ+YibDCFix720xD/AzbpOWTZ5cZ35UNY5SKEEELkZcINBybp8c3Lp7Bs9pgV1wSXVBwnnnTx3m6yCA73lwMzgu+v+o3zHABX8d4dQgghhI0JNxwY+sHWynwDk5pHr5397dRhfCGEECKJCTccwFfKpdQYNUPaK5aKrbYoa7IoVvRwnbjybPuNiZxcL66kiZ5lBO98+djjSptP04pgaSp//riw7HwiwPwp7juuss9PqoLlrXzscW3PMQ8FacdcL660+UlV8O9cJy6facqTnYYYDvwxvKd9mnEjk8qv18w+JBjYnX2zbRRYBphnBj0yI9K27v7p2rtzrazAMtBFI71cPbwp5V0h8qXuC4Ide0e5idLwozW35lpZgRVjyywTHVuBH6y6MdeW6B9d8MNwImERzN2xInhnjtelWDKKyb5lBSYVqyX4uJN05IqrEldVvLh9SfC2eVON8iysfkp7BYz/j3/nOiz0g/5EfTTEcICHt8w1TqpUfmGGfVnBqMRfzT3COOY0wTzxKANm1XM5mz6bkDGA74jL2fSTtXdxE6XgD9s6jWO1CcuuWxXX61XSMmMffHhB/qwaLEnt2mka4jLgunjgxg1/4CacHlphmjlCAT/nMdNVoT9RHw0zHOA/cz4FSuUQltbipl5WkFvAx5yll7YvrWnjasdwOpgWBjcbLmfTV7ov5CZKASZe87Ha9Ka5R3ITLQNMIX9em95eeSL2Df72YCK4L5t8Z+X4ArkYfKw2fa/n+pr6eFDgMlm6b3BWTRv4mctkiR9QhBsNNRxIhnxz2zHGSZXKJwzRtg2v4FNYKnxEm18xMMMoYxNevTCuRvqL3edzE6XAR7R5q3BW7x3G57XpLfOmcBN1U5Zocx8g4puP1SZEiMfxEW2On7lMltCvGD8NNRwA2Rkuw1pSY4QgobIjw+EXGY4IGQ6/yHBMThpuOMD1G540TqxUHp3QcwOfslIiw+EXGY4IGQ6/yHBMTkphOIDrRDtpYoSk0mZJb5Xh8IsMR4QMh19kOCYnpTEcACmZeZadSRMjbAiUtBytrMhw+EWGI0KGwy8yHJOTUhkOcNfmF4LXzTnUONHSxAlzarDZULMhw+EXGY4IGQ6/yHBMTkpnOED3SJ/TenPJn7Bq6JmhhXxKmoKFO9cYnydLL2zvrmnjynWPGGVsetWsg2rqg68tucgoZxPCv8qIq+FABkqrcnbvncbntemt847lJuoGia/cT5bKajgQjsbHatPxPdfV1MfWClwmSz4Mh7Z0qI9SGg6w++U94VM2cg74pEv+hVdZeIoY3LODT0XTgMTOPAmh8c/MEeWPbW03ytn0oY7pNfXBKatvMcrZhATLMnLv4EvGsdr0yYWncRMtw+82Pmt8XpsOWHQON+GFPMmacZU1HfPApZcax2oTp6ZiawLkvnA5mzqGV9W0gZ+5jE3oL2tLBGGntIajCiKCp6y8JnyS5F8AyY/wCqDsGRt5wSuRPMusEaCU9NoIF5RvLL3EKJ+k1885LHhiawc3EebLICSNyyfpvfOnhftilBHM38HoCx9zkvA6ZebQIm6iZcAD0L9WTAR/7iQhWn/2jmXchBfuH5yV+yHsqBVXcfXSgJC+/dumGMecpI93npoY/3/Hpudz3xc4OKwK/j+XTRL6QX+iPkpvOKr07toUnL7mVmeHLyULw98Y0ViwczV/1U0PNm6bOdRlFcccM/heuA7LNho0um8smFW56XCduJByinJlBgZs/nCPceysyZDAiNVa84ZXGp+9VouCoRwbjtUDNogz+61VWSPN4wzv2xW+0uRjjwt7x9g2X8MIJddh4RW9Dfw712HxSKgYH01jOKrgAvhs5Rfgx723B59aeLrTEPpk10cWnBScuOrGYMaWtlJHlAshhGg9ms5wMDAgS0f6g0cqN9FbNj4b3LTh6eDctXdPev16/RPh94EhWDztyGAIIYRoJE1vOIQQQghRfmQ4hBBCCFE4MhxCCCGEKBwZDiGEEEIUjgyHEEIIIQpHhkMIIYQQhSPDIYQQQojCkeEQQgghROHIcAghhBCicGQ4hBBCCFE4MhxCCCGEKBwZDiGEEEIUjgyHEEIIIQpHhkMIIYQQhSPDIYQQQojCkeEQQgghROHIcAghhBCicGQ4hBBCCFE4MhxCCCGEKBwZDiGEEEIUjgyHEEIIIQpHhkMIIYQQhSPDIYQQQojCkeEQQgghROHIcAghhBCicGQ4hBBCCFE4MhxCCCGEKJz/B1MOE5St+9SJAAAAAElFTkSuQmCC" alt="弁天クラブ公式LINE QRコード" style="width:160px;height:160px;display:block;margin:0 auto;border-radius:8px;">
    <p style="font-size:12px;color:#6b7280;margin-top:10px;">カメラアプリまたはLINEのQRコードリーダーで読み取り</p>
  </div>

  <div class="vg-section">
    <h3><span class="num">1</span>車番検索でできること</h3>
    <p style="font-size:13px;">弁天クラブ公式LINEに<strong>数字</strong>を送るだけで、車両情報をすぐに確認できます。</p>
    <table class="vg-table">
      <tr><th>送信する内容</th><th>検索される情報</th></tr>
      <tr><td>無線番号（例: <span class="vg-cmd">1988</span>）</td><td>無線番号が一致する車両</td></tr>
      <tr><td>ナンバー末尾（例: <span class="vg-cmd">1988</span>）</td><td>ナンバープレート末尾が一致する車両</td></tr>
    </table>
    <div class="vg-tip">LINE連携を完了した方であれば利用できます。</div>
  </div>

  <div class="vg-section">
    <h3><span class="num">2</span>初回設定（LINE連携）</h3>
    <p style="font-size:13px;">初回のみ1回だけ設定が必要です。以下の手順で自己申請できます。</p>
    <ol class="vg-steps">
      <li>スマートフォンで「弁天クラブ公式LINE」を友達追加する（上のQRコードから）</li>
      <li>トーク画面に <span class="vg-cmd">車番連携</span> と入力して送信する</li>
      <li>名前の入力を求められるので、<strong>漢字フルネーム</strong>を送信する（例: 板橋太郎）</li>
      <li>パスワードの入力を求められるので、事務所から共有されたパスワードを送信する</li>
      <li>「登録されました」のメッセージが届いたら連携完了</li>
    </ol>
    <div class="vg-mock">
      <span class="you">あなた ▶</span> <span class="bot">車番連携</span><br>
      <span class="you">ボット ▶</span> <span class="bot">あなたの名前を漢字フルネームで入力してください。</span><br>
      <span class="you">あなた ▶</span> <span class="bot">板橋太郎</span><br>
      <span class="you">ボット ▶</span> <span class="bot">パスワードを入力してください。</span><br>
      <span class="you">あなた ▶</span> <span class="bot">（パスワード）</span><br>
      <span class="you">ボット ▶</span> <span class="bot">板橋太郎さんの車番検索権限が登録されました。</span>
    </div>
    <div class="vg-note">連携は1回だけでOKです。このページの内容は社外に漏らさないようにしてください。</div>
  </div>

  <div class="vg-section">
    <h3><span class="num">3</span>検索の方法</h3>
    <ol class="vg-steps">
      <li>弁天クラブ公式LINEのトーク画面を開く</li>
      <li>調べたい<strong>数字</strong>を入力して送信</li>
      <li>数秒で検索結果がLINEに返ってきます</li>
    </ol>
    <div class="vg-mock">
      <span class="you">あなた ▶</span> <span class="bot">1988</span><br>
      <span class="you">ボット ▶</span> <span class="bot">「1988」の検索結果（1件）</span><br>
      <br>
      <span class="bot">&nbsp;&nbsp;━━ 【無線番号一致】 ━━</span><br>
      <span class="bot">&nbsp;&nbsp;無線番号: 1988</span><br>
      <span class="bot">&nbsp;&nbsp;車両番号: 品川502あ1988</span><br>
      <span class="bot">&nbsp;&nbsp;車種: JPN TAXI</span><br>
      <span class="bot">&nbsp;&nbsp;営業所: 板橋営業所</span><br>
      <span class="bot">&nbsp;&nbsp;課: 板橋2課</span>
    </div>
  </div>

  <div class="vg-section">
    <h3><span class="num">4</span>検索結果の見方</h3>
    <table class="vg-table">
      <tr><th>項目</th><th>内容</th></tr>
      <tr><td>無線番号</td><td>車両に割り当てられた無線番号</td></tr>
      <tr><td>車両番号</td><td>ナンバープレートの全文字列</td></tr>
      <tr><td>車種</td><td>車両の種類（例: JPN TAXI、クラウン）</td></tr>
      <tr><td>営業所</td><td>所属する営業所名</td></tr>
      <tr><td>課</td><td>所属課</td></tr>
    </table>
    <table class="vg-table" style="margin-top:8px;">
      <tr><th>表示ラベル</th><th>意味</th></tr>
      <tr><td>【無線番号一致】</td><td>入力した数字が無線番号と完全一致した車両</td></tr>
      <tr><td>【ナンバー一致】</td><td>入力した数字がナンバープレート末尾と一致した車両</td></tr>
    </table>
    <div class="vg-note">同じ数字で無線番号・ナンバーの両方に該当する場合、無線番号一致が先に表示されます。</div>
  </div>

  <div class="vg-section">
    <h3><span class="num">5</span>その他のコマンド</h3>
    <table class="vg-table">
      <tr><th>送信するテキスト</th><th>動作</th></tr>
      <tr><td><span class="vg-cmd">れんけいかいじょ</span></td><td>LINE連携を自分で解除する（再度使う場合は再連携が必要）</td></tr>
    </table>
  </div>

  <div style="margin-top:36px;padding-top:20px;border-top:2px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af;">
    弁天クラブ 車番検索ガイド &nbsp;|&nbsp; 2026年7月版 &nbsp;|&nbsp; ご不明な点は事務所スタッフまで
  </div>
</div>`;
  return c.html(layout('車番検索ガイド', html, 'settings'));
});

// ===== チュートリアル =====
app.get('/settings/tutorial', (c) => {
  const html = settingsSubHeader('チュートリアル — 使い方ガイド') + `
<style>
  .tut-body { max-width:720px;font-family:'Hiragino Sans','Meiryo',sans-serif;color:#1f2937;line-height:1.7; }
  .tut-cover { text-align:center;padding:48px 0 40px;border-bottom:3px solid #1e3a5f;margin-bottom:36px; }
  .tut-cover-title { font-size:28px;font-weight:900;color:#1e3a5f;letter-spacing:0.08em;margin-bottom:8px; }
  .tut-cover-sub { font-size:14px;color:#6b7280;margin-bottom:4px; }
  .tut-toc { background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:36px; }
  .tut-toc h3 { font-size:13px;font-weight:700;color:#6b7280;letter-spacing:0.1em;margin-bottom:10px;text-transform:uppercase; }
  .tut-toc a { display:block;font-size:13px;color:#1e3a5f;text-decoration:none;padding:3px 0; }
  .tut-toc a:hover { text-decoration:underline; }
  .tut-toc-section { font-size:12px;font-weight:700;color:#9ca3af;margin-top:8px;margin-bottom:2px; }
  .tut-chapter { border-left:4px solid #1e3a5f;padding-left:16px;margin-bottom:8px;margin-top:40px; }
  .tut-chapter h2 { font-size:20px;font-weight:800;color:#1e3a5f;margin:0; }
  .tut-chapter-label { font-size:11px;color:#6b7280;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:2px; }
  .tut-section { margin-top:28px;padding-top:20px;border-top:1px solid #f3f4f6; }
  .tut-section h3 { font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:10px;display:flex;align-items:center;gap:8px; }
  .tut-section h3 .num { display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;background:#1e3a5f;color:white;border-radius:50%;font-size:11px;font-weight:700;flex-shrink:0; }
  .tut-steps { counter-reset:step;list-style:none;padding:0;margin:10px 0; }
  .tut-steps li { counter-increment:step;display:flex;gap:10px;margin-bottom:8px;font-size:13px; }
  .tut-steps li::before { content:counter(step);display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;background:#dbeafe;color:#1e3a5f;border-radius:50%;font-size:11px;font-weight:700;flex-shrink:0;margin-top:2px; }
  .tut-note { background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px 12px;font-size:12px;color:#92400e;margin:8px 0; }
  .tut-tip  { background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:8px 12px;font-size:12px;color:#166534;margin:8px 0; }
  .tut-warn { background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:8px 12px;font-size:12px;color:#991b1b;margin:8px 0; }
  .tut-badge { display:inline-block;padding:1px 7px;border-radius:4px;font-size:11px;font-weight:600; }
  .tut-table { width:100%;border-collapse:collapse;font-size:12px;margin:10px 0; }
  .tut-table th { background:#1e3a5f;color:white;padding:6px 10px;text-align:left;font-weight:600; }
  .tut-table td { padding:6px 10px;border-bottom:1px solid #e5e7eb; }
  .tut-table tr:last-child td { border-bottom:none; }
  .tut-divider { border:none;border-top:2px dashed #e5e7eb;margin:36px 0; }
  .print-btn { padding:8px 20px;background:#1e3a5f;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:24px; }
  @media print {
    @page { size: A4 portrait; margin: 15mm 18mm; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .sidebar, .sidebar-overlay, .mobile-header, .desktop-header,
    .no-print, .print-btn { display: none !important; }
    .main-content { margin-left: 0 !important; }
    .page-content { padding: 0 !important; }
    body { background: white !important; }
    .tut-body { max-width: 100% !important; }
    .tut-cover { break-after: page; page-break-after: always; }
    .tut-toc  { break-after: page; page-break-after: always; }
    .tut-chapter { break-before: page; page-break-before: always; }
    .tut-chapter:first-of-type { break-before: auto; page-break-before: auto; }
    .tut-section { break-inside: avoid; page-break-inside: avoid; }
    .tut-table  { break-inside: avoid; page-break-inside: avoid; }
    .tut-steps  { break-inside: avoid; page-break-inside: avoid; }
    .tut-note, .tut-tip, .tut-warn { break-inside: avoid; page-break-inside: avoid; }
    a { color: inherit !important; text-decoration: none !important; }
  }
</style>

<div class="tut-body">
  <button class="print-btn" onclick="window.print()">印刷 / PDF保存</button>

  <!-- 表紙 -->
  <div class="tut-cover">
    <div style="font-size:11px;color:#9ca3af;letter-spacing:0.15em;margin-bottom:16px;">STAFF MANAGEMENT SYSTEM</div>
    <div class="tut-cover-title">ホシコン<br>使い方ガイド</div>
    <div style="margin:16px auto;width:48px;height:3px;background:#1e3a5f;border-radius:2px;"></div>
    <div class="tut-cover-sub">管理者・現場スタッフ 共通マニュアル</div>
    <div class="tut-cover-sub" style="margin-top:6px;font-size:12px;">最終更新: 2026年8月</div>
  </div>

  <!-- 目次 -->
  <div class="tut-toc">
    <h3>目次</h3>
    <div class="tut-toc-section">第1章 — 管理者向け機能</div>
    <a href="#dash" data-perm-key="home">1-1. ダッシュボード — 全体状況の確認</a>
    <a href="#emp" data-perm-key="staff">1-2. 社員管理 — 登録・編集・ステータス管理</a>
    <a href="#shift" data-perm-key="shift">1-3. シフト管理 — 研修スケジュール入力</a>
    <a href="#info" data-perm-key="newcomers">1-4. 新人リスト — 登録・種別（通常新人/新卒）・新卒Info管理</a>
    <a href="#follow" data-perm-key="newcomers">1-5. フォローリスト — 要フォロー社員の確認</a>
    <a href="#interview" data-perm-key="newcomers">1-6. 面談管理 — 面談記録・次回予定</a>
    <a href="#sales" data-perm-key="staff">1-7. 売上管理 — 月次売上の記録と確認</a>
    <a href="#announce" data-perm-key="announcements">1-8. お知らせ配信 — LINEで一斉送信</a>
    <a href="#vehicle" data-perm-key="vehicles">1-9. 車両検索 — 無線番号・ナンバーで車両照会</a>
    <a href="#line" data-perm-key="line">1-10. LINE管理 — ユーザー連携状況</a>
    <a href="#settings" data-perm-key="settings">1-11. 設定 — 各種マスタ管理</a>
    <a href="#kancho" data-perm-key="kancho-shift">1-12. 班長シフト — 班長・指導者の月間シフト</a>
    <a href="#staff-search" data-perm-key="staff">1-13. 社員絞り込み検索 — 条件を組み合わせた検索</a>
    <a href="#inspection" data-perm-key="inspection">1-14. 点検管理 — 車両点検スケジュール</a>
    <a href="#document-center" data-perm-key="settings.documents">1-15. 資料センター — マニュアル・就業規則の保管</a>
    <a href="#report-center" data-perm-key="settings.lost-items settings.accidents settings.violations settings.general-reports settings.handover-memos">1-16. 報告センター — 忘れ物・事故・違反・一般報告・引き継ぎメモ</a>
    <a href="#benten-shift" data-perm-key="settings.benten">1-17. ベンテンクラブ シフト</a>
    <a href="#line-usage" data-perm-key="settings.line-usage">1-18. LINE利用状況 — 操作ログの確認</a>
    <a href="#handover" data-perm-key="handover">1-19. 引き継ぎシート — 課の申し送り事項</a>
    <a href="#crew-portal" data-perm-key="crew-portal">1-20. 個人データ参照・乗務員シフト・売上分析・担当車表</a>
    <a href="#todo" data-perm-key="todo">1-21. やることリスト — 課ごとの日次チェックリスト・当直共通タスク</a>
    <div class="tut-toc-section" style="margin-top:12px;" data-perm-key="settings.vehicle-search-guide">第2章 — 班長・指導者向け（LINE車番検索ガイド）</div>
    <a href="#veh-guide" data-perm-key="settings.vehicle-search-guide">2-1. LINE車番検索ガイド（詳細は専用ページへ）</a>
    <div class="tut-toc-section" style="margin-top:12px;">第3章 — 現場スタッフ向け（LINE利用ガイド）</div>
    <a href="#line-what">3-1. LINEでできること</a>
    <a href="#line-link">3-2. 初回連携の方法</a>
    <a href="#line-recv">3-3. お知らせ・アンケートの受け取り方</a>
  </div>

  <!-- 第1章 -->
  <div class="tut-chapter" id="chap1">
    <div class="tut-chapter-label">Chapter 1</div>
    <h2>管理者向け機能</h2>
  </div>
  <p style="font-size:13px;color:#6b7280;margin-top:8px;">このシステムへは管理者専用URLからアクセスします。ログイン後、左のナビゲーションから各機能に移動できます。</p>

  <!-- 1-1 ダッシュボード -->
  <div class="tut-section" id="dash" data-perm-key="home">
    <h3><span class="num">1</span>ダッシュボード — 全体状況の確認</h3>
    <p style="font-size:13px;">ログイン直後に表示されるトップページです。現在の新人状況が一目で確認できます。</p>
    <table class="tut-table">
      <tr><th>表示項目</th><th>内容</th></tr>
      <tr><td>在籍新人数</td><td>現在研修中・配属済みの社員総数（新卒 / その他の内訳付き）</td></tr>
      <tr><td>面談期限超過</td><td>次回面談予定日を過ぎているのに面談が実施されていない社員数</td></tr>
      <tr><td>面談期限超過リスト</td><td>超過日数付きの社員一覧（クリックで面談記録へ）</td></tr>
      <tr><td>最終ログイン履歴</td><td>直近のログイン記録（不正アクセス確認用）</td></tr>
    </table>
    <div class="tut-tip">未対応・超過件数が赤やオレンジで表示されているときは優先対応が必要なサインです。</div>
  </div>

  <!-- 1-2 社員管理 -->
  <div class="tut-section" id="emp" data-perm-key="staff">
    <h3><span class="num">2</span>社員管理 — 登録・編集・ステータス管理</h3>
    <p style="font-size:13px;">新人社員の登録・情報更新・退職処理を行います。</p>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍新人を登録する</p>
    <ol class="tut-steps">
      <li>画面右上の「＋ 新規登録」をクリック</li>
      <li>社員番号・氏名（必須）と課・班・入社区分などを入力</li>
      <li>「登録する」をクリック — シフト管理に自動で追加されます</li>
    </ol>
    <div class="tut-note">課・班を選ばない場合は空欄のまま登録できます。後から編集ページで変更可能です。</div>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍ステータスを切り替える</p>
    <p style="font-size:13px;">一覧のステータスボタンをクリックするたびに状態が順番に変わります。</p>
    <table class="tut-table">
      <tr><th>ステータス</th><th>意味</th><th>次へ</th></tr>
      <tr><td><span class="tut-badge" style="background:#dbeafe;color:#1e40af;">研修中</span></td><td>研修期間中。シフト管理に表示される</td><td>→ 研修終了</td></tr>
      <tr><td><span class="tut-badge" style="background:#bbf7d0;color:#166534;">研修終了</span></td><td>研修完了。通常シフトから非表示</td><td>→ 未配属</td></tr>
      <tr><td><span class="tut-badge" style="background:#f3f4f6;color:#6b7280;">未配属</span></td><td>配属待ち状態</td><td>→ 研修中</td></tr>
    </table>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍面談対象フラグを設定する</p>
    <p style="font-size:13px;">一覧の「面談」列のボタンをクリックするとオン/オフが切り替わります。<span class="tut-badge" style="background:#1a3a5c;color:white;">対象</span> になるとフォローリスト・面談管理で優先表示されます。</p>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍絞り込み・並び替え</p>
    <p style="font-size:13px;">ページ上部のボタンで課・在籍状態・退職状況などで絞り込み、列ヘッダーのクリックで並び替えができます。「条件選択▼」ドロップダウンを使うと、在籍中・退職者・新人などの条件で一括チェックできます。</p>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍退職者管理・退職候補</p>
    <p style="font-size:13px;">退職フィルターで以下の絞り込みが可能です。退職処理は社員詳細ページ、または一覧で複数選択して一括実行できます。</p>
    <table class="tut-table">
      <tr><th>フィルター</th><th>内容</th></tr>
      <tr><td>退職候補</td><td>在籍中だが長欠状態または退職日を過ぎている社員（除外フラグなし）</td></tr>
      <tr><td>30日以内</td><td>30日以内に退職予定の社員（一覧に黄色バナーで表示）</td></tr>
      <tr><td>退職日あり</td><td>退職日が設定されている全社員</td></tr>
    </table>
    <div class="tut-tip">退職候補に出た社員を候補から除外したい場合は、社員詳細ページの「退職候補から除外」ボタンを使います。候補リストから非表示になります（在籍は継続）。「退職候補に戻す」で再表示できます。</div>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍退職者リスト（PDF取込）</p>
    <p style="font-size:13px;">社員一覧の「関連ページ▼」→「退職者リスト」から、紙の「乗務員退職者名簿」PDFをそのままアップロードして退職処理を一括登録できます。</p>
    <ol class="tut-steps">
      <li>PDFファイルを選択し「PDF解析・照合プレビュー」をクリック</li>
      <li>社員番号でDBと自動照合され、一致・既に退職済み・未一致が一覧表示されます</li>
      <li>内容を確認し（デフォルトで一致した行がチェック済み）、「選択した行を退職処理として確定」をクリック</li>
    </ol>
    <div class="tut-note">確定すると対象社員は在籍中の社員名簿から自動的に除外されます（退職フラグを設定するのみで、データは削除されません）。社員番号が未登録の行は自動処理されないため、別途ご確認ください。</div>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍班長として登録する</p>
    <p style="font-size:13px;">社員詳細ページ上部の「班長として登録」ボタンをクリックすると班長フラグが付き、一覧で<span class="tut-badge" style="background:#fef3c7;color:#92400e;">班長</span>バッジが表示されます。再度クリックで解除できます。</p>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍一括CSVインポート</p>
    <p style="font-size:13px;">出庫データCSV（Shift-JIS形式）を読み込み、社員情報を一括更新・追加します。</p>
    <ol class="tut-steps">
      <li>一覧右上の「CSVインポート」ボタンをクリック</li>
      <li>CSVファイルをドラッグ＆ドロップ、またはクリックして選択</li>
      <li>プレビューで追加・更新内容を確認（長期不在・シフト変化の警告も表示）</li>
      <li>「インポート実行」をクリックして反映</li>
    </ol>
    <div class="tut-note">CSVインポートで追加された社員は一般社員として登録されます。新人シフト管理には自動で追加されません。</div>
  </div>

  <!-- 1-3 シフト管理 -->
  <div class="tut-section" id="shift" data-perm-key="shift">
    <h3><span class="num">3</span>シフト管理 — 研修スケジュール入力</h3>
    <p style="font-size:13px;">社員ごとの日別研修内容（午前・午後・研修担当）を入力する月別シフト表です。</p>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍シフトを編集する</p>
    <ol class="tut-steps">
      <li>「編集モードを開始」ボタンをクリック（他の管理者が編集中の場合はロックされます）</li>
      <li>編集したいセルをタップ — 入力モーダルが開きます</li>
      <li>プリセットボタン（実研・公休・座学 など）をタップ、または自由入力</li>
      <li>午前・午後・研修担当を設定して「適用」</li>
      <li>必要なだけセルを編集したら「一括保存」で確定</li>
    </ol>
    <div class="tut-tip">◀ ▶ ボタンで同じ社員の前後の日付に連続入力できます。一括保存前はセルに黄色の点線が表示されます。</div>
    <div class="tut-note">キャンセルすると未保存の変更はすべて破棄されます。</div>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍個人の勤務予定表を印刷する</p>
    <ol class="tut-steps">
      <li>シフト表の氏名リンクをクリック（新しいタブで開きます）</li>
      <li>A4縦の2列レイアウトで勤務予定表が表示される</li>
      <li>「印刷 / PDF保存」ボタンで出力</li>
    </ol>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍区分の色と意味</p>
    <p style="font-size:13px;">シフト区分の色・目標回数は「設定 → シフト区分」でカスタマイズできます。「集計」ボタンで社員ごとの区分達成状況も確認できます。</p>
  </div>

  <!-- 1-4 新人リスト -->
  <div class="tut-section" id="info" data-perm-key="newcomers">
    <h3><span class="num">4</span>新人リスト — 登録・種別・新卒Info管理</h3>
    <p style="font-size:13px;">総合新人管理の対象社員は権限を持つアカウントが個別に「新人登録」します（在籍社員全員が自動で対象になるわけではありません）。登録時に「通常新人」「新卒」の種別を選び、新卒は年度も設定します。</p>
    <table class="tut-table">
      <tr><th>項目</th><th>活用場面</th></tr>
      <tr><td>種別（通常新人/新卒）・新卒年度</td><td>一覧のフィルタで絞り込み表示（例: 2024年新卒のみ表示）</td></tr>
      <tr><td>新卒Info（趣味・食の好み・飲酒状況・運転技能・メンタル状態）</td><td>編集画面から記録。面談や日常ケアの参考として活用</td></tr>
      <tr><td>メンタル状態</td><td>安定 / 注意 / 要フォロー / 危険 の4段階。要フォローはフォローリストに反映</td></tr>
    </table>
    <div class="tut-note">新卒Infoの項目は編集画面に統合されています（旧「新卒Info」ページは廃止）。乗務を開始した新卒は編集画面から売上・安全運転記録も確認できます。</div>
  </div>

  <!-- 1-5 フォローリスト -->
  <div class="tut-section" id="follow" data-perm-key="newcomers">
    <h3><span class="num">5</span>フォローリスト — 要フォロー社員の確認</h3>
    <p style="font-size:13px;">登録済み新人のうち、以下の条件に該当する社員が自動でリストアップされます。定期的に確認して声かけや面談を行いましょう。</p>
    <table class="tut-table">
      <tr><th>表示条件</th></tr>
      <tr><td>面談対象フラグがオンの社員</td></tr>
      <tr><td>新卒Infoのメンタル状態が「要フォロー」または「危険」の社員</td></tr>
    </table>
  </div>

  <!-- 1-6 面談管理 -->
  <div class="tut-section" id="interview" data-perm-key="newcomers">
    <h3><span class="num">6</span>面談管理 — 面談記録・次回予定</h3>
    <p style="font-size:13px;">社員との面談内容・実施日・次回予定日を記録します。</p>
    <ol class="tut-steps">
      <li>「＋ 面談を記録」から対象社員を選択</li>
      <li>面談日・内容・次回面談予定日を入力して保存</li>
      <li>次回予定日を過ぎても面談が記録されていない場合、ダッシュボードに「面談期限超過」として表示される</li>
    </ol>
    <div class="tut-tip">次回面談予定日を入力しておくことで、見落とし防止になります。</div>
  </div>

  <!-- 1-7 売上管理 -->
  <div class="tut-section" id="sales" data-perm-key="staff">
    <h3><span class="num">7</span>売上管理 — 月次売上の記録と確認</h3>
    <p style="font-size:13px;">社員ごとの日別営業収入・乗車回数・走行距離を記録・集計します。</p>
    <ol class="tut-steps">
      <li>月度を選択して対象月を表示</li>
      <li>社員名のリンクをクリックして日別入力画面へ</li>
      <li>各日の売上金額・乗車回数・走行距離を入力して保存</li>
    </ol>
    <p style="font-size:13px;margin-top:10px;">月度集計ページでは社員ごとの月間合計と棒グラフを確認できます。CSV出力も可能です。</p>
  </div>

  <!-- 1-8 お知らせ配信 -->
  <div class="tut-section" id="announce" data-perm-key="announcements">
    <h3><span class="num">8</span>お知らせ配信 — LINEで一斉送信</h3>
    <p style="font-size:13px;">社員のLINEアカウントにお知らせやアンケートを一斉送信できます。</p>
    <ol class="tut-steps">
      <li>「＋ 新規配信」をクリック</li>
      <li>タイトル・本文を入力し、配信対象（LINE連携者 / 全員 / 入社月 / 個別指定）を選択</li>
      <li>「配信する」をクリック — 対象者のLINEに即時配信されます</li>
    </ol>
    <table class="tut-table">
      <tr><th>配信対象</th><th>内容</th></tr>
      <tr><td>LINE連携者</td><td>（既定）LINE Botに登録済みの連携者から、役割チップ・名前検索で絞り込んで選択</td></tr>
      <tr><td>全員</td><td>LINEを連携済みの全社員</td></tr>
      <tr><td>入社月</td><td>特定の月に入社した社員のみ</td></tr>
      <tr><td>個別指定</td><td>名前・社員番号で検索して個別に選択</td></tr>
    </table>
    <div class="tut-note">LINEを未連携の社員には届きません。LINE管理ページで連携状況を確認できます。</div>
  </div>

  <!-- 1-9 車両検索 -->
  <div class="tut-section" id="vehicle" data-perm-key="vehicles">
    <h3><span class="num">9</span>車両検索 — 無線番号・ナンバーで車両照会</h3>
    <p style="font-size:13px;">4桁の無線番号またはナンバープレート末尾4桁を入力して、車両情報を検索できます。</p>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍Web管理画面で検索する</p>
    <ol class="tut-steps">
      <li>左メニュー「車両検索」をクリック</li>
      <li>検索ボックスに4桁の数字を入力して「検索」ボタンをクリック</li>
      <li>検索結果に無線番号・車両番号・車種・営業所・課・電話番号が表示される</li>
    </ol>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍LINEで検索する（班長・指導者向け）</p>
    <p style="font-size:13px;">車番検索の権限が付与された班長・指導者は、公式LINEアカウントに4桁の数字を送信するだけで検索できます。</p>
    <div class="tut-tip">無線番号と一致する車両は【無線番号一致】、ナンバー末尾と一致する車両は【ナンバー一致】として区別して表示されます。</div>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍検索結果の表示内容</p>
    <table class="tut-table">
      <tr><th>項目</th><th>内容</th></tr>
      <tr><td>無線番号</td><td>車両に割り当てられた無線番号</td></tr>
      <tr><td>車両番号</td><td>ナンバープレートの全文字列（例: 品川502あ1988）</td></tr>
      <tr><td>車種</td><td>車両の種類（例: JPN TAXI）</td></tr>
      <tr><td>営業所</td><td>所属する営業所名</td></tr>
      <tr><td>課</td><td>所属課（例: 板橋2課）</td></tr>
      <tr><td>電話番号</td><td>営業所の電話番号（設定 → 営業所で管理）</td></tr>
    </table>

    <div class="tut-tip">班長・指導者はLINE連携後すぐに車番検索が利用できます。追加設定は不要です。</div>
    <div class="tut-note">班長・指導者以外に検索権限を与えたい場合は、LINEで「車番連携」と送信して自己申請できます。</div>
  </div>

  <!-- 1-10 LINE管理 -->
  <div class="tut-section" id="line" data-perm-key="line">
    <h3><span class="num">10</span>LINE管理 — ユーザー連携状況</h3>
    <p style="font-size:13px;">社員のLINEアカウントと本システムの紐付け状況を管理します。</p>
    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍新人・運行管理者などの登録</p>
    <p style="font-size:13px;">招待コード方式は廃止され、「設定 → LINE連携」ページに統合されました。QRコードを発行して本人に読み取ってもらうだけで登録できます。</p>
    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍アンケート配信</p>
    <p style="font-size:13px;">タイトルとGoogle FormsのURLを入力して送信すると、LINE連携済みの全社員にアンケートリンクが配信されます。</p>
    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍LINE紐付け済み一覧</p>
    <p style="font-size:13px;">氏名・社員番号・紐付け日時・LINE UIDの一覧が確認できます。</p>
    <div class="tut-note">お知らせの一斉配信・個別配信は「お知らせ配信」ページで行います。</div>
  </div>

  <!-- 1-11 設定 -->
  <div class="tut-section" id="settings" data-perm-key="settings">
    <h3><span class="num">11</span>設定 — 各種マスタ管理</h3>
    <p style="font-size:13px;">設定ページは次の6グループに分かれています。アカウントに権限のない項目は表示されません。</p>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍日々の運用</p>
    <table class="tut-table">
      <tr><th>項目</th><th>内容</th></tr>
      <tr><td>報告センター</td><td>忘れ物・事故・違反・一般報告・引き継ぎメモをタブで切り替えて履歴・進捗を管理（詳細は 1-17）</td></tr>
      <tr><td>要望欄</td><td>ホシコンについての要望・意見・欲しい機能などを自由に投稿</td></tr>
    </table>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍権限・アカウント</p>
    <table class="tut-table">
      <tr><th>項目</th><th>内容</th></tr>
      <tr><td>アカウント権限管理</td><td>管理画面アカウントの作成と、機能ごとの閲覧/編集権限の設定</td></tr>
      <tr><td>LINE連携</td><td>QRコード発行での新人・統括管理者・運行管理者・車番管理者などの登録と連携済みユーザー管理</td></tr>
    </table>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍シフト関連の設定</p>
    <p style="font-size:13px;">「シフト関連の設定」カードを開くと、以下の項目が一覧で表示されます。</p>
    <table class="tut-table">
      <tr><th>項目</th><th>内容</th></tr>
      <tr><td>シフト区分</td><td>実研・公休・座学などの区分名・背景色・月間目標回数を追加・編集</td></tr>
      <tr><td>勤務ダイヤ・サイクル</td><td>ダイヤマスター（勤務時間帯・指導基準）とサイクル一覧表の管理</td></tr>
      <tr><td>研修担当</td><td>シフト入力時に選択できるコーチ（研修担当者）の名前を登録</td></tr>
      <tr><td>班長・指導者</td><td>シフト表下部の指導者スケジュール欄を管理</td></tr>
      <tr><td>月度設定</td><td>各月の締め日・開始日を設定（例：17日締め 18日開始）</td></tr>
      <tr><td>ベンテンクラブ シフト</td><td>ベンテンクラブの会員・グループ・シフト種別・LINE自動送信の管理（詳細は 1-18）</td></tr>
      <tr><td>班長関連</td><td>班長リスト（社員番号・内勤）、希望休フォームの設定</td></tr>
    </table>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍LINE関連</p>
    <table class="tut-table">
      <tr><th>項目</th><th>内容</th></tr>
      <tr><td>LINE管理</td><td>新人向け招待コードの発行・紐付け状況の確認</td></tr>
      <tr><td>LINE通知設定</td><td>朝の出勤レポート・ベンテンシフト通知・班長出勤通知の時刻とON/OFFをまとめて管理</td></tr>
    </table>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍マスタ管理</p>
    <table class="tut-table">
      <tr><th>項目</th><th>内容</th></tr>
      <tr><td>営業所</td><td>各営業所・連絡先の電話番号・住所（車両検索の結果にも表示される）</td></tr>
      <tr><td>違反種類・点数/反則金</td><td>違反報告フォームの選択肢と点数・反則金の管理</td></tr>
      <tr><td>CC名簿</td><td>クレーム客の記録台帳。開くたびに専用パスワードの入力が必要</td></tr>
    </table>

    <p style="font-size:13px;font-weight:700;margin-bottom:4px;margin-top:14px;">▍ガイド・システム</p>
    <table class="tut-table">
      <tr><th>項目</th><th>内容</th></tr>
      <tr><td>資料センター</td><td>マニュアルPDF・就業規則などの資料を保存・共有</td></tr>
      <tr><td>チュートリアル</td><td>このマニュアル（印刷・PDF出力対応）</td></tr>
      <tr><td>車番検索ガイド</td><td>班長・指導者向けLINE車番検索の使い方ページ（印刷・配布用）</td></tr>
      <tr><td>システムステータス</td><td>サーバー・DB・APIの稼働状態確認、利用統計・DB統計、管理画面アクセスQRコードの表示・ダウンロード。フル権限adminはメンテナンスモードのON/OFFもここから行えます</td></tr>
      <tr><td>要望欄（収集一覧）</td><td>設定ページ「要望欄」から寄せられた要望・意見の一覧（フル権限adminのみ）</td></tr>
    </table>
    <div class="tut-note">車番検索の権限は、本人がLINEで「車番連携」と送信して自己申請する方式です（管理画面からの手動登録は廃止）。</div>
    <div class="tut-warn">メンテナンスモードをONにすると、LINE Botの応答も含め全ユーザーにメンテナンス中の画面が表示されます。作業前後の切り忘れに注意してください。</div>
  </div>

  <!-- 1-12 班長シフト -->
  <div class="tut-section" id="kancho" data-perm-key="kancho-shift">
    <h3><span class="num">12</span>班長シフト — 班長・指導者の月間シフト</h3>
    <p style="font-size:13px;">班長・指導者の月間シフト表をWebで管理します。紙のExcel運用の置き換えです。</p>
    <ol class="tut-steps">
      <li>左メニュー「班長シフト」を開き、月を選択</li>
      <li>「編集モード」でセルをタップして勤務区分（日勤・当直・公休など）を入力</li>
      <li>「一括保存」で確定 — 保存前のセルは黄色の点線で表示されます</li>
    </ol>
    <table class="tut-table">
      <tr><th>機能</th><th>内容</th></tr>
      <tr><td>希望マーク</td><td>本人がLINE（LIFF）から出した希望はセル右上に赤い三角で表示</td></tr>
      <tr><td>メモ</td><td>日付ごとの申し送りメモを残せる</td></tr>
      <tr><td>印刷</td><td>印刷用ページからA4で出力可能</td></tr>
      <tr><td>0時LINE通知</td><td>毎日0時に「本日の出勤者」を通知（設定 → LINE通知設定 でも管理可）</td></tr>
      <tr><td>個人別確認</td><td>班長シフト表ヘッダーの「👤 個人別確認」ボタンから、班長一人ひとりの1ヶ月分の予定（日付・曜日・勤務・その他）を確認できる。勤務欄は班長シフト表のデータをそのまま表示する閲覧専用、「その他」欄のみ本人が自由記述で編集可能。社員番号を入力して本人を指定する（班長シフトを開ける全アカウントが利用可）</td></tr>
    </table>
    <div class="tut-tip">閲覧だけできる人と編集できる人は、アカウント権限管理で分けられます。</div>
  </div>

  <!-- 1-13 社員絞り込み検索 -->
  <div class="tut-section" id="staff-search" data-perm-key="staff">
    <h3><span class="num">13</span>社員絞り込み検索 — 条件を組み合わせた検索</h3>
    <p style="font-size:13px;">名前・社員番号のキーワードに加えて、課・班・勤務形態・在籍状態・入社区分・入社日/退職日の期間・年齢・車種などの条件を組み合わせて社員を検索できます。「社員管理」ページ内の「詳細検索」に統合されています。</p>
    <ol class="tut-steps">
      <li>左メニュー「社員管理」を開く</li>
      <li>フィルターの下にある「詳細検索」を開き、条件を選んで「絞り込む」— 条件は複数選択できます</li>
      <li>該当する社員の行をクリックすると社員詳細ページへ移動</li>
    </ol>
    <div class="tut-tip">ふりがな（カタカナ）でも検索できます。条件をやり直すときは「詳細条件をリセット」を押してください。</div>
  </div>

  <!-- 1-14 点検管理 -->
  <div class="tut-section" id="inspection" data-perm-key="inspection">
    <h3><span class="num">14</span>点検管理 — 車両点検スケジュール</h3>
    <p style="font-size:13px;">課ごとの車両点検予定（車番・点検種別・出発時刻）を月表で管理します。</p>
    <ol class="tut-steps">
      <li>左メニュー「点検管理」を開き、月と課を選択</li>
      <li>日付をタップして車番・点検種別・時刻を入力</li>
      <li>紙の予定表の写真を取り込むと、AIが読み取って一括登録することもできます</li>
    </ol>
    <div class="tut-warn">写真のAI読み取りは日付ズレなどの誤読が起きることがあります。取り込んだ後は必ず紙の原本と目で照合してください。</div>
  </div>

  <!-- 1-15 資料センター -->
  <div class="tut-section" id="document-center" data-perm-key="settings.documents">
    <h3><span class="num">15</span>資料センター — マニュアル・就業規則の保管</h3>
    <p style="font-size:13px;">マニュアルPDF・就業規則・その他の資料をアップロードし、カテゴリで分類して保管・閲覧できます。</p>
    <ol class="tut-steps">
      <li>設定 →「資料センター」を開く</li>
      <li>「資料を追加」からタイトル・カテゴリを入力してファイルをアップロード</li>
      <li>カテゴリで絞り込んで一覧から資料を開く・ダウンロードできます</li>
    </ol>
    <div class="tut-note">PDF・Word・Excel・画像などのファイルに対応しています。</div>
  </div>

  <!-- 1-16 報告センター -->
  <div class="tut-section" id="report-center" data-perm-key="settings.lost-items settings.accidents settings.violations settings.general-reports settings.handover-memos">
    <h3><span class="num">16</span>報告センター — 忘れ物・事故・違反・一般報告・引き継ぎメモ</h3>
    <p style="font-size:13px;">乗務員や管理者がLINE（LIFF「報告」）から送った報告を、設定 → 報告センター（忘れ物/事故/違反/一般報告/引き継ぎメモタブ）で確認・管理します。</p>
    <ol class="tut-steps">
      <li>設定 → 「忘れ物報告」「事故報告」「違反報告」「一般報告」のいずれかを開く（上部タブで切り替え）</li>
      <li>「対応中」「解決済」ボタンで絞り込み</li>
      <li>対応が終わったら「解決済にする」— ログイン中のアカウント名と日時が「対応者」列に自動で記録されます</li>
    </ol>
    <p style="font-size:13px;margin-top:10px;">「引き継ぎメモ」タブは、忘れ物・事故等のような定型項目を持たず、Excel風のセル単位で自由に文字を入力できるメモです。LINEからは投稿できず、管理画面のみで作成・編集します。</p>
    <ol class="tut-steps">
      <li>「＋ 新規メモを作成」でメモを作り、セルをクリック（ドラッグで複数選択も可）してツールバーから文字サイズ・文字色・背景色・太字を設定</li>
      <li>タイトルを入力し「保存」を押すと、作成者・最終更新者・更新日時が自動で記録されます</li>
    </ol>
    <table class="tut-table">
      <tr><th>列</th><th>内容</th></tr>
      <tr><td>報告者</td><td>LINEからこの報告を送った人（運行管理者など）</td></tr>
      <tr><td>対応者</td><td>「解決済にする」を押した管理画面アカウントと日時</td></tr>
      <tr><td>履歴ボタン</td><td>この報告に対する解決・再開・削除の全操作と操作者を表示</td></tr>
    </table>
    <div class="tut-tip">各タブの「新規登録」から、管理画面のブラウザ上で直接報告を登録することもできます（電話や口頭で受けた報告の記録用）。この場合、報告者欄には対応した管理者名が「〇〇（管理画面）」の形で表示されます。</div>
    <div class="tut-tip">ダッシュボードの「対応中の現場報告」に未対応件数が表示されます。0でない場合は早めに確認してください。</div>
    <div class="tut-note">報告を削除してもデータ上の履歴には「誰が・いつ・何を削除したか」が残ります。</div>
  </div>

  <!-- 1-17 ベンテンクラブ シフト -->
  <div class="tut-section" id="benten-shift" data-perm-key="settings.benten">
    <h3><span class="num">17</span>ベンテンクラブ シフト</h3>
    <p style="font-size:13px;">ベンテンクラブ会員のシフトを管理し、LINEグループへ毎日自動送信します。</p>
    <table class="tut-table">
      <tr><th>設定項目</th><th>内容</th></tr>
      <tr><td>会員</td><td>会員の名前・所属グループ・表示順の管理</td></tr>
      <tr><td>グループ / シフト種別</td><td>グループ分けと、H勤・D勤などの種別・色の管理</td></tr>
      <tr><td>表示期間</td><td>LIFFのシフト表に表示する期間の追加・削除</td></tr>
      <tr><td>LINE自動送信</td><td>毎日決まった時刻に「本日出勤者」をグループへ送信。時刻・ON/OFFはLINE通知設定と共通</td></tr>
    </table>
    <div class="tut-note">グループ連携は、Botをグループに招待して「ベンテングループ登録」と送信すると完了します。</div>
  </div>

  <!-- 1-18 LINE利用状況 -->
  <div class="tut-section" id="line-usage" data-perm-key="settings.line-usage">
    <h3><span class="num">18</span>LINE利用状況 — 操作ログの確認</h3>
    <p style="font-size:13px;">LINE連携ユーザーが「いつ・どの機能を使ったか」を確認できます。今日・7日間・30日間の利用者数と、ユーザーごとの利用回数・最終利用日時が一覧になります。</p>
    <div class="tut-note">このページはフル権限の管理者（admin）だけが見られます。</div>
  </div>

  <!-- 1-19 引き継ぎシート -->
  <div class="tut-section" id="handover" data-perm-key="handover">
    <h3><span class="num">19</span>引き継ぎシート — 課の申し送り事項</h3>
    <p style="font-size:13px;">課ごとの当日・翌日の引き継ぎ事項（事故車・車両異常・乗務希望・点検車検リコールなど）を項目単位で入力・保存します。</p>
    <table class="tut-table">
      <tr><th>機能</th><th>内容</th></tr>
      <tr><td>項目単位で保存</td><td>各項目を入力するとその場で自動保存（一括保存は不要）</td></tr>
      <tr><td>点検車検リコール</td><td>点検管理の点検車検表から対象日の内容が自動で反映される</td></tr>
      <tr><td>翌日シート作成</td><td>「翌日分を作成」で事故車・車両異常・乗務希望を当日分からコピーして下書きを作れる</td></tr>
      <tr><td>文字サイズ設定</td><td>課ごとに本文の表示文字サイズを変更できる</td></tr>
    </table>
  </div>

  <!-- 1-20 個人データ参照・乗務員シフト・売上分析・担当車表 -->
  <div class="tut-section" id="crew-portal" data-perm-key="crew-portal">
    <h3><span class="num">20</span>個人データ参照・乗務員シフト・売上分析・担当車表</h3>
    <p style="font-size:13px;">社員管理の一覧の各行、またはヘッダーの「関連ページ」から、乗務員ごとの日別明細・売上分析（個人データ参照）、乗務員シフト、全社の売上分析、担当車表にアクセスできます。</p>
    <table class="tut-table">
      <tr><th>機能</th><th>内容</th></tr>
      <tr><td>個人データ参照</td><td>社員管理の一覧・詳細ページから遷移し、日別明細・月度売上推移・曜日別平均売上などを表示</td></tr>
      <tr><td>乗務員シフト</td><td>月間勤務予定表のWeb版。夏季稼働計画対実績の確認も可能</td></tr>
      <tr><td>売上分析（全社）</td><td>全社員横断の売上分析</td></tr>
      <tr><td>担当車表</td><td>3班・4班の担当者一覧表。Webで編集・印刷できる（板橋のみ）</td></tr>
    </table>
  </div>

  <!-- 1-21 やることリスト -->
  <div class="tut-section" id="todo" data-perm-key="todo">
    <h3><span class="num">21</span>やることリスト — 課ごとの日次チェックリスト・当直共通タスク</h3>
    <p style="font-size:13px;">1〜4課それぞれの日次定型業務と、当直担当者の共通業務をチェックリストで管理します。日付を切り替えて過去・当日・翌日の状況を確認できます。</p>
    <table class="tut-table">
      <tr><th>機能</th><th>内容</th></tr>
      <tr><td>課タブ</td><td>1課〜4課はそれぞれ独立したリスト（他課の編集・チェックには影響しない）。「当直」タブは課の区別なく1本のリストを共有</td></tr>
      <tr><td>チェック</td><td>日付ごとにチェック状態を保存。誰が完了したかも記録される</td></tr>
      <tr><td>曜日限定タスク</td><td>「点検札を入れる」など特定曜日のみのタスクは対象外の日は淡色表示になる</td></tr>
      <tr><td>日付連動の注意書き</td><td>「点呼作成」の19日など、毎月特定の日だけ注意書きを強調表示できる</td></tr>
      <tr><td>リストを編集</td><td>タスクの追加・編集・削除（論理削除）・ドラッグ&ドロップでの並び替えが可能</td></tr>
    </table>
  </div>

  <hr class="tut-divider">

  <!-- 第2章 -->
  <div class="tut-chapter" id="chap2" data-perm-key="settings.vehicle-search-guide">
    <div class="tut-chapter-label">Chapter 2</div>
    <h2>班長・指導者向け（LINE車番検索ガイド）</h2>
  </div>
  <div class="tut-section" id="veh-guide" data-perm-key="settings.vehicle-search-guide">
    <p style="font-size:13px;">班長・指導者は、LINEで「<strong>車番連携</strong>」と送信して自己申請することで、無線番号・ナンバー末尾から車両情報を検索できるようになります。初回設定の手順・検索方法・結果の見方・連携解除のコマンドなど詳しい使い方は、配布用の専用ガイドにまとめてあります。</p>
    <a href="${ADMIN_PATH}/settings/vehicle-search-guide" style="display:inline-block;margin-top:4px;padding:8px 20px;background:#1e3a5f;color:#fff;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;">→ 車番検索ガイドを開く</a>
  </div>

  <hr class="tut-divider" data-perm-key="settings.vehicle-search-guide">

  <!-- 第3章 -->
  <div class="tut-chapter" id="chap3">
    <div class="tut-chapter-label">Chapter 3</div>
    <h2>現場スタッフ向け（LINE利用ガイド）</h2>
  </div>
  <p style="font-size:13px;color:#6b7280;margin-top:8px;">このシステムでは、スタッフの皆さんはスマートフォンの <strong>LINE</strong> を使って報告・連絡ができます。専用アプリのインストールは不要です。</p>

  <!-- 3-1 LINEでできること -->
  <div class="tut-section" id="line-what">
    <h3><span class="num">1</span>LINEでできること</h3>
    <table class="tut-table">
      <tr><th>機能</th><th>内容</th></tr>
      <tr><td>お知らせの受け取り</td><td>事務所からのお知らせ・連絡事項がLINEに届きます</td></tr>
      <tr><td>アンケートへの回答</td><td>URLリンク付きのアンケートがLINEで送られてくることがあります</td></tr>
    </table>
  </div>

  <!-- 3-2 初回連携 -->
  <div class="tut-section" id="line-link">
    <h3><span class="num">2</span>初回連携の方法</h3>
    <p style="font-size:13px;">最初に1回だけ設定が必要です。</p>
    <ol class="tut-steps">
      <li>事務所スタッフから「招待コード」（例：<strong>AB1234</strong>）を受け取る</li>
      <li>スマートフォンで「<strong>弁天クラブ公式LINE</strong>」を友達追加する（QRコードまたはID検索）</li>
      <li>トーク画面に「<strong>コード: AB1234</strong>」と入力して送信</li>
      <li>「連携が完了しました」とメッセージが届いたら設定完了です</li>
    </ol>
    <div class="tut-note">連携は1回だけでOKです。機種変更した場合は事務所スタッフに再連携を依頼してください。</div>
  </div>

  <!-- 3-3 お知らせ受け取り -->
  <div class="tut-section" id="line-recv">
    <h3><span class="num">3</span>お知らせ・アンケートの受け取り方</h3>
    <p style="font-size:13px;">事務所からのお知らせは弁天クラブ公式LINEから自動で届きます。</p>
    <ol class="tut-steps">
      <li>LINEに通知が届いたらトーク画面を開く</li>
      <li>お知らせ内容を確認する</li>
      <li>URLリンクが含まれている場合はタップしてアンケートに回答する</li>
    </ol>
    <div class="tut-note">LINEの通知設定がオフになっていると受け取れません。通知がオンになっているか確認してください。</div>
  </div>

  <div style="margin-top:40px;padding-top:20px;border-top:2px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af;">
    ホシコン 使い方ガイド &nbsp;|&nbsp; 2026年7月版 &nbsp;|&nbsp; ご不明な点は事務所スタッフまでお問い合わせください
  </div>
</div>`;

  return c.html(layout('チュートリアル', html, 'settings'));
});

// ===== 新人リスト（新卒Info統合） =====
app.get('/employees', async (c) => {
  const filterStatus = c.req.query('status') ?? 'all';
  const filterDiv    = c.req.query('div')    ?? 'all';
  const filterYear   = c.req.query('year')   ?? 'all';
  const filterType   = c.req.query('type')   ?? 'all'; // all | normal | shinsotsu
  const filterGrad   = c.req.query('grad')   ?? 'all';
  const sortKey      = c.req.query('sort')   ?? 'hire_date';

  const conditions: string[] = ['e.is_active = 1', 'e.is_newcomer = 1'];
  if (filterStatus === 'training')    conditions.push("(e.status IS NULL OR e.status = 'training')");
  else if (filterStatus === 'completed')  conditions.push("e.status = 'completed'");
  else if (filterStatus === 'unassigned') conditions.push("e.status = 'unassigned'");
  if (filterDiv !== 'all') conditions.push(`e.division = ${parseInt(filterDiv)}`);
  if (filterYear !== 'all') conditions.push(`strftime('%Y', e.hire_date) = '${filterYear.replace(/[^0-9]/g, '')}'`);
  if (filterType === 'normal' || filterType === 'shinsotsu') conditions.push(`e.newcomer_type = '${filterType}'`);
  if (filterGrad !== 'all') conditions.push(`e.graduate_year = ${parseInt(filterGrad)}`);

  const ORDER: Record<string, string> = {
    hire_date:      "CASE WHEN e.hire_date IS NULL THEN 1 ELSE 0 END, e.hire_date ASC, e.seq_no, e.id",
    hire_date_desc: "CASE WHEN e.hire_date IS NULL THEN 1 ELSE 0 END, e.hire_date DESC, e.seq_no, e.id",
    seq_no:         "e.seq_no ASC, e.id",
    division:       "e.division ASC, e.team ASC, e.seq_no, e.id",
    name:           "e.name ASC",
  };
  const orderBy = ORDER[sortKey] ?? ORDER.hire_date;

  const employees = await c.env.DB.prepare(
    `SELECT e.*, i.mental_status, i.driving_skill
     FROM employees e
     LEFT JOIN new_employee_info i ON e.id = i.emp_id
     WHERE ${conditions.join(' AND ')} ORDER BY ${orderBy}`
  ).all<Employee & { status: string; mental_status: string | null; driving_skill: string | null }>();

  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  const canViewCrewCard = perms === null || perms.includes('crew-portal');

  // 配属年の一覧（年フィルター用）
  const years = await c.env.DB.prepare(
    "SELECT DISTINCT strftime('%Y', hire_date) as y FROM employees WHERE is_active = 1 AND is_newcomer = 1 AND hire_date IS NOT NULL ORDER BY y DESC"
  ).all<{ y: string }>();

  // 新卒年度の一覧（新卒年度フィルター用）
  const gradYears = await c.env.DB.prepare(
    "SELECT DISTINCT graduate_year as y FROM employees WHERE is_active = 1 AND is_newcomer = 1 AND newcomer_type = 'shinsotsu' AND graduate_year IS NOT NULL ORDER BY y DESC"
  ).all<{ y: number }>();

  const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    training:   { bg: '#dbeafe', color: '#1e40af', label: '研修中' },
    completed:  { bg: '#bbf7d0', color: '#166534', label: '研修終了' },
    unassigned: { bg: '#f3f4f6', color: '#6b7280', label: '未配属' },
  };
  const MENTAL_COLORS: Record<string, string> = {
    '安定': '#bbf7d0', '注意': '#fef08a', '要フォロー': '#fed7aa', '危険': '#fecaca'
  };

  const rows = (employees.results ?? []).map((e: any) => {
    const st = e.status ?? 'training';
    const ss = STATUS_STYLE[st] ?? STATUS_STYLE.training;
    const itTarget = !!e.interview_target;
    // 研修中 → 研修終了 → 未配属 → 研修中 のサイクル
    const nextLabels: Record<string, string> = { training: '→研修終了', completed: '→未配属', unassigned: '→研修中' };
    const nextLabel  = nextLabels[st] ?? '→研修終了';
    const C = 'padding:7px 8px;border-bottom:1px solid #f3f4f6;vertical-align:middle;overflow:hidden;';
    const newcomerBadge = e.newcomer_type === 'shinsotsu'
      ? `<span style="background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:4px;font-size:11px;white-space:nowrap;">新卒${e.graduate_year ? ' ' + e.graduate_year : ''}</span>`
      : `<span style="background:#f3f4f6;color:#374151;padding:2px 6px;border-radius:4px;font-size:11px;white-space:nowrap;">通常新人</span>`;
    const mentalBadge = e.mental_status
      ? `<span style="background:${MENTAL_COLORS[e.mental_status] ?? '#f3f4f6'};padding:2px 6px;border-radius:4px;font-size:11px;white-space:nowrap;">${escHtml(e.mental_status)}</span>`
      : '<span style="color:#d1d5db;font-size:11px;">—</span>';
    return `
    <tr style="background:white;cursor:pointer;"
      onmouseover="this.style.background='#f8fafc'"
      onmouseout="this.style.background='white'"
      onclick="if(!event.target.closest('button'))location.href='${ADMIN_PATH}/employees/${e.id}/edit'">
      <td style="${C}font-size:12px;color:#9ca3af;text-align:center;white-space:nowrap;">
        ${e.seq_no ?? ''}
      </td>
      <td style="${C}font-size:12px;color:#6b7280;white-space:nowrap;">
        ${e.division ?? ''}課${e.team ? ' '+e.team+'班' : ''}
      </td>
      <td style="${C}">
        <div style="display:flex;align-items:baseline;gap:5px;min-width:0;">
          <span style="font-size:13px;font-weight:600;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(e.name)}</span>
          <span style="font-size:11px;color:#9ca3af;white-space:nowrap;flex-shrink:0;">${escHtml(e.emp_no)}</span>
        </div>
      </td>
      <td style="${C}white-space:nowrap;">
        ${newcomerBadge}
      </td>
      <td style="${C}white-space:nowrap;">
        <button onclick="event.stopPropagation();cycleStatus(${e.id},'${st}')" title="${nextLabel}"
          style="background:${ss.bg};color:${ss.color};padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;white-space:nowrap;border:none;cursor:pointer;"
          onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">
          ${ss.label}
        </button>
      </td>
      <td style="${C}text-align:center;white-space:nowrap;">
        <button onclick="event.stopPropagation();toggleInterview(${e.id},${itTarget ? 1 : 0})"
          style="padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;border:none;white-space:nowrap;background:${itTarget ? '#1a3a5c' : '#f3f4f6'};color:${itTarget ? 'white' : '#9ca3af'};">
          ${itTarget ? '対象' : '—'}
        </button>
      </td>
      <td style="${C}white-space:nowrap;">
        ${mentalBadge}
      </td>
      <td style="${C}font-size:12px;color:#6b7280;white-space:nowrap;text-align:center;">
        ${e.hire_date ? e.hire_date.slice(5).replace('-', '/') : '—'}
      </td>
      <td style="${C}white-space:nowrap;text-align:center;">
        ${(e.first_duty_date && canViewCrewCard)
          ? `<a href="${ADMIN_PATH}/crew-portal/employee/${e.id}" onclick="event.stopPropagation();" style="font-size:11px;padding:3px 8px;background:#eff6ff;color:#1d4ed8;border-radius:4px;text-decoration:none;white-space:nowrap;">実績を見る</a>`
          : '<span style="color:#d1d5db;font-size:11px;">—</span>'}
      </td>
      <td style="${C}white-space:nowrap;">
        <div style="display:flex;gap:4px;">
          <button onclick="event.stopPropagation();retire(${e.id},'${escHtml(e.name)}')" style="font-size:11px;padding:4px 8px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:4px;cursor:pointer;white-space:nowrap;">退職</button>
          <button onclick="event.stopPropagation();purge(${e.id},'${escHtml(e.name)}')" style="font-size:11px;padding:4px 8px;background:#1f2937;color:white;border:none;border-radius:4px;cursor:pointer;white-space:nowrap;">削除</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const q = (params: Record<string, string>) => {
    const base = { status: filterStatus, div: filterDiv, year: filterYear, type: filterType, grad: filterGrad, sort: sortKey };
    return Object.entries({ ...base, ...params }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  };

  const statusBtns = [
    ['all', '全員'], ['training', '研修中'], ['completed', '研修終了'], ['unassigned', '未配属'],
  ].map(([val, label]) =>
    `<a href="${ADMIN_PATH}/employees?${q({ status: val })}" class="text-xs px-3 py-1 rounded ${filterStatus === val ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">${label}</a>`
  ).join('');

  const divBtns = [
    ['all', '全課'], ['1', '1課'], ['2', '2課'], ['3', '3課'], ['4', '4課'],
  ].map(([val, label]) =>
    `<a href="${ADMIN_PATH}/employees?${q({ div: val })}" class="text-xs px-3 py-1 rounded ${filterDiv === val ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">${label}</a>`
  ).join('');

  const yearBtns = [
    ['all', '全年'],
    ...(years.results ?? []).map(r => [r.y, `${r.y}年`]),
  ].map(([val, label]) =>
    `<a href="${ADMIN_PATH}/employees?${q({ year: val })}" class="text-xs px-3 py-1 rounded ${filterYear === val ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">${label}</a>`
  ).join('');

  const typeBtns = [
    ['all', '全員'], ['normal', '通常新人'], ['shinsotsu', '新卒'],
  ].map(([val, label]) =>
    `<a href="${ADMIN_PATH}/employees?${q({ type: val, grad: val === 'shinsotsu' ? filterGrad : 'all' })}" class="text-xs px-3 py-1 rounded ${filterType === val ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">${label}</a>`
  ).join('');

  const gradBtns = filterType === 'shinsotsu' ? [
    ['all', '全年度'],
    ...(gradYears.results ?? []).map(r => [String(r.y), `${r.y}年新卒`]),
  ].map(([val, label]) =>
    `<a href="${ADMIN_PATH}/employees?${q({ grad: val })}" class="text-xs px-3 py-1 rounded ${filterGrad === val ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">${label}</a>`
  ).join('') : '';

  // ソートリンクを生成するヘルパー
  function sortLink(key: string, keyDesc: string, label: string): string {
    const isAsc = sortKey === key;
    const isDesc = sortKey === keyDesc;
    const nextSort = isAsc ? keyDesc : key;
    const indicator = isAsc ? ' ▲' : isDesc ? ' ▼' : '';
    const active = isAsc || isDesc;
    return `<a href="${ADMIN_PATH}/employees?${q({ sort: nextSort })}"
      style="text-decoration:none;color:${active ? '#1d4ed8' : '#6b7280'};font-weight:${active ? '700' : '500'};">
      ${label}${indicator}
    </a>`;
  }

  const content = `
    <div class="flex justify-between items-center mb-3">
      <div class="space-y-2">
        <div class="flex gap-1 items-center">
          <span class="text-xs text-gray-400 w-12">種別</span>
          <div class="flex gap-1">${typeBtns}</div>
        </div>
        ${gradBtns ? `<div class="flex gap-1 items-center">
          <span class="text-xs text-gray-400 w-12">新卒年度</span>
          <div class="flex gap-1">${gradBtns}</div>
        </div>` : ''}
        <div class="flex gap-1 items-center">
          <span class="text-xs text-gray-400 w-12">ステータス</span>
          <div class="flex gap-1">${statusBtns}</div>
        </div>
        <div class="flex gap-1 items-center">
          <span class="text-xs text-gray-400 w-12">課</span>
          <div class="flex gap-1">${divBtns}</div>
        </div>
        <div class="flex gap-1 items-center">
          <span class="text-xs text-gray-400 w-12">年</span>
          <div class="flex gap-1">${yearBtns}</div>
        </div>
      </div>
      <div class="flex gap-2 items-center">
        <span class="text-sm text-gray-500">${(employees.results ?? []).length}名</span>
        <a href="${ADMIN_PATH}/employees/export" class="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-gray-700">CSV出力</a>
        <a href="${ADMIN_PATH}/employees/add" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">＋ 新規登録</a>
      </div>
    </div>
    <div class="bg-white rounded-xl shadow overflow-auto">
      <table style="width:100%;border-collapse:collapse;">
        <thead class="bg-gray-50">
          <tr>
            <th style="padding:8px 10px;text-align:left;font-size:11px;border-bottom:1px solid #e5e7eb;">${sortLink('seq_no','seq_no','NO')}</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;border-bottom:1px solid #e5e7eb;">${sortLink('division','division','課・班')}</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;border-bottom:1px solid #e5e7eb;">${sortLink('name','name','氏名')}</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500;">種別</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500;">ステータス</th>
            <th style="padding:8px 10px;text-align:center;font-size:11px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500;">面談</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500;">メンタル</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;border-bottom:1px solid #e5e7eb;">${sortLink('hire_date','hire_date_desc','配属日')}</th>
            <th style="padding:8px 10px;text-align:center;font-size:11px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500;">乗務実績</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-weight:500;">操作</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="10" style="padding:24px;text-align:center;color:#9ca3af;font-size:13px;">該当する新人がいません（新人登録は社員管理の社員詳細から行えます）</td></tr>'}</tbody>
      </table>
    </div>
    <script>
    async function toggleInterview(id, current) {
      const res = await fetch('/api/employees/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interview_target: current ? 0 : 1 })
      });
      if (res.ok) { location.reload(); }
      else { alert('変更に失敗しました。'); }
    }
    async function cycleStatus(id, current) {
      const map = { training:'completed', completed:'unassigned', unassigned:'training' };
      const next = map[current] ?? 'completed';
      const res = await fetch('/api/employees/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next })
      });
      if (res.ok) { location.reload(); }
      else { alert('変更に失敗しました。'); }
    }
    async function purge(id, name) {
      if (!confirm('【完全削除】' + name + ' を完全に削除します。\\nシフト・売上・面談記録など全データが削除されます。\\nこの操作は取り消せません。\\n\\n本当に削除しますか？')) return;
      if (!confirm('最終確認：' + name + ' のすべてのデータを削除します。')) return;
      const res = await fetch('/api/employees/' + id + '/purge', { method: 'DELETE' });
      if (res.ok) { location.reload(); }
      else { alert('削除に失敗しました。'); }
    }
    async function retire(id, name) {
      if (!confirm(name + ' さんを退職処理しますか？\\nシフト・売上データは保持されます。')) return;
      const res = await fetch('/api/employees/' + id, { method: 'DELETE' });
      if (res.ok) {
        alert(name + ' さんを退職処理しました。');
        location.reload();
      } else {
        alert('処理に失敗しました。');
      }
    }
    </script>
  `;
  return c.html(layout('新人管理', content, 'employees'));
});

// ===== 新人リストCSV出力 =====
app.get('/employees/export', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT e.division, e.team, e.emp_no, e.name, e.phone, e.entry_type,
      e.newcomer_type, e.graduate_year,
      i.hobbies, i.favorite_food, i.alcohol, i.alcohol_note,
      i.driving_skill, i.driving_note, i.mental_status, i.mental_note, i.other_notes,
      i.updated_at
    FROM employees e
    LEFT JOIN new_employee_info i ON e.id = i.emp_id
    WHERE e.is_active = 1 AND e.is_newcomer = 1
    ORDER BY e.division, e.team, e.seq_no
  `).all<Record<string, string>>();

  const header = ['課', '班', '社員番号', '氏名', '電話番号', '入社区分', '新人種別', '新卒年度', '趣味', '好きな食べ物', 'お酒', 'お酒コメント', '運転技術', '運転技術コメント', 'メンタル', 'メンタルコメント', 'その他', '更新日時'];
  const body = (rows.results ?? []).map(r =>
    [r.division ?? '', r.team ?? '', r.emp_no, `"${(r.name ?? '').replace(/"/g, '""')}"`,
     r.phone ?? '', r.entry_type ?? '', r.newcomer_type === 'shinsotsu' ? '新卒' : '通常新人', r.graduate_year ?? '',
     r.hobbies ?? '', r.favorite_food ?? '',
     r.alcohol ?? '', r.alcohol_note ?? '', r.driving_skill ?? '', r.driving_note ?? '',
     r.mental_status ?? '', r.mental_note ?? '', r.other_notes ?? '', r.updated_at ?? ''].join(',')
  ).join('\n');

  const csv = `﻿${header.join(',')}\n${body}`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="newcomers.csv"'
    }
  });
});

// ===== アフターフォローリスト =====
app.get('/followup', async (c) => {
  const filterDiv = c.req.query('div') ?? 'all';
  const divCond = filterDiv !== 'all' ? ` AND e.division = ${parseInt(filterDiv)}` : '';

  const rows = await c.env.DB.prepare(`
    SELECT
      e.id, e.name, e.emp_no, e.division, e.team, e.phone,
      e.status, e.hire_date,
      i.mental_status, i.mental_note, i.driving_skill, i.other_notes
    FROM employees e
    LEFT JOIN new_employee_info i ON e.id = i.emp_id
    WHERE e.is_active = 1 AND e.is_newcomer = 1${divCond}
    ORDER BY
      CASE i.mental_status WHEN '危険' THEN 1 WHEN '要フォロー' THEN 2 WHEN '注意' THEN 3 ELSE 4 END,
      e.division, e.seq_no
  `).all<{
    id: number; name: string; emp_no: string; division: number; team: number; phone: string;
    status: string; hire_date: string;
    mental_status: string; mental_note: string; driving_skill: string; other_notes: string;
  }>();

  const MENTAL_STYLE: Record<string, { bg: string; color: string }> = {
    '危険':    { bg: '#fecaca', color: '#991b1b' },
    '要フォロー': { bg: '#fed7aa', color: '#9a3412' },
    '注意':    { bg: '#fef08a', color: '#854d0e' },
    '安定':    { bg: '#bbf7d0', color: '#166534' },
  };
  const STATUS_STYLE: Record<string, { bg: string; color: string; label: string }> = {
    training:   { bg: '#dbeafe', color: '#1e40af', label: '研修中' },
    completed:  { bg: '#bbf7d0', color: '#166534', label: '研修終了' },
    unassigned: { bg: '#f3f4f6', color: '#6b7280', label: '未配属' },
  };

  const cards = (rows.results ?? []).map(e => {
    const ms = MENTAL_STYLE[e.mental_status] ?? { bg: '#f3f4f6', color: '#6b7280' };
    const ss = STATUS_STYLE[e.status ?? 'training'] ?? STATUS_STYLE.training;
    const mentalBadge = e.mental_status
      ? `<span style="background:${ms.bg};color:${ms.color};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${escHtml(e.mental_status)}</span>`
      : '<span style="color:#9ca3af;font-size:11px;">未入力</span>';
    const statusBadge = `<span style="background:${ss.bg};color:${ss.color};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;">${ss.label}</span>`;

    return `
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:16px;border-left:4px solid ${ms.bg === '#fecaca' ? '#ef4444' : ms.bg === '#fed7aa' ? '#f97316' : ms.bg === '#fef08a' ? '#eab308' : '#22c55e'};">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
        <div>
          <div style="font-size:15px;font-weight:bold;color:#1f2937;">${escHtml(e.name)}</div>
          <div style="font-size:12px;color:#6b7280;">${e.division ?? ''}課 ${e.team ?? ''}班 ／ ${escHtml(e.emp_no)}</div>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;">${statusBadge}${mentalBadge}</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:12px;margin-bottom:10px;">
        <div><span style="color:#9ca3af;">📞 </span><a href="tel:${escHtml(e.phone ?? '')}" style="color:#2563eb;">${escHtml(e.phone ?? '—')}</a></div>
        <div><span style="color:#9ca3af;">📅 配属 </span>${escHtml(e.hire_date ?? '—')}</div>
        <div><span style="color:#9ca3af;">🚗 運転 </span>${escHtml(e.driving_skill ?? '—')}</div>
      </div>
      ${e.mental_note ? `<div style="background:#f9fafb;border-radius:6px;padding:8px;font-size:12px;color:#374151;margin-bottom:8px;"><span style="color:#9ca3af;">メンタルメモ: </span>${escHtml(e.mental_note)}</div>` : ''}
      ${e.other_notes ? `<div style="background:#f9fafb;border-radius:6px;padding:8px;font-size:12px;color:#374151;margin-bottom:8px;"><span style="color:#9ca3af;">その他: </span>${escHtml(e.other_notes)}</div>` : ''}
      <div style="display:flex;gap:6px;">
        <a href="${ADMIN_PATH}/employees/${e.id}/edit" style="font-size:12px;padding:4px 10px;background:#f3f4f6;border-radius:6px;color:#374151;text-decoration:none;">詳細・Info編集</a>
      </div>
    </div>`;
  }).join('');

  const divBtns = [
    ['all', '全課'], ['1', '1課'], ['2', '2課'], ['3', '3課'], ['4', '4課'],
  ].map(([val, label]) =>
    `<a href="${ADMIN_PATH}/followup?div=${val}" class="text-xs px-3 py-1 rounded ${filterDiv === val ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">${label}</a>`
  ).join('');

  const dangerCount = (rows.results ?? []).filter(e => e.mental_status === '危険' || e.mental_status === '要フォロー').length;

  const content = `
    <div class="flex justify-between items-center mb-4">
      <div class="flex gap-2 items-center">
        <div class="flex gap-1">${divBtns}</div>
        ${dangerCount > 0 ? `<span style="background:#fecaca;color:#991b1b;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;">⚠️ 要注意 ${dangerCount}名</span>` : ''}
      </div>
      <span class="text-sm text-gray-500">${(rows.results ?? []).length}名</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px;">
      ${cards || '<div style="color:#9ca3af;padding:24px;">該当する社員がいません</div>'}
    </div>
  `;
  return c.html(layout('フォローリスト', content, 'followup'));
});

// ===== 社員編集フォーム =====
app.get('/employees/:id/edit', async (c) => {
  const id = parseInt(c.req.param('id'));
  const emp = await c.env.DB.prepare(`
    SELECT e.*, i.hobbies, i.favorite_food, i.alcohol, i.alcohol_note,
      i.driving_skill, i.driving_note, i.mental_status, i.mental_note, i.other_notes
    FROM employees e LEFT JOIN new_employee_info i ON e.id = i.emp_id WHERE e.id = ?
  `).bind(id).first<Employee & {
    birth_date: string | null;
    hobbies: string | null; favorite_food: string | null; alcohol: string | null; alcohol_note: string | null;
    driving_skill: string | null; driving_note: string | null; mental_status: string | null; mental_note: string | null;
    other_notes: string | null;
  }>();
  if (!emp) return c.text('社員が見つかりません', 404);

  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  const canRegister = perms === null || perms.includes('newcomers.register.edit');
  const canViewCrewCard = perms === null || perms.includes('crew-portal');

  const S = 'border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;font-size:13px;width:100%;outline:none;background:white;';
  const DS = 'border:1px solid #e5e7eb;border-radius:8px;padding:11px 14px;font-size:15px;width:100%;outline:none;background:white;color:#374151;';
  const inp = (name: string, val: string | null | number, type = 'text', placeholder = '') =>
    `<input type="${type}" name="${name}" value="${escHtml(String(val ?? ''))}" placeholder="${escHtml(placeholder)}" style="${S}" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#e5e7eb'">`;

  const sel = (name: string, opts: [string, string][], val: string | null | number) =>
    `<select name="${name}" style="${S}" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#e5e7eb'">
      ${opts.map(([v, l]) => `<option value="${v}"${String(val) === v ? ' selected' : ''}>${escHtml(l)}</option>`).join('')}
    </select>`;

  const ta = (name: string, val: string | null, placeholder = '') =>
    `<textarea name="${name}" placeholder="${escHtml(placeholder)}" rows="3" style="${S}">${escHtml(val ?? '')}</textarea>`;

  const dateRow = (name: string, val: string | null) =>
    `<div style="display:flex;gap:6px;align-items:center;">
      <input type="date" name="${name}" value="${escHtml(val ?? '')}" style="${DS}flex:1;" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#e5e7eb'">
      <button type="button" onclick="clearField('${name}')" style="padding:10px 10px;background:#f9fafb;color:#9ca3af;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;cursor:pointer;flex-shrink:0;">✕</button>
    </div>`;

  const lbl = (text: string, required = false) =>
    `<div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:5px;letter-spacing:0.03em;">${escHtml(text)}${required ? ' <span style="color:#ef4444;">*</span>' : ''}</div>`;

  const sec = (title: string) =>
    `<div style="font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:0.1em;text-transform:uppercase;padding-bottom:6px;border-bottom:1px solid #f3f4f6;margin-bottom:12px;margin-top:20px;">${title}</div>`;

  const ENTRY_COLORS: Record<string, string> = { '新卒': '#dbeafe', 'キャリア': '#bbf7d0', '縁故': '#fef9c3' };
  const entryColor = ENTRY_COLORS[emp.entry_type ?? ''] ?? '#f3f4f6';

  const content = `
    <div style="max-width:600px;">
      <a href="${ADMIN_PATH}/employees" style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#6b7280;text-decoration:none;margin-bottom:14px;" onmouseover="this.style.color='#374151'" onmouseout="this.style.color='#6b7280'">
        ← 社員一覧に戻る
      </a>

      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:18px 20px;margin-bottom:14px;display:flex;align-items:center;gap:14px;">
        <div style="width:44px;height:44px;border-radius:50%;background:#dbeafe;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#1d4ed8;flex-shrink:0;">
          ${escHtml((emp.name ?? '').charAt(0))}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:16px;font-weight:700;color:#111827;">${escHtml(emp.name)}</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:2px;">
            社員番号: ${escHtml(emp.emp_no)}
            <span style="margin:0 6px;color:#e5e7eb;">|</span>
            <span style="background:${entryColor};padding:1px 7px;border-radius:4px;font-size:11px;">${escHtml(emp.entry_type ?? '')}</span>
          </div>
        </div>
      </div>

      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:20px 22px;">
        <form id="edit-form">

          ${sec('新人登録')}
          ${canRegister ? `
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151;cursor:pointer;">
              <input type="checkbox" id="is_newcomer" name="is_newcomer" ${emp.is_newcomer ? 'checked' : ''} onchange="onNewcomerToggle()">
              総合新人管理の対象にする（新人登録）
            </label>
          </div>
          <div id="newcomer-fields" style="display:${emp.is_newcomer ? 'grid' : 'none'};grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              ${lbl('種別')}
              ${sel('newcomer_type', [['normal','通常新人'],['shinsotsu','新卒']], emp.newcomer_type ?? 'normal')}
            </div>
            <div>
              ${lbl('新卒年度')}
              ${(() => {
                const curYear = new Date(Date.now() + 9 * 60 * 60 * 1000).getFullYear();
                const yearOpts = [curYear, curYear - 1, curYear - 2, curYear - 3];
                if (emp.graduate_year && !yearOpts.includes(emp.graduate_year)) yearOpts.push(emp.graduate_year);
                return sel('graduate_year', yearOpts.map(y => [String(y), `${y}年`]), emp.graduate_year ?? curYear);
              })()}
            </div>
          </div>
          ` : `
          <div style="font-size:13px;color:#6b7280;">
            ${emp.is_newcomer
              ? `新人登録済み（${emp.newcomer_type === 'shinsotsu' ? `新卒${emp.graduate_year ? ' ' + emp.graduate_year + '年' : ''}` : '通常新人'}）`
              : '新人未登録'}
            <span style="color:#9ca3af;">— 登録/解除には権限が必要です</span>
          </div>
          `}
          ${(emp.first_duty_date && canViewCrewCard) ? `
          <div style="margin-top:10px;">
            <a href="${ADMIN_PATH}/crew-portal/employee/${emp.id}" style="font-size:12px;padding:5px 12px;background:#eff6ff;color:#1d4ed8;border-radius:6px;text-decoration:none;">売上・安全運転記録を見る</a>
          </div>
          ` : ''}

          ${sec('基本情報')}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              ${lbl('氏名', true)}
              ${inp('name', emp.name, 'text', '例: 松井　亮斗')}
            </div>
            <div>
              ${lbl('氏名（カナ）')}
              ${inp('name_kana', emp.name_kana, 'text', '例: マツイ　リョウト')}
            </div>
            <div>
              ${lbl('NO（順番）')}
              ${inp('seq_no', emp.seq_no, 'number', '例: 7')}
            </div>
            <div>
              ${lbl('入社区分')}
              ${sel('entry_type', [['新卒','新卒'],['キャリア','キャリア'],['縁故','縁故']], emp.entry_type)}
            </div>
          </div>

          ${sec('所属・配属')}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              ${lbl('課')}
              ${sel('division', [['','選択...'],['1','1課'],['2','2課'],['3','3課'],['4','4課']], emp.division)}
            </div>
            <div>
              ${lbl('班')}
              ${sel('team', [['','選択...'],['1','1班'],['2','2班'],['3','3班'],['4','4班'],['5','5班'],['6','6班'],['7','7班'],['8','8班']], emp.team ?? '')}
            </div>
            <div style="grid-column:1/-1;">
              ${lbl('配属日')}
              ${dateRow('hire_date', emp.hire_date)}
            </div>
            <div style="grid-column:1/-1;">
              ${lbl('初乗務日')}
              ${dateRow('first_duty_date', emp.first_duty_date)}
            </div>
          </div>

          ${sec('個人情報')}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              ${lbl('生年月日')}
              <div style="display:flex;gap:6px;align-items:center;">
                <input type="date" name="birth_date" id="birth_date" value="${escHtml(emp.birth_date ?? '')}"
                  style="${DS}flex:1;" oninput="updateAge()" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#e5e7eb'">
                <button type="button" onclick="clearField('birth_date')" style="padding:10px 10px;background:#f9fafb;color:#9ca3af;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;cursor:pointer;flex-shrink:0;">✕</button>
              </div>
            </div>
            <div>
              ${lbl('年齢')}
              <div id="age-display" style="padding:11px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#374151;min-height:46px;display:flex;align-items:center;">
                ${emp.birth_date ? (() => {
                  const today = new Date();
                  const birth = new Date(emp.birth_date);
                  let age = today.getFullYear() - birth.getFullYear();
                  const m = today.getMonth() - birth.getMonth();
                  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
                  return age >= 0 ? `<span style="font-size:22px;font-weight:700;color:#1d4ed8;">${age}</span><span style="margin-left:4px;color:#6b7280;">歳</span>` : '—';
                })() : '<span style="color:#d1d5db;">未設定</span>'}
              </div>
            </div>
            <div>
              ${lbl('年齢')}
              <div id="age-display" style="padding:9px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#374151;min-height:38px;display:flex;align-items:center;">
                ${emp.birth_date ? (() => {
                  const today = new Date();
                  const birth = new Date(emp.birth_date);
                  let age = today.getFullYear() - birth.getFullYear();
                  const m = today.getMonth() - birth.getMonth();
                  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
                  return age >= 0 ? `<span style="font-size:20px;font-weight:700;color:#1d4ed8;">${age}</span><span style="margin-left:4px;color:#6b7280;">歳</span>` : '—';
                })() : '<span style="color:#d1d5db;">未設定</span>'}
              </div>
            </div>
            <div>
              ${lbl('電話番号')}
              ${inp('phone', emp.phone, 'tel', '例: 090-1234-5678')}
            </div>
            <div>
              ${lbl('ロッカー番号')}
              ${inp('locker_no', emp.locker_no, 'text', '例: 306')}
            </div>
          </div>

          ${sec('新卒Info（趣味・お酒・運転技術・メンタル面）')}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              ${lbl('趣味')}
              ${inp('hobbies', emp.hobbies, 'text', '例: 釣り、ゲーム')}
            </div>
            <div>
              ${lbl('好きな食べ物')}
              ${inp('favorite_food', emp.favorite_food, 'text', '例: ラーメン、寿司')}
            </div>
            <div>
              ${lbl('お酒')}
              ${sel('alcohol', [['','選択...'],['飲む','飲む'],['飲まない','飲まない'],['機会があれば','機会があれば']], emp.alcohol)}
              <input type="text" name="alcohol_note" value="${escHtml(emp.alcohol_note ?? '')}" placeholder="コメント"
                style="${S}margin-top:6px;">
            </div>
            <div>
              ${lbl('運転技術')}
              ${sel('driving_skill', [['','選択...'],['A','A'],['B','B'],['C','C'],['D','D'],['E','E']], emp.driving_skill)}
              <div style="font-size:11px;color:#9ca3af;margin-top:4px;">A=優秀 B=良好 C=普通 D=要注意 E=要指導</div>
            </div>
            <div style="grid-column:1/-1;">
              ${lbl('運転技術レポート')}
              ${ta('driving_note', emp.driving_note, '詳細なメモ...')}
            </div>
            <div>
              ${lbl('メンタル面')}
              ${sel('mental_status', [['','選択...'],['安定','安定'],['注意','注意'],['要フォロー','要フォロー'],['危険','危険']], emp.mental_status)}
            </div>
            <div style="grid-column:1/-1;">
              ${ta('mental_note', emp.mental_note, 'メンタル面の詳細メモ...')}
            </div>
            <div style="grid-column:1/-1;">
              ${lbl('その他')}
              ${ta('other_notes', emp.other_notes, 'その他の情報...')}
            </div>
          </div>

          <div id="form-error" style="color:#dc2626;font-size:13px;margin-top:12px;display:none;"></div>

          <div style="display:flex;gap:10px;margin-top:22px;padding-top:18px;border-top:1px solid #f3f4f6;">
            <button type="submit" id="save-btn"
              style="background:#2563eb;color:white;padding:10px 28px;border-radius:8px;font-size:13px;font-weight:600;border:none;cursor:pointer;transition:background 0.15s;"
              onmouseover="this.style.background='#1d4ed8'" onmouseout="this.style.background='#2563eb'">
              保存する
            </button>
            <a href="${ADMIN_PATH}/employees"
              style="padding:10px 20px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;color:#6b7280;text-decoration:none;display:inline-flex;align-items:center;"
              onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''">
              キャンセル
            </a>
          </div>
        </form>
      </div>
    </div>
    <script>
      function setToday(name) {
        const d = new Date();
        document.querySelector('[name="'+name+'"]').value =
          d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
        if (name === 'birth_date') updateAge();
      }
      function clearField(name) {
        document.querySelector('[name="'+name+'"]').value = '';
        if (name === 'birth_date') updateAge();
      }
      function onNewcomerToggle() {
        const checked = document.getElementById('is_newcomer').checked;
        document.getElementById('newcomer-fields').style.display = checked ? 'grid' : 'none';
      }
      function updateAge() {
        const val = document.getElementById('birth_date').value;
        const el = document.getElementById('age-display');
        if (!val) { el.innerHTML = '<span style="color:#d1d5db;">未設定</span>'; return; }
        const today = new Date(), birth = new Date(val);
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        el.innerHTML = age >= 0
          ? '<span style="font-size:22px;font-weight:700;color:#1d4ed8;">'+age+'</span><span style="margin-left:4px;color:#6b7280;">歳</span>'
          : '<span style="color:#d1d5db;">未設定</span>';
      }
    </script>
    <script>
    const CAN_REGISTER = ${canRegister ? 'true' : 'false'};
    const INFO_KEYS = ['hobbies','favorite_food','alcohol','alcohol_note','driving_skill','driving_note','mental_status','mental_note','other_notes'];
    document.getElementById('edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('save-btn');
      btn.disabled = true;
      btn.textContent = '保存中...';
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());

      const infoData = {};
      for (const k of INFO_KEYS) { infoData[k] = data[k] ?? ''; delete data[k]; }

      let newcomerData = null;
      if (CAN_REGISTER) {
        newcomerData = {
          is_newcomer: document.getElementById('is_newcomer').checked ? 1 : 0,
          newcomer_type: data.newcomer_type || 'normal',
          graduate_year: data.graduate_year ? parseInt(data.graduate_year) : null,
        };
      }
      delete data.is_newcomer; delete data.newcomer_type; delete data.graduate_year;

      data.division    = data.division    ? parseInt(data.division)    : null;
      data.team        = data.team        ? parseInt(data.team)        : null;
      data.seq_no      = data.seq_no      ? parseInt(data.seq_no)      : null;
      data.hire_date   = data.hire_date   || null;
      data.first_duty_date = data.first_duty_date || null;
      data.birth_date  = data.birth_date  || null;

      try {
        const reqs = [
          fetch('/api/employees/${id}', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
          }),
          fetch('/api/info/${id}', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(infoData)
          }),
        ];
        if (newcomerData) {
          reqs.push(fetch('/api/employees/${id}/newcomer', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newcomerData)
          }));
        }
        const results = await Promise.all(reqs);
        if (results.every(r => r.ok)) {
          window.location.href = '${ADMIN_PATH}/employees';
        } else {
          throw new Error('保存に失敗しました。');
        }
      } catch (err) {
        const errEl = document.getElementById('form-error');
        errEl.textContent = '保存に失敗しました。';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '保存する';
      }
    });
    </script>
  `;
  return c.html(layout(`${emp.name} — 編集`, content, 'employees'));
});

// ===== 新人登録フォーム =====
app.get('/employees/add', async (c) => {
  const content = `
    <div class="bg-white rounded-xl shadow p-6 max-w-2xl">
      <h3 class="font-semibold text-gray-700 mb-4">新人を登録する</h3>
      <form id="emp-form" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">社員番号 <span class="text-red-500">*</span></label>
            <input type="text" name="emp_no" required placeholder="例: 20241001"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">NO（順番）</label>
            <input type="number" name="seq_no" placeholder="例: 7"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">氏名 <span class="text-red-500">*</span></label>
            <input type="text" name="name" required placeholder="例: 山田　太郎"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">氏名（カナ）</label>
            <input type="text" name="name_kana" placeholder="例: ヤマダ　タロウ"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">課 <span class="text-red-500">*</span></label>
            <select name="division" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">選択...</option>
              <option value="1">1課</option>
              <option value="2">2課</option>
              <option value="3">3課</option>
              <option value="4">4課</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">班</label>
            <select name="team" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">選択...</option>
              <option value="1">1班</option><option value="2">2班</option><option value="3">3班</option><option value="4">4班</option>
              <option value="5">5班</option><option value="6">6班</option><option value="7">7班</option><option value="8">8班</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">電話番号</label>
            <input type="tel" name="phone" placeholder="例: 090-1234-5678"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">ロッカー番号</label>
            <input type="text" name="locker_no" placeholder="例: 306"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">入社区分</label>
            <select name="entry_type" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="新卒">新卒</option>
              <option value="キャリア">キャリア</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">配属日</label>
            <input type="date" name="hire_date" style="border:1px solid #d1d5db;border-radius:8px;padding:11px 14px;font-size:15px;width:100%;outline:none;background:white;color:#374151;" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#d1d5db'">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">生年月日</label>
            <div style="display:flex;gap:6px;align-items:center;">
              <input type="date" name="birth_date" id="add_birth_date" style="border:1px solid #d1d5db;border-radius:8px;padding:11px 14px;font-size:15px;width:100%;outline:none;background:white;color:#374151;" oninput="updateAddAge()" onfocus="this.style.borderColor='#3b82f6'" onblur="this.style.borderColor='#d1d5db'">
              <span id="add_age_display" style="white-space:nowrap;font-size:13px;font-weight:600;color:#1d4ed8;min-width:36px;"></span>
            </div>
          </div>
        </div>
        <div id="form-error" class="text-red-600 text-sm hidden"></div>
        <div class="flex gap-3 pt-2">
          <button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">登録する</button>
          <a href="${ADMIN_PATH}/shift" class="px-6 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">シフト管理へ戻る</a>
        </div>
      </form>
    </div>
    <script>
    function updateAddAge() {
      const val = document.getElementById('add_birth_date').value;
      const el = document.getElementById('add_age_display');
      if (!val) { el.textContent = ''; return; }
      const today = new Date(), birth = new Date(val);
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      el.textContent = age >= 0 ? age+'歳' : '';
    }
    document.getElementById('emp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      data.division = data.division ? parseInt(data.division) : null;
      data.team = data.team ? parseInt(data.team) : null;
      data.seq_no = data.seq_no ? parseInt(data.seq_no) : null;
      if (!data.hire_date) data.hire_date = null;
      if (!data.birth_date) data.birth_date = null;

      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      let json = {};
      try { json = await res.json(); } catch(_) {}
      if (res.ok) {
        alert('登録しました！');
        window.location.href = '${ADMIN_PATH}/employees';
      } else {
        document.getElementById('form-error').textContent = json.error ?? '登録に失敗しました（' + res.status + '）';
        document.getElementById('form-error').classList.remove('hidden');
      }
    });
    </script>
  `;

  return c.html(layout('新人登録', content, 'employees'));
});

// ===== システムステータス =====

// メンテナンスモード状態（ステータスページ表示用）
app.get('/settings/status/maintenance', async (c) => {
  const [enabled, schedule] = await Promise.all([
    getMaintenanceMode(c.env.DB),
    getMaintenanceSchedule(c.env.DB),
  ]);
  return c.json({ enabled, schedule, active: enabled || isWithinSchedule(schedule) });
});

// メンテナンスモード切替（手動トグル、adminアカウントのみ）
app.post('/settings/status/maintenance', async (c) => {
  const adminId = c.get('adminId');
  if (!adminId || !(await isAdminAccount(c.env.DB, adminId))) {
    return c.json({ error: 'メンテナンスモードの切替はadminアカウントのみ実行できます' }, 403);
  }
  let enabled: boolean;
  try {
    const body = await c.req.json<{ enabled?: unknown }>();
    if (typeof body.enabled !== 'boolean') throw new Error('invalid');
    enabled = body.enabled;
  } catch {
    return c.json({ error: 'enabled は true / false で指定してください' }, 400);
  }
  await setMaintenanceMode(c.env.DB, enabled);
  const schedule = await getMaintenanceSchedule(c.env.DB);
  return c.json({ ok: true, enabled, active: enabled || isWithinSchedule(schedule) });
});

// メンテナンス期間（予約メンテナンス）の設定（adminアカウントのみ）
app.post('/settings/status/maintenance/schedule', async (c) => {
  const adminId = c.get('adminId');
  if (!adminId || !(await isAdminAccount(c.env.DB, adminId))) {
    return c.json({ error: 'メンテナンス期間の設定はadminアカウントのみ実行できます' }, 403);
  }
  let start: string | null;
  let end: string | null;
  try {
    const body = await c.req.json<{ start?: unknown; end?: unknown }>();
    const normalize = (v: unknown): string | null => {
      if (v === null || v === undefined || v === '') return null;
      if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new Error('invalid');
      return v;
    };
    start = normalize(body.start);
    end = normalize(body.end);
  } catch {
    return c.json({ error: '日時の形式が不正です' }, 400);
  }
  if (start && end && end < start) {
    return c.json({ error: '終了日時は開始日時より後にしてください' }, 400);
  }
  await setMaintenanceSchedule(c.env.DB, start, end);
  const enabled = await getMaintenanceMode(c.env.DB);
  const scheduleActive = isWithinSchedule({ start, end });
  return c.json({ ok: true, schedule: { start, end }, scheduleActive, active: enabled || scheduleActive });
});

app.get('/settings/status', async (c) => {
  const adminLoginUrl = `https://bentenclub.com${ADMIN_PATH}/login`;

  // QRコードはサーバー側でSVG生成（外部CDN依存なし）
  const qr = qrcode(0, 'M');
  qr.addData(adminLoginUrl);
  qr.make();
  const qrSvg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true })
    .replace(/black/g, '#39ff88').replace(/white/g, '#04070a');

  let dbOk = false;
  let dbMsg = '';
  let empCount = 0;
  try {
    const res = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM employees').first<{ cnt: number }>();
    empCount = res?.cnt ?? 0;
    dbOk = true;
  } catch (e: any) {
    dbMsg = String(e?.message ?? e);
  }

  const adminId = c.get('adminId');
  const isAdmin = adminId ? await isAdminAccount(c.env.DB, adminId) : false;
  const manualMaintenanceOn = await getMaintenanceMode(c.env.DB);
  const maintenanceSchedule = await getMaintenanceSchedule(c.env.DB);
  const scheduleActive = isWithinSchedule(maintenanceSchedule);
  const maintenanceOn = manualMaintenanceOn || scheduleActive;

  // ===== 実データ収集（利用状況・DB統計・直近アクティビティ） =====
  const [usageStats, featureTop, dailyUsage, dbCounts, recentActivity, loginStats] = await Promise.all([
    // LINE操作の利用量（需要の把握）
    c.env.DB.prepare(`
      SELECT
        SUM(CASE WHEN date(created_at) = date('now','localtime') THEN 1 ELSE 0 END) AS today_cnt,
        SUM(CASE WHEN created_at >= datetime('now','localtime','-7 days')  THEN 1 ELSE 0 END) AS week_cnt,
        SUM(CASE WHEN created_at >= datetime('now','localtime','-30 days') THEN 1 ELSE 0 END) AS month_cnt,
        COUNT(DISTINCT CASE WHEN created_at >= datetime('now','localtime','-30 days') THEN line_uid END) AS month_users,
        SUM(CASE WHEN channel = 'bot'  AND created_at >= datetime('now','localtime','-30 days') THEN 1 ELSE 0 END) AS bot_cnt,
        SUM(CASE WHEN channel = 'liff' AND created_at >= datetime('now','localtime','-30 days') THEN 1 ELSE 0 END) AS liff_cnt
      FROM line_activity_logs
    `).first<{ today_cnt: number; week_cnt: number; month_cnt: number; month_users: number; bot_cnt: number; liff_cnt: number }>().catch(() => null),
    // 機能別利用トップ（直近30日）
    c.env.DB.prepare(`
      SELECT feature, COUNT(*) AS cnt FROM line_activity_logs
      WHERE created_at >= datetime('now','localtime','-30 days') AND feature IS NOT NULL
      GROUP BY feature ORDER BY cnt DESC LIMIT 8
    `).all<{ feature: string; cnt: number }>().catch(() => null),
    // 日別利用量（直近14日）
    c.env.DB.prepare(`
      SELECT date(created_at) AS d, COUNT(*) AS cnt FROM line_activity_logs
      WHERE created_at >= datetime('now','localtime','-14 days')
      GROUP BY d ORDER BY d
    `).all<{ d: string; cnt: number }>().catch(() => null),
    // 主要テーブルのレコード数（テーブル欠損時はそのテーブルのみ「—」表示）
    (async () => {
      const defs: Array<[string, string]> = [
        ['employees',      'SELECT COUNT(*) AS cnt FROM employees'],
        ['shift_entries',  'SELECT COUNT(*) AS cnt FROM shift_entries'],
        ['sales_records',  'SELECT COUNT(*) AS cnt FROM sales_records'],
        ['odo_records',    'SELECT COUNT(*) AS cnt FROM odo_records'],
        ['vehicles',       'SELECT COUNT(*) AS cnt FROM vehicles'],
        ['liff_users',     'SELECT COUNT(*) AS cnt FROM line_liff_users'],
        ['line_logs',      'SELECT COUNT(*) AS cnt FROM line_activity_logs'],
        ['reports',        `SELECT (SELECT COUNT(*) FROM lost_item_reports)
                              + (SELECT COUNT(*) FROM accident_reports)
                              + (SELECT COUNT(*) FROM violation_reports)
                              + (SELECT COUNT(*) FROM general_reports) AS cnt`],
        ['documents',      'SELECT COUNT(*) AS cnt FROM resources'],
        ['sessions',       'SELECT COUNT(*) AS cnt FROM sessions'],
        ['login_logs',     'SELECT COUNT(*) AS cnt FROM login_logs'],
      ];
      const counts = await Promise.all(defs.map(([, sql]) =>
        c.env.DB.prepare(sql).first<{ cnt: number }>().then(r => r?.cnt ?? 0).catch(() => null)
      ));
      const out: Record<string, number | null> = {};
      defs.forEach(([key], i) => { out[key] = counts[i]; });
      return out;
    })(),
    // 直近アクティビティ（実ログ）
    c.env.DB.prepare(`
      SELECT created_at, channel, event_type, feature, detail
      FROM line_activity_logs ORDER BY created_at DESC LIMIT 12
    `).all<{ created_at: string; channel: string; event_type: string; feature: string | null; detail: string | null }>().catch(() => null),
    // 管理画面ログイン（直近30日）
    c.env.DB.prepare(`
      SELECT COUNT(*) AS month_cnt, MAX(logged_at) AS last_at FROM login_logs
      WHERE logged_at >= datetime('now','localtime','-30 days')
    `).first<{ month_cnt: number; last_at: string | null }>().catch(() => null),
  ]);

  // エッジ接続情報（このリクエスト自体の実測値）
  const cfInfo = ((c.req.raw as any).cf ?? {}) as Record<string, unknown>;
  const cfStr = (k: string) => { const v = cfInfo[k]; return v == null ? '—' : String(v); };

  // ===== 表示用パーツ生成 =====
  // 日別利用（直近14日、0件の日も表示）→ Chart.js用データ配列
  const dayList: string[] = [];
  for (let i = 13; i >= 0; i--) {
    dayList.push(new Date(Date.now() + 9 * 3600 * 1000 - i * 86400000).toISOString().slice(0, 10));
  }
  const dailyMap = new Map((dailyUsage?.results ?? []).map(r => [r.d, r.cnt]));
  const dailyLabels = dayList.map(d => `${parseInt(d.slice(5, 7))}/${parseInt(d.slice(8, 10))}`);
  const dailyValues = dayList.map(d => dailyMap.get(d) ?? 0);

  // 機能別利用トップ（直近30日）→ Chart.js用データ配列
  const featList = featureTop?.results ?? [];
  const featLabels = featList.map(f => f.feature);
  const featValues = featList.map(f => f.cnt);

  // DB統計
  const dbStatDefs: Array<[string, string]> = [
    ['employees',      '社員マスタ'],
    ['shift_entries',  'シフトエントリ'],
    ['sales_records',  '売上記録'],
    ['odo_records',    'ODO記録'],
    ['vehicles',       '車両マスタ'],
    ['liff_users',     'LIFF利用者'],
    ['line_logs',      'LINE操作ログ'],
    ['reports',        '各種報告（累計）'],
    ['documents',      '資料センター登録数'],
    ['sessions',       '有効セッション'],
    ['login_logs',     'ログイン記録'],
  ];
  const dbStatsHtml = dbStatDefs.map(([key, label]) => `
      <div style="background:#0d1815;border:1px solid rgba(57,255,136,.10);border-radius:5px;padding:9px 12px;">
        <div style="font-size:10px;color:#6f9c85;">${label}</div>
        <div class="mono" style="font-size:16px;font-weight:700;color:#39ff88;margin-top:2px;text-shadow:0 0 8px rgba(57,255,136,.35);">${dbCounts[key] != null ? (dbCounts[key] as number).toLocaleString('ja-JP') : '—'}</div>
      </div>`).join('');

  // 直近アクティビティ（実ログ）
  const actRowsHtml = (recentActivity?.results ?? []).length === 0
    ? '<div style="font-size:12px;color:#456b58;padding:10px 14px;">記録なし</div>'
    : (recentActivity?.results ?? []).map(a => `
      <div style="display:flex;gap:10px;align-items:baseline;padding:4px 14px;border-bottom:1px solid rgba(57,255,136,.08);">
        <span class="mono" style="font-size:11px;color:#456b58;flex:none;">${escHtml((a.created_at ?? '').slice(5, 16))}</span>
        <span class="mono" style="font-size:10px;font-weight:700;color:${a.channel === 'liff' ? '#ff6fe0' : '#58e6ff'};flex:none;width:32px;">${escHtml((a.channel ?? '').toUpperCase())}</span>
        <span style="font-size:12px;color:#d7ffe9;font-weight:600;flex:none;">${escHtml(a.feature ?? a.event_type ?? '')}</span>
        <span class="mono" style="font-size:11px;color:#6f9c85;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml((a.detail ?? '').slice(0, 60))}</span>
      </div>`).join('');

  // メンテナンス制御カード（adminアカウントのみ表示）
  const sysInputStyle = 'background:var(--sys-bg3);border:1px solid var(--sys-line);border-radius:4px;color:var(--sys-text);padding:6px 10px;font-size:12px;font-family:\'SF Mono\',SFMono-Regular,Menlo,Consolas,\'Courier New\',monospace;';
  const sysBtnStyle = 'background:rgba(57,255,136,.1);border:1px solid rgba(57,255,136,.4);border-radius:4px;color:var(--sys-green);padding:6px 16px;font-size:11px;font-weight:700;letter-spacing:.05em;cursor:pointer;font-family:\'SF Mono\',SFMono-Regular,Menlo,Consolas,\'Courier New\',monospace;';
  const sysBtnGhostStyle = 'background:transparent;border:1px solid var(--sys-line);border-radius:4px;color:var(--sys-text-dim);padding:6px 16px;font-size:11px;font-weight:700;letter-spacing:.05em;cursor:pointer;font-family:\'SF Mono\',SFMono-Regular,Menlo,Consolas,\'Courier New\',monospace;';
  const maintenanceCard = isAdmin ? `
      <div class="sys-panel gc-12">
        <div class="sys-ph"><span class="sys-pt mono"><span class="sys-dots"><span></span><span></span><span></span></span>MAINTENANCE CONTROL</span><span class="sys-ps mono">ADMIN ONLY</span></div>
        <div class="sys-pb">
          <div class="sys-row" style="flex-wrap:wrap;">
            <div style="flex:1;min-width:240px;">
              <div style="font-size:14px;font-weight:700;color:var(--sys-text);">メンテナンスモード（手動切替）</div>
              <div style="font-size:12px;color:var(--sys-text-dim);margin-top:4px;line-height:1.7;">
                ONにすると admin 以外の全アクセス（管理画面・LIFF・フォーム・API）にメンテナンス画面を表示します。<br>
                LINE Botはメンテナンス中メッセージを返信し、定時通知はそのまま送信されます。
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:12px;">
              <span id="maint-state" class="mono" style="font-size:11px;font-weight:700;letter-spacing:.1em;color:${manualMaintenanceOn ? 'var(--sys-amber)' : 'var(--sys-green)'};">${manualMaintenanceOn ? 'MAINT ON' : 'NORMAL'}</span>
              <label class="sw"><input type="checkbox" id="maint-toggle" ${manualMaintenanceOn ? 'checked' : ''} onchange="toggleMaintenance(this)"><span class="tr"></span></label>
            </div>
          </div>
          <div id="maint-msg" style="font-size:11px;color:var(--sys-text-dim2);margin-top:8px;"></div>

          <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--sys-line-soft);">
            <div style="font-size:14px;font-weight:700;color:var(--sys-text);margin-bottom:4px;">期間指定（予約メンテナンス）</div>
            <div style="font-size:12px;color:var(--sys-text-dim);margin-bottom:10px;line-height:1.7;">
              開始〜終了の期間中は、上の手動切替がOFFでも自動的にメンテナンス扱いになります。終了日時を空欄にすると開始以降は無期限で継続します。
            </div>
            <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
              <div>
                <label style="display:block;font-size:10px;color:var(--sys-text-dim2);margin-bottom:4px;letter-spacing:.08em;" class="mono">開始日時</label>
                <input type="datetime-local" id="maint-sch-start" value="${escHtml(maintenanceSchedule.start ?? '')}" style="${sysInputStyle}">
              </div>
              <div>
                <label style="display:block;font-size:10px;color:var(--sys-text-dim2);margin-bottom:4px;letter-spacing:.08em;" class="mono">終了日時（任意）</label>
                <input type="datetime-local" id="maint-sch-end" value="${escHtml(maintenanceSchedule.end ?? '')}" style="${sysInputStyle}">
              </div>
              <button type="button" style="${sysBtnStyle}" onclick="saveMaintenanceSchedule()">保存</button>
              <button type="button" style="${sysBtnGhostStyle}" onclick="clearMaintenanceSchedule()">クリア</button>
              <span id="maint-sch-active" class="mono" style="font-size:11px;font-weight:700;letter-spacing:.08em;color:${scheduleActive ? 'var(--sys-amber)' : 'var(--sys-text-dim2)'};">${scheduleActive ? '● 期間内（適用中）' : '期間外'}</span>
            </div>
            <div id="maint-sch-msg" style="font-size:11px;color:var(--sys-text-dim2);margin-top:8px;"></div>
          </div>
        </div>
      </div>` : '';

  const html = settingsSubHeader('システムステータス') + `
    <style>
      .sysc{
        max-width:1320px;position:relative;background:#04070a;padding:18px;border-radius:12px;
        box-shadow:0 0 0 1px rgba(57,255,136,.12),0 24px 60px rgba(0,0,0,.55);
        font-family:'Hiragino Sans','Meiryo',-apple-system,sans-serif;
        --sys-green:#39ff88;--sys-green-dim:#1f8a52;--sys-cyan:#58e6ff;--sys-magenta:#ff6fe0;--sys-amber:#ffb930;--sys-red:#ff3b60;
        --sys-text:#d7ffe9;--sys-text-dim:#6f9c85;--sys-text-dim2:#456b58;--sys-bg2:#0a120f;--sys-bg3:#0d1815;
        --sys-line:rgba(57,255,136,.22);--sys-line-soft:rgba(57,255,136,.10);
      }
      .sysc:before{
        content:'';position:absolute;inset:0;pointer-events:none;border-radius:12px;z-index:2;opacity:.5;
        background:repeating-linear-gradient(to bottom,rgba(255,255,255,.025) 0px,rgba(255,255,255,.025) 1px,transparent 1px,transparent 3px);
      }
      .sysc:after{
        content:'';position:absolute;left:0;right:0;height:160px;pointer-events:none;z-index:2;opacity:.05;
        background:linear-gradient(to bottom,transparent,var(--sys-green) 45%,transparent);
        animation:sysScan 9s linear infinite;mix-blend-mode:screen;
      }
      @keyframes sysScan{0%{top:-160px}100%{top:100%}}
      .sysc .mono{font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,'Courier New',monospace;}
      .sysc, .sysc *{box-sizing:border-box;}
      .sys-grid{position:relative;z-index:1;display:grid;grid-template-columns:repeat(12,1fr);gap:14px;align-items:stretch;}
      .gc-4{grid-column:span 4;} .gc-5{grid-column:span 5;} .gc-6{grid-column:span 6;}
      .gc-7{grid-column:span 7;} .gc-8{grid-column:span 8;} .gc-12{grid-column:span 12;}
      @media (max-width:920px){ .gc-4,.gc-5,.gc-6,.gc-7,.gc-8{grid-column:span 12;} }
      .sys-panel{position:relative;background:var(--sys-bg2);border:1px solid var(--sys-line);border-radius:6px;box-shadow:0 0 0 1px rgba(0,0,0,.5) inset,0 6px 22px rgba(0,0,0,.45);overflow:hidden;display:flex;flex-direction:column;}
      .sys-panel:before{content:'';position:absolute;top:0;left:0;width:12px;height:12px;border-top:2px solid rgba(57,255,136,.4);border-left:2px solid rgba(57,255,136,.4);pointer-events:none;z-index:2;}
      .sys-panel:after{content:'';position:absolute;bottom:0;right:0;width:12px;height:12px;border-bottom:2px solid rgba(57,255,136,.4);border-right:2px solid rgba(57,255,136,.4);pointer-events:none;z-index:2;}
      .sys-ph{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 14px;border-bottom:1px solid var(--sys-line);background:linear-gradient(180deg,rgba(57,255,136,.07),rgba(57,255,136,.015));flex:none;}
      .sys-dots{display:inline-flex;gap:5px;margin-right:10px;}
      .sys-dots span{width:7px;height:7px;border-radius:50%;display:inline-block;opacity:.55;}
      .sys-dots span:nth-child(1){background:var(--sys-red);}
      .sys-dots span:nth-child(2){background:var(--sys-amber);}
      .sys-dots span:nth-child(3){background:var(--sys-green);}
      .sys-pt{font-size:11px;letter-spacing:.16em;font-weight:700;color:var(--sys-green);text-shadow:0 0 8px rgba(57,255,136,.45);display:flex;align-items:center;}
      .sys-pt:before{content:'//';color:var(--sys-text-dim2);margin-right:8px;font-weight:400;}
      .sys-ps{font-size:10px;color:var(--sys-text-dim);letter-spacing:.08em;}
      .sys-pb{padding:14px 16px;flex:1;display:flex;flex-direction:column;}
      .sys-hero{position:relative;overflow:hidden;background:#030507;}
      .matrix-rain{position:absolute;inset:0;width:100%;height:100%;opacity:.4;pointer-events:none;}
      .sys-hero-inner{position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px;flex-wrap:wrap;background:linear-gradient(90deg,rgba(3,5,7,.75),rgba(3,5,7,.35) 60%,rgba(3,5,7,.75));}
      .sys-hero-ticker{position:relative;z-index:1;display:flex;gap:22px;flex-wrap:wrap;padding:10px 20px;border-top:1px solid var(--sys-line);background:rgba(3,5,7,.6);}
      .sys-hero-ticker .t-item{font-size:11px;color:var(--sys-text-dim);white-space:nowrap;}
      .sys-hero-ticker .t-item b{font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,'Courier New',monospace;color:var(--sys-cyan);font-size:13px;margin-left:6px;text-shadow:0 0 6px rgba(88,230,255,.4);}
      .led{width:9px;height:9px;border-radius:50%;display:inline-block;flex:none;}
      .led-g{background:var(--sys-green);box-shadow:0 0 8px 2px rgba(57,255,136,.75);animation:sysPulse 2.2s infinite;}
      .led-a{background:var(--sys-amber);box-shadow:0 0 8px 2px rgba(255,185,48,.75);animation:sysPulse 1.1s infinite;}
      @keyframes sysPulse{0%,100%{opacity:1}50%{opacity:.35}}
      .sys-row{display:flex;align-items:center;justify-content:space-between;gap:10px;}
      .sys-badge{font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,'Courier New',monospace;font-size:10px;font-weight:700;letter-spacing:.05em;padding:3px 10px;border-radius:3px;border:1px solid;}
      .b-ok{background:rgba(57,255,136,.08);color:var(--sys-green);border-color:rgba(57,255,136,.4);text-shadow:0 0 6px rgba(57,255,136,.5);}
      .b-ng{background:rgba(255,59,96,.1);color:var(--sys-red);border-color:rgba(255,59,96,.45);text-shadow:0 0 6px rgba(255,59,96,.5);animation:sysPulse 1.4s infinite;}
      .kpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px;margin-bottom:14px;}
      .kpi-cell{background:var(--sys-bg3);border:1px solid var(--sys-line-soft);border-radius:5px;padding:9px 12px;}
      .kpi-cell .kl{font-size:10px;color:var(--sys-text-dim);letter-spacing:.02em;}
      .kpi-cell .kv{font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,'Courier New',monospace;font-size:17px;font-weight:800;color:var(--sys-green);margin-top:3px;text-shadow:0 0 10px rgba(57,255,136,.4);}
      .kpi-cell .kv .ku{font-size:11px;font-weight:600;color:var(--sys-text-dim2);margin-left:2px;text-shadow:none;}
      .db-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;}
      .chart-box{position:relative;flex:1;min-height:160px;}
      .chart-box.tall{min-height:210px;}
      .donut-box{position:relative;height:150px;}
      .donut-legend{display:flex;justify-content:center;gap:18px;margin-top:8px;font-size:11px;color:var(--sys-text-dim);}
      .donut-legend b{font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,'Courier New',monospace;}
      .donut-legend .dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:5px;}
      .gauge-box{position:relative;height:120px;}
      .gauge-pct{position:absolute;left:0;right:0;bottom:6px;text-align:center;font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,'Courier New',monospace;font-size:22px;font-weight:800;color:var(--sys-green);text-shadow:0 0 10px rgba(57,255,136,.5);}
      .gauge-label{text-align:center;font-size:10px;color:var(--sys-text-dim2);letter-spacing:.08em;margin-top:2px;}
      .sw{position:relative;display:inline-block;width:54px;height:28px;flex:none;}
      .sw input{opacity:0;width:0;height:0;}
      .sw .tr{position:absolute;inset:0;background:#122019;border:1px solid var(--sys-line);border-radius:30px;transition:.25s;cursor:pointer;}
      .sw .tr:before{content:'';position:absolute;width:20px;height:20px;left:3px;top:3px;background:var(--sys-green);border-radius:50%;transition:.25s;box-shadow:0 0 6px rgba(57,255,136,.6);}
      .sw input:checked + .tr{background:rgba(255,185,48,.12);border-color:rgba(255,185,48,.5);}
      .sw input:checked + .tr:before{transform:translateX(26px);background:var(--sys-amber);box-shadow:0 0 8px rgba(255,185,48,.7);}
    </style>
    <div class="sysc">
      <div class="sys-grid">
      <!-- コンソールヘッダー（マトリックスレイン演出+クイック指標ティッカー） -->
      <div class="sys-panel gc-12 sys-hero">
        <canvas class="matrix-rain" id="matrix-rain"></canvas>
        <div class="sys-hero-inner">
          <div>
            <div class="mono" style="font-size:10px;letter-spacing:.28em;color:var(--sys-text-dim);">BENTEN CORE // SYSTEM MONITOR</div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
              <span class="led ${maintenanceOn ? 'led-a' : 'led-g'}" id="head-led"></span>
              <span class="mono" style="font-size:16px;font-weight:800;color:${maintenanceOn ? 'var(--sys-amber)' : 'var(--sys-green)'};letter-spacing:.04em;text-shadow:0 0 12px ${maintenanceOn ? 'rgba(255,185,48,.55)' : 'rgba(57,255,136,.55)'};" id="head-state">${maintenanceOn ? '[!] MAINTENANCE MODE' : 'ALL SYSTEMS OPERATIONAL'}</span>
            </div>
          </div>
          <div class="mono" style="text-align:right;font-size:11px;color:var(--sys-text-dim2);line-height:1.9;">
            <div id="sys-clock" style="font-size:14px;font-weight:700;color:var(--sys-cyan);text-shadow:0 0 8px rgba(88,230,255,.5);">--:--:--</div>
            <div>NODE TYO-EDGE &middot; CF WORKERS &middot; D1</div>
          </div>
        </div>
        <div class="sys-hero-ticker">
          <span class="t-item">本日<b>${usageStats?.today_cnt ?? 0}</b>件</span>
          <span class="t-item">直近7日<b>${(usageStats?.week_cnt ?? 0).toLocaleString('ja-JP')}</b>件</span>
          <span class="t-item">直近30日<b>${(usageStats?.month_cnt ?? 0).toLocaleString('ja-JP')}</b>件</span>
          <span class="t-item">30日利用者<b>${usageStats?.month_users ?? 0}</b>名</span>
          <span class="t-item">管理画面ログイン(30日)<b>${loginStats?.month_cnt ?? 0}</b>回</span>
        </div>
      </div>

      <!-- メンテナンス稼働中バナー -->
      <div id="maint-banner" class="gc-12" style="display:${maintenanceOn ? 'block' : 'none'};background:rgba(255,185,48,.08);border:1px solid rgba(255,185,48,.4);color:var(--sys-amber);border-radius:8px;padding:10px 16px;font-size:12px;font-weight:600;font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,'Courier New',monospace;">
        &#9888; メンテナンスモード稼働中 &mdash; admin 以外のアクセスにはメンテナンス画面が表示されています
      </div>
      ${maintenanceCard}

      <!-- サーバー・DB（サーバーサイド確認済み） -->
      <div class="sys-panel gc-4">
        <div class="sys-ph"><span class="sys-pt mono"><span class="sys-dots"><span></span><span></span><span></span></span>CORE INFRASTRUCTURE</span></div>
        <div class="sys-pb" style="gap:9px;">
          <div class="sys-row">
            <span style="font-size:13px;color:var(--sys-text);">Cloudflare Workers</span>
            <span class="sys-badge b-ok">正常</span>
          </div>
          <div class="sys-row">
            <span style="font-size:13px;color:var(--sys-text);">D1 データベース</span>
            ${dbOk
              ? `<span class="sys-badge b-ok">正常（社員 ${empCount}件）</span>`
              : `<span class="sys-badge b-ng" title="${escHtml(dbMsg)}">エラー</span>`
            }
          </div>
          <div class="sys-row">
            <span style="font-size:13px;color:var(--sys-text);">接続エッジ</span>
            <span class="mono" style="font-size:12px;color:var(--sys-cyan);font-weight:600;">${escHtml(cfStr('colo'))} / ${escHtml(cfStr('country'))}${cfInfo['city'] ? ' ' + escHtml(cfStr('city')) : ''}</span>
          </div>
          <div class="sys-row">
            <span style="font-size:13px;color:var(--sys-text);">プロトコル</span>
            <span class="mono" style="font-size:12px;color:var(--sys-cyan);font-weight:600;">${escHtml(cfStr('httpProtocol'))} / ${escHtml(cfStr('tlsVersion'))}</span>
          </div>
          <div class="sys-row">
            <span style="font-size:13px;color:var(--sys-text);">接続回線</span>
            <span class="mono" style="font-size:12px;color:var(--sys-cyan);font-weight:600;" title="AS${escHtml(cfStr('asn'))}">${escHtml(cfStr('asOrganization'))}</span>
          </div>
        </div>
      </div>

      <!-- トラフィック内訳（BOT/LIFF比率ドーナツ） -->
      <div class="sys-panel gc-4">
        <div class="sys-ph"><span class="sys-pt mono"><span class="sys-dots"><span></span><span></span><span></span></span>TRAFFIC SPLIT</span><span class="sys-ps mono">30 DAYS</span></div>
        <div class="sys-pb" style="align-items:center;justify-content:center;">
          <div class="donut-box" style="width:100%;"><canvas id="chart-traffic"></canvas></div>
          <div class="donut-legend">
            <span><span class="dot" style="background:var(--sys-cyan);"></span>BOT <b>${usageStats?.bot_cnt ?? 0}</b></span>
            <span><span class="dot" style="background:var(--sys-magenta);"></span>LIFF <b>${usageStats?.liff_cnt ?? 0}</b></span>
          </div>
        </div>
      </div>

      <!-- API稼働率ゲージ -->
      <div class="sys-panel gc-4">
        <div class="sys-ph"><span class="sys-pt mono"><span class="sys-dots"><span></span><span></span><span></span></span>API HEALTH</span><span class="sys-ps mono">LIVE CHECK</span></div>
        <div class="sys-pb" style="align-items:center;justify-content:center;">
          <div class="gauge-box" style="width:100%;">
            <canvas id="chart-api-health"></canvas>
            <div class="gauge-pct" id="api-health-pct">--</div>
          </div>
          <div class="gauge-label">ENDPOINTS OK</div>
        </div>
      </div>

      <!-- 利用状況（需要データ + 折れ線グラフ） -->
      <div class="sys-panel gc-8">
        <div class="sys-ph"><span class="sys-pt mono"><span class="sys-dots"><span></span><span></span><span></span></span>USAGE ANALYTICS</span><span class="sys-ps mono">LINE BOT / LIFF DEMAND</span></div>
        <div class="sys-pb">
          <div class="kpi-grid">
            <div class="kpi-cell"><div class="kl">本日の操作</div><div class="kv">${usageStats?.today_cnt ?? 0}<span class="ku">件</span></div></div>
            <div class="kpi-cell"><div class="kl">直近7日</div><div class="kv">${(usageStats?.week_cnt ?? 0).toLocaleString('ja-JP')}<span class="ku">件</span></div></div>
            <div class="kpi-cell"><div class="kl">直近30日</div><div class="kv">${(usageStats?.month_cnt ?? 0).toLocaleString('ja-JP')}<span class="ku">件</span></div></div>
            <div class="kpi-cell"><div class="kl">30日利用者</div><div class="kv">${usageStats?.month_users ?? 0}<span class="ku">名</span></div></div>
          </div>
          <div class="mono" style="font-size:10px;color:var(--sys-text-dim2);margin-bottom:6px;">日別操作件数（直近14日）</div>
          <div class="chart-box"><canvas id="chart-daily"></canvas></div>
        </div>
      </div>

      <!-- 機能別利用トップ（横棒グラフ） -->
      <div class="sys-panel gc-4">
        <div class="sys-ph"><span class="sys-pt mono"><span class="sys-dots"><span></span><span></span><span></span></span>TOP FEATURES</span><span class="sys-ps mono">30 DAYS</span></div>
        <div class="sys-pb">
          ${featList.length === 0
            ? '<div style="font-size:12px;color:#456b58;">記録なし</div>'
            : '<div class="chart-box tall"><canvas id="chart-feat"></canvas></div>'
          }
        </div>
      </div>

      <!-- DB統計 -->
      <div class="sys-panel gc-12">
        <div class="sys-ph"><span class="sys-pt mono"><span class="sys-dots"><span></span><span></span><span></span></span>DATABASE STATS</span><span class="sys-ps mono">D1 RECORD COUNT</span></div>
        <div class="sys-pb">
          <div class="db-grid">${dbStatsHtml}</div>
        </div>
      </div>

      <!-- 直近アクティビティ（実ログ） -->
      <div class="sys-panel gc-6">
        <div class="sys-ph">
          <span class="sys-pt mono"><span class="sys-dots"><span></span><span></span><span></span></span>ACTIVITY TRACE</span>
          <span class="sys-ps mono" style="display:flex;align-items:center;gap:6px;"><span class="led led-g" style="width:6px;height:6px;"></span>直近のLINE操作 実ログ</span>
        </div>
        <div style="padding:6px 0;overflow-y:auto;max-height:280px;">${actRowsHtml}</div>
      </div>

      <!-- 通信ログ -->
      <div class="sys-panel gc-6">
        <div class="sys-ph"><span class="sys-pt mono"><span class="sys-dots"><span></span><span></span><span></span></span>NETWORK LOG</span><span class="sys-ps mono">RECENT ACTIVITY</span></div>
        <div class="sys-pb">
          <div id="net-log" class="mono" style="font-size:11px;color:var(--sys-green);line-height:1.8;max-height:230px;overflow-y:auto;text-shadow:0 0 4px rgba(57,255,136,.25);">確認中...</div>
        </div>
      </div>

      <!-- APIエンドポイント（クライアントサイドチェック） -->
      <div class="sys-panel gc-7">
        <div class="sys-ph">
          <span class="sys-pt mono"><span class="sys-dots"><span></span><span></span><span></span></span>API ENDPOINT DIAGNOSTICS</span>
          <span style="display:flex;align-items:center;gap:10px;">
            <span class="mono" style="font-size:10px;color:var(--sys-text-dim2);" id="checked-at">確認中...</span>
            <button onclick="runChecks()" class="mono" style="padding:5px 13px;background:rgba(57,255,136,.08);color:var(--sys-green);border:1px solid rgba(57,255,136,.4);border-radius:4px;font-size:11px;cursor:pointer;font-weight:600;">再確認</button>
          </span>
        </div>
        <div class="sys-pb" style="gap:9px;" id="api-checks">
          <div style="font-size:12px;color:var(--sys-text-dim2);">確認中...</div>
        </div>
      </div>

      <!-- アクセスQRコード -->
      <div class="sys-panel gc-5">
        <div class="sys-ph"><span class="sys-pt mono"><span class="sys-dots"><span></span><span></span><span></span></span>ACCESS QR</span><span class="sys-ps mono">ADMIN LOGIN</span></div>
        <div class="sys-pb">
          <div style="font-size:12px;color:var(--sys-text-dim);margin-bottom:14px;">このQRコードをスキャンすると管理画面のログインページが開きます</div>
          <div style="display:flex;align-items:flex-start;gap:20px;flex-wrap:wrap;">
            <style>#qr-container svg{width:100%;height:100%;display:block;}</style>
            <div style="background:#04070a;border:1px solid rgba(57,255,136,.3);border-radius:8px;padding:10px;display:inline-block;line-height:0;box-shadow:0 0 20px rgba(57,255,136,.12) inset;">
              <div id="qr-container" style="width:140px;height:140px;">${qrSvg}</div>
            </div>
            <div style="flex:1;min-width:160px;">
              <div class="mono" style="font-size:10px;color:var(--sys-text-dim2);margin-bottom:6px;">アクセス先URL</div>
              <div class="mono" style="font-size:11px;color:var(--sys-cyan);word-break:break-all;background:#0d1815;border:1px solid var(--sys-line-soft);padding:6px 8px;border-radius:4px;">${escHtml(adminLoginUrl)}</div>
              <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
                <button onclick="downloadQR()" class="mono" style="padding:6px 14px;background:rgba(57,255,136,.08);color:var(--sys-green);border:1px solid rgba(57,255,136,.4);border-radius:4px;font-size:12px;cursor:pointer;font-weight:600;">保存</button>
                <button onclick="copyUrl()" class="mono" style="padding:6px 14px;background:transparent;color:var(--sys-text-dim);border:1px solid var(--sys-line);border-radius:4px;font-size:12px;cursor:pointer;" id="copy-btn-qr">URLコピー</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js" integrity="sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ" crossorigin="anonymous"></script>
    <script>
      var ADMIN_PATH = ${JSON.stringify(ADMIN_PATH)};

      // ---- 時計 ----
      function sysTick() {
        var el = document.getElementById('sys-clock');
        if (el) el.textContent = new Date().toLocaleTimeString('ja-JP', { hour12: false }) + ' JST';
      }
      setInterval(sysTick, 1000); sysTick();

      // ---- マトリックスレイン演出（コンソールヘッダー背景） ----
      (function () {
        var canvas = document.getElementById('matrix-rain');
        if (!canvas || !canvas.getContext) return;
        var ctx = canvas.getContext('2d');
        var parent = canvas.parentElement;
        var fontSize = 14;
        var columns = 0, drops = [];
        function setup() {
          canvas.width = parent.clientWidth;
          canvas.height = parent.clientHeight;
          columns = Math.max(1, Math.floor(canvas.width / fontSize));
          drops = [];
          for (var i = 0; i < columns; i++) drops.push(Math.random() * -40);
        }
        setup();
        window.addEventListener('resize', setup);
        var chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン0123456789';
        function draw() {
          ctx.fillStyle = 'rgba(3,5,7,0.16)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.font = fontSize + 'px monospace';
          for (var i = 0; i < drops.length; i++) {
            var ch = chars[Math.floor(Math.random() * chars.length)];
            ctx.fillStyle = 'rgba(57,255,136,0.85)';
            ctx.fillText(ch, i * fontSize, drops[i] * fontSize);
            if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
            drops[i]++;
          }
        }
        setInterval(draw, 65);
      })();

      // ---- Chart.js ダークテーマ共通設定 ----
      var SYS_MONO = "'SF Mono',SFMono-Regular,Menlo,Consolas,'Courier New',monospace";
      if (window.Chart) {
        Chart.defaults.color = '#6f9c85';
        Chart.defaults.font.family = SYS_MONO;
        Chart.defaults.font.size = 10;
      }

      // ---- 日別操作件数（折れ線／エリアチャート） ----
      var DAILY_LABELS = ${JSON.stringify(dailyLabels)};
      var DAILY_VALUES = ${JSON.stringify(dailyValues)};
      if (window.Chart && document.getElementById('chart-daily')) {
        new Chart(document.getElementById('chart-daily').getContext('2d'), {
          type: 'line',
          data: {
            labels: DAILY_LABELS,
            datasets: [{
              data: DAILY_VALUES, borderColor: '#39ff88', backgroundColor: 'rgba(57,255,136,.14)',
              fill: true, tension: .35, pointRadius: 2, pointBackgroundColor: '#39ff88', borderWidth: 2
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { color: 'rgba(57,255,136,.08)' }, ticks: { color: '#456b58', maxRotation: 0 } },
              y: { beginAtZero: true, grid: { color: 'rgba(57,255,136,.08)' }, ticks: { color: '#456b58', precision: 0 } }
            }
          }
        });
      }

      // ---- 機能別利用トップ（横棒グラフ） ----
      var FEAT_LABELS = ${JSON.stringify(featLabels)};
      var FEAT_VALUES = ${JSON.stringify(featValues)};
      if (window.Chart && document.getElementById('chart-feat')) {
        new Chart(document.getElementById('chart-feat').getContext('2d'), {
          type: 'bar',
          data: { labels: FEAT_LABELS, datasets: [{ data: FEAT_VALUES, backgroundColor: 'rgba(57,255,136,.55)', borderRadius: 3, barThickness: 12 }] },
          options: {
            indexAxis: 'y', responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { beginAtZero: true, grid: { color: 'rgba(57,255,136,.08)' }, ticks: { color: '#456b58', precision: 0 } },
              y: { grid: { display: false }, ticks: { color: '#9fd9bb', font: { size: 10 } } }
            }
          }
        });
      }

      // ---- トラフィック内訳（BOT/LIFF ドーナツ） ----
      var TRAFFIC_BOT = ${JSON.stringify(usageStats?.bot_cnt ?? 0)};
      var TRAFFIC_LIFF = ${JSON.stringify(usageStats?.liff_cnt ?? 0)};
      if (window.Chart && document.getElementById('chart-traffic')) {
        new Chart(document.getElementById('chart-traffic').getContext('2d'), {
          type: 'doughnut',
          data: { labels: ['BOT', 'LIFF'], datasets: [{ data: [TRAFFIC_BOT, TRAFFIC_LIFF], backgroundColor: ['#58e6ff', '#ff6fe0'], borderColor: '#0a120f', borderWidth: 3 }] },
          options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
        });
      }

      // ---- API稼働率ゲージ（半円ドーナツ、チェック結果で更新） ----
      var apiHealthChart = null;
      function renderApiHealthChart(okCount, total) {
        if (!window.Chart || !document.getElementById('chart-api-health')) return;
        var pct = total > 0 ? Math.round(okCount / total * 100) : 0;
        var data = {
          labels: ['正常', '異常'],
          datasets: [{ data: [okCount, Math.max(total - okCount, 0)], backgroundColor: ['#39ff88', '#ff3b60'], borderColor: '#0a120f', borderWidth: 3 }]
        };
        if (apiHealthChart) {
          apiHealthChart.data = data;
          apiHealthChart.update();
        } else {
          apiHealthChart = new Chart(document.getElementById('chart-api-health').getContext('2d'), {
            type: 'doughnut',
            data: data,
            options: {
              responsive: true, maintainAspectRatio: false, cutout: '72%',
              rotation: -90, circumference: 180,
              plugins: { legend: { display: false } }
            }
          });
        }
        var pctEl = document.getElementById('api-health-pct');
        if (pctEl) { pctEl.textContent = pct + '%'; pctEl.style.color = pct >= 100 ? '#39ff88' : (pct >= 50 ? '#ffb930' : '#ff3b60'); }
      }

      // ---- APIエンドポイントチェック ----
      var API_TARGETS = [
        { label: '社員データベース API', url: '/api/employees/count' },
        { label: 'シフト区分 API', url: '/api/schedule-types' },
        { label: 'コーチ API', url: '/api/coaches' },
        { label: 'LINE通知設定 API', url: '/api/notifications' },
        { label: 'LIFF LINEユーザー管理画面', url: ADMIN_PATH + '/settings/liff' },
      ];
      var logs = [];

      function statusBadge(ok, ms, note) {
        var label = note || (ok ? '正常' : 'エラー');
        var cls = ok ? 'b-ok' : 'b-ng';
        var msStr = ms != null ? ' (' + ms + 'ms)' : '';
        return '<span class="sys-badge ' + cls + '">' + label + msStr + '</span>';
      }

      async function checkEndpoint(t) {
        var start = performance.now();
        try {
          var opts = { method: t.method || 'GET', credentials: 'include' };
          if (t.body !== undefined && t.method === 'POST') {
            opts.headers = { 'Content-Type': 'application/json' };
            opts.body = t.body;
          }
          var res = await fetch(t.url, opts);
          var ms = Math.round(performance.now() - start);
          var ok = t.expect ? t.expect.includes(res.status) : (res.status < 400);
          logs.push('[' + new Date().toLocaleTimeString('ja-JP') + '] ' + (ok ? 'OK' : 'NG') + ' ' + res.status + ' ' + t.url + ' (' + ms + 'ms)');
          return { ok, ms, status: res.status };
        } catch (e) {
          var ms2 = Math.round(performance.now() - start);
          logs.push('[' + new Date().toLocaleTimeString('ja-JP') + '] ERR ' + t.url + ' — ' + e.message);
          return { ok: false, ms: ms2, status: null, err: e.message };
        }
      }

      async function runChecks() {
        document.getElementById('api-checks').innerHTML = '<div style="font-size:12px;color:#456b58;">確認中...</div>';
        document.getElementById('net-log').textContent = '確認中...';
        logs = [];

        var results = await Promise.all(API_TARGETS.map(t => checkEndpoint(t)));
        var rows = API_TARGETS.map(function(t, i) {
          var r = results[i];
          var note = r.err ? 'ネットワークエラー' : (r.status != null ? ('HTTP ' + r.status) : null);
          return '<div class="sys-row">' +
            '<span style="font-size:13px;color:#d7ffe9;">' + t.label + '</span>' +
            statusBadge(r.ok, r.ms, r.ok ? null : note) +
            '</div>';
        }).join('');
        document.getElementById('api-checks').innerHTML = rows;
        document.getElementById('net-log').innerHTML = logs.map(function(l) {
          return '<div>' + l + '</div>';
        }).join('');
        document.getElementById('checked-at').textContent = '最終確認: ' + new Date().toLocaleString('ja-JP');
        var okCount = results.filter(function(r) { return r.ok; }).length;
        renderApiHealthChart(okCount, results.length);
      }

      runChecks();

      // ---- メンテナンスモード切替（adminのみカードが存在） ----
      function toggleMaintenance(el) {
        var on = el.checked;
        if (on && !confirm('メンテナンスモードをONにします。\\nadmin以外の全ユーザーにメンテナンス画面が表示されます。よろしいですか？')) {
          el.checked = false;
          return;
        }
        el.disabled = true;
        fetch(ADMIN_PATH + '/settings/status/maintenance', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: on })
        }).then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
        .then(function(res) {
          el.disabled = false;
          if (!res.ok) { el.checked = !on; alert(res.j.error || '切替に失敗しました'); return; }
          applyManualState(res.j.enabled);
          applyEffectiveState(res.j.active);
          var msg = document.getElementById('maint-msg');
          if (msg) { msg.textContent = '変更を保存しました（' + new Date().toLocaleTimeString('ja-JP') + '）'; }
        }).catch(function() {
          el.disabled = false; el.checked = !on;
          alert('通信エラーで切り替えできませんでした');
        });
      }
      function applyManualState(on) {
        var st = document.getElementById('maint-state');
        if (st) { st.textContent = on ? 'MAINT ON' : 'NORMAL'; st.style.color = on ? '#ffb930' : '#39ff88'; }
      }
      function applyEffectiveState(on) {
        var led = document.getElementById('head-led');
        if (led) { led.className = 'led ' + (on ? 'led-a' : 'led-g'); }
        var hs = document.getElementById('head-state');
        if (hs) {
          hs.textContent = on ? '[!] MAINTENANCE MODE' : 'ALL SYSTEMS OPERATIONAL';
          hs.style.color = on ? '#ffb930' : '#39ff88';
          hs.style.textShadow = on ? '0 0 12px rgba(255,185,48,.55)' : '0 0 12px rgba(57,255,136,.55)';
        }
        var bn = document.getElementById('maint-banner');
        if (bn) { bn.style.display = on ? 'block' : 'none'; }
      }

      // ---- 期間指定メンテナンス（予約メンテナンス） ----
      function saveMaintenanceSchedule() {
        var startEl = document.getElementById('maint-sch-start');
        var endEl = document.getElementById('maint-sch-end');
        var msg = document.getElementById('maint-sch-msg');
        if (endEl.value && startEl.value && endEl.value < startEl.value) {
          if (msg) msg.textContent = '終了日時は開始日時より後にしてください';
          return;
        }
        postMaintenanceSchedule(startEl.value || null, endEl.value || null);
      }
      function clearMaintenanceSchedule() {
        document.getElementById('maint-sch-start').value = '';
        document.getElementById('maint-sch-end').value = '';
        postMaintenanceSchedule(null, null);
      }
      function postMaintenanceSchedule(start, end) {
        var msg = document.getElementById('maint-sch-msg');
        if (msg) msg.textContent = '保存中…';
        fetch(ADMIN_PATH + '/settings/status/maintenance/schedule', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start: start, end: end })
        }).then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
        .then(function(res) {
          if (!res.ok) { if (msg) msg.textContent = res.j.error || '保存に失敗しました'; return; }
          if (msg) msg.textContent = '保存しました（' + new Date().toLocaleTimeString('ja-JP') + '）';
          var act = document.getElementById('maint-sch-active');
          if (act) {
            act.textContent = res.j.scheduleActive ? '● 期間内（適用中）' : '期間外';
            act.style.color = res.j.scheduleActive ? '#ffb930' : '#456b58';
          }
          applyEffectiveState(res.j.active);
        }).catch(function() {
          if (msg) msg.textContent = '通信エラーで保存できませんでした';
        });
      }

      // ---- QRコード ----
      var QR_URL = ${JSON.stringify(adminLoginUrl)};
      function downloadQR() {
        var svg = document.querySelector('#qr-container svg');
        if (!svg) return;
        var xml = new XMLSerializer().serializeToString(svg);
        var img = new Image();
        img.onload = function() {
          var size = 320;
          var canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
          ctx.drawImage(img, 0, 0, size, size);
          var link = document.createElement('a');
          link.download = '管理画面QRコード.png';
          link.href = canvas.toDataURL('image/png');
          link.click();
        };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      }
      function copyUrl() {
        navigator.clipboard.writeText(QR_URL).then(function() {
          var btn = document.getElementById('copy-btn-qr');
          btn.textContent = 'コピー済';
          setTimeout(function() { btn.textContent = 'URLコピー'; }, 2000);
        });
      }
    </script>`;

  return c.html(layout('システムステータス', html, 'settings'));
});

export default app;
