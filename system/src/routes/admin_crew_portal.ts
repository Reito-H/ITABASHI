// 社員カルテ（旧・個人データ参照＋AI売上分析(社員別)を統合）— 社員管理の一覧・詳細ページから遷移する
// タブ構成: 概要 / 売上実績 / 売上インサイト（sales-ai権限が必要） / 安全（accidents権限が必要）
import { Hono } from 'hono';
import { layout, escHtml } from '../html/layout';
import { crewPortalSubNav } from '../html/crew_portal_nav';
import { ADMIN_PATH } from '../config';
import { getAdminPermissions } from '../permissions';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

type EmpRow = { id: number; name: string; emp_no: string; division: number | null; team: number | null };
type TabId = 'overview' | 'sales' | 'insights' | 'safety';

// 旧・乗務員ポータル（社員選択一覧）は社員管理の一覧に統合したため、社員管理へリダイレクト
app.get('/crew-portal', (c) => c.redirect(`${ADMIN_PATH}/staff`));

// ===== ページ: 社員カルテ =====
app.get('/crew-portal/employee/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.notFound();

  const emp = await c.env.DB.prepare('SELECT id, name, emp_no, division, team FROM employees WHERE id = ?')
    .bind(id).first<EmpRow>();
  if (!emp) return c.text('社員が見つかりません', 404);

  const viewerPerms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  const canViewInsights = viewerPerms === null || viewerPerms.includes('sales-ai');
  const canViewSafety = viewerPerms === null || viewerPerms.includes('accidents');

  const accidentSummary = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt, MAX(occurred_date) as last_date FROM accident_records WHERE emp_no = ?'
  ).bind(emp.emp_no).first<{ cnt: number; last_date: string | null }>();
  const accidentCount = accidentSummary?.cnt ?? 0;
  const accidentLastDate = accidentSummary?.last_date ?? null;

  const requestedTab = c.req.query('tab');
  const initialTab: TabId =
    (requestedTab === 'insights' && canViewInsights) ? 'insights' :
    (requestedTab === 'safety' && canViewSafety) ? 'safety' :
    (requestedTab === 'sales') ? 'sales' : 'overview';

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'overview', label: '概要' },
    { id: 'sales', label: '売上実績' },
    ...(canViewInsights ? [{ id: 'insights' as TabId, label: '売上インサイト' }] : []),
    ...(canViewSafety ? [{ id: 'safety' as TabId, label: '安全' }] : []),
  ];

  const content = `
<div style="max-width:1000px;font-family:'Hiragino Sans','Meiryo',sans-serif;">
  <h2 style="font-size:16px;font-weight:700;color:#1a3a5c;margin:0 0 4px;">社員カルテ</h2>
  <p style="font-size:12px;color:#6b7280;margin:0 0 16px;">売上実績・売上インサイト・安全情報をまとめて確認できます。</p>
  ${crewPortalSubNav('none')}

  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
    <a href="${ADMIN_PATH}/staff" style="color:#2563eb;font-size:13px;text-decoration:none;">← 社員一覧に戻る</a>
    <a href="${ADMIN_PATH}/staff/${emp.id}" style="color:#6b7280;font-size:12px;text-decoration:none;">社員情報を編集 →</a>
  </div>

  <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:20px 24px;margin-bottom:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
      <h3 style="font-size:14px;font-weight:700;color:#1a3a5c;margin:0;">${escHtml(emp.name)}（${emp.division ?? '—'}課${emp.team ? emp.team + '班' : ''} ／ ${escHtml(emp.emp_no)}）</h3>
      <select id="period-select" onchange="onPeriodChange()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;">
        <option value="3">直近3ヶ月</option>
        <option value="6" selected>直近6ヶ月</option>
        <option value="12">直近12ヶ月</option>
        <option value="24">直近24ヶ月</option>
      </select>
    </div>

    <div style="display:flex;gap:4px;margin-bottom:18px;border-bottom:1px solid #e5e7eb;flex-wrap:wrap;">
      ${tabs.map(t => `<button type="button" class="crew-tab-btn" data-tab="${t.id}" onclick="switchTab('${t.id}')" style="padding:9px 16px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:700;margin-bottom:-1px;border-bottom:2px solid ${t.id === initialTab ? '#1a3a5c' : 'transparent'};color:${t.id === initialTab ? '#1a3a5c' : '#9ca3af'};">${t.label}</button>`).join('')}
    </div>

    <!-- 概要タブ -->
    <div class="crew-tab-panel" data-tab="overview" style="display:${initialTab === 'overview' ? '' : 'none'};">
      <div id="overview-loading" style="color:#9ca3af;font-size:13px;">読み込み中…</div>
      <div id="overview-content" style="display:none;">
        <div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
          <div style="flex:1;min-width:130px;background:#f9fafb;border-radius:8px;padding:12px 16px;">
            <div style="font-size:11px;color:#9ca3af;">今月度 売上合計</div>
            <div id="ov-month-total" style="font-size:18px;font-weight:700;color:#1a3a5c;">—</div>
          </div>
          <div style="flex:1;min-width:130px;background:#f9fafb;border-radius:8px;padding:12px 16px;">
            <div style="font-size:11px;color:#9ca3af;">平均日商</div>
            <div id="ov-avg" style="font-size:18px;font-weight:700;color:#1a3a5c;">—</div>
          </div>
          <div style="flex:1;min-width:130px;background:#f9fafb;border-radius:8px;padding:12px 16px;">
            <div style="font-size:11px;color:#9ca3af;">乗務日数</div>
            <div id="ov-duty-count" style="font-size:18px;font-weight:700;color:#1a3a5c;">—</div>
          </div>
          <div style="flex:1;min-width:130px;background:#f9fafb;border-radius:8px;padding:12px 16px;">
            <div style="font-size:11px;color:#9ca3af;">前月比（平均日商）</div>
            <div id="ov-mom" style="font-size:18px;font-weight:700;color:#1a3a5c;">—</div>
          </div>
        </div>
        <div id="ov-links" style="display:flex;gap:10px;flex-wrap:wrap;"></div>
      </div>
    </div>

    <!-- 売上実績タブ -->
    <div class="crew-tab-panel" data-tab="sales" style="display:${initialTab === 'sales' ? '' : 'none'};">
      <div id="sales-loading" style="color:#9ca3af;font-size:13px;">読み込み中…</div>
      <div id="sales-content" style="display:none;">
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:20px;padding:12px 14px;background:#f9fafb;border-radius:8px;">
          <span style="font-size:12px;color:#6b7280;">月度PDF（勤務実績・売上表）:</span>
          <select id="pdf-month-select" style="border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:12px;"></select>
          <button type="button" onclick="downloadShiftSalesPdf()" style="padding:5px 14px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:12px;cursor:pointer;">PDFダウンロード</button>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0;">日別明細</h4>
          <select id="detail-month-select" onchange="renderDailyDetail()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;"></select>
        </div>
        <div style="display:flex;gap:16px;margin-bottom:14px;">
          <div style="flex:1;background:#f9fafb;border-radius:8px;padding:10px 14px;">
            <div style="font-size:11px;color:#9ca3af;">合計 税込営収</div>
            <div id="detail-sum-amount" style="font-size:16px;font-weight:700;color:#1a3a5c;">—</div>
          </div>
          <div style="flex:1;background:#f9fafb;border-radius:8px;padding:10px 14px;">
            <div style="font-size:11px;color:#9ca3af;">平均日商</div>
            <div id="detail-avg-amount" style="font-size:16px;font-weight:700;color:#1a3a5c;">—</div>
          </div>
          <div style="flex:1;background:#f9fafb;border-radius:8px;padding:10px 14px;">
            <div style="font-size:11px;color:#9ca3af;">乗務日数</div>
            <div id="detail-duty-count" style="font-size:16px;font-weight:700;color:#1a3a5c;">—</div>
          </div>
          <div style="flex:1;background:#f9fafb;border-radius:8px;padding:10px 14px;">
            <div style="font-size:11px;color:#9ca3af;">合計 走行キロ</div>
            <div id="detail-sum-distance" style="font-size:16px;font-weight:700;color:#1a3a5c;">—</div>
          </div>
        </div>
        <div style="overflow-x:auto;margin-bottom:24px;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left;color:#6b7280;">
              <th style="padding:6px 8px;">日付</th><th style="padding:6px 8px;">曜日</th><th style="padding:6px 8px;">勤務</th><th style="padding:6px 8px;">税込営収</th><th style="padding:6px 8px;">営業回数</th><th style="padding:6px 8px;">走行キロ</th>
            </tr></thead>
            <tbody id="detail-tbody"></tbody>
          </table>
        </div>

        <div style="position:relative;height:240px;margin-bottom:24px;"><canvas id="sales-monthly-chart"></canvas></div>
        <div style="position:relative;height:240px;margin-bottom:24px;"><canvas id="sales-weekday-chart"></canvas></div>
        <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">暦要因別の営収差（この社員の平均日商との比較）</h4>
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
          <thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left;color:#6b7280;">
            <th style="padding:6px 8px;">要因</th><th style="padding:6px 8px;">該当日平均</th><th style="padding:6px 8px;">非該当日平均</th><th style="padding:6px 8px;">差分</th><th style="padding:6px 8px;">件数</th>
          </tr></thead>
          <tbody id="sales-factor-tbody"></tbody>
        </table>
      </div>
    </div>

    ${canViewInsights ? `
    <!-- 売上インサイトタブ -->
    <div class="crew-tab-panel" data-tab="insights" style="display:${initialTab === 'insights' ? '' : 'none'};">
      <div id="insight-loading" style="color:#9ca3af;font-size:13px;">読み込み中…</div>
      <div id="insight-content" style="display:none;">

        <div id="insight-headline-box" style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:13px;font-weight:700;color:#78350f;margin-bottom:18px;line-height:1.7;"></div>

        <div style="position:relative;height:220px;margin-bottom:24px;"><canvas id="insight-monthly-chart"></canvas></div>
        <div style="position:relative;height:220px;margin-bottom:24px;"><canvas id="insight-weekday-chart"></canvas></div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;flex-wrap:wrap;gap:8px;">
          <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0;">乗務ごとの売上（月別）</h4>
          <select id="insight-daily-month-select" onchange="renderInsightDailySection()" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:12px;"></select>
        </div>
        <div style="position:relative;height:200px;margin-bottom:12px;"><canvas id="insight-daily-chart"></canvas></div>
        <div style="max-height:360px;overflow-y:auto;margin-bottom:24px;border:1px solid #f3f4f6;border-radius:8px;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left;color:#6b7280;position:sticky;top:0;background:white;">
              <th style="padding:6px 8px;">日付</th><th style="padding:6px 8px;">勤務区分</th><th style="padding:6px 8px;">売上</th><th style="padding:6px 8px;">乗車回数</th><th style="padding:6px 8px;">走行距離</th><th style="padding:6px 8px;">出庫</th><th style="padding:6px 8px;">帰庫</th>
            </tr></thead>
            <tbody id="insight-daily-tbody"></tbody>
          </table>
          <div id="insight-daily-empty" style="display:none;padding:12px;color:#9ca3af;font-size:12px;">この月度の乗務記録はありません</div>
        </div>

        <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">時間帯別の売上の強さ（1乗務日あたり平均）</h4>
        <div style="font-size:10.5px;color:#9ca3af;margin-bottom:6px;">乗車ごとの時刻データはないため、出庫〜帰庫時間に売上（税込収入）を均等按分し、乗務日数で割った「1日あたり平均」の推定値です。乗務のない時間帯は表示していません。棒の上の「k」は千円単位です（例：12.3k＝12,300円）。</div>
        <div id="insight-hourly-sales-peak" style="margin-bottom:8px;"></div>
        <div id="insight-hourly-sales-bars" style="display:flex;align-items:flex-end;gap:4px;height:130px;padding-top:4px;"></div>
        <div id="insight-hourly-sales-note" style="font-size:10.5px;color:#9ca3af;margin-top:8px;margin-bottom:24px;"></div>

        <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">暦要因別の営収差</h4>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px;">
          <thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left;color:#6b7280;">
            <th style="padding:6px 8px;">要因</th><th style="padding:6px 8px;">該当日平均</th><th style="padding:6px 8px;">非該当日平均</th><th style="padding:6px 8px;">差分</th><th style="padding:6px 8px;">件数</th>
          </tr></thead>
          <tbody id="insight-factor-tbody"></tbody>
        </table>

        <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">同条件比較（相対評価）</h4>
        <div id="insight-relative-box" style="margin-bottom:10px;font-size:12px;color:#374151;"></div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:24px;">
          <thead><tr style="border-bottom:1px solid #e5e7eb;text-align:left;color:#6b7280;">
            <th style="padding:6px 8px;">勤務区分</th><th style="padding:6px 8px;">本人平均</th><th style="padding:6px 8px;">他の乗務員平均</th><th style="padding:6px 8px;">差分</th>
          </tr></thead>
          <tbody id="insight-duty-tbody"></tbody>
        </table>

        <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">帰庫時間</h4>
        <div id="insight-return-time-box" style="margin-bottom:24px;font-size:12px;color:#374151;background:#f9fafb;border-radius:8px;padding:10px 14px;"></div>

        <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">賃金インパクト試算（概算）</h4>
        <div id="insight-wage-box" style="margin-bottom:8px;font-size:12px;color:#374151;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;line-height:1.7;"></div>
        <div style="font-size:10.5px;color:#9ca3af;margin-bottom:24px;">※本人の勤務区分に応じた成果手当（歩合部分・公出含む）と、深夜/残業手当の概算です。深夜/残業手当は服務手当・能率手当・段階分け・法定内外区分を省略した簡易計算のため、実際の給与とは異なります。設定値は<a href="${ADMIN_PATH}/settings/wage-estimate" style="color:#2563eb;">賃金試算設定</a>で確認・修正できます。</div>

        <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">最低賃金判定（概算）</h4>
        <div id="insight-min-wage-box" style="margin-bottom:24px;font-size:12px;color:#374151;"></div>

        <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">労働需要の背景</h4>
        <div id="insight-labor-demand-box" style="margin-bottom:24px;font-size:12px;color:#374151;background:#f9fafb;border-radius:8px;padding:10px 14px;line-height:1.7;"></div>

        <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
          <a href="${ADMIN_PATH}/sales-ai/employee/${emp.id}/report/print" target="_blank" style="padding:7px 16px;background:#1a3a5c;color:white;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">🖨️ AI分析レポートを印刷</a>
        </div>

        <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">AI分析 — 弱点・改善提案</h4>
        <div style="display:flex;gap:16px;margin-bottom:16px;">
          <div style="flex:1;">
            <div style="font-size:12px;font-weight:700;color:#b91c1c;margin-bottom:6px;">弱点・改善余地</div>
            <ul id="insight-weak-list" style="margin:0;padding-left:18px;font-size:12px;line-height:1.8;color:#374151;"></ul>
          </div>
          <div style="flex:1;">
            <div style="font-size:12px;font-weight:700;color:#166534;margin-bottom:6px;">強み</div>
            <ul id="insight-strong-list" style="margin:0;padding-left:18px;font-size:12px;line-height:1.8;color:#374151;"></ul>
          </div>
        </div>
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;">改善提案</div>
        <ul id="insight-rec-list" style="margin:0;padding-left:18px;font-size:12px;line-height:1.8;color:#374151;"></ul>
      </div>
    </div>` : ''}

    ${canViewSafety ? `
    <!-- 安全タブ -->
    <div class="crew-tab-panel" data-tab="safety" style="display:${initialTab === 'safety' ? '' : 'none'};">
      <div style="background:#f9fafb;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:6px;">事故記録（全期間累計）</div>
        <div style="font-size:13px;color:#374151;">事故件数: <strong>${accidentCount}件</strong>${accidentLastDate ? ' ／ 直近の事故日: ' + escHtml(accidentLastDate) : ''}</div>
        <a href="${ADMIN_PATH}/accidents/person/${encodeURIComponent(emp.emp_no)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:10px;padding:7px 14px;background:#1a3a5c;color:white;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">事故記録・傾向レポートを見る（別タブで開きます）→</a>
      </div>
      <h4 style="font-size:13px;font-weight:700;color:#374151;margin:0 0 10px;">安全運転リスク（参考指標・事故記録ではありません）</h4>
      <div id="safety-loading" style="color:#9ca3af;font-size:13px;">読み込み中…</div>
      <div id="risk-box" style="display:none;font-size:12px;color:#374151;"></div>
    </div>` : ''}
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js" integrity="sha384-jb8JQMbMoBUzgWatfe6COACi2ljcDdZQ2OxczGA3bGNeWe+6DChMTBJemed7ZnvJ" crossorigin="anonymous"></script>
<script>
const STAFF_ID = ${emp.id};
const ADMIN_PATH = '${ADMIN_PATH}';
const CAN_VIEW_INSIGHTS = ${canViewInsights ? 'true' : 'false'};
const CAN_VIEW_SAFETY = ${canViewSafety ? 'true' : 'false'};
let activeTab = '${initialTab}';
let salesData = null, reportData = null;
let salesMonthlyChart = null, salesWeekdayChart = null;
let insightMonthlyChart = null, insightWeekdayChart = null, insightDailyChart = null;

function escHtmlJs(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.crew-tab-btn').forEach(function(b) {
    const on = b.dataset.tab === tab;
    b.style.borderBottomColor = on ? '#1a3a5c' : 'transparent';
    b.style.color = on ? '#1a3a5c' : '#9ca3af';
  });
  document.querySelectorAll('.crew-tab-panel').forEach(function(p) {
    p.style.display = p.dataset.tab === tab ? '' : 'none';
  });
  const url = new URL(window.location.href);
  url.searchParams.set('tab', tab);
  history.replaceState(null, '', url);
  renderActiveTab();
}

function onPeriodChange() {
  salesData = null;
  reportData = null;
  renderActiveTab();
}

function renderActiveTab() {
  if (activeTab === 'overview') renderOverviewTab();
  else if (activeTab === 'sales') renderSalesTab();
  else if (activeTab === 'insights' && CAN_VIEW_INSIGHTS) renderInsightsTab();
  else if (activeTab === 'safety' && CAN_VIEW_SAFETY) renderSafetyTab();
}

async function ensureSalesData() {
  if (salesData) return salesData;
  const months = document.getElementById('period-select').value;
  const res = await fetch('/api/sales-ai/employee/' + STAFF_ID + '?months=' + months);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || '読み込みに失敗しました');
  salesData = json;
  return json;
}

async function ensureReportData() {
  if (reportData) return reportData;
  const months = document.getElementById('period-select').value;
  const res = await fetch('/api/sales-ai/employee/' + STAFF_ID + '/report?months=' + months);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || '読み込みに失敗しました');
  reportData = json;
  return json;
}

// ===== 概要タブ =====
async function renderOverviewTab() {
  document.getElementById('overview-loading').style.display = '';
  document.getElementById('overview-content').style.display = 'none';
  try {
    const json = await ensureSalesData();
    if (!json.monthly.length) {
      document.getElementById('overview-loading').textContent = 'この期間の売上データがありません（CSVインポートまたはLINE売上記録で登録されると表示されます）';
      return;
    }
    document.getElementById('overview-loading').style.display = 'none';
    document.getElementById('overview-content').style.display = '';

    const last = json.monthly[json.monthly.length - 1];
    const prev = json.monthly.length > 1 ? json.monthly[json.monthly.length - 2] : null;
    document.getElementById('ov-month-total').textContent = last.total.toLocaleString('ja-JP') + '円';
    document.getElementById('ov-avg').textContent = Math.round(last.avgPerDuty).toLocaleString('ja-JP') + '円';
    document.getElementById('ov-duty-count').textContent = last.count + '日';
    const momEl = document.getElementById('ov-mom');
    if (prev && prev.avgPerDuty) {
      const diff = Math.round((last.avgPerDuty - prev.avgPerDuty) / prev.avgPerDuty * 1000) / 10;
      momEl.textContent = (diff >= 0 ? '+' : '') + diff + '%';
      momEl.style.color = diff >= 0 ? '#059669' : '#dc2626';
    } else {
      momEl.textContent = '—';
      momEl.style.color = '#1a3a5c';
    }

    const links = [];
    if (CAN_VIEW_INSIGHTS) {
      links.push('<button type="button" onclick="switchTab(\\'insights\\')" style="padding:7px 14px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">売上インサイトを見る →</button>');
    }
    if (CAN_VIEW_SAFETY) {
      const risk = json.drivingRisk;
      const RISK_LABELS = { low: '低', medium: '中', high: '高' };
      const label = risk ? ('安全タブを見る（リスク' + RISK_LABELS[risk.riskLevel] + '） →') : '安全タブを見る →';
      links.push('<button type="button" onclick="switchTab(\\'safety\\')" style="padding:7px 14px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">' + label + '</button>');
    }
    document.getElementById('ov-links').innerHTML = links.join('');
  } catch (err) {
    document.getElementById('overview-loading').textContent = '通信エラーが発生しました';
  }
}

// ===== 売上実績タブ =====
function downloadShiftSalesPdf() {
  const val = document.getElementById('pdf-month-select').value;
  if (!val) { alert('対象月度がありません（売上データがまだ登録されていません）'); return; }
  const [year, month] = val.split('-');
  window.open('/api/sales-ai/employee/' + STAFF_ID + '/pdf?year=' + year + '&month=' + month, '_blank');
}

async function renderSalesTab() {
  document.getElementById('sales-loading').style.display = '';
  document.getElementById('sales-content').style.display = 'none';
  try {
    const json = await ensureSalesData();
    if (!json.monthly.length) {
      document.getElementById('sales-loading').textContent = 'この期間の売上データがありません（CSVインポートまたはLINE売上記録で登録されると表示されます）';
      return;
    }
    document.getElementById('sales-loading').style.display = 'none';
    document.getElementById('sales-content').style.display = '';

    const pdfSelect = document.getElementById('pdf-month-select');
    pdfSelect.innerHTML = json.monthly.slice().reverse().map(function(m) {
      return '<option value="' + m.year + '-' + m.month + '">' + m.year + '年' + m.month + '月度</option>';
    }).join('');

    const detailSelect = document.getElementById('detail-month-select');
    const prevDetailVal = detailSelect.value;
    detailSelect.innerHTML = json.monthly.slice().reverse().map(function(m) {
      return '<option value="' + m.year + '-' + m.month + '">' + m.year + '年' + m.month + '月度</option>';
    }).join('');
    if (prevDetailVal && [...detailSelect.options].some(function(o) { return o.value === prevDetailVal; })) detailSelect.value = prevDetailVal;
    renderDailyDetail();

    const monthLabels = json.monthly.map(function(m) { return m.year + '年' + m.month + '月度'; });
    const monthTotals = json.monthly.map(function(m) { return m.total; });
    if (salesMonthlyChart) salesMonthlyChart.destroy();
    salesMonthlyChart = new Chart(document.getElementById('sales-monthly-chart').getContext('2d'), {
      type: 'bar',
      data: { labels: monthLabels, datasets: [{ label: '月度売上合計(円)', data: monthTotals, backgroundColor: 'rgba(37,99,235,0.7)', borderRadius: 4 }] },
      options: { responsive: true, plugins: { title: { display: true, text: '月度売上推移' } }, scales: { y: { beginAtZero: true } } }
    });

    const wdLabels = json.weekdayBreakdown.map(function(w) { return w.label; });
    const wdAvgs = json.weekdayBreakdown.map(function(w) { return w.avg || 0; });
    if (salesWeekdayChart) salesWeekdayChart.destroy();
    salesWeekdayChart = new Chart(document.getElementById('sales-weekday-chart').getContext('2d'), {
      type: 'bar',
      data: { labels: wdLabels, datasets: [{ label: '曜日別平均売上(円)', data: wdAvgs, backgroundColor: 'rgba(5,150,105,0.7)', borderRadius: 4 }] },
      options: { responsive: true, plugins: { title: { display: true, text: '曜日別 平均売上' } }, scales: { y: { beginAtZero: true } } }
    });

    const tbody = document.getElementById('sales-factor-tbody');
    tbody.innerHTML = json.factorBreakdown.map(function(f) {
      if (f.countTrue === 0) return '';
      const diffColor = f.diffPct === null ? '#9ca3af' : (f.diffPct >= 0 ? '#059669' : '#dc2626');
      const diffText = f.diffPct === null ? '—' : (f.diffPct >= 0 ? '+' : '') + f.diffPct + '%';
      return '<tr style="border-bottom:1px solid #f3f4f6;">' +
        '<td style="padding:7px 8px;font-weight:600;">' + f.label + '</td>' +
        '<td style="padding:7px 8px;">' + (f.avgTrue !== null ? f.avgTrue.toLocaleString('ja-JP') + '円' : '—') + '</td>' +
        '<td style="padding:7px 8px;">' + (f.avgFalse !== null ? f.avgFalse.toLocaleString('ja-JP') + '円' : '—') + '</td>' +
        '<td style="padding:7px 8px;font-weight:700;color:' + diffColor + ';">' + diffText + '</td>' +
        '<td style="padding:7px 8px;color:#9ca3af;">' + f.countTrue + '件</td>' +
        '</tr>';
    }).join('');
  } catch (err) {
    document.getElementById('sales-loading').textContent = '通信エラーが発生しました';
  }
}

function renderDailyDetail() {
  const tbody = document.getElementById('detail-tbody');
  if (!salesData) { tbody.innerHTML = ''; return; }
  const val = document.getElementById('detail-month-select').value;
  if (!val) { tbody.innerHTML = ''; return; }
  const [y, m] = val.split('-').map(Number);
  const rows = salesData.daily.filter(function(d) { return d.periodYear === y && d.periodMonth === m; }).slice().sort(function(a, b) { return a.date < b.date ? -1 : 1; });

  tbody.innerHTML = rows.map(function(d) {
    const wdColor = d.weekdayLabel === '日' ? '#dc2626' : d.weekdayLabel === '土' ? '#2563eb' : '#374151';
    return '<tr style="border-bottom:1px solid #f3f4f6;">' +
      '<td style="padding:6px 8px;">' + d.date + '</td>' +
      '<td style="padding:6px 8px;color:' + wdColor + ';">' + d.weekdayLabel + '</td>' +
      '<td style="padding:6px 8px;">' + (d.dutyCode ?? '—') + '</td>' +
      '<td style="padding:6px 8px;">' + d.amount.toLocaleString('ja-JP') + '円</td>' +
      '<td style="padding:6px 8px;">' + (d.rideCount ?? '—') + '</td>' +
      '<td style="padding:6px 8px;">' + (d.distanceKm != null ? d.distanceKm.toLocaleString('ja-JP') + 'km' : '—') + '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="6" style="padding:12px 8px;color:#9ca3af;">この月度のデータがありません</td></tr>';

  const sumAmount = rows.reduce(function(s, d) { return s + d.amount; }, 0);
  const sumDistance = rows.reduce(function(s, d) { return s + (d.distanceKm ?? 0); }, 0);
  document.getElementById('detail-sum-amount').textContent = sumAmount.toLocaleString('ja-JP') + '円';
  document.getElementById('detail-avg-amount').textContent = rows.length ? Math.round(sumAmount / rows.length).toLocaleString('ja-JP') + '円' : '—';
  document.getElementById('detail-duty-count').textContent = rows.length + '日';
  document.getElementById('detail-sum-distance').textContent = sumDistance ? sumDistance.toLocaleString('ja-JP') + 'km' : '—';
}

${canViewInsights ? `
// ===== 売上インサイトタブ =====
async function renderInsightsTab() {
  document.getElementById('insight-loading').style.display = '';
  document.getElementById('insight-content').style.display = 'none';
  try {
    const [data, report] = await Promise.all([ensureSalesData(), ensureReportData()]);
    if (!data.monthly.length) { document.getElementById('insight-loading').textContent = 'この期間の売上データがありません'; return; }

    document.getElementById('insight-loading').style.display = 'none';
    document.getElementById('insight-content').style.display = '';

    document.getElementById('insight-headline-box').textContent = report.content.headline;

    const monthLabels = data.monthly.map(function(m) { return m.year + '年' + m.month + '月度'; });
    const monthTotals = data.monthly.map(function(m) { return m.avgPerDuty; });
    if (insightMonthlyChart) insightMonthlyChart.destroy();
    insightMonthlyChart = new Chart(document.getElementById('insight-monthly-chart').getContext('2d'), {
      type: 'bar',
      data: { labels: monthLabels, datasets: [{ label: '月度平均日商(円)', data: monthTotals, backgroundColor: 'rgba(37,99,235,0.7)', borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: '月度平均日商の推移' } }, scales: { y: { beginAtZero: true } } }
    });

    const wdLabels = data.weekdayBreakdown.map(function(w) { return w.label; });
    const wdAvgs = data.weekdayBreakdown.map(function(w) { return w.avg || 0; });
    if (insightWeekdayChart) insightWeekdayChart.destroy();
    insightWeekdayChart = new Chart(document.getElementById('insight-weekday-chart').getContext('2d'), {
      type: 'bar',
      data: { labels: wdLabels, datasets: [{ label: '曜日別平均売上(円)', data: wdAvgs, backgroundColor: 'rgba(5,150,105,0.7)', borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: '曜日別 平均売上' } }, scales: { y: { beginAtZero: true } } }
    });

    const monthSelect = document.getElementById('insight-daily-month-select');
    const prevSelected = monthSelect.value;
    monthSelect.innerHTML = data.monthly.map(function(m) {
      const key = m.year + '-' + m.month;
      return '<option value="' + key + '">' + m.year + '年' + m.month + '月度（' + m.count + '件）</option>';
    }).join('');
    if (data.monthly.length) {
      const keys = data.monthly.map(function(m) { return m.year + '-' + m.month; });
      monthSelect.value = keys.includes(prevSelected) ? prevSelected : keys[keys.length - 1];
    }
    renderInsightDailySection();

    const worked = data.hourlySales.hourly.filter(function(h) { return h.sampleCount > 0; });
    if (!worked.length) {
      document.getElementById('insight-hourly-sales-peak').innerHTML = '';
      document.getElementById('insight-hourly-sales-bars').innerHTML = '<div style="color:#9ca3af;font-size:12px;">出庫・帰庫時刻のデータが不足しています</div>';
      document.getElementById('insight-hourly-sales-note').textContent = '';
    } else {
      const hourlyMax = Math.max.apply(null, worked.map(function(h) { return h.avgAmount; }).concat([1]));
      const ranked = worked.slice().sort(function(a, b) { return b.avgAmount - a.avgAmount; });
      const top3 = ranked.slice(0, 3).filter(function(h) { return h.avgAmount > 0; });
      const peakHours = new Set(top3.map(function(h) { return h.hour; }));
      const showAllLabels = worked.length <= 14;
      document.getElementById('insight-hourly-sales-peak').innerHTML = top3.length
        ? '<span style="font-size:11px;color:#6b7280;margin-right:6px;">強い時間帯：</span>' + top3.map(function(h, i) {
            return '<span style="display:inline-flex;align-items:center;gap:4px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:3px 10px;margin:0 6px 6px 0;font-weight:700;color:#1a3a5c;">' +
            (i + 1) + '位　' + h.hour + '時台　' + h.avgAmount.toLocaleString('ja-JP') + '円/日</span>';
          }).join('')
        : '';
      document.getElementById('insight-hourly-sales-bars').innerHTML = worked.map(function(h) {
        const ratio = h.avgAmount / hourlyMax;
        const isPeak = peakHours.has(h.hour);
        const lightness = Math.round(86 - Math.max(0, Math.min(1, ratio)) * 53);
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:3px;min-width:0;">' +
          '<div style="font-size:10px;font-weight:700;color:' + (isPeak ? '#1a3a5c' : '#475569') + ';line-height:1;height:11px;white-space:nowrap;">' + (h.avgAmount > 0 ? (Math.round(h.avgAmount / 100) / 10) + 'k' : '') + '</div>' +
          '<div style="width:100%;max-width:22px;border-radius:3px 3px 1px 1px;background:hsl(208,62%,' + lightness + '%);' + (isPeak ? 'box-shadow:0 0 0 2px #1a3a5c inset;' : '') + 'height:' + (h.avgAmount > 0 ? Math.max(Math.round(ratio * 100), 4) : 2) + 'px;"></div>' +
          '<div style="font-size:9px;color:#94a3b8;">' + (showAllLabels || h.hour % 2 === 0 ? h.hour : '') + '</div>' +
        '</div>';
      }).join('');
      document.getElementById('insight-hourly-sales-note').textContent =
        '出庫・帰庫時刻データ ' + data.hourlySales.totalCount + '件中 ' + data.hourlySales.coverageCount + '件から算出（乗務のあった' + worked.length + '時間帯のみ表示）';
    }

    document.getElementById('insight-factor-tbody').innerHTML = data.factorBreakdown.map(function(f) {
      if (f.countTrue === 0) return '';
      const diffColor = f.diffPct === null ? '#9ca3af' : (f.diffPct >= 0 ? '#059669' : '#dc2626');
      const diffText = f.diffPct === null ? '—' : (f.diffPct >= 0 ? '+' : '') + f.diffPct + '%';
      return '<tr style="border-bottom:1px solid #f3f4f6;">' +
        '<td style="padding:7px 8px;font-weight:600;">' + f.label + '</td>' +
        '<td style="padding:7px 8px;">' + (f.avgTrue !== null ? f.avgTrue.toLocaleString('ja-JP') + '円' : '—') + '</td>' +
        '<td style="padding:7px 8px;">' + (f.avgFalse !== null ? f.avgFalse.toLocaleString('ja-JP') + '円' : '—') + '</td>' +
        '<td style="padding:7px 8px;font-weight:700;color:' + diffColor + ';">' + diffText + '</td>' +
        '<td style="padding:7px 8px;color:#9ca3af;">' + f.countTrue + '件</td>' +
        '</tr>';
    }).join('');

    if (data.relative) {
      const dDiff = data.relative.divisionDiffPct;
      const dColor = dDiff === null ? '#6b7280' : (dDiff >= 0 ? '#059669' : '#dc2626');
      const dText = dDiff === null ? '比較対象データがありません' : ((dDiff >= 0 ? '+' : '') + dDiff + '%');
      document.getElementById('insight-relative-box').innerHTML =
        data.relative.periodLabel + '： 本人平均日商 ' + data.relative.selfAvg.toLocaleString('ja-JP') + '円 ／ 同じ課の他の乗務員平均（' + data.relative.peerCount + '名） ' +
        (data.relative.peerAvg !== null ? data.relative.peerAvg.toLocaleString('ja-JP') + '円' : '—') +
        ' ／ 差分 <span style="font-weight:700;color:' + dColor + ';">' + dText + '</span>';

      document.getElementById('insight-duty-tbody').innerHTML = data.relative.dutyComparison.map(function(d) {
        const diffColor = d.diffPct === null ? '#9ca3af' : (d.diffPct >= 0 ? '#059669' : '#dc2626');
        const diffText = d.diffPct === null ? '—' : (d.diffPct >= 0 ? '+' : '') + d.diffPct + '%';
        return '<tr style="border-bottom:1px solid #f3f4f6;">' +
          '<td style="padding:7px 8px;font-weight:600;">' + d.dutyCode + '（' + d.selfCount + '日）</td>' +
          '<td style="padding:7px 8px;">' + d.selfAvg.toLocaleString('ja-JP') + '円</td>' +
          '<td style="padding:7px 8px;">' + (d.peerAvg !== null ? d.peerAvg.toLocaleString('ja-JP') + '円' : '—') + '</td>' +
          '<td style="padding:7px 8px;font-weight:700;color:' + diffColor + ';">' + diffText + '</td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="4" style="padding:10px 8px;color:#9ca3af;">当月度のデータがありません</td></tr>';
    } else {
      document.getElementById('insight-relative-box').textContent = '比較対象データがありません';
      document.getElementById('insight-duty-tbody').innerHTML = '';
    }

    if (data.returnTime.sufficientData) {
      document.getElementById('insight-return-time-box').textContent = '平均帰庫時刻: ' + data.returnTime.avg + '（' + data.returnTime.count + '件のデータより算出）';
    } else {
      document.getElementById('insight-return-time-box').textContent = '帰庫時刻のデータを蓄積中です（現在' + data.returnTime.count + '件。10件以上で傾向を表示します）';
    }

    document.getElementById('insight-wage-box').textContent = report.content.wage_summary || 'データが不足しているため試算できません（当月度の実績が必要です）';
    document.getElementById('insight-labor-demand-box').textContent = report.content.labor_demand_note;

    const mw = data.minimumWage;
    if (mw && mw.sufficientData) {
      const box = document.getElementById('insight-min-wage-box');
      if (mw.isMinimumWageEarner) {
        box.innerHTML =
          '<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;line-height:1.8;">' +
          '<span style="background:#dc2626;color:white;border-radius:12px;padding:2px 10px;font-size:11px;font-weight:700;">最賃者（概算）</span><br>' +
          '概算給与 ' + mw.estimatedPay.toLocaleString('ja-JP') + '円 ／ 最低賃金保障額 ' + mw.guaranteedPay.toLocaleString('ja-JP') + '円' +
          '（実労働時間 ' + mw.laborHoursTotal + '時間）<br>' +
          '<strong style="color:#dc2626;">補填額(概算): ' + mw.shortfall.toLocaleString('ja-JP') + '円</strong>' +
          '</div>';
      } else {
        box.innerHTML =
          '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;line-height:1.8;">' +
          '概算給与 ' + mw.estimatedPay.toLocaleString('ja-JP') + '円 ／ 最低賃金保障額 ' + mw.guaranteedPay.toLocaleString('ja-JP') + '円' +
          '（実労働時間 ' + mw.laborHoursTotal + '時間）— 最低賃金を上回っています' +
          '</div>';
      }
    } else {
      document.getElementById('insight-min-wage-box').innerHTML = '<div style="color:#9ca3af;background:#f9fafb;border-radius:8px;padding:10px 14px;">実労働時間データが不足しているため判定できません（ホシコン形式CSVの取込で蓄積されます）</div>';
    }

    document.getElementById('insight-weak-list').innerHTML = report.content.weak_points.map(function(t) { return '<li>' + escHtmlJs(t) + '</li>'; }).join('') || '<li style="color:#9ca3af;">特筆すべき弱点は見られません</li>';
    document.getElementById('insight-strong-list').innerHTML = report.content.strong_points.map(function(t) { return '<li>' + escHtmlJs(t) + '</li>'; }).join('') || '<li style="color:#9ca3af;">特筆すべき強みは見られません</li>';
    document.getElementById('insight-rec-list').innerHTML = report.content.recommendations.map(function(t) { return '<li>' + escHtmlJs(t) + '</li>'; }).join('');
  } catch (err) {
    document.getElementById('insight-loading').textContent = '通信エラーが発生しました';
  }
}

function renderInsightDailySection() {
  if (!salesData) return;
  const sel = document.getElementById('insight-daily-month-select').value;
  if (!sel) {
    document.getElementById('insight-daily-tbody').innerHTML = '';
    document.getElementById('insight-daily-empty').style.display = '';
    if (insightDailyChart) { insightDailyChart.destroy(); insightDailyChart = null; }
    return;
  }
  const [selYear, selMonth] = sel.split('-').map(Number);
  const rows = salesData.daily.filter(function(r) { return r.periodYear === selYear && r.periodMonth === selMonth; });
  const sorted = rows.slice().sort(function(a, b) { return a.date < b.date ? -1 : 1; });

  document.getElementById('insight-daily-empty').style.display = sorted.length ? 'none' : '';
  document.getElementById('insight-daily-tbody').innerHTML = sorted.slice().reverse().map(function(r) {
    return '<tr style="border-bottom:1px solid #f3f4f6;">' +
      '<td style="padding:6px 8px;white-space:nowrap;">' + r.date + '（' + escHtmlJs(r.weekdayLabel) + '）</td>' +
      '<td style="padding:6px 8px;">' + (r.dutyCode ? escHtmlJs(r.dutyCode) : '—') + '</td>' +
      '<td style="padding:6px 8px;font-weight:600;">' + r.amount.toLocaleString('ja-JP') + '円</td>' +
      '<td style="padding:6px 8px;">' + (r.rideCount ?? '—') + '</td>' +
      '<td style="padding:6px 8px;">' + (r.distanceKm != null ? r.distanceKm + 'km' : '—') + '</td>' +
      '<td style="padding:6px 8px;">' + (r.startTime ?? '—') + '</td>' +
      '<td style="padding:6px 8px;">' + (r.returnTime ?? '—') + '</td>' +
      '</tr>';
  }).join('');

  const labels = sorted.map(function(r) { return r.date.slice(5).replace('-', '/') + '（' + r.weekdayLabel + '）'; });
  const amounts = sorted.map(function(r) { return r.amount; });
  if (insightDailyChart) insightDailyChart.destroy();
  insightDailyChart = new Chart(document.getElementById('insight-daily-chart').getContext('2d'), {
    type: 'line',
    data: { labels: labels, datasets: [{ label: '乗務ごとの売上(円)', data: amounts, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.12)', fill: true, tension: 0.15, pointRadius: 3 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: '日付ごとの売上の推移' }, legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
}
` : ''}

${canViewSafety ? `
// ===== 安全タブ =====
async function renderSafetyTab() {
  document.getElementById('safety-loading').style.display = '';
  document.getElementById('risk-box').style.display = 'none';
  try {
    const json = await ensureSalesData();
    const months = document.getElementById('period-select').value;
    document.getElementById('safety-loading').style.display = 'none';
    const box = document.getElementById('risk-box');
    box.style.display = '';
    const risk = json.drivingRisk;
    if (risk) {
      const RISK_COLORS = { low: '#166534', medium: '#d97706', high: '#dc2626' };
      const RISK_BG = { low: '#f0fdf4', medium: '#fffbeb', high: '#fef2f2' };
      const RISK_LABELS = { low: '低', medium: '中', high: '高' };
      box.innerHTML =
        '<span style="display:inline-block;background:' + RISK_BG[risk.riskLevel] + ';color:' + RISK_COLORS[risk.riskLevel] + ';border-radius:12px;padding:3px 12px;font-size:12px;font-weight:700;margin-bottom:8px;">総合判定: リスク' + RISK_LABELS[risk.riskLevel] + '</span>' +
        '<div style="display:flex;gap:16px;background:#f9fafb;border-radius:8px;padding:10px 14px;margin-bottom:8px;flex-wrap:wrap;">' +
        '<div>急挙動合計: <strong>' + risk.totalHarshEvents + '件</strong></div>' +
        '<div>乗務日あたり: <strong>' + risk.harshEventsPerDuty + '件</strong></div>' +
        '<div>最高速度(高速/一般): <strong>' + (risk.maxSpeedHighway ?? '—') + '/' + (risk.maxSpeedLocal ?? '—') + 'km/h</strong></div>' +
        '<div>速度超過日数: <strong>' + risk.speedingDays + '日</strong></div>' +
        '</div>' +
        '<a href="' + ADMIN_PATH + '/sales-ai/employee/' + STAFF_ID + '/safety-guidance/print?months=' + months + '" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">🚨 安全運転指導書を印刷</a>';
    } else {
      box.innerHTML = '<div style="color:#9ca3af;background:#f9fafb;border-radius:8px;padding:10px 14px;">安全運転データがまだありません（ホシコン形式CSVの取込で蓄積されます）</div>';
    }
  } catch (err) {
    document.getElementById('safety-loading').textContent = '通信エラーが発生しました';
  }
}
` : ''}

renderActiveTab();
</script>`;

  return c.html(layout(`${emp.name} — 社員カルテ`, content, 'staff'));
});

export default app;
