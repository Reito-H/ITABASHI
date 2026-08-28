// 稼働台数報告表（当直ごとにExcelで手作業していたものをWeb化）
// 認可台数・隔日勤務・日勤勤務は自動反映、事故休車〜浮きは引き続き手入力。
// 印刷(A4横1枚)・PNG保存はreport_print.tsと同じパターン（html2canvas, cdn.jsdelivr.net）。

import { escHtml, safeJson } from './layout';
import { ADMIN_PATH } from '../config';

export type UtilizationCapacityRow = { division: string; capacity: number };

export type UtilizationReportRow = {
  date: string; division: string;
  accident_off: number; breakdown_off: number; a_off: number; b_off: number; full_off: number;
  operating: number | null; float_a: number; float_b: number; float_kaku: number;
};

export type UtilizationAutoRow = { kakukin: number; nikkin: number };

const MANUAL_COLS: Array<{ key: keyof UtilizationReportRow; label: string }> = [
  { key: 'accident_off', label: '事故休車' },
  { key: 'breakdown_off', label: '故障休車' },
  { key: 'a_off', label: 'a休車' },
  { key: 'b_off', label: 'b休車' },
  { key: 'full_off', label: '全休車' },
  { key: 'operating', label: '稼働台数' },
  { key: 'float_a', label: 'a番-浮き' },
  { key: 'float_b', label: 'b番-浮き' },
  { key: 'float_kaku', label: '隔勤-浮き' },
];

export function renderUtilizationReportPage(
  date: string,
  capacityRows: UtilizationCapacityRow[],
  reportMap: Record<string, UtilizationReportRow>,
  autoMap: Record<string, UtilizationAutoRow>,
  editable: boolean,
): string {
  const rows = capacityRows.map(cap => {
    const r = reportMap[cap.division];
    const auto = autoMap[cap.division] ?? { kakukin: 0, nikkin: 0 };
    const cell = (key: keyof UtilizationReportRow) => {
      const v = r ? r[key] : (key === 'operating' ? null : 0);
      return v === null || v === undefined ? '' : String(v);
    };
    return `<tr data-division="${escHtml(cap.division)}">
      <td class="u-div">${escHtml(cap.division)}</td>
      <td><input type="number" class="u-in u-cap" data-field="capacity" value="${cap.capacity}" ${editable ? '' : 'readonly'} step="1"></td>
      <td class="u-auto">${auto.kakukin || 0}</td>
      <td class="u-auto">${auto.nikkin || 0}</td>
      ${MANUAL_COLS.map(col => `<td><input type="number" class="u-in" data-field="${col.key}" value="${cell(col.key)}" ${editable ? '' : 'readonly'} step="0.5"></td>`).join('')}
    </tr>`;
  }).join('');

  const headCols = ['課', '認可台数', '隔日勤務(自動)', '日勤勤務(自動)', ...MANUAL_COLS.map(c => c.label)];

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>稼働台数報告表</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #111827; }
  .toolbar { position: sticky; top: 0; z-index: 10; background: #1e3a5f; padding: 10px 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .toolbar a, .toolbar button { font-size: 13px; padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; font-weight: 600; }
  .toolbar a { background: #374151; color: #fff; }
  .toolbar input[type=date] { font-size: 13px; padding: 6px 8px; border-radius: 6px; border: none; }
  .toolbar button.save-btn { background: #dc2626; color: #fff; }
  .toolbar button.print-btn { background: #2563eb; color: #fff; }
  .toolbar button.image-btn { background: #059669; color: #fff; }
  .toolbar .hint { margin-left: auto; font-size: 12px; color: #cbd5e1; }
  .stage { padding: 24px; display: flex; justify-content: center; }

  .sheet { width: 297mm; min-height: 210mm; background: #fff; padding: 12mm 14mm; box-shadow: 0 4px 20px rgba(0,0,0,0.25); }
  .sheet h1 { font-size: 18px; color: #1e3a5f; border-bottom: 3px solid #1e3a5f; padding-bottom: 6px; margin: 0 0 4px; }
  .sheet .note { font-size: 11px; color: #6b7280; margin-bottom: 10px; }
  .sheet .date-label { font-size: 14px; font-weight: 700; margin-bottom: 8px; }

  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #94a3b8; font-size: 12px; text-align: center; padding: 4px 2px; }
  th { background: #1e3a5f; color: #fff; font-weight: 600; white-space: nowrap; }
  td.u-div { font-weight: 700; background: #f3f4f6; white-space: nowrap; }
  td.u-auto { background: #eff6ff; color: #1e3a5f; font-weight: 600; }
  tr.u-total td { background: #f3f4f6; font-weight: 700; }
  .u-in { width: 100%; min-width: 44px; border: none; text-align: center; font-size: 12px; padding: 3px 0; background: transparent; }
  .u-in:focus { background: #fef9c3; outline: 1px solid #f59e0b; }
  .u-in[readonly] { color: #6b7280; }
  .u-cap { font-weight: 700; }

  @media print {
    @page { size: A4 landscape; margin: 0; }
    html, body { background: #fff; }
    .toolbar { display: none; }
    .stage { padding: 0; }
    .sheet { box-shadow: none; width: 297mm; height: 210mm; min-height: 0; margin: 0; overflow: hidden; }
    .u-in { border: none !important; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <a href="${ADMIN_PATH}/crew-shift">← 乗務員シフトに戻る</a>
    <input type="date" id="date-input" value="${escHtml(date)}" onchange="changeDate()">
    ${editable ? '<button class="save-btn" onclick="saveReport()">💾 保存</button>' : ''}
    <button class="print-btn" onclick="window.print()">🖨️ 印刷 / PDF保存</button>
    <button class="image-btn" onclick="saveAsImage()">🖼️ 画像で保存(PNG)</button>
    <span class="hint">認可台数・隔日勤務・日勤勤務は乗務員シフトから自動反映されます</span>
  </div>
  <div class="stage">
    <div class="sheet" id="print-sheet">
      <h1>稼働報告</h1>
      <div class="note">稼働台数は浮きをマイナスした数、日勤は0.5単位、0は書かなくていい、土・日・祝は報告不要</div>
      <div class="date-label" id="date-label"></div>
      <table>
        <thead><tr>${headCols.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
        <tbody id="u-body">${rows}</tbody>
        <tfoot><tr class="u-total" id="u-total-row"></tr></tfoot>
      </table>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js" integrity="sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H" crossorigin="anonymous"></script>
  <script>
    var TOTAL_COLS = ${safeJson(['capacity', 'kakukin', 'nikkin', ...MANUAL_COLS.map(c => c.key)])};
    function fmtDateLabel(v) {
      var d = new Date(v + 'T00:00:00Z');
      var dow = ['日','月','火','水','木','金','土'][d.getUTCDay()];
      return (d.getUTCMonth() + 1) + '月' + d.getUTCDate() + '日（' + dow + '）の稼働報告';
    }
    document.getElementById('date-label').textContent = fmtDateLabel(${safeJson(date)});

    function recalcTotal() {
      var sums = {};
      TOTAL_COLS.forEach(function(k) { sums[k] = 0; });
      document.querySelectorAll('#u-body tr').forEach(function(tr) {
        sums.capacity += parseFloat(tr.querySelector('[data-field=capacity]').value) || 0;
        var autos = tr.querySelectorAll('.u-auto');
        sums.kakukin += parseFloat(autos[0].textContent) || 0;
        sums.nikkin += parseFloat(autos[1].textContent) || 0;
        tr.querySelectorAll('.u-in[data-field]').forEach(function(inp) {
          var f = inp.dataset.field;
          if (f === 'capacity') return;
          sums[f] += parseFloat(inp.value) || 0;
        });
      });
      var html = '<td>計</td>';
      TOTAL_COLS.forEach(function(k) { html += '<td>' + (sums[k] || '') + '</td>'; });
      document.getElementById('u-total-row').innerHTML = html;
    }
    document.getElementById('u-body').addEventListener('input', recalcTotal);
    recalcTotal();

    function changeDate() {
      location.href = '${ADMIN_PATH}/utilization-report?date=' + document.getElementById('date-input').value;
    }

    function saveReport() {
      var date = document.getElementById('date-input').value;
      var capacity = [], rows = [];
      document.querySelectorAll('#u-body tr').forEach(function(tr) {
        var division = tr.dataset.division;
        capacity.push({ division: division, capacity: parseInt(tr.querySelector('[data-field=capacity]').value) || 0 });
        var row = { division: division };
        tr.querySelectorAll('.u-in[data-field]').forEach(function(inp) {
          var f = inp.dataset.field;
          if (f === 'capacity') return;
          row[f] = inp.value === '' ? (f === 'operating' ? null : 0) : parseFloat(inp.value);
        });
        rows.push(row);
      });
      fetch(location.pathname.replace('/utilization-report', '/api/utilization-report/save'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: date, capacity: capacity, rows: rows }),
      }).then(function(res) { return res.json(); }).then(function(data) {
        if (data.error) { alert(data.error); return; }
        alert('保存しました');
      }).catch(function() { alert('保存に失敗しました'); });
    }

    function saveAsImage() {
      var el = document.getElementById('print-sheet');
      if (typeof html2canvas === 'undefined') { alert('画像化ライブラリの読み込みに失敗しました。通信環境を確認してください。'); return; }
      html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then(function(canvas) {
        var link = document.createElement('a');
        link.download = '稼働台数報告表_' + ${safeJson(date)} + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
      }).catch(function() { alert('画像の生成に失敗しました'); });
    }
  </script>
</body>
</html>`;
}
