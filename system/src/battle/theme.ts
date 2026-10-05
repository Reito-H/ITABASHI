// ITABASHI BATTLE 2 — 共通の見た目（ネオン×ダーク）とクライアント共通処理
import { FAVICON_DATA_URI } from '../html/layout';

export const BATTLE_FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=M+PLUS+1p:wght@500;700;800;900&family=Orbitron:wght@600;800;900&display=swap" rel="stylesheet">`;

export function battleHead(title: string): string {
  return `<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#07060f"><title>${title}</title><link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">${BATTLE_FONTS}`;
}

export const BATTLE_BASE_CSS = `
:root{
  --bg:#07060f; --bg2:#100d22; --panel:rgba(255,255,255,.06); --line:rgba(255,255,255,.12);
  --ink:#f4f2ff; --mute:#9a95c4; --pink:#ff3b6b; --cyan:#2fd3ff; --yellow:#ffd23f; --green:#7cff6b; --violet:#9b6bff;
  --tA:#ff3b6b; --tB:#2fd3ff; --tC:#ffd23f; --tD:#7cff6b;
  --disp:"M PLUS 1p","Hiragino Sans",sans-serif; --jp:"M PLUS 1p","Hiragino Sans","Hiragino Kaku Gothic ProN",sans-serif; --num:"Orbitron","M PLUS 1p",sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
html,body{height:100%;background:var(--bg);color:var(--ink);font-family:var(--jp);font-weight:700;-webkit-font-smoothing:antialiased;overflow:hidden;}
body::before{content:"";position:fixed;inset:-20%;z-index:-2;background:
  radial-gradient(40% 35% at 15% 20%,rgba(155,107,255,.28),transparent 70%),
  radial-gradient(35% 30% at 85% 75%,rgba(47,211,255,.22),transparent 70%),
  radial-gradient(30% 25% at 70% 15%,rgba(255,59,107,.18),transparent 70%);
  animation:drift 18s ease-in-out infinite alternate;}
body::after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
  background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);
  background-size:44px 44px;mask-image:radial-gradient(ellipse at center,#000 30%,transparent 80%);}
@keyframes drift{to{transform:translate(4%,-3%) rotate(6deg);}}
.neon{text-shadow:0 0 6px rgba(255,255,255,.6),0 0 14px var(--glow,var(--violet)),0 0 30px var(--glow,var(--violet));}
.disp{font-family:var(--disp);font-weight:900;letter-spacing:.02em;}
.num{font-family:var(--num);font-weight:900;}
.tA{--tc:var(--tA);} .tB{--tc:var(--tB);} .tC{--tc:var(--tC);} .tD{--tc:var(--tD);}
@keyframes pop{0%{transform:scale(.6);opacity:0;}60%{transform:scale(1.08);opacity:1;}100%{transform:scale(1);}}
@keyframes rise{from{transform:translateY(18px);opacity:0;}to{transform:none;opacity:1;}}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.45;}}
@keyframes glowpulse{0%,100%{box-shadow:0 0 0 0 rgba(255,255,255,.0),0 0 24px var(--tc,var(--violet));}50%{box-shadow:0 0 0 10px rgba(255,255,255,.0),0 0 60px var(--tc,var(--violet));}}
@keyframes shake{0%,100%{transform:translateX(0);}20%{transform:translateX(-8px);}40%{transform:translateX(8px);}60%{transform:translateX(-5px);}80%{transform:translateX(5px);}}
.pop{animation:pop .5s cubic-bezier(.2,.9,.3,1.2) both;}
.rise{animation:rise .45s ease both;}
.blink{animation:pulse 1.2s ease-in-out infinite;}
`;

// WebSocket 接続・再接続・時計合わせ（サーバー時刻とのずれ）
export const BATTLE_NET_JS = `
var IB2N = (function(){
  var ws = null, url = '', onState = null, onMsg = null, retry = 0, offset = 0, alive = false, pingT = null;
  function connect(u, cbState, cbMsg){ url = u; onState = cbState; onMsg = cbMsg; open(); }
  function open(){
    try { ws = new WebSocket(url); } catch (e) { later(); return; }
    ws.onopen = function(){ retry = 0; alive = true; ping(); if (pingT) clearInterval(pingT); pingT = setInterval(ping, 20000); status(true); };
    ws.onmessage = function(ev){
      var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'pong') { var now = Date.now(); offset = m.now - (Number(m.c) + now) / 2; return; }
      if (m.t === 'state') { if (m.s && m.s.now) { /* 初回の目安 */ if (!offset) offset = m.s.now - Date.now(); } onState && onState(m.s); return; }
      onMsg && onMsg(m);
    };
    ws.onclose = function(){ alive = false; status(false); later(); };
    ws.onerror = function(){ try { ws.close(); } catch (e) {} };
  }
  function later(){ retry = Math.min(retry + 1, 6); setTimeout(open, 500 * retry); }
  function ping(){ send({ t: 'ping', c: Date.now() }); }
  function send(o){ if (ws && ws.readyState === 1) { ws.send(JSON.stringify(o)); return true; } return false; }
  function status(ok){ var el = document.getElementById('net'); if (el) el.className = ok ? 'net ok' : 'net ng'; }
  function now(){ return Date.now() + offset; }
  return { connect: connect, send: send, now: now, alive: function(){ return alive; } };
})();
function escH(s){ return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmtSec(ms){ return (Math.max(0, ms) / 1000).toFixed(2); }
function fmtTA(sec){ sec = Number(sec) || 0; var m = Math.floor(sec / 60), s = sec - m * 60; return (m ? m + ':' + (s < 10 ? '0' : '') : '') + s.toFixed(1) + (m ? '' : '秒'); }
`;
