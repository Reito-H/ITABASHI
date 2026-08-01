// ⭐カレ: 班長個人の縦型カレンダー
//   対象: 運行管理者・統括管理者（LINE連携）。
//   LINE連携かつ社員番号紐付け済みの班長は、自身の分がデフォルトで開く。
//   運行管理者以上は他の班長の分も閲覧・編集できる。
//   内勤班長(is_indoor=1)は既存の班長シフト(kancho_shifts)をそのまま編集し、
//   乗務班長(is_indoor=0)は専用の kancho_crew_schedules を編集する。
// ページ: /liff/kancho-calendar
// API  : /api/liff/kancho-calendar/*
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../auth';
import { getPeriodSettings, getPeriodRange, getShiftDisplayRange, getPeriod } from '../auth';
import { logLineActivity } from '../utils/activity_log';

const app = new Hono<{ Bindings: Env }>();

const ALLOWED_ROLES = ['general_manager', 'operations_manager'];

async function verifyLiffToken(accessToken: string): Promise<string | null> {
  if (!accessToken) return null;
  const res = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json<{ userId?: string }>();
  return data.userId ?? null;
}

async function authorize(c: Context<{ Bindings: Env }>): Promise<{ uid: string; name: string } | null> {
  const auth = c.req.header('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const uid = await verifyLiffToken(token);
  if (!uid) return null;
  const liffUser = await c.env.DB.prepare(
    'SELECT role, name FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string; name: string }>();
  if (!liffUser || !ALLOWED_ROLES.includes(liffUser.role)) return null;
  return { uid, name: liffUser.name ?? '' };
}

type Member = {
  id: number; name: string; role: string | null; is_indoor: number; sort_order: number;
};

// ===== API: メンバー一覧 + 自分の枠 =====
app.get('/api/liff/kancho-calendar/members', async (c) => {
  const auth = await authorize(c);
  if (!auth) return c.json({ error: 'forbidden' }, 403);

  const now = getPeriod(new Date().toISOString().split('T')[0]);
  const year = parseInt(c.req.query('year') ?? '') || now.year;
  const month = parseInt(c.req.query('month') ?? '') || now.month;

  const [members, myEmp] = await Promise.all([
    c.env.DB.prepare(
      `SELECT id, name, role, is_indoor, sort_order FROM kancho_members
       WHERE section = 'main' AND is_active = 1 AND year = ? AND month = ? ORDER BY sort_order, id`
    ).bind(year, month).all<Member>(),
    c.env.DB.prepare(
      `SELECT e.emp_no FROM line_liff_users u JOIN employees e ON e.id = u.emp_id WHERE u.line_uid = ?`
    ).bind(auth.uid).first<{ emp_no: string }>(),
  ]);

  let myMemberId: number | null = null;
  if (myEmp?.emp_no) {
    const mine = await c.env.DB.prepare(
      `SELECT id FROM kancho_members WHERE section = 'main' AND is_active = 1 AND year = ? AND month = ? AND emp_no = ?`
    ).bind(year, month, myEmp.emp_no).first<{ id: number }>();
    myMemberId = mine?.id ?? null;
  }

  return c.json({ year, month, members: members.results ?? [], my_member_id: myMemberId });
});

// ===== API: 1名分のカレンダー取得 =====
app.get('/api/liff/kancho-calendar', async (c) => {
  const auth = await authorize(c);
  if (!auth) return c.json({ error: 'forbidden' }, 403);

  const memberId = parseInt(c.req.query('member_id') ?? '');
  if (!memberId) return c.json({ error: 'member_id is required' }, 400);

  const now = getPeriod(new Date().toISOString().split('T')[0]);
  const year = parseInt(c.req.query('year') ?? '') || now.year;
  const month = parseInt(c.req.query('month') ?? '') || now.month;

  const member = await c.env.DB.prepare(
    `SELECT id, name, role, is_indoor FROM kancho_members WHERE id = ? AND section = 'main' AND year = ? AND month = ?`
  ).bind(memberId, year, month).first<Member & { id: number }>();
  if (!member) return c.json({ error: 'member not found' }, 404);

  const periodCfg = await getPeriodSettings(c.env.DB);
  const { start: periodStart, end: periodEnd } = getPeriodRange(year, month, periodCfg);
  const { dates } = getShiftDisplayRange(year, month, periodCfg);
  const dispStart = dates[0];
  const dispEnd = dates[dates.length - 1];

  const entryTable = member.is_indoor ? 'kancho_shifts' : 'kancho_crew_schedules';
  const [types, entries, notes] = await Promise.all([
    c.env.DB.prepare(
      `SELECT code, label, color FROM kancho_shift_types
       WHERE is_active = 1 AND show_in_input = 1 AND year = ? AND month = ? AND section IN ('main','all')
       ORDER BY sort_order, id`
    ).bind(year, month).all<{ code: string; label: string; color: string }>(),
    c.env.DB.prepare(
      `SELECT date, code FROM ${entryTable} WHERE member_id = ? AND date BETWEEN ? AND ?`
    ).bind(memberId, dispStart, dispEnd).all<{ date: string; code: string }>(),
    c.env.DB.prepare(
      `SELECT date, note FROM kancho_calendar_notes WHERE member_id = ? AND date BETWEEN ? AND ?`
    ).bind(memberId, dispStart, dispEnd).all<{ date: string; note: string }>(),
  ]);

  await logLineActivity(c.env.DB, auth.uid, 'liff', 'view', 'kancho_calendar', `${year}-${month}:${memberId}`);

  return c.json({
    year, month, periodStart, periodEnd, dates,
    member: { id: member.id, name: member.name, role: member.role, is_indoor: member.is_indoor },
    types: types.results ?? [],
    entries: entries.results ?? [],
    notes: notes.results ?? [],
  });
});

// ===== API: 1日分の保存（スタンプ・その他メモ） =====
app.post('/api/liff/kancho-calendar/entry', async (c) => {
  const auth = await authorize(c);
  if (!auth) return c.json({ error: 'forbidden' }, 403);

  const body = await c.req.json<{ member_id?: number; date?: string; code?: string | null; note?: string | null }>();
  const memberId = body.member_id;
  const date = (body.date ?? '').trim();
  if (!memberId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'member_id, date が不正です' }, 400);

  const member = await c.env.DB.prepare(
    `SELECT id, name, is_indoor FROM kancho_members WHERE id = ? AND section = 'main'`
  ).bind(memberId).first<{ id: number; name: string; is_indoor: number }>();
  if (!member) return c.json({ error: 'member not found' }, 404);

  const updatedBy = `LIFF:${auth.name || auth.uid.slice(0, 8)}`;
  const entryTable = member.is_indoor ? 'kancho_shifts' : 'kancho_crew_schedules';

  if (body.code !== undefined) {
    const code = (body.code ?? '').trim();
    if (code) {
      await c.env.DB.prepare(
        `INSERT INTO ${entryTable} (member_id, date, code, updated_at, updated_by) VALUES (?, ?, ?, datetime('now','localtime'), ?)
         ON CONFLICT(member_id, date) DO UPDATE SET code = excluded.code, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
      ).bind(memberId, date, code, updatedBy).run();
    } else {
      await c.env.DB.prepare(`DELETE FROM ${entryTable} WHERE member_id = ? AND date = ?`).bind(memberId, date).run();
    }
    await c.env.DB.prepare(
      'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, date, new_value) VALUES (NULL, ?, ?, ?, ?, ?)'
    ).bind(updatedBy, 'star_calendar', member.name, date, code || '(クリア)').run();
  }

  if (body.note !== undefined) {
    const note = (body.note ?? '').trim();
    if (note) {
      await c.env.DB.prepare(
        `INSERT INTO kancho_calendar_notes (member_id, date, note, updated_at, updated_by) VALUES (?, ?, ?, datetime('now','localtime'), ?)
         ON CONFLICT(member_id, date) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
      ).bind(memberId, date, note, updatedBy).run();
    } else {
      await c.env.DB.prepare(`DELETE FROM kancho_calendar_notes WHERE member_id = ? AND date = ?`).bind(memberId, date).run();
    }
  }

  return c.json({ ok: true });
});

// ===== ページ =====
app.get('/liff/kancho-calendar', (c) => {
  const liffId = c.env.LIFF_ID_KANCHO_CALENDAR ?? '';
  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>⭐カレ</title>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Hiragino Sans', 'Meiryo', sans-serif; background: #f5f6f8; padding: 10px 10px 40px; }
    .hd { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
    .hd h1 { font-size: 15px; color: #1e3a5f; flex: none; }
    .nav-btn { padding: 6px 12px; background: #4b6cb7; color: white; border: none; border-radius: 6px; font-size: 13px; }
    select#member-sel { flex: 1; min-width: 120px; border: 1px solid #d1d5db; border-radius: 6px; padding: 7px 8px; font-size: 13px; background: white; }
    #msg { text-align: center; padding: 40px 12px; color: #6b7280; font-size: 14px; }
    .role-badge { display: inline-block; font-size: 10px; padding: 1px 8px; border-radius: 10px; background: #e0e7ff; color: #3730a3; margin-left: 4px; }
    .daylist { display: flex; flex-direction: column; gap: 8px; }
    .day-row { background: white; border: 1px solid #e5e7eb; border-radius: 14px; padding: 12px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .day-row.week-start { margin-top: 10px; }
    .day-row.sat { background: #eff6ff; }
    .day-row.sun { background: #fef2f2; }
    .day-row.today { border: 2px solid #4b6cb7; box-shadow: 0 0 0 3px rgba(75,108,183,0.15); padding: 11px 13px; }
    .day-row.out { opacity: 0.45; }
    .day-top { display: flex; align-items: center; gap: 12px; cursor: pointer; }
    .day-datebox { flex: none; width: 50px; text-align: center; }
    .day-num { font-size: 22px; font-weight: 800; color: #1e3a5f; line-height: 1; }
    .today-tag { display: inline-block; font-size: 9px; font-weight: 700; color: #fff; background: #4b6cb7; border-radius: 6px; padding: 1px 5px; margin-top: 3px; }
    .day-dow { font-size: 12px; font-weight: 700; margin-top: 3px; }
    .day-main { flex: 1; min-width: 0; }
    .day-stamp { display: inline-block; font-size: 14px; font-weight: 700; padding: 6px 16px; border-radius: 20px; background: #f3f4f6; color: #9ca3af; }
    .day-stamp.filled { color: #1f2937; font-weight: 800; }
    .day-chevron { flex: none; font-size: 20px; color: #c7ccd4; transition: transform .15s; }
    .day-chevron.open { transform: rotate(90deg); color: #4b6cb7; }
    .day-note-preview { font-size: 11px; color: #9ca3af; margin-top: 6px; white-space: pre-wrap; }
    .day-editor { display: none; margin-top: 12px; padding-top: 12px; border-top: 1px dashed #e5e7eb; }
    .stamp-grid { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .stamp-btn { padding: 6px 12px; border-radius: 8px; font-size: 13px; border: 2px solid transparent; cursor: pointer; }
    .stamp-btn.sel { border-color: #1e3a5f; font-weight: 700; }
    .stamp-clear { padding: 6px 12px; border-radius: 8px; font-size: 12px; border: 1px solid #d1d5db; background: white; color: #6b7280; cursor: pointer; }
    .note-area { width: 100%; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; font-size: 13px; font-family: inherit; resize: vertical; min-height: 44px; }
    .note-save { margin-top: 6px; padding: 6px 16px; background: #1e3a5f; color: white; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; }
  </style>
</head>
<body>
  <div id="msg">読み込み中...</div>
  <div id="app" style="display:none;">
    <div class="hd">
      <h1>⭐カレ</h1>
      <select id="member-sel" onchange="onSelectMember()"></select>
    </div>
    <div class="hd">
      <button class="nav-btn" onclick="move(-1)">◀</button>
      <h1 id="period-label"></h1>
      <button class="nav-btn" onclick="move(1)">▶</button>
    </div>
    <div id="daylist" class="daylist"></div>
  </div>
<script>
var LIFF_ID = '${liffId}';
var _year = 0, _month = 0, _memberId = 0;
var _members = [];
var _cache = null;
var _openDate = null;

function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function todayStr() { var d = new Date(Date.now() + 9*3600*1000); return d.toISOString().slice(0,10); }

async function init() {
  try {
    await liff.init({ liffId: LIFF_ID });
    if (!liff.isLoggedIn()) { liff.login(); return; }
    await loadMembers();
  } catch(e) {
    document.getElementById('msg').textContent = '初期化に失敗しました: ' + (e.message || e);
  }
}

async function loadMembers() {
  var res = await fetch('/api/liff/kancho-calendar/members', {
    headers: { Authorization: 'Bearer ' + liff.getAccessToken() }
  });
  if (res.status === 403) { document.getElementById('msg').textContent = 'このページを見る権限がありません（統括管理者・運行管理者のみ）'; return; }
  if (!res.ok) { document.getElementById('msg').textContent = '読み込みに失敗しました'; return; }
  var d = await res.json();
  _year = d.year; _month = d.month; _members = d.members;
  if (_members.length === 0) { document.getElementById('msg').textContent = '対象の班長が登録されていません'; return; }
  _memberId = d.my_member_id || _members[0].id;
  document.getElementById('member-sel').innerHTML = _members.map(function(m) {
    return '<option value="' + m.id + '"' + (m.id === _memberId ? ' selected' : '') + '>' + escH(m.name) + (m.id === d.my_member_id ? '（自分）' : '') + '</option>';
  }).join('');
  await load();
}

function onSelectMember() {
  _memberId = parseInt(document.getElementById('member-sel').value);
  _openDate = null;
  load();
}

async function load() {
  document.getElementById('msg').style.display = 'block';
  document.getElementById('msg').textContent = '読み込み中...';
  document.getElementById('app').style.display = 'none';
  var res = await fetch('/api/liff/kancho-calendar?member_id=' + _memberId + '&year=' + _year + '&month=' + _month, {
    headers: { Authorization: 'Bearer ' + liff.getAccessToken() }
  });
  if (!res.ok) { document.getElementById('msg').textContent = '読み込みに失敗しました'; return; }
  _cache = await res.json();
  _year = _cache.year; _month = _cache.month;
  render();
  document.getElementById('msg').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}

function move(dir) {
  _month += dir;
  if (_month < 1) { _month = 12; _year--; }
  if (_month > 12) { _month = 1; _year++; }
  _openDate = null;
  load();
}

function render() {
  var d = _cache;
  document.getElementById('period-label').textContent = d.year + '年' + d.month + '月度' + (d.member.is_indoor ? '' : '（乗務）');
  var emap = {}; d.entries.forEach(function(e) { emap[e.date] = e.code; });
  var nmap = {}; d.notes.forEach(function(n) { nmap[n.date] = n.note; });
  var colorMap = {}; d.types.forEach(function(t) { colorMap[t.code] = t.color; });
  var wd = ['日','月','火','水','木','金','土'];
  var today = todayStr();

  document.getElementById('daylist').innerHTML = d.dates.map(function(dt) {
    var day = parseInt(dt.slice(8), 10);
    var dow = new Date(dt + 'T00:00:00Z').getUTCDay();
    var out = dt < d.periodStart || dt > d.periodEnd;
    var code = emap[dt] || '';
    var note = nmap[dt] || '';
    var dowColor = dow === 0 ? '#dc2626' : dow === 6 ? '#2563eb' : '#6b7280';
    var weekCls = dow === 0 ? ' sun' : dow === 6 ? ' sat' : '';
    var cls = 'day-row' + weekCls + (dow === 1 ? ' week-start' : '') + (dt === today ? ' today' : '') + (out ? ' out' : '');
    var stampBg = code ? (colorMap[code] || '#e5e7eb') : '#f3f4f6';
    return '<div class="' + cls + '" id="row-' + dt + '">'
      + '<div class="day-top" onclick="toggleEditor(\\'' + dt + '\\')">'
      + '<div class="day-datebox">'
      + '<div class="day-num">' + day + '</div>'
      + '<div class="day-dow" style="color:' + dowColor + ';">' + wd[dow] + '</div>'
      + (dt === today ? '<div class="today-tag">本日</div>' : '')
      + '</div>'
      + '<div class="day-main">'
      + '<div class="day-stamp' + (code ? ' filled' : '') + '" style="background:' + stampBg + ';">' + (code ? escH(code) : '未設定') + '</div>'
      + (note ? '<div class="day-note-preview">📝 ' + escH(note) + '</div>' : '')
      + '</div>'
      + '<div class="day-chevron" id="chev-' + dt + '">›</div>'
      + '</div>'
      + '<div class="day-editor" id="editor-' + dt + '">'
      + '<div class="stamp-grid">' + d.types.map(function(t) {
          return '<button class="stamp-btn' + (t.code === code ? ' sel' : '') + '" style="background:' + t.color + ';" onclick="pickStamp(\\'' + dt + '\\',\\'' + t.code + '\\')">' + escH(t.code) + (t.label ? ' ' + escH(t.label) : '') + '</button>';
        }).join('') + '<button class="stamp-clear" onclick="pickStamp(\\'' + dt + '\\',\\'\\')">クリア</button></div>'
      + '<textarea class="note-area" id="note-' + dt + '" placeholder="その他（詳細メモ）">' + escH(note) + '</textarea>'
      + '<div><button class="note-save" onclick="saveNote(\\'' + dt + '\\')">メモを保存</button></div>'
      + '</div>'
      + '</div>';
  }).join('');

  if (_openDate) {
    var ed = document.getElementById('editor-' + _openDate);
    if (ed) ed.style.display = 'block';
  }
}

function toggleEditor(dt) {
  var willOpen = _openDate !== dt;
  if (_openDate) {
    var prev = document.getElementById('editor-' + _openDate);
    if (prev) prev.style.display = 'none';
    var prevChev = document.getElementById('chev-' + _openDate);
    if (prevChev) prevChev.classList.remove('open');
  }
  _openDate = willOpen ? dt : null;
  if (willOpen) {
    var ed = document.getElementById('editor-' + dt);
    if (ed) ed.style.display = 'block';
    var chev = document.getElementById('chev-' + dt);
    if (chev) chev.classList.add('open');
  }
}

async function pickStamp(dt, code) {
  if (_cache.member.is_indoor) {
    var day = parseInt(dt.slice(8), 10);
    var typeObj = _cache.types.filter(function(t) { return t.code === code; })[0];
    var label = code ? (code + (typeObj && typeObj.label ? '（' + typeObj.label + '）' : '')) : 'クリア（未設定）';
    var ok = confirm(
      _cache.month + '月' + day + '日を「' + label + '」に変更します。\\n\\n'
      + 'これは班長シフト表（内勤）本体のデータです。他の班長・管理者にも共有されます。\\n本当に変更してよろしいですか？'
    );
    if (!ok) return;
  }
  var res = await fetch('/api/liff/kancho-calendar/entry', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + liff.getAccessToken() },
    body: JSON.stringify({ member_id: _memberId, date: dt, code: code })
  });
  if (!res.ok) { alert('保存に失敗しました'); return; }
  await load();
}

async function saveNote(dt) {
  var note = document.getElementById('note-' + dt).value;
  var res = await fetch('/api/liff/kancho-calendar/entry', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + liff.getAccessToken() },
    body: JSON.stringify({ member_id: _memberId, date: dt, note: note })
  });
  if (!res.ok) { alert('保存に失敗しました'); return; }
  await load();
}

init();
</script>
</body>
</html>`);
});

export default app;
