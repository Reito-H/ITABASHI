// 退職者リスト（乗務員退職者名簿PDFの取込＋確定済み退職者一覧）
import { escHtml } from './layout';
import { ADMIN_PATH } from '../config';

export type RetireeRow = {
  id: number;
  emp_no: string;
  name: string;
  division: number | null;
  team: number | null;
  hire_date: string | null;
  retirement_date: string | null;
  retirement_reason: string | null;
};

const TH = 'padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;';
const TD = 'padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;';

function tenureLabel(hireDate: string | null, retirementDate: string | null): string {
  if (!hireDate || !retirementDate) return '—';
  const h = new Date(hireDate + 'T00:00:00Z');
  const r = new Date(retirementDate + 'T00:00:00Z');
  if (isNaN(h.getTime()) || isNaN(r.getTime()) || r < h) return '—';
  let years = r.getUTCFullYear() - h.getUTCFullYear();
  let months = r.getUTCMonth() - h.getUTCMonth();
  if (r.getUTCDate() < h.getUTCDate()) months--;
  if (months < 0) { years--; months += 12; }
  return `${years}年${months}ヶ月`;
}

export function staffRetireesPage(params: {
  rows: RetireeRow[];
  filterDiv: string;
  page: number;
  totalCount: number;
  pageSize: number;
}): string {
  const { rows, filterDiv, page, totalCount, pageSize } = params;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const divTabs = [['all', '全課'], ['1', '1課'], ['2', '2課'], ['3', '3課'], ['4', '4課']].map(([v, l]) => {
    const qs = v === 'all' ? '' : `?div=${v}`;
    return `<a href="${ADMIN_PATH}/staff/retirees${qs}" class="ret-dept-tab${filterDiv === v ? ' active' : ''}">${l}</a>`;
  }).join('');

  const tableRows = rows.map(r => `
    <tr>
      <td style="${TD}white-space:nowrap;color:#6b7280;">${r.division ?? '—'}課${r.team ? ' ' + r.team + '班' : ''}</td>
      <td style="${TD}font-family:monospace;color:#6b7280;white-space:nowrap;">${escHtml(r.emp_no)}</td>
      <td style="${TD}font-weight:600;color:#1f2937;">${escHtml(r.name)}</td>
      <td style="${TD}white-space:nowrap;">${escHtml(r.hire_date ?? '—')}</td>
      <td style="${TD}white-space:nowrap;">${escHtml(r.retirement_date ?? '—')}</td>
      <td style="${TD}white-space:nowrap;color:#6b7280;">${tenureLabel(r.hire_date, r.retirement_date)}</td>
      <td style="${TD}color:#374151;">${escHtml(r.retirement_reason ?? '—')}</td>
      <td style="${TD}white-space:nowrap;text-align:center;">
        <button onclick="undoRetire(${r.id},'${escHtml(r.name)}')" style="padding:4px 12px;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">取り消す</button>
      </td>
    </tr>`).join('');

  const pager = totalPages > 1 ? `
    <div style="display:flex;justify-content:center;gap:6px;padding:14px;">
      ${Array.from({ length: totalPages }, (_, i) => i + 1).map(p => {
        const qs = new URLSearchParams();
        if (filterDiv !== 'all') qs.set('div', filterDiv);
        qs.set('page', String(p));
        return `<a href="${ADMIN_PATH}/staff/retirees?${qs.toString()}" style="padding:5px 10px;border-radius:6px;font-size:12px;text-decoration:none;${p === page ? 'background:#2563eb;color:#fff;' : 'background:#f3f4f6;color:#374151;'}">${p}</a>`;
      }).join('')}
    </div>` : '';

  return `
  <div style="max-width:1100px;margin:0 auto;">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <a href="${ADMIN_PATH}/staff" style="color:#6b7280;text-decoration:none;font-size:13px;">← 社員管理</a>
      <h2 style="margin:0;font-size:17px;color:#1e293b;">退職者リスト</h2>
    </div>

    <!-- PDFアップロード -->
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:16px 20px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:6px;">
        <span style="font-size:13px;font-weight:700;color:#1e293b;">乗務員退職者名簿 PDF取込</span>
        <span style="font-size:11px;color:#9ca3af;">社員番号で照合し、該当社員を退職扱いにします（在籍中の社員名簿から自動的に除外）</span>
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <input type="file" id="ret-file" accept=".pdf" style="font-size:13px;">
        <button onclick="previewRetireePdf()" style="padding:7px 16px;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">PDF解析・照合プレビュー</button>
        <button id="ret-confirm-btn" onclick="confirmRetireeImport()" disabled
          style="padding:7px 16px;background:#166534;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;opacity:0.5;">選択した行を退職処理として確定</button>
      </div>
      <div id="ret-preview" style="margin-top:12px;"></div>
    </div>

    <!-- 確定済み退職者一覧 -->
    <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.1);overflow:hidden;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #f3f4f6;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;gap:6px;">${divTabs}</div>
        <span style="font-size:12px;color:#9ca3af;">${totalCount}件</span>
      </div>
      <div style="overflow:auto;">
        <table style="width:100%;border-collapse:collapse;min-width:900px;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="${TH}">課・班</th>
              <th style="${TH}">社員番号</th>
              <th style="${TH}">氏名</th>
              <th style="${TH}">入社日</th>
              <th style="${TH}">退職日</th>
              <th style="${TH}">在籍期間</th>
              <th style="${TH}">退職理由</th>
              <th style="${TH}text-align:center;">操作</th>
            </tr>
          </thead>
          <tbody>${tableRows || `<tr><td colspan="8" style="padding:24px;text-align:center;color:#9ca3af;font-size:13px;">退職者データがありません</td></tr>`}</tbody>
        </table>
      </div>
      ${pager}
    </div>
  </div>

  <style>
    .ret-dept-tab{padding:5px 12px;border-radius:6px;font-size:12px;font-weight:600;color:#374151;background:#f3f4f6;text-decoration:none;}
    .ret-dept-tab.active{background:#2563eb;color:#fff;}
  </style>

  <script>
  var _retPreviewRows = null;
  var _retPdfParserLoadPromise = null;

  function escH(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch];
    });
  }
  function loadRetireePdfParser() {
    if (window.parseRetireePdf) return Promise.resolve();
    if (_retPdfParserLoadPromise) return _retPdfParserLoadPromise;
    _retPdfParserLoadPromise = new Promise(function(resolve, reject) {
      var s = document.createElement('script');
      s.src = '/api/employees/retiree-pdf/parser.js';
      s.onload = function() { resolve(); };
      s.onerror = function() { reject(new Error('解析ライブラリの読込に失敗しました')); };
      document.head.appendChild(s);
    });
    return _retPdfParserLoadPromise;
  }
  async function postJson(url, body) {
    var res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
    var d = await res.json().catch(function(){ return {}; });
    if (!res.ok) throw new Error(d.error || 'server');
    return d;
  }

  var STATUS_LABEL = { matched: '一致', already_retired: '既に退職済み', unmatched: '未一致', duplicate_in_pdf: 'PDF内重複' };
  var STATUS_COLOR = { matched: '#166534', already_retired: '#6b7280', unmatched: '#dc2626', duplicate_in_pdf: '#d97706' };

  function renderRetireePreview(data) {
    _retPreviewRows = data.rows;
    var btn = document.getElementById('ret-confirm-btn');
    var box = document.getElementById('ret-preview');
    var s = data.summary;
    var html = '<div style="font-size:13px;color:#374151;margin-bottom:8px;">'
      + '一致 <b style="color:#166534;">' + s.matched + '</b>件 / 既に退職済み <b style="color:#6b7280;">' + s.already_retired + '</b>件'
      + ' / 未一致 <b style="color:#dc2626;">' + s.unmatched + '</b>件' + (s.duplicate_in_pdf ? ' / PDF内重複 <b style="color:#d97706;">' + s.duplicate_in_pdf + '</b>件' : '') + '</div>';

    if (data.warnings && data.warnings.length) {
      html += '<div style="font-size:12px;color:#d97706;margin-bottom:8px;">' + data.warnings.map(escH).join('<br>') + '</div>';
    }

    html += '<div style="overflow:auto;max-height:360px;border:1px solid #e5e7eb;border-radius:6px;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead style="background:#f9fafb;position:sticky;top:0;"><tr>'
      + '<th style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:center;width:60px;">対象</th>'
      + '<th style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:left;">課</th>'
      + '<th style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:left;">社員番号</th>'
      + '<th style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:left;">氏名(PDF)</th>'
      + '<th style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:left;">退職日</th>'
      + '<th style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:left;">退職理由</th>'
      + '<th style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:left;">判定</th>'
      + '</tr></thead><tbody>';
    data.rows.forEach(function(r, idx) {
      var checkable = r.match_status === 'matched' || r.match_status === 'already_retired';
      var checked = r.match_status === 'matched';
      var mismatchHtml = (r.mismatches && r.mismatches.length) ? '<div style="color:#d97706;font-size:11px;">' + r.mismatches.map(escH).join('<br>') + '</div>' : '';
      html += '<tr style="border-bottom:1px solid #f3f4f6;' + (r.match_status === 'unmatched' ? 'background:#fef2f2;' : '') + '">'
        + '<td style="padding:4px 8px;text-align:center;">' + (checkable ? '<input type="checkbox" data-idx="' + idx + '" ' + (checked ? 'checked' : '') + '>' : '—') + '</td>'
        + '<td style="padding:4px 8px;">' + r.division + '課' + (r.team ? ' ' + r.team + '班' : '') + '</td>'
        + '<td style="padding:4px 8px;font-family:monospace;">' + escH(r.emp_no) + '</td>'
        + '<td style="padding:4px 8px;">' + escH(r.name) + (r.db_name && r.db_name !== r.name ? '<div style="color:#9ca3af;font-size:11px;">DB: ' + escH(r.db_name) + '</div>' : '') + mismatchHtml + '</td>'
        + '<td style="padding:4px 8px;white-space:nowrap;">' + escH(r.retirement_date) + '</td>'
        + '<td style="padding:4px 8px;">' + escH(r.reason || '—') + '</td>'
        + '<td style="padding:4px 8px;color:' + STATUS_COLOR[r.match_status] + ';font-weight:600;">' + STATUS_LABEL[r.match_status] + '</td>'
        + '</tr>';
    });
    html += '</tbody></table></div>';
    box.innerHTML = html;

    var anyCheckable = data.rows.some(function(r) { return r.match_status === 'matched' || r.match_status === 'already_retired'; });
    btn.disabled = !anyCheckable; btn.style.opacity = anyCheckable ? '1' : '0.5';
  }

  async function undoRetire(id, name) {
    if (!confirm(name + ' の退職処理を取り消して在籍に戻しますか？')) return;
    try {
      var res = await fetch('/api/employees/' + id + '/reinstate', { method: 'POST' });
      if (res.ok) { location.reload(); }
      else { alert('取り消しに失敗しました'); }
    } catch (e) {
      alert('通信エラー: ' + e.message);
    }
  }

  async function previewRetireePdf() {
    var f = document.getElementById('ret-file').files[0];
    if (!f) { alert('PDFファイルを選択してください'); return; }
    var box = document.getElementById('ret-preview');
    box.innerHTML = '<div style="color:#6b7280;font-size:13px;">解析中...</div>';
    try {
      await loadRetireePdfParser();
      var buf = await f.arrayBuffer();
      var parsed = await window.parseRetireePdf(new Uint8Array(buf));
      if (!parsed.rows.length) {
        box.innerHTML = '<div style="color:#dc2626;font-size:13px;">PDFから退職者データを読み取れませんでした。「乗務員退職者名簿」形式のPDFか確認してください'
          + (parsed.warnings && parsed.warnings.length ? '<br>' + parsed.warnings.map(escH).join('<br>') : '') + '</div>';
        return;
      }
      var data = await postJson('/api/employees/retiree-pdf/preview', { rows: parsed.rows });
      data.warnings = parsed.warnings || [];
      renderRetireePreview(data);
    } catch (e) {
      box.innerHTML = '<div style="color:#dc2626;font-size:13px;">エラー: ' + escH(e.message) + '</div>';
    }
  }

  async function confirmRetireeImport() {
    if (!_retPreviewRows) return;
    var checkedIdx = Array.from(document.querySelectorAll('#ret-preview input[type=checkbox]:checked')).map(function(el) { return parseInt(el.getAttribute('data-idx')); });
    if (checkedIdx.length === 0) { alert('確定する行を選択してください'); return; }
    if (!confirm(checkedIdx.length + '件を退職処理として確定します。よろしいですか？')) return;

    var rows = checkedIdx.map(function(idx) {
      var r = _retPreviewRows[idx];
      return { employee_id: r.employee_id, retirement_date: r.retirement_date, retirement_reason: r.reason, fill_only: r.match_status === 'already_retired' };
    });
    var btn = document.getElementById('ret-confirm-btn');
    btn.disabled = true; btn.textContent = '処理中...';
    try {
      var fileName = document.getElementById('ret-file').files[0] ? document.getElementById('ret-file').files[0].name : null;
      var res = await postJson('/api/employees/retiree-pdf/confirm', { file_name: fileName, rows: rows });
      alert('退職処理: ' + res.updated + '件 / 補完: ' + res.filled + '件');
      location.reload();
    } catch (e) {
      alert('エラー: ' + e.message);
      btn.disabled = false; btn.textContent = '選択した行を退職処理として確定';
    }
  }
  </script>`;
}
