// 営業戦略ページ
// SR（S.RIDE迎車分析）と、km-operator連携の乗降ピン分析を1つのページに統合し、
// タクシー営業の需要分析（よく乗車される場所・時間帯・エリア等）をまとめて見られるようにする。
// 実装は中身を作り直さず、既存の /settings/sr・/settings/km-pins を ?embed=1 でiframe表示する方式
// （両ページとも embed=1 時はサイドバー等の外枠を省いたページを返す）。
// パスワードはこのページで1回だけ確認する（旧SR_PASSWORD方式を統合・廃止）。
import { Hono } from 'hono';
import type { Env } from '../auth';
import { layout } from '../html/layout';
import { settingsSubHeader } from './admin';
import { ADMIN_PATH } from '../config';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

app.get('/settings/sales-strategy', async (c) => {
  const html = settingsSubHeader('営業戦略') + `
    <div id="ss-gate" style="background:white;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);padding:40px 24px;text-align:center;max-width:360px;margin:60px auto;">
      <div style="font-size:15px;font-weight:700;color:#1e3a5f;margin-bottom:14px;">営業戦略ページはパスワードが必要です</div>
      <input type="password" id="ss-pw-input" placeholder="パスワード" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:10px 12px;font-size:15px;text-align:center;letter-spacing:0.1em;box-sizing:border-box;margin-bottom:10px;">
      <div id="ss-pw-error" style="display:none;color:#dc2626;font-size:12px;margin-bottom:10px;">パスワードが違います</div>
      <button type="button" id="ss-pw-submit" style="width:100%;padding:10px;background:#1e3a5f;color:white;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">開く</button>
    </div>

    <div id="ss-main" style="display:none;">
      <div style="background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:14px 18px;margin-bottom:14px;font-size:12px;color:#374151;line-height:1.6;">
        タクシー営業の需要分析ページです。SR（S.RIDE）の迎車注文データと、km-operator連携で集めた乗降ピンデータ（配車＋流し営業）を横断的に見て、
        どこで・いつ乗車が発生しやすいかを把握できます。
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">
        <button type="button" class="ss-tab-btn" data-tab="pins" onclick="ssShowTab('pins')">需要分析（乗降ピン）</button>
        <button type="button" class="ss-tab-btn" data-tab="sr" onclick="ssShowTab('sr')">SR分析（S.RIDE）</button>
      </div>

      <div class="ss-tab-panel" data-tab="pins" style="display:none;">
        <iframe id="ss-iframe-pins" style="width:100%;min-height:1400px;border:none;" src="about:blank"></iframe>
      </div>
      <div class="ss-tab-panel" data-tab="sr" style="display:none;">
        <iframe id="ss-iframe-sr" style="width:100%;min-height:1400px;border:none;" src="about:blank"></iframe>
      </div>
    </div>

    <style>
      .ss-tab-btn {
        padding:8px 18px;border-radius:16px;font-size:13px;font-weight:600;cursor:pointer;
        border:1px solid #cbd5e1;background:#f8fafc;color:#475569;
      }
      .ss-tab-btn.active { background:#1d4ed8;border-color:#1d4ed8;color:white; }
    </style>

    <script>
      var ADMIN_PATH = ${JSON.stringify(ADMIN_PATH)};
      var ssPassword = '';
      var ssLoadedTabs = {};

      document.getElementById('ss-pw-submit').addEventListener('click', ssTryOpen);
      document.getElementById('ss-pw-input').addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); ssTryOpen(); } });

      function ssTryOpen() {
        ssPassword = document.getElementById('ss-pw-input').value;
        fetch(ADMIN_PATH + '/api/sales-strategy/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: ssPassword }),
        }).then(function(r) {
          if (!r.ok) throw new Error('NG');
          document.getElementById('ss-gate').style.display = 'none';
          document.getElementById('ss-main').style.display = 'block';
          ssShowTab('pins');
        }).catch(function() {
          document.getElementById('ss-pw-error').style.display = 'block';
        });
      }

      function ssShowTab(id) {
        document.querySelectorAll('.ss-tab-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === id); });
        document.querySelectorAll('.ss-tab-panel').forEach(function(p) { p.style.display = (p.dataset.tab === id) ? 'block' : 'none'; });
        if (!ssLoadedTabs[id]) {
          ssLoadedTabs[id] = true;
          if (id === 'pins') document.getElementById('ss-iframe-pins').src = ADMIN_PATH + '/settings/km-pins?embed=1';
          if (id === 'sr') document.getElementById('ss-iframe-sr').src = ADMIN_PATH + '/settings/sr?embed=1';
        }
      }
    </script>
  `;
  return c.html(layout('営業戦略', html, 'settings'));
});

app.post('/api/sales-strategy/check', async (c) => {
  const expected = c.env.SALES_STRATEGY_PASSWORD;
  const body = await c.req.json<{ password?: string }>().catch(() => ({}) as { password?: string });
  if (!expected || body.password !== expected) {
    return c.json({ error: 'パスワードが違います' }, 401);
  }
  return c.json({ ok: true });
});

export default app;
