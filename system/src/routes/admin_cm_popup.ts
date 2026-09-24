// 新機能お知らせポップアップ（通称CM）: 引き継ぎシート画面だけに、管理者が指定した時刻（1日複数回）で
// 固定文面の告知ポップアップを表示する。新機能（車両管理／当欠「＋」登録）の利用促進が目的。
// ページ: /settings/cm-popup（発火時刻の設定のみ。対象者やCM文面の編集機能は持たない＝常に固定文面・全アカウント共通）
// 管理API: /api/cm-popup/fire-times（settings.cm-popup.edit 必須）
// 表示用API: /api/cm-popup/active
//   → [[project_handover_sheet]]と同じ「引き継ぎシートのみ」表示にするため、ADMIN_PATHの秘密パス配下ではなく
//     ルート /api/cm-popup にマウントする（ハッピーバースデーの birthdayPublicApi と同じ扱い）。
//     ログインは必須（root /api/* はGETを常に許可するが認証は必要）だが、ページ権限やホワイトリストでの絞り込みは行わない
//     （全アカウント向けの機能告知のため、誰にでも見せたい）。
// 発火判定は /api/cm-popup/active が「本日、設定時刻(hh:mm)を既に過ぎているもののうち最新の1件」をその場で計算する
//   （ハッピーバースデーの birthday_fire_times と全く同じ方式。migration_162）
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout, safeJson } from '../html/layout';
import { settingsSubHeader } from './admin';
import { ADMIN_PATH } from '../config';
import { getAdminPermissions } from '../permissions';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('settings.cm-popup.edit');
}

// ===== ページ =====
app.get('/settings/cm-popup', async (c) => {
  const editable = await canEdit(c);
  const hourRows = await c.env.DB.prepare('SELECT hour, minute FROM cm_popup_fire_times ORDER BY hour ASC, minute ASC')
    .all<{ hour: number; minute: number }>();
  const fireTimes = (hourRows.results ?? []).map(r => ({ hour: r.hour, minute: r.minute }));

  const html = settingsSubHeader('新機能お知らせポップアップ') + `
    <div style="max-width:760px;">
      <p style="font-size:12px;color:#6b7280;margin:0 0 20px;line-height:1.7;">
        引き継ぎシート画面に、新機能（車両管理／当欠・理由の「＋」登録）を案内する固定文面のポップアップを表示します。<br>
        表示するのは下で設定した時刻だけで、文面はこの2機能の紹介で固定です（対象アカウントの絞り込みもなく、引き継ぎシートを開いた全員に表示されます）。
      </p>

      <div style="background:white;border-radius:10px;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border:1px solid #e5e7eb;margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:4px;">発火時刻</div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">登録した時刻（時：分）ごとに1回、引き継ぎシートを開いている人の画面にポップアップを表示します。分単位で指定できます（複数登録可）。</div>
        <div id="ft-rows" style="display:flex;flex-direction:column;gap:8px;margin-bottom:${editable ? '12px' : '0'};"></div>
        ${editable ? `
        <button type="button" onclick="addFireTimeRow()" style="padding:6px 14px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;margin-right:8px;">時刻を追加</button>
        <button type="button" onclick="saveFireTimes()" id="fh-save-btn" style="padding:7px 20px;background:#1a3a5c;color:white;border:none;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;">保存</button>
        <span id="fh-msg" style="font-size:12px;color:#dc2626;margin-left:10px;"></span>` : ''}
      </div>

      <div style="background:white;border-radius:10px;padding:16px 18px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border:1px solid #e5e7eb;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">表示される文面（固定・プレビュー）</div>
        <div style="border:1px dashed #d1d5db;border-radius:8px;padding:14px 16px;background:#f9fafb;font-size:13px;color:#1f2937;line-height:1.8;">
          【新機能】車両管理で事故車・故障車をシームレスに管理できます。<br>
          【新機能】当欠・理由は「＋」ボタンからサクッと登録できます。
        </div>
      </div>
    </div>

    <script>
    var EDITABLE = ${editable ? 'true' : 'false'};
    var FIRE_TIMES = ${safeJson(fireTimes)};
    var API = ${safeJson(`${ADMIN_PATH}/api/cm-popup`)};

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

    renderFireTimeRows();
    </script>`;

  return c.html(layout('新機能お知らせポップアップ', html, 'settings'));
});

// ===== 管理API（発火時刻） =====
app.post('/api/cm-popup/fire-times', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{ times?: { hour?: unknown; minute?: unknown }[] }>().catch(() => ({}) as { times?: { hour?: unknown; minute?: unknown }[] });

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
    c.env.DB.prepare('DELETE FROM cm_popup_fire_times'),
    ...times.map(t => c.env.DB.prepare('INSERT INTO cm_popup_fire_times (hour, minute) VALUES (?, ?)').bind(t.hour, t.minute)),
  ]);
  return c.json({ ok: true, times });
});

export default app;

// ===== 表示用API（ADMIN_PATHの秘密パス配下ではなくルート /api/cm-popup にマウントする。
// 引き継ぎシート画面から秘密パスを意識せず叩けるようにするため。ハッピーバースデーと同じ扱い） =====
export const cmPopupPublicApi = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

// 本日分ですでに過ぎている設定時刻のうち最新の1件をイベントとして返す。存在しなければ event: null
cmPopupPublicApi.get('/active', async (c) => {
  const nowJST = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const todayStr = nowJST.toISOString().split('T')[0];
  const nowMinutes = nowJST.getUTCHours() * 60 + nowJST.getUTCMinutes();

  const fireTimes = await c.env.DB.prepare('SELECT hour, minute FROM cm_popup_fire_times').all<{ hour: number; minute: number }>();
  let latestPassed = -1;
  for (const t of fireTimes.results ?? []) {
    const m = t.hour * 60 + t.minute;
    if (m <= nowMinutes && m > latestPassed) latestPassed = m;
  }
  if (latestPassed < 0) return c.json({ event: null });

  const hh = String(Math.floor(latestPassed / 60)).padStart(2, '0');
  const mm = String(latestPassed % 60).padStart(2, '0');
  return c.json({ event: { id: `${todayStr}-${hh}:${mm}` } });
});
