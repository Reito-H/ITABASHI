// 引き継ぎシート（課ごとの日次引き継ぎ）画面
// 旧スタンドアロンアプリ「引き継ぎくん」の doc-grid レイアウト・保存動作を踏襲。
// 板橋1〜4課固定。班長シフトログイン等のセッション認証は既存の管理画面に乗る。
import { safeJson } from './layout';
import { ADMIN_PATH } from '../config';

// タイトル行右側（layout()のheaderExtra）に置く課切り替えタブの入れ物。
// 実際の描画・クリック処理はhandoverPage()側のrenderTabs()がこの#ho-tabsに対して行う。
export function handoverHeaderTabs(): string {
  return `<div class="ho-tabs-h" id="ho-tabs"></div>`;
}

export function handoverPage(editable: boolean): string {
  return `
<style>
*,*::before,*::after{box-sizing:border-box;}
:root{--navy:#1e2a3a;--yellow:#f0c040;--red:#e53935;--border:#1e2a3a;--muted:#666;}
#ho-root{font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;}

/* タイトル行の高さがフォントの行間で膨らまないよう明示的に固定する（このstyleは
   /handoverページにしか出力されないため他ページのヘッダーには影響しない） */
.desktop-header h1{line-height:24px;margin:0;}
.desktop-header{min-height:0;}

/* 課タブ：タイトル行右側（headerExtra）に表示。スペース確保のため本文中の
   タブは廃止し、headerExtraが出ない狭幅画面（layout.tsの.desktop-header非表示時）
   のみ本文側の#ho-tabs-mを表示するフォールバックを用意する。 */
.ho-tabs-h{display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;align-items:center;height:24px;}
.ho-tab-h{flex-shrink:0;box-sizing:border-box;height:24px;display:inline-flex;align-items:center;padding:0 12px;
          border-radius:12px;border:1px solid #d1d5db;background:#f3f4f6;cursor:pointer;font-size:12px;
          font-weight:700;color:#374151;white-space:nowrap;line-height:1;}
.ho-tab-h.active{background:var(--navy);color:#fff;border-color:var(--navy);}
#ho-tabs-m{display:none;}
@media (max-width:768px){
  #ho-tabs-m{display:flex;margin-bottom:8px;}
}

.ho-date-bar{background:#fff;border:1px solid #e5e7eb;border-radius:8px;display:flex;align-items:center;gap:5px;
             padding:6px 8px;overflow-x:auto;white-space:nowrap;margin-bottom:10px;}
.ho-date-sep{width:1px;height:18px;background:#ddd;flex-shrink:0;}
.ho-date-tab{flex-shrink:0;padding:5px 11px;border-radius:16px;border:1px solid #ccc;font-size:12px;font-weight:600;
             cursor:pointer;background:#fff;color:#333;user-select:none;}
.ho-date-tab.active{background:var(--navy);color:#fff;border-color:var(--navy);}
.ho-date-tab.is-today{border-color:var(--yellow);}
.ho-today-chip{font-size:9px;background:var(--yellow);color:var(--navy);border-radius:8px;padding:1px 5px;margin-left:3px;font-weight:800;}
.ho-btn-add{flex-shrink:0;padding:5px 10px;border-radius:16px;border:1px dashed #bbb;font-size:12px;color:#666;background:#fff;cursor:pointer;}

.ho-doc{background:#fff;border:2px solid var(--border);}
.ho-grid{display:flex;flex-direction:column;}
.ho-col-left,.ho-col-right{display:flex;flex-direction:column;}
/* 左列（メインシート）と右列（当欠・事故車など）は高さを連動させない。
   一方の内容が伸びても他方の枠が引っ張られて伸びないよう、独立した縦積みコンテナに分ける。 */
@media(min-width:800px){
  .ho-grid{flex-direction:row;align-items:flex-start;min-height:640px;}
  .ho-col-left{flex:1;border-right:1.5px solid var(--border);}
  .ho-col-right{width:360px;flex-shrink:0;}
  .ho-sec.ho-main{min-height:520px;}
}
.ho-top{display:flex;align-items:center;gap:10px;padding:6px 12px;flex-wrap:wrap;border-bottom:1.5px solid var(--border);}
.ho-date-txt{font-size:20px;font-weight:800;color:var(--navy);}
.ho-kabu{display:flex;align-items:center;gap:12px;flex-wrap:wrap;}
.ho-kabu-item{display:flex;align-items:center;gap:5px;}
.ho-kabu-lbl{font-size:13px;color:var(--muted);font-weight:700;white-space:nowrap;}
.ho-kabu-inp{width:80px;border:1px solid #bbb;border-radius:4px;padding:2px 4px;font-size:18px;font-weight:800;
             text-align:center;color:var(--navy);outline:none;background:#fafafa;}
.ho-kabu-inp:read-only{background:#f0f0f0;color:#888;}
.ho-douta-btn{border:1.5px solid #bbb;border-radius:4px;padding:2px 10px;font-size:15px;font-weight:800;cursor:pointer;
              background:#fafafa;color:#888;}
.ho-douta-btn.ok{border-color:#4caf50;background:#f0fff4;color:#2e7d32;}
.ho-douta-btn:disabled{cursor:default;}
.ho-del-btn{background:none;border:none;font-size:15px;cursor:pointer;color:#ccc;margin-left:auto;padding:2px 4px;}
.ho-del-btn:hover{color:var(--red);}

.ho-sec{padding:8px 10px;border-bottom:1px solid #ddd;display:flex;flex-direction:column;min-height:120px;}
.ho-sec:last-child{border-bottom:none;}
/* 点検・車検・リコールは初期表示を2行程度に抑え、その分を車両異常・修理予定に回す
   （どちらも内容が増えれば通常のセクション同様に枠ごと下へ伸びる） */
.ho-sec.ho-tenken{min-height:80px;}
.ho-sec.ho-joshu{min-height:160px;}
.ho-lbl{font-size:var(--ho-fs,14px);font-weight:800;color:var(--navy);text-decoration:underline;text-underline-offset:2px;margin-bottom:4px;flex-shrink:0;}
.ho-lbl.red{color:var(--red);}
.ho-ta{width:100%;border:none;outline:none;font-size:var(--ho-fs,14px);line-height:1.8;resize:none;font-family:inherit;
       background:transparent;color:#111;flex:1;min-height:100px;}
.ho-ta[readonly]{color:#555;}
.ho-ce{width:100%;outline:none;font-size:var(--ho-fs,14px);line-height:1.8;word-break:break-all;white-space:pre-wrap;color:#111;flex:1;}
.ho-ce[contenteditable="false"]{color:#555;}

#ho-toolbar{position:fixed;z-index:600;display:none;align-items:center;gap:6px;background:#1e2a3a;border-radius:10px;
            padding:7px 9px;box-shadow:0 6px 20px rgba(0,0,0,.35);}
.ho-cbtn{border:none;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:800;cursor:pointer;}
.ho-cbtn-k{background:#fff;color:#111;}
.ho-cbtn-r{background:var(--red);color:#fff;}
.ho-cbtn-x{background:transparent;border:none;color:rgba(255,255,255,.4);font-size:16px;cursor:pointer;padding:0 2px;}

#ho-save-dot{position:fixed;top:64px;right:18px;width:8px;height:8px;border-radius:50%;opacity:0;transition:opacity .3s;z-index:400;}
#ho-save-dot.saving{opacity:1;background:var(--yellow);animation:hoPulse .8s ease-in-out infinite;}
#ho-save-dot.saved{opacity:1;background:#4caf50;animation:none;}
@keyframes hoPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.5);}}
#ho-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(30,42,58,.9);color:#fff;
          font-size:12px;font-weight:700;padding:8px 18px;border-radius:18px;z-index:700;opacity:0;transition:opacity .25s;
          pointer-events:none;white-space:nowrap;}
#ho-toast.show{opacity:1;}

#ho-suggest{position:fixed;z-index:650;background:#fff;border:1px solid #ccc;border-radius:6px;
            box-shadow:0 6px 18px rgba(0,0,0,.18);max-height:180px;overflow-y:auto;display:none;min-width:110px;}
.ho-suggest-item{padding:6px 12px;font-size:13px;cursor:pointer;white-space:nowrap;color:#111;}
.ho-suggest-item:hover{background:#f0c04033;}
#ho-numpick{position:fixed;z-index:650;display:none;gap:6px;background:#1e2a3a;border-radius:8px;padding:6px;
            box-shadow:0 6px 18px rgba(0,0,0,.3);}
.ho-num-btn{border:none;border-radius:5px;padding:6px 10px;font-size:12px;font-weight:800;cursor:pointer;}
.ho-num-btn.minus{background:#ffe1e1;color:#c62828;}
.ho-num-btn.plus{background:#e3f5e6;color:#2e7d32;}

#ho-fontset-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:800;display:none;
                    align-items:center;justify-content:center;}
#ho-fontset-overlay.show{display:flex;}
#ho-fontset-modal{background:#fff;border-radius:10px;padding:18px 20px;width:340px;max-width:90vw;
                  box-shadow:0 12px 32px rgba(0,0,0,.3);}
.ho-fontset-head{display:flex;align-items:center;justify-content:space-between;font-size:15px;font-weight:800;
                 color:var(--navy);margin-bottom:4px;}
#ho-fontset-close{border:none;background:transparent;font-size:18px;color:#999;cursor:pointer;padding:0 4px;line-height:1;}
.ho-fontset-desc{font-size:12px;color:var(--muted);margin-bottom:12px;}
.ho-fontset-row{display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid #eee;}
.ho-fontset-row:last-child{border-bottom:none;}
.ho-fontset-name{font-size:13px;font-weight:700;color:#333;}
.ho-fontset-opts{display:flex;gap:4px;}
.ho-fontset-btn{border:1px solid #ccc;background:#fafafa;border-radius:5px;padding:3px 9px;font-size:11px;
                font-weight:700;color:#555;cursor:pointer;}
.ho-fontset-btn.active{background:var(--navy);border-color:var(--navy);color:#fff;}
.ho-fontset-btn.disabled{cursor:default;opacity:.5;}

.ho-toolrow{display:flex;justify-content:flex-end;margin-bottom:8px;}
.ho-tokasum-btn{border:1px solid #ccc;background:#fff;color:#374151;border-radius:16px;padding:5px 12px;
                font-size:12px;font-weight:700;cursor:pointer;}
#ho-tokasum-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:800;display:none;
                    align-items:center;justify-content:center;}
#ho-tokasum-overlay.show{display:flex;}
#ho-tokasum-modal{background:#fff;border-radius:10px;padding:18px 20px;width:400px;max-width:92vw;
                  max-height:82vh;display:flex;flex-direction:column;box-shadow:0 12px 32px rgba(0,0,0,.3);}
.ho-tokasum-head{display:flex;align-items:center;justify-content:space-between;font-size:15px;font-weight:800;
                 color:var(--navy);margin-bottom:10px;flex-shrink:0;}
#ho-tokasum-close{border:none;background:transparent;font-size:18px;color:#999;cursor:pointer;padding:0 4px;line-height:1;}
.ho-tokasum-monthbar{display:flex;align-items:center;justify-content:center;gap:14px;margin-bottom:10px;flex-shrink:0;}
.ho-tokasum-monthbtn{border:1px solid #ccc;background:#fafafa;border-radius:6px;padding:4px 10px;font-size:13px;
                     font-weight:800;cursor:pointer;color:#333;}
.ho-tokasum-monthlbl{font-size:15px;font-weight:800;color:var(--navy);min-width:96px;text-align:center;}
.ho-tokasum-count{text-align:center;font-size:13px;color:#333;margin-bottom:10px;flex-shrink:0;}
.ho-tokasum-count b{font-size:20px;color:var(--red);margin:0 3px;}
.ho-tokasum-list{overflow-y:auto;flex:1;border-top:1px solid #eee;}
.ho-tokasum-row{display:flex;align-items:center;gap:10px;padding:7px 2px;border-bottom:1px solid #f0f0f0;font-size:13px;}
.ho-tokasum-row-date{color:var(--muted);flex-shrink:0;width:76px;}
.ho-tokasum-row-name{flex:1;color:#111;font-weight:700;}
.ho-tokasum-row-val{color:var(--red);font-weight:800;}
.ho-tokasum-empty{text-align:center;color:var(--muted);font-size:13px;padding:24px 0;}
</style>

<div id="ho-root">
  <div class="ho-tabs-h" id="ho-tabs-m"></div>
  <div class="ho-toolrow"><button type="button" id="ho-tokasum-btn" class="ho-tokasum-btn">当欠記録を見る</button></div>
  <div class="ho-date-bar" id="ho-date-bar"></div>
  <div id="ho-sheet-wrap"></div>
</div>

<div id="ho-toolbar">
  <button class="ho-cbtn ho-cbtn-k" id="ho-c-black">黒</button>
  <button class="ho-cbtn ho-cbtn-r" id="ho-c-red">赤</button>
  <button class="ho-cbtn-x" id="ho-c-close">×</button>
</div>
<div id="ho-suggest"></div>
<div id="ho-numpick">
  <button class="ho-num-btn minus" data-v="-1.0">-1.0</button>
  <button class="ho-num-btn minus" data-v="-0.5">-0.5</button>
  <button class="ho-num-btn plus" data-v="+0.5">+0.5</button>
  <button class="ho-num-btn plus" data-v="+1.0">+1.0</button>
</div>
<div id="ho-save-dot"></div>
<div id="ho-toast"></div>
<div id="ho-fontset-overlay">
  <div id="ho-fontset-modal">
    <div class="ho-fontset-head"><span>文字サイズ設定</span><button type="button" id="ho-fontset-close">×</button></div>
    <div class="ho-fontset-desc">課ごとに引き継ぎシート本文の文字サイズを設定します。</div>
    <div id="ho-fontset-rows"></div>
  </div>
</div>
<div id="ho-tokasum-overlay">
  <div id="ho-tokasum-modal">
    <div class="ho-tokasum-head"><span>当欠記録</span><button type="button" id="ho-tokasum-close">×</button></div>
    <div class="ho-tokasum-monthbar">
      <button type="button" class="ho-tokasum-monthbtn" id="ho-tokasum-prev">‹前月</button>
      <span class="ho-tokasum-monthlbl" id="ho-tokasum-monthlbl"></span>
      <button type="button" class="ho-tokasum-monthbtn" id="ho-tokasum-next">翌月›</button>
    </div>
    <div class="ho-tokasum-count" id="ho-tokasum-count"></div>
    <div class="ho-tokasum-list" id="ho-tokasum-list"></div>
  </div>
</div>

<script>
(function(){
const API = ${safeJson(`${ADMIN_PATH}/api/handover`)};
const EDITABLE = ${editable ? 'true' : 'false'};
function lastDivision(){
  const v = parseInt(localStorage.getItem('ho_last_division'), 10);
  return (v >= 1 && v <= 4) ? v : 1;
}
const H = {
  division: lastDivision(), date: null, dates: [], updatedAt: null, fieldTimers: {}, savedRange: null,
  numpickApply: null, fontSizes: { 1: 14, 2: 14, 3: 14, 4: 14 },
};
// DOM要素id → DBカラム名（項目単位の部分保存で使用）
const FIELD_BY_ID = {
  'ho-kabu-y':'kabu_yotei', 'ho-kabu-j':'kabu_jisseki', 'ho-douta-btn':'douta',
  'ho-main-c':'main_content', 'ho-toka-c':'toka_content', 'ho-jomu-c':'jomu_content',
  'ho-jiko-c':'jiko_content', 'ho-tenken-c':'tenken_content', 'ho-joshu-c':'joshu_content',
};

function esc(s){ return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function safeNum(v){ return (v===null||v===undefined||v==='') ? '' : String(v); }
function safeHtml(s){ return (!s || s === 'NaN') ? '' : s; }
function today(){
  const n = new Date(new Date().toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}));
  return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');
}
function fmtDate(s){
  const [,m,d] = s.split('-');
  const w = ['日','月','火','水','木','金','土'][new Date(s+'T00:00:00+09:00').getDay()];
  return m+'/'+d+'('+w+')';
}
let toastTimer;
function toast(msg, dur){
  const el = document.getElementById('ho-toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), dur || 2200);
}

async function api(method, path, body){
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'エラー');
  return data;
}

// ===== 候補入力（当欠：名前＋数値 / 点検類：車番）=====
function hideSuggest(){
  const el = document.getElementById('ho-suggest');
  el.style.display = 'none'; el.innerHTML = '';
}
function showSuggestList(items, rect, onPick){
  const el = document.getElementById('ho-suggest');
  if (!items || !items.length){ hideSuggest(); return; }
  el.innerHTML = items.map(t => '<div class="ho-suggest-item">'+esc(t)+'</div>').join('');
  el.style.display = 'block';
  const h = Math.min(180, items.length * 30);
  let top = rect.bottom + 4;
  if (top + h > window.innerHeight) top = rect.top - 4 - h;
  let left = Math.max(4, Math.min(rect.left, window.innerWidth - 130));
  el.style.left = left+'px'; el.style.top = top+'px';
  [...el.children].forEach((div, i) => div.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); onPick(items[i]); }));
}
function hideNumpick(){
  document.getElementById('ho-numpick').style.display = 'none';
  H.numpickApply = null;
}
function showNumpick(rect, onApply){
  const el = document.getElementById('ho-numpick');
  el.style.display = 'flex';
  let top = rect.bottom + 6;
  if (top + 44 > window.innerHeight) top = rect.top - 44;
  let left = Math.max(4, Math.min(rect.left, window.innerWidth - 160));
  el.style.left = left+'px'; el.style.top = top+'px';
  H.numpickApply = onApply;
}
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#ho-suggest')) hideSuggest();
  if (!e.target.closest('#ho-numpick')) hideNumpick();
});
document.querySelectorAll('#ho-numpick .ho-num-btn').forEach(b => b.addEventListener('mousedown', (e) => {
  e.preventDefault(); e.stopPropagation();
  if (H.numpickApply) H.numpickApply(b.dataset.v);
}));

// テキストエリア内のキャレット位置をミラーdivで算出（座標系はビューポート基準）
function getTextareaCaretRect(ta){
  const div = document.createElement('div');
  const style = getComputedStyle(ta);
  ['boxSizing','width','fontFamily','fontSize','fontWeight','lineHeight','padding',
   'borderWidth','borderStyle','letterSpacing'].forEach(p => { div.style[p] = style[p]; });
  div.style.position = 'absolute'; div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap'; div.style.wordWrap = 'break-word';
  div.style.top = '0'; div.style.left = '-9999px'; div.style.height = 'auto';
  div.textContent = ta.value.substring(0, ta.selectionStart);
  const span = document.createElement('span');
  span.textContent = '.';
  div.appendChild(span);
  document.body.appendChild(div);
  const taRect = ta.getBoundingClientRect();
  const spanRect = span.getBoundingClientRect();
  const divRect = div.getBoundingClientRect();
  const lineH = parseInt(style.lineHeight, 10) || 20;
  const top = taRect.top + (spanRect.top - divRect.top) - ta.scrollTop;
  const left = taRect.left + (spanRect.left - divRect.left) - ta.scrollLeft;
  document.body.removeChild(div);
  return { top, left, bottom: top + lineH, right: left };
}

// 現在カーソル行の行頭からカーソル位置までのテキストを取得（テキストエリア共通ヘルパー）
function currentLineText(ta){
  const pos = ta.selectionStart;
  const val = ta.value;
  const lineStart = val.lastIndexOf('\\n', pos - 1) + 1;
  return { lineStart, pos, text: val.slice(lineStart, pos) };
}
// テキストエリアに「入力中の行から社員名簿を検索して候補を出す」処理を付与する（当欠・乗務希望で共用）。
// opts.skipIfDone: この行はもう入力確定済みとみなして候補を出さない判定（当欠の±数値行など）
// opts.afterPick: 名前確定後の追加処理（当欠は続けて±数値ピッカーを出す）。無ければ通常保存のみ。
function attachNameSuggest(ta, field, opts){
  if (!ta) return;
  opts = opts || {};
  let timer;
  ta.addEventListener('input', () => {
    scheduleSave(field);
    if (opts.onInput) opts.onInput();
    clearTimeout(timer);
    const info = currentLineText(ta);
    if (!info.text.trim() || (opts.skipIfDone && opts.skipIfDone(info.text))){ hideSuggest(); return; }
    timer = setTimeout(async () => {
      let data;
      try { data = await api('GET', '/'+H.division+'/employee-suggest?q='+encodeURIComponent(info.text.trim())); }
      catch(e){ return; }
      if (document.activeElement !== ta) return;
      const rect = getTextareaCaretRect(ta);
      let names = data.names || [];
      if (opts.extraNames){
        const q = info.text.trim();
        names = names.concat(opts.extraNames.filter(n => n.includes(q) && !names.includes(n)));
      }
      showSuggestList(names, rect, (name) => {
        const cur = ta.value;
        ta.value = cur.slice(0, info.lineStart) + name + cur.slice(info.pos);
        const newPos = info.lineStart + name.length;
        ta.focus(); ta.setSelectionRange(newPos, newPos);
        hideSuggest();
        if (opts.afterPick) opts.afterPick(ta, newPos);
        else scheduleSave(field);
      });
    }, 280);
  });
}

// 当欠欄の「名前 ±数値」行を集計し、稼働予定が入力済みなら稼働実績へ自動反映
function calcTokaDelta(text){
  let sum = 0;
  (text || '').split('\\n').forEach(line => {
    const m = line.trim().match(/([+\\-])(0\\.5|1\\.0)$/);
    if (m) sum += (m[1] === '-' ? -1 : 1) * parseFloat(m[2]);
  });
  return sum;
}
function recalcJisseki(){
  const yoteiEl = document.getElementById('ho-kabu-y');
  const jissekiEl = document.getElementById('ho-kabu-j');
  if (!yoteiEl || !jissekiEl) return;
  const yotei = parseFloat(yoteiEl.value);
  if (isNaN(yotei)) return;
  const delta = calcTokaDelta(document.getElementById('ho-toka-c')?.value);
  jissekiEl.value = String(Math.round((yotei + delta) * 10) / 10);
  scheduleSave('kabu_jisseki');
}

// contenteditable内のキャレット直前の「単語」を取得（車番オートコンプリート用）
function getCaretWord(el){
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return null;
  const node = range.startContainer;
  if (node.nodeType !== 3) return null;
  const offset = range.startOffset;
  const text = node.textContent || '';
  let start = offset;
  while (start > 0 && !/[\\s\\n　]/.test(text[start-1])) start--;
  const word = text.slice(start, offset);
  if (!word) return null;
  const wordRange = document.createRange();
  wordRange.setStart(node, start);
  wordRange.setEnd(node, offset);
  return { word, range: wordRange };
}
let carSuggestTimer;
function attachCarSuggest(el, field){
  if (!el) return;
  el.addEventListener('input', () => {
    clearTimeout(carSuggestTimer);
    const info = getCaretWord(el);
    if (!info || info.word.length < 2){ hideSuggest(); return; }
    carSuggestTimer = setTimeout(async () => {
      let data;
      try { data = await api('GET', '/'+H.division+'/car-suggest?q='+encodeURIComponent(info.word)); }
      catch(e){ return; }
      const list = data.car_nos || [];
      if (!list.length){ hideSuggest(); return; }
      const rect = info.range.getBoundingClientRect();
      showSuggestList(list, rect, (carNo) => {
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(info.range);
        document.execCommand('insertText', false, carNo);
        hideSuggest();
        el.focus();
        scheduleSave(field);
      });
    }, 280);
  });
}

// ===== 全角→半角自動変換 =====
function hankakuify(s){ return s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)); }
function attachHankaku(el){
  if (!el) return;
  let composing = false;
  el.addEventListener('compositionstart', () => { composing = true; });
  el.addEventListener('compositionend', () => { composing = false; convertEl(el); });
  el.addEventListener('input', () => { if (!composing) convertEl(el); });
}
function convertEl(el){
  if (el.tagName === 'TEXTAREA'){
    const pos = el.selectionStart;
    const next = hankakuify(el.value);
    if (next !== el.value){ el.value = next; el.setSelectionRange(pos, pos); }
  } else {
    const sel = window.getSelection();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    const sc = range?.startContainer; const so = range?.startOffset;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())){
      const next = hankakuify(node.textContent);
      if (next !== node.textContent) node.textContent = next;
    }
    if (range && sc){
      try {
        const r = document.createRange();
        r.setStart(sc, Math.min(so, sc.textContent?.length ?? 0));
        r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
      } catch {}
    }
  }
}

// ===== 課タブ =====
// タイトル行右側（headerExtra側の#ho-tabs）とモバイル用フォールバック（本文側の#ho-tabs-m）の
// 両方に同じ内容を描画する。
function renderTabs(){
  const html = [1,2,3,4].map(d =>
    '<div class="ho-tab-h'+(d===H.division?' active':'')+'" data-d="'+d+'">板橋'+d+'課</div>'
  ).join('');
  ['ho-tabs','ho-tabs-m'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    el.querySelectorAll('.ho-tab-h').forEach(t => t.addEventListener('click', () => switchDivision(parseInt(t.dataset.d))));
  });
}
async function switchDivision(d){
  if (d === H.division) return;
  H.division = d; H.date = null;
  try { localStorage.setItem('ho_last_division', String(d)); } catch {}
  renderTabs();
  applyFontSize();
  await loadDates();
}

// ===== 文字サイズ設定（課ごと）=====
const FONT_SIZES = [ {v:12,label:'小'}, {v:14,label:'標準'}, {v:16,label:'大'}, {v:18,label:'特大'} ];
function applyFontSize(){
  document.getElementById('ho-root').style.setProperty('--ho-fs', (H.fontSizes[H.division] || 14) + 'px');
}
async function loadFontSizes(){
  try {
    const data = await api('GET', '/font-sizes');
    if (data.sizes) H.fontSizes = data.sizes;
  } catch(e){ /* 取得失敗時は既定値のまま */ }
  applyFontSize();
}
function renderFontSettingsRows(){
  const wrap = document.getElementById('ho-fontset-rows');
  wrap.innerHTML = [1,2,3,4].map(d => {
    const cur = H.fontSizes[d] || 14;
    const opts = FONT_SIZES.map(o =>
      '<button type="button" class="ho-fontset-btn'+(o.v===cur?' active':'')+(EDITABLE?'':' disabled')+
      '" data-d="'+d+'" data-v="'+o.v+'">'+o.label+'</button>'
    ).join('');
    return '<div class="ho-fontset-row"><span class="ho-fontset-name">板橋'+d+'課</span><div class="ho-fontset-opts">'+opts+'</div></div>';
  }).join('');
  if (!EDITABLE) return;
  wrap.querySelectorAll('.ho-fontset-btn').forEach(b => b.addEventListener('click', () => setFontSize(parseInt(b.dataset.d,10), parseInt(b.dataset.v,10))));
}
async function setFontSize(division, size){
  try {
    await api('PUT', '/'+division+'/font-size', { size });
    H.fontSizes[division] = size;
    renderFontSettingsRows();
    if (division === H.division) applyFontSize();
    toast('文字サイズを変更しました');
  } catch(e){ toast('エラー: '+e.message, 2500); }
}
function openFontSettings(){
  renderFontSettingsRows();
  document.getElementById('ho-fontset-overlay').classList.add('show');
}
function closeFontSettings(){
  document.getElementById('ho-fontset-overlay').classList.remove('show');
}
document.getElementById('ho-fontset-close').addEventListener('click', closeFontSettings);
document.getElementById('ho-fontset-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'ho-fontset-overlay') closeFontSettings();
});
// ヘッダー行の「引き継ぎシート」タイトルをクリックすると文字サイズ設定を開く
const hoTitleEl = document.querySelector('.desktop-header h1');
if (hoTitleEl){
  hoTitleEl.style.cursor = 'pointer';
  hoTitleEl.style.borderBottom = '1px dotted #9ca3af';
  hoTitleEl.title = 'クリックで文字サイズ設定を開く';
  hoTitleEl.addEventListener('click', openFontSettings);
}

// ===== 当欠記録（月間集計）=====
function currentYm(){
  const t = today();
  return t.slice(0, 7);
}
function addMonth(ym, delta){
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
function fmtYm(ym){
  const [y, m] = ym.split('-');
  return y + '年' + parseInt(m, 10) + '月';
}
function fmtMd(dateStr){
  const [, m, d] = dateStr.split('-');
  const w = ['日','月','火','水','木','金','土'][new Date(dateStr+'T00:00:00+09:00').getDay()];
  return m+'/'+d+'('+w+')';
}
async function loadTokaSummary(){
  document.getElementById('ho-tokasum-monthlbl').textContent = fmtYm(H.tokaSumMonth);
  const listEl = document.getElementById('ho-tokasum-list');
  const countEl = document.getElementById('ho-tokasum-count');
  listEl.innerHTML = '<div class="ho-tokasum-empty">読み込み中…</div>';
  try {
    const data = await api('GET', '/'+H.division+'/toka-summary?month='+H.tokaSumMonth);
    countEl.innerHTML = '板橋'+H.division+'課 当欠数：<b>'+data.count+'</b>件';
    if (!data.entries.length){
      listEl.innerHTML = '<div class="ho-tokasum-empty">この月の当欠記録はありません</div>';
      return;
    }
    listEl.innerHTML = data.entries.map(e =>
      '<div class="ho-tokasum-row"><span class="ho-tokasum-row-date">'+fmtMd(e.date)+'</span>'+
      '<span class="ho-tokasum-row-name">'+esc(e.name)+'</span>'+
      '<span class="ho-tokasum-row-val">'+e.value.toFixed(1)+'</span></div>'
    ).join('');
  } catch(e){
    listEl.innerHTML = '<div class="ho-tokasum-empty">読み込みエラー: '+esc(e.message)+'</div>';
  }
}
function openTokaSummary(){
  if (!H.tokaSumMonth) H.tokaSumMonth = currentYm();
  document.getElementById('ho-tokasum-overlay').classList.add('show');
  loadTokaSummary();
}
function closeTokaSummary(){
  document.getElementById('ho-tokasum-overlay').classList.remove('show');
}
document.getElementById('ho-tokasum-btn').addEventListener('click', openTokaSummary);
document.getElementById('ho-tokasum-close').addEventListener('click', closeTokaSummary);
document.getElementById('ho-tokasum-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'ho-tokasum-overlay') closeTokaSummary();
});
document.getElementById('ho-tokasum-prev').addEventListener('click', () => {
  H.tokaSumMonth = addMonth(H.tokaSumMonth, -1);
  loadTokaSummary();
});
document.getElementById('ho-tokasum-next').addEventListener('click', () => {
  H.tokaSumMonth = addMonth(H.tokaSumMonth, 1);
  loadTokaSummary();
});

// ===== 日付バー =====
function renderDateBar(){
  const bar = document.getElementById('ho-date-bar');
  bar.innerHTML = '';
  if (EDITABLE){
    const addBtn = document.createElement('button');
    addBtn.className = 'ho-btn-add';
    addBtn.textContent = H.dates.length === 0 ? '＋ 今日' : '＋ 翌日';
    addBtn.onclick = () => doCreateNext();
    bar.appendChild(addBtn);
  }
  const t = today();
  H.dates.forEach(d => {
    const tab = document.createElement('button');
    tab.className = 'ho-date-tab'+(d===H.date?' active':'')+(d===t?' is-today':'');
    tab.innerHTML = fmtDate(d)+(d===t?'<span class="ho-today-chip">今日</span>':'');
    tab.onclick = () => loadSheet(d);
    if (EDITABLE) tab.ondblclick = () => confirmDeleteDate(d);
    bar.appendChild(tab);
  });
  const active = bar.querySelector('.ho-date-tab.active');
  if (active) setTimeout(() => active.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}), 60);
}

async function loadDates(){
  const data = await api('GET', '/'+H.division+'/dates');
  H.dates = data.dates;
  renderDateBar();
  const t = today();
  const target = H.dates.includes(t) ? t : (H.dates[0] || null);
  if (target) await loadSheet(target);
  else { H.date = null; document.getElementById('ho-sheet-wrap').innerHTML = ''; }
}

// ===== シート描画 =====
async function loadSheet(date){
  H.date = date;
  renderDateBar();
  try {
    const data = await api('GET', '/'+H.division+'/'+date);
    H.updatedAt = data.sheet?.updated_at || null;
    renderSheet(data.sheet, date);
  } catch(e){ toast('読み込みエラー: '+e.message, 3000); }
}

function renderSheet(sheet, date){
  const el = document.getElementById('ho-sheet-wrap');
  const ro = EDITABLE ? '' : ' readonly';
  const ce = EDITABLE ? 'true' : 'false';
  const t = today();
  const douta = sheet?.douta || '未';
  const doutaCls = douta === '⭕' ? ' ok' : '';

  el.innerHTML =
    '<div class="ho-doc"><div class="ho-grid">' +
    '<div class="ho-col-left">' +
      '<div class="ho-top">' +
        '<span class="ho-date-txt">'+fmtDate(date)+'</span>' +
        (date===t ? '<span class="ho-today-chip">今日</span>' : '') +
        '<div class="ho-kabu">' +
          '<div class="ho-kabu-item"><span class="ho-kabu-lbl">予定</span>' +
            '<input class="ho-kabu-inp" id="ho-kabu-y" type="number" step="0.5" min="0" max="999" value="'+safeNum(sheet?.kabu_yotei)+'"'+ro+'></div>' +
          '<div class="ho-kabu-item"><span class="ho-kabu-lbl">実績</span>' +
            '<input class="ho-kabu-inp" id="ho-kabu-j" type="number" step="0.5" min="0" max="999" value="'+safeNum(sheet?.kabu_jisseki)+'"'+ro+'></div>' +
          '<div class="ho-kabu-item"><span class="ho-kabu-lbl">動態</span>' +
            '<button class="ho-douta-btn'+doutaCls+'" id="ho-douta-btn"'+(EDITABLE?'':' disabled')+'>'+douta+'</button></div>' +
        '</div>' +
        (EDITABLE ? '<button class="ho-del-btn" id="ho-del-btn" title="このシートを削除">🗑</button>' : '') +
      '</div>' +
      '<div class="ho-sec ho-main"><div class="ho-ce" id="ho-main-c" contenteditable="'+ce+'">'+safeHtml(sheet?.main_content)+'</div></div>' +
    '</div>' +
    '<div class="ho-col-right">' +
      '<div class="ho-sec ho-toka"><div class="ho-lbl">当欠・理由</div><textarea class="ho-ta" id="ho-toka-c"'+ro+'>'+esc(sheet?.toka_content||'')+'</textarea></div>' +
      '<div class="ho-sec ho-jiko"><div class="ho-lbl red">事故車</div><div class="ho-ce" id="ho-jiko-c" contenteditable="'+ce+'">'+safeHtml(sheet?.jiko_content)+'</div></div>' +
      '<div class="ho-sec ho-tenken"><div class="ho-lbl">点検・車検・リコール</div><div class="ho-ce" id="ho-tenken-c" contenteditable="'+ce+'">'+safeHtml(sheet?.tenken_content)+'</div></div>' +
      '<div class="ho-sec ho-joshu"><div class="ho-lbl">車両異常・修理予定</div><div class="ho-ce" id="ho-joshu-c" contenteditable="'+ce+'">'+safeHtml(sheet?.joshu_content)+'</div></div>' +
      '<div class="ho-sec ho-jomu"><div class="ho-lbl">乗務希望</div><textarea class="ho-ta" id="ho-jomu-c"'+ro+'>'+esc(sheet?.jomu_content||'')+'</textarea></div>' +
    '</div>' +
    '</div></div>';

  if (EDITABLE){
    document.getElementById('ho-kabu-y')?.addEventListener('input', () => { recalcJisseki(); scheduleSave('kabu_yotei'); });
    document.getElementById('ho-kabu-j')?.addEventListener('change', () => scheduleSave('kabu_jisseki'));
    const doutaBtn = document.getElementById('ho-douta-btn');
    doutaBtn?.addEventListener('click', () => {
      const isOk = doutaBtn.textContent === '⭕';
      doutaBtn.textContent = isOk ? '未' : '⭕';
      doutaBtn.classList.toggle('ok', !isOk);
      // クリック1回＝1つの確定した状態変更なので、他項目のようにデバウンスせず即保存する
      // （デバウンス待ち中に他ページへ移動すると保存されないまま失われるため）
      document.getElementById('ho-save-dot').className = 'saving';
      saveField('douta', H.division, H.date, fieldValue('douta'));
    });
    const tokaEl = document.getElementById('ho-toka-c');
    if (tokaEl){
      attachNameSuggest(tokaEl, 'toka_content', {
        onInput: recalcJisseki,
        skipIfDone: (text) => /[+\\-](0\\.5|1\\.0)\\s*$/.test(text),
        extraNames: ['不明', '入力ミス'],
        afterPick: (ta, newPos) => {
          const numRect = getTextareaCaretRect(ta);
          showNumpick(numRect, (signed) => {
            const cur2 = ta.value;
            const insert = ' ' + signed + '\\n';
            ta.value = cur2.slice(0, newPos) + insert + cur2.slice(newPos);
            const finalPos = newPos + insert.length;
            ta.focus(); ta.setSelectionRange(finalPos, finalPos);
            hideNumpick();
            scheduleSave('toka_content');
            recalcJisseki();
          });
        },
      });
      attachHankaku(tokaEl);
    }
    const jomuEl = document.getElementById('ho-jomu-c');
    if (jomuEl){
      attachNameSuggest(jomuEl, 'jomu_content');
      attachHankaku(jomuEl);
    }
    ['ho-main-c','ho-jiko-c','ho-tenken-c','ho-joshu-c'].forEach(id => {
      const c2 = document.getElementById(id);
      if (!c2) return;
      c2.addEventListener('input', () => scheduleSave(FIELD_BY_ID[id]));
      attachHankaku(c2);
    });
    attachCarSuggest(document.getElementById('ho-tenken-c'), 'tenken_content');
    attachCarSuggest(document.getElementById('ho-joshu-c'), 'joshu_content');
    document.getElementById('ho-del-btn')?.addEventListener('click', () => confirmDeleteDate(H.date));
  }
}

// ===== 色ツールバー =====
let tbHideTimer;
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount){
    clearTimeout(tbHideTimer);
    tbHideTimer = setTimeout(hideToolbar, 180);
    return;
  }
  const range = sel.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const ce = node.nodeType===1 ? node.closest('.ho-ce') : node.parentElement?.closest('.ho-ce');
  if (!ce || ce.contentEditable !== 'true'){ hideToolbar(); return; }
  clearTimeout(tbHideTimer);
  H.savedRange = range.cloneRange();
  const rect = range.getBoundingClientRect();
  const tb = document.getElementById('ho-toolbar');
  tb.style.display = 'flex';
  const tw = tb.offsetWidth || 140;
  let left = rect.left + rect.width/2 - tw/2;
  left = Math.max(8, Math.min(left, window.innerWidth-tw-8));
  let top = rect.top - 52 + window.scrollY;
  if (top < 60) top = rect.bottom + 8 + window.scrollY;
  tb.style.left = left+'px'; tb.style.top = top+'px';
});
function hideToolbar(){ document.getElementById('ho-toolbar').style.display='none'; H.savedRange=null; }
function applyColor(color){
  if (!H.savedRange) return;
  const sel = window.getSelection();
  sel.removeAllRanges(); sel.addRange(H.savedRange);
  document.execCommand('styleWithCSS', false, true);
  document.execCommand('foreColor', false, color);
  const node = H.savedRange.commonAncestorContainer;
  const ceEl = (node.nodeType===1 ? node : node.parentElement)?.closest('.ho-ce');
  hideToolbar();
  if (ceEl && FIELD_BY_ID[ceEl.id]) scheduleSave(FIELD_BY_ID[ceEl.id]);
}
document.getElementById('ho-c-black').onclick = () => applyColor('#000000');
document.getElementById('ho-c-red').onclick = () => applyColor('#e53935');
document.getElementById('ho-c-close').onclick = hideToolbar;

// ===== 保存（項目単位）=====
// 課内の複数アカウントが同時に別の欄を編集しても取り合いにならないよう、保存の都度
// シート全体を上書きするのではなく、変更のあった項目だけをPATCHで送る。
function fieldValue(field){
  switch(field){
    case 'kabu_yotei': return parseFloat(document.getElementById('ho-kabu-y')?.value) || null;
    case 'kabu_jisseki': return parseFloat(document.getElementById('ho-kabu-j')?.value) || null;
    case 'douta': return document.getElementById('ho-douta-btn')?.textContent || '未';
    case 'main_content': return document.getElementById('ho-main-c')?.innerHTML || '';
    case 'toka_content': return document.getElementById('ho-toka-c')?.value || '';
    case 'jiko_content': return document.getElementById('ho-jiko-c')?.innerHTML || '';
    case 'tenken_content': return document.getElementById('ho-tenken-c')?.innerHTML || '';
    case 'joshu_content': return document.getElementById('ho-joshu-c')?.innerHTML || '';
    case 'jomu_content': return document.getElementById('ho-jomu-c')?.value || '';
    default: return null;
  }
}
// division/date/valueはスケジュール時点の値を渡す（発火までの間にユーザーが別の日付・課へ
// 切り替えても、その時点のDOMを読み直さず・誤ったシートへ書き込まないようにするため）
async function saveField(field, division, date, value){
  if (!date) return;
  const dot = document.getElementById('ho-save-dot');
  try {
    const res = await api('PATCH', '/'+division+'/'+date+'/field', { field, value });
    if (division === H.division && date === H.date) H.updatedAt = res.updated_at || H.updatedAt;
    dot.className = 'saved';
    setTimeout(() => { dot.className = ''; }, 2000);
  } catch(e){
    dot.className = '';
    toast('保存に失敗しました: '+e.message, 2500);
  }
}
function scheduleSave(field){
  if (!field) return;
  document.getElementById('ho-save-dot').className = 'saving';
  clearTimeout(H.fieldTimers[field]);
  const division = H.division, date = H.date, value = fieldValue(field);
  H.fieldTimers[field] = setTimeout(() => { H.fieldTimers[field] = null; saveField(field, division, date, value); }, 900);
}
// 保留中の項目保存を即時実行して完了を待つ（Ctrl+S・翌日作成前など）
function flushPendingSaves(){
  const pending = [];
  Object.keys(H.fieldTimers).forEach(field => {
    if (H.fieldTimers[field]){
      clearTimeout(H.fieldTimers[field]);
      H.fieldTimers[field] = null;
      pending.push(saveField(field, H.division, H.date, fieldValue(field)));
    }
  });
  return Promise.all(pending);
}
// 保留中の項目保存を保存せずに破棄（シート削除時など）
function discardPendingSaves(){
  Object.keys(H.fieldTimers).forEach(field => {
    clearTimeout(H.fieldTimers[field]);
    H.fieldTimers[field] = null;
  });
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey||e.metaKey) && e.key==='s'){ e.preventDefault(); flushPendingSaves(); }
  if (e.key==='Escape'){ hideSuggest(); hideNumpick(); }
});

// ===== 削除 =====
async function confirmDeleteDate(d){
  if (!d) return;
  if (!confirm(fmtDate(d)+' のシートを削除しますか？')) return;
  discardPendingSaves();
  try {
    await api('DELETE', '/'+H.division+'/'+d);
    H.dates = H.dates.filter(x => x !== d);
    toast('削除しました');
    if (d === H.date){
      if (H.dates.length > 0) await loadSheet(H.dates[0]);
      else { H.date = null; renderDateBar(); document.getElementById('ho-sheet-wrap').innerHTML = ''; }
    } else {
      renderDateBar();
    }
  } catch(e){ toast('エラー: '+e.message, 3000); }
}

// ===== 翌日作成 =====
async function doCreateNext(){
  if (!H.date || H.dates.length === 0){
    const t = today();
    try {
      await api('PUT', '/'+H.division+'/'+t, {
        kabu_yotei:null, kabu_jisseki:null, main_content:'', toka_content:'',
        jiko_content:'', tenken_content:'', joshu_content:'', jomu_content:'', douta:'未',
      });
      if (!H.dates.includes(t)) H.dates.unshift(t);
      await loadSheet(t);
      toast('今日のシートを作成しました');
    } catch(e){ toast('エラー: '+e.message, 3000); }
    return;
  }
  await flushPendingSaves();
  try {
    const data = await api('POST', '/'+H.division+'/'+H.date+'/next');
    const next = data.nextDate;
    if (!H.dates.includes(next)) H.dates.unshift(next);
    await loadSheet(next);
    toast('翌日のシートを作成しました');
  } catch(e){ toast('エラー: '+e.message, 3000); }
}

// 他ページへのリンククリック時、保存待ち（デバウンス中）の項目があれば遷移前に確定保存する。
// 動態トグルなどをクリックした直後にサイドバーの別メニューへ移動しても保存漏れが起きないようにするため。
document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || a.target === '_blank') return;
  const hasPending = Object.values(H.fieldTimers).some(t => t);
  if (!hasPending) return;
  e.preventDefault();
  const href = a.href;
  flushPendingSaves().finally(() => { window.location.href = href; });
}, true);
// タブを閉じる・戻る等でリンククリックを経由しないケースのフォールバック（完了は保証されないがベストエフォート）
window.addEventListener('pagehide', () => { flushPendingSaves(); });

renderTabs();
loadFontSizes();
loadDates();
})();
</script>
`;
}
