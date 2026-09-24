// ハッピーバースデーモード: 一部の人だけを対象に、誕生日当日の設定時刻に全ページへお祝いポップアップを表示する
// ページ: /settings/birthday（対象者の名前・誕生日・顔写真の管理、発火時刻の設定、表示対象アカウント、テスト発火）
// 顔写真は円形プレビュー上でドラッグして表示位置を、スライダーで拡大率を調整できる（migration_164の
// photo_offset_x/y・photo_scale に保存。object-position(%) + transform:scale() で表示に反映する）
// 管理API: /api/birthday/celebrants・/api/birthday/fire-times・/api/birthday/enabled-admins・/api/birthday/test-fire・/api/birthday/force-fire
//   （書き込みは settings.birthday.edit 必須）
// 表示用API: /api/birthday/active・/api/birthday/photo/:id
//   → 全アカウント共通で叩けるようにするため、index.ts の権限ミドルウェアでページ権限チェックを免除している
//     （root /api/* はGETを常に許可するため、実際には明示的な除外設定は不要。ただしログインは必須で c.get('adminId') が使える）
//   → 実際に演出を表示するかどうかは birthday_enabled_admins（表示対象アカウントのホワイトリスト）で絞り込む
// 発火判定は /api/birthday/active が「本日誕生日の対象者がいて、設定した時刻(hh:mm)を既に過ぎているか」を
//   その場で計算して行う（birthday_fire_times・分単位対応。migration_147。cron 側の処理は廃止）
// テスト発火は birthday_test_triggers に1件保留し、対象アカウントの次回ポーリングで日時に関わらず消費・表示する
// 強制発火（/api/birthday/force-fire）は表示対象アカウント全員 + 実行者に test-trigger を配り、今すぐ全員の画面に出す
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
  photo_offset_x: number;
  photo_offset_y: number;
  photo_scale: number;
};

function r2KeyFor(ext: string): string {
  return `birthday-photos/${crypto.randomUUID()}.${ext}`;
}

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('settings.birthday.edit');
}

// 写真の表示位置(%)・拡大率をフォーム値から検証つきで取り出す。範囲外や非数値はデフォルト値にフォールバックする
function parsePhotoAdjust(form: FormData): { offsetX: number; offsetY: number; scale: number } {
  const clamp = (v: number, min: number, max: number, fallback: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
  return {
    offsetX: clamp(parseFloat(String(form.get('photo_offset_x') ?? '')), 0, 100, 50),
    offsetY: clamp(parseFloat(String(form.get('photo_offset_y') ?? '')), 0, 100, 50),
    scale: clamp(parseFloat(String(form.get('photo_scale') ?? '')), 1, 3, 1),
  };
}

type CelebrantPhotoRow = { id: number; name: string; photo_r2_key: string | null; photo_offset_x: number; photo_offset_y: number; photo_scale: number };
function celebrantToPayload(r: CelebrantPhotoRow) {
  return { id: r.id, name: r.name, hasPhoto: !!r.photo_r2_key, photoOffsetX: r.photo_offset_x, photoOffsetY: r.photo_offset_y, photoScale: r.photo_scale };
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
      'SELECT id, name, birth_month, birth_day, photo_r2_key, photo_mime_type, is_active, photo_offset_x, photo_offset_y, photo_scale FROM birthday_celebrants ORDER BY birth_month ASC, birth_day ASC, id ASC'
    ).all<CelebrantRow>(),
    c.env.DB.prepare('SELECT hour, minute FROM birthday_fire_times ORDER BY hour ASC, minute ASC').all<{ hour: number; minute: number }>(),
    c.env.DB.prepare('SELECT id, username FROM admins ORDER BY username ASC').all<{ id: number; username: string }>(),
    c.env.DB.prepare('SELECT admin_id FROM birthday_enabled_admins').all<{ admin_id: number }>(),
  ]);
  const celebrants = (rows.results ?? []).map(r => ({
    id: r.id, name: r.name, birthMonth: r.birth_month, birthDay: r.birth_day,
    hasPhoto: !!r.photo_r2_key, isActive: !!r.is_active,
    photoOffsetX: r.photo_offset_x, photoOffsetY: r.photo_offset_y, photoScale: r.photo_scale,
  }));
  const fireTimes = (hourRows.results ?? []).map(r => ({ hour: r.hour, minute: r.minute }));
  const admins = (adminRows.results ?? []).map(r => ({ id: r.id, username: r.username }));
  const enabledAdminIds = (enabledRows.results ?? []).map(r => r.admin_id);

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
        <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">登録した時刻（時：分）ごとに1回、本日誕生日の対象者がいればポップアップを発火します。分単位で指定できます（複数登録可）。</div>
        <div id="ft-rows" style="display:flex;flex-direction:column;gap:8px;margin-bottom:${editable ? '12px' : '0'};"></div>
        ${editable ? `
        <button type="button" onclick="addFireTimeRow()" style="padding:6px 14px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;margin-right:8px;">時刻を追加</button>
        <button type="button" onclick="saveFireTimes()" id="fh-save-btn" style="padding:7px 20px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;">保存</button>
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
      <div style="background:white;border-radius:10px;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border:1px solid #fca5a5;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:#b91c1c;margin-bottom:4px;">強制発火</div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">今すぐ「表示対象アカウント」全員と自分の画面に、お祝いポップアップを1回出します。誕生日・発火時刻の設定は無視します。演出には本日誕生日の対象者（いなければ有効な対象者全員）が登場します。各画面には最大45秒後（次のポーリング時）に表示されます。</div>
        <button type="button" onclick="forceFire()" id="force-fire-btn" style="padding:8px 22px;background:#dc2626;color:white;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">今すぐ強制発火</button>
        <span id="force-msg" style="font-size:12px;color:#6b7280;margin-left:10px;"></span>
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
          <div id="cel-photo-adjust" style="display:none;">
            <div style="font-size:11px;color:#374151;margin-bottom:6px;">表示位置の調整（ドラッグで移動）</div>
            <div style="display:flex;gap:16px;align-items:center;">
              <div id="cel-photo-preview" style="position:relative;width:130px;height:130px;border-radius:50%;overflow:hidden;background:#f3f4f6;border:2px solid #d1d5db;cursor:grab;flex-shrink:0;touch-action:none;">
                <img id="cel-photo-preview-img" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;">
              </div>
              <div style="flex:1;min-width:0;">
                <label style="font-size:11px;color:#374151;display:block;margin-bottom:4px;">拡大率</label>
                <input type="range" id="f-photo-zoom" min="100" max="250" step="5" value="100" style="width:100%;">
                <button type="button" onclick="resetPhotoAdjust()" style="margin-top:8px;padding:5px 12px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:11px;cursor:pointer;">中央に戻す</button>
              </div>
            </div>
          </div>
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
    var FIRE_TIMES = ${safeJson(fireTimes)};
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
          ? '<div style="width:48px;height:48px;border-radius:50%;overflow:hidden;flex-shrink:0;"><img src="' + PHOTO_API + '/' + r.id + '" style="width:100%;height:100%;object-fit:cover;object-position:' + r.photoOffsetX + '% ' + r.photoOffsetY + '%;transform:scale(' + r.photoScale + ');"></div>'
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

    // 写真の表示位置調整（ドラッグでobject-position、スライダーでtransform:scaleを操作するプレビュー）
    var photoOffsetX = 50, photoOffsetY = 50, photoScale = 1;
    var photoDragging = false, photoDragStartX = 0, photoDragStartY = 0, photoDragStartOffX = 50, photoDragStartOffY = 50;
    var photoPreviewEl = null, photoPreviewImgEl = null, photoZoomEl = null;

    function clampPct(v) { return Math.max(0, Math.min(100, v)); }
    function applyPhotoAdjustStyle() {
      if (!photoPreviewImgEl) return;
      photoPreviewImgEl.style.objectPosition = photoOffsetX + '% ' + photoOffsetY + '%';
      photoPreviewImgEl.style.transform = 'scale(' + photoScale + ')';
    }
    function setPhotoAdjust(offsetX, offsetY, scale, previewSrc) {
      photoOffsetX = offsetX; photoOffsetY = offsetY; photoScale = scale;
      if (photoZoomEl) photoZoomEl.value = String(Math.round(scale * 100));
      if (previewSrc && photoPreviewImgEl) photoPreviewImgEl.src = previewSrc;
      document.getElementById('cel-photo-adjust').style.display = previewSrc ? 'block' : 'none';
      applyPhotoAdjustStyle();
    }
    function resetPhotoAdjust() { setPhotoAdjust(50, 50, 1); }
    function initPhotoAdjustOnce() {
      if (photoPreviewEl) return;
      photoPreviewEl = document.getElementById('cel-photo-preview');
      photoPreviewImgEl = document.getElementById('cel-photo-preview-img');
      photoZoomEl = document.getElementById('f-photo-zoom');
      photoZoomEl.addEventListener('input', function () { photoScale = Number(photoZoomEl.value) / 100; applyPhotoAdjustStyle(); });
      photoPreviewEl.addEventListener('pointerdown', function (e) {
        photoDragging = true;
        photoDragStartX = e.clientX; photoDragStartY = e.clientY;
        photoDragStartOffX = photoOffsetX; photoDragStartOffY = photoOffsetY;
        photoPreviewEl.setPointerCapture(e.pointerId);
        photoPreviewEl.style.cursor = 'grabbing';
      });
      photoPreviewEl.addEventListener('pointermove', function (e) {
        if (!photoDragging) return;
        var rect = photoPreviewEl.getBoundingClientRect();
        // 指/カーソルを動かした方向に写真がついてくるように、object-positionは逆方向へ動かす
        var dx = (e.clientX - photoDragStartX) / rect.width * 100;
        var dy = (e.clientY - photoDragStartY) / rect.height * 100;
        photoOffsetX = clampPct(photoDragStartOffX - dx);
        photoOffsetY = clampPct(photoDragStartOffY - dy);
        applyPhotoAdjustStyle();
      });
      photoPreviewEl.addEventListener('pointerup', function () { photoDragging = false; photoPreviewEl.style.cursor = 'grab'; });
      photoPreviewEl.addEventListener('pointercancel', function () { photoDragging = false; photoPreviewEl.style.cursor = 'grab'; });
      document.getElementById('f-photo').addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () { setPhotoAdjust(50, 50, 1, reader.result); };
        reader.readAsDataURL(file);
      });
    }

    function openAdd() {
      initPhotoAdjustOnce();
      editingId = 0;
      document.getElementById('cel-modal-title').textContent = 'お祝い対象者を追加';
      document.getElementById('f-name').value = '';
      document.getElementById('f-month').value = '1';
      document.getElementById('f-day').value = '1';
      document.getElementById('f-active').checked = true;
      document.getElementById('f-photo').value = '';
      document.getElementById('cel-photo-current').textContent = '';
      setPhotoAdjust(50, 50, 1, null);
      document.getElementById('cel-form-msg').textContent = '';
      document.getElementById('cel-modal').style.display = 'block';
    }
    function openEdit(id) {
      var r = CELEBRANTS.find(function(x) { return x.id === id; });
      if (!r) return;
      initPhotoAdjustOnce();
      editingId = id;
      document.getElementById('cel-modal-title').textContent = '対象者の編集: ' + r.name;
      document.getElementById('f-name').value = r.name;
      document.getElementById('f-month').value = String(r.birthMonth);
      document.getElementById('f-day').value = String(r.birthDay);
      document.getElementById('f-active').checked = r.isActive;
      document.getElementById('f-photo').value = '';
      document.getElementById('cel-photo-current').textContent = r.hasPhoto ? '現在の写真があります（新しい写真を選ぶと差し替わります）' : '写真は未登録です';
      setPhotoAdjust(r.photoOffsetX, r.photoOffsetY, r.photoScale, r.hasPhoto ? (PHOTO_API + '/' + r.id) : null);
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
        fd.append('photo_offset_x', String(photoOffsetX));
        fd.append('photo_offset_y', String(photoOffsetY));
        fd.append('photo_scale', String(photoScale));
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

    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function fireTimeRowHtml(hour, minute) {
      var hourOpts = '';
      for (var h = 0; h < 24; h++) hourOpts += '<option value="' + h + '"' + (h === hour ? ' selected' : '') + '>' + pad2(h) + '</option>';
      var minOpts = '';
      for (var m = 0; m < 60; m++) minOpts += '<option value="' + m + '"' + (m === minute ? ' selected' : '') + '>' + pad2(m) + '</option>';
      return '<div class="ft-row" style="display:flex;align-items:center;gap:6px;">'
        + '<select class="ft-hour" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;"' + (EDITABLE ? '' : ' disabled') + '>' + hourOpts + '</select>'
        + '<span style="font-size:13px;color:#374151;">時</span>'
        + '<select class="ft-min" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;font-size:13px;"' + (EDITABLE ? '' : ' disabled') + '>' + minOpts + '</select>'
        + '<span style="font-size:13px;color:#374151;">分</span>'
        + (EDITABLE ? '<button type="button" onclick="this.closest(\\'.ft-row\\').remove()" style="margin-left:4px;padding:4px 10px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">削除</button>' : '')
        + '</div>';
    }
    function renderFireTimeRows() {
      var wrap = document.getElementById('ft-rows');
      if (!FIRE_TIMES.length) {
        wrap.innerHTML = '<div style="font-size:12px;color:#9ca3af;">発火時刻が未設定です' + (EDITABLE ? '（「時刻を追加」で登録してください）' : '') + '</div>';
        return;
      }
      wrap.innerHTML = FIRE_TIMES.map(function(t) { return fireTimeRowHtml(Number(t.hour), Number(t.minute)); }).join('');
    }
    function addFireTimeRow() {
      var wrap = document.getElementById('ft-rows');
      var placeholder = wrap.querySelector('div:not(.ft-row)');
      if (placeholder) wrap.innerHTML = '';
      wrap.insertAdjacentHTML('beforeend', fireTimeRowHtml(9, 0));
    }
    function saveFireTimes() {
      var times = [];
      document.querySelectorAll('#ft-rows .ft-row').forEach(function(row) {
        times.push({ hour: Number(row.querySelector('.ft-hour').value), minute: Number(row.querySelector('.ft-min').value) });
      });
      var btn = document.getElementById('fh-save-btn');
      var msg = document.getElementById('fh-msg');
      btn.disabled = true; var orig = btn.textContent; btn.textContent = '保存中…'; msg.style.color = '#dc2626'; msg.textContent = '';
      fetch(API + '/fire-times', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ times: times }),
      })
        .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
        .then(function(res) {
          btn.disabled = false; btn.textContent = orig;
          if (!res.ok) { msg.style.color = '#dc2626'; msg.textContent = res.j.error || '保存に失敗しました'; return; }
          FIRE_TIMES = (res.j.times || times).slice().sort(function(a, b) { return (a.hour - b.hour) || (a.minute - b.minute); });
          renderFireTimeRows();
          msg.style.color = '#059669'; msg.textContent = '保存しました';
          setTimeout(function() { msg.textContent = ''; }, 2500);
        })
        .catch(function() { btn.disabled = false; btn.textContent = orig; msg.style.color = '#dc2626'; msg.textContent = '通信エラーが発生しました'; });
    }

    function forceFire() {
      if (!confirm('今すぐ「表示対象アカウント」全員と自分の画面にお祝いポップアップを出します。よろしいですか？')) return;
      var btn = document.getElementById('force-fire-btn');
      var msg = document.getElementById('force-msg');
      btn.disabled = true; var orig = btn.textContent; btn.textContent = '実行中…'; msg.style.color = '#6b7280'; msg.textContent = '';
      fetch(API + '/force-fire', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
        .then(function(r) { return r.json().then(function(j) { return { ok: r.ok, j: j }; }); })
        .then(function(res) {
          btn.disabled = false; btn.textContent = orig;
          if (!res.ok) { msg.style.color = '#dc2626'; msg.textContent = res.j.error || '実行に失敗しました'; return; }
          msg.style.color = '#059669';
          msg.textContent = res.j.targetCount + '件のアカウントに発火しました（各画面に最大45秒後に表示）';
          setTimeout(function() { msg.textContent = ''; }, 6000);
        })
        .catch(function() { btn.disabled = false; btn.textContent = orig; msg.style.color = '#dc2626'; msg.textContent = '通信エラーが発生しました'; });
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
    renderFireTimeRows();
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
  const { offsetX, offsetY, scale } = parsePhotoAdjust(form);

  const r = await c.env.DB.prepare(`
    INSERT INTO birthday_celebrants (name, birth_month, birth_day, photo_r2_key, photo_mime_type, is_active, photo_offset_x, photo_offset_y, photo_scale)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(name, birthMonth, birthDay, photoR2Key, photoMimeType, isActive, offsetX, offsetY, scale).run();
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
  const { offsetX, offsetY, scale } = parsePhotoAdjust(form);

  if (photoMimeType) {
    await c.env.DB.prepare(`
      UPDATE birthday_celebrants SET name = ?, birth_month = ?, birth_day = ?, photo_r2_key = ?, photo_mime_type = ?, is_active = ?, photo_offset_x = ?, photo_offset_y = ?, photo_scale = ?, updated_at = datetime('now','localtime') WHERE id = ?
    `).bind(name, birthMonth, birthDay, photoR2Key, photoMimeType, isActive, offsetX, offsetY, scale, id).run();
  } else {
    await c.env.DB.prepare(`
      UPDATE birthday_celebrants SET name = ?, birth_month = ?, birth_day = ?, is_active = ?, photo_offset_x = ?, photo_offset_y = ?, photo_scale = ?, updated_at = datetime('now','localtime') WHERE id = ?
    `).bind(name, birthMonth, birthDay, isActive, offsetX, offsetY, scale, id).run();
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

// ===== 管理API（発火時刻・分単位） =====
app.post('/api/birthday/fire-times', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ times?: { hour?: unknown; minute?: unknown }[] }>().catch(() => ({}) as { times?: { hour?: unknown; minute?: unknown }[] });

  // hour*60+minute で重複を除去し、正規化した配列を作る
  const seen = new Set<number>();
  const times: { hour: number; minute: number }[] = [];
  if (Array.isArray(b.times)) {
    for (const t of b.times) {
      const hour = Number(t?.hour);
      const minute = Number(t?.minute);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
      if (!Number.isInteger(minute) || minute < 0 || minute > 59) continue;
      const key = hour * 60 + minute;
      if (seen.has(key)) continue;
      seen.add(key);
      times.push({ hour, minute });
    }
  }
  times.sort((a, b2) => (a.hour - b2.hour) || (a.minute - b2.minute));

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM birthday_fire_times'),
    ...times.map(t => c.env.DB.prepare('INSERT INTO birthday_fire_times (hour, minute) VALUES (?, ?)').bind(t.hour, t.minute)),
  ]);
  return c.json({ ok: true, times });
});

// ===== 管理API（強制発火） =====
// 「表示対象アカウント」全員 + 実行者本人に test-trigger を配り、誕生日・発火時刻の設定を無視して
// それぞれの次回ポーリングで1回だけ演出を出す。演出対象は本日誕生日の有効な対象者（いなければ有効な対象者全員）。
app.post('/api/birthday/force-fire', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);

  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const bMonth = nowJST.getUTCMonth() + 1;
  const bDay = nowJST.getUTCDate();

  const todays = await c.env.DB.prepare(
    'SELECT id FROM birthday_celebrants WHERE is_active = 1 AND birth_month = ? AND birth_day = ?'
  ).bind(bMonth, bDay).all<{ id: number }>();
  let celebrantIds = (todays.results ?? []).map(r => r.id);
  if (!celebrantIds.length) {
    const all = await c.env.DB.prepare('SELECT id FROM birthday_celebrants WHERE is_active = 1').all<{ id: number }>();
    celebrantIds = (all.results ?? []).map(r => r.id);
  }
  if (!celebrantIds.length) return c.json({ error: '有効なお祝い対象者が登録されていません' }, 400);

  const enabled = await c.env.DB.prepare('SELECT admin_id FROM birthday_enabled_admins').all<{ admin_id: number }>();
  const targetIds = new Set<number>((enabled.results ?? []).map(r => r.admin_id));
  targetIds.add(c.get('adminId')); // 実行者本人にも出す（表示対象未設定でも確認できるように）

  const payload = JSON.stringify(celebrantIds);
  await c.env.DB.batch(
    Array.from(targetIds).map(adminId =>
      c.env.DB.prepare(
        `INSERT INTO birthday_test_triggers (admin_id, celebrant_ids, created_at) VALUES (?, ?, datetime('now','localtime'))
         ON CONFLICT(admin_id) DO UPDATE SET celebrant_ids = excluded.celebrant_ids, created_at = excluded.created_at`
      ).bind(adminId, payload)
    )
  );
  return c.json({ ok: true, targetCount: targetIds.size });
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
            `SELECT id, name, photo_r2_key, photo_offset_x, photo_offset_y, photo_scale FROM birthday_celebrants WHERE id IN (${testIds.map(() => '?').join(',')}) ORDER BY birth_month ASC, birth_day ASC, id ASC`
          ).bind(...testIds).all<CelebrantPhotoRow>()
        : await c.env.DB.prepare(
            'SELECT id, name, photo_r2_key, photo_offset_x, photo_offset_y, photo_scale FROM birthday_celebrants WHERE is_active = 1 ORDER BY birth_month ASC, birth_day ASC, id ASC'
          ).all<CelebrantPhotoRow>();
      const list = celebrants.results ?? [];
      if (list.length) {
        return c.json({
          event: {
            id: `test-${Date.now()}`,
            celebrants: list.map(celebrantToPayload),
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

  // 発火判定はここでその場で行う（cron は毎時0分しか回らないため分単位に非対応。
  // クライアントは45秒ごとにこの API を叩くので、設定時刻(hh:mm)を過ぎた最初のポーリングで演出が始まる）。
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayStr = nowJST.toISOString().split('T')[0];
  const bMonth = nowJST.getUTCMonth() + 1;
  const bDay = nowJST.getUTCDate();
  const nowMinutes = nowJST.getUTCHours() * 60 + nowJST.getUTCMinutes();

  // 本日誕生日の有効な対象者
  const celebrants = await c.env.DB.prepare(
    'SELECT id, name, photo_r2_key, photo_offset_x, photo_offset_y, photo_scale FROM birthday_celebrants WHERE is_active = 1 AND birth_month = ? AND birth_day = ? ORDER BY id ASC'
  ).bind(bMonth, bDay).all<CelebrantPhotoRow>();
  const list = celebrants.results ?? [];
  if (!list.length) return c.json({ event: null });

  // 設定済みの発火時刻のうち、今日すでに過ぎているものの中で最も遅い時刻を採用する
  const fireTimes = await c.env.DB.prepare('SELECT hour, minute FROM birthday_fire_times').all<{ hour: number; minute: number }>();
  let latestPassed = -1;
  for (const t of fireTimes.results ?? []) {
    const m = t.hour * 60 + t.minute;
    if (m <= nowMinutes && m > latestPassed) latestPassed = m;
  }
  if (latestPassed < 0) return c.json({ event: null });

  // イベントID = 「日付 + 発火時刻」の文字列。ブラウザの localStorage でこのIDが既読なら再表示しない
  const hh = String(Math.floor(latestPassed / 60)).padStart(2, '0');
  const mm = String(latestPassed % 60).padStart(2, '0');

  return c.json({
    event: {
      id: `${todayStr}-${hh}:${mm}`,
      celebrants: list.map(celebrantToPayload),
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
