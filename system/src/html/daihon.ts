// 台本（板橋ページ）— スライド＋台本デッキ
//   - パワポのように「見出し＋箇条書き」のスライドと、読み上げ用の「台本」を1枚ずつ編集
//   - present : 全画面プレゼン（←→/スペースで送り、F 全画面、N で下部に台本バー）
//   - print   : 1枚1ページ＋台本を下に添えた印刷用（回線断の保険・台本だけ配る用途にも）
//   - list / edit ページは layout() でラップされる本文を返す
//   - present / print は <!DOCTYPE html> 直返し（layout 無し）
//
// 本文の軽い書式:  行頭「■ 」= 小見出し（黒点なし） /  **文字** = 太字 /  空行 = 余白

export interface DaihonDeck {
  id: number;
  title: string;
  subtitle: string;
  speaker: string;
  intro: string;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface DaihonSlide {
  id: number;
  deck_id: number;
  sort_order: number;
  layout: string; // cover | section | content | closing
  accent: string; // blue | green | amber | slate
  title: string;
  subtitle: string;
  body: string;
  notes: string;
}

export const DAIHON_LAYOUTS: Array<{ v: string; l: string; desc: string }> = [
  { v: 'cover', l: '表紙', desc: '講座タイトル・サブタイトル・講師名' },
  { v: 'section', l: '中扉', desc: '章の切り替え（大きな見出し1つ）' },
  { v: 'content', l: '本編', desc: '見出し＋箇条書き（通常のスライド）' },
  { v: 'closing', l: '締め', desc: '締めのひとこと' },
];
export const DAIHON_ACCENTS: Array<{ v: string; l: string }> = [
  { v: 'blue', l: '青' },
  { v: 'green', l: '緑' },
  { v: 'amber', l: '黄' },
  { v: 'slate', l: 'グレー' },
];
const LAYOUT_SET = new Set(DAIHON_LAYOUTS.map((x) => x.v));
const ACCENT_SET = new Set(DAIHON_ACCENTS.map((x) => x.v));
export function normLayout(v: unknown): string { return LAYOUT_SET.has(String(v)) ? String(v) : 'content'; }
export function normAccent(v: unknown): string { return ACCENT_SET.has(String(v)) ? String(v) : 'blue'; }

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// エスケープ後に **太字** を適用
function inline(s: unknown): string {
  return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
// 本文（1行1項目）→ <ul>。行頭「■ 」は小見出し、空行は余白
function renderBody(body: string): string {
  const lines = String(body ?? '').replace(/\r\n?/g, '\n').split('\n');
  let html = '';
  let inList = false;
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { closeList(); html += '<div class="dh-gap"></div>'; continue; }
    if (line.startsWith('■')) {
      closeList();
      html += `<p class="dh-lead">${inline(line.replace(/^■\s*/, ''))}</p>`;
      continue;
    }
    if (!inList) { html += '<ul class="dh-list">'; inList = true; }
    html += `<li>${inline(line.replace(/^[-・]\s*/, ''))}</li>`;
  }
  closeList();
  return html;
}

// 長い見出しは1行に収まる目安の文字数を超えたぶんだけ縮小（表紙・中扉などの巨大文字向け）
function titleFitStyle(text: unknown, baseCqw: number, oneLineChars: number): string {
  const len = Array.from(String(text ?? '')).length;
  if (len <= oneLineChars) return '';
  const scale = Math.max(0.55, oneLineChars / len);
  return ` style="font-size:${(baseCqw * scale).toFixed(2)}cqw"`;
}

// ---------- 1スライド ----------
export function renderSlide(s: DaihonSlide, index: number, total: number): string {
  const ac = `ac-${normAccent(s.accent)}`;
  const layout = normLayout(s.layout);
  const pageno = `<span class="dh-pageno">${index + 1} / ${total}</span>`;

  if (layout === 'cover') {
    return `<section class="dh-slide dh-cover ${ac}" data-i="${index}">
      <div class="dh-cover-inner dh-fit">
        <span class="dh-kicker">${inline(s.subtitle)}</span>
        <h1 class="dh-cover-title"${titleFitStyle(s.title, 8.4, 11)}>${inline(s.title)}</h1>
        ${s.body ? `<div class="dh-cover-sub">${renderBody(s.body)}</div>` : ''}
      </div>
      ${pageno}
    </section>`;
  }
  if (layout === 'section') {
    return `<section class="dh-slide dh-section ${ac}" data-i="${index}">
      <div class="dh-section-inner dh-fit">
        <span class="dh-section-no">${String(index).padStart(2, '0')}</span>
        <h2 class="dh-section-title"${titleFitStyle(s.title, 9, 10)}>${inline(s.title)}</h2>
        ${s.subtitle ? `<p class="dh-section-sub">${inline(s.subtitle)}</p>` : ''}
      </div>
      ${pageno}
    </section>`;
  }
  if (layout === 'closing') {
    return `<section class="dh-slide dh-closing ${ac}" data-i="${index}">
      <div class="dh-closing-inner dh-fit">
        <h2 class="dh-closing-title"${titleFitStyle(s.title, 8, 10)}>${inline(s.title)}</h2>
        ${s.subtitle ? `<p class="dh-closing-sub">${inline(s.subtitle)}</p>` : ''}
        ${s.body ? `<div class="dh-closing-body">${renderBody(s.body)}</div>` : ''}
      </div>
      ${pageno}
    </section>`;
  }
  // content
  return `<section class="dh-slide dh-content ${ac}" data-i="${index}">
    <div class="dh-content-inner dh-fit">
      <div class="dh-head">
        <h2 class="dh-title"${titleFitStyle(s.title, 5.2, 19)}>${inline(s.title)}</h2>
        ${s.subtitle ? `<p class="dh-sub">${inline(s.subtitle)}</p>` : ''}
      </div>
      <div class="dh-body">${renderBody(s.body)}</div>
    </div>
    ${pageno}
  </section>`;
}

// =====================================================================
//  CSS
// =====================================================================
export const DAIHON_CSS = `
  :root{
    --paper:#ffffff; --ink:#1f2937; --muted:#6b7280; --hair:#e5e7eb;
    --ac:#2563eb; --ac-soft:#eff6ff;
    --jp:"Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif;
  }
  .ac-blue{--ac:#2563eb;--ac-soft:#eff6ff;}
  .ac-green{--ac:#15803d;--ac-soft:#f0fdf4;}
  .ac-amber{--ac:#b45309;--ac-soft:#fffbeb;}
  .ac-slate{--ac:#475569;--ac-soft:#f1f5f9;}
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{height:100%;}
  body{background:#0b0c0d;color:var(--ink);font-family:var(--jp);-webkit-font-smoothing:antialiased;}
  .dh-stage-wrap{position:fixed;inset:0;display:grid;place-items:center;background:#0b0c0d;overflow:hidden;}
  /* 16:9固定：vw/vhのminで先に確定させ、対応ブラウザではaspect-ratio/container queryで上書き（未対応環境でも比率が崩れない） */
  .dh-stage{position:relative;width:min(100vw,177.78vh);height:min(100vh,56.25vw);aspect-ratio:16/9;background:var(--paper);overflow:hidden;container-type:size;box-shadow:0 30px 80px rgba(0,0,0,.5);}
  .dh-slide{position:absolute;inset:0;padding:7cqw 8cqw;opacity:0;visibility:hidden;transform:translateY(1.2cqh);transition:opacity .35s ease,transform .35s ease;display:flex;flex-direction:column;}
  .dh-slide.is-active{opacity:1;visibility:visible;transform:none;}
  .dh-pageno{position:absolute;right:3.4cqw;bottom:2.6cqw;font-size:1.7cqw;color:#9ca3af;letter-spacing:.05em;}
  .dh-slide::before{content:"";position:absolute;left:0;top:0;bottom:0;width:.9cqw;background:var(--ac);}
  /* 内容が枠に収まりきらない時だけ、ページ番号はそのままに中身だけ縮小する */
  .dh-fit{--dhfit:1;transform:scale(var(--dhfit));transition:transform .2s ease;}

  /* content */
  .dh-content-inner{flex:1;min-height:0;display:flex;flex-direction:column;transform-origin:top left;}
  .dh-head{border-bottom:.25cqw solid var(--hair);padding-bottom:2.4cqh;margin-bottom:3cqh;flex:none;}
  .dh-title{font-size:5.2cqw;font-weight:800;line-height:1.25;color:var(--ink);letter-spacing:.01em;word-break:keep-all;overflow-wrap:anywhere;}
  .dh-sub{margin-top:1.2cqh;font-size:2.5cqw;font-weight:700;color:var(--ac);}
  .dh-body{flex:1;display:flex;flex-direction:column;justify-content:center;gap:1cqh;}
  .dh-list{list-style:none;display:flex;flex-direction:column;gap:2cqh;}
  .dh-list li{position:relative;padding-left:4cqw;font-size:3.1cqw;font-weight:600;line-height:1.5;color:#374151;text-wrap:pretty;}
  .dh-list li::before{content:"";position:absolute;left:.8cqw;top:1.5cqh;width:1.6cqw;height:1.6cqw;border-radius:50%;background:var(--ac);}
  .dh-lead{font-size:3.2cqw;font-weight:800;color:var(--ink);background:var(--ac-soft);border-left:.7cqw solid var(--ac);padding:1.4cqh 2cqw;border-radius:.6cqw;margin:1cqh 0;}
  .dh-gap{height:1.6cqh;}
  .dh-body strong,.dh-cover-sub strong,.dh-closing-body strong{color:var(--ac);font-weight:800;}

  /* cover */
  .dh-cover{align-items:flex-start;justify-content:center;}
  .dh-cover::after{content:"";position:absolute;right:-8cqw;top:-8cqw;width:34cqw;height:34cqw;border-radius:50%;background:var(--ac-soft);}
  .dh-cover-inner{position:relative;z-index:1;transform-origin:top left;}
  .dh-kicker{display:inline-block;font-size:2.6cqw;font-weight:800;letter-spacing:.14em;color:var(--ac);background:var(--ac-soft);padding:1cqh 2cqw;border-radius:999px;}
  .dh-cover-title{margin-top:3cqh;font-size:8.4cqw;font-weight:900;line-height:1.18;letter-spacing:.01em;color:var(--ink);word-break:keep-all;overflow-wrap:anywhere;}
  .dh-cover-sub{margin-top:4cqh;font-size:3cqw;font-weight:700;color:var(--muted);}
  .dh-cover-sub .dh-list{gap:1cqh;}
  .dh-cover-sub .dh-list li{padding-left:0;font-size:3cqw;color:var(--muted);}
  .dh-cover-sub .dh-list li::before{display:none;}

  /* section */
  .dh-section{align-items:flex-start;justify-content:center;background:var(--ac);}
  .dh-section::before{display:none;}
  .dh-section-inner{color:#fff;transform-origin:top left;}
  .dh-section .dh-pageno{color:rgba(255,255,255,.7);}
  .dh-section-no{font-size:6cqw;font-weight:900;opacity:.55;letter-spacing:.06em;}
  .dh-section-title{margin-top:1cqh;font-size:9cqw;font-weight:900;line-height:1.15;word-break:keep-all;overflow-wrap:anywhere;}
  .dh-section-sub{margin-top:3cqh;font-size:3.2cqw;font-weight:700;opacity:.92;}

  /* closing */
  .dh-closing{align-items:center;justify-content:center;text-align:center;}
  .dh-closing-inner{max-width:78cqw;transform-origin:top center;}
  .dh-closing-title{font-size:8cqw;font-weight:900;line-height:1.2;color:var(--ink);word-break:keep-all;overflow-wrap:anywhere;}
  .dh-closing-sub{margin-top:3cqh;font-size:3.2cqw;font-weight:700;color:var(--ac);}
  .dh-closing-body{margin-top:3cqh;font-size:2.7cqw;color:var(--muted);}
  .dh-closing-body .dh-list li{padding-left:0;}
  .dh-closing-body .dh-list li::before{display:none;}

  /* presenter chrome */
  .dh-bar{position:fixed;left:0;right:0;bottom:0;z-index:50;background:rgba(15,17,20,.96);color:#f3f4f6;border-top:2px solid var(--ac,#2563eb);padding:14px 20px;max-height:34vh;overflow-y:auto;transform:translateY(101%);transition:transform .28s ease;}
  .dh-bar.show{transform:none;}
  .dh-bar h4{font-size:11px;font-weight:800;letter-spacing:.1em;color:#9ca3af;margin-bottom:6px;}
  .dh-bar .dh-note-text{font-size:15px;line-height:1.75;white-space:pre-wrap;font-weight:500;}
  .dh-hint{position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:40;font-size:12px;color:rgba(255,255,255,.6);background:rgba(0,0,0,.5);padding:6px 14px;border-radius:999px;transition:opacity .4s ease;}
  .dh-hint.gone{opacity:0;pointer-events:none;}
  .dh-toggle{position:fixed;right:14px;bottom:14px;z-index:60;border:0;background:rgba(0,0,0,.6);color:#fff;font:700 12px/1 var(--jp);letter-spacing:.06em;padding:10px 16px;border-radius:999px;cursor:pointer;}
  .dh-bar.show ~ .dh-toggle{bottom:calc(34vh + 14px);}

  @media (prefers-reduced-motion:reduce){ .dh-slide{transition:none;} .dh-bar{transition:none;} }

  @media print{
    body{background:#fff;}
    .dh-stage-wrap{position:static;display:block;background:#fff;}
    .dh-stage{width:100%;height:auto;aspect-ratio:auto;box-shadow:none;overflow:visible;}
    .dh-slide{position:relative;inset:auto;opacity:1!important;visibility:visible!important;transform:none!important;page-break-inside:avoid;min-height:auto;border:1px solid #e5e7eb;margin-bottom:10mm;}
    .dh-bar,.dh-hint,.dh-toggle{display:none!important;}
    .dh-print-note{page-break-inside:avoid;}
  }
`;

// =====================================================================
//  present の操作スクリプト
// =====================================================================
export const DAIHON_PRESENT_JS = `
(function(){
  var CFG = window.__DH || {};
  var slides = Array.prototype.slice.call(document.querySelectorAll('.dh-slide'));
  var notes = CFG.notes || [];
  var total = slides.length;
  var idx = 0;
  var bar = document.getElementById('dh-bar');
  var noteText = document.getElementById('dh-note-text');
  var noteHd = document.getElementById('dh-note-hd');
  var hint = document.getElementById('dh-hint');
  var toggle = document.getElementById('dh-toggle');
  var stage = document.getElementById('dh-stage');
  var KEY = 'daihon_notes_' + (CFG.deckId||0);
  function store(k,v){ try{ if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k,v); }catch(e){ return null; } }
  var notesOn = store(KEY) === '1';

  function renderNote(){
    if(!noteText) return;
    var n = notes[idx] || {};
    noteText.textContent = n.text || '（このスライドの台本は未記入です）';
    if(noteHd) noteHd.textContent = '台本  ' + (idx+1) + ' / ' + total + (n.title ? '　― ' + n.title : '');
  }
  // スライドの内容が枠(16:9)からはみ出す場合、ページ番号の位置は保ったまま中身だけ縮小して必ず収まるようにする
  // 注意：transformを掛けた要素の中のはみ出しは祖先のscrollHeightに伝わらないため、
  //       中身側(.dh-fit)のscrollHeightと、枠側(.dh-slide)のclientHeightを直接比較する
  function fitSlide(el){
    if(!el) return;
    var fit = el.querySelector('.dh-fit');
    if(!fit) return;
    fit.style.setProperty('--dhfit','1');
    var cs = getComputedStyle(el);
    var ch = el.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    var cw = el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    var sh = fit.scrollHeight, sw = fit.scrollWidth;
    var scale = 1;
    if(sh > ch && ch > 0) scale = Math.min(scale, ch/sh);
    if(sw > cw && cw > 0) scale = Math.min(scale, cw/sw);
    if(scale < 1){
      scale = Math.max(0.55, scale * 0.97);
      fit.style.setProperty('--dhfit', scale.toFixed(3));
    }
  }
  function render(){
    slides.forEach(function(s,n){ s.classList.toggle('is-active', n===idx); });
    renderNote();
    var active = slides[idx];
    if(active){ requestAnimationFrame(function(){ fitSlide(active); }); }
  }
  window.addEventListener('resize', function(){ fitSlide(slides[idx]); });
  function go(n){ idx = (n % total + total) % total; render(); }
  function setNotes(on){
    notesOn = on;
    if(bar) bar.classList.toggle('show', on);
    if(toggle) toggle.textContent = on ? '台本を隠す (N)' : '台本 (N)';
    store(KEY, on ? '1' : '0');
  }

  document.addEventListener('keydown', function(e){
    if(e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ' || e.key === 'Spacebar'){ e.preventDefault(); go(idx+1); }
    else if(e.key === 'ArrowLeft' || e.key === 'PageUp'){ e.preventDefault(); go(idx-1); }
    else if(e.key === 'Home'){ e.preventDefault(); go(0); }
    else if(e.key === 'End'){ e.preventDefault(); go(total-1); }
    else if(e.key === 'n' || e.key === 'N'){ setNotes(!notesOn); }
    else if(e.key === 'f' || e.key === 'F'){
      if(!document.fullscreenElement){ (document.documentElement.requestFullscreen||function(){}).call(document.documentElement); }
      else { document.exitFullscreen(); }
    }
  });
  if(stage) stage.addEventListener('click', function(e){
    var r = stage.getBoundingClientRect();
    if(e.clientX - r.left > r.width/2) go(idx+1); else go(idx-1);
  });
  if(toggle) toggle.addEventListener('click', function(){ setNotes(!notesOn); });
  if(hint) setTimeout(function(){ hint.classList.add('gone'); }, 6000);

  setNotes(notesOn);
  render();
})();
`;

// =====================================================================
//  フルドキュメント: present / print
// =====================================================================
export function daihonPresentPage(deck: DaihonDeck, slides: DaihonSlide[]): string {
  const sections = slides.map((s, i) => renderSlide(s, i, slides.length)).join('\n');
  const notes = JSON.stringify(slides.map((s) => ({ title: s.title || '', text: s.notes || '' })));
  const cfg = JSON.stringify({ deckId: deck.id });
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(deck.title)}｜プレゼン</title>
<style>${DAIHON_CSS}</style>
</head><body>
<div class="dh-stage-wrap"><div class="dh-stage" id="dh-stage">${sections}</div></div>
<div class="dh-bar" id="dh-bar"><h4 id="dh-note-hd">台本</h4><div class="dh-note-text" id="dh-note-text"></div></div>
<button class="dh-toggle" id="dh-toggle" type="button">台本 (N)</button>
<div class="dh-hint" id="dh-hint">←→ / スペース：送り　　F：全画面　　N：台本の表示</div>
<script>window.__DH=${cfg};window.__DH.notes=${notes};</script>
<script>${DAIHON_PRESENT_JS}</script>
</body></html>`;
}

export function daihonPrintPage(deck: DaihonDeck, slides: DaihonSlide[]): string {
  const blocks = slides.map((s, i) => {
    const note = (s.notes || '').trim();
    return `<div class="dh-print-unit">
      ${renderSlide(s, i, slides.length)}
      ${note ? `<div class="dh-print-note"><b>台本 ${i + 1}</b>${esc(note)}</div>` : ''}
    </div>`;
  }).join('\n');
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8" />
<title>${esc(deck.title)}｜印刷（台本つき）</title>
<style>${DAIHON_CSS}
  /* --- 印刷は container query を使わず px で組み直す --- */
  html,body{height:auto;background:#fff;color:#1f2937;}
  .dh-stage-wrap{position:static;display:block;padding:0;background:#fff;}
  .dh-stage{width:100%;height:auto;aspect-ratio:auto;box-shadow:none;overflow:visible;container-type:normal;}
  .dh-print-unit{page-break-inside:avoid;margin-bottom:14mm;}
  .dh-slide{position:relative;inset:auto;opacity:1;visibility:visible;transform:none;display:block;
    border:1px solid #d1d5db;border-radius:8px;padding:14mm 16mm;min-height:0;}
  .dh-slide::before{width:5px;}
  .dh-pageno{position:absolute;right:8mm;bottom:6mm;font-size:11px;}
  .dh-head{border-bottom:1px solid #e5e7eb;padding-bottom:6mm;margin-bottom:7mm;}
  .dh-title{font-size:22px;}
  .dh-sub{margin-top:3mm;font-size:14px;}
  .dh-body{display:block;}
  .dh-list{gap:4mm;}
  .dh-list li{padding-left:8mm;font-size:14px;}
  .dh-list li::before{left:0;top:7px;width:6px;height:6px;}
  .dh-lead{font-size:15px;padding:4mm 5mm;margin:3mm 0;border-left-width:4px;}
  .dh-gap{height:4mm;}
  .dh-cover::after,.dh-section::before{display:none;}
  .dh-kicker{font-size:12px;padding:2mm 4mm;}
  .dh-cover-title{font-size:30px;margin-top:6mm;}
  .dh-cover-sub{margin-top:7mm;font-size:14px;}
  .dh-cover-sub .dh-list li{font-size:14px;}
  .dh-section{background:#fff;color:#1f2937;}
  .dh-section-inner{color:#1f2937;}
  .dh-section .dh-pageno{color:#9ca3af;}
  .dh-section-no{font-size:20px;color:var(--ac);opacity:.5;}
  .dh-section-title{font-size:26px;margin-top:3mm;}
  .dh-section-sub{font-size:14px;margin-top:5mm;opacity:1;}
  .dh-closing-title{font-size:26px;}
  .dh-closing-sub{font-size:14px;margin-top:5mm;}
  .dh-closing-body{font-size:13px;margin-top:5mm;}
  .dh-print-note{margin-top:4mm;border:1px solid #d1d5db;border-radius:6px;padding:6mm;font-size:12px;line-height:1.9;white-space:pre-wrap;background:#f9fafb;}
  .dh-print-note b{display:block;font-size:10px;letter-spacing:.12em;color:#6b7280;margin-bottom:3mm;}
  @page{size:A4;margin:12mm;}
</style>
</head><body>
<div class="dh-stage-wrap"><div class="dh-stage">
  <h1 style="font-size:18px;margin-bottom:2mm;">${esc(deck.title)}</h1>
  <p style="font-size:12px;color:#6b7280;margin-bottom:8mm;">${esc(deck.subtitle)}${deck.speaker ? '　／　講師：' + esc(deck.speaker) : ''}</p>
  ${blocks}
</div></div>
<script>setTimeout(function(){window.print();},400);</script>
</body></html>`;
}

// =====================================================================
//  layout() でラップされる本文: 編集
// =====================================================================
export function daihonEditPage(deck: DaihonDeck, slides: DaihonSlide[], adminPath: string, editable: boolean): string {
  const layoutsJson = JSON.stringify(DAIHON_LAYOUTS);
  const accentsJson = JSON.stringify(DAIHON_ACCENTS);
  const slidesJson = JSON.stringify(slides.map((s) => ({
    id: s.id, layout: s.layout, accent: s.accent, title: s.title, subtitle: s.subtitle, body: s.body, notes: s.notes,
  })));
  const deckJson = JSON.stringify({ id: deck.id, title: deck.title, subtitle: deck.subtitle, speaker: deck.speaker, intro: deck.intro });
  const backUrl = `${adminPath}/settings/study-sessions?tab=script`;

  return `
  <style>
    .dh-e{max-width:1220px;margin:0 auto;padding:16px;display:grid;grid-template-columns:1fr 470px;gap:22px;align-items:start;}
    @media (max-width:1040px){ .dh-e{grid-template-columns:1fr;} .dh-e-pv{position:static!important;} }
    .dh-e h1{font-size:18px;margin:0 0 10px;color:#1e3a5f;}
    .dh-e-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:14px;}
    .dh-e-msg{font-size:12px;font-weight:700;color:#059669;min-height:16px;}
    .dh-btn{display:inline-block;padding:8px 14px;border-radius:8px;background:#2563eb;color:#fff;font-size:13px;font-weight:700;text-decoration:none;border:0;cursor:pointer;}
    .dh-btn.ghost{background:#fff;color:#374151;border:1px solid #d1d5db;}
    .dh-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:12px;}
    .dh-deck label{font-size:11px;font-weight:700;color:#6b7280;display:block;margin-bottom:3px;}
    .dh-deck input,.dh-deck textarea{width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:7px;padding:8px 9px;font-size:13px;font-family:inherit;margin-bottom:10px;}
    .dh-deck textarea{min-height:52px;resize:vertical;}
    .dh-row{display:flex;gap:10px;flex-wrap:wrap;}
    .dh-row>*{flex:1;min-width:150px;}
    .dh-s .hd{display:flex;align-items:center;gap:8px;margin-bottom:10px;}
    .dh-s .no{font-weight:800;color:#9ca3af;font-size:12px;min-width:24px;}
    .dh-s select{border:1px solid #d1d5db;border-radius:7px;padding:6px 8px;font-size:12px;font-weight:700;}
    .dh-s .sp{flex:1;}
    .dh-ic{border:1px solid #d1d5db;background:#fff;border-radius:7px;width:30px;height:30px;font-size:13px;cursor:pointer;color:#374151;}
    .dh-ic.del{color:#b91c1c;}
    .dh-s .f{display:flex;flex-direction:column;gap:3px;margin-bottom:9px;}
    .dh-s .f label{font-size:11px;font-weight:700;color:#6b7280;}
    .dh-s .f input,.dh-s .f textarea{border:1px solid #d1d5db;border-radius:7px;padding:7px 9px;font-size:13px;font-family:inherit;}
    .dh-s .f textarea.body{min-height:96px;resize:vertical;}
    .dh-s .f textarea.notes{min-height:80px;resize:vertical;background:#fffef5;}
    .dh-add{display:flex;gap:8px;align-items:center;margin-top:6px;}
    .dh-add select{border:1px solid #d1d5db;border-radius:7px;padding:8px;font-size:13px;}
    .dh-e-pv{position:sticky;top:16px;}
    .dh-e-pv .fr{width:100%;aspect-ratio:16/9;border:1px solid #e5e7eb;border-radius:12px;background:#000;}
    .dh-e-pv .pv-bar{display:flex;gap:8px;align-items:center;margin-bottom:8px;}
    .dh-help{font-size:11px;color:#9ca3af;margin:2px 0 10px;line-height:1.7;}
    .dh-ro{background:#fef3c7;border:1px solid #fde68a;color:#92400e;font-size:12px;border-radius:8px;padding:10px 12px;margin-bottom:12px;}
  </style>
  <div class="dh-e">
    <div>
      <h1>台本 ― 編集</h1>
      <div class="dh-e-bar">
        <a class="dh-btn ghost" href="${esc(backUrl)}">← 台本一覧</a>
        <a class="dh-btn" href="${adminPath}/daihon/${deck.id}/present" target="_blank" rel="noopener">プレゼンを開く</a>
        <a class="dh-btn ghost" href="${adminPath}/daihon/${deck.id}/print" target="_blank" rel="noopener">印刷（台本つき）</a>
        <span class="dh-e-msg" id="msg"></span>
      </div>
      ${editable ? '' : '<div class="dh-ro">閲覧のみのアカウントです。編集するにはフル権限、または「営業所ページ」の編集権限が必要です。</div>'}

      <div class="dh-card dh-deck">
        <label>講座タイトル</label>
        <input id="d-title" type="text" maxlength="120" value="${esc(deck.title)}" ${editable ? '' : 'disabled'} />
        <label>サブタイトル</label>
        <input id="d-subtitle" type="text" maxlength="160" value="${esc(deck.subtitle)}" ${editable ? '' : 'disabled'} />
        <div class="dh-row">
          <div><label>講師名</label><input id="d-speaker" type="text" maxlength="80" value="${esc(deck.speaker)}" ${editable ? '' : 'disabled'} /></div>
        </div>
        <label>ねらい・概要（一覧に表示。スライドには出ません）</label>
        <textarea id="d-intro" maxlength="600" ${editable ? '' : 'disabled'}>${esc(deck.intro)}</textarea>
        ${editable ? '<button class="dh-btn" type="button" onclick="dhSaveDeck()">講座情報を保存</button>' : ''}
      </div>

      <p class="dh-help">本文の書式：　行頭「■ 」＝ 小見出し（黒点なし）　／　**文字** ＝ 太字　／　空行 ＝ 余白。1行が1つの箇条書きになります。</p>
      <div id="dh-slides"></div>

      ${editable ? `
      <div class="dh-add">
        <select id="dh-add-layout"></select>
        <button class="dh-btn" type="button" onclick="dhAddSlide()">スライドを追加</button>
      </div>` : ''}
    </div>

    <div class="dh-e-pv">
      <div class="pv-bar">
        <b style="font-size:12px;color:#374151;">プレビュー</b>
        <button class="dh-btn ghost" type="button" onclick="dhReloadPv()">更新</button>
        <span style="font-size:11px;color:#9ca3af;">保存すると自動更新されます</span>
      </div>
      <iframe class="fr" id="dh-pv" src="${adminPath}/daihon/${deck.id}/present"></iframe>
    </div>
  </div>

  <script>
  (function(){
    var ADMIN = ${JSON.stringify(adminPath)};
    var EDITABLE = ${editable ? 'true' : 'false'};
    var LAYOUTS = ${layoutsJson};
    var ACCENTS = ${accentsJson};
    var DECK = ${deckJson};
    var slides = ${slidesJson};
    var wrap = document.getElementById('dh-slides');
    var msg = document.getElementById('msg');
    var addSel = document.getElementById('dh-add-layout');
    if(addSel){ LAYOUTS.forEach(function(k){ var o=document.createElement('option'); o.value=k.v; o.textContent=k.l+' … '+k.desc; addSel.appendChild(o); }); }

    function flash(t){ msg.textContent=t; setTimeout(function(){ if(msg.textContent===t) msg.textContent=''; }, 2000); }
    function esc(s){ return (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function escA(s){ return esc(s).replace(/"/g,'&quot;'); }
    function dhReloadPv(){ var f=document.getElementById('dh-pv'); f.src=f.src.split('#')[0].split('?')[0]+'?t='+Date.now(); }
    window.dhReloadPv = dhReloadPv;

    function slideHtml(s, i){
      var lo = LAYOUTS.map(function(k){ return '<option value="'+k.v+'"'+(k.v===s.layout?' selected':'')+'>'+k.l+'</option>'; }).join('');
      var ac = ACCENTS.map(function(k){ return '<option value="'+k.v+'"'+(k.v===s.accent?' selected':'')+'>'+k.l+'</option>'; }).join('');
      var dis = EDITABLE ? '' : ' disabled';
      return '<div class="dh-card dh-s" data-id="'+s.id+'">'
        + '<div class="hd"><span class="no">'+(i+1)+'</span>'
        + '<select data-role="layout"'+dis+'>'+lo+'</select>'
        + '<select data-role="accent"'+dis+'>'+ac+'</select>'
        + '<span class="sp"></span>'
        + (EDITABLE ? ('<button class="dh-ic" type="button" data-act="up" title="上へ">↑</button>'
          + '<button class="dh-ic" type="button" data-act="down" title="下へ">↓</button>'
          + '<button class="dh-ic" type="button" data-act="dup" title="複製">⧉</button>'
          + '<button class="dh-ic del" type="button" data-act="del" title="削除">✕</button>') : '')
        + '</div>'
        + '<div class="f"><label>見出し</label><input type="text" data-name="title" maxlength="120" value="'+escA(s.title)+'"'+dis+'></div>'
        + '<div class="f"><label>サブ見出し（任意）</label><input type="text" data-name="subtitle" maxlength="160" value="'+escA(s.subtitle)+'"'+dis+'></div>'
        + '<div class="f"><label>本文（1行1項目）</label><textarea class="body" data-name="body"'+dis+'>'+esc(s.body)+'</textarea></div>'
        + '<div class="f"><label>台本（読み上げ用）</label><textarea class="notes" data-name="notes"'+dis+'>'+esc(s.notes)+'</textarea></div>'
        + '</div>';
    }

    function renderAll(){
      wrap.innerHTML = slides.map(slideHtml).join('');
      Array.prototype.forEach.call(wrap.querySelectorAll('.dh-s'), bind);
    }
    function collect(el){
      var p = {};
      Array.prototype.forEach.call(el.querySelectorAll('[data-name]'), function(inp){ p[inp.getAttribute('data-name')] = inp.value; });
      p.layout = el.querySelector('[data-role="layout"]').value;
      p.accent = el.querySelector('[data-role="accent"]').value;
      return p;
    }
    function saveSlide(el){
      if(!EDITABLE) return;
      var id = Number(el.getAttribute('data-id'));
      fetch(ADMIN+'/api/daihon/slides/'+id, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(collect(el))})
        .then(function(r){return r.json();}).then(function(j){
          if(j && j.ok){ flash('保存しました'); dhReloadPv(); }
          else { flash((j&&j.error)||'保存に失敗'); }
        });
    }
    function bind(el){
      if(!EDITABLE) return;
      Array.prototype.forEach.call(el.querySelectorAll('[data-name],[data-role]'), function(inp){
        inp.addEventListener('change', function(){ saveSlide(el); });
      });
      Array.prototype.forEach.call(el.querySelectorAll('[data-act]'), function(btn){
        btn.addEventListener('click', function(){
          var act = btn.getAttribute('data-act');
          var id = Number(el.getAttribute('data-id'));
          if(act==='del'){
            if(!confirm('このスライドを削除しますか？')) return;
            fetch(ADMIN+'/api/daihon/slides/'+id,{method:'DELETE'}).then(function(){ location.reload(); });
          } else if(act==='dup'){
            var s = slides.filter(function(x){return x.id===id;})[0];
            var b = {layout:s.layout,accent:s.accent,title:s.title,subtitle:s.subtitle,body:s.body,notes:s.notes,after:id};
            fetch(ADMIN+'/api/daihon/decks/'+DECK.id+'/slides',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)})
              .then(function(){ location.reload(); });
          } else {
            fetch(ADMIN+'/api/daihon/slides/'+id+'/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dir:act})})
              .then(function(){ location.reload(); });
          }
        });
      });
    }

    window.dhAddSlide = function(){
      fetch(ADMIN+'/api/daihon/decks/'+DECK.id+'/slides',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({layout:addSel.value,accent:'blue'})})
        .then(function(){ location.reload(); });
    };
    window.dhSaveDeck = function(){
      var body = {
        title: document.getElementById('d-title').value,
        subtitle: document.getElementById('d-subtitle').value,
        speaker: document.getElementById('d-speaker').value,
        intro: document.getElementById('d-intro').value
      };
      fetch(ADMIN+'/api/daihon/decks/'+DECK.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
        .then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ flash('保存しました'); dhReloadPv(); } else { flash((j&&j.error)||'保存に失敗'); } });
    };

    renderAll();
  })();
  </script>`;
}
