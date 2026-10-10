// ===================================================
// サイバー（設定 → サイバー）
//   旧「システムステータス」を廃止して集約したセキュリティ監視ページ。
//   - 脅威レベル（直近24時間の検知から自動判定）
//   - 要確認アラート（総当たり・なりすまし疑い・初めての回線からのログイン 等）
//   - 検知件数（24時間／7日）と7日間の推移
//   - ログイン中の端末（強制ログアウト）
//   - アカウント別の最終ログイン・失敗回数
//   - セキュリティ診断（防御機能の稼働状況チェック）
//   - 検知ログ（種類・重要度で絞り込み）
//   - メンテナンスモード（adminアカウントのみ切替可）
// 記録: utils/security.ts の logSecurityEvent（security_events / migration_180）
// 権限キー: settings.cyber（強制ログアウトは settings.cyber.edit、メンテ切替は username=admin のみ）
// ===================================================
import { Hono } from 'hono';
import type { Env } from '../auth';
import { getSessionFromCookie } from '../auth';
import { layout, escHtml, formatJst } from '../html/layout';
import { settingsSubHeader } from './admin';
import { ADMIN_PATH } from '../config';
import {
  getMaintenanceMode, setMaintenanceMode, isAdminAccount,
  getMaintenanceSchedule, setMaintenanceSchedule, isWithinSchedule,
} from '../utils/maintenance';
import { EVENT_LABELS, ACCOUNT_LOCK_THRESHOLD, clientInfo, logSecurityEvent, type SecurityEventType } from '../utils/security';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

type EventRow = {
  id: number; event_type: SecurityEventType; severity: string; ip: string | null; country: string | null;
  as_org: string | null; username: string | null; admin_id: number | null; path: string | null;
  user_agent: string | null; detail: string | null; created_at: string;
};

type Alert = { level: 'critical' | 'warn' | 'info'; title: string; body: string; action: string };

const SEV_LABEL: Record<string, string> = { critical: '重大', warn: '注意', info: '記録' };

// User-Agent をざっくり「端末 / ブラウザ」に要約する（詳細はtitle属性で全文表示）
function uaSummary(ua: string | null): string {
  if (!ua) return '不明';
  const dev =
    /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' :
    /Windows/.test(ua) ? 'Windows' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'その他';
  const br =
    /Line\//.test(ua) ? 'LINE内ブラウザ' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' :
    /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' :
    /curl|python|wget|Go-http|bot|spider|crawl/i.test(ua) ? '自動ツール' : 'その他';
  return `${dev} / ${br}`;
}

function jstNow(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

// ===== メンテナンスモード（旧システムステータスから移設） =====
app.get('/settings/cyber/maintenance', async (c) => {
  const [enabled, schedule] = await Promise.all([
    getMaintenanceMode(c.env.DB),
    getMaintenanceSchedule(c.env.DB),
  ]);
  return c.json({ enabled, schedule, active: enabled || isWithinSchedule(schedule) });
});

app.post('/settings/cyber/maintenance', async (c) => {
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
  await logSecurityEvent(c.env.DB, {
    type: 'maintenance_changed', severity: 'info', ...clientInfo(c), adminId, username: 'admin',
    detail: enabled ? '手動でメンテナンスモードをON' : '手動でメンテナンスモードをOFF',
  });
  const schedule = await getMaintenanceSchedule(c.env.DB);
  return c.json({ ok: true, enabled, active: enabled || isWithinSchedule(schedule) });
});

app.post('/settings/cyber/maintenance/schedule', async (c) => {
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
  await logSecurityEvent(c.env.DB, {
    type: 'maintenance_changed', severity: 'info', ...clientInfo(c), adminId, username: 'admin',
    detail: start ? `期間指定を設定（${start.replace('T', ' ')} 〜 ${end ? end.replace('T', ' ') : '無期限'}）` : '期間指定をクリア',
  });
  const enabled = await getMaintenanceMode(c.env.DB);
  const scheduleActive = isWithinSchedule({ start, end });
  return c.json({ ok: true, schedule: { start, end }, scheduleActive, active: enabled || scheduleActive });
});

// ===== 強制ログアウト =====
// 1端末だけ（rid = sessions の rowid。セッションIDそのものは画面に出さない）
app.post('/settings/cyber/sessions/:rid/revoke', async (c) => {
  const rid = Number(c.req.param('rid'));
  if (!Number.isInteger(rid) || rid <= 0) return c.json({ error: '不正な指定です' }, 400);
  const target = await c.env.DB.prepare(
    'SELECT s.id, a.username FROM sessions s LEFT JOIN admins a ON a.id = s.admin_id WHERE s.rowid = ?'
  ).bind(rid).first<{ id: string; username: string | null }>();
  if (!target) return c.json({ error: 'この端末はすでにログアウトしています' }, 404);
  const mySid = getSessionFromCookie(c.req.header('Cookie') ?? null);
  if (target.id === mySid) return c.json({ error: '今使っている端末はここからはログアウトできません（右上のログアウトを使ってください）' }, 400);
  await c.env.DB.prepare('DELETE FROM sessions WHERE rowid = ?').bind(rid).run();
  await logSecurityEvent(c.env.DB, {
    type: 'session_revoked', severity: 'warn', ...clientInfo(c), adminId: c.get('adminId'),
    username: target.username, detail: `「${target.username ?? '不明'}」の端末を強制ログアウト`,
  });
  return c.json({ ok: true });
});

// 自分（今使っている端末）以外を全員ログアウト（乗っ取りが疑われるときの緊急対応）
app.post('/settings/cyber/sessions/revoke-others', async (c) => {
  const mySid = getSessionFromCookie(c.req.header('Cookie') ?? null) ?? '';
  const res = await c.env.DB.prepare('DELETE FROM sessions WHERE id != ?').bind(mySid).run();
  const n = res.meta?.changes ?? 0;
  await logSecurityEvent(c.env.DB, {
    type: 'session_revoked', severity: 'critical', ...clientInfo(c), adminId: c.get('adminId'),
    detail: `自分以外の全端末を強制ログアウト（${n}台）`,
  });
  return c.json({ ok: true, count: n });
});

// ===== 本体ページ =====
app.get('/settings/cyber', async (c) => {
  const db = c.env.DB;
  const adminId = c.get('adminId');
  const mySid = getSessionFromCookie(c.req.header('Cookie') ?? null) ?? '';
  const filterType = c.req.query('type') ?? '';
  const filterSev = c.req.query('sev') ?? '';

  const isAdmin = adminId ? await isAdminAccount(db, adminId) : false;
  const [manualMaintenanceOn, maintenanceSchedule] = await Promise.all([
    getMaintenanceMode(db), getMaintenanceSchedule(db),
  ]);
  const maintenanceOn = manualMaintenanceOn || isWithinSchedule(maintenanceSchedule);

  // テーブル未作成（migration_180未適用）でもページ自体は開けるようにする
  let tableReady = true;
  const q = async <T>(sql: string, ...binds: unknown[]): Promise<T[]> => {
    try {
      const r = await db.prepare(sql).bind(...binds).all<T>();
      return r.results ?? [];
    } catch {
      tableReady = false;
      return [];
    }
  };

  const typeWhere: string[] = [];
  const typeBinds: unknown[] = [];
  if (filterType && filterType in EVENT_LABELS) { typeWhere.push('event_type = ?'); typeBinds.push(filterType); }
  if (filterSev === 'warn') typeWhere.push("severity IN ('warn','critical')");
  else if (filterSev === 'critical') typeWhere.push("severity = 'critical'");

  const [
    counts24, counts7, daily, failByIp, failByUser, newNetLogins, failThenSuccess,
    badSig7, unknownUsers, logRows, firstRecord,
  ] = await Promise.all([
    q<{ event_type: string; cnt: number }>(`
      SELECT event_type, COUNT(*) AS cnt FROM security_events
      WHERE created_at >= datetime('now','+9 hours','-1 day') GROUP BY event_type`),
    q<{ event_type: string; cnt: number }>(`
      SELECT event_type, COUNT(*) AS cnt FROM security_events
      WHERE created_at >= datetime('now','+9 hours','-7 days') GROUP BY event_type`),
    q<{ d: string; info: number; alert: number }>(`
      SELECT substr(created_at,1,10) AS d,
        SUM(CASE WHEN severity = 'info' THEN 1 ELSE 0 END) AS info,
        SUM(CASE WHEN severity != 'info' THEN 1 ELSE 0 END) AS alert
      FROM security_events WHERE created_at >= datetime('now','+9 hours','-14 days')
      GROUP BY d ORDER BY d`),
    // 同じ接続元からの失敗（24時間で5回以上）
    q<{ ip: string; country: string | null; as_org: string | null; cnt: number; users: number; last_at: string }>(`
      SELECT ip, MAX(country) AS country, MAX(as_org) AS as_org, COUNT(*) AS cnt,
        COUNT(DISTINCT username) AS users, MAX(created_at) AS last_at
      FROM security_events WHERE event_type = 'login_failed' AND created_at >= datetime('now','+9 hours','-1 day')
      GROUP BY ip HAVING cnt >= 5 ORDER BY cnt DESC LIMIT 10`),
    // 同じアカウントへの失敗（24時間で5回以上）
    q<{ username: string; cnt: number; ips: number; last_at: string }>(`
      SELECT username, COUNT(*) AS cnt, COUNT(DISTINCT ip) AS ips, MAX(created_at) AS last_at
      FROM security_events WHERE event_type = 'login_failed' AND username IS NOT NULL AND username != ''
        AND created_at >= datetime('now','+9 hours','-1 day')
      GROUP BY username HAVING cnt >= 5 ORDER BY cnt DESC LIMIT 10`),
    // 初めての回線からのログイン（7日）
    q<EventRow>(`
      SELECT * FROM security_events WHERE event_type = 'login_success' AND severity = 'warn'
        AND created_at >= datetime('now','+9 hours','-7 days') ORDER BY created_at DESC LIMIT 10`),
    // 失敗が3回以上続いた直後（1時間以内）のログイン成功（7日）＝推測で突破された可能性
    q<EventRow & { fails: number }>(`
      SELECT s.*, (
        SELECT COUNT(*) FROM security_events f
        WHERE f.event_type = 'login_failed' AND f.username = s.username
          AND f.created_at <= s.created_at AND f.created_at >= datetime(s.created_at, '-1 hour')
      ) AS fails
      FROM security_events s
      WHERE s.event_type = 'login_success' AND s.created_at >= datetime('now','+9 hours','-7 days')
        AND fails >= 3
      ORDER BY s.created_at DESC LIMIT 10`),
    q<{ cnt: number; last_at: string }>(`
      SELECT COUNT(*) AS cnt, MAX(created_at) AS last_at FROM security_events
      WHERE event_type = 'webhook_bad_sig' AND created_at >= datetime('now','+9 hours','-7 days')`),
    // 存在しないユーザー名でのログイン試行（7日）
    q<{ username: string; cnt: number }>(`
      SELECT username, COUNT(*) AS cnt FROM security_events
      WHERE event_type = 'login_failed' AND detail = '存在しないユーザー名'
        AND created_at >= datetime('now','+9 hours','-7 days')
      GROUP BY username ORDER BY cnt DESC LIMIT 8`),
    q<EventRow>(`
      SELECT * FROM security_events ${typeWhere.length ? 'WHERE ' + typeWhere.join(' AND ') : ''}
      ORDER BY created_at DESC, id DESC LIMIT 300`, ...typeBinds),
    q<{ first_at: string | null }>(`SELECT MIN(created_at) AS first_at FROM security_events`),
  ]);

  // ログイン中の端末（sessions の接続元列は migration_180 で追加。未適用時は列なしで取得）
  type SessRow = { rid: number; id: string; username: string | null; created_at: string; expires_at: string; ip?: string | null; country?: string | null; as_org?: string | null; user_agent?: string | null };
  let sessions: SessRow[] = [];
  try {
    sessions = (await db.prepare(`
      SELECT s.rowid AS rid, s.id, a.username, s.created_at, s.expires_at, s.ip, s.country, s.as_org, s.user_agent
      FROM sessions s LEFT JOIN admins a ON a.id = s.admin_id
      WHERE s.expires_at > ? ORDER BY s.created_at DESC LIMIT 100
    `).bind(new Date().toISOString()).all<SessRow>()).results ?? [];
  } catch {
    sessions = (await db.prepare(`
      SELECT s.rowid AS rid, s.id, a.username, s.created_at, s.expires_at
      FROM sessions s LEFT JOIN admins a ON a.id = s.admin_id
      WHERE s.expires_at > ? ORDER BY s.created_at DESC LIMIT 100
    `).bind(new Date().toISOString()).all<SessRow>().catch(() => ({ results: [] as SessRow[] }))).results ?? [];
  }

  // アカウント一覧＋最終ログイン
  const accounts = (await db.prepare('SELECT id, username, permissions, created_at FROM admins ORDER BY id')
    .all<{ id: number; username: string; permissions: string | null; created_at: string }>()).results ?? [];
  const lastLogins = await q<{ username: string; last_at: string; fails30: number }>(`
    SELECT username,
      MAX(CASE WHEN event_type = 'login_success' THEN created_at END) AS last_at,
      SUM(CASE WHEN event_type = 'login_failed' AND created_at >= datetime('now','+9 hours','-30 days') THEN 1 ELSE 0 END) AS fails30
    FROM security_events WHERE username IS NOT NULL GROUP BY username`);
  const lastMap = new Map(lastLogins.map(r => [r.username, r]));
  const fullCount = accounts.filter(a => a.permissions === null).length;

  const c24 = new Map(counts24.map(r => [r.event_type, r.cnt]));
  const c7 = new Map(counts7.map(r => [r.event_type, r.cnt]));
  const n24 = (t: SecurityEventType) => c24.get(t) ?? 0;
  const n7 = (t: SecurityEventType) => c7.get(t) ?? 0;

  // ===== アラート生成 =====
  const alerts: Alert[] = [];
  for (const r of failThenSuccess) {
    alerts.push({
      level: 'critical',
      title: `「${r.username}」が失敗${r.fails}回の直後にログイン成功`,
      body: `${r.created_at.slice(5, 16)}　接続元 ${r.ip ?? '不明'}（${r.as_org ?? '回線不明'}）。パスワードを推測されて突破された可能性があります。`,
      action: '本人に心当たりを確認し、心当たりがなければすぐにパスワード変更＋下の「ログイン中の端末」から強制ログアウトしてください。',
    });
  }
  for (const r of failByUser) {
    alerts.push({
      level: r.cnt >= ACCOUNT_LOCK_THRESHOLD ? 'critical' : 'warn',
      title: `「${r.username}」へのログイン失敗が24時間で${r.cnt}回`,
      body: `接続元 ${r.ips}か所から。最終 ${r.last_at.slice(5, 16)}。${r.cnt >= ACCOUNT_LOCK_THRESHOLD ? '現在このアカウントは一時ロック中です（15分で自動解除）。' : ''}`,
      action: '本人の入力ミスでなければ、誰かがパスワードを当てようとしています。パスワードを長く・使い回しのないものに変えてください。',
    });
  }
  for (const r of failByIp) {
    alerts.push({
      level: 'warn',
      title: `同じ接続元から24時間で${r.cnt}回ログイン失敗`,
      body: `${r.ip}（${r.as_org ?? '回線不明'}）／試されたアカウント ${r.users}種類。最終 ${r.last_at.slice(5, 16)}。`,
      action: '社内の誰かのパスワード忘れなら問題ありません。複数のアカウント名を試している場合は総当たり攻撃の可能性があります。',
    });
  }
  if (unknownUsers.length > 0) {
    alerts.push({
      level: 'warn',
      title: '存在しないアカウント名でのログイン試行',
      body: `直近7日: ${unknownUsers.map(u => `「${u.username}」${u.cnt}回`).join('、')}`,
      action: 'ありがちな名前（admin以外のroot・test等）を試すのは攻撃の典型です。続くようなら管理画面URLの変更を検討してください。',
    });
  }
  if ((badSig7[0]?.cnt ?? 0) > 0) {
    alerts.push({
      level: 'critical',
      title: `LINE連携への署名不正なリクエスト ${badSig7[0].cnt}件（7日）`,
      body: `LINEになりすましてBotを操作しようとした可能性があります。最終 ${(badSig7[0].last_at ?? '').slice(5, 16)}。署名が一致しないため処理はすべて拒否済みです。`,
      action: '続く場合はLINE Developersでチャネルシークレットを再発行し、Cloudflareに登録し直してください。',
    });
  }
  for (const r of newNetLogins) {
    alerts.push({
      level: 'info',
      title: `「${r.username}」が初めての回線からログイン`,
      body: `${r.created_at.slice(5, 16)}　${r.as_org ?? ''}（${r.ip ?? ''}）／${uaSummary(r.user_agent)}`,
      action: '自宅回線や新しいスマホからなら問題ありません。本人に心当たりがなければ強制ログアウト＋パスワード変更を。',
    });
  }
  if (n24('probe') >= 20) {
    alerts.push({
      level: 'info',
      title: `攻撃ツールによる探索が24時間で${n24('probe')}回`,
      body: '.env や wp-admin など、よくある弱点を自動で探しに来るアクセスです。このシステムには該当ファイルがないため実害はありません。',
      action: '対応不要。急増が続く場合のみ相談してください。',
    });
  }

  const threat: 'critical' | 'warn' | 'normal' =
    alerts.some(a => a.level === 'critical') ? 'critical' :
    alerts.some(a => a.level === 'warn') ? 'warn' : 'normal';
  const threatLabel = { critical: '警戒', warn: '注意', normal: '平常' }[threat];
  const threatText = {
    critical: '要確認の重大な兆候があります。下のアラートを確認してください',
    warn: '注意が必要な兆候があります',
    normal: '不審な兆候は検知されていません',
  }[threat];

  // ===== 表示パーツ =====
  const kpiDefs: Array<[SecurityEventType, string]> = [
    ['login_success', 'ログイン成功'],
    ['login_failed', 'ログイン失敗'],
    ['login_locked', 'ロック発動'],
    ['foreign_blocked', '国外アクセス遮断'],
    ['probe', '攻撃パターン探索'],
    ['perm_denied', '権限外アクセス'],
  ];
  const kpiHtml = kpiDefs.map(([t, label]) => {
    const v24 = n24(t);
    const hot = t !== 'login_success' && t !== 'foreign_blocked' && v24 > 0;
    return `<div class="cy-kpi${hot ? ' hot' : ''}">
      <div class="kl">${label}</div>
      <div class="kv mono">${v24.toLocaleString('ja-JP')}<span class="ku">件/24h</span></div>
      <div class="ks mono">7日 ${n7(t).toLocaleString('ja-JP')}</div>
    </div>`;
  }).join('');

  // 14日推移（0件の日も並べる）
  const dayList: string[] = [];
  for (let i = 13; i >= 0; i--) dayList.push(new Date(Date.now() + 9 * 3600 * 1000 - i * 86400000).toISOString().slice(0, 10));
  const dailyMap = new Map(daily.map(r => [r.d, r]));
  const maxDay = Math.max(1, ...daily.map(r => (r.info ?? 0) + (r.alert ?? 0)));
  const chartHtml = dayList.map(d => {
    const r = dailyMap.get(d);
    const info = r?.info ?? 0, alert = r?.alert ?? 0;
    const hInfo = Math.round((info / maxDay) * 100), hAlert = Math.round((alert / maxDay) * 100);
    return `<div class="cy-bar" title="${d}　記録 ${info}件／注意以上 ${alert}件">
      <div class="cy-bar-stack"><div class="b-alert" style="height:${hAlert}%;"></div><div class="b-info" style="height:${hInfo}%;"></div></div>
      <div class="cy-bar-l mono">${parseInt(d.slice(8, 10))}</div>
    </div>`;
  }).join('');

  const alertsHtml = alerts.length === 0
    ? `<div class="cy-empty">要確認のアラートはありません。</div>`
    : alerts.map(a => `
      <div class="cy-alert lv-${a.level}">
        <div class="cy-alert-h"><span class="cy-sev sev-${a.level}">${SEV_LABEL[a.level]}</span><span class="cy-alert-t">${escHtml(a.title)}</span></div>
        <div class="cy-alert-b">${escHtml(a.body)}</div>
        <div class="cy-alert-a">対処の目安：${escHtml(a.action)}</div>
      </div>`).join('');

  const sessionsHtml = sessions.length === 0
    ? `<tr><td colspan="6" class="cy-empty">ログイン中の端末はありません</td></tr>`
    : sessions.map(s => {
      const mine = s.id === mySid;
      return `<tr${mine ? ' class="mine"' : ''}>
        <td><b>${escHtml(s.username ?? '（削除済み）')}</b>${mine ? '<span class="cy-tag">この端末</span>' : ''}</td>
        <td class="mono">${escHtml(formatJst(s.created_at))}</td>
        <td class="mono">${escHtml(s.ip ?? '—')}</td>
        <td>${escHtml([s.country, s.as_org].filter(Boolean).join(' / ') || '—')}</td>
        <td title="${escHtml(s.user_agent ?? '')}">${escHtml(s.ip === undefined ? '—' : uaSummary(s.user_agent ?? null))}</td>
        <td>${mine ? '' : `<button type="button" class="cy-btn danger" onclick="revokeSession(${s.rid}, this)">強制ログアウト</button>`}</td>
      </tr>`;
    }).join('');

  const accountsHtml = accounts.map(a => {
    const l = lastMap.get(a.username);
    return `<tr>
      <td><b>${escHtml(a.username)}</b></td>
      <td>${a.permissions === null ? '<span class="cy-sev sev-warn">フル権限</span>' : '<span class="cy-sev sev-info">制限付き</span>'}</td>
      <td class="mono">${l?.last_at ? escHtml(l.last_at.slice(0, 16)) : '<span class="dim">記録なし</span>'}</td>
      <td class="mono${(l?.fails30 ?? 0) >= 5 ? ' warn' : ''}">${l?.fails30 ?? 0}</td>
    </tr>`;
  }).join('');

  // セキュリティ診断
  const setupRow = await db.prepare("SELECT password FROM admins WHERE username = 'admin'").first<{ password: string }>().catch(() => null);
  const setupDone = !!setupRow && setupRow.password !== 'CHANGE_ME_PLACEHOLDER';
  type Check = { ok: 'ok' | 'warn' | 'ng'; name: string; detail: string };
  const checks: Check[] = [
    { ok: tableReady ? 'ok' : 'ng', name: '検知ログの記録', detail: tableReady ? `記録中（${firstRecord[0]?.first_at ? firstRecord[0].first_at.slice(0, 10) + ' から' : 'まだ記録なし'}・180日保存）` : 'データベースの準備（migration_180）が未適用のため記録できていません' },
    { ok: 'ok', name: '国外アクセス遮断', detail: '日本以外の接続元からは全ページ・全APIを拒否' },
    { ok: 'ok', name: '通信の暗号化（HTTPS強制）', detail: 'http での接続は https へ転送。ブラウザにも https 専用を指示（HSTS）' },
    { ok: 'ok', name: 'パスワード総当たり対策', detail: `同じ接続元から5回／同じアカウントへ${ACCOUNT_LOCK_THRESHOLD}回失敗で15分ロック` },
    { ok: 'ok', name: 'なりすましログイン送信の防止', detail: 'ログイン画面を経由しない送信（CSRF）は拒否' },
    { ok: 'ok', name: 'ログインの自動失効', detail: '24時間操作がない端末は自動的にログアウト' },
    { ok: 'ok', name: '画面の埋め込み・外部スクリプト制限', detail: '他サイトへの埋め込み禁止・読み込み元を限定（CSP）' },
    { ok: c.env.LINE_CHANNEL_SECRET ? 'ok' : 'ng', name: 'LINE連携の署名検証', detail: c.env.LINE_CHANNEL_SECRET ? 'LINE以外からのBot操作は拒否' : 'チャネルシークレットが未登録です' },
    { ok: setupDone ? 'ok' : 'ng', name: '初期設定画面の封鎖', detail: setupDone ? '初期パスワード設定は完了済みのため使用不可' : 'adminの初期パスワードが未設定です。すぐに設定してください' },
    { ok: fullCount <= 3 ? 'ok' : 'warn', name: 'フル権限アカウントの数', detail: `${fullCount}件（全ページ・全操作が可能。3件以下を推奨）` },
  ];
  const checkHtml = checks.map(ch => `
    <div class="cy-check">
      <span class="cy-dot d-${ch.ok}"></span>
      <div><div class="cn">${escHtml(ch.name)}</div><div class="cd">${escHtml(ch.detail)}</div></div>
      <span class="cy-sev ${ch.ok === 'ok' ? 'sev-ok' : ch.ok === 'warn' ? 'sev-warn' : 'sev-critical'}">${ch.ok === 'ok' ? '有効' : ch.ok === 'warn' ? '要確認' : '要対応'}</span>
    </div>`).join('');

  // 検知ログ
  const typeOptions = ['<option value="">すべての種類</option>']
    .concat(Object.entries(EVENT_LABELS).map(([k, v]) => `<option value="${k}"${filterType === k ? ' selected' : ''}>${v}</option>`)).join('');
  const sevOptions = [['', 'すべての重要度'], ['warn', '注意以上'], ['critical', '重大のみ']]
    .map(([k, v]) => `<option value="${k}"${filterSev === k ? ' selected' : ''}>${v}</option>`).join('');
  const logHtml = logRows.length === 0
    ? `<tr><td colspan="7" class="cy-empty">記録はありません</td></tr>`
    : logRows.map(r => `<tr>
      <td class="mono nowrap">${escHtml(r.created_at.slice(5, 16))}</td>
      <td><span class="cy-sev sev-${escHtml(r.severity)}">${SEV_LABEL[r.severity] ?? escHtml(r.severity)}</span></td>
      <td class="nowrap">${escHtml(EVENT_LABELS[r.event_type] ?? r.event_type)}</td>
      <td>${escHtml(r.username ?? (r.admin_id ? `#${r.admin_id}` : '—'))}</td>
      <td class="mono">${escHtml(r.ip ?? '—')}<div class="dim">${escHtml([r.country, r.as_org].filter(Boolean).join(' / '))}</div></td>
      <td class="mono path">${escHtml(r.path ?? '')}</td>
      <td>${escHtml(r.detail ?? '')}<div class="dim" title="${escHtml(r.user_agent ?? '')}">${r.user_agent ? escHtml(uaSummary(r.user_agent)) : ''}</div></td>
    </tr>`).join('');

  const maintenanceHtml = `
    <div class="cy-panel">
      <div class="cy-ph"><span class="mono">MAINTENANCE</span>メンテナンスモード<span class="cy-ps">${isAdmin ? 'adminアカウントのみ切替可' : '閲覧のみ（切替はadminアカウント）'}</span></div>
      <div class="cy-pb">
        <div id="maint-banner" class="cy-maint-banner" style="display:${maintenanceOn ? 'block' : 'none'};">メンテナンスモード稼働中 ― admin 以外のアクセスにはメンテナンス画面が表示されています</div>
        <div class="cy-row">
          <div style="flex:1;min-width:240px;">
            <div class="cn">手動切替</div>
            <div class="cd">ONにすると admin 以外の全アクセス（管理画面・LIFF・フォーム・API）にメンテナンス画面を表示します。LINE Botはメンテナンス中メッセージを返信し、定時通知はそのまま送信されます。不正アクセスが疑われるときの緊急停止にも使えます。</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            <span id="maint-state" class="mono" style="font-weight:700;color:${manualMaintenanceOn ? 'var(--cy-amber)' : 'var(--cy-green)'};">${manualMaintenanceOn ? 'ON' : 'OFF'}</span>
            <label class="sw"><input type="checkbox" id="maint-toggle" ${manualMaintenanceOn ? 'checked' : ''} ${isAdmin ? '' : 'disabled'} onchange="toggleMaintenance(this)"><span class="tr"></span></label>
          </div>
        </div>
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--cy-line-soft);">
          <div class="cn">期間指定（予約メンテナンス）</div>
          <div class="cd" style="margin-bottom:10px;">開始〜終了の期間中は、上の手動切替がOFFでも自動的にメンテナンス扱いになります。終了日時を空欄にすると開始以降は無期限で継続します。</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
            <label class="cd">開始<br><input type="datetime-local" id="maint-sch-start" class="cy-input" value="${escHtml(maintenanceSchedule.start ?? '')}" ${isAdmin ? '' : 'disabled'}></label>
            <label class="cd">終了<br><input type="datetime-local" id="maint-sch-end" class="cy-input" value="${escHtml(maintenanceSchedule.end ?? '')}" ${isAdmin ? '' : 'disabled'}></label>
            ${isAdmin ? `<button type="button" class="cy-btn" onclick="saveMaintenanceSchedule()">保存</button>
            <button type="button" class="cy-btn ghost" onclick="clearMaintenanceSchedule()">クリア</button>` : ''}
          </div>
        </div>
        <div id="maint-msg" class="cd" style="margin-top:8px;"></div>
      </div>
    </div>`;

  const html = settingsSubHeader('サイバー') + `
<style>
  .cy{max-width:1320px;background:#05080c;padding:16px;border-radius:12px;font-family:'Hiragino Sans','Meiryo',-apple-system,sans-serif;color:var(--cy-text);
    --cy-green:#39ff88;--cy-cyan:#58e6ff;--cy-amber:#ffb930;--cy-red:#ff4d6d;--cy-text:#d7ffe9;--cy-dim:#7fa893;--cy-dim2:#4f7562;
    --cy-bg2:#0a120f;--cy-bg3:#0e1a16;--cy-line:rgba(57,255,136,.22);--cy-line-soft:rgba(57,255,136,.10);}
  .cy *{box-sizing:border-box;}
  .cy .mono{font-family:'SF Mono',SFMono-Regular,Menlo,Consolas,monospace;}
  .cy-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px;}
  .cy-grid > *{grid-column:span 12;min-width:0;}
  @media (min-width:960px){ .g6{grid-column:span 6 !important;} .g7{grid-column:span 7 !important;} .g5{grid-column:span 5 !important;} }
  .cy-panel{background:var(--cy-bg2);border:1px solid var(--cy-line);border-radius:6px;overflow:hidden;}
  .cy-ph{display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--cy-line);background:linear-gradient(180deg,rgba(57,255,136,.07),rgba(57,255,136,.01));font-size:13px;font-weight:700;}
  .cy-ph .mono{font-size:10px;letter-spacing:.16em;color:var(--cy-green);}
  .cy-ps{margin-left:auto;font-size:11px;font-weight:400;color:var(--cy-dim);}
  .cy-pb{padding:14px 16px;}
  .cy-hero{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:18px 20px;}
  .cy-level{font-size:30px;font-weight:800;letter-spacing:.1em;}
  .lvl-normal{color:var(--cy-green);text-shadow:0 0 14px rgba(57,255,136,.5);}
  .lvl-warn{color:var(--cy-amber);text-shadow:0 0 14px rgba(255,185,48,.5);}
  .lvl-critical{color:var(--cy-red);text-shadow:0 0 14px rgba(255,77,109,.55);}
  .cy-led{width:12px;height:12px;border-radius:50%;display:inline-block;animation:cyPulse 1.6s infinite;}
  .cy-led.l-normal{background:var(--cy-green);box-shadow:0 0 10px var(--cy-green);}
  .cy-led.l-warn{background:var(--cy-amber);box-shadow:0 0 10px var(--cy-amber);}
  .cy-led.l-critical{background:var(--cy-red);box-shadow:0 0 10px var(--cy-red);}
  @keyframes cyPulse{0%,100%{opacity:1}50%{opacity:.35}}
  .cy-kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;}
  .cy-kpi{background:var(--cy-bg3);border:1px solid var(--cy-line-soft);border-radius:6px;padding:10px 12px;}
  .cy-kpi.hot{border-color:rgba(255,185,48,.45);}
  .cy-kpi .kl{font-size:11px;color:var(--cy-dim);}
  .cy-kpi .kv{font-size:22px;font-weight:800;color:var(--cy-green);margin-top:2px;}
  .cy-kpi.hot .kv{color:var(--cy-amber);}
  .cy-kpi .ku{font-size:10px;color:var(--cy-dim2);margin-left:4px;font-weight:600;}
  .cy-kpi .ks{font-size:11px;color:var(--cy-dim2);}
  .cy-chart{display:flex;align-items:flex-end;gap:6px;height:130px;padding-top:6px;}
  .cy-bar{flex:1;display:flex;flex-direction:column;align-items:center;height:100%;}
  .cy-bar-stack{flex:1;width:100%;display:flex;flex-direction:column;justify-content:flex-end;}
  .cy-bar-stack .b-info{background:rgba(88,230,255,.55);border-radius:2px 2px 0 0;}
  .cy-bar-stack .b-alert{background:var(--cy-amber);}
  .cy-bar-l{font-size:10px;color:var(--cy-dim2);margin-top:4px;}
  .cy-legend{display:flex;gap:16px;font-size:11px;color:var(--cy-dim);margin-top:8px;}
  .cy-legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:-1px;}
  .cy-alert{border:1px solid var(--cy-line-soft);border-left-width:4px;border-radius:5px;padding:10px 12px;margin-bottom:8px;background:var(--cy-bg3);}
  .cy-alert.lv-critical{border-left-color:var(--cy-red);}
  .cy-alert.lv-warn{border-left-color:var(--cy-amber);}
  .cy-alert.lv-info{border-left-color:var(--cy-cyan);}
  .cy-alert-h{display:flex;align-items:center;gap:8px;}
  .cy-alert-t{font-weight:700;font-size:13px;}
  .cy-alert-b{font-size:12px;color:var(--cy-text);margin-top:5px;line-height:1.7;}
  .cy-alert-a{font-size:12px;color:var(--cy-dim);margin-top:4px;line-height:1.7;}
  .cy-sev{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px;border:1px solid;white-space:nowrap;}
  .sev-info{color:var(--cy-cyan);border-color:rgba(88,230,255,.4);background:rgba(88,230,255,.06);}
  .sev-ok{color:var(--cy-green);border-color:rgba(57,255,136,.4);background:rgba(57,255,136,.06);}
  .sev-warn{color:var(--cy-amber);border-color:rgba(255,185,48,.45);background:rgba(255,185,48,.08);}
  .sev-critical{color:var(--cy-red);border-color:rgba(255,77,109,.5);background:rgba(255,77,109,.1);}
  .cy-empty{font-size:12px;color:var(--cy-dim);padding:10px 4px;}
  .cy-table-wrap{overflow-x:auto;}
  .cy-table{width:100%;border-collapse:collapse;font-size:12px;}
  .cy-table th{text-align:left;font-size:11px;font-weight:600;color:var(--cy-dim);padding:6px 8px;border-bottom:1px solid var(--cy-line);white-space:nowrap;}
  .cy-table td{padding:6px 8px;border-bottom:1px solid var(--cy-line-soft);vertical-align:top;}
  .cy-table tr.mine td{background:rgba(57,255,136,.05);}
  .cy-table .dim,.cy .dim{color:var(--cy-dim2);font-size:11px;}
  .cy-table .warn{color:var(--cy-amber);font-weight:700;}
  .cy-table .nowrap{white-space:nowrap;}
  .cy-table .path{max-width:220px;overflow-wrap:anywhere;color:var(--cy-dim);}
  .cy-tag{font-size:10px;margin-left:6px;padding:1px 6px;border-radius:3px;background:rgba(57,255,136,.12);color:var(--cy-green);}
  .cy-btn{background:rgba(57,255,136,.1);border:1px solid rgba(57,255,136,.4);border-radius:4px;color:var(--cy-green);padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;}
  .cy-btn.ghost{background:transparent;border-color:var(--cy-line);color:var(--cy-dim);}
  .cy-btn.danger{background:rgba(255,77,109,.08);border-color:rgba(255,77,109,.45);color:var(--cy-red);}
  .cy-btn:disabled{opacity:.5;cursor:default;}
  .cy-input,.cy-select{background:var(--cy-bg3);border:1px solid var(--cy-line);border-radius:4px;color:var(--cy-text);padding:5px 8px;font-size:12px;}
  .cy-check{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--cy-line-soft);}
  .cy-check > div{flex:1;}
  .cy-dot{width:9px;height:9px;border-radius:50%;flex:none;}
  .d-ok{background:var(--cy-green);box-shadow:0 0 6px var(--cy-green);}
  .d-warn{background:var(--cy-amber);box-shadow:0 0 6px var(--cy-amber);}
  .d-ng{background:var(--cy-red);box-shadow:0 0 6px var(--cy-red);}
  .cn{font-size:13px;font-weight:700;}
  .cd{font-size:12px;color:var(--cy-dim);line-height:1.7;}
  .cy-row{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
  .cy-maint-banner{background:rgba(255,185,48,.08);border:1px solid rgba(255,185,48,.4);color:var(--cy-amber);border-radius:6px;padding:8px 12px;font-size:12px;font-weight:700;margin-bottom:12px;}
  .sw{position:relative;display:inline-block;width:54px;height:28px;flex:none;}
  .sw input{opacity:0;width:0;height:0;}
  .sw .tr{position:absolute;inset:0;background:#122019;border:1px solid var(--cy-line);border-radius:30px;transition:.25s;cursor:pointer;}
  .sw .tr:before{content:'';position:absolute;width:20px;height:20px;left:3px;top:3px;background:var(--cy-green);border-radius:50%;transition:.25s;}
  .sw input:checked + .tr{background:rgba(255,185,48,.12);border-color:rgba(255,185,48,.5);}
  .sw input:checked + .tr:before{transform:translateX(26px);background:var(--cy-amber);}
  .sw input:disabled + .tr{cursor:default;opacity:.5;}
  .cy-link{color:var(--cy-cyan);font-size:12px;text-decoration:none;}
</style>
<div class="cy">
  <div class="cy-grid">

    <div class="cy-panel">
      <div class="cy-hero">
        <div>
          <div class="mono" style="font-size:10px;letter-spacing:.28em;color:var(--cy-dim);">HOSHIKON // CYBER SECURITY MONITOR</div>
          <div style="display:flex;align-items:center;gap:12px;margin-top:8px;">
            <span class="cy-led l-${threat}"></span>
            <span class="cy-level lvl-${threat}">脅威レベル：${threatLabel}</span>
          </div>
          <div class="cd" style="margin-top:4px;">${threatText}（直近24時間〜7日の検知から自動判定）</div>
        </div>
        <div class="mono" style="text-align:right;font-size:11px;color:var(--cy-dim2);line-height:1.9;">
          <div style="font-size:14px;font-weight:700;color:var(--cy-cyan);">${escHtml(jstNow().slice(0, 16))} 時点</div>
          <div>ログイン中 ${sessions.length}台 ／ アカウント ${accounts.length}件</div>
        </div>
      </div>
    </div>

    ${maintenanceOn ? `<div class="cy-maint-banner" style="margin:0;">メンテナンスモード稼働中 ― admin 以外のアクセスにはメンテナンス画面が表示されています</div>` : ''}

    <div class="cy-panel g7">
      <div class="cy-ph"><span class="mono">ALERTS</span>要確認アラート<span class="cy-ps">${alerts.length}件</span></div>
      <div class="cy-pb">${alertsHtml}</div>
    </div>

    <div class="cy-panel g5">
      <div class="cy-ph"><span class="mono">DETECTIONS</span>検知件数</div>
      <div class="cy-pb">
        <div class="cy-kpis">${kpiHtml}</div>
        <div class="cy-chart" style="margin-top:14px;">${chartHtml}</div>
        <div class="cy-legend"><span><i style="background:rgba(88,230,255,.55);"></i>記録</span><span><i style="background:var(--cy-amber);"></i>注意以上</span><span style="margin-left:auto;">直近14日</span></div>
      </div>
    </div>

    <div class="cy-panel">
      <div class="cy-ph"><span class="mono">SESSIONS</span>ログイン中の端末<span class="cy-ps">見覚えのない端末は強制ログアウトできます</span></div>
      <div class="cy-pb">
        <div class="cy-table-wrap"><table class="cy-table">
          <thead><tr><th>アカウント</th><th>ログイン日時</th><th>IPアドレス</th><th>国 / 回線</th><th>端末 / ブラウザ</th><th></th></tr></thead>
          <tbody>${sessionsHtml}</tbody>
        </table></div>
        <div class="cy-row" style="margin-top:12px;">
          <div class="cd">乗っ取りが疑われるときは「自分以外を全員ログアウト」→ 該当アカウントのパスワード変更（設定 → 管理者項目 → アカウント権限管理）の順で対応してください。<br>この表示より前にログインした端末は、接続元が「—」になります。</div>
          <button type="button" class="cy-btn danger" onclick="revokeOthers(this)">自分以外を全員ログアウト</button>
        </div>
      </div>
    </div>

    <div class="cy-panel g6">
      <div class="cy-ph"><span class="mono">ACCOUNTS</span>アカウント別ログイン状況</div>
      <div class="cy-pb">
        <div class="cy-table-wrap"><table class="cy-table">
          <thead><tr><th>アカウント</th><th>権限</th><th>最終ログイン</th><th>失敗(30日)</th></tr></thead>
          <tbody>${accountsHtml}</tbody>
        </table></div>
        <div class="cd" style="margin-top:8px;">長く使われていないアカウントは、退職・異動者のものなら削除しておくと安全です。<a class="cy-link" href="${ADMIN_PATH}/login-logs">ログイン履歴（位置情報付き）を見る</a></div>
      </div>
    </div>

    <div class="cy-panel g6">
      <div class="cy-ph"><span class="mono">DIAGNOSTICS</span>セキュリティ診断</div>
      <div class="cy-pb">${checkHtml}</div>
    </div>

    <div class="cy-panel">
      <div class="cy-ph"><span class="mono">EVENT LOG</span>検知ログ<span class="cy-ps">最新300件</span></div>
      <div class="cy-pb">
        <form method="get" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
          <select name="type" class="cy-select" onchange="this.form.submit()">${typeOptions}</select>
          <select name="sev" class="cy-select" onchange="this.form.submit()">${sevOptions}</select>
        </form>
        <div class="cy-table-wrap"><table class="cy-table">
          <thead><tr><th>日時</th><th>重要度</th><th>種類</th><th>アカウント</th><th>接続元</th><th>アクセス先</th><th>内容</th></tr></thead>
          <tbody>${logHtml}</tbody>
        </table></div>
      </div>
    </div>

    ${maintenanceHtml}

  </div>
</div>
<script>
  var CY_BASE = ${JSON.stringify(ADMIN_PATH + '/settings/cyber')};
  function cyPost(url, body) {
    return fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); });
  }
  function revokeSession(rid, btn) {
    if (!confirm('この端末を強制ログアウトしますか？')) return;
    btn.disabled = true;
    cyPost(CY_BASE + '/sessions/' + rid + '/revoke').then(function (res) {
      if (!res.ok) { alert(res.j.error || '強制ログアウトに失敗しました'); btn.disabled = false; return; }
      location.reload();
    }).catch(function () { alert('通信エラー'); btn.disabled = false; });
  }
  function revokeOthers(btn) {
    if (!confirm('今使っているこの端末以外の、全アカウント・全端末をログアウトさせます。よろしいですか？')) return;
    btn.disabled = true;
    cyPost(CY_BASE + '/sessions/revoke-others').then(function (res) {
      if (!res.ok) { alert(res.j.error || '処理に失敗しました'); btn.disabled = false; return; }
      alert(res.j.count + '台の端末をログアウトさせました');
      location.reload();
    }).catch(function () { alert('通信エラー'); btn.disabled = false; });
  }
  function setMaintMsg(text) { document.getElementById('maint-msg').textContent = text; }
  function applyMaintState(enabled, active) {
    var st = document.getElementById('maint-state');
    st.textContent = enabled ? 'ON' : 'OFF';
    st.style.color = enabled ? 'var(--cy-amber)' : 'var(--cy-green)';
    document.getElementById('maint-banner').style.display = active ? 'block' : 'none';
  }
  function toggleMaintenance(el) {
    var next = el.checked;
    if (!confirm(next ? 'メンテナンスモードをONにします。admin以外の全員がシステムを使えなくなります。よろしいですか？' : 'メンテナンスモードをOFFにして通常運用に戻します。よろしいですか？')) { el.checked = !next; return; }
    el.disabled = true;
    cyPost(CY_BASE + '/maintenance', { enabled: next }).then(function (res) {
      el.disabled = false;
      if (!res.ok) { el.checked = !next; setMaintMsg(res.j.error || '切替に失敗しました'); return; }
      applyMaintState(res.j.enabled, res.j.active);
      setMaintMsg(next ? 'メンテナンスモードをONにしました' : 'メンテナンスモードをOFFにしました');
    }).catch(function () { el.disabled = false; el.checked = !next; setMaintMsg('通信エラー'); });
  }
  function postMaintenanceSchedule(start, end) {
    cyPost(CY_BASE + '/maintenance/schedule', { start: start, end: end }).then(function (res) {
      if (!res.ok) { setMaintMsg(res.j.error || '保存に失敗しました'); return; }
      applyMaintState(document.getElementById('maint-toggle').checked, res.j.active);
      setMaintMsg(start ? '期間指定を保存しました' : '期間指定をクリアしました');
    }).catch(function () { setMaintMsg('通信エラー'); });
  }
  function saveMaintenanceSchedule() {
    var s = document.getElementById('maint-sch-start').value;
    var e = document.getElementById('maint-sch-end').value;
    if (!s) { setMaintMsg('開始日時を入力してください'); return; }
    if (e && e < s) { setMaintMsg('終了日時は開始日時より後にしてください'); return; }
    postMaintenanceSchedule(s, e || null);
  }
  function clearMaintenanceSchedule() {
    if (!confirm('期間指定をクリアしますか？')) return;
    document.getElementById('maint-sch-start').value = '';
    document.getElementById('maint-sch-end').value = '';
    postMaintenanceSchedule(null, null);
  }
</script>`;

  return c.html(layout('サイバー', html, 'settings'));
});

export default app;
