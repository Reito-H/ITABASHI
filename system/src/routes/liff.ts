// LINE LIFF ページ & LIFF専用API
// /liff/* : LIFFアプリのHTMLページ（認証不要・LIFF SDKで識別）
// /api/liff/* : LIFFから呼ばれるAPI（LIFFアクセストークンをLINE APIで検証）

import { Hono } from 'hono';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env }>();

// LIFFアクセストークンをLINEサーバーで検証してユーザーIDを返す
async function verifyLiffToken(accessToken: string): Promise<string | null> {
  if (!accessToken) return null;
  const res = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json<{ userId?: string }>();
  return data.userId ?? null;
}

// リクエストヘッダーからBearerトークンを取り出してUID検証
async function uidFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return verifyLiffToken(token);
}

// LINE push メッセージ送信
async function pushMessage(to: string, accessToken: string, text: string): Promise<void> {
  await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  });
}

// ===== LIFF: 忘れ物対応フォーム =====
app.get('/liff/lost-item', (c) => {
  const liffId = c.env.LIFF_ID_LOST_ITEM ?? '';
  const html = liffLostItemPage(liffId);
  return c.html(html);
});

// ===== LIFF: 事故報告フォーム =====
app.get('/liff/accident', (c) => {
  const liffId = c.env.LIFF_ID_ACCIDENT ?? '';
  const html = liffAccidentPage(liffId);
  return c.html(html);
});

// ===== LIFF API: 社員検索 =====
app.get('/api/liff/employees', async (c) => {
  const uid = await uidFromRequest(c.req.raw);
  if (!uid) return c.json({ error: 'unauthorized' }, 401);

  const liffUser = await c.env.DB.prepare(
    'SELECT role FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string }>();
  if (!liffUser || !['general_manager', 'operations_manager'].includes(liffUser.role)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const q = (c.req.query('q') ?? '').trim();
  if (q.length < 1) return c.json([]);

  const like = `%${q}%`;
  const rows = await c.env.DB.prepare(`
    SELECT id, emp_no, name, division, team
    FROM employees
    WHERE is_active = 1 AND status = 'completed'
      AND (name LIKE ? OR name_kana LIKE ? OR emp_no LIKE ?)
    ORDER BY division, team, seq_no, id
    LIMIT 20
  `).bind(like, like, like).all<{ id: number; emp_no: string; name: string; division: number | null; team: number | null }>();

  return c.json(rows.results ?? []);
});

// ===== LIFF API: 忘れ物報告 送信 =====
app.post('/api/liff/lost-item', async (c) => {
  const uid = await uidFromRequest(c.req.raw);
  if (!uid) return c.json({ error: 'unauthorized' }, 401);

  const liffUser = await c.env.DB.prepare(
    'SELECT role FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string }>();
  if (!liffUser || !['general_manager', 'operations_manager'].includes(liffUser.role)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{
    report_type: string;
    received_at?: string;
    vehicle_no?: string;
    employee_name?: string;
    employee_emp_no?: string;
    employee_division?: number | null;
    employee_team?: number | null;
    item_description?: string;
    pickup_location?: string;
    dropoff_location?: string;
    customer_name?: string;
    customer_phone?: string;
    return_method?: string;
    notes?: string;
  }>();

  const reportType = body.report_type === 'customer' ? 'customer' : 'staff';

  await c.env.DB.prepare(`
    INSERT INTO lost_item_reports
      (report_type, received_at, vehicle_no, employee_name, employee_emp_no,
       employee_division, employee_team, item_description, pickup_location, dropoff_location,
       customer_name, customer_phone, return_method, notes, reported_by_uid)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    reportType,
    body.received_at ?? null,
    body.vehicle_no ?? null,
    body.employee_name ?? null,
    body.employee_emp_no ?? null,
    body.employee_division ?? null,
    body.employee_team ?? null,
    body.item_description ?? null,
    body.pickup_location ?? null,
    body.dropoff_location ?? null,
    body.customer_name ?? null,
    body.customer_phone ?? null,
    body.return_method ?? null,
    body.notes ?? null,
    uid,
  ).run();

  // 報告まとめテキストを生成してLINEに送信
  const summary = buildLostItemSummary(body);
  const at = c.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
  if (at) await pushMessage(uid, at, summary);

  return c.json({ ok: true, summary });
});

// ===== LIFF API: 事故報告 送信 =====
app.post('/api/liff/accident', async (c) => {
  const uid = await uidFromRequest(c.req.raw);
  if (!uid) return c.json({ error: 'unauthorized' }, 401);

  const liffUser = await c.env.DB.prepare(
    'SELECT role FROM line_liff_users WHERE line_uid = ?'
  ).bind(uid).first<{ role: string }>();
  if (!liffUser || !['general_manager', 'operations_manager'].includes(liffUser.role)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json<{
    received_at?: string;
    vehicle_no?: string;
    employee_name?: string;
    employee_emp_no?: string;
    employee_division?: number | null;
    employee_team?: number | null;
    accident_type?: string;
    location?: string;
    car_status?: string;
    substitute_requested?: boolean;
    police_notified?: boolean;
    passenger_delivered?: boolean;
    additional_info?: string;
  }>();

  const summary = buildAccidentSummary(body);

  await c.env.DB.prepare(`
    INSERT INTO accident_reports
      (received_at, vehicle_no, employee_name, employee_emp_no,
       employee_division, employee_team, accident_type, location, car_status,
       substitute_requested, police_notified, passenger_delivered,
       additional_info, summary_text, reported_by_uid)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    body.received_at ?? null,
    body.vehicle_no ?? null,
    body.employee_name ?? null,
    body.employee_emp_no ?? null,
    body.employee_division ?? null,
    body.employee_team ?? null,
    body.accident_type ?? null,
    body.location ?? null,
    body.car_status ?? null,
    body.substitute_requested ? 1 : 0,
    body.police_notified ? 1 : 0,
    body.passenger_delivered ? 1 : 0,
    body.additional_info ?? null,
    summary,
    uid,
  ).run();

  const at = c.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
  if (at) await pushMessage(uid, at, summary);

  return c.json({ ok: true, summary });
});

// ===================================================
// テキスト生成ユーティリティ
// ===================================================

function buildLostItemSummary(body: Record<string, unknown>): string {
  const lines: string[] = [];
  if (body.report_type === 'customer') {
    lines.push('【客からの忘れ物問い合わせ】');
  } else {
    lines.push('【忘れ物報告】');
  }
  if (body.received_at)       lines.push(`受電: ${body.received_at}`);
  if (body.vehicle_no)        lines.push(`車番: ${body.vehicle_no}`);
  if (body.employee_name) {
    const div = body.employee_division ? `${body.employee_division}課` : '';
    const team = body.employee_team ? `${body.employee_team}班` : '';
    lines.push(`乗務員: ${div}${team} ${body.employee_name}${body.employee_emp_no ? `（${body.employee_emp_no}）` : ''}`);
  }
  if (body.item_description)  lines.push(`忘れ物: ${body.item_description}`);
  if (body.pickup_location)   lines.push(`乗車地: ${body.pickup_location}`);
  if (body.dropoff_location)  lines.push(`降車地: ${body.dropoff_location}`);
  if (body.customer_name)     lines.push(`客名: ${body.customer_name}`);
  if (body.customer_phone)    lines.push(`電話: ${body.customer_phone}`);
  if (body.return_method)     lines.push(`返却方法: ${body.return_method}`);
  if (body.notes)             lines.push(`備考: ${body.notes}`);
  return lines.join('\n');
}

function buildAccidentSummary(body: Record<string, unknown>): string {
  const lines: string[] = ['【事故報告】'];
  if (body.received_at) lines.push(`受電: ${body.received_at}`);
  if (body.vehicle_no)  lines.push(`車番: ${body.vehicle_no}`);
  if (body.employee_name) {
    const div = body.employee_division ? `${body.employee_division}課` : '';
    const team = body.employee_team ? `${body.employee_team}班` : '';
    lines.push(`乗務員: ${div}${team} ${body.employee_name}${body.employee_emp_no ? `（${body.employee_emp_no}）` : ''}`);
  }
  if (body.accident_type) lines.push(`事故形態: ${body.accident_type}`);
  if (body.car_status)    lines.push(`状態: ${body.car_status}`);
  if (body.location)      lines.push(`場所: ${body.location}`);
  if (body.car_status === '実車' || body.car_status === '迎車') {
    lines.push(`代車要請: ${body.substitute_requested ? '済み' : '未'}`);
    if (body.car_status === '実車') {
      lines.push(`乗客送り届け: ${body.passenger_delivered ? '済み' : '未'}`);
    }
  }
  lines.push(`警察対応: ${body.police_notified ? '指示済み' : '未指示'}`);
  if (body.additional_info) lines.push(`\n${body.additional_info}`);
  return lines.join('\n');
}

// ===================================================
// LIFF ページ HTML
// ===================================================

function liffLostItemPage(liffId: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>忘れ物対応</title>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { margin: 0; padding: 0; background: #f0f4f8; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; font-size: 15px; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: #6b7280; font-size: 14px; }
    .page { max-width: 520px; margin: 0 auto; padding: 16px 16px 40px; }
    .header { background: #1e3a5f; color: white; padding: 14px 16px; border-radius: 12px; margin-bottom: 16px; }
    .header h1 { margin: 0; font-size: 17px; font-weight: 700; }
    .header p { margin: 4px 0 0; font-size: 12px; opacity: 0.8; }
    .card { background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card-title { font-size: 13px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .field { margin-bottom: 12px; }
    .field:last-child { margin-bottom: 0; }
    label { display: block; font-size: 13px; color: #374151; margin-bottom: 5px; font-weight: 500; }
    input[type=text], input[type=tel], input[type=time], textarea, select {
      width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px;
      font-size: 15px; font-family: inherit; background: #f9fafb; color: #111827;
      -webkit-appearance: none; appearance: none; outline: none;
      transition: border-color 0.15s, background 0.15s;
    }
    input:focus, textarea:focus, select:focus { border-color: #2563eb; background: white; }
    textarea { resize: vertical; min-height: 72px; }
    .type-toggle { display: flex; background: #f3f4f6; border-radius: 10px; padding: 3px; margin-bottom: 16px; }
    .type-btn { flex: 1; text-align: center; padding: 9px 8px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; background: transparent; color: #6b7280; transition: all 0.15s; }
    .type-btn.active { background: white; color: #1e3a5f; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
    .emp-wrap { position: relative; }
    .emp-suggestions { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #d1d5db; border-radius: 8px; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.12); max-height: 200px; overflow-y: auto; margin-top: 2px; display: none; }
    .emp-item { padding: 10px 12px; font-size: 14px; cursor: pointer; border-bottom: 1px solid #f3f4f6; }
    .emp-item:last-child { border-bottom: none; }
    .emp-item:hover { background: #eff6ff; }
    .emp-meta { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .emp-selected { font-size: 13px; color: #059669; margin-top: 4px; font-weight: 600; }
    .customer-fields { display: none; }
    .customer-fields.visible { display: block; }
    .btn-submit { width: 100%; background: #1e3a5f; color: white; border: none; border-radius: 12px; padding: 15px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 8px; transition: background 0.15s; }
    .btn-submit:active { background: #152d4a; }
    .btn-submit:disabled { background: #9ca3af; cursor: default; }
    .success { text-align: center; padding: 32px 16px; }
    .success-icon { font-size: 48px; margin-bottom: 16px; }
    .success-title { font-size: 20px; font-weight: 700; color: #1e3a5f; margin-bottom: 8px; }
    .success-summary { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; text-align: left; font-size: 13px; color: #374151; white-space: pre-line; margin: 16px 0; line-height: 1.7; }
    .btn-close { background: #f3f4f6; color: #374151; border: none; border-radius: 10px; padding: 12px 24px; font-size: 14px; font-weight: 600; cursor: pointer; margin-top: 8px; }
    .return-radio { display: flex; gap: 12px; }
    .return-radio label { display: flex; align-items: center; gap: 6px; cursor: pointer; font-weight: 400; }
    .return-radio input[type=radio] { width: auto; }
  </style>
</head>
<body>
  <div id="loading">読み込み中...</div>
  <div id="app" style="display:none;">
    <div class="page" id="form-page">
      <div class="header">
        <h1>忘れ物対応</h1>
        <p>必須項目はありません。わかる範囲で入力してください</p>
      </div>

      <!-- 種別切替 -->
      <div class="type-toggle">
        <button class="type-btn active" id="btn-staff" onclick="setType('staff')">社員からの報告</button>
        <button class="type-btn" id="btn-customer" onclick="setType('customer')">客からの問い合わせ</button>
      </div>

      <!-- 基本情報 -->
      <div class="card">
        <div class="card-title">基本情報</div>
        <div class="field">
          <label>受電時刻</label>
          <input type="time" id="received_at">
        </div>
        <div class="field">
          <label>車番</label>
          <input type="text" id="vehicle_no" placeholder="例: 5232" inputmode="numeric">
        </div>
      </div>

      <!-- 乗務員情報 -->
      <div class="card">
        <div class="card-title">乗務員</div>
        <div class="field">
          <div class="emp-wrap">
            <input type="text" id="emp-search" placeholder="氏名・社員番号で検索" autocomplete="off"
              oninput="empSearchDebounce()">
            <div class="emp-suggestions" id="emp-suggestions"></div>
          </div>
          <div class="emp-selected" id="emp-selected" style="display:none;"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;" id="emp-detail-row">
          <div class="field" style="margin-bottom:0;">
            <label>課</label>
            <input type="text" id="employee_division" placeholder="3" readonly style="background:#f3f4f6;color:#6b7280;">
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>班</label>
            <input type="text" id="employee_team" placeholder="6" readonly style="background:#f3f4f6;color:#6b7280;">
          </div>
        </div>
      </div>

      <!-- 忘れ物情報 -->
      <div class="card">
        <div class="card-title">忘れ物情報</div>
        <div class="field">
          <label>忘れ物の内容</label>
          <textarea id="item_description" placeholder="例: 黒い財布、iPhone"></textarea>
        </div>
        <div class="field">
          <label>乗車地</label>
          <input type="text" id="pickup_location" placeholder="例: 板橋駅">
        </div>
        <div class="field">
          <label>降車地</label>
          <input type="text" id="dropoff_location" placeholder="例: 池袋駅">
        </div>
      </div>

      <!-- 客情報（客問い合わせ時のみ） -->
      <div class="card customer-fields" id="customer-section">
        <div class="card-title">お客様情報</div>
        <div class="field">
          <label>お客様氏名</label>
          <input type="text" id="customer_name" placeholder="田中 一郎">
        </div>
        <div class="field">
          <label>お客様電話番号</label>
          <input type="tel" id="customer_phone" placeholder="090-0000-0000" inputmode="tel">
        </div>
        <div class="field">
          <label>返却方法</label>
          <div class="return-radio">
            <label><input type="radio" name="return_method" value="着払い"> 着払い</label>
            <label><input type="radio" name="return_method" value="来社受け取り"> 来社受け取り</label>
          </div>
        </div>
      </div>

      <!-- 備考 -->
      <div class="card">
        <div class="card-title">備考</div>
        <div class="field">
          <textarea id="notes" placeholder="その他、特記事項があれば"></textarea>
        </div>
      </div>

      <button class="btn-submit" id="btn-submit" onclick="submitForm()">送信する</button>
    </div>

    <!-- 送信完了画面 -->
    <div class="page success" id="success-page" style="display:none;">
      <div class="success-icon">✅</div>
      <div class="success-title">送信しました</div>
      <p style="color:#6b7280;font-size:14px;">LINEにも同じ内容を送信しました。<br>コピーして転送にご利用ください。</p>
      <div class="success-summary" id="summary-text"></div>
      <button class="btn-close" onclick="if(liff.isInClient())liff.closeWindow();">閉じる</button>
    </div>
  </div>

  <script>
  var LIFF_ACCESS_TOKEN = '';
  var selectedEmp = null;
  var currentType = 'staff';
  var empSearchTimer = null;

  liff.init({ liffId: ${JSON.stringify(liffId || 'LIFF_ID_NOT_SET')} })
    .then(function() {
      LIFF_ACCESS_TOKEN = liff.getAccessToken() || '';
      document.getElementById('loading').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      // 現在時刻をデフォルト設定
      var now = new Date();
      var hh = String(now.getHours()).padStart(2, '0');
      var mm = String(now.getMinutes()).padStart(2, '0');
      document.getElementById('received_at').value = hh + ':' + mm;
    })
    .catch(function(err) {
      document.getElementById('loading').textContent = 'エラー: ' + err.message;
    });

  function setType(type) {
    currentType = type;
    document.getElementById('btn-staff').className = 'type-btn' + (type === 'staff' ? ' active' : '');
    document.getElementById('btn-customer').className = 'type-btn' + (type === 'customer' ? ' active' : '');
    var cs = document.getElementById('customer-section');
    cs.className = 'card customer-fields' + (type === 'customer' ? ' visible' : '');
  }

  function empSearchDebounce() {
    clearTimeout(empSearchTimer);
    empSearchTimer = setTimeout(doEmpSearch, 300);
  }

  function doEmpSearch() {
    var q = document.getElementById('emp-search').value.trim();
    var sug = document.getElementById('emp-suggestions');
    if (q.length < 1) { sug.style.display = 'none'; return; }
    fetch('/api/liff/employees?q=' + encodeURIComponent(q), {
      headers: { 'Authorization': 'Bearer ' + LIFF_ACCESS_TOKEN }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || data.length === 0) { sug.style.display = 'none'; return; }
      sug.innerHTML = data.map(function(e) {
        var div = e.division ? e.division + '課' : '';
        var team = e.team ? e.team + '班' : '';
        return '<div class="emp-item" onclick="selectEmp(' + JSON.stringify(e).replace(/</g,'\\u003c').replace(/"/g,'&quot;') + ')">'
          + '<div>' + e.name + '</div>'
          + '<div class="emp-meta">' + div + team + ' / ' + e.emp_no + '</div>'
          + '</div>';
      }).join('');
      sug.style.display = 'block';
    })
    .catch(function() { sug.style.display = 'none'; });
  }

  function selectEmp(e) {
    selectedEmp = e;
    document.getElementById('emp-search').value = '';
    document.getElementById('emp-suggestions').style.display = 'none';
    var div = e.division ? e.division + '課' : '';
    var team = e.team ? e.team + '班' : '';
    document.getElementById('emp-selected').style.display = 'block';
    document.getElementById('emp-selected').textContent = '✓ ' + e.name + '（' + div + team + ' / ' + e.emp_no + '）';
    document.getElementById('employee_division').value = e.division || '';
    document.getElementById('employee_team').value = e.team || '';
  }

  document.addEventListener('click', function(e) {
    var sug = document.getElementById('emp-suggestions');
    if (!document.getElementById('emp-search').contains(e.target) && !sug.contains(e.target)) {
      sug.style.display = 'none';
    }
  });

  function submitForm() {
    var btn = document.getElementById('btn-submit');
    btn.disabled = true;
    btn.textContent = '送信中...';

    var returnMethod = '';
    var radios = document.querySelectorAll('input[name=return_method]');
    for (var i = 0; i < radios.length; i++) {
      if (radios[i].checked) { returnMethod = radios[i].value; break; }
    }

    var payload = {
      report_type: currentType,
      received_at: document.getElementById('received_at').value || null,
      vehicle_no: document.getElementById('vehicle_no').value.trim() || null,
      employee_name: selectedEmp ? selectedEmp.name : null,
      employee_emp_no: selectedEmp ? selectedEmp.emp_no : null,
      employee_division: selectedEmp ? selectedEmp.division : null,
      employee_team: selectedEmp ? selectedEmp.team : null,
      item_description: document.getElementById('item_description').value.trim() || null,
      pickup_location: document.getElementById('pickup_location').value.trim() || null,
      dropoff_location: document.getElementById('dropoff_location').value.trim() || null,
      customer_name: document.getElementById('customer_name').value.trim() || null,
      customer_phone: document.getElementById('customer_phone').value.trim() || null,
      return_method: returnMethod || null,
      notes: document.getElementById('notes').value.trim() || null,
    };

    fetch('/api/liff/lost-item', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LIFF_ACCESS_TOKEN },
      body: JSON.stringify(payload),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        document.getElementById('form-page').style.display = 'none';
        document.getElementById('success-page').style.display = 'block';
        document.getElementById('summary-text').textContent = data.summary;
      } else {
        btn.disabled = false;
        btn.textContent = '送信する';
        alert('送信に失敗しました: ' + (data.error || '不明なエラー'));
      }
    })
    .catch(function(err) {
      btn.disabled = false;
      btn.textContent = '送信する';
      alert('通信エラーが発生しました');
    });
  }
  </script>
</body>
</html>`;
}

function liffAccidentPage(liffId: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>事故報告</title>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { margin: 0; padding: 0; background: #f0f4f8; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; font-size: 15px; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: #6b7280; font-size: 14px; }
    .page { max-width: 520px; margin: 0 auto; padding: 16px 16px 40px; }
    .header { background: #7f1d1d; color: white; padding: 14px 16px; border-radius: 12px; margin-bottom: 16px; }
    .header h1 { margin: 0; font-size: 17px; font-weight: 700; }
    .header p { margin: 4px 0 0; font-size: 12px; opacity: 0.8; }
    .card { background: white; border-radius: 12px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .card-title { font-size: 13px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
    .field { margin-bottom: 12px; }
    .field:last-child { margin-bottom: 0; }
    label { display: block; font-size: 13px; color: #374151; margin-bottom: 5px; font-weight: 500; }
    input[type=text], input[type=time], textarea, select {
      width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px;
      font-size: 15px; font-family: inherit; background: #f9fafb; color: #111827;
      -webkit-appearance: none; appearance: none; outline: none;
    }
    input:focus, textarea:focus, select:focus { border-color: #dc2626; background: white; }
    textarea { resize: vertical; min-height: 72px; }
    .emp-wrap { position: relative; }
    .emp-suggestions { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #d1d5db; border-radius: 8px; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.12); max-height: 200px; overflow-y: auto; margin-top: 2px; display: none; }
    .emp-item { padding: 10px 12px; font-size: 14px; cursor: pointer; border-bottom: 1px solid #f3f4f6; }
    .emp-item:last-child { border-bottom: none; }
    .emp-item:hover { background: #fef2f2; }
    .emp-meta { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .emp-selected { font-size: 13px; color: #059669; margin-top: 4px; font-weight: 600; }
    .toggle-group { display: flex; gap: 10px; flex-wrap: wrap; }
    .toggle-btn { padding: 8px 16px; border: 2px solid #d1d5db; border-radius: 8px; background: white; color: #374151; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
    .toggle-btn.active { border-color: #dc2626; background: #fef2f2; color: #dc2626; }
    .check-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f3f4f6; }
    .check-row:last-child { border-bottom: none; }
    .check-row label { margin: 0; flex: 1; font-weight: 400; cursor: pointer; }
    .check-row input[type=checkbox] { width: 20px; height: 20px; accent-color: #dc2626; flex-shrink: 0; }
    .car-status-dep { display: none; }
    .car-status-dep.visible { display: block; }
    .btn-submit { width: 100%; background: #991b1b; color: white; border: none; border-radius: 12px; padding: 15px; font-size: 16px; font-weight: 700; cursor: pointer; margin-top: 8px; }
    .btn-submit:disabled { background: #9ca3af; }
    .success { text-align: center; padding: 32px 16px; }
    .success-icon { font-size: 48px; margin-bottom: 16px; }
    .success-title { font-size: 20px; font-weight: 700; color: #7f1d1d; margin-bottom: 8px; }
    .success-summary { background: #fff7f7; border: 1px solid #fecaca; border-radius: 8px; padding: 14px; text-align: left; font-size: 13px; color: #374151; white-space: pre-line; margin: 16px 0; line-height: 1.7; }
    .btn-close { background: #f3f4f6; color: #374151; border: none; border-radius: 10px; padding: 12px 24px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .forward-note { background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 12px; font-size: 13px; color: #92400e; margin-top: 12px; }
  </style>
</head>
<body>
  <div id="loading">読み込み中...</div>
  <div id="app" style="display:none;">
    <div class="page" id="form-page">
      <div class="header">
        <h1>事故報告</h1>
        <p>必須項目はありません。確認できた範囲で入力してください</p>
      </div>

      <!-- 基本情報 -->
      <div class="card">
        <div class="card-title">受電情報</div>
        <div class="field">
          <label>受電時刻</label>
          <input type="time" id="received_at">
        </div>
        <div class="field">
          <label>車番</label>
          <input type="text" id="vehicle_no" placeholder="例: 5232" inputmode="numeric">
        </div>
      </div>

      <!-- 乗務員 -->
      <div class="card">
        <div class="card-title">乗務員</div>
        <div class="field">
          <div class="emp-wrap">
            <input type="text" id="emp-search" placeholder="氏名・社員番号で検索" autocomplete="off"
              oninput="empSearchDebounce()">
            <div class="emp-suggestions" id="emp-suggestions"></div>
          </div>
          <div class="emp-selected" id="emp-selected" style="display:none;"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div class="field" style="margin-bottom:0;">
            <label>課</label>
            <input type="text" id="employee_division" readonly style="background:#f3f4f6;color:#6b7280;">
          </div>
          <div class="field" style="margin-bottom:0;">
            <label>班</label>
            <input type="text" id="employee_team" readonly style="background:#f3f4f6;color:#6b7280;">
          </div>
        </div>
      </div>

      <!-- 事故状況 -->
      <div class="card">
        <div class="card-title">事故状況</div>
        <div class="field">
          <label>乗車状態</label>
          <div class="toggle-group">
            <button class="toggle-btn" id="cs-kusha" onclick="setCarStatus('空車')">空車</button>
            <button class="toggle-btn" id="cs-jissha" onclick="setCarStatus('実車')">実車</button>
            <button class="toggle-btn" id="cs-geisha" onclick="setCarStatus('迎車')">迎車</button>
          </div>
        </div>
        <div class="field">
          <label>事故形態</label>
          <input type="text" id="accident_type" placeholder="例: 単独接触事故、追突事故">
        </div>
        <div class="field">
          <label>事故発生場所</label>
          <input type="text" id="location" placeholder="例: 足立区栗原3丁目の住宅街">
        </div>
      </div>

      <!-- 乗客・代車（実車・迎車時） -->
      <div class="card car-status-dep" id="dep-section">
        <div class="card-title">乗客・代車対応</div>
        <div id="passenger-check" class="check-row" style="display:none;">
          <input type="checkbox" id="passenger_delivered">
          <label for="passenger_delivered">乗客を目的地まで送り届けた</label>
        </div>
        <div class="check-row">
          <input type="checkbox" id="substitute_requested">
          <label for="substitute_requested">代車要請は済んでいる</label>
        </div>
      </div>

      <!-- 対応状況 -->
      <div class="card">
        <div class="card-title">対応状況</div>
        <div class="check-row">
          <input type="checkbox" id="police_notified">
          <label for="police_notified">警察対応するよう指示した</label>
        </div>
      </div>

      <!-- 追加情報 -->
      <div class="card">
        <div class="card-title">追加情報・メモ</div>
        <div class="field">
          <textarea id="additional_info" placeholder="経緯・詳細など"></textarea>
        </div>
      </div>

      <button class="btn-submit" id="btn-submit" onclick="submitForm()">報告書を作成・送信</button>
    </div>

    <!-- 完了 -->
    <div class="page" id="success-page" style="display:none;">
      <div class="success">
        <div class="success-icon">🚨</div>
        <div class="success-title">報告書を作成しました</div>
        <p style="color:#6b7280;font-size:14px;">LINEに報告書を送信しました。<br>管理LINEへは手動で転送してください。</p>
        <div class="success-summary" id="summary-text"></div>
        <div class="forward-note">⚠️ 管理LINEへの転送は各自で行ってください</div>
        <button class="btn-close" onclick="if(liff.isInClient())liff.closeWindow();" style="margin-top:16px;">閉じる</button>
      </div>
    </div>
  </div>

  <script>
  var LIFF_ACCESS_TOKEN = '';
  var selectedEmp = null;
  var currentCarStatus = '';
  var empSearchTimer = null;

  liff.init({ liffId: ${JSON.stringify(liffId || 'LIFF_ID_NOT_SET')} })
    .then(function() {
      LIFF_ACCESS_TOKEN = liff.getAccessToken() || '';
      document.getElementById('loading').style.display = 'none';
      document.getElementById('app').style.display = 'block';
      var now = new Date();
      var hh = String(now.getHours()).padStart(2, '0');
      var mm = String(now.getMinutes()).padStart(2, '0');
      document.getElementById('received_at').value = hh + ':' + mm;
    })
    .catch(function(err) {
      document.getElementById('loading').textContent = 'エラー: ' + err.message;
    });

  function setCarStatus(s) {
    currentCarStatus = s;
    ['kusha','jissha','geisha'].forEach(function(id) {
      document.getElementById('cs-' + id).className = 'toggle-btn';
    });
    var map = { '空車': 'kusha', '実車': 'jissha', '迎車': 'geisha' };
    if (map[s]) document.getElementById('cs-' + map[s]).className = 'toggle-btn active';

    var dep = document.getElementById('dep-section');
    var pc = document.getElementById('passenger-check');
    if (s === '実車' || s === '迎車') {
      dep.className = 'card car-status-dep visible';
      pc.style.display = s === '実車' ? 'flex' : 'none';
    } else {
      dep.className = 'card car-status-dep';
    }
  }

  function empSearchDebounce() {
    clearTimeout(empSearchTimer);
    empSearchTimer = setTimeout(doEmpSearch, 300);
  }

  function doEmpSearch() {
    var q = document.getElementById('emp-search').value.trim();
    var sug = document.getElementById('emp-suggestions');
    if (q.length < 1) { sug.style.display = 'none'; return; }
    fetch('/api/liff/employees?q=' + encodeURIComponent(q), {
      headers: { 'Authorization': 'Bearer ' + LIFF_ACCESS_TOKEN }
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || data.length === 0) { sug.style.display = 'none'; return; }
      sug.innerHTML = data.map(function(e) {
        var div = e.division ? e.division + '課' : '';
        var team = e.team ? e.team + '班' : '';
        return '<div class="emp-item" onclick="selectEmp(' + JSON.stringify(e).replace(/</g,'\\u003c').replace(/"/g,'&quot;') + ')">'
          + '<div>' + e.name + '</div>'
          + '<div class="emp-meta">' + div + team + ' / ' + e.emp_no + '</div>'
          + '</div>';
      }).join('');
      sug.style.display = 'block';
    })
    .catch(function() { sug.style.display = 'none'; });
  }

  function selectEmp(e) {
    selectedEmp = e;
    document.getElementById('emp-search').value = '';
    document.getElementById('emp-suggestions').style.display = 'none';
    var div = e.division ? e.division + '課' : '';
    var team = e.team ? e.team + '班' : '';
    document.getElementById('emp-selected').style.display = 'block';
    document.getElementById('emp-selected').textContent = '✓ ' + e.name + '（' + div + team + ' / ' + e.emp_no + '）';
    document.getElementById('employee_division').value = e.division || '';
    document.getElementById('employee_team').value = e.team || '';
  }

  document.addEventListener('click', function(e) {
    var sug = document.getElementById('emp-suggestions');
    if (!document.getElementById('emp-search').contains(e.target) && !sug.contains(e.target)) {
      sug.style.display = 'none';
    }
  });

  function submitForm() {
    var btn = document.getElementById('btn-submit');
    btn.disabled = true;
    btn.textContent = '送信中...';

    var payload = {
      received_at: document.getElementById('received_at').value || null,
      vehicle_no: document.getElementById('vehicle_no').value.trim() || null,
      employee_name: selectedEmp ? selectedEmp.name : null,
      employee_emp_no: selectedEmp ? selectedEmp.emp_no : null,
      employee_division: selectedEmp ? selectedEmp.division : null,
      employee_team: selectedEmp ? selectedEmp.team : null,
      accident_type: document.getElementById('accident_type').value.trim() || null,
      location: document.getElementById('location').value.trim() || null,
      car_status: currentCarStatus || null,
      substitute_requested: document.getElementById('substitute_requested').checked,
      police_notified: document.getElementById('police_notified').checked,
      passenger_delivered: document.getElementById('passenger_delivered').checked,
      additional_info: document.getElementById('additional_info').value.trim() || null,
    };

    fetch('/api/liff/accident', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + LIFF_ACCESS_TOKEN },
      body: JSON.stringify(payload),
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.ok) {
        document.getElementById('form-page').style.display = 'none';
        document.getElementById('success-page').style.display = 'block';
        document.getElementById('summary-text').textContent = data.summary;
      } else {
        btn.disabled = false;
        btn.textContent = '報告書を作成・送信';
        alert('送信に失敗しました: ' + (data.error || '不明なエラー'));
      }
    })
    .catch(function() {
      btn.disabled = false;
      btn.textContent = '報告書を作成・送信';
      alert('通信エラーが発生しました');
    });
  }
  </script>
</body>
</html>`;
}

export default app;
