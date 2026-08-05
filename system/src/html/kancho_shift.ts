// 班長シフト（管理者公休予定表）画面
// 表示ルール（元Excelを踏襲）:
//   ・空白セル = 昼日勤出勤(7:30〜16:30)。班色で自動的に塗る
//   ・直 = 当直 9:00〜翌3:00 / 斜体の直 = 斜め直 14:00〜翌8:00
//   ・赤文字 = 希望休の反映
//   ・セル背景 = セル個別色(他班ヘルプ等) > 班色(直遅早) > 記号色 > 空白は班色
import { escHtml, safeJson, saveToastHtml, saveToastScript } from './layout';
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
  is_rookie: number;         // 1=新人班長（当直ペア自動禁止の判定用。社員全体の「新人」概念とは無関係）
  year: number;              // 月度ごとに独立データ（新しい月度は前月度から自動コピー）
  month: number;
  emp_no: string | null;     // 社員番号（社員マスタemployees.emp_noと同値。希望休フォームの本人確認に使用）
  slot_key: string | null;   // 枠の月度をまたぐ同一性キー。編集を将来の既存月度へ自動伝播するために使う
  prev_name?: string | null; // 前月度で同じ行(section・班色・role・並び順)だった人の名前。月またぎのグレー日付の自動反映と名前欄の「旧名→新名」表示に使用（サーバー側で相関サブクエリにより算出）
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
  show_in_input: number;    // 入力モーダルのプリセットボタンに表示
  year: number;             // 月度ごとに独立データ（新しい月度は前月度から自動コピー）
  month: number;
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

export type KanchoForbiddenPair = {
  id: number;
  member_id_a: number;
  member_id_b: number;
  reason: string;
};

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];
export const ROLE_ORDER = ['昼日勤班長', '終業班長', '教育班長', '研修課出向', '職員当直'];
// 誰も割り当てられていない枠の名前欄に入れるプレースホルダー
export const VACANT_SLOT_LABEL = '(空き枠)';

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

// ヘッダー（共通レイアウトの「班長シフト」タイトル右側）に差し込む月度切り替えナビ
export function kanchoPeriodNavHtml(year: number, month: number, periodStart: string, periodEnd: string): string {
  const periodLabel = `${year}年${month}月度（${periodStart}〜${periodEnd}）`;
  let prevYear = year, prevMonth = month - 1;
  if (prevMonth < 1) { prevMonth = 12; prevYear--; }
  let nextYear = year, nextMonth = month + 1;
  if (nextMonth > 12) { nextMonth = 1; nextYear++; }
  return `
    <a href="${ADMIN_PATH}/kancho-shift?year=${prevYear}&month=${prevMonth}" class="btn-nav-sm">◀</a>
    <span style="font-size:13px;font-weight:700;color:#1e3a5f;white-space:nowrap;">${escHtml(periodLabel)}</span>
    <a href="${ADMIN_PATH}/kancho-shift?year=${nextYear}&month=${nextMonth}" class="btn-nav-sm">▶</a>`;
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
  wishes: KanchoWish[] = [],
  forbiddenPairs: KanchoForbiddenPair[] = []
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

  // 前任者と名前が違う場合は「旧名→新名」表示（月をまたいだ入れ替わりを表から分かるように）
  function nameLabel(m: KanchoMember): string {
    if (m.prev_name && m.prev_name !== m.name) return `${escHtml(m.prev_name)}→${escHtml(m.name)}`;
    return escHtml(m.name);
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
      const linkBadge = (canEdit && !m.emp_no) ? '<span title="社員番号が未紐付け" style="color:#dc2626;margin-left:3px;">🔗</span>' : '';
      html += `<tr>
        <td class="${canEdit ? 'kc-name' : ''}" data-mid="${m.id}" data-name="${escHtml(m.name)}" style="min-width:92px;max-width:92px;font-size:12px;font-weight:600;border:1px solid #d1d5db;padding:3px 6px 3px 10px;${STICKY}left:0;${nameBg}white-space:nowrap;overflow:hidden;${canEdit ? 'cursor:pointer;' : ''}">${nameLabel(m)}${linkBadge}</td>
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
      <td style="min-width:92px;font-size:12px;font-weight:600;border:1px solid #d1d5db;padding:3px 6px;${STICKY}left:0;${FIX_BG}white-space:nowrap;">${nameLabel(m)}</td>
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
  <div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
    <a href="${ADMIN_PATH}/kancho-shift/personal" class="btn-secondary" style="text-decoration:none;">👤 個人別確認</a>
    <a href="${ADMIN_PATH}/kancho-shift/print?year=${year}&month=${month}" target="_blank" class="btn-secondary">🖨️ 印刷</a>
    <button onclick="openWarnings()" id="warnings-btn" class="btn-secondary" style="border:none;cursor:pointer;background:#dc2626;">⚠ 警告チェック</button>
    ${canEdit ? `<button onclick="openWishes()" class="btn-secondary" style="border:none;cursor:pointer;background:#dc2626;">希望休</button>` : ''}
    <div style="position:relative;">
      <button onclick="toggleGearMenu(event)" id="gear-btn" class="btn-secondary" style="border:none;cursor:pointer;font-size:15px;line-height:1;">⚙️</button>
      <div id="gear-menu" class="gear-menu">
        <button class="gear-item" onclick="closeGearMenu();openHistory()">履歴</button>
        ${canEdit ? `
        <button class="gear-item" onclick="closeGearMenu();openNotify()">通知設定</button>
        <a class="gear-item" href="${ADMIN_PATH}/settings/kancho-slots" style="text-decoration:none;box-sizing:border-box;">枠設定（追加・役割・班色）</a>
        <button class="gear-item" onclick="closeGearMenu();openTypes()">記号管理</button>` : ''}
      </div>
    </div>
  </div>

  ${canEdit ? `
  <div id="edit-mode-bar" style="display:none;background:#fffbeb;border:2px solid #fbbf24;border-radius:8px;padding:10px 14px;margin-bottom:8px;align-items:center;gap:10px;flex-wrap:wrap;">
    <span style="color:#d97706;font-weight:700;font-size:13px;">編集モード中</span>
    <span id="pending-count-label" style="color:#92400e;font-size:13px;background:#fef3c7;padding:2px 8px;border-radius:4px;border:1px solid #fbbf24;">変更 0件</span>
    <span id="edit-error" style="display:none;color:#dc2626;font-size:12px;"></span>
    <div style="margin-left:auto;display:flex;gap:8px;">
      <button onclick="autoAssign()" style="padding:8px 16px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation;">希望休を自動反映</button>
      <button onclick="autoAssign('終業班長')" style="padding:8px 16px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;touch-action:manipulation;">終業班長だけ反映</button>
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

<!-- 担当者変更モーダル -->
<div id="link-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1002;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;">この枠の担当者を変更</h3>
      <button onclick="closeLinkModal()" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:14px;font-weight:700;color:#1e3a5f;margin-bottom:10px;" id="link-name"></div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">班長リスト（社員管理で「班長として登録」された人）から選んでください。既に他の枠に入っている人を選ぶと、その枠は空き枠になります</div>
    <select id="link-select" onchange="onLinkSelectChange()" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:9px;font-size:13px;background:white;margin-bottom:10px;"></select>
    <div id="link-move-warning" style="display:none;font-size:12px;color:#dc2626;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:8px;margin-bottom:10px;"></div>
    <label style="font-size:12px;color:#6b7280;display:block;margin-bottom:4px;">シフト表に表示する名前（苗字だけ等、同姓がいる場合は下の名前も添えて編集してください）</label>
    <input id="link-dispname" type="text" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:9px;font-size:13px;box-sizing:border-box;margin-bottom:12px;">
    <button onclick="saveLinkEmp()" id="link-save-btn" style="width:100%;padding:10px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">この担当者に変更する</button>
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

<!-- 警告チェックモーダル -->
<div id="warnings-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:12px;">
  <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:640px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;">警告チェック（${year}年${month}月度）</h3>
      <button onclick="sel('#warnings-modal').style.display='none'" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
    </div>
    <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">
      当直・遅日勤の頭数、当直の禁忌ペア、課の3:00〜12:00カバー、10日以上の連勤を機械的にチェックします。あくまで目安のため、問題ない運用であれば無視して保存できます（保存はブロックされません）。
    </div>
    <div id="warnings-body" style="font-size:12px;">読み込み中...</div>
  </div>
</div>

<!-- 記号管理モーダル -->
<div id="types-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1001;align-items:center;justify-content:center;padding:12px;">
  <div class="kmodal-box" style="max-width:960px;">
    <div class="kmodal-header">
      <h3>シフト記号管理 <span style="font-size:12px;font-weight:400;color:#6b7280;">（${year}年${month}月度）</span></h3>
      <button class="kmodal-close" onclick="sel('#types-modal').style.display='none'">✕</button>
    </div>
    <div class="kmodal-hint">
      班色=セル背景に本人の班色を使う（直・遅・早）。出勤/公休=右端の出勤数・公休数カウントに含める。必要人数=日別チェック行（当直・遅日勤など）。
    </div>
    <div class="kmodal-scroll">
      <div class="ktable-wrap">
        <table class="ktable">
          <thead><tr>
            <th>記号</th><th>説明</th><th>色</th><th>表</th><th>必要人数</th><th>班色</th><th>出勤</th><th>公休</th><th>入力</th><th>順</th><th></th>
          </tr></thead>
          <tbody id="types-body"></tbody>
        </table>
      </div>

      <div class="ksection">
        <div class="ksection-title">＋ 記号追加</div>
        <div class="kadd-row">
          <input id="new-type-code" type="text" placeholder="記号" style="width:56px;">
          <input id="new-type-label" type="text" placeholder="説明" style="width:160px;">
          <input id="new-type-color" type="color" value="#e5e7eb">
          <select id="new-type-section">
            <option value="main">班長表</option><option value="sub">①②表</option><option value="all">両方</option>
          </select>
          <input id="new-type-req" type="number" placeholder="必要人数" title="日別必要人数" style="width:76px;">
          <label style="font-size:12px;display:flex;align-items:center;gap:3px;"><input id="new-type-teamcolor" type="checkbox">班色</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:3px;"><input id="new-type-work" type="checkbox">出勤</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:3px;"><input id="new-type-off" type="checkbox">公休</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:3px;" title="入力画面のボタンに表示"><input id="new-type-input" type="checkbox" checked>入力</label>
          <button class="kchip-btn ok" onclick="addType()">＋ 追加</button>
        </div>
      </div>
    </div>
    <div class="kmodal-footer">
      <button onclick="saveAllTypes()" id="types-save-btn" class="kmodal-save-btn">一括保存</button>
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
      送信されるのは統括管理者・運行管理者のうち、ここでオンにした人だけです。<br>
      送信時刻の変更や全体のON/OFFは「設定 → LINE通知設定」の「班長出勤通知」からも行えます（同じ設定です）。
    </div>
    <div id="notify-body" style="font-size:13px;color:#6b7280;">読み込み中...</div>
    <div style="margin-top:14px;display:flex;justify-content:flex-end;">
      <button onclick="notifyTest()" id="notify-test-btn" style="padding:8px 16px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">今すぐテスト送信</button>
    </div>
  </div>
</div>

${saveToastHtml()}

<style>
  .btn-nav { padding:6px 14px;background:#4b6cb7;color:white;border-radius:6px;text-decoration:none;font-size:13px; }
  .btn-nav:hover { background:#3b5aa3; }
  .btn-nav-sm { display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:36px;padding:0 6px;background:#4b6cb7;color:white;border-radius:8px;text-decoration:none;font-size:18px;font-weight:700;flex-shrink:0;touch-action:manipulation; }
  .btn-nav-sm:hover { background:#3b5aa3; }
  .btn-secondary { padding:6px 14px;background:#6b7280;color:white;border-radius:6px;text-decoration:none;font-size:13px; }
  .gear-menu { display:none;position:absolute;right:0;top:calc(100% + 6px);background:white;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 12px 32px rgba(0,0,0,0.18);min-width:150px;z-index:100;overflow:hidden; }
  .gear-menu.open { display:block; }
  .gear-item { display:block;width:100%;text-align:left;padding:10px 16px;background:white;border:none;border-bottom:1px solid #f1f5f9;font-size:13px;color:#374151;cursor:pointer; }
  .gear-item:last-child { border-bottom:none; }
  .gear-item:hover { background:#f8fafc; }
  .kc:active { opacity:0.6; }
  .kc[data-pending="true"] { outline:2px dashed #f59e0b !important; }
  .kc[data-copysrc="1"] { outline:3px solid #2563eb !important; outline-offset:-3px; }
  .kc[data-wish="1"]::after { content:''; position:absolute; top:0; right:0; border-style:solid; border-width:0 7px 7px 0; border-color:transparent #dc2626 transparent transparent; }
  .kreq-ng { background:#fee2e2 !important; color:#dc2626; font-weight:700; }
  .kreq-ok { background:#f0fdf4 !important; color:#166534; }

  /* 記号管理モーダル（表形式＋常に見えるsticky保存フッター） */
  .kmodal-box { background:white;border-radius:14px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);display:flex;flex-direction:column;max-height:88vh;overflow:hidden; }
  .kmodal-header { display:flex;justify-content:space-between;align-items:center;padding:18px 20px 12px; }
  .kmodal-header h3 { font-size:16px;font-weight:700;color:#1e3a5f;margin:0; }
  .kmodal-close { color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;line-height:1;padding:0 4px; }
  .kmodal-hint { font-size:12px;color:#9ca3af;padding:0 20px 12px;line-height:1.6; }
  .kmodal-scroll { flex:1;overflow-y:auto;padding:0 20px 16px; }
  .kmodal-footer { border-top:1px solid #e5e7eb;padding:12px 20px;display:flex;justify-content:flex-end;gap:8px;background:#fafafa; }
  .kmodal-save-btn { padding:10px 28px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 1px 3px rgba(37,99,235,0.4); }
  .kmodal-save-btn:disabled { opacity:0.6;cursor:default; }
  .ktable-wrap { overflow-x:auto;border:1px solid #e5e7eb;border-radius:10px; }
  .ktable { border-collapse:collapse;width:100%;font-size:12.5px;white-space:nowrap; }
  .ktable th { position:sticky;top:0;background:#f8fafc;color:#6b7280;font-weight:600;font-size:11px;text-align:left;padding:8px 8px;border-bottom:1px solid #e5e7eb;z-index:1; }
  .ktable td { padding:6px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle; }
  .ktable tbody tr:hover { background:#f8fafc; }
  .ktable tbody tr.inactive { opacity:0.45; }
  .ktable input[type=text], .ktable input[type=number], .ktable select {
    border:1px solid #d1d5db;border-radius:6px;padding:5px 7px;font-size:12.5px;background:white;
  }
  .ktable input[type=color] { border:1px solid #d1d5db;border-radius:6px;width:34px;height:28px;padding:2px;cursor:pointer; }
  .ksection { border-top:1px solid #f1f5f9;margin-top:18px;padding-top:14px; }
  .ksection-title { font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:8px; }
  .kadd-row { display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px; }
  .kchip-btn { padding:4px 9px;background:#f3f4f6;border:1px solid #d1d5db;color:#4b5563;border-radius:99px;font-size:11px;cursor:pointer;white-space:nowrap; }
  .kchip-btn.danger { background:#fef2f2;border-color:#fca5a5;color:#dc2626; }
  .kchip-btn.ok { background:#f0fdf4;border-color:#86efac;color:#166534; }
</style>

<script>
var CAN_EDIT = ${canEdit ? 'true' : 'false'};
var API = '${ADMIN_PATH}/api/kancho';
var _year = ${year}, _month = ${month};
var periodStart = '${periodStart}', periodEnd = '${periodEnd}';
var _dates = ${safeJson(dates)};
var _types = ${safeJson(activeTypes.map(t => ({ id: t.id, code: t.code, color: t.color, section: t.section, tc: t.use_team_color, wk: t.counts_as_work, off: t.counts_as_off, inp: t.show_in_input })))};
var _allTypes = ${safeJson(types.map(t => ({ id: t.id, code: t.code, label: t.label, color: t.color, section: t.section, daily_required: t.daily_required, sort_order: t.sort_order, is_active: t.is_active, use_team_color: t.use_team_color, counts_as_work: t.counts_as_work, counts_as_off: t.counts_as_off, show_in_input: t.show_in_input })))};
var _allMembers = ${safeJson(allMembers.map(m => ({ id: m.id, name: m.name, role: m.role, section: m.section, sort_order: m.sort_order, is_active: m.is_active, team_color: m.team_color, is_indoor: m.is_indoor, is_rookie: m.is_rookie, emp_no: m.emp_no })))};
var _forbiddenPairs = ${safeJson(forbiddenPairs)};  // [{id, member_id_a, member_id_b, reason}]
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
${saveToastScript()}

// ===== ⚙️ 設定メニュー（履歴・通知設定・枠設定への導線・記号管理をまとめたドロップダウン）=====
function toggleGearMenu(e) {
  if (e) e.stopPropagation();
  sel('#gear-menu').classList.toggle('open');
}
function closeGearMenu() {
  var m = sel('#gear-menu');
  if (m) m.classList.remove('open');
}
document.addEventListener('click', function(e) {
  var menu = sel('#gear-menu');
  if (!menu || !menu.classList.contains('open')) return;
  if (e.target.closest && e.target.closest('#gear-menu, #gear-btn')) return;
  closeGearMenu();
});

// ===== 担当者の変更（名前セルをタップして開く）=====
var _linkMid = null;
var _linkCurrentEmpNo = null;
var _linkOtherByEmpNo = {};
async function openLinkModal(mid, name) {
  _linkMid = mid;
  _linkCurrentEmpNo = null;
  _linkOtherByEmpNo = {};
  sel('#link-name').textContent = '現在の担当: ' + name + ' さん';
  sel('#link-select').innerHTML = '<option value="">読み込み中...</option>';
  sel('#link-move-warning').style.display = 'none';
  sel('#link-dispname').value = name;
  sel('#link-modal').style.display = 'flex';
  try {
    var res = await fetch(API + '/members/' + mid + '/link-candidates');
    var d = await res.json();
    _linkCurrentEmpNo = d.current_emp_no || null;
    var candidates = d.candidates || [];
    if (!candidates.length) {
      sel('#link-select').innerHTML = '<option value="">候補の社員がいません</option>';
      return;
    }
    candidates.forEach(function(e) { if (e.other_slot) _linkOtherByEmpNo[e.emp_no] = e.other_slot; });
    sel('#link-select').innerHTML = '<option value="">-- 選択してください --</option>' + candidates.map(function(e) {
      var label = escH(e.name) + '（' + escH(e.emp_no) + '）' + (e.other_slot ? '　※現在: ' + escH(e.other_slot) : '');
      return '<option value="' + escH(e.emp_no) + '"' + (e.emp_no === _linkCurrentEmpNo ? ' selected' : '') + '>' + label + '</option>';
    }).join('');
  } catch (e) {
    alert('読み込みに失敗しました');
    closeLinkModal();
  }
}
function closeLinkModal() {
  sel('#link-modal').style.display = 'none';
  _linkMid = null;
}
function onLinkSelectChange() {
  var s = sel('#link-select');
  var opt = s.options[s.selectedIndex];
  var empNo = opt ? opt.value : '';
  var warn = sel('#link-move-warning');
  if (empNo && empNo !== _linkCurrentEmpNo && _linkOtherByEmpNo[empNo]) {
    warn.style.display = 'block';
    warn.textContent = 'この人は現在「' + _linkOtherByEmpNo[empNo] + '」の枠に入っています。ここに変更すると、その枠は空き枠になります。';
  } else {
    warn.style.display = 'none';
  }
  if (!opt || !opt.value || opt.value === _linkCurrentEmpNo) return;
  var full = opt.textContent.replace(/（.*$/, '').trim();
  sel('#link-dispname').value = full.split(/[\s　]+/)[0] || full;
}
async function saveLinkEmp() {
  var empNo = sel('#link-select').value;
  var dispName = sel('#link-dispname').value.trim();
  if (!empNo) { alert('担当者を選んでください'); return; }
  if (!dispName) { alert('表示する名前を入力してください'); return; }
  var btn = sel('#link-save-btn');
  btn.disabled = true; btn.textContent = '保存中...';
  try {
    var res = await fetch(API + '/members/' + _linkMid + '/link', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ emp_no: empNo, name: dispName })
    });
    var d = await res.json().catch(function(){return {};});
    if (!res.ok) throw new Error(d.error || '保存に失敗しました');
    if (d.moved_from) alert('「' + d.moved_from + '」の枠は空き枠になりました。');
    location.reload();
  } catch (e) {
    alert(e.message || '保存に失敗しました');
    btn.disabled = false; btn.textContent = 'この担当者に変更する';
  }
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
  if (typeof DEPT_COLOR_MAP !== 'undefined') _refreshWarningsBadge();
}

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
  if (_cpClip.code === '直') _autoAke(td.dataset.member, td.dataset.date, _cpClip.dg, td.dataset.sec);
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

// 名前セルのタップ→社員番号の紐付けモーダル
document.addEventListener('click', function(e) {
  var t = e.target;
  var nameTd = (t && t.closest) ? t.closest('.kc-name') : null;
  if (!nameTd || !CAN_EDIT) return;
  if (_cpMode || _editMode) return; // 編集モード中は誤操作防止のため無効
  openLinkModal(nameTd.dataset.mid, nameTd.dataset.name);
});

// ===== セル編集 =====
function _presetsFor(sec) {
  return _types.filter(function(t) {
    if (!t.inp) return false;  // 入力ボタン表示オフの記号は出さない（記号管理で設定）
    return sec === 'main' ? (t.section === 'main' || t.section === 'all')
                          : (t.section === 'sub' || t.section === 'all');
  });
}
// 直の入力時: 翌日が白（未入力）なら非を自動セット（直＋非で2日ワンセット。斜め直の翌日は斜体の非）
function _autoAke(memberId, date, dg, sec) {
  if (sec !== 'main') return;
  var idx = _dates.indexOf(date);
  if (idx < 0 || idx + 1 >= _dates.length) return;
  var nd = _dates[idx + 1];
  var next = sel('.kc[data-member="' + memberId + '"][data-date="' + nd + '"]');
  if (!next) return;
  if ((next.dataset.code || '') !== '' || next.dataset.cl) return;
  _pending[memberId + '_' + nd] = { member_id: parseInt(memberId), date: nd, code: '非', is_diagonal: dg, is_wish: 0, cell_color: null };
  next.dataset.code = '非';
  next.dataset.dg = String(dg);
  next.dataset.ws = '0';
  next.dataset.cl = '';
  next.dataset.pending = 'true';
  paintCell(next);
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
    var btn = '<button data-code="' + escH(t.code) + '" onclick="selectPreset(this.dataset.code, 0)" style="padding:6px 11px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;background:' + t.color + ';touch-action:manipulation;">' + escH(t.code) + '</button>';
    // 直の隣に斜め直ボタンを並べる（記号は同じ「直」で斜体フラグ付き）
    if (t.code === '直') {
      btn += '<button onclick="selectPreset(\\'直\\', 1)" style="padding:6px 11px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;background:' + t.color + ';touch-action:manipulation;font-style:italic;">斜め直</button>';
    }
    return btn;
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
function selectPreset(code, dg) {
  sel('#modal-code').value = code;
  sel('#modal-dg').checked = dg === 1;  // 斜め直ボタン=チェックON、他のボタン=OFF
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
  if (code === '直') _autoAke(_cur.memberId, _cur.date, dg, _cur.sec);
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
    showToast('この人の班色が未設定です。枠設定で班色を設定するか「セルの色」を選んでください');
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

// ===== 警告チェック（当直/遅日勤の頭数・禁忌ペア・課カバレッジ・連勤。すべて警告表示のみで保存はブロックしない）=====
var DEPT_COLOR_MAP = { '#00ff00': 1, '#ffff00': 2, '#00ffff': 3, '#ff99cc': 4 };
var DEPT_LABEL = { 1: '1課（黄緑）', 2: '2課（黄色）', 3: '3課（水色）', 4: '4課（ピンク）' };
function _shiftOf(mid, date) {
  var td = sel('.kc[data-member="' + mid + '"][data-date="' + date + '"]');
  if (!td) return null;
  return { code: td.dataset.code || '', dg: td.dataset.dg === '1', cl: td.dataset.cl || '' };
}
function computeWarnings() {
  var mains = _allMembers.filter(function(m) { return m.section === 'main' && m.is_active === 1 && m.is_indoor === 1; });
  var byDept = { 1: [], 2: [], 3: [], 4: [] };
  mains.forEach(function(m) {
    var dept = m.team_color ? DEPT_COLOR_MAP[m.team_color] : null;
    if (dept) byDept[dept].push(m);
  });
  var periodDates = _dates.filter(function(d) { return d >= periodStart && d <= periodEnd; });

  var headcountWarnings = [], pairWarnings = [], coverageWarnings = [], coverageNotes = [], streakWarnings = [];

  function _requiredOf(code) {
    var t = _allTypes.filter(function(x) { return x.code === code && x.is_active === 1 && (x.section === 'main' || x.section === 'all'); })[0];
    return t ? t.daily_required : 0;
  }
  var chokuRequired = _requiredOf('直');
  var osoRequired = _requiredOf('遅');

  periodDates.forEach(function(d) {
    var chokuMembers = mains.filter(function(m) { var s = _shiftOf(m.id, d); return s && s.code === '直'; });
    if (chokuMembers.length < chokuRequired) headcountWarnings.push(d + '：当直が' + chokuMembers.length + '名（必要' + chokuRequired + '名）');
    var osoCount = mains.filter(function(m) { var s = _shiftOf(m.id, d); return s && s.code === '遅'; }).length;
    if (osoCount < osoRequired) headcountWarnings.push(d + '：遅日勤が' + osoCount + '名（必要' + osoRequired + '名）');

    for (var i = 0; i < chokuMembers.length; i++) {
      for (var j = i + 1; j < chokuMembers.length; j++) {
        var a = chokuMembers[i], b = chokuMembers[j];
        if (a.is_rookie && b.is_rookie) {
          pairWarnings.push(d + '：当直「' + a.name + '」×「' + b.name + '」が新人班長同士');
        }
        var fp = _forbiddenPairs.filter(function(p) {
          return (p.member_id_a === a.id && p.member_id_b === b.id) || (p.member_id_a === b.id && p.member_id_b === a.id);
        })[0];
        if (fp) pairWarnings.push(d + '：当直「' + a.name + '」×「' + b.name + '」が禁忌ペア' + (fp.reason ? '（' + fp.reason + '）' : ''));
      }
    }
  });

  [1, 2, 3, 4].forEach(function(dept) {
    var members = byDept[dept];
    if (members.length === 0) return;
    var shukugyo = members.filter(function(m) { return m.role === '終業班長'; });
    periodDates.forEach(function(d) {
      var shukugyoCovered = shukugyo.some(function(m) {
        var s = _shiftOf(m.id, d);
        if (!s || !s.code) return true;  // 未入力・空欄＝終業班長のデフォルト出勤とみなす
        return !offCodes[s.code];
      });
      if (shukugyoCovered) return;

      var idx = _dates.indexOf(d);
      var prevDate = idx > 0 ? _dates[idx - 1] : null;
      var prevDiagonal = prevDate ? members.some(function(m) { var s = _shiftOf(m.id, prevDate); return s && s.code === '直' && s.dg; }) : false;
      var todayDayShift = members.some(function(m) { var s = _shiftOf(m.id, d); return s && ((s.code === '' && s.cl) || s.code === '早'); });
      if (prevDiagonal && todayDayShift) return;

      // 前日斜め直（〜翌8:00）＋当日の通常直（9:00〜）で実質カバーされているケース。
      // 8:00〜9:00の僅かな隙間は残るため警告からは外すが、念のため下部に注記として残す。
      var todayChoku = members.some(function(m) { var s = _shiftOf(m.id, d); return s && s.code === '直' && !s.dg; });
      if (prevDiagonal && todayChoku) {
        coverageNotes.push(d + '：' + DEPT_LABEL[dept] + ' は前日斜め直＋当日直で実質カバー（8:00〜9:00頃のみ要確認）');
        return;
      }

      coverageWarnings.push(d + '：' + DEPT_LABEL[dept] + ' の3:00〜12:00がカバーされていない可能性');
    });
  });

  mains.forEach(function(m) {
    var streak = 0;
    for (var i = 0; i < _dates.length; i++) {
      var s = _shiftOf(m.id, _dates[i]);
      var isWork = s && (workCodes[s.code] || s.code === '非' || (s.code === '' && s.cl));
      if (isWork) {
        streak++;
        if (streak === 10) streakWarnings.push(m.name + '：' + _dates[i - 9] + ' 〜 ' + _dates[i] + ' が10連勤以上（明け含む）');
      } else {
        streak = 0;
      }
    }
  });

  return { headcountWarnings: headcountWarnings, pairWarnings: pairWarnings, coverageWarnings: coverageWarnings, coverageNotes: coverageNotes, streakWarnings: streakWarnings };
}
function openWarnings() {
  var w = computeWarnings();
  var total = w.headcountWarnings.length + w.pairWarnings.length + w.coverageWarnings.length + w.streakWarnings.length;
  function section(title, list) {
    if (list.length === 0) return '';
    return '<div style="margin-bottom:14px;"><div style="font-weight:700;color:#dc2626;margin-bottom:4px;">' + escH(title) + '（' + list.length + '件）</div>'
      + list.map(function(t) { return '<div style="color:#dc2626;background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:5px 8px;margin-bottom:3px;">' + escH(t) + '</div>'; }).join('')
      + '</div>';
  }
  function noteSection(title, list) {
    if (list.length === 0) return '';
    return '<div style="margin-bottom:14px;"><div style="font-weight:700;color:#6b7280;margin-bottom:4px;">' + escH(title) + '（' + list.length + '件）</div>'
      + list.map(function(t) { return '<div style="color:#4b5563;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;margin-bottom:3px;">' + escH(t) + '</div>'; }).join('')
      + '</div>';
  }
  sel('#warnings-body').innerHTML = (total === 0
    ? '<div style="color:#166534;font-weight:700;">警告はありません</div>'
    : section('当直・遅日勤の頭数不足', w.headcountWarnings)
      + section('当直の禁忌ペア', w.pairWarnings)
      + section('課の3:00〜12:00カバー漏れ（可能性・目安）', w.coverageWarnings)
      + section('10日以上の連勤', w.streakWarnings))
    + noteSection('前日斜め直＋当日直で実質カバー（参考・念のため確認）', w.coverageNotes);
  sel('#warnings-modal').style.display = 'flex';
}
function _refreshWarningsBadge() {
  var btn = sel('#warnings-btn');
  if (!btn) return;
  var w = computeWarnings();
  var total = w.headcountWarnings.length + w.pairWarnings.length + w.coverageWarnings.length + w.streakWarnings.length;
  btn.textContent = total > 0 ? '⚠ 警告チェック（' + total + '件）' : '⚠ 警告チェック';
}
recalcAll();  // 全ての集計・警告バッジを初期描画（DEPT_COLOR_MAP等の定義後に実行する必要がある）

// ===== 記号管理 =====
var TYPE_SECTION_LABEL = { main: '班長表', sub: '①②表', all: '両方' };
function openTypes() {
  sel('#types-body').innerHTML = _allTypes.map(function(t) {
    return '<tr class="' + (t.is_active ? '' : 'inactive') + '" data-tid="' + t.id + '">'
      + '<td><input type="text" class="type-code" value="' + escH(t.code) + '" style="width:48px;"></td>'
      + '<td><input type="text" class="type-label" value="' + escH(t.label) + '" style="width:150px;"></td>'
      + '<td><input type="color" class="type-color" value="' + escH(t.color) + '"></td>'
      + '<td><select class="type-section">' + ['main','sub','all'].map(function(s) { return '<option value="' + s + '"' + (t.section === s ? ' selected' : '') + '>' + TYPE_SECTION_LABEL[s] + '</option>'; }).join('') + '</select></td>'
      + '<td><input type="number" class="type-req" value="' + t.daily_required + '" style="width:48px;"></td>'
      + '<td style="text-align:center;"><input type="checkbox" class="type-teamcolor"' + (t.use_team_color ? ' checked' : '') + '></td>'
      + '<td style="text-align:center;"><input type="checkbox" class="type-work"' + (t.counts_as_work ? ' checked' : '') + '></td>'
      + '<td style="text-align:center;"><input type="checkbox" class="type-off"' + (t.counts_as_off ? ' checked' : '') + '></td>'
      + '<td style="text-align:center;"><input type="checkbox" class="type-input"' + (t.show_in_input ? ' checked' : '') + '></td>'
      + '<td><input type="number" class="type-sort" value="' + t.sort_order + '" style="width:48px;"></td>'
      + '<td><button class="kchip-btn' + (t.is_active ? ' danger' : ' ok') + '" onclick="toggleType(' + t.id + ', ' + (t.is_active ? 0 : 1) + ')">' + (t.is_active ? '無効' : '有効') + '</button></td>'
      + '</tr>';
  }).join('');
  sel('#types-modal').style.display = 'flex';
}
async function saveAllTypes() {
  var btn = sel('#types-save-btn');
  var entries = [];
  document.querySelectorAll('#types-body [data-tid]').forEach(function(row) {
    entries.push({
      id: parseInt(row.dataset.tid),
      code: row.querySelector('.type-code').value,
      label: row.querySelector('.type-label').value,
      color: row.querySelector('.type-color').value,
      section: row.querySelector('.type-section').value,
      daily_required: parseInt(row.querySelector('.type-req').value) || 0,
      use_team_color: row.querySelector('.type-teamcolor').checked ? 1 : 0,
      counts_as_work: row.querySelector('.type-work').checked ? 1 : 0,
      counts_as_off: row.querySelector('.type-off').checked ? 1 : 0,
      show_in_input: row.querySelector('.type-input').checked ? 1 : 0,
      sort_order: parseInt(row.querySelector('.type-sort').value) || 0
    });
  });
  btn.disabled = true; btn.textContent = '保存中...';
  try {
    var res = await fetch(API + '/types/batch', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ entries: entries })
    });
    var d = await res.json().catch(function() { return {}; });
    if (!res.ok) throw new Error(d.error || '保存に失敗しました');
    if (d.error) alert(d.error);
    location.reload();
  } catch (e) {
    alert(e.message || '保存に失敗しました');
    btn.disabled = false; btn.textContent = '一括保存';
  }
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
    show_in_input: sel('#new-type-input').checked ? 1 : 0,
    sort_order: (_allTypes.length + 1) * 10,
    year: _year, month: _month
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
// roleFilter指定時はそのroleの班長の希望休のみ反映（例: '終業班長'）
function autoAssign(roleFilter) {
  var roleOf = {};
  _allMembers.forEach(function(m) { roleOf[m.id] = m.role; });
  var wishesInPeriod = _wishes.filter(function(w) {
    if (w.date < periodStart || w.date > periodEnd) return false;
    if (roleFilter && roleOf[w.member_id] !== roleFilter) return false;
    return true;
  });
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
    if (roleFilter && roleOf[parseInt(td.dataset.member)] !== roleFilter) return;
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
  var msg = (roleFilter ? '【' + roleFilter + 'のみ】' : '') + '希望休 ' + applied + '件を公休（赤文字）として反映\\n当直翌日の非番 ' + akeSet + '件を自動設定';
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
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+CiAgPHJlY3Qgd2lkdGg9IjY0IiBoZWlnaHQ9IjY0IiByeD0iMTQiIGZpbGw9IiMyZTEzNTQiLz4KICA8cG9seWdvbiBwb2ludHM9IjMyLjAwLDEwLjAwIDM3LjI5LDI0LjcyIDUyLjkyLDI1LjIwIDQwLjU2LDM0Ljc4IDQ0LjkzLDQ5LjgwIDMyLjAwLDQxLjAwIDE5LjA3LDQ5LjgwIDIzLjQ0LDM0Ljc4IDExLjA4LDI1LjIwIDI2LjcxLDI0LjcyIiBmaWxsPSIjZjJjMTRlIi8+Cjwvc3ZnPgo=">
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
