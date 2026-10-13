/* inject.js — 既存の km-operator 画面(ログイン済み)の上に新UIを読み込むローダー。
   使い方: km-operator にログインした状態で、ブラウザのコンソールにこのファイルの中身を貼り付けて実行。
   新UIは同じオリジン(km-operator)上で動くため、既存のログインセッションで /kmx/api/v1 を直接呼べます。
   UI_BASE は新UIの配置先(開発中は http://localhost:8765/)。 */
(async () => {
  const UI_BASE = (window.__UI_BASE || 'http://localhost:8765/');
  let u = {}; try { u = KMX_USER; } catch (e) {}   // 旧画面のインラインスクリプトが const で定義している
  const kmx = { operatorId: u.operatorId || '', loginName: (u.userName || '').replace(/^ログイン\s*/, ''), accountId: u.accountId, roleId: u.roleId, officeName: '', apiBase: '' };
  const bust = '?v=' + Date.now();
  let html = await (await fetch(UI_BASE + 'index.html' + bust, { cache: 'no-store' })).text();
  html = html.replace(/src="(screens|map|live)\.js"/g, (m, n) => `src="${UI_BASE}${n}.js${bust}"`);
  document.open();
  document.write('<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>window.__KMX=' + JSON.stringify(kmx) + ';<\/script></head><body>' + html + '</body></html>');
  document.close();
})();
