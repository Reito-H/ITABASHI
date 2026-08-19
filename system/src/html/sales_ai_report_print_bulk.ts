// 複数社員分 AI売上分析レポート 一括印刷ページ（/sales-ai/report/print-bulk?ids=1,2,3）
// 1社員=2枚（分析＋所感記入シート、A4縦）で連続出力。各シートの描画は sales_ai_report_print.ts のシート部品を共用する。
import { escHtml } from './layout';
import { renderSalesAiReportSheet, renderSalesAiReportCommentSheet, SALES_AI_REPORT_PRINT_CSS, type SalesAiReportSheetOptions } from './sales_ai_report_print';

export function renderSalesAiReportPrintBulkPage(sheets: SalesAiReportSheetOptions[], backHref: string): string {
  const sheetsHtml = sheets.map((o, i) => renderSalesAiReportSheet(o, i * 2) + renderSalesAiReportCommentSheet(o, i * 2 + 1)).join('\n');
  const names = sheets.map(o => o.name).join('・');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>AI売上分析レポート（一括・${sheets.length}名）</title>
<style>${SALES_AI_REPORT_PRINT_CSS}</style>
</head>
<body>
  <div class="toolbar">
    <a href="${backHref}">← AI売上分析（全社）に戻る</a>
    <button class="print-btn" onclick="window.print()">🖨️ まとめて印刷 / PDF保存</button>
    <span class="hint">${sheets.length}名分：${escHtml(names)}</span>
  </div>
  <div class="stage">
    ${sheetsHtml}
  </div>
  <script>
    document.querySelectorAll('.issued-at').forEach(function(el) { el.textContent = new Date().toLocaleString('ja-JP'); });
    var SHEET_COUNT = ${sheets.length * 2};
    function fitOneSheet(i) {
      var fit = document.getElementById('sheet-fit-' + i);
      if (!fit) return;
      var pxPerMm = 96 / 25.4;
      var availablePx = (297 - 32) * pxPerMm;
      fit.style.transform = 'none';
      fit.style.width = '100%';
      var natural = fit.scrollHeight;
      var scale = 1;
      if (natural > availablePx && natural > 0) {
        scale = (availablePx / natural) * 0.99;
        fit.style.width = (100 / scale) + '%';
        fit.style.transform = 'scale(' + scale + ')';
        var reNatural = fit.scrollHeight;
        if (reNatural * scale > availablePx) {
          scale = (availablePx / reNatural) * 0.99;
          fit.style.width = (100 / scale) + '%';
          fit.style.transform = 'scale(' + scale + ')';
        }
      }
    }
    function fitAllSheets() {
      for (var i = 0; i < SHEET_COUNT; i++) fitOneSheet(i);
    }
    fitAllSheets();
    window.addEventListener('load', fitAllSheets);
    window.addEventListener('beforeprint', fitAllSheets);
  </script>
</body>
</html>`;
}
