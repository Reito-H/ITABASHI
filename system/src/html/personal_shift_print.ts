// 個人別シフト表の印刷帳票（複数人まとめてA4縦1人1ページで印刷）
// 元の「◆勤務予定表◆」PDF（1人1ページ・左右2カラム）の見た目をそのまま再現する。
import { escHtml, FAVICON_DATA_URI } from './layout';
import { getHolidayName } from '../utils/taxi_calendar';

export type PersonalShiftPrintMember = {
  emp_code: string;
  name: string;
  car_no: string | null;
  division: string;
  team: number;
  sheet_left_days: number | null;
};

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

function dowInfo(date: string): { label: string; bg: string } {
  const dt = new Date(date + 'T00:00:00Z');
  const dow = dt.getUTCDay();
  const holiday = getHolidayName(date);
  if (holiday) return { label: '祝', bg: '#fbdce4' };
  if (dow === 0) return { label: '日', bg: '#fbdce4' };
  if (dow === 6) return { label: '土', bg: '#dfe3f7' };
  return { label: WEEKDAY_JA[dow], bg: '#ffffff' };
}

export function personalShiftPrintPage(
  members: PersonalShiftPrintMember[],
  shiftMap: Record<string, string>,  // key: `${emp_code}_${date}`
  types: Array<{ code: string; label: string; count_weight: number }>,
  dates: string[],
  startDate: string,
  endDate: string,
  printedAt: string,
): string {
  const weightMap: Record<string, number> = {};
  for (const t of types) weightMap[t.code] = t.count_weight;

  const [endYear, endMonth] = endDate.split('-');

  const sheets = members.map((m, idx) => {
    const half = m.sheet_left_days && m.sheet_left_days > 0 && m.sheet_left_days < dates.length
      ? m.sheet_left_days
      : Math.ceil(dates.length / 2);
    const leftDates = dates.slice(0, half);
    const rightDates = dates.slice(half);
    const maxLen = Math.max(leftDates.length, rightDates.length);
    const shortSide: 'L' | 'R' = leftDates.length <= rightDates.length ? 'L' : 'R';
    const shortLen = Math.min(leftDates.length, rightDates.length);

    const workCount = dates.reduce((sum, d) => {
      const code = shiftMap[`${m.emp_code}_${d}`];
      return sum + (code ? (weightMap[code] ?? 0) : 0);
    }, 0);
    const workCountLabel = Number.isInteger(workCount) ? String(workCount) : workCount.toFixed(1);

    const dataCell = (d: string) => {
      const code = shiftMap[`${m.emp_code}_${d}`] || '';
      const dt = new Date(d + 'T00:00:00Z');
      const { label, bg } = dowInfo(d);
      return `<td class="ot-td ot-date" style="background:${bg}">${String(dt.getUTCDate()).padStart(2, '0')}</td>
        <td class="ot-td ot-dow" style="background:${bg}">${label}</td>
        <td class="ot-td ot-code">${escHtml(code)}</td>
        <td class="ot-td ot-money"></td>
        <td class="ot-td ot-money"></td>`;
    };
    const emptyCell = () => `<td class="ot-td"></td><td class="ot-td"></td><td class="ot-td"></td><td class="ot-td"></td><td class="ot-td"></td>`;
    const workCountCell = () => `<td class="ot-td ot-worklabel" colspan="2">勤務数：</td><td class="ot-td ot-code">${workCountLabel}</td><td class="ot-td"></td><td class="ot-td"></td>`;

    let rowsHtml = '';
    for (let i = 0; i < maxLen; i++) {
      const leftHtml = i < leftDates.length ? dataCell(leftDates[i]) : (shortSide === 'L' && i === shortLen ? workCountCell() : emptyCell());
      const rightHtml = i < rightDates.length ? dataCell(rightDates[i]) : (shortSide === 'R' && i === shortLen ? workCountCell() : emptyCell());
      rowsHtml += `<tr>${leftHtml}${rightHtml}</tr>`;
    }
    // 左右どちらのカラムも実データで埋まっている（同数）場合は最終行の後ろに勤務数行を追加
    if (leftDates.length === rightDates.length) {
      rowsHtml += `<tr>${emptyCell()}${workCountCell()}</tr>`;
    }

    return `
    <div class="sheet" style="${idx > 0 ? 'page-break-before:always;' : ''}">
      <div class="ot-title">◆　勤　務　予　定　表　◆</div>
      <div class="ot-subhead">
        <span>${endYear}年${parseInt(endMonth, 10)}月分　（${escHtml(startDate.replace(/-/g,'/'))} ～ ${escHtml(endDate.replace(/-/g,'/'))}）</span>
        <span>${escHtml(m.division)} ${m.team}班　${escHtml(m.emp_code)}${escHtml(m.name)}　　様</span>
      </div>
      <table class="ot-table">
        <thead>
          <tr>
            <th>日付</th><th>曜日</th><th>勤務</th><th>営業収入</th><th>累　計</th>
            <th>日付</th><th>曜日</th><th>勤務</th><th>営業収入</th><th>累　計</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="ot-foot">
        <div class="ot-contact">連絡事項</div>
        <div class="ot-company">印刷日時<br>${escHtml(printedAt)}</div>
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>個人別シフト表 印刷</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #111827; }
  .toolbar { position: sticky; top: 0; z-index: 10; background: #1e3a5f; padding: 10px 16px; display: flex; gap: 8px; align-items: center; }
  .toolbar button { font-size: 13px; padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; font-weight: 600; background: #2563eb; color: #fff; }
  .toolbar .hint { margin-left: auto; font-size: 12px; color: #cbd5e1; }
  .stage { padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 16px; }

  .sheet { width: 297mm; min-height: 210mm; background: #fff; padding: 14mm 16mm; box-shadow: 0 4px 20px rgba(0,0,0,0.25); }
  .ot-title { text-align: center; font-size: 17px; font-weight: 700; letter-spacing: 6px; margin-bottom: 10px; }
  .ot-subhead { display: flex; justify-content: space-between; font-size: 12.5px; margin-bottom: 6px; }

  .ot-table { width: 100%; border-collapse: collapse; font-size: 11.5px; table-layout: fixed; }
  .ot-table th { border: 1px solid #333; padding: 3px 2px; font-weight: 600; background: #fff; }
  .ot-td { border: 1px solid #333; padding: 3px 2px; text-align: center; height: 18px; }
  .ot-date { width: 7%; }
  .ot-dow { width: 6%; }
  .ot-code { width: 7%; font-weight: 700; }
  .ot-money { width: 15%; }
  .ot-worklabel { text-align: left; padding-left: 6px; }

  .ot-foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 10px; }
  .ot-contact { border: 1px solid #333; width: 60%; height: 22mm; padding: 3px 8px; font-size: 12px; position: relative; }
  .ot-company { font-size: 11px; text-align: right; color: #374151; line-height: 1.6; }

  @page { size: A4 landscape; margin: 0; }
  @media print {
    html, body { background: #fff; }
    .toolbar { display: none; }
    .stage { padding: 0; gap: 0; }
    .sheet { box-shadow: none; width: auto; min-height: auto; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">🖨 印刷 / PDF保存</button>
    <span class="hint">${members.length}名分</span>
  </div>
  <div class="stage">
    ${sheets}
  </div>
</body>
</html>`;
}
