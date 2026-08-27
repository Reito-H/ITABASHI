// 課別・安全運転リスクレポート 印刷ページ（/accidents/risk/division/:div/report/print）
// 安全運転リスクランキング（accidents_risk.ts）を数値条件で絞り込んだ結果を、課長など課の責任者に渡すA4横1枚のレポートとして印刷する。
// A4横1枚に自動縮小して収める（accidents_division_report_print.tsのfitSheetToPage方式を踏襲。CSSは独立してこのファイルに持つ）。
import { escHtml } from './layout';
import type { DrivingRiskRankingRow } from '../routes/api/sales_ai';

const RISK_LEVEL_LABELS: Record<DrivingRiskRankingRow['riskLevel'], string> = { low: '低', medium: '中', high: '高' };
const RISK_LEVEL_COLORS: Record<DrivingRiskRankingRow['riskLevel'], { bg: string; fg: string; border: string }> = {
  low: { bg: '#f0fdf4', fg: '#166534', border: '#bbf7d0' },
  medium: { bg: '#fffbeb', fg: '#d97706', border: '#fde68a' },
  high: { bg: '#fef2f2', fg: '#dc2626', border: '#fecaca' },
};

export interface AccidentsRiskReportFilterSummary {
  minHarsh: number | null;
  minPerDuty: number | null;
  minSpeedingDays: number | null;
  minAccidents: number | null;
  maxMonthsSinceAccident: number | null;
  riskLevels: Array<DrivingRiskRankingRow['riskLevel']>;
}

export interface AccidentsRiskReportPrintOptions {
  division: number;
  issuedDateLabel: string;
  periodLabel: string;
  filter: AccidentsRiskReportFilterSummary;
  rows: DrivingRiskRankingRow[];
  backHref: string;
}

function filterSummaryText(f: AccidentsRiskReportFilterSummary): string {
  const parts: string[] = [];
  if (f.minHarsh != null) parts.push(`急挙動合計 ${f.minHarsh}件以上`);
  if (f.minPerDuty != null) parts.push(`乗務日あたり ${f.minPerDuty}件以上`);
  if (f.minSpeedingDays != null) parts.push(`速度超過日数 ${f.minSpeedingDays}日以上`);
  if (f.minAccidents != null) parts.push(`累計事故件数 ${f.minAccidents}件以上`);
  if (f.maxMonthsSinceAccident != null) parts.push(`前回事故から${f.maxMonthsSinceAccident}ヶ月以内`);
  if (f.riskLevels.length < 3) parts.push(`リスク判定：${f.riskLevels.map(lv => RISK_LEVEL_LABELS[lv]).join('・')}`);
  return parts.length ? parts.join(' / ') : '絞り込み条件なし（全員が対象）';
}

export function renderAccidentsRiskReportPrintPage(o: AccidentsRiskReportPrintOptions): string {
  const rowsHtml = o.rows.length
    ? o.rows.map(r => {
      const colors = RISK_LEVEL_COLORS[r.riskLevel];
      return `
        <tr>
          <td>${escHtml(r.name)}</td>
          <td>${r.division ?? '—'}課${r.team ? `${r.team}班` : ''}</td>
          <td class="num">${r.totalHarshEvents}件</td>
          <td class="num">${r.harshEventsPerDuty}件</td>
          <td class="num">${r.maxSpeedHighway ?? '—'}/${r.maxSpeedLocal ?? '—'}km/h</td>
          <td class="num">${r.speedingDays}日</td>
          <td><span class="rr-badge" style="background:${colors.bg};color:${colors.fg};border-color:${colors.border};">リスク${RISK_LEVEL_LABELS[r.riskLevel]}</span></td>
          <td class="num" style="${r.accidentCount > 0 ? 'color:#dc2626;font-weight:700;' : 'color:#9ca3af;'}">${r.accidentCount}件</td>
          <td>${r.monthsSinceLastAccident != null ? `約${r.monthsSinceLastAccident}ヶ月` : (r.accidentCount === 0 ? '事故歴なし' : '—')}</td>
        </tr>`;
    }).join('')
    : `<tr><td colspan="9" class="rr-empty">絞り込み条件に該当する乗務員はいませんでした</td></tr>`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>安全運転リスクレポート（${o.division}課）</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #111827; }
  .toolbar { position: sticky; top: 0; z-index: 10; background: #1a3a5c; padding: 10px 16px; display: flex; gap: 8px; align-items: center; }
  .toolbar a, .toolbar button { font-size: 13px; padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; font-weight: 600; }
  .toolbar a { background: #374151; color: #fff; }
  .toolbar button.print-btn { background: #2563eb; color: #fff; }
  .toolbar .hint { margin-left: auto; font-size: 12px; color: #cbd5e1; }
  .stage { padding: 24px; display: flex; justify-content: center; }

  /* .sheetは常にA4横(297mm x 210mm)固定。中身がはみ出す場合は#sheet-fitをJSで縮小し、必ず1枚に収める */
  .sheet { width: 297mm; height: 210mm; background: #fff; padding: 12mm 16mm; box-shadow: 0 4px 20px rgba(0,0,0,0.25); overflow: hidden; position: relative; }
  .sheet-fit { width: 100%; transform-origin: top left; }

  .rr-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a3a5c; padding-bottom: 10px; margin-bottom: 12px; }
  .rr-head h1 { font-size: 19px; margin: 0; color: #1a3a5c; letter-spacing: .04em; }
  .rr-head .sub { font-size: 11px; color: #9ca3af; margin-top: 3px; }
  .rr-head .meta { text-align: right; font-size: 11px; color: #6b7280; line-height: 1.7; }
  .rr-badge-tag { display: inline-block; background: #eff6ff; color: #1a3a5c; border: 1px solid #bfdbfe; border-radius: 20px; padding: 2px 12px; font-size: 10px; font-weight: 700; margin-bottom: 4px; }

  .rr-to { font-size: 19px; font-weight: 800; margin-bottom: 6px; }

  .rr-filter-note { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; font-size: 11.5px; color: #475569; margin-bottom: 12px; }
  .rr-filter-note b { color: #1a3a5c; }

  table.rr-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  table.rr-table th { padding: 6px 8px; text-align: left; background: #f3f4f6; color: #4b5563; font-weight: 700; border-bottom: 1px solid #94a3b8; white-space: nowrap; }
  table.rr-table td { padding: 6px 8px; border-bottom: 1px solid #cbd5e1; }
  table.rr-table .num { font-variant-numeric: tabular-nums; }
  .rr-empty { text-align: center; color: #9ca3af; padding: 20px 8px; }
  .rr-badge { display: inline-block; border-radius: 20px; padding: 1px 9px; font-size: 10px; font-weight: 700; border: 1px solid transparent; white-space: nowrap; }

  .rr-disclaimer { font-size: 9.5px; color: #9ca3af; line-height: 1.6; border-top: 1px dashed #94a3b8; padding-top: 7px; margin-top: 10px; }
  .rr-foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 4px; font-size: 9.5px; color: #9ca3af; }

  /* .sheet-fit（自動縮小の対象）の外に置き、.sheet基準の絶対位置に固定することで、
     上の内容がどれだけ長くなっても印鑑欄が押し出されたりはみ出したりしないようにする */
  .rr-stamp-footer { position: absolute; right: 16mm; bottom: 12mm; display: flex; justify-content: flex-end; }
  .rr-stamp-row { display: flex; gap: 16px; }
  .rr-stamp-box { display: flex; flex-direction: column; align-items: center; gap: 5px; }
  .rr-stamp-frame { width: 44px; height: 44px; border: 1.5px solid #64748b; border-radius: 4px; }
  .rr-stamp-label { font-size: 10px; color: #475569; }

  @media print {
    @page { size: A4 landscape; margin: 0; }
    html, body { background: #fff; }
    .toolbar { display: none; }
    .stage { padding: 0; }
    .sheet { box-shadow: none; margin: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <a href="${o.backHref}">← 安全運転リスクランキングに戻る</a>
    <button class="print-btn" onclick="window.print()">🖨️ 印刷 / PDF保存</button>
    <span class="hint">絞り込み条件に該当する乗務員のみを一覧化したレポートです</span>
  </div>
  <div class="stage">
    <div class="sheet" id="print-sheet">
      <div class="sheet-fit" id="sheet-fit">
        <div class="rr-head">
          <div>
            <div class="rr-badge-tag">安全運転リスクランキング</div>
            <h1>課別 安全運転リスクレポート</h1>
            <div class="sub">運転挙動データ（ホシコン収集データ）に基づく参考指標</div>
          </div>
          <div class="meta">
            発行日：${escHtml(o.issuedDateLabel)}<br>
            対象期間：${escHtml(o.periodLabel)}
          </div>
        </div>

        <div class="rr-to">${o.division}課</div>
        <div class="rr-filter-note"><b>絞り込み条件：</b>${escHtml(filterSummaryText(o.filter))}（該当 ${o.rows.length}名）</div>

        <table class="rr-table">
          <thead><tr>
            <th>氏名</th><th>課/班</th><th>急挙動合計</th><th>乗務日あたり</th><th>最高速度(高速/一般)</th><th>速度超過日数</th><th>判定</th><th>累計事故件数</th><th>前回事故からの経過</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>

        <div class="rr-disclaimer">
          ※本紙は運転挙動データ（急発進・急加速・急減速・最高速度）を集計・分析して自動生成したものです（ルールベース集計であり外部AIサービスは使用していません）。参考情報としてご活用ください。<br>
          ※安全運転リスクは${escHtml(o.periodLabel)}の運転挙動データ、累計事故件数は在籍期間中の全期間累計のため、時間軸が異なる参考情報である点にご留意ください。
        </div>
        <div class="rr-foot">
          <div>本紙は社内システムより自動生成されています</div>
          <div>発行日時: <span id="issued-at"></span></div>
        </div>
      </div>
      <div class="rr-stamp-footer">
        <div class="rr-stamp-row">
          ${['所長', '課長', '班長'].map(label => `
            <div class="rr-stamp-box">
              <div class="rr-stamp-frame"></div>
              <div class="rr-stamp-label">${label}</div>
            </div>`).join('')}
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
      var availablePx = (210 - 24) * pxPerMm;
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
