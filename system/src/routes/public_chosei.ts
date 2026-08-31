// 調整機能（公開・回答ページ）
// ログイン不要。共有URL {CHOSEI_PATH}/<token> を開き、社員番号を入力（employees と照合）して
// 各日程候補に ○(o)/△(t)/×(x) とコメントを1件登録する。再回答は上書き。
// ページ: {CHOSEI_PATH}/:token    API: /api/public/chosei/:token/*
// 認証は一切行わない。書き込みは chosei_responses / chosei_answers の upsert に限定する。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { CHOSEI_PATH } from '../config';

const app = new Hono<{ Bindings: Env }>();

const MARKS = new Set(['o', 't', 'x']);

function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}

type EventRow = {
  id: number; token: string; title: string; description: string; contact_name: string; is_closed: number;
};

async function findEvent(db: D1Database, token: string): Promise<EventRow | null> {
  if (!token || !/^[0-9a-f]{32}$/.test(token)) return null;
  return db.prepare('SELECT id, token, title, description, contact_name, is_closed FROM chosei_events WHERE token = ?')
    .bind(token).first<EventRow>();
}
async function findActiveEmployee(db: D1Database, empNo: string): Promise<{ emp_no: string; name: string } | null> {
  if (!empNo) return null;
  return db.prepare('SELECT emp_no, name FROM employees WHERE emp_no = ? AND is_active = 1').bind(empNo).first<{ emp_no: string; name: string }>();
}
async function loadOptions(db: D1Database, eventId: number) {
  const r = await db.prepare('SELECT id, label FROM chosei_options WHERE event_id = ? ORDER BY sort_order, id').bind(eventId).all<{ id: number; label: string }>();
  return r.results ?? [];
}

// ===== API =====
app.get('/api/public/chosei/:token', async (c) => {
  const ev = await findEvent(c.env.DB, c.req.param('token'));
  if (!ev) return c.json({ error: 'この調整は見つかりませんでした。URLをご確認ください' }, 404);
  const options = await loadOptions(c.env.DB, ev.id);
  return c.json({
    event: { title: ev.title, description: ev.description, contact_name: ev.contact_name, is_closed: ev.is_closed },
    options
  });
});

// 自分の既存回答
app.get('/api/public/chosei/:token/me', async (c) => {
  const ev = await findEvent(c.env.DB, c.req.param('token'));
  if (!ev) return c.json({ error: 'この調整は見つかりませんでした' }, 404);
  const empNo = toHalfWidth((c.req.query('emp_no') ?? '').trim());
  const emp = await findActiveEmployee(c.env.DB, empNo);
  if (!emp) return c.json({ error: '社員番号が確認できませんでした。ご確認のうえ再度お試しください' }, 404);
  const resp = await c.env.DB.prepare('SELECT id, name, comment FROM chosei_responses WHERE event_id = ? AND emp_no = ?')
    .bind(ev.id, empNo).first<{ id: number; name: string; comment: string }>();
  if (!resp) return c.json({ registered: false, name: emp.name });
  const ans = await c.env.DB.prepare('SELECT option_id, mark FROM chosei_answers WHERE response_id = ?').bind(resp.id).all<{ option_id: number; mark: string }>();
  const answers: Record<string, string> = {};
  for (const a of (ans.results ?? [])) answers[String(a.option_id)] = a.mark;
  return c.json({ registered: true, name: resp.name || emp.name, comment: resp.comment, answers });
});

// 全員の回答（調整さん形式の一覧）
app.get('/api/public/chosei/:token/summary', async (c) => {
  const ev = await findEvent(c.env.DB, c.req.param('token'));
  if (!ev) return c.json({ error: 'この調整は見つかりませんでした' }, 404);
  const options = await loadOptions(c.env.DB, ev.id);
  const respRows = await c.env.DB.prepare('SELECT id, name, emp_no, comment FROM chosei_responses WHERE event_id = ? ORDER BY created_at, id')
    .bind(ev.id).all<{ id: number; name: string; emp_no: string; comment: string }>();
  const responses = [];
  for (const r of (respRows.results ?? [])) {
    const ans = await c.env.DB.prepare('SELECT option_id, mark FROM chosei_answers WHERE response_id = ?').bind(r.id).all<{ option_id: number; mark: string }>();
    const answers: Record<string, string> = {};
    for (const a of (ans.results ?? [])) answers[String(a.option_id)] = a.mark;
    responses.push({ name: r.name || r.emp_no, comment: r.comment, answers });
  }
  return c.json({ event: { title: ev.title, is_closed: ev.is_closed }, options, responses });
});

// 回答の登録・更新
app.post('/api/public/chosei/:token/respond', async (c) => {
  const ev = await findEvent(c.env.DB, c.req.param('token'));
  if (!ev) return c.json({ error: 'この調整は見つかりませんでした' }, 404);
  if (ev.is_closed) return c.json({ error: 'この調整は受付を終了しています' }, 400);
  const b = await c.req.json<{ emp_no?: string; comment?: string; answers?: Array<{ option_id?: number; mark?: string }> }>();
  const empNo = toHalfWidth((b.emp_no ?? '').trim());
  const emp = await findActiveEmployee(c.env.DB, empNo);
  if (!emp) return c.json({ error: '社員番号が確認できませんでした。ご確認のうえ再度お試しください' }, 404);

  const options = await loadOptions(c.env.DB, ev.id);
  const validIds = new Set(options.map(o => o.id));
  const marks = new Map<number, string>();
  for (const a of (Array.isArray(b.answers) ? b.answers : [])) {
    const oid = Number(a.option_id);
    const mk = String(a.mark ?? '');
    if (validIds.has(oid) && MARKS.has(mk)) marks.set(oid, mk);
  }
  if (marks.size === 0) return c.json({ error: '各候補に ○ / △ / × のいずれかを選んでください' }, 400);
  const comment = (b.comment ?? '').trim().slice(0, 500);

  let resp = await c.env.DB.prepare('SELECT id FROM chosei_responses WHERE event_id = ? AND emp_no = ?').bind(ev.id, empNo).first<{ id: number }>();
  if (resp) {
    await c.env.DB.prepare("UPDATE chosei_responses SET name = ?, comment = ?, updated_at = datetime('now','localtime') WHERE id = ?")
      .bind(emp.name, comment, resp.id).run();
    await c.env.DB.prepare('DELETE FROM chosei_answers WHERE response_id = ?').bind(resp.id).run();
  } else {
    const ins = await c.env.DB.prepare('INSERT INTO chosei_responses (event_id, emp_no, name, comment) VALUES (?, ?, ?, ?)')
      .bind(ev.id, empNo, emp.name, comment).run();
    resp = { id: ins.meta.last_row_id as number };
  }
  for (const o of options) {
    const mk = marks.get(o.id) ?? 'x';
    await c.env.DB.prepare('INSERT INTO chosei_answers (response_id, option_id, mark) VALUES (?, ?, ?)').bind(resp.id, o.id, mk).run();
  }
  return c.json({ ok: true });
});

// ===== ページ =====
app.get(`${CHOSEI_PATH}/:token`, (c) => {
  const token = c.req.param('token');
  if (!/^[0-9a-f]{32}$/.test(token)) return c.text('URLをご確認ください', 404);
  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>日程調整</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f1f5f9; }
  body { font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #1f2937; }
  .wrap { max-width: 680px; margin: 0 auto; padding: 18px 14px 60px; }
  .head { text-align: center; padding: 10px 0 18px; }
  .head h1 { font-size: 18px; color: #1e3a5f; margin: 0 0 4px; }
  .head .sub { font-size: 12px; color: #9ca3af; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
  .card h2 { font-size: 14px; color: #1e3a5f; margin: 0 0 10px; }
  .desc { font-size: 13px; color: #374151; white-space: pre-wrap; line-height: 1.7; }
  .contact { font-size: 12px; color: #9ca3af; margin-top: 8px; }
  label.fld { font-size: 12px; color: #6b7280; display: block; margin-bottom: 6px; }
  input[type=text], textarea { width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; font-size: 15px; font-family: inherit; }
  textarea { resize: vertical; }
  .big-btn { display: block; width: 100%; margin-top: 14px; padding: 13px; background: #2563eb; color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; }
  .big-btn.secondary { background: #eef2f7; color: #374151; }
  .big-btn:disabled { opacity: .55; }
  .err { color: #dc2626; font-size: 12px; margin-top: 8px; display: none; }
  .opt-row { padding: 12px 0; border-bottom: 1px solid #f1f5f9; }
  .opt-row:last-child { border-bottom: none; }
  .opt-label { font-size: 14px; font-weight: 700; color: #1f2937; margin-bottom: 8px; }
  .mark-group { display: flex; gap: 8px; }
  .mark-btn { flex: 1; padding: 10px 0; border: 2px solid #d1d5db; background: #fff; border-radius: 10px; font-size: 18px; font-weight: 800; cursor: pointer; color: #9ca3af; }
  .mark-btn.sel-o { border-color: #16a34a; background: #f0fdf4; color: #166534; }
  .mark-btn.sel-t { border-color: #d97706; background: #fffbeb; color: #b45309; }
  .mark-btn.sel-x { border-color: #6b7280; background: #f3f4f6; color: #374151; }
  .tbl-scroll { overflow-x: auto; }
  table.sum { border-collapse: collapse; font-size: 12px; min-width: 100%; }
  table.sum th, table.sum td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; white-space: nowrap; text-align: center; }
  table.sum th:first-child, table.sum td:first-child { text-align: left; position: sticky; left: 0; background: #fff; }
  table.sum thead th { background: #f8fafc; border-bottom: 2px solid #e5e7eb; }
  .tally td { border-top: 2px solid #e5e7eb; font-weight: 700; }
  .done-msg { text-align: center; color: #16a34a; font-weight: 700; font-size: 14px; margin: 6px 0 2px; }
  .closed-badge { display:inline-block; padding:3px 10px; border-radius:99px; background:#f3f4f6; color:#6b7280; font-size:11px; font-weight:700; }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <h1 id="ev-title">日程調整</h1>
    <div class="sub" id="ev-status"></div>
  </div>

  <div id="load-err" class="card" style="display:none;color:#dc2626;font-size:13px;"></div>

  <div id="step1" style="display:none;">
    <div class="card" id="ev-desc-card" style="display:none;">
      <div class="desc" id="ev-desc"></div>
      <div class="contact" id="ev-contact"></div>
    </div>
    <div class="card">
      <h2>回答をはじめる</h2>
      <label class="fld" for="emp-no">社員番号</label>
      <input type="text" id="emp-no" inputmode="numeric" autocomplete="off" placeholder="社員番号を入力">
      <button class="big-btn" id="start-btn" onclick="startAnswer()">次へ</button>
      <div class="err" id="emp-err"></div>
    </div>
  </div>

  <div id="step2" style="display:none;">
    <div class="card">
      <h2 id="answer-heading">各候補に ○ / △ / × を選択</h2>
      <div style="font-size:11px;color:#9ca3af;margin-bottom:6px;">○=参加できる ／ △=調整すれば可 ／ ×=不可</div>
      <div id="opt-list"></div>
    </div>
    <div class="card">
      <label class="fld" for="comment">コメント（任意）</label>
      <textarea id="comment" rows="3" maxlength="500" placeholder="補足があれば記入してください"></textarea>
    </div>
    <button class="big-btn" id="submit-btn" onclick="submitAnswer()">この内容で回答する</button>
    <button class="big-btn secondary" onclick="showStep('step1')">戻る</button>
    <div class="err" id="submit-err"></div>
  </div>

  <div id="step3" style="display:none;">
    <div class="card">
      <div class="done-msg">回答を送信しました。ありがとうございました。</div>
      <div style="font-size:12px;color:#9ca3af;text-align:center;">同じURLを開いて同じ社員番号を入力すると、回答をやり直せます。</div>
      <button class="big-btn secondary" onclick="reanswer()" style="margin-top:14px;">回答を修正する</button>
    </div>
    <div class="card">
      <h2>みんなの回答</h2>
      <div class="tbl-scroll"><div id="sum-body" style="font-size:12px;color:#9ca3af;">読み込み中...</div></div>
    </div>
  </div>
</div>

<script>
var TOKEN = ${JSON.stringify(token)};
var API = '/api/public/chosei/' + TOKEN;
var MARK_LABEL = { o: '○', t: '△', x: '×' };
var _event = null;
var _options = [];
var _empNo = '';
var _picks = {};

function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function toHalfWidth(s) { return s.replace(/[０-９]/g, function(ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); }); }
function showStep(id) {
  ['step1','step2','step3'].forEach(function(s) { document.getElementById(s).style.display = (s === id) ? 'block' : 'none'; });
  window.scrollTo(0, 0);
}

async function loadEvent() {
  try {
    var res = await fetch(API);
    var d = await res.json();
    if (!res.ok) { document.getElementById('load-err').style.display = 'block'; document.getElementById('load-err').textContent = d.error || '読み込みに失敗しました'; return; }
    _event = d.event; _options = d.options || [];
    document.getElementById('ev-title').textContent = _event.title;
    if (_event.description) {
      document.getElementById('ev-desc').textContent = _event.description;
      document.getElementById('ev-desc-card').style.display = 'block';
    }
    if (_event.contact_name) document.getElementById('ev-contact').textContent = '担当: ' + _event.contact_name;
    if (_event.is_closed) {
      document.getElementById('ev-status').innerHTML = '<span class="closed-badge">受付終了</span>';
    }
    showStep('step1');
  } catch (e) {
    document.getElementById('load-err').style.display = 'block';
    document.getElementById('load-err').textContent = '読み込みに失敗しました。通信環境をご確認ください';
  }
}

async function startAnswer() {
  var empNo = toHalfWidth(document.getElementById('emp-no').value.trim());
  var errEl = document.getElementById('emp-err');
  errEl.style.display = 'none';
  if (!empNo) { errEl.textContent = '社員番号を入力してください'; errEl.style.display = 'block'; return; }
  var btn = document.getElementById('start-btn');
  btn.disabled = true;
  try {
    var res = await fetch(API + '/me?emp_no=' + encodeURIComponent(empNo));
    var d = await res.json();
    if (!res.ok) { errEl.textContent = d.error || '確認できませんでした'; errEl.style.display = 'block'; return; }
    _empNo = empNo;
    _picks = {};
    if (d.registered && d.answers) { _picks = d.answers; }
    document.getElementById('comment').value = d.comment || '';
    document.getElementById('answer-heading').textContent = (d.name || '') + ' さんの回答';
    renderOptions();
    if (_event.is_closed && !d.registered) {
      errEl.textContent = 'この調整は受付を終了しています';
      errEl.style.display = 'block';
      return;
    }
    showStep('step2');
  } catch (e) {
    errEl.textContent = '確認に失敗しました。もう一度お試しください'; errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
}

function renderOptions() {
  var html = _options.map(function(o) {
    var cur = _picks[o.id] || '';
    var btns = ['o','t','x'].map(function(m) {
      var sel = (cur === m) ? (' sel-' + m) : '';
      return '<button type="button" class="mark-btn' + sel + '" data-oid="' + o.id + '" data-mark="' + m + '" onclick="pick(' + o.id + ',\\'' + m + '\\')">' + MARK_LABEL[m] + '</button>';
    }).join('');
    return '<div class="opt-row"><div class="opt-label">' + escH(o.label) + '</div><div class="mark-group">' + btns + '</div></div>';
  }).join('');
  document.getElementById('opt-list').innerHTML = html;
}
function pick(oid, mark) {
  _picks[oid] = mark;
  var row = document.querySelectorAll('.mark-btn[data-oid="' + oid + '"]');
  row.forEach(function(b) {
    var m = b.getAttribute('data-mark');
    b.className = 'mark-btn' + (m === mark ? ' sel-' + m : '');
  });
}

async function submitAnswer() {
  var errEl = document.getElementById('submit-err');
  errEl.style.display = 'none';
  var answers = _options.map(function(o) { return { option_id: o.id, mark: _picks[o.id] || '' }; });
  if (answers.some(function(a) { return !a.mark; })) {
    errEl.textContent = 'すべての候補に ○ / △ / × を選んでください'; errEl.style.display = 'block'; return;
  }
  var btn = document.getElementById('submit-btn');
  btn.disabled = true;
  try {
    var res = await fetch(API + '/respond', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ emp_no: _empNo, comment: document.getElementById('comment').value.trim(), answers: answers })
    });
    var d = await res.json().catch(function() { return {}; });
    if (!res.ok) { errEl.textContent = d.error || '送信に失敗しました'; errEl.style.display = 'block'; return; }
    showStep('step3');
    loadSummary();
  } catch (e) {
    errEl.textContent = '送信に失敗しました。もう一度お試しください'; errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
}

function reanswer() { showStep('step2'); }

async function loadSummary() {
  try {
    var res = await fetch(API + '/summary');
    var d = await res.json();
    if (!res.ok) { document.getElementById('sum-body').textContent = d.error || '読み込みに失敗しました'; return; }
    var options = d.options || [];
    var responses = d.responses || [];
    var tally = {};
    options.forEach(function(o) { tally[o.id] = { o: 0, t: 0, x: 0 }; });
    responses.forEach(function(r) {
      options.forEach(function(o) { var m = (r.answers && r.answers[o.id]) || 'x'; tally[o.id][m]++; });
    });
    var best = -1;
    options.forEach(function(o) { var sc = tally[o.id].o * 2 + tally[o.id].t; if (responses.length && sc > best) best = sc; });

    var head = '<tr><th>回答者</th>';
    options.forEach(function(o) {
      var sc = tally[o.id].o * 2 + tally[o.id].t;
      var b = responses.length && sc === best ? ' style="background:#ecfdf5;"' : '';
      head += '<th' + b + '>' + escH(o.label) + '</th>';
    });
    head += '<th>コメント</th></tr>';

    var rows = responses.map(function(r) {
      var tds = '<td>' + escH(r.name) + '</td>';
      options.forEach(function(o) { var m = (r.answers && r.answers[o.id]) || 'x'; tds += '<td>' + MARK_LABEL[m] + '</td>'; });
      tds += '<td style="text-align:left;white-space:pre-wrap;">' + escH(r.comment || '') + '</td>';
      return '<tr>' + tds + '</tr>';
    }).join('');

    var tr = '<td>集計</td>';
    options.forEach(function(o) {
      var t = tally[o.id];
      var b = responses.length && (t.o * 2 + t.t) === best ? ' style="background:#ecfdf5;"' : '';
      tr += '<td' + b + '>○' + t.o + ' △' + t.t + ' ×' + t.x + '</td>';
    });
    tr += '<td></td>';

    document.getElementById('sum-body').innerHTML = '<table class="sum"><thead>' + head + '</thead><tbody>'
      + (responses.length ? rows : '<tr><td colspan="' + (options.length + 2) + '" style="color:#9ca3af;">まだ回答がありません</td></tr>')
      + '<tr class="tally">' + tr + '</tr></tbody></table>';
  } catch (e) {
    document.getElementById('sum-body').textContent = '読み込みに失敗しました';
  }
}

loadEvent();
</script>
</body>
</html>`);
});

export default app;
