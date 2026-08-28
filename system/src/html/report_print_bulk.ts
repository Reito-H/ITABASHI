// 報告センター（忘れ物・事故・違反・一般報告）の複数件まとめ帳票印刷・画像保存ページ
// 一覧でチェックした複数の報告を、A4横1枚に一覧表としてまとめて印刷/PNG保存する。
// 宛先・各行の内容・追加備考は contenteditable にして、印刷前にその場で書き換えできる。

import { escHtml, safeJson } from './layout';

export interface ReportPrintBulkItem {
  kindLabel: string;
  kindColor: string;
  createdAt: string;
  vehicleNo: string;
  employeeStr: string;
  contentSummary: string;
  statusLabel: string;
  statusColor: string;
}

export interface ReportPrintBulkOptions {
  pageTitle: string;
  headingTitle: string;    // 帳票内の見出し（種別名など）
  suggestedTo: string;
  items: ReportPrintBulkItem[];
  backHref: string;
}

const TO_PRESETS = ['１課班長', '２課班長', '３課班長', '４課班長', '運行管理者', '統括管理者'];

export function renderReportPrintBulkPage(o: ReportPrintBulkOptions): string {
  const overflowWarning = o.items.length > 24
    ? '<span style="color:#fbbf24;font-weight:600;">※件数が多いためA4横1枚に収まらない可能性があります</span>'
    : '';

  const presetBtns = TO_PRESETS.map(p =>
    `<button type="button" class="preset-btn" onclick="setTo('${escHtml(p)}')">${escHtml(p)}</button>`
  ).join('');

  const rows = o.items.map((it, i) => `
    <tr>
      <td class="c-idx">${i + 1}</td>
      <td class="c-kind"><span class="kind-badge" style="background:${it.kindColor}">${escHtml(it.kindLabel)}</span></td>
      <td class="c-date">${escHtml(it.createdAt.slice(0, 16))}</td>
      <td class="c-veh">${escHtml(it.vehicleNo || '—')}</td>
      <td class="c-emp">${escHtml(it.employeeStr)}</td>
      <td class="c-content" contenteditable="true">${escHtml(it.contentSummary || '—')}</td>
      <td class="c-status" style="color:${it.statusColor}">${escHtml(it.statusLabel)}</td>
    </tr>`).join('');

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
  .stage { padding: 24px; display: flex; justify-content: center; }

  .sheet {
    width: 297mm; min-height: 210mm; background: #fff; padding: 10mm 12mm;
    box-shadow: 0 4px 20px rgba(0,0,0,0.25);
  }
  .sheet-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e3a5f; padding-bottom: 8px; margin-bottom: 8px; }
  .sheet-head h1 { font-size: 18px; margin: 0; color: #1e3a5f; }
  .sheet-head .meta { text-align: right; font-size: 11px; color: #6b7280; line-height: 1.5; }

  .to-block { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; }
  .to-label { font-size: 13px; color: #374151; font-weight: 600; white-space: nowrap; }
  .to-field {
    min-width: 220px; font-size: 16px; font-weight: 700; padding: 3px 6px;
    border-bottom: 2px solid #1e3a5f; outline: none;
  }
  .to-field:empty:before { content: attr(data-placeholder); color: #9ca3af; font-weight: 400; }
  .preset-btn {
    font-size: 11px; padding: 3px 9px; border-radius: 12px; border: 1px solid #94a3b8;
    background: #f9fafb; color: #374151; cursor: pointer;
  }
  .preset-btn:hover { background: #eef2ff; border-color: #a5b4fc; }
  .preset-wrap { display: flex; gap: 6px; flex-wrap: wrap; }

  table.items { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.items th, table.items td { border: 1px solid #94a3b8; font-size: 11px; padding: 4px 6px; vertical-align: top; white-space: pre-wrap; word-break: break-word; }
  table.items th { background: #f3f4f6; color: #4b5563; font-weight: 700; text-align: left; }
  .c-idx { width: 22px; text-align: center; }
  .c-kind { width: 86px; white-space: nowrap; }
  .c-date { width: 78px; white-space: nowrap; }
  .c-veh { width: 64px; }
  .c-emp { width: 100px; }
  .c-status { width: 56px; font-weight: 600; }
  .kind-badge { display: inline-block; padding: 1px 8px; border-radius: 10px; color: #fff; font-size: 10px; font-weight: 700; white-space: nowrap; }

  .notes-block { margin-top: 8px; }
  .detail-title { font-size: 12px; font-weight: 700; color: #1e3a5f; margin: 0 0 3px; padding-left: 6px; border-left: 4px solid #1e3a5f; }
  .notes-field {
    border: 1px solid #94a3b8; border-radius: 4px; min-height: 14mm; padding: 6px 10px;
    font-size: 12px; line-height: 1.5; outline: none; white-space: pre-wrap;
  }
  .notes-field:empty:before { content: attr(data-placeholder); color: #9ca3af; }

  .sheet-foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 8px; padding-top: 5px; border-top: 1px solid #94a3b8; font-size: 10px; color: #6b7280; }
  .sign-box { display: flex; gap: 20px; }
  .sign-box .sign { border-bottom: 1px solid #64748b; width: 100px; height: 20px; }
  .sign-box .sign-label { font-size: 10px; color: #6b7280; margin-bottom: 2px; }

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
    <a href="${o.backHref}">← 一覧に戻る</a>
    <button class="print-btn" onclick="window.print()">🖨️ 印刷 / PDF保存</button>
    <button class="image-btn" onclick="saveAsImage()">🖼️ 画像で保存(PNG)</button>
    <span class="hint">宛先・各行の内容・追加備考はクリックして直接書き換えできます　${overflowWarning}</span>
  </div>
  <div class="stage">
    <div class="sheet" id="print-sheet">
      <div class="sheet-head">
        <h1>${escHtml(o.headingTitle)}（${o.items.length}件）</h1>
        <div class="meta">発行日時: <span id="issued-at"></span></div>
      </div>

      <div class="to-block">
        <span class="to-label">宛先：</span>
        <span class="to-field" id="to-field" contenteditable="true" data-placeholder="宛先を入力（例: １課班長）">${escHtml(o.suggestedTo)}</span>
        <div class="preset-wrap">${presetBtns}</div>
      </div>

      <table class="items">
        <thead>
          <tr>
            <th class="c-idx">No</th>
            <th class="c-kind">種別</th>
            <th class="c-date">登録日時</th>
            <th class="c-veh">車番</th>
            <th class="c-emp">乗務員</th>
            <th>内容</th>
            <th class="c-status">状態</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <div class="notes-block">
        <div class="detail-title">追加備考</div>
        <div class="notes-field" id="notes-field" contenteditable="true" data-placeholder="申し送り事項があれば入力してください"></div>
      </div>

      <div class="sheet-foot">
        <div>件数: ${o.items.length}件</div>
        <div class="sign-box">
          <div><div class="sign-label">確認</div><div class="sign"></div></div>
          <div><div class="sign-label">日付</div><div class="sign"></div></div>
        </div>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>
  <script>
    document.getElementById('issued-at').textContent = new Date().toLocaleString('ja-JP');
    function setTo(text) {
      document.getElementById('to-field').textContent = text;
    }
    function saveAsImage() {
      var el = document.getElementById('print-sheet');
      if (typeof html2canvas === 'undefined') { alert('画像化ライブラリの読み込みに失敗しました。通信環境を確認してください。'); return; }
      html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then(function(canvas) {
        var link = document.createElement('a');
        link.download = ${safeJson(o.headingTitle)} + '_まとめ.png';
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
