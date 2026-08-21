// 事故データ 安全運転リスクランキング（/accidents/risk）
// 元はAI売上分析ページにあったが、事故分析側の独立タブへ移設した（2026-08-21）。
import { ADMIN_PATH } from '../config';
import { escHtml } from './layout';
import { accidentsTabNav } from './accidents';
import type { DrivingRiskRankingRow } from '../routes/api/sales_ai';

const RISK_ACCENT = { low: '#10b981', medium: '#f59e0b', high: '#ef4444' };
const RISK_TINT   = { low: '#f0fdf9', medium: '#fffbeb', high: '#fef2f2' };
const RISK_TEXT   = { low: '#047857', medium: '#b45309', high: '#b91c1c' };
const RISK_LABELS = { low: '低', medium: '中', high: '高' };
const PRINT_ICON_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';

// 前回事故からの経過月数を、色分けされた小さなチップに変換する
function recencyChip(accidentCount: number, months: number | null): { label: string; fg: string; bg: string; border: string } {
  if (accidentCount === 0) return { label: '事故歴なし', fg: '#047857', bg: '#f0fdf9', border: '#a7f3d0' };
  if (months === null) return { label: '—', fg: '#94a3b8', bg: '#f8fafc', border: '#e5e7eb' };
  if (months < 3) return { label: `約${months}ヶ月（要注意）`, fg: '#b91c1c', bg: '#fef2f2', border: '#fecaca' };
  if (months < 12) return { label: `約${months}ヶ月`, fg: '#b45309', bg: '#fffbeb', border: '#fde68a' };
  return { label: `約${months}ヶ月無事故`, fg: '#047857', bg: '#f0fdf9', border: '#a7f3d0' };
}

export interface AccidentsRiskPeriod {
  year: number; month: number; start: string; end: string; isCurrentPeriod: boolean;
  prevYear: number; prevMonth: number; nextYear: number; nextMonth: number;
}

export interface AccidentsRiskPageOpts {
  drivingRiskRanking: DrivingRiskRankingRow[];
  period: AccidentsRiskPeriod;
}

export function accidentsRiskPage(opts: AccidentsRiskPageOpts): string {
  const { drivingRiskRanking, period } = opts;

  const riskBuckets = { high: { total: 0, withAccident: 0 }, medium: { total: 0, withAccident: 0 }, low: { total: 0, withAccident: 0 } };
  for (const r of drivingRiskRanking) {
    riskBuckets[r.riskLevel].total++;
    if (r.accidentCount > 0) riskBuckets[r.riskLevel].withAccident++;
  }
  const riskCorrelationHtml = (['high', 'medium', 'low'] as const).map(level => {
    const b = riskBuckets[level];
    const pct = b.total > 0 ? Math.round((b.withAccident / b.total) * 1000) / 10 : 0;
    return `
      <div class="srr-stat" style="background:${RISK_TINT[level]};border-color:${RISK_ACCENT[level]}2e;">
        <div class="srr-stat-head">
          <span class="srr-stat-dot" style="background:${RISK_ACCENT[level]};"></span>
          <span class="srr-stat-label" style="color:${RISK_TEXT[level]};">リスク${RISK_LABELS[level]} の事故惹起率</span>
        </div>
        <div class="srr-stat-value" style="color:${RISK_TEXT[level]};">${b.total > 0 ? `${pct}<span style="font-size:14px;font-weight:700;">%</span>` : '—'}</div>
        <div class="srr-stat-sub">${b.total > 0 ? `${b.total}名中 ${b.withAccident}名に事故歴あり` : '該当者なし'}</div>
        <div class="srr-stat-bar"><div class="srr-stat-bar-fill" style="width:${pct}%;background:${RISK_ACCENT[level]};"></div></div>
      </div>`;
  }).join('');

  const riskRowsHtml = drivingRiskRanking.length === 0
    ? `<tr><td colspan="10" style="padding:16px 8px;color:#9ca3af;text-align:center;">安全運転データがありません（ホシコン形式CSVの取込で蓄積されます）</td></tr>`
    : drivingRiskRanking.map(r => {
      const rc = recencyChip(r.accidentCount, r.monthsSinceLastAccident);
      return `
        <tr data-name="${escHtml(r.name)}" data-harsh="${r.totalHarshEvents}" data-per-duty="${r.harshEventsPerDuty}" data-speeding-days="${r.speedingDays}" data-risk="${r.riskLevel}" data-accident-count="${r.accidentCount}" data-months-since="${r.monthsSinceLastAccident ?? ''}">
          <td><a href="${ADMIN_PATH}/sales-ai/employee/${r.empId}" class="srr-name-link">${escHtml(r.name)}</a></td>
          <td style="color:#6b7280;">${r.division ?? '—'}課${r.team ? `${r.team}班` : ''}</td>
          <td class="srr-num" style="font-weight:700;">${r.totalHarshEvents}件</td>
          <td class="srr-num">${r.harshEventsPerDuty}件</td>
          <td class="srr-num">${r.maxSpeedHighway ?? '—'}/${r.maxSpeedLocal ?? '—'}km/h</td>
          <td class="srr-num">${r.speedingDays}日</td>
          <td><span class="srr-chip" style="background:${RISK_TINT[r.riskLevel]};color:${RISK_TEXT[r.riskLevel]};border-color:${RISK_ACCENT[r.riskLevel]}33;"><span class="srr-chip-dot" style="background:${RISK_ACCENT[r.riskLevel]};"></span>${RISK_LABELS[r.riskLevel]}</span></td>
          <td class="srr-num" style="${r.accidentCount > 0 ? 'color:#dc2626;font-weight:700;' : 'color:#9ca3af;'}">${r.accidentCount}件</td>
          <td><span class="srr-chip" style="background:${rc.bg};color:${rc.fg};border-color:${rc.border};">${rc.label}</span></td>
          <td style="text-align:center;"><a href="${ADMIN_PATH}/sales-ai/employee/${r.empId}/safety-guidance/print" target="_blank" title="安全運転指導書を印刷" class="srr-icon-btn">${PRINT_ICON_SVG}</a></td>
        </tr>`;
    }).join('');

  return `
<style>
  .aa { font-family:'Hiragino Sans','Meiryo',sans-serif; max-width:1160px; }
  .ac-tabnav { display:flex; gap:4px; margin-bottom:14px; border-bottom:1px solid #e5e7eb; }
  .ac-tab-link { padding:9px 16px; font-size:13px; font-weight:600; color:#64748b; text-decoration:none; border-bottom:2px solid transparent; margin-bottom:-1px; }
  .ac-tab-link:hover { color:#1a3a5c; }
  .ac-tab-link.active { color:#1a3a5c; border-bottom-color:#1a3a5c; }
  .aa-select { border:1px solid #d1d5db; border-radius:8px; padding:9px 12px; font-size:13px; background:#fff; }

  /* 安全運転リスクランキング — モダンUI（このページ限定のスコープ付きスタイル） */
  .srr-card { position: relative; overflow: hidden; background:#fff; border-radius:14px; box-shadow:0 1px 3px rgba(0,0,0,0.08); padding:22px 24px; }
  .srr-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, #ef4444 0%, #f59e0b 45%, #10b981 100%);
    opacity: .55;
  }
  .srr-stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 14px; }
  @media (max-width: 720px) { .srr-stat-grid { grid-template-columns: 1fr; } }
  .srr-stat {
    position: relative; border-radius: 14px; padding: 14px 16px 12px; border: 1px solid;
    transition: transform .15s ease, box-shadow .15s ease;
  }
  .srr-stat:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(15,23,42,0.08); }
  .srr-stat-head { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; }
  .srr-stat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .srr-stat-label { font-size: 11px; font-weight: 700; letter-spacing: .02em; }
  .srr-stat-value { font-size: 24px; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; letter-spacing: -.01em; }
  .srr-stat-sub { font-size: 11px; color: #6b7280; margin-top: 3px; }
  .srr-stat-bar { height: 5px; border-radius: 3px; background: rgba(15,23,42,0.06); margin-top: 10px; overflow: hidden; }
  .srr-stat-bar-fill { height: 100%; border-radius: 3px; transition: width .4s ease; }

  .srr-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12.5px; }
  .srr-table thead th {
    padding: 9px 10px; text-align: left; font-size: 10.5px; font-weight: 700; letter-spacing: .04em;
    color: #94a3b8; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; white-space: nowrap;
  }
  .srr-table tbody td { padding: 10px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .srr-table tbody tr { transition: background .12s ease; }
  .srr-table tbody tr:hover { background: #f8fafc; }
  .srr-table tbody tr:last-child td { border-bottom: none; }
  .srr-name-link { color: #1a3a5c; text-decoration: none; font-weight: 700; }
  .srr-name-link:hover { color: #2563eb; text-decoration: underline; }
  .srr-num { font-variant-numeric: tabular-nums; }

  .srr-chip {
    display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 999px;
    font-size: 11px; font-weight: 700; border: 1px solid transparent; white-space: nowrap;
  }
  .srr-chip-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

  .srr-icon-btn {
    display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px;
    border-radius: 8px; color: #64748b; background: transparent; transition: background .12s ease, color .12s ease;
  }
  .srr-icon-btn:hover { background: #eef2f7; color: #1a3a5c; }

  .srr-filter-bar { display:flex; flex-wrap:wrap; align-items:end; gap:14px; margin-bottom:14px; padding:14px 16px; background:#f8fafc; border:1px solid #e5e7eb; border-radius:10px; }
  .srr-filter-item { display:flex; flex-direction:column; gap:4px; }
  .srr-filter-item label { font-size:10.5px; font-weight:700; color:#64748b; }
  .srr-filter-item input[type="number"] { width:76px; border:1px solid #d1d5db; border-radius:7px; padding:6px 8px; font-size:12.5px; }
  .srr-filter-checks { display:flex; gap:10px; align-items:center; }
  .srr-filter-checks label { display:flex; align-items:center; gap:4px; font-size:12px; font-weight:600; color:#374151; }
  .srr-filter-reset { font-size:11.5px; color:#2563eb; background:none; border:none; cursor:pointer; padding:6px 4px; }
  .srr-print-bar { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:14px; }
  .srr-print-bar .lb { font-size:11.5px; color:#6b7280; margin-right:2px; }
  .srr-print-btn { display:inline-flex; align-items:center; gap:5px; font-size:12px; font-weight:700; color:#1a3a5c; background:#fff; border:1px solid #cbd5e1; border-radius:8px; padding:7px 12px; cursor:pointer; }
  .srr-print-btn:hover { background:#eef2f7; }
</style>
<div class="aa">
  ${accidentsTabNav('risk')}

  <div class="srr-card">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:2px;">
      <h3 style="font-size:13.5px;font-weight:700;color:#1e293b;margin:0;">安全運転リスクランキング <span style="font-weight:400;color:#94a3b8;">— 危険挙動の多い順</span></h3>
      <div style="display:flex;align-items:center;gap:8px;white-space:nowrap;">
        <a href="${ADMIN_PATH}/accidents/risk?year=${period.prevYear}&month=${period.prevMonth}" style="padding:5px 12px;background:#fff;border:1px solid #d1d5db;border-radius:6px;font-size:12px;text-decoration:none;color:#374151;">◀ 前月度</a>
        <div style="font-size:12px;color:#6b7280;min-width:110px;text-align:center;">${period.year}年${period.month}月度</div>
        ${period.isCurrentPeriod
          ? `<span style="padding:5px 12px;background:#f3f4f6;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;color:#c0c7d1;">次月度 ▶</span>`
          : `<a href="${ADMIN_PATH}/accidents/risk?year=${period.nextYear}&month=${period.nextMonth}" style="padding:5px 12px;background:#fff;border:1px solid #d1d5db;border-radius:6px;font-size:12px;text-decoration:none;color:#374151;">次月度 ▶</a>`}
      </div>
    </div>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:14px;">ホシコン収集データCSVの急発進・急加速・急減速・最高速度から算出した参考指標です。実際の事故記録ではありません。安全運転リスクは${period.year}年${period.month}月度のデータ、累計事故件数は在籍期間中の全期間累計のため、時間軸が異なる参考情報である点にご留意ください。</div>

    <div class="srr-stat-grid">${riskCorrelationHtml}</div>
    <input class="aa-select" id="risk-search" placeholder="氏名で絞り込み" oninput="filterRisk()" style="width:220px;margin-bottom:10px;">

    <div class="srr-filter-bar">
      <div class="srr-filter-item">
        <label>急挙動合計 最小</label>
        <input type="number" id="rf-min-harsh" min="0" placeholder="件" oninput="filterRisk()">
      </div>
      <div class="srr-filter-item">
        <label>乗務日あたり 最小</label>
        <input type="number" id="rf-min-per-duty" min="0" step="0.1" placeholder="件" oninput="filterRisk()">
      </div>
      <div class="srr-filter-item">
        <label>速度超過日数 最小</label>
        <input type="number" id="rf-min-speeding-days" min="0" placeholder="日" oninput="filterRisk()">
      </div>
      <div class="srr-filter-item">
        <label>累計事故件数 最小</label>
        <input type="number" id="rf-min-accidents" min="0" placeholder="件" oninput="filterRisk()">
      </div>
      <div class="srr-filter-item">
        <label>前回事故から 最大</label>
        <input type="number" id="rf-max-months-since" min="0" placeholder="ヶ月" oninput="filterRisk()">
      </div>
      <div class="srr-filter-item">
        <label>リスク判定</label>
        <div class="srr-filter-checks">
          <label><input type="checkbox" id="rf-risk-high" checked onchange="filterRisk()">高</label>
          <label><input type="checkbox" id="rf-risk-medium" checked onchange="filterRisk()">中</label>
          <label><input type="checkbox" id="rf-risk-low" checked onchange="filterRisk()">低</label>
        </div>
      </div>
      <button class="srr-filter-reset" onclick="resetRiskFilter()">条件をクリア</button>
    </div>

    <div class="srr-print-bar">
      <span class="lb">課別レポートを印刷（現在の絞り込み条件を適用）：</span>
      ${[1, 2, 3, 4].map(div => `<button class="srr-print-btn" onclick="printRiskDivisionReport(${div})">${PRINT_ICON_SVG}${div}課</button>`).join('')}
    </div>

    <div style="overflow-x:auto;">
      <table class="srr-table">
        <thead><tr>
          <th>氏名</th><th>課/班</th><th>急挙動合計</th><th>乗務日あたり</th><th>最高速度(高速/一般)</th><th>速度超過日数</th><th>判定</th><th>累計事故件数</th><th>前回事故からの経過</th><th style="text-align:center;">指導書</th>
        </tr></thead>
        <tbody id="risk-tbody">${riskRowsHtml}</tbody>
      </table>
    </div>
  </div>
</div>

<script>
function riskFilterValues() {
  function num(id) {
    var v = document.getElementById(id).value.trim();
    return v === '' ? null : parseFloat(v);
  }
  return {
    q: document.getElementById('risk-search').value.trim(),
    minHarsh: num('rf-min-harsh'),
    minPerDuty: num('rf-min-per-duty'),
    minSpeedingDays: num('rf-min-speeding-days'),
    minAccidents: num('rf-min-accidents'),
    maxMonthsSince: num('rf-max-months-since'),
    riskLevels: ['high', 'medium', 'low'].filter(function(lv) { return document.getElementById('rf-risk-' + lv).checked; }),
  };
}

function rowMatchesFilter(tr, f) {
  if (f.q && tr.getAttribute('data-name').indexOf(f.q) === -1) return false;
  if (f.minHarsh !== null && parseFloat(tr.getAttribute('data-harsh')) < f.minHarsh) return false;
  if (f.minPerDuty !== null && parseFloat(tr.getAttribute('data-per-duty')) < f.minPerDuty) return false;
  if (f.minSpeedingDays !== null && parseFloat(tr.getAttribute('data-speeding-days')) < f.minSpeedingDays) return false;
  if (f.minAccidents !== null && parseFloat(tr.getAttribute('data-accident-count')) < f.minAccidents) return false;
  if (f.maxMonthsSince !== null) {
    var monthsRaw = tr.getAttribute('data-months-since');
    if (monthsRaw === '') return false; // 事故歴なし＝経過月数は判定不能のため除外
    if (parseFloat(monthsRaw) > f.maxMonthsSince) return false;
  }
  if (f.riskLevels.indexOf(tr.getAttribute('data-risk')) === -1) return false;
  return true;
}

function filterRisk() {
  var f = riskFilterValues();
  document.querySelectorAll('#risk-tbody tr[data-name]').forEach(function(tr) {
    tr.style.display = rowMatchesFilter(tr, f) ? '' : 'none';
  });
}

function resetRiskFilter() {
  document.getElementById('risk-search').value = '';
  ['rf-min-harsh', 'rf-min-per-duty', 'rf-min-speeding-days', 'rf-min-accidents', 'rf-max-months-since'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
  ['high', 'medium', 'low'].forEach(function(lv) { document.getElementById('rf-risk-' + lv).checked = true; });
  filterRisk();
}

function printRiskDivisionReport(div) {
  var f = riskFilterValues();
  var params = ['year=${period.year}', 'month=${period.month}'];
  if (f.minHarsh !== null) params.push('minHarsh=' + f.minHarsh);
  if (f.minPerDuty !== null) params.push('minPerDuty=' + f.minPerDuty);
  if (f.minSpeedingDays !== null) params.push('minSpeedingDays=' + f.minSpeedingDays);
  if (f.minAccidents !== null) params.push('minAccidents=' + f.minAccidents);
  if (f.maxMonthsSince !== null) params.push('maxMonthsSinceAccident=' + f.maxMonthsSince);
  if (f.riskLevels.length < 3) params.push('riskLevels=' + f.riskLevels.join(','));
  var url = '${ADMIN_PATH}/accidents/risk/division/' + div + '/report/print?' + params.join('&');
  window.open(url, '_blank');
}
</script>
`;
}
