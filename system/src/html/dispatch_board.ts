// 配車管理：日別配車ボード
// 車両（vehicle_teams）を軸に、その日どの乗務員がどの勤務記号で乗るかを1〜2枠(横持ち)で編集する画面。
// DB本体(dispatch_assignments)は「車両×日付×勤務記号×1人」の正規化行だが、
// このビューでは車番ごとに最大2枠へpivotして表示する（H818.pdfの日勤A/B別行と一致する粒度）。
import { escHtml, safeJson, saveToastHtml, saveToastScript } from './layout';
import { ADMIN_PATH } from '../config';

export type DispatchVehicleRow = { car_no: string; team: number };
export type DispatchAssignmentRow = { car_no: string; team: number; shift_code: string; emp_code: string | null; member_name: string | null; note: string };
export type DispatchMember = { emp_code: string; name: string; division: string; team: number };
export type DispatchType = { code: string; label: string; color: string };
export type DispatchAlertInfo = { boundary: 'normal' | 'caution' | 'strong_caution' | 'overlap'; withinDay: 'normal' | 'caution' | 'strong_caution' | 'overlap' };
export type DispatchPriority = { role: 'p1' | 'p2' | 'r'; letter: string; name: string };
export type DispatchLimitInfo = { status: 'none' | 'inspection_default' | 'extended' | 'blocked'; usableFrom: string | null; note: string };

function levelRank(level: string): number {
  return ({ normal: 0, caution: 1, strong_caution: 2, overlap: 3 } as Record<string, number>)[level] ?? 0;
}

const ALERT_META: Record<string, { label: string; color: string; bg: string }> = {
  normal:         { label: '', color: '', bg: '' },
  caution:        { label: '注意', color: '#92400e', bg: '#fef3c7' },
  strong_caution: { label: '強い注意', color: '#9a3412', bg: '#fed7aa' },
  overlap:        { label: '重複', color: '#991b1b', bg: '#fecaca' },
};

export function dispatchBoardPage(args: {
  date: string; ka: string; team: string; allTeams: number[];
  vehicles: DispatchVehicleRow[]; assignments: DispatchAssignmentRow[];
  members: DispatchMember[]; types: DispatchType[]; editable: boolean;
  alerts: Record<string, DispatchAlertInfo>; priorities: Record<string, DispatchPriority[]>; limits: Record<string, DispatchLimitInfo>;
}): string {
  const { date, ka, team, allTeams, vehicles, assignments, members, types, editable, alerts, priorities, limits } = args;

  const byCar = new Map<string, DispatchAssignmentRow[]>();
  for (const a of assignments) {
    if (!byCar.has(a.car_no)) byCar.set(a.car_no, []);
    byCar.get(a.car_no)!.push(a);
  }

  const kaOptions = [1, 2, 3, 4].map(k =>
    `<option value="${k}" ${ka === String(k) ? 'selected' : ''}>${k}課</option>`
  ).join('');

  // 班プルダウンは選択中の課に属する班（未選択なら実在する全班）に絞って表示。「全班」は常に選択可能
  const kaNum = /^[1-4]$/.test(ka) ? parseInt(ka, 10) : null;
  const teamChoices = kaNum ? allTeams.filter(t => Math.ceil(t / 2) === kaNum) : allTeams;
  const teamOptions = teamChoices.map(t =>
    `<option value="${t}" ${team === String(t) ? 'selected' : ''}>${t}班</option>`
  ).join('');

  function slotCells(carNo: string, carTeam: number, slotIndex: number): string {
    const rows = byCar.get(carNo) ?? [];
    const a = rows[slotIndex];
    const codeOptions = ['<option value="">-</option>'].concat(
      types.map(t => `<option value="${escHtml(t.code)}" ${a?.shift_code === t.code ? 'selected' : ''}>${escHtml(t.code)}</option>`)
    ).join('');
    return `
      <td style="border:1px solid #d1d5db;padding:3px;">
        <select class="db-code" data-car="${escHtml(carNo)}" data-team="${carTeam}" data-slot="${slotIndex}" ${editable ? '' : 'disabled'} onchange="onRowChanged(this)" style="width:64px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:3px;">${codeOptions}</select>
      </td>
      <td style="border:1px solid #d1d5db;padding:3px;">
        <input class="db-emp" data-car="${escHtml(carNo)}" data-team="${carTeam}" data-slot="${slotIndex}" ${editable ? '' : 'disabled'}
          value="${escHtml(a?.emp_code ?? '')}" placeholder="社員コード" oninput="onEmpInput(this)" onchange="onRowChanged(this)"
          style="width:90px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:3px;">
        <span class="db-emp-name" data-car="${escHtml(carNo)}" data-slot="${slotIndex}" style="font-size:11px;color:#374151;margin-left:4px;">${escHtml(a?.member_name ?? '')}</span>
      </td>`;
  }

  function limitBadge(carNo: string): string {
    const lim = limits[carNo];
    if (!lim || lim.status === 'none') return '';
    if (lim.status === 'blocked') return `<div style="font-size:9px;color:#991b1b;background:#fecaca;border-radius:3px;padding:0 3px;margin-top:2px;" title="${escHtml(lim.note)}">終日使用不可</div>`;
    const label = lim.status === 'extended' ? `点検延長〜${escHtml(lim.usableFrom ?? '')}` : `点検〜${escHtml(lim.usableFrom ?? '')}`;
    return `<div style="font-size:9px;color:#9a3412;background:#fed7aa;border-radius:3px;padding:0 3px;margin-top:2px;" title="${escHtml(lim.note)}">${label}</div>`;
  }

  function alertBadge(carNo: string): string {
    const info = alerts[carNo];
    if (!info) return '';
    const worst = [info.boundary, info.withinDay].sort((a, b) => levelRank(b) - levelRank(a))[0];
    const meta = ALERT_META[worst];
    if (!meta.label) return '';
    const detail = `前日→当日: ${ALERT_META[info.boundary].label || '通常'} / 当日内: ${ALERT_META[info.withinDay].label || '通常'}`;
    return `<div style="font-size:9px;color:${meta.color};background:${meta.bg};border-radius:3px;padding:0 3px;margin-top:2px;" title="${escHtml(detail)}">${meta.label}</div>`;
  }

  function priorityBadge(carNo: string): string {
    const list = priorities[carNo];
    if (!list || list.length === 0) return '';
    const text = list.map(p => `${p.role === 'p1' ? 'A' : p.role === 'p2' ? 'B' : 'C'}:${escHtml(p.name)}`).join(' ');
    return `<div style="font-size:9px;color:#374151;margin-top:2px;" title="担当車表の優先順位">${text}</div>`;
  }

  const rows = vehicles.map(v => {
    const note = (byCar.get(v.car_no) ?? [])[0]?.note ?? '';
    return `<tr class="db-row" data-car="${escHtml(v.car_no)}" data-team="${v.team}">
      <td style="border:1px solid #d1d5db;padding:4px 8px;font-weight:600;font-size:12px;${'position:sticky;left:0;background:#f8fafc;z-index:1;'}">
        ${escHtml(v.car_no)}<div style="font-size:9px;color:#9ca3af;font-weight:400;">${v.team}班</div>
        ${alertBadge(v.car_no)}${limitBadge(v.car_no)}${priorityBadge(v.car_no)}
        ${editable ? `<div><a href="javascript:void(0)" onclick="openLimitModal('${escHtml(v.car_no)}')" style="font-size:9px;color:#2563eb;">車両制限</a></div>` : ''}
      </td>
      ${slotCells(v.car_no, v.team, 0)}
      ${slotCells(v.car_no, v.team, 1)}
      <td style="border:1px solid #d1d5db;padding:3px;">
        <input class="db-note" data-car="${escHtml(v.car_no)}" ${editable ? '' : 'disabled'} value="${escHtml(note)}" placeholder="変更メモ" onchange="onRowChanged(this)"
          style="width:120px;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:3px;">
      </td>
    </tr>`;
  }).join('');

  return `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
    <h2 style="font-size:15px;font-weight:bold;color:#1e3a5f;">配車管理（日別配車ボード）</h2>
  </div>

  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;">
    <button onclick="changeDate(-1)" style="padding:7px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;">◀ 前日</button>
    <input type="date" id="f-date" value="${escHtml(date)}" onchange="onFilterChanged()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;">
    <button onclick="changeDate(1)" style="padding:7px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;">翌日 ▶</button>
    <button onclick="goToday()" style="padding:7px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;">今日</button>

    <span style="font-size:11px;color:#6b7280;margin-left:12px;">【課】</span>
    <select id="f-ka" onchange="onKaChanged()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;background:white;">
      <option value="">全部</option>
      ${kaOptions}
    </select>
    <span style="font-size:11px;color:#6b7280;">【班】</span>
    <select id="f-team" onchange="onFilterChanged()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;background:white;">
      <option value="">全班</option>
      ${teamOptions}
    </select>

    <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;">
      <button onclick="openRoster('kokyu')" class="btn-secondary" style="border:none;cursor:pointer;">公休者参照</button>
      <button onclick="openRoster('meiban')" class="btn-secondary" style="border:none;cursor:pointer;">明番者参照</button>
      <button onclick="openRoster('unassigned')" class="btn-secondary" style="border:none;cursor:pointer;">車両未割当者</button>
      ${editable ? `<button onclick="openTimeMasterModal()" class="btn-secondary" style="border:none;cursor:pointer;background:#1e3a5f;">勤務時間マスタ</button>
      <button onclick="openImportModal()" class="btn-secondary" style="border:none;cursor:pointer;background:#166534;">配車計画表PDFアップロード</button>` : ''}
    </div>
  </div>

  ${editable ? `
  <div style="margin-bottom:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
    <span id="pending-count-label" style="font-size:12px;color:#9ca3af;">変更なし</span>
    <button onclick="saveAll()" id="save-btn" disabled style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;opacity:0.5;">一括保存</button>
  </div>` : `<div style="margin-bottom:8px;font-size:12px;color:#6b7280;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:6px 12px;display:inline-block;">閲覧専用（編集権限がありません）</div>`}

  <div style="overflow-x:auto;border:1px solid #d1d5db;border-radius:8px;-webkit-overflow-scrolling:touch;">
    <table style="border-collapse:collapse;">
      <thead style="position:sticky;top:0;z-index:5;">
        <tr style="background:#1e3a5f;color:white;">
          <th style="min-width:70px;position:sticky;left:0;z-index:6;background:#1e3a5f;font-size:11px;padding:5px 8px;border:1px solid #4b6cb7;">車番</th>
          <th style="font-size:11px;padding:5px;border:1px solid #4b6cb7;">[1]勤務</th>
          <th style="font-size:11px;padding:5px;border:1px solid #4b6cb7;">[1]乗務員</th>
          <th style="font-size:11px;padding:5px;border:1px solid #4b6cb7;">[2]勤務</th>
          <th style="font-size:11px;padding:5px;border:1px solid #4b6cb7;">[2]乗務員</th>
          <th style="font-size:11px;padding:5px;border:1px solid #4b6cb7;">変更</th>
        </tr>
      </thead>
      <tbody id="db-tbody">${rows || '<tr><td colspan="6" style="padding:16px;text-align:center;color:#9ca3af;font-size:12px;">該当する車両がありません</td></tr>'}</tbody>
    </table>
  </div>
</div>

<!-- 参照リストモーダル -->
<div id="roster-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h3 id="roster-title" style="font-size:15px;font-weight:700;color:#1e3a5f;"></h3>
      <button onclick="document.getElementById('roster-modal').style.display='none'" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div id="roster-body" style="font-size:13px;">読み込み中...</div>
  </div>
</div>

${editable ? `
<!-- 車両使用制限モーダル -->
<div id="limit-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h3 id="limit-modal-title" style="font-size:15px;font-weight:700;color:#1e3a5f;"></h3>
      <button onclick="document.getElementById('limit-modal').style.display='none'" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">点検登録車は当日8:00まで使用制限がデフォルト適用されます。延長・終日不可・解除をここで上書きできます。</div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <label style="font-size:12px;">使用可能時刻へ延長: <input type="time" id="limit-usable-from" style="border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:13px;"></label>
      <button onclick="submitLimit('extend')" style="padding:8px;background:#f59e0b;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;">この時刻へ延長</button>
      <button onclick="submitLimit('block')" style="padding:8px;background:#dc2626;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;">終日使用不可にする</button>
      <button onclick="submitLimit('clear')" style="padding:8px;background:#fff;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">制限を解除する</button>
    </div>
  </div>
</div>

<!-- 勤務時間マスタモーダル -->
<div id="time-master-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:680px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;">勤務時間マスタ（出庫・定時帰庫・残業MAX）</h3>
      <button onclick="document.getElementById('time-master-modal').style.display='none'" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">アラート判定（前後勤務の時間衝突チェック）に使う基準時刻です。日をまたぐ場合は「+1日」にチェックしてください。</div>
    <div id="time-master-body">読み込み中...</div>
    <div style="display:flex;justify-content:flex-end;margin-top:12px;">
      <button onclick="saveTimeMaster()" style="padding:9px 20px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">保存</button>
    </div>
  </div>
</div>

<!-- 配車計画表PDF取込モーダル -->
<div id="import-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:520px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;">配車計画表PDFの取込</h3>
      <button onclick="document.getElementById('import-modal').style.display='none'" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:12px;">
      「◆配車計画表◆」形式のPDFをアップロードします（1ページ=1日1班、月・全課分の複数ページを一括で取り込めます）。PDF内の日付・班と重なる既存配車データは新しい内容で上書きされます。氏名・記号はテキストとして読み取るため、AIによる誤読はありません。
    </div>
    <input type="file" id="import-file" accept="application/pdf" style="margin-bottom:12px;">
    <div id="import-result" style="font-size:12px;margin-bottom:10px;"></div>
    <div style="display:flex;justify-content:flex-end;">
      <button onclick="doImport()" id="import-btn" style="padding:9px 20px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">取込実行</button>
    </div>
  </div>
</div>` : ''}

${saveToastHtml()}

<style>
  .btn-secondary { padding:6px 14px;background:#6b7280;color:white;border-radius:6px;text-decoration:none;font-size:13px;display:inline-block; }
  .db-row[data-pending="true"] td:first-child { outline:2px dashed #f59e0b; outline-offset:-2px; }
</style>

<script>
var CAN_EDIT = ${editable ? 'true' : 'false'};
var API = '${ADMIN_PATH}/api/dispatch';
var CUR_DATE = ${safeJson(date)};
var MEMBERS_BY_CODE = {};
(${safeJson(members)}).forEach(function(m) { MEMBERS_BY_CODE[m.emp_code] = m; });
var _pendingCars = {};

function sel(s) { return document.querySelector(s); }
${saveToastScript()}

function onFilterChanged() {
  var d = sel('#f-date').value;
  var ka = sel('#f-ka').value;
  var team = sel('#f-team').value;
  location.href = '${ADMIN_PATH}/dispatch-board?date=' + d + (ka ? '&ka=' + ka : '') + (team ? '&team=' + team : '');
}
function onKaChanged() {
  sel('#f-team').value = '';
  onFilterChanged();
}
function changeDate(delta) {
  var d = new Date(sel('#f-date').value + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  sel('#f-date').value = d.toISOString().slice(0, 10);
  onFilterChanged();
}
function goToday() {
  sel('#f-date').value = new Date().toISOString().slice(0, 10);
  onFilterChanged();
}

function onEmpInput(input) {
  var car = input.dataset.car, slotIdx = input.dataset.slot;
  var nameSpan = document.querySelector('.db-emp-name[data-car="' + CSS.escape(car) + '"][data-slot="' + slotIdx + '"]');
  var code = input.value.trim();
  if (!code) { nameSpan.textContent = ''; nameSpan.style.color = '#374151'; return; }
  var m = MEMBERS_BY_CODE[code];
  if (m) { nameSpan.textContent = m.name; nameSpan.style.color = '#374151'; }
  else { nameSpan.textContent = '該当なし'; nameSpan.style.color = '#dc2626'; }
}

function onRowChanged(el) {
  var car = el.dataset.car;
  _pendingCars[car] = true;
  var row = document.querySelector('.db-row[data-car="' + CSS.escape(car) + '"]');
  if (row) row.dataset.pending = 'true';
  var count = Object.keys(_pendingCars).length;
  sel('#pending-count-label').textContent = count > 0 ? ('変更 ' + count + '台') : '変更なし';
  var btn = sel('#save-btn');
  if (btn) { btn.disabled = count === 0; btn.style.opacity = count === 0 ? '0.5' : '1'; }
}

function collectCarPayload(carNo) {
  var team = parseInt(document.querySelector('.db-row[data-car="' + CSS.escape(carNo) + '"]').dataset.team, 10);
  var slots = [];
  for (var i = 0; i < 2; i++) {
    var codeEl = document.querySelector('.db-code[data-car="' + CSS.escape(carNo) + '"][data-slot="' + i + '"]');
    var empEl = document.querySelector('.db-emp[data-car="' + CSS.escape(carNo) + '"][data-slot="' + i + '"]');
    var code = codeEl ? codeEl.value : '';
    if (!code) continue;
    slots.push({ shift_code: code, emp_code: empEl ? (empEl.value.trim() || null) : null, note: '' });
  }
  var noteEl = document.querySelector('.db-note[data-car="' + CSS.escape(carNo) + '"]');
  if (slots.length > 0) slots[0].note = noteEl ? noteEl.value.trim() : '';
  return { car_no: carNo, team: team, slots: slots };
}

async function saveAll() {
  var carNos = Object.keys(_pendingCars);
  if (carNos.length === 0) return;
  var cars = carNos.map(collectCarPayload);
  var btn = sel('#save-btn');
  btn.disabled = true;
  try {
    var res = await fetch(API + '/assignments/batch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: CUR_DATE, cars: cars }),
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || '保存に失敗しました');
    _pendingCars = {};
    document.querySelectorAll('.db-row[data-pending="true"]').forEach(function(r) { delete r.dataset.pending; });
    sel('#pending-count-label').textContent = '変更なし';
    var msg = '保存しました';
    if (data.notFound && data.notFound.length > 0) msg += '（未登録の社員コード: ' + data.notFound.join(', ') + ' は未割当のまま保存されました）';
    showToast(msg);
  } catch (e) {
    alert(e.message || '保存に失敗しました');
  } finally {
    btn.disabled = Object.keys(_pendingCars).length === 0;
  }
}

var _limitTargetCar = '';
function openLimitModal(carNo) {
  _limitTargetCar = carNo;
  sel('#limit-modal-title').textContent = '車両制限：' + carNo + '（' + CUR_DATE + '）';
  sel('#limit-usable-from').value = '';
  sel('#limit-modal').style.display = 'flex';
}
async function submitLimit(action) {
  var body = { car_no: _limitTargetCar, date: CUR_DATE, action: action };
  if (action === 'extend') {
    var t = sel('#limit-usable-from').value;
    if (!t) { alert('時刻を指定してください'); return; }
    body.usable_from = t;
  }
  var res = await fetch(API + '/vehicle-limits', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  var data = await res.json();
  if (!res.ok) { alert(data.error || '保存に失敗しました'); return; }
  sel('#limit-modal').style.display = 'none';
  location.reload();
}

var TIME_MASTER_ROWS = [];
async function openTimeMasterModal() {
  sel('#time-master-modal').style.display = 'flex';
  sel('#time-master-body').textContent = '読み込み中...';
  var res = await fetch(API + '/time-master');
  var data = await res.json();
  TIME_MASTER_ROWS = data.rows || [];
  renderTimeMasterRows();
}
function renderTimeMasterRows() {
  var html = '<table style="border-collapse:collapse;width:100%;font-size:12px;">' +
    '<thead><tr style="background:#f3f4f6;">' +
    '<th style="padding:4px;border:1px solid #e5e7eb;">記号</th><th style="padding:4px;border:1px solid #e5e7eb;">名称</th>' +
    '<th style="padding:4px;border:1px solid #e5e7eb;">出庫</th><th style="padding:4px;border:1px solid #e5e7eb;">定時帰庫</th><th style="padding:4px;border:1px solid #e5e7eb;">+1日</th>' +
    '<th style="padding:4px;border:1px solid #e5e7eb;">残業MAX</th><th style="padding:4px;border:1px solid #e5e7eb;">+1日</th><th style="padding:4px;border:1px solid #e5e7eb;">既定</th>' +
    '</tr></thead><tbody>';
  TIME_MASTER_ROWS.forEach(function(r, i) {
    html += '<tr>' +
      '<td style="padding:2px;border:1px solid #e5e7eb;"><input data-i="' + i + '" data-f="shift_code" value="' + (r.shift_code||'') + '" style="width:36px;font-size:12px;"></td>' +
      '<td style="padding:2px;border:1px solid #e5e7eb;"><input data-i="' + i + '" data-f="variant_label" value="' + (r.variant_label||'') + '" style="width:80px;font-size:12px;"></td>' +
      '<td style="padding:2px;border:1px solid #e5e7eb;"><input type="time" data-i="' + i + '" data-f="departure_time" value="' + (r.departure_time||'') + '" style="font-size:12px;"></td>' +
      '<td style="padding:2px;border:1px solid #e5e7eb;"><input type="time" data-i="' + i + '" data-f="standard_return_time" value="' + (r.standard_return_time||'') + '" style="font-size:12px;"></td>' +
      '<td style="padding:2px;border:1px solid #e5e7eb;text-align:center;"><input type="checkbox" data-i="' + i + '" data-f="return_days_offset" ' + (r.return_days_offset ? 'checked' : '') + '></td>' +
      '<td style="padding:2px;border:1px solid #e5e7eb;"><input type="time" data-i="' + i + '" data-f="max_overtime_return_time" value="' + (r.max_overtime_return_time||'') + '" style="font-size:12px;"></td>' +
      '<td style="padding:2px;border:1px solid #e5e7eb;text-align:center;"><input type="checkbox" data-i="' + i + '" data-f="overtime_days_offset" ' + (r.overtime_days_offset ? 'checked' : '') + '></td>' +
      '<td style="padding:2px;border:1px solid #e5e7eb;text-align:center;"><input type="checkbox" data-i="' + i + '" data-f="is_default" ' + (r.is_default ? 'checked' : '') + '></td>' +
      '</tr>';
  });
  html += '</tbody></table>';
  sel('#time-master-body').innerHTML = html;
  document.querySelectorAll('#time-master-body input').forEach(function(input) {
    input.addEventListener('change', function() {
      var i = parseInt(input.dataset.i, 10), f = input.dataset.f;
      TIME_MASTER_ROWS[i][f] = input.type === 'checkbox' ? (input.checked ? 1 : 0) : input.value;
    });
  });
}
async function saveTimeMaster() {
  var res = await fetch(API + '/time-master/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: TIME_MASTER_ROWS }),
  });
  var data = await res.json();
  if (!res.ok) { alert(data.error || '保存に失敗しました'); return; }
  showToast('勤務時間マスタを保存しました');
  sel('#time-master-modal').style.display = 'none';
}

// ===== 配車計画表PDFアップロード =====
// PDF解析はブラウザ側で行い、結果を小分けにしてサーバーへ送信する（crew_shift.tsと同じ設計）。
var CHUNK_ASSIGNMENTS = 2500;
var _dispatchPdfParserLoadPromise = null;
function loadDispatchPdfParser() {
  if (window.parseDispatchPdf) return Promise.resolve();
  if (_dispatchPdfParserLoadPromise) return _dispatchPdfParserLoadPromise;
  _dispatchPdfParserLoadPromise = new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = API + '/pdf-parser.js';
    s.onload = function() { resolve(); };
    s.onerror = function() { reject(new Error('解析ライブラリの読込に失敗しました')); };
    document.head.appendChild(s);
  });
  return _dispatchPdfParserLoadPromise;
}
function chunkArray(arr, size) {
  var out = [];
  for (var i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
async function postJson(url, body) {
  var res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  var d = await res.json().catch(function() { return {}; });
  if (!res.ok) throw new Error(d.error || 'server');
  return d;
}
function openImportModal() {
  sel('#import-result').textContent = '';
  sel('#import-file').value = '';
  sel('#import-modal').style.display = 'flex';
}
function setImportProgress(text) {
  sel('#import-result').innerHTML = '<span style="color:#374151;">' + text.replace(/&/g,'&amp;').replace(/</g,'&lt;') + '</span>';
}
async function doImport() {
  var f = sel('#import-file').files[0];
  if (!f) { sel('#import-result').innerHTML = '<span style="color:#dc2626;">PDFファイルを選択してください</span>'; return; }
  var btn = sel('#import-btn');
  btn.disabled = true; btn.textContent = '取込中...';
  sel('#import-result').textContent = '';
  try {
    setImportProgress('解析ライブラリ読込中...');
    await loadDispatchPdfParser();

    var buf = await f.arrayBuffer();
    var result = await window.parseDispatchPdf(new Uint8Array(buf), function(done, total) {
      setImportProgress('PDF解析中... (' + done + '/' + total + 'ページ)');
    });
    var pages = result.pages || [];
    if (pages.length === 0) {
      var noDataMsg = 'PDFから配車データを読み取れませんでした。「配車計画表」形式のPDFか確認してください';
      if (result.warnings && result.warnings.length) noDataMsg += '<br><span style="color:#d97706;">' + result.warnings.join('<br>') + '</span>';
      sel('#import-result').innerHTML = '<span style="color:#dc2626;">' + noDataMsg + '</span>';
      return;
    }

    var targets = pages.map(function(pg) { return { date: pg.date, team: pg.team }; });
    setImportProgress('既存データのクリア中... (' + targets.length + '頁分)');
    var targetChunks = chunkArray(targets, 500);
    for (var ci = 0; ci < targetChunks.length; ci++) {
      await postJson(API + '/import/clear', { targets: targetChunks[ci] });
    }

    var allAssignments = [];
    pages.forEach(function(pg) {
      pg.assignments.forEach(function(a) {
        allAssignments.push({ date: pg.date, car_no: a.car_no, team: a.team, shift_code: a.shift_code, emp_code: a.emp_code, note: a.note });
      });
    });
    var skipped = allAssignments.filter(function(a) { return !a.emp_code; }).length;
    var notFoundCodes = {};
    var assignChunks = chunkArray(allAssignments, CHUNK_ASSIGNMENTS);
    for (var ai = 0; ai < assignChunks.length; ai++) {
      setImportProgress('配車登録中... (' + (ai + 1) + '/' + assignChunks.length + ')');
      var r = await postJson(API + '/import/assignments', { assignments: assignChunks[ai] });
      (r.notFound || []).forEach(function(code) { notFoundCodes[code] = true; });
    }
    var notFoundList = Object.keys(notFoundCodes);

    var remarks = pages.filter(function(pg) { return pg.remarks; }).map(function(pg) { return { date: pg.date, team: pg.team, content: pg.remarks }; });
    if (remarks.length > 0) {
      setImportProgress('備考登録中...');
      await postJson(API + '/import/remarks', { remarks: remarks });
    }

    var dates = pages.map(function(pg) { return pg.date; }).sort();
    var teams = Array.from(new Set(pages.map(function(pg) { return pg.team; }))).sort(function(a,b){return a-b;});
    setImportProgress('仕上げ処理中...');
    await postJson(API + '/import/finish', {
      file_name: f.name, start_date: dates[0], end_date: dates[dates.length - 1],
      teams: teams, page_count: pages.length, assignment_count: allAssignments.length, skipped_count: skipped + notFoundList.length,
    });

    var msg = '取込完了: ' + pages.length + '頁 / ' + allAssignments.length + '件（' + dates[0] + '〜' + dates[dates.length - 1] + '、' + teams.join(',') + '班）';
    if (skipped > 0) msg += '<br><span style="color:#d97706;">' + skipped + '件は担当者欄が空欄のため未割当のまま取り込みました</span>';
    if (notFoundList.length > 0) msg += '<br><span style="color:#d97706;">乗務員シフトに未登録の社員コードが' + notFoundList.length + '件あり、未割当のまま取り込みました: ' + notFoundList.slice(0, 20).join(', ') + (notFoundList.length > 20 ? ' 他' : '') + '</span>';
    if (result.warnings && result.warnings.length) msg += '<br><span style="color:#d97706;">' + result.warnings.join('<br>') + '</span>';
    sel('#import-result').innerHTML = '<span style="color:#166534;">' + msg + '</span>';
    setTimeout(function() { location.href = '${ADMIN_PATH}/dispatch-board?date=' + dates[0]; }, 1200);
  } catch (e) {
    sel('#import-result').innerHTML = '<span style="color:#dc2626;">' + (e.message || '取込に失敗しました') + '</span>';
  } finally {
    btn.disabled = false; btn.textContent = '取込実行';
  }
}

var ROSTER_TITLES = { kokyu: '公休者', meiban: '明番者（前日出番・当日休み）', unassigned: '車両未割当者' };
async function openRoster(kind) {
  sel('#roster-title').textContent = ROSTER_TITLES[kind] + '（' + CUR_DATE + '）';
  sel('#roster-body').textContent = '読み込み中...';
  sel('#roster-modal').style.display = 'flex';
  var ka = sel('#f-ka').value, team = sel('#f-team').value;
  var res = await fetch(API + '/roster?date=' + CUR_DATE + (ka ? '&ka=' + ka : '') + (team ? '&team=' + team : ''));
  var data = await res.json();
  var list = data[kind] || [];
  if (list.length === 0) { sel('#roster-body').innerHTML = '<div style="color:#9ca3af;">該当者なし</div>'; return; }
  sel('#roster-body').innerHTML = '<div style="display:flex;flex-direction:column;gap:4px;">' + list.map(function(m) {
    var extra = m.code ? (' <span style="color:#6b7280;">(' + m.code + ')</span>') : '';
    return '<div style="padding:4px 8px;border-bottom:1px solid #f3f4f6;">' + m.emp_code + ' ' + m.name + ' <span style="color:#9ca3af;font-size:11px;">' + m.team + '班</span>' + extra + '</div>';
  }).join('') + '</div>';
}
</script>`;
}
