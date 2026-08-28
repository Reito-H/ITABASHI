// 事故データ 分析・ランキングページ（/accidents/analysis）
// 課別事故傾向、事故回数ランキング（個人・課・車両）、分析しうる限りの詳細クロス集計を1画面にまとめる。
import { ADMIN_PATH } from '../config';
import { escHtml, safeJson } from './layout';
import {
  type AccidentRecord,
  HOUR_BAND_SIZE,
  bucketHourBands,
  bucketWeekday,
  WEEKDAY_LABELS_JA,
  faultBand,
  accidentsTabNav,
} from './accidents';
export interface AccidentsAnalysisOpts {
  months: number;
  selectedDivision: number | null;
  records: AccidentRecord[];      // 期間内の全レコード
  prevRecords: AccidentRecord[];  // 直前の同じ長さの期間（課別ランキングの前期比較用）
}

// ===== 集計ヘルパー =====

function groupCount(records: AccidentRecord[], keyFn: (r: AccidentRecord) => string | null): Array<{ key: string; cnt: number }> {
  const map = new Map<string, number>();
  for (const r of records) {
    const k = keyFn(r) || '不明';
    map.set(k, (map.get(k) || 0) + 1);
  }
  return Array.from(map.entries()).map(([key, cnt]) => ({ key, cnt })).sort((a, b) => b.cnt - a.cnt);
}

function barListHtml(items: Array<{ key: string; cnt: number }>, limit?: number): string {
  const list = limit ? items.slice(0, limit) : items;
  if (list.length === 0) return '<div class="ac-empty">データなし</div>';
  const max = Math.max(...list.map(i => i.cnt), 1);
  return list.map(i => `
    <div class="ac-bar-row">
      <span class="ac-bar-name aa-bar-name-wide" title="${escHtml(i.key)}">${escHtml(i.key.length > 13 ? i.key.slice(0, 13) + '…' : i.key)}</span>
      <div class="ac-bar-track"><div class="ac-bar-fill" style="width:${Math.round(i.cnt / max * 100)}%;"></div></div>
      <span class="ac-bar-cnt">${i.cnt}件</span>
    </div>`).join('');
}

function orderedBarListHtml(records: AccidentRecord[], bucketFn: (r: AccidentRecord) => string, order: string[]): string {
  const counts = new Map<string, number>();
  for (const r of records) { const k = bucketFn(r); counts.set(k, (counts.get(k) || 0) + 1); }
  return barListHtml(order.map(k => ({ key: k, cnt: counts.get(k) || 0 })));
}

function damageBucket(amount: number | null): string {
  if (amount == null) return '不明';
  if (amount <= 0) return '0円';
  if (amount < 100000) return '10万円未満';
  if (amount < 500000) return '10〜50万円';
  if (amount < 1000000) return '50〜100万円';
  return '100万円以上';
}
const DAMAGE_ORDER = ['0円', '10万円未満', '10〜50万円', '50〜100万円', '100万円以上', '不明'];

function ageBucket(age: number | null): string {
  if (age == null) return '不明';
  if (age < 25) return '〜24歳';
  if (age < 30) return '25〜29歳';
  if (age < 35) return '30〜34歳';
  if (age < 40) return '35〜39歳';
  if (age < 45) return '40〜44歳';
  if (age < 50) return '45〜49歳';
  if (age < 55) return '50〜54歳';
  if (age < 60) return '55〜59歳';
  return '60歳〜';
}
const AGE_ORDER = ['〜24歳', '25〜29歳', '30〜34歳', '35〜39歳', '40〜44歳', '45〜49歳', '50〜54歳', '55〜59歳', '60歳〜', '不明'];

function tenureBucket(years: number | null): string {
  if (years == null) return '不明';
  if (years < 1) return '1年未満';
  if (years < 3) return '1〜3年';
  if (years < 5) return '3〜5年';
  if (years < 10) return '5〜10年';
  return '10年以上';
}
const TENURE_ORDER = ['1年未満', '1〜3年', '3〜5年', '5〜10年', '10年以上', '不明'];

function past3yBucket(n: number | null): string {
  if (n == null) return '不明';
  if (n <= 0) return '0件';
  if (n === 1) return '1件';
  if (n === 2) return '2件';
  return '3件以上';
}
const PAST3Y_ORDER = ['0件', '1件', '2件', '3件以上', '不明'];

export interface IndividualRow { key: string; name: string; division: number | null; team: string | null; cnt: number; lastDate: string; faultSum: number; faultCnt: number; damageSum: number; }
export function buildIndividualRanking(records: AccidentRecord[]): IndividualRow[] {
  const map = new Map<string, IndividualRow>();
  for (const r of records) {
    const key = r.emp_no || r.emp_name || '不明';
    if (!map.has(key)) {
      map.set(key, { key, name: r.emp_name || '不明', division: r.division, team: r.team, cnt: 0, lastDate: r.occurred_date, faultSum: 0, faultCnt: 0, damageSum: 0 });
    }
    const e = map.get(key)!;
    e.cnt++;
    if (r.occurred_date > e.lastDate) e.lastDate = r.occurred_date;
    if (r.fault_pct_planned != null) { e.faultSum += r.fault_pct_planned; e.faultCnt++; }
    e.damageSum += r.damage_amount || 0;
  }
  return Array.from(map.values()).sort((a, b) => b.cnt - a.cnt);
}

interface DivisionRow { division: number; cnt: number; prevCnt: number; diff: number; avgFault: number | null; damageSum: number; }
function buildDivisionRanking(records: AccidentRecord[], prevRecords: AccidentRecord[]): DivisionRow[] {
  return [1, 2, 3, 4].map(div => {
    const cur = records.filter(r => r.division === div);
    const prevCnt = prevRecords.filter(r => r.division === div).length;
    const faultVals = cur.map(r => r.fault_pct_planned).filter((v): v is number => v != null);
    const avgFault = faultVals.length ? Math.round(faultVals.reduce((a, b) => a + b, 0) / faultVals.length) : null;
    const damageSum = cur.reduce((s, r) => s + (r.damage_amount || 0), 0);
    return { division: div, cnt: cur.length, prevCnt, diff: cur.length - prevCnt, avgFault, damageSum };
  }).sort((a, b) => b.cnt - a.cnt);
}

interface VehicleRow { plate: string; division: number | null; cnt: number; }
function buildVehicleRanking(records: AccidentRecord[]): VehicleRow[] {
  const map = new Map<string, VehicleRow>();
  for (const r of records) {
    if (!r.plate_no) continue;
    if (!map.has(r.plate_no)) map.set(r.plate_no, { plate: r.plate_no, division: r.division, cnt: 0 });
    map.get(r.plate_no)!.cnt++;
  }
  return Array.from(map.values()).sort((a, b) => b.cnt - a.cnt).slice(0, 10);
}

function buildMonthlyDivisionTrend(records: AccidentRecord[], months: number): { labels: string[]; datasets: Array<{ label: string; data: number[] }> } {
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const labels: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() - i, 1));
    labels.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  const idx = new Map<string, number>();
  labels.forEach((l, i) => idx.set(l, i));
  const divisions = [1, 2, 3, 4];
  const counts = divisions.map(() => new Array(labels.length).fill(0));
  for (const r of records) {
    const li = idx.get(r.occurred_date.slice(0, 7));
    if (li === undefined) continue;
    const di = divisions.indexOf(r.division ?? -1);
    if (di === -1) continue;
    counts[di][li]++;
  }
  return { labels, datasets: divisions.map((div, i) => ({ label: `${div}課`, data: counts[i] })) };
}

function buildCauseCrossTab(records: AccidentRecord[], topN = 8): { reasons: string[]; directs: string[]; matrix: number[][]; max: number } {
  const reasons = groupCount(records, r => r.cause_reason).slice(0, topN).map(x => x.key);
  const directs = groupCount(records, r => r.cause_direct).slice(0, topN).map(x => x.key);
  const matrix = reasons.map(reason => directs.map(direct =>
    records.filter(r => (r.cause_reason || '不明') === reason && (r.cause_direct || '不明') === direct).length
  ));
  const max = Math.max(...matrix.flat(), 1);
  return { reasons, directs, matrix, max };
}

function monthLabelShort(ym: string): string {
  const [y, m] = ym.split('-');
  return `${y}/${parseInt(m, 10)}`;
}

const DIV_CHART_COLORS = ['#1a3a5c', '#2d6a9f', '#b45309', '#166534'];

export function accidentsAnalysisPage(opts: AccidentsAnalysisOpts): string {
  const { months, selectedDivision, records, prevRecords } = opts;

  const monthOptions = [6, 12, 24, 36].map(m =>
    `<option value="${m}" ${m === months ? 'selected' : ''}>直近${m}ヶ月</option>`
  ).join('');
  const divOptions = ['<option value="">全社</option>', ...[1, 2, 3, 4].map(d =>
    `<option value="${d}" ${d === selectedDivision ? 'selected' : ''}>${d}課</option>`)].join('');

  const individualRanking = buildIndividualRanking(records);
  const divisionRanking = buildDivisionRanking(records, prevRecords);
  const vehicleRanking = buildVehicleRanking(records);

  const individualRowsHtml = individualRanking.length === 0
    ? `<tr><td colspan="7" style="padding:20px;text-align:center;color:#9ca3af;">データなし</td></tr>`
    : individualRanking.map((r, i) => `
      <tr data-name="${escHtml(r.name)}">
        <td>${i + 1}</td>
        <td>${escHtml(r.name)}</td>
        <td>${r.division != null ? `${r.division}課 ` : ''}${escHtml(r.team || '')}</td>
        <td style="font-weight:700;">${r.cnt}件</td>
        <td>${escHtml(r.lastDate.slice(0, 10))}</td>
        <td>${r.faultCnt ? Math.round(r.faultSum / r.faultCnt) + '%' : '—'}</td>
        <td>${r.damageSum ? '¥' + r.damageSum.toLocaleString('ja-JP') : '—'}</td>
      </tr>`).join('');

  const divisionRowsHtml = divisionRanking.map(r => {
    const diffHtml = r.diff === 0
      ? '<span style="color:#94a3b8;">±0</span>'
      : `<span style="color:${r.diff > 0 ? '#b91c1c' : '#16a34a'};font-weight:700;">${r.diff > 0 ? '+' : ''}${r.diff}</span>`;
    return `
      <tr>
        <td>${r.division}課</td>
        <td style="font-weight:700;">${r.cnt}件</td>
        <td>${diffHtml}（前期${r.prevCnt}件）</td>
        <td>${r.avgFault != null ? r.avgFault + '%' : '—'}</td>
        <td>${r.damageSum ? '¥' + r.damageSum.toLocaleString('ja-JP') : '—'}</td>
      </tr>`;
  }).join('');

  const vehicleRowsHtml = vehicleRanking.length === 0
    ? `<tr><td colspan="4" style="padding:20px;text-align:center;color:#9ca3af;">データなし</td></tr>`
    : vehicleRanking.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escHtml(r.plate)}</td>
        <td>${r.division != null ? `${r.division}課` : '—'}</td>
        <td style="font-weight:700;">${r.cnt}件</td>
      </tr>`).join('');

  // 曜日別・時間帯別
  const weekdayBands = bucketWeekday(records.map(r => r.occurred_date));
  const weekdayMax = Math.max(...weekdayBands, 1);
  const weekdayChartHtml = `<div class="ac-hbars">` + weekdayBands.map((cnt, i) => `
    <div class="ac-hbar-col">
      <div class="ac-hbar-val">${cnt > 0 ? cnt : ''}</div>
      <div class="ac-hbar" style="height:${cnt > 0 ? Math.max(Math.round(cnt / weekdayMax * 90), 5) : 2}px;background:#2d6a9f;"></div>
      <div class="ac-hbar-lb">${WEEKDAY_LABELS_JA[i]}</div>
    </div>`).join('') + `</div>`;

  const hourBands = bucketHourBands(records.map(r => r.occurred_time));
  const hourMax = Math.max(...hourBands, 1);
  const hourChartHtml = `<div class="ac-hbars">` + hourBands.map((cnt, i) => `
    <div class="ac-hbar-col">
      <div class="ac-hbar-val">${cnt > 0 ? cnt : ''}</div>
      <div class="ac-hbar" style="height:${cnt > 0 ? Math.max(Math.round(cnt / hourMax * 90), 5) : 2}px;"></div>
      <div class="ac-hbar-lb">${i % 2 === 0 ? i * HOUR_BAND_SIZE : ''}</div>
    </div>`).join('') + `</div>`;

  // カテゴリ別
  const weatherHtml = barListHtml(groupCount(records, r => r.weather));
  const roadCondHtml = barListHtml(groupCount(records, r => r.road_condition));
  const roadShapeHtml = barListHtml(groupCount(records, r => r.road_shape));
  const formHtml = barListHtml(groupCount(records, r => r.accident_form ? r.accident_form.replace(/\s+/g, '') : null));
  const targetHtml = barListHtml(groupCount(records, r => r.accident_target));
  const bizHtml = barListHtml(groupCount(records, r => r.business_status));

  // 原因クロス集計
  const cross = buildCauseCrossTab(records);
  const crossHeadHtml = cross.directs.map(d => `<th>${escHtml(d.length > 8 ? d.slice(0, 8) + '…' : d)}</th>`).join('');
  const crossBodyHtml = cross.reasons.length === 0
    ? `<tr><td style="padding:20px;text-align:center;color:#9ca3af;" colspan="99">データなし</td></tr>`
    : cross.reasons.map((reason, ri) => `
      <tr>
        <td class="aa-heat-rowhead" title="${escHtml(reason)}">${escHtml(reason.length > 10 ? reason.slice(0, 10) + '…' : reason)}</td>
        ${cross.directs.map((_, ci) => {
          const v = cross.matrix[ri][ci];
          const alpha = v === 0 ? 0 : 0.15 + (v / cross.max) * 0.65;
          return `<td class="aa-heat-cell" style="background:rgba(180,83,9,${alpha});">${v || ''}</td>`;
        }).join('')}
      </tr>`).join('');

  // 過失割合（予定→確定）
  const plannedCounts = { '0%': 0, '1〜49%': 0, '50%以上': 0, '未確定': 0 };
  const finalCounts = { '0%': 0, '1〜49%': 0, '50%以上': 0, '未確定': 0 };
  for (const r of records) { plannedCounts[faultBand(r.fault_pct_planned)]++; finalCounts[faultBand(r.fault_pct_final)]++; }
  const faultChipsHtml = (label: string, counts: typeof plannedCounts) => `
    <div class="ac-fault-row" style="margin-top:6px;">
      <span style="font-size:11px;color:#94a3b8;width:52px;">${label}</span>
      <span class="ac-fault-chip">0% <b>${counts['0%']}件</b></span>
      <span class="ac-fault-chip">1〜49% <b>${counts['1〜49%']}件</b></span>
      <span class="ac-fault-chip">50%以上 <b>${counts['50%以上']}件</b></span>
      <span class="ac-fault-chip">未確定 <b>${counts['未確定']}件</b></span>
    </div>`;

  // 損害額
  const damageItems = DAMAGE_ORDER.map(k => ({ key: k, cnt: records.filter(r => damageBucket(r.damage_amount) === k).length }));
  const damageHtml = barListHtml(damageItems);
  const damageTotal = records.reduce((s, r) => s + (r.damage_amount || 0), 0);
  const damageAvg = records.length ? Math.round(damageTotal / records.length) : 0;

  // 属性
  const ageHtml = orderedBarListHtml(records, r => ageBucket(r.emp_age), AGE_ORDER);
  const tenureHtml = orderedBarListHtml(records, r => tenureBucket(r.emp_tenure_years), TENURE_ORDER);
  const past3yHtml = orderedBarListHtml(records, r => past3yBucket(r.past3y_accident_count), PAST3Y_ORDER);

  // 場所
  const locationRanking = groupCount(records, r => [r.loc_city, r.loc_town].filter(Boolean).join(' ') || null).slice(0, 15);
  const locationRowsHtml = locationRanking.length === 0
    ? `<tr><td colspan="2" style="padding:20px;text-align:center;color:#9ca3af;">データなし</td></tr>`
    : locationRanking.map(r => `<tr><td>${escHtml(r.key)}</td><td style="font-weight:700;">${r.cnt}件</td></tr>`).join('');

  const trend = buildMonthlyDivisionTrend(records, months);

  return `
<style>
  .aa { font-family:'Hiragino Sans','Meiryo',sans-serif; max-width:1160px; }
  .ac-tabnav { display:flex; gap:4px; margin-bottom:14px; border-bottom:1px solid #e5e7eb; }
  .ac-tab-link { padding:9px 16px; font-size:13px; font-weight:600; color:#64748b; text-decoration:none; border-bottom:2px solid transparent; margin-bottom:-1px; }
  .ac-tab-link:hover { color:#1a3a5c; }
  .ac-tab-link.active { color:#1a3a5c; border-bottom-color:#1a3a5c; }
  .aa-filter-bar { display:flex; gap:10px; margin-bottom:18px; }
  .aa-select { border:1px solid #d1d5db; border-radius:8px; padding:9px 12px; font-size:13px; background:#fff; }
  .aa-h2 { font-size:15px; font-weight:700; color:#1a3a5c; margin:28px 0 12px; padding-bottom:8px; border-bottom:1px solid #e5e7eb; }
  .aa-h2:first-of-type { margin-top:0; }
  .aa-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
  .aa-grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; }
  @media (max-width:900px) { .aa-grid-2, .aa-grid-3 { grid-template-columns:1fr; } }
  .ac-card { background:#fff; border:1px solid #e8edf3; border-radius:12px; padding:16px 18px; margin-bottom:14px; }
  .ac-card-title { font-size:12px; font-weight:700; color:#94a3b8; letter-spacing:.05em; margin-bottom:10px; }
  .ac-bar-row { display:flex; align-items:center; gap:10px; padding:5px 0; }
  .ac-bar-name { font-size:12px; color:#475569; font-weight:600; width:44px; flex:none; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .aa-bar-name-wide { width:110px; }
  .ac-bar-track { flex:1; height:10px; background:#f1f5f9; border-radius:5px; overflow:hidden; }
  .ac-bar-fill { height:100%; background:linear-gradient(90deg,#2d6a9f,#1a3a5c); border-radius:5px; }
  .ac-bar-cnt { font-size:12px; color:#1e293b; font-weight:700; width:44px; text-align:right; flex:none; }
  .ac-empty { padding:14px; text-align:center; color:#9ca3af; font-size:13px; }
  .ac-hbars { display:flex; align-items:flex-end; gap:4px; height:120px; padding-top:4px; }
  .ac-hbar-col { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:3px; min-width:0; }
  .ac-hbar-val { font-size:10px; font-weight:700; color:#475569; line-height:1; height:11px; }
  .ac-hbar { width:100%; max-width:20px; border-radius:3px 3px 1px 1px; background:#b45309; transition:height .2s; }
  .ac-hbar-lb { font-size:9px; color:#94a3b8; }
  .ac-fault-row { display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
  .ac-fault-chip { font-size:12px; color:#374151; background:#f1f5f9; border-radius:6px; padding:5px 10px; }
  .ac-fault-chip b { color:#1a3a5c; }
  .ac-table-wrap { background:#fff; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,.08); overflow-x:auto; margin-bottom:14px; }
  .ac-table { width:100%; border-collapse:collapse; font-size:13px; }
  .ac-table th { padding:9px 12px; text-align:left; background:#f9fafb; color:#6b7280; font-size:12px; border-bottom:1px solid #e5e7eb; white-space:nowrap; }
  .ac-table td { padding:9px 12px; border-bottom:1px solid #f3f4f6; white-space:nowrap; }
  .aa-heat-rowhead { font-size:11px; color:#475569; font-weight:600; background:#f9fafb; }
  .aa-heat-cell { text-align:center; font-size:12px; font-weight:700; color:#7c2d12; }
  .aa-chart-card { background:#fff; border:1px solid #e8edf3; border-radius:12px; padding:16px 18px; margin-bottom:22px; }
</style>
<div class="aa">
  ${accidentsTabNav('analysis')}
  <div class="aa-filter-bar">
    <select class="aa-select" onchange="aaReload()" id="aa-months">${monthOptions}</select>
    <select class="aa-select" onchange="aaReload()" id="aa-division">${divOptions}</select>
  </div>

  <h2 class="aa-h2">事故回数ランキング</h2>
  <input class="aa-select" id="aa-individual-search" placeholder="氏名で絞り込み" oninput="aaFilterIndividual()" style="width:220px;margin-bottom:10px;">
  <div class="ac-table-wrap">
    <table class="ac-table">
      <thead><tr><th>順位</th><th>氏名</th><th>課・班</th><th>件数</th><th>直近事故日</th><th>平均予定過失%</th><th>損害額合計</th></tr></thead>
      <tbody id="aa-individual-tbody">${individualRowsHtml}</tbody>
    </table>
  </div>
  <div class="aa-grid-2">
    <div class="ac-table-wrap">
      <table class="ac-table">
        <thead><tr><th>課</th><th>件数</th><th>前期比</th><th>平均予定過失%</th><th>損害額合計</th></tr></thead>
        <tbody>${divisionRowsHtml}</tbody>
      </table>
    </div>
    <div class="ac-table-wrap">
      <table class="ac-table">
        <thead><tr><th>順位</th><th>車番</th><th>課</th><th>件数（頻発車両）</th></tr></thead>
        <tbody>${vehicleRowsHtml}</tbody>
      </table>
    </div>
  </div>

  <h2 class="aa-h2">課別×月別推移</h2>
  <div class="aa-chart-card"><canvas id="aa-trend-chart" height="90"></canvas></div>

  <h2 class="aa-h2">時間・曜日の傾向</h2>
  <div class="aa-grid-2">
    <div class="ac-card"><div class="ac-card-title">曜日別</div>${weekdayChartHtml}</div>
    <div class="ac-card"><div class="ac-card-title">発生時間帯（2時間刻み）</div>${hourChartHtml}</div>
  </div>

  <h2 class="aa-h2">環境・事故内容別の傾向</h2>
  <div class="aa-grid-3">
    <div class="ac-card"><div class="ac-card-title">天候別</div>${weatherHtml}</div>
    <div class="ac-card"><div class="ac-card-title">道路状況別</div>${roadCondHtml}</div>
    <div class="ac-card"><div class="ac-card-title">道路形状別</div>${roadShapeHtml}</div>
    <div class="ac-card"><div class="ac-card-title">事故形態別</div>${formHtml}</div>
    <div class="ac-card"><div class="ac-card-title">事故対象別</div>${targetHtml}</div>
    <div class="ac-card"><div class="ac-card-title">営業状況別</div>${bizHtml}</div>
  </div>

  <h2 class="aa-h2">原因分析（引起理由 × 直接原因）</h2>
  <div class="ac-table-wrap">
    <table class="ac-table">
      <thead><tr><th></th>${crossHeadHtml}</tr></thead>
      <tbody>${crossBodyHtml}</tbody>
    </table>
  </div>

  <h2 class="aa-h2">重篤度</h2>
  <div class="ac-card">
    <div class="ac-card-title">過失割合分布（予定→確定）</div>
    ${faultChipsHtml('予定', plannedCounts)}
    ${faultChipsHtml('確定', finalCounts)}
  </div>
  <div class="ac-card">
    <div class="ac-card-title">損害額分布　合計 ¥${damageTotal.toLocaleString('ja-JP')}　平均 ¥${damageAvg.toLocaleString('ja-JP')}</div>
    ${damageHtml}
  </div>

  <h2 class="aa-h2">属性別の傾向</h2>
  <div class="aa-grid-3">
    <div class="ac-card"><div class="ac-card-title">年齢層別</div>${ageHtml}</div>
    <div class="ac-card"><div class="ac-card-title">勤続年数別</div>${tenureHtml}</div>
    <div class="ac-card"><div class="ac-card-title">過去3年事故件数（累犯傾向）</div>${past3yHtml}</div>
  </div>

  <h2 class="aa-h2">発生場所（市区町村別 TOP15）</h2>
  <div class="ac-table-wrap">
    <table class="ac-table">
      <thead><tr><th>場所</th><th>件数</th></tr></thead>
      <tbody>${locationRowsHtml}</tbody>
    </table>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js" integrity="sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ" crossorigin="anonymous"></script>
<script>
function aaReload() {
  var months = document.getElementById('aa-months').value;
  var division = document.getElementById('aa-division').value;
  var url = '${ADMIN_PATH}/accidents/analysis?months=' + months + (division ? '&division=' + division : '');
  location.href = url;
}
function aaFilterIndividual() {
  var q = document.getElementById('aa-individual-search').value.trim();
  document.querySelectorAll('#aa-individual-tbody tr[data-name]').forEach(function(tr) {
    tr.style.display = tr.getAttribute('data-name').indexOf(q) === -1 ? 'none' : '';
  });
}
new Chart(document.getElementById('aa-trend-chart').getContext('2d'), {
  type: 'bar',
  data: {
    labels: ${safeJson(trend.labels.map(monthLabelShort))},
    datasets: ${safeJson(trend.datasets.map((d, i) => ({ ...d, backgroundColor: DIV_CHART_COLORS[i] })))}
  },
  options: {
    responsive: true,
    plugins: { legend: { position: 'bottom' } },
    scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } }
  }
});
</script>
`;
}
