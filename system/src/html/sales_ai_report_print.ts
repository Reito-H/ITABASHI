// 個人別 AI売上分析レポート 印刷ページ（/sales-ai/employee/:id/report/print）
// A4縦1枚に自動縮小して収める（report_print.tsのfitSheetToPage方式を踏襲）。
// ※「AI」は表示名のみ。中身は utils/sales_trend_analysis.ts の buildRuleBasedSalesAnalysis()
//   が売上データを集計してテンプレート文に流し込んだもので、外部AI/LLM APIは使用しない。
import { escHtml } from './layout';
import type { SalesAnalysisContent } from '../utils/sales_trend_analysis';
import type { DrivingRiskSummary } from '../utils/driving_risk_analysis';

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
  drivingRisk: DrivingRiskSummary | null;
}

const RISK_LEVEL_LABELS: Record<DrivingRiskSummary['riskLevel'], string> = { low: '低', medium: '中', high: '高' };
const RISK_LEVEL_COLORS: Record<DrivingRiskSummary['riskLevel'], { bg: string; fg: string; border: string }> = {
  low: { bg: '#f0fdf4', fg: '#166534', border: '#bbf7d0' },
  medium: { bg: '#fffbeb', fg: '#d97706', border: '#fde68a' },
  high: { bg: '#fef2f2', fg: '#dc2626', border: '#fecaca' },
};

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
  .sr-kpi { flex: 1; background: #f9fafb; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 10px; text-align: center; }
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

  .sr-disclaimer { font-size: 9.5px; color: #9ca3af; line-height: 1.6; border-top: 1px dashed #94a3b8; padding-top: 7px; margin-top: 8px; }
  .sr-foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 6px; padding-top: 6px; }
  .sr-foot .left { font-size: 9.5px; color: #9ca3af; }
  .sr-foot .right { text-align: right; font-size: 9.5px; color: #9ca3af; line-height: 1.6; }
  .sr-foot .right .brand { font-size: 11px; font-weight: 800; color: #1a3a5c; }

  .sr-badge2 { display: inline-block; border-radius: 20px; padding: 1px 9px; font-size: 10px; font-weight: 700; }

  /* 2枚目: 所感記入シート */
  .sr-comment-title { font-size: 13px; font-weight: 700; color: #1a3a5c; margin: 6px 0 14px; padding-left: 8px; border-left: 4px solid #1a3a5c; }
  .sr-comment-box { border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px 20px; }
  .sr-comment-line { height: 30px; border-bottom: 1px solid #94a3b8; }
  .sr-comment-line:last-child { border-bottom: none; }

  /* .sheet-fit（自動縮小の対象）の外に置き、.sheet基準の絶対位置に固定することで、
     上の内容がどれだけ長くなっても印鑑欄が押し出されたり2枚目にはみ出したりしないようにする */
  .sr-stamp-footer { position: absolute; right: 18mm; bottom: 16mm; display: flex; justify-content: flex-end; }
  .sr-stamp-row { display: flex; gap: 18px; }
  .sr-stamp-box { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .sr-stamp-frame { width: 52px; height: 52px; border: 1.5px solid #64748b; border-radius: 4px; }
  .sr-stamp-label { font-size: 10.5px; color: #475569; }

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

  const riskHtml = o.drivingRisk ? (() => {
    const colors = RISK_LEVEL_COLORS[o.drivingRisk!.riskLevel];
    return `
      <div class="sr-kpis" style="margin-bottom:0;">
        <div class="sr-kpi"><div class="sr-kpi-label">総合判定</div><div class="sr-kpi-value"><span class="sr-badge2" style="background:${colors.bg};color:${colors.fg};border:1px solid ${colors.border};">リスク${RISK_LEVEL_LABELS[o.drivingRisk!.riskLevel]}</span></div></div>
        <div class="sr-kpi"><div class="sr-kpi-label">急挙動合計</div><div class="sr-kpi-value">${o.drivingRisk!.totalHarshEvents}件</div></div>
        <div class="sr-kpi"><div class="sr-kpi-label">乗務日あたり</div><div class="sr-kpi-value">${o.drivingRisk!.harshEventsPerDuty}件</div></div>
        <div class="sr-kpi"><div class="sr-kpi-label">最高速度(高速/一般)</div><div class="sr-kpi-value" style="font-size:13px;">${o.drivingRisk!.maxSpeedHighway ?? '—'}/${o.drivingRisk!.maxSpeedLocal ?? '—'}km/h</div></div>
      </div>`;
  })() : `<div class="sr-empty">安全運転データがまだありません（対応形式のCSV取込で今後蓄積されます）</div>`;

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

        ${o.content.wage_summary ? `
        <div class="sr-section">
          <div class="sr-section-title">賃金インパクト試算（概算）</div>
          <div class="sr-body-text">${escHtml(o.content.wage_summary)}</div>
        </div>` : ''}

        <div class="sr-section">
          <div class="sr-section-title">労働需要の背景</div>
          <div class="sr-body-text">${escHtml(o.content.labor_demand_note)}</div>
        </div>

        <div class="sr-section">
          <div class="sr-section-title">安全運転リスク（参考指標・事故記録ではありません）</div>
          ${riskHtml}
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
          ※本レポートは売上実績データを集計・分析して自動生成したものです（ルールベース集計であり外部AIサービスは使用していません）。参考情報としてご活用ください。<br>
          ${o.content.wage_summary ? `※賃金インパクト試算は、本人の勤務区分に応じた成果手当（歩合部分・公出含む）と深夜/残業手当の簡易概算です。深夜/残業手当は服務手当・能率手当・段階分け・法定内外区分を省略した概算計算のため、実際の給与明細とは異なります。試用期間中の差等も含まれません。設定値は「設定 → 賃金試算設定」で確認・修正できます。<br>` : ''}
          ※安全運転リスクはホシコン収集データCSVの急発進・急加速・急減速・最高速度から算出した参考指標であり、実際の事故記録ではありません。
        </div>
        <div class="sr-foot">
          <div class="left">本紙は社内システムより自動生成されています</div>
          <div class="right">発行日時: <span class="issued-at"></span><br><span class="brand">ホシコンAI売上分析システム</span></div>
        </div>
      </div>
    </div>`;
}

// 2枚目: 所感記入シート（罫線のみの手書き用コメント欄＋右下の空欄印鑑欄）
// 印鑑欄は「所長・課長・班長・教育」の4つ。枠内は完全に空欄（薄い印影テキストや透かしは一切入れない）。
export function renderSalesAiReportCommentSheet(o: SalesAiReportSheetOptions, sheetIndex: number): string {
  const commentLines = Array.from({ length: 13 }, () => `<div class="sr-comment-line"></div>`).join('');
  const stampLabels = ['所長', '課長', '班長', '教育'];

  return `
    <div class="sheet" id="print-sheet-${sheetIndex}">
      <div class="sheet-fit" id="sheet-fit-${sheetIndex}">
        <div class="sr-head">
          <div>
            <div class="sr-badge">AI売上分析レポート</div>
            <h1>所感記入シート</h1>
            <div class="sub">今後の売上向上に向けて</div>
          </div>
          <div class="meta">
            発行日：${escHtml(o.issuedDateLabel)}<br>
            対象期間：${escHtml(o.periodLabel)}
          </div>
        </div>

        <div class="sr-to">${escHtml(o.name)}<span class="suffix">様</span></div>
        <div class="sr-to-sub">${o.division != null ? `${o.division}課 ` : ''}${o.team != null ? `${o.team}班` : ''}</div>

        <div class="sr-comment-title">今後の売上向上に向けて（所感・目標）</div>
        <div class="sr-comment-box">${commentLines}</div>
      </div>
      <div class="sr-stamp-footer">
        <div class="sr-stamp-row">
          ${stampLabels.map(label => `
            <div class="sr-stamp-box">
              <div class="sr-stamp-frame"></div>
              <div class="sr-stamp-label">${escHtml(label)}</div>
            </div>`).join('')}
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
    <span class="hint">このレポートはAIが売上実績データから自動生成した分析です（1枚目: 分析／2枚目: 所感記入シート）</span>
  </div>
  <div class="stage">
    ${renderSalesAiReportSheet(o, 0)}
    ${renderSalesAiReportCommentSheet(o, 1)}
  </div>
  <script>
    document.querySelectorAll('.issued-at').forEach(function(el) { el.textContent = new Date().toLocaleString('ja-JP'); });
    function fitOneSheet(i) {
      var fit = document.getElementById('sheet-fit-' + i);
      if (!fit) return;
      var pxPerMm = 96 / 25.4;
      var availablePx = (297 - 32) * pxPerMm;
      fit.style.transform = 'none';
      fit.style.width = '100%';
      // 幅を広げて縮小率を掛けるたびに文字の折り返しが変わり必要な高さも変わるため、
      // 収まるまで数回繰り返して収束させる（1回きりの補正だと余白1枚だけの空白ページが出ることがあった）
      var scale = 1;
      for (var j = 0; j < 6; j++) {
        var natural = fit.scrollHeight;
        if (natural <= 0 || natural * scale <= availablePx) break;
        scale = (availablePx / natural) * 0.97;
        fit.style.width = (100 / scale) + '%';
        fit.style.transform = 'scale(' + scale + ')';
      }
    }
    function fitAllSheets() { fitOneSheet(0); fitOneSheet(1); }
    fitAllSheets();
    window.addEventListener('load', fitAllSheets);
    window.addEventListener('beforeprint', fitAllSheets);
  </script>
</body>
</html>`;
}
