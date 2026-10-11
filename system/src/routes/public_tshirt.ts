// 期間限定 オリジナルTシャツ注文（公開・注文ページ）
// ログイン不要。共有URL {TSHIRT_PATH} を開き、社員番号（employees と照合）→ サイズ を登録する。
// 社員番号がない人は名前を入力して登録する。同じ社員番号（名前のみの人は同じ名前）で登録し直すとサイズを上書き。
// ページ: {TSHIRT_PATH}    API: /api/public/tshirt/*
// 認証は一切行わない。書き込みは tshirt_orders の登録・上書きに限定する。
// 管理側（設定 → 期間限定 オリジナルTシャツ）は routes/admin_tshirt.ts を参照。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { TSHIRT_PATH } from '../config';
import { FAVICON_DATA_URI } from '../html/layout';

const app = new Hono<{ Bindings: Env }>();

export type TshirtSettings = {
  title: string; description: string; sizes: string[]; deadline: string; is_open: number;
};

export async function loadTshirtSettings(db: D1Database): Promise<TshirtSettings> {
  const row = await db.prepare('SELECT title, description, sizes, deadline, is_open FROM tshirt_settings WHERE id = 1')
    .first<{ title: string; description: string; sizes: string; deadline: string; is_open: number }>();
  let sizes: string[] = [];
  try { sizes = JSON.parse(row?.sizes ?? '[]'); } catch { sizes = []; }
  return {
    title: row?.title ?? 'オリジナルTシャツ注文',
    description: row?.description ?? '',
    sizes: Array.isArray(sizes) ? sizes.map(String) : [],
    deadline: row?.deadline ?? '',
    is_open: row?.is_open ?? 0,
  };
}

// 日本時間の現在時刻を 'YYYY-MM-DDTHH:MM' で（締切の比較用）
function nowJst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16);
}

export function isTshirtAccepting(s: TshirtSettings): boolean {
  if (!s.is_open) return false;
  if (s.deadline && nowJst() > s.deadline) return false;
  return true;
}

function toHalfWidth(s: string): string {
  return s.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}
// 名前の照合用（前後の空白を除き、途中の全角/半角スペースは1つの半角スペースにそろえる）
export function normalizeName(s: string): string {
  return s.replace(/[\s　]+/g, ' ').trim().slice(0, 40);
}

type Who = { emp_no: string; name: string } | { error: string };

async function resolveWho(db: D1Database, b: { emp_no?: string; name?: string }): Promise<Who> {
  const empNo = toHalfWidth(String(b.emp_no ?? '').trim());
  if (empNo) {
    const emp = await db.prepare('SELECT emp_no, name FROM employees WHERE emp_no = ? AND is_active = 1')
      .bind(empNo).first<{ emp_no: string; name: string }>();
    if (!emp) return { error: '社員番号が確認できませんでした。番号をご確認ください（社員番号がない方は「お名前で登録」から登録できます）' };
    return { emp_no: emp.emp_no, name: emp.name };
  }
  const name = normalizeName(String(b.name ?? ''));
  if (!name) return { error: '社員番号またはお名前を入力してください' };
  return { emp_no: '', name };
}

async function findOrder(db: D1Database, who: { emp_no: string; name: string }) {
  return who.emp_no
    ? db.prepare('SELECT id, size FROM tshirt_orders WHERE emp_no = ?').bind(who.emp_no).first<{ id: number; size: string }>()
    : db.prepare("SELECT id, size FROM tshirt_orders WHERE emp_no = '' AND name = ?").bind(who.name).first<{ id: number; size: string }>();
}

// ===== API =====
app.get('/api/public/tshirt', async (c) => {
  const s = await loadTshirtSettings(c.env.DB);
  return c.json({ title: s.title, description: s.description, sizes: s.sizes, deadline: s.deadline, open: isTshirtAccepting(s) });
});

// 本人確認（名前の表示と、登録済みならそのサイズ）
app.post('/api/public/tshirt/lookup', async (c) => {
  const b = await c.req.json<{ emp_no?: string; name?: string }>().catch(() => ({}));
  const who = await resolveWho(c.env.DB, b);
  if ('error' in who) return c.json({ error: who.error }, 404);
  const cur = await findOrder(c.env.DB, who);
  return c.json({ name: who.name, by_emp: !!who.emp_no, current_size: cur?.size ?? null });
});

// 注文の登録・上書き
app.post('/api/public/tshirt/order', async (c) => {
  const s = await loadTshirtSettings(c.env.DB);
  if (!isTshirtAccepting(s)) return c.json({ error: '受付は終了しました' }, 400);
  const b = await c.req.json<{ emp_no?: string; name?: string; size?: string }>().catch(() => ({} as { emp_no?: string; name?: string; size?: string }));
  const who = await resolveWho(c.env.DB, b);
  if ('error' in who) return c.json({ error: who.error }, 404);
  const size = String(b.size ?? '');
  if (!s.sizes.includes(size)) return c.json({ error: 'サイズを選んでください' }, 400);
  const cur = await findOrder(c.env.DB, who);
  if (cur) {
    await c.env.DB.prepare("UPDATE tshirt_orders SET name = ?, size = ?, updated_at = datetime('now','localtime') WHERE id = ?")
      .bind(who.name, size, cur.id).run();
  } else {
    await c.env.DB.prepare('INSERT INTO tshirt_orders (emp_no, name, size) VALUES (?, ?, ?)')
      .bind(who.emp_no, who.name, size).run();
  }
  return c.json({ ok: true, name: who.name, size, updated: !!cur });
});

// ===== ページ =====
app.get(TSHIRT_PATH, (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>オリジナルTシャツ注文</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #f1f5f9; }
  body { font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #1f2937; }
  .wrap { max-width: 520px; margin: 0 auto; padding: 18px 16px 60px; }
  .head { text-align: center; padding: 14px 0 18px; }
  .head h1 { font-size: 20px; color: #1e3a5f; margin: 0 0 6px; }
  .head .dl { font-size: 12px; color: #b45309; font-weight: 700; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px 16px; margin-bottom: 14px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
  .card h2 { font-size: 14px; color: #1e3a5f; margin: 0 0 12px; }
  .desc { font-size: 13px; color: #374151; white-space: pre-wrap; line-height: 1.7; }
  label.f { display: block; font-size: 12px; color: #6b7280; margin-bottom: 6px; }
  input.t { width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; font-size: 18px; font-family: inherit; }
  .btn { display: block; width: 100%; padding: 14px; border: none; border-radius: 10px; background: #1e3a5f; color: #fff; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 12px; font-family: inherit; }
  .btn:disabled { background: #9ca3af; cursor: default; }
  .link { display: block; text-align: center; margin-top: 14px; font-size: 13px; color: #2563eb; background: none; border: none; width: 100%; cursor: pointer; text-decoration: underline; font-family: inherit; }
  .err { color: #dc2626; font-size: 13px; margin-top: 10px; }
  .who { font-size: 17px; font-weight: 700; color: #1e3a5f; margin-bottom: 4px; }
  .cur { font-size: 13px; color: #b45309; margin-bottom: 12px; }
  .sizes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .sz { padding: 16px 4px; border: 2px solid #d1d5db; border-radius: 10px; background: #fff; font-size: 18px; font-weight: 700; color: #374151; cursor: pointer; font-family: inherit; }
  .sz.on { border-color: #1e3a5f; background: #1e3a5f; color: #fff; }
  .done { text-align: center; padding: 10px 0; }
  .done .big { font-size: 40px; font-weight: 800; color: #1e3a5f; margin: 8px 0; }
  .closed { text-align: center; color: #6b7280; font-size: 14px; padding: 20px 0; }
  .hidden { display: none; }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <h1 id="title">オリジナルTシャツ注文</h1>
    <div class="dl" id="deadline"></div>
  </div>
  <div class="card hidden" id="desc-card"><div class="desc" id="desc"></div></div>
  <div id="main"><div class="card" style="text-align:center;color:#9ca3af;">読み込み中...</div></div>
</div>
<script>
var API = '/api/public/tshirt';
var CONF = null;
var WHO = null;   // { emp_no, name, by_emp, current_size }
var SIZE = '';

function escH(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
function fmtDeadline(s) {
  var m = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})$/.exec(s || '');
  if (!m) return '';
  return Number(m[2]) + '月' + Number(m[3]) + '日 ' + m[4] + ':' + m[5] + ' 締切';
}
function main(html) { document.getElementById('main').innerHTML = html; }

async function init() {
  var res = await fetch(API);
  CONF = await res.json().catch(function() { return null; });
  if (!res.ok || !CONF) { main('<div class="card closed">読み込みに失敗しました。時間をおいて開き直してください</div>'); return; }
  document.getElementById('title').textContent = CONF.title;
  document.title = CONF.title;
  document.getElementById('deadline').textContent = fmtDeadline(CONF.deadline);
  if (CONF.description) {
    document.getElementById('desc').textContent = CONF.description;
    document.getElementById('desc-card').classList.remove('hidden');
  }
  if (!CONF.open) { main('<div class="card closed">【受付終了】<br>注文の受付は終了しました</div>'); return; }
  showEmp();
}

function showEmp() {
  WHO = null; SIZE = '';
  main('<div class="card"><h2>1. 社員番号を入力</h2>'
    + '<input class="t" id="emp" type="text" inputmode="numeric" autocomplete="off" placeholder="社員番号">'
    + '<div class="err" id="err"></div>'
    + '<button class="btn" id="go" onclick="lookup({ emp_no: document.getElementById(\\'emp\\').value })">次へ</button>'
    + '<button class="link" onclick="showName()">社員番号がない方はこちら（お名前で登録）</button></div>');
  document.getElementById('emp').addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('go').click(); });
}

function showName() {
  main('<div class="card"><h2>1. お名前を入力</h2>'
    + '<label class="f">フルネームで入力してください（例: 板橋 太郎）</label>'
    + '<input class="t" id="nm" type="text" maxlength="40" autocomplete="name" placeholder="お名前">'
    + '<div class="err" id="err"></div>'
    + '<button class="btn" id="go" onclick="lookup({ name: document.getElementById(\\'nm\\').value })">次へ</button>'
    + '<button class="link" onclick="showEmp()">社員番号で登録する</button></div>');
  document.getElementById('nm').addEventListener('keydown', function(e) { if (e.key === 'Enter') document.getElementById('go').click(); });
}

async function lookup(body) {
  var btn = document.getElementById('go');
  var err = document.getElementById('err');
  err.textContent = '';
  if (!String(body.emp_no || body.name || '').trim()) { err.textContent = body.name !== undefined ? 'お名前を入力してください' : '社員番号を入力してください'; return; }
  btn.disabled = true;
  var res = await fetch(API + '/lookup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(function() { return null; });
  var d = res ? await res.json().catch(function() { return {}; }) : {};
  btn.disabled = false;
  if (!res || !res.ok) { err.textContent = d.error || '通信エラーが発生しました'; return; }
  WHO = { emp_no: body.emp_no || '', name: d.by_emp ? d.name : (body.name || ''), label: d.name, current_size: d.current_size };
  SIZE = d.current_size || '';
  showSize();
}

function showSize() {
  var html = '<div class="card"><h2>2. サイズを選択</h2>'
    + '<div class="who">' + escH(WHO.label) + ' さん</div>'
    + (WHO.current_size ? '<div class="cur">登録済みのサイズ: 【' + escH(WHO.current_size) + '】 選び直すと変更できます</div>' : '<div style="height:8px;"></div>')
    + '<div class="sizes">'
    + CONF.sizes.map(function(s, i) { return '<button class="sz' + (s === SIZE ? ' on' : '') + '" onclick="pick(' + i + ')">' + escH(s) + '</button>'; }).join('')
    + '</div>'
    + '<div class="err" id="err"></div>'
    + '<button class="btn" id="go" onclick="submitOrder()"' + (SIZE ? '' : ' disabled') + '>' + (WHO.current_size ? 'この内容で変更する' : 'この内容で登録する') + '</button>'
    + '<button class="link" onclick="' + (WHO.emp_no ? 'showEmp()' : 'showName()') + '">戻る</button></div>';
  main(html);
}

function pick(i) { SIZE = CONF.sizes[i]; showSize(); }

async function submitOrder() {
  var btn = document.getElementById('go');
  var err = document.getElementById('err');
  btn.disabled = true;
  var body = WHO.emp_no ? { emp_no: WHO.emp_no, size: SIZE } : { name: WHO.name, size: SIZE };
  var res = await fetch(API + '/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(function() { return null; });
  var d = res ? await res.json().catch(function() { return {}; }) : {};
  if (!res || !res.ok) { btn.disabled = false; err.textContent = d.error || '通信エラーが発生しました'; return; }
  main('<div class="card done">'
    + '<div style="font-size:14px;color:#16a34a;font-weight:700;">' + (d.updated ? '変更しました' : '登録しました') + '</div>'
    + '<div style="font-size:15px;margin-top:10px;">' + escH(d.name) + ' さん</div>'
    + '<div class="big">' + escH(d.size) + '</div>'
    + '<div style="font-size:12px;color:#6b7280;">変更したいときは、もう一度このページから登録し直してください</div>'
    + '<button class="btn" onclick="showEmp()">続けて別の人を登録する</button></div>');
}

init();
</script>
</body>
</html>`);
});

export default app;
