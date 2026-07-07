// Benten管理システム: 社員管理（総合）
import { Hono } from 'hono';
import { layout, escHtml } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

type StaffRow = {
  id: number;
  emp_no: string;
  name: string;
  name_kana: string | null;
  division: number | null;
  team: number | null;
  phone: string | null;
  birth_date: string | null;
  hire_date: string | null;
  retirement_date: string | null;
  work_schedule: string | null;
  start_time: string | null;
  car_no: string | null;
  avg_return_time: string | null;
  used_cars: string | null;
  enrollment_status: string;
  work_hours_type: string | null;
  is_caution: number;
  is_sales_followup: number;
  problem_notes: string | null;
  is_active: number;
  status: string | null;
  exclude_retirement_candidate: number;
  is_hanchyo: number;
};

type StaffNav = { prevId: number | null; prevName: string | null; nextId: number | null; nextName: string | null };

// 勤務体系ごとの出勤時間選択肢
const START_TIMES: Record<string, string[]> = {
  a: ['6:00', '6:50', '8:00'],
  b: ['18:00', '19:00'],
  B: ['6:00', '6:50', '8:00'],
  D: ['9:30'],
  H: ['15:00', '16:00'],
};
const ALL_TIMES = ['6:00', '6:50', '8:00', '9:30', '15:00', '16:00', '18:00', '19:00'];

function toKatakana(str: string): string {
  return str.replace(/[ぁ-ゖ]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const today = new Date(Date.now() + 9 * 60 * 60 * 1000); // JST
  const bd = new Date(birthDate);
  let age = today.getFullYear() - bd.getFullYear();
  const m = today.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < bd.getDate())) age--;
  return age;
}

const ENROLLMENT_COLORS: Record<string, string> = {
  '通常': '#bbf7d0',
  '育休': '#dbeafe',
  '病欠': '#fed7aa',
  '傷病': '#fecaca',
  '長欠': '#e9d5ff',
};
const ENROLLMENT_TEXT_COLORS: Record<string, string> = {
  '通常': '#166534',
  '育休': '#1e40af',
  '病欠': '#92400e',
  '傷病': '#991b1b',
  '長欠': '#6b21a8',
};

// ===== 社員一覧 =====
app.get('/staff', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const filterDiv = c.req.query('div') ?? 'all';
  const filterStatus = c.req.query('enrollment') ?? 'all';
  const filterActive = c.req.query('active') ?? '1';

  const conditions: string[] = [];
  const params: (string | number)[] = [];
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayStr = nowJST.toISOString().split('T')[0];
  const in30Days = new Date(nowJST.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const filterRetirement = c.req.query('retire') ?? '';

  if (filterRetirement === 'candidate') {
    // 退職候補 = 在籍中だが長欠、または退職日が既に経過している人（除外フラグなし）
    conditions.push('is_active = 1');
    conditions.push('exclude_retirement_candidate = 0');
    conditions.push('(enrollment_status = \'長欠\' OR (retirement_date IS NOT NULL AND retirement_date != \'\' AND retirement_date < ?))');
    params.push(todayStr);
  } else {
    if (filterActive === '1') conditions.push('is_active = 1');
    if (filterRetirement === 'soon') {
      conditions.push('retirement_date IS NOT NULL AND retirement_date != \'\' AND retirement_date >= ? AND retirement_date <= ?');
      params.push(todayStr, in30Days);
    } else if (filterRetirement === 'has') {
      conditions.push('retirement_date IS NOT NULL AND retirement_date != \'\'');
    }
  }

  if (filterDiv !== 'all') { conditions.push('division = ?'); params.push(parseInt(filterDiv)); }
  const VALID_ENROLLMENT_FILTER = ['通常', '育休', '病欠', '傷病', '長欠'];
  if (filterStatus !== 'all' && VALID_ENROLLMENT_FILTER.includes(filterStatus)) {
    conditions.push('enrollment_status = ?'); params.push(filterStatus);
  }
  if (q) {
    const qk = toKatakana(q);
    const p = `%${q}%`, pk = `%${qk}%`;
    if (q !== qk) {
      conditions.push('(name LIKE ? OR name_kana LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)');
      params.push(p, p, pk, p);
    } else {
      conditions.push('(name LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)');
      params.push(p, p, p);
    }
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const baseStmt = c.env.DB.prepare(`SELECT id,emp_no,name,name_kana,division,team,work_schedule,start_time,car_no,enrollment_status,retirement_date,is_caution,is_active,status,exclude_retirement_candidate,is_hanchyo FROM employees ${where} ORDER BY division, team, seq_no, id`);

  // staffRows と退職クエリを並列実行
  const [staffRows, upcomingRetirements] = await Promise.all([
    (params.length ? baseStmt.bind(...params) : baseStmt).all<StaffRow>(),
    c.env.DB.prepare(`
    SELECT id, name, retirement_date
    FROM employees
    WHERE is_active = 1
      AND retirement_date IS NOT NULL
      AND retirement_date != ''
      AND retirement_date >= ?
      AND retirement_date <= ?
    ORDER BY retirement_date ASC
  `).bind(todayStr, in30Days).all<{ id: number; name: string; retirement_date: string }>(),
  ]);

  const retirementBanner = (() => {
    const list = upcomingRetirements.results ?? [];
    if (list.length === 0) return '';
    const todayMidnight = new Date(todayStr + 'T00:00:00+09:00').getTime();
    const items = list.map(r => {
      const d = new Date(r.retirement_date + 'T00:00:00+09:00');
      const diff = Math.ceil((d.getTime() - todayMidnight) / (1000 * 60 * 60 * 24));
      const label = diff === 0 ? '本日退職' : diff === 1 ? '明日退職' : `あと${diff}日`;
      const urgentColor = diff <= 3 ? '#dc2626' : '#d97706';
      return `<a href="${ADMIN_PATH}/staff/${r.id}" style="display:inline-flex;align-items:center;gap:6px;background:white;border:1px solid #fde68a;border-radius:6px;padding:4px 10px;text-decoration:none;color:#1f2937;font-size:12px;">
        <span style="color:${urgentColor};font-weight:700;">${label}</span>
        <span>${escHtml(r.name)}</span>
        <span style="color:#9ca3af;">${escHtml(r.retirement_date)}</span>
      </a>`;
    }).join('');
    return `
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 16px;margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:8px;">退職予定 ${list.length}名（30日以内）— 退職日到達時に自動で名簿から除外されます</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${items}</div>
    </div>`;
  })();

  const makeFilter = (key: string, val: string, base: Record<string, string>) => {
    const p = { ...base, [key]: val };
    if (key !== 'q') delete p.q;
    return Object.entries(p).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  };
  const base = { div: filterDiv, enrollment: filterStatus, active: filterActive, retire: filterRetirement };

  const divBtns = [['all', '全課'], ['1', '1課'], ['2', '2課'], ['3', '3課'], ['4', '4課']].map(([v, l]) =>
    `<a href="${ADMIN_PATH}/staff?${makeFilter('div', v, base)}" style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;${filterDiv === v ? 'background:#1a3a5c;color:white;' : 'background:#f3f4f6;color:#374151;'}">${l}</a>`
  ).join('');

  const enrollBtns = [['all', '全員'], ['通常', '通常'], ['育休', '育休'], ['病欠', '病欠'], ['傷病', '傷病'], ['長欠', '長欠']].map(([v, l]) =>
    `<a href="${ADMIN_PATH}/staff?${makeFilter('enrollment', v, base)}" style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;${filterStatus === v ? 'background:#1a3a5c;color:white;' : 'background:#f3f4f6;color:#374151;'}">${l}</a>`
  ).join('');

  const activeBtns = [['1', '在籍'], ['0', '退職'], ['', '全て']].map(([v, l]) =>
    `<a href="${ADMIN_PATH}/staff?${makeFilter('active', v, base)}" style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;${filterActive === v ? 'background:#1a3a5c;color:white;' : 'background:#f3f4f6;color:#374151;'}">${l}</a>`
  ).join('');

  const retireBtns = [['', '全員'], ['candidate', '退職候補'], ['soon', '30日以内'], ['has', '退職日あり']].map(([v, l]) =>
    `<a href="${ADMIN_PATH}/staff?${makeFilter('retire', v, base)}" style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;${filterRetirement === v ? 'background:#92400e;color:white;' : v === 'candidate' ? 'background:#fee2e2;color:#dc2626;' : 'background:#f3f4f6;color:#374151;'}">${l}</a>`
  ).join('');

  const TH = 'padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;user-select:none;';
  const THS = TH + 'cursor:pointer;';
  const C = 'padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:middle;';

  const rows = (staffRows.results ?? []).map(e => {
    const enStatus = e.enrollment_status ?? '通常';
    const bg = ENROLLMENT_COLORS[enStatus] ?? '#f3f4f6';
    const tc = ENROLLMENT_TEXT_COLORS[enStatus] ?? '#374151';
    const isRetiringSoon = e.retirement_date && e.retirement_date >= todayStr && e.retirement_date <= in30Days;
    const isNewcomer = e.status === 'training' || (e.status !== 'completed' && !e.status);
    const rowBg = isRetiringSoon ? '#fffbeb' : 'white';
    const rowHover = isRetiringSoon ? '#fef9c3' : '#f8fafc';
    const retDateVal = e.retirement_date ?? '';
    return `
    <tr data-id="${e.id}" data-bg="${rowBg}" data-hover="${rowHover}"
      data-active="${e.is_active ?? 1}"
      data-has-ret="${e.retirement_date ? '1' : '0'}"
      data-newcomer="${isNewcomer ? '1' : '0'}"
      data-enrollment="${escHtml(enStatus)}"
      style="cursor:pointer;background:${rowBg};"
      onmouseover="if(!this.classList.contains('sel'))this.style.background='${rowHover}'"
      onmouseout="if(!this.classList.contains('sel'))this.style.background='${rowBg}'"
      onclick="rowClick(event,${e.id})">
      <td style="${C}width:36px;text-align:center;" onclick="event.stopPropagation()">
        <input type="checkbox" class="row-cb" value="${e.id}" onchange="onCbChange(this)">
      </td>
      <td style="${C}font-size:12px;font-family:monospace;color:#6b7280;white-space:nowrap;" data-val="${escHtml(e.emp_no)}">${escHtml(e.emp_no)}</td>
      <td style="${C}" data-val="${escHtml(e.name)}">
        <div style="font-size:13px;font-weight:600;color:#1f2937;">${escHtml(e.name)}</div>
        ${e.name_kana ? `<div style="font-size:11px;color:#9ca3af;">${escHtml(e.name_kana)}</div>` : ''}
        <div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:2px;">
          ${e.is_hanchyo ? '<span style="background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;">班長</span>' : ''}
          ${isNewcomer ? '<span style="background:#dbeafe;color:#1e40af;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;">新人</span>' : ''}
          ${e.exclude_retirement_candidate ? '<span style="background:#f3f4f6;color:#6b7280;padding:1px 5px;border-radius:3px;font-size:10px;">候補除外</span>' : ''}
        </div>
      </td>
      <td style="${C}font-size:12px;color:#6b7280;white-space:nowrap;" data-val="${String(e.division ?? 99).padStart(2,'0')}${String(e.team ?? 99).padStart(2,'0')}">${e.division ? e.division + '課' : ''}${e.team ? ' ' + e.team + '班' : ''}${!e.division && !e.team ? '—' : ''}</td>
      <td style="${C}font-size:12px;color:#374151;white-space:nowrap;" data-val="${e.work_schedule ?? ''}">${e.work_schedule ?? '—'}</td>
      <td style="${C}font-size:12px;color:#374151;white-space:nowrap;" data-val="${e.start_time ?? ''}">${e.start_time ?? '—'}</td>
      <td style="${C}font-size:12px;white-space:nowrap;" data-val="${escHtml(e.car_no ?? '')}">
        ${e.car_no ? `<span style="font-family:monospace;">${escHtml(e.car_no)}</span>` : '—'}
      </td>
      <td style="${C}white-space:nowrap;" data-val="${escHtml(enStatus)}">
        <span style="background:${bg};color:${tc};padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;">${escHtml(enStatus)}</span>
      </td>
      <td style="${C}white-space:nowrap;" data-val="${retDateVal}">
        ${retDateVal
          ? `<span style="font-size:12px;color:${isRetiringSoon ? '#b45309' : '#6b7280'};">${escHtml(retDateVal)}</span>
             ${isRetiringSoon ? '<span style="background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;margin-left:3px;">予定</span>' : ''}`
          : '<span style="color:#d1d5db;font-size:11px;">—</span>'}
      </td>
      <td style="${C}white-space:nowrap;text-align:center;" data-val="${e.is_caution ? '1' : '0'}">
        ${e.is_caution ? '<span style="background:#fecaca;color:#991b1b;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;">注意</span>' : '—'}
      </td>
    </tr>`;
  }).join('');

  const content = `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;">

  ${retirementBanner}

  <!-- フィルター -->
  <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:14px 16px;margin-bottom:16px;">
    <form method="get" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
      <input type="hidden" name="div" value="${escHtml(filterDiv)}">
      <input type="hidden" name="enrollment" value="${escHtml(filterStatus)}">
      <input type="hidden" name="active" value="${escHtml(filterActive)}">
      <input type="hidden" name="retire" value="${escHtml(filterRetirement)}">
      <input name="q" value="${escHtml(q)}" placeholder="氏名・フリガナ・社員番号で検索"
        style="flex:1;min-width:200px;border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;">
      <button type="submit" style="padding:7px 16px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;">検索</button>
      ${q ? `<a href="${ADMIN_PATH}/staff" style="padding:7px 14px;background:#e5e7eb;color:#374151;border-radius:6px;font-size:13px;text-decoration:none;">クリア</a>` : ''}
    </form>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
      <div style="display:flex;gap:4px;align-items:center;">
        <span style="font-size:11px;color:#9ca3af;width:36px;">課</span>${divBtns}
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <span style="font-size:11px;color:#9ca3af;width:36px;">状態</span>${enrollBtns}
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <span style="font-size:11px;color:#9ca3af;width:36px;">在籍</span>${activeBtns}
      </div>
      <div style="display:flex;gap:4px;align-items:center;">
        <span style="font-size:11px;color:#9ca3af;width:42px;">退職</span>${retireBtns}
      </div>
    </div>
  </div>

  <!-- ヘッダー -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
    <div style="display:flex;align-items:center;gap:10px;position:relative;">
      <span style="font-size:13px;color:#6b7280;" id="staff-count">${(staffRows.results ?? []).length}名</span>
      <div style="position:relative;display:inline-block;">
        <button onclick="toggleSelMenu()" id="sel-menu-btn" style="padding:5px 10px;background:white;color:#374151;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;">
          条件選択 <span style="font-size:10px;">▼</span>
        </button>
        <div id="sel-menu" style="display:none;position:absolute;top:calc(100% + 4px);left:0;background:white;border:1px solid #e5e7eb;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:200;white-space:nowrap;overflow:hidden;min-width:180px;">
          <div style="padding:6px 0;">
            <div style="font-size:10px;color:#9ca3af;padding:4px 14px;font-weight:700;letter-spacing:0.05em;">表示中から選択</div>
            <button onclick="selectByCond('all')" class="sel-opt">表示中全員</button>
            <button onclick="selectByCond('active')" class="sel-opt">在籍中のみ</button>
            <button onclick="selectByCond('retired')" class="sel-opt">退職者のみ</button>
            <button onclick="selectByCond('has-ret')" class="sel-opt">退職日設定あり</button>
            <button onclick="selectByCond('soon-ret')" class="sel-opt">30日以内退職予定</button>
            <button onclick="selectByCond('newcomer')" class="sel-opt">新人のみ</button>
            <div style="border-top:1px solid #f3f4f6;margin:4px 0;"></div>
            <button onclick="selectByCond('none')" class="sel-opt" style="color:#dc2626;">選択解除</button>
          </div>
        </div>
      </div>
    </div>
    <div style="display:flex;gap:8px;">
      <button onclick="toggleCsvImport()" style="padding:8px 14px;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">
        CSVインポート
      </button>
      <a href="${ADMIN_PATH}/staff/new" style="padding:8px 18px;background:#1a3a5c;color:white;border-radius:7px;font-size:13px;font-weight:600;text-decoration:none;">＋ 新規登録</a>
    </div>
  </div>

  <!-- CSVインポートパネル -->
  <div id="csv-import-panel" style="display:none;background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
    <h3 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0 0 14px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">
      CSV インポート
    </h3>
    <p style="font-size:12px;color:#6b7280;margin:0 0 14px;">
      出庫データCSV（Shift-JIS）を選択してください。社員番号をキーに既存社員は更新、未登録社員は新規追加します。
    </p>

    <!-- ファイル選択エリア -->
    <input type="file" id="csv-file-input" accept=".csv,.CSV"
      style="display:none;"
      onchange="handleCsvFile(this.files[0])">
    <label id="csv-drop-zone" for="csv-file-input"
      style="display:block;border:2px dashed #d1d5db;border-radius:8px;padding:28px;text-align:center;cursor:pointer;margin-bottom:14px;transition:border-color 0.2s;"
      ondragover="event.preventDefault();this.style.borderColor='#1a3a5c'"
      ondragleave="this.style.borderColor='#d1d5db'"
      ondrop="handleCsvDrop(event)">
      <div style="font-size:13px;color:#6b7280;">クリックまたはドラッグでCSVファイルを選択</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:4px;">Shift-JIS / UTF-8 両対応</div>
    </label>

    <!-- 進捗バー -->
    <div id="csv-progress" style="display:none;margin-bottom:10px;">
      <div style="font-size:12px;color:#374151;margin-bottom:4px;" id="csv-progress-label">処理中…</div>
      <div style="background:#e5e7eb;border-radius:4px;height:6px;overflow:hidden;">
        <div id="csv-progress-bar" style="background:#1a3a5c;height:6px;width:0%;transition:width 0.2s;"></div>
      </div>
    </div>

    <!-- プレビュー -->
    <div id="csv-preview" style="display:none;">
      <div id="csv-summary" style="font-size:13px;color:#374151;margin-bottom:10px;"></div>
      <div style="overflow-x:auto;max-height:320px;border:1px solid #e5e7eb;border-radius:6px;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:860px;">
          <thead style="background:#f9fafb;position:sticky;top:0;">
            <tr>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">状態</th>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">社員番号</th>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">氏名 / 読み仮名</th>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">課・班</th>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">勤務体系</th>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">出勤時間</th>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">使用車番（頻度順）</th>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">平均帰庫</th>
              <th style="padding:6px 10px;text-align:left;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">備考</th>
            </tr>
          </thead>
          <tbody id="csv-preview-body"></tbody>
        </table>
      </div>
      <!-- 退職候補リスト -->
      <div id="csv-retirement-candidates" style="display:none;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-top:12px;"></div>
      <div style="display:flex;gap:10px;margin-top:14px;justify-content:flex-end;">
        <button onclick="clearCsvImport()" style="padding:8px 16px;background:#f3f4f6;color:#374151;border:none;border-radius:6px;font-size:13px;cursor:pointer;">キャンセル</button>
        <button id="csv-import-btn" onclick="executeCsvImport()"
          style="padding:8px 20px;background:#166534;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">
          インポート実行
        </button>
      </div>
    </div>
    <div id="csv-result" style="display:none;"></div>
  </div>

  <!-- テーブル -->
  <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow-x:auto;margin-bottom:80px;">
    <table id="staff-table" style="width:100%;border-collapse:collapse;min-width:900px;">
      <thead style="background:#f9fafb;">
        <tr>
          <th style="${TH}width:36px;text-align:center;">
            <input type="checkbox" id="cb-all" onchange="toggleAll(this)" title="全選択">
          </th>
          <th style="${THS}" onclick="sortTable(1)">社員番号 <span class="si">↕</span></th>
          <th style="${THS}" onclick="sortTable(2)">氏名 <span class="si">↕</span></th>
          <th style="${THS}" onclick="sortTable(3)">課・班 <span class="si">↕</span></th>
          <th style="${THS}" onclick="sortTable(4)">勤務体系 <span class="si">↕</span></th>
          <th style="${THS}" onclick="sortTable(5)">出勤時間 <span class="si">↕</span></th>
          <th style="${THS}" onclick="sortTable(6)">車番 <span class="si">↕</span></th>
          <th style="${THS}" onclick="sortTable(7)">在籍状態 <span class="si">↕</span></th>
          <th style="${THS}" onclick="sortTable(8)">退職予定日 <span class="si">↕</span></th>
          <th style="${TH}text-align:center;">要注意</th>
        </tr>
      </thead>
      <tbody id="staff-tbody">
        ${rows || `<tr><td colspan="10" style="padding:24px;text-align:center;color:#9ca3af;">該当する社員がいません</td></tr>`}
      </tbody>
    </table>
  </div>

  <!-- 一括操作バー（選択時に浮上） -->
  <div id="bulk-bar" style="display:none;position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a3a5c;color:white;border-radius:12px;padding:12px 20px;box-shadow:0 4px 20px rgba(0,0,0,0.3);display:none;align-items:center;gap:12px;z-index:100;white-space:nowrap;">
    <span id="bulk-count" style="font-size:13px;font-weight:600;"></span>
    <button onclick="bulkRetire()" style="padding:6px 14px;background:#d97706;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">退職処理</button>
    <button onclick="bulkPurge()" style="padding:6px 14px;background:#dc2626;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">完全削除</button>
    <button onclick="clearSel()" style="padding:6px 12px;background:rgba(255,255,255,0.15);color:white;border:none;border-radius:6px;font-size:13px;cursor:pointer;">キャンセル</button>
  </div>
</div>

<style>
.sel-opt{display:block;width:100%;padding:8px 14px;background:none;border:none;text-align:left;font-size:13px;color:#374151;cursor:pointer;}
.sel-opt:hover{background:#f3f4f6;}
</style>
<script>
// ===== テーブル ソート・選択 =====
const ADMIN_PATH_S = '${ADMIN_PATH}';
let _sc = -1, _sd = 1;

function sortTable(col) {
  const tbody = document.getElementById('staff-tbody');
  if (!tbody) return;
  const rows = [...tbody.querySelectorAll('tr[data-id]')];
  if (_sc === col) _sd *= -1; else { _sc = col; _sd = 1; }
  rows.sort((a, b) => {
    const av = a.cells[col]?.dataset?.val ?? a.cells[col]?.textContent?.trim() ?? '';
    const bv = b.cells[col]?.dataset?.val ?? b.cells[col]?.textContent?.trim() ?? '';
    // 空文字は末尾
    if (!av && bv) return 1;
    if (av && !bv) return -1;
    return av.localeCompare(bv, 'ja') * _sd;
  });
  rows.forEach(r => tbody.appendChild(r));
  document.querySelectorAll('.si').forEach((el, i) => {
    el.textContent = (i + 1 === col) ? (_sd === 1 ? '▲' : '▼') : '↕';
  });
}

function rowClick(e, id) {
  if (e.target.type === 'checkbox') return;
  location.href = ADMIN_PATH_S + '/staff/' + id + location.search;
}

function onCbChange(cb) {
  const row = cb.closest('tr');
  if (cb.checked) {
    row.classList.add('sel');
    row.style.background = '#eff6ff';
  } else {
    row.classList.remove('sel');
    row.style.background = row.dataset.bg || 'white';
  }
  updateBar();
}

function toggleAll(master) {
  document.querySelectorAll('.row-cb').forEach(cb => {
    cb.checked = master.checked;
    onCbChange(cb);
  });
}

// ===== 条件選択メニュー =====
function toggleSelMenu() {
  const menu = document.getElementById('sel-menu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}
document.addEventListener('click', function(e) {
  const btn = document.getElementById('sel-menu-btn');
  const menu = document.getElementById('sel-menu');
  if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
    menu.style.display = 'none';
  }
});

function selectByCond(cond) {
  document.getElementById('sel-menu').style.display = 'none';
  const todayStr = new Date(Date.now() + 9*60*60*1000).toISOString().split('T')[0];
  const in30Days = new Date(Date.now() + 9*60*60*1000 + 30*24*60*60*1000).toISOString().split('T')[0];

  document.querySelectorAll('.row-cb').forEach(cb => {
    const tr = cb.closest('tr');
    let match = false;
    if (cond === 'all')      match = true;
    else if (cond === 'none') match = false;
    else if (cond === 'active')   match = tr.dataset.active === '1';
    else if (cond === 'retired')  match = tr.dataset.active === '0';
    else if (cond === 'has-ret')  match = tr.dataset.hasRet === '1';
    else if (cond === 'soon-ret') {
      const d = tr.querySelector('td[data-val]') ? null : null;
      // 退職日セルはindex 8（0始まり）
      const retCell = tr.cells[8];
      const retVal = retCell ? retCell.dataset.val : '';
      match = retVal >= todayStr && retVal <= in30Days;
    }
    else if (cond === 'newcomer') match = tr.dataset.newcomer === '1';
    cb.checked = match;
    onCbChange(cb);
  });

  // cb-all の indeterminate 更新
  const all = document.getElementById('cb-all');
  const total = document.querySelectorAll('.row-cb').length;
  const checked = document.querySelectorAll('.row-cb:checked').length;
  all.indeterminate = checked > 0 && checked < total;
  all.checked = total > 0 && checked === total;
}

function updateBar() {
  const sel = [...document.querySelectorAll('.row-cb:checked')];
  const bar = document.getElementById('bulk-bar');
  document.getElementById('bulk-count').textContent = sel.length + '名選択中';
  bar.style.display = sel.length > 0 ? 'flex' : 'none';
  const all = document.getElementById('cb-all');
  const total = document.querySelectorAll('.row-cb').length;
  all.indeterminate = sel.length > 0 && sel.length < total;
  all.checked = sel.length === total && total > 0;
}

function clearSel() {
  document.querySelectorAll('.row-cb').forEach(cb => { cb.checked = false; onCbChange(cb); });
  document.getElementById('cb-all').checked = false;
  document.getElementById('bulk-bar').style.display = 'none';
}

function getSelectedIds() {
  return [...document.querySelectorAll('.row-cb:checked')].map(cb => parseInt(cb.value));
}

async function bulkRetire() {
  const ids = getSelectedIds();
  if (!ids.length) return;
  if (!confirm(ids.length + '名を退職処理しますか？（論理削除・復元可能）')) return;
  try {
    const res = await fetch('/api/employees/bulk-retire', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids })
    });
    if (res.ok) {
      location.reload();
    } else {
      const json = await res.json().catch(() => ({}));
      alert('退職処理に失敗しました: ' + (json.error || res.status));
    }
  } catch (err) {
    alert('通信エラー: ' + err.message);
  }
}

async function bulkPurge() {
  const ids = getSelectedIds();
  if (!ids.length) return;
  if (!confirm('【警告】' + ids.length + '名を完全削除します。\\nシフト・売上・面談データも全て消えます。\\nこの操作は取り消せません。')) return;
  if (!confirm('本当によろしいですか？')) return;
  try {
    const res = await fetch('/api/employees/bulk-purge', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ ids })
    });
    if (res.ok) {
      location.reload();
    } else {
      const json = await res.json().catch(() => ({}));
      alert('完全削除に失敗しました: ' + (json.error || res.status));
    }
  } catch (err) {
    alert('通信エラー: ' + err.message);
  }
}

// ===== CSV インポート =====

const ADMIN_PATH = '${ADMIN_PATH}';
let csvParsedData = [];
const EXISTING_EMP_NOS = new Set(${JSON.stringify((staffRows.results ?? []).map(e => e.emp_no))});

// ===== UI 操作 =====
function toggleCsvImport() {
  const panel = document.getElementById('csv-import-panel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function handleCsvDrop(event) {
  event.preventDefault();
  document.getElementById('csv-drop-zone').style.borderColor = '#d1d5db';
  const file = event.dataTransfer.files[0];
  if (file) handleCsvFile(file);
}

function setProgress(pct, label) {
  const wrap = document.getElementById('csv-progress');
  const bar  = document.getElementById('csv-progress-bar');
  const lbl  = document.getElementById('csv-progress-label');
  if (!wrap) return;
  if (pct === null) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  bar.style.width = pct + '%';
  lbl.textContent = label;
}

function handleCsvFile(file) {
  if (!file) return;
  document.getElementById('csv-drop-zone').style.borderColor = '#1a3a5c';
  setProgress(0, 'ファイル読み込み中…');
  const reader = new FileReader();
  reader.onload = async e => {
    const buf = e.target.result;
    let text;
    try { text = new TextDecoder('shift-jis').decode(buf); }
    catch { text = new TextDecoder('utf-8').decode(buf); }
    await parseCsvText(text);
  };
  reader.readAsArrayBuffer(file);
}

// ===== 定数 =====
const WORK_TYPE_MAP = {
  '日勤A':'a','日勤Ａ':'a','日勤B':'B','日勤Ｂ':'B',
  'D勤':'D','Ｄ勤':'D','B勤':'b','Ｂ勤':'b',
  'H勤':'H','Ｈ勤':'H','公H':'H','公Ｈ':'H',
};
const TIME_CANDS = [6.0,6.5,8.0,9.5,15.0,16.0,18.0,19.0];
const TIME_LABELS = {6.0:'6:00',6.5:'6:50',8.0:'8:00',9.5:'9:30',15.0:'15:00',16.0:'16:00',18.0:'18:00',19.0:'19:00'};

function snapStartTime(h) {
  let best=TIME_CANDS[0], bd=Math.abs(h-best);
  for (const c of TIME_CANDS) { const d=Math.abs(h-c); if(d<bd){bd=d;best=c;} }
  return TIME_LABELS[best]||null;
}
function fmtHours(h) {
  if(isNaN(h)||h<0) return null;
  const hr=Math.floor(h)%24, mn=Math.round((h-Math.floor(h))*60);
  return String(hr).padStart(2,'0')+':'+String(mn<60?mn:59).padStart(2,'0');
}
function modeOf(arr) {
  if(!arr.length) return null;
  const f={}; for(const v of arr) f[v]=(f[v]||0)+1;
  return Object.entries(f).sort((a,b)=>b[1]-a[1])[0][0];
}
function avgOf(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null; }

// ===== CSV 解析（チャンク分割・非同期・進捗表示） =====
async function parseCsvText(text) {
  const lines = text.split(/\\r?\\n/);
  const total = lines.length;
  const empMap = {};
  let csvMaxDate = '';

  const CHUNK = 8000;
  for (let i = 0; i < total; i += CHUNK) {
    const end = Math.min(i + CHUNK, total);
    for (let j = i; j < end; j++) {
      const line = lines[j];
      if (!line || !line.trim()) continue;
      const cols = line.split(',');
      if (cols.length < 8) continue;
      const dateRaw = cols[0]?.trim();
      const teamRaw = cols[2]?.trim();
      const empNo   = cols[3]?.trim();
      const name    = cols[4]?.trim();
      const workRaw = cols[5]?.trim();
      const carRaw  = cols[6]?.trim();
      const startRaw = parseFloat(cols[7]?.trim());
      const retRaw   = parseFloat(cols[8]?.trim());

      if (!empNo || !name || !/^\\d{8}$/.test(empNo)) continue;
      if (dateRaw && dateRaw > csvMaxDate) csvMaxDate = dateRaw;

      if (!empMap[empNo]) {
        empMap[empNo] = { emp_no:empNo, name, team:parseInt(teamRaw)||null,
          workTypes:[], carFreq:{}, startEntries:[], returnTimes:[], dates:[] };
      }
      const e = empMap[empNo];
      const mapped = WORK_TYPE_MAP[workRaw];
      if (mapped) e.workTypes.push(mapped);
      if (carRaw && /^\\d+$/.test(carRaw)) e.carFreq[carRaw] = (e.carFreq[carRaw]||0)+1;
      if (!isNaN(startRaw) && startRaw>0) e.startEntries.push({date:dateRaw, time:startRaw});
      if (!isNaN(retRaw) && retRaw>0) e.returnTimes.push(retRaw);
      if (dateRaw) e.dates.push(dateRaw);
    }
    // UIをブロックしないよう次のフレームに譲る
    setProgress(Math.floor(end / total * 80), \`解析中 \${end.toLocaleString()} / \${total.toLocaleString()} 行\`);
    await new Promise(r => setTimeout(r, 0));
  }

  // 直近30日の境界
  let recentCutoff = '';
  if (csvMaxDate) {
    const ms = new Date(csvMaxDate.replace(/\\//g,'-')).getTime() - 30*86400000;
    recentCutoff = new Date(ms).toISOString().slice(0,10).replace(/-/g,'/');
  }

  csvParsedData = Object.values(empMap).map(e => {
    const work_schedule = modeOf(e.workTypes);
    const allTimes = e.startEntries.map(s=>s.time);
    const start_time = avgOf(allTimes) !== null ? snapStartTime(avgOf(allTimes)) : null;

    // 使用車番（頻度順 Top5、担当車番としてDBに保存しない）
    const sortedCars = Object.entries(e.carFreq).sort((a,b)=>b[1]-a[1]).map(([c])=>c);
    const used_cars = sortedCars.length ? JSON.stringify(sortedCars.slice(0,5)) : null;
    const topCarsDisplay = sortedCars.slice(0,3).join(' / ') || '—';

    const avg_return_time = fmtHours(avgOf(e.returnTimes));
    const division = e.team ? Math.ceil(e.team/2) : null;

    // 最終出勤日・長期不在チェック（3ヶ月以上）
    const uniqDates = [...new Set(e.dates)].sort();
    const lastDate = uniqDates[uniqDates.length-1] || null;
    let daysSinceLast = null;
    if (lastDate && csvMaxDate) {
      daysSinceLast = Math.floor(
        (new Date(csvMaxDate.replace(/\\//g,'-')) - new Date(lastDate.replace(/\\//g,'-'))) / 86400000
      );
    }
    const isLongAbsent = daysSinceLast !== null && daysSinceLast >= 90;

    // 出勤シフト変化チェック（直近30日 vs 以前 で 2h 以上ズレ）
    let hasTimeChange=false, recentAvg=null, earlyAvg=null;
    if (recentCutoff && e.startEntries.length >= 6) {
      const rec = e.startEntries.filter(s=>s.date>=recentCutoff).map(s=>s.time);
      const ear = e.startEntries.filter(s=>s.date< recentCutoff).map(s=>s.time);
      if (rec.length>=3 && ear.length>=3) {
        recentAvg=avgOf(rec); earlyAvg=avgOf(ear);
        hasTimeChange = Math.abs(recentAvg-earlyAvg) >= 2;
      }
    }

    return {
      emp_no:e.emp_no, name:e.name, name_kana:null,
      division, team:e.team,
      work_schedule, start_time,
      used_cars, topCarsDisplay,
      avg_return_time,
      lastDate, daysSinceLast, isLongAbsent,
      hasTimeChange, recentAvg, earlyAvg,
    };
  });

  setProgress(90, '表示構築中…');
  await new Promise(r => setTimeout(r, 0));
  await renderCsvPreview();
  setProgress(null, '');
}

// ===== プレビュー描画 =====
function renderCsvPreview() {
  const newCnt    = csvParsedData.filter(e=>!EXISTING_EMP_NOS.has(e.emp_no)).length;
  const updCnt    = csvParsedData.filter(e=> EXISTING_EMP_NOS.has(e.emp_no)).length;
  const absCnt    = csvParsedData.filter(e=>e.isLongAbsent).length;
  const chgCnt    = csvParsedData.filter(e=>e.hasTimeChange).length;

  document.getElementById('csv-summary').innerHTML =
    '解析: <strong>'+csvParsedData.length+'名</strong> — '+
    '<span style="color:#166534;">新規追加 '+newCnt+'名</span> / '+
    '<span style="color:#1d4ed8;">更新 '+updCnt+'名</span>'+
    (absCnt ? ' / <span style="color:#dc2626;">長期不在 '+absCnt+'名</span>' : '')+
    (chgCnt ? ' / <span style="color:#d97706;">シフト変化 '+chgCnt+'名</span>' : '')+
    '<div style="font-size:11px;color:#6b7280;margin-top:4px;">※ CSV追加社員は一般社員として登録されます。新人シフト管理には出ません。</div>';

  const tbody = document.getElementById('csv-preview-body');
  tbody.innerHTML = csvParsedData.map(e => {
    const isNew = !EXISTING_EMP_NOS.has(e.emp_no);
    const badge = isNew
      ? '<span style="background:#dcfce7;color:#166534;padding:1px 5px;border-radius:3px;font-weight:700;font-size:10px;">新規</span>'
      : '<span style="background:#dbeafe;color:#1d4ed8;padding:1px 5px;border-radius:3px;font-weight:700;font-size:10px;">更新</span>';
    const flags = [];
    if (e.isLongAbsent)  flags.push('<span style="background:#fee2e2;color:#dc2626;padding:1px 4px;border-radius:3px;font-size:10px;font-weight:700;">不在'+e.daysSinceLast+'日</span>');
    if (e.hasTimeChange) {
      const from=e.earlyAvg!==null?snapStartTime(e.earlyAvg):'?';
      const to  =e.recentAvg!==null?snapStartTime(e.recentAvg):'?';
      flags.push('<span style="background:#fef3c7;color:#92400e;padding:1px 4px;border-radius:3px;font-size:10px;font-weight:700;">'+from+'→'+to+'</span>');
    }
    const rowBg = e.isLongAbsent?'#fff1f2':e.hasTimeChange?'#fffbeb':'';
    return '<tr style="border-bottom:1px solid #f3f4f6;'+(rowBg?'background:'+rowBg+';':'')+'">' +
      '<td style="padding:5px 8px;">'+badge+'</td>' +
      '<td style="padding:5px 8px;font-family:monospace;color:#6b7280;font-size:11px;">'+e.emp_no+'</td>' +
      '<td style="padding:5px 8px;"><div style="font-weight:600;font-size:12px;">'+(e.name||'—')+'</div>'+
        (e.name_kana?'<div style="font-size:11px;color:#9ca3af;">'+e.name_kana+'</div>':'')+
        '</td>' +
      '<td style="padding:5px 8px;font-size:12px;">'+(e.division?e.division+'課 ':'')+( e.team?e.team+'班':'—')+'</td>' +
      '<td style="padding:5px 8px;font-size:12px;">'+(e.work_schedule||'—')+'</td>' +
      '<td style="padding:5px 8px;font-size:12px;">'+(e.start_time||'—')+'</td>' +
      '<td style="padding:5px 8px;font-family:monospace;font-size:11px;color:#374151;">'+(e.topCarsDisplay)+'</td>' +
      '<td style="padding:5px 8px;font-size:12px;color:#6b7280;">'+(e.avg_return_time||'—')+'</td>' +
      '<td style="padding:5px 8px;">'+flags.join(' ')+'</td>' +
      '</tr>';
  }).join('');

  // 退職候補リスト
  const absent  = csvParsedData.filter(e=>e.isLongAbsent);
  const changed = csvParsedData.filter(e=>e.hasTimeChange);
  const retDiv  = document.getElementById('csv-retirement-candidates');
  if (retDiv) {
    if (!absent.length && !changed.length) {
      retDiv.style.display = 'none';
    } else {
      const btnStyle = 'cursor:pointer;border:none;border-radius:5px;padding:4px 10px;font-size:11px;font-weight:700;';
      let h = '<div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:10px;">退職候補リスト（要確認）' +
        '<span style="font-weight:400;font-size:11px;color:#78350f;margin-left:8px;">チェックして一括処理できます</span></div>';

      // 全選択ボタン行
      h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
        '<label style="font-size:11px;font-weight:700;color:#374151;cursor:pointer;">' +
        '<input type="checkbox" id="ret-all-cb" onchange="retToggleAll(this)"> 全選択</label>' +
        '<button style="'+btnStyle+'background:#fee2e2;color:#dc2626;" onclick="retBulkAction(&#39;retire&#39;)">退職処理</button>' +
        '<button style="'+btnStyle+'background:#374151;color:white;" onclick="retBulkAction(&#39;purge&#39;)">完全削除</button>' +
        '</div>';

      if (absent.length) {
        h += '<div style="font-size:11px;font-weight:700;color:#b45309;margin-bottom:5px;">' +
          '<label style="cursor:pointer;"><input type="checkbox" class="ret-grp-cb" data-grp="absent" onchange="retToggleGroup(this)"> 長期不在（3ヶ月以上出勤なし ' + absent.length + '名）</label></div>';
        h += '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;padding-left:18px;">';
        for (const e of absent) {
          h += '<label style="display:flex;align-items:center;gap:4px;background:white;border:1px solid #fecaca;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">' +
            '<input type="checkbox" class="ret-cb" data-grp="absent" value="'+e.emp_no+'">' +
            '<b>'+e.name+'</b>' +
            '<span style="font-family:monospace;color:#9ca3af;font-size:10px;">'+e.emp_no+'</span>' +
            '<span style="color:#dc2626;">最終:'+e.lastDate+'（'+e.daysSinceLast+'日前）</span></label>';
        }
        h += '</div>';
      }
      if (changed.length) {
        h += '<div style="font-size:11px;font-weight:700;color:#b45309;margin-bottom:5px;">' +
          '<label style="cursor:pointer;"><input type="checkbox" class="ret-grp-cb" data-grp="changed" onchange="retToggleGroup(this)"> 出勤シフト変化（直近30日 ' + changed.length + '名）</label></div>';
        h += '<div style="display:flex;flex-wrap:wrap;gap:5px;padding-left:18px;">';
        for (const e of changed) {
          const from=e.earlyAvg!==null?snapStartTime(e.earlyAvg):'?';
          const to  =e.recentAvg!==null?snapStartTime(e.recentAvg):'?';
          h += '<label style="display:flex;align-items:center;gap:4px;background:white;border:1px solid #fde68a;border-radius:5px;padding:3px 8px;font-size:11px;cursor:pointer;">' +
            '<input type="checkbox" class="ret-cb" data-grp="changed" value="'+e.emp_no+'">' +
            '<b>'+e.name+'</b>' +
            '<span style="font-family:monospace;color:#9ca3af;font-size:10px;">'+e.emp_no+'</span>' +
            '<span style="color:#d97706;">'+from+'→'+to+'</span></label>';
        }
        h += '</div>';
      }
      retDiv.innerHTML = h;
      retDiv.style.display = 'block';
    }
  }

  document.getElementById('csv-preview').style.display = 'block';
  document.getElementById('csv-result').style.display = 'none';
}

// ===== 退職候補チェックボックス操作 =====
function retToggleAll(cb) {
  document.querySelectorAll('.ret-cb,.ret-grp-cb').forEach(el => { el.checked = cb.checked; });
}
function retToggleGroup(grpCb) {
  const grp = grpCb.dataset.grp;
  document.querySelectorAll('.ret-cb[data-grp="'+grp+'"]').forEach(el => { el.checked = grpCb.checked; });
  syncRetAllCb();
}
function syncRetAllCb() {
  const all = document.querySelectorAll('.ret-cb');
  const checked = document.querySelectorAll('.ret-cb:checked');
  const allCb = document.getElementById('ret-all-cb');
  if (allCb) allCb.indeterminate = checked.length > 0 && checked.length < all.length;
  if (allCb) allCb.checked = all.length > 0 && checked.length === all.length;
}
function retGetSelected() {
  return Array.from(document.querySelectorAll('.ret-cb:checked')).map(el => el.value);
}
async function retBulkAction(action) {
  const empNos = retGetSelected();
  if (!empNos.length) { alert('対象を選択してください'); return; }
  const label = action === 'retire' ? '退職処理' : '完全削除';
  if (!confirm(empNos.length + '名を' + label + 'します。よろしいですか？')) return;
  if (action === 'purge' && !confirm('完全削除すると元に戻せません。本当に削除しますか？')) return;
  const endpoint = action === 'retire' ? '/api/employees/retire-by-empno' : '/api/employees/purge-by-empno';
  try {
    const res = await fetch(endpoint, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ empNos })
    });
    const json = await res.json();
    if (res.ok) {
      alert(label + '完了: ' + json.count + '名');
      // 処理済みをリストから除去
      empNos.forEach(no => {
        const cb = document.querySelector('.ret-cb[value="'+no+'"]');
        if (cb) cb.closest('label')?.remove();
      });
      syncRetAllCb();
    } else {
      alert('エラー: ' + (json.error || '不明'));
    }
  } catch (err) {
    alert('通信エラー: ' + err.message);
  }
}

// ===== インポート実行 =====
async function executeCsvImport() {
  if (!csvParsedData.length) return;
  const btn = document.getElementById('csv-import-btn');
  btn.disabled = true;

  const payload = csvParsedData.map(e => ({
    emp_no: e.emp_no, name: e.name,
    name_kana: e.name_kana || null,
    division: e.division, team: e.team,
    work_schedule: e.work_schedule, start_time: e.start_time,
    avg_return_time: e.avg_return_time,
    used_cars: e.used_cars,
    isLongAbsent: e.isLongAbsent || false,
  }));

  // 100名ずつ分割して送信（大量データでもタイムアウトしない）
  const BATCH = 100;
  let totalInserted = 0, totalUpdated = 0;
  const allErrors = [];

  try {
    for (let i = 0; i < payload.length; i += BATCH) {
      btn.textContent = \`送信中… \${Math.min(i+BATCH, payload.length)}/\${payload.length}名\`;
      const res = await fetch('/api/employees/csv-import', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ employees: payload.slice(i, i + BATCH) })
      });
      const json = await res.json();
      if (res.ok) {
        totalInserted += json.inserted || 0;
        totalUpdated  += json.updated  || 0;
        if (json.errors?.length) allErrors.push(...json.errors);
      } else {
        allErrors.push(json.error || \`batch \${i} エラー\`);
      }
    }

    const resultDiv = document.getElementById('csv-result');
    resultDiv.innerHTML = '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;font-size:13px;color:#166534;">'+
      'インポート完了: <strong>新規追加 '+totalInserted+'名</strong> / <strong>更新 '+totalUpdated+'名</strong>'+
      (allErrors.length?'<div style="margin-top:8px;color:#dc2626;font-size:12px;">エラー: '+allErrors.join('、')+'</div>':'')+
      '<div style="margin-top:10px;"><a href="'+ADMIN_PATH+'/staff" style="color:#1d4ed8;font-size:13px;">→ 社員一覧を更新</a></div></div>';
    resultDiv.style.display='block';
    document.getElementById('csv-preview').style.display='none';
    // 退職候補は残したまま（インポート後も退職処理できるように）
  } catch (err) {
    alert('通信エラーが発生しました: ' + err.message);
  } finally {
    btn.disabled=false; btn.textContent='インポート実行';
  }
}

function clearCsvImport() {
  csvParsedData = [];
  ['csv-preview','csv-result','csv-retirement-candidates'].forEach((id)=>{
    const el=document.getElementById(id); if(el) el.style.display='none';
  });
  document.getElementById('csv-file-input').value='';
  document.getElementById('csv-drop-zone').style.borderColor='#d1d5db';
  document.getElementById('csv-import-panel').style.display='none';
}

</script>`;

  return c.html(layout('社員管理', content, 'staff'));
});

// ===== 新規登録フォーム =====
app.get('/staff/new', (c) => {
  return c.html(layout('社員管理 — 新規登録', staffForm(null), 'staff'));
});


// ===== 社員絞り込み検索 =====
app.get('/staff/search', async (c) => {
  const submitted = c.req.query('s') === '1';
  const q = (c.req.query('q') ?? '').trim();
  const divArr   = c.req.queries('div') ?? [];
  const wsArr    = c.req.queries('ws')  ?? [];
  const stArr    = c.req.queries('st')  ?? [];
  const enArr    = c.req.queries('en')  ?? [];
  const whtArr   = c.req.queries('wht') ?? [];
  const act   = c.req.query('act')  ?? 'all';
  const nw    = c.req.query('nw')   ?? 'all';
  const hc    = c.req.query('hc')   ?? 'all';
  const ca    = c.req.query('ca')   ?? '';
  const sfu   = c.req.query('sfu')  ?? '';
  const hf    = c.req.query('hf')   ?? '';
  const ht    = c.req.query('ht')   ?? '';
  const rf    = c.req.query('rf')   ?? '';
  const rt    = c.req.query('rt')   ?? '';
  const ami   = c.req.query('ami')  ?? '';
  const ama   = c.req.query('ama')  ?? '';
  const car   = c.req.query('car')  ?? 'all';
  const tmin  = c.req.query('tmin') ?? '';
  const tmax  = c.req.query('tmax') ?? '';

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (q) {
    const qk = toKatakana(q);
    const p = `%${q}%`, pk = `%${qk}%`;
    if (q !== qk) {
      conditions.push('(name LIKE ? OR name_kana LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)');
      params.push(p, p, pk, p);
    } else {
      conditions.push('(name LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)');
      params.push(p, p, p);
    }
  }
  if (act === '1') conditions.push('is_active = 1');
  else if (act === '0') conditions.push('is_active = 0');

  if (divArr.length > 0) {
    const valid = divArr.filter(d => ['1','2','3','4'].includes(d)).map(Number);
    if (valid.length > 0) {
      conditions.push(`division IN (${valid.map(() => '?').join(',')})`);
      params.push(...valid);
    }
  }
  if (tmin && !isNaN(parseInt(tmin))) { conditions.push('team >= ?'); params.push(parseInt(tmin)); }
  if (tmax && !isNaN(parseInt(tmax))) { conditions.push('team <= ?'); params.push(parseInt(tmax)); }

  if (wsArr.length > 0) {
    const valid = wsArr.filter(w => ['a','b','B','D','H'].includes(w));
    if (valid.length > 0) {
      conditions.push(`work_schedule IN (${valid.map(() => '?').join(',')})`);
      params.push(...valid);
    }
  }
  if (stArr.length > 0) {
    const valid = stArr.filter(t => ALL_TIMES.includes(t));
    if (valid.length > 0) {
      conditions.push(`start_time IN (${valid.map(() => '?').join(',')})`);
      params.push(...valid);
    }
  }
  if (enArr.length > 0) {
    const valid = enArr.filter(e => ['通常','育休','病欠','傷病','長欠'].includes(e));
    if (valid.length > 0) {
      conditions.push(`enrollment_status IN (${valid.map(() => '?').join(',')})`);
      params.push(...valid);
    }
  }
  if (whtArr.length > 0) {
    const valid = whtArr.filter(w => ['労フル','労短'].includes(w));
    if (valid.length > 0) {
      conditions.push(`work_hours_type IN (${valid.map(() => '?').join(',')})`);
      params.push(...valid);
    }
  }
  if (nw === '1') {
    conditions.push("(status = 'training' OR (status IS NULL AND status != 'completed'))");
  } else if (nw === '0') {
    conditions.push("status = 'completed'");
  }
  if (hc === '1') conditions.push('is_hanchyo = 1');
  else if (hc === '0') conditions.push('is_hanchyo = 0');
  if (ca === '1') conditions.push('is_caution = 1');
  if (sfu === '1') conditions.push('is_sales_followup = 1');
  if (hf) { conditions.push('hire_date >= ?'); params.push(hf); }
  if (ht) { conditions.push('hire_date <= ?'); params.push(ht); }
  if (rf) { conditions.push("retirement_date IS NOT NULL AND retirement_date != '' AND retirement_date >= ?"); params.push(rf); }
  if (rt) { conditions.push("retirement_date IS NOT NULL AND retirement_date != '' AND retirement_date <= ?"); params.push(rt); }
  if (car === '1') conditions.push("car_no IS NOT NULL AND car_no != ''");
  else if (car === '0') conditions.push("(car_no IS NULL OR car_no = '')");

  const ageExpr = `CAST((strftime('%Y','now','+9 hours') - strftime('%Y',birth_date) - (strftime('%m-%d','now','+9 hours') < strftime('%m-%d',birth_date))) AS INTEGER)`;
  if (ami && !isNaN(parseInt(ami))) {
    conditions.push(`(birth_date IS NOT NULL AND birth_date != '' AND ${ageExpr} >= ?)`);
    params.push(parseInt(ami));
  }
  if (ama && !isNaN(parseInt(ama))) {
    conditions.push(`(birth_date IS NOT NULL AND birth_date != '' AND ${ageExpr} <= ?)`);
    params.push(parseInt(ama));
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  let staffRows: StaffRow[] = [];
  if (submitted) {
    const stmt = c.env.DB.prepare(
      `SELECT id,emp_no,name,name_kana,division,team,work_schedule,start_time,work_hours_type,enrollment_status,hire_date,retirement_date,birth_date,car_no,avg_return_time,is_caution,is_sales_followup,is_hanchyo,status,is_active FROM employees ${where} ORDER BY division, team, seq_no, id`
    );
    const result = params.length ? await stmt.bind(...params).all<StaffRow>() : await stmt.all<StaffRow>();
    staffRows = result.results ?? [];
  }

  const chk = (arr: string[], val: string) => arr.includes(val) ? 'checked' : '';
  const radio = (cur: string, val: string) => cur === val ? 'checked' : '';

  const LABEL = 'font-size:12px;color:#374151;cursor:pointer;display:flex;align-items:center;gap:5px;';
  const CB_GROUP = 'display:flex;flex-wrap:wrap;gap:6px 14px;';
  const SEC = 'margin-bottom:18px;';
  const SEC_LABEL = 'font-size:10px;font-weight:700;color:#9ca3af;display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #f3f4f6;padding-bottom:4px;';

  const TH = 'padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;';
  const TD = 'padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:middle;font-size:12px;';

  const resultRows = submitted ? staffRows.map(e => {
    const enStatus = e.enrollment_status ?? '通常';
    const bg = ENROLLMENT_COLORS[enStatus] ?? '#f3f4f6';
    const tc = ENROLLMENT_TEXT_COLORS[enStatus] ?? '#374151';
    const age = calcAge(e.birth_date);
    const isNewcomerFlag = e.status === 'training' || (e.status !== 'completed' && !e.status);
    return `
    <tr style="cursor:pointer;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''" onclick="location.href='${ADMIN_PATH}/staff/${e.id}'">
      <td style="${TD}font-family:monospace;color:#9ca3af;">${escHtml(e.emp_no)}</td>
      <td style="${TD}">
        <div style="font-weight:600;color:#1f2937;">${escHtml(e.name)}</div>
        ${e.name_kana ? `<div style="font-size:11px;color:#9ca3af;">${escHtml(e.name_kana)}</div>` : ''}
        <div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:2px;">
          ${e.is_hanchyo ? '<span style="background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;">班長</span>' : ''}
          ${isNewcomerFlag ? '<span style="background:#dbeafe;color:#1e40af;padding:1px 5px;border-radius:3px;font-size:10px;font-weight:700;">新人</span>' : ''}
        </div>
      </td>
      <td style="${TD}color:#6b7280;white-space:nowrap;">${e.division ? e.division+'課' : ''}${e.team ? ' '+e.team+'班' : ''}${!e.division&&!e.team?'—':''}</td>
      <td style="${TD}white-space:nowrap;text-align:center;">${e.work_schedule ?? '—'}</td>
      <td style="${TD}white-space:nowrap;text-align:center;">${e.start_time ?? '—'}</td>
      <td style="${TD}white-space:nowrap;text-align:center;">${e.work_hours_type ?? '—'}</td>
      <td style="${TD}white-space:nowrap;"><span style="background:${bg};color:${tc};padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;">${escHtml(enStatus)}</span></td>
      <td style="${TD}white-space:nowrap;color:#6b7280;">${e.hire_date ? escHtml(e.hire_date) : '—'}</td>
      <td style="${TD}text-align:center;white-space:nowrap;">${age !== null ? age+'歳' : '—'}</td>
      <td style="${TD}white-space:nowrap;text-align:center;">${e.car_no ? `<span style="font-family:monospace;">${escHtml(e.car_no)}</span>` : '—'}</td>
      <td style="${TD}text-align:center;">${e.is_caution ? '<span style="background:#fecaca;color:#991b1b;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;">注意</span>' : '—'}</td>
      <td style="${TD}text-align:center;">${e.is_sales_followup ? '<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;">要</span>' : '—'}</td>
    </tr>`;
  }).join('') : '';

  const activeCount = conditions.length;

  const content = `
<div style="font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <!-- ページヘッダー -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
    <div>
      <h2 style="font-size:16px;font-weight:700;color:#1a3a5c;margin:0 0 2px;">社員絞り込み検索</h2>
      <div style="font-size:12px;color:#9ca3af;">複数条件を組み合わせて社員を絞り込みます</div>
    </div>
    <a href="${ADMIN_PATH}/staff" style="font-size:12px;color:#2563eb;text-decoration:none;">← 社員名簿に戻る</a>
  </div>

  <div style="display:flex;gap:16px;align-items:flex-start;">

    <!-- 検索フォーム（左パネル） -->
    <div style="width:260px;flex-shrink:0;position:sticky;top:80px;max-height:calc(100vh - 100px);overflow-y:auto;">
      <form method="get" action="${ADMIN_PATH}/staff/search" id="search-form">
        <input type="hidden" name="s" value="1">

        <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:16px;">

          <!-- キーワード -->
          <div style="${SEC}">
            <label style="${SEC_LABEL}">キーワード</label>
            <input type="text" name="q" value="${escHtml(q)}" placeholder="氏名・フリガナ・社員番号"
              style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:12px;box-sizing:border-box;">
          </div>

          <!-- 在籍区分 -->
          <div style="${SEC}">
            <label style="${SEC_LABEL}">在籍区分</label>
            <div style="${CB_GROUP}">
              <label style="${LABEL}"><input type="radio" name="act" value="all" ${radio(act,'all')}> 全員</label>
              <label style="${LABEL}"><input type="radio" name="act" value="1" ${radio(act,'1')}> 在籍中</label>
              <label style="${LABEL}"><input type="radio" name="act" value="0" ${radio(act,'0')}> 退職済</label>
            </div>
          </div>

          <!-- 課 -->
          <div style="${SEC}">
            <label style="${SEC_LABEL}">課</label>
            <div style="${CB_GROUP}">
              ${[1,2,3,4].map(n => `<label style="${LABEL}"><input type="checkbox" name="div" value="${n}" ${chk(divArr,String(n))}> ${n}課</label>`).join('')}
            </div>
          </div>

          <!-- 班番号 -->
          <div style="${SEC}">
            <label style="${SEC_LABEL}">班番号</label>
            <div style="display:flex;align-items:center;gap:6px;">
              <input type="number" name="tmin" value="${escHtml(tmin)}" min="1" max="99" placeholder="最小"
                style="width:68px;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;">
              <span style="font-size:12px;color:#9ca3af;">〜</span>
              <input type="number" name="tmax" value="${escHtml(tmax)}" min="1" max="99" placeholder="最大"
                style="width:68px;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;">
            </div>
          </div>

          <!-- 勤務体系 -->
          <div style="${SEC}">
            <label style="${SEC_LABEL}">勤務体系</label>
            <div style="${CB_GROUP}">
              ${['a','b','B','D','H'].map(w => `<label style="${LABEL}"><input type="checkbox" name="ws" value="${w}" ${chk(wsArr,w)}> ${w}</label>`).join('')}
            </div>
            <div style="font-size:10px;color:#bbb;margin-top:4px;">a/B:早番 &nbsp;b:夜番 &nbsp;D:日勤 &nbsp;H:半夜</div>
          </div>

          <!-- 出勤時間 -->
          <div style="${SEC}">
            <label style="${SEC_LABEL}">出勤時間</label>
            <div style="${CB_GROUP}">
              ${ALL_TIMES.map(t => `<label style="${LABEL}"><input type="checkbox" name="st" value="${t}" ${chk(stArr,t)}> ${t}</label>`).join('')}
            </div>
          </div>

          <!-- 在籍状態 -->
          <div style="${SEC}">
            <label style="${SEC_LABEL}">在籍状態</label>
            <div style="${CB_GROUP}">
              ${['通常','育休','病欠','傷病','長欠'].map(e => `<label style="${LABEL}"><input type="checkbox" name="en" value="${e}" ${chk(enArr,e)}> ${e}</label>`).join('')}
            </div>
          </div>

          <!-- 労働時間区分 -->
          <div style="${SEC}">
            <label style="${SEC_LABEL}">労働時間区分</label>
            <div style="${CB_GROUP}">
              <label style="${LABEL}"><input type="checkbox" name="wht" value="労フル" ${chk(whtArr,'労フル')}> 労フル</label>
              <label style="${LABEL}"><input type="checkbox" name="wht" value="労短" ${chk(whtArr,'労短')}> 労短</label>
            </div>
          </div>

          <!-- 新人・班長 -->
          <div style="${SEC}">
            <label style="${SEC_LABEL}">社員属性</label>
            <div style="font-size:10px;color:#9ca3af;margin-bottom:4px;">新人</div>
            <div style="${CB_GROUP} margin-bottom:8px;">
              <label style="${LABEL}"><input type="radio" name="nw" value="all" ${radio(nw,'all')}> 問わない</label>
              <label style="${LABEL}"><input type="radio" name="nw" value="1" ${radio(nw,'1')}> 新人のみ</label>
              <label style="${LABEL}"><input type="radio" name="nw" value="0" ${radio(nw,'0')}> 一般社員</label>
            </div>
            <div style="font-size:10px;color:#9ca3af;margin-bottom:4px;">班長</div>
            <div style="${CB_GROUP}">
              <label style="${LABEL}"><input type="radio" name="hc" value="all" ${radio(hc,'all')}> 問わない</label>
              <label style="${LABEL}"><input type="radio" name="hc" value="1" ${radio(hc,'1')}> 班長のみ</label>
              <label style="${LABEL}"><input type="radio" name="hc" value="0" ${radio(hc,'0')}> 班長以外</label>
            </div>
          </div>

          <!-- フラグ -->
          <div style="${SEC}">
            <label style="${SEC_LABEL}">フラグ</label>
            <div style="display:flex;flex-direction:column;gap:6px;">
              <label style="${LABEL}"><input type="checkbox" name="ca" value="1" ${ca==='1'?'checked':''}> 要注意のみ表示</label>
              <label style="${LABEL}"><input type="checkbox" name="sfu" value="1" ${sfu==='1'?'checked':''}> 売上要後追いのみ</label>
            </div>
          </div>

          <!-- 担当車番 -->
          <div style="${SEC}">
            <label style="${SEC_LABEL}">担当車番</label>
            <div style="${CB_GROUP}">
              <label style="${LABEL}"><input type="radio" name="car" value="all" ${radio(car,'all')}> 問わない</label>
              <label style="${LABEL}"><input type="radio" name="car" value="1" ${radio(car,'1')}> あり</label>
              <label style="${LABEL}"><input type="radio" name="car" value="0" ${radio(car,'0')}> なし</label>
            </div>
          </div>

          <!-- 年齢 -->
          <div style="${SEC}">
            <label style="${SEC_LABEL}">年齢</label>
            <div style="display:flex;align-items:center;gap:6px;">
              <input type="number" name="ami" value="${escHtml(ami)}" min="18" max="99" placeholder="最小"
                style="width:68px;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;">
              <span style="font-size:12px;color:#9ca3af;">〜</span>
              <input type="number" name="ama" value="${escHtml(ama)}" min="18" max="99" placeholder="最大"
                style="width:68px;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;">
              <span style="font-size:12px;color:#9ca3af;">歳</span>
            </div>
          </div>

          <!-- 入社日 -->
          <div style="${SEC}">
            <label style="${SEC_LABEL}">入社日</label>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <input type="date" name="hf" value="${escHtml(hf)}"
                style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;box-sizing:border-box;">
              <div style="font-size:11px;color:#9ca3af;text-align:center;">〜</div>
              <input type="date" name="ht" value="${escHtml(ht)}"
                style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;box-sizing:border-box;">
            </div>
          </div>

          <!-- 退職日 -->
          <div style="${SEC}">
            <label style="${SEC_LABEL}">退職日</label>
            <div style="display:flex;flex-direction:column;gap:4px;">
              <input type="date" name="rf" value="${escHtml(rf)}"
                style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;box-sizing:border-box;">
              <div style="font-size:11px;color:#9ca3af;text-align:center;">〜</div>
              <input type="date" name="rt" value="${escHtml(rt)}"
                style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;box-sizing:border-box;">
            </div>
          </div>

        </div>

        <div style="display:flex;gap:8px;margin-top:10px;">
          <button type="submit"
            style="flex:1;padding:10px;background:#1a3a5c;color:white;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">
            検索${activeCount > 0 ? ` <span style="background:rgba(255,255,255,0.25);padding:1px 6px;border-radius:10px;font-size:11px;">${activeCount}</span>` : ''}
          </button>
          <a href="${ADMIN_PATH}/staff/search"
            style="padding:10px 14px;background:#f3f4f6;color:#374151;border-radius:7px;font-size:13px;text-decoration:none;display:flex;align-items:center;">
            リセット
          </a>
        </div>
      </form>
    </div>

    <!-- 検索結果（右パネル） -->
    <div style="flex:1;min-width:0;">
      ${!submitted ? `
      <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:60px;text-align:center;">
        <div style="font-size:40px;margin-bottom:16px;color:#d1d5db;">◎</div>
        <div style="font-size:14px;color:#374151;font-weight:600;margin-bottom:8px;">条件を設定して検索してください</div>
        <div style="font-size:12px;color:#9ca3af;">左パネルで絞り込み条件を選択し、「検索」ボタンを押してください</div>
      </div>
      ` : `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:13px;color:#6b7280;font-weight:600;">${staffRows.length}名 見つかりました</div>
        ${activeCount > 0 ? `<div style="font-size:11px;color:#9ca3af;">${activeCount}件の条件で絞り込み中</div>` : ''}
      </div>
      <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow-x:auto;margin-bottom:40px;">
        ${staffRows.length > 0 ? `
        <table style="width:100%;border-collapse:collapse;min-width:900px;">
          <thead style="background:#f9fafb;">
            <tr>
              <th style="${TH}">社員番号</th>
              <th style="${TH}">氏名</th>
              <th style="${TH}">課・班</th>
              <th style="${TH}text-align:center;">体系</th>
              <th style="${TH}text-align:center;">出勤時間</th>
              <th style="${TH}text-align:center;">労働区分</th>
              <th style="${TH}">在籍状態</th>
              <th style="${TH}">入社日</th>
              <th style="${TH}text-align:center;">年齢</th>
              <th style="${TH}text-align:center;">車番</th>
              <th style="${TH}text-align:center;">要注意</th>
              <th style="${TH}text-align:center;">後追い</th>
            </tr>
          </thead>
          <tbody>${resultRows}</tbody>
        </table>
        ` : `
        <div style="padding:50px;text-align:center;color:#9ca3af;font-size:13px;">条件に一致する社員が見つかりませんでした</div>
        `}
      </div>
      `}
    </div>
  </div>
</div>`;

  return c.html(layout('社員絞り込み検索', content, 'staff-search'));
});

// ===== 社員詳細・編集 =====
app.get('/staff/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.notFound();

  // フィルター引き継ぎ（一覧→詳細ナビ用）
  const q = (c.req.query('q') ?? '').trim();
  const filterDiv = c.req.query('div') ?? 'all';
  const filterStatus = c.req.query('enrollment') ?? 'all';
  const filterActive = c.req.query('active') ?? '1';
  const filterRetirement = c.req.query('retire') ?? '';

  const conditions: string[] = [];
  const navParams: (string | number)[] = [];
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayStr = nowJST.toISOString().split('T')[0];
  const in30Days = new Date(nowJST.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  if (filterRetirement === 'candidate') {
    conditions.push('is_active = 1');
    conditions.push('exclude_retirement_candidate = 0');
    conditions.push("(enrollment_status = '長欠' OR (retirement_date IS NOT NULL AND retirement_date != '' AND retirement_date < ?))");
    navParams.push(todayStr);
  } else {
    if (filterActive === '1') conditions.push('is_active = 1');
    if (filterRetirement === 'soon') {
      conditions.push("retirement_date IS NOT NULL AND retirement_date != '' AND retirement_date >= ? AND retirement_date <= ?");
      navParams.push(todayStr, in30Days);
    } else if (filterRetirement === 'has') {
      conditions.push("retirement_date IS NOT NULL AND retirement_date != ''");
    }
  }
  if (filterDiv !== 'all') { conditions.push('division = ?'); navParams.push(parseInt(filterDiv)); }
  const VALID_ENROLLMENT_FILTER = ['通常', '育休', '病欠', '傷病', '長欠'];
  if (filterStatus !== 'all' && VALID_ENROLLMENT_FILTER.includes(filterStatus)) {
    conditions.push('enrollment_status = ?'); navParams.push(filterStatus);
  }
  if (q) {
    const qk = toKatakana(q);
    const p = `%${q}%`, pk = `%${qk}%`;
    if (q !== qk) {
      conditions.push('(name LIKE ? OR name_kana LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)');
      navParams.push(p, p, pk, p);
    } else {
      conditions.push('(name LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)');
      navParams.push(p, p, p);
    }
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const idStmt = c.env.DB.prepare(`SELECT id, name FROM employees ${where} ORDER BY division, team, seq_no, id`);

  const [emp, idRows] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(id).first<StaffRow>(),
    (navParams.length ? idStmt.bind(...navParams) : idStmt).all<{ id: number; name: string }>(),
  ]);
  if (!emp) return c.text('社員が見つかりません', 404);

  const ids = idRows.results ?? [];
  const pos = ids.findIndex(r => r.id === id);
  const nav: StaffNav = {
    prevId: pos > 0 ? ids[pos - 1].id : null,
    prevName: pos > 0 ? ids[pos - 1].name : null,
    nextId: pos < ids.length - 1 ? ids[pos + 1].id : null,
    nextName: pos < ids.length - 1 ? ids[pos + 1].name : null,
  };

  const qsObj = new URLSearchParams();
  if (q) qsObj.set('q', q);
  if (filterDiv !== 'all') qsObj.set('div', filterDiv);
  if (filterStatus !== 'all') qsObj.set('enrollment', filterStatus);
  if (filterActive !== '1') qsObj.set('active', filterActive);
  if (filterRetirement) qsObj.set('retire', filterRetirement);
  const qsStr = qsObj.toString();

  return c.html(layout(`${emp.name} — 社員情報`, staffForm(emp, nav, qsStr), 'staff'));
});

// ===== フォームHTML生成 =====
function staffForm(emp: StaffRow | null, nav?: StaffNav, qsStr?: string): string {
  const isNew = !emp;
  const v = (key: keyof StaffRow) => (emp ? String(emp[key] ?? '') : '');
  const checked = (key: keyof StaffRow) => emp && emp[key] ? 'checked' : '';

  const scheduleOptions = ['', 'a', 'b', 'B', 'D', 'H'].map(s =>
    `<option value="${s}" ${v('work_schedule') === s ? 'selected' : ''}>${s === '' ? '— 未設定 —' : s}</option>`
  ).join('');

  const timeOptions = (selected: string) => ['', ...ALL_TIMES].map(t =>
    `<option value="${t}" ${selected === t ? 'selected' : ''}>${t === '' ? '— 未設定 —' : t}</option>`
  ).join('');

  const enrollOptions = ['通常', '育休', '病欠', '傷病', '長欠'].map(s =>
    `<option value="${s}" ${v('enrollment_status') === s ? 'selected' : ''}>${s}</option>`
  ).join('');

  const workHoursOptions = ['', '労フル', '労短'].map(s =>
    `<option value="${s}" ${v('work_hours_type') === s ? 'selected' : ''}>${s === '' ? '— 未設定 —' : s}</option>`
  ).join('');

  const age = emp ? calcAge(emp.birth_date) : null;
  const isNewcomer = emp ? (emp.status === 'training' || (emp.status !== 'completed' && !emp.status)) : false;

  const problemNotesHtml = emp?.problem_notes
    ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;font-size:12px;line-height:1.8;white-space:pre-wrap;margin-bottom:8px;">${escHtml(emp.problem_notes)}</div>`
    : `<div style="color:#9ca3af;font-size:12px;margin-bottom:8px;">記録なし</div>`;

  const START_TIMES_JSON = JSON.stringify(START_TIMES);

  const listHref = `${ADMIN_PATH}/staff${qsStr ? '?' + qsStr : ''}`;
  const navBar = nav && !isNew ? `
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;">
  ${nav.prevId
    ? `<a href="${ADMIN_PATH}/staff/${nav.prevId}${qsStr ? '?' + qsStr : ''}" style="display:flex;align-items:center;gap:5px;padding:7px 14px;background:#f1f5f9;color:#374151;border:1px solid #d1d5db;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;max-width:44%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">← ${escHtml(nav.prevName ?? '前の社員')}</a>`
    : `<span></span>`}
  ${nav.nextId
    ? `<a href="${ADMIN_PATH}/staff/${nav.nextId}${qsStr ? '?' + qsStr : ''}" style="display:flex;align-items:center;gap:5px;padding:7px 14px;background:#f1f5f9;color:#374151;border:1px solid #d1d5db;border-radius:8px;text-decoration:none;font-size:12px;font-weight:600;max-width:44%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${escHtml(nav.nextName ?? '次の社員')} →</a>`
    : `<span></span>`}
</div>` : '';

  return `
<div style="max-width:720px;font-family:'Hiragino Sans','Meiryo',sans-serif;">
  ${navBar}
  <!-- ヘッダー -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
    <a href="${listHref}" style="color:#2563eb;font-size:13px;text-decoration:none;">← 社員一覧に戻る</a>
    ${!isNew ? `
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
      ${emp!.is_active && isNewcomer
        ? `<button onclick="toggleNewcomer(${emp!.id},true,'${escHtml(emp!.name)}')" style="padding:5px 14px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:6px;font-size:12px;cursor:pointer;">新人解除（一般社員に変更）</button>`
        : emp!.is_active
        ? `<button onclick="toggleNewcomer(${emp!.id},false,'${escHtml(emp!.name)}')" style="padding:5px 14px;background:#dbeafe;color:#1d4ed8;border:1px solid #93c5fd;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">新人として登録</button>`
        : ''}
      <button onclick="toggleHanchyo(${emp!.id},${emp!.is_hanchyo ? 1 : 0},'${escHtml(emp!.name)}')"
        style="padding:5px 14px;background:${emp!.is_hanchyo ? '#fef3c7' : '#f9fafb'};color:${emp!.is_hanchyo ? '#92400e' : '#374151'};border:1px solid ${emp!.is_hanchyo ? '#fde68a' : '#d1d5db'};border-radius:6px;font-size:12px;cursor:pointer;">
        ${emp!.is_hanchyo ? '班長解除' : '班長として登録'}
      </button>
      ${emp!.is_active
        ? `<button onclick="retireStaff(${emp!.id},'${escHtml(emp!.name)}')" style="padding:5px 14px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;font-size:12px;cursor:pointer;">退職処理</button>`
        : `<button onclick="reinstateStaff(${emp!.id},'${escHtml(emp!.name)}')" style="padding:5px 14px;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;border-radius:6px;font-size:12px;cursor:pointer;">在籍に戻す</button>`}
      <button onclick="toggleExcludeRetirement(${emp!.id},${emp!.exclude_retirement_candidate ? 1 : 0},'${escHtml(emp!.name)}')"
        style="padding:5px 14px;background:${emp!.exclude_retirement_candidate ? '#fff7ed' : '#f3f4f6'};color:${emp!.exclude_retirement_candidate ? '#9a3412' : '#6b7280'};border:1px solid ${emp!.exclude_retirement_candidate ? '#fed7aa' : '#d1d5db'};border-radius:6px;font-size:12px;cursor:pointer;">
        ${emp!.exclude_retirement_candidate ? '退職候補に戻す' : '退職候補から除外'}
      </button>
      <button onclick="purgeStaff(${emp!.id},'${escHtml(emp!.name)}')" style="padding:5px 12px;background:#1f2937;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">完全削除</button>
    </div>` : ''}
  </div>

  ${isNewcomer && emp ? `<div style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;padding:10px 14px;border-radius:6px;font-size:13px;margin-bottom:16px;display:flex;align-items:center;gap:8px;"><span style="font-weight:700;">新人シフト管理対象</span><span style="font-size:12px;">— 新人シフト管理に表示されています</span></div>` : ''}
  ${!emp?.is_active && emp ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:10px 14px;border-radius:6px;font-size:13px;margin-bottom:16px;">この社員は退職済みです。退職日: ${escHtml(emp.retirement_date ?? '—')}</div>` : ''}

  <form id="staff-form">

    <!-- セクション: 基本情報 -->
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
      <h3 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0 0 16px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">基本情報</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">社員番号 <span style="color:#ef4444;">*</span> <span style="font-weight:400;font-size:10px;">（8桁）</span></label>
          <input type="text" id="f-emp_no" value="${escHtml(v('emp_no'))}" maxlength="8" pattern="\\d{8}"
            placeholder="12345678"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;font-family:monospace;">
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">氏名（漢字） <span style="color:#ef4444;">*</span></label>
          <input type="text" id="f-name" value="${escHtml(v('name'))}"
            placeholder="弁天 太郎"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">フリガナ</label>
          <input type="text" id="f-name_kana" value="${escHtml(v('name_kana'))}"
            placeholder="ベンテン タロウ"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">電話番号</label>
          <input type="tel" id="f-phone" value="${escHtml(v('phone'))}"
            placeholder="090-0000-0000"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">生年月日${age !== null ? `<span style="font-weight:400;margin-left:6px;">(${age}歳)</span>` : ''}</label>
          <input type="date" id="f-birth_date" value="${escHtml(v('birth_date'))}"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">課</label>
          <select id="f-division" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
            <option value="">— 未設定 —</option>
            ${[1,2,3,4].map(n => `<option value="${n}" ${v('division') === String(n) ? 'selected' : ''}>${n}課</option>`).join('')}
          </select>
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">班</label>
          <input type="number" id="f-team" value="${escHtml(v('team'))}" min="1" max="99"
            placeholder="班番号"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">入社日</label>
          <input type="date" id="f-hire_date" value="${escHtml(v('hire_date'))}"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">退職日</label>
          <input type="date" id="f-retirement_date" value="${escHtml(v('retirement_date'))}"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
        </div>

      </div>
    </div>

    <!-- セクション: 勤務情報 -->
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
      <h3 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0 0 16px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">勤務情報</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">勤務体系</label>
          <select id="f-work_schedule" onchange="updateStartTimes()" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
            ${scheduleOptions}
          </select>
          <div style="font-size:10px;color:#9ca3af;margin-top:3px;">a/B: 早番 &nbsp;b: 夜番 &nbsp;D: 日勤 &nbsp;H: 半夜</div>
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">出勤時間</label>
          <select id="f-start_time" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
            ${timeOptions(v('start_time'))}
          </select>
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">担当車番</label>
          <input type="text" id="f-car_no" value="${escHtml(v('car_no'))}" maxlength="4" pattern="\\d{1,4}"
            placeholder="例: 1234"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;font-family:monospace;">
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">在籍状態</label>
          <select id="f-enrollment_status" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
            ${enrollOptions}
          </select>
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">労フル / 労短</label>
          <select id="f-work_hours_type" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
            ${workHoursOptions}
          </select>
        </div>

        <div>
          <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:4px;">平均帰庫時間 <span style="font-weight:400;font-size:10px;">（CSVから集計）</span></label>
          <input type="text" id="f-avg_return_time" value="${escHtml(v('avg_return_time'))}" placeholder="例: 11:30"
            style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;font-family:monospace;">
        </div>

      </div>
    </div>

    <!-- セクション: フラグ -->
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
      <h3 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0 0 16px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">フラグ設定</h3>
      <div style="display:flex;gap:24px;flex-wrap:wrap;">

        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:12px 18px;border:1.5px solid #d1d5db;border-radius:8px;min-width:160px;">
          <input type="checkbox" id="f-is_caution" ${checked('is_caution')}
            style="width:17px;height:17px;accent-color:#dc2626;cursor:pointer;">
          <div>
            <div style="font-size:13px;font-weight:600;color:#1f2937;">要注意</div>
            <div style="font-size:11px;color:#9ca3af;">注意が必要な社員</div>
          </div>
        </label>

        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:12px 18px;border:1.5px solid #d1d5db;border-radius:8px;min-width:160px;">
          <input type="checkbox" id="f-is_sales_followup" ${checked('is_sales_followup')}
            style="width:17px;height:17px;accent-color:#d97706;cursor:pointer;">
          <div>
            <div style="font-size:13px;font-weight:600;color:#1f2937;">売上要後追い</div>
            <div style="font-size:11px;color:#9ca3af;">売上フォロー対象</div>
          </div>
        </label>

      </div>
    </div>

    <!-- セクション: 問題行動記録 -->
    <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
      <h3 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0 0 12px;padding-bottom:8px;border-bottom:1px solid #e5e7eb;">問題行動記録</h3>
      ${problemNotesHtml}
      <div style="display:flex;gap:8px;align-items:flex-start;">
        <textarea id="f-new-note" rows="3" placeholder="新しい記録を追記（追記ボタンで現在の記録に追加されます）"
          style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;resize:vertical;"></textarea>
        <button type="button" onclick="appendNote()" style="padding:8px 14px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;white-space:nowrap;flex-shrink:0;">追記</button>
      </div>
    </div>

    <!-- 保存ボタン -->
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-bottom:20px;">
      <a href="${ADMIN_PATH}/staff" style="padding:10px 20px;border:1px solid #d1d5db;border-radius:7px;font-size:13px;text-decoration:none;color:#374151;">キャンセル</a>
      <button type="button" onclick="saveStaff()" style="padding:10px 28px;background:#1a3a5c;color:white;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">
        ${isNew ? '登録する' : '変更を保存'}
      </button>
    </div>

  </form>
</div>

<script>
const IS_NEW = ${isNew};
const STAFF_ID = ${emp?.id ?? 'null'};
const ADMIN_PATH = '${ADMIN_PATH}';
const CURRENT_NOTES = ${emp?.problem_notes ? JSON.stringify(emp.problem_notes) : 'null'};
const START_TIMES_MAP = ${START_TIMES_JSON};

function updateStartTimes() {
  const sched = document.getElementById('f-work_schedule').value;
  const sel = document.getElementById('f-start_time');
  const current = sel.value;
  const allowed = sched ? START_TIMES_MAP[sched] : null;
  sel.innerHTML = '<option value="">— 未設定 —</option>';
  const opts = allowed || ${JSON.stringify(ALL_TIMES)};
  opts.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.textContent = t;
    if (t === current || (allowed && allowed.length === 1)) opt.selected = true;
    sel.appendChild(opt);
  });
  if (allowed && allowed.length === 1) sel.value = allowed[0];
}

function collectData() {
  const empNo = document.getElementById('f-emp_no').value.trim();
  const name = document.getElementById('f-name').value.trim();
  if (!empNo || !name) { alert('社員番号と氏名は必須です'); return null; }
  if (!/^\\d{8}$/.test(empNo)) { alert('社員番号は8桁の数字で入力してください'); return null; }
  const carNo = document.getElementById('f-car_no').value.trim();
  if (carNo && !/^\\d{1,4}$/.test(carNo)) { alert('担当車番は最大4桁の数字で入力してください'); return null; }
  return {
    emp_no: empNo,
    name: name,
    name_kana: document.getElementById('f-name_kana').value.trim() || null,
    division: parseInt(document.getElementById('f-division').value) || null,
    team: parseInt(document.getElementById('f-team').value) || null,
    phone: document.getElementById('f-phone').value.trim() || null,
    birth_date: document.getElementById('f-birth_date').value || null,
    hire_date: document.getElementById('f-hire_date').value || null,
    retirement_date: document.getElementById('f-retirement_date').value || null,
    work_schedule: document.getElementById('f-work_schedule').value || null,
    start_time: document.getElementById('f-start_time').value || null,
    car_no: carNo || null,
    enrollment_status: document.getElementById('f-enrollment_status').value || '通常',
    work_hours_type: document.getElementById('f-work_hours_type').value || null,
    is_caution: document.getElementById('f-is_caution').checked ? 1 : 0,
    is_sales_followup: document.getElementById('f-is_sales_followup').checked ? 1 : 0,
    avg_return_time: document.getElementById('f-avg_return_time').value.trim() || null,
  };
}

async function saveStaff() {
  const data = collectData();
  if (!data) return;
  const url = IS_NEW ? '/api/employees' : '/api/employees/' + STAFF_ID;
  const method = IS_NEW ? 'POST' : 'PUT';
  try {
    const res = await fetch(url, {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
    });
    const ct = res.headers.get('Content-Type') || '';
    if (!ct.includes('application/json')) {
      alert('セッションが切れています。ページを再読み込みしてください。');
      location.reload();
      return;
    }
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      if (IS_NEW) {
        window.location.href = ADMIN_PATH + '/staff/' + json.id;
      } else {
        showToast('✓ 保存しました', '#166534');
        setTimeout(() => location.reload(), 800);
      }
    } else {
      alert('保存に失敗しました: ' + (json.error ?? '不明なエラー'));
    }
  } catch(e) {
    alert('通信エラー: ' + (e instanceof Error ? e.message : String(e)));
  }
}

function showToast(msg, color) {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = 'position:fixed;top:24px;left:50%;transform:translateX(-50%) translateY(-10px);background:' + (color || '#166534') + ';color:white;padding:13px 28px;border-radius:10px;font-size:14px;font-weight:700;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.25);opacity:0;transition:opacity 0.2s,transform 0.2s;pointer-events:none;white-space:nowrap;';
  document.body.appendChild(t);
  requestAnimationFrame(() => {
    t.style.opacity = '1';
    t.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2000);
}

async function appendNote() {
  const note = document.getElementById('f-new-note').value.trim();
  if (!note) { alert('追記内容を入力してください'); return; }
  if (!STAFF_ID) { alert('先に社員を登録してください'); return; }
  const now = new Date().toLocaleString('ja-JP', {year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const newEntry = '・' + now + '\\n' + note;
  const merged = CURRENT_NOTES ? CURRENT_NOTES + '\\n' + newEntry : newEntry;
  const res = await fetch('/api/employees/' + STAFF_ID, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problem_notes: merged })
  });
  if (res.ok) { location.reload(); }
  else { alert('追記に失敗しました'); }
}

async function retireStaff(id, name) {
  const retireDate = document.getElementById('f-retirement_date').value;
  if (!confirm(name + ' を退職処理しますか？')) return;
  const res = await fetch('/api/employees/' + id, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ retirement_date: retireDate || new Date().toISOString().slice(0,10) })
  });
  if (!res.ok) { alert('退職日の保存に失敗しました'); return; }
  const res2 = await fetch('/api/employees/' + id, { method: 'DELETE' });
  if (res2.ok) { window.location.href = ADMIN_PATH + '/staff'; }
  else { alert('退職処理に失敗しました'); }
}

async function reinstateStaff(id, name) {
  if (!confirm(name + ' を在籍に戻しますか？')) return;
  const res = await fetch('/api/employees/' + id + '/reinstate', { method: 'POST' });
  if (res.ok) { location.reload(); }
  else { alert('復帰処理に失敗しました'); }
}

async function purgeStaff(id, name) {
  if (!confirm('「' + name + '」を完全削除しますか？\\nシフト・売上・面談記録などすべて削除されます。\\nこの操作は取り消せません。')) return;
  const res = await fetch('/api/employees/' + id + '/purge', { method: 'DELETE' });
  if (res.ok) { window.location.href = ADMIN_PATH + '/staff'; }
  else { alert('削除に失敗しました'); }
}

async function toggleNewcomer(id, currentlyNewcomer, name) {
  if (currentlyNewcomer) {
    if (!confirm(name + ' を新人シフト管理から外しますか？（一般社員扱いになります）')) return;
    const res = await fetch('/api/employees/' + id, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ status: 'completed' })
    });
    if (res.ok) location.reload(); else alert('更新に失敗しました');
  } else {
    if (!confirm(name + ' を新人として登録しますか？\\n新人シフト管理に表示されるようになります。')) return;
    const res = await fetch('/api/employees/' + id, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ status: 'training' })
    });
    if (res.ok) location.reload(); else alert('更新に失敗しました');
  }
}

async function toggleHanchyo(id, currentVal, name) {
  const toSet = currentVal ? 0 : 1;
  const msg = toSet ? name + ' を班長として登録しますか？' : name + ' の班長登録を解除しますか？';
  if (!confirm(msg)) return;
  const res = await fetch('/api/employees/' + id, {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ is_hanchyo: toSet })
  });
  if (res.ok) location.reload(); else alert('更新に失敗しました');
}

async function toggleExcludeRetirement(id, currentVal, name) {
  const toSet = currentVal ? 0 : 1;
  const msg = toSet
    ? name + ' を退職候補リストから除外しますか？\\n（除外後も長欠・退職日は変わりません）'
    : name + ' を退職候補リストに戻しますか？';
  if (!confirm(msg)) return;
  const res = await fetch('/api/employees/' + id, {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ exclude_retirement_candidate: toSet })
  });
  if (res.ok) location.reload(); else alert('更新に失敗しました');
}

// 初期化時に時間選択肢を更新
updateStartTimes();
</script>`;
}

export default app;
