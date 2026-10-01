// 個人別シフト（1人1ページ形式の月間勤務予定表PDFの取込＋社員ごとの検索・出力）
// 乗務員シフト（班一覧形式PDF）とデータ（crew_shift_members/crew_shifts）を共有する。
// このページ固有の機能:
//   ・「◆勤務予定表◆」1人1ページ形式PDFの取込（parseIndividualCrewShiftPdf）
//   ・氏名/社員コード/課/班で横断検索し、1人ずつ月間シフトを閲覧
//   ・検索結果から複数人を選んで、個人別シフト表をまとめて印刷（/personal-shift/print へPOST）
import { escHtml, safeJson, saveToastHtml, saveToastScript } from './layout';
import { ADMIN_PATH } from '../config';
import type { CrewShiftMember, CrewShiftType, CrewShiftCell } from './crew_shift';
import { getHolidayName } from '../utils/taxi_calendar';
import { PDF_PARSERS_CLIENT_VERSION } from '../assets/pdf_parsers_client_version';

export function personalShiftPage(
  members: CrewShiftMember[],
  types: CrewShiftType[],
  shiftMap: Record<string, CrewShiftCell>,
  dates: string[],
  startDate: string,
  endDate: string,
  editable: boolean,
  periods: Array<{ start_date: string; end_date: string }>,
): string {
  const teams = [...new Set(members.map(m => m.team))].sort((a, b) => a - b);
  const divisions = [...new Set(members.map(m => m.division))].sort();
  const colorMap: Record<string, string> = {};
  const labelMap: Record<string, string> = {};
  const weightMap: Record<string, number> = {};
  for (const t of types) { colorMap[t.code] = t.color; labelMap[t.code] = t.label; weightMap[t.code] = t.count_weight; }
  const holidayMap: Record<string, boolean> = {};
  for (const d of dates) if (getHolidayName(d)) holidayMap[d] = true;

  const periodOptions = periods.map(p =>
    `<option value="${p.start_date}|${p.end_date}" ${p.start_date === startDate && p.end_date === endDate ? 'selected' : ''}>${p.start_date} 〜 ${p.end_date}</option>`
  ).join('');

  return `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
    <h2 style="font-size:15px;font-weight:bold;color:#1e3a5f;">個人別シフト</h2>
    <select id="period-select" onchange="changePeriod()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;background:white;">
      ${periodOptions || '<option>取込データがありません</option>'}
    </select>
    <span style="font-size:11px;color:#9ca3af;">※ここでの登録・変更は「乗務員シフト」画面にもそのまま反映されます</span>
  </div>

  ${editable ? `
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:14px;">
    <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">個人別勤務予定表PDFの取込</div>
    <div style="font-size:11px;color:#6b7280;margin-bottom:10px;">「◆勤務予定表◆」（社員1人につき1ページ）形式のPDFをアップロードします。PDF内の期間と重なる既存データは新しい内容で上書きされます。</div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <input type="file" id="ps-import-file" accept="application/pdf">
      <button onclick="psDoImport()" id="ps-import-btn" style="padding:8px 18px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">取込実行</button>
    </div>
    <div id="ps-import-result" style="font-size:12px;margin-top:8px;"></div>
  </div>` : ''}

  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;">
    <input id="f-search" type="text" placeholder="氏名・社員コードで検索" oninput="applyFilters()" style="border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;width:200px;">
    <select id="f-division" onchange="applyFilters()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;background:white;">
      <option value="">課：すべて</option>
      ${divisions.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('')}
    </select>
    <select id="f-team" onchange="applyFilters()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;background:white;">
      <option value="">班：すべて</option>
      ${teams.map(t => `<option value="${t}">${t}班</option>`).join('')}
    </select>
    <span id="f-result-count" style="margin-left:auto;font-size:11px;color:#9ca3af;"></span>
  </div>

  <div style="overflow-x:auto;border:1px solid #d1d5db;border-radius:8px;">
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <thead>
        <tr style="background:#1e3a5f;color:white;">
          <th style="padding:6px 8px;border:1px solid #4b6cb7;width:32px;"><input type="checkbox" id="ck-all" onchange="toggleAll(this)"></th>
          <th style="padding:6px 8px;border:1px solid #4b6cb7;text-align:left;">氏名</th>
          <th style="padding:6px 8px;border:1px solid #4b6cb7;">社員コード</th>
          <th style="padding:6px 8px;border:1px solid #4b6cb7;">課</th>
          <th style="padding:6px 8px;border:1px solid #4b6cb7;">班</th>
          <th style="padding:6px 8px;border:1px solid #4b6cb7;">車番</th>
          <th style="padding:6px 8px;border:1px solid #4b6cb7;"></th>
        </tr>
      </thead>
      <tbody id="ps-tbody"></tbody>
    </table>
  </div>

  <div style="position:sticky;bottom:0;margin-top:10px;background:white;border:1px solid #d1d5db;border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;box-shadow:0 -2px 8px rgba(0,0,0,0.05);">
    <span id="sel-count-label" style="font-size:12px;color:#6b7280;">0名選択中</span>
    <button onclick="printSelected()" style="margin-left:auto;padding:8px 18px;background:#166534;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">選択した人のシフト表を印刷</button>
  </div>
</div>

<!-- 個人シフト閲覧モーダル（元の「◆勤務予定表◆」PDFの見た目をそのまま再現） -->
<div id="detail-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:4px;padding:20px;width:100%;max-width:640px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);font-family:'Hiragino Mincho ProN','Hiragino Sans',serif;">
    <div style="display:flex;justify-content:flex-end;">
      <button onclick="closeDetail()" style="color:#9ca3af;font-size:20px;background:none;border:none;cursor:pointer;line-height:1;">✕</button>
    </div>
    <div class="ot-title">◆　勤　務　予　定　表　◆</div>
    <div id="detail-subhead" class="ot-subhead"></div>
    <div id="detail-body"></div>
  </div>
</div>

${saveToastHtml()}

<style>
  .ps-row:hover { background:#f9fafb; }
  .ps-cell { padding:6px 8px;border:1px solid #e5e7eb;text-align:center; }
  .ot-title { text-align:center;font-size:16px;font-weight:700;letter-spacing:5px;margin-bottom:8px; }
  .ot-subhead { display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px;color:#111827; }
  .ot-table { width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed; }
  .ot-table th { border:1px solid #333;padding:3px 2px;font-weight:600;background:#fff; }
  .ot-td { border:1px solid #333;padding:3px 2px;text-align:center;height:18px; }
  .ot-worklabel { text-align:left;padding-left:6px; }
</style>

<script>
var CUR_START = ${safeJson(startDate)};
var CUR_END = ${safeJson(endDate)};
var _members = ${safeJson(members)};
var _shiftMap = ${safeJson(shiftMap)};
var _dates = ${safeJson(dates)};
var _colorMap = ${safeJson(colorMap)};
var _labelMap = ${safeJson(labelMap)};
var _weightMap = ${safeJson(weightMap)};
var _holidayMap = ${safeJson(holidayMap)};
var _selected = {};

function sel(s) { return document.querySelector(s); }
function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
${saveToastScript()}

function changePeriod() {
  var v = sel('#period-select').value.split('|');
  location.href = '${ADMIN_PATH}/personal-shift?start=' + v[0] + '&end=' + v[1];
}

function renderRows() {
  var q = (sel('#f-search').value || '').trim().toLowerCase();
  var division = sel('#f-division').value;
  var team = sel('#f-team').value;
  var shown = _members.filter(function(m) {
    if (division && m.division !== division) return false;
    if (team && String(m.team) !== team) return false;
    if (q) {
      var hay = (m.name + ' ' + m.emp_code).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  sel('#f-result-count').textContent = shown.length + '名 表示中（全' + _members.length + '名）';
  sel('#ps-tbody').innerHTML = shown.map(function(m) {
    var checked = _selected[m.id] ? 'checked' : '';
    return '<tr class="ps-row">' +
      '<td class="ps-cell"><input type="checkbox" data-id="' + m.id + '" onchange="toggleOne(this)" ' + checked + '></td>' +
      '<td class="ps-cell" style="text-align:left;font-weight:600;">' + escH(m.name) + '</td>' +
      '<td class="ps-cell">' + escH(m.emp_code) + '</td>' +
      '<td class="ps-cell">' + escH(m.division) + '</td>' +
      '<td class="ps-cell">' + m.team + '班</td>' +
      '<td class="ps-cell">' + escH(m.car_no || '') + '</td>' +
      '<td class="ps-cell"><button onclick="openDetail(' + m.id + ')" style="padding:4px 10px;border:1px solid #d1d5db;border-radius:6px;background:white;font-size:12px;cursor:pointer;">見る</button></td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="7" style="padding:20px;text-align:center;color:#9ca3af;">該当する社員がいません</td></tr>';
  updateSelCount();
}
function applyFilters() { renderRows(); }
renderRows();

function toggleOne(cb) {
  var id = cb.dataset.id;
  if (cb.checked) _selected[id] = true; else delete _selected[id];
  updateSelCount();
}
function toggleAll(cb) {
  document.querySelectorAll('#ps-tbody input[type=checkbox]').forEach(function(el) {
    el.checked = cb.checked;
    if (cb.checked) _selected[el.dataset.id] = true; else delete _selected[el.dataset.id];
  });
  updateSelCount();
}
function updateSelCount() {
  sel('#sel-count-label').textContent = Object.keys(_selected).length + '名選択中';
}

var WEEKDAY_JA = ['日','月','火','水','木','金','土'];
function dowInfo(date) {
  var dt = new Date(date + 'T00:00:00Z');
  var dow = dt.getUTCDay();
  if (_holidayMap[date]) return { label: '祝', bg: '#fbdce4' };
  if (dow === 0) return { label: '日', bg: '#fbdce4' };
  if (dow === 6) return { label: '土', bg: '#dfe3f7' };
  return { label: WEEKDAY_JA[dow], bg: '#ffffff' };
}
function openDetail(id) {
  var m = _members.find(function(x) { return x.id === id; });
  if (!m) return;
  sel('#detail-subhead').innerHTML =
    '<span>' + CUR_END.slice(0,4) + '年' + parseInt(CUR_END.slice(5,7),10) + '月分　（' + CUR_START.replace(/-/g,'/') + ' ～ ' + CUR_END.replace(/-/g,'/') + '）</span>' +
    '<span>' + escH(m.division) + ' ' + m.team + '班　' + escH(m.emp_code) + escH(m.name) + '　　様</span>';

  var half = (m.sheet_left_days && m.sheet_left_days > 0 && m.sheet_left_days < _dates.length) ? m.sheet_left_days : Math.ceil(_dates.length / 2);
  var leftDates = _dates.slice(0, half);
  var rightDates = _dates.slice(half);
  var maxLen = Math.max(leftDates.length, rightDates.length);
  var shortSide = leftDates.length <= rightDates.length ? 'L' : 'R';
  var shortLen = Math.min(leftDates.length, rightDates.length);

  var workCount = 0;
  _dates.forEach(function(d) {
    var s = _shiftMap[m.id + '_' + d];
    if (s && s.code) workCount += (_weightMap[s.code] || 0);
  });
  var workCountLabel = (Math.round(workCount * 10) % 10 === 0) ? String(Math.round(workCount)) : workCount.toFixed(1);

  function dataCell(d) {
    var s = _shiftMap[m.id + '_' + d];
    var code = s ? s.code : '';
    var dt = new Date(d + 'T00:00:00Z');
    var info = dowInfo(d);
    var dayStr = (dt.getUTCDate() < 10 ? '0' : '') + dt.getUTCDate();
    return '<td class="ot-td" style="background:' + info.bg + ';">' + dayStr + '</td>' +
      '<td class="ot-td" style="background:' + info.bg + ';">' + info.label + '</td>' +
      '<td class="ot-td" style="font-weight:700;">' + escH(code) + '</td>' +
      '<td class="ot-td"></td><td class="ot-td"></td>';
  }
  function emptyCell() { return '<td class="ot-td"></td><td class="ot-td"></td><td class="ot-td"></td><td class="ot-td"></td><td class="ot-td"></td>'; }
  function workCountCell() { return '<td class="ot-td ot-worklabel" colspan="2">勤務数：</td><td class="ot-td" style="font-weight:700;">' + workCountLabel + '</td><td class="ot-td"></td><td class="ot-td"></td>'; }

  var rowsHtml = '';
  for (var i = 0; i < maxLen; i++) {
    var leftHtml = i < leftDates.length ? dataCell(leftDates[i]) : (shortSide === 'L' && i === shortLen ? workCountCell() : emptyCell());
    var rightHtml = i < rightDates.length ? dataCell(rightDates[i]) : (shortSide === 'R' && i === shortLen ? workCountCell() : emptyCell());
    rowsHtml += '<tr>' + leftHtml + rightHtml + '</tr>';
  }
  if (leftDates.length === rightDates.length) rowsHtml += '<tr>' + emptyCell() + workCountCell() + '</tr>';

  sel('#detail-body').innerHTML =
    '<table class="ot-table"><thead><tr><th>日付</th><th>曜日</th><th>勤務</th><th>営業収入</th><th>累　計</th><th>日付</th><th>曜日</th><th>勤務</th><th>営業収入</th><th>累　計</th></tr></thead>' +
    '<tbody>' + rowsHtml + '</tbody></table>';
  sel('#detail-modal').style.display = 'flex';
}
function closeDetail() { sel('#detail-modal').style.display = 'none'; }

function printSelected() {
  var ids = Object.keys(_selected);
  if (ids.length === 0) { showToast('印刷する社員を選択してください'); return; }
  if (ids.length > 200) { showToast('一度に印刷できるのは200名までです'); return; }
  var url = '${ADMIN_PATH}/personal-shift/print?ids=' + ids.join(',') + '&start=' + CUR_START + '&end=' + CUR_END;
  window.open(url, '_blank');
}

// ===== PDF取込 =====
${editable ? `
var PS_API = '${ADMIN_PATH}/api/crew-shift';
var PS_CHUNK_MEMBERS = 300;
var PS_CHUNK_SHIFTS = 3000;
var _psPdfParserLoadPromise = null;
function psLoadPdfParser() {
  if (window.parseIndividualCrewShiftPdf) return Promise.resolve();
  if (_psPdfParserLoadPromise) return _psPdfParserLoadPromise;
  _psPdfParserLoadPromise = new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = PS_API + '/pdf-parser.js?v=${PDF_PARSERS_CLIENT_VERSION}';
    s.onload = function() { resolve(); };
    s.onerror = function() { reject(new Error('解析ライブラリの読込に失敗しました')); };
    document.head.appendChild(s);
  });
  return _psPdfParserLoadPromise;
}
function psChunkArray(arr, size) {
  var out = [];
  for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
async function psPostJson(url, body) {
  var res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  var d = await res.json().catch(function(){ return {}; });
  if (!res.ok) throw new Error(d.error || 'server');
  return d;
}
function psSetProgress(text) {
  sel('#ps-import-result').innerHTML = '<span style="color:#374151;">' + escH(text) + '</span>';
}
async function psDoImport() {
  var f = sel('#ps-import-file').files[0];
  if (!f) { sel('#ps-import-result').innerHTML = '<span style="color:#dc2626;">PDFファイルを選択してください</span>'; return; }
  var btn = sel('#ps-import-btn');
  btn.disabled = true; btn.textContent = '取込中...';
  sel('#ps-import-result').textContent = '';
  try {
    psSetProgress('解析ライブラリ読込中...');
    await psLoadPdfParser();

    psSetProgress('PDF解析中...（社員数が多いため数秒〜数十秒かかります）');
    var buf = await f.arrayBuffer();
    var parsed = await window.parseIndividualCrewShiftPdf(new Uint8Array(buf));
    if (!parsed.members.length) {
      var noDataMsg = 'PDFから乗務員データを読み取れませんでした。「勤務予定表」（1人1ページ）形式のPDFか確認してください';
      if (parsed.warnings && parsed.warnings.length) noDataMsg += '<br><span style="color:#d97706;">' + parsed.warnings.slice(0, 20).map(escH).join('<br>') + '</span>';
      sel('#ps-import-result').innerHTML = '<span style="color:#dc2626;">' + noDataMsg + '</span>';
      return;
    }

    var divisions = Array.from(new Set(parsed.members.map(function(m){ return m.division; }))).sort();
    var empDivision = {};
    var memberCountByDivision = {};
    parsed.members.forEach(function(m) {
      empDivision[m.emp_code] = m.division;
      memberCountByDivision[m.division] = (memberCountByDivision[m.division] || 0) + 1;
    });
    var cellCountByDivision = {};
    parsed.shifts.forEach(function(s) {
      var div = empDivision[s.emp_code] || '';
      cellCountByDivision[div] = (cellCountByDivision[div] || 0) + 1;
    });

    var memberChunks = psChunkArray(parsed.members.map(function(m, i) {
      return { emp_code: m.emp_code, name: m.name, car_no: m.car_no, division: m.division, team: m.team, sort_order: (i + 1) * 10, sheet_left_days: m.sheet_left_days || null };
    }), PS_CHUNK_MEMBERS);
    for (var mi = 0; mi < memberChunks.length; mi++) {
      psSetProgress('乗務員登録中... (' + (mi + 1) + '/' + memberChunks.length + ')');
      await psPostJson(PS_API + '/import/members', { members: memberChunks[mi] });
    }

    psSetProgress('既存シフトのクリア中...');
    await psPostJson(PS_API + '/import/clear', { divisions: divisions, start_date: parsed.startDate, end_date: parsed.endDate });

    var shiftChunks = psChunkArray(parsed.shifts, PS_CHUNK_SHIFTS);
    for (var si = 0; si < shiftChunks.length; si++) {
      psSetProgress('シフト登録中... (' + (si + 1) + '/' + shiftChunks.length + ')');
      await psPostJson(PS_API + '/import/shifts', { shifts: shiftChunks[si] });
    }

    psSetProgress('仕上げ処理中...');
    await psPostJson(PS_API + '/import/finish', {
      file_name: f.name,
      start_date: parsed.startDate,
      end_date: parsed.endDate,
      divisions: divisions.map(function(div) {
        return { division: div, member_count: memberCountByDivision[div] || 0, cell_count: cellCountByDivision[div] || 0 };
      }),
    });

    var divLabel = divisions.join('・');
    var msg = '取込完了: ' + parsed.members.length + '名 / ' + parsed.shifts.length + '件（' + parsed.startDate + '〜' + parsed.endDate + '）' + (divLabel ? '<br>対象: ' + escH(divLabel) : '');
    if (parsed.warnings && parsed.warnings.length) msg += '<br><span style="color:#d97706;">' + parsed.warnings.slice(0, 20).map(escH).join('<br>') + '</span>';
    sel('#ps-import-result').innerHTML = '<span style="color:#166534;">' + msg + '</span>';
    setTimeout(function() { location.href = '${ADMIN_PATH}/personal-shift?start=' + parsed.startDate + '&end=' + parsed.endDate; }, 1200);
  } catch (e) {
    sel('#ps-import-result').innerHTML = '<span style="color:#dc2626;">' + escH(e.message || '取込に失敗しました') + '</span>';
  } finally {
    btn.disabled = false; btn.textContent = '取込実行';
  }
}
` : ''}
</script>`;
}
