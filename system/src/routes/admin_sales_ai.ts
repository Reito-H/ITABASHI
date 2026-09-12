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
export function salesAiTabNav(active: 'summary' | 'fare-revision' | 'forecast-calendar' | 'period-comparison' | 'newcomer-growth'): string {
  const tabs: Array<{ id: typeof active; label: string; href: string }> = [
    { id: 'summary', label: '全社サマリー', href: `${ADMIN_PATH}/sales-ai` },
    { id: 'newcomer-growth', label: '新人成長', href: `${ADMIN_PATH}/sales-ai/newcomer-growth` },
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
// 新人成長（初乗務日を起点に 0〜12ヶ月目で自動集計。添付Excel「新人成長.xlsx」の自動版）
// ===================================================
app.get('/sales-ai/newcomer-growth', async (c) => {
  const content = `
<style>
  ${SALES_AI_TABNAV_CSS}
  .ng-card { background:#fff; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.08); padding:18px 20px; margin-bottom:16px; }
  .ng-kpi-grid { display:flex; gap:10px; flex-wrap:wrap; }
  .ng-kpi { flex:1; min-width:130px; background:#f8fafc; border:1px solid #eef2f7; border-radius:8px; padding:10px 14px; }
  .ng-kpi .v { font-size:20px; font-weight:800; color:#1a3a5c; line-height:1.2; }
  .ng-kpi .l { font-size:11px; color:#94a3b8; margin-top:2px; }
  .ng-seg { display:inline-flex; border:1px solid #d1d5db; border-radius:7px; overflow:hidden; }
  .ng-seg button { border:0; background:#fff; padding:6px 12px; font-size:12px; font-weight:600; color:#64748b; cursor:pointer; }
  .ng-seg button.active { background:#1a3a5c; color:#fff; }
  .ng-tbl-wrap { overflow-x:auto; }
  table.ng-tbl { border-collapse:collapse; font-size:12px; white-space:nowrap; }
  table.ng-tbl th, table.ng-tbl td { border:1px solid #e5e7eb; padding:5px 8px; text-align:right; }
  table.ng-tbl th:first-child, table.ng-tbl td:first-child { text-align:left; position:sticky; left:0; background:#fff; z-index:1; }
  table.ng-tbl thead th { background:#f1f5f9; color:#475569; text-align:center; }
  table.ng-tbl tr.ng-cohort td { background:#fff7ed; font-weight:700; color:#9a3412; }
  table.ng-tbl tr.ng-retired td:first-child { color:#9ca3af; }
  .ng-badge { display:inline-block; font-size:10px; padding:1px 5px; border-radius:4px; margin-left:5px; vertical-align:middle; }
  .ng-badge.k { background:#eef2ff; color:#4338ca; }
  .ng-badge.e { background:#ecfeff; color:#0e7490; }
  .ng-badge.r { background:#f3f4f6; color:#6b7280; }
  .ng-tl { display:flex; align-items:center; gap:1px; }
  .ng-tl .seg { width:20px; height:16px; border-radius:3px; background:#f1f5f9; display:inline-flex; align-items:center; justify-content:center; font-size:9px; }
  .ng-tl .seg.acc { background:#fee2e2; }
  .ng-tl .seg.vio { background:#ffedd5; }
  .ng-tl .seg.both { background:#fecaca; }
  .ng-mini { font-size:11px; color:#64748b; }
  .ng-btn { padding:6px 12px; background:#fff; border:1px solid #d1d5db; border-radius:6px; font-size:12px; cursor:pointer; }
  .ng-btn:hover { background:#f8fafc; }
</style>
<div style="max-width:1180px;font-family:'Hiragino Sans','Meiryo',sans-serif;">
  ${salesAiTabNav('newcomer-growth')}

  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
    <div>
      <h2 style="font-size:16px;font-weight:700;color:#1a3a5c;margin:0;">新人成長 — 初乗務からの推移</h2>
      <div style="font-size:11px;color:#9ca3af;margin-top:3px;">0〜12ヶ月目は常に「乗務スタート日」起点。年度の絞り込み基準だけを乗務スタート日／入社日で切替できます。売上・安全運転・事故/違反記録から自動生成（ルールベース・外部AI通信なし）</div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;white-space:nowrap;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:11px;color:#94a3b8;">年度の基準</span>
        <div class="ng-seg" id="ng-basis-seg">
          <button data-b="duty" class="active" onclick="setBasis('duty')">乗務スタート日</button>
          <button data-b="hire" onclick="setBasis('hire')">入社日</button>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button type="button" class="ng-btn" onclick="changeFy(-1)">◀ 前年度</button>
        <div id="ng-fy-label" style="font-size:13px;font-weight:700;color:#1a3a5c;min-width:110px;text-align:center;"></div>
        <button type="button" class="ng-btn" onclick="changeFy(1)">次年度 ▶</button>
      </div>
    </div>
  </div>

  <div id="ng-loading" style="color:#9ca3af;font-size:13px;margin:20px 0;">読み込み中…</div>
  <div id="ng-body" style="display:none;">
    <div class="ng-card">
      <div class="ng-kpi-grid" id="ng-kpi"></div>
      <div style="font-size:11px;color:#9ca3af;margin-top:8px;">乗務数は隔日勤務=1.0／日勤=0.5で集計しています。安全運転データはホシコン形式CSVを取り込んだ期間のみ数値が入ります。</div>
    </div>

    <div class="ng-card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:#334155;">成長カーブ（同年度の新人全体の平均）</div>
        <div class="ng-seg" id="ng-chart-seg">
          <button data-m="avgPerShift" class="active" onclick="setChartMetric('avgPerShift')">1乗務あたり売上</button>
          <button data-m="distancePerShift" onclick="setChartMetric('distancePerShift')">走行キロ／乗務</button>
          <button data-m="harshPerShift" onclick="setChartMetric('harshPerShift')">急運転／乗務</button>
        </div>
      </div>
      <div id="ng-chart"></div>
      <div class="ng-mini" style="margin-top:6px;">太線＝新人全体の平均。細い灰色線＝新人ひとりずつの推移。</div>
    </div>

    <div class="ng-card">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;color:#334155;">個人別 推移表</div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <div class="ng-seg" id="ng-table-seg">
            <button data-m="total" onclick="setTableMetric('total')">総売上</button>
            <button data-m="shifts" onclick="setTableMetric('shifts')">乗務数</button>
            <button data-m="avgPerShift" class="active" onclick="setTableMetric('avgPerShift')">月平均</button>
            <button data-m="distancePerShift" onclick="setTableMetric('distancePerShift')">走行キロ平均</button>
            <button data-m="harshPerShift" onclick="setTableMetric('harshPerShift')">急運転(回/乗務)</button>
            <button data-m="speedingDays" onclick="setTableMetric('speedingDays')">速度超過日数</button>
          </div>
          <button type="button" class="ng-btn" onclick="downloadCsv()">CSV出力</button>
          <button type="button" class="ng-btn" onclick="window.print()">印刷</button>
        </div>
      </div>
      <div class="ng-tbl-wrap"><table class="ng-tbl" id="ng-table"></table></div>
    </div>

    <div class="ng-card">
      <div style="font-size:13px;font-weight:700;color:#334155;margin-bottom:4px;">安全・事故タイムライン</div>
      <div class="ng-mini" style="margin-bottom:10px;">赤＝事故／橙＝違反。数字は初乗務からの月目。事故・違反の記録がある新人のみ表示します。</div>
      <div id="ng-safety"></div>
    </div>
  </div>
</div>

<script>
const ADMIN_PATH = '${ADMIN_PATH}';
const NG_LABELS = [];
for (let i = 0; i <= 12; i++) NG_LABELS.push(i + 'ヶ月目');
const state = { data: null, fy: null, basis: 'duty', chartMetric: 'avgPerShift', tableMetric: 'avgPerShift' };

function esc(s) { const d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML; }
function fmtYen(n) { return n == null ? '–' : '¥' + Math.round(n).toLocaleString('ja-JP'); }
function fmtInt(n) { return n == null ? '–' : Math.round(n).toLocaleString('ja-JP'); }
function fmt1(n) { return n == null ? '–' : (Math.round(n * 10) / 10).toLocaleString('ja-JP'); }
function divTeam(p) { return (p.division ? p.division + '課' : '–') + (p.team ? p.team + '班' : ''); }

function metricVal(b, m) {
  if (!b) return null;
  if (m === 'total') return b.total || null;
  if (m === 'shifts') return b.shifts || null;
  return b[m];
}
function metricFmt(m) {
  if (m === 'total' || m === 'avgPerShift') return fmtYen;
  if (m === 'shifts' || m === 'distancePerShift' || m === 'harshPerShift') return fmt1;
  return fmtInt;
}

async function load(fy) {
  document.getElementById('ng-loading').style.display = '';
  document.getElementById('ng-body').style.display = 'none';
  const q = '?basis=' + state.basis + (fy ? ('&fy=' + fy) : '');
  const res = await fetch('/api/sales-ai/newcomer-growth' + q, { credentials: 'same-origin' });
  const data = await res.json();
  state.data = data;
  state.fy = data.fiscalYear;
  document.getElementById('ng-fy-label').textContent = data.fiscalYear + '年度';
  document.getElementById('ng-loading').style.display = 'none';
  document.getElementById('ng-body').style.display = '';
  renderKpi(); renderChart(); renderTable(); renderSafety();
}
function changeFy(delta) {
  const yrs = state.data ? state.data.availableFiscalYears : [];
  const idx = yrs.indexOf(state.fy);
  if (idx < 0) return;
  const next = yrs[idx + delta];
  if (next == null) return;
  load(next);
}
function setBasis(b) {
  if (state.basis === b) return;
  state.basis = b;
  document.querySelectorAll('#ng-basis-seg button').forEach(x => x.classList.toggle('active', x.dataset.b === b));
  load(null);
}

function renderKpi() {
  const d = state.data;
  const people = d.people;
  const active = people.filter(p => p.active).length;
  const retired = people.length - active;
  const accTotal = people.reduce((s, p) => s + p.accidents.length, 0);
  const vioTotal = people.reduce((s, p) => s + p.violations.length, 0);
  const c12 = d.cohort[12] || {};
  const c1 = d.cohort[1] || {};
  const rows = [
    { v: people.length + '名', l: '対象の新人（' + d.fiscalYear + '年度に' + (d.basis === 'hire' ? '入社' : '初乗務') + '）' },
    { v: active + '名', l: '在籍中' },
    { v: retired + '名', l: '退職' },
    { v: fmtYen(c1.avgOfAvgPerShift), l: '1ヶ月目の平均（1乗務あたり売上）' },
    { v: fmtYen(c12.avgOfAvgPerShift), l: '12ヶ月目の平均（1乗務あたり売上）' },
    { v: accTotal + '件 / ' + vioTotal + '件', l: '事故 / 違反（対象年度内）' },
  ];
  document.getElementById('ng-kpi').innerHTML = rows.map(r =>
    '<div class="ng-kpi"><div class="v">' + esc(r.v) + '</div><div class="l">' + esc(r.l) + '</div></div>'
  ).join('');
}

function seriesForChart(m) {
  const d = state.data;
  const cohortKey = m === 'avgPerShift' ? 'avgOfAvgPerShift' : (m === 'distancePerShift' ? 'avgDistancePerShift' : 'avgHarshPerShift');
  const cohort = d.cohort.map(c => c[cohortKey]);
  const persons = d.people.map(p => p.buckets.map(b => metricVal(b, m)));
  return { cohort: cohort, persons: persons };
}

function renderChart() {
  const m = state.chartMetric;
  const s = seriesForChart(m);
  const W = 900, H = 320, padL = 64, padR = 16, padT = 14, padB = 34;
  const iw = W - padL - padR, ih = H - padT - padB;
  let maxY = 0;
  s.cohort.forEach(v => { if (v != null && v > maxY) maxY = v; });
  s.persons.forEach(arr => arr.forEach(v => { if (v != null && v > maxY) maxY = v; }));
  if (maxY <= 0) maxY = 1;
  maxY = maxY * 1.1;
  const x = i => padL + (iw * i / 12);
  const y = v => padT + ih - (ih * v / maxY);
  const fmt = metricFmt(m);

  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;font-family:inherit;">';
  // y gridlines
  for (let g = 0; g <= 4; g++) {
    const gy = padT + ih * g / 4;
    const gv = maxY * (1 - g / 4);
    svg += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#eef2f7"/>';
    svg += '<text x="' + (padL - 8) + '" y="' + (gy + 4) + '" text-anchor="end" font-size="10" fill="#94a3b8">' + esc(fmt(gv)) + '</text>';
  }
  // x labels
  for (let i = 0; i <= 12; i++) {
    svg += '<text x="' + x(i) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="10" fill="#94a3b8">' + i + '</text>';
  }
  svg += '<text x="' + (padL + iw / 2) + '" y="' + H + '" text-anchor="middle" font-size="10" fill="#cbd5e1">初乗務からの月目</text>';
  // person lines
  s.persons.forEach(arr => {
    let dpath = '', started = false;
    arr.forEach((v, i) => {
      if (v == null) { started = false; return; }
      dpath += (started ? ' L ' : ' M ') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
      started = true;
    });
    if (dpath) svg += '<path d="' + dpath + '" fill="none" stroke="#94a3b8" stroke-width="1" opacity="0.18"/>';
  });
  // cohort line
  let cpath = '', cstarted = false;
  const pts = [];
  s.cohort.forEach((v, i) => {
    if (v == null) { cstarted = false; return; }
    cpath += (cstarted ? ' L ' : ' M ') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
    cstarted = true;
    pts.push([x(i), y(v), v, i]);
  });
  if (cpath) svg += '<path d="' + cpath + '" fill="none" stroke="#1a3a5c" stroke-width="2.5"/>';
  pts.forEach(p => {
    svg += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.2" fill="#1a3a5c"><title>' + p[3] + 'ヶ月目: ' + esc(fmt(p[2])) + '</title></circle>';
  });
  svg += '</svg>';
  document.getElementById('ng-chart').innerHTML = svg;
}
function setChartMetric(m) {
  state.chartMetric = m;
  document.querySelectorAll('#ng-chart-seg button').forEach(b => b.classList.toggle('active', b.dataset.m === m));
  renderChart();
}

function renderTable() {
  const d = state.data;
  const m = state.tableMetric;
  const fmt = metricFmt(m);
  let h = '<thead><tr><th>課班 / 氏名</th>';
  for (let i = 0; i <= 12; i++) h += '<th>' + i + 'ヶ月</th>';
  h += '</tr></thead><tbody>';

  // コホート平均行（月平均の平均 / 月平均走行キロ は Excel と同じ固定行）
  h += '<tr class="ng-cohort"><td>新人全体：月平均の平均</td>' +
    d.cohort.map(c => '<td>' + esc(fmtYen(c.avgOfAvgPerShift)) + '</td>').join('') + '</tr>';
  h += '<tr class="ng-cohort"><td>新人全体：月平均走行キロ</td>' +
    d.cohort.map(c => '<td>' + esc(fmt1(c.avgDistancePerShift)) + '</td>').join('') + '</tr>';

  d.people.forEach(p => {
    const badge = p.entryType === 'キャリア' ? '<span class="ng-badge k">キャリア</span>'
      : p.entryType === '縁故' ? '<span class="ng-badge e">縁故</span>' : '';
    const rb = !p.active ? '<span class="ng-badge r">退職</span>' : '';
    h += '<tr' + (!p.active ? ' class="ng-retired"' : '') + '><td>' +
      '<span style="color:#94a3b8;font-size:11px;">' + esc(divTeam(p)) + '</span> ' +
      '<a href="' + ADMIN_PATH + '/crew-portal/employee/' + p.empId + '?tab=insights" style="color:#2563eb;text-decoration:none;font-weight:600;">' + esc(p.name) + '</a>' +
      badge + rb + '</td>';
    h += p.buckets.map(b => {
      const v = metricVal(b, m);
      return '<td>' + (v == null ? '<span style="color:#cbd5e1;">–</span>' : esc(fmt(v))) + '</td>';
    }).join('');
    h += '</tr>';
  });
  h += '</tbody>';
  document.getElementById('ng-table').innerHTML = h;
}
function setTableMetric(m) {
  state.tableMetric = m;
  document.querySelectorAll('#ng-table-seg button').forEach(b => b.classList.toggle('active', b.dataset.m === m));
  renderTable();
}

function renderSafety() {
  const d = state.data;
  const rows = d.people.filter(p => p.accidents.length || p.violations.length);
  if (!rows.length) {
    document.getElementById('ng-safety').innerHTML = '<div class="ng-mini">対象年度の新人に事故・違反の記録はありません。</div>';
    return;
  }
  let h = '';
  rows.forEach(p => {
    const byIdx = {};
    p.accidents.forEach(a => { const k = a.monthIndex == null ? 'x' : a.monthIndex; (byIdx[k] = byIdx[k] || { acc: [], vio: [] }).acc.push(a); });
    p.violations.forEach(v => { const k = v.monthIndex == null ? 'x' : v.monthIndex; (byIdx[k] = byIdx[k] || { acc: [], vio: [] }).vio.push(v); });
    let tl = '<div class="ng-tl">';
    for (let i = 0; i <= 12; i++) {
      const c = byIdx[i];
      let cls = 'seg', txt = '';
      if (c && c.acc.length && c.vio.length) { cls += ' both'; txt = String(c.acc.length + c.vio.length); }
      else if (c && c.acc.length) { cls += ' acc'; txt = String(c.acc.length); }
      else if (c && c.vio.length) { cls += ' vio'; txt = String(c.vio.length); }
      const tips = [];
      if (c) { c.acc.forEach(a => tips.push('事故 ' + a.date + (a.category ? ' ' + a.category : ''))); c.vio.forEach(v => tips.push('違反 ' + v.date + (v.typeName ? ' ' + v.typeName : ''))); }
      tl += '<span class="' + cls + '" title="' + esc(tips.join(' / ')) + '">' + txt + '</span>';
    }
    tl += '</div>';
    const list = [];
    p.accidents.forEach(a => list.push('事故 ' + a.date + (a.monthIndex != null ? '（' + a.monthIndex + 'ヶ月目）' : '') + (a.category ? ' ' + a.category : '')));
    p.violations.forEach(v => list.push('違反 ' + v.date + (v.monthIndex != null ? '（' + v.monthIndex + 'ヶ月目）' : '') + (v.typeName ? ' ' + v.typeName : '') + (v.points != null ? ' ' + v.points + '点' : '')));
    h += '<div style="padding:10px 0;border-top:1px solid #f1f5f9;">' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
      '<div style="min-width:150px;"><span style="color:#94a3b8;font-size:11px;">' + esc(divTeam(p)) + '</span> ' +
      '<a href="' + ADMIN_PATH + '/crew-portal/employee/' + p.empId + '?tab=safety" style="color:#2563eb;text-decoration:none;font-weight:600;">' + esc(p.name) + '</a></div>' +
      tl + '</div>' +
      '<div class="ng-mini" style="margin-top:5px;">' + esc(list.join(' ／ ')) + '</div>' +
      '</div>';
  });
  document.getElementById('ng-safety').innerHTML = h;
}

function downloadCsv() {
  const d = state.data;
  const lines = [];
  const head = ['課', '班', '社員番号', '氏名', '入社年月日', '初乗務日', '退職年月日', '項目'];
  for (let i = 0; i <= 12; i++) head.push(i + 'ヶ月目');
  lines.push(head);
  lines.push(['', '', '', '', '', '', '', '月平均の平均'].concat(d.cohort.map(c => c.avgOfAvgPerShift == null ? '' : c.avgOfAvgPerShift)));
  lines.push(['', '', '', '', '', '', '', '月平均走行キロ'].concat(d.cohort.map(c => c.avgDistancePerShift == null ? '' : c.avgDistancePerShift)));
  d.people.forEach(p => {
    const base = [p.division || '', p.team || '', p.empNo, p.name, p.hireDate || '', p.firstDutyDate, p.retirementDate || ''];
    const push = (label, fn) => lines.push(base.concat([label]).concat(p.buckets.map(fn)));
    push('総売上', b => b.total || '');
    push('乗務数', b => b.shifts || '');
    push('月平均', b => b.avgPerShift == null ? '' : b.avgPerShift);
    push('走行キロ平均', b => b.distancePerShift == null ? '' : b.distancePerShift);
    push('急運転(回/乗務)', b => b.harshPerShift == null ? '' : b.harshPerShift);
    push('速度超過日数', b => b.speedingDays || '');
  });
  const csv = lines.map(r => r.map(v => {
    const s = String(v);
    return /[",\\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\\r\\n');
  const blob = new Blob(['\\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '新人成長_' + d.fiscalYear + '年度.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

load(null);
</script>`;

  return c.html(layout('新人成長', content, 'sales-ai'));
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
