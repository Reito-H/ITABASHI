// 星専用 引き継ぎシート画面（/handover/hoshi）
// 板橋1〜4課のシート（handover_sheet.ts）とは別ページ・別データ。このページだけ新しいデザインにしている。
// 左列＝日次の引き継ぎ本文 / 右列＝時系列ToDo ＋ 星のシフト・予定メモの縦型カレンダー。
import { safeJson } from './layout';
import { ADMIN_PATH } from '../config';

// タイトル行右側（layout()のheaderExtra）の課切り替え。今は「星」を開いている状態で、
// ドロップダウンから板橋1〜4課（/handover?d=N）へ移動できる。
export function handoverHoshiHeaderTabs(): string {
  return `<div class="hs-hdr-tabs" id="hs-tabs"></div>`;
}

export function handoverHoshiPage(editable: boolean): string {
  return `
<style>
.desktop-header h1{line-height:24px;margin:0;}
.desktop-header{min-height:0;}
#hs-root,#hs-pop,#hs-toast{
  --hs-bg:#f4f5fa; --hs-card:#ffffff; --hs-ink:#0f172a; --hs-sub:#64748b; --hs-faint:#94a3b8;
  --hs-line:#e7e9f2; --hs-line2:#f0f2f8; --hs-accent:#4f46e5; --hs-accent-soft:#eef0ff; --hs-gold:#f5c451;
  --hs-red:#e11d48; --hs-blue:#2563eb; --hs-green:#059669;
  --hs-radius:18px; --hs-shadow:0 1px 2px rgba(15,23,42,.04),0 8px 28px rgba(15,23,42,.06);
}
#hs-root,#hs-pop{
  font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;color:var(--hs-ink);
}
#hs-root{margin:-16px;padding:0 0 28px;background:var(--hs-bg);min-height:calc(100vh - 60px);}
#hs-pop *{box-sizing:border-box;}
#hs-root *,#hs-root *::before,#hs-root *::after{box-sizing:border-box;}

/* ===== 課切り替え（ヘッダー右） ===== */
.hs-hdr-tabs{display:flex;align-items:center;height:24px;}
.hs-tab-wrap{position:relative;}
.hs-tab-cur{height:24px;display:inline-flex;align-items:center;gap:5px;padding:0 12px;border-radius:12px;border:none;
  background:linear-gradient(135deg,#1d2b64,#4f46e5);color:#fff;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;}
.hs-tab-cur svg{color:var(--hs-gold,#f5c451);}
.hs-tab-arrow{font-size:9px;opacity:.8;}
.hs-tab-menu{display:none;position:absolute;top:30px;left:0;min-width:110px;z-index:600;background:rgba(255,255,255,.92);
  backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid #e5e7eb;border-radius:12px;
  box-shadow:0 12px 32px rgba(15,23,42,.18);overflow:hidden;}
.hs-tab-menu.open{display:block;}
.hs-tab-opt{display:block;padding:8px 14px;font-size:12px;font-weight:700;color:#374151;text-decoration:none;white-space:nowrap;}
.hs-tab-opt:hover{background:#f3f4f6;}

/* ===== ヒーロー（夜空） ===== */
.hs-hero{position:relative;overflow:hidden;color:#fff;padding:22px 24px 58px;
  background:
    radial-gradient(1.2px 1.2px at 12% 30%,rgba(255,255,255,.9),transparent 60%),
    radial-gradient(1px 1px at 28% 72%,rgba(255,255,255,.7),transparent 60%),
    radial-gradient(1.4px 1.4px at 46% 18%,rgba(255,255,255,.85),transparent 60%),
    radial-gradient(1px 1px at 63% 55%,rgba(255,255,255,.6),transparent 60%),
    radial-gradient(1.6px 1.6px at 78% 24%,rgba(255,236,170,.95),transparent 60%),
    radial-gradient(1px 1px at 90% 66%,rgba(255,255,255,.7),transparent 60%),
    radial-gradient(700px 300px at 85% -20%,rgba(129,140,248,.45),transparent 60%),
    linear-gradient(135deg,#0b1430 0%,#18245a 55%,#2f3488 100%);}
.hs-hero-row{display:flex;align-items:center;gap:16px;flex-wrap:wrap;}
.hs-hero-mark{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;
  background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);color:var(--hs-gold);}
.hs-hero-title{font-size:22px;font-weight:800;letter-spacing:.04em;line-height:1.2;}
.hs-hero-sub{font-size:12px;color:rgba(255,255,255,.65);margin-top:3px;}
.hs-hero-tabs-m{display:none;margin-left:auto;}
@media (max-width:768px){ .hs-hero-tabs-m{display:block;} }
.hs-dates{display:flex;gap:6px;align-items:center;margin-top:18px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none;}
.hs-dates::-webkit-scrollbar{display:none;}
.hs-date{flex-shrink:0;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:rgba(255,255,255,.85);
  border-radius:999px;padding:6px 13px;font-size:12px;font-weight:700;cursor:pointer;transition:background .15s,color .15s;}
.hs-date:hover{background:rgba(255,255,255,.16);}
.hs-date.active{background:#fff;color:#18245a;border-color:#fff;}
.hs-date .hs-dot-today{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--hs-gold);margin-left:6px;vertical-align:middle;}
.hs-date-add{flex-shrink:0;border:1px dashed rgba(255,255,255,.4);background:transparent;color:#fff;border-radius:999px;
  padding:6px 13px;font-size:12px;font-weight:700;cursor:pointer;}
.hs-date-add:hover{background:rgba(255,255,255,.1);}

/* ===== 本体グリッド ===== */
.hs-grid{display:grid;gap:16px;padding:0 20px;margin-top:-40px;position:relative;
  grid-template-columns:minmax(0,1fr) 310px 400px;align-items:start;}
@media (max-width:1360px){ .hs-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);} .hs-card-main{grid-column:1 / -1;} }
@media (max-width:820px){ .hs-grid{grid-template-columns:minmax(0,1fr);padding:0 12px;} }
.hs-card{background:var(--hs-card);border-radius:var(--hs-radius);box-shadow:var(--hs-shadow);border:1px solid rgba(15,23,42,.04);
  display:flex;flex-direction:column;min-width:0;}
.hs-card-head{display:flex;align-items:center;gap:10px;padding:14px 16px 12px;border-bottom:1px solid var(--hs-line2);flex-wrap:wrap;}
.hs-card-title{font-size:14px;font-weight:800;letter-spacing:.02em;display:flex;align-items:center;gap:7px;}
.hs-card-title .hs-ic{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;background:var(--hs-accent-soft);color:var(--hs-accent);}
.hs-badge{font-size:11px;font-weight:800;color:var(--hs-accent);background:var(--hs-accent-soft);border-radius:999px;padding:2px 8px;}
.hs-spacer{flex:1;}
.hs-ghost{border:1px solid var(--hs-line);background:#fff;color:var(--hs-sub);border-radius:10px;padding:5px 10px;font-size:12px;
  font-weight:700;cursor:pointer;transition:background .15s,color .15s,border-color .15s;}
.hs-ghost:hover{background:#f8fafc;color:var(--hs-ink);}
.hs-ghost.on{background:var(--hs-accent-soft);border-color:#c7cbff;color:var(--hs-accent);}

/* ===== 左：引き継ぎ本文 ===== */
.hs-main-date{font-size:22px;font-weight:800;letter-spacing:.02em;}
.hs-chip-today{font-size:11px;font-weight:800;background:#fff7e0;color:#9a6b00;border:1px solid #f5d98a;border-radius:999px;padding:2px 9px;}
.hs-save{font-size:11px;color:var(--hs-faint);display:flex;align-items:center;gap:6px;}
.hs-save i{width:7px;height:7px;border-radius:50%;background:#cbd5e1;display:inline-block;}
.hs-save.saving i{background:#f59e0b;}
.hs-save.saved i{background:var(--hs-green);}
.hs-save.err i{background:var(--hs-red);}
.hs-save.err{color:var(--hs-red);}
.hs-tools{display:flex;gap:4px;background:#f6f7fb;border-radius:10px;padding:3px;}
.hs-tool{border:none;background:transparent;border-radius:7px;width:30px;height:26px;font-size:13px;font-weight:800;cursor:pointer;color:var(--hs-ink);}
.hs-tool:hover{background:#fff;box-shadow:0 1px 3px rgba(15,23,42,.1);}
.hs-tool.k{color:#111827;} .hs-tool.r{color:var(--hs-red);} .hs-tool.b{color:var(--hs-blue);}
.hs-del{border:none;background:transparent;color:var(--hs-faint);font-size:12px;font-weight:700;cursor:pointer;padding:5px 6px;border-radius:8px;}
.hs-del:hover{color:var(--hs-red);background:#fff1f2;}
.hs-editor{flex:1;min-height:600px;padding:18px 20px 28px;font-size:15px;line-height:1.75;outline:none;word-break:break-word;}
.hs-editor:empty::before{content:attr(data-ph);color:var(--hs-faint);}
.hs-editor[contenteditable="true"]:focus{background:linear-gradient(#fff,#fff) padding-box;}
.hs-empty{padding:60px 20px;text-align:center;color:var(--hs-sub);font-size:13px;}
.hs-empty b{display:block;font-size:16px;color:var(--hs-ink);margin-bottom:6px;}
.hs-primary{border:none;background:linear-gradient(135deg,#4f46e5,#6d5cf0);color:#fff;border-radius:12px;padding:10px 18px;
  font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 6px 16px rgba(79,70,229,.28);margin-top:16px;}
.hs-primary:hover{filter:brightness(1.06);}
.hs-primary:disabled{opacity:.5;cursor:default;box-shadow:none;}

/* ===== 右①：時系列ToDo ===== */
.hs-todo-add{padding:12px 14px;border-bottom:1px solid var(--hs-line2);display:flex;flex-direction:column;gap:8px;}
.hs-todo-add-row{display:flex;gap:6px;}
.hs-in{border:1px solid var(--hs-line);background:#fafbfe;border-radius:10px;padding:7px 9px;font-size:13px;font-family:inherit;color:var(--hs-ink);
  outline:none;min-width:0;transition:border-color .15s,background .15s,box-shadow .15s;}
.hs-in:focus{border-color:#a5b4fc;background:#fff;box-shadow:0 0 0 3px rgba(99,102,241,.12);}
.hs-todo-add .hs-in.date{flex:1.3;} .hs-todo-add .hs-in.time{flex:1;} .hs-todo-add .hs-in.text{flex:1;}
.hs-add-btn{border:none;background:var(--hs-accent);color:#fff;border-radius:10px;padding:0 14px;font-size:13px;font-weight:800;cursor:pointer;flex-shrink:0;}
.hs-add-btn:disabled{opacity:.45;cursor:default;}
.hs-todo-list{padding:6px 10px 14px;max-height:calc(100vh - 230px);min-height:200px;overflow-y:auto;}
.hs-tgroup{margin-top:10px;}
.hs-tgroup-h{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800;color:var(--hs-sub);padding:4px 6px;letter-spacing:.03em;}
.hs-tgroup-h.today{color:var(--hs-accent);}
.hs-tgroup-h.past{color:var(--hs-red);}
.hs-tgroup-h .ln{flex:1;height:1px;background:var(--hs-line2);}
.hs-titem{position:relative;display:flex;align-items:flex-start;gap:8px;padding:7px 6px 7px 22px;border-radius:12px;transition:background .12s;}
.hs-titem:hover{background:#f8f9fd;}
.hs-titem::before{content:'';position:absolute;left:10px;top:0;bottom:0;width:2px;background:var(--hs-line2);}
.hs-titem::after{content:'';position:absolute;left:6px;top:14px;width:10px;height:10px;border-radius:50%;background:#fff;border:2px solid #c7cbff;}
.hs-titem.overdue::after{border-color:#fda4af;}
.hs-titem.done::after{background:var(--hs-green);border-color:var(--hs-green);}
.hs-check{flex-shrink:0;width:18px;height:18px;margin-top:4px;border-radius:6px;border:1.5px solid #cbd5e1;background:#fff;cursor:pointer;
  display:grid;place-items:center;color:#fff;padding:0;}
.hs-check.on{background:var(--hs-green);border-color:var(--hs-green);}
.hs-titem-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.hs-titem-meta{display:flex;gap:4px;align-items:center;}
.hs-tin{border:1px solid transparent;background:transparent;border-radius:7px;padding:2px 5px;font-family:inherit;color:inherit;outline:none;min-width:0;}
.hs-tin:hover{border-color:var(--hs-line);}
.hs-tin:focus{border-color:#a5b4fc;background:#fff;}
.hs-tin.time{font-size:12px;font-weight:800;color:var(--hs-accent);width:76px;}
.hs-tin.time::-webkit-calendar-picker-indicator{display:none;}
.hs-tin.date{font-size:11px;color:var(--hs-sub);width:124px;opacity:0;transition:opacity .15s;}
.hs-titem:hover .hs-tin.date,.hs-tin.date:focus{opacity:1;}
.hs-titem.overdue .hs-tin.time{color:var(--hs-red);}
.hs-tin.text{font-size:13.5px;width:100%;line-height:1.5;}
.hs-titem.done .hs-tin.text{color:var(--hs-faint);text-decoration:line-through;}
.hs-titem.done .hs-tin.time{color:var(--hs-faint);}
.hs-tdel{flex-shrink:0;border:none;background:transparent;color:transparent;font-size:15px;cursor:pointer;padding:2px 4px;border-radius:6px;line-height:1;}
.hs-titem:hover .hs-tdel{color:var(--hs-faint);}
.hs-tdel:hover{color:var(--hs-red) !important;background:#fff1f2;}
.hs-todo-empty{padding:30px 10px;text-align:center;color:var(--hs-faint);font-size:12.5px;}

/* ===== 右②③：シフト＋予定メモの縦型カレンダー ===== */
.hs-mnav{display:flex;align-items:center;gap:4px;}
.hs-mnav button{width:28px;height:28px;border-radius:9px;border:1px solid var(--hs-line);background:#fff;cursor:pointer;color:var(--hs-sub);font-size:14px;font-weight:800;}
.hs-mnav button:hover{background:#f8fafc;color:var(--hs-ink);}
.hs-mnav .lbl{font-size:13px;font-weight:800;min-width:66px;text-align:center;}
.hs-cal-range{font-size:11px;color:var(--hs-faint);width:100%;margin-top:-4px;}
.hs-cal-head{display:grid;grid-template-columns:62px 64px 32px 1fr;gap:0;padding:8px 12px 6px;font-size:10.5px;font-weight:800;color:var(--hs-faint);
  letter-spacing:.06em;border-bottom:1px solid var(--hs-line2);}
.hs-cal{max-height:calc(100vh - 260px);min-height:200px;overflow-y:auto;padding:4px 8px 10px;}
.hs-crow{display:grid;grid-template-columns:62px 64px 32px 1fr;align-items:center;min-height:38px;border-radius:11px;padding:0 4px;position:relative;}
.hs-crow + .hs-crow{border-top:1px solid var(--hs-line2);}
.hs-crow.wk-start{border-top:1px solid #dfe3f0;}
.hs-crow:hover{background:#fafbff;}
.hs-crow.today{background:var(--hs-accent-soft);border-top-color:transparent;}
.hs-crow.today + .hs-crow{border-top-color:transparent;}
.hs-crow.today::before{content:'';position:absolute;left:-4px;top:8px;bottom:8px;width:3px;border-radius:3px;background:var(--hs-accent);}
.hs-cdate{display:flex;align-items:baseline;gap:5px;padding-left:6px;}
.hs-cdate .d{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums;min-width:20px;text-align:right;}
.hs-cdate .w{font-size:11px;font-weight:700;color:var(--hs-sub);}
.hs-cdate .d.md{font-size:13px;}
.hs-crow.sat .d,.hs-crow.sat .w{color:var(--hs-blue);}
.hs-crow.sun .d,.hs-crow.sun .w{color:var(--hs-red);}
.hs-cdate.has-sheet{cursor:pointer;}
.hs-cdate.has-sheet .d{text-decoration:underline;text-decoration-color:#c7cbff;text-underline-offset:3px;}
.hs-crow.sel .hs-cdate .d{color:var(--hs-accent);}
.hs-shift{position:relative;justify-self:center;min-width:42px;height:26px;padding:0 8px;border-radius:8px;border:1px solid rgba(15,23,42,.1);
  font-size:13px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;background:#fff;color:var(--hs-ink);
  transition:transform .1s,box-shadow .15s;}
.hs-shift:hover{box-shadow:0 2px 8px rgba(15,23,42,.12);}
.hs-shift:active{transform:scale(.96);}
.hs-shift.empty{color:var(--hs-faint);border-style:dashed;font-weight:600;}
.hs-shift .lk{position:absolute;top:-5px;right:-5px;width:14px;height:14px;border-radius:50%;background:#475569;color:#fff;display:grid;place-items:center;border:1.5px solid #fff;}
.hs-shift[disabled]{cursor:default;}
.hs-skew{display:inline-block;transform:skewX(-14deg);}
.hs-memo{width:100%;border:1px solid transparent;background:transparent;border-radius:9px;padding:6px 8px;font-size:13px;font-family:inherit;color:var(--hs-ink);outline:none;}
.hs-memo:hover{border-color:var(--hs-line);background:#fff;}
.hs-memo:focus{border-color:#a5b4fc;background:#fff;box-shadow:0 0 0 3px rgba(99,102,241,.12);}
.hs-memo::placeholder{color:transparent;}
.hs-crow:hover .hs-memo::placeholder{color:#cbd5e1;}
.hs-cal-foot{padding:10px 16px 14px;border-top:1px solid var(--hs-line2);font-size:11px;color:var(--hs-sub);display:flex;gap:8px;align-items:flex-start;line-height:1.5;}
.hs-cal-foot i{flex-shrink:0;width:8px;height:8px;margin-top:4px;border-radius:50%;background:#f59e0b;}

/* 出勤時間の◯マーク（未登録＝白抜き / 登録済み＝塗り）とホバー表示 */
.hs-wt{justify-self:center;width:20px;height:20px;border-radius:50%;border:2px solid #cbd5e1;background:#fff;padding:0;cursor:pointer;
  transition:transform .1s,border-color .15s,background .15s,box-shadow .15s;}
.hs-wt:hover{border-color:var(--hs-accent);box-shadow:0 0 0 4px rgba(99,102,241,.12);}
.hs-wt:active{transform:scale(.9);}
.hs-wt.on{background:var(--hs-accent);border-color:var(--hs-accent);box-shadow:inset 0 0 0 3px #fff;}
.hs-wt[disabled]{cursor:default;}
.hs-wt[disabled]:not(.on){visibility:hidden;}
#hs-tip{position:fixed;z-index:950;display:none;pointer-events:none;background:#0f172a;color:#fff;border-radius:10px;padding:6px 10px;
  font-size:12px;font-weight:700;white-space:nowrap;box-shadow:0 8px 20px rgba(15,23,42,.25);}
#hs-tip.show{display:block;}
#hs-tip b{font-size:15px;margin-left:6px;font-variant-numeric:tabular-nums;}
#hs-tip::after{content:'';position:absolute;left:50%;bottom:-5px;margin-left:-5px;border:5px solid transparent;border-bottom:0;border-top-color:#0f172a;}
.hs-pop-time{display:flex;gap:6px;align-items:center;}
.hs-pop-time select.hs-in{flex:1;font-size:16px;font-weight:800;padding:6px 8px;cursor:pointer;}
.hs-pop-time .sep{font-size:16px;font-weight:800;color:var(--hs-sub);}

/* シフト選択ポップオーバー */
#hs-pop{position:fixed;z-index:900;display:none;width:240px;background:rgba(255,255,255,.96);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
  border:1px solid #e5e7eb;border-radius:16px;box-shadow:0 18px 48px rgba(15,23,42,.22);padding:12px;}
#hs-pop.show{display:block;}
.hs-pop-h{font-size:12px;font-weight:800;margin-bottom:2px;}
.hs-pop-base{font-size:11px;color:var(--hs-sub);margin-bottom:10px;}
.hs-pop-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:5px;}
.hs-pop-code{height:32px;padding:0 4px;white-space:nowrap;border-radius:9px;border:1px solid rgba(15,23,42,.1);font-size:13px;font-weight:800;cursor:pointer;}
.hs-pop-code:hover{box-shadow:0 2px 8px rgba(15,23,42,.15);}
.hs-pop-code.cur{outline:2px solid var(--hs-accent);outline-offset:1px;}
.hs-pop-row{display:flex;gap:6px;margin-top:10px;}
.hs-pop-row .hs-in{flex:1;padding:6px 8px;font-size:12px;}
.hs-pop-act{display:flex;flex-direction:column;gap:6px;margin-top:10px;}
.hs-pop-act button{border:1px solid var(--hs-line);background:#fff;border-radius:10px;padding:7px;font-size:12px;font-weight:700;cursor:pointer;color:var(--hs-ink);}
.hs-pop-act button:hover{background:#f8fafc;}
.hs-pop-act .reset{color:#b45309;border-color:#fde68a;background:#fffbeb;}

/* トースト・バナー */
#hs-toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(20px);background:#0f172a;color:#fff;font-size:13px;font-weight:700;
  padding:10px 18px;border-radius:12px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;z-index:1000;}
#hs-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}
#hs-auth{display:none;position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:1001;background:#b91c1c;color:#fff;border:none;
  border-radius:12px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer;max-width:92vw;box-shadow:0 8px 24px rgba(0,0,0,.25);}
#hs-auth.show{display:block;}
</style>

<div id="hs-root">
  <div class="hs-hero">
    <div class="hs-hero-row">
      <div class="hs-hero-mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg></div>
      <div>
        <div class="hs-hero-title">星 引き継ぎシート</div>
        <div class="hs-hero-sub" id="hs-hero-sub">引き継ぎ・ToDo・シフトと予定をひとつの画面で</div>
      </div>
      <div class="hs-hero-tabs-m" id="hs-tabs-m"></div>
    </div>
    <div class="hs-dates" id="hs-dates"></div>
  </div>

  <div class="hs-grid">
    <section class="hs-card hs-card-main" id="hs-main"></section>

    <section class="hs-card" id="hs-todo">
      <div class="hs-card-head">
        <div class="hs-card-title"><span class="hs-ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>ToDo</div>
        <span class="hs-badge" id="hs-todo-count">0</span>
        <span class="hs-spacer"></span>
        <button type="button" class="hs-ghost" id="hs-todo-showdone">完了も表示</button>
      </div>
      ${editable ? `<div class="hs-todo-add">
        <div class="hs-todo-add-row">
          <input type="date" class="hs-in date" id="hs-todo-date">
          <input type="time" class="hs-in time" id="hs-todo-time">
        </div>
        <div class="hs-todo-add-row">
          <input type="text" class="hs-in text" id="hs-todo-text" placeholder="やること（Enterで追加）" maxlength="300">
          <button type="button" class="hs-add-btn" id="hs-todo-add" disabled>追加</button>
        </div>
      </div>` : ''}
      <div class="hs-todo-list" id="hs-todo-list"></div>
    </section>

    <section class="hs-card" id="hs-calcard">
      <div class="hs-card-head">
        <div class="hs-card-title"><span class="hs-ic"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg></span>シフト・予定</div>
        <span class="hs-spacer"></span>
        <div class="hs-mnav">
          <button type="button" id="hs-mprev" aria-label="前の月度">‹</button>
          <span class="lbl" id="hs-mlbl"></span>
          <button type="button" id="hs-mnext" aria-label="次の月度">›</button>
        </div>
        <button type="button" class="hs-ghost" id="hs-pdf" title="表示中の月度をPDFで出力">PDF</button>
        <div class="hs-cal-range" id="hs-mrange"></div>
      </div>
      <div class="hs-cal-head"><span style="padding-left:10px">日付</span><span style="text-align:center">シフト</span><span style="text-align:center">出勤</span><span style="padding-left:8px">予定メモ</span></div>
      <div class="hs-cal" id="hs-cal"></div>
      <div class="hs-cal-foot"><i></i><span id="hs-cal-note">シフトを変更すると班長シフトにもそのまま反映されます。鍵マークの日は班長シフトで確定済みのため、ここでは変更できません。</span></div>
    </section>
  </div>
</div>

<div id="hs-pop"></div>
<div id="hs-tip"></div>
<div id="hs-toast"></div>
<button type="button" id="hs-auth">ログインの有効期限が切れました。クリックで開く別タブでログインし直してください（入力内容はこのタブに残っています）</button>

<script>
(function(){
const ADMIN = ${safeJson(ADMIN_PATH)};
const API = ADMIN + '/api/handover-hoshi';
const EDITABLE = ${editable ? 'true' : 'false'};
const S = {
  dates: [], date: null, saveTimer: null, pendingSave: false, savingNow: false,
  todos: [], showDone: false, cal: null, calYm: null, popDate: null,
};

function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
const UNSAFE_HTML_TAGS = 'script,iframe,frame,frameset,object,embed,applet,base,meta,link,svg,math,template,noscript';
const URL_ATTRS = ['href','src','action','formaction','xlink:href','background','poster','data'];
function safeHtml(s){
  if (!s) return '';
  const doc = new DOMParser().parseFromString('<body>' + s + '</body>', 'text/html');
  doc.body.querySelectorAll(UNSAFE_HTML_TAGS).forEach(el => el.remove());
  doc.body.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(a => {
      const name = a.name.toLowerCase();
      const val = a.value.replace(/[\\s\\u0000-\\u001f]/g, '').toLowerCase();
      const badUrl = URL_ATTRS.includes(name) && (val.startsWith('javascript:') || val.startsWith('vbscript:') || (val.startsWith('data:') && !val.startsWith('data:image/')));
      if (name.startsWith('on') || name === 'srcdoc' || badUrl) el.removeAttribute(a.name);
    });
  });
  return doc.body.innerHTML;
}
function today(){
  const n = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return n.getFullYear() + '-' + String(n.getMonth()+1).padStart(2,'0') + '-' + String(n.getDate()).padStart(2,'0');
}
const WD = ['日','月','火','水','木','金','土'];
function dow(s){ return new Date(s + 'T00:00:00+09:00').getDay(); }
function fmtMd(s){ const p = s.split('-'); return parseInt(p[1],10) + '/' + parseInt(p[2],10) + '(' + WD[dow(s)] + ')'; }
function addDays(s, n){
  const p = s.split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1]-1, p[2] + n));
  return d.toISOString().slice(0, 10);
}
let toastTimer;
function toast(msg){
  const el = document.getElementById('hs-toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
async function api(method, path, body){
  const opts = { method: method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  let res;
  try { res = await fetch(API + path, opts); }
  catch(e){ throw new Error('通信エラー（ネットワークを確認してください）'); }
  // セッション切れ時はログイン画面(HTML)が200で返ることがあるため、JSON以外はエラー扱いにする
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')){
    const err = new Error('ログインの有効期限が切れています');
    err.authExpired = true;
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'エラー');
  document.getElementById('hs-auth').classList.remove('show');
  return data;
}
function handleErr(e){
  if (e && e.authExpired){ document.getElementById('hs-auth').classList.add('show'); return; }
  toast(e && e.message ? e.message : 'エラーが発生しました');
}
document.getElementById('hs-auth').addEventListener('click', () => { window.open(ADMIN + '/login', '_blank'); });

// ===== 課切り替え =====
function renderTabs(){
  const star = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';
  const html = '<div class="hs-tab-wrap"><button type="button" class="hs-tab-cur">' + star + '星<span class="hs-tab-arrow">▾</span></button>' +
    '<div class="hs-tab-menu">' + [1,2,3,4].map(d => '<a class="hs-tab-opt" href="' + ADMIN + '/handover?d=' + d + '">板橋' + d + '課</a>').join('') + '</div></div>';
  ['hs-tabs','hs-tabs-m'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    const menu = el.querySelector('.hs-tab-menu');
    el.querySelector('.hs-tab-cur').addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.classList.contains('open');
      document.querySelectorAll('.hs-tab-menu.open').forEach(m => m.classList.remove('open'));
      if (!open) menu.classList.add('open');
    });
  });
}
document.addEventListener('click', () => document.querySelectorAll('.hs-tab-menu.open').forEach(m => m.classList.remove('open')));

// ===== 左列：日付バー＋引き継ぎ本文 =====
async function loadDates(){
  const data = await api('GET', '/dates');
  S.dates = data.dates || [];
}
function renderDates(){
  const el = document.getElementById('hs-dates');
  const t = today();
  const list = S.dates.slice(0, 14).reverse();
  el.innerHTML = list.map(d =>
    '<button type="button" class="hs-date' + (d === S.date ? ' active' : '') + '" data-d="' + d + '">' + fmtMd(d) +
    (d === t ? '<span class="hs-dot-today"></span>' : '') + '</button>'
  ).join('') + (EDITABLE && S.dates.length ? '<button type="button" class="hs-date-add" id="hs-next">＋ 翌日のシート</button>' : '')
    // 今日のシートがまだ無い場合は「今日のシートを作成」も出す（直近の本文を引き継ぐ）
    + (EDITABLE && S.dates.length && S.dates[0] < t ? '<button type="button" class="hs-date-add" id="hs-today">＋ 今日のシートを作成</button>' : '');
  el.querySelectorAll('.hs-date').forEach(b => b.addEventListener('click', () => openSheet(b.dataset.d)));
  document.getElementById('hs-next')?.addEventListener('click', createNext);
  document.getElementById('hs-today')?.addEventListener('click', createToday);
  const act = el.querySelector('.hs-date.active');
  if (act) act.scrollIntoView({ block: 'nearest', inline: 'center' });
}
async function createNext(){
  const base = S.dates[0];
  if (!base) return;
  await flushSave();
  try {
    const r = await api('POST', '/sheet/' + base + '/next');
    await loadDates();
    await openSheet(r.nextDate);
    toast(fmtMd(r.nextDate) + ' のシートを作成しました');
  } catch(e){ handleErr(e); }
}
async function createToday(){
  const t = today();
  try {
    // 直近のシートがあれば、その本文を引き継いで今日のシートを作る
    let content = '';
    if (S.dates[0]){
      const prev = await api('GET', '/sheet/' + S.dates[0]);
      content = prev.sheet ? prev.sheet.main_content : '';
    }
    await api('PUT', '/sheet/' + t, { main_content: content });
    await loadDates();
    await openSheet(t);
  } catch(e){ handleErr(e); }
}
async function openSheet(date){
  if (S.date && S.date !== date) await flushSave();
  S.date = date;
  renderDates();
  renderCalendar();
  const main = document.getElementById('hs-main');
  let sheet = null;
  try { sheet = (await api('GET', '/sheet/' + date)).sheet; } catch(e){ handleErr(e); }
  const t = today();
  main.innerHTML =
    '<div class="hs-card-head">' +
      '<span class="hs-main-date">' + fmtMd(date) + '</span>' +
      (date === t ? '<span class="hs-chip-today">今日</span>' : '') +
      '<span class="hs-save' + (sheet && sheet.updated_at ? ' saved' : '') + '" id="hs-save"><i></i><span id="hs-save-txt">' + (sheet && sheet.updated_at ? savedLabel(sheet.updated_at, sheet.updated_by) : '') + '</span></span>' +
      '<span class="hs-spacer"></span>' +
      (EDITABLE ? '<div class="hs-tools">' +
        '<button type="button" class="hs-tool k" data-c="#111827" title="黒">黒</button>' +
        '<button type="button" class="hs-tool r" data-c="#e11d48" title="赤">赤</button>' +
        '<button type="button" class="hs-tool b" data-c="#2563eb" title="青">青</button>' +
        '<button type="button" class="hs-tool" data-cmd="bold" title="太字">B</button>' +
      '</div>' +
      '<button type="button" class="hs-del" id="hs-del">削除</button>' : '') +
    '</div>' +
    '<div class="hs-editor" id="hs-editor" contenteditable="' + (EDITABLE ? 'true' : 'false') + '" data-ph="引き継ぎ事項を入力">' + safeHtml(sheet ? sheet.main_content : '') + '</div>';
  if (!EDITABLE) return;
  const ed = document.getElementById('hs-editor');
  ed.addEventListener('input', scheduleSave);
  main.querySelectorAll('.hs-tool').forEach(b => {
    b.addEventListener('mousedown', (e) => e.preventDefault()); // 選択範囲を保ったまま装飾する
    b.addEventListener('click', () => {
      if (b.dataset.cmd) document.execCommand(b.dataset.cmd);
      else { document.execCommand('styleWithCSS', false, true); document.execCommand('foreColor', false, b.dataset.c); }
      scheduleSave();
    });
  });
  document.getElementById('hs-del').addEventListener('click', deleteSheet);
}
function renderEmptyMain(){
  const main = document.getElementById('hs-main');
  main.innerHTML = '<div class="hs-empty"><b>まだシートがありません</b>' +
    (EDITABLE ? '今日の引き継ぎシートを作成して始めましょう。<br><button type="button" class="hs-primary" id="hs-create">今日のシートを作成</button>' : '') + '</div>';
  document.getElementById('hs-create')?.addEventListener('click', createToday);
}
function savedLabel(at, by){
  const hm = (at || '').slice(11, 16);
  return '保存済み ' + hm + (by ? '・' + esc(by) : '');
}
function setSave(cls, txt){
  const el = document.getElementById('hs-save');
  if (!el) return;
  el.className = 'hs-save ' + cls;
  document.getElementById('hs-save-txt').innerHTML = txt;
}
function scheduleSave(){
  S.pendingSave = true;
  setSave('saving', '入力中…');
  clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(doSave, 800);
}
async function doSave(){
  if (!S.pendingSave || S.savingNow) return;
  const ed = document.getElementById('hs-editor');
  if (!ed || !S.date) return;
  S.savingNow = true; S.pendingSave = false;
  const date = S.date;
  setSave('saving', '保存中…');
  try {
    const r = await api('PUT', '/sheet/' + date, { main_content: ed.innerHTML });
    if (date === S.date) setSave('saved', savedLabel(r.updated_at, ''));
  } catch(e){
    S.pendingSave = true;
    setSave('err', '未保存（自動で再試行します）');
    handleErr(e);
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(doSave, 5000);
  } finally {
    S.savingNow = false;
    if (S.pendingSave && date === S.date && !document.getElementById('hs-save')?.classList.contains('err')){
      clearTimeout(S.saveTimer); S.saveTimer = setTimeout(doSave, 300);
    }
  }
}
async function flushSave(){
  clearTimeout(S.saveTimer);
  if (S.pendingSave) await doSave();
}
window.addEventListener('beforeunload', (e) => { if (S.pendingSave){ e.preventDefault(); e.returnValue = ''; } });
async function deleteSheet(){
  if (!confirm(fmtMd(S.date) + ' のシートを削除しますか？')) return;
  clearTimeout(S.saveTimer); S.pendingSave = false;
  try {
    await api('DELETE', '/sheet/' + S.date);
    await loadDates();
    S.date = null;
    if (S.dates.length) await openSheet(S.dates.includes(today()) ? today() : S.dates[0]);
    else { renderDates(); renderEmptyMain(); renderCalendar(); }
    toast('削除しました');
  } catch(e){ handleErr(e); }
}

// ===== 右①：時系列ToDo =====
async function loadTodos(){
  try { S.todos = (await api('GET', '/todos')).todos || []; } catch(e){ handleErr(e); }
  renderTodos();
}
function todoSortKey(t){
  // 日付なしは末尾、同じ日の中では時刻なし（終日）を先頭に
  return (t.due_date || '9999-99-99') + ' ' + (t.due_time || '00:00') + ' ' + String(t.id).padStart(8, '0');
}
function renderTodos(){
  const t = today();
  const list = S.todos.filter(x => S.showDone || !x.done).sort((a, b) => todoSortKey(a) < todoSortKey(b) ? -1 : 1);
  document.getElementById('hs-todo-count').textContent = String(S.todos.filter(x => !x.done).length);
  const box = document.getElementById('hs-todo-list');
  if (!list.length){
    box.innerHTML = '<div class="hs-todo-empty">' + (S.showDone ? 'ToDoはありません' : '未完了のToDoはありません') + '</div>';
    return;
  }
  let html = '', curKey = null;
  for (const x of list){
    const key = x.due_date || '';
    if (key !== curKey){
      curKey = key;
      const cls = key === t ? ' today' : (key && key < t ? ' past' : '');
      const label = !key ? '日付なし' : fmtMd(key) + (key === t ? '　今日' : key === addDays(t, 1) ? '　明日' : '');
      html += '<div class="hs-tgroup-h' + cls + '">' + label + '<span class="ln"></span></div>';
    }
    const overdue = !x.done && x.due_date && (x.due_date < t || (x.due_date === t && x.due_time && x.due_time < nowHm()));
    const ro = EDITABLE ? '' : ' readonly';
    html += '<div class="hs-titem' + (x.done ? ' done' : '') + (overdue ? ' overdue' : '') + '" data-id="' + x.id + '">' +
      '<button type="button" class="hs-check' + (x.done ? ' on' : '') + '"' + (EDITABLE ? '' : ' disabled') + ' aria-label="完了">' +
        (x.done ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' : '') + '</button>' +
      '<div class="hs-titem-body">' +
        '<div class="hs-titem-meta">' +
          '<input type="time" class="hs-tin time" data-f="due_time" value="' + esc(x.due_time || '') + '"' + ro + '>' +
          '<input type="date" class="hs-tin date" data-f="due_date" value="' + esc(x.due_date || '') + '"' + ro + '>' +
        '</div>' +
        '<input type="text" class="hs-tin text" data-f="content" maxlength="300" value="' + esc(x.content) + '"' + ro + '>' +
      '</div>' +
      (EDITABLE ? '<button type="button" class="hs-tdel" aria-label="削除" title="削除">×</button>' : '') +
    '</div>';
  }
  box.innerHTML = html;
  if (!EDITABLE) return;
  box.querySelectorAll('.hs-titem').forEach(row => {
    const id = parseInt(row.dataset.id, 10);
    const item = S.todos.find(x => x.id === id);
    row.querySelector('.hs-check').addEventListener('click', () => patchTodo(id, { done: !item.done }, true));
    row.querySelectorAll('.hs-tin').forEach(inp => {
      inp.addEventListener('change', () => {
        const f = inp.dataset.f;
        const v = inp.value;
        if (f === 'content' && !v.trim()){ inp.value = item.content; return; }
        if ((item[f] || '') === v) return;
        const o = {}; o[f] = v || null;
        // 日付・時刻を変えたら並び順が変わるので描画し直す
        patchTodo(id, o, f !== 'content');
      });
      if (inp.dataset.f === 'content') inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) inp.blur(); });
    });
    row.querySelector('.hs-tdel').addEventListener('click', async () => {
      if (!confirm('「' + item.content + '」を削除しますか？')) return;
      try { await api('DELETE', '/todos/' + id); S.todos = S.todos.filter(x => x.id !== id); renderTodos(); }
      catch(e){ handleErr(e); }
    });
  });
}
function nowHm(){
  const n = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  return String(n.getHours()).padStart(2,'0') + ':' + String(n.getMinutes()).padStart(2,'0');
}
async function patchTodo(id, patch, rerender){
  try {
    await api('PATCH', '/todos/' + id, patch);
    const item = S.todos.find(x => x.id === id);
    if (item){ Object.keys(patch).forEach(k => { item[k] = k === 'done' ? (patch[k] ? 1 : 0) : patch[k]; }); }
    if (rerender) renderTodos();
  } catch(e){ handleErr(e); loadTodos(); }
}
function wireTodoAdd(){
  if (!EDITABLE) return;
  const dateInp = document.getElementById('hs-todo-date');
  const timeInp = document.getElementById('hs-todo-time');
  const textInp = document.getElementById('hs-todo-text');
  const btn = document.getElementById('hs-todo-add');
  dateInp.value = today();
  textInp.addEventListener('input', () => { btn.disabled = !textInp.value.trim(); });
  const add = async () => {
    const content = textInp.value.trim();
    if (!content) return;
    btn.disabled = true;
    try {
      await api('POST', '/todos', { due_date: dateInp.value || null, due_time: timeInp.value || null, content: content });
      textInp.value = ''; timeInp.value = '';
      await loadTodos();
      textInp.focus();
    } catch(e){ handleErr(e); btn.disabled = false; }
  };
  btn.addEventListener('click', add);
  textInp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) add(); });
}
document.getElementById('hs-todo-showdone').addEventListener('click', (e) => {
  S.showDone = !S.showDone;
  e.currentTarget.classList.toggle('on', S.showDone);
  renderTodos();
});

// ===== 右②③：シフト＋予定メモの縦型カレンダー =====
async function loadCalendar(ym){
  const q = ym ? '?year=' + ym.year + '&month=' + ym.month : '';
  try {
    S.cal = await api('GET', '/calendar' + q);
    S.calYm = { year: S.cal.year, month: S.cal.month };
  } catch(e){ handleErr(e); return; }
  renderCalendar(true);
}
function textColorFor(bg){
  const m = /^#?([0-9a-f]{6})$/i.exec(bg || '');
  if (!m) return '#0f172a';
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#0f172a' : '#ffffff';
}
function typeColor(code){
  const t = S.cal && S.cal.types.find(x => x.code === code);
  return t ? t.color : '#ffffff';
}
function canShift(d){ return EDITABLE && S.cal.canEditShift && S.cal.hasMember && !d.locked; }
const LOCK_SVG = '<span class="lk"><svg width="7" height="7" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z"/></svg></span>';
function renderCalendar(scrollToToday){
  if (!S.cal) return;
  document.getElementById('hs-mlbl').textContent = S.cal.month + '月度';
  document.getElementById('hs-mrange').textContent = fmtMd(S.cal.start) + ' 〜 ' + fmtMd(S.cal.end);
  const t = today();
  const sheetSet = new Set(S.dates);
  const box = document.getElementById('hs-cal');
  box.innerHTML = S.cal.days.map((d, i) => {
    const w = dow(d.date);
    const code = d.code;
    // 班長シフト画面と同じ表示ルール: セル色があれば最優先（記号なしの色マス＝早日勤）、
    // 希望休の反映は赤文字、斜め直は記号を斜めにする
    const bg = d.cl || (code ? typeColor(code) : '#ffffff');
    const colorOnly = !code && !!d.cl;
    const fg = d.ws ? '#dc2626' : (code ? textColorFor(bg) : '');
    const day = parseInt(d.date.slice(8, 10), 10);
    const showMonth = i === 0 || day === 1;
    const cls = 'hs-crow' + (w === 6 ? ' sat' : w === 0 ? ' sun' : '') + (d.date === t ? ' today' : '') +
      (d.date === S.date ? ' sel' : '') + (w === 1 && i > 0 ? ' wk-start' : '');
    const title = (d.dg && code ? '斜め直 14:00〜翌8:00　' : colorOnly ? '早日勤（色マス）　' : '') + (d.ws ? '希望休の反映　' : '') +
      (d.locked ? '班長シフトで確定済み（変更不可）' : '押して変更（班長シフトに反映）');
    return '<div class="' + cls + '" data-date="' + d.date + '">' +
      '<div class="hs-cdate' + (sheetSet.has(d.date) ? ' has-sheet' : '') + '"' + (sheetSet.has(d.date) ? ' title="この日の引き継ぎシートを開く"' : '') + '>' +
        // 月度の初日と各月1日は「10/1」のように月も添える
        '<span class="d' + (showMonth ? ' md' : '') + '">' + (showMonth ? parseInt(d.date.slice(5, 7), 10) + '/' : '') + day + '</span><span class="w">' + WD[w] + '</span></div>' +
      '<div style="text-align:center"><button type="button" class="hs-shift' + (code || colorOnly ? '' : ' empty') + '"' +
        ' style="background:' + esc(bg) + ';color:' + fg + '" title="' + esc(title) + '"' + (canShift(d) ? '' : ' disabled') + '>' +
        shiftLabelHtml(d) + (d.locked ? LOCK_SVG : '') + '</button></div>' +
      '<button type="button" class="hs-wt' + (d.workTime ? ' on' : '') + '"' + (EDITABLE ? '' : ' disabled') +
        ' aria-label="' + (d.workTime ? '出勤 ' + esc(d.workTime) : '出勤時間を登録') + '"></button>' +
      '<input type="text" class="hs-memo" maxlength="200" value="' + esc(d.memo) + '" placeholder="予定メモ"' + (EDITABLE ? '' : ' readonly') + '>' +
    '</div>';
  }).join('');
  box.querySelectorAll('.hs-crow').forEach(row => {
    const date = row.dataset.date;
    const day = S.cal.days.find(x => x.date === date);
    const dc = row.querySelector('.hs-cdate.has-sheet');
    if (dc) dc.addEventListener('click', () => openSheet(date));
    const wt = row.querySelector('.hs-wt');
    wt.addEventListener('mouseenter', () => showTip(wt, day));
    wt.addEventListener('mouseleave', hideTip);
    if (!EDITABLE) return;
    wt.addEventListener('click', (e) => { e.stopPropagation(); hideTip(); openTimePop(day, wt); });
    if (canShift(day)) row.querySelector('.hs-shift').addEventListener('click', (e) => { e.stopPropagation(); openPop(day, e.currentTarget); });
    const memo = row.querySelector('.hs-memo');
    memo.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) memo.blur(); });
    memo.addEventListener('change', async () => {
      try { await api('PUT', '/memo/' + date, { content: memo.value }); day.memo = memo.value; toast('予定メモを保存しました'); }
      catch(e){ handleErr(e); }
    });
  });
  // 変更できない理由がある場合は注記を差し替える
  const note = document.getElementById('hs-cal-note');
  if (!S.cal.hasMember) note.textContent = '班長シフトにこの月度の「星」の行がまだ無いため、シフトは変更できません（班長シフトでこの月度を開くと作成されます）。';
  else if (EDITABLE && !S.cal.canEditShift) note.textContent = '班長シフトの編集権限が無いため、シフトは表示のみです。';
  else note.textContent = 'シフトを変更すると班長シフトにもそのまま反映されます。鍵マークの日は班長シフトで確定済みのため、ここでは変更できません。';
  if (scrollToToday){
    const tr = box.querySelector('.hs-crow.today');
    if (tr) box.scrollTop = Math.max(0, tr.offsetTop - box.offsetTop - 80);
  }
}
// 表示中の月度のシフト・予定表をPDFで保存（LINEのその他機能からも同じPDFを出力できる）
document.getElementById('hs-pdf').addEventListener('click', async (e) => {
  if (!S.calYm) return;
  const btn = e.currentTarget;
  btn.disabled = true; btn.textContent = '作成中…';
  try {
    const res = await fetch(API + '/pdf?year=' + S.calYm.year + '&month=' + S.calYm.month);
    const ct = res.headers.get('content-type') || '';
    if (!res.ok || !ct.includes('application/pdf')) throw new Error(res.redirected ? 'ログインの有効期限が切れています' : 'PDFの作成に失敗しました');
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = '星_シフト予定表_' + S.calYm.year + '年' + S.calYm.month + '月度.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch(err){ toast(err.message); }
  finally { btn.disabled = false; btn.textContent = 'PDF'; }
});
document.getElementById('hs-mprev').addEventListener('click', () => {
  if (!S.calYm) return;
  const y = S.calYm.month === 1 ? S.calYm.year - 1 : S.calYm.year;
  const m = S.calYm.month === 1 ? 12 : S.calYm.month - 1;
  loadCalendar({ year: y, month: m });
});
document.getElementById('hs-mnext').addEventListener('click', () => {
  if (!S.calYm) return;
  const y = S.calYm.month === 12 ? S.calYm.year + 1 : S.calYm.year;
  const m = S.calYm.month === 12 ? 1 : S.calYm.month + 1;
  loadCalendar({ year: y, month: m });
});

// シフト選択ポップオーバー（選んだ記号は班長シフトにそのまま保存される）
function closePop(){ const p = document.getElementById('hs-pop'); p.classList.remove('show'); S.popDate = null; }
function placePop(pop, anchor){
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.min(Math.max(8, left), window.innerWidth - w - 8);
  let top = r.bottom + 8;
  if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 8);
  pop.style.left = left + 'px'; pop.style.top = top + 'px';
}

// 出勤時間：◯にカーソルを合わせると時刻をポップアップ表示、クリックで登録・変更
function showTip(anchor, day){
  const tip = document.getElementById('hs-tip');
  tip.innerHTML = day.workTime ? fmtMd(day.date) + ' 出勤<b>' + esc(day.workTime) + '</b>' : (EDITABLE ? 'クリックで出勤時間を登録' : '出勤時間 未登録');
  tip.classList.add('show');
  const r = anchor.getBoundingClientRect();
  const left = Math.min(Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2), window.innerWidth - tip.offsetWidth - 8);
  tip.style.left = left + 'px';
  tip.style.top = Math.max(8, r.top - tip.offsetHeight - 9) + 'px';
}
function hideTip(){ document.getElementById('hs-tip').classList.remove('show'); }
function hourOptions(cur){
  const h = cur ? cur.slice(0, 2) : '';
  let html = '<option value=""' + (h ? '' : ' selected') + '>時</option>';
  for (let i = 0; i < 24; i++){
    const v = String(i).padStart(2, '0');
    html += '<option value="' + v + '"' + (v === h ? ' selected' : '') + '>' + i + '時</option>';
  }
  return html;
}
function minuteOptions(cur){
  const m = cur ? cur.slice(3, 5) : '00';
  const list = [];
  for (let i = 0; i < 60; i += 5) list.push(String(i).padStart(2, '0'));
  if (!list.includes(m)) list.push(m);
  list.sort();
  return list.map(v => '<option value="' + v + '"' + (v === m ? ' selected' : '') + '>' + v + '分</option>').join('');
}
function openTimePop(day, anchor){
  const pop = document.getElementById('hs-pop');
  const key = 'wt:' + day.date;
  if (S.popDate === key){ closePop(); return; }
  S.popDate = key;
  pop.innerHTML =
    '<div class="hs-pop-h">' + fmtMd(day.date) + ' の出勤時間</div>' +
    // ブラウザ標準の時刻入力（type=time）はキーボード入力が値に入らないことがあり「登録」が効かなかったため、
    // 時・分をプルダウンで選ぶ方式にしている（分は5分刻み。既存値が刻みに無い場合はその値も候補に入れる）
    '<div class="hs-pop-time">' +
      '<select class="hs-in" id="hs-wt-h">' + hourOptions(day.workTime) + '</select><span class="sep">:</span>' +
      '<select class="hs-in" id="hs-wt-m">' + minuteOptions(day.workTime) + '</select>' +
      '<button type="button" class="hs-add-btn" id="hs-wt-ok" style="height:36px">登録</button></div>' +
    (day.workTime ? '<div class="hs-pop-act"><button type="button" id="hs-wt-del">登録を消す</button></div>' : '');
  pop.classList.add('show');
  placePop(pop, anchor);
  const hSel = document.getElementById('hs-wt-h');
  const mSel = document.getElementById('hs-wt-m');
  hSel.focus();
  const save = async (time) => {
    try {
      await api('PUT', '/work-time/' + day.date, { time: time });
      day.workTime = time;
      closePop(); renderCalendar();
      toast(time ? '出勤時間を登録しました' : '出勤時間を消しました');
    } catch(e){ handleErr(e); }
  };
  document.getElementById('hs-wt-ok').addEventListener('click', () => {
    if (!hSel.value){ toast('時を選んでください'); hSel.focus(); return; }
    save(hSel.value + ':' + mSel.value);
  });
  document.getElementById('hs-wt-del')?.addEventListener('click', () => save(''));
}
function shiftLabelHtml(d){
  if (!d.code) return d.cl ? '&nbsp;' : '－';
  // 和文フォントは合成イタリックが効かないため、班長シフト画面と同じくskewXで斜めにする
  return d.dg ? '<span class="hs-skew">' + esc(d.code) + '</span>' : esc(d.code);
}
function openPop(day, anchor){
  const pop = document.getElementById('hs-pop');
  if (S.popDate === day.date){ closePop(); return; }
  S.popDate = day.date;
  const cur = day.code;
  pop.innerHTML =
    '<div class="hs-pop-h">' + fmtMd(day.date) + ' のシフト</div>' +
    '<div class="hs-pop-base">選ぶと班長シフトにも反映されます</div>' +
    '<div class="hs-pop-grid">' + S.cal.types.map(t => {
      const btn = (dg) => '<button type="button" class="hs-pop-code' + (t.code === cur && !!day.dg === dg ? ' cur' : '') + '" data-code="' + esc(t.code) + '" data-dg="' + (dg ? 1 : 0) + '"' +
        ' title="' + esc(dg ? '斜め直 14:00〜翌8:00' : t.label) + '"' +
        ' style="background:' + esc(t.color) + ';color:' + textColorFor(t.color) + '">' + (dg ? '<span class="hs-skew">' + esc(t.code) + '</span>' : esc(t.code)) + '</button>';
      // 「直」の隣に斜め直のボタンを並べる
      return t.code === '直' ? btn(false) + btn(true) : btn(false);
    }).join('') + '</div>' +
    '<div class="hs-pop-row"><input type="text" class="hs-in" id="hs-pop-free" maxlength="10" placeholder="その他（自由入力）"><button type="button" class="hs-add-btn" id="hs-pop-free-ok">設定</button></div>' +
    '<div class="hs-pop-act">' +
      '<button type="button" id="hs-pop-blank">空欄にする</button>' +
    '</div>';
  pop.classList.add('show');
  placePop(pop, anchor);
  const set = (code, dg) => saveShift(day, code, !!dg);
  pop.querySelectorAll('.hs-pop-code').forEach(b => b.addEventListener('click', () => set(b.dataset.code, b.dataset.dg === '1')));
  document.getElementById('hs-pop-blank').addEventListener('click', () => set(''));
  const free = document.getElementById('hs-pop-free');
  document.getElementById('hs-pop-free-ok').addEventListener('click', () => { if (free.value.trim()) set(free.value.trim()); });
  free.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing && free.value.trim()) set(free.value.trim()); });
}
async function saveShift(day, code, diagonal){
  // 斜めは「直」のときだけ。直以外を選んだら斜めは外れる（サーバー側も同じルール）
  const dg = code === '直' && diagonal;
  if (code === day.code && dg === !!day.dg){ closePop(); return; }
  try {
    await api('PUT', '/shift/' + day.date, { code: code, diagonal: dg });
    day.code = code; day.dg = dg;
    closePop(); renderCalendar();
    toast('班長シフトに反映しました');
  } catch(e){ handleErr(e); closePop(); }
}
document.addEventListener('click', (e) => {
  const pop = document.getElementById('hs-pop');
  if (pop.classList.contains('show') && !pop.contains(e.target)) closePop();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
window.addEventListener('resize', closePop);
document.getElementById('hs-cal').addEventListener('scroll', () => { closePop(); hideTip(); });

// ===== 初期化 =====
(async function init(){
  renderTabs();
  wireTodoAdd();
  try { await loadDates(); } catch(e){ handleErr(e); }
  const t = today();
  loadTodos();
  await loadCalendar(null);
  if (S.dates.includes(t)) await openSheet(t);
  else if (S.dates.length) await openSheet(S.dates[0]);
  else { renderDates(); renderEmptyMain(); }
})();
})();
</script>`;
}
