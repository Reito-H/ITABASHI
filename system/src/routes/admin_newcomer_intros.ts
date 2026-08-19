// 総合新人管理: 新人紹介カード（事故モニターサイネージへの表示用）
// ページ: {ADMIN_PATH}/newcomer-intros
// API   : {ADMIN_PATH}/api/newcomer-intros/*（管理パス配下・権限キーは newcomers を共用）
// 課は班から Math.ceil(team/2) で自動算出し、課の自由入力はさせない（feedback_division_team_mapping）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout, safeJson } from '../html/layout';
import { ADMIN_PATH } from '../config';
import { triggerNewcomerMonitorForceRefresh, getNewcomerCardIntervalSeconds, saveNewcomerCardIntervalSeconds } from './public_newcomer_monitor';
import { triggerAccidentsMonitorForceRefresh } from './public_accidents_monitor';

async function triggerMonitorRefresh(db: D1Database): Promise<void> {
  // 新人紹介モニターと、事故モニター（新人紹介モード/交互表示モード）の両方に即時反映させる
  await Promise.all([triggerNewcomerMonitorForceRefresh(db), triggerAccidentsMonitorForceRefresh(db)]);
}

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const ALLOWED_PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const MAX_PHOTO_SIZE = 8 * 1024 * 1024; // 8MB

type NewcomerIntroRow = {
  id: number;
  name: string;
  team: number | null;
  comment: string | null;
  photo_r2_key: string | null;
  photo_mime_type: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
};

function r2KeyFor(ext: string): string {
  return `newcomer-photos/${crypto.randomUUID()}.${ext}`;
}

app.get('/newcomer-intros', async (c) => {
  const [rows, cardIntervalSeconds] = await Promise.all([
    c.env.DB.prepare(
      'SELECT id, name, team, comment, photo_r2_key, photo_mime_type, display_order, created_at, updated_at FROM newcomer_intros ORDER BY display_order ASC, id ASC'
    ).all<NewcomerIntroRow>(),
    getNewcomerCardIntervalSeconds(c.env.DB),
  ]);
  const intros = (rows.results ?? []).map(r => ({
    id: r.id,
    name: r.name,
    team: r.team,
    comment: r.comment,
    hasPhoto: !!r.photo_r2_key,
  }));

  const html = `
    <div style="max-width:820px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;">
        <h2 style="font-size:18px;font-weight:700;color:#1e3a5f;margin:0;">新人紹介カード管理</h2>
      </div>
      <p style="font-size:13px;color:#6b7280;margin-bottom:14px;">
        事故モニターサイネージ「新人紹介」表示に使うカードを管理します。写真・名前・班・一言コメントを登録してください（課は班から自動判定されます）。
        並び順はカード左側のハンドル（⠿）をドラッグして変更できます。
      </p>
      <div style="background:white;border-radius:10px;padding:14px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border:1px solid #e5e7eb;margin-bottom:16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <span style="font-size:13px;font-weight:700;color:#1e3a5f;">カード切替間隔</span>
        <span style="font-size:12px;color:#6b7280;">新人紹介モニターで、次のカードへ自動的に切り替わる間隔</span>
        <input type="number" id="f-card-interval" min="2" value="${cardIntervalSeconds}" style="width:70px;border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:13px;">
        <span style="font-size:12px;color:#6b7280;">秒ごと</span>
        <button onclick="saveCardInterval()" id="card-interval-save-btn" style="padding:6px 16px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">保存</button>
        <span id="card-interval-msg" style="font-size:12px;color:#dc2626;"></span>
      </div>

      <div style="margin-bottom:14px;">
        <button onclick="openAdd()" style="padding:8px 20px;background:#059669;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">新人紹介カードを追加</button>
      </div>

      <div id="intro-list" style="display:flex;flex-direction:column;gap:10px;"></div>
    </div>

    <div id="intro-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:50;overflow-y:auto;padding:24px;">
      <div style="background:white;border-radius:12px;max-width:440px;margin:0 auto;padding:24px;">
        <h3 id="intro-modal-title" style="font-size:16px;font-weight:700;color:#1e3a5f;margin-bottom:16px;"></h3>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <label style="font-size:12px;color:#374151;">名前<br>
            <input type="text" id="f-name" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;box-sizing:border-box;">
          </label>
          <label style="font-size:12px;color:#374151;">班<br>
            <select id="f-team" onchange="updateDivisionHint()" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;box-sizing:border-box;">
              <option value="">未定</option>
              <option value="1">1班</option>
              <option value="2">2班</option>
              <option value="3">3班</option>
              <option value="4">4班</option>
              <option value="5">5班</option>
              <option value="6">6班</option>
              <option value="7">7班</option>
              <option value="8">8班</option>
            </select>
            <div id="division-hint" style="font-size:11px;color:#9ca3af;margin-top:4px;">&nbsp;</div>
          </label>
          <label style="font-size:12px;color:#374151;">一言コメント<br>
            <input type="text" id="f-comment" maxlength="60" placeholder="例: 早く仕事を覚えて活躍したいです！" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;box-sizing:border-box;">
          </label>
          <label style="font-size:12px;color:#374151;">写真<br>
            <input type="file" id="f-photo" accept="image/jpeg,image/png,image/gif,image/webp" style="width:100%;font-size:13px;">
          </label>
          <div id="intro-photo-current" style="font-size:11px;color:#6b7280;"></div>
        </div>
        <div id="intro-form-msg" style="font-size:12px;color:#dc2626;margin-top:10px;"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;">
          <button onclick="closeModal()" style="padding:8px 20px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;">キャンセル</button>
          <button onclick="saveIntro()" id="intro-save-btn" style="padding:8px 24px;background:#2563eb;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">保存</button>
        </div>
      </div>
    </div>

    <script>
    var INTROS = ${safeJson(intros)};
    var API = ${safeJson(`${ADMIN_PATH}/api/newcomer-intros`)};
    var editingId = 0;

    function escHtmlJs(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function attrJson(v) { return JSON.stringify(v).replace(/"/g, '&quot;'); }
    function divisionLabel(team) {
      if (!team) return '課未定';
      return Math.ceil(team / 2) + '課';
    }

    function saveCardInterval() {
      var seconds = parseInt(document.getElementById('f-card-interval').value, 10);
      var msg = document.getElementById('card-interval-msg');
      msg.textContent = '';
      if (!seconds || seconds < 2) { msg.textContent = '2秒以上の数値を入力してください'; return; }

      var btn = document.getElementById('card-interval-save-btn');
      btn.disabled = true; btn.textContent = '保存中…';
      fetch(API + '/card-interval', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seconds: seconds })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          btn.disabled = false; btn.textContent = '保存';
          if (!res.ok) { msg.textContent = res.j.error || '保存に失敗しました'; return; }
        })
        .catch(function () {
          btn.disabled = false; btn.textContent = '保存';
          msg.textContent = '通信エラーが発生しました';
        });
    }

    var dragSrc = null;
    function renderList() {
      var wrap = document.getElementById('intro-list');
      if (INTROS.length === 0) {
        wrap.innerHTML = '<div style="padding:24px;text-align:center;color:#9ca3af;background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">新人紹介カードが登録されていません</div>';
        return;
      }
      wrap.innerHTML = INTROS.map(function(r) {
        var photoCell = r.hasPhoto
          ? '<img src="' + API + '/' + r.id + '/photo" style="width:52px;height:52px;border-radius:8px;object-fit:cover;flex-shrink:0;">'
          : '<div style="width:52px;height:52px;border-radius:8px;background:#f3f4f6;color:#9ca3af;display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0;">写真なし</div>';
        return '<div class="intro-row" data-id="' + r.id + '" style="display:flex;align-items:center;gap:12px;background:white;border-radius:10px;padding:10px 14px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">'
          + '<span class="drag-handle" draggable="true" title="ドラッグで並び替え" style="cursor:grab;color:#9ca3af;font-size:16px;padding:0 2px;">⠿</span>'
          + photoCell
          + '<div style="flex:1;min-width:0;">'
          + '<div style="font-weight:700;color:#1f2937;font-size:13px;">' + escHtmlJs(r.name) + '　<span style="font-weight:400;color:#6b7280;font-size:12px;">' + divisionLabel(r.team) + (r.team ? '・' + r.team + '班' : '') + '</span></div>'
          + '<div style="font-size:12px;color:#6b7280;margin-top:2px;">' + (r.comment ? escHtmlJs(r.comment) : '<span style="color:#d1d5db;">（コメントなし）</span>') + '</div>'
          + '</div>'
          + '<div style="white-space:nowrap;">'
          + '<button onclick="openEdit(' + r.id + ')" style="padding:5px 12px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;font-size:12px;cursor:pointer;">編集</button>'
          + ' <button onclick="delIntro(' + r.id + ',' + attrJson(r.name) + ')" style="padding:5px 10px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:12px;cursor:pointer;">削除</button>'
          + '</div></div>';
      }).join('');
      attachDragHandlers();
    }

    function attachDragHandlers() {
      document.querySelectorAll('#intro-list .drag-handle').forEach(function(h) {
        h.addEventListener('dragstart', function() { dragSrc = h.closest('.intro-row'); });
        h.addEventListener('dragend', saveOrder);
      });
      document.querySelectorAll('#intro-list .intro-row').forEach(function(row) {
        row.addEventListener('dragover', function(e) {
          if (!dragSrc || row === dragSrc) return;
          e.preventDefault();
          var rect = row.getBoundingClientRect();
          var before = (e.clientY - rect.top) / rect.height < 0.5;
          row.parentNode.insertBefore(dragSrc, before ? row : row.nextSibling);
        });
        row.addEventListener('drop', function(e) { e.preventDefault(); });
      });
    }
    function saveOrder() {
      var rows = document.querySelectorAll('#intro-list .intro-row');
      var ids = [];
      rows.forEach(function(row) { ids.push(Number(row.dataset.id)); });
      fetch(API + '/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids })
      }).then(function(r) { if (r.ok) location.reload(); });
    }

    function updateDivisionHint() {
      var team = document.getElementById('f-team').value;
      document.getElementById('division-hint').textContent = team ? divisionLabel(Number(team)) + 'として表示されます' : ' ';
    }

    function openAdd() {
      editingId = 0;
      document.getElementById('intro-modal-title').textContent = '新人紹介カードを追加';
      document.getElementById('f-name').value = '';
      document.getElementById('f-team').value = '';
      document.getElementById('f-comment').value = '';
      document.getElementById('f-photo').value = '';
      document.getElementById('intro-photo-current').textContent = '';
      document.getElementById('intro-form-msg').textContent = '';
      updateDivisionHint();
      document.getElementById('intro-modal').style.display = 'block';
    }
    function openEdit(id) {
      var r = INTROS.find(function(x) { return x.id === id; });
      if (!r) return;
      editingId = id;
      document.getElementById('intro-modal-title').textContent = '新人紹介カードの編集: ' + r.name;
      document.getElementById('f-name').value = r.name;
      document.getElementById('f-team').value = r.team ? String(r.team) : '';
      document.getElementById('f-comment').value = r.comment || '';
      document.getElementById('f-photo').value = '';
      document.getElementById('intro-photo-current').textContent = r.hasPhoto ? '現在の写真があります（新しい写真を選ぶと差し替わります）' : '写真は未登録です';
      document.getElementById('intro-form-msg').textContent = '';
      updateDivisionHint();
      document.getElementById('intro-modal').style.display = 'block';
    }
    function closeModal() { document.getElementById('intro-modal').style.display = 'none'; }

    async function saveIntro() {
      var name = document.getElementById('f-name').value.trim();
      var team = document.getElementById('f-team').value;
      var comment = document.getElementById('f-comment').value.trim();
      var msg = document.getElementById('intro-form-msg');
      if (!name) { msg.textContent = '名前を入力してください'; return; }

      var btn = document.getElementById('intro-save-btn');
      btn.disabled = true; btn.textContent = '保存中...';
      try {
        var fd = new FormData();
        fd.append('name', name);
        fd.append('team', team);
        fd.append('comment', comment);
        var file = document.getElementById('f-photo').files[0];
        if (file) fd.append('photo', file);

        var url = editingId ? (API + '/' + editingId) : API;
        var res = await fetch(url, { method: 'POST', body: fd });
        if (res.ok) { location.reload(); return; }
        var j = await res.json().catch(function() { return {}; });
        msg.textContent = j.error || '保存に失敗しました';
      } catch (e) {
        msg.textContent = '通信エラーが発生しました';
      }
      btn.disabled = false; btn.textContent = '保存';
    }

    async function delIntro(id, name) {
      if (!confirm('新人紹介カード「' + name + '」を削除しますか？')) return;
      await fetch(API + '/' + id, { method: 'DELETE' });
      location.reload();
    }

    renderList();
    </script>`;

  return c.html(layout('新人紹介カード管理', html, 'newcomers'));
});

// 追加（multipart/form-data: name, team, comment, photo?）
app.post('/api/newcomer-intros', async (c) => {
  let form: FormData;
  try { form = await c.req.formData(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }

  const name = String(form.get('name') ?? '').trim();
  const teamRaw = String(form.get('team') ?? '').trim();
  const comment = String(form.get('comment') ?? '').trim();
  const team = teamRaw ? parseInt(teamRaw, 10) : null;
  const photo = form.get('photo');

  if (!name) return c.json({ error: '名前を入力してください' }, 400);
  if (team !== null && (!Number.isInteger(team) || team < 1 || team > 8)) {
    return c.json({ error: '班の値が不正です' }, 400);
  }

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

  const maxOrderRow = await c.env.DB.prepare('SELECT COALESCE(MAX(display_order), 0) AS m FROM newcomer_intros').first<{ m: number }>();
  const nextOrder = (maxOrderRow?.m ?? 0) + 10;

  const result = await c.env.DB.prepare(`
    INSERT INTO newcomer_intros (name, team, comment, photo_r2_key, photo_mime_type, display_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(name, team, comment || null, photoR2Key, photoMimeType, nextOrder).run();

  await triggerMonitorRefresh(c.env.DB);
  return c.json({ ok: true, id: result.meta.last_row_id });
});

// 並び替え・カード切替間隔の保存は静的パスなので、`/:id` パラメータルートより先に登録する
// （Honoのルーターは登録順で先勝ちするため、後に登録すると `/:id` 側に吸い込まれてしまう）

// 並び替え
app.post('/api/newcomer-intros/reorder', async (c) => {
  const b = await c.req.json<{ ids?: number[] }>();
  const ids = Array.isArray(b.ids) ? b.ids.map(Number).filter(n => Number.isInteger(n)) : [];
  if (ids.length === 0 || ids.length > 500) return c.json({ error: '不正なパラメータです' }, 400);
  const stmts = ids.map((id, i) =>
    c.env.DB.prepare('UPDATE newcomer_intros SET display_order = ? WHERE id = ?').bind((i + 1) * 10, id)
  );
  await c.env.DB.batch(stmts);
  await triggerMonitorRefresh(c.env.DB);
  return c.json({ ok: true });
});

// カード切替間隔の保存
app.post('/api/newcomer-intros/card-interval', async (c) => {
  let body: { seconds?: number };
  try { body = await c.req.json(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }

  const seconds = Number(body.seconds);
  if (!Number.isFinite(seconds) || seconds < 2) {
    return c.json({ error: '切替間隔は2秒以上の数値を指定してください' }, 400);
  }

  await saveNewcomerCardIntervalSeconds(c.env.DB, seconds);
  await triggerMonitorRefresh(c.env.DB);
  return c.json({ ok: true });
});

// 編集（multipart/form-data: name, team, comment, photo? ※写真を送った場合のみ差し替え）
app.post('/api/newcomer-intros/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  let form: FormData;
  try { form = await c.req.formData(); } catch { return c.json({ error: '不正なリクエスト' }, 400); }

  const name = String(form.get('name') ?? '').trim();
  const teamRaw = String(form.get('team') ?? '').trim();
  const comment = String(form.get('comment') ?? '').trim();
  const team = teamRaw ? parseInt(teamRaw, 10) : null;
  const photo = form.get('photo');

  if (!name) return c.json({ error: '名前を入力してください' }, 400);
  if (team !== null && (!Number.isInteger(team) || team < 1 || team > 8)) {
    return c.json({ error: '班の値が不正です' }, 400);
  }

  const existing = await c.env.DB.prepare('SELECT photo_r2_key FROM newcomer_intros WHERE id = ?')
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
      UPDATE newcomer_intros SET name = ?, team = ?, comment = ?, photo_r2_key = ?, photo_mime_type = ?, updated_at = datetime('now','localtime') WHERE id = ?
    `).bind(name, team, comment || null, photoR2Key, photoMimeType, id).run();
  } else {
    await c.env.DB.prepare(`
      UPDATE newcomer_intros SET name = ?, team = ?, comment = ?, updated_at = datetime('now','localtime') WHERE id = ?
    `).bind(name, team, comment || null, id).run();
  }

  await triggerMonitorRefresh(c.env.DB);
  return c.json({ ok: true });
});

// 写真（管理画面のサムネイル表示用）
app.get('/api/newcomer-intros/:id/photo', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const row = await c.env.DB.prepare('SELECT photo_r2_key, photo_mime_type FROM newcomer_intros WHERE id = ?')
    .bind(id).first<{ photo_r2_key: string | null; photo_mime_type: string | null }>();
  if (!row || !row.photo_r2_key) return c.json({ error: '見つかりません' }, 404);

  const obj = await c.env.DOCUMENTS_BUCKET.get(row.photo_r2_key);
  if (!obj) return c.json({ error: '写真が見つかりません' }, 404);

  const headers = new Headers();
  headers.set('Content-Type', row.photo_mime_type || 'application/octet-stream');
  return new Response(obj.body, { headers });
});

// 削除
app.delete('/api/newcomer-intros/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const row = await c.env.DB.prepare('SELECT photo_r2_key FROM newcomer_intros WHERE id = ?')
    .bind(id).first<{ photo_r2_key: string | null }>();
  if (!row) return c.json({ error: '見つかりません' }, 404);

  if (row.photo_r2_key) await c.env.DOCUMENTS_BUCKET.delete(row.photo_r2_key).catch(() => {});
  await c.env.DB.prepare('DELETE FROM newcomer_intros WHERE id = ?').bind(id).run();
  await triggerMonitorRefresh(c.env.DB);
  return c.json({ ok: true });
});

export default app;
