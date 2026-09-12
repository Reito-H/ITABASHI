// 設定: 学習ノート（個人の学習用ノート教材をタイトルごとに保存し、PDF出力する機能）
// ページ画像はスクリーンショット等をまとめてアップロードし、1冊のPDFとして書き出せる。
// 管理者本人の私的な学習用途を想定した機能。

import { Hono } from 'hono';
import { layout, safeJson } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

type BookRow = {
  id: number; title: string; page_count: number;
  created_by: string | null; created_at: string; updated_at: string;
};

function settingsSubHeader(title: string): string {
  return `<div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 設定に戻る</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">学習ノート</h2>
  </div>`;
}

app.get('/settings/study-notes', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, title, page_count, created_by, created_at, updated_at FROM study_note_books ORDER BY created_at DESC'
  ).all<BookRow>();
  const books = rows.results ?? [];

  const html = settingsSubHeader('学習ノート') + `
    <div style="max-width:900px;">
      <p style="font-size:13px;color:#6b7280;margin:0 0 14px;line-height:1.7;">
        個人の学習用ノート教材をタイトルごとに保存します。ページ画像（PNG/JPEG）をまとめてアップロードすると、
        1冊のPDFとして書き出せます。<strong>私的な学習目的のみで利用し、外部への公開・共有はしないでください。</strong>
      </p>

      <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
        <button onclick="openCreate()" style="padding:8px 20px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">＋ 新規タイトル</button>
      </div>

      <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden;">
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <thead>
            <tr style="background:#f9fafb;color:#6b7280;font-size:11px;">
              <th style="padding:8px 10px;text-align:left;">タイトル</th>
              <th style="padding:8px 10px;text-align:right;">ページ数</th>
              <th style="padding:8px 10px;text-align:left;">作成者・日時</th>
              <th style="padding:8px 10px;text-align:left;">操作</th>
            </tr>
          </thead>
          <tbody id="book-rows"></tbody>
        </table>
      </div>

      <!-- 新規作成モーダル -->
      <div id="create-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:50;overflow-y:auto;padding:24px;">
        <div style="background:white;border-radius:12px;max-width:420px;margin:0 auto;padding:24px;">
          <h3 style="font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:16px;">新規タイトル</h3>
          <label style="font-size:12px;color:#374151;">タイトル<br>
            <input type="text" id="c-title" placeholder="例: 宅建士 権利関係" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;box-sizing:border-box;">
          </label>
          <div id="create-msg" style="font-size:12px;color:#dc2626;margin-top:10px;"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
            <button onclick="closeCreate()" style="padding:8px 20px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">キャンセル</button>
            <button onclick="doCreate()" id="create-btn" style="padding:8px 24px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">作成</button>
          </div>
        </div>
      </div>

      <input type="file" id="page-file-input" accept="image/png,image/jpeg" multiple style="display:none;" onchange="handlePageFiles(this.files)">

      <!-- プレビュー -->
      <div id="preview-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:60;align-items:center;justify-content:center;flex-direction:column;">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;color:white;">
          <button onclick="prevPreview()" style="padding:6px 16px;background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.4);border-radius:6px;font-size:13px;cursor:pointer;">← 前へ</button>
          <span id="preview-counter" style="font-size:14px;font-weight:600;"></span>
          <button onclick="nextPreview()" style="padding:6px 16px;background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.4);border-radius:6px;font-size:13px;cursor:pointer;">次へ →</button>
          <button onclick="closePreview()" style="padding:6px 16px;background:#dc2626;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;margin-left:10px;">閉じる ✕</button>
        </div>
        <img id="preview-img" style="max-width:90vw;max-height:82vh;object-fit:contain;background:white;border-radius:4px;">
      </div>
    </div>

    <script>
    var API = '/api/study-notes';
    var BOOKS = ${safeJson(books)};
    var uploadTargetId = 0;

    function escHtmlJs(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    function fmtDateTime(row) {
      var who = row.created_by || '—';
      var when = (row.created_at || '').slice(0, 16);
      return escHtmlJs(who) + '<br>' + escHtmlJs(when);
    }

    function renderRows() {
      if (!BOOKS.length) {
        document.getElementById('book-rows').innerHTML = '<tr><td colspan="4" style="padding:24px;text-align:center;color:#9ca3af;">まだタイトルがありません</td></tr>';
        return;
      }
      document.getElementById('book-rows').innerHTML = BOOKS.map(function(b) {
        var pdfBtn = b.page_count > 0
          ? '<button id="pdf-btn-' + b.id + '" onclick="downloadPdf(' + b.id + ')" style="padding:3px 10px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:12px;cursor:pointer;">PDF出力</button> '
          : '<span style="color:#d1d5db;font-size:12px;">PDF出力</span>';
        var previewBtn = b.page_count > 0
          ? '<button onclick="openPreview(' + b.id + ',' + b.page_count + ')" style="padding:3px 10px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">プレビュー</button> '
          : '';
        return '<tr style="border-bottom:1px solid #f3f4f6;">'
          + '<td style="padding:8px 10px;font-weight:600;color:#1f2937;">' + escHtmlJs(b.title) + '</td>'
          + '<td style="padding:8px 10px;text-align:right;color:#374151;">' + b.page_count + '</td>'
          + '<td style="padding:8px 10px;color:#6b7280;font-size:12px;">' + fmtDateTime(b) + '</td>'
          + '<td style="padding:8px 10px;white-space:nowrap;">'
          + previewBtn
          + '<button onclick="startUpload(' + b.id + ')" style="padding:3px 10px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">ページ追加</button> '
          + pdfBtn + ' '
          + '<button onclick="delBook(' + b.id + ',' + JSON.stringify(b.title).replace(/"/g, '&quot;') + ')" style="padding:3px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">削除</button>'
          + '</td></tr>';
      }).join('');
    }

    function openCreate() {
      document.getElementById('c-title').value = '';
      document.getElementById('create-msg').textContent = '';
      document.getElementById('create-modal').style.display = 'block';
    }
    function closeCreate() { document.getElementById('create-modal').style.display = 'none'; }

    async function doCreate() {
      var title = document.getElementById('c-title').value.trim();
      var msg = document.getElementById('create-msg');
      if (!title) { msg.textContent = 'タイトルを入力してください'; return; }
      var btn = document.getElementById('create-btn');
      btn.disabled = true; btn.textContent = '作成中...';
      try {
        var res = await fetch(API, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title }),
        });
        if (res.ok) { location.reload(); return; }
        var j = await res.json().catch(function () { return {}; });
        msg.textContent = j.error || '作成に失敗しました';
      } catch (e) {
        msg.textContent = '通信エラーが発生しました';
      }
      btn.disabled = false; btn.textContent = '作成';
    }

    function startUpload(id) {
      uploadTargetId = id;
      document.getElementById('page-file-input').value = '';
      document.getElementById('page-file-input').click();
    }

    async function handlePageFiles(fileList) {
      if (!fileList || !fileList.length || !uploadTargetId) return;
      var fd = new FormData();
      Array.prototype.forEach.call(fileList, function (f) { fd.append('files', f); });
      try {
        var res = await fetch(API + '/' + uploadTargetId + '/pages', { method: 'POST', body: fd });
        if (res.ok) { location.reload(); return; }
        var j = await res.json().catch(function () { return {}; });
        alert(j.error || 'アップロードに失敗しました');
      } catch (e) {
        alert('通信エラーが発生しました');
      }
    }

    async function delBook(id, title) {
      if (!confirm('「' + title + '」を削除しますか？ページ画像もすべて削除され、元に戻せません。')) return;
      await fetch(API + '/' + id, { method: 'DELETE' });
      location.reload();
    }

    // ===== PDF出力 =====
    // Cloudflare Worker側は1回にMAX_CHUNKページまでしか生成できないため、
    // それを超える本はチャンクごとに取得してブラウザ側（pdf-lib）で結合する。
    var MAX_CHUNK = 60;
    var pdfLibLoadPromise = null;
    function loadPdfLib() {
      if (window.PDFLib) return Promise.resolve();
      if (pdfLibLoadPromise) return pdfLibLoadPromise;
      pdfLibLoadPromise = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      return pdfLibLoadPromise;
    }

    async function downloadPdf(id) {
      var b = BOOKS.find(function (x) { return x.id === id; });
      if (!b) return;
      var btn = document.getElementById('pdf-btn-' + id);

      if (b.page_count <= MAX_CHUNK) {
        window.open(API + '/' + id + '/pdf', '_blank');
        return;
      }

      if (btn) { btn.disabled = true; btn.textContent = '生成中 0%'; }
      try {
        await loadPdfLib();
        var merged = await PDFLib.PDFDocument.create();
        var from = 1;
        while (from <= b.page_count) {
          var to = Math.min(from + MAX_CHUNK - 1, b.page_count);
          var res = await fetch(API + '/' + id + '/pdf?from=' + from + '&to=' + to);
          if (!res.ok) throw new Error('ページ ' + from + '〜' + to + ' の取得に失敗しました');
          var buf = await res.arrayBuffer();
          var chunkDoc = await PDFLib.PDFDocument.load(buf);
          var pages = await merged.copyPages(chunkDoc, chunkDoc.getPageIndices());
          pages.forEach(function (p) { merged.addPage(p); });
          if (btn) btn.textContent = '生成中 ' + Math.round((to / b.page_count) * 100) + '%';
          from = to + 1;
        }
        var bytes = await merged.save();
        var blob = new Blob([bytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = b.title + '.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
      } catch (e) {
        alert('PDF生成に失敗しました: ' + e.message);
      }
      if (btn) { btn.disabled = false; btn.textContent = 'PDF出力'; }
    }

    // ===== プレビュー =====
    var previewBookId = 0, previewPage = 1, previewTotal = 0;

    function openPreview(id, total) {
      previewBookId = id; previewTotal = total; previewPage = 1;
      document.getElementById('preview-modal').style.display = 'flex';
      renderPreview();
    }
    function renderPreview() {
      document.getElementById('preview-img').src = API + '/' + previewBookId + '/pages/' + previewPage + '?t=' + Date.now();
      document.getElementById('preview-counter').textContent = previewPage + ' / ' + previewTotal;
    }
    function prevPreview() { if (previewPage > 1) { previewPage--; renderPreview(); } }
    function nextPreview() { if (previewPage < previewTotal) { previewPage++; renderPreview(); } }
    function closePreview() { document.getElementById('preview-modal').style.display = 'none'; }
    document.addEventListener('keydown', function (e) {
      if (document.getElementById('preview-modal').style.display !== 'flex') return;
      if (e.key === 'ArrowLeft') prevPreview();
      else if (e.key === 'ArrowRight') nextPreview();
      else if (e.key === 'Escape') closePreview();
    });

    renderRows();
    </script>`;

  return c.html(layout('学習ノート', html, 'settings'));
});

export default app;
