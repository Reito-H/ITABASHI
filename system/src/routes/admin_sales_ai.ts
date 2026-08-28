// AI売上分析（全社員横断）— 左サイドバー独立タブ。旧 社員管理→売上分析(全社) サブタブを統合・置き換え。
// 「AI」は表示名のみで、外部AI/LLM APIへの通信は一切行わない（utils/sales_trend_analysis.ts 参照）。
import { Hono } from 'hono';
import { layout } from '../html/layout';
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

// AI売上分析 配下（全社サマリー／売上予想カレンダー／運賃改定影響分析／期間比較）共通のタブナビ
export function salesAiTabNav(active: 'summary' | 'fare-revision' | 'forecast-calendar' | 'period-comparison'): string {
  const tabs: Array<{ id: typeof active; label: string; href: string }> = [
    { id: 'summary', label: '全社サマリー', href: `${ADMIN_PATH}/sales-ai` },
    { id: 'forecast-calendar', label: '売上予想カレンダー', href: `${ADMIN_PATH}/sales-ai/forecast-calendar` },
    { id: 'fare-revision', label: '運賃改定影響分析', href: `${ADMIN_PATH}/sales-ai/fare-revision` },
    { id: 'period-comparison', label: '期間比較', href: `${ADMIN_PATH}/sales-ai/period-comparison` },
  ];
  return `<div class="sai-tabnav">` + tabs.map(t =>
    `<a class="sai-tab-link${t.id === active ? ' active' : ''}" href="${t.href}">${t.label}</a>`
  ).join('') + `</div>`;
}
export const SALES_AI_TABNAV_CSS = `
  .sai-tabnav { display:flex; gap:4px; margin-bottom:14px; border-bottom:1px solid #e5e7eb; }
  .sai-tab-link { padding:9px 16px; font-size:13px; font-weight:600; color:#64748b; text-decoration:none; border-bottom:2px solid transparent; margin-bottom:-1px; }
  .sai-tab-link:hover { color:#1a3a5c; }
  .sai-tab-link.active { color:#1a3a5c; border-bottom-color:#1a3a5c; }
`;

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
  ${SALES_AI_TABNAV_CSS}
</style>
<div style="max-width:1180px;font-family:'Hiragino Sans','Meiryo',sans-serif;">
  ${salesAiTabNav('summary')}
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
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
        <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0;">全社横断の暦要因別 営収差（今月度・実データより）</h3>
        <div style="display:flex;align-items:center;gap:8px;">
          <span id="weather-status-text" style="font-size:11px;color:#9ca3af;"></span>
          <button type="button" id="weather-import-btn" onclick="importMissingWeather()" style="padding:5px 12px;background:#fff;border:1px solid #d1d5db;border-radius:6px;font-size:11.5px;font-weight:600;cursor:pointer;color:#374151;">🌤️ 気象庁データを取込</button>
        </div>
      </div>
      <div style="font-size:10.5px;color:#9ca3af;margin-bottom:10px;">※雨天・猛暑日・冬日は<a href="https://www.data.jma.go.jp/stats/etrn/index.php" target="_blank" style="color:#2563eb;">気象庁（東京）の公開データ</a>を取込んで判定します。未取込の期間は「—」表示になります。売上データがある期間分をまとめて取込めます（月ごとに順番に取込むため、件数が多いと時間がかかります）。</div>
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

function monthsBetween(minDate, maxDate) {
  const out = [];
  let y = parseInt(minDate.slice(0, 4)), m = parseInt(minDate.slice(5, 7));
  const endY = parseInt(maxDate.slice(0, 4)), endM = parseInt(maxDate.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(y + '-' + String(m).padStart(2, '0'));
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

async function refreshWeatherStatus() {
  const el = document.getElementById('weather-status-text');
  const btn = document.getElementById('weather-import-btn');
  try {
    const res = await fetch('/api/sales-ai/weather/status');
    const json = await res.json();
    if (!json.salesDateRange.min) { el.textContent = '売上データがありません'; btn.style.display = 'none'; return; }
    const allMonths = monthsBetween(json.salesDateRange.min, new Date().toISOString().slice(0, 10));
    const importedSet = new Set(json.importedMonths.map(m => m.ym));
    const missing = allMonths.filter(m => !importedSet.has(m));
    if (missing.length === 0) {
      el.textContent = '取込済み（' + allMonths.length + 'ヶ月分）';
      btn.style.display = 'none';
    } else {
      el.textContent = '未取込: ' + missing.length + 'ヶ月分';
      btn.style.display = '';
      btn.dataset.missing = JSON.stringify(missing);
    }
  } catch (err) {
    el.textContent = '';
  }
}

async function importMissingWeather() {
  const btn = document.getElementById('weather-import-btn');
  const missing = JSON.parse(btn.dataset.missing || '[]');
  if (!missing.length) return;
  btn.disabled = true;
  for (let i = 0; i < missing.length; i++) {
    const [y, m] = missing[i].split('-').map(Number);
    btn.textContent = '取込中… (' + (i + 1) + '/' + missing.length + ')';
    try {
      await fetch('/api/sales-ai/weather/import?year=' + y + '&month=' + m, { method: 'POST' });
    } catch (err) { /* 1ヶ月失敗しても続行 */ }
  }
  btn.textContent = '🌤️ 気象庁データを取込';
  btn.disabled = false;
  await refreshWeatherStatus();
  await loadOverview();
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
      '<td style="padding:7px 8px;"><a href="' + ADMIN_PATH + '/crew-portal/employee/' + e.empId + '?tab=insights" style="color:#2563eb;text-decoration:none;font-weight:600;">' + escHtmlJs(e.name) + '</a></td>' +
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
refreshWeatherStatus();
</script>`;

  return c.html(layout('AI売上分析', content, 'sales-ai'));
});

// ===================================================
// 売上予想カレンダー（全社合計・平均日商ベース・ルールベース）
// ===================================================
app.get('/sales-ai/forecast-calendar', async (c) => {
  const content = `
<style>
  ${SALES_AI_TABNAV_CSS}
  .fc-month { background:white; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.08); padding:12px 14px; }
  .fc-month-title { font-size:12.5px; font-weight:700; color:#374151; margin-bottom:8px; }
  .fc-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:2px; }
  .fc-wd { font-size:9.5px; color:#9ca3af; text-align:center; padding-bottom:2px; }
  .fc-cell { position:relative; aspect-ratio:1; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:10.5px; font-weight:600; color:#374151; cursor:pointer; }
  .fc-cell.empty { visibility:hidden; }
  .fc-cell:hover, .fc-cell.selected { outline:2px solid #1a3a5c; outline-offset:-2px; }
  .fc-months { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
  @media (max-width:900px) { .fc-months { grid-template-columns:repeat(2,1fr); } }
  #fc-tooltip { position:fixed; z-index:50; background:#1e293b; color:#fff; font-size:11.5px; line-height:1.6; border-radius:8px; padding:10px 12px; max-width:260px; box-shadow:0 4px 16px rgba(0,0,0,0.25); pointer-events:none; display:none; }
  #fc-detail-panel { display:none; }
  /* 日付見出し・予想額の色はコンテナの背景色に合わせて切り替える（白背景のdetail-panelと濃紺背景のtooltipで共用のため） */
  #fc-detail-panel .fc-detail-title, #fc-detail-panel .fc-detail-headline { color:#1a3a5c; }
  #fc-detail-panel .fc-detail-sub { color:#374151; }
  #fc-tooltip .fc-detail-title { color:#fff; }
  #fc-tooltip .fc-detail-headline { color:#7dd3fc; }
  #fc-tooltip .fc-detail-sub { color:#e2e8f0; }
</style>
<div style="max-width:1180px;font-family:'Hiragino Sans','Meiryo',sans-serif;">
  ${salesAiTabNav('forecast-calendar')}
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
    <div>
      <h2 style="font-size:16px;font-weight:700;color:#1a3a5c;margin:0;">売上予想カレンダー — 全社合計（平均日商）</h2>
      <div style="font-size:11px;color:#9ca3af;margin-top:3px;">過去の実績（曜日別・暦要因別）から組み立てたルールベースの予想です。外部AIへの通信は行いません。天気は将来日には分からないため予想には使用していません。</div>
    </div>
    <div style="display:flex;align-items:center;gap:8px;white-space:nowrap;">
      <button type="button" onclick="changeYear(-1)" style="padding:5px 12px;background:#fff;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;">◀ 前年</button>
      <div id="fc-year-label" style="font-size:13px;font-weight:700;color:#1a3a5c;min-width:70px;text-align:center;"></div>
      <button type="button" onclick="changeYear(1)" style="padding:5px 12px;background:#fff;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;">次年 ▶</button>
    </div>
  </div>

  <div id="fc-loading" style="color:#9ca3af;font-size:13px;margin-top:16px;">読み込み中…</div>
  <div id="fc-content" style="display:none;">
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:14px 20px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:11.5px;color:#6b7280;">平均より低い</span>
        <div style="width:180px;height:12px;border-radius:6px;background:linear-gradient(90deg,#9ec5f4,#f0efec,#f3b2a0);"></div>
        <span style="font-size:11.5px;color:#6b7280;">平均より高い</span>
        <span style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:#6b7280;margin-left:8px;">
          <span style="width:6px;height:6px;border-radius:50%;background:#059669;display:inline-block;"></span>実績が予想以上
          <span style="width:6px;height:6px;border-radius:50%;background:#dc2626;display:inline-block;margin-left:6px;"></span>実績が予想未満
        </span>
      </div>
      <div id="fc-overall-mean" style="font-size:11.5px;color:#6b7280;"></div>
    </div>

    <div id="fc-insufficient" style="display:none;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;font-size:12.5px;color:#78350f;margin-bottom:16px;"></div>

    <div id="fc-detail-panel" style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:14px 20px;margin-bottom:16px;">
      <div id="fc-detail-body" style="font-size:12.5px;color:#374151;line-height:1.8;"></div>
    </div>

    <div id="fc-months" class="fc-months"></div>

    <div style="font-size:10.5px;color:#9ca3af;margin:16px 0 24px;line-height:1.8;">
      ※予想値は「曜日別の平均日商」を基準に、祝日・連休前後・大型連休・忘新年会/送別会シーズン・月末月初・ボーナス月など、事前に分かる暦要因の過去の効果（該当日と非該当日の平均差）を加算して算出した概算です。件数の少ない要因は信頼性が低いため予想モデルから除外しています。実際の売上を保証するものではありません。<br>
      ※雨天・猛暑日・冬日は暦要因別の分析（<a href="${ADMIN_PATH}/sales-ai" style="color:#2563eb;">全社サマリー</a>）でのみ使用しており、将来日が不明なため本カレンダーの予想には含めていません。
    </div>
  </div>
</div>

<div id="fc-tooltip"></div>

<script>
const ADMIN_PATH = '${ADMIN_PATH}';
const MONTH_LABELS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const WD_LABELS = ['日','月','火','水','木','金','土'];
let fcYear = new Date().getFullYear();
let fcData = null;
let fcSelectedDate = null;

function changeYear(delta) {
  fcYear += delta;
  loadForecast();
}

function fcColor(score) {
  const s = Math.max(-1, Math.min(1, score));
  const mix = (a, b, t) => Math.round(a + (b - a) * t);
  const hex = (c) => [1,3,5].map(i => c.slice(i, i + 2));
  const gray = [0xf0, 0xef, 0xec];
  const target = s < 0 ? [0x9e, 0xc5, 0xf4] : [0xf3, 0xb2, 0xa0];
  const t = Math.abs(s);
  const rgb = [0,1,2].map(i => mix(gray[i], target[i], t));
  return 'rgb(' + rgb.join(',') + ')';
}

async function loadForecast() {
  document.getElementById('fc-loading').style.display = '';
  document.getElementById('fc-content').style.display = 'none';
  document.getElementById('fc-year-label').textContent = fcYear + '年';
  try {
    const res = await fetch('/api/sales-ai/forecast-calendar?year=' + fcYear);
    const json = await res.json();
    if (!res.ok) { document.getElementById('fc-loading').textContent = json.error || '読み込みに失敗しました'; return; }
    fcData = json;
    document.getElementById('fc-loading').style.display = 'none';
    document.getElementById('fc-content').style.display = '';

    if (!json.sufficientData) {
      document.getElementById('fc-insufficient').style.display = '';
      document.getElementById('fc-insufficient').textContent = '予想を組み立てるにはデータが不足しています（現在' + json.sampleDayCount + '日分。過去24ヶ月の売上データが蓄積されると自動的に表示されます）。';
      document.getElementById('fc-months').innerHTML = '';
      document.getElementById('fc-overall-mean').textContent = '';
      return;
    }
    document.getElementById('fc-insufficient').style.display = 'none';
    document.getElementById('fc-overall-mean').textContent = '過去' + json.sampleDayCount + '日分の実績から算出（全体平均日商 ' + json.overallMean.toLocaleString('ja-JP') + '円）';

    renderMonths();
    fcSelectedDate = null;
    document.getElementById('fc-detail-panel').style.display = 'none';
  } catch (err) {
    document.getElementById('fc-loading').textContent = '通信エラーが発生しました';
  }
}

function renderMonths() {
  const byDate = new Map(fcData.days.map(d => [d.date, d]));
  const html = [];
  for (let m = 0; m < 12; m++) {
    const first = new Date(fcYear, m, 1);
    const daysInMonth = new Date(fcYear, m + 1, 0).getDate();
    const startWd = first.getDay();
    let cells = '';
    for (let i = 0; i < startWd; i++) cells += '<div class="fc-cell empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = fcYear + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const info = byDate.get(dateStr);
      const bg = info ? fcColor(info.colorScore) : '#f3f4f6';
      const diffDot = info && info.actual !== null
        ? '<span style="position:absolute;top:2px;right:2px;width:6px;height:6px;border-radius:50%;background:' + (info.diffAmount >= 0 ? '#059669' : '#dc2626') + ';"></span>'
        : '';
      cells += '<div class="fc-cell" style="background:' + bg + ';" data-date="' + dateStr + '" ' +
        'onmouseenter="fcShowTooltip(event,\\'' + dateStr + '\\')" onmousemove="fcMoveTooltip(event)" onmouseleave="fcHideTooltip()" ' +
        'onclick="fcSelectDay(\\'' + dateStr + '\\')">' + d + diffDot + '</div>';
    }
    html.push(
      '<div class="fc-month"><div class="fc-month-title">' + MONTH_LABELS[m] + '</div>' +
      '<div class="fc-grid">' + WD_LABELS.map(w => '<div class="fc-wd">' + w + '</div>').join('') + cells + '</div></div>'
    );
  }
  document.getElementById('fc-months').innerHTML = html.join('');
}

function fcDetailHtml(info) {
  const factorsHtml = info.appliedFactors.length
    ? info.appliedFactors.map(f => '<span style="display:inline-block;background:#f1f5f9;color:#334155;border-radius:10px;padding:2px 9px;margin:0 6px 6px 0;font-size:11.5px;">' + f.label + ' <b style="color:' + (f.diffPct >= 0 ? '#047857' : '#b91c1c') + ';">' + (f.diffPct >= 0 ? '+' : '') + f.diffPct + '%</b></span>').join('')
    : '<span style="color:#9ca3af;">該当する暦要因はありません</span>';
  const holidayLine = info.holidayName ? '祝日: ' + info.holidayName + '　' : (info.longHolidayName ? info.longHolidayName + '　' : '');
  const actualHtml = info.actual !== null
    ? '<div class="fc-detail-sub" style="margin-bottom:8px;">実績平均日商: ' + info.actual.toLocaleString('ja-JP') + '円　' +
      '<b style="color:' + (info.diffAmount >= 0 ? '#059669' : '#dc2626') + ';">差異 ' + (info.diffAmount >= 0 ? '+' : '') + info.diffAmount.toLocaleString('ja-JP') + '円（' + (info.diffPct >= 0 ? '+' : '') + info.diffPct + '%）</b></div>'
    : '';
  return '<div class="fc-detail-title" style="font-weight:700;font-size:13px;margin-bottom:4px;">' + info.date + '（' + info.weekdayLabel + '曜）</div>' +
    '<div class="fc-detail-sub" style="margin-bottom:6px;">' + holidayLine + '曜日ベース平均: ' + info.baseWeekdayAvg.toLocaleString('ja-JP') + '円</div>' +
    '<div class="fc-detail-headline" style="font-size:15px;font-weight:700;margin-bottom:8px;">予想平均日商: ' + info.predicted.toLocaleString('ja-JP') + '円</div>' +
    actualHtml +
    '<div>' + factorsHtml + '</div>';
}

function fcShowTooltip(ev, dateStr) {
  const info = fcData && fcData.days.find(d => d.date === dateStr);
  if (!info) return;
  const tip = document.getElementById('fc-tooltip');
  tip.innerHTML = fcDetailHtml(info);
  tip.style.display = 'block';
  fcMoveTooltip(ev);
}
function fcMoveTooltip(ev) {
  const tip = document.getElementById('fc-tooltip');
  if (tip.style.display !== 'block') return;
  const x = Math.min(ev.clientX + 14, window.innerWidth - 280);
  const y = Math.min(ev.clientY + 14, window.innerHeight - 160);
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}
function fcHideTooltip() {
  document.getElementById('fc-tooltip').style.display = 'none';
}

// タップ操作（スマホ・タブレット）向け: クリックで詳細パネルに固定表示
function fcSelectDay(dateStr) {
  const info = fcData && fcData.days.find(d => d.date === dateStr);
  if (!info) return;
  fcSelectedDate = dateStr;
  document.querySelectorAll('.fc-cell.selected').forEach(el => el.classList.remove('selected'));
  const cell = document.querySelector('.fc-cell[data-date="' + dateStr + '"]');
  if (cell) cell.classList.add('selected');
  document.getElementById('fc-detail-panel').style.display = 'block';
  document.getElementById('fc-detail-body').innerHTML = fcDetailHtml(info);
}

loadForecast();
</script>`;

  return c.html(layout('売上予想カレンダー', content, 'sales-ai'));
});

// ===================================================
// 個人詳細（トレンド・相対評価・AI分析）
// 社員カルテ（/crew-portal/employee/:id）の「売上インサイト」タブに統合したため、そちらへリダイレクトする
// ===================================================
app.get('/sales-ai/employee/:id', (c) => {
  return c.redirect(`${ADMIN_PATH}/crew-portal/employee/${c.req.param('id')}?tab=insights`);
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
  return c.html(renderSalesAiReportPrintPage(sheet, `${ADMIN_PATH}/crew-portal/employee/${id}?tab=insights`));
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

  return c.html(renderSafetyGuidancePrintPage(sheet, `${ADMIN_PATH}/crew-portal/employee/${id}?tab=safety`));
});

export default app;
