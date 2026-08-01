// フローティング＋ボタンから、どのページからでも遷移せずに報告を入力できるモーダル
// （設定 → 報告センターの各タブに実装済みの新規登録フォームと同じAPIに投稿する。
//  ページ遷移せず「その場で」入力できることが目的のため、フォーム自体は
// 報告センター側の実装（admin_liff.ts）とは独立した専用マークアップを持つ）

import { ADMIN_PATH } from '../config';

export function quickReportModalHtml(): string {
  return `
  <div id="qr-modal" style="display:none;position:fixed;inset:0;z-index:1002;padding:16px;" onclick="if(event.target===this)closeQrModal()">
    <div id="qr-panel" style="background:white;border-radius:12px;padding:20px;width:100%;max-width:480px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div id="qr-drag-handle" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 id="qr-title" style="font-size:15px;font-weight:700;color:#1e3a5f;margin:0;"></h3>
        <button type="button" id="qr-close-btn" onclick="closeQrModal()" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
      </div>
      <div id="qr-error" style="display:none;background:#fee2e2;color:#991b1b;border-radius:6px;padding:8px 10px;font-size:12px;margin-bottom:10px;"></div>
      <div id="qr-success" style="display:none;background:#dcfce7;color:#166534;border-radius:6px;padding:8px 10px;font-size:12px;margin-bottom:10px;font-weight:600;">登録しました</div>
      <form id="qr-form" onsubmit="event.preventDefault();qrSubmit();">
        <div class="qr-row2 qr-field">
          <div>
            <label>受電時刻</label>
            <div style="display:flex;gap:6px;">
              <input type="time" id="qr-received_at" style="flex:1;min-width:0;">
              <button type="button" onclick="qrSetNow('qr-received_at')" style="flex-shrink:0;padding:0 10px;background:#eff6ff;color:#1e3a5f;border:1px solid #bfdbfe;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;">現在時刻</button>
            </div>
          </div>
          <div><label>車番</label><input type="text" id="qr-vehicle_no" placeholder="例: 5232" inputmode="numeric"></div>
        </div>
        <div class="qr-field">
          <label>乗務員（あれば）</label>
          <div class="qr-emp-wrap">
            <input type="text" id="qr-emp-search" placeholder="氏名・社員番号で検索" autocomplete="off" oninput="qrEmpSearchDebounce()">
            <div class="qr-emp-suggestions" id="qr-emp-suggestions"></div>
          </div>
          <div class="qr-emp-selected" id="qr-emp-selected" style="display:none;"></div>
        </div>
        <div class="qr-row2 qr-field">
          <div><label>課</label><input type="text" id="qr-employee_division" readonly style="background:#f3f4f6;color:#6b7280;"></div>
          <div><label>班</label><input type="text" id="qr-employee_team" readonly style="background:#f3f4f6;color:#6b7280;"></div>
        </div>

        <!-- 忘れ物報告 -->
        <div id="qr-group-lost" class="qr-group" style="display:none;">
          <div class="qr-field">
            <label>種別</label>
            <div class="qr-toggle-group">
              <button type="button" class="qr-toggle-btn active" id="qr-l-type-staff" onclick="qrSetLostType('staff')">社員からの報告</button>
              <button type="button" class="qr-toggle-btn" id="qr-l-type-customer" onclick="qrSetLostType('customer')">客からの問い合わせ</button>
            </div>
          </div>
          <div class="qr-field"><label>忘れ物の内容</label><textarea id="qr-l-item_description" placeholder="例: 黒い財布、iPhone"></textarea></div>
          <div class="qr-row2 qr-field">
            <div><label>乗車地</label><input type="text" id="qr-l-pickup_location" placeholder="例: 板橋駅"></div>
            <div><label>降車地</label><input type="text" id="qr-l-dropoff_location" placeholder="例: 池袋駅"></div>
          </div>
          <div id="qr-l-customer-section" style="display:none;">
            <div class="qr-row2 qr-field">
              <div><label>お客様氏名</label><input type="text" id="qr-l-customer_name" placeholder="田中 一郎"></div>
              <div><label>お客様電話番号</label><input type="tel" id="qr-l-customer_phone" placeholder="090-0000-0000"></div>
            </div>
            <div class="qr-field">
              <label>返却方法</label>
              <div class="qr-toggle-group">
                <button type="button" class="qr-toggle-btn" id="qr-l-return-cod" onclick="qrSetReturnMethod('着払い')">着払い</button>
                <button type="button" class="qr-toggle-btn" id="qr-l-return-pickup" onclick="qrSetReturnMethod('来社受け取り')">来社受け取り</button>
              </div>
            </div>
          </div>
          <div class="qr-field"><label>備考</label><textarea id="qr-l-notes" placeholder="その他、特記事項があれば"></textarea></div>
        </div>

        <!-- 事故報告 -->
        <div id="qr-group-accident" class="qr-group" style="display:none;">
          <div class="qr-field">
            <label>乗車状態</label>
            <div class="qr-toggle-group">
              <button type="button" class="qr-toggle-btn" id="qr-a-cs-kusha" onclick="qrSetAccidentCarStatus('空車')">空車</button>
              <button type="button" class="qr-toggle-btn" id="qr-a-cs-jissha" onclick="qrSetAccidentCarStatus('実車')">実車</button>
              <button type="button" class="qr-toggle-btn" id="qr-a-cs-geisha" onclick="qrSetAccidentCarStatus('迎車')">迎車</button>
            </div>
          </div>
          <div class="qr-field"><label>事故形態</label><input type="text" id="qr-a-accident_type" placeholder="例: 単独接触事故、追突事故"></div>
          <div class="qr-field"><label>事故発生場所</label><input type="text" id="qr-a-location" placeholder="例: 足立区栗原3丁目の住宅街"></div>
          <div id="qr-a-passenger-check" class="qr-check-row" style="display:none;">
            <input type="checkbox" id="qr-a-passenger_delivered"><label for="qr-a-passenger_delivered">乗客を目的地まで送り届けた</label>
          </div>
          <div class="qr-check-row"><input type="checkbox" id="qr-a-substitute_requested"><label for="qr-a-substitute_requested">代車要請は済んでいる</label></div>
          <div class="qr-check-row"><input type="checkbox" id="qr-a-police_notified"><label for="qr-a-police_notified">警察対応するよう指示した</label></div>
          <div class="qr-field"><label>追加情報・メモ</label><textarea id="qr-a-additional_info" placeholder="経緯・詳細など"></textarea></div>
        </div>

        <!-- 違反報告 -->
        <div id="qr-group-violation" class="qr-group" style="display:none;">
          <div class="qr-row2 qr-field">
            <div><label>違反発生日</label><input type="date" id="qr-v-date"></div>
            <div><label>違反発生時刻</label><input type="time" id="qr-v-time"></div>
          </div>
          <div class="qr-field">
            <label>違反の種類</label>
            <select id="qr-v-violation_type_id"><option value="">選択してください</option></select>
          </div>
          <div class="qr-field"><label>住所（違反発生場所）</label><input type="text" id="qr-v-location" placeholder="例: 板橋区大山東町51-1 付近"></div>
          <div class="qr-row2 qr-field">
            <div><label>どこから</label><input type="text" id="qr-v-travel_from" placeholder="例: 池袋駅"></div>
            <div><label>どこへ進行中</label><input type="text" id="qr-v-travel_to" placeholder="例: 成増方面"></div>
          </div>
          <div class="qr-field">
            <label>乗車状態</label>
            <div class="qr-toggle-group">
              <button type="button" class="qr-toggle-btn" id="qr-v-cs-kusha" onclick="qrSetViolationCarStatus('空車')">空車</button>
              <button type="button" class="qr-toggle-btn" id="qr-v-cs-jissha" onclick="qrSetViolationCarStatus('実車')">実車</button>
              <button type="button" class="qr-toggle-btn" id="qr-v-cs-geisha" onclick="qrSetViolationCarStatus('迎車')">迎車</button>
            </div>
            <div id="qr-v-substitute-row" class="qr-check-row" style="display:none;">
              <input type="checkbox" id="qr-v-substitute_needed"><label for="qr-v-substitute_needed">代車要請が必要</label>
            </div>
          </div>
          <div class="qr-field"><label>備考</label><textarea id="qr-v-notes" placeholder="その他、特記事項があれば"></textarea></div>
        </div>

        <!-- 一般報告 -->
        <div id="qr-group-general" class="qr-group" style="display:none;">
          <div class="qr-field">
            <label>タイトル（あれば）</label>
            <input type="text" id="qr-g-title" list="qr-g-title-suggestions" placeholder="例: 社内汚損">
            <datalist id="qr-g-title-suggestions">
              <option value="社内汚損"><option value="車両トラブル"><option value="苦情対応">
              <option value="遅延"><option value="お客様からの着電"><option value="その他連絡">
            </datalist>
          </div>
          <div class="qr-field"><label>住所（あれば）</label><input type="text" id="qr-g-location" placeholder="例: 板橋区大山東町51-1 付近"></div>
          <div class="qr-row2 qr-field">
            <div><label>お客様名（着電があれば）</label><input type="text" id="qr-g-customer_name" placeholder="例: 田中 一郎"></div>
            <div><label>電話番号</label><input type="tel" id="qr-g-customer_phone" placeholder="090-0000-0000"></div>
          </div>
          <div class="qr-row2 qr-field">
            <div><label>出発地（あれば）</label><input type="text" id="qr-g-route_from" placeholder="例: 板橋営業所"></div>
            <div><label>到着地</label><input type="text" id="qr-g-route_to" placeholder="例: 東京駅"></div>
          </div>
          <div class="qr-field"><label>報告内容</label><textarea id="qr-g-content" placeholder="報告したい内容を自由に入力してください"></textarea></div>
        </div>

        <button type="submit" id="qr-submit-btn" style="width:100%;margin-top:16px;padding:12px;background:#1e3a5f;color:white;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">登録する</button>
      </form>
    </div>
  </div>
  <div id="qr-toast" style="display:none;position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1e3a5f;color:white;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 8px 24px rgba(0,0,0,0.25);z-index:1100;"></div>
  <style>
    #qr-modal .qr-field { margin-bottom: 12px; }
    #qr-modal label { display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 600; }
    #qr-modal input[type=text], #qr-modal input[type=tel], #qr-modal input[type=time], #qr-modal input[type=date],
    #qr-modal textarea, #qr-modal select {
      width: 100%; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 10px;
      font-size: 14px; font-family: inherit; background: #f9fafb; color: #111827; box-sizing: border-box;
    }
    #qr-modal textarea { resize: vertical; min-height: 70px; }
    #qr-modal .qr-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    #qr-modal .qr-emp-wrap { position: relative; }
    #qr-modal .qr-emp-suggestions { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #d1d5db; border-radius: 6px; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.12); max-height: 180px; overflow-y: auto; margin-top: 2px; display: none; }
    #qr-modal .qr-emp-item { padding: 8px 10px; font-size: 13px; cursor: pointer; border-bottom: 1px solid #f3f4f6; }
    #qr-modal .qr-emp-item:last-child { border-bottom: none; }
    #qr-modal .qr-emp-item:hover { background: #eff6ff; }
    #qr-modal .qr-emp-meta { font-size: 11px; color: #6b7280; margin-top: 2px; }
    #qr-modal .qr-emp-selected { font-size: 12px; color: #059669; margin-top: 4px; font-weight: 600; }
    #qr-modal .qr-toggle-group { display: flex; gap: 8px; flex-wrap: wrap; }
    #qr-modal .qr-toggle-btn { padding: 6px 14px; border: 2px solid #d1d5db; border-radius: 6px; background: white; color: #374151; font-size: 13px; font-weight: 600; cursor: pointer; }
    #qr-modal .qr-toggle-btn.active { border-color: #1e3a5f; background: #eff6ff; color: #1e3a5f; }
    #qr-modal .qr-check-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
    #qr-modal .qr-check-row label { margin: 0; font-weight: 400; cursor: pointer; }
    #qr-modal { background: rgba(0,0,0,0.5); align-items: center; justify-content: center; }
    @media (min-width: 769px) {
      /* PCでは、開いたまま背後の画面（引き継ぎシート等）も操作できるフローティングパネルにする */
      #qr-modal.qr-floating { background: transparent; pointer-events: none; align-items: flex-start; justify-content: center; }
      #qr-modal.qr-floating #qr-panel { pointer-events: auto; margin-top: 80px; }
      #qr-drag-handle { cursor: move; user-select: none; }
    }
  </style>`;
}

// フローティング＋ボタンのメニュー項目から呼ぶ（type: lost / accident / violation / general）
export function quickReportModalScript(): string {
  return `
  var QR_ADMIN_PATH = ${JSON.stringify(ADMIN_PATH)};
  var qrActiveType = null;
  var qrSelectedEmp = null;
  var qrEmpSearchTimer = null;
  var qrViolationTypesLoaded = false;

  var QR_CONFIG = {
    lost:      { title: '忘れ物報告の新規登録', group: 'qr-group-lost',      empSearch: '/api/liff/lost-items/employee-search',        postPath: '/api/liff/lost-items',        listPath: '/settings/lost-items',      label: '忘れ物報告' },
    accident:  { title: '事故報告の新規登録',   group: 'qr-group-accident',  empSearch: '/api/liff/accident-reports/employee-search',  postPath: '/api/liff/accident-reports',  listPath: '/settings/accidents',       label: '事故報告' },
    violation: { title: '違反報告の新規登録',   group: 'qr-group-violation', empSearch: '/api/liff/violation-reports/employee-search', postPath: '/api/liff/violation-reports', listPath: '/settings/violations',      label: '違反報告' },
    general:   { title: '一般報告の新規登録',   group: 'qr-group-general',   empSearch: '/api/liff/general-reports/employee-search',   postPath: '/api/liff/general-reports',   listPath: '/settings/general-reports', label: '一般報告' },
  };

  function openQrModal(type) {
    var cfg = QR_CONFIG[type];
    if (!cfg) return;
    var menu = document.getElementById('report-fab-menu');
    if (menu) menu.style.display = 'none';
    qrActiveType = type;
    qrSelectedEmp = null;
    document.getElementById('qr-form').reset();
    document.getElementById('qr-error').style.display = 'none';
    document.getElementById('qr-success').style.display = 'none';
    document.getElementById('qr-title').textContent = cfg.title;
    document.querySelectorAll('#qr-modal .qr-group').forEach(function(el) { el.style.display = 'none'; });
    document.getElementById(cfg.group).style.display = 'block';
    var sel = document.getElementById('qr-emp-selected');
    sel.style.display = 'none'; sel.textContent = '';
    document.getElementById('qr-employee_division').value = '';
    document.getElementById('qr-employee_team').value = '';
    qrResetType(type);
    var modalEl = document.getElementById('qr-modal');
    modalEl.style.display = 'flex';
    modalEl.classList.remove('qr-floating');
    if (window.matchMedia('(min-width: 769px)').matches) {
      modalEl.classList.add('qr-floating');
    }
  }
  function closeQrModal() {
    document.getElementById('qr-modal').style.display = 'none';
    document.getElementById('qr-modal').classList.remove('qr-floating');
    var panel = document.getElementById('qr-panel');
    panel.style.position = '';
    panel.style.left = '';
    panel.style.top = '';
    panel.style.margin = '';
  }

  // PCのフローティングモード時のみ、ヘッダーをつかんでパネルを自由に移動できる（閉じたら位置はリセット）
  (function () {
    var dragTarget = null, startX = 0, startY = 0, startLeft = 0, startTop = 0;
    document.addEventListener('mousedown', function (e) {
      if (!document.getElementById('qr-modal').classList.contains('qr-floating')) return;
      if (e.target.closest('#qr-close-btn')) return;
      var handle = e.target.closest('#qr-drag-handle');
      if (!handle) return;
      var panel = document.getElementById('qr-panel');
      var rect = panel.getBoundingClientRect();
      dragTarget = panel;
      startX = e.clientX; startY = e.clientY;
      startLeft = rect.left; startTop = rect.top;
      panel.style.position = 'fixed';
      panel.style.margin = '0';
      panel.style.left = startLeft + 'px';
      panel.style.top = startTop + 'px';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!dragTarget) return;
      var dx = e.clientX - startX, dy = e.clientY - startY;
      var maxLeft = window.innerWidth - 60, maxTop = window.innerHeight - 40;
      var newLeft = Math.min(Math.max(startLeft + dx, -(dragTarget.offsetWidth - 60)), maxLeft);
      var newTop = Math.min(Math.max(startTop + dy, 0), maxTop);
      dragTarget.style.left = newLeft + 'px';
      dragTarget.style.top = newTop + 'px';
    });
    document.addEventListener('mouseup', function () {
      dragTarget = null;
      document.body.style.userSelect = '';
    });
  })();

  function qrShowError(msg) {
    var box = document.getElementById('qr-error');
    box.textContent = msg;
    box.style.display = 'block';
  }
  function qrSetNow(inputId) {
    var el = document.getElementById(inputId);
    if (!el) return;
    var now = new Date();
    var hh = String(now.getHours()).padStart(2, '0');
    var mm = String(now.getMinutes()).padStart(2, '0');
    el.value = hh + ':' + mm;
  }
  function qrShowToast(msg) {
    var t = document.getElementById('qr-toast');
    if (!t) return;
    t.textContent = msg;
    t.style.display = 'block';
    clearTimeout(t._hideTimer);
    t._hideTimer = setTimeout(function() { t.style.display = 'none'; }, 3000);
  }

  function qrResetType(type) {
    if (type === 'lost') {
      qrSetLostType('staff');
    } else if (type === 'accident') {
      qrSetAccidentCarStatus('');
    } else if (type === 'violation') {
      qrSetViolationCarStatus('');
      if (!qrViolationTypesLoaded) {
        qrViolationTypesLoaded = true;
        fetch(QR_ADMIN_PATH + '/api/liff/violation-reports/violation-types').then(function(r){return r.json();}).then(function(data){
          var sel = document.getElementById('qr-v-violation_type_id');
          (data || []).forEach(function(vt) {
            var opt = document.createElement('option');
            opt.value = vt.id; opt.textContent = vt.name;
            sel.appendChild(opt);
          });
        });
      }
      var now = new Date();
      var yyyy = now.getFullYear();
      var mo = String(now.getMonth() + 1).padStart(2, '0');
      var dd = String(now.getDate()).padStart(2, '0');
      document.getElementById('qr-v-date').value = yyyy + '-' + mo + '-' + dd;
    }
  }

  function qrSetLostType(t) {
    document.getElementById('qr-l-type-staff').className = 'qr-toggle-btn' + (t === 'staff' ? ' active' : '');
    document.getElementById('qr-l-type-customer').className = 'qr-toggle-btn' + (t === 'customer' ? ' active' : '');
    document.getElementById('qr-l-customer-section').style.display = t === 'customer' ? 'block' : 'none';
    qrLostType = t;
  }
  var qrLostType = 'staff';
  var qrReturnMethod = '';
  function qrSetReturnMethod(m) {
    qrReturnMethod = m;
    document.getElementById('qr-l-return-cod').className = 'qr-toggle-btn' + (m === '着払い' ? ' active' : '');
    document.getElementById('qr-l-return-pickup').className = 'qr-toggle-btn' + (m === '来社受け取り' ? ' active' : '');
  }

  var qrAccidentCarStatus = '';
  function qrSetAccidentCarStatus(s) {
    qrAccidentCarStatus = s;
    ['kusha','jissha','geisha'].forEach(function(id) { document.getElementById('qr-a-cs-' + id).className = 'qr-toggle-btn'; });
    var map = { '空車': 'kusha', '実車': 'jissha', '迎車': 'geisha' };
    if (map[s]) document.getElementById('qr-a-cs-' + map[s]).className = 'qr-toggle-btn active';
    document.getElementById('qr-a-passenger-check').style.display = (s === '実車' || s === '迎車') ? 'flex' : 'none';
  }

  var qrViolationCarStatus = '';
  function qrSetViolationCarStatus(s) {
    qrViolationCarStatus = s;
    ['kusha','jissha','geisha'].forEach(function(id) { document.getElementById('qr-v-cs-' + id).className = 'qr-toggle-btn'; });
    var map = { '空車': 'kusha', '実車': 'jissha', '迎車': 'geisha' };
    if (map[s]) document.getElementById('qr-v-cs-' + map[s]).className = 'qr-toggle-btn active';
    var row = document.getElementById('qr-v-substitute-row');
    if (s === '実車' || s === '迎車') { row.style.display = 'flex'; }
    else { row.style.display = 'none'; document.getElementById('qr-v-substitute_needed').checked = false; }
  }

  function qrEmpSearchDebounce() {
    clearTimeout(qrEmpSearchTimer);
    qrEmpSearchTimer = setTimeout(qrDoEmpSearch, 300);
  }
  function qrDoEmpSearch() {
    var q = document.getElementById('qr-emp-search').value.trim();
    var sug = document.getElementById('qr-emp-suggestions');
    if (q.length < 1 || !qrActiveType) { sug.style.display = 'none'; return; }
    var path = QR_CONFIG[qrActiveType].empSearch;
    fetch(QR_ADMIN_PATH + path + '?q=' + encodeURIComponent(q))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var list = (data && data.results) || [];
        if (!list.length) { sug.style.display = 'none'; return; }
        sug.innerHTML = list.map(function(e) {
          var div = e.division ? e.division + '課' : '';
          var team = e.team ? e.team + '班' : '';
          return '<div class="qr-emp-item" onclick="qrSelectEmp(' + JSON.stringify(e).replace(/</g,'\\\\u003c').replace(/"/g,'&quot;') + ')">'
            + '<div>' + e.name + '</div><div class="qr-emp-meta">' + div + team + ' / ' + e.emp_no + '</div></div>';
        }).join('');
        sug.style.display = 'block';
      })
      .catch(function() { sug.style.display = 'none'; });
  }
  function qrSelectEmp(e) {
    qrSelectedEmp = e;
    document.getElementById('qr-emp-search').value = '';
    document.getElementById('qr-emp-suggestions').style.display = 'none';
    var div = e.division ? e.division + '課' : '';
    var team = e.team ? e.team + '班' : '';
    var sel = document.getElementById('qr-emp-selected');
    sel.style.display = 'block';
    sel.textContent = '選択中: ' + e.name + '（' + div + team + ' / ' + e.emp_no + '）';
    document.getElementById('qr-employee_division').value = e.division || '';
    document.getElementById('qr-employee_team').value = e.team || '';
  }
  document.addEventListener('click', function(e) {
    var sug = document.getElementById('qr-emp-suggestions');
    var input = document.getElementById('qr-emp-search');
    if (sug && input && !input.contains(e.target) && !sug.contains(e.target)) sug.style.display = 'none';
  });

  function qrBuildPayload() {
    var receivedAt = document.getElementById('qr-received_at').value || null;
    var vehicleNo = document.getElementById('qr-vehicle_no').value.trim() || null;
    var empName = qrSelectedEmp ? qrSelectedEmp.name : null;
    var empNo = qrSelectedEmp ? qrSelectedEmp.emp_no : null;
    var empDivision = qrSelectedEmp ? qrSelectedEmp.division : null;
    var empTeam = qrSelectedEmp ? qrSelectedEmp.team : null;

    if (qrActiveType === 'lost') {
      return {
        report_type: qrLostType,
        received_at: receivedAt, vehicle_no: vehicleNo,
        employee_name: empName, employee_emp_no: empNo, employee_division: empDivision, employee_team: empTeam,
        item_description: document.getElementById('qr-l-item_description').value.trim() || null,
        pickup_location: document.getElementById('qr-l-pickup_location').value.trim() || null,
        dropoff_location: document.getElementById('qr-l-dropoff_location').value.trim() || null,
        customer_name: document.getElementById('qr-l-customer_name').value.trim() || null,
        customer_phone: document.getElementById('qr-l-customer_phone').value.trim() || null,
        return_method: qrReturnMethod || null,
        notes: document.getElementById('qr-l-notes').value.trim() || null,
      };
    }
    if (qrActiveType === 'accident') {
      return {
        received_at: receivedAt, vehicle_no: vehicleNo,
        employee_name: empName, employee_emp_no: empNo, employee_division: empDivision, employee_team: empTeam,
        accident_type: document.getElementById('qr-a-accident_type').value.trim() || null,
        location: document.getElementById('qr-a-location').value.trim() || null,
        car_status: qrAccidentCarStatus || null,
        substitute_requested: document.getElementById('qr-a-substitute_requested').checked,
        police_notified: document.getElementById('qr-a-police_notified').checked,
        passenger_delivered: document.getElementById('qr-a-passenger_delivered').checked,
        additional_info: document.getElementById('qr-a-additional_info').value.trim() || null,
      };
    }
    if (qrActiveType === 'violation') {
      var vDate = document.getElementById('qr-v-date').value;
      var vTime = document.getElementById('qr-v-time').value;
      var violationAt = vDate ? (vDate + (vTime ? ' ' + vTime : '')) : null;
      return {
        received_at: receivedAt, vehicle_no: vehicleNo, violation_at: violationAt,
        employee_name: empName, employee_emp_no: empNo, employee_division: empDivision, employee_team: empTeam,
        violation_type_id: document.getElementById('qr-v-violation_type_id').value || null,
        location: document.getElementById('qr-v-location').value.trim() || null,
        travel_from: document.getElementById('qr-v-travel_from').value.trim() || null,
        travel_to: document.getElementById('qr-v-travel_to').value.trim() || null,
        car_status: qrViolationCarStatus || null,
        substitute_needed: document.getElementById('qr-v-substitute_needed').checked,
        notes: document.getElementById('qr-v-notes').value.trim() || null,
      };
    }
    // general
    return {
      title: document.getElementById('qr-g-title').value.trim() || null,
      received_at: receivedAt, vehicle_no: vehicleNo,
      location: document.getElementById('qr-g-location').value.trim() || null,
      route_from: document.getElementById('qr-g-route_from').value.trim() || null,
      route_to: document.getElementById('qr-g-route_to').value.trim() || null,
      employee_name: empName, employee_emp_no: empNo, employee_division: empDivision, employee_team: empTeam,
      customer_name: document.getElementById('qr-g-customer_name').value.trim() || null,
      customer_phone: document.getElementById('qr-g-customer_phone').value.trim() || null,
      content: document.getElementById('qr-g-content').value.trim() || null,
    };
  }

  function qrSubmit() {
    if (!qrActiveType) return;
    var cfg = QR_CONFIG[qrActiveType];
    var btn = document.getElementById('qr-submit-btn');
    btn.disabled = true;
    document.getElementById('qr-error').style.display = 'none';
    fetch(QR_ADMIN_PATH + cfg.postPath, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(qrBuildPayload()),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      btn.disabled = false;
      if (data.ok) {
        document.getElementById('qr-success').style.display = 'block';
        setTimeout(function() {
          closeQrModal();
          if (location.pathname.indexOf(cfg.listPath) !== -1) {
            location.reload();
          } else {
            qrShowToast(cfg.label + 'を登録しました');
          }
        }, 700);
      } else {
        qrShowError(data.error || '登録に失敗しました');
      }
    })
    .catch(function() { btn.disabled = false; qrShowError('通信エラーが発生しました'); });
  }
  `;
}
