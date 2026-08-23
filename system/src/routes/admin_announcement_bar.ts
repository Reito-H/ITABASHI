// アナウンスバー（管理画面全ページ最上部の常時テロップ）の管理ページ・API
// ページ: /settings/announcement-bar
// 管理API: /api/announcement-bar/*（一覧取得・作成・編集・削除。書き込みは <settings.announcement-bar.edit> 必須）
// 表示用API: /api/announcement-bar/active・/api/announcement-bar/dismiss
//   → 全アカウント共通でバーを表示するため、index.ts の権限ミドルウェアでページ権限チェックを免除している
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { settingsSubHeader } from './admin';
import { getAdminPermissions } from '../permissions';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

type Priority = 'normal' | 'warning' | 'critical';
const PRIORITIES = new Set<Priority>(['normal', 'warning', 'critical']);

type BarRow = {
  id: number; message: string; priority: Priority; expires_at: string;
  is_active: number; created_at: string; updated_at: string;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('settings.announcement-bar.edit');
}

function isValidExpiresAt(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v);
}

// ===== ページ =====
app.get('/settings/announcement-bar', async (c) => {
  const editable = await canEdit(c);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM announcement_bars ORDER BY is_active DESC, expires_at DESC, id DESC'
  ).all<BarRow>();
  const bars = rows.results ?? [];

  const rowHtml = (b: BarRow) => {
    const expired = b.expires_at < nowLocalDatetime();
    return `
    <div class="ann-admin-row" data-id="${b.id}" style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:16px 18px;margin-bottom:12px;${expired ? 'opacity:0.6;' : ''}">
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
        <select class="ann-priority" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;" ${editable ? '' : 'disabled'}>
          <option value="normal" ${b.priority === 'normal' ? 'selected' : ''}>通常</option>
          <option value="warning" ${b.priority === 'warning' ? 'selected' : ''}>注意</option>
          <option value="critical" ${b.priority === 'critical' ? 'selected' : ''}>緊急</option>
        </select>
        <label style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:6px;">表示期限
          <input type="datetime-local" class="ann-expires" value="${escapeHtml(b.expires_at)}" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;" ${editable ? '' : 'disabled'}>
        </label>
        <label style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:6px;">
          <input type="checkbox" class="ann-active" ${b.is_active ? 'checked' : ''} ${editable ? '' : 'disabled'}> 表示する
        </label>
        ${expired ? '<span style="font-size:11px;color:#dc2626;font-weight:700;">期限切れ</span>' : ''}
      </div>
      <textarea class="ann-message" rows="2" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;box-sizing:border-box;resize:vertical;" ${editable ? '' : 'disabled'}>${escapeHtml(b.message)}</textarea>
      ${editable ? `
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button type="button" onclick="saveAnnBar(${b.id}, this)" style="padding:7px 18px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;">保存</button>
        <button type="button" onclick="deleteAnnBar(${b.id}, this)" style="padding:7px 18px;background:#fef2f2;color:#dc2626;border:1px solid #fecaca;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;">削除</button>
      </div>` : ''}
    </div>`;
  };

  const html = settingsSubHeader('アナウンスバー') + `
    <div style="max-width:680px;">
      <p style="font-size:12px;color:#6b7280;margin:0 0 16px;line-height:1.7;">
        管理画面のすべてのページ上部に、常時流れるお知らせを表示します。表示期限を過ぎると自動的に表示されなくなります。<br>
        重要度によって色・アニメーションの派手さが変わります（通常＝落ち着いた表示／注意＝やや強調／緊急＝赤色で点滅）。<br>
        各アカウントは表示中のバーを×ボタンで個別に一時非表示にできます（そのアカウントには以後表示されません）。
      </p>
      ${editable ? `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 18px;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:10px;">新規アナウンスを投稿</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">
          <select id="ann-new-priority" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;">
            <option value="normal">通常</option>
            <option value="warning">注意</option>
            <option value="critical">緊急</option>
          </select>
          <label style="font-size:12px;color:#6b7280;display:flex;align-items:center;gap:6px;">表示期限
            <input type="datetime-local" id="ann-new-expires" style="border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:13px;">
          </label>
        </div>
        <textarea id="ann-new-message" rows="2" placeholder="表示する文章を入力" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;box-sizing:border-box;resize:vertical;"></textarea>
        <div id="ann-new-error" style="display:none;color:#dc2626;font-size:12px;margin-top:8px;"></div>
        <button type="button" onclick="createAnnBar()" style="margin-top:10px;padding:8px 22px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">投稿する</button>
      </div>` : ''}

      <div id="ann-list">
        ${bars.length ? bars.map(rowHtml).join('') : '<p style="font-size:13px;color:#9ca3af;">まだ投稿されたアナウンスはありません。</p>'}
      </div>
    </div>
    <script>
      var ADMIN_PATH = ${JSON.stringify(c.req.path.replace(/\/settings\/announcement-bar$/, ''))};
      function annPriorityLabel(v) { return { normal: '通常', warning: '注意', critical: '緊急' }[v] || v; }
      async function createAnnBar() {
        var message = document.getElementById('ann-new-message').value.trim();
        var priority = document.getElementById('ann-new-priority').value;
        var expires = document.getElementById('ann-new-expires').value;
        var errBox = document.getElementById('ann-new-error');
        errBox.style.display = 'none';
        if (!message) { errBox.textContent = '文章を入力してください'; errBox.style.display = 'block'; return; }
        if (!expires) { errBox.textContent = '表示期限を入力してください'; errBox.style.display = 'block'; return; }
        try {
          var res = await fetch(ADMIN_PATH + '/api/announcement-bar', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message, priority: priority, expires_at: expires }),
          });
          var j = await res.json();
          if (!res.ok) { errBox.textContent = j.error || '投稿に失敗しました'; errBox.style.display = 'block'; return; }
          location.reload();
        } catch (e) { errBox.textContent = '通信エラーが発生しました'; errBox.style.display = 'block'; }
      }
      async function saveAnnBar(id, btn) {
        var row = btn.closest('.ann-admin-row');
        var body = {
          message: row.querySelector('.ann-message').value.trim(),
          priority: row.querySelector('.ann-priority').value,
          expires_at: row.querySelector('.ann-expires').value,
          is_active: row.querySelector('.ann-active').checked,
        };
        if (!body.message) { alert('文章を入力してください'); return; }
        btn.disabled = true; var orig = btn.textContent; btn.textContent = '保存中…';
        try {
          var res = await fetch(ADMIN_PATH + '/api/announcement-bar/' + id, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          });
          var j = await res.json();
          if (!res.ok) { alert('保存に失敗しました: ' + (j.error || '')); btn.disabled = false; btn.textContent = orig; return; }
          location.reload();
        } catch (e) { alert('通信エラーが発生しました'); btn.disabled = false; btn.textContent = orig; }
      }
      async function deleteAnnBar(id, btn) {
        if (!confirm('このアナウンスを削除しますか？')) return;
        btn.disabled = true;
        try {
          var res = await fetch(ADMIN_PATH + '/api/announcement-bar/' + id, { method: 'DELETE' });
          if (!res.ok) { alert('削除に失敗しました'); btn.disabled = false; return; }
          location.reload();
        } catch (e) { alert('通信エラーが発生しました'); btn.disabled = false; }
      }
    </script>`;

  return c.html(layout('アナウンスバー', html, 'settings'));
});

// 現在時刻をdatetime-local相当の 'YYYY-MM-DDTHH:MM' 形式で返す（サーバー側は常にJST運用のためlocaltimeを使う）
function nowLocalDatetime(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// ===== 管理API（一覧・作成・編集・削除） =====
app.get('/api/announcement-bar', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT * FROM announcement_bars ORDER BY is_active DESC, expires_at DESC, id DESC'
  ).all<BarRow>();
  return c.json({ bars: rows.results ?? [] });
});

app.post('/api/announcement-bar', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ message?: string; priority?: string; expires_at?: string }>().catch(() => ({}) as { message?: string; priority?: string; expires_at?: string });
  const message = (b.message || '').trim();
  const priority = PRIORITIES.has(b.priority as Priority) ? (b.priority as Priority) : 'normal';
  const expiresAt = b.expires_at || '';
  if (!message) return c.json({ error: '文章を入力してください' }, 400);
  if (!isValidExpiresAt(expiresAt)) return c.json({ error: '表示期限の形式が不正です' }, 400);

  const r = await c.env.DB.prepare(
    `INSERT INTO announcement_bars (message, priority, expires_at, created_by, updated_at)
     VALUES (?, ?, ?, ?, datetime('now','localtime'))`
  ).bind(message, priority, expiresAt, c.get('adminId')).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

app.patch('/api/announcement-bar/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'), 10);
  if (!id) return c.json({ error: '指定が不正です' }, 400);
  const b = await c.req.json<{ message?: string; priority?: string; expires_at?: string; is_active?: boolean }>().catch(() => ({}) as { message?: string; priority?: string; expires_at?: string; is_active?: boolean });
  const message = (b.message || '').trim();
  const priority = PRIORITIES.has(b.priority as Priority) ? (b.priority as Priority) : 'normal';
  const expiresAt = b.expires_at || '';
  if (!message) return c.json({ error: '文章を入力してください' }, 400);
  if (!isValidExpiresAt(expiresAt)) return c.json({ error: '表示期限の形式が不正です' }, 400);
  const isActive = b.is_active ? 1 : 0;

  const r = await c.env.DB.prepare(
    `UPDATE announcement_bars SET message = ?, priority = ?, expires_at = ?, is_active = ?, updated_at = datetime('now','localtime') WHERE id = ?`
  ).bind(message, priority, expiresAt, isActive, id).run();
  if (r.meta.changes === 0) return c.json({ error: 'データが存在しません' }, 404);
  return c.json({ ok: true });
});

app.delete('/api/announcement-bar/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'), 10);
  if (!id) return c.json({ error: '指定が不正です' }, 400);
  await c.env.DB.prepare('DELETE FROM announcement_bar_dismissals WHERE bar_id = ?').bind(id).run();
  const r = await c.env.DB.prepare('DELETE FROM announcement_bars WHERE id = ?').bind(id).run();
  if (r.meta.changes === 0) return c.json({ error: 'データが存在しません' }, 404);
  return c.json({ ok: true });
});

export default app;

// ===== 表示用API（ADMIN_PATH配下ではなくルート /api/announcement-bar にマウントする。
// 全ページのlayout.tsから秘密パスを意識せず叩けるようにするため。お知らせベル(/api/announcements/web)と同じ扱い。
// 全アカウント共通で使うためページ権限(settings.announcement-bar)チェックは免除する（index.ts側で明示的に除外） =====
export const announcementBarPublicApi = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

// 期限内・is_active=1で、かつ自分がまだ×で閉じていないバーだけを重要度順に返す
announcementBarPublicApi.get('/active', async (c) => {
  const adminId = c.get('adminId');
  const now = nowLocalDatetime();
  const rows = await c.env.DB.prepare(`
    SELECT b.id, b.message, b.priority FROM announcement_bars b
    WHERE b.is_active = 1 AND b.expires_at >= ?
      AND NOT EXISTS (SELECT 1 FROM announcement_bar_dismissals d WHERE d.bar_id = b.id AND d.admin_id = ?)
    ORDER BY CASE b.priority WHEN 'critical' THEN 3 WHEN 'warning' THEN 2 ELSE 1 END DESC, b.id DESC
  `).bind(now, adminId).all<{ id: number; message: string; priority: Priority }>();
  return c.json({ banners: rows.results ?? [] });
});

announcementBarPublicApi.post('/dismiss', async (c) => {
  const adminId = c.get('adminId');
  const b = await c.req.json<{ ids?: number[] }>().catch(() => ({}) as { ids?: number[] });
  const ids = Array.isArray(b.ids) ? b.ids.filter(n => Number.isInteger(n)).slice(0, 50) : [];
  if (!ids.length) return c.json({ ok: true });
  const stmt = c.env.DB.prepare(
    'INSERT OR IGNORE INTO announcement_bar_dismissals (bar_id, admin_id) VALUES (?, ?)'
  );
  await c.env.DB.batch(ids.map(id => stmt.bind(id, adminId)));
  return c.json({ ok: true });
});
