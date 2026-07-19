// LINE LIFF 権限管理・報告一覧 の管理者ページ

import { Hono } from 'hono';
import type { Context } from 'hono';
import { layout, escHtml, safeJson } from '../html/layout';
import { ADMIN_PATH } from '../config';
import { getSessionFromCookie, validateSession } from '../auth';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env }>();

export const ROLE_LABELS: Record<string, string> = {
  general_manager:     '統括管理者',
  operations_manager:  '運行管理者',
  vehicle_manager:     '車番管理者',
  newcomer:            '新人',
  benten_shift_master: 'ベンテンシフトマスター',
  benten_member:       'ベンテンクラブ会員',
  crew_member:         '乗務社員',
  unknown:             '権限不明者',
};

export const ROLE_COLORS: Record<string, string> = {
  general_manager:     '#1e3a5f',
  operations_manager:  '#065f46',
  vehicle_manager:     '#7c3aed',
  newcomer:            '#1d4ed8',
  benten_shift_master: '#b45309',
  benten_member:       '#0891b2',
  crew_member:         '#d97706',
  unknown:             '#9ca3af',
};

function subHeader(title: string): string {
  return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 設定に戻る</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;margin:0;">${escHtml(title)}</h2>
  </div>`;
}

// ログイン中の管理者名を取得（報告の「対応者」記録用）
async function getAdminName(c: { req: { header: (n: string) => string | undefined }; env: Env }): Promise<string> {
  const cookie = c.req.header('Cookie') ?? null;
  const sid = getSessionFromCookie(cookie);
  const adminId = sid ? await validateSession(c.env.DB, sid) : null;
  const adminRow = adminId
    ? await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(adminId).first<{ username: string }>()
    : null;
  return adminRow?.username ?? '管理者';
}

// 忘れ物・事故・違反 共通のタブナビ（権限のないタブは data-perm-key で自動的に非表示になる）
function reportTabs(active: 'lost' | 'accident' | 'violation'): string {
  const tabs = [
    { key: 'lost',      href: `${ADMIN_PATH}/settings/lost-items`, perm: 'settings.lost-items', label: '忘れ物' },
    { key: 'accident',  href: `${ADMIN_PATH}/settings/accidents`,  perm: 'settings.accidents',  label: '事故' },
    { key: 'violation', href: `${ADMIN_PATH}/settings/violations`, perm: 'settings.violations', label: '違反' },
  ];
  return `<div style="display:flex;gap:0;margin-bottom:16px;border-bottom:2px solid #e5e7eb;">
    ${tabs.map(t => `<a href="${t.href}" data-perm-key="${t.perm}" style="padding:8px 20px;font-size:14px;text-decoration:none;font-weight:600;margin-bottom:-2px;${t.key === active
      ? 'color:#1e3a5f;border-bottom:2px solid #1e3a5f;'
      : 'color:#9ca3af;border-bottom:2px solid transparent;'}">${escHtml(t.label)}</a>`).join('')}
  </div>`;
}

// 状態セルのHTML（resolvedLabel: 忘れ物・事故=解決済 / 違反=対応済）
function statusCellHtml(resolved: boolean, resolvedLabel: string): string {
  const label = resolved ? resolvedLabel : '対応中';
  const color = resolved ? '#059669' : '#d97706';
  return `<span style="color:${color};font-size:12px;font-weight:600;">${label}</span>`;
}

// 対応者セルのHTML（誰が・いつ対応したか）
function resolverCellHtml(resolvedByName: string | null, resolvedAt: string | null): string {
  if (!resolvedByName) return '<span style="color:#d1d5db;font-size:12px;">—</span>';
  return `<span style="color:#059669;font-size:12px;font-weight:600;">${escHtml(resolvedByName)}</span>
    ${resolvedAt ? `<div style="font-size:11px;color:#9ca3af;margin-top:1px;">${escHtml(resolvedAt.slice(5, 16))}</div>` : ''}`;
}

// 行内で状態切替・削除・履歴表示を行う共通スクリプト（ページ再読み込みなしで行だけ更新する）
function reportRowScript(apiPath: string, deleteLabel: string, resolvedLabel: string): string {
  return `
    var ADMIN_PATH = ${safeJson(ADMIN_PATH)};
    async function toggleReportStatus(id, btn) {
      var current = btn.dataset.status;
      var next = current === 'resolved' ? 'open' : 'resolved';
      var res = await fetch(ADMIN_PATH + '${apiPath}/' + id + '/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) { alert('更新に失敗しました'); return; }
      var j = await res.json().catch(function(){ return {}; });
      var name = j.adminName || '管理者';
      btn.dataset.status = next;
      btn.textContent = next === 'resolved' ? '再開' : '${resolvedLabel}にする';
      var st = document.getElementById('st-' + id);
      if (st) {
        st.innerHTML = next === 'resolved'
          ? '<span style="color:#059669;font-size:12px;font-weight:600;">${resolvedLabel}</span>'
          : '<span style="color:#d97706;font-size:12px;font-weight:600;">対応中</span>';
      }
      var rc = document.getElementById('res-' + id);
      if (rc) {
        rc.innerHTML = '';
        var span = document.createElement('span');
        if (next === 'resolved') {
          span.style.cssText = 'color:#059669;font-size:12px;font-weight:600;';
          span.textContent = name;
        } else {
          span.style.cssText = 'color:#d1d5db;font-size:12px;';
          span.textContent = '—';
        }
        rc.appendChild(span);
      }
    }
    async function deleteReport(id, label) {
      if (!confirm('この${deleteLabel}を削除しますか？\\n「' + label + '」\\n※削除しても「誰がいつ削除したか」は履歴に残ります')) return;
      var res = await fetch(ADMIN_PATH + '${apiPath}/' + id, { method: 'DELETE' });
      if (!res.ok) { alert('削除に失敗しました'); return; }
      var row = document.getElementById('report-row-' + id);
      if (row) row.remove();
      var cnt = document.getElementById('report-count');
      if (cnt) cnt.textContent = '報告 ' + Math.max(0, parseInt(cnt.textContent.replace(/[^0-9]/g, '') || '1') - 1) + '件';
    }
    function escLog(s) {
      return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    async function showReportLogs(id) {
      var res = await fetch(ADMIN_PATH + '${apiPath}/' + id + '/logs');
      if (!res.ok) { alert('履歴の取得に失敗しました'); return; }
      var j = await res.json();
      var logs = j.logs || [];
      var body = document.getElementById('report-log-body');
      if (logs.length === 0) {
        body.innerHTML = '<div style="color:#9ca3af;font-size:13px;padding:12px 0;">まだ履歴がありません（履歴の記録開始前の操作は残っていません）</div>';
      } else {
        body.innerHTML = logs.map(function(l) {
          return '<div style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:13px;">'
            + '<span style="color:#9ca3af;font-size:11px;">' + escLog(l.created_at) + '</span><br>'
            + '<strong>' + escLog(l.admin_name) + '</strong> さんが ' + escLog(l.action_label)
            + (l.summary ? '<div style="font-size:11px;color:#6b7280;margin-top:1px;">対象: ' + escLog(l.summary) + '</div>' : '')
            + '</div>';
        }).join('');
      }
      document.getElementById('report-log-modal').style.display = 'flex';
    }
    function closeReportLogs() { document.getElementById('report-log-modal').style.display = 'none'; }`;
}

// 履歴モーダル（各報告一覧ページ共通）
function reportLogModalHtml(): string {
  return `
  <div id="report-log-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:16px;" onclick="if(event.target===this)closeReportLogs()">
    <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:440px;max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;margin:0;">対応履歴</h3>
        <button onclick="closeReportLogs()" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
      </div>
      <div id="report-log-body"></div>
    </div>
  </div>`;
}

// ===================================================
// GET /settings/liff — LIFF権限管理ページ
// ===================================================
app.get('/settings/liff', async (c) => {
  const users = await c.env.DB.prepare(`
    SELECT u.id, u.line_uid, u.name, u.role, u.emp_id, u.created_at, u.updated_at,
           e.emp_no, e.division, e.team
    FROM line_liff_users u
    LEFT JOIN employees e ON u.emp_id = e.id
    ORDER BY
      CASE u.role
        WHEN 'general_manager' THEN 1
        WHEN 'operations_manager' THEN 2
        WHEN 'vehicle_manager' THEN 3
        WHEN 'newcomer' THEN 4
        WHEN 'benten_shift_master' THEN 5
        WHEN 'benten_member' THEN 6
        ELSE 7
      END, u.created_at DESC
  `).all<{
    id: number; line_uid: string; name: string; role: string;
    emp_id: number | null; created_at: string; updated_at: string;
    emp_no: string | null; division: number | null; team: number | null;
  }>();

  const all = users.results ?? [];

  // 統計
  const stats: Record<string, number> = {};
  for (const u of all) { stats[u.role] = (stats[u.role] ?? 0) + 1; }

  const statCards = Object.entries(ROLE_LABELS).map(([role, label]) => {
    const count = stats[role] ?? 0;
    const color = ROLE_COLORS[role];
    return `<div style="background:white;border-radius:10px;padding:14px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.08);display:flex;flex-direction:column;align-items:center;gap:4px;">
      <div style="font-size:22px;font-weight:700;color:${color};">${count}</div>
      <div style="font-size:12px;color:#6b7280;">${escHtml(label)}</div>
    </div>`;
  }).join('');

  const rows = all.map(u => {
    const role = u.role ?? 'unknown';
    const label = ROLE_LABELS[role] ?? role;
    const color = ROLE_COLORS[role] ?? '#9ca3af';
    const empInfo = u.division ? `${u.division}課${u.team ? u.team + '班' : ''} / ${u.emp_no ?? ''}` : (u.emp_no ?? '');
    const options = Object.entries(ROLE_LABELS).map(([r, l]) =>
      `<option value="${r}" ${r === role ? 'selected' : ''}>${escHtml(l)}</option>`
    ).join('');
    return `<tr id="row-${u.id}">
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <div style="font-size:14px;font-weight:600;color:#111827;">${escHtml(u.name ?? '（名前未設定）')}</div>
        ${empInfo ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${escHtml(empInfo)}</div>` : ''}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;font-family:monospace;color:#9ca3af;">
        ${escHtml(u.line_uid.slice(0, 12))}…
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <span style="background:${color};color:white;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600;">${escHtml(label)}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <div style="display:flex;gap:8px;align-items:center;">
          <select id="role-sel-${u.id}" style="border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:13px;background:white;">
            ${options}
          </select>
          <button onclick="changeRole(${u.id})"
            style="padding:5px 10px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;">変更</button>
        </div>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#9ca3af;white-space:nowrap;">
        ${escHtml(u.created_at.slice(0, 10))}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <button onclick="deleteUser(${u.id},'${escHtml(u.name ?? '')}')"
          style="padding:4px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;">削除</button>
      </td>
    </tr>`;
  }).join('');

  const content = `
    ${subHeader('LINEリフ 権限管理')}

    <!-- 統計カード -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:10px;margin-bottom:20px;">
      ${statCards}
    </div>

    <!-- 登録方法ガイド -->
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:#1e40af;">
      <div style="font-weight:700;margin-bottom:8px;">登録コマンド（LINEで送信）</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
        <div><strong>「統括管理者登録」</strong><br><span style="font-size:11px;color:#3b82f6;">→ パスワード入力 → 登録</span></div>
        <div><strong>「運行管理者登録」</strong><br><span style="font-size:11px;color:#3b82f6;">→ パスワード入力 → 登録</span></div>
        <div><strong>「車番連携」</strong><br><span style="font-size:11px;color:#3b82f6;">→ パスワード入力 → 登録</span></div>
        <div><strong>「ベンテン会員登録」</strong><br><span style="font-size:11px;color:#3b82f6;">→ パスワード入力 → 登録</span></div>
        <div><strong>「シフトマスター登録」</strong><br><span style="font-size:11px;color:#3b82f6;">→ パスワード入力 → 登録</span></div>
      </div>
      <div style="margin-top:8px;font-size:11px;color:#6b7280;">※各パスワードは <code>wrangler secret put</code> で設定してください</div>
    </div>

    <!-- ユーザー一覧 -->
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="padding:14px 20px;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:15px;font-weight:700;color:#1e3a5f;">登録ユーザー（${all.length}名）</div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:600px;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">氏名</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">LINE UID</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">現在の権限</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">権限変更</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">登録日</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;">登録ユーザーがいません</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <script>
    const ADMIN_PATH = '${ADMIN_PATH}';
    async function changeRole(id) {
      const sel = document.getElementById('role-sel-' + id);
      const role = sel.value;
      const res = await fetch(ADMIN_PATH + '/api/liff-users/' + id + '/role', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (res.ok) { location.reload(); }
      else { alert('変更に失敗しました'); }
    }
    async function deleteUser(id, name) {
      if (!confirm(name + ' を削除しますか？\\nLINE連携が解除されます。')) return;
      const res = await fetch(ADMIN_PATH + '/api/liff-users/' + id, { method: 'DELETE' });
      if (res.ok) { location.reload(); }
      else { alert('削除に失敗しました'); }
    }
    </script>
  `;

  return c.html(layout('LINEリフ権限管理', content, 'settings'));
});

// ===================================================
// GET /settings/lost-items — 忘れ物報告一覧
// ===================================================
app.get('/settings/lost-items', async (c) => {
  const typeFilter = c.req.query('type') ?? '';
  const statusFilter = c.req.query('status') ?? '';

  let where = 'WHERE 1=1';
  const binds: string[] = [];
  if (typeFilter === 'staff' || typeFilter === 'customer') {
    where += ' AND r.report_type = ?'; binds.push(typeFilter);
  }
  if (statusFilter === 'open' || statusFilter === 'resolved') {
    where += ' AND r.status = ?'; binds.push(statusFilter);
  }

  const reports = await c.env.DB.prepare(
    `SELECT r.*, u.name AS reporter_name
     FROM lost_item_reports r
     LEFT JOIN line_liff_users u ON u.line_uid = r.reported_by_uid
     ${where} ORDER BY r.created_at DESC LIMIT 200`
  ).bind(...binds).all<{
    id: number; report_type: string; received_at: string | null;
    vehicle_no: string | null; employee_name: string | null;
    employee_division: number | null; employee_team: number | null;
    item_description: string | null; pickup_location: string | null; dropoff_location: string | null;
    customer_name: string | null; customer_phone: string | null; return_method: string | null;
    notes: string | null; status: string; created_at: string;
    resolved_by_name: string | null; resolved_at: string | null;
    reporter_name: string | null;
  }>();

  const all = reports.results ?? [];

  const rows = all.map(r => {
    const isCustomer = r.report_type === 'customer';
    const typeLabel = isCustomer ? '客問い合わせ' : '社員報告';
    const typeColor = isCustomer ? '#7c3aed' : '#1d4ed8';
    const empStr = r.employee_name
      ? `${r.employee_division ? r.employee_division + '課' : ''}${r.employee_team ? r.employee_team + '班' : ''} ${r.employee_name}`
      : '—';
    return `<tr id="report-row-${r.id}">
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap;">${escHtml(r.created_at.slice(0, 16))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <span style="background:${typeColor};color:white;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${escHtml(typeLabel)}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(r.received_at ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(r.vehicle_no ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(empStr)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(r.item_description ?? '')}">${escHtml(r.item_description ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;">${escHtml(r.reporter_name ?? '—')}</td>
      <td id="st-${r.id}" style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        ${statusCellHtml(r.status === 'resolved', '解決済')}
      </td>
      <td id="res-${r.id}" style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        ${resolverCellHtml(r.resolved_by_name, r.resolved_at)}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">
        <button onclick="toggleReportStatus(${r.id},this)" data-status="${r.status}"
          style="padding:3px 8px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:4px;font-size:11px;cursor:pointer;">
          ${r.status === 'resolved' ? '再開' : '解決済にする'}
        </button>
        <button onclick="showReportLogs(${r.id})"
          style="padding:3px 8px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">履歴</button>
        <button onclick="deleteReport(${r.id},'${escHtml((r.item_description ?? '').slice(0, 20))}')"
          style="padding:3px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">削除</button>
      </td>
    </tr>`;
  }).join('');

  const buildUrl = (t: string, s: string) =>
    `${ADMIN_PATH}/settings/lost-items?type=${t}&status=${s}`;

  const filterBtn = (label: string, t: string, s: string) => {
    const active = typeFilter === t && statusFilter === s;
    return `<a href="${buildUrl(t, s)}" style="padding:6px 14px;border-radius:20px;font-size:13px;text-decoration:none;font-weight:600;
      ${active ? 'background:#1e3a5f;color:white;' : 'background:white;color:#374151;border:1px solid #d1d5db;'}">${escHtml(label)}</a>`;
  };

  const content = `
    ${subHeader('報告センター')}
    ${reportTabs('lost')}

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;align-items:center;">
      ${filterBtn('すべて', '', '')}
      ${filterBtn('社員報告', 'staff', '')}
      ${filterBtn('客問い合わせ', 'customer', '')}
      ${filterBtn('対応中', '', 'open')}
      ${filterBtn('解決済', '', 'resolved')}
    </div>

    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="padding:14px 20px;border-bottom:1px solid #f3f4f6;">
        <span id="report-count" style="font-size:15px;font-weight:700;color:#1e3a5f;">報告 ${all.length}件</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:700px;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">登録日時</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">種別</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">受電</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">車番</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">乗務員</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">忘れ物</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">報告者</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">状態</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">対応者</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="10" style="padding:24px;text-align:center;color:#9ca3af;">報告がありません</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    ${reportLogModalHtml()}
    <script>
    ${reportRowScript('/api/liff/lost-items', '忘れ物報告', '解決済')}
    </script>
  `;

  return c.html(layout('忘れ物報告一覧', content, 'settings'));
});

// ===================================================
// GET /settings/accidents — 事故報告一覧
// ===================================================
app.get('/settings/accidents', async (c) => {
  const statusFilter = c.req.query('status') ?? '';

  let where = '';
  const binds: string[] = [];
  if (statusFilter === 'open' || statusFilter === 'resolved') {
    where = 'WHERE r.status = ?'; binds.push(statusFilter);
  }

  const reports = await c.env.DB.prepare(`
    SELECT r.*, u.name AS reporter_name
    FROM accident_reports r
    LEFT JOIN line_liff_users u ON u.line_uid = r.reported_by_uid
    ${where} ORDER BY r.created_at DESC LIMIT 200
  `).bind(...binds).all<{
    id: number; received_at: string | null; vehicle_no: string | null;
    employee_name: string | null; employee_division: number | null; employee_team: number | null;
    accident_type: string | null; location: string | null; car_status: string | null;
    summary_text: string | null; status: string; created_at: string;
    resolved_by_name: string | null; resolved_at: string | null;
    reporter_name: string | null;
  }>();

  const all = reports.results ?? [];

  const rows = all.map(r => {
    const empStr = r.employee_name
      ? `${r.employee_division ? r.employee_division + '課' : ''}${r.employee_team ? r.employee_team + '班' : ''} ${r.employee_name}`
      : '—';
    return `<tr id="report-row-${r.id}">
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap;">${escHtml(r.created_at.slice(0, 16))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(r.received_at ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(r.vehicle_no ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(empStr)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(r.accident_type ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(r.location ?? '')}">${escHtml(r.location ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escHtml(r.car_status ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;">${escHtml(r.reporter_name ?? '—')}</td>
      <td id="st-${r.id}" style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        ${statusCellHtml(r.status === 'resolved', '解決済')}
      </td>
      <td id="res-${r.id}" style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        ${resolverCellHtml(r.resolved_by_name, r.resolved_at)}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">
        <button onclick="toggleReportStatus(${r.id},this)" data-status="${r.status}"
          style="padding:3px 8px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:4px;font-size:11px;cursor:pointer;">
          ${r.status === 'resolved' ? '再開' : '解決済にする'}
        </button>
        <button onclick="showReportLogs(${r.id})"
          style="padding:3px 8px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">履歴</button>
        <button onclick="deleteReport(${r.id},'${escHtml((r.vehicle_no ?? '車番不明') + (r.accident_type ? ' / ' + r.accident_type : ''))}')"
          style="padding:3px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">削除</button>
      </td>
    </tr>`;
  }).join('');

  const filterBtn = (label: string, s: string) => {
    const active = statusFilter === s;
    return `<a href="${ADMIN_PATH}/settings/accidents?status=${s}" style="padding:6px 14px;border-radius:20px;font-size:13px;text-decoration:none;font-weight:600;
      ${active ? 'background:#1e3a5f;color:white;' : 'background:white;color:#374151;border:1px solid #d1d5db;'}">${escHtml(label)}</a>`;
  };

  const content = `
    ${subHeader('報告センター')}
    ${reportTabs('accident')}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;align-items:center;">
      ${filterBtn('すべて', '')}
      ${filterBtn('対応中', 'open')}
      ${filterBtn('解決済', 'resolved')}
    </div>
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="padding:14px 20px;border-bottom:1px solid #f3f4f6;">
        <span id="report-count" style="font-size:15px;font-weight:700;color:#1e3a5f;">報告 ${all.length}件</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:800px;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">登録日時</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">受電</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">車番</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">乗務員</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">事故形態</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">場所</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">状態</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">報告者</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">進捗</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">対応者</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="11" style="padding:24px;text-align:center;color:#9ca3af;">報告がありません</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    ${reportLogModalHtml()}
    <script>
    ${reportRowScript('/api/liff/accident-reports', '事故報告', '解決済')}
    </script>
  `;

  return c.html(layout('事故報告一覧', content, 'settings'));
});

// ===================================================
// GET /settings/violations — 違反報告一覧ページ
// ===================================================
app.get('/settings/violations', async (c) => {
  const statusFilter = c.req.query('status') ?? '';

  let where = '';
  const binds: string[] = [];
  if (statusFilter === 'open' || statusFilter === 'resolved') {
    where = 'WHERE r.status = ?'; binds.push(statusFilter);
  }

  const reports = await c.env.DB.prepare(`
    SELECT r.*, u.name AS reporter_name
    FROM violation_reports r
    LEFT JOIN line_liff_users u ON u.line_uid = r.reported_by_uid
    ${where} ORDER BY r.created_at DESC LIMIT 200
  `).bind(...binds).all<{
    id: number; received_at: string | null; vehicle_no: string | null; violation_at: string | null;
    employee_name: string | null; employee_division: number | null; employee_team: number | null;
    violation_type_name: string | null; violation_points: number | null; violation_fine_amount: number | null;
    status: string; created_at: string;
    resolved_by_name: string | null; resolved_at: string | null;
    reporter_name: string | null;
  }>();

  const all = reports.results ?? [];

  const rows = all.map(r => {
    const empStr = r.employee_name
      ? `${r.employee_division ? r.employee_division + '課' : ''}${r.employee_team ? r.employee_team + '班' : ''} ${r.employee_name}`
      : '—';
    const violationStr = r.violation_type_name
      ? `${r.violation_type_name}${typeof r.violation_points === 'number' ? `（${r.violation_points}点/${(r.violation_fine_amount ?? 0).toLocaleString()}円）` : ''}`
      : '—';
    return `<tr id="report-row-${r.id}">
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap;">${escHtml(r.created_at.slice(0, 16))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(r.received_at ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(r.vehicle_no ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(r.violation_at ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(empStr)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(violationStr)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#374151;">${escHtml(r.reporter_name ?? '—')}</td>
      <td id="st-${r.id}" style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        ${statusCellHtml(r.status === 'resolved', '対応済')}
      </td>
      <td id="res-${r.id}" style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        ${resolverCellHtml(r.resolved_by_name, r.resolved_at)}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">
        <button onclick="toggleReportStatus(${r.id},this)" data-status="${r.status}"
          style="padding:3px 8px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:4px;font-size:11px;cursor:pointer;">
          ${r.status === 'resolved' ? '再開' : '対応済にする'}
        </button>
        <button onclick="showReportLogs(${r.id})"
          style="padding:3px 8px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">履歴</button>
        <button onclick="deleteReport(${r.id},'${escHtml((r.vehicle_no ?? '車番不明') + (r.violation_type_name ? ' / ' + r.violation_type_name : ''))}')"
          style="padding:3px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">削除</button>
      </td>
    </tr>`;
  }).join('');

  const filterBtn = (label: string, s: string) => {
    const active = statusFilter === s;
    return `<a href="${ADMIN_PATH}/settings/violations?status=${s}" style="padding:6px 14px;border-radius:20px;font-size:13px;text-decoration:none;font-weight:600;
      ${active ? 'background:#1e3a5f;color:white;' : 'background:white;color:#374151;border:1px solid #d1d5db;'}">${escHtml(label)}</a>`;
  };

  const content = `
    ${subHeader('報告センター')}
    ${reportTabs('violation')}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;align-items:center;">
      ${filterBtn('すべて', '')}
      ${filterBtn('対応中', 'open')}
      ${filterBtn('対応済', 'resolved')}
    </div>
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="padding:14px 20px;border-bottom:1px solid #f3f4f6;">
        <span id="report-count" style="font-size:15px;font-weight:700;color:#1e3a5f;">報告 ${all.length}件</span>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:800px;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">登録日時</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">受電</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">車番</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">違反発生日時</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">乗務員</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">違反種類（点数/反則金）</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">報告者</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">進捗</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">対応者</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="10" style="padding:24px;text-align:center;color:#9ca3af;">報告がありません</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    ${reportLogModalHtml()}
    <script>
    ${reportRowScript('/api/liff/violation-reports', '違反報告', '対応済')}
    </script>
  `;

  return c.html(layout('違反報告一覧', content, 'settings'));
});

// ===================================================
// GET /settings/violation-types — 違反種類・点数/反則金マスタ管理ページ
// ===================================================
app.get('/settings/violation-types', async (c) => {
  const types = await c.env.DB.prepare(`
    SELECT id, name, points, fine_amount, sort_order, is_active
    FROM violation_types ORDER BY sort_order, id
  `).all<{ id: number; name: string; points: number; fine_amount: number; sort_order: number; is_active: number }>();

  const all = types.results ?? [];

  const rows = all.map(t => `<tr data-id="${t.id}">
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <input type="text" value="${escHtml(t.name)}" data-field="name" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <input type="number" value="${t.points}" data-field="points" style="width:70px;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <input type="number" value="${t.fine_amount}" data-field="fine_amount" style="width:100px;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;text-align:center;">
        <input type="checkbox" data-field="is_active" ${t.is_active ? 'checked' : ''}>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <button onclick="saveViolationType(${t.id})" style="padding:4px 10px;background:#1e3a5f;color:white;border:none;border-radius:4px;font-size:11px;cursor:pointer;">保存</button>
      </td>
    </tr>`).join('');

  const content = `
    ${subHeader('違反種類・点数/反則金')}
    <p style="font-size:12px;color:#9ca3af;margin:-8px 0 16px;">点数・反則金は目安です。法改正等で数値が変わった場合はここで更新してください（既存の報告履歴には影響しません）。</p>
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:600px;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">違反の種類</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">点数</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">反則金(円)</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;">有効</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <script>
    var ADMIN_PATH = ${JSON.stringify(ADMIN_PATH)};
    async function saveViolationType(id) {
      const tr = document.querySelector('tr[data-id="' + id + '"]');
      const name = tr.querySelector('[data-field=name]').value.trim();
      const points = parseInt(tr.querySelector('[data-field=points]').value, 10) || 0;
      const fineAmount = parseInt(tr.querySelector('[data-field=fine_amount]').value, 10) || 0;
      const isActive = tr.querySelector('[data-field=is_active]').checked;
      const res = await fetch(ADMIN_PATH + '/api/violation-types/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, points, fine_amount: fineAmount, is_active: isActive }),
      });
      if (res.ok) { alert('保存しました'); } else { alert('保存に失敗しました'); }
    }
    </script>
  `;

  return c.html(layout('違反種類・点数/反則金', content, 'settings'));
});

// ===================================================
// API: 権限変更
// ===================================================
app.put('/api/liff-users/:id/role', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { role } = await c.req.json<{ role: string }>();
  const validRoles = ['general_manager', 'operations_manager', 'vehicle_manager', 'newcomer', 'benten_shift_master', 'benten_member', 'crew_member', 'unknown'];
  if (!validRoles.includes(role)) return c.json({ error: 'invalid role' }, 400);

  await c.env.DB.prepare(
    `UPDATE line_liff_users SET role = ?, updated_at = datetime('now', 'localtime') WHERE id = ?`
  ).bind(role, id).run();

  // リッチメニューを再割り当て
  const user = await c.env.DB.prepare('SELECT line_uid FROM line_liff_users WHERE id = ?')
    .bind(id).first<{ line_uid: string }>();
  if (user) {
    await reassignRichMenu(user.line_uid, role, c.env);
  }

  return c.json({ ok: true });
});

// ===================================================
// API: ユーザー削除
// ===================================================
app.delete('/api/liff-users/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const user = await c.env.DB.prepare('SELECT line_uid FROM line_liff_users WHERE id = ?')
    .bind(id).first<{ line_uid: string }>();

  if (user) {
    await fetch(`https://api.line.me/v2/bot/user/${user.line_uid}/richmenu`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${c.env.LINE_CHANNEL_ACCESS_TOKEN ?? ''}` },
    });
  }
  await c.env.DB.prepare('DELETE FROM line_liff_users WHERE id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM line_conv_states WHERE line_uid = ?').bind(user?.line_uid ?? '').run();
  return c.json({ ok: true });
});

// ===================================================
// API: 報告のステータス更新・削除・対応履歴（忘れ物/事故/違反 共通）
//   対応者名はセッションから確定し、全操作を report_action_logs に記録する
// ===================================================

// 各報告種別のテーブル情報と履歴用の概要スナップショット
const REPORT_KINDS: Record<string, { table: string; summarySql: string }> = {
  lost_item: { table: 'lost_item_reports', summarySql: "COALESCE(vehicle_no,'車番不明') || ' / ' || COALESCE(item_description,'—')" },
  accident:  { table: 'accident_reports',  summarySql: "COALESCE(vehicle_no,'車番不明') || ' / ' || COALESCE(accident_type,'—')" },
  violation: { table: 'violation_reports', summarySql: "COALESCE(vehicle_no,'車番不明') || ' / ' || COALESCE(violation_type_name,'—')" },
};

async function logReportAction(
  db: D1Database, kind: string, reportId: number, action: string, adminName: string, summary: string | null
): Promise<void> {
  await db.prepare(
    'INSERT INTO report_action_logs (report_kind, report_id, action, admin_name, summary) VALUES (?, ?, ?, ?, ?)'
  ).bind(kind, reportId, action, adminName, summary).run();
}

async function handleReportStatus(c: Context<{ Bindings: Env }>, kind: string) {
  const info = REPORT_KINDS[kind];
  const id = parseInt(c.req.param('id') ?? '');
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
  const { status } = await c.req.json() as { status: string };
  if (status !== 'open' && status !== 'resolved') return c.json({ error: 'invalid' }, 400);

  // 対応者名はクライアント申告ではなくログインセッションから確定する
  const adminName = await getAdminName(c);
  const row = await c.env.DB.prepare(
    `SELECT id, ${info.summarySql} AS summary FROM ${info.table} WHERE id = ?`
  ).bind(id).first<{ id: number; summary: string }>();
  if (!row) return c.json({ error: 'not found' }, 404);

  if (status === 'resolved') {
    await c.env.DB.prepare(
      `UPDATE ${info.table} SET status = ?, resolved_by_name = ?, resolved_at = datetime('now','localtime') WHERE id = ?`
    ).bind(status, adminName, id).run();
  } else {
    await c.env.DB.prepare(
      `UPDATE ${info.table} SET status = ?, resolved_by_name = NULL, resolved_at = NULL WHERE id = ?`
    ).bind(status, id).run();
  }
  await logReportAction(c.env.DB, kind, id, status === 'resolved' ? 'resolved' : 'reopened', adminName, row.summary);
  return c.json({ ok: true, adminName });
}

async function handleReportDelete(c: Context<{ Bindings: Env }>, kind: string) {
  const info = REPORT_KINDS[kind];
  const id = parseInt(c.req.param('id') ?? '');
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);

  const adminName = await getAdminName(c);
  const row = await c.env.DB.prepare(
    `SELECT id, ${info.summarySql} AS summary FROM ${info.table} WHERE id = ?`
  ).bind(id).first<{ id: number; summary: string }>();
  if (!row) return c.json({ error: 'not found' }, 404);

  await c.env.DB.prepare(`DELETE FROM ${info.table} WHERE id = ?`).bind(id).run();
  await logReportAction(c.env.DB, kind, id, 'deleted', adminName, row.summary);
  return c.json({ ok: true });
}

app.put('/api/liff/lost-items/:id/status',        (c) => handleReportStatus(c, 'lost_item'));
app.delete('/api/liff/lost-items/:id',            (c) => handleReportDelete(c, 'lost_item'));
app.put('/api/liff/accident-reports/:id/status',  (c) => handleReportStatus(c, 'accident'));
app.delete('/api/liff/accident-reports/:id',      (c) => handleReportDelete(c, 'accident'));
app.put('/api/liff/violation-reports/:id/status', (c) => handleReportStatus(c, 'violation'));
app.delete('/api/liff/violation-reports/:id',     (c) => handleReportDelete(c, 'violation'));

// 対応履歴の取得（行の「履歴」ボタン用）
// パスを既存の権限マッピング（/api/liff/lost-items 等の前方一致）に乗せるため種別ごとに定義
const ACTION_LABELS: Record<string, string> = { resolved: '解決済にした', reopened: '再開した', deleted: '削除した' };

async function handleReportLogs(c: Context<{ Bindings: Env }>, kind: string) {
  const id = parseInt(c.req.param('id') ?? '');
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
  const rows = await c.env.DB.prepare(
    'SELECT action, admin_name, summary, created_at FROM report_action_logs WHERE report_kind = ? AND report_id = ? ORDER BY created_at DESC, id DESC LIMIT 50'
  ).bind(kind, id).all<{ action: string; admin_name: string; summary: string | null; created_at: string }>();
  const logs = (rows.results ?? []).map(r => ({
    ...r, action_label: ACTION_LABELS[r.action] ?? r.action,
  }));
  return c.json({ logs });
}

app.get('/api/liff/lost-items/:id/logs',        (c) => handleReportLogs(c, 'lost_item'));
app.get('/api/liff/accident-reports/:id/logs',  (c) => handleReportLogs(c, 'accident'));
app.get('/api/liff/violation-reports/:id/logs', (c) => handleReportLogs(c, 'violation'));

// ===================================================
// API: 違反種類マスタ更新
// ===================================================
app.put('/api/violation-types/:id', async (c) => {
  const id = parseInt(c.req.param('id') ?? '');
  if (!Number.isInteger(id)) return c.json({ error: 'invalid id' }, 400);
  const { name, points, fine_amount, is_active } = await c.req.json<{
    name: string; points: number; fine_amount: number; is_active: boolean;
  }>();
  await c.env.DB.prepare(
    'UPDATE violation_types SET name = ?, points = ?, fine_amount = ?, is_active = ? WHERE id = ?'
  ).bind(name, points, fine_amount, is_active ? 1 : 0, id).run();
  return c.json({ ok: true });
});

// ===================================================
// リッチメニュー再割り当てヘルパー
// ===================================================
async function reassignRichMenu(lineUid: string, role: string, env: Env): Promise<void> {
  const at = env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
  if (!at) return;

  const menuId = getRichMenuForRole(role, env);
  if (menuId) {
    await fetch(`https://api.line.me/v2/bot/user/${lineUid}/richmenu/${menuId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${at}` },
    });
  } else {
    // 車番管理者・権限不明者はリッチメニューなし
    await fetch(`https://api.line.me/v2/bot/user/${lineUid}/richmenu`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${at}` },
    });
  }
}

export function getRichMenuForRole(role: string, env: Env): string {
  switch (role) {
    case 'newcomer':            return env.RICHMENU_ID_PATTERN1 ?? '';
    case 'operations_manager':  return env.RICHMENU_ID_PATTERN2 ?? '';
    case 'general_manager':     return env.RICHMENU_ID_PATTERN3 ?? '';
    case 'benten_member':
    case 'benten_shift_master': return env.RICHMENU_ID_BENTEN ?? '';
    case 'crew_member':         return env.RICHMENU_ID_CREW_MEMBER ?? '';
    case 'unknown':             return env.RICHMENU_ID_UNKNOWN ?? '';
    default:                    return '';
  }
}

export default app;
