// 乗務員ポータル: 個人データ参照（日別明細・売上分析・稼働）のハブページ
// 乗務員シフト・売上分析（全社）・担当車表への入口も兼ねる（サイドバー1項目に集約）
import { Hono } from 'hono';
import { layout, escHtml } from '../html/layout';
import { crewPortalSubNav } from '../html/crew_portal_nav';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

type EmpRow = { id: number; name: string; emp_no: string; division: number | null; team: number | null };

// ===== ページ: 乗務員ポータル（社員選択） =====
app.get('/crew-portal', async (c) => {
  const rows = (await c.env.DB.prepare(
    'SELECT id, name, emp_no, division, team FROM employees WHERE is_active = 1 ORDER BY division, team, name'
  ).all<EmpRow>()).results ?? [];

  const listHtml = rows.map(e => `
    <a href="${ADMIN_PATH}/crew-portal/employee/${e.id}" data-name="${escHtml(e.name)}"
       style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;text-decoration:none;color:#1f2937;border-bottom:1px solid #f3f4f6;">
      <span style="font-weight:600;">${escHtml(e.name)}</span>
      <span style="font-size:12px;color:#9ca3af;">${e.division ?? '—'}課${e.team ? e.team + '班' : ''} ／ ${escHtml(e.emp_no)}</span>
    </a>`).join('');

  const content = `
<div style="max-width:900px;font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <h2 style="font-size:16px;font-weight:700;color:#1a3a5c;margin:0 0 4px;">乗務員ポータル</h2>
  <p style="font-size:12px;color:#6b7280;margin:0 0 16px;">乗務員ごとの日報実績・シフト・売上をまとめて参照できます。</p>
  ${crewPortalSubNav('portal')}

  <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;">
    <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 12px;">個人データ参照 — 社員を選択</h3>
    <input type="text" id="emp-search" placeholder="氏名で検索" oninput="filterEmpList()"
      style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 12px;font-size:13px;margin-bottom:12px;">
    <div id="emp-list" style="max-height:520px;overflow-y:auto;border:1px solid #f3f4f6;border-radius:8px;">
      ${listHtml || '<div style="padding:16px;color:#9ca3af;font-size:13px;">在籍中の社員がいません</div>'}
    </div>
  </div>
</div>
<script>
function filterEmpList() {
  const q = document.getElementById('emp-search').value.trim();
  document.querySelectorAll('#emp-list a').forEach(a => {
    a.style.display = (!q || a.getAttribute('data-name').includes(q)) ? '' : 'none';
  });
}
</script>`;

  return c.html(layout('乗務員ポータル', content, 'crew-portal'));
});

// ===== ページ: 個人データ参照（日別明細・売上分析） =====
app.get('/crew-portal/employee/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.notFound();

  const emp = await c.env.DB.prepare('SELECT id, name, emp_no, division, team FROM employees WHERE id = ?')
    .bind(id).first<EmpRow>();
  if (!emp) return c.text('社員が見つかりません', 404);

  const content = `
<div style="max-width:900px;font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <h2 style="font-size:16px;font-weight:700;color:#1a3a5c;margin:0 0 4px;">乗務員ポータル</h2>
  <p style="font-size:12px;color:#6b7280;margin:0 0 16px;">乗務員ごとの日報実績・シフト・売上をまとめて参照できます。</p>
  ${crewPortalSubNav('portal')}

  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
    <a href="${ADMIN_PATH}/crew-portal" style="color:#2563eb;font-size:13px;text-decoration:none;">← 社員選択に戻る</a>
    <a href="${ADMIN_PATH}/staff/${emp.id}" style="color:#6b7280;font-size:12px;text-decoration:none;">社員情報を編集 →</a>
  </div>

  <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h3 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0;">${escHtml(emp.name)}（${emp.division ?? '—'}課${emp.team ? emp.team + '班' : ''} ／ ${escHtml(emp.emp_no)}）</h3>
      <select id="sales-months" onchange="loadSalesAnalytics()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;">
        <option value="3">直近3ヶ月</option>
        <option value="6" selected>直近6ヶ月</option>
        <option value="12">直近12ヶ月</option>
        <option value="24">直近24ヶ月</option>
      </select>
    </div>
    <div id="sales-loading" style="color:#9ca3af;font-size:13px;">読み込み中…</div>
    <div id="sales-content" style="display:none;">
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:20px;padding:12px 14px;background:#f9fafb;border-radius:8px;">
        <span style="font-size:12px;color:#6b7280;">月度PDF（勤務実績・売上表）:</span>
        <select id="pdf-month-select" style="border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:12px;"></select>
        <button type="button" onclick="downloadShiftSalesPdf()" style="padding:5px 14px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">PDFダウンロード</button>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0;">個人データ参照 — 日別明細</h4>
        <select id="detail-month-select" onchange="renderDailyDetail()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;"></select>
      </div>
      <div style="display:flex;gap:16px;margin-bottom:14px;">
        <div style="flex:1;background:#f9fafb;border-radius:8px;padding:10px 14px;">
          <div style="font-size:11px;color:#9ca3af;">合計 税込営収</div>
          <div id="detail-sum-amount" style="font-size:16px;font-weight:700;color:#1a3a5c;">—</div>
        </div>
        <div style="flex:1;background:#f9fafb;border-radius:8px;padding:10px 14px;">
          <div style="font-size:11px;color:#9ca3af;">平均日商</div>
          <div id="detail-avg-amount" style="font-size:16px;font-weight:700;color:#1a3a5c;">—</div>
        </div>
        <div style="flex:1;background:#f9fafb;border-radius:8px;padding:10px 14px;">
          <div style="font-size:11px;color:#9ca3af;">乗務日数</div>
          <div id="detail-duty-count" style="font-size:16px;font-weight:700;color:#1a3a5c;">—</div>
        </div>
        <div style="flex:1;background:#f9fafb;border-radius:8px;padding:10px 14px;">
          <div style="font-size:11px;color:#9ca3af;">合計 走行キロ</div>
          <div id="detail-sum-distance" style="font-size:16px;font-weight:700;color:#1a3a5c;">—</div>
        </div>
      </div>
      <div style="overflow-x:auto;margin-bottom:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left;color:#6b7280;">
            <th style="padding:6px 8px;">日付</th><th style="padding:6px 8px;">曜日</th><th style="padding:6px 8px;">勤務</th><th style="padding:6px 8px;">税込営収</th><th style="padding:6px 8px;">営業回数</th><th style="padding:6px 8px;">走行キロ</th>
          </tr></thead>
          <tbody id="detail-tbody"></tbody>
        </table>
      </div>

      <div style="position:relative;height:240px;margin-bottom:24px;"><canvas id="sales-monthly-chart"></canvas></div>
      <div style="position:relative;height:240px;margin-bottom:24px;"><canvas id="sales-weekday-chart"></canvas></div>
      <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">暦要因別の営収差（この社員の平均日商との比較）</h4>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left;color:#6b7280;">
          <th style="padding:6px 8px;">要因</th><th style="padding:6px 8px;">該当日平均</th><th style="padding:6px 8px;">非該当日平均</th><th style="padding:6px 8px;">差分</th><th style="padding:6px 8px;">件数</th>
        </tr></thead>
        <tbody id="sales-factor-tbody"></tbody>
      </table>
    </div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js" crossorigin="anonymous"></script>
<script>
const STAFF_ID = ${emp.id};
const ADMIN_PATH = '${ADMIN_PATH}';
let salesMonthlyChart = null, salesWeekdayChart = null;
let lastSalesJson = null;

function downloadShiftSalesPdf() {
  const val = document.getElementById('pdf-month-select').value;
  if (!val) { alert('対象月度がありません（売上データがまだ登録されていません）'); return; }
  const [year, month] = val.split('-');
  window.open('/api/sales-analytics/employee/' + STAFF_ID + '/pdf?year=' + year + '&month=' + month, '_blank');
}

async function loadSalesAnalytics() {
  const months = document.getElementById('sales-months').value;
  document.getElementById('sales-loading').style.display = '';
  document.getElementById('sales-content').style.display = 'none';
  try {
    const res = await fetch('/api/sales-analytics/employee/' + STAFF_ID + '?months=' + months);
    const json = await res.json();
    if (!res.ok) { document.getElementById('sales-loading').textContent = json.error || '読み込みに失敗しました'; return; }

    if (!json.monthly.length) {
      document.getElementById('sales-loading').textContent = 'この期間の売上データがありません（CSVインポートまたはLINE売上記録で登録されると表示されます）';
      return;
    }

    document.getElementById('sales-loading').style.display = 'none';
    document.getElementById('sales-content').style.display = '';

    const pdfSelect = document.getElementById('pdf-month-select');
    pdfSelect.innerHTML = json.monthly.slice().reverse().map(m =>
      '<option value="' + m.year + '-' + m.month + '">' + m.year + '年' + m.month + '月度</option>'
    ).join('');

    lastSalesJson = json;
    const detailSelect = document.getElementById('detail-month-select');
    const prevDetailVal = detailSelect.value;
    detailSelect.innerHTML = json.monthly.slice().reverse().map(m =>
      '<option value="' + m.year + '-' + m.month + '">' + m.year + '年' + m.month + '月度</option>'
    ).join('');
    if (prevDetailVal && [...detailSelect.options].some(o => o.value === prevDetailVal)) detailSelect.value = prevDetailVal;
    renderDailyDetail();

    const monthLabels = json.monthly.map(m => m.year + '年' + m.month + '月度');
    const monthTotals = json.monthly.map(m => m.total);
    if (salesMonthlyChart) salesMonthlyChart.destroy();
    salesMonthlyChart = new Chart(document.getElementById('sales-monthly-chart').getContext('2d'), {
      type: 'bar',
      data: { labels: monthLabels, datasets: [{ label: '月度売上合計(円)', data: monthTotals, backgroundColor: 'rgba(37,99,235,0.7)', borderRadius: 4 }] },
      options: { responsive: true, plugins: { title: { display: true, text: '月度売上推移' } }, scales: { y: { beginAtZero: true } } }
    });

    const wdLabels = json.weekdayBreakdown.map(w => w.label);
    const wdAvgs = json.weekdayBreakdown.map(w => w.avg || 0);
    if (salesWeekdayChart) salesWeekdayChart.destroy();
    salesWeekdayChart = new Chart(document.getElementById('sales-weekday-chart').getContext('2d'), {
      type: 'bar',
      data: { labels: wdLabels, datasets: [{ label: '曜日別平均売上(円)', data: wdAvgs, backgroundColor: 'rgba(5,150,105,0.7)', borderRadius: 4 }] },
      options: { responsive: true, plugins: { title: { display: true, text: '曜日別 平均売上' } }, scales: { y: { beginAtZero: true } } }
    });

    const tbody = document.getElementById('sales-factor-tbody');
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
  } catch (err) {
    document.getElementById('sales-loading').textContent = '通信エラーが発生しました';
  }
}

function renderDailyDetail() {
  const tbody = document.getElementById('detail-tbody');
  if (!lastSalesJson) { tbody.innerHTML = ''; return; }
  const val = document.getElementById('detail-month-select').value;
  if (!val) { tbody.innerHTML = ''; return; }
  const [y, m] = val.split('-').map(Number);
  const rows = lastSalesJson.daily.filter(d => d.periodYear === y && d.periodMonth === m).slice().sort((a, b) => a.date < b.date ? -1 : 1);

  tbody.innerHTML = rows.map(d => {
    const wdColor = d.weekdayLabel === '日' ? '#dc2626' : d.weekdayLabel === '土' ? '#2563eb' : '#374151';
    return '<tr style="border-bottom:1px solid #f3f4f6;">' +
      '<td style="padding:6px 8px;">' + d.date + '</td>' +
      '<td style="padding:6px 8px;color:' + wdColor + ';">' + d.weekdayLabel + '</td>' +
      '<td style="padding:6px 8px;">' + (d.dutyCode ?? '—') + '</td>' +
      '<td style="padding:6px 8px;">' + d.amount.toLocaleString('ja-JP') + '円</td>' +
      '<td style="padding:6px 8px;">' + (d.rideCount ?? '—') + '</td>' +
      '<td style="padding:6px 8px;">' + (d.distanceKm != null ? d.distanceKm.toLocaleString('ja-JP') + 'km' : '—') + '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="6" style="padding:12px 8px;color:#9ca3af;">この月度のデータがありません</td></tr>';

  const sumAmount = rows.reduce((s, d) => s + d.amount, 0);
  const sumDistance = rows.reduce((s, d) => s + (d.distanceKm ?? 0), 0);
  document.getElementById('detail-sum-amount').textContent = sumAmount.toLocaleString('ja-JP') + '円';
  document.getElementById('detail-avg-amount').textContent = rows.length ? Math.round(sumAmount / rows.length).toLocaleString('ja-JP') + '円' : '—';
  document.getElementById('detail-duty-count').textContent = rows.length + '日';
  document.getElementById('detail-sum-distance').textContent = sumDistance ? sumDistance.toLocaleString('ja-JP') + 'km' : '—';
}

loadSalesAnalytics();
</script>`;

  return c.html(layout(`${emp.name} — 個人データ参照`, content, 'crew-portal'));
});

export default app;
