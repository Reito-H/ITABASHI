// 事故データ（保険会社システムのCSVエクスポート取込）
// 紙/Excelで手入力していた「無事故キロ数計算」の事故集計の代わりに、事故の件数・時間帯を
// 常時見える形（ホームのカード）と、詳細一覧（このページ）で確認できるようにする。
import { ADMIN_PATH } from '../config';
import { escHtml, safeJson } from './layout';

export interface AccidentRecord {
  id: number;
  accident_no: string;
  office: string | null;
  vehicle_code: string | null;
  plate_no: string | null;
  division: number | null;
  team: string | null;
  emp_no: string | null;
  emp_name: string | null;
  accident_category: string | null;
  occurred_date: string;
  occurred_time: string | null;
  weather: string | null;
  loc_city: string | null;
  loc_town: string | null;
  loc_addr: string | null;
  fault_pct_planned: number | null;
  fault_pct_final: number | null;
  damage_amount: number | null;
  accident_target: string | null;
  accident_form: string | null;
  road_condition: string | null;
  business_status: string | null;
  emp_age: number | null;
  emp_tenure_years: number | null;
  memo: string | null;
  past3y_accident_count: number | null;
  road_shape: string | null;
  cause_reason: string | null;
  cause_direct: string | null;
}

// 時間帯集計（2時間刻み12本）。ホームカードの簡易表示・詳細ページ双方で使う共通ロジック。
export const HOUR_BAND_SIZE = 2;
export const HOUR_BAND_COUNT = 24 / HOUR_BAND_SIZE;

export function hourBandLabel(bandIdx: number): string {
  const from = bandIdx * HOUR_BAND_SIZE;
  const to = from + HOUR_BAND_SIZE;
  return `${from}-${to}時`;
}

// occurred_time ("H:MM"/"HH:MM") の配列から2時間刻みの件数配列（長さ12）を作る
export function bucketHourBands(times: Array<string | null | undefined>): number[] {
  const bands = new Array(HOUR_BAND_COUNT).fill(0);
  for (const t of times) {
    if (!t) continue;
    const h = parseInt(t.split(':')[0], 10);
    if (isNaN(h) || h < 0 || h > 23) continue;
    bands[Math.floor(h / HOUR_BAND_SIZE)]++;
  }
  return bands;
}

// 6時間刻み4本（ホームカードの省スペース表示用）
export const COARSE_BAND_LABELS = ['0-6時（深夜・早朝）', '6-12時（午前）', '12-18時（午後）', '18-24時（夜間）'];
export function bucketCoarseBands(times: Array<string | null | undefined>): number[] {
  const bands = [0, 0, 0, 0];
  for (const t of times) {
    if (!t) continue;
    const h = parseInt(t.split(':')[0], 10);
    if (isNaN(h) || h < 0 || h > 23) continue;
    bands[Math.floor(h / 6)]++;
  }
  return bands;
}

export function faultBand(pct: number | null): '50%以上' | '1〜49%' | '0%' | '未確定' {
  if (pct === null || pct === undefined) return '未確定';
  if (pct >= 50) return '50%以上';
  if (pct >= 1) return '1〜49%';
  return '0%';
}

// occurred_date ("YYYY-MM-DD") の配列から曜日別件数（長さ7、0=日〜6=土）を作る。
// タイムゾーン起因のズレを避けるため必ずDate.UTCで厳密パースする。
export const WEEKDAY_LABELS_JA = ['日', '月', '火', '水', '木', '金', '土'];
export function bucketWeekday(dates: Array<string | null | undefined>): number[] {
  const bands = new Array(7).fill(0);
  for (const dstr of dates) {
    if (!dstr) continue;
    const m = dstr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) continue;
    const w = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
    bands[w]++;
  }
  return bands;
}

// 事故データ配下4画面（月次一覧/分析・ランキング/予測カレンダー/研修案内印刷）共通のタブナビ
export function accidentsTabNav(active: 'list' | 'analysis' | 'forecast' | 'training' | 'person' | 'division' | 'material'): string {
  const tabs: Array<{ id: typeof active; label: string; href: string }> = [
    { id: 'list', label: '月次一覧', href: `${ADMIN_PATH}/accidents` },
    { id: 'analysis', label: '分析・ランキング', href: `${ADMIN_PATH}/accidents/analysis` },
    { id: 'forecast', label: '予測カレンダー', href: `${ADMIN_PATH}/accidents/forecast` },
    { id: 'training', label: '事故研修案内', href: `${ADMIN_PATH}/accidents/training` },
    { id: 'person', label: '個人別レポート', href: `${ADMIN_PATH}/accidents/person` },
    { id: 'division', label: '事故防止AI', href: `${ADMIN_PATH}/accidents/division` },
    { id: 'material', label: '教材', href: `${ADMIN_PATH}/accidents/material` },
  ];
  return `<div class="ac-tabnav">` + tabs.map(t =>
    `<a class="ac-tab-link${t.id === active ? ' active' : ''}" href="${t.href}">${t.label}</a>`
  ).join('') + `</div>`;
}

// 期間（開始日〜終了日）絞り込みUI。個人別レポート・課別レポートで共通利用。
// 呼び出し側ページは必ず `function acPeriodApply(since, until) { ... }`（URLを組み立ててlocation.hrefする関数）を
// 自身の<script>内に定義すること。CSSは PERIOD_FILTER_BAR_CSS を各ページの<style>ブロックに含める。
export const PERIOD_FILTER_BAR_CSS = `
  .ac-period-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:14px; }
  .ac-period-input { border:1px solid #d1d5db; border-radius:8px; padding:8px 10px; font-size:13px; background:#fff; }
  .ac-period-sep { color:#9ca3af; font-size:13px; }
  .ac-period-btn { border:none; border-radius:8px; padding:8px 14px; font-size:12px; font-weight:700; cursor:pointer; }
  .ac-period-btn-primary { background:#1a3a5c; color:#fff; }
  .ac-period-presets { display:flex; gap:6px; flex-wrap:wrap; margin-left:6px; }
  .ac-period-preset { border:1px solid #d1d5db; background:#f9fafb; color:#475569; border-radius:14px; padding:5px 12px; font-size:11px; cursor:pointer; }
  .ac-period-preset:hover { background:#eef2ff; border-color:#a5b4fc; }
`;

export interface PeriodFilterBarOpts {
  since: string | null;
  until: string | null;
}

export function periodFilterBarHtml(opts: PeriodFilterBarOpts): string {
  const { since, until } = opts;
  return `
<div class="ac-period-bar">
  <input type="date" class="ac-period-input" id="ac-period-since" value="${since ?? ''}">
  <span class="ac-period-sep">〜</span>
  <input type="date" class="ac-period-input" id="ac-period-until" value="${until ?? ''}">
  <button type="button" class="ac-period-btn ac-period-btn-primary" onclick="acPeriodApply(document.getElementById('ac-period-since').value, document.getElementById('ac-period-until').value)">この期間で表示</button>
  <span class="ac-period-presets">
    <button type="button" class="ac-period-preset" onclick="acPeriodApplyPreset(1)">今月</button>
    <button type="button" class="ac-period-preset" onclick="acPeriodApplyPreset(3)">直近3ヶ月</button>
    <button type="button" class="ac-period-preset" onclick="acPeriodApplyPreset(6)">直近6ヶ月</button>
    <button type="button" class="ac-period-preset" onclick="acPeriodApplyPreset(12)">直近12ヶ月</button>
    <button type="button" class="ac-period-preset" onclick="acPeriodApplyPreset(24)">直近24ヶ月</button>
    <button type="button" class="ac-period-preset" onclick="acPeriodApply('', '')">全期間</button>
  </span>
</div>
<script>
function acPeriodApplyPreset(months) {
  var today = new Date();
  var since = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
  function fmt(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  acPeriodApply(fmt(since), fmt(today));
}
</script>`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}年${parseInt(m, 10)}月`;
}

export interface AccidentsPageOpts {
  selectedMonth: string;
  availableMonths: string[];
  totalCount: number;
  prevMonthCount: number | null;
  prevMonthLabel: string;
  divisionBreakdown: Array<{ division: number | null; cnt: number }>;
  records: AccidentRecord[];
}

export function accidentsPage(opts: AccidentsPageOpts): string {
  const { selectedMonth, availableMonths, totalCount, prevMonthCount, prevMonthLabel, divisionBreakdown, records } = opts;

  const monthOptions = availableMonths.map(ym =>
    `<option value="${ym}" ${ym === selectedMonth ? 'selected' : ''}>${monthLabel(ym)}</option>`
  ).join('');

  const diffHtml = (() => {
    if (prevMonthCount === null) return '<span class="ac-note">前月比 —</span>';
    const diff = totalCount - prevMonthCount;
    if (diff === 0) return `<span class="ac-note">前月比 ±0（${prevMonthLabel} ${prevMonthCount}件）</span>`;
    const up = diff > 0;
    return `<span class="ac-note" style="color:${up ? '#b91c1c' : '#16a34a'};font-weight:700;">前月比 ${up ? '+' : ''}${diff}（${prevMonthLabel} ${prevMonthCount}件）</span>`;
  })();

  const faultCounts = { '0%': 0, '1〜49%': 0, '50%以上': 0, '未確定': 0 };
  for (const r of records) faultCounts[faultBand(r.fault_pct_planned)]++;

  const divMax = Math.max(...divisionBreakdown.map(d => d.cnt), 1);
  const divisionHtml = divisionBreakdown.length === 0
    ? '<div class="ac-empty">データなし</div>'
    : divisionBreakdown.map(d => `
      <div class="ac-bar-row">
        <span class="ac-bar-name">${d.division != null ? `${d.division}課` : '不明'}</span>
        <div class="ac-bar-track"><div class="ac-bar-fill" style="width:${Math.round(d.cnt / divMax * 100)}%;"></div></div>
        <span class="ac-bar-cnt">${d.cnt}件</span>
      </div>`).join('');

  const hourBands = bucketHourBands(records.map(r => r.occurred_time));
  const hourMax = Math.max(...hourBands, 1);
  const hourChartHtml = `<div class="ac-hbars">` + hourBands.map((cnt, i) => `
    <div class="ac-hbar-col">
      <div class="ac-hbar-val">${cnt > 0 ? cnt : ''}</div>
      <div class="ac-hbar" style="height:${cnt > 0 ? Math.max(Math.round(cnt / hourMax * 90), 5) : 2}px;"></div>
      <div class="ac-hbar-lb">${i % 2 === 0 ? i * HOUR_BAND_SIZE : ''}</div>
    </div>`).join('') + `</div>`;

  const rowsHtml = records.length === 0
    ? `<tr><td colspan="9" style="padding:28px;text-align:center;color:#9ca3af;">この月度の事故データはありません</td></tr>`
    : records.map(r => `
      <tr class="ac-row" onclick="openAccidentDetail(${r.id})" data-division="${r.division ?? ''}" data-search="${escHtml([r.emp_name, r.plate_no, r.emp_no].filter(Boolean).join(' '))}">
        <td>${escHtml(r.occurred_date.slice(5).replace('-', '/'))} ${escHtml(r.occurred_time ?? '')}</td>
        <td>${r.division != null ? `${r.division}課` : ''} ${escHtml(r.team ?? '')}</td>
        <td>${escHtml(r.emp_name ?? '')}</td>
        <td><span class="ac-badge">${escHtml((r.accident_category ?? '').replace(/\s+/g, ''))}</span></td>
        <td>${escHtml(r.accident_target ?? '')}</td>
        <td>${escHtml(r.business_status ?? '')}</td>
        <td>${r.fault_pct_planned ?? '—'}%</td>
        <td>${escHtml([r.loc_city, r.loc_town].filter(Boolean).join(' '))}</td>
        <td>${escHtml(r.plate_no ?? '')}</td>
      </tr>`).join('');

  return `
<style>
  .ac { font-family:'Hiragino Sans','Meiryo',sans-serif; max-width:1160px; }
  .ac-tabnav { display:flex; gap:4px; margin-bottom:14px; border-bottom:1px solid #e5e7eb; }
  .ac-tab-link { padding:9px 16px; font-size:13px; font-weight:600; color:#64748b; text-decoration:none; border-bottom:2px solid transparent; margin-bottom:-1px; }
  .ac-tab-link:hover { color:#1a3a5c; }
  .ac-tab-link.active { color:#1a3a5c; border-bottom-color:#1a3a5c; }
  .ac-top { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px; }
  .ac-month-select { border:1px solid #d1d5db; border-radius:8px; padding:9px 12px; font-size:14px; background:#fff; }
  .ac-kpis { display:grid; grid-template-columns:1.2fr 1fr 1.6fr; gap:14px; margin-bottom:16px; }
  .ac-card { background:#fff; border:1px solid #e8edf3; border-radius:12px; padding:16px 18px; }
  .ac-card-title { font-size:12px; font-weight:700; color:#94a3b8; letter-spacing:.05em; margin-bottom:10px; }
  .ac-kpi-main { font-size:32px; font-weight:800; color:#1a3a5c; line-height:1; }
  .ac-kpi-unit { font-size:12px; font-weight:600; color:#94a3b8; margin-left:6px; }
  .ac-note { font-size:12px; color:#64748b; }
  .ac-fault-row { display:flex; gap:14px; margin-top:12px; flex-wrap:wrap; }
  .ac-fault-chip { font-size:12px; color:#374151; background:#f1f5f9; border-radius:6px; padding:5px 10px; }
  .ac-fault-chip b { color:#1a3a5c; }
  .ac-bar-row { display:flex; align-items:center; gap:10px; padding:5px 0; }
  .ac-bar-name { font-size:12px; color:#475569; font-weight:600; width:44px; flex:none; }
  .ac-bar-track { flex:1; height:10px; background:#f1f5f9; border-radius:5px; overflow:hidden; }
  .ac-bar-fill { height:100%; background:linear-gradient(90deg,#2d6a9f,#1a3a5c); border-radius:5px; }
  .ac-bar-cnt { font-size:12px; color:#1e293b; font-weight:700; width:38px; text-align:right; flex:none; }
  .ac-empty { padding:14px; text-align:center; color:#9ca3af; font-size:13px; }
  .ac-hbars { display:flex; align-items:flex-end; gap:4px; height:120px; padding-top:4px; }
  .ac-hbar-col { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:3px; min-width:0; }
  .ac-hbar-val { font-size:10px; font-weight:700; color:#475569; line-height:1; height:11px; }
  .ac-hbar { width:100%; max-width:20px; border-radius:3px 3px 1px 1px; background:#b45309; transition:height .2s; }
  .ac-hbar-lb { font-size:9px; color:#94a3b8; }
  .ac-table-wrap { background:#fff; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,.08); overflow-x:auto; }
  .ac-table { width:100%; border-collapse:collapse; min-width:900px; font-size:13px; }
  .ac-table th { padding:9px 12px; text-align:left; background:#f9fafb; color:#6b7280; font-size:12px; border-bottom:1px solid #e5e7eb; white-space:nowrap; }
  .ac-table td { padding:9px 12px; border-bottom:1px solid #f3f4f6; white-space:nowrap; }
  .ac-row { cursor:pointer; }
  .ac-row:hover { background:#f9fafb; }
  .ac-badge { background:#fee2e2; color:#991b1b; padding:2px 8px; border-radius:4px; font-size:11px; white-space:nowrap; }
  .ac-btn { padding:9px 16px; border-radius:8px; font-size:13px; font-weight:600; cursor:pointer; border:1px solid transparent; text-decoration:none; display:inline-block; }
  .ac-btn-primary { background:#1a3a5c; color:#fff; }
  .ac-btn-green { background:#f0fdf4; color:#166534; border-color:#bbf7d0; }
  .ac-modal-bg { display:none; position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:60; overflow-y:auto; }
  .ac-modal { background:#fff; border-radius:10px; max-width:560px; margin:6vh auto 6vh; padding:22px 24px; }
  .ac-detail-row { display:flex; justify-content:space-between; gap:14px; padding:7px 0; border-bottom:1px solid #f3f4f6; font-size:13px; }
  .ac-detail-label { color:#94a3b8; flex:none; width:120px; }
  .ac-detail-value { color:#1e293b; text-align:right; flex:1; }
  .ac-import-panel { display:none; background:#fff; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,.08); padding:20px 24px; margin-bottom:16px; }
  .ac-drop { display:block; border:2px dashed #d1d5db; border-radius:8px; padding:26px; text-align:center; cursor:pointer; margin-bottom:12px; }
  @media (max-width:900px) { .ac-kpis { grid-template-columns:1fr; } }
</style>
<div class="ac">
  ${accidentsTabNav('list')}
  <div class="ac-top">
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <select class="ac-month-select" id="ac-month-select" onchange="location.href='${ADMIN_PATH}/accidents?month='+this.value">
        ${monthOptions}
      </select>
      <select class="ac-month-select" id="ac-division-filter" onchange="acApplyFilter()">
        <option value="">全課</option>
        <option value="1">1課</option>
        <option value="2">2課</option>
        <option value="3">3課</option>
        <option value="4">4課</option>
      </select>
      <input class="ac-month-select" id="ac-search" placeholder="氏名・車番で絞り込み" oninput="acApplyFilter()" style="width:200px;">
    </div>
    <div style="display:flex;gap:8px;">
      <button class="ac-btn ac-btn-green" onclick="toggleAcImport()">CSVインポート</button>
    </div>
  </div>

  <!-- CSVインポートパネル -->
  <div class="ac-import-panel" id="ac-import-panel">
    <h2 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">CSVインポート</h2>
    <p style="font-size:12px;color:#6b7280;margin:0 0 14px;">事故データCSV（Shift-JIS、保険システム出力）を選択してください。事故番号をキーに、既存データは上書き更新、新しい事故は追加します。</p>
    <input type="file" id="ac-csv-input" accept=".csv,.CSV" style="display:none;" onchange="handleAcCsvFile(this.files[0])">
    <label class="ac-drop" id="ac-drop-zone" for="ac-csv-input"
      ondragover="event.preventDefault();this.style.borderColor='#1a3a5c'"
      ondragleave="this.style.borderColor='#d1d5db'"
      ondrop="handleAcCsvDrop(event)">
      <div style="font-size:13px;color:#6b7280;">クリックまたはドラッグでCSVファイルを選択</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:4px;">Shift-JIS / UTF-8 両対応</div>
    </label>
    <div id="ac-import-result" style="font-size:13px;color:#374151;"></div>
  </div>

  <!-- KPI -->
  <div class="ac-kpis">
    <div class="ac-card">
      <div class="ac-card-title">今月度の事故件数</div>
      <div class="ac-kpi-main">${totalCount}<span class="ac-kpi-unit">件</span></div>
      <div style="margin-top:8px;">${diffHtml}</div>
      <div class="ac-fault-row">
        <span class="ac-fault-chip">予定過失0% <b>${faultCounts['0%']}件</b></span>
        <span class="ac-fault-chip">1〜49% <b>${faultCounts['1〜49%']}件</b></span>
        <span class="ac-fault-chip">50%以上 <b>${faultCounts['50%以上']}件</b></span>
      </div>
    </div>
    <div class="ac-card">
      <div class="ac-card-title">課別内訳</div>
      ${divisionHtml}
    </div>
    <div class="ac-card">
      <div class="ac-card-title">発生時間帯（2時間刻み）</div>
      ${hourChartHtml}
    </div>
  </div>

  <!-- 一覧 -->
  <div class="ac-table-wrap">
    <table class="ac-table">
      <thead>
        <tr>
          <th>発生日時</th><th>課・班</th><th>氏名</th><th>区分</th><th>相手・対象</th>
          <th>営業状況</th><th>予定過失</th><th>場所</th><th>車番</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  </div>
</div>

<!-- 詳細モーダル -->
<div class="ac-modal-bg" id="ac-modal-bg" onclick="if(event.target===this)this.style.display='none'">
  <div class="ac-modal" id="ac-modal"></div>
</div>

<script>
var AC_RECORDS = ${safeJson(records)};

function acApplyFilter() {
  var division = document.getElementById('ac-division-filter').value;
  var q = document.getElementById('ac-search').value.trim();
  document.querySelectorAll('.ac-row').forEach(function(tr) {
    var matchesDivision = !division || tr.getAttribute('data-division') === division;
    var matchesSearch = !q || tr.getAttribute('data-search').indexOf(q) !== -1;
    tr.style.display = (matchesDivision && matchesSearch) ? '' : 'none';
  });
}

function openAccidentDetail(id) {
  var r = AC_RECORDS.find(function(x) { return x.id === id; });
  if (!r) return;
  function row(label, value) {
    return '<div class="ac-detail-row"><span class="ac-detail-label">' + label + '</span><span class="ac-detail-value">' + (value === null || value === undefined || value === '' ? '—' : value) + '</span></div>';
  }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  var html = ''
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
    + '<div style="font-size:15px;font-weight:700;color:#1a3a5c;">事故詳細　' + esc(r.accident_no) + '</div>'
    + '<button onclick="document.getElementById(\\'ac-modal-bg\\').style.display=\\'none\\'" style="border:none;background:none;font-size:20px;cursor:pointer;color:#9ca3af;">&times;</button>'
    + '</div>'
    + row('発生日時', esc(r.occurred_date) + ' ' + esc(r.occurred_time))
    + row('天候', esc(r.weather))
    + row('課・班', (r.division != null ? r.division + '課 ' : '') + esc(r.team))
    + row('氏名（社員番号）', esc(r.emp_name) + (r.emp_no ? '（' + esc(r.emp_no) + '）' : ''))
    + row('年齢・勤続', (r.emp_age != null ? r.emp_age + '歳' : '—') + ' / ' + (r.emp_tenure_years != null ? '勤続' + r.emp_tenure_years + '年' : '—'))
    + row('過去3年の事故件数', r.past3y_accident_count)
    + row('事故区分', esc((r.accident_category || '').replace(/\\s+/g,'')))
    + row('車両', esc(r.plate_no) + (r.vehicle_code ? '（' + esc(r.vehicle_code) + '）' : ''))
    + row('営業状況', esc(r.business_status))
    + row('事故対象', esc(r.accident_target))
    + row('事故形態', esc(r.accident_form))
    + row('道路状況', esc(r.road_condition) + (r.road_shape ? ' / ' + esc(r.road_shape) : ''))
    + row('場所', [r.loc_city, r.loc_town, r.loc_addr].filter(Boolean).map(esc).join(' '))
    + row('過失割合（予定/確定）', (r.fault_pct_planned != null ? r.fault_pct_planned + '%' : '—') + ' / ' + (r.fault_pct_final != null ? r.fault_pct_final + '%' : '—'))
    + row('損害額', r.damage_amount != null ? '¥' + Number(r.damage_amount).toLocaleString('ja-JP') : '—')
    + row('原因', esc(r.cause_direct) + (r.cause_reason ? '（' + esc(r.cause_reason) + '）' : ''))
    + (r.memo ? '<div style="margin-top:12px;padding:10px 12px;background:#f9fafb;border-radius:8px;font-size:12px;color:#374151;white-space:pre-wrap;line-height:1.6;">' + esc(r.memo) + '</div>' : '')
    + '<div style="margin-top:16px;text-align:right;">'
    + '<button onclick="deleteAccident(' + r.id + ')" style="padding:7px 14px;background:#fee2e2;color:#991b1b;border:none;border-radius:6px;font-size:12px;cursor:pointer;">この事故データを削除</button>'
    + '</div>';
  document.getElementById('ac-modal').innerHTML = html;
  document.getElementById('ac-modal-bg').style.display = 'block';
}

async function deleteAccident(id) {
  if (!confirm('この事故データを削除しますか？\\nCSVインポート時の誤登録などの訂正用です。この操作は取り消せません。')) return;
  var res = await fetch('${ADMIN_PATH}/api/accidents/' + id, { method: 'DELETE' });
  if (res.ok) { location.reload(); }
  else { alert('削除に失敗しました。'); }
}

function toggleAcImport() {
  var p = document.getElementById('ac-import-panel');
  p.style.display = p.style.display === 'none' || !p.style.display ? 'block' : 'none';
}

function handleAcCsvDrop(ev) {
  ev.preventDefault();
  document.getElementById('ac-drop-zone').style.borderColor = '#d1d5db';
  var file = ev.dataTransfer.files[0];
  if (file) handleAcCsvFile(file);
}

function handleAcCsvFile(file) {
  if (!file) return;
  var resultEl = document.getElementById('ac-import-result');
  resultEl.textContent = '読み込み中…';
  var reader = new FileReader();
  reader.onload = async function(e) {
    var buf = e.target.result;
    var text;
    try { text = new TextDecoder('shift-jis').decode(buf); }
    catch (err) { text = new TextDecoder('utf-8').decode(buf); }
    await importAcCsvText(text, resultEl);
  };
  reader.readAsArrayBuffer(file);
}

// 引用符対応の簡易CSV行パーサー（Memo列に将来カンマが含まれても崩れないようにする）
function parseAcCsvLine(line) {
  var cols = [];
  var cur = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else { cur += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { cols.push(cur); cur = ''; }
      else { cur += ch; }
    }
  }
  cols.push(cur);
  return cols.map(function(c) { return c.trim(); });
}

function normalizeAcDate(raw) {
  var m = (raw || '').match(/^(\\d{4})\\/(\\d{1,2})\\/(\\d{1,2})$/);
  if (!m) return null;
  return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
}
function normalizeAcTime(raw) {
  var m = (raw || '').match(/^(\\d{1,2}):(\\d{2})$/);
  if (!m) return null;
  return m[1].padStart(2, '0') + ':' + m[2];
}
function toIntOrNull(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  var n = parseInt(String(raw).replace(/,/g, ''), 10);
  return isNaN(n) ? null : n;
}

async function importAcCsvText(text, resultEl) {
  var lines = text.split(/\\r?\\n/).filter(function(l) { return l.trim(); });
  if (lines.length < 2) { resultEl.textContent = 'データ行がありません。'; return; }
  var header = parseAcCsvLine(lines[0]);
  function idx(name) { return header.indexOf(name); }
  var col = {
    no: idx('事故番号'), office: idx('営業所'), vcode: idx('車両コード'), plate: idx('ナンバープレート'),
    div: idx('課'), team: idx('班'), empNo: idx('コード'), empName: idx('氏\\u3000名'),
    cat: idx('事故区分'), date: idx('発生日付'), time: idx('発生時間'), weather: idx('発生天候'),
    city: idx('場所_市町村'), town: idx('場所_町名'), addr: idx('場所_番地'),
    faultP: idx('基本_予定_過失％'), faultF: idx('基本_確定_過失％'), damage: idx('基本_確定_損害額'),
    target: idx('基本_事故対象'), form: idx('基本_事故形態'), road: idx('基本_道状_路面状況'),
    biz: idx('基本_営業状況'), age: idx('社員_年齢○'), tenure: idx('社員_勤続年数○'), memo: idx('Memo○'),
    past3y: idx('社員_過去3年間の事故'), shape: idx('環境_道路形態２○'), causeR: idx('他_分析_原因の引起理'), causeD: idx('他_分析_直接原因○'),
  };
  if (col.no < 0 || col.date < 0) {
    resultEl.textContent = 'CSVの形式が想定と異なります（事故番号・発生日付の列が見つかりません）。';
    return;
  }

  var records = [];
  for (var i = 1; i < lines.length; i++) {
    var cols = parseAcCsvLine(lines[i]);
    var accidentNo = cols[col.no];
    var occurredDate = normalizeAcDate(cols[col.date]);
    if (!accidentNo || !occurredDate) continue;
    records.push({
      accident_no: accidentNo,
      office: cols[col.office] || null,
      vehicle_code: cols[col.vcode] || null,
      plate_no: cols[col.plate] || null,
      division: toIntOrNull(cols[col.div]),
      team: cols[col.team] || null,
      emp_no: cols[col.empNo] || null,
      emp_name: cols[col.empName] || null,
      accident_category: cols[col.cat] || null,
      occurred_date: occurredDate,
      occurred_time: normalizeAcTime(cols[col.time]),
      weather: cols[col.weather] || null,
      loc_city: cols[col.city] || null,
      loc_town: cols[col.town] || null,
      loc_addr: cols[col.addr] || null,
      fault_pct_planned: toIntOrNull(cols[col.faultP]),
      fault_pct_final: toIntOrNull(cols[col.faultF]),
      damage_amount: toIntOrNull(cols[col.damage]),
      accident_target: cols[col.target] || null,
      accident_form: cols[col.form] || null,
      road_condition: cols[col.road] || null,
      business_status: cols[col.biz] || null,
      emp_age: toIntOrNull(cols[col.age]),
      emp_tenure_years: toIntOrNull(cols[col.tenure]),
      memo: cols[col.memo] || null,
      past3y_accident_count: toIntOrNull(cols[col.past3y]),
      road_shape: cols[col.shape] || null,
      cause_reason: cols[col.causeR] || null,
      cause_direct: cols[col.causeD] || null,
    });
  }

  if (!records.length) { resultEl.textContent = '取り込めるデータ行がありませんでした。'; return; }

  resultEl.textContent = 'インポート中… (' + records.length + '件)';
  try {
    var res = await fetch('${ADMIN_PATH}/api/accidents/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: records })
    });
    var body = await res.json();
    if (!res.ok) { resultEl.textContent = 'インポートに失敗しました: ' + (body.error || res.status); return; }
    resultEl.textContent = body.imported + '件を取り込みました。画面を更新します…';
    setTimeout(function() { location.reload(); }, 900);
  } catch (err) {
    resultEl.textContent = '通信エラーが発生しました。';
  }
}
</script>
`;
}
