// 要望欄
// /requests        : サイドバーから誰でもアクセス可（要望の投稿・自分の投稿履歴）
// /request-review  : 収集した要望の一覧（フル権限adminのみ・permissions.tsのPATH_PERMISSIONSに未掲載のため
//                     制限付きアカウントは403。設定ページのカードもdata-perm-key="settings.requests-admin"で
//                     どの権限キーにも該当しないため制限付きアカウントの一覧からは自動的に消える。admin_line_usage.tsと同じ手法）
import { Hono } from 'hono';
import { layout, safeJson } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const CATEGORIES = ['機能追加', '不具合', '使いにくい点', 'その他'];

type RequestRow = {
  id: number; admin_id: number; admin_name: string;
  category: string; content: string; status: string;
  created_at: string; updated_at: string;
};

function settingsSubHeader(title: string): string {
  return `<div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 設定に戻る</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">${title}</h2>
  </div>`;
}

// ===== 投稿ページ =====
app.get('/requests', async (c) => {
  const adminId = c.get('adminId');
  const rows = await c.env.DB.prepare(
    'SELECT * FROM feature_requests WHERE admin_id = ? ORDER BY created_at DESC'
  ).bind(adminId).all<RequestRow>();
  const mine = rows.results ?? [];

  const html = `
    <div style="max-width:640px;">
      <p style="font-size:13px;color:#6b7280;margin:0 0 18px;">ホシコンについての要望・意見・欲しい機能などを自由に記入してください。内容は管理者に届きます。</p>

      <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px;margin-bottom:24px;">
        <div style="display:flex;flex-direction:column;gap:12px;">
          <label style="font-size:12px;color:#374151;">カテゴリ<br>
            <select id="f-category" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;box-sizing:border-box;">
              ${CATEGORIES.map(cat => `<option value="${cat}">${cat}</option>`).join('')}
            </select>
          </label>
          <label style="font-size:12px;color:#374151;">内容<br>
            <textarea id="f-content" rows="6" placeholder="例：〇〇のページで△△ができるようにしてほしい" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;box-sizing:border-box;resize:vertical;"></textarea>
          </label>
        </div>
        <div id="form-msg" style="font-size:12px;color:#dc2626;margin-top:10px;"></div>
        <div style="display:flex;justify-content:flex-end;margin-top:16px;">
          <button onclick="submitRequest()" id="submit-btn" style="padding:8px 24px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">送信する</button>
        </div>
      </div>

      <div style="font-size:12px;font-weight:700;color:#9ca3af;letter-spacing:0.08em;margin-bottom:10px;">自分が投稿した要望</div>
      <div id="mine-list" style="display:flex;flex-direction:column;gap:10px;"></div>
    </div>

    <script>
    var MINE = ${safeJson(mine)};

    function escHtmlJs(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    var STATUS_COLOR = { '未対応': '#9ca3af', '確認済み': '#d97706', '対応済み': '#059669' };

    function renderMine() {
      var el = document.getElementById('mine-list');
      if (MINE.length === 0) {
        el.innerHTML = '<div style="color:#9ca3af;font-size:13px;padding:12px;">まだ投稿はありません</div>';
        return;
      }
      el.innerHTML = MINE.map(function(r) {
        var color = STATUS_COLOR[r.status] || '#9ca3af';
        return '<div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:14px 16px;">'
          + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">'
          + '<span style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;padding:1px 8px;font-size:11px;">' + escHtmlJs(r.category) + '</span>'
          + '<span style="color:' + color + ';font-size:11px;font-weight:600;">' + escHtmlJs(r.status) + '</span>'
          + '<span style="margin-left:auto;color:#9ca3af;font-size:11px;">' + escHtmlJs((r.created_at || '').slice(0, 16)) + '</span>'
          + '</div>'
          + '<div style="font-size:13px;color:#1f2937;white-space:pre-wrap;">' + escHtmlJs(r.content) + '</div>'
          + '</div>';
      }).join('');
    }

    async function submitRequest() {
      var content = document.getElementById('f-content').value.trim();
      var category = document.getElementById('f-category').value;
      var msg = document.getElementById('form-msg');
      if (!content) { msg.textContent = '内容を入力してください'; return; }

      var btn = document.getElementById('submit-btn');
      btn.disabled = true; btn.textContent = '送信中...';
      try {
        var res = await fetch('/api/requests', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: category, content: content }),
        });
        if (res.ok) { location.reload(); return; }
        var j = await res.json().catch(function() { return {}; });
        msg.textContent = j.error || '送信に失敗しました';
      } catch (e) {
        msg.textContent = '通信エラーが発生しました';
      }
      btn.disabled = false; btn.textContent = '送信する';
    }

    renderMine();
    </script>`;

  return c.html(layout('要望欄', html, 'requests'));
});

// ===== 収集一覧（フル権限adminのみ） =====
app.get('/request-review', async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM feature_requests ORDER BY created_at DESC').all<RequestRow>();
  const requests = rows.results ?? [];

  const html = settingsSubHeader('要望欄（収集一覧）') + `
    <div style="max-width:820px;">
      <p style="font-size:13px;color:#6b7280;margin:0 0 14px;">サイドバー「要望欄」から寄せられた要望・意見の一覧です。</p>
      <div id="req-list" style="display:flex;flex-direction:column;gap:10px;"></div>
    </div>

    <script>
    var REQUESTS = ${safeJson(requests)};
    var STATUSES = ${safeJson(['未対応', '確認済み', '対応済み'])};
    var STATUS_COLOR = { '未対応': '#9ca3af', '確認済み': '#d97706', '対応済み': '#059669' };

    function escHtmlJs(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function render() {
      var el = document.getElementById('req-list');
      if (REQUESTS.length === 0) {
        el.innerHTML = '<div style="color:#9ca3af;font-size:13px;padding:24px;text-align:center;">まだ要望はありません</div>';
        return;
      }
      el.innerHTML = REQUESTS.map(function(r) {
        var color = STATUS_COLOR[r.status] || '#9ca3af';
        var opts = STATUSES.map(function(s) {
          return '<option value="' + s + '"' + (s === r.status ? ' selected' : '') + '>' + s + '</option>';
        }).join('');
        return '<div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:14px 16px;">'
          + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">'
          + '<span style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;padding:1px 8px;font-size:11px;">' + escHtmlJs(r.category) + '</span>'
          + '<span style="font-size:12px;color:#374151;font-weight:600;">' + escHtmlJs(r.admin_name) + '</span>'
          + '<span style="color:#9ca3af;font-size:11px;">' + escHtmlJs((r.created_at || '').slice(0, 16)) + '</span>'
          + '<select onchange="updateStatus(' + r.id + ', this.value)" style="margin-left:auto;border:1px solid ' + color + ';color:' + color + ';border-radius:4px;padding:2px 6px;font-size:11px;font-weight:600;">' + opts + '</select>'
          + '<button onclick="delRequest(' + r.id + ')" style="padding:3px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;">削除</button>'
          + '</div>'
          + '<div style="font-size:13px;color:#1f2937;white-space:pre-wrap;">' + escHtmlJs(r.content) + '</div>'
          + '</div>';
      }).join('');
    }

    async function updateStatus(id, status) {
      await fetch('/api/requests/' + id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: status }),
      });
      var r = REQUESTS.find(function(x) { return x.id === id; });
      if (r) r.status = status;
      render();
    }

    async function delRequest(id) {
      if (!confirm('この要望を削除しますか？')) return;
      await fetch('/api/requests/' + id, { method: 'DELETE' });
      REQUESTS = REQUESTS.filter(function(x) { return x.id !== id; });
      render();
    }

    render();
    </script>`;

  return c.html(layout('要望欄（収集一覧）', html, 'settings'));
});

export default app;
