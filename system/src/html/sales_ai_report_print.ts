// 個人別 AI売上分析レポート 印刷ページ（/sales-ai/employee/:id/report/print）
// A4縦1枚に自動縮小して収める（report_print.tsのfitSheetToPage方式を踏襲）。
// ※「AI」は表示名のみ。中身は utils/sales_trend_analysis.ts の buildRuleBasedSalesAnalysis()
//   が売上データを集計してテンプレート文に流し込んだもので、外部AI/LLM APIは使用しない。
import { escHtml } from './layout';
import type { SalesAnalysisContent } from '../utils/sales_trend_analysis';

export interface SalesAiReportSheetOptions {
  name: string;
  division: number | null;
  team: number | null;
  periodLabel: string;
  issuedDateLabel: string;
  totalAmount: number;
  cnt: number;
  lastDate: string | null;
  weekdayBreakdown: Array<{ label: string; avg: number | null; count: number }>;
  content: SalesAnalysisContent;
}

// 印刷ページ共通CSS（単票・一括の両方で使用）
export const SALES_AI_REPORT_PRINT_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #111827; }
  .toolbar { position: sticky; top: 0; z-index: 10; background: #1a3a5c; padding: 10px 16px; display: flex; gap: 8px; align-items: center; }
  .toolbar a, .toolbar button { font-size: 13px; padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; font-weight: 600; }
  .toolbar a { background: #374151; color: #fff; }
  .toolbar button.print-btn { background: #2563eb; color: #fff; }
  .toolbar .hint { margin-left: auto; font-size: 12px; color: #cbd5e1; }
  .stage { padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 24px; }

  .sheet { width: 210mm; height: 297mm; background: #fff; padding: 16mm 18mm; box-shadow: 0 4px 20px rgba(0,0,0,0.25); overflow: hidden; position: relative; }
  .sheet-fit { width: 100%; transform-origin: top left; }

  .sr-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a3a5c; padding-bottom: 10px; margin-bottom: 14px; }
  .sr-head h1 { font-size: 19px; margin: 0; color: #1a3a5c; letter-spacing: .04em; }
  .sr-head .sub { font-size: 11px; color: #9ca3af; margin-top: 3px; }
  .sr-head .meta { text-align: right; font-size: 11px; color: #6b7280; line-height: 1.7; }
  .sr-badge { display: inline-block; background: #eff6ff; color: #1a3a5c; border: 1px solid #bfdbfe; border-radius: 20px; padding: 2px 12px; font-size: 10px; font-weight: 700; margin-bottom: 4px; }

  .sr-to { font-size: 19px; font-weight: 800; margin-bottom: 4px; }
  .sr-to .suffix { font-size: 14px; font-weight: 600; color: #374151; margin-left: 4px; }
  .sr-to-sub { font-size: 12px; color: #6b7280; margin-bottom: 14px; }

  .sr-kpis { display: flex; gap: 10px; margin-bottom: 16px; }
  .sr-kpi { flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; text-align: center; }
  .sr-kpi-label { font-size: 10px; color: #9ca3af; font-weight: 700; }
  .sr-kpi-value { font-size: 16px; font-weight: 800; color: #1a3a5c; margin-top: 2px; }

  .sr-headline { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 10px 14px; font-size: 12.5px; font-weight: 700; color: #78350f; margin-bottom: 14px; line-height: 1.7; }

  .sr-section { margin-bottom: 12px; }
  .sr-section-title { font-size: 11.5px; font-weight: 700; color: #1a3a5c; margin-bottom: 5px; padding-left: 7px; border-left: 4px solid #1a3a5c; }
  .sr-body-text { font-size: 11.5px; line-height: 1.75; color: #1f2937; white-space: pre-wrap; }
  .sr-list { margin: 0; padding-left: 18px; font-size: 11.5px; line-height: 1.7; color: #1f2937; }
  .sr-list li { margin-bottom: 2px; }
  .sr-empty { font-size: 11.5px; color: #9ca3af; }
  .sr-cols { display: flex; gap: 14px; }
  .sr-cols > div { flex: 1; }
  .sr-weak .sr-section-title { color: #b91c1c; border-left-color: #b91c1c; }
  .sr-strong .sr-section-title { color: #166534; border-left-color: #166534; }

  .sr-weekday-row { display: flex; align-items: flex-end; gap: 6px; height: 50px; padding-top: 2px; }
  .sr-weekday-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 2px; min-width: 0; }
  .sr-weekday-val { font-size: 8.5px; font-weight: 700; color: #475569; line-height: 1; height: 10px; }
  .sr-weekday-bar { width: 100%; max-width: 22px; border-radius: 2px 2px 1px 1px; background: #1a3a5c; }
  .sr-weekday-lb { font-size: 8.5px; color: #6b7280; }

  .sr-closing { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 10px 14px; font-size: 11.5px; line-height: 1.75; color: #0c4a6e; margin-bottom: 12px; }

  .sr-disclaimer { font-size: 9.5px; color: #9ca3af; line-height: 1.6; border-top: 1px dashed #d1d5db; padding-top: 7px; margin-top: 8px; }
  .sr-foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 6px; padding-top: 6px; }
  .sr-foot .left { font-size: 9.5px; color: #9ca3af; }
  .sr-foot .right { text-align: right; font-size: 9.5px; color: #9ca3af; line-height: 1.6; }
  .sr-foot .right .brand { font-size: 11px; font-weight: 800; color: #1a3a5c; }

  @media print {
    @page { size: A4 portrait; margin: 0; }
    html, body { background: #fff; }
    .toolbar { display: none; }
    .stage { padding: 0; gap: 0; }
    .sheet { box-shadow: none; margin: 0; page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }
  }
`;

// 1社員分のシート内側（単票・一括の両方から呼び出す）
export function renderSalesAiReportSheet(o: SalesAiReportSheetOptions, sheetIndex: number): string {
  const weekdayMax = Math.max(...o.weekdayBreakdown.map(w => w.avg ?? 0), 1);
  const weekdayHtml = `<div class="sr-weekday-row">${o.weekdayBreakdown.map(w => `
    <div class="sr-weekday-col">
      <div class="sr-weekday-val">${w.avg !== null ? w.avg.toLocaleString('ja-JP') : ''}</div>
      <div class="sr-weekday-bar" style="height:${w.avg !== null && w.avg > 0 ? Math.max(Math.round(w.avg / weekdayMax * 32), 4) : 2}px;"></div>
      <div class="sr-weekday-lb">${escHtml(w.label)}</div>
    </div>`).join('')}</div>`;

  const weakHtml = o.content.weak_points.length
    ? `<ul class="sr-list">${o.content.weak_points.map(t => `<li>${escHtml(t)}</li>`).join('')}</ul>`
    : `<div class="sr-empty">特筆すべき弱点は見られませんでした</div>`;
  const strongHtml = o.content.strong_points.length
    ? `<ul class="sr-list">${o.content.strong_points.map(t => `<li>${escHtml(t)}</li>`).join('')}</ul>`
    : `<div class="sr-empty">特筆すべき強みは見られませんでした</div>`;
  const recsHtml = o.content.recommendations.length
    ? `<ul class="sr-list">${o.content.recommendations.map(t => `<li>${escHtml(t)}</li>`).join('')}</ul>`
    : `<div class="sr-empty">—</div>`;

  return `
    <div class="sheet" id="print-sheet-${sheetIndex}">
      <div class="sheet-fit" id="sheet-fit-${sheetIndex}">
        <div class="sr-head">
          <div>
            <div class="sr-badge">AI売上分析レポート</div>
            <h1>売上傾向分析レポート</h1>
            <div class="sub">売上実績データに基づくAI自動分析（東京23区＋武蔵野市・三鷹市エリア）</div>
          </div>
          <div class="meta">
            発行日：${escHtml(o.issuedDateLabel)}<br>
            対象期間：${escHtml(o.periodLabel)}
          </div>
        </div>

        <div class="sr-to">${escHtml(o.name)}<span class="suffix">様</span></div>
        <div class="sr-to-sub">${o.division != null ? `${o.division}課 ` : ''}${o.team != null ? `${o.team}班` : ''}</div>

        <div class="sr-kpis">
          <div class="sr-kpi"><div class="sr-kpi-label">対象日数</div><div class="sr-kpi-value">${o.cnt}日</div></div>
          <div class="sr-kpi"><div class="sr-kpi-label">合計売上</div><div class="sr-kpi-value" style="font-size:14px;">¥${o.totalAmount.toLocaleString('ja-JP')}</div></div>
          <div class="sr-kpi"><div class="sr-kpi-label">平均日商</div><div class="sr-kpi-value" style="font-size:14px;">¥${(o.cnt ? Math.round(o.totalAmount / o.cnt) : 0).toLocaleString('ja-JP')}</div></div>
          <div class="sr-kpi"><div class="sr-kpi-label">直近実績日</div><div class="sr-kpi-value" style="font-size:14px;">${o.lastDate ? escHtml(o.lastDate.slice(0, 10)) : '—'}</div></div>
        </div>

        <div class="sr-headline">${escHtml(o.content.headline)}</div>

        <div class="sr-section">
          <div class="sr-section-title">曜日別平均売上</div>
          ${weekdayHtml}
        </div>

        <div class="sr-section">
          <div class="sr-section-title">傾向分析</div>
          <div class="sr-body-text">${escHtml(o.content.trend_summary)}</div>
        </div>

        <div class="sr-cols">
          <div class="sr-section sr-weak">
            <div class="sr-section-title">弱点・改善余地</div>
            ${weakHtml}
          </div>
          <div class="sr-section sr-strong">
            <div class="sr-section-title">強み</div>
            ${strongHtml}
          </div>
        </div>

        <div class="sr-section">
          <div class="sr-section-title">改善提案</div>
          ${recsHtml}
        </div>

        <div class="sr-closing">${escHtml(o.content.closing_comment)}</div>

        <div class="sr-disclaimer">
          ※本レポートは売上実績データを集計・分析して自動生成したものです（ルールベース集計であり外部AIサービスは使用していません）。参考情報としてご活用ください。
        </div>
        <div class="sr-foot">
          <div class="left">本紙は社内システムより自動生成されています</div>
          <div class="right">発行日時: <span class="issued-at"></span><br><span class="brand">ホシコンAI売上分析システム</span></div>
        </div>
      </div>
    </div>`;
}

export function renderSalesAiReportPrintPage(o: SalesAiReportSheetOptions, backHref: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>AI売上分析レポート（${escHtml(o.name)}）</title>
<style>${SALES_AI_REPORT_PRINT_CSS}</style>
</head>
<body>
  <div class="toolbar">
    <a href="${backHref}">← 個人詳細に戻る</a>
    <button class="print-btn" onclick="window.print()">🖨️ 印刷 / PDF保存</button>
    <span class="hint">このレポートはAIが売上実績データから自動生成した分析です</span>
  </div>
  <div class="stage">
    ${renderSalesAiReportSheet(o, 0)}
  </div>
  <script>
    document.querySelectorAll('.issued-at').forEach(function(el) { el.textContent = new Date().toLocaleString('ja-JP'); });
    function fitSheetToPage() {
      var fit = document.getElementById('sheet-fit-0');
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
    fitSheetToPage();
    window.addEventListener('load', fitSheetToPage);
    window.addEventListener('beforeprint', fitSheetToPage);
  </script>
</body>
</html>`;
}
