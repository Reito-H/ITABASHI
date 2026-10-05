// 課長ミッション: 秋の全国交通安全運動（2026/9/21〜9/30）手札の集計
//  /kacho-mission/autumn-safety-2026            … 集計・項目別・日別・課別・個人別一覧・AIレポート
//  /kacho-mission/autumn-safety-2026/person/:key … 個人別（3項目×10日の表・セル編集・名簿紐づけ）
//  /kacho-mission/autumn-safety-2026/print       … 印刷用スタンドアロン
// API（値の編集・名簿紐づけ・AIレポート保存）は routes/api/kacho_mission.ts 側。
// 実データは D1 autumn_safety_2026_people / _entries / _meta（migration_175）。
// 夏季（admin_summer_safety_2026.ts）と同じ構成。配る手札そのものの版下は autumn-safety-tefuda（別物）。
import { Hono } from 'hono';
import { layout, escHtml, safeJson, FAVICON_DATA_URI } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';
import { getAdminPermissions } from '../permissions';
import {
  computeAS2026Stats, pct,
  AS2026_TITLE, AS2026_PERIOD_START, AS2026_PERIOD_END, AS2026_SOURCE_NOTE, AS2026_DAYS, AS2026_ZERO_DAY,
  AS2026_ITEMS, AS2026_ITEM_LABEL, AS2026_ITEM_SHORT, AS2026_OPTION_LABEL, AS2026_OPTION_COLOR,
  type AS2026PersonRow, type AS2026EntryRow, type AS2026Stats, type AS2026Tally, type AS2026PersonStat,
} from '../data/autumn_safety_2026';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const BASE = `${ADMIN_PATH}/kacho-mission/autumn-safety-2026`;
const PAGE_TITLE = '秋の全国交通安全運動（2026）集計';
const WD = ['日', '月', '火', '水', '木', '金', '土'];
// 2026-09-21 は月曜。day(21..30) の曜日 index（0=日）
const weekdayOf = (day: number) => (day - 20) % 7;

interface LoadResult {
  people: AS2026PersonRow[];
  entries: AS2026EntryRow[];
  aiReport: string;
  ok: boolean;
}

async function loadAll(db: D1Database): Promise<LoadResult> {
  try {
    const [pp, ee, mm] = await Promise.all([
      db.prepare('SELECT person_key, emp_no, emp_name, written_name, written_no, team, division, sheet_no, note FROM autumn_safety_2026_people').all<AS2026PersonRow>(),
      db.prepare('SELECT person_key, day, item, value FROM autumn_safety_2026_entries').all<AS2026EntryRow>(),
      db.prepare("SELECT value FROM autumn_safety_2026_meta WHERE key = 'ai_report'").first<{ value: string }>(),
    ]);
    return { people: pp.results ?? [], entries: ee.results ?? [], aiReport: mm?.value ?? '', ok: true };
  } catch {
    return { people: [], entries: [], aiReport: '', ok: false };
  }
}

interface AccidentTrend {
  total: number;
  related: Record<1 | 2 | 3, number>; // 項目に関係しそうな事故（速度／スマホ・脇見／居眠り）
  byCategory: { label: string; count: number }[];
  byWeekday: number[]; // 0=日..6=土
  hasTable: boolean;
}

async function loadAccidentTrend(db: D1Database): Promise<AccidentTrend> {
  const empty: AccidentTrend = { total: 0, related: { 1: 0, 2: 0, 3: 0 }, byCategory: [], byWeekday: [0, 0, 0, 0, 0, 0, 0], hasTable: false };
  try {
    const rs = await db.prepare(
      `SELECT occurred_date, accident_category, accident_form, cause_reason, cause_direct, memo
         FROM accident_records
        WHERE occurred_date >= ? AND occurred_date <= ?`
    ).bind(AS2026_PERIOD_START, AS2026_PERIOD_END).all<{
      occurred_date: string; accident_category: string | null; accident_form: string | null;
      cause_reason: string | null; cause_direct: string | null; memo: string | null;
    }>();
    const rows = rs.results ?? [];
    const catMap = new Map<string, number>();
    const wd = [0, 0, 0, 0, 0, 0, 0];
    const related: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
    for (const r of rows) {
      const cat = (r.accident_category ?? '未分類').replace(/\s+/g, '') || '未分類';
      catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(r.occurred_date || '');
      if (m) wd[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]++;
      const blob = [r.accident_category, r.accident_form, r.cause_reason, r.cause_direct, r.memo].join(' ');
      if (/(速度|スピード|速度超過)/.test(blob)) related[1]++;
      if (/(スマホ|携帯|ナビ|脇見|わき見)/.test(blob)) related[2]++;
      if (/(居眠|いねむり|眠気|仮睡|睡魔)/.test(blob)) related[3]++;
    }
    const byCategory = [...catMap.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    return { total: rows.length, related, byCategory, byWeekday: wd, hasTable: true };
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
function stackBar(t: AS2026Tally, h = 18): string {
  if (!t.total) return `<div style="height:${h}px;background:#f1f5f9;border-radius:4px;"></div>`;
  const seg = (n: number, c: 1 | 2 | 3) => {
    const p = (n / t.total) * 100;
    if (p <= 0) return '';
    return `<span title="${c}: ${n}件" style="display:block;height:100%;width:${p}%;background:${AS2026_OPTION_COLOR[c]};"></span>`;
  };
  return `<div style="display:flex;height:${h}px;border-radius:4px;overflow:hidden;background:#f1f5f9;">
    ${seg(t.n1, 1)}${seg(t.n2, 2)}${seg(t.n3, 3)}
  </div>`;
}

function legend(): string {
  return `<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:#374151;margin-top:8px;">
    ${([1, 2, 3] as const).map(n => `<span style="display:inline-flex;align-items:center;gap:5px;">
      <span style="width:11px;height:11px;border-radius:2px;background:${AS2026_OPTION_COLOR[n]};display:inline-block;"></span>
      ${n}：${escHtml(AS2026_OPTION_LABEL[n])}</span>`).join('')}
  </div>`;
}

const kaHanOf = (p: { division: number | null; team: number | null }) =>
  p.division ? `${p.division}課${p.team ? p.team + '班' : ''}` : (p.team ? p.team + '班' : '—');

// ルールベースの傾向コメント（外部AIは使わない）
function itemNarrative(st: AS2026Stats): string[] {
  const out: string[] = [];
  const it = st.items;
  out.push(
    `回収した手札 ${st.peopleCount} 枚、乗務 延べ ${st.shifts} 日・記入 ${st.marks} 件。` +
    `3項目すべてを「1（100%遵守）」とした乗務日は ${st.perfectShifts} 日（${pct(st.perfectShifts, st.shifts)}%）、` +
    `期間中の全乗務で全項目「1」だった乗務員は ${st.perfectPeople} 名。`
  );
  const ranked = [...AS2026_ITEMS].sort((a, b) => pct(it[b].n1, it[b].total) - pct(it[a].n1, it[a].total));
  const best = ranked[0], worst = ranked[ranked.length - 1];
  out.push(
    `「1」の割合が最も高いのは「${AS2026_ITEM_LABEL[best]}」（${pct(it[best].n1, it[best].total)}%）、` +
    `最も低いのは「${AS2026_ITEM_LABEL[worst]}」（${pct(it[worst].n1, it[worst].total)}%、「2」が ${pct(it[worst].n2, it[worst].total)}%）。`
  );
  if (st.chronicItem1Two > 0) {
    out.push(`全乗務日で「${AS2026_ITEM_LABEL[1]}」を「2」とした乗務員が ${st.chronicItem1Two} 名おり、速度の自己評価が「80%以上」で常態化している層がある。`);
  }
  const n3 = it[1].n3 + it[2].n3 + it[3].n3;
  out.push(n3 === 0
    ? '「3（出来なかった）」の記入は期間を通じて1件もなかった。'
    : `「3（出来なかった）」は ${st.option3.people.length} 名・${st.option3.entries.length} 乗務日・計 ${n3} 件` +
      `（${AS2026_ITEMS.map(i => `${AS2026_ITEM_SHORT[i]} ${it[i].n3}件`).join('、')}）。`);
  return out;
}

// ---------- セクション（画面・印刷で共用） ----------
function overviewSection(st: AS2026Stats, at: AccidentTrend): string {
  return `<section>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      ${tile(String(st.peopleCount), `手札の枚数（名簿紐づけ ${st.linkedCount}・不明 ${st.peopleCount - st.linkedCount}）`)}
      ${tile(String(st.shifts), '乗務 延べ日数')}
      ${tile(`${st.perfectShifts}（${pct(st.perfectShifts, st.shifts)}%）`, '3項目すべて「1」の乗務日', AS2026_OPTION_COLOR[1])}
      ${tile(String(st.perfectPeople), '全乗務で全項目「1」の乗務員', AS2026_OPTION_COLOR[1])}
      ${tile(String(st.option3.people.length), '「3」をつけた乗務員', st.option3.people.length ? AS2026_OPTION_COLOR[3] : '#166534')}
      ${at.hasTable ? tile(`${at.total} 件`, '期間中の事故（取込済み分）', at.total ? '#b45309' : '#166534') : ''}
    </div>
  </section>`;
}

function itemSection(st: AS2026Stats): string {
  const rows = AS2026_ITEMS.map(i => {
    const t = st.items[i];
    return `<tr style="border-top:1px solid #f1f5f9;">
      <td style="padding:7px 8px;font-weight:700;white-space:nowrap;">${i}．${escHtml(AS2026_ITEM_LABEL[i])}</td>
      <td style="padding:7px 8px;text-align:right;">${t.total}</td>
      <td style="padding:7px 8px;text-align:right;color:${AS2026_OPTION_COLOR[1]};">${t.n1}（${pct(t.n1, t.total)}%）</td>
      <td style="padding:7px 8px;text-align:right;color:${AS2026_OPTION_COLOR[2]};">${t.n2}（${pct(t.n2, t.total)}%）</td>
      <td style="padding:7px 8px;text-align:right;font-weight:${t.n3 ? '800' : '400'};color:${AS2026_OPTION_COLOR[3]};">${t.n3}（${pct(t.n3, t.total)}%）</td>
      <td style="padding:7px 8px;min-width:150px;">${stackBar(t)}</td>
    </tr>`;
  }).join('');
  const narr = itemNarrative(st).map(p => `<p style="font-size:12.5px;color:#374151;line-height:1.8;margin:0 0 8px;">${escHtml(p)}</p>`).join('');
  return card('項目別の結果', `
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e5e7eb;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:6px 8px;text-align:left;">最重要取組み項目</th>
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

function dailySection(st: AS2026Stats): string {
  const rows = st.daily.map(d => {
    const wd = weekdayOf(d.day);
    const isZero = d.day === AS2026_ZERO_DAY;
    return `<tr style="border-top:1px solid #f1f5f9;${isZero ? 'background:#fefce8;' : ''}">
      <td style="padding:5px 8px;white-space:nowrap;font-weight:700;color:${wd === 0 ? '#dc2626' : wd === 6 ? '#2563eb' : '#0f172a'};">9/${d.day}（${WD[wd]}）${isZero ? '<span style="font-size:10.5px;color:#a16207;font-weight:700;margin-left:4px;">事故ゼロの日</span>' : ''}</td>
      <td style="padding:5px 8px;text-align:right;">${d.shifts}</td>
      <td style="padding:5px 8px;text-align:right;">${pct(d.perfect, d.shifts)}%</td>
      ${AS2026_ITEMS.map(i => `<td style="padding:5px 8px;min-width:110px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="flex:1;">${stackBar(d.items[i], 12)}</div>
          <span style="font-size:11px;color:#374151;width:40px;text-align:right;">${pct(d.items[i].n1, d.items[i].total)}%</span>
          ${d.items[i].n3 ? `<span style="font-size:11px;color:${AS2026_OPTION_COLOR[3]};font-weight:800;">3×${d.items[i].n3}</span>` : ''}
        </div></td>`).join('')}
    </tr>`;
  }).join('');
  return card('日別の傾向', `
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e5e7eb;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:6px 8px;text-align:left;">日付</th>
          <th style="padding:6px 8px;text-align:right;">乗務</th>
          <th style="padding:6px 8px;text-align:right;">全項目1</th>
          ${AS2026_ITEMS.map(i => `<th style="padding:6px 8px;text-align:left;">${escHtml(AS2026_ITEM_SHORT[i])}（1の割合）</th>`).join('')}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${legend()}
  `, '乗務＝その日に記入のある乗務員数。「全項目1」＝3項目すべてを「1」とした乗務の割合。');
}

function divisionSection(st: AS2026Stats): string {
  const rows = st.byDivision.map(d => `<tr style="border-top:1px solid #f1f5f9;">
    <td style="padding:6px 8px;font-weight:700;">${escHtml(d.label)}</td>
    <td style="padding:6px 8px;text-align:right;">${d.people}</td>
    <td style="padding:6px 8px;text-align:right;">${d.shifts}</td>
    ${AS2026_ITEMS.map(i => `<td style="padding:6px 8px;min-width:110px;">
      <div style="display:flex;align-items:center;gap:6px;">
        <div style="flex:1;">${stackBar(d.items[i], 12)}</div>
        <span style="font-size:11px;color:#374151;width:40px;text-align:right;">${pct(d.items[i].n1, d.items[i].total)}%</span>
      </div></td>`).join('')}
  </tr>`).join('');
  return card('課別', `
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e5e7eb;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:6px 8px;text-align:left;">課</th>
          <th style="padding:6px 8px;text-align:right;">人数</th>
          <th style="padding:6px 8px;text-align:right;">乗務</th>
          ${AS2026_ITEMS.map(i => `<th style="padding:6px 8px;text-align:left;">${escHtml(AS2026_ITEM_SHORT[i])}（1の割合）</th>`).join('')}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `, '課・班は社員名簿の所属で集計（手札の記入とは異なる場合があります）。「不明」は名簿に紐づけられなかった手札。');
}

function accidentSection(at: AccidentTrend): string {
  const title = '事故傾向（2026/9/21〜9/30）';
  if (!at.hasTable) {
    return card(title, `<p style="font-size:12.5px;color:#6b7280;margin:0;">事故データ（保険システム取込）が未取込のため、期間中の事故傾向は表示できません。</p>`);
  }
  const catRows = at.byCategory.length
    ? at.byCategory.map(x => `<tr><td style="padding:4px 8px;">${escHtml(x.label)}</td><td style="padding:4px 8px;text-align:right;font-weight:700;">${x.count}</td></tr>`).join('')
    : `<tr><td colspan="2" style="padding:6px 8px;color:#9ca3af;">期間中の事故記録なし</td></tr>`;
  const wdMax = Math.max(1, ...at.byWeekday);
  const wdBar = at.byWeekday.map((n, i) => `
    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;">
      <div style="font-size:11px;color:#6b7280;">${n}</div>
      <div style="width:100%;max-width:34px;height:70px;background:#f1f5f9;border-radius:4px;display:flex;align-items:flex-end;">
        <div style="width:100%;height:${Math.round((n / wdMax) * 100)}%;background:${i === 0 || i === 6 ? '#f97316' : '#2563eb'};border-radius:4px;"></div>
      </div>
      <div style="font-size:11px;color:#374151;">${WD[i]}</div>
    </div>`).join('');
  return card(title, `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;">
      <div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
          ${tile(String(at.total), '期間中の事故 件数')}
          ${AS2026_ITEMS.map(i => tile(String(at.related[i]), `うち${AS2026_ITEM_SHORT[i]}関連`, at.related[i] ? '#dc2626' : '#166534')).join('')}
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
    <p style="font-size:11.5px;color:#6b7280;margin:12px 0 0;">「関連」は事故区分・事故形態・原因・メモに、速度／スマホ・ナビ・脇見／居眠り・眠気 等の語を含む件数。事故データは保険システムからの取込済み分のみ。</p>
  `);
}

function option3Section(st: AS2026Stats): string {
  const title = '「3（出来なかった）」をつけた乗務員（聞き取り対象）';
  if (!st.option3.entries.length) {
    return card(title, `<p style="font-size:12.5px;color:#166534;margin:0;font-weight:600;">該当なし。期間中、「3」の記入はありませんでした。</p>`);
  }
  const rows = st.option3.entries.map(e => `<tr style="border-top:1px solid #f1f5f9;">
    <td style="padding:5px 8px;white-space:nowrap;">9/${e.day}（${WD[weekdayOf(e.day)]}）</td>
    <td style="padding:5px 8px;font-weight:600;">${escHtml(e.emp_no ? e.emp_name : '不明')}</td>
    <td style="padding:5px 8px;color:#6b7280;">${e.team ? e.team + '班' : '—'}</td>
    <td style="padding:5px 8px;color:${AS2026_OPTION_COLOR[3]};font-weight:700;">${e.items.map(i => escHtml(AS2026_ITEM_SHORT[i])).join('・')}</td>
  </tr>`).join('');
  return card(title, `
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead><tr style="background:#fef2f2;"><th style="padding:6px 8px;text-align:left;">日付</th><th style="padding:6px 8px;text-align:left;">氏名</th><th style="padding:6px 8px;text-align:left;">班</th><th style="padding:6px 8px;text-align:left;">「3」の項目</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `);
}

function cell3(p: AS2026PersonStat, i: 1 | 2 | 3): string {
  const t = p.items[i];
  if (!t.total) return `<td style="padding:5px 6px;text-align:center;color:#cbd5e1;">—</td>`;
  return `<td style="padding:5px 6px;text-align:center;white-space:nowrap;font-size:11.5px;">
    <span style="color:${AS2026_OPTION_COLOR[1]};">${t.n1}</span> /
    <span style="color:${AS2026_OPTION_COLOR[2]};">${t.n2}</span> /
    <span style="color:${AS2026_OPTION_COLOR[3]};font-weight:${t.n3 ? '800' : '400'};">${t.n3}</span></td>`;
}

function personTableSection(st: AS2026Stats, linkPerson: boolean): string {
  const rows = st.byPerson.map(p => {
    const href = linkPerson ? `${BASE}/person/${encodeURIComponent(p.person_key)}` : '';
    const open = linkPerson ? `<tr style="cursor:pointer;border-top:1px solid #f1f5f9;${p.n3 ? 'background:#fef2f2;' : ''}" onclick="location.href='${href}'">` : `<tr style="border-top:1px solid #f1f5f9;${p.n3 ? 'background:#fef2f2;' : ''}">`;
    const nameCell = p.emp_no
      ? `<span style="font-weight:600;">${escHtml(p.emp_name)}</span>`
      : `<span style="font-weight:700;color:#b45309;">不明</span>${p.written_name ? `<span style="font-size:11px;color:#9ca3af;margin-left:4px;">（記入: ${escHtml(p.written_name)}）</span>` : ''}`;
    return `${open}
      <td style="padding:5px 8px;color:#9ca3af;">${p.sheet_no ?? ''}</td>
      <td style="padding:5px 8px;">${nameCell}</td>
      <td style="padding:5px 8px;white-space:nowrap;color:#6b7280;">${escHtml(p.emp_no ?? '')}</td>
      <td style="padding:5px 8px;white-space:nowrap;color:#6b7280;">${escHtml(kaHanOf(p))}</td>
      <td style="padding:5px 8px;text-align:right;">${p.days}</td>
      <td style="padding:5px 8px;text-align:right;">${p.perfectDays}</td>
      ${cell3(p, 1)}${cell3(p, 2)}${cell3(p, 3)}
    </tr>`;
  }).join('');
  return card('個人別', `
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:#f8fafc;">
          <th style="padding:6px 8px;text-align:left;">#</th>
          <th style="padding:6px 8px;text-align:left;">氏名（社員名簿）</th>
          <th style="padding:6px 8px;text-align:left;">社員番号</th>
          <th style="padding:6px 8px;text-align:left;">課・班</th>
          <th style="padding:6px 8px;text-align:right;">乗務日</th>
          <th style="padding:6px 8px;text-align:right;">全項目1</th>
          ${AS2026_ITEMS.map(i => `<th style="padding:6px 6px;text-align:center;">${escHtml(AS2026_ITEM_SHORT[i])}<br><span style="font-weight:400;font-size:10.5px;color:#6b7280;">1 / 2 / 3</span></th>`).join('')}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${linkPerson ? `<p style="font-size:11.5px;color:#6b7280;margin:10px 0 0;">行をクリックすると個人別の記入表を開き、数字の修正や社員名簿への紐づけ直しができます。「3」がある行は薄赤。</p>` : ''}
  `, '# は回収した手札の並び順。「不明」は氏名・社員番号が読み取れず社員名簿に紐づけられなかった手札。');
}

function aiReportSection(text: string, canEdit: boolean): string {
  const safe = escHtml(text || '').replace(/\n/g, '<br>');
  const editor = canEdit ? `
    <details class="no-print" style="margin-top:12px;">
      <summary style="cursor:pointer;font-size:12px;color:#4338ca;">この文章を編集する</summary>
      <textarea id="as-ai" style="width:100%;min-height:200px;margin-top:8px;border:1px solid #d1d5db;border-radius:8px;padding:10px;font-size:13px;line-height:1.7;font-family:inherit;">${escHtml(text || '')}</textarea>
      <div style="display:flex;justify-content:flex-end;gap:10px;align-items:center;margin-top:8px;">
        <span id="as-ai-msg" style="font-size:12px;color:#166534;"></span>
        <button onclick="asSaveReport()" style="padding:8px 20px;background:#166534;color:white;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">保存</button>
      </div>
    </details>` : '';
  return `<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:18px 20px;">
    <h3 style="font-size:15px;font-weight:800;color:#3730a3;margin:0 0 4px;">AIレポート（総括）</h3>
    <p style="font-size:11px;color:#6366f1;margin:0 0 12px;">手札258枚の読み取り時にAIがまとめた分析です。</p>
    <div id="as-ai-view" style="font-size:13px;color:#1e1b4b;line-height:1.9;">${safe || '<span style="color:#9ca3af;">（未入力）</span>'}</div>
    ${editor}
  </div>`;
}

function warnBanner(): string {
  return `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;font-size:12px;color:#92400e;line-height:1.7;">
    ${escHtml(AS2026_SOURCE_NOTE)}<br>数字や紐づけが実際の手札と違う箇所は、個人別の画面（行をクリック）で修正してください。
  </div>`;
}

// ---------- 集計ページ ----------
app.get('/kacho-mission/autumn-safety-2026', async (c) => {
  const [{ people, entries, aiReport, ok }, at] = await Promise.all([loadAll(c.env.DB), loadAccidentTrend(c.env.DB)]);
  if (!ok) {
    return c.html(layout(PAGE_TITLE, subHeader(PAGE_TITLE) +
      `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;font-size:13px;color:#991b1b;">
        テーブルが見つかりません。<code>migration_175.sql</code> を適用してください。</div>`, 'kacho-mission'));
  }
  const st = computeAS2026Stats(people, entries);
  const isFullAccess = (await getAdminPermissions(c.env.DB, c.get('adminId'))) === null;
  const printBtn = `<a href="${BASE}/print" target="_blank" style="margin-left:auto;padding:7px 16px;background:#1e3a5f;color:white;border-radius:6px;font-size:12.5px;text-decoration:none;font-weight:700;">PDF出力 ／ 印刷</a>`;

  const content = subHeader(PAGE_TITLE, printBtn) + `
    <div style="max-width:1040px;display:flex;flex-direction:column;gap:16px;">
      <div style="font-size:13px;color:#374151;font-weight:700;">${escHtml(AS2026_TITLE)}（2026年9月21日〜9月30日）　最重要取組み項目の自己評価</div>
      ${warnBanner()}
      ${overviewSection(st, at)}
      ${itemSection(st)}
      ${accidentSection(at)}
      ${dailySection(st)}
      ${divisionSection(st)}
      ${option3Section(st)}
      ${personTableSection(st, true)}
      ${aiReportSection(aiReport, isFullAccess)}
    </div>
    <script>
    var AS_API='/api/kacho-mission/autumn-safety-2026';
    async function asSaveReport(){
      var el=document.getElementById('as-ai'); var msg=document.getElementById('as-ai-msg');
      var r=await fetch(AS_API+'/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:el.value})});
      if(r.ok){ document.getElementById('as-ai-view').innerHTML = el.value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\\n/g,'<br>'); msg.textContent='保存しました'; setTimeout(function(){msg.textContent='';},2500); }
      else { msg.style.color='#b91c1c'; msg.textContent='保存に失敗しました'; }
    }
    </script>`;
  return c.html(layout(PAGE_TITLE, content, 'kacho-mission'));
});

// ---------- 個人別ページ ----------
app.get('/kacho-mission/autumn-safety-2026/person/:key', async (c) => {
  const key = decodeURIComponent(c.req.param('key'));
  const { people, entries, ok } = await loadAll(c.env.DB);
  if (!ok) return c.redirect(BASE);
  const st = computeAS2026Stats(people, entries);
  const p = st.byPerson.find(x => x.person_key === key);
  if (!p) return c.html(layout('個人別', subHeader('個人別') + `<p style="font-size:13px;color:#6b7280;">見つかりませんでした。<a href="${BASE}">一覧へ戻る</a></p>`, 'kacho-mission'));
  const isFullAccess = (await getAdminPermissions(c.env.DB, c.get('adminId'))) === null;

  const head = AS2026_DAYS.map(d => {
    const wd = weekdayOf(d);
    return `<th style="padding:5px 2px;font-size:11px;color:${wd === 0 ? '#dc2626' : wd === 6 ? '#2563eb' : '#334155'};${d === AS2026_ZERO_DAY ? 'background:#fefce8;' : ''}">${d}<br>${WD[wd]}</th>`;
  }).join('');
  const body = AS2026_ITEMS.map(i => `<tr>
    <th style="padding:6px 8px;text-align:left;font-size:12px;white-space:nowrap;color:#1e3a5f;">${i}．${escHtml(AS2026_ITEM_LABEL[i])}</th>
    ${AS2026_DAYS.map(d => {
      const v = p.byDay[d]?.[i];
      const bg = v ? AS2026_OPTION_COLOR[v as 1 | 2 | 3] : '#f8fafc';
      return `<td data-day="${d}" data-item="${i}" ${isFullAccess ? `onclick="asCycle(${d},${i})" style="cursor:pointer;` : 'style="'}border:1px solid #e5e7eb;height:38px;text-align:center;font-size:17px;font-weight:800;color:#fff;background:${bg};">${v ?? ''}</td>`;
    }).join('')}
  </tr>`).join('');

  const nameHtml = p.emp_no ? escHtml(p.emp_name) : '不明';
  const content = subHeader(`${PAGE_TITLE}｜個人別`, `<a href="${BASE}" style="margin-left:auto;font-size:12.5px;color:#6b7280;text-decoration:none;">← 一覧へ</a>`) + `
    <div style="max-width:760px;">
      <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;margin-bottom:14px;">
        ${isFullAccess
      ? `<button onclick="asOpenNameEdit()" title="クリックで社員名簿の紐づけを修正" style="font-size:17px;font-weight:800;color:${p.emp_no ? '#0f172a' : '#b45309'};background:none;border:none;border-bottom:1px dashed #94a3b8;padding:0 0 1px;cursor:pointer;font-family:inherit;">${nameHtml}</button>`
      : `<div style="font-size:17px;font-weight:800;color:${p.emp_no ? '#0f172a' : '#b45309'};">${nameHtml}</div>`}
        <div style="font-size:12px;color:#6b7280;margin-top:2px;">${escHtml(kaHanOf(p))}　${p.emp_no ? '社員番号 ' + escHtml(p.emp_no) : '社員名簿に未紐づけ'}　／　手札 #${p.sheet_no ?? '—'}</div>
        <div style="font-size:11.5px;color:#64748b;margin-top:6px;line-height:1.7;background:#f8fafc;border-radius:6px;padding:6px 10px;">
          手札の記入（読み取り）: 社員番号 ${escHtml(p.written_no || '未記入')}　氏名 ${escHtml(p.written_name || '未記入')}
          ${p.note ? `<br>注記: ${escHtml(p.note)}` : ''}
        </div>

        ${isFullAccess ? `
        <div id="as-name-edit" style="display:none;margin-top:12px;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#f8fafc;">
          <div style="font-size:11px;color:#6b7280;margin-bottom:3px;">社員名簿から検索して紐づけ</div>
          <input id="as-search" placeholder="氏名 / フリガナ / 社員番号" autocomplete="off" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 9px;font-size:13px;">
          <div id="as-results" style="margin-top:4px;"></div>
          <div style="display:flex;justify-content:flex-end;gap:8px;align-items:center;margin-top:10px;">
            <span id="as-nm-msg" style="font-size:12px;color:#b91c1c;margin-right:auto;"></span>
            ${p.emp_no ? `<button onclick="asUnlink()" style="padding:7px 14px;background:#fff;color:#b45309;border:1px solid #fcd34d;border-radius:6px;font-size:12.5px;cursor:pointer;">「不明」に戻す</button>` : ''}
            <button onclick="asCloseNameEdit()" style="padding:7px 14px;background:#e5e7eb;color:#374151;border:none;border-radius:6px;font-size:12.5px;cursor:pointer;">閉じる</button>
          </div>
        </div>` : ''}

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
          ${tile(String(p.days), '乗務日')}
          ${tile(String(p.perfectDays), '3項目すべて「1」', AS2026_OPTION_COLOR[1])}
          ${tile(String(p.n3), '「3」の件数', p.n3 ? AS2026_OPTION_COLOR[3] : '#166534')}
        </div>
      </div>
      <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;overflow-x:auto;">
        <table id="as-grid" style="width:100%;border-collapse:collapse;table-layout:fixed;min-width:620px;">
          <colgroup><col style="width:190px;">${AS2026_DAYS.map(() => '<col>').join('')}</colgroup>
          <thead><tr><th></th>${head}</tr></thead>
          <tbody>${body}</tbody>
        </table>
        ${legend()}
        ${isFullAccess ? `<p style="font-size:11.5px;color:#6b7280;margin:10px 0 0;">マスを押すと 空欄 → 1 → 2 → 3 → 空欄 と切り替わり、自動保存されます。</p>` : ''}
      </div>
    </div>
    <script>
    var AS_API='/api/kacho-mission/autumn-safety-2026';
    var AS_KEY=${safeJson(key)};
    var AS_COLOR={'1':'${AS2026_OPTION_COLOR[1]}','2':'${AS2026_OPTION_COLOR[2]}','3':'${AS2026_OPTION_COLOR[3]}'};
    async function asCycle(day,item){
      var cell=document.querySelector('#as-grid td[data-day="'+day+'"][data-item="'+item+'"]');
      var cur=cell.textContent.trim();
      var next = cur==='' ? '1' : cur==='1' ? '2' : cur==='2' ? '3' : '';
      var r=await fetch(AS_API+'/entry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({person_key:AS_KEY,day:day,item:item,value:next===''?null:parseInt(next,10)})});
      if(!r.ok){ alert('保存に失敗しました'); return; }
      cell.textContent=next;
      cell.style.background = next==='' ? '#f8fafc' : AS_COLOR[next];
    }
    function asEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function asOpenNameEdit(){ document.getElementById('as-name-edit').style.display='block'; document.getElementById('as-search').focus(); }
    function asCloseNameEdit(){ document.getElementById('as-name-edit').style.display='none'; document.getElementById('as-nm-msg').textContent=''; }
    var asTimer=null;
    document.addEventListener('input', function(ev){
      if(!ev.target || ev.target.id!=='as-search') return;
      var q=ev.target.value.trim();
      clearTimeout(asTimer);
      var box=document.getElementById('as-results');
      if(q.length<1){ box.innerHTML=''; return; }
      asTimer=setTimeout(function(){
        fetch('/api/kacho-mission/employees?q='+encodeURIComponent(q)).then(function(r){return r.json();}).then(function(j){
          var list=(j&&j.employees)||[];
          if(!list.length){ box.innerHTML='<div style="font-size:12px;color:#9ca3af;padding:4px 2px;">該当なし</div>'; return; }
          box.innerHTML=list.map(function(e){
            var kh=(e.division?e.division+'課':'')+(e.team?e.team+'班':'');
            return '<button type="button" class="as-emp" data-en="'+asEsc(e.emp_no)+'" style="display:block;width:100%;text-align:left;border:1px solid #e5e7eb;border-radius:6px;background:#fff;padding:6px 9px;margin-bottom:3px;font-size:12.5px;cursor:pointer;"><b>'+asEsc(e.name)+'</b> <span style="color:#6b7280;">'+asEsc(e.emp_no)+' '+asEsc(kh)+'</span></button>';
          }).join('');
        }).catch(function(){ box.innerHTML=''; });
      },180);
    });
    function asLink(empNo){
      var msg=document.getElementById('as-nm-msg');
      fetch(AS_API+'/person-link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({person_key:AS_KEY,emp_no:empNo})})
        .then(function(r){ return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
        .then(function(res){
          if(!res.ok){ msg.textContent=(res.j&&res.j.error)||'保存に失敗しました'; return; }
          if(res.j&&res.j.warning){ alert(res.j.warning); }
          location.reload();
        })
        .catch(function(){ msg.textContent='通信エラー'; });
    }
    function asUnlink(){ if(confirm('社員名簿との紐づけを外して「不明」に戻しますか？')) asLink(null); }
    document.addEventListener('click', function(ev){
      var b=ev.target && ev.target.closest ? ev.target.closest('.as-emp') : null;
      if(b) asLink(b.getAttribute('data-en'));
    });
    </script>`;
  return c.html(layout(`${PAGE_TITLE}｜個人別`, content, 'kacho-mission'));
});

// ---------- 印刷用スタンドアロン ----------
app.get('/kacho-mission/autumn-safety-2026/print', async (c) => {
  const [{ people, entries, aiReport, ok }, at] = await Promise.all([loadAll(c.env.DB), loadAccidentTrend(c.env.DB)]);
  const st = computeAS2026Stats(people, entries);
  const body = ok ? `
    ${overviewSection(st, at)}
    ${itemSection(st)}
    ${accidentSection(at)}
    ${dailySection(st)}
    ${divisionSection(st)}
    ${option3Section(st)}
    ${aiReportSection(aiReport, false)}
    ${personTableSection(st, false)}
  ` : `<p>migration_175 未適用</p>`;

  return c.html(`<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">
<title>秋の全国交通安全運動2026_集計レポート</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<style>
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  body{font-family:-apple-system,"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;color:#0f172a;margin:0;padding:14mm;background:#f1f5f9;}
  h1{font-size:19px;margin:0 0 4px;color:#1e3a5f;}
  .sub{font-size:12px;color:#64748b;margin:0 0 14px;}
  .paper{max-width:980px;margin:0 auto;background:#fff;padding:16mm 14mm;box-shadow:0 1px 6px rgba(0,0,0,.12);}
  .bar{max-width:980px;margin:0 auto 12px;display:flex;gap:10px;align-items:center;}
  .bar button{padding:9px 20px;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;}
  .bar .go{background:#1e3a5f;color:#fff;}
  .bar .cl{background:#e5e7eb;color:#374151;}
  .bar .hint{font-size:12px;color:#64748b;}
  .as-body > div{page-break-inside:avoid;}
  .as-body > div:last-child{page-break-inside:auto;}
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
    <h1>秋の全国交通安全運動（2026）　手札の集計結果</h1>
    <p class="sub">対象期間 2026年9月21日〜9月30日／板橋営業所／${escHtml(AS2026_SOURCE_NOTE)}</p>
    <div class="as-body" style="display:flex;flex-direction:column;gap:14px;">${body}</div>
  </div>
  <script>setTimeout(function(){ try{ window.print(); }catch(e){} }, 400);</script>
</body></html>`);
});

export default app;
