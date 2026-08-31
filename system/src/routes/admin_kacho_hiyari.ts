// 課長ミッション: ヒヤリハット分析
// D1 の hiyari_reports（migration_128）を読み、集約分析を1ページで表示する。
// 初期31件（2026年8月20日 集約分・紙シート）は source='sheet' として投入済み。
// Web投稿分（source='web'）は設定「板橋」の専用フォームから随時追加される。
// 実行時に外部AIは使わない＝トークン消費なし。
// /kacho-mission/hiyari       … 分析ページ（印刷内容の選択パネルつき）
// /kacho-mission/hiyari/print … 選択されたセクションだけを組んだ印刷用スタンドアロンページ
import { Hono } from 'hono';
import { layout, escHtml } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';
import {
  HIYARI_SOURCE_LABEL, computeHiyariStats,
  type TallyItem, type HiyariStats, type HiyariRow,
} from '../data/hiyari_hatto';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

// 印刷で選択できるセクション（順序＝ここで固定）
const SECTION_META: { key: string; label: string }[] = [
  { key: 'overview', label: '概要（数値サマリー）' },
  { key: 'charts', label: '集計グラフ' },
  { key: 'findings', label: '詳細分析（初期集計の所見）' },
  { key: 'priorities', label: '重点対策（提言）' },
  { key: 'table', label: '全件の一覧' },
];
const SECTION_KEYS = SECTION_META.map(s => s.key);

async function loadRows(db: D1Database): Promise<HiyariRow[]> {
  const office = await db.prepare("SELECT value FROM system_settings WHERE key = 'home_office_id'")
    .first<{ value: string }>().catch(() => null);
  const officeId = parseInt(office?.value ?? '1', 10) || 1;
  const rs = await db.prepare(
    `SELECT id, source, emp_no, division, team, occurred_at, weather, place_area, place_detail,
            counterpart, situation, situation_text, cause, cause_text, measure_text, severe, status,
            admin_note, created_at, updated_at
       FROM hiyari_reports WHERE office_id = ?
      ORDER BY (source = 'sheet') DESC, id`
  ).bind(officeId).all<HiyariRow>();
  return rs.results ?? [];
}

function subHeader(title: string): string {
  return `<div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap;">
    <a href="${ADMIN_PATH}/kacho-mission" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 課長ミッション</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">${escHtml(title)}</h2>
  </div>`;
}

function statTile(value: string, label: string, accent = '#1e3a5f'): string {
  return `<div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;min-width:130px;flex:1;">
    <div style="font-size:26px;font-weight:800;color:${accent};line-height:1.1;">${escHtml(value)}</div>
    <div style="font-size:12px;color:#6b7280;margin-top:4px;">${escHtml(label)}</div>
  </div>`;
}

function barChart(items: TallyItem[], total: number, color = '#1e3a5f'): string {
  const max = Math.max(1, ...items.map(i => i.count));
  if (!total) return `<p style="font-size:12px;color:#9ca3af;margin:0;">データがありません</p>`;
  return `<div style="display:flex;flex-direction:column;gap:7px;">` + items.map(i => {
    const pct = Math.round((i.count / max) * 100);
    const share = Math.round((i.count / total) * 100);
    return `<div style="display:grid;grid-template-columns:130px 1fr 62px;align-items:center;gap:8px;font-size:12px;">
      <span style="color:#374151;text-align:right;">${escHtml(i.label)}</span>
      <span style="background:#f1f5f9;border-radius:5px;overflow:hidden;height:16px;display:block;">
        <span style="display:block;height:100%;width:${pct}%;background:${color};border-radius:5px;"></span>
      </span>
      <span style="color:#6b7280;">${i.count}件 (${share}%)</span>
    </div>`;
  }).join('') + `</div>`;
}

function card(title: string, inner: string, note = ''): string {
  return `<div class="hh-card" style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;">
    <h3 style="font-size:14px;font-weight:700;color:#1e3a5f;margin:0 0 ${note ? '2px' : '12px'};">${escHtml(title)}</h3>
    ${note ? `<p style="font-size:12px;color:#6b7280;margin:0 0 12px;">${escHtml(note)}</p>` : ''}
    ${inner}
  </div>`;
}

// 詳細分析（初期31件＝2026年8月20日 集約分の紙シートを読み解いた所見）。
// Web投稿が増えても所見の前提は初期集計。数値は上の集計グラフが常に最新。
const FINDINGS: { h: string; body: string[] }[] = [
  {
    h: '1. 相手は「四輪車」が中心、次いで「自転車」',
    body: [
      '初期31件のうち相手が四輪車の事案が18件と過半数。内訳は前車の急ブレーキ・急バック等（4件）、割り込み・幅寄せ（6件）、逆走（2件）などに分かれる。',
      '自転車は5件＋複合1件。いずれも「一方通行の逆走」「信号無視」「猛スピードでの飛び出し」が絡み、通常の予測が通用しない。歩行者は3件で、すべて交差点の右左折時。',
    ],
  },
  {
    h: '2. 起きやすい場面は「右左折時」と「割り込み・幅寄せ」',
    body: [
      '状況別では右左折時と割り込み・幅寄せが各6件で最多。次いで進路変更・車線変更時、飛び出し、前車の急な動作が各4件。',
      '右左折時の事案は「死角」「曲がる方向と逆側の見落とし」「一度確認した直後の再確認漏れ」で、いずれも“曲がり終わるまで見続ける”ことができていれば防げた。',
    ],
  },
  {
    h: '3. 場所は新宿・外苑六本木エリアに集中／ホットスポットあり',
    body: [
      '発生場所は新宿エリア6件、外苑・六本木エリア5件に集中。とくに外苑西通り〜プラチナ通りは、深夜〜早朝の急な車線変更・割り込み・自転車の逆走が重なっている。',
      '羽田空港は2件で、いずれも「ターミナル分岐部」「高速入口」という合流・分岐地点での割り込み。営業所周辺も2件（板橋中央陸橋交差点、帰庫時のトヨタ交差点＝一方通行の自転車逆走）。この3か所は添乗指導・点呼で個別に注意喚起する価値がある。',
    ],
  },
  {
    h: '4. 悪天候はゼロ。通常条件下で起きている',
    body: [
      '天候の記入があったものはすべて晴か曇で、雨・雪の報告は1件もない。ヒヤリハットは「特別に危ない日」ではなく、平常のコンディションで発生している。',
      '発生日時の記入があったのは約半数。判明分は朝・昼・夜にほぼ均等に分かれており、時間帯の偏りよりも「場面」と「車間・確認」の問題が大きい。',
    ],
  },
  {
    h: '5. 「相手のせい」に見えても、対策はほぼ全員が“自分側”に置いている',
    body: [
      'ヒヤリの理由は「相手の予測外行動・交通違反」系が約半数、「自分の確認不足・判断ミス」系が約半数。',
      '一方で「今後気をつけること」欄は、車間距離・後方確認・速度・かもしれない運転・一時停止など、ほぼ全員が自分の行動に落とし込んでいる。相手起因に見える事案でも自衛できるという認識は現場で共有されつつある。この方向を教育で後押ししたい。',
    ],
  },
  {
    h: '6. 前車トラブルの根本はすべて「車間距離不足」',
    body: [
      '前車の急ブレーキ、赤信号停止中の前車の急バック、交差点内での滞留は、すべて車間を詰めていたことが直接の原因。対策欄も全員が「車間を取る」と書いている。',
      '割り込み・幅寄せ群も、車間があれば急制動せずに減速で吸収できたものが多い。車間距離の標準化が、最も少ない手間で効く対策。',
    ],
  },
  {
    h: '7. 進路変更時の「右後方（二輪車）」確認漏れ',
    body: [
      '車線・進路変更時の事案には、右へ車線変更した際に右後方から来たバイクと接触寸前になったものがある。二輪車は死角に入りやすく速度も速い。',
      'ミラーだけでなく目視を含めた右後方の複数回確認をルール化したい。',
    ],
  },
  {
    h: '8. タクシー業務特有：道間違い・迎車地点の選定ミス',
    body: [
      '一方通行に気づき焦って直進へ戻り後続車と衝突しかけた事案、すれ違い不能の狭路で迎車待機し対向車と後続車に挟まれた事案は、いずれも“焦り”が二次的な危険を生んでいる。',
      '「道を間違えた／進めないと気づいたら、まず安全な位置で一時停止して数秒考える」「待機できない狭路は客に事情を伝えて別の場所へ」を明文化すると再発を抑えられる。',
    ],
  },
  {
    h: '9. ハインリッヒの法則の観点：一歩手前が約3分の1',
    body: [
      '初期31件のうち、クラクション・急ブレーキ・急停車を伴った「衝突寸前」の事案が約35%。「あと2秒ブレーキが遅ければ事故」と記されたものもある。',
      '1：29：300でいう「29（軽微な事故につながりうる出来事）」に相当する報告がこれだけ出ている。件数の多さより、この比率の高さが対策の緊急度を示している。',
    ],
  },
  {
    h: '10. 提出のかたよりと記入率',
    body: [
      '初期集計の課別提出は4課が突出し、他課は少ない。4課の安全意識が高いとも、他課の掘り起こし余地が大きいとも読める。Web化を機に全課へ投稿を促したい。',
      '発生日時・場所の空欄が目立った。Webフォームでもこの2点はできるだけ記入してもらうと分析精度が上がる。',
    ],
  },
];

const PRIORITIES: string[] = [
  '車間距離の標準化 … 前車トラブル・割り込みの多くは車間で吸収できる。停止中も含めて車間を取る。',
  '右左折は「曲がり終わるまで確認し続ける」 … 特に左折時の右側・巻き込み、曲がる方向と逆側の横断者。',
  '進路変更は右後方の二輪車をミラー＋目視で複数回確認する。',
  '3つのホットスポットを共有 … 外苑西通り〜プラチナ通り（深夜の割り込み・逆走）／羽田空港の分岐・高速入口（割り込み）／営業所周辺の一方通行（自転車の逆走）。',
  '迷ったら一時停止 … 道間違い・進入不可・迎車地点の狭さに気づいたら、焦って動かず安全な位置で止まって考える。',
  '自転車は「逆走・信号無視でくる」前提の防御運転。青信号でも交差点内は左右を見る。',
  'Web報告を習慣化 … ヒヤリを感じたら当日中にフォームへ。日時・場所も一緒に記入する。',
];

function kaHanText(r: HiyariRow): string {
  if (r.division && r.team) return `${r.division}課${r.team}班`;
  if (r.division) return `${r.division}課`;
  return '—';
}
function placeText(r: HiyariRow): string {
  const a = r.place_area && r.place_area !== 'その他' ? r.place_area : '';
  const d = r.place_detail;
  if (a && d) return `${a}／${d}`;
  return d || a || '—';
}
function dash(s: string): string { return s.trim() ? s : '—'; }

// ---- セクションごとのHTMLビルダー（分析ページ・印刷ページで共用） ----
function buildSections(
  st: HiyariStats, rows: HiyariRow[], mode: 'screen' | 'print',
): Record<string, string> {
  const total = st.total;
  const severePct = total ? Math.round((st.severe / total) * 100) : 0;

  const overview = `
  <section class="hh-sec" data-sec="overview">
    <h3 class="hh-sec-h">概要</h3>
    <div style="display:flex;gap:10px;flex-wrap:wrap;">
      ${statTile(String(total), '報告 総数')}
      ${statTile(`${st.sheetCount} / ${st.webCount}`, '紙シート由来 / Web投稿')}
      ${statTile(String(st.severe), '衝突寸前・急制動を伴った事案', '#dc2626')}
      ${statTile(`${severePct}%`, '一歩手前が占める割合', '#dc2626')}
      ${statTile(`${st.datetimeKnown} / ${total}`, '発生日時の記入あり', '#b45309')}
      ${statTile(String(st.badWeather), '雨・雪での発生（悪天候）', '#166534')}
    </div>
  </section>`;

  const charts = `
  <section class="hh-sec" data-sec="charts">
    <h3 class="hh-sec-h">集計グラフ</h3>
    <div class="hh-charts" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:12px;">
      ${card('相手（ヒヤリの対象）別', barChart(st.byCounterpart, total))}
      ${card('起きた場面 別', barChart(st.bySituation, total, '#0f766e'))}
      ${card('発生エリア 別', barChart(st.byArea, total, '#7c3aed'))}
      ${card('ヒヤリの理由（分類）別', barChart(st.byCause, total, '#b45309'))}
      ${card('報告した課 別', barChart(st.byKa, total, '#475569'), '課の記入があったものを集計')}
    </div>
  </section>`;

  const findings = `
  <section class="hh-sec" data-sec="findings">
    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;">
      <h3 style="font-size:15px;font-weight:800;color:#1e3a5f;margin:0 0 4px;">詳細分析</h3>
      <p style="font-size:11.5px;color:#9ca3af;margin:0 0 14px;">初期集計（2026年8月20日・紙シート31件）を読み解いた所見です。最新の件数は上の集計グラフをご覧ください。</p>
      ${FINDINGS.map(f => `
        <div class="hh-finding" style="margin-bottom:14px;">
          <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:4px;">${escHtml(f.h)}</div>
          ${f.body.map(p => `<p style="font-size:12.5px;color:#374151;line-height:1.75;margin:0 0 4px;">${escHtml(p)}</p>`).join('')}
        </div>`).join('')}
    </div>
  </section>`;

  const priorities = `
  <section class="hh-sec" data-sec="priorities">
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:18px 20px;">
      <h3 style="font-size:15px;font-weight:800;color:#9a3412;margin:0 0 12px;">重点対策（提言）</h3>
      <ol style="margin:0;padding-left:20px;">
        ${PRIORITIES.map(p => `<li style="font-size:12.5px;color:#7c2d12;line-height:1.7;margin-bottom:7px;">${escHtml(p)}</li>`).join('')}
      </ol>
    </div>
  </section>`;

  const minW = mode === 'print' ? '' : 'min-width:1120px;';
  const bodyRows = rows.map((r, i) => `
    <tr style="border-top:1px solid #eef2f7;${r.severe ? 'background:#fef2f2;' : ''}">
      <td style="padding:7px 8px;color:#9ca3af;font-variant-numeric:tabular-nums;">${i + 1}</td>
      <td style="padding:7px 8px;white-space:nowrap;">${r.source === 'web' ? '<span style="font-size:10px;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:99px;padding:1px 6px;">Web</span>' : '<span style="font-size:10px;color:#6b7280;border:1px solid #e5e7eb;border-radius:99px;padding:1px 6px;">紙</span>'}</td>
      <td style="padding:7px 8px;white-space:nowrap;">${escHtml(kaHanText(r))}</td>
      <td style="padding:7px 8px;white-space:nowrap;color:#6b7280;">${escHtml(dash(r.occurred_at))}</td>
      <td style="padding:7px 8px;">${escHtml(placeText(r))}</td>
      <td style="padding:7px 8px;white-space:nowrap;">${escHtml(dash(r.counterpart))}</td>
      <td style="padding:7px 8px;white-space:nowrap;">${escHtml(dash(r.situation))}${r.severe ? ' <span style="color:#dc2626;font-weight:700;">※一歩手前</span>' : ''}</td>
      <td style="padding:7px 8px;">${escHtml(dash(r.situation_text))}</td>
      <td style="padding:7px 8px;color:#6b7280;">${escHtml(dash(r.cause_text || r.cause))}</td>
      <td style="padding:7px 8px;color:#374151;">${escHtml(dash(r.measure_text))}</td>
    </tr>`).join('');

  const table = `
  <section class="hh-sec" data-sec="table">
    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;">
      <h3 style="font-size:14px;font-weight:700;color:#1e3a5f;margin:0 0 4px;">全${total}件（氏名は非保持）</h3>
      <p style="font-size:12px;color:#6b7280;margin:0 0 12px;">紙シート由来＋Web投稿。判読が難しい地名等は近い表記に丸めている。</p>
      <div style="overflow-x:auto;">
        <table class="hh-table" style="border-collapse:collapse;width:100%;${minW}font-size:12px;">
          <thead>
            <tr style="text-align:left;color:#6b7280;font-size:11px;">
              <th style="padding:6px 8px;">#</th>
              <th style="padding:6px 8px;">区分</th>
              <th style="padding:6px 8px;">課・班</th>
              <th style="padding:6px 8px;">発生日時</th>
              <th style="padding:6px 8px;">場所</th>
              <th style="padding:6px 8px;">相手</th>
              <th style="padding:6px 8px;">場面</th>
              <th style="padding:6px 8px;">状況</th>
              <th style="padding:6px 8px;">ヒヤリの理由</th>
              <th style="padding:6px 8px;">今後気をつけること</th>
            </tr>
          </thead>
          <tbody>${bodyRows || '<tr><td colspan="10" style="padding:16px;color:#9ca3af;">データがありません</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  </section>`;

  return { overview, charts, findings, priorities, table };
}

function parseSections(raw: string | undefined): string[] {
  const wanted = new Set((raw ?? '').split(',').map(s => s.trim()).filter(Boolean));
  const picked = SECTION_KEYS.filter(k => wanted.has(k));
  return picked.length ? picked : SECTION_KEYS.slice();
}

// ============ 分析ページ ============
app.get('/kacho-mission/hiyari', async (c) => {
  const rows = await loadRows(c.env.DB).catch(() => [] as HiyariRow[]);
  const st = computeHiyariStats(rows);
  const sec = buildSections(st, rows, 'screen');

  const printPanel = `
  <div class="no-print" style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin-bottom:16px;">
    <div style="display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
      <h3 style="font-size:14px;font-weight:700;color:#1e3a5f;margin:0;">レポート印刷</h3>
      <span style="font-size:12px;color:#6b7280;">印刷したい項目を選んで「印刷用ページを開く」を押してください。</span>
    </div>
    <div style="display:flex;gap:14px 20px;flex-wrap:wrap;margin-bottom:12px;">
      ${SECTION_META.map(s => `
        <label style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#374151;cursor:pointer;">
          <input type="checkbox" class="hh-print-sec" value="${s.key}" checked> ${escHtml(s.label)}
        </label>`).join('')}
    </div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
      <button id="hh-print-open" style="padding:9px 22px;background:#1e3a5f;color:white;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">印刷用ページを開く</button>
      <button id="hh-print-all" type="button" style="padding:8px 14px;background:#eef2ff;color:#3730a3;border:1px solid #c7d2fe;border-radius:6px;font-size:12px;cursor:pointer;">全選択</button>
      <button id="hh-print-none" type="button" style="padding:8px 14px;background:#f8fafc;color:#475569;border:1px solid #e2e8f0;border-radius:6px;font-size:12px;cursor:pointer;">全解除</button>
      <span id="hh-print-msg" style="font-size:12px;color:#b91c1c;"></span>
    </div>
  </div>`;

  const content = subHeader('ヒヤリハット分析') + `
    <p class="no-print" style="font-size:12px;color:#6b7280;margin:-6px 0 16px;">${escHtml(HIYARI_SOURCE_LABEL)}。投稿フォームは設定「板橋」→「ヒヤリハット」タブで公開URL・QRを掲示できます。氏名は保存していません。</p>
    ${printPanel}
    <style>
      .hh-sec { margin-bottom:16px; }
      .hh-sec-h { font-size:13px;font-weight:700;color:#64748b;margin:0 0 8px; }
    </style>
    ${sec.overview}
    ${sec.charts}
    ${sec.findings}
    ${sec.priorities}
    ${sec.table}
    <script>
    (function(){
      var boxes = function(){ return Array.prototype.slice.call(document.querySelectorAll('.hh-print-sec')); };
      document.getElementById('hh-print-all').addEventListener('click', function(){ boxes().forEach(function(b){ b.checked = true; }); });
      document.getElementById('hh-print-none').addEventListener('click', function(){ boxes().forEach(function(b){ b.checked = false; }); });
      document.getElementById('hh-print-open').addEventListener('click', function(){
        var sel = boxes().filter(function(b){ return b.checked; }).map(function(b){ return b.value; });
        var msg = document.getElementById('hh-print-msg');
        if (!sel.length) { msg.textContent = '1つ以上選択してください'; return; }
        msg.textContent = '';
        window.open('${ADMIN_PATH}/kacho-mission/hiyari/print?sections=' + encodeURIComponent(sel.join(',')), '_blank');
      });
    })();
    </script>
  `;
  return c.html(layout('ヒヤリハット分析', content, 'kacho-mission'));
});

// ============ 印刷用スタンドアロンページ ============
app.get('/kacho-mission/hiyari/print', async (c) => {
  const rows = await loadRows(c.env.DB).catch(() => [] as HiyariRow[]);
  const st = computeHiyariStats(rows);
  const sec = buildSections(st, rows, 'print');
  const picked = parseSections(c.req.query('sections'));
  const body = picked.map(k => sec[k]).join('\n');
  const back = `${ADMIN_PATH}/kacho-mission/hiyari`;
  const today = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });

  return c.html(`<!DOCTYPE html>
<html lang="ja"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>ヒヤリハット分析レポート</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Hiragino Sans','Meiryo',sans-serif; margin: 0; padding: 20px; background: #e5e7eb; color: #0f172a; }
  .bar { display: flex; gap: 12px; align-items: center; margin: 0 auto 14px; max-width: 190mm; flex-wrap: wrap; }
  .bar a { color: #374151; font-size: 13px; text-decoration: none; padding: 6px 12px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
  .bar button { padding: 8px 20px; background: #1e3a5f; color: #fff; border: none; border-radius: 7px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .page { max-width: 190mm; margin: 0 auto; background: #fff; padding: 16mm 14mm; box-shadow: 0 2px 12px rgba(0,0,0,.25); }
  .rep-head { border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; margin-bottom: 18px; }
  .rep-head h1 { font-size: 19px; color: #1e3a5f; margin: 0 0 4px; }
  .rep-head .meta { font-size: 11px; color: #6b7280; line-height: 1.6; }
  .hh-sec { margin-bottom: 18px; }
  .hh-sec-h { font-size: 12px; font-weight: 700; color: #64748b; margin: 0 0 8px; }
  .hh-charts { grid-template-columns: 1fr 1fr !important; }
  .hh-card, .hh-finding, .hh-sec > div { break-inside: avoid; }
  .hh-table { font-size: 10px !important; }
  .hh-table th, .hh-table td { padding: 4px 5px !important; }
  .hh-table td { white-space: normal !important; word-break: break-word; }
  .hh-table thead { display: table-header-group; }
  .hh-table tr { break-inside: avoid; }

  @media print {
    body { background: #fff; padding: 0; }
    .bar { display: none; }
    .page { max-width: none; margin: 0; padding: 0; box-shadow: none; }
    .hh-sec { break-inside: avoid-page; }
    @page { size: A4 portrait; margin: 14mm; }
  }
</style>
</head><body>
  <div class="bar">
    <a href="${back}">← 分析ページに戻る</a>
    <button onclick="window.print()">印刷 / PDF保存</button>
  </div>
  <div class="page">
    <div class="rep-head">
      <h1>ヒヤリハット分析レポート</h1>
      <div class="meta">
        ${escHtml(HIYARI_SOURCE_LABEL)}<br>
        氏名は非保持　／　出力日：${escHtml(today)}
      </div>
    </div>
    ${body}
  </div>
  <script>
    window.addEventListener('load', function(){ setTimeout(function(){ window.print(); }, 400); });
  </script>
</body></html>`);
});

export default app;
