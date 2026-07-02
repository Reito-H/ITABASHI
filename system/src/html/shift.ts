import { escHtml } from './layout';
import { ADMIN_PATH } from '../config';

export type Employee = {
  id: number;
  emp_no: string;
  name: string;
  name_kana: string | null;
  division: number | null;
  team: number | null;
  locker_no: string | null;
  phone: string | null;
  entry_type: string;
  hire_date: string | null;
  first_duty_date: string | null;
  birth_date: string | null;
  seq_no: number | null;
  training_completed: number | null;
  interview_target: number | null;
  status: string | null;
};

export type ShiftEntry = {
  emp_id: number;
  date: string;
  entry_am: string | null;
  entry_pm: string | null;
  coach_id: number | null;
};

export type Coach = {
  id: number;
  name: string;
  is_active: number;
  sort_order: number;
};

export type Instructor = {
  id: number;
  name: string;
  role: string | null;
};

export type InstructorSchedule = {
  instructor_id: number;
  date: string;
  entry: string | null;
  note: string | null;
};

export type ScheduleType = {
  id: number;
  code: string;
  color: string;
  sort_order: number;
  is_active: number;
  target: number | null;
};

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

export function shiftPage(
  employees: Employee[],
  shiftMap: Record<string, ShiftEntry>,
  instructors: Instructor[],
  instructorScheduleMap: Record<string, InstructorSchedule>,
  dates: string[],
  year: number,
  month: number,
  periodStart: string,
  periodEnd: string,
  scheduleTypes: ScheduleType[] = [],
  coaches: Coach[] = [],
  mode: string = 'training'
): string {
  const colorMap: Record<string, string> = {};
  for (const t of scheduleTypes) colorMap[t.code] = t.color;
  if (Object.keys(colorMap).length === 0) {
    Object.assign(colorMap, { '実研':'#dbeafe','公休':'#e5e7eb','初乗務':'#fef08a','所長':'#e9d5ff','座学':'#bbf7d0','実務':'#bfdbfe','配属':'#fed7aa','休':'#f3f4f6' });
  }

  const coachMap: Record<number, string> = {};
  for (const c of coaches) coachMap[c.id] = c.name;

  const periodLabel = `${year}年${month}月度（${periodStart}〜${periodEnd}）`;
  let prevYear = year, prevMonth = month - 1;
  if (prevMonth < 1) { prevMonth = 12; prevYear--; }
  let nextYear = year, nextMonth = month + 1;
  if (nextMonth > 12) { nextMonth = 1; nextYear++; }

  const newGrads = employees.filter(e => e.entry_type === '新卒');
  const career   = employees.filter(e => e.entry_type !== '新卒');

  const STICKY = 'position:sticky;z-index:2;';
  const HDR_BG = 'background:#1e3a5f;color:white;';
  const FIX_BG = 'background:#f8fafc;';

  function cell(am: string, row: 'am'|'pm'|'coach', empId: number, date: string, name: string, inPeriod: boolean): string {
    const bg = row === 'coach'
      ? '#fafafa'
      : (colorMap[am] ?? (am ? '#fff7ed' : '#ffffff'));
    const op = inPeriod ? '' : 'opacity:0.45;';
    const fs = row === 'coach' ? 'font-size:8px;color:#6b7280;line-height:1;' : 'font-size:11px;';
    const pd = row === 'coach' ? 'padding:2px 1px;' : 'padding:5px 2px;';
    return `<td class="sc" data-emp="${empId}" data-date="${date}" data-row="${row}" data-name="${escHtml(name)}"
      style="background:${bg};min-width:44px;max-width:44px;width:44px;text-align:center;${fs}${pd}border:1px solid ${row==='coach'?'#f0f0f0':'#d1d5db'};cursor:pointer;overflow:hidden;white-space:nowrap;touch-action:manipulation;${op}"
      onclick="openEditor(this)">${escHtml(am)}</td>`;
  }

  function renderEmployeeRows(list: Employee[]): string {
    return list.map(emp => {
      const amCells    = dates.map(d => cell(shiftMap[`${emp.id}_${d}`]?.entry_am ?? '', 'am',    emp.id, d, emp.name, d >= periodStart && d <= periodEnd)).join('');
      const pmCells    = dates.map(d => cell(shiftMap[`${emp.id}_${d}`]?.entry_pm ?? '', 'pm',    emp.id, d, emp.name, d >= periodStart && d <= periodEnd)).join('');
      const coachCells = dates.map(d => {
        const cid = shiftMap[`${emp.id}_${d}`]?.coach_id ?? null;
        return cell(cid ? (coachMap[cid] ?? '') : '', 'coach', emp.id, d, emp.name, d >= periodStart && d <= periodEnd);
      }).join('');

      const S0 = `min-width:32px;text-align:center;font-size:11px;border:1px solid #d1d5db;padding:2px;${STICKY}left:0;${FIX_BG}`;
      const S1 = `min-width:28px;text-align:center;font-size:11px;border:1px solid #d1d5db;padding:2px;${STICKY}left:32px;${FIX_BG}`;
      const S2 = `min-width:28px;text-align:center;font-size:11px;border:1px solid #d1d5db;padding:2px;${STICKY}left:60px;${FIX_BG}`;
      const S3 = `min-width:80px;font-size:11px;border:1px solid #d1d5db;padding:2px 4px;${STICKY}left:88px;${FIX_BG}`;
      const S4 = `min-width:44px;font-size:10px;border:1px solid #d1d5db;padding:2px;${STICKY}left:168px;${FIX_BG}color:#6b7280;`;

      return `
        <tr data-emp="${emp.id}" style="border-top:2px solid #9ca3af;">
          <td rowspan="3" style="${S0}">${emp.seq_no ?? ''}</td>
          <td rowspan="3" style="${S1}">${emp.division ?? ''}</td>
          <td rowspan="3" style="${S2}">${emp.team ?? ''}</td>
          <td rowspan="3" style="${S3}">
            <a href="${ADMIN_PATH}/shift/print/${emp.id}?year=${year}&month=${month}" target="_blank"
               style="color:#2563eb;text-decoration:underline;">${escHtml(emp.name)}</a>
            ${emp.status === 'unassigned' ? '<span style="font-size:9px;background:#f3f4f6;color:#6b7280;padding:1px 4px;border-radius:3px;margin-left:2px;">未配属</span>' : ''}
            <button data-eid="${emp.id}" data-ename="${escHtml(emp.name)}" onclick="changeStatusBtn(this)"
              style="margin-top:2px;font-size:9px;padding:1px 5px;background:#bbf7d0;border:1px solid #86efac;border-radius:3px;cursor:pointer;color:#166534;touch-action:manipulation;">研修終了</button>
            <button data-eid="${emp.id}" data-ename="${escHtml(emp.name)}" onclick="openCountBtn(this)"
              style="margin-top:2px;font-size:9px;padding:1px 5px;background:#f0f9ff;border:1px solid #7dd3fc;border-radius:3px;cursor:pointer;color:#0369a1;touch-action:manipulation;">集計</button>
          </td>
          <td rowspan="3" style="${S4}">${escHtml(emp.emp_no)}</td>
          ${amCells}
        </tr>
        <tr data-emp="${emp.id}">
          ${pmCells}
        </tr>
        <tr data-emp="${emp.id}" style="border-bottom:1px solid #d1d5db;height:18px;">
          ${coachCells}
        </tr>`;
    }).join('');
  }

  function renderGroupHeader(label: string, color: string): string {
    return `<tr><td colspan="${5 + dates.length}" style="background:${color};font-size:12px;font-weight:bold;padding:4px 8px;border:1px solid #d1d5db;">${label}</td></tr>`;
  }

  function renderInstructorRows(): string {
    if (instructors.length === 0) return '';
    return instructors.map(inst => {
      const mainCells = dates.map(d => {
        const s = instructorScheduleMap[`${inst.id}_${d}`];
        const inPeriod = d >= periodStart && d <= periodEnd;
        const entry = s?.entry ?? '';
        const bg = entry ? (colorMap[entry] ?? '#faf5ff') : '#faf5ff';
        const dispEntry = entry === '出勤' ? '' : entry;
        return `<td data-inst="${inst.id}" data-inst-name="${escHtml(inst.name)}" data-date="${d}" data-row="1" data-value="${escHtml(entry)}"
          style="min-width:44px;max-width:44px;text-align:center;font-size:11px;padding:3px 2px;border:1px solid #d1d5db;cursor:pointer;background:${bg};${inPeriod?'':'opacity:0.5;'}touch-action:manipulation;"
          onclick="openInstEditor(this)">${escHtml(dispEntry)}</td>`;
      }).join('');
      const subCells = dates.map(d => {
        const s = instructorScheduleMap[`${inst.id}_${d}`];
        return `<td data-inst="${inst.id}" data-date="${d}" data-row="2"
          style="min-width:44px;max-width:44px;text-align:center;font-size:10px;padding:2px;border:1px solid #e5e7eb;cursor:pointer;color:#6b7280;background:#fdf4ff;touch-action:manipulation;"
          onclick="openInstEditor(this)">${escHtml(s?.note ?? '')}</td>`;
      }).join('');
      const SI = `position:sticky;z-index:2;background:#faf5ff;border:1px solid #d1d5db;padding:2px;`;
      return `
        <tr style="border-top:2px solid #9ca3af;">
          <td colspan="3" style="${SI}left:0;min-width:88px;"></td>
          <td style="${SI}left:88px;min-width:80px;font-size:12px;font-weight:600;">${escHtml(inst.name)}<div style="font-size:10px;color:#6b7280;">${escHtml(inst.role ?? '')}</div></td>
          <td style="${SI}left:168px;min-width:44px;"></td>
          ${mainCells}
        </tr>
        <tr>
          <td colspan="5" style="position:sticky;left:0;z-index:2;background:#fdf4ff;border:1px solid #e5e7eb;"></td>
          ${subCells}
        </tr>`;
    }).join('');
  }

  const dateHeaders = dates.map(d => {
    const dt = new Date(d);
    const day = dt.getUTCDate();
    const dow = dt.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const inPeriod = d >= periodStart && d <= periodEnd;
    const bg = !inPeriod ? '#f3f4f6' : isWeekend ? '#fef2f2' : '#eff6ff';
    return `<th onclick="openDayList('${d}')" style="min-width:44px;max-width:44px;text-align:center;font-size:11px;padding:3px 1px;border:1px solid #d1d5db;background:${bg};cursor:pointer;${!inPeriod?'opacity:0.6;':''}touch-action:manipulation;"
      title="${d} の出勤者一覧">
      <div>${day}</div>
      <div style="color:${dow===0?'#ef4444':dow===6?'#3b82f6':'#374151'};">${WEEKDAY_JA[dow]}</div>
    </th>`;
  }).join('');

  const coachOptions = coaches.map(c =>
    `<option value="${c.id}">${escHtml(c.name)}</option>`
  ).join('');

  return `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
    <a href="${ADMIN_PATH}/shift?year=${prevYear}&month=${prevMonth}&mode=${mode}" class="btn-nav">◀ 前月度</a>
    <h2 style="font-size:15px;font-weight:bold;color:#1e3a5f;">${escHtml(periodLabel)}</h2>
    <a href="${ADMIN_PATH}/shift?year=${nextYear}&month=${nextMonth}&mode=${mode}" class="btn-nav">次月度 ▶</a>
    <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      ${mode === 'completed'
        ? `<a href="${ADMIN_PATH}/shift?year=${year}&month=${month}&mode=training" style="padding:6px 14px;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;font-size:13px;color:#166534;font-weight:600;text-decoration:none;">研修中を表示</a>`
        : `<a href="${ADMIN_PATH}/shift?year=${year}&month=${month}&mode=completed" style="padding:6px 14px;background:#fef9c3;border:1px solid #fde047;border-radius:6px;font-size:13px;color:#854d0e;font-weight:600;text-decoration:none;">研修終了者を表示</a>`
      }
      <a href="${ADMIN_PATH}/shift/export?year=${year}&month=${month}" class="btn-secondary">CSV出力</a>
      <a href="${ADMIN_PATH}/employees/add" class="btn-primary">＋ 新人登録</a>
    </div>
  </div>

  <!-- ロック状態バー（他ユーザーが編集中のとき） -->
  <div id="lock-status-bar" style="display:none;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:7px 12px;margin-bottom:8px;font-size:12px;color:#dc2626;font-weight:600;"></div>

  <!-- 編集モードバー -->
  <div id="edit-mode-bar" style="display:none;background:#fffbeb;border:2px solid #fbbf24;border-radius:8px;padding:10px 14px;margin-bottom:8px;align-items:center;gap:10px;flex-wrap:wrap;">
    <span style="color:#d97706;font-weight:700;font-size:13px;">編集モード中</span>
    <span id="pending-count-label" style="color:#92400e;font-size:13px;background:#fef3c7;padding:2px 8px;border-radius:4px;border:1px solid #fbbf24;">変更 0件</span>
    <span id="edit-error" style="display:none;color:#dc2626;font-size:12px;"></span>
    <div style="margin-left:auto;display:flex;gap:8px;">
      <button onclick="cancelEdit()" style="padding:8px 16px;background:#fff;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;touch-action:manipulation;">キャンセル</button>
      <button onclick="batchSave()" id="batch-save-btn" disabled style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation;opacity:0.5;">一括保存</button>
    </div>
  </div>

  <!-- 編集モード開始ボタン -->
  <div style="margin-bottom:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
    <button onclick="startEdit()" id="edit-start-btn" style="padding:7px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;font-size:13px;font-weight:600;color:#166534;cursor:pointer;touch-action:manipulation;">編集モードを開始</button>
    <span style="font-size:11px;color:#9ca3af;">セルを編集するには先に編集モードを開始してください</span>
  </div>

  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;font-size:11px;align-items:center;">
    ${scheduleTypes.filter(t => t.is_active).map(t =>
      `<span style="background:${t.color};padding:2px 8px;border-radius:4px;border:1px solid #d1d5db;">${escHtml(t.code)}</span>`
    ).join('')}
    <a href="${ADMIN_PATH}/settings" style="margin-left:4px;font-size:11px;color:#2563eb;text-decoration:none;">区分を編集</a>
  </div>

  <div style="overflow-x:auto;overflow-y:auto;max-height:75vh;border:1px solid #d1d5db;border-radius:8px;-webkit-overflow-scrolling:touch;">
    <table style="border-collapse:collapse;table-layout:fixed;">
      <thead style="position:sticky;top:0;z-index:10;background:white;">
        <tr>
          <th style="min-width:32px;${STICKY}left:0;z-index:20;${HDR_BG}font-size:11px;padding:4px 2px;border:1px solid #4b6cb7;">NO</th>
          <th style="min-width:28px;${STICKY}left:32px;z-index:20;${HDR_BG}font-size:11px;padding:4px 2px;border:1px solid #4b6cb7;">課</th>
          <th style="min-width:28px;${STICKY}left:60px;z-index:20;${HDR_BG}font-size:11px;padding:4px 2px;border:1px solid #4b6cb7;">班</th>
          <th style="min-width:80px;${STICKY}left:88px;z-index:20;${HDR_BG}font-size:11px;padding:4px;border:1px solid #4b6cb7;">氏名</th>
          <th style="min-width:44px;${STICKY}left:168px;z-index:20;${HDR_BG}font-size:11px;padding:4px 2px;border:1px solid #4b6cb7;">社員番号</th>
          ${dateHeaders}
        </tr>
      </thead>
      <tbody>
        ${newGrads.length > 0 ? renderGroupHeader(`● 新卒（2026年度入社）${mode === 'completed' ? ' — 研修終了' : ''}`, '#dbeafe') + renderEmployeeRows(newGrads) : ''}
        ${career.length > 0 ? renderGroupHeader(`● 一般入社${mode === 'completed' ? ' — 研修終了' : ''}`, '#dcfce7') + renderEmployeeRows(career) : ''}
        ${mode !== 'completed' && instructors.length > 0 ? `<tr><td colspan="${5 + dates.length}" style="height:10px;background:#f3e8ff;border:none;border-top:3px solid #a855f7;"></td></tr>` + renderGroupHeader('▼ 班長・指導者スケジュール', '#f3e8ff') + renderInstructorRows() : ''}
      </tbody>
    </table>
  </div>
</div>

<!-- セル編集モーダル -->
<div id="cell-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
      <div>
        <div id="modal-emp-name" style="font-size:15px;font-weight:700;color:#1e3a5f;"></div>
        <div id="modal-date-label" style="font-size:12px;color:#6b7280;margin-top:2px;"></div>
      </div>
      <button onclick="closeModal()" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;padding:0 4px;line-height:1;">✕</button>
    </div>

    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;" id="preset-buttons">
      ${scheduleTypes.filter(t => t.is_active).map(t =>
        `<button onclick="selectPreset('${escHtml(t.code)}')" style="padding:6px 11px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;background:${t.color};touch-action:manipulation;"
          onmouseover="this.style.opacity='0.7'" onmouseout="this.style.opacity='1'">${escHtml(t.code)}</button>`
      ).join('')}
    </div>

    <div style="margin-bottom:10px;">
      <label id="modal-am-label" style="font-size:11px;font-weight:600;color:#059669;display:block;margin-bottom:4px;">午前 — 研修内容</label>
      <div style="display:flex;align-items:center;gap:6px;">
        <button id="seq-prev" onclick="seqNav(-1)"
          style="padding:8px 14px;font-size:18px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;touch-action:manipulation;flex-shrink:0;line-height:1;">◀</button>
        <input id="modal-am" type="text" placeholder="区分を選択または自由入力"
          style="flex:1;border:1px solid #6ee7b7;border-radius:6px;padding:10px;font-size:16px;font-family:inherit;outline:none;box-sizing:border-box;"
          onfocus="_currentFocus='am'">
        <button id="seq-next" onclick="seqNav(1)"
          style="padding:8px 14px;font-size:18px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;touch-action:manipulation;flex-shrink:0;line-height:1;">▶</button>
      </div>
    </div>
    <div style="margin-bottom:10px;">
      <label id="modal-pm-label" style="font-size:11px;font-weight:600;color:#d97706;display:block;margin-bottom:4px;">午後 — 研修内容</label>
      <input id="modal-pm" type="text" placeholder="区分を選択または自由入力"
        style="width:100%;border:1px solid #fcd34d;border-radius:6px;padding:10px;font-size:16px;font-family:inherit;outline:none;box-sizing:border-box;"
        onfocus="_currentFocus='pm'">
    </div>
    <div id="modal-coach-wrap" style="margin-bottom:16px;">
      <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">研修担当</label>
      <select id="modal-coach" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:10px;font-size:15px;font-family:inherit;background:white;outline:none;"
        onfocus="_currentFocus='coach'">
        <option value="">— なし —</option>
        ${coachOptions}
      </select>
    </div>

    <div id="modal-error" style="color:#dc2626;font-size:12px;margin-bottom:8px;display:none;"></div>
    <div style="display:flex;gap:8px;">
      <button onclick="clearCell()" style="flex:1;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;cursor:pointer;background:#fff;touch-action:manipulation;">クリア</button>
      <button onclick="applyCell()" id="save-cell-btn" style="flex:2;padding:10px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation;">適用</button>
    </div>
  </div>
</div>

<!-- 日別出勤者モーダル -->
<div id="day-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:460px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <h3 id="day-modal-title" style="font-size:15px;font-weight:700;color:#1e3a5f;"></h3>
      <button onclick="closeDayModal()" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div id="day-modal-body"></div>
    <div style="margin-top:14px;text-align:right;">
      <button onclick="exportDayCsv()" style="padding:8px 18px;background:#6b7280;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;">CSV出力</button>
    </div>
  </div>
</div>

<!-- 集計モーダル -->
<div id="count-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1002;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:24px;width:100%;max-width:360px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div>
        <h3 id="count-modal-name" style="font-size:16px;font-weight:bold;color:#1e3a5f;"></h3>
        <div style="font-size:11px;color:#6b7280;">月度内の区分集計</div>
      </div>
      <button onclick="closeCount()" style="color:#6b7280;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div id="count-modal-body"></div>
  </div>
</div>

<!-- 保存成功トースト -->
<div id="save-toast" style="display:none;position:fixed;bottom:24px;right:24px;background:#166534;color:white;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.25);"></div>

<style>
  .btn-nav { padding:6px 14px;background:#4b6cb7;color:white;border-radius:6px;text-decoration:none;font-size:13px; }
  .btn-nav:hover { background:#3b5aa3; }
  .btn-primary { padding:6px 14px;background:#2563eb;color:white;border-radius:6px;text-decoration:none;font-size:13px; }
  .btn-secondary { padding:6px 14px;background:#6b7280;color:white;border-radius:6px;text-decoration:none;font-size:13px; }
  .sc:active { opacity:0.6; }
  /* 未保存変更セルのインジケーター */
  .sc[data-pending="true"] { outline:2px dashed #f59e0b !important; position:relative; }
  /* 班長セル未保存インジケーター */
  td[data-inst][data-pending="true"] { outline:2px dashed #f59e0b !important; }
</style>

<script>
// ===== STATE =====
var _currentCell = null;
var _currentFocus = 'am'; // 'am' | 'pm' | 'coach'
var _isInstMode = false;  // 班長モーダルが開いているか
var _dayListData = [];
var _isEditMode = false;
var _pendingChanges = {}; // key: "empId_date"
var _heartbeatTimer = null;
var _lockCheckTimer = null;
var _year = ${year};
var _month = ${month};

var _st = ${JSON.stringify(scheduleTypes.map(t => ({ code: t.code, color: t.color, target: t.target ?? null }))).replace(/</g,'\\u003C').replace(/>/g,'\\u003E').replace(/\//g,'\\u002F')};
var colorMap = Object.fromEntries(_st.map(function(t) { return [t.code, t.color]; }));
var periodStart = '${periodStart}';
var periodEnd   = '${periodEnd}';

var _seqDates = ${JSON.stringify(dates).replace(/</g,'\\u003C').replace(/>/g,'\\u003E').replace(/\//g,'\\u002F')};
var _currentSeqDate = '';
var _instPendingChanges = {};

var _instPresets = [
  { code: '当直', color: '#c7d2fe' },
  { code: '明け', color: '#bfdbfe' },
  { code: '公休', color: '#e5e7eb' },
  { code: '休',   color: '#f3f4f6' },
  { code: '実研', color: '#dbeafe' },
  { code: '内勤', color: '#e0e7ff' },
  { code: '出勤', color: '#bbf7d0' },
];
var _origPresetHTML = null;

// ===== UTILS =====
function sel(selector) { return document.querySelector(selector); }
function escH(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ===== 編集モード =====
async function startEdit() {
  var btn = sel('#edit-start-btn');
  btn.disabled = true;
  btn.textContent = '確認中...';
  try {
    // ロック確認
    var r = await fetch('/api/shift/lock?year=' + _year + '&month=' + _month);
    var d = await r.json();
    if (d.locked) {
      showLockBar(escH(d.admin_name) + ' さんが編集中のため、編集できません');
      return;
    }
    // ロック取得
    var r2 = await fetch('/api/shift/lock', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ year: _year, month: _month })
    });
    var d2 = await r2.json();
    if (!d2.ok) {
      showLockBar(escH(d2.admin_name || '他の管理者') + ' さんが編集中のため、編集できません');
      return;
    }
    // 編集モード開始
    _isEditMode = true;
    sel('#edit-start-btn').style.display = 'none';
    sel('#edit-mode-bar').style.display = 'flex';
    sel('#lock-status-bar').style.display = 'none';
    clearInterval(_lockCheckTimer);
    // ハートビート（2分ごとにロックを延長）
    _heartbeatTimer = setInterval(function() {
      fetch('/api/shift/lock', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ year: _year, month: _month })
      });
    }, 2 * 60 * 1000);
    window.addEventListener('beforeunload', _beforeUnload);
  } finally {
    if (_isEditMode) {
      btn.textContent = '編集モードを開始';
    } else {
      btn.disabled = false;
      btn.textContent = '編集モードを開始';
    }
  }
}

function _beforeUnload(e) {
  var hasChanges = Object.keys(_pendingChanges).length > 0;
  // ロック解放（ベストエフォート）
  navigator.sendBeacon('/api/shift/lock-release', JSON.stringify({ year: _year, month: _month }));
  if (hasChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
}

async function batchSave() {
  var count = Object.keys(_pendingChanges).length;
  if (count === 0) return;

  var btn = sel('#batch-save-btn');
  btn.disabled = true;
  btn.textContent = '保存中...';
  sel('#edit-error').style.display = 'none';

  try {
    var entries = Object.values(_pendingChanges);
    var res = await fetch('/api/shift/batch', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ entries: entries })
    });
    if (!res.ok) throw new Error('server');

    // 未保存マークを解除
    Object.keys(_pendingChanges).forEach(function(key) {
      var idx = key.indexOf('_');
      var empId = key.substring(0, idx);
      var date  = key.substring(idx + 1);
      clearPendingMark(empId, date);
    });
    _pendingChanges = {};

    // ロック解放
    await fetch('/api/shift/lock-release', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ year: _year, month: _month })
    });

    _exitEditMode();
    showToast('保存しました');
  } catch(e) {
    sel('#edit-error').textContent = '保存に失敗しました。もう一度お試しください。';
    sel('#edit-error').style.display = 'block';
    btn.disabled = false;
    btn.textContent = '一括保存';
    _updateBatchSaveBtn();
  }
}

async function cancelEdit() {
  var count = Object.keys(_pendingChanges).length;
  if (count > 0 && !confirm(count + '件の未保存変更を破棄しますか？')) return;

  // ロック解放
  try {
    await fetch('/api/shift/lock-release', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ year: _year, month: _month })
    });
  } catch(e) {}

  _exitEditMode();

  if (count > 0) {
    location.reload();
  }
}

function _exitEditMode() {
  _isEditMode = false;
  clearInterval(_heartbeatTimer);
  _heartbeatTimer = null;
  var btn = sel('#edit-start-btn');
  btn.style.display = '';
  btn.disabled = false;
  btn.textContent = '編集モードを開始';
  sel('#edit-mode-bar').style.display = 'none';
  sel('#edit-error').style.display = 'none';
  window.removeEventListener('beforeunload', _beforeUnload);
  // ロック確認ポーリング再開
  _startLockCheckPolling();
}

function _updatePendingCount() {
  var count = Object.keys(_pendingChanges).length;
  sel('#pending-count-label').textContent = '変更 ' + count + '件';
  _updateBatchSaveBtn();
}

function _updateBatchSaveBtn() {
  var btn = sel('#batch-save-btn');
  var count = Object.keys(_pendingChanges).length;
  btn.disabled = count === 0;
  btn.style.opacity = count === 0 ? '0.5' : '1';
}

function setPendingMark(empId, date) {
  ['am', 'pm', 'coach'].forEach(function(row) {
    var td = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="' + row + '"]');
    if (td) td.dataset.pending = 'true';
  });
}

function clearPendingMark(empId, date) {
  ['am', 'pm', 'coach'].forEach(function(row) {
    var td = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="' + row + '"]');
    if (td) delete td.dataset.pending;
  });
}

function showLockBar(msg) {
  var el = sel('#lock-status-bar');
  el.textContent = msg;
  el.style.display = 'block';
}

function showToast(msg) {
  var el = sel('#save-toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(function() { el.style.display = 'none'; }, 3000);
}

// ロック状態のポーリング（30秒ごと、編集モード外のみ）
function _startLockCheckPolling() {
  clearInterval(_lockCheckTimer);
  _lockCheckTimer = setInterval(function() {
    if (_isEditMode) return;
    fetch('/api/shift/lock?year=' + _year + '&month=' + _month)
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var bar = sel('#lock-status-bar');
        var startBtn = sel('#edit-start-btn');
        if (d.locked) {
          bar.textContent = escH(d.admin_name) + ' さんが編集中です';
          bar.style.display = 'block';
          startBtn.disabled = true;
        } else {
          bar.style.display = 'none';
          startBtn.disabled = false;
        }
      }).catch(function() {});
  }, 30 * 1000);
}
_startLockCheckPolling();

// ===== セル編集 =====
function openEditor(td) {
  if (!_isEditMode) {
    showToast('編集モードを開始してください');
    return;
  }
  _currentCell = td;
  _currentFocus = td.dataset.row; // 'am' | 'pm' | 'coach'
  var empId = td.dataset.emp, date = td.dataset.date, name = td.dataset.name;
  var amTd    = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="am"]');
  var pmTd    = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="pm"]');
  var coachTd = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="coach"]');
  sel('#modal-emp-name').textContent = name;
  var dow = ['日','月','火','水','木','金','土'][new Date(date).getUTCDay()];
  sel('#modal-date-label').textContent = date + '（' + dow + '）';
  sel('#modal-am').value    = amTd ? amTd.textContent.trim() : '';
  sel('#modal-pm').value    = pmTd ? pmTd.textContent.trim() : '';
  sel('#modal-coach').value = coachTd && coachTd.dataset.coachId ? coachTd.dataset.coachId : '';
  sel('#modal-error').style.display = 'none';
  _currentSeqDate = date;
  _updateSeqNavBtns(date);
  sel('#cell-modal').style.display = 'flex';
  setTimeout(function() {
    if (_currentFocus === 'coach') sel('#modal-coach').focus();
    else if (_currentFocus === 'pm') sel('#modal-pm').focus();
    else sel('#modal-am').focus();
  }, 60);
  document.onkeydown = function(e) { if(e.key === 'Escape') closeModal(); };
}

function openInstEditor(td) {
  if (!_isEditMode) {
    showToast('編集モードを開始してください');
    return;
  }
  _currentCell = td;
  _currentFocus = 'inst';
  _isInstMode = true;
  var instId = td.dataset.inst, date = td.dataset.date;
  var mainTd = sel('td[data-inst="' + instId + '"][data-date="' + date + '"][data-row="1"]');
  var noteTd = sel('td[data-inst="' + instId + '"][data-date="' + date + '"][data-row="2"]');
  var instName = (mainTd && mainTd.dataset.instName) ? mainTd.dataset.instName : '班長・指導者';
  sel('#modal-emp-name').textContent = instName;
  var dow = ['日','月','火','水','木','金','土'][new Date(date).getUTCDay()];
  sel('#modal-date-label').textContent = date + '（' + dow + '）';
  sel('#modal-am').value    = mainTd ? (mainTd.dataset.value ?? mainTd.textContent.trim()) : '';
  sel('#modal-pm').value    = noteTd ? noteTd.textContent.trim() : '';
  sel('#modal-coach').value = '';
  // プリセットを班長用に切り替え
  if (!_origPresetHTML) _origPresetHTML = sel('#preset-buttons').innerHTML;
  sel('#preset-buttons').innerHTML = _instPresets.map(function(p) {
    return '<button data-code="' + escH(p.code) + '" onclick="selectPreset(this.dataset.code)" style="padding:6px 11px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;background:' + p.color + ';touch-action:manipulation;"'
      + ' onmouseover="this.style.opacity=0.7" onmouseout="this.style.opacity=1">' + escH(p.code) + '</button>';
  }).join('');
  // 研修担当欄を非表示、ラベルを班長用に変更
  sel('#modal-coach-wrap').style.display = 'none';
  sel('#modal-am-label').textContent = 'シフト';
  sel('#modal-pm-label').textContent = 'メモ';
  sel('#modal-error').style.display = 'none';
  _currentSeqDate = date;
  _updateSeqNavBtns(date);
  sel('#cell-modal').style.display = 'flex';
  document.onkeydown = function(e) { if(e.key === 'Escape') closeModal(); };
}

// ===== 連続入力モード =====
function _updateSeqNavBtns(date) {
  var idx = _seqDates.indexOf(date);
  var prev = sel('#seq-prev');
  var next = sel('#seq-next');
  if (prev) prev.disabled = idx <= 0;
  if (next) next.disabled = idx >= _seqDates.length - 1;
}

function seqNav(dir) {
  var idx = _seqDates.indexOf(_currentSeqDate);
  if (idx < 0) return;
  var nextIdx = idx + dir;
  if (nextIdx < 0 || nextIdx >= _seqDates.length) return;

  var am = sel('#modal-am').value.trim();
  var pm = sel('#modal-pm').value.trim();
  var date = _currentSeqDate;
  var nextDate = _seqDates[nextIdx];

  if (_isInstMode) {
    // 班長セル: _instPendingChanges に蓄積
    var instId = _currentCell.dataset.inst;
    var key = instId + '_' + date;
    _instPendingChanges[key] = { instructor_id: parseInt(instId), date: date, entry: am || null, note: pm || null };
    var mTd = sel('td[data-inst="' + instId + '"][data-date="' + date + '"][data-row="1"]');
    var nTd = sel('td[data-inst="' + instId + '"][data-date="' + date + '"][data-row="2"]');
    if (mTd) { mTd.textContent = (am === '出勤' ? '' : am); mTd.dataset.value = am; mTd.style.background = (colorMap[am] || (am ? '#fff7ed' : '#faf5ff')); mTd.dataset.pending = 'true'; }
    if (nTd) { nTd.textContent = pm; nTd.dataset.pending = 'true'; }
    // 次の班長セルへ（openInstEditor を呼ばずにモーダル内容だけ更新）
    var nextTd = sel('td[data-inst="' + instId + '"][data-date="' + nextDate + '"][data-row="1"]');
    if (nextTd) {
      _currentCell = nextTd;
      var nextNoteTd = sel('td[data-inst="' + instId + '"][data-date="' + nextDate + '"][data-row="2"]');
      var dow = ['日','月','火','水','木','金','土'][new Date(nextDate).getUTCDay()];
      sel('#modal-date-label').textContent = nextDate + '（' + dow + '）';
      sel('#modal-am').value = nextTd.dataset.value ?? nextTd.textContent.trim();
      sel('#modal-pm').value = nextNoteTd ? nextNoteTd.textContent.trim() : '';
      sel('#modal-error').style.display = 'none';
      _currentSeqDate = nextDate;
      _updateSeqNavBtns(nextDate);
    }
  } else {
    // 新人セル: 編集モードが必要
    if (!_isEditMode) { showToast('編集モードを開始してください'); return; }
    var empId = _currentCell.dataset.emp;
    var coachId = sel('#modal-coach').value;
    var key = empId + '_' + date;
    _pendingChanges[key] = { emp_id: parseInt(empId), date: date, entry_am: am || null, entry_pm: pm || null, coach_id: coachId ? parseInt(coachId) : null };
    var amTd  = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="am"]');
    var pmTd  = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="pm"]');
    var cTd   = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="coach"]');
    if (amTd)  { amTd.textContent  = am; amTd.style.background  = colorMap[am]  || (am  ? '#fff7ed' : '#ffffff'); amTd.dataset.pending  = 'true'; }
    if (pmTd)  { pmTd.textContent  = pm; pmTd.style.background  = colorMap[pm]  || (pm  ? '#fff7ed' : 'transparent'); pmTd.dataset.pending  = 'true'; }
    if (cTd) {
      var opt = sel('#modal-coach option[value="' + coachId + '"]');
      cTd.textContent = opt ? opt.textContent : '';
      cTd.dataset.coachId = coachId;
      cTd.dataset.pending = 'true';
    }
    _updatePendingCount();
    // 次の新人セルへ
    var nextTd = sel('.sc[data-emp="' + empId + '"][data-date="' + nextDate + '"][data-row="am"]');
    if (nextTd) { _currentCell = nextTd; openEditor(nextTd); }
  }
}

async function _flushInstPending() {
  var keys = Object.keys(_instPendingChanges);
  if (keys.length === 0) return;
  var toSave = Object.values(_instPendingChanges);
  _instPendingChanges = {};
  for (var i = 0; i < toSave.length; i++) {
    var ch = toSave[i];
    try {
      await fetch('/api/instructor-schedule', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ instructor_id: ch.instructor_id, date: ch.date, entry: ch.entry, note: ch.note })
      });
      var mTd = sel('td[data-inst="' + ch.instructor_id + '"][data-date="' + ch.date + '"][data-row="1"]');
      var nTd = sel('td[data-inst="' + ch.instructor_id + '"][data-date="' + ch.date + '"][data-row="2"]');
      if (mTd) delete mTd.dataset.pending;
      if (nTd) delete nTd.dataset.pending;
    } catch(e) {}
  }
}

function selectPreset(value) {
  if (_currentFocus === 'pm') {
    sel('#modal-pm').value = value;
    sel('#modal-pm').focus();
  } else if (_currentFocus === 'coach') {
    // コーチ欄にプリセットは適用しない。午前に入れる
    sel('#modal-am').value = value;
    sel('#modal-am').focus();
    _currentFocus = 'am';
  } else {
    sel('#modal-am').value = value;
    sel('#modal-am').focus();
    _currentFocus = 'am';
  }
}

function closeModal() {
  sel('#cell-modal').style.display = 'none';
  _currentCell = null;
  document.onkeydown = null;
  // 班長モーダルで変えた要素を元に戻す
  if (_origPresetHTML) {
    sel('#preset-buttons').innerHTML = _origPresetHTML;
    _origPresetHTML = null;
  }
  _isInstMode = false;
  sel('#modal-coach-wrap').style.display = '';
  sel('#modal-am-label').textContent = '午前 — 研修内容';
  sel('#modal-pm-label').textContent = '午後 — 研修内容';
  // 班長の蓄積変更を一括保存（✕で閉じた場合）
  _flushInstPending();
}

// 班長セルの保存（連続入力の蓄積分も含めて一括保存）
async function saveInstCell() {
  var btn = sel('#save-cell-btn');
  btn.disabled = true;
  btn.textContent = '保存中...';
  try {
    var am = sel('#modal-am').value.trim();
    var pm = sel('#modal-pm').value.trim();
    var instId   = _currentCell.dataset.inst;
    var instDate = _currentCell.dataset.date;

    // 現在のセルを蓄積に追加（連続入力の最終セル含め一括保存）
    var key = instId + '_' + instDate;
    _instPendingChanges[key] = { instructor_id: parseInt(instId), date: instDate, entry: am || null, note: pm || null };

    // 蓄積を全件保存
    var toSave = Object.values(_instPendingChanges);
    _instPendingChanges = {};
    var hasError = false;
    for (var i = 0; i < toSave.length; i++) {
      var ch = toSave[i];
      var res = await fetch('/api/instructor-schedule', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ instructor_id: ch.instructor_id, date: ch.date, entry: ch.entry, note: ch.note })
      });
      if (!res.ok) { hasError = true; continue; }
      var mTd = sel('td[data-inst="' + ch.instructor_id + '"][data-date="' + ch.date + '"][data-row="1"]');
      var nTd = sel('td[data-inst="' + ch.instructor_id + '"][data-date="' + ch.date + '"][data-row="2"]');
      if (mTd) { var ev = ch.entry ?? ''; mTd.textContent = (ev === '出勤' ? '' : ev); mTd.dataset.value = ev; mTd.style.background = (colorMap[ev] || (ev ? '#fff7ed' : '#faf5ff')); delete mTd.dataset.pending; }
      if (nTd) { nTd.textContent = ch.note  ?? ''; delete nTd.dataset.pending; }
    }
    if (hasError) throw new Error();
    // モーダルを閉じる（_flushInstPending は空なのでスキップされる）
    closeModal();
    showToast('保存しました');
  } catch(e) {
    sel('#modal-error').textContent = 'ネットワークエラーです。もう一度お試しください。';
    sel('#modal-error').style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = '適用';
  }
}

// セル変更をローカルに蓄積
function applyCell() {
  if (_isInstMode) {
    saveInstCell();
    return;
  }

  var am      = sel('#modal-am').value.trim();
  var pm      = sel('#modal-pm').value.trim();
  var coachId = sel('#modal-coach').value;
  var empId   = _currentCell.dataset.emp;
  var date    = _currentCell.dataset.date;

  var key = empId + '_' + date;
  _pendingChanges[key] = {
    emp_id:    parseInt(empId),
    date:      date,
    entry_am:  am || null,
    entry_pm:  pm || null,
    coach_id:  coachId ? parseInt(coachId) : null
  };

  // セルのDOM更新
  var amTd    = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="am"]');
  var pmTd    = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="pm"]');
  var coachTd = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="coach"]');
  if (amTd) { amTd.textContent = am; amTd.style.background = colorMap[am] || (am ? '#fff7ed' : '#ffffff'); }
  if (pmTd) { pmTd.textContent = pm; pmTd.style.background = colorMap[pm] || (pm ? '#fff7ed' : 'transparent'); }
  if (coachTd) {
    var opt = sel('#modal-coach option[value="' + coachId + '"]');
    coachTd.textContent = opt ? opt.textContent : '';
    coachTd.dataset.coachId = coachId;
  }

  // 未保存マークを付ける
  setPendingMark(empId, date);
  _updatePendingCount();
  closeModal();
}

function clearCell() {
  sel('#modal-am').value    = '';
  sel('#modal-pm').value    = '';
  sel('#modal-coach').value = '';
  applyCell();
}

// ===== 日別出勤者 =====
function openDayList(date) {
  var cells = document.querySelectorAll('.sc[data-date="' + date + '"][data-row="am"]');
  _dayListData = [];
  var dow = ['日','月','火','水','木','金','土'][new Date(date).getUTCDay()];
  sel('#day-modal-title').textContent = date + '（' + dow + '）出勤者一覧';
  cells.forEach(function(td) {
    var empId = td.dataset.emp;
    var pmTd    = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="pm"]');
    var coachTd = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="coach"]');
    var am = td.textContent.trim();
    var pm = pmTd ? pmTd.textContent.trim() : '';
    var coach = coachTd ? coachTd.textContent.trim() : '';
    if (am || pm || coach) _dayListData.push({ name: td.dataset.name, am: am, pm: pm, coach: coach });
  });
  if (_dayListData.length === 0) {
    sel('#day-modal-body').innerHTML = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:20px;">この日のデータがありません</div>';
  } else {
    var rows = _dayListData.map(function(r) {
      return '<tr>'
        + '<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">' + escH(r.name) + '</td>'
        + '<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:12px;">' + escH(r.am) + '</td>'
        + '<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:12px;">' + escH(r.pm) + '</td>'
        + '<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;">' + escH(r.coach) + '</td>'
        + '</tr>';
    }).join('');
    sel('#day-modal-body').innerHTML =
      '<div style="font-size:12px;color:#6b7280;margin-bottom:6px;">' + _dayListData.length + '名</div>'
      + '<table style="width:100%;border-collapse:collapse;">'
      + '<thead><tr style="background:#f8fafc;">'
      + '<th style="padding:5px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:2px solid #e5e7eb;">氏名</th>'
      + '<th style="padding:5px 10px;text-align:left;font-size:11px;color:#059669;border-bottom:2px solid #e5e7eb;">午前</th>'
      + '<th style="padding:5px 10px;text-align:left;font-size:11px;color:#d97706;border-bottom:2px solid #e5e7eb;">午後</th>'
      + '<th style="padding:5px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:2px solid #e5e7eb;">研修担当</th>'
      + '</tr></thead>'
      + '<tbody>' + rows + '</tbody></table>';
  }
  sel('#day-modal').style.display = 'flex';
  document.onkeydown = function(e) { if(e.key==='Escape') closeDayModal(); };
}

function closeDayModal() {
  sel('#day-modal').style.display = 'none';
  document.onkeydown = null;
}

function exportDayCsv() {
  var title = sel('#day-modal-title').textContent;
  var parenIdx = title.indexOf('（');
  var date = parenIdx > 0 ? title.substring(0, parenIdx) : title;
  var NL  = String.fromCharCode(10);
  var BOM = String.fromCharCode(65279);
  var hdr = '氏名,午前,午後,研修担当';
  var rows = _dayListData.map(function(r) {
    return [r.name, r.am, r.pm, r.coach].map(function(v) {
      return '"' + v.replace(/"/g, '""') + '"';
    }).join(',');
  });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([BOM + hdr + NL + rows.join(NL)], { type: 'text/csv;charset=utf-8' }));
  a.download = 'attendance_' + date + '.csv';
  a.click();
}

// ===== 集計 =====
var scheduleTargets = Object.fromEntries(_st.map(function(t) { return [t.code, t.target]; }));
function openCount(empId, name) {
  var cells = document.querySelectorAll('.sc[data-emp="' + empId + '"][data-row="am"]');
  var counts = {};
  cells.forEach(function(td) {
    var date = td.dataset.date;
    if (date < periodStart || date > periodEnd) return;
    var am = td.textContent.trim();
    if (am) counts[am] = (counts[am] || 0) + 1;
    var pmTd = sel('.sc[data-emp="' + empId + '"][data-date="' + date + '"][data-row="pm"]');
    var pm = pmTd ? pmTd.textContent.trim() : '';
    if (pm) counts[pm] = (counts[pm] || 0) + 1;
  });
  var allKeys = Object.keys(scheduleTargets).concat(Object.keys(counts));
  var seen = {}, allCodes = [];
  allKeys.forEach(function(c) { if (!seen[c] && (counts[c] || scheduleTargets[c])) { seen[c]=1; allCodes.push(c); } });
  var rows = '', allMet = true;
  allCodes.forEach(function(code) {
    var cnt    = counts[code] || 0;
    var target = scheduleTargets[code];
    var color  = colorMap[code] || '#f3f4f6';
    var met    = target == null || cnt >= target;
    if (target != null && !met) allMet = false;
    var pct = target ? Math.min(100, Math.round(cnt / target * 100)) : 0;
    rows += '<div style="margin-bottom:10px;">'
      + '<div style="display:flex;justify-content:space-between;margin-bottom:3px;">'
      + '<span style="background:' + color + ';padding:2px 10px;border-radius:4px;font-size:13px;font-weight:600;">' + escH(code) + '</span>'
      + '<span style="font-size:13px;font-weight:700;color:' + (met ? '#166534' : '#c2410c') + ';">'
      + cnt + '回' + (target ? ' / ' + target + '回' : '') + '</span></div>'
      + (target ? '<div style="background:#e5e7eb;border-radius:99px;height:8px;overflow:hidden;">'
        + '<div style="background:' + (met ? '#22c55e' : '#f97316') + ';width:' + pct + '%;height:100%;border-radius:99px;"></div></div>'
        + '<div style="font-size:11px;color:' + (met ? '#166534' : '#c2410c') + ';text-align:right;margin-top:2px;">'
        + (met ? '達成' : '残り ' + (target - cnt) + '回') + '</div>' : '')
      + '</div>';
  });
  if (!rows) rows = '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:16px;">データがありません</div>';
  sel('#count-modal-name').textContent = name;
  sel('#count-modal-body').innerHTML =
    (allMet
      ? '<div style="background:#f0fdf4;color:#166534;padding:8px 12px;border-radius:6px;font-size:12px;font-weight:600;margin-bottom:12px;">すべての目標を達成</div>'
      : '<div style="background:#fff7ed;color:#c2410c;padding:8px 12px;border-radius:6px;font-size:12px;font-weight:600;margin-bottom:12px;">未達成の目標あり</div>'
    ) + rows;
  sel('#count-modal').style.display = 'flex';
  document.onkeydown = function(e) { if(e.key==='Escape') closeCount(); };
}
function closeCount() {
  sel('#count-modal').style.display = 'none';
  document.onkeydown = null;
}

function changeStatusBtn(btn) {
  var id   = parseInt(btn.dataset.eid);
  var name = btn.dataset.ename;
  changeStatus(id, name, 'completed');
}
function openCountBtn(btn) {
  var id   = parseInt(btn.dataset.eid);
  var name = btn.dataset.ename;
  openCount(id, name);
}
async function changeStatus(empId, name, status) {
  var msg = status === 'completed'
    ? name + ' を「研修終了」にしますか？（シフト管理画面から非表示になります）'
    : name + ' のステータスを変更しますか？';
  if (!confirm(msg)) return;
  var res = await fetch('/api/employees/' + empId, {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ status: status })
  });
  if (res.ok) location.reload();
  else alert('処理に失敗しました。');
}
</script>`;
}
