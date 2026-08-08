// 班長関連 設定ハブ ＋ 班長リスト
// 班長シフト表の「枠」（役割・班色・並び順）の編集は班長シフト表本体（⚙️→枠編集）に統合済み
// （旧・枠設定ページ /settings/kancho-slots は廃止。班長シフト表の名前タップから割当・入れ替えを行う運用は変更なし）。
// 「班長リスト」は社員管理の「班長として登録」(employees.is_hanchyo)の一覧＋社員番号
// （希望休フォームの本人確認に使用）と、今どの枠を担当しているかを確認する画面。
// 唯一の編集操作は「班長登録の解除」（is_hanchyo=0に戻すだけ。kancho_membersには手を付けない）。
// ページ: /settings/kancho（ハブ） /settings/kancho-roster（班長リスト）
// API   : /api/kancho-roster（GET一覧・POST /unregisterで解除）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { getPeriod } from '../auth';
import { layout } from '../html/layout';
import { getAdminPermissions } from '../permissions';
import { ADMIN_PATH } from '../config';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function canEditRoster(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('settings.kancho-roster.edit');
}

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<{ id: number; name: string }> {
  const id = c.get('adminId');
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(id).first<{ username: string }>();
  return { id, name: row?.username ?? `id:${id}` };
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
      <a href="${ADMIN_PATH}/settings/kancho-roster" style="${cardStyle}">
        <div style="font-weight:700;color:#1e3a5f;margin-bottom:4px;">班長リスト</div>
        <div style="font-size:12px;color:#6b7280;">社員管理で班長登録した人の一覧・社員番号・今どの枠を担当しているか</div>
      </a>
      <a href="${ADMIN_PATH}/settings/kancho-wish" style="${cardStyle}">
        <div style="font-weight:700;color:#1e3a5f;margin-bottom:4px;">希望休フォーム</div>
        <div style="font-size:12px;color:#6b7280;">募集期間・対象月度・送信権限・提出状況の確認</div>
      </a>
      <a href="${ADMIN_PATH}/settings/kancho-logic" style="${cardStyle}">
        <div style="font-weight:700;color:#1e3a5f;margin-bottom:4px;">ロジック仕様</div>
        <div style="font-size:12px;color:#6b7280;">データモデル・自動伝播・記号ルール・警告チェックなどの内部仕様（閲覧専用）</div>
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
      社員管理で「班長として登録」された社員の一覧です。社員番号は希望休フォームの本人確認に使用します。「今の担当」は今月度（現在の締め期間）の班長シフト表でこの社員番号が割り当てられている枠です。枠への割当・入れ替え、枠自体の追加・役割・班色の設定は班長シフト表（⚙️→枠編集）から行ってください。ここでできるのは「もう班長ではない人」を一覧から外す（班長登録の解除）ことだけです。
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
