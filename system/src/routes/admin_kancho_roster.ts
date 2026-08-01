// 班長関連 設定ハブ ＋ 班長リスト ＋ 枠設定
// 班長シフト表の「枠」（役割・班色・並び順）は固定のマスタとしてここ（枠設定）で一元管理する。
// 誰がその枠を担当するかは月度ごとに変わってよく、割当・入れ替えは班長シフト表の名前タップから行う
// （班長リスト側でkancho_membersの行を作成・紐付けすることはもう無い。過去に一括保存が誤って
// 重複行を作った事故を受けて、行の増減はここから切り離した）。
// 「班長リスト」は社員管理の「班長として登録」(employees.is_hanchyo)の一覧＋社員番号
// （希望休フォームの本人確認に使用）と、今どの枠を担当しているかを確認する画面。
// 唯一の編集操作は「班長登録の解除」（is_hanchyo=0に戻すだけ。kancho_membersには手を付けない）。
// ページ: /settings/kancho（ハブ） /settings/kancho-roster（班長リスト） /settings/kancho-slots（枠設定）
// API   : /api/kancho-roster（GET一覧・POST /unregisterで解除） /api/kancho/members系・/api/kancho/forbidden-pairs系（枠設定から利用、実装はadmin_kancho.ts）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { getPeriod } from '../auth';
import { layout, safeJson } from '../html/layout';
import { ROLE_ORDER, VACANT_SLOT_LABEL, type KanchoMember, type KanchoForbiddenPair } from '../html/kancho_shift';
import { getAdminPermissions } from '../permissions';
import { ADMIN_PATH } from '../config';
import { ensureKanchoPeriod } from './admin_kancho';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function canEditSlots(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('settings.kancho-slots.edit');
}

async function canEditRoster(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('settings.kancho-roster.edit');
}

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<{ id: number; name: string }> {
  const id = c.get('adminId');
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(id).first<{ username: string }>();
  return { id, name: row?.username ?? `id:${id}` };
}

function parseYearMonth(c: { req: { query: (k: string) => string | undefined } }): { year: number; month: number } {
  const now = getPeriod(new Date().toISOString().split('T')[0]);
  const year = parseInt(c.req.query('year') ?? '') || now.year;
  const month = parseInt(c.req.query('month') ?? '') || now.month;
  return { year, month };
}

function slotsNavHtml(year: number, month: number): string {
  let prevYear = year, prevMonth = month - 1;
  if (prevMonth < 1) { prevMonth = 12; prevYear--; }
  let nextYear = year, nextMonth = month + 1;
  if (nextMonth > 12) { nextMonth = 1; nextYear++; }
  return `
    <a href="${ADMIN_PATH}/settings/kancho-slots?year=${prevYear}&month=${prevMonth}" class="knav-btn">◀</a>
    <span style="font-size:13px;font-weight:700;color:#1e3a5f;white-space:nowrap;">${year}年${month}月度</span>
    <a href="${ADMIN_PATH}/settings/kancho-slots?year=${nextYear}&month=${nextMonth}" class="knav-btn">▶</a>`;
}

// ===== ハブページ =====
app.get('/settings/kancho', (c) => {
  const cardStyle = 'display:block;background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;text-decoration:none;color:inherit;box-shadow:0 1px 4px rgba(0,0,0,0.06);';
  const html = `
    <div class="no-print" style="margin-bottom:20px;">
      <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 設定に戻る</a>
      <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;margin-top:10px;">班長関連</h2>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;max-width:820px;">
      <a href="${ADMIN_PATH}/settings/kancho-slots" style="${cardStyle}">
        <div style="font-weight:700;color:#1e3a5f;margin-bottom:4px;">枠設定</div>
        <div style="font-size:12px;color:#6b7280;">班長シフト表の枠（役割・班色・並び順）の追加・編集、当直禁忌ペアの管理</div>
      </a>
      <a href="${ADMIN_PATH}/settings/kancho-roster" style="${cardStyle}">
        <div style="font-weight:700;color:#1e3a5f;margin-bottom:4px;">班長リスト</div>
        <div style="font-size:12px;color:#6b7280;">社員管理で班長登録した人の一覧・社員番号・今どの枠を担当しているか</div>
      </a>
      <a href="${ADMIN_PATH}/settings/kancho-wish" style="${cardStyle}">
        <div style="font-weight:700;color:#1e3a5f;margin-bottom:4px;">希望休フォーム</div>
        <div style="font-size:12px;color:#6b7280;">募集期間・対象月度・送信権限・提出状況の確認</div>
      </a>
    </div>`;
  return c.html(layout('班長関連', html, 'settings'));
});

// ===== 班長リストページ =====
// 一覧・割当状況は閲覧のみ。唯一の編集操作は「班長登録の解除」(employees.is_hanchyo=0)。
// 枠(kancho_members)の作成・紐付けは行わない（過去の重複行事故の反省点、変更なし）
app.get('/settings/kancho-roster', async (c) => {
  const editable = await canEditRoster(c);
  const html = `
    <div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <a href="${ADMIN_PATH}/settings/kancho" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 班長関連に戻る</a>
      <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">班長リスト</h2>
    </div>
    <div style="font-size:12px;color:#9ca3af;margin-bottom:12px;max-width:860px;line-height:1.7;">
      社員管理で「班長として登録」された社員の一覧です。社員番号は希望休フォームの本人確認に使用します。「今の担当」は今月度（現在の締め期間）の班長シフト表でこの社員番号が割り当てられている枠です。枠への割当・入れ替えは班長シフト表の名前タップから、枠自体の追加・役割・班色の設定は「枠設定」から行ってください。ここでできるのは「もう班長ではない人」を一覧から外す（班長登録の解除）ことだけです。
    </div>
    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px;max-width:860px;">
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f8fafc;">
            <th style="text-align:left;padding:5px 8px;border-bottom:1px solid #e5e7eb;">名前</th>
            <th style="text-align:left;padding:5px 8px;border-bottom:1px solid #e5e7eb;">社員番号</th>
            <th style="text-align:left;padding:5px 8px;border-bottom:1px solid #e5e7eb;">今の担当（今月度）</th>
            <th style="border-bottom:1px solid #e5e7eb;"></th>
          </tr></thead>
          <tbody id="roster-body"><tr><td colspan="4" style="padding:12px;color:#9ca3af;">読み込み中...</td></tr></tbody>
        </table>
      </div>
    </div>
    <script>
    var API = '${ADMIN_PATH}/api/kancho-roster';
    var CAN_EDIT = ${editable ? 'true' : 'false'};
    function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    async function loadRoster() {
      var res = await fetch(API);
      var d = await res.json();
      var rows = d.rows || [];
      document.getElementById('roster-body').innerHTML = rows.length ? rows.map(function(r) {
        var status = r.registered
          ? '<span style="color:#166534;">' + escH(r.slot_name) + (r.role ? '（' + escH(r.role) + (r.is_indoor ? '・内勤' : '・乗務') + '）' : (r.is_indoor ? '・内勤' : '・乗務')) + '</span>'
          : '<span style="color:#9ca3af;">未割当</span>';
        return '<tr>'
          + '<td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;font-weight:600;">' + escH(r.name) + '</td>'
          + '<td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;color:#6b7280;">' + escH(r.emp_no) + '</td>'
          + '<td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;">' + status + '</td>'
          + '<td style="padding:4px 8px;border-bottom:1px solid #f3f4f6;">' + (CAN_EDIT ? '<button onclick="unregister(\\'' + escH(r.emp_no) + '\\', \\'' + escH(r.name) + '\\')" style="padding:3px 9px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:99px;font-size:11px;cursor:pointer;white-space:nowrap;">班長登録を解除</button>' : '') + '</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="4" style="padding:12px;color:#9ca3af;">班長として登録されている社員がいません</td></tr>';
    }
    async function unregister(empNo, name) {
      if (!confirm(name + 'さんの班長登録を解除しますか？（班長シフト表の枠は自動では変わりません。必要ならシフト表の名前タップから別の人に差し替えてください）')) return;
      var res = await fetch(API + '/unregister', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ emp_no: empNo })
      });
      if (res.ok) loadRoster();
      else { var d = await res.json().catch(function() { return {}; }); alert(d.error || '解除に失敗しました'); }
    }
    loadRoster();
    </script>`;
  return c.html(layout('班長リスト', html, 'settings'));
});

// ===== 枠設定ページ =====
app.get('/settings/kancho-slots', async (c) => {
  const { year, month } = parseYearMonth(c);
  await ensureKanchoPeriod(c.env.DB, year, month);
  const editable = await canEditSlots(c);

  const [members, forbiddenPairs] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM kancho_members WHERE year = ? AND month = ? ORDER BY section, sort_order, id')
      .bind(year, month).all<KanchoMember>(),
    c.env.DB.prepare(
      `SELECT id, member_id_a, member_id_b, reason FROM kancho_forbidden_pairs
       WHERE member_id_a IN (SELECT id FROM kancho_members WHERE year = ? AND month = ?)
         AND member_id_b IN (SELECT id FROM kancho_members WHERE year = ? AND month = ?)`
    ).bind(year, month, year, month).all<KanchoForbiddenPair>(),
  ]);

  const html = `
    <div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
      <a href="${ADMIN_PATH}/settings/kancho" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 班長関連に戻る</a>
      <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">枠設定</h2>
      <div style="display:flex;align-items:center;gap:4px;margin-left:auto;">${slotsNavHtml(year, month)}</div>
    </div>
    <div style="font-size:12px;color:#9ca3af;margin-bottom:12px;max-width:960px;line-height:1.7;">
      班長シフト表の「枠」（役割・班色・並び順）はここで一元管理します。誰がこの枠を担当するか（名前・社員番号）は、班長シフト表の名前をタップして選んでください（ここでは設定できません。「現在の担当」は参考表示です）。「内勤」は乗務枠なら班長シフト表に表示しない設定、「新人班長」は当直ペアが新人同士にならないよう警告に使うフラグです。変更点はまとめて「一括保存」で反映してください。
    </div>
    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px;max-width:960px;">
      <div style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:10px;">
        <table style="border-collapse:collapse;width:100%;font-size:12.5px;white-space:nowrap;">
          <thead><tr style="background:#f8fafc;">
            <th style="width:22px;border-bottom:1px solid #e5e7eb;"></th>
            <th style="text-align:left;padding:5px 8px;border-bottom:1px solid #e5e7eb;">現在の担当</th>
            <th style="text-align:left;padding:5px 8px;border-bottom:1px solid #e5e7eb;">役割</th>
            <th style="text-align:left;padding:5px 8px;border-bottom:1px solid #e5e7eb;">表</th>
            <th style="text-align:left;padding:5px 8px;border-bottom:1px solid #e5e7eb;">班色</th>
            <th style="text-align:center;padding:5px 8px;border-bottom:1px solid #e5e7eb;">内勤</th>
            <th style="text-align:center;padding:5px 8px;border-bottom:1px solid #e5e7eb;">新人</th>
            <th style="border-bottom:1px solid #e5e7eb;"></th>
          </tr></thead>
          <tbody id="slots-body"></tbody>
        </table>
      </div>
      ${editable ? `
      <div style="border-top:1px solid #f1f5f9;margin-top:18px;padding-top:14px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">＋ 枠を追加</div>
        <div style="font-size:11.5px;color:#9ca3af;margin-bottom:6px;">追加直後は空き枠として作成されます。担当者は班長シフト表の名前タップから割り当ててください。</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">
          <input id="new-slot-role" type="text" list="role-list" placeholder="役割（mainのみ）" style="width:130px;border:1px solid #d1d5db;border-radius:6px;padding:5px 7px;font-size:12.5px;">
          <select id="new-slot-section" style="border:1px solid #d1d5db;border-radius:6px;padding:5px 7px;font-size:12.5px;">
            <option value="main">班長シフト表</option><option value="s1">①表</option><option value="s2">②表</option>
          </select>
          <select id="new-slot-color" style="border:1px solid #d1d5db;border-radius:6px;padding:5px 7px;font-size:12.5px;">
            <option value="">班色なし</option><option value="#00ff00">黄緑</option><option value="#ffff00">黄色</option>
            <option value="#00ffff">水色</option><option value="#ff99cc">ピンク</option>
          </select>
          <label style="font-size:12px;display:flex;align-items:center;gap:3px;"><input id="new-slot-indoor" type="checkbox" checked>内勤</label>
          <label style="font-size:12px;display:flex;align-items:center;gap:3px;"><input id="new-slot-rookie" type="checkbox">新人班長</label>
          <button onclick="addSlot()" style="padding:4px 9px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:99px;font-size:11px;cursor:pointer;">＋ 追加</button>
        </div>
        <datalist id="role-list">${ROLE_ORDER.map(r => `<option value="${r}">`).join('')}</datalist>
      </div>
      <div style="border-top:1px solid #f1f5f9;margin-top:18px;padding-top:14px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">当直禁忌ペア（相性等の個別理由。新人班長同士は自動で警告されるため登録不要）</div>
        <div id="fp-body" style="margin-bottom:8px;font-size:12.5px;"></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">
          <select id="new-fp-a" style="border:1px solid #d1d5db;border-radius:6px;padding:5px 7px;font-size:12.5px;"></select>
          <select id="new-fp-b" style="border:1px solid #d1d5db;border-radius:6px;padding:5px 7px;font-size:12.5px;"></select>
          <input id="new-fp-reason" type="text" placeholder="理由（任意）" style="width:160px;border:1px solid #d1d5db;border-radius:6px;padding:5px 7px;font-size:12.5px;">
          <button onclick="addForbiddenPair()" style="padding:4px 9px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:99px;font-size:11px;cursor:pointer;">＋ 追加</button>
        </div>
      </div>
      <div style="text-align:right;margin-top:16px;">
        <button onclick="saveAllSlots()" id="slots-save-btn" style="padding:10px 28px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">一括保存</button>
      </div>` : ''}
    </div>

    <div id="emp-match-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1002;align-items:center;justify-content:center;padding:12px;">
      <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:88vh;overflow-y:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;">社員管理と照合</h3>
          <button onclick="closeEmployeeMatch()" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
        </div>
        <div id="emp-match-name" style="font-size:14px;font-weight:700;color:#1e3a5f;margin-bottom:10px;"></div>
        <div id="emp-match-current" style="display:none;font-size:12.5px;background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:9px;margin-bottom:12px;"></div>
        <div id="emp-match-body"></div>
      </div>
    </div>

    <script>
    var API = '${ADMIN_PATH}/api/kancho';
    var CAN_EDIT = ${editable ? 'true' : 'false'};
    var VACANT_LABEL = ${JSON.stringify(VACANT_SLOT_LABEL)};
    var _year = ${year}, _month = ${month};
    var _members = ${safeJson((members.results ?? []).map(m => ({ id: m.id, name: m.name, role: m.role, section: m.section, sort_order: m.sort_order, is_active: m.is_active, team_color: m.team_color, is_indoor: m.is_indoor, is_rookie: m.is_rookie, emp_no: m.emp_no })))};
    var _forbiddenPairs = ${safeJson(forbiddenPairs.results ?? [])};
    var SECTION_LABEL = { main: '班長シフト表', s1: '①表', s2: '②表' };
    var COLOR_OPTIONS = [['', '班色なし'], ['#00ff00', '黄緑'], ['#ffff00', '黄色'], ['#00ffff', '水色'], ['#ff99cc', 'ピンク']];
    function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function renderSlots() {
      var bySec = { main: [], s1: [], s2: [] };
      _members.forEach(function(m) { (bySec[m.section] || bySec.main).push(m); });
      var html = '';
      ['main', 's1', 's2'].forEach(function(secKey) {
        var list = bySec[secKey];
        if (list.length === 0 && secKey !== 'main') return;
        html += '<tr><td colspan="8" style="background:#eff6ff;color:#1e3a5f;font-weight:700;font-size:11px;padding:4px 8px;">' + SECTION_LABEL[secKey] + '</td></tr>';
        html += list.sort(function(a, b) { return a.sort_order - b.sort_order || a.id - b.id; }).map(function(m) {
          var colorSel = '<select class="slot-color"' + (CAN_EDIT ? '' : ' disabled') + ' style="background:' + (m.team_color || 'white') + ';border:1px solid #d1d5db;border-radius:6px;padding:2px 5px;font-size:12.5px;">'
            + COLOR_OPTIONS.map(function(co) { return '<option value="' + co[0] + '"' + ((m.team_color || '') === co[0] ? ' selected' : '') + '>' + co[1] + '</option>'; }).join('')
            + '</select>';
          var occupant;
          if (m.name === VACANT_LABEL) {
            occupant = '<span style="color:#9ca3af;">' + escH(VACANT_LABEL) + '</span>';
          } else {
            var nameHtml = '<b>' + escH(m.name) + '</b>' + (m.emp_no ? '<span style="color:#9ca3af;"> (' + escH(m.emp_no) + ')</span>' : ' <span style="color:#dc2626;font-size:10px;">未紐付け</span>');
            occupant = CAN_EDIT
              ? '<span onclick="openEmployeeMatch(' + m.id + ')" style="cursor:pointer;border-bottom:1px dotted #93c5fd;" title="社員管理と照合">' + nameHtml + '</span>'
              : nameHtml;
          }
          var dragHandle = CAN_EDIT ? '<span class="drag-handle" draggable="true" title="ドラッグで並び替え">⠿</span>' : '';
          return '<tr style="' + (m.is_active ? '' : 'opacity:0.45;') + '" data-mid="' + m.id + '" data-section="' + secKey + '">'
            + '<td style="padding:3px 6px;border-bottom:1px solid #f1f5f9;text-align:center;color:#9ca3af;">' + dragHandle + '</td>'
            + '<td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;">' + occupant + '</td>'
            + '<td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;"><input type="text" class="slot-role" list="role-list"' + (CAN_EDIT ? '' : ' disabled') + ' value="' + escH(m.role || '') + '" style="width:100px;border:1px solid #d1d5db;border-radius:6px;padding:2px 6px;font-size:12.5px;"></td>'
            + '<td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;"><select class="slot-section"' + (CAN_EDIT ? '' : ' disabled') + ' style="border:1px solid #d1d5db;border-radius:6px;padding:2px 5px;font-size:12.5px;">' + ['main','s1','s2'].map(function(s) { return '<option value="' + s + '"' + (m.section === s ? ' selected' : '') + '>' + SECTION_LABEL[s] + '</option>'; }).join('') + '</select></td>'
            + '<td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;">' + colorSel + '</td>'
            + '<td style="text-align:center;padding:3px 8px;border-bottom:1px solid #f1f5f9;"><input type="checkbox" class="slot-indoor"' + (CAN_EDIT ? '' : ' disabled') + (m.is_indoor ? ' checked' : '') + '></td>'
            + '<td style="text-align:center;padding:3px 8px;border-bottom:1px solid #f1f5f9;"><input type="checkbox" class="slot-rookie"' + (CAN_EDIT ? '' : ' disabled') + (m.is_rookie ? ' checked' : '') + '></td>'
            + '<td style="padding:3px 8px;border-bottom:1px solid #f1f5f9;">' + (CAN_EDIT ? '<button class="chip-btn' + (m.is_active ? ' danger' : ' ok') + '" onclick="toggleSlot(' + m.id + ', ' + (m.is_active ? 0 : 1) + ')">' + (m.is_active ? '削除' : '復元') + '</button>' : '') + '</td>'
            + '</tr>';
        }).join('');
      });
      document.getElementById('slots-body').innerHTML = html || '<tr><td colspan="8" style="color:#9ca3af;padding:12px;">枠がありません</td></tr>';
      renderForbiddenPairs();
      attachDragHandlers();
    }
    var _dragSrc = null;
    function attachDragHandlers() {
      document.querySelectorAll('#slots-body .drag-handle').forEach(function(handle) {
        handle.addEventListener('dragstart', function(e) {
          _dragSrc = handle.closest('tr');
          e.dataTransfer.effectAllowed = 'move';
        });
      });
      document.querySelectorAll('#slots-body tr[data-mid]').forEach(function(row) {
        row.addEventListener('dragover', function(e) {
          if (!_dragSrc || row === _dragSrc || row.dataset.section !== _dragSrc.dataset.section) return;
          e.preventDefault();
          var rect = row.getBoundingClientRect();
          var before = (e.clientY - rect.top) / rect.height < 0.5;
          row.parentNode.insertBefore(_dragSrc, before ? row : row.nextSibling);
        });
        row.addEventListener('drop', function(e) { e.preventDefault(); });
      });
    }
    function renderForbiddenPairs() {
      var mains = _members.filter(function(m) { return m.section === 'main' && m.is_active === 1; });
      var opts = mains.map(function(m) { return '<option value="' + m.id + '">' + escH(m.name) + '</option>'; }).join('');
      document.getElementById('new-fp-a').innerHTML = opts;
      document.getElementById('new-fp-b').innerHTML = opts;
      var byId = {};
      mains.forEach(function(m) { byId[m.id] = m.name; });
      if (_forbiddenPairs.length === 0) {
        document.getElementById('fp-body').innerHTML = '<div style="color:#9ca3af;font-size:12px;">登録されている禁忌ペアはありません</div>';
        return;
      }
      document.getElementById('fp-body').innerHTML = _forbiddenPairs.map(function(p) {
        var nameA = byId[p.member_id_a] || ('id:' + p.member_id_a);
        var nameB = byId[p.member_id_b] || ('id:' + p.member_id_b);
        return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">'
          + '<span><b>' + escH(nameA) + '</b> × <b>' + escH(nameB) + '</b>' + (p.reason ? '（' + escH(p.reason) + '）' : '') + '</span>'
          + (CAN_EDIT ? '<button class="chip-btn danger" onclick="deleteForbiddenPair(' + p.id + ')">削除</button>' : '')
          + '</div>';
      }).join('');
    }
    async function saveAllSlots() {
      var btn = document.getElementById('slots-save-btn');
      var entries = [];
      var counters = {};
      document.querySelectorAll('#slots-body tr[data-mid]').forEach(function(row) {
        var sec = row.dataset.section;
        counters[sec] = (counters[sec] || 0) + 1;
        entries.push({
          id: parseInt(row.dataset.mid),
          role: row.querySelector('.slot-role').value,
          section: row.querySelector('.slot-section').value,
          team_color: row.querySelector('.slot-color').value || null,
          is_indoor: row.querySelector('.slot-indoor').checked ? 1 : 0,
          is_rookie: row.querySelector('.slot-rookie').checked ? 1 : 0,
          sort_order: counters[sec] * 10
        });
      });
      btn.disabled = true; btn.textContent = '保存中...';
      try {
        var res = await fetch(API + '/members/batch', {
          method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ entries: entries })
        });
        var d = await res.json().catch(function() { return {}; });
        if (!res.ok) throw new Error(d.error || '保存に失敗しました');
        if (d.error) alert(d.error);
        location.reload();
      } catch (e) {
        alert(e.message || '保存に失敗しました');
        btn.disabled = false; btn.textContent = '一括保存';
      }
    }
    async function toggleSlot(id, active) {
      if (!active && !confirm('この枠を一覧から外しますか？（過去のシフトは残ります）')) return;
      var res = await fetch(API + '/members/' + id, {
        method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ is_active: active })
      });
      if (res.ok) location.reload();
      else alert('変更に失敗しました');
    }
    async function addSlot() {
      var body = {
        name: VACANT_LABEL,
        role: document.getElementById('new-slot-role').value,
        section: document.getElementById('new-slot-section').value,
        team_color: document.getElementById('new-slot-color').value || null,
        is_indoor: document.getElementById('new-slot-indoor').checked ? 1 : 0,
        is_rookie: document.getElementById('new-slot-rookie').checked ? 1 : 0,
        emp_no: null,
        sort_order: 9999,
        year: _year, month: _month
      };
      var res = await fetch(API + '/members', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
      });
      if (res.ok) location.reload();
      else { var d = await res.json().catch(function() { return {}; }); alert(d.error || '追加に失敗しました'); }
    }
    async function addForbiddenPair() {
      var a = parseInt(document.getElementById('new-fp-a').value);
      var b = parseInt(document.getElementById('new-fp-b').value);
      if (!a || !b || a === b) { alert('異なる2名を選んでください'); return; }
      var res = await fetch(API + '/forbidden-pairs', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ member_id_a: a, member_id_b: b, reason: document.getElementById('new-fp-reason').value })
      });
      if (res.ok) location.reload();
      else { var d = await res.json().catch(function() { return {}; }); alert(d.error || '追加に失敗しました'); }
    }
    async function deleteForbiddenPair(id) {
      if (!confirm('この禁忌ペアを削除しますか？')) return;
      var res = await fetch(API + '/forbidden-pairs/' + id, { method: 'DELETE' });
      if (res.ok) location.reload();
      else alert('削除に失敗しました');
    }

    // ===== 社員管理との照合（現在の担当名をクリックして開く）=====
    var _empMatchMid = null;
    async function openEmployeeMatch(mid) {
      _empMatchMid = mid;
      var m = _members.filter(function(x) { return x.id === mid; })[0];
      document.getElementById('emp-match-name').textContent = 'シフト表の表示名: ' + (m ? m.name : '');
      document.getElementById('emp-match-current').style.display = 'none';
      document.getElementById('emp-match-body').innerHTML = '<div style="color:#9ca3af;font-size:12.5px;">読み込み中...</div>';
      document.getElementById('emp-match-modal').style.display = 'flex';
      try {
        var res = await fetch(API + '/members/' + mid + '/employee-match');
        var d = await res.json();
        if (d.current) {
          document.getElementById('emp-match-current').style.display = 'block';
          document.getElementById('emp-match-current').innerHTML = '現在の紐付け: <b>' + escH(d.current.name) + '</b>（番' + escH(d.current.emp_no) + '）' + (d.current.is_hanchyo ? '' : '<span style="color:#dc2626;"> ※班長未登録</span>');
        }
        var cands = d.candidates || [];
        var html = '';
        if (cands.length) {
          html += '<div style="font-size:12px;color:#6b7280;margin-bottom:6px;">名前が近い社員（部分一致）</div>';
          html += '<select id="emp-match-select" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;background:white;margin-bottom:8px;">'
            + '<option value="">-- 選択してください --</option>'
            + cands.map(function(e) { return '<option value="' + escH(e.emp_no) + '">' + escH(e.name) + '（番' + escH(e.emp_no) + '）' + (e.is_hanchyo ? '' : '　※班長未登録') + '</option>'; }).join('')
            + '</select>';
          html += '<button onclick="linkToEmployee()" style="width:100%;padding:9px;background:#2563eb;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;margin-bottom:14px;">この社員に紐付ける</button>';
        } else {
          html += '<div style="font-size:12px;color:#9ca3af;margin-bottom:14px;">一致する社員が見つかりませんでした</div>';
        }
        html += '<div style="border-top:1px solid #f1f5f9;padding-top:12px;">'
          + '<div style="font-size:12px;color:#6b7280;margin-bottom:6px;">見つからない場合は社員管理に新規登録します</div>'
          + '<input id="emp-reg-empno" type="text" placeholder="社員番号（8桁）" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;box-sizing:border-box;margin-bottom:6px;">'
          + '<input id="emp-reg-name" type="text" value="' + escH(d.row_name || '') + '" placeholder="氏名（フルネーム）" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;box-sizing:border-box;margin-bottom:8px;">'
          + '<button onclick="registerNewEmployee()" style="width:100%;padding:9px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">新規登録して紐付ける</button>'
          + '</div>';
        document.getElementById('emp-match-body').innerHTML = html;
      } catch (e) {
        alert('読み込みに失敗しました');
        closeEmployeeMatch();
      }
    }
    function closeEmployeeMatch() {
      document.getElementById('emp-match-modal').style.display = 'none';
      _empMatchMid = null;
    }
    async function linkToEmployee() {
      var empNo = document.getElementById('emp-match-select').value;
      if (!empNo) { alert('社員を選んでください'); return; }
      var res = await fetch(API + '/members/' + _empMatchMid + '/employee-link', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ emp_no: empNo })
      });
      var d = await res.json().catch(function() { return {}; });
      if (!res.ok) { alert(d.error || '紐付けに失敗しました'); return; }
      location.reload();
    }
    async function registerNewEmployee() {
      var empNo = document.getElementById('emp-reg-empno').value.trim();
      var name = document.getElementById('emp-reg-name').value.trim();
      if (!empNo || !name) { alert('社員番号・氏名の両方を入力してください'); return; }
      var res = await fetch(API + '/members/' + _empMatchMid + '/employee-register', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ emp_no: empNo, name: name })
      });
      var d = await res.json().catch(function() { return {}; });
      if (!res.ok) { alert(d.error || '登録に失敗しました'); return; }
      location.reload();
    }

    renderSlots();
    </script>
    <style>
      .chip-btn { padding:3px 9px;background:#f3f4f6;border:1px solid #d1d5db;color:#4b5563;border-radius:99px;font-size:11px;cursor:pointer;white-space:nowrap; }
      .chip-btn.danger { background:#fef2f2;border-color:#fca5a5;color:#dc2626; }
      .chip-btn.ok { background:#f0fdf4;border-color:#86efac;color:#166534; }
      .knav-btn { display:inline-flex;align-items:center;justify-content:center;min-width:32px;height:32px;padding:0 6px;background:#4b6cb7;color:white;border-radius:8px;text-decoration:none;font-size:16px;font-weight:700; }
      .knav-btn:hover { background:#3b5aa3; }
      .drag-handle { cursor:grab;font-size:14px;user-select:none;padding:0 4px; }
      .drag-handle:active { cursor:grabbing; }
      #slots-body tr[data-mid] { background:white; }
      #slots-body tr[data-mid]:hover { background:#fafbfc; }
    </style>`;
  return c.html(layout('枠設定', html, 'settings'));
});

// ===== API: 班長リスト =====
// 社員管理でis_hanchyo=1の社員一覧に、今月度の班長シフト名簿(kancho_members)を
// 社員番号(emp_no)でLEFT JOINして返す
// （枠の作成・編集は/api/kancho/members系、担当者の割当は/api/kancho/members/:id/link）
app.get('/api/kancho-roster', async (c) => {
  const { year, month } = getPeriod(new Date().toISOString().split('T')[0]);
  const [employees, members] = await Promise.all([
    c.env.DB.prepare('SELECT emp_no, name FROM employees WHERE is_hanchyo = 1 AND is_active = 1 ORDER BY name').all<{ emp_no: string; name: string }>(),
    c.env.DB.prepare(
      `SELECT name, role, section, team_color, is_indoor, emp_no FROM kancho_members
       WHERE year = ? AND month = ? AND is_active = 1 AND emp_no IS NOT NULL AND emp_no != ''`
    ).bind(year, month).all<{ name: string; role: string | null; section: string; team_color: string | null; is_indoor: number; emp_no: string }>(),
  ]);
  const memberByEmpNo = new Map((members.results ?? []).map(m => [m.emp_no, m]));
  const rows = (employees.results ?? []).map(e => {
    const match = memberByEmpNo.get(e.emp_no);
    return {
      emp_no: e.emp_no,
      name: e.name,
      registered: match ? 1 : 0,
      slot_name: match?.name ?? null,
      role: match?.role ?? null,
      section: match?.section ?? null,
      team_color: match?.team_color ?? null,
      is_indoor: match?.is_indoor ?? null,
    };
  });
  return c.json({ rows, year, month });
});

// 班長登録の解除（employees.is_hanchyo=0）。既存の班長シフト名簿(kancho_members)には
// 一切手を付けない（枠の割当は班長シフト表の名前タップから別途差し替える運用）
app.post('/api/kancho-roster/unregister', async (c) => {
  if (!(await canEditRoster(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ emp_no?: string }>();
  const empNo = (b.emp_no ?? '').trim();
  if (!empNo) return c.json({ error: '社員番号が必要です' }, 400);

  const emp = await c.env.DB.prepare('SELECT name, is_hanchyo FROM employees WHERE emp_no = ?')
    .bind(empNo).first<{ name: string; is_hanchyo: number }>();
  if (!emp) return c.json({ error: '社員が見つかりません' }, 404);

  await c.env.DB.prepare(`UPDATE employees SET is_hanchyo = 0, updated_at = datetime('now','localtime') WHERE emp_no = ?`)
    .bind(empNo).run();
  const { id: adminId, name: adminUser } = await adminName(c);
  await c.env.DB.prepare(
    'INSERT INTO kancho_edit_logs (admin_id, admin_name, action, target, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(adminId, adminUser, 'member', emp.name, `番${empNo}（班長登録あり）`, `番${empNo}（班長登録解除・班長リストより）`).run();
  return c.json({ ok: true });
});

export default app;
