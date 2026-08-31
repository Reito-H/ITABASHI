// マニュアルモード（ブラウザごとのフローティング・クイックリンクバー）の設定ページ・API
//
//   ページ    : /settings/manual-mode                    （権限: settings ＝設定を開ける人全員／PATH_PERMISSIONS の /^\/settings/ で自動ガード）
//   管理API   : /api/manual-mode/profiles*               （同上・/^\/settings/ ではなく個別に settings を要求）
//   表示用API : （別マウント）/api/manual-mode/bar/*      （manualModePublicApi。ログイン必須・ページ権限は免除）
//
//   マスの内容は「登録者（プロフィール）」単位で D1 に保存する。
//   どの登録者のバーを使うか（または表示しない）は各ブラウザの localStorage(mm_active_profile_id) が持つ。
//   バー本体の描画・スクリプトは html/manual_mode_bar.ts、layout() から全ページに差し込む。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { settingsSubHeader } from './admin';
import { getAdminPermissions } from '../permissions';
import { ADMIN_PATH } from '../config';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

export const MAX_SLOTS = 20; // 2行 × 10マス

// システム内ページのカタログ（設定ページのプルダウン用）。ここに無いページはパス手入力で対応する。
// href は ADMIN_PATH からの相対（先頭 "/"）。バー表示時に ADMIN_PATH を前置する。
export const PAGE_CATALOG: Array<{ group: string; items: Array<{ path: string; label: string }> }> = [
  { group: 'メインメニュー', items: [
    { path: '', label: 'ホーム' },
    { path: '/settings/reports', label: '報告センター' },
    { path: '/kancho-shift', label: '班長シフト' },
    { path: '/kanri-kobo', label: '管理者公休表' },
    { path: '/handover', label: '引き継ぎシート' },
    { path: '/newcomers', label: '総合新人管理' },
    { path: '/staff', label: '社員管理' },
    { path: '/kacho-mission', label: '課長ミッション' },
    { path: '/sales-ai', label: 'AI売上分析' },
    { path: '/accidents', label: '事故分析' },
    { path: '/vehicles', label: '車両検索' },
    { path: '/benri', label: '便利ハブ' },
    { path: '/shuttle', label: 'シャトルバス' },
    { path: '/inspection', label: '点検管理' },
    { path: '/settings', label: '設定' },
  ]},
  { group: '報告センターの各タブ', items: [
    { path: '/settings/reports?tab=lost-items', label: '忘れ物報告' },
    { path: '/settings/reports?tab=accidents', label: '事故報告' },
    { path: '/settings/reports?tab=violations', label: '違反報告' },
    { path: '/settings/reports?tab=general-reports', label: '一般報告' },
    { path: '/settings/reports?tab=handover-memos', label: '引き継ぎメモ' },
  ]},
  { group: 'よく使う設定・その他', items: [
    { path: '/tantosha', label: '担当車表' },
    { path: '/garage', label: '車庫見取り図' },
    { path: '/line', label: 'LINE管理' },
    { path: '/announcements', label: 'お知らせ配信' },
    { path: '/cc-list', label: 'CC名簿' },
    { path: '/usage', label: 'LINE利用状況' },
    { path: '/settings/accounts', label: 'アカウント権限管理' },
    { path: '/settings/liff', label: 'LINE連携' },
    { path: '/settings/shift', label: 'シフト関連の設定' },
    { path: '/settings/dia', label: '勤務ダイヤ・サイクル' },
    { path: '/settings/documents', label: 'データセンター' },
    { path: '/settings/status', label: 'システムステータス' },
    { path: '/settings/chosei', label: '調整' },
    { path: '/settings/study-sessions', label: '営業所ページ' },
  ]},
];

function escapeHtml(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// マニュアルモードは専用の細かい権限キーを持たない。設定ページを開ける人＝閲覧・編集とも可。
async function canUse(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('settings');
}

const S = (v: unknown, max: number): string => String(v ?? '').slice(0, max).trim();

// 1文字ラベル: 先頭の1文字（サロゲートペア考慮）だけ採用
function oneChar(v: unknown): string {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return Array.from(s)[0] ?? '';
}

// href の検証: 管理画面内の相対パス（/... 、ADMIN_PATH からの相対）だけ許可する。
// 外部URL・javascript: 等は弾く。
function sanitizeHref(v: unknown): string {
  let s = String(v ?? '').trim();
  if (!s) return '';
  // ADMIN_PATH を丸ごと貼られたら剥がして相対に寄せる
  if (s.startsWith(ADMIN_PATH)) s = s.slice(ADMIN_PATH.length);
  if (s === '' || s === '/') return ADMIN_PATH;
  if (!s.startsWith('/')) return '';               // 相対 or スキーム付きは不可
  if (s.startsWith('//')) return '';               // protocol-relative は不可
  if (/[\x00-\x1f]/.test(s)) return '';
  return ADMIN_PATH + s;
}

type ProfileRow = { id: number; name: string; sort_order: number };
type SlotRow = { id: number; profile_id: number; position: number; label: string; title: string; href: string };

async function loadProfiles(env: Env): Promise<ProfileRow[]> {
  const r = await env.DB.prepare('SELECT id, name, sort_order FROM manual_mode_profiles ORDER BY sort_order, id').all<ProfileRow>();
  return r.results ?? [];
}
async function loadSlots(env: Env, profileId: number): Promise<SlotRow[]> {
  const r = await env.DB.prepare(
    'SELECT id, profile_id, position, label, title, href FROM manual_mode_slots WHERE profile_id = ? ORDER BY position'
  ).bind(profileId).all<SlotRow>();
  return r.results ?? [];
}

// ============================================================
// 設定ページ
// ============================================================
app.get('/settings/manual-mode', async (c) => {
  if (!(await canUse(c))) return c.text('権限がありません', 403);
  const profiles = await loadProfiles(c.env);

  const catalogJson = JSON.stringify(PAGE_CATALOG);
  const profilesJson = JSON.stringify(profiles);

  const optionsHtml = PAGE_CATALOG.map(g =>
    `<optgroup label="${escapeHtml(g.group)}">` +
    g.items.map(it => `<option value="${escapeHtml(it.path)}">${escapeHtml(it.label)}</option>`).join('') +
    `</optgroup>`
  ).join('');

  const body = settingsSubHeader('マニュアルモード') + `
  <div style="max-width:900px;">
    <p style="font-size:12px;color:#6b7280;margin:0 0 16px;line-height:1.8;">
      管理画面の全ページの下・中央に、すぐ開きたいページへのショートカットを並べた小さなバーを常時表示する機能です。<br>
      同じアカウントを複数人で使っている場合に備え、バーの中身は<strong>「登録者」ごと</strong>に持ちます。まず登録者を作り、その人のマス（最大 2段×10＝20個）を設定してください。<br>
      実際にどの登録者のバーを出すか（または出さないか）は、下の「このブラウザで使う」で選びます。この選択は<strong>この端末のブラウザにのみ</strong>保存されます。
    </p>

    <!-- このブラウザで使う -->
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 18px;margin-bottom:22px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">このブラウザで使う</div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <select id="mm-active-select" style="border:1px solid #d1d5db;border-radius:6px;padding:7px 12px;font-size:13px;min-width:220px;">
          <option value="">― 表示しない ―</option>
        </select>
        <button type="button" onclick="mmApplyActive()" style="padding:7px 18px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;">このブラウザに反映</button>
        <span id="mm-active-msg" style="font-size:12px;color:#166534;"></span>
      </div>
      <div id="mm-preview" style="margin-top:14px;"></div>
    </div>

    <!-- 登録者リスト -->
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
      <input id="mm-new-name" type="text" maxlength="30" placeholder="登録者の名前（例: 田中）" style="border:1px solid #d1d5db;border-radius:6px;padding:7px 12px;font-size:13px;">
      <button type="button" onclick="mmAddProfile()" style="padding:7px 16px;background:#166534;color:white;border:none;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;">登録者を追加</button>
    </div>

    <div id="mm-profiles"></div>
  </div>

  <template id="mm-slot-catalog-options">${optionsHtml}</template>

  <script>
  (function () {
    var ADMIN = ${JSON.stringify(ADMIN_PATH)};
    var API = ADMIN + '/api/manual-mode';
    var MAX_SLOTS = ${MAX_SLOTS};
    var CATALOG = ${catalogJson};
    var LS_KEY = 'mm_active_profile_id';
    var profiles = ${profilesJson};
    var slotsCache = {}; // profileId -> [{label,title,href}]
    var openProfileId = null;

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; }); }
    function labelForPath(p) {
      for (var i = 0; i < CATALOG.length; i++) for (var j = 0; j < CATALOG[i].items.length; j++) {
        if (CATALOG[i].items[j].path === p) return CATALOG[i].items[j].label;
      }
      return '';
    }
    function catalogOptionsHtml() { return document.getElementById('mm-slot-catalog-options').innerHTML; }

    // ---- 登録者セレクト（このブラウザで使う） ----
    function refreshActiveSelect() {
      var sel = document.getElementById('mm-active-select');
      var cur = sel.value;
      sel.innerHTML = '<option value="">― 表示しない ―</option>' +
        profiles.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + '</option>'; }).join('');
      var saved = null;
      try { saved = localStorage.getItem(LS_KEY); } catch (e) {}
      sel.value = (saved && profiles.some(function (p) { return String(p.id) === String(saved); })) ? saved : (cur || '');
      renderPreview();
    }
    window.mmApplyActive = function () {
      var v = document.getElementById('mm-active-select').value;
      try {
        if (v) localStorage.setItem(LS_KEY, v); else localStorage.removeItem(LS_KEY);
      } catch (e) {}
      var msg = document.getElementById('mm-active-msg');
      msg.textContent = 'このブラウザに反映しました。ページを再読み込みするとバーに反映されます。';
      setTimeout(function () { msg.textContent = ''; }, 4000);
      renderPreview();
    };
    function renderPreview() {
      var v = document.getElementById('mm-active-select').value;
      var box = document.getElementById('mm-preview');
      if (!v) { box.innerHTML = '<span style="font-size:12px;color:#9ca3af;">バーは表示されません。</span>'; return; }
      ensureSlots(Number(v), function (slots) {
        var filled = slots.filter(function (s) { return s.label && s.href; });
        if (!filled.length) { box.innerHTML = '<span style="font-size:12px;color:#9ca3af;">マスが未登録です。</span>'; return; }
        box.innerHTML = '<div style="font-size:11px;color:#6b7280;margin-bottom:6px;">プレビュー</div>' +
          '<div style="display:inline-flex;flex-wrap:wrap;gap:5px;max-width:' + (10 * 39) + 'px;background:#0f2740;padding:7px;border-radius:10px;">' +
          filled.map(function (s) {
            return '<span title="' + esc(s.title || '') + '" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:#1a3a5c;color:#fff;border-radius:7px;font-size:15px;font-weight:700;">' + esc(s.label) + '</span>';
          }).join('') + '</div>';
      });
    }

    // ---- スロット取得（キャッシュ） ----
    function ensureSlots(pid, cb) {
      if (slotsCache[pid]) { cb(slotsCache[pid]); return; }
      fetch(API + '/profiles/' + pid + '/slots').then(function (r) { return r.json(); }).then(function (d) {
        slotsCache[pid] = (d.slots || []).map(function (s) { return { label: s.label, title: s.title, href: s.href }; });
        cb(slotsCache[pid]);
      }).catch(function () { cb([]); });
    }

    // ---- 登録者カード群 ----
    function render() {
      var wrap = document.getElementById('mm-profiles');
      if (!profiles.length) { wrap.innerHTML = '<div style="font-size:13px;color:#9ca3af;padding:20px 0;">登録者がまだいません。上のフォームから追加してください。</div>'; return; }
      wrap.innerHTML = profiles.map(function (p) {
        var isOpen = openProfileId === p.id;
        return '<div class="mm-pcard" data-id="' + p.id + '" style="background:white;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.06);margin-bottom:12px;overflow:hidden;">' +
          '<div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#f9fafb;border-bottom:' + (isOpen ? '1px solid #e5e7eb' : 'none') + ';">' +
            '<button type="button" onclick="mmToggle(' + p.id + ')" style="background:none;border:none;cursor:pointer;font-size:13px;font-weight:700;color:#1e3a5f;flex:1;text-align:left;">' +
              (isOpen ? '▼ ' : '▶ ') + esc(p.name) + '</button>' +
            '<button type="button" onclick="mmRename(' + p.id + ')" style="padding:5px 12px;background:white;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;">名前変更</button>' +
            '<button type="button" onclick="mmDeleteProfile(' + p.id + ')" style="padding:5px 12px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;font-size:12px;cursor:pointer;">削除</button>' +
          '</div>' +
          (isOpen ? '<div class="mm-editor" style="padding:16px;"></div>' : '') +
        '</div>';
      }).join('');
      if (openProfileId != null) {
        var card = wrap.querySelector('.mm-pcard[data-id="' + openProfileId + '"] .mm-editor');
        if (card) renderEditor(openProfileId, card);
      }
    }

    window.mmToggle = function (pid) { openProfileId = (openProfileId === pid) ? null : pid; render(); };

    // ---- マス編集エディタ（2×10） ----
    function renderEditor(pid, host) {
      host.innerHTML = '<div style="font-size:12px;color:#9ca3af;">読み込み中…</div>';
      ensureSlots(pid, function (slots) {
        var rows = [];
        for (var i = 0; i < MAX_SLOTS; i++) rows.push(slots[i] || { label: '', title: '', href: '' });
        var html = '<p style="font-size:11.5px;color:#6b7280;margin:0 0 10px;line-height:1.7;">各マスにリンク先と1文字ラベルを設定します。上段（1〜10）→下段（11〜20）の順で、登録したマスだけがバーに詰めて表示されます。行の左端をドラッグして並べ替えできます。</p>';
        html += '<div id="mm-rows-' + pid + '">';
        for (var k = 0; k < MAX_SLOTS; k++) {
          html += slotRowHtml(pid, k, rows[k]);
        }
        html += '</div>';
        html += '<div style="margin-top:12px;display:flex;gap:8px;align-items:center;">' +
          '<button type="button" onclick="mmSaveSlots(' + pid + ', this)" style="padding:8px 22px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;">保存</button>' +
          '<span class="mm-save-msg" style="font-size:12px;color:#166534;"></span>' +
        '</div>';
        host.innerHTML = html;
        wireDnd(pid);
      });
    }

    function slotRowHtml(pid, idx, s) {
      var isCatalog = s.href && matchCatalogPath(s.href) != null;
      return '<div class="mm-row" draggable="false" data-idx="' + idx + '" style="display:flex;gap:8px;align-items:center;padding:6px 0;border-bottom:1px dashed #eee;">' +
        '<span class="mm-drag" title="ドラッグで並べ替え" style="cursor:grab;color:#9ca3af;font-size:14px;user-select:none;width:26px;text-align:center;">' + (idx + 1) + '</span>' +
        '<select class="mm-kind" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;" onchange="mmKindChange(this)">' +
          '<option value="catalog"' + (!s.href || isCatalog ? ' selected' : '') + '>一覧から選ぶ</option>' +
          '<option value="manual"' + (s.href && !isCatalog ? ' selected' : '') + '>パス手入力</option>' +
        '</select>' +
        '<select class="mm-catalog" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;min-width:200px;' + (s.href && !isCatalog ? 'display:none;' : '') + '" onchange="mmCatalogChange(this)">' +
          '<option value="">― 選択 ―</option>' + catalogOptionsHtml() +
        '</select>' +
        '<input class="mm-path" type="text" placeholder="/handover など" value="' + (s.href && !isCatalog ? esc(stripAdmin(s.href)) : '') + '" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;width:150px;' + (s.href && !isCatalog ? '' : 'display:none;') + '">' +
        '<input class="mm-label" type="text" maxlength="2" placeholder="字" value="' + esc(s.label || '') + '" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:14px;width:44px;text-align:center;font-weight:700;">' +
        '<input class="mm-title" type="text" maxlength="40" placeholder="フル名称（ホバー表示）" value="' + esc(s.title || '') + '" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:12px;flex:1;min-width:120px;">' +
        '<button type="button" onclick="mmClearRow(this)" style="padding:5px 10px;background:white;border:1px solid #d1d5db;border-radius:6px;font-size:11px;cursor:pointer;color:#6b7280;">クリア</button>' +
      '</div>';
    }

    function stripAdmin(h) { return (h && h.indexOf(ADMIN) === 0) ? h.slice(ADMIN.length) : h; }
    function matchCatalogPath(href) {
      var p = stripAdmin(href);
      for (var i = 0; i < CATALOG.length; i++) for (var j = 0; j < CATALOG[i].items.length; j++) {
        if (CATALOG[i].items[j].path === p) return CATALOG[i].items[j];
      }
      return null;
    }

    window.mmKindChange = function (selEl) {
      var row = selEl.closest('.mm-row');
      var kind = selEl.value;
      row.querySelector('.mm-catalog').style.display = (kind === 'catalog') ? '' : 'none';
      row.querySelector('.mm-path').style.display = (kind === 'manual') ? '' : 'none';
    };
    window.mmCatalogChange = function (selEl) {
      var row = selEl.closest('.mm-row');
      var opt = selEl.options[selEl.selectedIndex];
      var labelInput = row.querySelector('.mm-label');
      var titleInput = row.querySelector('.mm-title');
      if (selEl.value !== '' || selEl.selectedIndex > 0) {
        var name = opt ? opt.textContent : '';
        if (!titleInput.value) titleInput.value = name;
        if (!labelInput.value && name) labelInput.value = Array.from(name.trim())[0] || '';
      }
    };
    window.mmClearRow = function (btn) {
      var row = btn.closest('.mm-row');
      row.querySelector('.mm-kind').value = 'catalog';
      row.querySelector('.mm-catalog').style.display = '';
      row.querySelector('.mm-catalog').value = '';
      row.querySelector('.mm-path').style.display = 'none';
      row.querySelector('.mm-path').value = '';
      row.querySelector('.mm-label').value = '';
      row.querySelector('.mm-title').value = '';
    };

    // ---- ドラッグ&ドロップ並べ替え ----
    function wireDnd(pid) {
      var container = document.getElementById('mm-rows-' + pid);
      if (!container) return;
      var dragEl = null;
      container.querySelectorAll('.mm-row').forEach(function (row) {
        var handle = row.querySelector('.mm-drag');
        handle.addEventListener('mousedown', function () { row.setAttribute('draggable', 'true'); });
        row.addEventListener('mouseup', function () { row.setAttribute('draggable', 'false'); });
        row.addEventListener('dragstart', function (e) { dragEl = row; row.style.opacity = '0.4'; e.dataTransfer.effectAllowed = 'move'; });
        row.addEventListener('dragend', function () { if (dragEl) dragEl.style.opacity = ''; dragEl = null; row.setAttribute('draggable', 'false'); renumber(container); });
        row.addEventListener('dragover', function (e) {
          e.preventDefault();
          if (!dragEl || dragEl === row) return;
          var rect = row.getBoundingClientRect();
          var after = (e.clientY - rect.top) / rect.height > 0.5;
          container.insertBefore(dragEl, after ? row.nextSibling : row);
        });
      });
    }
    function renumber(container) {
      container.querySelectorAll('.mm-row').forEach(function (row, i) {
        row.querySelector('.mm-drag').textContent = (i + 1);
        row.setAttribute('data-idx', i);
      });
    }

    // ---- 保存 ----
    window.mmSaveSlots = function (pid, btn) {
      var container = document.getElementById('mm-rows-' + pid);
      var slots = [];
      container.querySelectorAll('.mm-row').forEach(function (row) {
        var kind = row.querySelector('.mm-kind').value;
        var path = (kind === 'catalog') ? row.querySelector('.mm-catalog').value : row.querySelector('.mm-path').value.trim();
        var label = row.querySelector('.mm-label').value.trim();
        var title = row.querySelector('.mm-title').value.trim();
        if (!label || !path) return; // どちらか欠けたマスは登録しない＝詰められる
        slots.push({ label: label, title: title, path: path });
      });
      btn.disabled = true;
      var msg = btn.parentNode.querySelector('.mm-save-msg');
      msg.style.color = '#166534'; msg.textContent = '保存中…';
      fetch(API + '/profiles/' + pid + '/slots', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slots: slots }),
      }).then(function (r) { return r.json(); }).then(function (d) {
        btn.disabled = false;
        if (d.ok) {
          slotsCache[pid] = (d.slots || []).map(function (s) { return { label: s.label, title: s.title, href: s.href }; });
          msg.textContent = '保存しました（' + (d.slots || []).length + ' マス）';
          renderPreview();
          setTimeout(function () { msg.textContent = ''; }, 3500);
        } else {
          msg.style.color = '#dc2626'; msg.textContent = d.error || '保存に失敗しました';
        }
      }).catch(function () { btn.disabled = false; msg.style.color = '#dc2626'; msg.textContent = '通信エラー'; });
    };

    // ---- 登録者の追加・改名・削除 ----
    window.mmAddProfile = function () {
      var inp = document.getElementById('mm-new-name');
      var name = inp.value.trim();
      if (!name) { inp.focus(); return; }
      fetch(API + '/profiles', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name }),
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { profiles.push({ id: d.id, name: d.name, sort_order: d.sort_order }); inp.value = ''; openProfileId = d.id; render(); refreshActiveSelect(); }
        else alert(d.error || '追加に失敗しました');
      }).catch(function () { alert('通信エラー'); });
    };
    window.mmRename = function (pid) {
      var p = profiles.find(function (x) { return x.id === pid; });
      var name = prompt('登録者の名前', p ? p.name : '');
      if (name == null) return;
      name = name.trim(); if (!name) return;
      fetch(API + '/profiles/' + pid, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name }),
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) { p.name = name; render(); refreshActiveSelect(); }
        else alert(d.error || '変更に失敗しました');
      }).catch(function () { alert('通信エラー'); });
    };
    window.mmDeleteProfile = function (pid) {
      var p = profiles.find(function (x) { return x.id === pid; });
      if (!confirm('登録者「' + (p ? p.name : '') + '」とそのマス設定を削除します。よろしいですか？')) return;
      fetch(API + '/profiles/' + pid, { method: 'DELETE' }).then(function (r) { return r.json(); }).then(function (d) {
        if (d.ok) {
          profiles = profiles.filter(function (x) { return x.id !== pid; });
          delete slotsCache[pid];
          if (openProfileId === pid) openProfileId = null;
          var saved = null; try { saved = localStorage.getItem(LS_KEY); } catch (e) {}
          if (String(saved) === String(pid)) { try { localStorage.removeItem(LS_KEY); } catch (e) {} }
          render(); refreshActiveSelect();
        } else alert(d.error || '削除に失敗しました');
      }).catch(function () { alert('通信エラー'); });
    };

    refreshActiveSelect();
    render();
  })();
  </script>`;

  return c.html(layout('マニュアルモード', body, 'settings'));
});

// ============================================================
// 管理API（/api/manual-mode/... ／ ADMIN_PATH 配下にマウントされる）
// ============================================================
app.get('/api/manual-mode/profiles', async (c) => {
  if (!(await canUse(c))) return c.json({ error: '権限がありません' }, 403);
  return c.json({ ok: true, profiles: await loadProfiles(c.env) });
});

app.post('/api/manual-mode/profiles', async (c) => {
  if (!(await canUse(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json().catch(() => ({}));
  const name = S(b.name, 30);
  if (!name) return c.json({ error: '名前を入力してください' }, 400);
  const maxRow = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM manual_mode_profiles').first<{ m: number }>();
  const sort = (maxRow?.m ?? -1) + 1;
  const res = await c.env.DB.prepare(
    "INSERT INTO manual_mode_profiles (name, sort_order) VALUES (?, ?)"
  ).bind(name, sort).run();
  return c.json({ ok: true, id: res.meta.last_row_id, name, sort_order: sort });
});

app.patch('/api/manual-mode/profiles/:id', async (c) => {
  if (!(await canUse(c))) return c.json({ error: '権限がありません' }, 403);
  const id = Number(c.req.param('id'));
  const b = await c.req.json().catch(() => ({}));
  const name = S(b.name, 30);
  if (!id || !name) return c.json({ error: '入力が不正です' }, 400);
  await c.env.DB.prepare("UPDATE manual_mode_profiles SET name = ?, updated_at = datetime('now','localtime') WHERE id = ?").bind(name, id).run();
  return c.json({ ok: true });
});

app.delete('/api/manual-mode/profiles/:id', async (c) => {
  if (!(await canUse(c))) return c.json({ error: '権限がありません' }, 403);
  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'id が不正です' }, 400);
  await c.env.DB.prepare('DELETE FROM manual_mode_slots WHERE profile_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM manual_mode_profiles WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

app.get('/api/manual-mode/profiles/:id/slots', async (c) => {
  if (!(await canUse(c))) return c.json({ error: '権限がありません' }, 403);
  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'id が不正です' }, 400);
  return c.json({ ok: true, slots: await loadSlots(c.env, id) });
});

// マスの全置換。空マスは詰めて position を 0 から振り直す。
app.put('/api/manual-mode/profiles/:id/slots', async (c) => {
  if (!(await canUse(c))) return c.json({ error: '権限がありません' }, 403);
  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'id が不正です' }, 400);
  const exists = await c.env.DB.prepare('SELECT id FROM manual_mode_profiles WHERE id = ?').bind(id).first();
  if (!exists) return c.json({ error: '登録者が見つかりません' }, 404);

  const b = await c.req.json().catch(() => ({}));
  const raw: unknown[] = Array.isArray(b.slots) ? b.slots : [];
  const clean: Array<{ label: string; title: string; href: string }> = [];
  for (const item of raw) {
    if (clean.length >= MAX_SLOTS) break;
    const o = (item ?? {}) as Record<string, unknown>;
    const label = oneChar(o.label);
    const href = sanitizeHref(o.path ?? o.href);
    if (!label || !href) continue;
    clean.push({ label, title: S(o.title, 40), href });
  }

  const stmts = [c.env.DB.prepare('DELETE FROM manual_mode_slots WHERE profile_id = ?').bind(id)];
  clean.forEach((s, i) => {
    stmts.push(c.env.DB.prepare(
      'INSERT INTO manual_mode_slots (profile_id, position, label, title, href) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, i, s.label, s.title, s.href));
  });
  await c.env.DB.batch(stmts);
  return c.json({ ok: true, slots: await loadSlots(c.env, id) });
});

// ============================================================
// 表示用API（別マウント: /api/manual-mode/bar/... ／ ログイン必須・ページ権限は免除）
// ============================================================
export const manualModePublicApi = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

// バー切替用に登録者の一覧（id,name のみ）
manualModePublicApi.get('/bar/profiles', async (c) => {
  const r = await c.env.DB.prepare('SELECT id, name FROM manual_mode_profiles ORDER BY sort_order, id').all<{ id: number; name: string }>();
  return c.json({ profiles: r.results ?? [] });
});

// 指定登録者のマス（描画用）
manualModePublicApi.get('/bar/profiles/:id/slots', async (c) => {
  const id = Number(c.req.param('id'));
  if (!id) return c.json({ slots: [] });
  const r = await c.env.DB.prepare(
    'SELECT position, label, title, href FROM manual_mode_slots WHERE profile_id = ? ORDER BY position'
  ).bind(id).all<{ position: number; label: string; title: string; href: string }>();
  return c.json({ slots: r.results ?? [] });
});

export default app;
