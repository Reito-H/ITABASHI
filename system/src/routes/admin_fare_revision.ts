// 運賃改定影響分析 — AI売上分析ページの新規タブ。
// 2026-04-20の運賃改定（約10%値上げ）前後で、乗務員一人ひとりの売上・労働時間がどう変化したかを
// ルールベースで分析する（外部AI/LLM APIへの通信は一切行わない。admin_sales_ai.ts と同方針）。
import { Hono } from 'hono';
import { layout } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';
import { salesAiTabNav, SALES_AI_TABNAV_CSS } from './admin_sales_ai';
import { settingsSubHeader } from './admin';
import { computeFareRevisionOverview, computeFareRevisionEmployee } from './api/fare_revision';
import { renderFareRevisionOverviewPrintPage, renderFareRevisionEmployeePrintPage } from '../html/fare_revision_print';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

function formatPrintedAtLabel(): string {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

app.get('/sales-ai/fare-revision', async (c) => {
  const content = `
<style>
  ${SALES_AI_TABNAV_CSS}
  .frv-card { background:white; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.08); padding:18px 20px; margin-bottom:14px; }
  .frv-kpi-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-bottom:14px; }
  .frv-kpi { background:white; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.08); padding:12px 14px; }
  .frv-kpi-label { font-size:10.5px; color:#9ca3af; margin-bottom:4px; }
  .frv-kpi-val { font-size:19px; font-weight:700; color:#1a3a5c; }
  .frv-kpi-sub { font-size:10.5px; color:#6b7280; margin-top:2px; }
  .frv-toolbar { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; }
  .frv-field { display:flex; flex-direction:column; gap:3px; }
  .frv-field label { font-size:10.5px; color:#6b7280; font-weight:700; }
  .frv-field input, .frv-field select { border:1px solid #d1d5db; border-radius:6px; padding:6px 8px; font-size:12px; }
  .frv-field input[disabled] { background:#f3f4f6; color:#9ca3af; }
  .frv-btn { border:none; border-radius:6px; padding:7px 16px; font-size:12px; font-weight:700; cursor:pointer; }
  .frv-btn-primary { background:#1a3a5c; color:#fff; }
  .frv-btn-ghost { background:#fff; border:1px solid #d1d5db; color:#374151; }
  .frv-view-toggle { display:flex; gap:6px; margin:14px 0; justify-content:space-between; align-items:center; flex-wrap:wrap; }
  .frv-view-toggle-left { display:flex; gap:6px; }
  .frv-view-btn { padding:8px 18px; border-radius:8px; border:1px solid #d1d5db; background:#fff; color:#374151; font-size:12.5px; font-weight:700; cursor:pointer; }
  .frv-view-btn.active { background:#1a3a5c; color:#fff; border-color:#1a3a5c; }
  .frv-subtabnav { display:flex; gap:4px; margin-bottom:14px; border-bottom:1px solid #e5e7eb; flex-wrap:wrap; }
  .frv-subtab-btn { padding:8px 14px; font-size:12.5px; font-weight:600; color:#64748b; background:none; border:none; border-bottom:2px solid transparent; margin-bottom:-1px; cursor:pointer; }
  .frv-subtab-btn:hover { color:#1a3a5c; }
  .frv-subtab-btn.active { color:#1a3a5c; border-bottom-color:#1a3a5c; }
  .frv-period-note { font-size:11px; color:#6b7280; margin-top:8px; }
  .frv-table { width:100%; border-collapse:collapse; font-size:12px; }
  .frv-table th { padding:6px 8px; text-align:left; color:#6b7280; border-bottom:1px solid #e5e7eb; white-space:nowrap; }
  .frv-table td { padding:7px 8px; border-bottom:1px solid #f3f4f6; }
  .frv-table tr.frv-row-clickable { cursor:pointer; }
  .frv-table tr.frv-row-clickable:hover { background:#f8fafc; }
  .frv-advanced { display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #e5e7eb; }
  .frv-advanced.open { display:flex; flex-wrap:wrap; gap:10px; }
  .frv-coverage { font-size:11px; color:#6b7280; margin-top:6px; }
  .frv-reasoning { list-style:none; padding:0; margin:10px 0 0; font-size:12.5px; line-height:1.7; color:#374151; }
  .frv-reasoning li { padding:6px 10px; background:#f8fafc; border-radius:6px; margin-bottom:6px; }
  .frv-reasoning li.frv-flag { background:#fff7ed; color:#9a3412; font-weight:600; }
  .frv-search-wrap { position:relative; max-width:320px; }
</style>
<div style="max-width:1180px;font-family:'Hiragino Sans','Meiryo',sans-serif;">
  ${salesAiTabNav('fare-revision')}
  <div style="margin-bottom:10px;">
    <h2 style="font-size:16px;font-weight:700;color:#1a3a5c;margin:0;">運賃改定影響分析</h2>
    <div style="font-size:11.5px;color:#6b7280;margin-top:4px;line-height:1.6;">2026年4月からの運賃値上げ（約10%）で、売上や働いた時間がどのように変わったかを自動で分かりやすく分析します。外部のAIサービスには一切接続していません。</div>
  </div>

  <div class="frv-card">
    <div class="frv-toolbar">
      <div class="frv-field">
        <label>運賃改定後の期間（開始）</label>
        <input type="date" id="after-start">
      </div>
      <div class="frv-field">
        <label>運賃改定後の期間（終了）</label>
        <input type="date" id="after-end">
      </div>
      <div class="frv-field">
        <label>課</label>
        <select id="division-filter"><option value="">全課</option><option value="1">1課</option><option value="2">2課</option><option value="3">3課</option><option value="4">4課</option></select>
      </div>
      <div class="frv-field">
        <label>班</label>
        <select id="team-filter"><option value="">全班</option><option value="1">1班</option><option value="2">2班</option><option value="3">3班</option><option value="4">4班</option><option value="5">5班</option><option value="6">6班</option><option value="7">7班</option><option value="8">8班</option></select>
      </div>
      <div class="frv-field">
        <label>勤務区分</label>
        <select id="duty-filter"><option value="">全区分</option><option value="a">昼日(a)</option><option value="b">夜日(b)</option><option value="B">隔日(B)</option><option value="D">隔日(D)</option><option value="H">隔日(H)</option></select>
      </div>
      <button type="button" class="frv-btn frv-btn-primary" onclick="applyFilters()">この条件で見る</button>
      <button type="button" class="frv-btn frv-btn-ghost" onclick="toggleAdvanced()">くわしい設定 ▾</button>
    </div>
    <div id="advanced-panel" class="frv-advanced">
      <div class="frv-field"><label>目標にする達成率(%)</label><input type="number" id="achievement-threshold" value="110" style="width:70px;"></div>
      <div class="frv-field"><label>売上がこの範囲なら「ほぼ変わらない」とみなす(100±%)</label><input type="number" id="sales-flat-band" value="8" style="width:60px;"></div>
      <div class="frv-field"><label>働いた時間がこれより減ったら「減った」と判定(%)</label><input type="number" id="labor-hours-drop" value="97" style="width:70px;"></div>
      <div class="frv-field"><label>判定に必要な最低の乗務日数（各期間）</label><input type="number" id="min-duty-days" value="5" style="width:60px;"></div>
      <div class="frv-field"><label>労働時間データが必要な最低の割合(%)</label><input type="number" id="min-labor-coverage-pct" value="50" style="width:60px;"></div>
    </div>
    <div id="period-note" class="frv-period-note"></div>
  </div>

  <div class="frv-view-toggle frv-no-print">
    <div class="frv-view-toggle-left">
      <button type="button" id="btn-view-overview" class="frv-view-btn active" onclick="switchView('overview')">全体</button>
      <button type="button" id="btn-view-individual" class="frv-view-btn" onclick="switchView('individual')">個人</button>
    </div>
    <button type="button" class="frv-btn frv-btn-ghost" onclick="printCurrentView()">🖨 今の画面を印刷</button>
  </div>

  <div id="loading" style="color:#9ca3af;font-size:13px;">読み込み中…</div>

  <div id="view-overview" style="display:none;">
    <div class="frv-subtabnav frv-no-print" id="ov-subtabnav">
      <button type="button" class="frv-subtab-btn active" data-sub="summary" onclick="switchOverviewSub('summary')">サマリー</button>
      <button type="button" class="frv-subtab-btn" data-sub="breakdown" onclick="switchOverviewSub('breakdown')">課・班・勤務別</button>
      <button type="button" class="frv-subtab-btn" data-sub="flagged" onclick="switchOverviewSub('flagged')">早めに切り上げていそうな人</button>
      <button type="button" class="frv-subtab-btn" data-sub="allemp" onclick="switchOverviewSub('allemp')">社員ごとの一覧</button>
    </div>

    <div id="ov-sub-summary" class="frv-subpanel">
      <div id="kpi-row" class="frv-kpi-row"></div>
      <div class="frv-card">
        <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 4px;">1日あたり売上の伸び具合の分布（人数）</h3>
        <div style="font-size:11px;color:#9ca3af;margin-bottom:8px;">横軸は「後の期間の売上 ÷ 前の期間の売上」の割合です。100%より右なら売上が伸びた人です。</div>
        <canvas id="histogram-chart" height="70"></canvas>
      </div>
      <div id="coverage-note" class="frv-coverage"></div>
    </div>

    <div id="ov-sub-breakdown" class="frv-subpanel" style="display:none;">
      <div style="display:flex;gap:14px;margin-bottom:14px;flex-wrap:wrap;">
        <div class="frv-card" style="flex:1;min-width:220px;">
          <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">課ごとの1日あたり売上の伸び（平均）</h3>
          <table class="frv-table"><thead><tr><th>課</th><th>平均の伸び</th><th>人数</th></tr></thead><tbody id="division-tbody"></tbody></table>
        </div>
        <div class="frv-card" style="flex:1;min-width:220px;">
          <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">班ごとの1日あたり売上の伸び（平均）</h3>
          <table class="frv-table"><thead><tr><th>班</th><th>平均の伸び</th><th>人数</th></tr></thead><tbody id="team-tbody"></tbody></table>
        </div>
        <div class="frv-card" style="flex:1;min-width:220px;">
          <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">勤務の種類ごとの1日あたり売上の伸び（平均）</h3>
          <table class="frv-table"><thead><tr><th>種類</th><th>平均の伸び</th><th>人数</th></tr></thead><tbody id="duty-tbody"></tbody></table>
        </div>
      </div>
    </div>

    <div id="ov-sub-flagged" class="frv-subpanel" style="display:none;">
      <div class="frv-card">
        <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 4px;">早めに切り上げていそうな人（一覧）</h3>
        <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">売上は運賃改定前とほぼ変わっていないのに、働いた時間がはっきり短くなっている人です。いつもの目標額に早く届いて、早めに仕事を切り上げているのかもしれません。行をクリックすると、その人の詳しい状況を見られます。</div>
        <table class="frv-table">
          <thead><tr><th>氏名</th><th>課/班</th><th id="th-flagged-before">前の1日平均売上</th><th id="th-flagged-after">後の1日平均売上</th><th>1日あたり売上の伸び</th><th>単価の伸び</th><th>1乗務あたり労働時間の伸び</th><th>確からしさ</th></tr></thead>
          <tbody id="flagged-tbody"></tbody>
        </table>
        <div id="flagged-empty" style="display:none;font-size:12px;color:#9ca3af;padding:10px 0;">該当する人はいません。</div>
      </div>
    </div>

    <div id="ov-sub-allemp" class="frv-subpanel" style="display:none;">
      <div class="frv-subtabnav frv-no-print" id="allemp-category-nav">
        <button type="button" class="frv-subtab-btn active" data-cat="above" onclick="switchAllEmpCategory('above')">目標達成 <span id="cat-count-above"></span></button>
        <button type="button" class="frv-subtab-btn" data-cat="met" onclick="switchAllEmpCategory('met')">伸びたが未達 <span id="cat-count-met"></span></button>
        <button type="button" class="frv-subtab-btn" data-cat="below" onclick="switchAllEmpCategory('below')">減少 <span id="cat-count-below"></span></button>
        <button type="button" class="frv-subtab-btn" data-cat="insufficient_data" onclick="switchAllEmpCategory('insufficient_data')">データ不足 <span id="cat-count-insufficient_data"></span></button>
      </div>
      <div class="frv-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
          <h3 id="allemp-title" style="font-size:13px;font-weight:700;color:#374151;margin:0;">社員ごとの一覧</h3>
          <div style="display:flex;gap:8px;" class="frv-no-print">
            <input type="text" id="all-emp-search" placeholder="社員名で検索" oninput="renderAllEmployeesTable()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;">
            <select id="all-emp-sort" onchange="renderAllEmployeesTable()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;">
              <option value="growth-asc">1日あたり売上の伸び 低い順</option>
              <option value="growth-desc">1日あたり売上の伸び 高い順</option>
              <option value="name-asc">名前順</option>
            </select>
          </div>
        </div>
        <table class="frv-table">
          <thead><tr><th>氏名</th><th>課/班</th><th>勤務の種類</th><th>1日あたり売上の伸び</th><th id="th-allemp-before">前の1日平均売上</th><th id="th-allemp-after">後の1日平均売上</th><th>1乗務あたり労働時間の伸び</th></tr></thead>
          <tbody id="all-emp-tbody"></tbody>
        </table>
        <div id="all-emp-empty" style="display:none;font-size:12px;color:#9ca3af;padding:10px 0;">該当する人はいません。</div>
      </div>
    </div>
  </div>

  <div id="view-individual" style="display:none;">
    <div class="frv-card frv-no-print">
      <div class="frv-search-wrap">
        <input type="text" id="individual-search" list="emp-datalist" placeholder="社員名を入力して選んでください" oninput="onIndividualSearchInput()" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
        <datalist id="emp-datalist"></datalist>
      </div>
    </div>
    <div id="individual-empty" style="color:#9ca3af;font-size:13px;">社員を選択してください。</div>
    <div id="individual-content" style="display:none;">
      <div class="frv-subtabnav frv-no-print">
        <button type="button" class="frv-subtab-btn active" data-sub="summary" onclick="switchEmpSub('summary')">サマリー</button>
        <button type="button" class="frv-subtab-btn" data-sub="reasoning" onclick="switchEmpSub('reasoning')">判定理由</button>
        <button type="button" class="frv-subtab-btn" data-sub="daily" onclick="switchEmpSub('daily')">日ごとの記録</button>
      </div>

      <div id="emp-sub-summary" class="frv-subpanel">
        <div id="emp-kpi-row" class="frv-kpi-row"></div>
        <div class="frv-card">
          <h3 id="emp-chart-title" style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">売上の移り変わり</h3>
          <canvas id="emp-chart" height="90"></canvas>
        </div>
      </div>

      <div id="emp-sub-reasoning" class="frv-subpanel" style="display:none;">
        <div class="frv-card">
          <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 6px;">なぜこの判定になったか（自動作成の説明）</h3>
          <ul id="emp-reasoning" class="frv-reasoning"></ul>
        </div>
      </div>

      <div id="emp-sub-daily" class="frv-subpanel" style="display:none;">
        <div class="frv-card">
          <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">日ごとの記録</h3>
          <div style="max-height:420px;overflow-y:auto;">
            <table class="frv-table">
              <thead><tr><th>いつの期間</th><th>日付</th><th>売上</th><th>働いた時間</th><th>記録の種類</th><th>帰る時刻</th></tr></thead>
              <tbody id="emp-daily-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js" crossorigin="anonymous"></script>
<script>
const ADMIN_PATH = '${ADMIN_PATH}';
let overviewData = null;
let currentEmpId = null;
let histogramChart = null;
let empChart = null;
let currentPeriods = null;
let currentOverviewSub = 'summary';
let currentEmpSub = 'summary';
let currentAllEmpCategory = 'above';

function escHtmlJs(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
function fmtPct(v) { return (v === null || v === undefined) ? '—' : v + '%'; }
function fmtYen(v) { return (v === null || v === undefined) ? '—' : v.toLocaleString('ja-JP') + '円'; }
function pctColor(v) {
  if (v === null || v === undefined) return '#6b7280';
  if (v >= 110) return '#16a34a';
  if (v >= 100) return '#b45309';
  return '#dc2626';
}
const CATEGORY_LABELS = { above: '目標達成', met: '伸びたが未達', below: '減少', insufficient_data: 'データ不足' };

function toggleAdvanced() {
  document.getElementById('advanced-panel').classList.toggle('open');
}

function toCamel(id) {
  return id.replace(/-([a-z])/g, function(_, ch) { return ch.toUpperCase(); });
}
function buildQueryString() {
  const params = new URLSearchParams();
  ['after-start', 'after-end'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el && el.value) params.set(toCamel(id), el.value);
  });
  const division = document.getElementById('division-filter').value;
  if (division) params.set('division', division);
  const team = document.getElementById('team-filter').value;
  if (team) params.set('team', team);
  const duty = document.getElementById('duty-filter').value;
  if (duty) params.set('dutyCode', duty);
  const thresholdIds = {
    'achievement-threshold': 'achievementThresholdPct',
    'sales-flat-band': 'salesFlatBandPct',
    'labor-hours-drop': 'laborHoursDropThresholdPct',
    'min-duty-days': 'minDutyDaysPerPeriod',
  };
  Object.keys(thresholdIds).forEach(function(id) {
    const el = document.getElementById(id);
    if (el && el.value !== '') params.set(thresholdIds[id], el.value);
  });
  const coveragePct = document.getElementById('min-labor-coverage-pct');
  if (coveragePct && coveragePct.value !== '') params.set('minLaborHoursCoverageRatio', String(Number(coveragePct.value) / 100));
  return params.toString();
}

function applyFilters() {
  loadOverview();
  if (currentEmpId) loadEmployee(currentEmpId);
}

function switchView(view) {
  document.getElementById('view-overview').style.display = view === 'overview' ? '' : 'none';
  document.getElementById('view-individual').style.display = view === 'individual' ? '' : 'none';
  document.getElementById('btn-view-overview').classList.toggle('active', view === 'overview');
  document.getElementById('btn-view-individual').classList.toggle('active', view === 'individual');
}

function switchOverviewSub(name) {
  currentOverviewSub = name;
  ['summary', 'breakdown', 'flagged', 'allemp'].forEach(function(n) {
    document.getElementById('ov-sub-' + n).style.display = n === name ? '' : 'none';
  });
  document.querySelectorAll('#ov-subtabnav .frv-subtab-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.sub === name);
  });
}

function switchAllEmpCategory(cat) {
  currentAllEmpCategory = cat;
  document.querySelectorAll('#allemp-category-nav .frv-subtab-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });
  document.getElementById('allemp-title').textContent = '社員ごとの一覧（' + (CATEGORY_LABELS[cat] || cat) + '）';
  renderAllEmployeesTable();
}

function switchEmpSub(name) {
  currentEmpSub = name;
  ['summary', 'reasoning', 'daily'].forEach(function(n) {
    document.getElementById('emp-sub-' + n).style.display = n === name ? '' : 'none';
  });
  document.querySelectorAll('#view-individual .frv-subtab-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.sub === name);
  });
}

function printCurrentView() {
  const params = new URLSearchParams(buildQueryString());
  const isIndividual = document.getElementById('view-individual').style.display !== 'none';
  if (isIndividual) {
    if (!currentEmpId) { alert('先に個人ビューで社員を選んでください。'); return; }
    params.set('view', 'individual');
    params.set('empId', currentEmpId);
    // 個人レポートはサマリー＋判定理由をまとめた1枚のレポートとして印刷する（日ごとの記録はコピー用途では不要なので対象外）
  } else {
    params.set('view', 'overview');
    params.set('section', currentOverviewSub);
    if (currentOverviewSub === 'allemp') params.set('category', currentAllEmpCategory);
  }
  window.open(ADMIN_PATH + '/sales-ai/fare-revision/print?' + params.toString(), '_blank');
}

function updatePeriodHeaders(periods) {
  document.getElementById('th-flagged-before').textContent = periods.before.label + 'の1日平均売上';
  document.getElementById('th-flagged-after').textContent = periods.after.label + 'の1日平均売上';
  document.getElementById('th-allemp-before').textContent = periods.before.label + 'の1日平均売上';
  document.getElementById('th-allemp-after').textContent = periods.after.label + 'の1日平均売上';
  document.getElementById('emp-chart-title').textContent = '売上の移り変わり（' + periods.before.label + '・' + periods.after.label + 'を、乗務した日数でそろえて比較）';
}

function renderPeriodNote(periods) {
  document.getElementById('period-note').textContent =
    '今、比べている期間 — ' + periods.before.label + ': ' + periods.before.start + '〜' + periods.before.end + '（' + periods.before.days + '日間）　/　' +
    periods.after.label + ': ' + periods.after.start + '〜' + periods.after.end + '（' + periods.after.days + '日間）';
}

function renderKpiRow(data) {
  const c = data.counts;
  const total = c.above + c.met + c.below + c.insufficientData;
  const items = [
    { label: '対象人数', val: total + '名' },
    { label: '売上が' + data.thresholds.achievementThresholdPct + '%以上に伸びた人', val: c.above + '名', sub: total ? Math.round(c.above / total * 1000) / 10 + '%' : '' },
    { label: '伸びたけど目標未達の人', val: c.met + '名', sub: total ? Math.round(c.met / total * 1000) / 10 + '%' : '' },
    { label: '売上が下がった人', val: c.below + '名', sub: total ? Math.round(c.below / total * 1000) / 10 + '%' : '' },
    { label: 'データが少なくて判定できない人', val: c.insufficientData + '名' },
    { label: '早めに切り上げていそうな人', val: data.flagged.length + '名' },
    { label: '労働時間データがある割合', val: data.dataCoverage.coverageRatio + '%' },
  ];
  let html = '';
  items.forEach(function(it) {
    html += '<div class="frv-kpi"><div class="frv-kpi-label">' + escHtmlJs(it.label) + '</div><div class="frv-kpi-val">' + escHtmlJs(it.val) + '</div>' +
      (it.sub ? '<div class="frv-kpi-sub">全体の' + escHtmlJs(it.sub) + '</div>' : '') + '</div>';
  });
  document.getElementById('kpi-row').innerHTML = html;
}

function renderHistogram(histogram) {
  const ctx = document.getElementById('histogram-chart').getContext('2d');
  const labels = histogram.map(function(h) { return h.bucketLabel; });
  const counts = histogram.map(function(h) { return h.count; });
  if (histogramChart) histogramChart.destroy();
  histogramChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: [{ label: '社員数', data: counts, backgroundColor: '#2d6a9f' }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });
}

function renderBreakdownTables(data) {
  let divHtml = '';
  data.divisionBreakdown.forEach(function(d) {
    divHtml += '<tr><td>' + d.division + '課</td><td style="color:' + pctColor(d.avgSalesGrowthPct) + ';font-weight:700;">' + fmtPct(d.avgSalesGrowthPct) + '</td><td>' + d.empCount + '名</td></tr>';
  });
  document.getElementById('division-tbody').innerHTML = divHtml;

  let teamHtml = '';
  data.teamBreakdown.forEach(function(t) {
    teamHtml += '<tr><td>' + t.team + '班</td><td style="color:' + pctColor(t.avgSalesGrowthPct) + ';font-weight:700;">' + fmtPct(t.avgSalesGrowthPct) + '</td><td>' + t.empCount + '名</td></tr>';
  });
  document.getElementById('team-tbody').innerHTML = teamHtml;

  let dutyHtml = '';
  data.dutyCategoryBreakdown.forEach(function(d) {
    dutyHtml += '<tr><td>' + escHtmlJs(d.label) + '</td><td style="color:' + pctColor(d.avgSalesGrowthPct) + ';font-weight:700;">' + fmtPct(d.avgSalesGrowthPct) + '</td><td>' + d.empCount + '名</td></tr>';
  });
  document.getElementById('duty-tbody').innerHTML = dutyHtml;
}

function empLabel(e) {
  return escHtmlJs(e.empName) + '<div style="font-size:10.5px;color:#9ca3af;">' + (e.division ?? '—') + '課' + (e.team ?? '—') + '班</div>';
}

function renderFlaggedTable(flagged) {
  document.getElementById('flagged-empty').style.display = flagged.length ? 'none' : '';
  let html = '';
  flagged.forEach(function(e) {
    html += '<tr class="frv-row-clickable" onclick="selectEmployee(' + e.empId + ', \\'' + escHtmlJs(e.empName).replace(/'/g, "\\\\'") + '\\')">' +
      '<td>' + empLabel(e) + '</td>' +
      '<td>' + (e.division ?? '—') + '課' + (e.team ?? '—') + '班</td>' +
      '<td>' + fmtYen(e.before.avgPerDuty) + '</td>' +
      '<td>' + fmtYen(e.after.avgPerDuty) + '</td>' +
      '<td style="color:' + pctColor(e.salesGrowthPct) + ';font-weight:700;">' + fmtPct(e.salesGrowthPct) + '</td>' +
      '<td>' + fmtPct(e.hourlyRateGrowthPct) + '</td>' +
      '<td>' + fmtPct(e.laborHoursGrowthPct) + '</td>' +
      '<td>' + (e.earlyLeaveConfidence === 'high' ? '高' : '中') + '</td>' +
      '</tr>';
  });
  document.getElementById('flagged-tbody').innerHTML = html;
}

function updateCategoryCounts(counts) {
  document.getElementById('cat-count-above').textContent = '(' + counts.above + ')';
  document.getElementById('cat-count-met').textContent = '(' + counts.met + ')';
  document.getElementById('cat-count-below').textContent = '(' + counts.below + ')';
  document.getElementById('cat-count-insufficient_data').textContent = '(' + counts.insufficientData + ')';
}

function renderAllEmployeesTable() {
  if (!overviewData) return;
  const search = document.getElementById('all-emp-search').value.trim();
  const sort = document.getElementById('all-emp-sort').value;
  let list = overviewData.employees.filter(function(e) {
    return e.achievementCategory === currentAllEmpCategory && (!search || e.empName.indexOf(search) !== -1);
  });
  list = list.slice().sort(function(a, b) {
    if (sort === 'growth-desc') return (b.salesGrowthPct ?? -Infinity) - (a.salesGrowthPct ?? -Infinity);
    if (sort === 'growth-asc') return (a.salesGrowthPct ?? -Infinity) - (b.salesGrowthPct ?? -Infinity);
    return a.empName.localeCompare(b.empName, 'ja');
  });
  document.getElementById('all-emp-empty').style.display = list.length ? 'none' : '';
  let html = '';
  list.forEach(function(e) {
    html += '<tr class="frv-row-clickable" onclick="selectEmployee(' + e.empId + ', \\'' + escHtmlJs(e.empName).replace(/'/g, "\\\\'") + '\\')">' +
      '<td>' + escHtmlJs(e.empName) + '</td>' +
      '<td>' + (e.division ?? '—') + '課' + (e.team ?? '—') + '班</td>' +
      '<td>' + (e.wageCategoryLabel ? escHtmlJs(e.wageCategoryLabel) : '—') + '</td>' +
      '<td style="color:' + pctColor(e.salesGrowthPct) + ';font-weight:700;">' + fmtPct(e.salesGrowthPct) + '</td>' +
      '<td>' + fmtYen(e.before.avgPerDuty) + '</td>' +
      '<td>' + fmtYen(e.after.avgPerDuty) + '</td>' +
      '<td>' + fmtPct(e.laborHoursGrowthPct) + '</td>' +
      '</tr>';
  });
  document.getElementById('all-emp-tbody').innerHTML = html;
}

function renderCoverageNote(cov) {
  document.getElementById('coverage-note').textContent =
    '労働時間データの内訳（対象の全' + cov.totalRecordDays + '日のうち）: 実際の記録 ' + cov.actualLaborHoursDays + '日 ／ 出退庫の時刻から計算 ' + cov.estimatedLaborHoursDays + '日 ／ 記録なし ' + cov.missingLaborHoursDays + '日';
}

function populateDatalist(employees) {
  let html = '';
  employees.forEach(function(e) { html += '<option data-id="' + e.empId + '" value="' + escHtmlJs(e.empName) + '"></option>'; });
  document.getElementById('emp-datalist').innerHTML = html;
}

function loadOverview() {
  document.getElementById('loading').style.display = '';
  fetch('/api/fare-revision/overview?' + buildQueryString())
    .then(function(r) { return r.json(); })
    .then(function(data) {
      overviewData = data;
      currentPeriods = data.periods;
      document.getElementById('loading').style.display = 'none';
      document.getElementById('view-overview').style.display = document.getElementById('btn-view-overview').classList.contains('active') ? '' : 'none';
      updatePeriodHeaders(data.periods);
      renderPeriodNote(data.periods);
      renderKpiRow(data);
      renderHistogram(data.histogram);
      renderBreakdownTables(data);
      renderFlaggedTable(data.flagged);
      updateCategoryCounts(data.counts);
      document.getElementById('allemp-title').textContent = '社員ごとの一覧（' + (CATEGORY_LABELS[currentAllEmpCategory] || currentAllEmpCategory) + '）';
      renderAllEmployeesTable();
      renderCoverageNote(data.dataCoverage);
      populateDatalist(data.employees);
    })
    .catch(function(err) {
      document.getElementById('loading').textContent = '読み込みに失敗しました: ' + err;
    });
}

function onIndividualSearchInput() {
  const input = document.getElementById('individual-search');
  const val = input.value;
  const opts = document.getElementById('emp-datalist').querySelectorAll('option');
  for (let i = 0; i < opts.length; i++) {
    if (opts[i].value === val) { selectEmployee(Number(opts[i].dataset.id), val); return; }
  }
}

function selectEmployee(empId, empName) {
  currentEmpId = empId;
  switchView('individual');
  document.getElementById('individual-search').value = empName;
  loadEmployee(empId);
}

function laborHoursSourceLabel(s) {
  if (s === 'actual') return '実際の記録';
  if (s === 'estimated') return '時刻から計算';
  return '記録なし';
}

function renderEmployeeKpi(cmp) {
  const beforeLabel = cmp.before.range.label;
  const afterLabel = cmp.after.range.label;
  const items = [
    { label: '1日あたり売上の伸び', val: fmtPct(cmp.salesGrowthPct), color: pctColor(cmp.salesGrowthPct) },
    { label: '判定', val: CATEGORY_LABELS[cmp.achievementCategory] || cmp.achievementCategory, color: '#1a3a5c' },
    { label: '1時間あたり売上の伸び', val: fmtPct(cmp.hourlyRateGrowthPct), color: '#1a3a5c' },
    { label: '1乗務あたり労働時間の伸び', val: fmtPct(cmp.laborHoursGrowthPct), color: '#1a3a5c' },
    { label: '平均の1日の売上（' + beforeLabel + '→' + afterLabel + '）', val: fmtYen(cmp.before.avgPerDuty) + ' → ' + fmtYen(cmp.after.avgPerDuty), color: '#1a3a5c' },
    { label: '平均の帰る時刻（' + beforeLabel + '→' + afterLabel + '）', val: (cmp.before.avgReturnTime ?? '—') + ' → ' + (cmp.after.avgReturnTime ?? '—'), color: '#1a3a5c' },
  ];
  let html = '';
  items.forEach(function(it) {
    html += '<div class="frv-kpi"><div class="frv-kpi-label">' + escHtmlJs(it.label) + '</div><div class="frv-kpi-val" style="color:' + it.color + ';font-size:15px;">' + escHtmlJs(it.val) + '</div></div>';
  });
  document.getElementById('emp-kpi-row').innerHTML = html;
}

function renderEmployeeChart(dailyBefore, dailyAfter, periods) {
  const ctx = document.getElementById('emp-chart').getContext('2d');
  const maxOffset = Math.max(
    dailyBefore.reduce(function(m, r) { return Math.max(m, r.dayOffset); }, 0),
    dailyAfter.reduce(function(m, r) { return Math.max(m, r.dayOffset); }, 0)
  );
  const labels = [];
  for (let i = 0; i <= maxOffset; i++) labels.push(i + '日目');
  const beforeSeries = new Array(maxOffset + 1).fill(null);
  dailyBefore.forEach(function(r) { beforeSeries[r.dayOffset] = r.amount; });
  const afterSeries = new Array(maxOffset + 1).fill(null);
  dailyAfter.forEach(function(r) { afterSeries[r.dayOffset] = r.amount; });
  if (empChart) empChart.destroy();
  empChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: periods.before.label, data: beforeSeries, borderColor: '#9ca3af', backgroundColor: 'transparent', spanGaps: true, tension: 0.15 },
        { label: periods.after.label, data: afterSeries, borderColor: '#2d6a9f', backgroundColor: 'transparent', spanGaps: true, tension: 0.15 },
      ],
    },
    options: { responsive: true, interaction: { mode: 'index', intersect: false } },
  });
}

function renderEmployeeReasoning(reasoning) {
  let html = '';
  reasoning.forEach(function(line) {
    const isFlag = line.indexOf('【早めに切り上げている可能性】') === 0;
    html += '<li' + (isFlag ? ' class="frv-flag"' : '') + '>' + escHtmlJs(line) + '</li>';
  });
  document.getElementById('emp-reasoning').innerHTML = html;
}

function renderEmployeeDaily(dailyBefore, dailyAfter, periods) {
  let html = '';
  function row(r, periodLabel) {
    return '<tr><td>' + escHtmlJs(periodLabel) + '</td><td>' + r.date + '</td><td>' + fmtYen(r.amount) + '</td>' +
      '<td>' + (r.laborHoursResolved !== null ? r.laborHoursResolved + '時間' : '—') + '</td>' +
      '<td>' + laborHoursSourceLabel(r.laborHoursSource) + '</td><td>' + (r.returnTime ?? '—') + '</td></tr>';
  }
  dailyAfter.slice().reverse().forEach(function(r) { html += row(r, periods.after.label); });
  dailyBefore.slice().reverse().forEach(function(r) { html += row(r, periods.before.label); });
  document.getElementById('emp-daily-tbody').innerHTML = html;
}

function loadEmployee(empId) {
  document.getElementById('individual-empty').style.display = 'none';
  document.getElementById('individual-content').style.display = 'none';
  fetch('/api/fare-revision/employee/' + empId + '?' + buildQueryString())
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.error) { document.getElementById('individual-empty').textContent = data.error; document.getElementById('individual-empty').style.display = ''; return; }
      document.getElementById('individual-content').style.display = '';
      renderEmployeeKpi(data.comparison);
      renderEmployeeChart(data.dailyBefore, data.dailyAfter, data.periods);
      renderEmployeeReasoning(data.comparison.reasoning);
      renderEmployeeDaily(data.dailyBefore, data.dailyAfter, data.periods);
    });
}

loadOverview();
</script>`;

  return c.html(layout('運賃改定影響分析', content, 'sales-ai'));
});

// ===================================================
// 印刷ページ — ダッシュボードで選んでいる条件・タブをそのまま印刷する。
// view=overview のときは section=summary|breakdown|flagged|allemp、
// view=individual のときは empId必須で section=summary|reasoning|daily。
// ===================================================
app.get('/sales-ai/fare-revision/print', async (c) => {
  const view = c.req.query('view') === 'individual' ? 'individual' : 'overview';
  const backHref = `${ADMIN_PATH}/sales-ai/fare-revision`;
  const printedAtLabel = formatPrintedAtLabel();

  if (view === 'individual') {
    const empId = parseInt(c.req.query('empId') ?? '');
    if (isNaN(empId)) return c.text('社員が指定されていません', 400);
    // 個人レポートはサマリー＋判定理由をまとめた1枚のレポートとして印刷する（日ごとの記録はコピー用途では不要なので対象外）
    const result = await computeFareRevisionEmployee(c.env.DB, empId, c.req.query());
    if (!result) return c.text('社員が見つかりません', 404);
    return c.html(renderFareRevisionEmployeePrintPage(result, printedAtLabel, backHref));
  }

  const section = (['summary', 'breakdown', 'flagged', 'allemp'] as const).includes(c.req.query('section') as any)
    ? (c.req.query('section') as 'summary' | 'breakdown' | 'flagged' | 'allemp') : 'summary';
  const category = (['above', 'met', 'below', 'insufficient_data'] as const).includes(c.req.query('category') as any)
    ? (c.req.query('category') as 'above' | 'met' | 'below' | 'insufficient_data') : null;
  const result = await computeFareRevisionOverview(c.env.DB, c.req.query());
  return c.html(renderFareRevisionOverviewPrintPage(section, result, printedAtLabel, backHref, category));
});

// ===================================================
// 運賃改定影響分析の計算ロジック解説（設定ページから遷移。閲覧専用・保存機能なし）
// ===================================================
app.get('/settings/fare-revision-guide', (c) => {
  const content = settingsSubHeader('運賃改定影響分析のしくみ') + `
<div style="max-width:760px;font-family:'Hiragino Sans','Meiryo',sans-serif;font-size:14px;line-height:1.9;color:#1f2937;">

  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
    <div style="font-weight:700;color:#1d4ed8;margin-bottom:6px;">ひとことで言うと</div>
    <div style="color:#1e3a5f;">2026年4月20日に運賃が約10%値上げされました。「値上げの前」と「値上げの後」で、同じ人の売上や働いた時間がどう変わったかを、コンピューターが自動で計算して比べているだけです。<b>AIという名前がついていますが、ChatGPTのような外部のAIサービスには一切つないでいません。</b>すべて「〇〇円 ÷ 〇〇円」のような普通の割り算と、「もし〇〇より大きかったら」という条件分岐の組み合わせです。</div>
  </div>

  <h3 style="font-size:15px;color:#1a3a5c;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin-top:28px;">① まず「前」と「後」の期間を決める</h3>
  <p>この画面は運賃改定の前後の比較専用です。「後」＝4月20日〜今日（「運賃改定後の期間」で調整可）。「後」が仮に100日間なら、「前」も同じ100日間（4月19日からさかのぼって100日間）にします。日数をそろえないと、単純に日数が多いほうが売上合計も大きくなってしまい、フェアな比較になりません。</p>
  <p style="color:#4b5563;">なお、「前」の期間が始まった時点でまだ入社していなかった人（入社が改定間近〜改定後の新人など）は、この分析の対象には含めていません。そのような人を含めてしまうと、単に在籍日数が「前」と「後」で大きく違うだけで、売上の伸び率が数百〜千数百%という運賃改定とは無関係な数字になってしまい、誤解を招くためです。去年の同じ時期との比較や、自分で自由に期間を指定した単純な比較は「AI売上分析」の別タブ「期間比較」で行えます。</p>

  <h3 style="font-size:15px;color:#1a3a5c;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin-top:28px;">② 1日あたり何時間働いたかを出す</h3>
  <p>「時間あたりいくら稼いだか」を計算するには、働いた時間が必要です。</p>
  <ul style="padding-left:22px;">
    <li>ホシコンの記録に「実際の労働時間」があれば、それをそのまま使います（一番信頼できる数字）。</li>
    <li>もし記録がなければ、「出庫した時刻」〜「帰庫した時刻」の差を代わりに使います。ただしこれは休憩時間も含んでしまうので、実際に働いた時間より少し長めに出ます。</li>
    <li>夜勤などで日をまたぐ場合（例：出庫19:00→帰庫翌3:00）はちゃんと8時間として計算します。逆に0時間以下やあまりに長すぎる（20時間超）記録は、データがおかしいと判断して使いません。</li>
  </ul>

  <h3 style="font-size:15px;color:#1a3a5c;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin-top:28px;">③ 伸び率（％）の計算のしかた</h3>
  <p>これが一番の基本です。とてもシンプルな割り算です。</p>
  <div style="background:#f8fafc;border-radius:8px;padding:14px 18px;margin:10px 0;font-size:13.5px;">
    伸び率（％） ＝ 後の期間の数字 ÷ 前の期間の数字 × 100
  </div>
  <p style="color:#4b5563;">例えば「前」の1日あたり平均売上が20,000円、「後」が23,000円なら、23,000 ÷ 20,000 × 100 = <b>115%</b> です。100%より大きければ増えた、小さければ減ったという意味になります。これと同じ計算を、時間単価（1時間あたりの売上）・働いた時間・乗務日数のそれぞれについて行っています。</p>
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin:10px 0;font-size:13px;color:#1e3a5f;">
    <b>「売上の伸び」は総売上（合計金額）ではなく、必ず「1日あたりの平均売上」で計算しています。</b>入社したばかりの人や、体調不良・家庭の事情などで働く日数自体が「前」と「後」で大きく変わった人がいると、総売上どうしを比べると本人の頑張り具合とは関係なく数字が大きくブレてしまうためです（例：前の期間は10日しか記録がなく、後の期間は120日ほぼフルで働いた場合、総売上は10倍以上になりますが、それは単に働いた日数が増えただけです）。1日あたりの平均で比べることで、日数の増減の影響を除いています。乗務日数そのものの伸び率も社員別の「判定理由」に表示されるので、日数が大きく変わっている場合はそちらで確認できます。</div>

  <h3 style="font-size:15px;color:#1a3a5c;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin-top:28px;">④ 「達成」「未達」「減少」をどう決めるか</h3>
  <p>売上の伸び率をもとに、4つに振り分けます（目標ラインは「くわしい設定」で変更可能。既定は110%）。</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin:10px 0;">
    <tr style="background:#f3f4f6;"><th style="text-align:left;padding:6px 10px;border:1px solid #e5e7eb;">判定</th><th style="text-align:left;padding:6px 10px;border:1px solid #e5e7eb;">条件</th></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;color:#16a34a;font-weight:700;">目標達成</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">伸び率が110%以上（値上げ分をしっかり上回って伸びた）</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;color:#b45309;font-weight:700;">伸びたが未達</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">100%以上110%未満（伸びてはいるが目標には届いていない）</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;color:#dc2626;font-weight:700;">減少</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">100%未満（前より売上が減った）</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;color:#6b7280;font-weight:700;">データ不足</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">前後どちらかの期間の乗務日数が少なすぎる（既定：5日未満）ときは、判定せずに「わからない」として扱う</td></tr>
  </table>
  <p style="color:#4b5563;">乗務日数が少ないと、たまたま1日だけ調子が良かった／悪かっただけで伸び率が大きくブレてしまうため、一定日数に満たない人は判定を保留しています。</p>

  <h3 style="font-size:15px;color:#1a3a5c;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin-top:28px;">⑤ 「早めに切り上げていそうな人」はどう見つけているか</h3>
  <p>これがこの機能でいちばん複雑な部分です。考え方はこうです。</p>
  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px 18px;margin:10px 0;">
    もし「売上」は運賃改定の前とほとんど変わっていないのに、<br>
    「働いた時間の合計」ははっきり短くなっている ―― それはつまり、<br>
    <b>運賃が上がった分だけ、いつもの目標額に早く到達して、早めに仕事を切り上げている</b>可能性がある、という推測です。<br>
    （売上が同じで時間だけ短くなれば、1時間あたりの単価は自動的に上がることになります）
  </div>
  <p>これを数字で判定すると、次の<b>2つの条件が両方とも</b>成り立ったときにフラグが立ちます（数字は「くわしい設定」で調整可能）。</p>
  <ol style="padding-left:22px;">
    <li>売上の伸び率が、100%を中心に既定±8%の範囲に収まっている＝「売上はほぼ変わっていない」</li>
    <li>1乗務あたりの平均労働時間の伸び率が、既定97%を下回っている＝「1回の乗務そのものがはっきり短くなっている」（乗務日数そのものが減っただけの人と区別するため、合計労働時間ではなく1乗務あたりの平均で判定しています）</li>
  </ol>
  <p style="color:#4b5563;">「確からしさ」は、労働時間の記録が実際の記録中心なら<b>高い</b>、出退庫時刻からの推定を多く含む場合は<b>中くらい</b>と表示されます。あくまで参考情報であり、この判定だけで本人を評価するものではありません。</p>

  <h3 style="font-size:15px;color:#1a3a5c;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin-top:28px;">⑥ 全体の集計（グラフや課別の表）</h3>
  <ul style="padding-left:22px;">
    <li><b>分布グラフ</b>：全員の売上伸び率を「90%未満」「90〜100%」「100〜110%」「110〜120%」「120%以上」の5つの箱に振り分けて人数を数えているだけです。</li>
    <li><b>課別・班別・勤務区分別の平均</b>：それぞれのグループに属する人（ただし④の「データ不足」の人は平均が歪むため除外）の伸び率を単純平均しています。</li>
  </ul>

  <h3 style="font-size:15px;color:#1a3a5c;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin-top:28px;">⑦ 覚えておいてほしいこと</h3>
  <ul style="padding-left:22px;">
    <li>すべてホシコンの売上記録（<code>sales_records</code>）など、もともとあるデータの集計で、新しく特別なデータを作っているわけではありません。</li>
    <li>あくまで自動集計＋しきい値判定であり、有給・欠勤・体調不良・イベントなど、数字に出ない事情までは考慮できません。最終的な判断は必ず人の目で確認してください。</li>
    <li>「くわしい設定」のしきい値（目標達成ライン・売上ほぼ変わらないとみなす範囲・時間減少の目安・最低乗務日数など）は分析画面からその場で自由に変更して試せます。保存はされず、画面を開き直すと既定値に戻ります。</li>
  </ul>

  <div style="margin-top:28px;">
    <a href="${ADMIN_PATH}/sales-ai/fare-revision" style="color:#2563eb;font-size:13px;">→ 運賃改定影響分析の画面に戻る</a>
  </div>
</div>`;
  return c.html(layout('運賃改定影響分析のしくみ', content, 'settings'));
});

export default app;
