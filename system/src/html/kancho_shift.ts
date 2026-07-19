// 班長シフト（管理者公休予定表）画面
// 表示ルール（元Excelを踏襲）:
//   ・空白セル = 昼日勤出勤(7:30〜16:30)。班色で自動的に塗る
//   ・直 = 当直 9:00〜翌3:00 / 斜体の直 = 斜め直 14:00〜翌8:00
//   ・赤文字 = 希望休の反映
//   ・セル背景 = セル個別色(他班ヘルプ等) > 班色(直遅早) > 記号色 > 空白は班色
import { escHtml, safeJson } from './layout';
import { ADMIN_PATH } from '../config';

export type KanchoMember = {
  id: number;
  name: string;
  role: string | null;
  section: string;          // 'main' | 's1' | 's2'
  sort_order: number;
  is_active: number;
  team_color: string | null; // 班色(#rrggbb)
  is_indoor: number;         // 1=内勤班長(表に表示)
};

export type KanchoShiftType = {
  id: number;
  code: string;
  label: string;
  color: string;
  section: string;          // 'main' | 'sub' | 'all'
  daily_required: number;
  count_in_summary: number; // 旧集計フラグ（未使用・互換のため残置）
  sort_order: number;
  is_active: number;
  use_team_color: number;   // セル背景に班色を使う（直・遅・早）
  counts_as_work: number;   // 出勤数に含める
  counts_as_off: number;    // 公休数に含める
};

export type KanchoCell = {
  code: string;
  dg: number;               // 斜め直（斜体）
  ws: number;               // 希望休の反映（赤文字）
  cl: string | null;        // セル個別色
};

export type KanchoMemo = {
  id: number;
  year: number;
  month: number;
  kind: string;             // 'tokki' | 'kibou'
  title: string;
  content: string;
  sort_order: number;
};

export type KanchoWish = {
  id: number;
  member_id: number;
  date: string;
  note: string;
};

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];
const ROLE_ORDER = ['昼日勤班長', '終業班長', '教育班長', '研修課出向', '職員当直'];

// カウント列の定義（右端に固定4列。直は斜め直も合算）
const COUNT_COLS = [
  { key: 'work',  label: '出勤', color: '#bbf7d0' },
  { key: 'off',   label: '公休', color: '#e5e7eb' },
  { key: 'choku', label: '直',   color: '#c7d2fe' },
  { key: 'oso',   label: '遅',   color: '#fde68a' },
];

function roleRank(role: string | null): number {
  if (!role) return ROLE_ORDER.length + 1;
  const i = ROLE_ORDER.indexOf(role);
  return i === -1 ? ROLE_ORDER.length : i;
}

function sortMainMembers(members: KanchoMember[]): KanchoMember[] {
  return [...members].sort((a, b) =>
    roleRank(a.role) - roleRank(b.role) || a.sort_order - b.sort_order || a.id - b.id);
}

// セル背景色の決定（サーバー・印刷共通ロジック）
// 白の空白セル=未入力。色付きの空白セル（cell_colorのみの行）=早日勤出勤 7:30〜16:30
function cellBg(
  cell: KanchoCell | undefined, member: KanchoMember, _inPeriod: boolean,
  colorMap: Record<string, string>, teamColorCodes: Set<string>
): string {
  if (cell?.cl) return cell.cl;
  const code = cell?.code ?? '';
  if (code) {
    if (teamColorCodes.has(code) && member.team_color) return member.team_color;
    return colorMap[code] ?? '#fff7ed';
  }
  return '#ffffff';
}

function cellFont(cell: KanchoCell | undefined): string {
  let s = '';
  if (cell?.dg) s += 'font-style:italic;';
  if (cell?.ws) s += 'color:#dc2626;font-weight:700;';
  return s;
}

// メンバー1人の月度内カウント
function countsOf(
  m: KanchoMember, dates: string[], shiftMap: Record<string, KanchoCell>,
  periodStart: string, periodEnd: string, workCodes: Set<string>, offCodes: Set<string>
): Record<string, number> {
  const r: Record<string, number> = { work: 0, off: 0, choku: 0, oso: 0 };
  for (const d of dates) {
    if (d < periodStart || d > periodEnd) continue;
    const cell = shiftMap[`${m.id}_${d}`];
    const code = cell?.code ?? '';
    if (code === '') { if (cell?.cl) r.work++; continue; }  // 色マス（記号なし）= 早日勤出勤。白は未入力
    if (workCodes.has(code)) r.work++;
    if (offCodes.has(code)) r.off++;
    if (code === '直') r.choku++;                 // 斜め直も当直として合算
    if (code === '遅') r.oso++;
  }
  return r;
}

export function kanchoShiftPage(
  allMembers: KanchoMember[],
  types: KanchoShiftType[],
  shiftMap: Record<string, KanchoCell>,
  memos: KanchoMemo[],
  dates: string[],
  year: number,
  month: number,
  periodStart: string,
  periodEnd: string,
  canEdit: boolean,
  wishes: KanchoWish[] = []
): string {
  const members = allMembers.filter(m => m.is_active === 1);
  const wishSet = new Set(wishes.map(w => `${w.member_id}_${w.date}`));
  const activeTypes = types.filter(t => t.is_active === 1);
  const colorMap: Record<string, string> = {};
  for (const t of activeTypes) if (!(t.code in colorMap)) colorMap[t.code] = t.color;
  const teamColorCodes = new Set(activeTypes.filter(t => t.use_team_color === 1).map(t => t.code));
  const requiredTypes = activeTypes.filter(t => t.daily_required > 0);

  // メイン表は内勤班長のみ表示（乗務中の班長は名簿に残るが非表示）
  const mainMembers = sortMainMembers(members.filter(m => m.section === 'main' && m.is_indoor === 1));
  const s1Members = members.filter(m => m.section === 's1').sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const s2Members = members.filter(m => m.section === 's2').sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  const periodLabel = `${year}年${month}月度（${periodStart}〜${periodEnd}）`;
  let prevYear = year, prevMonth = month - 1;
  if (prevMonth < 1) { prevMonth = 12; prevYear--; }
  let nextYear = year, nextMonth = month + 1;
  if (nextMonth > 12) { nextMonth = 1; nextYear++; }

  const STICKY = 'position:sticky;z-index:2;';
  const HDR_BG = 'background:#1e3a5f;color:white;';
  const FIX_BG = 'background:#f8fafc;';

  function dateHeaders(): string {
    return dates.map(d => {
      const dt = new Date(d);
      const day = dt.getUTCDate();
      const dow = dt.getUTCDay();
      const isWeekend = dow === 0 || dow === 6;
      const inPeriod = d >= periodStart && d <= periodEnd;
      const bg = !inPeriod ? '#f3f4f6' : isWeekend ? '#fef2f2' : '#eff6ff';
      return `<th style="min-width:38px;max-width:38px;text-align:center;font-size:11px;padding:3px 1px;border:1px solid #d1d5db;background:${bg};${!inPeriod ? 'opacity:0.55;' : ''}">
        <div>${day}</div>
        <div style="color:${dow === 0 ? '#ef4444' : dow === 6 ? '#3b82f6' : '#374151'};">${WEEKDAY_JA[dow]}</div>
      </th>`;
    }).join('');
  }

  function cell(m: KanchoMember, d: string, secGroup: string): string {
    const s = shiftMap[`${m.id}_${d}`];
    const inPeriod = d >= periodStart && d <= periodEnd;
    const bg = cellBg(s, m, inPeriod, colorMap, teamColorCodes);
    const hasWish = wishSet.has(`${m.id}_${d}`);
    return `<td class="kc" data-member="${m.id}" data-date="${d}" data-name="${escHtml(m.name)}" data-sec="${secGroup}"
      data-code="${escHtml(s?.code ?? '')}" data-dg="${s?.dg ?? 0}" data-ws="${s?.ws ?? 0}" data-cl="${s?.cl ?? ''}"
      data-tc="${m.team_color ?? ''}" data-inp="${inPeriod ? 1 : 0}"${hasWish ? ' data-wish="1"' : ''}
      style="background:${bg};${cellFont(s)}position:relative;min-width:38px;max-width:38px;width:38px;text-align:center;font-size:11px;padding:5px 1px;border:1px solid #d1d5db;${canEdit ? 'cursor:pointer;' : ''}overflow:hidden;white-space:nowrap;touch-action:manipulation;${inPeriod ? '' : 'opacity:0.45;'}">${escHtml(s?.code ?? '')}</td>`;
  }

  function mainRows(): string {
    let html = '';
    let lastRole: string | null = null;
    for (const m of mainMembers) {
      const role = m.role ?? 'その他';
      if (role !== lastRole) {
        html += `<tr><td colspan="${1 + dates.length + COUNT_COLS.length}" style="background:#e0e7ff;font-size:11px;font-weight:bold;padding:3px 8px;border:1px solid #d1d5db;position:sticky;left:0;">● ${escHtml(role)}</td></tr>`;
        lastRole = role;
      }
      const cells = dates.map(d => cell(m, d, 'main')).join('');
      const counts = COUNT_COLS.map(cc =>
        `<td class="kcount" data-member="${m.id}" data-kind="${cc.key}"
          style="min-width:30px;text-align:center;font-size:11px;font-weight:600;border:1px solid #d1d5db;background:${cc.color};padding:2px;"></td>`
      ).join('');
      const nameBg = m.team_color ? `background:linear-gradient(to right, ${m.team_color} 6px, #f8fafc 6px);` : FIX_BG;
      html += `<tr>
        <td style="min-width:92px;max-width:92px;font-size:12px;font-weight:600;border:1px solid #d1d5db;padding:3px 6px 3px 10px;${STICKY}left:0;${nameBg}white-space:nowrap;overflow:hidden;">${escHtml(m.name)}</td>
        ${cells}${counts}
      </tr>`;
    }
    // 日別必要人数チェック行（斜め直も「直」に含めてカウント）
    for (const t of requiredTypes) {
      const cells = dates.map(d => {
        const inPeriod = d >= periodStart && d <= periodEnd;
        return `<td class="kreq" data-code="${escHtml(t.code)}" data-date="${d}" data-req="${t.daily_required}"
          style="min-width:38px;text-align:center;font-size:10px;border:1px solid #d1d5db;padding:2px 1px;${inPeriod ? '' : 'opacity:0.45;'}"></td>`;
      }).join('');
      html += `<tr>
        <td style="font-size:10px;font-weight:600;border:1px solid #d1d5db;padding:2px 6px;${STICKY}left:0;background:${t.color};white-space:nowrap;">${escHtml(t.code)} 必要${t.daily_required}</td>
        ${cells}<td colspan="${COUNT_COLS.length}" style="border:1px solid #d1d5db;background:#f8fafc;"></td>
      </tr>`;
    }
    return html;
  }

  function subTable(title: string, list: KanchoMember[], secGroup: string): string {
    if (list.length === 0) return '';
    const rows = list.map(m => `<tr>
      <td style="min-width:92px;font-size:12px;font-weight:600;border:1px solid #d1d5db;padding:3px 6px;${STICKY}left:0;${FIX_BG}white-space:nowrap;">${escHtml(m.name)}</td>
      ${dates.map(d => cell(m, d, secGroup)).join('')}
    </tr>`).join('');
    return `
    <h3 style="font-size:13px;font-weight:700;color:#1e3a5f;margin:18px 0 6px;">${escHtml(title)}</h3>
    <div style="overflow-x:auto;border:1px solid #d1d5db;border-radius:8px;-webkit-overflow-scrolling:touch;">
      <table style="border-collapse:collapse;table-layout:fixed;">
        <thead style="position:sticky;top:0;z-index:10;background:white;">
          <tr>
            <th style="min-width:92px;${STICKY}left:0;z-index:20;${HDR_BG}font-size:11px;padding:4px;border:1px solid #4b6cb7;">氏名</th>
            ${dateHeaders()}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  const tokki = memos.find(mm => mm.kind === 'tokki')?.content ?? '';
  const kibou = memos.filter(mm => mm.kind === 'kibou');

  const kibouReadRows = kibou.map(k =>
    `<tr><td style="padding:3px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;font-weight:600;white-space:nowrap;">${escHtml(k.title)}</td>
     <td style="padding:3px 8px;border-bottom:1px solid #f3f4f6;font-size:12px;">${escHtml(k.content)}</td></tr>`).join('');

  const memoSection = `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px;align-items:start;" id="memo-area">
    <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">・特記事項</div>
      ${canEdit
        ? `<textarea id="memo-tokki" rows="5" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;font-family:inherit;box-sizing:border-box;">${escHtml(tokki)}</textarea>`
        : `<div style="font-size:13px;white-space:pre-wrap;">${escHtml(tokki) || '<span style="color:#9ca3af;">なし</span>'}</div>`}
    </div>
    <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">・希望休</div>
      ${canEdit
        ? `<div id="kibou-rows">${kibou.map(k => `
            <div class="kibou-row" style="display:flex;gap:6px;margin-bottom:5px;">
              <input type="text" class="kibou-name" value="${escHtml(k.title)}" placeholder="名前" style="width:90px;border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:13px;">
              <input type="text" class="kibou-text" value="${escHtml(k.content)}" placeholder="希望内容（例: 7/19 7/20）" style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:13px;">
              <button onclick="this.parentElement.remove()" style="border:1px solid #fca5a5;background:#fef2f2;color:#dc2626;border-radius:6px;padding:0 10px;cursor:pointer;">✕</button>
            </div>`).join('')}
          </div>
          <button onclick="addKibouRow()" style="font-size:12px;padding:5px 12px;border:1px dashed #9ca3af;border-radius:6px;background:#f9fafb;cursor:pointer;">＋ 行を追加</button>`
        : (kibou.length
            ? `<table style="width:100%;border-collapse:collapse;">${kibouReadRows}</table>`
            : `<div style="font-size:13px;color:#9ca3af;">なし</div>`)}
    </div>
  </div>
  ${canEdit ? `<div style="margin-top:8px;text-align:right;">
    <button onclick="saveMemos()" id="memo-save-btn" style="padding:8px 20px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation;">メモを保存</button>
  </div>` : ''}`;

  // ===== メインHTML =====
  return `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap;">
    <a href="${ADMIN_PATH}/kancho-shift?year=${prevYear}&month=${prevMonth}" class="btn-nav">◀ 前月度</a>
    <h2 style="font-size:15px;font-weight:bold;color:#1e3a5f;">${escHtml(periodLabel)}</h2>
    <a href="${ADMIN_PATH}/kancho-shift?year=${nextYear}&month=${nextMonth}" class="btn-nav">次月度 ▶</a>
    <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <a href="${ADMIN_PATH}/kancho-shift/print?year=${year}&month=${month}" target="_blank" class="btn-secondary">🖨️ 印刷</a>
      <button onclick="openHistory()" class="btn-secondary" style="border:none;cursor:pointer;">履歴</button>
      ${canEdit ? `
      <button onclick="openWishes()" class="btn-secondary" style="border:none;cursor:pointer;background:#dc2626;">希望休</button>
      <button onclick="openNotify()" class="btn-secondary" style="border:none;cursor:pointer;">通知設定</button>
      <button onclick="openMembers()" class="btn-secondary" style="border:none;cursor:pointer;">名簿管理</button>
      <button onclick="openTypes()" class="btn-secondary" style="border:none;cursor:pointer;">記号管理</button>` : ''}
    </div>
  </div>

  ${canEdit ? `
  <div id="edit-mode-bar" style="display:none;background:#fffbeb;border:2px solid #fbbf24;border-radius:8px;padding:10px 14px;margin-bottom:8px;align-items:center;gap:10px;flex-wrap:wrap;">
    <span style="color:#d97706;font-weight:700;font-size:13px;">編集モード中</span>
    <span id="pending-count-label" style="color:#92400e;font-size:13px;background:#fef3c7;padding:2px 8px;border-radius:4px;border:1px solid #fbbf24;">変更 0件</span>
    <span id="edit-error" style="display:none;color:#dc2626;font-size:12px;"></span>
    <div style="margin-left:auto;display:flex;gap:8px;">
      <button onclick="autoAssign()" style="padding:8px 16px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation;">希望休を自動反映</button>
      <button onclick="cancelEdit()" style="padding:8px 16px;background:#fff;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;touch-action:manipulation;">キャンセル</button>
      <button onclick="batchSave()" id="batch-save-btn" disabled style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation;opacity:0.5;">一括保存</button>
    </div>
  </div>
  <div id="cp-mode-bar" style="display:none;background:#eff6ff;border:2px solid #60a5fa;border-radius:8px;padding:10px 14px;margin-bottom:8px;align-items:center;gap:10px;flex-wrap:wrap;">
    <span style="color:#1d4ed8;font-weight:700;font-size:13px;">コピペ編集モード</span>
    <span id="cp-clip-label" style="color:#1e40af;font-size:13px;background:#dbeafe;padding:2px 10px;border-radius:4px;border:1px solid #93c5fd;">コピーするマスをタップしてください</span>
    <span id="cp-pending-label" style="color:#92400e;font-size:13px;background:#fef3c7;padding:2px 8px;border-radius:4px;border:1px solid #fbbf24;">変更 0件</span>
    <div style="margin-left:auto;display:flex;gap:8px;">
      <button onclick="cpRepick()" style="padding:8px 14px;background:#dbeafe;border:1px solid #93c5fd;color:#1d4ed8;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation;">別のマスをコピー</button>
      <button onclick="cancelEdit()" style="padding:8px 16px;background:#fff;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;touch-action:manipulation;">キャンセル</button>
      <button onclick="batchSave()" id="cp-save-btn" disabled style="padding:8px 16px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation;opacity:0.5;">一括保存</button>
    </div>
  </div>
  <div style="margin-bottom:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;" id="edit-start-wrap">
    <button onclick="startEdit()" id="edit-start-btn" style="padding:7px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;font-size:13px;font-weight:600;color:#166534;cursor:pointer;touch-action:manipulation;">編集モードを開始</button>
    <button onclick="startCpMode()" style="padding:7px 16px;background:#eff6ff;border:1px solid #93c5fd;border-radius:6px;font-size:13px;font-weight:600;color:#1d4ed8;cursor:pointer;touch-action:manipulation;">コピペ編集モード</button>
    <span style="font-size:11px;color:#9ca3af;">通常編集はセルをタップして入力、コピペ編集はマスのコピー＆連続貼り付けができます</span>
  </div>` : `
  <div style="margin-bottom:8px;font-size:12px;color:#6b7280;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:6px 12px;display:inline-block;">閲覧専用（編集権限がありません）</div>`}

  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;font-size:11px;align-items:center;">
    ${activeTypes.map(t =>
      `<span style="background:${t.color};padding:2px 8px;border-radius:4px;border:1px solid #d1d5db;" title="${escHtml(t.label)}">${escHtml(t.code)}${t.label ? `<span style="color:#374151;font-size:10px;"> ${escHtml(t.label)}</span>` : ''}</span>`
    ).join('')}
  </div>
  <div style="font-size:11px;color:#6b7280;margin-bottom:10px;">
    色マス（記号なし）＝早日勤 7:30〜16:30 ／ 白マス＝未入力 ／ <i>斜体の直</i>＝斜め直 14:00〜翌8:00 ／ 終業班長 3:00〜12:00 ／ <span style="color:#dc2626;font-weight:700;">赤文字</span>＝希望休の反映
  </div>

  <div style="overflow-x:auto;overflow-y:auto;max-height:70vh;border:1px solid #d1d5db;border-radius:8px;-webkit-overflow-scrolling:touch;">
    <table style="border-collapse:collapse;table-layout:fixed;">
      <thead style="position:sticky;top:0;z-index:10;background:white;">
        <tr>
          <th style="min-width:92px;${STICKY}left:0;z-index:20;${HDR_BG}font-size:11px;padding:4px;border:1px solid #4b6cb7;">氏名</th>
          ${dateHeaders()}
          ${COUNT_COLS.map(cc => `<th style="min-width:30px;${HDR_BG}font-size:10px;padding:4px 2px;border:1px solid #4b6cb7;">${cc.label}</th>`).join('')}
        </tr>
      </thead>
      <tbody>${mainRows()}</tbody>
    </table>
  </div>

  ${subTable('① 表', s1Members, 's1')}
  ${subTable('② 表', s2Members, 's2')}
  ${memoSection}
</div>

<!-- セル編集モーダル -->
<div id="cell-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow-y:auto;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;">
      <div>
        <div id="modal-name" style="font-size:15px;font-weight:700;color:#1e3a5f;"></div>
        <div id="modal-date-label" style="font-size:12px;color:#6b7280;margin-top:2px;"></div>
      </div>
      <button onclick="closeCellModal()" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;padding:0 4px;line-height:1;">✕</button>
    </div>
    <div id="blank-work-wrap" style="margin-bottom:8px;">
      <button id="blank-work-btn" onclick="setBlankWork()" style="width:100%;padding:10px;border:2px solid #16a34a;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;touch-action:manipulation;">早日勤で出勤（文字なしの色マス）</button>
      <div style="font-size:10px;color:#9ca3af;margin-top:3px;">記号なしの色付きマス（早日勤 7:30〜16:30）になります。「クリア」は白（未入力）に戻します</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;" id="preset-buttons"></div>
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
      <button id="seq-prev" onclick="seqNav(-1)" style="padding:8px 14px;font-size:18px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;touch-action:manipulation;flex-shrink:0;line-height:1;">◀</button>
      <input id="modal-code" type="text" placeholder="記号を選択または自由入力（空白=出勤）"
        style="flex:1;border:1px solid #93c5fd;border-radius:6px;padding:10px;font-size:16px;font-family:inherit;outline:none;box-sizing:border-box;">
      <button id="seq-next" onclick="seqNav(1)" style="padding:8px 14px;font-size:18px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;cursor:pointer;touch-action:manipulation;flex-shrink:0;line-height:1;">▶</button>
    </div>
    <div style="display:flex;gap:14px;margin-bottom:10px;flex-wrap:wrap;">
      <label style="font-size:13px;display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" id="modal-dg"><i>斜め直（14:00〜翌8:00）</i></label>
      <label style="font-size:13px;display:flex;align-items:center;gap:5px;cursor:pointer;"><input type="checkbox" id="modal-ws"><span style="color:#dc2626;font-weight:700;">希望休の反映（赤文字）</span></label>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
      <span style="font-size:12px;color:#6b7280;white-space:nowrap;">セルの色:</span>
      <select id="modal-cl" style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;background:white;">
        <option value="">自動（班色）</option>
        <option value="#00ff00">黄緑</option>
        <option value="#ffff00">黄色</option>
        <option value="#00ffff">水色</option>
        <option value="#ff99cc">ピンク</option>
        <option value="#ff0000">赤</option>
        <option value="#a5a5a5">グレー</option>
        <option value="#ffffff">白</option>
      </select>
    </div>
    <div style="display:flex;gap:8px;">
      <button onclick="clearCell()" style="flex:1;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;cursor:pointer;background:#fff;touch-action:manipulation;">クリア</button>
      <button onclick="applyCell(true)" style="flex:2;padding:10px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;touch-action:manipulation;">適用</button>
    </div>
  </div>
</div>

<!-- 履歴モーダル -->
<div id="history-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:640px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;">編集履歴（最新200件）</h3>
      <button onclick="sel('#history-modal').style.display='none'" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div id="history-body" style="font-size:12px;color:#6b7280;">読み込み中...</div>
  </div>
</div>

<!-- 名簿管理モーダル -->
<div id="members-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:760px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;">名簿管理</h3>
      <button onclick="sel('#members-modal').style.display='none'" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">
      「内勤」がオンの班長だけがシフト表に表示されます（乗務に戻ったらオフに）。班色は2人1組の班の色です。変更は行ごとの「保存」で反映されます。
    </div>
    <div id="members-body"></div>
    <div style="border-top:2px solid #e5e7eb;margin-top:14px;padding-top:12px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">＋ メンバー追加</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        <input id="new-mem-name" type="text" placeholder="名前" style="width:100px;border:1px solid #d1d5db;border-radius:6px;padding:7px;font-size:13px;">
        <input id="new-mem-role" type="text" list="role-list" placeholder="役割（mainのみ）" style="width:130px;border:1px solid #d1d5db;border-radius:6px;padding:7px;font-size:13px;">
        <select id="new-mem-section" style="border:1px solid #d1d5db;border-radius:6px;padding:7px;font-size:13px;">
          <option value="main">班長シフト表</option><option value="s1">①表</option><option value="s2">②表</option>
        </select>
        <select id="new-mem-color" style="border:1px solid #d1d5db;border-radius:6px;padding:7px;font-size:13px;">
          <option value="">班色なし</option><option value="#00ff00">黄緑</option><option value="#ffff00">黄色</option>
          <option value="#00ffff">水色</option><option value="#ff99cc">ピンク</option>
        </select>
        <label style="font-size:12px;display:flex;align-items:center;gap:3px;"><input id="new-mem-indoor" type="checkbox" checked>内勤</label>
        <input id="new-mem-sort" type="number" placeholder="順" style="width:56px;border:1px solid #d1d5db;border-radius:6px;padding:7px;font-size:13px;">
        <button onclick="addMember()" style="padding:7px 16px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">追加</button>
      </div>
      <datalist id="role-list">${ROLE_ORDER.map(r => `<option value="${r}">`).join('')}</datalist>
    </div>
  </div>
</div>

<!-- 記号管理モーダル -->
<div id="types-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:820px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;">シフト記号管理</h3>
      <button onclick="sel('#types-modal').style.display='none'" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">
      班色=セル背景に本人の班色を使う（直・遅・早）。出勤/公休=右端の出勤数・公休数カウントに含める。必要人数=日別チェック行（遅1・直2）。
    </div>
    <div id="types-body"></div>
    <div style="border-top:2px solid #e5e7eb;margin-top:14px;padding-top:12px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">＋ 記号追加</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        <input id="new-type-code" type="text" placeholder="記号" style="width:56px;border:1px solid #d1d5db;border-radius:6px;padding:7px;font-size:13px;">
        <input id="new-type-label" type="text" placeholder="説明" style="width:160px;border:1px solid #d1d5db;border-radius:6px;padding:7px;font-size:13px;">
        <input id="new-type-color" type="color" value="#e5e7eb" style="width:44px;height:34px;border:1px solid #d1d5db;border-radius:6px;padding:2px;cursor:pointer;">
        <select id="new-type-section" style="border:1px solid #d1d5db;border-radius:6px;padding:7px;font-size:13px;">
          <option value="main">班長表</option><option value="sub">①②表</option><option value="all">両方</option>
        </select>
        <input id="new-type-req" type="number" placeholder="必要人数" title="日別必要人数" style="width:76px;border:1px solid #d1d5db;border-radius:6px;padding:7px;font-size:13px;">
        <label style="font-size:12px;display:flex;align-items:center;gap:3px;"><input id="new-type-teamcolor" type="checkbox">班色</label>
        <label style="font-size:12px;display:flex;align-items:center;gap:3px;"><input id="new-type-work" type="checkbox">出勤</label>
        <label style="font-size:12px;display:flex;align-items:center;gap:3px;"><input id="new-type-off" type="checkbox">公休</label>
        <button onclick="addType()" style="padding:7px 16px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">追加</button>
      </div>
    </div>
  </div>
</div>

<!-- 希望休モーダル -->
<div id="wishes-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:680px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;">希望休入力（${year}年${month}月度）</h3>
      <button onclick="sel('#wishes-modal').style.display='none'" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">
      メンバーを選んで日付をタップすると希望休が登録/解除されます（即時保存）。表のセルに赤い▲が付きます。<br>
      編集モード中の「希望休を自動反映」で、希望休の日に公休（赤文字）が自動入力されます。
    </div>
    <select id="wish-member" onchange="renderWishDates()" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:9px;font-size:14px;background:white;margin-bottom:10px;"></select>
    <div id="wish-dates" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px;"></div>
    <div style="font-size:13px;font-weight:700;color:#1e3a5f;border-top:1px solid #e5e7eb;padding-top:10px;margin-bottom:6px;">登録済みの希望休一覧</div>
    <div id="wish-list" style="font-size:12px;"></div>
  </div>
</div>

<!-- 通知設定モーダル -->
<div id="notify-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:520px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;">0時LINE通知設定</h3>
      <button onclick="sel('#notify-modal').style.display='none'" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:12px;">
      毎日深夜0時に「本日の出勤者」（日勤・当直・斜め直・遅番・終業班長）をLINEで送信します。<br>
      送信されるのは統括管理者・運行管理者のうち、ここでオンにした人だけです。
    </div>
    <div id="notify-body" style="font-size:13px;color:#6b7280;">読み込み中...</div>
    <div style="margin-top:14px;display:flex;justify-content:flex-end;">
      <button onclick="notifyTest()" id="notify-test-btn" style="padding:8px 16px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">今すぐテスト送信</button>
    </div>
  </div>
</div>

<div id="save-toast" style="display:none;position:fixed;bottom:24px;right:24px;background:#166534;color:white;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.25);"></div>

<style>
  .btn-nav { padding:6px 14px;background:#4b6cb7;color:white;border-radius:6px;text-decoration:none;font-size:13px; }
  .btn-nav:hover { background:#3b5aa3; }
  .btn-secondary { padding:6px 14px;background:#6b7280;color:white;border-radius:6px;text-decoration:none;font-size:13px; }
  .kc:active { opacity:0.6; }
  .kc[data-pending="true"] { outline:2px dashed #f59e0b !important; }
  .kc[data-copysrc="1"] { outline:3px solid #2563eb !important; outline-offset:-3px; }
  .kc[data-wish="1"]::after { content:''; position:absolute; top:0; right:0; border-style:solid; border-width:0 7px 7px 0; border-color:transparent #dc2626 transparent transparent; }
  .kreq-ng { background:#fee2e2 !important; color:#dc2626; font-weight:700; }
  .kreq-ok { background:#f0fdf4 !important; color:#166534; }
</style>

<script>
var CAN_EDIT = ${canEdit ? 'true' : 'false'};
var API = '${ADMIN_PATH}/api/kancho';
var _year = ${year}, _month = ${month};
var periodStart = '${periodStart}', periodEnd = '${periodEnd}';
var _dates = ${safeJson(dates)};
var _types = ${safeJson(activeTypes.map(t => ({ id: t.id, code: t.code, color: t.color, section: t.section, tc: t.use_team_color, wk: t.counts_as_work, off: t.counts_as_off })))};
var _allTypes = ${safeJson(types.map(t => ({ id: t.id, code: t.code, label: t.label, color: t.color, section: t.section, daily_required: t.daily_required, sort_order: t.sort_order, is_active: t.is_active, use_team_color: t.use_team_color, counts_as_work: t.counts_as_work, counts_as_off: t.counts_as_off })))};
var _allMembers = ${safeJson(allMembers.map(m => ({ id: m.id, name: m.name, role: m.role, section: m.section, sort_order: m.sort_order, is_active: m.is_active, team_color: m.team_color, is_indoor: m.is_indoor })))};
var colorMap = {};
var teamColorCodes = {};
var workCodes = {};
var offCodes = {};
_types.forEach(function(t) {
  if (!(t.code in colorMap)) colorMap[t.code] = t.color;
  if (t.tc) teamColorCodes[t.code] = 1;
  if (t.wk) workCodes[t.code] = 1;
  if (t.off) offCodes[t.code] = 1;
});

var _editMode = false;
var _cpMode = false;     // コピペ編集モード
var _cpPicking = false;  // コピー元選択待ち
var _cpClip = null;      // コピー中のセル内容 {code, dg, ws, cl}
var _pending = {};   // key: memberId_date -> entry
var _cur = null;     // {memberId, date, name, sec}
var _wishes = ${safeJson(wishes)};  // [{id, member_id, date, note}]

function sel(s) { return document.querySelector(s); }
function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function showToast(msg) {
  var el = sel('#save-toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(function() { el.style.display = 'none'; }, 3000);
}

// セルの見た目をdata属性から再描画（Excelの色ルールを再現）
// 白の空白=未入力 / 色付きの空白(cell_colorのみ)=早日勤出勤
function paintCell(td) {
  var code = td.dataset.code || '';
  var cl = td.dataset.cl || '';
  var tc = td.dataset.tc || '';
  var bg;
  if (cl) bg = cl;
  else if (code) bg = (teamColorCodes[code] && tc) ? tc : (colorMap[code] || '#fff7ed');
  else bg = '#ffffff';
  td.style.background = bg;
  td.style.fontStyle = td.dataset.dg === '1' ? 'italic' : 'normal';
  if (td.dataset.ws === '1') { td.style.color = '#dc2626'; td.style.fontWeight = '700'; }
  else { td.style.color = ''; td.style.fontWeight = ''; }
  td.textContent = code;
}

// ===== 集計の再計算 =====
function recalcAll() {
  document.querySelectorAll('.kcount').forEach(function(td) {
    var mid = td.dataset.member, kind = td.dataset.kind, n = 0;
    document.querySelectorAll('.kc[data-member="' + mid + '"]').forEach(function(c) {
      var d = c.dataset.date;
      if (d < periodStart || d > periodEnd) return;
      var code = c.dataset.code || '';
      if (kind === 'work')       { if (code === '' ? c.dataset.cl : workCodes[code]) n++; }
      else if (kind === 'off')   { if (offCodes[code]) n++; }
      else if (kind === 'choku') { if (code === '直') n++; }  // 斜め直も当直として合算
      else if (kind === 'oso')   { if (code === '遅') n++; }
    });
    td.textContent = n > 0 ? n : '';
  });
  document.querySelectorAll('.kreq').forEach(function(td) {
    var code = td.dataset.code, date = td.dataset.date, req = parseInt(td.dataset.req), n = 0;
    document.querySelectorAll('.kc[data-sec="main"][data-date="' + date + '"]').forEach(function(c) {
      if ((c.dataset.code || '') === code) n++;
    });
    td.textContent = n + '/' + req;
    td.classList.remove('kreq-ok', 'kreq-ng');
    td.classList.add(n === req ? 'kreq-ok' : 'kreq-ng');
  });
}
recalcAll();

// ===== 編集モード / コピペ編集モード =====
function startEdit() {
  _editMode = true;
  sel('#edit-start-wrap').style.display = 'none';
  sel('#edit-mode-bar').style.display = 'flex';
  window.addEventListener('beforeunload', _beforeUnload);
}
function startCpMode() {
  _cpMode = true;
  _cpPicking = true;
  _cpClip = null;
  sel('#edit-start-wrap').style.display = 'none';
  sel('#cp-mode-bar').style.display = 'flex';
  sel('#cp-clip-label').textContent = 'コピーするマスをタップしてください';
  window.addEventListener('beforeunload', _beforeUnload);
}
function _beforeUnload(e) {
  if (Object.keys(_pending).length > 0) { e.preventDefault(); e.returnValue = ''; }
}
function _exitAllModes() {
  _editMode = false;
  _cpMode = false;
  _cpClip = null;
  window.removeEventListener('beforeunload', _beforeUnload);
  sel('#edit-start-wrap').style.display = 'flex';
  sel('#edit-mode-bar').style.display = 'none';
  sel('#cp-mode-bar').style.display = 'none';
  document.querySelectorAll('.kc[data-copysrc]').forEach(function(td) { delete td.dataset.copysrc; });
}
function cancelEdit() {
  var n = Object.keys(_pending).length;
  if (n > 0 && !confirm(n + '件の未保存変更を破棄しますか？')) return;
  _exitAllModes();
  if (n > 0) location.reload();
}
function _updatePending() {
  var n = Object.keys(_pending).length;
  var lbl1 = sel('#pending-count-label');
  var lbl2 = sel('#cp-pending-label');
  if (lbl1) lbl1.textContent = '変更 ' + n + '件';
  if (lbl2) lbl2.textContent = '変更 ' + n + '件';
  ['#batch-save-btn', '#cp-save-btn'].forEach(function(id) {
    var btn = sel(id);
    if (!btn) return;
    btn.disabled = n === 0;
    btn.style.opacity = n === 0 ? '0.5' : '1';
  });
}
async function batchSave() {
  var entries = Object.values(_pending);
  if (entries.length === 0) return;
  var btns = ['#batch-save-btn', '#cp-save-btn'].map(sel).filter(Boolean);
  btns.forEach(function(b) { b.disabled = true; b.textContent = '保存中...'; });
  var err = sel('#edit-error');
  if (err) err.style.display = 'none';
  try {
    var res = await fetch(API + '/shifts/batch', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ entries: entries })
    });
    if (!res.ok) {
      var d = await res.json().catch(function() { return {}; });
      throw new Error(d.error || 'server');
    }
    document.querySelectorAll('.kc[data-pending="true"]').forEach(function(td) { delete td.dataset.pending; });
    _pending = {};
    _exitAllModes();
    showToast('保存しました');
  } catch(e) {
    if (err) { err.textContent = '保存に失敗しました: ' + (e.message || ''); err.style.display = 'block'; }
    else alert('保存に失敗しました: ' + (e.message || ''));
  } finally {
    btns.forEach(function(b) { b.textContent = '一括保存'; });
    _updatePending();
  }
}

// ===== コピペ編集 =====
function cpRepick() {
  _cpPicking = true;
  document.querySelectorAll('.kc[data-copysrc]').forEach(function(td) { delete td.dataset.copysrc; });
  sel('#cp-clip-label').textContent = 'コピーするマスをタップしてください';
}
function cpTap(td) {
  if (_cpPicking || _cpClip === null) {
    // コピー元を取得（記号＋斜め直＋赤文字＋セル色を丸ごとコピー）
    _cpClip = {
      code: td.dataset.code || '',
      dg: td.dataset.dg === '1' ? 1 : 0,
      ws: td.dataset.ws === '1' ? 1 : 0,
      cl: td.dataset.cl || null
    };
    _cpPicking = false;
    document.querySelectorAll('.kc[data-copysrc]').forEach(function(x) { delete x.dataset.copysrc; });
    td.dataset.copysrc = '1';
    var label = (_cpClip.code || '空白') + (_cpClip.dg ? '(斜め)' : '') + (_cpClip.ws ? '(赤字)' : '') + (_cpClip.cl ? '(色付)' : '');
    sel('#cp-clip-label').innerHTML = 'コピー中「<b>' + escH(label) + '</b>」→ 貼り付けたいマスをタップ';
    return;
  }
  if (td.dataset.copysrc === '1') return; // コピー元自身への貼り付けは無視
  var key = td.dataset.member + '_' + td.dataset.date;
  _pending[key] = {
    member_id: parseInt(td.dataset.member), date: td.dataset.date,
    code: _cpClip.code || null, is_diagonal: _cpClip.dg, is_wish: _cpClip.ws, cell_color: _cpClip.cl
  };
  td.dataset.code = _cpClip.code;
  td.dataset.dg = String(_cpClip.dg);
  td.dataset.ws = String(_cpClip.ws);
  td.dataset.cl = _cpClip.cl || '';
  td.dataset.pending = 'true';
  paintCell(td);
  _updatePending();
  recalcAll();
}

// セルのタップはイベント委譲で一括処理（タップ検知の取りこぼし防止）
document.addEventListener('click', function(e) {
  var t = e.target;
  var td = (t && t.closest) ? t.closest('.kc') : null;
  if (!td || !CAN_EDIT) return;
  if (_cpMode) { cpTap(td); return; }
  openCell(td);
});

// ===== セル編集 =====
function _presetsFor(sec) {
  return _types.filter(function(t) {
    return sec === 'main' ? (t.section === 'main' || t.section === 'all')
                          : (t.section === 'sub' || t.section === 'all');
  });
}
function _cellTd() {
  return sel('.kc[data-member="' + _cur.memberId + '"][data-date="' + _cur.date + '"]');
}
function _loadCellToModal(td) {
  sel('#modal-code').value = td.dataset.code || '';
  sel('#modal-dg').checked = td.dataset.dg === '1';
  sel('#modal-ws').checked = td.dataset.ws === '1';
  sel('#modal-cl').value = td.dataset.cl || '';
}
function openCell(td) {
  if (!CAN_EDIT) return;
  if (!_editMode) { showToast('編集モードを開始してください'); return; }
  _cur = { memberId: td.dataset.member, date: td.dataset.date, name: td.dataset.name, sec: td.dataset.sec };
  sel('#modal-name').textContent = td.dataset.name;
  var dow = ['日','月','火','水','木','金','土'][new Date(td.dataset.date).getUTCDay()];
  sel('#modal-date-label').textContent = td.dataset.date + '（' + dow + '）';
  sel('#preset-buttons').innerHTML = _presetsFor(td.dataset.sec).map(function(t) {
    return '<button data-code="' + escH(t.code) + '" onclick="selectPreset(this.dataset.code)" style="padding:6px 11px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;background:' + t.color + ';touch-action:manipulation;">' + escH(t.code) + '</button>';
  }).join('');
  // 早日勤（空白＋班色）ボタン: メイン表のみ表示。本人の班色をボタン背景に
  var bw = sel('#blank-work-wrap');
  bw.style.display = td.dataset.sec === 'main' ? '' : 'none';
  sel('#blank-work-btn').style.background = td.dataset.tc || '#f0fdf4';
  _loadCellToModal(td);
  _updateSeqBtns();
  sel('#cell-modal').style.display = 'flex';
  document.onkeydown = function(e) { if (e.key === 'Escape') closeCellModal(); };
}
function selectPreset(code) {
  sel('#modal-code').value = code;
}
function closeCellModal() {
  sel('#cell-modal').style.display = 'none';
  _cur = null;
  document.onkeydown = null;
}
function _applyToPending(clOverride) {
  if (!_cur) return;
  var code = sel('#modal-code').value.trim();
  var dg = sel('#modal-dg').checked ? 1 : 0;
  var ws = sel('#modal-ws').checked ? 1 : 0;
  var cl = clOverride !== undefined ? clOverride : (sel('#modal-cl').value || null);
  var key = _cur.memberId + '_' + _cur.date;
  var td = _cellTd();
  _pending[key] = { member_id: parseInt(_cur.memberId), date: _cur.date, code: code || null, is_diagonal: dg, is_wish: ws, cell_color: cl };
  if (td) {
    td.dataset.code = code;
    td.dataset.dg = String(dg);
    td.dataset.ws = String(ws);
    td.dataset.cl = cl || '';
    td.dataset.pending = 'true';
    paintCell(td);
  }
  _updatePending();
  recalcAll();
}
function applyCell(close) {
  _applyToPending();
  if (close) closeCellModal();
}
function clearCell() {
  sel('#modal-code').value = '';
  sel('#modal-dg').checked = false;
  sel('#modal-ws').checked = false;
  sel('#modal-cl').value = '';
  applyCell(true);
}
// 早日勤出勤 = 記号なしの色付きマスとして明示保存（クリア=白=未入力とは別物）
// セルの色を選んでいればその色、なければ本人の班色を使う
function setBlankWork() {
  var td = _cellTd();
  var color = sel('#modal-cl').value || (td ? td.dataset.tc : '') || '';
  if (!color) {
    showToast('この人の班色が未設定です。名簿管理で班色を設定するか「セルの色」を選んでください');
    return;
  }
  sel('#modal-code').value = '';
  sel('#modal-dg').checked = false;
  sel('#modal-ws').checked = false;
  _applyToPending(color);
  closeCellModal();
}
function _updateSeqBtns() {
  var idx = _dates.indexOf(_cur ? _cur.date : '');
  sel('#seq-prev').disabled = idx <= 0;
  sel('#seq-next').disabled = idx >= _dates.length - 1;
}
function seqNav(dir) {
  if (!_cur) return;
  _applyToPending();
  var idx = _dates.indexOf(_cur.date);
  var next = idx + dir;
  if (next < 0 || next >= _dates.length) return;
  var nd = _dates[next];
  var td = sel('.kc[data-member="' + _cur.memberId + '"][data-date="' + nd + '"]');
  if (!td) return;
  _cur.date = nd;
  var dow = ['日','月','火','水','木','金','土'][new Date(nd).getUTCDay()];
  sel('#modal-date-label').textContent = nd + '（' + dow + '）';
  _loadCellToModal(td);
  _updateSeqBtns();
}

// ===== 履歴 =====
async function openHistory() {
  sel('#history-modal').style.display = 'flex';
  sel('#history-body').textContent = '読み込み中...';
  try {
    var res = await fetch(API + '/logs?limit=200');
    var d = await res.json();
    var logs = d.logs || [];
    if (logs.length === 0) { sel('#history-body').textContent = '履歴はまだありません'; return; }
    var actionLabel = { shift: 'シフト', member: '名簿', type: '記号', memo: 'メモ' };
    sel('#history-body').innerHTML =
      '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
      + '<thead><tr style="background:#f8fafc;">'
      + '<th style="padding:5px 8px;text-align:left;border-bottom:2px solid #e5e7eb;white-space:nowrap;">日時</th>'
      + '<th style="padding:5px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">操作者</th>'
      + '<th style="padding:5px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">種別</th>'
      + '<th style="padding:5px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">対象</th>'
      + '<th style="padding:5px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">変更</th>'
      + '</tr></thead><tbody>'
      + logs.map(function(l) {
          var chg = l.action === 'shift'
            ? (l.date || '') + '： ' + (l.old_value || '（空）') + ' → ' + (l.new_value || '（空）')
            : ((l.old_value ? l.old_value + ' → ' : '') + (l.new_value || ''));
          return '<tr>'
            + '<td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;color:#6b7280;">' + escH(l.created_at) + '</td>'
            + '<td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;font-weight:600;">' + escH(l.admin_name) + '</td>'
            + '<td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;">' + escH(actionLabel[l.action] || l.action) + '</td>'
            + '<td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;">' + escH(l.target) + '</td>'
            + '<td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;">' + escH(chg) + '</td>'
            + '</tr>';
        }).join('')
      + '</tbody></table>';
  } catch(e) {
    sel('#history-body').textContent = '履歴の取得に失敗しました';
  }
}

// ===== 名簿管理 =====
var SECTION_LABEL = { main: '班長シフト表', s1: '①表', s2: '②表' };
var COLOR_OPTIONS = [['', '班色なし'], ['#00ff00', '黄緑'], ['#ffff00', '黄色'], ['#00ffff', '水色'], ['#ff99cc', 'ピンク']];
function openMembers() {
  var bySec = { main: [], s1: [], s2: [] };
  _allMembers.forEach(function(m) { (bySec[m.section] || bySec.main).push(m); });
  var html = '';
  ['main', 's1', 's2'].forEach(function(secKey) {
    var list = bySec[secKey];
    if (list.length === 0 && secKey !== 'main') return;
    html += '<div style="font-size:12px;font-weight:700;color:#1e3a5f;background:#eff6ff;padding:4px 8px;border-radius:4px;margin:10px 0 6px;">' + SECTION_LABEL[secKey] + '</div>';
    html += list.sort(function(a, b) { return a.sort_order - b.sort_order || a.id - b.id; }).map(function(m) {
      var colorSel = '<select class="mem-color" style="border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:12px;background:' + (m.team_color || 'white') + ';">'
        + COLOR_OPTIONS.map(function(co) { return '<option value="' + co[0] + '"' + ((m.team_color || '') === co[0] ? ' selected' : '') + '>' + co[1] + '</option>'; }).join('')
        + '</select>';
      return '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:5px;' + (m.is_active ? '' : 'opacity:0.5;') + '" data-mid="' + m.id + '">'
        + '<input type="text" class="mem-name" value="' + escH(m.name) + '" style="width:90px;border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:13px;">'
        + '<input type="text" class="mem-role" list="role-list" value="' + escH(m.role || '') + '" placeholder="役割" style="width:110px;border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:13px;">'
        + '<select class="mem-section" style="border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:13px;">'
        +   ['main','s1','s2'].map(function(s) { return '<option value="' + s + '"' + (m.section === s ? ' selected' : '') + '>' + SECTION_LABEL[s] + '</option>'; }).join('')
        + '</select>'
        + colorSel
        + '<label style="font-size:12px;display:flex;align-items:center;gap:3px;white-space:nowrap;"><input type="checkbox" class="mem-indoor"' + (m.is_indoor ? ' checked' : '') + '>内勤</label>'
        + '<input type="number" class="mem-sort" value="' + m.sort_order + '" style="width:52px;border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:13px;">'
        + '<button onclick="saveMember(' + m.id + ', this)" style="padding:6px 12px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">保存</button>'
        + '<button onclick="toggleMember(' + m.id + ', ' + (m.is_active ? 0 : 1) + ')" style="padding:6px 10px;background:' + (m.is_active ? '#fef2f2' : '#f0fdf4') + ';border:1px solid ' + (m.is_active ? '#fca5a5' : '#86efac') + ';color:' + (m.is_active ? '#dc2626' : '#166534') + ';border-radius:6px;font-size:12px;cursor:pointer;">' + (m.is_active ? '削除' : '復元') + '</button>'
        + '</div>';
    }).join('');
  });
  sel('#members-body').innerHTML = html || '<div style="color:#9ca3af;font-size:13px;">メンバーがいません</div>';
  sel('#members-modal').style.display = 'flex';
}
async function saveMember(id, btn) {
  var row = btn.parentElement;
  var body = {
    name: row.querySelector('.mem-name').value,
    role: row.querySelector('.mem-role').value,
    section: row.querySelector('.mem-section').value,
    team_color: row.querySelector('.mem-color').value || null,
    is_indoor: row.querySelector('.mem-indoor').checked ? 1 : 0,
    sort_order: parseInt(row.querySelector('.mem-sort').value) || 0
  };
  var res = await fetch(API + '/members/' + id, {
    method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  if (res.ok) location.reload();
  else { var d = await res.json().catch(function() { return {}; }); alert(d.error || '保存に失敗しました'); }
}
async function toggleMember(id, active) {
  if (!active && !confirm('このメンバーを一覧から外しますか？（過去のシフトは残ります）')) return;
  var res = await fetch(API + '/members/' + id, {
    method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ is_active: active })
  });
  if (res.ok) location.reload();
  else alert('変更に失敗しました');
}
async function addMember() {
  var body = {
    name: sel('#new-mem-name').value,
    role: sel('#new-mem-role').value,
    section: sel('#new-mem-section').value,
    team_color: sel('#new-mem-color').value || null,
    is_indoor: sel('#new-mem-indoor').checked ? 1 : 0,
    sort_order: parseInt(sel('#new-mem-sort').value) || 0
  };
  if (!body.name.trim()) { alert('名前を入力してください'); return; }
  var res = await fetch(API + '/members', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  if (res.ok) location.reload();
  else { var d = await res.json().catch(function() { return {}; }); alert(d.error || '追加に失敗しました'); }
}

// ===== 記号管理 =====
var TYPE_SECTION_LABEL = { main: '班長表', sub: '①②表', all: '両方' };
function openTypes() {
  sel('#types-body').innerHTML = _allTypes.map(function(t) {
    return '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:5px;' + (t.is_active ? '' : 'opacity:0.5;') + '" data-tid="' + t.id + '">'
      + '<input type="text" class="type-code" value="' + escH(t.code) + '" style="width:48px;border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:13px;">'
      + '<input type="text" class="type-label" value="' + escH(t.label) + '" placeholder="説明" style="width:150px;border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:13px;">'
      + '<input type="color" class="type-color" value="' + escH(t.color) + '" style="width:38px;height:32px;border:1px solid #d1d5db;border-radius:6px;padding:2px;cursor:pointer;">'
      + '<select class="type-section" style="border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:12px;">'
      +   ['main','sub','all'].map(function(s) { return '<option value="' + s + '"' + (t.section === s ? ' selected' : '') + '>' + TYPE_SECTION_LABEL[s] + '</option>'; }).join('')
      + '</select>'
      + '<input type="number" class="type-req" value="' + t.daily_required + '" title="日別必要人数" style="width:48px;border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:13px;">'
      + '<label style="font-size:11px;display:flex;align-items:center;gap:2px;"><input type="checkbox" class="type-teamcolor"' + (t.use_team_color ? ' checked' : '') + '>班色</label>'
      + '<label style="font-size:11px;display:flex;align-items:center;gap:2px;"><input type="checkbox" class="type-work"' + (t.counts_as_work ? ' checked' : '') + '>出勤</label>'
      + '<label style="font-size:11px;display:flex;align-items:center;gap:2px;"><input type="checkbox" class="type-off"' + (t.counts_as_off ? ' checked' : '') + '>公休</label>'
      + '<input type="number" class="type-sort" value="' + t.sort_order + '" title="並び順" style="width:48px;border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:13px;">'
      + '<button onclick="saveType(' + t.id + ', this)" style="padding:6px 12px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">保存</button>'
      + '<button onclick="toggleType(' + t.id + ', ' + (t.is_active ? 0 : 1) + ')" style="padding:6px 10px;background:' + (t.is_active ? '#fef2f2' : '#f0fdf4') + ';border:1px solid ' + (t.is_active ? '#fca5a5' : '#86efac') + ';color:' + (t.is_active ? '#dc2626' : '#166534') + ';border-radius:6px;font-size:12px;cursor:pointer;">' + (t.is_active ? '無効' : '有効') + '</button>'
      + '</div>';
  }).join('');
  sel('#types-modal').style.display = 'flex';
}
async function saveType(id, btn) {
  var row = btn.parentElement;
  var body = {
    code: row.querySelector('.type-code').value,
    label: row.querySelector('.type-label').value,
    color: row.querySelector('.type-color').value,
    section: row.querySelector('.type-section').value,
    daily_required: parseInt(row.querySelector('.type-req').value) || 0,
    use_team_color: row.querySelector('.type-teamcolor').checked ? 1 : 0,
    counts_as_work: row.querySelector('.type-work').checked ? 1 : 0,
    counts_as_off: row.querySelector('.type-off').checked ? 1 : 0,
    sort_order: parseInt(row.querySelector('.type-sort').value) || 0
  };
  var res = await fetch(API + '/types/' + id, {
    method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  if (res.ok) location.reload();
  else { var d = await res.json().catch(function() { return {}; }); alert(d.error || '保存に失敗しました'); }
}
async function toggleType(id, active) {
  var res = await fetch(API + '/types/' + id, {
    method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ is_active: active })
  });
  if (res.ok) location.reload();
  else alert('変更に失敗しました');
}
async function addType() {
  var body = {
    code: sel('#new-type-code').value,
    label: sel('#new-type-label').value,
    color: sel('#new-type-color').value,
    section: sel('#new-type-section').value,
    daily_required: parseInt(sel('#new-type-req').value) || 0,
    use_team_color: sel('#new-type-teamcolor').checked ? 1 : 0,
    counts_as_work: sel('#new-type-work').checked ? 1 : 0,
    counts_as_off: sel('#new-type-off').checked ? 1 : 0,
    sort_order: (_allTypes.length + 1) * 10
  };
  if (!body.code.trim()) { alert('記号を入力してください'); return; }
  var res = await fetch(API + '/types', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
  });
  if (res.ok) location.reload();
  else { var d = await res.json().catch(function() { return {}; }); alert(d.error || '追加に失敗しました'); }
}

// ===== 希望休枠 =====
function _wishOf(mid, date) {
  return _wishes.find(function(w) { return w.member_id === mid && w.date === date; });
}
function _refreshWishMarks() {
  document.querySelectorAll('.kc[data-sec="main"]').forEach(function(td) {
    var has = _wishOf(parseInt(td.dataset.member), td.dataset.date);
    if (has) td.dataset.wish = '1';
    else delete td.dataset.wish;
  });
}
function openWishes() {
  var mains = _allMembers.filter(function(m) { return m.section === 'main' && m.is_active === 1 && m.is_indoor === 1; });
  sel('#wish-member').innerHTML = mains.map(function(m) {
    return '<option value="' + m.id + '">' + escH(m.name) + '（' + escH(m.role || '') + '）</option>';
  }).join('');
  renderWishDates();
  renderWishList();
  sel('#wishes-modal').style.display = 'flex';
}
function renderWishDates() {
  var mid = parseInt(sel('#wish-member').value);
  var wd = ['日','月','火','水','木','金','土'];
  sel('#wish-dates').innerHTML = _dates.filter(function(d) { return d >= periodStart && d <= periodEnd; }).map(function(d) {
    var has = _wishOf(mid, d);
    var dt = new Date(d);
    var dow = dt.getUTCDay();
    return '<button data-date="' + d + '" onclick="toggleWish(this)" style="width:52px;padding:6px 0;border-radius:6px;font-size:12px;cursor:pointer;touch-action:manipulation;border:1px solid ' + (has ? '#dc2626' : '#d1d5db') + ';background:' + (has ? '#fee2e2' : 'white') + ';color:' + (dow === 0 ? '#ef4444' : dow === 6 ? '#3b82f6' : '#374151') + ';' + (has ? 'font-weight:700;' : '') + '">'
      + (dt.getUTCMonth() + 1) + '/' + dt.getUTCDate() + '<br><span style="font-size:10px;">' + wd[dow] + '</span></button>';
  }).join('');
}
function renderWishList() {
  var inPeriod = _wishes.filter(function(w) { return w.date >= periodStart && w.date <= periodEnd; });
  if (inPeriod.length === 0) { sel('#wish-list').innerHTML = '<div style="color:#9ca3af;">まだ登録がありません</div>'; return; }
  var byMember = {};
  inPeriod.forEach(function(w) {
    var m = _allMembers.find(function(x) { return x.id === w.member_id; });
    var nm = m ? m.name : '?';
    (byMember[nm] = byMember[nm] || []).push(w);
  });
  sel('#wish-list').innerHTML = Object.keys(byMember).map(function(nm) {
    return '<div style="margin-bottom:4px;"><b>' + escH(nm) + '</b>： '
      + byMember[nm].map(function(w) {
          var dt = new Date(w.date);
          return (dt.getUTCMonth() + 1) + '/' + dt.getUTCDate() + (w.note ? '(' + escH(w.note) + ')' : '');
        }).join('、')
      + '</div>';
  }).join('');
}
async function toggleWish(btn) {
  var mid = parseInt(sel('#wish-member').value);
  var date = btn.dataset.date;
  var existing = _wishOf(mid, date);
  btn.disabled = true;
  try {
    if (existing) {
      var res = await fetch(API + '/wishes/' + existing.id, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      _wishes = _wishes.filter(function(w) { return w.id !== existing.id; });
    } else {
      var res2 = await fetch(API + '/wishes', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ member_id: mid, date: date })
      });
      var d = await res2.json().catch(function() { return {}; });
      if (!res2.ok) throw new Error(d.error);
      _wishes.push({ id: d.id, member_id: mid, date: date, note: '' });
    }
    renderWishDates();
    renderWishList();
    _refreshWishMarks();
  } catch(e) {
    alert(e.message || '保存に失敗しました');
  } finally {
    btn.disabled = false;
  }
}

// 希望休の自動反映（編集モード中のみ / 保存前に内容を確認できる）
function autoAssign() {
  var wishesInPeriod = _wishes.filter(function(w) { return w.date >= periodStart && w.date <= periodEnd; });
  var applied = 0, akeSet = 0;
  var conflicts = [];

  // 1) 希望休 → 公休(赤文字)。既に別の記号が入っている日は上書きせず競合として報告
  wishesInPeriod.forEach(function(w) {
    var td = sel('.kc[data-member="' + w.member_id + '"][data-date="' + w.date + '"]');
    if (!td) return;
    var code = td.dataset.code || '';
    if (code === '' || code === '公') {
      if (code === '公' && td.dataset.ws === '1') return; // 反映済み
      // 早日勤の色マスだった場合も公休(白)で上書き
      _pending[w.member_id + '_' + w.date] = { member_id: w.member_id, date: w.date, code: '公', is_diagonal: 0, is_wish: 1, cell_color: null };
      td.dataset.code = '公'; td.dataset.dg = '0'; td.dataset.ws = '1'; td.dataset.cl = '';
      td.dataset.pending = 'true';
      paintCell(td);
      applied++;
    } else {
      conflicts.push(td.dataset.name + ' ' + w.date.slice(5).replace('-', '/') + '（「' + code + '」入力済み）');
    }
  });

  // 2) 当直(斜め直含む)の翌日が空白なら自動で非番に（斜め直の翌日は斜体の非）
  document.querySelectorAll('.kc[data-sec="main"][data-code="直"]').forEach(function(td) {
    var d = td.dataset.date;
    var idx = _dates.indexOf(d);
    if (idx < 0 || idx + 1 >= _dates.length) return;
    var nd = _dates[idx + 1];
    if (nd < periodStart || nd > periodEnd) return;
    var next = sel('.kc[data-member="' + td.dataset.member + '"][data-date="' + nd + '"]');
    if (!next || (next.dataset.code || '') !== '') return;
    if (next.dataset.cl) return; // 早日勤の色マスには入れない（白＝未入力のみ）
    if (_wishOf(parseInt(td.dataset.member), nd)) return; // 翌日が希望休なら公優先（上のループで処理済み）
    var dg = td.dataset.dg === '1' ? 1 : 0;
    _pending[td.dataset.member + '_' + nd] = { member_id: parseInt(td.dataset.member), date: nd, code: '非', is_diagonal: dg, is_wish: 0, cell_color: next.dataset.cl || null };
    next.dataset.code = '非'; next.dataset.dg = String(dg); next.dataset.ws = '0';
    next.dataset.pending = 'true';
    paintCell(next);
    akeSet++;
  });

  _updatePending();
  recalcAll();
  var msg = '希望休 ' + applied + '件を公休（赤文字）として反映\\n当直翌日の非番 ' + akeSet + '件を自動設定';
  if (conflicts.length) msg += '\\n\\n【競合・要確認 ' + conflicts.length + '件】\\n' + conflicts.join('\\n');
  msg += '\\n\\n内容を確認して「一括保存」を押すと確定します。';
  alert(msg);
}

// ===== 0時通知設定 =====
var ROLE_LABEL = { general_manager: '統括管理者', operations_manager: '運行管理者' };
async function openNotify() {
  sel('#notify-modal').style.display = 'flex';
  sel('#notify-body').textContent = '読み込み中...';
  try {
    var res = await fetch(API + '/notify');
    var d = await res.json();
    var rows = (d.recipients || []).map(function(u) {
      return '<div style="display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid #f3f4f6;">'
        + '<div style="flex:1;"><b>' + escH(u.name) + '</b> <span style="font-size:11px;color:#9ca3af;">' + (ROLE_LABEL[u.role] || escH(u.role)) + '</span></div>'
        + '<button onclick="toggleNotify(\\'' + escH(u.line_uid) + '\\', ' + (u.optin ? 0 : 1) + ')" style="padding:5px 16px;border-radius:99px;font-size:12px;font-weight:700;cursor:pointer;border:1px solid ' + (u.optin ? '#86efac' : '#d1d5db') + ';background:' + (u.optin ? '#f0fdf4' : '#f9fafb') + ';color:' + (u.optin ? '#166534' : '#9ca3af') + ';">' + (u.optin ? '通知オン' : 'オフ') + '</button>'
        + '</div>';
    }).join('');
    sel('#notify-body').innerHTML =
      '<div style="display:flex;align-items:center;gap:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 12px;margin-bottom:10px;">'
      + '<div style="flex:1;font-weight:700;color:#1d4ed8;">0時の自動送信</div>'
      + '<button onclick="toggleNotifyMaster(' + (d.enabled ? 0 : 1) + ')" style="padding:5px 16px;border-radius:99px;font-size:12px;font-weight:700;cursor:pointer;border:1px solid ' + (d.enabled ? '#86efac' : '#fca5a5') + ';background:' + (d.enabled ? '#f0fdf4' : '#fef2f2') + ';color:' + (d.enabled ? '#166534' : '#dc2626') + ';">' + (d.enabled ? '有効' : '停止中') + '</button>'
      + '</div>'
      + (rows || '<div style="color:#9ca3af;">対象ユーザー（統括管理者・運行管理者）がいません。LINEリフ権限管理で登録してください。</div>');
  } catch(e) {
    sel('#notify-body').textContent = '設定の取得に失敗しました';
  }
}
async function toggleNotifyMaster(on) {
  var res = await fetch(API + '/notify', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ master: on })
  });
  if (res.ok) openNotify();
  else alert('変更に失敗しました');
}
async function toggleNotify(uid, on) {
  var res = await fetch(API + '/notify', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ line_uid: uid, optin: on })
  });
  if (res.ok) openNotify();
  else { var d = await res.json().catch(function() { return {}; }); alert(d.error || '変更に失敗しました'); }
}
async function notifyTest() {
  if (!confirm('通知オンの人に今すぐ本日の出勤者を送信します。よろしいですか？')) return;
  var btn = sel('#notify-test-btn');
  btn.disabled = true; btn.textContent = '送信中...';
  try {
    var res = await fetch(API + '/notify/test', { method: 'POST' });
    if (!res.ok) throw new Error();
    showToast('テスト送信しました');
  } catch(e) {
    alert('送信に失敗しました');
  } finally {
    btn.disabled = false; btn.textContent = '今すぐテスト送信';
  }
}

// ===== メモ =====
function addKibouRow() {
  var div = document.createElement('div');
  div.className = 'kibou-row';
  div.style.cssText = 'display:flex;gap:6px;margin-bottom:5px;';
  div.innerHTML = '<input type="text" class="kibou-name" placeholder="名前" style="width:90px;border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:13px;">'
    + '<input type="text" class="kibou-text" placeholder="希望内容（例: 7/19 7/20）" style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:6px;font-size:13px;">'
    + '<button onclick="this.parentElement.remove()" style="border:1px solid #fca5a5;background:#fef2f2;color:#dc2626;border-radius:6px;padding:0 10px;cursor:pointer;">✕</button>';
  sel('#kibou-rows').appendChild(div);
}
async function saveMemos() {
  var btn = sel('#memo-save-btn');
  btn.disabled = true; btn.textContent = '保存中...';
  var kibou = [];
  document.querySelectorAll('.kibou-row').forEach(function(row) {
    kibou.push({ title: row.querySelector('.kibou-name').value, content: row.querySelector('.kibou-text').value });
  });
  try {
    var res = await fetch(API + '/memos', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ year: _year, month: _month, tokki: sel('#memo-tokki').value, kibou: kibou })
    });
    if (!res.ok) throw new Error();
    showToast('メモを保存しました');
  } catch(e) {
    alert('メモの保存に失敗しました');
  } finally {
    btn.disabled = false; btn.textContent = 'メモを保存';
  }
}
</script>`;
}

// ===== 印刷用ページ（A4横）=====
export function kanchoPrintPage(
  allMembers: KanchoMember[],
  types: KanchoShiftType[],
  shiftMap: Record<string, KanchoCell>,
  memos: KanchoMemo[],
  dates: string[],
  year: number,
  month: number,
  periodStart: string,
  periodEnd: string
): string {
  const members = allMembers.filter(m => m.is_active === 1);
  const activeTypes = types.filter(t => t.is_active === 1);
  const colorMap: Record<string, string> = {};
  for (const t of activeTypes) if (!(t.code in colorMap)) colorMap[t.code] = t.color;
  const teamColorCodes = new Set(activeTypes.filter(t => t.use_team_color === 1).map(t => t.code));
  const workCodes = new Set(activeTypes.filter(t => t.counts_as_work === 1).map(t => t.code));
  const offCodes = new Set(activeTypes.filter(t => t.counts_as_off === 1).map(t => t.code));
  const requiredTypes = activeTypes.filter(t => t.daily_required > 0);

  const mainMembers = sortMainMembers(members.filter(m => m.section === 'main' && m.is_indoor === 1));
  const s1Members = members.filter(m => m.section === 's1').sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
  const s2Members = members.filter(m => m.section === 's2').sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

  const dateHead = dates.map(d => {
    const dt = new Date(d);
    const dow = dt.getUTCDay();
    return `<th style="background:${dow === 0 ? '#fee2e2' : dow === 6 ? '#dbeafe' : '#f3f4f6'};">
      <div>${dt.getUTCDate()}</div><div>${WEEKDAY_JA[dow]}</div></th>`;
  }).join('');

  function printCell(m: KanchoMember, d: string): string {
    const s = shiftMap[`${m.id}_${d}`];
    const bg = cellBg(s, m, true, colorMap, teamColorCodes);
    return `<td style="background:${bg};${cellFont(s)}">${escHtml(s?.code ?? '')}</td>`;
  }

  let mainRows = '';
  let lastRole: string | null = null;
  for (const m of mainMembers) {
    const role = m.role ?? 'その他';
    if (role !== lastRole) {
      mainRows += `<tr><td colspan="${1 + dates.length + COUNT_COLS.length}" class="grp">● ${escHtml(role)}</td></tr>`;
      lastRole = role;
    }
    const cnt = countsOf(m, dates, shiftMap, periodStart, periodEnd, workCodes, offCodes);
    mainRows += `<tr><td class="nm" style="${m.team_color ? `border-left:5px solid ${m.team_color};` : ''}">${escHtml(m.name)}</td>`
      + dates.map(d => printCell(m, d)).join('')
      + COUNT_COLS.map(cc => `<td style="background:${cc.color};font-weight:700;">${cnt[cc.key] || ''}</td>`).join('')
      + '</tr>';
  }
  for (const t of requiredTypes) {
    mainRows += `<tr><td class="nm" style="background:${t.color};font-size:8px;">${escHtml(t.code)} 必要${t.daily_required}</td>`
      + dates.map(d => {
          let n = 0;
          for (const m of mainMembers) if (shiftMap[`${m.id}_${d}`]?.code === t.code) n++;
          const ok = n === t.daily_required;
          return `<td style="font-size:8px;background:${ok ? '#f0fdf4' : '#fee2e2'};color:${ok ? '#166534' : '#dc2626'};">${n}</td>`;
        }).join('')
      + `<td colspan="${COUNT_COLS.length}"></td></tr>`;
  }

  function subRows(list: KanchoMember[]): string {
    return list.map(m => `<tr><td class="nm">${escHtml(m.name)}</td>`
      + dates.map(d => printCell(m, d)).join('')
      + '</tr>').join('');
  }

  const tokki = memos.find(mm => mm.kind === 'tokki')?.content ?? '';
  const kibou = memos.filter(mm => mm.kind === 'kibou');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="robots" content="noindex, nofollow">
  <title>班長シフト ${year}年${month}月度</title>
  <style>
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: 'Hiragino Sans', 'Meiryo', sans-serif; padding: 10px; }
    .print-btn { position: fixed; top: 10px; right: 10px; padding: 10px 22px; background: #2563eb; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; }
    h1 { font-size: 15px; margin: 0 0 6px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #9ca3af; text-align: center; font-size: 9px; padding: 2px 1px; overflow: hidden; white-space: nowrap; }
    th { font-size: 8px; }
    .nm { text-align: left; font-weight: 700; padding-left: 4px; min-width: 56px; }
    .grp { text-align: left; background: #e0e7ff; font-weight: 700; font-size: 8px; padding-left: 4px; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; font-size: 9px; }
    .legend span { border: 1px solid #9ca3af; border-radius: 3px; padding: 1px 6px; }
    .memos { display: flex; gap: 10px; margin-top: 8px; font-size: 10px; }
    .memo-box { flex: 1; border: 1px solid #374151; padding: 6px 8px; min-height: 40px; }
    .memo-title { font-weight: 700; border-bottom: 1px solid #9ca3af; margin-bottom: 3px; padding-bottom: 2px; }
    h2 { font-size: 11px; margin: 10px 0 3px; }
    @media print {
      .print-btn { display: none; }
      body { padding: 0; }
      @page { size: A4 landscape; margin: 6mm; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ 印刷 / PDF保存</button>
  <h1>管理者公休予定表　${year}年${month}月度（${periodStart} 〜 ${periodEnd}）</h1>
  <table>
    <thead><tr><th>氏名</th>${dateHead}${COUNT_COLS.map(cc => `<th>${cc.label}</th>`).join('')}</tr></thead>
    <tbody>${mainRows}</tbody>
  </table>
  <div class="legend">
    ${activeTypes.map(t => `<span style="background:${t.color};">${escHtml(t.code)}${t.label ? ` ${escHtml(t.label)}` : ''}</span>`).join('')}
    <span>色マス(記号なし)=早日勤 7:30〜16:30</span><span><i>斜体の直</i>=斜め直 14:00〜翌8:00</span><span>終業班長 3:00〜12:00</span><span style="color:#dc2626;font-weight:700;">赤文字=希望休</span>
  </div>
  ${s1Members.length ? `<h2>① 表</h2><table><thead><tr><th>氏名</th>${dateHead}</tr></thead><tbody>${subRows(s1Members)}</tbody></table>` : ''}
  ${s2Members.length ? `<h2>② 表</h2><table><thead><tr><th>氏名</th>${dateHead}</tr></thead><tbody>${subRows(s2Members)}</tbody></table>` : ''}
  <div class="memos">
    <div class="memo-box"><div class="memo-title">・特記事項</div><div style="white-space:pre-wrap;">${escHtml(tokki)}</div></div>
    <div class="memo-box"><div class="memo-title">・希望休</div>
      ${kibou.map(k => `<div><b>${escHtml(k.title)}</b>　${escHtml(k.content)}</div>`).join('')}
    </div>
  </div>
</body>
</html>`;
}
