// 希望休フォーム（ログイン不要・完全公開・複雑なURLでのみアクセス可能）
// フロー: 社員番号入力 → 本人確認 → カレンダー（月曜始まり）で希望休入力 → その他要望
// ページ: {KANCHO_WISH_PATH}   API: /api/public/kancho-wish/*
// 認証は一切行わない。書き込み範囲は対象月度の内勤班長(is_indoor=1)の
// 希望休(kancho_wishes)・その他要望(kancho_wish_remarks)のみに厳しく限定する。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { getPeriodSettings, getPeriodRange } from '../auth';
import { KANCHO_WISH_PATH } from '../config';
import { FAVICON_DATA_URI } from '../html/layout';

const app = new Hono<{ Bindings: Env }>();

type WishSettings = { target_year: number; target_month: number; open_from: string | null; open_until: string | null };

async function getWishSettings(db: D1Database): Promise<WishSettings | null> {
  return db.prepare('SELECT target_year, target_month, open_from, open_until FROM kancho_wish_settings WHERE id = 1').first<WishSettings>();
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function isOpenNow(s: WishSettings | null): boolean {
  if (!s || !s.target_year || !s.target_month) return false;
  const today = todayStr();
  if (s.open_from && today < s.open_from) return false;
  if (s.open_until && today > s.open_until) return false;
  return true;
}

// 一旦停止中: 班長が希望休を提出したときに統括管理者等（送信権限者）のLINEへ即時通知する機能。
// 再開するときは false を true に戻すだけでよい。
const WISH_SUBMIT_NOTIFY_ENABLED = false;

// 提出時のLINE即時通知（送信権限者へ1件ずつ内容が分かるように通知）
async function notifyWishSubmitters(env: Env, text: string): Promise<void> {
  const token = env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return;
  const rows = await env.DB.prepare('SELECT line_uid FROM kancho_wish_notify_optin').all<{ line_uid: string }>();
  const uids = (rows.results ?? []).map(r => r.line_uid).slice(0, 500);
  if (uids.length === 0) return;
  await fetch('https://api.line.me/v2/bot/message/multicast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ to: uids, messages: [{ type: 'text', text }] }),
  });
}

// ===== API =====
app.get('/api/public/kancho-wish/status', async (c) => {
  const settings = await getWishSettings(c.env.DB);
  const open = isOpenNow(settings);
  return c.json({
    open,
    label: settings?.target_year ? `${settings.target_year}年${settings.target_month}月度` : '',
  });
});

// 全角数字を半角に変換（スマホ・PCの入力ゆれ対策）
function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}

app.get('/api/public/kancho-wish/lookup', async (c) => {
  const settings = await getWishSettings(c.env.DB);
  if (!isOpenNow(settings)) return c.json({ error: '現在は希望休の受付期間ではありません' }, 403);
  const empNo = toHalfWidth((c.req.query('emp_no') ?? '').trim());
  if (!empNo) return c.json({ error: '社員番号を入力してください' }, 400);
  const member = await c.env.DB.prepare(
    'SELECT id, name FROM kancho_members WHERE emp_no = ? AND is_active = 1 AND is_indoor = 1 AND year = ? AND month = ?'
  ).bind(empNo, settings!.target_year, settings!.target_month).first<{ id: number; name: string }>();
  if (!member) return c.json({ error: '該当する班長が見つかりませんでした。社員番号をご確認ください' }, 404);
  const periodCfg = await getPeriodSettings(c.env.DB);
  const { start, end } = getPeriodRange(settings!.target_year, settings!.target_month, periodCfg);
  return c.json({ id: member.id, name: member.name, periodStart: start, periodEnd: end });
});

// member_id だけでなく、最初のlookupと同じ emp_no も毎回一致させる（他人のIDを類推しての
// 閲覧・改ざんを防ぐ）。chosei.ts / study_sessions.ts と同様、書き込み系は毎回本人確認する方針。
async function resolveMember(c: { env: Env }, memberId: number, empNo: string): Promise<{ id: number; name: string } | null> {
  if (!empNo) return null;
  const settings = await getWishSettings(c.env.DB);
  if (!isOpenNow(settings)) return null;
  return c.env.DB.prepare(
    'SELECT id, name FROM kancho_members WHERE id = ? AND emp_no = ? AND is_active = 1 AND is_indoor = 1 AND year = ? AND month = ?'
  ).bind(memberId, empNo, settings!.target_year, settings!.target_month).first<{ id: number; name: string }>();
}

app.get('/api/public/kancho-wish', async (c) => {
  const memberId = parseInt(c.req.query('member_id') ?? '');
  const empNo = toHalfWidth((c.req.query('emp_no') ?? '').trim());
  if (!memberId) return c.json({ error: 'member_id が必要です' }, 400);
  const member = await resolveMember(c, memberId, empNo);
  if (!member) return c.json({ error: '対象の班長が見つかりません' }, 404);
  const rows = await c.env.DB.prepare('SELECT id, date FROM kancho_wishes WHERE member_id = ? ORDER BY date')
    .bind(memberId).all<{ id: number; date: string }>();
  return c.json({ wishes: rows.results ?? [] });
});

app.post('/api/public/kancho-wish', async (c) => {
  const b = await c.req.json<{ member_id?: number; date?: string; emp_no?: string }>();
  if (!b.member_id || !/^\d{4}-\d{2}-\d{2}$/.test(b.date ?? '')) {
    return c.json({ error: 'member_id と date が必要です' }, 400);
  }
  const empNo = toHalfWidth((b.emp_no ?? '').trim());
  const member = await resolveMember(c, b.member_id, empNo);
  if (!member) return c.json({ error: '対象の班長が見つかりません' }, 404);
  await c.env.DB.prepare(
    `INSERT INTO kancho_wishes (member_id, date, note) VALUES (?, ?, '')
     ON CONFLICT(member_id, date) DO NOTHING`
  ).bind(b.member_id, b.date).run();
  const row = await c.env.DB.prepare('SELECT id FROM kancho_wishes WHERE member_id = ? AND date = ?')
    .bind(b.member_id, b.date).first<{ id: number }>();
  return c.json({ ok: true, id: row?.id });
});

app.delete('/api/public/kancho-wish/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const memberId = parseInt(c.req.query('member_id') ?? '');
  const empNo = toHalfWidth((c.req.query('emp_no') ?? '').trim());
  if (!memberId) return c.json({ error: 'member_id が必要です' }, 400);
  const member = await resolveMember(c, memberId, empNo);
  if (!member) return c.json({ error: '対象の班長が見つかりません' }, 404);
  const old = await c.env.DB.prepare('SELECT date FROM kancho_wishes WHERE id = ? AND member_id = ?')
    .bind(id, memberId).first<{ date: string }>();
  if (!old) return c.json({ error: '希望休が見つかりません' }, 404);
  await c.env.DB.prepare('DELETE FROM kancho_wishes WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

app.get('/api/public/kancho-wish/remarks', async (c) => {
  const memberId = parseInt(c.req.query('member_id') ?? '');
  const empNo = toHalfWidth((c.req.query('emp_no') ?? '').trim());
  if (!memberId) return c.json({ error: 'member_id が必要です' }, 400);
  const member = await resolveMember(c, memberId, empNo);
  if (!member) return c.json({ error: '対象の班長が見つかりません' }, 404);
  const row = await c.env.DB.prepare('SELECT content FROM kancho_wish_remarks WHERE member_id = ?').bind(memberId).first<{ content: string }>();
  return c.json({ content: row?.content ?? '' });
});

app.post('/api/public/kancho-wish/remarks', async (c) => {
  const b = await c.req.json<{ member_id?: number; content?: string; emp_no?: string }>();
  if (!b.member_id) return c.json({ error: 'member_id が必要です' }, 400);
  const empNo = toHalfWidth((b.emp_no ?? '').trim());
  const member = await resolveMember(c, b.member_id, empNo);
  if (!member) return c.json({ error: '対象の班長が見つかりません' }, 404);
  const content = (b.content ?? '').slice(0, 500);
  await c.env.DB.prepare(
    `INSERT INTO kancho_wish_remarks (member_id, content, updated_at) VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(member_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
  ).bind(b.member_id, content).run();
  return c.json({ ok: true });
});

// 送信ボタン: その時点の希望休一覧＋その他要望をまとめて1通のレポートとして通知
app.post('/api/public/kancho-wish/submit', async (c) => {
  const b = await c.req.json<{ member_id?: number; remark?: string; emp_no?: string }>();
  if (!b.member_id) return c.json({ error: 'member_id が必要です' }, 400);
  const empNo = toHalfWidth((b.emp_no ?? '').trim());
  const member = await resolveMember(c, b.member_id, empNo);
  if (!member) return c.json({ error: '対象の班長が見つかりません' }, 404);

  const remark = (b.remark ?? '').slice(0, 500);
  await c.env.DB.prepare(
    `INSERT INTO kancho_wish_remarks (member_id, content, updated_at) VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(member_id) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
  ).bind(b.member_id, remark).run();

  const wishes = await c.env.DB.prepare('SELECT date FROM kancho_wishes WHERE member_id = ? ORDER BY date')
    .bind(b.member_id).all<{ date: string }>();
  const dates = (wishes.results ?? []).map(w => w.date);
  if (dates.length === 0 && !remark.trim()) return c.json({ error: '希望休またはその他要望を入力してください' }, 400);

  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const dateLines = dates.length
    ? dates.map(d => {
        const dt = new Date(d + 'T00:00:00');
        return `${d.slice(5).replace('-', '/')}(${WD[dt.getDay()]})`;
      }).join('\n')
    : '（なし）';
  const text = `【希望休 提出】${member.name}さんより\n\n希望休:\n${dateLines}\n\nその他要望:\n${remark.trim() || '（なし）'}`;
  if (WISH_SUBMIT_NOTIFY_ENABLED) {
    c.executionCtx.waitUntil(notifyWishSubmitters(c.env, text));
  }
  return c.json({ ok: true });
});

// ===== ページ =====
app.get(KANCHO_WISH_PATH, (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>班長シフト希望休フォーム</title>
  <link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    html { -webkit-text-size-adjust: 100%; }
    html, body { overflow-x:hidden; width:100%; }
    body {
      font-family: 'Hiragino Sans','Meiryo',sans-serif; margin:0; color:#1f2937; font-size:16px;
      background: linear-gradient(160deg,#2e1354 0%,#1e3a5f 45%,#0f2743 100%);
      min-height:100vh; padding:max(16px,env(safe-area-inset-top)) 14px 40px;
      transition:padding-bottom .15s;
    }
    body.has-submit-bar { padding-bottom:96px; }
    .page { max-width:480px; margin:0 auto; width:100%; }
    .brand { display:flex; align-items:center; gap:10px; padding:6px 4px 18px; color:#f2c14e; }
    .brand .badge {
      width:34px; height:34px; border-radius:9px; background:#2e1354; display:flex; align-items:center; justify-content:center;
      box-shadow:0 4px 14px rgba(0,0,0,0.35); flex-shrink:0;
    }
    .brand .badge svg { width:20px; height:20px; }
    .brand h1 { font-size:16px; color:#fff; font-weight:700; letter-spacing:0.3px; }
    .brand .sub { font-size:11px; color:#c7d2e8; margin-top:1px; }
    .card {
      background:#ffffff; border-radius:18px; padding:22px 20px; margin-bottom:14px;
      box-shadow:0 14px 34px rgba(0,0,0,0.22); border:1px solid rgba(255,255,255,0.5);
    }
    .step-title { font-size:16px; font-weight:700; color:#1e3a5f; margin-bottom:14px; display:flex; align-items:center; gap:8px; }
    .step-title .num {
      width:24px; height:24px; border-radius:50%; background:#eef2ff; color:#2e1354; font-size:12px; font-weight:800;
      display:flex; align-items:center; justify-content:center; flex-shrink:0;
    }
    .field-label { font-size:12.5px; color:#6b7280; margin-bottom:8px; font-weight:600; }
    .big-input {
      width:100%; font-size:26px; font-weight:700; padding:16px 14px; border:2px solid #dbe3f0; border-radius:12px;
      text-align:center; letter-spacing:4px; color:#1e3a5f; background:#f8fafc; transition:border-color .15s,box-shadow .15s;
      font-variant-numeric: tabular-nums;
    }
    .big-input:focus { outline:none; border-color:#2e1354; box-shadow:0 0 0 4px rgba(46,19,84,0.12); background:#fff; }
    .big-input::placeholder { color:#c3cbdb; letter-spacing:4px; font-weight:600; }
    .input-hint { font-size:12px; color:#9ca3af; margin-top:8px; text-align:center; }
    .big-btn {
      width:100%; padding:16px; font-size:16px; font-weight:700; border:none; border-radius:12px; color:white; cursor:pointer;
      margin-top:16px; touch-action:manipulation; transition:transform .08s, box-shadow .15s; display:flex; align-items:center; justify-content:center; gap:6px;
    }
    .big-btn:active { transform:scale(0.98); }
    .big-btn.primary { background:linear-gradient(135deg,#3a2a72,#2e1354); box-shadow:0 8px 18px rgba(46,19,84,0.35); }
    .big-btn.primary:disabled { opacity:0.55; box-shadow:none; }
    .big-btn.secondary { background:#f3f4f6; color:#374151; box-shadow:none; }
    .big-btn.green { background:linear-gradient(135deg,#22a35a,#16a34a); box-shadow:0 8px 18px rgba(22,163,74,0.3); }
    .err { color:#dc2626; font-size:13.5px; margin-top:10px; text-align:center; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:8px 10px; }
    #msg { text-align:center; padding:70px 12px; color:#e5e9f2; font-size:15px; }
    .name-confirm { text-align:center; padding:6px 0 2px; }
    .name-confirm .nm { font-size:26px; font-weight:800; color:#1e3a5f; margin:12px 0 22px; }
    .cal-title { font-size:15px; font-weight:700; color:#1e3a5f; margin-bottom:8px; }
    .cal-grid { display:grid; grid-template-columns:repeat(7, minmax(0,1fr)); gap:clamp(3px,1.2vw,5px); width:100%; }
    .cal-dow { text-align:center; font-size:11.5px; color:#9ca3af; padding-bottom:4px; font-weight:600; min-width:0; }
    .cal-cell {
      padding:12px 0; text-align:center; border-radius:9px; border:2px solid #e5e9f2; font-size:clamp(11.5px,3.4vw,14.5px); font-weight:700;
      letter-spacing:-0.3px; white-space:nowrap;
      background:#fafbfc; cursor:pointer; touch-action:manipulation; min-height:44px; min-width:0; overflow:hidden;
      transition:background .12s,border-color .12s,color .12s;
    }
    .cal-cell.len4 { font-size:clamp(10px,2.9vw,12.5px); }
    .cal-cell.len5 { font-size:clamp(9px,2.5vw,11px); letter-spacing:-0.5px; }
    .cal-cell.pad { visibility:hidden; }
    .cal-cell.wish { background:#fee2e2; border-color:#dc2626; color:#dc2626; }
    .cal-cell.loading { opacity:0.4; pointer-events:none; }
    textarea {
      width:100%; border:2px solid #e5e9f2; border-radius:10px; padding:12px; font-size:15px; font-family:inherit;
      margin-top:8px; box-sizing:border-box; resize:vertical; transition:border-color .15s;
    }
    textarea:focus { outline:none; border-color:#2e1354; }
    .hint { font-size:12.5px; color:#6b7280; margin:10px 0; line-height:1.7; }
    .hint b { color:#dc2626; }
    .step { display:none; }
    #toast {
      display:none; position:fixed; bottom:calc(24px + env(safe-area-inset-bottom)); left:50%; transform:translateX(-50%); background:#166534; color:white;
      padding:11px 22px; border-radius:99px; font-size:13.5px; font-weight:600; box-shadow:0 8px 20px rgba(0,0,0,0.3); z-index:60;
    }
    body.has-submit-bar #toast { bottom:calc(96px + env(safe-area-inset-bottom)); }
    .cal-card { padding-left:14px; padding-right:14px; }
    .submit-bar {
      position:fixed; left:0; right:0; bottom:0; display:none; z-index:40;
      background:#ffffff; box-shadow:0 -8px 22px rgba(0,0,0,0.18);
      padding:12px 14px calc(12px + env(safe-area-inset-bottom));
    }
    .submit-bar.show { display:block; }
    .submit-bar .inner { max-width:480px; margin:0 auto; }
    .submit-bar .big-btn { margin-top:0; }
    @media (max-width:360px) {
      .card { padding:18px 14px; border-radius:14px; }
      .cal-card { padding-left:10px; padding-right:10px; }
      .big-input { font-size:22px; letter-spacing:2px; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="brand">
      <div class="badge"><svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><polygon points="32.00,10.00 37.29,24.72 52.92,25.20 40.56,34.78 44.93,49.80 32.00,41.00 19.07,49.80 23.44,34.78 11.08,25.20 26.71,24.72" fill="#f2c14e"/></svg></div>
      <div>
        <h1>班長シフト希望休フォーム</h1>
        <div class="sub" id="period-label">読み込み中...</div>
      </div>
    </div>
    <div id="msg">読み込み中...</div>
    <div id="closed" class="card step"><div style="text-align:center;color:#6b7280;">現在、希望休の受付期間ではありません。</div></div>

    <div id="step1" class="step">
      <div class="card">
        <div class="step-title"><span class="num">1</span>社員番号を入力してください</div>
        <input id="emp-no" class="big-input" type="tel" inputmode="numeric" autocomplete="off" placeholder="12345678" maxlength="12" oninput="this.value = toHalfWidth(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();lookup();}">
        <div class="input-hint">半角・全角どちらでも入力できます</div>
        <button class="big-btn primary" onclick="lookup()" id="lookup-btn">次へ進む →</button>
        <div id="lookup-err" class="err" style="display:none;"></div>
      </div>
    </div>

    <div id="step2" class="step">
      <div class="card name-confirm">
        <div class="step-title" style="justify-content:center;"><span class="num">2</span>お名前の確認</div>
        <div style="font-size:14px;color:#6b7280;">このお名前で間違いありませんか？</div>
        <div class="nm" id="confirm-name"></div>
        <button class="big-btn green" onclick="goStep3()">はい、これで進みます</button>
        <button class="big-btn secondary" onclick="backToStep1()">いいえ、番号を入力し直す</button>
      </div>
    </div>

    <div id="step3" class="step">
      <div class="card cal-card">
        <div class="cal-title">休みたい日をタップしてください</div>
        <div class="hint">タップした日が<b>赤く</b>なれば希望休として登録されます。もう一度タップすると解除できます。</div>
        <div class="cal-grid" id="cal-dow"></div>
        <div class="cal-grid" id="cal-grid" style="margin-top:5px;"></div>
      </div>
      <div class="card">
        <div style="font-size:15px;font-weight:700;color:#1e3a5f;">その他要望（自由記入・任意）</div>
        <textarea id="remark" rows="4" placeholder="例: 〇〇の日は都合がつけば休みたいです"></textarea>
      </div>
      <div class="card">
        <div class="hint">タップした希望休と、その他要望をまとめて担当者にお知らせします。下の「この内容で送信」ボタンを押すと担当者に送られます（何度でも送信し直せます）。</div>
        <div id="submit-err" class="err" style="display:none;"></div>
      </div>
    </div>
  </div>

  <div class="submit-bar" id="submit-bar">
    <div class="inner">
      <button class="big-btn green" onclick="submitReport()" id="submit-btn">この内容で送信</button>
    </div>
  </div>

  <div id="toast"></div>

<script>
var WD = ['月','火','水','木','金','土','日'];
var _member = null;      // {id, name}
var _empNo = '';         // ロックアップ時の社員番号。以後の全リクエストで本人確認に使う
var _periodStart = '', _periodEnd = '';
var _wishSet = {};       // date -> wishId

function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function showStep(id) {
  ['msg','closed','step1','step2','step3'].forEach(function(s) {
    document.getElementById(s).style.display = (s === id) ? (s === 'msg' || s === 'closed' ? 'block' : 'block') : 'none';
  });
  var onStep3 = (id === 'step3');
  document.getElementById('submit-bar').classList.toggle('show', onStep3);
  document.body.classList.toggle('has-submit-bar', onStep3);
}
function toast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg; el.style.display = 'block';
  setTimeout(function() { el.style.display = 'none'; }, 2500);
}

async function init() {
  try {
    var res = await fetch('/api/public/kancho-wish/status');
    var d = await res.json();
    if (!d.open) {
      document.getElementById('period-label').textContent = '現在は受付期間ではありません';
      showStep('closed');
      return;
    }
    document.getElementById('period-label').textContent = d.label + 'の希望休を受け付け中';
    showStep('step1');
    setTimeout(function() { var el = document.getElementById('emp-no'); if (el) el.focus(); }, 50);
  } catch (e) {
    document.getElementById('period-label').textContent = '';
    document.getElementById('msg').textContent = '読み込みに失敗しました。時間をおいて再度お試しください。';
  }
}

function toHalfWidth(s) {
  return s.replace(/[０-９]/g, function(ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); });
}
async function lookup() {
  var empNo = toHalfWidth(document.getElementById('emp-no').value.trim());
  var errEl = document.getElementById('lookup-err');
  var btn = document.getElementById('lookup-btn');
  errEl.style.display = 'none';
  if (!empNo) { errEl.textContent = '社員番号を入力してください'; errEl.style.display = 'block'; return; }
  btn.disabled = true; btn.textContent = '確認中...';
  try {
    var res = await fetch('/api/public/kancho-wish/lookup?emp_no=' + encodeURIComponent(empNo));
    var d = await res.json();
    if (!res.ok) { errEl.textContent = d.error || '見つかりませんでした'; errEl.style.display = 'block'; return; }
    _member = { id: d.id, name: d.name };
    _empNo = empNo;
    _periodStart = d.periodStart; _periodEnd = d.periodEnd;
    document.getElementById('confirm-name').textContent = d.name + ' さん';
    showStep('step2');
  } catch (e) {
    errEl.textContent = '確認に失敗しました。もう一度お試しください'; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = '次へ進む →';
  }
}
function backToStep1() {
  _member = null;
  _empNo = '';
  document.getElementById('emp-no').value = '';
  showStep('step1');
  setTimeout(function() { var el = document.getElementById('emp-no'); if (el) el.focus(); }, 50);
}

async function goStep3() {
  showStep('step3');
  renderCalHeader();
  document.getElementById('cal-grid').innerHTML = '読み込み中...';
  try {
    var res = await fetch('/api/public/kancho-wish?member_id=' + _member.id + '&emp_no=' + encodeURIComponent(_empNo));
    var d = await res.json();
    _wishSet = {};
    (d.wishes || []).forEach(function(w) { _wishSet[w.date] = w.id; });
  } catch (e) { _wishSet = {}; }
  renderCal();
  loadRemark();
}
function renderCalHeader() {
  document.getElementById('cal-dow').innerHTML = WD.map(function(w) { return '<div class="cal-dow">' + w + '</div>'; }).join('');
}
function fmtDate(d) {
  var y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), day = ('0' + d.getDate()).slice(-2);
  return y + '-' + m + '-' + day;
}
function buildGridDates() {
  var s = new Date(_periodStart + 'T00:00:00');
  var sDow = s.getDay(); // 0=日..6=土
  var backToMon = (sDow === 0) ? 6 : sDow - 1;
  s.setDate(s.getDate() - backToMon);
  var e = new Date(_periodEnd + 'T00:00:00');
  var eDow = e.getDay();
  var fwdToSun = (eDow === 0) ? 0 : 7 - eDow;
  e.setDate(e.getDate() + fwdToSun);
  var out = [];
  var cur = new Date(s);
  while (cur <= e) { out.push(fmtDate(cur)); cur.setDate(cur.getDate() + 1); }
  return out;
}
function renderCal() {
  var dates = buildGridDates();
  document.getElementById('cal-grid').innerHTML = dates.map(function(dt) {
    var inPeriod = dt >= _periodStart && dt <= _periodEnd;
    if (!inPeriod) return '<div class="cal-cell pad"></div>';
    var t = new Date(dt + 'T00:00:00');
    var label = (t.getMonth() + 1) + '/' + t.getDate();
    var cls = 'cal-cell' + (label.length >= 5 ? ' len5' : (label.length >= 4 ? ' len4' : '')) + (_wishSet[dt] ? ' wish' : '');
    return '<div class="' + cls + '" data-date="' + dt + '" onclick="toggleDate(this)">' + label + '</div>';
  }).join('');
}
async function toggleDate(el) {
  var date = el.dataset.date;
  el.classList.add('loading');
  try {
    if (_wishSet[date]) {
      var res = await fetch('/api/public/kancho-wish/' + _wishSet[date] + '?member_id=' + _member.id + '&emp_no=' + encodeURIComponent(_empNo), { method: 'DELETE' });
      if (!res.ok) throw new Error();
      delete _wishSet[date];
      el.classList.remove('wish');
      toast('取り消しました');
    } else {
      var res2 = await fetch('/api/public/kancho-wish', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ member_id: _member.id, date: date, emp_no: _empNo })
      });
      var dd = await res2.json().catch(function() { return {}; });
      if (!res2.ok) throw new Error(dd.error || '');
      _wishSet[date] = dd.id;
      el.classList.add('wish');
      toast('登録しました');
    }
  } catch (e) {
    alert('保存に失敗しました。もう一度お試しください。');
  } finally {
    el.classList.remove('loading');
  }
}
async function loadRemark() {
  try {
    var res = await fetch('/api/public/kancho-wish/remarks?member_id=' + _member.id + '&emp_no=' + encodeURIComponent(_empNo));
    var d = await res.json();
    document.getElementById('remark').value = d.content || '';
  } catch (e) {}
}
async function submitReport() {
  var btn = document.getElementById('submit-btn');
  var errEl = document.getElementById('submit-err');
  errEl.style.display = 'none';
  btn.disabled = true; btn.textContent = '送信中...';
  try {
    var res = await fetch('/api/public/kancho-wish/submit', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ member_id: _member.id, remark: document.getElementById('remark').value, emp_no: _empNo })
    });
    var d = await res.json().catch(function() { return {}; });
    if (!res.ok) { errEl.textContent = d.error || '送信に失敗しました'; errEl.style.display = 'block'; return; }
    toast('送信しました');
  } catch (e) {
    errEl.textContent = '送信に失敗しました。もう一度お試しください'; errEl.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'この内容で送信';
  }
}

init();
</script>
</body>
</html>`);
});

export default app;
