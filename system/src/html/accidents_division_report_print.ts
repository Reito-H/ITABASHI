// 課別 事故防止AI 傾向分析レポート 印刷ページ（/accidents/division/:div/report/print）
// A4縦1枚に自動縮小して収める（report_print.tsのfitSheetToPage方式を踏襲）。
// ※「事故防止AI」は表示名のみ。中身は utils/accident_trend_analysis.ts の buildRuleBasedTrendAnalysis()
//   が事故記録データを集計してテンプレート文に流し込んだもので、外部AI/LLM APIは使用しない。
import { escHtml } from './layout';
import type { TrendAnalysisContent } from '../utils/accident_trend_analysis';

// 「毎年の傾向」「事故多発注意日」（月×曜日ベース率の統計モデルによる。/utils/accident_forecast.tsの予測カレンダーと同じロジック）
export interface DivisionForecastSummary {
  insufficientData: boolean;
  usedFallback: boolean; // 課単体のデータが少なく全社データにフォールバックした場合true
  yearlyTrendText: string;
  cautionDays: Array<{ date: string; weekday: string }>;
}

export interface AccidentDivisionReportPrintOptions {
  division: number;
  periodLabel: string;
  cnt: number;
  avgFault: number | null;
  damageSum: number;
  lastDate: string;
  issuedDateLabel: string;
  content: TrendAnalysisContent;
  forecast?: DivisionForecastSummary;
  backHref: string;
}

export function renderAccidentDivisionReportPrintPage(o: AccidentDivisionReportPrintOptions): string {
  const causesHtml = o.content.main_causes.length
    ? `<ul class="ar-list">${o.content.main_causes.map(c => `<li>${escHtml(c)}</li>`).join('')}</ul>`
    : `<div class="ar-empty">特筆すべき偏りは見られませんでした</div>`;
  const recsHtml = o.content.recommendations.length
    ? `<ul class="ar-list">${o.content.recommendations.map(c => `<li>${escHtml(c)}</li>`).join('')}</ul>`
    : `<div class="ar-empty">—</div>`;
  const weekdayMax = Math.max(...o.content.weekday_breakdown.map(w => w.cnt), 1);
  const weekdayHtml = `<div class="ar-weekday-row">${o.content.weekday_breakdown.map(w => `
    <div class="ar-weekday-col">
      <div class="ar-weekday-val">${w.cnt > 0 ? w.cnt : ''}</div>
      <div class="ar-weekday-bar" style="height:${w.cnt > 0 ? Math.max(Math.round(w.cnt / weekdayMax * 34), 4) : 2}px;"></div>
      <div class="ar-weekday-lb">${escHtml(w.label)}</div>
    </div>`).join('')}</div>`;

  const forecastHtml = (() => {
    const f = o.forecast;
    if (!f) return '';
    if (f.insufficientData) {
      return `
        <div class="ar-section">
          <div class="ar-section-title">毎年の傾向・事故多発注意日</div>
          <div class="ar-empty">統計に必要なデータ量がまだ十分ではありません。</div>
        </div>`;
    }
    const fallbackNote = f.usedFallback ? '（この課単体のデータが少ないため、全社データを基に算出しています）' : '';
    const cautionHtml = f.cautionDays.length
      ? `<ul class="ar-list">${f.cautionDays.map(d => `<li>${escHtml(d.date.slice(5).replace('-', '/'))}（${escHtml(d.weekday)}）</li>`).join('')}</ul>`
      : `<div class="ar-empty">今月は特に統計的な注意日はありません。</div>`;
    return `
      <div class="ar-section">
        <div class="ar-section-title">毎年の傾向</div>
        <div class="ar-body-text">${escHtml(f.yearlyTrendText)}${escHtml(fallbackNote)}</div>
      </div>
      <div class="ar-section">
        <div class="ar-section-title">事故多発注意日（今月）</div>
        ${cautionHtml}
      </div>`;
  })();

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>事故防止AI 傾向分析レポート（${o.division}課）</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #111827; }
  .toolbar { position: sticky; top: 0; z-index: 10; background: #1e3a5f; padding: 10px 16px; display: flex; gap: 8px; align-items: center; }
  .toolbar a, .toolbar button { font-size: 13px; padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; font-weight: 600; }
  .toolbar a { background: #374151; color: #fff; }
  .toolbar button.print-btn { background: #2563eb; color: #fff; }
  .toolbar .hint { margin-left: auto; font-size: 12px; color: #cbd5e1; }
  .stage { padding: 24px; display: flex; justify-content: center; }

  /* .sheetは常にA4縦(210mm x 297mm)固定。中身がはみ出す場合は#sheet-fitをJSで縮小し、必ず1枚に収める */
  .sheet {
    width: 210mm; height: 297mm; background: #fff; padding: 16mm 18mm;
    box-shadow: 0 4px 20px rgba(0,0,0,0.25); overflow: hidden; position: relative;
  }
  .sheet-fit { width: 100%; transform-origin: top left; }

  .ar-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a3a5c; padding-bottom: 10px; margin-bottom: 14px; }
  .ar-head h1 { font-size: 19px; margin: 0; color: #1a3a5c; letter-spacing: .04em; }
  .ar-head .sub { font-size: 11px; color: #9ca3af; margin-top: 3px; }
  .ar-head .meta { text-align: right; font-size: 11px; color: #6b7280; line-height: 1.7; }
  .ar-badge { display: inline-block; background: #eff6ff; color: #1a3a5c; border: 1px solid #bfdbfe; border-radius: 20px; padding: 2px 12px; font-size: 10px; font-weight: 700; margin-bottom: 4px; }

  .ar-to { font-size: 19px; font-weight: 800; margin-bottom: 14px; }

  .ar-kpis { display: flex; gap: 10px; margin-bottom: 16px; }
  .ar-kpi { flex: 1; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; text-align: center; }
  .ar-kpi-label { font-size: 10px; color: #9ca3af; font-weight: 700; }
  .ar-kpi-value { font-size: 17px; font-weight: 800; color: #1a3a5c; margin-top: 2px; }

  .ar-headline { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px 14px; font-size: 13px; font-weight: 700; color: #1e3a5f; margin-bottom: 16px; line-height: 1.7; }

  .ar-section { margin-bottom: 14px; }
  .ar-section-title { font-size: 12px; font-weight: 700; color: #1a3a5c; margin-bottom: 6px; padding-left: 7px; border-left: 4px solid #1a3a5c; }
  .ar-body-text { font-size: 12.5px; line-height: 1.9; color: #1f2937; white-space: pre-wrap; }
  .ar-list { margin: 0; padding-left: 20px; font-size: 12.5px; line-height: 1.85; color: #1f2937; }
  .ar-list li { margin-bottom: 3px; }
  .ar-empty { font-size: 12px; color: #9ca3af; }

  .ar-weekday-row { display: flex; align-items: flex-end; gap: 6px; height: 56px; padding-top: 2px; }
  .ar-weekday-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 2px; min-width: 0; }
  .ar-weekday-val { font-size: 9px; font-weight: 700; color: #475569; line-height: 1; height: 10px; }
  .ar-weekday-bar { width: 100%; max-width: 22px; border-radius: 2px 2px 1px 1px; background: #1a3a5c; }
  .ar-weekday-lb { font-size: 9px; color: #6b7280; }

  .ar-closing { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 12px 14px; font-size: 12.5px; line-height: 1.85; color: #0c4a6e; margin-bottom: 14px; }

  .ar-disclaimer { font-size: 10px; color: #9ca3af; line-height: 1.6; border-top: 1px dashed #d1d5db; padding-top: 8px; margin-top: 10px; }
  .ar-foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 6px; padding-top: 6px; font-size: 10px; color: #9ca3af; }

  @media print {
    @page { size: A4 portrait; margin: 0; }
    html, body { background: #fff; }
    .toolbar { display: none; }
    .stage { padding: 0; }
    .sheet { box-shadow: none; margin: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <a href="${o.backHref}">← 課の詳細一覧に戻る</a>
    <button class="print-btn" onclick="window.print()">🖨️ 印刷 / PDF保存</button>
    <span class="hint">事故記録データから自動生成した課別の傾向分析です</span>
  </div>
  <div class="stage">
    <div class="sheet" id="print-sheet">
      <div class="sheet-fit" id="sheet-fit">
        <div class="ar-head">
          <div>
            <div class="ar-badge">事故防止AI</div>
            <h1>課別 事故傾向分析レポート</h1>
            <div class="sub">事故記録データに基づく自動分析</div>
          </div>
          <div class="meta">
            発行日：${escHtml(o.issuedDateLabel)}<br>
            対象期間：${escHtml(o.periodLabel)}
          </div>
        </div>

        <div class="ar-to">${o.division}課</div>

        <div class="ar-kpis">
          <div class="ar-kpi"><div class="ar-kpi-label">事故件数</div><div class="ar-kpi-value">${o.cnt}件</div></div>
          <div class="ar-kpi"><div class="ar-kpi-label">平均予定過失割合</div><div class="ar-kpi-value">${o.avgFault != null ? o.avgFault + '%' : '—'}</div></div>
          <div class="ar-kpi"><div class="ar-kpi-label">損害額合計</div><div class="ar-kpi-value" style="font-size:14px;">¥${o.damageSum.toLocaleString('ja-JP')}</div></div>
          <div class="ar-kpi"><div class="ar-kpi-label">直近事故日</div><div class="ar-kpi-value" style="font-size:14px;">${escHtml(o.lastDate.slice(0, 10) || '—')}</div></div>
        </div>

        <div class="ar-headline">${escHtml(o.content.headline)}</div>

        <div class="ar-section">
          <div class="ar-section-title">曜日別事故件数</div>
          ${weekdayHtml}
        </div>
        ${forecastHtml}

        <div class="ar-section">
          <div class="ar-section-title">傾向分析</div>
          <div class="ar-body-text">${escHtml(o.content.trend_summary)}</div>
        </div>

        <div class="ar-section">
          <div class="ar-section-title">主な原因</div>
          ${causesHtml}
        </div>

        <div class="ar-section">
          <div class="ar-section-title">リスクパターン</div>
          <div class="ar-body-text">${escHtml(o.content.risk_pattern)}</div>
        </div>

        <div class="ar-section">
          <div class="ar-section-title">改善提案</div>
          ${recsHtml}
        </div>

        <div class="ar-closing">${escHtml(o.content.closing_comment)}</div>

        <div class="ar-disclaimer">
          ※本レポートは事故記録データを集計・分析して自動生成したものです。参考情報としてご活用のうえ、最終的な指導・判断は担当者が行ってください。
        </div>
        <div class="ar-foot">
          <div>本紙は社内システムより自動生成されています</div>
          <div>発行日時: <span id="issued-at"></span></div>
        </div>
      </div>
    </div>
  </div>
  <script>
    document.getElementById('issued-at').textContent = new Date().toLocaleString('ja-JP');
    function fitSheetToPage() {
      var fit = document.getElementById('sheet-fit');
      if (!fit) return;
      var pxPerMm = 96 / 25.4;
      var availablePx = (297 - 32) * pxPerMm;
      fit.style.transform = 'none';
      fit.style.width = '100%';
      // 幅を広げて縮小率を掛けるたびに文字の折り返しが変わり必要な高さも変わるため、
      // 収まるまで数回繰り返して収束させる（1回きりの補正だと余白1枚だけの空白ページが出ることがあった）
      var scale = 1;
      for (var i = 0; i < 6; i++) {
        var natural = fit.scrollHeight;
        if (natural <= 0 || natural * scale <= availablePx) break;
        scale = (availablePx / natural) * 0.97;
        fit.style.width = (100 / scale) + '%';
        fit.style.transform = 'scale(' + scale + ')';
      }
    }
    fitSheetToPage();
    window.addEventListener('load', fitSheetToPage);
    window.addEventListener('beforeprint', fitSheetToPage);
  </script>
</body>
</html>`;
}
