// 設定 > アカウント権限管理
// 管理画面アカウントの作成・削除・機能ごとの閲覧/編集権限の設定
// ページ: /settings/accounts  API: /api/accounts*（権限キー settings.accounts）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { hashPassword } from '../auth';
import { layout, safeJson } from '../html/layout';
import { ADMIN_PATH } from '../config';
import { PERMISSION_CATALOG, parsePermissions } from '../permissions';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

type AdminRow = { id: number; username: string; permissions: string | null; created_at: string };

// 全権限アカウント（permissions NULL）の数
async function countFullAccounts(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM admins WHERE permissions IS NULL').first<{ n: number }>();
  return row?.n ?? 0;
}

// ===== ページ =====
app.get('/settings/accounts', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, username, permissions, created_at FROM admins ORDER BY id'
  ).all<AdminRow>();
  const accounts = (rows.results ?? []).map(a => ({
    id: a.id,
    username: a.username,
    permissions: parsePermissions(a.permissions),  // null = 全権限
    created_at: a.created_at,
  }));
  const selfId = c.get('adminId');

  const html = `
  <div style="max-width:760px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
      <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 設定に戻る</a>
      <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">アカウント権限管理</h2>
    </div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:16px;line-height:1.6;">
      機能ごとに「閲覧」「編集」を分けて設定できます。編集にチェックを入れるとデータの追加・変更・削除が可能になります。<br>
      <b>全権限</b>のアカウントはすべての機能にアクセスできます（統括管理者向け）。このページの編集権限を持つアカウントは他人に権限を付与できるため、付与先には注意してください。
    </div>

    <div id="account-list" style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;"></div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
      <div style="font-size:14px;font-weight:700;color:#1e3a5f;margin-bottom:10px;">＋ 新規アカウント作成</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <input id="new-username" type="text" placeholder="ユーザー名（半角英数）" autocomplete="off" style="width:170px;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;">
        <input id="new-password" type="text" placeholder="パスワード（8文字以上）" autocomplete="off" style="width:190px;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;">
        <button onclick="createAccount()" style="padding:8px 18px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">作成して権限を設定</button>
      </div>
      <div style="font-size:11px;color:#9ca3af;margin-top:6px;">作成直後は権限なしの状態です。続けて表示される画面で権限を設定してください。</div>
    </div>
  </div>

  <!-- 権限編集モーダル -->
  <div id="perm-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;padding:12px;">
    <div style="background:white;border-radius:12px;padding:20px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;">権限設定: <span id="perm-username"></span></h3>
        <button onclick="sel('#perm-modal').style.display='none'" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
      </div>
      <label style="display:flex;align-items:center;gap:8px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 12px;margin-bottom:12px;cursor:pointer;">
        <input type="checkbox" id="perm-full" onchange="toggleFullPerm()">
        <span style="font-size:13px;font-weight:700;color:#1d4ed8;">全権限（制限なし・統括管理者向け）</span>
      </label>
      <div id="perm-grid"></div>
      <div id="perm-error" style="display:none;color:#dc2626;font-size:12px;margin-top:8px;"></div>
      <div style="display:flex;gap:8px;margin-top:14px;">
        <button onclick="sel('#perm-modal').style.display='none'" style="flex:1;padding:10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;cursor:pointer;background:#fff;">キャンセル</button>
        <button onclick="savePermissions()" id="perm-save-btn" style="flex:2;padding:10px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;">保存</button>
      </div>
    </div>
  </div>

  <script>
  var API = '${ADMIN_PATH}/api/accounts';
  var CATALOG = ${safeJson(PERMISSION_CATALOG)};
  var SELF_ID = ${selfId};
  var _accounts = ${safeJson(accounts)};
  var _editingId = null;

  function sel(s) { return document.querySelector(s); }
  function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  function permSummary(perms) {
    if (perms === null) return '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700;">全権限</span>';
    var view = perms.filter(function(p) { return p.indexOf('.edit') === -1; }).length;
    var edit = perms.filter(function(p) { return p.indexOf('.edit') !== -1; }).length;
    if (view === 0 && edit === 0) return '<span style="background:#f3f4f6;color:#6b7280;padding:2px 10px;border-radius:99px;font-size:11px;">権限なし</span>';
    return '<span style="background:#f0fdf4;color:#166534;padding:2px 10px;border-radius:99px;font-size:11px;">閲覧 ' + view + '件 / 編集 ' + edit + '件</span>';
  }

  function renderList() {
    sel('#account-list').innerHTML = _accounts.map(function(a) {
      return '<div style="display:flex;align-items:center;gap:10px;background:white;border:1px solid #e5e7eb;border-radius:10px;padding:12px 16px;flex-wrap:wrap;">'
        + '<div style="font-size:14px;font-weight:700;color:#1e3a5f;min-width:110px;">' + escH(a.username) + (a.id === SELF_ID ? ' <span style="font-size:10px;color:#9ca3af;">(自分)</span>' : '') + '</div>'
        + '<div>' + permSummary(a.permissions) + '</div>'
        + '<div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;">'
        + '<button onclick="openPerm(' + a.id + ')" style="padding:6px 12px;background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:6px;font-size:12px;cursor:pointer;">権限編集</button>'
        + '<button onclick="resetPassword(' + a.id + ')" style="padding:6px 12px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:6px;font-size:12px;cursor:pointer;">パスワード再設定</button>'
        + (a.id === SELF_ID ? '' : '<button onclick="deleteAccount(' + a.id + ')" style="padding:6px 12px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:12px;cursor:pointer;">削除</button>')
        + '</div></div>';
    }).join('');
  }
  renderList();

  function toggleFullPerm() {
    sel('#perm-grid').style.opacity = sel('#perm-full').checked ? '0.35' : '1';
    sel('#perm-grid').style.pointerEvents = sel('#perm-full').checked ? 'none' : 'auto';
  }

  function openPerm(id) {
    var a = _accounts.find(function(x) { return x.id === id; });
    if (!a) return;
    _editingId = id;
    sel('#perm-username').textContent = a.username;
    var perms = a.permissions;
    sel('#perm-full').checked = perms === null;
    var set = {};
    (perms || []).forEach(function(p) { set[p] = true; });
    sel('#perm-grid').innerHTML = CATALOG.map(function(group) {
      return '<div style="font-size:12px;font-weight:700;color:#1e3a5f;background:#f8fafc;padding:5px 10px;border-radius:5px;margin:10px 0 4px;">' + escH(group.group) + '</div>'
        + '<table style="width:100%;border-collapse:collapse;">'
        + '<tr style="color:#9ca3af;font-size:10px;"><td></td><td style="width:56px;text-align:center;">閲覧</td><td style="width:56px;text-align:center;">編集</td></tr>'
        + group.items.map(function(item) {
            return '<tr>'
              + '<td style="font-size:13px;padding:4px 6px;border-bottom:1px solid #f9fafb;">' + escH(item.label) + '</td>'
              + '<td style="text-align:center;border-bottom:1px solid #f9fafb;"><input type="checkbox" class="perm-view" data-key="' + escH(item.key) + '"' + (set[item.key] ? ' checked' : '') + ' onchange="if(!this.checked){var e=document.querySelector(\\'.perm-edit[data-key=&quot;' + escH(item.key) + '&quot;]\\');if(e)e.checked=false;}"></td>'
              + '<td style="text-align:center;border-bottom:1px solid #f9fafb;"><input type="checkbox" class="perm-edit" data-key="' + escH(item.key) + '"' + (set[item.key + '.edit'] ? ' checked' : '') + ' onchange="if(this.checked){var v=document.querySelector(\\'.perm-view[data-key=&quot;' + escH(item.key) + '&quot;]\\');if(v)v.checked=true;}"></td>'
              + '</tr>';
          }).join('')
        + '</table>';
    }).join('');
    sel('#perm-error').style.display = 'none';
    toggleFullPerm();
    sel('#perm-modal').style.display = 'flex';
  }

  async function savePermissions() {
    var btn = sel('#perm-save-btn');
    btn.disabled = true; btn.textContent = '保存中...';
    var permissions = null;
    if (!sel('#perm-full').checked) {
      permissions = [];
      document.querySelectorAll('.perm-view').forEach(function(cb) { if (cb.checked) permissions.push(cb.dataset.key); });
      document.querySelectorAll('.perm-edit').forEach(function(cb) { if (cb.checked) permissions.push(cb.dataset.key + '.edit'); });
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

  async function createAccount() {
    var username = sel('#new-username').value.trim();
    var password = sel('#new-password').value;
    if (!username || !password) { alert('ユーザー名とパスワードを入力してください'); return; }
    var res = await fetch(API, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ username: username, password: password })
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

// ===== API =====

app.post('/api/accounts', async (c) => {
  const b = await c.req.json<{ username?: string; password?: string }>();
  const username = (b.username ?? '').trim();
  const password = b.password ?? '';
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
    return c.json({ error: 'ユーザー名は3〜32文字の半角英数（-_可）で入力してください' }, 400);
  }
  if (password.length < 8) return c.json({ error: 'パスワードは8文字以上にしてください' }, 400);
  const exists = await c.env.DB.prepare('SELECT id FROM admins WHERE username = ?').bind(username).first();
  if (exists) return c.json({ error: 'このユーザー名は既に使われています' }, 400);
  const hash = await hashPassword(password);
  // 作成直後は権限なし（空配列）。全権限にするのは明示操作のみ
  await c.env.DB.prepare('INSERT INTO admins (username, password, permissions) VALUES (?, ?, ?)')
    .bind(username, hash, '[]').run();
  return c.json({ ok: true });
});

app.put('/api/accounts/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const target = await c.env.DB.prepare('SELECT id, username, permissions FROM admins WHERE id = ?')
    .bind(id).first<AdminRow>();
  if (!target) return c.json({ error: 'アカウントが見つかりません' }, 404);

  const b = await c.req.json<{ permissions?: string[] | null; password?: string }>();

  if (b.password !== undefined) {
    if (b.password.length < 8) return c.json({ error: 'パスワードは8文字以上にしてください' }, 400);
    const hash = await hashPassword(b.password);
    await c.env.DB.prepare('UPDATE admins SET password = ? WHERE id = ?').bind(hash, id).run();
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

export default app;
