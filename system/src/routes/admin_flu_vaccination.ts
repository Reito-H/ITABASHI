// 課長ミッション「インフルエンザ予防接種」
//   健診機関の受診者名簿（紙PDF → migration_198 で取込済み。インフルエンザ欄の○＝接種）を社員台帳と突き合わせ、
//   在籍社員ごとの「接種済み／未接種」を一覧・分析する。他の病院で接種した人は名前検索して「接種済み」にできる。
//   Excel（ブラウザ側で SheetJS 生成）と PDF（A4 印刷ページ → ブラウザの「PDFに保存」）で出力できる。
//
// パス（ADMIN_PATH 配下・権限キー kacho-mission|staff。書き込みは .edit が必要＝index.ts の共通判定）
//   GET  /kacho-mission/flu                      画面
//   GET  /kacho-mission/flu/api/data             集計＋一覧（JSON）
//   GET  /kacho-mission/flu/api/search?q=        社員検索（手動「接種済み」用）
//   POST /kacho-mission/flu/api/manual           手動で接種済みにする {empNo, vaccinatedAt, place, note}
//   POST /kacho-mission/flu/api/manual/delete    手動登録を取り消す {empNo}
//   GET  /kacho-mission/flu/print?list=...       A4 印刷ページ（PDF保存用）
import { Hono } from 'hono';
import { layout, escHtml, safeJson } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const SEASON = '2026'; // 令和8年度（2026年秋の接種）
const SEASON_LABEL = '2026年度（令和8年度）';
const BASE = `${ADMIN_PATH}/kacho-mission/flu`;

type EmpRow = { emp_no: string; name: string; name_kana: string | null; birth_date: string | null; division: number | null; team: number | null; is_active: number };
type ExamRow = { id: number; checkup_date: string; examinee_id: string; name_kana: string; birth_date: string | null; vaccinated: number; emp_no: string | null; note: string | null };
type ManualRow = { id: number; emp_no: string; vaccinated_at: string | null; place: string | null; note: string | null; created_at: string };

export type FluStatus = 'checkup' | 'manual' | 'attended_no' | 'absent';

export type FluPerson = {
  empNo: string; name: string; kana: string; division: number | null; team: number | null; birth: string | null; age: number | null;
  status: FluStatus; statusLabel: string; vaccinated: boolean;
  checkupDate: string | null; manual: { vaccinatedAt: string | null; place: string | null; note: string | null } | null; note: string | null;
};

const STATUS_LABEL: Record<FluStatus, string> = {
  checkup: '接種済み（健診）',
  manual: '接種済み（他院等）',
  attended_no: '未接種（健診は受診）',
  absent: '未接種（健診名簿なし）',
};

function ageOn(birth: string | null, today: string): number | null {
  if (!birth || !/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
  const b = new Date(birth + 'T00:00:00Z'); const t = new Date(today + 'T00:00:00Z');
  let a = t.getUTCFullYear() - b.getUTCFullYear();
  if (t.getUTCMonth() < b.getUTCMonth() || (t.getUTCMonth() === b.getUTCMonth() && t.getUTCDate() < b.getUTCDate())) a--;
  return a;
}
function todayJst(): string { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }

async function loadAll(db: D1Database) {
  const [emps, exams, manuals] = await Promise.all([
    db.prepare('SELECT emp_no, name, name_kana, birth_date, division, team, is_active FROM employees WHERE is_active = 1 ORDER BY division, team, emp_no').all<EmpRow>(),
    db.prepare('SELECT id, checkup_date, examinee_id, name_kana, birth_date, vaccinated, emp_no, note FROM flu_checkup_examinees WHERE season = ? ORDER BY checkup_date, id').bind(SEASON).all<ExamRow>(),
    db.prepare('SELECT id, emp_no, vaccinated_at, place, note, created_at FROM flu_manual_vaccinations WHERE season = ? ORDER BY id').bind(SEASON).all<ManualRow>(),
  ]);
  const today = todayJst();
  const examByEmp = new Map<string, ExamRow>();
  for (const x of exams.results) if (x.emp_no) examByEmp.set(x.emp_no, x);
  const manualByEmp = new Map<string, ManualRow>();
  for (const m of manuals.results) manualByEmp.set(m.emp_no, m);

  const people: FluPerson[] = emps.results.map((e) => {
    const x = examByEmp.get(e.emp_no); const m = manualByEmp.get(e.emp_no);
    let status: FluStatus = x ? (x.vaccinated ? 'checkup' : 'attended_no') : 'absent';
    if (status !== 'checkup' && m) status = 'manual';
    return {
      empNo: e.emp_no, name: e.name, kana: e.name_kana ?? '', division: e.division, team: e.team, birth: e.birth_date, age: ageOn(e.birth_date, today),
      status, statusLabel: STATUS_LABEL[status], vaccinated: status === 'checkup' || status === 'manual',
      checkupDate: x?.checkup_date ?? null,
      manual: m ? { vaccinatedAt: m.vaccinated_at, place: m.place, note: m.note } : null,
      note: x?.note ?? null,
    };
  });

  // 名簿にいるが社員台帳に無い人（職員・退職者など）
  const unlinked = exams.results.filter((x) => !x.emp_no).map((x) => ({ examineeId: x.examinee_id, kana: x.name_kana, birth: x.birth_date, checkupDate: x.checkup_date, vaccinated: !!x.vaccinated }));
  // 名簿で紐付いたが在籍外（退職等）
  const activeSet = new Set(emps.results.map((e) => e.emp_no));
  const linkedInactive = exams.results.filter((x) => x.emp_no && !activeSet.has(x.emp_no)).length;

  const total = people.length; const vac = people.filter((p) => p.vaccinated).length;
  const byKey = (key: (p: FluPerson) => string, order?: (a: string, b: string) => number) => {
    const m = new Map<string, { label: string; total: number; vaccinated: number; checkup: number; manual: number; attendedNo: number; absent: number }>();
    for (const p of people) {
      const k = key(p);
      const r = m.get(k) ?? { label: k, total: 0, vaccinated: 0, checkup: 0, manual: 0, attendedNo: 0, absent: 0 };
      r.total++; if (p.vaccinated) r.vaccinated++;
      if (p.status === 'checkup') r.checkup++; else if (p.status === 'manual') r.manual++; else if (p.status === 'attended_no') r.attendedNo++; else r.absent++;
      m.set(k, r);
    }
    const arr = [...m.values()].map((r) => ({ ...r, rate: r.total ? Math.round((r.vaccinated / r.total) * 1000) / 10 : 0 }));
    return order ? arr.sort((a, b) => order(a.label, b.label)) : arr.sort((a, b) => a.label.localeCompare(b.label, 'ja'));
  };
  const numOrder = (a: string, b: string) => (a === '未設定' ? 1 : b === '未設定' ? -1 : parseInt(a, 10) - parseInt(b, 10));
  const summary = {
    season: SEASON, seasonLabel: SEASON_LABEL, asOf: today,
    total, vaccinated: vac, unvaccinated: total - vac, rate: total ? Math.round((vac / total) * 1000) / 10 : 0,
    checkup: people.filter((p) => p.status === 'checkup').length,
    manual: people.filter((p) => p.status === 'manual').length,
    attendedNo: people.filter((p) => p.status === 'attended_no').length,
    absent: people.filter((p) => p.status === 'absent').length,
    rosterTotal: exams.results.length, rosterVaccinated: exams.results.filter((x) => x.vaccinated).length, rosterLinked: exams.results.filter((x) => x.emp_no).length,
    rosterUnlinked: unlinked.length, rosterLinkedInactive: linkedInactive,
    checkupDates: [...new Set(exams.results.map((x) => x.checkup_date))].sort(),
    byDivision: byKey((p) => (p.division ? `${p.division}課` : '未設定'), numOrder),
    byTeam: byKey((p) => (p.team ? `${p.team}班` : '未設定'), numOrder),
    byAge: byKey((p) => (p.age == null ? '不明' : p.age < 30 ? '20代以下' : p.age < 40 ? '30代' : p.age < 50 ? '40代' : p.age < 60 ? '50代' : p.age < 70 ? '60代' : '70代以上'),
      (a, b) => ['20代以下', '30代', '40代', '50代', '60代', '70代以上', '不明'].indexOf(a) - ['20代以下', '30代', '40代', '50代', '60代', '70代以上', '不明'].indexOf(b)),
    byCheckupDate: (() => {
      const m = new Map<string, { date: string; attended: number; vaccinated: number }>();
      for (const x of exams.results) { const r = m.get(x.checkup_date) ?? { date: x.checkup_date, attended: 0, vaccinated: 0 }; r.attended++; if (x.vaccinated) r.vaccinated++; m.set(x.checkup_date, r); }
      return [...m.values()].sort((a, b) => a.date.localeCompare(b.date)).map((r) => ({ ...r, rate: r.attended ? Math.round((r.vaccinated / r.attended) * 1000) / 10 : 0 }));
    })(),
  };
  return { summary, people, unlinked };
}

// ---------- API ----------
app.get('/kacho-mission/flu/api/data', async (c) => {
  try {
    return c.json(await loadAll(c.env.DB));
  } catch (e) {
    return c.json({ error: 'データの読み込みに失敗しました（migration_198 が未適用の可能性）: ' + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});

app.get('/kacho-mission/flu/api/search', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.json({ results: [] });
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const rows = await c.env.DB.prepare(
    `SELECT e.emp_no, e.name, e.name_kana, e.division, e.team,
            (SELECT vaccinated FROM flu_checkup_examinees x WHERE x.season = ? AND x.emp_no = e.emp_no LIMIT 1) AS checkup_vaccinated,
            (SELECT id FROM flu_manual_vaccinations m WHERE m.season = ? AND m.emp_no = e.emp_no) AS manual_id
     FROM employees e
     WHERE e.is_active = 1 AND (e.name LIKE ? OR REPLACE(e.name, '　', '') LIKE ? OR e.name_kana LIKE ? OR REPLACE(e.name_kana, ' ', '') LIKE ? OR e.emp_no LIKE ?)
     ORDER BY e.division, e.team, e.emp_no LIMIT 30`,
  ).bind(SEASON, SEASON, like, like, like, like, like).all<{ emp_no: string; name: string; name_kana: string | null; division: number | null; team: number | null; checkup_vaccinated: number | null; manual_id: number | null }>();
  return c.json({ results: rows.results.map((r) => ({ empNo: r.emp_no, name: r.name, kana: r.name_kana ?? '', division: r.division, team: r.team, vaccinated: r.checkup_vaccinated === 1 || r.manual_id != null, manual: r.manual_id != null })) });
});

app.post('/kacho-mission/flu/api/manual', async (c) => {
  type ManualBody = { empNo?: string; vaccinatedAt?: string; place?: string; note?: string };
  const body = await c.req.json<ManualBody>().catch(() => ({}) as ManualBody);
  const empNo = (body.empNo ?? '').trim();
  if (!empNo) return c.json({ error: '社員番号が指定されていません' }, 400);
  const emp = await c.env.DB.prepare('SELECT emp_no, name FROM employees WHERE emp_no = ?').bind(empNo).first<{ emp_no: string; name: string }>();
  if (!emp) return c.json({ error: '該当する社員がいません' }, 404);
  const at = (body.vaccinatedAt ?? '').trim();
  if (at && !/^\d{4}-\d{2}-\d{2}$/.test(at)) return c.json({ error: '接種日の形式が正しくありません' }, 400);
  await c.env.DB.prepare(
    `INSERT INTO flu_manual_vaccinations (season, emp_no, vaccinated_at, place, note, created_by) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(season, emp_no) DO UPDATE SET vaccinated_at = excluded.vaccinated_at, place = excluded.place, note = excluded.note, created_by = excluded.created_by, created_at = datetime('now', 'localtime')`,
  ).bind(SEASON, empNo, at || null, (body.place ?? '').trim().slice(0, 100) || null, (body.note ?? '').trim().slice(0, 300) || null, c.get('adminId')).run();
  return c.json({ ok: true, name: emp.name });
});

app.post('/kacho-mission/flu/api/manual/delete', async (c) => {
  const body = await c.req.json<{ empNo?: string }>().catch(() => ({}) as { empNo?: string });
  const empNo = (body.empNo ?? '').trim();
  if (!empNo) return c.json({ error: '社員番号が指定されていません' }, 400);
  await c.env.DB.prepare('DELETE FROM flu_manual_vaccinations WHERE season = ? AND emp_no = ?').bind(SEASON, empNo).run();
  return c.json({ ok: true });
});

// ---------- 画面 ----------
const PAGE_CSS = `
.flu-wrap{max-width:1180px}
.flu-head{display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap}
.flu-head h2{font-size:17px;font-weight:700;color:#1e3a5f;margin:0}
.flu-head .sp{flex:1}
.flu-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#374151;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none}
.flu-btn.primary{background:#1e3a5f;color:#fff;border-color:#1e3a5f}
.flu-btn.danger{color:#b91c1c;border-color:#fca5a5}
.flu-btn:disabled{opacity:.5;cursor:default}
.flu-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
.flu-tile{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px}
.flu-tile .l{font-size:11px;color:#6b7280;font-weight:600}
.flu-tile .v{font-size:26px;font-weight:800;color:#1e3a5f;line-height:1.2;margin-top:2px}
.flu-tile .s{font-size:11px;color:#6b7280;margin-top:2px}
.flu-tile.ok .v{color:#15803d}.flu-tile.ng .v{color:#b91c1c}
.flu-tabs{display:flex;gap:4px;border-bottom:2px solid #e5e7eb;margin-bottom:12px;flex-wrap:wrap}
.flu-tabs button{background:none;border:none;border-bottom:3px solid transparent;margin-bottom:-2px;padding:8px 12px;font-size:13px;font-weight:700;color:#6b7280;cursor:pointer}
.flu-tabs button.active{color:#1e3a5f;border-bottom-color:#1e3a5f}
.flu-panel{display:none}.flu-panel.active{display:block}
.flu-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:12px}
.flu-card h3{font-size:13px;font-weight:700;color:#1e3a5f;margin:0 0 10px}
.flu-grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
table.flu{width:100%;border-collapse:collapse;font-size:12px}
table.flu th,table.flu td{border-bottom:1px solid #eef0f3;padding:6px 8px;text-align:left;white-space:nowrap}
table.flu th{background:#f8fafc;color:#374151;font-weight:700;font-size:11px;position:sticky;top:0}
table.flu td.num,table.flu th.num{text-align:right}
.bar{display:flex;align-items:center;gap:8px}
.bar i{display:block;height:10px;border-radius:5px;background:#15803d;min-width:2px}
.bar small{color:#6b7280;font-size:11px}
.flu-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.flu-tools input,.flu-tools select{border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px}
.flu-tools input{min-width:220px}
.st{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700}
.st.checkup{background:#dcfce7;color:#166534}.st.manual{background:#dbeafe;color:#1e40af}.st.attended_no{background:#fee2e2;color:#991b1b}.st.absent{background:#f3f4f6;color:#4b5563}
.tablewrap{max-height:620px;overflow:auto;border:1px solid #e5e7eb;border-radius:8px}
.flu-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.35);display:none;align-items:center;justify-content:center;z-index:1000}
.flu-modal-bg.open{display:flex}
.flu-modal{background:#fff;border-radius:12px;width:min(520px,94vw);padding:18px 20px;box-shadow:0 10px 30px rgba(0,0,0,.2)}
.flu-modal h3{margin:0 0 10px;font-size:15px;color:#1e3a5f}
.flu-modal label{display:block;font-size:12px;color:#374151;font-weight:600;margin-top:8px}
.flu-modal input{width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;margin-top:3px}
.flu-modal .hit{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border:1px solid #e5e7eb;border-radius:6px;margin-top:4px;font-size:12px;cursor:pointer}
.flu-modal .hit:hover{background:#f8fafc}
.flu-modal .hit.sel{border-color:#1e3a5f;background:#eef2ff}
.flu-modal .acts{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.flu-note{font-size:11px;color:#6b7280;line-height:1.6}
@media (max-width:700px){.flu-tools input{min-width:0;flex:1}}
`;

app.get('/kacho-mission/flu', (c) => {
  const content = `
  <style>${PAGE_CSS}</style>
  <div class="flu-wrap">
    <div class="flu-head">
      <a href="${ADMIN_PATH}/kacho-mission" class="flu-btn">← 課長ミッション</a>
      <h2>インフルエンザ予防接種 <span style="font-size:12px;color:#6b7280;font-weight:600;margin-left:6px">${SEASON_LABEL}</span></h2>
      <span class="sp"></span>
      <button type="button" class="flu-btn primary" id="btnManual">＋ 他院で接種した人を登録</button>
      <button type="button" class="flu-btn" id="btnExcel">Excel 出力</button>
      <a class="flu-btn" id="btnPdf" href="${BASE}/print?list=all" target="_blank" rel="noopener">PDF（印刷）</a>
    </div>

    <div class="flu-tiles" id="tiles"></div>

    <div class="flu-tabs" id="tabs">
      <button data-tab="analysis" class="active">分析</button>
      <button data-tab="unvac">未接種リスト</button>
      <button data-tab="vac">接種済みリスト</button>
      <button data-tab="all">全員</button>
      <button data-tab="roster">健診名簿（取込元）</button>
    </div>

    <div class="flu-panel active" id="p-analysis"></div>
    <div class="flu-panel" id="p-unvac"></div>
    <div class="flu-panel" id="p-vac"></div>
    <div class="flu-panel" id="p-all"></div>
    <div class="flu-panel" id="p-roster"></div>
  </div>

  <div class="flu-modal-bg" id="modalBg">
    <div class="flu-modal">
      <h3>他の病院等で接種した人を「接種済み」にする</h3>
      <label>名前・フリガナ・社員番号で検索</label>
      <input type="text" id="mSearch" placeholder="例: 山田 / ヤマダ / 20152315" autocomplete="off">
      <div id="mHits" style="max-height:200px;overflow:auto;margin-top:4px"></div>
      <label>接種日（分かれば）</label>
      <input type="date" id="mDate">
      <label>接種した場所（任意）</label>
      <input type="text" id="mPlace" placeholder="例: ○○クリニック">
      <label>メモ（任意）</label>
      <input type="text" id="mNote">
      <div class="acts">
        <button type="button" class="flu-btn" id="mCancel">閉じる</button>
        <button type="button" class="flu-btn primary" id="mSave" disabled>接種済みにする</button>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <script>
  (function(){
    var BASE = ${safeJson(BASE)};
    var $ = function(id){ return document.getElementById(id); };
    var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]; }); };
    var D = null;

    function fmtDate(s){ if(!s) return ''; var m = String(s).match(/^(\\d{4})-(\\d{2})-(\\d{2})$/); return m ? (m[1]+'/'+m[2]+'/'+m[3]) : s; }
    function divTeam(p){ return (p.division ? p.division+'課' : '') + (p.team ? ' '+p.team+'班' : ''); }

    function load(){
      return fetch(BASE + '/api/data').then(function(r){ return r.json(); }).then(function(j){
        if (j.error) { $('tiles').innerHTML = '<div class="flu-card" style="color:#b91c1c">' + esc(j.error) + '</div>'; return; }
        D = j; render();
      });
    }

    function render(){
      var s = D.summary;
      $('tiles').innerHTML =
        tile('在籍社員（対象）', s.total + '人', '', '') +
        tile('接種済み', s.vaccinated + '人', '健診 ' + s.checkup + ' ／ 他院等 ' + s.manual, 'ok') +
        tile('未接種', s.unvaccinated + '人', '健診は受診 ' + s.attendedNo + ' ／ 名簿なし ' + s.absent, 'ng') +
        tile('接種率', s.rate + '%', '対象 ' + s.total + '人中', '') +
        tile('健診名簿', s.rosterTotal + '人', '○ ' + s.rosterVaccinated + '人 ／ 台帳未登録 ' + s.rosterUnlinked + '人', '');
      renderAnalysis(); renderList('unvac'); renderList('vac'); renderList('all'); renderRoster();
    }
    function tile(l, v, sub, cls){ return '<div class="flu-tile ' + cls + '"><div class="l">' + esc(l) + '</div><div class="v">' + esc(v) + '</div><div class="s">' + esc(sub) + '</div></div>'; }

    function barTable(title, rows, labelHead){
      var max = Math.max.apply(null, rows.map(function(r){ return r.total; }).concat([1]));
      return '<div class="flu-card"><h3>' + esc(title) + '</h3><table class="flu"><thead><tr><th>' + esc(labelHead) + '</th><th class="num">対象</th><th class="num">接種済み</th><th class="num">未接種</th><th class="num">接種率</th><th style="width:40%">グラフ</th></tr></thead><tbody>' +
        rows.map(function(r){
          var w = Math.round(r.rate);
          return '<tr><td>' + esc(r.label) + '</td><td class="num">' + r.total + '</td><td class="num">' + r.vaccinated + '</td><td class="num">' + (r.total - r.vaccinated) + '</td><td class="num"><b>' + r.rate + '%</b></td>' +
            '<td><div class="bar"><i style="width:' + w + '%"></i><small>' + r.vaccinated + '/' + r.total + '</small></div></td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    function renderAnalysis(){
      var s = D.summary;
      var byDate = '<div class="flu-card"><h3>健診日ごとの接種状況（名簿ベース・台帳未登録者を含む）</h3><table class="flu"><thead><tr><th>健診日</th><th class="num">受診者</th><th class="num">○（接種）</th><th class="num">接種率</th></tr></thead><tbody>' +
        s.byCheckupDate.map(function(r){ return '<tr><td>' + esc(fmtDate(r.date)) + '</td><td class="num">' + r.attended + '</td><td class="num">' + r.vaccinated + '</td><td class="num"><b>' + r.rate + '%</b></td></tr>'; }).join('') +
        '</tbody></table></div>';
      var status = '<div class="flu-card"><h3>在籍社員の内訳</h3><table class="flu"><tbody>' +
        [['接種済み（健診で○）', s.checkup, 'checkup'], ['接種済み（他院等・手動登録）', s.manual, 'manual'], ['未接種（健診は受診したが○なし）', s.attendedNo, 'attended_no'], ['未接種（健診名簿に名前なし）', s.absent, 'absent']].map(function(r){
          return '<tr><td><span class="st ' + r[2] + '">' + esc(r[0]) + '</span></td><td class="num"><b>' + r[1] + '人</b></td><td class="num">' + (s.total ? Math.round(r[1] / s.total * 1000) / 10 : 0) + '%</td></tr>';
        }).join('') + '</tbody></table><div class="flu-note" style="margin-top:8px">「健診名簿に名前なし」は、健診を受けていない（別日程・未受診・別会場）か、名簿の氏名が台帳と一致しなかった人です。他院等で接種済みの人は右上のボタンから登録できます。</div></div>';
      $('p-analysis').innerHTML = '<div class="flu-grid2">' + status + byDate + '</div>' + barTable('課別', s.byDivision, '課') + '<div class="flu-grid2">' + barTable('班別', s.byTeam, '班') + barTable('年代別', s.byAge, '年代') + '</div>';
    }

    var filt = { unvac: {q:'', div:''}, vac: {q:'', div:''}, all: {q:'', div:''} };
    function listRows(kind){
      var rows = D.people.filter(function(p){ return kind === 'all' ? true : kind === 'vac' ? p.vaccinated : !p.vaccinated; });
      var f = filt[kind]; var q = (f.q || '').replace(/[\\s　]/g, '');
      if (q) rows = rows.filter(function(p){ return (p.name + p.kana + p.empNo).replace(/[\\s　]/g, '').indexOf(q) >= 0; });
      if (f.div) rows = rows.filter(function(p){ return String(p.division || '') === f.div; });
      return rows;
    }
    function renderList(kind){
      var panel = $('p-' + kind); var f = filt[kind];
      // 入力欄（検索・課）は最初の1回だけ作る。文字入力のたびに作り直すと日本語入力（変換中）が途切れるため、以降は表だけ更新する
      if (!panel.querySelector('.flu-tools')) {
        var divOpts = ['', '1', '2', '3', '4'].map(function(d){ return '<option value="' + d + '">' + (d ? d + '課' : '全課') + '</option>'; }).join('');
        panel.innerHTML = '<div class="flu-tools"><input type="text" placeholder="名前・フリガナ・社員番号で絞り込み" data-k="' + kind + '" class="lq" autocomplete="off"><select data-k="' + kind + '" class="ldiv">' + divOpts + '</select>' +
          '<span class="flu-note lcount"></span><span style="flex:1"></span><a class="flu-btn lpdf" target="_blank" rel="noopener" href="#">この一覧をPDF（印刷）</a></div><div class="lbody"></div>';
      }
      var rows = listRows(kind);
      panel.querySelector('.lcount').textContent = rows.length + '人';
      panel.querySelector('.lpdf').setAttribute('href', BASE + '/print?list=' + kind + (f.div ? '&div=' + f.div : ''));
      panel.querySelector('.lbody').innerHTML =
        '<div class="tablewrap"><table class="flu"><thead><tr><th>#</th><th>氏名</th><th>課/班</th><th>状況</th><th>操作</th><th>社員番号</th><th>フリガナ</th><th class="num">年齢</th><th>健診日</th><th>他院等の記録</th></tr></thead><tbody>' +
        rows.map(function(p, i){
          var act = p.status === 'manual' ? '<button type="button" class="flu-btn danger btnDel" data-emp="' + esc(p.empNo) + '" data-name="' + esc(p.name) + '">取消</button>'
                  : (!p.vaccinated ? '<button type="button" class="flu-btn btnMark" data-emp="' + esc(p.empNo) + '" data-name="' + esc(p.name) + '">接種済みにする</button>' : '');
          var manual = p.manual ? (fmtDate(p.manual.vaccinatedAt) + (p.manual.place ? ' ' + p.manual.place : '') + (p.manual.note ? '（' + p.manual.note + '）' : '')) : '';
          return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(p.name) + '</b></td><td>' + esc(divTeam(p)) + '</td><td><span class="st ' + p.status + '">' + esc(p.statusLabel) + '</span></td><td>' + act + '</td>' +
            '<td>' + esc(p.empNo) + '</td><td>' + esc(p.kana) + '</td><td class="num">' + (p.age == null ? '' : p.age) + '</td><td>' + esc(fmtDate(p.checkupDate)) + '</td><td>' + esc(manual) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    function renderRoster(){
      var s = D.summary;
      var un = D.unlinked;
      $('p-roster').innerHTML = '<div class="flu-card"><h3>取込元について</h3><div class="flu-note">健診機関の「受診者名簿」（' + s.checkupDates.map(fmtDate).join('、') + '）を紙PDFから読み取り、インフルエンザ欄の○を「接種」として取り込みました。名簿 ' + s.rosterTotal + '人のうち ' + s.rosterLinked + '人を社員台帳に紐付け（生年月日＋フリガナで照合し、全件を目視確認済み）。残り ' + s.rosterUnlinked + '人は台帳に登録のない方（職員・他部署・退職者など）、' + s.rosterLinkedInactive + '人は台帳では在籍外のため対象から外しています。</div></div>' +
        '<div class="flu-card"><h3>社員台帳に見つからなかった受診者（' + un.length + '人）</h3><div class="tablewrap"><table class="flu"><thead><tr><th>#</th><th>健診日</th><th>個人ID</th><th>カナ氏名</th><th>生年月日</th><th>インフル</th></tr></thead><tbody>' +
        un.map(function(u, i){ return '<tr><td>' + (i + 1) + '</td><td>' + esc(fmtDate(u.checkupDate)) + '</td><td>' + esc(u.examineeId) + '</td><td>' + esc(u.kana) + '</td><td>' + esc(fmtDate(u.birth)) + '</td><td>' + (u.vaccinated ? '○' : '') + '</td></tr>'; }).join('') +
        '</tbody></table></div></div>';
    }

    // タブ
    $('tabs').addEventListener('click', function(e){ var b = e.target.closest('button'); if (!b) return; document.querySelectorAll('#tabs button').forEach(function(x){ x.classList.toggle('active', x === b); }); document.querySelectorAll('.flu-panel').forEach(function(p){ p.classList.toggle('active', p.id === 'p-' + b.dataset.tab); }); });
    // 絞り込み
    var lt = {};
    function onFilterInput(t){ filt[t.dataset.k].q = t.value; clearTimeout(lt[t.dataset.k]); lt[t.dataset.k] = setTimeout(function(){ renderList(t.dataset.k); }, 120); }
    document.addEventListener('input', function(e){ var t = e.target; if (t.classList.contains('lq') && !e.isComposing) onFilterInput(t); });
    document.addEventListener('compositionend', function(e){ var t = e.target; if (t.classList && t.classList.contains('lq')) onFilterInput(t); });
    document.addEventListener('change', function(e){ var t = e.target; if (t.classList.contains('ldiv')) { filt[t.dataset.k].div = t.value; renderList(t.dataset.k); } });
    // 行の操作
    document.addEventListener('click', function(e){
      var b = e.target.closest('.btnMark'); if (b) { openModal(b.dataset.emp, b.dataset.name); return; }
      var d = e.target.closest('.btnDel'); if (d) { if (!confirm(d.dataset.name + ' さんの「他院等で接種済み」の登録を取り消しますか？')) return;
        fetch(BASE + '/api/manual/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empNo: d.dataset.emp }) }).then(function(r){ return r.json(); }).then(function(j){ if (j.error) { alert(j.error); return; } load(); }); }
    });

    // モーダル
    var sel = null;
    function openModal(empNo, name){
      sel = null; $('mHits').innerHTML = ''; $('mSearch').value = ''; $('mDate').value = ''; $('mPlace').value = ''; $('mNote').value = ''; $('mSave').disabled = true;
      $('modalBg').classList.add('open');
      if (empNo) { $('mSearch').value = name || empNo; search(); } else { setTimeout(function(){ $('mSearch').focus(); }, 50); }
    }
    function closeModal(){ $('modalBg').classList.remove('open'); }
    var st;
    function search(){
      var q = $('mSearch').value.trim(); if (!q) { $('mHits').innerHTML = ''; return; }
      fetch(BASE + '/api/search?q=' + encodeURIComponent(q)).then(function(r){ return r.json(); }).then(function(j){
        if (!j.results.length) { $('mHits').innerHTML = '<div class="flu-note" style="padding:6px">該当する在籍社員がいません</div>'; return; }
        $('mHits').innerHTML = j.results.map(function(r){
          return '<div class="hit' + (sel && sel.empNo === r.empNo ? ' sel' : '') + '" data-emp="' + esc(r.empNo) + '" data-name="' + esc(r.name) + '"><span><b>' + esc(r.name) + '</b> <small>' + esc(r.kana) + '</small> <small style="color:#6b7280">' + esc(r.empNo) + ' ' + esc((r.division ? r.division + '課' : '') + (r.team ? ' ' + r.team + '班' : '')) + '</small></span>' +
            (r.vaccinated ? '<span class="st ' + (r.manual ? 'manual' : 'checkup') + '">接種済み</span>' : '<span class="st attended_no">未接種</span>') + '</div>';
        }).join('');
        if (j.results.length === 1 && !sel) pick(j.results[0].empNo, j.results[0].name);
      });
    }
    function pick(empNo, name){ sel = { empNo: empNo, name: name }; document.querySelectorAll('#mHits .hit').forEach(function(h){ h.classList.toggle('sel', h.dataset.emp === empNo); }); $('mSave').disabled = false; }
    $('mSearch').addEventListener('input', function(){ clearTimeout(st); st = setTimeout(search, 250); });
    $('mHits').addEventListener('click', function(e){ var h = e.target.closest('.hit'); if (h) pick(h.dataset.emp, h.dataset.name); });
    $('btnManual').addEventListener('click', function(){ openModal(); });
    $('mCancel').addEventListener('click', closeModal);
    $('modalBg').addEventListener('click', function(e){ if (e.target === $('modalBg')) closeModal(); });
    $('mSave').addEventListener('click', function(){
      if (!sel) return; $('mSave').disabled = true;
      fetch(BASE + '/api/manual', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ empNo: sel.empNo, vaccinatedAt: $('mDate').value, place: $('mPlace').value, note: $('mNote').value }) })
        .then(function(r){ return r.json(); }).then(function(j){ if (j.error) { alert(j.error); $('mSave').disabled = false; return; } closeModal(); load(); })
        .catch(function(){ alert('登録に失敗しました'); $('mSave').disabled = false; });
    });

    // Excel
    $('btnExcel').addEventListener('click', function(){
      if (!D || typeof XLSX === 'undefined') { alert('Excel 出力の準備ができていません。少し待ってからもう一度押してください'); return; }
      var s = D.summary; var wb = XLSX.utils.book_new();
      var sum = [['インフルエンザ予防接種 集計', s.seasonLabel, '', '作成日', fmtDate(s.asOf)], [],
        ['対象（在籍社員）', s.total], ['接種済み', s.vaccinated], ['　うち健診で○', s.checkup], ['　うち他院等（手動登録）', s.manual], ['未接種', s.unvaccinated], ['　うち健診は受診', s.attendedNo], ['　うち健診名簿なし', s.absent], ['接種率(%)', s.rate], [],
        ['課別', '対象', '接種済み', '未接種', '接種率(%)']].concat(s.byDivision.map(function(r){ return [r.label, r.total, r.vaccinated, r.total - r.vaccinated, r.rate]; }))
        .concat([[], ['班別', '対象', '接種済み', '未接種', '接種率(%)']]).concat(s.byTeam.map(function(r){ return [r.label, r.total, r.vaccinated, r.total - r.vaccinated, r.rate]; }))
        .concat([[], ['年代別', '対象', '接種済み', '未接種', '接種率(%)']]).concat(s.byAge.map(function(r){ return [r.label, r.total, r.vaccinated, r.total - r.vaccinated, r.rate]; }))
        .concat([[], ['健診日', '受診者', '○（接種）', '接種率(%)']]).concat(s.byCheckupDate.map(function(r){ return [fmtDate(r.date), r.attended, r.vaccinated, r.rate]; }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), '集計');
      var head = ['No', '社員番号', '氏名', 'フリガナ', '課', '班', '年齢', '状況', '健診日', '他院等 接種日', '他院等 場所', 'メモ'];
      var row = function(p, i){ return [i + 1, p.empNo, p.name, p.kana, p.division || '', p.team || '', p.age == null ? '' : p.age, p.statusLabel, fmtDate(p.checkupDate), p.manual ? fmtDate(p.manual.vaccinatedAt) : '', p.manual ? (p.manual.place || '') : '', p.manual ? (p.manual.note || '') : '']; };
      var mk = function(rows){ var ws = XLSX.utils.aoa_to_sheet([head].concat(rows.map(row))); ws['!cols'] = [4, 10, 16, 20, 4, 4, 5, 20, 11, 12, 16, 20].map(function(w){ return { wch: w }; }); return ws; };
      XLSX.utils.book_append_sheet(wb, mk(D.people.filter(function(p){ return !p.vaccinated; })), '未接種');
      XLSX.utils.book_append_sheet(wb, mk(D.people.filter(function(p){ return p.vaccinated; })), '接種済み');
      XLSX.utils.book_append_sheet(wb, mk(D.people), '全員');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No', '健診日', '個人ID', 'カナ氏名', '生年月日', 'インフル']].concat(D.unlinked.map(function(u, i){ return [i + 1, fmtDate(u.checkupDate), u.examineeId, u.kana, fmtDate(u.birth), u.vaccinated ? '○' : '']; }))), '台帳未登録の受診者');
      XLSX.writeFile(wb, 'インフルエンザ接種状況_' + s.asOf.replace(/-/g, '') + '.xlsx');
    });

    load();
  })();
  </script>`;
  return c.html(layout('インフルエンザ予防接種', content, 'kacho-mission'));
});

// ---------- 印刷（PDF 保存用）----------
app.get('/kacho-mission/flu/print', async (c) => {
  const list = c.req.query('list') ?? 'all';
  const div = c.req.query('div') ?? '';
  const { summary: s, people } = await loadAll(c.env.DB);
  let rows = people.filter((p) => (list === 'vac' ? p.vaccinated : list === 'unvac' ? !p.vaccinated : true));
  if (div) rows = rows.filter((p) => String(p.division ?? '') === div);
  const title = list === 'vac' ? '接種済みリスト' : list === 'unvac' ? '未接種リスト' : '接種状況 全員一覧';
  const fmt = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d.replace(/-/g, '/') : d ?? '');
  const tr = (p: FluPerson, i: number) => `<tr><td class="num">${i + 1}</td><td>${escHtml(p.empNo)}</td><td class="nm">${escHtml(p.name)}</td><td>${escHtml(p.kana)}</td><td>${p.division ? p.division + '課' : ''}${p.team ? ' ' + p.team + '班' : ''}</td><td class="num">${p.age ?? ''}</td><td>${escHtml(p.statusLabel)}</td><td>${fmt(p.checkupDate)}</td><td>${p.manual ? escHtml(`${fmt(p.manual.vaccinatedAt)} ${p.manual.place ?? ''}`.trim()) : ''}</td></tr>`;
  const sumTable = (label: string, arr: Array<{ label: string; total: number; vaccinated: number; rate: number }>) =>
    `<table class="s"><thead><tr><th>${label}</th><th>対象</th><th>接種済</th><th>未接種</th><th>接種率</th></tr></thead><tbody>${arr.map((r) => `<tr><td>${escHtml(r.label)}</td><td class="num">${r.total}</td><td class="num">${r.vaccinated}</td><td class="num">${r.total - r.vaccinated}</td><td class="num">${r.rate}%</td></tr>`).join('')}</tbody></table>`;
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>インフルエンザ予防接種 ${escHtml(title)}</title>
<style>
@page{size:A4;margin:12mm 10mm}
body{font-family:'Hiragino Sans','Hiragino Kaku Gothic ProN','Meiryo',sans-serif;color:#111;margin:0;font-size:10.5px}
h1{font-size:15px;margin:0 0 2px}.sub{font-size:10px;color:#444;margin-bottom:8px}
.tiles{display:flex;gap:8px;margin-bottom:8px}.tile{border:1px solid #999;border-radius:4px;padding:5px 10px;min-width:90px}.tile b{display:block;font-size:15px}.tile span{font-size:9px;color:#444}
.sums{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px}
table{border-collapse:collapse;width:100%}table.s{width:auto;min-width:200px}
th,td{border:1px solid #888;padding:2px 5px;text-align:left;font-size:9.5px;white-space:nowrap}th{background:#eee}
td.num,th.num{text-align:right}td.nm{font-weight:700}
thead{display:table-header-group}tr{page-break-inside:avoid}
.toolbar{position:fixed;top:8px;right:8px;background:#fff;border:1px solid #ccc;border-radius:6px;padding:6px 10px;font-size:12px}
@media print{.toolbar{display:none}}
</style></head><body>
<div class="toolbar">このページを印刷（PDF保存）: <button onclick="window.print()">印刷</button></div>
<h1>インフルエンザ予防接種 ${escHtml(title)}${div ? `（${escHtml(div)}課）` : ''}</h1>
<div class="sub">${escHtml(s.seasonLabel)} ／ 作成 ${fmt(s.asOf)} ／ 健診日 ${s.checkupDates.map(fmt).join('・')} ／ 国際自動車株式会社 城北 板橋営業所</div>
<div class="tiles"><div class="tile"><b>${s.total}</b><span>対象（在籍）</span></div><div class="tile"><b>${s.vaccinated}</b><span>接種済み（健診${s.checkup}＋他院${s.manual}）</span></div><div class="tile"><b>${s.unvaccinated}</b><span>未接種</span></div><div class="tile"><b>${s.rate}%</b><span>接種率</span></div></div>
${list === 'all' && !div ? `<div class="sums">${sumTable('課', s.byDivision)}${sumTable('班', s.byTeam)}${sumTable('年代', s.byAge)}</div>` : ''}
<table><thead><tr><th class="num">#</th><th>社員番号</th><th>氏名</th><th>フリガナ</th><th>課/班</th><th class="num">年齢</th><th>状況</th><th>健診日</th><th>他院等</th></tr></thead><tbody>${rows.map(tr).join('')}</tbody></table>
<div class="sub" style="margin-top:6px">${rows.length}人</div>
</body></html>`;
  return c.html(html);
});

export default app;
