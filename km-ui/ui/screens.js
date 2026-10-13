/* screens.js — 伝票の関連パネル(旧UIで非表示だったもの)、営業情報、メッセージ、マスタ、CSV、SOS、予約本数表、機能一覧
   すべて架空データ。API.mode='live' にすると各関数の API 名で /kmx/api/v1/ を呼ぶ想定。 */
(function(){
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const r=seeded(7); const pk=a=>a[Math.floor(r()*a.length)];
const VEH=Array.from({length:140},(_,i)=>({radio:String(5500+i*7),driver:DRV[i%DRV.length],office:'板橋営業所',status:pk(['空車','空車','空車','迎車','実車','実車','支払','回送','休憩','配車指示中']),grade:pk(['ジャパンタクシー','ジャパンタクシー','ハイグレード','ミニバン']),color:pk(['黒','白','紺']),plate:`板橋 500 あ ${1000+i*13}`}));
window.VEH=VEH;

/* ===== 汎用モーダル ===== */
function modal(title, bodyHtml, buttons){
  const bg=document.createElement('div'); bg.className='modal-bg';
  bg.innerHTML=`<div class="modal" role="dialog" aria-label="${esc(title)}"><header>${esc(title)}<span class="sp"></span><button class="btn sm" type="button" data-close>閉じる</button></header><div class="mbody">${bodyHtml}</div><footer>${(buttons||[]).map((b,i)=>`<button class="btn ${b.primary?'primary':''}" type="button" data-i="${i}">${esc(b.label)}</button>`).join('')}</footer></div>`;
  const close=()=>bg.remove();
  bg.addEventListener('click',e=>{if(e.target===bg||e.target.closest('[data-close]'))close();const b=e.target.closest('footer [data-i]');if(b){const r=buttons[+b.dataset.i].onClick?.(bg);if(r!==false)close()}});
  document.addEventListener('keydown',function k(e){if(e.key==='Escape'){close();document.removeEventListener('keydown',k)}});
  document.body.appendChild(bg); return bg;
}
window.modal=modal;
const tbl=(cols,rows,cls)=>`<div class="tablewrap ${cls||''}"><table><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(rw=>`<tr>${rw.map(c=>`<td>${c}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${cols.length}" class="hint">該当なし</td></tr>`}</tbody></table></div>`;
const fld=(l,inner)=>`<div class="f"><label>${esc(l)}</label>${inner}</div>`;
const inp=(id,v='',ph='')=>`<input id="${id}" value="${esc(v)}" placeholder="${esc(ph)}">`;

/* ===== 伝票の関連機能(旧UIの非表示パネル/ダイアログ) ===== */
const TOOLS=[
 ['配車パネル','割当車両・到着遅れ・キャンセル','tickets/search_dispatch_info', ()=>modal('配車パネル',
   fld('探車・配車状況','<span class="st go">配車中</span> 探車方式: 逐次 / 範囲 15分以内')+
   tbl(['無線番号','所属','乗務員名','所要時間','車種','色','到着遅れ','配車担当者','配車日時','現着','操作'],VEH.slice(0,3).map(v=>[`<b class="num">${v.radio}</b>`,v.office,v.driver,`${5+Math.floor(r()*12)}分`,v.grade,v.color,'<span class="st">なし</span>','板橋１','2026/10/13 18:05','<span class="st wait">未</span>','<button class="btn sm" type="button">現着済</button> <button class="btn sm" type="button">キャンセル</button>']))+
   '<div class="row">'+fld('キャンセル区分','<select><option>お客様都合</option><option>車両都合</option><option>重複</option></select>')+fld('キャンセル担当者',inp('cOp','板橋１'))+'</div>',
   [{label:'一括キャンセル'},{label:'個別メッセージ送信',onClick:()=>{location.hash='#msg-one'}},{label:'更新',primary:true,onClick:()=>toast('配車情報を更新しました')}])],
 ['予約事前割当','予約伝票への車両の事前割当','tickets/update_dispatch_info', ()=>modal('予約事前割当',
   '<div class="row">'+fld('営業所','<select><option>国際自動車_板橋営業所</option></select>')+fld('無線番号',inp('paRadio'))+fld('乗務員名',inp('paDrv'))+fld('割当情報未入力通知','<input type="number" value="30"> 分前')+'</div>'+
   tbl(['選択','ステータス','無線番号','車両番号','所属','乗務員名','車種','色','割当担当者','割当日時'],VEH.slice(3,8).map(v=>['<input type="checkbox">',`<span class="st ${v.status==='空車'?'done':''}">${v.status}</span>`,`<b class="num">${v.radio}</b>`,v.plate,v.office,v.driver,v.grade,v.color,'','']))+
   tbl(['割当一覧','無線番号','乗務員名','割当日時','割当解除担当者','割当解除日時'],[['1','5514','佐々木 一郎','2026/10/13 17:40','','']]),
   [{label:'一括割当解除'},{label:'割当一覧に追加',primary:true,onClick:()=>toast('割当一覧に追加しました')}])],
 ['工程(処理履歴)','受付→探車→配車→現着→完了の時刻と担当者、音声','tickets/get', ()=>modal('工程',
   `<div class="steps">${[['受付','2026/10/13 17:58','板橋１','音声あり'],['探車開始','2026/10/13 18:00','板橋１',''],['配車','2026/10/13 18:05','自動処理',''],['乗務員了解','2026/10/13 18:05','5571 山田 太郎',''],['現着報告','2026/10/13 18:21','5571','']].map(s=>`<div class="step"><time>${s[1]}</time><div><b>${s[0]}</b> ${s[2]} ${s[3]?'<button class="btn sm" type="button">▶ '+s[3]+'</button>':''}</div></div>`).join('')}</div>`,
   [{label:'印刷用表示'}])],
 ['役割選択','電話受付/通し/Web・スマホ/オフライン','users/search', ()=>modal('役割選択',
   fld('このオペレーターの役割','<div class="chips"><button type="button" class="chip" aria-pressed="true">電話受付</button><button type="button" class="chip" aria-pressed="true">通し</button><button type="button" class="chip" aria-pressed="false">Web/スマホ</button><button type="button" class="chip" aria-pressed="false">オフライン</button></div>')+
   fld('CTI状態','<span class="seg"><button type="button" aria-pressed="true">READY</button><button type="button">NOT READY</button><button type="button">ACW</button><button type="button">REST</button></span>'),
   [{label:'確定',primary:true,onClick:()=>toast('役割を更新しました')}])],
 ['定期予約','毎週/毎月の繰り返し予約','tickets/create_ticket', ()=>modal('定期予約',
   '<div class="row">'+fld('期間 From','<input type="date" value="2026-10-14">')+fld('期間 To','<input type="date" value="2026-12-31">')+'</div>'+
   fld('毎週','<div class="chips">'+['月','火','水','木','金','土','日'].map(d=>`<button type="button" class="chip" aria-pressed="${'月火水木金'.includes(d)}">${d}</button>`).join('')+'</div>')+
   fld('毎月','<div class="chips">'+Array.from({length:31},(_,i)=>`<button type="button" class="chip" aria-pressed="false">${i+1}日</button>`).join('')+'</div>')+
   fld('祝日','<label><input type="checkbox" checked> 祝日は除外する</label>'),
   [{label:'解除'},{label:'設定',primary:true,onClick:()=>toast('定期予約を設定しました')}])],
 ['経由地入力','経由地の建物名・地点名・付け場所','tickets/search_dispatch_point', ()=>modal('経由地入力',
   '<div class="row">'+fld('建物名',inp('bwB'))+fld('地点名',inp('bwP','','住所・施設名'))+fld('付け場所',inp('bwS'))+'</div>'+fld('コメント','<textarea></textarea>')+fld('順序','<span class="seg"><button type="button" aria-pressed="true">お迎え→経由地→お送り先</button></span>'),
   [{label:'お迎え場所にコピー'},{label:'お送り先にコピー'},{label:'設定',primary:true,onClick:()=>toast('経由地を設定しました')}])],
 ['フライト情報入力','航空会社・便番号・到着時刻','products/search', ()=>modal('フライト情報入力',
   '<div class="row">'+fld('航空会社','<select><option>JAL</option><option>ANA</option><option>スカイマーク</option><option>その他</option></select>')+fld('便番号',inp('flNo','','123'))+fld('到着時刻','<input type="time" value="18:40">')+fld('ターミナル','<select><option>羽田 第1</option><option>羽田 第2</option><option>羽田 第3</option><option>成田 第1</option><option>成田 第2</option></select>')+'</div>',
   [{label:'設定',primary:true,onClick:()=>toast('フライト情報を設定しました')}])],
 ['乗務員検索','スキル・所属で乗務員を検索','tickets/search_driver', ()=>modal('乗務員検索',
   '<div class="row">'+fld('姓(カナ)',inp('dsL'))+fld('名(カナ)',inp('dsF'))+fld('ユーザー名',inp('dsU'))+fld('所属','<select><option></option><option>105_台東営業所</option><option>115_羽田営業所</option><option>124_東雲営業所</option><option>154_三鷹営業所</option><option>163_世田谷営業所</option><option>210_板橋営業所</option></select>')+'</div>'+
   fld('保持スキル条件(この欄のスキルを持つ乗務員のみ)','<div class="chips"><button type="button" class="chip" aria-pressed="false">英語対応</button><button type="button" class="chip" aria-pressed="false">介護</button><button type="button" class="chip" aria-pressed="false">キッズ</button><button type="button" class="chip" aria-pressed="false">観光</button></div>')+
   tbl(['乗務員名','ユーザー名','所属','スキル','無線番号',''],VEH.slice(0,6).map(v=>[v.driver,'drv'+v.radio,v.office,'英語対応',v.radio,'<button class="btn sm" type="button">選択</button>'])),[])],
 ['お客様検索・詳細','フリガナ/電話番号/会員番号で検索、詳細表示','customers/search', ()=>modal('お客様検索',
   '<div class="row">'+fld('姓(カナ)',inp('csL'))+fld('名(カナ)',inp('csF'))+fld('電話番号',inp('csT'))+fld('会員番号',inp('csN'))+'</div>'+
   tbl(['フリガナ','電話番号','会員番号','会員区分','特別顧客指定','NGオペレーター',''],[['サトウ タロウ','090-0000-1111','100234','一般会員(1)','','','<button class="btn sm" type="button">詳細</button>'],['サンプル ショウジ','03-0000-2222','200981','法人','○','','<button class="btn sm" type="button">詳細</button>']]),
   [{label:'お客様詳細を開く',primary:true,onClick:()=>{setTimeout(()=>modal('お客様詳細',`<dl class="kv">${[['お客様管理番号','100234'],['姓(カナ)','サトウ'],['名(カナ)','タロウ'],['会員優先度','一般会員(1)'],['個人/法人','個人'],['ご住所','板橋区坂下1-22-10'],['電話番号','090-0000-1111'],['平均金額','¥3,400'],['利用回数','27'],['特記事項','玄関前で声かけ希望'],['探車条件','ジャパンタクシー'],['NG乗務員','なし'],['マイタク','○'],['ママタク',''],['登録日','2024/04/01'],['修正者','板橋１']].map(([k,v])=>`<dt>${k}</dt><dd>${v||'<span class="hint">—</span>'}</dd>`).join('')}</dl>`,[{label:'利用履歴(営業履歴)',onClick:()=>{location.hash='#trip'}},{label:'編集',primary:true}]),0)}}])],
 ['営業情報(利用履歴)','このお客様・この伝票の営業履歴','tickets/get_usage_history', ()=>{location.hash='#trip'}],
 ['走行軌跡参照','配車車両の走行軌跡を表示','running_paths/search', ()=>{location.hash='#path'}],
 ['地図で範囲検索','お迎え場所周辺の空車を地図で検索','map_vehicles/get_map_vehicle', ()=>{location.hash='#map'}],
 ['直近30分の伝票','直近30分に受け付けた伝票だけを表示','ticket_searches/search', ()=>{R.from=new Date(TODAY.getTime()-30*60000);R.to=new Date(TODAY);renderRange();search(1);toast('直近30分で検索しました')}],
 ['印刷用表示','伝票の印刷レイアウト','tickets/get', ()=>modal('印刷用表示',`<div style="font-family:var(--mono);white-space:pre-wrap;border:1px solid var(--line);padding:14px;border-radius:6px">伝票番号  （未採番）        区分 配車 / 電話
予約日時  2026/10/14 07:30   台数 1
乗客      ${esc($('pax').value)}
お迎え    ${esc($('from').value)}
お送り先  ${esc($('to').value)}
商品      羽田定額(板橋区→羽田) ¥8,400
受付      板橋１  2026/10/13 18:00</div>`,[{label:'コピー',primary:true,onClick:()=>toast('クリップボードにコピーしました')}])],
 ['忘れ物管理システム','外部の忘れ物管理システムへ','—', ()=>toast('忘れ物管理システム(外部)へ遷移します')],
 ['バンドル取消','関連伝票をまとめて取消','tickets/update_bundle_cancel', ()=>modal('一括キャンセル',fld('対象','<label><input type="checkbox" checked> この伝票</label> <label><input type="checkbox" checked> 関連伝票 (2件)</label>')+fld('理由','<select><option>お客様都合</option><option>重複</option><option>その他</option></select>'),[{label:'取消を実行',primary:true,onClick:()=>toast('伝票を取消しました')}])],
];
$('ticketTools').innerHTML=TOOLS.map((t,i)=>`<button type="button" data-i="${i}"><span>${esc(t[0])}</span><small>${esc(t[1])}</small><span class="tag">${esc(t[2])}</span></button>`).join('');
$('ticketTools').addEventListener('click',e=>{const b=e.target.closest('button[data-i]');if(b)TOOLS[+b.dataset.i][3]()});

/* ===== 営業情報(営業履歴) ===== */
$('drvList').innerHTML=DRV.map(d=>`<option value="${d}">`).join('');
const TRIPS=Array.from({length:380},(_,i)=>{const v=pk(VEH);const d=new Date(TODAY);d.setDate(d.getDate()-Math.floor(r()*7));d.setHours(Math.floor(r()*24),Math.floor(r()*12)*5);const e=new Date(d.getTime()+(5+Math.floor(r()*40))*60000);
  const st=pk(['実車','実車','実車','迎車','空車','回送','休憩']);return{radio:v.radio,driver:v.driver,status:st,start:d,end:e,from:pk(FROM),to:st==='実車'?pk(TO):'',km:(1+r()*12).toFixed(1),fare:st==='実車'?500+Math.floor(r()*60)*100:0,ticket:st==='実車'&&r()<.6?String(44690000+Math.floor(r()*9000)):''}});
async function tripSearch(){
  if(window.LIVE){
    const t0=performance.now();const radio=$('tripRadio').value.trim(),drv=$('tripDriver').value.trim();
    if(!radio&&!drv){$('tripHint').textContent='実データ検索では無線番号または乗務員ユーザー名が必要です';return}
    $('tripHint').textContent='検索中…';
    try{const {rows,header}=await LIVE.trips({radio,driver:drv,date:$('tripDate').value,addr:$('tripAddr').checked});
      $('tripHint').textContent=`${header.driver||''} / ${header.shift||''} / 営業回数 ${header.count||0} / 売上 ¥${(+header.sales||0).toLocaleString()} / 終業予定 ${header.close||''}`;
      $('tripCnt').textContent=rows.length;$('tripTook').textContent=`${Math.round(performance.now()-t0)} ms`;
      document.querySelector('#tripTbl tbody').innerHTML=rows.map(t=>`<tr title="${esc(t.statuses)}"><td class="num">${esc(t.radio)}</td><td>${esc(t.driver)}</td><td><span class="st ${({実車:'ng',迎車:'go',空車:'done'})[t.status]||''}">${esc(t.status)}</span></td><td class="num">${isNaN(t.start)?'':fmt(t.start)}</td><td class="num">${isNaN(t.end)?'':fmt(t.end)}</td><td>${esc(t.from)}${t.customer?'<br><small class="hint">'+esc(t.customer)+'</small>':''}</td><td>${esc(t.to)}</td><td class="num">${t.km?t.km+' km':''}</td><td class="num">${t.fare?'¥'+t.fare.toLocaleString():''}</td><td class="num">${t.ticket?`<a href="#ticket" data-no="${t.ticket}">${t.ticket}</a>`:''}</td></tr>`).join('')||'<tr><td colspan="10" class="hint">該当なし</td></tr>';
    }catch(e){$('tripHint').textContent='エラー: '+e.message;toast(e.message)}
    return;
  }
  const t0=performance.now();const base=new Date($('tripDate').value);const span=+$('tripSpan').value*3600000;
  const from=span>=86400000?dayStart(base):new Date(base-span), to=span>=86400000?new Date(dayStart(base).getTime()+86399000):new Date(+base+span);
  const sts=[...document.querySelectorAll('#tripStatus .chip[aria-pressed="true"]')].map(b=>b.dataset.v);
  const q=$('tripDriver').value.trim(), radio=$('tripRadio').value.trim(); const addr=$('tripAddr').checked;
  let rows=TRIPS.filter(t=>t.start>=from&&t.start<=to&&(!q||t.driver.includes(q))&&(!radio||t.radio.includes(radio))&&(!sts.length||sts.includes(t.status))).sort((a,b)=>b.start-a.start);
  $('tripHint').textContent=`${fmt(from)} 〜 ${fmt(to)}`;$('tripCnt').textContent=rows.length;$('tripTook').textContent=`${Math.round(performance.now()-t0)} ms`;
  document.querySelector('#tripTbl tbody').innerHTML=rows.slice(0,200).map(t=>`<tr><td class="num">${t.radio}</td><td>${t.driver}</td><td><span class="st ${({実車:'ng',迎車:'go',空車:'done'})[t.status]||''}">${t.status}</span></td><td class="num">${fmt(t.start)}</td><td class="num">${fmt(t.end)}</td><td>${addr?t.from:'<span class="hint">(住所非表示)</span>'}</td><td>${addr?t.to:(t.to?'<span class="hint">(住所非表示)</span>':'')}</td><td class="num">${t.km} km</td><td class="num">${t.fare?'¥'+t.fare.toLocaleString():''}</td><td class="num">${t.ticket?`<a href="#ticket" data-no="${t.ticket}">${t.ticket}</a>`:''}</td></tr>`).join('');
}
$('tripSearch').addEventListener('click',tripSearch);
$('tripClear').addEventListener('click',()=>{$('tripDriver').value='';$('tripRadio').value='';document.querySelectorAll('#tripStatus .chip').forEach(b=>b.setAttribute('aria-pressed','false'));tripSearch()});
$('tripStatus').addEventListener('click',()=>setTimeout(tripSearch,0));
$('tripAddr').addEventListener('change',tripSearch);
['tripDriver','tripRadio'].forEach(id=>$(id).addEventListener('keydown',e=>{if(e.key==='Enter')tripSearch()}));

/* ===== メッセージ ===== */
let msgSel=new Set(), msgKindCur='msg-one';
const HIST=[{at:'2026/10/13 15:02',kind:'一斉送信',text:'首都高5号線 板橋JCT付近で渋滞。迂回推奨。',n:289},{at:'2026/10/13 11:30',kind:'回答付き',text:'本日18時以降の残業可否を回答してください',n:42,ans:31},{at:'2026/10/12 09:10',kind:'個別',text:'お客様より傘の忘れ物の問い合わせ。車内確認をお願いします。',n:1}];
function renderMsgList(){
  const sts=[...document.querySelectorAll('#mStatus .chip[aria-pressed="true"]')].map(b=>b.dataset.v); const radio=$('mRadio').value.trim(), nm=$('mName').value.trim();
  const rows=VEH.filter(v=>(!sts.length||sts.includes(v.status))&&(!radio||v.radio.includes(radio))&&(!nm||v.driver.includes(nm)));
  $('mCnt').textContent=`${rows.length}台 / 全${VEH.length}台`;
  $('mList').innerHTML=rows.map(v=>`<div class="v ${msgSel.has(v.radio)?'sel':''}" data-r="${v.radio}"><input type="checkbox" ${msgSel.has(v.radio)?'checked':''}><div><b>${v.radio}</b> ${v.driver}<br><small>${v.office} / ${v.grade}</small></div><span class="st ${({空車:'done',迎車:'go',実車:'ng'})[v.status]||''}">${v.status}</span></div>`).join('');
  $('mSel').innerHTML=[...msgSel].map(r=>`<button type="button" class="chip" aria-pressed="true" data-r="${r}">${r} ✕</button>`).join('')||'<span class="hint">左の一覧から追加</span>';
  $('mSelCnt').textContent=msgSel.size?`${msgSel.size}台`:'';
  $('mHist').innerHTML=HIST.map(h=>`<div class="msg"><div><span class="st">${h.kind}</span> ${esc(h.text)}</div><time>${h.at}</time><small class="hint">送信 ${h.n}台${h.ans!=null?` / 回答 ${h.ans}`:''}</small></div>`).join('');
}
$('mList').addEventListener('click',e=>{const v=e.target.closest('.v');if(!v)return;msgSel.has(v.dataset.r)?msgSel.delete(v.dataset.r):msgSel.add(v.dataset.r);renderMsgList()});
$('mSel').addEventListener('click',e=>{const b=e.target.closest('[data-r]');if(b){msgSel.delete(b.dataset.r);renderMsgList()}});
$('mAddAll').addEventListener('click',()=>{document.querySelectorAll('#mList .v').forEach(v=>msgSel.add(v.dataset.r));renderMsgList()});
$('mClearAll').addEventListener('click',()=>{msgSel.clear();renderMsgList()});
$('mStatus').addEventListener('click',()=>setTimeout(renderMsgList,0));
['mRadio','mName'].forEach(id=>$(id).addEventListener('input',renderMsgList));
$('mSend').addEventListener('click',()=>{const t=$('mText').value.trim();if(!t){toast('本文を入力してください');return}
  const all=msgKindCur==='msg-all'; if(!all&&!msgSel.size){toast('送信先を選んでください');return}
  modal('送信の確認',`<p>${all?'全車両 ('+VEH.length+'台)':msgSel.size+'台'} に${msgKindCur==='msg-reply'?'回答付き':''}メッセージを送信します。</p><div class="msg"><div>${esc(t)}</div></div>`,[{label:'送信する',primary:true,onClick:()=>{HIST.unshift({at:fmt(new Date()),kind:({'msg-all':'一斉送信','msg-one':'個別','msg-reply':'回答付き'})[msgKindCur],text:t,n:all?VEH.length:msgSel.size,ans:msgKindCur==='msg-reply'?0:undefined});$('mText').value='';msgSel.clear();renderMsgList();toast('送信しました')}}])});
$('mDup').addEventListener('click',()=>{if(HIST[0]){$('mText').value=HIST[0].text;toast('直前のメッセージを複製しました')}});
function setMsgKind(k){msgKindCur=k;document.querySelectorAll('#msgKind button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.k===k));
  const names={'msg-all':'一斉送信メッセージ','msg-one':'個別メッセージ','msg-reply':'回答付きメッセージ','msg-result':'回答付きメッセージ結果'};$('msgTitle').textContent=names[k];
  $('msgCompose').hidden=k==='msg-result';$('msgResults').hidden=k!=='msg-result';$('mReplyOpts').hidden=k!=='msg-reply';
  document.querySelector('#msgCompose .card:first-child').hidden=k==='msg-all';
  if(k==='msg-result')$('mResBody').innerHTML=HIST.filter(h=>h.kind==='回答付き').map(h=>`<tr><td class="num">${h.at}</td><td>${esc(h.text)}</td><td class="num">${h.ans||0} / ${h.n} / ${h.n}</td><td><div class="bar" style="width:120px"><i style="width:${Math.round(100-(h.ans||0)/h.n*100)}%"></i></div> ${Math.round(100-(h.ans||0)/h.n*100)}%</td><td class="num">2026/10/13 20:00</td><td><button class="btn sm" type="button">回答一覧</button> <button class="btn sm" type="button">CSV</button></td></tr>`).join('');
  renderMsgList()}
$('msgKind').addEventListener('click',e=>{const b=e.target.closest('button');if(b)location.hash='#'+b.dataset.k});
$('mCsvMake').addEventListener('click',()=>toast('CSV作成を受け付けました(非同期)'));
$('mCsvList').addEventListener('click',()=>modal('CSV一覧',tbl(['ファイル名','進行状況','操作'],[['reply_result_20261013.csv','完了','<button class="btn sm" type="button">ダウンロード</button> <button class="btn sm" type="button">削除</button>']]),[]));

/* ===== マスタ ===== */
const MASTERS=[['車両',['車両','グレード','車種','形状','燃料','メーカー','色']],['ユーザー',['ユーザー','ロール','ロール制限']],['顧客',['顧客','会員優先度','特別顧客','企業']],['乗務員',['乗務員','スキル','乗務員連絡']],['商品・料金',['商品種別','商品情報','タクシー料金','スマホ即時VIP優先設定']],['予約・配車',['車両予約枠','予約枠係数','配車ルール','時間ゲタマスタ']],['地点',['エリア','配車先','滞留禁止','タクシー付け場所','住宅地図文字図形','待機場所','待機場所要求台数']],['組織',['会社グループ','会社','営業所']],['スマホ',['スマホシステム設定','スマホ条件']],['空港',['航空会社','ターミナル']],['システム',['システム設定','システム設定(システム管理者)','システム種別','祝日','日次情報入力']]];
function renderMasters(){const q=$('masterQ').value.trim();$('masterGrid').innerHTML=MASTERS.map(([g,items])=>{const it=items.filter(i=>!q||i.includes(q));return it.length?`<h5>${g}</h5>`+it.map(i=>`<a href="#master" data-m="${i}">${i}</a>`).join(''):''}).join('')}
$('masterQ').addEventListener('input',renderMasters);
$('masterGrid').addEventListener('click',async e=>{const a=e.target.closest('[data-m]');if(!a)return;e.preventDefault();const m=a.dataset.m;$('masterEdit').hidden=false;$('masterEditTitle').textContent=m;
  const cols=['コード','名称','更新日','更新者',''];
  if(window.LIVE){document.querySelector('#masterTbl thead').innerHTML=`<tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr>`;const tb=document.querySelector('#masterTbl tbody');tb.innerHTML='<tr><td colspan="5" class="hint">読込中…</td></tr>';
    try{const list=await LIVE.masters(m);
      const notes=(list&&list.__notes||[]).map(n=>`<div class="hint" style="font-family:var(--mono)">${esc(n)}</div>`).join('');
      tb.innerHTML=(list?list.map(x=>`<tr><td class="num">${esc(x.code)}</td><td>${esc(x.name)}</td><td class="num">${esc(x.updated)}</td><td>${esc(x.by)}</td><td><button class="btn sm" type="button">編集</button></td></tr>`).join('')||'':'<tr><td colspan="5" class="hint">このマスタは候補 API が未登録です</td></tr>')
        +`<tr><td colspan="5"><details ${list&&list.length?'':'open'}><summary class="hint">API の呼び出し記録(${list&&list.length?list.length+'件':'0件'})</summary>${notes||'<div class="hint">記録なし</div>'}</details></td></tr>`}
    catch(err){tb.innerHTML=`<tr><td colspan="5" class="hint">エラー: ${esc(err.message)}</td></tr>`}
    $('masterEdit').scrollIntoView({behavior:'smooth'});return}const rows=m==='グレード'?['ハイグレード','スタンダード','ミニバン','プリウスα','ＮＶ２００','プリウス','エスクァイア','ｋｍ個人','ジャパンタクシー','セレナ','オデッセイ','ヴォクシー/ノア','シエンタ','リーフ','アルファード/ベルファイア（4名まで）','水素クラウン']:m==='営業所'?['国際自動車_板橋営業所']:Array.from({length:8},(_,i)=>`${m} ${i+1}`);
  document.querySelector('#masterTbl thead').innerHTML=`<tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr>`;document.querySelector('#masterTbl tbody').innerHTML=rows.map((n,i)=>`<tr><td class="num">${i+1}</td><td>${esc(n)}</td><td class="num">2026/09/29</td><td>板橋１</td><td><button class="btn sm" type="button">編集</button> <button class="btn sm" type="button">削除</button></td></tr>`).join('');$('masterEdit').scrollIntoView({behavior:'smooth'})});
$('masterNew').addEventListener('click',()=>modal(`${$('masterEditTitle').textContent} の新規登録`,'<div class="row">'+fld('コード',inp('mcCode'))+fld('名称',inp('mcName'))+fld('会社グループ','<select><option>国際自動車</option></select>')+'</div>',[{label:'登録',primary:true,onClick:()=>toast('登録しました')}]));

/* ===== CSV / SOS / 予約本数表 ===== */
const JOBS=[{f:'ticket_20261001-20261013.csv',k:'伝票',p:100,at:'2026/10/13 09:12'},{f:'customer_20261013.csv',k:'顧客',p:100,at:'2026/10/13 09:15'}];
function renderJobs(){$('csvJobs').innerHTML=JOBS.map(j=>`<tr><td class="num">${j.f}</td><td>${j.k}</td><td><div class="bar" style="width:140px"><i style="width:${j.p}%"></i></div> ${j.p===100?'完了':j.p+'%'}</td><td class="num">${j.at}</td><td>${j.p===100?'<button class="btn sm" type="button">ダウンロード</button> ':''}<button class="btn sm" type="button" data-del="${j.f}">削除</button></td></tr>`).join('')}
document.querySelectorAll('[data-csv]').forEach(b=>b.addEventListener('click',()=>{const j={f:`${b.dataset.csv}_${Date.now().toString().slice(-6)}.csv`,k:b.dataset.csv,p:0,at:fmt(new Date())};JOBS.unshift(j);renderJobs();const iv=setInterval(()=>{j.p=Math.min(100,j.p+25);renderJobs();if(j.p>=100)clearInterval(iv)},500);toast('CSV作成を開始しました')}));
document.querySelectorAll('[data-csvlist]').forEach(b=>b.addEventListener('click',()=>$('csvJobs').scrollIntoView({behavior:'smooth'})));
document.querySelectorAll('#s-csv input[type=file]').forEach(i=>i.addEventListener('change',()=>{if(i.files[0])modal('CSV取込の確認',`<p>${esc(i.files[0].name)} を取り込みます。先頭行はヘッダーとして扱います。</p>`,[{label:'取り込む',primary:true,onClick:()=>toast('取込を受け付けました')}])}));
$('csvJobs').addEventListener('click',e=>{const b=e.target.closest('[data-del]');if(b){const i=JOBS.findIndex(j=>j.f===b.dataset.del);if(i>=0)JOBS.splice(i,1);renderJobs()}});
renderJobs();
$('sosBody').innerHTML=[['2026/10/13 14:21','5571','山田 太郎','板橋区坂下2丁目付近','<span class="st done">対応済</span>'],['2026/10/11 23:48','5634','高橋 花子','北区王子6丁目付近','<span class="st done">対応済</span>']].map(r=>`<tr>${r.map((c,i)=>`<td class="${i===0||i===1?'num':''}">${c}</td>`).join('')}<td><button class="btn sm" type="button">▶ 再生</button></td><td><button class="btn sm" type="button">走行軌跡</button> <button class="btn sm" type="button">伝票</button></td></tr>`).join('');
function renderSlots(){const hours=Array.from({length:24},(_,h)=>h);const cap=[2,2,2,2,3,4,8,12,14,12,10,10,10,10,10,10,12,14,14,12,8,6,4,3];const rr=seeded(+$('slotDate').value.replace(/-/g,'')%1000);
  document.querySelector('#slotTbl thead').innerHTML=`<tr><th>時間帯</th>${hours.map(h=>`<th>${h}時</th>`).join('')}<th>計</th></tr>`;
  const rows=[['予約枠',cap],['予約本数',cap.map(c=>Math.floor(rr()*(c+3)))],['自動配車',cap.map(c=>Math.floor(rr()*c*.6))],['早朝予約',cap.map((c,h)=>h<7?Math.floor(rr()*3):0)]];
  document.querySelector('#slotTbl tbody').innerHTML=rows.map(([n,v],i)=>`<tr><th>${n}</th>${v.map((x,h)=>`<td class="num" style="${i===1&&x>cap[h]?'color:var(--crit);font-weight:700':''}">${x}</td>`).join('')}<td class="num"><b>${v.reduce((a,b)=>a+b,0)}</b></td></tr>`).join('')}
$('slotDate').addEventListener('change',renderSlots);

/* ===== 機能一覧 ===== */
const FUNCS=[
 ['伝票','新規伝票 / 保存 / 更新','表示','実装(モック)','tickets/create_ticket, tickets/update'],['伝票','伝票検索(期間・区分・CH・ステータス・詳細条件)','ダイアログ','実装(モック) 期間ピッカー刷新','ticket_searches/search'],['伝票','お客様検索 / お客様詳細','ダイアログ','実装(モック)','customers/search, customers/get, tickets/search_customer'],['伝票','場所検索(施設/住所/配車先/都道府県絞込)','ダイアログ','フォームの地図ボタン(モック)','map_searches/get_map_search_info, tickets/search_dispatch_point'],['伝票','料金・ルート検索','表示','実装(モック)','fare_and_routes/search'],['伝票','商品検索(定額/時間/観光)','ダイアログ','実装(モック)','products/search, tickets/fixed_charge_product_search'],['伝票','探車 / 自動通し / 配車依頼','表示','実装(モック)','find_and_dispatchs/confirm, map_vehicles/dispatch_request'],['伝票','配車パネル(割当車両・現着・キャンセル)','非表示タブ','実装(モック)','tickets/search_dispatch_info, tickets/update_dispatch_info'],['伝票','予約事前割当','非表示タブ','実装(モック)','tickets/update_dispatch_info'],['伝票','工程(処理履歴・音声)','非表示タブ','実装(モック)','tickets/get'],['伝票','役割選択 / CTI状態','非表示','実装(モック)','users/search, SessionEnsure'],['伝票','定期予約','ダイアログ','実装(モック)','tickets/create_ticket'],['伝票','経由地入力','ダイアログ','実装(モック)','tickets/search_dispatch_point'],['伝票','フライト情報入力','ダイアログ','実装(モック)','—'],['伝票','乗務員検索(スキル条件)','ダイアログ','実装(モック)','tickets/search_driver, drivers/search'],['伝票','一括キャンセル / バンドル取消','非表示','実装(モック)','tickets/update_bundle_cancel'],['伝票','印刷用表示','非表示ボタン','実装(モック)','tickets/get'],['伝票','直近30分','非表示','実装','ticket_searches/search'],['伝票','問合せ伝票 / 忘れ物伝票','タブ','タブ切替のみ(フォーム差替は次段)','tickets/create_ticket'],['伝票','排他ロック / 他者更新検知','内部','要実装(live接続時)','tickets/exclusion_check, tickets/switching_exclusion_lock'],['伝票','通知バー(予約未配車・通し待ち・SOS等)','表示','実装(モック)','ticket_notices/*, sos_accepts/check'],
 ['地図','車両位置表示 / 全車両表示 / 無線番号で移動','表示','実装(モック地図)','map_vehicles/get_map_vehicle, map_vehicles/get_vehicle_info'],['地図','範囲検索(中心+半径 / 矩形 / 多角形)','限定的','実装(モック地図)','map_vehicles/get_map_vehicle, tickets/get_vehicle_point'],['地図','待機場所 / 不足待機場所 / 配車先 / 滞留禁止','表示','レイヤー切替(モック)','map_searches/get_taxi_stand, taxi_stand_infos/search'],['地図','地図デザイン変更 / 地図閲覧条件','表示','ボタンのみ','—'],['地図','住宅地図','非表示','要実装(ZENRIN接続時)','residential_map/get'],
 ['車両管理','営業情報(営業履歴)検索 / 住所表示','表示','実装(モック)','trip_infos/search, trip_infos/search_driver, trip_infos/get_address'],['車両管理','営業情報の更新','非表示','要実装','trip_infos/update'],['車両管理','走行軌跡(範囲検索日時From/To)','表示','実装(モック地図)','running_paths/search, running_paths/search_vehicle_status'],
 ['メッセージ','一斉送信','エラー(権限?)','実装(モック)','center_messages/create'],['メッセージ','個別メッセージ(車両選択・ステータス絞込)','表示','実装(モック)','center_messages/create, vehicles/vehicle_search_for_msg, center_messages/search_destination_vehicle'],['メッセージ','回答付きメッセージ(選択肢・期限・繰り返し・複製)','表示','実装(モック)','reply_Messages/create, reply_Messages/search'],['メッセージ','回答結果一覧 / CSV作成・一覧・削除','表示','実装(モック)','reply_message_results/*'],['メッセージ','乗務員連絡(未読)','表示','通知バーのみ','ticket_notices/get_unchecked_driver_message, driver_messages/update'],
 ['マスタ','マスタ55種の一覧・検索・登録','表示','一覧+汎用編集画面(モック)','*/search, */create, */update'],
 ['その他','CSV出力・取込(伝票/顧客/車両/乗務員)','表示','実装(モック)','customers/search_csv, customers/delete_csv ほか'],['その他','SOS音声','エラー(権限?)','実装(モック)','sos_accepts/check'],['その他','時間帯別 予約本数表','エラー(権限?)','実装(モック)','reserve_capacities/check'],['その他','パスワード変更 / ログアウト','表示','ヘッダーのボタン','auth/logout'],['その他','ヘルプ / 帳票システム / 共有メモ','外部リンク','外部リンク','—'],
];
document.querySelector('#funcTbl tbody').innerHTML=FUNCS.map(f=>`<tr><td>${f[0]}</td><td>${f[1]}</td><td>${f[2].startsWith('非表示')?'<span class="st wait">'+f[2]+'</span>':f[2].startsWith('エラー')?'<span class="st ng">'+f[2]+'</span>':f[2]}</td><td>${f[3].startsWith('要')?'<span class="st ng">'+f[3]+'</span>':'<span class="st done">'+f[3]+'</span>'}</td><td class="num" style="white-space:normal">${f[4]}</td></tr>`).join('');

/* ===== 画面表示時の初期化 ===== */
document.addEventListener('screen',e=>{const {route}=e.detail;
  if(route==='trip'&&!document.querySelector('#tripTbl tbody tr'))tripSearch();
  if(route.startsWith('msg'))setMsgKind(route);
  if(route==='master')renderMasters();
  if(route==='slots')renderSlots();
});
})();
