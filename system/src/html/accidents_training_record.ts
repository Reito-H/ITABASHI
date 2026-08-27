// 事故研修記録 一覧＋新規登録（/accidents/training-record）
// 「事故研修案内」タブが対象者抽出→案内印刷までなのに対し、こちらは実際に研修を実施した後の
// 記録（5W1H＋事故研修担当者の所感）を残すためのページ。対象者は社員名簿検索で紐付ける。
import { escHtml } from './layout';
import { accidentsTabNav } from './accidents';

export interface TrainingRecordRow {
  id: number;
  employee_name: string;
  emp_no: string | null;
  division: number | null;
  team: string | null;
  conducted_date: string;
  location: string | null;
  trainer_name: string | null;
  content: string | null;
  reason: string | null;
  method: string | null;
  comment: string | null;
}

export interface AccidentsTrainingRecordOpts {
  records: TrainingRecordRow[];
  searchEmployeesHref: string;
  createHref: string;
  printHrefBase: string;
  deleteHrefBase: string;
}

export function accidentsTrainingRecordPage(opts: AccidentsTrainingRecordOpts): string {
  const { records, searchEmployeesHref, createHref, printHrefBase, deleteHrefBase } = opts;

  const rowsHtml = records.length === 0
    ? `<tr><td colspan="7" style="padding:24px;text-align:center;color:#9ca3af;">研修記録はまだありません</td></tr>`
    : records.map(r => `
      <tr data-search="${escHtml([r.employee_name, r.trainer_name, r.content].filter(Boolean).join(' '))}">
        <td>${escHtml(r.conducted_date.slice(0, 10))}</td>
        <td>${escHtml(r.employee_name)}${r.division != null ? `<span class="tr-sub">${r.division}課 ${escHtml(r.team || '')}</span>` : ''}</td>
        <td>${escHtml(r.trainer_name || '—')}</td>
        <td>${escHtml(r.location || '—')}</td>
        <td class="tr-content-cell">${escHtml(r.content || '—')}</td>
        <td>
          <a class="tr-link" href="${printHrefBase}/${r.id}/print" target="_blank" rel="noopener">印刷</a>
        </td>
        <td><button class="tr-del-btn" data-id="${r.id}">削除</button></td>
      </tr>`).join('');

  return `
<style>
  .tr-wrap { font-family:'Hiragino Sans','Meiryo',sans-serif; max-width:1160px; }
  .ac-tabnav { display:flex; gap:4px; margin-bottom:14px; border-bottom:1px solid #e5e7eb; }
  .ac-tab-link { padding:9px 16px; font-size:13px; font-weight:600; color:#64748b; text-decoration:none; border-bottom:2px solid transparent; margin-bottom:-1px; }
  .ac-tab-link:hover { color:#1a3a5c; }
  .ac-tab-link.active { color:#1a3a5c; border-bottom-color:#1a3a5c; }
  .tr-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; gap:12px; flex-wrap:wrap; }
  .tr-note { font-size:12px; color:#6b7280; margin:0; }
  .tr-add-btn { padding:9px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; border:none; background:#1a3a5c; color:#fff; flex-shrink:0; }
  .tr-search { border:1px solid #d1d5db; border-radius:8px; padding:9px 12px; font-size:13px; width:220px; margin-bottom:10px; }
  .tr-table-wrap { background:#fff; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,.08); overflow-x:auto; }
  .tr-table { width:100%; border-collapse:collapse; font-size:13px; min-width:900px; }
  .tr-table th { padding:9px 12px; text-align:left; background:#f9fafb; color:#6b7280; font-size:12px; border-bottom:1px solid #e5e7eb; white-space:nowrap; }
  .tr-table td { padding:9px 12px; border-bottom:1px solid #f3f4f6; vertical-align:top; }
  .tr-content-cell { max-width:280px; color:#374151; white-space:pre-wrap; }
  .tr-sub { display:block; font-size:11px; color:#94a3b8; margin-top:2px; }
  .tr-link { color:#1a3a5c; font-weight:700; text-decoration:none; }
  .tr-link:hover { text-decoration:underline; }
  .tr-del-btn { border:none; background:#fee2e2; color:#991b1b; padding:5px 10px; border-radius:6px; font-size:12px; cursor:pointer; white-space:nowrap; }

  .tr-modal-bg { display:none; position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:60; overflow-y:auto; }
  .tr-modal { background:#fff; border-radius:10px; max-width:640px; margin:5vh auto 5vh; padding:24px 26px; }
  .tr-modal h2 { font-size:16px; font-weight:700; color:#1a3a5c; margin:0 0 16px; padding-bottom:10px; border-bottom:1px solid #e5e7eb; }
  .tr-field { margin-bottom:14px; }
  .tr-field label { display:block; font-size:12px; font-weight:700; color:#475569; margin-bottom:5px; }
  .tr-field .tr-w1h { font-size:11px; font-weight:700; color:#fff; background:#1a3a5c; border-radius:4px; padding:1px 6px; margin-right:6px; }
  .tr-input, .tr-textarea { width:100%; border:1px solid #d1d5db; border-radius:8px; padding:9px 12px; font-size:13px; font-family:inherit; box-sizing:border-box; }
  .tr-textarea { resize:vertical; min-height:56px; }
  .tr-row2 { display:flex; gap:12px; }
  .tr-row2 > div { flex:1; }
  .tr-search-box { position:relative; }
  .tr-search-dropdown { position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #e2e8f0; border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,.12); max-height:220px; overflow-y:auto; z-index:20; display:none; margin-top:4px; }
  .tr-search-dropdown.open { display:block; }
  .tr-search-item { padding:9px 12px; font-size:12.5px; cursor:pointer; border-bottom:1px solid #f1f5f9; }
  .tr-search-item:last-child { border-bottom:none; }
  .tr-search-item:hover { background:#f0fdfa; }
  .tr-search-item .sub { color:#94a3b8; font-size:11px; margin-top:2px; }
  .tr-selected-emp { margin-top:6px; font-size:12px; color:#166534; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:6px 10px; display:none; }
  .tr-modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
  .tr-btn-cancel { background:#f1f5f9; color:#475569; border:none; border-radius:8px; padding:9px 18px; font-size:13px; cursor:pointer; }
  .tr-btn-save { background:#1a3a5c; color:#fff; border:none; border-radius:8px; padding:9px 18px; font-size:13px; font-weight:700; cursor:pointer; }
  .tr-error { color:#b91c1c; font-size:12px; margin-top:8px; display:none; }
</style>
<div class="tr-wrap">
  ${accidentsTabNav('training_record')}
  <div class="tr-top">
    <p class="tr-note">実施した事故研修を、5W1H（いつ・どこで・誰が・誰に・何を・なぜ・どのように）と担当者の所感で記録します。</p>
    <button class="tr-add-btn" onclick="trOpenModal()">＋ 新規記録</button>
  </div>
  <input class="tr-search" id="tr-list-search" placeholder="氏名・担当者・内容で絞り込み" oninput="trFilterList()">
  <div class="tr-table-wrap">
    <table class="tr-table">
      <thead><tr><th>実施日</th><th>対象者</th><th>実施者</th><th>場所</th><th>研修内容</th><th></th><th></th></tr></thead>
      <tbody id="tr-tbody">${rowsHtml}</tbody>
    </table>
  </div>
</div>

<!-- 新規登録モーダル -->
<div class="tr-modal-bg" id="tr-modal-bg" onclick="if(event.target===this)trCloseModal()">
  <div class="tr-modal">
    <h2>事故研修記録の新規登録</h2>
    <div class="tr-row2">
      <div class="tr-field">
        <label><span class="tr-w1h">When</span>実施日</label>
        <input type="date" class="tr-input" id="tr-date">
      </div>
      <div class="tr-field">
        <label><span class="tr-w1h">Where</span>実施場所</label>
        <input type="text" class="tr-input" id="tr-location" placeholder="例：本社会議室">
      </div>
    </div>
    <div class="tr-field tr-search-box">
      <label><span class="tr-w1h">Who</span>対象者（社員名簿から検索）</label>
      <input type="text" class="tr-input" id="tr-emp-search" placeholder="氏名・社員番号で検索" autocomplete="off">
      <div class="tr-search-dropdown" id="tr-emp-dropdown"></div>
      <div class="tr-selected-emp" id="tr-selected-emp"></div>
    </div>
    <div class="tr-field">
      <label><span class="tr-w1h">Who</span>実施者（事故研修担当者）</label>
      <input type="text" class="tr-input" id="tr-trainer" placeholder="担当者氏名">
    </div>
    <div class="tr-field">
      <label><span class="tr-w1h">What</span>研修内容</label>
      <textarea class="tr-textarea" id="tr-content" placeholder="実施した研修のテーマ・内容"></textarea>
    </div>
    <div class="tr-field">
      <label><span class="tr-w1h">Why</span>実施理由</label>
      <textarea class="tr-textarea" id="tr-reason" placeholder="例：直近◯ヶ月で事故が◯件発生したため"></textarea>
    </div>
    <div class="tr-field">
      <label><span class="tr-w1h">How</span>実施方法</label>
      <input type="text" class="tr-input" id="tr-method" placeholder="例：個別面談／添乗指導／座学講義">
    </div>
    <div class="tr-field">
      <label>事故研修担当者の所感</label>
      <textarea class="tr-textarea" id="tr-comment" style="min-height:90px;" placeholder="研修を実施しての所感・今後の注意点など"></textarea>
    </div>
    <div class="tr-error" id="tr-error"></div>
    <div class="tr-modal-actions">
      <button class="tr-btn-cancel" onclick="trCloseModal()">キャンセル</button>
      <button class="tr-btn-save" onclick="trSave()">保存</button>
    </div>
  </div>
</div>

<script>
var TR_ALL_ROWS = Array.prototype.slice.call(document.querySelectorAll('#tr-tbody tr[data-search]'));
var trSelectedEmployee = null;

function trFilterList() {
  var q = document.getElementById('tr-list-search').value.trim();
  TR_ALL_ROWS.forEach(function(tr) {
    tr.style.display = tr.getAttribute('data-search').indexOf(q) === -1 ? 'none' : '';
  });
}

function trOpenModal() {
  document.getElementById('tr-modal-bg').style.display = 'block';
}
function trCloseModal() {
  document.getElementById('tr-modal-bg').style.display = 'none';
  document.getElementById('tr-date').value = '';
  document.getElementById('tr-location').value = '';
  document.getElementById('tr-emp-search').value = '';
  document.getElementById('tr-trainer').value = '';
  document.getElementById('tr-content').value = '';
  document.getElementById('tr-reason').value = '';
  document.getElementById('tr-method').value = '';
  document.getElementById('tr-comment').value = '';
  document.getElementById('tr-error').style.display = 'none';
  document.getElementById('tr-selected-emp').style.display = 'none';
  trSelectedEmployee = null;
}

function escapeHtmlClient(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

var trSearchTimer = null;
var trEmpSearchInput = document.getElementById('tr-emp-search');
var trEmpDropdown = document.getElementById('tr-emp-dropdown');
trEmpSearchInput.addEventListener('input', function () {
  var q = trEmpSearchInput.value.trim();
  if (trSearchTimer) clearTimeout(trSearchTimer);
  if (!q) { trEmpDropdown.classList.remove('open'); trEmpDropdown.innerHTML = ''; return; }
  trSearchTimer = setTimeout(function () {
    fetch(${JSON.stringify(searchEmployeesHref)} + '?q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (list) {
        if (!list.length) {
          trEmpDropdown.innerHTML = '<div class="tr-search-item" style="color:#9ca3af;">該当する社員が見つかりません</div>';
          trEmpDropdown.classList.add('open');
          return;
        }
        trEmpDropdown.innerHTML = list.map(function (e, i) {
          var sub = escapeHtmlClient(e.emp_no || '') + ' ／ ' + (e.division != null ? e.division + '課' : '') + (e.team != null ? e.team + '班' : '');
          return '<div class="tr-search-item" data-idx="' + i + '">' + escapeHtmlClient(e.name) + '<div class="sub">' + sub + '</div></div>';
        }).join('');
        trEmpDropdown.classList.add('open');
        trEmpDropdown.querySelectorAll('.tr-search-item[data-idx]').forEach(function (item) {
          item.addEventListener('click', function () {
            var e = list[parseInt(item.getAttribute('data-idx'), 10)];
            trSelectedEmployee = e;
            var selEl = document.getElementById('tr-selected-emp');
            selEl.style.display = 'block';
            selEl.textContent = '選択中： ' + e.name + (e.emp_no ? '（' + e.emp_no + '）' : '');
            trEmpDropdown.classList.remove('open');
            trEmpSearchInput.value = '';
          });
        });
      });
  }, 200);
});
document.addEventListener('click', function (e) {
  if (!e.target.closest('.tr-search-box')) trEmpDropdown.classList.remove('open');
});

document.querySelectorAll('.tr-del-btn').forEach(function(btn) {
  btn.addEventListener('click', async function() {
    if (!confirm('この研修記録を削除しますか？この操作は取り消せません。')) return;
    var id = btn.getAttribute('data-id');
    var res = await fetch(${JSON.stringify(deleteHrefBase)} + '/' + id, { method: 'DELETE' });
    if (res.ok) location.reload();
    else alert('削除に失敗しました。');
  });
});

async function trSave() {
  var errEl = document.getElementById('tr-error');
  errEl.style.display = 'none';
  var date = document.getElementById('tr-date').value;
  if (!trSelectedEmployee) { errEl.textContent = '対象者を検索して選択してください。'; errEl.style.display = 'block'; return; }
  if (!date) { errEl.textContent = '実施日を入力してください。'; errEl.style.display = 'block'; return; }

  var payload = {
    employee_id: trSelectedEmployee.id,
    employee_name: trSelectedEmployee.name,
    emp_no: trSelectedEmployee.emp_no,
    division: trSelectedEmployee.division,
    team: trSelectedEmployee.team,
    conducted_date: date,
    location: document.getElementById('tr-location').value.trim(),
    trainer_name: document.getElementById('tr-trainer').value.trim(),
    content: document.getElementById('tr-content').value.trim(),
    reason: document.getElementById('tr-reason').value.trim(),
    method: document.getElementById('tr-method').value.trim(),
    comment: document.getElementById('tr-comment').value.trim(),
  };

  try {
    var res = await fetch(${JSON.stringify(createHref)}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      var body = await res.json().catch(function() { return {}; });
      errEl.textContent = body.error || '保存に失敗しました。';
      errEl.style.display = 'block';
      return;
    }
    location.reload();
  } catch (err) {
    errEl.textContent = '通信エラーが発生しました。';
    errEl.style.display = 'block';
  }
}
</script>
`;
}
