// 夏季稼働計画対実績（「板橋2課 夏季稼働・有給予定入力」Excelの再現）
// 「夏季稼働見込」の日勤Ａ/日勤Ｂ/隔勤は乗務員シフト（crew_shifts）から自動計算する。
// 実績・有給予定・有休実績・前年実績・入力者名など、PDFから読み取れない値だけ手入力欄として残す。
import { escHtml, saveToastHtml, saveToastScript } from './layout';
import { ADMIN_PATH } from '../config';

export type SummerReportPeriod = {
  id: number;
  fiscal_year: number;
  division: string;
  start_date: string;
  end_date: string;
  vehicle_count: number;
  target_paid_users: number | null;
  working_headcount_forecast: number | null;
  input_name: string;
};

export type SummerReportDailyRow = {
  date: string;
  nikkin_a_actual: number | null;
  nikkin_b_actual: number | null;
  kakukin_actual: number | null;
  paid_leave_planned_days: number | null;
  paid_leave_actual_days: number | null;
  last_year_nikkin_a: number | null;
  last_year_nikkin_b: number | null;
  last_year_kakukin: number | null;
};

export type ForecastByDate = Record<string, { nikkin_a: number; nikkin_b: number; kakukin: number }>;

export function summerReportPage(
  periodOrNull: SummerReportPeriod | null,
  dates: string[],
  daily: Record<string, SummerReportDailyRow>,
  forecast: ForecastByDate,
  editable: boolean,
  periodList: SummerReportPeriod[],
): string {
  if (!periodOrNull) {
    return `<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;padding:20px;">
      <p>まだ夏季稼働レポートが作成されていません。先に <a href="${ADMIN_PATH}/crew-shift">乗務員シフト</a> でPDFを取り込むと、その年度分がここに表示されます。</p>
    </div>`;
  }
  const period: SummerReportPeriod = periodOrNull;

  const fmt = (n: number | null | undefined) => (n == null ? '' : (Number.isInteger(n) ? String(n) : String(n)));
  const sumRow = (get: (d: string) => number): number => dates.reduce((a, d) => a + (get(d) || 0), 0);

  const STICKY = 'position:sticky;z-index:2;';
  const HDR_BG = 'background:#1e3a5f;color:white;';

  function dateHeaderCells(): string {
    return dates.map(d => {
      const dt = new Date(d + 'T00:00:00Z');
      const dow = dt.getUTCDay();
      const bg = dow === 0 || dow === 6 ? '#fef2f2' : '#eff6ff';
      return `<th style="min-width:38px;font-size:10px;padding:3px 1px;border:1px solid #d1d5db;background:${bg};">${dt.getUTCDate()}<br>${['日','月','火','水','木','金','土'][dow]}</th>`;
    }).join('');
  }

  function forecastRow(label: string, key: 'nikkin_a' | 'nikkin_b' | 'kakukin', bg: string): string {
    const cells = dates.map(d => `<td style="text-align:center;font-size:11px;border:1px solid #d1d5db;background:#f8fafc;color:#374151;">${fmt(forecast[d]?.[key] ?? 0)}</td>`).join('');
    const total = sumRow(d => forecast[d]?.[key] ?? 0);
    return `<tr><td style="${STICKY}left:0;background:${bg};font-size:11px;font-weight:600;padding:3px 6px;border:1px solid #d1d5db;">${escHtml(label)}</td>${cells}<td style="text-align:center;font-weight:700;font-size:11px;border:1px solid #d1d5db;background:#f1f5f9;">${fmt(total)}</td></tr>`;
  }

  function forecastTotalRow(): string {
    const get = (d: string) => (forecast[d]?.nikkin_a ?? 0) + (forecast[d]?.nikkin_b ?? 0) + (forecast[d]?.kakukin ?? 0);
    const cells = dates.map(d => `<td style="text-align:center;font-size:11px;font-weight:700;border:1px solid #d1d5db;background:#eef2ff;">${fmt(get(d))}</td>`).join('');
    return `<tr><td style="${STICKY}left:0;background:#c7d2fe;font-size:11px;font-weight:700;padding:3px 6px;border:1px solid #d1d5db;">合計</td>${cells}<td style="text-align:center;font-weight:700;font-size:11px;border:1px solid #d1d5db;background:#eef2ff;">${fmt(sumRow(get))}</td></tr>`;
  }

  function forecastRateRow(): string {
    const vc = period.vehicle_count || 0;
    const get = (d: string) => (forecast[d]?.nikkin_a ?? 0) + (forecast[d]?.nikkin_b ?? 0) + (forecast[d]?.kakukin ?? 0);
    const cells = dates.map(d => `<td style="text-align:center;font-size:10px;border:1px solid #d1d5db;color:#6b7280;">${vc ? Math.round((get(d) / vc) * 1000) / 10 + '%' : '-'}</td>`).join('');
    return `<tr><td style="${STICKY}left:0;background:#f8fafc;font-size:10px;padding:3px 6px;border:1px solid #d1d5db;color:#6b7280;">稼働率</td>${cells}<td style="border:1px solid #d1d5db;background:#f8fafc;"></td></tr>`;
  }

  // 手入力行（実績・有給予定・有休実績・前年実績）: <input> をそのままセルに置く。type=daily でJSが一括収集
  function inputRow(label: string, field: keyof SummerReportDailyRow, bg: string, step = '0.5'): string {
    const cells = dates.map(d => {
      const v = daily[d]?.[field];
      return `<td style="padding:1px;border:1px solid #d1d5db;">
        <input type="number" step="${step}" class="sr-input" data-field="${field}" data-date="${d}" value="${v ?? ''}"
          ${editable ? '' : 'disabled'} style="width:100%;border:none;text-align:center;font-size:11px;padding:4px 0;box-sizing:border-box;background:transparent;">
      </td>`;
    }).join('');
    return `<tr><td style="${STICKY}left:0;background:${bg};font-size:11px;font-weight:600;padding:3px 6px;border:1px solid #d1d5db;">${escHtml(label)}</td>${cells}<td class="sr-total" data-field="${field}" style="text-align:center;font-weight:700;font-size:11px;border:1px solid #d1d5db;background:#f1f5f9;"></td></tr>`;
  }

  const periodOptions = periodList.map(p =>
    `<option value="${p.fiscal_year}" ${p.id === period.id ? 'selected' : ''}>${p.fiscal_year}年度（${p.start_date}〜${p.end_date}）</option>`
  ).join('');

  return `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
    <h2 style="font-size:15px;font-weight:bold;color:#1e3a5f;">夏季稼働計画対実績（${escHtml(period.division)}）</h2>
    <select id="fy-select" onchange="changeFY()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;background:white;">${periodOptions}</select>
    <a href="${ADMIN_PATH}/crew-shift" class="btn-secondary" style="margin-left:auto;">乗務員シフトへ</a>
  </div>

  <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:12px;">
    <label style="font-size:12px;color:#374151;">対象期間: ${escHtml(period.start_date)} 〜 ${escHtml(period.end_date)}</label>
    <label style="font-size:12px;color:#374151;">台数(休車等除く): <input id="meta-vehicle" type="number" value="${period.vehicle_count ?? ''}" ${editable ? '' : 'disabled'} style="width:70px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;"></label>
    <label style="font-size:12px;color:#374151;">有給予定対象人数: <input id="meta-target-paid" type="number" value="${period.target_paid_users ?? ''}" ${editable ? '' : 'disabled'} style="width:70px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;"></label>
    <label style="font-size:12px;color:#374151;">月末見込実働人員: <input id="meta-working" type="number" value="${period.working_headcount_forecast ?? ''}" ${editable ? '' : 'disabled'} style="width:70px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;"></label>
    <label style="font-size:12px;color:#374151;">入力者名: <input id="meta-input-name" type="text" value="${escHtml(period.input_name ?? '')}" ${editable ? '' : 'disabled'} style="width:100px;border:1px solid #d1d5db;border-radius:4px;padding:4px 6px;"></label>
    ${editable ? '<button onclick="saveAll()" id="save-btn" style="margin-left:auto;padding:9px 22px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">保存</button>' : ''}
  </div>

  <div style="font-size:11px;color:#6b7280;margin-bottom:8px;">「夏季稼働見込」は乗務員シフトから自動計算（日勤Ａ・日勤Ｂ=0.5人／隔勤=1.0人でカウント）。それ以外は手入力です。</div>

  <div style="overflow-x:auto;border:1px solid #d1d5db;border-radius:8px;">
    <table style="border-collapse:collapse;table-layout:fixed;">
      <thead style="position:sticky;top:0;z-index:10;background:white;">
        <tr><th style="min-width:110px;${STICKY}left:0;z-index:20;${HDR_BG}font-size:11px;padding:4px;border:1px solid #4b6cb7;">区分</th>${dateHeaderCells()}<th style="min-width:50px;${HDR_BG}font-size:10px;border:1px solid #4b6cb7;">合計</th></tr>
      </thead>
      <tbody>
        <tr><td colspan="${dates.length + 2}" style="background:#dbeafe;font-size:11px;font-weight:700;padding:3px 8px;${STICKY}left:0;">夏季稼働見込（自動計算）</td></tr>
        ${forecastRow('日勤Ａ', 'nikkin_a', '#bbf7d0')}
        ${forecastRow('日勤Ｂ', 'nikkin_b', '#86efac')}
        ${forecastRow('隔勤', 'kakukin', '#c7d2fe')}
        ${forecastTotalRow()}
        ${forecastRateRow()}

        <tr><td colspan="${dates.length + 2}" style="background:#fef9c3;font-size:11px;font-weight:700;padding:3px 8px;${STICKY}left:0;">実績（手入力）</td></tr>
        ${inputRow('日勤Ａ', 'nikkin_a_actual', '#fef9c3')}
        ${inputRow('日勤Ｂ', 'nikkin_b_actual', '#fef9c3')}
        ${inputRow('隔勤', 'kakukin_actual', '#fef9c3')}
        <tr id="actual-total-row"><td style="${STICKY}left:0;background:#fde68a;font-size:11px;font-weight:700;padding:3px 6px;border:1px solid #d1d5db;">合計</td>${dates.map(d => `<td class="sr-actual-total" data-date="${d}" style="text-align:center;font-weight:700;font-size:11px;border:1px solid #d1d5db;background:#fef3c7;"></td>`).join('')}<td style="border:1px solid #d1d5db;background:#fef3c7;"></td></tr>

        <tr><td colspan="${dates.length + 2}" style="background:#fee2e2;font-size:11px;font-weight:700;padding:3px 8px;${STICKY}left:0;">有給・有休（手入力）</td></tr>
        ${inputRow('有給予定（日数）', 'paid_leave_planned_days', '#fee2e2', '1')}
        ${inputRow('有休実績（日数）', 'paid_leave_actual_days', '#fee2e2', '1')}

        <tr><td colspan="${dates.length + 2}" style="background:#e0e7ff;font-size:11px;font-weight:700;padding:3px 8px;${STICKY}left:0;">前年実績（手入力・比較用）</td></tr>
        ${inputRow('日勤Ａ', 'last_year_nikkin_a', '#e0e7ff')}
        ${inputRow('日勤Ｂ', 'last_year_nikkin_b', '#e0e7ff')}
        ${inputRow('隔勤', 'last_year_kakukin', '#e0e7ff')}
      </tbody>
    </table>
  </div>
</div>

${saveToastHtml()}
<style>.btn-secondary { padding:6px 14px;background:#6b7280;color:white;border-radius:6px;text-decoration:none;font-size:13px; }</style>

<script>
var API = '${ADMIN_PATH}/api/summer-report';
var PERIOD_ID = ${period.id};
function sel(s) { return document.querySelector(s); }
${saveToastScript()}
function changeFY() { location.href = '${ADMIN_PATH}/summer-report?fy=' + sel('#fy-select').value; }

function recalcTotals() {
  document.querySelectorAll('.sr-total').forEach(function(td) {
    var field = td.dataset.field;
    var sum = 0, any = false;
    document.querySelectorAll('.sr-input[data-field="' + field + '"]').forEach(function(inp) {
      var v = parseFloat(inp.value);
      if (!isNaN(v)) { sum += v; any = true; }
    });
    td.textContent = any ? (Math.round(sum * 100) / 100) : '';
  });
  document.querySelectorAll('.sr-actual-total').forEach(function(td) {
    var d = td.dataset.date, sum = 0, any = false;
    ['nikkin_a_actual','nikkin_b_actual','kakukin_actual'].forEach(function(f) {
      var inp = document.querySelector('.sr-input[data-field="' + f + '"][data-date="' + d + '"]');
      var v = inp ? parseFloat(inp.value) : NaN;
      if (!isNaN(v)) { sum += v; any = true; }
    });
    td.textContent = any ? sum : '';
  });
}
document.addEventListener('input', function(e) { if (e.target.classList.contains('sr-input')) recalcTotals(); });
recalcTotals();

async function saveAll() {
  var btn = sel('#save-btn');
  btn.disabled = true; btn.textContent = '保存中...';
  var daily = {};
  document.querySelectorAll('.sr-input').forEach(function(inp) {
    var d = inp.dataset.date, f = inp.dataset.field;
    daily[d] = daily[d] || {};
    var v = inp.value.trim();
    daily[d][f] = v === '' ? null : parseFloat(v);
  });
  var body = {
    period_id: PERIOD_ID,
    vehicle_count: parseInt(sel('#meta-vehicle').value) || 0,
    target_paid_users: sel('#meta-target-paid').value === '' ? null : parseInt(sel('#meta-target-paid').value),
    working_headcount_forecast: sel('#meta-working').value === '' ? null : parseInt(sel('#meta-working').value),
    input_name: sel('#meta-input-name').value,
    daily: daily,
  };
  try {
    var res = await fetch(API + '/save', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    if (!res.ok) { var d = await res.json().catch(function(){return {};}); throw new Error(d.error || 'server'); }
    showToast('保存しました');
  } catch (e) {
    alert('保存に失敗しました: ' + (e.message || ''));
  } finally {
    btn.disabled = false; btn.textContent = '保存';
  }
}
</script>`;
}
