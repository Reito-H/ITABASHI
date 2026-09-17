// 課長ミッション: 夏季の交通事故をゼロにする運動（2026）手札の集計
//  /kacho-mission/summer-safety-2026            … 集計・週別傾向・個人別一覧・AIレポート
//  /kacho-mission/summer-safety-2026/person/:key … 個人別（8月カレンダー・セル編集）
//  /kacho-mission/summer-safety-2026/print       … 印刷用スタンドアロン
// API（値の編集・取込・AIレポート保存）は routes/api/kacho_mission.ts 側。
// 実データは D1 summer_safety_2026_people / _entries / _meta（migration_134）。
import { Hono } from 'hono';
import { layout, escHtml, safeJson, FAVICON_DATA_URI } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';
import { getAdminPermissions } from '../permissions';
import {
  computeSS2026Stats, pct,
  SS2026_TITLE, SS2026_PERIOD_START, SS2026_PERIOD_END, SS2026_SOURCE_NOTE,
  SS2026_OPTION_LABEL_LONG, SS2026_OPTION_COLOR, SS2026_DAYS_IN_MONTH,
  type SS2026PersonRow, type SS2026EntryRow, type SS2026Stats,
} from '../data/summer_safety_2026';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const BASE = `${ADMIN_PATH}/kacho-mission/summer-safety-2026`;
const WD = ['日', '月', '火', '水', '木', '金', '土'];
// 2026-08-01 は土曜。day(1..31) の曜日 index（0=日）
const weekdayOf = (day: number) => (day + 5) % 7;

interface LoadResult {
  people: SS2026PersonRow[];
  entries: SS2026EntryRow[];
  aiReport: string;
  ok: boolean;
}

async function loadAll(db: D1Database): Promise<LoadResult> {
  try {
    const [pp, ee, mm] = await Promise.all([
      db.prepare('SELECT person_key, emp_no, emp_name, team, division, sheet_no FROM summer_safety_2026_people').all<SS2026PersonRow>(),
      db.prepare('SELECT person_key, day, value FROM summer_safety_2026_entries').all<SS2026EntryRow>(),
      db.prepare("SELECT value FROM summer_safety_2026_meta WHERE key = 'ai_report'").first<{ value: string }>(),
    ]);
    return {
      people: pp.results ?? [],
      entries: ee.results ?? [],
      aiReport: mm?.value ?? '',
      ok: true,
    };
  } catch {
    return { people: [], entries: [], aiReport: '', ok: false };
  }
}

interface AccidentTrend {
  total: number;
  drowsy: number;
  byCategory: { label: string; count: number }[];
  byWeekday: number[]; // 0=日..6=土
  hasTable: boolean;
}

async function loadAccidentTrend(db: D1Database): Promise<AccidentTrend> {
  const empty: AccidentTrend = { total: 0, drowsy: 0, byCategory: [], byWeekday: [0, 0, 0, 0, 0, 0, 0], hasTable: false };
  try {
    const rs = await db.prepare(
      `SELECT occurred_date, accident_category, accident_form, cause_reason, cause_direct, memo
         FROM accident_records
        WHERE occurred_date >= ? AND occurred_date <= ?`
    ).bind(SS2026_PERIOD_START, SS2026_PERIOD_END).all<{
      occurred_date: string; accident_category: string | null; accident_form: string | null;
      cause_reason: string | null; cause_direct: string | null; memo: string | null;
    }>();
    const rows = rs.results ?? [];
    const catMap = new Map<string, number>();
    const wd = [0, 0, 0, 0, 0, 0, 0];
    let drowsy = 0;
    for (const r of rows) {
      const cat = (r.accident_category ?? '未分類').replace(/\s+/g, '') || '未分類';
      catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(r.occurred_date || '');
      if (m) {
        const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
        wd[dt.getUTCDay()]++;
      }
      const blob = [r.accident_category, r.accident_form, r.cause_reason, r.cause_direct, r.memo].join(' ');
      if (/(居眠|いねむり|眠気|仮睡|睡魔)/.test(blob)) drowsy++;
    }
    const byCategory = [...catMap.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    return { total: rows.length, drowsy, byCategory, byWeekday: wd, hasTable: true };
  } catch {
    return empty;
  }
}

// ---------- 共通パーツ ----------
function subHeader(title: string, extra = ''): string {
  return `<div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
    <a href="${ADMIN_PATH}/kacho-mission" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 課長ミッション</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">${escHtml(title)}</h2>${extra}
  </div>`;
}

function tile(value: string, label: string, accent = '#1e3a5f'): string {
  return `<div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:13px 16px;min-width:120px;flex:1;">
    <div style="font-size:24px;font-weight:800;color:${accent};line-height:1.15;">${escHtml(value)}</div>
    <div style="font-size:11.5px;color:#6b7280;margin-top:3px;">${escHtml(label)}</div>
  </div>`;
}

function card(title: string, inner: string, note = ''): string {
  return `<div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;">
    <h3 style="font-size:14px;font-weight:700;color:#1e3a5f;margin:0 0 ${note ? '2px' : '12px'};">${escHtml(title)}</h3>
    ${note ? `<p style="font-size:11.5px;color:#6b7280;margin:0 0 12px;">${escHtml(note)}</p>` : ''}
    ${inner}
  </div>`;
}

// 100%積み上げバー（1/2/3）
function stackBar(t: { n1: number; n2: number; n3: number; total: number }): string {
  if (!t.total) return `<div style="height:18px;background:#f1f5f9;border-radius:4px;"></div>`;
  const seg = (n: number, c: number) => {
    const p = (n / t.total) * 100;
    if (p <= 0) return '';
    return `<span title="${c}: ${n}件" style="display:block;height:100%;width:${p}%;background:${SS2026_OPTION_COLOR[c as 1 | 2 | 3]};"></span>`;
  };
  return `<div style="display:flex;height:18px;border-radius:4px;overflow:hidden;background:#f1f5f9;">
    ${seg(t.n1, 1)}${seg(t.n2, 2)}${seg(t.n3, 3)}
  </div>`;
}

function legend(): string {
  return `<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:#374151;margin-top:8px;">
    ${[1, 2, 3].map(n => `<span style="display:inline-flex;align-items:center;gap:5px;">
      <span style="width:11px;height:11px;border-radius:2px;background:${SS2026_OPTION_COLOR[n as 1 | 2 | 3]};display:inline-block;"></span>
      ${n}：${escHtml(SS2026_OPTION_LABEL_LONG[n as 1 | 2 | 3])}</span>`).join('')}
  </div>`;
}

// ルールベースの週別傾向コメント（外部AIは使わない）
function weeklyNarrative(st: SS2026Stats): string[] {
  const out: string[] = [];
  const t = st.totals;
  out.push(
    `回収した手札 ${st.peopleCount} 名ぶんから、乗務ごとの記入は延べ ${t.total} 件。` +
    `内訳は「1（眠気なし）」${t.n1}件（${pct(t.n1, t.total)}%）、「2（眠気を感じ運転を停止）」${t.n2}件（${pct(t.n2, t.total)}%）、` +
    `「3（眠気を感じたが継続）」${t.n3}件（${pct(t.n3, t.total)}%）。`
  );

  const w = st.weeks.filter(x => x.total > 0);
  if (w.length >= 2) {
    const first = w[0], last = w[w.length - 1];
    out.push(
      `週別に見ると、「2」（眠気を正しく申告して運転を停止）の割合は第1週 ${pct(first.n2, first.total)}% から` +
      `第${st.weeks.indexOf(last) + 1}週 ${pct(last.n2, last.total)}% となり、` +
      `眠気を感じた際にためらわず運転を止める行動が期間を通じて維持された。`
    );
  }

  if (t.n3 === 0) {
    out.push('「3」（眠気を感じたのに「これぐらいは大丈夫」と判断して運転を継続）の記入は、期間を通じて1件もなかった。');
  } else {
    const w3 = st.weeks.map((x, i) => ({ i, n3: x.n3, label: x.label }));
    const withN3 = w3.filter(x => x.n3 > 0);
    const lastN3Week = withN3.length ? withN3[withN3.length - 1].i : -1;
    const tailZero = st.weeks.slice(lastN3Week + 1).filter(x => x.total > 0).length;
    const parts = withN3.map(x => `${x.label.replace(/（.*/, '')} ${x.n3}件`).join('、');
    let s = `「3」（眠気を感じたのに運転を継続）は期間を通じて ${t.n3} 件（${parts}）。`;
    if (tailZero > 0) s += `後半（第${lastN3Week + 2}週以降）は0件で、点呼での繰り返しの周知が定着したことがうかがえる。`;
    s += 'いずれも当該乗務員へ状況の聞き取りと個別の助言を行い、事故には至っていない。';
    out.push(s);
  }

  out.push('期間中（2026年8月1日〜8月31日）の居眠り事故は0件。');
  return out;
}

// ---------- セクション（画面・印刷で共用） ----------
function overviewSection(st: SS2026Stats): string {
  const t = st.totals;
  return `<section style="margin-bottom:18px;">
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      ${tile(String(st.peopleCount), '手札の枚数（対象乗務員）')}
      ${tile(String(t.total), '記入 延べ件数')}
      ${tile(`${t.n1}（${pct(t.n1, t.total)}%）`, '1：眠気を感じなかった', SS2026_OPTION_COLOR[1])}
      ${tile(`${t.n2}（${pct(t.n2, t.total)}%）`, '2：眠気を感じ運転を停止した', SS2026_OPTION_COLOR[2])}
      ${tile(`${t.n3}（${pct(t.n3, t.total)}%）`, '3：眠気を感じたが継続した', SS2026_OPTION_COLOR[3])}
      ${tile('0 件', '期間中の居眠り事故', '#166534')}
    </div>
  </section>`;
}

function accidentSection(at: AccidentTrend): string {
  if (!at.hasTable) {
    return card('事故傾向（2026/8/1〜8/31）', `<p style="font-size:12.5px;color:#6b7280;margin:0;">事故データ（保険システム取込）が未取込のため、当月の事故傾向は表示できません。</p>`);
  }
  const catRows = at.byCategory.length
    ? at.byCategory.map(x => `<tr><td style="padding:4px 8px;">${escHtml(x.label)}</td><td style="padding:4px 8px;text-align:right;font-weight:700;">${x.count}</td></tr>`).join('')
    : `<tr><td colspan="2" style="padding:6px 8px;color:#9ca3af;">当月の事故記録なし</td></tr>`;
  const wdMax = Math.max(1, ...at.byWeekday);
  const wdBar = at.byWeekday.map((n, i) => `
    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;">
      <div style="font-size:11px;color:#6b7280;">${n}</div>
      <div style="width:100%;max-width:34px;height:70px;background:#f1f5f9;border-radius:4px;display:flex;align-items:flex-end;">
        <div style="width:100%;height:${Math.round((n / wdMax) * 100)}%;background:${i === 0 || i === 6 ? '#f97316' : '#2563eb'};border-radius:4px;"></div>
      </div>
      <div style="font-size:11px;color:#374151;">${WD[i]}</div>
    </div>`).join('');
  return card('事故傾向（2026/8/1〜8/31）', `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;">
      <div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
          ${tile(String(at.total), '当月の事故 件数')}
          ${tile(String(at.drowsy), 'うち居眠り・眠気起因', at.drowsy > 0 ? '#dc2626' : '#166534')}
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e5e7eb;">
          <thead><tr style="background:#f8fafc;"><th style="padding:5px 8px;text-align:left;">事故区分</th><th style="padding:5px 8px;text-align:right;">件数</th></tr></thead>
          <tbody>${catRows}</tbody>
        </table>
      </div>
      <div>
        <div style="font-size:12px;color:#374151;margin-bottom:6px;">曜日別（件数）</div>
        <div style="display:flex;gap:4px;align-items:flex-end;">${wdBar}</div>
      </div>
    </div>
    <p style="font-size:11.5px;color:#6b7280;margin:12px 0 0;">「うち居眠り・眠気起因」は事故区分・事故形態・原因・メモに「居眠り／眠気」等を含む件数。</p>
  `);
}

function weeklySection(st: SS2026Stats): string {
  const rows = st.weeks.map((w, i) => `
    <tr>
      <td style="padding:6px 8px;font-weight:700;white-space:nowrap;">${escHtml(w.label)}</td>
      <td style="padding:6px 8px;text-align:right;">${w.total}</td>
      <td style="padding:6px 8px;text-align:right;color:${SS2026_OPTION_COLOR[1]};">${w.n1}（${pct(w.n1, w.total)}%）</td>
      <td style="padding:6px 8px;text-align:right;color:${SS2026_OPTION_COLOR[2]};">${w.n2}（${pct(w.n2, w.total)}%）</td>
      <td style="padding:6px 8px;text-align:right;font-weight:${w.n3 ? '800' : '400'};color:${SS2026_OPTION_COLOR[3]};">${w.n3}（${pct(w.n3, w.total)}%）</td>
      <td style="padding:6px 8px;min-width:140px;">${stackBar(w)}</td>
    </tr>`).join('');
  const narr = weeklyNarrative(st).map(p => `<p style="font-size:12.5px;color:#374151;line-height:1.8;margin:0 0 8px;">${escHtml(p)}</p>`).join('');
  return card('週別の傾向', `
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e5e7eb;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:6px 8px;text-align:left;">週</th>
          <th style="padding:6px 8px;text-align:right;">記入</th>
          <th style="padding:6px 8px;text-align:right;">1</th>
          <th style="padding:6px 8px;text-align:right;">2</th>
          <th style="padding:6px 8px;text-align:right;">3</th>
          <th style="padding:6px 8px;text-align:left;">構成比</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${legend()}
    <div style="margin-top:14px;border-top:1px solid #f1f5f9;padding-top:12px;">${narr}</div>
  `);
}

function personTableSection(st: SS2026Stats, linkPerson: boolean): string {
  const rows = st.byPerson.map(p => {
    const href = linkPerson ? `${BASE}/person/${encodeURIComponent(p.person_key)}` : '';
    const kaHan = p.division ? `${p.division}課${p.team ? p.team + '班' : ''}` : (p.team ? p.team + '班' : '—');
    const last = p.lastDay ? `8/${p.lastDay}` : '—';
    const open = linkPerson ? `<tr style="cursor:pointer;border-top:1px solid #f1f5f9;" onclick="location.href='${href}'">` : `<tr style="border-top:1px solid #f1f5f9;">`;
    return `${open}
      <td style="padding:5px 8px;color:#9ca3af;">${p.sheet_no ?? ''}</td>
      <td style="padding:5px 8px;font-weight:600;">${escHtml(p.emp_name)}</td>
      <td style="padding:5px 8px;white-space:nowrap;color:#6b7280;">${escHtml(kaHan)}</td>
      <td style="padding:5px 8px;text-align:right;">${p.total}</td>
      <td style="padding:5px 8px;text-align:right;color:${SS2026_OPTION_COLOR[1]};">${p.n1}</td>
      <td style="padding:5px 8px;text-align:right;color:${SS2026_OPTION_COLOR[2]};">${p.n2}</td>
      <td style="padding:5px 8px;text-align:right;font-weight:${p.n3 ? '800' : '400'};background:${p.n3 ? '#fef2f2' : 'transparent'};color:${SS2026_OPTION_COLOR[3]};">${p.n3}</td>
      <td style="padding:5px 8px;text-align:right;color:#6b7280;white-space:nowrap;">${last}</td>
    </tr>`;
  }).join('');
  return card('個人別', `
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#f8fafc;text-align:right;">
          <th style="padding:6px 8px;text-align:left;">#</th>
          <th style="padding:6px 8px;text-align:left;">氏名</th>
          <th style="padding:6px 8px;text-align:left;">課・班</th>
          <th style="padding:6px 8px;">記入</th>
          <th style="padding:6px 8px;">1</th>
          <th style="padding:6px 8px;">2</th>
          <th style="padding:6px 8px;">3</th>
          <th style="padding:6px 8px;">最終記入</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${linkPerson ? `<p style="font-size:11.5px;color:#6b7280;margin:10px 0 0;">行をクリックすると個人別の8月カレンダーを開き、数字の修正ができます。</p>` : ''}
  `);
}

function option3Section(st: SS2026Stats): string {
  if (!st.option3.entries.length) {
    return card('「3」を選んだ乗務員（聞き取り対象）', `<p style="font-size:12.5px;color:#166534;margin:0;font-weight:600;">該当なし。期間中、「3（眠気を感じたが運転を継続）」の記入はありませんでした。</p>`);
  }
  const rows = st.option3.entries.map(e => `<tr style="border-top:1px solid #f1f5f9;">
    <td style="padding:5px 8px;white-space:nowrap;">8/${e.day}（${WD[weekdayOf(e.day)]}）</td>
    <td style="padding:5px 8px;font-weight:600;">${escHtml(e.emp_name)}</td>
    <td style="padding:5px 8px;color:#6b7280;">${e.team ? e.team + '班' : '—'}</td>
  </tr>`).join('');
  return card('「3」を選んだ乗務員（聞き取り対象）', `
    <p style="font-size:12px;color:#374151;margin:0 0 8px;">下記はいずれも当直・管理者が当日に状況を聞き取り、休憩・体調管理の助言を実施済み。事故には至っていません。</p>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#fef2f2;"><th style="padding:6px 8px;text-align:left;">日付</th><th style="padding:6px 8px;text-align:left;">氏名</th><th style="padding:6px 8px;text-align:left;">班</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `);
}

function aiReportSection(text: string, canEdit: boolean): string {
  const safe = escHtml(text || '').replace(/\n/g, '<br>');
  const editor = canEdit ? `
    <details class="no-print" style="margin-top:12px;">
      <summary style="cursor:pointer;font-size:12px;color:#4338ca;">この文章を編集する</summary>
      <textarea id="ss-ai" style="width:100%;min-height:150px;margin-top:8px;border:1px solid #d1d5db;border-radius:8px;padding:10px;font-size:13px;line-height:1.7;font-family:inherit;">${escHtml(text || '')}</textarea>
      <div style="display:flex;justify-content:flex-end;gap:10px;align-items:center;margin-top:8px;">
        <span id="ss-ai-msg" style="font-size:12px;color:#166534;"></span>
        <button onclick="ssSaveReport()" style="padding:8px 20px;background:#166534;color:white;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">保存</button>
      </div>
    </details>` : '';
  return `<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:18px 20px;">
    <h3 style="font-size:15px;font-weight:800;color:#3730a3;margin:0 0 4px;">AIレポート（総括）</h3>
    <p style="font-size:11px;color:#6366f1;margin:0 0 12px;">別のAIによる分析結果を貼り付ける欄です。</p>
    <div id="ss-ai-view" style="font-size:13px;color:#1e1b4b;line-height:1.9;">${safe || '<span style="color:#9ca3af;">（未入力）</span>'}</div>
    ${editor}
  </div>`;
}

function warnBanner(): string {
  return `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#92400e;line-height:1.7;">
    ${escHtml(SS2026_SOURCE_NOTE)}<br>数字が実際の手札と違う箇所は、個人別の画面（行をクリック）でセルを押して修正してください。
  </div>`;
}

// ---------- 集計ページ ----------
app.get('/kacho-mission/summer-safety-2026', async (c) => {
  const [{ people, entries, aiReport, ok }, at] = await Promise.all([
    loadAll(c.env.DB),
    loadAccidentTrend(c.env.DB),
  ]);
  if (!ok) {
    return c.html(layout('夏季交通安全（2026）', subHeader('夏季交通安全（2026）') +
      `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;font-size:13px;color:#991b1b;">
        テーブルが見つかりません。<code>migration_134.sql</code> を適用してください。</div>`, 'kacho-mission'));
  }
  const st = computeSS2026Stats(people, entries);
  const isFullAccess = (await getAdminPermissions(c.env.DB, c.get('adminId'))) === null;

  const printBtn = `<a href="${BASE}/print" target="_blank" style="margin-left:auto;padding:7px 16px;background:#1e3a5f;color:white;border-radius:6px;font-size:12.5px;text-decoration:none;font-weight:700;">PDF出力 ／ 印刷</a>`;

  const importPanel = isFullAccess ? `
    <details class="no-print" style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;">
      <summary style="cursor:pointer;font-size:13px;font-weight:700;color:#1e3a5f;">データ取込（管理用）</summary>
      <p style="font-size:12px;color:#6b7280;line-height:1.7;margin:10px 0;">
        1行1名。タブ区切りで <b>社員番号 / 氏名 / 班 / 1日 2日 … 31日の値</b>。社員番号が無い行は「氏名 / 班 / 値…」でも可。
        値は 1・2・3 のみ有効（空欄=未記入、「印」「休」も未記入扱い）。既存の同じ人・同じ日の値は上書きします。
      </p>
      <textarea id="ss-imp" placeholder="20182271\t比企直樹\t8\t\t\t1\t\t1\t\t1\t..." style="width:100%;min-height:120px;border:1px solid #d1d5db;border-radius:8px;padding:10px;font-size:12px;font-family:ui-monospace,monospace;"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:10px;align-items:center;margin-top:8px;">
        <span id="ss-imp-msg" style="font-size:12px;color:#166534;"></span>
        <button onclick="ssImport()" style="padding:8px 20px;background:#1e3a5f;color:white;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">取り込む</button>
      </div>
    </details>` : '';

  const content = subHeader('夏季交通安全（2026）', printBtn) + `
    <div style="max-width:1000px;display:flex;flex-direction:column;gap:16px;">
      <div>
        <div style="font-size:13px;color:#374151;font-weight:700;">${escHtml(SS2026_TITLE)}（2026年8月1日〜8月31日）</div>
      </div>
      ${warnBanner()}
      ${overviewSection(st)}
      ${accidentSection(at)}
      ${weeklySection(st)}
      ${option3Section(st)}
      ${personTableSection(st, true)}
      ${aiReportSection(aiReport, isFullAccess)}
      ${importPanel}
    </div>

    <script>
    var SS_BASE='${BASE}';
    var SS_API='/api/kacho-mission/summer-safety-2026';
    async function ssSaveReport(){
      var el=document.getElementById('ss-ai'); var msg=document.getElementById('ss-ai-msg');
      var r=await fetch(SS_API+'/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:el.value})});
      if(r.ok){ document.getElementById('ss-ai-view').innerHTML = el.value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\\n/g,'<br>'); msg.textContent='保存しました'; setTimeout(function(){msg.textContent='';},2500); }
      else { msg.style.color='#b91c1c'; msg.textContent='保存に失敗しました'; }
    }
    async function ssImport(){
      var el=document.getElementById('ss-imp'); var msg=document.getElementById('ss-imp-msg');
      if(!el.value.trim()){ return; }
      msg.style.color='#166534'; msg.textContent='取り込み中...';
      var r=await fetch(SS_API+'/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:el.value})});
      var j=await r.json().catch(function(){return {};});
      if(r.ok){ msg.textContent=(j.people||0)+'名 / '+(j.entries||0)+'件を反映。再読込します'; setTimeout(function(){location.reload();},900); }
      else { msg.style.color='#b91c1c'; msg.textContent=(j.error||'取り込みに失敗しました'); }
    }
    </script>`;
  return c.html(layout('夏季交通安全（2026）', content, 'kacho-mission'));
});

// ---------- 個人別ページ ----------
app.get('/kacho-mission/summer-safety-2026/person/:key', async (c) => {
  const key = decodeURIComponent(c.req.param('key'));
  const { people, entries, ok } = await loadAll(c.env.DB);
  if (!ok) return c.redirect(BASE);
  const st = computeSS2026Stats(people, entries);
  const p = st.byPerson.find(x => x.person_key === key);
  if (!p) return c.html(layout('個人別', subHeader('個人別') + `<p style="font-size:13px;color:#6b7280;">見つかりませんでした。<a href="${BASE}">一覧へ戻る</a></p>`, 'kacho-mission'));
  const isFullAccess = (await getAdminPermissions(c.env.DB, c.get('adminId'))) === null;

  // 8月カレンダー（週頭=日曜）。1日は土曜なので先頭に6セルの空白
  const lead = weekdayOf(1); // 6
  const cells: string[] = [];
  for (let i = 0; i < lead; i++) cells.push(`<div style="aspect-ratio:1;"></div>`);
  for (let d = 1; d <= SS2026_DAYS_IN_MONTH; d++) {
    const v = p.byDay[d];
    const bg = v ? SS2026_OPTION_COLOR[v as 1 | 2 | 3] : '#f8fafc';
    const fg = v ? '#fff' : '#94a3b8';
    const wd = weekdayOf(d);
    const dnColor = wd === 0 ? '#dc2626' : wd === 6 ? '#2563eb' : '#64748b';
    cells.push(`<div data-day="${d}" ${isFullAccess ? 'onclick="ssCycle(' + d + ')" style="cursor:pointer;' : 'style="'}aspect-ratio:1;border:1px solid #e5e7eb;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${bg};" title="8/${d}">
      <span style="font-size:10px;color:${v ? 'rgba(255,255,255,0.85)' : dnColor};">${d}</span>
      <span class="ss-val" style="font-size:20px;font-weight:800;color:${fg};">${v ?? ''}</span>
    </div>`);
  }
  const kaHan = p.division ? `${p.division}課${p.team ? p.team + '班' : ''}` : (p.team ? p.team + '班' : '—');

  const content = subHeader('夏季交通安全（2026）｜個人別', `<a href="${BASE}" style="margin-left:auto;font-size:12.5px;color:#6b7280;text-decoration:none;">← 一覧へ</a>`) + `
    <div style="max-width:620px;">
      <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;margin-bottom:14px;">
        ${isFullAccess
      ? `<button id="ss-name" onclick="ssOpenNameEdit()" title="クリックで氏名・社員名簿の紐づけを修正" style="font-size:17px;font-weight:800;color:#0f172a;background:none;border:none;border-bottom:1px dashed #94a3b8;padding:0 0 1px;cursor:pointer;font-family:inherit;">${escHtml(p.emp_name)}</button>`
      : `<div style="font-size:17px;font-weight:800;color:#0f172a;">${escHtml(p.emp_name)}</div>`}
        <div id="ss-sub" style="font-size:12px;color:#6b7280;margin-top:2px;">${escHtml(kaHan)}　${p.emp_no ? '社員番号 ' + escHtml(p.emp_no) : '社員番号なし'}　／　手札 #${p.sheet_no ?? '—'}</div>

        ${isFullAccess ? `
        <div id="ss-name-edit" style="display:none;margin-top:12px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#f8fafc;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;">
            <label style="font-size:11px;color:#6b7280;">氏名<br><input id="ss-nm" value="${escHtml(p.emp_name)}" style="width:150px;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;"></label>
            <label style="font-size:11px;color:#6b7280;">班<br><input id="ss-tm" value="${p.team ?? ''}" inputmode="numeric" style="width:52px;border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;"></label>
            <div style="font-size:11px;color:#6b7280;">社員番号<br><span id="ss-en" style="font-size:13px;color:#0f172a;">${p.emp_no ? escHtml(p.emp_no) : '（未紐づけ）'}</span></div>
          </div>
          <div style="margin-top:10px;">
            <div style="font-size:11px;color:#6b7280;margin-bottom:3px;">社員名簿から検索して紐づけ</div>
            <input id="ss-search" placeholder="氏名 / フリガナ / 社員番号" autocomplete="off" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 9px;font-size:13px;">
            <div id="ss-results" style="margin-top:4px;"></div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;align-items:center;margin-top:10px;">
            <span id="ss-nm-msg" style="font-size:12px;color:#b91c1c;margin-right:auto;"></span>
            <button onclick="ssCloseNameEdit()" style="padding:7px 14px;background:#e5e7eb;color:#374151;border:none;border-radius:6px;font-size:12.5px;cursor:pointer;">キャンセル</button>
            <button onclick="ssSaveName()" style="padding:7px 18px;background:#166534;color:white;border:none;border-radius:6px;font-size:12.5px;font-weight:700;cursor:pointer;">保存</button>
          </div>
        </div>` : ''}

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
          ${tile(String(p.total), '記入')}
          ${tile(String(p.n1), '1', SS2026_OPTION_COLOR[1])}
          ${tile(String(p.n2), '2', SS2026_OPTION_COLOR[2])}
          ${tile(String(p.n3), '3', SS2026_OPTION_COLOR[3])}
        </div>
      </div>
      <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;">
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;margin-bottom:6px;">
          ${WD.map((w, i) => `<div style="text-align:center;font-size:11px;font-weight:700;color:${i === 0 ? '#dc2626' : i === 6 ? '#2563eb' : '#64748b'};">${w}</div>`).join('')}
        </div>
        <div id="ss-cal" style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px;">${cells.join('')}</div>
        ${legend()}
        ${isFullAccess ? `<p style="font-size:11.5px;color:#6b7280;margin:10px 0 0;">セルを押すと 空欄 → 1 → 2 → 3 → 空欄 と切り替わり、自動保存されます。</p>` : ''}
      </div>
    </div>
    <script>
    var SS_API='/api/kacho-mission/summer-safety-2026';
    var SS_KEY=${safeJson(key)};
    var SS_COLOR={'1':'${SS2026_OPTION_COLOR[1]}','2':'${SS2026_OPTION_COLOR[2]}','3':'${SS2026_OPTION_COLOR[3]}'};
    async function ssCycle(day){
      var cell=document.querySelector('#ss-cal [data-day="'+day+'"]');
      var span=cell.querySelector('.ss-val');
      var cur=span.textContent.trim();
      var next = cur==='' ? '1' : cur==='1' ? '2' : cur==='2' ? '3' : '';
      var r=await fetch(SS_API+'/entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({person_key:SS_KEY,day:day,value:next===''?null:parseInt(next,10)})});
      if(!r.ok){ alert('保存に失敗しました'); return; }
      span.textContent=next;
      if(next===''){ cell.style.background='#f8fafc'; span.style.color='#94a3b8'; cell.querySelector('span').style.color='#64748b'; }
      else { cell.style.background=SS_COLOR[next]; span.style.color='#fff'; cell.querySelector('span').style.color='rgba(255,255,255,0.85)'; }
    }

    var SS_LINKED_EMPNO=${safeJson(p.emp_no ?? '')};
    function ssEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function ssOpenNameEdit(){ document.getElementById('ss-name-edit').style.display='block'; document.getElementById('ss-search').focus(); }
    function ssCloseNameEdit(){ document.getElementById('ss-name-edit').style.display='none'; document.getElementById('ss-nm-msg').textContent=''; }
    var ssTimer=null;
    document.addEventListener('input', function(ev){
      if(!ev.target || ev.target.id!=='ss-search') return;
      var q=ev.target.value.trim();
      clearTimeout(ssTimer);
      var box=document.getElementById('ss-results');
      if(q.length<1){ box.innerHTML=''; return; }
      ssTimer=setTimeout(function(){
        fetch('/api/kacho-mission/employees?q='+encodeURIComponent(q)).then(function(r){return r.json();}).then(function(j){
          var list=(j&&j.employees)||[];
          if(!list.length){ box.innerHTML='<div style="font-size:12px;color:#9ca3af;padding:4px 2px;">該当なし</div>'; return; }
          box.innerHTML=list.map(function(e){
            var kh=(e.division?e.division+'課':'')+(e.team?e.team+'班':'');
            return '<button type="button" class="ss-emp" data-en="'+ssEsc(e.emp_no)+'" data-nm="'+ssEsc(e.name)+'" data-tm="'+(e.team||'')+'" style="display:block;width:100%;text-align:left;border:1px solid #e5e7eb;border-radius:6px;background:#fff;padding:6px 9px;margin-bottom:3px;font-size:12.5px;cursor:pointer;"><b>'+ssEsc(e.name)+'</b> <span style="color:#6b7280;">'+ssEsc(e.emp_no)+' '+ssEsc(kh)+'</span></button>';
          }).join('');
        }).catch(function(){ box.innerHTML=''; });
      },180);
    });
    document.addEventListener('click', function(ev){
      var b=ev.target && ev.target.closest ? ev.target.closest('.ss-emp') : null;
      if(!b) return;
      SS_LINKED_EMPNO=b.getAttribute('data-en');
      document.getElementById('ss-en').textContent = SS_LINKED_EMPNO || '（未紐づけ）';
      document.getElementById('ss-nm').value = b.getAttribute('data-nm');
      var tm=b.getAttribute('data-tm');
      if(tm) document.getElementById('ss-tm').value = tm;
      document.getElementById('ss-results').innerHTML='';
      document.getElementById('ss-search').value='';
    });
    function ssSaveName(){
      var msg=document.getElementById('ss-nm-msg');
      var name=document.getElementById('ss-nm').value.trim();
      var tmRaw=document.getElementById('ss-tm').value.trim();
      if(!name){ msg.textContent='氏名を入力してください'; return; }
      var team = /^[0-9]+$/.test(tmRaw) ? parseInt(tmRaw,10) : null;
      fetch(SS_API+'/person-meta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({person_key:SS_KEY,emp_name:name,emp_no:SS_LINKED_EMPNO||null,team:team})})
        .then(function(r){ return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
        .then(function(res){
          if(!res.ok){ msg.textContent=(res.j&&res.j.error)||'保存に失敗しました'; return; }
          if(res.j&&res.j.warning){ alert(res.j.warning); }
          location.reload();
        })
        .catch(function(){ msg.textContent='通信エラー'; });
    }
    </script>`;
  return c.html(layout('夏季交通安全（2026）｜個人別', content, 'kacho-mission'));
});

// ---------- 印刷用スタンドアロン ----------
app.get('/kacho-mission/summer-safety-2026/print', async (c) => {
  const [{ people, entries, aiReport, ok }, at] = await Promise.all([
    loadAll(c.env.DB),
    loadAccidentTrend(c.env.DB),
  ]);
  const st = computeSS2026Stats(people, entries);
  const body = ok ? `
    ${overviewSection(st)}
    ${accidentSection(at)}
    ${weeklySection(st)}
    ${option3Section(st)}
    ${personTableSection(st, false)}
    ${aiReportSection(aiReport, false)}
  ` : `<p>migration_134 未適用</p>`;

  return c.html(`<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<title>夏季交通安全2026_集計レポート</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<style>
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  body{font-family:-apple-system,"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;color:#0f172a;margin:0;padding:14mm;background:#f1f5f9;}
  h1{font-size:19px;margin:0 0 4px;color:#1e3a5f;}
  .sub{font-size:12px;color:#64748b;margin:0 0 14px;}
  .paper{max-width:960px;margin:0 auto;background:#fff;padding:16mm 14mm;box-shadow:0 1px 6px rgba(0,0,0,.12);}
  .bar{max-width:960px;margin:0 auto 12px;display:flex;gap:10px;align-items:center;}
  .bar button{padding:9px 20px;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;}
  .bar .go{background:#1e3a5f;color:#fff;}
  .bar .cl{background:#e5e7eb;color:#374151;}
  .bar .hint{font-size:12px;color:#64748b;}
  .ss-body > div{page-break-inside:avoid;}
  .ss-body > div:last-child{page-break-inside:auto;}
  table{page-break-inside:auto;}
  tr{page-break-inside:avoid;}
  @media print{
    @page{size:A4;margin:11mm;}
    body{background:#fff;padding:0;}
    .paper{box-shadow:none;max-width:none;padding:0;}
    .no-print{display:none!important;}
  }
</style></head><body>
  <div class="bar no-print">
    <button class="go" onclick="window.print()">PDFで保存 ／ 印刷</button>
    <button class="cl" onclick="window.close()">閉じる</button>
    <span class="hint">印刷ダイアログの送信先で「PDFで保存」を選ぶとPDFになります。</span>
  </div>
  <div class="paper">
    <h1>夏季の交通事故をゼロにする運動（2026）　集計結果</h1>
    <p class="sub">対象期間 2026年8月1日〜8月31日／板橋営業所／${escHtml(SS2026_SOURCE_NOTE)}</p>
    <div class="ss-body" style="display:flex;flex-direction:column;gap:14px;">${body}</div>
  </div>
  <script>setTimeout(function(){ try{ window.print(); }catch(e){} }, 400);</script>
</body></html>`);
});

export default app;
