// 設定: データセンター（資料保管＋各種ファイルアップロードの共通窓口）
// 資料センターを拡張し、社員CSV・点検写真AI取込・乗務員シフトPDFの
// アップロードUIをここに集約する（バックエンドAPIは従来のものをそのまま利用）。

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

  const empRows = await c.env.DB.prepare('SELECT emp_no FROM employees').all<{ emp_no: string }>();
  const existingEmpNos = (empRows.results ?? []).map(e => e.emp_no);

  const html = settingsSubHeader('データセンター') + `
    <style>
      .dc-tab-btn { padding:9px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid #d1d5db;background:white;color:#374151; }
      .dc-tab-btn.active { background:#1a3a5c;border-color:#1a3a5c;color:white; }
    </style>
    <div style="max-width:1100px;">
      <p style="font-size:13px;color:#6b7280;margin:0 0 14px;">ファイルのアップロード窓口をここに集約しています。区分を選んでからファイルを入れてください。</p>

      <div id="dc-tabs" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px;">
        <button type="button" class="dc-tab-btn" data-tab="documents" data-perm-key="settings.documents" onclick="dcShowTab('documents')">📁 資料</button>
        <button type="button" class="dc-tab-btn" data-tab="staff-csv" data-perm-key="staff" onclick="dcShowTab('staff-csv')">👥 社員CSV</button>
        <button type="button" class="dc-tab-btn" data-tab="inspection-photo" data-perm-key="inspection" onclick="dcShowTab('inspection-photo')">📷 点検写真AI取込</button>
        <button type="button" class="dc-tab-btn" data-tab="crew-shift-pdf" data-perm-key="crew-shift" onclick="dcShowTab('crew-shift-pdf')">📄 乗務員シフトPDF</button>
        <button type="button" class="dc-tab-btn" data-tab="dotai" data-perm-key="staff" onclick="dcShowTab('dotai')">🧭 動態表</button>
      </div>

      <!-- ===== 資料 ===== -->
      <div class="dc-tab-panel" data-tab="documents" data-perm-key="settings.documents" style="display:none;max-width:960px;">
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
      </div>

      <!-- ===== 社員CSV ===== -->
      <div class="dc-tab-panel" data-tab="staff-csv" data-perm-key="staff" style="display:none;">
        <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;">
          <h2 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">
            CSV インポート
          </h2>
          <p style="font-size:12px;color:#6b7280;margin:0 0 14px;">
            出庫データCSV（Shift-JIS）、または「ホシコン収集データ」形式のCSVを選択してください。社員番号をキーに既存社員は更新、未登録社員は新規追加します。
          </p>

          <input type="file" id="csv-file-input" accept=".csv,.CSV"
            style="display:none;"
            onchange="handleCsvFile(this.files[0])">
          <label id="csv-drop-zone" for="csv-file-input"
            style="display:block;border:2px dashed #d1d5db;border-radius:8px;padding:28px;text-align:center;cursor:pointer;margin-bottom:14px;transition:border-color 0.2s;"
            ondragover="event.preventDefault();this.style.borderColor='#1a3a5c'"
            ondragleave="this.style.borderColor='#d1d5db'"
            ondrop="handleCsvDrop(event)">
            <div style="font-size:13px;color:#6b7280;">クリックまたはドラッグでCSVファイルを選択</div>
            <div style="font-size:11px;color:#9ca3af;margin-top:4px;">Shift-JIS / UTF-8 両対応</div>
          </label>

          <div id="csv-progress" style="display:none;margin-bottom:10px;">
            <div style="font-size:12px;color:#374151;margin-bottom:4px;" id="csv-progress-label">処理中…</div>
            <div style="background:#e5e7eb;border-radius:4px;height:6px;overflow:hidden;">
              <div id="csv-progress-bar" style="background:#1a3a5c;height:6px;width:0%;transition:width 0.2s;"></div>
            </div>
          </div>

          <div id="csv-preview" style="display:none;">
            <div id="csv-summary" style="font-size:13px;color:#374151;margin-bottom:10px;"></div>
            <div style="overflow-x:auto;max-height:320px;border:1px solid #e5e7eb;border-radius:6px;">
              <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:860px;">
                <thead style="background:#f9fafb;position:sticky;top:0;">
                  <tr>
                    <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">状態</th>
                    <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">社員番号</th>
                    <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">氏名 / 読み仮名</th>
                    <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">課・班</th>
                    <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">勤務体系</th>
                    <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">出勤時間</th>
                    <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">使用車番（頻度順）</th>
                    <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">平均帰庫</th>
                    <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">備考</th>
                  </tr>
                </thead>
                <tbody id="csv-preview-body"></tbody>
              </table>
            </div>
            <div id="csv-retirement-candidates" style="display:none;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-top:12px;"></div>
            <div style="display:flex;gap:10px;margin-top:14px;justify-content:flex-end;">
              <button onclick="clearCsvImport()" style="padding:8px 16px;background:#f3f4f6;color:#374151;border:none;border-radius:6px;font-size:13px;cursor:pointer;">キャンセル</button>
              <button id="csv-import-btn" onclick="executeCsvImport()"
                style="padding:8px 20px;background:#166534;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">
                インポート実行
              </button>
            </div>
          </div>
          <div id="csv-result" style="display:none;"></div>
        </div>
      </div>

      <!-- ===== 点検写真AI取込 ===== -->
      <div class="dc-tab-panel" data-tab="inspection-photo" data-perm-key="inspection" style="display:none;">
        <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;">
          <h2 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">点検写真AI取込</h2>
          <p style="font-size:12px;color:#6b7280;margin:0 0 14px;">点検表の写真をアップロードすると、AIが車番・種別を読み取って登録候補を作成します。登録先の年月・課を選んでから写真を選択してください。</p>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
            <label style="font-size:12px;color:#374151;">年月：</label>
            <select id="dc-ins-year" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;"></select>年
            <select id="dc-ins-month" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;"></select>月
            <span style="color:#d1d5db;">｜</span>
            <label style="font-size:12px;color:#374151;">課：</label>
            <div style="display:flex;gap:4px;">
              <button type="button" class="dc-ins-dept-btn" data-dept="1" onclick="dcInsSelDept(1)">1課</button>
              <button type="button" class="dc-ins-dept-btn" data-dept="2" onclick="dcInsSelDept(2)">2課</button>
              <button type="button" class="dc-ins-dept-btn" data-dept="3" onclick="dcInsSelDept(3)">3課</button>
              <button type="button" class="dc-ins-dept-btn" data-dept="4" onclick="dcInsSelDept(4)">4課</button>
            </div>
          </div>
          <input type="file" id="dc-ins-photo-file" accept="image/*" style="display:none" onchange="dcInsPhotoSelected(this)">
          <button onclick="document.getElementById('dc-ins-photo-file').click()" style="padding:9px 20px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">📷 写真を選択してAI解析</button>
        </div>

        <div id="dc-ins-ai-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;padding:12px;">
          <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:620px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <div style="font-size:15px;font-weight:700;color:#1e3a5f;margin-bottom:10px;">📷 写真からAI取込</div>
            <div id="dc-ins-ai-body"></div>
          </div>
        </div>
      </div>

      <!-- ===== 乗務員シフトPDF ===== -->
      <div class="dc-tab-panel" data-tab="crew-shift-pdf" data-perm-key="crew-shift" style="display:none;">
        <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;">
          <h2 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">乗務員シフトPDFの取込</h2>
          <p style="font-size:12px;color:#6b7280;margin:0 0 12px;">
            「◆月初勤務予定表◆」形式のPDFをアップロードします。PDF内の期間と重なる既存データは新しい内容で上書きされます。氏名・記号はテキストとして読み取るため、AIによる誤読はありません（レイアウトが想定と大きく異なる場合のみ取込に失敗します）。
          </p>
          <input type="file" id="cs-import-file" accept="application/pdf" style="margin-bottom:12px;">
          <div id="cs-import-result" style="font-size:12px;margin-bottom:10px;"></div>
          <div style="display:flex;justify-content:flex-end;">
            <button onclick="csDoImport()" id="cs-import-btn" style="padding:9px 20px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">取込実行</button>
          </div>
        </div>
      </div>

      <!-- ===== 動態表（人事システム出力 xlsx） ===== -->
      <div class="dc-tab-panel" data-tab="dotai" data-perm-key="staff" style="display:none;">
        <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;">
          <h2 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">社員動態表の取込</h2>
          <p style="font-size:12px;color:#6b7280;margin:0 0 14px;line-height:1.7;">
            人事システムから出力した「動態表（.xlsx）」を選択してください。ブラウザ内で解析し、内容を確認してから反映します。<br>
            ・<strong>在籍者一覧</strong>… 社員コードで突合し、生年月日・氏名・カナ・入社日・初乗務日・課・採用区分を更新。未登録者は新規追加<br>
            ・<strong>退職一覧</strong>… 「退職」は退職処理、「退職予定」は予定日のみ設定、「退職取下」は在籍へ復帰<br>
            ・<strong>グループ内／社内異動一覧</strong>… 在籍者一覧に無く現営業所が板橋以外の人を在籍から除外<br>
            ・<strong>配属一覧</strong>… 「入社」区分の入社予定者を新規追加<br>
            <span style="color:#9ca3af;">※ 生年月日は労共契約アラートの基礎データになります。氏名は空白を除いて一致する場合は書き換えません。</span>
          </p>

          <input type="file" id="dt-file" accept=".xlsx,.xlsm" style="display:none;" onchange="dtHandleFile(this.files[0])">
          <label id="dt-drop" for="dt-file"
            style="display:block;border:2px dashed #d1d5db;border-radius:8px;padding:26px;text-align:center;cursor:pointer;margin-bottom:14px;">
            <div style="font-size:13px;color:#6b7280;">クリックまたはドラッグで動態表(.xlsx)を選択</div>
          </label>

          <div id="dt-status" style="font-size:12px;color:#374151;margin-bottom:10px;"></div>

          <div id="dt-preview" style="display:none;">
            <div id="dt-summary" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;"></div>
            <div id="dt-sections"></div>
            <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end;align-items:center;">
              <label style="font-size:12px;color:#374151;display:flex;align-items:center;gap:5px;">
                <input type="checkbox" id="dt-confirm"> 内容を確認しました
              </label>
              <button onclick="dtClear()" style="padding:8px 16px;background:#f3f4f6;color:#374151;border:none;border-radius:6px;font-size:13px;cursor:pointer;">キャンセル</button>
              <button id="dt-exec" onclick="dtExecute()" disabled
                style="padding:8px 20px;background:#166534;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;opacity:.5;">反映を実行</button>
            </div>
          </div>
          <div id="dt-result" style="display:none;margin-top:12px;"></div>
        </div>
      </div>
    </div>

    <script>
    var ADMIN_PATH = '${ADMIN_PATH}';

    // ===== タブ切替 =====
    function dcShowTab(id) {
      document.querySelectorAll('.dc-tab-btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.tab === id);
      });
      document.querySelectorAll('.dc-tab-panel').forEach(function(p) {
        p.style.display = (p.dataset.tab === id) ? 'block' : 'none';
      });
    }
    (function dcInit() {
      var btns = Array.prototype.slice.call(document.querySelectorAll('.dc-tab-btn'));
      if (!btns.length) return;
      var qs = new URLSearchParams(location.search);
      var want = qs.get('tab');
      var match = btns.filter(function(b) { return b.dataset.tab === want; })[0];
      dcShowTab((match || btns[0]).dataset.tab);
    })();

    // ===== 資料 =====
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

    // ===== 社員CSV =====
    var csvParsedData = [];
    var EXISTING_EMP_NOS = new Set(${JSON.stringify(existingEmpNos)});

    function handleCsvDrop(event) {
      event.preventDefault();
      document.getElementById('csv-drop-zone').style.borderColor = '#d1d5db';
      const file = event.dataTransfer.files[0];
      if (file) handleCsvFile(file);
    }

    function setProgress(pct, label) {
      const wrap = document.getElementById('csv-progress');
      const bar  = document.getElementById('csv-progress-bar');
      const lbl  = document.getElementById('csv-progress-label');
      if (!wrap) return;
      if (pct === null) { wrap.style.display = 'none'; return; }
      wrap.style.display = 'block';
      bar.style.width = pct + '%';
      lbl.textContent = label;
    }

    function handleCsvFile(file) {
      if (!file) return;
      document.getElementById('csv-drop-zone').style.borderColor = '#1a3a5c';
      setProgress(0, 'ファイル読み込み中…');
      const reader = new FileReader();
      reader.onload = async e => {
        const buf = e.target.result;
        let text;
        try { text = new TextDecoder('shift-jis').decode(buf); }
        catch { text = new TextDecoder('utf-8').decode(buf); }
        await parseCsvText(text);
      };
      reader.readAsArrayBuffer(file);
    }

    const WORK_TYPE_MAP = {
      '日勤A':'a','日勤Ａ':'a','日勤B':'b','日勤Ｂ':'b',
      'D勤':'D','Ｄ勤':'D','B勤':'B','Ｂ勤':'B',
      'H勤':'H','Ｈ勤':'H','公H':'H','公Ｈ':'H',
      '公B':'b','公Ｂ':'b','公D':'D','公Ｄ':'D','公a':'a','公ａ':'a','公b':'B','公ｂ':'B',
      'A勤':'a','Ａ勤':'a',
    };
    const TIME_CANDS = [6.0,6.5,8.0,9.5,15.0,16.0,18.0,19.0];
    const TIME_LABELS = {6.0:'6:00',6.5:'6:50',8.0:'8:00',9.5:'9:30',15.0:'15:00',16.0:'16:00',18.0:'18:00',19.0:'19:00'};

    function snapStartTime(h) {
      let best=TIME_CANDS[0], bd=Math.abs(h-best);
      for (const c of TIME_CANDS) { const d=Math.abs(h-c); if(d<bd){bd=d;best=c;} }
      return TIME_LABELS[best]||null;
    }
    function fmtHours(h) {
      if(isNaN(h)||h<0) return null;
      const hr=Math.floor(h)%24, mn=Math.round((h-Math.floor(h))*60);
      return String(hr).padStart(2,'0')+':'+String(mn<60?mn:59).padStart(2,'0');
    }
    function modeOf(arr) {
      if(!arr.length) return null;
      const f={}; for(const v of arr) f[v]=(f[v]||0)+1;
      return Object.entries(f).sort((a,b)=>b[1]-a[1])[0][0];
    }
    function avgOf(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null; }

    async function parseCsvText(text) {
      const lines = text.split(/\\r?\\n/);
      const total = lines.length;
      const empMap = {};
      let csvMaxDate = '';

      const firstCols = (lines[0] || '').split(',');
      const isHoshiconFormat = firstCols[0].trim() === '日付' && firstCols.length >= 38;
      const startLine = isHoshiconFormat ? 1 : 0;

      const CHUNK = 8000;
      for (let i = startLine; i < total; i += CHUNK) {
        const end = Math.min(i + CHUNK, total);
        for (let j = i; j < end; j++) {
          const line = lines[j];
          if (!line || !line.trim()) continue;
          const cols = line.split(',');

          let dateRaw, teamRaw, empNo, name, workRaw, carRaw, startRaw, retRaw, salesRaw, rideCountRaw, distanceRaw;
          let safetyRaw = null;
          let laborHours = null;
          let nightHours = null;
          let overtimeHours = null;
          let rawCsv = null;
          if (isHoshiconFormat) {
            if (cols.length < 40) continue;
            rawCsv = JSON.stringify(cols);
            dateRaw = cols[0]?.trim();
            teamRaw = cols[3]?.trim();
            carRaw  = cols[4]?.trim();
            empNo   = cols[5]?.trim();
            name    = cols[6]?.trim();
            workRaw = cols[8]?.trim();
            salesRaw = cols[21]?.trim();
            rideCountRaw = cols[20]?.trim();
            distanceRaw  = cols[18]?.trim();
            const constraintRaw = parseFloat(cols[13]?.trim());
            const breakRaw = parseFloat(cols[14]?.trim());
            if (!isNaN(constraintRaw) && !isNaN(breakRaw)) {
              const lh = constraintRaw - breakRaw;
              if (lh > 0 && lh < 24) laborHours = lh;
            }
            const nightRaw = parseFloat(cols[16]?.trim());
            const overtimeRaw = parseFloat(cols[17]?.trim());
            if (!isNaN(nightRaw) && nightRaw >= 0) nightHours = nightRaw;
            if (!isNaN(overtimeRaw) && overtimeRaw >= 0) overtimeHours = overtimeRaw;
            startRaw = parseFloat(cols[38]?.trim());
            retRaw   = parseFloat(cols[39]?.trim());
            safetyRaw = {
              harshStartLoaded: parseInt(cols[25]?.trim(), 10), harshStartEmpty: parseInt(cols[26]?.trim(), 10),
              harshAccelLoaded: parseInt(cols[27]?.trim(), 10), harshAccelEmpty: parseInt(cols[28]?.trim(), 10),
              harshDecelLoaded: parseInt(cols[29]?.trim(), 10), harshDecelEmpty: parseInt(cols[30]?.trim(), 10),
              maxSpeedLoadedHighway: parseInt(cols[35]?.trim(), 10), maxSpeedEmptyHighway: parseInt(cols[34]?.trim(), 10),
              maxSpeedLoadedLocal: parseInt(cols[37]?.trim(), 10), maxSpeedEmptyLocal: parseInt(cols[36]?.trim(), 10),
            };
          } else {
            if (cols.length < 8) continue;
            dateRaw = cols[0]?.trim();
            teamRaw = cols[2]?.trim();
            empNo   = cols[3]?.trim();
            name    = cols[4]?.trim();
            workRaw = cols[5]?.trim();
            carRaw  = cols[6]?.trim();
            startRaw = parseFloat(cols[7]?.trim());
            retRaw   = parseFloat(cols[8]?.trim());
            salesRaw = cols[9]?.trim();
            rideCountRaw = undefined;
            distanceRaw  = undefined;
          }

          if (!empNo || !name || !/^\\d{8}$/.test(empNo)) continue;
          if (dateRaw && dateRaw > csvMaxDate) csvMaxDate = dateRaw;

          if (!empMap[empNo]) {
            empMap[empNo] = { emp_no:empNo, name, team:parseInt(teamRaw)||null,
              workTypes:[], carFreq:{}, startEntries:[], returnTimes:[], dates:[], salesEntries:[], safetyEntries:[] };
          }
          const e = empMap[empNo];
          const mapped = WORK_TYPE_MAP[workRaw];
          if (mapped) e.workTypes.push(mapped);
          if (carRaw && /^\\d+$/.test(carRaw)) e.carFreq[carRaw] = (e.carFreq[carRaw]||0)+1;
          if (!isNaN(startRaw) && startRaw>0) e.startEntries.push({date:dateRaw, time:startRaw});
          if (!isNaN(retRaw) && retRaw>0) e.returnTimes.push(retRaw);
          if (dateRaw) e.dates.push(dateRaw);

          const dateMatch = dateRaw ? dateRaw.match(/^(\\d{4})\\/(\\d{1,2})\\/(\\d{1,2})$/) : null;
          const isoDate = dateMatch ? dateMatch[1] + '-' + dateMatch[2].padStart(2,'0') + '-' + dateMatch[3].padStart(2,'0') : null;

          const salesAmount = parseInt(salesRaw, 10);
          if (mapped && isoDate && !isNaN(salesAmount) && salesAmount >= 0 && salesAmount <= 999999) {
            const rowStartTime = (!isNaN(startRaw) && startRaw>0) ? fmtHours(startRaw) : null;
            const rowReturnTime = (!isNaN(retRaw) && retRaw>0) ? fmtHours(retRaw) : null;
            const rideCountNum = rideCountRaw !== undefined ? parseInt(rideCountRaw, 10) : NaN;
            const distanceNum  = distanceRaw !== undefined ? parseFloat(distanceRaw) : NaN;
            e.salesEntries.push({
              date: isoDate, dutyCode: mapped, amount: salesAmount,
              startTime: rowStartTime, returnTime: rowReturnTime,
              rideCount: !isNaN(rideCountNum) ? rideCountNum : null,
              distanceKm: !isNaN(distanceNum) ? Math.round(distanceNum) : null,
              laborHours, nightHours, overtimeHours, rawCsv,
            });
          }

          if (safetyRaw && isoDate) {
            const clean = (v) => !isNaN(v) ? v : null;
            const hasAny = Object.values(safetyRaw).some(v => !isNaN(v));
            if (hasAny) {
              e.safetyEntries.push({
                date: isoDate,
                harshStartLoaded: clean(safetyRaw.harshStartLoaded), harshStartEmpty: clean(safetyRaw.harshStartEmpty),
                harshAccelLoaded: clean(safetyRaw.harshAccelLoaded), harshAccelEmpty: clean(safetyRaw.harshAccelEmpty),
                harshDecelLoaded: clean(safetyRaw.harshDecelLoaded), harshDecelEmpty: clean(safetyRaw.harshDecelEmpty),
                maxSpeedLoadedHighway: clean(safetyRaw.maxSpeedLoadedHighway), maxSpeedEmptyHighway: clean(safetyRaw.maxSpeedEmptyHighway),
                maxSpeedLoadedLocal: clean(safetyRaw.maxSpeedLoadedLocal), maxSpeedEmptyLocal: clean(safetyRaw.maxSpeedEmptyLocal),
              });
            }
          }
        }
        setProgress(Math.floor(end / total * 80), \`解析中 \${end.toLocaleString()} / \${total.toLocaleString()} 行\`);
        await new Promise(r => setTimeout(r, 0));
      }

      let recentCutoff = '';
      if (csvMaxDate) {
        const ms = new Date(csvMaxDate.replace(/\\//g,'-')).getTime() - 30*86400000;
        recentCutoff = new Date(ms).toISOString().slice(0,10).replace(/-/g,'/');
      }

      csvParsedData = Object.values(empMap).map(e => {
        const work_schedule = modeOf(e.workTypes);
        const allTimes = e.startEntries.map(s=>s.time);
        const start_time = avgOf(allTimes) !== null ? snapStartTime(avgOf(allTimes)) : null;

        const sortedCars = Object.entries(e.carFreq).sort((a,b)=>b[1]-a[1]).map(([c])=>c);
        const used_cars = sortedCars.length ? JSON.stringify(sortedCars.slice(0,5)) : null;
        const topCarsDisplay = sortedCars.slice(0,3).join(' / ') || '—';

        const avg_return_time = fmtHours(avgOf(e.returnTimes));
        const division = e.team ? Math.ceil(e.team/2) : null;

        const uniqDates = [...new Set(e.dates)].sort();
        const lastDate = uniqDates[uniqDates.length-1] || null;
        let daysSinceLast = null;
        if (lastDate && csvMaxDate) {
          daysSinceLast = Math.floor(
            (new Date(csvMaxDate.replace(/\\//g,'-')) - new Date(lastDate.replace(/\\//g,'-'))) / 86400000
          );
        }
        const isLongAbsent = daysSinceLast !== null && daysSinceLast >= 90;

        let hasTimeChange=false, recentAvg=null, earlyAvg=null;
        if (recentCutoff && e.startEntries.length >= 6) {
          const rec = e.startEntries.filter(s=>s.date>=recentCutoff).map(s=>s.time);
          const ear = e.startEntries.filter(s=>s.date< recentCutoff).map(s=>s.time);
          if (rec.length>=3 && ear.length>=3) {
            recentAvg=avgOf(rec); earlyAvg=avgOf(ear);
            hasTimeChange = Math.abs(recentAvg-earlyAvg) >= 2;
          }
        }

        return {
          emp_no:e.emp_no, name:e.name, name_kana:null,
          division, team:e.team,
          work_schedule, start_time,
          used_cars, topCarsDisplay,
          avg_return_time,
          lastDate, daysSinceLast, isLongAbsent,
          hasTimeChange, recentAvg, earlyAvg,
          salesEntries: e.salesEntries,
          safetyEntries: e.safetyEntries,
        };
      });

      setProgress(90, '表示構築中…');
      await new Promise(r => setTimeout(r, 0));
      await renderCsvPreview();
      setProgress(null, '');
    }

    function renderCsvPreview() {
      const newCnt    = csvParsedData.filter(e=>!EXISTING_EMP_NOS.has(e.emp_no)).length;
      const updCnt    = csvParsedData.filter(e=> EXISTING_EMP_NOS.has(e.emp_no)).length;
      const absCnt    = csvParsedData.filter(e=>e.isLongAbsent).length;
      const chgCnt    = csvParsedData.filter(e=>e.hasTimeChange).length;
      const salesCnt  = csvParsedData.reduce((s,e)=>s+(e.salesEntries?e.salesEntries.length:0), 0);

      document.getElementById('csv-summary').innerHTML =
        '解析: <strong>'+csvParsedData.length+'名</strong> — '+
        '<span style="color:#166534;">新規追加 '+newCnt+'名</span> / '+
        '<span style="color:#1d4ed8;">更新 '+updCnt+'名</span>'+
        (absCnt ? ' / <span style="color:#dc2626;">長期不在 '+absCnt+'名</span>' : '')+
        (chgCnt ? ' / <span style="color:#d97706;">シフト変化 '+chgCnt+'名</span>' : '')+
        (salesCnt ? ' / <span style="color:#059669;">税込売上 '+salesCnt+'件を反映</span>' : '')+
        '<div style="font-size:11px;color:#6b7280;margin-top:4px;">※ CSV追加社員は一般社員として登録されます。新人シフト管理には出ません。</div>'+
        (salesCnt ? '<div style="font-size:11px;color:#6b7280;margin-top:2px;">※ 税込売上は該当日の社員の売上記録に反映されます（既存の手入力があれば上書き、乗車回数は保持）。</div>' : '');

      const tbody = document.getElementById('csv-preview-body');
      tbody.innerHTML = csvParsedData.map(e => {
        const isNew = !EXISTING_EMP_NOS.has(e.emp_no);
        const badge = isNew
          ? '<span style="background:#dcfce7;color:#166534;padding:1px 5px;border-radius:3px;font-weight:700;font-size:10px;">新規</span>'
          : '<span style="background:#dbeafe;color:#1d4ed8;padding:1px 5px;border-radius:3px;font-weight:700;font-size:10px;">更新</span>';
        const flags = [];
        if (e.isLongAbsent)  flags.push('<span style="background:#fee2e2;color:#dc2626;padding:1px 4px;border-radius:3px;font-size:10px;font-weight:700;">不在'+e.daysSinceLast+'日</span>');
        if (e.hasTimeChange) {
          const from=e.earlyAvg!==null?snapStartTime(e.earlyAvg):'?';
          const to  =e.recentAvg!==null?snapStartTime(e.recentAvg):'?';
          flags.push('<span style="background:#fef3c7;color:#92400e;padding:1px 4px;border-radius:3px;font-size:10px;font-weight:700;">'+from+'→'+to+'</span>');
        }
        const rowBg = e.isLongAbsent?'#fff1f2':e.hasTimeChange?'#fffbeb':'';
        return '<tr style="border-bottom:1px solid #f3f4f6;'+(rowBg?'background:'+rowBg+';':'')+'">' +
          '<td style="padding:5px 8px;">'+badge+'</td>' +
          '<td style="padding:5px 8px;font-family:monospace;color:#6b7280;font-size:11px;">'+e.emp_no+'</td>' +
          '<td style="padding:5px 8px;"><div style="font-weight:600;font-size:12px;">'+(e.name||'—')+'</div>'+
            (e.name_kana?'<div style="font-size:11px;color:#9ca3af;">'+e.name_kana+'</div>':'')+
            '</td>' +
          '<td style="padding:5px 8px;font-size:12px;">'+(e.division?e.division+'課 ':'')+( e.team?e.team+'班':'—')+'</td>' +
          '<td style="padding:5px 8px;font-size:12px;">'+(e.work_schedule||'—')+'</td>' +
          '<td style="padding:5px 8px;font-size:12px;">'+(e.start_time||'—')+'</td>' +
          '<td style="padding:5px 8px;font-family:monospace;font-size:11px;color:#374151;">'+(e.topCarsDisplay)+'</td>' +
          '<td style="padding:5px 8px;font-size:12px;color:#6b7280;">'+(e.avg_return_time||'—')+'</td>' +
          '<td style="padding:5px 8px;">'+flags.join(' ')+'</td>' +
          '</tr>';
      }).join('');

      const absent  = csvParsedData.filter(e=>e.isLongAbsent);
      const changed = csvParsedData.filter(e=>e.hasTimeChange);
      const retDiv  = document.getElementById('csv-retirement-candidates');
      if (retDiv) {
        if (!absent.length && !changed.length) {
          retDiv.style.display = 'none';
        } else {
          const btnStyle = 'cursor:pointer;border:none;border-radius:5px;padding:4px 10px;font-size:11px;font-weight:700;';
          let h = '<div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:10px;">退職候補リスト（要確認）' +
            '<span style="font-weight:400;font-size:11px;color:#78350f;margin-left:8px;">チェックして一括処理できます</span></div>';

          h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
            '<label style="font-size:11px;font-weight:700;color:#374151;cursor:pointer;">' +
            '<input type="checkbox" id="ret-all-cb" onchange="retToggleAll(this)"> 全選択</label>' +
            '<button style="'+btnStyle+'background:#fee2e2;color:#dc2626;" onclick="retBulkAction(&#39;retire&#39;)">退職処理</button>' +
            '<button style="'+btnStyle+'background:#374151;color:white;" onclick="retBulkAction(&#39;purge&#39;)">完全削除</button>' +
            '</div>';

          if (absent.length) {
            h += '<div style="font-size:11px;font-weight:700;color:#b45309;margin-bottom:5px;">' +
              '<label style="cursor:pointer;"><input type="checkbox" class="ret-grp-cb" data-grp="absent" onchange="retToggleGroup(this)"> 長期不在（3ヶ月以上出勤なし ' + absent.length + '名）</label></div>';
            h += '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;padding-left:18px;">';
            for (const e of absent) {
              h += '<label style="display:flex;align-items:center;gap:4px;background:white;border:1px solid #fecaca;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">' +
                '<input type="checkbox" class="ret-cb" data-grp="absent" value="'+e.emp_no+'">' +
                '<b>'+e.name+'</b>' +
                '<span style="font-family:monospace;color:#9ca3af;font-size:10px;">'+e.emp_no+'</span>' +
                '<span style="color:#dc2626;">最終:'+e.lastDate+'（'+e.daysSinceLast+'日前）</span></label>';
            }
            h += '</div>';
          }
          if (changed.length) {
            h += '<div style="font-size:11px;font-weight:700;color:#b45309;margin-bottom:5px;">' +
              '<label style="cursor:pointer;"><input type="checkbox" class="ret-grp-cb" data-grp="changed" onchange="retToggleGroup(this)"> 出勤シフト変化（直近30日 ' + changed.length + '名）</label></div>';
            h += '<div style="display:flex;flex-wrap:wrap;gap:5px;padding-left:18px;">';
            for (const e of changed) {
              const from=e.earlyAvg!==null?snapStartTime(e.earlyAvg):'?';
              const to  =e.recentAvg!==null?snapStartTime(e.recentAvg):'?';
              h += '<label style="display:flex;align-items:center;gap:4px;background:white;border:1px solid #fde68a;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">' +
                '<input type="checkbox" class="ret-cb" data-grp="changed" value="'+e.emp_no+'">' +
                '<b>'+e.name+'</b>' +
                '<span style="font-family:monospace;color:#9ca3af;font-size:10px;">'+e.emp_no+'</span>' +
                '<span style="color:#d97706;">'+from+'→'+to+'</span></label>';
            }
            h += '</div>';
          }
          retDiv.innerHTML = h;
          retDiv.style.display = 'block';
        }
      }

      document.getElementById('csv-preview').style.display = 'block';
      document.getElementById('csv-result').style.display = 'none';
    }

    function retToggleAll(cb) {
      document.querySelectorAll('.ret-cb,.ret-grp-cb').forEach(el => { el.checked = cb.checked; });
    }
    function retToggleGroup(grpCb) {
      const grp = grpCb.dataset.grp;
      document.querySelectorAll('.ret-cb[data-grp="'+grp+'"]').forEach(el => { el.checked = grpCb.checked; });
      syncRetAllCb();
    }
    function syncRetAllCb() {
      const all = document.querySelectorAll('.ret-cb');
      const checked = document.querySelectorAll('.ret-cb:checked');
      const allCb = document.getElementById('ret-all-cb');
      if (allCb) allCb.indeterminate = checked.length > 0 && checked.length < all.length;
      if (allCb) allCb.checked = all.length > 0 && checked.length === all.length;
    }
    function retGetSelected() {
      return Array.from(document.querySelectorAll('.ret-cb:checked')).map(el => el.value);
    }
    async function retBulkAction(action) {
      const empNos = retGetSelected();
      if (!empNos.length) { alert('対象を選択してください'); return; }
      const label = action === 'retire' ? '退職処理' : '完全削除';
      if (!confirm(empNos.length + '名を' + label + 'します。よろしいですか？')) return;
      if (action === 'purge' && !confirm('完全削除すると元に戻せません。本当に削除しますか？')) return;
      const endpoint = action === 'retire' ? '/api/employees/retire-by-empno' : '/api/employees/purge-by-empno';
      try {
        const res = await fetch(endpoint, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ empNos })
        });
        const json = await res.json();
        if (res.ok) {
          alert(label + '完了: ' + json.count + '名');
          empNos.forEach(no => {
            const cb = document.querySelector('.ret-cb[value="'+no+'"]');
            if (cb) cb.closest('label')?.remove();
          });
          syncRetAllCb();
        } else {
          alert('エラー: ' + (json.error || '不明'));
        }
      } catch (err) {
        alert('通信エラー: ' + err.message);
      }
    }

    async function executeCsvImport() {
      if (!csvParsedData.length) return;
      const btn = document.getElementById('csv-import-btn');
      btn.disabled = true;

      const payload = csvParsedData.map(e => ({
        emp_no: e.emp_no, name: e.name,
        name_kana: e.name_kana || null,
        division: e.division, team: e.team,
        work_schedule: e.work_schedule, start_time: e.start_time,
        avg_return_time: e.avg_return_time,
        used_cars: e.used_cars,
        isLongAbsent: e.isLongAbsent || false,
        salesEntries: e.salesEntries || [],
        safetyEntries: e.safetyEntries || [],
      }));

      const BATCH = 100;
      const MAX_ENTRIES_PER_BATCH = 800;
      const batches = [];
      {
        let cur = [], curEntries = 0;
        for (const emp of payload) {
          const empEntries = (emp.salesEntries?.length||0) + (emp.safetyEntries?.length||0);
          if (cur.length && (cur.length >= BATCH || curEntries + empEntries > MAX_ENTRIES_PER_BATCH)) {
            batches.push(cur); cur = []; curEntries = 0;
          }
          cur.push(emp); curEntries += empEntries;
        }
        if (cur.length) batches.push(cur);
      }

      let totalInserted = 0, totalUpdated = 0, totalSales = 0, totalSafety = 0;
      const allErrors = [];

      try {
        let doneCount = 0;
        for (const batch of batches) {
          btn.textContent = \`送信中… \${doneCount + batch.length}/\${payload.length}名\`;
          const res = await fetch('/api/employees/csv-import', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ employees: batch })
          });
          const json = await res.json();
          if (res.ok) {
            totalInserted += json.inserted || 0;
            totalUpdated  += json.updated  || 0;
            totalSales    += json.salesUpdated || 0;
            totalSafety   += json.safetyUpdated || 0;
            if (json.errors?.length) allErrors.push(...json.errors);
          } else {
            allErrors.push(json.error || \`batch \${doneCount} エラー\`);
          }
          doneCount += batch.length;
        }

        const resultDiv = document.getElementById('csv-result');
        resultDiv.innerHTML = '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;font-size:13px;color:#166534;">'+
          'インポート完了: <strong>新規追加 '+totalInserted+'名</strong> / <strong>更新 '+totalUpdated+'名</strong>'+
          (totalSales ? ' / <strong>税込売上 '+totalSales+'件を反映</strong>' : '')+
          (totalSafety ? ' / <strong>安全運転データ '+totalSafety+'件を反映</strong>' : '')+
          (allErrors.length?'<div style="margin-top:8px;color:#dc2626;font-size:12px;">エラー: '+allErrors.join('、')+'</div>':'')+
          '<div style="margin-top:10px;"><a href="'+ADMIN_PATH+'/staff" style="color:#1d4ed8;font-size:13px;">→ 社員一覧を確認する</a></div></div>';
        resultDiv.style.display='block';
        document.getElementById('csv-preview').style.display='none';
      } catch (err) {
        alert('通信エラーが発生しました: ' + err.message);
      } finally {
        btn.disabled=false; btn.textContent='インポート実行';
      }
    }

    function clearCsvImport() {
      csvParsedData = [];
      ['csv-preview','csv-result','csv-retirement-candidates'].forEach((id)=>{
        const el=document.getElementById(id); if(el) el.style.display='none';
      });
      document.getElementById('csv-file-input').value='';
      document.getElementById('csv-drop-zone').style.borderColor='#d1d5db';
    }

    // ===== 点検写真AI取込 =====
    var DC_INS = { dept: 1, year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
    var dcInsEntries = [];
    var DC_INS_TYPE_JP = { inspect:'点検', shaken:'車検', bomb:'ボンベ', sub:'代替', recall:'リコール' };

    function dcInsTeamNum(dept, han) { return (dept - 1) * 2 + han; }
    function dcInsDeptBtnStyle(active) {
      return 'padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid ' + (active ? '#1a3a5c' : '#d1d5db') + ';background:' + (active ? '#1a3a5c' : 'white') + ';color:' + (active ? 'white' : '#374151') + ';';
    }
    function dcInsSelDept(d) {
      DC_INS.dept = d;
      document.querySelectorAll('.dc-ins-dept-btn').forEach(function(b) {
        b.style.cssText = dcInsDeptBtnStyle(+b.dataset.dept === d);
      });
    }
    (function dcInsInitYM() {
      var yearSel = document.getElementById('dc-ins-year');
      var monthSel = document.getElementById('dc-ins-month');
      if (!yearSel || !monthSel) return;
      var y = DC_INS.year, m = DC_INS.month, h = '';
      for (var yy = y - 1; yy <= y + 2; yy++) h += '<option value="' + yy + '"' + (yy === y ? ' selected' : '') + '>' + yy + '</option>';
      yearSel.innerHTML = h;
      h = '';
      for (var mm = 1; mm <= 12; mm++) h += '<option value="' + mm + '"' + (mm === m ? ' selected' : '') + '>' + mm + '</option>';
      monthSel.innerHTML = h;
      yearSel.onchange = function() { DC_INS.year = +yearSel.value; };
      monthSel.onchange = function() { DC_INS.month = +monthSel.value; };
      document.querySelectorAll('.dc-ins-dept-btn').forEach(function(b) {
        b.style.cssText = dcInsDeptBtnStyle(b.dataset.dept === '1');
      });
    })();

    function dcInsShow(html) {
      document.getElementById('dc-ins-ai-body').innerHTML = html;
      document.getElementById('dc-ins-ai-modal').style.display = 'flex';
    }
    function dcInsClose() { document.getElementById('dc-ins-ai-modal').style.display = 'none'; }

    function dcInsLoadImage(file) {
      return new Promise(function(resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function() {
          var max = 1800;
          var w = img.naturalWidth, h = img.naturalHeight;
          var sc = Math.min(1, max / Math.max(w, h));
          w = Math.round(w * sc); h = Math.round(h * sc);
          var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
          cv.getContext('2d').drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(cv.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = function() { URL.revokeObjectURL(url); reject(new Error('decode')); };
        img.src = url;
      });
    }

    async function dcInsPhotoSelected(input) {
      var file = input.files[0];
      input.value = '';
      if (!file) return;
      dcInsShow('<div style="text-align:center;padding:30px;color:#555;font-size:14px">🔍 AIが写真を解析しています…<br><span style="font-size:12px;color:#999">（10〜30秒ほどかかります）</span></div>');
      var dataUrl;
      try {
        dataUrl = await dcInsLoadImage(file);
      } catch (e) {
        dcInsShow('<div style="color:#c00;font-size:13px;padding:10px 0">画像を読み込めませんでした。HEIC形式はブラウザによって開けない場合があります。iPhoneの「写真」から選択するか、JPEG/PNGに変換してお試しください。</div><div style="text-align:right;"><button onclick="dcInsClose()" style="padding:8px 16px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">閉じる</button></div>');
        return;
      }
      try {
        var res = await fetch('/api/inspection/analyze', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: dataUrl, ym: String(DC_INS.year) + String(DC_INS.month).padStart(2, '0') })
        });
        var j = await res.json();
        if (!res.ok || j.error) {
          dcInsShow('<div style="color:#c00;font-size:13px;padding:10px 0">' + escHtmlJs(j.error || '解析に失敗しました') + '</div><div style="text-align:right;"><button onclick="dcInsClose()" style="padding:8px 16px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">閉じる</button></div>');
          return;
        }
        dcInsEntries = j.entries.map(function(e, i) { return Object.assign({}, e, { _idx: i, _excluded: false }); });
        dcInsRenderPreview(j.detected_ka, j.detected_month);
      } catch (e) {
        dcInsShow('<div style="color:#c00;font-size:13px;padding:10px 0">通信エラーが発生しました。もう一度お試しください。</div><div style="text-align:right;"><button onclick="dcInsClose()" style="padding:8px 16px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">閉じる</button></div>');
      }
    }

    function dcInsRenderPreview(detectedKa, detectedMonth) {
      var st = DC_INS;
      var warn = '';
      if (detectedKa && detectedKa !== st.dept) warn += '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:5px;padding:8px 12px;font-size:12px;margin-bottom:10px;color:#856404">⚠️ 写真は <b>' + detectedKa + '課</b> の表のようですが、<b>' + st.dept + '課</b> が選択されています。登録先は選択中の課になります。</div>';
      if (detectedMonth && detectedMonth !== st.month) warn += '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:5px;padding:8px 12px;font-size:12px;margin-bottom:10px;color:#856404">⚠️ 写真は <b>' + detectedMonth + '月</b> の表のようですが、<b>' + st.month + '月</b> が選択されています。登録先は選択中の年月になります。</div>';

      var byDay = {};
      dcInsEntries.forEach(function(e) { (byDay[e.day] = byDay[e.day] || []).push(e); });
      var rows = '';
      Object.keys(byDay).map(Number).sort(function(a, b) { return a - b; }).forEach(function(day) {
        var h1 = byDay[day].filter(function(e) { return e.han === 1; });
        var h2 = byDay[day].filter(function(e) { return e.han === 2; });
        var tag = function(e) {
          var style = 'display:inline-block;margin:2px;padding:2px 6px;border-radius:4px;font-size:11px;border:1px solid #d1d5db;background:#f9fafb;cursor:pointer;' + (e._excluded ? 'opacity:.35;text-decoration:line-through;' : '');
          return '<span style="' + style + '" onclick="dcInsToggle(' + e._idx + ')" title="クリックで除外/戻す">' + escHtmlJs(e.vehicle_num) + ' <span style="color:#9ca3af;">' + (DC_INS_TYPE_JP[e.type] || e.type) + '</span></span>';
        };
        rows += '<tr><td style="padding:4px;border-bottom:1px solid #f3f4f6;">' + h1.map(tag).join('') + '</td>' +
          '<td style="padding:4px;text-align:center;border-bottom:1px solid #f3f4f6;color:#6b7280;">' + day + '</td>' +
          '<td style="padding:4px;border-bottom:1px solid #f3f4f6;">' + h2.map(tag).join('') + '</td></tr>';
      });

      dcInsShow(
        warn +
        '<div style="font-size:13px;color:#333;margin-bottom:10px"><b>' + dcInsEntries.length + '件</b> の車両を検出しました。内容を確認してください（車番クリックで除外できます）。</div>' +
        '<div style="overflow-x:auto;margin-bottom:12px;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr><th style="text-align:left;padding:4px;">' + dcInsTeamNum(st.dept, 1) + '班側</th><th style="padding:4px;">日付</th><th style="text-align:left;padding:4px;">' + dcInsTeamNum(st.dept, 2) + '班側</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<label style="font-size:13px;display:flex;align-items:center;gap:6px;margin-bottom:12px;cursor:pointer"><input type="checkbox" id="dc-ins-ai-replace" checked> ' + st.year + '年' + st.month + '月 ' + st.dept + '課の既存データを置き換える（外すと追加のみ）</label>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;"><button onclick="dcInsClose()" style="padding:8px 16px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">キャンセル</button>' +
        '<button id="dc-ins-ai-reg-btn" onclick="dcInsRegister()" style="padding:8px 20px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">✓ ' + st.year + '年' + st.month + '月 ' + st.dept + '課に登録</button></div>'
      );
    }

    function dcInsToggle(idx) {
      var e = dcInsEntries.find(function(x) { return x._idx === idx; });
      if (e) { e._excluded = !e._excluded; dcInsRenderPreview(null, null); }
    }

    async function dcInsRegister() {
      var entries = dcInsEntries.filter(function(e) { return !e._excluded; }).map(function(e) { return { day: e.day, han: e.han, vehicle_num: e.vehicle_num, type: e.type }; });
      if (entries.length === 0) { alert('登録する車両がありません'); return; }
      var replace = document.getElementById('dc-ins-ai-replace').checked;
      var ym = String(DC_INS.year) + String(DC_INS.month).padStart(2, '0');
      var btn = document.getElementById('dc-ins-ai-reg-btn');
      btn.disabled = true; btn.textContent = '登録中…';
      try {
        var res = await fetch('/api/inspection/schedule/bulk', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ym: ym, ka: DC_INS.dept, replace: replace, entries: entries })
        });
        var j = await res.json();
        if (!res.ok || j.error) {
          alert(j.error || '登録に失敗しました');
          btn.disabled = false; btn.textContent = '✓ 登録';
          return;
        }
        dcInsShow('<div style="text-align:center;padding:20px;color:#166534;font-size:14px;">✓ 登録が完了しました（' + DC_INS.year + '年' + DC_INS.month + '月 ' + DC_INS.dept + '課、' + entries.length + '件）</div><div style="text-align:center;margin-top:10px;"><a href="' + ADMIN_PATH + '/inspection" style="color:#1d4ed8;font-size:13px;">→ 点検管理ページで確認する</a></div>');
      } catch (e) {
        alert('通信エラーが発生しました');
        btn.disabled = false; btn.textContent = '✓ 登録';
      }
    }

    // ===== 乗務員シフトPDF =====
    var CREW_API = ADMIN_PATH + '/api/crew-shift';
    var CS_CHUNK_MEMBERS = 300;
    var CS_CHUNK_SHIFTS = 3000;
    var _csPdfParserLoadPromise = null;
    function csLoadPdfParser() {
      if (window.parseCrewShiftPdf) return Promise.resolve();
      if (_csPdfParserLoadPromise) return _csPdfParserLoadPromise;
      _csPdfParserLoadPromise = new Promise(function(resolve, reject) {
        var s = document.createElement('script');
        s.src = CREW_API + '/pdf-parser.js';
        s.onload = function() { resolve(); };
        s.onerror = function() { reject(new Error('解析ライブラリの読込に失敗しました')); };
        document.head.appendChild(s);
      });
      return _csPdfParserLoadPromise;
    }
    function csChunkArray(arr, size) {
      var out = [];
      for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    }
    async function csPostJson(url, body) {
      var res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      var d = await res.json().catch(function(){ return {}; });
      if (!res.ok) throw new Error(d.error || 'server');
      return d;
    }
    function csSetProgress(text) {
      document.getElementById('cs-import-result').innerHTML = '<span style="color:#374151;">' + escHtmlJs(text) + '</span>';
    }
    async function csDoImport() {
      var f = document.getElementById('cs-import-file').files[0];
      if (!f) { document.getElementById('cs-import-result').innerHTML = '<span style="color:#dc2626;">PDFファイルを選択してください</span>'; return; }
      var btn = document.getElementById('cs-import-btn');
      btn.disabled = true; btn.textContent = '取込中...';
      document.getElementById('cs-import-result').textContent = '';
      try {
        csSetProgress('解析ライブラリ読込中...');
        await csLoadPdfParser();

        csSetProgress('PDF解析中...');
        var buf = await f.arrayBuffer();
        var parsed = await window.parseCrewShiftPdf(new Uint8Array(buf));
        if (!parsed.members.length) {
          var noDataMsg = 'PDFから乗務員データを読み取れませんでした。「月初勤務予定表」形式のPDFか確認してください';
          if (parsed.warnings && parsed.warnings.length) noDataMsg += '<br><span style="color:#d97706;">' + parsed.warnings.map(escHtmlJs).join('<br>') + '</span>';
          document.getElementById('cs-import-result').innerHTML = '<span style="color:#dc2626;">' + noDataMsg + '</span>';
          return;
        }

        var divisions = Array.from(new Set(parsed.members.map(function(m){ return m.division; }))).sort();
        var empDivision = {};
        var memberCountByDivision = {};
        parsed.members.forEach(function(m) {
          empDivision[m.emp_code] = m.division;
          memberCountByDivision[m.division] = (memberCountByDivision[m.division] || 0) + 1;
        });
        var cellCountByDivision = {};
        parsed.shifts.forEach(function(s) {
          var div = empDivision[s.emp_code] || '';
          cellCountByDivision[div] = (cellCountByDivision[div] || 0) + 1;
        });

        var memberChunks = csChunkArray(parsed.members.map(function(m, i) {
          return { emp_code: m.emp_code, name: m.name, car_no: m.car_no, division: m.division, team: m.team, sort_order: (i + 1) * 10 };
        }), CS_CHUNK_MEMBERS);
        for (var mi = 0; mi < memberChunks.length; mi++) {
          csSetProgress('乗務員登録中... (' + (mi + 1) + '/' + memberChunks.length + ')');
          await csPostJson(CREW_API + '/import/members', { members: memberChunks[mi] });
        }

        csSetProgress('既存シフトのクリア中...');
        await csPostJson(CREW_API + '/import/clear', { divisions: divisions, start_date: parsed.startDate, end_date: parsed.endDate });

        var shiftChunks = csChunkArray(parsed.shifts, CS_CHUNK_SHIFTS);
        for (var si = 0; si < shiftChunks.length; si++) {
          csSetProgress('シフト登録中... (' + (si + 1) + '/' + shiftChunks.length + ')');
          await csPostJson(CREW_API + '/import/shifts', { shifts: shiftChunks[si] });
        }

        csSetProgress('仕上げ処理中...');
        await csPostJson(CREW_API + '/import/finish', {
          file_name: f.name,
          start_date: parsed.startDate,
          end_date: parsed.endDate,
          divisions: divisions.map(function(div) {
            return { division: div, member_count: memberCountByDivision[div] || 0, cell_count: cellCountByDivision[div] || 0 };
          }),
        });

        var divLabel = divisions.join('・');
        var msg = '取込完了: ' + parsed.members.length + '名 / ' + parsed.shifts.length + '件（' + parsed.startDate + '〜' + parsed.endDate + '）' + (divLabel ? '<br>対象: ' + escHtmlJs(divLabel) : '');
        if (parsed.warnings && parsed.warnings.length) msg += '<br><span style="color:#d97706;">' + parsed.warnings.map(escHtmlJs).join('<br>') + '</span>';
        document.getElementById('cs-import-result').innerHTML = '<span style="color:#166534;">' + msg + '</span>';
        var nextDivision = divisions[0];
        setTimeout(function() { location.href = ADMIN_PATH + '/crew-shift?division=' + encodeURIComponent(nextDivision) + '&start=' + parsed.startDate + '&end=' + parsed.endDate; }, 1200);
      } catch (e) {
        document.getElementById('cs-import-result').innerHTML = '<span style="color:#dc2626;">' + escHtmlJs(e.message || '取込に失敗しました') + '</span>';
      } finally {
        btn.disabled = false; btn.textContent = '取込実行';
      }
    }

    // ===== 動態表（人事システム xlsx） =====
    var DT_XLSX_SRC = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    var _dtXlsxPromise = null;
    function dtLoadXlsx() {
      if (window.XLSX) return Promise.resolve();
      if (_dtXlsxPromise) return _dtXlsxPromise;
      _dtXlsxPromise = new Promise(function(resolve, reject) {
        var s = document.createElement('script');
        s.src = DT_XLSX_SRC;
        s.onload = function() { resolve(); };
        s.onerror = function() { reject(new Error('解析ライブラリの読み込みに失敗しました')); };
        document.head.appendChild(s);
      });
      return _dtXlsxPromise;
    }

    var dtPlan = null;
    var DT_KINDS = ['updates', 'inserts', 'retire', 'reactivate', 'deactivateMoved'];

    function dtSetStatus(t, color) {
      var el = document.getElementById('dt-status');
      el.textContent = t || '';
      el.style.color = color || '#374151';
    }
    function dtNorm(s) { return String(s == null ? '' : s).replace(/[\\s\\u3000]+/g, ''); }
    function dtTrim(s) { return String(s == null ? '' : s).trim(); }

    function dtNormDate(v) {
      if (v == null || v === '') return '';
      if (v instanceof Date && !isNaN(v.getTime())) {
        return v.getFullYear() + '-' + String(v.getMonth() + 1).padStart(2, '0') + '-' + String(v.getDate()).padStart(2, '0');
      }
      if (typeof v === 'number' && isFinite(v) && v > 20000 && v < 90000) {
        var d = new Date(Math.round((v - 25569) * 86400000));
        return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
      }
      var m = /^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})/.exec(String(v).trim());
      if (m) return m[1] + '-' + String(+m[2]).padStart(2, '0') + '-' + String(+m[3]).padStart(2, '0');
      return '';
    }
    function dtEmpNo(v) {
      var s = String(v == null ? '' : v).replace(/[^0-9]/g, '');
      return /^\\d{8}$/.test(s) ? s : '';
    }
    function dtDivNum(v) {
      var s = String(v == null ? '' : v).replace(/[^0-9]/g, '');
      var n = parseInt(s, 10);
      return (n >= 1 && n <= 4) ? n : null;
    }
    var DT_ENTRY = { '新卒': 1, 'キャリア': 1, '縁故': 1 };
    function dtEntry(v) { var s = dtTrim(v); return DT_ENTRY[s] ? s : ''; }

    function dtContractType(birthIso) {
      if (!birthIso) return '';
      var p = /^(\\d{4})-(\\d{2})-(\\d{2})/.exec(birthIso);
      if (!p) return '';
      var now = new Date(Date.now() + 9 * 3600 * 1000);
      var age = now.getUTCFullYear() - (+p[1]);
      var mo = now.getUTCMonth() + 1, da = now.getUTCDate();
      if (mo < (+p[2]) || (mo === (+p[2]) && da < (+p[3]))) age--;
      if (age >= 65 && age <= 75) return '労共';
      return '一般';
    }

    function dtHeaderRow(rows) {
      for (var i = 0; i < Math.min(rows.length, 10); i++) {
        var r = rows[i] || [];
        for (var j = 0; j < r.length; j++) {
          if (dtTrim(r[j]) === '社員コード') return i;
        }
      }
      return -1;
    }
    function dtHeaderMap(headerRow) {
      var mp = {};
      for (var j = 0; j < headerRow.length; j++) {
        var k = dtTrim(headerRow[j]);
        if (k && !(k in mp)) mp[k] = j;
      }
      return mp;
    }

    // 一部の出力ツールは xlsx の dimension(!ref) を実データより狭く書く（例: A1:AH47 なのに実際は917行）。
    // 全セルを走査して !ref を張り直してから読む。
    function dtFixRef(ws) {
      var r = { s: { r: 1e7, c: 1e7 }, e: { r: 0, c: 0 } };
      Object.keys(ws).forEach(function(k) {
        if (k[0] === '!') return;
        var c = XLSX.utils.decode_cell(k);
        if (c.r < r.s.r) r.s.r = c.r;
        if (c.c < r.s.c) r.s.c = c.c;
        if (c.r > r.e.r) r.e.r = c.r;
        if (c.c > r.e.c) r.e.c = c.c;
      });
      if (r.e.r >= r.s.r && r.e.c >= r.s.c) ws['!ref'] = XLSX.utils.encode_range(r);
    }

    function dtParseWorkbook(wb) {
      var out = { roster: [], haizoku: [], taishoku: [], idou: [] };
      var wanted = {
        '在籍者一覧': 'roster', '配属一覧': 'haizoku', '退職一覧': 'taishoku',
        'グループ内異動一覧': 'idou', '社内異動一覧': 'idou'
      };
      wb.SheetNames.forEach(function(sn) {
        var key = wanted[dtTrim(sn)];
        if (!key) return;
        dtFixRef(wb.Sheets[sn]);
        var rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: false, defval: '' });
        var hr = dtHeaderRow(rows);
        if (hr < 0) return;
        var hm = dtHeaderMap(rows[hr]);
        var body = rows.slice(hr + 1);

        if (key === 'roster') {
          body.forEach(function(r) {
            var emp = dtEmpNo(r[hm['社員コード']]);
            var nm = dtTrim(r[hm['社員名（漢字）']]);
            if (!emp || !nm) return;
            out.roster.push({
              emp_no: emp, name: nm,
              name_kana: dtTrim(r[hm['社員名（カナ）']]),
              birth_date: dtNormDate(r[hm['生年月日']]),
              hire_date: dtNormDate(r[hm['入社日']]),
              first_duty_date: dtNormDate(r[hm['初乗務日']]),
              division: dtDivNum(r[hm['課']]),
              entry_type: dtEntry(r[hm['採用区分']])
            });
          });
        } else if (key === 'haizoku') {
          body.forEach(function(r) {
            var emp = dtEmpNo(r[hm['社員コード']]);
            var nm = dtTrim(r[hm['社員名（漢字）']]);
            if (!emp || !nm) return;
            out.haizoku.push({
              kubun: dtTrim(r[0]),
              emp_no: emp, name: nm,
              name_kana: dtTrim(r[hm['社員名（カナ）']]),
              birth_date: dtNormDate(r[hm['生年月日']]),
              hire_date: dtNormDate(r[hm['入社日']]),
              division: dtDivNum(r[hm['課']]),
              entry_type: dtEntry(r[hm['採用区分']]),
              taishoku_date: dtNormDate(r[hm['退職日']])
            });
          });
        } else if (key === 'taishoku') {
          body.forEach(function(r) {
            var emp = dtEmpNo(r[hm['社員コード']]);
            var nm = dtTrim(r[hm['社員名（漢字）']]);
            if (!emp || !nm) return;
            out.taishoku.push({
              kubun: dtTrim(r[0]),
              emp_no: emp, name: nm,
              yotei: dtNormDate(r[hm['退職予定日']]),
              taishoku_date: dtNormDate(r[hm['退職日']]),
              torisage: dtNormDate(r[hm['退職取下日']]),
              reason: dtTrim(r[hm['退職理由区分']])
            });
          });
        } else if (key === 'idou') {
          body.forEach(function(r) {
            var emp = dtEmpNo(r[hm['社員コード']]);
            var nm = dtTrim(r[hm['社員名（漢字）']]);
            if (!emp || !nm) return;
            out.idou.push({
              emp_no: emp, name: nm,
              cur_office: dtTrim(r[hm['営業所']]),
              idou_date: dtNormDate(r[hm['異動日']]),
              sheet: dtTrim(sn)
            });
          });
        }
      });
      return out;
    }

    function dtBuildPlan(parsed, snapArr) {
      var snap = {};
      snapArr.forEach(function(s) { snap[s.emp_no] = s; });
      var rosterSet = {};
      parsed.roster.forEach(function(r) { rosterSet[r.emp_no] = 1; });

      var updates = [], inserts = [], reactivate = [], retire = [], moved = [];
      var insSeen = {};

      parsed.roster.forEach(function(r) {
        var s = snap[r.emp_no];
        var ct = dtContractType(r.birth_date);
        if (!s) {
          inserts.push({
            emp_no: r.emp_no, name: r.name, name_kana: r.name_kana,
            birth_date: r.birth_date, hire_date: r.hire_date, first_duty_date: r.first_duty_date,
            division: r.division, entry_type: r.entry_type, contract_type: ct || '',
            _src: '在籍者一覧'
          });
          insSeen[r.emp_no] = 1;
          return;
        }
        if (String(s.is_active) === '0') {
          reactivate.push({ emp_no: r.emp_no, name: r.name, _src: '在籍者一覧に在籍・DBは退職' });
        }
        var u = { emp_no: r.emp_no, _name: r.name, _changes: [] };
        if (r.name && dtNorm(r.name) !== dtNorm(s.name)) { u.name = r.name; u._changes.push('氏名: ' + dtTrim(s.name) + ' → ' + r.name); }
        if (r.name_kana && r.name_kana !== dtTrim(s.name_kana)) { u.name_kana = r.name_kana; u._changes.push('カナ'); }
        if (r.birth_date && r.birth_date !== dtNormDate(s.birth_date)) { u.birth_date = r.birth_date; u._changes.push('生年月日: ' + (dtNormDate(s.birth_date) || '空') + ' → ' + r.birth_date); }
        if (r.hire_date && r.hire_date !== dtNormDate(s.hire_date)) { u.hire_date = r.hire_date; u._changes.push('入社日'); }
        if (r.first_duty_date && r.first_duty_date !== dtNormDate(s.first_duty_date)) { u.first_duty_date = r.first_duty_date; u._changes.push('初乗務日'); }
        if (r.division && r.division !== s.division) { u.division = r.division; u._changes.push('課: ' + (s.division || '空') + ' → ' + r.division); }
        if (r.entry_type && r.entry_type !== dtTrim(s.entry_type)) { u.entry_type = r.entry_type; u._changes.push('採用区分: ' + (dtTrim(s.entry_type) || '空') + ' → ' + r.entry_type); }
        if (ct && ct !== (dtTrim(s.contract_type) || '一般')) { u.contract_type = ct; u._changes.push('契約形態: ' + (dtTrim(s.contract_type) || '一般') + ' → ' + ct); }
        if (u._changes.length) updates.push(u);
      });

      // 配属一覧: 入社区分の入社予定者を新規追加
      parsed.haizoku.forEach(function(h) {
        if (h.kubun !== '入社') return;
        if (snap[h.emp_no] || rosterSet[h.emp_no] || insSeen[h.emp_no]) return;
        if (h.taishoku_date) return;
        inserts.push({
          emp_no: h.emp_no, name: h.name, name_kana: h.name_kana,
          birth_date: h.birth_date, hire_date: h.hire_date, first_duty_date: '',
          division: h.division, entry_type: h.entry_type,
          contract_type: dtContractType(h.birth_date) || '',
          _src: '配属一覧（入社）'
        });
        insSeen[h.emp_no] = 1;
      });

      // 退職一覧
      var reacSeen = {};
      reactivate.forEach(function(x) { reacSeen[x.emp_no] = 1; });
      parsed.taishoku.forEach(function(t) {
        if (t.kubun === '退職取下' || t.torisage) {
          if (!reacSeen[t.emp_no]) { reactivate.push({ emp_no: t.emp_no, name: t.name, _src: '退職取下' }); reacSeen[t.emp_no] = 1; }
          return;
        }
        if (t.kubun === '退職予定') {
          retire.push({ emp_no: t.emp_no, name: t.name, retirement_date: t.yotei, retirement_reason: t.reason, deactivate: false, _src: '退職予定' });
        } else {
          retire.push({ emp_no: t.emp_no, name: t.name, retirement_date: t.taishoku_date || t.yotei, retirement_reason: t.reason, deactivate: true, _src: '退職' });
        }
      });

      // 異動: 在籍者一覧に無く現営業所が板橋以外
      var movedSeen = {};
      parsed.idou.forEach(function(x) {
        if (rosterSet[x.emp_no]) return;
        if (!x.cur_office || x.cur_office.indexOf('板橋') >= 0) return;
        var prev = movedSeen[x.emp_no];
        if (prev && prev.idou_date >= x.idou_date) return;
        movedSeen[x.emp_no] = x;
      });
      Object.keys(movedSeen).forEach(function(k) {
        var x = movedSeen[k];
        moved.push({ emp_no: x.emp_no, name: x.name, moved_date: x.idou_date, _to: x.cur_office, _src: x.sheet });
      });

      return { updates: updates, inserts: inserts, reactivate: reactivate, retire: retire, deactivateMoved: moved };
    }

    function dtSection(kind, title, items, renderRow) {
      if (!items.length) return '';
      var rows = items.map(function(it, i) {
        return '<tr>' +
          '<td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;"><input type="checkbox" class="dt-cb" data-kind="' + kind + '" data-idx="' + i + '" checked></td>' +
          renderRow(it) + '</tr>';
      }).join('');
      return '<details style="margin-bottom:10px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;" open>' +
        '<summary style="padding:8px 12px;background:#f9fafb;font-size:13px;font-weight:700;color:#1e3a5f;cursor:pointer;">' +
        escHtmlJs(title) + ' … ' + items.length + '件 ' +
        '<label style="font-weight:400;font-size:11px;color:#6b7280;margin-left:8px;"><input type="checkbox" class="dt-kind-toggle" data-kind="' + kind + '" checked> 全選択</label>' +
        '</summary>' +
        '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>' + rows + '</tbody></table></div>' +
        '</details>';
    }

    function dtRenderPreview() {
      var p = dtPlan;
      var td = 'padding:4px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;';
      function chip(label, n, color) {
        return '<div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:8px 14px;">' +
          '<div style="font-size:10px;color:#6b7280;">' + label + '</div>' +
          '<div style="font-size:18px;font-weight:800;color:' + color + ';">' + n + '</div></div>';
      }
      document.getElementById('dt-summary').innerHTML =
        chip('更新', p.updates.length, '#1d4ed8') +
        chip('新規追加', p.inserts.length, '#166534') +
        chip('退職', p.retire.filter(function(x){return x.deactivate;}).length, '#b91c1c') +
        chip('退職予定', p.retire.filter(function(x){return !x.deactivate;}).length, '#a16207') +
        chip('在籍へ戻す', p.reactivate.length, '#0e7490') +
        chip('異動で除外', p.deactivateMoved.length, '#7c3aed');

      var html = '';
      html += dtSection('updates', '更新（既存社員）', p.updates, function(it) {
        return '<td style="' + td + '">' + escHtmlJs(it._name || '') + ' <span style="color:#9ca3af;">' + it.emp_no + '</span></td>' +
          '<td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;color:#374151;">' + escHtmlJs((it._changes || []).join(' / ')) + '</td>';
      });
      html += dtSection('inserts', '新規追加', p.inserts, function(it) {
        return '<td style="' + td + '">' + escHtmlJs(it.name) + ' <span style="color:#9ca3af;">' + it.emp_no + '</span></td>' +
          '<td style="' + td + '">' + (it.division ? it.division + '課' : '-') + '</td>' +
          '<td style="' + td + '">生 ' + escHtmlJs(it.birth_date || '-') + '</td>' +
          '<td style="' + td + '">' + escHtmlJs(it._src) + '</td>';
      });
      html += dtSection('retire', '退職 / 退職予定', p.retire, function(it) {
        return '<td style="' + td + '">' + escHtmlJs(it.name) + ' <span style="color:#9ca3af;">' + it.emp_no + '</span></td>' +
          '<td style="' + td + '">' + (it.deactivate ? '<span style="color:#b91c1c;font-weight:700;">退職</span>' : '<span style="color:#a16207;font-weight:700;">予定</span>') + '</td>' +
          '<td style="' + td + '">' + escHtmlJs(it.retirement_date || '-') + '</td>' +
          '<td style="' + td + '">' + escHtmlJs(it.retirement_reason || '') + '</td>';
      });
      html += dtSection('reactivate', '在籍へ戻す', p.reactivate, function(it) {
        return '<td style="' + td + '">' + escHtmlJs(it.name) + ' <span style="color:#9ca3af;">' + it.emp_no + '</span></td>' +
          '<td style="' + td + '">' + escHtmlJs(it._src) + '</td>';
      });
      html += dtSection('deactivateMoved', '異動で在籍から除外', p.deactivateMoved, function(it) {
        return '<td style="' + td + '">' + escHtmlJs(it.name) + ' <span style="color:#9ca3af;">' + it.emp_no + '</span></td>' +
          '<td style="' + td + '">→ ' + escHtmlJs(it._to || '') + '</td>' +
          '<td style="' + td + '">' + escHtmlJs(it.moved_date || '') + '</td>';
      });

      var sec = document.getElementById('dt-sections');
      sec.innerHTML = html || '<p style="color:#9ca3af;font-size:13px;">反映が必要な差分はありませんでした。</p>';
      sec.querySelectorAll('.dt-kind-toggle').forEach(function(tog) {
        tog.addEventListener('change', function() {
          sec.querySelectorAll('.dt-cb[data-kind="' + tog.dataset.kind + '"]').forEach(function(cb) { cb.checked = tog.checked; });
        });
      });
      document.getElementById('dt-preview').style.display = 'block';
      document.getElementById('dt-result').style.display = 'none';
    }

    function dtCollect() {
      var keep = { updates: [], inserts: [], retire: [], reactivate: [], deactivateMoved: [] };
      DT_KINDS.forEach(function(kind) {
        document.querySelectorAll('.dt-cb[data-kind="' + kind + '"]').forEach(function(cb) {
          if (cb.checked) keep[kind].push(dtPlan[kind][+cb.dataset.idx]);
        });
      });
      function strip(o, fields) { var r = {}; fields.forEach(function(f) { if (o[f] !== undefined) r[f] = o[f]; }); return r; }
      var upFields = ['emp_no', 'name', 'name_kana', 'birth_date', 'hire_date', 'first_duty_date', 'division', 'entry_type', 'contract_type'];
      return {
        updates: keep.updates.map(function(o) { return strip(o, upFields); }),
        inserts: keep.inserts.map(function(o) { return strip(o, upFields); }),
        retire: keep.retire.map(function(o) { return strip(o, ['emp_no', 'retirement_date', 'retirement_reason', 'deactivate']); }),
        reactivate: keep.reactivate.map(function(o) { return strip(o, ['emp_no']); }),
        deactivateMoved: keep.deactivateMoved.map(function(o) { return strip(o, ['emp_no', 'moved_date', 'note']); })
      };
    }

    async function dtHandleFile(file) {
      if (!file) return;
      document.getElementById('dt-preview').style.display = 'none';
      document.getElementById('dt-result').style.display = 'none';
      dtSetStatus('解析ライブラリを読み込み中…');
      try {
        await dtLoadXlsx();
        dtSetStatus('ファイルを解析中…');
        var buf = await file.arrayBuffer();
        var wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
        var parsed = dtParseWorkbook(wb);
        if (!parsed.roster.length && !parsed.taishoku.length && !parsed.haizoku.length && !parsed.idou.length) {
          dtSetStatus('対象シート（在籍者一覧など）が見つかりませんでした。動態表の形式をご確認ください。', '#dc2626');
          return;
        }
        dtSetStatus('既存社員データを取得中…');
        var res = await fetch('/api/employees/dotai-snapshot');
        if (!res.ok) { dtSetStatus('既存社員データの取得に失敗しました', '#dc2626'); return; }
        var snap = (await res.json()).employees || [];
        dtPlan = dtBuildPlan(parsed, snap);
        dtSetStatus('解析完了: 在籍 ' + parsed.roster.length + '名 / 退職 ' + parsed.taishoku.length + '件 / 配属 ' + parsed.haizoku.length + '件 / 異動 ' + parsed.idou.length + '件', '#166534');
        dtRenderPreview();
      } catch (e) {
        dtSetStatus(e && e.message ? e.message : '解析に失敗しました', '#dc2626');
      }
    }

    async function dtExecute() {
      if (!dtPlan) return;
      if (!document.getElementById('dt-confirm').checked) { alert('内容を確認のうえチェックを入れてください'); return; }
      var payload = dtCollect();
      var total = payload.updates.length + payload.inserts.length + payload.retire.length + payload.reactivate.length + payload.deactivateMoved.length;
      if (!total) { alert('反映対象がありません'); return; }
      if (!confirm('選択した ' + total + ' 件を社員情報に反映します。よろしいですか？')) return;
      var btn = document.getElementById('dt-exec');
      btn.disabled = true; btn.style.opacity = '.5'; btn.textContent = '反映中…';
      try {
        var res = await fetch('/api/employees/dotai-import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        var j = await res.json().catch(function() { return {}; });
        var box = document.getElementById('dt-result');
        box.style.display = 'block';
        if (res.ok && j.ok) {
          box.innerHTML = '<div style="background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;border-radius:8px;padding:12px 14px;font-size:13px;">' +
            '反映しました — 更新 ' + j.updated + ' / 新規 ' + j.inserted + ' / 退職 ' + j.retired + ' / 退職予定 ' + j.retirePlanned + ' / 復帰 ' + j.reactivated + ' / 異動除外 ' + j.deactivatedMoved +
            (j.skipped && j.skipped.length ? '<br><span style="color:#a16207;">スキップ: ' + escHtmlJs(j.skipped.join(', ')) + '</span>' : '') +
            '<div style="margin-top:8px;"><a href="' + ADMIN_PATH + '/staff" style="color:#1d4ed8;">→ 社員一覧を確認</a>　<a href="' + ADMIN_PATH + '/staff/contracts" style="color:#1d4ed8;">→ 労共契約アラートを確認</a></div></div>';
          document.getElementById('dt-preview').style.display = 'none';
        } else {
          box.innerHTML = '<div style="background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:8px;padding:12px 14px;font-size:13px;">反映に失敗しました: ' + escHtmlJs(j.error || (j.errors && j.errors.join('; ')) || '不明なエラー') + '</div>';
        }
      } catch (e) {
        alert('通信エラーが発生しました');
      } finally {
        btn.disabled = false; btn.style.opacity = '1'; btn.textContent = '反映を実行';
      }
    }

    function dtClear() {
      dtPlan = null;
      document.getElementById('dt-file').value = '';
      document.getElementById('dt-preview').style.display = 'none';
      document.getElementById('dt-result').style.display = 'none';
      document.getElementById('dt-confirm').checked = false;
      dtSetStatus('');
    }

    (function dtInit() {
      var drop = document.getElementById('dt-drop');
      if (!drop) return;
      drop.addEventListener('dragover', function(e) { e.preventDefault(); drop.style.borderColor = '#1a3a5c'; });
      drop.addEventListener('dragleave', function() { drop.style.borderColor = '#d1d5db'; });
      drop.addEventListener('drop', function(e) {
        e.preventDefault(); drop.style.borderColor = '#d1d5db';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) dtHandleFile(e.dataTransfer.files[0]);
      });
      var cf = document.getElementById('dt-confirm');
      cf.addEventListener('change', function() {
        var b = document.getElementById('dt-exec');
        b.disabled = !cf.checked;
        b.style.opacity = cf.checked ? '1' : '.5';
      });
    })();
    </script>`;

  return c.html(layout('データセンター', html, 'settings'));
});

export default app;
