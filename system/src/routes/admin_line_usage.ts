// LINE利用状況（フル権限adminのみ）
// パス /usage はpermissions.tsのPATH_PERMISSIONSに載せない。
// これにより権限制限アカウント（permissionsがJSON配列のアカウント）はrequiredPermissionKey=null → 403となり、
// permissions=NULLのフル権限adminだけがアクセスできる。サイドバーのdata-nav-id="line-activity"も
// どの権限キーにも該当しないため、制限アカウントのメニューからは自動的に消える。

import { Hono } from 'hono';
import { layout, escHtml } from '../html/layout';
import { ADMIN_PATH } from '../config';
import { ROLE_LABELS, ROLE_COLORS } from './admin_liff';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env }>();

const CHANNEL_LABELS: Record<string, string> = { bot: 'トーク', liff: 'LIFF' };
const CHANNEL_COLORS: Record<string, string> = { bot: '#059669', liff: '#7c3aed' };

function roleBadge(role: string | null): string {
  const r = role ?? 'unknown';
  const label = ROLE_LABELS[r] ?? r;
  const color = ROLE_COLORS[r] ?? '#9ca3af';
  return `<span style="background:${color};color:white;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;white-space:nowrap;">${escHtml(label)}</span>`;
}

function channelBadge(channel: string): string {
  const label = CHANNEL_LABELS[channel] ?? channel;
  const color = CHANNEL_COLORS[channel] ?? '#6b7280';
  return `<span style="background:${color}18;color:${color};border:1px solid ${color}40;padding:1px 7px;border-radius:9px;font-size:10px;font-weight:600;white-space:nowrap;">${escHtml(label)}</span>`;
}

function statCard(value: string, label: string, color: string = '#1e3a5f'): string {
  return `<div style="background:white;border-radius:10px;padding:14px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.08);display:flex;flex-direction:column;align-items:center;gap:4px;">
    <div style="font-size:22px;font-weight:700;color:${color};">${value}</div>
    <div style="font-size:12px;color:#6b7280;text-align:center;">${escHtml(label)}</div>
  </div>`;
}

// 相対表示（"3時間前" 等）。created_atはDBのlocaltime基準なのでSQL側で秒差を出して渡す
function agoLabel(diffSec: number | null): string {
  if (diffSec == null) return '—';
  if (diffSec < 60) return 'たった今';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}時間前`;
  return `${Math.floor(diffSec / 86400)}日前`;
}

// ===================================================
// GET /usage — 利用状況一覧
// ===================================================
app.get('/usage', async (c) => {
  const db = c.env.DB;

  // 全体統計
  const overall = await db.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN date(created_at) = date('now','localtime') THEN line_uid END) AS today_users,
      COUNT(DISTINCT CASE WHEN created_at >= datetime('now','localtime','-7 days') THEN line_uid END) AS week_users,
      COUNT(DISTINCT CASE WHEN created_at >= datetime('now','localtime','-30 days') THEN line_uid END) AS month_users,
      SUM(CASE WHEN created_at >= datetime('now','localtime','-30 days') THEN 1 ELSE 0 END) AS month_events
    FROM line_activity_logs
  `).first<{ today_users: number; week_users: number; month_users: number; month_events: number | null }>();

  // ユーザー別集計（連携中ユーザーが母集団。ログゼロも表示する）
  const users = await db.prepare(`
    SELECT u.line_uid, u.name, u.role, u.created_at AS registered_at,
           e.emp_no, e.division, e.team,
           s.total_cnt, s.cnt7, s.cnt30, s.today_cnt, s.last_at,
           CAST(strftime('%s', datetime('now','localtime')) AS INTEGER) - CAST(strftime('%s', s.last_at) AS INTEGER) AS last_diff_sec
    FROM line_liff_users u
    LEFT JOIN employees e ON e.id = u.emp_id
    LEFT JOIN (
      SELECT line_uid,
        COUNT(*) AS total_cnt,
        SUM(CASE WHEN created_at >= datetime('now','localtime','-7 days') THEN 1 ELSE 0 END) AS cnt7,
        SUM(CASE WHEN created_at >= datetime('now','localtime','-30 days') THEN 1 ELSE 0 END) AS cnt30,
        SUM(CASE WHEN date(created_at) = date('now','localtime') THEN 1 ELSE 0 END) AS today_cnt,
        MAX(created_at) AS last_at
      FROM line_activity_logs GROUP BY line_uid
    ) s ON s.line_uid = u.line_uid
    ORDER BY (s.last_at IS NULL), s.last_at DESC, u.created_at DESC
  `).all<{
    line_uid: string; name: string | null; role: string; registered_at: string;
    emp_no: string | null; division: number | null; team: number | null;
    total_cnt: number | null; cnt7: number | null; cnt30: number | null;
    today_cnt: number | null; last_at: string | null; last_diff_sec: number | null;
  }>();

  // ユーザー×機能の上位（直近30日）→ JS側でユーザーごとの最多機能を出す
  const featureRows = await db.prepare(`
    SELECT line_uid, feature, COUNT(*) AS cnt
    FROM line_activity_logs
    WHERE created_at >= datetime('now','localtime','-30 days') AND feature IS NOT NULL
    GROUP BY line_uid, feature
  `).all<{ line_uid: string; feature: string; cnt: number }>();

  const topFeature = new Map<string, { feature: string; cnt: number }>();
  for (const r of (featureRows.results ?? [])) {
    const cur = topFeature.get(r.line_uid);
    if (!cur || r.cnt > cur.cnt) topFeature.set(r.line_uid, { feature: r.feature, cnt: r.cnt });
  }

  // 連携解除済みだがログが残っているUID
  const orphans = await db.prepare(`
    SELECT l.line_uid,
      COUNT(*) AS total_cnt,
      MAX(l.created_at) AS last_at
    FROM line_activity_logs l
    LEFT JOIN line_liff_users u ON u.line_uid = l.line_uid
    WHERE u.id IS NULL
    GROUP BY l.line_uid
    ORDER BY last_at DESC
    LIMIT 50
  `).all<{ line_uid: string; total_cnt: number; last_at: string }>();

  const all = users.results ?? [];
  const linkedCount = all.length;

  const rows = all.map(u => {
    const empInfo = u.division ? `${u.division}課${u.team ? u.team + '班' : ''} / ${u.emp_no ?? ''}` : (u.emp_no ?? '');
    const top = topFeature.get(u.line_uid);
    const detailUrl = `${ADMIN_PATH}/usage/user?uid=${encodeURIComponent(u.line_uid)}`;
    const inactive = (u.cnt30 ?? 0) === 0;
    return `<tr style="${inactive ? 'opacity:0.55;' : ''}">
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <a href="${detailUrl}" style="font-size:14px;font-weight:600;color:#1d4ed8;text-decoration:none;">${escHtml(u.name || '（名前未設定）')}</a>
        ${empInfo ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${escHtml(empInfo)}</div>` : ''}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">${roleBadge(u.role)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">
        <div style="font-size:13px;color:#111827;">${agoLabel(u.last_diff_sec)}</div>
        ${u.last_at ? `<div style="font-size:11px;color:#9ca3af;">${escHtml(u.last_at.slice(0, 16))}</div>` : ''}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;">${u.today_cnt ?? 0}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;">${u.cnt7 ?? 0}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;">${u.cnt30 ?? 0}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;font-weight:600;">${u.total_cnt ?? 0}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;">
        ${top ? `${escHtml(top.feature)} <span style="color:#9ca3af;">(${top.cnt})</span>` : '—'}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <a href="${detailUrl}" style="padding:4px 10px;background:#1e3a5f;color:white;border-radius:4px;font-size:11px;text-decoration:none;white-space:nowrap;">詳細</a>
      </td>
    </tr>`;
  }).join('');

  const orphanRows = (orphans.results ?? []).map(o => `<tr style="opacity:0.7;">
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;font-family:monospace;color:#6b7280;">${escHtml(o.line_uid.slice(0, 16))}…</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escHtml(o.last_at.slice(0, 16))}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:12px;">${o.total_cnt}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <a href="${ADMIN_PATH}/usage/user?uid=${encodeURIComponent(o.line_uid)}" style="font-size:11px;color:#1d4ed8;">詳細</a>
      </td>
    </tr>`).join('');

  const content = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
      <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;margin:0;">LINE利用状況</h2>
      <div style="font-size:11px;color:#9ca3af;">記録開始以降のトーク・LIFF操作を集計（adminアカウント専用ページ）</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:20px;">
      ${statCard(String(linkedCount), '連携ユーザー', '#1e3a5f')}
      ${statCard(String(overall?.today_users ?? 0), '本日アクティブ', '#059669')}
      ${statCard(String(overall?.week_users ?? 0), '7日間アクティブ', '#0891b2')}
      ${statCard(String(overall?.month_users ?? 0), '30日間アクティブ', '#7c3aed')}
      ${statCard(String(overall?.month_events ?? 0), '30日間の操作数', '#d97706')}
    </div>

    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="padding:14px 20px;border-bottom:1px solid #f3f4f6;">
        <span style="font-size:15px;font-weight:700;color:#1e3a5f;">ユーザー別利用状況（${linkedCount}名・最終利用順）</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:820px;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">氏名</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">権限</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">最終利用</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;">本日</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;">7日</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;">30日</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;">累計</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">よく使う機能(30日)</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="9" style="padding:24px;text-align:center;color:#9ca3af;">連携ユーザーがいません</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    ${orphanRows ? `
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;margin-top:20px;">
      <div style="padding:12px 20px;border-bottom:1px solid #f3f4f6;">
        <span style="font-size:13px;font-weight:700;color:#6b7280;">連携解除済みユーザーの過去ログ</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:500px;">
          <thead style="background:#f9fafb;"><tr>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">LINE UID</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">最終利用</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;">累計</th>
            <th style="padding:8px 12px;"></th>
          </tr></thead>
          <tbody>${orphanRows}</tbody>
        </table>
      </div>
    </div>` : ''}
  `;

  return c.html(layout('LINE利用状況', content, 'line-activity'));
});

// ===================================================
// GET /usage/user?uid=xxx — ユーザー別詳細
// ===================================================
app.get('/usage/user', async (c) => {
  const uid = c.req.query('uid') ?? '';
  if (!uid) return c.redirect(`${ADMIN_PATH}/usage`);
  const db = c.env.DB;

  const user = await db.prepare(`
    SELECT u.line_uid, u.name, u.role, u.created_at AS registered_at,
           e.emp_no, e.name AS emp_name, e.division, e.team
    FROM line_liff_users u
    LEFT JOIN employees e ON e.id = u.emp_id
    WHERE u.line_uid = ?
  `).bind(uid).first<{
    line_uid: string; name: string | null; role: string; registered_at: string;
    emp_no: string | null; emp_name: string | null; division: number | null; team: number | null;
  }>();

  const stats = await db.prepare(`
    SELECT COUNT(*) AS total_cnt,
      SUM(CASE WHEN created_at >= datetime('now','localtime','-30 days') THEN 1 ELSE 0 END) AS cnt30,
      SUM(CASE WHEN created_at >= datetime('now','localtime','-7 days') THEN 1 ELSE 0 END) AS cnt7,
      SUM(CASE WHEN date(created_at) = date('now','localtime') THEN 1 ELSE 0 END) AS today_cnt,
      MAX(created_at) AS last_at
    FROM line_activity_logs WHERE line_uid = ?
  `).bind(uid).first<{ total_cnt: number; cnt30: number | null; cnt7: number | null; today_cnt: number | null; last_at: string | null }>();

  const features = await db.prepare(`
    SELECT feature, COUNT(*) AS cnt,
      SUM(CASE WHEN created_at >= datetime('now','localtime','-30 days') THEN 1 ELSE 0 END) AS cnt30,
      MAX(created_at) AS last_at
    FROM line_activity_logs
    WHERE line_uid = ? AND feature IS NOT NULL
    GROUP BY feature ORDER BY cnt DESC
  `).bind(uid).all<{ feature: string; cnt: number; cnt30: number; last_at: string }>();

  const daily = await db.prepare(`
    SELECT date(created_at) AS d, COUNT(*) AS cnt
    FROM line_activity_logs
    WHERE line_uid = ? AND created_at >= datetime('now','localtime','-14 days')
    GROUP BY d ORDER BY d DESC
  `).bind(uid).all<{ d: string; cnt: number }>();

  const logs = await db.prepare(`
    SELECT channel, event_type, feature, detail, created_at
    FROM line_activity_logs
    WHERE line_uid = ?
    ORDER BY id DESC LIMIT 100
  `).bind(uid).all<{ channel: string; event_type: string; feature: string | null; detail: string | null; created_at: string }>();

  const name = user?.name || user?.emp_name || '（連携解除済みユーザー）';
  const empInfo = user?.division ? `${user.division}課${user.team ? user.team + '班' : ''} / ${user.emp_no ?? ''}` : (user?.emp_no ?? '');

  const featRows = (features.results ?? []).map(f => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(f.feature)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;">${f.cnt30}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;font-weight:600;">${f.cnt}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap;">${escHtml(f.last_at.slice(0, 16))}</td>
    </tr>`).join('');

  const maxDaily = Math.max(1, ...(daily.results ?? []).map(d => d.cnt));
  const dailyRows = (daily.results ?? []).map(d => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
      <div style="width:80px;font-size:12px;color:#6b7280;flex-shrink:0;">${escHtml(d.d.slice(5))}</div>
      <div style="flex:1;background:#f3f4f6;border-radius:4px;height:16px;overflow:hidden;">
        <div style="width:${Math.round(d.cnt / maxDaily * 100)}%;height:100%;background:#2563eb;border-radius:4px;"></div>
      </div>
      <div style="width:40px;text-align:right;font-size:12px;font-weight:600;">${d.cnt}</div>
    </div>`).join('');

  const logRows = (logs.results ?? []).map(l => `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap;">${escHtml(l.created_at.slice(0, 16))}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">${channelBadge(l.channel)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;white-space:nowrap;">${escHtml(l.feature ?? '—')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(l.detail ?? '')}">${escHtml(l.detail ?? '')}</td>
    </tr>`).join('');

  const content = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
      <a href="${ADMIN_PATH}/usage" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 一覧に戻る</a>
      <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;margin:0;">${escHtml(name)} さんの利用状況</h2>
      ${user ? roleBadge(user.role) : ''}
      ${empInfo ? `<span style="font-size:12px;color:#6b7280;">${escHtml(empInfo)}</span>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px;">
      ${statCard(String(stats?.today_cnt ?? 0), '本日', '#059669')}
      ${statCard(String(stats?.cnt7 ?? 0), '7日間', '#0891b2')}
      ${statCard(String(stats?.cnt30 ?? 0), '30日間', '#7c3aed')}
      ${statCard(String(stats?.total_cnt ?? 0), '累計', '#1e3a5f')}
      ${statCard(stats?.last_at ? escHtml(stats.last_at.slice(5, 16)) : '—', '最終利用', '#d97706')}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;" class="usage-grid">
      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
        <div style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:700;color:#1e3a5f;">機能別の利用回数</div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;">
            <thead style="background:#f9fafb;"><tr>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">機能</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;">30日</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;">累計</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">最終利用</th>
            </tr></thead>
            <tbody>${featRows || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#9ca3af;">まだ利用記録がありません</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:12px 20px 16px;">
        <div style="font-size:14px;font-weight:700;color:#1e3a5f;padding-bottom:10px;border-bottom:1px solid #f3f4f6;margin-bottom:12px;">日別の操作数（直近14日）</div>
        ${dailyRows || '<div style="padding:12px;text-align:center;color:#9ca3af;font-size:13px;">直近14日の利用はありません</div>'}
      </div>
    </div>
    <style>@media (max-width: 900px) { .usage-grid { grid-template-columns: 1fr !important; } }</style>

    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="padding:12px 20px;border-bottom:1px solid #f3f4f6;font-size:14px;font-weight:700;color:#1e3a5f;">利用履歴（直近100件）</div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:600px;">
          <thead style="background:#f9fafb;"><tr>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">日時</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">経路</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">機能</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">内容</th>
          </tr></thead>
          <tbody>${logRows || '<tr><td colspan="4" style="padding:24px;text-align:center;color:#9ca3af;">利用記録がありません</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  `;

  return c.html(layout('LINE利用状況', content, 'line-activity'));
});

export default app;
