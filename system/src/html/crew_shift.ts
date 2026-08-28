// 乗務員シフト（月間勤務予定表PDFのWeb版）
// PDFで配布される「板橋2課 3班・4班」の月間勤務予定表をそのまま表・検索・集計できるようにしたもの。
// 表示ルール:
//   ・Ｈ/Ｄ/Ｂ(大文字) = 隔勤のローテーション班（色分けのみが目的で、集計上は全て「隔勤」）
//   ・ａ/ｂ(小文字)    = 日勤Ａ・日勤Ｂ（1台を2人でシェア）
//   ・公=公休 / 指=指定公休 / 内=内勤 / 空欄=配置なし
import { escHtml, safeJson, saveToastHtml, saveToastScript } from './layout';
import { ADMIN_PATH } from '../config';

export type CrewShiftMember = {
  id: number;
  emp_code: string;
  name: string;
  car_no: string | null;
  division: string;
  team: number;
  is_active: number;
  sort_order: number;
};

export type CrewShiftType = {
  id: number;
  code: string;
  label: string;
  color: string;
  category: string;   // kakukin / nikkin_a / nikkin_b / off / other
  count_weight: number;
  sort_order: number;
  is_active: number;
};

export type CrewShiftCell = { code: string };

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

export function crewShiftPage(
  members: CrewShiftMember[],
  types: CrewShiftType[],
  shiftMap: Record<string, CrewShiftCell>,
  dates: string[],
  division: string,
  startDate: string,
  endDate: string,
  editable: boolean,
  periods: Array<{ start_date: string; end_date: string }>,
  divisions: string[],
  todayStr: string,
): string {
  const teams = [...new Set(members.map(m => m.team))].sort((a, b) => a - b);
  const colorMap: Record<string, string> = {};
  const weightMap: Record<string, number> = {};
  const categoryMap: Record<string, string> = {};
  for (const t of types) { colorMap[t.code] = t.color; weightMap[t.code] = t.count_weight; categoryMap[t.code] = t.category; }

  const STICKY = 'position:sticky;z-index:2;';
  const HDR_BG = 'background:#1e3a5f;color:white;';
  const FIX_BG = 'background:#f8fafc;';

  function dateHeaders(): string {
    return dates.map(d => {
      const dt = new Date(d + 'T00:00:00Z');
      const day = dt.getUTCDate();
      const dow = dt.getUTCDay();
      const isWeekend = dow === 0 || dow === 6;
      const bg = isWeekend ? '#fef2f2' : '#eff6ff';
      return `<th data-date="${d}" onclick="openDayBreakdown('${d}')" style="min-width:34px;max-width:34px;text-align:center;font-size:10px;padding:3px 1px;border:1px solid #d1d5db;background:${bg};cursor:pointer;" title="日別内訳を見る">
        <div>${day}</div>
        <div style="color:${dow === 0 ? '#ef4444' : dow === 6 ? '#3b82f6' : '#374151'};">${WEEKDAY_JA[dow]}</div>
      </th>`;
    }).join('');
  }

  function cell(m: CrewShiftMember, d: string): string {
    const s = shiftMap[`${m.id}_${d}`];
    const code = s?.code ?? '';
    const bg = code ? (colorMap[code] ?? '#fff7ed') : '#ffffff';
    return `<td class="cs-cell" data-member="${m.id}" data-date="${d}" data-name="${escHtml(m.name)}" data-code="${escHtml(code)}"
      style="background:${bg}">${escHtml(code)}</td>`;
  }

  function teamTable(team: number): string {
    const list = members.filter(m => m.team === team).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    if (list.length === 0) return '';
    const rows = list.map(m => `<tr class="cs-row" data-member="${m.id}" data-name="${escHtml(m.name)}" data-car="${escHtml(m.car_no ?? '')}" data-team="${team}">
      <td class="cs-name" style="min-width:120px;max-width:120px;font-size:12px;font-weight:600;border:1px solid #d1d5db;padding:3px 6px;${STICKY}left:0;${FIX_BG}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${escHtml(m.name)}${m.car_no ? `<span style="color:#9ca3af;font-weight:400;font-size:10px;"> #${escHtml(m.car_no)}</span>` : ''}
      </td>
      ${dates.map(d => cell(m, d)).join('')}
      <td class="cs-count" data-member="${m.id}" style="min-width:70px;font-size:10px;text-align:center;border:1px solid #d1d5db;background:#f8fafc;color:#374151;"></td>
    </tr>`).join('');
    return `
    <h3 style="font-size:13px;font-weight:700;color:#1e3a5f;margin:16px 0 6px;">${team}班（${list.length}名）</h3>
    <div style="overflow-x:auto;border:1px solid #d1d5db;border-radius:8px;-webkit-overflow-scrolling:touch;">
      <table style="border-collapse:collapse;table-layout:fixed;">
        <thead style="position:sticky;top:0;z-index:10;background:white;">
          <tr>
            <th style="min-width:120px;${STICKY}left:0;z-index:20;${HDR_BG}font-size:11px;padding:4px;border:1px solid #4b6cb7;">氏名</th>
            ${dateHeaders()}
            <th style="min-width:70px;${HDR_BG}font-size:10px;padding:4px;border:1px solid #4b6cb7;">内訳</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  // 日別内訳（PDF末尾の集計行に相当）: category別に合計人数を出す
  const CATS: Array<{ key: string; label: string; color: string }> = [
    { key: 'kakukin',  label: '隔勤',   color: '#c7d2fe' },
    { key: 'nikkin_a', label: '日勤Ａ', color: '#bbf7d0' },
    { key: 'nikkin_b', label: '日勤Ｂ', color: '#86efac' },
    { key: 'off',      label: '公休系', color: '#e5e7eb' },
    { key: 'other',    label: '内勤等', color: '#fde68a' },
  ];

  const attendanceTypes = types.filter(t => t.category === 'kakukin' || t.category === 'nikkin_a' || t.category === 'nikkin_b');

  const periodOptions = periods.map(p =>
    `<option value="${p.start_date}|${p.end_date}" ${p.start_date === startDate && p.end_date === endDate ? 'selected' : ''}>${p.start_date} 〜 ${p.end_date}</option>`
  ).join('');

  const divisionTabs = divisions.length > 1 ? `
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
    ${divisions.map(d => `<a href="${ADMIN_PATH}/crew-shift?division=${encodeURIComponent(d)}" style="padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;
      ${d === division ? 'background:#1e3a5f;color:white;' : 'background:#f3f4f6;color:#374151;border:1px solid #d1d5db;'}">${escHtml(d)}</a>`).join('')}
  </div>` : '';

  return `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;">
  ${divisionTabs}
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
    <h2 style="font-size:15px;font-weight:bold;color:#1e3a5f;">乗務員シフト（${escHtml(division)}）</h2>
    <select id="period-select" onchange="changePeriod()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;background:white;">
      ${periodOptions || '<option>取込データがありません</option>'}
    </select>
    <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <a href="${ADMIN_PATH}/summer-report" class="btn-secondary">夏季稼働計画対実績</a>
      <a href="${ADMIN_PATH}/utilization-report" class="btn-secondary" target="_blank">稼働台数報告表</a>
      <button onclick="openHistory()" class="btn-secondary" style="border:none;cursor:pointer;">履歴</button>
      <button onclick="openIntegrityCheck()" class="btn-secondary" style="border:none;cursor:pointer;">整合性チェック</button>
      ${editable ? `<a href="${ADMIN_PATH}/settings/documents?tab=crew-shift-pdf" class="btn-secondary" style="border:none;background:#166534;color:white;text-decoration:none;">📄 PDFアップロードはデータセンターへ</a>` : ''}
    </div>
  </div>

  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;">
    <input id="f-search" type="text" placeholder="氏名・車両コードで検索" oninput="applyFilters()" style="border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;width:180px;">
    <span style="font-size:11px;color:#6b7280;">班:</span>
    <div id="f-teams">
      <button class="f-team-btn active" data-team="all" onclick="setTeamFilter('all',this)">全部</button>
      ${teams.map(t => `<button class="f-team-btn" data-team="${t}" onclick="setTeamFilter('${t}',this)">${t}班</button>`).join('')}
    </div>
    <span style="font-size:11px;color:#6b7280;">記号:</span>
    <select id="f-code" onchange="applyFilters()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;background:white;">
      <option value="">すべて</option>
      ${types.map(t => `<option value="${escHtml(t.code)}">${escHtml(t.code)}（${escHtml(t.label)}）</option>`).join('')}
    </select>
    <label style="font-size:11px;color:#6b7280;display:flex;align-items:center;gap:4px;"><input type="checkbox" id="f-code-only" onchange="applyFilters()">選択記号の該当者だけ表示</label>
    <span id="f-result-count" style="margin-left:auto;font-size:11px;color:#9ca3af;"></span>
  </div>

  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;">
    <span style="font-size:11px;color:#6b7280;">勤務で絞り込み:</span>
    <div id="f-quick">
      <button class="f-quick-btn active" data-quick="" onclick="setQuickAll(this)">全部</button>
      <button class="f-quick-btn" data-quick="today" onclick="setQuickToday(this)" ${todayStr && dates.includes(todayStr) ? '' : 'disabled title="表示中の期間に本日が含まれていません"'}>今日出勤</button>
      ${attendanceTypes.map(t => `<button class="f-quick-btn" data-quick="${escHtml(t.code)}" onclick="setQuickCode('${t.code}', this)">${escHtml(t.label)}</button>`).join('')}
    </div>
    <button onclick="openCardChecklist()" style="margin-left:auto;padding:7px 16px;background:#1e3a5f;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">乗務員証挿しチェック</button>
  </div>

  ${editable ? `
  <div style="margin-bottom:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;" id="edit-start-wrap">
    <button onclick="startEdit()" id="edit-start-btn" style="padding:7px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;font-size:13px;font-weight:600;color:#166534;cursor:pointer;">編集モードを開始</button>
    <span style="font-size:11px;color:#9ca3af;">セルをタップして記号を変更できます</span>
  </div>
  <div id="edit-mode-bar" style="display:none;background:#fffbeb;border:2px solid #fbbf24;border-radius:8px;padding:10px 14px;margin-bottom:8px;align-items:center;gap:10px;flex-wrap:wrap;">
    <span style="color:#d97706;font-weight:700;font-size:13px;">編集モード中</span>
    <span id="pending-count-label" style="color:#92400e;font-size:13px;background:#fef3c7;padding:2px 8px;border-radius:4px;border:1px solid #fbbf24;">変更 0件</span>
    <div style="margin-left:auto;display:flex;gap:8px;">
      <button onclick="cancelEdit()" style="padding:8px 16px;background:#fff;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">キャンセル</button>
      <button onclick="batchSave()" id="batch-save-btn" disabled style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;opacity:0.5;">一括保存</button>
    </div>
  </div>` : `<div style="margin-bottom:8px;font-size:12px;color:#6b7280;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:6px 12px;display:inline-block;">閲覧専用（編集権限がありません）</div>`}

  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;font-size:11px;align-items:center;">
    ${types.map(t => `<span style="background:${t.color};padding:2px 8px;border-radius:4px;border:1px solid #d1d5db;">${escHtml(t.code)} <span style="color:#374151;font-size:10px;">${escHtml(t.label)}</span></span>`).join('')}
  </div>

  ${teams.map(t => teamTable(t)).join('')}

  <h3 style="font-size:13px;font-weight:700;color:#1e3a5f;margin:20px 0 6px;">日別内訳（表示中の全班合計）</h3>
  <div style="overflow-x:auto;border:1px solid #d1d5db;border-radius:8px;">
    <table style="border-collapse:collapse;table-layout:fixed;">
      <thead><tr>
        <th style="min-width:70px;${STICKY}left:0;${HDR_BG}font-size:10px;padding:4px;border:1px solid #4b6cb7;">区分</th>
        ${dates.map(d => `<th style="min-width:34px;font-size:10px;padding:3px 1px;border:1px solid #d1d5db;background:#eff6ff;">${new Date(d + 'T00:00:00Z').getUTCDate()}</th>`).join('')}
      </tr></thead>
      <tbody>
        ${CATS.map(cat => `<tr>
          <td style="${STICKY}left:0;background:${cat.color};font-size:11px;font-weight:600;padding:3px 6px;border:1px solid #d1d5db;">${cat.label}</td>
          ${dates.map(d => `<td class="cs-daycat" data-cat="${cat.key}" data-date="${d}" style="text-align:center;font-size:11px;border:1px solid #d1d5db;"></td>`).join('')}
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
</div>

<!-- セル編集モーダル -->
<div id="cell-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
      <div>
        <div id="modal-name" style="font-size:15px;font-weight:700;color:#1e3a5f;"></div>
        <div id="modal-date-label" style="font-size:12px;color:#6b7280;margin-top:2px;"></div>
      </div>
      <button onclick="closeCellModal()" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;" id="preset-buttons"></div>
    <div style="display:flex;gap:8px;">
      <button onclick="clearCell()" style="flex:1;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;cursor:pointer;background:#fff;">クリア（未配置）</button>
    </div>
  </div>
</div>

<!-- 日別内訳モーダル -->
<div id="day-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:520px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <h3 id="day-modal-title" style="font-size:15px;font-weight:700;color:#1e3a5f;"></h3>
      <button onclick="sel('#day-modal').style.display='none'" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div id="day-modal-body" style="font-size:13px;"></div>
  </div>
</div>

<!-- 乗務員証挿しチェックモーダル -->
<div id="card-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:420px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <h3 id="card-modal-title" style="font-size:14px;font-weight:700;color:#1e3a5f;">乗務員証挿しチェック</h3>
      <button onclick="sel('#card-modal').style.display='none'" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
      <button onclick="changeCardDate(-1)" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">◀</button>
      <input type="date" id="card-date-input" onchange="onCardDateInput()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;">
      <button onclick="changeCardDate(1)" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;">▶</button>
      <button onclick="setCardDateToday()" style="margin-left:4px;padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;background:#fff;font-size:12px;cursor:pointer;">今日</button>
    </div>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">選択した日に出勤(隔勤・日勤)の乗務員が対象です（班の絞り込みは反映されます）。チェック状態は保存され、日付を切り替えても引き継がれます。</div>
    <div id="card-modal-body" style="font-size:13px;">読み込み中...</div>
    <div id="card-done-summary" style="margin-top:10px;font-size:11px;color:#9ca3af;"></div>
  </div>
</div>

<!-- 整合性チェックモーダル -->
<div id="integrity-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:640px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;">整合性チェック（${escHtml(division)}）</h3>
      <button onclick="sel('#integrity-modal').style.display='none'" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">隔勤(Ｈ/Ｄ/Ｂ)は1回の出番が2日にまたがるため、翌暦日は必ず「明け」（記号なし）のはずです。翌日に何か記号が入っている＝同じ記号の連続や、明けの日に休みの記号が来ているなどのデータ不整合です。全期間のデータを対象にチェックします。</div>
    <div id="integrity-body" style="font-size:13px;">読み込み中...</div>
  </div>
</div>

<!-- 履歴モーダル -->
<div id="history-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:640px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;">取込・編集履歴（最新200件）</h3>
      <button onclick="sel('#history-modal').style.display='none'" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div id="history-body" style="font-size:12px;color:#6b7280;">読み込み中...</div>
  </div>
</div>

${saveToastHtml()}

<style>
  .btn-secondary { padding:6px 14px;background:#6b7280;color:white;border-radius:6px;text-decoration:none;font-size:13px;display:inline-block; }
  .f-team-btn { border:1px solid #d1d5db;background:white;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;margin-right:4px; }
  .f-team-btn.active { background:#2563eb;color:white;border-color:#2563eb; }
  .f-quick-btn { border:1px solid #d1d5db;background:white;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;margin-right:4px; }
  .f-quick-btn.active { background:#166534;color:white;border-color:#166534; }
  .f-quick-btn:disabled { opacity:0.4;cursor:not-allowed; }
  .cs-cell:active { opacity:0.6; }
  .cs-cell[data-pending="true"] { outline:2px dashed #f59e0b !important; }
  .cs-row.filtered-out { display:none; }
  /* セル毎にインラインstyleを繰り返さないための共通クラス（HTML転送量・DOM生成コストの削減） */
  .cs-cell { min-width:34px;max-width:34px;width:34px;text-align:center;font-size:11px;padding:5px 1px;border:1px solid #d1d5db;overflow:hidden;white-space:nowrap;touch-action:manipulation; }
  ${editable ? '.cs-cell { cursor:pointer; }' : ''}
</style>

<script>
var CAN_EDIT = ${editable ? 'true' : 'false'};
var CUR_DIVISION = ${safeJson(division)};
var TODAY_STR = ${safeJson(todayStr)};
var API = '${ADMIN_PATH}/api/crew-shift';
var _dates = ${safeJson(dates)};
var _types = ${safeJson(types.map(t => ({ code: t.code, color: t.color, label: t.label, category: t.category, weight: t.count_weight })))};
var colorMap = {}, weightMap = {}, categoryMap = {}, labelMap = {};
_types.forEach(function(t) { colorMap[t.code] = t.color; weightMap[t.code] = t.weight; categoryMap[t.code] = t.category; labelMap[t.code] = t.label; });

function sel(s) { return document.querySelector(s); }
function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
${saveToastScript()}

function changePeriod() {
  var v = sel('#period-select').value.split('|');
  location.href = '${ADMIN_PATH}/crew-shift?division=' + encodeURIComponent(CUR_DIVISION) + '&start=' + v[0] + '&end=' + v[1];
}

// ===== 集計（行の内訳・日別内訳） =====
function recalcAll() {
  var visibleByDate = {};
  _dates.forEach(function(d) { visibleByDate[d] = {}; });
  document.querySelectorAll('.cs-row').forEach(function(row) {
    if (row.classList.contains('filtered-out')) return;
    var counts = {};
    row.querySelectorAll('.cs-cell').forEach(function(td) {
      var code = td.dataset.code || '';
      if (!code) return;
      counts[code] = (counts[code] || 0) + 1;
      var d = td.dataset.date;
      visibleByDate[d][categoryMap[code] || 'other'] = (visibleByDate[d][categoryMap[code] || 'other'] || 0) + (weightMap[code] || 0);
    });
    var parts = Object.keys(counts).sort().map(function(c) { return c + counts[c]; });
    var countTd = sel('.cs-count[data-member="' + row.dataset.member + '"]');
    if (countTd) countTd.textContent = parts.join(' ');
  });
  document.querySelectorAll('.cs-daycat').forEach(function(td) {
    var v = visibleByDate[td.dataset.date] ? (visibleByDate[td.dataset.date][td.dataset.cat] || 0) : 0;
    td.textContent = v > 0 ? (Number.isInteger(v) ? v : v.toFixed(1)) : '';
  });
}
recalcAll();

// ===== フィルタ =====
var _teamFilter = 'all';
function setTeamFilter(team, btn) {
  _teamFilter = team;
  document.querySelectorAll('.f-team-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  applyFilters();
}

var _quickToday = false;
var _quickCode = '';
function _clearQuickActive() { document.querySelectorAll('.f-quick-btn').forEach(function(b) { b.classList.remove('active'); }); }
function setQuickAll(btn) {
  _quickToday = false; _quickCode = '';
  _clearQuickActive(); btn.classList.add('active');
  applyFilters();
}
function setQuickToday(btn) {
  _quickToday = true; _quickCode = '';
  _clearQuickActive(); btn.classList.add('active');
  applyFilters();
}
function setQuickCode(code, btn) {
  _quickToday = false; _quickCode = code;
  _clearQuickActive(); btn.classList.add('active');
  applyFilters();
}

function applyFilters() {
  var q = (sel('#f-search').value || '').trim().toLowerCase();
  var code = sel('#f-code').value;
  var onlyCode = sel('#f-code-only').checked;
  var shown = 0;
  document.querySelectorAll('.cs-row').forEach(function(row) {
    var ok = true;
    if (_teamFilter !== 'all' && row.dataset.team !== _teamFilter) ok = false;
    if (ok && q) {
      var hay = (row.dataset.name + ' ' + row.dataset.car).toLowerCase();
      if (hay.indexOf(q) === -1) ok = false;
    }
    if (ok && code && onlyCode) {
      var has = false;
      row.querySelectorAll('.cs-cell').forEach(function(td) { if (td.dataset.code === code) has = true; });
      if (!has) ok = false;
    }
    if (ok && _quickToday) {
      var todayTd = row.querySelector('.cs-cell[data-date="' + TODAY_STR + '"]');
      var tc = todayTd ? todayTd.dataset.code : '';
      var tcat = tc ? (categoryMap[tc] || '') : '';
      if (!tc || (tcat !== 'kakukin' && tcat !== 'nikkin_a' && tcat !== 'nikkin_b')) ok = false;
    }
    if (ok && _quickCode) {
      var hasQuick = false;
      row.querySelectorAll('.cs-cell').forEach(function(td) { if (td.dataset.code === _quickCode) hasQuick = true; });
      if (!hasQuick) ok = false;
    }
    row.classList.toggle('filtered-out', !ok);
    if (ok) shown++;
    if (code) {
      row.querySelectorAll('.cs-cell').forEach(function(td) {
        td.style.outline = (td.dataset.code === code) ? '2px solid #2563eb' : '';
      });
    } else {
      row.querySelectorAll('.cs-cell').forEach(function(td) { td.style.outline = ''; });
    }
  });
  sel('#f-result-count').textContent = shown + '名 表示中';
  recalcAll();
  resetCardChecklist();
}
applyFilters();

// ===== 乗務員証挿しチェック（日付ごと・サーバー保存） =====
var _cardDate = '';
var _cardMembers = null;
function resetCardChecklist() {
  if (sel('#card-modal').style.display === 'flex') loadCardChecklist();
}
function openCardChecklist() {
  if (!_cardDate) _cardDate = (TODAY_STR && _dates.indexOf(TODAY_STR) !== -1) ? TODAY_STR : (_dates[0] || TODAY_STR);
  sel('#card-date-input').value = _cardDate;
  sel('#card-modal').style.display = 'flex';
  loadCardChecklist();
}
function setCardDateToday() {
  _cardDate = TODAY_STR;
  sel('#card-date-input').value = _cardDate;
  loadCardChecklist();
}
function changeCardDate(delta) {
  var d = new Date(_cardDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  _cardDate = d.toISOString().slice(0, 10);
  sel('#card-date-input').value = _cardDate;
  loadCardChecklist();
}
function onCardDateInput() {
  var v = sel('#card-date-input').value;
  if (!v) return;
  _cardDate = v;
  loadCardChecklist();
}
async function loadCardChecklist() {
  sel('#card-modal-body').innerHTML = '読み込み中...';
  try {
    var res = await fetch(API + '/card-check?division=' + encodeURIComponent(CUR_DIVISION) + '&date=' + _cardDate);
    var d = await res.json();
    if (!res.ok) throw new Error(d.error || 'server');
    var onDutyCats = { kakukin: true, nikkin_a: true, nikkin_b: true };
    _cardMembers = (d.members || []).filter(function(m) {
      if (_teamFilter !== 'all' && String(m.team) !== String(_teamFilter)) return false;
      var cat = m.code ? (categoryMap[m.code] || '') : '';
      return onDutyCats[cat];
    });
    renderCardChecklist();
  } catch (e) {
    sel('#card-modal-body').innerHTML = '<div style="color:#dc2626;">読み込みに失敗しました</div>';
  }
}
function renderCardChecklist() {
  if (!_cardMembers) return;
  var dow = ['日','月','火','水','木','金','土'][new Date(_cardDate + 'T00:00:00Z').getUTCDay()];
  var remaining = _cardMembers.filter(function(m) { return !m.checked_by; });
  var doneList = _cardMembers.filter(function(m) { return m.checked_by; });
  sel('#card-modal-title').textContent = _cardDate + '（' + dow + '）残り ' + remaining.length + ' / 全' + _cardMembers.length + '名';
  sel('#card-modal-body').innerHTML = _cardMembers.length === 0
    ? '<div style="text-align:center;color:#9ca3af;padding:20px;">この日の出勤者はいません</div>'
    : remaining.length === 0
    ? '<div style="text-align:center;color:#166534;font-weight:700;padding:20px;">全員分チェックしました</div>'
    : remaining.map(function(m) {
        return '<button onclick="toggleCard(' + m.id + ', true)" style="display:block;width:100%;text-align:left;padding:12px 14px;margin-bottom:6px;border:1px solid #d1d5db;border-radius:8px;background:#fff;font-size:14px;cursor:pointer;">' +
          (m.team ? '<span style="color:#9ca3af;font-size:11px;margin-right:6px;">' + escH(m.team) + '班</span>' : '') +
          escH(m.name) + ' <span style="font-size:11px;color:#9ca3af;">' + escH(m.code || '') + '</span></button>';
      }).join('');
  sel('#card-done-summary').innerHTML = doneList.length
    ? '済み（タップで戻す）: ' + doneList.map(function(m) {
        return '<a href="javascript:void(0)" onclick="toggleCard(' + m.id + ', false)" title="' + escH(m.checked_by || '') + ' ' + escH(m.checked_at || '') + '" style="color:#6b7280;text-decoration:underline;margin-right:6px;">' + escH(m.name) + '</a>';
      }).join('')
    : '';
}
async function toggleCard(id, checked) {
  try {
    var res = await fetch(API + '/card-check', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ member_id: id, date: _cardDate, checked: checked }) });
    if (!res.ok) throw new Error('server');
    await loadCardChecklist();
  } catch (e) {
    showToast('更新に失敗しました');
  }
}

// ===== 整合性チェック =====
function addDaysStr(dateStr, n) {
  var d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
async function openIntegrityCheck() {
  sel('#integrity-modal').style.display = 'flex';
  sel('#integrity-body').innerHTML = '読み込み中...';
  try {
    var res = await fetch(API + '/integrity-check?division=' + encodeURIComponent(CUR_DIVISION));
    var d = await res.json();
    if (!res.ok) throw new Error(d.error || 'server');
    var violations = d.violations || [];
    if (violations.length === 0) {
      sel('#integrity-body').innerHTML = '<div style="text-align:center;color:#166534;font-weight:700;padding:20px;">不整合は見つかりませんでした</div>';
      return;
    }
    sel('#integrity-body').innerHTML = '<div style="margin-bottom:8px;font-size:12px;color:#dc2626;font-weight:700;">' + violations.length + '件の不整合</div>' +
      violations.map(function(v) {
        var msg = v.code1 === v.code2
          ? '同じ記号（' + escH(v.code1) + '）が2日連続しています'
          : '隔勤（' + escH(v.code1) + '）の翌日（明けのはず）に「' + escH(v.code2) + '」が入っています';
        var linkStart = addDaysStr(v.date1, -3);
        var linkEnd = addDaysStr(v.date2, 3);
        var url = '${ADMIN_PATH}/crew-shift?division=' + encodeURIComponent(CUR_DIVISION) + '&start=' + linkStart + '&end=' + linkEnd;
        return '<div style="padding:10px 12px;margin-bottom:6px;border:1px solid #fecaca;background:#fef2f2;border-radius:8px;">' +
          '<div style="font-weight:600;">' + (v.team ? v.team + '班 ' : '') + escH(v.name) + '</div>' +
          '<div style="font-size:12px;color:#374151;margin:2px 0;">' + escH(v.date1) + '「' + escH(v.code1) + '」→ ' + escH(v.date2) + '「' + escH(v.code2) + '」</div>' +
          '<div style="font-size:12px;color:#b91c1c;">' + msg + '</div>' +
          '<a href="' + url + '" style="font-size:12px;color:#2563eb;text-decoration:underline;">この期間を表示</a>' +
          '</div>';
      }).join('');
  } catch (e) {
    sel('#integrity-body').innerHTML = '<div style="color:#dc2626;">読み込みに失敗しました</div>';
  }
}

// ===== 日別内訳モーダル =====
function openDayBreakdown(date) {
  var byCat = {};
  var names = {};
  document.querySelectorAll('.cs-row').forEach(function(row) {
    var td = row.querySelector('.cs-cell[data-date="' + date + '"]');
    if (!td) return;
    var code = td.dataset.code;
    if (!code) return;
    var cat = categoryMap[code] || 'other';
    byCat[cat] = (byCat[cat] || 0) + (weightMap[code] || 0);
    names[code] = names[code] || [];
    names[code].push(row.dataset.name);
  });
  var dt = new Date(date + 'T00:00:00Z');
  var dow = ['日','月','火','水','木','金','土'][dt.getUTCDay()];
  sel('#day-modal-title').textContent = date + '（' + dow + '）の内訳';
  var html = '<table style="width:100%;border-collapse:collapse;margin-bottom:12px;">';
  html += '<tr style="background:#f3f4f6;"><td style="padding:4px 8px;font-weight:600;">隔勤</td><td style="padding:4px 8px;">' + (byCat.kakukin||0) + '人</td></tr>';
  html += '<tr><td style="padding:4px 8px;font-weight:600;">日勤Ａ</td><td style="padding:4px 8px;">' + (byCat.nikkin_a||0) + '</td></tr>';
  html += '<tr style="background:#f3f4f6;"><td style="padding:4px 8px;font-weight:600;">日勤Ｂ</td><td style="padding:4px 8px;">' + (byCat.nikkin_b||0) + '</td></tr>';
  html += '</table>';
  html += '<div style="font-size:11px;color:#9ca3af;margin-bottom:6px;">記号ごとの該当者</div>';
  Object.keys(names).sort().forEach(function(code) {
    html += '<div style="margin-bottom:6px;"><span style="background:' + (colorMap[code]||'#eee') + ';padding:1px 6px;border-radius:4px;font-weight:600;">' + escH(code) + '</span> ' +
      '<span style="font-size:12px;color:#374151;">' + names[code].map(escH).join('、') + '</span></div>';
  });
  sel('#day-modal-body').innerHTML = html;
  sel('#day-modal').style.display = 'flex';
}

// ===== 編集モード =====
var _editMode = false;
var _pending = {};
var _cur = null;
function startEdit() {
  _editMode = true;
  sel('#edit-start-wrap').style.display = 'none';
  sel('#edit-mode-bar').style.display = 'flex';
  window.addEventListener('beforeunload', _beforeUnload);
}
function _beforeUnload(e) { if (Object.keys(_pending).length > 0) { e.preventDefault(); e.returnValue = ''; } }
function cancelEdit() {
  var n = Object.keys(_pending).length;
  if (n > 0 && !confirm(n + '件の未保存変更を破棄しますか？')) return;
  _editMode = false;
  _pending = {};
  window.removeEventListener('beforeunload', _beforeUnload);
  sel('#edit-start-wrap').style.display = 'flex';
  sel('#edit-mode-bar').style.display = 'none';
  if (n > 0) location.reload();
}
function _updatePending() {
  var n = Object.keys(_pending).length;
  sel('#pending-count-label').textContent = '変更 ' + n + '件';
  var btn = sel('#batch-save-btn');
  btn.disabled = n === 0;
  btn.style.opacity = n === 0 ? '0.5' : '1';
}
document.addEventListener('click', function(e) {
  var t = e.target;
  var td = (t && t.closest) ? t.closest('.cs-cell') : null;
  if (!td || !CAN_EDIT) return;
  if (!_editMode) { showToast('編集モードを開始してください'); return; }
  openCell(td);
});
function openCell(td) {
  _cur = { memberId: td.dataset.member, date: td.dataset.date, name: td.dataset.name };
  sel('#modal-name').textContent = td.dataset.name;
  var dow = ['日','月','火','水','木','金','土'][new Date(td.dataset.date + 'T00:00:00Z').getUTCDay()];
  sel('#modal-date-label').textContent = td.dataset.date + '（' + dow + '）';
  sel('#preset-buttons').innerHTML = _types.map(function(t) {
    return '<button onclick="selectCode(\\'' + t.code + '\\')" style="padding:8px 14px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;cursor:pointer;background:' + t.color + ';">' + escH(t.code) + ' <span style="font-size:10px;color:#374151;">' + escH(t.label) + '</span></button>';
  }).join('');
  sel('#cell-modal').style.display = 'flex';
}
function closeCellModal() { sel('#cell-modal').style.display = 'none'; _cur = null; }
function _applyCode(code) {
  if (!_cur) return;
  var key = _cur.memberId + '_' + _cur.date;
  _pending[key] = { member_id: parseInt(_cur.memberId), date: _cur.date, code: code || null };
  var td = sel('.cs-cell[data-member="' + _cur.memberId + '"][data-date="' + _cur.date + '"]');
  if (td) {
    td.dataset.code = code || '';
    td.style.background = code ? (colorMap[code] || '#fff7ed') : '#ffffff';
    td.textContent = code || '';
    td.dataset.pending = 'true';
  }
  _updatePending();
  recalcAll();
  closeCellModal();
}
function selectCode(code) { _applyCode(code); }
function clearCell() { _applyCode(''); }
async function batchSave() {
  var entries = Object.values(_pending);
  if (entries.length === 0) return;
  var btn = sel('#batch-save-btn');
  btn.disabled = true; btn.textContent = '保存中...';
  try {
    var res = await fetch(API + '/shifts/batch', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ entries: entries }) });
    if (!res.ok) { var d = await res.json().catch(function(){return {};}); throw new Error(d.error || 'server'); }
    document.querySelectorAll('.cs-cell[data-pending="true"]').forEach(function(td) { delete td.dataset.pending; });
    _pending = {};
    _editMode = false;
    window.removeEventListener('beforeunload', _beforeUnload);
    sel('#edit-start-wrap').style.display = 'flex';
    sel('#edit-mode-bar').style.display = 'none';
    showToast('保存しました');
  } catch (e) {
    alert('保存に失敗しました: ' + (e.message || ''));
  } finally {
    btn.textContent = '一括保存';
    _updatePending();
  }
}

// ===== 履歴 =====
async function openHistory() {
  sel('#history-modal').style.display = 'flex';
  var res = await fetch(API + '/logs');
  var d = await res.json();
  var logs = d.logs || [];
  if (logs.length === 0) { sel('#history-body').textContent = '履歴はありません'; return; }
  sel('#history-body').innerHTML = '<table style="width:100%;border-collapse:collapse;">' + logs.map(function(l) {
    return '<tr><td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">' + escH(l.created_at) + '</td>' +
      '<td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;">' + escH(l.admin_name) + '</td>' +
      '<td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;">' + escH(l.action) + '</td>' +
      '<td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;">' + escH(l.target) + (l.date ? ' (' + escH(l.date) + ')' : '') + '</td>' +
      '<td style="padding:4px 6px;border-bottom:1px solid #f3f4f6;color:#6b7280;">' + escH(l.old_value||'') + (l.new_value ? ' → ' + escH(l.new_value) : '') + '</td></tr>';
  }).join('') + '</table>';
}

${editable ? `
` : ''}
</script>`;
}
