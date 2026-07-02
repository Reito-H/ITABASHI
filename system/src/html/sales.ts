import { escHtml, safeJson } from './layout';
import { ADMIN_PATH } from '../config';

export type SalesSummary = {
  id: number;
  name: string;
  emp_no: string;
  division: number | null;
  team: number | null;
  total_amount: number | null;
  total_rides: number | null;
  total_distance: number | null;
  working_days: number | null;
  avg_amount: number | null;
};

export type DailySale = {
  emp_id: number;
  date: string;
  amount: number;
  ride_count: number | null;
  distance_km: number | null;
};

const fmt = (n: number | null) => n != null ? n.toLocaleString('ja-JP') : '—';

export function salesPage(
  summary: SalesSummary[],
  year: number,
  month: number,
  periodStart: string,
  periodEnd: string
): string {
  let prevYear = year, prevMonth = month - 1;
  if (prevMonth < 1) { prevMonth = 12; prevYear--; }
  let nextYear = year, nextMonth = month + 1;
  if (nextMonth > 12) { nextMonth = 1; nextYear++; }

  const periodLabel = `${year}年${month}月度（${periodStart}〜${periodEnd}）`;
  const totalSales = summary.reduce((s, e) => s + (e.total_amount ?? 0), 0);
  const totalRides = summary.reduce((s, e) => s + (e.total_rides ?? 0), 0);

  const rows = summary.map(e => {
    const avg = e.avg_amount ? Math.round(e.avg_amount).toLocaleString('ja-JP') : '—';
    return `
      <tr class="hover:bg-gray-50" onclick="window.location='${ADMIN_PATH}/sales/detail?emp_id=${e.id}&year=${year}&month=${month}'" style="cursor:pointer;">
        <td class="px-3 py-2 text-sm text-gray-600 border-b">${e.division ?? ''}課</td>
        <td class="px-3 py-2 text-sm font-medium text-gray-800 border-b">${escHtml(e.name)}</td>
        <td class="px-3 py-2 text-sm text-gray-500 border-b">${e.working_days ?? 0}日</td>
        <td class="px-3 py-2 text-sm font-bold border-b" style="color:#2563eb;">${fmt(e.total_amount)}円</td>
        <td class="px-3 py-2 text-sm text-gray-600 border-b">${fmt(e.total_rides)}回</td>
        <td class="px-3 py-2 text-sm text-gray-600 border-b">${fmt(e.total_distance)}km</td>
        <td class="px-3 py-2 text-sm text-gray-500 border-b">${avg}円</td>
      </tr>`;
  }).join('');

  // グラフ用データ
  const chartLabels = safeJson(summary.map(e => e.name));
  const chartAmounts = safeJson(summary.map(e => e.total_amount ?? 0));

  return `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <!-- ナビ -->
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
    <a href="${ADMIN_PATH}/sales?year=${prevYear}&month=${prevMonth}" class="btn-nav">◀ 前月度</a>
    <h2 style="font-size:16px;font-weight:bold;color:#1e3a5f;">${escHtml(periodLabel)}</h2>
    <a href="${ADMIN_PATH}/sales?year=${nextYear}&month=${nextMonth}" class="btn-nav">次月度 ▶</a>
    <div style="margin-left:auto;">
      <a href="/api/sales/csv?year=${year}&month=${month}" class="btn-secondary">CSV出力</a>
    </div>
  </div>

  <!-- 合計カード -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:16px;text-align:center;">
      <div style="font-size:24px;font-weight:bold;color:#2563eb;">${totalSales.toLocaleString('ja-JP')}円</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">月度合計売上</div>
    </div>
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:16px;text-align:center;">
      <div style="font-size:24px;font-weight:bold;color:#059669;">${totalRides.toLocaleString('ja-JP')}回</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">月度合計乗車回数</div>
    </div>
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:16px;text-align:center;">
      <div style="font-size:24px;font-weight:bold;color:#7c3aed;">${summary.filter(e => e.total_amount).length}名</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px;">記録あり乗務員数</div>
    </div>
  </div>

  <!-- グラフ -->
  <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:16px;margin-bottom:20px;">
    <h3 style="font-size:14px;font-weight:600;color:#374151;margin-bottom:12px;">月度売上比較</h3>
    <canvas id="sales-chart" height="80"></canvas>
  </div>

  <!-- 一覧表 -->
  <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);overflow:auto;">
    <table style="width:100%;border-collapse:collapse;">
      <thead style="background:#f9fafb;">
        <tr>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">課</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">氏名</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">出勤日数</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">月計売上</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">乗車回数</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">走行距離</th>
          <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 border-b">日平均売上</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot style="background:#f0f4ff;">
        <tr>
          <td colspan="3" style="padding:8px 12px;font-size:13px;font-weight:600;border-top:2px solid #d1d5db;">合計</td>
          <td style="padding:8px 12px;font-size:13px;font-weight:bold;color:#2563eb;border-top:2px solid #d1d5db;">${totalSales.toLocaleString('ja-JP')}円</td>
          <td style="padding:8px 12px;font-size:13px;font-weight:600;border-top:2px solid #d1d5db;">${totalRides.toLocaleString('ja-JP')}回</td>
          <td colspan="2" style="border-top:2px solid #d1d5db;"></td>
        </tr>
      </tfoot>
    </table>
  </div>
</div>

<style>
  .btn-nav { padding:6px 14px;background:#4b6cb7;color:white;border-radius:6px;text-decoration:none;font-size:13px; }
  .btn-nav:hover { background:#3b5aa3; }
  .btn-secondary { padding:6px 14px;background:#6b7280;color:white;border-radius:6px;text-decoration:none;font-size:13px; }
</style>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js" crossorigin="anonymous"></script>
<script>
const ctx = document.getElementById('sales-chart').getContext('2d');
new Chart(ctx, {
  type: 'bar',
  data: {
    labels: ${chartLabels},
    datasets: [{
      label: '月度売上（円）',
      data: ${chartAmounts},
      backgroundColor: 'rgba(37, 99, 235, 0.7)',
      borderColor: 'rgba(37, 99, 235, 1)',
      borderWidth: 1,
      borderRadius: 4,
    }]
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString('ja-JP') + '円' } }
    }
  }
});
</script>`;
}

export function salesDetailPage(
  emp: { id: number; name: string; emp_no: string },
  records: DailySale[],
  year: number,
  month: number
): string {
  const byDate: Record<string, DailySale> = {};
  for (const r of records) byDate[r.date] = r;

  const dates: string[] = [];
  const cur = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
  // periodStart = 前月18日
  let sm = month - 1, sy = year;
  if (sm < 1) { sm = 12; sy--; }
  const start = new Date(`${sy}-${String(sm).padStart(2, '0')}-18`);
  const end = new Date(`${year}-${String(month).padStart(2, '0')}-17`);
  const c2 = new Date(start);
  while (c2 <= end) {
    dates.push(c2.toISOString().split('T')[0]);
    c2.setDate(c2.getDate() + 1);
  }

  const WEEKDAY = ['日', '月', '火', '水', '木', '金', '土'];
  const chartDates = JSON.stringify(dates.map(d => {
    const dt = new Date(d);
    return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
  }));
  const chartValues = JSON.stringify(dates.map(d => byDate[d]?.amount ?? 0));

  const rows = dates.map(d => {
    const dt = new Date(d);
    const dow = dt.getUTCDay();
    const r = byDate[d];
    const isWeekend = dow === 0 || dow === 6;
    const dayColor = dow === 0 ? '#ef4444' : dow === 6 ? '#3b82f6' : '#374151';
    const rowId = `row-${d}`;
    const amtVal = r?.amount ?? '';
    const rideVal = r?.ride_count ?? '';
    const distVal = r?.distance_km ?? '';

    return `
      <tr id="${rowId}" style="background:${isWeekend ? '#fef2f2' : 'white'};">
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;color:${dayColor};font-size:13px;white-space:nowrap;">${d.slice(5)} (${WEEKDAY[dow]})</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;" id="disp-amt-${d}">
          ${r ? `<span style="color:#2563eb;font-weight:600;">${r.amount.toLocaleString('ja-JP')}円</span>` : '<span style="color:#d1d5db;">—</span>'}
        </td>
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;" id="disp-ride-${d}">
          ${r?.ride_count != null ? r.ride_count + '回' : '<span style="color:#d1d5db;">—</span>'}
        </td>
        <td style="padding:6px 12px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:13px;" id="disp-dist-${d}">
          ${r?.distance_km != null ? r.distance_km + 'km' : '<span style="color:#d1d5db;">—</span>'}
        </td>
        <td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;" id="btn-cell-${d}">
          <button onclick="openEdit('${d}',${amtVal || 0},${rideVal || 0},${distVal || 0})"
            style="padding:3px 10px;font-size:11px;background:${r ? '#dbeafe' : '#f0fdf4'};color:${r ? '#1d4ed8' : '#166534'};border:1px solid ${r ? '#bfdbfe' : '#bbf7d0'};border-radius:4px;cursor:pointer;">
            ${r ? '編集' : '追加'}
          </button>
          ${r ? `<button onclick="deleteRecord('${d}')"
            style="margin-left:4px;padding:3px 8px;font-size:11px;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;border-radius:4px;cursor:pointer;">削除</button>` : ''}
        </td>
      </tr>
      <!-- インライン編集行（隠し） -->
      <tr id="edit-${d}" style="display:none;background:#f0f9ff;">
        <td style="padding:6px 12px;border-bottom:1px solid #bfdbfe;color:${dayColor};font-size:13px;font-weight:600;">${d.slice(5)}</td>
        <td style="padding:4px 8px;border-bottom:1px solid #bfdbfe;">
          <input id="in-amt-${d}" type="number" value="${amtVal}" placeholder="売上（円）" min="0"
            style="width:100%;border:1px solid #93c5fd;border-radius:4px;padding:4px 6px;font-size:12px;text-align:right;">
        </td>
        <td style="padding:4px 8px;border-bottom:1px solid #bfdbfe;">
          <input id="in-ride-${d}" type="number" value="${rideVal}" placeholder="乗車回数" min="0"
            style="width:100%;border:1px solid #93c5fd;border-radius:4px;padding:4px 6px;font-size:12px;text-align:right;">
        </td>
        <td style="padding:4px 8px;border-bottom:1px solid #bfdbfe;">
          <input id="in-dist-${d}" type="number" value="${distVal}" placeholder="距離(km)" min="0"
            style="width:100%;border:1px solid #93c5fd;border-radius:4px;padding:4px 6px;font-size:12px;text-align:right;">
        </td>
        <td style="padding:4px 8px;border-bottom:1px solid #bfdbfe;white-space:nowrap;">
          <button onclick="saveRecord('${d}')"
            style="padding:4px 12px;font-size:11px;background:#2563eb;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;">保存</button>
          <button onclick="cancelEdit('${d}')"
            style="margin-left:4px;padding:4px 8px;font-size:11px;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;">取消</button>
        </td>
      </tr>`;
  }).join('');

  const total = records.reduce((s, r) => s + r.amount, 0);

  return `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;max-width:640px;">
  <div style="margin-bottom:12px;">
    <a href="${ADMIN_PATH}/sales?year=${year}&month=${month}" style="color:#2563eb;font-size:13px;">← 月度一覧に戻る</a>
  </div>
  <h2 style="font-size:18px;font-weight:bold;color:#1e3a5f;margin-bottom:4px;">${escHtml(emp.name)} — ${year}年${month}月度</h2>
  <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">社員番号: ${escHtml(emp.emp_no)}</div>

  <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:16px;margin-bottom:16px;">
    <div id="total-sales" style="font-size:28px;font-weight:bold;color:#2563eb;text-align:center;">${total.toLocaleString('ja-JP')}円</div>
    <div style="font-size:12px;color:#6b7280;text-align:center;margin-top:4px;">月度合計売上</div>
  </div>

  <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);padding:16px;margin-bottom:16px;">
    <canvas id="daily-chart" height="100"></canvas>
  </div>

  <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);overflow:hidden;">
    <table style="width:100%;border-collapse:collapse;">
      <thead style="background:#1e3a5f;color:white;">
        <tr>
          <th style="padding:8px 12px;text-align:left;font-size:12px;">日付</th>
          <th style="padding:8px 12px;text-align:right;font-size:12px;">売上</th>
          <th style="padding:8px 12px;text-align:right;font-size:12px;">乗車回数</th>
          <th style="padding:8px 12px;text-align:right;font-size:12px;">走行距離</th>
          <th style="padding:8px 12px;font-size:12px;"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js" crossorigin="anonymous"></script>
<script>
const empId = ${emp.id};
new Chart(document.getElementById('daily-chart').getContext('2d'), {
  type: 'line',
  data: {
    labels: ${chartDates},
    datasets: [{ label: '日別売上（円）', data: ${chartValues}, borderColor:'#2563eb', backgroundColor:'rgba(37,99,235,0.1)', fill:true, tension:0.3, pointRadius:3 }]
  },
  options: { responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true, ticks:{callback:v=>v.toLocaleString('ja-JP')}}}}
});

function openEdit(date, amt, ride, dist) {
  // 他の編集行を閉じる
  document.querySelectorAll('[id^="edit-"]').forEach(r => r.style.display='none');
  document.getElementById('edit-' + date).style.display = 'table-row';
  document.getElementById('in-amt-' + date).focus();
}
function cancelEdit(date) {
  document.getElementById('edit-' + date).style.display = 'none';
}
async function saveRecord(date) {
  const amt = parseInt(document.getElementById('in-amt-' + date).value) || 0;
  const ride = parseInt(document.getElementById('in-ride-' + date).value) || null;
  const dist = parseInt(document.getElementById('in-dist-' + date).value) || null;
  const res = await fetch('/api/sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emp_id: empId, date, amount: amt, ride_count: ride, distance_km: dist })
  });
  if (res.ok) { location.reload(); }
  else { alert('保存に失敗しました。'); }
}
async function deleteRecord(date) {
  if (!confirm(date + ' の売上記録を削除しますか？')) return;
  const res = await fetch('/api/sales/' + empId + '/' + date, { method: 'DELETE' });
  if (res.ok) { location.reload(); }
  else { alert('削除に失敗しました。'); }
}
</script>`;
}
