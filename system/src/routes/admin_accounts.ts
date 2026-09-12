// 設定 > アカウント権限管理
// 管理画面アカウントの作成・削除・機能ごとの閲覧/編集権限の設定
// ページ: /settings/accounts  API: /api/accounts* / /api/account-presets*（権限キー settings.accounts）
//
// 権限カタログはツリー構造（permissions.ts の PERMISSION_TREE）。編集モーダルでは枝を折りたたんで
// 表示し、見出し行のチェックで枝内を一括ON/OFFできる。
// 「プリセット」= よく使う権限セットに名前を付けて保存し、ワンクリックで適用できる仕組み。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { hashPassword } from '../auth';
import { layout, safeJson } from '../html/layout';
import { ADMIN_PATH } from '../config';
import { PERMISSION_TREE, parsePermissions, getAdminPermissions } from '../permissions';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

type AdminRow = { id: number; username: string; permissions: string | null; division: string | null; created_at: string };
type PresetRow = { id: number; name: string; permissions: string; sort_order: number };

const VALID_DIVISIONS = new Set(['1', '2', '3', '4', 'all']);

// 全権限アカウント（permissions NULL）の数
async function countFullAccounts(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM admins WHERE permissions IS NULL').first<{ n: number }>();
  return row?.n ?? 0;
}

function parsePresetPerms(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.map(String);
  } catch { /* noop */ }
  return [];
}

async function loadPresets(db: D1Database): Promise<Array<{ id: number; name: string; permissions: string[] }>> {
  const rows = await db.prepare('SELECT id, name, permissions, sort_order FROM permission_presets ORDER BY sort_order, id').all<PresetRow>();
  return (rows.results ?? []).map(r => ({ id: r.id, name: r.name, permissions: parsePresetPerms(r.permissions) }));
}

// ===== ページ =====
app.get('/settings/accounts', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, username, permissions, division, created_at FROM admins ORDER BY id'
  ).all<AdminRow>();
  const accounts = (rows.results ?? []).map(a => ({
    id: a.id,
    username: a.username,
    permissions: parsePermissions(a.permissions),  // null = 全権限
    division: a.division,  // null=未設定 / '1'〜'4' / 'all'=全所属（リミット通知先の判定に使用）
    created_at: a.created_at,
  }));
  const selfId = c.get('adminId');
  const viewerPerms = await getAdminPermissions(c.env.DB, selfId);
  const canEdit = viewerPerms === null || viewerPerms.includes('settings.accounts.edit');
  const presets = await loadPresets(c.env.DB);

  const html = `
  <div style="max-width:820px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
      <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 設定に戻る</a>
      <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">アカウント権限管理</h2>
    </div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:16px;line-height:1.6;">
      機能ごとに「閲覧」「編集」を分けて設定できます。編集にチェックを入れるとデータの追加・変更・削除が可能になります。<br>
      よく使う組み合わせは<b>プリセット</b>に保存しておき、権限編集画面からワンクリックで適用できます。<br>
      <b>全権限</b>のアカウントはすべての機能にアクセスできます（統括管理者向け）。このページの編集権限を持つアカウントは他人に権限を付与できるため、付与先には注意してください。
      ${canEdit ? '' : '<br><b style="color:#b45309;">このアカウントは閲覧のみの権限です。作成・変更・削除はできません。</b>'}
    </div>

    <div id="account-list" style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;"></div>

    ${canEdit ? `
    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
      <div style="font-size:14px;font-weight:700;color:#1e3a5f;margin-bottom:10px;">＋ 新規アカウント作成</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <input id="new-username" type="text" placeholder="ユーザー名（半角英数）" autocomplete="off" style="width:170px;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;">
        <div style="position:relative;display:inline-block;">
          <input id="new-password" type="password" placeholder="パスワード（8文字以上）" autocomplete="new-password" style="width:190px;border:1px solid #d1d5db;border-radius:6px;padding:8px 46px 8px 8px;font-size:13px;">
          <button type="button" id="new-password-toggle" onclick="toggleNewPasswordVisibility()" aria-label="パスワードを表示する" title="表示する" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);background:none;border:none;color:#6b7280;font-size:11px;font-weight:600;cursor:pointer;padding:4px 6px;">表示</button>
        </div>
        <select id="new-division" style="border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;">
          <option value="">所属課: 未設定</option>
          <option value="1">1課</option>
          <option value="2">2課</option>
          <option value="3">3課</option>
          <option value="4">4課</option>
          <option value="all">全所属</option>
        </select>
        <button onclick="createAccount()" style="padding:8px 18px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">作成して権限を設定</button>
      </div>
      <div style="font-size:11px;color:#9ca3af;margin-top:6px;">作成直後は権限なしの状態です。続けて表示される画面で権限を設定してください。</div>
    </div>` : ''}
  </div>

  <!-- 権限編集モーダル -->
  <div id="perm-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;padding:12px;">
    <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:620px;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;">権限設定: <span id="perm-username"></span></h3>
        <button onclick="sel('#perm-modal').style.display='none'" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
      </div>

      <label style="display:flex;align-items:center;gap:8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 12px;margin-bottom:10px;cursor:pointer;">
        <input type="checkbox" id="perm-full" onchange="toggleFullPerm()">
        <span style="font-size:13px;font-weight:700;color:#1d4ed8;">全権限（制限なし・統括管理者向け）</span>
      </label>

      <div id="perm-controls">
        <div id="perm-preset-row" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;margin-bottom:8px;">
          <span style="font-size:12px;font-weight:700;color:#1e3a5f;">プリセット</span>
          <select id="preset-select" style="border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:12px;min-width:150px;"></select>
          <button type="button" onclick="applySelectedPreset()" style="padding:5px 10px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:6px;font-size:12px;cursor:pointer;">適用</button>
          <button type="button" onclick="saveNewPreset()" style="padding:5px 10px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;border-radius:6px;font-size:12px;cursor:pointer;">現在の内容で新規保存</button>
          <button type="button" onclick="overwritePreset()" style="padding:5px 10px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:6px;font-size:12px;cursor:pointer;">選択中を上書き</button>
          <button type="button" onclick="renamePreset()" style="padding:5px 10px;background:#f9fafb;border:1px solid #e5e7eb;color:#6b7280;border-radius:6px;font-size:12px;cursor:pointer;">名前変更</button>
          <button type="button" onclick="deletePreset()" style="padding:5px 10px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:12px;cursor:pointer;">削除</button>
        </div>
        <div id="perm-bulk-row" style="display:flex;gap:8px;margin-bottom:6px;align-items:center;flex-wrap:wrap;">
          <button type="button" onclick="selectAllPerm(true)" style="padding:5px 12px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;border-radius:6px;font-size:12px;cursor:pointer;">すべて選択</button>
          <button type="button" onclick="selectAllPerm(false)" style="padding:5px 12px;background:#f9fafb;border:1px solid #e5e7eb;color:#6b7280;border-radius:6px;font-size:12px;cursor:pointer;">すべて解除</button>
          <button type="button" onclick="expandAllBranches(true)" style="padding:5px 12px;background:#fff;border:1px solid #e5e7eb;color:#6b7280;border-radius:6px;font-size:12px;cursor:pointer;">すべて展開</button>
          <button type="button" onclick="expandAllBranches(false)" style="padding:5px 12px;background:#fff;border:1px solid #e5e7eb;color:#6b7280;border-radius:6px;font-size:12px;cursor:pointer;">すべて折りたたむ</button>
          <span style="font-size:11px;color:#9ca3af;">見出し行のチェックで、その枝をまとめてON/OFFできます</span>
        </div>
        <div style="display:flex;align-items:center;font-size:10px;color:#9ca3af;border-bottom:1px solid #e5e7eb;padding:2px 0;">
          <span style="flex:1;"></span>
          <span style="width:48px;text-align:center;">閲覧</span>
          <span style="width:48px;text-align:center;">編集</span>
        </div>
        <div id="perm-grid" style="margin-top:2px;"></div>
      </div>

      <div id="perm-error" style="display:none;color:#dc2626;font-size:12px;margin-top:8px;"></div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button onclick="sel('#perm-modal').style.display='none'" style="flex:1;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;cursor:pointer;background:#fff;">キャンセル</button>
        <button onclick="savePermissions()" id="perm-save-btn" style="flex:2;padding:10px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;">保存</button>
      </div>
    </div>
  </div>

  <style>
    .perm-row { display:flex; align-items:center; gap:6px; min-height:30px; border-bottom:1px solid #f3f4f6; }
    .perm-row .perm-label { flex:1; font-size:13px; color:#374151; }
    .perm-grp .perm-label { font-weight:700; color:#1e3a5f; }
    .perm-cell { width:48px; text-align:center; flex-shrink:0; }
    .perm-cell input { cursor:pointer; }
    .perm-cell-dash { color:#d1d5db; font-size:12px; }
    .perm-note { font-size:11px; color:#9ca3af; padding:1px 0 4px; }
    .perm-note-inline { font-size:11px; color:#9ca3af; font-weight:400; }
    .perm-tw { width:18px; height:18px; line-height:1; border:none; background:none; color:#6b7280; cursor:pointer; font-size:11px; flex-shrink:0; }
    .perm-tw-spacer { width:18px; flex-shrink:0; }
    .perm-children.collapsed { display:none; }
  </style>

  <script>
  var API = '${ADMIN_PATH}/api/accounts';
  var PRESET_API = '${ADMIN_PATH}/api/account-presets';
  var TREE = ${safeJson(PERMISSION_TREE)};
  var SELF_ID = ${selfId};
  var CAN_EDIT = ${canEdit ? 'true' : 'false'};
  var _accounts = ${safeJson(accounts)};
  var _presets = ${safeJson(presets)};
  var _editingId = null;
  var _gid = 0;

  function sel(s) { return document.querySelector(s); }
  function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function permSummary(perms) {
    if (perms === null) return '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700;">全権限</span>';
    var view = perms.filter(function(p) { return p.indexOf('.edit') === -1; }).length;
    var edit = perms.filter(function(p) { return p.indexOf('.edit') !== -1; }).length;
    if (view === 0 && edit === 0) return '<span style="background:#f3f4f6;color:#6b7280;padding:2px 10px;border-radius:99px;font-size:11px;">権限なし</span>';
    return '<span style="background:#f0fdf4;color:#166534;padding:2px 10px;border-radius:99px;font-size:11px;">閲覧 ' + view + '件 / 編集 ' + edit + '件</span>';
  }

  var DIVISION_OPTIONS = [
    { v: '', label: '所属課: 未設定' },
    { v: '1', label: '1課' },
    { v: '2', label: '2課' },
    { v: '3', label: '3課' },
    { v: '4', label: '4課' },
    { v: 'all', label: '全所属' },
  ];
  function divisionSelectHtml(a) {
    var cur = a.division || '';
    if (!CAN_EDIT) {
      var label = DIVISION_OPTIONS.find(function(o) { return o.v === cur; });
      return '<span style="font-size:12px;color:#6b7280;">' + escH(label ? label.label : '所属課: 未設定') + '</span>';
    }
    var opts = DIVISION_OPTIONS.map(function(o) {
      return '<option value="' + o.v + '"' + (o.v === cur ? ' selected' : '') + '>' + o.label + '</option>';
    }).join('');
    return '<select onchange="changeDivision(' + a.id + ', this.value)" style="border:1px solid #d1d5db;border-radius:6px;padding:4px 6px;font-size:12px;">' + opts + '</select>';
  }
  async function changeDivision(id, value) {
    var res = await fetch(API + '/' + id, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ division: value || null })
    });
    var d = await res.json().catch(function() { return {}; });
    if (!res.ok) { alert(d.error || '変更に失敗しました'); return; }
    var a = _accounts.find(function(x) { return x.id === id; });
    if (a) a.division = value || null;
  }
  function renderList() {
    sel('#account-list').innerHTML = _accounts.map(function(a) {
      return '<div style="display:flex;align-items:center;gap:10px;background:white;border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;flex-wrap:wrap;">'
        + '<div style="font-size:14px;font-weight:700;color:#1e3a5f;min-width:110px;">' + escH(a.username) + (a.id === SELF_ID ? ' <span style="font-size:10px;color:#9ca3af;">(自分)</span>' : '') + '</div>'
        + '<div>' + permSummary(a.permissions) + '</div>'
        + '<div>' + divisionSelectHtml(a) + '</div>'
        + (CAN_EDIT ? (
          '<div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;">'
          + '<button onclick="openPerm(' + a.id + ')" style="padding:6px 12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:6px;font-size:12px;cursor:pointer;">権限編集</button>'
          + '<button onclick="resetPassword(' + a.id + ')" style="padding:6px 12px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:6px;font-size:12px;cursor:pointer;">パスワード再設定</button>'
          + (a.id === SELF_ID ? '' : '<button onclick="deleteAccount(' + a.id + ')" style="padding:6px 12px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:12px;cursor:pointer;">削除</button>')
          + '</div>'
        ) : '')
        + '</div>';
    }).join('');
  }
  renderList();

  // ===== プリセット =====
  function renderPresetOptions() {
    var s = sel('#preset-select');
    var cur = s.value;
    s.innerHTML = '<option value="">— プリセットを選択 —</option>' + _presets.map(function(p) {
      return '<option value="' + p.id + '">' + escH(p.name) + '</option>';
    }).join('');
    if (cur) s.value = cur;
  }
  function currentSelection() {
    var out = [];
    document.querySelectorAll('#perm-grid .perm-view[data-key]').forEach(function(cb) { if (cb.checked) out.push(cb.dataset.key); });
    document.querySelectorAll('#perm-grid .perm-edit[data-key]').forEach(function(cb) { if (cb.checked) out.push(cb.dataset.key + '.edit'); });
    return out;
  }
  function applyPresetPerms(perms) {
    var set = {};
    (perms || []).forEach(function(p) { set[p] = true; });
    document.querySelectorAll('#perm-grid .perm-view[data-key]').forEach(function(cb) { cb.checked = !!set[cb.dataset.key]; });
    document.querySelectorAll('#perm-grid .perm-edit[data-key]').forEach(function(cb) {
      cb.checked = !!set[cb.dataset.key + '.edit'];
      if (cb.checked) { var v = viewOf(cb.dataset.key); if (v) v.checked = true; }
    });
    refreshGroupStates();
  }
  async function refreshPresets() {
    var r = await fetch(PRESET_API);
    var d = await r.json().catch(function() { return {}; });
    _presets = d.items || [];
    renderPresetOptions();
  }
  function applySelectedPreset() {
    var id = sel('#preset-select').value;
    if (!id) { alert('プリセットを選択してください'); return; }
    var p = _presets.find(function(x) { return String(x.id) === id; });
    if (!p) return;
    if (sel('#perm-full').checked) { sel('#perm-full').checked = false; toggleFullPerm(); }
    applyPresetPerms(p.permissions);
  }
  async function saveNewPreset() {
    var name = (prompt('新しいプリセット名を入力してください') || '').trim();
    if (!name) return;
    var res = await fetch(PRESET_API, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name: name, permissions: currentSelection() })
    });
    var d = await res.json().catch(function() { return {}; });
    if (!res.ok) { alert(d.error || '保存に失敗しました'); return; }
    await refreshPresets();
    if (d.id) sel('#preset-select').value = String(d.id);
  }
  async function overwritePreset() {
    var id = sel('#preset-select').value;
    if (!id) { alert('上書きするプリセットを選択してください'); return; }
    var p = _presets.find(function(x) { return String(x.id) === id; });
    if (!confirm('プリセット「' + (p ? p.name : '') + '」を、現在のチェック内容で上書きします。よろしいですか？')) return;
    var res = await fetch(PRESET_API + '/' + id, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ permissions: currentSelection() })
    });
    var d = await res.json().catch(function() { return {}; });
    if (!res.ok) { alert(d.error || '上書きに失敗しました'); return; }
    await refreshPresets();
    sel('#preset-select').value = id;
  }
  async function renamePreset() {
    var id = sel('#preset-select').value;
    if (!id) { alert('名前を変更するプリセットを選択してください'); return; }
    var p = _presets.find(function(x) { return String(x.id) === id; });
    var name = (prompt('新しいプリセット名', p ? p.name : '') || '').trim();
    if (!name) return;
    var res = await fetch(PRESET_API + '/' + id, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ name: name })
    });
    var d = await res.json().catch(function() { return {}; });
    if (!res.ok) { alert(d.error || '変更に失敗しました'); return; }
    await refreshPresets();
    sel('#preset-select').value = id;
  }
  async function deletePreset() {
    var id = sel('#preset-select').value;
    if (!id) { alert('削除するプリセットを選択してください'); return; }
    var p = _presets.find(function(x) { return String(x.id) === id; });
    if (!confirm('プリセット「' + (p ? p.name : '') + '」を削除しますか？（アカウントの権限自体は変わりません）')) return;
    var res = await fetch(PRESET_API + '/' + id, { method: 'DELETE' });
    var d = await res.json().catch(function() { return {}; });
    if (!res.ok) { alert(d.error || '削除に失敗しました'); return; }
    await refreshPresets();
  }

  // ===== 権限ツリー描画 =====
  function viewOf(key) { return document.querySelector('#perm-grid .perm-view[data-key="' + key + '"]'); }
  function editOf(key) { return document.querySelector('#perm-grid .perm-edit[data-key="' + key + '"]'); }

  function nodeHtml(node, depth) {
    var pad = 4 + depth * 16;
    var hasChildren = node.children && node.children.length;
    var h = '';
    if (hasChildren) {
      var gid = 'pg' + (_gid++);
      h += '<div class="perm-branch">';
      h += '<div class="perm-row perm-grp" style="padding-left:' + pad + 'px;">';
      h += '<button type="button" class="perm-tw" data-target="' + gid + '" onclick="toggleBranch(this)">&#9662;</button>';
      h += '<span class="perm-label">' + escH(node.label) + '</span>';
      if (node.key) {
        h += chkCell('view', node.key);
        h += node.viewOnly ? '<span class="perm-cell perm-cell-dash">&mdash;</span>' : chkCell('edit', node.key);
      } else {
        h += '<span class="perm-cell"><input type="checkbox" class="perm-grp-view" data-target="' + gid + '" onchange="bulkGroup(this,&quot;view&quot;)" title="この枝の閲覧を一括"></span>';
        h += '<span class="perm-cell"><input type="checkbox" class="perm-grp-edit" data-target="' + gid + '" onchange="bulkGroup(this,&quot;edit&quot;)" title="この枝の編集を一括"></span>';
      }
      h += '</div>';
      if (node.note) h += '<div class="perm-note" style="padding-left:' + (pad + 22) + 'px;">' + escH(node.note) + '</div>';
      h += '<div class="perm-children" id="' + gid + '">';
      node.children.forEach(function(ch) { h += nodeHtml(ch, depth + 1); });
      h += '</div></div>';
      return h;
    }
    h += '<div class="perm-row" style="padding-left:' + pad + 'px;">';
    h += '<span class="perm-tw-spacer"></span>';
    h += '<span class="perm-label">' + escH(node.label) + (node.note ? ' <span class="perm-note-inline">' + escH(node.note) + '</span>' : '') + '</span>';
    h += chkCell('view', node.key);
    h += node.viewOnly ? '<span class="perm-cell perm-cell-dash">&mdash;</span>' : chkCell('edit', node.key);
    h += '</div>';
    return h;
  }
  function chkCell(kind, key) {
    var cls = kind === 'view' ? 'perm-view' : 'perm-edit';
    var fn = kind === 'view' ? 'onViewChange' : 'onEditChange';
    return '<span class="perm-cell"><input type="checkbox" class="' + cls + '" data-key="' + escH(key) + '" onchange="' + fn + '(this)"></span>';
  }

  function toggleBranch(btn) {
    var box = document.getElementById(btn.dataset.target);
    if (!box) return;
    var collapsed = box.classList.toggle('collapsed');
    btn.innerHTML = collapsed ? '&#9656;' : '&#9662;';
  }
  function expandAllBranches(open) {
    document.querySelectorAll('#perm-grid .perm-children').forEach(function(b) { b.classList.toggle('collapsed', !open); });
    document.querySelectorAll('#perm-grid .perm-tw').forEach(function(t) { t.innerHTML = open ? '&#9662;' : '&#9656;'; });
  }

  function onViewChange(cb) {
    if (!cb.checked) { var e = editOf(cb.dataset.key); if (e) e.checked = false; }
    refreshGroupStates();
  }
  function onEditChange(cb) {
    if (cb.checked) { var v = viewOf(cb.dataset.key); if (v) v.checked = true; }
    refreshGroupStates();
  }
  function bulkGroup(cb, kind) {
    var box = document.getElementById(cb.dataset.target);
    if (!box) return;
    var sel1 = kind === 'view' ? '.perm-view[data-key]' : '.perm-edit[data-key]';
    box.querySelectorAll(sel1).forEach(function(x) { x.checked = cb.checked; });
    if (kind === 'edit' && cb.checked) {
      box.querySelectorAll('.perm-view[data-key]').forEach(function(x) { x.checked = true; });
    }
    if (kind === 'view' && !cb.checked) {
      box.querySelectorAll('.perm-edit[data-key]').forEach(function(x) { x.checked = false; });
    }
    refreshGroupStates();
  }
  function refreshGroupStates() {
    document.querySelectorAll('#perm-grid .perm-grp-view, #perm-grid .perm-grp-edit').forEach(function(g) {
      var box = document.getElementById(g.dataset.target);
      if (!box) return;
      var isEdit = g.classList.contains('perm-grp-edit');
      var boxes = box.querySelectorAll(isEdit ? '.perm-edit[data-key]' : '.perm-view[data-key]');
      var total = boxes.length, on = 0;
      boxes.forEach(function(x) { if (x.checked) on++; });
      g.checked = total > 0 && on === total;
      g.indeterminate = on > 0 && on < total;
    });
  }

  function selectAllPerm(checked) {
    document.querySelectorAll('#perm-grid .perm-view[data-key], #perm-grid .perm-edit[data-key]').forEach(function(cb) { cb.checked = checked; });
    refreshGroupStates();
  }

  function toggleFullPerm() {
    var full = sel('#perm-full').checked;
    var box = sel('#perm-controls');
    box.style.opacity = full ? '0.35' : '1';
    box.style.pointerEvents = full ? 'none' : 'auto';
  }

  function openPerm(id) {
    var a = _accounts.find(function(x) { return x.id === id; });
    if (!a) return;
    _editingId = id;
    _gid = 0;
    sel('#perm-username').textContent = a.username;
    var perms = a.permissions;
    sel('#perm-full').checked = perms === null;
    sel('#preset-select').value = '';
    renderPresetOptions();
    sel('#perm-grid').innerHTML = TREE.map(function(n) { return nodeHtml(n, 0); }).join('');
    applyPresetPerms(perms || []);
    sel('#perm-error').style.display = 'none';
    toggleFullPerm();
    sel('#perm-modal').style.display = 'flex';
  }

  async function savePermissions() {
    var btn = sel('#perm-save-btn');
    btn.disabled = true; btn.textContent = '保存中...';
    var permissions = null;
    if (!sel('#perm-full').checked) {
      permissions = currentSelection();
    }
    try {
      var res = await fetch(API + '/' + _editingId, {
        method: 'PUT', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ permissions: permissions })
      });
      var d = await res.json().catch(function() { return {}; });
      if (!res.ok) throw new Error(d.error || '保存に失敗しました');
      location.reload();
    } catch(e) {
      sel('#perm-error').textContent = e.message;
      sel('#perm-error').style.display = 'block';
      btn.disabled = false; btn.textContent = '保存';
    }
  }

  function toggleNewPasswordVisibility() {
    var input = sel('#new-password');
    var btn = sel('#new-password-toggle');
    var showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.textContent = showing ? '表示' : '隠す';
    btn.setAttribute('aria-label', showing ? 'パスワードを表示する' : 'パスワードを隠す');
    btn.title = showing ? '表示する' : '隠す';
  }

  async function createAccount() {
    var username = sel('#new-username').value.trim();
    var password = sel('#new-password').value;
    var division = sel('#new-division').value || null;
    if (!username || !password) { alert('ユーザー名とパスワードを入力してください'); return; }
    var res = await fetch(API, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ username: username, password: password, division: division })
    });
    var d = await res.json().catch(function() { return {}; });
    if (!res.ok) { alert(d.error || '作成に失敗しました'); return; }
    location.reload();
  }

  async function resetPassword(id) {
    var a = _accounts.find(function(x) { return x.id === id; });
    var pw = prompt((a ? a.username + ' の' : '') + '新しいパスワードを入力してください（8文字以上）');
    if (pw === null) return;
    var res = await fetch(API + '/' + id, {
      method: 'PUT', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ password: pw })
    });
    var d = await res.json().catch(function() { return {}; });
    if (!res.ok) { alert(d.error || '変更に失敗しました'); return; }
    alert('パスワードを変更しました');
  }

  async function deleteAccount(id) {
    var a = _accounts.find(function(x) { return x.id === id; });
    if (!confirm((a ? a.username : 'このアカウント') + ' を削除しますか？この操作は取り消せません。')) return;
    var res = await fetch(API + '/' + id, { method: 'DELETE' });
    var d = await res.json().catch(function() { return {}; });
    if (!res.ok) { alert(d.error || '削除に失敗しました'); return; }
    location.reload();
  }
  </script>`;
  return c.html(layout('アカウント権限管理', html, 'settings'));
});

// ===== API: アカウント =====

app.post('/api/accounts', async (c) => {
  const b = await c.req.json<{ username?: string; password?: string; division?: string | null }>();
  const username = (b.username ?? '').trim();
  const password = b.password ?? '';
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
    return c.json({ error: 'ユーザー名は3〜32文字の半角英数（-_可）で入力してください' }, 400);
  }
  if (password.length < 8) return c.json({ error: 'パスワードは8文字以上にしてください' }, 400);
  if (b.division != null && !VALID_DIVISIONS.has(b.division)) return c.json({ error: '所属課の指定が不正です' }, 400);
  const exists = await c.env.DB.prepare('SELECT id FROM admins WHERE username = ?').bind(username).first();
  if (exists) return c.json({ error: 'このユーザー名は既に使われています' }, 400);
  const hash = await hashPassword(password);
  // 作成直後は権限なし（空配列）。全権限にするのは明示操作のみ
  await c.env.DB.prepare('INSERT INTO admins (username, password, permissions, division) VALUES (?, ?, ?, ?)')
    .bind(username, hash, '[]', b.division ?? null).run();
  return c.json({ ok: true });
});

app.put('/api/accounts/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const target = await c.env.DB.prepare('SELECT id, username, permissions FROM admins WHERE id = ?')
    .bind(id).first<AdminRow>();
  if (!target) return c.json({ error: 'アカウントが見つかりません' }, 404);

  const b = await c.req.json<{ permissions?: string[] | null; password?: string; division?: string | null }>();

  if (b.password !== undefined) {
    if (b.password.length < 8) return c.json({ error: 'パスワードは8文字以上にしてください' }, 400);
    const hash = await hashPassword(b.password);
    await c.env.DB.prepare('UPDATE admins SET password = ? WHERE id = ?').bind(hash, id).run();
  }

  if (b.division !== undefined) {
    if (b.division !== null && !VALID_DIVISIONS.has(b.division)) return c.json({ error: '所属課の指定が不正です' }, 400);
    await c.env.DB.prepare('UPDATE admins SET division = ? WHERE id = ?').bind(b.division, id).run();
  }

  if (b.permissions !== undefined) {
    // 最後の全権限アカウントを制限付きに変えるとシステムを管理できる人がいなくなるためブロック
    if (b.permissions !== null && target.permissions === null) {
      const fulls = await countFullAccounts(c.env.DB);
      if (fulls <= 1) return c.json({ error: '最後の全権限アカウントを制限付きに変更することはできません' }, 400);
    }
    const value = b.permissions === null ? null : JSON.stringify(b.permissions.map(String));
    await c.env.DB.prepare('UPDATE admins SET permissions = ? WHERE id = ?').bind(value, id).run();
  }

  return c.json({ ok: true });
});

app.delete('/api/accounts/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  if (id === c.get('adminId')) return c.json({ error: '自分自身は削除できません' }, 400);
  const target = await c.env.DB.prepare('SELECT id, permissions FROM admins WHERE id = ?')
    .bind(id).first<AdminRow>();
  if (!target) return c.json({ error: 'アカウントが見つかりません' }, 404);
  if (target.permissions === null) {
    const fulls = await countFullAccounts(c.env.DB);
    if (fulls <= 1) return c.json({ error: '最後の全権限アカウントは削除できません' }, 400);
  }
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM admins WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

// ===== API: 権限プリセット =====

function sanitizePresetPerms(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v === 'string' && /^[a-zA-Z0-9_.-]{1,60}$/.test(v)) seen.add(v);
  }
  return [...seen];
}

app.get('/api/account-presets', async (c) => {
  return c.json({ items: await loadPresets(c.env.DB) });
});

app.post('/api/account-presets', async (c) => {
  const b = await c.req.json<{ name?: string; permissions?: unknown }>().catch(() => ({} as { name?: string; permissions?: unknown }));
  const name = (b.name ?? '').trim();
  if (!name || name.length > 40) return c.json({ error: 'プリセット名は1〜40文字で入力してください' }, 400);
  const perms = JSON.stringify(sanitizePresetPerms(b.permissions));
  const maxRow = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM permission_presets').first<{ m: number }>();
  const res = await c.env.DB.prepare(
    'INSERT INTO permission_presets (name, permissions, sort_order) VALUES (?, ?, ?)'
  ).bind(name, perms, (maxRow?.m ?? 0) + 1).run();
  return c.json({ ok: true, id: res.meta.last_row_id });
});

app.put('/api/account-presets/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT id FROM permission_presets WHERE id = ?').bind(id).first();
  if (!row) return c.json({ error: 'プリセットが見つかりません' }, 404);
  const b = await c.req.json<{ name?: string; permissions?: unknown }>().catch(() => ({} as { name?: string; permissions?: unknown }));
  if (b.name !== undefined) {
    const name = (b.name ?? '').trim();
    if (!name || name.length > 40) return c.json({ error: 'プリセット名は1〜40文字で入力してください' }, 400);
    await c.env.DB.prepare("UPDATE permission_presets SET name = ?, updated_at = datetime('now','localtime') WHERE id = ?").bind(name, id).run();
  }
  if (b.permissions !== undefined) {
    const perms = JSON.stringify(sanitizePresetPerms(b.permissions));
    await c.env.DB.prepare("UPDATE permission_presets SET permissions = ?, updated_at = datetime('now','localtime') WHERE id = ?").bind(perms, id).run();
  }
  return c.json({ ok: true });
});

app.delete('/api/account-presets/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM permission_presets WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
