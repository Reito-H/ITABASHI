// CC名簿（クレーム客の記録台帳）
// ページ・APIともページ権限は使わず全アカウント共通でアクセス可（index.tsでバイパス設定）。
// 代わりに開くたび・操作するたびに専用パスワード（5931）をヘッダーで要求する。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { ADMIN_PATH } from '../config';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const CC_PASSWORD = '5931';

function checkPassword(c: { req: { header: (n: string) => string | undefined } }): boolean {
  return c.req.header('X-CC-Password') === CC_PASSWORD;
}

type CcRow = {
  id: number;
  case_name: string; driver_name: string; vehicle_no: string; occurred_at: string | null; phone: string;
  cc_name: string; cc_phone: string; cc_address: string; cc_pickup: string; cc_dropoff: string; notes: string;
  created_by: string; created_at: string; updated_at: string | null;
};

async function adminName(c: { env: Env; get: (k: 'adminId') => number }): Promise<string> {
  const row = await c.env.DB.prepare('SELECT username FROM admins WHERE id = ?')
    .bind(c.get('adminId')).first<{ username: string }>();
  return row?.username ?? `id:${c.get('adminId')}`;
}

// ===== ページ =====
app.get('/cc-list', async (c) => {
  const content = `
    <div class="no-print" style="margin-bottom:20px;">
      <a href="${ADMIN_PATH}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 設定に戻る</a>
    </div>
    <div style="max-width:1100px;">
      <div id="cc-gate" style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:40px 24px;text-align:center;max-width:360px;margin:60px auto;">
        <div style="font-size:32px;margin-bottom:10px;">🔒</div>
        <div style="font-size:15px;font-weight:700;color:#1e3a5f;margin-bottom:14px;">CC名簿はパスワードが必要です</div>
        <input type="password" id="cc-pw-input" placeholder="パスワード" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:10px 12px;font-size:15px;text-align:center;letter-spacing:0.1em;box-sizing:border-box;margin-bottom:10px;">
        <div id="cc-pw-error" style="display:none;color:#dc2626;font-size:12px;margin-bottom:10px;">パスワードが違います</div>
        <button type="button" id="cc-pw-submit" style="width:100%;padding:10px;background:#1e3a5f;color:white;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">開く</button>
      </div>

      <div id="cc-main" style="display:none;">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px;">
          <input type="text" id="cc-search" placeholder="案件名・乗務社員名・車番・CC名・電話番号で検索" style="flex:1;min-width:220px;border:1px solid #d1d5db;border-radius:6px;padding:8px 12px;font-size:13px;">
          <button type="button" onclick="ccOpenModal()" style="padding:8px 16px;background:#1e3a5f;color:white;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">＋ 新規登録</button>
        </div>
        <div style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;">
          <div style="padding:14px 20px;border-bottom:1px solid #f3f4f6;">
            <span id="cc-count" style="font-size:15px;font-weight:700;color:#1e3a5f;">0件</span>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;min-width:1200px;">
              <thead style="background:#f9fafb;">
                <tr>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">日時</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">案件名</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">乗務社員</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">車番</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">電話番号</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">CC名</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">CC電話番号</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">CC住所</th>
                  <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">乗車地→降車地</th>
                  <th style="padding:8px 12px;"></th>
                </tr>
              </thead>
              <tbody id="cc-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <div id="cc-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1000;align-items:center;justify-content:center;padding:16px;">
      <div style="background:white;border-radius:12px;padding:22px;width:100%;max-width:520px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h3 id="cc-modal-title" style="font-size:15px;font-weight:700;color:#1e3a5f;margin:0;">CC名簿の新規登録</h3>
          <button type="button" onclick="ccCloseModal()" style="color:#9ca3af;font-size:22px;background:none;border:none;cursor:pointer;">✕</button>
        </div>
        <div id="cc-modal-error" style="display:none;background:#fee2e2;color:#991b1b;border-radius:6px;padding:8px 10px;font-size:12px;margin-bottom:10px;"></div>
        <input type="hidden" id="cc-id">
        <div class="cc-field"><label>案件名</label><input type="text" id="cc-case_name"></div>
        <div class="cc-row2 cc-field">
          <div><label>乗務社員名前</label><input type="text" id="cc-driver_name"></div>
          <div><label>車番</label><input type="text" id="cc-vehicle_no" inputmode="numeric"></div>
        </div>
        <div class="cc-row2 cc-field">
          <div><label>日時</label><input type="datetime-local" id="cc-occurred_at"></div>
          <div><label>電話番号</label><input type="tel" id="cc-phone"></div>
        </div>
        <div style="border-top:1px dashed #d1d5db;margin:14px 0;padding-top:12px;font-size:12px;font-weight:700;color:#991b1b;">CC情報</div>
        <div class="cc-row2 cc-field">
          <div><label>CC名</label><input type="text" id="cc-cc_name"></div>
          <div><label>CC電話番号</label><input type="tel" id="cc-cc_phone"></div>
        </div>
        <div class="cc-field"><label>CC住所</label><input type="text" id="cc-cc_address"></div>
        <div class="cc-row2 cc-field">
          <div><label>CC乗車場所</label><input type="text" id="cc-cc_pickup"></div>
          <div><label>CC降車場所</label><input type="text" id="cc-cc_dropoff"></div>
        </div>
        <div class="cc-field"><label>備考</label><textarea id="cc-notes" style="min-height:60px;"></textarea></div>
        <button type="button" id="cc-submit-btn" onclick="ccSubmit()" style="width:100%;margin-top:6px;padding:12px;background:#1e3a5f;color:white;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">登録する</button>
      </div>
    </div>

    <style>
      .cc-field { margin-bottom: 12px; }
      .cc-field label { display: block; font-size: 12px; color: #374151; margin-bottom: 4px; font-weight: 600; }
      .cc-field input, .cc-field textarea {
        width: 100%; border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 10px;
        font-size: 14px; font-family: inherit; background: #f9fafb; color: #111827; box-sizing: border-box;
      }
      .cc-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    </style>

    <script>
    var CC_ADMIN_PATH = ${JSON.stringify(ADMIN_PATH)};
    var ccPassword = '';
    var ccItems = [];

    function ccApi(method, path, body) {
      return fetch(CC_ADMIN_PATH + '/api/cc-list' + path, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'X-CC-Password': ccPassword },
        body: body ? JSON.stringify(body) : undefined,
      }).then(function(r) {
        if (r.status === 401) { throw new Error('PASSWORD'); }
        return r.json();
      });
    }

    function ccEsc(s) {
      return (s == null ? '' : String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    document.getElementById('cc-pw-submit').addEventListener('click', ccTryOpen);
    document.getElementById('cc-pw-input').addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); ccTryOpen(); } });

    function ccTryOpen() {
      var pw = document.getElementById('cc-pw-input').value;
      ccPassword = pw;
      ccApi('GET', '/list').then(function(data) {
        document.getElementById('cc-gate').style.display = 'none';
        document.getElementById('cc-main').style.display = 'block';
        ccItems = data.items || [];
        ccRender();
      }).catch(function(e) {
        ccPassword = '';
        document.getElementById('cc-pw-error').style.display = 'block';
      });
    }

    document.getElementById('cc-search').addEventListener('input', function() {
      var q = this.value.trim();
      ccApi('GET', '/list' + (q ? '?q=' + encodeURIComponent(q) : '')).then(function(data) {
        ccItems = data.items || [];
        ccRender();
      }).catch(function() {});
    });

    function ccRender() {
      document.getElementById('cc-count').textContent = ccItems.length + '件';
      document.getElementById('cc-tbody').innerHTML = ccItems.map(function(r) {
        var route = (r.cc_pickup || r.cc_dropoff) ? (ccEsc(r.cc_pickup || '?') + ' → ' + ccEsc(r.cc_dropoff || '?')) : '—';
        return '<tr>'
          + '<td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:12px;color:#6b7280;white-space:nowrap;">' + ccEsc((r.occurred_at||'').replace('T',' ')) + '</td>'
          + '<td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;">' + ccEsc(r.case_name || '—') + '</td>'
          + '<td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">' + ccEsc(r.driver_name || '—') + '</td>'
          + '<td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">' + ccEsc(r.vehicle_no || '—') + '</td>'
          + '<td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">' + ccEsc(r.phone || '—') + '</td>'
          + '<td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;font-weight:600;color:#991b1b;">' + ccEsc(r.cc_name || '—') + '</td>'
          + '<td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;">' + ccEsc(r.cc_phone || '—') + '</td>'
          + '<td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + ccEsc(r.cc_address||'') + '">' + ccEsc(r.cc_address || '—') + '</td>'
          + '<td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:13px;white-space:nowrap;">' + route + '</td>'
          + '<td style="padding:8px 12px;border-bottom:1px solid #f3f4f6;white-space:nowrap;">'
          + '<button onclick="ccOpenModal(' + r.id + ')" style="padding:3px 8px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:4px;font-size:11px;cursor:pointer;">編集</button>'
          + '<button onclick="ccDelete(' + r.id + ')" style="padding:3px 8px;background:#fee2e2;color:#991b1b;border:none;border-radius:4px;font-size:11px;cursor:pointer;margin-left:4px;">削除</button>'
          + '</td></tr>';
      }).join('') || '<tr><td colspan="10" style="padding:24px;text-align:center;color:#9ca3af;">登録がありません</td></tr>';
    }

    var CC_FIELDS = ['case_name','driver_name','vehicle_no','occurred_at','phone','cc_name','cc_phone','cc_address','cc_pickup','cc_dropoff','notes'];

    function ccOpenModal(id) {
      document.getElementById('cc-modal-error').style.display = 'none';
      document.getElementById('cc-id').value = id || '';
      document.getElementById('cc-modal-title').textContent = id ? 'CC名簿の編集' : 'CC名簿の新規登録';
      if (id) {
        var item = ccItems.find(function(r) { return r.id === id; });
        CC_FIELDS.forEach(function(f) { document.getElementById('cc-' + f).value = (item && item[f]) || ''; });
      } else {
        CC_FIELDS.forEach(function(f) { document.getElementById('cc-' + f).value = ''; });
      }
      document.getElementById('cc-modal').style.display = 'flex';
    }
    function ccCloseModal() { document.getElementById('cc-modal').style.display = 'none'; }
    document.getElementById('cc-modal').addEventListener('click', function(e) { if (e.target === this) ccCloseModal(); });

    function ccSubmit() {
      var id = document.getElementById('cc-id').value;
      var payload = {};
      CC_FIELDS.forEach(function(f) { payload[f] = document.getElementById('cc-' + f).value.trim(); });
      var btn = document.getElementById('cc-submit-btn');
      btn.disabled = true;
      var p = id ? ccApi('PUT', '/' + id, payload) : ccApi('POST', '', payload);
      p.then(function(data) {
        btn.disabled = false;
        if (data.ok) {
          ccCloseModal();
          return ccApi('GET', '/list').then(function(data2) { ccItems = data2.items || []; ccRender(); });
        } else {
          document.getElementById('cc-modal-error').textContent = data.error || '登録に失敗しました';
          document.getElementById('cc-modal-error').style.display = 'block';
        }
      }).catch(function() {
        btn.disabled = false;
        document.getElementById('cc-modal-error').textContent = '通信エラーが発生しました';
        document.getElementById('cc-modal-error').style.display = 'block';
      });
    }

    function ccDelete(id) {
      if (!confirm('この記録を削除しますか？')) return;
      ccApi('DELETE', '/' + id).then(function(data) {
        if (data.ok) { ccItems = ccItems.filter(function(r) { return r.id !== id; }); ccRender(); }
      });
    }
    </script>
  `;
  return c.html(layout('CC名簿', content, 'settings'));
});

// ===== API（すべて X-CC-Password ヘッダー必須） =====

app.get('/api/cc-list/list', async (c) => {
  if (!checkPassword(c)) return c.json({ error: 'パスワードが違います' }, 401);
  const q = (c.req.query('q') || '').trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    rows = await c.env.DB.prepare(
      `SELECT * FROM cc_list
       WHERE case_name LIKE ? OR driver_name LIKE ? OR vehicle_no LIKE ? OR phone LIKE ?
          OR cc_name LIKE ? OR cc_phone LIKE ? OR cc_address LIKE ?
       ORDER BY occurred_at DESC, id DESC LIMIT 500`
    ).bind(like, like, like, like, like, like, like).all<CcRow>();
  } else {
    rows = await c.env.DB.prepare('SELECT * FROM cc_list ORDER BY occurred_at DESC, id DESC LIMIT 500').all<CcRow>();
  }
  return c.json({ items: rows.results ?? [] });
});

app.post('/api/cc-list', async (c) => {
  if (!checkPassword(c)) return c.json({ error: 'パスワードが違います' }, 401);
  const b = await c.req.json<Record<string, string>>().catch(() => ({}) as Record<string, string>);
  const name = await adminName(c);
  const result = await c.env.DB.prepare(
    `INSERT INTO cc_list (case_name, driver_name, vehicle_no, occurred_at, phone, cc_name, cc_phone, cc_address, cc_pickup, cc_dropoff, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    b.case_name ?? '', b.driver_name ?? '', b.vehicle_no ?? '', b.occurred_at || null, b.phone ?? '',
    b.cc_name ?? '', b.cc_phone ?? '', b.cc_address ?? '', b.cc_pickup ?? '', b.cc_dropoff ?? '', b.notes ?? '', name
  ).run();
  return c.json({ ok: true, id: result.meta.last_row_id });
});

app.put('/api/cc-list/:id', async (c) => {
  if (!checkPassword(c)) return c.json({ error: 'パスワードが違います' }, 401);
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id)) return c.json({ error: '指定が不正です' }, 400);
  const b = await c.req.json<Record<string, string>>().catch(() => ({}) as Record<string, string>);
  await c.env.DB.prepare(
    `UPDATE cc_list SET case_name=?, driver_name=?, vehicle_no=?, occurred_at=?, phone=?,
       cc_name=?, cc_phone=?, cc_address=?, cc_pickup=?, cc_dropoff=?, notes=?, updated_at=datetime('now','localtime')
     WHERE id=?`
  ).bind(
    b.case_name ?? '', b.driver_name ?? '', b.vehicle_no ?? '', b.occurred_at || null, b.phone ?? '',
    b.cc_name ?? '', b.cc_phone ?? '', b.cc_address ?? '', b.cc_pickup ?? '', b.cc_dropoff ?? '', b.notes ?? '', id
  ).run();
  return c.json({ ok: true });
});

app.delete('/api/cc-list/:id', async (c) => {
  if (!checkPassword(c)) return c.json({ error: 'パスワードが違います' }, 401);
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id)) return c.json({ error: '指定が不正です' }, 400);
  await c.env.DB.prepare('DELETE FROM cc_list WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default app;
