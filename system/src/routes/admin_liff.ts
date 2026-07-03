// LINE LIFF 権限管理・報告一覧 の管理者ページ

import { Hono } from 'hono';
import { layout, escHtml } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env }>();

const ROLE_LABELS: Record<string, string> = {
  general_manager:    '統括管理者',
  operations_manager: '運行管理者',
  vehicle_manager:    '車番管理者',
  newcomer:           '新人',
  unknown:            '権限不明者',
};

const ROLE_COLORS: Record<string, string> = {
  general_manager:    '#1e3a5f',
  operations_manager: '#065f46',
  vehicle_manager:    '#7c3aed',
  newcomer:           '#1d4ed8',
  unknown:            '#9ca3af',
};

function subHeader(title: string): string {
  return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 設定に戻る</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;margin:0;">${escHtml(title)}</h2>
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
        ELSE 5
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
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px;">
      ${statCards}
    </div>

    <!-- 登録方法ガイド -->
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 18px;margin-bottom:20px;font-size:13px;color:#1e40af;">
      <div style="font-weight:700;margin-bottom:8px;">登録コマンド（LINEで送信）</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
        <div><strong>「統括管理者登録」</strong><br><span style="font-size:11px;color:#3b82f6;">→ パスワード入力 → 登録</span></div>
        <div><strong>「運行管理者登録」</strong><br><span style="font-size:11px;color:#3b82f6;">→ パスワード入力 → 登録</span></div>
        <div><strong>「車番連携」</strong><br><span style="font-size:11px;color:#3b82f6;">→ パスワード入力 → 登録</span></div>
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
    async function changeRole(id) {
      const sel = document.getElementById('role-sel-' + id);
      const role = sel.value;
      const res = await fetch('/api/liff-users/' + id + '/role', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (res.ok) { location.reload(); }
      else { alert('変更に失敗しました'); }
    }
    async function deleteUser(id, name) {
      if (!confirm(name + ' を削除しますか？\\nLINE連携が解除されます。')) return;
      const res = await fetch('/api/liff-users/' + id, { method: 'DELETE' });
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
    where += ' AND report_type = ?'; binds.push(typeFilter);
  }
  if (statusFilter === 'open' || statusFilter === 'resolved') {
    where += ' AND status = ?'; binds.push(statusFilter);
  }

  const reports = await c.env.DB.prepare(
    `SELECT * FROM lost_item_reports ${where} ORDER BY created_at DESC LIMIT 200`
  ).bind(...binds).all<{
    id: number; report_type: string; received_at: string | null;
    vehicle_no: string | null; employee_name: string | null;
    employee_division: number | null; employee_team: number | null;
    item_description: string | null; pickup_location: string | null; dropoff_location: string | null;
    customer_name: string | null; customer_phone: string | null; return_method: string | null;
    notes: string | null; status: string; created_at: string;
  }>();

  const all = reports.results ?? [];

  const rows = all.map(r => {
    const isCustomer = r.report_type === 'customer';
    const typeLabel = isCustomer ? '客問い合わせ' : '社員報告';
    const typeColor = isCustomer ? '#7c3aed' : '#1d4ed8';
    const statusLabel = r.status === 'resolved' ? '解決済' : '対応中';
    const statusColor = r.status === 'resolved' ? '#059669' : '#d97706';
    const empStr = r.employee_name
      ? `${r.employee_division ? r.employee_division + '課' : ''}${r.employee_team ? r.employee_team + '班' : ''} ${r.employee_name}`
      : '—';
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap;">${escHtml(r.created_at.slice(0, 16))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <span style="background:${typeColor};color:white;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;">${escHtml(typeLabel)}</span>
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(r.received_at ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(r.vehicle_no ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(empStr)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(r.item_description ?? '')}">${escHtml(r.item_description ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <span style="color:${statusColor};font-size:12px;font-weight:600;">${escHtml(statusLabel)}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <button onclick="toggleStatus(${r.id},'${r.status}')"
          style="padding:3px 8px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:4px;font-size:11px;cursor:pointer;">
          ${r.status === 'resolved' ? '再開' : '解決済にする'}
        </button>
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
    ${subHeader('忘れ物報告一覧')}

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:20px;align-items:center;">
      ${filterBtn('すべて', '', '')}
      ${filterBtn('社員報告', 'staff', '')}
      ${filterBtn('客問い合わせ', 'customer', '')}
      ${filterBtn('対応中', '', 'open')}
      ${filterBtn('解決済', '', 'resolved')}
    </div>

    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="padding:14px 20px;border-bottom:1px solid #f3f4f6;">
        <span style="font-size:15px;font-weight:700;color:#1e3a5f;">報告 ${all.length}件</span>
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
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">状態</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af;">報告がありません</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <script>
    async function toggleStatus(id, current) {
      const next = current === 'resolved' ? 'open' : 'resolved';
      const res = await fetch('/api/liff/lost-items/' + id + '/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) { location.reload(); }
      else { alert('更新に失敗しました'); }
    }
    </script>
  `;

  return c.html(layout('忘れ物報告一覧', content, 'settings'));
});

// ===================================================
// GET /settings/accidents — 事故報告一覧
// ===================================================
app.get('/settings/accidents', async (c) => {
  const reports = await c.env.DB.prepare(`
    SELECT * FROM accident_reports ORDER BY created_at DESC LIMIT 200
  `).all<{
    id: number; received_at: string | null; vehicle_no: string | null;
    employee_name: string | null; employee_division: number | null; employee_team: number | null;
    accident_type: string | null; location: string | null; car_status: string | null;
    summary_text: string | null; status: string; created_at: string;
  }>();

  const all = reports.results ?? [];

  const rows = all.map(r => {
    const statusLabel = r.status === 'resolved' ? '解決済' : '対応中';
    const statusColor = r.status === 'resolved' ? '#059669' : '#dc2626';
    const empStr = r.employee_name
      ? `${r.employee_division ? r.employee_division + '課' : ''}${r.employee_team ? r.employee_team + '班' : ''} ${r.employee_name}`
      : '—';
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap;">${escHtml(r.created_at.slice(0, 16))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(r.received_at ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(r.vehicle_no ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(empStr)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(r.accident_type ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(r.location ?? '')}">${escHtml(r.location ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escHtml(r.car_status ?? '—')}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <span style="color:${statusColor};font-size:12px;font-weight:600;">${escHtml(statusLabel)}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <button onclick="toggleAccidentStatus(${r.id},'${r.status}')"
          style="padding:3px 8px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:4px;font-size:11px;cursor:pointer;">
          ${r.status === 'resolved' ? '再開' : '解決済にする'}
        </button>
      </td>
    </tr>`;
  }).join('');

  const content = `
    ${subHeader('事故報告一覧')}
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="padding:14px 20px;border-bottom:1px solid #f3f4f6;">
        <span style="font-size:15px;font-weight:700;color:#1e3a5f;">報告 ${all.length}件</span>
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
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">進捗</th>
              <th style="padding:8px 12px;"></th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="9" style="padding:24px;text-align:center;color:#9ca3af;">報告がありません</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    <script>
    async function toggleAccidentStatus(id, current) {
      const next = current === 'resolved' ? 'open' : 'resolved';
      const res = await fetch('/api/liff/accident-reports/' + id + '/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) { location.reload(); }
      else { alert('更新に失敗しました'); }
    }
    </script>
  `;

  return c.html(layout('事故報告一覧', content, 'settings'));
});

// ===================================================
// API: 権限変更
// ===================================================
app.put('/api/liff-users/:id/role', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { role } = await c.req.json<{ role: string }>();
  const validRoles = ['general_manager', 'operations_manager', 'vehicle_manager', 'newcomer', 'unknown'];
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
// API: 忘れ物ステータス更新
// ===================================================
app.put('/api/liff/lost-items/:id/status', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { status } = await c.req.json<{ status: string }>();
  if (status !== 'open' && status !== 'resolved') return c.json({ error: 'invalid' }, 400);
  await c.env.DB.prepare('UPDATE lost_item_reports SET status = ? WHERE id = ?').bind(status, id).run();
  return c.json({ ok: true });
});

// ===================================================
// API: 事故報告ステータス更新
// ===================================================
app.put('/api/liff/accident-reports/:id/status', async (c) => {
  const id = parseInt(c.req.param('id'));
  const { status } = await c.req.json<{ status: string }>();
  if (status !== 'open' && status !== 'resolved') return c.json({ error: 'invalid' }, 400);
  await c.env.DB.prepare('UPDATE accident_reports SET status = ? WHERE id = ?').bind(status, id).run();
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
    case 'newcomer':           return env.RICHMENU_ID_PATTERN1 ?? '';
    case 'operations_manager': return env.RICHMENU_ID_PATTERN2 ?? '';
    case 'general_manager':    return env.RICHMENU_ID_PATTERN3 ?? '';
    default:                   return '';
  }
}

export default app;
