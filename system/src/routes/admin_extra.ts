// 売上管理・嫌なこと報告・LINE管理の管理者画面ルート

import { Hono } from 'hono';
import { layout, escHtml, safeJson } from '../html/layout';
import { ADMIN_PATH } from '../config';
import { salesPage, salesDetailPage } from '../html/sales';
import { getPeriodRange } from '../auth';
import { generateInviteCode } from '../auth';
import type { Env } from '../auth';
import type { SalesSummary, DailySale } from '../html/sales';
import type { InterviewRecord } from './api/interviews';
import { ROLE_LABELS } from './admin_liff';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

// ===== 売上管理 =====
app.get('/sales', async (c) => {
  const now = new Date();
  const year = parseInt(c.req.query('year') ?? String(now.getFullYear()));
  const month = parseInt(c.req.query('month') ?? String(now.getMonth() + 1));

  const { start, end } = getPeriodRange(year, month);

  const summary = await c.env.DB.prepare(`
    SELECT
      e.id, e.name, e.emp_no, e.division, e.team,
      SUM(s.amount) as total_amount,
      SUM(s.ride_count) as total_rides,
      SUM(s.distance_km) as total_distance,
      COUNT(s.date) as working_days,
      AVG(s.amount) as avg_amount
    FROM employees e
    LEFT JOIN sales_records s ON e.id = s.emp_id AND s.period_year = ? AND s.period_month = ?
    WHERE e.is_active = 1
    GROUP BY e.id
    ORDER BY e.division, e.team, e.seq_no
  `).bind(year, month).all<SalesSummary>();

  const content = salesPage(summary.results ?? [], year, month, start, end);
  return c.html(layout(`売上管理 — ${year}年${month}月度`, content, 'sales'));
});

// 社員別日別売上詳細
app.get('/sales/detail', async (c) => {
  const empId = parseInt(c.req.query('emp_id') ?? '0');
  const year = parseInt(c.req.query('year') ?? '0');
  const month = parseInt(c.req.query('month') ?? '0');
  if (!empId || !year || !month) return c.text('パラメータ不足', 400);

  const { start, end } = getPeriodRange(year, month);
  const emp = await c.env.DB.prepare(
    'SELECT id, name, emp_no FROM employees WHERE id = ?'
  ).bind(empId).first<{ id: number; name: string; emp_no: string }>();
  if (!emp) return c.text('社員が見つかりません', 404);

  const records = await c.env.DB.prepare(
    'SELECT emp_id, date, amount, ride_count, distance_km FROM sales_records WHERE emp_id = ? AND date >= ? AND date <= ? ORDER BY date'
  ).bind(empId, start, end).all<DailySale>();

  const content = salesDetailPage(emp, records.results ?? [], year, month);
  return c.html(layout(`${emp.name} 売上詳細`, content, 'sales'));
});

// ===== 嫌なこと報告 =====
app.get('/events', async (c) => {
  const page = parseInt(c.req.query('page') ?? '1');
  const limit = 20;
  const offset = (page - 1) * limit;

  const events = await c.env.DB.prepare(`
    SELECT b.id, b.category, b.content, b.feeling, b.admin_memo, b.created_at,
      e.name, e.emp_no, e.division
    FROM bad_events b
    JOIN employees e ON b.emp_id = e.id
    ORDER BY b.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all<{
    id: number; category: string; content: string; feeling: string;
    admin_memo: string; created_at: string; name: string; emp_no: string; division: number;
  }>();

  const totalRow = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM bad_events').first<{ cnt: number }>();
  const total = totalRow?.cnt ?? 0;
  const totalPages = Math.ceil(total / limit);

  const CAT_COLORS: Record<string, string> = {
    'クレーマー': '#fecaca', '交通トラブル': '#fed7aa',
    '社内の出来事': '#e9d5ff', 'その他': '#e5e7eb'
  };

  const rows = (events.results ?? []).map(e => `
    <tr class="hover:bg-gray-50">
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;cursor:pointer;" onclick="window.location='${ADMIN_PATH}/events/${e.id}'">
        <span style="background:${CAT_COLORS[e.category] ?? '#e5e7eb'};padding:2px 8px;border-radius:4px;font-size:12px;">${escHtml(e.category)}</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;cursor:pointer;" onclick="window.location='${ADMIN_PATH}/events/${e.id}'">${escHtml(e.name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;max-width:300px;cursor:pointer;" onclick="window.location='${ADMIN_PATH}/events/${e.id}'">
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(e.content)}</div>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;cursor:pointer;" onclick="window.location='${ADMIN_PATH}/events/${e.id}'">${e.created_at.slice(0, 10)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;cursor:pointer;" onclick="window.location='${ADMIN_PATH}/events/${e.id}'">
        ${e.admin_memo ? '<span style="background:#bbf7d0;padding:2px 6px;border-radius:4px;font-size:11px;">対応済</span>' : '<span style="background:#fee2e2;padding:2px 6px;border-radius:4px;font-size:11px;">未対応</span>'}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;">
        <button onclick="deleteEvent(${e.id})" style="padding:2px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;">削除</button>
      </td>
    </tr>`).join('');

  const pagination = totalPages > 1 ? `
    <div style="display:flex;gap:4px;margin-top:12px;">
      ${Array.from({ length: totalPages }, (_, i) => i + 1).map(p =>
        `<a href="${ADMIN_PATH}/events?page=${p}" style="padding:4px 10px;border-radius:4px;font-size:13px;${p === page ? 'background:#2563eb;color:white;' : 'background:#e5e7eb;color:#374151;'}text-decoration:none;">${p}</a>`
      ).join('')}
    </div>` : '';

  const content = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div style="font-size:14px;color:#6b7280;">全 ${total} 件</div>
      <a href="${ADMIN_PATH}/events/export" style="padding:6px 14px;background:#6b7280;color:white;border-radius:6px;font-size:13px;text-decoration:none;">CSV出力</a>
    </div>
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);overflow:auto;">
      <table style="width:100%;border-collapse:collapse;">
        <thead style="background:#f9fafb;">
          <tr>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">カテゴリ</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">氏名</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">内容</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">日付</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">状態</th>
            <th style="padding:8px 12px;border-bottom:1px solid #e5e7eb;"></th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;">報告はありません</td></tr>'}</tbody>
      </table>
    </div>
    ${pagination}
    <script>
    async function deleteEvent(id) {
      if (!confirm('この報告を削除しますか？\\nこの操作は取り消せません。')) return;
      const res = await fetch('/api/events/' + id, { method: 'DELETE' });
      if (res.ok) { location.reload(); }
      else { alert('削除に失敗しました。'); }
    }
    </script>
  `;
  return c.html(layout('嫌なこと報告一覧', content, 'events'));
});

// 報告詳細・管理者メモ
app.get('/events/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const event = await c.env.DB.prepare(`
    SELECT b.*, e.name, e.emp_no, e.division, e.team
    FROM bad_events b JOIN employees e ON b.emp_id = e.id WHERE b.id = ?
  `).bind(id).first<{
    id: number; category: string; content: string; feeling: string;
    admin_memo: string; created_at: string; name: string; emp_no: string;
    division: number; team: number; emp_id: number;
  }>();
  if (!event) return c.text('見つかりません', 404);

  const CAT_COLORS: Record<string, string> = {
    'クレーマー': '#fecaca', '交通トラブル': '#fed7aa',
    '社内の出来事': '#e9d5ff', 'その他': '#e5e7eb'
  };

  const content = `
    <div style="max-width:640px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <a href="${ADMIN_PATH}/events" style="color:#2563eb;font-size:13px;">← 一覧に戻る</a>
        <button onclick="deleteEvent(${id})" style="padding:4px 12px;background:#fee2e2;color:#991b1b;border:none;border-radius:6px;font-size:12px;cursor:pointer;">🗑️ この報告を削除</button>
      </div>
      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:24px;margin-top:12px;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #f3f4f6;">
          <span style="background:${CAT_COLORS[event.category] ?? '#e5e7eb'};padding:4px 12px;border-radius:6px;font-size:13px;">${escHtml(event.category)}</span>
          <div>
            <div style="font-size:16px;font-weight:bold;">${escHtml(event.name)}</div>
            <div style="font-size:12px;color:#6b7280;">${event.division ?? ''}課 ${event.team ?? ''}班 ／ ${event.created_at.slice(0, 16)}</div>
          </div>
        </div>
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:6px;">📝 経緯・出来事</div>
          <div style="background:#f9fafb;border-radius:8px;padding:12px;font-size:14px;white-space:pre-wrap;line-height:1.6;">${escHtml(event.content)}</div>
        </div>
        ${event.feeling ? `
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:6px;">💭 気持ち・感想</div>
          <div style="background:#fffbeb;border-radius:8px;padding:12px;font-size:14px;white-space:pre-wrap;line-height:1.6;">${escHtml(event.feeling)}</div>
        </div>` : ''}
        <div>
          <div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:6px;">📌 管理者メモ（面談記録等）</div>
          <textarea id="admin-memo" rows="4" placeholder="面談記録・対応内容等を記録..."
            style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:10px;font-size:13px;line-height:1.6;">${escHtml(event.admin_memo ?? '')}</textarea>
          <button onclick="saveMemo()" style="margin-top:8px;padding:8px 20px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;">メモを保存</button>
        </div>
      </div>
    </div>
    <script>
    async function saveMemo() {
      const memo = document.getElementById('admin-memo').value;
      const res = await fetch('/api/events/${id}/memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memo })
      });
      if (res.ok) alert('保存しました');
      else alert('保存に失敗しました');
    }
    async function deleteEvent(id) {
      if (!confirm('この報告を削除しますか？\\nこの操作は取り消せません。')) return;
      const res = await fetch('/api/events/' + id, { method: 'DELETE' });
      if (res.ok) { window.location.href = '${ADMIN_PATH}/events'; }
      else { alert('削除に失敗しました。'); }
    }
    </script>
  `;
  return c.html(layout(`報告詳細 — ${event.name}`, content, 'events'));
});

// 報告CSV出力
app.get('/events/export', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT b.id, b.category, b.content, b.feeling, b.admin_memo, b.created_at,
      e.name, e.emp_no, e.division, e.team
    FROM bad_events b JOIN employees e ON b.emp_id = e.id
    ORDER BY b.created_at DESC
  `).all<Record<string, string>>();

  const header = ['ID', '課', '班', '社員番号', '氏名', 'カテゴリ', '経緯', '気持ち', '管理者メモ', '日時'];
  const body = (rows.results ?? []).map(r =>
    [r.id, r.division ?? '', r.team ?? '', r.emp_no, `"${(r.name ?? '').replace(/"/g, '""')}"`,
     r.category, `"${(r.content ?? '').replace(/"/g, '""')}"`,
     `"${(r.feeling ?? '').replace(/"/g, '""')}"`,
     `"${(r.admin_memo ?? '').replace(/"/g, '""')}"`,
     r.created_at].join(',')
  ).join('\n');

  return new Response(`﻿${header.join(',')}\n${body}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="bad_events.csv"'
    }
  });
});

// ===== LINE管理 =====
app.get('/line', async (c) => {
  const codes = await c.env.DB.prepare(`
    SELECT i.code, i.is_used, i.expires_at, i.created_at, i.used_at,
      e.name, e.emp_no
    FROM invite_codes i
    LEFT JOIN employees e ON i.emp_id = e.id
    ORDER BY i.created_at DESC
    LIMIT 50
  `).all<{
    code: string; is_used: number; expires_at: string; created_at: string;
    used_at: string; name: string; emp_no: string;
  }>();

  const linked = await c.env.DB.prepare(`
    SELECT l.line_uid, l.linked_at, e.name, e.emp_no, e.division
    FROM line_users l JOIN employees e ON l.emp_id = e.id
    ORDER BY l.linked_at DESC
  `).all<{ line_uid: string; linked_at: string; name: string; emp_no: string; division: number }>();

  const employees = await c.env.DB.prepare(
    'SELECT id, name, emp_no FROM employees WHERE is_active = 1 ORDER BY seq_no, id'
  ).all<{ id: number; name: string; emp_no: string }>();

  const codeRows = (codes.results ?? []).map(c => {
    const now = new Date().toISOString();
    const expired = c.expires_at < now;
    return `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-family:monospace;font-size:14px;font-weight:bold;letter-spacing:2px;">${escHtml(c.code)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(c.name ?? '—')}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;">
          ${c.is_used ? '<span style="background:#bbf7d0;padding:2px 8px;border-radius:4px;font-size:12px;">使用済</span>'
            : expired ? '<span style="background:#fee2e2;padding:2px 8px;border-radius:4px;font-size:12px;">期限切れ</span>'
            : '<span style="background:#fef9c3;padding:2px 8px;border-radius:4px;font-size:12px;">有効</span>'}
        </td>
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${c.expires_at.slice(0, 16)}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;">
          <button onclick="deleteCode('${escHtml(c.code)}')" style="padding:2px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;">削除</button>
        </td>
      </tr>`;
  }).join('');

  const linkedRows = (linked.results ?? []).map(l =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(l.name)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${escHtml(l.emp_no)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${l.linked_at.slice(0, 16)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;font-size:11px;color:#9ca3af;font-family:monospace;">${escHtml(l.line_uid.slice(0, 12))}…</td>
    </tr>`
  ).join('');

  const empOptions = (employees.results ?? []).map(e =>
    `<option value="${e.id}">${escHtml(e.name)}（${escHtml(e.emp_no)}）</option>`
  ).join('');

  const content = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;font-family:'Hiragino Sans','Meiryo',sans-serif;">

      <!-- 招待コード発行 -->
      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:20px;">
        <h3 style="font-size:15px;font-weight:bold;color:#1e3a5f;margin-bottom:16px;">招待コード発行</h3>
        <div style="margin-bottom:12px;">
          <label style="font-size:13px;color:#6b7280;display:block;margin-bottom:6px;">対象社員を選択</label>
          <select id="emp-select" style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px;font-size:13px;">
            <option value="">選択してください...</option>
            ${empOptions}
          </select>
        </div>
        <button onclick="issueCode()" style="width:100%;padding:10px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
          招待コードを発行する
        </button>
        <div id="code-result" style="display:none;margin-top:16px;padding:16px;background:#f0f9ff;border-radius:8px;text-align:center;">
          <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">招待コード（有効期限7日）</div>
          <div id="code-display" style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#1e3a5f;font-family:monospace;"></div>
          <div style="font-size:12px;color:#6b7280;margin-top:8px;">このコードをLINEリフに送るよう新人に伝えてください</div>
        </div>
      </div>

      <!-- アンケート配信 -->
      <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:20px;">
        <h3 style="font-size:15px;font-weight:bold;color:#1e3a5f;margin-bottom:16px;">アンケート配信</h3>
        <div style="margin-bottom:12px;">
          <label style="font-size:13px;color:#6b7280;display:block;margin-bottom:6px;">アンケートタイトル</label>
          <input type="text" id="survey-title" placeholder="例: 6月度 新人アンケート"
            style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px;font-size:13px;">
        </div>
        <div style="margin-bottom:12px;">
          <label style="font-size:13px;color:#6b7280;display:block;margin-bottom:6px;">Google Forms URL</label>
          <input type="url" id="survey-url" placeholder="https://forms.gle/..."
            style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px;font-size:13px;">
        </div>
        <button onclick="sendSurvey()" style="width:100%;padding:10px;background:#059669;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
          全員に配信する
        </button>
      </div>
    </div>

    <!-- 招待コード一覧 -->
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);margin-top:20px;overflow:hidden;">
      <div style="padding:16px 20px;border-bottom:1px solid #f3f4f6;">
        <h3 style="font-size:15px;font-weight:bold;color:#1e3a5f;">発行済み招待コード</h3>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead style="background:#f9fafb;">
          <tr>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">コード</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">対象社員</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">状態</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">有効期限</th>
            <th style="padding:8px 12px;"></th>
          </tr>
        </thead>
        <tbody>${codeRows || '<tr><td colspan="5" style="padding:20px;text-align:center;color:#9ca3af;">コードがありません</td></tr>'}</tbody>
      </table>
    </div>

    <!-- LINE紐付け済みユーザー -->
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);margin-top:20px;overflow:hidden;">
      <div style="padding:16px 20px;border-bottom:1px solid #f3f4f6;">
        <h3 style="font-size:15px;font-weight:bold;color:#1e3a5f;">LINE紐付け済み（${(linked.results ?? []).length}名）</h3>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead style="background:#f9fafb;">
          <tr>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">氏名</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">社員番号</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">紐付け日時</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">LINE UID</th>
          </tr>
        </thead>
        <tbody>${linkedRows || '<tr><td colspan="4" style="padding:20px;text-align:center;color:#9ca3af;">紐付け済みユーザーがいません</td></tr>'}</tbody>
      </table>
    </div>

    <script>
    async function issueCode() {
      const empId = document.getElementById('emp-select').value;
      if (!empId) { alert('社員を選択してください'); return; }
      const res = await fetch('/api/line/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_id: parseInt(empId) })
      });
      const json = await res.json();
      if (res.ok) {
        document.getElementById('code-display').textContent = json.code;
        document.getElementById('code-result').style.display = 'block';
      } else {
        alert('発行に失敗しました: ' + json.error);
      }
    }

    async function sendSurvey() {
      const title = document.getElementById('survey-title').value.trim();
      const url = document.getElementById('survey-url').value.trim();
      if (!title || !url) { alert('タイトルとURLを入力してください'); return; }
      if (!confirm(\`全紐付け済み社員（${(linked.results ?? []).length}名）にアンケートを配信しますか？\`)) return;
      const res = await fetch('/api/line/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, url })
      });
      if (res.ok) alert('配信しました！');
      else alert('配信に失敗しました');
    }

    async function deleteCode(code) {
      if (!confirm('招待コード「' + code + '」を削除しますか？')) return;
      const res = await fetch('/api/line/invite/' + code, { method: 'DELETE' });
      if (res.ok) { location.reload(); }
      else { alert('削除に失敗しました。'); }
    }
    </script>
  `;

  return c.html(layout('LINE管理', content, 'line'));
});

// ============================================================
// 面談管理
// ============================================================

const CHK_LABEL: Record<string, { section: string; label: string; icon: string }> = {
  chk_mental_exp:      { section: 'メンタル面',         label: '表情・発言はどうですか',       icon: '😊' },
  chk_mental_stress:   { section: 'メンタル面',         label: 'ストレスや不満はどうですか',    icon: '💭' },
  chk_mental_family:   { section: 'メンタル面',         label: '家族・友人との関係は',          icon: '👨‍👩‍👦' },
  chk_life_sleep:      { section: '生活面',             label: '睡眠は取れていますか',          icon: '😴' },
  chk_life_appetite:   { section: '生活面',             label: '食欲はありますか',              icon: '🍱' },
  chk_life_health:     { section: '生活面',             label: '体調はどうですか',              icon: '🏥' },
  chk_work_motivation: { section: '業務に対して',       label: '仕事のやりがいはありますか',    icon: '💪' },
  chk_work_instructor: { section: '業務に対して',       label: '指導者との関係はどうですか',    icon: '🤝' },
  chk_work_rules:      { section: '業務に対して',       label: '礼儀・ルール等は守られていますか', icon: '📋' },
  chk_money:           { section: 'お金に対する不満',   label: '収入に対して不満はありますか',  icon: '💴' },
  chk_relation:        { section: '人間関係',           label: '乗務員同士の関係はどうですか',  icon: '👥' },
  chk_appearance:      { section: '身だしなみ・就業状況', label: '身だしなみはどうですか',      icon: '👔' },
  chk_attendance:      { section: '身だしなみ・就業状況', label: '就業状況はどうですか',        icon: '⏰' },
  chk_future:          { section: '今後の意向確認',     label: '今後も仕事を続けたいですか',    icon: '🚕' },
};
const CHK_KEYS = Object.keys(CHK_LABEL);

function chkLabel(val: number | null): string {
  if (val === 3) return '<span style="color:#166534;font-weight:700;font-size:16px;">○</span>';
  if (val === 2) return '<span style="color:#854d0e;font-weight:700;font-size:16px;">△</span>';
  if (val === 1) return '<span style="color:#991b1b;font-weight:700;font-size:16px;">×</span>';
  return '<span style="color:#d1d5db;font-size:13px;">—</span>';
}
function chkBg(val: number | null): string {
  if (val === 3) return '#f0fdf4';
  if (val === 2) return '#fefce8';
  if (val === 1) return '#fef2f2';
  return '#fafafa';
}
function scoreColor(bad: number, total: number): string {
  if (bad === 0) return '#166534';
  if (bad / total < 0.3) return '#854d0e';
  return '#991b1b';
}

// ===== 面談一覧（社員別ステータス） =====
app.get('/interviews', async (c) => {
  const employees = await c.env.DB.prepare(`
    SELECT e.id, e.name, e.emp_no, e.division, e.team, e.status,
      COUNT(ir.id) as interview_count,
      MAX(ir.interview_date) as last_interview,
      (SELECT ir2.next_interview_date FROM interview_records ir2
        WHERE ir2.emp_id = e.id ORDER BY ir2.interview_date DESC LIMIT 1) as next_interview
    FROM employees e
    LEFT JOIN interview_records ir ON ir.emp_id = e.id
    WHERE e.is_active = 1 AND e.interview_target = 1
    GROUP BY e.id
    ORDER BY e.division, e.team, e.seq_no
  `).all<{
    id: number; name: string; emp_no: string; division: number; team: number; status: string;
    interview_count: number; last_interview: string; next_interview: string;
  }>();

  const today = new Date().toISOString().split('T')[0];

  const rows = (employees.results ?? []).map(e => {
    const daysSince = e.last_interview
      ? Math.floor((new Date(today).getTime() - new Date(e.last_interview).getTime()) / 86400000)
      : null;
    const isOverdue = e.next_interview && e.next_interview < today;
    const daysColor = daysSince === null ? '#9ca3af'
      : daysSince <= 14 ? '#166534'
      : daysSince <= 30 ? '#854d0e' : '#991b1b';
    const STATUS: Record<string, string> = { training:'研修中', completed:'研修終了', unassigned:'未配属' };
    const statusLabel = STATUS[e.status ?? 'training'] ?? '—';
    return `
    <tr class="hover:bg-gray-50">
      <td class="px-3 py-2 border-b text-sm font-medium">
        <a href="${ADMIN_PATH}/interviews/${e.id}" style="color:#2563eb;">${escHtml(e.name)}</a>
        <div class="text-xs text-gray-400">${e.division ?? ''}課 ${e.team ?? ''}班 / ${escHtml(e.emp_no)}</div>
      </td>
      <td class="px-3 py-2 border-b text-xs">${escHtml(statusLabel)}</td>
      <td class="px-3 py-2 border-b text-sm">${e.interview_count}回</td>
      <td class="px-3 py-2 border-b text-sm" style="color:${daysColor};">
        ${e.last_interview ? escHtml(e.last_interview) + `<div style="font-size:11px;">${daysSince}日前</div>` : '<span style="color:#d1d5db;">未実施</span>'}
      </td>
      <td class="px-3 py-2 border-b text-sm" style="color:${isOverdue ? '#991b1b' : '#374151'};">
        ${e.next_interview ? escHtml(e.next_interview) + (isOverdue ? ' <span style="font-size:10px;background:#fecaca;color:#991b1b;padding:1px 4px;border-radius:3px;">期限超過</span>' : '') : '—'}
      </td>
      <td class="px-3 py-2 border-b">
        <a href="${ADMIN_PATH}/interviews/${e.id}/new"
          style="padding:4px 12px;background:#1a3a5c;color:white;border-radius:4px;font-size:12px;text-decoration:none;">
          + 面談記録
        </a>
      </td>
    </tr>`;
  }).join('');

  const content = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div class="text-sm text-gray-500">${(employees.results ?? []).length}名</div>
      <a href="${ADMIN_PATH}/interviews/export" style="padding:6px 14px;background:#6b7280;color:white;border-radius:6px;font-size:13px;text-decoration:none;">CSV出力</a>
    </div>
    <div class="bg-white rounded-xl shadow overflow-auto">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">氏名</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">ステータス</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">面談回数</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">最終面談日</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">次回予定</th>
            <th class="px-3 py-2 border-b"></th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6" class="px-4 py-8 text-center text-gray-400">面談対象の社員がいません。<br><a href="${ADMIN_PATH}/employees" style="color:#2563eb;">社員管理</a>から「面談」列をオンにしてください。</td></tr>'}</tbody>
      </table>
    </div>`;
  return c.html(layout('面談管理', content, 'interviews'));
});

// ===== 面談履歴（社員別） =====
app.get('/interviews/:empId', async (c) => {
  const empId = parseInt(c.req.param('empId'));
  const emp = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(empId)
    .first<{ id: number; name: string; emp_no: string; division: number; team: number }>();
  if (!emp) return c.text('社員が見つかりません', 404);

  const records = await c.env.DB.prepare(
    'SELECT * FROM interview_records WHERE emp_id = ? ORDER BY interview_date DESC'
  ).bind(empId).all<InterviewRecord>();

  const rows = (records.results ?? []).map(r => {
    const badCount = CHK_KEYS.filter(k => (r as any)[k] === 1).length;
    const cautionCount = CHK_KEYS.filter(k => (r as any)[k] === 2).length;
    const checkedCount = CHK_KEYS.filter(k => (r as any)[k] != null).length;
    const statusBadge = badCount > 0
      ? `<span style="background:#fecaca;color:#991b1b;padding:2px 6px;border-radius:4px;font-size:11px;">×${badCount}</span>`
      : cautionCount > 0
      ? `<span style="background:#fef9c3;color:#854d0e;padding:2px 6px;border-radius:4px;font-size:11px;">△${cautionCount}</span>`
      : checkedCount > 0
      ? `<span style="background:#bbf7d0;color:#166534;padding:2px 6px;border-radius:4px;font-size:11px;">全て○</span>`
      : '<span style="color:#9ca3af;font-size:11px;">未入力</span>';
    return `
    <tr class="hover:bg-gray-50 cursor-pointer" onclick="window.location='${ADMIN_PATH}/interviews/record/${r.id}'">
      <td class="px-3 py-2 border-b text-sm font-medium">${escHtml(r.interview_date)}</td>
      <td class="px-3 py-2 border-b text-xs text-gray-500">${r.interviewer ? escHtml(r.interviewer) : '—'}</td>
      <td class="px-3 py-2 border-b">${statusBadge}</td>
      <td class="px-3 py-2 border-b text-xs text-gray-500 max-w-xs" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${r.concerns ? escHtml(r.concerns.slice(0, 40)) : '—'}
      </td>
      <td class="px-3 py-2 border-b text-xs">${r.next_interview_date ? escHtml(r.next_interview_date) : '—'}</td>
    </tr>`;
  }).join('');

  const content = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div>
        <a href="${ADMIN_PATH}/interviews" style="color:#2563eb;font-size:13px;">← 面談一覧に戻る</a>
        <h2 style="font-size:18px;font-weight:bold;color:#1e3a5f;margin-top:4px;">${escHtml(emp.name)} の面談履歴</h2>
        <div style="font-size:13px;color:#6b7280;">${emp.division ?? ''}課 ${emp.team ?? ''}班 / ${escHtml(emp.emp_no)}</div>
      </div>
      <a href="${ADMIN_PATH}/interviews/${empId}/new"
        style="padding:8px 18px;background:#1a3a5c;color:white;border-radius:6px;font-size:13px;text-decoration:none;font-weight:600;">
        + 面談記録を追加
      </a>
    </div>
    <div class="bg-white rounded-xl shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">面談日</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">担当者</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">結果</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">気になった点</th>
            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">次回予定</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="5" class="px-4 py-8 text-center text-gray-400">面談記録がありません</td></tr>'}</tbody>
      </table>
    </div>`;
  return c.html(layout(`${emp.name} — 面談履歴`, content, 'interviews'));
});

// ===== 面談記録フォーム（新規・編集共通） =====
function interviewForm(
  emp: { id: number; name: string; emp_no: string; division: number; team: number },
  record: Partial<InterviewRecord> | null,
  isNew: boolean
): string {
  const val = (key: string) => (record as any)?.[key] ?? '';
  const chkRadio = (key: string) => {
    const cur = (record as any)?.[key];
    return [3, 2, 1].map(v => {
      const labels: Record<number, string> = { 3: '○', 2: '△', 1: '×' };
      const colors: Record<number, string> = { 3: '#166534', 2: '#854d0e', 1: '#991b1b' };
      const bgs: Record<number, string> = { 3: '#f0fdf4', 2: '#fefce8', 1: '#fef2f2' };
      const checked = cur === v ? 'checked' : '';
      return `<label style="display:inline-flex;align-items:center;gap:3px;cursor:pointer;padding:4px 8px;border-radius:6px;background:${cur === v ? bgs[v] : '#f9fafb'};border:1px solid ${cur === v ? '#d1d5db' : '#e5e7eb'};">
        <input type="radio" name="${key}" value="${v}" ${checked} style="accent-color:${colors[v]};">
        <span style="font-size:15px;font-weight:700;color:${colors[v]};">${labels[v]}</span>
      </label>`;
    }).join('');
  };

  // セクションごとにグループ化
  const sections: Record<string, string[]> = {};
  for (const [key, meta] of Object.entries(CHK_LABEL)) {
    if (!sections[meta.section]) sections[meta.section] = [];
    sections[meta.section].push(key);
  }

  const checkRows = Object.entries(sections).map(([section, keys]) => {
    const itemRows = keys.map(key => {
      const meta = CHK_LABEL[key];
      return `
        <div style="display:grid;grid-template-columns:1fr auto;gap:8px;padding:8px 0;border-bottom:1px solid #f3f4f6;align-items:start;">
          <div>
            <div style="font-size:13px;margin-bottom:4px;">${meta.icon} ${escHtml(meta.label)}</div>
            <input type="text" name="${key}_note" value="${escHtml(String(val(key + '_note')))}" placeholder="状況・詳細メモ"
              style="width:100%;border:1px solid #e5e7eb;border-radius:4px;padding:5px 8px;font-size:12px;font-family:inherit;">
          </div>
          <div style="display:flex;gap:4px;flex-shrink:0;">
            ${chkRadio(key)}
          </div>
        </div>`;
    }).join('');
    return `
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;font-weight:700;color:#1a3a5c;background:#eff6ff;padding:6px 10px;border-radius:6px;margin-bottom:4px;">${escHtml(section)}</div>
        ${itemRows}
      </div>`;
  }).join('');

  const action = isNew
    ? `${ADMIN_PATH}/interviews/${emp.id}/new`
    : `${ADMIN_PATH}/interviews/record/${record?.id}/edit`;

  return `
<div style="max-width:720px;font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
    <a href="${ADMIN_PATH}/interviews/${emp.id}" style="color:#2563eb;font-size:13px;">← 履歴に戻る</a>
    ${!isNew && record ? `<button onclick="if(confirm('この面談記録を削除しますか？'))fetch('/api/interviews/${record.id}',{method:'DELETE'}).then(()=>location.href='${ADMIN_PATH}/interviews/${emp.id}')" style="padding:4px 12px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">削除</button>` : ''}
  </div>

  <!-- ヘッダー -->
  <div style="background:#1a3a5c;color:white;border-radius:10px 10px 0 0;padding:16px 20px;">
    <div style="font-size:18px;font-weight:900;letter-spacing:0.1em;text-align:center;margin-bottom:8px;">新人離職防止 面談記録シート</div>
    <div style="font-size:11px;color:#bfdbfe;text-align:center;">— 安心して乗る環境づくりのために —</div>
  </div>

  <div style="background:white;border:2px solid #1a3a5c;border-top:none;border-radius:0 0 10px 10px;padding:20px;">
    <form id="interview-form">
      <!-- 基本情報 -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px;padding-bottom:16px;border-bottom:2px solid #e5e7eb;">
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:600;">面談日 <span style="color:#ef4444;">*</span></label>
          <input type="date" name="interview_date" value="${escHtml(String(val('interview_date') || new Date().toISOString().split('T')[0]))}" required
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:13px;font-family:inherit;margin-top:3px;">
        </div>
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:600;">次回面談予定日</label>
          <input type="date" name="next_interview_date" value="${escHtml(String(val('next_interview_date')))}"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:13px;font-family:inherit;margin-top:3px;">
        </div>
        <div>
          <label style="font-size:11px;color:#6b7280;font-weight:600;">担当者</label>
          <input type="text" name="interviewer" value="${escHtml(String(val('interviewer')))}" placeholder="担当者名"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:13px;font-family:inherit;margin-top:3px;">
        </div>
      </div>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;margin-bottom:16px;font-size:13px;">
        <strong>${escHtml(emp.name)}</strong>
        <span style="color:#6b7280;margin-left:8px;">${emp.division ?? ''}課 ${emp.team ?? ''}班 / ${escHtml(emp.emp_no)}</span>
      </div>

      <!-- チェックリスト -->
      ${checkRows}

      <!-- 総合所見 -->
      <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <label style="font-size:12px;font-weight:700;color:#1a3a5c;">📌 面談で気になった点・気づき</label>
          <textarea name="concerns" rows="4" placeholder="気になる様子、発言、変化など..."
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;font-family:inherit;margin-top:4px;resize:vertical;">${escHtml(String(val('concerns')))}</textarea>
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:#1a3a5c;">📋 今後のフォロー内容・注意事項</label>
          <textarea name="followup_plan" rows="4" placeholder="フォロー方針、注意点、対応予定など..."
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;font-family:inherit;margin-top:4px;resize:vertical;">${escHtml(String(val('followup_plan')))}</textarea>
        </div>
      </div>
      <div style="margin-top:12px;">
        <label style="font-size:12px;font-weight:700;color:#1a3a5c;">💬 本人からのコメント</label>
        <textarea name="employee_comment" rows="3" placeholder="本人の言葉・要望・感想など..."
          style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;font-family:inherit;margin-top:4px;resize:vertical;">${escHtml(String(val('employee_comment')))}</textarea>
      </div>

      <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;">
        <a href="${ADMIN_PATH}/interviews/${emp.id}" style="padding:10px 20px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;text-decoration:none;color:#374151;">キャンセル</a>
        <button type="button" onclick="savePrint()" style="padding:10px 16px;background:#6b7280;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;">保存して印刷</button>
        <button type="button" onclick="saveRecord()" style="padding:10px 24px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">保存</button>
      </div>
    </form>
  </div>
</div>
<script>
const empId = ${emp.id};
const recordId = ${record?.id ?? 'null'};
const isNew = ${isNew};
const adminPath = '${ADMIN_PATH}';

function collectData() {
  const fd = new FormData(document.getElementById('interview-form'));
  const data = { emp_id: empId };
  fd.forEach((v, k) => {
    if (k.startsWith('chk_') && !k.endsWith('_note')) {
      data[k] = parseInt(v) || null;
    } else {
      data[k] = v || null;
    }
  });
  return data;
}

async function saveRecord(andPrint) {
  const data = collectData();
  const url = isNew ? '/api/interviews' : '/api/interviews/' + recordId;
  const method = isNew ? 'POST' : 'PUT';
  const res = await fetch(url, {
    method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(data)
  });
  if (res.ok) {
    if (andPrint) {
      const json = await res.json();
      const id = isNew ? json.id : recordId;
      window.open(adminPath + '/interviews/record/' + id + '/print', '_blank');
    }
    window.location.href = adminPath + '/interviews/' + empId;
  } else { alert('保存に失敗しました。'); }
}
function savePrint() { saveRecord(true); }
</script>`;
}

app.get('/interviews/:empId/new', async (c) => {
  const empId = parseInt(c.req.param('empId'));
  const emp = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(empId)
    .first<{ id: number; name: string; emp_no: string; division: number; team: number }>();
  if (!emp) return c.text('社員が見つかりません', 404);
  return c.html(layout(`${emp.name} — 面談記録`, interviewForm(emp, null, true), 'interviews'));
});

// ===== 面談記録詳細・編集 =====
app.get('/interviews/record/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const record = await c.env.DB.prepare(
    'SELECT ir.*, e.name, e.emp_no, e.division, e.team FROM interview_records ir JOIN employees e ON ir.emp_id = e.id WHERE ir.id = ?'
  ).bind(id).first<InterviewRecord & { name: string; emp_no: string; division: number; team: number }>();
  if (!record) return c.text('見つかりません', 404);
  const emp = { id: record.emp_id, name: record.name, emp_no: record.emp_no, division: record.division, team: record.team };
  return c.html(layout(`${record.name} — 面談記録編集`, interviewForm(emp, record, false), 'interviews'));
});

// ===== 面談記録 印刷ビュー =====
app.get('/interviews/record/:id/print', async (c) => {
  const id = parseInt(c.req.param('id'));
  const r = await c.env.DB.prepare(
    'SELECT ir.*, e.name, e.emp_no, e.division, e.team FROM interview_records ir JOIN employees e ON ir.emp_id = e.id WHERE ir.id = ?'
  ).bind(id).first<InterviewRecord & { name: string; emp_no: string; division: number; team: number }>();
  if (!r) return c.text('見つかりません', 404);

  const sections: Record<string, string[]> = {};
  for (const [key, meta] of Object.entries(CHK_LABEL)) {
    if (!sections[meta.section]) sections[meta.section] = [];
    sections[meta.section].push(key);
  }

  const chkSymbol = (v: number | null) => v === 3 ? '○' : v === 2 ? '△' : v === 1 ? '×' : '—';
  const chkColor = (v: number | null) => v === 3 ? '#166534' : v === 2 ? '#854d0e' : v === 1 ? '#991b1b' : '#9ca3af';

  const checkTable = Object.entries(sections).map(([section, keys]) => {
    const itemRows = keys.map(key => {
      const meta = CHK_LABEL[key];
      const val = (r as any)[key];
      const note = (r as any)[key + '_note'] ?? '';
      return `<tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:5px 8px;font-size:12px;width:50%;">${meta.icon} ${meta.label}</td>
        <td style="padding:5px 8px;text-align:center;font-size:16px;font-weight:700;color:${chkColor(val)};width:8%;">${chkSymbol(val)}</td>
        <td style="padding:5px 8px;font-size:11px;color:#6b7280;">${note ? escHtml(note) : ''}</td>
      </tr>`;
    }).join('');
    return `<tr><td colspan="3" style="background:#eff6ff;padding:5px 8px;font-size:12px;font-weight:700;color:#1a3a5c;">${escHtml(section)}</td></tr>${itemRows}`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="ja"><head>
  <meta charset="UTF-8"><meta name="robots" content="noindex">
  <title>面談記録 — ${escHtml(r.name)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Hiragino Sans', 'Meiryo', sans-serif; padding: 16px; background: white; font-size: 12px; }
    .no-print { margin-bottom: 10px; }
    @media print { .no-print { display: none; } @page { margin: 8mm; } }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #d1d5db; }
  </style></head><body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:8px 20px;background:#1a3a5c;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;">🖨️ 印刷</button>
  </div>
  <div style="text-align:center;font-size:18px;font-weight:900;letter-spacing:0.3em;margin-bottom:4px;border-bottom:2px solid #1a3a5c;padding-bottom:6px;">新人離職防止 面談記録シート</div>
  <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:12px;padding-top:4px;">
    <div>面談日: <strong>${escHtml(r.interview_date)}</strong> &nbsp; 次回: ${r.next_interview_date ? escHtml(r.next_interview_date) : '—'}</div>
    <div>${r.division ?? ''}課 ${r.team ?? ''}班 &nbsp; <strong>${escHtml(r.emp_no)}</strong> &nbsp; ${escHtml(r.name)} 様 &nbsp; 担当: ${r.interviewer ? escHtml(r.interviewer) : '—'}</div>
  </div>
  <table style="margin-bottom:8px;">
    <thead><tr style="background:#1a3a5c;color:white;">
      <th style="padding:5px 8px;text-align:left;">項目</th>
      <th style="padding:5px 8px;width:8%;">判定</th>
      <th style="padding:5px 8px;text-align:left;">状況・詳細</th>
    </tr></thead>
    <tbody>${checkTable}</tbody>
  </table>
  <table style="margin-bottom:8px;">
    <tr>
      <td style="padding:6px 8px;width:50%;vertical-align:top;">
        <div style="font-weight:700;font-size:11px;margin-bottom:3px;">📌 気になった点・気づき</div>
        <div style="font-size:12px;min-height:40px;">${r.concerns ? escHtml(r.concerns) : ''}</div>
      </td>
      <td style="padding:6px 8px;width:50%;vertical-align:top;">
        <div style="font-weight:700;font-size:11px;margin-bottom:3px;">📋 フォロー内容・注意事項</div>
        <div style="font-size:12px;min-height:40px;">${r.followup_plan ? escHtml(r.followup_plan) : ''}</div>
      </td>
    </tr>
  </table>
  <table>
    <tr>
      <td style="padding:6px 8px;vertical-align:top;">
        <div style="font-weight:700;font-size:11px;margin-bottom:3px;">💬 本人からのコメント</div>
        <div style="font-size:12px;min-height:30px;">${r.employee_comment ? escHtml(r.employee_comment) : ''}</div>
      </td>
    </tr>
  </table>
</body></html>`;
  return c.html(html);
});

// ===== 面談記録 CSV出力 =====
app.get('/interviews/export', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT ir.*, e.name, e.emp_no, e.division, e.team, e.entry_type
    FROM interview_records ir
    JOIN employees e ON ir.emp_id = e.id
    ORDER BY ir.interview_date DESC, e.division, e.team
  `).all<InterviewRecord & { name: string; emp_no: string; division: number; team: number; entry_type: string }>();

  const chkSymbol = (v: number | null) => v === 3 ? '○' : v === 2 ? '△' : v === 1 ? '×' : '';

  const headerBase = ['面談日','次回予定日','担当者','課','班','社員番号','氏名','区分'];
  const headerChk = CHK_KEYS.flatMap(k => [CHK_LABEL[k].label, CHK_LABEL[k].label + '_メモ']);
  const headerText = ['気になった点','フォロー内容','本人コメント'];
  const header = [...headerBase, ...headerChk, ...headerText].join(',');

  const body = (rows.results ?? []).map(r => {
    const base = [
      r.interview_date, r.next_interview_date ?? '', r.interviewer ?? '',
      r.division ?? '', r.team ?? '', r.emp_no,
      `"${(r.name ?? '').replace(/"/g,'""')}"`, r.entry_type ?? ''
    ];
    const chkCols = CHK_KEYS.flatMap(k => [
      chkSymbol((r as any)[k]),
      `"${((r as any)[k + '_note'] ?? '').replace(/"/g,'""')}"`
    ]);
    const textCols = [
      `"${(r.concerns ?? '').replace(/"/g,'""')}"`,
      `"${(r.followup_plan ?? '').replace(/"/g,'""')}"`,
      `"${(r.employee_comment ?? '').replace(/"/g,'""')}"`
    ];
    return [...base, ...chkCols, ...textCols].join(',');
  }).join('\n');

  return new Response(`﻿${header}\n${body}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="interviews_${new Date().toISOString().slice(0,10)}.csv"`
    }
  });
});

// ============================================================
// お知らせ配信
// ============================================================

app.get('/announcements', async (c) => {
  const employees = await c.env.DB.prepare(
    `SELECT e.id, e.name, e.emp_no, e.hire_date,
       CASE WHEN lu.emp_id IS NOT NULL THEN 1 ELSE 0 END as has_line
     FROM employees e
     LEFT JOIN line_users lu ON lu.emp_id = e.id
     WHERE e.is_active = 1
     ORDER BY e.division, e.team, e.seq_no`
  ).all<{ id: number; name: string; emp_no: string; hire_date: string; has_line: number }>();

  const history = await c.env.DB.prepare(
    'SELECT * FROM announcements ORDER BY created_at DESC LIMIT 30'
  ).all<{ id: number; title: string; message: string; target_type: string; target_data: string; sent_count: number; created_at: string }>();

  // LINE連携者（line_liff_users）一覧: ロール順（ROLE_LABELSの定義順）→名前順
  const liffUsersRes = await c.env.DB.prepare(
    `SELECT id, name, role FROM line_liff_users WHERE role != 'unknown'`
  ).all<{ id: number; name: string | null; role: string }>();
  const roleOrder = Object.keys(ROLE_LABELS);
  const liffUsers = (liffUsersRes.results ?? []).sort((a, b) =>
    (roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)) ||
    (a.name ?? '').localeCompare(b.name ?? '', 'ja')
  );
  const liffTotal = liffUsers.length;
  const liffNameMap = new Map(liffUsers.map(u => [String(u.id), u.name ?? '(名前未設定)']));

  const linkedCount = (employees.results ?? []).filter(e => e.has_line).length;

  // 入社月リスト（hire_dateの年月を集計）
  const months = [...new Set(
    (employees.results ?? [])
      .filter(e => e.hire_date)
      .map(e => e.hire_date.slice(0, 7))
  )].sort().reverse();

  const empOptions = (employees.results ?? []).map(e =>
    `<option value="${e.id}" ${!e.has_line ? 'style="color:#9ca3af;"' : ''}>
      ${escHtml(e.name)}（${escHtml(e.emp_no)}）${e.has_line ? '' : ' ※LINE未紐付'}
    </option>`
  ).join('');

  const monthOptions = months.map(m =>
    `<option value="${m}">${m.replace('-', '年')}月入社</option>`
  ).join('');

  const TARGET_LABEL: Record<string, string> = {
    all: '全員', entry_month: '入社月', individual: '個別指定', liff: 'LINE連携者'
  };

  const liffUserOptions = liffUsers.map(u =>
    `<option value="${u.id}">${escHtml(u.name ?? '(名前未設定)')}（${escHtml(ROLE_LABELS[u.role] ?? u.role)}）</option>`
  ).join('');

  const fmtTargetData = (type: string, data: string | null): string | null =>
    type === 'liff' && data
      ? data.split(',').map(x => liffNameMap.get(x.trim()) ?? x.trim()).join('・')
      : data;

  const historyRows = (history.results ?? []).map(r => `
    <tr class="hover:bg-gray-50 cursor-pointer" onclick="showDetail(${r.id})">
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${escHtml(r.title)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">
        <span style="background:#eff6ff;color:#1d4ed8;padding:2px 7px;border-radius:4px;">${escHtml(TARGET_LABEL[r.target_type] ?? r.target_type)}</span>
        ${r.target_data ? `<span style="margin-left:4px;font-size:11px;color:#9ca3af;">${escHtml(fmtTargetData(r.target_type, r.target_data) ?? '')}</span>` : ''}
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:center;">
        <span style="font-weight:700;color:#1a3a5c;">${r.sent_count}</span><span style="font-size:11px;color:#6b7280;">名</span>
      </td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">${r.created_at.slice(0, 16)}</td>
    </tr>`
  ).join('');

  const content = `
<div style="max-width:800px;font-family:'Hiragino Sans','Meiryo',sans-serif;">

  <!-- 配信フォーム -->
  <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:24px;margin-bottom:24px;">
    <h3 style="font-size:15px;font-weight:bold;color:#1e3a5f;margin-bottom:16px;">📢 お知らせを配信する</h3>

    <div style="margin-bottom:14px;">
      <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">タイトル <span style="color:#ef4444;">*</span></label>
      <input type="text" id="ann-title" placeholder="例: 6月度 研修スケジュール変更のお知らせ"
        style="width:100%;border:1px solid #d1d5db;border-radius:7px;padding:9px 12px;font-size:13px;font-family:inherit;">
    </div>

    <div style="margin-bottom:14px;">
      <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:5px;">本文 <span style="color:#ef4444;">*</span></label>
      <textarea id="ann-message" rows="5" placeholder="配信する内容を入力してください..."
        style="width:100%;border:1px solid #d1d5db;border-radius:7px;padding:9px 12px;font-size:13px;font-family:inherit;resize:vertical;"></textarea>
    </div>

    <!-- 対象選択 -->
    <div style="margin-bottom:16px;">
      <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:8px;">配信対象</label>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:7px 14px;border:1.5px solid #d1d5db;border-radius:7px;font-size:13px;" id="lbl-all">
          <input type="radio" name="target_type" value="all" checked onchange="onTargetChange(this.value)">
          全員（LINE紐付 ${linkedCount}名）
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:7px 14px;border:1.5px solid #d1d5db;border-radius:7px;font-size:13px;" id="lbl-month">
          <input type="radio" name="target_type" value="entry_month" onchange="onTargetChange(this.value)">
          入社月で絞る
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:7px 14px;border:1.5px solid #d1d5db;border-radius:7px;font-size:13px;" id="lbl-ind">
          <input type="radio" name="target_type" value="individual" onchange="onTargetChange(this.value)">
          個別指定
        </label>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:7px 14px;border:1.5px solid #d1d5db;border-radius:7px;font-size:13px;" id="lbl-liff">
          <input type="radio" name="target_type" value="liff" onchange="onTargetChange(this.value)">
          LINE連携者（${liffTotal}名）
        </label>
      </div>
      <!-- LINE連携者選択 -->
      <div id="liff-user-sel" style="display:none;margin-top:10px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
          <span style="font-size:11px;color:#6b7280;">Ctrl / Cmd + クリックで複数選択（LINE Botに登録済みの連携者）</span>
          <button type="button" onclick="toggleAllLiff(true)" style="font-size:11px;padding:2px 10px;border:1px solid #d1d5db;border-radius:5px;background:white;cursor:pointer;">全選択</button>
          <button type="button" onclick="toggleAllLiff(false)" style="font-size:11px;padding:2px 10px;border:1px solid #d1d5db;border-radius:5px;background:white;cursor:pointer;">解除</button>
        </div>
        <select id="ann-liff-users" multiple size="8"
          style="width:100%;border:1px solid #d1d5db;border-radius:7px;padding:6px;font-size:13px;">
          ${liffUserOptions || '<option disabled>LINE連携者がいません</option>'}
        </select>
      </div>
      <!-- 入社月選択 -->
      <div id="entry-month-sel" style="display:none;margin-top:10px;">
        <select id="ann-entry-month" style="border:1px solid #d1d5db;border-radius:7px;padding:7px 12px;font-size:13px;">
          ${monthOptions || '<option value="">入社月データがありません</option>'}
        </select>
      </div>
      <!-- 個別社員選択 -->
      <div id="individual-sel" style="display:none;margin-top:10px;">
        <div style="font-size:11px;color:#6b7280;margin-bottom:4px;">Ctrl / Cmd + クリックで複数選択</div>
        <select id="ann-employees" multiple size="6"
          style="width:100%;border:1px solid #d1d5db;border-radius:7px;padding:6px;font-size:13px;">
          ${empOptions}
        </select>
      </div>
    </div>

    <!-- プレビュー -->
    <div id="preview-box" style="display:none;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;margin-bottom:14px;">
      <div style="font-size:11px;font-weight:600;color:#166534;margin-bottom:6px;">📱 LINEでの表示プレビュー</div>
      <div id="preview-text" style="font-size:13px;white-space:pre-wrap;color:#1a3a5c;"></div>
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button onclick="showPreview()" style="padding:9px 18px;border:1px solid #d1d5db;border-radius:7px;font-size:13px;cursor:pointer;background:white;">プレビュー</button>
      <button onclick="sendAnnouncement()" style="padding:9px 24px;background:#1a3a5c;color:white;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">配信する</button>
    </div>
  </div>

  <!-- 配信履歴 -->
  <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);overflow:hidden;">
    <div style="padding:16px 20px;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between;align-items:center;">
      <h3 style="font-size:15px;font-weight:bold;color:#1e3a5f;">配信履歴</h3>
      <span style="font-size:12px;color:#9ca3af;">最新30件</span>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <thead style="background:#f9fafb;">
        <tr>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">タイトル</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">対象</th>
          <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">送信数</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">配信日時</th>
        </tr>
      </thead>
      <tbody id="history-body">
        ${historyRows || '<tr><td colspan="4" style="padding:24px;text-align:center;color:#9ca3af;">配信履歴がありません</td></tr>'}
      </tbody>
    </table>
  </div>

  <!-- 詳細モーダル -->
  <div id="detail-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100;align-items:center;justify-content:center;">
    <div style="background:white;border-radius:12px;padding:24px;max-width:520px;width:90%;max-height:80vh;overflow-y:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3 id="modal-title" style="font-size:16px;font-weight:bold;color:#1e3a5f;"></h3>
        <button onclick="closeModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:#6b7280;">×</button>
      </div>
      <div id="modal-body" style="font-size:13px;white-space:pre-wrap;background:#f9fafb;border-radius:8px;padding:14px;line-height:1.7;"></div>
      <div id="modal-meta" style="margin-top:12px;font-size:12px;color:#9ca3af;"></div>
    </div>
  </div>
</div>

<script>
const annHistory = ${safeJson(history.results ?? [])};

const LIFF_USER_NAMES = ${safeJson(Object.fromEntries(liffNameMap))};

function onTargetChange(val) {
  document.getElementById('entry-month-sel').style.display = val === 'entry_month' ? 'block' : 'none';
  document.getElementById('individual-sel').style.display = val === 'individual' ? 'block' : 'none';
  document.getElementById('liff-user-sel').style.display = val === 'liff' ? 'block' : 'none';
}

function toggleAllLiff(on) {
  Array.from(document.getElementById('ann-liff-users').options).forEach(o => { if (!o.disabled) o.selected = on; });
}

function getTarget() {
  const type = document.querySelector('input[name="target_type"]:checked')?.value ?? 'all';
  let data = null;
  if (type === 'entry_month') {
    data = document.getElementById('ann-entry-month').value;
  } else if (type === 'individual') {
    const sel = document.getElementById('ann-employees');
    const ids = Array.from(sel.selectedOptions).map(o => o.value).join(',');
    data = ids || null;
  } else if (type === 'liff') {
    const sel = document.getElementById('ann-liff-users');
    const ids = Array.from(sel.selectedOptions).map(o => o.value).join(',');
    data = ids || null;
  }
  return { type, data };
}

function showPreview() {
  const title = document.getElementById('ann-title').value.trim();
  const msg = document.getElementById('ann-message').value.trim();
  if (!title && !msg) return;
  const box = document.getElementById('preview-box');
  document.getElementById('preview-text').textContent = '📢 ' + (title || '（タイトル）') + '\\n\\n' + (msg || '（本文）');
  box.style.display = 'block';
}

async function sendAnnouncement() {
  const title = document.getElementById('ann-title').value.trim();
  const message = document.getElementById('ann-message').value.trim();
  if (!title || !message) { alert('タイトルと本文を入力してください'); return; }

  const { type, data } = getTarget();
  if (type === 'liff' && !data) { alert('送信するLINE連携者を1名以上選択してください'); return; }

  let liffLabel = '';
  if (type === 'liff') {
    const names = data.split(',').map(id => LIFF_USER_NAMES[id] ?? id);
    liffLabel = names.length <= 5
      ? names.join('・')
      : names.slice(0, 3).join('・') + ' ほか' + (names.length - 3) + '名';
  }
  const targetLabel = type === 'all' ? '全員'
    : type === 'entry_month' ? (data + '入社')
    : type === 'liff' ? ('LINE連携者（' + liffLabel + '）')
    : '個別指定';
  if (!confirm('「' + title + '」を ' + targetLabel + ' に配信しますか？\\n\\n' + message)) return;

  const res = await fetch('/api/line/announcements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, message, target_type: type, target_data: data })
  });
  const json = await res.json();
  if (res.ok) {
    const warn = json.warning ? '\\n⚠️ ' + json.warning : '';
    alert('配信しました！（送信数: ' + json.sent + '名）' + warn);
    location.reload();
  } else {
    alert('配信に失敗しました: ' + (json.error ?? '不明なエラー'));
  }
}

function showDetail(id) {
  const r = annHistory.find(a => a.id === id);
  if (!r) return;
  const TARGET_LABEL = { all: '全員', entry_month: '入社月', individual: '個別指定', liff: 'LINE連携者' };
  const targetData = r.target_type === 'liff' && r.target_data
    ? r.target_data.split(',').map(x => LIFF_USER_NAMES[x.trim()] ?? x.trim()).join('・')
    : r.target_data;
  document.getElementById('modal-title').textContent = r.title;
  document.getElementById('modal-body').textContent = r.message;
  document.getElementById('modal-meta').textContent =
    '対象: ' + (TARGET_LABEL[r.target_type] ?? r.target_type) +
    (targetData ? ' (' + targetData + ')' : '') +
    '　送信数: ' + r.sent_count + '名　' + r.created_at.slice(0, 16);
  const modal = document.getElementById('detail-modal');
  modal.style.display = 'flex';
}

function closeModal() {
  document.getElementById('detail-modal').style.display = 'none';
}

document.getElementById('detail-modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
</script>
`;
  return c.html(layout('お知らせ配信', content, 'announcements'));
});

// =====================
// 車両検索
// =====================
app.get('/vehicles', async (c) => {
  const q = (c.req.query('q') ?? '').trim();

  type VehicleRow = {
    id: number; radio_no: number | null; plate_no: string | null; plate_num: string | null;
    car_type: string | null; fuel: string | null; grade: string | null;
    company: string | null; office: string | null; capacity: number | null;
    luggage: string | null; office2: string | null; radio_no2: number | null;
    division: string | null; team: string | null;
    office_phone: string | null;
  };

  let results: VehicleRow[] = [];
  let searched = false;

  if (q.length > 0) {
    searched = true;
    // 完全一致のみ（Excelと同じロジック）。無線番号一致を先に表示。
    const res = await c.env.DB.prepare(`
      SELECT v.*, o.phone AS office_phone,
        CASE WHEN CAST(v.radio_no AS TEXT) = ? THEN 0 ELSE 1 END AS _sort
      FROM vehicles v
      LEFT JOIN offices o ON o.name = v.office2
      WHERE CAST(v.radio_no AS TEXT) = ? OR v.plate_num = ?
      ORDER BY _sort, v.radio_no
      LIMIT 50
    `).bind(q, q, q).all<VehicleRow>();
    results = res.results ?? [];
  }

  const rows = results.map(v => `
    <tr class="hover:bg-gray-50">
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">${v.radio_no ?? '-'}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(v.plate_no ?? '-')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(v.car_type ?? '-')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(v.office ?? '-')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${escHtml(v.division ?? '-')}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">${v.team ? escHtml(v.team) + '班' : '-'}</td>
    </tr>`).join('');

  const emptyMsg = searched
    ? `<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;">「${escHtml(q)}」の検索結果はありません</td></tr>`
    : `<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;">上の検索ボックスに番号を入力してください</td></tr>`;

  const content = `
    <form method="get" style="display:flex;gap:8px;margin-bottom:16px;">
      <input name="q" value="${escHtml(q)}" placeholder="無線番号 or ナンバー（例: 6677）"
        style="flex:1;padding:10px 14px;border:1px solid #d1d5db;border-radius:8px;font-size:15px;"
        autofocus autocomplete="off">
      <button type="submit" style="padding:10px 24px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;cursor:pointer;">検索</button>
      ${q ? `<a href="${ADMIN_PATH}/vehicles" style="padding:10px 16px;background:#e5e7eb;color:#374151;border-radius:8px;font-size:14px;text-decoration:none;display:flex;align-items:center;">クリア</a>` : ''}
    </form>

    <!-- Excelインポート -->
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:16px 20px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <span style="font-size:13px;font-weight:700;color:#1e293b;">車両データ Excelインポート</span>
        <span style="font-size:11px;color:#9ca3af;">☆車両検索.xlsx の最新版をアップロード</span>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <input type="file" id="xlsx-file" accept=".xlsx" style="font-size:13px;">
        <button onclick="previewXlsx()" style="padding:7px 16px;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">変更点を確認</button>
        <button id="btn-xlsx-import" onclick="importXlsx()" disabled
          style="padding:7px 16px;background:#166534;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;opacity:0.5;">インポート実行</button>
      </div>
      <div id="xlsx-preview" style="margin-top:12px;"></div>
    </div>

    ${searched ? `<div style="font-size:13px;color:#6b7280;margin-bottom:8px;">${results.length}件ヒット${results.length >= 50 ? '（上位50件表示）' : ''}</div>` : ''}

    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);overflow:auto;">
      <table style="width:100%;border-collapse:collapse;min-width:800px;">
        <thead style="background:#f9fafb;">
          <tr>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">無線番号</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">車両番号</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">車種</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">営業所</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">課</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">班</th>
          </tr>
        </thead>
        <tbody>${rows || emptyMsg}</tbody>
      </table>
    </div>

  <script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
  <script>
  var _diffRows = null;

  // ExcelをSheetJSでパースし差分をサーバーに確認させる
  async function previewXlsx() {
    var file = document.getElementById('xlsx-file').files[0];
    if (!file) { alert('ファイルを選択してください'); return; }
    var prev = document.getElementById('xlsx-preview');
    prev.innerHTML = '<div style="color:#6b7280;font-size:13px;">読み込み中...</div>';
    try {
      var buf = await file.arrayBuffer();
      var wb = XLSX.read(buf, { type: 'array' });
      var ws = wb.Sheets[wb.SheetNames[0]];
      var raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
      // ヘッダー行(0行目)の列インデックスを特定
      var header = raw[0];
      var colIdx = {};
      for (var i = 0; i < header.length; i++) {
        var h = header[i];
        if (h === '営業所')   colIdx.office2 = i;   // 49列目相当
        if (h === '無線番号' && i > 40) colIdx.radio_no = i; // 50列目相当
        if (h === '課')      colIdx.division = i;  // 51列目相当
        if (h === '班')      colIdx.team = i;      // 班列（将来追加）
        if (h === '車両番号' && i > 20) colIdx.plate_no = i;
        if (h === '車種名')  colIdx.car_type = i;
        if (h === '営業所' && i < 40) colIdx.office = i;
      }
      // データ行を整形（radio_noがある行のみ）
      var rows = [];
      for (var ri = 1; ri < raw.length; ri++) {
        var r = raw[ri];
        var rn = r[colIdx.radio_no];
        if (!rn || isNaN(Number(rn))) continue;
        rows.push({
          radio_no: Number(rn),
          plate_no: r[colIdx.plate_no] ? String(r[colIdx.plate_no]) : null,
          car_type: r[colIdx.car_type] ? String(r[colIdx.car_type]) : null,
          office:   r[colIdx.office]   ? String(r[colIdx.office])   : null,
          office2:  r[colIdx.office2]  ? String(r[colIdx.office2])  : null,
          division: r[colIdx.division] ? String(r[colIdx.division]) : null,
          team:     colIdx.team != null && r[colIdx.team] ? String(r[colIdx.team]) : null,
        });
      }
      // サーバーに差分確認を依頼
      var res = await fetch('${ADMIN_PATH}/vehicles/xlsx-diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rows }),
      });
      if (!res.ok) { prev.innerHTML = '<div style="color:#dc2626;font-size:13px;">エラー: ' + (await res.text()) + '</div>'; return; }
      var data = await res.json();
      _diffRows = data.rows;
      var btn = document.getElementById('btn-xlsx-import');
      if (!_diffRows || _diffRows.length === 0) {
        prev.innerHTML = '<div style="color:#6b7280;font-size:13px;">変更点はありません（最新の状態です）</div>';
        btn.disabled = true; btn.style.opacity = '0.5'; return;
      }
      btn.disabled = false; btn.style.opacity = '1';
      var html = '<div style="font-size:13px;font-weight:600;color:#1e293b;margin-bottom:8px;">変更点: ' + _diffRows.length + '件</div>';
      html += '<div style="overflow:auto;max-height:200px;border:1px solid #e5e7eb;border-radius:6px;">';
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
      html += '<thead style="background:#f9fafb;"><tr><th style="padding:4px 8px;border-bottom:1px solid #e5e7eb;text-align:left;">無線番号</th><th style="padding:4px 8px;border-bottom:1px solid #e5e7eb;text-align:left;">項目</th><th style="padding:4px 8px;border-bottom:1px solid #e5e7eb;text-align:left;">変更前</th><th style="padding:4px 8px;border-bottom:1px solid #e5e7eb;text-align:left;">変更後</th></tr></thead>';
      html += '<tbody>' + _diffRows.map(function(r) {
        return r.changes.map(function(ch) {
          return '<tr><td style="padding:3px 8px;border-bottom:1px solid #f3f4f6;">' + r.radio_no + '</td>'
            + '<td style="padding:3px 8px;border-bottom:1px solid #f3f4f6;">' + ch.field + '</td>'
            + '<td style="padding:3px 8px;border-bottom:1px solid #f3f4f6;color:#dc2626;">' + (ch.old ?? '-') + '</td>'
            + '<td style="padding:3px 8px;border-bottom:1px solid #f3f4f6;color:#16a34a;">' + (ch.new ?? '-') + '</td></tr>';
        }).join('');
      }).join('') + '</tbody></table></div>';
      prev.innerHTML = html;
    } catch(e) {
      prev.innerHTML = '<div style="color:#dc2626;font-size:13px;">ファイルの読み込みに失敗しました: ' + e.message + '</div>';
    }
  }

  async function importXlsx() {
    if (!_diffRows || _diffRows.length === 0) return;
    if (!confirm(_diffRows.length + '件の変更を適用しますか？')) return;
    var btn = document.getElementById('btn-xlsx-import');
    btn.disabled = true; btn.textContent = '適用中...';
    var res = await fetch('${ADMIN_PATH}/vehicles/xlsx-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: _diffRows }),
    });
    if (!res.ok) { alert('エラー: ' + (await res.text())); btn.disabled = false; btn.textContent = 'インポート実行'; return; }
    var data = await res.json();
    alert(data.updated + '件を更新しました。');
    location.reload();
  }
  </script>
  `;
  return c.html(layout('車両検索', content, 'vehicles'));
});

// =====================
// 車両データ Excelプレビュー用：フロントがパースしたデータをDBと比較して差分を返す
// =====================
app.post('/vehicles/xlsx-diff', async (c) => {
  const body = await c.req.json<{
    rows: Array<{ radio_no: number; plate_no: string; car_type: string; office: string; office2: string; division: string; team: string | null }>
  }>();
  const incoming = body.rows ?? [];
  if (incoming.length === 0) return c.json({ rows: [] });

  // DBの現在データを取得
  type DbRow = { id: number; radio_no: number | null; plate_no: string | null; car_type: string | null; office: string | null; office2: string | null; division: string | null; team: string | null };
  const dbRows = await c.env.DB.prepare(
    'SELECT id, radio_no, plate_no, car_type, office, office2, division, team FROM vehicles'
  ).all<DbRow>();
  const dbMap = new Map<number, DbRow>();
  for (const r of (dbRows.results ?? [])) if (r.radio_no != null) dbMap.set(r.radio_no, r);

  type Change = { field: string; old: string | null; new: string | null };
  type DiffRow = { radio_no: number; id: number; changes: Change[] };
  const diffs: DiffRow[] = [];

  const FIELDS: Array<{ key: keyof DbRow; label: string }> = [
    { key: 'plate_no', label: '車両番号' },
    { key: 'car_type', label: '車種' },
    { key: 'office',   label: '営業所' },
    { key: 'office2',  label: '詳細営業所' },
    { key: 'division', label: '課' },
    { key: 'team',     label: '班' },
  ];

  for (const row of incoming) {
    const db = dbMap.get(row.radio_no);
    if (!db) continue; // 新規追加は対象外（既存のみ更新）
    const changes: Change[] = [];
    for (const { key, label } of FIELDS) {
      const oldVal = db[key] as string | null;
      const newVal = (row as Record<string, unknown>)[key] as string | null;
      if ((oldVal ?? '') !== (newVal ?? '')) {
        changes.push({ field: label, old: oldVal, new: newVal });
      }
    }
    if (changes.length > 0) diffs.push({ radio_no: row.radio_no, id: db.id, changes });
  }

  return c.json({ rows: diffs });
});

// =====================
// 車両データ Excelインポート実行（差分をDBに適用）
// =====================
app.post('/vehicles/xlsx-import', async (c) => {
  const body = await c.req.json<{
    rows: Array<{ radio_no: number; id: number; changes: Array<{ field: string; old: string | null; new: string | null }> }>
  }>();
  const diffs = body.rows ?? [];
  if (diffs.length === 0) return c.json({ updated: 0 });

  const FIELD_TO_COL: Record<string, string> = {
    '車両番号': 'plate_no',
    '車種':     'car_type',
    '営業所':   'office',
    '詳細営業所': 'office2',
    '課':       'division',
    '班':       'team',
  };

  let updated = 0;
  for (const diff of diffs) {
    const sets: string[] = [];
    const vals: (string | null)[] = [];
    for (const ch of diff.changes) {
      const col = FIELD_TO_COL[ch.field];
      if (!col) continue;
      sets.push(`${col} = ?`);
      vals.push(ch.new);
    }
    if (sets.length === 0) continue;
    vals.push(String(diff.id));
    await c.env.DB.prepare(
      `UPDATE vehicles SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...vals).run();
    updated++;
  }

  return c.json({ updated });
});

// =====================
// 営業所管理
// =====================
app.get('/settings/offices', async (c) => {
  type OfficeRow = { id: number; name: string; short_name: string; phone: string | null; address: string | null; note: string | null };
  const res = await c.env.DB.prepare(
    'SELECT id, name, short_name, phone, address, note FROM offices ORDER BY sort_order, id'
  ).all<OfficeRow>();
  const offices = res.results ?? [];

  const rows = offices.map(o => `
    <tr id="row-${o.id}">
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;color:#374151;">${escHtml(o.short_name)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <input type="tel" value="${escHtml(o.phone ?? '')}" id="phone-${o.id}" placeholder="03-XXXX-XXXX"
          style="width:140px;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <input type="text" value="${escHtml(o.address ?? '')}" id="address-${o.id}" placeholder="住所（任意）"
          style="width:220px;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;">
        <input type="text" value="${escHtml(o.note ?? '')}" id="note-${o.id}" placeholder="備考（任意）"
          style="width:160px;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;">
      </td>
    </tr>`).join('');

  const ids = offices.map(o => o.id);

  const html = `
    <div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 設定に戻る</a>
      <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">営業所管理</h2>
    </div>
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:20px;max-width:800px;">
      <p style="font-size:13px;color:#6b7280;margin:0 0 16px;">各営業所の電話番号・住所を設定します。車両検索の結果に反映されます。</p>
      <div style="overflow:auto;">
        <table style="width:100%;border-collapse:collapse;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">営業所</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">電話番号</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">住所</th>
              <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;border-bottom:1px solid #e5e7eb;">備考</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="margin-top:16px;display:flex;align-items:center;gap:12px;">
        <button onclick="saveAll()" id="save-btn"
          style="padding:10px 28px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
          保存
        </button>
        <span id="save-msg" style="font-size:13px;color:#16a34a;display:none;">保存しました</span>
      </div>
    </div>

    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:20px;max-width:800px;margin-top:16px;">
      <h3 style="font-size:14px;font-weight:700;color:#1e3a5f;margin:0 0 12px;">連絡先を追加</h3>
      <p style="font-size:12px;color:#6b7280;margin:0 0 12px;">本社・配車センターなど、営業所以外の連絡先もここに追加できます。「その他機能」LIFFの電話番号一覧にも反映されます。</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
        <div>
          <label style="display:block;font-size:12px;color:#374151;margin-bottom:4px;">名称</label>
          <input type="text" id="new-name" placeholder="例: 本社" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;width:160px;">
        </div>
        <div>
          <label style="display:block;font-size:12px;color:#374151;margin-bottom:4px;">電話番号</label>
          <input type="tel" id="new-phone" placeholder="03-XXXX-XXXX" style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;width:140px;">
        </div>
        <button onclick="addOffice()" id="add-btn"
          style="padding:8px 20px;background:#16a34a;color:white;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
          追加
        </button>
      </div>
    </div>

    <script>
      var IDS = ${JSON.stringify(ids)};
      async function addOffice() {
        var name = document.getElementById('new-name').value.trim();
        var phone = document.getElementById('new-phone').value.trim();
        if (!name) { alert('名称を入力してください'); return; }
        var btn = document.getElementById('add-btn');
        btn.disabled = true; btn.textContent = '追加中...';
        var res = await fetch('${ADMIN_PATH}/api/offices/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name, phone: phone })
        });
        btn.disabled = false; btn.textContent = '追加';
        if (res.ok) {
          location.reload();
        } else {
          var data = await res.json().catch(function() { return {}; });
          alert('追加に失敗しました: ' + (data.error || '不明なエラー'));
        }
      }
      async function saveAll() {
        var btn = document.getElementById('save-btn');
        btn.disabled = true; btn.textContent = '保存中...';
        var payload = IDS.map(function(id) {
          return {
            id: id,
            phone:   document.getElementById('phone-'   + id).value.trim(),
            address: document.getElementById('address-' + id).value.trim(),
            note:    document.getElementById('note-'    + id).value.trim()
          };
        });
        var res = await fetch('${ADMIN_PATH}/api/offices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        btn.disabled = false;
        if (res.ok) {
          btn.textContent = '保存';
          var msg = document.getElementById('save-msg');
          msg.style.display = 'inline';
          setTimeout(function() { msg.style.display = 'none'; }, 2500);
        } else {
          btn.textContent = '保存';
          alert('保存に失敗しました');
        }
      }
    </script>`;
  return c.html(layout('営業所管理', html, 'settings'));
});

app.post('/api/offices', async (c) => {
  type OfficeUpdate = { id: number; phone: string; address: string; note: string };
  const body = await c.req.json<OfficeUpdate[]>();
  if (!Array.isArray(body)) return c.text('Bad Request', 400);
  const stmts = body.map(item =>
    c.env.DB.prepare('UPDATE offices SET phone = ?, address = ?, note = ? WHERE id = ?')
      .bind(item.phone || null, item.address || null, item.note || null, item.id)
  );
  await c.env.DB.batch(stmts);
  return c.text('OK');
});

app.post('/api/offices/add', async (c) => {
  const body = await c.req.json<{ name: string; phone?: string }>();
  const name = (body.name ?? '').trim();
  if (!name) return c.json({ error: '名称は必須です' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM offices WHERE name = ?').bind(name).first();
  if (existing) return c.json({ error: 'この名称はすでに登録されています' }, 409);

  const maxSort = await c.env.DB.prepare('SELECT MAX(sort_order) AS m FROM offices').first<{ m: number | null }>();
  const nextSort = (maxSort?.m ?? 0) + 1;

  await c.env.DB.prepare(
    'INSERT INTO offices (name, short_name, phone, sort_order) VALUES (?, ?, ?, ?)'
  ).bind(name, name, (body.phone ?? '').trim() || null, nextSort).run();

  return c.json({ ok: true });
});

export default app;
