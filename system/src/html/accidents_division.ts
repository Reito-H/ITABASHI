// 事故データ 課別レポート（一覧・詳細）「事故防止AI」
// ページ: /accidents/division（一覧）, /accidents/division/:div（詳細データ一覧・印刷可）
// 課ごとの事故傾向を確認し、傾向分析レポート（/accidents/division/:div/report/print）への入口も提供する。
import { ADMIN_PATH } from '../config';
import { escHtml } from './layout';
import { type AccidentRecord, accidentsTabNav, faultBand, bucketWeekday, WEEKDAY_LABELS_JA, PERIOD_FILTER_BAR_CSS, periodFilterBarHtml } from './accidents';
import { type AccidentPeriod, periodLabel as formatPeriodLabel, todayIsoJST } from '../utils/accident_period';

export interface DivisionSummary {
  division: number;
  cnt: number;
  avgFault: number | null;
  damageSum: number;
  lastDate: string;
  topWeekday: string | null;
}

export function buildDivisionSummaries(records: AccidentRecord[]): DivisionSummary[] {
  return [1, 2, 3, 4].map(div => {
    const divRecords = records.filter(r => r.division === div);
    const cnt = divRecords.length;
    const faultVals = divRecords.map(r => r.fault_pct_planned).filter((v): v is number => v != null);
    const avgFault = faultVals.length ? Math.round(faultVals.reduce((a, b) => a + b, 0) / faultVals.length) : null;
    const damageSum = divRecords.reduce((s, r) => s + (r.damage_amount || 0), 0);
    const lastDate = divRecords.length ? divRecords.map(r => r.occurred_date).sort().reverse()[0] : '';
    let topWeekday: string | null = null;
    if (cnt > 0) {
      const bands = bucketWeekday(divRecords.map(r => r.occurred_date));
      const maxIdx = bands.reduce((best, v, i) => (v > bands[best] ? i : best), 0);
      if (bands[maxIdx] > 0) topWeekday = `${WEEKDAY_LABELS_JA[maxIdx]}曜（${bands[maxIdx]}件）`;
    }
    return { division: div, cnt, avgFault, damageSum, lastDate, topWeekday };
  });
}

export interface AccidentsDivisionListOpts {
  period: AccidentPeriod;
  summaries: DivisionSummary[];
}

export function accidentsDivisionListPage(opts: AccidentsDivisionListOpts): string {
  const { period, summaries } = opts;

  const rowsHtml = summaries.map(s => `
    <tr class="ad-row" data-division="${s.division}">
      <td style="font-weight:700;">${s.division}課</td>
      <td style="font-weight:700;">${s.cnt}件</td>
      <td>${s.avgFault != null ? s.avgFault + '%' : '—'}</td>
      <td>${s.damageSum ? '¥' + s.damageSum.toLocaleString('ja-JP') : '—'}</td>
      <td>${escHtml(s.lastDate ? s.lastDate.slice(0, 10) : '—')}</td>
      <td>${escHtml(s.topWeekday || '—')}</td>
    </tr>`).join('');

  return `
<style>
  .ad { font-family:'Hiragino Sans','Meiryo',sans-serif; max-width:1160px; }
  .ac-tabnav { display:flex; gap:4px; margin-bottom:14px; border-bottom:1px solid #e5e7eb; }
  .ac-tab-link { padding:9px 16px; font-size:13px; font-weight:600; color:#64748b; text-decoration:none; border-bottom:2px solid transparent; margin-bottom:-1px; }
  .ac-tab-link:hover { color:#1a3a5c; }
  .ac-tab-link.active { color:#1a3a5c; border-bottom-color:#1a3a5c; }
  ${PERIOD_FILTER_BAR_CSS}
  .ad-hint { font-size:12px; color:#6b7280; margin:0 0 14px; }
  .ad-period-label { font-size:12px; color:#475569; margin:0 0 10px; font-weight:600; }
  .ad-table-wrap { background:#fff; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,.08); overflow-x:auto; }
  .ad-table { width:100%; border-collapse:collapse; font-size:13px; }
  .ad-table th { padding:9px 12px; text-align:left; background:#f9fafb; color:#6b7280; font-size:12px; border-bottom:1px solid #e5e7eb; white-space:nowrap; }
  .ad-table td { padding:9px 12px; border-bottom:1px solid #f3f4f6; white-space:nowrap; }
  .ad-row { cursor:pointer; }
  .ad-row:hover { background:#f9fafb; }
</style>
<div class="ad">
  ${accidentsTabNav('division')}
  <p class="ad-hint">課をクリックすると、その課の事故記録の詳細一覧（印刷可）と傾向分析レポートを確認できます。</p>
  ${periodFilterBarHtml({ since: period.since, until: period.until })}
  <p class="ad-period-label">表示期間：${escHtml(formatPeriodLabel(period, todayIsoJST()))}</p>
  <div class="ad-table-wrap">
    <table class="ad-table">
      <thead><tr><th>課</th><th>件数</th><th>平均予定過失%</th><th>損害額合計</th><th>直近事故日</th><th>最多曜日</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
</div>
<script>
function acPeriodApply(since, until) {
  var url = '${ADMIN_PATH}/accidents/division';
  var parts = [];
  if (since) parts.push('since=' + since);
  if (until) parts.push('until=' + until);
  location.href = url + (parts.length ? '?' + parts.join('&') : '');
}
document.querySelectorAll('.ad-row').forEach(function(tr) {
  tr.addEventListener('click', function() {
    var div = tr.getAttribute('data-division');
    var since = document.getElementById('ac-period-since').value;
    var until = document.getElementById('ac-period-until').value;
    var parts = [];
    if (since) parts.push('since=' + since);
    if (until) parts.push('until=' + until);
    location.href = '${ADMIN_PATH}/accidents/division/' + div + (parts.length ? '?' + parts.join('&') : '');
  });
});
</script>
`;
}

export interface AccidentDivisionDetailPrintOptions {
  division: number;
  period: AccidentPeriod;
  records: AccidentRecord[]; // 発生日降順
  issuedDateLabel: string;
}

function periodQueryString(period: AccidentPeriod): string {
  const parts: string[] = [];
  if (period.since) parts.push('since=' + period.since);
  if (period.until) parts.push('until=' + period.until);
  return parts.length ? '?' + parts.join('&') : '';
}

// 課の事故記録・詳細データ一覧（印刷可能な独立ページ。他の印刷ページ同様、管理画面共通レイアウトには含めない）
export function renderAccidentDivisionDetailPrintPage(o: AccidentDivisionDetailPrintOptions): string {
  const { division, period, records, issuedDateLabel } = o;
  const qs = periodQueryString(period);

  const cnt = records.length;
  const lastDate = records[0]?.occurred_date ?? '';
  const faultVals = records.map(r => r.fault_pct_planned).filter((v): v is number => v != null);
  const avgFault = faultVals.length ? Math.round(faultVals.reduce((a, b) => a + b, 0) / faultVals.length) : null;
  const damageSum = records.reduce((s, r) => s + (r.damage_amount || 0), 0);

  const faultCounts = { '0%': 0, '1〜49%': 0, '50%以上': 0, '未確定': 0 };
  for (const r of records) faultCounts[faultBand(r.fault_pct_planned)]++;

  const rowsHtml = records.map(r => `
    <tr>
      <td>${escHtml(r.occurred_date.slice(0, 10))} ${escHtml(r.occurred_time ?? '')}</td>
      <td>${escHtml(r.team ?? '')}</td>
      <td>${escHtml(r.emp_name ?? '')}</td>
      <td>${escHtml((r.accident_category ?? '').replace(/\s+/g, ''))}</td>
      <td>${escHtml(r.accident_target ?? '')}</td>
      <td>${escHtml(r.accident_form ?? '')}</td>
      <td>${escHtml(r.road_condition ?? '')}${r.road_shape ? '・' + escHtml(r.road_shape) : ''}</td>
      <td>${escHtml(r.weather ?? '')}</td>
      <td>${r.fault_pct_planned ?? '—'}% / ${r.fault_pct_final ?? '—'}%</td>
      <td>${r.damage_amount ? '¥' + r.damage_amount.toLocaleString('ja-JP') : '—'}</td>
      <td>${escHtml(r.cause_direct ?? '')}${r.cause_reason ? '（' + escHtml(r.cause_reason) + '）' : ''}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>事故記録詳細一覧（${division}課）</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #111827; }
  .toolbar { position: sticky; top: 0; z-index: 10; background: #1e3a5f; padding: 10px 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .toolbar a, .toolbar button { font-size: 13px; padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; font-weight: 600; }
  .toolbar a.back-link { background: #374151; color: #fff; }
  .toolbar a.ai-link { background: #7c2d12; color: #fff; }
  .toolbar button.print-btn { background: #2563eb; color: #fff; }
  .toolbar .hint { margin-left: auto; font-size: 12px; color: #cbd5e1; }
  .stage { padding: 24px; display: flex; justify-content: center; }

  .sheet { width: 297mm; min-height: 210mm; background: #fff; padding: 12mm 14mm; box-shadow: 0 4px 20px rgba(0,0,0,0.25); }

  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a3a5c; padding-bottom: 8px; margin-bottom: 12px; }
  .head h1 { font-size: 18px; margin: 0; color: #1a3a5c; }
  .head .meta { text-align: right; font-size: 11px; color: #6b7280; line-height: 1.7; }

  .name-block { display: flex; align-items: baseline; gap: 10px; margin-bottom: 4px; }
  .name-block .name { font-size: 19px; font-weight: 800; }
  .period { font-size: 12px; color: #6b7280; margin-bottom: 12px; }

  .kpis { display: flex; gap: 10px; margin-bottom: 10px; }
  .kpi { flex: 1; background: #f9fafb; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; text-align: center; }
  .kpi-label { font-size: 10px; color: #9ca3af; font-weight: 700; }
  .kpi-value { font-size: 15px; font-weight: 800; color: #1a3a5c; margin-top: 1px; }

  .fault-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
  .fault-chip { font-size: 11px; color: #374151; background: #f1f5f9; border-radius: 6px; padding: 4px 10px; }
  .fault-chip b { color: #1a3a5c; }

  table.rec-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  table.rec-table thead { display: table-header-group; }
  table.rec-table th { padding: 6px 7px; text-align: left; background: #f3f4f6; color: #4b5563; font-weight: 700; border-bottom: 1px solid #94a3b8; white-space: nowrap; }
  table.rec-table td { padding: 6px 7px; border-bottom: 1px solid #cbd5e1; }
  table.rec-table tr { page-break-inside: avoid; }

  .foot { margin-top: 10px; padding-top: 6px; border-top: 1px solid #94a3b8; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }

  @media print {
    @page { size: A4 landscape; margin: 8mm; }
    html, body { background: #fff; }
    .toolbar { display: none; }
    .stage { padding: 0; }
    .sheet { box-shadow: none; margin: 0; width: auto; min-height: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <a class="back-link" href="${ADMIN_PATH}/accidents/division${qs}">← 課別レポート一覧に戻る</a>
    <button class="print-btn" onclick="window.print()">🖨️ 印刷 / PDF保存</button>
    <a class="ai-link" href="${ADMIN_PATH}/accidents/division/${division}/report/print${qs}" target="_blank" rel="noopener">事故防止AI 傾向分析レポート</a>
    <span class="hint">この記録一覧をそのまま印刷できます</span>
  </div>
  <div class="stage">
    <div class="sheet">
      <div class="head">
        <h1>事故記録 詳細一覧</h1>
        <div class="meta">発行日：${escHtml(issuedDateLabel)}</div>
      </div>
      <div class="name-block">
        <span class="name">${division}課</span>
      </div>
      <div class="period">対象期間：${escHtml(formatPeriodLabel(period, todayIsoJST()))}（全${cnt}件）</div>

      <div class="kpis">
        <div class="kpi"><div class="kpi-label">事故件数</div><div class="kpi-value">${cnt}件</div></div>
        <div class="kpi"><div class="kpi-label">直近事故日</div><div class="kpi-value" style="font-size:12px;">${escHtml(lastDate.slice(0, 10) || '—')}</div></div>
        <div class="kpi"><div class="kpi-label">平均予定過失割合</div><div class="kpi-value">${avgFault != null ? avgFault + '%' : '—'}</div></div>
        <div class="kpi"><div class="kpi-label">損害額合計</div><div class="kpi-value" style="font-size:12px;">¥${damageSum.toLocaleString('ja-JP')}</div></div>
      </div>

      <div class="fault-row">
        <span class="fault-chip">予定過失0% <b>${faultCounts['0%']}件</b></span>
        <span class="fault-chip">1〜49% <b>${faultCounts['1〜49%']}件</b></span>
        <span class="fault-chip">50%以上 <b>${faultCounts['50%以上']}件</b></span>
        <span class="fault-chip">未確定 <b>${faultCounts['未確定']}件</b></span>
      </div>

      <table class="rec-table">
        <thead><tr><th>発生日時</th><th>班</th><th>氏名</th><th>区分</th><th>相手・対象</th><th>事故形態</th><th>道路状況</th><th>天候</th><th>過失(予定/確定)</th><th>損害額</th><th>原因</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>

      <div class="foot">
        <div>本紙は社内システムより自動生成されています</div>
        <div>${division}課</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
