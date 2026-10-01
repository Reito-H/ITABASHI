// 動線分析（匿名の動線収集＋集計）
// 収集: layout.ts の NAV_LOG_SCRIPT が、管理画面のページを離れるたびに POST /api/nav-log へ1件送る（sendBeacon）。
//   アカウントとは紐付けない（adminIdは保存しない）。visit_idはタブごとの使い捨てIDで、1回の利用内の流れを追うためだけに使う。
//   ページ権限に関わらず全アカウントの動線を集めたいため、index.ts のページ権限ミドルウェアで /api/nav-log を素通しにしている
//   （ログイン自体は必須）。
// 集計: /settings/nav-insights（設定 → 管理者項目）。権限キー settings.nav-insights（閲覧のみ）。
// テーブル: nav_events（migration_168）。180日より古い行は cron.ts で削除。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout, escHtml } from '../html/layout';
import { settingsSubHeader } from './admin';
import { ADMIN_PATH } from '../config';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const VIA_LABELS: Record<string, string> = {
  sidebar: 'サイドバー',
  portal: 'ポータル',
  header: '上部ヘッダー',
  page: 'ページ内のリンク・ボタン',
  back: 'ブラウザの「戻る」',
  reload: '再読み込み',
  other: 'その他（保存後の自動移動など）',
  direct: '直接（ブックマーク・新しいタブ等）',
};
const VIA_ORDER = ['sidebar', 'portal', 'header', 'page', 'back', 'reload', 'other', 'direct'];
const VIA_COLORS: Record<string, string> = {
  sidebar: '#17495f', portal: '#0f8567', header: '#5b8def', page: '#f4a621',
  back: '#dc2626', reload: '#9ca3af', other: '#c4b5fd', direct: '#94a3b8',
};

const PAGE_RE = /^\/[A-Za-z0-9_\-/:.?=]{0,119}$/;
const MAX_DWELL_MS = 4 * 60 * 60 * 1000;

// ===== 収集API =====
app.post('/api/nav-log', async (c) => {
  let b: Record<string, unknown>;
  try { b = await c.req.json(); } catch { return c.body(null, 204); }
  const page = typeof b.p === 'string' ? b.p : '';
  const from = typeof b.f === 'string' && PAGE_RE.test(b.f) ? b.f : null;
  const via = typeof b.via === 'string' && b.via in VIA_LABELS ? b.via : 'other';
  const visit = typeof b.v === 'string' ? b.v.slice(0, 64) : '';
  const seq = Number(b.s);
  if (!PAGE_RE.test(page) || !visit || !Number.isInteger(seq) || seq < 1) return c.body(null, 204);
  const title = typeof b.t === 'string' ? b.t.slice(0, 60) : null;
  const dwell = Math.min(MAX_DWELL_MS, Math.max(0, Math.round(Number(b.d) || 0)));
  const clicks = Math.min(100000, Math.max(0, Math.round(Number(b.c) || 0)));
  const device = b.m === 'sp' ? 'sp' : 'pc';
  try {
    await c.env.DB.prepare(
      'INSERT INTO nav_events (visit_id, seq, page, title, from_page, via, dwell_ms, clicks, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(visit, Math.min(seq, 100000), page, title, from, via, dwell, clicks, device).run();
  } catch { /* migration_168未適用時など。記録失敗は利用者の操作に影響させない */ }
  return c.body(null, 204);
});

// ===== 集計ページ =====
type PageRow = { page: string; title: string | null; views: number; avg_dwell: number; quick_back: number; visits: number };

function fmtDwell(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}分${String(s % 60).padStart(2, '0')}秒`;
  return `${Math.floor(m / 60)}時間${m % 60}分`;
}
function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : '—';
}

app.get('/settings/nav-insights', async (c) => {
  const daysParam = parseInt(c.req.query('days') ?? '30', 10);
  const days = [7, 14, 30, 90, 180].includes(daysParam) ? daysParam : 30;
  const since = `-${days} days`;
  const db = c.env.DB;

  let tableMissing = false;
  const q = async <T>(sql: string, ...binds: (string | number)[]): Promise<T[]> => {
    try {
      const r = await db.prepare(sql).bind(...binds).all<T>();
      return r.results ?? [];
    } catch {
      tableMissing = true;
      return [];
    }
  };

  const [summaryRows, pages, viaRows, pageViaRows, transitions, pingPong, entryRows, settingsHubRows, hourRows, firstRow] = await Promise.all([
    q<{ views: number; visits: number; sp: number }>(
      `SELECT COUNT(*) AS views, COUNT(DISTINCT visit_id) AS visits, SUM(device = 'sp') AS sp
       FROM nav_events WHERE created_at >= datetime('now','+9 hours',?)`, since),
    q<PageRow>(
      `SELECT page, MAX(title) AS title, COUNT(*) AS views, AVG(dwell_ms) AS avg_dwell,
         SUM(dwell_ms < 5000 AND clicks = 0) AS quick_back, COUNT(DISTINCT visit_id) AS visits
       FROM nav_events WHERE created_at >= datetime('now','+9 hours',?)
       GROUP BY page ORDER BY views DESC LIMIT 60`, since),
    q<{ via: string; cnt: number }>(
      `SELECT via, COUNT(*) AS cnt FROM nav_events WHERE created_at >= datetime('now','+9 hours',?) GROUP BY via`, since),
    q<{ page: string; via: string; cnt: number }>(
      `SELECT page, via, COUNT(*) AS cnt FROM nav_events WHERE created_at >= datetime('now','+9 hours',?) GROUP BY page, via`, since),
    q<{ from_page: string; page: string; cnt: number }>(
      `SELECT from_page, page, COUNT(*) AS cnt FROM nav_events
       WHERE created_at >= datetime('now','+9 hours',?) AND from_page IS NOT NULL AND from_page != page
         AND via NOT IN ('back', 'reload')
       GROUP BY from_page, page ORDER BY cnt DESC LIMIT 30`, since),
    // 行ったり来たり: 同じタブで A → B → A と戻っている組み合わせ
    q<{ a: string; b: string; cnt: number }>(
      `SELECT e1.page AS a, e2.page AS b, COUNT(*) AS cnt
       FROM nav_events e1
       JOIN nav_events e2 ON e2.visit_id = e1.visit_id AND e2.seq = e1.seq + 1
       JOIN nav_events e3 ON e3.visit_id = e1.visit_id AND e3.seq = e1.seq + 2
       WHERE e1.created_at >= datetime('now','+9 hours',?) AND e3.page = e1.page AND e2.page != e1.page
       GROUP BY e1.page, e2.page ORDER BY cnt DESC LIMIT 20`, since),
    // タブを開いて最初に表示したページ（ブックマーク・ログイン直後など＝利用の入口）
    q<{ page: string; cnt: number }>(
      `SELECT page, COUNT(*) AS cnt FROM nav_events
       WHERE created_at >= datetime('now','+9 hours',?) AND seq = 1
       GROUP BY page ORDER BY cnt DESC LIMIT 15`, since),
    // 設定ページ（ハブ）を経由して開かれた機能
    q<{ page: string; cnt: number }>(
      `SELECT page, COUNT(*) AS cnt FROM nav_events
       WHERE created_at >= datetime('now','+9 hours',?) AND via = 'page'
         AND from_page IN ('/settings', '/settings/admin-tools', '/settings/shift')
       GROUP BY page ORDER BY cnt DESC LIMIT 30`, since),
    q<{ h: string; cnt: number }>(
      `SELECT strftime('%H', created_at) AS h, COUNT(*) AS cnt FROM nav_events
       WHERE created_at >= datetime('now','+9 hours',?) GROUP BY h ORDER BY h`, since),
    q<{ first_at: string | null }>(`SELECT MIN(created_at) AS first_at FROM nav_events`),
  ]);

  // ページの表示名（タイトル）。集計対象外のページは別途タイトルを引く
  const titleOf = new Map<string, string>();
  for (const p of pages) if (p.title) titleOf.set(p.page, p.title);
  const needTitles = new Set<string>();
  for (const t of transitions) { needTitles.add(t.from_page); needTitles.add(t.page); }
  for (const p of pingPong) { needTitles.add(p.a); needTitles.add(p.b); }
  for (const e of entryRows) needTitles.add(e.page);
  for (const s of settingsHubRows) needTitles.add(s.page);
  const missing = [...needTitles].filter(p => !titleOf.has(p));
  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    const rows = await q<{ page: string; title: string | null }>(
      `SELECT page, MAX(title) AS title FROM nav_events WHERE page IN (${chunk.map(() => '?').join(',')}) GROUP BY page`, ...chunk);
    for (const r of rows) if (r.title) titleOf.set(r.page, r.title);
  }
  const name = (page: string) => {
    const t = titleOf.get(page);
    return t
      ? `${escHtml(t)}<span class="ni-path">${escHtml(page)}</span>`
      : `<span class="ni-path" style="margin-left:0;">${escHtml(page)}</span>`;
  };

  const summary = summaryRows[0] ?? { views: 0, visits: 0, sp: 0 };
  const totalViews = summary.views ?? 0;
  const viaTotal = viaRows.reduce((s, r) => s + r.cnt, 0);
  const viaMap = new Map(viaRows.map(r => [r.via, r.cnt]));
  const pageVia = new Map<string, Map<string, number>>();
  for (const r of pageViaRows) {
    if (!pageVia.has(r.page)) pageVia.set(r.page, new Map());
    pageVia.get(r.page)!.set(r.via, r.cnt);
  }
  const maxViews = Math.max(1, ...pages.map(p => p.views));
  const maxHour = Math.max(1, ...hourRows.map(h => h.cnt));
  const hourMap = new Map(hourRows.map(h => [h.h, h.cnt]));

  const viaBar = (m: Map<string, number> | undefined, total: number) => `
    <div class="ni-stack">${VIA_ORDER.filter(v => (m?.get(v) ?? 0) > 0).map(v => {
      const n = m!.get(v)!;
      return `<span style="width:${(n / total) * 100}%;background:${VIA_COLORS[v]};" title="${escHtml(VIA_LABELS[v])}: ${n}回（${pct(n, total)}）"></span>`;
    }).join('')}</div>`;

  const periodLinks = [7, 14, 30, 90, 180].map(d =>
    `<a href="${ADMIN_PATH}/settings/nav-insights?days=${d}" class="ni-period${d === days ? ' on' : ''}">${d}日</a>`).join('');

  const emptyRow = (cols: number) => `<tr><td colspan="${cols}" class="ni-empty">まだデータがありません</td></tr>`;

  const html = settingsSubHeader('動線分析') + `
<style>
  .ni-wrap { max-width: 1100px; }
  .ni-lead { font-size: 12px; color: #6b7280; line-height: 1.8; margin: 0 0 16px; }
  .ni-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
  .ni-card h3 { font-size: 14px; font-weight: 700; color: var(--color-text); margin: 0 0 4px; }
  .ni-card .ni-note { font-size: 11px; color: #6b7280; margin: 0 0 10px; line-height: 1.7; }
  .ni-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; margin-bottom: 16px; }
  .ni-kpi { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; }
  .ni-kpi .l { font-size: 11px; color: #6b7280; }
  .ni-kpi .v { font-size: 22px; font-weight: 700; color: var(--color-primary); font-variant-numeric: tabular-nums; }
  .ni-period { display: inline-block; padding: 4px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; color: #374151; text-decoration: none; margin-right: 4px; background: #fff; }
  .ni-period.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
  .ni-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .ni-table th { text-align: left; font-weight: 600; color: #6b7280; border-bottom: 1px solid #e5e7eb; padding: 6px 8px; white-space: nowrap; }
  .ni-table td { border-bottom: 1px solid #f3f4f6; padding: 6px 8px; vertical-align: middle; }
  .ni-table td.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ni-path { color: #9ca3af; font-size: 10px; margin-left: 6px; font-family: ui-monospace, monospace; }
  .ni-bar { height: 8px; background: var(--color-action); border-radius: 4px; min-width: 2px; }
  .ni-stack { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: #f3f4f6; min-width: 140px; }
  .ni-stack span { display: block; height: 100%; }
  .ni-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 11px; color: #374151; margin-bottom: 10px; }
  .ni-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
  .ni-empty { color: #9ca3af; text-align: center; padding: 14px; }
  .ni-warn { color: #b45309; font-weight: 600; }
  .ni-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .ni-hours { display: flex; align-items: flex-end; gap: 3px; height: 90px; }
  .ni-hours div { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
  .ni-hours b { display: block; width: 100%; background: var(--color-primary); border-radius: 3px 3px 0 0; }
  .ni-hours small { font-size: 9px; color: #9ca3af; margin-top: 2px; }
  @media (max-width: 900px) { .ni-grid2 { grid-template-columns: 1fr; } }
</style>
<div class="ni-wrap">
  <p class="ni-lead">
    管理画面で「どのページを・どこから・どうやって開いたか」を匿名で集計しています（誰の操作かは記録していません。入力内容や画面の中身も記録しません）。<br>
    データが2〜4週間分たまると、よく使う機能・遠回りしている機能・迷っている場所が見えてきます。
    ${firstRow[0]?.first_at ? `記録開始: ${escHtml(firstRow[0].first_at.slice(0, 16))}` : ''}
  </p>
  ${tableMissing ? '<div class="ni-card ni-warn">集計用のテーブルがまだ作成されていません（migration_168 を適用してください）。</div>' : ''}
  <div style="margin-bottom:14px;">${periodLinks}</div>

  <div class="ni-kpis">
    <div class="ni-kpi"><div class="l">ページ表示数</div><div class="v">${totalViews.toLocaleString('ja-JP')}</div></div>
    <div class="ni-kpi"><div class="l">利用回数（タブ単位）</div><div class="v">${(summary.visits ?? 0).toLocaleString('ja-JP')}</div></div>
    <div class="ni-kpi"><div class="l">1回の利用で見るページ数</div><div class="v">${summary.visits ? (totalViews / summary.visits).toFixed(1) : '—'}</div></div>
    <div class="ni-kpi"><div class="l">スマホからの割合</div><div class="v">${pct(summary.sp ?? 0, totalViews)}</div></div>
  </div>

  <div class="ni-card">
    <h3>どうやってページに来たか（全体）</h3>
    <p class="ni-note">「ブラウザの戻る」が多いほど、目的のページに一度で辿り着けず引き返している可能性があります。</p>
    <div class="ni-legend">${VIA_ORDER.map(v => `<span><i style="background:${VIA_COLORS[v]}"></i>${escHtml(VIA_LABELS[v])} ${pct(viaMap.get(v) ?? 0, viaTotal)}</span>`).join('')}</div>
    ${viaTotal ? viaBar(viaMap, viaTotal) : '<div class="ni-empty">まだデータがありません</div>'}
  </div>

  <div class="ni-card">
    <h3>よく開かれるページ</h3>
    <p class="ni-note">「すぐ戻った」= 5秒以内に何もクリックせず離れた割合。高いページは「開いたけど目的のページではなかった」可能性があります。来た経路の色は上の凡例と同じです。</p>
    <div style="overflow-x:auto;">
    <table class="ni-table">
      <thead><tr><th>ページ</th><th></th><th style="text-align:right;">表示数</th><th style="text-align:right;">平均滞在</th><th style="text-align:right;">すぐ戻った</th><th>来た経路</th></tr></thead>
      <tbody>
      ${pages.length ? pages.map(p => {
        const quickRate = p.views ? p.quick_back / p.views : 0;
        return `<tr>
          <td>${name(p.page)}</td>
          <td style="width:120px;"><div class="ni-bar" style="width:${(p.views / maxViews) * 100}%;"></div></td>
          <td class="n">${p.views.toLocaleString('ja-JP')}</td>
          <td class="n">${fmtDwell(p.avg_dwell)}</td>
          <td class="n${quickRate >= 0.3 && p.views >= 10 ? ' ni-warn' : ''}">${pct(p.quick_back, p.views)}</td>
          <td>${viaBar(pageVia.get(p.page), p.views)}</td>
        </tr>`;
      }).join('') : emptyRow(6)}
      </tbody>
    </table>
    </div>
  </div>

  <div class="ni-grid2">
    <div class="ni-card">
      <h3>よく通る道（ページ → ページ）</h3>
      <p class="ni-note">「戻る」「再読み込み」は除いています。決まった順番で何度も通る道は、近道（直接リンク）を作る候補です。</p>
      <table class="ni-table"><thead><tr><th>移動元</th><th>移動先</th><th style="text-align:right;">回数</th></tr></thead><tbody>
      ${transitions.length ? transitions.map(t => `<tr><td>${name(t.from_page)}</td><td>${name(t.page)}</td><td class="n">${t.cnt}</td></tr>`).join('') : emptyRow(3)}
      </tbody></table>
    </div>
    <div class="ni-card">
      <h3>行ったり来たり（A → B → A）</h3>
      <p class="ni-note">BのページでAの情報を確認し直している、または目的と違うページを開いて戻っている可能性があります。</p>
      <table class="ni-table"><thead><tr><th>ページA</th><th>ページB</th><th style="text-align:right;">回数</th></tr></thead><tbody>
      ${pingPong.length ? pingPong.map(t => `<tr><td>${name(t.a)}</td><td>${name(t.b)}</td><td class="n">${t.cnt}</td></tr>`).join('') : emptyRow(3)}
      </tbody></table>
    </div>
  </div>

  <div class="ni-grid2">
    <div class="ni-card">
      <h3>「設定」を経由して開かれている機能</h3>
      <p class="ni-note">設定・管理者項目・シフト関連の設定のページから開かれた回数です。回数が多いものは、設定の奥ではなくサイドバー等へ出す候補です。</p>
      <table class="ni-table"><thead><tr><th>ページ</th><th style="text-align:right;">回数</th></tr></thead><tbody>
      ${settingsHubRows.length ? settingsHubRows.map(s => `<tr><td>${name(s.page)}</td><td class="n">${s.cnt}</td></tr>`).join('') : emptyRow(2)}
      </tbody></table>
    </div>
    <div class="ni-card">
      <h3>利用の入口（タブを開いて最初のページ）</h3>
      <p class="ni-note">ログイン直後やブックマークから最初に開いたページです。</p>
      <table class="ni-table"><thead><tr><th>ページ</th><th style="text-align:right;">回数</th></tr></thead><tbody>
      ${entryRows.length ? entryRows.map(e => `<tr><td>${name(e.page)}</td><td class="n">${e.cnt}</td></tr>`).join('') : emptyRow(2)}
      </tbody></table>
    </div>
  </div>

  <div class="ni-card">
    <h3>時間帯別のページ表示数</h3>
    <div class="ni-hours">
      ${Array.from({ length: 24 }, (_, h) => {
        const k = String(h).padStart(2, '0');
        const n = hourMap.get(k) ?? 0;
        return `<div title="${h}時台: ${n}回"><b style="height:${(n / maxHour) * 100}%;"></b><small>${h}</small></div>`;
      }).join('')}
    </div>
  </div>
</div>`;
  return c.html(layout('動線分析', html, 'settings'));
});

export default app;
