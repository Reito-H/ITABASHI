// 調整機能（設定ページ・管理側）
// ページ: /settings/chosei（調整の一覧・作成・編集・集計）
// API   : /api/chosei/*（権限: settings.chosei / .edit）
// 公開側（社員番号照合の回答ページ）は routes/public_chosei.ts を参照。
// 調整（イベント）ごとに 32桁トークンを発行し、共有URLは調整1件につき1本だけ。
import { Hono } from 'hono';
import qrcode from 'qrcode-generator';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { getAdminPermissions } from '../permissions';
import { ADMIN_PATH, CHOSEI_PATH } from '../config';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

async function canEdit(c: { env: Env; get: (k: 'adminId') => number }): Promise<boolean> {
  const perms = await getAdminPermissions(c.env.DB, c.get('adminId'));
  return perms === null || perms.includes('settings.chosei.edit');
}

async function adminName(env: Env, adminId: number): Promise<string> {
  const row = await env.DB.prepare('SELECT username FROM admins WHERE id = ?').bind(adminId).first<{ username: string }>();
  return row?.username ?? '';
}

const S = (v: unknown, max: number): string => String(v ?? '').slice(0, max).trim();

function newToken(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

function shareUrl(token: string): string {
  return `https://bentenclub.com${CHOSEI_PATH}/${token}`;
}

function tokenToQrSvg(data: string, cellSize = 4): string {
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  return qr.createSvgTag({ cellSize, margin: 4, scalable: true })
    .replace(/black/g, '#1e3a5f').replace(/white/g, '#ffffff');
}

type EventRow = {
  id: number; token: string; title: string; description: string; contact_name: string;
  is_closed: number; created_by: string; created_at: string;
};

// ===== ページ =====
app.get('/settings/chosei', async (c) => {
  const editable = await canEdit(c);
  const html = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
      <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">調整</h2>
      <span style="font-size:12px;color:#9ca3af;">日程調整（調整さん形式）。共有URLは調整ごとに1本</span>
    </div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:16px;line-height:1.7;">
      「調整」を作成すると、推測されない専用URLが1本発行されます。そのURLを回答してほしい人に共有してください。回答者はURLを開いて社員番号を入力し、各候補に ○（参加できる）／△（調整すれば可）／×（不可）とコメントを登録します。同じ社員番号で開き直すと前回の回答を上書きできます。
    </div>

    ${editable ? `
    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:820px;margin-bottom:16px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:12px;" id="form-heading">新しい調整を作成</div>
      <input type="hidden" id="edit-id" value="">
      <label style="font-size:12px;color:#6b7280;display:block;margin-bottom:12px;">タイトル
        <div><input id="f-title" type="text" maxlength="80" placeholder="例: 10月 課内ミーティングの日程調整" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;"></div>
      </label>
      <label style="font-size:12px;color:#6b7280;display:block;margin-bottom:12px;">説明（任意・回答ページに表示されます）
        <div><textarea id="f-desc" rows="2" maxlength="500" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;font-family:inherit;"></textarea></div>
      </label>
      <label style="font-size:12px;color:#6b7280;display:block;margin-bottom:12px;">担当者（任意）
        <div><input id="f-contact" type="text" maxlength="40" placeholder="例: 総務 山田" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;"></div>
      </label>
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">日程候補（カレンダーの日付をクリックで追加／下の欄は自由に編集できます）</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;margin-bottom:12px;">
        <div id="cal" style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;background:#fbfcfe;flex-shrink:0;"></div>
        <div style="flex:1;min-width:240px;">
          <div id="opt-rows"></div>
          <button type="button" onclick="addOptRow('')" style="margin-top:6px;padding:6px 12px;background:#f9fafb;border:1px solid #d1d5db;color:#374151;border-radius:6px;font-size:12px;cursor:pointer;">＋ 自由入力で行を追加</button>
        </div>
      </div>
      <button onclick="saveEvent()" id="save-btn" style="padding:9px 22px;background:#2563eb;color:white;border:none;border-radius:7px;font-size:13px;font-weight:600;cursor:pointer;">作成する</button>
      <button onclick="resetForm()" id="cancel-edit-btn" style="display:none;padding:9px 18px;background:#f3f4f6;color:#374151;border:none;border-radius:7px;font-size:13px;cursor:pointer;margin-left:8px;">編集をキャンセル</button>
      <div id="form-err" style="color:#dc2626;font-size:12px;margin-top:10px;display:none;"></div>
      <div style="font-size:11px;color:#9ca3af;margin-top:10px;">編集で候補行を消すと、その候補への回答も一緒に削除されます。行を足すと既存の回答者はその候補が未回答（×扱い）になります。</div>
    </div>` : ''}

    <div style="background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:1000px;">
      <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:10px;">調整一覧</div>
      <div id="list-body" style="font-size:13px;color:#6b7280;">読み込み中...</div>
    </div>

    <div id="summary-panel" style="display:none;background:white;border:1px solid #e5e7eb;border-radius:10px;padding:18px;max-width:1100px;margin-top:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:10px;flex-wrap:wrap;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;" id="summary-heading">集計</div>
        <button onclick="closeSummary()" style="padding:5px 12px;background:#f3f4f6;border:none;border-radius:6px;font-size:12px;cursor:pointer;">閉じる</button>
      </div>
      <div id="summary-share" style="margin-bottom:14px;"></div>
      <div id="summary-body" style="font-size:13px;color:#6b7280;overflow-x:auto;">読み込み中...</div>
    </div>

    <script>
    var API = '${ADMIN_PATH}/api/chosei';
    var EDITABLE = ${editable ? 'true' : 'false'};
    var MARK_LABEL = { o: '○', t: '△', x: '×' };
    var MARK_COLOR = { o: '#166534', t: '#b45309', x: '#9ca3af' };
    function escH(s) { return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function copyText(t) { navigator.clipboard.writeText(t).then(function() { alert('コピーしました'); }); }

    // ===== 日程候補（カレンダー選択 + 自由編集リスト） =====
    var WD = ['日','月','火','水','木','金','土'];
    var _optRows = [];
    var _calY, _calM; // 表示中の年・月(0-11)
    (function initCal() { var t = new Date(); _calY = t.getFullYear(); _calM = t.getMonth(); })();

    function dayLabel(y, m, d) {
      var dow = new Date(y, m, d).getDay();
      return (m + 1) + '/' + d + '(' + WD[dow] + ')';
    }
    function rowHasDay(y, m, d) {
      var pfx = (m + 1) + '/' + d + '(';
      for (var i = 0; i < _optRows.length; i++) { if ((_optRows[i] || '').indexOf(pfx) === 0) return i; }
      return -1;
    }
    function toggleDay(y, m, d) {
      var idx = rowHasDay(y, m, d);
      if (idx >= 0) { _optRows.splice(idx, 1); }
      else { _optRows.push(dayLabel(y, m, d)); }
      renderOptRows(); renderCal();
    }
    function calShift(delta) {
      _calM += delta;
      while (_calM < 0) { _calM += 12; _calY--; }
      while (_calM > 11) { _calM -= 12; _calY++; }
      renderCal();
    }
    function renderCal() {
      if (!document.getElementById('cal')) return;
      var first = new Date(_calY, _calM, 1);
      var startDow = first.getDay();
      var daysInMonth = new Date(_calY, _calM + 1, 0).getDate();
      var todayStr = new Date().toISOString().slice(0, 10);
      var html = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;width:238px;">'
        + '<button type="button" onclick="calShift(-1)" style="border:1px solid #d1d5db;background:#fff;border-radius:6px;width:26px;height:26px;cursor:pointer;">‹</button>'
        + '<div style="font-size:13px;font-weight:700;color:#1e3a5f;">' + _calY + '年' + (_calM + 1) + '月</div>'
        + '<button type="button" onclick="calShift(1)" style="border:1px solid #d1d5db;background:#fff;border-radius:6px;width:26px;height:26px;cursor:pointer;">›</button>'
        + '</div>';
      html += '<div style="display:grid;grid-template-columns:repeat(7,34px);gap:2px;">';
      for (var w = 0; w < 7; w++) {
        var wc = w === 0 ? '#dc2626' : (w === 6 ? '#2563eb' : '#9ca3af');
        html += '<div style="text-align:center;font-size:11px;color:' + wc + ';padding:2px 0;">' + WD[w] + '</div>';
      }
      for (var b = 0; b < startDow; b++) html += '<div></div>';
      for (var d = 1; d <= daysInMonth; d++) {
        var iso = _calY + '-' + ('0' + (_calM + 1)).slice(-2) + '-' + ('0' + d).slice(-2);
        var sel = rowHasDay(_calY, _calM, d) >= 0;
        var isPast = iso < todayStr;
        var bg = sel ? '#2563eb' : (isPast ? '#f3f4f6' : '#fff');
        var col = sel ? '#fff' : (isPast ? '#c4c9d2' : '#1f2937');
        html += '<button type="button" onclick="toggleDay(' + _calY + ',' + _calM + ',' + d + ')" '
          + 'style="height:32px;border:1px solid ' + (sel ? '#2563eb' : '#e5e7eb') + ';background:' + bg + ';color:' + col + ';border-radius:6px;font-size:12px;cursor:pointer;font-weight:' + (sel ? '700' : '400') + ';">' + d + '</button>';
      }
      html += '</div>';
      document.getElementById('cal').innerHTML = html;
    }
    function renderOptRows() {
      var box = document.getElementById('opt-rows');
      if (!box) return;
      if (_optRows.length === 0) { box.innerHTML = '<div style="font-size:12px;color:#9ca3af;padding:6px 0;">候補がありません。カレンダーの日付をクリックするか「＋ 自由入力で行を追加」で追加してください。</div>'; return; }
      box.innerHTML = _optRows.map(function(v, i) {
        return '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">'
          + '<input type="text" value="' + escH(v) + '" maxlength="120" oninput="_optRows[' + i + ']=this.value" '
          + 'placeholder="例: 10/1(水) 15:00〜" style="flex:1;min-width:0;border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:13px;">'
          + '<button type="button" onclick="removeOptRow(' + i + ')" style="flex-shrink:0;border:1px solid #fca5a5;background:#fef2f2;color:#dc2626;border-radius:6px;padding:6px 10px;font-size:11px;cursor:pointer;">削除</button>'
          + '</div>';
      }).join('');
    }
    function addOptRow(v) { _optRows.push(v || ''); renderOptRows(); }
    function removeOptRow(i) { _optRows.splice(i, 1); renderOptRows(); renderCal(); }
    function collectOptions() { return _optRows.map(function(s) { return (s || '').trim(); }).filter(Boolean); }

    function resetForm() {
      document.getElementById('edit-id').value = '';
      ['f-title','f-desc','f-contact'].forEach(function(id) { document.getElementById(id).value = ''; });
      _optRows = [];
      (function() { var t = new Date(); _calY = t.getFullYear(); _calM = t.getMonth(); })();
      renderOptRows(); renderCal();
      document.getElementById('form-heading').textContent = '新しい調整を作成';
      document.getElementById('save-btn').textContent = '作成する';
      document.getElementById('cancel-edit-btn').style.display = 'none';
      document.getElementById('form-err').style.display = 'none';
    }
    function editEvent(ev) {
      document.getElementById('edit-id').value = ev.id;
      document.getElementById('f-title').value = ev.title;
      document.getElementById('f-desc').value = ev.description || '';
      document.getElementById('f-contact').value = ev.contact_name || '';
      _optRows = (ev.options || []).map(function(o) { return o.label; });
      renderOptRows(); renderCal();
      document.getElementById('form-heading').textContent = '調整を編集';
      document.getElementById('save-btn').textContent = '更新する';
      document.getElementById('cancel-edit-btn').style.display = 'inline-block';
      document.getElementById('form-heading').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    async function saveEvent() {
      var errEl = document.getElementById('form-err');
      errEl.style.display = 'none';
      var id = document.getElementById('edit-id').value;
      var options = collectOptions();
      var body = {
        title: document.getElementById('f-title').value.trim(),
        description: document.getElementById('f-desc').value.trim(),
        contact_name: document.getElementById('f-contact').value.trim(),
        options: options
      };
      if (!body.title) { errEl.textContent = 'タイトルは必須です'; errEl.style.display = 'block'; return; }
      if (options.length === 0) { errEl.textContent = '日程候補を1つ以上入力してください'; errEl.style.display = 'block'; return; }
      var btn = document.getElementById('save-btn');
      btn.disabled = true;
      try {
        var res = await fetch(id ? API + '/events/' + id : API + '/events', {
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
    async function toggleClose(ev) {
      var msg = ev.is_closed ? 'この調整の回答受付を再開しますか？' : 'この調整を受付終了にしますか？（回答ページで新規の回答ができなくなります）';
      if (!confirm(msg)) return;
      var res = await fetch(API + '/events/' + ev.id + '/close', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ is_closed: ev.is_closed ? 0 : 1 }) });
      if (res.ok) loadList(); else alert('変更に失敗しました');
    }
    async function deleteEvent(ev) {
      if (!confirm('「' + ev.title + '」を削除します。回答データもすべて削除されます。よろしいですか？')) return;
      var res = await fetch(API + '/events/' + ev.id, { method: 'DELETE' });
      if (res.ok) { closeSummary(); loadList(); } else alert('削除に失敗しました');
    }

    async function loadList() {
      var res = await fetch(API + '/events');
      var d = await res.json();
      var events = d.events || [];
      window._events = {};
      events.forEach(function(ev) { window._events[ev.id] = ev; });
      if (events.length === 0) { document.getElementById('list-body').innerHTML = '<div style="color:#9ca3af;">まだ調整が登録されていません</div>'; return; }
      var html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;min-width:720px;">'
        + '<thead><tr style="background:#f8fafc;">'
        + '<th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">状態</th>'
        + '<th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">タイトル</th>'
        + '<th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">候補</th>'
        + '<th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">回答</th>'
        + '<th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;">作成</th>'
        + '<th style="padding:7px 8px;text-align:left;border-bottom:2px solid #e5e7eb;"></th></tr></thead><tbody>'
        + events.map(function(ev) {
            var st = ev.is_closed
              ? { label: '受付終了', color: '#6b7280', bg: '#f3f4f6' }
              : { label: '受付中', color: '#166534', bg: '#f0fdf4' };
            var ops = '<button onclick="openSummary(window._events[' + ev.id + '])" style="padding:5px 10px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a5f;border-radius:6px;font-size:11px;cursor:pointer;margin-right:4px;">集計・共有URL</button>';
            if (EDITABLE) {
              ops += '<button onclick="editEvent(window._events[' + ev.id + '])" style="padding:5px 10px;background:#f9fafb;border:1px solid #d1d5db;color:#374151;border-radius:6px;font-size:11px;cursor:pointer;margin-right:4px;">編集</button>'
                + '<button onclick="toggleClose(window._events[' + ev.id + '])" style="padding:5px 10px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:6px;font-size:11px;cursor:pointer;margin-right:4px;">' + (ev.is_closed ? '受付再開' : '受付終了') + '</button>'
                + '<button onclick="deleteEvent(window._events[' + ev.id + '])" style="padding:5px 10px;background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;border-radius:6px;font-size:11px;cursor:pointer;">削除</button>';
            }
            return '<tr><td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;"><span style="display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;color:' + st.color + ';background:' + st.bg + ';">' + st.label + '</span></td>'
              + '<td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;font-weight:600;color:#1e3a5f;">' + escH(ev.title) + '</td>'
              + '<td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">' + (ev.options || []).length + '件</td>'
              + '<td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">' + (ev.response_count || 0) + '名</td>'
              + '<td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;color:#9ca3af;">' + escH((ev.created_at || '').slice(0, 10)) + (ev.created_by ? ' ' + escH(ev.created_by) : '') + '</td>'
              + '<td style="padding:7px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">' + ops + '</td></tr>';
          }).join('')
        + '</tbody></table></div>';
      document.getElementById('list-body').innerHTML = html;
    }

    var _summaryId = null;
    function closeSummary() { document.getElementById('summary-panel').style.display = 'none'; _summaryId = null; }
    function openSummary(ev) {
      _summaryId = ev.id;
      document.getElementById('summary-panel').style.display = 'block';
      document.getElementById('summary-heading').textContent = '集計 — ' + ev.title;
      document.getElementById('summary-body').innerHTML = '読み込み中...';
      document.getElementById('summary-share').innerHTML = '';
      document.getElementById('summary-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      loadSummary();
    }
    async function loadSummary() {
      if (_summaryId == null) return;
      var res = await fetch(API + '/events/' + _summaryId + '/summary');
      var d = await res.json().catch(function() { return {}; });
      if (!res.ok) { document.getElementById('summary-body').innerHTML = '<div style="color:#dc2626;">' + escH(d.error || '読み込みに失敗しました') + '</div>'; return; }
      var url = d.share_url || '';
      document.getElementById('summary-share').innerHTML =
        '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px;">'
        + '<div style="width:96px;height:96px;flex-shrink:0;">' + (d.qr_svg || '') + '</div>'
        + '<div style="flex:1;min-width:220px;">'
        + '<div style="font-size:12px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">この調整の共有URL（1本）</div>'
        + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
        + '<code style="background:white;border:1px solid #e5e7eb;border-radius:6px;padding:8px 10px;font-size:12px;word-break:break-all;flex:1;min-width:200px;">' + escH(url) + '</code>'
        + '<button onclick="copyText(\\'' + escH(url) + '\\')" style="padding:8px 14px;background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">コピー</button>'
        + '</div></div></div>';

      var options = d.options || [];
      var responses = d.responses || [];
      if (options.length === 0) { document.getElementById('summary-body').innerHTML = '<div style="color:#9ca3af;">候補がありません</div>'; return; }

      var tally = {};
      options.forEach(function(o) { tally[o.id] = { o: 0, t: 0, x: 0 }; });
      responses.forEach(function(r) {
        options.forEach(function(o) {
          var m = (r.answers && r.answers[o.id]) || 'x';
          tally[o.id][m] = (tally[o.id][m] || 0) + 1;
        });
      });
      var bestScore = -1;
      options.forEach(function(o) {
        var sc = tally[o.id].o * 2 + tally[o.id].t;
        if (responses.length > 0 && sc > bestScore) bestScore = sc;
      });

      var head = '<tr style="background:#f8fafc;"><th style="padding:6px 10px;text-align:left;border-bottom:2px solid #e5e7eb;position:sticky;left:0;background:#f8fafc;">回答者</th>';
      options.forEach(function(o) {
        var sc = tally[o.id].o * 2 + tally[o.id].t;
        var isBest = responses.length > 0 && sc === bestScore;
        head += '<th style="padding:6px 10px;text-align:center;border-bottom:2px solid #e5e7eb;white-space:nowrap;' + (isBest ? 'background:#ecfdf5;' : '') + '">' + escH(o.label) + '</th>';
      });
      head += '<th style="padding:6px 10px;text-align:left;border-bottom:2px solid #e5e7eb;">コメント</th></tr>';

      var bodyRows = responses.map(function(r) {
        var tds = '<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;font-weight:600;white-space:nowrap;position:sticky;left:0;background:white;">' + escH(r.name || r.emp_no) + '<span style="color:#9ca3af;font-weight:400;"> ' + escH(r.emp_no) + '</span></td>';
        options.forEach(function(o) {
          var m = (r.answers && r.answers[o.id]) || 'x';
          tds += '<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;text-align:center;font-weight:700;color:' + MARK_COLOR[m] + ';">' + MARK_LABEL[m] + '</td>';
        });
        tds += '<td style="padding:6px 10px;border-bottom:1px solid #f3f4f6;white-space:pre-wrap;color:#374151;">' + escH(r.comment || '') + '</td>';
        return '<tr>' + tds + '</tr>';
      }).join('');

      var tallyRow = '<td style="padding:6px 10px;border-top:2px solid #e5e7eb;font-weight:700;white-space:nowrap;position:sticky;left:0;background:white;">集計</td>';
      options.forEach(function(o) {
        var t = tally[o.id];
        var sc = t.o * 2 + t.t;
        var isBest = responses.length > 0 && sc === bestScore;
        tallyRow += '<td style="padding:6px 10px;border-top:2px solid #e5e7eb;text-align:center;white-space:nowrap;' + (isBest ? 'background:#ecfdf5;' : '') + '">'
          + '<span style="color:#166534;font-weight:700;">○' + t.o + '</span> '
          + '<span style="color:#b45309;">△' + t.t + '</span> '
          + '<span style="color:#9ca3af;">×' + t.x + '</span></td>';
      });
      tallyRow += '<td style="border-top:2px solid #e5e7eb;"></td>';

      var table = '<table style="border-collapse:collapse;font-size:13px;min-width:520px;"><thead>' + head + '</thead><tbody>'
        + (responses.length ? bodyRows : '<tr><td colspan="' + (options.length + 2) + '" style="padding:10px;color:#9ca3af;">まだ回答がありません</td></tr>')
        + '<tr>' + tallyRow + '</tr></tbody></table>';
      document.getElementById('summary-body').innerHTML = table;
    }

    loadList();
    if (EDITABLE) { renderOptRows(); renderCal(); }
    </script>`;
  return c.html(layout('調整', html, 'settings'));
});

// ===== API =====
async function loadEventWithOptions(env: Env, id: number) {
  const ev = await env.DB.prepare('SELECT * FROM chosei_events WHERE id = ?').bind(id).first<EventRow>();
  if (!ev) return null;
  const opts = await env.DB.prepare('SELECT id, label, sort_order FROM chosei_options WHERE event_id = ? ORDER BY sort_order, id').bind(id).all();
  return { ...ev, options: opts.results ?? [] };
}

app.get('/api/chosei/events', async (c) => {
  const rows = await c.env.DB.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM chosei_responses r WHERE r.event_id = e.id) AS response_count
    FROM chosei_events e ORDER BY e.is_closed, e.created_at DESC
  `).all<EventRow & { response_count: number }>();
  const events = [];
  for (const e of (rows.results ?? [])) {
    const opts = await c.env.DB.prepare('SELECT id, label, sort_order FROM chosei_options WHERE event_id = ? ORDER BY sort_order, id').bind(e.id).all();
    events.push({ ...e, options: opts.results ?? [] });
  }
  return c.json({ events });
});

app.post('/api/chosei/events', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: 'この操作を行う権限がありません' }, 403);
  const b = await c.req.json<{ title?: string; description?: string; contact_name?: string; options?: string[] }>();
  const title = S(b.title, 80);
  if (!title) return c.json({ error: 'タイトルは必須です' }, 400);
  const options = (Array.isArray(b.options) ? b.options : []).map(s => S(s, 120)).filter(Boolean).slice(0, 60);
  if (options.length === 0) return c.json({ error: '日程候補を1つ以上入力してください' }, 400);
  const token = newToken();
  const who = await adminName(c.env, c.get('adminId'));
  const ins = await c.env.DB.prepare(
    'INSERT INTO chosei_events (token, title, description, contact_name, created_by) VALUES (?, ?, ?, ?, ?)'
  ).bind(token, title, S(b.description, 500), S(b.contact_name, 40), who).run();
  const eventId = ins.meta.last_row_id as number;
  for (let i = 0; i < options.length; i++) {
    await c.env.DB.prepare('INSERT INTO chosei_options (event_id, label, sort_order) VALUES (?, ?, ?)').bind(eventId, options[i], i).run();
  }
  return c.json({ ok: true, id: eventId, token });
});

app.put('/api/chosei/events/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: 'この操作を行う権限がありません' }, 403);
  const id = parseInt(c.req.param('id'), 10);
  const existing = await loadEventWithOptions(c.env, id);
  if (!existing) return c.json({ error: '対象が見つかりません' }, 404);
  const b = await c.req.json<{ title?: string; description?: string; contact_name?: string; options?: string[] }>();
  const title = S(b.title, 80);
  if (!title) return c.json({ error: 'タイトルは必須です' }, 400);
  const newLabels = (Array.isArray(b.options) ? b.options : []).map(s => S(s, 120)).filter(Boolean).slice(0, 60);
  if (newLabels.length === 0) return c.json({ error: '日程候補を1つ以上入力してください' }, 400);

  await c.env.DB.prepare(
    "UPDATE chosei_events SET title = ?, description = ?, contact_name = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  ).bind(title, S(b.description, 500), S(b.contact_name, 40), id).run();

  // 候補の突き合わせ: 既存ラベルと一致するものは残す（id・回答を維持）、余った既存は削除、足りない分は追加
  const oldOpts = existing.options as Array<{ id: number; label: string }>;
  const remaining = [...oldOpts];
  const keepIds = new Set<number>();
  for (let i = 0; i < newLabels.length; i++) {
    const label = newLabels[i];
    const matchIdx = remaining.findIndex(o => o.label === label);
    if (matchIdx >= 0) {
      const matched = remaining.splice(matchIdx, 1)[0];
      keepIds.add(matched.id);
      await c.env.DB.prepare('UPDATE chosei_options SET sort_order = ? WHERE id = ?').bind(i, matched.id).run();
    } else {
      await c.env.DB.prepare('INSERT INTO chosei_options (event_id, label, sort_order) VALUES (?, ?, ?)').bind(id, label, i).run();
    }
  }
  for (const dead of oldOpts) {
    if (!keepIds.has(dead.id)) {
      await c.env.DB.prepare('DELETE FROM chosei_answers WHERE option_id = ?').bind(dead.id).run();
      await c.env.DB.prepare('DELETE FROM chosei_options WHERE id = ?').bind(dead.id).run();
    }
  }
  return c.json({ ok: true });
});

app.post('/api/chosei/events/:id/close', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: 'この操作を行う権限がありません' }, 403);
  const id = parseInt(c.req.param('id'), 10);
  const b = await c.req.json<{ is_closed?: number }>();
  const val = b.is_closed ? 1 : 0;
  const r = await c.env.DB.prepare(
    "UPDATE chosei_events SET is_closed = ?, updated_at = datetime('now','localtime') WHERE id = ?"
  ).bind(val, id).run();
  if (!r.meta.changes) return c.json({ error: '対象が見つかりません' }, 404);
  return c.json({ ok: true });
});

app.delete('/api/chosei/events/:id', async (c) => {
  if (!(await canEdit(c))) return c.json({ error: 'この操作を行う権限がありません' }, 403);
  const id = parseInt(c.req.param('id'), 10);
  await c.env.DB.prepare(
    'DELETE FROM chosei_answers WHERE response_id IN (SELECT id FROM chosei_responses WHERE event_id = ?)'
  ).bind(id).run();
  await c.env.DB.prepare('DELETE FROM chosei_responses WHERE event_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM chosei_options WHERE event_id = ?').bind(id).run();
  const r = await c.env.DB.prepare('DELETE FROM chosei_events WHERE id = ?').bind(id).run();
  if (!r.meta.changes) return c.json({ error: '対象が見つかりません' }, 404);
  return c.json({ ok: true });
});

app.get('/api/chosei/events/:id/summary', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  const ev = await loadEventWithOptions(c.env, id);
  if (!ev) return c.json({ error: '対象が見つかりません' }, 404);
  const respRows = await c.env.DB.prepare(
    'SELECT id, emp_no, name, comment, created_at FROM chosei_responses WHERE event_id = ? ORDER BY created_at, id'
  ).bind(id).all<{ id: number; emp_no: string; name: string; comment: string; created_at: string }>();
  const responses = [];
  for (const r of (respRows.results ?? [])) {
    const ans = await c.env.DB.prepare('SELECT option_id, mark FROM chosei_answers WHERE response_id = ?').bind(r.id).all<{ option_id: number; mark: string }>();
    const answers: Record<string, string> = {};
    for (const a of (ans.results ?? [])) answers[String(a.option_id)] = a.mark;
    responses.push({ emp_no: r.emp_no, name: r.name, comment: r.comment, created_at: r.created_at, answers });
  }
  return c.json({
    event: { id: ev.id, title: ev.title, is_closed: ev.is_closed },
    options: ev.options,
    responses,
    share_url: shareUrl(ev.token),
    qr_svg: tokenToQrSvg(shareUrl(ev.token))
  });
});

export default app;
