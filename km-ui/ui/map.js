/* map.js — 地図・範囲検索 と 走行軌跡。Canvas の模式地図(本番は ZENRIN zmaps に差し替え)。
   座標は 板橋営業所(35.7865,139.6835) を原点とした簡易平面(メートル)。 */
(function(){
const $=id=>document.getElementById(id);
const rr=seeded(99); const pk=a=>a[Math.floor(rr()*a.length)];
const CSS=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const COL={空車:'#1f8f4e',迎車:'#2b5fb3',実車:'#c0392b',支払:'#b26b00',回送:'#b26b00',休憩:'#7a8699',配車指示中:'#8e44ad'};
// 車両に位置を付与(半径 6km)
VEH.forEach(v=>{const a=rr()*Math.PI*2,d=Math.sqrt(rr())*6000;v.x=Math.cos(a)*d;v.y=Math.sin(a)*d;v.heading=rr()*360});
const STANDS=[['板橋駅',600,-900,3],['成増駅',-3800,-1200,0],['大山駅',1200,-200,2],['高島平駅',-1500,2600,1],['赤羽駅',3500,1800,4],['池袋駅',2600,-3600,6]].map(s=>({name:s[0],x:s[1],y:s[2],n:s[3],shortage:s[3]===0}));
const DISP=[['板橋区役所',900,-500],['日大板橋病院',500,400],['帝京大病院',-900,-1700]].map(d=>({name:d[0],x:d[1],y:d[2]}));
const NOSTAY=[{x:2600,y:-3600,r:300}];
const ROADS=[]; for(let i=-8;i<=8;i++){ROADS.push([[-8000,i*1000],[8000,i*1000]]);ROADS.push([[i*1000,-8000],[i*1000,8000]])} ROADS.push([[-8000,-5000],[8000,3000]],[[-6000,8000],[4000,-8000]]);

/* ---------- 共通の地図ビュー ---------- */
function makeView(canvas){
  const v={canvas,ctx:canvas.getContext('2d'),cx:0,cy:0,scale:0.06,dpr:window.devicePixelRatio||1};
  v.resize=()=>{const r=canvas.getBoundingClientRect();canvas.width=r.width*v.dpr;canvas.height=r.height*v.dpr;v.w=r.width;v.h=r.height};
  v.toPx=(x,y)=>[v.w/2+(x-v.cx)*v.scale,v.h/2+(y-v.cy)*v.scale];
  v.toWorld=(px,py)=>[(px-v.w/2)/v.scale+v.cx,(py-v.h/2)/v.scale+v.cy];
  v.base=()=>{const c=v.ctx;c.setTransform(v.dpr,0,0,v.dpr,0,0);c.fillStyle=CSS('--surface-2');c.fillRect(0,0,v.w,v.h);
    c.strokeStyle=CSS('--line');c.lineWidth=1;ROADS.forEach(([a,b])=>{const p=v.toPx(...a),q=v.toPx(...b);c.beginPath();c.moveTo(...p);c.lineTo(...q);c.stroke()});
    c.strokeStyle=CSS('--muted');c.lineWidth=3;c.globalAlpha=.35;[ROADS[ROADS.length-1],ROADS[ROADS.length-2],ROADS[8],ROADS[25]].forEach(([a,b])=>{const p=v.toPx(...a),q=v.toPx(...b);c.beginPath();c.moveTo(...p);c.lineTo(...q);c.stroke()});c.globalAlpha=1;
    c.fillStyle=CSS('--muted');c.font='11px '+CSS('--sans');[['板橋営業所',0,0],['板橋区',-1500,-3000],['練馬区',-5000,1500],['北区',3500,-500],['豊島区',2000,-4500]].forEach(([n,x,y])=>{const p=v.toPx(x,y);c.fillText(n,p[0]+6,p[1]-6)});
    const o=v.toPx(0,0);c.fillStyle=CSS('--accent');c.beginPath();c.arc(o[0],o[1],5,0,7);c.fill();
    // スケールバー
    const m=1000*v.scale;c.fillStyle=CSS('--fg');c.fillRect(v.w-m-14,v.h-16,m,2);c.font='10px '+CSS('--mono');c.fillText('1 km',v.w-m-14,v.h-20)};
  // パン/ズーム
  let drag=null;canvas.addEventListener('pointerdown',e=>{if(v.onDown&&v.onDown(e))return;drag={x:e.clientX,y:e.clientY,cx:v.cx,cy:v.cy};canvas.setPointerCapture(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(v.onMove&&v.onMove(e))return;if(drag){v.cx=drag.cx-(e.clientX-drag.x)/v.scale;v.cy=drag.cy-(e.clientY-drag.y)/v.scale;v.draw()}});
  canvas.addEventListener('pointerup',e=>{if(v.onUp&&v.onUp(e))return;if(drag&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<3&&v.onClick)v.onClick(e);drag=null});
  canvas.addEventListener('wheel',e=>{e.preventDefault();v.zoom(e.deltaY<0?1.2:1/1.2)},{passive:false});
  v.zoom=f=>{v.scale=Math.min(1,Math.max(0.015,v.scale*f));v.draw()};
  v.ev=e=>{const r=canvas.getBoundingClientRect();return v.toWorld(e.clientX-r.left,e.clientY-r.top)};
  new ResizeObserver(()=>{v.resize();v.draw()}).observe(canvas);
  v.resize();return v;
}
function drawVehicle(c,v,p,sel){c.save();c.translate(p[0],p[1]);c.rotate(v.heading*Math.PI/180);c.fillStyle=COL[v.status]||'#888';c.beginPath();c.moveTo(0,-7);c.lineTo(5,6);c.lineTo(-5,6);c.closePath();c.fill();if(sel){c.strokeStyle=CSS('--fg');c.lineWidth=2;c.stroke()}c.restore()}

/* ---------- 地図・範囲検索 ---------- */
const mv=makeView($('mapCanvas'));
const S={mode:'radius',center:null,rect:null,poly:[],result:[],sel:new Set(),showAll:true,style:0};
function layers(){return [...document.querySelectorAll('#mapLayers .chip[aria-pressed="true"]')].map(b=>b.dataset.v)}
function statuses(){return [...document.querySelectorAll('#mapStatus .chip[aria-pressed="true"]')].map(b=>b.dataset.v)}
function inside(v){
  if(S.mode==='radius'&&S.center)return Math.hypot(v.x-S.center[0],v.y-S.center[1])<=+$('mapRadius').value;
  if(S.mode==='rect'&&S.rect)return v.x>=Math.min(S.rect[0],S.rect[2])&&v.x<=Math.max(S.rect[0],S.rect[2])&&v.y>=Math.min(S.rect[1],S.rect[3])&&v.y<=Math.max(S.rect[1],S.rect[3]);
  if(S.mode==='poly'&&S.poly.length>2){let ins=false;for(let i=0,j=S.poly.length-1;i<S.poly.length;j=i++){const a=S.poly[i],b=S.poly[j];if((a[1]>v.y)!==(b[1]>v.y)&&v.x<(b[0]-a[0])*(v.y-a[1])/(b[1]-a[1])+a[0])ins=!ins}return ins}
  return false;
}
mv.draw=()=>{mv.base();const c=mv.ctx;const L=layers();
  if(L.includes('area')){c.strokeStyle=CSS('--info');c.setLineDash([6,4]);c.lineWidth=1;const p=mv.toPx(-4500,-4000),q=mv.toPx(4500,4000);c.strokeRect(p[0],p[1],q[0]-p[0],q[1]-p[1]);c.setLineDash([])}
  if(L.includes('noStay'))NOSTAY.forEach(n=>{const p=mv.toPx(n.x,n.y);c.fillStyle='rgba(192,57,43,.15)';c.strokeStyle=CSS('--crit');c.beginPath();c.arc(p[0],p[1],n.r*mv.scale,0,7);c.fill();c.stroke()});
  STANDS.forEach(s=>{if(!(L.includes('stand')||(s.shortage&&L.includes('shortage'))))return;const p=mv.toPx(s.x,s.y);c.fillStyle=s.shortage?CSS('--crit'):CSS('--accent');c.beginPath();c.moveTo(p[0],p[1]-9);c.lineTo(p[0]+8,p[1]+5);c.lineTo(p[0]-8,p[1]+5);c.closePath();c.fill();c.fillStyle=CSS('--fg');c.font='11px '+CSS('--sans');c.fillText(`${s.name} ${s.n}台${s.shortage?' 不足':''}`,p[0]+10,p[1]+4)});
  if(L.includes('dispatch'))DISP.forEach(d=>{const p=mv.toPx(d.x,d.y);c.fillStyle=CSS('--warn');c.fillRect(p[0]-4,p[1]-4,8,8);c.fillStyle=CSS('--fg');c.font='11px '+CSS('--sans');c.fillText(d.name,p[0]+8,p[1]+4)});
  // 範囲
  c.fillStyle='rgba(15,110,116,.12)';c.strokeStyle=CSS('--accent');c.lineWidth=1.5;
  if(S.mode==='radius'&&S.center){const p=mv.toPx(...S.center);c.beginPath();c.arc(p[0],p[1],+$('mapRadius').value*mv.scale,0,7);c.fill();c.stroke();c.fillStyle=CSS('--accent');c.beginPath();c.arc(p[0],p[1],4,0,7);c.fill()}
  if(S.mode==='rect'&&S.rect){const p=mv.toPx(S.rect[0],S.rect[1]),q=mv.toPx(S.rect[2],S.rect[3]);c.fillRect(p[0],p[1],q[0]-p[0],q[1]-p[1]);c.strokeRect(p[0],p[1],q[0]-p[0],q[1]-p[1])}
  if(S.mode==='poly'&&S.poly.length){c.beginPath();S.poly.forEach((pt,i)=>{const p=mv.toPx(...pt);i?c.lineTo(...p):c.moveTo(...p)});if(S.poly.length>2){c.closePath();c.fill()}c.stroke();S.poly.forEach(pt=>{const p=mv.toPx(...pt);c.fillStyle=CSS('--accent');c.beginPath();c.arc(p[0],p[1],3,0,7);c.fill()})}
  const st=statuses();
  VEH.forEach(v=>{const hit=S.result.includes(v);if(!S.showAll&&!hit)return;const p=mv.toPx(v.x,v.y);c.globalAlpha=S.result.length&&!hit?.3:1;drawVehicle(c,v,p,S.sel.has(v.radio));c.globalAlpha=1;if(mv.scale>0.08||hit){c.fillStyle=CSS('--fg');c.font='10px '+CSS('--mono');c.fillText(v.radio,p[0]+8,p[1]+3)}});
};
mv.onDown=e=>{if(S.mode==='rect'){const w=mv.ev(e);S.rect=[w[0],w[1],w[0],w[1]];S.drawing=true;mv.canvas.setPointerCapture(e.pointerId);return true}return false};
mv.onMove=e=>{if(S.drawing){const w=mv.ev(e);S.rect[2]=w[0];S.rect[3]=w[1];mv.draw();return true}return false};
mv.onUp=e=>{if(S.drawing){S.drawing=false;runSearch();return true}return false};
mv.onClick=e=>{const w=mv.ev(e);
  // 車両クリック
  const hit=VEH.find(v=>{const p=mv.toPx(v.x,v.y),r=mv.canvas.getBoundingClientRect();return Math.hypot(p[0]-(e.clientX-r.left),p[1]-(e.clientY-r.top))<9});
  if(hit){S.sel.has(hit.radio)?S.sel.delete(hit.radio):S.sel.add(hit.radio);renderList();mv.draw();return}
  if(S.mode==='radius'){S.center=w;runSearch()}
  else if(S.mode==='poly'){S.poly.push(w);if(S.poly.length>2)runSearch();else mv.draw();$('mapHint').textContent=`頂点 ${S.poly.length} 点。3点以上で検索されます`}
};
function runSearch(){const st=statuses();const g=$('mapGrade').value;
  S.result=VEH.filter(v=>inside(v)&&(!st.length||st.includes(v.status))&&(g==='指定なし'||v.grade===g));
  const ref=S.center||(S.rect&&[(S.rect[0]+S.rect[2])/2,(S.rect[1]+S.rect[3])/2])||(S.poly[0]);
  S.result.forEach(v=>{v.dist=ref?Math.hypot(v.x-ref[0],v.y-ref[1]):0;v.eta=Math.round(v.dist/1000/18*60)+1});
  S.result=S.result.filter(v=>v.eta<=+$('mapMinutes').value).sort((a,b)=>a.dist-b.dist);
  $('mapCnt').textContent=S.result.length;$('mapHint').textContent=S.mode==='radius'?`中心から ${$('mapRadius').value} m 以内`:S.mode==='rect'?'ドラッグした矩形の範囲内':'多角形の範囲内';
  renderList();mv.draw()}
function renderList(){$('vlist').innerHTML=S.result.map(v=>`<div class="v ${S.sel.has(v.radio)?'sel':''}" data-r="${v.radio}"><input type="checkbox" ${S.sel.has(v.radio)?'checked':''}><div><b>${v.radio}</b> ${v.driver}<br><small>${v.grade} / ${Math.round(v.dist)} m / 約${v.eta}分</small></div><span class="st ${({空車:'done',迎車:'go',実車:'ng'})[v.status]||''}">${v.status}</span></div>`).join('')||'<div class="empty">地図上で範囲を指定してください</div>'}
$('vlist').addEventListener('click',e=>{const d=e.target.closest('.v');if(!d)return;S.sel.has(d.dataset.r)?S.sel.delete(d.dataset.r):S.sel.add(d.dataset.r);renderList();mv.draw()});
$('mapMode').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;[...e.currentTarget.children].forEach(x=>x.setAttribute('aria-pressed',x===b));S.mode=b.dataset.m;S.center=null;S.rect=null;S.poly=[];S.result=[];renderList();mv.draw();
  $('mapHint').textContent={radius:'地図をクリックして中心を指定',rect:'地図上でドラッグして矩形を指定',poly:'地図を順にクリックして頂点を指定'}[S.mode]});
['mapStatus','mapLayers'].forEach(id=>$(id).addEventListener('click',()=>setTimeout(()=>{S.result.length||S.center||S.rect||S.poly.length?runSearch():mv.draw()},0)));
['mapRadius','mapMinutes','mapGrade'].forEach(id=>$(id).addEventListener('input',()=>{if(S.center||S.rect||S.poly.length)runSearch()}));
$('mapSearch').addEventListener('click',()=>{if(!(S.center||S.rect||S.poly.length>2)){toast('先に地図上で範囲を指定してください');return}runSearch()});
$('mapClear').addEventListener('click',()=>{S.center=null;S.rect=null;S.poly=[];S.result=[];S.sel.clear();renderList();mv.draw()});
$('mapAll').addEventListener('click',()=>{S.showAll=!S.showAll;$('mapAll').textContent=S.showAll?'全車両表示':'該当車両のみ';mv.draw()});
$('mapStyle').addEventListener('click',()=>{document.documentElement.toggleAttribute('data-theme');document.documentElement.setAttribute('data-theme',document.documentElement.hasAttribute('data-theme')?'dark':'light');mv.draw();toast('地図デザインを切り替えました(本番ではZENRINの地図スタイル切替)')});
$('mapRadio').addEventListener('change',()=>{const v=VEH.find(x=>x.radio===$('mapRadio').value.trim());if(!v){toast('該当する無線番号がありません');return}mv.cx=v.x;mv.cy=v.y;mv.scale=0.15;S.sel.add(v.radio);renderList();mv.draw()});
$('zoomIn').addEventListener('click',()=>mv.zoom(1.3));$('zoomOut').addEventListener('click',()=>mv.zoom(1/1.3));$('zoomFit').addEventListener('click',()=>{mv.cx=0;mv.cy=0;mv.scale=0.06;mv.draw()});
$('mapDispatch').addEventListener('click',()=>{if(!S.sel.size){toast('車両を選択してください');return}modal('配車依頼',`<p>選択した ${S.sel.size} 台に配車依頼を送ります。</p><div class="chips">${[...S.sel].map(r=>`<span class="chip" aria-pressed="true">${r}</span>`).join('')}</div>`+`<div class="row"><div class="f"><label>伝票</label><input value="新規伝票(お迎え: ${document.getElementById('from').value})" readonly></div><div class="f"><label>了解待ち秒数</label><input type="number" value="8"></div></div>`,[{label:'依頼する',primary:true,onClick:()=>toast('配車依頼を送信しました')}])});
renderList();

/* ---------- 走行軌跡 ---------- */
const pv=makeView($('pathCanvas'));
let PATH=[];
function genPath(){const from=new Date($('pathFrom').value),to=new Date($('pathTo').value);const n=Math.max(10,Math.min(400,Math.round((to-from)/60000/2)));const r2=seeded(+$('pathRadio').value||1);
  let x=0,y=0,a=r2()*6.28,st='空車';PATH=[];for(let i=0;i<n;i++){a+=(r2()-.5)*1.2;const sp=st==='休憩'?0:200+r2()*500;x+=Math.cos(a)*sp;y+=Math.sin(a)*sp;if(r2()<.08)st=pk(['空車','空車','迎車','実車','実車','回送','休憩']);PATH.push({x,y,t:new Date(+from+(to-from)*i/n),status:st,speed:Math.round(sp/1000/(2/60))})}
  const kind=[...$('pathKind').children].findIndex(b=>b.getAttribute('aria-pressed')==='true');if(kind===1)PATH=PATH.filter(p=>p.status==='実車');if(kind===2)PATH=PATH.filter(p=>p.status==='空車');
  const segs=[];PATH.forEach((p,i)=>{if(!i||p.status!==PATH[i-1].status)segs.push({status:p.status,from:p.t,to:p.t,km:0});const s=segs[segs.length-1];s.to=p.t;if(i)s.km+=Math.hypot(p.x-PATH[i-1].x,p.y-PATH[i-1].y)/1000});
  $('pathCnt').textContent=segs.length;$('pathTook').textContent=`${PATH.length} 点`;
  $('pathSteps').innerHTML=segs.map(s=>`<div class="step"><time>${fmt(s.from).slice(11)}–${fmt(s.to).slice(11)}</time><div><span class="st ${({実車:'ng',迎車:'go',空車:'done'})[s.status]||''}">${s.status}</span> ${s.km.toFixed(1)} km</div></div>`).join('');
  if(PATH.length){pv.cx=PATH.reduce((a,p)=>a+p.x,0)/PATH.length;pv.cy=PATH.reduce((a,p)=>a+p.y,0)/PATH.length;const ex=Math.max(...PATH.map(p=>Math.abs(p.x-pv.cx)),...PATH.map(p=>Math.abs(p.y-pv.cy)));pv.scale=Math.min(0.5,Math.max(0.015,(Math.min(pv.w,pv.h)/2-30)/ex))}
  pv.draw()}
pv.draw=()=>{pv.base();const c=pv.ctx;const opts=[...document.querySelectorAll('#pathOpts .chip[aria-pressed="true"]')].map(b=>b.dataset.v);
  c.lineWidth=3;c.lineCap='round';for(let i=1;i<PATH.length;i++){const a=PATH[i-1],b=PATH[i];c.strokeStyle=opts.includes('speed')?(b.speed<15?'#c0392b':b.speed<30?'#b26b00':'#1f8f4e'):COL[b.status]||'#888';c.beginPath();c.moveTo(...pv.toPx(a.x,a.y));c.lineTo(...pv.toPx(b.x,b.y));c.stroke()}
  PATH.forEach((p,i)=>{const q=pv.toPx(p.x,p.y);if(opts.includes('status')&&(i===0||p.status!==PATH[i-1].status)){c.fillStyle=COL[p.status]||'#888';c.beginPath();c.arc(q[0],q[1],5,0,7);c.fill();c.strokeStyle=CSS('--surface');c.lineWidth=1.5;c.stroke();c.fillStyle=CSS('--fg');c.font='10px '+CSS('--mono');c.fillText(fmt(p.t).slice(11)+' '+p.status,q[0]+7,q[1]+3)}
    if(opts.includes('stop')&&p.speed===0&&i&&PATH[i-1].speed!==0){c.strokeStyle=CSS('--muted');c.lineWidth=1;c.strokeRect(q[0]-4,q[1]-4,8,8)}});
  if(PATH.length){const s=pv.toPx(PATH[0].x,PATH[0].y),e=pv.toPx(PATH[PATH.length-1].x,PATH[PATH.length-1].y);c.fillStyle=CSS('--fg');c.font='bold 11px '+CSS('--sans');c.fillText('開始',s[0]+8,s[1]-8);c.fillText('終了',e[0]+8,e[1]-8)}};
$('pathSearch').addEventListener('click',()=>genPath());
$('pathOpts').addEventListener('click',()=>setTimeout(pv.draw,0));
$('pathKind').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;[...e.currentTarget.children].forEach(x=>x.setAttribute('aria-pressed',x===b));genPath()});

/* ---------- 実データ接続(LIVE) ---------- */
async function liveLoadMap(){
  if(!window.LIVE)return;
  const tl=mv.toWorld(0,0),br=mv.toWorld(mv.w,mv.h);
  $('mapHint').textContent='車両位置を取得中…';
  try{const vs=await LIVE.vehicles([tl[0],tl[1],br[0],br[1]]);VEH.length=0;vs.forEach(v=>VEH.push(v));
    const st=await LIVE.stands();STANDS.length=0;st.forEach(s=>STANDS.push(s));
    $('mapHint').textContent=`表示範囲内 ${VEH.length} 台 / 待機場所 ${STANDS.length}`;if(S.center||S.rect||S.poly.length>2)runSearch();else mv.draw()}
  catch(e){$('mapHint').textContent='取得エラー: '+e.message}
}
{let t;const sched=()=>{if(!window.LIVE)return;clearTimeout(t);t=setTimeout(liveLoadMap,500)};mv.canvas.addEventListener('pointerup',sched);mv.canvas.addEventListener('wheel',sched);$('zoomIn').addEventListener('click',sched);$('zoomOut').addEventListener('click',sched);$('zoomFit').addEventListener('click',sched);setInterval(()=>{if(window.LIVE&&!$('s-map').hidden)liveLoadMap()},20000);
  const origGen=genPath;genPath=async function(){if(!window.LIVE)return origGen();const t0=performance.now();$('pathTook').textContent='取得中…';
    try{PATH=await LIVE.path($('pathRadio').value.trim(),$('pathFrom').value,$('pathTo').value);
      const kind=[...$('pathKind').children].findIndex(b=>b.getAttribute('aria-pressed')==='true');if(kind===1)PATH=PATH.filter(p=>p.status==='実車');if(kind===2)PATH=PATH.filter(p=>p.status==='空車');
      const segs=[];PATH.forEach((p,i)=>{if(!i||p.status!==PATH[i-1].status)segs.push({status:p.status,from:p.t,to:p.t,km:0});const s=segs[segs.length-1];s.to=p.t;if(i)s.km+=Math.hypot(p.x-PATH[i-1].x,p.y-PATH[i-1].y)/1000});
      $('pathCnt').textContent=segs.length;$('pathTook').textContent=`${PATH.length} 点 / ${Math.round(performance.now()-t0)} ms${PATH[0]?' / '+PATH[0].driver:''}`;
      $('pathSteps').innerHTML=segs.map(s=>`<div class="step"><time>${fmt(s.from).slice(11)}–${fmt(s.to).slice(11)}</time><div><span class="st ${({実車:'ng',迎車:'go',空車:'done'})[s.status]||''}">${s.status}</span> ${s.km.toFixed(1)} km</div></div>`).join('')||'<div class="hint">該当する走行データがありません</div>';
      if(PATH.length){pv.cx=PATH.reduce((a,p)=>a+p.x,0)/PATH.length;pv.cy=PATH.reduce((a,p)=>a+p.y,0)/PATH.length;const ex=Math.max(1,...PATH.map(p=>Math.abs(p.x-pv.cx)),...PATH.map(p=>Math.abs(p.y-pv.cy)));pv.scale=Math.min(0.5,Math.max(0.015,(Math.min(pv.w,pv.h)/2-30)/ex))}
      pv.draw()}catch(e){$('pathTook').textContent='エラー: '+e.message;toast(e.message)}}}

document.addEventListener('screen',e=>{const r=e.detail.route;if(r==='map'){mv.resize();mv.draw();liveLoadMap()}if(r==='path'){pv.resize();PATH.length?pv.draw():genPath()}});
if((location.hash||'').includes('map')){mv.resize();mv.draw()}
})();
