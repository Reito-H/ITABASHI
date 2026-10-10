// ITABASHI BATTLE 2 — プロジェクター画面（16:9）。管理者の操作に合わせて自動で切り替わる。
//   BGM・効果音はこの画面だけが鳴らす（会場のスピーカーにつなぐ想定）。最初に1回クリックして音を有効化する。
import { battleHead, BATTLE_BASE_CSS, BATTLE_NET_JS } from './theme';
import { BATTLE_AUDIO_JS } from './audio';

export function battleScreenPage(opts: { wsPath: string; mediaBase: string; joinUrl: string; qrSvg: string; title: string }): string {
  return `<!DOCTYPE html><html lang="ja"><head>${battleHead('ITABASHI BATTLE 2 ｜ SCREEN')}
<style>${BATTLE_BASE_CSS}
html,body{background:#000;}
.wrap{position:fixed;inset:0;display:grid;place-items:center;}
.stage{position:relative;width:min(100vw,177.78vh);height:min(100vh,56.25vw);container-type:size;overflow:hidden;background:transparent;}
.stage::before{content:"";position:absolute;inset:0;z-index:-1;background:
  radial-gradient(50% 45% at 18% 22%,rgba(155,107,255,.32),transparent 70%),radial-gradient(45% 40% at 85% 78%,rgba(47,211,255,.24),transparent 70%),
  radial-gradient(35% 30% at 72% 12%,rgba(255,59,107,.22),transparent 70%),#07060f;}
.hd{position:absolute;left:0;right:0;top:0;height:7cqh;display:flex;align-items:center;gap:1.4cqw;padding:0 2.4cqw;z-index:3;}
.logo{font-family:var(--num);font-weight:900;font-size:1.5cqw;letter-spacing:.2em;--glow:var(--pink);}
.logo b{color:var(--pink);}
.round{margin-left:auto;font-family:var(--num);font-size:1.25cqw;letter-spacing:.2em;color:var(--mute);}
.net{width:.7cqw;height:.7cqw;border-radius:50%;background:#555;} .net.ok{background:var(--green);box-shadow:0 0 1cqw var(--green);} .net.ng{background:var(--pink);}
#main{position:absolute;left:0;right:0;top:7cqh;bottom:13cqh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 4cqw;text-align:center;}
#main.full{bottom:0;}
.sb{position:absolute;left:0;right:0;bottom:0;height:13cqh;display:grid;grid-template-columns:repeat(4,1fr);gap:1cqw;padding:1.4cqh 2.4cqw 2cqh;z-index:3;}
.sb .t{position:relative;border-radius:1cqw;background:rgba(255,255,255,.06);border:.15cqw solid color-mix(in srgb,var(--tc) 60%,transparent);display:flex;align-items:center;gap:1cqw;padding:0 1.4cqw;overflow:hidden;}
.sb .t::before{content:"";position:absolute;left:0;top:0;bottom:0;width:.5cqw;background:var(--tc);box-shadow:0 0 1.5cqw var(--tc);}
.sb .l{font-family:var(--num);font-weight:900;font-size:3cqw;color:var(--tc);--glow:var(--tc);}
.sb .n{flex:1;min-width:0;text-align:left;font-size:1.35cqw;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sb .s{font-family:var(--num);font-weight:900;font-size:3cqw;}
.sb .t.bump{animation:bump .8s ease;}
@keyframes bump{0%{transform:scale(1);}30%{transform:scale(1.08);background:color-mix(in srgb,var(--tc) 35%,transparent);}100%{transform:scale(1);}}
.title{font-family:var(--disp);font-weight:900;font-size:6.4cqw;line-height:1.15;}
.kick{font-family:var(--num);font-size:1.4cqw;letter-spacing:.3em;color:var(--cyan);margin-bottom:1.6cqh;}
.sub{font-size:1.9cqw;color:var(--mute);margin-top:2cqh;line-height:1.6;}
.bigLogo{font-family:var(--num);font-weight:900;font-size:8.6cqw;line-height:.95;letter-spacing:.04em;--glow:var(--pink);}
.bigLogo span{display:block;font-size:4.2cqw;color:var(--cyan);--glow:var(--cyan);letter-spacing:.5em;margin-top:1cqh;}
/* ロビーのロゴの「2」：BATTLEの横に大きく、グラデーション＋白フチ＋光の脈動で目立たせる */
.bigLogo .two{display:inline-block;position:relative;font-size:14cqw;line-height:.7;letter-spacing:0;margin:0 0 0 1.6cqw;vertical-align:-.04em;
  color:transparent;background:linear-gradient(160deg,#fff 0%,var(--cyan) 14%,var(--violet) 31%,var(--pink) 48%,#fff 52%,var(--cyan) 66%,var(--violet) 82%,var(--pink) 100%);background-size:100% 200%;-webkit-background-clip:text;background-clip:text;
  -webkit-text-stroke:.22cqw rgba(255,255,255,.9);text-shadow:none;transform:skewX(-10deg);
  filter:drop-shadow(0 0 .8cqw rgba(47,211,255,.9)) drop-shadow(0 0 2.6cqw rgba(255,59,107,.7));animation:twoFlow 3.2s linear infinite,twoPulse 2.6s ease-in-out infinite,twoFlicker 6.5s linear infinite;}
.bigLogo .two::after{content:"";position:absolute;left:8%;right:8%;bottom:-1.2cqh;height:.5cqh;border-radius:999px;background:linear-gradient(90deg,var(--cyan),var(--pink),var(--violet),var(--cyan));background-size:300% 100%;box-shadow:0 0 1.4cqw var(--pink);animation:lineFlow 2.4s linear infinite;}
/* グラデーションが上から下へ流れ続ける（模様は2周期ぶん並べてあるので継ぎ目なくループ） */
@keyframes twoFlow{from{background-position:0 0;}to{background-position:0 100%;}}
@keyframes lineFlow{from{background-position:0 0;}to{background-position:150% 0;}}
/* ネオン管のように、ときどきチカッと点滅する */
@keyframes twoFlicker{0%,62%,64.5%,67%,90%,100%{opacity:1;}63%{opacity:.35;}65.5%{opacity:.55;}66%{opacity:.2;}91%{opacity:.6;}}
@keyframes twoPulse{0%,100%{filter:drop-shadow(0 0 .8cqw rgba(47,211,255,.9)) drop-shadow(0 0 2.6cqw rgba(255,59,107,.7));}50%{filter:drop-shadow(0 0 1.4cqw rgba(47,211,255,1)) drop-shadow(0 0 4.4cqw rgba(255,59,107,.95));}}
.lobby{display:grid;grid-template-columns:1.25fr 1fr;gap:4cqw;align-items:center;width:100%;}
/* QR非表示中：ロゴだけを中央に大きく */
.lobby.qrOff{grid-template-columns:1fr;text-align:center;}
.lobby.qrOff .bigLogo{font-size:11cqw;}
.lobby.qrOff .bigLogo .two{font-size:18cqw;}
/* QR表示オン：光の輪と一緒にQRが回転しながら飛び出す */
.lobby.qrIn .qrSide{animation:qrIn 1.1s cubic-bezier(.2,1.4,.4,1) both;}
.lobby.qrIn .qrSide .qr{animation:qrGlow 1.6s ease-out both;}
.lobby.qrIn .logoSide{animation:logoSlide .8s cubic-bezier(.2,1,.3,1) both;}
@keyframes qrIn{0%{transform:scale(0) rotate(-200deg);opacity:0;filter:brightness(4);}60%{transform:scale(1.12) rotate(8deg);opacity:1;}100%{transform:scale(1) rotate(0);filter:none;}}
@keyframes qrGlow{0%{box-shadow:0 0 0 0 rgba(255,255,255,1),0 0 0 0 rgba(47,211,255,1);}50%{box-shadow:0 0 0 3cqw rgba(255,59,107,0),0 0 8cqw 2cqw rgba(47,211,255,.9);}100%{box-shadow:0 0 4cqw rgba(47,211,255,.45);}}
@keyframes logoSlide{from{transform:translateX(18cqw) scale(1.25);}to{transform:none;}}
/* 講座スライド（白・まじめ）：ロゴや得点を隠して、画面全体を白に */
.fml{position:fixed;inset:0;z-index:12;background:#fff;color:#1f2937;font-family:'Hiragino Kaku Gothic ProN','Hiragino Sans','Noto Sans JP','Yu Gothic',sans-serif;text-shadow:none;}
.fml *{text-shadow:none;}
.fml .cover{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 8cqw;}
.fml .cover .k{font-size:2cqw;letter-spacing:.3em;color:#6b7280;font-weight:600;}
.fml .cover .t{font-size:4.6cqw;font-weight:800;color:#1a2b4c;line-height:1.3;margin-top:2cqh;letter-spacing:.04em;}
.fml .cover .rule{width:26cqw;height:.35cqh;background:#1a2b4c;margin:3.4cqh 0 2.6cqh;}
.fml .cover .s{font-size:2.6cqw;color:#374151;font-weight:600;line-height:1.5;}
.fml .foot{position:absolute;left:0;right:0;bottom:5cqh;text-align:center;font-size:1.7cqw;color:#6b7280;letter-spacing:.08em;}
.fml .lec{position:absolute;inset:0;padding:7cqh 6cqw 9cqh;display:flex;flex-direction:column;text-align:left;}
.fml .lec .k{font-size:1.6cqw;color:#6b7280;letter-spacing:.2em;font-weight:600;}
.fml .lec .t{font-size:3.8cqw;font-weight:800;color:#1a2b4c;border-left:.7cqw solid #1a2b4c;padding-left:1.6cqw;margin-top:1cqh;line-height:1.3;}
.fml .lec .s{font-size:2.2cqw;color:#374151;font-weight:600;margin:1.4cqh 0 0 2.3cqw;}
.fml .lec .bd{display:flex;gap:3cqw;margin-top:4cqh;flex:1;min-height:0;align-items:flex-start;}
.fml .lec ul{flex:1;margin:0;padding:0;list-style:none;}
.fml .lec li{font-size:2.5cqw;line-height:1.75;padding-left:2.6cqw;position:relative;color:#111827;}
.fml .lec li::before{content:"";position:absolute;left:.4cqw;top:.62em;width:.9cqw;height:.9cqw;background:#1a2b4c;}
.fml .lec li.plain{padding-left:0;} .fml .lec li.plain::before{display:none;}
.fml .lec img{max-width:40cqw;max-height:58cqh;border-radius:.6cqw;border:1px solid #e5e7eb;}
.fml .lec .foot{left:6cqw;text-align:left;bottom:4cqh;}
.fml .lec .bar{position:absolute;left:0;right:0;top:0;height:1.2cqh;background:#1a2b4c;}
.blackOv{position:absolute;inset:0;background:#000;z-index:30;display:none;}
.qr{background:#fff;border-radius:1.4cqw;padding:1.4cqw;width:24cqw;margin:0 auto;box-shadow:0 0 4cqw rgba(47,211,255,.45);}
.qr svg{display:block;width:100%;height:auto;}
.url{font-family:var(--num);font-size:.9cqw;color:var(--mute);margin-top:1.2cqh;word-break:break-all;}
.names{display:flex;flex-wrap:wrap;gap:.7cqw;justify-content:center;margin-top:2.4cqh;max-height:22cqh;overflow:hidden;}
.names span{padding:.6cqh 1.1cqw;border-radius:999px;background:rgba(255,255,255,.08);border:.12cqw solid var(--line);font-size:1.3cqw;animation:pop .5s both;}
.cnt{font-family:var(--num);font-size:2.2cqw;margin-top:2cqh;} .cnt b{color:var(--yellow);font-size:4cqw;--glow:var(--yellow);}
.teams{display:grid;grid-template-columns:repeat(4,1fr);gap:1.6cqw;width:100%;}
.tc{border-radius:1.6cqw;background:rgba(255,255,255,.05);border:.2cqw solid var(--tc);box-shadow:0 0 3cqw color-mix(in srgb,var(--tc) 35%,transparent),inset 0 0 3cqw color-mix(in srgb,var(--tc) 15%,transparent);padding:2.4cqh 1.2cqw 3cqh;min-height:56cqh;display:flex;flex-direction:column;align-items:center;gap:1.4cqh;}
.tc .L{font-family:var(--num);font-weight:900;font-size:9cqw;line-height:1;color:var(--tc);--glow:var(--tc);}
.tc .m{font-size:1.7cqw;padding:.8cqh 1cqw;border-radius:.8cqw;background:rgba(255,255,255,.07);width:100%;}
.tc .k{font-size:1.1cqw;color:var(--mute);letter-spacing:.1em;}
.tc .v{font-family:var(--disp);font-weight:900;font-size:2.4cqw;line-height:1.25;color:var(--tc);}
.tc .w{font-size:1.5cqw;color:var(--mute);}
.tc .ok{color:var(--green);font-family:var(--num);font-size:1.3cqw;letter-spacing:.2em;}
.splash .k2{font-family:var(--num);font-size:2cqw;letter-spacing:.5em;color:var(--pink);--glow:var(--pink);}
.qno{font-family:var(--num);font-weight:900;font-size:2cqw;letter-spacing:.2em;color:var(--yellow);--glow:var(--yellow);margin-bottom:1.6cqh;}
.qtext{font-size:3.4cqw;font-weight:900;line-height:1.4;max-width:86cqw;}
.qimgBox{position:relative;width:62cqw;height:46cqh;border-radius:1.4cqw;overflow:hidden;border:.25cqw solid rgba(255,255,255,.2);box-shadow:0 0 4cqw rgba(155,107,255,.4);background:#111;}
.qimgBox img{width:100%;height:100%;object-fit:cover;display:block;}
.qimgBox.zoom img{animation:zoomOut var(--zd) linear both;}
@keyframes zoomOut{from{transform:scale(5);}to{transform:scale(1);}}
.qimgBox.small{width:40cqw;height:30cqh;}
.live{font-family:var(--num);font-size:1.6cqw;letter-spacing:.3em;color:var(--pink);margin-top:2cqh;}
.buzzList{display:flex;flex-direction:column;gap:1.2cqh;width:44cqw;}
.bz{display:flex;align-items:center;gap:1.4cqw;padding:1.4cqh 1.6cqw;border-radius:1.2cqw;background:rgba(255,255,255,.06);border:.2cqw solid transparent;animation:rise .4s both;}
.bz .r{font-family:var(--num);font-weight:900;font-size:2.8cqw;width:4cqw;}
.bz .nm{flex:1;text-align:left;font-size:2.4cqw;font-weight:900;}
.bz .tm{font-family:var(--num);font-size:2.2cqw;color:var(--mute);}
.bz .tg{font-family:var(--num);font-weight:900;font-size:1.6cqw;color:#07060f;background:var(--tc);border-radius:.6cqw;padding:.3cqh .7cqw;}
.bz.cur{border-color:var(--tc);background:color-mix(in srgb,var(--tc) 22%,transparent);box-shadow:0 0 3cqw var(--tc);transform:scale(1.04);}
.bz.lock{opacity:.3;text-decoration:line-through;}
.judge{display:grid;grid-template-columns:1fr 1fr;gap:3cqw;align-items:center;width:100%;}
.ans{font-family:var(--disp);font-weight:900;font-size:5.6cqw;color:var(--green);--glow:var(--green);line-height:1.2;}
.note{font-size:1.8cqw;color:var(--mute);margin-top:2cqh;max-width:80cqw;line-height:1.6;}
.chs{display:grid;grid-template-columns:1fr 1fr;gap:1.6cqw;width:84cqw;margin-top:3cqh;}
.chs.one{grid-template-columns:1fr;}
.chs .c{position:relative;border-radius:1.4cqw;padding:2.4cqh 2cqw;font-size:2.6cqw;font-weight:900;color:#07060f;text-align:left;display:flex;align-items:center;gap:1.4cqw;overflow:hidden;}
.chs .c .i{font-family:var(--num);font-size:2.2cqw;opacity:.7;}
.chs .c .bar{position:absolute;left:0;top:0;bottom:0;background:rgba(0,0,0,.18);transition:width .8s ease;}
.chs .c .cn{position:relative;margin-left:auto;font-family:var(--num);}
.chs .c span{position:relative;}
.chs .c:nth-child(1){background:var(--pink);} .chs .c:nth-child(2){background:var(--cyan);} .chs .c:nth-child(3){background:var(--yellow);} .chs .c:nth-child(4){background:var(--green);}
.chs .c.dim{opacity:.22;} .chs .c.win{box-shadow:0 0 0 .4cqw #fff,0 0 4cqw #fff;transform:scale(1.03);}
.ring{position:absolute;right:3cqw;top:9cqh;width:10cqw;height:10cqw;}
.ring svg{width:100%;height:100%;transform:rotate(-90deg);}
.ring .tx{position:absolute;inset:0;display:grid;place-items:center;font-family:var(--num);font-weight:900;font-size:3.4cqw;}
.ansd{position:absolute;left:3cqw;top:9cqh;font-family:var(--num);font-size:1.5cqw;color:var(--mute);text-align:left;}
.ansd b{display:block;font-size:3.4cqw;color:var(--ink);}
.rk{display:flex;flex-direction:column;gap:1cqh;width:70cqw;}
/* 景品発表 */
.pz{width:88cqw;display:flex;flex-direction:column;align-items:center;gap:1.6cqh;}
.pz .lbl{font-family:var(--disp);font-weight:900;font-size:6.4cqw;line-height:1.1;color:var(--yellow);--glow:var(--yellow);}
.pz .win{font-family:var(--disp);font-weight:900;font-size:4.6cqw;line-height:1.2;}
.pz .win small{display:block;font-family:var(--num);font-size:2cqw;color:var(--mute);margin-top:.6cqh;}
.pz .mems{display:flex;flex-wrap:wrap;gap:.6cqw;justify-content:center;margin-top:.8cqh;}
.pz .mems span{padding:.5cqh 1cqw;border-radius:999px;background:rgba(255,255,255,.08);font-size:1.6cqw;}
.pz .tease{font-family:var(--disp);font-weight:900;font-size:4.2cqw;color:var(--cyan);--glow:var(--cyan);margin-top:2cqh;}
.pz .gift{display:grid;grid-template-columns:1fr auto;gap:3cqw;align-items:center;margin-top:1.4cqh;padding:2.4cqh 3cqw;border-radius:1.6cqw;background:rgba(255,255,255,.06);border:.2cqw solid var(--yellow);box-shadow:0 0 4cqw rgba(255,210,63,.35);}
.pz .gift.noimg{grid-template-columns:1fr;}
.pz .gift .ln{font-family:var(--disp);font-weight:900;font-size:3.6cqw;line-height:1.35;animation:rise .6s both;}
.pz .gift .ln:first-child{color:var(--yellow);--glow:var(--yellow);}
.pz .gift .nt{font-size:1.8cqw;color:var(--mute);margin-top:1.2cqh;animation:rise .6s both;}
.pz .gift img{max-width:34cqw;max-height:44cqh;border-radius:1.2cqw;box-shadow:0 0 3cqw rgba(0,0,0,.6);animation:pop .7s both;}
.pz .done{display:flex;flex-wrap:wrap;gap:.8cqw;justify-content:center;margin-top:1.6cqh;}
.pz .done span{padding:.6cqh 1.2cqw;border-radius:.8cqw;background:rgba(255,255,255,.06);border:.12cqw solid var(--line);font-size:1.4cqw;color:var(--mute);}
.pz .done b{color:var(--ink);}
/* 発表（打ち上げ会場など） */
.ann{display:flex;flex-direction:column;align-items:center;gap:2cqh;}
.ann .ln{font-family:var(--disp);font-weight:900;font-size:5.6cqw;line-height:1.3;animation:rise .8s both;}
.ann .ln:first-child{font-size:4cqw;color:var(--cyan);--glow:var(--cyan);}
.ann .dots{font-family:var(--disp);font-weight:900;font-size:5cqw;letter-spacing:.3em;color:var(--yellow);--glow:var(--yellow);}
.annR{display:flex;flex-direction:column;align-items:center;gap:1.6cqh;width:92cqw;}
.annR .big{font-family:var(--disp);font-weight:900;font-size:6cqw;line-height:1.2;color:var(--yellow);--glow:var(--yellow);animation:pop .8s both;}
.annR img{max-width:80cqw;max-height:56cqh;border-radius:1.4cqw;box-shadow:0 0 5cqw rgba(255,210,63,.35);animation:pop .9s both;}
.annR .body{font-size:2.2cqw;color:var(--ink);line-height:1.6;animation:rise .8s .6s both;}
.annR.withImg .big{font-size:4.4cqw;}
.vidCap{position:absolute;left:0;right:0;bottom:0;padding:6cqh 4cqw 3cqh;background:linear-gradient(transparent,rgba(0,0,0,.85));text-align:center;z-index:2;}
.vidCap .big{font-family:var(--disp);font-weight:900;font-size:4.6cqw;color:var(--yellow);text-shadow:0 0 1.4cqw rgba(255,210,63,.8);animation:pop .8s both;}
.vidCap .body{font-size:1.8cqw;color:#fff;margin-top:.6cqh;}
/* 景品を出したら全体を詰めて、長い文や画像でもはみ出さないようにする */
.pz.rev{gap:.8cqh;} .pz.rev .kick{display:none;} .pz.rev .title{font-size:2.4cqw !important;}
.pz.rev .lbl{font-size:4.4cqw;} .pz.rev .win{font-size:3.2cqw;} .pz.rev .win small{font-size:1.5cqw;margin-top:.2cqh;}
.pz.rev .mems{margin-top:.2cqh;} .pz.rev .mems span{font-size:1.3cqw;padding:.3cqh .8cqw;}
.pz.rev .gift{margin-top:.6cqh;padding:1.8cqh 2.4cqw;max-width:92cqw;}
.pz.many .gift .ln{font-size:2.7cqw;}
.pz .still,.pz .still *{animation:none !important;}
.fullImg{position:fixed;inset:0;z-index:15;background:#000;display:flex;align-items:center;justify-content:center;}
.fullImg img{width:100%;height:100%;object-fit:contain;}
.fullImg.grow{animation:fullBg 1.4s ease both;}
.fullImg img{transition:filter .9s ease;}
.fullImg.dim img{filter:brightness(.35) blur(.3vw);}
.fullCap{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:7cqh;background:linear-gradient(transparent 50%,rgba(0,0,0,.8));}
.fullImg.dim .fullCap{align-items:center;padding-bottom:0;background:none;}
.fullCap .pz{width:92cqw;}
.fullCap .pz .win{font-size:6cqw;} .fullCap .pz .win small{font-size:2.2cqw;}
.fullCap .pz .mems span{font-size:1.8cqw;}
.fullCap .pz .gift{background:rgba(0,0,0,.55);}
.fullCap .pz.late{animation:rise .6s 1.5s both;}
.fullImg.grow img{animation:fullGrow 1.4s cubic-bezier(.2,.9,.25,1) both;}
@keyframes fullBg{from{background:rgba(0,0,0,0);}to{background:#000;}}
@keyframes fullGrow{0%{transform:scale(.42);filter:brightness(1.6);}60%{transform:scale(1.03);}100%{transform:scale(1);filter:none;}} .pz.many .gift img{max-height:36cqh;max-width:30cqw;}
.rk .row{display:flex;align-items:center;gap:1.6cqw;padding:1.3cqh 2cqw;border-radius:1.2cqw;background:rgba(255,255,255,.06);border:.15cqw solid var(--line);text-align:left;animation:rise .5s both;}
.rk .row .p{font-family:var(--num);font-weight:900;font-size:2.6cqw;width:6cqw;color:var(--cyan);}
.rk .row .nm{flex:1;font-size:2.3cqw;font-weight:900;}
.rk .row .sm{font-size:1.4cqw;color:var(--mute);font-weight:700;margin-left:1cqw;}
.rk .row .v{font-family:var(--num);font-size:2.3cqw;}
.rk .row img{width:7cqw;height:5cqw;object-fit:cover;border-radius:.6cqw;}
.rk .row.hid{opacity:.35;animation:none;} .rk .row.hid .nm{letter-spacing:.3em;}
.rk .row.top1{border-color:var(--yellow);background:color-mix(in srgb,var(--yellow) 18%,transparent);box-shadow:0 0 3cqw color-mix(in srgb,var(--yellow) 50%,transparent);}
.rk .row.new{animation:pop .6s both;}
.score4{display:flex;align-items:flex-end;justify-content:center;gap:3cqw;height:60cqh;width:80cqw;}
.score4 .col{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;}
.score4 .bar{width:100%;border-radius:1cqw 1cqw 0 0;background:linear-gradient(180deg,var(--tc),color-mix(in srgb,var(--tc) 30%,#000));box-shadow:0 0 3cqw var(--tc);transition:height 1.4s cubic-bezier(.2,.9,.3,1);}
.score4 .pt{font-family:var(--num);font-weight:900;font-size:3.4cqw;margin-bottom:1cqh;}
.score4 .nm{font-size:1.6cqw;margin-top:1.2cqh;font-weight:900;}
.score4 .rkb{font-family:var(--num);font-weight:900;font-size:2cqw;color:var(--tc);}
.score4 .col.hid .bar{height:8% !important;background:rgba(255,255,255,.1);box-shadow:none;}
.winner{font-family:var(--num);font-weight:900;font-size:3cqw;letter-spacing:.5em;color:var(--yellow);--glow:var(--yellow);margin-bottom:1cqh;}
.qwall{display:grid;grid-template-columns:repeat(3,1fr);gap:1.2cqw;width:90cqw;margin-top:2cqh;}
.qwall .qq{background:rgba(255,255,255,.06);border:.15cqw solid var(--line);border-radius:1cqw;padding:1.6cqh 1.2cqw;text-align:left;font-size:1.5cqw;line-height:1.5;animation:pop .5s both;}
.qwall .qq .lk{font-family:var(--num);color:var(--pink);font-size:1.3cqw;}
.picked{font-family:var(--disp);font-weight:900;font-size:4.2cqw;line-height:1.4;max-width:84cqw;padding:4cqh 4cqw;border-radius:2cqw;border:.3cqw solid var(--tc);box-shadow:0 0 5cqw var(--tc);background:rgba(0,0,0,.35);}
.timerBig{font-family:var(--num);font-weight:900;font-size:12cqw;color:var(--yellow);--glow:var(--yellow);margin-top:2cqh;}
.titleImg{max-width:60cqw;max-height:40cqh;border-radius:1.2cqw;margin-top:3cqh;box-shadow:0 0 4cqw rgba(155,107,255,.4);}
.pops{position:absolute;inset:0;pointer-events:none;z-index:5;}
.pp{position:absolute;bottom:14cqh;font-family:var(--num);font-weight:900;font-size:4cqw;color:var(--tc);--glow:var(--tc);animation:floatUp 2s ease-out both;}
@keyframes floatUp{0%{transform:translateY(2cqh) scale(.6);opacity:0;}15%{transform:translateY(0) scale(1.15);opacity:1;}100%{transform:translateY(-22cqh) scale(1);opacity:0;}}
#confetti{position:absolute;inset:0;pointer-events:none;z-index:16;}
.vidWrap{position:absolute;inset:0;z-index:4;background:#000;display:flex;align-items:center;justify-content:center;}
.vidWrap video{width:100%;height:100%;object-fit:contain;background:#000;}
.vidWrap .none{font-family:var(--num);font-size:2cqw;letter-spacing:.3em;color:var(--mute);}
.startOv{position:fixed;inset:0;z-index:20;display:grid;place-items:center;background:rgba(0,0,0,.85);cursor:pointer;}
.startOv div{font-family:var(--num);font-weight:900;font-size:2.4vw;letter-spacing:.3em;color:var(--cyan);text-shadow:0 0 20px var(--cyan);text-align:center;line-height:2;}
.startOv small{display:block;font-family:var(--jp);font-size:1.1vw;letter-spacing:.05em;color:#aaa;}
.flashAll{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:17;}
.flashAll.go{animation:fl .45s ease;}
@keyframes fl{0%{opacity:.6;}100%{opacity:0;}}
</style></head><body>
<div class="wrap"><div class="stage" id="stage">
  <div class="hd"><span class="net" id="net"></span><span class="logo neon">ITABASHI <b>BATTLE 2</b></span><span class="round" id="round"></span></div>
  <div id="main"></div>
  <div class="sb" id="sb"></div>
  <div class="pops" id="pops"></div>
  <canvas id="confetti"></canvas>
  <div class="flashAll" id="fa"></div>
  <div class="blackOv" id="black"></div>
</div></div>
<div class="startOv" id="ov"><div>CLICK TO START<small>クリックで音を有効化して全画面表示</small></div></div>
<script>${BATTLE_AUDIO_JS}</script>
<script>${BATTLE_NET_JS}</script>
<script>
(function(){
  var WS = ${JSON.stringify(opts.wsPath)}, MEDIA = ${JSON.stringify(opts.mediaBase)}, JOIN = ${JSON.stringify(opts.joinUrl)};
  var QR = ${JSON.stringify(opts.qrSvg)};
  var main = document.getElementById('main'), sb = document.getElementById('sb'), S = null, lastHtml = '', shown = {}, prevRevealN = -1, tickSec = -1;
  document.getElementById('ov').onclick = function(){
    IB2A.unlock();
    try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); } catch (e) {}
    this.style.display = 'none';
    if (S) IB2A.bgm(effBgm(), MEDIA);
  };
  var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  IB2N.connect(proto + location.host + WS, function(s){ S = s; render(); }, function(m){
    if (m.t === 'sfx') {
      var play = function(){ IB2A.sfx(m.name, m.team); if (m.name === 'buzz' || m.name === 'correct' || m.name === 'scoreBig' || m.name === 'explosion') { var f = document.getElementById('fa'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); } };
      if (m.delay) setTimeout(play, m.delay); else play();
    }
    if (m.t === 'score') popScore(m.team, m.delta);
  });

  function effBgm(){
    if (!S) return null;
    var k = S.bgm;
    if (S.blackout || (S.step && S.step.kind === 'black')) return null;
    if (S.stage === 'step' && S.step && S.step.kind === 'video') return null;
    if (S.stage === 'step' && S.step && S.step.kind === 'formal' && !S.bgm) return null;
    if (S.stage === 'step' && S.step && S.step.kind === 'announce' && S.revealN >= 1 && S.step.video) return null;
    if (k && k.indexOf('builtin:') === 0 && S.stage === 'step' && S.step && S.phase === 'open' && ['choice', 'number', 'order', 'vote'].indexOf(S.step.kind) >= 0) return ['builtin:think', 'builtin:think3', 'builtin:think2'][S.stepIdx % 3];
    return k;
  }
  function popScore(team, d){
    var layer = document.getElementById('pops'), el = document.createElement('div');
    var idx = ['A', 'B', 'C', 'D'].indexOf(team);
    el.className = 'pp neon t' + team; el.style.left = (6 + idx * 24) + '%';
    el.textContent = (d > 0 ? '+' : '') + d;
    layer.appendChild(el); setTimeout(function(){ el.remove(); }, 2100);
    var card = sb.querySelector('[data-t="' + team + '"]'); if (card) { card.classList.remove('bump'); void card.offsetWidth; card.classList.add('bump'); }
  }
  var shownScore = {};
  function scoreBar(){
    var hide = !S || S.stage !== 'step' || (S.step && (S.step.kind === 'scoreboard' || S.step.kind === 'video' || S.step.kind === 'prizes' || S.step.kind === 'announce' || S.step.kind === 'formal'));
    sb.style.display = hide ? 'none' : '';
    main.className = hide ? 'full' : '';
    if (hide) return;
    if (!sb.children.length) sb.innerHTML = S.teams.map(function(t){ return '<div class="t t' + t.team + '" data-t="' + t.team + '"><span class="l neon">' + t.team + '</span><span class="n"></span><span class="s num">0</span></div>'; }).join('');
    S.teams.forEach(function(t){
      var card = sb.querySelector('[data-t="' + t.team + '"]');
      card.querySelector('.n').textContent = t.name || ('チーム' + t.team);
      countTo(card.querySelector('.s'), t.team, t.score);
    });
  }
  function countTo(el, team, target){
    var from = shownScore[team] == null ? target : shownScore[team];
    shownScore[team] = target;
    if (from === target) { el.textContent = target; return; }
    var t0 = performance.now(), dur = 900;
    (function f(){ var p = Math.min(1, (performance.now() - t0) / dur); el.textContent = Math.round(from + (target - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); })();
  }

  function render(){
    if (!S) return;
    if (document.getElementById('ov').style.display === 'none') IB2A.bgm(effBgm(), MEDIA);
    document.getElementById('round').textContent = S.stage === 'step' ? 'ROUND ' + (S.stepIdx + 1) + ' / ' + S.stepCount : (S.stage === 'lobby' ? 'ENTRY' : 'TEAM BUILDING');
    scoreBar();
    // 黒画面（メニューの「黒画面」またはトラブル用の常時ボタン）。音も止める
    var blk = !!(S.blackout || (S.stage === 'step' && S.step && S.step.kind === 'black'));
    document.getElementById('black').style.display = blk ? 'block' : 'none';
    if (blk) IB2A.stopTrack();
    var qrNow = S.stage === 'lobby' && !!S.lobbyQr;
    qrAnim = qrNow && prevQr === false;
    if (qrAnim) { var fa = document.getElementById('fa'); fa.classList.remove('go'); void fa.offsetWidth; fa.classList.add('go'); }
    prevQr = S.stage === 'lobby' ? qrNow : null;
    var h = view();
    if (h !== lastHtml) {
      lastHtml = h; main.innerHTML = h; afterRender();
      var vv = document.getElementById('vid');
      if (vv) { var showErr = function(){ var e = document.getElementById('vidErr'); if (e) e.style.display = ''; }; vv.addEventListener('error', showErr); vv.addEventListener('loadeddata', function(){ if (!vv.videoWidth) showErr(); }); }
    }
    syncVideo();
  }
  // 動画：管理者の再生・一時停止・最初からに合わせる（ずれが1秒を超えたら位置を合わせ直す）
  function syncVideo(){
    var v = document.getElementById('vid');
    if (!v || !S || !S.video) { IB2A.stopTrack(); return; }
    if (S.blackout) { IB2A.stopTrack(); if (!v.paused) v.pause(); return; }
    var want = S.video.playing ? S.video.offset + (IB2N.now() - S.video.at) / 1000 : S.video.offset;
    var aud = S.step && S.step.audio;
    if (aud) {
      // 別音源あり：映像は常に無音、曲は Web Audio で同じ位置から鳴らす（0.25秒以上ずれたら合わせ直す）
      v.muted = true;
      IB2A.preloadTrack(aud);
      if (S.video.playing) { var tp = IB2A.trackPos(); if (tp < 0 || Math.abs(tp - want) > 0.25) IB2A.playTrack(aud, want); }
      else IB2A.stopTrack();
    }
    if (v.duration && want > v.duration) want = v.duration;
    if (Math.abs((v.currentTime || 0) - want) > 1) { try { v.currentTime = Math.max(0, want); } catch (e) {} }
    // 一度でも画面をクリックしていれば音ありで再生できる。クリック前は無音で流し、クリックした瞬間に音ありへ戻す
    if (!aud && v.muted && userActed()) v.muted = false;
    if (S.video.playing && v.paused && !v.ended) { var p = v.play(); if (p && p.catch) p.catch(function(){ v.muted = true; v.play().catch(function(){}); }); }
    if (!S.video.playing && !v.paused) v.pause();
    var hint = document.getElementById('vidMute');
    if (hint) hint.style.display = (aud ? !IB2A.ready() : v.muted) && S.video.playing ? '' : 'none';
  }
  var prevQr = null, qrAnim = false;
  var acted = false;
  function userActed(){ try { if (navigator.userActivation && navigator.userActivation.hasBeenActive) return true; } catch (e) {} return acted; }
  document.addEventListener('pointerdown', function(){ acted = true; IB2A.unlock(); var v = document.getElementById('vid'); if (v && v.muted && !(S && S.step && S.step.audio)) { v.muted = false; if (!v.paused) v.play().catch(function(){}); } syncVideo(); }, true);
  setInterval(syncVideo, 1000);

  function view(){
    if (S.stage === 'lobby') {
      var names = []; S.teams.forEach(function(t){ t.members.forEach(function(m){ names.push(m.name); }); });
      var logo = '<div class="bigLogo neon">ITABASHI<br>BATTLE<b class="two">2</b></div>';
      if (!S.lobbyQr) return '<div class="lobby qrOff"><div class="logoSide">' + logo + '</div></div>';
      return '<div class="lobby' + (qrAnim ? ' qrIn' : '') + '"><div class="logoSide">' + logo
        + '<div class="sub">繁忙期勉強会　チーム対抗バトル</div><div class="cnt">参戦 <b class="neon">' + S.joined + '</b> 人</div>'
        + '<div class="names">' + names.map(function(n){ return '<span>' + escH(n) + '</span>'; }).join('') + '</div></div>'
        + '<div class="qrSide"><div class="kick">SCAN TO JOIN</div><div class="qr">' + QR + '</div><div class="sub" style="font-size:1.5cqw">スマホで読み取って、社員番号を入力！</div></div></div>';
    }
    if (S.stage === 'reveal') {
      return '<div class="kick">TEAM ANNOUNCEMENT</div><div class="teams">' + S.teams.map(function(t, i){
        return '<div class="tc t' + t.team + ' pop" style="animation-delay:' + (i * 0.25) + 's"><div class="L neon">' + t.team + '</div>'
          + t.members.map(function(m, j){ return '<div class="m rise" style="animation-delay:' + (0.6 + i * 0.25 + j * 0.12) + 's">' + escH(m.name) + '</div>'; }).join('') + '</div>';
      }).join('') + '</div><div class="sub" style="font-size:2.4cqw;color:var(--ink)">チームメンバーで集まろう！</div>';
    }
    if (S.stage === 'setup') {
      return '<div class="kick">TEAM SETUP</div><div class="teams">' + S.teams.map(function(t){
        var done = t.leader && t.name;
        return '<div class="tc t' + t.team + '"><div class="L neon">' + t.team + '</div>'
          + '<div class="k">LEADER</div>' + (t.leader ? '<div class="v pop">' + escH(t.leaderName) + '</div>' : '<div class="w blink">代表者 選出中…</div>')
          + '<div class="k" style="margin-top:2cqh">TEAM NAME</div>' + (t.name ? '<div class="v pop">' + escH(t.name) + '</div>' : '<div class="w blink">' + (t.leader ? 'チーム名 考え中…' : '―') + '</div>')
          + (done ? '<div class="ok" style="margin-top:auto">READY</div>' : '') + '</div>';
      }).join('') + '</div><div class="sub" style="font-size:2.2cqw;color:var(--ink)">代表者を決めて、チーム名を決めよう！</div>';
    }
    if (S.stage === 'step' && S.step) return stepView();
    return '';
  }
  function kindName(st){ return { buzzer: '早押しクイズ', choice: st.survival ? '○×サバイバル' : '選択クイズ', number: 'ピタリ賞', order: '並べ替えクイズ', vote: '投票タイム', qbox: '質問箱', mygrowth: 'わたしの成長', mysales: 'わたしの売上', ranking: 'ランキング発表', timeattack: '車椅子タイムアタック', scoreboard: '得点発表', prizes: '景品発表', announce: '発表', title: '' }[st.kind] || ''; }

  function stepView(){
    var st = S.step, q = S.q, ph = S.phase;
    if (st.kind === 'mygrowth' || st.kind === 'mysales') return '<div class="kick">' + (st.kind === 'mygrowth' ? 'YOUR GROWTH' : 'MY SALES') + '</div><div class="title neon pop">' + escH(st.title) + '</div>'
      + '<div class="sub" style="font-size:3cqw;color:var(--ink);margin-top:4cqh">自分のスマホを見てみよう！</div>'
      + '<div class="sub" style="font-size:1.8cqw">' + (st.kind === 'mygrowth' ? '1乗務あたりの平均売上が、月度ごとにどれだけ伸びたかが表示されます' : '日ごとの売上の記録を見て、CSVで保存できます') + '</div>'
      + '<div class="sub" style="font-size:1.5cqw;margin-top:3cqh">あなたのデータは、あなたのスマホにだけ表示されます</div>';
    if (st.kind === 'video') return st.video ? '<div class="vidWrap"><video id="vid" src="' + escH(st.video) + '" playsinline preload="auto"></video><div id="vidMute" style="display:none;position:absolute;right:2cqw;bottom:2cqh;padding:1cqh 1.4cqw;border-radius:999px;background:rgba(0,0,0,.6);color:#fff;font-size:1.3cqw;font-weight:800;">音が出ていません　画面をクリックすると音が出ます</div><div class="none" id="vidErr" style="display:none;position:absolute;text-align:center;line-height:2">この動画はこのブラウザでは再生できない形式です<br><small>MP4（H.264）で書き出して、アップロードし直してください</small></div></div>' : '<div class="vidWrap"><div class="none">NO VIDEO</div></div>';
    if (st.kind === 'formal') {
      // 中身が見出しだけなら表紙、本文か画像があれば講座ページ
      var NL2 = String.fromCharCode(10);
      if (!st.body && !st.image) return '<div class="fml"><div class="cover">' + (st.kicker ? '<div class="k">' + escH(st.kicker) + '</div>' : '') + '<div class="t">' + escH(st.title).split(NL2).join('<br>') + '</div><div class="rule"></div>'
        + (st.subtitle ? '<div class="s">' + escH(st.subtitle).split(NL2).join('<br>') + '</div>' : '') + '</div>' + (st.footer ? '<div class="foot">' + escH(st.footer) + '</div>' : '') + '</div>';
      var lines = String(st.body || '').split(NL2).filter(function(x){ return x.trim(); });
      return '<div class="fml"><div class="lec"><div class="bar"></div>' + (st.kicker ? '<div class="k">' + escH(st.kicker) + '</div>' : '') + '<div class="t">' + escH(st.title) + '</div>' + (st.subtitle ? '<div class="s">' + escH(st.subtitle) + '</div>' : '')
        + '<div class="bd"><ul>' + lines.map(function(l){ var plain = /^[ 　]/.test(l); return '<li' + (plain ? ' class="plain"' : '') + '>' + escH(l.trim()) + '</li>'; }).join('') + '</ul>' + (st.image ? '<img src="' + escH(st.image) + '">' : '') + '</div>'
        + (st.footer ? '<div class="foot">' + escH(st.footer) + '</div>' : '') + '</div></div>';
    }
    if (st.kind === 'title') {
      return '<div class="kick">ROUND ' + (S.stepIdx + 1) + '</div><div class="title neon pop">' + escH(st.title) + '</div>'
        + (st.subtitle ? '<div class="sub" style="color:var(--ink);font-size:2.6cqw">' + escH(st.subtitle) + '</div>' : '')
        + (st.body ? '<div class="sub">' + escH(st.body).split(String.fromCharCode(10)).join('<br>') + '</div>' : '')
        + (st.image ? '<img class="titleImg" src="' + escH(st.image) + '">' : '')
        + (S.timerEnd ? '<div class="timerBig" id="tbig"></div>' : '');
    }
    if (ph === 'intro') return '<div class="splash"><div class="k2 neon">ROUND ' + (S.stepIdx + 1) + '</div><div class="title neon pop" style="margin-top:2cqh">' + escH(st.title) + '</div><div class="sub" style="font-size:2.4cqw">' + kindName(st) + (st.mode === 'leader' ? '　｜　代表者が回答' : '') + (q ? '　｜　全' + S.qCount + '問' : '') + '</div></div>';
    if (st.kind === 'buzzer' && q) return buzzerView();
    if (['choice', 'number', 'order', 'vote'].indexOf(st.kind) >= 0 && q) return quizView();
    if (st.kind === 'qbox') return qboxView();
    if (st.kind === 'ranking' || st.kind === 'timeattack') return rankView();
    if (st.kind === 'prizes') return prizeView();
    if (st.kind === 'announce') return announceView();
    if (st.kind === 'scoreboard') return scoreView();
    return '<div class="title">' + escH(st.title) + '</div>';
  }

  function buzzerView(){
    var st = S.step, q = S.q, ph = S.phase;
    var no = '<div class="qno">Q' + q.no + ' / ' + S.qCount + '　' + q.points + 'pt</div>';
    if (ph === 'ready') return no + '<div class="title neon pop">第' + q.no + '問</div><div class="sub">画像が出たら早押し！</div>';
    var img = q.image ? '<div class="qimgBox' + (ph === 'open' && st.zoom ? ' zoom' : '') + (ph !== 'open' ? ' small' : '') + '" id="qimg"><img src="' + escH(q.image) + '"></div>' : '';
    var pr = q.prompt ? '<div class="qtext" style="margin-top:2cqh;font-size:' + (ph === 'open' ? 3 : 2.2) + 'cqw">' + escH(q.prompt) + '</div>' : '';
    if (ph === 'open') return no + img + pr + '<div class="live blink">PUSH THE BUTTON!</div>';
    var list = '<div class="buzzList">' + (S.buzz || []).slice(0, 6).map(function(b, i){
      return '<div class="bz t' + b.team + (i === S.buzzCursor && ph === 'judge' ? ' cur' : '') + (b.locked ? ' lock' : '') + '" style="animation-delay:' + (i * 0.12) + 's"><span class="r">' + (i + 1) + '</span><span class="tg">' + b.team + '</span><span class="nm">' + escH(b.name) + '</span><span class="tm">' + fmtSec(b.show) + 's</span></div>';
    }).join('') + '</div>';
    if (ph === 'judge') return no + '<div class="judge"><div>' + img + pr + '</div>' + list + '</div>';
    if (ph === 'reveal') {
      var w = S.result && S.result.winner, win = (S.buzz || []).filter(function(b){ return b.emp === w; })[0];
      return no + '<div class="judge"><div>' + img + '</div><div><div class="kick">ANSWER</div><div class="ans neon pop">' + escH(q.answerText || '') + '</div>'
        + (win ? '<div class="sub" style="color:var(--ink)">正解 <b style="color:var(--t' + win.team + ')">' + escH(win.name) + '</b>（チーム' + win.team + '）</div>' : '<div class="sub">正解者なし</div>')
        + (q.note ? '<div class="note">' + escH(q.note) + '</div>' : '') + '</div></div>';
    }
    return no;
  }

  function quizView(){
    var st = S.step, q = S.q, ph = S.phase, r = S.result || {};
    var no = '<div class="qno">Q' + q.no + ' / ' + S.qCount + (st.kind === 'vote' ? '' : '　' + q.points + 'pt') + (st.survival && S.survivors != null ? '　｜　残り ' + S.survivors + ' 人' : '') + '</div>';
    var img = q.image ? '<div class="qimgBox small" style="margin-bottom:2cqh"><img src="' + escH(q.image) + '"></div>' : '';
    var qt = '<div class="qtext">' + escH(q.prompt) + '</div>';
    var ring = ph === 'open' ? '<div class="ring" id="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="8"/><circle id="rc" cx="50" cy="50" r="44" fill="none" stroke="var(--yellow)" stroke-width="8" stroke-linecap="round" stroke-dasharray="276.5" stroke-dashoffset="0"/></svg><div class="tx" id="rt"></div></div>' : '';
    var ansd = (ph === 'open' || ph === 'closed') ? '<div class="ansd">ANSWERED<b>' + (S.answered || 0) + ' / ' + (S.targets || 0) + '</b></div>' : '';
    var rev = ph === 'reveal' || ph === 'survived';
    if (st.kind === 'choice' || st.kind === 'vote') {
      var dist = r.dist || [], tot = dist.reduce(function(a, b){ return a + b; }, 0) || 1;
      var chs = '<div class="chs' + (q.choices.length > 4 ? ' one' : '') + '">' + q.choices.map(function(c, i){
        var cls = rev && st.kind === 'choice' ? (String(i) === String(q.answer) ? ' win' : ' dim') : '';
        return '<div class="c' + cls + '">' + (rev ? '<div class="bar" style="width:' + Math.round((dist[i] || 0) / tot * 100) + '%"></div>' : '') + '<span class="i">' + 'ABCD'.charAt(i) + '</span><span>' + escH(c) + '</span>' + (rev ? '<span class="cn">' + (dist[i] || 0) + '</span>' : '') + '</div>';
      }).join('') + '</div>';
      var extra = '';
      if (rev && st.kind === 'choice') {
        extra = '<div class="sub" style="color:var(--ink)">正解 <b class="num" style="color:var(--green)">' + (r.correct || []).length + '</b> 人' + (r.eliminated && r.eliminated.length ? '　｜　脱落 <b class="num" style="color:var(--pink)">' + r.eliminated.length + '</b> 人' : '') + '</div>';
        if (ph === 'survived') extra = '<div class="winner neon pop" style="margin-top:2cqh">SURVIVORS</div><div class="sub" style="color:var(--ink);font-size:2.4cqw">生き残り ' + (S.survivors || 0) + ' 人！</div>';
      }
      return ring + ansd + no + img + qt + chs + (rev && q.note ? '<div class="note">' + escH(q.note) + '</div>' : '') + extra;
    }
    if (st.kind === 'number') {
      if (!rev) return ring + ansd + no + img + qt + '<div class="sub" style="font-size:2.6cqw;color:var(--ink)">数字で回答！（' + escH(st.unit || '') + '）</div>';
      var list = (r.ranked || []).slice(0, 5);
      return no + qt + '<div class="kick" style="margin-top:2cqh">ANSWER</div><div class="ans neon pop">' + escH(q.answerText) + '</div><div class="rk" style="margin-top:2cqh;width:60cqw">'
        + list.map(function(x, i){ return '<div class="row t' + x.team + (x.diff === 0 ? ' top1' : '') + '" style="animation-delay:' + (i * 0.15) + 's"><span class="p">' + (i + 1) + '</span><span class="nm" style="color:var(--tc)">' + escH(x.name) + '</span><span class="v">' + x.val + escH(st.unit || '') + '</span><span class="sm">' + (x.diff === 0 ? 'ピタリ！' : '差 ' + x.diff) + '</span></div>'; }).join('') + '</div>';
    }
    if (st.kind === 'order') {
      if (!rev) return ring + ansd + no + qt + '<div class="rk" style="margin-top:3cqh;width:60cqw">' + q.choices.map(function(c){ return '<div class="row"><span class="nm">' + escH(c.text) + '</span></div>'; }).join('') + '</div>';
      var cs = (r.correct || []);
      return no + qt + '<div class="kick" style="margin-top:2cqh">ANSWER</div><div class="rk" style="width:60cqw">' + (q.answerText || '').split(' → ').map(function(t, i){ return '<div class="row" style="animation-delay:' + (i * 0.15) + 's"><span class="p">' + (i + 1) + '</span><span class="nm">' + escH(t) + '</span></div>'; }).join('') + '</div>'
        + '<div class="sub" style="color:var(--ink)">正解 ' + cs.length + ' 人' + (cs[0] ? '　｜　最速 <b style="color:var(--t' + cs[0].team + ')">' + escH(cs[0].name) + '</b> ' + fmtSec(cs[0].ms) + 's' : '') + '</div>';
    }
    return no + qt;
  }

  function qboxView(){
    var list = S.qbox || [], p = list.filter(function(x){ return x.id === S.picked; })[0];
    if (p) return '<div class="kick">QUESTION</div><div class="picked t' + p.team + ' pop">' + escH(p.text) + '</div><div class="sub">チーム' + p.team + ' より</div>';
    return '<div class="title neon" style="font-size:4.4cqw">' + escH(S.step.title) + '</div><div class="sub">' + (S.phase === 'open' ? 'スマホから質問を送ろう！「聞きたい」で投票もできる' : '受付終了') + '</div>'
      + '<div class="qwall">' + list.slice(0, 9).map(function(x, i){ return '<div class="qq t' + x.team + '" style="animation-delay:' + (i * 0.05) + 's;border-color:color-mix(in srgb,var(--tc) 50%,transparent)">' + escH(x.text) + '<div class="lk">♥ ' + x.likes + '</div></div>'; }).join('') + '</div>';
  }

  function rankView(){
    var st = S.step, items = (S.items || []).slice().sort(function(a, b){ return a.rank - b.rank; }), total = S.total || 0, n = S.revealN || 0;
    var rows = [];
    for (var r = 1; r <= total; r++) {
      var it = items.filter(function(x){ return x.rank === r; })[0];
      var isNew = it && r === total - n + 1;
      if (!it) { rows.push('<div class="row hid"><span class="p">' + r + '</span><span class="nm">？？？</span></div>'); continue; }
      var val = st.kind === 'timeattack' ? '<span class="v">' + fmtTA(it.seconds) + '</span>' : (it.sub ? '<span class="sm">' + escH(it.sub) + '</span>' : '');
      rows.push('<div class="row' + (r === 1 ? ' top1' : '') + (isNew ? ' new' : '') + '"><span class="p">' + r + '</span>' + (it.image ? '<img src="' + escH(it.image) + '">' : '') + '<span class="nm">' + escH(it.name) + (it.note ? '<span class="sm">' + escH(it.note) + '</span>' : '') + '</span>' + val + '</div>');
    }
    var sz = total > 8 ? 'font-size:.8em' : '';
    return '<div class="title neon" style="font-size:3.6cqw;margin-bottom:2cqh">' + escH(st.title) + '</div><div class="rk" style="' + sz + '">' + rows.join('') + '</div>';
  }

  // 発表：予告の文 → 画像・動画つきで発表
  function announceView(){
    var st = S.step, NL = String.fromCharCode(10);
    var br = function(t){ return escH(t).split(NL).join('<br>'); };
    if (!(S.revealN >= 1)) {
      var lines = String(st.teaser || st.title).split(NL).filter(function(x){ return x.trim(); });
      return '<div class="ann">' + lines.map(function(l, i){ return '<div class="ln neon" style="animation-delay:' + (i * 1.2) + 's">' + escH(l) + '</div>'; }).join('') + '<div class="dots blink">・・・</div></div>';
    }
    if (st.video) return '<div class="vidWrap"><video id="vid" src="' + escH(st.video) + '" playsinline preload="auto"></video>'
      + ((st.reveal || st.body) ? '<div class="vidCap">' + (st.reveal ? '<div class="big">' + br(st.reveal) + '</div>' : '') + (st.body ? '<div class="body">' + br(st.body) + '</div>' : '') + '</div>' : '')
      + '<div id="vidMute" style="display:none;position:absolute;right:2cqw;top:2cqh;padding:1cqh 1.4cqw;border-radius:999px;background:rgba(0,0,0,.6);color:#fff;font-size:1.3cqw;font-weight:800;z-index:3">音が出ていません　画面をクリックすると音が出ます</div>'
      + '<div class="none" id="vidErr" style="display:none;position:absolute;text-align:center;line-height:2">この動画はこのブラウザでは再生できない形式です</div></div>';
    return '<div class="annR' + (st.image ? ' withImg' : '') + '">' + (st.reveal ? '<div class="big neon">' + br(st.reveal) + '</div>' : '')
      + (st.image ? '<img src="' + escH(st.image) + '">' : '') + (st.body ? '<div class="body">' + br(st.body) + '</div>' : '') + '</div>';
  }
  // 景品発表：賞ごとに決めた順番（受賞者・景品の文・画像・画像だけ全画面）で1つずつ出す。次に出るものは「…」で引っぱる
  function prizeCur(){
    var items = S.items || [], n = S.revealN || 0;
    for (var i = 0; i < items.length; i++) { var it = items[i]; if (n > it.start && n <= it.start + it.steps.length) return it; }
    return null;
  }
  function prizeView(){
    var st = S.step, items = S.items || [], n = S.revealN || 0, NL = String.fromCharCode(10);
    var head = '<div class="kick">PRIZE</div><div class="title neon" style="font-size:3.4cqw">' + escH(st.title) + '</div>';
    var it = prizeCur();
    if (!n || !it) return '<div class="pz">' + head + '<div class="done">' + items.map(function(x){ return '<span><b>' + escH(x.label) + '</b>　？？？</span>'; }).join('') + '</div><div class="tease blink">まもなく発表！</div></div>';
    var seq = it.seq, steps = it.steps, k = it.k, latest = steps[k - 1], next = steps[k], w = it.win;
    var byLine = seq.indexOf('lines') >= 0;
    // いま出したものだけアニメーションさせる（前に出したものは止めたまま）
    var anim = function(part){ return part === latest ? '' : ' still'; };
    var plines = it.prizeOn ? String(it.prize || '').split(NL).filter(function(x){ return x.trim(); }) : [];
    var hasGift = it.prizeOn || (it.imgOn && it.image);
    var cls = hasGift ? ' rev' + (plines.length > 2 || (it.image && it.imgOn && plines.length > 1) ? ' many' : '') : '';
    var h = '<div class="pz' + cls + '">' + head + '<div class="lbl neon' + (k === 1 ? ' pop' : ' still') + '">' + escH(it.label || '') + '</div>';
    // 1つの部品（受賞者／景品の文・画像）のHTML。textOnly=全画面画像の上に重ねるとき（画像は背景なので文字だけ）
    var block = function(part, textOnly){
      if (part === 'lines') part = 'prize';
      if (part === 'winner') {
        if (it.winOn && w) {
          var a = anim('winner');
          if (w.kind === 'team') return '<div class="win pop' + a + ' t' + w.team + '" style="color:var(--tc)">' + escH(w.name) + '<small>' + (w.tie ? '同点で受賞' : 'TEAM ' + w.team) + '　' + escH(w.sub) + ' pt</small></div><div class="mems' + a + '">' + (w.members || []).map(function(m){ return '<span>' + escH(m) + '</span>'; }).join('') + '</div>';
          return '<div class="win pop' + a + '">' + escH(w.name) + (w.kind === 'ta' ? '<small>' + fmtTA(Number(w.sub)) + '</small>' : '') + '</div>';
        }
        return next === 'winner' ? '<div class="tease blink">受賞するのは…</div>' : '';
      }
      var showImg = !textOnly && it.imgOn && it.image;
      if (it.prizeOn || showImg) {
        // 1行ずつのときは、いま出した行だけが下からせり上がる。まとめて出すときは0.7秒ずつ順に
        var lineCls = function(i){ return byLine ? (latest === 'line' + i ? '' : ' still') : anim('prize'); };
        var lineDelay = function(i){ return byLine ? 0 : i * 0.7; };
        var lastLine = byLine && latest === 'line' + (plines.length - 1);
        var ta = byLine ? (lastLine ? '' : ' still') : anim('prize');
        var imgPart = seq.indexOf('image') >= 0 ? 'image' : byLine ? 'line' + (plines.length - 1) : 'prize';
        var ia = anim(imgPart);
        if (!plines.length && !showImg) return '';
        return '<div class="gift' + (showImg && plines.length ? '' : ' noimg') + '">' + (plines.length ? '<div>' + plines.map(function(l, i){ return '<div class="ln neon' + lineCls(i) + '" style="animation-delay:' + lineDelay(i) + 's">' + escH(l) + '</div>'; }).join('')
          + (it.note ? '<div class="nt' + ta + '" style="animation-delay:' + (byLine ? 0.4 : plines.length * 0.7) + 's">' + escH(it.note) + '</div>' : '') + '</div>' : '')
          + (showImg ? '<img class="' + ia + '" src="' + escH(it.image) + '" style="animation-delay:' + (ia || byLine ? 0.3 : plines.length * 0.7) + 's' + (plines.length ? '' : ';max-height:52cqh;max-width:70cqw') + '">' : '') + '</div>';
      }
      return (next === 'prize' || next === 'line0' || (next === 'image' && seq.indexOf('prize') < 0 && !byLine)) ? '<div class="tease blink">景品は…</div>' : '';
    };
    // 景品の文と画像は1つの枠にまとめる（並びの中で先に来た方の位置に置く）
    var place = function(parts, textOnly){
      var out = '', giftDone = false;
      parts.forEach(function(part){
        if (part === 'full') return;
        if (part !== 'winner') { if (giftDone) return; giftDone = true; }
        out += block(part, textOnly);
      });
      return out;
    };
    var fi = seq.indexOf('full');
    // 全画面より後に出すものは、全画面の画像の上に重ねて出す（下の通常画面は全画面に隠れるため）
    var afterFull = fi >= 0 ? seq.slice(fi + 1) : [];
    h += place(fi >= 0 ? seq.slice(0, fi).concat(afterFull) : seq, false);
    var past = items.filter(function(x){ return x.start < it.start; });
    if (past.length) h += '<div class="done">' + past.map(function(x){ return '<span><b>' + escH(x.label) + '</b>　' + escH(x.win ? x.win.name : '') + '　' + escH(String(x.prize || '').split(NL)[0]) + '</span>'; }).join('') + '</div>';
    h += '</div>';
    // 画像だけを最大サイズで（今回出したときだけ、元の大きさからぐっと大きくなる）
    if (it.full && it.image) {
      var cap = place(afterFull, true);
      var fullStep = steps.indexOf('full'), dim = k > fullStep + 1;
      h += '<div class="fullImg' + (latest === 'full' ? ' grow' : '') + (dim ? ' dim' : '') + '"><img src="' + escH(it.image) + '">'
        + (cap ? '<div class="fullCap"><div class="pz rev' + (latest === 'full' ? ' late' : '') + '">' + cap + '</div></div>' : '') + '</div>';
    }
    return h;
  }
  function scoreView(){
    var st = S.step, n = S.revealN || 0;
    var sorted = S.teams.slice().sort(function(a, b){ return b.score - a.score; });
    var max = Math.max(1, sorted[0] ? sorted[0].score : 1);
    var rankOf = {}; sorted.forEach(function(t, i){ rankOf[t.team] = i + 1; });
    var cols = S.teams.map(function(t){
      var rk = rankOf[t.team], show = rk > 4 - n;
      return '<div class="col t' + t.team + (show ? '' : ' hid') + '"><div class="rkb">' + (show ? rk + '位' : '') + '</div><div class="pt">' + (show ? t.score : '?') + '</div><div class="bar" style="height:' + (show ? Math.max(8, Math.round(t.score / max * 85)) : 8) + '%"></div><div class="nm">' + escH(t.name || 'チーム' + t.team) + '</div></div>';
    }).join('');
    var win = n >= 4 ? '<div class="winner neon pop">' + (st.final ? 'CHAMPION' : 'TOP') + '</div><div class="title neon pop" style="font-size:4.6cqw;color:var(--t' + sorted[0].team + ');--glow:var(--t' + sorted[0].team + ')">' + escH(sorted[0].name || 'チーム' + sorted[0].team) + '</div>' : '<div class="title neon" style="font-size:4cqw">' + escH(st.title) + '</div>';
    return win + '<div class="score4" style="margin-top:2cqh">' + cols + '</div>';
  }

  function afterRender(){
    var st = S.step;
    var z = document.getElementById('qimg');
    if (z && z.classList.contains('zoom') && S.q) {
      var dur = Math.max(5, S.q.timeLimit || 20), el = (IB2N.now() - S.openAt) / 1000;
      var img = z.querySelector('img'); img.style.setProperty('--zd', dur + 's'); img.style.animationDelay = (-el) + 's';
      z.style.setProperty('--zd', dur + 's');
    }
    if (S.stage === 'step' && st && st.kind === 'scoreboard' && st.final && S.revealN >= 4 && prevRevealN < 4) confetti();
    if (S.stage === 'step' && st && st.kind === 'announce' && S.revealN === 1 && prevRevealN === 0) confetti();
    if (S.stage === 'step' && st && st.kind === 'prizes' && S.revealN > prevRevealN && prevRevealN >= 0) {
      var pc = prizeCur(), lp = pc ? pc.steps[pc.k - 1] : '';
      if (lp === 'winner' || ((lp === 'prize' || lp.indexOf('line') === 0) && pc.k === pc.steps.length)) confetti();
    }
    if (S.stage === 'step' && st && (st.kind === 'ranking' || st.kind === 'timeattack') && S.revealN >= S.total && S.total && prevRevealN < S.total) confetti();
    prevRevealN = S.revealN || 0;
  }
  setInterval(function(){
    if (!S) return;
    var rc = document.getElementById('rc'), rt = document.getElementById('rt');
    if (rc && S.deadline && S.q) {
      var left = Math.max(0, S.deadline - IB2N.now()), tot = Math.max(1, (S.q.timeLimit || 20) * 1000);
      rc.setAttribute('stroke-dashoffset', String(276.5 * (1 - left / tot)));
      var sec = Math.ceil(left / 1000); rt.textContent = sec;
      if (sec <= 5 && sec > 0 && sec !== tickSec) { tickSec = sec; IB2A.sfx(sec <= 3 ? 'count' : 'tick'); }
    }
    var tb = document.getElementById('tbig');
    if (tb && S.timerEnd) { var l = Math.max(0, S.timerEnd - IB2N.now()); tb.textContent = Math.floor(l / 60000) + ':' + ('0' + Math.floor(l / 1000) % 60).slice(-2); }
  }, 200);

  function confetti(){
    var cv = document.getElementById('confetti'), st = document.getElementById('stage');
    cv.width = st.clientWidth; cv.height = st.clientHeight;
    var g = cv.getContext('2d'), cols = ['#ff3b6b', '#2fd3ff', '#ffd23f', '#7cff6b', '#9b6bff', '#ffffff'], ps = [];
    for (var i = 0; i < 260; i++) ps.push({ x: Math.random() * cv.width, y: -Math.random() * cv.height * 0.6, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, w: 6 + Math.random() * 8, h: 10 + Math.random() * 10, c: cols[i % cols.length] });
    var t0 = performance.now();
    (function f(){
      var t = performance.now() - t0; g.clearRect(0, 0, cv.width, cv.height);
      ps.forEach(function(p){ p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vy += 0.03; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.globalAlpha = Math.max(0, 1 - t / 7000); g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); });
      if (t < 7000) requestAnimationFrame(f); else g.clearRect(0, 0, cv.width, cv.height);
    })();
  }
})();
</script></body></html>`;
}
