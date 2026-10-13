/* driver-finder.js — 乗務員クイック検索(右下フローティング)
   ホシコンのどのページにも <script src="driver-finder.js"></script> 1 行で置ける独立部品。配車コンソールには依存しない。
   データ: /kmx/api/v1/map_vehicles/get_map_vehicle(全車両の位置・乗務員名・無線番号・状態)を定期取得し、名前で検索。
          住所は /kmx/api/v1/trip_infos/get_address(緯度経度→住所)。車両番号は map_vehicles/get_vehicle_info(vehicleId)から取れれば表示。
   設定: <script> の前に window.DRIVER_FINDER = { apiBase:'/kmx/api/v1/', refreshSec:60, mock:false, hotkey:'/' } を置く(省略可)。
   同一オリジンに /kmx/api/v1 がある前提(Cloudflare Worker のプロキシ配下、または inject/bridge 経由)。 */
(function(){
  const CFG=Object.assign({apiBase:'/kmx/api/v1/',refreshSec:60,mock:false,hotkey:'/',bbox:{nwLat:35.95,nwLon:139.30,seLat:35.45,seLon:140.10},transport:null},window.DRIVER_FINDER||{});
  const VST={0:'空車',1:'実車',2:'迎車',3:'回送',4:'支払',6:'サンド',10:'端末なし',20:'乗務員なし',30:'休憩',90:'配車指示中',99:'不明'};
  const VCOL={空車:'#1f8f4e',実車:'#c0392b',迎車:'#2b5fb3',支払:'#b26b00',回送:'#b26b00',休憩:'#7a8699',配車指示中:'#8e44ad'};
  const css=`
  .dfw{position:fixed;right:16px;bottom:16px;z-index:9000;font:13px/1.5 "Noto Sans JP",system-ui,-apple-system,"Segoe UI",sans-serif;color:#1b2430}
  .dfw *{box-sizing:border-box}
  .dfw [hidden]{display:none!important}
  .dfw-fab{display:flex;align-items:center;gap:8px;background:#0f6e74;color:#fff;border:0;border-radius:999px;padding:10px 16px;font-weight:600;box-shadow:0 6px 24px rgba(0,0,0,.18);cursor:pointer}
  .dfw-fab kbd{font:11px ui-monospace,Menlo,monospace;background:rgba(255,255,255,.2);padding:1px 6px;border-radius:4px}
  .dfw-panel{width:min(380px,calc(100vw - 32px));background:#fff;border:1px solid #d5dbe3;border-radius:12px;box-shadow:0 10px 32px rgba(0,0,0,.2);overflow:hidden}
  .dfw-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #e9edf2;background:#f3f5f8}
  .dfw-head b{flex:1;font-size:13px}
  .dfw-head small{color:#5d6b7c}
  .dfw-x{background:none;border:0;font-size:16px;cursor:pointer;color:#5d6b7c;padding:0 4px}
  .dfw-in{width:100%;padding:10px 12px;border:0;border-bottom:1px solid #e9edf2;font-size:15px;outline:none}
  .dfw-list{max-height:min(50vh,360px);overflow:auto}
  .dfw-item{display:grid;grid-template-columns:auto 1fr auto;gap:4px 10px;padding:9px 12px;border-bottom:1px solid #f0f2f5;cursor:pointer;align-items:center}
  .dfw-item:hover,.dfw-item.on{background:#d9eef0}
  .dfw-item .no{font:600 17px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.02em}
  .dfw-item .nm{font-weight:600}
  .dfw-item .st{font-size:11px;color:#fff;border-radius:999px;padding:1px 8px;white-space:nowrap}
  .dfw-item .ad{grid-column:1/-1;color:#5d6b7c;font-size:12px;min-height:16px}
  .dfw-item .pl{grid-column:1/-1;font-size:12px;color:#1b2430}
  .dfw-foot{display:flex;gap:8px;align-items:center;padding:8px 12px;font-size:11px;color:#5d6b7c;background:#f3f5f8}
  .dfw-foot .sp{flex:1}
  .dfw-foot button{border:1px solid #d5dbe3;background:#fff;border-radius:6px;padding:3px 8px;font-size:11px;cursor:pointer}
  .dfw-empty{padding:16px 12px;color:#5d6b7c;font-size:12px}
  @media (prefers-color-scheme:dark){.dfw{color:#e8edf2}.dfw-panel{background:#1a2129;border-color:#334050}.dfw-head,.dfw-foot{background:#232c36}.dfw-head,.dfw-in,.dfw-item{border-color:#334050}.dfw-in{background:#1a2129;color:#e8edf2}.dfw-item:hover,.dfw-item.on{background:#163b3e}.dfw-item .pl{color:#e8edf2}.dfw-foot button{background:#1a2129;color:#e8edf2;border-color:#334050}}`;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  /* ---- データ ---- */
  const call=CFG.transport||(async(path,params)=>{const u=new URL(CFG.apiBase+path,location.origin);Object.entries(params||{}).forEach(([k,v])=>u.searchParams.set(k,v??''));u.searchParams.set('_',Date.now());const r=await fetch(u,{credentials:'include'});return r.json()});
  let vehicles=[],loadedAt=null,loadErr=null; const addrCache=new Map(), plateCache=new Map();
  const norm=s=>String(s||'').replace(/[\s　]+/g,'').normalize('NFKC');
  const toHira=s=>s.replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
  async function load(){
    try{
      let list;
      if(CFG.mock){list=mock()}else{const r=await call('map_vehicles/get_map_vehicle',{northwestLat:CFG.bbox.nwLat,northwestLon:CFG.bbox.nwLon,southeastLat:CFG.bbox.seLat,southeastLon:CFG.bbox.seLon});if(!r.isSuccess)throw new Error((r.msgs||[]).map(m=>m.msg).join(' ')||'取得失敗');list=r.vehiclePointList||[]}
      vehicles=list.map(v=>({radio:v.wirelessLineNumber,vehicleId:v.vehicleId,plate:v.plate||'',name:[v.lastName,v.firstName].map(s=>String(s||'').trim()).filter(Boolean).join(' '),key:norm(v.lastName)+norm(v.firstName),status:VST[v.status]||('状態'+v.status),lat:+v.latitude,lon:+v.longitude,excluded:v.dispatchExcluded==='1'}));
      loadedAt=new Date();loadErr=null;
    }catch(e){loadErr=e.message}
    renderFoot(); if(input.value)render();
  }
  async function address(v){const k=v.lat.toFixed(4)+','+v.lon.toFixed(4);if(addrCache.has(k))return addrCache.get(k);
    const p=CFG.mock?Promise.resolve('板橋区坂下1-22-10 付近'):call('trip_infos/get_address',{latitude:v.lat,longitude:v.lon}).then(r=>r.address||'(住所不明)').catch(()=>'(住所取得エラー)');addrCache.set(k,p);return p}
  async function plate(v){if(v.plate)return v.plate;if(!v.vehicleId)return '';if(plateCache.has(v.vehicleId))return plateCache.get(v.vehicleId);
    const p=CFG.mock?Promise.resolve('板橋 500 あ 12-34'):call('map_vehicles/get_vehicle_info',{vehicleId:v.vehicleId}).then(r=>{const o=r.vehicleInfo||r;const f=o.vehicleNumber||o.carNumber||o.number||o.plateNumber||Object.entries(o).find(([k])=>/number|plate|車両番号/i.test(k)&&!/wireless|phone/i.test(k))?.[1];return f?String(f):''}).catch(()=>'');plateCache.set(v.vehicleId,p);return p}
  function mock(){const n=['山田 太郎','佐々木 一郎','高橋 花子','井上 健','松本 大輔','小林 彩','田中 実','渡辺 由紀'];return n.map((x,i)=>{const [l,f]=x.split(' ');return{wirelessLineNumber:String(5500+i*7),vehicleId:String(100+i),lastName:l,firstName:f,status:String([0,1,2,0,4,30,0,1][i]),latitude:35.78+i*0.004,longitude:139.68+i*0.006,dispatchExcluded:'0'}})}

  /* ---- UI ---- */
  const root=document.createElement('div');root.className='dfw';
  root.innerHTML=`<button class="dfw-fab" type="button" aria-expanded="false">乗務員検索 <kbd>${CFG.hotkey==='/'?'Ctrl+/':CFG.hotkey}</kbd></button>
  <div class="dfw-panel" hidden><div class="dfw-head"><b>乗務員を探す</b><small id="dfw-cnt"></small><button class="dfw-x" type="button" aria-label="閉じる">✕</button></div>
  <input class="dfw-in" type="search" placeholder="名前を入力(姓だけでも可)" autocomplete="off" aria-label="乗務員名">
  <div class="dfw-list"></div>
  <div class="dfw-foot"><span id="dfw-upd"></span><span class="sp"></span><button type="button" id="dfw-reload">更新</button></div></div>`;
  document.body.appendChild(root);
  const fab=root.querySelector('.dfw-fab'),panel=root.querySelector('.dfw-panel'),input=root.querySelector('.dfw-in'),list=root.querySelector('.dfw-list'),cnt=root.querySelector('#dfw-cnt'),upd=root.querySelector('#dfw-upd');
  let sel=0,results=[];
  function open(){panel.hidden=false;fab.hidden=true;fab.setAttribute('aria-expanded','true');input.focus();input.select();if(!loadedAt)load();render()}
  function close(){panel.hidden=true;fab.hidden=false;fab.setAttribute('aria-expanded','false')}
  fab.addEventListener('click',open);root.querySelector('.dfw-x').addEventListener('click',close);
  root.querySelector('#dfw-reload').addEventListener('click',()=>{upd.textContent='更新中…';load()});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key===CFG.hotkey){e.preventDefault();open()}if(e.key==='Escape'&&!panel.hidden)close()});
  input.addEventListener('input',()=>{sel=0;render()});
  input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){sel=Math.min(sel+1,results.length-1);render();e.preventDefault()}if(e.key==='ArrowUp'){sel=Math.max(sel-1,0);render();e.preventDefault()}if(e.key==='Enter'&&results[sel]){copy(results[sel].radio)}});
  list.addEventListener('click',e=>{const it=e.target.closest('.dfw-item');if(!it)return;sel=+it.dataset.i;render();const c=e.target.closest('[data-copy]');if(c)copy(c.dataset.copy)});
  function copy(t){navigator.clipboard?.writeText(t).then(()=>{upd.textContent=`無線番号 ${t} をコピーしました`;setTimeout(renderFoot,2000)}).catch(()=>{})}
  function renderFoot(){cnt.textContent=vehicles.length?`${vehicles.length}台 稼働中`:'';upd.textContent=loadErr?`取得エラー: ${loadErr}`:loadedAt?`位置情報 ${loadedAt.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})} 時点`:'読込中…'}
  function render(){
    const q=norm(input.value);const qh=toHira(q);
    results=q?vehicles.filter(v=>v.key.includes(q)||toHira(v.key).includes(qh)).slice(0,8):[];
    if(!q){list.innerHTML=`<div class="dfw-empty">名前を入力すると、今日その人が乗っている車の無線番号と現在地を表示します。${loadErr?'<br>'+loadErr:''}</div>`;return}
    if(!results.length){list.innerHTML=`<div class="dfw-empty">「${input.value}」に一致する稼働中の乗務員はいません(出庫前・退勤後は表示されません)</div>`;return}
    list.innerHTML=results.map((v,i)=>`<div class="dfw-item ${i===sel?'on':''}" data-i="${i}"><span class="no" title="無線番号">${v.radio}</span><span class="nm">${v.name}</span><span class="st" style="background:${VCOL[v.status]||'#7a8699'}">${v.status}${v.excluded?'(配車対象外)':''}</span><span class="pl" id="dfw-pl-${i}"></span><span class="ad" id="dfw-ad-${i}">住所を取得中…</span></div>`).join('');
    results.forEach((v,i)=>{address(v).then(a=>{const el=root.querySelector('#dfw-ad-'+i);if(el&&results[i]===v)el.textContent='現在地: '+a});plate(v).then(p=>{const el=root.querySelector('#dfw-pl-'+i);if(el&&results[i]===v)el.innerHTML=(p?`車番 <b>${p}</b> ／ `:'')+`無線 <button type="button" data-copy="${v.radio}" style="border:1px solid #d5dbe3;background:transparent;border-radius:4px;padding:0 6px;cursor:pointer;font:inherit">${v.radio} をコピー</button>`})});
  }
  load(); setInterval(load,Math.max(20,CFG.refreshSec)*1000);
})();
