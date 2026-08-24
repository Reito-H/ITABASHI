// ハッピーバースデーモード: 一部の人だけを対象に、誕生日当日の設定時刻に全ページへお祝いポップアップを表示する
// ページ: /settings/birthday（対象者の名前・誕生日・顔写真の管理、発火時刻の設定、表示対象アカウント、テスト発火）
// 管理API: /api/birthday/celebrants・/api/birthday/fire-hours・/api/birthday/enabled-admins・/api/birthday/test-fire
//   （書き込みは settings.birthday.edit 必須）
// 表示用API: /api/birthday/active・/api/birthday/photo/:id
//   → 全アカウント共通で叩けるようにするため、index.ts の権限ミドルウェアでページ権限チェックを免除している
//     （root /api/* はGETを常に許可するため、実際には明示的な除外設定は不要。ただしログインは必須で c.get('adminId') が使える）
//   → 実際に演出を表示するかどうかは birthday_enabled_admins（表示対象アカウントのホワイトリスト）で絞り込む
// 発火判定は cron.ts の checkBirthdayFire が毎時0分に行い、birthday_fire_events に1行記録する
// テスト発火は birthday_test_triggers に1件保留し、対象アカウントの次回ポーリングで日時に関わらず消費・表示する
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout, safeJson, escHtml } from '../html/layout';
import { settingsSubHeader } from './admin';
import { ADMIN_PATH } from '../config';
import { getAdminPermissions } from '../permissions';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const ALLOWED_PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const MAX_PHOTO_SIZE = 8 * 1024 * 1024; // 8MB

type CelebrantRow = {
  id: number;
  name: string;
  birth_month: number;
  birth_day: number;
  photo_r2_key: string | null;
  photo_mime_type: string | null;
  is_active: number;
};

function r2KeyFor(ext: string): string {
  return `birthday-photos/${crypto.randomUUID()}.${ext}`;
}

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('settings.birthday.edit');
}

// 実在する日付かどうか（うるう年を含む2024年で判定。4/31のような不正な組み合わせを弾く）
function isValidMonthDay(month: number, day: number): boolean {
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1 || day > 31) return false;
  const d = new Date(2024, month - 1, day);
  return d.getMonth() === month - 1 && d.getDate() === day;
}

// ===== ページ =====
app.get('/settings/birthday', async (c) => {
  const editable = await canEdit(c);
  const [rows, hourRows, adminRows, enabledRows] = await Promise.all([
    c.env.DB.prepare(
      'SELECT id, name, birth_month, birth_day, photo_r2_key, photo_mime_type, is_active FROM birthday_celebrants ORDER BY birth_month ASC, birth_day ASC, id ASC'
    ).all<CelebrantRow>(),
    c.env.DB.prepare('SELECT hour FROM birthday_fire_hours ORDER BY hour ASC').all<{ hour: number }>(),
    c.env.DB.prepare('SELECT id, username FROM admins ORDER BY username ASC').all<{ id: number; username: string }>(),
    c.env.DB.prepare('SELECT admin_id FROM birthday_enabled_admins').all<{ admin_id: number }>(),
  ]);
  const celebrants = (rows.results ?? []).map(r => ({
    id: r.id, name: r.name, birthMonth: r.birth_month, birthDay: r.birth_day,
    hasPhoto: !!r.photo_r2_key, isActive: !!r.is_active,
  }));
  const fireHours = (hourRows.results ?? []).map(r => r.hour);
  const admins = (adminRows.results ?? []).map(r => ({ id: r.id, username: r.username }));
  const enabledAdminIds = (enabledRows.results ?? []).map(r => r.admin_id);

  const hourCheckboxes = Array.from({ length: 24 }, (_, h) => `
    <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#374151;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:5px 8px;">
      <input type="checkbox" class="fh-check" value="${h}" ${fireHours.includes(h) ? 'checked' : ''} ${editable ? '' : 'disabled'}>${h}時
    </label>`).join('');

  const adminCheckboxes = admins.map(a => `
    <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#374151;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:5px 8px;">
      <input type="checkbox" class="ea-check" value="${a.id}" ${enabledAdminIds.includes(a.id) ? 'checked' : ''} ${editable ? '' : 'disabled'}>${escHtml(a.username)}
    </label>`).join('');

  const testAccountOptions = admins.map(a => `<option value="${a.id}">${escHtml(a.username)}</option>`).join('');

  const testCelebrantCheckboxes = celebrants.map(cel => `
    <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:#374151;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:5px 8px;">
      <input type="checkbox" class="tc-check" value="${cel.id}" checked>${escHtml(cel.name)}
    </label>`).join('');

  const html = settingsSubHeader('ハッピーバースデーモード') + `
    <div style="max-width:760px;">
      <p style="font-size:12px;color:#6b7280;margin:0 0 20px;line-height:1.7;">
        登録した対象者の誕生日当日、下で設定した時刻になると管理画面の全ページにお祝いポップアップが表示されます。<br>
        社員管理とは独立した専用の対象者リストです（一部の人だけをお祝いする想定のため）。
      </p>

      <div style="background:white;border-radius:10px;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border:1px solid #e5e7eb;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:4px;">発火時刻</div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">チェックした時刻ごとに1回、対象者がいるか判定してポップアップを発火します（複数選択可）。</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:${editable ? '12px' : '0'};">
          ${hourCheckboxes}
        </div>
        ${editable ? `
        <button type="button" onclick="saveFireHours()" id="fh-save-btn" style="padding:7px 20px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;">保存</button>
        <span id="fh-msg" style="font-size:12px;color:#dc2626;margin-left:10px;"></span>` : ''}
      </div>

      <div style="background:white;border-radius:10px;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border:1px solid #e5e7eb;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:4px;">表示対象アカウント</div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">チェックしたアカウントだけにお祝いポップアップが表示されます（1つも選ばれていない場合は誰にも表示されません）。</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:${editable ? '12px' : '0'};">
          ${adminCheckboxes || '<span style="font-size:12px;color:#9ca3af;">アカウントがありません</span>'}
        </div>
        ${editable ? `
        <button type="button" onclick="saveEnabledAdmins()" id="ea-save-btn" style="padding:7px 20px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;">保存</button>
        <span id="ea-msg" style="font-size:12px;color:#dc2626;margin-left:10px;"></span>` : ''}
      </div>

      ${editable ? `
      <div style="background:white;border-radius:10px;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border:1px solid #e5e7eb;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:4px;">テスト発火</div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">指定したアカウントに対して、誕生日や発火時刻・表示対象アカウントの設定に関係なく次回のポップアップ表示を1回だけ強制します。演出に登場させる対象者も選べます（複数選ぶと1人ずつ画面が切り替わります）。</div>
        <div style="font-size:11px;color:#374151;margin-bottom:4px;">演出に出す対象者</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
          ${testCelebrantCheckboxes || '<span style="font-size:12px;color:#9ca3af;">対象者が登録されていません</span>'}
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <select id="test-account" style="border:1px solid #d1d5db;border-radius:6px;padding:7px 10px;font-size:13px;">
            ${testAccountOptions || '<option value="">アカウントがありません</option>'}
          </select>
          <button type="button" onclick="fireTest()" id="test-fire-btn" style="padding:7px 20px;background:#b45309;color:white;border:none;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;">テスト実行</button>
          <span id="test-msg" style="font-size:12px;color:#6b7280;"></span>
        </div>
      </div>` : ''}

      ${editable ? `
      <div style="margin-bottom:14px;">
        <button onclick="openAdd()" style="padding:8px 20px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">お祝い対象者を追加</button>
      </div>` : ''}

      <div id="cel-list" style="display:flex;flex-direction:column;gap:10px;"></div>
    </div>

    <div id="cel-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:50;overflow-y:auto;padding:24px;">
      <div style="background:white;border-radius:12px;max-width:420px;margin:0 auto;padding:24px;">
        <h3 id="cel-modal-title" style="font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:16px;"></h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <label style="font-size:12px;color:#374151;">名前<br>
            <input type="text" id="f-name" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;box-sizing:border-box;">
          </label>
          <label style="font-size:12px;color:#374151;">誕生日<br>
            <div style="display:flex;gap:8px;align-items:center;">
              <select id="f-month" style="border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
                ${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}月</option>`).join('')}
              </select>
              <select id="f-day" style="border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
                ${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}日</option>`).join('')}
              </select>
            </div>
          </label>
          <label style="font-size:12px;color:#374151;display:flex;align-items:center;gap:6px;">
            <input type="checkbox" id="f-active" checked> 演出を有効にする（一時停止したいときはOFF）
          </label>
          <label style="font-size:12px;color:#374151;">顔写真（任意）<br>
            <input type="file" id="f-photo" accept="image/jpeg,image/png,image/gif,image/webp" style="width:100%;font-size:13px;">
          </label>
          <div id="cel-photo-current" style="font-size:11px;color:#6b7280;"></div>
        </div>
        <div id="cel-form-msg" style="font-size:12px;color:#dc2626;margin-top:10px;"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
          <button onclick="closeModal()" style="padding:8px 20px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">キャンセル</button>
          <button onclick="saveCelebrant()" id="cel-save-btn" style="padding:8px 24px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">保存</button>
        </div>
      </div>
    </div>

    <script>
    var EDITABLE = ${editable ? 'true' : 'false'};
    var CELEBRANTS = ${safeJson(celebrants)};
    var API = ${safeJson(`${ADMIN_PATH}/api/birthday`)};
    // 写真は秘密パス配下ではなくルート /api/birthday/photo に公開しているため別変数を使う（表示用APIと共用）
    var PHOTO_API = '/api/birthday/photo';
    var editingId = 0;

    function escHtmlJs(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function attrJson(v) { return JSON.stringify(v).replace(/"/g, '&quot;'); }

    function renderList() {
      var wrap = document.getElementById('cel-list');
      if (CELEBRANTS.length === 0) {
        wrap.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">お祝い対象者が登録されていません</div>';
        return;
      }
      wrap.innerHTML = CELEBRANTS.map(function(r) {
        var photoCell = r.hasPhoto
          ? '<img src="' + PHOTO_API + '/' + r.id + '" style="width:48px;height:48px;border-radius:50%;object-fit:cover;flex-shrink:0;">'
          : '<div style="width:48px;height:48px;border-radius:50%;background:#f3f4f6;color:#9ca3af;display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0;">写真なし</div>';
        var actions = EDITABLE
          ? '<button onclick="openEdit(' + r.id + ')" style="padding:5px 12px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">編集</button>'
            + ' <button onclick="delCelebrant(' + r.id + ',' + attrJson(r.name) + ')" style="padding:5px 10px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">削除</button>'
          : '';
        return '<div class="cel-row" data-id="' + r.id + '" style="display:flex;align-items:center;gap:12px;background:white;border-radius:10px;padding:10px 14px;box-shadow:0 1px 3px rgba(0,0,0,0.08);' + (r.isActive ? '' : 'opacity:0.55;') + '">'
          + photoCell
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-weight:700;color:#1f2937;font-size:13px;">' + escHtmlJs(r.name) + '</div>'
          + '<div style="font-size:12px;color:#6b7280;margin-top:2px;">' + r.birthMonth + '月' + r.birthDay + '日' + (r.isActive ? '' : '　<span style="color:#dc2626;">停止中</span>') + '</div>'
          + '</div>'
          + '<div style="white-space:nowrap;">' + actions + '</div></div>';
      }).join('');
    }

    function openAdd() {
      editingId = 0;
      document.getElementById('cel-modal-title').textContent = 'お祝い対象者を追加';
      document.getElementById('f-name').value = '';
      document.getElementById('f-month').value = '1';
      document.getElementById('f-day').value = '1';
      document.getElementById('f-active').checked = true;
      document.getElementById('f-photo').value = '';
      document.getElementById('cel-photo-current').textContent = '';
      document.getElementById('cel-form-msg').textContent = '';
      document.getElementById('cel-modal').style.display = 'block';
    }
    function openEdit(id) {
      var r = CELEBRANTS.find(function(x) { return x.id === id; });
      if (!r) return;
      editingId = id;
      document.getElementById('cel-modal-title').textContent = '対象者の編集: ' + r.name;
      document.getElementById('f-name').value = r.name;
      document.getElementById('f-month').value = String(r.birthMonth);
      document.getElementById('f-day').value = String(r.birthDay);
      document.getElementById('f-active').checked = r.isActive;
      document.getElementById('f-photo').value = '';
      document.getElementById('cel-photo-current').textContent = r.hasPhoto ? '現在の写真があります（新しい写真を選ぶと差し替わります）' : '写真は未登録です';
      document.getElementById('cel-form-msg').textContent = '';
      document.getElementById('cel-modal').style.display = 'block';
    }
    function closeModal() { document.getElementById('cel-modal').style.display = 'none'; }

    async function saveCelebrant() {
      var name = document.getElementById('f-name').value.trim();
      var msg = document.getElementById('cel-form-msg');
      if (!name) { msg.textContent = '名前を入力してください'; return; }

      var btn = document.getElementById('cel-save-btn');
      btn.disabled = true; btn.textContent = '保存中...';
      try {
        var fd = new FormData();
        fd.append('name', name);
        fd.append('birth_month', document.getElementById('f-month').value);
        fd.append('birth_day', document.getElementById('f-day').value);
        fd.append('is_active', document.getElementById('f-active').checked ? '1' : '0');
        var file = document.getElementById('f-photo').files[0];
        if (file) fd.append('photo', file);

        var url = editingId ? (API + '/celebrants/' + editingId) : (API + '/celebrants');
        var res = await fetch(url, { method: 'POST', body: fd });
        if (res.ok) { location.reload(); return; }
        var j = await res.json().catch(function() { return {}; });
        msg.textContent = j.error || '保存に失敗しました';
      } catch (e) {
        msg.textContent = '通信エラーが発生しました';
      }
      btn.disabled = false; btn.textContent = '保存';
    }

    async function delCelebrant(id, name) {
      if (!confirm('対象者「' + name + '」を削除しますか？')) return;
      await fetch(API + '/celebrants/' + id, { method: 'DELETE' });
      location.reload();
    }

    function saveFireHours() {
      var hours = [];
      document.querySelectorAll('.fh-check:checked').forEach(function(el) { hours.push(Number(el.value)); });
      var btn = document.getElementById('fh-save-btn');
      var msg = document.getElementById('fh-msg');
      btn.disabled = true; var orig = btn.textContent; btn.textContent = '保存中…'; msg.textContent = '';
      fetch(API + '/fire-hours', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hours: hours }),
      })
        .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
        .then(function(res) {
          btn.disabled = false; btn.textContent = orig;
          if (!res.ok) { msg.textContent = res.j.error || '保存に失敗しました'; return; }
          msg.textContent = '保存しました';
          setTimeout(function() { msg.textContent = ''; }, 2500);
        })
        .catch(function() { btn.disabled = false; btn.textContent = orig; msg.textContent = '通信エラーが発生しました'; });
    }

    function saveEnabledAdmins() {
      var ids = [];
      document.querySelectorAll('.ea-check:checked').forEach(function(el) { ids.push(Number(el.value)); });
      var btn = document.getElementById('ea-save-btn');
      var msg = document.getElementById('ea-msg');
      btn.disabled = true; var orig = btn.textContent; btn.textContent = '保存中…'; msg.textContent = '';
      fetch(API + '/enabled-admins', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminIds: ids }),
      })
        .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
        .then(function(res) {
          btn.disabled = false; btn.textContent = orig;
          if (!res.ok) { msg.textContent = res.j.error || '保存に失敗しました'; return; }
          msg.textContent = '保存しました';
          setTimeout(function() { msg.textContent = ''; }, 2500);
        })
        .catch(function() { btn.disabled = false; btn.textContent = orig; msg.textContent = '通信エラーが発生しました'; });
    }

    function fireTest() {
      var sel = document.getElementById('test-account');
      var adminId = Number(sel.value);
      if (!adminId) return;
      var celebrantIds = [];
      document.querySelectorAll('.tc-check:checked').forEach(function(el) { celebrantIds.push(Number(el.value)); });
      var msg = document.getElementById('test-msg');
      if (!celebrantIds.length) { msg.style.color = '#dc2626'; msg.textContent = '演出に出す対象者を1人以上選んでください'; return; }
      var btn = document.getElementById('test-fire-btn');
      btn.disabled = true; var orig = btn.textContent; btn.textContent = '実行中…'; msg.style.color = '#6b7280'; msg.textContent = '';
      fetch(API + '/test-fire', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminId: adminId, celebrantIds: celebrantIds }),
      })
        .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
        .then(function(res) {
          btn.disabled = false; btn.textContent = orig;
          if (!res.ok) { msg.style.color = '#dc2626'; msg.textContent = res.j.error || '実行に失敗しました'; return; }
          msg.style.color = '#059669';
          msg.textContent = '「' + sel.options[sel.selectedIndex].textContent + '」の次回表示でポップアップが出ます';
          setTimeout(function() { msg.textContent = ''; }, 4000);
        })
        .catch(function() { btn.disabled = false; btn.textContent = orig; msg.style.color = '#dc2626'; msg.textContent = '通信エラーが発生しました'; });
    }

    renderList();
    </script>`;

  return c.html(layout('ハッピーバースデーモード', html, 'settings'));
});

// ===== 管理API（対象者CRUD） =====
app.post('/api/birthday/celebrants', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  let form: FormData;
  try { form = await c.req.formData(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }

  const name = String(form.get('name') ?? '').trim();
  const birthMonth = parseInt(String(form.get('birth_month') ?? ''), 10);
  const birthDay = parseInt(String(form.get('birth_day') ?? ''), 10);
  const isActive = String(form.get('is_active') ?? '1') === '1' ? 1 : 0;
  const photo = form.get('photo');

  if (!name) return c.json({ error: '名前を入力してください' }, 400);
  if (!isValidMonthDay(birthMonth, birthDay)) return c.json({ error: '誕生日が不正です' }, 400);

  let photoR2Key: string | null = null;
  let photoMimeType: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_PHOTO_SIZE) return c.json({ error: `写真サイズは${MAX_PHOTO_SIZE / 1024 / 1024}MB以下にしてください` }, 400);
    const ext = (photo.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_PHOTO_EXTENSIONS.includes(ext)) {
      return c.json({ error: `対応していない写真形式です（対応形式: ${ALLOWED_PHOTO_EXTENSIONS.join(', ')}）` }, 400);
    }
    photoR2Key = r2KeyFor(ext);
    photoMimeType = photo.type || 'application/octet-stream';
    await c.env.DOCUMENTS_BUCKET.put(photoR2Key, photo.stream(), { httpMetadata: { contentType: photoMimeType } });
  }

  const r = await c.env.DB.prepare(`
    INSERT INTO birthday_celebrants (name, birth_month, birth_day, photo_r2_key, photo_mime_type, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(name, birthMonth, birthDay, photoR2Key, photoMimeType, isActive).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

app.post('/api/birthday/celebrants/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'), 10);
  let form: FormData;
  try { form = await c.req.formData(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }

  const name = String(form.get('name') ?? '').trim();
  const birthMonth = parseInt(String(form.get('birth_month') ?? ''), 10);
  const birthDay = parseInt(String(form.get('birth_day') ?? ''), 10);
  const isActive = String(form.get('is_active') ?? '1') === '1' ? 1 : 0;
  const photo = form.get('photo');

  if (!name) return c.json({ error: '名前を入力してください' }, 400);
  if (!isValidMonthDay(birthMonth, birthDay)) return c.json({ error: '誕生日が不正です' }, 400);

  const existing = await c.env.DB.prepare('SELECT photo_r2_key FROM birthday_celebrants WHERE id = ?')
    .bind(id).first<{ photo_r2_key: string | null }>();
  if (!existing) return c.json({ error: '見つかりません' }, 404);

  let photoR2Key = existing.photo_r2_key;
  let photoMimeType: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_PHOTO_SIZE) return c.json({ error: `写真サイズは${MAX_PHOTO_SIZE / 1024 / 1024}MB以下にしてください` }, 400);
    const ext = (photo.name.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_PHOTO_EXTENSIONS.includes(ext)) {
      return c.json({ error: `対応していない写真形式です（対応形式: ${ALLOWED_PHOTO_EXTENSIONS.join(', ')}）` }, 400);
    }
    const newKey = r2KeyFor(ext);
    photoMimeType = photo.type || 'application/octet-stream';
    await c.env.DOCUMENTS_BUCKET.put(newKey, photo.stream(), { httpMetadata: { contentType: photoMimeType } });
    if (existing.photo_r2_key) await c.env.DOCUMENTS_BUCKET.delete(existing.photo_r2_key).catch(() => {});
    photoR2Key = newKey;
  }

  if (photoMimeType) {
    await c.env.DB.prepare(`
      UPDATE birthday_celebrants SET name = ?, birth_month = ?, birth_day = ?, photo_r2_key = ?, photo_mime_type = ?, is_active = ?, updated_at = datetime('now','localtime') WHERE id = ?
    `).bind(name, birthMonth, birthDay, photoR2Key, photoMimeType, isActive, id).run();
  } else {
    await c.env.DB.prepare(`
      UPDATE birthday_celebrants SET name = ?, birth_month = ?, birth_day = ?, is_active = ?, updated_at = datetime('now','localtime') WHERE id = ?
    `).bind(name, birthMonth, birthDay, isActive, id).run();
  }
  return c.json({ ok: true });
});

app.delete('/api/birthday/celebrants/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'), 10);
  const row = await c.env.DB.prepare('SELECT photo_r2_key FROM birthday_celebrants WHERE id = ?')
    .bind(id).first<{ photo_r2_key: string | null }>();
  if (!row) return c.json({ error: '見つかりません' }, 404);

  if (row.photo_r2_key) await c.env.DOCUMENTS_BUCKET.delete(row.photo_r2_key).catch(() => {});
  await c.env.DB.prepare('DELETE FROM birthday_celebrants WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ===== 管理API（発火時刻） =====
app.post('/api/birthday/fire-hours', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ hours?: number[] }>().catch(() => ({}) as { hours?: number[] });
  const hours = Array.isArray(b.hours)
    ? Array.from(new Set(b.hours.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= 23)))
    : [];

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM birthday_fire_hours'),
    ...hours.map(h => c.env.DB.prepare('INSERT INTO birthday_fire_hours (hour) VALUES (?)').bind(h)),
  ]);
  return c.json({ ok: true });
});

// ===== 管理API（表示対象アカウント） =====
app.post('/api/birthday/enabled-admins', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ adminIds?: number[] }>().catch(() => ({}) as { adminIds?: number[] });
  const adminIds = Array.isArray(b.adminIds)
    ? Array.from(new Set(b.adminIds.map(Number).filter(n => Number.isInteger(n) && n > 0)))
    : [];

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM birthday_enabled_admins'),
    ...adminIds.map(id => c.env.DB.prepare('INSERT INTO birthday_enabled_admins (admin_id) VALUES (?)').bind(id)),
  ]);
  return c.json({ ok: true });
});

// ===== 管理API（テスト発火） =====
// 指定アカウント×指定対象者で1件だけ保留する。誕生日・発火時刻・表示対象アカウントの設定に関わらず
// そのアカウントの次回ポーリングで消費・表示される（/active 側で判定・削除する）
app.post('/api/birthday/test-fire', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ adminId?: number; celebrantIds?: number[] }>().catch(() => ({}) as { adminId?: number; celebrantIds?: number[] });
  const adminId = Number(b.adminId);
  if (!Number.isInteger(adminId) || adminId <= 0) return c.json({ error: '対象アカウントを選択してください' }, 400);

  const celebrantIds = Array.isArray(b.celebrantIds)
    ? Array.from(new Set(b.celebrantIds.map(Number).filter(n => Number.isInteger(n) && n > 0)))
    : [];
  if (!celebrantIds.length) return c.json({ error: '対象者を1人以上選択してください' }, 400);

  const admin = await c.env.DB.prepare('SELECT id FROM admins WHERE id = ?').bind(adminId).first();
  if (!admin) return c.json({ error: 'アカウントが見つかりません' }, 404);

  await c.env.DB.prepare(
    `INSERT INTO birthday_test_triggers (admin_id, celebrant_ids, created_at) VALUES (?, ?, datetime('now','localtime'))
     ON CONFLICT(admin_id) DO UPDATE SET celebrant_ids = excluded.celebrant_ids, created_at = excluded.created_at`
  ).bind(adminId, JSON.stringify(celebrantIds)).run();
  return c.json({ ok: true });
});

export default app;

// ===== 表示用API（ADMIN_PATHの秘密パス配下ではなくルート /api/birthday にマウントする。
// 全ページのlayout.tsから秘密パスを意識せず叩けるようにするため。アナウンスバーと同じ扱い。
// root /api/* はGETを常に許可する（index.tsの権限ミドルウェアはPOST/PATCH/DELETEのみ制限するため、
// GETのみのこのAPIは明示的な除外設定なしで全アカウントから利用できる） =====
export const birthdayPublicApi = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

// 本日分で最後に発火したイベント（対象者一覧つき）を返す。存在しなければ event: null
birthdayPublicApi.get('/active', async (c) => {
  const adminId = c.get('adminId');

  // テスト発火: 誕生日・発火時刻・表示対象アカウントの設定に関わらず最優先で1回だけ消費する
  if (adminId) {
    const testRow = await c.env.DB.prepare('SELECT celebrant_ids FROM birthday_test_triggers WHERE admin_id = ?')
      .bind(adminId).first<{ celebrant_ids: string | null }>();
    if (testRow) {
      await c.env.DB.prepare('DELETE FROM birthday_test_triggers WHERE admin_id = ?').bind(adminId).run();

      let testIds: number[] = [];
      try { testIds = JSON.parse(testRow.celebrant_ids ?? '[]'); } catch { testIds = []; }
      testIds = testIds.filter(n => Number.isInteger(n)).slice(0, 50);

      const celebrants = testIds.length
        ? await c.env.DB.prepare(
            `SELECT id, name, photo_r2_key FROM birthday_celebrants WHERE id IN (${testIds.map(() => '?').join(',')}) ORDER BY birth_month ASC, birth_day ASC, id ASC`
          ).bind(...testIds).all<{ id: number; name: string; photo_r2_key: string | null }>()
        : await c.env.DB.prepare(
            'SELECT id, name, photo_r2_key FROM birthday_celebrants WHERE is_active = 1 ORDER BY birth_month ASC, birth_day ASC, id ASC'
          ).all<{ id: number; name: string; photo_r2_key: string | null }>();
      const list = celebrants.results ?? [];
      if (list.length) {
        return c.json({
          event: {
            id: `test-${Date.now()}`,
            celebrants: list.map(r => ({ id: r.id, name: r.name, hasPhoto: !!r.photo_r2_key })),
          },
        });
      }
      // 対象者が1人も見つからない場合はそのままテスト消費のみ行い、通常判定にフォールバックする
    }
  }

  // 表示対象アカウントのホワイトリストに入っていなければ何も表示しない
  if (!adminId) return c.json({ event: null });
  const enabled = await c.env.DB.prepare('SELECT 1 FROM birthday_enabled_admins WHERE admin_id = ?')
    .bind(adminId).first();
  if (!enabled) return c.json({ event: null });

  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayStr = nowJST.toISOString().split('T')[0];

  const row = await c.env.DB.prepare(
    'SELECT id, celebrant_ids FROM birthday_fire_events WHERE event_date = ? ORDER BY hour DESC LIMIT 1'
  ).bind(todayStr).first<{ id: number; celebrant_ids: string }>();
  if (!row) return c.json({ event: null });

  let ids: number[] = [];
  try { ids = JSON.parse(row.celebrant_ids); } catch { ids = []; }
  ids = ids.filter(n => Number.isInteger(n)).slice(0, 50);
  if (!ids.length) return c.json({ event: null });

  const placeholders = ids.map(() => '?').join(',');
  const celebrants = await c.env.DB.prepare(
    `SELECT id, name, photo_r2_key FROM birthday_celebrants WHERE id IN (${placeholders})`
  ).bind(...ids).all<{ id: number; name: string; photo_r2_key: string | null }>();

  return c.json({
    event: {
      id: row.id,
      celebrants: (celebrants.results ?? []).map(r => ({ id: r.id, name: r.name, hasPhoto: !!r.photo_r2_key })),
    },
  });
});

// 対象者の顔写真（ポップアップ・管理画面サムネイル兼用）
birthdayPublicApi.get('/photo/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const row = await c.env.DB.prepare('SELECT photo_r2_key, photo_mime_type FROM birthday_celebrants WHERE id = ?')
    .bind(id).first<{ photo_r2_key: string | null; photo_mime_type: string | null }>();
  if (!row || !row.photo_r2_key) return c.json({ error: '見つかりません' }, 404);

  const obj = await c.env.DOCUMENTS_BUCKET.get(row.photo_r2_key);
  if (!obj) return c.json({ error: '写真が見つかりません' }, 404);

  const headers = new Headers();
  headers.set('Content-Type', row.photo_mime_type || 'application/octet-stream');
  return new Response(obj.body, { headers });
});
