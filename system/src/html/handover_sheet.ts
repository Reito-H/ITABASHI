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

export function handoverPage(editable: boolean, myDivision: string | null = null): string {
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
   のみ本文側の#ho-tabs-mを表示するフォールバックを用意する。
   全課を並べず、今開いている課のボタン1つだけ表示し、押すと他の課がドロップダウンで出る形式。 */
.ho-tabs-h{display:flex;align-items:center;height:24px;}
.ho-tab-wrap{position:relative;}
.ho-tab-cur{box-sizing:border-box;height:24px;display:inline-flex;align-items:center;gap:4px;padding:0 12px;
          border-radius:12px;border:1px solid var(--navy);background:var(--navy);cursor:pointer;font-size:12px;
          font-weight:700;color:#fff;white-space:nowrap;line-height:1;}
.ho-tab-arrow{font-size:9px;}
.ho-tab-menu{display:none;position:absolute;top:28px;left:0;background:#fff;border:1px solid #d1d5db;
          border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.18);min-width:96px;z-index:500;overflow:hidden;}
.ho-tab-menu.open{display:block;}
.ho-tab-opt{padding:7px 14px;font-size:12px;font-weight:700;color:#374151;cursor:pointer;white-space:nowrap;}
.ho-tab-opt:hover{background:#f3f4f6;}
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
.ho-divider{display:none;}
/* 左列（メインシート）と右列（当欠・事故車など）は高さを連動させない。
   一方の内容が伸びても他方の枠が引っ張られて伸びないよう、独立した縦積みコンテナに分ける。
   区切り線(.ho-divider)だけはalign-self:stretchで例外的に高い方の列に合わせて伸ばし、
   右列が左列より長くなっても境界線が途中で途切れないようにする。 */
@media(min-width:800px){
  .ho-grid{flex-direction:row;align-items:flex-start;min-height:640px;}
  .ho-col-left{flex:1;}
  .ho-divider{display:block;width:1.5px;background:var(--border);align-self:stretch;flex-shrink:0;}
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
.ho-del-btn{background:none;border:none;font-size:15px;cursor:pointer;color:#ccc;padding:2px 4px;}
.ho-del-btn:hover{color:var(--red);}
.ho-limit-btn{margin-left:auto;border:1px solid #ccc;background:#fff;color:#374151;border-radius:14px;
              padding:3px 11px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;}
.ho-limit-btn:hover{border-color:#999;}

#ho-limit-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:800;display:none;
                  align-items:center;justify-content:center;}
#ho-limit-overlay.show{display:flex;}
#ho-limit-modal{background:#fff;border-radius:10px;padding:18px 20px;width:400px;max-width:92vw;
                max-height:82vh;display:flex;flex-direction:column;box-shadow:0 12px 32px rgba(0,0,0,.3);}
.ho-limit-head{display:flex;align-items:center;justify-content:space-between;font-size:15px;font-weight:800;
               color:var(--navy);margin-bottom:4px;flex-shrink:0;}
#ho-limit-close{border:none;background:transparent;font-size:18px;color:#999;cursor:pointer;padding:0 4px;line-height:1;}
.ho-limit-desc{font-size:12px;color:var(--muted);margin-bottom:10px;flex-shrink:0;}
.ho-limit-list{overflow-y:auto;flex:1;margin-bottom:10px;}
.ho-limit-row{display:flex;align-items:center;gap:8px;padding:8px 2px;border-bottom:1px solid #f0f0f0;font-size:13px;}
.ho-limit-time{color:var(--red);font-weight:800;flex-shrink:0;}
.ho-limit-task{flex:1;color:#111;word-break:break-all;}
.ho-limit-del{border:1px solid #fca5a5;background:#fef2f2;color:#dc2626;border-radius:6px;padding:3px 9px;
              font-size:11px;cursor:pointer;flex-shrink:0;}
.ho-limit-empty{text-align:center;color:var(--muted);font-size:13px;padding:20px 0;}
#ho-limit-form-wrap{border-top:1px solid #eee;padding-top:10px;flex-shrink:0;display:flex;flex-direction:column;gap:8px;}
#ho-limit-task-inp{width:100%;border:1px solid #ccc;border-radius:6px;padding:7px 9px;font-size:13px;font-family:inherit;}
.ho-limit-form-row{display:flex;gap:8px;align-items:center;}
#ho-limit-days-inp{border:1px solid #ccc;border-radius:6px;padding:6px 8px;font-size:13px;font-family:inherit;}
#ho-limit-time-inp{border:1px solid #ccc;border-radius:6px;padding:6px 8px;font-size:13px;font-family:inherit;}
#ho-limit-add-btn{background:var(--navy);color:#fff;border:none;border-radius:6px;padding:7px 16px;font-size:13px;
                  font-weight:700;cursor:pointer;margin-left:auto;}

.ho-sec{padding:8px 10px;border-bottom:1px solid #ddd;display:flex;flex-direction:column;min-height:120px;}
.ho-sec:last-child{border-bottom:none;}
/* 右カラム各セクションの高さは設定モーダルの「高さ」設定値がインラインstyleで
   min-heightを指定する（小/標準/大/特大）。内容が増えれば枠ごと下へ伸びる。 */
.ho-lbl{font-size:var(--ho-fs,14px);font-weight:800;color:var(--navy);text-decoration:underline;text-underline-offset:2px;margin-bottom:4px;flex-shrink:0;}
.ho-lbl.red{color:var(--red);}
.ho-ta{width:100%;border:none;outline:none;font-size:var(--ho-fs,14px);line-height:1.8;resize:none;font-family:inherit;
       background:transparent;color:#111;flex:1 1 auto;min-height:100px;overflow-y:hidden;}
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

#ho-stale-banner{position:fixed;top:56px;right:16px;z-index:900;display:none;align-items:center;gap:8px;
                 background:#dc2626;color:#fff;font-size:12px;font-weight:700;padding:9px 14px;border-radius:20px;
                 box-shadow:0 6px 18px rgba(220,38,38,.4);cursor:pointer;border:none;white-space:nowrap;}
#ho-stale-banner:hover{background:#b91c1c;}
#ho-stale-banner.show{display:flex;}
@media (max-width:768px){ #ho-stale-banner{top:auto;bottom:64px;right:12px;} }

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
#ho-fontset-modal{background:#fff;border-radius:10px;padding:18px 20px;width:420px;max-width:92vw;
                  max-height:85vh;display:flex;flex-direction:column;box-shadow:0 12px 32px rgba(0,0,0,.3);}
.ho-fontset-head{display:flex;align-items:center;justify-content:space-between;font-size:15px;font-weight:800;
                 color:var(--navy);margin-bottom:4px;flex-shrink:0;}
#ho-fontset-close{border:none;background:transparent;font-size:18px;color:#999;cursor:pointer;padding:0 4px;line-height:1;}
.ho-fontset-body{overflow-y:auto;flex:1;}
.ho-fontset-desc{font-size:12px;color:var(--muted);margin-bottom:10px;}
.ho-fontset-subhead{font-size:13px;font-weight:800;color:var(--navy);margin:14px 0 6px;}
.ho-fontset-row{display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;}
.ho-fontset-row:last-child{border-bottom:none;}
.ho-fontset-name{font-size:13px;font-weight:700;color:#333;}
.ho-fontset-opts{display:flex;gap:4px;}
.ho-fontset-btn{border:1px solid #ccc;background:#fafafa;border-radius:5px;padding:3px 9px;font-size:11px;
                font-weight:700;color:#555;cursor:pointer;}
.ho-fontset-btn.active{background:var(--navy);border-color:var(--navy);color:#fff;}
.ho-fontset-btn.disabled{cursor:default;opacity:.5;}

.ho-sec-row{display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid #eee;}
.ho-sec-row:last-child{border-bottom:none;}
.ho-sec-row.inactive{opacity:.45;}
.ho-sec-move{display:flex;flex-direction:column;gap:1px;flex-shrink:0;}
.ho-sec-move-btn{border:1px solid #ccc;background:#fafafa;border-radius:3px;font-size:9px;line-height:1;
                 padding:1px 4px;cursor:pointer;color:#555;}
.ho-sec-move-btn:disabled{opacity:.3;cursor:default;}
.ho-sec-label-inp{flex:1;min-width:0;border:1px solid #ddd;border-radius:5px;padding:4px 6px;font-size:12px;
                  font-family:inherit;}
.ho-sec-height-sel{border:1px solid #ccc;background:#fafafa;border-radius:5px;padding:3px 4px;font-size:11px;
                   color:#555;flex-shrink:0;}
.ho-sec-toggle{border:1px solid #ccc;background:#fafafa;border-radius:12px;padding:3px 8px;font-size:10px;
              font-weight:700;color:#555;cursor:pointer;flex-shrink:0;white-space:nowrap;}
.ho-sec-toggle.on{background:#e3f5e6;border-color:#8ec99b;color:#2e7d32;}
.ho-sec-del{border:none;background:transparent;color:#ccc;font-size:14px;cursor:pointer;padding:2px 4px;flex-shrink:0;}
.ho-sec-del:hover{color:var(--red);}
.ho-sec-add-row{display:flex;gap:6px;margin-top:8px;flex-shrink:0;}
#ho-sec-add-inp{flex:1;border:1px solid #ccc;border-radius:6px;padding:6px 8px;font-size:12px;font-family:inherit;}
#ho-sec-add-btn{border:1px solid var(--navy);background:var(--navy);color:#fff;border-radius:6px;padding:6px 12px;
                font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;}

.ho-toolrow{display:flex;justify-content:flex-end;align-items:center;gap:6px;margin-bottom:8px;}
.ho-tokasum-btn{border:1px solid #ccc;background:#fff;color:#374151;border-radius:16px;padding:5px 12px;
                font-size:12px;font-weight:700;cursor:pointer;}
.ho-copy-btn,.ho-print-btn{border:1px solid #ccc;background:#fff;color:#374151;border-radius:14px;padding:3px 10px;
             font-size:11px;font-weight:700;cursor:pointer;}
.ho-copy-btn:hover,.ho-print-btn:hover{border-color:#999;}
.ho-copy-btn:disabled,.ho-print-btn:disabled{color:#999;cursor:default;}
#ho-tokasum-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:800;display:none;
                    align-items:center;justify-content:center;}
#ho-tokasum-overlay.show{display:flex;}
#ho-tokasum-modal{background:#fff;border-radius:10px;padding:18px 20px;width:400px;max-width:92vw;
                  max-height:82vh;display:flex;flex-direction:column;box-shadow:0 12px 32px rgba(0,0,0,.3);}
@media (min-width:769px){
  /* PCでは当欠記録の枠を大きくし、円グラフ＋凡例を横並びで見せられるようにする */
  #ho-tokasum-modal{width:760px;max-width:90vw;max-height:88vh;padding:24px 28px;}
  .ho-tokasum-head{font-size:17px;}
}
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
.ho-tokasum-tabs{display:flex;gap:6px;margin-bottom:10px;flex-shrink:0;}
.ho-tokasum-tab{flex:1;text-align:center;border:1px solid #ccc;background:#fafafa;border-radius:6px;padding:5px 0;
                font-size:12px;font-weight:700;color:#555;cursor:pointer;}
.ho-tokasum-tab.active{background:var(--navy);border-color:var(--navy);color:#fff;}
.ho-tokasum-back{border:none;background:transparent;color:var(--navy);font-size:12px;font-weight:700;cursor:pointer;
                 padding:0;margin-bottom:8px;flex-shrink:0;text-align:left;}
.ho-tokasum-rank-row{display:flex;align-items:center;gap:8px;padding:8px 4px;border-bottom:1px solid #f0f0f0;
                     font-size:13px;cursor:pointer;}
.ho-tokasum-rank-row:hover{background:#f7f7f7;}
.ho-tokasum-rank-no{width:20px;flex-shrink:0;color:var(--muted);font-weight:800;text-align:center;}
.ho-tokasum-rank-name{flex:1;font-weight:700;color:#111;}
.ho-tokasum-rank-count{color:var(--red);font-weight:800;}
.ho-tokasum-detail-name{font-size:15px;font-weight:800;color:var(--navy);text-align:center;margin-bottom:6px;}
.ho-tokasum-detail-sub{font-size:12px;font-weight:800;color:var(--navy);margin:12px 0 6px;}
.ho-tokasum-bar-row{display:flex;align-items:center;gap:8px;padding:2px 0;font-size:12px;}
.ho-tokasum-bar-lbl{width:56px;flex-shrink:0;color:#555;}
.ho-tokasum-bar-track{flex:1;background:#f0f0f0;border-radius:4px;height:14px;overflow:hidden;}
.ho-tokasum-bar-fill{height:100%;background:var(--navy);border-radius:4px;}
.ho-tokasum-bar-val{width:24px;flex-shrink:0;text-align:right;color:#333;font-weight:700;}
.ho-tokasum-reason-row{display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid #f5f5f5;}

/* 円グラフ（人別構成・理由内訳の共通コンポーネント。conic-gradientのみで実装、外部ライブラリ不使用） */
.ho-pie-wrap{display:flex;align-items:center;gap:20px;flex-wrap:wrap;padding:6px 2px 14px;}
.ho-pie{width:132px;height:132px;flex-shrink:0;border-radius:50%;position:relative;}
.ho-pie-hole{position:absolute;inset:20px;background:#fff;border-radius:50%;
             display:flex;flex-direction:column;align-items:center;justify-content:center;
             box-shadow:0 0 0 1px rgba(0,0,0,.05) inset;}
.ho-pie-total{font-size:19px;font-weight:800;color:var(--navy);line-height:1.1;}
.ho-pie-total-lbl{font-size:10px;color:var(--muted);}
.ho-pie-legend{flex:1;min-width:150px;}
.ho-pie-legend-row{display:flex;align-items:center;gap:7px;padding:3px 0;font-size:12px;}
.ho-pie-swatch{width:10px;height:10px;border-radius:2px;flex-shrink:0;}
.ho-pie-legend-label{flex:1;color:#111;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ho-pie-legend-val{color:#555;flex-shrink:0;}
.ho-tokasum-months-bar{display:flex;justify-content:center;gap:6px;margin:2px 0 4px;}
.ho-tokasum-months-btn{border:1px solid #ccc;background:#fafafa;border-radius:12px;padding:3px 11px;
                       font-size:11px;font-weight:700;color:#555;cursor:pointer;}
.ho-tokasum-months-btn.active{background:var(--navy);border-color:var(--navy);color:#fff;}
</style>

<div id="ho-root">
  <div class="ho-tabs-h" id="ho-tabs-m"></div>
  <div class="ho-toolrow">
    <button type="button" id="ho-copy-btn" class="ho-copy-btn">コピー</button>
    <button type="button" id="ho-print-btn" class="ho-print-btn">印刷</button>
    <button type="button" id="ho-tokasum-btn" class="ho-tokasum-btn">当欠記録を見る</button>
  </div>
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
<button type="button" id="ho-stale-banner">⚠ 他の端末で更新されています。クリックして更新</button>
<div id="ho-fontset-overlay">
  <div id="ho-fontset-modal">
    <div class="ho-fontset-head"><span id="ho-fontset-title">課の設定</span><button type="button" id="ho-fontset-close">×</button></div>
    <div class="ho-fontset-body">
      <div class="ho-fontset-desc" id="ho-fontset-desc"></div>
      <div id="ho-fontset-rows"></div>
      <div class="ho-fontset-subhead">表示セクション</div>
      <div class="ho-fontset-desc">右カラムの項目を追加・削除・改名・並び替え・高さ変更できます。当欠・事故車など既存5項目は削除できず、非表示のみ可能です。</div>
      <div id="ho-sec-rows"></div>
      <div class="ho-sec-add-row">
        <input type="text" id="ho-sec-add-inp" placeholder="新しいセクション名" maxlength="30">
        <button type="button" id="ho-sec-add-btn">＋ 追加</button>
      </div>
    </div>
  </div>
</div>
<div id="ho-limit-overlay">
  <div id="ho-limit-modal">
    <div class="ho-limit-head"><span>リミット設定</span><button type="button" id="ho-limit-close">×</button></div>
    <div class="ho-limit-desc">この日のシートに、何時までにやるべきタスクを設定します。時刻になると全ページに通知が表示されます。</div>
    <div class="ho-limit-list" id="ho-limit-list"></div>
    <div id="ho-limit-form-wrap">
      <input type="text" id="ho-limit-task-inp" placeholder="タスク内容（例: ○○車の点検手配）" maxlength="200">
      <div class="ho-limit-form-row">
        <select id="ho-limit-days-inp" title="通知日">
          <option value="0">当日</option>
          <option value="1">1日後</option>
          <option value="2">2日後</option>
          <option value="3">3日後</option>
          <option value="4">4日後</option>
          <option value="5">5日後</option>
          <option value="7">1週間後</option>
        </select>
        <input type="time" id="ho-limit-time-inp">
        <button type="button" id="ho-limit-add-btn">設定</button>
      </div>
    </div>
  </div>
</div>
<div id="ho-tokasum-overlay">
  <div id="ho-tokasum-modal">
    <div class="ho-tokasum-head"><span>当欠記録</span><button type="button" id="ho-tokasum-close">×</button></div>
    <div class="ho-tokasum-tabs" id="ho-tokasum-tabs">
      <button type="button" class="ho-tokasum-tab" id="ho-tokasum-tab-list">日別</button>
      <button type="button" class="ho-tokasum-tab" id="ho-tokasum-tab-rank">人別集計</button>
    </div>
    <button type="button" class="ho-tokasum-back" id="ho-tokasum-back" style="display:none">‹ 集計に戻る</button>
    <div class="ho-tokasum-monthbar" id="ho-tokasum-monthbar">
      <button type="button" class="ho-tokasum-monthbtn" id="ho-tokasum-prev">‹前月</button>
      <span class="ho-tokasum-monthlbl" id="ho-tokasum-monthlbl"></span>
      <button type="button" class="ho-tokasum-monthbtn" id="ho-tokasum-next">翌月›</button>
    </div>
    <div class="ho-tokasum-count" id="ho-tokasum-count"></div>
    <div class="ho-tokasum-list" id="ho-tokasum-list"></div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
<script>
(function(){
const API = ${safeJson(`${ADMIN_PATH}/api/handover`)};
const EDITABLE = ${editable ? 'true' : 'false'};
const MY_DIVISION = ${safeJson(myDivision)};
function lastDivision(){
  const v = parseInt(localStorage.getItem('ho_last_division'), 10);
  return (v >= 1 && v <= 4) ? v : 1;
}
function initialDivision(){
  const md = parseInt(MY_DIVISION, 10);
  return (md >= 1 && md <= 4) ? md : lastDivision();
}
const H = {
  division: initialDivision(), date: null, dates: [], updatedAt: null, fieldTimers: {}, savedRange: null,
  numpickApply: null, fontSizes: { 1: 14, 2: 14, 3: 14, 4: 14 }, limits: [],
  sections: [], customContent: [],
};
// DOM要素id → DBカラム名（項目単位の部分保存で使用）
const FIELD_BY_ID = {
  'ho-kabu-y':'kabu_yotei', 'ho-kabu-j':'kabu_jisseki', 'ho-douta-btn':'douta',
  'ho-main-c':'main_content', 'ho-toka-c':'toka_content', 'ho-jomu-c':'jomu_content',
  'ho-jiko-c':'jiko_content', 'ho-tenken-c':'tenken_content', 'ho-joshu-c':'joshu_content',
};
// 特別枠（右カラムの入力補助付き5項目）のsection_key → DOM要素id
const SPECIAL_DOM_ID = {
  'toka':'ho-toka-c', 'jiko':'ho-jiko-c', 'tenken':'ho-tenken-c', 'joshu':'ho-joshu-c', 'jomu':'ho-jomu-c',
};
// 表示セクションの高さプリセット→px（設定モーダルの「小/標準/大/特大」に対応）
const HEIGHT_PX = { small:80, normal:120, large:160, xlarge:220 };

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
  if (!e.target.closest('.ho-tab-wrap')) closeTabMenus();
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
// textareaは中身が増えても高さが自動で伸びないため、scrollHeightに合わせて
// 都度style.heightを再計算し、枠(.ho-sec)ごと下へ伸びるようにする（当欠・乗務希望で使用）。
function autoGrowTa(ta){
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}
function attachAutoGrow(ta){
  if (!ta) return;
  ta.addEventListener('input', () => autoGrowTa(ta));
  autoGrowTa(ta);
}
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
        autoGrowTa(ta);
        if (opts.afterPick) opts.afterPick(ta, newPos);
        else scheduleSave(field);
      });
    }, 280);
  });
}

// 当欠欄の「名前 ±数値」行（後ろに理由や注記が続いていてもよい）を集計し、
// 稼働予定が入力済みなら稼働実績へ自動反映。値の直後が別の数字でなければ拾う
// （以前は値の直後が空白/行末以外だと無視していたため「-0.5（B→a）」のような
// 注記付き行が集計から漏れていた）。
function calcTokaDelta(text){
  let sum = 0;
  (text || '').split('\\n').forEach(line => {
    const m = line.trim().match(/([+\\-])(0\\.5|1\\.0)(?!\\d)/);
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
function closeTabMenus(){
  document.querySelectorAll('.ho-tab-menu.open').forEach(m => m.classList.remove('open'));
}
function renderTabs(){
  const others = [1,2,3,4].filter(d => d !== H.division);
  const html =
    '<div class="ho-tab-wrap">' +
      '<button type="button" class="ho-tab-cur">板橋'+H.division+'課<span class="ho-tab-arrow">▾</span></button>' +
      '<div class="ho-tab-menu">' +
        others.map(d => '<div class="ho-tab-opt" data-d="'+d+'">板橋'+d+'課</div>').join('') +
      '</div>' +
    '</div>';
  ['ho-tabs','ho-tabs-m'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    const menu = el.querySelector('.ho-tab-menu');
    el.querySelector('.ho-tab-cur').addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = menu.classList.contains('open');
      closeTabMenus();
      if (!wasOpen) menu.classList.add('open');
    });
    menu.querySelectorAll('.ho-tab-opt').forEach(opt => opt.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTabMenus();
      switchDivision(parseInt(opt.dataset.d, 10));
    }));
  });
}
async function switchDivision(d){
  if (d === H.division) return;
  H.division = d; H.date = null;
  try { localStorage.setItem('ho_last_division', String(d)); } catch {}
  renderTabs();
  applyFontSize();
  await loadSections();
  await loadDates();
}

// ===== 表示セクション構成の取得（右カラムの特別枠5項目＋自由追加したカスタム枠） =====
async function loadSections(){
  try {
    const data = await api('GET', '/'+H.division+'/sections');
    H.sections = data.sections || [];
  } catch(e){ H.sections = []; }
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
// 文字サイズは今開いている課（H.division）のみを表示・編集する
// （他課の設定を見たい場合は課タブを切り替えてから開く仕様）。
function renderFontSettingsRows(){
  const wrap = document.getElementById('ho-fontset-rows');
  const descEl = document.getElementById('ho-fontset-desc');
  if (descEl) descEl.textContent = '今開いている板橋'+H.division+'課の引き継ぎシート本文の文字サイズを設定します。';
  const cur = H.fontSizes[H.division] || 14;
  const opts = FONT_SIZES.map(o =>
    '<button type="button" class="ho-fontset-btn'+(o.v===cur?' active':'')+(EDITABLE?'':' disabled')+
    '" data-v="'+o.v+'">'+o.label+'</button>'
  ).join('');
  wrap.innerHTML = '<div class="ho-fontset-row"><span class="ho-fontset-name">文字サイズ</span><div class="ho-fontset-opts">'+opts+'</div></div>';
  if (!EDITABLE) return;
  wrap.querySelectorAll('.ho-fontset-btn').forEach(b => b.addEventListener('click', () => setFontSize(H.division, parseInt(b.dataset.v,10))));
}
async function setFontSize(division, size){
  try {
    await api('PUT', '/'+division+'/font-size', { size });
    H.fontSizes[division] = size;
    renderFontSettingsRows();
    if (division === H.division){
      applyFontSize();
      autoGrowTa(document.getElementById('ho-toka-c'));
      autoGrowTa(document.getElementById('ho-jomu-c'));
    }
    toast('文字サイズを変更しました');
  } catch(e){ toast('エラー: '+e.message, 2500); }
}

// ===== 表示セクション設定（今開いている課のみ）=====
const HEIGHT_SIZE_OPTS = [ ['small','小'], ['normal','標準'], ['large','大'], ['xlarge','特大'] ];
function renderSectionSettingsRows(){
  const wrap = document.getElementById('ho-sec-rows');
  const list = H.sections || [];
  wrap.innerHTML = list.map((s, i) => {
    const heightOpts = HEIGHT_SIZE_OPTS.map(([v,label]) =>
      '<option value="'+v+'"'+(s.height_size===v?' selected':'')+'>'+label+'</option>'
    ).join('');
    return '<div class="ho-sec-row'+(s.is_active?'':' inactive')+'">' +
      '<div class="ho-sec-move">' +
        '<button type="button" class="ho-sec-move-btn ho-sec-up" data-id="'+s.id+'"'+(i===0?' disabled':'')+'>▲</button>' +
        '<button type="button" class="ho-sec-move-btn ho-sec-down" data-id="'+s.id+'"'+(i===list.length-1?' disabled':'')+'>▼</button>' +
      '</div>' +
      '<input type="text" class="ho-sec-label-inp" data-id="'+s.id+'" value="'+esc(s.label)+'" maxlength="30">' +
      '<select class="ho-sec-height-sel" data-id="'+s.id+'">'+heightOpts+'</select>' +
      '<button type="button" class="ho-sec-toggle'+(s.is_active?' on':'')+'" data-id="'+s.id+'">'+(s.is_active?'表示中':'非表示')+'</button>' +
      (s.kind==='custom' ? '<button type="button" class="ho-sec-del" data-id="'+s.id+'" title="削除">🗑</button>' : '') +
    '</div>';
  }).join('');
  if (!EDITABLE){
    wrap.querySelectorAll('input,select,button').forEach(el => { el.disabled = true; });
    return;
  }
  wrap.querySelectorAll('.ho-sec-label-inp').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); inp.blur(); } });
    inp.addEventListener('blur', () => updateSectionLabel(parseInt(inp.dataset.id,10), inp.value));
  });
  wrap.querySelectorAll('.ho-sec-height-sel').forEach(sel => {
    sel.addEventListener('change', () => updateSectionField(parseInt(sel.dataset.id,10), { height_size: sel.value }));
  });
  wrap.querySelectorAll('.ho-sec-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = (H.sections||[]).find(x => x.id === parseInt(btn.dataset.id,10));
      if (s) updateSectionField(s.id, { is_active: !s.is_active });
    });
  });
  wrap.querySelectorAll('.ho-sec-del').forEach(btn => btn.addEventListener('click', () => deleteSection(parseInt(btn.dataset.id,10))));
  wrap.querySelectorAll('.ho-sec-up').forEach(btn => btn.addEventListener('click', () => moveSection(parseInt(btn.dataset.id,10), -1)));
  wrap.querySelectorAll('.ho-sec-down').forEach(btn => btn.addEventListener('click', () => moveSection(parseInt(btn.dataset.id,10), 1)));
}
// セクション設定の変更後は一覧を再取得し、開いているシートがあれば表示にも反映する
async function reloadSectionsAndSheet(){
  await loadSections();
  renderSectionSettingsRows();
  if (H.date) loadSheet(H.date);
}
async function updateSectionLabel(id, label){
  label = label.trim();
  if (!label){ toast('セクション名を入力してください', 2000); renderSectionSettingsRows(); return; }
  const s = (H.sections||[]).find(x => x.id === id);
  if (s && s.label === label) return;
  await updateSectionField(id, { label });
}
async function updateSectionField(id, patch){
  try {
    await api('PATCH', '/'+H.division+'/sections/'+id, patch);
    await reloadSectionsAndSheet();
  } catch(e){ toast('エラー: '+e.message, 2500); }
}
async function moveSection(id, dir){
  const list = [...(H.sections||[])];
  const idx = list.findIndex(x => x.id === id);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return;
  [list[idx], list[swapIdx]] = [list[swapIdx], list[idx]];
  try {
    await api('PUT', '/'+H.division+'/sections/reorder', { order: list.map(s => s.id) });
    await reloadSectionsAndSheet();
  } catch(e){ toast('エラー: '+e.message, 2500); }
}
async function deleteSection(id){
  if (!confirm('このセクションを削除しますか？（保存済みの内容も削除されます）')) return;
  try {
    await api('DELETE', '/'+H.division+'/sections/'+id);
    await reloadSectionsAndSheet();
    toast('削除しました');
  } catch(e){ toast('エラー: '+e.message, 2500); }
}
async function addSection(){
  const inp = document.getElementById('ho-sec-add-inp');
  const label = inp.value.trim();
  if (!label){ toast('セクション名を入力してください', 2000); return; }
  try {
    await api('POST', '/'+H.division+'/sections', { label });
    inp.value = '';
    await reloadSectionsAndSheet();
    toast('セクションを追加しました');
  } catch(e){ toast('エラー: '+e.message, 2500); }
}
document.getElementById('ho-sec-add-btn').addEventListener('click', addSection);

function openFontSettings(){
  document.getElementById('ho-fontset-title').textContent = '板橋'+H.division+'課の設定';
  renderFontSettingsRows();
  renderSectionSettingsRows();
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
  hoTitleEl.title = 'クリックで課の設定を開く';
  hoTitleEl.addEventListener('click', openFontSettings);
}

// ===== 当欠記録（月間集計）=====
// 円グラフ（人別構成・理由内訳）はconic-gradientのみで実装（外部ライブラリ不使用）。
// カテゴリ色は固定順で使い切りローテーションしない方針とし、上位5件+「その他」にまとめる。
const HO_PIE_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const HO_PIE_OTHER_COLOR = '#9ca3af';
function pieItemsFromCounts(list, getLabel, getValue, maxSlices, otherLabelFn){
  const top = list.slice(0, maxSlices - 1);
  const rest = list.slice(maxSlices - 1);
  const items = top.map((x, idx) => ({ label: getLabel(x), value: getValue(x), color: HO_PIE_COLORS[idx % HO_PIE_COLORS.length] }));
  if (rest.length){
    const restTotal = rest.reduce((s, x) => s + getValue(x), 0);
    if (restTotal > 0) items.push({ label: otherLabelFn(rest), value: restTotal, color: HO_PIE_OTHER_COLOR });
  }
  return items;
}
function buildPieChart(items){
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  let acc = 0;
  const stops = items.map(it => {
    const start = acc, end = acc + (it.value / total * 100);
    acc = end;
    return it.color + ' ' + start.toFixed(2) + '% ' + end.toFixed(2) + '%';
  }).join(', ');
  const legend = items.map(it => {
    const pct = Math.round(it.value / total * 100);
    return '<div class="ho-pie-legend-row"><span class="ho-pie-swatch" style="background:' + it.color + '"></span>'
      + '<span class="ho-pie-legend-label">' + esc(it.label) + '</span>'
      + '<span class="ho-pie-legend-val">' + it.value + '件（' + pct + '%）</span></div>';
  }).join('');
  return '<div class="ho-pie-wrap"><div class="ho-pie" style="background:conic-gradient(' + stops + ')">'
    + '<div class="ho-pie-hole"><span class="ho-pie-total">' + total + '</span><span class="ho-pie-total-lbl">件</span></div></div>'
    + '<div class="ho-pie-legend">' + legend + '</div></div>';
}
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
    H.tokaSumData = data;
    countEl.innerHTML = '板橋'+H.division+'課 当欠数：<b>'+data.count+'</b>件';
    renderTokaSumBody();
  } catch(e){
    listEl.innerHTML = '<div class="ho-tokasum-empty">読み込みエラー: '+esc(e.message)+'</div>';
  }
}
// H.tokaSumView（'list'=日別 / 'ranking'=人別集計）に応じて一覧を描画する
function renderTokaSumBody(){
  const listEl = document.getElementById('ho-tokasum-list');
  const data = H.tokaSumData;
  if (!data || H.tokaSumView === 'detail') return;
  if (H.tokaSumView === 'ranking'){
    if (!data.ranking.length){
      listEl.innerHTML = '<div class="ho-tokasum-empty">この月の当欠記録はありません</div>';
      return;
    }
    const pieItems = pieItemsFromCounts(data.ranking, r => r.name, r => r.count, 6, rest => 'その他（' + rest.length + '名）');
    const pieHtml = buildPieChart(pieItems);
    const rowsHtml = data.ranking.map((r, i) =>
      '<div class="ho-tokasum-rank-row" data-name="'+esc(r.name)+'"><span class="ho-tokasum-rank-no">'+(i+1)+'</span>'+
      '<span class="ho-tokasum-rank-name">'+esc(r.name)+'</span>'+
      '<span class="ho-tokasum-rank-count">'+r.count+'回</span></div>'
    ).join('');
    listEl.innerHTML = pieHtml + rowsHtml;
    listEl.querySelectorAll('.ho-tokasum-rank-row').forEach(row =>
      row.addEventListener('click', () => openTokaDetail(row.dataset.name)));
    return;
  }
  if (!data.entries.length){
    listEl.innerHTML = '<div class="ho-tokasum-empty">この月の当欠記録はありません</div>';
    return;
  }
  listEl.innerHTML = data.entries.map(e =>
    '<div class="ho-tokasum-row"><span class="ho-tokasum-row-date">'+fmtMd(e.date)+'</span>'+
    '<span class="ho-tokasum-row-name">'+esc(e.name)+'</span>'+
    '<span class="ho-tokasum-row-val">'+e.value.toFixed(1)+'</span></div>'
  ).join('');
}
// 個人別の当欠傾向（曜日別/月推移/理由内訳）を表示する
async function openTokaDetail(name){
  H.tokaSumPerson = name;
  if (!H.tokaDetailMonths) H.tokaDetailMonths = 6;
  setTokaSumView('detail');
  const listEl = document.getElementById('ho-tokasum-list');
  listEl.innerHTML = '<div class="ho-tokasum-empty">読み込み中…</div>';
  try {
    const data = await api('GET', '/'+H.division+'/toka-detail?name='+encodeURIComponent(name)+'&month='+H.tokaSumMonth+'&months='+H.tokaDetailMonths);
    renderTokaDetailBody(data);
  } catch(e){
    listEl.innerHTML = '<div class="ho-tokasum-empty">読み込みエラー: '+esc(e.message)+'</div>';
  }
}
function renderTokaDetailBody(data){
  const listEl = document.getElementById('ho-tokasum-list');
  const monthsOptions = [3, 6, 12];
  const monthsBarHtml = '<div class="ho-tokasum-months-bar">' + monthsOptions.map(n =>
    '<button type="button" class="ho-tokasum-months-btn'+(H.tokaDetailMonths===n?' active':'')+'" data-months="'+n+'">'+n+'ヶ月</button>'
  ).join('') + '</div>';
  const maxMonthCount = Math.max(1, ...data.monthly.map(m => m.count));
  const monthlyHtml = data.monthly.map(m => {
    const w = Math.round((m.count / maxMonthCount) * 100);
    return '<div class="ho-tokasum-bar-row"><span class="ho-tokasum-bar-lbl">'+fmtYm(m.ym).replace('年','/').replace('月','')+'</span>'+
      '<div class="ho-tokasum-bar-track"><div class="ho-tokasum-bar-fill" style="width:'+w+'%"></div></div>'+
      '<span class="ho-tokasum-bar-val">'+m.count+'</span></div>';
  }).join('');
  const wdLabels = ['日','月','火','水','木','金','土'];
  const maxWd = Math.max(1, ...data.weekday);
  const wdHtml = data.weekday.map((cnt, i) => {
    const w = Math.round((cnt / maxWd) * 100);
    return '<div class="ho-tokasum-bar-row"><span class="ho-tokasum-bar-lbl">'+wdLabels[i]+'曜</span>'+
      '<div class="ho-tokasum-bar-track"><div class="ho-tokasum-bar-fill" style="width:'+w+'%"></div></div>'+
      '<span class="ho-tokasum-bar-val">'+cnt+'</span></div>';
  }).join('');
  const reasonPieHtml = data.reasons.length
    ? buildPieChart(pieItemsFromCounts(data.reasons, r => r.reason, r => r.count, 6, rest => 'その他（' + rest.length + '）'))
    : '';
  const reasonHtml = data.reasons.length ? data.reasons.map(r =>
    '<div class="ho-tokasum-reason-row"><span>'+esc(r.reason)+'</span><span>'+r.count+'件</span></div>'
  ).join('') : '<div class="ho-tokasum-empty">理由の記録はありません</div>';
  listEl.innerHTML =
    '<div class="ho-tokasum-detail-name">'+esc(data.name)+'</div>' +
    monthsBarHtml +
    '<div class="ho-tokasum-detail-sub">月別の推移（直近'+H.tokaDetailMonths+'ヶ月）</div>' + monthlyHtml +
    '<div class="ho-tokasum-detail-sub">曜日別の傾向</div>' + wdHtml +
    '<div class="ho-tokasum-detail-sub">理由の内訳</div>' + reasonPieHtml + reasonHtml;
  listEl.querySelectorAll('.ho-tokasum-months-btn').forEach(btn => btn.addEventListener('click', () => {
    H.tokaDetailMonths = parseInt(btn.dataset.months, 10);
    openTokaDetail(H.tokaSumPerson);
  }));
}
// タブ('list'/'ranking')・戻る('detail'→'ranking')で表示を切り替える
function setTokaSumView(view){
  H.tokaSumView = view;
  document.getElementById('ho-tokasum-tab-list').classList.toggle('active', view === 'list');
  document.getElementById('ho-tokasum-tab-rank').classList.toggle('active', view === 'ranking');
  document.getElementById('ho-tokasum-tabs').style.display = (view === 'detail') ? 'none' : 'flex';
  document.getElementById('ho-tokasum-back').style.display = (view === 'detail') ? 'block' : 'none';
  document.getElementById('ho-tokasum-monthbar').style.display = (view === 'detail') ? 'none' : 'flex';
  document.getElementById('ho-tokasum-count').style.display = (view === 'detail') ? 'none' : 'block';
  if (view === 'list' || view === 'ranking') renderTokaSumBody();
}
document.getElementById('ho-tokasum-tab-list').addEventListener('click', () => setTokaSumView('list'));
document.getElementById('ho-tokasum-tab-rank').addEventListener('click', () => setTokaSumView('ranking'));
document.getElementById('ho-tokasum-back').addEventListener('click', () => setTokaSumView('ranking'));
async function openTokaSummary(){
  if (!H.tokaSumMonth) H.tokaSumMonth = currentYm();
  document.getElementById('ho-tokasum-overlay').classList.add('show');
  setTokaSumView('list');
  document.getElementById('ho-tokasum-list').innerHTML = '<div class="ho-tokasum-empty">読み込み中…</div>';
  // 直前に入力した当欠が保存デバウンス待ち（最大900ms）のままだと集計に反映されないため、
  // 開いた瞬間に未保存分を先に確定させてから集計を取得する
  await flushPendingSaves();
  loadTokaSummary();
}
function closeTokaSummary(){
  document.getElementById('ho-tokasum-overlay').classList.remove('show');
}
function copySheetImage(){
  if (typeof html2canvas === 'undefined') { alert('画像化ライブラリの読み込みに失敗しました。通信環境を確認してください。'); return; }
  const el = document.querySelector('#ho-sheet-wrap .ho-doc');
  if (!el) { alert('シートが読み込まれていません'); return; }
  const btn = document.getElementById('ho-copy-btn');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '生成中…';
  html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then((canvas) => {
    canvas.toBlob((blob) => {
      if (!blob) { btn.disabled = false; btn.textContent = orig; alert('画像の生成に失敗しました'); return; }
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
          btn.textContent = 'コピーしました';
          setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
        }).catch(() => {
          btn.disabled = false; btn.textContent = orig;
          alert('コピーに失敗しました（ブラウザの設定をご確認ください）');
        });
      } else {
        btn.disabled = false; btn.textContent = orig;
        alert('このブラウザは画像コピーに対応していません');
      }
    }, 'image/png');
  }).catch(() => {
    btn.disabled = false; btn.textContent = orig;
    alert('画像の生成に失敗しました');
  });
}
function printSheetImage(){
  if (typeof html2canvas === 'undefined') { alert('画像化ライブラリの読み込みに失敗しました。通信環境を確認してください。'); return; }
  const el = document.querySelector('#ho-sheet-wrap .ho-doc');
  if (!el) { alert('シートが読み込まれていません'); return; }
  const btn = document.getElementById('ho-print-btn');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = '生成中…';
  const reset = () => { btn.disabled = false; btn.textContent = orig; };
  html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then((canvas) => {
    const dataUrl = canvas.toDataURL('image/png');
    document.getElementById('ho-print-frame')?.remove();
    const f = document.createElement('iframe');
    f.id = 'ho-print-frame';
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(f);
    const doc = f.contentDocument;
    doc.open();
    doc.write('<!DOCTYPE html><html><head><title>引き継ぎシート</title><style>@page{size:A4 landscape;margin:8mm}html,body{margin:0;padding:0}img{display:block;width:100%;height:auto}</style></head><body><img src="'+dataUrl+'"></body></html>');
    doc.close();
    const img = doc.querySelector('img');
    const doPrint = () => { f.contentWindow.focus(); f.contentWindow.print(); reset(); };
    if (img.complete) doPrint(); else img.onload = doPrint;
  }).catch(() => {
    reset();
    alert('画像の生成に失敗しました');
  });
}
document.getElementById('ho-copy-btn').addEventListener('click', copySheetImage);
document.getElementById('ho-print-btn').addEventListener('click', printSheetImage);
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

// ===== リミット（何時までにやるべきタスク）=====
async function loadLimits(){
  if (!H.date){ H.limits = []; renderLimitBtn(); return; }
  try {
    const data = await api('GET', '/'+H.division+'/'+H.date+'/limits');
    H.limits = data.limits || [];
  } catch(e){ H.limits = []; }
  renderLimitBtn();
  if (document.getElementById('ho-limit-overlay')?.classList.contains('show')) renderLimitList();
}
function renderLimitBtn(){
  const btn = document.getElementById('ho-limit-btn');
  if (!btn) return;
  btn.textContent = H.limits.length ? ('⏰ リミット ('+H.limits.length+')') : '⏰ リミット';
}
function renderLimitList(){
  const listEl = document.getElementById('ho-limit-list');
  if (!H.limits.length){
    listEl.innerHTML = '<div class="ho-limit-empty">設定中のリミットはありません</div>';
  } else {
    listEl.innerHTML = H.limits.map(l =>
      '<div class="ho-limit-row"><span class="ho-limit-time">'+esc(l.limit_time)+'</span>'+
      '<span class="ho-limit-task">'+esc(l.task)+'</span>'+
      (EDITABLE ? '<button type="button" class="ho-limit-del" data-id="'+l.id+'">取消</button>' : '') +
      '</div>'
    ).join('');
    if (EDITABLE){
      listEl.querySelectorAll('.ho-limit-del').forEach(b => b.addEventListener('click', () => deleteLimit(parseInt(b.dataset.id, 10))));
    }
  }
}
function openLimitModal(){
  document.getElementById('ho-limit-form-wrap').style.display = EDITABLE ? '' : 'none';
  renderLimitList();
  document.getElementById('ho-limit-overlay').classList.add('show');
}
function closeLimitModal(){
  document.getElementById('ho-limit-overlay').classList.remove('show');
}
function addDaysToDate(dateStr, days){
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
async function createLimit(){
  const taskEl = document.getElementById('ho-limit-task-inp');
  const timeEl = document.getElementById('ho-limit-time-inp');
  const daysEl = document.getElementById('ho-limit-days-inp');
  const task = taskEl.value.trim();
  const limitTime = timeEl.value;
  const days = parseInt(daysEl.value, 10) || 0;
  if (!task){ toast('タスク内容を入力してください', 2000); return; }
  if (!limitTime){ toast('時刻を選択してください', 2000); return; }
  const targetDate = addDaysToDate(H.date, days);
  try {
    await api('POST', '/'+H.division+'/'+targetDate+'/limits', { task: task, limit_time: limitTime });
    taskEl.value = ''; timeEl.value = ''; daysEl.value = '0';
    if (targetDate === H.date) { await loadLimits(); renderLimitList(); }
    toast(days > 0 ? (targetDate+' のリミットを設定しました') : 'リミットを設定しました');
  } catch(e){ toast('エラー: '+e.message, 2500); }
}
async function deleteLimit(id){
  if (!confirm('このリミットを取り消しますか？')) return;
  try {
    await api('DELETE', '/'+H.division+'/'+H.date+'/limits/'+id);
    await loadLimits();
    renderLimitList();
  } catch(e){ toast('エラー: '+e.message, 2500); }
}
document.getElementById('ho-limit-close').addEventListener('click', closeLimitModal);
document.getElementById('ho-limit-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'ho-limit-overlay') closeLimitModal();
});
document.getElementById('ho-limit-add-btn').addEventListener('click', createLimit);

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
    H.updatedAt = data.version ?? (data.sheet?.updated_at || null);
    H.customContent = data.customContent || [];
    renderSheet(data.sheet, date);
    hideStaleBanner();
  } catch(e){ toast('読み込みエラー: '+e.message, 3000); }
}

// ===== 他端末での更新検知（ポーリング）=====
// 開いているシートの「最終更新」を定期的に問い合わせ、自分が知っている値と違えば
// （＝他の端末が保存した、もしくは自分がこのタブで保存した直後ではない変化があれば）赤いバナーを出す。
// 自分自身の保存はsaveField()がH.updatedAtを都度更新するため、誤検知しない。
function showStaleBanner(){
  document.getElementById('ho-stale-banner').classList.add('show');
}
function hideStaleBanner(){
  document.getElementById('ho-stale-banner').classList.remove('show');
}
async function checkStaleVersion(){
  if (!H.date) return;
  const division = H.division, date = H.date;
  try {
    const data = await api('GET', '/'+division+'/'+date+'/version');
    if (division !== H.division || date !== H.date) return; // 問い合わせ中に別シートへ切り替えていたら無視
    if (data.version && data.version !== H.updatedAt) showStaleBanner();
    else hideStaleBanner();
  } catch(e) { /* 通信エラー時は次回ポーリングに委ねる */ }
}
async function reloadStaleSheet(){
  hideStaleBanner();
  await flushPendingSaves(); // 自分の未保存の入力を消さないよう、読み込み直す前に先に保存する
  await loadSheet(H.date);
  toast('最新の内容に更新しました');
}
document.getElementById('ho-stale-banner').addEventListener('click', reloadStaleSheet);

// ===== 表示セクション（右カラム）のHTML構築 =====
// 特別枠5項目（当欠/事故車/点検/車両異常/乗務希望）は既存の入力補助を保つため
// idやフィールド名を固定のまま、ラベル文言と高さだけH.sectionsの設定値に差し替える。
function buildSpecialSectionHtml(s, sheet, ro, ce){
  const px = HEIGHT_PX[s.height_size] || 120;
  const lbl = esc(s.label);
  const style = ' style="min-height:'+px+'px"';
  switch(s.section_key){
    case 'toka':
      return '<div class="ho-sec ho-toka"'+style+'><div class="ho-lbl">'+lbl+'</div><textarea class="ho-ta" id="ho-toka-c"'+ro+'>'+esc(sheet?.toka_content||'')+'</textarea></div>';
    case 'jiko':
      return '<div class="ho-sec ho-jiko"'+style+'><div class="ho-lbl red">'+lbl+'</div><div class="ho-ce" id="ho-jiko-c" contenteditable="'+ce+'">'+safeHtml(sheet?.jiko_content)+'</div></div>';
    case 'tenken':
      return '<div class="ho-sec ho-tenken"'+style+'><div class="ho-lbl">'+lbl+'</div><div class="ho-ce" id="ho-tenken-c" contenteditable="'+ce+'">'+safeHtml(sheet?.tenken_content)+'</div></div>';
    case 'joshu':
      return '<div class="ho-sec ho-joshu"'+style+'><div class="ho-lbl">'+lbl+'</div><div class="ho-ce" id="ho-joshu-c" contenteditable="'+ce+'">'+safeHtml(sheet?.joshu_content)+'</div></div>';
    case 'jomu':
      return '<div class="ho-sec ho-jomu"'+style+'><div class="ho-lbl">'+lbl+'</div><textarea class="ho-ta" id="ho-jomu-c"'+ro+'>'+esc(sheet?.jomu_content||'')+'</textarea></div>';
    default:
      return '';
  }
}
// カスタム枠（自由追加した素のテキスト欄、入力補助なし）
function buildCustomSectionHtml(s, ro, customMap){
  const px = HEIGHT_PX[s.height_size] || 120;
  const val = customMap.get(s.id) || '';
  return '<div class="ho-sec ho-custom" style="min-height:'+px+'px"><div class="ho-lbl">'+esc(s.label)+'</div><textarea class="ho-ta" id="ho-custom-'+s.id+'"'+ro+'>'+esc(val)+'</textarea></div>';
}
function buildRightColumnHtml(sheet, ro, ce){
  const customMap = new Map((H.customContent||[]).map(cc => [cc.sectionId, cc.content]));
  return (H.sections||[]).filter(s => s.is_active).map(s =>
    s.kind === 'special' ? buildSpecialSectionHtml(s, sheet, ro, ce) : buildCustomSectionHtml(s, ro, customMap)
  ).join('');
}
// 特別枠のwiring（入力補助のアタッチ）。既存の挙動をsection_keyごとに保持する。
function wireSpecialSection(s){
  const id = SPECIAL_DOM_ID[s.section_key];
  const el = document.getElementById(id);
  if (!el) return;
  const field = FIELD_BY_ID[id];
  if (s.section_key === 'toka'){
    attachNameSuggest(el, field, {
      onInput: recalcJisseki,
      skipIfDone: (text) => /[+\\-](0\\.5|1\\.0)(\\s|$)/.test(text),
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
          autoGrowTa(ta);
          scheduleSave('toka_content');
          recalcJisseki();
        });
      },
    });
    attachHankaku(el);
    attachAutoGrow(el);
  } else if (s.section_key === 'jomu'){
    attachNameSuggest(el, field);
    attachHankaku(el);
    attachAutoGrow(el);
  } else {
    // jiko / tenken / joshu（contenteditable）
    el.addEventListener('input', () => scheduleSave(field));
    attachHankaku(el);
    if (s.section_key === 'tenken' || s.section_key === 'joshu') attachCarSuggest(el, field);
  }
}
// カスタム枠のwiring（素のテキスト欄、サジェスト等なし）
function wireCustomSection(s){
  const el = document.getElementById('ho-custom-'+s.id);
  if (!el) return;
  el.addEventListener('input', () => scheduleSave('section_'+s.id));
  attachHankaku(el);
  attachAutoGrow(el);
}
function wireRightColumnSections(){
  (H.sections||[]).filter(s => s.is_active).forEach(s => {
    if (s.kind === 'special') wireSpecialSection(s);
    else wireCustomSection(s);
  });
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
        '<button type="button" class="ho-limit-btn" id="ho-limit-btn">⏰ リミット</button>' +
        (EDITABLE ? '<button class="ho-del-btn" id="ho-del-btn" title="このシートを削除">🗑</button>' : '') +
      '</div>' +
      '<div class="ho-sec ho-main"><div class="ho-ce" id="ho-main-c" contenteditable="'+ce+'">'+safeHtml(sheet?.main_content)+'</div></div>' +
    '</div>' +
    '<div class="ho-divider"></div>' +
    '<div class="ho-col-right">' + buildRightColumnHtml(sheet, ro, ce) + '</div>' +
    '</div></div>';

  document.getElementById('ho-limit-btn')?.addEventListener('click', openLimitModal);
  loadLimits();

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
    const mainEl = document.getElementById('ho-main-c');
    if (mainEl){
      mainEl.addEventListener('input', () => scheduleSave('main_content'));
      attachHankaku(mainEl);
    }
    wireRightColumnSections();
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
// 'section_<id>'はカスタムセクション（自由追加した素のテキスト欄）の内容取得
function fieldValue(field){
  if (field.startsWith('section_')){
    return document.getElementById('ho-custom-'+field.slice(8))?.value || '';
  }
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
// 'section_<id>'はカスタムセクション専用エンドポイントへ保存する。
async function saveField(field, division, date, value){
  if (!date) return;
  const dot = document.getElementById('ho-save-dot');
  try {
    const res = field.startsWith('section_')
      ? await api('PATCH', '/'+division+'/'+date+'/section-content/'+field.slice(8), { value })
      : await api('PATCH', '/'+division+'/'+date+'/field', { field, value });
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
loadSections().then(() => { loadFontSizes(); loadDates(); });
// 終日開きっぱなし運用が前提の画面のため、タブが非表示の間はポーリングを止めて復帰時に即チェックする（メモリ・通信量対策）
let _staleInterval = null;
function startStalePolling(){
  if (_staleInterval) return;
  _staleInterval = setInterval(checkStaleVersion, 15000);
}
function stopStalePolling(){
  if (_staleInterval) { clearInterval(_staleInterval); _staleInterval = null; }
}
startStalePolling();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopStalePolling(); }
  else { checkStaleVersion(); startStalePolling(); }
});
})();
</script>
`;
}
