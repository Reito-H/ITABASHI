// 報告センター（忘れ物・事故・違反・一般報告）の個別帳票印刷・画像保存ページ
// A4横サイズの1枚に「宛先」「詳細内容」「追加備考」をまとめて印刷/PNG保存できる。
// 宛先・追加備考は contenteditable にして、印刷にもhtml2canvasの画像化にも同じ見た目で反映させる。

import { escHtml, safeJson } from './layout';

export interface ReportPrintField {
  label: string;
  value: string;
  full?: boolean; // trueなら2列分の幅いっぱいに表示（長文向け）
  field?: string; // DB列名。指定すると自由編集可能な入力欄になる（未指定なら読み取り専用のまま）
  input?: 'text' | 'textarea' | 'checkbox'; // fieldがある場合の入力形式（既定 'text'）
  checked?: boolean; // input:'checkbox' の初期チェック状態
}

export interface ReportPrintOptions {
  kindLabel: string;        // 忘れ物報告 / 事故報告 / 違反報告 / 一般報告
  kindColor: string;
  pageTitle: string;        // <title>用
  headingTitle: string;     // 帳票内の見出し（車番や件名など、案件を一目で判別できる文言）
  reportId: number;
  createdAt: string;
  fields: ReportPrintField[];
  status: string;           // 'open' | 'resolved'
  resolvedLabel: string;    // 解決済 / 対応済
  resolvedByName: string | null;
  resolvedAt: string | null;
  reporterName: string | null;
  suggestedTo: string;      // 宛先の初期値
  printNotes: string;       // 追加備考の保存済み内容
  apiPath: string;          // 状態変更/削除/履歴のAPIベースパス（ADMIN_PATH込みの絶対パス、例: '/xxx/admin/api/liff/lost-items'）
  deleteLabel: string;      // 削除確認ダイアログの対象種別名（例: '忘れ物報告'）
  listHref: string;         // 一覧に戻る先（種別フィルタ付きの統合一覧URL）
}

const TO_PRESETS = ['１課班長', '２課班長', '３課班長', '４課班長', '運行管理者', '統括管理者'];

export function renderReportPrintPage(o: ReportPrintOptions): string {
  const fieldRows = o.fields.map(f => {
    let valueHtml: string;
    if (!f.field) {
      valueHtml = escHtml(f.value || '—');
    } else if (f.input === 'checkbox') {
      valueHtml = `<label class="f-check"><input type="checkbox" data-field="${escHtml(f.field)}"${f.checked ? ' checked' : ''}> ${escHtml(f.value)}</label>`;
    } else if (f.input === 'textarea') {
      valueHtml = `<textarea class="f-edit f-edit-area" data-field="${escHtml(f.field)}">${escHtml(f.value)}</textarea>`;
    } else {
      valueHtml = `<input type="text" class="f-edit" data-field="${escHtml(f.field)}" value="${escHtml(f.value)}">`;
    }
    return `
    <div class="f-row${f.full ? ' full' : ''}">
      <div class="f-label">${escHtml(f.label)}</div>
      <div class="f-value">${valueHtml}</div>
    </div>`;
  }).join('');

  const presetBtns = TO_PRESETS.map(p =>
    `<button type="button" class="preset-btn" onclick="setTo('${escHtml(p)}')">${escHtml(p)}</button>`
  ).join('');

  const statusText = o.status === 'resolved'
    ? `${o.resolvedLabel}（対応者: ${escHtml(o.resolvedByName ?? '—')} / ${escHtml((o.resolvedAt ?? '').slice(0, 16) || '—')}）`
    : '対応中';

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>${escHtml(o.pageTitle)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #111827; }
  .toolbar { position: sticky; top: 0; z-index: 10; background: #1e3a5f; padding: 10px 16px; display: flex; gap: 8px; align-items: center; }
  .toolbar a, .toolbar button { font-size: 13px; padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; font-weight: 600; }
  .toolbar a { background: #374151; color: #fff; }
  .toolbar button.print-btn { background: #2563eb; color: #fff; }
  .toolbar button.image-btn { background: #059669; color: #fff; }
  .toolbar .hint { margin-left: auto; font-size: 12px; color: #cbd5e1; }
  .toolbar .hint #autosave-status { font-weight: 600; }
  .stage { padding: 24px; display: flex; justify-content: center; }

  .sheet {
    width: 297mm; min-height: 210mm; background: #fff; padding: 12mm 14mm;
    box-shadow: 0 4px 20px rgba(0,0,0,0.25);
  }
  .sheet-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e3a5f; padding-bottom: 8px; margin-bottom: 10px; }
  .sheet-head .left { display: flex; align-items: center; gap: 12px; }
  .badge { display: inline-block; padding: 4px 14px; border-radius: 20px; color: #fff; font-size: 14px; font-weight: 700; background: ${o.kindColor}; }
  .sheet-head h1 { font-size: 20px; margin: 0; color: #1e3a5f; }
  .sheet-head .meta { text-align: right; font-size: 12px; color: #6b7280; line-height: 1.6; }

  .to-block { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
  .to-label { font-size: 13px; color: #374151; font-weight: 600; white-space: nowrap; }
  .to-field {
    min-width: 260px; font-size: 17px; font-weight: 700; padding: 4px 6px;
    border-bottom: 2px solid #1e3a5f; outline: none;
  }
  .to-field:empty:before { content: attr(data-placeholder); color: #9ca3af; font-weight: 400; }
  .preset-btn {
    font-size: 11px; padding: 3px 9px; border-radius: 12px; border: 1px solid #d1d5db;
    background: #f9fafb; color: #374151; cursor: pointer;
  }
  .preset-btn:hover { background: #eef2ff; border-color: #a5b4fc; }
  .preset-wrap { display: flex; gap: 6px; flex-wrap: wrap; }

  .detail-title { font-size: 13px; font-weight: 700; color: #1e3a5f; margin: 8px 0 4px; padding-left: 6px; border-left: 4px solid #1e3a5f; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #d1d5db; border-bottom: none; }
  .f-row { display: flex; border-bottom: 1px solid #d1d5db; border-right: 1px solid #d1d5db; min-height: 26px; }
  .f-row.full { grid-column: 1 / -1; }
  .f-label { width: 108px; flex-shrink: 0; background: #f3f4f6; font-size: 12px; font-weight: 600; color: #4b5563; padding: 4px 8px; display: flex; align-items: center; border-right: 1px solid #d1d5db; }
  .f-value { flex: 1; font-size: 13px; padding: 4px 10px; display: flex; align-items: center; white-space: pre-wrap; word-break: break-word; }
  .f-edit { width: 100%; border: 1px solid transparent; border-radius: 3px; background: transparent; font: inherit; color: #111827; padding: 2px 4px; outline: none; }
  .f-edit:hover { border-color: #d1d5db; }
  .f-edit:focus { border-color: #1e3a5f; background: #eff6ff; }
  .f-edit-area { resize: vertical; min-height: 20px; white-space: pre-wrap; }
  .f-check { display: flex; align-items: center; gap: 6px; cursor: pointer; }
  @media print { .f-edit { border-color: transparent !important; background: transparent !important; } }

  .notes-block { margin-top: 10px; }
  .notes-field {
    width: 100%; display: block; border: 1px solid #d1d5db; border-radius: 4px; min-height: 16mm; padding: 6px 10px;
    font: inherit; font-size: 13px; line-height: 1.6; outline: none; white-space: pre-wrap; resize: vertical;
    color: #111827; background: #fff;
  }
  .notes-field::placeholder { color: #9ca3af; }
  @media print { .notes-field { border-color: transparent !important; resize: none; } }

  .sheet-foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; padding-top: 6px; border-top: 1px solid #d1d5db; font-size: 11px; color: #6b7280; }
  .sign-box { display: flex; gap: 24px; }
  .sign-box .sign { border-bottom: 1px solid #9ca3af; width: 120px; height: 24px; }
  .sign-box .sign-label { font-size: 11px; color: #6b7280; margin-bottom: 2px; }

  .toolbar button.status-btn { background: #d97706; color: #fff; }
  .toolbar button.status-btn[data-status="resolved"] { background: #6b7280; }
  .toolbar button.logs-btn { background: #7c3aed; color: #fff; }
  .toolbar button.delete-btn { background: #dc2626; color: #fff; }
  .log-modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 1001; align-items: center; justify-content: center; padding: 16px; }
  .log-modal .box { background: white; border-radius: 12px; padding: 20px; width: 100%; max-width: 440px; max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,0.3); font-family: 'Hiragino Sans', 'Meiryo', sans-serif; }

  @media print {
    @page { size: A4 landscape; margin: 0; }
    html, body { background: #fff; }
    .toolbar { display: none; }
    .stage { padding: 0; }
    .sheet { box-shadow: none; width: 297mm; height: 210mm; min-height: 0; margin: 0; overflow: hidden; }
    .preset-wrap { display: none; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <a href="${o.listHref}">← 一覧に戻る</a>
    <button class="print-btn" onclick="window.print()">🖨️ 印刷 / PDF保存</button>
    <button class="image-btn" onclick="saveAsImage()">🖼️ 画像で保存(PNG)</button>
    <button class="status-btn" id="toolbar-toggle-btn" data-status="${o.status}" onclick="toggleReportStatus()">${o.status === 'resolved' ? '対応中に戻す' : `${escHtml(o.resolvedLabel)}にする`}</button>
    <button class="logs-btn" onclick="showReportLogs()">履歴</button>
    <button class="delete-btn" onclick="deleteReport()">削除</button>
    <span class="hint">項目は直接クリックして編集できます。入力欄から離れると自動的に保存されます <span id="autosave-status"></span></span>
  </div>
  <div class="stage">
    <div class="sheet" id="print-sheet">
      <div class="sheet-head">
        <div class="left">
          <span class="badge">${escHtml(o.kindLabel)}</span>
          <h1>${escHtml(o.headingTitle)}</h1>
        </div>
        <div class="meta">
          報告No. ${o.reportId}<br>
          登録日時: ${escHtml(o.createdAt.slice(0, 16))}<br>
          報告者: ${escHtml(o.reporterName ?? '—')}<br>
          状態: <span id="detail-status-text">${statusText}</span>
        </div>
      </div>

      <div class="to-block">
        <span class="to-label">宛先：</span>
        <span class="to-field" id="to-field" contenteditable="true" data-placeholder="宛先を入力（例: １課班長）">${escHtml(o.suggestedTo)}</span>
        <div class="preset-wrap">${presetBtns}</div>
      </div>

      <div class="detail-title">詳細内容</div>
      <div class="grid">
        ${fieldRows}
      </div>

      <div class="notes-block">
        <div class="detail-title">追加備考</div>
        <textarea class="notes-field" id="notes-field" data-field="print_notes" placeholder="申し送り事項があれば入力してください">${escHtml(o.printNotes)}</textarea>
      </div>

      <div class="sheet-foot">
        <div>発行日時: <span id="issued-at"></span></div>
        <div class="sign-box">
          <div><div class="sign-label">確認</div><div class="sign"></div></div>
          <div><div class="sign-label">日付</div><div class="sign"></div></div>
        </div>
      </div>
    </div>
  </div>

  <div class="log-modal" id="report-log-modal" onclick="if(event.target===this)closeReportLogs()">
    <div class="box">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;margin:0;">対応履歴</h3>
        <button onclick="closeReportLogs()" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
      </div>
      <div id="report-log-body"></div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
  <script>
    var API_PATH = ${safeJson(o.apiPath)};
    var REPORT_ID = ${o.reportId};
    document.getElementById('issued-at').textContent = new Date().toLocaleString('ja-JP');
    function setTo(text) {
      document.getElementById('to-field').textContent = text;
    }
    async function toggleReportStatus() {
      var btn = document.getElementById('toolbar-toggle-btn');
      var current = btn.dataset.status;
      var next = current === 'resolved' ? 'open' : 'resolved';
      var res = await fetch(API_PATH + '/' + REPORT_ID + '/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) { alert('更新に失敗しました'); return; }
      var j = await res.json().catch(function(){ return {}; });
      var name = j.adminName || '管理者';
      btn.dataset.status = next;
      btn.textContent = next === 'resolved' ? '対応中に戻す' : ${safeJson(`${o.resolvedLabel}にする`)};
      var st = document.getElementById('detail-status-text');
      if (st) {
        st.textContent = next === 'resolved'
          ? ${safeJson(o.resolvedLabel)} + '（対応者: ' + name + '）'
          : '対応中';
      }
    }
    // 常時保存: 各項目からフォーカスが外れた（編集を終えた）タイミングで自動保存する。
    // keepalive:true により、保存中に「一覧に戻る」等でページ遷移してもリクエストは中断されず完了する。
    function collectFieldsPayload() {
      var payload = {};
      document.querySelectorAll('#print-sheet [data-field]').forEach(function(el) {
        var key = el.getAttribute('data-field');
        payload[key] = el.type === 'checkbox' ? el.checked : el.value;
      });
      return payload;
    }
    function autosaveStatusText(text, color) {
      var el = document.getElementById('autosave-status');
      if (el) { el.textContent = text; el.style.color = color; }
    }
    function autosaveField() {
      autosaveStatusText('保存中…', '#fbbf24');
      fetch(API_PATH + '/' + REPORT_ID + '/fields', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: collectFieldsPayload() }),
        keepalive: true,
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        autosaveStatusText(data.ok ? '✓ 保存済み' : '⚠ 保存に失敗しました', data.ok ? '#86efac' : '#fca5a5');
      })
      .catch(function() { autosaveStatusText('⚠ 保存に失敗しました', '#fca5a5'); });
    }
    document.querySelectorAll('#print-sheet [data-field]').forEach(function(el) {
      el.addEventListener('change', autosaveField);
    });
    async function deleteReport() {
      if (!confirm('この${escHtml(o.deleteLabel)}を削除しますか？\\n※削除しても「誰がいつ削除したか」は履歴に残ります')) return;
      var res = await fetch(API_PATH + '/' + REPORT_ID, { method: 'DELETE' });
      if (!res.ok) { alert('削除に失敗しました'); return; }
      location.href = ${safeJson(o.listHref)};
    }
    function escLog(s) {
      return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    async function showReportLogs() {
      var res = await fetch(API_PATH + '/' + REPORT_ID + '/logs');
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
    function closeReportLogs() { document.getElementById('report-log-modal').style.display = 'none'; }
    function saveAsImage() {
      var el = document.getElementById('print-sheet');
      if (typeof html2canvas === 'undefined') { alert('画像化ライブラリの読み込みに失敗しました。通信環境を確認してください。'); return; }
      html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then(function(canvas) {
        var link = document.createElement('a');
        link.download = ${safeJson(o.kindLabel)} + '_' + ${o.reportId} + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
      }).catch(function() {
        alert('画像の生成に失敗しました');
      });
    }
  </script>
</body>
</html>`;
}
