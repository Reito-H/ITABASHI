// AI売上分析（全社員横断）— 左サイドバー独立タブ。旧 社員管理→売上分析(全社) サブタブを統合・置き換え。
// 「AI」は表示名のみで、外部AI/LLM APIへの通信は一切行わない（utils/sales_trend_analysis.ts 参照）。
import { Hono } from 'hono';
import { layout, escHtml } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';
import { computeEmployeeAnalytics, loadDrivingRiskSettings, type EmployeeAnalytics } from './api/sales_ai';
import { buildRuleBasedSalesAnalysis } from '../utils/sales_trend_analysis';
import { renderSalesAiReportPrintPage, type SalesAiReportSheetOptions } from '../html/sales_ai_report_print';
import { renderSalesAiReportPrintBulkPage } from '../html/sales_ai_report_print_bulk';
import { renderSafetyGuidancePrintPage, type SafetyGuidanceSheetOptions } from '../html/safety_guidance_print';
import { summarizeDrivingRiskByCategory, buildDrivingSafetyGuidance } from '../utils/driving_safety_guidance';
import { summarizeDrivingRisk, type DrivingSafetyRow } from '../utils/driving_risk_analysis';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

function formatIssuedDateLabel(): string {
  const d = new Date();
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// EmployeeAnalytics + ルールベース分析 → 印刷シート用オプションに変換（単票・一括で共用）
function buildSheetOptions(data: NonNullable<EmployeeAnalytics>, months: number): SalesAiReportSheetOptions {
  const content = buildRuleBasedSalesAnalysis({
    empName: data.emp.name,
    weekdayBreakdown: data.weekdayBreakdown,
    factorBreakdown: data.factorBreakdown,
    trend: data.trend,
    relative: data.relative,
    returnTime: data.returnTime,
    wageEstimate: data.wageEstimate,
  });
  const cnt = data.daily.length;
  const totalAmount = data.daily.reduce((s, d) => s + d.amount, 0);
  const lastDate = cnt ? data.daily[cnt - 1].date : null;
  return {
    name: data.emp.name, division: data.emp.division, team: data.emp.team,
    periodLabel: `直近${months}ヶ月`,
    issuedDateLabel: formatIssuedDateLabel(),
    totalAmount, cnt, lastDate,
    weekdayBreakdown: data.weekdayBreakdown,
    content,
    drivingRisk: data.drivingRisk,
  };
}

// ===================================================
// 全社サマリー
// ===================================================
app.get('/sales-ai', async (c) => {
  const content = `
<style>
  .hrb-card { background:white; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.08); padding:20px 24px; margin-bottom:16px; }
  .hrb-bars { display:flex; align-items:flex-end; gap:4px; height:130px; padding-top:4px; }
  .hrb-col { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:3px; min-width:0; }
  .hrb-val { font-size:10px; font-weight:700; color:#475569; line-height:1; height:11px; white-space:nowrap; }
  .hrb-bar { width:100%; max-width:22px; border-radius:3px 3px 1px 1px; background:linear-gradient(180deg,#2d6a9f,#1a3a5c); transition:height .2s; }
  .hrb-lb { font-size:9px; color:#94a3b8; }
  .hrb-peak-chip { display:inline-flex; align-items:center; gap:4px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:14px; padding:3px 10px; margin:0 6px 6px 0; font-weight:700; color:#1a3a5c; }
</style>
<div style="max-width:1180px;font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
    <div>
      <h2 style="font-size:16px;font-weight:700;color:#1a3a5c;margin:0;">AI売上分析 — 全社員横断</h2>
      <div style="font-size:11px;color:#9ca3af;margin-top:3px;">対象エリア：東京23区＋武蔵野市・三鷹市。データから自動集計した傾向分析です（ルールベース・外部AI通信なし）</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;white-space:nowrap;">
      <button type="button" id="prev-period-btn" onclick="changePeriod(-1)" style="padding:5px 12px;background:#fff;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;">◀ 前月度</button>
      <div id="period-label" style="font-size:12px;color:#6b7280;min-width:150px;text-align:center;"></div>
      <button type="button" id="next-period-btn" onclick="changePeriod(1)" style="padding:5px 12px;background:#fff;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;">次月度 ▶</button>
    </div>
  </div>

  <div id="loading" style="color:#9ca3af;font-size:13px;margin-top:16px;">読み込み中…</div>

  <div id="filter-toolbar" style="display:none;position:sticky;top:0;z-index:15;background:#f8fafc;padding:10px 0 12px;margin-bottom:10px;border-bottom:1px solid #e5e7eb;">
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:12px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
      <span style="font-size:11px;font-weight:700;color:#6b7280;">絞り込み：</span>
      <input type="text" id="search-box" placeholder="社員名で検索" oninput="applyFilters()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;width:180px;">
      <select id="division-filter" onchange="applyFilters()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;">
        <option value="">全課</option>
        <option value="1">1課</option><option value="2">2課</option><option value="3">3課</option><option value="4">4課</option>
      </select>
      <select id="team-filter" onchange="applyFilters()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;">
        <option value="">全班</option>
        <option value="1">1班</option><option value="2">2班</option><option value="3">3班</option><option value="4">4班</option>
        <option value="5">5班</option><option value="6">6班</option><option value="7">7班</option><option value="8">8班</option>
      </select>
      <label style="font-size:12px;color:#b91c1c;display:flex;align-items:center;gap:4px;">
        <input type="checkbox" id="min-wage-filter" onchange="applyFilters()">最賃者のみ表示
      </label>
      <select id="sort-select" onchange="applyFilters()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;">
        <option value="curTotal-desc">今月度売上 高い順</option>
        <option value="curTotal-asc">今月度売上 低い順</option>
        <option value="changePct-desc">前月度比 高い順</option>
        <option value="changePct-asc">前月度比 低い順</option>
        <option value="curAvgPerDuty-desc">平均日商 高い順</option>
        <option value="curAvgPerDuty-asc">平均日商 低い順</option>
        <option value="curAvgReturnTimeMinutes-asc">平均帰庫時刻 早い順</option>
        <option value="curAvgReturnTimeMinutes-desc">平均帰庫時刻 遅い順</option>
        <option value="minimumWageShortfall-desc">最賃補填額(概算) 高い順</option>
      </select>
      <span style="font-size:10.5px;color:#9ca3af;">※課・名前・最賃絞り込みは下の社員別サマリーに適用されます</span>
    </div>
  </div>

  <div id="content" style="display:none;">
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
      <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 14px;">全社横断の暦要因別 営収差（今月度・実データより）</h3>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left;color:#6b7280;">
          <th style="padding:6px 8px;">要因</th><th style="padding:6px 8px;">該当日平均</th><th style="padding:6px 8px;">非該当日平均</th><th style="padding:6px 8px;">差分</th><th style="padding:6px 8px;">件数</th>
        </tr></thead>
        <tbody id="factor-tbody"></tbody>
      </table>
    </div>

    <div style="display:flex;gap:16px;margin-bottom:16px;">
      <div style="flex:1;background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;">
        <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 14px;">課別比較（今月度・平均日商）</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left;color:#6b7280;">
            <th style="padding:6px 8px;">課</th><th style="padding:6px 8px;">平均日商</th><th style="padding:6px 8px;">合計</th><th style="padding:6px 8px;">人数</th>
          </tr></thead>
          <tbody id="division-tbody"></tbody>
        </table>
      </div>
      <div style="flex:1;background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;">
        <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 14px;">班別比較（今月度・平均日商）</h3>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left;color:#6b7280;">
            <th style="padding:6px 8px;">班</th><th style="padding:6px 8px;">平均日商</th><th style="padding:6px 8px;">合計</th><th style="padding:6px 8px;">人数</th>
          </tr></thead>
          <tbody id="team-tbody"></tbody>
        </table>
      </div>
    </div>

    <div class="hrb-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:2px;">
        <h3 id="hrb-title" style="font-size:13.5px;font-weight:700;color:#1e293b;margin:0;">売上の強さ <span style="font-weight:400;color:#94a3b8;">— 今月度</span></h3>
        <div style="display:flex;gap:6px;">
          <button type="button" id="hrb-btn-hour" onclick="setHourlyView('hour')" style="padding:5px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:11.5px;font-weight:600;cursor:pointer;background:#1a3a5c;color:#fff;">時間帯別</button>
          <button type="button" id="hrb-btn-weekday" onclick="setHourlyView('weekday')" style="padding:5px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:11.5px;font-weight:600;cursor:pointer;background:#fff;color:#374151;">曜日別</button>
        </div>
      </div>
      <div id="hrb-desc" style="font-size:11px;color:#9ca3af;margin-bottom:6px;"></div>
      <div id="hrb-peak-summary" style="margin-bottom:8px;"></div>
      <div id="hourly-sales-bars" class="hrb-bars"></div>
      <div id="hourly-sales-note" style="font-size:10.5px;color:#9ca3af;margin-top:8px;"></div>
    </div>

    <div style="font-size:11px;color:#9ca3af;margin-bottom:16px;">※安全運転リスクランキングは<a href="${ADMIN_PATH}/accidents/risk" style="color:#2563eb;">事故分析（安全運転リスクランキング）</a>に移動しました。</div>

    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
        <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0;">社員別サマリー・ランキング（今月度・前月度比）</h3>
        <div style="display:flex;gap:8px;align-items:center;">
          <span id="selected-count" style="font-size:11px;color:#6b7280;">0名選択中</span>
          <button type="button" id="bulk-print-btn" onclick="printSelected()" disabled style="padding:6px 14px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;opacity:0.5;">選択した社員をまとめて印刷</button>
        </div>
      </div>
      <div style="font-size:10.5px;color:#9ca3af;margin-bottom:8px;">※最賃判定は基本給I＋歩合部分（公出含む）＋深夜/残業手当の概算給与と最低賃金時給×実労働時間を比較した概算です。深夜/残業手当は服務手当・段階分け・法定内外区分を省略した簡易計算です。<a href="${ADMIN_PATH}/settings/wage-estimate" style="color:#2563eb;">賃金試算設定</a>で確認・修正できます。</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left;color:#6b7280;">
          <th style="padding:6px 8px;width:24px;"><input type="checkbox" id="select-all" onchange="toggleAll(this.checked)"></th>
          <th style="padding:6px 8px;">順位</th><th style="padding:6px 8px;">氏名</th><th style="padding:6px 8px;">課/班</th><th style="padding:6px 8px;">今月度合計</th><th style="padding:6px 8px;">平均日商</th><th style="padding:6px 8px;">乗務日数</th><th style="padding:6px 8px;">前月度比</th><th style="padding:6px 8px;">平均帰庫時刻</th><th style="padding:6px 8px;">最賃判定</th>
        </tr></thead>
        <tbody id="emp-tbody"></tbody>
      </table>
    </div>
  </div>
</div>

<script>
let overviewData = null;
const selectedIds = new Set();
let viewYear = null, viewMonth = null;
let hourlyView = 'hour';

function changePeriod(delta) {
  if (!overviewData) return;
  const p = overviewData.period;
  viewYear = delta < 0 ? p.prevYear : p.nextYear;
  viewMonth = delta < 0 ? p.prevMonth : p.nextMonth;
  loadOverview();
}

async function loadOverview() {
  document.getElementById('loading').style.display = '';
  document.getElementById('loading').textContent = '読み込み中…';
  document.getElementById('content').style.display = 'none';
  try {
    const qs = (viewYear && viewMonth) ? ('?year=' + viewYear + '&month=' + viewMonth) : '';
    const res = await fetch('/api/sales-ai/overview' + qs);
    const json = await res.json();
    if (!res.ok) { document.getElementById('loading').textContent = json.error || '読み込みに失敗しました'; return; }
    overviewData = json;
    viewYear = json.period.year; viewMonth = json.period.month;
    document.getElementById('period-label').textContent = json.period.year + '年' + json.period.month + '月度（' + json.period.start + ' 〜 ' + json.period.end + '）';
    document.getElementById('next-period-btn').disabled = json.period.isCurrentPeriod;
    document.getElementById('next-period-btn').style.opacity = json.period.isCurrentPeriod ? '0.4' : '1';
    document.getElementById('next-period-btn').style.cursor = json.period.isCurrentPeriod ? 'default' : 'pointer';
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = '';
    document.getElementById('filter-toolbar').style.display = '';

    const tbody = document.getElementById('factor-tbody');
    tbody.innerHTML = json.factorBreakdown.map(f => {
      if (f.countTrue === 0) return '';
      const diffColor = f.diffPct === null ? '#9ca3af' : (f.diffPct >= 0 ? '#059669' : '#dc2626');
      const diffText = f.diffPct === null ? '—' : (f.diffPct >= 0 ? '+' : '') + f.diffPct + '%';
      return '<tr style="border-bottom:1px solid #f3f4f6;">' +
        '<td style="padding:7px 8px;font-weight:600;">' + f.label + '</td>' +
        '<td style="padding:7px 8px;">' + (f.avgTrue !== null ? f.avgTrue.toLocaleString('ja-JP') + '円' : '—') + '</td>' +
        '<td style="padding:7px 8px;">' + (f.avgFalse !== null ? f.avgFalse.toLocaleString('ja-JP') + '円' : '—') + '</td>' +
        '<td style="padding:7px 8px;font-weight:700;color:' + diffColor + ';">' + diffText + '</td>' +
        '<td style="padding:7px 8px;color:#9ca3af;">' + f.countTrue + '件</td>' +
        '</tr>';
    }).join('');

    document.getElementById('division-tbody').innerHTML = json.divisionBreakdown.map(d =>
      '<tr style="border-bottom:1px solid #f3f4f6;">' +
      '<td style="padding:7px 8px;font-weight:600;">' + d.division + '課</td>' +
      '<td style="padding:7px 8px;">' + d.avgPerDuty.toLocaleString('ja-JP') + '円</td>' +
      '<td style="padding:7px 8px;">' + d.total.toLocaleString('ja-JP') + '円</td>' +
      '<td style="padding:7px 8px;color:#9ca3af;">' + d.empCount + '名</td>' +
      '</tr>'
    ).join('') || '<tr><td colspan="4" style="padding:12px 8px;color:#9ca3af;">データがありません</td></tr>';

    document.getElementById('team-tbody').innerHTML = json.teamBreakdown.map(t =>
      '<tr style="border-bottom:1px solid #f3f4f6;">' +
      '<td style="padding:7px 8px;font-weight:600;">' + t.team + '班（' + t.division + '課）</td>' +
      '<td style="padding:7px 8px;">' + t.avgPerDuty.toLocaleString('ja-JP') + '円</td>' +
      '<td style="padding:7px 8px;">' + t.total.toLocaleString('ja-JP') + '円</td>' +
      '<td style="padding:7px 8px;color:#9ca3af;">' + t.empCount + '名</td>' +
      '</tr>'
    ).join('') || '<tr><td colspan="4" style="padding:12px 8px;color:#9ca3af;">データがありません</td></tr>';

    renderHourlySalesChart();
    applyFilters();
  } catch (err) {
    document.getElementById('loading').textContent = '通信エラーが発生しました';
  }
}

function currentDivTeamFilter() {
  const div = document.getElementById('division-filter').value;
  const team = document.getElementById('team-filter').value;
  return { div: div ? parseInt(div) : null, team: team ? parseInt(team) : null };
}

function setHourlyView(view) {
  hourlyView = view;
  document.getElementById('hrb-btn-hour').style.background = view === 'hour' ? '#1a3a5c' : '#fff';
  document.getElementById('hrb-btn-hour').style.color = view === 'hour' ? '#fff' : '#374151';
  document.getElementById('hrb-btn-weekday').style.background = view === 'weekday' ? '#1a3a5c' : '#fff';
  document.getElementById('hrb-btn-weekday').style.color = view === 'weekday' ? '#fff' : '#374151';
  renderHourlySalesChart();
}

function formatK(n) {
  return n > 0 ? (Math.round(n / 100) / 10) + 'k' : '';
}
function hourlyBarColor(ratio) {
  const lightness = Math.round(86 - Math.max(0, Math.min(1, ratio)) * 53);
  return 'hsl(208,62%,' + lightness + '%)';
}
function renderPeakSummary(elId, ranked, unit) {
  const top = ranked.slice(0, 3).filter(h => h.avgAmount > 0);
  document.getElementById(elId).innerHTML = top.length
    ? '<span style="font-size:11px;color:#6b7280;margin-right:6px;">強い' + unit + '：</span>' + top.map((h, i) =>
        '<span class="hrb-peak-chip">' + (i + 1) + '位　' + h.label + '　' + h.avgAmount.toLocaleString('ja-JP') + '円/日</span>'
      ).join('')
    : '';
}

function renderHourlySalesChart() {
  if (!overviewData) return;
  if (hourlyView === 'weekday') {
    const wd = overviewData.weekdayBreakdown;
    const ranked = wd.map(w => ({ label: w.label, avgAmount: w.avg || 0 })).sort((a, b) => b.avgAmount - a.avgAmount);
    const max = Math.max(...wd.map(w => w.avg || 0), 1);
    document.getElementById('hrb-title').innerHTML = '売上の強さ <span style="font-weight:400;color:#94a3b8;">— 今月度・曜日別</span>';
    document.getElementById('hrb-desc').textContent = '曜日ごとの平均日商（円）です。実データからの集計で、推定値ではありません。棒の上の「k」は千円単位です（例：12.3k＝12,300円）。';
    renderPeakSummary('hrb-peak-summary', ranked, '曜日');
    document.getElementById('hourly-sales-bars').innerHTML = wd.map(w => {
      const ratio = (w.avg || 0) / max;
      return '<div class="hrb-col">' +
        '<div class="hrb-val">' + formatK(w.avg || 0) + '</div>' +
        '<div class="hrb-bar" style="background:' + hourlyBarColor(ratio) + ';height:' + (w.avg ? Math.max(Math.round(ratio * 100), 4) : 2) + 'px;"></div>' +
        '<div class="hrb-lb">' + w.label + '</div>' +
      '</div>';
    }).join('');
    document.getElementById('hourly-sales-note').textContent = wd.map(w => w.label + ':' + w.count + '件').join(' / ');
    return;
  }
  const hourlySales = overviewData.hourlySales;
  const worked = hourlySales.hourly.filter(h => h.sampleCount > 0);
  document.getElementById('hrb-title').innerHTML = '売上の強さ <span style="font-weight:400;color:#94a3b8;">— 今月度・1時間ごと（1乗務日あたり平均）</span>';
  document.getElementById('hrb-desc').textContent = '乗車ごとの時刻データはないため、出庫〜帰庫時間に売上（税込収入）を均等按分し、乗務日数で割った「1日あたり平均」の推定値です。乗務のない時間帯は表示していません。棒の上の「k」は千円単位です（例：12.3k＝12,300円）。';

  if (!worked.length) {
    document.getElementById('hrb-peak-summary').innerHTML = '';
    document.getElementById('hourly-sales-bars').innerHTML = '<div style="color:#9ca3af;font-size:12px;">出庫・帰庫時刻のデータが不足しています</div>';
    document.getElementById('hourly-sales-note').textContent = '';
    return;
  }
  const max = Math.max(...worked.map(h => h.avgAmount), 1);
  const ranked = worked.map(h => ({ label: h.hour + '時台', avgAmount: h.avgAmount })).sort((a, b) => b.avgAmount - a.avgAmount);
  renderPeakSummary('hrb-peak-summary', ranked, '時間帯');
  const peakHours = new Set(worked.slice().sort((a, b) => b.avgAmount - a.avgAmount).slice(0, 3).filter(h => h.avgAmount > 0).map(h => h.hour));
  const showAllLabels = worked.length <= 14;
  document.getElementById('hourly-sales-bars').innerHTML = worked.map(h => {
    const ratio = h.avgAmount / max;
    const isPeak = peakHours.has(h.hour);
    return '<div class="hrb-col">' +
      '<div class="hrb-val" style="' + (isPeak ? 'color:#1a3a5c;' : '') + '">' + formatK(h.avgAmount) + '</div>' +
      '<div class="hrb-bar" style="background:' + hourlyBarColor(ratio) + ';' + (isPeak ? 'box-shadow:0 0 0 2px #1a3a5c inset;' : '') + 'height:' + (h.avgAmount > 0 ? Math.max(Math.round(ratio * 100), 4) : 2) + 'px;"></div>' +
      '<div class="hrb-lb">' + (showAllLabels || h.hour % 2 === 0 ? h.hour : '') + '</div>' +
    '</div>';
  }).join('');
  document.getElementById('hourly-sales-note').textContent =
    '出庫・帰庫時刻データ ' + hourlySales.totalCount + '件中 ' + hourlySales.coverageCount + '件から算出（乗務のあった' + worked.length + '時間帯のみ表示）';
}

function applyFilters() {
  renderTable();
}

function renderTable() {
  if (!overviewData) return;
  const q = document.getElementById('search-box').value.trim();
  const { div, team } = currentDivTeamFilter();
  const minWageOnly = document.getElementById('min-wage-filter').checked;
  const [sortKey, sortDir] = document.getElementById('sort-select').value.split('-');

  let rows = overviewData.employees.filter(e =>
    (!q || e.name.includes(q)) &&
    (div === null || e.division === div) &&
    (team === null || e.team === team) &&
    (!minWageOnly || e.isMinimumWageEarner)
  );
  rows = rows.slice().sort((a, b) => {
    const av = a[sortKey] ?? -Infinity, bv = b[sortKey] ?? -Infinity;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const tbody = document.getElementById('emp-tbody');
  tbody.innerHTML = rows.map((e, i) => {
    const changeColor = e.changePct === null ? '#9ca3af' : (e.changePct >= 0 ? '#059669' : '#dc2626');
    const changeText = e.changePct === null ? '—' : (e.changePct >= 0 ? '+' : '') + e.changePct + '%';
    const mwCell = e.isMinimumWageEarner
      ? '<span style="background:#fef2f2;color:#dc2626;border-radius:10px;padding:2px 8px;font-size:11px;font-weight:700;">最賃 補填概算' + (e.minimumWageShortfall ?? 0).toLocaleString('ja-JP') + '円</span>'
      : (e.minimumWageShortfall !== null ? '<span style="color:#9ca3af;">—</span>' : '<span style="color:#d1d5db;">データ不足</span>');
    return '<tr style="border-bottom:1px solid #f3f4f6;">' +
      '<td style="padding:7px 8px;"><input type="checkbox" class="emp-check" data-id="' + e.empId + '" ' + (selectedIds.has(e.empId) ? 'checked' : '') + ' onchange="toggleOne(' + e.empId + ', this.checked)"></td>' +
      '<td style="padding:7px 8px;color:#9ca3af;">' + (i + 1) + '</td>' +
      '<td style="padding:7px 8px;"><a href="' + ADMIN_PATH + '/sales-ai/employee/' + e.empId + '" style="color:#2563eb;text-decoration:none;font-weight:600;">' + escHtmlJs(e.name) + '</a></td>' +
      '<td style="padding:7px 8px;color:#6b7280;">' + (e.division ?? '—') + '課' + (e.team ? e.team + '班' : '') + '</td>' +
      '<td style="padding:7px 8px;font-weight:600;">' + e.curTotal.toLocaleString('ja-JP') + '円</td>' +
      '<td style="padding:7px 8px;">' + (e.curAvgPerDuty !== null ? e.curAvgPerDuty.toLocaleString('ja-JP') + '円' : '—') + '</td>' +
      '<td style="padding:7px 8px;">' + e.curDutyCount + '日</td>' +
      '<td style="padding:7px 8px;font-weight:700;color:' + changeColor + ';">' + changeText + '</td>' +
      '<td style="padding:7px 8px;">' + (e.curAvgReturnTime ?? '—') + '</td>' +
      '<td style="padding:7px 8px;">' + mwCell + '</td>' +
      '</tr>';
  }).join('');
}

function toggleOne(id, checked) {
  if (checked) selectedIds.add(id); else selectedIds.delete(id);
  updateSelectedUi();
}
function toggleAll(checked) {
  document.querySelectorAll('.emp-check').forEach(cb => {
    const id = parseInt(cb.dataset.id);
    cb.checked = checked;
    if (checked) selectedIds.add(id); else selectedIds.delete(id);
  });
  updateSelectedUi();
}
function updateSelectedUi() {
  document.getElementById('selected-count').textContent = selectedIds.size + '名選択中';
  const btn = document.getElementById('bulk-print-btn');
  btn.disabled = selectedIds.size === 0;
  btn.style.opacity = selectedIds.size === 0 ? '0.5' : '1';
}
function printSelected() {
  if (!selectedIds.size) return;
  window.open(ADMIN_PATH + '/sales-ai/report/print-bulk?ids=' + [...selectedIds].join(','), '_blank');
}

function escHtmlJs(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

const ADMIN_PATH = '${ADMIN_PATH}';
loadOverview();
</script>`;

  return c.html(layout('AI売上分析', content, 'sales-ai'));
});

// ===================================================
// 個人詳細（トレンド・相対評価・AI分析）
// ===================================================
app.get('/sales-ai/employee/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.notFound();

  const emp = await c.env.DB.prepare('SELECT id, name, emp_no, division, team FROM employees WHERE id = ?')
    .bind(id).first<{ id: number; name: string; emp_no: string; division: number | null; team: number | null }>();
  if (!emp) return c.text('社員が見つかりません', 404);

  const content = `
<div style="max-width:1000px;font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
    <a href="${ADMIN_PATH}/sales-ai" style="color:#2563eb;font-size:13px;text-decoration:none;">← AI売上分析（全社）に戻る</a>
    <a href="${ADMIN_PATH}/sales-ai/employee/${emp.id}/report/print" target="_blank" style="padding:7px 16px;background:#1a3a5c;color:white;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">🖨️ AI分析レポートを印刷</a>
  </div>

  <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h3 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0;">${escHtml(emp.name)}（${emp.division ?? '—'}課${emp.team ? emp.team + '班' : ''} ／ ${escHtml(emp.emp_no)}）— AI売上分析</h3>
      <select id="sales-months" onchange="loadAll()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;">
        <option value="3">直近3ヶ月</option>
        <option value="6" selected>直近6ヶ月</option>
        <option value="12">直近12ヶ月</option>
        <option value="24">直近24ヶ月</option>
      </select>
    </div>
    <div id="loading" style="color:#9ca3af;font-size:13px;">読み込み中…</div>
    <div id="content" style="display:none;">

      <div id="headline-box" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:13px;font-weight:700;color:#78350f;margin-bottom:18px;line-height:1.7;"></div>

      <div style="position:relative;height:220px;margin-bottom:24px;"><canvas id="monthly-chart"></canvas></div>
      <div style="position:relative;height:220px;margin-bottom:24px;"><canvas id="weekday-chart"></canvas></div>

      <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">時間帯別の売上の強さ（1乗務日あたり平均）</h4>
      <div style="font-size:10.5px;color:#9ca3af;margin-bottom:6px;">乗車ごとの時刻データはないため、出庫〜帰庫時間に売上（税込収入）を均等按分し、乗務日数で割った「1日あたり平均」の推定値です。乗務のない時間帯は表示していません。棒の上の「k」は千円単位です（例：12.3k＝12,300円）。</div>
      <div id="hourly-sales-peak" style="margin-bottom:8px;"></div>
      <div id="hourly-sales-bars" style="display:flex;align-items:flex-end;gap:4px;height:130px;padding-top:4px;"></div>
      <div id="hourly-sales-note" style="font-size:10.5px;color:#9ca3af;margin-top:8px;margin-bottom:24px;"></div>

      <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">暦要因別の営収差</h4>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px;">
        <thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left;color:#6b7280;">
          <th style="padding:6px 8px;">要因</th><th style="padding:6px 8px;">該当日平均</th><th style="padding:6px 8px;">非該当日平均</th><th style="padding:6px 8px;">差分</th><th style="padding:6px 8px;">件数</th>
        </tr></thead>
        <tbody id="factor-tbody"></tbody>
      </table>

      <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">同条件比較（相対評価）</h4>
      <div id="relative-box" style="margin-bottom:10px;font-size:12px;color:#374151;"></div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px;">
        <thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left;color:#6b7280;">
          <th style="padding:6px 8px;">勤務区分</th><th style="padding:6px 8px;">本人平均</th><th style="padding:6px 8px;">他の乗務員平均</th><th style="padding:6px 8px;">差分</th>
        </tr></thead>
        <tbody id="duty-tbody"></tbody>
      </table>

      <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">帰庫時間</h4>
      <div id="return-time-box" style="margin-bottom:24px;font-size:12px;color:#374151;background:#f9fafb;border-radius:8px;padding:10px 14px;"></div>

      <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">賃金インパクト試算（概算）</h4>
      <div id="wage-box" style="margin-bottom:8px;font-size:12px;color:#374151;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;line-height:1.7;"></div>
      <div style="font-size:10.5px;color:#9ca3af;margin-bottom:24px;">※本人の勤務区分に応じた成果手当（歩合部分・公出含む）と、深夜/残業手当の概算です。深夜/残業手当は服務手当・能率手当・段階分け・法定内外区分を省略した簡易計算のため、実際の給与とは異なります。設定値は<a href="${ADMIN_PATH}/settings/wage-estimate" style="color:#2563eb;">賃金試算設定</a>で確認・修正できます。</div>

      <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">最低賃金判定（概算）</h4>
      <div id="min-wage-box" style="margin-bottom:24px;font-size:12px;color:#374151;"></div>

      <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">労働需要の背景</h4>
      <div id="labor-demand-box" style="margin-bottom:24px;font-size:12px;color:#374151;background:#f9fafb;border-radius:8px;padding:10px 14px;line-height:1.7;"></div>

      <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">安全運転リスク（参考指標・事故記録ではありません）</h4>
      <div id="risk-box" style="margin-bottom:24px;font-size:12px;color:#374151;"></div>

      <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">AI分析 — 弱点・改善提案</h4>
      <div style="display:flex;gap:16px;margin-bottom:16px;">
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:700;color:#b91c1c;margin-bottom:6px;">弱点・改善余地</div>
          <ul id="weak-list" style="margin:0;padding-left:18px;font-size:12px;line-height:1.8;color:#374151;"></ul>
        </div>
        <div style="flex:1;">
          <div style="font-size:12px;font-weight:700;color:#166534;margin-bottom:6px;">強み</div>
          <ul id="strong-list" style="margin:0;padding-left:18px;font-size:12px;line-height:1.8;color:#374151;"></ul>
        </div>
      </div>
      <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;">改善提案</div>
      <ul id="rec-list" style="margin:0;padding-left:18px;font-size:12px;line-height:1.8;color:#374151;"></ul>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js" crossorigin="anonymous"></script>
<script>
const EMP_ID = ${emp.id};
let monthlyChart = null, weekdayChart = null;

async function loadAll() {
  const months = document.getElementById('sales-months').value;
  document.getElementById('loading').style.display = '';
  document.getElementById('content').style.display = 'none';
  try {
    const [res1, res2] = await Promise.all([
      fetch('/api/sales-ai/employee/' + EMP_ID + '?months=' + months),
      fetch('/api/sales-ai/employee/' + EMP_ID + '/report?months=' + months),
    ]);
    const data = await res1.json();
    const report = await res2.json();
    if (!res1.ok) { document.getElementById('loading').textContent = data.error || '読み込みに失敗しました'; return; }
    if (!data.monthly.length) { document.getElementById('loading').textContent = 'この期間の売上データがありません'; return; }

    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = '';

    document.getElementById('headline-box').textContent = report.content.headline;

    const monthLabels = data.monthly.map(m => m.year + '年' + m.month + '月度');
    const monthTotals = data.monthly.map(m => m.avgPerDuty);
    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(document.getElementById('monthly-chart').getContext('2d'), {
      type: 'bar',
      data: { labels: monthLabels, datasets: [{ label: '月度平均日商(円)', data: monthTotals, backgroundColor: 'rgba(37,99,235,0.7)', borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: '月度平均日商の推移' } }, scales: { y: { beginAtZero: true } } }
    });

    const wdLabels = data.weekdayBreakdown.map(w => w.label);
    const wdAvgs = data.weekdayBreakdown.map(w => w.avg || 0);
    if (weekdayChart) weekdayChart.destroy();
    weekdayChart = new Chart(document.getElementById('weekday-chart').getContext('2d'), {
      type: 'bar',
      data: { labels: wdLabels, datasets: [{ label: '曜日別平均売上(円)', data: wdAvgs, backgroundColor: 'rgba(5,150,105,0.7)', borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: '曜日別 平均売上' } }, scales: { y: { beginAtZero: true } } }
    });

    const worked = data.hourlySales.hourly.filter(h => h.sampleCount > 0);
    if (!worked.length) {
      document.getElementById('hourly-sales-peak').innerHTML = '';
      document.getElementById('hourly-sales-bars').innerHTML = '<div style="color:#9ca3af;font-size:12px;">出庫・帰庫時刻のデータが不足しています</div>';
      document.getElementById('hourly-sales-note').textContent = '';
    } else {
      const hourlyMax = Math.max(...worked.map(h => h.avgAmount), 1);
      const ranked = worked.slice().sort((a, b) => b.avgAmount - a.avgAmount);
      const top3 = ranked.slice(0, 3).filter(h => h.avgAmount > 0);
      const peakHours = new Set(top3.map(h => h.hour));
      const showAllLabels = worked.length <= 14;
      document.getElementById('hourly-sales-peak').innerHTML = top3.length
        ? '<span style="font-size:11px;color:#6b7280;margin-right:6px;">強い時間帯：</span>' + top3.map((h, i) =>
            '<span style="display:inline-flex;align-items:center;gap:4px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:3px 10px;margin:0 6px 6px 0;font-weight:700;color:#1a3a5c;">' +
            (i + 1) + '位　' + h.hour + '時台　' + h.avgAmount.toLocaleString('ja-JP') + '円/日</span>'
          ).join('')
        : '';
      document.getElementById('hourly-sales-bars').innerHTML = worked.map(h => {
        const ratio = h.avgAmount / hourlyMax;
        const isPeak = peakHours.has(h.hour);
        const lightness = Math.round(86 - Math.max(0, Math.min(1, ratio)) * 53);
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;min-width:0;">' +
          '<div style="font-size:10px;font-weight:700;color:' + (isPeak ? '#1a3a5c' : '#475569') + ';line-height:1;height:11px;white-space:nowrap;">' + (h.avgAmount > 0 ? (Math.round(h.avgAmount / 100) / 10) + 'k' : '') + '</div>' +
          '<div style="width:100%;max-width:22px;border-radius:3px 3px 1px 1px;background:hsl(208,62%,' + lightness + '%);' + (isPeak ? 'box-shadow:0 0 0 2px #1a3a5c inset;' : '') + 'height:' + (h.avgAmount > 0 ? Math.max(Math.round(ratio * 100), 4) : 2) + 'px;"></div>' +
          '<div style="font-size:9px;color:#94a3b8;">' + (showAllLabels || h.hour % 2 === 0 ? h.hour : '') + '</div>' +
        '</div>';
      }).join('');
      document.getElementById('hourly-sales-note').textContent =
        '出庫・帰庫時刻データ ' + data.hourlySales.totalCount + '件中 ' + data.hourlySales.coverageCount + '件から算出（乗務のあった' + worked.length + '時間帯のみ表示）';
    }

    document.getElementById('factor-tbody').innerHTML = data.factorBreakdown.map(f => {
      if (f.countTrue === 0) return '';
      const diffColor = f.diffPct === null ? '#9ca3af' : (f.diffPct >= 0 ? '#059669' : '#dc2626');
      const diffText = f.diffPct === null ? '—' : (f.diffPct >= 0 ? '+' : '') + f.diffPct + '%';
      return '<tr style="border-bottom:1px solid #f3f4f6;">' +
        '<td style="padding:7px 8px;font-weight:600;">' + f.label + '</td>' +
        '<td style="padding:7px 8px;">' + (f.avgTrue !== null ? f.avgTrue.toLocaleString('ja-JP') + '円' : '—') + '</td>' +
        '<td style="padding:7px 8px;">' + (f.avgFalse !== null ? f.avgFalse.toLocaleString('ja-JP') + '円' : '—') + '</td>' +
        '<td style="padding:7px 8px;font-weight:700;color:' + diffColor + ';">' + diffText + '</td>' +
        '<td style="padding:7px 8px;color:#9ca3af;">' + f.countTrue + '件</td>' +
        '</tr>';
    }).join('');

    if (data.relative) {
      const dDiff = data.relative.divisionDiffPct;
      const dColor = dDiff === null ? '#6b7280' : (dDiff >= 0 ? '#059669' : '#dc2626');
      const dText = dDiff === null ? '比較対象データがありません' : ((dDiff >= 0 ? '+' : '') + dDiff + '%');
      document.getElementById('relative-box').innerHTML =
        data.relative.periodLabel + '： 本人平均日商 ' + data.relative.selfAvg.toLocaleString('ja-JP') + '円 ／ 同じ課の他の乗務員平均（' + data.relative.peerCount + '名） ' +
        (data.relative.peerAvg !== null ? data.relative.peerAvg.toLocaleString('ja-JP') + '円' : '—') +
        ' ／ 差分 <span style="font-weight:700;color:' + dColor + ';">' + dText + '</span>';

      document.getElementById('duty-tbody').innerHTML = data.relative.dutyComparison.map(d => {
        const diffColor = d.diffPct === null ? '#9ca3af' : (d.diffPct >= 0 ? '#059669' : '#dc2626');
        const diffText = d.diffPct === null ? '—' : (d.diffPct >= 0 ? '+' : '') + d.diffPct + '%';
        return '<tr style="border-bottom:1px solid #f3f4f6;">' +
          '<td style="padding:7px 8px;font-weight:600;">' + d.dutyCode + '（' + d.selfCount + '日）</td>' +
          '<td style="padding:7px 8px;">' + d.selfAvg.toLocaleString('ja-JP') + '円</td>' +
          '<td style="padding:7px 8px;">' + (d.peerAvg !== null ? d.peerAvg.toLocaleString('ja-JP') + '円' : '—') + '</td>' +
          '<td style="padding:7px 8px;font-weight:700;color:' + diffColor + ';">' + diffText + '</td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="4" style="padding:10px 8px;color:#9ca3af;">当月度のデータがありません</td></tr>';
    } else {
      document.getElementById('relative-box').textContent = '比較対象データがありません';
      document.getElementById('duty-tbody').innerHTML = '';
    }

    if (data.returnTime.sufficientData) {
      document.getElementById('return-time-box').textContent = '平均帰庫時刻: ' + data.returnTime.avg + '（' + data.returnTime.count + '件のデータより算出）';
    } else {
      document.getElementById('return-time-box').textContent = '帰庫時刻のデータを蓄積中です（現在' + data.returnTime.count + '件。10件以上で傾向を表示します）';
    }

    document.getElementById('wage-box').textContent = report.content.wage_summary || 'データが不足しているため試算できません（当月度の実績が必要です）';
    document.getElementById('labor-demand-box').textContent = report.content.labor_demand_note;

    const mw = data.minimumWage;
    if (mw && mw.sufficientData) {
      const box = document.getElementById('min-wage-box');
      if (mw.isMinimumWageEarner) {
        box.innerHTML =
          '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;line-height:1.8;">' +
          '<span style="background:#dc2626;color:white;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:700;">最賃者（概算）</span><br>' +
          '概算給与 ' + mw.estimatedPay.toLocaleString('ja-JP') + '円 ／ 最低賃金保障額 ' + mw.guaranteedPay.toLocaleString('ja-JP') + '円' +
          '（実労働時間 ' + mw.laborHoursTotal + '時間）<br>' +
          '<strong style="color:#dc2626;">補填額(概算): ' + mw.shortfall.toLocaleString('ja-JP') + '円</strong>' +
          '</div>';
      } else {
        box.innerHTML =
          '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;line-height:1.8;">' +
          '概算給与 ' + mw.estimatedPay.toLocaleString('ja-JP') + '円 ／ 最低賃金保障額 ' + mw.guaranteedPay.toLocaleString('ja-JP') + '円' +
          '（実労働時間 ' + mw.laborHoursTotal + '時間）— 最低賃金を上回っています' +
          '</div>';
      }
    } else {
      document.getElementById('min-wage-box').innerHTML = '<div style="color:#9ca3af;background:#f9fafb;border-radius:8px;padding:10px 14px;">実労働時間データが不足しているため判定できません（ホシコン形式CSVの取込で蓄積されます）</div>';
    }

    const risk = data.drivingRisk;
    if (risk) {
      const RISK_COLORS = { low: '#166534', medium: '#d97706', high: '#dc2626' };
      const RISK_BG = { low: '#f0fdf4', medium: '#fffbeb', high: '#fef2f2' };
      const RISK_LABELS = { low: '低', medium: '中', high: '高' };
      document.getElementById('risk-box').innerHTML =
        '<span style="display:inline-block;background:' + RISK_BG[risk.riskLevel] + ';color:' + RISK_COLORS[risk.riskLevel] + ';border-radius:12px;padding:3px 12px;font-size:12px;font-weight:700;margin-bottom:8px;">総合判定: リスク' + RISK_LABELS[risk.riskLevel] + '</span>' +
        '<div style="display:flex;gap:16px;background:#f9fafb;border-radius:8px;padding:10px 14px;margin-bottom:8px;">' +
        '<div>急挙動合計: <strong>' + risk.totalHarshEvents + '件</strong></div>' +
        '<div>乗務日あたり: <strong>' + risk.harshEventsPerDuty + '件</strong></div>' +
        '<div>最高速度(高速/一般): <strong>' + (risk.maxSpeedHighway ?? '—') + '/' + (risk.maxSpeedLocal ?? '—') + 'km/h</strong></div>' +
        '<div>速度超過日数: <strong>' + risk.speedingDays + '日</strong></div>' +
        '</div>' +
        '<a href="${ADMIN_PATH}/sales-ai/employee/' + EMP_ID + '/safety-guidance/print?months=' + months + '" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">🚨 安全運転指導書を印刷</a>';
    } else {
      document.getElementById('risk-box').innerHTML = '<div style="color:#9ca3af;background:#f9fafb;border-radius:8px;padding:10px 14px;">安全運転データがまだありません（ホシコン形式CSVの取込で蓄積されます）</div>';
    }

    document.getElementById('weak-list').innerHTML = report.content.weak_points.map(t => '<li>' + escHtmlJs(t) + '</li>').join('') || '<li style="color:#9ca3af;">特筆すべき弱点は見られません</li>';
    document.getElementById('strong-list').innerHTML = report.content.strong_points.map(t => '<li>' + escHtmlJs(t) + '</li>').join('') || '<li style="color:#9ca3af;">特筆すべき強みは見られません</li>';
    document.getElementById('rec-list').innerHTML = report.content.recommendations.map(t => '<li>' + escHtmlJs(t) + '</li>').join('');
  } catch (err) {
    document.getElementById('loading').textContent = '通信エラーが発生しました';
  }
}

function escHtmlJs(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

loadAll();
</script>`;

  return c.html(layout(`${emp.name} — AI売上分析`, content, 'sales-ai'));
});

// ===================================================
// 個人印刷レポート（A4縦1枚・右下に「ホシコンAI売上分析システム」）
// ===================================================
app.get('/sales-ai/employee/:id/report/print', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.notFound();
  const months = Math.min(Math.max(parseInt(c.req.query('months') ?? '6') || 6, 1), 24);

  const data = await computeEmployeeAnalytics(c.env.DB, id, months);
  if (!data) return c.text('社員が見つかりません', 404);

  const sheet = buildSheetOptions(data, months);
  return c.html(renderSalesAiReportPrintPage(sheet, `${ADMIN_PATH}/sales-ai/employee/${id}`));
});

// ===================================================
// 複数社員 一括印刷（選択した社員をまとめてA4連続出力）
// ===================================================
app.get('/sales-ai/report/print-bulk', async (c) => {
  const idsParam = c.req.query('ids') ?? '';
  const ids = [...new Set(idsParam.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)))];
  if (!ids.length) return c.text('対象社員が指定されていません', 400);
  const months = Math.min(Math.max(parseInt(c.req.query('months') ?? '6') || 6, 1), 24);

  const results = await Promise.all(ids.map(id => computeEmployeeAnalytics(c.env.DB, id, months)));
  const sheets = results
    .filter((d): d is NonNullable<EmployeeAnalytics> => d !== null)
    .map(d => buildSheetOptions(d, months));
  if (!sheets.length) return c.text('対象社員が見つかりません', 404);

  return c.html(renderSalesAiReportPrintBulkPage(sheets, `${ADMIN_PATH}/sales-ai`));
});

// ===================================================
// 安全運転指導書（急発進・急加速・急減速・速度超過の実績＋リスク説明＋事故照合。1枚目: 指導書／2枚目: 記入シート+印鑑欄）
// ===================================================
app.get('/sales-ai/employee/:id/safety-guidance/print', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.notFound();
  const months = Math.min(Math.max(parseInt(c.req.query('months') ?? '6') || 6, 1), 24);

  const emp = await c.env.DB.prepare('SELECT id, name, emp_no, division, team FROM employees WHERE id = ?')
    .bind(id).first<{ id: number; name: string; emp_no: string; division: number | null; team: number | null }>();
  if (!emp) return c.text('社員が見つかりません', 404);

  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().slice(0, 10);

  const [safetyRows, dutyRow, riskSettings, accidentRow] = await Promise.all([
    c.env.DB.prepare(
      `SELECT date, harsh_start_loaded, harsh_start_empty, harsh_accel_loaded, harsh_accel_empty,
              harsh_decel_loaded, harsh_decel_empty, max_speed_loaded_highway, max_speed_loaded_local
       FROM driving_safety_records WHERE emp_id = ? AND date >= ?`
    ).bind(id, sinceStr).all<{
      date: string;
      harsh_start_loaded: number | null; harsh_start_empty: number | null;
      harsh_accel_loaded: number | null; harsh_accel_empty: number | null;
      harsh_decel_loaded: number | null; harsh_decel_empty: number | null;
      max_speed_loaded_highway: number | null; max_speed_loaded_local: number | null;
    }>(),
    c.env.DB.prepare('SELECT COUNT(*) as cnt FROM sales_records WHERE emp_id = ? AND date >= ?').bind(id, sinceStr).first<{ cnt: number }>(),
    loadDrivingRiskSettings(c.env.DB),
    c.env.DB.prepare('SELECT COUNT(*) as cnt, MAX(occurred_date) as last_date FROM accident_records WHERE emp_no = ?').bind(emp.emp_no).first<{ cnt: number; last_date: string | null }>(),
  ]);

  const rows: DrivingSafetyRow[] = (safetyRows.results ?? []).map(r => ({
    date: r.date,
    harshStartLoaded: r.harsh_start_loaded, harshStartEmpty: r.harsh_start_empty,
    harshAccelLoaded: r.harsh_accel_loaded, harshAccelEmpty: r.harsh_accel_empty,
    harshDecelLoaded: r.harsh_decel_loaded, harshDecelEmpty: r.harsh_decel_empty,
    maxSpeedLoadedHighway: r.max_speed_loaded_highway, maxSpeedLoadedLocal: r.max_speed_loaded_local,
  }));
  if (!rows.length) return c.text('安全運転データがありません（ホシコン形式CSVの取込で蓄積されます）', 404);

  const dutyDays = dutyRow?.cnt ?? rows.length;
  const riskSummary = summarizeDrivingRisk(rows, dutyDays, riskSettings);
  const breakdown = summarizeDrivingRiskByCategory(rows, riskSettings);
  const accidentCount = accidentRow?.cnt ?? 0;
  const lastAccidentDate = accidentRow?.last_date ?? null;
  const monthsSinceLastAccident = lastAccidentDate
    ? Math.max(0, Math.floor((Date.now() - new Date(lastAccidentDate).getTime()) / 86400000 / 30))
    : null;

  const content = buildDrivingSafetyGuidance({
    empName: emp.name, dutyDays, breakdown, riskSummary, settings: riskSettings, accidentCount,
    lastAccidentDate, monthsSinceLastAccident,
  });

  const sheet: SafetyGuidanceSheetOptions = {
    name: emp.name, division: emp.division, team: emp.team,
    periodLabel: `直近${months}ヶ月`,
    issuedDateLabel: formatIssuedDateLabel(),
    dutyDays, breakdown, riskSummary, content, accidentCount, monthsSinceLastAccident,
  };

  return c.html(renderSafetyGuidancePrintPage(sheet, `${ADMIN_PATH}/sales-ai/employee/${id}`));
});

export default app;
