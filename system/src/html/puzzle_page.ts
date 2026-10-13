// ホシコンパズル ゲーム画面（公開ページのHTML/CSS/JS）
// 配置はパズドラ風: 上に敵（大きく）→ 味方の並び＋チームHP → 下に大きな盤面（6×5）。
// 初回だけチュートリアル（スライド式・ホームの「あそびかた」からも再表示可）。
// ルート・APIは routes/public_puzzle.ts。クライアントJSはテンプレートリテラル内なので
// バックスラッシュとバッククォートは使わない（エスケープ事故防止）。
import { FAVICON_DATA_URI } from './layout';

export function puzzlePageHtml(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#0b1020">
<title>ホシコンパズル</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@700;900&family=Rubik:wght@700;900&display=swap">
<style>
  :root {
    --bg: #0b1020; --panel: rgba(17, 24, 48, 0.85); --line: rgba(148, 163, 184, 0.18);
    --gold: #fbbf24; --gold2: #f59e0b; --text: #eef2ff; --muted: #94a3b8;
    --fire: #ff5a5f; --water: #3fa9ff; --wood: #41d47d; --light: #ffd93d; --dark: #b66dff; --heart: #ff6fae;
    --sat: env(safe-area-inset-top); --sab: env(safe-area-inset-bottom);
  }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); min-height: 100%; }
  body { font-family: 'M PLUS Rounded 1c', 'Hiragino Sans', 'Meiryo', sans-serif; font-weight: 700; overscroll-behavior: none; }
  body::before { content: ''; position: fixed; inset: 0; z-index: -2;
    background: radial-gradient(1200px 600px at 20% -10%, #2a1d6e 0%, transparent 60%), radial-gradient(900px 500px at 110% 20%, #0e3a5f 0%, transparent 55%), radial-gradient(800px 600px at 50% 120%, #3b0f3f 0%, transparent 60%), var(--bg);
    animation: bgmove 18s ease-in-out infinite alternate; }
  @keyframes bgmove { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(25deg); } }
  body::after { content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none; opacity: 0.5;
    background-image: radial-gradient(1.5px 1.5px at 12% 20%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 70% 35%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 40% 70%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 85% 80%, #fff 50%, transparent 51%), radial-gradient(1px 1px at 25% 90%, #fff 50%, transparent 51%), radial-gradient(1.2px 1.2px at 60% 10%, #fff 50%, transparent 51%);
    animation: twinkle 4s ease-in-out infinite alternate; }
  @keyframes twinkle { from { opacity: 0.25; } to { opacity: 0.6; } }

  .wrap { max-width: 480px; margin: 0 auto; padding: calc(12px + var(--sat)) 12px calc(24px + var(--sab)); min-height: 100vh; }
  .scr { display: none; animation: fadein 0.35s ease; } .scr.on { display: block; }
  @keyframes fadein { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  .logo { text-align: center; margin: 6px 0 14px; }
  .logo .t { font-family: 'Rubik', 'M PLUS Rounded 1c', sans-serif; font-size: 30px; font-weight: 900; letter-spacing: 0.04em;
    background: linear-gradient(180deg, #fff7d6 0%, #fbbf24 45%, #d97706 100%); -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 3px 0 rgba(120, 53, 15, 0.6)) drop-shadow(0 6px 14px rgba(251, 191, 36, 0.35)); }
  .logo .s { font-size: 12px; color: var(--muted); margin-top: 2px; letter-spacing: 0.12em; }

  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 16px 14px; margin-bottom: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06); backdrop-filter: blur(8px); }
  .card h2 { font-size: 15px; margin: 0 0 10px; color: var(--gold); letter-spacing: 0.04em; }
  label.f { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  input.t { width: 100%; border: 1px solid #334155; border-radius: 12px; padding: 13px 14px; font-size: 18px; font-family: inherit; font-weight: 700; background: #0b1226; color: var(--text); outline: none; transition: box-shadow 0.2s, border-color 0.2s; }
  input.t:focus { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(251,191,36,0.25); }
  .btn { display: block; width: 100%; padding: 15px; border: none; border-radius: 14px; font-size: 16px; font-weight: 900; cursor: pointer; margin-top: 10px; font-family: inherit; color: #1f1300; letter-spacing: 0.04em;
    background: linear-gradient(180deg, #ffe08a 0%, #fbbf24 50%, #f59e0b 100%); box-shadow: 0 6px 0 #b45309, 0 10px 24px rgba(251,191,36,0.3); transition: transform 0.08s, box-shadow 0.08s; }
  .btn:active { transform: translateY(4px); box-shadow: 0 2px 0 #b45309, 0 4px 12px rgba(251,191,36,0.3); }
  .btn.sec { background: linear-gradient(180deg, #4c5a7a, #2b3650); color: #eef2ff; box-shadow: 0 6px 0 #141b2d, 0 10px 24px rgba(0,0,0,0.35); }
  .btn.sec:active { box-shadow: 0 2px 0 #141b2d; }
  .btn.ghost { background: transparent; border: 1.5px solid #3b4968; color: #cbd5e1; box-shadow: none; }
  .btn.ghost:active { transform: scale(0.98); }
  .btn:disabled { opacity: 0.45; cursor: default; transform: none; }
  .err { color: #fca5a5; font-size: 13px; margin-top: 8px; min-height: 1em; }
  .who { font-size: 17px; font-weight: 900; color: var(--gold); }
  .best { font-size: 13px; color: #cbd5e1; margin-top: 4px; font-weight: 700; }
  .row { display: flex; gap: 8px; align-items: center; }
  .link { background: none; border: none; color: #93c5fd; text-decoration: underline; font-size: 13px; cursor: pointer; font-family: inherit; padding: 8px 0; font-weight: 700; }
  .help { font-size: 12px; color: var(--muted); line-height: 1.8; font-weight: 700; }

  /* ===== 属性・キャラ ===== */
  .el { display: inline-block; width: 14px; height: 14px; border-radius: 50%; vertical-align: -2px; margin-right: 3px; box-shadow: inset 0 -2px 0 rgba(0,0,0,0.3); }
  .el-fire { background: var(--fire); } .el-water { background: var(--water); } .el-wood { background: var(--wood); } .el-light { background: var(--light); } .el-dark { background: var(--dark); } .el-heart { background: var(--heart); }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .ch { position: relative; border: 2px solid #2b3650; border-radius: 16px; background: #0b1226; overflow: hidden; cursor: pointer; transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s; }
  .ch:active { transform: scale(0.96); }
  .ch.sel { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(251,191,36,0.35), 0 0 24px rgba(251,191,36,0.35); }
  .ch .ph { width: 100%; aspect-ratio: 1; background: #1e293b center/cover no-repeat; display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 900; color: #64748b; }
  .ch .nm { font-size: 12px; font-weight: 900; padding: 6px 6px 2px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ch .st { font-size: 11px; color: var(--muted); text-align: center; padding-bottom: 7px; }
  .ch .num { position: absolute; top: 6px; left: 6px; background: var(--gold); color: #1f1300; font-weight: 900; font-size: 12px; width: 22px; height: 22px; border-radius: 50%; display: none; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.4); }
  .ch.sel .num { display: flex; }
  .ch .ring { position: absolute; right: 6px; top: 6px; width: 16px; height: 16px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.5); }

  /* ===== バトル（パズドラ風レイアウト） ===== */
  #scr-battle { position: fixed; inset: 0; display: none; flex-direction: column; max-width: 480px; margin: 0 auto; padding: calc(8px + var(--sat)) 10px calc(8px + var(--sab)); }
  #scr-battle.on { display: flex; }
  body.battle .wrap, body.battle .logo { display: none; }
  .top { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #cbd5e1; padding: 2px 4px; }
  .top b { color: var(--gold); font-size: 14px; }
  .top .gu { background: none; border: 1px solid #3b4968; color: #cbd5e1; border-radius: 999px; padding: 3px 10px; font-size: 11px; font-family: inherit; font-weight: 700; }
  .arena { flex: 1; min-height: 150px; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding-bottom: 6px;
    background: radial-gradient(ellipse 70% 50% at 50% 100%, rgba(251,191,36,0.14), transparent 70%); }
  .arena.flash::before { content: ''; position: absolute; inset: 0; background: #fff; animation: flash 0.25s ease-out; pointer-events: none; }
  @keyframes flash { from { opacity: 0.8; } to { opacity: 0; } }
  .arena.hurt::before { content: ''; position: absolute; inset: 0; background: #ef4444; animation: flash 0.4s ease-out; pointer-events: none; }
  .enemy { display: flex; flex-direction: column; align-items: center; width: 100%; }
  .enemy .ph { width: min(42vw, 180px); height: min(42vw, 180px); border-radius: 50%; background: #1e293b center/cover no-repeat; border: 4px solid rgba(255,255,255,0.14);
    box-shadow: 0 0 0 6px rgba(0,0,0,0.25), 0 18px 40px rgba(0,0,0,0.5), 0 0 60px rgba(182,109,255,0.25); display: flex; align-items: center; justify-content: center; font-size: 40px; animation: float 3s ease-in-out infinite; position: relative; }
  @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
  .enemy .ph.hit { animation: shake 0.35s; filter: brightness(1.8); }
  @keyframes shake { 0%,100% { transform: translateX(0) rotate(0); } 20% { transform: translateX(-10px) rotate(-3deg); } 40% { transform: translateX(10px) rotate(3deg); } 60% { transform: translateX(-6px); } 80% { transform: translateX(6px); } }
  .enemy .ph.die { animation: die 0.8s forwards; }
  @keyframes die { to { transform: scale(0.2) rotate(20deg); opacity: 0; filter: brightness(3); } }
  .enemy .nm { font-size: 16px; font-weight: 900; margin-top: 8px; text-shadow: 0 2px 6px rgba(0,0,0,0.6); }
  .enemy .meta { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #cbd5e1; margin: 2px 0 6px; }
  .cnt { display: inline-flex; align-items: center; gap: 4px; background: #3f1d1d; color: #fecaca; font-size: 12px; font-weight: 900; padding: 2px 10px; border-radius: 999px; border: 1px solid rgba(252,165,165,0.3); }
  .cnt.soon { background: #dc2626; color: #fff; animation: pulse 0.7s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
  .bar { height: 14px; background: #0b1226; border-radius: 999px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); position: relative; width: 100%; }
  .bar > i { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, #ef4444, #f97316 60%, #fbbf24); transition: width 0.35s cubic-bezier(.2,.8,.2,1); position: relative; }
  .bar > i::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(255,255,255,0.45), transparent 50%); }
  .bar.me > i { background: linear-gradient(90deg, #16a34a, #4ade80 60%, #bbf7d0); }
  .bar.low > i { background: linear-gradient(90deg, #991b1b, #ef4444); }
  .enemy .bar { max-width: 320px; }
  .team { display: flex; gap: 6px; margin: 8px 0 4px; }
  .team .m { flex: 1; display: flex; flex-direction: column; align-items: center; }
  .team .m .ph { width: 56px; height: 56px; border-radius: 14px; background: #1e293b center/cover no-repeat; border: 3px solid #2b3650; position: relative; box-shadow: 0 6px 14px rgba(0,0,0,0.4); }
  .team .m .ph.atk { animation: lunge 0.4s; }
  @keyframes lunge { 30% { transform: translateY(-14px) scale(1.08); } }
  .team .m .ph .ring { position: absolute; right: -5px; bottom: -5px; width: 18px; height: 18px; border-radius: 50%; border: 2px solid #0b1020; }
  .teamhp { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #cbd5e1; margin: 4px 0 6px; }
  .teamhp b { color: #bbf7d0; min-width: 72px; text-align: right; font-size: 13px; }

  #board { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; touch-action: none; user-select: none; padding: 8px; border-radius: 18px;
    background: linear-gradient(180deg, rgba(15,23,42,0.9), rgba(2,6,23,0.95)); border: 1px solid var(--line); box-shadow: inset 0 2px 12px rgba(0,0,0,0.6), 0 -8px 30px rgba(0,0,0,0.3); position: relative; }
  .tile { aspect-ratio: 1; border-radius: 50%; position: relative; transition: transform 0.12s; box-shadow: inset 0 -6px 10px rgba(0,0,0,0.35), inset 0 2px 4px rgba(255,255,255,0.25), 0 4px 8px rgba(0,0,0,0.5); }
  .tile::after { content: ''; position: absolute; left: 22%; top: 12%; width: 32%; height: 22%; border-radius: 50%; background: rgba(255,255,255,0.55); filter: blur(1px); }
  .tile.fire { background: radial-gradient(circle at 40% 35%, #ffb3b5, var(--fire) 55%, #b91c1c); }
  .tile.water { background: radial-gradient(circle at 40% 35%, #b6ddff, var(--water) 55%, #1d4ed8); }
  .tile.wood { background: radial-gradient(circle at 40% 35%, #b8f5cf, var(--wood) 55%, #15803d); }
  .tile.light { background: radial-gradient(circle at 40% 35%, #fff4b8, var(--light) 55%, #ca8a04); }
  .tile.dark { background: radial-gradient(circle at 40% 35%, #e3c6ff, var(--dark) 55%, #6d28d9); }
  .tile.heart { background: radial-gradient(circle at 40% 35%, #ffc4dd, var(--heart) 55%, #be185d); }
  .tile.heart::before { content: '♥'; position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #fff; opacity: 0.9; font-size: 22px; line-height: 1; text-shadow: 0 1px 2px rgba(0,0,0,0.3); }
  .tile.pick { transform: scale(1.18); box-shadow: 0 0 0 3px #fff, 0 0 18px rgba(255,255,255,0.8), 0 4px 8px rgba(0,0,0,0.5); z-index: 2; }
  .tile.gone { animation: burst 0.3s forwards; }
  @keyframes burst { 40% { transform: scale(1.25); filter: brightness(2); } 100% { transform: scale(0); opacity: 0; } }
  .tile.new { animation: drop 0.3s cubic-bezier(.2,.8,.2,1.2); }
  @keyframes drop { from { transform: translateY(-40px); opacity: 0; } to { transform: none; opacity: 1; } }
  .spark { position: absolute; width: 8px; height: 8px; border-radius: 50%; pointer-events: none; animation: spark 0.5s ease-out forwards; }
  @keyframes spark { to { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; } }
  .combo { position: absolute; right: 10px; top: -8px; font-family: 'Rubik', sans-serif; font-weight: 900; font-size: 22px; color: #fff; text-shadow: 0 0 12px var(--gold), 0 2px 0 #92400e; pointer-events: none; opacity: 0; }
  .combo.on { animation: combo 0.6s ease-out; opacity: 1; }
  @keyframes combo { 0% { transform: scale(0.5) rotate(-8deg); opacity: 0; } 30% { transform: scale(1.3) rotate(3deg); opacity: 1; } 100% { transform: scale(1); } }
  .msg { text-align: center; min-height: 18px; font-size: 12px; font-weight: 700; color: var(--muted); margin-top: 6px; }
  .dmg { position: absolute; left: 50%; top: 20%; transform: translateX(-50%); font-family: 'Rubik', sans-serif; font-weight: 900; font-size: 42px; color: #fff; pointer-events: none; z-index: 5;
    text-shadow: 0 0 14px var(--gold2), 0 3px 0 #92400e, 0 6px 12px rgba(0,0,0,0.6); animation: dmg 0.9s ease-out forwards; }
  .dmg.big { font-size: 56px; color: #fff5cc; }
  .dmg.heal { color: #bbf7d0; text-shadow: 0 0 14px #22c55e, 0 3px 0 #166534; font-size: 32px; }
  .dmg.me { color: #fecaca; text-shadow: 0 0 14px #ef4444, 0 3px 0 #7f1d1d; top: auto; bottom: 90px; }
  @keyframes dmg { 0% { transform: translateX(-50%) scale(0.4); opacity: 0; } 25% { transform: translateX(-50%) scale(1.25); opacity: 1; } 70% { opacity: 1; } 100% { transform: translateX(-50%) translateY(-40px) scale(1); opacity: 0; } }
  .shake { animation: shake 0.35s; }
  .float { position: fixed; left: 0; right: 0; top: 34%; text-align: center; pointer-events: none; z-index: 20; }
  .float span { display: inline-block; font-family: 'Rubik', 'M PLUS Rounded 1c', sans-serif; font-size: 34px; font-weight: 900; color: #fff; padding: 12px 26px; border-radius: 18px;
    background: linear-gradient(180deg, rgba(251,191,36,0.95), rgba(217,119,6,0.95)); box-shadow: 0 0 40px rgba(251,191,36,0.6), 0 10px 30px rgba(0,0,0,0.5); text-shadow: 0 2px 0 #92400e; animation: pop 1.1s forwards; }
  .float span.bad { background: linear-gradient(180deg, rgba(239,68,68,0.95), rgba(153,27,27,0.95)); box-shadow: 0 0 40px rgba(239,68,68,0.6); text-shadow: 0 2px 0 #7f1d1d; }
  @keyframes pop { 0% { transform: scale(0.4); opacity: 0; } 18% { transform: scale(1.12); opacity: 1; } 80% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.05); opacity: 0; } }

  /* ===== 結果・ランキング ===== */
  .res .ttl { text-align: center; font-size: 20px; font-weight: 900; }
  .res .big { font-family: 'Rubik', sans-serif; font-size: 48px; font-weight: 900; text-align: center; margin: 8px 0 2px; line-height: 1.1;
    background: linear-gradient(180deg, #fff7d6, #fbbf24 60%, #d97706); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 4px 10px rgba(251,191,36,0.4)); animation: scorein 0.6s cubic-bezier(.2,.8,.2,1.4); }
  @keyframes scorein { from { transform: scale(0.3); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .res .nb { text-align: center; font-size: 14px; color: #86efac; margin-bottom: 8px; min-height: 1.2em; }
  .res table, .rk table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .res td, .rk td, .rk th { padding: 7px 4px; border-bottom: 1px solid rgba(148,163,184,0.15); }
  .rk th { color: var(--muted); font-size: 12px; text-align: left; }
  .rk td.n { font-family: 'Rubik', sans-serif; font-weight: 900; color: var(--gold); width: 36px; font-size: 16px; }
  .rk tr:nth-child(1) td.n { color: #ffd93d; text-shadow: 0 0 10px rgba(255,217,61,0.7); }
  .rk tr:nth-child(2) td.n { color: #e2e8f0; } .rk tr:nth-child(3) td.n { color: #d97706; }
  .rk tr.me td { background: rgba(251,191,36,0.14); }
  .crown { display: inline-block; width: 18px; height: 18px; vertical-align: -3px; background: linear-gradient(180deg, #fff7d6, #fbbf24); clip-path: polygon(10% 80%, 0 25%, 30% 50%, 50% 15%, 70% 50%, 100% 25%, 90% 80%); margin-right: 4px; }

  /* ===== チュートリアル ===== */
  #tut { position: fixed; inset: 0; z-index: 50; display: none; background: rgba(5, 8, 20, 0.86); backdrop-filter: blur(6px); align-items: center; justify-content: center; padding: 16px; }
  #tut.on { display: flex; }
  .tut-box { width: 100%; max-width: 420px; background: linear-gradient(180deg, #1a2342, #0f162d); border: 1px solid rgba(251,191,36,0.4); border-radius: 22px; padding: 20px 18px 16px; box-shadow: 0 0 60px rgba(251,191,36,0.2), 0 20px 50px rgba(0,0,0,0.6); animation: fadein 0.3s; }
  .tut-box .tag { font-size: 11px; color: var(--gold); letter-spacing: 0.2em; text-align: center; }
  .tut-box h3 { font-size: 20px; margin: 4px 0 10px; text-align: center; }
  .tut-box p { font-size: 14px; line-height: 1.8; color: #dbe3f5; margin: 0 0 10px; text-align: center; }
  .tut-demo { display: flex; justify-content: center; gap: 6px; margin: 10px auto 14px; height: 56px; align-items: center; }
  .tut-demo .tile { width: 46px; height: 46px; }
  .tut-dots { display: flex; justify-content: center; gap: 6px; margin: 6px 0 12px; }
  .tut-dots i { width: 8px; height: 8px; border-radius: 50%; background: #334155; }
  .tut-dots i.on { background: var(--gold); box-shadow: 0 0 8px var(--gold); }
  .tut-nav { display: flex; gap: 8px; }
  .tut-nav .btn { margin-top: 0; }
  .tut-badges { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; margin: 10px 0; }
  .tut-badges span { font-size: 12px; background: #0b1226; border: 1px solid #334155; border-radius: 999px; padding: 4px 10px; }
  /* デモ1: 入れかえて3つそろう */
  .d1 .a { animation: d1a 3s infinite; } .d1 .b { animation: d1b 3s infinite; }
  .d1 .r { animation: d1r 3s infinite; }
  @keyframes d1a { 0%,30% { transform: translateX(0); } 45%,100% { transform: translateX(52px); } }
  @keyframes d1b { 0%,30% { transform: translateX(0); } 45%,100% { transform: translateX(-52px); } }
  @keyframes d1r { 0%,55% { filter: none; transform: scale(1); opacity: 1; } 65% { filter: brightness(2); transform: scale(1.2); } 80%,95% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
  /* デモ2: 属性と味方 */
  .d2 { gap: 14px; }
  .d2 .ph { width: 50px; height: 50px; border-radius: 12px; background: #334155; border: 3px solid var(--fire); display: flex; align-items: center; justify-content: center; font-size: 20px; }
  .d2 .arrow { font-size: 22px; color: var(--gold); animation: pulse 1s infinite; }
  .d2 .foe { width: 50px; height: 50px; border-radius: 50%; background: #3b0f3f; border: 3px solid var(--wood); display: flex; align-items: center; justify-content: center; font-size: 20px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="logo"><div class="t" id="title">ホシコンパズル</div><div class="s">PUZZLE &amp; BATTLE</div></div>

  <!-- 参戦 -->
  <div class="scr" id="scr-reg">
    <div class="card">
      <h2>社員番号で参戦</h2>
      <label class="f">社員番号</label>
      <input class="t" id="emp" type="text" inputmode="numeric" placeholder="例: 19972301" autocomplete="off">
      <button class="btn" id="btn-lookup">次へ</button>
      <div class="err" id="err-reg"></div>
    </div>
    <div class="card">
      <h2>社員番号がない方</h2>
      <label class="f">ニックネーム（12文字まで）</label>
      <input class="t" id="nick0" type="text" maxlength="12" placeholder="例: いたばし太郎" autocomplete="off">
      <button class="btn sec" id="btn-reg-nick">ニックネームで参戦</button>
      <div class="err" id="err-reg2"></div>
    </div>
    <div class="card help">社員番号で参戦すると、別のスマホからでも同じ記録で続けられます。ニックネームだけの場合は、このスマホの記録になります。</div>
  </div>

  <!-- ニックネーム決め -->
  <div class="scr" id="scr-nick">
    <div class="card">
      <h2>ニックネームを決めよう</h2>
      <div class="who" id="nick-real"></div>
      <div class="help" style="margin:6px 0 10px;">ランキングにはこの名前が出ます（本名は出ません）。あとから変えられます。</div>
      <label class="f">ニックネーム（12文字まで）</label>
      <input class="t" id="nick1" type="text" maxlength="12" autocomplete="off">
      <button class="btn" id="btn-reg-emp">この名前で参戦</button>
      <button class="link" id="btn-back-reg">戻る</button>
      <div class="err" id="err-nick"></div>
    </div>
  </div>

  <!-- ホーム -->
  <div class="scr" id="scr-home">
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <div><div class="who" id="home-nick"></div><div class="best" id="home-best"></div></div>
        <button class="link" id="btn-rename">名前を変える</button>
      </div>
    </div>
    <div class="card">
      <h2>チーム</h2>
      <div class="team" id="home-team"></div>
      <button class="btn sec" id="btn-team">チームを組む</button>
    </div>
    <button class="btn" id="btn-start">バトル開始</button>
    <button class="btn ghost" id="btn-rank">ランキングを見る</button>
    <button class="btn ghost" id="btn-howto">あそびかた</button>
    <button class="link" id="btn-logout" style="display:block;margin:10px auto 0;">別の人で参戦する</button>
  </div>

  <!-- チーム編成 -->
  <div class="scr" id="scr-team">
    <div class="card">
      <h2>味方を<span id="team-n">3</span>人えらぶ</h2>
      <div class="help" style="margin-bottom:10px;">色（属性）をばらけさせると、いろんな玉で攻撃できます。</div>
      <div class="grid" id="ally-grid"></div>
      <button class="btn" id="btn-team-ok" disabled>決定</button>
      <button class="link" id="btn-team-back">戻る</button>
    </div>
  </div>

  <!-- 結果 -->
  <div class="scr" id="scr-result">
    <div class="card res">
      <div class="ttl" id="res-ttl"></div>
      <div class="big" id="res-score"></div>
      <div class="nb" id="res-nb"></div>
      <table>
        <tr><td>たおした敵</td><td style="text-align:right" id="res-stages"></td></tr>
        <tr><td>残りHP</td><td style="text-align:right" id="res-hp"></td></tr>
        <tr><td>手数</td><td style="text-align:right" id="res-moves"></td></tr>
        <tr><td>最大コンボ</td><td style="text-align:right" id="res-combo"></td></tr>
        <tr><td>自己ベスト</td><td style="text-align:right" id="res-best"></td></tr>
        <tr><td>いまの順位</td><td style="text-align:right" id="res-rank"></td></tr>
      </table>
    </div>
    <button class="btn" id="btn-again">もう一回</button>
    <button class="btn ghost" id="btn-res-rank">ランキングを見る</button>
    <button class="link" id="btn-res-home" style="display:block;margin:10px auto 0;">ホームへ</button>
  </div>

  <!-- ランキング -->
  <div class="scr" id="scr-rank">
    <div class="card rk">
      <h2>ランキング <span style="font-size:12px;color:var(--muted);font-weight:700;" id="rk-players"></span></h2>
      <table><thead><tr><th>順位</th><th>名前</th><th style="text-align:right">スコア</th><th style="text-align:right">回数</th></tr></thead><tbody id="rk-body"></tbody></table>
    </div>
    <button class="btn sec" id="btn-rank-back">戻る</button>
  </div>

  <div class="scr" id="scr-closed"><div class="card" style="text-align:center;color:var(--muted);">ただいま準備中です。しばらくお待ちください。</div></div>
</div>

<!-- バトル（画面固定・パズドラ風） -->
<div class="scr" id="scr-battle">
  <div class="top"><span id="stage-lbl"></span><span>手数 <b id="moves">0</b></span><button class="gu" id="btn-giveup">あきらめる</button></div>
  <div class="arena" id="arena">
    <div class="enemy">
      <div class="ph" id="en-ph"></div>
      <div class="nm" id="en-nm"></div>
      <div class="meta"><span id="en-el"></span><span>HP <b id="en-hp"></b></span><span class="cnt" id="en-cnt"></span></div>
      <div class="bar"><i id="en-bar"></i></div>
    </div>
  </div>
  <div class="team" id="bt-team"></div>
  <div class="teamhp"><div class="bar me" id="me-barwrap"><i id="me-bar"></i></div><b id="me-hp"></b></div>
  <div id="board"></div>
  <div class="msg" id="msg"></div>
</div>
<div class="float" id="float"></div>

<!-- チュートリアル -->
<div id="tut">
  <div class="tut-box">
    <div class="tag">HOW TO PLAY</div>
    <h3 id="tut-h"></h3>
    <div id="tut-body"></div>
    <div class="tut-dots" id="tut-dots"></div>
    <div class="tut-nav"><button class="btn ghost" id="tut-prev">もどる</button><button class="btn" id="tut-next">つぎへ</button></div>
  </div>
</div>

<script>
(function(){
  var API = '/api/public/puzzle';
  var LS_TOKEN = 'hoshikon_puzzle_token', LS_TEAM = 'hoshikon_puzzle_team', LS_TUT = 'hoshikon_puzzle_tut';
  var CFG = null, ME = null, TEAM = [];
  var EL_LABEL = { fire: '火', water: '水', wood: '木', light: '光', dark: '闇', heart: '回復' };
  var EL_COLOR = { fire: '#ff5a5f', water: '#3fa9ff', wood: '#41d47d', light: '#ffd93d', dark: '#b66dff' };
  var TYPES = ['fire', 'water', 'wood', 'light', 'dark', 'heart'];
  var W = 6, H = 5;

  function $(id){ return document.getElementById(id); }
  function show(id){ document.querySelectorAll('.scr').forEach(function(s){ s.classList.remove('on'); }); $(id).classList.add('on'); document.body.classList.toggle('battle', id === 'scr-battle'); window.scrollTo(0,0); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]; }); }
  function post(path, body){ return fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function(r){ return r.json(); }); }
  function elDot(e){ return '<span class="el el-' + e + '"></span>' + (EL_LABEL[e] || ''); }
  function allyPh(a, cls, ring){
    var st = a.img ? 'background-image:url(' + API + '/img/ally/' + a.id + ');background-position:' + a.ox + '% ' + a.oy + '%;background-size:' + Math.round(a.sc * 100) + '%;' : '';
    return '<div class="' + cls + '" style="' + st + '">' + (a.img ? '' : esc(a.name.charAt(0))) + (ring ? '<span class="ring" style="background:' + EL_COLOR[a.element] + '"></span>' : '') + '</div>';
  }
  function fmtBest(b){ if (!b) return 'まだ記録がありません'; return '自己ベスト ' + b.score.toLocaleString() + ' 点（' + (b.cleared ? '全クリア' : b.stages_cleared + '体たおした') + '）'; }
  function adv(att, def){
    if (att === 'fire' && def === 'wood') return 2; if (att === 'wood' && def === 'water') return 2; if (att === 'water' && def === 'fire') return 2;
    if (att === 'wood' && def === 'fire') return 0.5; if (att === 'water' && def === 'wood') return 0.5; if (att === 'fire' && def === 'water') return 0.5;
    if ((att === 'light' && def === 'dark') || (att === 'dark' && def === 'light')) return 2;
    return 1;
  }
  function vibrate(ms){ try { if (navigator.vibrate) navigator.vibrate(ms); } catch(e) {} }

  // ---------- 起動 ----------
  fetch(API + '/config').then(function(r){ return r.json(); }).then(function(cfg){
    CFG = cfg; $('title').textContent = cfg.title; document.title = cfg.title;
    if (!cfg.open) { show('scr-closed'); return; }
    var tok = null; try { tok = localStorage.getItem(LS_TOKEN); } catch(e) {}
    if (tok) { post('/me', { token: tok }).then(function(j){ if (j.nickname) { ME = { token: tok, nickname: j.nickname, best: j.best }; goHome(); } else { show('scr-reg'); } }); }
    else show('scr-reg');
  });

  // ---------- 参戦 ----------
  var pendingEmp = '';
  $('btn-lookup').onclick = function(){
    $('err-reg').textContent = '';
    var emp = $('emp').value.trim(); if (!emp) { $('err-reg').textContent = '社員番号を入力してください'; return; }
    post('/lookup', { emp_no: emp }).then(function(j){
      if (j.error) { $('err-reg').textContent = j.error; return; }
      if (j.registered) { saveToken(j.token); ME = { token: j.token, nickname: j.nickname, best: j.best }; goHome(); return; }
      pendingEmp = emp; $('nick-real').textContent = j.name + ' さん'; $('nick1').value = ''; show('scr-nick'); $('nick1').focus();
    });
  };
  $('btn-back-reg').onclick = function(){ show('scr-reg'); };
  $('btn-reg-emp').onclick = function(){
    $('err-nick').textContent = '';
    post('/register', { emp_no: pendingEmp, nickname: $('nick1').value }).then(function(j){
      if (j.error) { $('err-nick').textContent = j.error; return; }
      saveToken(j.token); ME = { token: j.token, nickname: j.nickname, best: null }; goHome(); openTut(true);
    });
  };
  $('btn-reg-nick').onclick = function(){
    $('err-reg2').textContent = '';
    post('/register', { nickname: $('nick0').value }).then(function(j){
      if (j.error) { $('err-reg2').textContent = j.error; return; }
      saveToken(j.token); ME = { token: j.token, nickname: j.nickname, best: null }; goHome(); openTut(true);
    });
  };
  function saveToken(t){ try { localStorage.setItem(LS_TOKEN, t); } catch(e) {} }
  $('btn-logout').onclick = function(){ try { localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_TEAM); } catch(e) {} ME = null; TEAM = []; $('emp').value = ''; show('scr-reg'); };
  $('btn-rename').onclick = function(){
    var n = prompt('新しいニックネーム（12文字まで）', ME.nickname); if (n === null) return;
    post('/nickname', { token: ME.token, nickname: n }).then(function(j){ if (j.error) { alert(j.error); return; } ME.nickname = j.nickname; goHome(); });
  };

  // ---------- ホーム ----------
  function allyById(id){ for (var i = 0; i < CFG.allies.length; i++) if (CFG.allies[i].id === id) return CFG.allies[i]; return null; }
  function loadTeam(){
    var ids = []; try { ids = JSON.parse(localStorage.getItem(LS_TEAM) || '[]'); } catch(e) {}
    TEAM = ids.map(allyById).filter(Boolean).slice(0, CFG.team_size);
  }
  function goHome(){
    loadTeam();
    $('home-nick').textContent = ME.nickname + ' さん';
    $('home-best').textContent = fmtBest(ME.best);
    $('home-team').innerHTML = TEAM.length ? TEAM.map(function(a){ return '<div class="m">' + allyPh(a, 'ph', true) + '<span style="font-size:11px;margin-top:4px;">' + esc(a.name) + '</span></div>'; }).join('') : '<div class="help">まだチームを組んでいません</div>';
    $('btn-start').disabled = TEAM.length < Math.min(CFG.team_size, CFG.allies.length) || CFG.enemies.length === 0 || CFG.allies.length === 0;
    if (CFG.enemies.length === 0) $('btn-start').textContent = '敵がまだいません（準備中）';
    else if (CFG.allies.length === 0) $('btn-start').textContent = '味方がまだいません（準備中）';
    else $('btn-start').textContent = 'バトル開始';
    show('scr-home');
  }
  $('btn-team').onclick = openTeam;
  $('btn-start').onclick = function(){ if (!tutSeen()) { openTut(false, startBattle); return; } startBattle(); };
  $('btn-rank').onclick = openRank; $('btn-res-rank').onclick = openRank;
  $('btn-rank-back').onclick = function(){ goHome(); };
  $('btn-res-home').onclick = function(){ goHome(); };
  $('btn-again').onclick = startBattle;
  $('btn-howto').onclick = function(){ openTut(false); };

  // ---------- チュートリアル ----------
  var TUT = [
    { h: 'となりの玉と入れかえよう', p: '玉を<b>となりの玉の方へスワイプ</b>（または2回タップ）すると入れかわります。<br>同じ色が<b>3つ以上</b>ならぶと消えます。',
      demo: '<div class="tut-demo d1"><div class="tile fire r"></div><div class="tile fire r"></div><div class="tile water a"></div><div class="tile fire b r"></div><div class="tile wood"></div></div>' },
    { h: '色 ＝ 味方の属性', p: '消した色と<b>同じ属性の味方</b>が攻撃します。<br>その色の味方がいないと攻撃できないので、チームの色はばらけさせましょう。',
      demo: '<div class="tut-demo d2"><div class="tile fire"></div><div class="arrow">→</div><div class="ph">火</div><div class="arrow">→</div><div class="foe">敵</div></div><div class="tut-badges"><span>火は木に強い</span><span>木は水に強い</span><span>水は火に強い</span><span>光と闇はおたがいに強い</span></div>' },
    { h: 'コンボでダメージアップ', p: '消えたあとに上から玉が落ちてきて、<b>続けて消えるとコンボ</b>。コンボが増えるほどダメージが大きくなります。',
      demo: '<div class="tut-demo"><span style="font-family:Rubik,sans-serif;font-size:30px;font-weight:900;color:#fff;text-shadow:0 0 14px #fbbf24;">3 COMBO!</span></div>' },
    { h: 'ハートで回復・敵の反撃に注意', p: '<b>ピンクのハート</b>を消すとチームのHPが回復。<br>敵の「あと○手」が0になると攻撃してきます。チームHPが0になると負け。',
      demo: '<div class="tut-demo"><div class="tile heart"></div><span class="cnt soon" style="font-size:14px;">あと1手</span></div>' },
    { h: '敵を順番にたおそう', p: 'ステージの敵をぜんぶたおすと<b>全クリア</b>。たおした数・残りHP・手数でスコアが決まり、ランキングにのります。',
      demo: '<div class="tut-demo"><span style="font-family:Rubik,sans-serif;font-size:26px;font-weight:900;background:linear-gradient(180deg,#fff7d6,#fbbf24 60%,#d97706);-webkit-background-clip:text;background-clip:text;color:transparent;">LET&#39;S BATTLE!</span></div>' }
  ];
  var tutIdx = 0, tutAfter = null;
  function tutSeen(){ try { return localStorage.getItem(LS_TUT) === '1'; } catch(e) { return true; } }
  function openTut(first, after){ tutIdx = 0; tutAfter = after || null; renderTut(); $('tut').classList.add('on'); }
  function renderTut(){
    var t = TUT[tutIdx];
    $('tut-h').textContent = t.h; $('tut-body').innerHTML = t.demo + '<p>' + t.p + '</p>';
    $('tut-dots').innerHTML = TUT.map(function(_, i){ return '<i class="' + (i === tutIdx ? 'on' : '') + '"></i>'; }).join('');
    $('tut-prev').style.visibility = tutIdx === 0 ? 'hidden' : 'visible';
    $('tut-next').textContent = tutIdx === TUT.length - 1 ? (tutAfter ? 'バトル開始！' : 'とじる') : 'つぎへ';
  }
  $('tut-prev').onclick = function(){ if (tutIdx > 0) { tutIdx--; renderTut(); } };
  $('tut-next').onclick = function(){
    if (tutIdx < TUT.length - 1) { tutIdx++; renderTut(); return; }
    try { localStorage.setItem(LS_TUT, '1'); } catch(e) {}
    $('tut').classList.remove('on');
    if (tutAfter) { var f = tutAfter; tutAfter = null; f(); }
  };

  // ---------- チーム編成 ----------
  var pick = [];
  function openTeam(){
    pick = TEAM.map(function(a){ return a.id; });
    var n = Math.min(CFG.team_size, CFG.allies.length); $('team-n').textContent = n;
    renderGrid(); show('scr-team');
  }
  function renderGrid(){
    var n = Math.min(CFG.team_size, CFG.allies.length);
    $('ally-grid').innerHTML = CFG.allies.map(function(a){
      var idx = pick.indexOf(a.id);
      return '<div class="ch' + (idx >= 0 ? ' sel' : '') + '" data-id="' + a.id + '"><div class="num">' + (idx + 1) + '</div><span class="ring" style="background:' + EL_COLOR[a.element] + '"></span>' + allyPh(a, 'ph') +
        '<div class="nm">' + esc(a.name) + '</div><div class="st">' + elDot(a.element) + ' HP' + a.hp + ' 攻' + a.atk + '</div></div>';
    }).join('');
    $('btn-team-ok').disabled = pick.length !== n;
    document.querySelectorAll('#ally-grid .ch').forEach(function(el){
      el.onclick = function(){
        var id = parseInt(el.getAttribute('data-id'), 10); var i = pick.indexOf(id);
        if (i >= 0) pick.splice(i, 1); else if (pick.length < n) pick.push(id);
        vibrate(10); renderGrid();
      };
    });
  }
  $('btn-team-ok').onclick = function(){ try { localStorage.setItem(LS_TEAM, JSON.stringify(pick)); } catch(e) {} goHome(); };
  $('btn-team-back').onclick = function(){ goHome(); };

  // ---------- バトル ----------
  var G = null;
  function startBattle(){
    loadTeam(); if (!TEAM.length) { openTeam(); return; }
    var maxHp = 0; TEAM.forEach(function(a){ maxHp += a.hp; });
    G = { stage: 0, hp: maxHp, maxHp: maxHp, moves: 0, enemyHp: 0, cnt: CFG.enemy_interval, busy: false, over: false, board: [], maxCombo: 0 };
    $('bt-team').innerHTML = TEAM.map(function(a, i){ return '<div class="m">' + allyPh(a, 'ph', true).replace('class="ph"', 'class="ph" data-i="' + i + '"') + '</div>'; }).join('');
    newBoard(); loadStage(); show('scr-battle');
  }
  function enemy(){ return CFG.enemies[G.stage]; }
  function loadStage(){
    var e = enemy(); G.enemyHp = e.hp; G.cnt = CFG.enemy_interval;
    $('stage-lbl').innerHTML = 'ステージ <b>' + (G.stage + 1) + '</b> / ' + CFG.enemies.length;
    $('en-nm').textContent = e.name; $('en-el').innerHTML = elDot(e.element);
    var ph = $('en-ph'); ph.className = 'ph'; ph.style.backgroundImage = e.img ? 'url(' + API + '/img/enemy/' + e.id + ')' : 'none'; ph.textContent = e.img ? '' : '敵';
    ph.style.boxShadow = '0 0 0 6px rgba(0,0,0,0.25), 0 18px 40px rgba(0,0,0,0.5), 0 0 60px ' + EL_COLOR[e.element] + '66';
    drawHud();
  }
  function drawHud(){
    var e = enemy();
    $('en-hp').textContent = Math.max(0, G.enemyHp) + ' / ' + e.hp;
    $('en-bar').style.width = Math.max(0, G.enemyHp / e.hp * 100) + '%';
    $('en-cnt').textContent = 'あと' + G.cnt + '手'; $('en-cnt').className = 'cnt' + (G.cnt <= 1 ? ' soon' : '');
    $('me-hp').textContent = Math.max(0, G.hp) + ' / ' + G.maxHp;
    $('me-bar').style.width = Math.max(0, G.hp / G.maxHp * 100) + '%';
    $('me-barwrap').className = 'bar me' + (G.hp / G.maxHp < 0.3 ? ' low' : '');
    $('moves').textContent = G.moves;
  }
  function rnd(n){ return Math.floor(Math.random() * n); }
  function newBoard(){
    var b = [];
    for (var y = 0; y < H; y++) { b[y] = []; for (var x = 0; x < W; x++) {
      var t; do { t = TYPES[rnd(TYPES.length)]; } while ((x >= 2 && b[y][x-1] === t && b[y][x-2] === t) || (y >= 2 && b[y-1][x] === t && b[y-2][x] === t));
      b[y][x] = t;
    } }
    G.board = b; if (!hasMove()) { newBoard(); return; } renderBoard(true);
  }
  function renderBoard(anim){
    var html = '';
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) html += '<div class="tile ' + G.board[y][x] + (anim ? ' new' : '') + '" data-x="' + x + '" data-y="' + y + '"' + (anim ? ' style="animation-delay:' + ((H - y) * 40) + 'ms"' : '') + '></div>';
    $('board').innerHTML = html + '<div class="combo" id="combo"></div>';
  }
  function tileAt(x, y){ return $('board').children[y * W + x]; }
  function findMatches(){
    var m = {}; var key = function(x, y){ return y * W + x; };
    for (var y = 0; y < H; y++) { var run = 1; for (var x = 1; x <= W; x++) {
      if (x < W && G.board[y][x] === G.board[y][x-1]) run++; else { if (run >= 3) for (var k = x - run; k < x; k++) m[key(k, y)] = G.board[y][k]; run = 1; } } }
    for (var x2 = 0; x2 < W; x2++) { var run2 = 1; for (var y2 = 1; y2 <= H; y2++) {
      if (y2 < H && G.board[y2][x2] === G.board[y2-1][x2]) run2++; else { if (run2 >= 3) for (var k2 = y2 - run2; k2 < y2; k2++) m[key(x2, k2)] = G.board[k2][x2]; run2 = 1; } } }
    return m;
  }
  function hasMove(){
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (x + 1 < W && trySwapCheck(x, y, x + 1, y)) return true;
      if (y + 1 < H && trySwapCheck(x, y, x, y + 1)) return true;
    }
    return false;
  }
  function trySwapCheck(x1, y1, x2, y2){
    var t = G.board[y1][x1]; G.board[y1][x1] = G.board[y2][x2]; G.board[y2][x2] = t;
    var ok = Object.keys(findMatches()).length > 0;
    G.board[y2][x2] = G.board[y1][x1]; G.board[y1][x1] = t;
    return ok;
  }

  // 入力: スワイプ、または タップ→となりをタップ
  var sel = null, drag = null;
  $('board').addEventListener('pointerdown', function(ev){
    if (!G || G.busy || G.over) return;
    var el = ev.target.closest('.tile'); if (!el) return;
    drag = { x: parseInt(el.getAttribute('data-x'), 10), y: parseInt(el.getAttribute('data-y'), 10), sx: ev.clientX, sy: ev.clientY };
  });
  $('board').addEventListener('pointermove', function(ev){
    if (!drag || G.busy) return;
    var dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
    if (Math.abs(dx) < 16 && Math.abs(dy) < 16) return;
    var tx = drag.x, ty = drag.y;
    if (Math.abs(dx) > Math.abs(dy)) tx += dx > 0 ? 1 : -1; else ty += dy > 0 ? 1 : -1;
    var from = drag; drag = null; clearSel();
    if (tx >= 0 && tx < W && ty >= 0 && ty < H) doSwap(from.x, from.y, tx, ty);
  });
  $('board').addEventListener('pointerup', function(){
    if (!drag || G.busy) { drag = null; return; }
    var x = drag.x, y = drag.y; drag = null;
    if (sel && Math.abs(sel.x - x) + Math.abs(sel.y - y) === 1) { var s = sel; clearSel(); doSwap(s.x, s.y, x, y); return; }
    clearSel(); sel = { x: x, y: y }; tileAt(x, y).classList.add('pick'); vibrate(8);
  });
  function clearSel(){ if (sel) { var t = tileAt(sel.x, sel.y); if (t) t.classList.remove('pick'); } sel = null; }

  function doSwap(x1, y1, x2, y2){
    var t = G.board[y1][x1]; G.board[y1][x1] = G.board[y2][x2]; G.board[y2][x2] = t;
    renderBoard(false);
    var m = findMatches();
    if (Object.keys(m).length === 0) {
      G.busy = true; $('board').classList.add('shake');
      setTimeout(function(){ G.board[y2][x2] = G.board[y1][x1]; G.board[y1][x1] = t; renderBoard(false); $('board').classList.remove('shake'); G.busy = false; $('msg').textContent = 'そろいません'; }, 200);
      return;
    }
    G.busy = true; G.moves++; $('msg').textContent = ''; vibrate(15);
    resolve(m, 1, {});
  }
  function sparks(x, y, color){
    var el = tileAt(x, y); if (!el) return;
    var bd = $('board'), r = el.getBoundingClientRect(), br = bd.getBoundingClientRect();
    for (var i = 0; i < 5; i++) {
      var s = document.createElement('span'); s.className = 'spark'; s.style.background = color;
      s.style.left = (r.left - br.left + r.width / 2) + 'px'; s.style.top = (r.top - br.top + r.height / 2) + 'px';
      var ang = Math.random() * 6.28, d = 18 + Math.random() * 22;
      s.style.setProperty('--dx', Math.cos(ang) * d + 'px'); s.style.setProperty('--dy', Math.sin(ang) * d + 'px');
      bd.appendChild(s); setTimeout(function(sp){ sp.remove(); }, 520, s);
    }
  }
  function resolve(m, combo, counts){
    var keys = Object.keys(m);
    keys.forEach(function(k){ var t = m[k]; counts[t] = (counts[t] || 0) + 1; var x = k % W, y = Math.floor(k / W); tileAt(x, y).classList.add('gone'); sparks(x, y, EL_COLOR[t] || '#ff6fae'); });
    if (combo >= 2) { var c = $('combo'); c.textContent = combo + ' COMBO'; c.classList.remove('on'); void c.offsetWidth; c.classList.add('on'); vibrate(20); }
    if (combo > G.maxCombo) G.maxCombo = combo;
    setTimeout(function(){
      var fell = {};
      for (var x = 0; x < W; x++) {
        var col = []; var removed = 0;
        for (var y = H - 1; y >= 0; y--) { if (String(y * W + x) in m) removed++; else col.push(G.board[y][x]); }
        for (var y2 = H - 1; y2 >= 0; y2--) { if (col.length) G.board[y2][x] = col.shift(); else { G.board[y2][x] = TYPES[rnd(TYPES.length)]; fell[y2 * W + x] = 1; } }
      }
      renderBoard(false);
      Object.keys(fell).forEach(function(k){ var el = $('board').children[k]; if (el) el.classList.add('new'); });
      var next = findMatches();
      if (Object.keys(next).length) { setTimeout(function(){ resolve(next, combo + 1, counts); }, 120); return; }
      afterMove(counts, combo);
    }, 300);
  }
  function floatMsg(s, bad){ var f = $('float'); f.innerHTML = '<span class="' + (bad ? 'bad' : '') + '">' + esc(s) + '</span>'; setTimeout(function(){ f.innerHTML = ''; }, 1100); }
  function popDmg(text, cls){ var d = document.createElement('div'); d.className = 'dmg ' + (cls || ''); d.textContent = text; $('arena').appendChild(d); setTimeout(function(){ d.remove(); }, 900); }
  function afterMove(counts, combos){
    var e = enemy(); var mult = 1 + 0.25 * (combos - 1); var dmg = 0; var healed = 0; var attackers = [];
    TYPES.forEach(function(t){
      var n = counts[t] || 0; if (!n) return;
      if (t === 'heart') { var heal = Math.round(G.maxHp * 0.03 * n); healed += Math.min(heal, G.maxHp - G.hp); G.hp = Math.min(G.maxHp, G.hp + heal); return; }
      var atk = 0; TEAM.forEach(function(a, i){ if (a.element === t) { atk += a.atk; attackers.push(i); } });
      if (atk > 0) dmg += atk * n * mult * adv(t, e.element);
    });
    dmg = Math.round(dmg);
    attackers.forEach(function(i){ var ph = document.querySelector('#bt-team .ph[data-i="' + i + '"]'); if (ph) { ph.classList.add('atk'); setTimeout(function(){ ph.classList.remove('atk'); }, 400); } });
    if (healed > 0) popDmg('+' + healed, 'heal');
    if (dmg > 0) {
      G.enemyHp -= dmg; var ph = $('en-ph'); ph.classList.add('hit'); $('arena').classList.add('flash');
      setTimeout(function(){ ph.classList.remove('hit'); $('arena').classList.remove('flash'); }, 350);
      popDmg('-' + dmg, dmg >= e.hp * 0.3 ? 'big' : ''); vibrate(30);
    } else if (!counts.heart) { $('msg').textContent = 'その色の味方がいません…'; }
    if (G.enemyHp <= 0) {
      drawHud(); G.stage++; $('en-ph').classList.add('die');
      if (G.stage >= CFG.enemies.length) { floatMsg('全クリア！'); vibrate([30, 50, 80]); setTimeout(function(){ finish(true); }, 1100); return; }
      floatMsg(e.name + ' をたおした！'); vibrate([20, 40, 20]);
      setTimeout(function(){ loadStage(); if (!hasMove()) newBoard(); G.busy = false; }, 1100);
      return;
    }
    G.cnt--;
    if (G.cnt <= 0) {
      G.cnt = CFG.enemy_interval; G.hp -= e.atk; $('arena').classList.add('hurt'); $('bt-team').classList.add('shake'); vibrate(60);
      setTimeout(function(){ $('arena').classList.remove('hurt'); $('bt-team').classList.remove('shake'); }, 420);
      popDmg('-' + e.atk, 'me'); floatMsg(e.name + ' の攻撃！', true);
      if (G.hp <= 0) { drawHud(); setTimeout(function(){ finish(false); }, 1100); return; }
    }
    drawHud();
    if (!hasMove()) { $('msg').textContent = '動かせる玉がないので並べ直し'; newBoard(); }
    G.busy = false;
  }
  $('btn-giveup').onclick = function(){ if (G && !G.over && confirm('ここであきらめますか？（ここまでの記録は残ります）')) finish(false); };

  function finish(cleared){
    G.over = true;
    var hpPct = Math.round(Math.max(0, G.hp) / G.maxHp * 100);
    var body = { token: ME.token, stages_cleared: G.stage, stages_total: CFG.enemies.length, hp_left: hpPct, moves: G.moves, cleared: cleared, team: TEAM.map(function(a){ return a.id; }) };
    $('res-ttl').textContent = cleared ? '全クリア！おめでとう！' : (G.stage > 0 ? 'ざんねん… でも ' + G.stage + '体たおした！' : 'ざんねん…');
    $('res-score').textContent = '…'; $('res-nb').textContent = '';
    $('res-stages').textContent = G.stage + ' / ' + CFG.enemies.length + ' 体';
    $('res-hp').textContent = hpPct + '%'; $('res-moves').textContent = G.moves + ' 手'; $('res-combo').textContent = G.maxCombo + ' コンボ';
    $('res-best').textContent = '…'; $('res-rank').textContent = '…';
    show('scr-result');
    post('/result', body).then(function(j){
      if (j.error) { $('res-score').textContent = '保存できませんでした'; return; }
      $('res-score').textContent = j.score.toLocaleString() + ' 点';
      $('res-nb').textContent = j.is_best ? '自己ベスト更新！' : '';
      $('res-best').textContent = j.best ? j.best.score.toLocaleString() + ' 点' : '-';
      $('res-rank').textContent = j.rank + ' 位';
      ME.best = j.best;
    });
  }

  // ---------- ランキング ----------
  function openRank(){
    fetch(API + '/ranking').then(function(r){ return r.json(); }).then(function(j){
      $('rk-players').textContent = '参加 ' + j.players + ' 人';
      $('rk-body').innerHTML = j.rows.length ? j.rows.map(function(r, i){
        return '<tr class="' + (ME && r.nickname === ME.nickname ? 'me' : '') + '"><td class="n">' + (i + 1) + '</td><td>' + (i === 0 ? '<span class="crown"></span>' : '') + esc(r.nickname) + (r.cleared ? ' <span style="font-size:11px;color:#fbbf24;">★全クリア</span>' : '') + '</td><td style="text-align:right;font-family:Rubik,sans-serif;">' + r.score.toLocaleString() + '</td><td style="text-align:right;color:#94a3b8;">' + r.plays + '</td></tr>';
      }).join('') : '<tr><td colspan="4" style="text-align:center;color:#94a3b8;">まだ記録がありません</td></tr>';
      show('scr-rank');
    });
  }
})();
</script>
</body>
</html>`;
}
