/* driver-finder.js — 乗務員クイック検索（ホシコン管理画面の右下フローティング）
   流れ: 名前（漢字・フリガナ・社員番号）を入力 → 社員台帳から候補 → 選択 → その人が今乗っている車（車番・無線番号・状態・現在地）を表示。
   データ: window.DRIVER_FINDER.transport(path, params) 経由でホシコンの中継APIを呼ぶ。
     'employees/search'                 → { results:[{empNo,name,kana,division,team,usualCars}] }
     'map_vehicles/get_map_vehicle'     → { isSuccess, vehiclePointList:[{wirelessLineNumber,vehicleId,lastName,firstName,status,latitude,longitude,dispatchExcluded,plate}] }
     'trip_infos/get_address'           → { address }
   設定: window.DRIVER_FINDER = { refreshSec:60, hotkey:'/', transport } */
(function(){
  var CFG=Object.assign({refreshSec:60,hotkey:'/',transport:null},window.DRIVER_FINDER||{});
  if(!CFG.transport){console.warn('driver-finder: transport が未設定です');return}
  var VST={0:'空車',1:'実車',2:'迎車',3:'回送',4:'支払',6:'サンド',10:'端末なし',20:'乗務員なし',30:'休憩',90:'配車指示中',99:'不明'};
  var VCOL={空車:'#15803d',実車:'#b91c1c',迎車:'#1d4ed8',支払:'#b45309',回送:'#b45309',休憩:'#6b7280',配車指示中:'#7c3aed'};
  var css=''+
  '.dfw{position:fixed;right:16px;bottom:16px;z-index:9000;font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Meiryo",sans-serif;font-size:13px;line-height:1.5;color:#1f2937}'+
  '.dfw *{box-sizing:border-box}.dfw [hidden]{display:none!important}'+
  '.dfw-fab{display:flex;align-items:center;gap:8px;background:#1e3a5f;color:#fff;border:0;border-radius:999px;padding:10px 16px;font-size:13px;font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.18);cursor:pointer}'+
  '.dfw-fab kbd{font:11px ui-monospace,Menlo,monospace;background:rgba(255,255,255,.18);padding:1px 6px;border-radius:4px}'+
  '.dfw-panel{width:min(400px,calc(100vw - 32px));background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.18);overflow:hidden}'+
  '.dfw-head{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#1e3a5f;color:#fff}'+
  '.dfw-head b{flex:1;font-size:13px;font-weight:700}.dfw-head small{font-size:11px;opacity:.85}'+
  '.dfw-x{background:none;border:0;font-size:16px;cursor:pointer;color:#fff;padding:0 4px;line-height:1}'+
  '.dfw-body{padding:12px 14px}'+
  '.dfw-in{width:100%;padding:9px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:15px;outline:none;background:#fff;color:#1f2937}'+
  '.dfw-in:focus{border-color:#1e3a5f;box-shadow:0 0 0 3px rgba(30,58,95,.12)}'+
  '.dfw-list{max-height:min(40vh,300px);overflow:auto;margin-top:8px;border:1px solid #e5e7eb;border-radius:8px}'+
  '.dfw-cand{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #f3f4f6;cursor:pointer}'+
  '.dfw-cand:last-child{border-bottom:0}.dfw-cand:hover,.dfw-cand.on{background:#eef2f7}'+
  '.dfw-cand .nm{font-weight:700;color:#1e3a5f}.dfw-cand .meta{font-size:11px;color:#6b7280}.dfw-cand .sp{flex:1}'+
  '.dfw-live{font-size:10px;font-weight:700;color:#15803d;background:#dcfce7;border-radius:999px;padding:1px 7px;white-space:nowrap}'+
  '.dfw-res{margin-top:10px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px}'+
  '.dfw-res .who{font-size:14px;font-weight:700;color:#1e3a5f;display:flex;align-items:center;gap:8px;flex-wrap:wrap}'+
  '.dfw-res .who small{font-size:11px;color:#6b7280;font-weight:600}'+
  '.dfw-res .st{font-size:11px;color:#fff;border-radius:999px;padding:1px 8px;white-space:nowrap;font-weight:700}'+
  '.dfw-res .big{display:flex;align-items:baseline;gap:14px;margin:8px 0 4px}'+
  '.dfw-res .big .lbl{font-size:11px;color:#6b7280;font-weight:600}.dfw-res .big .val{font:700 24px ui-monospace,Menlo,Consolas,monospace;color:#1f2937;letter-spacing:.02em}'+
  '.dfw-res .ad{font-size:12px;color:#374151;margin-top:4px}.dfw-res .note{font-size:11px;color:#6b7280;margin-top:6px}'+
  '.dfw-res .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.dfw-res .chip{font-size:12px;border:1px solid #d1d5db;background:#fff;border-radius:999px;padding:2px 10px}'+
  '.dfw-btn{border:1px solid #d1d5db;background:#fff;border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer;color:#374151}'+
  '.dfw-foot{display:flex;gap:8px;align-items:center;padding:8px 14px;font-size:11px;color:#6b7280;background:#f8fafc;border-top:1px solid #e5e7eb}.dfw-foot .sp{flex:1}'+
  '.dfw-empty{padding:10px 2px;color:#6b7280;font-size:12px}';
  var st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  /* ---- データ ---- */
  var call=CFG.transport;
  var vehicles=[],loadedAt=null,loadErr=null,addrCache={};
  var norm=function(s){return String(s||'').replace(/[\s　]+/g,'').normalize('NFKC')};
  function load(){
    return call('map_vehicles/get_map_vehicle',{}).then(function(r){
      if(!r||!r.isSuccess)throw new Error((r&&r.msgs||[]).map(function(m){return m.msg}).join(' ')||'取得失敗');
      vehicles=(r.vehiclePointList||[]).map(function(v){return{radio:String(v.wirelessLineNumber||''),plate:v.plate||'',name:[v.lastName,v.firstName].map(function(x){return String(x||'').trim()}).filter(Boolean).join(' '),key:norm(v.lastName)+norm(v.firstName),status:VST[v.status]||('状態'+v.status),lat:+v.latitude,lon:+v.longitude,excluded:v.dispatchExcluded==='1'}});
      loadedAt=new Date();loadErr=null;
    }).catch(function(e){loadErr=e.message}).then(function(){renderFoot();if(selected)showResult(selected);else if(input.value)renderCands()});
  }
  function address(v){var k=v.lat.toFixed(4)+','+v.lon.toFixed(4);if(addrCache[k])return addrCache[k];
    var p=call('trip_infos/get_address',{latitude:v.lat,longitude:v.lon}).then(function(r){return (r&&r.address)||'（住所不明）'}).catch(function(){return '（住所取得エラー）'});addrCache[k]=p;return p}
  function liveOf(emp){var k=norm(emp.name);return vehicles.filter(function(v){return v.key===k})}

  /* ---- UI ---- */
  var root=document.createElement('div');root.className='dfw';
  root.innerHTML='<button class="dfw-fab" type="button" aria-expanded="false">乗務員検索 <kbd>'+(CFG.hotkey==='/'?'Ctrl+/':CFG.hotkey)+'</kbd></button>'+
  '<div class="dfw-panel" hidden><div class="dfw-head"><b>乗務員を探す</b><small id="dfw-cnt"></small><button class="dfw-x" type="button" aria-label="閉じる">×</button></div>'+
  '<div class="dfw-body"><input class="dfw-in" type="search" placeholder="名前・フリガナ・社員番号を入力" autocomplete="off" aria-label="乗務員名">'+
  '<div class="dfw-list" hidden></div><div class="dfw-res" hidden></div><div class="dfw-empty" id="dfw-hint">名前を入力すると候補が出ます。選ぶと、今乗っている車の車番・無線番号・現在地を表示します。</div></div>'+
  '<div class="dfw-foot"><span id="dfw-upd"></span><span class="sp"></span><button type="button" class="dfw-btn" id="dfw-reload">位置を更新</button></div></div>';
  document.body.appendChild(root);
  var $=function(sel){return root.querySelector(sel)};
  var fab=$('.dfw-fab'),panel=$('.dfw-panel'),input=$('.dfw-in'),list=$('.dfw-list'),res=$('.dfw-res'),hint=$('#dfw-hint'),cnt=$('#dfw-cnt'),upd=$('#dfw-upd');
  var cands=[],sel=0,selected=null,timer=null,seq=0;
  function open(){panel.hidden=false;fab.hidden=true;fab.setAttribute('aria-expanded','true');input.focus();input.select();if(!loadedAt)load()}
  function close(){panel.hidden=true;fab.hidden=false;fab.setAttribute('aria-expanded','false')}
  fab.addEventListener('click',open);$('.dfw-x').addEventListener('click',close);
  $('#dfw-reload').addEventListener('click',function(){upd.textContent='更新中…';load()});
  document.addEventListener('keydown',function(e){if((e.ctrlKey||e.metaKey)&&e.key===CFG.hotkey){e.preventDefault();open()}if(e.key==='Escape'&&!panel.hidden)close()});
  input.addEventListener('input',function(){selected=null;res.hidden=true;clearTimeout(timer);timer=setTimeout(search,200)});
  input.addEventListener('compositionend',function(){clearTimeout(timer);timer=setTimeout(search,50)});
  input.addEventListener('keydown',function(e){
    if(list.hidden)return;
    if(e.key==='ArrowDown'){sel=Math.min(sel+1,cands.length-1);renderCands();e.preventDefault()}
    if(e.key==='ArrowUp'){sel=Math.max(sel-1,0);renderCands();e.preventDefault()}
    if(e.key==='Enter'&&cands[sel]){choose(cands[sel]);e.preventDefault()}
  });
  list.addEventListener('click',function(e){var it=e.target.closest('.dfw-cand');if(it)choose(cands[+it.dataset.i])});
  res.addEventListener('click',function(e){var b=e.target.closest('[data-copy]');if(b)copy(b.dataset.copy)});
  function copy(t){if(!navigator.clipboard)return;navigator.clipboard.writeText(t).then(function(){upd.textContent='「'+t+'」をコピーしました';setTimeout(renderFoot,2000)}).catch(function(){})}
  function renderFoot(){cnt.textContent=vehicles.length?vehicles.length+'台 稼働中':'';upd.textContent=loadErr?'位置情報の取得エラー: '+loadErr:loadedAt?'位置情報 '+loadedAt.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})+' 時点':'位置情報を読込中…'}

  function search(){
    var q=input.value.trim();sel=0;
    if(!q){cands=[];list.hidden=true;hint.hidden=false;return}
    var my=++seq;
    call('employees/search',{q:q}).then(function(r){
      if(my!==seq)return;
      cands=(r&&r.results)||[];renderCands();
    }).catch(function(){if(my!==seq)return;cands=[];renderCands()});
  }
  function renderCands(){
    hint.hidden=true;
    if(!input.value.trim()){list.hidden=true;hint.hidden=false;return}
    if(!cands.length){list.innerHTML='<div class="dfw-empty" style="padding:10px 12px">「'+esc(input.value)+'」に一致する社員がいません</div>';list.hidden=false;return}
    list.innerHTML=cands.map(function(c,i){var live=liveOf(c).length;var dt=(c.division?c.division+'課':'')+(c.team?' '+c.team+'班':'');
      return '<div class="dfw-cand'+(i===sel?' on':'')+'" data-i="'+i+'"><span class="nm">'+esc(c.name)+'</span><span class="meta">'+esc(c.kana)+(dt?'　'+dt:'')+'　'+esc(c.empNo)+'</span><span class="sp"></span>'+(live?'<span class="dfw-live">稼働中</span>':'')+'</div>'}).join('');
    list.hidden=false;
  }
  function choose(c){selected=c;list.hidden=true;input.value=c.name;showResult(c)}
  function showResult(c){
    var lives=liveOf(c);var dt=(c.division?c.division+'課':'')+(c.team?' '+c.team+'班':'');
    var head='<div class="who">'+esc(c.name)+'<small>'+esc(c.kana)+(dt?'　'+dt:'')+'　'+esc(c.empNo)+'</small>'+(lives[0]?'<span class="st" style="background:'+(VCOL[lives[0].status]||'#6b7280')+'">'+esc(lives[0].status)+(lives[0].excluded?'（配車対象外）':'')+'</span>':'')+'</div>';
    if(!lives.length){
      res.innerHTML=head+'<div class="note">現在は稼働中の車に見つかりません（出庫前・退勤後・休憩中の端末オフなど）。'+(loadErr?'<br>'+esc(loadErr):'')+'</div>'+
        (c.usualCars&&c.usualCars.length?'<div class="note">よく使う車番</div><div class="chips">'+c.usualCars.map(function(x){return '<span class="chip">'+esc(x)+'</span>'}).join('')+'</div>':'');
      res.hidden=false;return;
    }
    var v=lives[0];
    var car=v.plate||v.radio;
    res.innerHTML=head+'<div class="big"><span><span class="lbl">車番</span><br><span class="val">'+esc(car)+'</span></span>'+
      '<span style="align-self:center"><button type="button" class="dfw-btn" data-copy="'+esc(car)+'">車番をコピー</button></span></div>'+
      '<div class="ad" id="dfw-ad">現在地を取得中…</div>'+(lives.length>1?'<div class="note">同じ名前の稼働車が '+lives.length+' 台あります（車番 '+lives.map(function(x){return x.plate||x.radio}).join(' / ')+'）</div>':'')+
      '<div class="note">'+(loadedAt?loadedAt.toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})+' 時点の位置':'')+'</div>';
    res.hidden=false;
    address(v).then(function(a){var el=$('#dfw-ad');if(el&&selected===c)el.textContent='現在地: '+a});
  }
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(ch){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]})}
  load();setInterval(load,Math.max(20,CFG.refreshSec)*1000);
})();
