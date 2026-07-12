// 売上サマリー LIFF ページ & API
// /liff/sales        : 本人の売上記録（入力フォーム・タブ切替で月次サマリー/グラフ/PDF）
// /api/liff/sales/*  : LIFFアクセストークン認証API
//
// 権限: crew_member / newcomer / benten_member / benten_shift_master / general_manager（line_bot.tsのSALES_ODO_ROLESと同じ）
//       それ以外（運行管理者・車番管理者・権限不明者）は403
// 常に「本人分のみ」表示（他者閲覧機能は今回のスコープ外）

import { Hono } from 'hono';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Env } from '../auth';
import { getPeriod, getPeriodRange, getPeriodSettings } from '../auth';
import { bentenUidFromRequest, loadBentenFont } from '../benten';

const app = new Hono<{ Bindings: Env }>();

const SALES_ODO_ROLES = ['crew_member', 'newcomer', 'benten_member', 'benten_shift_master', 'general_manager'];
const DUTY_CODES = ['a', 'b', 'B', 'D', 'H'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Auth = { uid: string; empId: number; empName: string };

async function salesAuth(c: { req: { raw: Request }; env: Env }): Promise<Auth | null> {
  const uid = await bentenUidFromRequest(c.req.raw);
  if (!uid) return null;
  const row = await c.env.DB.prepare(
    'SELECT lu.role AS role, lu.emp_id AS emp_id, e.name AS name FROM line_liff_users lu LEFT JOIN employees e ON e.id = lu.emp_id WHERE lu.line_uid = ?'
  ).bind(uid).first<{ role: string; emp_id: number | null; name: string | null }>();
  if (!row || !SALES_ODO_ROLES.includes(row.role) || !row.emp_id) return null;
  return { uid, empId: row.emp_id, empName: row.name ?? '' };
}

type DailyRow = { date: string; amount: number; ride_count: number | null; duty_code: string | null };

function dutyWeight(dutyCode: string | null): number {
  if (!dutyCode) return 1.0;
  return dutyCode === dutyCode.toUpperCase() ? 1.0 : 0.5;
}

function dutyLabel(dutyCode: string | null): string {
  const map: Record<string, string> = { a: '昼日勤', b: '夜日勤', B: '隔日B', D: '隔日D', H: '隔日H' };
  return dutyCode ? (map[dutyCode] ?? dutyCode) : '—';
}

async function loadSummary(env: Env, empId: number, year: number, month: number) {
  const settings = await getPeriodSettings(env.DB);
  const { start, end } = getPeriodRange(year, month, settings);

  const rowsRes = await env.DB.prepare(
    'SELECT date, amount, ride_count, duty_code FROM sales_records WHERE emp_id = ? AND date >= ? AND date <= ? ORDER BY date'
  ).bind(empId, start, end).all<DailyRow>();
  const rows = rowsRes.results ?? [];

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const totalAmountExcl = Math.round(totalAmount / 1.1);
  const totalCount = rows.reduce((s, r) => s + dutyWeight(r.duty_code), 0);
  const workingDays = rows.length;
  const avgAmount = workingDays > 0 ? Math.round(totalAmount / workingDays) : 0;

  // 走行距離はODOのその場記録のみ（LINE返信後にレコードを削除する設計のため月次集計は行わない）
  return { start, end, rows, totalAmount, totalAmountExcl, totalCount, workingDays, avgAmount };
}

// ===================================================
// LIFF ページ
// ===================================================
app.get('/liff/sales', (c) => {
  const liffId = c.env.LIFF_ID_SALES ?? '';
  return c.html(salesPageHtml(liffId));
});

// ===================================================
// API: 売上記録の1件取得・登録（入力フォーム用）
// ===================================================
app.get('/api/liff/sales/entry', async (c) => {
  const auth = await salesAuth(c);
  if (!auth) return c.json({ error: 'forbidden' }, 403);

  const date = c.req.query('date') ?? '';
  if (!DATE_RE.test(date)) return c.json({ error: '日付フォーマットエラー' }, 400);

  const row = await c.env.DB.prepare(
    'SELECT amount, ride_count, duty_code FROM sales_records WHERE emp_id = ? AND date = ?'
  ).bind(auth.empId, date).first<{ amount: number; ride_count: number | null; duty_code: string | null }>();

  if (!row) return c.json({ exists: false, empName: auth.empName });
  return c.json({ exists: true, amount: row.amount, rideCount: row.ride_count, dutyCode: row.duty_code, empName: auth.empName });
});

app.post('/api/liff/sales/entry', async (c) => {
  const auth = await salesAuth(c);
  if (!auth) return c.json({ error: 'forbidden' }, 403);

  const data = await c.req.json<{ date?: string; dutyCode?: string; amount?: number; rideCount?: number | null }>();

  if (!data.date || !DATE_RE.test(data.date)) return c.json({ error: '日付を正しく入力してください' }, 400);
  if (!data.dutyCode || !DUTY_CODES.includes(data.dutyCode)) return c.json({ error: '区分を選択してください' }, 400);
  const amount = Number(data.amount);
  if (!Number.isInteger(amount) || amount < 0 || amount > 999999) return c.json({ error: '金額を正しく入力してください（0〜999999円）' }, 400);
  let rideCount: number | null = null;
  if (data.rideCount !== null && data.rideCount !== undefined && String(data.rideCount) !== '') {
    rideCount = Number(data.rideCount);
    if (!Number.isInteger(rideCount) || rideCount < 0 || rideCount > 999) return c.json({ error: '乗車回数を正しく入力してください（0〜999回）' }, 400);
  }

  const { year, month } = getPeriod(data.date);
  await c.env.DB.prepare(`
    INSERT INTO sales_records (emp_id, date, amount, ride_count, duty_code, period_year, period_month, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    ON CONFLICT(emp_id, date) DO UPDATE SET
      amount = excluded.amount, ride_count = excluded.ride_count, duty_code = excluded.duty_code,
      period_year = excluded.period_year, period_month = excluded.period_month, updated_at = datetime('now', 'localtime')
  `).bind(auth.empId, data.date, amount, rideCount, data.dutyCode, year, month).run();

  return c.json({ ok: true, amountExcl: Math.round(amount / 1.1) });
});

// ===================================================
// API: 月次サマリー
// ===================================================
app.get('/api/liff/sales/summary', async (c) => {
  const auth = await salesAuth(c);
  if (!auth) return c.json({ error: 'forbidden' }, 403);

  const year = parseInt(c.req.query('year') ?? '0');
  const month = parseInt(c.req.query('month') ?? '0');
  if (!year || !month) return c.json({ error: 'パラメータ不足' }, 400);

  const s = await loadSummary(c.env, auth.empId, year, month);
  return c.json({
    empName: auth.empName,
    year, month, start: s.start, end: s.end,
    totalAmount: s.totalAmount,
    totalAmountExcl: s.totalAmountExcl,
    totalCount: s.totalCount,
    workingDays: s.workingDays,
    avgAmount: s.avgAmount,
    totalDistance: s.totalDistance,
    daily: s.rows.map(r => ({ date: r.date, amount: r.amount, rideCount: r.ride_count, dutyLabel: dutyLabel(r.duty_code) })),
  });
});

// ===================================================
// API: 月次PDF（常にBearer認証済みfetchのみ。公開トークン不要）
// ===================================================
app.get('/api/liff/sales/pdf', async (c) => {
  const auth = await salesAuth(c);
  if (!auth) return c.json({ error: 'forbidden' }, 403);

  const year = parseInt(c.req.query('year') ?? '0');
  const month = parseInt(c.req.query('month') ?? '0');
  if (!year || !month) return c.json({ error: 'パラメータ不足' }, 400);

  const s = await loadSummary(c.env, auth.empId, year, month);
  const fontBytes = await loadBentenFont(c.env);
  if (!fontBytes) return c.text('PDF未設定（フォントが設定されていません）', 503);

  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: false }); // subset:true はCJKでグリフ欠けするため禁止

  const PW = 595.28, PH = 841.89, M = 40; // A4縦
  const page = pdf.addPage([PW, PH]);
  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.45, 0.45, 0.45);
  let y = PH - M;

  page.drawText(`売上サマリー — ${auth.empName}`, { x: M, y, size: 16, font, color: black });
  y -= 20;
  page.drawText(`${year}年${month}月度（${s.start} 〜 ${s.end}）`, { x: M, y, size: 11, font, color: gray });
  y -= 28;

  const summaryLines = [
    `税込合計: ${s.totalAmount.toLocaleString('ja-JP')}円　　税抜合計: ${s.totalAmountExcl.toLocaleString('ja-JP')}円`,
    `実働カウント: ${s.totalCount}　　乗務日数: ${s.workingDays}日　　平均日商: ${s.avgAmount.toLocaleString('ja-JP')}円`,
    `走行距離（ODO集計）: ${s.totalDistance.toLocaleString('ja-JP')}km`,
  ];
  for (const line of summaryLines) {
    page.drawText(line, { x: M, y, size: 11, font, color: black });
    y -= 18;
  }
  y -= 10;

  page.drawText('日付', { x: M, y, size: 10, font, color: gray });
  page.drawText('区分', { x: M + 70, y, size: 10, font, color: gray });
  page.drawText('売上(税込)', { x: M + 140, y, size: 10, font, color: gray });
  page.drawText('乗車回数', { x: M + 230, y, size: 10, font, color: gray });
  y -= 14;
  page.drawLine({ start: { x: M, y: y + 4 }, end: { x: PW - M, y: y + 4 }, thickness: 0.5, color: gray });

  for (const r of s.rows) {
    if (y < M + 20) break; // 1ページに収まる範囲のみ（今回のスコープでは複数ページ対応は行わない）
    page.drawText(r.date, { x: M, y, size: 9, font, color: black });
    page.drawText(dutyLabel(r.duty_code), { x: M + 70, y, size: 9, font, color: black });
    page.drawText(r.amount.toLocaleString('ja-JP') + '円', { x: M + 140, y, size: 9, font, color: black });
    page.drawText(String(r.ride_count ?? '—'), { x: M + 230, y, size: 9, font, color: black });
    y -= 14;
  }

  const bytes = await pdf.save();
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="sales_${year}_${month}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
});

// ===================================================
// HTML
// ===================================================
function salesPageHtml(liffId: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>売上記録</title>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js" crossorigin="anonymous"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { margin: 0; padding: 0 0 32px; background: #f0f4f8; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; font-size: 15px; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: #6b7280; font-size: 14px; }
    .header { background: #1e3a5f; color: white; padding: 12px 16px; }
    .header h1 { margin: 0; font-size: 16px; font-weight: 700; }
    .header .sub { font-size: 11px; opacity: 0.8; margin-top: 2px; }
    .tabs { display: flex; background: white; border-bottom: 1px solid #e5e7eb; }
    .tab { flex: 1; text-align: center; padding: 12px 8px; font-size: 14px; font-weight: 600; color: #6b7280; border: none; background: transparent; cursor: pointer; border-bottom: 3px solid transparent; }
    .tab.active { color: #1e3a5f; border-bottom-color: #1e3a5f; }

    .page { max-width: 520px; margin: 0 auto; padding: 16px; }
    .card { background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card-title { font-size: 13px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .field { margin-bottom: 12px; }
    .field:last-child { margin-bottom: 0; }
    label { display: block; font-size: 13px; color: #374151; margin-bottom: 5px; font-weight: 500; }
    input[type=text], input[type=date] {
      width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px;
      font-size: 15px; font-family: inherit; background: #f9fafb; color: #111827;
      -webkit-appearance: none; appearance: none; outline: none;
    }
    input:focus { border-color: #1e3a5f; background: white; }
    .toggle-group { display: flex; gap: 8px; flex-wrap: wrap; }
    .toggle-btn { padding: 10px 14px; border: 2px solid #d1d5db; border-radius: 8px; background: white; color: #374151; font-size: 14px; font-weight: 600; cursor: pointer; }
    .toggle-btn.active { border-color: #1e3a5f; background: #eef2f7; color: #1e3a5f; }
    .existing-note { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px 12px; font-size: 13px; color: #92400e; margin-bottom: 12px; display: none; }
    .btn-submit { width: 100%; background: #1e3a5f; color: white; border: none; border-radius: 12px; padding: 15px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 4px; }
    .btn-submit:disabled { background: #9ca3af; }
    .success { text-align: center; padding: 32px 16px; }
    .success-icon { font-size: 48px; margin-bottom: 16px; }
    .success-title { font-size: 20px; font-weight: 700; color: #1e3a5f; margin-bottom: 8px; }
    .success-summary { background: #f0f4f8; border: 1px solid #d1d5db; border-radius: 8px; padding: 14px; text-align: left; font-size: 13px; color: #374151; white-space: pre-line; margin: 16px 0; line-height: 1.7; }
    .btn-close { background: #f3f4f6; color: #374151; border: none; border-radius: 10px; padding: 12px 24px; font-size: 14px; font-weight: 600; cursor: pointer; }

    .nav { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: white; border-bottom: 1px solid #e5e7eb; }
    .nav button { border: 1px solid #d1d5db; background: white; border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer; }
    .nav .ym { font-size: 14px; font-weight: 700; color: #1e3a5f; }
    .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px; }
    .cards .card { padding: 12px; margin-bottom: 0; }
    .cards .card .label { font-size: 11px; color: #6b7280; margin-bottom: 4px; }
    .cards .card .val { font-size: 17px; font-weight: 700; color: #1e3a5f; }
    .chart-wrap { background: white; margin: 0 12px; border-radius: 10px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .pdf-btn { display: block; width: calc(100% - 24px); margin: 12px auto 0; background: #1e3a5f; color: white; border: none; border-radius: 8px; padding: 12px; font-size: 14px; font-weight: 700; cursor: pointer; }

    .err-page { text-align: center; padding: 60px 24px; color: #6b7280; }
    .err-page .icon { font-size: 44px; margin-bottom: 12px; }
    .toast { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); background: #1e3a5f; color: white; padding: 9px 18px; border-radius: 20px; font-size: 13px; z-index: 50; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>
  <div id="loading">読み込み中...</div>
  <div id="err" style="display:none;" class="err-page">
    <div class="icon">⚠️</div>
    <div id="err-msg"></div>
  </div>
  <div id="app" style="display:none;">
    <div class="header">
      <h1>売上記録</h1>
      <div class="sub" id="emp-name"></div>
    </div>
    <div class="tabs">
      <button class="tab active" id="tab-input" onclick="switchTab('input')">記録</button>
      <button class="tab" id="tab-summary" onclick="switchTab('summary')">サマリー</button>
    </div>

    <!-- ===== 記録タブ ===== -->
    <div id="view-input" class="page">
      <div class="card">
        <div class="card-title">日付</div>
        <div class="field">
          <input type="date" id="in-date" onchange="loadEntry()">
        </div>
      </div>

      <div id="existing-note" class="existing-note">この日はすでに記録されています。登録すると上書きされます。</div>

      <div class="card">
        <div class="card-title">区分</div>
        <div class="toggle-group">
          <button class="toggle-btn" data-code="a" onclick="setDuty('a')">昼日勤</button>
          <button class="toggle-btn" data-code="b" onclick="setDuty('b')">夜日勤</button>
          <button class="toggle-btn" data-code="B" onclick="setDuty('B')">隔日B</button>
          <button class="toggle-btn" data-code="D" onclick="setDuty('D')">隔日D</button>
          <button class="toggle-btn" data-code="H" onclick="setDuty('H')">隔日H</button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">売上・乗車回数</div>
        <div class="field">
          <label>売上金額（円・税込）</label>
          <input type="text" id="in-amount" inputmode="numeric" placeholder="例: 18500">
        </div>
        <div class="field">
          <label>乗車回数（任意）</label>
          <input type="text" id="in-rides" inputmode="numeric" placeholder="例: 8">
        </div>
      </div>

      <button class="btn-submit" id="btn-submit" onclick="submitEntry()">登録する</button>
    </div>

    <!-- ===== サマリータブ ===== -->
    <div id="view-summary" class="page" style="display:none;padding:0;">
      <div class="nav">
        <button onclick="moveMonth(-1)">◀ 前月度</button>
        <div class="ym" id="ym-label"></div>
        <button onclick="moveMonth(1)">次月度 ▶</button>
      </div>
      <div class="cards">
        <div class="card"><div class="label">税込合計</div><div class="val" id="v-amount"></div></div>
        <div class="card"><div class="label">税抜合計</div><div class="val" id="v-amount-excl"></div></div>
        <div class="card"><div class="label">実働カウント</div><div class="val" id="v-count"></div></div>
        <div class="card"><div class="label">平均日商</div><div class="val" id="v-avg"></div></div>
        <div class="card"><div class="label">乗務日数</div><div class="val" id="v-days"></div></div>
        <div class="card"><div class="label">走行距離(ODO)</div><div class="val" id="v-distance"></div></div>
      </div>
      <div class="chart-wrap"><canvas id="chart" height="160"></canvas></div>
      <button class="pdf-btn" onclick="downloadPdf()">PDFをダウンロード</button>
    </div>
  </div>
  <div class="toast" id="toast"></div>

  <script>
  var AT = '';
  var curYear = 0, curMonth = 0;
  var chartObj = null;
  var curDuty = null;
  var summaryLoaded = false;

  function jstToday() {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  }

  liff.init({ liffId: ${JSON.stringify(liffId || 'LIFF_ID_NOT_SET')} })
    .then(function() {
      AT = liff.getAccessToken() || '';
      var today = jstToday();
      curYear = parseInt(today.slice(0, 4));
      curMonth = parseInt(today.slice(5, 7));
      document.getElementById('in-date').value = today;
      var params = new URLSearchParams(location.search);
      if (params.get('tab') === 'summary') switchTab('summary');
      return loadEntry();
    })
    .then(function() {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('app').style.display = 'block';
    })
    .catch(function(err) {
      document.getElementById('loading').style.display = 'none';
      document.getElementById('err').style.display = 'block';
      if (err && err.status === 403) {
        document.getElementById('err-msg').textContent = 'この機能を利用する権限がありません。';
      } else {
        document.getElementById('err-msg').textContent = 'エラー: ' + (err && err.message ? err.message : '読み込みに失敗しました');
      }
    });

  function api(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    opts.headers['Authorization'] = 'Bearer ' + AT;
    if (opts.body) opts.headers['Content-Type'] = 'application/json';
    return fetch(path, opts).then(function(res) {
      if (!res.ok) {
        return res.json().catch(function() { return {}; }).then(function(j) {
          var e = new Error(j.error || ('HTTP ' + res.status));
          e.status = res.status;
          throw e;
        });
      }
      return res.json();
    });
  }

  function switchTab(tab) {
    document.getElementById('tab-input').classList.toggle('active', tab === 'input');
    document.getElementById('tab-summary').classList.toggle('active', tab === 'summary');
    document.getElementById('view-input').style.display = tab === 'input' ? 'block' : 'none';
    document.getElementById('view-summary').style.display = tab === 'summary' ? 'block' : 'none';
    if (tab === 'summary' && !summaryLoaded) {
      summaryLoaded = true;
      loadSummary();
    }
  }

  function setDuty(code) {
    curDuty = code;
    document.querySelectorAll('.toggle-btn').forEach(function(b) {
      b.classList.toggle('active', b.getAttribute('data-code') === code);
    });
  }

  function loadEntry() {
    var date = document.getElementById('in-date').value;
    if (!date) return Promise.resolve();
    return api('/api/liff/sales/entry?date=' + date).then(function(r) {
      if (r.empName) document.getElementById('emp-name').textContent = r.empName;
      var note = document.getElementById('existing-note');
      if (r.exists) {
        note.style.display = 'block';
        document.getElementById('in-amount').value = r.amount;
        document.getElementById('in-rides').value = r.rideCount != null ? r.rideCount : '';
        if (r.dutyCode) setDuty(r.dutyCode);
      } else {
        note.style.display = 'none';
        document.getElementById('in-amount').value = '';
        document.getElementById('in-rides').value = '';
        curDuty = null;
        document.querySelectorAll('.toggle-btn').forEach(function(b) { b.classList.remove('active'); });
      }
    });
  }

  function submitEntry() {
    var date = document.getElementById('in-date').value;
    var amount = document.getElementById('in-amount').value.replace(/[^0-9]/g, '');
    var rides = document.getElementById('in-rides').value.replace(/[^0-9]/g, '');
    if (!date) { toast('日付を選択してください'); return; }
    if (!curDuty) { toast('区分を選択してください'); return; }
    if (!amount) { toast('金額を入力してください'); return; }

    var btn = document.getElementById('btn-submit');
    btn.disabled = true;
    btn.textContent = '登録中...';

    api('/api/liff/sales/entry', {
      method: 'POST',
      body: JSON.stringify({ date: date, dutyCode: curDuty, amount: parseInt(amount, 10), rideCount: rides ? parseInt(rides, 10) : null }),
    }).then(function(r) {
      toast('✅ 登録しました（税抜 ' + r.amountExcl.toLocaleString('ja-JP') + '円）');
      document.getElementById('existing-note').style.display = 'block';
      summaryLoaded = false;
    }).catch(function(err) {
      toast(err.message || '登録に失敗しました');
    }).then(function() {
      btn.disabled = false;
      btn.textContent = '登録する';
    });
  }

  function moveMonth(delta) {
    curMonth += delta;
    if (curMonth < 1) { curMonth = 12; curYear--; }
    if (curMonth > 12) { curMonth = 1; curYear++; }
    loadSummary();
  }

  function loadSummary() {
    return api('/api/liff/sales/summary?year=' + curYear + '&month=' + curMonth).then(function(s) {
      document.getElementById('emp-name').textContent = s.empName;
      document.getElementById('ym-label').textContent = s.year + '年' + s.month + '月度';
      document.getElementById('v-amount').textContent = s.totalAmount.toLocaleString('ja-JP') + '円';
      document.getElementById('v-amount-excl').textContent = s.totalAmountExcl.toLocaleString('ja-JP') + '円';
      document.getElementById('v-count').textContent = s.totalCount;
      document.getElementById('v-avg').textContent = s.avgAmount.toLocaleString('ja-JP') + '円';
      document.getElementById('v-days').textContent = s.workingDays + '日';
      document.getElementById('v-distance').textContent = s.totalDistance.toLocaleString('ja-JP') + 'km';
      drawChart(s.daily);
    });
  }

  function drawChart(daily) {
    var labels = daily.map(function(d) { return d.date.slice(5); });
    var amounts = daily.map(function(d) { return d.amount; });
    if (chartObj) chartObj.destroy();
    chartObj = new Chart(document.getElementById('chart').getContext('2d'), {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: '日別売上(円)', data: amounts, backgroundColor: 'rgba(37,99,235,0.7)', borderRadius: 4 }] },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: function(v) { return v.toLocaleString('ja-JP') + '円'; } } } }
      }
    });
  }

  function downloadPdf() {
    fetch('/api/liff/sales/pdf?year=' + curYear + '&month=' + curMonth, { headers: { Authorization: 'Bearer ' + AT } })
      .then(function(res) {
        if (!res.ok) throw new Error('PDF生成に失敗しました');
        return res.blob();
      })
      .then(function(blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'sales_' + curYear + '_' + curMonth + '.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      })
      .catch(function(err) { toast(err.message || 'エラーが発生しました'); });
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function() { t.classList.remove('show'); }, 2200);
  }
  </script>
</body>
</html>`;
}

export default app;
