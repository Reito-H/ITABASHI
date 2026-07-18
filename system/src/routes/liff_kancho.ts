// LIFF: 班長シフト閲覧（統括管理者・運行管理者のみ / 閲覧専用）
// ページ: /liff/kancho-shift   API: /api/liff/kancho-shift
import { Hono } from 'hono';
import type { Env } from '../auth';
import { getPeriodSettings, getPeriodRange, getShiftDisplayRange, getPeriod } from '../auth';
import { logLineActivity } from '../utils/activity_log';

const app = new Hono<{ Bindings: Env }>();

async function verifyLiffToken(accessToken: string): Promise<string | null> {
  if (!accessToken) return null;
  const res = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json<{ userId?: string }>();
  return data.userId ?? null;
}

// ===== API =====
app.get('/api/liff/kancho-shift', async (c) => {
  const auth = c.req.header('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const uid = await verifyLiffToken(token);
  if (!uid) return c.json({ error: 'unauthorized' }, 401);

  const liffUser = await c.env.DB.prepare(
    'SELECT role FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string }>();
  if (!liffUser || !['general_manager', 'operations_manager'].includes(liffUser.role)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const now = getPeriod(new Date().toISOString().split('T')[0]);
  const year = parseInt(c.req.query('year') ?? '') || now.year;
  const month = parseInt(c.req.query('month') ?? '') || now.month;

  const periodCfg = await getPeriodSettings(c.env.DB);
  const { start: periodStart, end: periodEnd } = getPeriodRange(year, month, periodCfg);
  const { start: dispStart, end: dispEnd, dates } = getShiftDisplayRange(year, month, periodCfg);

  const [members, types, shifts, memos] = await Promise.all([
    c.env.DB.prepare("SELECT id, name, role, section, sort_order, team_color, is_indoor FROM kancho_members WHERE is_active = 1 ORDER BY section, sort_order, id").all(),
    c.env.DB.prepare('SELECT code, label, color, section, daily_required, use_team_color, counts_as_work, counts_as_off FROM kancho_shift_types WHERE is_active = 1 ORDER BY sort_order, id').all(),
    c.env.DB.prepare('SELECT member_id, date, code, is_diagonal, is_wish, cell_color FROM kancho_shifts WHERE date BETWEEN ? AND ?')
      .bind(dispStart, dispEnd).all(),
    c.env.DB.prepare('SELECT kind, title, content FROM kancho_memos WHERE year = ? AND month = ? ORDER BY kind, sort_order, id')
      .bind(year, month).all(),
  ]);

  await logLineActivity(c.env.DB, uid, 'liff', 'view', 'kancho_shift', `${year}-${month}`);

  return c.json({
    year, month, periodStart, periodEnd, dates,
    members: members.results ?? [],
    types: types.results ?? [],
    shifts: shifts.results ?? [],
    memos: memos.results ?? [],
  });
});

// ===== ページ =====
app.get('/liff/kancho-shift', (c) => {
  const liffId = c.env.LIFF_ID_KANCHO_SHIFT ?? '';
  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>班長シフト</title>
  <script src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Hiragino Sans', 'Meiryo', sans-serif; background: #f5f6f8; padding: 10px; }
    .hd { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
    .hd h1 { font-size: 15px; color: #1e3a5f; }
    .nav-btn { padding: 6px 12px; background: #4b6cb7; color: white; border: none; border-radius: 6px; font-size: 13px; }
    .wrap { overflow-x: auto; border: 1px solid #d1d5db; border-radius: 8px; background: white; -webkit-overflow-scrolling: touch; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid #d1d5db; font-size: 10px; text-align: center; padding: 3px 1px; min-width: 34px; max-width: 34px; overflow: hidden; white-space: nowrap; }
    td.nm, th.nm { min-width: 76px; max-width: 90px; text-align: left; padding-left: 5px; font-weight: 600; position: sticky; left: 0; background: #f8fafc; z-index: 2; }
    th { background: #1e3a5f; color: white; font-size: 9px; }
    th.nm { background: #1e3a5f; z-index: 3; }
    tr.grp td { background: #e0e7ff; text-align: left; font-weight: 700; font-size: 10px; padding-left: 5px; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0; font-size: 10px; }
    .legend span { border: 1px solid #d1d5db; border-radius: 3px; padding: 1px 6px; }
    .memo { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; margin-top: 10px; font-size: 12px; }
    .memo b { color: #1e3a5f; display: block; margin-bottom: 4px; }
    #msg { text-align: center; padding: 40px 12px; color: #6b7280; font-size: 14px; }
    .sub-title { font-size: 12px; font-weight: 700; color: #1e3a5f; margin: 12px 0 4px; }
  </style>
</head>
<body>
  <div id="msg">読み込み中...</div>
  <div id="app" style="display:none;">
    <div class="hd">
      <button class="nav-btn" onclick="move(-1)">◀</button>
      <h1 id="period-label"></h1>
      <button class="nav-btn" onclick="move(1)">▶</button>
    </div>
    <div class="legend" id="legend"></div>
    <div class="wrap"><table id="main-table"></table></div>
    <div id="sub-tables"></div>
    <div class="memo" id="memo-tokki" style="display:none;"></div>
    <div class="memo" id="memo-kibou" style="display:none;"></div>
  </div>
<script>
var LIFF_ID = '${liffId}';
var _year = 0, _month = 0;

function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

async function init() {
  try {
    await liff.init({ liffId: LIFF_ID });
    if (!liff.isLoggedIn()) { liff.login(); return; }
    await load();
  } catch(e) {
    document.getElementById('msg').textContent = '初期化に失敗しました: ' + (e.message || e);
  }
}

async function load() {
  document.getElementById('msg').style.display = 'block';
  document.getElementById('app').style.display = 'none';
  var q = _year ? ('?year=' + _year + '&month=' + _month) : '';
  var res = await fetch('/api/liff/kancho-shift' + q, {
    headers: { Authorization: 'Bearer ' + liff.getAccessToken() }
  });
  if (res.status === 403) { document.getElementById('msg').textContent = 'このページを見る権限がありません（統括管理者・運行管理者のみ）'; return; }
  if (!res.ok) { document.getElementById('msg').textContent = '読み込みに失敗しました'; return; }
  var d = await res.json();
  _year = d.year; _month = d.month;
  render(d);
  document.getElementById('msg').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}

function move(dir) {
  _month += dir;
  if (_month < 1) { _month = 12; _year--; }
  if (_month > 12) { _month = 1; _year++; }
  load();
}

function render(d) {
  document.getElementById('period-label').textContent = d.year + '年' + d.month + '月度';
  var colorMap = {};
  var teamColorCodes = {};
  d.types.forEach(function(t) {
    if (!(t.code in colorMap)) colorMap[t.code] = t.color;
    if (t.use_team_color) teamColorCodes[t.code] = 1;
  });
  document.getElementById('legend').innerHTML = d.types.map(function(t) {
    return '<span style="background:' + t.color + ';">' + escH(t.code) + (t.label ? ' ' + escH(t.label) : '') + '</span>';
  }).join('') + '<span>空白(班色)=昼日勤 7:30〜16:30</span><span><i>斜体の直</i>=斜め直 14:00〜翌8:00</span><span style="color:#dc2626;font-weight:700;">赤文字=希望休</span>';

  var smap = {};
  d.shifts.forEach(function(s) { smap[s.member_id + '_' + s.date] = s; });
  var wd = ['日','月','火','水','木','金','土'];

  function dateHead() {
    return '<tr><th class="nm">氏名</th>' + d.dates.map(function(dt) {
      var day = parseInt(dt.slice(8), 10);
      var dow = new Date(dt + 'T00:00:00Z').getUTCDay();
      var out = dt < d.periodStart || dt > d.periodEnd;
      return '<th style="' + (out ? 'opacity:0.55;' : '') + '"><div>' + day + '</div><div style="color:' + (dow===0?'#fca5a5':dow===6?'#93c5fd':'#e5e7eb') + ';">' + wd[dow] + '</div></th>';
    }).join('') + '</tr>';
  }
  function rowsFor(list) {
    return list.map(function(m) {
      var nameStyle = m.team_color ? 'border-left:5px solid ' + m.team_color + ';' : '';
      return '<tr><td class="nm" style="' + nameStyle + '">' + escH(m.name) + '</td>' + d.dates.map(function(dt) {
        var s = smap[m.id + '_' + dt];
        var code = s ? (s.code || '') : '';
        var out = dt < d.periodStart || dt > d.periodEnd;
        var bg;
        if (s && s.cell_color) bg = s.cell_color;
        else if (code) bg = (teamColorCodes[code] && m.team_color) ? m.team_color : (colorMap[code] || '#fff7ed');
        else bg = (!out && m.team_color && m.section === 'main') ? m.team_color : '#fff';
        var fs = '';
        if (s && s.is_diagonal) fs += 'font-style:italic;';
        if (s && s.is_wish) fs += 'color:#dc2626;font-weight:700;';
        return '<td style="background:' + bg + ';' + fs + (out ? 'opacity:0.45;' : '') + '">' + escH(code) + '</td>';
      }).join('') + '</tr>';
    }).join('');
  }

  var ROLE_ORDER = ['昼日勤班長','終業班長','教育班長','研修課出向','職員当直'];
  var main = d.members.filter(function(m) { return m.section === 'main' && m.is_indoor === 1; }).sort(function(a, b) {
    var ra = a.role ? (ROLE_ORDER.indexOf(a.role) === -1 ? 90 : ROLE_ORDER.indexOf(a.role)) : 99;
    var rb = b.role ? (ROLE_ORDER.indexOf(b.role) === -1 ? 90 : ROLE_ORDER.indexOf(b.role)) : 99;
    return ra - rb || a.sort_order - b.sort_order || a.id - b.id;
  });
  var html = dateHead();
  var lastRole = null;
  main.forEach(function(m) {
    var role = m.role || 'その他';
    if (role !== lastRole) {
      html += '<tr class="grp"><td colspan="' + (1 + d.dates.length) + '">● ' + escH(role) + '</td></tr>';
      lastRole = role;
    }
    html += rowsFor([m]);
  });
  document.getElementById('main-table').innerHTML = html;

  var subHtml = '';
  [['s1', '① 表'], ['s2', '② 表']].forEach(function(sec) {
    var list = d.members.filter(function(m) { return m.section === sec[0]; });
    if (list.length === 0) return;
    subHtml += '<div class="sub-title">' + sec[1] + '</div><div class="wrap"><table>' + dateHead() + rowsFor(list) + '</table></div>';
  });
  document.getElementById('sub-tables').innerHTML = subHtml;

  var tokki = d.memos.filter(function(m) { return m.kind === 'tokki'; });
  var kibou = d.memos.filter(function(m) { return m.kind === 'kibou'; });
  var te = document.getElementById('memo-tokki');
  te.style.display = tokki.length ? 'block' : 'none';
  if (tokki.length) te.innerHTML = '<b>・特記事項</b><div style="white-space:pre-wrap;">' + escH(tokki[0].content) + '</div>';
  var ke = document.getElementById('memo-kibou');
  ke.style.display = kibou.length ? 'block' : 'none';
  if (kibou.length) ke.innerHTML = '<b>・希望休</b>' + kibou.map(function(k) {
    return '<div><b style="display:inline;">' + escH(k.title) + '</b>　' + escH(k.content) + '</div>';
  }).join('');
}

init();
</script>
</body>
</html>`);
});

export default app;
