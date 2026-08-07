// nojico: 外部サイト（https://app.no-jico.com）をアプリ内ブラウザ（iframe）で表示するだけのページ
// ページ権限は使わず全アカウント共通でアクセス可（index.tsでバイパス設定）。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const NOJICO_URL = 'https://app.no-jico.com/login';

app.get('/nojico', async (c) => {
  const content = `
    <div style="height:calc(100vh - 120px);display:flex;flex-direction:column;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <button type="button" onclick="document.getElementById('nojico-frame').src=document.getElementById('nojico-frame').src" style="padding:6px 12px;background:#1e3a5f;color:white;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;">再読み込み</button>
        <a href="${NOJICO_URL}" target="_blank" rel="noopener noreferrer" style="padding:6px 12px;background:#f3f4f6;color:#374151;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">別タブで開く</a>
      </div>
      <iframe id="nojico-frame" src="${NOJICO_URL}" style="flex:1;width:100%;border:1px solid #d1d5db;border-radius:8px;background:white;"></iframe>
    </div>
  `;
  return c.html(layout('nojico', content, 'nojico'));
});

export default app;
