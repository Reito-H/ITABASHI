// 設定 → システム →「タクコン連携」: 板橋PC経由で取りに行っているタクコンCSVの状況画面
//   GET  /settings/takcon-sync            画面（最終取込・件数・失敗、ファイル一覧、実行ログ）
//   GET  /settings/takcon-sync/api/status 状態 JSON（板橋PCの /health も問い合わせる）
//   POST /settings/takcon-sync/api/run    今すぐ取込（手動実行。編集権限）
//   GET  /settings/takcon-sync/file/:id   保存した元CSVをダウンロード（R2 takcon/ 配下）
import { Hono } from 'hono';
import { layout, safeJson } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';
import { settingsSubHeader } from './admin';
import { runTakconSync, takconHealth, TAKCON_ORIGIN } from '../utils/takcon_sync';

type TEnv = Env & { DOCUMENTS_BUCKET?: R2Bucket };
const app = new Hono<{ Bindings: TEnv; Variables: { adminId: number } }>();
const BASE = `${ADMIN_PATH}/settings/takcon-sync`;

app.get('/settings/takcon-sync/api/status', async (c) => {
  const [files, runs, health, counts] = await Promise.all([
    c.env.DB.prepare('SELECT id, name, kind, size, modified, status, detail, attempts, fetched_at, updated_at, r2_key FROM takcon_sync_files ORDER BY updated_at DESC, id DESC LIMIT 200').all(),
    c.env.DB.prepare('SELECT id, trigger, started_at, finished_at, ok, pending, processed, imported, stored, errors, message FROM takcon_sync_runs ORDER BY id DESC LIMIT 30').all(),
    takconHealth(c.env),
    c.env.DB.prepare(`SELECT
        (SELECT MAX(finished_at) FROM takcon_sync_runs WHERE ok = 1) AS last_ok_at,
        (SELECT MAX(finished_at) FROM takcon_sync_runs) AS last_run_at,
        (SELECT COUNT(*) FROM takcon_sync_files WHERE status = 'imported') AS imported,
        (SELECT COUNT(*) FROM takcon_sync_files WHERE status = 'stored') AS stored,
        (SELECT COUNT(*) FROM takcon_sync_files WHERE status = 'error') AS errors,
        (SELECT COUNT(*) FROM takcon_sync_files WHERE status = 'imported' AND fetched_at >= datetime('now', '+9 hours', '-1 day')) AS imported_24h`).first(),
  ]);
  return c.json({ files: files.results, runs: runs.results, health, counts, origin: TAKCON_ORIGIN });
});

app.post('/settings/takcon-sync/api/run', async (c) => {
  const r = await runTakconSync(c.env, 'manual');
  return c.json(r, r.ok ? 200 : 207);
});

app.get('/settings/takcon-sync/file/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT name, r2_key FROM takcon_sync_files WHERE id = ?').bind(id).first<{ name: string; r2_key: string | null }>();
  if (!row?.r2_key || !c.env.DOCUMENTS_BUCKET) return c.text('ファイルがありません', 404);
  const obj = await c.env.DOCUMENTS_BUCKET.get(row.r2_key);
  if (!obj) return c.text('ファイルがありません', 404);
  return new Response(obj.body, { headers: { 'Content-Type': 'text/csv; charset=Shift_JIS', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}` } });
});

app.get('/settings/takcon-sync', (c) => {
  const content = settingsSubHeader('タクコン連携（CSV 自動取込）') + `
  <style>
  .tk-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px}
  .tk-tile{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px}
  .tk-tile .l{font-size:11px;color:#6b7280;font-weight:600}.tk-tile .v{font-size:20px;font-weight:800;color:#1e3a5f;margin-top:2px;line-height:1.3}.tk-tile .s{font-size:11px;color:#6b7280;margin-top:2px}
  .tk-tile.ok .v{color:#15803d}.tk-tile.ng .v{color:#b91c1c}
  .tk-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:12px}
  .tk-card h3{font-size:13px;font-weight:700;color:#1e3a5f;margin:0 0 10px;display:flex;align-items:center;gap:10px}
  .tk-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:6px;border:1px solid #d1d5db;background:#fff;color:#374151;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none}
  .tk-btn.primary{background:#1e3a5f;color:#fff;border-color:#1e3a5f}.tk-btn:disabled{opacity:.5;cursor:default}
  table.tk{width:100%;border-collapse:collapse;font-size:12px}table.tk th,table.tk td{border-bottom:1px solid #eef0f3;padding:6px 8px;text-align:left;vertical-align:top}table.tk th{background:#f8fafc;font-size:11px;color:#374151;white-space:nowrap}
  .st{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}.st.imported{background:#dcfce7;color:#166534}.st.stored{background:#dbeafe;color:#1e40af}.st.error{background:#fee2e2;color:#991b1b}.st.queued{background:#fef3c7;color:#92400e}
  .tk-note{font-size:11px;color:#6b7280;line-height:1.6}
  .tablewrap{max-height:460px;overflow:auto;border:1px solid #e5e7eb;border-radius:8px}
  </style>
  <div style="max-width:1100px">
    <div class="tk-card"><div class="tk-note">
      タクコンで「CSV 出力」した各種データ（ホシコン収集データ・事故データCSV・日報データCSV・駐車料金・オット）を、板橋営業所のPC（takcon-sync）経由でホシコンが<b>毎時自動で取りに行き</b>ます。
      事故データCSVは「事故分析」へ、ホシコン収集データは「売上・安全運転データ」へそのまま反映されます。それ以外の種別は元ファイルを保存だけします（必要になったら取込処理を追加）。
      板橋PCがログオフ・停止中は止まり、復帰後に未処理分から再開します。手でアップロードする従来の方法もそのまま使えます。
    </div></div>
    <div class="tk-tiles" id="tiles"></div>
    <div class="tk-card"><h3>取り込んだファイル <span style="flex:1"></span><button type="button" class="tk-btn primary" id="btnRun">今すぐ取込</button><button type="button" class="tk-btn" id="btnReload">更新</button></h3>
      <div id="runMsg" class="tk-note" style="margin-bottom:8px"></div>
      <div class="tablewrap"><table class="tk"><thead><tr><th>取得日時</th><th>種別</th><th>ファイル名</th><th>状態</th><th>内容</th><th>元CSV</th></tr></thead><tbody id="files"></tbody></table></div>
    </div>
    <div class="tk-card"><h3>実行ログ（直近30回）</h3>
      <div class="tablewrap" style="max-height:300px"><table class="tk"><thead><tr><th>開始</th><th>種類</th><th>結果</th><th>未処理</th><th>処理</th><th>取込</th><th>保存のみ</th><th>失敗</th><th>メッセージ</th></tr></thead><tbody id="runs"></tbody></table></div>
    </div>
  </div>
  <script>
  (function(){
    var BASE = ${safeJson(BASE)}; var $ = function(id){ return document.getElementById(id); };
    var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]; }); };
    var tile = function(l, v, s, cls){ return '<div class="tk-tile ' + (cls || '') + '"><div class="l">' + esc(l) + '</div><div class="v">' + esc(v) + '</div><div class="s">' + esc(s) + '</div></div>'; };
    function load(){
      return fetch(BASE + '/api/status').then(function(r){ return r.json(); }).then(function(j){
        var h = j.health, c = j.counts || {};
        var pcState = h.ok ? ('接続OK' + (h.health.pending != null ? '（未処理 ' + h.health.pending + '件）' : '')) : '接続できません';
        var pcSub = h.ok ? ((h.health.sources || []).map(function(s){ return s.label + (s.reachable ? ' 到達可' : ' 到達不可'); }).join(' / ') || '') : h.message;
        $('tiles').innerHTML =
          tile('板橋PC（takcon-sync）', pcState, pcSub, h.ok ? 'ok' : 'ng') +
          tile('最終取込（成功）', c.last_ok_at || '未実行', '最終実行 ' + (c.last_run_at || '未実行'), '') +
          tile('直近24時間の取込', (c.imported_24h || 0) + '件', '累計 取込 ' + (c.imported || 0) + '・保存のみ ' + (c.stored || 0), '') +
          tile('失敗（再試行待ち）', (c.errors || 0) + '件', c.errors ? '内容欄を確認してください' : '', c.errors ? 'ng' : '');
        $('files').innerHTML = (j.files || []).map(function(f){
          return '<tr><td style="white-space:nowrap">' + esc(f.fetched_at) + '</td><td>' + esc(f.kind) + '</td><td style="font-family:monospace">' + esc(f.name) + '</td><td><span class="st ' + esc(f.status) + '">' + ({imported:'取込済み',stored:'保存のみ',error:'失敗',queued:'取込中'})[f.status] + '</span>' + (f.attempts > 1 ? ' <small>' + f.attempts + '回目</small>' : '') + '</td><td>' + esc(f.detail) + '</td><td>' + (f.r2_key ? '<a class="tk-btn" href="' + BASE + '/file/' + f.id + '">DL</a>' : '') + '</td></tr>';
        }).join('') || '<tr><td colspan="6" class="tk-note">まだ取り込んだファイルはありません</td></tr>';
        $('runs').innerHTML = (j.runs || []).map(function(r){
          return '<tr><td style="white-space:nowrap">' + esc(r.started_at) + '</td><td>' + (r.trigger === 'cron' ? '自動' : '手動') + '</td><td>' + (r.finished_at ? (r.ok ? '<span class="st imported">OK</span>' : '<span class="st error">NG</span>') : '実行中') + '</td><td>' + esc(r.pending) + '</td><td>' + r.processed + '</td><td>' + r.imported + '</td><td>' + r.stored + '</td><td>' + r.errors + '</td><td>' + esc(r.message) + '</td></tr>';
        }).join('') || '<tr><td colspan="9" class="tk-note">まだ実行されていません</td></tr>';
      });
    }
    $('btnReload').addEventListener('click', load);
    $('btnRun').addEventListener('click', function(){
      var b = $('btnRun'); b.disabled = true; $('runMsg').textContent = '取込中…（板橋PCに問い合わせています）';
      var loops = 0;
      (function step(){
        fetch(BASE + '/api/run', { method: 'POST' }).then(function(r){ return r.json(); }).then(function(j){
          $('runMsg').textContent = (j.ok ? '完了: ' : '注意: ') + (j.message || j.error || '');
          load();
          // 大きなCSVは数回に分けて取り込む。続きがあれば自動で続ける（最大20回）
          if (j.queuedRemaining > 0 && j.errors === 0 && ++loops < 20) { $('runMsg').textContent += '（続きを取込中… ' + loops + '）'; return step(); }
          b.disabled = false;
        }).catch(function(){ $('runMsg').textContent = '実行に失敗しました'; b.disabled = false; load(); });
      })();
    });
    load();
  })();
  </script>`;
  return c.html(layout('タクコン連携', content, 'settings'));
});

export default app;
