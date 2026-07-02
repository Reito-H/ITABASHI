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
};

// 勤務体系ごとの出勤時間選択肢
const START_TIMES: Record<string, string[]> = {
  a: ['6:00', '6:50', '8:00'],
  b: ['18:00', '19:00'],
  B: ['6:00', '6:50', '8:00'],
  D: ['9:30'],
  H: ['15:00', '16:00'],
};
const ALL_TIMES = ['6:00', '6:50', '8:00', '9:30', '15:00', '16:00', '18:00', '19:00'];

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const today = new Date();
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
};
const ENROLLMENT_TEXT_COLORS: Record<string, string> = {
  '通常': '#166534',
  '育休': '#1e40af',
  '病欠': '#92400e',
  '傷病': '#991b1b',
};

// ===== 社員一覧 =====
app.get('/staff', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const filterDiv = c.req.query('div') ?? 'all';
  const filterStatus = c.req.query('enrollment') ?? 'all';
  const filterActive = c.req.query('active') ?? '1';

  const conditions: string[] = [];
  if (filterActive === '1') conditions.push('is_active = 1');
  if (filterDiv !== 'all') conditions.push(`division = ${parseInt(filterDiv)}`);
  const VALID_ENROLLMENT_FILTER = ['通常', '育休', '病欠', '傷病'];
  if (filterStatus !== 'all' && VALID_ENROLLMENT_FILTER.includes(filterStatus)) {
    conditions.push(`enrollment_status = '${filterStatus}'`);
  }
  if (q) {
    const safe = q.replace(/'/g, "''");
    conditions.push(`(name LIKE '%${safe}%' OR name_kana LIKE '%${safe}%' OR emp_no LIKE '%${safe}%')`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const staffRows = await c.env.DB.prepare(
    `SELECT * FROM employees ${where} ORDER BY division, team, seq_no, id`
  ).all<StaffRow>();

  // 退職リマインド: 30日以内に退職日を迎える在籍社員を取得
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayStr = nowJST.toISOString().split('T')[0];
  const in30Days = new Date(nowJST.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const upcomingRetirements = await c.env.DB.prepare(`
    SELECT id, name, retirement_date
    FROM employees
    WHERE is_active = 1
      AND retirement_date IS NOT NULL
      AND retirement_date != ''
      AND retirement_date >= ?
      AND retirement_date <= ?
    ORDER BY retirement_date ASC
  `).bind(todayStr, in30Days).all<{ id: number; name: string; retirement_date: string }>();

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
  const base = { div: filterDiv, enrollment: filterStatus, active: filterActive };

  const divBtns = [['all', '全課'], ['1', '1課'], ['2', '2課'], ['3', '3課'], ['4', '4課']].map(([v, l]) =>
    `<a href="${ADMIN_PATH}/staff?${makeFilter('div', v, base)}" style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;${filterDiv === v ? 'background:#1a3a5c;color:white;' : 'background:#f3f4f6;color:#374151;'}">${l}</a>`
  ).join('');

  const enrollBtns = [['all', '全員'], ['通常', '通常'], ['育休', '育休'], ['病欠', '病欠'], ['傷病', '傷病']].map(([v, l]) =>
    `<a href="${ADMIN_PATH}/staff?${makeFilter('enrollment', v, base)}" style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;${filterStatus === v ? 'background:#1a3a5c;color:white;' : 'background:#f3f4f6;color:#374151;'}">${l}</a>`
  ).join('');

  const activeBtns = [['1', '在籍'], ['0', '退職'], ['', '全て']].map(([v, l]) =>
    `<a href="${ADMIN_PATH}/staff?${makeFilter('active', v, base)}" style="padding:4px 10px;border-radius:4px;font-size:12px;text-decoration:none;${filterActive === v ? 'background:#1a3a5c;color:white;' : 'background:#f3f4f6;color:#374151;'}">${l}</a>`
  ).join('');

  const C = 'padding:8px 10px;border-bottom:1px solid #f3f4f6;vertical-align:middle;';
  const rows = (staffRows.results ?? []).map(e => {
    const age = calcAge(e.birth_date);
    const enStatus = e.enrollment_status ?? '通常';
    const bg = ENROLLMENT_COLORS[enStatus] ?? '#f3f4f6';
    const tc = ENROLLMENT_TEXT_COLORS[enStatus] ?? '#374151';
    const isRetiringSoon = e.retirement_date && e.retirement_date >= todayStr && e.retirement_date <= in30Days;
    const rowBg = isRetiringSoon ? '#fffbeb' : 'white';
    const rowHover = isRetiringSoon ? '#fef9c3' : '#f8fafc';
    return `
    <tr style="cursor:pointer;background:${rowBg};"
      onmouseover="this.style.background='${rowHover}'" onmouseout="this.style.background='${rowBg}'"
      onclick="location.href='${ADMIN_PATH}/staff/${e.id}'">
      <td style="${C}font-size:12px;font-family:monospace;color:#6b7280;white-space:nowrap;">${escHtml(e.emp_no)}</td>
      <td style="${C}">
        <div style="font-size:13px;font-weight:600;color:#1f2937;">${escHtml(e.name)}</div>
        ${e.name_kana ? `<div style="font-size:11px;color:#9ca3af;">${escHtml(e.name_kana)}</div>` : ''}
      </td>
      <td style="${C}font-size:12px;color:#6b7280;white-space:nowrap;">${e.division ? e.division + '課' : ''}${e.team ? ' ' + e.team + '班' : ''}${!e.division && !e.team ? '—' : ''}</td>
      <td style="${C}font-size:12px;color:#374151;white-space:nowrap;">${e.work_schedule ?? '—'}</td>
      <td style="${C}font-size:12px;color:#374151;white-space:nowrap;">${e.start_time ?? '—'}</td>
      <td style="${C}font-size:12px;white-space:nowrap;">
        ${e.car_no ? `<span style="font-family:monospace;">${escHtml(e.car_no)}</span>` : '—'}
      </td>
      <td style="${C}white-space:nowrap;">
        <span style="background:${bg};color:${tc};padding:2px 7px;border-radius:4px;font-size:11px;font-weight:600;">${escHtml(enStatus)}</span>
        ${isRetiringSoon ? `<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;margin-left:4px;">退職予定</span>` : ''}
      </td>
      <td style="${C}white-space:nowrap;text-align:center;">
        ${e.is_caution ? '<span style="background:#fecaca;color:#991b1b;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;">注意</span>' : '—'}
      </td>
      <td style="${C}font-size:12px;color:#6b7280;white-space:nowrap;">
        ${e.birth_date ? `${e.birth_date.slice(0, 10)} (${age}歳)` : '—'}
        ${isRetiringSoon ? `<div style="font-size:10px;color:#d97706;font-weight:600;">${escHtml(e.retirement_date!)} 退職</div>` : ''}
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
    </div>
  </div>

  <!-- ヘッダー -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
    <span style="font-size:13px;color:#6b7280;">${(staffRows.results ?? []).length}名</span>
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
      CSV インポート（星乗務員名簿形式）
    </h3>
    <p style="font-size:12px;color:#6b7280;margin:0 0 14px;">
      出庫データCSV（Shift-JIS）を選択してください。社員番号をキーに既存社員は更新、未登録社員は新規追加します。
    </p>

    <!-- ファイル選択エリア -->
    <div id="csv-drop-zone"
      style="border:2px dashed #d1d5db;border-radius:8px;padding:28px;text-align:center;cursor:pointer;margin-bottom:14px;transition:border-color 0.2s;"
      onclick="document.getElementById('csv-file-input').click()"
      ondragover="event.preventDefault();this.style.borderColor='#1a3a5c'"
      ondragleave="this.style.borderColor='#d1d5db'"
      ondrop="handleCsvDrop(event)">
      <div style="font-size:13px;color:#6b7280;">クリックまたはドラッグでCSVファイルを選択</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:4px;">Shift-JIS / UTF-8 両対応</div>
    </div>
    <input type="file" id="csv-file-input" accept=".csv,.CSV" style="display:none" onchange="handleCsvFile(this.files[0])">

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
  <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;min-width:760px;">
      <thead style="background:#f9fafb;">
        <tr>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">社員番号</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;">氏名</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">課・班</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">勤務体系</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">出勤時間</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">車番</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">在籍状態</th>
          <th style="padding:8px 10px;text-align:center;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">要注意</th>
          <th style="padding:8px 10px;text-align:left;font-size:11px;color:#6b7280;border-bottom:1px solid #e5e7eb;white-space:nowrap;">生年月日</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="9" style="padding:24px;text-align:center;color:#9ca3af;">該当する社員がいません</td></tr>'}
      </tbody>
    </table>
  </div>
</div>

<script>
// ===== CSV インポート =====

const ADMIN_PATH = '${ADMIN_PATH}';
let csvParsedData = [];
const EXISTING_EMP_NOS = new Set(${JSON.stringify((staffRows.results ?? []).map(e => e.emp_no))});

// ===== kuromoji 読み仮名エンジン =====
let _tokenizer = null, _tokenizerLoading = false;

function setKuroStatus(msg, color) {
  const el = document.getElementById('kuromoji-status');
  if (el) { el.textContent = msg; el.style.color = color || '#9ca3af'; }
}

function setImportBtnReady(ready) {
  const btn = document.getElementById('csv-import-btn');
  if (!btn) return;
  btn.disabled = !ready;
  btn.style.opacity = ready ? '1' : '0.5';
  btn.style.cursor  = ready ? 'pointer' : 'not-allowed';
  if (!ready) btn.textContent = '読み仮名生成中…';
  else btn.textContent = 'インポート実行';
}

function loadKuromoji() {
  if (_tokenizer || _tokenizerLoading) return;
  _tokenizerLoading = true;
  setKuroStatus('読み仮名エンジン読込中…', '#d97706');
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js';
  s.onload = () => {
    kuromoji.builder({ dicPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/' })
      .build((err, tok) => {
        _tokenizerLoading = false;
        if (err) {
          setKuroStatus('読み仮名エンジン失敗（手動入力してください）', '#dc2626');
          setImportBtnReady(true); // 失敗でもインポートは許可
          return;
        }
        _tokenizer = tok;
        setKuroStatus('読み仮名生成OK ✓', '#166534');
        if (csvParsedData.length) { generateAllFurigana(); renderCsvPreview(); }
        setImportBtnReady(true);
      });
  };
  s.onerror = () => {
    _tokenizerLoading = false;
    setKuroStatus('読み仮名エンジン失敗（手動入力してください）', '#dc2626');
    setImportBtnReady(true);
  };
  document.head.appendChild(s);
}

function toKatakana(str) {
  return str.replace(/[\\u3041-\\u3096]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
}

function getFurigana(name) {
  if (!_tokenizer || !name) return null;
  const tokens = _tokenizer.tokenize(name.replace(/[\\s\\u3000]/g, ''));
  return toKatakana(tokens.map(t => t.reading || t.surface_form).join(''));
}

function generateAllFurigana() {
  for (const emp of csvParsedData) {
    if (!emp.name_kana) emp.name_kana = getFurigana(emp.name) || null;
  }
}

// ===== UI 操作 =====
function toggleCsvImport() {
  const panel = document.getElementById('csv-import-panel');
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) loadKuromoji();
}

function handleCsvDrop(event) {
  event.preventDefault();
  document.getElementById('csv-drop-zone').style.borderColor = '#d1d5db';
  const file = event.dataTransfer.files[0];
  if (file) handleCsvFile(file);
}

function handleCsvFile(file) {
  if (!file) return;
  document.getElementById('csv-drop-zone').style.borderColor = '#1a3a5c';
  const reader = new FileReader();
  reader.onload = e => {
    const buf = e.target.result;
    let text;
    try { text = new TextDecoder('shift-jis').decode(buf); }
    catch { text = new TextDecoder('utf-8').decode(buf); }
    parseCsvText(text);
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

// ===== CSV 解析（日付追跡・車番頻度・退職候補） =====
function parseCsvText(text) {
  const lines = text.split(/\\r?\\n/);
  const empMap = {};
  let csvMaxDate = '';

  for (const line of lines) {
    if (!line.trim()) continue;
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

  generateAllFurigana();
  renderCsvPreview();
}

// ===== プレビュー描画 =====
function renderCsvPreview() {
  const newCnt    = csvParsedData.filter(e=>!EXISTING_EMP_NOS.has(e.emp_no)).length;
  const updCnt    = csvParsedData.filter(e=> EXISTING_EMP_NOS.has(e.emp_no)).length;
  const absCnt    = csvParsedData.filter(e=>e.isLongAbsent).length;
  const chgCnt    = csvParsedData.filter(e=>e.hasTimeChange).length;

  document.getElementById('csv-summary').innerHTML =
    '解析: <strong>'+csvParsedData.length+'名</strong> — '+
    '<span style="color:#166534;">新規 '+newCnt+'名</span> / '+
    '<span style="color:#1d4ed8;">更新 '+updCnt+'名</span>'+
    (absCnt ? ' / <span style="color:#dc2626;">長期不在 '+absCnt+'名</span>' : '')+
    (chgCnt ? ' / <span style="color:#d97706;">シフト変化 '+chgCnt+'名</span>' : '')+
    ' &nbsp;<span id="kuromoji-status" style="font-size:11px;"></span>';

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
        '<div style="font-size:11px;color:#9ca3af;">'+(e.name_kana||'<i style=color:#d1d5db>生成中…</i>')+'</div></td>' +
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
      let h = '<div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:10px;">退職候補リスト（要確認）</div>';
      if (absent.length) {
        h += '<div style="font-size:11px;font-weight:700;color:#b45309;margin-bottom:6px;">長期不在（3ヶ月以上出勤なし）</div><div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;">';
        for (const e of absent) {
          h += '<span style="background:white;border:1px solid #fecaca;border-radius:5px;padding:3px 8px;font-size:11px;">'+
            '<b>'+e.name+'</b> <span style="font-family:monospace;color:#9ca3af;font-size:10px;">'+e.emp_no+'</span>'+
            '<span style="color:#dc2626;"> 最終:'+e.lastDate+'（'+e.daysSinceLast+'日前）</span></span>';
        }
        h += '</div>';
      }
      if (changed.length) {
        h += '<div style="font-size:11px;font-weight:700;color:#b45309;margin-bottom:6px;">出勤シフト変化（直近30日）</div><div style="display:flex;flex-wrap:wrap;gap:5px;">';
        for (const e of changed) {
          const from=e.earlyAvg!==null?snapStartTime(e.earlyAvg):'?';
          const to  =e.recentAvg!==null?snapStartTime(e.recentAvg):'?';
          h += '<span style="background:white;border:1px solid #fde68a;border-radius:5px;padding:3px 8px;font-size:11px;">'+
            '<b>'+e.name+'</b> <span style="font-family:monospace;color:#9ca3af;font-size:10px;">'+e.emp_no+'</span>'+
            '<span style="color:#d97706;"> '+from+'→'+to+'</span></span>';
        }
        h += '</div>';
      }
      retDiv.innerHTML = h;
      retDiv.style.display = 'block';
    }
  }

  document.getElementById('csv-preview').style.display = 'block';
  document.getElementById('csv-result').style.display = 'none';

  // kuromoji がまだ読込中ならインポートボタンを無効化
  const kuroReady = !!_tokenizer || (!_tokenizerLoading);
  setImportBtnReady(kuroReady);
}

// ===== インポート実行 =====
async function executeCsvImport() {
  if (!csvParsedData.length) return;
  // kuromoji が間に合っていれば最終確認で再生成
  generateAllFurigana();
  const btn = document.getElementById('csv-import-btn');
  btn.disabled = true; btn.textContent = 'インポート中...';

  // 担当車番 (car_no) は送らない — 手動入力に委ねる
  const payload = csvParsedData.map(e => ({
    emp_no: e.emp_no, name: e.name,
    name_kana: e.name_kana || null,
    division: e.division, team: e.team,
    work_schedule: e.work_schedule, start_time: e.start_time,
    avg_return_time: e.avg_return_time,
    used_cars: e.used_cars,
  }));

  try {
    const res = await fetch('/api/employees/csv-import', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ employees: payload })
    });
    const json = await res.json();
    const resultDiv = document.getElementById('csv-result');
    if (res.ok) {
      resultDiv.innerHTML = '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px 16px;font-size:13px;color:#166534;">'+
        'インポート完了: <strong>新規 '+json.inserted+'名</strong> / <strong>更新 '+json.updated+'名</strong>'+
        (json.errors?.length?'<div style="margin-top:8px;color:#dc2626;font-size:12px;">エラー: '+json.errors.join('、')+'</div>':'')+
        '<div style="margin-top:10px;"><a href="'+ADMIN_PATH+'/staff" style="color:#1d4ed8;font-size:13px;">→ 社員一覧を更新</a></div></div>';
      resultDiv.style.display='block';
      document.getElementById('csv-preview').style.display='none';
      document.getElementById('csv-retirement-candidates').style.display='none';
    } else {
      resultDiv.innerHTML = '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px 16px;color:#dc2626;font-size:13px;">エラー: '+(json.error||'不明なエラー')+'</div>';
      resultDiv.style.display='block';
    }
  } catch { alert('通信エラーが発生しました'); }
  finally { btn.disabled=false; btn.textContent='インポート実行'; }
}

function clearCsvImport() {
  csvParsedData = [];
  ['csv-preview','csv-result','csv-retirement-candidates'].forEach(id=>{
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

// ===== 社員詳細・編集 =====
app.get('/staff/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const emp = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(id).first<StaffRow>();
  if (!emp) return c.text('社員が見つかりません', 404);
  return c.html(layout(`${emp.name} — 社員情報`, staffForm(emp), 'staff'));
});

// ===== フォームHTML生成 =====
function staffForm(emp: StaffRow | null): string {
  const isNew = !emp;
  const v = (key: keyof StaffRow) => (emp ? String(emp[key] ?? '') : '');
  const checked = (key: keyof StaffRow) => emp && emp[key] ? 'checked' : '';

  const scheduleOptions = ['', 'a', 'b', 'B', 'D', 'H'].map(s =>
    `<option value="${s}" ${v('work_schedule') === s ? 'selected' : ''}>${s === '' ? '— 未設定 —' : s}</option>`
  ).join('');

  const timeOptions = (selected: string) => ['', ...ALL_TIMES].map(t =>
    `<option value="${t}" ${selected === t ? 'selected' : ''}>${t === '' ? '— 未設定 —' : t}</option>`
  ).join('');

  const enrollOptions = ['通常', '育休', '病欠', '傷病'].map(s =>
    `<option value="${s}" ${v('enrollment_status') === s ? 'selected' : ''}>${s}</option>`
  ).join('');

  const workHoursOptions = ['', '労フル', '労短'].map(s =>
    `<option value="${s}" ${v('work_hours_type') === s ? 'selected' : ''}>${s === '' ? '— 未設定 —' : s}</option>`
  ).join('');

  const age = emp ? calcAge(emp.birth_date) : null;

  const problemNotesHtml = emp?.problem_notes
    ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 12px;font-size:12px;line-height:1.8;white-space:pre-wrap;margin-bottom:8px;">${escHtml(emp.problem_notes)}</div>`
    : `<div style="color:#9ca3af;font-size:12px;margin-bottom:8px;">記録なし</div>`;

  const START_TIMES_JSON = JSON.stringify(START_TIMES);

  return `
<div style="max-width:720px;font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <!-- ヘッダー -->
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
    <a href="${ADMIN_PATH}/staff" style="color:#2563eb;font-size:13px;text-decoration:none;">← 社員一覧に戻る</a>
    ${!isNew ? `
    <div style="display:flex;gap:8px;">
      ${emp!.is_active
        ? `<button onclick="retireStaff(${emp!.id},'${escHtml(emp!.name)}')" style="padding:5px 14px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;font-size:12px;cursor:pointer;">退職処理</button>`
        : `<button onclick="reinstateStaff(${emp!.id},'${escHtml(emp!.name)}')" style="padding:5px 14px;background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;border-radius:6px;font-size:12px;cursor:pointer;">在籍に戻す</button>`}
      <button onclick="purgeStaff(${emp!.id},'${escHtml(emp!.name)}')" style="padding:5px 12px;background:#1f2937;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">完全削除</button>
    </div>` : ''}
  </div>

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
  const res = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  const json = await res.json().catch(() => ({}));
  if (res.ok) {
    const id = IS_NEW ? json.id : STAFF_ID;
    window.location.href = ADMIN_PATH + '/staff/' + id;
  } else {
    alert('保存に失敗しました: ' + (json.error ?? '不明なエラー'));
  }
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

// 初期化時に時間選択肢を更新
updateStartTimes();
</script>`;
}

export default app;
