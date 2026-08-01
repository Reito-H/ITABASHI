import { Hono } from 'hono';
import { layout } from '../html/layout';
import { ADMIN_PATH } from '../config';
import type { Env } from '../auth';

const app = new Hono<{ Bindings: Env; Variables: { adminId: number } }>();


function inspectionPage(adminPath: string): string {
  return `
<style>
.ins-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;padding:12px 16px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.08);margin-bottom:14px}
.ins-controls label{font-size:12px;color:#555;font-weight:600}
.ins-controls select{padding:5px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;font-family:inherit;background:#fff;cursor:pointer}
.dept-tabs{display:flex;gap:4px}
.dept-btn{padding:5px 16px;border:1px solid #c5d5e8;border-radius:4px;cursor:pointer;font-size:13px;font-family:inherit;background:#fff;color:#1a4a8a}
.dept-btn:hover{background:#e8f0fa}
.dept-btn.active{background:#1a4a8a;color:#fff;border-color:#1a4a8a;font-weight:600}
.ins-legend{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding:8px 14px;background:#fff;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.07);font-size:12px;align-items:center}
.ins-legend-dot{width:12px;height:12px;border-radius:2px;flex-shrink:0;display:inline-block}
.ins-dept-title{font-size:15px;font-weight:700;color:#1a4a8a;margin-bottom:8px}
.ins-table-wrap{overflow-x:auto;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.1)}
.ins-table{border-collapse:collapse;width:100%;background:#fff;min-width:500px}
.ins-table th{background:#d4e4f7;padding:9px 6px;font-size:13px;text-align:center;border:1px solid #b0c8e4;font-weight:700;color:#1a3a6a}
.ins-table td{border:1px solid #d4dde8;vertical-align:top;padding:0}
.ins-date-cell{text-align:center;font-size:14px;font-weight:700;padding:6px 4px;background:#fafbfc;color:#333}
.ins-date-cell.sat{background:#ddeeff;color:#004488}
.ins-date-cell.sun{background:#ffdddd;color:#880000}
.ins-han-cell{min-height:34px;position:relative;padding:4px 28px 4px 4px;cursor:pointer}
.ins-han-cell.ins-han-l{padding:4px 4px 4px 28px}
.ins-han-cell:hover{background:#f8faff}
.vtags{display:flex;flex-wrap:wrap;gap:3px;min-height:22px}
.vtags-r{justify-content:flex-end}
.vtag{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:3px;font-size:13px;font-weight:700;cursor:pointer;line-height:1.3}
.vtag:hover{opacity:.75}
.vt-inspect{color:#000;background:#f4f4f4;border:1px solid #bbb}
.vt-shaken {color:#c00;background:#fff0f0;border:1px solid #c00}
.vt-bomb   {color:#0055bb;background:#eef3ff;border:1px solid #0055bb}
.vt-sub    {color:#077;background:#efffef;border:1px solid #077}
.vt-recall {color:#000;background:#fff;border:2px solid #333}
.vt-time{font-size:10px;color:#777;font-weight:400}
.ins-add-btn{position:absolute;top:50%;right:4px;transform:translateY(-50%);background:#3366aa;color:#fff;border:none;border-radius:50%;width:20px;height:20px;font-size:14px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:.7}
.ins-add-btn.ins-add-l{right:auto;left:4px}
.ins-add-btn:hover{opacity:1}
.ins-modal-overlay{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:200}
.ins-modal-box{background:#fff;border-radius:10px;padding:24px;width:380px;max-width:95vw;box-shadow:0 8px 30px rgba(0,0,0,.2)}
.ins-modal-title{font-size:15px;font-weight:700;margin-bottom:16px;color:#1a3a6a;border-bottom:1px solid #e0e8f4;padding-bottom:10px}
.ins-field{margin-bottom:14px}
.ins-field label{display:block;font-size:12px;color:#555;font-weight:600;margin-bottom:6px}
.ins-field input{width:100%;padding:8px 10px;border:1px solid #ccc;border-radius:5px;font-size:15px;font-family:inherit}
.ins-field input:focus{outline:none;border-color:#5b9ef4}
.type-btns{display:flex;flex-wrap:wrap;gap:6px}
.type-btn{padding:6px 11px;border:2px solid #ddd;border-radius:4px;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit;background:#fff}
.type-btn.sel{box-shadow:0 0 0 3px rgba(60,120,220,.3)}
.tb-inspect{color:#000;border-color:#aaa}.tb-inspect.sel{background:#f4f4f4;border-color:#666}
.tb-shaken {color:#c00;border-color:#c00}.tb-shaken.sel{background:#fff0f0}
.tb-bomb   {color:#0055bb;border-color:#0055bb}.tb-bomb.sel{background:#eef3ff}
.tb-sub    {color:#077;border-color:#077}.tb-sub.sel{background:#efffef}
.tb-recall {color:#000;border-color:#333;border-width:2px}.tb-recall.sel{background:#f8f8f8}
.ins-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;border-top:1px solid #eee;padding-top:14px}
.btn-p{padding:7px 18px;background:#1a4a8a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:inherit;font-weight:600}
.btn-s{padding:7px 18px;background:#eee;color:#444;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:13px;font-family:inherit}
.btn-d{padding:7px 18px;background:#dc3545;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px;font-family:inherit}
.btn-xl{padding:9px 22px;background:#28a745;color:#fff;border:none;border-radius:5px;cursor:pointer;font-size:14px;font-family:inherit;font-weight:700}
.ins-preview-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.ins-prev-dept{border:1px solid #dde8f4;border-radius:6px;padding:12px}
.ins-prev-dept h4{font-size:13px;font-weight:700;color:#1a4a8a;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #eee}
.ins-prev-row{display:flex;align-items:flex-start;gap:8px;margin-bottom:6px}
.ins-prev-lbl{font-size:11px;color:#777;min-width:60px;padding-top:2px;font-weight:600}
.ins-prev-tags{display:flex;flex-wrap:wrap;gap:3px}
.ins-nodata{color:#bbb;font-size:12px;padding:4px 0}
.ins-tab-bar{display:flex;gap:0;border-bottom:2px solid #d0dcea;margin-bottom:16px}
.ins-tab{padding:9px 20px;border:none;background:none;cursor:pointer;font-size:13px;font-family:inherit;color:#666;border-bottom:3px solid transparent;margin-bottom:-2px}
.ins-tab.active{color:#1a4a8a;border-bottom-color:#1a4a8a;font-weight:700}
.ins-panel{display:none}
.ins-panel.active{display:block}
.ins-data-tools{margin-top:14px;background:#fff;border-radius:8px;padding:10px 14px;box-shadow:0 1px 4px rgba(0,0,0,.08);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.btn-t{padding:5px 12px;border:1px solid #ccc;border-radius:4px;cursor:pointer;font-size:12px;font-family:inherit;background:#f8f8f8;color:#444}
.btn-t.red{border-color:#dc3545;color:#dc3545}
.ins-save-badge{font-size:12px;color:#28a745;margin-left:auto}
</style>

<div class="ins-tab-bar">
  <button class="ins-tab active" onclick="insShowTab('input')">月次入力（定期点検表）</button>
  <button class="ins-tab" onclick="insShowTab('output')">日次出力・過去データ（点検車検確認表）</button>
</div>

<!-- ===== 月次入力 ===== -->
<div id="ins-panel-input" class="ins-panel active">
  <div class="ins-controls">
    <label>年月：</label>
    <select id="ins-year-in" onchange="insOnYMChange()"></select>年
    <select id="ins-month-in" onchange="insOnYMChange()"></select>月
    <span style="color:#bbb">｜</span>
    <label>課：</label>
    <div class="dept-tabs">
      <button class="dept-btn active" onclick="insSelDept(1)" id="ins-dept-1">1課</button>
      <button class="dept-btn" onclick="insSelDept(2)" id="ins-dept-2">2課</button>
      <button class="dept-btn" onclick="insSelDept(3)" id="ins-dept-3">3課</button>
      <button class="dept-btn" onclick="insSelDept(4)" id="ins-dept-4">4課</button>
    </div>
    <span style="color:#bbb">｜</span>
    <button class="btn-p" onclick="insPhotoPick()">📷 写真からAI取込</button>
    <input type="file" id="ins-photo-file" accept="image/*" style="display:none" onchange="insPhotoSelected(this)">
    <button class="btn-p" onclick="insDownloadMonthImage(this)">🖼 画像で保存</button>
    <button class="btn-p" onclick="insDownloadMonthExcel(this)">📊 Excelで保存</button>
    <span id="ins-save-badge" class="ins-save-badge"></span>
  </div>

  <div class="ins-legend">
    <strong style="font-size:12px;color:#444">凡例：</strong>
    <span><span class="ins-legend-dot" style="background:#f4f4f4;border:1px solid #bbb"></span> 点検（黒）</span>
    <span><span class="ins-legend-dot" style="background:#fff0f0;border:1px solid #c00"></span> 車検（赤）</span>
    <span><span class="ins-legend-dot" style="background:#eef3ff;border:1px solid #0055bb"></span> ボンベ交換（青）</span>
    <span><span class="ins-legend-dot" style="background:#efffef;border:1px solid #077"></span> 代替（緑）</span>
    <span><span class="ins-legend-dot" style="background:#fff;border:2px solid #333"></span> リコール</span>
    <span style="font-size:11px;color:#999;margin-left:6px">※ 車番クリックで編集・削除、＋で追加</span>
  </div>

  <div class="ins-dept-title" id="ins-dept-title"></div>
  <div class="ins-table-wrap">
    <div id="ins-table-container"></div>
  </div>

  <div class="ins-data-tools">
    <label style="font-size:12px;color:#666;font-weight:600">この月・課のデータ：</label>
    <button class="btn-t red" onclick="insClearMonth()">🗑 全削除</button>
  </div>
</div>

<!-- ===== 日次出力 ===== -->
<div id="ins-panel-output" class="ins-panel">
  <div class="ins-controls">
    <label>出力日：</label>
    <select id="ins-year-out" onchange="insUpdateDays();insRenderCanvas()"></select>年
    <select id="ins-month-out" onchange="insUpdateDays();insRenderCanvas()"></select>月
    <select id="ins-day-out" onchange="insRenderCanvas()"></select>日
    <button class="btn-xl" onclick="insPrintImage()">🖨 印刷</button>
    <button class="btn-p" onclick="insCopyImage()">📋 クリップボードにコピー</button>
    <button class="btn-p" onclick="insDownloadImage()">💾 画像保存</button>
    <span id="ins-copy-badge" class="ins-save-badge"></span>
  </div>
  <div style="background:#fff;border-radius:8px;padding:16px;box-shadow:0 1px 4px rgba(0,0,0,.08);overflow-x:auto">
    <canvas id="ins-canvas" style="max-width:100%;height:auto;display:block;border:1px solid #e0e8f4;border-radius:4px"></canvas>
  </div>
</div>

<!-- モーダル -->
<div id="ins-modal" class="ins-modal-overlay" style="display:none" onclick="if(event.target===this)insCloseModal()">
  <div class="ins-modal-box">
    <div class="ins-modal-title" id="ins-modal-title">車両追加</div>
    <div class="ins-field">
      <label>車番</label>
      <input type="text" id="ins-vnum" placeholder="例: 5064" maxlength="10" onkeydown="if(event.key==='Enter')insSaveVehicle()">
    </div>
    <div class="ins-field">
      <label>種別</label>
      <div class="type-btns">
        <button class="type-btn tb-inspect sel" onclick="insSelType('inspect')">点検（黒）</button>
        <button class="type-btn tb-shaken"       onclick="insSelType('shaken')">車検（赤）</button>
        <button class="type-btn tb-bomb"          onclick="insSelType('bomb')">ボンベ（青）</button>
        <button class="type-btn tb-sub"           onclick="insSelType('sub')">代替（緑）</button>
        <button class="type-btn tb-recall"        onclick="insSelType('recall')">リコール</button>
      </div>
    </div>
    <div class="ins-field">
      <label>出庫時間（任意）</label>
      <input type="text" id="ins-vtime" placeholder="例: 8:00　ナイト　15:00　休車" maxlength="10">
    </div>
    <div class="ins-actions">
      <button class="btn-d" id="ins-btn-del" style="display:none" onclick="insDeleteVehicle()">削除</button>
      <button class="btn-s" onclick="insCloseModal()">キャンセル</button>
      <button class="btn-p" onclick="insSaveVehicle()">保存</button>
    </div>
  </div>
</div>

<!-- AI取込モーダル -->
<div id="ins-ai-modal" class="ins-modal-overlay" style="display:none" onclick="if(event.target===this&&!insAiBusy)insAiClose()">
  <div class="ins-modal-box" style="width:600px;max-height:88vh;overflow-y:auto">
    <div class="ins-modal-title">📷 写真からAI取込</div>
    <div id="ins-ai-body"></div>
  </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
<script>
const INS_PATH = '';

const IS = {
  year: new Date().getFullYear(),
  month: new Date().getMonth()+1,
  dept: 1,
  modal: {day:null,han:null,id:null},
  cache: {}  // {YYYYMM_ka: [{id,day,han,vehicle_num,type,dep_time},...]}
};
let insSelTypeCur = 'inspect';

// ===== 初期化 =====
(function insInit(){
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth()+1, d = now.getDate();
  ['ins-year-in','ins-year-out'].forEach(id=>{
    const el=document.getElementById(id);
    for(let i=y-1;i<=y+2;i++) el.add(new Option(i+'年',i));
    el.value=y;
  });
  ['ins-month-in','ins-month-out'].forEach(id=>{
    const el=document.getElementById(id);
    for(let i=1;i<=12;i++) el.add(new Option(i+'月',i));
    el.value=m;
  });
  insUpdateDays();
  const dayEl=document.getElementById('ins-day-out');
  dayEl.value=Math.min(d,parseInt(dayEl.options[dayEl.options.length-1].value));
  IS.year=y; IS.month=m;
  insRefreshTable();
})();

function insDIM(y,m){return new Date(y,m,0).getDate();}
function insUpdateDays(){
  const y=+document.getElementById('ins-year-out').value;
  const m=+document.getElementById('ins-month-out').value;
  const el=document.getElementById('ins-day-out');
  const cur=+el.value||1;
  el.innerHTML='';
  for(let d=1;d<=insDIM(y,m);d++) el.add(new Option(d+'日',d));
  el.value=Math.min(cur,insDIM(y,m));
}

// ===== タブ =====
function insShowTab(tab){
  ['input','output'].forEach(t=>{
    document.getElementById('ins-panel-'+t).classList.toggle('active',t===tab);
    document.querySelectorAll('.ins-tab').forEach((b,i)=>b.classList.toggle('active',i===(tab==='input'?0:1)));
  });
  if(tab==='output') insRenderCanvas();
}

// ===== 課選択 =====
function insSelDept(d){
  IS.dept=d;
  for(let i=1;i<=4;i++) document.getElementById('ins-dept-'+i).classList.toggle('active',i===d);
  insRefreshTable();
}

// ===== データ取得 =====
function insGetYM(){
  const y=+document.getElementById('ins-year-in').value;
  const m=+document.getElementById('ins-month-in').value;
  return String(y)+String(m).padStart(2,'0');
}
function insCacheKey(){return insGetYM()+'_'+IS.dept;}

async function insFetchData(ym, ka){
  const key=ym+'_'+ka;
  if(IS.cache[key]) return IS.cache[key];
  const res=await fetch(INS_PATH+'/api/inspection/schedule?ym='+ym+'&ka='+ka);
  IS.cache[key]=await res.json();
  return IS.cache[key];
}

function insGetDayVehicles(data,day){
  const h1=data.filter(r=>r.day===day&&r.han===1);
  const h2=data.filter(r=>r.day===day&&r.han===2);
  return {h1,h2};
}

// ===== テーブル描画 =====
function insOnYMChange(){
  IS.year=+document.getElementById('ins-year-in').value;
  IS.month=+document.getElementById('ins-month-in').value;
  insRefreshTable();
}

// 課(1-4)・班(1-2)から実際の班番号(1-8)を算出（1,2班=1課／3,4班=2課／5,6班=3課／7,8班=4課）
function insTeamNum(dept,han){return (dept-1)*2+han;}

async function insRefreshTable(){
  document.getElementById('ins-dept-title').textContent=IS.dept+'課　定期点検表（'+IS.month+'月）';
  const ym=insGetYM();
  const data=await insFetchData(ym,IS.dept);
  const days=insDIM(IS.year,IS.month);
  let html='<table class="ins-table"><colgroup><col style="width:44%"><col style="width:12%"><col style="width:44%"></colgroup><thead><tr><th>《'+insTeamNum(IS.dept,1)+'班》</th><th>日付</th><th>《'+insTeamNum(IS.dept,2)+'班》</th></tr></thead><tbody>';
  for(let day=1;day<=days;day++){
    const dow=new Date(IS.year,IS.month-1,day).getDay();
    const dc=dow===0?'sun':dow===6?'sat':'';
    const {h1,h2}=insGetDayVehicles(data,day);
    html+='<tr><td class="ins-han-cell ins-han-l"><div class="vtags vtags-r" id="ins-tags-'+day+'-1">'+insRenderTags(h1,day,1)+'</div><button class="ins-add-btn ins-add-l" onclick="insOpenModal('+day+',1)">＋</button></td><td class="ins-date-cell '+dc+'">'+day+'</td><td class="ins-han-cell"><div class="vtags" id="ins-tags-'+day+'-2">'+insRenderTags(h2,day,2)+'</div><button class="ins-add-btn" onclick="insOpenModal('+day+',2)">＋</button></td></tr>';
  }
  html+='</tbody></table>';
  document.getElementById('ins-table-container').innerHTML=html;
}

function insRenderTags(vehicles,day,han){
  return vehicles.map(v=>'<span class="vtag vt-'+v.type+'" onclick="insOpenModal('+day+','+han+','+v.id+')" title="'+v.type+'">'+insEsc(v.vehicle_num)+(v.dep_time?'<span class="vt-time">'+insEsc(v.dep_time)+'</span>':'')+'</span>').join('');
}

function insEsc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// ===== モーダル =====
function insOpenModal(day,han,id=null){
  IS.modal={day,han,id};
  const teamNum=insTeamNum(IS.dept,han);
  document.getElementById('ins-modal-title').textContent=id?day+'日 '+teamNum+'班 - 車両編集':day+'日 '+teamNum+'班 - 車両追加';
  document.getElementById('ins-btn-del').style.display=id?'':'none';
  let num='',type='inspect',time='';
  if(id){
    const ym=insGetYM();
    const v=IS.cache[ym+'_'+IS.dept]?.find(r=>r.id===id);
    if(v){num=v.vehicle_num;type=v.type;time=v.dep_time||'';}
  }
  document.getElementById('ins-vnum').value=num;
  document.getElementById('ins-vtime').value=time;
  insSelType(type);
  document.getElementById('ins-modal').style.display='flex';
  setTimeout(()=>document.getElementById('ins-vnum').focus(),50);
}
function insCloseModal(){document.getElementById('ins-modal').style.display='none';}
function insSelType(t){
  insSelTypeCur=t;
  document.querySelectorAll('.type-btn').forEach(b=>b.classList.remove('sel'));
  document.querySelector('.tb-'+t)?.classList.add('sel');
}

async function insSaveVehicle(){
  const num=document.getElementById('ins-vnum').value.trim();
  const time=document.getElementById('ins-vtime').value.trim();
  if(!num){alert('車番を入力してください');return;}
  const {day,han,id}=IS.modal;
  const ym=insGetYM();
  if(id){
    await fetch(INS_PATH+'/api/inspection/schedule/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({vehicle_num:num,type:insSelTypeCur,dep_time:time})});
    const v=IS.cache[ym+'_'+IS.dept]?.find(r=>r.id===id);
    if(v){v.vehicle_num=num;v.type=insSelTypeCur;v.dep_time=time;}
  } else {
    const res=await fetch(INS_PATH+'/api/inspection/schedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ym,ka:IS.dept,day,han,vehicle_num:num,type:insSelTypeCur,dep_time:time})});
    const j=await res.json();
    if(!IS.cache[ym+'_'+IS.dept]) IS.cache[ym+'_'+IS.dept]=[];
    IS.cache[ym+'_'+IS.dept].push({id:j.id,day,han,vehicle_num:num,type:insSelTypeCur,dep_time:time});
  }
  insRefreshTags(day,han);
  insShowBadge();
  insCloseModal();
}

async function insDeleteVehicle(){
  const {day,han,id}=IS.modal;
  if(!id) return;
  const ym=insGetYM();
  await fetch(INS_PATH+'/api/inspection/schedule/'+id,{method:'DELETE'});
  const arr=IS.cache[ym+'_'+IS.dept];
  if(arr){const i=arr.findIndex(r=>r.id===id);if(i>=0)arr.splice(i,1);}
  insRefreshTags(day,han);
  insShowBadge();
  insCloseModal();
}

function insRefreshTags(day,han){
  const ym=insGetYM();
  const data=IS.cache[ym+'_'+IS.dept]||[];
  const vehicles=data.filter(r=>r.day===day&&r.han===han);
  const el=document.getElementById('ins-tags-'+day+'-'+han);
  if(el) el.innerHTML=insRenderTags(vehicles,day,han);
}

function insShowBadge(){
  const el=document.getElementById('ins-save-badge');
  el.textContent='✓ 保存済み';
  setTimeout(()=>{el.textContent='';},2000);
}

// ===== 月データ全削除 =====
async function insClearMonth(){
  const ym=insGetYM();
  if(!confirm(IS.year+'年'+IS.month+'月 '+IS.dept+'課のデータを全て削除しますか？')) return;
  await fetch(INS_PATH+'/api/inspection/schedule?ym='+ym+'&ka='+IS.dept,{method:'DELETE'});
  delete IS.cache[ym+'_'+IS.dept];
  insRefreshTable();
}

// ===== 月次表 画像保存（実物のフォント・配色を再現） =====
const INS_MCOL={inspect:'#000',shaken:'#f00',bomb:'#ff0',sub:'#808',recall:'#000'};
const INS_MFILL_T1='#99cc00',INS_MFILL_DATE='#ffff99',INS_MFILL_T2='#99ccff';

function insTagMetrics(ctx,v,fMain,fTime){
  ctx.font=fMain;
  const numW=ctx.measureText(v.vehicle_num).width;
  let timeW=0;
  if(v.dep_time){ctx.font=fTime;timeW=ctx.measureText(v.dep_time).width+10;}
  return {numW,timeW,total:numW+timeW};
}

function insWrapTags(ctx,vehicles,maxWidth,fMain,fTime){
  const gap=26;
  const lines=[];
  let cur=[],curW=0;
  vehicles.forEach(v=>{
    const m=insTagMetrics(ctx,v,fMain,fTime);
    const extra=cur.length?gap+m.total:m.total;
    if(cur.length&&curW+extra>maxWidth){
      lines.push(cur);cur=[{v,m}];curW=m.total;
    }else{
      cur.push({v,m});curW+=extra;
    }
  });
  if(cur.length) lines.push(cur);
  if(!lines.length) lines.push([]);
  return lines;
}

function insLineWidth(line){
  const gap=26;
  if(!line.length) return 0;
  return line.reduce((s,{m})=>s+m.total,0)+gap*(line.length-1);
}

function insDrawTagLine(ctx,line,x,yc,fMain,fTime){
  const gap=26;
  let cx=x;
  line.forEach(({v,m})=>{
    ctx.textAlign='left';ctx.textBaseline='middle';
    if(v.type==='recall'){
      ctx.strokeStyle='#333';ctx.lineWidth=2;
      ctx.strokeRect(cx-8,yc-24,m.numW+16,48);
    }
    ctx.font=fMain;ctx.fillStyle=INS_MCOL[v.type]||'#000';
    ctx.fillText(v.vehicle_num,cx,yc);
    if(v.dep_time){
      ctx.font=fTime;ctx.fillStyle='#777';
      ctx.fillText(v.dep_time,cx+m.numW+10,yc);
    }
    cx+=m.total+gap;
  });
}

async function insRenderMonthCanvas(){
  const ym=insGetYM();
  const data=await insFetchData(ym,IS.dept);
  const days=insDIM(IS.year,IS.month);
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  const FN='"游ゴシック","Yu Gothic","Hiragino Sans","Meiryo","Noto Sans JP",sans-serif';
  const MX=60,W=1600,CW=MX*2+W;
  const C1=Math.round(W*0.43),CD=Math.round(W*0.14),C2=W-C1-CD;
  const HH=90,MIN_RH=72,LH=44;
  const fMain='bold 34px '+FN, fTime='24px '+FN;

  // パス1: 各日の行に必要な高さを計測
  const rows=[];
  for(let day=1;day<=days;day++){
    const {h1,h2}=insGetDayVehicles(data,day);
    const l1=insWrapTags(ctx,h1,C1-40,fMain,fTime);
    const l2=insWrapTags(ctx,h2,C2-40,fMain,fTime);
    const lines=Math.max(l1.length,l2.length,1);
    rows.push({day,l1,l2,rh:Math.max(MIN_RH,28+lines*LH)});
  }
  const tableBodyH=rows.reduce((s,r)=>s+r.rh,0);
  const TY=60+120+76+30;
  const totalH=TY+HH+tableBodyH+30+40+50;
  canvas.width=CW; canvas.height=totalH;
  ctx.textBaseline='middle';

  ctx.fillStyle='#fff';ctx.fillRect(0,0,CW,totalH);

  // タイトル・注意書き
  let y=60;
  ctx.fillStyle='#000';ctx.font='bold 76px '+FN;ctx.textAlign='left';
  ctx.fillText(IS.dept+'課　定期点検表（'+IS.month+'月）',MX,y+50);
  y+=120;
  ctx.fillStyle='#f00';ctx.font='bold 46px '+FN;ctx.textAlign='center';
  ctx.fillText('担当車両の点検車検日を確認願います',CW/2,y+31);
  y+=76;
  y+=30;

  // テーブル
  const TX=MX,TW=W,tableTop=y;
  ctx.fillStyle=INS_MFILL_T1;ctx.fillRect(TX,tableTop,C1,HH);
  ctx.fillStyle=INS_MFILL_DATE;ctx.fillRect(TX+C1,tableTop,CD,HH);
  ctx.fillStyle=INS_MFILL_T2;ctx.fillRect(TX+C1+CD,tableTop,C2,HH);
  ctx.fillStyle='#000';ctx.font='bold 38px '+FN;ctx.textAlign='center';
  ctx.fillText('《'+insTeamNum(IS.dept,1)+'班》',TX+C1/2,tableTop+HH/2);
  ctx.fillText('日付',TX+C1+CD/2,tableTop+HH/2);
  ctx.fillText('《'+insTeamNum(IS.dept,2)+'班》',TX+C1+CD+C2/2,tableTop+HH/2);

  let ry=tableTop+HH;
  rows.forEach(r=>{
    const dow=new Date(IS.year,IS.month-1,r.day).getDay();
    ctx.fillStyle=INS_MFILL_T1;ctx.fillRect(TX,ry,C1,r.rh);
    ctx.fillStyle=INS_MFILL_T2;ctx.fillRect(TX+C1+CD,ry,C2,r.rh);
    ctx.fillStyle=INS_MFILL_DATE;ctx.fillRect(TX+C1,ry,CD,r.rh);
    const dayColor=dow===6?'#0cf':dow===0?'#f00':'#000';
    ctx.fillStyle=dayColor;ctx.font='bold 40px '+FN;ctx.textAlign='center';
    ctx.fillText(String(r.day),TX+C1+CD/2,ry+r.rh/2);
    const yc0=ry+r.rh/2-((r.l1.length-1)*LH)/2;
    r.l1.forEach((line,i)=>insDrawTagLine(ctx,line,TX+C1-22-insLineWidth(line),yc0+i*LH,fMain,fTime));
    const yc1=ry+r.rh/2-((r.l2.length-1)*LH)/2;
    r.l2.forEach((line,i)=>insDrawTagLine(ctx,line,TX+C1+CD+22,yc1+i*LH,fMain,fTime));
    ry+=r.rh;
  });

  // 罫線
  ctx.strokeStyle='#000';ctx.lineWidth=3;
  ctx.strokeRect(TX,tableTop,TW,HH+tableBodyH);
  ctx.beginPath();
  ctx.moveTo(TX+C1,tableTop);ctx.lineTo(TX+C1,tableTop+HH+tableBodyH);
  ctx.moveTo(TX+C1+CD,tableTop);ctx.lineTo(TX+C1+CD,tableTop+HH+tableBodyH);
  ctx.stroke();
  ctx.strokeStyle='#999';ctx.lineWidth=1;
  let sy=tableTop+HH;
  rows.forEach(r=>{ctx.beginPath();ctx.moveTo(TX,sy);ctx.lineTo(TX+TW,sy);ctx.stroke();sy+=r.rh;});

  // 凡例
  ctx.fillStyle='#00f';ctx.font='bold 30px '+FN;ctx.textAlign='center';
  ctx.fillText('黒字は点検　赤字は車検　紫字は代替　黄字はボンベ交換　白枠黒字はリコール作業',CW/2,tableTop+HH+tableBodyH+40);

  return canvas;
}

async function insDownloadMonthImage(btn){
  if(btn){btn.disabled=true;}
  try{
    const canvas=await insRenderMonthCanvas();
    const a=document.createElement('a');
    a.download=IS.dept+'課_定期点検表_'+IS.year+'年'+IS.month+'月.png';
    a.href=canvas.toDataURL('image/png');
    a.click();
  }finally{
    if(btn){btn.disabled=false;}
  }
}

// ===== 月次表 Excel保存（実物のフォント・配色を再現） =====
const INS_XFONT='HGP創英角ポップ体';
const INS_XCOL={inspect:'FF000000',shaken:'FFFF0000',bomb:'FFFFFF00',sub:'FF800080',recall:'FF000000'};
const INS_T1COLS=['E','D','C','B','A'];
const INS_T2COLS=['H','I','J','K','L'];
const INS_XFILL_T1='FF99CC00';
const INS_XFILL_DATE='FFFFFF99';
const INS_XFILL_T2='FF99CCFF';

function insSetCellVehicles(ws,row,cols,vehicles){
  const n=cols.length;
  vehicles.forEach((v,i)=>{
    const idx=Math.min(i,n-1);
    const addr=cols[idx]+row;
    const cell=ws.getCell(addr);
    const text=v.vehicle_num+(v.dep_time?'('+v.dep_time+')':'');
    cell.value=cell.value?cell.value+'/'+text:text;
    cell.font={name:INS_XFONT,size:14,color:{argb:INS_XCOL[v.type]||'FF000000'}};
    cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
    if(v.type==='recall'){
      cell.border={top:{style:'thin'},bottom:{style:'thin'},left:{style:'thin'},right:{style:'thin'}};
    }
  });
}

async function insBuildMonthWorkbook(){
  const ym=insGetYM();
  const data=await insFetchData(ym,IS.dept);
  const days=insDIM(IS.year,IS.month);
  const wb=new ExcelJS.Workbook();
  const ws=wb.addWorksheet(IS.dept+'課'+IS.month+'月');
  ['A','B','C','D','E'].forEach(c=>ws.getColumn(c).width=9);
  ['F','G'].forEach(c=>ws.getColumn(c).width=3);
  ['H','I','J','K','L'].forEach(c=>ws.getColumn(c).width=9);

  ws.mergeCells('A1:L1');
  ws.getCell('A1').value=IS.dept+'課　定期点検表（'+IS.month+'月）';
  ws.getCell('A1').font={name:INS_XFONT,size:32};
  ws.getCell('A1').alignment={horizontal:'center',vertical:'middle'};
  ws.getRow(1).height=46;

  ws.mergeCells('A2:L2');
  ws.getCell('A2').value='担当車両の点検車検日を確認願います';
  ws.getCell('A2').font={name:INS_XFONT,size:20,color:{argb:'FFFF0000'}};
  ws.getCell('A2').alignment={horizontal:'center',vertical:'middle'};
  ws.getRow(2).height=30;

  ws.mergeCells('A3:E3');
  ws.getCell('A3').value='《'+insTeamNum(IS.dept,1)+'班》';
  ws.mergeCells('F3:G3');
  ws.getCell('F3').value='日付';
  ws.mergeCells('H3:L3');
  ws.getCell('H3').value='《'+insTeamNum(IS.dept,2)+'班》';
  ws.getCell('A3').fill={type:'pattern',pattern:'solid',fgColor:{argb:INS_XFILL_T1}};
  ws.getCell('F3').fill={type:'pattern',pattern:'solid',fgColor:{argb:INS_XFILL_DATE}};
  ws.getCell('H3').fill={type:'pattern',pattern:'solid',fgColor:{argb:INS_XFILL_T2}};
  ['A3','F3','H3'].forEach((a,i)=>{
    const cell=ws.getCell(a);
    cell.font={name:INS_XFONT,size:i===1?14:18};
    cell.alignment={horizontal:'center',vertical:'middle'};
  });
  ws.getRow(3).height=27;

  for(let day=1;day<=days;day++){
    const row=3+day;
    const {h1,h2}=insGetDayVehicles(data,day);
    const dow=new Date(IS.year,IS.month-1,day).getDay();
    ['A','B','C','D','E'].forEach(c=>{ws.getCell(c+row).fill={type:'pattern',pattern:'solid',fgColor:{argb:INS_XFILL_T1}};});
    ['H','I','J','K','L'].forEach(c=>{ws.getCell(c+row).fill={type:'pattern',pattern:'solid',fgColor:{argb:INS_XFILL_T2}};});
    ws.mergeCells('F'+row+':G'+row);
    const dCell=ws.getCell('F'+row);
    dCell.value=day;
    dCell.alignment={horizontal:'center',vertical:'middle'};
    dCell.fill={type:'pattern',pattern:'solid',fgColor:{argb:INS_XFILL_DATE}};
    const dColor=dow===6?'FF00CCFF':dow===0?'FFFF0000':'FF000000';
    dCell.font={name:INS_XFONT,size:14,color:{argb:dColor}};
    insSetCellVehicles(ws,row,INS_T1COLS,h1);
    insSetCellVehicles(ws,row,INS_T2COLS,h2);
    ws.getRow(row).eachCell({includeEmpty:true},cell=>{
      cell.border={...cell.border,top:{style:'hair',color:{argb:'FFBBBBBB'}},bottom:{style:'hair',color:{argb:'FFBBBBBB'}}};
    });
  }

  const legendRow=4+days;
  ws.mergeCells('A'+legendRow+':L'+legendRow);
  const legendCell=ws.getCell('A'+legendRow);
  legendCell.value='黒字は点検　赤字は車検　紫字は代替　黄字はボンベ交換　白枠黒字はリコール作業';
  legendCell.font={name:INS_XFONT,size:11,color:{argb:'FF0000FF'}};
  legendCell.alignment={horizontal:'center',vertical:'middle'};

  ws.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:1};
  return wb;
}

async function insDownloadMonthExcel(btn){
  if(btn){btn.disabled=true;}
  try{
    const wb=await insBuildMonthWorkbook();
    const buf=await wb.xlsx.writeBuffer();
    const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const a=document.createElement('a');
    a.download=IS.dept+'課_定期点検表_'+IS.year+'年'+IS.month+'月.xlsx';
    a.href=URL.createObjectURL(blob);
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),10000);
  }catch(e){
    alert('Excel生成に失敗しました: '+e.message);
  }finally{
    if(btn){btn.disabled=false;}
  }
}

// ===== Canvas出力 =====
const INS_COL={inspect:'#000',shaken:'#cc0000',bomb:'#0044bb',sub:'#006600',recall:'#000'};

async function insRenderCanvas(){
  const y=+document.getElementById('ins-year-out').value;
  const m=+document.getElementById('ins-month-out').value;
  const day=+document.getElementById('ins-day-out').value;
  const ym=String(y)+String(m).padStart(2,'0');
  const res=await fetch(INS_PATH+'/api/inspection/day?ym='+ym+'&day='+day);
  const all=await res.json();
  // A4横・余白8mm時の印刷可能領域と同比率（281:194）
  const W=2400,H=1660;
  const canvas=document.getElementById('ins-canvas');
  canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext('2d');
  const FN='"游ゴシック","Yu Gothic","Hiragino Sans","Meiryo","Noto Sans JP",sans-serif';
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  // テーブル領域（右側に枠外の備考スペースを残す）
  const TX=60,TY=155,TW=1650,TH=H-TY-55;
  const LW=95;               // ラベル列
  const CW=(TW-LW)/4;        // 各課列
  const HH=90;               // ヘッダー行
  const BODY=TH-HH;
  const IH=Math.round(BODY*0.44),DH=Math.round(BODY*0.21),SH=Math.round(BODY*0.21);
  const BH=BODY-IH-DH-SH;
  const IY=TY+HH,DY=IY+IH,SY=DY+DH,BOY=SY+SH;
  // データ（点検実施＝点検+リコール、代替は独立セクション）
  const Ka=Array.from({length:4},(_,i)=>{
    const r=all.filter(x=>x.ka===i+1);
    return {ins:r.filter(x=>['inspect','recall'].includes(x.type)),dai:r.filter(x=>x.type==='sub'),sha:r.filter(x=>x.type==='shaken'),bom:r.filter(x=>x.type==='bomb')};
  });
  // 日付（表の外・左上に大きく）
  ctx.fillStyle='#000';ctx.textBaseline='middle';
  ctx.font='bold 66px '+FN;ctx.textAlign='left';
  ctx.fillText(m+'月'+day+'日',TX+5,80);
  // 右上注記
  ctx.font='bold 30px '+FN;ctx.textAlign='right';
  ctx.fillText('15時に工場に確認',W-55,52);
  ctx.fillText('工場内線：6428',W-55,98);
  // ヘッダー（左端セルは空白）
  const KN=['１課','２課','３課','４課'];
  ctx.font='bold 44px '+FN;ctx.textAlign='center';
  for(let i=0;i<4;i++) ctx.fillText(KN[i],TX+LW+CW*i+CW/2,TY+HH/2);
  // ラベル列（縦書き風に文字を積む）
  function drawStackedText(text,secY,secH){
    const chars=[...text];
    const n=chars.length;
    const fsz=Math.min(36,secH/(n*1.35));
    const spacing=Math.min(secH/(n+0.5),fsz*1.7);
    const totalH=spacing*(n-1)+fsz;
    const sy0=secY+(secH-totalH)/2+fsz/2;
    ctx.font='bold '+fsz+'px '+FN;ctx.fillStyle='#000';ctx.textAlign='center';ctx.textBaseline='middle';
    for(let k=0;k<n;k++) ctx.fillText(chars[k],TX+LW/2,sy0+k*spacing);
  }
  drawStackedText('点検実施車両',IY,IH);
  drawStackedText('代替',DY,DH);
  drawStackedText('車検',SY,SH);
  drawStackedText('ボンベ交換',BOY,BH);
  // 車両（番号＋出庫時間を横並び、セクション内で上下中央）
  function fillCell(secY,secH,col,vehicles){
    if(!vehicles.length) return;
    const cx=TX+LW+CW*col;
    const lh=Math.min(60,secH/vehicles.length);
    const totalH=vehicles.length*lh;
    const sy0=secY+(secH-totalH)/2+lh/2;
    for(let j=0;j<vehicles.length;j++){
      const v=vehicles[j],ly=sy0+j*lh;
      ctx.font='42px '+FN;ctx.fillStyle=INS_COL[v.type]||'#000';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(v.vehicle_num,cx+CW*0.32,ly);
      if(v.dep_time){
        ctx.font='36px '+FN;
        ctx.fillText(v.dep_time,cx+CW*0.73,ly);
      }
    }
  }
  for(let i=0;i<4;i++){
    fillCell(IY,IH,i,Ka[i].ins);
    fillCell(DY,DH,i,Ka[i].dai);
    fillCell(SY,SH,i,Ka[i].sha);
    fillCell(BOY,BH,i,Ka[i].bom);
  }
  // 備考（表の外・右側、枠線なし）
  const NX=TX+TW+42;
  const NOTES=[
    [IY+50,['・Ｈ勤以外は７時までに工場へ','・６時、７時の出庫は不可','　間違い出庫に要注意！','・Ｈ勤は１１時までに工場へ']],
    [IY+IH*0.62,['　間違い出庫に要注意！']],
    [DY+45,['・全車両６時３０までに工場へ','・午前中に出庫はできません！']],
    [SY+SH*0.32,['・７時までにいれられるように','・仮検受けないと使えなくなる','・整備依頼書「ＬＴ２７交換」をつけて']],
  ];
  ctx.font='29px '+FN;ctx.fillStyle='#000';ctx.textAlign='left';ctx.textBaseline='middle';
  for(const [ny,lines] of NOTES) lines.forEach((t,k)=>ctx.fillText(t,NX,ny+k*68));
  // 罫線（外枠・セクション区切り・列区切りのみ。列内の区切り線なし）
  ctx.strokeStyle='#000';ctx.lineWidth=2;
  ctx.strokeRect(TX,TY,TW,TH);
  for(const sy of [TY+HH,DY,SY,BOY]){ctx.beginPath();ctx.moveTo(TX,sy);ctx.lineTo(TX+TW,sy);ctx.stroke();}
  for(let i=0;i<4;i++){const vx=TX+LW+CW*i;ctx.beginPath();ctx.moveTo(vx,TY);ctx.lineTo(vx,TY+TH);ctx.stroke();}
}

async function insCopyImage(){
  await insRenderCanvas();
  const canvas=document.getElementById('ins-canvas');
  canvas.toBlob(async blob=>{
    try{
      await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);
      const el=document.getElementById('ins-copy-badge');
      el.textContent='✓ コピー完了';
      setTimeout(()=>{el.textContent='';},2000);
    }catch(e){
      insDownloadImage();
    }
  });
}

async function insPrintImage(){
  await insRenderCanvas();
  const canvas=document.getElementById('ins-canvas');
  const dataUrl=canvas.toDataURL('image/png');
  const m=document.getElementById('ins-month-out').value;
  const d=document.getElementById('ins-day-out').value;
  document.getElementById('ins-print-frame')?.remove();
  const f=document.createElement('iframe');
  f.id='ins-print-frame';
  f.style.cssText='position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(f);
  const doc=f.contentDocument;
  doc.open();
  doc.write('<!DOCTYPE html><html><head><title>点検車検確認表_'+m+'月'+d+'日</title><style>@page{size:A4 landscape;margin:8mm}html,body{margin:0;padding:0}img{display:block;width:278mm;height:auto}</style></head><body><img src="'+dataUrl+'"></body></html>');
  doc.close();
  const img=doc.querySelector('img');
  const doPrint=()=>{f.contentWindow.focus();f.contentWindow.print();};
  if(img.complete) doPrint(); else img.onload=doPrint;
}

function insDownloadImage(){
  const canvas=document.getElementById('ins-canvas');
  const m=document.getElementById('ins-month-out').value;
  const d=document.getElementById('ins-day-out').value;
  const a=document.createElement('a');
  a.download='点検車検確認表_'+m+'月'+d+'日.png';
  a.href=canvas.toDataURL('image/png');
  a.click();
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){insCloseModal();if(!insAiBusy)insAiClose();}});

// ===== 写真AI取込 =====
let insAiEntries=[];
let insAiBusy=false;
const INS_TYPE_JP={inspect:'点検',shaken:'車検',bomb:'ボンベ',sub:'代替',recall:'リコール'};

function insPhotoPick(){document.getElementById('ins-photo-file').click();}

function insLoadImage(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{
      const max=1800;
      let w=img.naturalWidth,h=img.naturalHeight;
      const sc=Math.min(1,max/Math.max(w,h));
      w=Math.round(w*sc);h=Math.round(h*sc);
      const cv=document.createElement('canvas');cv.width=w;cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      URL.revokeObjectURL(url);
      resolve(cv.toDataURL('image/jpeg',0.85));
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('decode'));};
    img.src=url;
  });
}

function insAiShow(html){
  document.getElementById('ins-ai-body').innerHTML=html;
  document.getElementById('ins-ai-modal').style.display='flex';
}
function insAiClose(){document.getElementById('ins-ai-modal').style.display='none';}

async function insPhotoSelected(input){
  const file=input.files[0];
  input.value='';
  if(!file) return;
  insAiBusy=true;
  insAiShow('<div style="text-align:center;padding:30px;color:#555;font-size:14px">🔍 AIが写真を解析しています…<br><span style="font-size:12px;color:#999">（10〜30秒ほどかかります）</span></div>');
  let dataUrl;
  try{
    dataUrl=await insLoadImage(file);
  }catch(e){
    insAiBusy=false;
    insAiShow('<div style="color:#c00;font-size:13px;padding:10px 0">画像を読み込めませんでした。HEIC形式はブラウザによって開けない場合があります。iPhoneの「写真」から選択するか、JPEG/PNGに変換してお試しください。</div><div class="ins-actions"><button class="btn-s" onclick="insAiClose()">閉じる</button></div>');
    return;
  }
  try{
    const res=await fetch(INS_PATH+'/api/inspection/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:dataUrl,ym:insGetYM()})});
    const j=await res.json();
    insAiBusy=false;
    if(!res.ok||j.error){
      insAiShow('<div style="color:#c00;font-size:13px;padding:10px 0">'+insEsc(j.error||'解析に失敗しました')+'</div><div class="ins-actions"><button class="btn-s" onclick="insAiClose()">閉じる</button></div>');
      return;
    }
    insAiEntries=j.entries.map((e,i)=>({...e,_idx:i,_excluded:false}));
    insAiRenderPreview(j.detected_ka,j.detected_month);
  }catch(e){
    insAiBusy=false;
    insAiShow('<div style="color:#c00;font-size:13px;padding:10px 0">通信エラーが発生しました。もう一度お試しください。</div><div class="ins-actions"><button class="btn-s" onclick="insAiClose()">閉じる</button></div>');
  }
}

function insAiRenderPreview(detectedKa,detectedMonth){
  let warn='';
  if(detectedKa&&detectedKa!==IS.dept) warn+='<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:5px;padding:8px 12px;font-size:12px;margin-bottom:10px;color:#856404">⚠️ 写真は <strong>'+detectedKa+'課</strong> の表のようですが、画面では <strong>'+IS.dept+'課</strong> が選択されています。登録先は画面の選択（'+IS.dept+'課）になります。</div>';
  if(detectedMonth&&detectedMonth!==IS.month) warn+='<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:5px;padding:8px 12px;font-size:12px;margin-bottom:10px;color:#856404">⚠️ 写真は <strong>'+detectedMonth+'月</strong> の表のようですが、画面では <strong>'+IS.month+'月</strong> が選択されています。登録先は画面の選択（'+IS.year+'年'+IS.month+'月）になります。</div>';

  const byDay={};
  insAiEntries.forEach(e=>{(byDay[e.day]=byDay[e.day]||[]).push(e);});
  let rows='';
  Object.keys(byDay).map(Number).sort((a,b)=>a-b).forEach(day=>{
    const h1=byDay[day].filter(e=>e.han===1),h2=byDay[day].filter(e=>e.han===2);
    const tag=e=>'<span class="vtag vt-'+e.type+'" style="'+(e._excluded?'opacity:.3;text-decoration:line-through;':'')+'" onclick="insAiToggle('+e._idx+')" title="クリックで除外/戻す">'+insEsc(e.vehicle_num)+'<span class="vt-time">'+INS_TYPE_JP[e.type]+'</span></span>';
    rows+='<tr><td style="padding:4px"><div class="vtags vtags-r">'+h1.map(tag).join('')+'</div></td><td class="ins-date-cell">'+day+'</td><td style="padding:4px"><div class="vtags">'+h2.map(tag).join('')+'</div></td></tr>';
  });

  insAiShow(
    warn+
    '<div style="font-size:13px;color:#333;margin-bottom:10px"><strong>'+insAiEntries.length+'件</strong> の車両を検出しました。内容を確認してください（車番クリックで除外できます）。登録後の修正は表の車番クリックでできます。</div>'+
    '<div class="ins-table-wrap" style="margin-bottom:12px"><table class="ins-table"><colgroup><col style="width:44%"><col style="width:12%"><col style="width:44%"></colgroup><thead><tr><th>《'+insTeamNum(IS.dept,1)+'班側》</th><th>日付</th><th>《'+insTeamNum(IS.dept,2)+'班側》</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    '<label style="font-size:13px;display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer"><input type="checkbox" id="ins-ai-replace" checked> '+IS.year+'年'+IS.month+'月 '+IS.dept+'課の既存データを置き換える（外すと追加のみ）</label>'+
    '<div class="ins-actions"><button class="btn-s" onclick="insAiClose()">キャンセル</button><button class="btn-p" id="ins-ai-reg-btn" onclick="insAiRegister()">✓ '+IS.year+'年'+IS.month+'月 '+IS.dept+'課に登録</button></div>'
  );
}

function insAiToggle(idx){
  const e=insAiEntries.find(x=>x._idx===idx);
  if(e){e._excluded=!e._excluded;insAiRenderPreview(null,null);}
}

async function insAiRegister(){
  const entries=insAiEntries.filter(e=>!e._excluded).map(e=>({day:e.day,han:e.han,vehicle_num:e.vehicle_num,type:e.type}));
  if(entries.length===0){alert('登録する車両がありません');return;}
  const replace=document.getElementById('ins-ai-replace').checked;
  const ym=insGetYM();
  const btn=document.getElementById('ins-ai-reg-btn');
  btn.disabled=true;btn.textContent='登録中…';
  insAiBusy=true;
  try{
    const res=await fetch(INS_PATH+'/api/inspection/schedule/bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ym,ka:IS.dept,replace,entries})});
    const j=await res.json();
    insAiBusy=false;
    if(!res.ok||j.error){
      alert(j.error||'登録に失敗しました');
      btn.disabled=false;btn.textContent='✓ 登録';
      return;
    }
    delete IS.cache[ym+'_'+IS.dept];
    insAiClose();
    await insRefreshTable();
    insShowBadge();
  }catch(e){
    insAiBusy=false;
    alert('通信エラーが発生しました');
    btn.disabled=false;btn.textContent='✓ 登録';
  }
}
</script>`;
}

app.get('/inspection', (c) => {
  return c.html(layout('点検管理', inspectionPage(ADMIN_PATH), 'inspection'));
});

export default app;
