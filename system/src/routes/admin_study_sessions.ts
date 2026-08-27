// 勉強会募集（設定ページ・管理側）
// ページ: /settings/study-sessions（一覧・作成・編集・締切・参加者確認）
//         /settings/study-sessions/:id/poster（A3縦ポスター印刷）
// API   : /api/study-sessions/*（権限: settings.study-sessions / .edit）
// 公開側（社員向け参加登録の掲示板ページ）は routes/public_study_sessions.ts を参照。
// QR/URLは勉強会ごとに個別発行せず、全ポスターで共通のSTUDY_SESSION_PATHを使う（開いた先の掲示板で選ぶ形式のため）。
import { Hono } from 'hono';
import qrcode from 'qrcode-generator';
import type { Env } from '../auth';
import { layout, escHtml } from '../html/layout';
import { getAdminPermissions } from '../permissions';
import { ADMIN_PATH, STUDY_SESSION_PATH } from '../config';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('settings.study-sessions.edit');
}

type StudySession = {
  id: number; title: string; date: string; start_time: string | null; end_time: string | null;
  location: string | null; contact_name: string | null; capacity: number; note: string | null; is_closed: number;
  target_audience: string | null;
};

function shareUrl(): string {
  return `https://bentenclub.com${STUDY_SESSION_PATH}`;
}

function tokenToQrSvg(data: string, cellSize = 6): string {
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  return qr.createSvgTag({ cellSize, margin: 4, scalable: true })
    .replace(/black/g, '#1e3a5f').replace(/white/g, '#ffffff');
}

const S = (v: unknown, max: number): string => String(v ?? '').slice(0, max).trim();

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function isValidTime(s: string): boolean {
  return s === '' || /^\d{2}:\d{2}$/.test(s);
}

// ===== ページ: 一覧・管理 =====
app.get('/settings/study-sessions', async (c) => {
  const editable = await canEdit(c);
  const html = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">勉強会募集</h2>
    </div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:16px;line-height:1.7;">
      新人向けの勉強会をここで作成すると、共通のQR/URLからアクセスできる掲示板に自動で表示されます。社員番号を入力した参加者は、開催中の勉強会一覧から選んで参加登録できます。定員に達すると自動で「満席」表示になり、それ以上は登録できません。
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:820px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">参加申し込み用 共有URL・QR（全ポスター共通）</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;">
        <div style="width:110px;height:110px;flex-shrink:0;">${tokenToQrSvg(shareUrl(), 4)}</div>
        <div style="flex:1;min-width:220px;">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <code id="share-url" style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:12px;word-break:break-all;flex:1;min-width:200px;">${escHtml(shareUrl())}</code>
            <button onclick="copyShareUrl()" style="padding:8px 14px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">コピー</button>
          </div>
          <div style="font-size:11px;color:#9ca3af;margin-top:8px;">勉強会ごとにQRを分ける必要はありません。作成した各勉強会のポスターは、この共通URLのQRを使って印刷してください（各ポスターの印刷ボタンから出力できます）。</div>
        </div>
      </div>
    </div>

    ${editable ? `
    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:820px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:12px;" id="form-heading">新しい勉強会を作成</div>
      <input type="hidden" id="edit-id" value="">
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
        <label style="font-size:12px;color:#6b7280;flex:1;min-width:220px;">タイトル
          <div><input id="f-title" type="text" maxlength="60" placeholder="例: 接客マナー勉強会" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;"></div>
        </label>
        <label style="font-size:12px;color:#6b7280;">開催日
          <div><input id="f-date" type="date" style="border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;"></div>
        </label>
        <label style="font-size:12px;color:#6b7280;">開始
          <div><input id="f-start" type="time" style="border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;"></div>
        </label>
        <label style="font-size:12px;color:#6b7280;">終了
          <div><input id="f-end" type="time" style="border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;"></div>
        </label>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
        <label style="font-size:12px;color:#6b7280;flex:1;min-width:200px;">集合場所
          <div><input id="f-location" type="text" maxlength="60" placeholder="例: 本社2階 会議室" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;"></div>
        </label>
        <label style="font-size:12px;color:#6b7280;flex:1;min-width:160px;">担当
          <div><input id="f-contact" type="text" maxlength="30" placeholder="例: 総務部 山田" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;"></div>
        </label>
        <label style="font-size:12px;color:#6b7280;">最大参加人数
          <div><input id="f-capacity" type="number" min="0" placeholder="0=無制限" style="width:110px;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;"></div>
        </label>
      </div>
      <label style="font-size:12px;color:#6b7280;display:block;margin-bottom:12px;">対象者（任意・ポスターに表示されます）
        <div><input id="f-target" type="text" maxlength="60" placeholder="例: 新入社員（2026年入社）" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;"></div>
      </label>
      <label style="font-size:12px;color:#6b7280;display:block;margin-bottom:12px;">補足（任意・ポスターに表示されます）
        <div><textarea id="f-note" rows="2" maxlength="300" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;font-family:inherit;"></textarea></div>
      </label>
      <button onclick="saveSession()" id="save-btn" style="padding:9px 22px;background:#2563eb;color:white;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">作成する</button>
      <button onclick="resetForm()" id="cancel-edit-btn" style="display:none;padding:9px 18px;background:#f3f4f6;color:#374151;border:none;border-radius:7px;font-size:13px;cursor:pointer;margin-left:8px;">編集をキャンセル</button>
      <div id="form-err" style="color:#dc2626;font-size:12px;margin-top:10px;display:none;"></div>
    </div>` : ''}

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:1000px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:10px;">勉強会一覧</div>
      <div id="list-body" style="font-size:13px;color:#6b7280;">読み込み中...</div>
    </div>

    <div id="participants-panel" style="display:none;background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:1000px;margin-top:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;" id="participants-heading">参加者</div>
        <button onclick="closeParticipants()" style="padding:5px 12px;background:#f3f4f6;border:none;border-radius:6px;font-size:12px;cursor:pointer;">閉じる</button>
      </div>
      ${editable ? `
      <div style="position:relative;margin-bottom:14px;padding:12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;">
        <div style="font-size:12px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">突発的な参加者を追加（社員名簿から検索）</div>
        <input id="add-participant-q" type="text" placeholder="氏名または社員番号で検索" autocomplete="off" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;" oninput="searchEmployeesForAdd(this.value)">
        <div id="add-participant-results" style="display:none;position:absolute;left:12px;right:12px;top:56px;background:white;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,0.12);max-height:240px;overflow-y:auto;z-index:10;"></div>
      </div>` : ''}
      <div id="participants-body" style="font-size:13px;color:#6b7280;">読み込み中...</div>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:1000px;margin-top:16px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:4px;">キャンセルペナルティ</div>
      <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">開催前々日までのキャンセルが10回に達すると、カウントが0に戻り自動的に3ヶ月間、新規のお申し込みができなくなります（既存登録の確認・キャンセルは制限されません）。「解除する」でカウント・制限の両方をリセットできます。</div>
      <div id="penalties-body" style="font-size:13px;color:#6b7280;">読み込み中...</div>
    </div>

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:1000px;margin-top:16px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:4px;">参加者からの要望</div>
      <div style="font-size:11px;color:#9ca3af;margin-bottom:10px;">公開ページの「勉強会への要望を送る」から届いた、受けたい勉強会のテーマなどの自由記入です。</div>
      <div id="requests-body" style="font-size:13px;color:#6b7280;">読み込み中...</div>
    </div>

    <script>
    var API = '${ADMIN_PATH}/api/study-sessions';
    var EDITABLE = ${editable ? 'true' : 'false'};
    function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function copyShareUrl() {
      navigator.clipboard.writeText(document.getElementById('share-url').textContent).then(function() { alert('コピーしました'); });
    }
    var WD = ['日','月','火','水','木','金','土'];
    function fmtDate(d) {
      var t = new Date(d + 'T00:00:00');
      return (t.getMonth()+1) + '/' + t.getDate() + '(' + WD[t.getDay()] + ')';
    }
    function statusOf(s) {
      var today = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
      var full = s.capacity > 0 && s.participant_count >= s.capacity;
      if (s.is_closed) return { label: '受付終了(手動)', color: '#6b7280', bg: '#f3f4f6' };
      if (full) return { label: '満席（自動締切）', color: '#b45309', bg: '#fef3c7' };
      if (s.date < today) return { label: '開催済み', color: '#6b7280', bg: '#f3f4f6' };
      return { label: '募集中', color: '#166534', bg: '#f0fdf4' };
    }
    function resetForm() {
      document.getElementById('edit-id').value = '';
      ['f-title','f-date','f-start','f-end','f-location','f-contact','f-capacity','f-target','f-note'].forEach(function(id) { document.getElementById(id).value = ''; });
      document.getElementById('form-heading').textContent = '新しい勉強会を作成';
      document.getElementById('save-btn').textContent = '作成する';
      document.getElementById('cancel-edit-btn').style.display = 'none';
      document.getElementById('form-err').style.display = 'none';
    }
    function editSession(s) {
      document.getElementById('edit-id').value = s.id;
      document.getElementById('f-title').value = s.title;
      document.getElementById('f-date').value = s.date;
      document.getElementById('f-start').value = s.start_time || '';
      document.getElementById('f-end').value = s.end_time || '';
      document.getElementById('f-location').value = s.location || '';
      document.getElementById('f-contact').value = s.contact_name || '';
      document.getElementById('f-capacity').value = s.capacity || 0;
      document.getElementById('f-target').value = s.target_audience || '';
      document.getElementById('f-note').value = s.note || '';
      document.getElementById('form-heading').textContent = '勉強会を編集';
      document.getElementById('save-btn').textContent = '更新する';
      document.getElementById('cancel-edit-btn').style.display = 'inline-block';
      document.getElementById('form-heading').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    async function saveSession() {
      var errEl = document.getElementById('form-err');
      errEl.style.display = 'none';
      var id = document.getElementById('edit-id').value;
      var body = {
        title: document.getElementById('f-title').value.trim(),
        date: document.getElementById('f-date').value,
        start_time: document.getElementById('f-start').value,
        end_time: document.getElementById('f-end').value,
        location: document.getElementById('f-location').value.trim(),
        contact_name: document.getElementById('f-contact').value.trim(),
        capacity: parseInt(document.getElementById('f-capacity').value) || 0,
        target_audience: document.getElementById('f-target').value.trim(),
        note: document.getElementById('f-note').value.trim()
      };
      if (!body.title || !body.date) { errEl.textContent = 'タイトルと開催日は必須です'; errEl.style.display = 'block'; return; }
      var btn = document.getElementById('save-btn');
      btn.disabled = true;
      try {
        var res = await fetch(id ? API + '/' + id : API, {
          method: id ? 'PUT' : 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body)
        });
        var d = await res.json().catch(function() { return {}; });
        if (!res.ok) { errEl.textContent = d.error || '保存に失敗しました'; errEl.style.display = 'block'; return; }
        resetForm();
        loadList();
      } catch (e) {
        errEl.textContent = '保存に失敗しました。もう一度お試しください'; errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
      }
    }
    async function toggleClose(s) {
      var msg = s.is_closed ? 'この勉強会の受付を再開しますか？' : 'この勉強会を受付終了にしますか？';
      if (!confirm(msg)) return;
      var res = await fetch(API + '/' + s.id + '/close', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ is_closed: s.is_closed ? 0 : 1 }) });
      if (res.ok) loadList(); else alert('変更に失敗しました');
    }
    async function deleteSession(s) {
      if (!confirm('「' + s.title + '」を削除します。参加者の登録データも削除されます。よろしいですか？')) return;
      var res = await fetch(API + '/' + s.id, { method: 'DELETE' });
      if (res.ok) loadList(); else alert('削除に失敗しました');
    }
    var _participantsSessionId = null;
    function openParticipants(s) {
      _participantsSessionId = s.id;
      document.getElementById('participants-panel').style.display = 'block';
      document.getElementById('participants-heading').textContent = '参加者 — ' + s.title;
      document.getElementById('participants-body').innerHTML = '読み込み中...';
      document.getElementById('participants-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      loadParticipants();
    }
    function loadParticipants() {
      fetch(API + '/' + _participantsSessionId + '/participants').then(function(r) { return r.json(); }).then(function(d) {
        var rows = (d.participants || []);
        if (rows.length === 0) { document.getElementById('participants-body').innerHTML = '<div style="color:#9ca3af;">まだ参加登録がありません</div>'; return; }
        var attendedCount = rows.filter(function(p) { return p.attended; }).length;
        var summary = '<div style="font-size:12px;color:#6b7280;margin-bottom:8px;">出席消し込み: ' + attendedCount + ' / ' + rows.length + ' 名</div>';
        var html = summary + '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
          + '<thead><tr style="background:#f8fafc;"><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">出席</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">社員番号</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">氏名</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">課/班</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">登録日時</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;"></th></tr></thead><tbody>'
          + rows.map(function(p) {
              var cancelBtn = EDITABLE ? ('<button onclick="adminCancelParticipant(\\'' + escH(p.emp_no) + '\\')" style="padding:4px 10px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:11px;cursor:pointer;">キャンセル</button>') : '';
              var attendBtn = EDITABLE
                ? ('<button onclick="toggleAttend(\\'' + escH(p.emp_no) + '\\', ' + (p.attended ? 0 : 1) + ')" style="padding:5px 14px;border-radius:99px;font-size:12px;font-weight:700;cursor:pointer;border:1px solid ' + (p.attended ? '#86efac' : '#d1d5db') + ';background:' + (p.attended ? '#f0fdf4' : '#f9fafb') + ';color:' + (p.attended ? '#166534' : '#9ca3af') + ';">' + (p.attended ? '出席済' : '未消込') + '</button>')
                : ('<span style="color:' + (p.attended ? '#166534' : '#9ca3af') + ';font-weight:700;">' + (p.attended ? '出席済' : '未消込') + '</span>');
              return '<tr><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">' + attendBtn + '</td>'
                + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">' + escH(p.emp_no) + '</td>'
                + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-weight:600;">' + escH(p.name || '(該当社員なし)') + '</td>'
                + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">' + (p.division ? (p.division + '課' + (p.team ? '/' + p.team + '班' : '')) : '') + '</td>'
                + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;color:#9ca3af;">' + escH(p.updated_at || '') + '</td>'
                + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">' + cancelBtn + '</td></tr>';
            }).join('')
          + '</tbody></table>';
        document.getElementById('participants-body').innerHTML = html;
      });
    }
    async function toggleAttend(empNo, attended) {
      var res = await fetch(API + '/' + _participantsSessionId + '/participants/' + encodeURIComponent(empNo) + '/attend', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ attended: attended })
      });
      if (res.ok) loadParticipants(); else alert('更新に失敗しました');
    }
    var _addSearchTimer = null;
    function searchEmployeesForAdd(q) {
      clearTimeout(_addSearchTimer);
      var box = document.getElementById('add-participant-results');
      q = q.trim();
      if (!q) { box.style.display = 'none'; box.innerHTML = ''; return; }
      _addSearchTimer = setTimeout(function() {
        fetch(API + '/search-employees?q=' + encodeURIComponent(q)).then(function(r) { return r.json(); }).then(function(list) {
          if (!list.length) { box.innerHTML = '<div style="padding:10px;color:#9ca3af;font-size:12px;">該当する社員が見つかりません</div>'; box.style.display = 'block'; return; }
          box.innerHTML = list.map(function(e) {
            var div = e.division ? (e.division + '課' + (e.team ? '/' + e.team + '班' : '')) : '';
            return '<div onclick="addParticipant(\\'' + escH(e.emp_no) + '\\', \\'' + escH(e.name) + '\\')" style="padding:9px 12px;cursor:pointer;border-bottom:1px solid #f3f4f6;font-size:13px;" onmouseover="this.style.background=\\'#eff6ff\\'" onmouseout="this.style.background=\\'white\\'">'
              + '<b>' + escH(e.name) + '</b> <span style="color:#9ca3af;">' + escH(e.emp_no) + (div ? ' ・ ' + div : '') + '</span></div>';
          }).join('');
          box.style.display = 'block';
        });
      }, 250);
    }
    async function addParticipant(empNo, name) {
      var res = await fetch(API + '/' + _participantsSessionId + '/participants', {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ emp_no: empNo })
      });
      var d = await res.json().catch(function() { return {}; });
      if (!res.ok) { alert(d.error || '追加に失敗しました'); return; }
      document.getElementById('add-participant-q').value = '';
      document.getElementById('add-participant-results').style.display = 'none';
      loadParticipants();
      loadList();
    }
    async function adminCancelParticipant(empNo) {
      if (!confirm(empNo + ' さんの参加登録を管理者権限でキャンセルします（前日・当日でも取り消せます）。よろしいですか？')) return;
      var res = await fetch(API + '/' + _participantsSessionId + '/participants/' + encodeURIComponent(empNo), { method: 'DELETE' });
      if (res.ok) { loadParticipants(); loadList(); } else { var d = await res.json().catch(function(){return {};}); alert(d.error || 'キャンセルに失敗しました'); }
    }
    function closeParticipants() { document.getElementById('participants-panel').style.display = 'none'; }

    async function loadList() {
      var res = await fetch(API);
      var d = await res.json();
      var sessions = d.sessions || [];
      window._sessions = {};
      sessions.forEach(function(s) { window._sessions[s.id] = s; });
      if (sessions.length === 0) { document.getElementById('list-body').innerHTML = '<div style="color:#9ca3af;">まだ勉強会が登録されていません</div>'; return; }
      var html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:760px;">'
        + '<thead><tr style="background:#f8fafc;"><th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">状態</th><th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">タイトル</th><th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">開催日時</th><th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">集合場所</th><th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">参加者</th><th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;"></th></tr></thead><tbody>'
        + sessions.map(function(s) {
            var st = statusOf(s);
            var timeLabel = (s.start_time || '') + (s.end_time ? '〜' + s.end_time : '');
            var capLabel = s.capacity > 0 ? (s.participant_count + ' / ' + s.capacity + '名') : (s.participant_count + '名（無制限）');
            var ops = '<button onclick="openParticipants(window._sessions[' + s.id + '])" style="padding:5px 10px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a5f;border-radius:6px;font-size:11px;cursor:pointer;margin-right:4px;">参加者</button>'
              + '<a href="${ADMIN_PATH}/settings/study-sessions/' + s.id + '/poster" target="_blank" style="display:inline-block;padding:5px 10px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:6px;font-size:11px;text-decoration:none;margin-right:4px;">ポスター</a>'
              + '<a href="${ADMIN_PATH}/settings/study-sessions/' + s.id + '/roster" target="_blank" style="display:inline-block;padding:5px 10px;background:#fefce8;border:1px solid #fde68a;color:#92400e;border-radius:6px;font-size:11px;text-decoration:none;margin-right:4px;">名簿印刷</a>';
            if (EDITABLE) {
              ops += '<button onclick="editSession(window._sessions[' + s.id + '])" style="padding:5px 10px;background:#f9fafb;border:1px solid #d1d5db;color:#374151;border-radius:6px;font-size:11px;cursor:pointer;margin-right:4px;">編集</button>'
                + '<button onclick="toggleClose(window._sessions[' + s.id + '])" style="padding:5px 10px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:6px;font-size:11px;cursor:pointer;margin-right:4px;">' + (s.is_closed ? '受付再開' : '早期締切') + '</button>'
                + '<button onclick="deleteSession(window._sessions[' + s.id + '])" style="padding:5px 10px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:11px;cursor:pointer;">削除</button>';
            }
            return '<tr><td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;"><span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;color:' + st.color + ';background:' + st.bg + ';">' + st.label + '</span></td>'
              + '<td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;font-weight:600;color:#1e3a5f;">' + escH(s.title) + '</td>'
              + '<td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">' + fmtDate(s.date) + ' ' + escH(timeLabel) + '</td>'
              + '<td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;">' + escH(s.location || '') + '</td>'
              + '<td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">' + capLabel + '</td>'
              + '<td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">' + ops + '</td></tr>';
          }).join('')
        + '</tbody></table></div>';
      document.getElementById('list-body').innerHTML = html;
    }

    async function loadPenalties() {
      var res = await fetch(API + '/penalties');
      var d = await res.json();
      var rows = d.penalties || [];
      if (rows.length === 0) { document.getElementById('penalties-body').innerHTML = '<div style="color:#9ca3af;">対象者はいません</div>'; return; }
      var today = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);
      var html = '<table style="width:100%;border-collapse:collapse;font-size:13px;">'
        + '<thead><tr style="background:#f8fafc;"><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">社員番号</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">氏名</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">キャンセル回数</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">申し込み制限</th><th style="padding:6px 8px;text-align:left;border-bottom:2px solid #e5e7eb;"></th></tr></thead><tbody>'
        + rows.map(function(p) {
            var active = p.penalty_until && p.penalty_until >= today;
            var statusHtml = active ? ('<span style="color:#dc2626;font-weight:700;">' + escH(p.penalty_until) + ' まで不可</span>') : '<span style="color:#9ca3af;">なし</span>';
            var btn = EDITABLE ? ('<button onclick="clearPenalty(\\'' + escH(p.emp_no) + '\\')" style="padding:5px 12px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:6px;font-size:11px;cursor:pointer;">解除する</button>') : '';
            return '<tr><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">' + escH(p.emp_no) + '</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;font-weight:600;">' + escH(p.name || '(該当社員なし)') + '</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">' + p.cancel_count + ' / 10</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">' + statusHtml + '</td>'
              + '<td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;">' + btn + '</td></tr>';
          }).join('')
        + '</tbody></table>';
      document.getElementById('penalties-body').innerHTML = html;
    }
    async function clearPenalty(empNo) {
      if (!confirm(empNo + ' のキャンセル回数・申し込み制限を解除しますか？')) return;
      var res = await fetch(API + '/penalties/' + encodeURIComponent(empNo) + '/clear', { method: 'POST' });
      if (res.ok) loadPenalties(); else alert('解除に失敗しました');
    }

    async function loadRequests() {
      var res = await fetch(API + '/requests');
      var d = await res.json();
      var rows = d.requests || [];
      if (rows.length === 0) { document.getElementById('requests-body').innerHTML = '<div style="color:#9ca3af;">まだ要望はありません</div>'; return; }
      var html = rows.map(function(r) {
        var who = escH(r.name || '(該当社員なし)') + ' <span style="color:#9ca3af;">' + escH(r.emp_no) + (r.division ? ' ・ ' + r.division + '課' + (r.team ? '/' + r.team + '班' : '') : '') + '</span>';
        var delBtn = EDITABLE ? ('<button onclick="deleteRequest(' + r.id + ')" style="padding:4px 10px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:11px;cursor:pointer;flex-shrink:0;">削除</button>') : '';
        return '<div style="display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #f3f4f6;">'
          + '<div style="flex:1;"><div style="font-size:13px;color:#1f2937;white-space:pre-wrap;">' + escH(r.content) + '</div>'
          + '<div style="font-size:11px;color:#9ca3af;margin-top:4px;">' + who + ' ・ ' + escH(r.created_at || '') + '</div></div>'
          + delBtn + '</div>';
      }).join('');
      document.getElementById('requests-body').innerHTML = html;
    }
    async function deleteRequest(id) {
      if (!confirm('この要望を削除しますか？')) return;
      var res = await fetch(API + '/requests/' + id, { method: 'DELETE' });
      if (res.ok) loadRequests(); else alert('削除に失敗しました');
    }

    loadList();
    loadPenalties();
    loadRequests();
    </script>`;
  return c.html(layout('勉強会募集', html, 'settings'));
});

// ===== ページ: A3縦ポスター印刷 =====
app.get('/settings/study-sessions/:id/poster', async (c) => {
  const id = parseInt(c.req.param('id'));
  const session = await c.env.DB.prepare('SELECT * FROM study_sessions WHERE id = ?').bind(id).first<StudySession>();
  if (!session) return c.text('勉強会が見つかりません', 404);

  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const d = new Date(session.date + 'T00:00:00');
  const dateLabel = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`;
  const timeLabel = [session.start_time, session.end_time].filter(Boolean).join(' 〜 ') || '別途ご案内';
  const capNote = session.capacity > 0 ? `【定員 ${session.capacity}名・先着順】定員に達し次第、受付を終了します` : '';

  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>勉強会ポスター - ${escHtml(session.title)}</title>
<style>
  @page { size: A3 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; }
  body { font-family: 'Hiragino Sans', 'Meiryo', sans-serif; }
  .toolbar { padding: 14px 20px; background: white; border-bottom: 1px solid #e5e7eb; display: flex; gap: 10px; }
  .toolbar button { padding: 9px 22px; background: #2563eb; color: white; border: none; border-radius: 7px; font-size: 14px; font-weight: 700; cursor: pointer; }
  .poster-wrap { display: flex; justify-content: center; padding: 20px; }
  .poster {
    width: 297mm; height: 420mm; background: white; position: relative;
    padding: 22mm 18mm; display: flex; flex-direction: column; align-items: center;
    box-shadow: 0 2px 10px rgba(0,0,0,0.15);
  }
  .eyebrow { font-size: 18pt; font-weight: 700; color: #2563eb; letter-spacing: 4px; }
  .title { font-size: 46pt; font-weight: 900; color: #1e3a5f; text-align: center; line-height: 1.35; margin: 10mm 0 14mm; word-break: keep-all; }
  .info-table { width: 100%; border-top: 3px solid #1e3a5f; margin-top: 4mm; }
  .info-row { display: flex; align-items: baseline; gap: 10mm; padding: 7mm 0; border-bottom: 1px solid #d1d5db; }
  .info-label { flex: 0 0 42mm; font-size: 15pt; font-weight: 700; color: #2563eb; }
  .info-value { flex: 1; font-size: 22pt; font-weight: 700; color: #1f2937; }
  .note-section { margin-top: 6mm; padding: 6mm 8mm; background: #f8fafc; border-radius: 4mm; font-size: 13pt; color: #374151; text-align: center; line-height: 1.7; white-space: pre-wrap; max-width: 220mm; }
  .cap-note { margin-top: 6mm; font-size: 13pt; font-weight: 700; color: #b45309; text-align: center; }
  .qr-section { margin-top: auto; padding-top: 10mm; display: flex; flex-direction: column; align-items: center; }
  .qr-caption { font-size: 20pt; font-weight: 900; color: #1e3a5f; margin-bottom: 6mm; }
  .qr-box { width: 85mm; height: 85mm; border: 4px solid #1e3a5f; border-radius: 6mm; padding: 5mm; background: white; }
  .qr-url { margin-top: 5mm; font-size: 10pt; color: #6b7280; word-break: break-all; text-align: center; max-width: 200mm; }
  @media print {
    .toolbar { display: none; }
    body { background: white; }
    .poster-wrap { padding: 0; }
    .poster { box-shadow: none; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">印刷する</button>
  </div>
  <div class="poster-wrap">
    <div class="poster">
      <div class="eyebrow">STUDY SESSION</div>
      <div class="title">${escHtml(session.title)}</div>
      <div class="info-table">
        <div class="info-row"><div class="info-label">日　時</div><div class="info-value">${escHtml(dateLabel)}<br>${escHtml(timeLabel)}</div></div>
        <div class="info-row"><div class="info-label">集合場所</div><div class="info-value">${escHtml(session.location || '別途ご案内')}</div></div>
        <div class="info-row"><div class="info-label">担　当</div><div class="info-value">${escHtml(session.contact_name || '別途ご案内')}</div></div>
        ${session.target_audience ? `<div class="info-row"><div class="info-label">対　象</div><div class="info-value">${escHtml(session.target_audience)}</div></div>` : ''}
      </div>
      ${session.note ? `<div class="note-section">${escHtml(session.note)}</div>` : ''}
      ${capNote ? `<div class="cap-note">${escHtml(capNote)}</div>` : ''}
      <div class="qr-section">
        <div class="qr-caption">QRを読み取って参加申し込み</div>
        <div class="qr-box">${tokenToQrSvg(shareUrl(), 8)}</div>
        <div class="qr-url">${escHtml(shareUrl())}</div>
      </div>
    </div>
  </div>
</body>
</html>`);
});

// ===== ページ: 参加者名簿印刷（A4・タイトル編集可・課ごと/全員・全ページ右下に印鑑欄） =====
app.get('/settings/study-sessions/:id/roster', async (c) => {
  const id = parseInt(c.req.param('id'));
  const session = await c.env.DB.prepare('SELECT * FROM study_sessions WHERE id = ?').bind(id).first<StudySession>();
  if (!session) return c.text('勉強会が見つかりません', 404);

  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  const d = new Date(session.date + 'T00:00:00');
  const dateLabel = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`;

  return c.html(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>参加者名簿 - ${escHtml(session.title)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #e5e7eb; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; color: #1f2937; }
  .toolbar { position: sticky; top: 0; z-index: 10; padding: 14px 20px; background: white; border-bottom: 1px solid #e5e7eb; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .toolbar label { font-size: 12px; color: #6b7280; display: flex; align-items: center; gap: 6px; }
  .toolbar input[type=text] { font-size: 13px; padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 6px; min-width: 260px; }
  .toolbar select { font-size: 13px; padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 6px; }
  .toolbar button { padding: 8px 20px; background: #2563eb; color: white; border: none; border-radius: 7px; font-size: 13px; font-weight: 700; cursor: pointer; }
  .toolbar .hint { color: #9ca3af; font-size: 12px; }
  .stage { padding: 20px; display: flex; flex-direction: column; align-items: center; gap: 16px; }

  /* .sheet は印刷1ページ分の固定サイズ。中身(.sheet-fit)がどれだけ長くても
     overflow:hidden + 自動縮小スクリプトで必ずこのページ内に収まる。
     印鑑欄(.rl-stamp-footer)は.sheet-fitの外＝兄弟要素として絶対配置するため、
     本文がどれだけ伸びても押し出されたり2ページ目にはみ出したりしない */
  .sheet { width: 210mm; height: 297mm; background: #fff; padding: 14mm 16mm; box-shadow: 0 4px 20px rgba(0,0,0,0.2); overflow: hidden; position: relative; }
  .sheet-fit { width: 100%; transform-origin: top left; }
  /* 印鑑欄の高さぶんを本文側にも確保しておくことで、自動縮小の計算に反映され本文と重ならない（余裕を持たせて34mm） */
  .rl-content-pad { padding-bottom: 34mm; }

  h1 { font-size: 20pt; text-align: center; color: #1e3a5f; margin: 0 0 3mm; }
  .meta { text-align: center; font-size: 10.5pt; color: #4b5563; margin-bottom: 6mm; }
  .page-subtitle { font-size: 11pt; font-weight: 700; color: #1e3a5f; margin-bottom: 4mm; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  th, td { border: 1px solid #9ca3af; padding: 4.5px 8px; text-align: left; }
  th { background: #f1f5f9; font-weight: 700; }
  td.center, th.center { text-align: center; }
  .stamp { display: inline-block; width: 4.5mm; height: 4.5mm; border: 1.5px solid #6b7280; border-radius: 50%; }
  .printed-at { margin-top: 4mm; text-align: right; font-size: 8.5pt; color: #9ca3af; }
  .page-no { position: absolute; left: 16mm; bottom: 8mm; font-size: 8.5pt; color: #9ca3af; }

  .rl-stamp-footer { position: absolute; right: 16mm; bottom: 10mm; display: flex; justify-content: flex-end; }
  .rl-stamp-row { display: flex; gap: 10mm; }
  .rl-stamp-box { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .rl-stamp-frame { width: 16mm; height: 16mm; border: 1.5px solid #64748b; border-radius: 4px; }
  .rl-stamp-label { font-size: 9.5pt; color: #475569; }

  @media print {
    .toolbar { display: none; }
    html, body { background: #fff; }
    .stage { padding: 0; gap: 0; }
    .sheet { box-shadow: none; page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }
    @page { size: A4 portrait; margin: 0; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <label>タイトル<input type="text" id="title-input" value="参加者名簿" oninput="renderPages()"></label>
    <label>対象<select id="division-select" onchange="renderPages()">
      <option value="0">全員まとめて</option>
      <option value="1">1課のみ</option>
      <option value="2">2課のみ</option>
      <option value="3">3課のみ</option>
      <option value="4">4課のみ</option>
    </select></label>
    <button onclick="window.print()">印刷する</button>
    <span class="hint" id="page-count-hint"></span>
  </div>
  <div class="stage" id="stage"></div>
<script>
function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
var _rows = [];
var SESSION_TITLE = ${JSON.stringify(session.title)};
var SESSION_META = ${JSON.stringify(`${dateLabel}　${session.location || ''}`)};
var ROWS_PER_PAGE = 28;

async function load() {
  var res = await fetch('${ADMIN_PATH}/api/study-sessions/${id}/participants');
  var d = await res.json();
  _rows = d.participants || [];
  renderPages();
}

function stampFooterHtml() {
  return '<div class="rl-stamp-footer"><div class="rl-stamp-row">'
    + '<div class="rl-stamp-box"><div class="rl-stamp-frame"></div><div class="rl-stamp-label">所長</div></div>'
    + '<div class="rl-stamp-box"><div class="rl-stamp-frame"></div><div class="rl-stamp-label">課長</div></div>'
    + '<div class="rl-stamp-box"><div class="rl-stamp-frame"></div><div class="rl-stamp-label">班長</div></div>'
    + '<div class="rl-stamp-box"><div class="rl-stamp-frame"></div><div class="rl-stamp-label">教育担当</div></div>'
    + '</div></div>';
}

function tableHtml(rows) {
  return '<table><thead><tr><th class="center" style="width:14mm;">課</th><th class="center" style="width:14mm;">班</th><th style="width:30mm;">社員番号</th><th>氏名</th><th class="center" style="width:18mm;">出席</th></tr></thead><tbody>'
    + rows.map(function(p) {
        return '<tr><td class="center">' + (p.division || '') + '</td><td class="center">' + (p.team || '') + '</td><td>' + escH(p.emp_no) + '</td><td>' + escH(p.name || '(該当社員なし)') + '</td>'
          + '<td class="center">' + (p.attended ? '✓' : '<span class="stamp"></span>') + '</td></tr>';
      }).join('')
    + '</tbody></table>';
}

function renderPages() {
  var title = document.getElementById('title-input').value || '参加者名簿';
  var div = parseInt(document.getElementById('division-select').value);
  var rows = div ? _rows.filter(function(p) { return p.division === div; }) : _rows;
  var stage = document.getElementById('stage');

  if (rows.length === 0) {
    stage.innerHTML = '<div class="sheet"><div class="sheet-fit"><h1>' + escH(title) + '</h1><div class="meta">' + escH(SESSION_TITLE) + '　' + escH(SESSION_META) + '</div>'
      + '<div style="text-align:center;color:#9ca3af;padding:20px;">対象者がいません</div></div></div>';
    document.getElementById('page-count-hint').textContent = '';
    return;
  }

  var chunks = [];
  for (var i = 0; i < rows.length; i += ROWS_PER_PAGE) chunks.push(rows.slice(i, i + ROWS_PER_PAGE));
  var now = new Date(Date.now() + 9*3600*1000).toISOString().slice(0,10);

  stage.innerHTML = chunks.map(function(chunk, idx) {
    var head = (idx === 0)
      ? ('<h1>' + escH(title) + '</h1><div class="meta">' + escH(SESSION_TITLE) + '　' + escH(SESSION_META) + '</div>')
      : ('<div class="page-subtitle">' + escH(title) + '（' + (idx + 1) + ' / ' + chunks.length + 'ページ）</div>');
    var footNote = (idx === chunks.length - 1) ? ('<div class="printed-at">印刷日: ' + now + '</div>') : '';
    return '<div class="sheet">'
      + '<div class="sheet-fit"><div class="rl-content-pad">' + head + tableHtml(chunk) + footNote + '</div></div>'
      + stampFooterHtml()
      + '<div class="page-no">' + (idx + 1) + ' / ' + chunks.length + '</div>'
      + '</div>';
  }).join('');

  document.getElementById('page-count-hint').textContent = '全' + rows.length + '名 / ' + chunks.length + 'ページ';
  fitAllSheets();
}

// A4シート(.sheet-fit)の自動縮小。収まるまで数回繰り返して収束させる
// （1回きりの補正だと縮小率がずれて行が欠けたり空白ページが出ることがあるための対策）
function fitAllSheets() {
  var pxPerMm = 96 / 25.4;
  var availablePx = (297 - 28) * pxPerMm;
  document.querySelectorAll('.sheet-fit').forEach(function (fit) {
    fit.style.transform = 'none';
    fit.style.width = '100%';
    var scale = 1;
    for (var i = 0; i < 6; i++) {
      var natural = fit.scrollHeight;
      if (natural <= 0 || natural * scale <= availablePx) break;
      scale = (availablePx / natural) * 0.97;
      fit.style.width = (100 / scale) + '%';
      fit.style.transform = 'scale(' + scale + ')';
    }
  });
}

load();
window.addEventListener('beforeprint', fitAllSheets);
</script>
</body>
</html>`);
});

// ===== API =====
app.get('/api/study-sessions', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT s.*, (SELECT COUNT(*) FROM study_session_participants p WHERE p.session_id = s.id) AS participant_count
    FROM study_sessions s ORDER BY s.date DESC, s.id DESC
  `).all();
  return c.json({ sessions: rows.results ?? [] });
});

app.get('/api/study-sessions/:id/participants', async (c) => {
  const id = parseInt(c.req.param('id'));
  const rows = await c.env.DB.prepare(`
    SELECT p.emp_no, p.updated_at, p.attended, e.name, e.division, e.team
    FROM study_session_participants p
    LEFT JOIN employees e ON e.emp_no = p.emp_no
    WHERE p.session_id = ?
    ORDER BY e.division, e.team, p.updated_at
  `).bind(id).all();
  return c.json({ participants: rows.results ?? [] });
});

// 突発的な参加者を社員名簿から検索して追加するためのオートコンプリート
app.get('/api/study-sessions/search-employees', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 40);
  if (!q) return c.json([]);
  const rows = await c.env.DB.prepare(
    `SELECT emp_no, name, division, team FROM employees
     WHERE is_active = 1 AND (name LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)
     ORDER BY division, team, seq_no LIMIT 20`
  ).bind(`%${q}%`, `%${q}%`, `%${q}%`).all<{ emp_no: string; name: string; division: number | null; team: number | null }>();
  return c.json(rows.results ?? []);
});

// 管理者による突発的な参加者の手動追加（定員・締切・開催日を問わず追加できる）
app.post('/api/study-sessions/:id/participants', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const session = await c.env.DB.prepare('SELECT id FROM study_sessions WHERE id = ?').bind(id).first();
  if (!session) return c.json({ error: '勉強会が見つかりません' }, 404);
  const b = await c.req.json<{ emp_no?: string }>();
  const empNo = S(b.emp_no, 20);
  if (!empNo) return c.json({ error: '社員番号を指定してください' }, 400);
  const emp = await c.env.DB.prepare('SELECT emp_no FROM employees WHERE emp_no = ? AND is_active = 1').bind(empNo).first();
  if (!emp) return c.json({ error: '該当する社員が見つかりません' }, 404);
  await c.env.DB.prepare(
    `INSERT INTO study_session_participants (session_id, emp_no) VALUES (?, ?)
     ON CONFLICT(session_id, emp_no) DO UPDATE SET updated_at = datetime('now','localtime')`
  ).bind(id, empNo).run();
  return c.json({ ok: true });
});

// 当日の出席消し込み（管理者がチェック・取り消しできる）
app.post('/api/study-sessions/:id/participants/:emp_no/attend', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const empNo = c.req.param('emp_no');
  const b = await c.req.json<{ attended?: number }>();
  await c.env.DB.prepare(
    `UPDATE study_session_participants SET attended = ?, updated_at = datetime('now','localtime') WHERE session_id = ? AND emp_no = ?`
  ).bind(b.attended ? 1 : 0, id, empNo).run();
  return c.json({ ok: true });
});

// 管理者による強制キャンセル（前日・当日以降でも取り消し可。公開側のキャンセル回数ペナルティには加算しない）
app.delete('/api/study-sessions/:id/participants/:emp_no', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const empNo = c.req.param('emp_no');
  await c.env.DB.prepare('DELETE FROM study_session_participants WHERE session_id = ? AND emp_no = ?').bind(id, empNo).run();
  return c.json({ ok: true });
});

app.post('/api/study-sessions', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const b = await c.req.json<{
    title?: string; date?: string; start_time?: string; end_time?: string;
    location?: string; contact_name?: string; capacity?: number; target_audience?: string; note?: string;
  }>();
  const title = S(b.title, 60);
  const date = S(b.date, 10);
  const startTime = S(b.start_time, 5);
  const endTime = S(b.end_time, 5);
  if (!title) return c.json({ error: 'タイトルを入力してください' }, 400);
  if (!isValidDate(date)) return c.json({ error: '開催日の形式が正しくありません' }, 400);
  if (!isValidTime(startTime) || !isValidTime(endTime)) return c.json({ error: '時刻の形式が正しくありません' }, 400);
  const capacity = Number.isFinite(b.capacity) && (b.capacity as number) >= 0 ? Math.floor(b.capacity as number) : 0;

  const result = await c.env.DB.prepare(
    `INSERT INTO study_sessions (title, date, start_time, end_time, location, contact_name, capacity, target_audience, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(title, date, startTime || null, endTime || null, S(b.location, 60) || null, S(b.contact_name, 30) || null, capacity, S(b.target_audience, 60) || null, S(b.note, 300) || null).run();

  return c.json({ ok: true, id: result.meta.last_row_id });
});

app.put('/api/study-sessions/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const existing = await c.env.DB.prepare('SELECT id FROM study_sessions WHERE id = ?').bind(id).first();
  if (!existing) return c.json({ error: '勉強会が見つかりません' }, 404);

  const b = await c.req.json<{
    title?: string; date?: string; start_time?: string; end_time?: string;
    location?: string; contact_name?: string; capacity?: number; target_audience?: string; note?: string;
  }>();
  const title = S(b.title, 60);
  const date = S(b.date, 10);
  const startTime = S(b.start_time, 5);
  const endTime = S(b.end_time, 5);
  if (!title) return c.json({ error: 'タイトルを入力してください' }, 400);
  if (!isValidDate(date)) return c.json({ error: '開催日の形式が正しくありません' }, 400);
  if (!isValidTime(startTime) || !isValidTime(endTime)) return c.json({ error: '時刻の形式が正しくありません' }, 400);
  const capacity = Number.isFinite(b.capacity) && (b.capacity as number) >= 0 ? Math.floor(b.capacity as number) : 0;

  await c.env.DB.prepare(
    `UPDATE study_sessions SET title = ?, date = ?, start_time = ?, end_time = ?, location = ?, contact_name = ?, capacity = ?, target_audience = ?, note = ?, updated_at = datetime('now','localtime')
     WHERE id = ?`
  ).bind(title, date, startTime || null, endTime || null, S(b.location, 60) || null, S(b.contact_name, 30) || null, capacity, S(b.target_audience, 60) || null, S(b.note, 300) || null, id).run();

  return c.json({ ok: true });
});

app.post('/api/study-sessions/:id/close', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  const b = await c.req.json<{ is_closed?: number }>();
  await c.env.DB.prepare(`UPDATE study_sessions SET is_closed = ?, updated_at = datetime('now','localtime') WHERE id = ?`)
    .bind(b.is_closed ? 1 : 0, id).run();
  return c.json({ ok: true });
});

app.delete('/api/study-sessions/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM study_session_participants WHERE session_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM study_sessions WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

app.get('/api/study-sessions/penalties', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT p.emp_no, p.cancel_count, p.penalty_until, e.name, e.division, e.team
    FROM study_session_penalties p
    LEFT JOIN employees e ON e.emp_no = p.emp_no
    WHERE p.cancel_count > 0 OR p.penalty_until IS NOT NULL
    ORDER BY (p.penalty_until IS NOT NULL) DESC, p.penalty_until, p.cancel_count DESC
  `).all();
  return c.json({ penalties: rows.results ?? [] });
});

app.post('/api/study-sessions/penalties/:emp_no/clear', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const empNo = c.req.param('emp_no');
  await c.env.DB.prepare('DELETE FROM study_session_penalties WHERE emp_no = ?').bind(empNo).run();
  return c.json({ ok: true });
});

app.get('/api/study-sessions/requests', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT r.id, r.emp_no, r.content, r.created_at, e.name, e.division, e.team
    FROM study_session_requests r
    LEFT JOIN employees e ON e.emp_no = r.emp_no
    ORDER BY r.created_at DESC
  `).all();
  return c.json({ requests: rows.results ?? [] });
});

app.delete('/api/study-sessions/requests/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: '権限がありません' }, 403);
  const id = parseInt(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM study_session_requests WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
