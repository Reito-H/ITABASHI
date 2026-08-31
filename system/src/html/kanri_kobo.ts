// 管理者公休予定表（2026年度版レイアウト）画面・印刷の共通描画
//   元Excel「2026年度・管理者公休予定表.xlsx」の月度シート＋別シート2枚を再現する。
//   月度 = 前月11日〜当月10日（固定）。班長シフト(kancho_*)とは無関係の別機能。
import { escHtml, safeJson, saveToastHtml, saveToastScript } from './layout';
import { ADMIN_PATH } from '../config';

export type KkMember = {
  id: number;
  year: number;
  month: number;
  block: string;            // kanai / kanri / job / sub2
  name: string;
  abbr: string | null;      // アサヒ担当行の略称照合用
  sort_order: number;
  is_active: number;
};

export type KkType = {
  id: number;
  code: string;
  label: string;
  color: string;
  counts_as_work: number;
  counts_as_off: number;
  is_shitei: number;
  sort_order: number;
  is_active: number;
};

export type KkWeekendResp = { date: string; kind: string; name: string };
export type KkToitsuCount = { person: string; ym: string; cnt: number; sort_order: number };

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

export const BLOCKS: Array<{ key: string; label: string }> = [
  { key: 'kanai', label: '課内職員' },
  { key: 'kanri', label: '管理者' },
  { key: 'job', label: 'JOB' },
  { key: 'sub2', label: '②' },
];

// 月度の開始日・終了日（前月11日〜当月10日 固定）
export function kkPeriodRange(year: number, month: number): { start: string; end: string } {
  let sy = year, sm = month - 1;
  if (sm < 1) { sm = 12; sy -= 1; }
  const start = `${sy}-${String(sm).padStart(2, '0')}-11`;
  const end = `${year}-${String(month).padStart(2, '0')}-10`;
  return { start, end };
}

export function kkDates(year: number, month: number): string[] {
  const { start, end } = kkPeriodRange(year, month);
  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (cur <= last) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

export function kkAdjacent(year: number, month: number) {
  let py = year, pm = month - 1;
  if (pm < 1) { pm = 12; py -= 1; }
  let ny = year, nm = month + 1;
  if (nm > 12) { nm = 1; ny += 1; }
  return { prevYear: py, prevMonth: pm, nextYear: ny, nextMonth: nm };
}

function dow(d: string): number {
  return new Date(d + 'T00:00:00Z').getUTCDay();
}

// 記号フラグ（サーバー・クライアント・印刷で共通の集計ロジック）
function typeFlagSets(types: KkType[]) {
  const work = new Set<string>();
  const off = new Set<string>();
  const shitei = new Set<string>();
  const color: Record<string, string> = {};
  for (const t of types) {
    if (t.counts_as_work) work.add(t.code);
    if (t.counts_as_off) off.add(t.code);
    if (t.is_shitei) shitei.add(t.code);
    if (!(t.code in color)) color[t.code] = t.color;
  }
  return { work, off, shitei, color };
}

type Summary = { work: number; choku: number; off: number; shitei: number; offtot: number; asahi: number; weekend: number; holiday: number; total: number };

function rowSummary(
  m: KkMember, dates: string[], cellMap: Record<string, string>,
  flags: ReturnType<typeof typeFlagSets>, asahiByKey: Record<string, number>, holidays: Set<string>
): Summary {
  let work = 0, choku = 0, off = 0, shitei = 0, weekend = 0, holiday = 0;
  for (const d of dates) {
    const code = cellMap[`${m.id}_${d}`];
    if (!code) continue;
    if (flags.work.has(code)) work++;
    if (code === '直') choku++;
    if (flags.off.has(code)) off++;
    if (flags.shitei.has(code)) shitei++;
    if (m.block === 'kanri' && code === '○') {
      const wd = dow(d);
      if (wd === 0 || wd === 6) weekend++;
      if (holidays.has(d)) holiday++;
    }
  }
  const key = (m.abbr && m.abbr.trim()) || (m.name ? m.name.slice(0, 1) : '');
  const asahi = asahiByKey[key] ?? 0;
  return { work, choku, off, shitei, offtot: off + shitei, asahi, weekend, holiday, total: weekend + holiday };
}

const SUMMARY_COLS: Array<{ key: keyof Summary; label: string; kanriOnly?: boolean }> = [
  { key: 'work', label: '出勤' },
  { key: 'choku', label: '直' },
  { key: 'off', label: '公' },
  { key: 'shitei', label: '指公' },
  { key: 'offtot', label: '公休計' },
  { key: 'asahi', label: 'ア' },
  { key: 'weekend', label: '土日', kanriOnly: true },
  { key: 'holiday', label: '祝', kanriOnly: true },
  { key: 'total', label: '合計', kanriOnly: true },
];

export type KkPageData = {
  members: KkMember[];
  types: KkType[];
  cellMap: Record<string, string>;
  asahi: Record<string, string>;       // date -> name
  dayNotes: Record<string, string>;    // date -> content
  memoNote: string;
  holidays: string[];                  // ["YYYY-MM-DD"]
  weekendResp: KkWeekendResp[];
  toitsu: KkToitsuCount[];
  toitsuRotation: string;
  year: number;
  month: number;
  canEdit: boolean;
};

// ヘッダーに差し込む月度ナビ
export function kkPeriodNavHtml(year: number, month: number): string {
  const { start, end } = kkPeriodRange(year, month);
  const { prevYear, prevMonth, nextYear, nextMonth } = kkAdjacent(year, month);
  const label = `${year}年${month}月度（${start}〜${end}）`;
  return `
    <a href="${ADMIN_PATH}/kanri-kobo?year=${prevYear}&month=${prevMonth}" class="kk-nav-sm">◀</a>
    <span style="font-size:13px;font-weight:700;color:#1e3a5f;white-space:nowrap;">${escHtml(label)}</span>
    <a href="${ADMIN_PATH}/kanri-kobo?year=${nextYear}&month=${nextMonth}" class="kk-nav-sm">▶</a>`;
}

// ===== 共通: グリッド本体（画面・印刷で共有） =====
function gridTable(d: KkPageData, forPrint: boolean): string {
  const dates = kkDates(d.year, d.month);
  const flags = typeFlagSets(d.types.filter(t => t.is_active === 1));
  const holidaySet = new Set(d.holidays);
  const activeMembers = d.members.filter(m => m.is_active === 1);
  const byBlock: Record<string, KkMember[]> = { kanai: [], kanri: [], job: [], sub2: [] };
  for (const m of activeMembers) (byBlock[m.block] ?? (byBlock[m.block] = [])).push(m);
  for (const k of Object.keys(byBlock)) byBlock[k].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  // アサヒ回数（略称キー -> 件数）
  const asahiByKey: Record<string, number> = {};
  for (const dt of dates) {
    const nm = (d.asahi[dt] ?? '').trim();
    if (nm) asahiByKey[nm] = (asahiByKey[nm] ?? 0) + 1;
  }

  const NAME_W = forPrint ? 66 : 92;
  const CELL_W = forPrint ? 24 : 34;
  const SUM_W = forPrint ? 26 : 30;
  const STICKY = forPrint ? '' : 'position:sticky;z-index:2;';
  const HDR_BG = 'background:#1e3a5f;color:#fff;';

  function dateHeaders(): string {
    return dates.map(dt => {
      const wd = dow(dt);
      const isWe = wd === 0 || wd === 6;
      const isHol = holidaySet.has(dt);
      const bg = isHol ? '#fee2e2' : isWe ? '#fef2f2' : '#eff6ff';
      const num = parseInt(dt.slice(8, 10), 10);
      const clickAttr = (!forPrint && d.canEdit) ? ` class="kk-daycol" data-date="${dt}"` : '';
      return `<th${clickAttr} style="min-width:${CELL_W}px;max-width:${CELL_W}px;text-align:center;font-size:10px;padding:2px 1px;border:1px solid #d1d5db;background:${bg};${!forPrint && d.canEdit ? 'cursor:pointer;' : ''}">
        <div>${num}</div>
        <div style="color:${wd === 0 || isHol ? '#ef4444' : wd === 6 ? '#3b82f6' : '#374151'};">${isHol ? '祝' : WEEKDAY_JA[wd]}</div>
      </th>`;
    }).join('');
  }

  function summaryHead(): string {
    return SUMMARY_COLS.map(c => `<th style="min-width:${SUM_W}px;${HDR_BG}font-size:9px;padding:3px 1px;border:1px solid #4b6cb7;">${c.label}</th>`).join('');
  }

  function cellTd(m: KkMember, dt: string): string {
    const code = d.cellMap[`${m.id}_${dt}`] ?? '';
    const bg = code ? (flags.color[code] ?? '#fff7ed') : '#ffffff';
    const editAttr = (!forPrint && d.canEdit)
      ? ` class="kk-cell" data-name="${escHtml(m.name)}"`
      : ' class="kk-cell-ro"';
    return `<td${editAttr} data-m="${m.id}" data-d="${dt}" data-code="${escHtml(code)}" style="min-width:${CELL_W}px;max-width:${CELL_W}px;text-align:center;font-size:11px;padding:3px 1px;border:1px solid #d1d5db;background:${bg};${!forPrint && d.canEdit ? 'cursor:pointer;' : ''}">${escHtml(code)}</td>`;
  }

  function summaryTds(m: KkMember): string {
    const s = rowSummary(m, dates, d.cellMap, flags, asahiByKey, holidaySet);
    return SUMMARY_COLS.map(c => {
      const blank = c.kanriOnly && m.block !== 'kanri';
      const val = blank ? '' : String(s[c.key]);
      return `<td class="kk-sum" data-m="${m.id}" data-k="${c.key}" style="min-width:${SUM_W}px;text-align:center;font-size:10px;font-weight:600;border:1px solid #d1d5db;background:#f8fafc;padding:2px;">${val}</td>`;
    }).join('');
  }

  function memberRow(m: KkMember): string {
    const nameCell = `<td class="${!forPrint && d.canEdit ? 'kk-name' : ''}" data-m="${m.id}" style="min-width:${NAME_W}px;max-width:${NAME_W}px;font-size:11px;font-weight:600;border:1px solid #d1d5db;padding:3px 4px;${STICKY}left:0;background:#f8fafc;white-space:nowrap;overflow:hidden;${!forPrint && d.canEdit ? 'cursor:pointer;' : ''}">${escHtml(m.name)}</td>`;
    return `<tr data-block="${m.block}" data-m="${m.id}">${nameCell}${dates.map(dt => cellTd(m, dt)).join('')}${summaryTds(m)}</tr>`;
  }

  function blockHeaderRow(label: string): string {
    return `<tr><td colspan="${1 + dates.length + SUMMARY_COLS.length}" style="background:#e0e7ff;font-size:10px;font-weight:bold;padding:2px 8px;border:1px solid #d1d5db;${STICKY}left:0;">● ${escHtml(label)}</td></tr>`;
  }

  // 日別合計行
  function totalRow(label: string, valueOf: (dt: string) => number, bg: string): string {
    const tds = dates.map(dt => `<td style="text-align:center;font-size:10px;font-weight:700;border:1px solid #d1d5db;background:${bg};padding:2px 1px;">${valueOf(dt)}</td>`).join('');
    return `<tr><td style="min-width:${NAME_W}px;font-size:10px;font-weight:700;border:1px solid #d1d5db;padding:2px 4px;${STICKY}left:0;background:${bg};white-space:nowrap;">${escHtml(label)}</td>${tds}<td colspan="${SUMMARY_COLS.length}" style="border:1px solid #d1d5db;background:${bg};"></td></tr>`;
  }

  const kanaiMaru = (dt: string) => byBlock.kanai.filter(m => (d.cellMap[`${m.id}_${dt}`] ?? '') === '○').length;
  const kanriJobMaru = (dt: string) =>
    byBlock.kanri.filter(m => (d.cellMap[`${m.id}_${dt}`] ?? '') === '○').length +
    byBlock.job.filter(m => (d.cellMap[`${m.id}_${dt}`] ?? '') === '○').length;
  const sub2Maru = (dt: string) => byBlock.sub2.filter(m => (d.cellMap[`${m.id}_${dt}`] ?? '') === '○').length;

  // アサヒ行
  function asahiRow(): string {
    const tds = dates.map(dt => {
      const nm = escHtml(d.asahi[dt] ?? '');
      const attr = (!forPrint && d.canEdit) ? ` class="kk-asahi" data-d="${dt}"` : '';
      return `<td${attr} style="text-align:center;font-size:10px;border:1px solid #d1d5db;background:#fffbeb;padding:2px 1px;${!forPrint && d.canEdit ? 'cursor:pointer;' : ''}">${nm}</td>`;
    }).join('');
    return `<tr><td style="min-width:${NAME_W}px;font-size:10px;font-weight:700;border:1px solid #d1d5db;padding:2px 4px;${STICKY}left:0;background:#fffbeb;">アサヒ</td>${tds}<td colspan="${SUMMARY_COLS.length}" style="border:1px solid #d1d5db;background:#fffbeb;"></td></tr>`;
  }

  // 日別注記行
  function dayNoteRow(): string {
    const tds = dates.map(dt => {
      const v = escHtml(d.dayNotes[dt] ?? '');
      const attr = (!forPrint && d.canEdit) ? ` class="kk-daynote" data-d="${dt}"` : '';
      return `<td${attr} style="font-size:8px;line-height:1.15;border:1px solid #d1d5db;background:#fff;padding:2px 1px;vertical-align:top;white-space:normal;word-break:break-all;${!forPrint && d.canEdit ? 'cursor:pointer;' : ''}">${v.replace(/\n/g, '<br>')}</td>`;
    }).join('');
    return `<tr><td style="min-width:${NAME_W}px;font-size:10px;font-weight:700;border:1px solid #d1d5db;padding:2px 4px;${STICKY}left:0;background:#fff;">メモ</td>${tds}<td colspan="${SUMMARY_COLS.length}" style="border:1px solid #d1d5db;"></td></tr>`;
  }

  let body = '';
  body += blockHeaderRow('課内職員');
  body += byBlock.kanai.map(memberRow).join('');
  body += totalRow('課内出勤', kanaiMaru, '#eef2ff');
  body += blockHeaderRow('管理者');
  body += byBlock.kanri.map(memberRow).join('');
  body += blockHeaderRow('JOB');
  body += byBlock.job.map(memberRow).join('');
  body += asahiRow();
  body += totalRow('①合計（管理者＋JOB）', kanriJobMaru, '#ecfdf5');
  body += blockHeaderRow('②職員');
  body += byBlock.sub2.map(memberRow).join('');
  body += totalRow('②合計', sub2Maru, '#fef2f2');
  body += totalRow('①＋②', (dt) => kanriJobMaru(dt) + sub2Maru(dt), '#f1f5f9');
  body += dayNoteRow();

  return `
  <div style="${forPrint ? '' : 'overflow:auto;max-height:74vh;'}border:1px solid #d1d5db;border-radius:8px;-webkit-overflow-scrolling:touch;">
    <table class="kk-grid" style="border-collapse:collapse;table-layout:fixed;">
      <thead style="${forPrint ? '' : 'position:sticky;top:0;z-index:10;'}background:#fff;">
        <tr>
          <th style="min-width:${NAME_W}px;${STICKY}left:0;z-index:20;${HDR_BG}font-size:10px;padding:3px;border:1px solid #4b6cb7;">氏名</th>
          ${dateHeaders()}
          ${summaryHead()}
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

// ===== 画面 =====
export function kanriKoboPage(d: KkPageData): string {
  const activeTypes = d.types.filter(t => t.is_active === 1).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const dates = kkDates(d.year, d.month);
  const { prevYear, prevMonth } = kkAdjacent(d.year, d.month);

  const legend = activeTypes.map(t =>
    `<span style="background:${t.color};padding:2px 8px;border-radius:4px;border:1px solid #d1d5db;" title="${escHtml(t.label)}">${escHtml(t.code)}${t.label ? `<span style="color:#374151;font-size:10px;"> ${escHtml(t.label)}</span>` : ''}</span>`
  ).join('');

  // 土日責任者タブ用の行データ
  const wrMap: Record<string, Record<string, string>> = {};
  for (const w of d.weekendResp) (wrMap[w.date] ?? (wrMap[w.date] = {}))[w.kind] = w.name;
  const wrRows = dates.map(dt => {
    const wd = dow(dt);
    const isWe = wd === 0 || wd === 6;
    const r = wrMap[dt] ?? {};
    const md = `${parseInt(dt.slice(5, 7), 10)}/${parseInt(dt.slice(8, 10), 10)}`;
    return `<tr style="${isWe ? 'background:#fef2f2;' : ''}">
      <td style="border:1px solid #d1d5db;padding:3px 8px;font-size:12px;white-space:nowrap;">${md}（${WEEKDAY_JA[wd]}）</td>
      <td style="border:1px solid #d1d5db;padding:2px;"><input class="kk-wr" data-d="${dt}" data-kind="resp" value="${escHtml(r.resp ?? '')}" ${d.canEdit ? '' : 'disabled'} style="width:100%;border:none;font-size:12px;padding:3px 6px;background:transparent;box-sizing:border-box;"></td>
      <td style="border:1px solid #d1d5db;padding:2px;"><input class="kk-wr" data-d="${dt}" data-kind="akake" value="${escHtml(r.akake ?? '')}" ${d.canEdit ? '' : 'disabled'} style="width:100%;border:none;font-size:12px;padding:3px 6px;background:transparent;box-sizing:border-box;"></td>
      <td style="border:1px solid #d1d5db;padding:3px 8px;text-align:center;"><input type="checkbox" class="kk-wr-chin" data-d="${dt}" ${r.chinshime === '1' ? 'checked' : ''} ${d.canEdit ? '' : 'disabled'}></td>
    </tr>`;
  }).join('');

  // 当直回数タブ
  const fy = d.month >= 4 ? d.year : d.year - 1;
  const ymList: Array<{ ym: string; label: string }> = [{ ym: 'prev', label: '前年度計' }];
  for (let i = 0; i < 12; i++) {
    const mm = 4 + i;
    const yy = mm <= 12 ? fy : fy + 1;
    const m2 = mm <= 12 ? mm : mm - 12;
    ymList.push({ ym: `${yy}-${String(m2).padStart(2, '0')}`, label: `${m2}月` });
  }
  const persons: string[] = [];
  const tMap: Record<string, number> = {};
  for (const t of d.toitsu) {
    if (!persons.includes(t.person)) persons.push(t.person);
    tMap[`${t.person}_${t.ym}`] = t.cnt;
  }
  const toitsuRows = persons.map(p => {
    const cells = ymList.map(y => {
      const v = tMap[`${p}_${y.ym}`] ?? 0;
      return `<td style="border:1px solid #d1d5db;padding:1px;"><input class="kk-toitsu" data-p="${escHtml(p)}" data-ym="${y.ym}" value="${v || ''}" ${d.canEdit ? '' : 'disabled'} inputmode="numeric" style="width:34px;border:none;text-align:center;font-size:12px;padding:3px 1px;background:transparent;"></td>`;
    }).join('');
    let sum = 0;
    for (const y of ymList) sum += tMap[`${p}_${y.ym}`] ?? 0;
    return `<tr><td style="border:1px solid #d1d5db;padding:3px 8px;font-size:12px;font-weight:600;white-space:nowrap;background:#f8fafc;position:sticky;left:0;">${escHtml(p)}${d.canEdit ? ` <button onclick="kkDelToitsu('${escHtml(p)}')" style="border:none;background:none;color:#dc2626;cursor:pointer;font-size:11px;">✕</button>` : ''}</td>${cells}<td style="border:1px solid #d1d5db;padding:3px 8px;text-align:center;font-size:12px;font-weight:700;">${sum}</td></tr>`;
  }).join('');

  return `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
    <div class="kk-tabs">
      <button class="kk-tab kk-tab-on" data-tab="grid" onclick="kkTab('grid')">公休予定表</button>
      <button class="kk-tab" data-tab="weekend" onclick="kkTab('weekend')">土日責任者</button>
      <button class="kk-tab" data-tab="toitsu" onclick="kkTab('toitsu')">当直回数</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <a href="${ADMIN_PATH}/kanri-kobo/print?year=${d.year}&month=${d.month}" target="_blank" class="kk-btn">印刷</a>
      ${d.canEdit ? `<button onclick="kkOpenImport()" class="kk-btn">Excel取込</button>
      <button onclick="kkOpenRoster()" class="kk-btn">名簿</button>
      <button onclick="kkOpenTypes()" class="kk-btn">記号</button>` : ''}
      <button onclick="kkOpenLogs()" class="kk-btn">履歴</button>
    </div>
  </div>

  ${d.canEdit ? '' : '<div style="margin-bottom:8px;font-size:12px;color:#6b7280;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:6px 12px;display:inline-block;">閲覧専用（編集権限がありません）</div>'}

  <!-- ===== 公休予定表タブ ===== -->
  <div id="kk-pane-grid">
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;font-size:11px;align-items:center;">${legend}</div>
    <div style="font-size:11px;color:#6b7280;margin-bottom:8px;">
      日付ヘッダーをタップ＝祝日の切替 ／ セルをタップ＝記号入力 ／ 出勤=○有特不直明早 ／ 公休計=公+指公 ／ ア=アサヒ担当回数
    </div>
    ${gridTable(d, false)}

    <div style="display:grid;grid-template-columns:1fr;gap:12px;margin-top:16px;max-width:760px;">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">特記事項</div>
        ${d.canEdit
          ? `<textarea id="kk-memo" rows="4" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;font-family:inherit;box-sizing:border-box;">${escHtml(d.memoNote)}</textarea>
             <div style="text-align:right;margin-top:6px;"><button onclick="kkSaveMemo()" class="kk-btn kk-btn-primary">保存</button></div>`
          : `<div style="font-size:13px;white-space:pre-wrap;">${escHtml(d.memoNote) || '<span style="color:#9ca3af;">なし</span>'}</div>`}
      </div>
    </div>
  </div>

  <!-- ===== 土日責任者タブ ===== -->
  <div id="kk-pane-weekend" style="display:none;">
    <div style="font-size:11px;color:#6b7280;margin-bottom:8px;">月度内の各日について、土日責任者・当直明け担当・賃締フラグを記入します。</div>
    <div style="overflow:auto;max-height:74vh;border:1px solid #d1d5db;border-radius:8px;max-width:560px;">
      <table style="border-collapse:collapse;width:100%;">
        <thead style="position:sticky;top:0;background:#1e3a5f;color:#fff;">
          <tr>
            <th style="padding:5px 8px;font-size:11px;border:1px solid #4b6cb7;">日付</th>
            <th style="padding:5px 8px;font-size:11px;border:1px solid #4b6cb7;">土日責任者</th>
            <th style="padding:5px 8px;font-size:11px;border:1px solid #4b6cb7;">当直明け</th>
            <th style="padding:5px 8px;font-size:11px;border:1px solid #4b6cb7;">賃締</th>
          </tr>
        </thead>
        <tbody>${wrRows}</tbody>
      </table>
    </div>
  </div>

  <!-- ===== 当直回数タブ ===== -->
  <div id="kk-pane-toitsu" style="display:none;">
    <div style="font-size:11px;color:#6b7280;margin-bottom:8px;">${fy}年度（4月〜翌3月）の当直回数。数字は直接編集できます。</div>
    <div style="overflow:auto;max-height:60vh;border:1px solid #d1d5db;border-radius:8px;">
      <table style="border-collapse:collapse;">
        <thead style="position:sticky;top:0;background:#1e3a5f;color:#fff;">
          <tr>
            <th style="padding:5px 8px;font-size:11px;border:1px solid #4b6cb7;position:sticky;left:0;background:#1e3a5f;">氏名</th>
            ${ymList.map(y => `<th style="padding:5px 4px;font-size:10px;border:1px solid #4b6cb7;white-space:nowrap;">${y.label}</th>`).join('')}
            <th style="padding:5px 8px;font-size:11px;border:1px solid #4b6cb7;">合計</th>
          </tr>
        </thead>
        <tbody id="kk-toitsu-body">${toitsuRows}</tbody>
      </table>
    </div>
    ${d.canEdit ? `<div style="margin-top:10px;display:flex;gap:6px;align-items:center;">
      <input id="kk-toitsu-newname" placeholder="氏名を追加" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;">
      <button onclick="kkAddToitsu()" class="kk-btn">＋ 追加</button>
    </div>` : ''}
    <div style="margin-top:14px;max-width:640px;">
      <div style="font-size:12px;font-weight:700;color:#1e3a5f;margin-bottom:4px;">当直ローテ順</div>
      ${d.canEdit
        ? `<input id="kk-rotation" value="${escHtml(d.toitsuRotation)}" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;box-sizing:border-box;">
           <div style="text-align:right;margin-top:6px;"><button onclick="kkSaveRotation()" class="kk-btn kk-btn-primary">保存</button></div>`
        : `<div style="font-size:13px;">${escHtml(d.toitsuRotation) || '<span style="color:#9ca3af;">未設定</span>'}</div>`}
    </div>
  </div>
</div>

<!-- セル入力モーダル -->
<div id="kk-cell-modal" class="kk-modal">
  <div class="kk-modal-box" style="max-width:360px;">
    <div class="kk-modal-head"><span id="kk-cm-title"></span><button onclick="kkCloseCell()" class="kk-x">✕</button></div>
    <div id="kk-cm-presets" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px;"></div>
    <input id="kk-cm-input" type="text" placeholder="記号を選択または自由入力（空=クリア）" style="width:100%;border:1px solid #93c5fd;border-radius:6px;padding:10px;font-size:16px;box-sizing:border-box;margin-bottom:10px;">
    <div style="display:flex;gap:8px;">
      <button onclick="kkApplyCell('')" class="kk-btn" style="flex:1;">クリア</button>
      <button onclick="kkApplyCell()" class="kk-btn kk-btn-primary" style="flex:2;">適用</button>
    </div>
  </div>
</div>

<!-- 汎用テキスト入力モーダル（アサヒ・日別メモ） -->
<div id="kk-text-modal" class="kk-modal">
  <div class="kk-modal-box" style="max-width:360px;">
    <div class="kk-modal-head"><span id="kk-tm-title"></span><button onclick="kkCloseText()" class="kk-x">✕</button></div>
    <textarea id="kk-tm-input" rows="3" style="width:100%;border:1px solid #93c5fd;border-radius:6px;padding:10px;font-size:15px;box-sizing:border-box;margin-bottom:10px;"></textarea>
    <div style="text-align:right;"><button onclick="kkApplyText()" class="kk-btn kk-btn-primary">保存</button></div>
  </div>
</div>

<!-- 名簿モーダル -->
<div id="kk-roster-modal" class="kk-modal">
  <div class="kk-modal-box" style="max-width:640px;">
    <div class="kk-modal-head"><span>名簿（${d.year}年${d.month}月度）</span><button onclick="kkClose('kk-roster-modal')" class="kk-x">✕</button></div>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:8px;">前月度の名簿を引き継ぐ場合は下のボタン。略称はアサヒ担当行の照合に使います（空なら氏名の先頭1字）。</div>
    <div style="margin-bottom:10px;"><button onclick="kkCloneRoster()" class="kk-btn">${prevYear}年${prevMonth}月度からコピー</button></div>
    <div id="kk-roster-body" style="max-height:52vh;overflow:auto;"></div>
    <div class="kk-modal-foot"><button onclick="kkSaveRoster()" class="kk-btn kk-btn-primary">一括保存</button></div>
  </div>
</div>

<!-- 記号モーダル -->
<div id="kk-types-modal" class="kk-modal">
  <div class="kk-modal-box" style="max-width:640px;">
    <div class="kk-modal-head"><span>記号マスタ</span><button onclick="kkClose('kk-types-modal')" class="kk-x">✕</button></div>
    <div id="kk-types-body" style="max-height:56vh;overflow:auto;"></div>
    <div class="kk-modal-foot"><button onclick="kkSaveTypes()" class="kk-btn kk-btn-primary">一括保存</button></div>
  </div>
</div>

<!-- 取込モーダル -->
<div id="kk-import-modal" class="kk-modal">
  <div class="kk-modal-box" style="max-width:560px;">
    <div class="kk-modal-head"><span>Excel取込</span><button onclick="kkClose('kk-import-modal')" class="kk-x">✕</button></div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">「2026年度・管理者公休予定表.xlsx」を選択し、取り込む月度シートを選びます。ブラウザ内で解析し、確認してから反映します。</div>
    <input type="file" id="kk-import-file" accept=".xlsx,.xlsm" style="font-size:13px;margin-bottom:10px;">
    <div id="kk-import-sheets" style="margin-bottom:10px;"></div>
    <div id="kk-import-preview" style="font-size:12px;color:#374151;"></div>
    <div class="kk-modal-foot"><button onclick="kkRunImport()" id="kk-import-btn" class="kk-btn kk-btn-primary" disabled>この内容で取り込む</button></div>
  </div>
</div>

<!-- 履歴モーダル -->
<div id="kk-logs-modal" class="kk-modal">
  <div class="kk-modal-box" style="max-width:640px;">
    <div class="kk-modal-head"><span>編集履歴（最新200件）</span><button onclick="kkClose('kk-logs-modal')" class="kk-x">✕</button></div>
    <div id="kk-logs-body" style="max-height:60vh;overflow:auto;font-size:12px;color:#6b7280;">読み込み中...</div>
  </div>
</div>

${saveToastHtml()}

<style>
  .kk-tabs { display:flex;gap:4px; }
  .kk-tab { padding:6px 14px;background:#eef2f7;border:1px solid #d1d5db;border-radius:8px 8px 0 0;font-size:13px;font-weight:600;color:#475569;cursor:pointer; }
  .kk-tab-on { background:#1e3a5f;color:#fff;border-color:#1e3a5f; }
  .kk-btn { padding:6px 14px;background:#6b7280;color:#fff;border:none;border-radius:6px;font-size:13px;text-decoration:none;cursor:pointer;display:inline-block;white-space:nowrap; }
  .kk-btn-primary { background:#2563eb; }
  .kk-btn:disabled { opacity:0.5;cursor:default; }
  .kk-nav-sm { display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:34px;background:#4b6cb7;color:#fff;border-radius:8px;text-decoration:none;font-size:17px;font-weight:700; }
  .kk-cell:active { opacity:0.6; }
  .kk-cell[data-pending="1"] { outline:2px dashed #f59e0b; outline-offset:-2px; }
  .kk-modal { display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;padding:12px; }
  .kk-modal.open { display:flex; }
  .kk-modal-box { background:#fff;border-radius:12px;padding:18px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow:auto; }
  .kk-modal-head { display:flex;justify-content:space-between;align-items:center;font-size:15px;font-weight:700;color:#1e3a5f;margin-bottom:12px; }
  .kk-modal-foot { display:flex;justify-content:flex-end;margin-top:12px;padding-top:10px;border-top:1px solid #e5e7eb; }
  .kk-x { background:none;border:none;font-size:20px;color:#9ca3af;cursor:pointer;line-height:1; }
  .kk-chip { padding:4px 10px;border:1px solid #d1d5db;border-radius:99px;font-size:13px;cursor:pointer;background:#f8fafc; }
  .kk-rtable { border-collapse:collapse;width:100%;font-size:12.5px; }
  .kk-rtable th { background:#f8fafc;color:#6b7280;font-size:11px;padding:6px;border-bottom:1px solid #e5e7eb;text-align:left; }
  .kk-rtable td { padding:4px 6px;border-bottom:1px solid #f1f5f9; }
  .kk-rtable input[type=text], .kk-rtable select, .kk-rtable input:not([type]) { border:1px solid #d1d5db;border-radius:6px;padding:5px 7px;font-size:12.5px;background:#fff; }
  .kk-rtable input[type=color] { border:1px solid #d1d5db;border-radius:6px;width:34px;height:28px;padding:2px; }
</style>

<script>
var KK_API = '${ADMIN_PATH}/api/kanri-kobo';
var KK_CAN_EDIT = ${d.canEdit ? 'true' : 'false'};
var KK_YEAR = ${d.year}, KK_MONTH = ${d.month};
var KK_DATES = ${safeJson(dates)};
var KK_TYPES = ${safeJson(activeTypes.map(t => ({ code: t.code, color: t.color })))};
var KK_ALL_TYPES = ${safeJson(d.types.map(t => ({ id: t.id, code: t.code, label: t.label, color: t.color, counts_as_work: t.counts_as_work, counts_as_off: t.counts_as_off, is_shitei: t.is_shitei, sort_order: t.sort_order, is_active: t.is_active })))};
var KK_MEMBERS = ${safeJson(d.members.map(m => ({ id: m.id, block: m.block, name: m.name, abbr: m.abbr, sort_order: m.sort_order, is_active: m.is_active })))};
var KK_HOLIDAYS = ${safeJson(d.holidays)};
var KK_FLAGS = { work:{}, off:{}, shitei:{}, color:{} };
${''}
(function(){
  var at = KK_ALL_TYPES;
  for (var i=0;i<at.length;i++){ var t=at[i]; if(!t.is_active) continue;
    if(t.counts_as_work) KK_FLAGS.work[t.code]=1;
    if(t.counts_as_off) KK_FLAGS.off[t.code]=1;
    if(t.is_shitei) KK_FLAGS.shitei[t.code]=1;
    if(!(t.code in KK_FLAGS.color)) KK_FLAGS.color[t.code]=t.color;
  }
})();

function kkSel(s){ return document.querySelector(s); }
function kkEsc(s){ return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function kkDow(d){ return new Date(d+'T00:00:00Z').getUTCDay(); }
${saveToastScript()}

function kkTab(name){
  ['grid','weekend','toitsu'].forEach(function(n){
    kkSel('#kk-pane-'+n).style.display = (n===name?'':'none');
  });
  document.querySelectorAll('.kk-tab').forEach(function(b){ b.classList.toggle('kk-tab-on', b.dataset.tab===name); });
}
function kkClose(id){ kkSel('#'+id).classList.remove('open'); }
function kkOpen(id){ kkSel('#'+id).classList.add('open'); }

async function kkPost(path, body){
  var res = await fetch(KK_API + path, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  var d = await res.json().catch(function(){ return {}; });
  if (!res.ok || d.error) throw new Error(d.error || ('HTTP '+res.status));
  return d;
}

// ===== 集計の再計算（画面側。日別合計行は次回リロードでサーバー値に更新される） =====
function kkCodeAt(mid, dt){
  var td = document.querySelector('#kk-pane-grid tr[data-m="'+mid+'"] td[data-d="'+dt+'"]');
  return td ? (td.getAttribute('data-code') || '') : '';
}
function kkRecalc(){
  document.querySelectorAll('#kk-pane-grid tr[data-m]').forEach(function(tr){
    var mid = tr.getAttribute('data-m');
    var block = tr.getAttribute('data-block');
    var s = { work:0, choku:0, off:0, shitei:0, weekend:0, holiday:0 };
    KK_DATES.forEach(function(dt){
      var td = tr.querySelector('td[data-d="'+dt+'"]');
      if(!td) return;
      var code = td.getAttribute('data-code') || '';
      if(!code) return;
      if(KK_FLAGS.work[code]) s.work++;
      if(code==='直') s.choku++;
      if(KK_FLAGS.off[code]) s.off++;
      if(KK_FLAGS.shitei[code]) s.shitei++;
      if(block==='kanri' && code==='○'){
        var wd = kkDow(dt);
        if(wd===0||wd===6) s.weekend++;
        if(KK_HOLIDAYS.indexOf(dt)>=0) s.holiday++;
      }
    });
    var mem = null; for(var i=0;i<KK_MEMBERS.length;i++){ if(String(KK_MEMBERS[i].id)===String(mid)){ mem=KK_MEMBERS[i]; break; } }
    var key = (mem && mem.abbr && mem.abbr.trim()) || (mem ? mem.name.slice(0,1) : '');
    var asahi = 0;
    KK_DATES.forEach(function(dt){
      var a = document.querySelector('.kk-asahi[data-d="'+dt+'"]');
      var nm = a ? (a.textContent||'').trim() : '';
      if(nm && nm===key) asahi++;
    });
    var vals = { work:s.work, choku:s.choku, off:s.off, shitei:s.shitei, offtot:s.off+s.shitei, asahi:asahi, weekend:s.weekend, holiday:s.holiday, total:s.weekend+s.holiday };
    tr.querySelectorAll('td.kk-sum').forEach(function(td){
      var k = td.getAttribute('data-k');
      if(td.textContent==='' && (k==='weekend'||k==='holiday'||k==='total')) return;
      td.textContent = vals[k];
    });
  });
}

// ===== セル編集 =====
var kkCur = null;
document.addEventListener('click', function(e){
  var c = e.target.closest && e.target.closest('td.kk-cell');
  if (c && KK_CAN_EDIT) { kkOpenCell(c); return; }
  var dh = e.target.closest && e.target.closest('th.kk-daycol');
  if (dh && KK_CAN_EDIT) { kkToggleHoliday(dh.getAttribute('data-date')); return; }
  var a = e.target.closest && e.target.closest('td.kk-asahi');
  if (a && KK_CAN_EDIT) { kkOpenText('asahi', a, 'アサヒ担当', a.textContent.trim()); return; }
  var dn = e.target.closest && e.target.closest('td.kk-daynote');
  if (dn && KK_CAN_EDIT) { kkOpenText('daynote', dn, '日別メモ', (dn.innerHTML||'').replace(/<br\\s*\\/?>/gi,'\\n').replace(/<[^>]+>/g,'')); return; }
});

function kkOpenCell(td){
  kkCur = td;
  var name = td.getAttribute('data-name');
  var d = td.getAttribute('data-d');
  kkSel('#kk-cm-title').textContent = name + ' ' + d.slice(5);
  kkSel('#kk-cm-input').value = td.getAttribute('data-code') || '';
  var box = kkSel('#kk-cm-presets');
  box.innerHTML = KK_TYPES.map(function(t){
    return '<button class="kk-chip" style="background:'+t.color+'" onclick="kkPickPreset(\\''+kkEsc(t.code)+'\\')">'+kkEsc(t.code)+'</button>';
  }).join('');
  kkOpen('kk-cell-modal');
  setTimeout(function(){ kkSel('#kk-cm-input').focus(); }, 50);
}
function kkPickPreset(code){ kkSel('#kk-cm-input').value = code; }
function kkCloseCell(){ kkClose('kk-cell-modal'); kkCur = null; }
async function kkApplyCell(force){
  if (!kkCur) return;
  var code = (typeof force === 'string') ? force : kkSel('#kk-cm-input').value.trim();
  var td = kkCur, mid = td.getAttribute('data-m'), d = td.getAttribute('data-d');
  try {
    await kkPost('/cell', { member_id: Number(mid), date: d, code: code });
    td.textContent = code;
    td.setAttribute('data-code', code);
    td.style.background = code ? (KK_FLAGS.color[code] || '#fff7ed') : '#ffffff';
    kkCloseCell();
    kkRecalc();
    showToast('保存しました');
  } catch (e) { alert('保存に失敗しました: ' + e.message); }
}

async function kkToggleHoliday(d){
  var i = KK_HOLIDAYS.indexOf(d);
  if (i >= 0) KK_HOLIDAYS.splice(i, 1); else KK_HOLIDAYS.push(d);
  try {
    await kkPost('/holidays', { year: KK_YEAR, month: KK_MONTH, dates: KK_HOLIDAYS });
    location.reload();
  } catch (e) { alert('保存に失敗しました: ' + e.message); }
}

// ===== 汎用テキスト（アサヒ・日別メモ） =====
var kkTextCur = null, kkTextKind = null;
function kkOpenText(kind, el, title, val){
  kkTextCur = el; kkTextKind = kind;
  kkSel('#kk-tm-title').textContent = title + '（' + el.getAttribute('data-d').slice(5) + '）';
  kkSel('#kk-tm-input').value = val || '';
  kkOpen('kk-text-modal');
}
function kkCloseText(){ kkClose('kk-text-modal'); kkTextCur = null; }
async function kkApplyText(){
  if (!kkTextCur) return;
  var v = kkSel('#kk-tm-input').value;
  var d = kkTextCur.getAttribute('data-d');
  try {
    if (kkTextKind === 'asahi') {
      await kkPost('/asahi', { year: KK_YEAR, month: KK_MONTH, date: d, name: v.trim() });
      kkTextCur.textContent = v.trim();
    } else {
      await kkPost('/day-note', { year: KK_YEAR, month: KK_MONTH, date: d, content: v });
      kkTextCur.innerHTML = kkEsc(v).replace(/\\n/g, '<br>');
    }
    kkCloseText();
    kkRecalc();
    showToast('保存しました');
  } catch (e) { alert('保存に失敗しました: ' + e.message); }
}

// ===== 土日責任者 =====
document.addEventListener('change', function(e){
  var w = e.target.closest && e.target.closest('.kk-wr');
  if (w) { kkSaveWeekend(w.getAttribute('data-d'), w.getAttribute('data-kind'), w.value.trim()); return; }
  var wc = e.target.closest && e.target.closest('.kk-wr-chin');
  if (wc) { kkSaveWeekend(wc.getAttribute('data-d'), 'chinshime', wc.checked ? '1' : ''); return; }
  var tc = e.target.closest && e.target.closest('.kk-toitsu');
  if (tc) { kkSaveToitsu(tc.getAttribute('data-p'), tc.getAttribute('data-ym'), tc.value.trim()); return; }
});
async function kkSaveWeekend(d, kind, name){
  try { await kkPost('/weekend', { year: KK_YEAR, month: KK_MONTH, date: d, kind: kind, name: name }); showToast('保存しました'); }
  catch (e) { alert('保存に失敗しました: ' + e.message); }
}

// ===== 当直回数 =====
async function kkSaveToitsu(p, ym, cnt){
  try { await kkPost('/toitsu', { person: p, ym: ym, cnt: Number(cnt) || 0 }); showToast('保存しました'); }
  catch (e) { alert('保存に失敗しました: ' + e.message); }
}
async function kkAddToitsu(){
  var nm = kkSel('#kk-toitsu-newname').value.trim();
  if (!nm) return;
  try { await kkPost('/toitsu', { person: nm, ym: 'prev', cnt: 0 }); location.reload(); }
  catch (e) { alert('追加に失敗しました: ' + e.message); }
}
async function kkDelToitsu(p){
  if (!confirm(p + ' を削除しますか？')) return;
  try { await kkPost('/toitsu/delete', { person: p }); location.reload(); }
  catch (e) { alert('削除に失敗しました: ' + e.message); }
}
async function kkSaveRotation(){
  try { await kkPost('/memo', { year: KK_YEAR, month: KK_MONTH, kind: 'toitsu_rotation', content: kkSel('#kk-rotation').value }); showToast('保存しました'); }
  catch (e) { alert('保存に失敗しました: ' + e.message); }
}

// ===== 特記事項 =====
async function kkSaveMemo(){
  try { await kkPost('/memo', { year: KK_YEAR, month: KK_MONTH, kind: 'note', content: kkSel('#kk-memo').value }); showToast('保存しました'); }
  catch (e) { alert('保存に失敗しました: ' + e.message); }
}

// ===== 名簿モーダル =====
function kkOpenRoster(){
  kkRenderRoster();
  kkOpen('kk-roster-modal');
}
var KK_BLOCK_LABELS = { kanai:'課内職員', kanri:'管理者', job:'JOB', sub2:'②職員' };
function kkRenderRoster(){
  var rows = KK_MEMBERS.slice().sort(function(a,b){
    var order = ['kanai','kanri','job','sub2'];
    return order.indexOf(a.block)-order.indexOf(b.block) || a.sort_order-b.sort_order || a.id-b.id;
  });
  var html = '<table class="kk-rtable"><thead><tr><th>ブロック</th><th>氏名</th><th>略称</th><th>順</th><th>有効</th><th></th></tr></thead><tbody>';
  html += rows.map(function(m){
    return '<tr data-id="'+m.id+'">'
      + '<td><select class="kk-r-block">'+['kanai','kanri','job','sub2'].map(function(b){ return '<option value="'+b+'"'+(m.block===b?' selected':'')+'>'+KK_BLOCK_LABELS[b]+'</option>'; }).join('')+'</select></td>'
      + '<td><input type="text" class="kk-r-name" value="'+kkEsc(m.name)+'" style="width:120px;"></td>'
      + '<td><input type="text" class="kk-r-abbr" value="'+kkEsc(m.abbr||'')+'" style="width:44px;"></td>'
      + '<td><input type="text" class="kk-r-sort" value="'+m.sort_order+'" style="width:44px;"></td>'
      + '<td style="text-align:center;"><input type="checkbox" class="kk-r-active" '+(m.is_active?'checked':'')+'></td>'
      + '<td><button class="kk-chip" onclick="this.closest(\\'tr\\').remove()">削除</button></td>'
      + '</tr>';
  }).join('');
  html += '</tbody></table>';
  html += '<div style="margin-top:10px;"><button class="kk-btn" onclick="kkAddRosterRow()">＋ 行を追加</button></div>';
  kkSel('#kk-roster-body').innerHTML = html;
}
function kkAddRosterRow(){
  var tb = kkSel('#kk-roster-body').querySelector('tbody');
  var tr = document.createElement('tr');
  tr.setAttribute('data-id','0');
  tr.innerHTML = '<td><select class="kk-r-block"><option value="kanai">課内職員</option><option value="kanri">管理者</option><option value="job">JOB</option><option value="sub2">②職員</option></select></td>'
    + '<td><input type="text" class="kk-r-name" style="width:120px;"></td>'
    + '<td><input type="text" class="kk-r-abbr" style="width:44px;"></td>'
    + '<td><input type="text" class="kk-r-sort" value="0" style="width:44px;"></td>'
    + '<td style="text-align:center;"><input type="checkbox" class="kk-r-active" checked></td>'
    + '<td><button class="kk-chip" onclick="this.closest(\\'tr\\').remove()">削除</button></td>';
  tb.appendChild(tr);
}
async function kkSaveRoster(){
  var list = [];
  kkSel('#kk-roster-body').querySelectorAll('tbody tr').forEach(function(tr){
    var name = tr.querySelector('.kk-r-name').value.trim();
    if (!name) return;
    list.push({
      id: Number(tr.getAttribute('data-id')) || 0,
      block: tr.querySelector('.kk-r-block').value,
      name: name,
      abbr: tr.querySelector('.kk-r-abbr').value.trim(),
      sort_order: Number(tr.querySelector('.kk-r-sort').value) || 0,
      is_active: tr.querySelector('.kk-r-active').checked ? 1 : 0
    });
  });
  try { await kkPost('/members/batch', { year: KK_YEAR, month: KK_MONTH, members: list }); location.reload(); }
  catch (e) { alert('保存に失敗しました: ' + e.message); }
}
async function kkCloneRoster(){
  if (!confirm('前月度の名簿をこの月度へコピーします。既存のこの月度の名簿は残したまま追加されます。よろしいですか？')) return;
  try { await kkPost('/members/clone', { year: KK_YEAR, month: KK_MONTH }); location.reload(); }
  catch (e) { alert('コピーに失敗しました: ' + e.message); }
}

// ===== 記号モーダル =====
function kkOpenTypes(){
  var html = '<table class="kk-rtable"><thead><tr><th>記号</th><th>説明</th><th>色</th><th>出勤</th><th>公</th><th>指公</th><th>順</th><th>有効</th><th></th></tr></thead><tbody>';
  html += KK_ALL_TYPES.map(function(t){
    return '<tr data-id="'+t.id+'">'
      + '<td><input type="text" class="kk-t-code" value="'+kkEsc(t.code)+'" style="width:44px;"></td>'
      + '<td><input type="text" class="kk-t-label" value="'+kkEsc(t.label)+'" style="width:130px;"></td>'
      + '<td><input type="color" class="kk-t-color" value="'+(/^#[0-9a-fA-F]{6}$/.test(t.color)?t.color:'#e5e7eb')+'"></td>'
      + '<td style="text-align:center;"><input type="checkbox" class="kk-t-work" '+(t.counts_as_work?'checked':'')+'></td>'
      + '<td style="text-align:center;"><input type="checkbox" class="kk-t-off" '+(t.counts_as_off?'checked':'')+'></td>'
      + '<td style="text-align:center;"><input type="checkbox" class="kk-t-shitei" '+(t.is_shitei?'checked':'')+'></td>'
      + '<td><input type="text" class="kk-t-sort" value="'+t.sort_order+'" style="width:40px;"></td>'
      + '<td style="text-align:center;"><input type="checkbox" class="kk-t-active" '+(t.is_active?'checked':'')+'></td>'
      + '<td><button class="kk-chip" onclick="this.closest(\\'tr\\').remove()">削除</button></td>'
      + '</tr>';
  }).join('');
  html += '</tbody></table><div style="margin-top:10px;"><button class="kk-btn" onclick="kkAddTypeRow()">＋ 記号を追加</button></div>';
  kkSel('#kk-types-body').innerHTML = html;
  kkOpen('kk-types-modal');
}
function kkAddTypeRow(){
  var tb = kkSel('#kk-types-body').querySelector('tbody');
  var tr = document.createElement('tr');
  tr.setAttribute('data-id','0');
  tr.innerHTML = '<td><input type="text" class="kk-t-code" style="width:44px;"></td>'
    + '<td><input type="text" class="kk-t-label" style="width:130px;"></td>'
    + '<td><input type="color" class="kk-t-color" value="#e5e7eb"></td>'
    + '<td style="text-align:center;"><input type="checkbox" class="kk-t-work"></td>'
    + '<td style="text-align:center;"><input type="checkbox" class="kk-t-off"></td>'
    + '<td style="text-align:center;"><input type="checkbox" class="kk-t-shitei"></td>'
    + '<td><input type="text" class="kk-t-sort" value="0" style="width:40px;"></td>'
    + '<td style="text-align:center;"><input type="checkbox" class="kk-t-active" checked></td>'
    + '<td><button class="kk-chip" onclick="this.closest(\\'tr\\').remove()">削除</button></td>';
  tb.appendChild(tr);
}
async function kkSaveTypes(){
  var list = [];
  kkSel('#kk-types-body').querySelectorAll('tbody tr').forEach(function(tr){
    var code = tr.querySelector('.kk-t-code').value.trim();
    if (!code) return;
    list.push({
      id: Number(tr.getAttribute('data-id')) || 0,
      code: code,
      label: tr.querySelector('.kk-t-label').value.trim(),
      color: tr.querySelector('.kk-t-color').value,
      counts_as_work: tr.querySelector('.kk-t-work').checked ? 1 : 0,
      counts_as_off: tr.querySelector('.kk-t-off').checked ? 1 : 0,
      is_shitei: tr.querySelector('.kk-t-shitei').checked ? 1 : 0,
      sort_order: Number(tr.querySelector('.kk-t-sort').value) || 0,
      is_active: tr.querySelector('.kk-t-active').checked ? 1 : 0
    });
  });
  try { await kkPost('/types/batch', { types: list }); location.reload(); }
  catch (e) { alert('保存に失敗しました: ' + e.message); }
}

// ===== 履歴 =====
async function kkOpenLogs(){
  kkOpen('kk-logs-modal');
  try {
    var res = await fetch(KK_API + '/logs');
    var d = await res.json();
    var rows = (d.logs || []).map(function(l){
      return '<div style="padding:6px 0;border-bottom:1px solid #f1f5f9;"><span style="color:#9ca3af;">'+kkEsc(l.created_at)+'</span> <b>'+kkEsc(l.admin_name)+'</b> '
        + kkEsc(l.action) + ' ' + kkEsc(l.target||'') + (l.date?(' '+kkEsc(l.date)):'')
        + (l.old_value||l.new_value ? ('<br><span style="color:#6b7280;">'+kkEsc(l.old_value||'')+' → '+kkEsc(l.new_value||'')+'</span>') : '')
        + '</div>';
    }).join('');
    kkSel('#kk-logs-body').innerHTML = rows || '<div style="color:#9ca3af;">履歴はまだありません</div>';
  } catch (e) { kkSel('#kk-logs-body').textContent = '読み込みに失敗しました'; }
}

// ===== Excel取込 =====
var KK_XLSX_SRC = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
var _kkWb = null, _kkPayload = null;
function kkLoadXlsx(){
  return new Promise(function(resolve, reject){
    if (window.XLSX) return resolve();
    var s = document.createElement('script');
    s.src = KK_XLSX_SRC; s.onload = function(){ resolve(); }; s.onerror = function(){ reject(new Error('SheetJSの読み込みに失敗しました')); };
    document.head.appendChild(s);
  });
}
function kkOpenImport(){ kkOpen('kk-import-modal'); }
kkSel('#kk-import-file') && kkSel('#kk-import-file').addEventListener('change', async function(e){
  var f = e.target.files[0]; if (!f) return;
  kkSel('#kk-import-preview').textContent = '解析中...';
  try {
    await kkLoadXlsx();
    var buf = await f.arrayBuffer();
    _kkWb = window.XLSX.read(buf, { type: 'array' });
    var sheets = _kkWb.SheetNames.filter(function(n){ return /^\\d{4}[.\\/]\\d{1,2}/.test(n) || n.indexOf('土日') >= 0 || n.indexOf('当直') >= 0; });
    kkSel('#kk-import-sheets').innerHTML = '取り込むシート: <select id="kk-import-sheet">'
      + _kkWb.SheetNames.map(function(n){ return '<option value="'+kkEsc(n)+'">'+kkEsc(n)+'</option>'; }).join('') + '</select>'
      + ' <button class="kk-btn" onclick="kkParseSheet()">解析</button>';
    kkSel('#kk-import-preview').textContent = 'シートを選んで「解析」を押してください。月度シート（例: 2026.09）は '+KK_YEAR+'年'+KK_MONTH+'月度として取り込みます。';
  } catch (err) { kkSel('#kk-import-preview').textContent = 'エラー: ' + err.message; }
});
function kkCellStr(ws, r, c){
  var addr = window.XLSX.utils.encode_cell({ r: r, c: c });
  var cell = ws[addr];
  if (!cell) return '';
  return (cell.w != null ? String(cell.w) : String(cell.v != null ? cell.v : '')).trim();
}
function kkParseSheet(){
  var name = kkSel('#kk-import-sheet').value;
  var ws = _kkWb.Sheets[name];
  var ref = window.XLSX.utils.decode_range(ws['!ref']);
  if (name.indexOf('当直') >= 0) { _kkPayload = kkParseToitsu(ws, ref); }
  else if (name.indexOf('土日') >= 0) { _kkPayload = kkParseWeekend(ws, ref); }
  else { _kkPayload = kkParseMonth(ws, ref); }
  var p = _kkPayload;
  var summary = p.kind === 'month'
    ? ('月度シート: 名簿 '+p.members.length+'名 / セル '+p.cells.length+'件 / アサヒ '+p.asahi.length+'件 / 日別メモ '+p.dayNotes.length+'件')
    : p.kind === 'toitsu'
      ? ('当直回数: '+p.counts.length+'件 / ローテ順 '+(p.rotation?'あり':'なし'))
      : ('土日責任者: '+p.entries.length+'件');
  kkSel('#kk-import-preview').innerHTML = summary + '<br><span style="color:#dc2626;">この月度（'+KK_YEAR+'年'+KK_MONTH+'月度）の既存データを上書きします。</span>';
  kkSel('#kk-import-btn').disabled = false;
}
// 月度シート: 行4-9=課内, 15-21=管理者, 23-24=JOB, 26=アサヒ, 29-32=②, 35=日別メモ
// 日付は行2(0-index 1), B列(1)から。※行番号がずれる版もあるため氏名列(A)を走査してブロック推定
function kkParseMonth(ws, ref){
  var dateRow = 1;
  var dates = [];
  for (var c = 1; c <= ref.e.c; c++){
    var addr = window.XLSX.utils.encode_cell({ r: dateRow, c: c });
    var cell = ws[addr];
    if (!cell) { dates.push(null); continue; }
    var dv = null;
    if (cell.t === 'n' && cell.v > 30000) { var dt = window.XLSX.SSF.parse_date_code(cell.v); if (dt) dv = dt.y+'-'+String(dt.m).padStart(2,'0')+'-'+String(dt.d).padStart(2,'0'); }
    else if (cell.t === 'd' && cell.v instanceof Date) { var x = cell.v; dv = x.getUTCFullYear()+'-'+String(x.getUTCMonth()+1).padStart(2,'0')+'-'+String(x.getUTCDate()).padStart(2,'0'); }
    dates.push(dv);
  }
  var lastCol = 0; for (var i=0;i<dates.length;i++) if (dates[i]) lastCol = i+1;

  var members = [], cells = [], asahi = [], dayNotes = [];
  var blockRanges = [ ['kanai',3,9], ['kanri',13,22], ['sub2',27,33] ]; // 0-index行, 余裕を持たせて走査
  function pushBlock(block, r0, r1){
    var so = 10;
    for (var r = r0; r <= r1; r++){
      var nm = kkCellStr(ws, r, 0);
      // 氏名列にある集計行・見出し行はメンバーとして拾わない
      if (!nm || /合計|アサヒ|JOB|個タク|[①②＋]|勤務変更/.test(nm)) continue;
      var mid = 'imp:'+block+':'+nm;
      members.push({ tmp: mid, block: block, name: nm, abbr: nm.slice(0,1), sort_order: so }); so += 10;
      for (var c = 1; c <= lastCol; c++){
        var v = kkCellStr(ws, r, c);
        if (v && dates[c-1]) cells.push({ tmp: mid, date: dates[c-1], code: v });
      }
    }
  }
  for (var b = 0; b < blockRanges.length; b++) pushBlock(blockRanges[b][0], blockRanges[b][1], blockRanges[b][2]);
  // JOB行（"JOB"で始まる氏名）
  var so = 10;
  for (var r = 20; r <= 26; r++){
    var nm = kkCellStr(ws, r, 0);
    if (nm.indexOf('JOB') !== 0) continue;
    var mid = 'imp:job:'+nm;
    members.push({ tmp: mid, block: 'job', name: nm, abbr: '', sort_order: so }); so += 10;
    for (var c = 1; c <= lastCol; c++){
      var v = kkCellStr(ws, r, c);
      if (v && dates[c-1]) cells.push({ tmp: mid, date: dates[c-1], code: v });
    }
  }
  // アサヒ行・日別メモ行（氏名列で検出）
  for (var r = 22; r <= ref.e.r; r++){
    var nm = kkCellStr(ws, r, 0);
    if (nm === 'アサヒ'){
      for (var c = 1; c <= lastCol; c++){ var v = kkCellStr(ws, r, c); if (v && dates[c-1]) asahi.push({ date: dates[c-1], name: v }); }
    }
  }
  // 日別メモ = 行35近辺。①合計/②合計/①＋②/出勤数など「数字だけの行」と紛らわしいので、
  // 日付に対応する値のうち「数字でないもの」が最も多い行を採用する（元Excel B35:B39結合セル）
  var SYMBOLS = { '○':1,'〇':1,'公':1,'指公':1,'直':1,'明':1,'有':1,'不':1,'特':1,'早':1,'講':1,'祝':1 };
  var bestRow = -1, bestScore = 0, bestVals = [];
  for (var r = 28; r <= Math.min(ref.e.r, 46); r++){
    var a0 = kkCellStr(ws, r, 0);
    if (/合計|＋|①|②|勤務変更|アサヒ|JOB/.test(a0)) continue;
    var vals = [], noteLike = 0;
    for (var c = 1; c <= lastCol; c++){
      var v = kkCellStr(ws, r, c);
      if (!v || !dates[c-1]) continue;
      vals.push({ date: dates[c-1], content: v });
      if (!SYMBOLS[v] && !/^\\d+(\\.\\d+)?$/.test(v)) noteLike++;
    }
    if (noteLike > bestScore) { bestScore = noteLike; bestRow = r; bestVals = vals; }
  }
  if (bestRow >= 0 && bestScore >= 2) dayNotes = bestVals;
  return { kind: 'month', dates: dates.filter(Boolean), members: members, cells: cells, asahi: asahi, dayNotes: dayNotes };
}
function kkParseWeekend(ws, ref){
  // 土日責任者シート: A列/E列=日付(シリアル), B/F=曜日, C/G=当直明け担当名の見出し行の次, G列=土日責任者名
  // 構造が不定形のため「日付セル + 右隣以降の氏名らしき文字列」を素朴に拾う
  var entries = [];
  for (var r = 0; r <= ref.e.r; r++){
    for (var c = 0; c <= ref.e.c; c++){
      var cell = ws[window.XLSX.utils.encode_cell({ r: r, c: c })];
      if (!cell) continue;
      var dv = null;
      if (cell.t === 'n' && cell.v > 40000) { var dt = window.XLSX.SSF.parse_date_code(cell.v); if (dt) dv = dt.y+'-'+String(dt.m).padStart(2,'0')+'-'+String(dt.d).padStart(2,'0'); }
      if (!dv) continue;
      // 同じ行の右側セルから氏名を探す
      for (var cc = c+1; cc <= Math.min(ref.e.c, c+6); cc++){
        var s = kkCellStr(ws, r, cc);
        if (s && s.length <= 6 && !/曜|当直明け|賃締|^[月火水木金土日]$/.test(s)) entries.push({ date: dv, kind: 'resp', name: s });
      }
    }
  }
  return { kind: 'weekend', entries: entries };
}
function kkParseToitsu(ws, ref){
  // 当直回数シート: 行1=ヘッダー(月名), A列=氏名, 行10=ローテ順
  var header = [];
  for (var c = 1; c <= ref.e.c; c++){
    var s = kkCellStr(ws, 0, c);
    var m = s.match(/(\\d{4})\\D+(\\d{1,2})月/);
    if (m) header[c] = m[1] + '-' + String(m[2]).padStart(2, '0');
    else if (s.indexOf('前年度') >= 0) header[c] = 'prev';
    else header[c] = null;
  }
  var counts = [], rotation = '';
  for (var r = 1; r <= ref.e.r; r++){
    var nm = kkCellStr(ws, r, 0);
    if (!nm) continue;
    if (/山下|神﨑|→/.test(kkCellStr(ws, r, 3)) || nm.indexOf('ローテ') >= 0){
      var parts = [];
      for (var c = 0; c <= ref.e.c; c++){ var s = kkCellStr(ws, r, c); if (s) parts.push(s); }
      rotation = parts.join(' ');
      continue;
    }
    for (var c = 1; c <= ref.e.c; c++){
      if (!header[c]) continue;
      var v = kkCellStr(ws, r, c);
      if (v && /^\\d+$/.test(v)) counts.push({ person: nm, ym: header[c], cnt: Number(v) });
    }
  }
  return { kind: 'toitsu', counts: counts, rotation: rotation };
}
async function kkRunImport(){
  if (!_kkPayload) return;
  kkSel('#kk-import-btn').disabled = true;
  kkSel('#kk-import-btn').textContent = '取込中...';
  try {
    await kkPost('/import', { year: KK_YEAR, month: KK_MONTH, payload: _kkPayload });
    location.reload();
  } catch (e) {
    alert('取込に失敗しました: ' + e.message);
    kkSel('#kk-import-btn').disabled = false;
    kkSel('#kk-import-btn').textContent = 'この内容で取り込む';
  }
}
</script>`;
}

// ===== 印刷 =====
export function kanriKoboPrintPage(d: KkPageData): string {
  const { start, end } = kkPeriodRange(d.year, d.month);
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>管理者公休予定表 ${d.year}年${d.month}月度</title>
<style>
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family:'Hiragino Sans','Meiryo',sans-serif; margin:0; padding:10px; color:#111; }
  h1 { font-size:15px; margin:0 0 6px; }
  .kk-grid td, .kk-grid th { border:1px solid #999 !important; }
  #kk-print-scale { transform-origin: top left; }
  @media print { .noprint { display:none; } }
</style></head><body>
<div class="noprint" style="margin-bottom:8px;">
  <button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;">印刷</button>
</div>
<div id="kk-print-scale">
  <h1>管理者公休予定表　${d.year}年${d.month}月度（${start}〜${end}）</h1>
  ${gridTable(d, true)}
  ${d.memoNote ? `<div style="margin-top:8px;font-size:11px;white-space:pre-wrap;border:1px solid #999;padding:6px;">特記事項：${escHtml(d.memoNote)}</div>` : ''}
</div>
<script>
// A4横1枚に収まるよう6回反復で縮小（空白2枚目対策）
(function(){
  var el = document.getElementById('kk-print-scale');
  var pageW = 297 - 16, pageH = 210 - 16; // mm
  var mmToPx = 96 / 25.4;
  var maxW = pageW * mmToPx, maxH = pageH * mmToPx;
  var scale = 1;
  for (var i = 0; i < 6; i++){
    el.style.transform = 'scale(' + scale + ')';
    var r = el.getBoundingClientRect();
    var sw = r.width / scale, sh = r.height / scale;
    var s = Math.min(maxW / sw, maxH / sh, 1);
    if (Math.abs(s - scale) < 0.01) { scale = s; break; }
    scale = s;
  }
  el.style.transform = 'scale(' + scale + ')';
})();
</script>
</body></html>`;
}
