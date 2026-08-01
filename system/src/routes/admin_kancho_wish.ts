// 希望休フォーム設定（管理画面）
// ページ: /settings/kancho-wish
// API   : /api/kancho-wish-settings/*（権限: settings.kancho-wish / .edit）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout, escHtml } from '../html/layout';
import { getAdminPermissions } from '../permissions';
import { ensureKanchoPeriod } from './admin_kancho';
import { ADMIN_PATH, KANCHO_WISH_PATH } from '../config';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('settings.kancho-wish.edit');
}

type WishSettings = { target_year: number; target_month: number; open_from: string | null; open_until: string | null };

const ROLE_LABEL: Record<string, string> = {
  general_manager: '統括管理者', operations_manager: '運行管理者', vehicle_manager: '車両管理者',
  newcomer: '新人', benten_shift_master: 'ベンテンシフトマスター', benten_member: 'ベンテン会員',
  crew_member: '乗務社員', unknown: '未設定',
};

// ===== ページ =====
app.get('/settings/kancho-wish', async (c) => {
  const settings = await c.env.DB.prepare('SELECT target_year, target_month, open_from, open_until FROM kancho_wish_settings WHERE id = 1')
    .first<WishSettings>();
  const editable = await canEdit(c);
  const shareUrl = `https://bentenclub.com${KANCHO_WISH_PATH}`;

  const html = `
    <div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <a href="${ADMIN_PATH}/settings/kancho" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 班長関連に戻る</a>
      <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">希望休フォーム</h2>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:640px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:10px;">募集の設定</div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;align-items:flex-end;">
        <label style="font-size:12px;color:#6b7280;">対象月度
          <div>
            <input id="tgt-year" type="number" value="${settings?.target_year || ''}" placeholder="年" style="width:80px;border:1px solid #d1d5db;border-radius:6px;padding:7px;font-size:13px;">年
            <input id="tgt-month" type="number" value="${settings?.target_month || ''}" placeholder="月" min="1" max="12" style="width:56px;border:1px solid #d1d5db;border-radius:6px;padding:7px;font-size:13px;">月度
          </div>
        </label>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
        <label style="font-size:12px;color:#6b7280;">受付開始日<div><input id="open-from" type="date" value="${settings?.open_from ?? ''}" style="border:1px solid #d1d5db;border-radius:6px;padding:7px;font-size:13px;"></div></label>
        <label style="font-size:12px;color:#6b7280;">受付終了日<div><input id="open-until" type="date" value="${settings?.open_until ?? ''}" style="border:1px solid #d1d5db;border-radius:6px;padding:7px;font-size:13px;"></div></label>
      </div>
      ${editable ? `<button onclick="saveSettings()" id="save-settings-btn" style="padding:9px 22px;background:#2563eb;color:white;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">保存</button>` : ''}
      <div style="font-size:11px;color:#9ca3af;margin-top:8px;">対象月度を保存すると、班長シフトの名簿がまだ無い月度の場合は自動で用意されます。</div>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:640px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">共有用URL</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <code id="share-url" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:12px;word-break:break-all;flex:1;min-width:220px;">${escHtml(shareUrl)}</code>
        <button onclick="copyShareUrl()" style="padding:8px 14px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">コピー</button>
      </div>
      <div style="font-size:11px;color:#9ca3af;margin-top:8px;">受付期間・対象月度が有効な間だけ、このURLから班長本人が希望休を入力できます。</div>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:640px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">提出時のLINE通知（送信権限者）</div>
      <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">ONにした人には、班長が希望休を提出・取消するたびに1件ずつLINEで通知が届きます。</div>
      <div id="notify-body" style="font-size:13px;color:#6b7280;">読み込み中...</div>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:820px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">提出状況（対象月度）</div>
      <div id="summary-body" style="font-size:13px;color:#6b7280;">読み込み中...</div>
    </div>

    <script>
    var API = '${ADMIN_PATH}/api/kancho-wish-settings';
    var EDITABLE = ${editable ? 'true' : 'false'};
    function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    async function saveSettings() {
      var btn = document.getElementById('save-settings-btn');
      var body = {
        target_year: parseInt(document.getElementById('tgt-year').value) || 0,
        target_month: parseInt(document.getElementById('tgt-month').value) || 0,
        open_from: document.getElementById('open-from').value || null,
        open_until: document.getElementById('open-until').value || null
      };
      if (!body.target_year || !body.target_month) { alert('対象月度を入力してください'); return; }
      btn.disabled = true; btn.textContent = '保存中...';
      var res = await fetch(API, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      btn.disabled = false; btn.textContent = '保存';
      if (res.ok) { loadSummary(); }
      else { var d = await res.json().catch(function(){ return {}; }); alert(d.error || '保存に失敗しました'); }
    }
    function copyShareUrl() {
      navigator.clipboard.writeText(document.getElementById('share-url').textContent).then(function() {
        alert('コピーしました');
      });
    }
    async function loadNotify() {
      var res = await fetch(API + '/notify');
      var d = await res.json();
      var rows = (d.users || []).map(function(u) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:7px 4px;border-bottom:1px solid #f3f4f6;">'
          + '<div style="flex:1;"><b>' + escH(u.name) + '</b> <span style="font-size:11px;color:#9ca3af;">' + escH(u.role_label) + '</span></div>'
          + '<button onclick="toggleNotify(\\'' + escH(u.line_uid) + '\\', ' + (u.optin ? 0 : 1) + ')" style="padding:5px 16px;border-radius:99px;font-size:12px;font-weight:700;cursor:pointer;border:1px solid ' + (u.optin ? '#86efac' : '#d1d5db') + ';background:' + (u.optin ? '#f0fdf4' : '#f9fafb') + ';color:' + (u.optin ? '#166534' : '#9ca3af') + ';">' + (u.optin ? '通知オン' : 'オフ') + '</button>'
          + '</div>';
      }).join('');
      document.getElementById('notify-body').innerHTML = rows || '<div style="color:#9ca3af;">LINE連携済みのユーザーがいません</div>';
    }
    async function toggleNotify(uid, on) {
      var res = await fetch(API + '/notify', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ line_uid: uid, optin: on })
      });
      if (res.ok) loadNotify();
      else alert('変更に失敗しました');
    }
    async function loadSummary() {
      var res = await fetch(API + '/summary');
      var d = await res.json();
      if (!d.rows || d.rows.length === 0) { document.getElementById('summary-body').innerHTML = '<div style="color:#9ca3af;">対象月度の班長名簿がありません（対象月度を保存してください）</div>'; return; }
      var html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
        + '<thead><tr style="background:#f8fafc;"><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">班長</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">希望休</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">その他要望</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;"></th></tr></thead><tbody>'
        + d.rows.map(function(r) {
            var dates = (r.dates || []).map(function(dt) { return dt.slice(5).replace('-', '/'); }).join('、') || '（未提出）';
            var hasSubmission = (r.dates && r.dates.length > 0) || !!r.remark;
            var resetBtn = (hasSubmission && EDITABLE)
              ? '<button onclick="resetMember(' + r.id + ', \\'' + escH(r.name) + '\\')" style="padding:5px 12px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;">リセット</button>'
              : '';
            return '<tr><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-weight:600;white-space:nowrap;">' + escH(r.name) + '</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">' + escH(dates) + '</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;color:#6b7280;">' + escH(r.remark || '') + '</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;text-align:right;">' + resetBtn + '</td></tr>';
          }).join('')
        + '</tbody></table>';
      document.getElementById('summary-body').innerHTML = html;
    }
    async function resetMember(id, name) {
      if (!confirm(name + 'さんの提出状況（希望休・その他要望）をリセットします。よろしいですか？')) return;
      var res = await fetch(API + '/reset', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ member_id: id }) });
      if (res.ok) loadSummary();
      else { var d = await res.json().catch(function(){ return {}; }); alert(d.error || 'リセットに失敗しました'); }
    }
    loadNotify();
    loadSummary();
    </script>`;
  return c.html(layout('希望休フォーム', html, 'settings'));
});

// ===== API =====
app.get('/api/kancho-wish-settings', async (c) => {
  const row = await c.env.DB.prepare('SELECT target_year, target_month, open_from, open_until FROM kancho_wish_settings WHERE id = 1').first<WishSettings>();
  return c.json(row ?? { target_year: 0, target_month: 0, open_from: null, open_until: null });
});

app.post('/api/kancho-wish-settings', async (c) => {
  const b = await c.req.json<{ target_year?: number; target_month?: number; open_from?: string | null; open_until?: string | null }>();
  if (!b.target_year || !b.target_month) return c.json({ error: '対象月度を入力してください' }, 400);
  await c.env.DB.prepare(
    `UPDATE kancho_wish_settings SET target_year = ?, target_month = ?, open_from = ?, open_until = ?, updated_at = datetime('now','localtime') WHERE id = 1`
  ).bind(b.target_year, b.target_month, b.open_from || null, b.open_until || null).run();
  await ensureKanchoPeriod(c.env.DB, b.target_year, b.target_month);
  return c.json({ ok: true });
});

app.get('/api/kancho-wish-settings/notify', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT u.line_uid, u.name, u.role, (o.line_uid IS NOT NULL) AS optin
    FROM line_liff_users u
    LEFT JOIN kancho_wish_notify_optin o ON o.line_uid = u.line_uid
    ORDER BY u.role, u.name
  `).all<{ line_uid: string; name: string; role: string; optin: number }>();
  const users = (rows.results ?? []).map(u => ({ ...u, role_label: ROLE_LABEL[u.role] ?? u.role }));
  return c.json({ users });
});

app.post('/api/kancho-wish-settings/notify', async (c) => {
  const b = await c.req.json<{ line_uid?: string; optin?: number }>();
  if (!b.line_uid) return c.json({ error: 'line_uid が必要です' }, 400);
  if (b.optin) {
    await c.env.DB.prepare('INSERT OR IGNORE INTO kancho_wish_notify_optin (line_uid) VALUES (?)').bind(b.line_uid).run();
  } else {
    await c.env.DB.prepare('DELETE FROM kancho_wish_notify_optin WHERE line_uid = ?').bind(b.line_uid).run();
  }
  return c.json({ ok: true });
});

app.get('/api/kancho-wish-settings/summary', async (c) => {
  const settings = await c.env.DB.prepare('SELECT target_year, target_month FROM kancho_wish_settings WHERE id = 1').first<WishSettings>();
  if (!settings?.target_year || !settings.target_month) return c.json({ rows: [] });
  const members = await c.env.DB.prepare(
    "SELECT id, name, role FROM kancho_members WHERE section = 'main' AND is_active = 1 AND is_indoor = 1 AND year = ? AND month = ? ORDER BY sort_order, id"
  ).bind(settings.target_year, settings.target_month).all<{ id: number; name: string; role: string | null }>();
  const memberList = members.results ?? [];
  if (memberList.length === 0) return c.json({ rows: [] });
  const ids = memberList.map(m => m.id);
  const placeholders = ids.map(() => '?').join(',');
  const [wishes, remarks] = await Promise.all([
    c.env.DB.prepare(`SELECT member_id, date FROM kancho_wishes WHERE member_id IN (${placeholders}) ORDER BY date`).bind(...ids).all<{ member_id: number; date: string }>(),
    c.env.DB.prepare(`SELECT member_id, content FROM kancho_wish_remarks WHERE member_id IN (${placeholders})`).bind(...ids).all<{ member_id: number; content: string }>(),
  ]);
  const datesByMember = new Map<number, string[]>();
  for (const w of (wishes.results ?? [])) {
    if (!datesByMember.has(w.member_id)) datesByMember.set(w.member_id, []);
    datesByMember.get(w.member_id)!.push(w.date);
  }
  const remarkByMember = new Map<number, string>();
  for (const r of (remarks.results ?? [])) remarkByMember.set(r.member_id, r.content);

  const rows = memberList.map(m => ({
    id: m.id, name: m.name, role: m.role,
    dates: datesByMember.get(m.id) ?? [],
    remark: remarkByMember.get(m.id) ?? '',
  }));
  return c.json({ rows });
});

app.post('/api/kancho-wish-settings/reset', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ member_id?: number }>();
  const memberId = b.member_id;
  if (!memberId) return c.json({ error: 'member_id が必要です' }, 400);
  await c.env.DB.prepare('DELETE FROM kancho_wishes WHERE member_id = ?').bind(memberId).run();
  await c.env.DB.prepare('DELETE FROM kancho_wish_remarks WHERE member_id = ?').bind(memberId).run();
  return c.json({ ok: true });
});

export default app;
