// デジタルサイネージ（営業所モニター用 周知スライド）
//   - 横16:9・自動再生ループ・標準/豪華アニメ切替・1周ぶんを webm 書き出し
//   - スライドは kind + payload(JSON) でDB化。renderSlideSection() が <section class="slide"> を生成
//   - present / print ページは <!DOCTYPE html> 直返し（layout 無し）
//   - list / edit ページは layout() でラップされる本文を返す
//
// 文言の軽量マークアップ:  *赤字*  /  __黄下線__  /  改行そのまま

export interface SignageDeck {
  id: number;
  title: string;
  seconds: number;
  fx_mode: string; // 'std' | 'lux'
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface SignageSlide {
  id: number;
  deck_id: number;
  sort_order: number;
  kind: string;
  payload: string; // JSON文字列
}

type Field = { name: string; label: string; type: 'text' | 'textarea' | 'select'; options?: Array<{ v: string; l: string }> };

const TONE_OPTS: Array<{ v: string; l: string }> = [
  { v: 'red', l: '赤（新ルール）' },
  { v: 'grey', l: 'グレー（旧ルール）' },
];
const PICTO_OPTS: Array<{ v: string; l: string }> = [
  { v: 'sign-slash', l: '標識に斜線' },
  { v: 'road-slash', l: '道に斜線' },
  { v: 'road-plain', l: '道（斜線なし）' },
  { v: 'none', l: 'なし' },
];

export const SIGNAGE_KINDS: Array<{ kind: string; label: string; desc: string; fields: Field[] }> = [
  {
    kind: 'title', label: '表紙', desc: '大きな日付＋見出し',
    fields: [
      { name: 'eyebrow', label: '小見出し', type: 'text' },
      { name: 'big', label: '大きな文字（日付など。「.」は赤くなります）', type: 'text' },
      { name: 'line', label: '本文', type: 'textarea' },
      { name: 'sub', label: '補足', type: 'text' },
    ],
  },
  {
    kind: 'sign', label: '標識＋ひとこと', desc: '丸い速度標識1枚と一行',
    fields: [
      { name: 'eyebrow', label: '小見出し', type: 'text' },
      { name: 'value', label: '標識の数字', type: 'text' },
      { name: 'tone', label: '標識の色', type: 'select', options: TONE_OPTS },
      { name: 'line', label: '本文', type: 'textarea' },
      { name: 'sub', label: '補足', type: 'text' },
    ],
  },
  {
    kind: 'compare', label: '60 → 30', desc: '標識2枚と矢印（数字がカウント）',
    fields: [
      { name: 'left_value', label: '左の数字', type: 'text' },
      { name: 'left_tone', label: '左の色', type: 'select', options: TONE_OPTS },
      { name: 'left_cap', label: '左のキャプション', type: 'text' },
      { name: 'right_value', label: '右の数字', type: 'text' },
      { name: 'right_tone', label: '右の色', type: 'select', options: TONE_OPTS },
      { name: 'right_cap', label: '右のキャプション', type: 'text' },
      { name: 'line', label: '本文', type: 'textarea' },
    ],
  },
  {
    kind: 'bridge', label: 'つなぎ', desc: '小見出し＋大きな一言',
    fields: [
      { name: 'eyebrow', label: '小見出し', type: 'text' },
      { name: 'line', label: '本文', type: 'textarea' },
    ],
  },
  {
    kind: 'duo', label: '条件2つ（横並び）', desc: '①が着地→②が右から重なって完成＋「＋」',
    fields: [
      { name: 'eyebrow', label: '小見出し', type: 'text' },
      { name: 'a_label', label: '① の文言', type: 'textarea' },
      { name: 'a_picto', label: '① の図', type: 'select', options: PICTO_OPTS },
      { name: 'b_label', label: '② の文言', type: 'textarea' },
      { name: 'b_picto', label: '② の図', type: 'select', options: PICTO_OPTS },
    ],
  },
  {
    kind: 'road', label: '道の図＋ひとこと', desc: '遠近の道イラストと一行',
    fields: [
      { name: 'eyebrow', label: '小見出し', type: 'text' },
      { name: 'line', label: '本文', type: 'textarea' },
      { name: 'picto', label: '図', type: 'select', options: [{ v: 'slash', l: '斜線あり' }, { v: 'plain', l: '斜線なし' }] },
    ],
  },
  {
    kind: 'alert', label: '注意（黄色地）', desc: '黄色背景で強い注意喚起',
    fields: [
      { name: 'eyebrow', label: '小見出し', type: 'text' },
      { name: 'line', label: '本文', type: 'textarea' },
      { name: 'big', label: '大きな赤文字', type: 'text' },
      { name: 'sub', label: '補足', type: 'text' },
    ],
  },
  {
    kind: 'closing', label: '締めの一言', desc: 'タイポ主体＋赤いルール',
    fields: [
      { name: 'line', label: '本文', type: 'textarea' },
      { name: 'sub', label: '補足', type: 'text' },
    ],
  },
];

// ---------- 文言ユーティリティ ----------
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
// エスケープ後に軽量マークアップを適用
function mk(s: unknown): string {
  return esc(s)
    .replace(/\*([^*]+)\*/g, '<span class="hot">$1</span>')
    .replace(/__([^_]+)__/g, '<span class="u">$1</span>')
    .replace(/\r?\n/g, '<br>');
}
function P(slide: SignageSlide): Record<string, string> {
  try {
    const o = JSON.parse(slide.payload || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

// ---------- 図（ピクトグラム）----------
function pictoSvg(kind: string): string {
  if (kind === 'sign-slash') {
    return `<svg class="picto" viewBox="0 0 100 100" aria-hidden="true">
      <circle class="st" cx="50" cy="50" r="34" />
      <text class="tx" x="50" y="52" text-anchor="middle" dominant-baseline="central" font-size="30">60</text>
      <line class="slash" x1="22" y1="78" x2="78" y2="22" />
    </svg>`;
  }
  if (kind === 'road-slash') {
    return `<svg class="picto" viewBox="0 0 100 100" aria-hidden="true">
      <path class="st" d="M20 88 L42 20 M80 88 L58 20" />
      <path class="st" d="M50 84 v-9 M50 62 v-9 M50 40 v-9" />
      <line class="slash" x1="20" y1="30" x2="80" y2="70" />
    </svg>`;
  }
  if (kind === 'road-plain') {
    return `<svg class="picto" viewBox="0 0 100 100" aria-hidden="true">
      <path class="st" d="M20 88 L42 20 M80 88 L58 20" />
      <path class="st" d="M50 86 v-12 M50 60 v-12 M50 34 v-12" />
    </svg>`;
  }
  return '';
}

function signSvg(value: string, tone: string, cls: string, extraNumAttr = ''): string {
  const c = tone === 'grey' ? 'sign is-old' : 'sign';
  return `<svg class="${c} ${cls}" viewBox="0 0 100 100" aria-label="時速${esc(value)}キロ">
    <circle class="disc" cx="50" cy="50" r="46" />
    <circle class="ring" cx="50" cy="50" r="39" fill="none" stroke-width="14" />
    <text class="num" x="50" y="50" text-anchor="middle" dominant-baseline="central"${extraNumAttr}>${esc(value)}</text>
  </svg>`;
}

// ---------- 1スライド ----------
export function renderSlideSection(slide: SignageSlide): string {
  const d = P(slide);
  const k = slide.kind;

  if (k === 'title') {
    const big = esc(d.big ?? '').replace(/\./g, '<i>.</i>');
    return `<section class="slide">
      <span class="ghost30" aria-hidden="true">30</span>
      ${d.eyebrow ? `<p class="eyebrow anim-wipe" style="--i:0">${mk(d.eyebrow)}</p>` : ''}
      ${d.big ? `<p class="bigdate anim-pop" style="--i:1">${big}</p>` : ''}
      ${d.line ? `<p class="line anim-wipe" style="--i:3; font-size:3.2cqw;">${mk(d.line)}</p>` : ''}
      ${d.sub ? `<p class="sub anim-fade" style="--i:4">${mk(d.sub)}</p>` : ''}
    </section>`;
  }

  if (k === 'sign') {
    const tone = d.tone === 'grey' ? 'grey' : 'red';
    const cls = tone === 'grey' ? 'anim-pop' : 'draw';
    return `<section class="slide">
      ${d.eyebrow ? `<p class="eyebrow ${tone === 'grey' ? 'muted' : ''} anim-fade" style="--i:0">${mk(d.eyebrow)}</p>` : ''}
      ${signSvg(d.value ?? '', tone, cls)}
      ${d.line ? `<p class="line anim-wipe" style="--i:2">${mk(d.line)}</p>` : ''}
      ${d.sub ? `<p class="sub anim-fade" style="--i:3">${mk(d.sub)}</p>` : ''}
    </section>`;
  }

  if (k === 'compare') {
    const lt = d.left_tone === 'red' ? 'red' : 'grey';
    const rt = d.right_tone === 'grey' ? 'grey' : 'red';
    const lv = d.left_value ?? '';
    const rv = d.right_value ?? '';
    const numAttr = ` data-count="${esc(rv)}" data-from="${esc(lv)}"`;
    return `<section class="slide">
      <div class="swap">
        <div class="col">
          ${signSvg(lv, lt, lt === 'grey' ? 'anim-pop' : 'draw')}
          ${d.left_cap ? `<span class="cap">${mk(d.left_cap)}</span>` : ''}
        </div>
        <svg class="arrow anim-fade" style="--i:1" viewBox="0 0 120 60" aria-hidden="true">
          <path d="M6 30 H90 M72 10 L106 30 L72 50" fill="none" stroke="#C8102E" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div class="col now">
          ${signSvg(rv, rt, rt === 'grey' ? 'anim-pop' : 'draw', numAttr)}
          ${d.right_cap ? `<span class="cap">${mk(d.right_cap)}</span>` : ''}
        </div>
      </div>
      ${d.line ? `<p class="line anim-wipe" style="--i:2; margin-top:5cqh;">${mk(d.line)}</p>` : ''}
    </section>`;
  }

  if (k === 'bridge') {
    return `<section class="slide">
      ${d.eyebrow ? `<p class="eyebrow anim-wipe" style="--i:0">${mk(d.eyebrow)}</p>` : ''}
      ${d.line ? `<p class="line anim-rise" style="--i:1">${mk(d.line)}</p>` : ''}
    </section>`;
  }

  if (k === 'duo') {
    return `<section class="slide">
      ${d.eyebrow ? `<p class="eyebrow anim-wipe" style="--i:0">${mk(d.eyebrow)}</p>` : ''}
      <div class="duo">
        <div class="item one">
          <span class="badge">1</span>
          ${pictoSvg(d.a_picto ?? 'none')}
          ${d.a_label ? `<p class="cap">${mk(d.a_label)}</p>` : ''}
        </div>
        <div class="plus" aria-hidden="true">+</div>
        <div class="item two">
          <span class="badge">2</span>
          ${pictoSvg(d.b_picto ?? 'none')}
          ${d.b_label ? `<p class="cap">${mk(d.b_label)}</p>` : ''}
        </div>
      </div>
    </section>`;
  }

  if (k === 'road') {
    const p = d.picto === 'plain' ? 'road-plain' : 'road-slash';
    return `<section class="slide">
      ${d.eyebrow ? `<p class="eyebrow muted anim-fade" style="--i:0">${mk(d.eyebrow)}</p>` : ''}
      <div class="road-wrap anim-pop" style="--i:1">${pictoSvg(p)}</div>
      ${d.line ? `<p class="line anim-wipe" style="--i:2">${mk(d.line)}</p>` : ''}
    </section>`;
  }

  if (k === 'alert') {
    return `<section class="slide mark">
      <div class="hazard" aria-hidden="true"></div>
      ${d.eyebrow ? `<p class="eyebrow anim-wipe" style="--i:0">${mk(d.eyebrow)}</p>` : ''}
      ${d.line ? `<p class="line anim-rise" style="--i:1; font-size:2.9cqw;">${mk(d.line)}</p>` : ''}
      ${d.big ? `<p class="bigword anim-pop" style="--i:2">${mk(d.big)}</p>` : ''}
      ${d.sub ? `<p class="sub anim-fade" style="--i:3">${mk(d.sub)}</p>` : ''}
    </section>`;
  }

  if (k === 'closing') {
    return `<section class="slide closing">
      <span class="ghost30" aria-hidden="true">30</span>
      ${d.line ? `<p class="line anim-rise" style="--i:0; font-size:4cqw;">${mk(d.line)}</p>` : ''}
      <div class="rule anim-fade" style="--i:1"></div>
      ${d.sub ? `<p class="sub anim-fade" style="--i:2">${mk(d.sub)}</p>` : ''}
    </section>`;
  }

  return `<section class="slide"><p class="line">${esc(k)}</p></section>`;
}

// =====================================================================
//  CSS（現行 Artifact seikatsu_douro_30.html をそのまま移植）
// =====================================================================
export const SIGNAGE_CSS = `
  :root {
    --paper:#FAFAF8; --card:#FFFFFF; --ink:#1B1D20; --sign:#C8102E; --mark:#F2B705;
    --line:#E6E3DC; --hush:#8A8D91; --old:#A7AAAE;
    --jp:"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif;
    --disp:"Anton","Arial Narrow",sans-serif;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{height:100%;}
  body{background:#0B0C0D;color:var(--ink);font-family:var(--jp);-webkit-font-smoothing:antialiased;overflow:hidden;}
  body.recording .panel,body.recording .hint{display:none!important;}
  .viewport{position:fixed;inset:0;background:#0B0C0D;display:grid;place-items:center;}
  .stage{position:relative;width:min(100vw,177.78vh);height:min(100vh,56.25vw);aspect-ratio:16/9;background:var(--paper);overflow:hidden;container-type:size;isolation:isolate;}
  .fxbg{position:absolute;inset:0;width:100%;height:100%;z-index:0;opacity:0;transition:opacity .7s ease;pointer-events:none;}
  .stage.fx-lux .fxbg{opacity:1;}
  .stage.fx-lux::after{content:"";position:absolute;inset:0;z-index:20;pointer-events:none;background:radial-gradient(120% 80% at 50% 32%,transparent 55%,rgba(27,29,32,.07) 100%);}
  .progress{position:absolute;top:0;left:0;right:0;height:.6cqh;background:var(--line);z-index:40;}
  .progress span{display:block;height:100%;width:100%;background:var(--sign);transform:scaleX(0);transform-origin:left center;}
  .stage.fx-lux .progress span{box-shadow:0 0 2cqh rgba(200,16,46,.55);}
  .slide{position:absolute;inset:0;padding:10cqh 12cqw 13cqh;display:grid;place-content:center;justify-items:center;align-content:center;text-align:center;gap:4.4cqh;opacity:0;visibility:hidden;transform:scale(1.025);transition:opacity .6s ease,transform .6s ease;z-index:1;}
  .slide.is-active{opacity:1;visibility:visible;transform:none;z-index:2;}
  .slide>*{position:relative;z-index:1;}
  .stage.fx-lux .slide{transform:scale(1.06);filter:blur(8px);transition:opacity .7s ease,transform 1s cubic-bezier(.16,1,.3,1),filter .7s ease;}
  .stage.fx-lux .slide.is-active{transform:none;filter:none;}
  .anim-wipe,.anim-pop,.anim-fade,.anim-rise{opacity:0;}
  .slide.is-active .anim-wipe{animation:wipe .8s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i,0)*.14s);}
  .slide.is-active .anim-pop{animation:pop .75s cubic-bezier(.2,.9,.25,1.08) both;animation-delay:calc(var(--i,0)*.14s);}
  .slide.is-active .anim-fade{animation:fade 1.1s ease both;animation-delay:calc(var(--i,0)*.16s);}
  .slide.is-active .anim-rise{animation:rise .9s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i,0)*.14s);}
  @keyframes wipe{from{opacity:0;transform:translateY(3.4cqh);}to{opacity:1;transform:none;}}
  @keyframes rise{from{opacity:0;transform:translateY(6cqh) scale(.96);}to{opacity:1;transform:none;}}
  @keyframes pop{from{opacity:0;transform:scale(.55);}to{opacity:1;transform:scale(1);}}
  @keyframes fade{from{opacity:0;}to{opacity:1;}}
  .stage.fx-lux .slide.is-active .anim-wipe{animation-name:wipeLux;animation-duration:1s;}
  .stage.fx-lux .slide.is-active .anim-rise{animation-name:riseLux;animation-duration:1.05s;}
  .stage.fx-lux .slide.is-active .anim-pop{animation-name:popLux;animation-duration:.95s;}
  @keyframes wipeLux{from{opacity:0;transform:translateY(4.5cqh) scale(.96);filter:blur(10px);}to{opacity:1;transform:none;filter:blur(0);}}
  @keyframes riseLux{from{opacity:0;transform:translateY(8cqh) scale(.9) rotateX(24deg);filter:blur(12px);}to{opacity:1;transform:none;filter:blur(0);}}
  @keyframes popLux{from{opacity:0;transform:scale(.3) rotate(-14deg);filter:blur(6px);}to{opacity:1;transform:scale(1) rotate(0);filter:blur(0);}}
  .draw .ring{stroke-dasharray:246;stroke-dashoffset:246;transform:rotate(-90deg);transform-origin:50% 50%;}
  .draw .num{opacity:0;}
  .slide.is-active .draw .ring{animation:drawring .9s ease .15s both;}
  .slide.is-active .draw .num{animation:pop .6s cubic-bezier(.2,.9,.25,1.08) .62s both;}
  @keyframes drawring{from{stroke-dashoffset:246;}to{stroke-dashoffset:0;}}
  .stage.fx-lux .slide.is-active .draw .ring{animation-duration:1.15s;}
  .stage.fx-lux .slide.is-active .sign{animation:signIn 1s cubic-bezier(.16,1,.3,1) both,bob 5.5s ease-in-out 1.1s infinite;}
  @keyframes signIn{from{opacity:0;transform:scale(.35) rotate(-22deg);filter:blur(6px);}to{opacity:1;transform:none;filter:blur(0);}}
  @keyframes bob{0%,100%{transform:translateY(-.8cqh);}50%{transform:translateY(.8cqh);}}
  .ghost30{position:absolute;right:-6cqw;top:-14cqh;font-family:var(--disp);font-size:92cqh;line-height:.8;color:#F1EEE5;z-index:0;pointer-events:none;user-select:none;animation:drift 26s ease-in-out infinite alternate;}
  .stage.fx-lux .ghost30{color:#EFEBDF;animation-duration:20s;}
  @keyframes drift{from{transform:translate3d(0,0,0) rotate(0deg);}to{transform:translate3d(-4cqw,3cqh,0) rotate(-3deg);}}
  .sign{width:34cqh;filter:drop-shadow(0 1.6cqh 3.4cqh rgba(27,29,32,.16));}
  .sign .disc{fill:var(--card);}
  .sign .ring{stroke:var(--sign);}
  .sign .num{fill:var(--ink);font-family:var(--jp);font-weight:900;font-size:44px;letter-spacing:-2px;}
  .sign.is-old{filter:drop-shadow(0 1.2cqh 2.6cqh rgba(27,29,32,.1));}
  .sign.is-old .ring{stroke:var(--old);}
  .sign.is-old .num{fill:var(--old);}
  .eyebrow{font-size:1.9cqw;font-weight:700;letter-spacing:.26em;color:var(--sign);}
  .eyebrow.muted{color:var(--hush);}
  .line{font-size:4.2cqw;font-weight:900;line-height:1.32;letter-spacing:.01em;text-wrap:balance;max-width:22ch;}
  .line .hot{color:var(--sign);}
  .line .nb{white-space:nowrap;}
  .line .u{background:linear-gradient(var(--mark),var(--mark)) left bottom/100% .55cqh no-repeat;padding:0 .15em .15em;}
  .stage.fx-lux .slide.is-active .line{overflow:hidden;}
  .stage.fx-lux .slide.is-active .line .u{background-size:0% .55cqh;animation:uwipe .7s ease .55s both;}
  @keyframes uwipe{to{background-size:100% .55cqh;}}
  .stage.fx-lux .slide.is-active .line::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.55) 50%,transparent 58%);transform:translateX(-130%);animation:sheen 3.8s ease 1.2s infinite;}
  @keyframes sheen{0%{transform:translateX(-130%);}55%,100%{transform:translateX(130%);}}
  .sub{font-size:1.9cqw;font-weight:500;color:var(--hush);letter-spacing:.04em;}
  .rule{width:12cqw;height:.5cqh;background:var(--sign);border-radius:1cqh;}
  .bigdate{font-family:var(--disp);font-size:30cqh;line-height:.82;color:var(--ink);letter-spacing:.01em;}
  .bigdate i{font-style:normal;color:var(--sign);margin:0 .06em;}
  .swap{display:flex;align-items:center;gap:4.5cqw;}
  .swap .arrow{width:8cqw;height:auto;flex:none;}
  .swap .sign{width:30cqh;}
  .swap .col{position:relative;display:grid;justify-items:center;}
  .swap .cap{position:absolute;left:50%;bottom:-5.5cqh;transform:translateX(-50%);font-size:1.4cqw;font-weight:700;letter-spacing:.12em;color:var(--hush);white-space:nowrap;}
  .swap .col.now .cap{color:var(--sign);}
  .picto{width:20cqh;height:20cqh;}
  .picto .st{fill:none;stroke:var(--ink);stroke-width:5;stroke-linecap:round;stroke-linejoin:round;}
  .picto .slash{stroke:var(--sign);stroke-width:7;stroke-linecap:round;}
  .picto .tx{fill:var(--ink);font-family:var(--jp);font-weight:900;}
  .road-wrap .picto{width:30cqh;height:30cqh;}
  .duo{display:grid;grid-template-columns:1fr auto 1fr;gap:4.5cqw;align-items:start;margin-top:2cqh;}
  .duo .item{display:grid;justify-items:center;gap:2.6cqh;opacity:0;}
  .duo .badge{width:6cqh;height:6cqh;border-radius:50%;background:var(--sign);color:#fff;display:grid;place-items:center;font-family:var(--disp);font-size:3cqw;line-height:1;}
  .duo .picto{width:18cqh;height:18cqh;}
  .duo .cap{font-size:2.7cqw;font-weight:900;line-height:1.34;letter-spacing:.01em;text-wrap:balance;}
  .duo .cap .hot{color:var(--sign);}
  .duo .cap .u{background:linear-gradient(var(--mark),var(--mark)) left bottom/100% .55cqh no-repeat;padding:0 .15em .15em;}
  .duo .plus{align-self:center;padding-top:4cqh;font-family:var(--disp);font-size:3.6cqw;color:var(--sign);opacity:0;}
  .slide.is-active .duo .item.one{animation:condIn .85s cubic-bezier(.2,.7,.2,1) .15s both;}
  .slide.is-active .duo .item.two{animation:condInRight .9s cubic-bezier(.16,1,.3,1) 1.05s both;}
  .slide.is-active .duo .plus{animation:fade .55s ease 1.85s both;}
  @keyframes condIn{from{opacity:0;transform:translateY(5cqh) scale(.94);}to{opacity:1;transform:none;}}
  @keyframes condInRight{from{opacity:0;transform:translateX(30cqw) scale(.9);}to{opacity:1;transform:none;}}
  .stage.fx-lux .slide.is-active .duo .item.one{animation-name:condInLux;animation-duration:1s;}
  .stage.fx-lux .slide.is-active .duo .item.two{animation-name:condInRightLux;animation-duration:1.05s;}
  @keyframes condInLux{from{opacity:0;transform:translateY(6cqh) scale(.9);filter:blur(10px);}to{opacity:1;transform:none;filter:blur(0);}}
  @keyframes condInRightLux{from{opacity:0;transform:translateX(34cqw) scale(.85);filter:blur(12px);}to{opacity:1;transform:none;filter:blur(0);}}
  .slide.mark{background:var(--mark);}
  .slide.mark .eyebrow{color:var(--ink);}
  .slide.mark .line{color:var(--ink);}
  .slide.mark .sub{color:rgba(27,29,32,.66);}
  .slide.mark .hazard{position:absolute;inset:0;z-index:0;background:repeating-linear-gradient(-45deg,rgba(0,0,0,.05) 0 3cqw,transparent 3cqw 6cqw);}
  .bigword{font-size:6.4cqw;font-weight:900;letter-spacing:.02em;color:var(--sign);line-height:1.05;}
  .footer{position:absolute;left:0;right:0;bottom:0;height:8cqh;padding:0 6cqw;display:flex;align-items:center;justify-content:space-between;background:#F1EFE9;border-top:.25cqh solid var(--sign);z-index:30;}
  .footer .brand{font-size:1.35cqw;font-weight:700;letter-spacing:.1em;color:var(--ink);}
  .footer .brand span{color:var(--hush);font-weight:500;}
  .dots{display:flex;align-items:center;gap:.9cqw;}
  .dots i{width:.9cqw;height:.9cqw;border-radius:50%;background:#D6D3CB;display:block;transition:background .3s ease,transform .3s ease;}
  .dots i.on{background:var(--sign);transform:scale(1.4);}
  .pageno{font-family:var(--disp);font-size:1.6cqw;color:var(--hush);letter-spacing:.06em;min-width:6cqw;text-align:right;}
  .panel{position:fixed;left:14px;bottom:12px;z-index:200;font-family:var(--jp);display:flex;flex-direction:column;gap:8px;align-items:flex-start;}
  .panel .gear{border:0;background:rgba(0,0,0,.55);color:#fff;font:700 12px/1 var(--jp);letter-spacing:.1em;padding:8px 14px;border-radius:999px;cursor:pointer;}
  .panel .sheet{background:rgba(17,18,20,.94);color:#F4F3EF;border-radius:14px;padding:16px;width:288px;display:flex;flex-direction:column;gap:14px;box-shadow:0 20px 50px rgba(0,0,0,.45);}
  .panel .sheet[hidden]{display:none;}
  .panel label{font-size:12px;font-weight:700;letter-spacing:.06em;display:block;}
  .panel label b{color:var(--mark);font-family:var(--disp);font-size:15px;margin:0 2px;}
  .panel input[type=range]{width:100%;margin-top:8px;accent-color:#C8102E;}
  .panel .seg{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;}
  .panel .seg span{margin-right:auto;letter-spacing:.06em;}
  .panel .seg button{border:1px solid rgba(255,255,255,.25);background:transparent;color:#F4F3EF;font:700 12px/1 var(--jp);padding:7px 12px;border-radius:8px;cursor:pointer;}
  .panel .seg button.on{background:#C8102E;border-color:#C8102E;}
  .panel .rec{border:0;background:#C8102E;color:#fff;font:700 12px/1.3 var(--jp);letter-spacing:.04em;padding:10px 12px;border-radius:9px;cursor:pointer;}
  .panel .rec[disabled]{opacity:.6;cursor:default;}
  .panel .phint{font-size:10.5px;line-height:1.55;color:rgba(244,243,239,.6);font-weight:500;}
  .panel .stat{font-size:11px;font-weight:700;color:var(--mark);min-height:14px;}
  .hint{position:fixed;left:50%;bottom:1.4vh;transform:translateX(-50%);font:500 12px/1 var(--jp);letter-spacing:.08em;color:rgba(255,255,255,.55);background:rgba(0,0,0,.5);padding:6px 14px;border-radius:999px;z-index:100;transition:opacity .4s ease;}
  .hint.gone{opacity:0;pointer-events:none;}
  @media (prefers-reduced-motion:reduce){
    .slide{transition:none;}
    .anim-wipe,.anim-pop,.anim-fade,.anim-rise,.duo .item,.duo .plus{opacity:1;}
    .slide.is-active .anim-wipe,.slide.is-active .anim-pop,.slide.is-active .anim-fade,.slide.is-active .anim-rise,
    .slide.is-active .draw .ring,.slide.is-active .draw .num,
    .slide.is-active .duo .item.one,.slide.is-active .duo .item.two,.slide.is-active .duo .plus,
    .stage.fx-lux .slide.is-active .sign,.stage.fx-lux .slide.is-active .line::after,.stage.fx-lux .slide.is-active .line .u{animation:none!important;}
    .stage.fx-lux .slide{transform:none;filter:none;transition:none;}
    .draw .ring{stroke-dashoffset:0;}
    .draw .num{opacity:1;}
    .stage.fx-lux .slide.is-active .line .u{background-size:100% .55cqh;}
    .ghost30{animation:none;}
    .stage.fx-lux .fxbg{opacity:0!important;}
    .progress span{transition:none!important;}
  }
  @media print{
    body{overflow:visible;background:#fff;}
    .viewport{position:static;display:block;}
    .stage{width:100%;height:auto;aspect-ratio:auto;overflow:visible;}
    .slide{position:relative;inset:auto;page-break-after:always;opacity:1;visibility:visible;transform:none;height:52vh;min-height:420px;padding:6% 8%;}
    .slide *{animation:none!important;opacity:1!important;transform:none!important;filter:none!important;}
    .draw .ring{stroke-dashoffset:0;}
    .progress,.panel,.hint,.fxbg{display:none!important;}
  }
`;

// =====================================================================
//  再生スクリプト（Artierfact のロジックを移植。deck 既定値は window.__SIG から）
// =====================================================================
export const SIGNAGE_JS = `
(function(){
  var CFG = window.__SIG || {};
  var slides = Array.prototype.slice.call(document.querySelectorAll(".slide"));
  var bar = document.getElementById("bar");
  var dotsWrap = document.getElementById("dots");
  var pageno = document.getElementById("pageno");
  var hint = document.getElementById("hint");
  var stage = document.getElementById("stage");
  var canvas = document.getElementById("fxbg");
  var sheet = document.getElementById("sheet");
  var secInput = document.getElementById("sec");
  var secVal = document.getElementById("secval");
  var stat = document.getElementById("stat");
  var recBtn = document.getElementById("rec");
  var total = slides.length;
  var idx = 0, playing = true, timer = null;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function store(k,v){ try{ if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k,v);}catch(e){return null;} }
  var KEY = "sig_" + (CFG.deckId||0);
  var secPerSlide = parseFloat(store(KEY+"_sec")) || Number(CFG.seconds) || 7;
  if(secPerSlide < 3 || secPerSlide > 12) secPerSlide = 7;
  var storedFx = store(KEY+"_fx");
  var fxMode = (storedFx === "lux" || storedFx === "std") ? storedFx : (CFG.fx === "lux" ? "lux" : "std");
  function DUR(){ return Math.round(secPerSlide * 1000); }

  for(var i=0;i<total;i++) dotsWrap.appendChild(document.createElement("i"));
  var dots = Array.prototype.slice.call(dotsWrap.children);

  function render(){
    slides.forEach(function(s,n){ s.classList.toggle("is-active", n===idx); });
    dots.forEach(function(o,n){ o.classList.toggle("on", n===idx); });
    pageno.textContent = (idx+1) + " / " + total;
  }
  function runBar(){
    if(!bar) return;
    bar.style.transition = "none"; bar.style.transform = "scaleX(0)";
    void bar.offsetWidth;
    if(playing){ bar.style.transition = reduce ? "none" : ("transform " + DUR() + "ms linear"); bar.style.transform = "scaleX(1)"; }
  }
  function animateCount(){
    var el = slides[idx].querySelector("[data-count]");
    if(!el) return;
    var to = parseFloat(el.getAttribute("data-count"));
    var from = parseFloat(el.getAttribute("data-from"));
    if(!isFinite(to) || !isFinite(from) || to === from) return;
    if(reduce){ el.textContent = String(to); return; }
    el.textContent = String(from);
    var start = performance.now(), dur = 1200, delay = 550;
    function tick(now){
      var t = (now - start - delay) / dur;
      if(t <= 0){ requestAnimationFrame(tick); return; }
      if(t >= 1){ el.textContent = String(to); return; }
      var e = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(from + (to - from) * e));
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  function schedule(){ clearTimeout(timer); if(playing) timer = setTimeout(function(){ go(idx+1); }, DUR()); }
  function go(n){ idx = (n % total + total) % total; render(); runBar(); animateCount(); schedule(); }
  function setPlaying(p){
    playing = p;
    if(hint) hint.textContent = (playing ? "自動再生中" : "一時停止中") + "  ←→ / スペース：送り  P：" + (playing ? "一時停止" : "再生") + "  F：全画面  S：設定";
    runBar(); schedule();
  }

  var fx = { raf:0, t:0, blobs:[], dpr:1 };
  function sizeCanvas(){
    if(!canvas) return;
    var r = stage.getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    fx.dpr = dpr;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
  }
  function startFx(){
    if(reduce || fxMode !== "lux" || !canvas) return;
    sizeCanvas();
    if(!fx.blobs.length){
      for(var i=0;i<4;i++) fx.blobs.push({ x:Math.random(), y:Math.random(), r:0.2+Math.random()*0.16, sx:(Math.random()-0.5)*0.00007, sy:(Math.random()-0.5)*0.00007, col: i%2 ? "242,183,5" : "200,16,46" });
    }
    cancelAnimationFrame(fx.raf);
    var ctx = canvas.getContext("2d");
    function frame(){
      fx.t += 1;
      var W = canvas.width, H = canvas.height;
      ctx.clearRect(0,0,W,H);
      var vx = W*0.5, vy = H*0.44;
      ctx.strokeStyle = "rgba(27,29,32,0.05)"; ctx.lineWidth = Math.max(1, fx.dpr);
      for(var i=-9;i<=9;i++){ ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + i*(W*0.12), H); ctx.stroke(); }
      for(var k=0;k<9;k++){
        var p = ((fx.t*0.0016) + k/9) % 1;
        var yy = vy + (H-vy)*p*p;
        var half = (W*0.5)*p*p*1.15;
        ctx.globalAlpha = 0.06*(1-p);
        ctx.beginPath(); ctx.moveTo(vx-half, yy); ctx.lineTo(vx+half, yy); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      for(var b=0;b<fx.blobs.length;b++){
        var o = fx.blobs[b];
        o.x += o.sx; o.y += o.sy;
        if(o.x < -0.25 || o.x > 1.25) o.sx *= -1;
        if(o.y < -0.25 || o.y > 1.25) o.sy *= -1;
        var g = ctx.createRadialGradient(o.x*W, o.y*H, 0, o.x*W, o.y*H, o.r*W);
        g.addColorStop(0, "rgba(" + o.col + ",0.06)");
        g.addColorStop(1, "rgba(" + o.col + ",0)");
        ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
      }
      fx.raf = requestAnimationFrame(frame);
    }
    fx.raf = requestAnimationFrame(frame);
  }
  function stopFx(){
    cancelAnimationFrame(fx.raf); fx.raf = 0;
    if(canvas){ var ctx = canvas.getContext("2d"); if(ctx) ctx.clearRect(0,0,canvas.width,canvas.height); }
  }
  function applyFx(){
    stage.classList.toggle("fx-lux", fxMode === "lux");
    Array.prototype.forEach.call(document.querySelectorAll("[data-fx]"), function(btn){
      btn.classList.toggle("on", btn.getAttribute("data-fx") === fxMode);
    });
    if(fxMode === "lux") startFx(); else stopFx();
  }

  function pickMime(){
    var c = ["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm","video/mp4"];
    for(var i=0;i<c.length;i++){ if(window.MediaRecorder && MediaRecorder.isTypeSupported(c[i])) return c[i]; }
    return "";
  }
  function record(){
    if(!recBtn) return;
    if(!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia || !window.MediaRecorder){
      if(stat) stat.textContent = "この環境では録画APIが使えません";
      return;
    }
    navigator.mediaDevices.getDisplayMedia({ video:{ frameRate:30 }, audio:false }).then(function(stream){
      var rec;
      try{ rec = new MediaRecorder(stream, { mimeType: pickMime() }); }
      catch(e){ rec = new MediaRecorder(stream); }
      var chunks = [];
      rec.ondataavailable = function(e){ if(e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function(){
        stream.getTracks().forEach(function(t){ t.stop(); });
        document.body.classList.remove("recording");
        recBtn.disabled = false;
        var blob = new Blob(chunks, { type: (chunks[0] && chunks[0].type) || "video/webm" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url; a.download = (CFG.slug || "signage") + ".webm";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function(){ URL.revokeObjectURL(url); }, 15000);
        if(stat) stat.textContent = "保存しました（webm）";
      };
      document.body.classList.add("recording");
      recBtn.disabled = true;
      if(stat) stat.textContent = "録画中… 1周（約" + Math.round(secPerSlide*total) + "秒）で自動停止";
      go(0); setPlaying(true);
      rec.start();
      var oneLoop = DUR()*total + 500;
      var stopTimer = setTimeout(function(){ if(rec.state !== "inactive") rec.stop(); }, oneLoop);
      stream.getVideoTracks()[0].addEventListener("ended", function(){ clearTimeout(stopTimer); if(rec.state !== "inactive") rec.stop(); });
    }).catch(function(){
      document.body.classList.remove("recording");
      recBtn.disabled = false;
      if(stat) stat.textContent = "録画は開始されませんでした";
    });
  }

  if(secInput){
    secInput.value = String(secPerSlide);
    if(secVal) secVal.textContent = secPerSlide.toFixed(1);
    secInput.addEventListener("input", function(){
      secPerSlide = parseFloat(secInput.value);
      if(secVal) secVal.textContent = secPerSlide.toFixed(1);
      store(KEY+"_sec", String(secPerSlide));
      runBar(); schedule();
    });
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-fx]"), function(btn){
    btn.addEventListener("click", function(){
      fxMode = btn.getAttribute("data-fx");
      store(KEY+"_fx", fxMode);
      applyFx();
    });
  });
  var gear = document.getElementById("gear");
  if(gear && sheet) gear.addEventListener("click", function(){ sheet.hidden = !sheet.hidden; });
  if(recBtn) recBtn.addEventListener("click", record);

  document.addEventListener("keydown", function(e){
    if(e.key === "ArrowRight" || e.key === " " || e.key === "Spacebar"){ e.preventDefault(); go(idx+1); }
    else if(e.key === "ArrowLeft"){ e.preventDefault(); go(idx-1); }
    else if(e.key === "p" || e.key === "P"){ setPlaying(!playing); }
    else if((e.key === "s" || e.key === "S") && sheet){ sheet.hidden = !sheet.hidden; }
    else if(e.key === "f" || e.key === "F"){
      if(!document.fullscreenElement){ (document.documentElement.requestFullscreen || function(){}).call(document.documentElement); }
      else{ document.exitFullscreen(); }
    }
  });
  stage.addEventListener("click", function(e){
    var r = stage.getBoundingClientRect();
    if(e.clientX - r.left > r.width/2) go(idx+1); else go(idx-1);
  });
  window.addEventListener("resize", function(){ if(fxMode === "lux") sizeCanvas(); });
  document.addEventListener("visibilitychange", function(){ if(document.hidden) stopFx(); else if(fxMode === "lux") startFx(); });
  if(hint) setTimeout(function(){ hint.classList.add("gone"); }, 6000);

  applyFx(); render(); runBar(); animateCount(); schedule();
})();
`;

// =====================================================================
//  フルドキュメント: present / print
// =====================================================================
const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap" />`;

function slug(deck: SignageDeck): string {
  return (deck.title || 'signage').replace(/[\s/\\?%*:|"<>]+/g, '_').slice(0, 40);
}

function stageInner(deck: SignageDeck, slides: SignageSlide[], withPanel: boolean): string {
  const sections = slides.map(renderSlideSection).join('\n');
  const panel = withPanel
    ? `<div class="panel" id="panel">
        <button class="gear" id="gear" type="button">設定</button>
        <div class="sheet" id="sheet" hidden>
          <label>1面の表示秒数 <b id="secval">7.0</b>秒
            <input type="range" id="sec" min="3" max="12" step="0.5" value="7" />
          </label>
          <div class="seg">
            <span>アニメーション</span>
            <button type="button" data-fx="std" class="on">標準</button>
            <button type="button" data-fx="lux">豪華</button>
          </div>
          <button class="rec" id="rec" type="button">この内容を動画で保存（1周・webm）</button>
          <p class="stat" id="stat"></p>
          <p class="phint">動画保存はブラウザの画面共有を使います。「このタブ」を選んでください。</p>
        </div>
      </div>
      <div class="hint" id="hint">自動再生中　←→ / スペース：送り　P：一時停止　F：全画面　S：設定</div>`
    : '';
  return `<div class="viewport">
    <div class="stage" id="stage">
      <canvas class="fxbg" id="fxbg"></canvas>
      <div class="progress"><span id="bar"></span></div>
      ${sections}
      <div class="footer">
        <div class="brand">${esc(deck.title)} <span>｜ サイネージ</span></div>
        <div class="dots" id="dots"></div>
        <div class="pageno" id="pageno">1 / ${slides.length}</div>
      </div>
    </div>
  </div>
  ${panel}`;
}

export function signagePresentPage(deck: SignageDeck, slides: SignageSlide[]): string {
  const cfg = JSON.stringify({ deckId: deck.id, seconds: deck.seconds, fx: deck.fx_mode, slug: slug(deck) });
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(deck.title)}｜サイネージ</title>
${FONT_LINK}
<style>${SIGNAGE_CSS}</style>
</head><body>
${stageInner(deck, slides, true)}
<script>window.__SIG=${cfg};</script>
<script>${SIGNAGE_JS}</script>
</body></html>`;
}

export function signagePrintPage(deck: SignageDeck, slides: SignageSlide[]): string {
  const sections = slides.map(renderSlideSection).join('\n');
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8" />
<title>${esc(deck.title)}｜印刷</title>
${FONT_LINK}
<style>${SIGNAGE_CSS}
  .slide{position:relative!important;inset:auto!important;opacity:1!important;visibility:visible!important;transform:none!important;height:auto;min-height:44vh;page-break-inside:avoid;}
  .slide *{animation:none!important;opacity:1!important;transform:none!important;filter:none!important;}
  .draw .ring{stroke-dashoffset:0!important;}
  .stage{width:100%!important;height:auto!important;aspect-ratio:auto!important;overflow:visible!important;}
  .viewport{position:static!important;display:block!important;}
  .progress,.footer,.fxbg{display:none!important;}
  body{overflow:visible;background:#fff;}
</style>
</head><body>
<div class="viewport"><div class="stage" id="stage">${sections}</div></div>
<script>setTimeout(function(){window.print();},400);</script>
</body></html>`;
}

// =====================================================================
//  layout() でラップされる本文: 一覧 / 編集
// =====================================================================
function h(s: unknown): string { return esc(s); }

export function signageListPage(decks: SignageDeck[], editable: boolean, adminPath: string): string {
  const rows = decks.map((d) => `
    <tr>
      <td style="font-weight:700;">${h(d.title)}</td>
      <td style="color:#6b7280;font-size:12px;">既定 ${h(d.seconds)}秒 ・ ${d.fx_mode === 'lux' ? '豪華' : '標準'}</td>
      <td style="white-space:nowrap;text-align:right;">
        ${editable ? `<a class="btn" href="${adminPath}/signage/${d.id}">編集</a>` : ''}
        <a class="btn" href="${adminPath}/signage/${d.id}/present" target="_blank" rel="noopener">投影を開く</a>
        <a class="btn ghost" href="${adminPath}/signage/${d.id}/print" target="_blank" rel="noopener">印刷</a>
        <button class="btn ghost" type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText(location.origin+'${adminPath}/signage/${d.id}/present');this.textContent='コピー済み'">投影URLをコピー</button>
      </td>
    </tr>`).join('');

  return `
  <style>
    .sig-wrap{max-width:920px;margin:0 auto;padding:20px 16px;}
    .sig-wrap h1{font-size:20px;margin:0 0 4px;}
    .sig-wrap .lead{color:#6b7280;font-size:13px;margin:0 0 18px;}
    .sig-wrap table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;}
    .sig-wrap td{padding:12px 14px;border-top:1px solid #f1f1f1;font-size:14px;vertical-align:middle;}
    .sig-wrap tr:first-child td{border-top:0;}
    .btn{display:inline-block;padding:6px 12px;margin-left:6px;border-radius:7px;background:#2563eb;color:#fff;font-size:12px;font-weight:700;text-decoration:none;border:0;cursor:pointer;}
    .btn.ghost{background:#fff;color:#374151;border:1px solid #d1d5db;}
    .sig-new{margin-top:16px;display:flex;gap:8px;align-items:center;}
    .sig-new input{border:1px solid #d1d5db;border-radius:7px;padding:8px 10px;font-size:13px;flex:1;}
  </style>
  <div class="sig-wrap">
    <h1>デジタルサイネージ</h1>
    <p class="lead">営業所モニター用の周知スライド。「投影を開く」→ <b>F</b>キーで全画面 → 自動再生ループ。左下「設定」（<b>S</b>キー）で表示秒数・アニメーション・動画(webm)保存。投影は全アカウントが開けます（編集はフル権限のみ）。</p>
    <table>${rows || '<tr><td colspan="3" style="color:#6b7280;">デッキがありません</td></tr>'}</table>
    ${editable ? `
    <div class="sig-new">
      <input id="new-title" type="text" placeholder="新しいデッキのタイトル" />
      <button class="btn" type="button" onclick="sigNew()">新規作成</button>
    </div>
    <script>
      function sigNew(){
        var t=(document.getElementById('new-title').value||'').trim();
        if(!t){ alert('タイトルを入力してください'); return; }
        fetch('${adminPath}/api/signage/decks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:t})})
          .then(function(r){return r.json();}).then(function(j){ if(j&&j.id){ location.href='${adminPath}/signage/'+j.id; } else { alert((j&&j.error)||'作成に失敗しました'); } });
      }
    </script>` : ''}
  </div>`;
}

export function signageEditPage(deck: SignageDeck, slides: SignageSlide[], adminPath: string): string {
  const kindsJson = JSON.stringify(SIGNAGE_KINDS);
  const slidesJson = JSON.stringify(slides.map((s) => ({ id: s.id, kind: s.kind, payload: P(s) })));
  const deckJson = JSON.stringify({ id: deck.id, title: deck.title, seconds: deck.seconds, fx_mode: deck.fx_mode });

  return `
  <style>
    .se-wrap{max-width:1180px;margin:0 auto;padding:16px;display:grid;grid-template-columns:1fr 460px;gap:20px;align-items:start;}
    @media (max-width:1000px){ .se-wrap{grid-template-columns:1fr;} .se-preview{position:static!important;} }
    .se-wrap h1{font-size:18px;margin:0 0 12px;}
    .se-deck{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:14px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;}
    .se-deck label{font-size:12px;font-weight:700;color:#374151;display:flex;flex-direction:column;gap:4px;}
    .se-deck input,.se-deck select{border:1px solid #d1d5db;border-radius:7px;padding:7px 9px;font-size:13px;}
    .se-slide{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:12px;}
    .se-slide .hd{display:flex;align-items:center;gap:8px;margin-bottom:10px;}
    .se-slide .hd .no{font-weight:800;color:#9ca3af;font-size:12px;min-width:26px;}
    .se-slide .hd select{border:1px solid #d1d5db;border-radius:7px;padding:6px 8px;font-size:13px;font-weight:700;}
    .se-slide .hd .sp{flex:1;}
    .se-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .se-fields .f{display:flex;flex-direction:column;gap:4px;}
    .se-fields .f.wide{grid-column:1/-1;}
    .se-fields label{font-size:11px;font-weight:700;color:#6b7280;}
    .se-fields input,.se-fields select,.se-fields textarea{border:1px solid #d1d5db;border-radius:7px;padding:7px 9px;font-size:13px;font-family:inherit;}
    .se-fields textarea{min-height:52px;resize:vertical;}
    .ic{border:1px solid #d1d5db;background:#fff;border-radius:7px;width:30px;height:30px;font-size:14px;cursor:pointer;color:#374151;}
    .ic.del{color:#b91c1c;}
    .se-add{display:flex;gap:8px;align-items:center;margin-top:6px;}
    .se-add select{border:1px solid #d1d5db;border-radius:7px;padding:8px;font-size:13px;}
    .btn{display:inline-block;padding:8px 14px;border-radius:8px;background:#2563eb;color:#fff;font-size:13px;font-weight:700;text-decoration:none;border:0;cursor:pointer;}
    .btn.ghost{background:#fff;color:#374151;border:1px solid #d1d5db;}
    .se-bar{display:flex;gap:8px;align-items:center;margin:4px 0 14px;flex-wrap:wrap;}
    .se-msg{font-size:12px;font-weight:700;color:#059669;min-height:16px;}
    .se-preview{position:sticky;top:16px;}
    .se-preview .fr{width:100%;aspect-ratio:16/9;border:1px solid #e5e7eb;border-radius:12px;background:#000;}
    .se-preview .pv-bar{display:flex;gap:8px;align-items:center;margin-bottom:8px;}
    .mk-help{font-size:11px;color:#9ca3af;margin-top:2px;}
  </style>
  <div class="se-wrap">
    <div>
      <h1>デジタルサイネージ ― 編集</h1>
      <div class="se-bar">
        <a class="btn ghost" href="${adminPath}/signage">← 一覧</a>
        <a class="btn" href="${adminPath}/signage/${deck.id}/present" target="_blank" rel="noopener">投影を開く</a>
        <a class="btn ghost" href="${adminPath}/signage/${deck.id}/print" target="_blank" rel="noopener">印刷</a>
        <span class="se-msg" id="msg"></span>
      </div>

      <div class="se-deck">
        <label style="flex:1;min-width:200px;">タイトル
          <input id="d-title" type="text" value="${h(deck.title)}" />
        </label>
        <label>既定の表示秒数
          <input id="d-sec" type="number" min="3" max="12" step="0.5" value="${h(deck.seconds)}" style="width:90px;" />
        </label>
        <label>既定アニメーション
          <select id="d-fx">
            <option value="std"${deck.fx_mode !== 'lux' ? ' selected' : ''}>標準</option>
            <option value="lux"${deck.fx_mode === 'lux' ? ' selected' : ''}>豪華</option>
          </select>
        </label>
        <button class="btn" type="button" onclick="saveDeck()">デッキ設定を保存</button>
      </div>

      <p class="mk-help">文言の書式：　*文字* … 赤字　／　__文字__ … 黄色い下線　／　改行はそのまま反映</p>
      <div id="slides"></div>

      <div class="se-add">
        <select id="add-kind"></select>
        <button class="btn" type="button" onclick="addSlide()">面を追加</button>
      </div>
    </div>

    <div class="se-preview">
      <div class="pv-bar">
        <b style="font-size:12px;color:#374151;">プレビュー</b>
        <button class="btn ghost" type="button" onclick="reloadPreview()">更新</button>
      </div>
      <iframe class="fr" id="pv" src="${adminPath}/signage/${deck.id}/present"></iframe>
    </div>
  </div>

  <script>
  (function(){
    var ADMIN = ${JSON.stringify(adminPath)};
    var KINDS = ${kindsJson};
    var DECK = ${deckJson};
    var slides = ${slidesJson};
    var wrap = document.getElementById('slides');
    var msg = document.getElementById('msg');
    var addSel = document.getElementById('add-kind');
    KINDS.forEach(function(k){ var o=document.createElement('option'); o.value=k.kind; o.textContent=k.label+' … '+k.desc; addSel.appendChild(o); });

    function flash(t){ msg.textContent=t; setTimeout(function(){ if(msg.textContent===t) msg.textContent=''; }, 2000); }
    function kindDef(kind){ return KINDS.filter(function(k){return k.kind===kind;})[0] || KINDS[0]; }
    function reloadPreview(){ var f=document.getElementById('pv'); f.src=f.src.split('#')[0]+'?t='+Date.now(); }
    window.reloadPreview = reloadPreview;

    function fieldHtml(kind, payload){
      var def = kindDef(kind);
      return def.fields.map(function(f){
        var v = payload && payload[f.name] != null ? String(payload[f.name]) : '';
        var wide = (f.type==='textarea') ? ' wide' : '';
        var input;
        if(f.type==='textarea'){
          input = '<textarea data-name="'+f.name+'">'+v.replace(/</g,'&lt;')+'</textarea>';
        } else if(f.type==='select'){
          input = '<select data-name="'+f.name+'">'+ f.options.map(function(op){
            return '<option value="'+op.v+'"'+(op.v===v?' selected':'')+'>'+op.l+'</option>';
          }).join('') +'</select>';
        } else {
          input = '<input type="text" data-name="'+f.name+'" value="'+v.replace(/"/g,'&quot;')+'" />';
        }
        return '<div class="f'+wide+'"><label>'+f.label+'</label>'+input+'</div>';
      }).join('');
    }

    function slideHtml(s, i){
      var opts = KINDS.map(function(k){ return '<option value="'+k.kind+'"'+(k.kind===s.kind?' selected':'')+'>'+k.label+'</option>'; }).join('');
      return '<div class="se-slide" data-id="'+s.id+'">'
        + '<div class="hd"><span class="no">'+(i+1)+'</span>'
        + '<select data-role="kind">'+opts+'</select>'
        + '<span class="sp"></span>'
        + '<button class="ic" type="button" data-act="up" title="上へ">↑</button>'
        + '<button class="ic" type="button" data-act="down" title="下へ">↓</button>'
        + '<button class="ic" type="button" data-act="dup" title="複製">⧉</button>'
        + '<button class="ic del" type="button" data-act="del" title="削除">✕</button>'
        + '</div>'
        + '<div class="se-fields" data-role="fields">'+fieldHtml(s.kind, s.payload)+'</div>'
        + '</div>';
    }

    function renderAll(){
      wrap.innerHTML = slides.map(slideHtml).join('');
      Array.prototype.forEach.call(wrap.querySelectorAll('.se-slide'), bind);
    }

    function collect(el){
      var p = {};
      Array.prototype.forEach.call(el.querySelectorAll('[data-name]'), function(inp){ p[inp.getAttribute('data-name')] = inp.value; });
      return p;
    }

    function saveSlide(el){
      var id = Number(el.getAttribute('data-id'));
      var kind = el.querySelector('[data-role="kind"]').value;
      var payload = collect(el);
      fetch(ADMIN+'/api/signage/slides/'+id, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:kind,payload:payload})})
        .then(function(r){return r.json();}).then(function(j){
          if(j && j.ok){ flash('保存しました'); reloadPreview(); }
          else { flash((j&&j.error)||'保存に失敗'); }
        });
    }

    function bind(el){
      var kindSel = el.querySelector('[data-role="kind"]');
      var fieldsBox = el.querySelector('[data-role="fields"]');
      kindSel.addEventListener('change', function(){
        var s = slides.filter(function(x){return x.id===Number(el.getAttribute('data-id'));})[0];
        s.kind = kindSel.value;
        fieldsBox.innerHTML = fieldHtml(kindSel.value, s.payload);
        saveSlide(el);
      });
      Array.prototype.forEach.call(el.querySelectorAll('[data-name]'), function(inp){
        inp.addEventListener('change', function(){ saveSlide(el); });
      });
      Array.prototype.forEach.call(el.querySelectorAll('[data-act]'), function(btn){
        btn.addEventListener('click', function(){
          var act = btn.getAttribute('data-act');
          var id = Number(el.getAttribute('data-id'));
          if(act==='del'){
            if(!confirm('この面を削除しますか？')) return;
            fetch(ADMIN+'/api/signage/slides/'+id,{method:'DELETE'}).then(function(){ location.reload(); });
          } else if(act==='dup'){
            var s = slides.filter(function(x){return x.id===id;})[0];
            fetch(ADMIN+'/api/signage/decks/'+DECK.id+'/slides',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:s.kind,payload:s.payload,after:id})})
              .then(function(){ location.reload(); });
          } else {
            fetch(ADMIN+'/api/signage/slides/'+id+'/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dir:act})})
              .then(function(){ location.reload(); });
          }
        });
      });
    }

    window.addSlide = function(){
      var kind = addSel.value;
      fetch(ADMIN+'/api/signage/decks/'+DECK.id+'/slides',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:kind,payload:{}})})
        .then(function(){ location.reload(); });
    };
    window.saveDeck = function(){
      var body = {
        title: document.getElementById('d-title').value,
        seconds: parseFloat(document.getElementById('d-sec').value),
        fx_mode: document.getElementById('d-fx').value
      };
      fetch(ADMIN+'/api/signage/decks/'+DECK.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
        .then(function(r){return r.json();}).then(function(j){ if(j&&j.ok){ flash('保存しました'); reloadPreview(); } else { flash((j&&j.error)||'保存に失敗'); } });
    };

    renderAll();
  })();
  </script>`;
}
