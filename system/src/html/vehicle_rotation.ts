// 配車管理：車両ローテーション表
// 車両を軸に、数日先までの使用予定・点検・前後勤務の詰まりを時系列で確認する読み取り専用画面。
// セルをクリックすると、該当日・該当車両を含む配車ボードへ遷移する。
import { escHtml } from './layout';
import { ADMIN_PATH } from '../config';
import type { DispatchLimitInfo } from './dispatch_board';

export type RotationVehicleRow = { car_no: string; team: number };
export type RotationCell = { shift_code: string; emp_code: string | null; member_name: string | null };
export type RotationAlertLevel = 'normal' | 'caution' | 'strong_caution' | 'overlap';

const ALERT_COLOR: Record<RotationAlertLevel, string> = {
  normal: 'transparent', caution: '#fbbf24', strong_caution: '#f97316', overlap: '#ef4444',
};

export function vehicleRotationPage(args: {
  start: string; days: number; ka: string; team: string; allTeams: number[];
  vehicles: RotationVehicleRow[]; dates: string[];
  cellsByCarDate: Record<string, Record<string, RotationCell[]>>; // car_no -> date -> cells(複数勤務がありうる)
  boundaryAlerts: Record<string, Record<string, RotationAlertLevel>>; // car_no -> date -> その日1件目出庫の前日境界アラート
  limits: Record<string, Record<string, DispatchLimitInfo>>; // car_no -> date -> 点検制限情報
}): string {
  const { start, days, ka, team, allTeams, vehicles, dates, cellsByCarDate, boundaryAlerts, limits } = args;

  const kaOptions = [1, 2, 3, 4].map(k => `<option value="${k}" ${ka === String(k) ? 'selected' : ''}>${k}課</option>`).join('');
  const kaNum = /^[1-4]$/.test(ka) ? parseInt(ka, 10) : null;
  const teamChoices = kaNum ? allTeams.filter(t => Math.ceil(t / 2) === kaNum) : allTeams;
  const teamOptions = teamChoices.map(t => `<option value="${t}" ${team === String(t) ? 'selected' : ''}>${t}班</option>`).join('');

  const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];
  function dateHeader(d: string): string {
    const dt = new Date(d + 'T00:00:00Z');
    const dow = dt.getUTCDay();
    const bg = dow === 0 ? '#fef2f2' : dow === 6 ? '#eff6ff' : '#f8fafc';
    return `<th style="min-width:96px;font-size:10px;padding:4px 2px;border:1px solid #4b6cb7;background:${bg};color:#1e3a5f;">
      <div>${d.slice(5)}</div><div style="color:${dow === 0 ? '#ef4444' : dow === 6 ? '#3b82f6' : '#6b7280'};">${WEEKDAY_JA[dow]}</div>
    </th>`;
  }

  function cellHtml(carNo: string, d: string, idx: number, total: number): string {
    const cells = (cellsByCarDate[carNo]?.[d]) ?? [];
    const cell = cells[idx];
    const limit = limits[carNo]?.[d];
    const boundary = idx === 0 ? (boundaryAlerts[carNo]?.[d] ?? 'normal') : 'normal';
    const borderTop = boundary !== 'normal' ? `border-top:3px solid ${ALERT_COLOR[boundary]};` : '';
    if (!cell) {
      if (idx > 0) return '';
      const limitBadge = limit && limit.status !== 'none'
        ? `<div style="font-size:8px;color:${limit.status === 'blocked' ? '#991b1b' : '#9a3412'};">${limit.status === 'blocked' ? '終日不可' : '点検〜' + (limit.usableFrom ?? '')}</div>` : '';
      return `<td rowspan="${total}" style="border:1px solid #d1d5db;padding:4px;text-align:center;color:#d1d5db;font-size:11px;${borderTop}cursor:pointer;" onclick="goToBoard('${escHtml(d)}','${escHtml(carNo)}')">-${limitBadge}</td>`;
    }
    const label = `${escHtml(cell.shift_code)} ${escHtml(cell.member_name ?? cell.emp_code ?? '')}`;
    return `<td style="border:1px solid #d1d5db;padding:4px;font-size:11px;cursor:pointer;${borderTop}" onclick="goToBoard('${escHtml(d)}','${escHtml(carNo)}')" title="クリックで配車ボードへ">${label}</td>`;
  }

  const rows = vehicles.map(v => {
    const maxCellsPerDay = Math.max(1, ...dates.map(d => (cellsByCarDate[v.car_no]?.[d] ?? []).length));
    const trs: string[] = [];
    for (let idx = 0; idx < maxCellsPerDay; idx++) {
      const carCell = idx === 0
        ? `<td rowspan="${maxCellsPerDay}" style="border:1px solid #d1d5db;padding:4px 8px;font-weight:600;font-size:12px;position:sticky;left:0;background:#f8fafc;z-index:1;">${escHtml(v.car_no)}<div style="font-size:9px;color:#9ca3af;font-weight:400;">${v.team}班</div></td>`
        : '';
      trs.push(`<tr>${carCell}${dates.map(d => cellHtml(v.car_no, d, idx, maxCellsPerDay)).join('')}</tr>`);
    }
    return trs.join('');
  }).join('');

  return `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
    <h2 style="font-size:15px;font-weight:bold;color:#1e3a5f;">配車管理（車両ローテーション表）</h2>
  </div>

  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px;">
    <button onclick="changeStart(-7)" style="padding:7px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;">◀ 前週</button>
    <input type="date" id="f-start" value="${escHtml(start)}" onchange="onFilterChanged()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;">
    <button onclick="changeStart(7)" style="padding:7px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;cursor:pointer;font-size:12px;">翌週 ▶</button>

    <span style="font-size:11px;color:#6b7280;margin-left:12px;">【課】</span>
    <select id="f-ka" onchange="onKaChanged()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;background:white;">
      <option value="">全部</option>${kaOptions}
    </select>
    <span style="font-size:11px;color:#6b7280;">【班】</span>
    <select id="f-team" onchange="onFilterChanged()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;background:white;">
      <option value="">全班</option>${teamOptions}
    </select>

    <div style="margin-left:auto;display:flex;gap:10px;align-items:center;font-size:10px;color:#6b7280;">
      <span><span style="display:inline-block;width:10px;height:10px;background:#fbbf24;border-radius:2px;"></span> 注意</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#f97316;border-radius:2px;"></span> 強い注意</span>
      <span><span style="display:inline-block;width:10px;height:10px;background:#ef4444;border-radius:2px;"></span> 重複</span>
    </div>
  </div>

  <div style="overflow-x:auto;border:1px solid #d1d5db;border-radius:8px;-webkit-overflow-scrolling:touch;">
    <table style="border-collapse:collapse;">
      <thead style="position:sticky;top:0;z-index:5;">
        <tr style="background:#1e3a5f;color:white;">
          <th style="min-width:70px;position:sticky;left:0;z-index:6;background:#1e3a5f;font-size:11px;padding:5px 8px;border:1px solid #4b6cb7;">車番</th>
          ${dates.map(dateHeader).join('')}
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="${dates.length + 1}" style="padding:16px;text-align:center;color:#9ca3af;font-size:12px;">該当する車両がありません</td></tr>`}</tbody>
    </table>
  </div>
</div>

<script>
var DAYS = ${days};
function sel(s) { return document.querySelector(s); }
function onFilterChanged() {
  var start = sel('#f-start').value, ka = sel('#f-ka').value, team = sel('#f-team').value;
  location.href = '${ADMIN_PATH}/vehicle-rotation?start=' + start + (ka ? '&ka=' + ka : '') + (team ? '&team=' + team : '');
}
function onKaChanged() { sel('#f-team').value = ''; onFilterChanged(); }
function changeStart(delta) {
  var d = new Date(sel('#f-start').value + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  sel('#f-start').value = d.toISOString().slice(0, 10);
  onFilterChanged();
}
function goToBoard(date, carNo) {
  var ka = sel('#f-ka').value, team = sel('#f-team').value;
  location.href = '${ADMIN_PATH}/dispatch-board?date=' + date + (ka ? '&ka=' + ka : '') + (team ? '&team=' + team : '');
}
</script>`;
}
