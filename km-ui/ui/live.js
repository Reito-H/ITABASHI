/* live.js — 実サーバー(/kmx/api/v1)への接続層。
   window.__KMX = { operatorId, apiBase } が設定されている時だけ有効(inject.js が設定する)。
   読み取り専用: 伝票の作成・更新・メッセージ送信などの書き込み API は呼びません。 */
/* 接続方法は 2 つ:
   A) 同一オリジン: window.__KMX が設定済み(inject.js / 本番配置) → fetch で直接呼ぶ
   B) プロキシ: ?proxy=1 で開かれ、window.opener(ログイン済みの km-operator タブ)が postMessage で API を中継する */
function activateLive(K, transport){
const $=id=>document.getElementById(id);
const base=(K.apiBase||'')+'/kmx/api/v1/';
const call=transport||(async(path,params)=>{const u=new URL(base+path,location.origin);Object.entries(params||{}).forEach(([k,v])=>u.searchParams.set(k,Array.isArray(v)?v.join(','):(v??'')));u.searchParams.set('_',Date.now());const r=await fetch(u,{credentials:'include'});return r.json()});
const LAT0=35.7865,LON0=139.6835; // 板橋営業所付近を原点にした簡易平面(m)
const toXY=(lat,lon)=>[(+lon-LON0)*Math.cos(LAT0*Math.PI/180)*111320,-(+lat-LAT0)*110540];
const toLL=(x,y)=>[LAT0-y/110540,LON0+x/(Math.cos(LAT0*Math.PI/180)*111320)];
const VST={0:'空車',1:'実車',2:'迎車',3:'回送',4:'支払',6:'サンド',10:'端末なし',20:'乗務員なし',30:'休憩',90:'配車指示中',99:'不明'};
const TST={100:'新規',120:'予約確認待ち',121:'予約未配車',130:'配車中',131:'配車済み(不足)',132:'配車不能',140:'通し待ち',150:'現着報告待ち',160:'対応中',200:'処理完了',800:'お断り',900:'取消'};
const TSTC=Object.fromEntries(Object.entries(TST).map(([k,v])=>[v,k])); TSTC['配車済み']='131';
const CHC={電話:'1',Web:'2',スマホ:'3',IVR:'4'};
const pad=n=>String(n).padStart(2,'0');
const fmtD=d=>`${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

API.mode='live';
API.get=async(path,q)=>{
  if(path==='ticket_searches/search'){
    const types=q.types||[]; const tt=types.includes('問合せ')?'4':types.includes('忘れ物')?'5':(types.includes('即時')&&types.includes('予約'))||!types.length?'3':types.includes('即時')?'1':'2';
    const p={ticketNumber:q.ticketNumber,operatorName:q.operator,selectDate:q.selectDate,prearrangedSearchFlg:'0',dateFrom:q.dateFrom,dateTo:q.dateTo,ticketType:tt,
      channelList:(q.channels||[]).map(c=>CHC[c]).filter(Boolean),ticketStatusList:(q.statuses||[]).map(s=>TSTC[s]).filter(Boolean),
      customerLastNameKana:'',customerFirstNameKana:'',customerPhoneNumber:q.tel,customerPhoneNumber2:'',passengerLastNameKana:q.kana,passengerFirstNameKana:'',wirelessLineNumber:q.radio,customerNumber:'',customerCompanyName:'',
      customerRankIdList:'',customerKindList:'',departureAddress:'',bywayAddress:'',destinationAddress:'',selectProduct:'0',packageIdList:'',reportNeeded:'99',lineList:'',callingNumber:'',nonNotification:'0',trackingNeeded:'99',throughNeeded:'99',notSupposed:'99',canceled:'99',earlyReserved:'99',reservedAutoDispatch:'99',reservedFee:'99',reservedConfirm:'99',
      dispatchDriverName:q.driver,dispatchOperatorName:'',dispatchStatus:'99',gradeList:'',colorList:'',makerList:'',carTypeList:'',occurrenceAtFrom:'',occurrenceAtTo:'',number:'',qaDriverName:'',qaTargetList:'',qaTypeList:'',leftBehindTypeList:'',
      operatorId:K.operatorId,order:'8',limit:q.limit||50,pageNo:q.pageNo||1};
    const res=await call(path,p);
    (res.ticketDatas||[]).forEach(r=>{r.dispatchDriver=[r.dispatchDriverLastName,r.dispatchDriverFirstName].filter(Boolean).join(' ');r.ticketType=r.dispatchType||'';r.operatorLastName=[r.operatorLastName,r.operatorFirstName].filter(Boolean).join(' ');r.passengerNameKana=r.passengerNameKana||[r.customerLastNameKana,r.customerFirstNameKana].filter(Boolean).join(' ')});
    if(q.sortKey&&res.ticketDatas){const k=q.sortKey;res.ticketDatas.sort((a,b)=>{const c=String(a[k]||'')<String(b[k]||'')?-1:String(a[k]||'')>String(b[k]||'')?1:0;return q.sortDir==='asc'?c:-c})}
    return res;
  }
  return call(path,q);
};
API.post=async(path)=>{toast(`ライブ接続は読み取り専用です(${path} は呼びません)`);return {isSuccess:false,msgs:[{msg:'読み取り専用モード'}]}};

/* 通知バー: 実カウント */
async function notices(){
  const ep=[['予約未配車','ticket_notices/get_registered_ticket_count','warn'],['予約確認待ち','ticket_notices/get_reserved_confirm_waiting_ticket_count','warn'],['通し待ち','ticket_notices/get_waiting_ticket_count','info'],['事前割当','ticket_notices/get_prearranged_ticket_count',''],['自動配車','ticket_notices/get_auto_dispatch_count',''],['要追跡','ticket_notices/get_tracking_needed','info']];
  const out=[];
  for(const [l,p,c] of ep){try{const r=await call(p);const n=+(r.count??r.trackingNeededCount??(Array.isArray(r.ticketNumbers)?r.ticketNumbers.length:0))||0;out.push(`<span class="pill ${n>0?c:''}">${l}<b>${n}</b></span>`)}catch(e){}}
  try{const s=await call('sos_accepts/check');const n=s.isSuccess&&s.sosAccept?1:0;out.push(`<span class="pill ${n?'crit':''}">SOS<b>${n}</b></span>`)}catch(e){}
  try{const m=await call('ticket_notices/get_unchecked_driver_message');out.push(`<span class="pill">乗務員連絡 未読<b>${+(m.count||0)}</b></span>`)}catch(e){}
  out.push('<span class="pill info">LIVE 実データ(読み取り専用)</span>');
  $('notices').innerHTML=out.join('');
}
notices(); setInterval(notices,30000);

/* 営業情報(営業履歴) */
window.LIVE={
  async trips(q){
    const date=fmtD(new Date(q.date));
    const res=await call('trip_infos/search',{wirelessLineNumber:q.radio,userName:q.driver,date});
    if(!res.isSuccess)throw new Error((res.msgs||[]).map(m=>m.msg).join(' '));
    const rows=[];
    for(const t of (res.tripInfoList||[])){
      const sts=t.tripStatusList||[]; const first=sts[0],last=sts[sts.length-1];
      const st=t.onServiceAt?'実車':(first?first.status:'');
      const row={radio:res.wirelessLineNumber,driver:res.driverName,status:st,start:new Date((t.onServiceAt||first?.date||'').replace(/-/g,'/')),end:new Date((t.outServiceAt||last?.date||'').replace(/-/g,'/')),from:'',to:'',km:t.distance?(+t.distance/1000).toFixed(1):'',fare:+t.fare||0,ticket:t.ticketNumber||'',fromLL:t.onServiceLatitude?[t.onServiceLatitude,t.onServiceLongitude]:null,toLL:t.outServiceLatitude?[t.outServiceLatitude,t.outServiceLongitude]:null,statuses:sts.map(s=>`${s.date.slice(11)} ${s.status}`).join(' → '),customer:t.customerFullNameKana||t.customerName||''};
      rows.push(row);
    }
    if(q.addr){await Promise.all(rows.slice(0,40).map(async r=>{try{if(r.fromLL){const a=await call('trip_infos/get_address',{latitude:r.fromLL[0],longitude:r.fromLL[1]});r.from=a.address||''}if(r.toLL){const a=await call('trip_infos/get_address',{latitude:r.toLL[0],longitude:r.toLL[1]});r.to=a.address||''}}catch(e){}}))}
    return {rows,header:{driver:res.driverName,shift:res.shift,close:res.expectedCloseAt,count:res.tripCount,sales:res.totalSales}};
  },
  async drivers(kana){const r=await call('trip_infos/search_driver',{lastNameKana:kana,firstNameKana:''});return r.driverInfoList||[]},
  async vehicles(bbox){ // bbox: [x1,y1,x2,y2] 平面(m)
    const nw=toLL(bbox[0],bbox[1]),se=toLL(bbox[2],bbox[3]);
    const r=await call('map_vehicles/get_map_vehicle',{northwestLat:nw[0],northwestLon:nw[1],southeastLat:se[0],southeastLon:se[1]});
    return (r.vehiclePointList||[]).map(v=>{const [x,y]=toXY(v.latitude,v.longitude);return{radio:v.wirelessLineNumber,driver:[v.lastName,v.firstName].filter(Boolean).join(' ').trim(),office:'',status:VST[v.status]||('ステータス'+v.status),grade:'',color:'',plate:'',x,y,heading:+v.bearing||0,vehicleId:v.vehicleId,excluded:v.dispatchExcluded==='1'}});
  },
  async stands(){const r=await call('map_searches/get_taxi_stand');return (r.taxiStandList||[]).map(s=>{const [x,y]=toXY(s.latitude,s.longitude);return{name:s.name,x,y,n:+s.waitingVehicles||0,shortage:!!s.vehicleShortage}})},
  async path(radio,from,to){
    const r=await call('running_paths/search',{wirelessLineNumber:radio,dateFrom:fmtD(new Date(from)),dateTo:fmtD(new Date(to)),time:'1'});
    if(!r.isSuccess)throw new Error((r.msgs||[]).map(m=>m.msg).join(' '));
    const pts=(r.runningPathList||[]).map(p=>{const [x,y]=toXY(p.latitude,p.longitude);return{x,y,t:new Date(p.date.replace(/-/g,'/')),status:VST[p.status]||'不明',speed:0,driver:p.driver}});
    for(let i=1;i<pts.length;i++){const dt=(pts[i].t-pts[i-1].t)/3600000;pts[i].speed=dt>0?Math.round(Math.hypot(pts[i].x-pts[i-1].x,pts[i].y-pts[i-1].y)/1000/dt):0}
    return pts;
  },
  async masters(name){
    const KNOWN={'グレード':['grade_types/search'],'色':['colors/search'],'メーカー':['makers/search'],'車種':['car_types/search'],'営業所':['offices/search'],'会員優先度':['customer_ranks/search'],'商品種別':['product_types/search'],'商品情報':['products/search'],'待機場所':['taxi_stand_infos/search'],
      'ユーザー':['users/search'],'顧客':['customers/search'],'車両':['vehicles/search'],'乗務員':['drivers/search'],
      'システム種別':['system_types/search?type=1','system_types/search?type=2','system_types/search?type=3']};
    const GUESS={'形状':['shapes/search','vehicle_shapes/search','car_shapes/search'],'燃料':['fuels/search','fuel_types/search'],'ロール':['roles/search'],'ロール制限':['role_restrictions/search','role_limits/search'],'特別顧客':['particular_customers/search'],'企業':['companies/search','enterprises/search','corporations/search'],
      'スキル':['skills/search','driver_skills/search'],'乗務員連絡':['driver_messages/search'],'タクシー料金':['taxi_fares/search','fares/search'],'スマホ即時VIP優先設定':['sp_vip_priorities/search','sp_immediate_vip_settings/search'],'車両予約枠':['vehicle_reserve_capacities/search','reserve_capacities/search'],'予約枠係数':['reserve_capacity_rates/search','reserve_coefficients/search'],
      '配車ルール':['dispatch_rules/search'],'時間ゲタマスタ':['time_offsets/search','time_getas/search'],'エリア':['areas/search'],'配車先':['dispatch_destinations/search','dispatch_points/search'],'滞留禁止':['no_stay_areas/search','stay_prohibitions/search'],'タクシー付け場所':['approach_points/search','taxi_approach_points/search'],'住宅地図文字図形':['residential_map_figures/search','character_figures/search'],
      '待機場所要求台数':['taxi_stand_demands/search','taxi_stand_required_vehicles/search'],'会社グループ':['company_groups/search'],'会社':['companies/search'],'スマホシステム設定':['sp_system_settings/search'],'スマホ条件':['sp_conditions/search'],'航空会社':['airlines/search','sp_app_airlines/search'],'ターミナル':['terminals/search'],
      'システム設定':['system_settings/search'],'システム設定(システム管理者)':['system_settings/search_admin','admin_system_settings/search'],'祝日':['holidays/search'],'日次情報入力':['daily_infos/search','daily_informations/search']};
    const cands=KNOWN[name]||GUESS[name]; if(!cands)return null;
    const norm=(list)=>list.map(x=>({code:x.originalId||x.id||x.code||x.wirelessLineNumber||'',name:x.name||x.gradeTypeName||x.title||x.userName||x.loginName||[x.lastName,x.firstName].filter(Boolean).join(' ')||[x.lastNameKana,x.firstNameKana].filter(Boolean).join(' ')||x.companyName||x.vehicleNumber||Object.values(x).find(v=>typeof v==='string'&&/[^\d\/:.\- ]/.test(v)&&v.length<40)||'',updated:(x.updatedAt||'').slice(0,10),by:x.companyGroupName||x.companyName||x.officeName||''}));
    const notes=[]; let merged=[];
    for(const c of cands){
      const [path,qs]=c.split('?'); const base=Object.fromEntries(new URLSearchParams(qs||'')); let p={pageLimit:'',pageNo:'',nonDetailFlag:'1',...base};
      for(let attempt=0;attempt<4;attempt++){
        let r; try{r=await call(path,p)}catch(e){notes.push(`${path}: 呼び出し失敗(${e.message})`);break}
        if(r.isSuccess){const list=Object.values(r).find(Array.isArray)||[];merged=merged.concat(norm(list));notes.push(`${path}: OK ${list.length}件`);break}
        const msgs=(r.msgs||[]).map(m=>m.msg+(m.path?`[${m.path}]`:'')).join(' / ');
        const need=(r.msgs||[]).find(m=>m.path&&!(m.path in p));
        if(need&&attempt<3){ // 必須パラメータを推定して再試行(searchKind は 1,2,3 の順)
          const v=need.path==='searchKind'?String(attempt+1):need.path==='type'?'1':(/date|Date|At$/.test(need.path)?fmtD(new Date()):'1');p={...p,[need.path]:v};notes.push(`${path}: ${msgs} → ${need.path}=${v} で再試行`);continue}
        if(need&&need.path==='searchKind'&&attempt<3){p={...p,searchKind:String(attempt+1)};continue}
        notes.push(`${path}: ${msgs||('HTTP応答に isSuccess なし')}`);break;
      }
      if(merged.length&&KNOWN[name]&&!/system_types/.test(c))break;
    }
    merged.__notes=notes; return merged;
  }
};
document.querySelector('.brand small').textContent=(K.officeName||'')+' / 実データ';
if(K.loginName)document.querySelector('.user b').textContent=K.loginName;
if(typeof search==='function')search(1);
}
(function(){
  if(window.__KMX){activateLive(window.__KMX);return}
  if(!/[?&]proxy=1/.test(location.search)){
    // C) リバースプロキシ配置(Cloudflare Workers 等): 同一オリジンの /api/session が使えればそれで接続
    // ホシコン組み込み(window.__KMX_BASE が設定されている時): ホシコン側の中継 API(<base>/session, <base>/kmx/api/v1/*)を使う。
    // km-operator へのログインはホシコンのサーバーが自動で行うので、利用者はホシコンにログインしていれば良い。
    const HB=window.__KMX_BASE||'';
    if(HB||location.protocol==='https:'||/[?&]live=1/.test(location.search)){
      fetch(HB?HB+'/session':'/api/session',{credentials:'include'}).then(r=>r.ok?r.json():r.json().catch(()=>null).then(j=>Object.assign({loggedIn:false,httpStatus:r.status},j||{}))).then(s=>{
        if(s&&s.loggedIn){window.__KMX={operatorId:s.operatorId,loginName:s.loginName,accountId:s.accountId,roleId:s.roleId,officeName:s.officeName,apiBase:HB};activateLive(window.__KMX)}
        else if(HB){const el=document.createElement('span');el.className='pill crit';el.textContent=(s&&s.message)||'km-operator に接続できません';document.getElementById('notices').prepend(el)}
        else if(s===null||!s.loggedIn){const a=document.createElement('a');a.className='linkbtn';a.href='/kmx/HS/HSHS/HSHS0199.do';a.textContent='ログインして実データに接続';document.querySelector('.user').prepend(a)}
      }).catch(()=>{if(HB){const el=document.createElement('span');el.className='pill crit';el.textContent='ホシコンの中継に接続できません';document.getElementById('notices').prepend(el)}});
    }
    return;
  }
  // B) プロキシ接続: 相手(ログイン済み km-operator タブ)に hello を要求し、以後の API 呼び出しを postMessage で中継してもらう。
  //    相手は window.opener(km 側から開かれた場合)か、「接続」ボタンでこちらから開いたタブ。
  let peer=window.opener||null; const pending=new Map(); let seq=0;
  const transport=(path,params)=>new Promise((res,rej)=>{if(!peer){rej(new Error('km-operator タブに未接続'));return}const id=++seq;pending.set(id,{res,rej});peer.postMessage({kmx:'req',id,path,params:params||{}},'*');setTimeout(()=>{if(pending.has(id)){pending.delete(id);rej(new Error('タイムアウト: '+path))}},30000)});
  window.addEventListener('message',e=>{const m=e.data||{};if(m.kmx==='res'){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.rej(new Error(m.error)):p.res(m.data)}}
    else if(m.kmx==='hello'&&!window.__KMX){peer=e.source||peer;window.__KMX=Object.assign({apiBase:''},m.user||{});activateLive(window.__KMX,transport);btn.textContent='実データ接続中';toast('ログイン済みの km-operator タブ経由で実データに接続しました')}});
  const btn=document.createElement('button');btn.className='linkbtn';btn.textContent='km-operator に接続';btn.title='ログイン済みの km-operator を別タブで開き、そのタブ経由で実データを取得します';
  btn.onclick=()=>{peer=window.open('https://km-operator.smartaxicenter.com/kmx/HS/HSHS/HSHS9999.do?pageId=HSHS1000','km-operator');toast('km-operator タブを開きました。そのタブで bridge.js を実行してください')};
  document.querySelector('.user').prepend(btn);
  setInterval(()=>{if(!window.__KMX&&peer&&!peer.closed)peer.postMessage({kmx:'ready'},'*')},700);
})();
