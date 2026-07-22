// Benten管理システム: 全社員横断の売上分析ページ
import { Hono } from 'hono';
import { layout } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

app.get('/sales-analytics', async (c) => {
  const content = `
<div style="max-width:1100px;font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
    <h2 style="font-size:16px;font-weight:700;color:#1a3a5c;margin:0;">売上分析 — 全社員横断</h2>
    <div id="period-label" style="font-size:12px;color:#6b7280;"></div>
  </div>

  <div id="loading" style="color:#9ca3af;font-size:13px;">読み込み中…</div>

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

    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
      <h3 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 14px;">社員別サマリー（今月度・前月度比）</h3>
      <div style="margin-bottom:10px;display:flex;gap:8px;align-items:center;">
        <input type="text" id="search-box" placeholder="社員名で検索" oninput="renderTable()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;width:200px;">
        <select id="sort-select" onchange="renderTable()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;">
          <option value="curTotal-desc">今月度売上 高い順</option>
          <option value="curTotal-asc">今月度売上 低い順</option>
          <option value="changePct-desc">前月度比 高い順</option>
          <option value="changePct-asc">前月度比 低い順</option>
          <option value="curAvgPerDuty-desc">平均日商 高い順</option>
          <option value="curAvgPerDuty-asc">平均日商 低い順</option>
        </select>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left;color:#6b7280;">
          <th style="padding:6px 8px;">氏名</th><th style="padding:6px 8px;">課/班</th><th style="padding:6px 8px;">今月度合計</th><th style="padding:6px 8px;">平均日商</th><th style="padding:6px 8px;">乗務日数</th><th style="padding:6px 8px;">前月度比</th>
        </tr></thead>
        <tbody id="emp-tbody"></tbody>
      </table>
    </div>
  </div>
</div>

<script>
let overviewData = null;

async function loadOverview() {
  try {
    const res = await fetch('/api/sales-analytics/overview');
    const json = await res.json();
    if (!res.ok) { document.getElementById('loading').textContent = json.error || '読み込みに失敗しました'; return; }
    overviewData = json;
    document.getElementById('period-label').textContent = json.period.year + '年' + json.period.month + '月度（' + json.period.start + ' 〜 ' + json.period.end + '）';
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = '';

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

    renderTable();
  } catch (err) {
    document.getElementById('loading').textContent = '通信エラーが発生しました';
  }
}

function renderTable() {
  if (!overviewData) return;
  const q = document.getElementById('search-box').value.trim();
  const [sortKey, sortDir] = document.getElementById('sort-select').value.split('-');

  let rows = overviewData.employees.filter(e => !q || e.name.includes(q));
  rows = rows.slice().sort((a, b) => {
    const av = a[sortKey] ?? -Infinity, bv = b[sortKey] ?? -Infinity;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const tbody = document.getElementById('emp-tbody');
  tbody.innerHTML = rows.map(e => {
    const changeColor = e.changePct === null ? '#9ca3af' : (e.changePct >= 0 ? '#059669' : '#dc2626');
    const changeText = e.changePct === null ? '—' : (e.changePct >= 0 ? '+' : '') + e.changePct + '%';
    return '<tr style="border-bottom:1px solid #f3f4f6;">' +
      '<td style="padding:7px 8px;"><a href="' + ADMIN_PATH + '/staff/' + e.empId + '" style="color:#2563eb;text-decoration:none;font-weight:600;">' + escHtmlJs(e.name) + '</a></td>' +
      '<td style="padding:7px 8px;color:#6b7280;">' + (e.division ?? '—') + '課' + (e.team ? e.team + '班' : '') + '</td>' +
      '<td style="padding:7px 8px;font-weight:600;">' + e.curTotal.toLocaleString('ja-JP') + '円</td>' +
      '<td style="padding:7px 8px;">' + (e.curAvgPerDuty !== null ? e.curAvgPerDuty.toLocaleString('ja-JP') + '円' : '—') + '</td>' +
      '<td style="padding:7px 8px;">' + e.curDutyCount + '日</td>' +
      '<td style="padding:7px 8px;font-weight:700;color:' + changeColor + ';">' + changeText + '</td>' +
      '</tr>';
  }).join('');
}

function escHtmlJs(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

const ADMIN_PATH = '${ADMIN_PATH}';
loadOverview();
</script>`;

  return c.html(layout('売上分析', content, 'sales-analytics'));
});

export default app;
