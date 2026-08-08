// やることリスト（1〜4課 個別チェックリスト + 当直共通タスク）
// ・1〜4課はそれぞれ独立したタスク定義（デフォルト8項目から自由に編集・追加・削除・並び替え可）
// ・当直（ka=NULL）は課の区別なく1本のリストを共有
// ・日付ごとにチェック状態を保存。曜日限定タスクは対象外の日は淡色表示、
//   note_day_of_month が当日と一致するタスクは注意書きを強調表示する
import { escHtml, safeJson } from './layout';
import { ADMIN_PATH } from '../config';

export type TodoTaskRow = {
  id: number;
  ka: number | null;
  title: string;
  time_label: string | null;
  weekdays: string | null;
  note: string | null;
  note_day_of_month: number | null;
  sort_order: number;
  is_done: number | null;
  done_by: string | null;
  done_at: string | null;
};

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

function weekdaysLabel(weekdays: string | null): string {
  if (!weekdays) return '';
  return weekdays.split(',').map(s => parseInt(s, 10)).filter(n => n >= 0 && n <= 6)
    .map(n => WEEKDAY_JA[n]).join('・');
}

function isApplicableToday(weekdays: string | null, todayWeekday: number): boolean {
  if (!weekdays) return true;
  return weekdays.split(',').map(s => parseInt(s, 10)).includes(todayWeekday);
}

function taskRowHtml(t: TodoTaskRow, todayWeekday: number, todayDom: number): string {
  const applicable = isApplicableToday(t.weekdays, todayWeekday);
  const done = !!t.is_done;
  const noteActive = !!(t.note_day_of_month && t.note_day_of_month === todayDom && t.note);
  return `<div class="todo-row${done ? ' done' : ''}${applicable ? '' : ' todo-row-off'}" data-task-id="${t.id}">
    <input type="checkbox" class="todo-check" data-task-id="${t.id}" ${done ? 'checked' : ''} ${applicable ? '' : 'disabled'}>
    <span class="todo-title">${escHtml(t.title)}</span>
    ${t.time_label ? `<span class="todo-time">${escHtml(t.time_label)}</span>` : ''}
    ${!applicable ? `<span class="todo-badge-off">本日対象外（${escHtml(weekdaysLabel(t.weekdays))}のみ）</span>` : ''}
    ${noteActive ? `<span class="todo-note">【注意】${escHtml(t.note ?? '')}</span>` : ''}
    ${done && t.done_by ? `<span class="todo-doneby">${escHtml(t.done_by)}が完了</span>` : ''}
  </div>`;
}

function editRowHtml(t: TodoTaskRow): string {
  return `<div class="todo-edit-row" data-task-id="${t.id}">
    <span class="drag-handle" draggable="true" title="ドラッグで並び替え">⠿</span>
    <span class="todo-edit-title">${escHtml(t.title)}${t.time_label ? ` <small>(${escHtml(t.time_label)})</small>` : ''}${t.weekdays ? ` <small>[${escHtml(weekdaysLabel(t.weekdays))}]</small>` : ''}</span>
    <button class="todo-btn" data-edit-id="${t.id}">編集</button>
  </div>`;
}

const KA_TABS: Array<{ key: string; label: string }> = [
  { key: '1', label: '1課' },
  { key: '2', label: '2課' },
  { key: '3', label: '3課' },
  { key: '4', label: '4課' },
  { key: 'toban', label: '当直' },
];

export function todoListPage(params: {
  ka: string;
  date: string;
  prevDate: string;
  nextDate: string;
  todayDate: string;
  dateLabel: string;
  tasks: TodoTaskRow[];
  editable: boolean;
}): string {
  const { ka, date, prevDate, nextDate, todayDate, dateLabel, tasks, editable } = params;
  const dt = new Date(`${date}T00:00:00Z`);
  const todayWeekday = dt.getUTCDay();
  const todayDom = dt.getUTCDate();
  const qs = (k: string, d: string) => `?ka=${encodeURIComponent(k)}&date=${encodeURIComponent(d)}`;

  return `
<style>
  .todo-wrap { max-width:820px; }
  .todo-tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px; }
  .todo-tab { padding:7px 20px; border-radius:6px 6px 0 0; border:1px solid #d1d5db; border-bottom:none;
              background:#e5e7eb; color:#374151; font-size:13px; font-weight:600; text-decoration:none; }
  .todo-tab.active { background:#1a3a5c; color:#fff; border-color:#1a3a5c; }
  .todo-btn { padding:6px 14px; border-radius:5px; border:1px solid #d1d5db; background:#fff; cursor:pointer; font-size:12.5px; text-decoration:none; color:#374151; display:inline-block; }
  .todo-btn:hover { background:#f3f4f6; }
  .todo-btn.primary { background:#2563eb; border-color:#2563eb; color:#fff; font-weight:600; }
  .todo-btn.primary:hover { background:#1d4ed8; }
  .todo-btn.danger { color:#b91c1c; border-color:#fca5a5; }
  .todo-datenav { display:flex; gap:8px; align-items:center; margin-bottom:14px; flex-wrap:wrap; }
  .todo-date-label { font-size:15px; font-weight:700; color:#1a3a5c; min-width:150px; }
  .todo-list { background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:6px 4px; margin-bottom:16px; }
  .todo-row { display:flex; align-items:center; gap:8px; padding:8px 10px; border-bottom:1px solid #f1f5f9; }
  .todo-row:last-child { border-bottom:none; }
  .todo-row.done .todo-title { color:#9ca3af; text-decoration:line-through; }
  .todo-row-off { opacity:0.45; }
  .todo-check { width:18px; height:18px; flex-shrink:0; }
  .todo-title { font-size:13.5px; color:#1f2937; }
  .todo-time { font-size:11.5px; color:#fff; background:#6b7280; border-radius:4px; padding:2px 7px; }
  .todo-badge-off { font-size:11px; color:#9ca3af; }
  .todo-note { font-size:11.5px; color:#fff; background:#dc2626; border-radius:4px; padding:2px 7px; font-weight:600; }
  .todo-doneby { margin-left:auto; font-size:11px; color:#9ca3af; }
  .todo-edit-panel { background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:10px; }
  .todo-edit-row { display:flex; align-items:center; gap:8px; padding:5px 6px; border-bottom:1px solid #eef2f7; background:#fff; }
  .todo-edit-row:last-child { border-bottom:none; }
  .drag-handle { cursor:grab; color:#9ca3af; }
  .todo-edit-title { flex:1; font-size:12.5px; }
  .todo-modal-bg { display:none; position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:60; }
  .todo-modal { background:#fff; border-radius:10px; max-width:420px; margin:10vh auto 0; padding:18px 20px; font-size:13px; }
  .todo-modal-inner label { display:block; font-size:12px; color:#6b7280; margin:10px 0 3px; }
  .todo-modal-inner input[type=text], .todo-modal-inner input[type=number], .todo-modal-inner textarea {
    width:100%; box-sizing:border-box; border:1px solid #d1d5db; border-radius:5px; padding:6px 8px; font-size:13px; font-family:inherit; }
  .todo-modal-inner textarea { resize:vertical; min-height:50px; }
  .todo-wd-chips { display:flex; gap:6px; flex-wrap:wrap; }
  .todo-wd-chip { display:flex; align-items:center; gap:3px; font-size:12px; border:1px solid #d1d5db; border-radius:5px; padding:3px 8px; cursor:pointer; }
  .todo-modal-btns { display:flex; gap:8px; margin-top:16px; }
</style>

<div class="todo-wrap">
  <div class="todo-tabs">
    ${KA_TABS.map(t => `<a class="todo-tab${t.key === ka ? ' active' : ''}" href="${qs(t.key, date)}">${escHtml(t.label)}</a>`).join('')}
  </div>

  <div class="todo-datenav">
    <a class="todo-btn" href="${qs(ka, prevDate)}">◀ 前日</a>
    <span class="todo-date-label">${escHtml(dateLabel)}</span>
    <a class="todo-btn" href="${qs(ka, nextDate)}">翌日 ▶</a>
    <a class="todo-btn" href="${qs(ka, todayDate)}">今日</a>
    ${editable ? `<span style="flex:1"></span><button class="todo-btn" id="todo-edit-toggle">リストを編集</button>` : ''}
  </div>

  <div class="todo-list" id="todo-list">
    ${tasks.length > 0 ? tasks.map(t => taskRowHtml(t, todayWeekday, todayDom)).join('') : '<div style="padding:16px;color:#9ca3af;font-size:13px;">タスクが登録されていません</div>'}
  </div>

  ${editable ? `
  <div class="todo-edit-panel" id="todo-edit-panel" style="display:none;">
    <div id="todo-edit-list">${tasks.map(editRowHtml).join('')}</div>
    <div style="margin-top:10px;"><button class="todo-btn primary" id="todo-add-btn">＋タスクを追加</button></div>
  </div>` : ''}
</div>

<div class="todo-modal-bg" id="todo-modal-bg">
  <div class="todo-modal" id="todo-modal"></div>
</div>

<script>
var KA = ${safeJson(ka)};
var DATE = ${safeJson(date)};
var EDITABLE = ${editable ? 'true' : 'false'};
var API = ${safeJson(`${ADMIN_PATH}/api/todo`)};
var TASKS = ${safeJson(tasks)};
var editingId = null;

document.getElementById('todo-modal-bg').addEventListener('click', function(e) {
  if (e.target === this) closeTaskModal();
});

document.addEventListener('change', function(e) {
  var cb = e.target.closest ? e.target.closest('.todo-check') : null;
  if (!cb) return;
  var id = Number(cb.dataset.taskId);
  var isDone = cb.checked;
  var row = cb.closest('.todo-row');
  row.classList.toggle('done', isDone);
  fetch(API + '/completions/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: id, date: DATE, is_done: isDone })
  }).then(function(r) {
    if (!r.ok) {
      cb.checked = !isDone;
      row.classList.toggle('done', !isDone);
      alert('更新に失敗しました');
    }
  }).catch(function() {
    cb.checked = !isDone;
    row.classList.toggle('done', !isDone);
    alert('通信エラーが発生しました');
  });
});

if (EDITABLE) {
  document.getElementById('todo-edit-toggle').addEventListener('click', function() {
    var panel = document.getElementById('todo-edit-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('todo-add-btn').addEventListener('click', function() { openTaskModal(null); });
  document.addEventListener('click', function(e) {
    var btn = e.target.closest ? e.target.closest('[data-edit-id]') : null;
    if (btn) openTaskModal(Number(btn.dataset.editId));
  });
  attachDragHandlers();
}

function openTaskModal(id) {
  editingId = id;
  var t = null;
  for (var i = 0; i < TASKS.length; i++) { if (TASKS[i].id === id) { t = TASKS[i]; break; } }
  var modal = document.getElementById('todo-modal');
  modal.innerHTML = '';
  modal.appendChild(buildModalForm(t));
  document.getElementById('todo-modal-bg').style.display = 'block';
}

function closeTaskModal() {
  document.getElementById('todo-modal-bg').style.display = 'none';
}

function buildModalForm(t) {
  var wrap = document.createElement('div');
  wrap.className = 'todo-modal-inner';

  var h = document.createElement('h3');
  h.style.margin = '0';
  h.textContent = t ? 'タスクを編集' : 'タスクを追加';
  wrap.appendChild(h);

  addField(wrap, 'タイトル', 'input', 'tm-title', t ? t.title : '');
  addField(wrap, '時刻目安（任意・例: 12:00 / 翌1:00）', 'input', 'tm-time', t && t.time_label ? t.time_label : '');

  var wdLabel = document.createElement('label');
  wdLabel.textContent = '対象曜日（未選択の場合は毎日）';
  wrap.appendChild(wdLabel);
  var wdWrap = document.createElement('div');
  wdWrap.className = 'todo-wd-chips';
  var wdNames = ['日', '月', '火', '水', '木', '金', '土'];
  var selectedWd = (t && t.weekdays) ? t.weekdays.split(',').map(Number) : [];
  wdNames.forEach(function(name, idx) {
    var chip = document.createElement('label');
    chip.className = 'todo-wd-chip';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = String(idx);
    cb.className = 'tm-wd';
    if (selectedWd.indexOf(idx) !== -1) cb.checked = true;
    chip.appendChild(cb);
    chip.appendChild(document.createTextNode(name));
    wdWrap.appendChild(chip);
  });
  wrap.appendChild(wdWrap);

  addField(wrap, '注意書き（任意）', 'textarea', 'tm-note', t && t.note ? t.note : '');
  addField(wrap, '注意書きを表示する日（毎月・任意。例: 19）', 'number', 'tm-dom', t && t.note_day_of_month ? String(t.note_day_of_month) : '');

  var btnRow = document.createElement('div');
  btnRow.className = 'todo-modal-btns';
  var saveBtn = document.createElement('button');
  saveBtn.className = 'todo-btn primary';
  saveBtn.textContent = '保存';
  saveBtn.addEventListener('click', saveTaskModal);
  btnRow.appendChild(saveBtn);
  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'todo-btn';
  cancelBtn.textContent = 'キャンセル';
  cancelBtn.addEventListener('click', closeTaskModal);
  btnRow.appendChild(cancelBtn);
  if (t) {
    var delBtn = document.createElement('button');
    delBtn.className = 'todo-btn danger';
    delBtn.textContent = '削除';
    delBtn.addEventListener('click', function() { deleteTask(t.id); });
    btnRow.appendChild(delBtn);
  }
  wrap.appendChild(btnRow);
  return wrap;
}

function addField(wrap, labelText, tag, id, value) {
  var label = document.createElement('label');
  label.textContent = labelText;
  wrap.appendChild(label);
  var el = document.createElement(tag);
  el.id = id;
  if (tag === 'input') el.type = (id === 'tm-dom') ? 'number' : 'text';
  if (id === 'tm-dom') { el.min = '1'; el.max = '31'; }
  el.value = value;
  wrap.appendChild(el);
}

function saveTaskModal() {
  var title = document.getElementById('tm-title').value.trim();
  if (!title) { alert('タイトルを入力してください'); return; }
  var timeLabel = document.getElementById('tm-time').value.trim();
  var note = document.getElementById('tm-note').value.trim();
  var domVal = document.getElementById('tm-dom').value.trim();
  var wdBoxes = document.querySelectorAll('.tm-wd:checked');
  var wd = [];
  wdBoxes.forEach(function(cb) { wd.push(cb.value); });
  var payload = {
    ka: KA === 'toban' ? null : Number(KA),
    title: title,
    time_label: timeLabel || null,
    weekdays: wd.length > 0 ? wd.join(',') : null,
    note: note || null,
    note_day_of_month: domVal ? Number(domVal) : null
  };
  var url = editingId ? (API + '/tasks/' + editingId) : (API + '/tasks');
  var method = editingId ? 'PUT' : 'POST';
  fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    .then(function(r) { return r.json().then(function(d) { return { ok: r.ok, d: d }; }); })
    .then(function(res) {
      if (!res.ok) { alert(res.d && res.d.error ? res.d.error : '保存に失敗しました'); return; }
      location.reload();
    })
    .catch(function() { alert('通信エラーが発生しました'); });
}

function deleteTask(id) {
  if (!confirm('このタスクを削除しますか？')) return;
  fetch(API + '/tasks/' + id + '/delete', { method: 'POST' })
    .then(function(r) { if (r.ok) { location.reload(); } else { alert('削除に失敗しました'); } })
    .catch(function() { alert('通信エラーが発生しました'); });
}

var dragSrc = null;
function attachDragHandlers() {
  document.querySelectorAll('#todo-edit-list .drag-handle').forEach(function(h) {
    h.addEventListener('dragstart', function() { dragSrc = h.closest('.todo-edit-row'); });
    h.addEventListener('dragend', saveOrder);
  });
  document.querySelectorAll('#todo-edit-list .todo-edit-row').forEach(function(row) {
    row.addEventListener('dragover', function(e) {
      if (!dragSrc || row === dragSrc) return;
      e.preventDefault();
      var rect = row.getBoundingClientRect();
      var before = (e.clientY - rect.top) / rect.height < 0.5;
      row.parentNode.insertBefore(dragSrc, before ? row : row.nextSibling);
    });
    row.addEventListener('drop', function(e) { e.preventDefault(); });
  });
}
function saveOrder() {
  var rows = document.querySelectorAll('#todo-edit-list .todo-edit-row');
  var ids = [];
  rows.forEach(function(row) { ids.push(Number(row.dataset.taskId)); });
  fetch(API + '/tasks/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ids })
  }).then(function(r) { if (r.ok) location.reload(); });
}
</script>
`;
}
