// LINE登録 LIFF ページ（氏名入力 + QR読取で新人・運行管理者などのロール登録／班長・指導者の紐付けを行う）
// リッチメニュー「登録はこちら」から起動される想定

import { Hono } from 'hono';
import type { Env } from '../auth';
import { bentenUidFromRequest } from '../benten';
import { registerLiffUser } from '../line_bot';

const app = new Hono<{ Bindings: Env }>();

const ROLE_LABELS: Record<string, string> = {
  general_manager: '統括管理者',
  operations_manager: '運行管理者',
  vehicle_manager: '車番管理者',
  newcomer: '新人',
  benten_shift_master: 'ベンテンシフトマスター',
  benten_member: 'ベンテンクラブ会員',
  crew_member: '乗務社員',
};

// ===================================================
// LIFF ページ
// ===================================================
app.get('/liff/register', (c) => {
  const liffId = c.env.LIFF_ID_REGISTER ?? '';
  return c.html(registerPageHtml(liffId));
});

// ===================================================
// API: QRトークン解決・登録
// ===================================================
app.post('/api/liff/register/resolve', async (c) => {
  const uid = await bentenUidFromRequest(c.req.raw);
  if (!uid) return c.json({ error: 'LINEログインの確認に失敗しました' }, 403);

  const body = await c.req.json<{ token?: string; name?: string }>();
  const token = (body.token ?? '').trim();
  const name = (body.name ?? '').trim();
  if (!token) return c.json({ error: 'QRコードを読み取ってください' }, 400);
  if (!name) return c.json({ error: '氏名を入力してください' }, 400);

  const row = await c.env.DB.prepare(
    'SELECT id, target_type, role, instructor_id, is_used, expires_at FROM line_reg_qrcodes WHERE token = ?'
  ).bind(token).first<{
    id: number; target_type: string; role: string | null;
    instructor_id: number | null; is_used: number; expires_at: string;
  }>();

  if (!row) return c.json({ error: '無効なQRコードです' }, 404);
  if (row.expires_at < new Date().toISOString()) return c.json({ error: 'このQRコードは有効期限が切れています' }, 410);

  if (row.target_type === 'instructor') {
    if (row.is_used) return c.json({ error: 'このQRコードは既に使用されています' }, 410);
    await c.env.DB.prepare('UPDATE instructors SET line_uid = ? WHERE id = ?')
      .bind(uid, row.instructor_id).run();
    await c.env.DB.prepare('UPDATE line_reg_qrcodes SET is_used = 1, used_at = datetime(\'now\', \'localtime\') WHERE id = ?')
      .bind(row.id).run();
    return c.json({ ok: true, label: '班長・指導者' });
  }

  const role = row.role ?? '';
  await registerLiffUser(c.env.DB, uid, name, role, null, c.env);
  return c.json({ ok: true, label: ROLE_LABELS[role] ?? role });
});

function registerPageHtml(liffId: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>LINE連携登録</title>
  <script charset="utf-8" src="https://static.line-scdn.net/liff/edge/2/sdk.js"></script>
  <style>
    * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    body { margin: 0; padding: 0; background: #f0f4f8; font-family: 'Hiragino Sans', 'Meiryo', sans-serif; font-size: 15px; }
    #loading { display: flex; align-items: center; justify-content: center; height: 100vh; color: #6b7280; font-size: 14px; }
    .header { background: #1e3a5f; color: white; padding: 16px; text-align: center; }
    .header h1 { margin: 0; font-size: 17px; font-weight: 700; }
    .page { max-width: 480px; margin: 0 auto; padding: 20px 16px; }
    .card { background: white; border-radius: 14px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    label { display: block; font-size: 13px; color: #374151; margin-bottom: 6px; font-weight: 600; }
    input[type=text] {
      width: 100%; border: 1px solid #d1d5db; border-radius: 10px; padding: 12px;
      font-size: 16px; font-family: inherit; background: #f9fafb; color: #111827;
      -webkit-appearance: none; appearance: none; outline: none; margin-bottom: 18px;
    }
    input:focus { border-color: #1e3a5f; background: white; }
    .btn-scan { width: 100%; background: #1e3a5f; color: white; border: none; border-radius: 12px; padding: 16px; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .btn-scan:disabled { background: #9ca3af; }
    .hint { text-align: center; font-size: 12px; color: #9ca3af; margin-top: 14px; line-height: 1.6; }
    .status { text-align: center; font-size: 13px; color: #6b7280; margin-top: 14px; min-height: 18px; }
    .error { color: #dc2626; }
    .success { text-align: center; padding: 32px 16px; }
    .success-icon { font-size: 48px; margin-bottom: 16px; }
    .success-title { font-size: 20px; font-weight: 700; color: #1e3a5f; margin-bottom: 8px; }
    .success-desc { font-size: 14px; color: #6b7280; line-height: 1.6; }
    #view-main { display: none; }
    #view-success { display: none; }
  </style>
</head>
<body>
  <div id="loading">読み込み中...</div>

  <div id="view-main">
    <div class="header"><h1>LINE連携登録</h1></div>
    <div class="page">
      <div class="card">
        <label for="name-input">お名前（フルネーム）</label>
        <input type="text" id="name-input" placeholder="例）板橋 太郎">
        <button class="btn-scan" id="scan-btn" onclick="startScan()">📷 QRコードを読み取る</button>
        <div class="status" id="status"></div>
      </div>
      <div class="hint">管理者から渡されたQRコードを読み取ってください。<br>読み取ると入力したお名前で登録されます。</div>
    </div>
  </div>

  <div id="view-success">
    <div class="success">
      <div class="success-icon">🎉</div>
      <div class="success-title" id="success-label"></div>
      <div class="success-desc">登録が完了しました。<br>このページを閉じてご利用ください。</div>
    </div>
  </div>

  <script>
    var AT = '';
    function setStatus(msg, isError) {
      var el = document.getElementById('status');
      el.textContent = msg || '';
      el.className = 'status' + (isError ? ' error' : '');
    }

    function startScan() {
      var name = document.getElementById('name-input').value.trim();
      if (!name) { setStatus('お名前を入力してください', true); return; }
      if (!liff.scanCodeV2) { setStatus('QRスキャンに対応していません。LINEアプリを最新版に更新してください。', true); return; }

      var btn = document.getElementById('scan-btn');
      btn.disabled = true;
      setStatus('QRコードをスキャンしています…');
      liff.scanCodeV2().then(function(result) {
        var text = (result && result.value) || '';
        var m = text.match(/(REGQR-[A-Z0-9]+)/);
        if (!m) {
          setStatus('認識できないQRコードです', true);
          btn.disabled = false;
          return null;
        }
        setStatus('確認中…');
        return fetch('/api/liff/register/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + AT },
          body: JSON.stringify({ token: m[1], name: name }),
        }).then(function(res) {
          return res.json().then(function(j) {
            if (!res.ok) throw new Error(j.error || '登録に失敗しました');
            return j;
          });
        }).then(function(j) {
          document.getElementById('success-label').textContent = 'あなたは ' + j.label + ' で登録されました';
          document.getElementById('view-main').style.display = 'none';
          document.getElementById('view-success').style.display = 'block';
        });
      }).catch(function(e) {
        setStatus(e && e.message ? e.message : '処理に失敗しました', true);
        btn.disabled = false;
      });
    }

    liff.init({ liffId: ${JSON.stringify(liffId || 'LIFF_ID_NOT_SET')} }).then(function() {
      AT = liff.getAccessToken() || '';
      document.getElementById('loading').style.display = 'none';
      document.getElementById('view-main').style.display = 'block';
    }).catch(function() {
      document.getElementById('loading').textContent = 'LIFF初期化に失敗しました';
    });
  </script>
</body>
</html>`;
}

export default app;
