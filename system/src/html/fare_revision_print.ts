// 運賃改定影響分析 — 印刷ページ（/sales-ai/fare-revision/print）
// ダッシュボードで選んでいる条件（比較期間・課/班/勤務区分・各種閾値）と、
// 表示中のタブ（全体側4種・個人側3種のいずれか1つ）をそのまま印刷できるようにする。
// 対象人数が可変（数名〜数百名）のため、単票のような1枚縮小ではなく、
// 表ヘッダー繰り返し・行の途中改ページ禁止によるナチュラルな複数ページ印刷とする。
import { escHtml } from './layout';
import type { FareRevisionOverviewResult, FareRevisionEmployeeResult } from '../routes/api/fare_revision';
import type { EmployeeComparison } from '../utils/fare_revision_analysis';

export const FARE_REVISION_PRINT_CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #111827; }
  .toolbar { position: sticky; top: 0; z-index: 10; background: #1a3a5c; padding: 10px 16px; display: flex; gap: 8px; align-items: center; }
  .toolbar a, .toolbar button { font-size: 13px; padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; font-weight: 600; }
  .toolbar a { background: #374151; color: #fff; }
  .toolbar button.print-btn { background: #2563eb; color: #fff; }
  .toolbar .hint { margin-left: auto; font-size: 12px; color: #cbd5e1; }
  .page { max-width: 190mm; margin: 20px auto; background: #fff; padding: 14mm 12mm; box-shadow: 0 4px 20px rgba(0,0,0,0.2); }

  .fp-head { border-bottom: 3px solid #1a3a5c; padding-bottom: 10px; margin-bottom: 12px; }
  .fp-head h1 { font-size: 18px; margin: 0; color: #1a3a5c; }
  .fp-head .sub { font-size: 11px; color: #6b7280; margin-top: 4px; line-height: 1.6; }
  .fp-cond { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px 12px; font-size: 10.5px; color: #475569; line-height: 1.8; margin-bottom: 14px; }
  .fp-cond b { color: #1a3a5c; }

  .fp-kpi-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px; }
  .fp-kpi-table td { padding: 6px 10px; border: 1px solid #cbd5e1; }
  .fp-kpi-table td.label { background: #f8fafc; color: #475569; width: 55%; }
  .fp-kpi-table td.val { font-weight: 700; color: #1a3a5c; }

  .fp-section-title { font-size: 12.5px; font-weight: 700; color: #1a3a5c; margin: 16px 0 8px; padding-left: 7px; border-left: 4px solid #1a3a5c; }
  table.fp-table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin-bottom: 12px; }
  table.fp-table thead { display: table-header-group; }
  table.fp-table th { text-align: left; padding: 5px 7px; background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; white-space: nowrap; }
  table.fp-table td { padding: 5px 7px; border: 1px solid #cbd5e1; }
  table.fp-table tr { break-inside: avoid; }
  .fp-flag { color: #16a34a; font-weight: 700; }
  .fp-drop { color: #dc2626; font-weight: 700; }

  .fp-reasoning { list-style: none; padding: 0; margin: 0; font-size: 11.5px; line-height: 1.8; }
  .fp-reasoning li { padding: 6px 10px; background: #f8fafc; border-radius: 6px; margin-bottom: 6px; border: 1px solid #cbd5e1; break-inside: avoid; }
  .fp-reasoning li.flag { background: #fff7ed; border-color: #fed7aa; color: #9a3412; font-weight: 600; }

  .fp-foot { margin-top: 16px; padding-top: 8px; border-top: 1px dashed #94a3b8; font-size: 9.5px; color: #9ca3af; display: flex; justify-content: space-between; }

  @media print {
    @page { size: A4 portrait; margin: 12mm; }
    html, body { background: #fff; }
    .toolbar { display: none; }
    .page { box-shadow: none; margin: 0; padding: 0; max-width: none; }
  }
`;

function pct(v: number | null): string { return v === null ? '—' : v + '%'; }
function yen(v: number | null): string { return v === null ? '—' : v.toLocaleString('ja-JP') + '円'; }
function pctClass(v: number | null): string {
  if (v === null) return '';
  if (v >= 110) return 'fp-flag';
  if (v < 100) return 'fp-drop';
  return '';
}
const CATEGORY_LABELS: Record<EmployeeComparison['achievementCategory'], string> = {
  above: '目標達成', met: '伸びたが未達', below: '減少', insufficient_data: 'データ不足',
};
function shell(title: string, printedAtLabel: string, headSub: string, condLines: string[], bodyHtml: string, backHref: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${escHtml(title)}</title>
<style>${FARE_REVISION_PRINT_CSS}</style>
</head>
<body>
  <div class="toolbar">
    <a href="${backHref}">← ダッシュボードに戻る</a>
    <button type="button" class="print-btn" onclick="window.print()">🖨️ 印刷 / PDF保存</button>
    <div class="hint">印刷日時: ${escHtml(printedAtLabel)}</div>
  </div>
  <div class="page">
    <div class="fp-head">
      <h1>${escHtml(title)}</h1>
      <div class="sub">${escHtml(headSub)}</div>
    </div>
    <div class="fp-cond">${condLines.map(l => `<div>${l}</div>`).join('')}</div>
    ${bodyHtml}
    <div class="fp-foot">
      <div>ホシコン — 運賃改定影響分析（ルールベース自動生成・外部AI通信なし）</div>
      <div>印刷日時: ${escHtml(printedAtLabel)}</div>
    </div>
  </div>
</body>
</html>`;
}

function condLinesFromOverview(data: FareRevisionOverviewResult): string[] {
  const t = data.thresholds;
  const f = data.filters;
  return [
    `<b>比べている期間</b> — ${escHtml(data.periods.before.label)}: ${data.periods.before.start}〜${data.periods.before.end}（${data.periods.before.days}日間） ／ ${escHtml(data.periods.after.label)}: ${data.periods.after.start}〜${data.periods.after.end}（${data.periods.after.days}日間）`,
    `<b>絞り込み</b> — 課: ${f.division ? f.division + '課' : '全課'} ／ 班: ${f.team ? f.team + '班' : '全班'} ／ 勤務区分: ${f.dutyCode ?? '全区分'}`,
    `<b>判定条件</b> — 目標達成率${t.achievementThresholdPct}%以上 ／ 売上ほぼ変わらずとみなす範囲 100±${t.salesFlatBandPct}% ／ 労働時間減少ライン${t.laborHoursDropThresholdPct}%未満 ／ 最低乗務日数${t.minDutyDaysPerPeriod}日`,
  ];
}

export function renderFareRevisionOverviewPrintPage(
  section: 'summary' | 'breakdown' | 'flagged' | 'allemp',
  data: FareRevisionOverviewResult,
  printedAtLabel: string,
  backHref: string,
  category: EmployeeComparison['achievementCategory'] | null = null,
): string {
  const condLines = condLinesFromOverview(data);
  const total = data.counts.above + data.counts.met + data.counts.below + data.counts.insufficientData;
  let body = '';
  let sectionLabel = '';

  if (section === 'summary') {
    sectionLabel = '全体サマリー';
    const rows: Array<[string, string]> = [
      ['対象人数', total + '名'],
      [`売上が${data.thresholds.achievementThresholdPct}%以上に伸びた人`, data.counts.above + '名'],
      ['伸びたけど目標未達の人', data.counts.met + '名'],
      ['売上が下がった人', data.counts.below + '名'],
      ['データが少なくて判定できない人', data.counts.insufficientData + '名'],
      ['早めに切り上げていそうな人', data.flagged.length + '名'],
      ['労働時間データがある割合', data.dataCoverage.coverageRatio + '%'],
    ];
    body += `<table class="fp-kpi-table">${rows.map(([l, v]) => `<tr><td class="label">${escHtml(l)}</td><td class="val">${escHtml(v)}</td></tr>`).join('')}</table>`;
    body += `<div class="fp-section-title">1日あたり売上の伸び具合の分布</div>`;
    body += `<table class="fp-table"><thead><tr><th>伸び</th><th>人数</th></tr></thead><tbody>${
      data.histogram.map(h => `<tr><td>${escHtml(h.bucketLabel)}</td><td>${h.count}名</td></tr>`).join('')
    }</tbody></table>`;
    const cov = data.dataCoverage;
    body += `<div style="font-size:10.5px;color:#6b7280;">労働時間データの内訳（対象の全${cov.totalRecordDays}日のうち）: 実際の記録 ${cov.actualLaborHoursDays}日 ／ 出退庫の時刻から計算 ${cov.estimatedLaborHoursDays}日 ／ 記録なし ${cov.missingLaborHoursDays}日</div>`;
  } else if (section === 'breakdown') {
    sectionLabel = '課・班・勤務別';
    body += `<div class="fp-section-title">課ごとの1日あたり売上の伸び（平均）</div>`;
    body += `<table class="fp-table"><thead><tr><th>課</th><th>平均の伸び</th><th>人数</th></tr></thead><tbody>${
      data.divisionBreakdown.map(d => `<tr><td>${d.division}課</td><td class="${pctClass(d.avgSalesGrowthPct)}">${pct(d.avgSalesGrowthPct)}</td><td>${d.empCount}名</td></tr>`).join('')
    }</tbody></table>`;
    body += `<div class="fp-section-title">班ごとの1日あたり売上の伸び（平均）</div>`;
    body += `<table class="fp-table"><thead><tr><th>班</th><th>平均の伸び</th><th>人数</th></tr></thead><tbody>${
      data.teamBreakdown.map(t => `<tr><td>${t.team}班</td><td class="${pctClass(t.avgSalesGrowthPct)}">${pct(t.avgSalesGrowthPct)}</td><td>${t.empCount}名</td></tr>`).join('')
    }</tbody></table>`;
    body += `<div class="fp-section-title">勤務の種類ごとの1日あたり売上の伸び（平均）</div>`;
    body += `<table class="fp-table"><thead><tr><th>種類</th><th>平均の伸び</th><th>人数</th></tr></thead><tbody>${
      data.dutyCategoryBreakdown.map(d => `<tr><td>${escHtml(d.label)}</td><td class="${pctClass(d.avgSalesGrowthPct)}">${pct(d.avgSalesGrowthPct)}</td><td>${d.empCount}名</td></tr>`).join('')
    }</tbody></table>`;
  } else if (section === 'flagged') {
    sectionLabel = '早めに切り上げていそうな人';
    body += `<div style="font-size:10.5px;color:#6b7280;margin-bottom:8px;">売上はほぼ変わっていないのに、働いた時間がはっきり短くなっている人です。</div>`;
    body += `<table class="fp-table"><thead><tr><th>氏名</th><th>課/班</th><th>${escHtml(data.periods.before.label)}の1日平均売上</th><th>${escHtml(data.periods.after.label)}の1日平均売上</th><th>1日あたり売上の伸び</th><th>単価の伸び</th><th>1乗務あたり労働時間の伸び</th><th>確からしさ</th></tr></thead><tbody>${
      data.flagged.length
        ? data.flagged.map(e => `<tr><td>${escHtml(e.empName)}</td><td>${e.division ?? '—'}課${e.team ?? '—'}班</td><td>${yen(e.before.avgPerDuty)}</td><td>${yen(e.after.avgPerDuty)}</td><td class="${pctClass(e.salesGrowthPct)}">${pct(e.salesGrowthPct)}</td><td>${pct(e.hourlyRateGrowthPct)}</td><td>${pct(e.laborHoursGrowthPct)}</td><td>${e.earlyLeaveConfidence === 'high' ? '高' : '中'}</td></tr>`).join('')
        : `<tr><td colspan="8" style="color:#9ca3af;">該当する人はいません。</td></tr>`
    }</tbody></table>`;
  } else {
    const cat = category ?? 'above';
    sectionLabel = `社員ごとの一覧（${CATEGORY_LABELS[cat]}）`;
    const list = data.employees.filter(e => e.achievementCategory === cat);
    body += `<table class="fp-table"><thead><tr><th>氏名</th><th>課/班</th><th>勤務の種類</th><th>1日あたり売上の伸び</th><th>${escHtml(data.periods.before.label)}の売上</th><th>${escHtml(data.periods.after.label)}の売上</th><th>1乗務あたり労働時間の伸び</th></tr></thead><tbody>${
      list.length
        ? list.map(e => `<tr><td>${escHtml(e.empName)}</td><td>${e.division ?? '—'}課${e.team ?? '—'}班</td><td>${e.wageCategoryLabel ? escHtml(e.wageCategoryLabel) : '—'}</td><td class="${pctClass(e.salesGrowthPct)}">${pct(e.salesGrowthPct)}</td><td>${yen(e.before.avgPerDuty)}</td><td>${yen(e.after.avgPerDuty)}</td><td>${pct(e.laborHoursGrowthPct)}</td></tr>`).join('')
        : `<tr><td colspan="7" style="color:#9ca3af;">該当する人はいません。</td></tr>`
    }</tbody></table>`;
  }

  return shell(
    `運賃改定影響分析 — ${sectionLabel}`,
    printedAtLabel,
    '2026年4月からの運賃値上げ（約10%）による売上・労働時間への影響分析（ルールベース自動生成）',
    condLines,
    body,
    backHref,
  );
}

// 個人レポートはサマリー（平均・伸び率）＋判定理由をまとめた1枚のレポートとして出力する。
// 日ごとの記録はコピー・報告用途では不要なため、印刷対象には含めない（画面上の確認のみ）。
export function renderFareRevisionEmployeePrintPage(
  data: FareRevisionEmployeeResult,
  printedAtLabel: string,
  backHref: string,
): string {
  const cmp = data.comparison;
  const beforeLabel = data.periods.before.label;
  const afterLabel = data.periods.after.label;
  const condLines = [
    `<b>比べている期間</b> — ${escHtml(beforeLabel)}: ${data.periods.before.start}〜${data.periods.before.end}（${data.periods.before.days}日間） ／ ${escHtml(afterLabel)}: ${data.periods.after.start}〜${data.periods.after.end}（${data.periods.after.days}日間）`,
  ];

  const rows: Array<[string, string]> = [
    ['1日あたり売上の伸び', pct(cmp.salesGrowthPct)],
    ['判定', CATEGORY_LABELS[cmp.achievementCategory]],
    ['1時間あたり売上の伸び', pct(cmp.hourlyRateGrowthPct)],
    ['1乗務あたり労働時間の伸び', pct(cmp.laborHoursGrowthPct)],
    [`平均の1日の売上（${beforeLabel}→${afterLabel}）`, `${yen(cmp.before.avgPerDuty)} → ${yen(cmp.after.avgPerDuty)}`],
    [`平均の帰る時刻（${beforeLabel}→${afterLabel}）`, `${cmp.before.avgReturnTime ?? '—'} → ${cmp.after.avgReturnTime ?? '—'}`],
  ];
  let body = `<table class="fp-kpi-table">${rows.map(([l, v]) => `<tr><td class="label">${escHtml(l)}</td><td class="val">${escHtml(v)}</td></tr>`).join('')}</table>`;
  body += `<div class="fp-section-title">なぜこの判定になったか</div>`;
  body += `<ul class="fp-reasoning">${
    cmp.reasoning.map(line => `<li${line.indexOf('【早めに切り上げている可能性】') === 0 ? ' class="flag"' : ''}>${escHtml(line)}</li>`).join('')
  }</ul>`;

  return shell(
    `運賃改定影響分析 — ${escHtml(data.emp.name)}さん`,
    printedAtLabel,
    `${data.emp.division ?? '—'}課${data.emp.team ?? '—'}班　${escHtml(data.emp.name)}さん — 2026年4月からの運賃値上げによる影響分析（ルールベース自動生成）`,
    condLines,
    body,
    backHref,
  );
}
