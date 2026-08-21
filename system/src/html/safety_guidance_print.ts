// 安全運転指導書 印刷ページ（/sales-ai/employee/:id/safety-guidance/print）
// A4縦1枚に自動縮小して収める（sales_ai_report_print.tsのfitSheetToPage方式を踏襲。CSSは独立してこのファイルに持つ）。
// 文章は utils/driving_safety_guidance.ts のルールベース生成（外部AI/LLM APIへの通信は一切行わない）。
import { escHtml } from './layout';
import type { DrivingRiskSummary } from '../utils/driving_risk_analysis';
import type { DrivingSafetyCategoryBreakdown, DrivingSafetyGuidanceContent } from '../utils/driving_safety_guidance';

export interface SafetyGuidanceSheetOptions {
  name: string;
  division: number | null;
  team: number | null;
  periodLabel: string;
  issuedDateLabel: string;
  dutyDays: number;
  breakdown: DrivingSafetyCategoryBreakdown;
  riskSummary: DrivingRiskSummary;
  content: DrivingSafetyGuidanceContent;
  accidentCount: number;
  monthsSinceLastAccident: number | null;
}

const RISK_LEVEL_LABELS: Record<DrivingRiskSummary['riskLevel'], string> = { low: '低', medium: '中', high: '高' };
const RISK_LEVEL_COLORS: Record<DrivingRiskSummary['riskLevel'], { bg: string; fg: string; border: string }> = {
  low: { bg: '#f0fdf4', fg: '#166534', border: '#bbf7d0' },
  medium: { bg: '#fffbeb', fg: '#d97706', border: '#fde68a' },
  high: { bg: '#fef2f2', fg: '#dc2626', border: '#fecaca' },
};

export const SAFETY_GUIDANCE_PRINT_CSS = `
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
  .sr-empty { font-size: 11.5px; color: #9ca3af; }
  .sr-cat { margin-bottom: 8px; }
  .sr-cat-title { font-size: 11.5px; font-weight: 700; color: #1f2937; margin-bottom: 2px; }
  .sr-cat-title .cnt { font-weight: 400; color: #6b7280; margin-left: 6px; }

  .sr-closing { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 10px 14px; font-size: 11.5px; line-height: 1.75; color: #0c4a6e; margin-bottom: 12px; }
  .sr-accident-note { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 14px; font-size: 11.5px; line-height: 1.75; color: #991b1b; margin-bottom: 12px; }
  .sr-accident-note.none { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }

  .sr-disclaimer { font-size: 9.5px; color: #9ca3af; line-height: 1.6; border-top: 1px dashed #d1d5db; padding-top: 7px; margin-top: 8px; }
  .sr-foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 6px; padding-top: 6px; }
  .sr-foot .left { font-size: 9.5px; color: #9ca3af; }
  .sr-foot .right { text-align: right; font-size: 9.5px; color: #9ca3af; line-height: 1.6; }
  .sr-foot .right .brand { font-size: 11px; font-weight: 800; color: #1a3a5c; }

  .sr-badge2 { display: inline-block; border-radius: 20px; padding: 1px 9px; font-size: 10px; font-weight: 700; }

  /* 2枚目: 指導内容記入シート */
  .sr-comment-title { font-size: 13px; font-weight: 700; color: #1a3a5c; margin: 6px 0 14px; padding-left: 8px; border-left: 4px solid #1a3a5c; }
  .sr-comment-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px 20px; }
  .sr-comment-line { height: 30px; border-bottom: 1px solid #cbd5e1; }
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

// 1枚目: 安全運転指導書本体
export function renderSafetyGuidanceSheet(o: SafetyGuidanceSheetOptions): string {
  const colors = RISK_LEVEL_COLORS[o.riskSummary.riskLevel];

  const categoriesHtml = o.content.categoryExplanations.length
    ? o.content.categoryExplanations.map(ce => `
      <div class="sr-cat">
        <div class="sr-cat-title">${escHtml(ce.category)}<span class="cnt">${ce.count}件</span></div>
        <div class="sr-body-text">${escHtml(ce.explanation)}</div>
      </div>`).join('')
    : `<div class="sr-empty">対象期間中に基準を超える急発進・急加速・急減速・速度超過は見られませんでした。</div>`;

  const accidentClass = o.accidentCount > 0 ? 'sr-accident-note' : 'sr-accident-note none';

  return `
    <div class="sheet" id="print-sheet-0">
      <div class="sheet-fit" id="sheet-fit-0">
        <div class="sr-head">
          <div>
            <div class="sr-badge">安全運転指導書</div>
            <h1>安全運転指導書</h1>
            <div class="sub">運転挙動データ（ホシコン収集データ）に基づく参考指標</div>
          </div>
          <div class="meta">
            発行日：${escHtml(o.issuedDateLabel)}<br>
            対象期間：${escHtml(o.periodLabel)}
          </div>
        </div>

        <div class="sr-to">${escHtml(o.name)}<span class="suffix">様</span></div>
        <div class="sr-to-sub">${o.division != null ? `${o.division}課 ` : ''}${o.team != null ? `${o.team}班` : ''}</div>

        <div class="sr-kpis">
          <div class="sr-kpi"><div class="sr-kpi-label">総合判定</div><div class="sr-kpi-value"><span class="sr-badge2" style="background:${colors.bg};color:${colors.fg};border:1px solid ${colors.border};">リスク${RISK_LEVEL_LABELS[o.riskSummary.riskLevel]}</span></div></div>
          <div class="sr-kpi"><div class="sr-kpi-label">急発進</div><div class="sr-kpi-value">${o.breakdown.harshStartTotal}件</div></div>
          <div class="sr-kpi"><div class="sr-kpi-label">急加速</div><div class="sr-kpi-value">${o.breakdown.harshAccelTotal}件</div></div>
          <div class="sr-kpi"><div class="sr-kpi-label">急減速</div><div class="sr-kpi-value">${o.breakdown.harshDecelTotal}件</div></div>
        </div>
        <div class="sr-kpis">
          <div class="sr-kpi"><div class="sr-kpi-label">対象乗務日数</div><div class="sr-kpi-value" style="font-size:14px;">${o.dutyDays}日</div></div>
          <div class="sr-kpi"><div class="sr-kpi-label">最高速度(高速/一般)</div><div class="sr-kpi-value" style="font-size:14px;">${o.breakdown.maxSpeedHighway ?? '—'}/${o.breakdown.maxSpeedLocal ?? '—'}km/h</div></div>
          <div class="sr-kpi"><div class="sr-kpi-label">速度超過日数</div><div class="sr-kpi-value" style="font-size:14px;">${o.breakdown.speedingHighwayDays + o.breakdown.speedingLocalDays}日</div></div>
          <div class="sr-kpi">
            <div class="sr-kpi-label">累計事故件数(全期間)</div>
            <div class="sr-kpi-value" style="font-size:14px;">${o.accidentCount}件</div>
            ${o.monthsSinceLastAccident !== null ? `<div style="font-size:9.5px;color:#9ca3af;margin-top:1px;">前回事故から約${o.monthsSinceLastAccident}ヶ月</div>` : ''}
          </div>
        </div>

        <div class="sr-headline">${escHtml(o.content.headline)}</div>

        <div class="sr-section">
          <div class="sr-section-title">項目別リスク説明・実績</div>
          ${categoriesHtml}
        </div>

        <div class="sr-section">
          <div class="sr-section-title">事故分析との照合</div>
          <div class="${accidentClass}">${escHtml(o.content.accidentNote)}</div>
        </div>

        <div class="sr-closing">${escHtml(o.content.closingComment)}</div>

        <div class="sr-disclaimer">
          ※本紙は運転挙動データ（急発進・急加速・急減速・最高速度）を集計・分析して自動生成したものです（ルールベース集計であり外部AIサービスは使用していません）。参考情報としてご活用ください。<br>
          ※安全運転リスクは対象期間の運転挙動データ、事故件数は在籍期間中の全期間累計です。時間軸が異なる参考情報である点にご留意ください。実際の事故記録の詳細は事故分析ページでご確認ください。
        </div>
        <div class="sr-foot">
          <div class="left">本紙は社内システムより自動生成されています</div>
          <div class="right">発行日時: <span class="issued-at"></span><br><span class="brand">ホシコンAI売上分析システム</span></div>
        </div>
      </div>
    </div>`;
}

// 2枚目: 指導内容記入シート（罫線のみの手書き用欄＋右下の空欄印鑑欄）
// 印鑑欄は「所長・課長・班長・事故教育」の4つ。枠内は完全に空欄（薄い印影テキストや透かしは一切入れない）。
export function renderSafetyGuidanceCommentSheet(o: SafetyGuidanceSheetOptions): string {
  const commentLines = Array.from({ length: 13 }, () => `<div class="sr-comment-line"></div>`).join('');
  const stampLabels = ['所長', '課長', '班長', '事故教育'];

  return `
    <div class="sheet" id="print-sheet-1">
      <div class="sheet-fit" id="sheet-fit-1">
        <div class="sr-head">
          <div>
            <div class="sr-badge">安全運転指導書</div>
            <h1>指導内容記入シート</h1>
            <div class="sub">指導内容・本人への確認事項</div>
          </div>
          <div class="meta">
            発行日：${escHtml(o.issuedDateLabel)}<br>
            対象期間：${escHtml(o.periodLabel)}
          </div>
        </div>

        <div class="sr-to">${escHtml(o.name)}<span class="suffix">様</span></div>
        <div class="sr-to-sub">${o.division != null ? `${o.division}課 ` : ''}${o.team != null ? `${o.team}班` : ''}</div>

        <div class="sr-comment-title">指導内容・所感</div>
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

export function renderSafetyGuidancePrintPage(o: SafetyGuidanceSheetOptions, backHref: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>安全運転指導書（${escHtml(o.name)}）</title>
<style>${SAFETY_GUIDANCE_PRINT_CSS}</style>
</head>
<body>
  <div class="toolbar">
    <a href="${backHref}">← 個人詳細に戻る</a>
    <button class="print-btn" onclick="window.print()">🖨️ 印刷 / PDF保存</button>
    <span class="hint">このレポートは運転挙動データから自動生成した参考指標です（1枚目: 指導書／2枚目: 指導内容記入シート）</span>
  </div>
  <div class="stage">
    ${renderSafetyGuidanceSheet(o)}
    ${renderSafetyGuidanceCommentSheet(o)}
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
