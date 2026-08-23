// 事故研修のお知らせ対象者抽出（/accidents/training）
// 一定期間内の事故件数がしきい値以上の乗務員を抽出し、一括印刷ページへ渡す。
import { ADMIN_PATH } from '../config';
import { escHtml } from './layout';
import { accidentsTabNav } from './accidents';
import type { IndividualRow } from './accidents_analysis';

export interface AccidentsTrainingOpts {
  months: number;
  minCount: number;
  selectedDivision: number | null;
  candidates: IndividualRow[];
}

export function accidentsTrainingPage(opts: AccidentsTrainingOpts): string {
  const { months, minCount, selectedDivision, candidates } = opts;

  const monthOptions = [3, 6, 12, 24, 36].map(m =>
    `<option value="${m}" ${m === months ? 'selected' : ''}>直近${m}ヶ月</option>`).join('');
  const minCountOptions = Array.from({ length: 10 }, (_, i) => i + 1).map(n =>
    `<option value="${n}" ${n === minCount ? 'selected' : ''}>${n}件以上</option>`).join('');
  const divOptions = ['<option value="">全社</option>', ...[1, 2, 3, 4].map(d =>
    `<option value="${d}" ${d === selectedDivision ? 'selected' : ''}>${d}課</option>`)].join('');

  const rowsHtml = candidates.length === 0
    ? `<tr><td colspan="6" style="padding:24px;text-align:center;color:#9ca3af;">条件に該当する対象者はいません</td></tr>`
    : candidates.map((r, i) => `
      <tr data-name="${escHtml(r.name)}">
        <td><input type="checkbox" class="at-check" data-key="${escHtml(r.key)}" checked></td>
        <td>${i + 1}</td>
        <td>${escHtml(r.name)}</td>
        <td>${r.division != null ? `${r.division}課 ` : ''}${escHtml(r.team || '')}</td>
        <td style="font-weight:700;color:#991b1b;">${r.cnt}件</td>
        <td>${escHtml(r.lastDate.slice(0, 10))}</td>
      </tr>`).join('');

  return `
<style>
  .at { font-family:'Hiragino Sans','Meiryo',sans-serif; max-width:1160px; }
  .ac-tabnav { display:flex; gap:4px; margin-bottom:14px; border-bottom:1px solid #e5e7eb; }
  .ac-tab-link { padding:9px 16px; font-size:13px; font-weight:600; color:#64748b; text-decoration:none; border-bottom:2px solid transparent; margin-bottom:-1px; }
  .ac-tab-link:hover { color:#1a3a5c; }
  .ac-tab-link.active { color:#1a3a5c; border-bottom-color:#1a3a5c; }
  .at-filter-bar { display:flex; gap:10px; align-items:center; margin-bottom:14px; flex-wrap:wrap; }
  .at-select { border:1px solid #d1d5db; border-radius:8px; padding:9px 12px; font-size:13px; background:#fff; }
  .at-top { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
  .at-count { font-size:13px; color:#475569; }
  .at-count b { color:#991b1b; font-size:16px; }
  .at-btn { padding:9px 18px; border-radius:8px; font-size:13px; font-weight:700; cursor:pointer; border:none; background:#1a3a5c; color:#fff; }
  .at-btn:disabled { background:#cbd5e1; cursor:not-allowed; }
  .at-table-wrap { background:#fff; border-radius:10px; box-shadow:0 1px 3px rgba(0,0,0,.08); overflow-x:auto; }
  .at-table { width:100%; border-collapse:collapse; font-size:13px; }
  .at-table th { padding:9px 12px; text-align:left; background:#f9fafb; color:#6b7280; font-size:12px; border-bottom:1px solid #e5e7eb; white-space:nowrap; }
  .at-table td { padding:9px 12px; border-bottom:1px solid #f3f4f6; white-space:nowrap; }
  .at-note { font-size:12px; color:#6b7280; margin:10px 0 16px; line-height:1.6; }
  .at-newgrad-box { display:flex; align-items:center; justify-content:space-between; gap:12px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:12px 16px; margin-bottom:18px; }
  .at-newgrad-text { font-size:12.5px; color:#1a3a5c; line-height:1.6; }
  .at-newgrad-text b { display:block; font-size:13.5px; margin-bottom:2px; }
  .at-newgrad-link { flex-shrink:0; padding:9px 16px; border-radius:8px; font-size:12.5px; font-weight:700; background:#1a3a5c; color:#fff; text-decoration:none; }
</style>
<div class="at">
  ${accidentsTabNav('training')}
  <div class="at-filter-bar">
    <select class="at-select" id="at-months" onchange="atReload()">${monthOptions}</select>
    <select class="at-select" id="at-mincount" onchange="atReload()">${minCountOptions}</select>
    <select class="at-select" id="at-division" onchange="atReload()">${divOptions}</select>
  </div>
  <p class="at-note">指定期間内の事故件数がしきい値以上の乗務員を自動抽出します。チェックを外せば対象から除外できます。「一括印刷」で対象者ごとに1枚ずつ事故研修のお知らせを印刷します（帳票の文面は印刷画面でその場で編集できます）。</p>

  <div class="at-newgrad-box">
    <div class="at-newgrad-text"><b>新卒対象：事故添乗研修のお知らせ</b>氏名・課・班・日時等が空欄の手書き用テンプレートをA4で印刷します。</div>
    <a class="at-newgrad-link" href="${ADMIN_PATH}/accidents/training/notice/print" target="_blank" rel="noopener">🖨️ 印刷用を開く</a>
  </div>
  <div class="at-top">
    <div class="at-count">対象者 <b id="at-selected-count">${candidates.length}</b> 名</div>
    <button class="at-btn" id="at-print-btn" onclick="atPrint()" ${candidates.length === 0 ? 'disabled' : ''}>選択した対象者を一括印刷</button>
  </div>
  <input class="at-select" id="at-search" placeholder="氏名で絞り込み" oninput="atFilterCandidates()" style="width:220px;margin-bottom:10px;">
  <div class="at-table-wrap">
    <table class="at-table">
      <thead><tr><th></th><th>#</th><th>氏名</th><th>課・班</th><th>期間内事故件数</th><th>直近事故日</th></tr></thead>
      <tbody id="at-tbody">${rowsHtml}</tbody>
    </table>
  </div>
</div>

<script>
function atUpdateCount() {
  var checked = document.querySelectorAll('.at-check:checked').length;
  document.getElementById('at-selected-count').textContent = checked;
  document.getElementById('at-print-btn').disabled = checked === 0;
}
document.querySelectorAll('.at-check').forEach(function(cb) { cb.addEventListener('change', atUpdateCount); });

function atFilterCandidates() {
  var q = document.getElementById('at-search').value.trim();
  document.querySelectorAll('#at-tbody tr[data-name]').forEach(function(tr) {
    tr.style.display = tr.getAttribute('data-name').indexOf(q) === -1 ? 'none' : '';
  });
}

function atReload() {
  var months = document.getElementById('at-months').value;
  var minCount = document.getElementById('at-mincount').value;
  var division = document.getElementById('at-division').value;
  var url = '${ADMIN_PATH}/accidents/training?months=' + months + '&min_count=' + minCount + (division ? '&division=' + division : '');
  location.href = url;
}

function atPrint() {
  var keys = Array.prototype.slice.call(document.querySelectorAll('.at-check:checked')).map(function(cb) { return cb.getAttribute('data-key'); });
  if (keys.length === 0) return;
  var months = document.getElementById('at-months').value;
  var division = document.getElementById('at-division').value;
  var url = '${ADMIN_PATH}/accidents/training/print?months=' + months
    + (division ? '&division=' + division : '')
    + '&keys=' + encodeURIComponent(keys.join(','));
  window.open(url, '_blank');
}
</script>
`;
}
