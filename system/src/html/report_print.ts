// 報告センター（忘れ物・事故・違反・一般報告）の個別帳票印刷・画像保存ページ
// A4横サイズの1枚に「宛先」「詳細内容」「追加備考」をまとめて印刷/PNG保存できる。
// 宛先・追加備考は contenteditable にして、印刷にもhtml2canvasの画像化にも同じ見た目で反映させる。

import { escHtml, safeJson } from './layout';

export interface ReportPrintField {
  label: string;
  value: string;
  full?: boolean; // trueなら2列分の幅いっぱいに表示（長文向け）
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
  backHref: string;
}

const TO_PRESETS = ['１課班長', '２課班長', '３課班長', '４課班長', '運行管理者', '統括管理者'];

export function renderReportPrintPage(o: ReportPrintOptions): string {
  const fieldRows = o.fields.map(f => `
    <div class="f-row${f.full ? ' full' : ''}">
      <div class="f-label">${escHtml(f.label)}</div>
      <div class="f-value">${escHtml(f.value || '—')}</div>
    </div>`).join('');

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

  .notes-block { margin-top: 10px; }
  .notes-field {
    border: 1px solid #d1d5db; border-radius: 4px; min-height: 16mm; padding: 6px 10px;
    font-size: 13px; line-height: 1.6; outline: none; white-space: pre-wrap;
  }
  .notes-field:empty:before { content: attr(data-placeholder); color: #9ca3af; }

  .sheet-foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; padding-top: 6px; border-top: 1px solid #d1d5db; font-size: 11px; color: #6b7280; }
  .sign-box { display: flex; gap: 24px; }
  .sign-box .sign { border-bottom: 1px solid #9ca3af; width: 120px; height: 24px; }
  .sign-box .sign-label { font-size: 11px; color: #6b7280; margin-bottom: 2px; }

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
    <span class="hint">宛先・追加備考はクリックして直接書き換えできます</span>
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
          状態: ${statusText}
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
        <div class="notes-field" id="notes-field" contenteditable="true" data-placeholder="申し送り事項があれば入力してください"></div>
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

  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
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
