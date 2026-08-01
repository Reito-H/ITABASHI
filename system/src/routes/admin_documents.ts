// 設定: 資料センター（マニュアルPDF・就業規則等のファイル保管）

import { Hono } from 'hono';
import { layout, safeJson } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const DEFAULT_CATEGORIES = ['マニュアル', '就業規則', 'その他'];

type ResourceRow = {
  id: number; title: string; category: string; filename: string | null;
  mime_type: string | null; size_bytes: number | null;
  has_text: number; uploaded_by: string | null;
  created_at: string; updated_at: string;
};

function settingsSubHeader(title: string): string {
  return `<div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 設定に戻る</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">${title}</h2>
  </div>`;
}

app.get('/settings/documents', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, title, category, filename, mime_type, size_bytes, (content_text IS NOT NULL) AS has_text, uploaded_by, created_at, updated_at FROM resources ORDER BY created_at DESC'
  ).all<ResourceRow>();
  const resources = rows.results ?? [];

  const categories = Array.from(new Set([...DEFAULT_CATEGORIES, ...resources.map(r => r.category)]));

  const html = settingsSubHeader('資料センター') + `
    <div style="max-width:960px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
        <p style="font-size:13px;color:#6b7280;margin:0;">マニュアルPDF・就業規則・その他の資料を保存し、カテゴリで分類して閲覧できます。</p>
        <button onclick="openAdd()" style="margin-left:auto;padding:7px 18px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">資料を追加</button>
      </div>

      <div id="cat-filter" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;"></div>

      <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <thead>
            <tr style="background:#f9fafb;color:#6b7280;font-size:11px;">
              <th style="padding:8px 10px;text-align:left;">タイトル</th>
              <th style="padding:8px 10px;text-align:left;">カテゴリ</th>
              <th style="padding:8px 10px;text-align:left;">ファイル</th>
              <th style="padding:8px 10px;text-align:right;">サイズ</th>
              <th style="padding:8px 10px;text-align:left;">登録者・日時</th>
              <th style="padding:8px 10px;text-align:left;">操作</th>
            </tr>
          </thead>
          <tbody id="doc-rows"></tbody>
        </table>
      </div>
    </div>

    <!-- 追加/編集モーダル -->
    <div id="doc-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:50;overflow-y:auto;padding:24px;">
      <div style="background:white;border-radius:12px;max-width:480px;margin:0 auto;padding:24px;">
        <h3 id="doc-modal-title" style="font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:16px;"></h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <label style="font-size:12px;color:#374151;">タイトル<br>
            <input type="text" id="f-title" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;box-sizing:border-box;">
          </label>
          <label style="font-size:12px;color:#374151;">カテゴリ<br>
            <input type="text" id="f-category" list="cat-list" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;box-sizing:border-box;">
            <datalist id="cat-list"></datalist>
          </label>
          <label id="f-file-wrap" style="font-size:12px;color:#374151;">ファイル（PDF・Word・Excel・画像）<br>
            <input type="file" id="f-file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif" style="width:100%;font-size:13px;">
          </label>
        </div>
        <div id="doc-form-msg" style="font-size:12px;color:#dc2626;margin-top:10px;"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
          <button onclick="closeModal()" style="padding:8px 20px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">キャンセル</button>
          <button onclick="saveDoc()" id="doc-save-btn" style="padding:8px 24px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">保存</button>
        </div>
      </div>
    </div>

    <!-- テキスト内容表示モーダル -->
    <div id="text-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:50;overflow-y:auto;padding:24px;">
      <div style="background:white;border-radius:12px;max-width:720px;margin:0 auto;padding:24px;">
        <h3 id="text-modal-title" style="font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:12px;"></h3>
        <div id="text-modal-body" style="white-space:pre-wrap;font-size:13px;line-height:1.7;color:#1f2937;max-height:60vh;overflow-y:auto;background:#f9fafb;border-radius:8px;padding:14px 16px;"></div>
        <div style="display:flex;justify-content:flex-end;margin-top:16px;">
          <button onclick="document.getElementById('text-modal').style.display='none'" style="padding:8px 20px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">閉じる</button>
        </div>
      </div>
    </div>

    <script>
    var RESOURCES = ${safeJson(resources)};
    var CATEGORIES = ${safeJson(categories)};
    var API = '/api/documents';
    var curFilter = null;
    var editingId = 0;

    function renderFilters() {
      var uniq = Array.from(new Set(RESOURCES.map(function(r) { return r.category; }).concat(CATEGORIES)));
      var h = '<button onclick="setFilter(null)" class="cat-chip" style="' + chipStyle(curFilter === null) + '">すべて</button>';
      uniq.forEach(function(cat) {
        h += '<button onclick="setFilter(' + attrJson(cat) + ')" class="cat-chip" style="' + chipStyle(curFilter === cat) + '">' + escHtmlJs(cat) + '</button>';
      });
      document.getElementById('cat-filter').innerHTML = h;
      var dl = document.getElementById('cat-list');
      dl.innerHTML = uniq.map(function(c) { return '<option value="' + escHtmlJs(c) + '">'; }).join('');
    }
    function chipStyle(active) {
      return 'padding:5px 14px;border-radius:20px;font-size:12px;cursor:pointer;font-weight:600;border:1px solid ' + (active ? '#1a3a5c' : '#d1d5db') + ';background:' + (active ? '#1a3a5c' : 'white') + ';color:' + (active ? 'white' : '#374151') + ';';
    }
    function setFilter(cat) { curFilter = cat; renderFilters(); renderRows(); }
    function escHtmlJs(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    // onclick="fn(...)" のような二重引用符属性に埋め込むための JSON文字列（属性を壊さないよう " を &quot; に変換）
    function attrJson(v) { return JSON.stringify(v).replace(/"/g, '&quot;'); }

    function renderRows() {
      var list = curFilter ? RESOURCES.filter(function(r) { return r.category === curFilter; }) : RESOURCES;
      if (list.length === 0) {
        document.getElementById('doc-rows').innerHTML = '<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;">資料が登録されていません</td></tr>';
        return;
      }
      document.getElementById('doc-rows').innerHTML = list.map(function(r) {
        var fileCell = r.filename
          ? '<a href="' + API + '/' + r.id + '/file" target="_blank" style="color:#1d4ed8;text-decoration:none;">' + escHtmlJs(r.filename) + '</a>'
          : (r.has_text ? '<span style="color:#9ca3af;">（テキスト）</span>' : '<span style="color:#d1d5db;">—</span>');
        var openBtn = r.filename
          ? '<a href="' + API + '/' + r.id + '/file" target="_blank" style="padding:3px 10px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:12px;text-decoration:none;">開く</a>'
          : (r.has_text ? '<button onclick="viewText(' + r.id + ')" style="padding:3px 10px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:12px;cursor:pointer;">内容を見る</button>' : '');
        return '<tr style="border-bottom:1px solid #f3f4f6;">'
          + '<td style="padding:8px 10px;font-weight:600;color:#1f2937;">' + escHtmlJs(r.title) + '</td>'
          + '<td style="padding:8px 10px;"><span style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:4px;padding:1px 8px;font-size:12px;">' + escHtmlJs(r.category) + '</span></td>'
          + '<td style="padding:8px 10px;">' + fileCell + '</td>'
          + '<td style="padding:8px 10px;text-align:right;color:#6b7280;">' + fmtSize(r.size_bytes) + '</td>'
          + '<td style="padding:8px 10px;color:#6b7280;font-size:12px;">' + escHtmlJs(r.uploaded_by || '—') + '<br>' + escHtmlJs((r.created_at || '').slice(0, 16)) + '</td>'
          + '<td style="padding:8px 10px;white-space:nowrap;">'
          + openBtn
          + ' <button onclick="openEdit(' + r.id + ')" style="padding:3px 10px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">編集</button>'
          + ' <button onclick="delDoc(' + r.id + ',' + attrJson(r.title) + ')" style="padding:3px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">削除</button>'
          + '</td></tr>';
      }).join('');
    }
    function fmtSize(bytes) {
      if (!bytes) return '—';
      if (bytes < 1024 * 1024) return Math.ceil(bytes / 1024) + 'KB';
      return (bytes / 1024 / 1024).toFixed(1) + 'MB';
    }

    function openAdd() {
      editingId = 0;
      document.getElementById('doc-modal-title').textContent = '資料を追加';
      document.getElementById('f-title').value = '';
      document.getElementById('f-category').value = '';
      document.getElementById('f-file').value = '';
      document.getElementById('f-file-wrap').style.display = '';
      document.getElementById('doc-form-msg').textContent = '';
      document.getElementById('doc-modal').style.display = 'block';
    }
    function openEdit(id) {
      var r = RESOURCES.find(function(x) { return x.id === id; });
      if (!r) return;
      editingId = id;
      document.getElementById('doc-modal-title').textContent = '資料の編集: ' + r.title;
      document.getElementById('f-title').value = r.title;
      document.getElementById('f-category').value = r.category;
      document.getElementById('f-file-wrap').style.display = 'none';
      document.getElementById('doc-form-msg').textContent = '';
      document.getElementById('doc-modal').style.display = 'block';
    }
    function closeModal() { document.getElementById('doc-modal').style.display = 'none'; }

    async function saveDoc() {
      var title = document.getElementById('f-title').value.trim();
      var category = document.getElementById('f-category').value.trim();
      var msg = document.getElementById('doc-form-msg');
      if (!title || !category) { msg.textContent = 'タイトルとカテゴリを入力してください'; return; }

      var btn = document.getElementById('doc-save-btn');
      btn.disabled = true; btn.textContent = '保存中...';
      var res;
      try {
        if (editingId) {
          res = await fetch(API + '/' + editingId, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title, category: category }),
          });
        } else {
          var file = document.getElementById('f-file').files[0];
          if (!file) { msg.textContent = 'ファイルを選択してください'; btn.disabled = false; btn.textContent = '保存'; return; }
          var fd = new FormData();
          fd.append('title', title); fd.append('category', category); fd.append('file', file);
          res = await fetch(API, { method: 'POST', body: fd });
        }
        if (res.ok) { location.reload(); return; }
        var j = await res.json().catch(function() { return {}; });
        msg.textContent = j.error || '保存に失敗しました';
      } catch (e) {
        msg.textContent = '通信エラーが発生しました';
      }
      btn.disabled = false; btn.textContent = '保存';
    }

    async function delDoc(id, title) {
      if (!confirm('資料「' + title + '」を削除しますか？')) return;
      await fetch(API + '/' + id, { method: 'DELETE' });
      location.reload();
    }

    async function viewText(id) {
      var res = await fetch(API + '/' + id + '/content');
      if (!res.ok) { alert('内容を取得できませんでした'); return; }
      var j = await res.json();
      document.getElementById('text-modal-title').textContent = j.title;
      document.getElementById('text-modal-body').textContent = j.content;
      document.getElementById('text-modal').style.display = 'block';
    }

    renderFilters();
    renderRows();
    </script>`;

  return c.html(layout('資料センター', html, 'settings'));
});

export default app;
