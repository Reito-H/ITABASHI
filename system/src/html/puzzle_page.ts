// バジル&ドラゴンズ ゲーム画面（公開ページのHTML/CSS/JS）
// 配置はパズドラ風: 上に敵（大きく）→ 味方の並び＋チームHP → 下に大きな盤面（6×5）。
// 画面: 参戦 / ホーム（案内人バジル） / チーム編成 / ガチャ / キャラ（育成） / バトル / 結果 / ランキング / チュートリアル / 裏パネル
// ルート・APIは routes/public_puzzle.ts。クライアントJSはテンプレートリテラル内なので
// バックスラッシュとバッククォートは使わない（エスケープ事故防止）。
import { FAVICON_DATA_URI } from './layout';

// ロゴ: 「バジル&ドラゴンズ」。某パズルゲームのロゴ風（太丸ゴシック・炎のグラデ・白縁＋濃い縁・バジルの葉）
const LOGO_SVG = `<svg viewBox="-10 0 580 150" xmlns="http://www.w3.org/2000/svg" class="logo-svg" aria-label="バジル&amp;ドラゴンズ">
  <defs>
    <linearGradient id="lg-fire" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a3"/><stop offset="0.45" stop-color="#ffb21c"/><stop offset="0.5" stop-color="#ff6a00"/><stop offset="1" stop-color="#c81e1e"/></linearGradient>
    <linearGradient id="lg-leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b7f7c4"/><stop offset="0.5" stop-color="#2fbf63"/><stop offset="1" stop-color="#166534"/></linearGradient>
    <linearGradient id="lg-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffbe6"/><stop offset="0.5" stop-color="#ffd23f"/><stop offset="1" stop-color="#b45309"/></linearGradient>
    <filter id="lg-shadow" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="3" flood-color="#000" flood-opacity="0.6"/></filter>
  </defs>
  <g filter="url(#lg-shadow)" transform="rotate(-4 260 80)">
    <g font-family="'M PLUS Rounded 1c','Hiragino Sans',sans-serif" font-weight="900" text-anchor="middle">
      <text x="150" y="98" font-size="70" stroke="#3b0a0a" stroke-width="18" stroke-linejoin="round" paint-order="stroke" fill="#3b0a0a">バジル</text>
      <text x="150" y="98" font-size="70" stroke="#fff" stroke-width="9" stroke-linejoin="round" paint-order="stroke" fill="url(#lg-fire)">バジル</text>
      <text x="262" y="112" font-size="78" stroke="#3b0a0a" stroke-width="16" stroke-linejoin="round" paint-order="stroke" fill="#3b0a0a" font-family="Rubik,sans-serif">&amp;</text>
      <text x="262" y="112" font-size="78" stroke="#fff" stroke-width="7" stroke-linejoin="round" paint-order="stroke" fill="url(#lg-gold)" font-family="Rubik,sans-serif">&amp;</text>
      <text x="398" y="98" font-size="56" stroke="#3b0a0a" stroke-width="18" stroke-linejoin="round" paint-order="stroke" fill="#3b0a0a">ドラゴンズ</text>
      <text x="398" y="98" font-size="56" stroke="#fff" stroke-width="9" stroke-linejoin="round" paint-order="stroke" fill="url(#lg-fire)">ドラゴンズ</text>
    </g>
    <g transform="translate(28 6) rotate(-30)">
      <path d="M0 30 C 10 -5, 60 -5, 70 30 C 60 65, 10 65, 0 30 Z" fill="url(#lg-leaf)" stroke="#0f3d1f" stroke-width="4"/>
      <path d="M4 30 L66 30" stroke="#0f3d1f" stroke-width="3" stroke-linecap="round"/>
      <path d="M20 30 L30 14 M20 30 L30 46 M38 30 L48 16 M38 30 L48 44" stroke="#0f3d1f" stroke-width="2.5" stroke-linecap="round"/>
    </g>
  </g>
</svg>`;

// 案内人 妖精バジル（SVG。画像が無くても出せるよう最初から図形で用意）
const BASIL_SVG = `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" class="basil-svg">
  <defs>
    <radialGradient id="bs-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#b7f7c4" stop-opacity="0.9"/><stop offset="1" stop-color="#2fbf63" stop-opacity="0"/></radialGradient>
    <linearGradient id="bs-leaf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c7ffd3"/><stop offset="1" stop-color="#15803d"/></linearGradient>
    <radialGradient id="bs-face" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ffe9c9"/><stop offset="1" stop-color="#e3b27a"/></radialGradient>
  </defs>
  <circle cx="60" cy="62" r="56" fill="url(#bs-glow)"><animate attributeName="r" values="52;58;52" dur="2.4s" repeatCount="indefinite"/></circle>
  <g class="bs-wing"><path d="M58 60 C 20 30, 10 70, 50 78 Z" fill="url(#bs-leaf)" stroke="#0f3d1f" stroke-width="2"/><path d="M62 60 C 100 30, 110 70, 70 78 Z" fill="url(#bs-leaf)" stroke="#0f3d1f" stroke-width="2"/></g>
  <circle cx="60" cy="58" r="22" fill="url(#bs-face)" stroke="#0f3d1f" stroke-width="2"/>
  <path d="M38 48 C 42 28, 78 28, 82 48 C 70 40, 50 40, 38 48 Z" fill="#2fbf63" stroke="#0f3d1f" stroke-width="2"/>
  <circle cx="52" cy="58" r="3" fill="#0f172a"/><circle cx="68" cy="58" r="3" fill="#0f172a"/>
  <path d="M54 66 Q 60 71 66 66" stroke="#0f172a" stroke-width="2" fill="none" stroke-linecap="round"/>
  <circle cx="47" cy="63" r="3" fill="#ff9aa2" opacity="0.7"/><circle cx="73" cy="63" r="3" fill="#ff9aa2" opacity="0.7"/>
  <path d="M52 80 L60 100 L68 80 Z" fill="#2fbf63" stroke="#0f3d1f" stroke-width="2"/>
  <g fill="#fff"><circle cx="20" cy="30" r="2"><animate attributeName="opacity" values="0;1;0" dur="1.6s" repeatCount="indefinite"/></circle><circle cx="100" cy="24" r="1.6"><animate attributeName="opacity" values="1;0;1" dur="2s" repeatCount="indefinite"/></circle><circle cx="96" cy="96" r="2"><animate attributeName="opacity" values="0;1;0" dur="1.3s" repeatCount="indefinite"/></circle></g>
</svg>`;


// 玉（オーブ）: 水晶球風。多層の放射グラデ＋ガラスのハイライト＋内側の光＋属性シンボル。各マスは <use> で参照する
function orbSymbol(id: string, hi: string, mid: string, deep: string, icon: string): string {
  return `<symbol id="orb-${id}" viewBox="0 0 100 100">
    <radialGradient id="og-${id}" cx="38%" cy="32%" r="72%"><stop offset="0" stop-color="${hi}"/><stop offset="0.38" stop-color="${mid}"/><stop offset="0.82" stop-color="${deep}"/><stop offset="1" stop-color="#000" stop-opacity="0.85"/></radialGradient>
    <radialGradient id="oc-${id}" cx="50%" cy="58%" r="40%"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.5" stop-color="${hi}" stop-opacity="0.35"/><stop offset="1" stop-color="${mid}" stop-opacity="0"/></radialGradient>
    <radialGradient id="or-${id}" cx="50%" cy="50%" r="50%"><stop offset="0.78" stop-color="#fff" stop-opacity="0"/><stop offset="0.92" stop-color="${hi}" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0.15"/></radialGradient>
    <linearGradient id="ohl-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <circle cx="50" cy="50" r="48" fill="url(#og-${id})"/>
    <circle cx="50" cy="50" r="48" fill="url(#or-${id})"/>
    <circle cx="50" cy="58" r="30" fill="url(#oc-${id})"/>
    <g fill="#fff" opacity="0.95" transform="translate(50 53) scale(2.05) translate(-12 -12)" filter="url(#orb-glow)">${icon}</g>
    <ellipse cx="36" cy="27" rx="19" ry="11" fill="url(#ohl-${id})" transform="rotate(-18 36 27)"/>
    <circle cx="28" cy="24" r="4.5" fill="#fff" opacity="0.95"/>
    <ellipse cx="62" cy="80" rx="18" ry="6" fill="#fff" opacity="0.14"/>
  </symbol>`;
}
const ORB_ICONS: Record<string, string> = {
  fire: '<path d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4-.2 2 .6 3 1.5 3 1.2 0 2-1.2 1.5-3C11.3 6 12 4 12 2z"/>',
  water: '<path d="M12 2.5C9 7 6 10 6 14a6 6 0 0 0 12 0c0-4-3-7-6-11.5z"/><ellipse cx="9.3" cy="14.5" rx="1.4" ry="2.4" fill="#000" opacity="0.18"/>',
  wood: '<path d="M20 4C10 4 4 10 4 20c10 0 16-6 16-16zM6.5 17.5l9-9" stroke="#1b5e20" stroke-width="1.2" fill="#fff"/>',
  light: '<path d="M12 1.5l2.2 6.3 6.3 2.2-6.3 2.2L12 18.5l-2.2-6.3-6.3-2.2 6.3-2.2z"/><circle cx="12" cy="10" r="2.2" opacity="0.9"/>',
  dark: '<path d="M15.5 3a9 9 0 1 0 6 15.5A8 8 0 0 1 15.5 3z"/><circle cx="18" cy="6" r="1.2" opacity="0.8"/>',
  heart: '<path d="M12 21s-7-4.5-9.5-9C.5 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4 4.5 8C19 16.5 12 21 12 21z"/>',
};
const ORB_DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <filter id="orb-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  ${orbSymbol('fire', '#ffd1d1', '#ff4d55', '#8a0f1c', ORB_ICONS.fire)}
  ${orbSymbol('water', '#d2ecff', '#2f9bff', '#0b3f9e', ORB_ICONS.water)}
  ${orbSymbol('wood', '#d6ffe0', '#2fd06a', '#0f5a2a', ORB_ICONS.wood)}
  ${orbSymbol('light', '#fff9c9', '#ffd21f', '#9a6a00', ORB_ICONS.light)}
  ${orbSymbol('dark', '#ead9ff', '#a855f7', '#3b0a7a', ORB_ICONS.dark)}
  ${orbSymbol('heart', '#ffd9ea', '#ff5fa8', '#8a0f4a', ORB_ICONS.heart)}
</defs></svg>`;
const orbUse = (t: string) => `<svg class="orb"><use href="#orb-${t}"/></svg>`;

export function puzzlePageHtml(): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#0b1020">
<title>バジル&amp;ドラゴンズ</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@700;900&family=Rubik:wght@700;900&display=swap">
<style>
  :root {
    --bg: #0b1020; --panel: rgba(17, 24, 48, 0.85); --line: rgba(148, 163, 184, 0.18);
    --gold: #fbbf24; --gold2: #f59e0b; --text: #eef2ff; --muted: #94a3b8; --coin: #ffd23f;
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

  .wrap { max-width: 480px; margin: 0 auto; padding: calc(10px + var(--sat)) 12px calc(24px + var(--sab)); min-height: 100vh; }
  .scr { display: none; animation: fadein 0.35s ease; } .scr.on { display: block; }
  @keyframes fadein { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  .logo { text-align: center; margin: 2px 0 8px; cursor: pointer; user-select: none; }
  .logo-svg { width: 100%; max-width: 360px; height: auto; display: block; margin: 0 auto; }
  .logo .s { font-size: 10px; color: var(--muted); letter-spacing: 0.3em; margin-top: -4px; }

  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 16px 14px; margin-bottom: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06); backdrop-filter: blur(8px); }
  .card h2 { font-size: 15px; margin: 0 0 10px; color: var(--gold); letter-spacing: 0.04em; }
  label.f { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  input.t { width: 100%; border: 1px solid #334155; border-radius: 12px; padding: 13px 14px; font-size: 18px; font-family: inherit; font-weight: 700; background: #0b1226; color: var(--text); outline: none; transition: box-shadow 0.2s, border-color 0.2s; }
  input.t:focus { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(251,191,36,0.25); }
  .btn { display: block; width: 100%; padding: 15px; border: none; border-radius: 14px; font-size: 16px; font-weight: 900; cursor: pointer; margin-top: 10px; font-family: inherit; color: #1f1300; letter-spacing: 0.04em;
    background: linear-gradient(180deg, #ffe08a 0%, #fbbf24 50%, #f59e0b 100%); box-shadow: 0 6px 0 #b45309, 0 10px 24px rgba(251,191,36,0.3); transition: transform 0.08s, box-shadow 0.08s; position: relative; }
  .btn:active { transform: translateY(4px); box-shadow: 0 2px 0 #b45309, 0 4px 12px rgba(251,191,36,0.3); }
  .btn.sec { background: linear-gradient(180deg, #4c5a7a, #2b3650); color: #eef2ff; box-shadow: 0 6px 0 #141b2d, 0 10px 24px rgba(0,0,0,0.35); }
  .btn.sec:active { box-shadow: 0 2px 0 #141b2d; }
  .btn.ghost { background: transparent; border: 1.5px solid #3b4968; color: #cbd5e1; box-shadow: none; }
  .btn.ghost:active { transform: scale(0.98); }
  .btn.pink { background: linear-gradient(180deg, #ffb3d1, #ff6fae 50%, #d6336c); color: #3b0a20; box-shadow: 0 6px 0 #9d174d, 0 10px 24px rgba(255,111,174,0.35); }
  .btn.pink:active { box-shadow: 0 2px 0 #9d174d; }
  .btn.green { background: linear-gradient(180deg, #c7ffd3, #41d47d 50%, #15803d); color: #052e16; box-shadow: 0 6px 0 #14532d, 0 10px 24px rgba(65,212,125,0.35); }
  .btn.green:active { box-shadow: 0 2px 0 #14532d; }
  .btn:disabled { opacity: 0.45; cursor: default; transform: none; }
  .btn .sub { display: block; font-size: 11px; font-weight: 700; opacity: 0.8; margin-top: 2px; }
  .btn2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .btn2 .btn { margin-top: 10px; }
  .err { color: #fca5a5; font-size: 13px; margin-top: 8px; min-height: 1em; }
  .who { font-size: 17px; font-weight: 900; color: var(--gold); }
  .best { font-size: 13px; color: #cbd5e1; margin-top: 4px; font-weight: 700; }
  .row { display: flex; gap: 8px; align-items: center; }
  .link { background: none; border: none; color: #93c5fd; text-decoration: underline; font-size: 13px; cursor: pointer; font-family: inherit; padding: 8px 0; font-weight: 700; }
  .help { font-size: 12px; color: var(--muted); line-height: 1.8; font-weight: 700; }
  .coin { display: inline-flex; align-items: center; gap: 5px; background: linear-gradient(180deg, #2b2410, #1a1608); border: 1px solid rgba(255,210,63,0.5); color: var(--coin); border-radius: 999px; padding: 4px 12px; font-family: 'Rubik', sans-serif; font-weight: 900; font-size: 15px; }
  .coin::before { content: ''; width: 14px; height: 14px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff7c2, #ffd23f 55%, #b45309); box-shadow: 0 0 6px rgba(255,210,63,0.7); }
  .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .back { background: none; border: 1px solid #3b4968; color: #cbd5e1; border-radius: 999px; padding: 6px 14px; font-size: 12px; font-family: inherit; font-weight: 700; cursor: pointer; }

  /* ===== 案内人 ===== */
  .guide { display: flex; gap: 10px; align-items: flex-end; margin-bottom: 12px; }
  .basil-svg { width: 92px; height: 92px; flex-shrink: 0; filter: drop-shadow(0 6px 10px rgba(47,191,99,0.35)); animation: float 3s ease-in-out infinite; }
  .basil-img { width: 92px; height: 92px; flex-shrink: 0; border-radius: 50%; background: #0b1226 center/cover no-repeat; border: 3px solid #41d47d; box-shadow: 0 0 24px rgba(65,212,125,0.5), 0 8px 16px rgba(0,0,0,0.5); animation: float 3s ease-in-out infinite; display: none; }
  body.guide-img .basil-img { display: block; } body.guide-img .basil-svg { display: none; }
  .tut-guide .basil-img { width: 64px; height: 64px; }
  .bs-wing { transform-origin: 60px 60px; animation: flap 0.6s ease-in-out infinite alternate; }
  @keyframes flap { from { transform: scaleX(1); } to { transform: scaleX(0.88); } }
  .bubble { position: relative; flex: 1; background: #fff; color: #1f2937; border-radius: 16px; padding: 10px 12px; font-size: 13px; line-height: 1.7; box-shadow: 0 8px 20px rgba(0,0,0,0.35); min-height: 48px; }
  .bubble::before { content: ''; position: absolute; left: -8px; bottom: 16px; border: 8px solid transparent; border-right-color: #fff; border-left: 0; }
  .bubble .nm { display: block; font-size: 10px; color: #15803d; letter-spacing: 0.1em; margin-bottom: 2px; }

  /* ===== 属性・キャラ ===== */
  .el { display: inline-block; width: 14px; height: 14px; border-radius: 50%; vertical-align: -2px; margin-right: 3px; box-shadow: inset 0 -2px 0 rgba(0,0,0,0.3); }
  .el-fire { background: var(--fire); } .el-water { background: var(--water); } .el-wood { background: var(--wood); } .el-light { background: var(--light); } .el-dark { background: var(--dark); } .el-heart { background: var(--heart); }
  .stars { color: var(--light); font-size: 11px; letter-spacing: -1px; text-shadow: 0 0 6px rgba(255,217,61,0.6); }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .ch { position: relative; border: 2px solid #2b3650; border-radius: 16px; background: #0b1226; overflow: hidden; cursor: pointer; transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s; }
  .ch:active { transform: scale(0.96); }
  .ch.sel { border-color: var(--gold); box-shadow: 0 0 0 3px rgba(251,191,36,0.35), 0 0 24px rgba(251,191,36,0.35); }
  .ch.r5 { border-color: rgba(255,217,61,0.6); } .ch.r4 { border-color: rgba(182,109,255,0.6); }
  .ch .ph { width: 100%; aspect-ratio: 1; background: #1e293b center/cover no-repeat; display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 900; color: #64748b; }
  .ch .nm { font-size: 11px; font-weight: 900; padding: 6px 6px 1px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ch .st { font-size: 10px; color: var(--muted); text-align: center; padding-bottom: 7px; }
  .ch .num { position: absolute; top: 6px; left: 6px; background: var(--gold); color: #1f1300; font-weight: 900; font-size: 12px; width: 22px; height: 22px; border-radius: 50%; display: none; align-items: center; justify-content: center; box-shadow: 0 2px 6px rgba(0,0,0,0.4); z-index: 2; }
  .ch.sel .num { display: flex; }
  .ch .ring { position: absolute; right: 6px; top: 6px; width: 16px; height: 16px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.5); z-index: 2; }
  .ch .lv { position: absolute; left: 6px; bottom: 44px; background: rgba(0,0,0,0.65); color: #fff; font-family: 'Rubik', sans-serif; font-size: 11px; padding: 1px 6px; border-radius: 6px; }
  .ch .rr { position: absolute; left: 0; right: 0; top: 0; text-align: center; background: linear-gradient(180deg, rgba(0,0,0,0.6), transparent); padding: 4px 0 10px; }

  /* キャラ一覧（育成） */
  .cl { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); }
  .cl .ph { width: 58px; height: 58px; border-radius: 12px; background: #1e293b center/cover no-repeat; flex-shrink: 0; border: 2px solid #2b3650; }
  .cl .info { flex: 1; min-width: 0; }
  .cl .n { font-size: 13px; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cl .s { font-size: 11px; color: var(--muted); }
  .xp { height: 7px; background: #0b1226; border-radius: 999px; overflow: hidden; margin-top: 4px; border: 1px solid rgba(255,255,255,0.08); }
  .xp > i { display: block; height: 100%; background: linear-gradient(90deg, #41d47d, #b7f7c4); transition: width 0.4s; }
  .cl .tr { flex-shrink: 0; padding: 8px 10px; border: none; border-radius: 10px; font-family: inherit; font-weight: 900; font-size: 12px; cursor: pointer; background: linear-gradient(180deg, #c7ffd3, #41d47d 50%, #15803d); color: #052e16; box-shadow: 0 3px 0 #14532d; }
  .cl .tr:disabled { opacity: 0.4; }
  .cl .tr:active { transform: translateY(2px); box-shadow: 0 1px 0 #14532d; }
  .cl.lock { opacity: 0.45; } .cl.lock .ph { filter: grayscale(1); }
  .tabs { display: flex; gap: 6px; margin-bottom: 10px; }
  .tabs button { flex: 1; padding: 8px; border-radius: 10px; border: 1px solid #3b4968; background: transparent; color: #cbd5e1; font-family: inherit; font-weight: 900; font-size: 12px; cursor: pointer; }
  .tabs button.on { background: var(--gold); color: #1f1300; border-color: var(--gold); }

  /* ===== ガチャ ===== */
  .gacha-stage { position: relative; height: 230px; display: flex; align-items: center; justify-content: center; overflow: hidden; border-radius: 16px; background: radial-gradient(ellipse at 50% 80%, rgba(255,111,174,0.25), transparent 65%); margin-bottom: 10px; }
  .capsule { width: 110px; height: 110px; border-radius: 50%; position: relative; background: linear-gradient(180deg, #ffd6e7 0 50%, #ff6fae 50% 100%); box-shadow: inset 0 -10px 20px rgba(0,0,0,0.25), inset 0 6px 10px rgba(255,255,255,0.5), 0 14px 30px rgba(0,0,0,0.5); animation: capsule-idle 2s ease-in-out infinite; }
  .capsule::after { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 4px; background: rgba(0,0,0,0.25); }
  @keyframes capsule-idle { 0%,100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-8px) rotate(3deg); } }
  .capsule.shake { animation: capsule-shake 0.9s ease-in-out; }
  @keyframes capsule-shake { 0%,100% { transform: rotate(0); } 10% { transform: rotate(-14deg) scale(1.05); } 20% { transform: rotate(14deg); } 30% { transform: rotate(-16deg) scale(1.1); } 40% { transform: rotate(16deg); } 50% { transform: rotate(-12deg) scale(1.15); } 60% { transform: rotate(12deg); } 80% { transform: scale(1.3); } }
  .capsule.open { animation: capsule-open 0.5s forwards; }
  @keyframes capsule-open { to { transform: scale(2.2); opacity: 0; filter: brightness(3); } }
  .gres { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
  .gres.one { grid-template-columns: 1fr; max-width: 190px; margin: 0 auto; }
  .gcard { position: relative; border-radius: 12px; overflow: hidden; border: 2px solid #2b3650; background: #0b1226; opacity: 0; transform: scale(0.3) rotateY(90deg); animation: gcard 0.5s cubic-bezier(.2,.8,.2,1.3) forwards; }
  @keyframes gcard { to { opacity: 1; transform: none; } }
  .gcard .ph { width: 100%; aspect-ratio: 1; background: #1e293b center/cover no-repeat; }
  .gcard .n { font-size: 10px; text-align: center; padding: 4px 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .gcard .r { position: absolute; top: 2px; left: 0; right: 0; text-align: center; }
  .gcard.r5 { border-color: #ffd93d; box-shadow: 0 0 18px rgba(255,217,61,0.7); animation: gcard 0.5s cubic-bezier(.2,.8,.2,1.3) forwards, glow5 1.2s ease-in-out infinite alternate; }
  @keyframes glow5 { from { box-shadow: 0 0 10px rgba(255,217,61,0.5); } to { box-shadow: 0 0 26px rgba(255,217,61,1); } }
  .gcard.r4 { border-color: #b66dff; box-shadow: 0 0 14px rgba(182,109,255,0.6); }
  .gcard .new { position: absolute; right: 3px; top: 3px; background: #ff5a5f; color: #fff; font-size: 9px; padding: 1px 5px; border-radius: 4px; font-family: 'Rubik', sans-serif; }
  .gcard .dup { position: absolute; right: 3px; top: 3px; background: rgba(0,0,0,0.6); color: #cbd5e1; font-size: 9px; padding: 1px 5px; border-radius: 4px; }
  .gres.one .gcard .n { font-size: 14px; padding: 8px; } .gres.one .gcard .new, .gres.one .gcard .dup { font-size: 12px; padding: 3px 8px; }
  .rate { font-size: 11px; color: var(--muted); text-align: center; margin-top: 8px; }

  /* ===== バトル（パズドラ風レイアウト） ===== */
  #scr-battle { position: fixed; inset: 0; display: none; flex-direction: column; max-width: 480px; margin: 0 auto; padding: calc(8px + var(--sat)) 10px calc(8px + var(--sab)); }
  #scr-battle.on { display: flex; }
  body.battle .wrap { display: none; }
  .top { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: #cbd5e1; padding: 2px 4px; }
  .top b { color: var(--gold); font-size: 14px; }
  .top .gu { background: none; border: 1px solid #3b4968; color: #cbd5e1; border-radius: 999px; padding: 3px 10px; font-size: 11px; font-family: inherit; font-weight: 700; }
  .arena { flex: 1; min-height: 150px; position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; padding-bottom: 6px;
    background: radial-gradient(ellipse 70% 50% at 50% 100%, rgba(251,191,36,0.14), transparent 70%); }
  .arena.boss { background: radial-gradient(ellipse 80% 60% at 50% 100%, rgba(239,68,68,0.25), transparent 70%); }
  .arena.flash::before { content: ''; position: absolute; inset: 0; background: #fff; animation: flash 0.25s ease-out; pointer-events: none; }
  @keyframes flash { from { opacity: 0.45; } to { opacity: 0; } }
  .arena.hurt::before { content: ''; position: absolute; inset: 0; background: #ef4444; animation: flash 0.4s ease-out; pointer-events: none; }
  .bossbanner { position: absolute; top: 6px; left: 0; right: 0; text-align: center; font-family: 'Rubik', sans-serif; font-weight: 900; font-size: 26px; letter-spacing: 0.3em; color: #ff5a5f; text-shadow: 0 0 16px rgba(255,90,95,0.8); display: none; animation: pulse 1.2s ease-in-out infinite; }
  .arena.boss .bossbanner { display: block; }
  .enemy { display: flex; flex-direction: column; align-items: center; width: 100%; }
  .enemy .ph { width: min(42vw, 180px); height: min(42vw, 180px); border-radius: 50%; background: #1e293b center/cover no-repeat; border: 4px solid rgba(255,255,255,0.14);
    box-shadow: 0 0 0 6px rgba(0,0,0,0.25), 0 18px 40px rgba(0,0,0,0.5), 0 0 60px rgba(182,109,255,0.25); display: flex; align-items: center; justify-content: center; font-size: 40px; animation: float 3s ease-in-out infinite; position: relative; }
  .arena.boss .enemy .ph { width: min(52vw, 220px); height: min(52vw, 220px); border-color: rgba(255,90,95,0.5); }
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
  .team .m .lv { font-size: 10px; color: var(--muted); font-family: 'Rubik', sans-serif; margin-top: 3px; }
  .teamhp { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #cbd5e1; margin: 4px 0 6px; }
  .teamhp b { color: #bbf7d0; min-width: 72px; text-align: right; font-size: 13px; }

  #board { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; touch-action: none; user-select: none; padding: 10px; border-radius: 20px;
    background: radial-gradient(120% 80% at 50% 0%, rgba(99,102,241,0.18), transparent 60%), linear-gradient(180deg, rgba(15,23,42,0.95), rgba(2,6,23,0.98));
    border: 1px solid rgba(148,163,184,0.25); box-shadow: inset 0 2px 14px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.04), 0 -10px 34px rgba(0,0,0,0.35); position: relative; }
  #board::before { content: ''; position: absolute; inset: 0; border-radius: 20px; pointer-events: none;
    background-image: linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px); background-size: calc((100% - 20px) / 6 + 1px) calc((100% - 20px) / 5 + 1px); background-position: 10px 10px; }
  .tile { aspect-ratio: 1; border-radius: 50%; position: relative; transition: transform 0.12s; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.6)); }
  .tile .orb { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .tile::after { content: ''; position: absolute; inset: 0; border-radius: 50%; pointer-events: none;
    background: linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.35) 48%, rgba(255,255,255,0) 58%); background-size: 260% 100%; background-position: 120% 0; animation: sheen 5s ease-in-out infinite; }
  @keyframes sheen { 0%, 60% { background-position: 120% 0; } 85%, 100% { background-position: -40% 0; } }
  .tile:nth-child(3n)::after { animation-delay: -1.7s; } .tile:nth-child(3n+1)::after { animation-delay: -3.4s; }
  .tile.pick { transform: scale(1.18); filter: drop-shadow(0 0 10px #fff) drop-shadow(0 0 18px rgba(255,255,255,0.9)); z-index: 2; }
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
  .dmg { position: fixed; left: 50%; top: 20%; transform: translateX(-50%); font-family: 'Rubik', sans-serif; font-weight: 900; font-size: 42px; color: #fff; pointer-events: none; z-index: 5;
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
  .float span.boss { background: linear-gradient(180deg, #3b0a0a, #7f1d1d); border: 2px solid #ff5a5f; color: #ff5a5f; letter-spacing: 0.2em; animation-duration: 1.8s; }
  @keyframes pop { 0% { transform: scale(0.4); opacity: 0; } 18% { transform: scale(1.12); opacity: 1; } 80% { transform: scale(1); opacity: 1; } 100% { transform: scale(1.05); opacity: 0; } }
  .cheatbar { display: none; position: fixed; left: 0; right: 0; bottom: calc(6px + var(--sab)); z-index: 30; justify-content: center; gap: 6px; flex-wrap: wrap; padding: 0 8px; }
  body.cheat.battle .cheatbar { display: flex; }
  body.cheat #scr-battle { padding-bottom: calc(44px + var(--sab)); }
  .cheatbar button { background: #111827; color: #86efac; border: 1px solid #22c55e; border-radius: 999px; padding: 5px 10px; font-size: 11px; font-family: inherit; font-weight: 900; cursor: pointer; }

  /* ===== なぞり操作・エフェクト ===== */
  .tile.held { opacity: 0.35; filter: none; }
  .tile.slide { animation: slidein 0.12s ease-out; }
  @keyframes slidein { from { transform: scale(0.8); } to { transform: scale(1); } }
  .drag-ghost { position: absolute; left: 0; top: 0; z-index: 5; pointer-events: none; transform-origin: center; filter: drop-shadow(0 10px 14px rgba(0,0,0,0.7)) drop-shadow(0 0 12px rgba(255,255,255,0.6)); }
  .drag-ghost .orb { width: 100%; height: 100%; display: block; transform: scale(1.18); }
  .dragbar { height: 6px; border-radius: 999px; background: rgba(255,255,255,0.08); margin: 6px 2px 4px; overflow: hidden; opacity: 0; transition: opacity 0.2s; }
  .dragbar.on { opacity: 1; }
  .dragbar > i { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, #fbbf24, #ff6a00); box-shadow: 0 0 10px rgba(251,191,36,0.8); }
  #fx { position: fixed; inset: 0; pointer-events: none; z-index: 40; overflow: hidden; }
  .pt { position: absolute; width: 7px; height: 7px; border-radius: 50%; margin: -3px 0 0 -3px; animation: pt 0.6s ease-out forwards; box-shadow: 0 0 6px currentColor; }
  .pt.big { width: 11px; height: 11px; margin: -5px 0 0 -5px; }
  @keyframes pt { to { transform: translate(var(--dx), var(--dy)) scale(0); opacity: 0; } }
  .shock { position: absolute; width: 20px; height: 20px; margin: -10px 0 0 -10px; border-radius: 50%; border: 3px solid #fff; animation: shock 0.45s ease-out forwards; }
  @keyframes shock { to { transform: scale(7); opacity: 0; border-width: 1px; } }
  .proj { position: absolute; width: 36px; height: 36px; z-index: 41; transition: transform 0.32s cubic-bezier(.3,0,.7,.4); filter: drop-shadow(0 0 10px #fff); }
  .proj .orb { width: 100%; height: 100%; display: block; }
  .combo.c3 { font-size: 26px; color: #fff7c2; } .combo.c4 { font-size: 30px; color: #ffe08a; } .combo.c5 { font-size: 34px; color: #ffb21c; } .combo.c6 { font-size: 40px; color: #ff6a00; text-shadow: 0 0 20px #ff6a00, 0 2px 0 #7f1d1d; }
  .dmg.eff { font-size: 16px; color: #ffe08a; animation-duration: 1.1s; } .dmg.weak { font-size: 14px; color: #93c5fd; }
  #slash { position: absolute; inset: 0; pointer-events: none; opacity: 0; }
  #slash::before, #slash::after { content: ''; position: absolute; left: -20%; right: -20%; top: 50%; height: 6px; background: linear-gradient(90deg, transparent, #fff 30%, #ff5a5f 50%, #fff 70%, transparent); transform: rotate(-28deg); filter: blur(0.5px); }
  #slash::after { transform: rotate(22deg); top: 40%; height: 4px; }
  #slash.on { animation: slash 0.35s ease-out; }
  @keyframes slash { 0% { opacity: 0; transform: scale(0.6); } 20% { opacity: 1; } 100% { opacity: 0; transform: scale(1.3); } }
  .enemy .ph.enter { animation: enter 0.7s cubic-bezier(.2,.8,.2,1.2); }
  @keyframes enter { 0% { transform: scale(0.2); opacity: 0; filter: brightness(3) blur(6px); } 60% { transform: scale(1.12); opacity: 1; filter: brightness(1.6) blur(0); } 100% { transform: scale(1); } }
  .enemy .ph.lunge { animation: lungeE 0.32s ease-in; }
  @keyframes lungeE { 0% { transform: scale(1); } 100% { transform: translateY(70px) scale(1.25); filter: brightness(1.4); } }
  #scr-battle.lowhp::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 90px rgba(239,68,68,0.55); animation: lowhp 1s ease-in-out infinite alternate; border-radius: 0; }
  @keyframes lowhp { from { opacity: 0.35; } to { opacity: 1; } }
  /* VS 画面 */
  .vsm { background: rgba(2,6,23,0.92); overflow: hidden; }
  .vs-stripes { position: absolute; inset: -50% 0; background: repeating-linear-gradient(-30deg, transparent 0 40px, rgba(251,191,36,0.07) 40px 80px); animation: stripes 2s linear infinite; }
  .vsm.boss .vs-stripes { background: repeating-linear-gradient(-30deg, transparent 0 40px, rgba(239,68,68,0.14) 40px 80px); }
  @keyframes stripes { to { transform: translateY(80px); } }
  .vs-box { position: relative; text-align: center; animation: fadein 0.4s; }
  .vs-stage { font-family: 'Rubik', sans-serif; font-weight: 900; font-size: 22px; letter-spacing: 0.3em; color: var(--gold); }
  .vs-warn { font-family: 'Rubik', sans-serif; font-weight: 900; font-size: 34px; letter-spacing: 0.3em; color: #ff5a5f; text-shadow: 0 0 20px rgba(255,90,95,0.9); animation: pulse 0.5s ease-in-out infinite; margin: 4px 0; }
  .vs-img { width: 200px; height: 200px; border-radius: 50%; margin: 14px auto; background: #1e293b center/cover no-repeat; border: 4px solid rgba(255,255,255,0.2); box-shadow: 0 0 60px rgba(251,191,36,0.35), 0 20px 50px rgba(0,0,0,0.7); animation: vsimg 1.2s cubic-bezier(.2,.8,.2,1) both; }
  .vsm.boss .vs-img { width: 240px; height: 240px; border-color: rgba(255,90,95,0.6); box-shadow: 0 0 80px rgba(255,90,95,0.5), 0 20px 50px rgba(0,0,0,0.7); }
  .vs-img.hidden-face { filter: brightness(0.08) contrast(1.4); }
  @keyframes vsimg { from { transform: scale(2.2) translateY(30px); opacity: 0; filter: blur(8px); } to { transform: none; opacity: 1; filter: none; } }
  .vs-name { font-size: 26px; font-weight: 900; text-shadow: 0 2px 10px rgba(0,0,0,0.8); animation: fadein 0.5s 0.5s both; }
  .vs-desc { font-size: 13px; color: #cbd5e1; margin-top: 6px; padding: 0 20px; animation: fadein 0.5s 0.8s both; }
  /* ★5 カットイン */
  .cutin { background: rgba(2,6,23,0.9); overflow: hidden; }
  .rays { position: absolute; left: 50%; top: 50%; width: 200vmax; height: 200vmax; margin: -100vmax 0 0 -100vmax; background: repeating-conic-gradient(from 0deg, rgba(251,191,36,0) 0 10deg, rgba(251,191,36,0.35) 10deg 16deg, rgba(251,191,36,0) 16deg 30deg, rgba(255,255,255,0.25) 30deg 34deg, rgba(251,191,36,0) 34deg 45deg); animation: rays 6s linear infinite; z-index: 0; }
  .cutin-body { z-index: 1; }
  @keyframes rays { to { transform: rotate(360deg); } }
  .cutin-body { position: relative; text-align: center; }
  .cutin-tag { font-family: 'Rubik', sans-serif; font-weight: 900; font-size: 30px; letter-spacing: 0.1em; color: #fff; text-shadow: 0 0 20px var(--gold), 0 3px 0 #92400e; animation: tagin 0.6s cubic-bezier(.2,.8,.2,1.4) both; }
  @keyframes tagin { from { transform: translateX(-120vw) skewX(-20deg); } to { transform: none; } }
  .cutin-img { width: 240px; height: 240px; border-radius: 24px; margin: 14px auto; background: #1e293b center/cover no-repeat; border: 4px solid #ffd93d; box-shadow: 0 0 80px rgba(255,217,61,0.8), 0 20px 60px rgba(0,0,0,0.8); animation: cutimg 0.9s cubic-bezier(.2,.8,.2,1.1) both; }
  @keyframes cutimg { 0% { transform: scale(0.2) rotate(-10deg); opacity: 0; filter: brightness(4) blur(10px); } 60% { transform: scale(1.08); opacity: 1; filter: brightness(1.5) blur(0); } 100% { transform: scale(1); filter: none; } }
  .cutin-name { font-size: 20px; font-weight: 900; color: #fff7d6; text-shadow: 0 2px 10px rgba(0,0,0,0.8); animation: fadein 0.5s 0.6s both; }

  /* ===== 必殺技 ===== */
  .team .m .ph { cursor: pointer; }
  .team .m .gauge { position: absolute; inset: -5px; border-radius: 18px; padding: 2px; pointer-events: none;
    background: conic-gradient(var(--gc, #fbbf24) calc(var(--p, 0) * 1%), rgba(255,255,255,0.08) 0); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; transition: --p 0.3s; }
  .team .m .ph.ready { animation: ready 0.9s ease-in-out infinite alternate; }
  @keyframes ready { from { box-shadow: 0 0 10px 2px rgba(251,191,36,0.6), 0 6px 14px rgba(0,0,0,0.4); transform: scale(1); } to { box-shadow: 0 0 26px 8px rgba(251,191,36,1), 0 6px 14px rgba(0,0,0,0.4); transform: scale(1.06); } }
  .team .m .ph .rb { position: absolute; left: 50%; top: -12px; transform: translateX(-50%); background: linear-gradient(180deg, #fff3a3, #fbbf24); color: #7c2d12; font-size: 9px; font-weight: 900; padding: 1px 7px; border-radius: 999px; white-space: nowrap; display: none; box-shadow: 0 2px 6px rgba(0,0,0,0.5); z-index: 3; }
  .team .m .ph.ready .rb { display: block; animation: pulse 0.6s ease-in-out infinite; }
  .team .m .sk { font-size: 9px; color: #cbd5e1; margin-top: 2px; max-width: 90px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center; }
  .skillm { background: rgba(0,0,0,0.78); overflow: hidden; z-index: 60; }
  .speedlines { position: absolute; left: 50%; top: 50%; width: 220vmax; height: 220vmax; margin: -110vmax 0 0 -110vmax; opacity: 0.8;
    background: repeating-conic-gradient(from 0deg, rgba(255,255,255,0) 0 2.5deg, rgba(255,255,255,0.35) 2.5deg 3.2deg, rgba(255,255,255,0) 3.2deg 7deg); animation: spin 0.9s linear infinite, zoomin 0.4s ease-out; }
  @keyframes spin { to { transform: rotate(40deg); } }
  @keyframes zoomin { from { transform: scale(0.3); opacity: 0; } }
  .skill-body { position: relative; text-align: center; width: 100%; }
  .skill-img { width: min(70vw, 300px); height: min(70vw, 300px); border-radius: 50%; margin: 0 auto; background: #1e293b center/cover no-repeat; border: 5px solid var(--sc, #fbbf24);
    box-shadow: 0 0 60px var(--sc, #fbbf24), 0 0 140px var(--sc, #fbbf24), 0 20px 60px rgba(0,0,0,0.8); animation: slam 0.5s cubic-bezier(.2,.9,.3,1.3) both; }
  @keyframes slam { 0% { transform: translateX(-120vw) rotate(-30deg) scale(0.6); } 70% { transform: translateX(6vw) rotate(4deg) scale(1.08); } 100% { transform: none; } }
  .skill-name { font-family: 'M PLUS Rounded 1c', 'Rubik', sans-serif; font-weight: 900; font-size: clamp(30px, 11vw, 54px); font-style: italic; color: #fff; margin-top: 14px; line-height: 1.1; padding: 0 10px;
    text-shadow: 0 0 20px var(--sc, #fbbf24), 0 0 40px var(--sc, #fbbf24), 0 4px 0 #000; animation: namein 0.5s 0.25s cubic-bezier(.2,.9,.3,1.2) both; }
  @keyframes namein { 0% { transform: translateX(120vw) skewX(-25deg); letter-spacing: 0.5em; } 100% { transform: skewX(-8deg); letter-spacing: 0.02em; } }
  .skill-user { font-size: 14px; color: #fde68a; margin-top: 8px; animation: fadein 0.4s 0.5s both; }
  .skillm.hit::after { content: ''; position: absolute; inset: 0; background: #fff; animation: flash 0.5s ease-out; }
  .dmg.ult { font-size: 68px; color: #fff; text-shadow: 0 0 24px #fbbf24, 0 0 60px #ff6a00, 0 4px 0 #7f1d1d; animation-duration: 1.3s; }
  .shock.big { width: 40px; height: 40px; margin: -20px 0 0 -20px; border-width: 6px; animation-duration: 0.8s; }
  .d-skill { display: flex; justify-content: center; align-items: center; gap: 10px; }
  .d-skill .ph { width: 56px; height: 56px; border-radius: 14px; background: #334155; border: 3px solid #fbbf24; box-shadow: 0 0 18px #fbbf24; animation: ready 0.9s infinite alternate; position: relative; }

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
  .reward { display: flex; gap: 8px; justify-content: center; margin: 8px 0; flex-wrap: wrap; }
  .reward span { background: #0b1226; border: 1px solid #334155; border-radius: 999px; padding: 5px 12px; font-size: 13px; }
  .lvup { text-align: center; color: #86efac; font-size: 13px; margin-bottom: 6px; animation: fadein 0.5s; }

  /* ===== モーダル（チュートリアル・裏パネル） ===== */
  .modal { position: fixed; inset: 0; z-index: 50; display: none; background: rgba(5, 8, 20, 0.86); backdrop-filter: blur(6px); align-items: center; justify-content: center; padding: 16px; }
  .modal.on { display: flex; }
  .tut-box { width: 100%; max-width: 420px; background: linear-gradient(180deg, #1a2342, #0f162d); border: 1px solid rgba(251,191,36,0.4); border-radius: 22px; padding: 20px 18px 16px; box-shadow: 0 0 60px rgba(251,191,36,0.2), 0 20px 50px rgba(0,0,0,0.6); animation: fadein 0.3s; }
  .tut-box .tag { font-size: 11px; color: var(--gold); letter-spacing: 0.2em; text-align: center; }
  .tut-box h3 { font-size: 19px; margin: 4px 0 10px; text-align: center; }
  .tut-box p { font-size: 14px; line-height: 1.8; color: #dbe3f5; margin: 0 0 10px; text-align: center; }
  .tut-guide { display: flex; gap: 8px; align-items: flex-start; margin-bottom: 8px; }
  .tut-guide .basil-svg { width: 64px; height: 64px; }
  .tut-guide .bubble { font-size: 13px; }
  .tut-demo { display: flex; justify-content: center; gap: 6px; margin: 10px auto 14px; height: 56px; align-items: center; }
  .tut-demo .tile { width: 46px; height: 46px; }
  .tut-dots { display: flex; justify-content: center; gap: 6px; margin: 6px 0 12px; }
  .tut-dots i { width: 8px; height: 8px; border-radius: 50%; background: #334155; }
  .tut-dots i.on { background: var(--gold); box-shadow: 0 0 8px var(--gold); }
  .tut-nav { display: flex; gap: 8px; }
  .tut-nav .btn { margin-top: 0; }
  .tut-badges { display: flex; justify-content: center; gap: 8px; flex-wrap: wrap; margin: 10px 0; }
  .tut-badges span { font-size: 12px; background: #0b1226; border: 1px solid #334155; border-radius: 999px; padding: 4px 10px; }
  .d1 .a { animation: d1a 3s infinite; } .d1 .b { animation: d1b 3s infinite; }
  .d1 .r { animation: d1r 3s infinite; }
  @keyframes d1a { 0%,30% { transform: translateX(0); } 45%,100% { transform: translateX(52px); } }
  @keyframes d1b { 0%,30% { transform: translateX(0); } 45%,100% { transform: translateX(-52px); } }
  @keyframes d1r { 0%,55% { filter: none; transform: scale(1); opacity: 1; } 65% { filter: brightness(2); transform: scale(1.2); } 80%,95% { transform: scale(0); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
  .d2 { gap: 14px; }
  .d2 .ph { width: 50px; height: 50px; border-radius: 12px; background: #334155; border: 3px solid var(--fire); display: flex; align-items: center; justify-content: center; font-size: 20px; }
  .d2 .arrow { font-size: 22px; color: var(--gold); animation: pulse 1s infinite; }
  .d2 .foe { width: 50px; height: 50px; border-radius: 50%; background: #3b0f3f; border: 3px solid var(--wood); display: flex; align-items: center; justify-content: center; font-size: 20px; }
  .cheat-box { width: 100%; max-width: 380px; background: #020617; border: 1px solid #22c55e; border-radius: 16px; padding: 16px; font-family: 'Rubik', 'M PLUS Rounded 1c', monospace; box-shadow: 0 0 40px rgba(34,197,94,0.3); }
  .cheat-box h3 { color: #86efac; font-size: 14px; margin: 0 0 10px; letter-spacing: 0.2em; }
  .cheat-box input { width: 100%; background: #000; color: #86efac; border: 1px solid #166534; border-radius: 8px; padding: 10px; font-family: inherit; font-size: 15px; }
  .cheat-box .btn { margin-top: 8px; padding: 10px; font-size: 13px; }
  .cheat-box .list { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
  .cheat-box .list button { background: #052e16; color: #bbf7d0; border: 1px solid #166534; border-radius: 8px; padding: 10px 6px; font-family: inherit; font-weight: 900; font-size: 12px; cursor: pointer; }
  .cheat-box .st { font-size: 11px; color: #4ade80; margin-top: 8px; min-height: 1em; }
</style>
</head>
<body>
${ORB_DEFS}
<div class="wrap">
  <div class="logo" id="logo">${LOGO_SVG}<div class="s">PUZZLE &amp; TAXI BATTLE</div></div>

  <!-- 参戦 -->
  <div class="scr" id="scr-reg">
    <div class="guide">${BASIL_SVG}<div class="basil-img"></div><div class="bubble"><span class="nm">案内人 バジル</span>ようこそ、バジル&amp;ドラゴンズへ！ まずは参戦登録をしてね。社員番号があれば、別のスマホでも記録が続くよ。</div></div>
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
    <div class="guide">${BASIL_SVG}<div class="basil-img"></div><div class="bubble"><span class="nm">案内人 バジル</span><span id="basil-say"></span></div></div>
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <div><div class="who" id="home-nick"></div><div class="best" id="home-best"></div></div>
        <div style="text-align:right;"><span class="coin" id="home-coins">0</span><br><button class="link" id="btn-rename" style="padding:4px 0 0;">名前を変える</button></div>
      </div>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between;"><h2 style="margin:0;">チーム</h2><button class="back" id="btn-team">チームを組む</button></div>
      <div class="team" id="home-team" style="margin-top:10px;"></div>
    </div>
    <button class="btn" id="btn-start">バトル開始</button>
    <div class="btn2">
      <button class="btn pink" id="btn-gacha">ガチャ<span class="sub" id="gacha-cost-lbl"></span></button>
      <button class="btn green" id="btn-chars">キャラ・育成<span class="sub">強化・レベルアップ</span></button>
    </div>
    <button class="btn ghost" id="btn-rank">ランキングを見る</button>
    <button class="btn ghost" id="btn-howto">あそびかた</button>
    <button class="link" id="btn-logout" style="display:block;margin:10px auto 0;">別の人で参戦する</button>
  </div>

  <!-- チーム編成 -->
  <div class="scr" id="scr-team">
    <div class="topbar"><button class="back" id="btn-team-back">← 戻る</button><span class="coin" id="team-coins">0</span></div>
    <div class="card">
      <h2>味方を<span id="team-n">3</span>人えらぶ</h2>
      <div class="help" style="margin-bottom:10px;">色（属性）をばらけさせると、いろんな玉で攻撃できます。持っていないキャラはガチャで手に入ります。</div>
      <div class="tabs" id="team-tabs"><button data-k="all" class="on">すべて</button><button data-k="photo">社員</button><button data-k="art">ガチャキャラ</button></div>
      <div class="grid" id="ally-grid"></div>
      <button class="btn" id="btn-team-ok" disabled>決定</button>
    </div>
  </div>

  <!-- ガチャ -->
  <div class="scr" id="scr-gacha">
    <div class="topbar"><button class="back" id="btn-gacha-back">← 戻る</button><span class="coin" id="gacha-coins">0</span></div>
    <div class="card">
      <h2>バジルガチャ</h2>
      <div class="gacha-stage" id="gacha-stage"><div class="capsule" id="capsule"></div></div>
      <div id="gacha-result"></div>
      <div class="btn2">
        <button class="btn pink" id="btn-pull1">1回<span class="sub" id="pull1-cost"></span></button>
        <button class="btn pink" id="btn-pull10">10連<span class="sub" id="pull10-cost"></span></button>
      </div>
      <div class="rate">★5: 4%　★4: 26%　★3: 70%　／ 10連は1回ぶんおトク＆最後の1枚は★4以上かくてい<br>同じキャラが出たら経験値になります（★×100）</div>
      <div class="err" id="err-gacha"></div>
    </div>
    <div class="card"><h2>ガチャに出るキャラ</h2><div class="grid" id="gacha-pool"></div></div>
  </div>

  <!-- キャラ・育成 -->
  <div class="scr" id="scr-chars">
    <div class="topbar"><button class="back" id="btn-chars-back">← 戻る</button><span class="coin" id="chars-coins">0</span></div>
    <div class="card">
      <h2>キャラ・育成</h2>
      <div class="help" style="margin-bottom:8px;">バトルで経験値がたまってレベルが上がります。「強化」でコインを使ってすぐ経験値を足せます（1回 <b id="train-cost-lbl"></b> コイン・150exp）。レベルが上がるとHPと攻撃が5%ずつ強くなります。</div>
      <div class="tabs" id="chars-tabs"><button data-k="owned" class="on">持っている</button><button data-k="all">ずかん</button></div>
      <div id="chars-list"></div>
    </div>
  </div>

  <!-- 結果 -->
  <div class="scr" id="scr-result">
    <div class="card res">
      <div class="ttl" id="res-ttl"></div>
      <div class="big" id="res-score"></div>
      <div class="nb" id="res-nb"></div>
      <div class="reward" id="res-reward"></div>
      <div class="lvup" id="res-lvup"></div>
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
    <div class="btn2"><button class="btn pink" id="btn-res-gacha">ガチャへ</button><button class="btn green" id="btn-res-chars">育成へ</button></div>
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
    <div class="bossbanner" id="bossbanner">BOSS</div>
    <div id="slash"></div>
    <div class="enemy">
      <div class="ph" id="en-ph"></div>
      <div class="nm" id="en-nm"></div>
      <div class="meta"><span id="en-el"></span><span>HP <b id="en-hp"></b></span><span class="cnt" id="en-cnt"></span></div>
      <div class="bar"><i id="en-bar"></i></div>
    </div>
  </div>
  <div class="team" id="bt-team"></div>
  <div class="teamhp"><div class="bar me" id="me-barwrap"><i id="me-bar"></i></div><b id="me-hp"></b></div>
  <div class="dragbar" id="dragbar"><i id="dragbar-i"></i></div>
  <div id="board"></div>
  <div class="msg" id="msg"></div>
</div>
<div id="fx"></div>
<div class="modal vsm" id="vs">
  <div class="vs-stripes"></div>
  <div class="vs-box">
    <div class="vs-stage" id="vs-stage">STAGE 1</div>
    <div class="vs-warn" id="vs-warn">WARNING</div>
    <div class="vs-img" id="vs-img"></div>
    <div class="vs-name" id="vs-name"></div>
    <div class="vs-desc" id="vs-desc"></div>
  </div>
</div>
<div class="modal cutin" id="cutin">
  <div class="rays"></div>
  <div class="cutin-body">
    <div class="cutin-tag">★★★★★ GET!!</div>
    <div class="cutin-img" id="cutin-img"></div>
    <div class="cutin-name" id="cutin-name"></div>
  </div>
</div>
<div class="float" id="float"></div>
<div class="cheatbar" id="cheatbar">
  <button data-c="kill">一撃必殺</button><button data-c="heal">HP全回復</button><button data-c="god">無敵ON/OFF</button><button data-c="skip">ステージスキップ</button><button data-c="gauge">必殺ゲージMAX</button>
</div>

<!-- 必殺技 -->
<div class="modal skillm" id="skill">
  <div class="speedlines"></div>
  <div class="skill-body">
    <div class="skill-img" id="skill-img"></div>
    <div class="skill-name" id="skill-name"></div>
    <div class="skill-user" id="skill-user"></div>
  </div>
</div>

<!-- チュートリアル -->
<div class="modal" id="tut">
  <div class="tut-box">
    <div class="tag">HOW TO PLAY</div>
    <h3 id="tut-h"></h3>
    <div id="tut-body"></div>
    <div class="tut-dots" id="tut-dots"></div>
    <div class="tut-nav"><button class="btn ghost" id="tut-prev">もどる</button><button class="btn" id="tut-next">つぎへ</button></div>
  </div>
</div>

<!-- 裏パネル（ロゴを5回タップ → 合言葉） -->
<div class="modal" id="cheat">
  <div class="cheat-box">
    <h3>// HIDDEN CONSOLE</h3>
    <div id="cheat-login">
      <input id="cheat-cmd" type="text" placeholder="command" autocomplete="off" autocapitalize="off">
      <button class="btn green" id="cheat-go">ENTER</button>
    </div>
    <div id="cheat-menu" style="display:none;">
      <div class="st">裏パネル ON。バトル中は画面下にチートボタンが出ます。チートで遊んだ記録はランキングに入りません。</div>
      <div class="list">
        <button data-a="coins">コイン +10000</button><button data-a="unlock_all">全キャラ入手</button>
        <button data-a="level_max">全キャラ LvMAX</button><button data-a="reset_me">自分のデータ初期化</button>
      </div>
    </div>
    <div class="st" id="cheat-st"></div>
    <button class="btn ghost" id="cheat-close" style="margin-top:10px;padding:10px;font-size:13px;">とじる</button>
  </div>
</div>

<script>
(function(){
  var API = '/api/public/puzzle';
  var LS_TOKEN = 'hoshikon_puzzle_token', LS_TEAM = 'hoshikon_puzzle_team', LS_TUT = 'hoshikon_puzzle_tut';
  var CFG = null, ME = null, TEAM = [], STATE = null;
  var EL_LABEL = { fire: '火', water: '水', wood: '木', light: '光', dark: '闇', heart: '回復' };
  var EL_COLOR = { fire: '#ff5a5f', water: '#3fa9ff', wood: '#41d47d', light: '#ffd93d', dark: '#b66dff' };
  var TYPES = ['fire', 'water', 'wood', 'light', 'dark', 'heart'];
  var W = 6, H = 5;
  var CHEAT = { on: false, cmd: '', god: false };

  function $(id){ return document.getElementById(id); }
  function show(id){ document.querySelectorAll('.scr').forEach(function(s){ s.classList.remove('on'); }); $(id).classList.add('on'); document.body.classList.toggle('battle', id === 'scr-battle'); window.scrollTo(0,0); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(ch){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]; }); }
  function post(path, body){ return fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) }).then(function(r){ return r.json(); }); }
  function elDot(e){ return '<span class="el el-' + e + '"></span>' + (EL_LABEL[e] || ''); }
  function stars(n){ return '<span class="stars">' + '★'.repeat(n) + '</span>'; }
  function imgUrl(a){ return API + '/img/ally/' + a.id; }
  function phStyle(a){ return 'background-image:url(' + imgUrl(a) + ');' + (a.kind === 'photo' ? 'background-position:' + a.ox + '% ' + a.oy + '%;background-size:' + Math.round(a.sc * 100) + '%;' : ''); }
  function allyPh(a, cls, ring){ return '<div class="' + cls + '" style="' + phStyle(a) + '">' + (ring ? '<span class="ring" style="background:' + EL_COLOR[a.element] + '"></span>' : '') + '</div>'; }
  function fmtBest(b){ if (!b) return 'まだ記録がありません'; return '自己ベスト ' + b.score.toLocaleString() + ' 点（' + (b.cleared ? '全クリア' : b.stages_cleared + '体たおした') + '）'; }
  function adv(att, def){
    if (att === 'fire' && def === 'wood') return 2; if (att === 'wood' && def === 'water') return 2; if (att === 'water' && def === 'fire') return 2;
    if (att === 'wood' && def === 'fire') return 0.5; if (att === 'water' && def === 'wood') return 0.5; if (att === 'fire' && def === 'water') return 0.5;
    if ((att === 'light' && def === 'dark') || (att === 'dark' && def === 'light')) return 2;
    return 1;
  }
  function vibrate(ms){ try { if (navigator.vibrate) navigator.vibrate(ms); } catch(e) {} }
  // 育成: レベル・ステータス
  function levelOf(exp){ return Math.min(CFG.max_level, Math.floor(Math.sqrt(Math.max(0, exp) / 40)) + 1); }
  function expFor(level){ return 40 * (level - 1) * (level - 1); }
  function charState(id){ if (!STATE) return null; for (var i = 0; i < STATE.chars.length; i++) if (STATE.chars[i].id === id) return STATE.chars[i]; return null; }
  function owned(a){ return !!charState(a.id); }
  function statOf(a){ var cs = charState(a.id); var lv = cs ? levelOf(cs.exp) : 1; var m = 1 + 0.05 * (lv - 1); return { lv: lv, hp: Math.round(a.hp * m), atk: Math.round(a.atk * m) }; }
  function setCoins(n){ if (STATE) STATE.coins = n; ['home-coins','team-coins','gacha-coins','chars-coins'].forEach(function(id){ $(id).textContent = (n || 0).toLocaleString(); }); }

  // ---------- 起動 ----------
  fetch(API + '/config').then(function(r){ return r.json(); }).then(function(cfg){
    CFG = cfg; document.title = cfg.title;
    if (cfg.guide_img) { document.body.classList.add('guide-img'); document.querySelectorAll('.basil-img').forEach(function(el){ el.style.backgroundImage = 'url(' + API + '/img/guide)'; }); }
    $('gacha-cost-lbl').textContent = '1回 ' + cfg.gacha_cost + ' コイン'; $('train-cost-lbl').textContent = cfg.train_cost;
    $('pull1-cost').textContent = cfg.gacha_cost + ' コイン'; $('pull10-cost').textContent = (cfg.gacha_cost * 9) + ' コイン';
    if (!cfg.open) { show('scr-closed'); return; }
    var tok = null; try { tok = localStorage.getItem(LS_TOKEN); } catch(e) {}
    if (tok) { loadState(tok).then(function(ok){ if (ok) goHome(); else show('scr-reg'); }); }
    else show('scr-reg');
  });
  function loadState(tok){
    return post('/state', { token: tok }).then(function(j){
      if (!j.nickname) return false;
      STATE = j; ME = { token: tok, nickname: j.nickname, best: j.best }; setCoins(j.coins); return true;
    });
  }

  // ---------- 参戦 ----------
  var pendingEmp = '';
  function enter(token, first){ saveToken(token); loadState(token).then(function(){ goHome(); if (first) openTut(true); }); }
  $('btn-lookup').onclick = function(){
    $('err-reg').textContent = '';
    var emp = $('emp').value.trim(); if (!emp) { $('err-reg').textContent = '社員番号を入力してください'; return; }
    post('/lookup', { emp_no: emp }).then(function(j){
      if (j.error) { $('err-reg').textContent = j.error; return; }
      if (j.registered) { enter(j.token, false); return; }
      pendingEmp = emp; $('nick-real').textContent = j.name + ' さん'; $('nick1').value = ''; show('scr-nick'); $('nick1').focus();
    });
  };
  $('btn-back-reg').onclick = function(){ show('scr-reg'); };
  $('btn-reg-emp').onclick = function(){
    $('err-nick').textContent = '';
    post('/register', { emp_no: pendingEmp, nickname: $('nick1').value }).then(function(j){ if (j.error) { $('err-nick').textContent = j.error; return; } enter(j.token, true); });
  };
  $('btn-reg-nick').onclick = function(){
    $('err-reg2').textContent = '';
    post('/register', { nickname: $('nick0').value }).then(function(j){ if (j.error) { $('err-reg2').textContent = j.error; return; } enter(j.token, true); });
  };
  function saveToken(t){ try { localStorage.setItem(LS_TOKEN, t); } catch(e) {} }
  $('btn-logout').onclick = function(){ try { localStorage.removeItem(LS_TOKEN); localStorage.removeItem(LS_TEAM); } catch(e) {} ME = null; STATE = null; TEAM = []; $('emp').value = ''; show('scr-reg'); };
  $('btn-rename').onclick = function(){
    var n = prompt('新しいニックネーム（12文字まで）', ME.nickname); if (n === null) return;
    post('/nickname', { token: ME.token, nickname: n }).then(function(j){ if (j.error) { alert(j.error); return; } ME.nickname = j.nickname; goHome(); });
  };

  // ---------- ホーム（案内人） ----------
  var SAY = [
    'チームを組んで「バトル開始」！ まずはワンメーターババアから倒していこう。',
    'コインがたまったらガチャを引いてね。★5はなかなか出ないけど…ふふ。',
    '同じ色の味方がいないと攻撃できないよ。チームは色をばらけさせるのがコツ。',
    'レベルが上がるとHPと攻撃が5%ずつアップ。負けたら育成してから再挑戦！',
    'ハートの玉は回復。敵の「あと○手」には気をつけてね。',
    'ボスは強いよ。ラスボスの正体は…まだ内緒。',
    '営業所のみんなの写真、かっこよく撮れてるよね。わたしは…妖精だから写真はないの。',
    'ランキング1位をめざそう！ ニックネームしか出ないから安心してね。'
  ];
  function allyById(id){ for (var i = 0; i < CFG.allies.length; i++) if (CFG.allies[i].id === id) return CFG.allies[i]; return null; }
  function loadTeam(){
    var ids = []; try { ids = JSON.parse(localStorage.getItem(LS_TEAM) || '[]'); } catch(e) {}
    TEAM = ids.map(allyById).filter(function(a){ return a && owned(a); }).slice(0, CFG.team_size);
  }
  function goHome(){
    loadTeam();
    $('basil-say').textContent = SAY[Math.floor(Math.random() * SAY.length)];
    $('home-nick').textContent = ME.nickname + ' さん';
    $('home-best').textContent = fmtBest(ME.best);
    setCoins(STATE.coins);
    $('home-team').innerHTML = TEAM.length ? TEAM.map(function(a){ var s = statOf(a); return '<div class="m">' + allyPh(a, 'ph', true) + '<span class="lv">Lv.' + s.lv + '</span></div>'; }).join('') : '<div class="help">まだチームを組んでいません。「チームを組む」を押してね</div>';
    var n = Math.min(CFG.team_size, STATE.chars.length);
    $('btn-start').disabled = TEAM.length < n || CFG.enemies.length === 0 || n === 0;
    if (CFG.enemies.length === 0) $('btn-start').textContent = '敵がまだいません（準備中）';
    else if (n === 0) $('btn-start').textContent = '味方がまだいません（準備中）';
    else if (TEAM.length < n) $('btn-start').textContent = 'まずチームを組もう';
    else $('btn-start').textContent = 'バトル開始';
    show('scr-home');
  }
  $('btn-team').onclick = openTeam;
  $('btn-start').onclick = function(){ if ($('btn-start').disabled) return; if (!tutSeen()) { openTut(false, startBattle); return; } startBattle(); };
  $('btn-rank').onclick = openRank; $('btn-res-rank').onclick = openRank;
  $('btn-rank-back').onclick = function(){ goHome(); };
  $('btn-res-home').onclick = function(){ goHome(); };
  $('btn-again').onclick = startBattle;
  $('btn-howto').onclick = function(){ openTut(false); };
  $('btn-gacha').onclick = openGacha; $('btn-res-gacha').onclick = openGacha; $('btn-gacha-back').onclick = function(){ goHome(); };
  $('btn-chars').onclick = openChars; $('btn-res-chars').onclick = openChars; $('btn-chars-back').onclick = function(){ goHome(); };

  // ---------- チュートリアル（バジルが案内） ----------
  var TUT = [
    { h: '玉を持って、なぞって動かそう', say: 'わたしはバジル。あそびかたを教えるね！', p: '玉を<b>指で持ったまま、盤面をなぞる</b>と通った玉と次々入れかわります。指を離すと確定（<b>5秒</b>の制限時間あり）。<br>同じ色が<b>3つ以上</b>ならぶと消えます。',
      demo: '<div class="tut-demo d1"><div class="tile fire r">${orbUse('fire')}</div><div class="tile fire r">${orbUse('fire')}</div><div class="tile water a">${orbUse('water')}</div><div class="tile fire b r">${orbUse('fire')}</div><div class="tile wood">${orbUse('wood')}</div></div>' },
    { h: '色 ＝ 味方の属性', say: '消した色と同じ属性の味方が攻撃するよ。', p: 'その色の味方がいないと攻撃できないので、チームの色はばらけさせましょう。',
      demo: '<div class="tut-demo d2"><div class="tile fire">${orbUse('fire')}</div><div class="arrow">→</div><div class="ph">火</div><div class="arrow">→</div><div class="foe">敵</div></div><div class="tut-badges"><span>火は木に強い</span><span>木は水に強い</span><span>水は火に強い</span><span>光と闇はおたがいに強い</span></div>' },
    { h: 'コンボでダメージアップ', say: '続けて消えると気持ちいいよね！', p: '消えたあとに上から玉が落ちてきて、<b>続けて消えるとコンボ</b>。コンボが増えるほどダメージが大きくなります。',
      demo: '<div class="tut-demo"><span style="font-family:Rubik,sans-serif;font-size:30px;font-weight:900;color:#fff;text-shadow:0 0 14px #fbbf24;">3 COMBO!</span></div>' },
    { h: 'ハートで回復・敵の反撃に注意', say: '「あと1手」が出たら身構えて！', p: '<b>ピンクのハート</b>を消すとチームのHPが回復。<br>敵の「あと○手」が0になると攻撃してきます。チームHPが0になると負け。',
      demo: '<div class="tut-demo"><div class="tile heart">${orbUse('heart')}</div><span class="cnt soon" style="font-size:14px;">あと1手</span></div>' },
    { h: 'ガチャと育成', say: 'バトルでコインと経験値がもらえるよ。', p: 'コインで<b>ガチャ</b>を引くと新しい味方が仲間に。<b>育成</b>でレベルを上げるとHPと攻撃がアップ。負けても強くなって再挑戦！',
      demo: '<div class="tut-demo"><span class="coin" style="font-size:18px;">500</span><span style="font-size:22px;color:#fbbf24;margin:0 8px;">→</span><div class="capsule" style="width:48px;height:48px;"></div></div>' },
    { h: '必殺技！', say: 'ゲージがたまったら、キャラをタップ！', p: '味方と<b>同じ色の玉を消すとゲージ</b>がたまります。満タンになって光ったら、<b>そのキャラをタップ</b>で必殺技。大ダメージか、大回復！',
      demo: '<div class="tut-demo d-skill"><div class="ph"><span class="rb" style="display:block;position:absolute;left:50%;top:-12px;transform:translateX(-50%);background:#fbbf24;color:#7c2d12;font-size:9px;font-weight:900;padding:1px 7px;border-radius:999px;">必殺!</span></div><span style="font-size:22px;color:#fbbf24;">→</span><span style="font-family:Rubik,sans-serif;font-weight:900;font-size:22px;color:#fff;text-shadow:0 0 14px #fbbf24;font-style:italic;">黄金のロングラン!!</span></div>' },
    { h: '敵を順番にたおそう', say: 'ボスの先に、何かが待っている…。', p: 'ステージの敵をぜんぶたおすと<b>全クリア</b>。たおした数・残りHP・手数でスコアが決まり、ランキングにのります。',
      demo: '<div class="tut-demo"><span style="font-family:Rubik,sans-serif;font-size:26px;font-weight:900;background:linear-gradient(180deg,#fff7d6,#fbbf24 60%,#d97706);-webkit-background-clip:text;background-clip:text;color:transparent;">LET&#39;S BATTLE!</span></div>' }
  ];
  var tutIdx = 0, tutAfter = null;
  function tutSeen(){ try { return localStorage.getItem(LS_TUT) === '1'; } catch(e) { return true; } }
  function openTut(first, after){ tutIdx = 0; tutAfter = after || null; renderTut(); $('tut').classList.add('on'); }
  function renderTut(){
    var t = TUT[tutIdx];
    $('tut-h').textContent = t.h;
    $('tut-body').innerHTML = '<div class="tut-guide">' + ${JSON.stringify(BASIL_SVG)} + '<div class="basil-img"></div><div class="bubble"><span class="nm">バジル</span>' + t.say + '</div></div>' + t.demo + '<p>' + t.p + '</p>';
    if (CFG && CFG.guide_img) document.querySelectorAll('#tut .basil-img').forEach(function(el){ el.style.backgroundImage = 'url(' + API + '/img/guide)'; });
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
  var pick = [], teamFilter = 'all';
  function openTeam(){
    pick = TEAM.map(function(a){ return a.id; });
    var n = Math.min(CFG.team_size, STATE.chars.length); $('team-n').textContent = n;
    renderGrid(); show('scr-team');
  }
  document.querySelectorAll('#team-tabs button').forEach(function(b){ b.onclick = function(){ teamFilter = b.getAttribute('data-k'); document.querySelectorAll('#team-tabs button').forEach(function(x){ x.classList.toggle('on', x === b); }); renderGrid(); }; });
  function charCard(a, extraCls, inner){
    var s = statOf(a); var o = owned(a);
    return '<div class="ch r' + a.rarity + (extraCls || '') + '" data-id="' + a.id + '" style="' + (o ? '' : 'opacity:0.45;') + '">' + (inner || '') +
      '<span class="ring" style="background:' + EL_COLOR[a.element] + '"></span>' + allyPh(a, 'ph') +
      (a.kind === 'art' ? '<div class="rr">' + stars(a.rarity) + '</div>' : '') +
      '<span class="lv">Lv.' + s.lv + '</span><div class="nm">' + esc(a.name) + '</div><div class="st">' + elDot(a.element) + ' HP' + s.hp + ' 攻' + s.atk + '</div><div class="st" style="color:#fde68a;padding-top:0;">' + (a.skill && a.skill.type === 'heal' ? '癒' : '技') + ' ' + esc(a.skill ? a.skill.name : '') + '</div></div>';
  }
  function renderGrid(){
    var n = Math.min(CFG.team_size, STATE.chars.length);
    var list = CFG.allies.filter(function(a){ return owned(a) && (teamFilter === 'all' || a.kind === teamFilter); });
    $('ally-grid').innerHTML = list.length ? list.map(function(a){ var idx = pick.indexOf(a.id); return charCard(a, idx >= 0 ? ' sel' : '', '<div class="num">' + (idx + 1) + '</div>'); }).join('') : '<div class="help" style="grid-column:1/-1;">このカテゴリーのキャラはまだ持っていません</div>';
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

  // ---------- ガチャ ----------
  function openGacha(){
    $('gacha-result').innerHTML = ''; $('err-gacha').textContent = '';
    $('capsule').className = 'capsule'; $('capsule').style.display = ''; $('gacha-stage').style.display = '';
    var pool = CFG.allies.filter(function(a){ return a.kind === 'art' && a.in_gacha; }).sort(function(a, b){ return b.rarity - a.rarity; });
    $('gacha-pool').innerHTML = pool.map(function(a){ return charCard(a, '', ''); }).join('');
    setCoins(STATE.coins); show('scr-gacha');
  }
  var pulling = false;
  function pull(n){
    if (pulling) return; pulling = true; $('err-gacha').textContent = ''; $('gacha-result').innerHTML = '';
    var cap = $('capsule'); cap.style.display = ''; $('gacha-stage').style.display = ''; cap.className = 'capsule shake'; vibrate([20, 30, 20, 30, 60]);
    post('/gacha', { token: ME.token, n: n }).then(function(j){
      setTimeout(function(){
        pulling = false;
        if (j.error) { cap.className = 'capsule'; $('err-gacha').textContent = j.error; return; }
        cap.className = 'capsule open'; setCoins(j.coins);
        j.results.forEach(function(r){ var cs = charState(r.id); if (!cs) STATE.chars.push({ id: r.id, exp: 0, level: 1 }); else cs.exp += r.bonus_exp; });
        setTimeout(function(){
          cap.style.display = 'none'; $('gacha-stage').style.display = 'none';
          var fives = j.results.filter(function(r){ return (allyById(r.id) || {}).rarity === 5; });
          if (fives.length) { vibrate([50, 50, 100, 50, 150]); cutinSeq(fives.map(function(r){ return allyById(r.id); }), function(){}); }
          $('gacha-result').innerHTML = '<div class="gres' + (n === 1 ? ' one' : '') + '">' + j.results.map(function(r, i){
            var a = allyById(r.id); if (!a) return '';
            return '<div class="gcard r' + a.rarity + '" style="animation-delay:' + (i * 90) + 'ms"><div class="ph" style="' + phStyle(a) + '"></div><div class="r">' + stars(a.rarity) + '</div>' + (r.dup ? '<span class="dup">+' + r.bonus_exp + 'exp</span>' : '<span class="new">NEW</span>') + '<div class="n">' + esc(a.name) + '</div></div>';
          }).join('') + '</div>';
        }, 450);
      }, 900);
    });
  }
  // ★5 カットイン（金の光線＋キャラがズームイン）
  function cutinSeq(list, done){
    if (!list.length) { done(); return; }
    var a = list.shift(); var ci = $('cutin');
    $('cutin-img').style.backgroundImage = 'url(' + imgUrl(a) + ')'; $('cutin-name').textContent = a.name;
    ci.classList.remove('on'); void ci.offsetWidth; ci.classList.add('on');
    setTimeout(function(){ ci.classList.remove('on'); setTimeout(function(){ cutinSeq(list, done); }, 150); }, 2000);
  }
  $('cutin').onclick = function(){ $('cutin').classList.remove('on'); };
  $('btn-pull1').onclick = function(){ pull(1); };
  $('btn-pull10').onclick = function(){ pull(10); };

  // ---------- キャラ・育成 ----------
  var charsFilter = 'owned';
  function openChars(){ setCoins(STATE.coins); renderChars(); show('scr-chars'); }
  document.querySelectorAll('#chars-tabs button').forEach(function(b){ b.onclick = function(){ charsFilter = b.getAttribute('data-k'); document.querySelectorAll('#chars-tabs button').forEach(function(x){ x.classList.toggle('on', x === b); }); renderChars(); }; });
  function renderChars(){
    var list = CFG.allies.filter(function(a){ return charsFilter === 'all' || owned(a); });
    list = list.slice().sort(function(a, b){ return (owned(b) ? 1 : 0) - (owned(a) ? 1 : 0) || b.rarity - a.rarity || a.id - b.id; });
    $('chars-list').innerHTML = list.map(function(a){
      var o = owned(a); var cs = charState(a.id); var exp = cs ? cs.exp : 0; var s = statOf(a);
      var nextExp = expFor(s.lv + 1), curExp = expFor(s.lv); var pct = s.lv >= CFG.max_level ? 100 : Math.round((exp - curExp) / (nextExp - curExp) * 100);
      return '<div class="cl' + (o ? '' : ' lock') + '" data-id="' + a.id + '"><div class="ph" style="' + phStyle(a) + '"></div><div class="info">' +
        '<div class="n">' + (a.kind === 'art' ? stars(a.rarity) + ' ' : '') + esc(a.name) + '</div>' +
        '<div class="s">' + elDot(a.element) + ' Lv.' + s.lv + '　HP ' + s.hp + '　攻 ' + s.atk + (o ? (s.lv >= CFG.max_level ? '　MAX' : '　次まで ' + (nextExp - exp) + 'exp') : '　（未入手・ガチャで出ます）') + '</div>' +
        (a.skill ? '<div class="s" style="color:#fde68a;">必殺技: ' + esc(a.skill.name) + (a.skill.type === 'heal' ? '（回復 ' + a.skill.power + '%）' : '（攻撃力×' + (a.skill.power / 10) + '）') + '</div>' : '') +
        (a.desc ? '<div class="s" style="color:#cbd5e1;">' + esc(a.desc) + '</div>' : '') +
        (o ? '<div class="xp"><i style="width:' + pct + '%"></i></div>' : '') + '</div>' +
        (o ? '<button class="tr"' + (s.lv >= CFG.max_level ? ' disabled' : '') + '>強化<br><span style="font-size:10px;font-weight:700;">' + CFG.train_cost + '</span></button>' : '') + '</div>';
    }).join('');
    document.querySelectorAll('#chars-list .tr').forEach(function(b){
      b.onclick = function(){
        var id = parseInt(b.closest('.cl').getAttribute('data-id'), 10); b.disabled = true;
        post('/train', { token: ME.token, ally_id: id }).then(function(j){
          if (j.error) { alert(j.error); b.disabled = false; return; }
          var cs = charState(id); if (cs) cs.exp = j.exp; else STATE.chars.push({ id: id, exp: j.exp, level: j.level });
          setCoins(j.coins); if (j.leveled) { floatMsg('LEVEL UP!'); vibrate([30, 40, 60]); } else vibrate(15);
          renderChars();
        });
      };
    });
  }

  // ---------- バトル ----------
  var G = null;
  var DRAG_MS = 5000;       // なぞり操作の制限時間
  function startBattle(){
    loadTeam(); if (!TEAM.length) { openTeam(); return; }
    var maxHp = 0; TEAM.forEach(function(a){ maxHp += statOf(a).hp; });
    G = { stage: 0, hp: maxHp, maxHp: maxHp, moves: 0, enemyHp: 0, cnt: CFG.enemy_interval, busy: true, over: false, board: [], maxCombo: 0, cheated: false, gauge: TEAM.map(function(){ return 0; }), skills: 0 };
    $('bt-team').innerHTML = TEAM.map(function(a, i){ return '<div class="m">' + allyPh(a, 'ph', true).replace('class="ph"', 'class="ph" data-i="' + i + '"').replace('</div>', '<span class="rb">必殺!</span><div class="gauge" style="--gc:' + EL_COLOR[a.element] + '"></div></div>') + '<span class="lv">Lv.' + statOf(a).lv + '</span><span class="sk">' + esc(a.skill ? a.skill.name : '') + '</span></div>'; }).join('');
    document.querySelectorAll('#bt-team .ph').forEach(function(ph){ ph.addEventListener('click', function(){ useSkill(parseInt(ph.getAttribute('data-i'), 10)); }); });
    drawGauges();
    newBoard(); show('scr-battle'); stageIntro();
  }
  function enemy(){ return CFG.enemies[G.stage]; }
  // ステージ開始の演出（VS画面 → 敵の登場）
  function stageIntro(){
    var e = enemy(); G.busy = true;
    var vs = $('vs');
    vs.className = 'modal vsm on' + (e.boss ? ' boss' : '');
    $('vs-stage').textContent = 'STAGE ' + (G.stage + 1);
    $('vs-warn').style.display = e.boss ? '' : 'none';
    $('vs-img').style.backgroundImage = 'url(' + API + '/img/enemy/' + e.id + ')';
    $('vs-img').className = 'vs-img' + (e.final ? ' hidden-face' : '');
    $('vs-name').textContent = e.final ? '？？？' : e.name;
    $('vs-desc').textContent = e.final ? '……' : (e.desc || '');
    vibrate(e.boss ? [40, 60, 40, 60, 120] : 25);
    setTimeout(function(){
      vs.classList.remove('on');
      loadStage();
      var ph = $('en-ph'); ph.classList.add('enter'); setTimeout(function(){ ph.classList.remove('enter'); }, 700);
      if (e.final) { setTimeout(function(){ floatMsg('まさか…バジル！？', true, 'boss'); $('en-nm').textContent = e.name; shakeScreen(); }, 900); }
      setTimeout(function(){ G.busy = false; if (!hasMove()) newBoard(); }, e.final ? 2400 : 800);
    }, e.boss ? 2200 : 1500);
  }
  function loadStage(){
    var e = enemy(); G.enemyHp = e.hp; G.cnt = CFG.enemy_interval;
    $('stage-lbl').innerHTML = 'ステージ <b>' + (G.stage + 1) + '</b> / ' + CFG.enemies.length;
    $('en-nm').textContent = e.final ? '？？？' : e.name; $('en-el').innerHTML = elDot(e.element);
    var ph = $('en-ph'); ph.className = 'ph'; ph.style.backgroundImage = 'url(' + API + '/img/enemy/' + e.id + ')'; ph.textContent = '';
    ph.style.boxShadow = '0 0 0 6px rgba(0,0,0,0.25), 0 18px 40px rgba(0,0,0,0.5), 0 0 70px ' + EL_COLOR[e.element] + '77';
    $('arena').classList.toggle('boss', !!e.boss);
    $('bossbanner').textContent = e.final ? 'FINAL BOSS' : 'BOSS';
    drawHud();
  }
  function drawHud(){
    var e = enemy();
    $('en-hp').textContent = Math.max(0, G.enemyHp) + ' / ' + e.hp;
    $('en-bar').style.width = Math.max(0, G.enemyHp / e.hp * 100) + '%';
    $('en-cnt').textContent = 'あと' + G.cnt + '手'; $('en-cnt').className = 'cnt' + (G.cnt <= 1 ? ' soon' : '');
    $('me-hp').textContent = Math.max(0, G.hp) + ' / ' + G.maxHp;
    $('me-bar').style.width = Math.max(0, G.hp / G.maxHp * 100) + '%';
    var low = G.hp / G.maxHp < 0.3;
    $('me-barwrap').className = 'bar me' + (low ? ' low' : '');
    $('scr-battle').classList.toggle('lowhp', low && G.hp > 0);
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
  function tileHtml(x, y, cls, delay){
    return '<div class="tile ' + G.board[y][x] + (cls || '') + '" data-x="' + x + '" data-y="' + y + '"' + (delay ? ' style="animation-delay:' + delay + 'ms"' : '') + '><svg class="orb"><use href="#orb-' + G.board[y][x] + '"></use></svg></div>';
  }
  function renderBoard(anim){
    var html = '';
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) html += tileHtml(x, y, anim ? ' new' : '', anim ? (H - y) * 40 : 0);
    $('board').innerHTML = html + '<div class="combo" id="combo"></div>';
  }
  function tileAt(x, y){ return $('board').children[y * W + x]; }
  function setTile(x, y){ var el = tileAt(x, y); if (!el) return; el.className = 'tile ' + G.board[y][x]; el.querySelector('use').setAttribute('href', '#orb-' + G.board[y][x]); }
  // そろっているマス（3つ以上の直線）→ 同色でつながったグループに分ける（パズドラ式コンボ）
  function findGroups(){
    var hit = {}; var key = function(x, y){ return y * W + x; };
    for (var y = 0; y < H; y++) { var run = 1; for (var x = 1; x <= W; x++) {
      if (x < W && G.board[y][x] === G.board[y][x-1]) run++; else { if (run >= 3) for (var k = x - run; k < x; k++) hit[key(k, y)] = 1; run = 1; } } }
    for (var x2 = 0; x2 < W; x2++) { var run2 = 1; for (var y2 = 1; y2 <= H; y2++) {
      if (y2 < H && G.board[y2][x2] === G.board[y2-1][x2]) run2++; else { if (run2 >= 3) for (var k2 = y2 - run2; k2 < y2; k2++) hit[key(x2, k2)] = 1; run2 = 1; } } }
    var seen = {}; var groups = [];
    Object.keys(hit).forEach(function(k){
      if (seen[k]) return; var k0 = parseInt(k, 10); var t = G.board[Math.floor(k0 / W)][k0 % W];
      var stack = [k0]; var cells = []; seen[k] = 1;
      while (stack.length) {
        var c = stack.pop(); var cx = c % W, cy = Math.floor(c / W); cells.push([cx, cy]);
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(d){ var nx = cx + d[0], ny = cy + d[1]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) return; var nk = ny * W + nx; if (hit[nk] && !seen[nk] && G.board[ny][nx] === t) { seen[nk] = 1; stack.push(nk); } });
      }
      groups.push({ type: t, cells: cells });
    });
    return groups;
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
    var ok = findGroups().length > 0;
    G.board[y2][x2] = G.board[y1][x1]; G.board[y1][x1] = t;
    return ok;
  }

  // ---- なぞり操作（玉を持ち上げて盤面を滑らせる。指を離すか時間切れで確定） ----
  var drag = null, dragTimer = null;
  function boardCellAt(cx, cy){
    var bd = $('board'), r = bd.getBoundingClientRect();
    var pad = 10, gap = 6; var cell = (r.width - pad * 2 - gap * (W - 1)) / W;
    var x = Math.floor((cx - r.left - pad + gap / 2) / (cell + gap)), y = Math.floor((cy - r.top - pad + gap / 2) / (cell + gap));
    return { x: x, y: y, cell: cell, rect: r };
  }
  function moveGhost(cx, cy){ if (!drag) return; var s = drag.size; drag.ghost.style.transform = 'translate(' + (cx - drag.rect.left - s / 2) + 'px,' + (cy - drag.rect.top - s / 2) + 'px)'; }
  $('board').addEventListener('pointerdown', function(ev){
    if (!G || G.busy || G.over || drag) return;
    var el = ev.target.closest('.tile'); if (!el) return;
    var x = parseInt(el.getAttribute('data-x'), 10), y = parseInt(el.getAttribute('data-y'), 10);
    var c = boardCellAt(ev.clientX, ev.clientY);
    var ghost = document.createElement('div'); ghost.className = 'drag-ghost ' + G.board[y][x]; ghost.style.width = ghost.style.height = c.cell + 'px';
    ghost.innerHTML = '<svg class="orb"><use href="#orb-' + G.board[y][x] + '"></use></svg>';
    $('board').appendChild(ghost);
    drag = { x: x, y: y, ghost: ghost, size: c.cell, rect: c.rect, moved: false, id: ev.pointerId };
    el.classList.add('held'); moveGhost(ev.clientX, ev.clientY); vibrate(8);
    try { $('board').setPointerCapture(ev.pointerId); } catch(e) {}
    ev.preventDefault();
  });
  $('board').addEventListener('pointermove', function(ev){
    if (!drag) return; moveGhost(ev.clientX, ev.clientY);
    var c = boardCellAt(ev.clientX, ev.clientY);
    if (c.x < 0 || c.y < 0 || c.x >= W || c.y >= H) return;
    var dx = c.x - drag.x, dy = c.y - drag.y;
    if (dx === 0 && dy === 0) return;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return;   // 飛びすぎは無視（となり8方向のみ）
    // 持っている玉と、入った先の玉を入れかえる
    var t = G.board[drag.y][drag.x]; G.board[drag.y][drag.x] = G.board[c.y][c.x]; G.board[c.y][c.x] = t;
    tileAt(drag.x, drag.y).classList.remove('held'); setTile(drag.x, drag.y); tileAt(drag.x, drag.y).classList.add('slide');
    drag.x = c.x; drag.y = c.y; setTile(c.x, c.y); tileAt(c.x, c.y).classList.add('held');
    if (!drag.moved) { drag.moved = true; startDragTimer(); }
  });
  function endDrag(){ if (drag) release(); }
  $('board').addEventListener('pointerup', endDrag);
  $('board').addEventListener('pointercancel', endDrag);
  function startDragTimer(){
    var bar = $('dragbar'); bar.classList.add('on'); var i = $('dragbar-i'); i.style.transition = 'none'; i.style.width = '100%';
    void i.offsetWidth; i.style.transition = 'width ' + DRAG_MS + 'ms linear'; i.style.width = '0%';
    clearTimeout(dragTimer); dragTimer = setTimeout(function(){ if (drag) { floatMsg('タイムアップ', true); release(); } }, DRAG_MS);
  }
  function release(){
    clearTimeout(dragTimer); $('dragbar').classList.remove('on');
    var d = drag; drag = null;
    if (d.ghost) d.ghost.remove();
    var held = tileAt(d.x, d.y); if (held) held.classList.remove('held');
    document.querySelectorAll('#board .tile.slide').forEach(function(t){ t.classList.remove('slide'); });
    if (!d.moved) return;
    G.busy = true; G.moves++; $('msg').textContent = ''; vibrate(12);
    var groups = findGroups();
    if (!groups.length) { $('msg').textContent = 'そろいませんでした…'; setTimeout(function(){ afterMove([], 0); }, 250); return; }
    resolve(groups, 1, []);
  }

  // ---- 消去・落下・連鎖（コンボ） ----
  function boardPoint(x, y){ var el = tileAt(x, y); var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function particles(px, py, color, n, big){
    var fx = $('fx');
    for (var i = 0; i < n; i++) {
      var s = document.createElement('span'); s.className = 'pt' + (big ? ' big' : ''); s.style.background = color; s.style.left = px + 'px'; s.style.top = py + 'px';
      var ang = Math.random() * 6.283, d = (big ? 40 : 18) + Math.random() * (big ? 90 : 36);
      s.style.setProperty('--dx', Math.cos(ang) * d + 'px'); s.style.setProperty('--dy', Math.sin(ang) * d + 'px'); s.style.animationDuration = (0.45 + Math.random() * 0.4) + 's';
      fx.appendChild(s); setTimeout(function(sp){ sp.remove(); }, 900, s);
    }
  }
  function shockwave(px, py, color){ var r = document.createElement('span'); r.className = 'shock'; r.style.left = px + 'px'; r.style.top = py + 'px'; r.style.borderColor = color; $('fx').appendChild(r); setTimeout(function(){ r.remove(); }, 500); }
  function showCombo(n){ var c = $('combo'); if (!c) return; c.textContent = n + ' COMBO'; c.className = 'combo on c' + Math.min(n, 6); void c.offsetWidth; }
  function resolve(groups, combo, allGroups){
    groups.forEach(function(g, gi){
      var cx = 0, cy = 0;
      g.cells.forEach(function(c){ var el = tileAt(c[0], c[1]); el.classList.add('gone'); var p = boardPoint(c[0], c[1]); cx += p.x; cy += p.y; particles(p.x, p.y, EL_COLOR[g.type] || '#ff6fae', 6, false); });
      shockwave(cx / g.cells.length, cy / g.cells.length, EL_COLOR[g.type] || '#ff6fae');
      allGroups.push(g);
      var n = combo + gi; showCombo(n); if (n > G.maxCombo) G.maxCombo = n;
    });
    vibrate(combo >= 3 ? 30 : 15);
    var nextCombo = combo + groups.length;
    setTimeout(function(){
      var m = {}; groups.forEach(function(g){ g.cells.forEach(function(c){ m[c[1] * W + c[0]] = 1; }); });
      var fell = {};
      for (var x = 0; x < W; x++) {
        var col = [];
        for (var y = H - 1; y >= 0; y--) { if (!m[y * W + x]) col.push(G.board[y][x]); }
        for (var y2 = H - 1; y2 >= 0; y2--) { if (col.length) G.board[y2][x] = col.shift(); else { G.board[y2][x] = TYPES[rnd(TYPES.length)]; fell[y2 * W + x] = 1; } }
      }
      renderBoard(false);
      Object.keys(fell).forEach(function(k){ var el = $('board').children[k]; if (el) el.classList.add('new'); });
      var next = findGroups();
      if (next.length) { setTimeout(function(){ resolve(next, nextCombo, allGroups); }, 140); return; }
      afterMove(allGroups, nextCombo - 1);
    }, 340);
  }

  // ---- 攻撃（味方→敵）、回復、敵の反撃 ----
  function floatMsg(s, bad, extra){ var f = $('float'); f.innerHTML = '<span class="' + (bad ? 'bad' : '') + (extra ? ' ' + extra : '') + '">' + esc(s) + '</span>'; setTimeout(function(){ f.innerHTML = ''; }, 1800); }
  function popDmg(text, cls, x, y){ var d = document.createElement('div'); d.className = 'dmg ' + (cls || ''); d.textContent = text; if (x !== undefined) { d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.position = 'fixed'; } $('fx').appendChild(d); setTimeout(function(){ d.remove(); }, 950); }
  function shakeScreen(){ var b = $('scr-battle'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); setTimeout(function(){ b.classList.remove('shake'); }, 400); }
  function centerOf(el){ var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  function projectile(fromEl, toEl, type, cb){
    var a = centerOf(fromEl), b = centerOf(toEl);
    var p = document.createElement('div'); p.className = 'proj ' + type; p.innerHTML = '<svg class="orb"><use href="#orb-' + type + '"></use></svg>';
    p.style.left = (a.x - 18) + 'px'; p.style.top = (a.y - 18) + 'px'; $('fx').appendChild(p);
    void p.offsetWidth; p.style.transform = 'translate(' + (b.x - a.x) + 'px,' + (b.y - a.y) + 'px) scale(1.4)';
    setTimeout(function(){ p.remove(); cb(); }, 330);
  }
  var GAUGE_MAX = 12;
  function drawGauges(){
    TEAM.forEach(function(a, i){ var ph = document.querySelector('#bt-team .ph[data-i="' + i + '"]'); if (!ph) return; var g = ph.querySelector('.gauge'); var pct = Math.min(100, Math.round(G.gauge[i] / GAUGE_MAX * 100)); g.style.setProperty('--p', pct); ph.classList.toggle('ready', G.gauge[i] >= GAUGE_MAX); });
  }
  function useSkill(i){
    if (!G || G.busy || G.over) return; if (G.gauge[i] < GAUGE_MAX) { floatMsg('ゲージがたまっていません', true); return; }
    var a = TEAM[i]; var sk = a.skill || { name: '必殺技', type: 'attack', power: 100 }; var e = enemy();
    G.busy = true; G.gauge[i] = 0; G.skills++; drawGauges(); vibrate([30, 40, 30, 40, 120]);
    var ov = $('skill'); ov.classList.remove('hit'); ov.style.setProperty('--sc', EL_COLOR[a.element]);
    $('skill-img').style.backgroundImage = 'url(' + imgUrl(a) + ')'; $('skill-img').style.setProperty('--sc', EL_COLOR[a.element]);
    $('skill-name').textContent = sk.name; $('skill-name').style.setProperty('--sc', EL_COLOR[a.element]); $('skill-user').textContent = a.name + ' の必殺技！';
    ov.classList.add('on');
    setTimeout(function(){
      ov.classList.add('hit'); vibrate(80);
      setTimeout(function(){
        ov.classList.remove('on'); ov.classList.remove('hit');
        if (sk.type === 'heal') {
          var heal = Math.round(G.maxHp * sk.power / 100); var healed = Math.min(heal, G.maxHp - G.hp); G.hp += healed;
          var tc = centerOf($('bt-team')); popDmg('+' + healed, 'heal', tc.x, tc.y - 20); particles(tc.x, tc.y, '#86efac', 30, true); shockwave(tc.x, tc.y, '#86efac');
          drawHud(); G.busy = false; return;
        }
        var dmg = Math.round(statOf(a).atk * sk.power / 10 * adv(a.element, e.element));
        G.enemyHp -= dmg; var c = centerOf($('en-ph'));
        $('en-ph').classList.add('hit'); setTimeout(function(){ $('en-ph').classList.remove('hit'); }, 400);
        shakeScreen(); $('arena').classList.add('flash'); setTimeout(function(){ $('arena').classList.remove('flash'); }, 300);
        particles(c.x, c.y, EL_COLOR[a.element], 40, true); var sw = document.createElement('span'); sw.className = 'shock big'; sw.style.left = c.x + 'px'; sw.style.top = c.y + 'px'; sw.style.borderColor = EL_COLOR[a.element]; $('fx').appendChild(sw); setTimeout(function(){ sw.remove(); }, 800);
        popDmg('-' + dmg, 'ult', c.x, c.y - 40);
        drawHud();
        if (G.enemyHp <= 0) { setTimeout(function(){ onEnemyDown(e); }, 500); return; }
        G.busy = false;
      }, 450);
    }, 1400);
  }
  function afterMove(groups, combos){
    var e = enemy(); var mult = 1 + 0.25 * Math.max(0, combos - 1);
    groups.forEach(function(g){ TEAM.forEach(function(a, i){ if (a.element === g.type) G.gauge[i] = Math.min(GAUGE_MAX, G.gauge[i] + g.cells.length); }); });
    drawGauges();
    var perEl = {}; var heal = 0;
    groups.forEach(function(g){
      var n = g.cells.length; var sizeMult = 1 + 0.25 * (n - 3);
      if (g.type === 'heart') { heal += Math.round(G.maxHp * 0.05 * sizeMult); return; }
      var atk = 0; TEAM.forEach(function(a){ if (a.element === g.type) atk += statOf(a).atk; });
      if (atk > 0) perEl[g.type] = (perEl[g.type] || 0) + atk * sizeMult;
    });
    var order = Object.keys(perEl);
    var total = 0; var enemyEl = $('en-ph');
    var steps = order.map(function(t){ var d = Math.round(perEl[t] * mult * adv(t, e.element)); total += d; return { t: t, d: d }; });
    var i = 0;
    function fireNext(){
      if (i >= steps.length) { finishAttack(total, heal, combos); return; }
      var st = steps[i++]; var attackers = [];
      TEAM.forEach(function(a, idx){ if (a.element === st.t) attackers.push(idx); });
      attackers.forEach(function(idx){ var ph = document.querySelector('#bt-team .ph[data-i="' + idx + '"]'); if (ph) { ph.classList.add('atk'); setTimeout(function(){ ph.classList.remove('atk'); }, 400); } });
      var from = document.querySelector('#bt-team .ph[data-i="' + attackers[0] + '"]') || $('bt-team');
      projectile(from, enemyEl, st.t, function(){
        G.enemyHp -= st.d; var c = centerOf(enemyEl);
        enemyEl.classList.remove('hit'); void enemyEl.offsetWidth; enemyEl.classList.add('hit');
        $('arena').classList.remove('flash'); void $('arena').offsetWidth; $('arena').classList.add('flash');
        particles(c.x, c.y, EL_COLOR[st.t], 14, true); shockwave(c.x, c.y, EL_COLOR[st.t]);
        var big = st.d >= e.hp * 0.25; popDmg('-' + st.d, big ? 'big' : '', c.x, c.y - 30); if (big) shakeScreen(); vibrate(big ? 50 : 25);
        var r = adv(st.t, e.element); if (r > 1) popDmg('こうかばつぐん！', 'eff', c.x, c.y + 40); else if (r < 1) popDmg('いまひとつ…', 'weak', c.x, c.y + 40);
        drawHud();
        setTimeout(fireNext, 260);
      });
    }
    if (heal > 0) { var healed = Math.min(heal, G.maxHp - G.hp); G.hp += healed; var tc = centerOf($('bt-team')); if (healed > 0) popDmg('+' + healed, 'heal', tc.x, tc.y - 20); particles(tc.x, tc.y, '#ff6fae', 12, false); drawHud(); }
    if (!steps.length && groups.length && !heal) $('msg').textContent = 'その色の味方がいません…';
    setTimeout(fireNext, heal > 0 ? 300 : 0);
  }
  function finishAttack(total, heal, combos){
    var e = enemy();
    if (G.enemyHp <= 0) { onEnemyDown(e); return; }
    G.cnt--;
    if (G.cnt <= 0) { G.cnt = CFG.enemy_interval; enemyAttack(e); return; }
    drawHud(); endTurn();
  }
  function endTurn(){
    if (G.over) return;
    if (!hasMove()) { $('msg').textContent = '動かせる玉がないので並べ直し'; newBoard(); }
    G.busy = false;
  }
  function enemyAttack(e){
    var ph = $('en-ph'); ph.classList.add('lunge');
    setTimeout(function(){
      ph.classList.remove('lunge');
      var sl = $('slash'); sl.classList.remove('on'); void sl.offsetWidth; sl.classList.add('on');
      $('arena').classList.add('hurt'); $('bt-team').classList.add('shake'); shakeScreen(); vibrate([40, 30, 80]);
      var dmg = CHEAT.god ? 0 : e.atk; G.hp -= dmg;
      var tc = centerOf($('bt-team')); popDmg(CHEAT.god ? '無敵' : '-' + dmg, CHEAT.god ? 'heal' : 'me', tc.x, tc.y - 10);
      floatMsg(e.name + ' の攻撃！', true);
      setTimeout(function(){ $('arena').classList.remove('hurt'); $('bt-team').classList.remove('shake'); }, 420);
      drawHud();
      if (G.hp <= 0) { setTimeout(function(){ finish(false); }, 1100); return; }
      setTimeout(endTurn, 500);
    }, 320);
  }
  function onEnemyDown(e){
    G.enemyHp = 0; drawHud(); G.stage++;
    var ph = $('en-ph'); var c = centerOf(ph);
    ph.classList.add('die'); particles(c.x, c.y, EL_COLOR[e.element], e.boss ? 40 : 22, true); shockwave(c.x, c.y, '#fff');
    $('arena').classList.add('flash'); setTimeout(function(){ $('arena').classList.remove('flash'); }, 400);
    if (e.boss) shakeScreen();
    if (G.stage >= CFG.enemies.length) { floatMsg('全クリア！'); vibrate([30, 50, 80, 50, 120]); setTimeout(function(){ finish(true); }, 1400); return; }
    floatMsg(e.boss ? 'BOSS 撃破！！' : e.name + ' をたおした！'); vibrate([20, 40, 20]);
    setTimeout(function(){ stageIntro(); }, e.boss ? 1500 : 1100);
  }
  $('btn-giveup').onclick = function(){ if (G && !G.over && confirm('ここであきらめますか？（ここまでの記録は残ります）')) finish(false); };

  function countUp(el, to, ms, suffix){
    var t0 = performance.now();
    function step(now){ var p = Math.min(1, (now - t0) / ms); var v = Math.round(to * (1 - Math.pow(1 - p, 3))); el.textContent = v.toLocaleString() + (suffix || ''); if (p < 1) requestAnimationFrame(step); }
    requestAnimationFrame(step);
  }
  function finish(cleared){
    G.over = true; G.busy = true;
    var hpPct = Math.round(Math.max(0, G.hp) / G.maxHp * 100);
    var body = { token: ME.token, stages_cleared: G.stage, hp_left: hpPct, moves: G.moves, cleared: cleared, team: TEAM.map(function(a){ return a.id; }), cheated: G.cheated };
    $('res-ttl').textContent = cleared ? '全クリア！おめでとう！' : (G.stage > 0 ? 'ざんねん… でも ' + G.stage + '体たおした！' : 'ざんねん…');
    $('res-score').textContent = '…'; $('res-nb').textContent = ''; $('res-reward').innerHTML = ''; $('res-lvup').textContent = '';
    $('res-stages').textContent = G.stage + ' / ' + CFG.enemies.length + ' 体';
    $('res-hp').textContent = hpPct + '%'; $('res-moves').textContent = G.moves + ' 手'; $('res-combo').textContent = G.maxCombo + ' コンボ';
    $('res-best').textContent = '…'; $('res-rank').textContent = '…';
    show('scr-result');
    post('/result', body).then(function(j){
      if (j.error) { $('res-score').textContent = '保存できませんでした'; return; }
      countUp($('res-score'), j.score, 1000, ' 点');
      setTimeout(function(){
        $('res-nb').textContent = j.cheated ? '（チート中なので記録に入りません）' : (j.is_best ? '自己ベスト更新！' : '');
        $('res-reward').innerHTML = '<span class="coin">+' + j.coins_earned + '</span><span>経験値 +' + j.exp_gain + '（チーム全員）</span>';
        if (j.level_ups && j.level_ups.length) { $('res-lvup').textContent = 'LEVEL UP! ' + j.level_ups.map(function(l){ var a = allyById(l.id); return (a ? a.name : '') + ' Lv.' + l.from + '→' + l.to; }).join('　'); vibrate([30, 40, 60]); }
        $('res-best').textContent = j.best ? j.best.score.toLocaleString() + ' 点' : '-';
        $('res-rank').textContent = j.rank + ' 位';
      }, 1000);
      ME.best = j.best; setCoins(j.coins);
      TEAM.forEach(function(a){ var cs = charState(a.id); if (cs) cs.exp += j.exp_gain; else STATE.chars.push({ id: a.id, exp: j.exp_gain, level: 1 }); });
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

  // ---------- 裏パネル（ロゴ5回タップ → 合言葉 → admin セッション確認） ----------
  var logoTaps = 0, logoTimer = null;
  $('logo').addEventListener('click', function(){
    logoTaps++; clearTimeout(logoTimer); logoTimer = setTimeout(function(){ logoTaps = 0; }, 1500);
    if (logoTaps >= 5) { logoTaps = 0; $('cheat-st').textContent = ''; $('cheat').classList.add('on'); if (!CHEAT.on) { $('cheat-cmd').value = ''; $('cheat-cmd').focus(); } }
  });
  $('cheat-close').onclick = function(){ $('cheat').classList.remove('on'); };
  $('cheat-go').onclick = function(){
    var cmd = $('cheat-cmd').value;
    post('/cheat/auth', { command: cmd }).then(function(j){
      if (j.error) { $('cheat-st').textContent = j.error; return; }
      CHEAT.on = true; CHEAT.cmd = cmd; document.body.classList.add('cheat');
      $('cheat-login').style.display = 'none'; $('cheat-menu').style.display = ''; $('cheat-st').textContent = 'ACCESS GRANTED';
    });
  };
  document.querySelectorAll('#cheat-menu .list button').forEach(function(b){
    b.onclick = function(){
      if (!ME) { $('cheat-st').textContent = '先に参戦してください'; return; }
      if (b.getAttribute('data-a') === 'reset_me' && !confirm('自分のキャラ・記録・コインを初期化します。よろしいですか？')) return;
      post('/cheat/apply', { token: ME.token, command: CHEAT.cmd, action: b.getAttribute('data-a') }).then(function(j){
        if (j.error) { $('cheat-st').textContent = j.error; return; }
        $('cheat-st').textContent = 'OK: ' + b.textContent;
        loadState(ME.token).then(function(){ if ($('scr-home').classList.contains('on')) goHome(); });
      });
    };
  });
  document.querySelectorAll('#cheatbar button').forEach(function(b){
    b.onclick = function(){
      if (!G || G.over || G.busy) return; G.cheated = true; var c = b.getAttribute('data-c');
      if (c === 'kill') { G.busy = true; G.enemyHp = 0; popDmg('一撃', 'big'); onEnemyDown(enemy()); }
      else if (c === 'heal') { G.hp = G.maxHp; var tc = centerOf($('bt-team')); popDmg('全回復', 'heal', tc.x, tc.y - 10); drawHud(); }
      else if (c === 'god') { CHEAT.god = !CHEAT.god; floatMsg(CHEAT.god ? '無敵 ON' : '無敵 OFF'); }
      else if (c === 'skip') { G.busy = true; G.enemyHp = 0; onEnemyDown(enemy()); }
      else if (c === 'gauge') { G.gauge = G.gauge.map(function(){ return GAUGE_MAX; }); drawGauges(); }
    };
  });
})();
</script>
</body>
</html>`;
}
