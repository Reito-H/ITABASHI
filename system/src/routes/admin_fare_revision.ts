// 運賃改定影響分析 — AI売上分析ページの新規タブ。
// 2026-04-20の運賃改定（約10%値上げ）前後で、乗務員一人ひとりの売上・労働時間がどう変化したかを
// ルールベースで分析する（外部AI/LLM APIへの通信は一切行わない。admin_sales_ai.ts と同方針）。
import { Hono } from 'hono';
import { layout } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';
import { salesAiTabNav, SALES_AI_TABNAV_CSS } from './admin_sales_ai';
import { settingsSubHeader } from './admin';
import { computeFareRevisionOverview, computeFareRevisionEmployee } from './api/fare_revision';
import { renderFareRevisionOverviewPrintPage, renderFareRevisionEmployeePrintPage } from '../html/fare_revision_print';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

function formatPrintedAtLabel(): string {
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

app.get('/sales-ai/fare-revision', async (c) => {
  const content = `
<style>
  ${SALES_AI_TABNAV_CSS}
  .frv-root { max-width:1180px; font-family:'Hiragino Sans','Meiryo',sans-serif; color:#1f2937; }
  .frv-hero { display:flex; justify-content:space-between; align-items:flex-end; gap:12px; flex-wrap:wrap; margin-bottom:12px; }
  .frv-hero h2 { font-size:18px; font-weight:800; color:var(--color-primary,#17495f); margin:0; letter-spacing:.02em; }
  .frv-hero-desc { font-size:11.5px; color:#6b7280; margin-top:4px; line-height:1.6; max-width:720px; }
  .frv-period-chip { display:none; align-items:center; gap:8px; background:#fff; border:1px solid var(--color-border,#dcefe7); border-radius:999px; padding:6px 14px; font-size:11.5px; color:#374151; box-shadow:0 1px 2px rgba(0,0,0,.04); }
  .frv-period-chip b { color:var(--color-primary,#17495f); }
  .frv-period-chip .sep { color:#cbd5e1; }

  .frv-card { background:#fff; border-radius:12px; box-shadow:0 1px 3px rgba(15,23,42,.07); border:1px solid #eef2f6; padding:18px 20px; margin-bottom:14px; }
  .frv-card-title { font-size:13.5px; font-weight:700; color:#1f2937; margin:0 0 4px; }
  .frv-card-sub { font-size:11px; color:#9ca3af; margin-bottom:10px; line-height:1.6; }

  /* 条件パネル */
  .frv-filter { padding:0; overflow:hidden; }
  .frv-filter-body { display:flex; gap:0; flex-wrap:wrap; }
  .frv-filter-group { padding:14px 18px; display:flex; flex-direction:column; gap:8px; }
  .frv-filter-group + .frv-filter-group { border-left:1px solid #f1f5f9; }
  .frv-group-label { font-size:10.5px; font-weight:800; color:var(--color-primary,#17495f); letter-spacing:.08em; }
  .frv-group-fields { display:flex; gap:10px; flex-wrap:wrap; align-items:flex-end; }
  .frv-field { display:flex; flex-direction:column; gap:4px; }
  .frv-field label { font-size:10.5px; color:#6b7280; font-weight:700; }
  .frv-field input, .frv-field select { border:1px solid #d1d5db; border-radius:8px; padding:7px 10px; font-size:12.5px; background:#fff; color:#1f2937; transition:border-color .15s, box-shadow .15s; }
  .frv-field input:focus, .frv-field select:focus { outline:none; border-color:var(--color-action,#0f8567); box-shadow:0 0 0 3px rgba(15,133,103,.15); }
  .frv-filter-actions { margin-left:auto; padding:14px 18px; display:flex; flex-direction:column; justify-content:flex-end; align-items:flex-end; gap:6px; }
  .frv-search-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-width:150px; background:var(--color-action,#0f8567); color:#fff; border:none; border-radius:10px; padding:11px 26px; font-size:14px; font-weight:800; letter-spacing:.1em; cursor:pointer; box-shadow:0 2px 6px rgba(15,133,103,.3); transition:transform .1s, box-shadow .15s, background .15s; }
  .frv-search-btn:hover { background:#0c7058; box-shadow:0 4px 12px rgba(15,133,103,.35); }
  .frv-search-btn:active { transform:translateY(1px); }
  .frv-search-btn.frv-dirty { animation:frvPulse 1.6s ease-in-out infinite; }
  .frv-search-btn .frv-spin { display:none; }
  .frv-search-btn.frv-busy .frv-spin { display:inline-block; }
  .frv-search-btn.frv-busy .frv-search-ico { display:none; }
  .frv-dirty-hint { font-size:10.5px; color:#b45309; font-weight:700; visibility:hidden; }
  .frv-dirty-hint.show { visibility:visible; }
  @keyframes frvPulse { 0%,100% { box-shadow:0 0 0 0 rgba(15,133,103,.45); } 50% { box-shadow:0 0 0 7px rgba(15,133,103,0); } }
  .frv-link-btn { background:none; border:none; color:#6b7280; font-size:11.5px; font-weight:700; cursor:pointer; padding:2px 0; }
  .frv-link-btn:hover { color:var(--color-primary,#17495f); }
  .frv-advanced { display:none; padding:12px 18px 14px; border-top:1px dashed #e5e7eb; background:#fafbfc; }
  .frv-advanced.open { display:flex; flex-wrap:wrap; gap:12px; }
  .frv-notes { padding:0 18px 12px; }
  .frv-period-note { font-size:11px; color:#6b7280; margin-top:8px; }

  /* 全体／個人 切替 */
  .frv-view-toggle { display:flex; margin:16px 0 12px; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; }
  .frv-seg { display:inline-flex; background:#e9eef3; border-radius:10px; padding:3px; }
  .frv-view-btn { padding:7px 22px; border-radius:8px; border:none; background:transparent; color:#475569; font-size:12.5px; font-weight:700; cursor:pointer; transition:background .15s, color .15s; }
  .frv-view-btn.active { background:#fff; color:var(--color-primary,#17495f); box-shadow:0 1px 3px rgba(0,0,0,.12); }
  .frv-btn { border:none; border-radius:8px; padding:7px 16px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
  .frv-btn-ghost { background:#fff; border:1px solid #d1d5db; color:#374151; }
  .frv-btn-ghost:hover { border-color:#9ca3af; }

  /* サブタブ（ピル型） */
  .frv-subtabnav { display:flex; gap:6px; margin-bottom:14px; flex-wrap:wrap; }
  .frv-subtab-btn { padding:7px 14px; font-size:12.5px; font-weight:700; color:#475569; background:#fff; border:1px solid #e2e8f0; border-radius:999px; cursor:pointer; transition:all .15s; }
  .frv-subtab-btn:hover { border-color:#94a3b8; color:#1f2937; }
  .frv-subtab-btn.active { background:var(--color-primary,#17495f); border-color:var(--color-primary,#17495f); color:#fff; }
  .frv-subtab-btn span { opacity:.75; font-weight:600; }

  /* KPI */
  .frv-kpi-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-bottom:14px; }
  .frv-kpi { position:relative; background:#fff; border-radius:12px; border:1px solid #eef2f6; box-shadow:0 1px 3px rgba(15,23,42,.06); padding:13px 15px 12px 17px; overflow:hidden; }
  .frv-kpi::before { content:''; position:absolute; left:0; top:0; bottom:0; width:4px; background:#cbd5e1; }
  .frv-kpi.tone-ok::before { background:#16a34a; }
  .frv-kpi.tone-warn::before { background:#f59e0b; }
  .frv-kpi.tone-bad::before { background:#dc2626; }
  .frv-kpi.tone-main::before { background:var(--color-primary,#17495f); }
  .frv-kpi.tone-flag::before { background:#ea580c; }
  .frv-kpi-label { font-size:10.5px; color:#6b7280; margin-bottom:5px; font-weight:600; line-height:1.4; }
  .frv-kpi-val { font-size:22px; font-weight:800; color:#1f2937; line-height:1.15; letter-spacing:.01em; }
  .frv-kpi.tone-ok .frv-kpi-val { color:#15803d; }
  .frv-kpi.tone-warn .frv-kpi-val { color:#b45309; }
  .frv-kpi.tone-bad .frv-kpi-val { color:#b91c1c; }
  .frv-kpi.tone-flag .frv-kpi-val { color:#c2410c; }
  .frv-kpi-sub { font-size:10.5px; color:#6b7280; margin-top:3px; }
  .frv-kpi-bar { height:4px; background:#f1f5f9; border-radius:2px; margin-top:7px; overflow:hidden; }
  .frv-kpi-bar i { display:block; height:100%; border-radius:2px; background:currentColor; }

  /* 表 */
  .frv-table-wrap { overflow-x:auto; }
  .frv-table { width:100%; border-collapse:separate; border-spacing:0; font-size:12.5px; }
  .frv-table th { padding:8px 10px; text-align:left; color:#64748b; font-size:11px; font-weight:700; background:#f8fafc; border-bottom:1px solid #e5e7eb; white-space:nowrap; }
  .frv-table th:first-child { border-top-left-radius:8px; }
  .frv-table th:last-child { border-top-right-radius:8px; }
  .frv-table td { padding:8px 10px; border-bottom:1px solid #f1f5f9; vertical-align:middle; }
  .frv-table tbody tr:nth-child(even) td { background:#fcfdfe; }
  .frv-table tr.frv-row-clickable { cursor:pointer; }
  .frv-table tr.frv-row-clickable:hover td { background:#eef8f4; }
  .frv-table td.frv-no, .frv-table th.frv-no { width:38px; text-align:right; color:#94a3b8; font-variant-numeric:tabular-nums; }
  .frv-table td.num { font-variant-numeric:tabular-nums; white-space:nowrap; }
  .frv-name { font-weight:700; color:#1f2937; }
  .frv-duty { display:inline-block; min-width:22px; text-align:center; padding:1px 7px; border-radius:6px; font-weight:800; font-size:12px; background:#eef2f7; color:#334155; font-family:ui-monospace,Menlo,Consolas,monospace; }
  .frv-pill { display:inline-block; padding:2px 9px; border-radius:999px; font-weight:800; font-size:12px; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .frv-pill.ok { background:#dcfce7; color:#15803d; }
  .frv-pill.warn { background:#fef3c7; color:#b45309; }
  .frv-pill.bad { background:#fee2e2; color:#b91c1c; }
  .frv-pill.none { background:#f1f5f9; color:#64748b; }
  .frv-pill small { font-weight:600; font-size:10.5px; margin-left:3px; }
  .frv-table-tools { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; flex-wrap:wrap; gap:8px; }
  .frv-table-tools select, .frv-table-tools input { border:1px solid #d1d5db; border-radius:8px; padding:6px 10px; font-size:12px; background:#fff; }
  .frv-empty { font-size:12px; color:#9ca3af; padding:14px 0; text-align:center; }

  .frv-coverage { font-size:11px; color:#6b7280; margin-top:6px; }
  .frv-reasoning { list-style:none; padding:0; margin:10px 0 0; font-size:12.5px; line-height:1.7; color:#374151; }
  .frv-reasoning li { padding:8px 12px; background:#f8fafc; border-radius:8px; margin-bottom:6px; border-left:3px solid #cbd5e1; }
  .frv-reasoning li.frv-flag { background:#fff7ed; color:#9a3412; font-weight:600; border-left-color:#ea580c; }
  .frv-search-wrap { position:relative; max-width:360px; }
  .frv-search-wrap svg { position:absolute; left:11px; top:50%; transform:translateY(-50%); color:#94a3b8; }
  .frv-search-wrap input { width:100%; border:1px solid #d1d5db; border-radius:10px; padding:10px 12px 10px 34px; font-size:13px; }
  .frv-search-wrap input:focus { outline:none; border-color:var(--color-action,#0f8567); box-shadow:0 0 0 3px rgba(15,133,103,.15); }

  /* 読み込み中の表示（骨組み表示＋上部バー） */
  .frv-progress { position:fixed; left:0; right:0; top:0; height:3px; z-index:200; pointer-events:none; opacity:0; transition:opacity .2s; }
  .frv-progress.on { opacity:1; }
  .frv-progress i { position:absolute; top:0; bottom:0; width:35%; background:linear-gradient(90deg,transparent,var(--color-action,#0f8567),transparent); animation:frvSlide 1s linear infinite; }
  @keyframes frvSlide { from { left:-35%; } to { left:100%; } }
  .sk { background:linear-gradient(90deg,#eef2f6 25%,#f8fafc 50%,#eef2f6 75%); background-size:200% 100%; animation:frvShimmer 1.2s linear infinite; border-radius:6px; }
  @keyframes frvShimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }
  .sk-kpi { height:76px; border-radius:12px; }
  .sk-line { height:12px; margin:10px 0; }
  .sk-block { height:180px; border-radius:12px; }
  .frv-refreshing { opacity:.45; pointer-events:none; transition:opacity .2s; }
  .frv-spin { width:14px; height:14px; border:2px solid rgba(255,255,255,.4); border-top-color:#fff; border-radius:50%; animation:frvRot .7s linear infinite; }
  @keyframes frvRot { to { transform:rotate(360deg); } }
  .frv-error { background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; border-radius:10px; padding:12px 16px; font-size:12.5px; font-weight:600; }
  .frv-fade { animation:frvFade .25s ease-out; }
  @keyframes frvFade { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }

  @media (max-width:760px) {
    .frv-filter-group + .frv-filter-group { border-left:none; border-top:1px solid #f1f5f9; }
    .frv-filter-actions { margin-left:0; width:100%; align-items:stretch; }
    .frv-search-btn { width:100%; }
  }
</style>
<div class="frv-progress" id="frv-progress"><i></i></div>
<div class="frv-root">
  ${salesAiTabNav('fare-revision')}
  <div class="frv-hero">
    <div>
      <h2>運賃改定影響分析</h2>
      <div class="frv-hero-desc">2026年4月からの運賃値上げ（約10%）で、売上や働いた時間がどのように変わったかを自動で分かりやすく分析します。外部のAIサービスには一切接続していません。</div>
    </div>
    <div class="frv-period-chip" id="period-chip"></div>
  </div>

  <div class="frv-card frv-filter" id="filter-card">
    <div class="frv-filter-body">
      <div class="frv-filter-group">
        <div class="frv-group-label">比べる期間</div>
        <div class="frv-group-fields">
          <div class="frv-field">
            <label>比較のしかた</label>
            <select id="compare-mode" onchange="onCompareModeChange()">
              <option value="revision">運賃改定の前後で比較</option>
              <option value="yoyMonth" selected>前年の同じ月と比較</option>
            </select>
          </div>
          <div class="frv-field" id="revision-field-start">
            <label>改定後の期間（開始）</label>
            <input type="date" id="after-start">
          </div>
          <div class="frv-field" id="revision-field-end">
            <label>改定後の期間（終了）</label>
            <input type="date" id="after-end">
          </div>
          <div class="frv-field" id="yoy-field-year" style="display:none;">
            <label>比較する年（後の年）</label>
            <select id="yoy-year"></select>
          </div>
          <div class="frv-field" id="yoy-field-month" style="display:none;">
            <label>比較する月</label>
            <select id="yoy-month">
              <option value="1">1月</option><option value="2">2月</option><option value="3">3月</option>
              <option value="4">4月</option><option value="5">5月</option><option value="6">6月</option>
              <option value="7">7月</option><option value="8">8月</option><option value="9">9月</option>
              <option value="10">10月</option><option value="11">11月</option><option value="12">12月</option>
            </select>
          </div>
        </div>
      </div>
      <div class="frv-filter-group">
        <div class="frv-group-label">絞り込み</div>
        <div class="frv-group-fields">
          <div class="frv-field">
            <label>課</label>
            <select id="division-filter"><option value="">全課</option><option value="1">1課</option><option value="2">2課</option><option value="3">3課</option><option value="4">4課</option></select>
          </div>
          <div class="frv-field">
            <label>班</label>
            <select id="team-filter"><option value="">全班</option><option value="1">1班</option><option value="2">2班</option><option value="3">3班</option><option value="4">4班</option><option value="5">5班</option><option value="6">6班</option><option value="7">7班</option><option value="8">8班</option></select>
          </div>
          <div class="frv-field">
            <label>勤務区分</label>
            <select id="duty-filter"><option value="">全区分</option><option value="a">昼日(a)</option><option value="b">夜日(b)</option><option value="B">隔日(B)</option><option value="D">隔日(D)</option><option value="H">隔日(H)</option></select>
          </div>
        </div>
      </div>
      <div class="frv-filter-actions">
        <span class="frv-dirty-hint" id="dirty-hint">条件が変わりました</span>
        <button type="button" class="frv-search-btn" id="search-btn" onclick="applyFilters()">
          <svg class="frv-search-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <span class="frv-spin"></span>
          検索
        </button>
        <button type="button" class="frv-link-btn" id="advanced-toggle" onclick="toggleAdvanced()">くわしい設定 ▾</button>
      </div>
    </div>
    <div id="advanced-panel" class="frv-advanced">
      <div class="frv-field"><label>目標にする達成率(%)</label><input type="number" id="achievement-threshold" value="110" style="width:80px;"></div>
      <div class="frv-field"><label>売上がこの範囲なら「ほぼ変わらない」とみなす(100±%)</label><input type="number" id="sales-flat-band" value="8" style="width:70px;"></div>
      <div class="frv-field"><label>働いた時間がこれより減ったら「減った」と判定(%)</label><input type="number" id="labor-hours-drop" value="97" style="width:80px;"></div>
      <div class="frv-field"><label>判定に必要な最低の乗務日数（各期間）</label><input type="number" id="min-duty-days" value="5" style="width:70px;"></div>
      <div class="frv-field"><label>労働時間データが必要な最低の割合(%)</label><input type="number" id="min-labor-coverage-pct" value="50" style="width:70px;"></div>
    </div>
    <div class="frv-notes">
      <div id="period-note" class="frv-period-note"></div>
      <div id="yoy-note" class="frv-period-note" style="display:none;">「前年の同じ月と比較」は、去年と今年の同じ月同士（例: 2025年4月度と2026年4月度）を比べるモードです。曜日構成や季節行事の影響をそろえた比較ができます。運賃改定の前後で日数をそろえた比較をしたいときは「運賃改定の前後で比較」を選んでください。</div>
    </div>
  </div>

  <div class="frv-view-toggle frv-no-print">
    <div class="frv-seg">
      <button type="button" id="btn-view-overview" class="frv-view-btn active" onclick="switchView('overview')">全体</button>
      <button type="button" id="btn-view-individual" class="frv-view-btn" onclick="switchView('individual')">個人</button>
    </div>
    <button type="button" class="frv-btn frv-btn-ghost" onclick="printCurrentView()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      今の画面を印刷
    </button>
  </div>

  <div id="loading">
    <div class="frv-kpi-row">
      <div class="sk sk-kpi"></div><div class="sk sk-kpi"></div><div class="sk sk-kpi"></div><div class="sk sk-kpi"></div><div class="sk sk-kpi"></div><div class="sk sk-kpi"></div>
    </div>
    <div class="frv-card"><div class="sk sk-line" style="width:30%;"></div><div class="sk sk-block"></div></div>
  </div>
  <div id="load-error" class="frv-error" style="display:none;"></div>

  <div id="view-overview" style="display:none;">
    <div class="frv-subtabnav frv-no-print" id="ov-subtabnav">
      <button type="button" class="frv-subtab-btn active" data-sub="summary" onclick="switchOverviewSub('summary')">サマリー</button>
      <button type="button" class="frv-subtab-btn" data-sub="honbun" onclick="switchOverviewSub('honbun')">本分析結果</button>
      <button type="button" class="frv-subtab-btn" data-sub="breakdown" onclick="switchOverviewSub('breakdown')">課・班・勤務別</button>
      <button type="button" class="frv-subtab-btn" data-sub="flagged" onclick="switchOverviewSub('flagged')">早めに切り上げていそうな人 <span id="flagged-count"></span></button>
      <button type="button" class="frv-subtab-btn" data-sub="allemp" onclick="switchOverviewSub('allemp')">社員ごとの一覧</button>
    </div>

    <div id="ov-sub-summary" class="frv-subpanel">
      <div id="kpi-row" class="frv-kpi-row"></div>
      <div class="frv-card">
        <h3 class="frv-card-title">1日あたり売上の伸び具合の分布（人数）</h3>
        <div class="frv-card-sub">横軸は「後の期間の売上 ÷ 前の期間の売上」の割合です。100%より右なら売上が伸びた人です。</div>
        <canvas id="histogram-chart" height="70"></canvas>
      </div>
      <div id="coverage-note" class="frv-coverage"></div>
    </div>

    <div id="ov-sub-honbun" class="frv-subpanel" style="display:none;">
      <div class="frv-card">
        <h3 class="frv-card-title" style="margin-bottom:10px;">目標未達率</h3>
        <div id="honbun-kpi-row" class="frv-kpi-row" style="margin-bottom:0;"></div>
        <div id="honbun-excluded-note" style="font-size:11px;color:#9ca3af;margin-top:8px;"></div>
      </div>
      <div class="frv-card">
        <div class="frv-table-tools">
          <h3 class="frv-card-title" style="margin:0;">目標未達の社員一覧</h3>
          <select id="honbun-sort" onchange="renderHonbunEmpTable()" class="frv-no-print">
            <option value="growth-asc">1日あたり売上の伸び 低い順</option>
            <option value="return-earlier">帰る時間が早くなった順</option>
            <option value="return-after-asc">後の帰る時刻 早い順</option>
          </select>
        </div>
        <div class="frv-table-wrap">
          <table class="frv-table">
            <thead><tr><th class="frv-no">No.</th><th>氏名</th><th>課/班</th><th>勤務の種類</th><th>1日あたり売上の伸び</th><th id="th-honbun-before">前の1日平均売上</th><th id="th-honbun-after">後の1日平均売上</th><th id="th-honbun-return-before">前の帰る時刻</th><th id="th-honbun-return-after">後の帰る時刻</th></tr></thead>
            <tbody id="honbun-emp-tbody"></tbody>
          </table>
        </div>
        <div id="honbun-emp-empty" class="frv-empty" style="display:none;">該当する人はいません。</div>
      </div>
    </div>

    <div id="ov-sub-breakdown" class="frv-subpanel" style="display:none;">
      <div style="display:flex;gap:14px;margin-bottom:14px;flex-wrap:wrap;">
        <div class="frv-card" style="flex:1;min-width:220px;margin-bottom:0;">
          <h3 class="frv-card-title" style="margin-bottom:10px;">課ごとの1日あたり売上の伸び（平均）</h3>
          <table class="frv-table"><thead><tr><th>課</th><th>平均の伸び</th><th>人数</th></tr></thead><tbody id="division-tbody"></tbody></table>
        </div>
        <div class="frv-card" style="flex:1;min-width:220px;margin-bottom:0;">
          <h3 class="frv-card-title" style="margin-bottom:10px;">班ごとの1日あたり売上の伸び（平均）</h3>
          <table class="frv-table"><thead><tr><th>班</th><th>平均の伸び</th><th>人数</th></tr></thead><tbody id="team-tbody"></tbody></table>
        </div>
        <div class="frv-card" style="flex:1;min-width:220px;margin-bottom:0;">
          <h3 class="frv-card-title" style="margin-bottom:10px;">勤務の種類ごとの1日あたり売上の伸び（平均）</h3>
          <table class="frv-table"><thead><tr><th>種類</th><th>平均の伸び</th><th>人数</th></tr></thead><tbody id="duty-tbody"></tbody></table>
        </div>
      </div>
    </div>

    <div id="ov-sub-flagged" class="frv-subpanel" style="display:none;">
      <div class="frv-card">
        <h3 class="frv-card-title">早めに切り上げていそうな人（一覧）</h3>
        <div class="frv-card-sub">売上は運賃改定前とほぼ変わっていないのに、働いた時間がはっきり短くなっている人です。いつもの目標額に早く届いて、早めに仕事を切り上げているのかもしれません。行をクリックすると、その人の詳しい状況を見られます。</div>
        <div class="frv-table-wrap">
          <table class="frv-table">
            <thead><tr><th class="frv-no">No.</th><th>氏名</th><th>課/班</th><th id="th-flagged-before">前の1日平均売上</th><th id="th-flagged-after">後の1日平均売上</th><th>1日あたり売上の伸び</th><th>単価の伸び</th><th>1乗務あたり労働時間の伸び</th><th>確からしさ</th></tr></thead>
            <tbody id="flagged-tbody"></tbody>
          </table>
        </div>
        <div id="flagged-empty" class="frv-empty" style="display:none;">該当する人はいません。</div>
      </div>
    </div>

    <div id="ov-sub-allemp" class="frv-subpanel" style="display:none;">
      <div class="frv-subtabnav frv-no-print" id="allemp-category-nav">
        <button type="button" class="frv-subtab-btn active" data-cat="above" onclick="switchAllEmpCategory('above')">目標達成 <span id="cat-count-above"></span></button>
        <button type="button" class="frv-subtab-btn" data-cat="met" onclick="switchAllEmpCategory('met')">伸びたが未達 <span id="cat-count-met"></span></button>
        <button type="button" class="frv-subtab-btn" data-cat="below" onclick="switchAllEmpCategory('below')">減少 <span id="cat-count-below"></span></button>
        <button type="button" class="frv-subtab-btn" data-cat="insufficient_data" onclick="switchAllEmpCategory('insufficient_data')">データ不足 <span id="cat-count-insufficient_data"></span></button>
      </div>
      <div class="frv-card">
        <div class="frv-table-tools">
          <h3 id="allemp-title" class="frv-card-title" style="margin:0;">社員ごとの一覧</h3>
          <div style="display:flex;gap:8px;" class="frv-no-print">
            <input type="text" id="all-emp-search" placeholder="社員名で絞り込み" oninput="renderAllEmployeesTable()">
            <select id="all-emp-sort" onchange="renderAllEmployeesTable()">
              <option value="growth-asc">1日あたり売上の伸び 低い順</option>
              <option value="growth-desc">1日あたり売上の伸び 高い順</option>
              <option value="name-asc">名前順</option>
            </select>
          </div>
        </div>
        <div class="frv-table-wrap">
          <table class="frv-table">
            <thead><tr><th class="frv-no">No.</th><th>氏名</th><th>課/班</th><th>勤務の種類</th><th>1日あたり売上の伸び</th><th id="th-allemp-before">前の1日平均売上</th><th id="th-allemp-after">後の1日平均売上</th><th>1乗務あたり労働時間の伸び</th></tr></thead>
            <tbody id="all-emp-tbody"></tbody>
          </table>
        </div>
        <div id="all-emp-empty" class="frv-empty" style="display:none;">該当する人はいません。</div>
      </div>
    </div>
  </div>

  <div id="view-individual" style="display:none;">
    <div class="frv-card frv-no-print" style="padding:14px 18px;">
      <div class="frv-search-wrap">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
        <input type="text" id="individual-search" list="emp-datalist" placeholder="社員名を入力して選んでください" oninput="onIndividualSearchInput()">
        <datalist id="emp-datalist"></datalist>
      </div>
    </div>
    <div id="individual-empty" class="frv-empty" style="text-align:left;">社員を選択してください。全体ビューの一覧で行をクリックしても開けます。</div>
    <div id="individual-loading" style="display:none;">
      <div class="frv-kpi-row"><div class="sk sk-kpi"></div><div class="sk sk-kpi"></div><div class="sk sk-kpi"></div><div class="sk sk-kpi"></div></div>
      <div class="frv-card"><div class="sk sk-line" style="width:40%;"></div><div class="sk sk-block"></div></div>
    </div>
    <div id="individual-content" style="display:none;">
      <div class="frv-subtabnav frv-no-print">
        <button type="button" class="frv-subtab-btn active" data-sub="summary" onclick="switchEmpSub('summary')">サマリー</button>
        <button type="button" class="frv-subtab-btn" data-sub="reasoning" onclick="switchEmpSub('reasoning')">判定理由</button>
        <button type="button" class="frv-subtab-btn" data-sub="daily" onclick="switchEmpSub('daily')">日ごとの記録</button>
      </div>

      <div id="emp-sub-summary" class="frv-subpanel">
        <div id="emp-kpi-row" class="frv-kpi-row"></div>
        <div class="frv-card">
          <h3 id="emp-chart-title" class="frv-card-title" style="margin-bottom:10px;">売上の移り変わり</h3>
          <canvas id="emp-chart" height="90"></canvas>
        </div>
      </div>

      <div id="emp-sub-reasoning" class="frv-subpanel" style="display:none;">
        <div class="frv-card">
          <h3 class="frv-card-title">なぜこの判定になったか（自動作成の説明）</h3>
          <ul id="emp-reasoning" class="frv-reasoning"></ul>
        </div>
      </div>

      <div id="emp-sub-daily" class="frv-subpanel" style="display:none;">
        <div class="frv-card">
          <h3 class="frv-card-title" style="margin-bottom:10px;">日ごとの記録</h3>
          <div style="max-height:420px;overflow-y:auto;">
            <table class="frv-table">
              <thead><tr><th>いつの期間</th><th>日付</th><th>売上</th><th>働いた時間</th><th>記録の種類</th><th>帰る時刻</th></tr></thead>
              <tbody id="emp-daily-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js" integrity="sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ" crossorigin="anonymous"></script>
<script>
const ADMIN_PATH = '${ADMIN_PATH}';
let overviewData = null;
let honbunData = null;
let currentEmpId = null;
let currentEmpWageCategory = null;
let histogramChart = null;
let empChart = null;
let currentPeriods = null;
let currentOverviewSub = 'summary';
let currentEmpSub = 'summary';
let currentAllEmpCategory = 'above';

function escHtmlJs(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
function fmtPct(v) { return (v === null || v === undefined) ? '—' : v + '%'; }
function fmtYen(v) { return (v === null || v === undefined) ? '—' : v.toLocaleString('ja-JP') + '円'; }
function pctColor(v) {
  if (v === null || v === undefined) return '#6b7280';
  if (v >= 110) return '#16a34a';
  if (v >= 100) return '#b45309';
  return '#dc2626';
}
function returnTimeToMin(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\\d{1,2}):(\\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}
// 「後の帰る時刻 − 前の帰る時刻」を分で返す。マイナスなら帰る時間が早くなった。日跨ぎ帰庫の大きな逆転は補正。
function returnTimeDiffMin(e) {
  const b = returnTimeToMin(e && e.before && e.before.avgReturnTime);
  let a = returnTimeToMin(e && e.after && e.after.avgReturnTime);
  if (b === null || a === null) return null;
  if (a < b - 12 * 60) a += 24 * 60;
  return a - b;
}
const CATEGORY_LABELS = { above: '目標達成', met: '伸びたが未達', below: '減少', insufficient_data: 'データ不足' };

// fetch + JSON パース。サーバーがエラーページ（HTML）を返したとき、素の r.json() だと
// Safari で「SyntaxError: The string did not match the expected pattern.」となって原因が
// 分からないので、共通の分かりやすいメッセージに変換する（詳細は console に出す）。
// 同じ条件の結果はこの画面を開いている間だけメモリに覚えておき、2回目以降は通信せず即表示する。
// ブラウザの保存領域（localStorage等）には一切書かないので、画面を閉じれば消える。
var FRV_CACHE = new Map();
var FRV_CACHE_MAX = 40;
var frvInflight = 0;
function setProgress(delta) {
  frvInflight = Math.max(0, frvInflight + delta);
  document.getElementById('frv-progress').classList.toggle('on', frvInflight > 0);
}
function fetchJsonCached(url) {
  if (FRV_CACHE.has(url)) return FRV_CACHE.get(url);
  setProgress(1);
  const p = fetchJsonOrThrow(url).then(function(data) { setProgress(-1); return data; }, function(err) {
    setProgress(-1);
    FRV_CACHE.delete(url);
    throw err;
  });
  FRV_CACHE.set(url, p);
  if (FRV_CACHE.size > FRV_CACHE_MAX) FRV_CACHE.delete(FRV_CACHE.keys().next().value);
  return p;
}
function isCached(url) { return FRV_CACHE.has(url); }

function fetchJsonOrThrow(url) {
  var MSG = '読み込みに失敗しました。時間をおいて再度お試しください。';
  return fetch(url).catch(function() {
    throw new Error(MSG);
  }).then(function(r) {
    return r.text().then(function(text) {
      if (!r.ok || (text && text.charAt(0) !== '{' && text.charAt(0) !== '[')) {
        console.error('fare-revision fetch failed', r.status, (text || '').slice(0, 300));
        throw new Error(MSG);
      }
      try {
        return JSON.parse(text);
      } catch (e) {
        console.error('fare-revision JSON parse failed', (text || '').slice(0, 300));
        throw new Error(MSG);
      }
    });
  });
}

function toggleAdvanced() {
  document.getElementById('advanced-panel').classList.toggle('open');
}

function toCamel(id) {
  return id.replace(/-([a-z])/g, function(_, ch) { return ch.toUpperCase(); });
}
function onCompareModeChange() {
  const mode = document.getElementById('compare-mode').value;
  document.getElementById('revision-field-start').style.display = mode === 'yoyMonth' ? 'none' : '';
  document.getElementById('revision-field-end').style.display = mode === 'yoyMonth' ? 'none' : '';
  document.getElementById('yoy-field-year').style.display = mode === 'yoyMonth' ? '' : 'none';
  document.getElementById('yoy-field-month').style.display = mode === 'yoyMonth' ? '' : 'none';
  document.getElementById('yoy-note').style.display = mode === 'yoyMonth' ? '' : 'none';
}

function populateYoyYearOptions() {
  const sel = document.getElementById('yoy-year');
  const nowYear = new Date().getFullYear();
  let html = '';
  for (let y = nowYear; y >= nowYear - 3; y--) {
    html += '<option value="' + y + '">' + y + '年</option>';
  }
  sel.innerHTML = html;
  sel.value = String(nowYear);
  document.getElementById('yoy-month').value = String(new Date().getMonth() + 1);
}

function buildQueryString() {
  const params = new URLSearchParams();
  const compareMode = document.getElementById('compare-mode').value;
  params.set('compareMode', compareMode);
  if (compareMode === 'yoyMonth') {
    params.set('yoyYear', document.getElementById('yoy-year').value);
    params.set('yoyMonth', document.getElementById('yoy-month').value);
  } else {
    ['after-start', 'after-end'].forEach(function(id) {
      const el = document.getElementById(id);
      if (el && el.value) params.set(toCamel(id), el.value);
    });
  }
  const division = document.getElementById('division-filter').value;
  if (division) params.set('division', division);
  const team = document.getElementById('team-filter').value;
  if (team) params.set('team', team);
  const duty = document.getElementById('duty-filter').value;
  if (duty) params.set('dutyCode', duty);
  const thresholdIds = {
    'achievement-threshold': 'achievementThresholdPct',
    'sales-flat-band': 'salesFlatBandPct',
    'labor-hours-drop': 'laborHoursDropThresholdPct',
    'min-duty-days': 'minDutyDaysPerPeriod',
  };
  Object.keys(thresholdIds).forEach(function(id) {
    const el = document.getElementById(id);
    if (el && el.value !== '') params.set(thresholdIds[id], el.value);
  });
  const coveragePct = document.getElementById('min-labor-coverage-pct');
  if (coveragePct && coveragePct.value !== '') params.set('minLaborHoursCoverageRatio', String(Number(coveragePct.value) / 100));
  return params.toString();
}

function applyFilters() {
  setDirty(false);
  loadOverview();
  honbunData = null;
  if (currentOverviewSub === 'honbun') loadHonbunResult();
  if (currentEmpId) loadEmployee(currentEmpId, currentEmpWageCategory);
}

// 条件を変えたのに検索を押していない状態を、検索ボタンの点滅で知らせる
function setDirty(on) {
  document.getElementById('search-btn').classList.toggle('frv-dirty', on);
  document.getElementById('dirty-hint').classList.toggle('show', on);
}
function setSearchBusy(on) {
  document.getElementById('search-btn').classList.toggle('frv-busy', on);
}

function growthTone(v) {
  if (v === null || v === undefined) return 'none';
  if (v >= 110) return 'ok';
  if (v >= 100) return 'warn';
  return 'bad';
}
function growthPill(v, note) {
  return '<span class="frv-pill ' + growthTone(v) + '">' + fmtPct(v) + (note ? '<small>' + note + '</small>' : '') + '</span>';
}
function dutyBadge(code) {
  return code ? '<span class="frv-duty">' + escHtmlJs(code) + '</span>' : '—';
}
function divTeam(e) {
  return (e.division ?? '—') + '課' + (e.team ?? '—') + '班';
}
function skeletonRows(cols, n) {
  let html = '';
  for (let i = 0; i < n; i++) {
    html += '<tr>';
    for (let j = 0; j < cols; j++) html += '<td><div class="sk" style="height:12px;width:' + (j === 1 ? 70 : 50) + '%;"></div></td>';
    html += '</tr>';
  }
  return html;
}
function rowAttrs(e) {
  return ' class="frv-row-clickable" onmouseenter="prefetchEmployee(' + e.empId + ', \\'' + (e.wageCategory || '') + '\\')" onclick="selectEmployee(' + e.empId + ', \\'' + escHtmlJs(e.empName).replace(/'/g, "\\\\'") + '\\', \\'' + (e.wageCategory || '') + '\\')"';
}

function switchView(view) {
  document.getElementById('view-overview').style.display = view === 'overview' ? '' : 'none';
  document.getElementById('view-individual').style.display = view === 'individual' ? '' : 'none';
  document.getElementById('btn-view-overview').classList.toggle('active', view === 'overview');
  document.getElementById('btn-view-individual').classList.toggle('active', view === 'individual');
}

function switchOverviewSub(name) {
  currentOverviewSub = name;
  ['summary', 'honbun', 'breakdown', 'flagged', 'allemp'].forEach(function(n) {
    document.getElementById('ov-sub-' + n).style.display = n === name ? '' : 'none';
  });
  document.querySelectorAll('#ov-subtabnav .frv-subtab-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.sub === name);
  });
  if (name === 'honbun' && !honbunData) loadHonbunResult();
}

function kpiCardsHtml(items, subPrefix) {
  let html = '';
  items.forEach(function(it) {
    const bar = (it.ratio !== undefined && it.ratio !== null)
      ? '<div class="frv-kpi-bar"><i style="width:' + Math.min(100, Math.max(0, it.ratio)) + '%;"></i></div>' : '';
    html += '<div class="frv-kpi frv-fade tone-' + (it.tone || 'muted') + '"><div class="frv-kpi-label">' + escHtmlJs(it.label) + '</div><div class="frv-kpi-val">' + escHtmlJs(it.val) + '</div>' +
      (it.sub ? '<div class="frv-kpi-sub">' + escHtmlJs(subPrefix) + escHtmlJs(it.sub) + '</div>' : '') + bar + '</div>';
  });
  return html;
}
function ratioPct(n, total) { return total ? Math.round(n / total * 1000) / 10 : null; }

function renderHonbunResult(data) {
  const c = data.counts;
  const total = c.above + c.met + c.below + c.insufficientData;
  const achieved = c.above;
  const notAchieved = c.met + c.below;
  const judgedTotal = achieved + notAchieved;
  const rA = ratioPct(achieved, judgedTotal), rN = ratioPct(notAchieved, judgedTotal);
  const items = [
    { label: '対象人数', val: total + '名', tone: 'main' },
    { label: '目標達成', val: achieved + '名', sub: rA !== null ? rA + '%' : '', ratio: rA, tone: 'ok' },
    { label: '目標未達', val: notAchieved + '名', sub: rN !== null ? rN + '%' : '', ratio: rN, tone: 'bad' },
    { label: '内訳：伸びているが未達', val: c.met + '名', tone: 'warn' },
    { label: '内訳：売上が下がった（100%未満）', val: c.below + '名', tone: 'bad' },
    { label: 'データが少なくて判定できない人', val: c.insufficientData + '名' },
  ];
  document.getElementById('honbun-kpi-row').innerHTML = kpiCardsHtml(items, '判定対象の');
  document.getElementById('honbun-excluded-note').textContent =
    data.excludedCount ? '※ 伸び率95%未満（病気・休職等による著しい落ち込みとみなす）の' + data.excludedCount + '名を集計対象から除外しています。' : '';

  document.getElementById('th-honbun-before').textContent = data.periods.before.label + 'の1日平均売上';
  document.getElementById('th-honbun-after').textContent = data.periods.after.label + 'の1日平均売上';
  document.getElementById('th-honbun-return-before').textContent = data.periods.before.label + 'の帰る時刻';
  document.getElementById('th-honbun-return-after').textContent = data.periods.after.label + 'の帰る時刻';
  renderHonbunEmpTable();
}

function renderHonbunEmpTable() {
  if (!honbunData) return;
  const sortEl = document.getElementById('honbun-sort');
  const sort = sortEl ? sortEl.value : 'growth-asc';
  const byGrowthAsc = function(a, b) { return (a.salesGrowthPct ?? -Infinity) - (b.salesGrowthPct ?? -Infinity); };
  const list = honbunData.employees
    .filter(function(e) { return e.achievementCategory === 'met' || e.achievementCategory === 'below'; })
    .slice();
  list.sort(function(a, b) {
    if (sort === 'return-earlier') {
      const da = returnTimeDiffMin(a), db = returnTimeDiffMin(b);
      if (da === null && db === null) return byGrowthAsc(a, b);
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    }
    if (sort === 'return-after-asc') {
      const ta = returnTimeToMin(a.after && a.after.avgReturnTime);
      const tb = returnTimeToMin(b.after && b.after.avgReturnTime);
      if (ta === null && tb === null) return byGrowthAsc(a, b);
      if (ta === null) return 1;
      if (tb === null) return -1;
      return ta - tb;
    }
    return byGrowthAsc(a, b);
  });
  const emptyEl = document.getElementById('honbun-emp-empty');
  emptyEl.textContent = '該当する人はいません。';
  emptyEl.style.display = list.length ? 'none' : '';
  let tblHtml = '';
  list.forEach(function(e, i) {
    const diff = returnTimeDiffMin(e);
    const earlier = diff !== null && diff <= -5;
    const afterCell = earlier
      ? '<td class="num"><span class="frv-pill bad">' + (e.after.avgReturnTime ?? '—') + '<small>' + Math.abs(diff) + '分早い</small></span></td>'
      : '<td class="num">' + (e.after.avgReturnTime ?? '—') + '</td>';
    const growthCell = e.achievementCategory === 'below'
      ? '<td>' + growthPill(e.salesGrowthPct, '減少') + '</td>'
      : '<td>' + growthPill(e.salesGrowthPct) + '</td>';
    tblHtml += '<tr' + rowAttrs(e) + '>' +
      '<td class="frv-no">' + (i + 1) + '</td>' +
      '<td class="frv-name">' + escHtmlJs(e.empName) + '</td>' +
      '<td>' + divTeam(e) + '</td>' +
      '<td>' + dutyBadge(e.repDutyCode) + '</td>' +
      growthCell +
      '<td class="num">' + fmtYen(e.before.avgPerDuty) + '</td>' +
      '<td class="num">' + fmtYen(e.after.avgPerDuty) + '</td>' +
      '<td class="num">' + (e.before.avgReturnTime ?? '—') + '</td>' +
      afterCell +
      '</tr>';
  });
  document.getElementById('honbun-emp-tbody').innerHTML = tblHtml;
}

function honbunUrl() {
  const params = new URLSearchParams(buildQueryString());
  params.set('achievementThresholdPct', '103');
  params.set('excludeBelowGrowthPct', '95');
  return '/api/fare-revision/overview?' + params.toString();
}

function loadHonbunResult() {
  const url = honbunUrl();
  const emptyEl = document.getElementById('honbun-emp-empty');
  if (!isCached(url)) {
    emptyEl.style.display = 'none';
    document.getElementById('honbun-kpi-row').innerHTML = '<div class="sk sk-kpi"></div><div class="sk sk-kpi"></div><div class="sk sk-kpi"></div><div class="sk sk-kpi"></div>';
    document.getElementById('honbun-emp-tbody').innerHTML = skeletonRows(9, 8);
  }
  fetchJsonCached(url)
    .then(function(data) {
      if (url !== honbunUrl()) return; // 読み込み中に条件が変わった
      honbunData = data;
      renderHonbunResult(data);
    })
    .catch(function(err) {
      honbunData = null;
      document.getElementById('honbun-kpi-row').innerHTML = '';
      document.getElementById('honbun-emp-tbody').innerHTML = '';
      emptyEl.textContent = String((err && err.message) || err);
      emptyEl.style.display = '';
    });
}

function switchAllEmpCategory(cat) {
  currentAllEmpCategory = cat;
  document.querySelectorAll('#allemp-category-nav .frv-subtab-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });
  document.getElementById('allemp-title').textContent = '社員ごとの一覧（' + (CATEGORY_LABELS[cat] || cat) + '）';
  renderAllEmployeesTable();
}

function switchEmpSub(name) {
  currentEmpSub = name;
  ['summary', 'reasoning', 'daily'].forEach(function(n) {
    document.getElementById('emp-sub-' + n).style.display = n === name ? '' : 'none';
  });
  document.querySelectorAll('#view-individual .frv-subtab-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.sub === name);
  });
}

function printCurrentView() {
  const params = new URLSearchParams(buildQueryString());
  const isIndividual = document.getElementById('view-individual').style.display !== 'none';
  if (isIndividual) {
    if (!currentEmpId) { alert('先に個人ビューで社員を選んでください。'); return; }
    params.set('view', 'individual');
    params.set('empId', currentEmpId);
    if (currentEmpWageCategory) params.set('wageCategory', currentEmpWageCategory);
    // 個人レポートはサマリー＋判定理由をまとめた1枚のレポートとして印刷する（日ごとの記録はコピー用途では不要なので対象外）
  } else {
    params.set('view', 'overview');
    params.set('section', currentOverviewSub);
    if (currentOverviewSub === 'allemp') params.set('category', currentAllEmpCategory);
    if (currentOverviewSub === 'honbun') { params.set('achievementThresholdPct', '103'); params.set('excludeBelowGrowthPct', '95'); }
  }
  window.open(ADMIN_PATH + '/sales-ai/fare-revision/print?' + params.toString(), '_blank');
}

function updatePeriodHeaders(periods) {
  document.getElementById('th-flagged-before').textContent = periods.before.label + 'の1日平均売上';
  document.getElementById('th-flagged-after').textContent = periods.after.label + 'の1日平均売上';
  document.getElementById('th-allemp-before').textContent = periods.before.label + 'の1日平均売上';
  document.getElementById('th-allemp-after').textContent = periods.after.label + 'の1日平均売上';
  document.getElementById('emp-chart-title').textContent = '売上の移り変わり（' + periods.before.label + '・' + periods.after.label + 'を、乗務した日数でそろえて比較）';
}

function renderPeriodNote(periods) {
  document.getElementById('period-note').textContent =
    '今、比べている期間 — ' + periods.before.label + ': ' + periods.before.start + '〜' + periods.before.end + '（' + periods.before.days + '日間）　/　' +
    periods.after.label + ': ' + periods.after.start + '〜' + periods.after.end + '（' + periods.after.days + '日間）';
  const chip = document.getElementById('period-chip');
  chip.innerHTML = '<b>' + escHtmlJs(periods.before.label) + '</b> ' + escHtmlJs(periods.before.start) + '〜' + escHtmlJs(periods.before.end) +
    ' <span class="sep">→</span> <b>' + escHtmlJs(periods.after.label) + '</b> ' + escHtmlJs(periods.after.start) + '〜' + escHtmlJs(periods.after.end);
  chip.style.display = 'inline-flex';
}

function renderKpiRow(data) {
  const c = data.counts;
  const total = c.above + c.met + c.below + c.insufficientData;
  const rA = ratioPct(c.above, total), rM = ratioPct(c.met, total), rB = ratioPct(c.below, total);
  const items = [
    { label: '対象人数', val: total + '名', tone: 'main' },
    { label: '売上が' + data.thresholds.achievementThresholdPct + '%以上に伸びた人', val: c.above + '名', sub: rA !== null ? rA + '%' : '', ratio: rA, tone: 'ok' },
    { label: '伸びたけど目標未達の人', val: c.met + '名', sub: rM !== null ? rM + '%' : '', ratio: rM, tone: 'warn' },
    { label: '売上が下がった人', val: c.below + '名', sub: rB !== null ? rB + '%' : '', ratio: rB, tone: 'bad' },
    { label: 'データが少なくて判定できない人', val: c.insufficientData + '名' },
    { label: '早めに切り上げていそうな人', val: data.flagged.length + '名', tone: 'flag' },
    { label: '労働時間データがある割合', val: data.dataCoverage.coverageRatio + '%', ratio: data.dataCoverage.coverageRatio },
  ];
  document.getElementById('kpi-row').innerHTML = kpiCardsHtml(items, '全体の');
}

function renderHistogram(histogram) {
  const ctx = document.getElementById('histogram-chart').getContext('2d');
  const labels = histogram.map(function(h) { return h.bucketLabel; });
  const counts = histogram.map(function(h) { return h.count; });
  // 伸び具合ごとに色分け（100%未満=赤系、100〜110%=黄、110%以上=緑系、データ不足=灰）
  const HIST_COLORS = { '90%未満': '#f87171', '90〜100%': '#fca5a5', '100〜110%': '#fbbf24', '110〜120%': '#34d399', '120%以上': '#10b981' };
  const colors = labels.map(function(l) { return HIST_COLORS[l] || '#cbd5e1'; });
  if (histogramChart) histogramChart.destroy();
  histogramChart = new Chart(ctx, {
    type: 'bar',
    data: { labels: labels, datasets: [{ label: '社員数', data: counts, backgroundColor: colors, borderRadius: 6, maxBarThickness: 90 }] },
    options: {
      responsive: true,
      animation: { duration: 350 },
      plugins: { legend: { display: false } },
      scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#f1f5f9' } } },
    },
  });
}

function renderBreakdownTables(data) {
  let divHtml = '';
  data.divisionBreakdown.forEach(function(d) {
    divHtml += '<tr><td class="frv-name">' + d.division + '課</td><td>' + growthPill(d.avgSalesGrowthPct) + '</td><td class="num">' + d.empCount + '名</td></tr>';
  });
  document.getElementById('division-tbody').innerHTML = divHtml;

  let teamHtml = '';
  data.teamBreakdown.forEach(function(t) {
    teamHtml += '<tr><td class="frv-name">' + t.team + '班</td><td>' + growthPill(t.avgSalesGrowthPct) + '</td><td class="num">' + t.empCount + '名</td></tr>';
  });
  document.getElementById('team-tbody').innerHTML = teamHtml;

  let dutyHtml = '';
  data.dutyCategoryBreakdown.forEach(function(d) {
    dutyHtml += '<tr><td class="frv-name">' + escHtmlJs(d.label) + '</td><td>' + growthPill(d.avgSalesGrowthPct) + '</td><td class="num">' + d.empCount + '名</td></tr>';
  });
  document.getElementById('duty-tbody').innerHTML = dutyHtml;
}

function renderFlaggedTable(flagged) {
  document.getElementById('flagged-empty').style.display = flagged.length ? 'none' : '';
  document.getElementById('flagged-count').textContent = '(' + flagged.length + ')';
  let html = '';
  flagged.forEach(function(e, i) {
    html += '<tr' + rowAttrs(e) + '>' +
      '<td class="frv-no">' + (i + 1) + '</td>' +
      '<td class="frv-name">' + escHtmlJs(e.empName) + '</td>' +
      '<td>' + divTeam(e) + '</td>' +
      '<td class="num">' + fmtYen(e.before.avgPerDuty) + '</td>' +
      '<td class="num">' + fmtYen(e.after.avgPerDuty) + '</td>' +
      '<td>' + growthPill(e.salesGrowthPct) + '</td>' +
      '<td class="num">' + fmtPct(e.hourlyRateGrowthPct) + '</td>' +
      '<td class="num">' + fmtPct(e.laborHoursGrowthPct) + '</td>' +
      '<td>' + (e.earlyLeaveConfidence === 'high' ? '<span class="frv-pill bad">高</span>' : '<span class="frv-pill warn">中</span>') + '</td>' +
      '</tr>';
  });
  document.getElementById('flagged-tbody').innerHTML = html;
}

function updateCategoryCounts(counts) {
  document.getElementById('cat-count-above').textContent = '(' + counts.above + ')';
  document.getElementById('cat-count-met').textContent = '(' + counts.met + ')';
  document.getElementById('cat-count-below').textContent = '(' + counts.below + ')';
  document.getElementById('cat-count-insufficient_data').textContent = '(' + counts.insufficientData + ')';
}

function renderAllEmployeesTable() {
  if (!overviewData) return;
  const search = document.getElementById('all-emp-search').value.trim();
  const sort = document.getElementById('all-emp-sort').value;
  let list = overviewData.employees.filter(function(e) {
    return e.achievementCategory === currentAllEmpCategory && (!search || e.empName.indexOf(search) !== -1);
  });
  list = list.slice().sort(function(a, b) {
    if (sort === 'growth-desc') return (b.salesGrowthPct ?? -Infinity) - (a.salesGrowthPct ?? -Infinity);
    if (sort === 'growth-asc') return (a.salesGrowthPct ?? -Infinity) - (b.salesGrowthPct ?? -Infinity);
    return a.empName.localeCompare(b.empName, 'ja');
  });
  document.getElementById('all-emp-empty').style.display = list.length ? 'none' : '';
  let html = '';
  list.forEach(function(e, i) {
    html += '<tr' + rowAttrs(e) + '>' +
      '<td class="frv-no">' + (i + 1) + '</td>' +
      '<td class="frv-name">' + escHtmlJs(e.empName) + '</td>' +
      '<td>' + divTeam(e) + '</td>' +
      '<td>' + dutyBadge(e.repDutyCode) + '</td>' +
      '<td>' + growthPill(e.salesGrowthPct) + '</td>' +
      '<td class="num">' + fmtYen(e.before.avgPerDuty) + '</td>' +
      '<td class="num">' + fmtYen(e.after.avgPerDuty) + '</td>' +
      '<td class="num">' + fmtPct(e.laborHoursGrowthPct) + '</td>' +
      '</tr>';
  });
  document.getElementById('all-emp-tbody').innerHTML = html;
}

function renderCoverageNote(cov) {
  document.getElementById('coverage-note').textContent =
    '労働時間データの内訳（対象の全' + cov.totalRecordDays + '日のうち）: 実際の記録 ' + cov.actualLaborHoursDays + '日 ／ 出退庫の時刻から計算 ' + cov.estimatedLaborHoursDays + '日 ／ 記録なし ' + cov.missingLaborHoursDays + '日';
}

function populateDatalist(employees) {
  let html = '';
  employees.forEach(function(e) { html += '<option data-id="' + e.empId + '" data-category="' + (e.wageCategory || '') + '" value="' + escHtmlJs(e.empName) + '"></option>'; });
  document.getElementById('emp-datalist').innerHTML = html;
}

// 初回は骨組み表示、2回目以降（条件を変えて検索）は今の表示を薄くして上に読み込みバーを出す。
// 同じ条件の結果を覚えていれば一瞬で切り替わる。
let overviewReqSeq = 0;
function loadOverview() {
  const seq = ++overviewReqSeq;
  const url = '/api/fare-revision/overview?' + buildQueryString();
  const viewEl = document.getElementById('view-overview');
  const errEl = document.getElementById('load-error');
  errEl.style.display = 'none';
  const cached = isCached(url);
  if (!cached) {
    setSearchBusy(true);
    if (overviewData) viewEl.classList.add('frv-refreshing');
    else document.getElementById('loading').style.display = '';
  }
  fetchJsonCached(url)
    .then(function(data) {
      if (seq !== overviewReqSeq) return; // 読み込み中にもう一度検索された
      setSearchBusy(false);
      viewEl.classList.remove('frv-refreshing');
      overviewData = data;
      currentPeriods = data.periods;
      document.getElementById('loading').style.display = 'none';
      viewEl.style.display = document.getElementById('btn-view-overview').classList.contains('active') ? '' : 'none';
      updatePeriodHeaders(data.periods);
      renderPeriodNote(data.periods);
      renderKpiRow(data);
      renderHistogram(data.histogram);
      renderBreakdownTables(data);
      renderFlaggedTable(data.flagged);
      updateCategoryCounts(data.counts);
      document.getElementById('allemp-title').textContent = '社員ごとの一覧（' + (CATEGORY_LABELS[currentAllEmpCategory] || currentAllEmpCategory) + '）';
      renderAllEmployeesTable();
      renderCoverageNote(data.dataCoverage);
      populateDatalist(data.employees);
      // 「本分析結果」タブを開いたときに待たずに済むよう、裏で先読みしておく
      if (currentOverviewSub !== 'honbun') setTimeout(function() { fetchJsonCached(honbunUrl()).catch(function() {}); }, 300);
    })
    .catch(function(err) {
      if (seq !== overviewReqSeq) return;
      setSearchBusy(false);
      viewEl.classList.remove('frv-refreshing');
      document.getElementById('loading').style.display = 'none';
      errEl.textContent = String((err && err.message) || err);
      errEl.style.display = '';
    });
}

function onIndividualSearchInput() {
  const input = document.getElementById('individual-search');
  const val = input.value;
  const opts = document.getElementById('emp-datalist').querySelectorAll('option');
  for (let i = 0; i < opts.length; i++) {
    if (opts[i].value === val) { selectEmployee(Number(opts[i].dataset.id), val, opts[i].dataset.category || null); return; }
  }
}

function employeeUrl(empId, wageCategory) {
  const params = new URLSearchParams(buildQueryString());
  if (wageCategory) params.set('wageCategory', wageCategory);
  return '/api/fare-revision/employee/' + empId + '?' + params.toString();
}

// 一覧の行にマウスを乗せたら、その人のデータを裏で先読みしておく（クリック時に待たずに表示できる）
let prefetchTimer = null;
function prefetchEmployee(empId, wageCategory) {
  clearTimeout(prefetchTimer);
  prefetchTimer = setTimeout(function() {
    fetchJsonCached(employeeUrl(empId, wageCategory || null)).catch(function() {});
  }, 180);
}

function selectEmployee(empId, empName, wageCategory) {
  currentEmpId = empId;
  currentEmpWageCategory = wageCategory || null;
  switchView('individual');
  document.getElementById('individual-search').value = empName;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadEmployee(empId, currentEmpWageCategory);
}

function laborHoursSourceLabel(s) {
  if (s === 'actual') return '実際の記録';
  if (s === 'estimated') return '時刻から計算';
  return '記録なし';
}

function renderEmployeeKpi(cmp) {
  const beforeLabel = cmp.before.range.label;
  const afterLabel = cmp.after.range.label;
  const catTone = { above: 'ok', met: 'warn', below: 'bad' }[cmp.achievementCategory] || 'muted';
  const items = [
    { label: '1日あたり売上の伸び', val: fmtPct(cmp.salesGrowthPct), tone: growthTone(cmp.salesGrowthPct) === 'none' ? 'muted' : growthTone(cmp.salesGrowthPct) },
    { label: '判定', val: CATEGORY_LABELS[cmp.achievementCategory] || cmp.achievementCategory, tone: catTone },
    { label: '1時間あたり売上の伸び', val: fmtPct(cmp.hourlyRateGrowthPct), tone: 'main' },
    { label: '1乗務あたり労働時間の伸び', val: fmtPct(cmp.laborHoursGrowthPct), tone: 'main' },
    { label: '平均の1日の売上（' + beforeLabel + '→' + afterLabel + '）', val: fmtYen(cmp.before.avgPerDuty) + ' → ' + fmtYen(cmp.after.avgPerDuty), tone: 'main' },
    { label: '平均の帰る時刻（' + beforeLabel + '→' + afterLabel + '）', val: (cmp.before.avgReturnTime ?? '—') + ' → ' + (cmp.after.avgReturnTime ?? '—'), tone: 'main' },
  ];
  document.getElementById('emp-kpi-row').innerHTML = kpiCardsHtml(items, '');
  document.querySelectorAll('#emp-kpi-row .frv-kpi-val').forEach(function(el, i) { if (i >= 4) el.style.fontSize = '16px'; });
}

function renderEmployeeChart(dailyBefore, dailyAfter, periods) {
  const ctx = document.getElementById('emp-chart').getContext('2d');
  const maxOffset = Math.max(
    dailyBefore.reduce(function(m, r) { return Math.max(m, r.dayOffset); }, 0),
    dailyAfter.reduce(function(m, r) { return Math.max(m, r.dayOffset); }, 0)
  );
  const labels = [];
  for (let i = 0; i <= maxOffset; i++) labels.push(i + '日目');
  const beforeSeries = new Array(maxOffset + 1).fill(null);
  dailyBefore.forEach(function(r) { beforeSeries[r.dayOffset] = r.amount; });
  const afterSeries = new Array(maxOffset + 1).fill(null);
  dailyAfter.forEach(function(r) { afterSeries[r.dayOffset] = r.amount; });
  if (empChart) empChart.destroy();
  empChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { label: periods.before.label, data: beforeSeries, borderColor: '#9ca3af', backgroundColor: 'transparent', spanGaps: true, tension: 0.25, pointRadius: 2 },
        { label: periods.after.label, data: afterSeries, borderColor: '#0f8567', backgroundColor: 'rgba(15,133,103,0.08)', fill: true, spanGaps: true, tension: 0.25, pointRadius: 2 },
      ],
    },
    options: {
      responsive: true,
      animation: { duration: 350 },
      interaction: { mode: 'index', intersect: false },
      scales: { x: { grid: { display: false } }, y: { grid: { color: '#f1f5f9' } } },
    },
  });
}

function renderEmployeeReasoning(reasoning) {
  let html = '';
  reasoning.forEach(function(line) {
    const isFlag = line.indexOf('【早めに切り上げている可能性】') === 0;
    html += '<li' + (isFlag ? ' class="frv-flag"' : '') + '>' + escHtmlJs(line) + '</li>';
  });
  document.getElementById('emp-reasoning').innerHTML = html;
}

function renderEmployeeDaily(dailyBefore, dailyAfter, periods) {
  let html = '';
  function row(r, periodLabel) {
    return '<tr><td>' + escHtmlJs(periodLabel) + '</td><td class="num">' + r.date + '</td><td class="num">' + fmtYen(r.amount) + '</td>' +
      '<td class="num">' + (r.laborHoursResolved !== null ? r.laborHoursResolved + '時間' : '—') + '</td>' +
      '<td>' + laborHoursSourceLabel(r.laborHoursSource) + '</td><td class="num">' + (r.returnTime ?? '—') + '</td></tr>';
  }
  dailyAfter.slice().reverse().forEach(function(r) { html += row(r, periods.after.label); });
  dailyBefore.slice().reverse().forEach(function(r) { html += row(r, periods.before.label); });
  document.getElementById('emp-daily-tbody').innerHTML = html;
}

function loadEmployee(empId, wageCategory) {
  const url = employeeUrl(empId, wageCategory);
  const emptyEl = document.getElementById('individual-empty');
  const loadingEl = document.getElementById('individual-loading');
  const contentEl = document.getElementById('individual-content');
  emptyEl.style.display = 'none';
  if (!isCached(url)) {
    contentEl.style.display = 'none';
    loadingEl.style.display = '';
  }
  fetchJsonCached(url)
    .then(function(data) {
      if (empId !== currentEmpId) return; // 読み込み中に別の人が選ばれた
      loadingEl.style.display = 'none';
      if (data.error) { contentEl.style.display = 'none'; emptyEl.textContent = data.error; emptyEl.style.display = ''; return; }
      contentEl.style.display = '';
      contentEl.classList.remove('frv-fade'); void contentEl.offsetWidth; contentEl.classList.add('frv-fade');
      renderEmployeeKpi(data.comparison);
      renderEmployeeChart(data.dailyBefore, data.dailyAfter, data.periods);
      renderEmployeeReasoning(data.comparison.reasoning);
      renderEmployeeDaily(data.dailyBefore, data.dailyAfter, data.periods);
    })
    .catch(function(err) {
      loadingEl.style.display = 'none';
      contentEl.style.display = 'none';
      emptyEl.textContent = String((err && err.message) || err);
      emptyEl.style.display = '';
    });
}

// 条件パネルを触ったら「条件が変わりました」を出す。日付欄でEnterを押したら検索。
(function() {
  const card = document.getElementById('filter-card');
  card.addEventListener('change', function() { setDirty(true); });
  card.addEventListener('input', function(ev) { if (ev.target && ev.target.type === 'number') setDirty(true); });
  card.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter' && ev.target && ev.target.tagName === 'INPUT') { ev.preventDefault(); applyFilters(); }
  });
})();

populateYoyYearOptions();
onCompareModeChange();
loadOverview();
</script>`;

  return c.html(layout('運賃改定影響分析', content, 'sales-ai'));
});

// ===================================================
// 印刷ページ — ダッシュボードで選んでいる条件・タブをそのまま印刷する。
// view=overview のときは section=summary|breakdown|flagged|allemp、
// view=individual のときは empId必須で section=summary|reasoning|daily。
// ===================================================
app.get('/sales-ai/fare-revision/print', async (c) => {
  const view = c.req.query('view') === 'individual' ? 'individual' : 'overview';
  const backHref = `${ADMIN_PATH}/sales-ai/fare-revision`;
  const printedAtLabel = formatPrintedAtLabel();

  if (view === 'individual') {
    const empId = parseInt(c.req.query('empId') ?? '');
    if (isNaN(empId)) return c.text('社員が指定されていません', 400);
    // 個人レポートはサマリー＋判定理由をまとめた1枚のレポートとして印刷する（日ごとの記録はコピー用途では不要なので対象外）
    const result = await computeFareRevisionEmployee(c.env.DB, empId, c.req.query());
    if (!result) return c.text('社員が見つかりません', 404);
    return c.html(renderFareRevisionEmployeePrintPage(result, printedAtLabel, backHref));
  }

  const section = (['summary', 'honbun', 'breakdown', 'flagged', 'allemp'] as const).includes(c.req.query('section') as any)
    ? (c.req.query('section') as 'summary' | 'honbun' | 'breakdown' | 'flagged' | 'allemp') : 'summary';
  const category = (['above', 'met', 'below', 'insufficient_data'] as const).includes(c.req.query('category') as any)
    ? (c.req.query('category') as 'above' | 'met' | 'below' | 'insufficient_data') : null;
  const result = await computeFareRevisionOverview(c.env.DB, c.req.query());
  return c.html(renderFareRevisionOverviewPrintPage(section, result, printedAtLabel, backHref, category));
});

// ===================================================
// 運賃改定影響分析の計算ロジック解説（設定ページから遷移。閲覧専用・保存機能なし）
// ===================================================
app.get('/settings/fare-revision-guide', (c) => {
  const content = settingsSubHeader('運賃改定影響分析のしくみ') + `
<div style="max-width:760px;font-family:'Hiragino Sans','Meiryo',sans-serif;font-size:14px;line-height:1.9;color:#1f2937;">

  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
    <div style="font-weight:700;color:#1d4ed8;margin-bottom:6px;">ひとことで言うと</div>
    <div style="color:#1e3a5f;">2026年4月20日に運賃が約10%値上げされました。「値上げの前」と「値上げの後」で、同じ人の売上や働いた時間がどう変わったかを、コンピューターが自動で計算して比べているだけです。<b>AIという名前がついていますが、ChatGPTのような外部のAIサービスには一切つないでいません。</b>すべて「〇〇円 ÷ 〇〇円」のような普通の割り算と、「もし〇〇より大きかったら」という条件分岐の組み合わせです。</div>
  </div>

  <h3 style="font-size:15px;color:#1a3a5c;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin-top:28px;">① まず「前」と「後」の期間を決める</h3>
  <p>「比較のしかた」で2つのモードを選べます。既定は運賃改定の前後比較専用です。「後」＝4月20日〜今日（「運賃改定後の期間」で調整可）。「後」が仮に100日間なら、「前」も同じ100日間（4月19日からさかのぼって100日間）にします。日数をそろえないと、単純に日数が多いほうが売上合計も大きくなってしまい、フェアな比較になりません。</p>
  <p style="color:#4b5563;">もう1つの「前年の同じ月と比較」モードでは、日数をそろえる代わりに、去年と今年の同じ月同士（例: 2025年4月度と2026年4月度、2025年7月度と2026年7月度）を比べます。運賃改定日をまたがない月同士の比較にも使え、曜日の並びや季節のイベント（お盆・年末年始など）の影響をある程度そろえた比較ができます。まだ終わっていない月を選ぶと、今日までのデータで計算します。</p>
  <p style="color:#4b5563;">なお、「前」の期間が始まった時点でまだ入社していなかった人（入社が改定間近〜改定後の新人など）は、この分析の対象には含めていません。そのような人を含めてしまうと、単に在籍日数が「前」と「後」で大きく違うだけで、売上の伸び率が数百〜千数百%という運賃改定とは無関係な数字になってしまい、誤解を招くためです。去年の同じ時期との比較や、自分で自由に期間を指定した単純な比較は「AI売上分析」の別タブ「期間比較」で行えます。</p>

  <h3 style="font-size:15px;color:#1a3a5c;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin-top:28px;">② 1日あたり何時間働いたかを出す</h3>
  <p>「時間あたりいくら稼いだか」を計算するには、働いた時間が必要です。</p>
  <ul style="padding-left:22px;">
    <li>ホシコンの記録に「実際の労働時間」があれば、それをそのまま使います（一番信頼できる数字）。</li>
    <li>もし記録がなければ、「出庫した時刻」〜「帰庫した時刻」の差を代わりに使います。ただしこれは休憩時間も含んでしまうので、実際に働いた時間より少し長めに出ます。</li>
    <li>夜勤などで日をまたぐ場合（例：出庫19:00→帰庫翌3:00）はちゃんと8時間として計算します。逆に0時間以下やあまりに長すぎる（20時間超）記録は、データがおかしいと判断して使いません。</li>
  </ul>

  <h3 style="font-size:15px;color:#1a3a5c;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin-top:28px;">③ 伸び率（％）の計算のしかた</h3>
  <p>これが一番の基本です。とてもシンプルな割り算です。</p>
  <div style="background:#f8fafc;border-radius:8px;padding:14px 18px;margin:10px 0;font-size:13.5px;">
    伸び率（％） ＝ 後の期間の数字 ÷ 前の期間の数字 × 100
  </div>
  <p style="color:#4b5563;">例えば「前」の1日あたり平均売上が20,000円、「後」が23,000円なら、23,000 ÷ 20,000 × 100 = <b>115%</b> です。100%より大きければ増えた、小さければ減ったという意味になります。これと同じ計算を、時間単価（1時間あたりの売上）・働いた時間・乗務日数のそれぞれについて行っています。</p>
  <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin:10px 0;font-size:13px;color:#1e3a5f;">
    <b>「売上の伸び」は総売上（合計金額）ではなく、必ず「1日あたりの平均売上」で計算しています。</b>入社したばかりの人や、体調不良・家庭の事情などで働く日数自体が「前」と「後」で大きく変わった人がいると、総売上どうしを比べると本人の頑張り具合とは関係なく数字が大きくブレてしまうためです（例：前の期間は10日しか記録がなく、後の期間は120日ほぼフルで働いた場合、総売上は10倍以上になりますが、それは単に働いた日数が増えただけです）。1日あたりの平均で比べることで、日数の増減の影響を除いています。乗務日数そのものの伸び率も社員別の「判定理由」に表示されるので、日数が大きく変わっている場合はそちらで確認できます。</div>

  <h3 style="font-size:15px;color:#1a3a5c;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin-top:28px;">④ 「達成」「未達」「減少」をどう決めるか</h3>
  <p>売上の伸び率をもとに、4つに振り分けます（目標ラインは「くわしい設定」で変更可能。既定は110%）。</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;margin:10px 0;">
    <tr style="background:#f3f4f6;"><th style="text-align:left;padding:6px 10px;border:1px solid #e5e7eb;">判定</th><th style="text-align:left;padding:6px 10px;border:1px solid #e5e7eb;">条件</th></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;color:#16a34a;font-weight:700;">目標達成</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">伸び率が110%以上（値上げ分をしっかり上回って伸びた）</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;color:#b45309;font-weight:700;">伸びたが未達</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">100%以上110%未満（伸びてはいるが目標には届いていない）</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;color:#dc2626;font-weight:700;">減少</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">100%未満（前より売上が減った）</td></tr>
    <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;color:#6b7280;font-weight:700;">データ不足</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">前後どちらかの期間の乗務日数が少なすぎる（既定：5日未満）ときは、判定せずに「わからない」として扱う</td></tr>
  </table>
  <p style="color:#4b5563;">乗務日数が少ないと、たまたま1日だけ調子が良かった／悪かっただけで伸び率が大きくブレてしまうため、一定日数に満たない人は判定を保留しています。</p>

  <h3 style="font-size:15px;color:#1a3a5c;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin-top:28px;">⑤ 「早めに切り上げていそうな人」はどう見つけているか</h3>
  <p>これがこの機能でいちばん複雑な部分です。考え方はこうです。</p>
  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px 18px;margin:10px 0;">
    もし「売上」は運賃改定の前とほとんど変わっていないのに、<br>
    「働いた時間の合計」ははっきり短くなっている ―― それはつまり、<br>
    <b>運賃が上がった分だけ、いつもの目標額に早く到達して、早めに仕事を切り上げている</b>可能性がある、という推測です。<br>
    （売上が同じで時間だけ短くなれば、1時間あたりの単価は自動的に上がることになります）
  </div>
  <p>これを数字で判定すると、次の<b>2つの条件が両方とも</b>成り立ったときにフラグが立ちます（数字は「くわしい設定」で調整可能）。</p>
  <ol style="padding-left:22px;">
    <li>売上の伸び率が、100%を中心に既定±8%の範囲に収まっている＝「売上はほぼ変わっていない」</li>
    <li>1乗務あたりの平均労働時間の伸び率が、既定97%を下回っている＝「1回の乗務そのものがはっきり短くなっている」（乗務日数そのものが減っただけの人と区別するため、合計労働時間ではなく1乗務あたりの平均で判定しています）</li>
  </ol>
  <p style="color:#4b5563;">「確からしさ」は、労働時間の記録が実際の記録中心なら<b>高い</b>、出退庫時刻からの推定を多く含む場合は<b>中くらい</b>と表示されます。あくまで参考情報であり、この判定だけで本人を評価するものではありません。</p>

  <h3 style="font-size:15px;color:#1a3a5c;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin-top:28px;">⑥ 全体の集計（グラフや課別の表）</h3>
  <ul style="padding-left:22px;">
    <li><b>分布グラフ</b>：全員の売上伸び率を「90%未満」「90〜100%」「100〜110%」「110〜120%」「120%以上」の5つの箱に振り分けて人数を数えているだけです。</li>
    <li><b>課別・班別・勤務区分別の平均</b>：それぞれのグループに属する人（ただし④の「データ不足」の人は平均が歪むため除外）の伸び率を単純平均しています。</li>
  </ul>

  <h3 style="font-size:15px;color:#1a3a5c;border-bottom:2px solid #e5e7eb;padding-bottom:6px;margin-top:28px;">⑦ 覚えておいてほしいこと</h3>
  <ul style="padding-left:22px;">
    <li>すべてホシコンの売上記録（<code>sales_records</code>）など、もともとあるデータの集計で、新しく特別なデータを作っているわけではありません。</li>
    <li>あくまで自動集計＋しきい値判定であり、有給・欠勤・体調不良・イベントなど、数字に出ない事情までは考慮できません。最終的な判断は必ず人の目で確認してください。</li>
    <li>「くわしい設定」のしきい値（目標達成ライン・売上ほぼ変わらないとみなす範囲・時間減少の目安・最低乗務日数など）は分析画面からその場で自由に変更して試せます。保存はされず、画面を開き直すと既定値に戻ります。</li>
  </ul>

  <div style="margin-top:28px;">
    <a href="${ADMIN_PATH}/sales-ai/fare-revision" style="color:#2563eb;font-size:13px;">→ 運賃改定影響分析の画面に戻る</a>
  </div>
</div>`;
  return c.html(layout('運賃改定影響分析のしくみ', content, 'settings'));
});

export default app;
