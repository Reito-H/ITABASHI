// adminログイン2段階認証（顔 / 第二パスワード / バックアップコード）の画面・API。
//   /login/verify               第2要素の入力ページ（パスワードOK後にここへ来る）
//   POST /login/verify/face      顔ベクトルを送って照合 → 一致でセッション発行
//   POST /login/verify/password  第二パスワードで認証 → 一致でセッション発行
//   POST /login/verify/backup    バックアップコードでセッション発行
//   GET  /login/verify/kill?key=AUTH_GATE_KILL_KEY  ゲート緊急停止（auth_gate_enabled='0'）
// いずれも isPublicAdminSubPath('/login/...') によりログイン前でもアクセス可。
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env } from '../auth';
import { createSession, recordFailedLogin } from '../auth';
import { ADMIN_PATH } from '../config';
import {
  getGateStatus, getChallenge, bumpTries, consumeChallenge,
  bestFaceMatchPct, consumeBackupCode, verifySecondPassword, setSetting,
} from '../utils/auth_gate';

type Ctx = Context<{ Bindings: Env; Variables: { adminId: number } }>;

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();

const FACEAPI_SRC = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7/dist/face-api.js';
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7/model';
const CHALLENGE_COOKIE = /(?:^|;\s*)login_challenge=([^;]+)/;
const MAX_TRIES = 6;

function challengeToken(c: Ctx): string {
  const m = (c.req.header('Cookie') ?? '').match(CHALLENGE_COOKIE);
  return m?.[1] ?? '';
}
function clientIp(c: Ctx): string {
  return c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown';
}

async function createSessionAndLog(c: Ctx, adminId: number, ip: string): Promise<string> {
  const sessionId = await createSession(c.env.DB, adminId);
  const cf = (c.req.raw as any).cf ?? {};
  try {
    await c.env.DB.prepare(
      'INSERT INTO login_logs (ip, country, city, latitude, longitude, timezone, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      c.req.header('CF-Connecting-IP') ?? ip,
      cf.country ?? c.req.header('CF-IPCountry') ?? null,
      cf.city ?? null,
      cf.latitude ? String(cf.latitude) : null,
      cf.longitude ? String(cf.longitude) : null,
      cf.timezone ?? null,
      c.req.header('User-Agent') ?? null
    ).run();
  } catch { /* ログ失敗はログインを妨げない */ }
  return sessionId;
}

const SESSION_COOKIE = (sid: string) => `session=${sid}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`;
const CLEAR_CHALLENGE = 'login_challenge=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';

// パスワードのみで通す既定ルート（admin.ts の POST /login から呼ばれる）
export async function finalizeLoginResponse(c: Ctx, adminId: number, ip: string): Promise<Response> {
  const sid = await createSessionAndLog(c, adminId, ip);
  const res = c.redirect(ADMIN_PATH);
  res.headers.set('Set-Cookie', SESSION_COOKIE(sid));
  res.headers.append('Set-Cookie', CLEAR_CHALLENGE);
  return res;
}
async function finalizeLoginJson(c: Ctx, adminId: number, ip: string): Promise<Response> {
  const sid = await createSessionAndLog(c, adminId, ip);
  const res = c.json({ ok: true, redirect: ADMIN_PATH });
  res.headers.set('Set-Cookie', SESSION_COOKIE(sid));
  res.headers.append('Set-Cookie', CLEAR_CHALLENGE);
  return res;
}

// ===================== 緊急停止 =====================
app.get('/login/verify/kill', async (c) => {
  const key = c.req.query('key') ?? '';
  const expected = c.env.AUTH_GATE_KILL_KEY ?? '';
  if (!expected || key !== expected) return c.text('Access denied', 403);
  await setSetting(c.env.DB, 'auth_gate_enabled', '0');
  return c.text('2段階認証ゲートを無効化しました。パスワードのみでログインできます。設定ページから再度有効化できます。');
});

// ===================== 検証ページ =====================
app.get('/login/verify', async (c) => {
  const token = challengeToken(c);
  const ch = token ? await getChallenge(c.env.DB, token) : null;
  if (!ch || ch.status !== 'pending') {
    return c.redirect(`${ADMIN_PATH}/login`);
  }
  const gate = await getGateStatus(c.env.DB);
  return c.html(verifyPage({ hasSecondPw: gate.hasSecondPw, threshold: gate.threshold }));
});

// ===================== 顔で認証 =====================
app.post('/login/verify/face', async (c) => {
  const token = challengeToken(c);
  const ch = token ? await getChallenge(c.env.DB, token) : null;
  if (!ch || ch.status !== 'pending') return c.json({ error: 'この画面の有効期限が切れました。最初からやり直してください。', expired: true }, 400);
  if (ch.face_tries >= MAX_TRIES) return c.json({ error: '試行回数の上限に達しました。最初からやり直してください。', expired: true }, 429);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const desc = body.descriptor;
  if (!Array.isArray(desc) || desc.length !== 128 || !desc.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return c.json({ error: '顔の特徴データが不正です' }, 400);
  }
  const gate = await getGateStatus(c.env.DB);
  const pct = gate.adminId != null ? await bestFaceMatchPct(c.env.DB, gate.adminId, desc as number[]) : null;
  if (pct == null) return c.json({ error: 'admin本人の顔が登録されていません' }, 400);

  if (pct >= gate.threshold) {
    if (!(await consumeChallenge(c.env.DB, token))) return c.json({ error: '処理済みです。', expired: true }, 409);
    return finalizeLoginJson(c, ch.admin_id, clientIp(c));
  }
  const tries = await bumpTries(c.env.DB, token);
  return c.json({ ok: false, pct, threshold: gate.threshold, triesLeft: Math.max(0, MAX_TRIES - tries) });
});

// ===================== 第二パスワードで認証 =====================
app.post('/login/verify/password', async (c) => {
  const token = challengeToken(c);
  const ch = token ? await getChallenge(c.env.DB, token) : null;
  if (!ch || ch.status !== 'pending') return c.json({ error: 'この画面の有効期限が切れました。最初からやり直してください。', expired: true }, 400);
  if (ch.face_tries >= MAX_TRIES) return c.json({ error: '試行回数の上限に達しました。最初からやり直してください。', expired: true }, 429);

  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const pw = String(body.password ?? '');
  if (await verifySecondPassword(c.env.DB, pw)) {
    if (!(await consumeChallenge(c.env.DB, token))) return c.json({ error: '処理済みです。', expired: true }, 409);
    return finalizeLoginJson(c, ch.admin_id, clientIp(c));
  }
  await recordFailedLogin(c.env.DB, clientIp(c));
  const tries = await bumpTries(c.env.DB, token);
  return c.json({ ok: false, error: '第二パスワードが違います。', triesLeft: Math.max(0, MAX_TRIES - tries) });
});

// ===================== バックアップコード =====================
app.post('/login/verify/backup', async (c) => {
  const token = challengeToken(c);
  const ch = token ? await getChallenge(c.env.DB, token) : null;
  if (!ch || ch.status !== 'pending') return c.json({ error: '有効期限切れです。最初からやり直してください。', expired: true }, 400);
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const code = String(body.code ?? '');
  // 先にコードを検証（consumeBackupCode は正しい未使用コードのときだけ1回成立）。
  // 間違えてもチャレンジは生かしたまま → 5分以内なら入力し直せる。
  const ok = await consumeBackupCode(c.env.DB, ch.admin_id, code);
  if (!ok) {
    await recordFailedLogin(c.env.DB, clientIp(c));
    return c.json({ ok: false, error: 'コードが正しくありません（または使用済み）。' });
  }
  if (!(await consumeChallenge(c.env.DB, token))) return c.json({ ok: false, error: '処理済みです。', expired: true }, 409);
  return finalizeLoginJson(c, ch.admin_id, clientIp(c));
});

// ===================== 検証ページ HTML =====================
function verifyPage(o: { hasSecondPw: boolean; threshold: number }): string {
  const CLIENT = `
(function(){
'use strict';
var MODEL_URL = ${JSON.stringify(MODEL_URL)};
var BASE = ${JSON.stringify(ADMIN_PATH)};
function $(id){ return document.getElementById(id); }
function say(m,e){ var el=$('v-msg'); if(el){ el.textContent=m; el.className='msg'+(e?' err':''); } }
function hud(state,tag){ var s=$('rdr-state'); if(s)s.textContent=state; var t=$('rdr-tagtxt'); if(t)t.textContent=tag; }
function scn(cls){ var s=$('v-scanner'); if(s) s.className='scanner '+cls; }
var ready=false, stream=null, opts=null, done=false;
var running=false, armed=false, lastDesc=null, faceFrames=0, earOpen=true, blinked=false, baseNX=null, baseNY=null, moved=false;
function detOpts(){ if(!opts) opts=new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:0.5}); return opts; }
function stop(){ try{ if(stream){ stream.getTracks().forEach(function(t){ t.stop(); }); } }catch(e){} }
function goExpired(msg){ say(msg||'やり直してください', true); setTimeout(function(){ location.href=BASE+'/login'; }, 2500); }
function resetLive(){ armed=false; faceFrames=0; earOpen=true; blinked=false; baseNX=null; baseNY=null; moved=false; lastDesc=null; }
function eyeAR(p){ function d(a,b){ var x=a.x-b.x,y=a.y-b.y; return Math.sqrt(x*x+y*y); } return (d(p[1],p[5])+d(p[2],p[4]))/(2*d(p[0],p[3])+1e-6); }

// ---- 認証成功: スキャナーを緑にして静かに遷移 ----
function onOk(url){
  if(done) return; done=true;
  running=false; stop();
  scn('cam-on locked'); hud('GRANTED','認証成功 / GRANTED'); say('認証成功。管理画面へ移動します…');
  setTimeout(function(){ location.href=url; }, 700);
}

function loadModels(){
  say('顔認証エンジンを読み込み中…（初回だけ数秒）'); hud('LOADING','初期化 / LOADING');
  return Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
  ]).then(function(){ ready=true; say('「カメラで認証を開始」を押してください。'); hud('STANDBY','待機中 / STANDBY'); $('v-face-btn').disabled=false; })
    .catch(function(e){ say('顔認証エンジンを読み込めませんでした。['+(e&&e.message||e)+'] 第二パスワードかバックアップコードをご利用ください。', true); hud('OFFLINE','手動認証 / MANUAL'); });
}
function startCam(){
  if(stream){ if(!running && !done){ running=true; resetLive(); scanLoop(); } return; }
  say('カメラを起動しています…');
  navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:960,height:720},audio:false})
    .then(function(s){ stream=s; var v=$('v-video'); v.srcObject=s; v.onloadeddata=function(){
      var p=v.play(); if(p&&p.catch)p.catch(function(){});
      scn('cam-on scanning'); hud('SCANNING','起動 / INIT'); $('v-face-btn').disabled=true;
      running=true; resetLive(); setTimeout(scanLoop, 500);
    }; })
    .catch(function(e){ say('カメラを起動できませんでした。[' +(e&&e.message||e)+ '] 第二パスワードかバックアップコードをご利用ください。', true); });
}
function schedule(){ setTimeout(scanLoop, 150); }
function scanLoop(){
  if(!running || done) return;
  faceapi.detectSingleFace($('v-video'), detOpts()).withFaceLandmarks().withFaceDescriptor()
    .then(function(res){
      if(!running || done) return;
      if(!res || !res.descriptor || !res.landmarks){
        faceFrames=0; armed=false; hud('NO FACE','顔を枠内に / ALIGN'); say('顔を枠の中央に合わせてください。');
        return schedule();
      }
      faceFrames++;
      lastDesc = Array.prototype.slice.call(res.descriptor);
      var e = (eyeAR(res.landmarks.getLeftEye()) + eyeAR(res.landmarks.getRightEye())) / 2;
      var box = (res.detection && res.detection.box) || null;
      var nose = res.landmarks.getNose()[3];
      var nx = box ? (nose.x - box.x) / (box.width || 1) : 0;
      var ny = box ? (nose.y - box.y) / (box.height || 1) : 0;

      if(faceFrames < 4){ hud('HOLD','静止 / HOLD'); say('そのまま数秒キープしてください…'); return schedule(); }
      if(!armed){ armed=true; baseNX=nx; baseNY=ny; hud('LIVENESS','生体確認 / BLINK'); say('カメラを見て、ゆっくり1回まばたきしてください（または首を少し左右に動かす）。'); }

      if(earOpen && e < 0.19){ earOpen=false; }
      else if(!earOpen && e > 0.26){ earOpen=true; blinked=true; }
      if(baseNX!=null && (Math.abs(nx-baseNX) > 0.085 || Math.abs(ny-baseNY) > 0.09)) moved=true;

      if(blinked || moved){
        running=false; hud('VERIFIED','生体OK / VERIFIED'); say('生体確認できました。照合しています…');
        return submitFace(lastDesc);
      }
      if(faceFrames > 160){
        running=false; $('v-face-btn').disabled=false;
        say('まばたきを検出できませんでした。「カメラで認証を開始」でもう一度お試しください。', true);
        hud('TIMEOUT','タイムアウト / RETRY'); return;
      }
      schedule();
    })
    .catch(function(){ schedule(); });
}
function submitFace(desc){
  fetch(BASE+'/login/verify/face', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ descriptor: desc }) })
    .then(function(r){ return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
    .then(function(res){
      if(res.j && res.j.redirect){ return onOk(res.j.redirect); }
      if(res.j && res.j.expired){ $('v-face-btn').disabled=false; hud('LOCKED OUT','失効 / EXPIRED'); goExpired(res.j.error); return; }
      if(res.j && typeof res.j.pct==='number'){
        hud('NO MATCH','不一致 / RETRY');
        say('一致度 '+res.j.pct+'%（必要 '+res.j.threshold+'%）。正面・明るめで、もう一度まばたきしてください。あと'+res.j.triesLeft+'回。', true);
        if(res.j.triesLeft > 0 && stream && !done){ resetLive(); running=true; setTimeout(scanLoop, 500); }
        else { $('v-face-btn').disabled=false; }
        return;
      }
      $('v-face-btn').disabled=false;
      say((res.j && res.j.error) || '顔認証に失敗しました', true); hud('ERROR','エラー / ERROR');
    })
    .catch(function(){ $('v-face-btn').disabled=false; say('通信エラーが発生しました', true); });
}

function submitPw(){
  var pw=($('v-pw').value||'');
  if(!pw){ $('v-pw-msg').textContent='第二パスワードを入力してください'; return; }
  $('v-pw-btn').disabled=true; $('v-pw-msg').textContent='確認中…';
  fetch(BASE+'/login/verify/password', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password: pw }) })
    .then(function(r){ return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
    .then(function(res){
      $('v-pw-btn').disabled=false;
      if(res.j && res.j.redirect){ return onOk(res.j.redirect); }
      if(res.j && res.j.expired){ $('v-pw-msg').textContent=res.j.error||''; goExpired(res.j.error); return; }
      $('v-pw-msg').textContent = (res.j && res.j.error) || '認証に失敗しました';
    })
    .catch(function(){ $('v-pw-btn').disabled=false; $('v-pw-msg').textContent='通信エラー'; });
}

function submitBackup(){
  var code=($('v-backup-code').value||'').trim();
  if(!code){ $('v-backup-msg').textContent='コードを入力してください'; return; }
  $('v-backup-btn').disabled=true; $('v-backup-msg').textContent='確認中…';
  fetch(BASE+'/login/verify/backup', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ code: code }) })
    .then(function(r){ return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
    .then(function(res){
      $('v-backup-btn').disabled=false;
      if(res.j && res.j.redirect){ return onOk(res.j.redirect); }
      if(res.j && res.j.expired){ goExpired(res.j.error); return; }
      $('v-backup-msg').textContent = (res.j && res.j.error) || 'コードが正しくありません';
    })
    .catch(function(){ $('v-backup-btn').disabled=false; $('v-backup-msg').textContent='通信エラー'; });
}

function init(){
  $('v-face-btn').disabled=true;
  $('v-face-btn').addEventListener('click', startCam);
  var pb=$('v-pw-btn'); if(pb) pb.addEventListener('click', submitPw);
  var pw=$('v-pw'); if(pw) pw.addEventListener('keydown', function(e){ if(e.key==='Enter') submitPw(); });
  var bc=$('v-backup-code'); if(bc) bc.addEventListener('keydown', function(e){ if(e.key==='Enter') submitBackup(); });
  $('v-backup-btn').addEventListener('click', submitBackup);
  $('v-backup-toggle').addEventListener('click', function(){ var b=$('v-backup-box'); b.style.display = b.style.display==='none' ? 'block' : 'none'; });
  if(typeof faceapi==='undefined'){ say('顔認証エンジンを読み込めませんでした。第二パスワードかバックアップコードをご利用ください。', true); hud('OFFLINE','手動認証 / MANUAL'); }
  else loadModels();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
`;

  const pwBlock = o.hasSecondPw
    ? `<div class="altbox">
         <h2>第二パスワードで認証（カメラが無いPC向け）</h2>
         <input type="password" id="v-pw" autocomplete="off" placeholder="第二パスワード">
         <button class="altbtn" id="v-pw-btn" type="button">第二パスワードでログイン</button>
         <div class="msg" id="v-pw-msg"></div>
       </div>`
    : `<div class="warn">第二パスワードはまだ設定されていません。設定ページ「顔認証」で登録できます。</div>`;

  return `<!DOCTYPE html><html lang="ja"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow"><title>本人確認 | ホシコン</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{min-height:100%}
  /* ベースはホシコン管理画面の背景色（--color-bg / --color-primary / --color-action） */
  body{font-family:'Hiragino Sans','Meiryo',sans-serif;color:#141d2c;background:#f5f8fd;
    display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;position:relative}
  body::before{content:'';position:absolute;inset:0;pointer-events:none;
    background:radial-gradient(circle at 50% -10%,rgba(86,102,255,.07),transparent 55%)}

  .card{position:relative;z-index:2;width:100%;max-width:560px;padding:26px;border-radius:18px;
    background:#fff;border:1px solid #e4eaf5;
    box-shadow:0 20px 60px rgba(35,42,107,.14),0 2px 8px rgba(35,42,107,.06)}
  .tagline{display:flex;align-items:center;gap:9px;margin-bottom:8px;
    font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.24em;color:#5666ff}
  .tagline::before{content:'';width:8px;height:8px;border-radius:50%;background:#5666ff;box-shadow:0 0 8px rgba(86,102,255,.55);animation:rdr-blink 1.6s infinite}
  h1{font-size:19px;font-weight:800;color:#232a6b;margin-bottom:4px}
  .sub{font-size:12px;color:#566178;margin-bottom:18px;line-height:1.6}

  .scanner{position:relative;width:100%;aspect-ratio:4/3;border-radius:14px;overflow:hidden;
    background:radial-gradient(circle at 50% 45%,#0b1220,#04060a);
    border:1px solid #d9e1f2;box-shadow:inset 0 0 70px rgba(0,0,0,.72),0 6px 20px rgba(35,42,107,.10);transition:border-color .4s}
  .scanner.scanning{border-color:rgba(255,64,64,.5)}
  #v-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);opacity:0;transition:opacity .6s ease}
  .scanner.cam-on #v-video{opacity:.9}

  .rdr{position:absolute;inset:0;pointer-events:none}
  .rdr-grid{position:absolute;inset:0;opacity:.55;mix-blend-mode:screen;transition:background-image .4s;
    background-image:linear-gradient(rgba(255,60,60,.11) 1px,transparent 1px),linear-gradient(90deg,rgba(255,60,60,.11) 1px,transparent 1px);
    background-size:32px 32px}
  .rdr-disc{position:absolute;left:50%;top:50%;width:74%;aspect-ratio:1;transform:translate(-50%,-50%)}
  .rdr-ring{position:absolute;inset:0;border-radius:50%;border:1px solid rgba(255,60,60,.38);transition:border-color .4s}
  .rdr-ring.r2{inset:16%}
  .rdr-ring.r3{inset:33%}
  .rdr-sweep{position:absolute;inset:0;border-radius:50%;mix-blend-mode:screen;
    background:conic-gradient(from 0deg,rgba(255,45,45,.6),rgba(255,45,45,.14) 32deg,transparent 82deg,transparent 360deg);
    animation:rdr-rotate 2.8s linear infinite}
  .rdr-cross-h,.rdr-cross-v{position:absolute;background:rgba(255,90,90,.45)}
  .rdr-cross-h{left:7%;right:7%;top:50%;height:1px}
  .rdr-cross-v{top:7%;bottom:7%;left:50%;width:1px}
  .rdr-scan{position:absolute;left:0;right:0;top:6%;height:2px;
    background:linear-gradient(90deg,transparent,#ff2d2d 18%,#ffd7d7 50%,#ff2d2d 82%,transparent);
    box-shadow:0 0 14px 3px rgba(255,45,45,.7),0 0 46px 9px rgba(255,45,45,.34);
    animation:rdr-scanline 2.4s ease-in-out infinite}
  .rdr-corner{position:absolute;width:32px;height:32px;border:2px solid rgba(255,66,66,.92);box-shadow:0 0 13px rgba(255,45,45,.5);transition:border-color .4s,box-shadow .4s}
  .rdr-corner.tl{top:12px;left:12px;border-right:0;border-bottom:0}
  .rdr-corner.tr{top:12px;right:12px;border-left:0;border-bottom:0}
  .rdr-corner.bl{bottom:12px;left:12px;border-right:0;border-top:0}
  .rdr-corner.br{bottom:12px;right:12px;border-left:0;border-top:0}
  .rdr-hud{position:absolute;top:12px;right:14px;text-align:right;
    font:800 10px/1.75 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.16em;color:rgba(255,120,120,.92);text-shadow:0 0 8px rgba(255,45,45,.6);transition:color .4s}
  .rdr-tag{position:absolute;left:14px;bottom:12px;display:flex;align-items:center;gap:8px;
    font:800 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.2em;color:#ff6b6b;text-shadow:0 0 10px rgba(255,45,45,.7);transition:color .4s}
  .rdr-tag .dot{width:8px;height:8px;border-radius:50%;background:#ff3d3d;box-shadow:0 0 10px #ff3d3d;animation:rdr-blink 1s infinite}

  .scanner:not(.scanning):not(.locked) .rdr-sweep{opacity:.28;animation-duration:5.5s}
  .scanner:not(.scanning):not(.locked) .rdr-scan{opacity:.22}

  .scanner.locked{border-color:rgba(34,197,94,.6)}
  .scanner.locked .rdr-ring{border-color:rgba(34,197,94,.6);animation:rdr-ringpulse 1s ease-in-out infinite}
  .scanner.locked .rdr-sweep,.scanner.locked .rdr-scan{opacity:0}
  .scanner.locked .rdr-corner{border-color:rgba(34,197,94,.95);box-shadow:0 0 18px rgba(34,197,94,.7)}
  .scanner.locked .rdr-grid{background-image:linear-gradient(rgba(34,197,94,.13) 1px,transparent 1px),linear-gradient(90deg,rgba(34,197,94,.13) 1px,transparent 1px)}
  .scanner.locked .rdr-tag,.scanner.locked .rdr-hud{color:#4ade80;text-shadow:0 0 10px rgba(34,197,94,.7)}

  @keyframes rdr-rotate{to{transform:rotate(360deg)}}
  @keyframes rdr-scanline{0%{top:5%}50%{top:95%}100%{top:5%}}
  @keyframes rdr-ringpulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.05);opacity:.95}}
  @keyframes rdr-blink{0%,100%{opacity:1}50%{opacity:.12}}

  .act{width:100%;margin-top:15px;padding:14px;border:0;border-radius:12px;cursor:pointer;
    font:800 14px/1 'Hiragino Sans','Meiryo',sans-serif;letter-spacing:.05em;color:#fff;
    background:linear-gradient(180deg,#6675ff,#4a58ec);
    box-shadow:0 10px 24px rgba(74,88,236,.30);
    transition:transform .12s,box-shadow .22s,background .2s}
  .act:hover:not(:disabled){transform:translateY(-1px);background:linear-gradient(180deg,#5967ff,#3f4ddf);box-shadow:0 14px 30px rgba(74,88,236,.38)}
  .act:disabled{opacity:.5;cursor:not-allowed}
  .msg{font:600 12px/1.55 'Hiragino Sans','Meiryo',sans-serif;color:#566178;margin-top:12px;min-height:18px}
  .msg.err{color:#dc2626}

  .altbox{border:1px solid #e4eaf5;border-radius:12px;padding:15px;margin-top:14px;background:#f8fafd}
  .altbox h2{font:700 12px/1 'Hiragino Sans','Meiryo',sans-serif;color:#232a6b;margin-bottom:9px}
  .altbox input{width:100%;background:#fff;border:1px solid #d9e1f2;border-radius:8px;padding:10px 12px;font-size:14px;color:#141d2c;margin-bottom:8px;letter-spacing:.06em}
  .altbox input::placeholder{color:#94a3b8}
  .altbtn{width:100%;padding:10px;border:1px solid #dbe2f5;border-radius:8px;cursor:pointer;font:700 13px/1 'Hiragino Sans','Meiryo',sans-serif;color:#232a6b;background:#eef1fb}
  .altbtn:hover{background:#e3e8f8}
  .link{display:block;width:100%;background:none;border:0;color:#5666ff;font:600 12px/1 'Hiragino Sans','Meiryo',sans-serif;padding:13px 0 4px;cursor:pointer;text-align:left}
  .warn{border:1px solid #fde68a;background:#fffbeb;border-radius:12px;padding:13px;margin-top:14px;font-size:12px;color:#92400e;line-height:1.6}

  @media (prefers-reduced-motion:reduce){
    .rdr-sweep,.rdr-scan,.rdr-ring,.rdr-tag .dot,.tagline::before{animation:none!important}
    .rdr-scan{top:50%}
  }
</style></head><body>
<div class="card">
  <div class="tagline">SECURITY CHECKPOINT</div>
  <h1>本人確認</h1>
  <div class="sub">パスワードは確認できました。続けて admin 本人であることを確認します（5分以内）。</div>

  <div class="scanner" id="v-scanner">
    <video id="v-video" playsinline muted></video>
    <div class="rdr">
      <div class="rdr-grid"></div>
      <div class="rdr-disc">
        <span class="rdr-ring r1"></span><span class="rdr-ring r2"></span><span class="rdr-ring r3"></span>
        <span class="rdr-sweep"></span>
        <span class="rdr-cross-h"></span><span class="rdr-cross-v"></span>
      </div>
      <span class="rdr-scan"></span>
      <span class="rdr-corner tl"></span><span class="rdr-corner tr"></span><span class="rdr-corner bl"></span><span class="rdr-corner br"></span>
      <div class="rdr-hud"><div>FACE-ID &middot; v2</div><div id="rdr-state">STANDBY</div><div>THRESH ${o.threshold}%</div></div>
      <div class="rdr-tag"><span class="dot"></span><span id="rdr-tagtxt">待機中 / STANDBY</span></div>
    </div>
  </div>

  <button class="act" id="v-face-btn">カメラで認証を開始</button>
  <div class="msg" id="v-msg">初期化中…</div>

  ${pwBlock}

  <button class="link" id="v-backup-toggle" type="button">顔も第二パスワードも使えない → バックアップコードを使う</button>
  <div id="v-backup-box" class="altbox" style="display:none;">
    <h2>バックアップコード</h2>
    <div style="font-size:12px;color:#94a3b8;margin-bottom:8px;line-height:1.6;">発行時に保管した「XXXX-XXXX-XXXX」形式のコードを1つ入力してください。使ったコードは無効になります。</div>
    <input type="text" id="v-backup-code" placeholder="XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters">
    <button class="altbtn" id="v-backup-btn" type="button">このコードでログイン</button>
    <div class="msg" id="v-backup-msg"></div>
  </div>
</div>

<script src="${FACEAPI_SRC}" crossorigin="anonymous"></script>
<script>${CLIENT}</script>
</body></html>`;
}

export default app;
