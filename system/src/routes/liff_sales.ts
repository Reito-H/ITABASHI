// 売上サマリー LIFF ページ & API
// /liff/sales        : 本人の月次売上サマリー（グラフ・PDF）
// /api/liff/sales/*  : LIFFアクセストークン認証API
//
// 権限: crew_member / newcomer / benten_member / benten_shift_master / general_manager（line_bot.tsのSALES_ODO_ROLESと同じ）
//       それ以外（運行管理者・車番管理者・権限不明者）は403
// 常に「本人分のみ」表示（他者閲覧機能は今回のスコープ外）

import { Hono } from 'hono';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Env } from '../auth';
import { getPeriodRange, getPeriodSettings } from '../auth';
import { bentenUidFromRequest, loadBentenFont } from '../benten';

const app = new Hono<{ Bindings: Env }>();

const SALES_ODO_ROLES = ['crew_member', 'newcomer', 'benten_member', 'benten_shift_master', 'general_manager'];

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

  const distRes = await env.DB.prepare(
    "SELECT COALESCE(SUM(distance_km), 0) AS total FROM odo_records WHERE emp_id = ? AND odo_end IS NOT NULL AND date(started_at) BETWEEN ? AND ?"
  ).bind(empId, start, end).first<{ total: number }>();

  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const totalAmountExcl = Math.round(totalAmount / 1.1);
  const totalCount = rows.reduce((s, r) => s + dutyWeight(r.duty_code), 0);
  const workingDays = rows.length;
  const avgAmount = workingDays > 0 ? Math.round(totalAmount / workingDays) : 0;
  const totalDistance = distRes?.total ?? 0;

  return { start, end, rows, totalAmount, totalAmountExcl, totalCount, workingDays, avgAmount, totalDistance };
}

// ===================================================
// LIFF ページ
// ===================================================
app.get('/liff/sales', (c) => {
  const liffId = c.env.LIFF_ID_SALES ?? '';
  return c.html(salesPageHtml(liffId));
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
  <title>売上サマリー</title>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js" crossorigin="anonymous"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { margin: 0; padding: 0 0 32px; background: #f0f4f8; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; font-size: 15px; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: #6b7280; font-size: 14px; }
    .header { background: #1e3a5f; color: white; padding: 12px 16px; }
    .header h1 { margin: 0; font-size: 16px; font-weight: 700; }
    .header .sub { font-size: 11px; opacity: 0.8; margin-top: 2px; }
    .nav { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: white; border-bottom: 1px solid #e5e7eb; }
    .nav button { border: 1px solid #d1d5db; background: white; border-radius: 8px; padding: 7px 14px; font-size: 13px; cursor: pointer; }
    .nav .ym { font-size: 14px; font-weight: 700; color: #1e3a5f; }
    .cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 12px; }
    .card { background: white; border-radius: 10px; padding: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .card .label { font-size: 11px; color: #6b7280; margin-bottom: 4px; }
    .card .val { font-size: 17px; font-weight: 700; color: #1e3a5f; }
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
      <h1>売上サマリー</h1>
      <div class="sub" id="emp-name"></div>
    </div>
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
  <div class="toast" id="toast"></div>

  <script>
  var AT = '';
  var curYear = 0, curMonth = 0;
  var chartObj = null;

  liff.init({ liffId: ${JSON.stringify(liffId || 'LIFF_ID_NOT_SET')} })
    .then(function() {
      AT = liff.getAccessToken() || '';
      var today = new Date(Date.now() + 9 * 3600 * 1000);
      curYear = today.getUTCFullYear();
      curMonth = today.getUTCMonth() + 1;
      return loadSummary();
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

  function api(path) {
    return fetch(path, { headers: { Authorization: 'Bearer ' + AT } }).then(function(res) {
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
