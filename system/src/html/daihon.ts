import { FAVICON_DATA_URI } from './layout';
import { ADMIN_PATH } from '../config';
// 台本（板橋ページ）— スライド＋台本デッキ
//   - パワポのように「見出し＋箇条書き」のスライドと、読み上げ用の「台本」を1枚ずつ編集
//   - present : 全画面プレゼン（←→/スペースで送り、F 全画面、N で下部に台本バー）
//   - print   : 1枚1ページ＋台本を下に添えた印刷用（回線断の保険・台本だけ配る用途にも）
//   - pdf     : スライドだけを16:9で1枚1ページに並べた PDF 保存用（印刷ダイアログで「PDFに保存」）
//   - 編集画面の「PowerPoint書き出し」は DAIHON_PPTX_JS（PptxGenJS）でブラウザ側生成
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
  layout: string; // cover | section | content | steps | stat | photo | closing
  accent: string; // blue | green | amber | slate
  title: string;
  subtitle: string;
  body: string;
  notes: string;
  images: string; // 写真レイアウト用：R2キーのJSON配列（migration_171）
}

export const DAIHON_LAYOUTS: Array<{ v: string; l: string; desc: string }> = [
  { v: 'cover', l: '表紙', desc: '講座タイトル・サブタイトル・講師名' },
  { v: 'section', l: '中扉', desc: '章の切り替え（大きな見出し1つ）' },
  { v: 'content', l: '本編', desc: '見出し＋箇条書き（通常のスライド）' },
  { v: 'steps', l: '流れ', desc: '番号つきの手順カードを横に並べる（1行＝「見出し｜説明」）' },
  { v: 'stat', l: '数字', desc: '大きな数字のカードを横に並べる（1行＝「数字｜説明」）' },
  { v: 'photo', l: '写真', desc: '左に写真（最大4枚）、右に箇条書き' },
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

// 流れ・数字スライドの本文：1行＝「見出し｜説明」のカード。行頭「■ 」はカードの下に出す補足
function splitCards(body: string): { cards: Array<{ t: string; d: string }>; leads: string[] } {
  const cards: Array<{ t: string; d: string }> = [];
  const leads: string[] = [];
  for (const raw of String(body ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('■')) { leads.push(line.replace(/^■\s*/, '')); continue; }
    const m = line.split(/[｜|]/);
    cards.push({ t: (m[0] ?? '').trim(), d: m.slice(1).join('｜').trim() });
  }
  return { cards, leads };
}
function renderCards(body: string, kind: 'steps' | 'stat'): string {
  const { cards, leads } = splitCards(body);
  const n = Math.max(1, Math.min(cards.length, 5));
  const items = cards.map((c, i) => kind === 'steps'
    ? `<div class="dh-step"><span class="dh-step-no">${i + 1}</span><p class="dh-step-t">${inline(c.t)}</p>${c.d ? `<p class="dh-step-d">${inline(c.d)}</p>` : ''}</div>`
    : `<div class="dh-stat"><p class="dh-stat-v">${inline(c.t)}</p>${c.d ? `<p class="dh-stat-d">${inline(c.d)}</p>` : ''}</div>`
  ).join('');
  return `<div class="dh-cards dh-cards-${kind}" style="--n:${n}">${items}</div>`
    + leads.map((l) => `<p class="dh-lead">${inline(l)}</p>`).join('');
}

// 写真レイアウト：images 列（JSON配列）→ R2キーの配列
export function slideImages(s: { images?: string | null }): string[] {
  try {
    const a = JSON.parse(String(s.images || '[]'));
    return Array.isArray(a) ? a.filter((k) => typeof k === 'string' && /^daihon\/[\w./-]+$/.test(k)).slice(0, 4) : [];
  } catch { return []; }
}
export function daihonImageUrl(key: string): string {
  return `${ADMIN_PATH}/daihon/img/${key.replace(/^daihon\//, '')}`;
}
function renderPhotos(keys: string[]): string {
  if (!keys.length) return '<div class="dh-photos dh-photos-empty"><span>写真（あとで追加）</span></div>';
  return `<div class="dh-photos dh-photos-${keys.length}">${keys.map((k) => `<img src="${esc(daihonImageUrl(k))}" alt="">`).join('')}</div>`;
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
  if (layout === 'photo') {
    return `<section class="dh-slide dh-content ${ac}" data-i="${index}">
    <div class="dh-content-inner dh-fit">
      <div class="dh-head">
        <h2 class="dh-title"${titleFitStyle(s.title, 5.2, 19)}>${inline(s.title)}</h2>
        ${s.subtitle ? `<p class="dh-sub">${inline(s.subtitle)}</p>` : ''}
      </div>
      <div class="dh-photo-wrap">${renderPhotos(slideImages(s))}<div class="dh-photo-body">${renderBody(s.body)}</div></div>
    </div>
    ${pageno}
  </section>`;
  }
  if (layout === 'steps' || layout === 'stat') {
    return `<section class="dh-slide dh-content ${ac}" data-i="${index}">
    <div class="dh-content-inner dh-fit">
      <div class="dh-head">
        <h2 class="dh-title"${titleFitStyle(s.title, 5.2, 19)}>${inline(s.title)}</h2>
        ${s.subtitle ? `<p class="dh-sub">${inline(s.subtitle)}</p>` : ''}
      </div>
      <div class="dh-body">${renderCards(s.body, layout)}</div>
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

  /* steps / stat */
  .dh-cards{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:2.4cqw;}
  .dh-step,.dh-stat{position:relative;background:var(--ac-soft);border-radius:1.2cqw;padding:2.4cqw 2.2cqw;}
  .dh-cards-steps .dh-step:not(:last-child)::after{content:"";position:absolute;right:-1.75cqw;top:50%;margin-top:-.9cqw;border-left:1.1cqw solid var(--ac);border-top:.9cqw solid transparent;border-bottom:.9cqw solid transparent;}
  .dh-step-no{display:grid;place-items:center;width:4.6cqw;height:4.6cqw;border-radius:50%;background:var(--ac);color:#fff;font-size:2.3cqw;font-weight:900;}
  .dh-step-t{margin-top:2.4cqh;font-size:calc(2.7cqw * min(1, 3.4 / var(--n)));font-weight:800;line-height:1.35;color:var(--ink);}
  .dh-step-d{margin-top:1.4cqh;font-size:calc(2.1cqw * min(1, 3.6 / var(--n)));font-weight:600;line-height:1.6;color:#4b5563;}
  .dh-stat{text-align:center;padding:4cqw 2cqw;}
  .dh-stat-v{font-size:6.4cqw;font-weight:900;line-height:1.1;color:var(--ac);letter-spacing:.01em;}
  .dh-stat-d{margin-top:2cqh;font-size:2.2cqw;font-weight:700;line-height:1.5;color:#374151;}
  .dh-cards + .dh-lead{margin-top:2.6cqh;}

  /* photo */
  .dh-photo-wrap{flex:1;min-height:0;display:grid;grid-template-columns:1.25fr 1fr;gap:3.2cqw;align-items:stretch;}
  .dh-photos{display:grid;gap:1cqw;min-height:28cqh;border-radius:1cqw;overflow:hidden;}
  .dh-photos img{width:100%;height:100%;object-fit:cover;display:block;min-height:0;}
  .dh-photos-2{grid-template-columns:1fr 1fr;}
  .dh-photos-3{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;}
  .dh-photos-3 img:first-child{grid-row:span 2;}
  .dh-photos-4{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;}
  .dh-photos-empty{display:grid;place-items:center;border:.3cqw dashed #cbd5e1;background:#f8fafc;color:#94a3b8;font-size:2.2cqw;font-weight:700;}
  .dh-photo-body{display:flex;flex-direction:column;justify-content:center;gap:1cqh;}
  .dh-photo-body .dh-list{gap:1.6cqh;}
  .dh-photo-body .dh-list li{font-size:2.6cqw;padding-left:3.4cqw;}
  .dh-photo-body .dh-list li::before{width:1.3cqw;height:1.3cqw;top:1.3cqh;}
  .dh-photo-body .dh-lead{font-size:2.6cqw;}

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
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
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
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
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
  .dh-cards{gap:4mm;}
  .dh-step,.dh-stat{padding:5mm 4mm;border-radius:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .dh-cards-steps .dh-step:not(:last-child)::after{display:none;}
  .dh-step-no{width:22px;height:22px;font-size:12px;}
  .dh-step-t{margin-top:3mm;font-size:14px;}
  .dh-step-d{margin-top:2mm;font-size:11px;}
  .dh-stat-v{font-size:28px;}
  .dh-stat-d{margin-top:2mm;font-size:12px;}
  .dh-photo-wrap{gap:5mm;min-height:60mm;}
  .dh-photos{min-height:60mm;}
  .dh-photos-empty{font-size:12px;border-width:1px;}
  .dh-photo-body .dh-list li{font-size:13px;padding-left:7mm;}
  .dh-photo-body .dh-list li::before{width:5px;height:5px;top:7px;}
  .dh-photo-body .dh-lead{font-size:13px;}
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
//  PowerPoint(.pptx) 書き出し — ブラウザ側で PptxGenJS を読み込んで生成
//  （プレゼン画面と同じ配色・配置を 10in×5.625in の16:9 で再現。台本はノートに入る）
//  window.DaihonPptx.build(deck, slides) を呼ぶ。テンプレートリテラル内なのでバックスラッシュは使わない。
// =====================================================================
export const DAIHON_PPTX_JS = `
(function(){
  var LIB = 'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js';
  var AC = { blue:['2563EB','EFF6FF'], green:['15803D','F0FDF4'], amber:['B45309','FFFBEB'], slate:['475569','F1F5F9'] };
  var INK = '1F2937', MUTED = '6B7280', BODY = '374151', SUBT = '4B5563', HAIR = 'E5E7EB', PNO = '9CA3AF';
  var FONT = 'Yu Gothic';
  var NL = String.fromCharCode(10), CR = String.fromCharCode(13);
  var W = 10, H = 5.625, PX = 0.8, CW = 8.4;

  function loadLib(){
    return new Promise(function(res, rej){
      if (window.PptxGenJS) return res();
      var s = document.createElement('script');
      s.src = LIB;
      s.onload = function(){ res(); };
      s.onerror = function(){ rej(new Error('PowerPoint作成ライブラリの読み込みに失敗しました')); };
      document.head.appendChild(s);
    });
  }
  function lines(body){ return String(body || '').split(CR).join('').split(NL); }
  function len(t){ return Array.from(String(t || '')).length; }
  // 長い見出しは1行に収まる文字数を超えたぶんだけ縮小（プレゼン画面と同じ考え方）
  function fitSize(text, base, oneLine){ var n = len(text); return n <= oneLine ? base : Math.max(base * 0.55, base * oneLine / n); }
  // 大きな見出しの改行位置：スペース、なければ「、」の直後で分ける
  function splitTitle(t, oneLine){
    t = String(t || '');
    if (len(t) <= oneLine) return [t];
    var a = t.split(/[ 　]+/).filter(function(x){ return x; });
    if (a.length >= 2) return a;
    var k = t.indexOf('、');
    if (k > 0 && k < t.length - 1) return [t.slice(0, k + 1), t.slice(k + 1)];
    return [t];
  }
  function copy(o){ var r = {}; for (var k in o) r[k] = o[k]; return r; }
  // **太字** を run に分割
  var PARA_KEYS = ['paraSpaceBefore', 'paraSpaceAfter', 'align', 'indentLevel', 'bullet'];
  function runs(text, opt, acColor){
    var out = [];
    String(text || '').split('**').forEach(function(p, i){
      if (!p) return;
      var o = copy(opt);
      if (out.length) PARA_KEYS.forEach(function(k){ delete o[k]; });
      if (i % 2 === 1) { o.bold = true; o.color = acColor; }
      out.push({ text: p, options: o });
    });
    if (!out.length) out.push({ text: ' ', options: copy(opt) });
    return out;
  }
  // 段落の配列 → addText 用の run 配列（段落の終わりに breakLine）
  function paras(list){
    var out = [];
    list.forEach(function(rs, i){
      if (i < list.length - 1) rs[rs.length - 1].options.breakLine = true;
      out = out.concat(rs);
    });
    return out;
  }
  function stripMark(t){ return t.replace(/^[-・][ 　]*/, ''); }

  function base(pres, s, i, total){
    var sl = pres.addSlide();
    var ac = AC[s.accent] || AC.blue;
    sl.background = { color: s.layout === 'section' ? ac[0] : 'FFFFFF' };
    if (s.layout !== 'section') sl.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 0.09, h: H, fill: { color: ac[0] }, line: { color: ac[0], width: 0 } });
    sl.addText((i + 1) + ' / ' + total, { x: W - 1.6, y: H - 0.48, w: 1.26, h: 0.3, fontFace: FONT, fontSize: 12, color: s.layout === 'section' ? 'FFFFFF' : PNO, align: 'right', transparency: s.layout === 'section' ? 30 : 0, margin: 0 });
    if (s.notes) sl.addNotes(String(s.notes));
    return { sl: sl, ac: ac };
  }

  // 見出し＋サブ見出し＋区切り線。本文エリアの上端 y を返す
  function head(pres, sl, s, ac){
    var ts = fitSize(s.title, 36, 19);
    sl.addText(runs(s.title, { fontFace: FONT, fontSize: ts, bold: true, color: INK }, ac[0]), { x: PX, y: 0.5, w: CW, h: 0.8, valign: 'bottom', margin: 0, lang: 'ja-JP' });
    var y = 1.38;
    if (s.subtitle) {
      sl.addText(runs(s.subtitle, { fontFace: FONT, fontSize: 18, bold: true, color: ac[0] }, ac[0]), { x: PX, y: 1.36, w: CW, h: 0.42, valign: 'middle', margin: 0, lang: 'ja-JP' });
      y = 1.86;
    }
    sl.addShape(pres.shapes.LINE, { x: PX, y: y, w: CW, h: 0, line: { color: HAIR, width: 1.5 } });
    return y + 0.22;
  }

  // 画像URL → { data: dataURL, w, h }（PowerPointへ埋め込むため）
  function loadImage(url){
    return fetch(url, { credentials: 'same-origin' }).then(function(r){ if (!r.ok) throw new Error('写真の読み込みに失敗しました'); return r.blob(); })
      .then(function(b){ return new Promise(function(res, rej){ var fr = new FileReader(); fr.onload = function(){ res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(b); }); })
      .then(function(data){ return new Promise(function(res){ var im = new Image(); im.onload = function(){ res({ data: data, w: im.naturalWidth, h: im.naturalHeight }); }; im.onerror = function(){ res({ data: data, w: 4, h: 3 }); }; im.src = data; }); });
  }
  // 枠いっぱいに切り抜いて配置（プレゼン画面の object-fit:cover と同じ）
  function coverImage(sl, im, x, y, w, h){
    var r = Math.max(w / im.w, h / im.h), iw = im.w * r, ih = im.h * r;
    sl.addImage({ data: im.data, x: x, y: y, w: iw, h: ih, sizing: { type: 'crop', x: (iw - w) / 2, y: (ih - h) / 2, w: w, h: h } });
  }
  function photoSlide(pres, s, i, total){
    var b = base(pres, s, i, total), sl = b.sl, ac = b.ac;
    var top = head(pres, sl, s, ac);
    var imgs = s.loadedImages || [];
    var bottom = H - 0.55, ah = bottom - top, aw = CW * 1.25 / 2.25 - 0.16, gap = 0.1;
    if (!imgs.length) {
      sl.addText('写真（あとで追加）', { shape: pres.shapes.RECTANGLE, x: PX, y: top, w: aw, h: ah, fill: { color: 'F8FAFC' }, line: { color: 'CBD5E1', width: 1.5, dashType: 'dash' }, fontFace: FONT, fontSize: 16, bold: true, color: '94A3B8', align: 'center', valign: 'middle' });
    } else if (imgs.length === 1) {
      coverImage(sl, imgs[0], PX, top, aw, ah);
    } else if (imgs.length === 2) {
      var hw = (aw - gap) / 2;
      coverImage(sl, imgs[0], PX, top, hw, ah); coverImage(sl, imgs[1], PX + hw + gap, top, hw, ah);
    } else {
      var cw2 = (aw - gap) / 2, ch2 = (ah - gap) / 2;
      if (imgs.length === 3) {
        coverImage(sl, imgs[0], PX, top, cw2, ah);
        coverImage(sl, imgs[1], PX + cw2 + gap, top, cw2, ch2); coverImage(sl, imgs[2], PX + cw2 + gap, top + ch2 + gap, cw2, ch2);
      } else {
        imgs.slice(0, 4).forEach(function(im, k){ coverImage(sl, im, PX + (k % 2) * (cw2 + gap), top + Math.floor(k / 2) * (ch2 + gap), cw2, ch2); });
      }
    }
    var bx = PX + aw + 0.32, bw = PX + CW - bx;
    var list = lines(s.body).map(function(x){ return x.trim(); }).map(function(t){
      if (!t) return runs(' ', { fontFace: FONT, fontSize: 8 }, ac[0]);
      if (t.charAt(0) === '■') return [{ text: '▍', options: { fontFace: FONT, fontSize: 17, bold: true, color: ac[0], paraSpaceBefore: 6, paraSpaceAfter: 6 } }].concat(runs(t.replace(/^■[ 　]*/, ''), { fontFace: FONT, fontSize: 17, bold: true, color: INK }, ac[0]));
      return [{ text: '●  ', options: { fontFace: FONT, fontSize: 11, color: ac[0], paraSpaceAfter: 8 } }].concat(runs(stripMark(t), { fontFace: FONT, fontSize: 16, bold: true, color: BODY }, ac[0]));
    });
    sl.addText(paras(list), { x: bx, y: top, w: bw, h: ah, valign: 'middle', margin: 0, lineSpacingMultiple: 1.15, lang: 'ja-JP' });
  }

  function contentSlide(pres, s, i, total){
    var b = base(pres, s, i, total), sl = b.sl, ac = b.ac;
    var top = head(pres, sl, s, ac);
    var ls = lines(s.body).map(function(x){ return x.trim(); });
    var n = ls.filter(function(x){ return x; }).length;
    var fs = n <= 4 ? 21 : n <= 6 ? 19 : n <= 8 ? 17 : 15;
    var list = ls.map(function(t){
      if (!t) return runs(' ', { fontFace: FONT, fontSize: fs * 0.5 }, ac[0]);
      if (t.charAt(0) === '■') {
        var lead = t.replace(/^■[ 　]*/, '');
        return [{ text: '▍', options: { fontFace: FONT, fontSize: fs + 1, bold: true, color: ac[0], paraSpaceBefore: 6, paraSpaceAfter: 6 } }]
          .concat(runs(lead, { fontFace: FONT, fontSize: fs + 1, bold: true, color: INK }, ac[0]));
      }
      return [{ text: '●  ', options: { fontFace: FONT, fontSize: fs * 0.7, color: ac[0], paraSpaceAfter: 8 } }]
        .concat(runs(stripMark(t), { fontFace: FONT, fontSize: fs, bold: true, color: BODY }, ac[0]));
    });
    sl.addText(paras(list), { x: PX, y: top, w: CW, h: H - 0.55 - top, valign: 'middle', margin: [0, 4, 0, 0], lineSpacingMultiple: 1.15, lang: 'ja-JP' });
  }

  function cardsSlide(pres, s, i, total, kind){
    var b = base(pres, s, i, total), sl = b.sl, ac = b.ac;
    var top = head(pres, sl, s, ac);
    var cards = [], leads = [];
    lines(s.body).forEach(function(raw){
      var t = raw.trim(); if (!t) return;
      if (t.charAt(0) === '■') { leads.push(t.replace(/^■[ 　]*/, '')); return; }
      var m = t.split(/[｜|]/);
      cards.push({ t: (m[0] || '').trim(), d: m.slice(1).join('｜').trim() });
    });
    var n = Math.max(1, Math.min(cards.length, 5));
    var gap = 0.26, cw = (CW - gap * (n - 1)) / n;
    var ch = kind === 'steps' ? 2.35 : 2.1;
    var leadH = leads.length * 0.5;
    var avail = H - 0.55 - top;
    var y = top + Math.max(0, (avail - ch - (leadH ? leadH + 0.25 : 0)) / 2);
    cards.slice(0, 5).forEach(function(c, k){
      var x = PX + k * (cw + gap);
      sl.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x, y: y, w: cw, h: ch, fill: { color: ac[1] }, line: { color: ac[1], width: 0 }, rectRadius: 0.1 });
      if (kind === 'steps') {
        sl.addText(String(k + 1), { shape: pres.shapes.OVAL, x: x + 0.22, y: y + 0.24, w: 0.46, h: 0.46, fill: { color: ac[0] }, line: { color: ac[0], width: 0 }, fontFace: FONT, fontSize: 16, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', margin: 0 });
        sl.addText(runs(c.t, { fontFace: FONT, fontSize: n >= 4 ? 17 : 19, bold: true, color: INK }, ac[0]), { x: x + 0.22, y: y + 0.82, w: cw - 0.4, h: 0.6, valign: 'top', margin: 0, lang: 'ja-JP' });
        if (c.d) sl.addText(runs(c.d, { fontFace: FONT, fontSize: n >= 4 ? 12.5 : 14, bold: true, color: SUBT }, ac[0]), { x: x + 0.22, y: y + 1.42, w: cw - 0.4, h: ch - 1.56, valign: 'top', margin: 0, lineSpacingMultiple: 1.2, lang: 'ja-JP' });
        if (k < n - 1) sl.addShape(pres.shapes.ISOSCELES_TRIANGLE, { x: x + cw + gap / 2 - 0.08, y: y + ch / 2 - 0.1, w: 0.2, h: 0.16, rotate: 90, fill: { color: ac[0] }, line: { color: ac[0], width: 0 } });
      } else {
        sl.addText(runs(c.t, { fontFace: FONT, fontSize: n >= 4 ? 36 : 44, bold: true, color: ac[0] }, ac[0]), { x: x + 0.1, y: y + 0.28, w: cw - 0.2, h: 0.85, align: 'center', valign: 'middle', margin: 0, lang: 'ja-JP' });
        if (c.d) sl.addText(runs(c.d, { fontFace: FONT, fontSize: n >= 3 ? 13.5 : 15, bold: true, color: BODY }, ac[0]), { x: x + 0.15, y: y + 1.15, w: cw - 0.3, h: ch - 1.3, align: 'center', valign: 'top', margin: 0, lineSpacingMultiple: 1.15, lang: 'ja-JP' });
      }
    });
    leads.forEach(function(l, k){
      var ly = y + ch + 0.25 + k * 0.5;
      sl.addShape(pres.shapes.RECTANGLE, { x: PX, y: ly, w: CW, h: 0.42, fill: { color: ac[1] }, line: { color: ac[1], width: 0 } });
      sl.addShape(pres.shapes.RECTANGLE, { x: PX, y: ly, w: 0.06, h: 0.42, fill: { color: ac[0] }, line: { color: ac[0], width: 0 } });
      sl.addText(runs(l, { fontFace: FONT, fontSize: 17, bold: true, color: INK }, ac[0]), { x: PX + 0.2, y: ly, w: CW - 0.3, h: 0.42, valign: 'middle', margin: 0, lang: 'ja-JP' });
    });
  }

  function coverSlide(pres, s, i, total){
    var b = base(pres, s, i, total), sl = b.sl, ac = b.ac;
    sl.addShape(pres.shapes.OVAL, { x: W - 2.6, y: -0.8, w: 3.4, h: 3.4, fill: { color: ac[1] }, line: { color: ac[1], width: 0 } });
    // 長いタイトルはスペースで改行（プレゼン画面の折り返しと揃える）
    var tl = splitTitle(s.title, 11);
    var longest = tl.reduce(function(m, x){ return Math.max(m, len(x)); }, 0);
    var ts = Math.min(54, CW * 72 / Math.max(1, longest) * 0.92);
    var th = tl.length * ts * 1.3 / 72;
    var bl = lines(s.body).map(function(x){ return x.trim(); }).filter(function(x){ return x; });
    var kh = s.subtitle ? 0.62 : 0, bh = bl.length ? bl.length * 0.4 + 0.25 : 0;
    var y = Math.max(0.5, (H - (kh + th + bh)) / 2);
    if (s.subtitle) {
      var kw = Math.min(CW, len(s.subtitle) * 0.25 + 0.6);
      sl.addText(runs(s.subtitle, { fontFace: FONT, fontSize: 18, bold: true, color: ac[0], charSpacing: 2 }, ac[0]), { shape: pres.shapes.ROUNDED_RECTANGLE, x: PX, y: y, w: kw, h: 0.46, rectRadius: 0.23, fill: { color: ac[1] }, line: { color: ac[1], width: 0 }, align: 'center', valign: 'middle', margin: 0, lang: 'ja-JP' });
      y += kh;
    }
    sl.addText(paras(tl.map(function(t){ return runs(t, { fontFace: FONT, fontSize: ts, bold: true, color: INK }, ac[0]); })), { x: PX, y: y, w: CW, h: th, valign: 'middle', margin: 0, lineSpacingMultiple: 1.05, lang: 'ja-JP' });
    if (bl.length) {
      sl.addText(paras(bl.map(function(t){ return runs(stripMark(t.replace(/^■[ 　]*/, '')), { fontFace: FONT, fontSize: 19, bold: true, color: MUTED, paraSpaceAfter: 4 }, ac[0]); })), { x: PX, y: y + th + 0.25, w: CW, h: bh, valign: 'top', margin: 0, lang: 'ja-JP' });
    }
  }

  function sectionSlide(pres, s, i, total){
    var b = base(pres, s, i, total), sl = b.sl;
    sl.addText(String(i).padStart(2, '0'), { x: PX, y: 1.25, w: CW, h: 0.75, fontFace: FONT, fontSize: 40, bold: true, color: 'FFFFFF', transparency: 45, margin: 0 });
    sl.addText(runs(s.title, { fontFace: FONT, fontSize: fitSize(s.title, 58, 11), bold: true, color: 'FFFFFF' }, 'FFFFFF'), { x: PX, y: 2.0, w: CW, h: 1.3, valign: 'middle', margin: 0, lang: 'ja-JP' });
    if (s.subtitle) sl.addText(runs(s.subtitle, { fontFace: FONT, fontSize: 22, bold: true, color: 'FFFFFF' }, 'FFFFFF'), { x: PX, y: 3.45, w: CW, h: 0.6, valign: 'top', margin: 0, lang: 'ja-JP' });
  }

  function closingSlide(pres, s, i, total){
    var b = base(pres, s, i, total), sl = b.sl, ac = b.ac;
    var tl = splitTitle(s.title, 12);
    var longest = tl.reduce(function(m, x){ return Math.max(m, len(x)); }, 0);
    var ts = Math.min(50, 7.8 * 72 / Math.max(1, longest) * 0.92);
    var th = tl.length * ts * 1.3 / 72;
    var bl = lines(s.body).map(function(x){ return x.trim(); }).filter(function(x){ return x; });
    var sh = s.subtitle ? 0.7 : 0, bh = bl.length ? bl.length * 0.38 + 0.2 : 0;
    var y = Math.max(0.5, (H - (th + sh + bh)) / 2);
    sl.addText(paras(tl.map(function(t){ return runs(t, { fontFace: FONT, fontSize: ts, bold: true, color: INK, align: 'center' }, ac[0]); })), { x: 1.1, y: y, w: 7.8, h: th, align: 'center', valign: 'middle', margin: 0, lineSpacingMultiple: 1.05, lang: 'ja-JP' });
    y += th;
    if (s.subtitle) { sl.addText(runs(s.subtitle, { fontFace: FONT, fontSize: 22, bold: true, color: ac[0] }, ac[0]), { x: 1.1, y: y + 0.15, w: 7.8, h: 0.5, align: 'center', valign: 'middle', margin: 0, lang: 'ja-JP' }); y += sh; }
    if (bl.length) sl.addText(paras(bl.map(function(t){ return runs(stripMark(t.replace(/^■[ 　]*/, '')), { fontFace: FONT, fontSize: 18, bold: true, color: MUTED, align: 'center', paraSpaceAfter: 4 }, ac[0]); })), { x: 1.1, y: y + 0.15, w: 7.8, h: bh, align: 'center', valign: 'top', margin: 0, lang: 'ja-JP' });
  }

  function build(deck, slides){
    return loadLib().then(function(){
      // 写真スライドの画像を先に読み込んでおく
      return Promise.all(slides.map(function(s){
        if (s.layout !== 'photo' || !s.imageUrls || !s.imageUrls.length) return null;
        return Promise.all(s.imageUrls.map(loadImage)).then(function(a){ s.loadedImages = a; });
      }));
    }).then(function(){
      var pres = new window.PptxGenJS();
      pres.layout = 'LAYOUT_16x9';
      pres.title = deck.title || '';
      pres.theme = { headFontFace: FONT, bodyFontFace: FONT, lang: 'ja-JP' };
      var total = slides.length;
      slides.forEach(function(s, i){
        if (s.layout === 'cover') coverSlide(pres, s, i, total);
        else if (s.layout === 'section') sectionSlide(pres, s, i, total);
        else if (s.layout === 'closing') closingSlide(pres, s, i, total);
        else if (s.layout === 'steps' || s.layout === 'stat') cardsSlide(pres, s, i, total, s.layout);
        else if (s.layout === 'photo') photoSlide(pres, s, i, total);
        else contentSlide(pres, s, i, total);
      });
      return pres.writeFile({ fileName: (deck.title || '台本') + '.pptx' });
    });
  }
  window.DaihonPptx = { build: build };
})();
`;

// スライドだけを16:9（PowerPointと同じ 254mm×142.875mm）で1枚1ページに並べた PDF 保存用ページ
export function daihonPdfPage(deck: DaihonDeck, slides: DaihonSlide[]): string {
  const pages = slides.map((s, i) => `<div class="dh-pg">${renderSlide(s, i, slides.length)}</div>`).join('\n');
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(deck.title)}</title>
<link rel="icon" type="image/svg+xml" href="${FAVICON_DATA_URI}">
<style>${DAIHON_CSS}
  html,body{height:auto;background:#e5e7eb;}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .dh-pdf-bar{position:sticky;top:0;z-index:5;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;padding:12px 16px;background:#111827;color:#f9fafb;font-size:13px;font-weight:600;}
  .dh-pdf-bar button{border:0;border-radius:8px;padding:8px 18px;background:#2563eb;color:#fff;font:700 13px/1 var(--jp);cursor:pointer;}
  .dh-pdf-list{display:flex;flex-direction:column;align-items:center;gap:8mm;padding:8mm 0;}
  .dh-pg{position:relative;width:254mm;height:142.875mm;overflow:hidden;container-type:size;background:#fff;box-shadow:0 4px 18px rgba(0,0,0,.18);}
  .dh-pg .dh-slide{opacity:1;visibility:visible;transform:none;transition:none;}
  @page{size:254mm 142.875mm;margin:0;}
  @media print{
    html,body{background:#fff;}
    .dh-pdf-bar{display:none!important;}
    .dh-pdf-list{display:block;padding:0;}
    .dh-pg{box-shadow:none;break-after:page;page-break-after:always;}
    .dh-pg:last-child{break-after:auto;page-break-after:auto;}
    .dh-pg .dh-slide{position:absolute!important;inset:0!important;border:0!important;margin:0!important;min-height:0;}
  }
</style>
</head><body>
<div class="dh-pdf-bar"><span>印刷画面の送信先で「PDFに保存」を選ぶと、スライドだけのPDFになります（用紙サイズは自動で16:9）。</span><button type="button" onclick="window.print()">PDFに保存 / 印刷</button></div>
<div class="dh-pdf-list">${pages}</div>
<script>
(function(){
  function fit(el){
    var f = el.querySelector('.dh-fit'); if(!f) return;
    f.style.setProperty('--dhfit','1');
    var cs = getComputedStyle(el);
    var ch = el.clientHeight - (parseFloat(cs.paddingTop)||0) - (parseFloat(cs.paddingBottom)||0);
    var cw = el.clientWidth - (parseFloat(cs.paddingLeft)||0) - (parseFloat(cs.paddingRight)||0);
    var sc = 1;
    if(f.scrollHeight > ch && ch > 0) sc = Math.min(sc, ch/f.scrollHeight);
    if(f.scrollWidth > cw && cw > 0) sc = Math.min(sc, cw/f.scrollWidth);
    if(sc < 1) f.style.setProperty('--dhfit', Math.max(0.55, sc*0.97).toFixed(3));
  }
  function fitAll(){ Array.prototype.forEach.call(document.querySelectorAll('.dh-pg .dh-slide'), fit); }
  window.addEventListener('load', function(){ fitAll(); setTimeout(function(){ window.print(); }, 500); });
})();
</script>
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
    images: slideImages(s).map((k) => ({ key: k, url: daihonImageUrl(k) })),
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
    .dh-ph{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:9px;}
    .dh-ph .th{position:relative;width:96px;height:64px;border-radius:7px;overflow:hidden;border:1px solid #e5e7eb;background:#f3f4f6;}
    .dh-ph .th img{width:100%;height:100%;object-fit:cover;display:block;}
    .dh-ph .th button{position:absolute;top:3px;right:3px;width:22px;height:22px;border-radius:50%;border:0;background:rgba(0,0,0,.6);color:#fff;font-size:11px;cursor:pointer;}
    .dh-ph label.up{display:inline-flex;align-items:center;justify-content:center;width:96px;height:64px;border:1px dashed #94a3b8;border-radius:7px;font-size:11px;font-weight:700;color:#475569;cursor:pointer;background:#f8fafc;text-align:center;line-height:1.4;}
    .dh-ph input[type=file]{display:none;}
    .dh-ro{background:#fef3c7;border:1px solid #fde68a;color:#92400e;font-size:12px;border-radius:8px;padding:10px 12px;margin-bottom:12px;}
  </style>
  <div class="dh-e">
    <div>
      <h1>台本 ― 編集</h1>
      <div class="dh-e-bar">
        <a class="dh-btn ghost" href="${esc(backUrl)}">← 台本一覧</a>
        <a class="dh-btn" href="${adminPath}/daihon/${deck.id}/present" target="_blank" rel="noopener">プレゼンを開く</a>
        <a class="dh-btn ghost" href="${adminPath}/daihon/${deck.id}/print" target="_blank" rel="noopener">印刷（台本つき）</a>
        <a class="dh-btn ghost" href="${adminPath}/daihon/${deck.id}/pdf" target="_blank" rel="noopener">PDF出力（スライドのみ）</a>
        <button class="dh-btn ghost" type="button" id="dh-pptx" onclick="dhExportPptx()">PowerPoint書き出し</button>
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

      <p class="dh-help">本文の書式：　行頭「■ 」＝ 小見出し（黒点なし）　／　**文字** ＝ 太字　／　空行 ＝ 余白。1行が1つの箇条書きになります。<br>
        「流れ」「数字」スライドは、1行が1枚のカードになります（「見出し｜説明」のように ｜ で区切る。最大5枚）。行頭「■ 」の行はカードの下に補足として出ます。<br>
        「写真」スライドは、写真（最大4枚）が左、本文が右に並びます。写真はスライドの「＋ 写真を追加」から入れられます。</p>
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

  <script>${DAIHON_PPTX_JS}</script>
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
        + (s.layout === 'photo' ? photoBox(s) : '')
        + '<div class="f"><label>本文（1行1項目）</label><textarea class="body" data-name="body"'+dis+'>'+esc(s.body)+'</textarea></div>'
        + '<div class="f"><label>台本（読み上げ用）</label><textarea class="notes" data-name="notes"'+dis+'>'+esc(s.notes)+'</textarea></div>'
        + '</div>';
    }

    function photoBox(s){
      var imgs = s.images || [];
      var h = '<div class="f"><label>写真（最大4枚・スライドの左側に並びます）</label><div class="dh-ph">';
      imgs.forEach(function(im){
        h += '<div class="th"><img src="'+escA(im.url)+'" alt="">'
          + (EDITABLE ? '<button type="button" data-img-del="'+escA(im.key)+'" title="この写真を外す">✕</button>' : '') + '</div>';
      });
      if (EDITABLE && imgs.length < 4) h += '<label class="up">＋ 写真を追加<input type="file" accept="image/*" multiple data-img-add></label>';
      return h + '</div></div>';
    }
    // 長辺1600pxのJPEGに縮小してからアップロード（スマホ写真でも軽くする）
    function shrink(file){
      return new Promise(function(res){
        var img = new Image();
        img.onload = function(){
          var sc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
          var cv = document.createElement('canvas');
          cv.width = Math.round(img.naturalWidth * sc); cv.height = Math.round(img.naturalHeight * sc);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          URL.revokeObjectURL(img.src);
          cv.toBlob(function(b){ res(b || file); }, 'image/jpeg', 0.85);
        };
        img.onerror = function(){ res(file); };
        img.src = URL.createObjectURL(file);
      });
    }
    function uploadImages(id, files){
      var list = Array.prototype.slice.call(files);
      flash('写真をアップロード中…');
      var chain = Promise.resolve();
      list.forEach(function(f){
        chain = chain.then(function(){ return shrink(f); }).then(function(b){
          return fetch(ADMIN+'/api/daihon/slides/'+id+'/images',{method:'POST',headers:{'Content-Type':b.type||'image/jpeg'},body:b})
            .then(function(r){ return r.json(); }).then(function(j){ if(!j || !j.ok) throw new Error((j&&j.error)||'アップロードに失敗しました'); });
        });
      });
      chain.then(function(){ location.reload(); }).catch(function(e){ alert(e.message); location.reload(); });
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
      var p = collect(el);
      var cur = slides.filter(function(x){ return x.id === id; })[0] || {};
      var layoutChanged = (p.layout === 'photo') !== (cur.layout === 'photo');
      fetch(ADMIN+'/api/daihon/slides/'+id, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)})
        .then(function(r){return r.json();}).then(function(j){
          if(j && j.ok && layoutChanged){ location.reload(); return; }
          if(j && j.ok){ cur.layout = p.layout; flash('保存しました'); dhReloadPv(); }
          else { flash((j&&j.error)||'保存に失敗'); }
        });
    }
    function bind(el){
      if(!EDITABLE) return;
      Array.prototype.forEach.call(el.querySelectorAll('[data-name],[data-role]'), function(inp){
        inp.addEventListener('change', function(){ saveSlide(el); });
      });
      var add = el.querySelector('[data-img-add]');
      if (add) add.addEventListener('change', function(){ if (add.files && add.files.length) uploadImages(Number(el.getAttribute('data-id')), add.files); });
      Array.prototype.forEach.call(el.querySelectorAll('[data-img-del]'), function(b){
        b.addEventListener('click', function(){
          if(!confirm('この写真を外しますか？')) return;
          fetch(ADMIN+'/api/daihon/slides/'+el.getAttribute('data-id')+'/images?key='+encodeURIComponent(b.getAttribute('data-img-del')),{method:'DELETE'})
            .then(function(){ location.reload(); });
        });
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
    window.dhExportPptx = function(){
      var btn = document.getElementById('dh-pptx');
      var deck = {
        title: (document.getElementById('d-title') || {}).value || DECK.title
      };
      var list = Array.prototype.map.call(wrap.querySelectorAll('.dh-s'), function(el){
        var p = collect(el);
        var cur = slides.filter(function(x){ return x.id === Number(el.getAttribute('data-id')); })[0] || {};
        p.imageUrls = (cur.images || []).map(function(im){ return im.url; });
        return p;
      });
      btn.disabled = true; btn.textContent = '作成中…';
      window.DaihonPptx.build(deck, list).then(function(){ flash('PowerPointを書き出しました'); })
        .catch(function(e){ alert((e && e.message) || 'PowerPointの作成に失敗しました'); })
        .then(function(){ btn.disabled = false; btn.textContent = 'PowerPoint書き出し'; });
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
