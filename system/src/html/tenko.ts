// 点呼（仮眠室集合パワポ）— 一覧 / 編集 / プレゼン投影 / 印刷 / ライブラリ
//   当直が前日のデッキを複製して当日分に直し、ブラウザのプレゼンモードで仮眠室のモニターに投影する。
//   スライドの描画ロジック（SLIDE_RENDERER_JS）は編集プレビュー・投影・印刷で共通利用する。
import { escHtml, safeJson } from './layout';
import { ADMIN_PATH, MONITOR_ACCIDENTS_PATH } from '../config';

const API = `${ADMIN_PATH}/api/tenko`;
const MEDIA_URL = `${API}/media`;

export type TenkoDeck = {
  id: number;
  deck_date: string;
  title: string;
  confirmer: string;
  weather: string;
  temp_max: string;
  temp_min: string;
  headline: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TenkoSlide = { id: number; deck_id: number; sort_order: number; kind: string; payload: string };
export type TenkoMedia = {
  id: number; kind: string; filename: string; mime_type: string; size_bytes: number;
  is_library: number; label: string; sort_order: number; created_at: string;
};
export type TenkoIdea = {
  id: number; body: string; media_id: number | null; status: string;
  submitted_by: string; created_at: string;
};

export const SLIDE_KINDS: Array<{ kind: string; label: string; desc: string }> = [
  { kind: 'cover',    label: '表紙',           desc: '日付・確認者・天候・気温・一言' },
  { kind: 'notice',   label: '連絡スライド',   desc: '見出し＋箇条書き' },
  { kind: 'message',  label: '大文字メッセージ', desc: '「お客様間違いが発生！」のような1枚' },
  { kind: 'image',    label: '画像',           desc: '画像1枚（＋キャプション）' },
  { kind: 'video',    label: '動画',           desc: 'ドラレコ等の動画' },
  { kind: 'pdf',      label: 'PDF',            desc: 'PDFを1枚として表示' },
  { kind: 'accident', label: '事故件数レポート', desc: 'ホシコン事故モニターをそのまま表示' },
  { kind: 'library',  label: '定型スライド',   desc: '唱和などの完成画像（ライブラリ）' },
  { kind: 'freeform', label: '自由配置',       desc: 'テキスト・画像を自由に配置' },
];

function fmtDeckDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) return d;
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const w = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
  return `${Number(m[2])}月${Number(m[3])}日（${w}）`;
}

// ===================================================================
// 共通スライド描画（ブラウザ側 JS）。renderSlideHTML(slide, opts) を提供する。
//   slide = { kind, payload(object) }
//   window.TK_MEDIA_URL / window.TK_MONITOR_PATH / window.TK_DECK を参照する
// ===================================================================
export const SLIDE_RENDERER_JS = `
window.TK_MEDIA_URL = ${JSON.stringify(MEDIA_URL)};
window.TK_MONITOR_PATH = ${JSON.stringify(MONITOR_ACCIDENTS_PATH)};
function tkEsc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function tkMediaSrc(id){return window.TK_MEDIA_URL + '/' + id + '/file';}
function tkCoverDateLabel(dstr){
  var m=/^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(dstr||'');
  if(!m) return dstr||'';
  var dt=new Date(+m[1],+m[2]-1,+m[3]);
  var w=['日','月','火','水','木','金','土'][dt.getDay()];
  return +m[1]+'年'+(+m[2])+'月'+(+m[3])+'日（'+w+'）';
}
function renderSlideHTML(slide, opts){
  opts = opts || {};
  var p = slide.payload || {};
  var k = slide.kind;
  if(k==='cover'){
    var d = window.TK_DECK || {};
    var meta = [];
    if(d.confirmer) meta.push('確認者：'+tkEsc(d.confirmer));
    if(d.weather) meta.push('天候：'+tkEsc(d.weather));
    if(d.temp_max) meta.push('最高 '+tkEsc(d.temp_max)+'℃');
    if(d.temp_min) meta.push('最低 '+tkEsc(d.temp_min)+'℃');
    return '<div class="tk-slide tk-cover">'
      + '<div class="tk-cover-top">'+tkEsc(tkCoverDateLabel(d.deck_date))+'　<b>点呼</b></div>'
      + '<div class="tk-cover-title">'+tkEsc(d.title||'点呼')+'</div>'
      + (meta.length? '<div class="tk-cover-meta">'+meta.join('　／　')+'</div>':'')
      + (d.headline? '<div class="tk-cover-headline">'+tkEsc(d.headline)+'</div>':'')
      + '</div>';
  }
  if(k==='notice'){
    var bl = (p.bullets||[]).filter(function(x){return String(x).trim()!=='';});
    return '<div class="tk-slide tk-notice">'
      + '<div class="tk-notice-head">'+tkEsc(p.heading||'営業所からの業務連絡')+'</div>'
      + '<ul class="tk-notice-list">'+bl.map(function(b){return '<li>'+tkEsc(b)+'</li>';}).join('')+'</ul>'
      + '</div>';
  }
  if(k==='message'){
    var ac = p.accent==='blue'?'tk-ac-blue':(p.accent==='yellow'?'tk-ac-yellow':'tk-ac-red');
    return '<div class="tk-slide tk-message '+ac+'">'
      + '<div class="tk-message-text">'+tkEsc(p.text||'').replace(/\\n/g,'<br>')+'</div>'
      + (p.sub? '<div class="tk-message-sub">'+tkEsc(p.sub).replace(/\\n/g,'<br>')+'</div>':'')
      + '</div>';
  }
  if(k==='image' || k==='library'){
    var fit = p.fit==='cover'?'cover':'contain';
    if(!p.media_id) return '<div class="tk-slide tk-blank">画像が未選択です</div>';
    return '<div class="tk-slide tk-image">'
      + '<img src="'+tkMediaSrc(p.media_id)+'" style="object-fit:'+fit+'">'
      + (p.caption? '<div class="tk-image-cap">'+tkEsc(p.caption)+'</div>':'')
      + '</div>';
  }
  if(k==='video'){
    if(!p.media_id) return '<div class="tk-slide tk-blank">動画が未選択です</div>';
    var auto = opts.present ? ' data-autoplay="1"' : '';
    return '<div class="tk-slide tk-video">'
      + '<video class="tk-video-el" src="'+tkMediaSrc(p.media_id)+'" playsinline controls preload="metadata"'+auto+'></video>'
      + (p.caption? '<div class="tk-image-cap">'+tkEsc(p.caption)+'</div>':'')
      + '</div>';
  }
  if(k==='pdf'){
    if(!p.media_id) return '<div class="tk-slide tk-blank">PDFが未選択です</div>';
    return '<div class="tk-slide tk-pdf">'
      + '<iframe src="'+tkMediaSrc(p.media_id)+'#toolbar=0&navpanes=0&scrollbar=0&view=FitH" title="PDF"></iframe>'
      + '</div>';
  }
  if(k==='accident'){
    return '<div class="tk-slide tk-accident">'
      + '<iframe src="'+window.TK_MONITOR_PATH+'" title="事故件数レポート"></iframe>'
      + '</div>';
  }
  if(k==='freeform'){
    var boxes = (p.boxes||[]);
    var inner = boxes.map(function(b){
      var st = 'left:'+(+b.x||0)+'%;top:'+(+b.y||0)+'%;width:'+(+b.w||20)+'%;height:'+(+b.h||12)+'%;';
      if(b.type==='image'){
        if(!b.media_id) return '';
        return '<div class="tk-ff-box" style="'+st+'"><img src="'+tkMediaSrc(b.media_id)+'" style="width:100%;height:100%;object-fit:'+(b.fit==='cover'?'cover':'contain')+'"></div>';
      }
      var ts = 'font-size:'+(+b.size||44)+'px;color:'+tkEsc(b.color||'#111827')+';text-align:'+(b.align||'left')+';'
        + (b.bold?'font-weight:800;':'') + (b.bg&&b.bg!=='none'?'background:'+tkEsc(b.bg)+';':'');
      return '<div class="tk-ff-box tk-ff-text" style="'+st+ts+'">'+tkEsc(b.text||'').replace(/\\n/g,'<br>')+'</div>';
    }).join('');
    return '<div class="tk-slide tk-freeform" style="background:'+tkEsc(p.bg||'#ffffff')+'">'+inner+'</div>';
  }
  return '<div class="tk-slide tk-blank">'+tkEsc(k)+'</div>';
}
`;

// スライド共通CSS（1280x720 論理サイズ）
export const SLIDE_CSS = `
.tk-slide{position:relative;width:1280px;height:720px;background:#fff;overflow:hidden;font-family:'BIZ UDPGothic','Meiryo','Hiragino Sans',sans-serif;color:#111827;box-sizing:border-box;}
.tk-slide *{box-sizing:border-box;}
.tk-blank{display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:32px;}
/* 表紙 */
.tk-cover{padding:70px 80px;display:flex;flex-direction:column;gap:34px;background:linear-gradient(160deg,#f8fafc,#eef2ff);}
.tk-cover-top{font-size:40px;color:#1f2937;}
.tk-cover-top b{color:#1d4ed8;}
.tk-cover-title{font-size:104px;font-weight:900;color:#b91c1c;background:#fee2e2;border-radius:20px;padding:24px 48px;text-align:center;letter-spacing:.05em;box-shadow:0 6px 0 #fca5a5;}
.tk-cover-meta{font-size:34px;color:#374151;font-weight:700;}
.tk-cover-headline{font-size:40px;line-height:1.5;font-weight:800;color:#0f172a;background:#fef9c3;border-left:14px solid #eab308;padding:24px 30px;border-radius:8px;}
/* 連絡 */
.tk-notice{padding:64px 78px;}
.tk-notice-head{font-size:52px;font-weight:900;color:#fff;background:#1d4ed8;border-radius:14px;padding:18px 36px;display:inline-block;margin-bottom:44px;}
.tk-notice-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:30px;}
.tk-notice-list li{font-size:44px;line-height:1.45;font-weight:700;padding-left:56px;position:relative;}
.tk-notice-list li:before{content:'●';position:absolute;left:0;top:2px;color:#dc2626;font-size:38px;}
/* 大文字メッセージ */
.tk-message{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 90px;gap:40px;}
.tk-ac-red{background:#fef2f2;}
.tk-ac-blue{background:#eff6ff;}
.tk-ac-yellow{background:#fefce8;}
.tk-message-text{font-size:92px;font-weight:900;line-height:1.3;letter-spacing:.02em;}
.tk-ac-red .tk-message-text{color:#b91c1c;}
.tk-ac-blue .tk-message-text{color:#1d4ed8;}
.tk-ac-yellow .tk-message-text{color:#a16207;}
.tk-message-sub{font-size:44px;font-weight:700;color:#374151;line-height:1.4;}
/* 画像・動画・PDF */
.tk-image,.tk-video,.tk-pdf{width:100%;height:100%;background:#000;display:flex;align-items:center;justify-content:center;}
.tk-image img{width:100%;height:100%;}
.tk-video-el{width:100%;height:100%;background:#000;object-fit:contain;}
.tk-image-cap{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.62);color:#fff;font-size:32px;font-weight:700;padding:16px 28px;text-align:center;}
.tk-pdf iframe{width:100%;height:100%;border:0;background:#fff;}
.tk-accident{width:100%;height:100%;background:#f1f5f9;}
.tk-accident iframe{width:100%;height:100%;border:0;display:block;background:#f4f6f8;}
/* 自由配置 */
.tk-freeform{width:1280px;height:720px;}
.tk-ff-box{position:absolute;overflow:hidden;}
.tk-ff-text{padding:6px 10px;line-height:1.35;white-space:pre-wrap;word-break:break-word;border-radius:6px;}
`;

// ===================================================================
// 一覧ページ
// ===================================================================
export function tenkoListPage(decks: TenkoDeck[], editable: boolean, todayStr: string): string {
  const rows = decks.map(d => {
    const st = d.status === 'ready'
      ? '<span class="tk-badge tk-badge-ok">投影OK</span>'
      : '<span class="tk-badge tk-badge-draft">作成中</span>';
    return `<tr>
      <td class="tk-td-date">${escHtml(fmtDeckDate(d.deck_date))}<span class="tk-td-ymd">${escHtml(d.deck_date)}</span></td>
      <td>${escHtml(d.title || '点呼')} ${st}</td>
      <td class="tk-td-by">${escHtml(d.created_by || '')}</td>
      <td class="tk-td-act">
        <a class="tk-btn tk-btn-play" href="${ADMIN_PATH}/tenko/${d.id}/present">投影</a>
        ${editable ? `<a class="tk-btn tk-btn-edit" href="${ADMIN_PATH}/tenko/${d.id}/edit">編集</a>` : ''}
      </td>
    </tr>`;
  }).join('');

  return `
<style>
  .tk-wrap{max-width:960px;}
  .tk-head{display:flex;align-items:center;gap:14px;margin-bottom:18px;flex-wrap:wrap;}
  .tk-head h1{font-size:20px;font-weight:800;color:var(--color-primary);margin:0;}
  .tk-head .sp{flex:1;}
  .tk-btn{display:inline-block;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;padding:8px 16px;text-decoration:none;}
  .tk-btn-primary{background:#059669;color:#fff;}
  .tk-btn-play{background:#1d4ed8;color:#fff;}
  .tk-btn-edit{background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;}
  .tk-btn-lib{background:#f3f4f6;color:#374151;border:1px solid var(--color-border);}
  .tk-btn:disabled{opacity:.5;cursor:not-allowed;}
  table.tk-list{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--color-border);border-radius:12px;overflow:hidden;}
  table.tk-list th{background:#f9fafb;color:var(--color-text-muted);font-size:11px;font-weight:700;text-align:left;padding:10px 14px;border-bottom:1px solid var(--color-border);}
  table.tk-list td{font-size:14px;padding:12px 14px;border-bottom:1px solid #f3f4f6;vertical-align:middle;}
  .tk-td-date{font-weight:700;white-space:nowrap;}
  .tk-td-ymd{display:block;font-size:11px;color:#9ca3af;font-weight:400;}
  .tk-td-by{color:#6b7280;font-size:12px;white-space:nowrap;}
  .tk-td-act{text-align:right;white-space:nowrap;}
  .tk-td-act .tk-btn{margin-left:6px;}
  .tk-badge{display:inline-block;font-size:10px;font-weight:700;border-radius:999px;padding:2px 8px;margin-left:6px;vertical-align:middle;}
  .tk-badge-ok{background:#dcfce7;color:#166534;}
  .tk-badge-draft{background:#fef9c3;color:#854d0e;}
  .tk-empty{padding:40px;text-align:center;color:#9ca3af;font-size:14px;}
  .tk-newbox{background:#fff;border:1px solid var(--color-border);border-radius:12px;padding:16px 18px;margin-bottom:18px;display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;}
  .tk-newbox label{font-size:12px;color:#374151;display:flex;flex-direction:column;gap:4px;font-weight:600;}
  .tk-newbox input,.tk-newbox select{border:1px solid #d1d5db;border-radius:6px;padding:8px 9px;font-size:14px;font-family:inherit;}
  .tk-note{font-size:11px;color:#9ca3af;margin-top:8px;line-height:1.6;}
</style>
<div class="tk-wrap">
  <div class="tk-head">
    <h1>点呼</h1>
    <div class="sp"></div>
    <a class="tk-btn tk-btn-lib" href="${ADMIN_PATH}/tenko/library">定型スライド管理</a>
  </div>

  ${editable ? `
  <div class="tk-newbox">
    <label>日付
      <input type="date" id="tk-new-date" value="${escHtml(todayStr)}">
    </label>
    <label>下敷きにするデッキ
      <select id="tk-new-copy">
        <option value="latest">直近の点呼を複製（おすすめ）</option>
        <option value="">白紙（表紙のみ）</option>
        ${decks.map(d => `<option value="${d.id}">${escHtml(d.deck_date)} ${escHtml(d.title || '点呼')}</option>`).join('')}
      </select>
    </label>
    <button class="tk-btn tk-btn-primary" id="tk-new-btn" type="button">この日の点呼を作る</button>
    <div class="tk-note">複製すると前回のスライドがそのまま入った状態で始まります。表紙の日付・天候・気温は自動で選んだ日付のものに更新されます。</div>
  </div>` : ''}

  <table class="tk-list">
    <thead><tr><th>日付</th><th>タイトル</th><th>作成</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4"><div class="tk-empty">まだ点呼がありません。</div></td></tr>`}</tbody>
  </table>
</div>
<script>
(function(){
  var btn = document.getElementById('tk-new-btn');
  if(!btn) return;
  btn.addEventListener('click', function(){
    var date = document.getElementById('tk-new-date').value;
    var copy = document.getElementById('tk-new-copy').value;
    if(!date){ alert('日付を選んでください'); return; }
    btn.disabled = true; btn.textContent = '作成中…';
    fetch(${safeJson(API)} + '/decks', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ date: date, copyFrom: copy })
    }).then(function(r){ return r.json(); }).then(function(j){
      if(j && j.id){ location.href = ${safeJson(ADMIN_PATH)} + '/tenko/' + j.id + '/edit'; }
      else { alert((j && j.error) || '作成に失敗しました'); btn.disabled=false; btn.textContent='この日の点呼を作る'; }
    }).catch(function(){ alert('通信エラー'); btn.disabled=false; btn.textContent='この日の点呼を作る'; });
  });
})();
</script>`;
}

// ===================================================================
// 編集ページ
// ===================================================================
export function tenkoEditPage(
  deck: TenkoDeck,
  slides: TenkoSlide[],
  libraryMedia: TenkoMedia[],
  ideas: TenkoIdea[],
): string {
  const slideData = slides.map(s => {
    let payload: unknown = {};
    try { payload = JSON.parse(s.payload || '{}'); } catch { payload = {}; }
    return { id: s.id, kind: s.kind, payload };
  });

  return `
<style>
  ${SLIDE_CSS}
  .tk-edit-wrap{display:flex;gap:18px;align-items:flex-start;max-width:1180px;}
  .tk-main{flex:1;min-width:0;}
  .tk-side{width:300px;flex-shrink:0;}
  @media(max-width:1000px){.tk-edit-wrap{flex-direction:column;}.tk-side{width:100%;}}
  .tk-card{background:#fff;border:1px solid var(--color-border);border-radius:12px;padding:16px 18px;margin-bottom:16px;}
  .tk-card h2{font-size:13px;font-weight:800;color:var(--color-primary);margin:0 0 12px;}
  .tk-topbar{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap;}
  .tk-topbar h1{font-size:18px;font-weight:800;margin:0;color:var(--color-text);}
  .tk-topbar .sp{flex:1;}
  .tk-btn{display:inline-block;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;padding:8px 15px;text-decoration:none;}
  .tk-btn-play{background:#1d4ed8;color:#fff;}
  .tk-btn-ghost{background:#f3f4f6;color:#374151;border:1px solid var(--color-border);}
  .tk-btn-sm{padding:4px 10px;font-size:11px;border-radius:6px;}
  .tk-btn-danger{background:#fee2e2;color:#991b1b;}
  .tk-meta-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;}
  .tk-meta-grid label{font-size:11px;color:#374151;font-weight:600;display:flex;flex-direction:column;gap:4px;}
  .tk-meta-grid input,.tk-meta-grid select,.tk-form input,.tk-form select,.tk-form textarea{border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:13px;font-family:inherit;width:100%;}
  .tk-form textarea{min-height:90px;resize:vertical;}
  .tk-inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap;}
  .tk-slide-row{border:1px solid var(--color-border);border-radius:10px;margin-bottom:10px;background:#fff;}
  .tk-slide-row.dragover{border-color:#1d4ed8;box-shadow:0 0 0 2px #bfdbfe;}
  .tk-slide-hd{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:default;}
  .tk-drag{cursor:grab;color:#9ca3af;font-size:16px;user-select:none;}
  .tk-kind{font-size:10px;font-weight:800;color:#3730a3;background:#e0e7ff;border-radius:5px;padding:3px 7px;white-space:nowrap;}
  .tk-sum{flex:1;font-size:13px;color:#374151;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .tk-slide-body{padding:0 12px 14px;display:none;}
  .tk-slide-body.open{display:block;}
  .tk-addbar{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;}
  .tk-addbar button{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;border-radius:7px;font-size:11px;font-weight:700;padding:6px 10px;cursor:pointer;}
  .tk-field{margin-bottom:10px;}
  .tk-field label{font-size:11px;font-weight:700;color:#374151;display:block;margin-bottom:3px;}
  .tk-hint{font-size:10.5px;color:#9ca3af;margin-top:3px;line-height:1.5;}
  .tk-idea{border:1px solid var(--color-border);border-radius:9px;padding:10px;margin-bottom:9px;font-size:12px;}
  .tk-idea .b{white-space:pre-wrap;line-height:1.5;color:#374151;margin-bottom:8px;}
  .tk-idea .meta{font-size:10px;color:#9ca3af;margin-bottom:8px;}
  .tk-idea-acts{display:flex;gap:5px;flex-wrap:wrap;}
  .tk-idea-acts button{font-size:10.5px;font-weight:700;border-radius:6px;padding:5px 8px;cursor:pointer;border:1px solid var(--color-border);background:#fff;}
  .tk-idea-acts .use{background:#ecfdf5;color:#065f46;border-color:#a7f3d0;}
  .tk-idea-acts .dis{background:#f9fafb;color:#6b7280;}
  .tk-status-pill{font-size:11px;font-weight:700;border-radius:999px;padding:3px 10px;cursor:pointer;border:1px solid var(--color-border);}
  .tk-status-pill.draft{background:#fef9c3;color:#854d0e;}
  .tk-status-pill.ready{background:#dcfce7;color:#166534;}
  /* プレビュー / 自由配置モーダル */
  .tk-modal{position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:80;display:none;align-items:center;justify-content:center;padding:20px;}
  .tk-modal.open{display:flex;}
  .tk-modal-box{background:#fff;border-radius:12px;max-width:96vw;max-height:94vh;overflow:auto;padding:16px;}
  .tk-preview-stage{width:1280px;height:720px;transform-origin:top left;}
  .tk-msg{font-size:12px;margin-top:6px;min-height:16px;}
  .tk-msg.err{color:#b91c1c;}
  .tk-msg.ok{color:#166534;}
  .tk-up{font-size:12px;}
  /* 自由配置エディタ */
  #tk-ff-canvas{position:relative;width:960px;height:540px;background:#fff;border:1px solid #cbd5e1;overflow:hidden;}
  .tk-ff-e{position:absolute;border:1px dashed #94a3b8;overflow:hidden;}
  .tk-ff-e.sel{border:2px solid #1d4ed8;}
  .tk-ff-e .h{position:absolute;right:-6px;bottom:-6px;width:14px;height:14px;background:#1d4ed8;border-radius:3px;cursor:nwse-resize;}
  .tk-ff-e .txt{width:100%;height:100%;padding:4px 6px;white-space:pre-wrap;word-break:break-word;overflow:hidden;}
  .tk-ff-tools{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;}
  .tk-ff-props{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;margin-top:10px;}
  .tk-ff-props label{font-size:10.5px;font-weight:700;color:#374151;display:flex;flex-direction:column;gap:3px;}
  .tk-ff-props input,.tk-ff-props select,.tk-ff-props textarea{border:1px solid #d1d5db;border-radius:5px;padding:5px 6px;font-size:12px;font-family:inherit;}
</style>

<div class="tk-topbar">
  <a class="tk-btn tk-btn-ghost tk-btn-sm" href="${ADMIN_PATH}/tenko">← 一覧</a>
  <h1 id="tk-title-h">${escHtml(fmtDeckDate(deck.deck_date))} 点呼</h1>
  <span id="tk-status" class="tk-status-pill ${deck.status === 'ready' ? 'ready' : 'draft'}">${deck.status === 'ready' ? '投影OK' : '作成中'}</span>
  <div class="sp"></div>
  <a class="tk-btn tk-btn-ghost" href="${ADMIN_PATH}/tenko/${deck.id}/print" target="_blank" rel="noopener">印刷/PDF</a>
  <a class="tk-btn tk-btn-play" href="${ADMIN_PATH}/tenko/${deck.id}/present">プレゼン投影</a>
</div>

<div class="tk-edit-wrap">
  <div class="tk-main">
    <div class="tk-card">
      <h2>表紙（この点呼の基本情報）</h2>
      <div class="tk-meta-grid">
        <label>日付<input type="date" id="m-date" value="${escHtml(deck.deck_date)}"></label>
        <label>タイトル<input type="text" id="m-title" value="${escHtml(deck.title)}" placeholder="毎日安全宣言日 など"></label>
        <label>確認者<input type="text" id="m-confirmer" value="${escHtml(deck.confirmer)}"></label>
        <label>天候<input type="text" id="m-weather" value="${escHtml(deck.weather)}"></label>
        <label>最高気温(℃)<input type="text" id="m-tmax" value="${escHtml(deck.temp_max)}"></label>
        <label>最低気温(℃)<input type="text" id="m-tmin" value="${escHtml(deck.temp_min)}"></label>
      </div>
      <div class="tk-field" style="margin-top:10px;">
        <label>一言（今日の重点事項）</label>
        <textarea id="m-headline" placeholder="夏休みが終わり学校が始まります。生活道路等の走行時は、急な飛び出しに要注意！">${escHtml(deck.headline)}</textarea>
      </div>
      <div class="tk-inline" style="margin-top:8px;">
        <button class="tk-btn tk-btn-ghost tk-btn-sm" type="button" id="m-weather-btn">天候・気温を自動取得</button>
        <button class="tk-btn tk-btn-ghost tk-btn-sm" type="button" id="m-save-btn">表紙を保存</button>
        <span id="m-msg" class="tk-msg"></span>
      </div>
    </div>

    <div class="tk-card">
      <h2>スライド</h2>
      <div id="tk-slides"></div>
      <div class="tk-addbar" id="tk-addbar"></div>
    </div>
  </div>

  <div class="tk-side">
    <div class="tk-card">
      <h2>ネタ箱</h2>
      <div class="tk-field">
        <textarea id="idea-body" placeholder="今日の点呼に入れてほしいネタ（例：スライドドアの挟み込みに注意）"></textarea>
        <button class="tk-btn tk-btn-ghost tk-btn-sm" type="button" id="idea-add-btn" style="margin-top:6px;">ネタを追加</button>
        <span id="idea-msg" class="tk-msg"></span>
      </div>
      <div id="tk-ideas"></div>
    </div>
  </div>
</div>

<div class="tk-modal" id="tk-preview-modal">
  <div class="tk-modal-box">
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
      <button class="tk-btn tk-btn-ghost tk-btn-sm" type="button" onclick="tkClosePreview()">閉じる</button>
    </div>
    <div style="width:960px;height:540px;overflow:hidden;">
      <div class="tk-preview-stage" id="tk-preview-stage"></div>
    </div>
  </div>
</div>

<div class="tk-modal" id="tk-ff-modal">
  <div class="tk-modal-box" style="width:1000px;">
    <div class="tk-ff-tools">
      <button class="tk-btn tk-btn-ghost tk-btn-sm" type="button" id="ff-add-text">＋テキスト</button>
      <button class="tk-btn tk-btn-ghost tk-btn-sm" type="button" id="ff-add-image">＋画像</button>
      <label class="tk-up">背景<input type="color" id="ff-bg" value="#ffffff"></label>
      <button class="tk-btn tk-btn-danger tk-btn-sm" type="button" id="ff-del">選択を削除</button>
      <div style="flex:1"></div>
      <button class="tk-btn tk-btn-ghost tk-btn-sm" type="button" onclick="tkCloseFF()">キャンセル</button>
      <button class="tk-btn tk-btn-play tk-btn-sm" type="button" id="ff-save">保存</button>
    </div>
    <div id="tk-ff-canvas"></div>
    <div class="tk-ff-props" id="tk-ff-props"></div>
    <div class="tk-hint">座標・サイズはドラッグで調整できます。文字サイズは投影時の実寸(px)です。</div>
  </div>
</div>

<script>${SLIDE_RENDERER_JS}</script>
<script>
(function(){
  var API = ${safeJson(API)};
  var ADMIN = ${safeJson(ADMIN_PATH)};
  var DECK = ${safeJson({
    id: deck.id, deck_date: deck.deck_date, title: deck.title, confirmer: deck.confirmer,
    weather: deck.weather, temp_max: deck.temp_max, temp_min: deck.temp_min,
    headline: deck.headline, status: deck.status,
  })};
  window.TK_DECK = DECK;
  var SLIDES = ${safeJson(slideData)};
  var LIB = ${safeJson(libraryMedia.map(m => ({ id: m.id, label: m.label || m.filename, kind: m.kind })))};
  var IDEAS = ${safeJson(ideas.map(i => ({ id: i.id, body: i.body, media_id: i.media_id, submitted_by: i.submitted_by, created_at: i.created_at })))};
  var KINDS = ${safeJson(SLIDE_KINDS)};

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
  function msg(el, text, cls){ el.textContent=text||''; el.className='tk-msg'+(cls?' '+cls:''); if(text){ setTimeout(function(){ if(el.textContent===text){el.textContent='';el.className='tk-msg';} },4000);} }

  // ---- 表紙 ----
  function collectMeta(){
    return {
      deck_date: document.getElementById('m-date').value,
      title: document.getElementById('m-title').value,
      confirmer: document.getElementById('m-confirmer').value,
      weather: document.getElementById('m-weather').value,
      temp_max: document.getElementById('m-tmax').value,
      temp_min: document.getElementById('m-tmin').value,
      headline: document.getElementById('m-headline').value,
    };
  }
  document.getElementById('m-save-btn').addEventListener('click', function(){
    var body = collectMeta();
    fetch(API+'/decks/'+DECK.id, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json();}).then(function(j){
        if(j&&j.ok){ Object.assign(DECK, body); window.TK_DECK=DECK; msg(document.getElementById('m-msg'),'保存しました','ok');
          document.getElementById('tk-title-h').textContent = (j.dateLabel||'') + ' 点呼'; renderSlides(); }
        else msg(document.getElementById('m-msg'), (j&&j.error)||'保存に失敗しました','err');
      }).catch(function(){ msg(document.getElementById('m-msg'),'通信エラー','err'); });
  });
  document.getElementById('m-weather-btn').addEventListener('click', function(){
    var btn=this; btn.disabled=true; var old=btn.textContent; btn.textContent='取得中…';
    fetch(API+'/decks/'+DECK.id+'/weather?date='+encodeURIComponent(document.getElementById('m-date').value))
      .then(function(r){return r.json();}).then(function(j){
        btn.disabled=false; btn.textContent=old;
        if(j&&j.ok){
          if(j.weather) document.getElementById('m-weather').value=j.weather;
          if(j.tempMax) document.getElementById('m-tmax').value=j.tempMax;
          if(j.tempMin) document.getElementById('m-tmin').value=j.tempMin;
          msg(document.getElementById('m-msg'), j.weather||j.tempMax ? '気象庁予報を反映しました（内容を確認してください）' : '予報が取得できませんでした。手入力してください','ok');
        } else msg(document.getElementById('m-msg'),(j&&j.error)||'取得に失敗しました','err');
      }).catch(function(){ btn.disabled=false; btn.textContent=old; msg(document.getElementById('m-msg'),'通信エラー','err'); });
  });

  // ---- ステータス切替 ----
  document.getElementById('tk-status').addEventListener('click', function(){
    var cur = DECK.status==='ready'?'draft':'ready';
    fetch(API+'/decks/'+DECK.id, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:cur})})
      .then(function(r){return r.json();}).then(function(j){
        if(j&&j.ok){ DECK.status=cur; var el=document.getElementById('tk-status');
          el.className='tk-status-pill '+cur; el.textContent = cur==='ready'?'投影OK':'作成中'; }
      });
  });

  // ---- スライド追加バー ----
  var addbar = document.getElementById('tk-addbar');
  KINDS.forEach(function(k){
    if(k.kind==='cover') return;
    var b=document.createElement('button'); b.type='button'; b.textContent='＋ '+k.label; b.title=k.desc;
    b.addEventListener('click', function(){ addSlide(k.kind); });
    addbar.appendChild(b);
  });
  function defaultPayload(kind){
    if(kind==='notice') return {heading:'営業所からの業務連絡', bullets:['','']};
    if(kind==='message') return {text:'', sub:'', accent:'red'};
    if(kind==='image') return {media_id:0, caption:'', fit:'contain'};
    if(kind==='video') return {media_id:0, caption:''};
    if(kind==='pdf') return {media_id:0};
    if(kind==='accident') return {};
    if(kind==='library') return {media_id: (LIB[0]&&LIB[0].id)||0};
    if(kind==='freeform') return {bg:'#ffffff', boxes:[]};
    return {};
  }
  function addSlide(kind){
    fetch(API+'/decks/'+DECK.id+'/slides', {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({kind:kind, payload:defaultPayload(kind)})})
      .then(function(r){return r.json();}).then(function(j){
        if(j&&j.id){ SLIDES.push({id:j.id, kind:kind, payload:defaultPayload(kind)}); renderSlides(); openBody(j.id); }
        else alert((j&&j.error)||'追加に失敗しました');
      });
  }

  // ---- スライド一覧描画 ----
  var wrap = document.getElementById('tk-slides');
  function kindLabel(k){ var f=KINDS.filter(function(x){return x.kind===k;})[0]; return f?f.label:k; }
  function summary(s){
    var p=s.payload||{};
    if(s.kind==='cover') return '日付・確認者・天候・気温・一言';
    if(s.kind==='notice') return (p.heading||'')+'：'+((p.bullets||[]).filter(Boolean).join(' / ')||'（未入力）');
    if(s.kind==='message') return (p.text||'（未入力）').replace(/\\n/g,' ');
    if(s.kind==='image') return p.media_id?('画像 #'+p.media_id+(p.caption?'（'+p.caption+'）':'')):'画像 未選択';
    if(s.kind==='video') return p.media_id?('動画 #'+p.media_id):'動画 未選択';
    if(s.kind==='pdf') return p.media_id?('PDF #'+p.media_id):'PDF 未選択';
    if(s.kind==='accident') return 'ホシコン事故モニターを表示';
    if(s.kind==='library'){ var l=LIB.filter(function(x){return x.id===p.media_id;})[0]; return l?l.label:'定型スライド 未選択'; }
    if(s.kind==='freeform') return '自由配置（'+((p.boxes||[]).length)+'要素）';
    return s.kind;
  }
  function renderSlides(){
    wrap.innerHTML='';
    SLIDES.forEach(function(s, i){
      var row=document.createElement('div'); row.className='tk-slide-row'; row.dataset.id=s.id; row.draggable=false;
      var canDrag = s.kind!=='cover';
      row.innerHTML =
        '<div class="tk-slide-hd">'
        + '<span class="tk-drag" draggable="'+(canDrag?'true':'false')+'" title="ドラッグで並べ替え">≡</span>'
        + '<span class="tk-kind">'+esc(kindLabel(s.kind))+'</span>'
        + '<span class="tk-sum">'+esc(summary(s))+'</span>'
        + '<button class="tk-btn tk-btn-ghost tk-btn-sm" data-act="preview">プレビュー</button>'
        + '<button class="tk-btn tk-btn-ghost tk-btn-sm" data-act="toggle">編集</button>'
        + (s.kind==='cover' ? '' : '<button class="tk-btn tk-btn-danger tk-btn-sm" data-act="del">削除</button>')
        + '</div>'
        + '<div class="tk-slide-body" id="body-'+s.id+'"></div>';
      wrap.appendChild(row);

      row.querySelector('[data-act="preview"]').addEventListener('click', function(){ tkPreview(s); });
      row.querySelector('[data-act="toggle"]').addEventListener('click', function(){ toggleBody(s); });
      var del = row.querySelector('[data-act="del"]');
      if(del) del.addEventListener('click', function(){ if(confirm('このスライドを削除しますか？')) deleteSlide(s.id); });

      if(canDrag){
        var handle = row.querySelector('.tk-drag');
        handle.addEventListener('dragstart', function(e){ e.dataTransfer.setData('text/plain', String(s.id)); e.dataTransfer.effectAllowed='move'; row.classList.add('dragging'); });
        handle.addEventListener('dragend', function(){ row.classList.remove('dragging'); });
        row.addEventListener('dragover', function(e){ e.preventDefault(); row.classList.add('dragover'); });
        row.addEventListener('dragleave', function(){ row.classList.remove('dragover'); });
        row.addEventListener('drop', function(e){
          e.preventDefault(); row.classList.remove('dragover');
          var from = parseInt(e.dataTransfer.getData('text/plain'),10);
          if(!from || from===s.id) return;
          reorder(from, s.id);
        });
      }
    });
  }
  function toggleBody(s){
    var b=document.getElementById('body-'+s.id);
    if(b.classList.contains('open')){ b.classList.remove('open'); b.innerHTML=''; }
    else { b.classList.add('open'); b.innerHTML=''; buildForm(s, b); }
  }
  function openBody(id){ var s=SLIDES.filter(function(x){return x.id===id;})[0]; if(s){ var b=document.getElementById('body-'+id); b.classList.add('open'); b.innerHTML=''; buildForm(s,b);} }

  function field(label, inner, hint){
    return '<div class="tk-field"><label>'+esc(label)+'</label>'+inner+(hint?'<div class="tk-hint">'+esc(hint)+'</div>':'')+'</div>';
  }
  function buildForm(s, box){
    var p = s.payload || {};
    var html = '<div class="tk-form">';
    if(s.kind==='cover'){
      html += '<div class="tk-hint">表紙の内容は上の「表紙」欄で編集します。</div>';
    } else if(s.kind==='notice'){
      html += field('見出し', '<input type="text" id="f-heading" value="'+esc(p.heading||'')+'">');
      html += field('箇条書き（1行1項目）', '<textarea id="f-bullets">'+esc((p.bullets||[]).join('\\n'))+'</textarea>');
    } else if(s.kind==='message'){
      html += field('大きい文字', '<textarea id="f-text">'+esc(p.text||'')+'</textarea>');
      html += field('補足（小さい文字）', '<textarea id="f-sub">'+esc(p.sub||'')+'</textarea>');
      html += field('色', '<select id="f-accent">'
        +'<option value="red"'+(p.accent==='red'?' selected':'')+'>赤</option>'
        +'<option value="blue"'+(p.accent==='blue'?' selected':'')+'>青</option>'
        +'<option value="yellow"'+(p.accent==='yellow'?' selected':'')+'>黄</option></select>');
    } else if(s.kind==='image' || s.kind==='video' || s.kind==='pdf'){
      var accept = s.kind==='image'?'image/*':(s.kind==='video'?'video/*':'application/pdf');
      html += field((s.kind==='image'?'画像':s.kind==='video'?'動画':'PDF')+'ファイル',
        '<div class="tk-up">現在: <span id="f-medianame">'+(p.media_id?('#'+p.media_id):'未選択')+'</span></div>'
        +'<input type="file" id="f-file" accept="'+accept+'">'
        +'<div id="f-upmsg" class="tk-msg"></div>', s.kind==='video'?'大きい動画はアップロードに時間がかかります。':'');
      if(s.kind!=='pdf') html += field('キャプション（任意）', '<input type="text" id="f-caption" value="'+esc(p.caption||'')+'">');
      if(s.kind==='image') html += field('表示方法', '<select id="f-fit"><option value="contain"'+(p.fit!=='cover'?' selected':'')+'>全体を表示（余白あり）</option><option value="cover"'+(p.fit==='cover'?' selected':'')+'>画面いっぱい（はみ出し切り取り）</option></select>');
    } else if(s.kind==='accident'){
      html += '<div class="tk-hint">「ホシコン 事故モニター」の現在の画面をそのまま表示します。編集項目はありません。</div>';
    } else if(s.kind==='library'){
      html += field('定型スライドを選ぶ',
        '<select id="f-lib">'+ (LIB.length? LIB.map(function(l){return '<option value="'+l.id+'"'+(l.id===p.media_id?' selected':'')+'>'+esc(l.label)+'</option>';}).join('') : '<option value="0">（未登録）</option>') +'</select>',
        LIB.length? '' : '「定型スライド管理」で唱和などの画像を登録してください。');
    } else if(s.kind==='freeform'){
      html += '<button class="tk-btn tk-btn-ghost tk-btn-sm" type="button" id="f-ff-open">自由配置エディタを開く</button>';
    }
    html += '</div>';
    if(s.kind!=='cover' && s.kind!=='freeform'){
      html += '<div class="tk-inline"><button class="tk-btn tk-btn-play tk-btn-sm" type="button" id="f-save">このスライドを保存</button><span id="f-msg" class="tk-msg"></span></div>';
    }
    box.innerHTML = html;

    var fileInput = box.querySelector('#f-file');
    if(fileInput){
      fileInput.addEventListener('change', function(){
        var f=fileInput.files[0]; if(!f) return;
        var um=box.querySelector('#f-upmsg'); msg(um,'アップロード中…','');
        var fd=new FormData(); fd.append('file', f); fd.append('kind', s.kind);
        fetch(API+'/media',{method:'POST',body:fd}).then(function(r){return r.json();}).then(function(j){
          if(j&&j.id){ p.media_id=j.id; box.querySelector('#f-medianame').textContent='#'+j.id+'（'+esc(f.name)+'）'; msg(um,'アップロードしました。「保存」を押してください','ok'); }
          else msg(um,(j&&j.error)||'アップロード失敗','err');
        }).catch(function(){ msg(um,'通信エラー','err'); });
      });
    }
    var ffOpen = box.querySelector('#f-ff-open');
    if(ffOpen) ffOpen.addEventListener('click', function(){ tkOpenFF(s); });

    var saveBtn = box.querySelector('#f-save');
    if(saveBtn) saveBtn.addEventListener('click', function(){
      var np = {};
      if(s.kind==='notice'){ np.heading=box.querySelector('#f-heading').value; np.bullets=box.querySelector('#f-bullets').value.split('\\n'); }
      else if(s.kind==='message'){ np.text=box.querySelector('#f-text').value; np.sub=box.querySelector('#f-sub').value; np.accent=box.querySelector('#f-accent').value; }
      else if(s.kind==='image'){ np.media_id=p.media_id||0; np.caption=box.querySelector('#f-caption').value; np.fit=box.querySelector('#f-fit').value; }
      else if(s.kind==='video'){ np.media_id=p.media_id||0; np.caption=box.querySelector('#f-caption').value; }
      else if(s.kind==='pdf'){ np.media_id=p.media_id||0; }
      else if(s.kind==='accident'){ np={}; }
      else if(s.kind==='library'){ np.media_id=parseInt(box.querySelector('#f-lib').value,10)||0; }
      savePayload(s, np, box.querySelector('#f-msg'));
    });
  }
  function savePayload(s, np, msgEl){
    fetch(API+'/slides/'+s.id, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload:np})})
      .then(function(r){return r.json();}).then(function(j){
        if(j&&j.ok){ s.payload=np; if(msgEl) msg(msgEl,'保存しました','ok'); renderSlidesKeepOpen(s.id); }
        else if(msgEl) msg(msgEl,(j&&j.error)||'保存失敗','err');
      }).catch(function(){ if(msgEl) msg(msgEl,'通信エラー','err'); });
  }
  function renderSlidesKeepOpen(openId){
    renderSlides();
    if(openId){ var s=SLIDES.filter(function(x){return x.id===openId;})[0]; if(s) openBody(openId); }
  }
  function deleteSlide(id){
    fetch(API+'/slides/'+id, {method:'DELETE'}).then(function(r){return r.json();}).then(function(j){
      if(j&&j.ok){ SLIDES=SLIDES.filter(function(x){return x.id!==id;}); renderSlides(); }
    });
  }
  function reorder(fromId, beforeId){
    var ids = SLIDES.map(function(s){return s.id;});
    var fi = ids.indexOf(fromId), ti = ids.indexOf(beforeId);
    if(fi<0||ti<0) return;
    ids.splice(fi,1);
    ids.splice(ids.indexOf(beforeId) + (fi<ti?0:0), 0, fromId);
    // reorder SLIDES array to match ids
    var map={}; SLIDES.forEach(function(s){map[s.id]=s;});
    SLIDES = ids.map(function(i){return map[i];});
    renderSlides();
    fetch(API+'/decks/'+DECK.id+'/slides/reorder', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:ids})});
  }

  // ---- プレビュー ----
  var pvModal=document.getElementById('tk-preview-modal'), pvStage=document.getElementById('tk-preview-stage');
  function tkPreview(s){
    window.TK_DECK = DECK;
    pvStage.innerHTML = renderSlideHTML(s, {present:false});
    var scale = 960/1280; pvStage.style.transform='scale('+scale+')';
    pvModal.classList.add('open');
  }
  window.tkClosePreview=function(){ pvModal.classList.remove('open'); pvStage.innerHTML=''; };
  pvModal.addEventListener('click', function(e){ if(e.target===pvModal) tkClosePreview(); });

  // ---- 自由配置エディタ ----
  var ffModal=document.getElementById('tk-ff-modal'), ffCanvas=document.getElementById('tk-ff-canvas'), ffProps=document.getElementById('tk-ff-props');
  var ffState=null; // {slide, boxes:[], sel:index}
  var FFW=960, FFH=540;
  function tkOpenFF(s){
    var p=s.payload||{};
    ffState={ slide:s, boxes: JSON.parse(JSON.stringify(p.boxes||[])), sel:-1, bg:p.bg||'#ffffff' };
    document.getElementById('ff-bg').value = /^#/.test(ffState.bg)?ffState.bg:'#ffffff';
    ffRender(); ffModal.classList.add('open');
  }
  window.tkCloseFF=function(){ ffModal.classList.remove('open'); ffState=null; };
  document.getElementById('ff-bg').addEventListener('input', function(){ if(ffState){ ffState.bg=this.value; ffCanvas.style.background=this.value; } });
  document.getElementById('ff-add-text').addEventListener('click', function(){ if(!ffState) return; ffState.boxes.push({type:'text',x:10,y:10,w:50,h:16,text:'テキスト',size:44,color:'#111827',align:'left',bold:false,bg:'none'}); ffState.sel=ffState.boxes.length-1; ffRender(); });
  document.getElementById('ff-add-image').addEventListener('click', function(){
    if(!ffState) return;
    var inp=document.createElement('input'); inp.type='file'; inp.accept='image/*';
    inp.addEventListener('change', function(){
      var f=inp.files[0]; if(!f) return;
      var fd=new FormData(); fd.append('file',f); fd.append('kind','image');
      fetch(API+'/media',{method:'POST',body:fd}).then(function(r){return r.json();}).then(function(j){
        if(j&&j.id){ ffState.boxes.push({type:'image',x:20,y:20,w:40,h:40,media_id:j.id,fit:'contain'}); ffState.sel=ffState.boxes.length-1; ffRender(); }
        else alert((j&&j.error)||'アップロード失敗');
      });
    });
    inp.click();
  });
  document.getElementById('ff-del').addEventListener('click', function(){ if(ffState&&ffState.sel>=0){ ffState.boxes.splice(ffState.sel,1); ffState.sel=-1; ffRender(); } });
  document.getElementById('ff-save').addEventListener('click', function(){
    if(!ffState) return;
    var s=ffState.slide; var np={bg:ffState.bg, boxes:ffState.boxes};
    fetch(API+'/slides/'+s.id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload:np})})
      .then(function(r){return r.json();}).then(function(j){
        if(j&&j.ok){ s.payload=np; tkCloseFF(); renderSlidesKeepOpen(s.id); }
        else alert((j&&j.error)||'保存失敗');
      });
  });
  function ffRender(){
    ffCanvas.style.background=ffState.bg;
    ffCanvas.innerHTML='';
    ffState.boxes.forEach(function(b, idx){
      var e=document.createElement('div'); e.className='tk-ff-e'+(idx===ffState.sel?' sel':'');
      e.style.left=(b.x/100*FFW)+'px'; e.style.top=(b.y/100*FFH)+'px';
      e.style.width=(b.w/100*FFW)+'px'; e.style.height=(b.h/100*FFH)+'px';
      if(b.type==='image'){ e.innerHTML='<img src="'+${safeJson(MEDIA_URL)}+'/'+b.media_id+'/file" style="width:100%;height:100%;object-fit:'+(b.fit==='cover'?'cover':'contain')+'">'; }
      else {
        var d=document.createElement('div'); d.className='txt';
        d.style.fontSize=(b.size*(FFW/1280))+'px'; d.style.color=b.color||'#111827'; d.style.textAlign=b.align||'left';
        d.style.fontWeight=b.bold?'800':'400'; if(b.bg&&b.bg!=='none') d.style.background=b.bg;
        d.textContent=b.text||''; e.appendChild(d);
      }
      var h=document.createElement('div'); h.className='h'; e.appendChild(h);
      ffCanvas.appendChild(e);
      e.addEventListener('mousedown', function(ev){
        if(ev.target===h) return;
        ffState.sel=idx; ffRender();
        var sx=ev.clientX, sy=ev.clientY, ox=b.x, oy=b.y;
        function mv(m){ b.x=Math.max(0,Math.min(100-b.w, ox+(m.clientX-sx)/FFW*100)); b.y=Math.max(0,Math.min(100-b.h, oy+(m.clientY-sy)/FFH*100)); ffRenderLite(); }
        function up(){ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); ffRender(); }
        document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up); ev.preventDefault();
      });
      h.addEventListener('mousedown', function(ev){
        ffState.sel=idx;
        var sx=ev.clientX, sy=ev.clientY, ow=b.w, oh=b.h;
        function mv(m){ b.w=Math.max(4,Math.min(100-b.x, ow+(m.clientX-sx)/FFW*100)); b.h=Math.max(4,Math.min(100-b.y, oh+(m.clientY-sy)/FFH*100)); ffRenderLite(); }
        function up(){ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); ffRender(); }
        document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up); ev.preventDefault(); ev.stopPropagation();
      });
    });
    ffProps.innerHTML='';
    if(ffState.sel<0){ ffProps.innerHTML='<div class="tk-hint">要素を選ぶとここで編集できます。</div>'; return; }
    var b=ffState.boxes[ffState.sel];
    if(b.type==='text'){
      ffProps.innerHTML =
        '<label style="grid-column:1/-1;">文字<textarea id="pp-text">'+esc(b.text||'')+'</textarea></label>'
        +'<label>サイズ(px)<input type="number" id="pp-size" value="'+(b.size||44)+'"></label>'
        +'<label>色<input type="color" id="pp-color" value="'+(/^#/.test(b.color)?b.color:'#111827')+'"></label>'
        +'<label>寄せ<select id="pp-align"><option value="left"'+(b.align==='left'?' selected':'')+'>左</option><option value="center"'+(b.align==='center'?' selected':'')+'>中央</option><option value="right"'+(b.align==='right'?' selected':'')+'>右</option></select></label>'
        +'<label>太字<select id="pp-bold"><option value="0"'+(!b.bold?' selected':'')+'>なし</option><option value="1"'+(b.bold?' selected':'')+'>太字</option></select></label>'
        +'<label>背景<select id="pp-bg"><option value="none"'+((!b.bg||b.bg==='none')?' selected':'')+'>なし</option><option value="#ffffff"'+(b.bg==='#ffffff'?' selected':'')+'>白</option><option value="#fef08a"'+(b.bg==='#fef08a'?' selected':'')+'>黄</option><option value="#fecaca"'+(b.bg==='#fecaca'?' selected':'')+'>赤</option></select></label>';
      ffProps.querySelector('#pp-text').addEventListener('input', function(){ b.text=this.value; ffRenderLite(); });
      ffProps.querySelector('#pp-size').addEventListener('input', function(){ b.size=parseInt(this.value,10)||44; ffRenderLite(); });
      ffProps.querySelector('#pp-color').addEventListener('input', function(){ b.color=this.value; ffRenderLite(); });
      ffProps.querySelector('#pp-align').addEventListener('change', function(){ b.align=this.value; ffRenderLite(); });
      ffProps.querySelector('#pp-bold').addEventListener('change', function(){ b.bold=this.value==='1'; ffRenderLite(); });
      ffProps.querySelector('#pp-bg').addEventListener('change', function(){ b.bg=this.value; ffRenderLite(); });
    } else {
      ffProps.innerHTML = '<label>表示<select id="pp-fit"><option value="contain"'+(b.fit!=='cover'?' selected':'')+'>全体</option><option value="cover"'+(b.fit==='cover'?' selected':'')+'>いっぱい</option></select></label>';
      ffProps.querySelector('#pp-fit').addEventListener('change', function(){ b.fit=this.value; ffRenderLite(); });
    }
  }
  function ffRenderLite(){
    var els=ffCanvas.children;
    ffState.boxes.forEach(function(b,idx){
      var e=els[idx]; if(!e) return;
      e.style.left=(b.x/100*FFW)+'px'; e.style.top=(b.y/100*FFH)+'px';
      e.style.width=(b.w/100*FFW)+'px'; e.style.height=(b.h/100*FFH)+'px';
      var t=e.querySelector('.txt');
      if(t){ t.style.fontSize=(b.size*(FFW/1280))+'px'; t.style.color=b.color||'#111827'; t.style.textAlign=b.align||'left'; t.style.fontWeight=b.bold?'800':'400'; t.style.background=(b.bg&&b.bg!=='none')?b.bg:'transparent'; t.textContent=b.text||''; }
      var im=e.querySelector('img'); if(im) im.style.objectFit=b.fit==='cover'?'cover':'contain';
    });
  }
  ffModal.addEventListener('click', function(e){ if(e.target===ffModal) tkCloseFF(); });

  // ---- ネタ箱 ----
  var ideasWrap=document.getElementById('tk-ideas');
  function renderIdeas(){
    ideasWrap.innerHTML='';
    if(!IDEAS.length){ ideasWrap.innerHTML='<div class="tk-hint">未使用のネタはありません。</div>'; return; }
    IDEAS.forEach(function(it){
      var d=document.createElement('div'); d.className='tk-idea';
      d.innerHTML='<div class="b">'+esc(it.body)+'</div>'
        +'<div class="meta">'+esc(it.submitted_by||'')+' '+esc((it.created_at||'').slice(0,16))+'</div>'
        +'<div class="tk-idea-acts">'
        +'<button class="use" data-a="notice">連絡に追加</button>'
        +'<button class="use" data-a="message">大文字に追加</button>'
        +'<button class="dis" data-a="dismiss">却下</button>'
        +'</div>';
      d.querySelector('[data-a="notice"]').addEventListener('click', function(){ useIdea(it,'notice'); });
      d.querySelector('[data-a="message"]').addEventListener('click', function(){ useIdea(it,'message'); });
      d.querySelector('[data-a="dismiss"]').addEventListener('click', function(){ if(confirm('このネタを却下しますか？')) dismissIdea(it); });
      ideasWrap.appendChild(d);
    });
  }
  document.getElementById('idea-add-btn').addEventListener('click', function(){
    var body=document.getElementById('idea-body').value.trim();
    if(!body){ return; }
    fetch(API+'/ideas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:body})})
      .then(function(r){return r.json();}).then(function(j){
        if(j&&j.id){ IDEAS.unshift({id:j.id, body:body, media_id:null, submitted_by:j.submitted_by||'', created_at:j.created_at||''}); document.getElementById('idea-body').value=''; renderIdeas(); msg(document.getElementById('idea-msg'),'追加しました','ok'); }
        else msg(document.getElementById('idea-msg'),(j&&j.error)||'失敗','err');
      });
  });
  function useIdea(it, kind){
    var payload = kind==='notice'
      ? {heading:'営業所からの業務連絡', bullets: it.body.split('\\n')}
      : {text: it.body, sub:'', accent:'blue'};
    fetch(API+'/decks/'+DECK.id+'/slides', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:kind, payload:payload, fromIdea: it.id})})
      .then(function(r){return r.json();}).then(function(j){
        if(j&&j.id){
          SLIDES.push({id:j.id, kind:kind, payload:payload});
          IDEAS = IDEAS.filter(function(x){return x.id!==it.id;});
          renderSlides(); renderIdeas();
        } else alert((j&&j.error)||'失敗しました');
      });
  }
  function dismissIdea(it){
    fetch(API+'/ideas/'+it.id, {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'dismissed'})})
      .then(function(r){return r.json();}).then(function(j){
        if(j&&j.ok){ IDEAS=IDEAS.filter(function(x){return x.id!==it.id;}); renderIdeas(); }
      });
  }

  renderSlides();
  renderIdeas();
})();
</script>`;
}

// ===================================================================
// プレゼン投影ページ（全画面）
// ===================================================================
export function tenkoPresentPage(deck: TenkoDeck, slides: TenkoSlide[]): string {
  const slideData = slides.map(s => {
    let payload: unknown = {};
    try { payload = JSON.parse(s.payload || '{}'); } catch { payload = {}; }
    return { id: s.id, kind: s.kind, payload };
  });
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>${escHtml(fmtDeckDate(deck.deck_date))} 点呼 — 投影</title>
<style>
  ${SLIDE_CSS}
  html,body{margin:0;height:100%;background:#000;overflow:hidden;}
  #tk-stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#000;}
  #tk-slide-holder{width:1280px;height:720px;transform-origin:center center;}
  #tk-black{position:fixed;inset:0;background:#000;z-index:50;display:none;}
  #tk-bar{position:fixed;left:0;right:0;bottom:0;height:44px;background:rgba(15,23,42,.82);color:#fff;display:flex;align-items:center;gap:14px;padding:0 16px;font:600 13px/1 'Hiragino Sans','Meiryo',sans-serif;z-index:60;transition:opacity .3s;}
  #tk-bar.hidden{opacity:0;pointer-events:none;}
  #tk-bar button,#tk-bar a{background:rgba(255,255,255,.14);color:#fff;border:0;border-radius:6px;padding:7px 12px;font:inherit;cursor:pointer;text-decoration:none;}
  #tk-bar .sp{flex:1;}
  #tk-count{font-variant-numeric:tabular-nums;}
  #tk-zones{position:fixed;inset:0 0 44px 0;display:flex;z-index:40;}
  #tk-zones .z{flex:1;}
  .tk-vplay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);cursor:pointer;}
  .tk-vplay:after{content:'▶';color:#fff;font-size:120px;text-shadow:0 4px 20px rgba(0,0,0,.6);}
</style>
</head>
<body>
<div id="tk-stage"><div id="tk-slide-holder"></div></div>
<div id="tk-black"></div>
<div id="tk-zones"><div class="z" id="tk-prev-zone"></div><div class="z" id="tk-next-zone"></div></div>
<div id="tk-bar">
  <span id="tk-count">1 / ${slideData.length || 1}</span>
  <button id="tk-prev">← 前</button>
  <button id="tk-next">次 →</button>
  <button id="tk-fs">全画面</button>
  <button id="tk-blk">黒画面 (B)</button>
  <span class="sp"></span>
  <span style="opacity:.7;">${escHtml(fmtDeckDate(deck.deck_date))} 点呼</span>
  <a href="${ADMIN_PATH}/tenko/${deck.id}/edit">編集へ戻る</a>
</div>
<script>${SLIDE_RENDERER_JS}</script>
<script>
(function(){
  window.TK_DECK = ${safeJson({
    id: deck.id, deck_date: deck.deck_date, title: deck.title, confirmer: deck.confirmer,
    weather: deck.weather, temp_max: deck.temp_max, temp_min: deck.temp_min, headline: deck.headline,
  })};
  var SLIDES = ${safeJson(slideData)};
  if(!SLIDES.length){ SLIDES=[{id:0,kind:'cover',payload:{}}]; }
  var idx=0;
  var holder=document.getElementById('tk-slide-holder');
  var stage=document.getElementById('tk-stage');
  var countEl=document.getElementById('tk-count');
  var bar=document.getElementById('tk-bar');
  var black=document.getElementById('tk-black');

  function fit(){
    var s=Math.min(window.innerWidth/1280, (window.innerHeight-44)/720);
    holder.style.transform='scale('+s+')';
  }
  window.addEventListener('resize', fit); fit();

  function stopMedia(){
    var v=holder.querySelector('video'); if(v){ try{v.pause();}catch(e){} }
  }
  function render(){
    stopMedia();
    var s=SLIDES[idx];
    holder.innerHTML=renderSlideHTML(s, {present:true});
    countEl.textContent=(idx+1)+' / '+SLIDES.length;
    var v=holder.querySelector('video[data-autoplay]');
    if(v){
      var p=v.play();
      if(p&&p.catch){ p.catch(function(){
        var ov=document.createElement('div'); ov.className='tk-vplay';
        ov.addEventListener('click', function(){ v.play(); ov.remove(); });
        v.parentNode.appendChild(ov);
      }); }
    }
  }
  function go(n){ idx=Math.max(0,Math.min(SLIDES.length-1,n)); render(); }
  function next(){ go(idx+1); }
  function prev(){ go(idx-1); }

  document.getElementById('tk-next').addEventListener('click', next);
  document.getElementById('tk-prev').addEventListener('click', prev);
  document.getElementById('tk-next-zone').addEventListener('click', next);
  document.getElementById('tk-prev-zone').addEventListener('click', prev);
  document.getElementById('tk-fs').addEventListener('click', function(){
    if(document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  });
  document.getElementById('tk-blk').addEventListener('click', toggleBlack);
  function toggleBlack(){ black.style.display = black.style.display==='block'?'none':'block'; }

  document.addEventListener('keydown', function(e){
    if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){ e.preventDefault(); next(); }
    else if(e.key==='ArrowLeft'||e.key==='PageUp'){ e.preventDefault(); prev(); }
    else if(e.key==='Home'){ go(0); }
    else if(e.key==='End'){ go(SLIDES.length-1); }
    else if(e.key.toLowerCase()==='b'){ toggleBlack(); }
    else if(e.key.toLowerCase()==='f'){ document.getElementById('tk-fs').click(); }
    else if(e.key==='Escape' && !document.fullscreenElement){ location.href=${safeJson(ADMIN_PATH + '/tenko/' + deck.id + '/edit')}; }
  });

  // バーの自動フェード
  var hideT;
  function poke(){ bar.classList.remove('hidden'); clearTimeout(hideT); hideT=setTimeout(function(){ bar.classList.add('hidden'); }, 3000); }
  document.addEventListener('mousemove', poke); poke();

  render();
})();
</script>
</body>
</html>`;
}

// ===================================================================
// 印刷 / PDF ページ（回線断時の保険。動画・事故モニターはプレースホルダ）
// ===================================================================
export function tenkoPrintPage(deck: TenkoDeck, slides: TenkoSlide[]): string {
  const slideData = slides.map(s => {
    let payload: unknown = {};
    try { payload = JSON.parse(s.payload || '{}'); } catch { payload = {}; }
    return { id: s.id, kind: s.kind, payload };
  });
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${escHtml(fmtDeckDate(deck.deck_date))} 点呼 — 印刷</title>
<style>
  ${SLIDE_CSS}
  html,body{margin:0;background:#e5e7eb;}
  @page{size:A4 landscape;margin:0;}
  .tk-page{width:297mm;height:210mm;display:flex;align-items:center;justify-content:center;background:#fff;page-break-after:always;overflow:hidden;}
  .tk-page .tk-slide{transform-origin:center center;}
  .tk-ph{display:flex;align-items:center;justify-content:center;width:100%;height:100%;background:#111827;color:#fff;font-size:34px;text-align:center;padding:40px;}
  @media screen{ .tk-page{margin:12px auto;box-shadow:0 2px 10px rgba(0,0,0,.2);} .tk-toolbar{position:fixed;top:10px;right:10px;} }
  @media print{ .tk-toolbar{display:none;} }
  .tk-toolbar button{background:#1d4ed8;color:#fff;border:0;border-radius:7px;padding:10px 16px;font:700 13px sans-serif;cursor:pointer;}
</style>
</head>
<body>
<div class="tk-toolbar"><button onclick="window.print()">印刷 / PDF保存</button></div>
<div id="tk-pages"></div>
<script>${SLIDE_RENDERER_JS}</script>
<script>
(function(){
  window.TK_DECK = ${safeJson({
    id: deck.id, deck_date: deck.deck_date, title: deck.title, confirmer: deck.confirmer,
    weather: deck.weather, temp_max: deck.temp_max, temp_min: deck.temp_min, headline: deck.headline,
  })};
  var SLIDES = ${safeJson(slideData)};
  var pages=document.getElementById('tk-pages');
  var mmpx = (297*96/25.4); // A4横の幅px相当
  var scale = Math.min(mmpx/1280, (210*96/25.4)/720) * 0.96;
  SLIDES.forEach(function(s){
    var pg=document.createElement('div'); pg.className='tk-page';
    if(s.kind==='video'){ pg.innerHTML='<div class="tk-ph">動画スライド（印刷では表示できません）</div>'; }
    else if(s.kind==='accident'){ pg.innerHTML='<div class="tk-ph">事故件数レポート<br>（ホシコン事故モニター）</div>'; }
    else {
      pg.innerHTML=renderSlideHTML(s,{present:false});
      var sl=pg.querySelector('.tk-slide'); if(sl) sl.style.transform='scale('+scale+')';
    }
    pages.appendChild(pg);
  });
})();
</script>
</body>
</html>`;
}

// ===================================================================
// 定型スライド（ライブラリ）管理ページ
// ===================================================================
export function tenkoLibraryPage(media: TenkoMedia[], editable: boolean): string {
  return `
<style>
  .tk-wrap{max-width:820px;}
  .tk-topbar{display:flex;align-items:center;gap:10px;margin-bottom:16px;}
  .tk-topbar h1{font-size:18px;font-weight:800;margin:0;color:var(--color-primary);}
  .tk-btn{display:inline-block;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;padding:8px 15px;text-decoration:none;}
  .tk-btn-ghost{background:#f3f4f6;color:#374151;border:1px solid var(--color-border);}
  .tk-btn-play{background:#1d4ed8;color:#fff;}
  .tk-btn-danger{background:#fee2e2;color:#991b1b;}
  .tk-btn-sm{padding:4px 10px;font-size:11px;border-radius:6px;}
  .tk-card{background:#fff;border:1px solid var(--color-border);border-radius:12px;padding:16px 18px;margin-bottom:16px;}
  .tk-card h2{font-size:13px;font-weight:800;color:var(--color-primary);margin:0 0 12px;}
  .tk-lib-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;}
  .tk-lib-item{border:1px solid var(--color-border);border-radius:10px;overflow:hidden;background:#fff;}
  .tk-lib-item .thumb{width:100%;aspect-ratio:16/9;object-fit:contain;background:#111827;display:block;}
  .tk-lib-item .body{padding:8px 10px;}
  .tk-lib-item input{width:100%;border:1px solid #d1d5db;border-radius:5px;padding:5px 7px;font-size:12px;margin-bottom:6px;font-family:inherit;}
  .tk-lib-item .row{display:flex;gap:6px;}
  .tk-up label{font-size:12px;font-weight:700;color:#374151;}
  .tk-msg{font-size:12px;margin-top:6px;}
  .tk-msg.err{color:#b91c1c;} .tk-msg.ok{color:#166534;}
  .tk-empty{color:#9ca3af;font-size:13px;padding:20px;text-align:center;}
</style>
<div class="tk-wrap">
  <div class="tk-topbar">
    <a class="tk-btn tk-btn-ghost tk-btn-sm" href="${ADMIN_PATH}/tenko">← 点呼一覧</a>
    <h1>定型スライド管理</h1>
  </div>
  <p style="font-size:12.5px;color:#6b7280;line-height:1.7;margin:0 0 16px;">
    唱和スライドなど、毎回同じ内容で使い回す完成画像（16:9のPNG/JPG）を登録します。
    ここに登録した画像は、点呼編集の「定型スライド」から選んで差し込めます。
  </p>

  ${editable ? `
  <div class="tk-card tk-up">
    <h2>画像を追加</h2>
    <label>表示名<br><input type="text" id="lib-label" placeholder="唱和（未報告事案ゼロ）" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:8px;font-size:13px;margin:6px 0;font-family:inherit;"></label>
    <input type="file" id="lib-file" accept="image/*">
    <div style="margin-top:8px;"><button class="tk-btn tk-btn-play tk-btn-sm" type="button" id="lib-up-btn">アップロード</button> <span id="lib-msg" class="tk-msg"></span></div>
  </div>` : ''}

  <div class="tk-card">
    <h2>登録済み（${media.length}）</h2>
    <div class="tk-lib-grid" id="lib-grid">
      ${media.length ? media.map(m => `
        <div class="tk-lib-item" data-id="${m.id}">
          <img class="thumb" src="${MEDIA_URL}/${m.id}/file" alt="">
          <div class="body">
            <input type="text" value="${escHtml(m.label || m.filename)}" data-role="label" ${editable ? '' : 'disabled'}>
            <div class="row">
              ${editable ? `<button class="tk-btn tk-btn-ghost tk-btn-sm" type="button" data-role="save">名前保存</button>
              <button class="tk-btn tk-btn-danger tk-btn-sm" type="button" data-role="del">削除</button>` : ''}
            </div>
          </div>
        </div>`).join('') : '<div class="tk-empty">まだ登録がありません。</div>'}
    </div>
  </div>
</div>
<script>
(function(){
  var API = ${safeJson(API)};
  function msg(el,t,c){ el.textContent=t||''; el.className='tk-msg'+(c?' '+c:''); }
  var upBtn=document.getElementById('lib-up-btn');
  if(upBtn){
    upBtn.addEventListener('click', function(){
      var f=document.getElementById('lib-file').files[0];
      var label=document.getElementById('lib-label').value.trim();
      if(!f){ msg(document.getElementById('lib-msg'),'画像を選んでください','err'); return; }
      var fd=new FormData(); fd.append('file',f); fd.append('kind','image'); fd.append('is_library','1'); fd.append('label',label);
      upBtn.disabled=true; msg(document.getElementById('lib-msg'),'アップロード中…','');
      fetch(API+'/media',{method:'POST',body:fd}).then(function(r){return r.json();}).then(function(j){
        upBtn.disabled=false;
        if(j&&j.id){ location.reload(); }
        else msg(document.getElementById('lib-msg'),(j&&j.error)||'失敗','err');
      }).catch(function(){ upBtn.disabled=false; msg(document.getElementById('lib-msg'),'通信エラー','err'); });
    });
  }
  document.getElementById('lib-grid').addEventListener('click', function(e){
    var btn=e.target.closest('button'); if(!btn) return;
    var item=e.target.closest('.tk-lib-item'); var id=item.dataset.id;
    if(btn.dataset.role==='save'){
      var label=item.querySelector('[data-role="label"]').value;
      fetch(API+'/media/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({label:label})})
        .then(function(r){return r.json();}).then(function(j){ btn.textContent = (j&&j.ok)?'保存済み':'失敗'; setTimeout(function(){btn.textContent='名前保存';},1500); });
    } else if(btn.dataset.role==='del'){
      if(!confirm('この定型スライドを削除しますか？')) return;
      fetch(API+'/media/'+id,{method:'DELETE'}).then(function(r){return r.json();}).then(function(j){ if(j&&j.ok) item.remove(); else alert((j&&j.error)||'削除できませんでした'); });
    }
  });
})();
</script>`;
}
