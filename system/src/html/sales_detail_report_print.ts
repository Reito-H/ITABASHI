// 個人別「売上推移 詳細分析レポート」（A4縦・複数ページ）と「日別売上 全データ一覧」（A4横・複数ページ）の印刷ページ
// /sales-ai/employee/:id/detail-report/print ・ /sales-ai/employee/:id/daily-list/print
// 集計・文章は utils/sales_detail_report.ts（ルールベース。外部AI/LLM APIは使用しない）。
// 各ページは右下に「ホシコンAI売上分析システム」を入れ、既存の AI売上分析レポート（sales_ai_report_print.ts）と見た目を揃える。
import { escHtml, FAVICON_DATA_URI } from './layout';
import { comboChart, lineChart, vBarChart, divergingChart, C_NAVY, C_BLUE, C_GRAY, C_GREEN, C_RED, C_AMBER } from './print_svg_charts';
import {
  type SalesDetailAnalysis, type DetailDay, type CsvCoverage, coverageRangeText, RAW, yen, man, comma, dayNotes, decToHm, minToHm,
} from '../utils/sales_detail_report';

export interface SalesDetailPageMeta {
  name: string; empNo: string; division: number | null; team: number | null;
  issuedDateLabel: string; backHref: string;
  coverage: CsvCoverage | null;   // 全社の売上CSV取込状況（帳票に取込期間を明記するため）
  rangeFrom: string | null;       // 指定された開始月度（"YYYY-MM"。null＝最初から）
  rangeTo: string | null;         // 指定された終了月度（"YYYY-MM"。null＝最後まで）
}

// 指定期間の表示名（例: "2025年5月度〜2026年3月度"／未指定なら "全期間"）
function rangeLabel(m: SalesDetailPageMeta): string {
  const f = (v: string) => { const [y, mo] = v.split('-'); return `${y}年${Number(mo)}月度`; };
  if (!m.rangeFrom && !m.rangeTo) return '全期間';
  return `${m.rangeFrom ? f(m.rangeFrom) : '最初'}〜${m.rangeTo ? f(m.rangeTo) : '最新'}`;
}

const CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; color: #111827; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.toolbar { position: sticky; top: 0; z-index: 10; background: #1a3a5c; padding: 10px 16px; display: flex; gap: 8px; align-items: center; }
.toolbar a, .toolbar button { font-size: 13px; padding: 7px 16px; border-radius: 6px; border: none; cursor: pointer; text-decoration: none; font-weight: 600; }
.toolbar a { background: #374151; color: #fff; }
.toolbar button.print-btn { background: #2563eb; color: #fff; }
.toolbar .hint { margin-left: auto; font-size: 12px; color: #cbd5e1; }
.toolbar .range { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #e2e8f0; margin-left: 8px; }
.toolbar .range input { font-size: 12px; padding: 4px 6px; border-radius: 5px; border: 1px solid #94a3b8; }
.toolbar .range button { background: #e2e8f0; color: #1a3a5c; padding: 5px 10px; }
.stage { padding: 24px; display: flex; flex-direction: column; align-items: center; gap: 24px; }
.sheet { width: 210mm; height: 297mm; background: #fff; padding: 13mm 15mm 20mm; box-shadow: 0 4px 20px rgba(0,0,0,0.25); overflow: hidden; position: relative; }
.sheet.land { width: 297mm; height: 210mm; padding: 9mm 10mm 15mm; }
.sheet-fit { width: 100%; transform-origin: top left; }
.sr-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1a3a5c; padding-bottom: 8px; margin-bottom: 10px; }
.land .sr-head { padding-bottom: 5px; margin-bottom: 6px; }
.sr-head h1 { font-size: 18px; margin: 0; color: #1a3a5c; letter-spacing: .04em; }
.land .sr-head h1 { font-size: 15px; }
.sr-head .sub { font-size: 10px; color: #9ca3af; margin-top: 3px; }
.sr-head .meta { text-align: right; font-size: 10px; color: #6b7280; line-height: 1.7; }
.sr-badge { display: inline-block; background: #eff6ff; color: #1a3a5c; border: 1px solid #bfdbfe; border-radius: 20px; padding: 2px 12px; font-size: 9.5px; font-weight: 700; margin-bottom: 4px; }
.sr-to { font-size: 19px; font-weight: 800; margin-bottom: 2px; }
.sr-to .suffix { font-size: 14px; font-weight: 600; color: #374151; margin-left: 4px; }
.sr-to-sub { font-size: 11px; color: #6b7280; margin-bottom: 10px; }
.sr-kpis { display: flex; gap: 8px; margin-bottom: 10px; }
.sr-kpi { flex: 1; background: #f9fafb; border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px; text-align: center; }
.sr-kpi-label { font-size: 9px; color: #9ca3af; font-weight: 700; }
.sr-kpi-value { font-size: 15px; font-weight: 800; color: #1a3a5c; margin-top: 2px; }
.sr-kpi-note { font-size: 8.5px; color: #6b7280; margin-top: 1px; }
.sr-headline { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 700; color: #78350f; margin-bottom: 10px; line-height: 1.7; }
.sr-section { margin-bottom: 9px; }
.sr-section-title { font-size: 11.5px; font-weight: 700; color: #1a3a5c; margin-bottom: 5px; padding-left: 7px; border-left: 4px solid #1a3a5c; }
.sr-section-title .note { font-weight: 400; color: #9ca3af; font-size: 9px; margin-left: 6px; }
.sr-body-text { font-size: 10.8px; line-height: 1.75; color: #1f2937; }
.sr-list { margin: 0; padding-left: 17px; font-size: 10.8px; line-height: 1.7; color: #1f2937; }
.sr-list li { margin-bottom: 3px; }
.sr-cols { display: flex; gap: 12px; }
.sr-cols > div { flex: 1; min-width: 0; }
.sr-weak .sr-section-title { color: #b91c1c; border-left-color: #b91c1c; }
.sr-strong .sr-section-title { color: #166534; border-left-color: #166534; }
.sr-closing { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 9px 13px; font-size: 11px; line-height: 1.75; color: #0c4a6e; margin-bottom: 10px; }
.sr-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 6px 8px 4px; }
.sr-point { background: #f8fafc; border-left: 3px solid #2563eb; padding: 6px 10px; font-size: 10.5px; line-height: 1.7; margin-bottom: 8px; color: #1e293b; }
.sr-point b { color: #1a3a5c; }
.sr-disclaimer { font-size: 8.5px; color: #9ca3af; line-height: 1.6; border-top: 1px dashed #94a3b8; padding-top: 6px; margin-top: 6px; }
.sr-foot { position: absolute; left: 15mm; right: 15mm; bottom: 9mm; display: flex; justify-content: space-between; align-items: flex-end; padding-top: 5px; border-top: 1px solid #e5e7eb; }
.land .sr-foot { left: 10mm; right: 10mm; bottom: 5mm; }
.sr-foot .left { font-size: 8.5px; color: #9ca3af; }
.sr-foot .right { text-align: right; font-size: 8.5px; color: #9ca3af; line-height: 1.5; }
.sr-foot .right .brand { font-size: 10.5px; font-weight: 800; color: #1a3a5c; }
table.t { width: 100%; border-collapse: collapse; font-size: 8.6px; font-variant-numeric: tabular-nums; }
table.t th { background: #1a3a5c; color: #fff; font-weight: 700; padding: 3px; border: 1px solid #1a3a5c; white-space: nowrap; font-size: 8.3px; }
table.t td { padding: 2px 4px; border: 1px solid #e2e8f0; text-align: right; white-space: nowrap; height: 15px; }
table.t td.l { text-align: left; } table.t td.c { text-align: center; }
table.t tr:nth-child(even) td { background: #f8fafc; }
table.t tr.sub td { background: #eff6ff !important; font-weight: 700; color: #1a3a5c; border-top: 1.5px solid #93c5fd; }
table.t tr.grand td { background: #1a3a5c !important; color: #fff; font-weight: 800; }
table.t td.sat { color: #2563eb; } table.t td.sun { color: #dc2626; }
table.t.dense { font-size: 7.4px; }
table.t.dense th { font-size: 7.1px; padding: 2px 1px; line-height: 1.25; white-space: normal; }
table.t.dense td { padding: 1px 2px; height: 12.6px; }
table.t.dense div.wx, table.t.dense div.nt { white-space: normal; width: 62px; font-size: 6.3px; line-height: 1.1; text-align: left; overflow: hidden; max-height: 14px; }
table.t.dense div.nt { width: 58px; color: #6b7280; }
.hi { color: #15803d; font-weight: 700; } .lo { color: #b91c1c; font-weight: 700; }
.legend-line { font-size: 8.5px; color: #6b7280; margin-top: 4px; }
@media print {
  @page { size: A4 portrait; margin: 0; }
  html, body { background: #fff; }
  .toolbar { display: none; }
  .stage { padding: 0; gap: 0; }
  .sheet { box-shadow: none; margin: 0; page-break-after: always; }
  .sheet:last-child { page-break-after: auto; }
}
`;
const LAND_PAGE_CSS = `@media print { @page { size: A4 landscape; margin: 0; } }`;

// ページ内容がはみ出した場合だけ縮小して1枚に収める（sales_ai_report_print.ts と同じ収束ループ）
const FIT_SCRIPT = `
<script>
  function fitSheet(sheet) {
    var fit = sheet.querySelector('.sheet-fit');
    if (!fit) return;
    var cs = getComputedStyle(sheet);
    var available = sheet.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var availW = sheet.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    fit.style.transform = 'none'; fit.style.width = '100%';
    var scale = 1;
    // 表が横にはみ出す場合（全データ一覧）は、まず幅に合わせて縮小する
    if (fit.scrollWidth > availW + 1) {
      scale = availW / fit.scrollWidth;
      fit.style.width = (100 / scale) + '%';
      fit.style.transform = 'scale(' + scale + ')';
    }
    for (var j = 0; j < 6; j++) {
      var natural = fit.scrollHeight;
      if (natural <= 0 || natural * scale <= available) break;
      scale = (available / natural) * 0.97;
      fit.style.width = (100 / scale) + '%';
      fit.style.transform = 'scale(' + scale + ')';
    }
  }
  function fitAll() { document.querySelectorAll('.sheet').forEach(fitSheet); }
  fitAll();
  window.addEventListener('load', fitAll);
  window.addEventListener('beforeprint', fitAll);
</script>`;

const e = escHtml;
const slash = (d: string) => d.replace(/-/g, '/');
const fx = (v: number | null | undefined, d = 1) => v == null ? '' : v.toFixed(d);
const fi = (v: number | null | undefined) => v == null ? '' : comma(v);
// 取込漏れの疑いがある日（記録なし／件数が普段の3割未満）の注記
function coverageWarn(c: CsvCoverage | null): string {
  if (!c) return '';
  const parts: string[] = [];
  if (c.missing.length) parts.push(`記録が1件もない日：${c.missing.slice(0, 10).map(d => slash(d)).join('、')}${c.missing.length > 10 ? ` ほか${c.missing.length - 10}日` : ''}`);
  if (c.sparse.length) parts.push(`件数が普段（約${c.medianCount}件/日）より極端に少ない日：${c.sparse.slice(0, 10).map(x => `${slash(x.date)}（${x.n}件）`).join('、')}${c.sparse.length > 10 ? ` ほか${c.sparse.length - 10}日` : ''}`);
  return parts.length ? `※売上CSVの取込漏れの可能性がある日 ― ${parts.join('／')}。該当日の乗務は集計に含まれていない場合があります。` : '';
}
const pct1 = (v: number | null | undefined) => v == null ? '' : `${(v * 100).toFixed(1)}%`;
function wdCls(d: DetailDay) { return d.f.weekday === 0 || d.f.isHoliday ? 'sun' : d.f.weekday === 6 ? 'sat' : ''; }

function sheet(o: {
  meta: SalesDetailPageMeta; a: SalesDetailAnalysis; badge: string; title: string; sub: string; body: string;
  pno: number; ptotal: number; showTo?: boolean; land?: boolean; dutyLabel: string;
}): string {
  const m = o.meta;
  const who = `${m.division != null ? `${m.division}課` : ''}${m.team != null ? `${m.team}班` : ''}`;
  const to = o.showTo
    ? `<div class="sr-to">${e(m.name)}<span class="suffix">様</span></div><div class="sr-to-sub">${e(who)}${who ? ' ／ ' : ''}社員番号 ${e(m.empNo)} ／ 主な勤務区分 ${e(o.dutyLabel)}</div>`
    : '';
  return `
<div class="sheet${o.land ? ' land' : ''}">
  <div class="sheet-fit">
    <div class="sr-head">
      <div><div class="sr-badge">${e(o.badge)}</div><h1>${e(o.title)}</h1><div class="sub">${e(o.sub)}</div></div>
      <div class="meta">発行日：${e(m.issuedDateLabel)}<br>対象期間：${slash(o.a.firstDate)} 〜 ${slash(o.a.lastDate)}${m.coverage ? `<br>CSV取込済み（全社）：${e(coverageRangeText(m.coverage))}` : ''}${o.showTo ? '' : `<br>${e(m.name)} 様${who ? `（${e(who)}）` : ''}`}</div>
    </div>
    ${to}
    ${o.body}
  </div>
  <div class="sr-foot">
    <div class="left">本紙は社内システムより自動生成されています（${o.pno} / ${o.ptotal}）</div>
    <div class="right">発行日時: <span class="issued-at"></span><br><span class="brand">ホシコンAI売上分析システム</span></div>
  </div>
</div>`;
}

function shell(title: string, hint: string, meta: SalesDetailPageMeta, sheets: string[], land = false): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="robots" content="noindex, nofollow">
<title>${e(title)}</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<style>${CSS}${land ? LAND_PAGE_CSS : ''}</style>
</head>
<body>
  <div class="toolbar">
    <a href="${meta.backHref}">← 社員カルテに戻る</a>
    <button class="print-btn" onclick="window.print()">印刷 / PDF保存</button>
    <span class="range">期間
      <input type="month" id="range-from" value="${e(meta.rangeFrom ?? '')}">〜<input type="month" id="range-to" value="${e(meta.rangeTo ?? '')}">月度
      <button type="button" onclick="applyRange()">表示</button>
      <button type="button" onclick="document.getElementById('range-from').value='';document.getElementById('range-to').value='';applyRange()">全期間</button>
    </span>
    <span class="hint">${e(hint)}</span>
  </div>
  <div class="stage">${sheets.join('')}</div>
  <script>
    // 月度の範囲を指定して再表示（空欄＝制限なし）
    function applyRange() {
      var f = document.getElementById('range-from').value, t = document.getElementById('range-to').value;
      var q = new URLSearchParams();
      if (f) q.set('from', f);
      if (t) q.set('to', t);
      location.search = q.toString();
    }
  </script>
  <script>document.querySelectorAll('.issued-at').forEach(function(el) { el.textContent = new Date().toLocaleString('ja-JP'); });</script>
  ${FIT_SCRIPT}
</body>
</html>`;
}

// =====================================================================
// 詳細分析レポート（A4縦7ページ）
// =====================================================================
export function renderSalesDetailReportPage(meta: SalesDetailPageMeta, a: SalesDetailAnalysis): string {
  const D = a.dutyLabel, T = a.text, M = a.months;
  const labels = M.map(m => m.short + (m.partial ? '*' : ''));
  const days = a.days.filter(d => d.amount > 0);
  const hasPeer = M.some(m => m.peer);
  const partial = M.find(m => m.partial);
  const every = M.length > 12 ? 2 : 1;

  // ---- 1ページ目 ----
  const last3 = a.completed.slice(-3);
  const kpis = `<div class="sr-kpis">
    <div class="sr-kpi"><div class="sr-kpi-label">乗務回数</div><div class="sr-kpi-value">${a.n}回</div><div class="sr-kpi-note">${e(D)}</div></div>
    <div class="sr-kpi"><div class="sr-kpi-label">累計売上</div><div class="sr-kpi-value" style="font-size:13.5px;">${yen(a.total)}</div></div>
    <div class="sr-kpi"><div class="sr-kpi-label">平均日商</div><div class="sr-kpi-value">${yen(a.avg)}</div>${a.ratio != null ? `<div class="sr-kpi-note">同僚平均比 ${a.ratio >= 0 ? '+' : ''}${(a.ratio * 100).toFixed(0)}%</div>` : ''}</div>
    <div class="sr-kpi"><div class="sr-kpi-label">最高日商</div><div class="sr-kpi-value">${yen(a.best.amount)}</div><div class="sr-kpi-note">${slash(a.best.date)}</div></div>
    ${a.topPctAvg != null ? `<div class="sr-kpi"><div class="sr-kpi-label">${e(D)}内の順位</div><div class="sr-kpi-value">上位${Math.round(a.topPctAvg * 100)}%</div><div class="sr-kpi-note">月度平均（約${Math.round(a.peerCountAvg ?? 0)}人中）</div></div>` : ''}
    <div class="sr-kpi"><div class="sr-kpi-label">直近${last3.length}月度</div><div class="sr-kpi-value">${yen(last3.reduce((s, m) => s + m.total, 0) / Math.max(1, last3.reduce((s, m) => s + m.n, 0)))}</div><div class="sr-kpi-note">平均日商</div></div>
  </div>`;
  const chMonth = comboChart({
    labels, bars: M.map(m => m.total), labelEvery: M.length > 20 ? 2 : 1,
    lines: [{ name: '本人', values: M.map(m => m.avg), color: C_NAVY }, ...(hasPeer ? [{ name: '同僚', values: M.map(m => m.peer?.avg ?? null), color: C_GRAY, dash: true }] : [])],
    lineLo: Math.min(...M.map(m => Math.min(m.avg, m.peer?.avg ?? m.avg))) * 0.85,
    highlight: new Set(M.map((m, i) => m.partial ? i : -1).filter(i => i >= 0)),
    legend: [['月度合計（左軸）', '#c7d2fe', 'bar'], ['本人 平均日商（右軸）', C_NAVY, 'line'], ...(hasPeer ? [[`同僚${D} 平均日商（右軸）`, C_GRAY, 'dash'] as const] : [])] as any,
  });
  const p1 = `${kpis}
    <div class="sr-headline">${e(T.headline)}</div>
    <div class="sr-section"><div class="sr-section-title">月度別 売上推移${partial ? `<span class="note">* は集計途中（${slash(partial.last)}まで）の月度</span>` : ''}</div><div class="sr-box">${chMonth}</div></div>
    <div class="sr-section"><div class="sr-section-title">総評</div><div class="sr-body-text">${e(T.summary)}</div></div>
    <div class="sr-section"><div class="sr-section-title">分析のポイント</div>
      ${T.points.map((p, i) => `<div class="sr-point"><b>${i + 1}. ${e(p.title)}</b>　${e(p.body)}</div>`).join('')}
    </div>`;

  // ---- 2ページ目：日商の推移と前年比較 ----
  const keyToPeer = new Map(M.map(m => [m.key, m.peer?.avg ?? null]));
  const firstIdx: number[] = []; const seen = new Set<string>();
  days.forEach((d, i) => { if (!seen.has(d.key)) { seen.add(d.key); firstIdx.push(i); } });
  const labelPos = firstIdx.filter((_, j) => j % Math.max(1, Math.ceil(firstIdx.length / 9)) === 0);
  const maWin = Math.min(13, Math.max(3, Math.round(days.length / 15)));
  const chDaily = lineChart({
    labels: days.map(d => `${String(d.py).slice(2)}/${d.pm}月度`), labelPositions: labelPos, w: 700, h: 230,
    lo: Math.min(...days.map(d => d.amount)) * 0.9, hi: Math.max(...days.map(d => d.amount)) * 1.02,
    points: days.map((d, i) => ({ i, v: d.amount, color: d.amount >= a.highLine ? C_GREEN : d.amount < a.lowLine ? C_RED : '#60a5fa' })),
    lines: [{ name: 'ma', values: a.ma, color: C_NAVY, width: 2.4 }, ...(hasPeer ? [{ name: 'peer', values: days.map(d => keyToPeer.get(d.key) ?? null), color: C_GRAY, dash: true, width: 1.6 }] : [])],
    refs: [{ value: a.avg, color: C_AMBER, text: `期間平均 ${yen(a.avg)}` }],
    legend: [['日商（1乗務）', '#60a5fa', 'dot'], [`${man(a.highLine)}円以上`, C_GREEN, 'dot'], [`${man(a.lowLine)}円未満`, C_RED, 'dot'], [`${maWin}乗務移動平均`, C_NAVY, 'line'], ...(hasPeer ? [[`同僚${D}平均`, C_GRAY, 'dash'] as const] : [])] as any,
  });
  const chHist = vBarChart({
    labels: a.hist.map(h => (h.lo / 10000).toFixed(a.histStep % 10000 ? (a.histStep % 1000 ? 2 : 1) : 0)), values: a.hist.map(h => h.count), w: 340, h: 170, fmt: v => `${Math.round(v)}`,
    colors: a.hist.map(h => h.lo + a.histStep <= a.lowLine ? C_RED : h.lo >= a.highLine ? C_GREEN : '#60a5fa'),
  });
  const y = a.yoy;
  const yoyTbl = y ? `<table class="t" style="font-size:8.8px;"><tr><th></th><th>前年同期</th><th>今期</th><th>増減</th></tr>
    <tr><td class="l">本人 平均日商</td><td>${yen(y.self0)}</td><td>${yen(y.self1)}</td><td class="${y.self1 >= y.self0 ? 'hi' : 'lo'}">${(((y.self1 / y.self0) - 1) * 100).toFixed(1)}%</td></tr>
    ${y.peer0 && y.peer1 ? `<tr><td class="l">同僚${e(D)} 平均日商</td><td>${yen(y.peer0)}</td><td>${yen(y.peer1)}</td><td>${(((y.peer1 / y.peer0) - 1) * 100).toFixed(1)}%</td></tr>` : ''}
    ${y.rides0 && y.rides1 ? `<tr><td class="l">本人 営業回数</td><td>${y.rides0.toFixed(1)}回</td><td>${y.rides1.toFixed(1)}回</td><td>${(((y.rides1 / y.rides0) - 1) * 100).toFixed(1)}%</td></tr>` : ''}
    ${y.unit0 && y.unit1 ? `<tr><td class="l">本人 客単価</td><td>${yen(y.unit0)}</td><td>${yen(y.unit1)}</td><td>${(((y.unit1 / y.unit0) - 1) * 100).toFixed(1)}%</td></tr>` : ''}
    ${y.jr0 != null && y.jr1 != null ? `<tr><td class="l">本人 実車率</td><td>${pct1(y.jr0)}</td><td>${pct1(y.jr1)}</td><td>${((y.jr1 - y.jr0) * 100).toFixed(1)}pt</td></tr>` : ''}
    ${y.ph0 && y.ph1 ? `<tr><td class="l">本人 時間売上</td><td>${yen(y.ph0)}</td><td>${yen(y.ph1)}</td><td>${(((y.ph1 / y.ph0) - 1) * 100).toFixed(1)}%</td></tr>` : ''}
    <tr><td class="l">乗務回数</td><td>${y.n0}回</td><td>${y.n1}回</td><td></td></tr></table>
    <div class="legend-line">対象：${e(y.months)}（前年は同じ月度）</div>`
    : `<div class="sr-body-text" style="color:#9ca3af;">前年同期と比較できる期間のデータがありません</div>`;
  const p2 = `
    <div class="sr-section"><div class="sr-section-title">1乗務ごとの日商推移<span class="note">点＝各乗務の税込収入／線＝直近${maWin}乗務の移動平均</span></div><div class="sr-box">${chDaily}</div></div>
    <div class="sr-section"><div class="sr-section-title">流れの読み取り</div><div class="sr-body-text">${e(T.flow)}</div></div>
    <div class="sr-cols">
      <div class="sr-section"><div class="sr-section-title">日商の分布<span class="note">単位：万円（${comma(a.histStep)}円刻み）／縦軸：回数</span></div><div class="sr-box">${chHist}</div></div>
      <div class="sr-section"><div class="sr-section-title">前年同期比較</div>${yoyTbl}</div>
    </div>
    <div class="sr-section"><div class="sr-section-title">前年比の読み取り</div><div class="sr-body-text">${e(T.yoy)}</div></div>
    <div class="sr-section"><div class="sr-section-title">日々の売上を左右するもの</div><div class="sr-body-text">${e(T.daily)}</div></div>`;

  // ---- 3ページ目：同僚比較・順位 ----
  let p3 = '';
  if (hasPeer) {
    const vsVals = M.flatMap(m => [m.avg, m.peer?.avg, m.peer?.top10, m.peer?.divAvg]).filter((v): v is number => v != null);
    const chVs = lineChart({
      labels, w: 700, h: 210, lo: Math.min(...vsVals) * 0.92, hi: Math.max(...vsVals) * 1.04, labelEvery: 1,
      lines: [
        { name: '本人', values: M.map(m => m.avg), color: C_NAVY, width: 2.4, markers: true },
        { name: 'top10', values: M.map(m => m.peer?.top10 ?? null), color: C_BLUE, dash: true, width: 1.5 },
        ...(meta.division != null ? [{ name: 'div', values: M.map(m => m.peer?.divAvg ?? null), color: C_AMBER, dash: true, width: 1.5 }] : []),
        { name: 'peer', values: M.map(m => m.peer?.avg ?? null), color: C_GRAY, dash: true, width: 1.5 },
      ],
      legend: [['本人', C_NAVY, 'line'], [`同僚${D} 上位10%`, C_BLUE, 'dash'], ...(meta.division != null ? [[`${meta.division}課${D} 平均`, C_AMBER, 'dash'] as const] : []), [`同僚${D} 平均`, C_GRAY, 'dash']] as any,
    });
    const tops = M.map(m => m.peer ? m.peer.topPct * 100 : null);
    const topMax = Math.max(...tops.filter((v): v is number => v != null));
    const chRank = lineChart({
      labels, w: 700, h: 180, fmt: v => `${v.toFixed(0)}%`, lo: 0, hi: Math.max(15, topMax * 1.25),
      lines: [{ name: 'rank', values: tops, color: C_NAVY, width: 2.2, markers: true, valueLabels: true }],
      refs: [{ value: 10, color: C_AMBER, text: '上位10%ライン' }],
    });
    const rows = M.map(m => `<tr><td class="l">${e(m.label)}${m.partial ? '*' : ''}</td><td>${m.n}</td><td>${fi(m.avg)}</td><td>${fi(m.peer?.avg)}</td>${meta.division != null ? `<td>${fi(m.peer?.divAvg)}</td>` : ''}<td>${fi(m.peer?.top10)}</td>
      <td class="${m.peer && m.avg >= m.peer.avg ? 'hi' : 'lo'}">${m.peer ? `${m.avg >= m.peer.avg ? '+' : ''}${((m.avg / m.peer.avg - 1) * 100).toFixed(0)}%` : ''}</td><td>${m.peer ? `${m.peer.rank} / ${m.peer.count}` : ''}</td><td>${m.peer ? `${(m.peer.topPct * 100).toFixed(1)}%` : ''}</td></tr>`).join('');
    p3 = `
      <div class="sr-section"><div class="sr-section-title">平均日商の比較<span class="note">同僚＝その月度に${e(D)}で5乗務以上した乗務員（本人除く）</span></div><div class="sr-box">${chVs}</div></div>
      <div class="sr-section"><div class="sr-section-title">${e(D)}内の順位（上位何%か）<span class="note">数字が小さいほど上位</span></div><div class="sr-box">${chRank}</div></div>
      <div class="sr-section"><div class="sr-section-title">月度別 順位表</div>
        <table class="t" style="font-size:8.6px;"><tr><th>月度</th><th>乗務</th><th>本人 日商</th><th>${e(D)} 平均</th>${meta.division != null ? `<th>${meta.division}課${e(D)} 平均</th>` : ''}<th>上位10%線</th><th>平均との差</th><th>順位 / 人数</th><th>上位</th></tr>${rows}</table></div>
      <div class="sr-body-text">${e(T.rank)}</div>`;
  }

  // ---- 4ページ目：売上の分解 ----
  const rng = (vals: Array<number | null | undefined>, padLo: number, padHi: number) => {
    const v = vals.filter((x): x is number => x != null);
    return v.length ? { lo: Math.min(...v) * padLo, hi: Math.max(...v) * padHi } : { lo: 0, hi: 1 };
  };
  const rR = rng(M.flatMap(m => [m.rides, m.peer?.rides]), 0.85, 1.08);
  const uR = rng(M.flatMap(m => [m.unit, m.peer?.unit]), 0.9, 1.06);
  const jR = rng(M.map(m => m.jr == null ? null : m.jr * 100), 0.92, 1.06);
  const hR = rng(M.map(m => m.ph), 0.9, 1.06);
  const small = { w: 345, h: 175, labelEvery: every };
  const chRides = lineChart({ ...small, labels, fmt: v => `${v.toFixed(0)}回`, ...rR,
    lines: [{ name: 'me', values: M.map(m => m.rides), color: C_NAVY, width: 2.2, markers: true }, ...(hasPeer ? [{ name: 'p', values: M.map(m => m.peer?.rides ?? null), color: C_GRAY, dash: true, width: 1.5 }] : [])],
    legend: [['本人', C_NAVY, 'line'], ...(hasPeer ? [[`同僚${D}`, C_GRAY, 'dash'] as const] : [])] as any });
  const chUnit = lineChart({ ...small, labels, fmt: v => comma(v), ...uR,
    lines: [{ name: 'me', values: M.map(m => m.unit), color: C_NAVY, width: 2.2, markers: true }, ...(hasPeer ? [{ name: 'p', values: M.map(m => m.peer?.unit ?? null), color: C_GRAY, dash: true, width: 1.5 }] : [])],
    legend: [['本人', C_NAVY, 'line'], ...(hasPeer ? [[`同僚${D}`, C_GRAY, 'dash'] as const] : [])] as any });
  const chJr = lineChart({ ...small, h: 160, labels, fmt: v => `${v.toFixed(0)}%`, ...jR, lines: [{ name: 'jr', values: M.map(m => m.jr == null ? null : m.jr * 100), color: C_GREEN, width: 2.2, markers: true }] });
  const chPh = lineChart({ ...small, h: 160, labels, fmt: v => comma(v), ...hR, lines: [{ name: 'ph', values: M.map(m => m.ph), color: C_BLUE, width: 2.2, markers: true }] });
  const p4 = `
    <div class="sr-cols">
      <div class="sr-section"><div class="sr-section-title">1乗務あたり営業回数</div><div class="sr-box">${chRides}</div></div>
      <div class="sr-section"><div class="sr-section-title">客単価（円／回）</div><div class="sr-box">${chUnit}</div></div>
    </div>
    <div class="sr-cols">
      <div class="sr-section"><div class="sr-section-title">実車率（営業キロ÷走行キロ）</div><div class="sr-box">${chJr}</div></div>
      <div class="sr-section"><div class="sr-section-title">実働1時間あたり売上（円）</div><div class="sr-box">${chPh}</div></div>
    </div>
    <div class="sr-section"><div class="sr-section-title">分解から分かること</div><div class="sr-body-text">${e(T.decomp)}</div></div>
    <div class="sr-section"><div class="sr-section-title">好調日と不調日の違い（売上の上位・下位それぞれ${Math.min(20, Math.max(3, Math.floor(a.n / 10)))}乗務）</div>
      <table class="t" style="font-size:9px;"><tr><th></th><th>営業回数</th><th>客単価</th><th>走行km</th><th>実車率</th><th>実働h</th></tr>
      <tr><td class="l">上位</td><td>${fx(a.top20.rides)}</td><td>${yen(a.top20.unit)}</td><td>${fx(a.top20.km, 0)}</td><td>${pct1(a.top20.jr)}</td><td>${fx(a.top20.labor)}</td></tr>
      <tr><td class="l">全体平均</td><td>${fx(a.all.rides)}</td><td>${yen(a.all.unit)}</td><td>${fx(a.all.km, 0)}</td><td>${pct1(a.all.jr)}</td><td>${fx(a.all.labor)}</td></tr>
      <tr><td class="l">下位</td><td>${fx(a.bot20.rides)}</td><td>${yen(a.bot20.unit)}</td><td>${fx(a.bot20.km, 0)}</td><td>${pct1(a.bot20.jr)}</td><td>${fx(a.bot20.labor)}</td></tr></table></div>`;

  // ---- 5ページ目：条件別 ----
  const wdShown = a.weekdays.filter(w => w.n > 0);
  const chWd = vBarChart({ labels: wdShown.map(w => w.label), values: wdShown.map(w => w.avg), w: 345, h: 165, sub: wdShown.map(w => `${w.n}回`),
    lo: Math.min(...wdShown.map(w => w.avg ?? a.avg)) * 0.75, ref: { value: a.avg, color: C_AMBER, text: '平均' }, colors: wdShown.map(w => w.n < 5 ? '#93c5fd' : C_NAVY) });
  const chFac = a.factors.length ? divergingChart(a.factors.map(f => ({ label: f.label, pct: f.pct, note: `${f.n}回 ${man(f.avg)}` })), 345, 17, 'その要因に該当しない乗務との差') : '<div class="sr-body-text" style="color:#9ca3af;">データ不足</div>';
  const binLo = Math.min(...[...a.rainBins, ...a.tempBins].map(b => b.avg ?? a.avg)) * 0.75;
  const chRain = vBarChart({ labels: a.rainBins.map(b => b.label), values: a.rainBins.map(b => b.avg), w: 345, h: 150, sub: a.rainBins.map(b => `${b.n}回`), lo: binLo, colors: ['#fbbf24', '#60a5fa', C_BLUE], ref: { value: a.avg, color: C_AMBER, text: '平均' } });
  const chTemp = vBarChart({ labels: a.tempBins.map(b => b.label), values: a.tempBins.map(b => b.avg), w: 345, h: 150, sub: a.tempBins.map(b => `${b.n}回`), lo: binLo, colors: ['#60a5fa', '#93c5fd', '#fcd34d', '#fb923c', '#ef4444'], ref: { value: a.avg, color: C_AMBER, text: '平均' } });
  const p5 = `
    <div class="sr-cols">
      <div class="sr-section"><div class="sr-section-title">曜日別 平均日商<span class="note">薄色は5回未満（参考値）</span></div><div class="sr-box">${chWd}</div></div>
      <div class="sr-section"><div class="sr-section-title">暦要因ごとの差</div><div class="sr-box">${chFac}</div></div>
    </div>
    <div class="sr-cols">
      <div class="sr-section"><div class="sr-section-title">天候（出庫日〜翌日の降水量）<span class="note">気象データのある${a.weatherN}乗務</span></div><div class="sr-box">${chRain}</div></div>
      <div class="sr-section"><div class="sr-section-title">最高気温別 平均日商</div><div class="sr-box">${chTemp}</div></div>
    </div>
    <div class="sr-section"><div class="sr-section-title">条件別の読み取り</div><div class="sr-body-text">${e(T.cond)}</div></div>
    <div class="sr-body-text" style="font-size:9px;color:#6b7280;">※「連休明け」は土日明けの月曜も該当するため、月曜の傾向と重なります。回数の少ない区分は偶然の影響が大きいため参考値です。</div>`;

  // ---- 6ページ目：勤務・車両・ベスト/ワースト ----
  const retVals = M.map(m => m.ret);
  const rv = retVals.filter((v): v is number => v != null);
  const chRet = rv.length ? lineChart({ labels, w: 345, h: 160, labelEvery: every, fmt: v => minToHm(((v % 1440) + 1440) % 1440), lo: Math.min(...rv) - 20, hi: Math.max(...rv) + 20,
    lines: [{ name: 'ret', values: retVals, color: C_NAVY, width: 2.2, markers: true }] }) : '';
  const chLabor = M.some(m => m.labor != null) ? comboChart({ labels, bars: M.map(m => m.labor), w: 345, h: 170, labelEvery: Math.max(every, M.length > 12 ? 3 : 1),
    barFmt: v => `${v.toFixed(0)}h`, lineFmt: v => `${v.toFixed(1)}h`, lineLo: 0, lines: [{ name: 'ot', values: M.map(m => m.ot), color: C_RED }],
    legend: [['実働（左）', '#c7d2fe', 'bar'], ['残業（右）', C_RED, 'line']] }) : '';
  const carRows = a.cars.slice(0, 9).map(c => `<tr><td class="c">${e(c.car)}</td><td>${c.n}</td><td>${fi(c.avg)}</td><td>${fi(c.unit)}</td></tr>`).join('');
  const others = a.cars.slice(9);
  const otherRow = others.length ? (() => { const on = others.reduce((s, c) => s + c.n, 0); return `<tr><td class="c">その他${others.length}台</td><td>${on}</td><td>${fi(others.reduce((s, c) => s + c.n * c.avg, 0) / on)}</td><td></td></tr>`; })() : '';
  const dayTbl = (rs: DetailDay[]) => `<table class="t" style="font-size:8.4px;"><tr><th>出庫日</th><th>曜</th><th>税込収入</th><th>回数</th><th>客単価</th><th>走行</th><th>主な要因</th></tr>${rs.map(d => `<tr><td class="c">${slash(d.date.slice(2))}</td><td class="c ${wdCls(d)}">${d.f.weekdayLabel}</td><td>${fi(d.amount)}</td><td>${d.rides ?? ''}</td><td>${fi(d.unit)}</td><td>${fx(d.km, 0)}</td><td class="l" style="font-size:7.6px;color:#6b7280">${e(dayNotes(d, 5).join('・'))}</td></tr>`).join('')}</table>`;
  const p6 = `
    <div class="sr-cols">
      <div class="sr-section"><div class="sr-section-title">平均帰庫時刻</div><div class="sr-box">${chRet}</div></div>
      <div class="sr-section"><div class="sr-section-title">平均実働・残業時間</div><div class="sr-box">${chLabor}</div></div>
    </div>
    <div class="sr-section"><div class="sr-section-title">勤務の読み取り</div><div class="sr-body-text">${e(T.work)}</div></div>
    <div class="sr-cols">
      <div class="sr-section" style="flex:0.75"><div class="sr-section-title">車両別成績</div><table class="t" style="font-size:8.6px;"><tr><th>車両</th><th>乗務</th><th>平均日商</th><th>客単価</th></tr>${carRows}${otherRow}</table></div>
      <div class="sr-section" style="flex:1.25"><div class="sr-section-title">ベスト8乗務</div>${dayTbl(a.best8)}</div>
    </div>
    <div class="sr-section"><div class="sr-section-title">ワースト8乗務</div>${dayTbl(a.worst8)}</div>`;

  // ---- 7ページ目：総合評価 ----
  const p7 = `
    <div class="sr-section sr-strong"><div class="sr-section-title">強み</div><ul class="sr-list">${T.strong.map(t => `<li>${e(t)}</li>`).join('')}</ul></div>
    <div class="sr-section sr-weak"><div class="sr-section-title">弱点・改善余地</div><ul class="sr-list">${T.weak.map(t => `<li>${e(t)}</li>`).join('')}</ul></div>
    <div class="sr-section"><div class="sr-section-title">改善提案</div><ul class="sr-list">${T.recs.map(t => `<li>${e(t)}</li>`).join('')}</ul></div>
    <div class="sr-closing">${e(T.closing)}</div>
    <div class="sr-disclaimer">
      ※本レポートはホシコン収集データ（日報CSV）の売上実績を集計・分析して自動生成したものです（ルールベース集計であり外部AIサービスは使用していません）。参考情報としてご活用ください。<br>
      ※同僚比較は、各月度に本人と同じ勤務区分（${e(D)}）で5乗務以上した乗務員の1乗務あたり平均日商を用いています（本人を除く。人数は月度ごとに異なります）。<br>
      ※天候は気象データ（出庫日と翌日の合計降水量、出庫日の最高気温）を使用しています。気象データのない日は天候分析から除外しています。<br>
      ${partial ? `※${e(partial.label)}は${slash(partial.last)}出庫分までの集計途中のため、推移の評価には含めていません。<br>` : ''}
      ${meta.coverage ? `※売上CSVの取込済み期間（全社）は${e(coverageRangeText(meta.coverage))}${meta.coverage.lastUpdated ? `、最終更新は${e(slash(meta.coverage.lastUpdated))}` : ''}です。<br>${e(coverageWarn(meta.coverage))}` : ''}
    </div>`;

  const pages: Array<{ title: string; sub: string; body: string; to?: boolean }> = [
    { title: '売上推移 詳細分析レポート', sub: `売上実績データに基づくAI自動分析（${rangeLabel(meta)}・全乗務）`, body: p1, to: true },
    { title: '日商の推移と前年比較', sub: '1乗務ごとの売上と、その流れ（移動平均）', body: p2 },
    ...(p3 ? [{ title: '同僚との比較・順位推移', sub: `同じ${D}乗務員との相対評価`, body: p3 }] : []),
    { title: '売上の分解（回数・単価・効率）', sub: '「なぜ売れているか」を指標ごとに分解', body: p4 },
    { title: '条件別の売上傾向', sub: '曜日・暦・天候と売上の関係', body: p5 },
    { title: '勤務実態・車両・ベスト／ワースト', sub: '勤務時間の推移と、印象的だった乗務', body: p6 },
    { title: '総合評価と改善提案', sub: '分析結果のまとめ', body: p7 },
  ];
  const sheets = pages.map((p, i) => sheet({ meta, a, badge: 'AI売上分析レポート', title: p.title, sub: p.sub, body: p.body, pno: i + 1, ptotal: pages.length, showTo: p.to, dutyLabel: D }));
  return shell(`売上推移 詳細分析レポート（${meta.name}）`, `${rangeLabel(meta)}の売上を集計した詳細分析です（${pages.length}ページ）`, meta, sheets);
}

// =====================================================================
// 日別売上 全データ一覧（A4横）
// =====================================================================
export function renderSalesDailyListPage(meta: SalesDetailPageMeta, a: SalesDetailAnalysis): string {
  const D = a.dutyLabel, M = a.months;
  const dayAll = a.days; // 売上0円の記録も含めて全件
  const raw = (d: DetailDay, i: number) => (d.raw?.[i] ?? '').trim();
  const pair = (x: string, y: string) => (x || y) ? `${x || '-'}/${y || '-'}` : '';
  const hm = (d: DetailDay, i: number) => d.raw ? (decToHm(d.raw[i]) ?? '') : '';
  // CSVの数値（"22.00000" 等）を見やすく：0は「-」、小数は1桁
  const nv = (d: DetailDay, i: number) => { const t = raw(d, i); if (t === '') return ''; const v = Number(t); return !Number.isFinite(v) ? t : v === 0 ? '-' : Number.isInteger(v) ? String(v) : v.toFixed(1); };
  const sumOf = (ds: DetailDay[], i: number) => ds.reduce((s, d) => s + (Number(raw(d, i)) || 0), 0);

  const head = `<tr><th>出庫日</th><th>曜</th><th>勤務</th><th>車両</th><th>乗務<br>/A乗務</th><th>出庫<br>時刻</th><th>帰庫<br>時刻</th><th>出庫<br>点呼</th><th>帰庫<br>点呼</th>
    <th>拘束<br>h</th><th>休憩<br>h</th><th>ハンドル<br>h</th><th>深夜<br>h</th><th>残業<br>h</th><th>走行<br>km</th><th>営業<br>km</th><th>実車率</th><th>高速/他<br>除外km</th><th>ETC<br>個人</th>
    <th>営業<br>回数</th><th>輸送<br>人員</th><th>税込収入</th><th>客単価</th><th>急発進<br>実/空</th><th>急加速<br>実/空</th><th>急減速<br>実/空</th><th>最高速 高速<br>実/空</th><th>最高速 一般<br>実/空</th>
    <th>日報番号</th><th>予定<br>コード</th><th>天気<br>昼/夜</th><th>降水<br>mm</th><th>気温<br>最高/低</th><th>備考</th></tr>`;

  const lines: string[] = [];
  for (const m of M) {
    const ds = dayAll.filter(d => d.key === m.key);
    for (const d of ds) {
      const cls = d.amount >= a.highLine ? 'hi' : d.amount > 0 && d.amount < a.lowLine ? 'lo' : '';
      const kinmu = d.raw ? [raw(d, RAW.kinmuType), raw(d, RAW.kinmu)].filter(Boolean).join(' ') : (d.dutyCode ?? '');
      lines.push(`<tr>
        <td class="c">${slash(d.date.slice(2))}</td><td class="c ${wdCls(d)}">${d.f.weekdayLabel}</td><td class="c">${e(kinmu)}</td><td class="c">${e(d.car)}</td>
        <td class="c">${e(pair(raw(d, RAW.jomu), raw(d, RAW.aJomu)))}</td>
        <td class="c">${hm(d, RAW.outTime)}</td><td class="c">${hm(d, RAW.inTime)}</td><td class="c">${d.start ?? ''}</td><td class="c">${d.ret ?? ''}</td>
        <td>${e(raw(d, RAW.kosoku))}</td><td>${e(raw(d, RAW.kyukei))}</td><td>${e(raw(d, RAW.handle)) || fx(d.labor, 2)}</td><td>${fx(d.night, 2)}</td><td>${fx(d.ot, 2)}</td>
        <td>${fx(d.km)}</td><td>${fx(d.ekm)}</td><td>${pct1(d.jr)}</td><td class="c">${e(pair(nv(d, RAW.hwyExclude), nv(d, RAW.otherExclude)))}</td><td>${e(nv(d, RAW.etc))}</td>
        <td>${d.rides ?? ''}</td><td>${d.pax != null ? Math.round(d.pax) : ''}</td><td class="${cls}">${fi(d.amount)}</td><td>${fi(d.unit)}</td>
        <td class="c">${e(pair(raw(d, RAW.hsLoaded), raw(d, RAW.hsEmpty)))}</td><td class="c">${e(pair(raw(d, RAW.haLoaded), raw(d, RAW.haEmpty)))}</td><td class="c">${e(pair(raw(d, RAW.hdLoaded), raw(d, RAW.hdEmpty)))}</td>
        <td class="c">${e(pair(raw(d, RAW.spdLoadedHwy), raw(d, RAW.spdEmptyHwy)))}</td><td class="c">${e(pair(raw(d, RAW.spdLoadedLocal), raw(d, RAW.spdEmptyLocal)))}</td>
        <td class="c">${e(raw(d, RAW.nippo))}</td><td class="c">${e(raw(d, RAW.plan))}</td>
        <td><div class="wx">${e(pair(d.wDay ?? '', d.wNight ?? ''))}</div></td><td>${d.rain != null ? fx(d.rain, d.rain < 10 ? 1 : 0) : ''}</td><td class="c">${d.tmax != null ? `${fx(d.tmax)}/${fx(d.tmin)}` : ''}</td>
        <td><div class="nt">${e(dayNotes(d).join('・'))}</div></td></tr>`);
    }
    const kmT = ds.reduce((s, d) => s + (d.km ?? 0), 0), ekmT = ds.reduce((s, d) => s + (d.ekm ?? 0), 0);
    const ridesT = ds.reduce((s, d) => s + (d.rides ?? 0), 0), amtT = ds.reduce((s, d) => s + d.amount, 0);
    lines.push(`<tr class="sub"><td class="l" colspan="5">${e(m.label)} 計${m.partial ? '（途中）' : ''}（${ds.length}乗務）</td><td colspan="4"></td>
      <td>${fx(sumOf(ds, RAW.kosoku), 2)}</td><td>${fx(sumOf(ds, RAW.kyukei), 2)}</td><td>${fx(sumOf(ds, RAW.handle), 2)}</td><td>${fx(ds.reduce((s, d) => s + (d.night ?? 0), 0), 2)}</td><td>${fx(ds.reduce((s, d) => s + (d.ot ?? 0), 0), 2)}</td>
      <td>${fx(kmT)}</td><td>${fx(ekmT)}</td><td>${kmT ? pct1(ekmT / kmT) : ''}</td><td></td><td>${fi(sumOf(ds, RAW.etc))}</td>
      <td>${ridesT}</td><td>${fi(sumOf(ds, RAW.pax))}</td><td>${fi(amtT)}</td><td>${ridesT ? fi(amtT / ridesT) : ''}</td><td colspan="10" class="l">平均日商 ${fi(ds.length ? amtT / ds.length : 0)}</td><td colspan="1"></td></tr>`);
  }
  {
    const kmT = dayAll.reduce((s, d) => s + (d.km ?? 0), 0), ekmT = dayAll.reduce((s, d) => s + (d.ekm ?? 0), 0);
    const ridesT = dayAll.reduce((s, d) => s + (d.rides ?? 0), 0), amtT = dayAll.reduce((s, d) => s + d.amount, 0);
    lines.push(`<tr class="grand"><td class="l" colspan="5">対象期間 合計（${dayAll.length}乗務）</td><td colspan="4"></td>
      <td>${fx(sumOf(dayAll, RAW.kosoku), 1)}</td><td>${fx(sumOf(dayAll, RAW.kyukei), 1)}</td><td>${fx(sumOf(dayAll, RAW.handle), 1)}</td><td>${fx(dayAll.reduce((s, d) => s + (d.night ?? 0), 0), 1)}</td><td>${fx(dayAll.reduce((s, d) => s + (d.ot ?? 0), 0), 1)}</td>
      <td>${fi(kmT)}</td><td>${fi(ekmT)}</td><td>${kmT ? pct1(ekmT / kmT) : ''}</td><td></td><td>${fi(sumOf(dayAll, RAW.etc))}</td>
      <td>${fi(ridesT)}</td><td>${fi(sumOf(dayAll, RAW.pax))}</td><td>${fi(amtT)}</td><td>${ridesT ? fi(amtT / ridesT) : ''}</td><td colspan="10" class="l">平均日商 ${fi(dayAll.length ? amtT / dayAll.length : 0)}</td><td></td></tr>`);
  }

  const PER = 36;
  const chunks: string[][] = [];
  for (let i = 0; i < lines.length; i += PER) chunks.push(lines.slice(i, i + PER));
  const warn = coverageWarn(meta.coverage);
  const legendLine = `${warn ? `<div class="legend-line" style="color:#b45309;">${e(warn)}</div>` : ''}<div class="legend-line">税込収入：<span class="hi">緑＝${fi(a.highLine)}円以上（平均+1標準偏差）</span>／<span class="lo">赤＝${fi(a.lowLine)}円未満（平均−1標準偏差）</span>　曜日：<span style="color:#2563eb">青＝土曜</span>／<span style="color:#dc2626">赤＝日曜・祝日</span>　時刻は出庫日基準（帰庫は翌日の場合あり）。出庫/帰庫時刻＝CSVの出入庫時刻、点呼＝出庫/帰庫点呼時刻。天候・気温は気象データ（降水は出庫日＋翌日）。</div>`;
  const sheets = chunks.map((ch, i) => sheet({
    meta, a, badge: '売上実績データ', title: `日別売上 全データ一覧（${i + 1}/${chunks.length}）`, sub: `ホシコン収集データ（日報CSV）の全項目 ／ ${rangeLabel(meta)} ／ 主な勤務区分 ${D}`,
    body: `<table class="t dense">${head}${ch.join('')}</table>${legendLine}`, pno: i + 1, ptotal: chunks.length, land: true, dutyLabel: D,
  }));
  return shell(`日別売上 全データ一覧（${meta.name}）`, `${rangeLabel(meta)}・${dayAll.length}乗務の日報データ（A4横 ${chunks.length}ページ）`, meta, sheets, true);
}
