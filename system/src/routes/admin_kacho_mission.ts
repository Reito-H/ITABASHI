// 課長ミッション: 労共契約アラート / 労供上申書 / 労供契約書作成依頼書 / nojico をまとめた入口。
import { Hono } from 'hono';
import { layout, escHtml, safeJson } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';
import { staffContractsPage, type ContractTargetRow } from '../html/staff_contracts';
import { todayIsoJST } from '../utils/accident_period';
import { getAdminPermissions } from '../permissions';
import {
  computeContractAlerts, upcomingRenewals, contractDateForBirthday, contractTypeForAge,
  LABOR_UNION_MIN_AGE, LABOR_UNION_MAX_AGE, type ContractEmp, type ContractAlert,
} from '../utils/contract_alerts';
import { XLSX_FILL_CLIENT_JS } from '../html/xlsx_fill_client';
import { JOSHINSHO_TEMPLATE_XLSX_B64 } from '../assets/joshinsho_template';
import { KEIYAKUSHO_TEMPLATE_XLSX_B64 } from '../assets/keiyakusho_template';
import { TENMATSUSHO_TEMPLATE_XLSX_B64 } from '../assets/tenmatsusho_template';
import { HANEDA_RIYUSHO_TEMPLATE_XLSX_B64 } from '../assets/haneda_riyusho_template';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

// ============ 労共契約データ（課フィルタ対応） ============
async function loadContractData(db: D1Database, todayIso: string, ka: string) {
  const conds = ['is_active = 1', "birth_date IS NOT NULL", "birth_date != ''"];
  const params: (string | number)[] = [];
  if (/^[1-4]$/.test(ka)) { conds.push('division = ?'); params.push(parseInt(ka)); }
  const empRows = await db.prepare(
    `SELECT id, emp_no, name, name_kana, division, team, birth_date, contract_type, is_active
       FROM employees WHERE ${conds.join(' AND ')}`
  ).bind(...params).all<ContractEmp>();
  const emps = empRows.results ?? [];

  const ackRows = await db.prepare('SELECT emp_id, contract_date FROM contract_renewal_acks')
    .all<{ emp_id: number; contract_date: string }>();
  const ackedKeys = new Set((ackRows.results ?? []).map(r => `${r.emp_id}:${r.contract_date}`));

  const alerts = computeContractAlerts(emps, todayIso, ackedKeys);
  const upcoming = upcomingRenewals(emps, todayIso, 12, ackedKeys);

  const [ty, tm, td] = todayIso.split('-').map(Number);
  const targets: ContractTargetRow[] = [];
  for (const e of emps) {
    if (!e.birth_date) continue;
    const mm = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.birth_date);
    if (!mm) continue;
    const by = +mm[1], bmo = +mm[2], bday = +mm[3];
    let age = ty - by;
    if (tm < bmo || (tm === bmo && td < bday)) age -= 1;
    if (age < LABOR_UNION_MIN_AGE - 1 || age > LABOR_UNION_MAX_AGE) continue;
    let nby = ty;
    if (tm > bmo || (tm === bmo && td >= bday)) nby = ty + 1;
    targets.push({
      id: e.id, emp_no: e.emp_no, name: e.name, division: e.division, team: e.team,
      birth_date: e.birth_date, ageNow: age,
      contractType: contractTypeForAge(age),
      nextBirthday: `${nby}-${String(bmo).padStart(2, '0')}-${String(bday).padStart(2, '0')}`,
      nextContractDate: contractDateForBirthday(nby, bmo, bday),
    });
  }
  targets.sort((a, b) => a.nextContractDate < b.nextContractDate ? -1 : a.nextContractDate > b.nextContractDate ? 1 : 0);
  return { alerts, upcoming, targets };
}

function readKaCookie(c: { req: { header: (n: string) => string | undefined } }): string {
  const m = /(?:^|;\s*)km_last_ka=([^;]+)/.exec(c.req.header('Cookie') ?? '');
  const v = m ? decodeURIComponent(m[1]) : '';
  return /^(all|[1-4])$/.test(v) ? v : 'all';
}

function subHeader(title: string, extra = ''): string {
  return `<div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:18px;flex-wrap:wrap;">
    <a href="${ADMIN_PATH}/kacho-mission" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 課長ミッション</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">${escHtml(title)}</h2>${extra}
  </div>`;
}

// ============ ランディング ============
app.get('/kacho-mission', async (c) => {
  const todayIso = todayIsoJST();
  let alertCount = 0;
  try {
    const { alerts } = await loadContractData(c.env.DB, todayIso, 'all');
    alertCount = alerts.filter((a: ContractAlert) => !a.acked).length;
  } catch { /* migration 未適用時 */ }

  const card = (href: string, title: string, badge = '') => `
    <a href="${href}" style="display:flex;align-items:center;justify-content:space-between;gap:10px;text-decoration:none;background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px 18px;box-shadow:0 1px 2px rgba(0,0,0,0.05);font-size:14px;font-weight:700;color:#1e3a5f;transition:border-color .15s,background .15s;" onmouseover="this.style.borderColor='#94a3b8';this.style.background='#f8fafc'" onmouseout="this.style.borderColor='#e5e7eb';this.style.background='#fff'">
      <span>${escHtml(title)}</span>${badge}
    </a>`;

  const badge = alertCount > 0
    ? `<span style="display:inline-block;min-width:18px;padding:1px 6px;border-radius:9px;background:#dc2626;color:#fff;font-size:11px;font-weight:800;">${alertCount}</span>`
    : '';

  // ドライバー報告は全権限アカウント（permissions IS NULL）専用。制限付きアカウントにはカードを出さない
  // （ページ/API 自体も PATH_PERMISSIONS 未登録で 403 になる）
  const isFullAccess = (await getAdminPermissions(c.env.DB, c.get('adminId'))) === null;

  const content = `
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;max-width:820px;">
    ${card(`${ADMIN_PATH}/kacho-mission/contracts`, '労共契約・契約更新アラート', badge)}
    ${card(`${ADMIN_PATH}/kacho-mission/joshinsho`, '労供上申書 作成')}
    ${card(`${ADMIN_PATH}/kacho-mission/keiyakusho`, '労供契約書作成依頼書 作成')}
    ${card(`${ADMIN_PATH}/kacho-mission/tenmatsusho`, '顛末書 作成')}
    ${card(`${ADMIN_PATH}/kacho-mission/haneda-riyusho`, '羽田定額適用外理由書 作成')}
    ${card(`${ADMIN_PATH}/kacho-mission/masters`, '課長マスタ')}
    ${isFullAccess ? card(`${ADMIN_PATH}/driver-reports`, 'ドライバー報告') : ''}
    ${card(`${ADMIN_PATH}/nojico`, 'nojico')}
  </div>`;
  return c.html(layout('課長ミッション', content, 'kacho-mission'));
});

// ============ 課長マスタ / 所長マスタ ============
app.get('/kacho-mission/masters', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, name, division, role FROM kacho_masters WHERE is_active = 1 ORDER BY sort_order, id'
  ).all<{ id: number; name: string; division: number | null; role: string | null }>().catch(
    () => ({ results: [] as { id: number; name: string; division: number | null; role: string | null }[] })
  );
  const list = rows.results ?? [];
  const shocho = list.find(r => r.role === '所長')?.name ?? '';
  const kachoByDiv: Record<number, string> = {};
  for (const r of list) if (r.role === '課長' && r.division) kachoByDiv[r.division] = r.name;
  const others = list.filter(r => r.role !== '所長' && !(r.role === '課長' && r.division));

  const inp = (id: string, val: string, ph = '') =>
    `<input id="${id}" value="${escHtml(val)}" placeholder="${escHtml(ph)}" style="border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;width:220px;">`;

  const content = subHeader('課長マスタ') + `
  <div style="max-width:640px;">
    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;margin-bottom:16px;">
      <h3 style="font-size:14px;font-weight:700;color:#1e3a5f;margin:0 0 4px;">所長マスタ</h3>
      <p style="font-size:12px;color:#6b7280;margin:0 0 12px;">板橋営業所の所長（1名）</p>
      <div style="display:flex;gap:8px;align-items:center;">
        <span style="font-size:13px;color:#374151;width:48px;">所長</span>
        ${inp('m-shocho', shocho, '例: 原　義夫')}
      </div>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;margin-bottom:16px;">
      <h3 style="font-size:14px;font-weight:700;color:#1e3a5f;margin:0 0 12px;">課長マスタ</h3>
      ${[1, 2, 3, 4].map(d => `
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;">
        <span style="font-size:13px;color:#374151;width:48px;">${d}課</span>
        ${inp('m-kacho-' + d, kachoByDiv[d] ?? '', '例: 柴村　昌幸')}
      </div>`).join('')}
    </div>

    <div style="display:flex;justify-content:flex-end;gap:10px;align-items:center;margin-bottom:24px;">
      <span id="m-msg" style="font-size:12px;color:#166534;"></span>
      <button id="m-save" onclick="mSave()" style="padding:9px 22px;background:#166534;color:white;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">保存</button>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3 style="font-size:14px;font-weight:700;color:#1e3a5f;margin:0;">その他（決裁者など）</h3>
        <button onclick="mAddOther()" style="padding:6px 12px;background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;border-radius:6px;font-size:12px;cursor:pointer;">＋追加</button>
      </div>
      <div id="m-others"></div>
    </div>
  </div>

  <script>
  var ADMIN_PATH = '${ADMIN_PATH}';
  var M_OTHERS = ${safeJson(others)};
  function mEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function mRenderOthers() {
    var el = document.getElementById('m-others');
    if (!M_OTHERS.length) { el.innerHTML = '<p style="font-size:12px;color:#9ca3af;margin:0;">なし</p>'; return; }
    el.innerHTML = M_OTHERS.map(function(o){
      return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;" data-id="'+o.id+'">' +
        '<input class="m-oname" value="'+mEsc(o.name)+'" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 9px;font-size:13px;width:200px;">' +
        '<input class="m-orole" value="'+mEsc(o.role||'')+'" placeholder="役割(任意)" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 9px;font-size:12px;width:120px;">' +
        '<button onclick="mSaveOther('+o.id+')" style="padding:5px 10px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;">更新</button>' +
        '<button onclick="mDelOther('+o.id+')" style="padding:5px 10px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:6px;font-size:12px;cursor:pointer;">削除</button>' +
      '</div>';
    }).join('');
  }
  async function mReload() {
    var j = await (await fetch('/api/kacho-mission/kacho-masters')).json();
    M_OTHERS = (j.kacho || []).filter(function(r){ return r.role !== '所長' && !(r.role === '課長' && r.division); });
    mRenderOthers();
  }
  async function mAddOther() {
    var name = prompt('氏名');
    if (!name || !name.trim()) return;
    var res = await fetch('/api/kacho-mission/kacho-masters', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: name.trim() }) });
    if (!res.ok) { alert('追加に失敗しました'); return; }
    await mReload();
  }
  async function mSaveOther(id) {
    var row = document.querySelector('#m-others [data-id="'+id+'"]');
    var res = await fetch('/api/kacho-mission/kacho-masters/'+id, {
      method:'PUT', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name: row.querySelector('.m-oname').value, role: row.querySelector('.m-orole').value })
    });
    if (!res.ok) { alert('更新に失敗しました'); return; }
    var b = document.getElementById('m-msg'); b.textContent = '更新しました'; setTimeout(function(){ b.textContent=''; }, 2000);
  }
  async function mDelOther(id) {
    if (!confirm('削除しますか？')) return;
    await fetch('/api/kacho-mission/kacho-masters/'+id, { method:'DELETE' });
    await mReload();
  }

  async function mSave() {
    var btn = document.getElementById('m-save'); btn.disabled = true;
    var payload = {
      shocho: document.getElementById('m-shocho').value.trim(),
      kacho: [1,2,3,4].map(function(d){ return { division: d, name: document.getElementById('m-kacho-'+d).value.trim() }; }).filter(function(x){ return x.name; })
    };
    try {
      var res = await fetch('/api/kacho-mission/kacho-masters/bulk', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      var m = document.getElementById('m-msg');
      m.textContent = res.ok ? '保存しました' : '保存に失敗しました';
      setTimeout(function(){ m.textContent=''; }, 2500);
    } catch (e) { alert('通信エラー'); }
    finally { btn.disabled = false; }
  }

  mRenderOthers();
  </script>`;
  return c.html(layout('課長マスタ', content, 'kacho-mission'));
});

// ============ 労共契約アラート ============
app.get('/kacho-mission/contracts', async (c) => {
  const todayIso = todayIsoJST();
  const qKa = c.req.query('ka');
  const ka = qKa && /^(all|[1-4])$/.test(qKa) ? qKa : readKaCookie(c);
  const { alerts, upcoming, targets } = await loadContractData(c.env.DB, todayIso, ka);
  const content = staffContractsPage({
    today: todayIso, alerts, upcoming, targets, ka,
    basePath: `${ADMIN_PATH}/kacho-mission/contracts`,
    backHref: `${ADMIN_PATH}/kacho-mission`, backLabel: '← 課長ミッション',
  });
  const res = c.html(layout('労共契約・契約更新アラート', content, 'kacho-mission'));
  res.headers.append('Set-Cookie', `km_last_ka=${encodeURIComponent(ka)}; Path=${ADMIN_PATH}; Max-Age=31536000; SameSite=Lax`);
  return res;
});

// ============ 労供上申書 作成 ============
app.get('/kacho-mission/joshinsho', async (c) => {
  const ka = readKaCookie(c);
  const kacho = await c.env.DB.prepare(
    'SELECT id, name, division, role FROM kacho_masters WHERE is_active = 1 ORDER BY sort_order, id'
  ).all().catch(() => ({ results: [] }));
  const emps = await c.env.DB.prepare(
    `SELECT e.id, e.emp_no, e.name, e.division, e.team, e.birth_date,
            COALESCE(jc.comment, '') AS last_comment
       FROM employees e
       LEFT JOIN joshinsho_comments jc ON jc.emp_id = e.id
      WHERE e.is_active = 1 AND e.birth_date IS NOT NULL AND e.birth_date != ''
      ORDER BY e.division, e.team, e.name`
  ).all<{ id: number; emp_no: string; name: string; division: number | null; team: number | null; birth_date: string; last_comment: string }>()
    .catch(() => ({ results: [] as { id: number; emp_no: string; name: string; division: number | null; team: number | null; birth_date: string; last_comment: string }[] }));
  // 労共対象（64〜75歳）だけに絞る
  const today = todayIsoJST();
  const [ty, tm, td] = today.split('-').map(Number);
  const cand = (emps.results ?? []).filter(e => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(e.birth_date);
    if (!m) return false;
    let age = ty - +m[1];
    if (tm < +m[2] || (tm === +m[2] && td < +m[3])) age -= 1;
    return age >= LABOR_UNION_MIN_AGE - 1 && age <= LABOR_UNION_MAX_AGE;
  });

  const content = subHeader('労供上申書 作成') + `
  <div style="max-width:1000px;">
    <p style="font-size:12px;color:#6b7280;line-height:1.7;margin:0 0 16px;">
      課・課長・提出日を選び、対象の乗務員にチェックを入れて「上申書を作成」を押すと、元の書式そのままの xlsx（1人1シート）がダウンロードされます。
      氏名・コード・生年月日・満年齢・入社日・勤続年数・契約期間・過去1年の事故/苦情件数を自動で埋めます。
      平均売上・平均乗務数は<strong>出力日の前月度を末とする直近6か月度（完了した月度のみ）</strong>で集計します（月の途中で出力しても乗務数がずれません）。
      課長コメントは前回入力した文章が自動で入り、そのまま or 編集して出力できます。健康状態・勤務態度・所長判定などの手書き欄は空欄のまま出力されます。
    </p>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;margin-bottom:16px;display:flex;gap:20px;flex-wrap:wrap;align-items:flex-end;">
      <label style="font-size:12px;color:#374151;">課
        <select id="j-ka" onchange="jRenderList();jPickKachoForKa()" style="display:block;margin-top:4px;border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;">
          <option value="all">全課</option><option value="1">1課</option><option value="2">2課</option><option value="3">3課</option><option value="4">4課</option>
        </select>
      </label>
      <label style="font-size:12px;color:#374151;">課長
        <span style="display:flex;gap:6px;margin-top:4px;">
          <select id="j-kacho" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;min-width:160px;"></select>
          <button type="button" onclick="jAddKacho()" style="padding:6px 10px;background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;border-radius:6px;font-size:12px;cursor:pointer;">＋追加</button>
          <button type="button" onclick="jDelKacho()" style="padding:6px 10px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:6px;font-size:12px;cursor:pointer;">削除</button>
        </span>
      </label>
      <label style="font-size:12px;color:#374151;">提出日
        <input type="date" id="j-date" style="display:block;margin-top:4px;border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;">
      </label>
      <label style="font-size:12px;color:#374151;">契約区分
        <select id="j-kind" style="display:block;margin-top:4px;border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;">
          <option value="再契約">再契約</option><option value="契約">契約（新規）</option>
        </select>
      </label>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:14px;">
      <div style="padding:8px 14px;background:#f9fafb;font-size:12px;color:#6b7280;display:flex;justify-content:space-between;align-items:center;">
        <span>対象乗務員（64〜75歳）</span>
        <label style="font-weight:600;"><input type="checkbox" id="j-all" onchange="jToggleAll(this.checked)"> 表示中を全選択</label>
      </div>
      <div style="max-height:420px;overflow-y:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><tbody id="j-rows"></tbody></table></div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:10px;align-items:center;">
      <span id="j-msg" style="font-size:12px;color:#6b7280;"></span>
      <button id="j-gen" onclick="jGenerate()" style="padding:9px 22px;background:#166534;color:white;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">上申書を作成（xlsx）</button>
    </div>
  </div>

  <script>
  var ADMIN_PATH = '${ADMIN_PATH}';
  var J_TPL_B64 = '${JOSHINSHO_TEMPLATE_XLSX_B64}';
  var J_CAND = ${safeJson(cand)};
  var J_KACHO = ${safeJson(kacho.results ?? [])};
  var J_DEFAULT_KA = ${safeJson(ka)};
  ${XLSX_FILL_CLIENT_JS}

  function jEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function jRenderKacho(sel) {
    var s = document.getElementById('j-kacho');
    s.innerHTML = J_KACHO.map(function(k){ return '<option value="'+jEsc(k.name)+'" data-id="'+k.id+'">'+jEsc(k.name)+(k.role?'（'+jEsc(k.role)+'）':'')+'</option>'; }).join('');
    if (sel) s.value = sel;
  }
  async function jReloadKacho(sel) {
    J_KACHO = (await (await fetch('/api/kacho-mission/kacho-masters')).json()).kacho || [];
    jRenderKacho(sel);
  }
  // 選択中の課の課長マスタがあれば課長プルダウンを自動選択
  function jPickKachoForKa() {
    var ka = document.getElementById('j-ka').value;
    if (!/^[1-4]$/.test(ka)) return;
    var m = J_KACHO.filter(function(k){ return k.role === '課長' && String(k.division) === ka; })[0];
    if (m) document.getElementById('j-kacho').value = m.name;
  }
  async function jAddKacho() {
    var name = prompt('追加する課長の氏名（例: 柴村　昌幸）');
    if (!name || !name.trim()) return;
    var res = await fetch('/api/kacho-mission/kacho-masters', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: name.trim() })
    });
    if (!res.ok) { alert('追加に失敗しました'); return; }
    await jReloadKacho(name.trim());
  }
  async function jDelKacho() {
    var s = document.getElementById('j-kacho');
    var opt = s.options[s.selectedIndex];
    if (!opt) return;
    var id = opt.getAttribute('data-id');
    if (!id) return;
    if (!confirm('課長「' + opt.value + '」を一覧から削除しますか？（過去に出力した書類は変わりません）')) return;
    var res = await fetch('/api/kacho-mission/kacho-masters/' + id, { method: 'DELETE' });
    if (!res.ok) { alert('削除に失敗しました'); return; }
    await jReloadKacho();
  }

  function jFiltered() {
    var ka = document.getElementById('j-ka').value;
    return J_CAND.filter(function(e){ return ka === 'all' || String(e.division) === ka; });
  }
  function jRenderList() {
    var rows = jFiltered().map(function(e){
      var hasCmt = e.last_comment ? ' ✎前回コメントあり' : '';
      return '<tr style="border-bottom:1px solid #f3f4f6;">' +
        '<td style="padding:6px 12px;width:34px;vertical-align:top;"><input type="checkbox" class="j-cb" value="'+e.id+'"></td>' +
        '<td style="padding:6px 12px;vertical-align:top;">' +
          '<div style="font-weight:600;">'+jEsc(e.name)+' <span style="color:#9ca3af;font-size:11px;">'+jEsc(e.emp_no)+'</span>' +
          '<span style="color:#6b7280;font-weight:400;font-size:11px;margin-left:8px;">'+(e.division?e.division+'課':'-')+(e.team?' '+e.team+'班':'')+' / '+jEsc(e.birth_date)+'</span>' +
          '<span style="color:#a16207;font-size:11px;margin-left:8px;">'+hasCmt+'</span></div>' +
          '<textarea class="j-cmt" data-id="'+e.id+'" rows="2" placeholder="課長コメント（前回の文章が入ります。空欄可）" ' +
            'style="width:100%;margin-top:4px;border:1px solid #e5e7eb;border-radius:6px;padding:5px 8px;font-size:12px;font-family:inherit;resize:vertical;">'+jEsc(e.last_comment||'')+'</textarea>' +
        '</td></tr>';
    }).join('');
    document.getElementById('j-rows').innerHTML = rows || '<tr><td style="padding:16px;color:#9ca3af;">対象がいません</td></tr>';
    document.getElementById('j-all').checked = false;
  }
  function jToggleAll(on){ document.querySelectorAll('.j-cb').forEach(function(cb){ cb.checked = on; }); }
  function jCommentFor(id){
    var t = document.querySelector('.j-cmt[data-id="'+id+'"]');
    return t ? t.value : '';
  }

  function jFmtName(name){ return String(name||'').replace(/\\u3000/g,' ').trim(); }

  async function jGenerate() {
    var ids = Array.prototype.slice.call(document.querySelectorAll('.j-cb:checked')).map(function(cb){ return +cb.value; });
    if (!ids.length) { alert('対象の乗務員を選んでください'); return; }
    var kacho = document.getElementById('j-kacho').value;
    if (!kacho) { alert('課長を選んでください'); return; }
    var submitDate = document.getElementById('j-date').value;
    var kind = document.getElementById('j-kind').value;
    var btn = document.getElementById('j-gen'); btn.disabled = true;
    var msg = document.getElementById('j-msg'); msg.textContent = 'データ取得中…';
    try {
      await xfLoadFflate();
      var qs = 'emp_ids=' + ids.join(',') + (submitDate ? '&submit_date=' + submitDate : '');
      var res = await fetch('/api/kacho-mission/joshinsho-data?' + qs);
      if (!res.ok) { throw new Error('データ取得に失敗しました'); }
      var people = (await res.json()).people || [];
      if (!people.length) { throw new Error('対象データがありません'); }
      msg.textContent = 'xlsx 生成中…';

      var tpl = window.fflate.unzipSync(xfB64ToU8(J_TPL_B64));
      var baseSheet = xfStripSheetRefs(xfDec(tpl['xl/worksheets/sheet1.xml']));
      var sheetXmls = [], names = [], cmtSave = [];
      people.forEach(function(p){
        var comment = jCommentFor(p.id);
        if (comment === '' && p.last_comment) comment = p.last_comment;
        cmtSave.push({ emp_id: p.id, comment: comment });
        var x = baseSheet;
        x = xfSetNum(x, 'H1', p.submit_serial);
        x = xfSetNum(x, 'H5', p.division);
        x = xfSetText(x, 'H6', kacho);
        x = xfSetText(x, 'E10', kind);
        x = xfSetText(x, 'C13', p.name);
        x = xfSetNum(x, 'H13', p.code_no);
        x = xfSetNum(x, 'D14', p.division);
        x = xfSetText(x, 'H14', p.work_style);
        x = xfSetText(x, 'C15', p.birth_jp);
        x = xfSetNum(x, 'G15', p.age);
        x = xfSetText(x, 'C16', p.hire_jp);
        x = xfSetNum(x, 'G16', p.tenure_years);
        x = xfSetText(x, 'C17', p.contract_start_jp);
        x = xfSetText(x, 'G17', p.contract_end_jp);
        x = xfSetText(x, 'C20', p.accident_text);
        x = xfSetText(x, 'C21', p.complaint_text);
        x = xfSetNum(x, 'E22', p.avg_sales);
        x = xfSetNum(x, 'H22', p.avg_rides);
        x = xfSetText(x, 'C26', comment);
        sheetXmls.push(x);
        names.push(jFmtName(p.name));
      });
      // 課長コメントを保存（次回流用）— 出力を止めない
      fetch('/api/kacho-mission/joshinsho-comments', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ comments: cmtSave })
      }).catch(function(){});

      var out = xfBuildWorkbook(tpl, sheetXmls, names);
      var ymd = (submitDate || new Date(Date.now()+9*3600*1000).toISOString().slice(0,10)).replace(/-/g,'');
      xfDownload(out, '労供上申書_' + ymd + '.xlsx');
      msg.textContent = people.length + '名ぶんを出力しました（課長コメントを保存）';
    } catch (e) {
      msg.textContent = ''; alert(e && e.message ? e.message : '作成に失敗しました');
    } finally { btn.disabled = false; }
  }

  (function jInit(){
    document.getElementById('j-ka').value = (J_DEFAULT_KA === 'all' || /^[1-4]$/.test(J_DEFAULT_KA)) ? J_DEFAULT_KA : 'all';
    document.getElementById('j-date').value = new Date(Date.now()+9*3600*1000).toISOString().slice(0,10);
    jRenderKacho();
    jPickKachoForKa();
    jRenderList();
  })();
  </script>`;
  return c.html(layout('労供上申書 作成', content, 'kacho-mission'));
});

// ============ 労供契約書作成依頼書 作成 ============
app.get('/kacho-mission/keiyakusho', async (c) => {
  const ka = readKaCookie(c);
  const kacho = await c.env.DB.prepare(
    'SELECT id, name, division, role FROM kacho_masters WHERE is_active = 1 ORDER BY sort_order, id'
  ).all().catch(() => ({ results: [] }));

  // 選べる月度: 直近 -1 〜 +12 ヶ月
  const today = todayIsoJST();
  const [ty, tm] = today.split('-').map(Number);
  const months: Array<{ y: number; m: number; label: string }> = [];
  for (let off = -1; off <= 12; off++) {
    const d = new Date(Date.UTC(ty, tm - 1 + off, 1));
    months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, label: `${d.getUTCFullYear()}年${d.getUTCMonth() + 1}月度（${d.getUTCFullYear()}/${d.getUTCMonth() + 1}/18 契約）` });
  }

  const content = subHeader('労供契約書作成依頼書 作成') + `
  <div style="max-width:1000px;">
    <p style="font-size:12px;color:#6b7280;line-height:1.7;margin:0 0 16px;">
      月度と課を選ぶと、その月に労共契約が更新される乗務員の一覧が出ます。所属労組・始業終業時間はここで入力（次回から保存された値が入ります）。
      「依頼書を作成」で元の書式そのままの xlsx（申請書シート1枚）がダウンロードされます。
    </p>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;margin-bottom:16px;display:flex;gap:20px;flex-wrap:wrap;align-items:flex-end;">
      <label style="font-size:12px;color:#374151;">月度
        <select id="k-month" onchange="kLoad()" style="display:block;margin-top:4px;border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;">
          ${months.map(mo => `<option value="${mo.y}-${mo.m}">${escHtml(mo.label)}</option>`).join('')}
        </select>
      </label>
      <label style="font-size:12px;color:#374151;">課
        <select id="k-ka" onchange="kLoad();kRenderKacho()" style="display:block;margin-top:4px;border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;">
          <option value="all">全課</option><option value="1">1課</option><option value="2">2課</option><option value="3">3課</option><option value="4">4課</option>
        </select>
      </label>
      <label style="font-size:12px;color:#374151;">申請者（課長）
        <span style="display:flex;gap:6px;margin-top:4px;">
          <select id="k-applicant" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;min-width:150px;"></select>
          <button type="button" onclick="kAddKacho()" style="padding:6px 10px;background:#eef2ff;color:#4338ca;border:1px solid #c7d2fe;border-radius:6px;font-size:12px;cursor:pointer;">＋追加</button>
          <button type="button" onclick="kDelKacho()" style="padding:6px 10px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:6px;font-size:12px;cursor:pointer;">削除</button>
        </span>
      </label>
      <label style="font-size:12px;color:#374151;">決裁者
        <select id="k-approver" style="display:block;margin-top:4px;border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;min-width:150px;"></select>
      </label>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:14px;">
      <div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:820px;">
        <thead style="background:#f9fafb;"><tr>
          <th style="padding:6px 8px;text-align:left;color:#6b7280;">出力</th>
          <th style="padding:6px 8px;text-align:left;color:#6b7280;">氏名 / コード</th>
          <th style="padding:6px 8px;text-align:left;color:#6b7280;">班</th>
          <th style="padding:6px 8px;text-align:left;color:#6b7280;">現/更新 契約</th>
          <th style="padding:6px 8px;text-align:left;color:#6b7280;">所属労組</th>
          <th style="padding:6px 8px;text-align:left;color:#6b7280;">始業</th>
          <th style="padding:6px 8px;text-align:left;color:#6b7280;">終業</th>
        </tr></thead>
        <tbody id="k-rows"></tbody>
      </table></div>
    </div>

    <div style="display:flex;justify-content:flex-end;gap:10px;align-items:center;">
      <span id="k-msg" style="font-size:12px;color:#6b7280;"></span>
      <button id="k-gen" onclick="kGenerate()" style="padding:9px 22px;background:#166534;color:white;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">依頼書を作成（xlsx）</button>
    </div>
  </div>

  <script>
  var ADMIN_PATH = '${ADMIN_PATH}';
  var K_TPL_B64 = '${KEIYAKUSHO_TEMPLATE_XLSX_B64}';
  var K_KACHO = ${safeJson(kacho.results ?? [])};
  var K_DEFAULT_KA = ${safeJson(ka)};
  var K_UNIONS = ['国労','Km国際','自交','ユニオン','城東','全国際'];
  var kRows = [];
  ${XLSX_FILL_CLIENT_JS}
  function kEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function kRenderKacho() {
    var opts = K_KACHO.map(function(k){ return '<option value="'+kEsc(k.name)+'" data-id="'+k.id+'">'+kEsc(k.name)+'</option>'; }).join('');
    document.getElementById('k-applicant').innerHTML = opts;
    document.getElementById('k-approver').innerHTML = '<option value=""></option>' + opts;
    // 決裁者は所長を既定に
    var sh = K_KACHO.filter(function(k){ return k.role === '所長'; })[0];
    if (sh) document.getElementById('k-approver').value = sh.name;
    // 申請者は選択中の課の課長を既定に
    var ka = document.getElementById('k-ka').value;
    if (/^[1-4]$/.test(ka)) {
      var kc = K_KACHO.filter(function(k){ return k.role === '課長' && String(k.division) === ka; })[0];
      if (kc) document.getElementById('k-applicant').value = kc.name;
    }
  }
  async function kReload(){ K_KACHO = (await (await fetch('/api/kacho-mission/kacho-masters')).json()).kacho || []; kRenderKacho(); }
  async function kAddKacho() {
    var name = prompt('追加する課長の氏名');
    if (!name || !name.trim()) return;
    var res = await fetch('/api/kacho-mission/kacho-masters', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name: name.trim() }) });
    if (!res.ok) { alert('追加に失敗しました'); return; }
    await kReload(); document.getElementById('k-applicant').value = name.trim();
  }
  async function kDelKacho() {
    var s = document.getElementById('k-applicant');
    var opt = s.options[s.selectedIndex];
    if (!opt || !opt.getAttribute('data-id')) return;
    if (!confirm('課長「' + opt.value + '」を一覧から削除しますか？')) return;
    var res = await fetch('/api/kacho-mission/kacho-masters/' + opt.getAttribute('data-id'), { method:'DELETE' });
    if (!res.ok) { alert('削除に失敗しました'); return; }
    await kReload();
  }

  function kUnionSelect(val){
    return '<select class="k-union" style="border:1px solid #d1d5db;border-radius:4px;padding:3px 6px;font-size:12px;">' +
      '<option value=""></option>' + K_UNIONS.map(function(u){ return '<option value="'+u+'"'+(u===val?' selected':'')+'>'+u+'</option>'; }).join('') + '</select>';
  }
  function kNumInput(cls, val){ return '<input type="number" class="'+cls+'" value="'+(val===0||val?val:'')+'" min="0" max="59" style="width:44px;border:1px solid #d1d5db;border-radius:4px;padding:3px 4px;font-size:12px;">'; }

  async function kLoad() {
    var mv = document.getElementById('k-month').value.split('-');
    var ka = document.getElementById('k-ka').value;
    document.getElementById('k-msg').textContent = '読み込み中…';
    var res = await fetch('/api/kacho-mission/keiyakusho-data?year='+mv[0]+'&month='+mv[1]+'&ka='+ka);
    var j = await res.json();
    kRows = j.rows || [];
    document.getElementById('k-msg').textContent = kRows.length + '名';
    document.getElementById('k-rows').innerHTML = kRows.map(function(r, i){
      return '<tr data-i="'+i+'" style="border-bottom:1px solid #f3f4f6;">' +
        '<td style="padding:5px 8px;"><input type="checkbox" class="k-cb" checked></td>' +
        '<td style="padding:5px 8px;font-weight:600;">'+kEsc(r.name)+' <span style="color:#9ca3af;font-size:10px;">'+kEsc(r.emp_no)+'</span></td>' +
        '<td style="padding:5px 8px;color:#6b7280;">'+(r.division?r.division+'課':'')+(r.team?' '+r.team+'班':'')+'</td>' +
        '<td style="padding:5px 8px;">'+
          '<select class="k-cn" style="border:1px solid #d1d5db;border-radius:4px;padding:2px 4px;font-size:12px;"><option'+(r.contract_now==='フル'?' selected':'')+'>フル</option><option'+(r.contract_now==='短'?' selected':'')+'>短</option></select>'+
          ' / '+
          '<select class="k-cx" style="border:1px solid #d1d5db;border-radius:4px;padding:2px 4px;font-size:12px;"><option'+(r.contract_next==='フル'?' selected':'')+'>フル</option><option'+(r.contract_next==='短'?' selected':'')+'>短</option></select>'+
        '</td>' +
        '<td style="padding:5px 8px;">'+kUnionSelect(r.union_name)+'</td>' +
        '<td style="padding:5px 8px;white-space:nowrap;">'+kNumInput('k-sh', r.start_hh)+' : '+kNumInput('k-sm', r.start_mm)+'</td>' +
        '<td style="padding:5px 8px;white-space:nowrap;">'+kNumInput('k-eh', r.end_hh)+' : '+kNumInput('k-em', r.end_mm)+'</td>' +
      '</tr>';
    }).join('') || '<tr><td colspan="7" style="padding:16px;color:#9ca3af;">この月度に更新する乗務員はいません</td></tr>';
  }

  function kCollect() {
    var out = [];
    document.querySelectorAll('#k-rows tr[data-i]').forEach(function(tr){
      if (!tr.querySelector('.k-cb').checked) return;
      var r = kRows[+tr.dataset.i];
      var g = function(sel){ var el = tr.querySelector(sel); return el ? el.value : ''; };
      out.push(Object.assign({}, r, {
        contract_now: g('.k-cn'), contract_next: g('.k-cx'), union_name: g('.k-union'),
        start_hh: g('.k-sh'), start_mm: g('.k-sm'), end_hh: g('.k-eh'), end_mm: g('.k-em')
      }));
    });
    return out;
  }

  async function kGenerate() {
    var rows = kCollect();
    if (!rows.length) { alert('出力対象がありません'); return; }
    var mv = document.getElementById('k-month').value.split('-');
    var year = +mv[0], month = +mv[1];
    var applicant = document.getElementById('k-applicant').value;
    var approver = document.getElementById('k-approver').value;
    var btn = document.getElementById('k-gen'); btn.disabled = true;
    var msg = document.getElementById('k-msg'); msg.textContent = 'xlsx 生成中…';
    try {
      await xfLoadFflate();
      // 労組・時間をマスタへ保存（次回のため）
      rows.forEach(function(r){
        fetch('/api/kacho-mission/labor-supply-info', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ emp_id: r.id, union_name: r.union_name || null,
            start_hh: r.start_hh===''?null:+r.start_hh, start_mm: r.start_mm===''?null:+r.start_mm,
            end_hh: r.end_hh===''?null:+r.end_hh, end_mm: r.end_mm===''?null:+r.end_mm })
        }).catch(function(){});
      });

      var tpl = window.fflate.unzipSync(xfB64ToU8(K_TPL_B64));
      var x = xfStripSheetRefs(xfDec(tpl['xl/worksheets/sheet1.xml']));
      var era = year - 2018;
      x = xfSetText(x, 'A1', '令和' + era + '年' + month + '月18日契約　労供契約書作成依頼書');
      rows.forEach(function(r, idx){
        var row = 4 + idx;
        if (row > 22) return;
        x = xfSetText(x, 'A' + row, '板橋');
        x = xfSetNum(x, 'B' + row, r.team);
        x = xfSetNum(x, 'C' + row, r.code_no);
        x = xfSetText(x, 'D' + row, r.name);
        x = xfSetText(x, 'E' + row, r.contract_now);
        x = xfSetText(x, 'F' + row, r.contract_next);
        x = xfSetText(x, 'G' + row, r.union_name);
        if (r.start_hh !== '') x = xfSetNum(x, 'H' + row, +r.start_hh);
        if (r.start_mm !== '') x = xfSetNum(x, 'J' + row, +r.start_mm);
        if (r.end_hh !== '') x = xfSetNum(x, 'L' + row, +r.end_hh);
        if (r.end_mm !== '') x = xfSetNum(x, 'N' + row, +r.end_mm);
      });
      if (approver) x = xfSetText(x, 'G26', approver);
      if (applicant) x = xfSetText(x, 'G28', applicant);

      var out = xfBuildWorkbook(tpl, [x], ['申請書']);
      xfDownload(out, '労供契約書作成依頼書_' + year + '_' + ('0'+month).slice(-2) + '.xlsx');
      msg.textContent = rows.length + '名ぶんを出力しました';
    } catch (e) {
      msg.textContent = ''; alert(e && e.message ? e.message : '作成に失敗しました');
    } finally { btn.disabled = false; }
  }

  (function kInit(){
    document.getElementById('k-ka').value = (K_DEFAULT_KA==='all'||/^[1-4]$/.test(K_DEFAULT_KA)) ? K_DEFAULT_KA : 'all';
    var msel = document.getElementById('k-month');
    if (msel.options.length > 2) msel.selectedIndex = 2; // 翌月度を既定に（一覧は -1,0,+1... の順）
    kRenderKacho();
    kLoad();
  })();
  </script>`;
  return c.html(layout('労供契約書作成依頼書 作成', content, 'kacho-mission'));
});

// ============ 帳票フォーム共通: 乗務員セレクト + 課長マスタ ============
function formPageShell(opts: {
  title: string;
  tplVar: string;
  tplB64: string;
  bodyHtml: string;
  scriptBody: string;
  kacho: unknown[];
}): string {
  return subHeader(opts.title) + `
  <style>
    #f-emp-box{position:relative;}
    #f-emp-dd{position:absolute;z-index:20;left:0;right:0;top:calc(100% + 2px);background:#fff;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.12);max-height:280px;overflow-y:auto;display:none;}
    #f-emp-dd.open{display:block;}
    #f-emp-dd .it{padding:8px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid #f3f4f6;}
    #f-emp-dd .it:hover,#f-emp-dd .it.hl{background:#eff6ff;}
    #f-emp-dd .it .sub{font-size:11px;color:#6b7280;margin-top:1px;}
  </style>
  <div style="max-width:960px;">
    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">
      <label style="font-size:12px;color:#374151;" id="f-emp-box">乗務員を検索（氏名・フリガナ・社員番号）
        <input id="f-emp-q" type="text" autocomplete="off" placeholder="例：山田 / ヤマダ / 00012345" style="display:block;margin-top:4px;border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;width:300px;">
        <div id="f-emp-dd"></div>
      </label>
      <div style="font-size:12px;color:#6b7280;">
        自動入力：<span id="f-emp-info" style="font-weight:700;color:#1e3a5f;">未選択（＝空欄で作成）</span>
        <button type="button" id="f-emp-clear" style="margin-left:8px;padding:3px 8px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:5px;font-size:11px;cursor:pointer;display:none;">クリア</button>
      </div>
    </div>

    ${opts.bodyHtml}

    <div style="display:flex;justify-content:flex-end;gap:10px;align-items:center;margin-top:16px;">
      <span id="f-msg" style="font-size:12px;color:#6b7280;"></span>
      <button id="f-gen" style="padding:9px 22px;background:#166534;color:white;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">Excelを作成（xlsx）</button>
    </div>
    <p style="font-size:11px;color:#9ca3af;margin-top:10px;line-height:1.7;">
      元の帳票の書式・罫線・結合セル・印刷設定をそのまま保持し、入力した値だけを差し込みます。
      乗務員を選ばず、各欄も空のまま作成すれば「空欄の帳票」がそのまま出力できます。
    </p>
  </div>

  <script>
  var ADMIN_PATH = '${ADMIN_PATH}';
  var ${opts.tplVar} = '${opts.tplB64}';
  var F_KACHO = ${safeJson(opts.kacho)};
  var F_SELECTED = null;      // 選択中の乗務員（null = 空欄で作成）
  var F_HITS = [];            // 直近の検索結果
  ${XLSX_FILL_CLIENT_JS}
  function fEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function fVal(id){ var el = document.getElementById(id); return el ? String(el.value||'').trim() : ''; }
  function fName(s){ return String(s||'').replace(/\\u3000/g,' ').trim(); }
  function fKachoOptions(sel, withBlank){
    var opts = (withBlank ? '<option value=""></option>' : '') +
      F_KACHO.map(function(k){ return '<option value="'+fEsc(k.name)+'" data-role="'+fEsc(k.role||'')+'" data-div="'+(k.division||'')+'">'+fEsc(k.name)+(k.role?'（'+fEsc(k.role)+'）':'')+'</option>'; }).join('');
    sel.innerHTML = opts;
  }
  function fCurEmp(){ return F_SELECTED; }
  function fSetEmp(e){
    F_SELECTED = e || null;
    var info = document.getElementById('f-emp-info');
    var clr = document.getElementById('f-emp-clear');
    if (!e){ info.textContent = '未選択（＝空欄で作成）'; clr.style.display = 'none'; return; }
    info.textContent = e.name + ' / ' + (e.division?e.division+'課':'-') + (e.team?' '+e.team+'班':'') + ' / コード ' + e.emp_no;
    clr.style.display = '';
    if (typeof fAfterEmpChange === 'function') fAfterEmpChange(e);
  }
  var _fEmpTimer = null, _fEmpHl = -1;
  function fRenderDD(){
    var dd = document.getElementById('f-emp-dd');
    if (!F_HITS.length){ dd.innerHTML = '<div class="it" style="color:#9ca3af;cursor:default;">該当なし</div>'; dd.classList.add('open'); return; }
    dd.innerHTML = F_HITS.map(function(e, i){
      return '<div class="it'+(i===_fEmpHl?' hl':'')+'" data-i="'+i+'">'+fEsc(e.name)+
        '<div class="sub">'+fEsc(e.emp_no)+' ／ '+(e.division?e.division+'課':'-')+(e.team?' '+e.team+'班':'')+(e.name_kana?' ／ '+fEsc(e.name_kana):'')+'</div></div>';
    }).join('');
    dd.classList.add('open');
    dd.querySelectorAll('.it[data-i]').forEach(function(it){
      it.addEventListener('click', function(){
        fSetEmp(F_HITS[+it.getAttribute('data-i')]);
        dd.classList.remove('open');
        document.getElementById('f-emp-q').value = F_SELECTED.name;
      });
    });
  }
  function fEmpSearch(){
    var q = fVal('f-emp-q');
    var dd = document.getElementById('f-emp-dd');
    if (_fEmpTimer) clearTimeout(_fEmpTimer);
    if (q.length < 1){ dd.classList.remove('open'); F_HITS = []; return; }
    _fEmpTimer = setTimeout(function(){
      fetch('/api/kacho-mission/employees?q=' + encodeURIComponent(q))
        .then(function(r){ return r.json(); })
        .then(function(j){ F_HITS = j.employees || []; _fEmpHl = -1; fRenderDD(); })
        .catch(function(){ F_HITS = []; });
    }, 180);
  }
  (async function fInit(){
    var qi = document.getElementById('f-emp-q');
    qi.addEventListener('input', fEmpSearch);
    qi.addEventListener('focus', function(){ if (F_HITS.length) document.getElementById('f-emp-dd').classList.add('open'); });
    qi.addEventListener('keydown', function(ev){
      var dd = document.getElementById('f-emp-dd');
      if (!dd.classList.contains('open')) return;
      if (ev.key === 'ArrowDown'){ _fEmpHl = Math.min(_fEmpHl + 1, F_HITS.length - 1); fRenderDD(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp'){ _fEmpHl = Math.max(_fEmpHl - 1, 0); fRenderDD(); ev.preventDefault(); }
      else if (ev.key === 'Enter' && _fEmpHl >= 0 && F_HITS[_fEmpHl]){ fSetEmp(F_HITS[_fEmpHl]); dd.classList.remove('open'); qi.value = F_SELECTED.name; ev.preventDefault(); }
      else if (ev.key === 'Escape'){ dd.classList.remove('open'); }
    });
    document.getElementById('f-emp-clear').addEventListener('click', function(){ fSetEmp(null); document.getElementById('f-emp-q').value = ''; });
    document.addEventListener('click', function(ev){ if (!ev.target.closest('#f-emp-box')) document.getElementById('f-emp-dd').classList.remove('open'); });
    if (typeof fPageInit === 'function') fPageInit();
    document.getElementById('f-gen').addEventListener('click', fGenerate);
  })();

  ${opts.scriptBody}
  </script>`;
}

// ============ 顛末書 作成 ============
app.get('/kacho-mission/tenmatsusho', async (c) => {
  const kacho = await c.env.DB.prepare(
    'SELECT id, name, division, role FROM kacho_masters WHERE is_active = 1 ORDER BY sort_order, id'
  ).all().catch(() => ({ results: [] }));

  const fld = (label: string, inner: string) =>
    `<label style="font-size:12px;color:#374151;display:block;">${label}<span style="display:block;margin-top:3px;">${inner}</span></label>`;
  const inp = (id: string, ph = '', w = '160px') =>
    `<input id="${id}" placeholder="${escHtml(ph)}" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 9px;font-size:13px;width:${w};">`;

  const bodyHtml = `
  <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;">
    <h3 style="font-size:13px;font-weight:700;color:#1e3a5f;margin:0 0 12px;">宛先・提出日</h3>
    <div style="display:flex;gap:16px;flex-wrap:wrap;">
      ${fld('宛先（殿）', `<select id="t-atesaki" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;min-width:180px;"></select>`)}
      ${fld('提出日', `<input type="date" id="t-date" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;">`)}
    </div>

    <h3 style="font-size:13px;font-weight:700;color:#1e3a5f;margin:18px 0 12px;">発生状況</h3>
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">
      ${fld('発生日', `<input type="date" id="t-hdate" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;"> <span id="t-week" style="font-size:12px;color:#6b7280;"></span>`)}
      ${fld('午前 / 午後', `<select id="t-ampm" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;"><option value="">-</option><option>午前</option><option>午後</option></select>`)}
      ${fld('時', inp('t-hh', '', '70px'))}
      ${fld('分', inp('t-mm', '', '70px'))}
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;">
      ${fld('発生場所', inp('t-place', '', '340px'))}
      ${fld('件名', inp('t-subject', '', '340px'))}
      ${fld('コールサイン', inp('t-callsign', '', '140px'))}
    </div>

    <h3 style="font-size:13px;font-weight:700;color:#1e3a5f;margin:18px 0 12px;">本文（記）</h3>
    <textarea id="t-body" rows="6" placeholder="※空欄可。長文は出力後にExcel側で行を調整してください。" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;resize:vertical;"></textarea>

    <h3 style="font-size:13px;font-weight:700;color:#1e3a5f;margin:18px 0 12px;">所見および処置等</h3>
    <textarea id="t-shoken" rows="3" placeholder="※空欄可" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;resize:vertical;"></textarea>
    <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;">
      ${fld('事業所責任者', `<select id="t-sekinin" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;min-width:160px;"></select>`)}
      ${fld('運行管理者', `<select id="t-unko" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;min-width:160px;"></select>`)}
    </div>
  </div>`;

  const scriptBody = `
  function fPageInit(){
    fKachoOptions(document.getElementById('t-atesaki'), true);
    fKachoOptions(document.getElementById('t-sekinin'), true);
    fKachoOptions(document.getElementById('t-unko'), true);
    // 宛先の既定は所長
    var sh = F_KACHO.filter(function(k){ return k.role === '所長'; })[0];
    if (sh) document.getElementById('t-atesaki').value = sh.name;
    if (sh) document.getElementById('t-sekinin').value = sh.name;
    document.getElementById('t-date').value = new Date(Date.now()+9*3600*1000).toISOString().slice(0,10);
    var hd = document.getElementById('t-hdate');
    hd.addEventListener('change', function(){
      var w = ['日','月','火','水','木','金','土'];
      var d = hd.value ? new Date(hd.value+'T00:00:00+09:00') : null;
      document.getElementById('t-week').textContent = d ? '（'+w[d.getDay()]+'）' : '';
    });
  }
  function fAfterEmpChange(e){
    // 選択中の課の課長を事業所責任者候補に…はしない（所長固定）。ここでは何もしない。
  }
  async function fGenerate(){
    var btn = document.getElementById('f-gen'); btn.disabled = true;
    var msg = document.getElementById('f-msg'); msg.textContent = 'xlsx 生成中…';
    try {
      await xfLoadFflate();
      var tpl = window.fflate.unzipSync(xfB64ToU8(TENMATSUSHO_TPL_B64));
      var x = xfStripSheetRefs(xfDec(tpl['xl/worksheets/sheet1.xml']));
      var e = fCurEmp();
      // 宛先・提出日
      x = xfSetText(x, 'A5', fVal('t-atesaki'));
      var sd = fVal('t-date');
      if (sd){ var p = sd.split('-'); x = xfSetNum(x,'P2',+p[0]); x = xfSetNum(x,'S2',+p[1]); x = xfSetNum(x,'U2',+p[2]); }
      // 所属・氏名・コード
      if (e){
        x = xfSetNum(x, 'P5', e.division || '');
        x = xfSetNum(x, 'T5', e.team || '');
        x = xfSetText(x, 'P6', e.name || '');
        x = xfSetText(x, 'P7', e.emp_no || '');
      }
      // 発生状況
      var hd = fVal('t-hdate');
      if (hd){ var q = hd.split('-'); x = xfSetNum(x,'E13',+q[0]); x = xfSetNum(x,'H13',+q[1]); x = xfSetNum(x,'J13',+q[2]);
        var w = ['日','月','火','水','木','金','土']; var dd = new Date(hd+'T00:00:00+09:00');
        x = xfSetText(x,'M13', w[dd.getDay()]);
      }
      var ampm = fVal('t-ampm');
      if (ampm) x = xfSetText(x, 'P13', ampm);   // 「午前 午後」欄を選択側だけに
      x = xfSetText(x, 'R13', fVal('t-hh'));
      x = xfSetText(x, 'T13', fVal('t-mm'));
      x = xfSetText(x, 'E14', fVal('t-place'));
      x = xfSetText(x, 'E15', fVal('t-subject'));
      x = xfSetText(x, 'S15', fVal('t-callsign'));
      x = xfSetText(x, 'A20', fVal('t-body'));
      x = xfSetText(x, 'A32', fVal('t-shoken'));
      x = xfSetText(x, 'S32', fVal('t-sekinin'));
      x = xfSetText(x, 'U32', fVal('t-unko'));

      var out = xfBuildWorkbook(tpl, [x], ['顛末書']);
      var nm = e ? fName(e.name) : '空欄';
      xfDownload(out, '顛末書_' + nm + '_' + (sd||'').replace(/-/g,'') + '.xlsx');
      msg.textContent = '出力しました';
    } catch (err) {
      msg.textContent = ''; alert(err && err.message ? err.message : '作成に失敗しました');
    } finally { btn.disabled = false; }
  }`;

  const content = formPageShell({
    title: '顛末書 作成', tplVar: 'TENMATSUSHO_TPL_B64', tplB64: TENMATSUSHO_TEMPLATE_XLSX_B64,
    bodyHtml, scriptBody, kacho: kacho.results ?? [],
  });
  return c.html(layout('顛末書 作成', content, 'kacho-mission'));
});

// ============ 羽田定額適用外理由書 作成 ============
app.get('/kacho-mission/haneda-riyusho', async (c) => {
  const kacho = await c.env.DB.prepare(
    'SELECT id, name, division, role FROM kacho_masters WHERE is_active = 1 ORDER BY sort_order, id'
  ).all().catch(() => ({ results: [] }));

  const fld = (label: string, inner: string) =>
    `<label style="font-size:12px;color:#374151;display:block;">${label}<span style="display:block;margin-top:3px;">${inner}</span></label>`;
  const inp = (id: string, ph = '', w = '150px') =>
    `<input id="${id}" placeholder="${escHtml(ph)}" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 9px;font-size:13px;width:${w};">`;
  const sel = (id: string, opts: string[], w = '150px') =>
    `<select id="${id}" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;width:${w};"><option value=""></option>${opts.map(o => `<option>${escHtml(o)}</option>`).join('')}</select>`;

  const bodyHtml = `
  <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;">
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">
      ${fld('営業所', inp('h-office', '板橋', '120px'))}
      ${fld('作成日', `<input type="date" id="h-date" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;">`)}
    </div>

    <h3 style="font-size:13px;font-weight:700;color:#1e3a5f;margin:18px 0 12px;">乗車情報</h3>
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;">
      ${fld('乗車日', `<input type="date" id="h-ridedate" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;">`)}
      ${fld('車両番号', inp('h-car', '', '120px'))}
      ${fld('乗車時刻', `${inp('h-onhh', '時', '60px')} : ${inp('h-onmm', '分', '60px')}`)}
      ${fld('降車時刻', `${inp('h-offhh', '時', '60px')} : ${inp('h-offmm', '分', '60px')}`)}
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-top:12px;">
      ${fld('乗車地（ターミナル）', sel('h-term', ['T1', 'T2', 'T3'], '90px'))}
      ${fld('降車地', inp('h-off', '', '260px'))}
      ${fld('乗車人数', inp('h-pax', '', '70px'))}
    </div>
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-top:12px;">
      ${fld('配車区分', sel('h-haisha', ['無線配車', '定額乗場'], '120px'))}
      ${fld('乗客の国籍', sel('h-koku', ['日本人', '外国人', '不明'], '110px'))}
      ${fld('日本語', sel('h-nihongo', ['可', '不可'], '90px'))}
    </div>

    <h3 style="font-size:13px;font-weight:700;color:#1e3a5f;margin:18px 0 12px;">適用外理由（該当にチェック）</h3>
    <div style="display:flex;flex-direction:column;gap:8px;font-size:13px;color:#374151;">
      <label><input type="checkbox" id="h-r1"> 高速道路利用なし</label>
      <label><input type="checkbox" id="h-r2"> 羽田タクシー乗場以外から乗車</label>
      <label style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><input type="checkbox" id="h-r3"> 経由地あり（定額範囲外）　経由地：${inp('h-keiyu', '', '240px')}</label>
      <label><input type="checkbox" id="h-r4"> その他</label>
    </div>
    <textarea id="h-other" rows="4" placeholder="その他（自由記入・空欄可）" style="width:100%;margin-top:10px;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;font-family:inherit;resize:vertical;"></textarea>

    <h3 style="font-size:13px;font-weight:700;color:#1e3a5f;margin:18px 0 12px;">確認</h3>
    <div style="display:flex;gap:16px;flex-wrap:wrap;">
      ${fld('課長', `<select id="h-kacho" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;min-width:160px;"></select>`)}
      ${fld('確認者', `<select id="h-checker" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;min-width:160px;"></select>`)}
    </div>
  </div>`;

  const scriptBody = `
  function fPageInit(){
    fKachoOptions(document.getElementById('h-kacho'), true);
    fKachoOptions(document.getElementById('h-checker'), true);
    document.getElementById('h-date').value = new Date(Date.now()+9*3600*1000).toISOString().slice(0,10);
    document.getElementById('h-office').value = '板橋';
  }
  function fAfterEmpChange(e){
    // 選択中の課の課長マスタを既定選択
    var kc = F_KACHO.filter(function(k){ return k.role === '課長' && String(k.division) === String(e.division); })[0];
    if (kc) document.getElementById('h-kacho').value = kc.name;
  }
  function fMark(text, pick){
    // "A ・ B ・ C" のうち pick を 【】 で囲む
    if (!pick) return text;
    return text.split('・').map(function(seg){
      return seg.indexOf(pick) >= 0 ? seg.replace(pick, '【'+pick+'】') : seg;
    }).join('・');
  }
  async function fGenerate(){
    var btn = document.getElementById('f-gen'); btn.disabled = true;
    var msg = document.getElementById('f-msg'); msg.textContent = 'xlsx 生成中…';
    try {
      await xfLoadFflate();
      var tpl = window.fflate.unzipSync(xfB64ToU8(HANEDA_TPL_B64));
      var x = xfStripSheetRefs(xfDec(tpl['xl/worksheets/sheet1.xml']));
      var e = fCurEmp();
      x = xfSetText(x, 'H3', fVal('h-office'));
      if (e){
        x = xfSetNum(x, 'D5', e.division || '');
        x = xfSetNum(x, 'N5', e.team || '');
        x = xfSetText(x, 'I7', e.emp_no || '');
        x = xfSetText(x, 'AC7', e.name || '');
      }
      var cd = fVal('h-date');
      if (cd){ var p = cd.split('-'); x = xfSetNum(x,'W5', +p[0]%100); x = xfSetNum(x,'AB5', +p[1]); x = xfSetNum(x,'AF5', +p[2]); }
      var rd = fVal('h-ridedate');
      if (rd){ var q = rd.split('-'); x = xfSetNum(x,'K8', +q[0]%100); x = xfSetNum(x,'O8', +q[1]); x = xfSetNum(x,'R8', +q[2]);
        var w = ['日','月','火','水','木','金','土']; x = xfSetText(x,'U8', w[new Date(rd+'T00:00:00+09:00').getDay()]);
      }
      x = xfSetText(x, 'AG8', fVal('h-car'));
      x = xfSetText(x, 'J9', fVal('h-onhh'));
      x = xfSetText(x, 'N9', fVal('h-onmm'));
      x = xfSetText(x, 'J10', fVal('h-offhh'));
      x = xfSetText(x, 'N10', fVal('h-offmm'));
      var term = fVal('h-term');
      x = xfSetText(x, 'AA9', term ? ('羽田空港　　' + fMark('T1 ・ T2 ・ T3', term)) : '羽田空港    T1 ・ T2 ・ T3');
      x = xfSetText(x, 'AA10', fVal('h-off'));
      x = xfSetNum(x, 'AG11', fVal('h-pax'));
      var haisha = fVal('h-haisha');
      if (haisha) x = xfSetText(x, 'I11', fMark('無線配車　・　定額乗場', haisha));
      var koku = fVal('h-koku');
      if (koku) x = xfSetText(x, 'I12', fMark('日本人　・　外国人　・　不明', koku));
      var ng = fVal('h-nihongo');
      if (ng) x = xfSetText(x, 'AG12', fMark('可　・　不可', ng));
      if (document.getElementById('h-r1').checked) x = xfSetText(x, 'C16', '■');
      if (document.getElementById('h-r2').checked) x = xfSetText(x, 'C17', '■');
      if (document.getElementById('h-r3').checked) x = xfSetText(x, 'C18', '■');
      if (document.getElementById('h-r4').checked) x = xfSetText(x, 'C19', '■');
      x = xfSetText(x, 'W18', fVal('h-keiyu'));
      var other = fVal('h-other').split(/\\r?\\n/);
      ['D20','D21','D22','D23'].forEach(function(ref, i){ x = xfSetText(x, ref, other[i] || ''); });
      x = xfSetText(x, 'AA29', fVal('h-kacho'));
      x = xfSetText(x, 'AH29', fVal('h-checker'));

      var out = xfBuildWorkbook(tpl, [x], ['羽田定額適用外理由書']);
      var nm = e ? fName(e.name) : '空欄';
      xfDownload(out, '羽田定額適用外理由書_' + nm + '_' + (fVal('h-ridedate')||'').replace(/-/g,'') + '.xlsx');
      msg.textContent = '出力しました';
    } catch (err) {
      msg.textContent = ''; alert(err && err.message ? err.message : '作成に失敗しました');
    } finally { btn.disabled = false; }
  }`;

  const content = formPageShell({
    title: '羽田定額適用外理由書 作成', tplVar: 'HANEDA_TPL_B64', tplB64: HANEDA_RIYUSHO_TEMPLATE_XLSX_B64,
    bodyHtml, scriptBody, kacho: kacho.results ?? [],
  });
  return c.html(layout('羽田定額適用外理由書 作成', content, 'kacho-mission'));
});

export default app;
