/* bridge.js — ログイン済みの km-operator タブで実行する中継スクリプト。
   新UI(別タブ)からの API 要求を postMessage で受け取り、このタブのセッションで /kmx/api/v1 を呼んで返す。
   使い方: km-operator にログインした状態で、ブラウザのコンソールにこの内容を貼り付けて実行。
   UI_URL は新UIの場所(開発中は http://localhost:8765/)。 */
(() => {
  const UI_URL = (window.__UI_URL || 'http://localhost:8765/') + 'index.html?proxy=1';
  let u = {}; try { u = KMX_USER; } catch (e) {}
  const user = { operatorId: u.operatorId || '', loginName: (u.userName || '').replace(/^ログイン\s*/, ''), accountId: u.accountId, roleId: u.roleId };
  const READ_ONLY = true; // 書き込み API(create/update/delete/send 等)は中継しない
  // 新UI側の「km-operator に接続」ボタンでこのタブが開かれた場合は window.opener が新UI。そうでなければ UI_URL を開く。
  const ui = window.opener || window.open(UI_URL, 'kmx-new-ui');
  window.__kmxBridge = { ui, count: 0 };
  window.addEventListener('message', async (e) => {
    const m = e.data || {};
    if (m.kmx === 'ready') { e.source.postMessage({ kmx: 'hello', user }, '*'); return; }
    if (m.kmx !== 'req') return;
    if (READ_ONLY && /\/(create|update|delete|send|confirm|dispatch_request|request_csv)/.test('/' + m.path)) {
      e.source.postMessage({ kmx: 'res', id: m.id, error: '読み取り専用の中継です: ' + m.path }, '*'); return;
    }
    try {
      const url = new URL('/kmx/api/v1/' + m.path, location.origin);
      Object.entries(m.params || {}).forEach(([k, v]) => url.searchParams.set(k, Array.isArray(v) ? v.join(',') : (v ?? '')));
      url.searchParams.set('_', Date.now());
      const r = await fetch(url, { credentials: 'include' });
      const data = await r.json();
      window.__kmxBridge.count++;
      e.source.postMessage({ kmx: 'res', id: m.id, data }, '*');
    } catch (err) {
      e.source.postMessage({ kmx: 'res', id: m.id, error: String(err.message || err) }, '*');
    }
  });
  return ui ? 'bridge ready (new UI opened)' : 'bridge ready (popup blocked: open ' + UI_URL + ' manually)';
})();
