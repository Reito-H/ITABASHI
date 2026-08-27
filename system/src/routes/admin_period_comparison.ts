// 期間比較 — AI売上分析ページの新規タブ。
// 運賃改定影響分析とは別に、任意の2つの期間（単純な日付ベース）で売上・労働時間を比べたいときに使う。
// 判定ロジック（伸び率・早めに切り上げていそうな人の検出など）は運賃改定影響分析と共通のものを再利用する
// （ルールベースのみ、外部AI/LLM APIへの通信は一切行わない）。
import { Hono } from 'hono';
import { layout } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';
import { salesAiTabNav, SALES_AI_TABNAV_CSS } from './admin_sales_ai';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

app.get('/sales-ai/period-comparison', async (c) => {
  const content = `
<style>
  ${SALES_AI_TABNAV_CSS}
  .pc-card { background:white; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.08); padding:18px 20px; margin-bottom:14px; }
  .pc-kpi-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-bottom:14px; }
  .pc-kpi { background:white; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,0.08); padding:12px 14px; }
  .pc-kpi-label { font-size:10.5px; color:#9ca3af; margin-bottom:4px; }
  .pc-kpi-val { font-size:19px; font-weight:700; color:#1a3a5c; }
  .pc-toolbar { display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; }
  .pc-field { display:flex; flex-direction:column; gap:3px; }
  .pc-field label { font-size:10.5px; color:#6b7280; font-weight:700; }
  .pc-field input, .pc-field select { border:1px solid #d1d5db; border-radius:6px; padding:6px 8px; font-size:12px; }
  .pc-btn { border:none; border-radius:6px; padding:7px 16px; font-size:12px; font-weight:700; cursor:pointer; }
  .pc-btn-primary { background:#1a3a5c; color:#fff; }
  .pc-btn-ghost { background:#fff; border:1px solid #d1d5db; color:#374151; }
  .pc-advanced { display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #e5e7eb; }
  .pc-advanced.open { display:flex; flex-wrap:wrap; gap:10px; }
  .pc-period-note { font-size:11px; color:#6b7280; margin-top:8px; }
  .pc-subtabnav { display:flex; gap:4px; margin-bottom:14px; border-bottom:1px solid #e5e7eb; flex-wrap:wrap; }
  .pc-subtab-btn { padding:8px 14px; font-size:12.5px; font-weight:600; color:#64748b; background:none; border:none; border-bottom:2px solid transparent; margin-bottom:-1px; cursor:pointer; }
  .pc-subtab-btn:hover { color:#1a3a5c; }
  .pc-subtab-btn.active { color:#1a3a5c; border-bottom-color:#1a3a5c; }
  .pc-table { width:100%; border-collapse:collapse; font-size:12px; }
  .pc-table th { padding:6px 8px; text-align:left; color:#6b7280; border-bottom:1px solid #e5e7eb; white-space:nowrap; }
  .pc-table td { padding:7px 8px; border-bottom:1px solid #f3f4f6; }
  .pc-coverage { font-size:11px; color:#6b7280; margin-top:6px; }
</style>
<div style="max-width:1180px;font-family:'Hiragino Sans','Meiryo',sans-serif;">
  ${salesAiTabNav('period-comparison')}
  <div style="margin-bottom:10px;">
    <h2 style="font-size:16px;font-weight:700;color:#1a3a5c;margin:0;">期間比較</h2>
    <div style="font-size:11.5px;color:#6b7280;margin-top:4px;line-height:1.6;">好きな2つの期間を自由に指定して、社員ごとの売上・働いた時間がどう変わったかを単純に比べます。運賃改定の前後を固定で比べたいときは「運賃改定影響分析」タブを使ってください。外部のAIサービスには一切接続していません。</div>
  </div>

  <div class="pc-card">
    <div class="pc-toolbar">
      <div class="pc-field"><label>前の期間（開始）</label><input type="date" id="before-start"></div>
      <div class="pc-field"><label>前の期間（終了）</label><input type="date" id="before-end"></div>
      <div class="pc-field"><label>後の期間（開始）</label><input type="date" id="after-start"></div>
      <div class="pc-field"><label>後の期間（終了）</label><input type="date" id="after-end"></div>
      <div class="pc-field">
        <label>課</label>
        <select id="division-filter"><option value="">全課</option><option value="1">1課</option><option value="2">2課</option><option value="3">3課</option><option value="4">4課</option></select>
      </div>
      <div class="pc-field">
        <label>班</label>
        <select id="team-filter"><option value="">全班</option><option value="1">1班</option><option value="2">2班</option><option value="3">3班</option><option value="4">4班</option><option value="5">5班</option><option value="6">6班</option><option value="7">7班</option><option value="8">8班</option></select>
      </div>
      <div class="pc-field">
        <label>勤務区分</label>
        <select id="duty-filter"><option value="">全区分</option><option value="a">昼日(a)</option><option value="b">夜日(b)</option><option value="B">隔日(B)</option><option value="D">隔日(D)</option><option value="H">隔日(H)</option></select>
      </div>
      <button type="button" class="pc-btn pc-btn-primary" onclick="loadOverview()">この条件で見る</button>
      <button type="button" class="pc-btn pc-btn-ghost" onclick="toggleAdvanced()">くわしい設定 ▾</button>
    </div>
    <div id="advanced-panel" class="pc-advanced">
      <div class="pc-field"><label>目標にする達成率(%)</label><input type="number" id="achievement-threshold" value="110" style="width:70px;"></div>
      <div class="pc-field"><label>売上がこの範囲なら「ほぼ変わらない」とみなす(100±%)</label><input type="number" id="sales-flat-band" value="8" style="width:60px;"></div>
      <div class="pc-field"><label>働いた時間がこれより減ったら「減った」と判定(%)</label><input type="number" id="labor-hours-drop" value="97" style="width:70px;"></div>
      <div class="pc-field"><label>判定に必要な最低の乗務日数（各期間）</label><input type="number" id="min-duty-days" value="5" style="width:60px;"></div>
      <div class="pc-field"><label>労働時間データが必要な最低の割合(%)</label><input type="number" id="min-labor-coverage-pct" value="50" style="width:60px;"></div>
    </div>
    <div id="period-note" class="pc-period-note"></div>
  </div>

  <div id="loading" style="color:#9ca3af;font-size:13px;">読み込み中…</div>

  <div id="view-content" style="display:none;">
    <div id="kpi-row" class="pc-kpi-row"></div>

    <div class="pc-subtabnav" id="subtabnav">
      <button type="button" class="pc-subtab-btn active" data-sub="flagged" onclick="switchSub('flagged')">早めに切り上げていそうな人</button>
      <button type="button" class="pc-subtab-btn" data-sub="allemp" onclick="switchSub('allemp')">社員ごとの一覧</button>
    </div>

    <div id="sub-flagged" class="pc-subpanel">
      <div class="pc-card">
        <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 4px;">早めに切り上げていそうな人（一覧）</h3>
        <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">売上は前の期間とほぼ変わっていないのに、働いた時間がはっきり短くなっている人です。</div>
        <table class="pc-table">
          <thead><tr><th>氏名</th><th>課/班</th><th id="th-flagged-before">前の1日平均売上</th><th id="th-flagged-after">後の1日平均売上</th><th>1日あたり売上の伸び</th><th>1乗務あたり労働時間の伸び</th><th>確からしさ</th></tr></thead>
          <tbody id="flagged-tbody"></tbody>
        </table>
        <div id="flagged-empty" style="display:none;font-size:12px;color:#9ca3af;padding:10px 0;">該当する人はいません。</div>
      </div>
    </div>

    <div id="sub-allemp" class="pc-subpanel" style="display:none;">
      <div class="pc-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
          <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0;">社員ごとの一覧</h3>
          <div style="display:flex;gap:8px;">
            <input type="text" id="all-emp-search" placeholder="社員名で検索" oninput="renderAllEmployeesTable()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;">
            <select id="all-emp-sort" onchange="renderAllEmployeesTable()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;">
              <option value="growth-asc">1日あたり売上の伸び 低い順</option>
              <option value="growth-desc">1日あたり売上の伸び 高い順</option>
              <option value="name-asc">名前順</option>
            </select>
          </div>
        </div>
        <table class="pc-table">
          <thead><tr><th>氏名</th><th>課/班</th><th>勤務の種類</th><th>1日あたり売上の伸び</th><th id="th-allemp-before">前の1日平均売上</th><th id="th-allemp-after">後の1日平均売上</th><th>1乗務あたり労働時間の伸び</th></tr></thead>
          <tbody id="all-emp-tbody"></tbody>
        </table>
        <div id="all-emp-empty" style="display:none;font-size:12px;color:#9ca3af;padding:10px 0;">該当する人はいません。</div>
      </div>
    </div>
    <div id="coverage-note" class="pc-coverage"></div>
  </div>
</div>
<script>
const ADMIN_PATH = '${ADMIN_PATH}';
let overviewData = null;
let currentSub = 'flagged';

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

function toggleAdvanced() {
  document.getElementById('advanced-panel').classList.toggle('open');
}

function toCamel(id) {
  return id.replace(/-([a-z])/g, function(_, ch) { return ch.toUpperCase(); });
}
function buildQueryString() {
  const params = new URLSearchParams();
  ['before-start', 'before-end', 'after-start', 'after-end'].forEach(function(id) {
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

function switchSub(name) {
  currentSub = name;
  ['flagged', 'allemp'].forEach(function(n) {
    document.getElementById('sub-' + n).style.display = n === name ? '' : 'none';
  });
  document.querySelectorAll('#subtabnav .pc-subtab-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.sub === name);
  });
}

function updatePeriodHeaders(before, after) {
  document.getElementById('th-flagged-before').textContent = before.label + 'の1日平均売上';
  document.getElementById('th-flagged-after').textContent = after.label + 'の1日平均売上';
  document.getElementById('th-allemp-before').textContent = before.label + 'の1日平均売上';
  document.getElementById('th-allemp-after').textContent = after.label + 'の1日平均売上';
}

function renderPeriodNote(before, after) {
  document.getElementById('period-note').textContent =
    '今、比べている期間 — ' + before.label + ': ' + before.start + '〜' + before.end + '（' + before.days + '日間）　/　' +
    after.label + ': ' + after.start + '〜' + after.end + '（' + after.days + '日間）';
  if (!document.getElementById('before-start').value) document.getElementById('before-start').value = before.start;
  if (!document.getElementById('before-end').value) document.getElementById('before-end').value = before.end;
  if (!document.getElementById('after-start').value) document.getElementById('after-start').value = after.start;
  if (!document.getElementById('after-end').value) document.getElementById('after-end').value = after.end;
}

function renderKpiRow(data) {
  const c = data.counts;
  const total = c.above + c.met + c.below + c.insufficientData;
  const items = [
    { label: '対象人数', val: total + '名' },
    { label: '売上が伸びた人', val: (c.above + c.met) + '名' },
    { label: '売上が下がった人', val: c.below + '名' },
    { label: 'データが少なくて判定できない人', val: c.insufficientData + '名' },
    { label: '早めに切り上げていそうな人', val: data.flagged.length + '名' },
    { label: '労働時間データがある割合', val: data.dataCoverage.coverageRatio + '%' },
  ];
  let html = '';
  items.forEach(function(it) {
    html += '<div class="pc-kpi"><div class="pc-kpi-label">' + escHtmlJs(it.label) + '</div><div class="pc-kpi-val">' + escHtmlJs(it.val) + '</div></div>';
  });
  document.getElementById('kpi-row').innerHTML = html;
}

function renderFlaggedTable(flagged) {
  document.getElementById('flagged-empty').style.display = flagged.length ? 'none' : '';
  let html = '';
  flagged.forEach(function(e) {
    html += '<tr>' +
      '<td>' + escHtmlJs(e.empName) + '</td>' +
      '<td>' + (e.division ?? '—') + '課' + (e.team ?? '—') + '班</td>' +
      '<td>' + fmtYen(e.before.avgPerDuty) + '</td>' +
      '<td>' + fmtYen(e.after.avgPerDuty) + '</td>' +
      '<td style="color:' + pctColor(e.salesGrowthPct) + ';font-weight:700;">' + fmtPct(e.salesGrowthPct) + '</td>' +
      '<td>' + fmtPct(e.laborHoursGrowthPct) + '</td>' +
      '<td>' + (e.earlyLeaveConfidence === 'high' ? '高' : '中') + '</td>' +
      '</tr>';
  });
  document.getElementById('flagged-tbody').innerHTML = html;
}

function renderAllEmployeesTable() {
  if (!overviewData) return;
  const search = document.getElementById('all-emp-search').value.trim();
  const sort = document.getElementById('all-emp-sort').value;
  let list = overviewData.employees.filter(function(e) {
    return !search || e.empName.indexOf(search) !== -1;
  });
  list = list.slice().sort(function(a, b) {
    if (sort === 'growth-desc') return (b.salesGrowthPct ?? -Infinity) - (a.salesGrowthPct ?? -Infinity);
    if (sort === 'growth-asc') return (a.salesGrowthPct ?? -Infinity) - (b.salesGrowthPct ?? -Infinity);
    return a.empName.localeCompare(b.empName, 'ja');
  });
  document.getElementById('all-emp-empty').style.display = list.length ? 'none' : '';
  let html = '';
  list.forEach(function(e) {
    html += '<tr>' +
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

function loadOverview() {
  document.getElementById('loading').style.display = '';
  fetch('/api/period-comparison/overview?' + buildQueryString())
    .then(function(r) { return r.json(); })
    .then(function(data) {
      overviewData = data;
      document.getElementById('loading').style.display = 'none';
      document.getElementById('view-content').style.display = '';
      updatePeriodHeaders(data.before, data.after);
      renderPeriodNote(data.before, data.after);
      renderKpiRow(data);
      renderFlaggedTable(data.flagged);
      renderAllEmployeesTable();
      renderCoverageNote(data.dataCoverage);
    })
    .catch(function(err) {
      document.getElementById('loading').textContent = '読み込みに失敗しました: ' + err;
    });
}

loadOverview();
</script>`;

  return c.html(layout('期間比較', content, 'sales-ai'));
});

export default app;
