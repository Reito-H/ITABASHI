// 顔認証（検証用スタンドアロン）
//   ・faceAuthMatchPage()    … 左サイドバー「顔認証」= /face-auth。カメラ映像を登録済みの顔と
//                              毎フレーム照合し、一致度%としきい値（本人と認める最低ライン）を
//                              スライダーで動かして精度を体感する。
//   ・faceAuthRegisterPage() … 設定サブページ /settings/face-auth。カメラで数フレーム撮影し、
//                              その平均から128次元の特徴ベクトルを作って保存する（顔写真は保存しない）。
//   顔認識モデルは @vladmandic/face-api を jsdelivr CDN から読み込む（無料・鍵不要）。
//   照合・特徴抽出はすべてブラウザ内で完結。サーバーは特徴ベクトルの保存/取得のみ（/api/face-auth/*）。
//
//   注意: 下の *_JS はTSテンプレートリテラル。バッククォートと ${ は使わない。
//         バックスラッシュは二重に（[[feedback_ts_template_client_js_escaping]]）。

const FACEAPI_SRC = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7/dist/face-api.js';
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7/model';

// ===== 照合テストページ（サイドバー） =====
const MATCH_JS = `
(function(){
'use strict';
var MODEL_URL = window.__FA_MODEL_URL;
var ADMIN = window.__FA_ADMIN;
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
var ready=false, stream=null, faces=[], loopOn=false, threshold=50, lastErr='';

function setStatus(m,e){ var el=$('fa-status'); if(el){ el.textContent=m; el.style.color=e?'#b91c1c':'#6b7280'; } }
function statusIdle(m,e){ if(!loopOn) setStatus(m,e); }

// ユークリッド距離(0=同一 〜 1以上=別人)を、直感的な一致度%に変換する。
// 顔認識の定番しきい値 0.6 をちょうど 50% に置く。
function simPct(dist){
  if(dist<=0.6) return Math.round(100-(dist/0.6)*50);
  return Math.round(Math.max(0,50-((dist-0.6)/0.4)*50));
}
function euclid(a,b){ var s=0; for(var i=0;i<a.length;i++){ var d=a[i]-b[i]; s+=d*d; } return Math.sqrt(s); }

function loadModels(){
  statusIdle('顔認識エンジンを読み込み中…（初回だけ約7MBの読み込みで数秒かかります）');
  return Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
  ]).then(function(){ ready=true; statusIdle('準備完了。カメラを起動してください。'); })
    .catch(function(e){ setStatus('顔認識エンジンを読み込めませんでした（ネット接続をご確認ください）['+(e&&e.message||e)+']',true); });
}

function loadFaces(){
  return fetch(ADMIN+'/api/face-auth/faces',{credentials:'include'}).then(function(r){return r.json();}).then(function(j){
    faces=((j&&j.faces)||[]).map(function(f){ return { label:f.label, d:Float32Array.from(f.descriptor) }; });
    if(!faces.length) statusIdle('登録された顔がありません。先に「設定 → 顔認証（顔の登録）」で登録してください。', true);
  }).catch(function(){ statusIdle('登録済みの顔を読み込めませんでした。', true); });
}

var opts=null;
function detOpts(){ if(!opts) opts=new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:0.5}); return opts; }

function startCamera(){
  if(stream) return;
  setStatus('カメラを起動しています…');
  navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:640,height:480},audio:false})
    .then(function(s){
      stream=s; var v=$('fa-video'); v.srcObject=s;
      v.onloadeddata=function(){
        var p=v.play();
        if(p && p.catch) p.catch(function(){});
        var sc=$('fa-scan'); if(sc) sc.classList.add('on');
        loopOn=true; setStatus('照合中…'); lastErr=''; tick();
      };
    })
    .catch(function(e){ setStatus('カメラを起動できませんでした（ブラウザのカメラ許可をご確認ください）['+(e&&e.message||e)+']',true); });
}

function setScan(state){
  // state: 'search'（赤・探索中） | 'scan'（赤・識別中） | 'lock'（緑・一致）
  var sc=$('fa-scan'), tag=$('fa-scan-tag');
  if(sc){ sc.classList.toggle('locked', state==='lock'); }
  if(tag){ tag.textContent = state==='lock' ? 'IDENTIFIED' : (state==='scan' ? '顔識別中…' : '顔を探索中…'); }
}

function paint(best){
  var box=$('fa-result');
  if(!best){ box.style.background='#f3f4f6'; box.style.borderColor='#e5e7eb';
    $('fa-verdict').textContent='顔を探しています…'; $('fa-verdict').style.color='#6b7280'; $('fa-detail').textContent='';
    setScan('search'); return; }
  var pass = best.pct>=threshold;
  box.style.background = pass ? '#f0fdf4' : '#fef2f2';
  box.style.borderColor = pass ? '#bbf7d0' : '#fecaca';
  $('fa-verdict').textContent = pass ? ('本人と判定：'+best.label) : '別人と判定（どの登録ともしきい値未満）';
  $('fa-verdict').style.color = pass ? '#166534' : '#b91c1c';
  $('fa-detail').textContent = '最も近い登録「'+best.label+'」との一致度 '+best.pct+'%（しきい値 '+threshold+'%）／生の距離 '+best.dist.toFixed(3);
  setScan(pass ? 'lock' : 'scan');
}

function renderTable(scored){
  var el=$('fa-table');
  if(!scored||!scored.length){ el.innerHTML=''; return; }
  el.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:13px;">'
    +'<tr style="color:#9ca3af;text-align:left;"><th style="padding:4px 6px;">登録名</th><th style="padding:4px 6px;">一致度</th><th style="padding:4px 6px;">この設定での判定</th></tr>'
    +scored.map(function(s){
      var pass=s.pct>=threshold;
      return '<tr style="border-top:1px solid #f1f5f9;"><td style="padding:5px 6px;font-weight:700;color:#1e3a5f;">'+esc(s.label)+'</td>'
        +'<td style="padding:5px 6px;">'+s.pct+'%</td>'
        +'<td style="padding:5px 6px;color:'+(pass?'#166534':'#9ca3af')+';font-weight:'+(pass?'700':'400')+';">'+(pass?'通す':'弾く')+'</td></tr>';
    }).join('')+'</table>';
}

function tick(){
  if(!loopOn) return;
  var v=$('fa-video');
  if(!ready){ setStatus('顔認識エンジンの準備待ち…'); schedule(); return; }
  if(!v || !v.videoWidth || !v.videoHeight){ setStatus('映像の準備待ち…'); schedule(); return; }
  faceapi.detectSingleFace(v, detOpts()).withFaceLandmarks().withFaceDescriptor()
    .then(function(res){
      lastErr='';
      if(!res||!res.descriptor){ setStatus('照合中…（顔を検出できていません）'); paint(null); renderTable([]); schedule(); return; }
      if(!faces.length){ setStatus('登録された顔がありません。設定→顔認証で登録してください。', true); paint(null); renderTable([]); schedule(); return; }
      setStatus('照合中…');
      var scored=faces.map(function(f){ var dist=euclid(res.descriptor,f.d); return { label:f.label, dist:dist, pct:simPct(dist) }; });
      scored.sort(function(a,b){ return a.dist-b.dist; });
      paint(scored[0]); renderTable(scored); schedule();
    })
    .catch(function(e){
      var msg=(e&&(e.message||(''+e)))||'不明なエラー';
      if(msg!==lastErr){ lastErr=msg; try{ console.error('face tick error', e); }catch(x){} setStatus('照合エラー: '+msg, true); }
      schedule();
    });
}
function schedule(){ setTimeout(function(){ requestAnimationFrame(tick); }, 200); }

function init(){
  var sl=$('fa-th'); threshold=parseInt(sl.value,10)||50; $('fa-th-val').textContent=threshold+'%';
  sl.addEventListener('input', function(){ threshold=parseInt(sl.value,10)||0; $('fa-th-val').textContent=threshold+'%'; });
  $('fa-start').addEventListener('click', startCamera);
  if(typeof faceapi==='undefined'){ setStatus('顔認識エンジンを読み込めませんでした（スクリプトがブロックされています）',true); return; }
  loadFaces(); loadModels();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
`;

// ===== 顔の登録ページ（設定） =====
const REGISTER_JS = `
(function(){
'use strict';
var MODEL_URL = window.__FA_MODEL_URL;
var ADMIN = window.__FA_ADMIN;
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
var ready=false, stream=null, busy=false;

function setStatus(m,e){ var el=$('fa-status'); if(el){ el.textContent=m; el.style.color=e?'#b91c1c':'#6b7280'; } }

function loadModels(){
  setStatus('顔認識エンジンを読み込み中…（初回だけ約7MBの読み込みで数秒かかります）');
  return Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
  ]).then(function(){ ready=true; setStatus('準備完了。カメラを起動して登録できます。'); $('fa-start').disabled=false; })
    .catch(function(e){ setStatus('顔認識エンジンを読み込めませんでした（ネット接続をご確認ください）['+(e&&e.message||e)+']', true); });
}

var opts=null;
function detOpts(){ if(!opts) opts=new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:0.5}); return opts; }

function startCamera(){
  if(stream) return;
  navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:640,height:480},audio:false})
    .then(function(s){ stream=s; var v=$('fa-video'); v.srcObject=s; v.play(); $('fa-capture').disabled=false; setStatus('顔がはっきり写るようにして「この顔を登録」を押してください。'); })
    .catch(function(e){ setStatus('カメラを起動できませんでした（ブラウザのカメラ許可をご確認ください）['+(e&&e.message||e)+']', true); });
}

function meanDescriptor(list){
  var n=list.length, out=new Float32Array(128), i, j;
  for(i=0;i<n;i++){ for(j=0;j<128;j++) out[j]+=list[i][j]; }
  for(j=0;j<128;j++) out[j]/=n;
  var s=0; for(j=0;j<128;j++) s+=out[j]*out[j];
  s=Math.sqrt(s)||1; for(j=0;j<128;j++) out[j]/=s;
  return Array.prototype.slice.call(out);
}

function faLoginFlag(){ var el=$('fa-admin-login'); return !!(el && el.checked); }

function capture(){
  if(busy||!ready||!stream) return;
  var name=($('fa-name').value||'').trim();
  if(!name){ setStatus('先に名前を入力してください。', true); return; }
  busy=true; $('fa-capture').disabled=true;
  var v=$('fa-video'); var got=[]; var tries=0; var NEED=5;
  setStatus('撮影中… 正面を向いたまま、ほんの少しだけ首を動かしてください（0/5）');
  function fail(){ busy=false; $('fa-capture').disabled=false; setStatus('顔をうまく検出できませんでした。明るい場所で正面を向いて、もう一度お試しください。', true); }
  function finish(){
    var desc=meanDescriptor(got.map(function(d){ return Array.prototype.slice.call(d); }));
    fetch(ADMIN+'/api/face-auth/faces', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ label:name, descriptor:desc, sampleCount:got.length, forAdminLogin:faLoginFlag() }) })
      .then(function(r){ return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
      .then(function(res){
        busy=false; $('fa-capture').disabled=false;
        if(!res.ok){ setStatus((res.j&&res.j.error)||'保存に失敗しました', true); return; }
        setStatus('「'+name+'」を登録しました（'+got.length+'フレームの平均）。同じ名前で撮り直すと上書きされます。');
        loadList(); if(window.__gateRefresh) window.__gateRefresh();
      })
      .catch(function(){ busy=false; $('fa-capture').disabled=false; setStatus('通信エラーで保存できませんでした', true); });
  }
  function step(){
    tries++;
    faceapi.detectSingleFace(v, detOpts()).withFaceLandmarks().withFaceDescriptor()
      .then(function(res){
        if(res && res.descriptor){ got.push(res.descriptor); setStatus('撮影中… 正面を向いたまま、ほんの少しだけ首を動かしてください（'+got.length+'/5）'); }
        if(got.length>=NEED){ finish(); return; }
        if(tries>=20){ if(got.length>=2) finish(); else fail(); return; }
        setTimeout(step, 250);
      })
      .catch(function(){ if(tries>=20){ fail(); } else setTimeout(step,250); });
  }
  step();
}

function fileToImage(file){
  return new Promise(function(resolve,reject){
    var url=URL.createObjectURL(file);
    var im=new Image();
    im.onload=function(){ resolve({ im:im, url:url }); };
    im.onerror=function(){ URL.revokeObjectURL(url); reject(new Error('画像を読み込めません')); };
    im.src=url;
  });
}

function handleFiles(ev){
  var files=ev.target.files;
  if(!files || !files.length) return;
  var name=($('fa-name').value||'').trim();
  if(!name){ setStatus('先に名前を入力してください。', true); ev.target.value=''; return; }
  if(!ready){ setStatus('顔認識エンジンの読み込みが終わってから選んでください。', true); return; }
  if(busy) return;
  busy=true;
  var arr=Array.prototype.slice.call(files);
  var descs=[]; var done=0; var prev=$('fa-file-preview'); if(prev) prev.innerHTML='';
  setStatus('写真を解析中… 0/'+arr.length);
  function addChip(url, ok){
    if(!prev) return;
    var chip=document.createElement('span');
    chip.style.cssText='display:inline-block;margin:3px;padding:2px;border:2px solid '+(ok?'#166534':'#dc2626')+';border-radius:6px;vertical-align:top;';
    var t=document.createElement('img'); t.src=url;
    t.style.cssText='width:56px;height:56px;object-fit:cover;border-radius:4px;display:block;';
    chip.appendChild(t); prev.appendChild(chip);
  }
  function finishFiles(){
    if(!descs.length){ busy=false; setStatus('どの写真からも顔を検出できませんでした。正面・明るめの写真でお試しください。', true); return; }
    var desc=meanDescriptor(descs);
    fetch(ADMIN+'/api/face-auth/faces', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ label:name, descriptor:desc, sampleCount:descs.length, forAdminLogin:faLoginFlag() }) })
      .then(function(r){ return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
      .then(function(res){
        busy=false;
        if(!res.ok){ setStatus((res.j&&res.j.error)||'保存に失敗しました', true); return; }
        setStatus('「'+name+'」を写真 '+descs.length+' 枚から登録しました。');
        loadList(); if(window.__gateRefresh) window.__gateRefresh();
      })
      .catch(function(){ busy=false; setStatus('通信エラーで保存できませんでした', true); });
  }
  function next(i){
    if(i>=arr.length){ finishFiles(); return; }
    fileToImage(arr[i]).then(function(o){
      return faceapi.detectSingleFace(o.im, detOpts()).withFaceLandmarks().withFaceDescriptor().then(function(res){
        var ok = !!(res && res.descriptor);
        if(ok) descs.push(Array.prototype.slice.call(res.descriptor));
        addChip(o.url, ok);
        done++; setStatus('写真を解析中… '+done+'/'+arr.length);
        next(i+1);
      });
    }).catch(function(){ done++; setStatus('写真を解析中… '+done+'/'+arr.length); next(i+1); });
  }
  next(0);
}

function loadList(){
  fetch(ADMIN+'/api/face-auth/faces', { credentials:'include' })
    .then(function(r){ return r.json(); })
    .then(function(j){
      var rows=(j&&j.faces)||[]; var el=$('fa-list');
      if(!rows.length){ el.innerHTML='<p style="color:#9ca3af;font-size:13px;margin:0;">まだ登録がありません。</p>'; return; }
      el.innerHTML = rows.map(function(f){
        return '<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;">'
          + '<div style="flex:1;min-width:0;"><div style="font-weight:700;color:#1e3a5f;">'+esc(f.label)+'</div>'
          + '<div style="font-size:11px;color:#9ca3af;">'+esc(f.created_at)+' ・ '+f.sample_count+'フレーム平均 ・ 登録者 '+esc(f.created_by||'-')+'</div></div>'
          + '<button data-id="'+f.id+'" class="fa-del" style="border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;white-space:nowrap;">削除</button>'
          + '</div>';
      }).join('');
      var btns=el.querySelectorAll('.fa-del'); var i;
      for(i=0;i<btns.length;i++){ btns[i].addEventListener('click', function(){ del(this.getAttribute('data-id')); }); }
    });
}
function del(id){
  if(!confirm('この顔の登録を削除します。よろしいですか？')) return;
  fetch(ADMIN+'/api/face-auth/faces/'+id, { method:'DELETE', credentials:'include' })
    .then(function(r){ return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
    .then(function(res){ if(!res.ok){ alert((res.j&&res.j.error)||'削除に失敗しました'); return; } loadList(); });
}

function init(){
  $('fa-start').disabled=true; $('fa-capture').disabled=true;
  $('fa-start').addEventListener('click', startCamera);
  $('fa-capture').addEventListener('click', capture);
  var fi=$('fa-file'); if(fi) fi.addEventListener('change', handleFiles);
  loadList();
  if(typeof faceapi==='undefined'){ setStatus('顔認識エンジンを読み込めませんでした（スクリプトがブロックされています）', true); return; }
  loadModels();
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
`;

// ===== 設定パネル「adminログイン2段階認証」のクライアントJS（adminアカウント時のみ読み込む） =====
const GATE_JS = `
(function(){
'use strict';
var A = window.__FA_ADMIN;
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

var thSave=$('gate-th-save');
if(thSave) thSave.addEventListener('click', function(){
  var v=parseInt(($('gate-th').value||''),10);
  $('gate-th-msg').textContent='保存中…';
  fetch(A+'/api/face-auth/gate/threshold', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ threshold: v }) })
    .then(function(r){ return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
    .then(function(res){ $('gate-th-msg').textContent = res.ok ? ('保存しました（'+res.j.threshold+'%）') : (res.j.error||'保存に失敗しました'); });
});

var pwSave=$('gate-pw-save');
if(pwSave) pwSave.addEventListener('click', function(){
  var v=($('gate-pw').value||'');
  var msg=$('gate-pw-msg');
  if(v.length<8){ msg.textContent='8文字以上にしてください'; return; }
  msg.textContent='保存中…';
  fetch(A+'/api/face-auth/gate/second-password', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ password: v }) })
    .then(function(r){ return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
    .then(function(res){
      if(!res.ok){ msg.textContent = res.j.error || '保存に失敗しました'; return; }
      $('gate-pw').value='';
      msg.textContent='第二パスワードを設定しました。';
      refreshStatus();
    })
    .catch(function(){ msg.textContent='通信エラー'; });
});

var backupBtn=$('gate-backup');
if(backupBtn) backupBtn.addEventListener('click', function(){
  if(!confirm('新しいバックアップコードを10個発行します。今までのコードは使えなくなります。よろしいですか？')) return;
  var box=$('gate-backup-box'); box.textContent='発行中…';
  fetch(A+'/api/face-auth/gate/backup-codes', { method:'POST', credentials:'include' })
    .then(function(r){ return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
    .then(function(res){
      if(!res.ok){ box.textContent = res.j.error || '発行に失敗しました'; return; }
      box.innerHTML = '<div style="font-size:11px;color:#b91c1c;font-weight:700;margin-bottom:6px;">この画面を離れると二度と表示されません。今すぐ紙などに控えて安全な場所へ。</div>'
        + '<div style="font-family:ui-monospace,monospace;font-size:14px;line-height:1.9;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;">'
        + res.j.codes.map(function(c){ return esc(c); }).join('<br>') + '</div>';
      refreshStatus();
    });
});

var enBox=$('gate-enabled');
if(enBox) enBox.addEventListener('change', function(){
  var want=enBox.checked;
  fetch(A+'/api/face-auth/gate/enabled', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ enabled: want }) })
    .then(function(r){ return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
    .then(function(res){
      var msg=$('gate-enabled-msg');
      if(!res.ok){ enBox.checked=!want; msg.textContent = res.j.error || '切り替えに失敗しました'; return; }
      msg.textContent = res.j.enabled ? '2段階認証をONにしました。次回の admin ログインから顔／第二パスワードが必要になります。' : '2段階認証をOFFにしました。';
    });
});

function renderFaces(list, max){
  var box=$('gate-faces'); if(!box) return;
  list = list || [];
  if(!list.length){ box.innerHTML='<div style="font-size:12px;color:#9ca3af;">まだ登録がありません（'+(max||3)+'人まで）。</div>'; return; }
  box.innerHTML = list.map(function(f){
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px;">'
      + '<div style="flex:1;min-width:0;"><span style="font-weight:700;color:#1e3a5f;">'+esc(f.label)+'</span>'
      + ' <span style="font-size:11px;color:#9ca3af;">'+esc(f.created_at)+'</span></div>'
      + '<button data-id="'+f.id+'" class="gate-face-del" style="border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;border-radius:6px;padding:5px 10px;font-size:11px;cursor:pointer;">削除</button>'
      + '</div>';
  }).join('');
  var btns=box.querySelectorAll('.gate-face-del'); var i;
  for(i=0;i<btns.length;i++){ btns[i].addEventListener('click', function(){
    if(!confirm('この顔を adminログイン認証から削除します。よろしいですか？')) return;
    fetch(A+'/api/face-auth/faces/'+this.getAttribute('data-id'), { method:'DELETE', credentials:'include' })
      .then(function(r){ return r.json().then(function(j){ return {ok:r.ok,j:j}; }); })
      .then(function(res){ if(!res.ok){ alert((res.j&&res.j.error)||'削除に失敗しました'); return; } refreshStatus(); if(typeof loadList==='function') loadList(); });
  }); }
}

function refreshStatus(){
  fetch(A+'/api/face-auth/gate', { credentials:'include' }).then(function(r){ return r.json(); }).then(function(j){
    if(j && typeof j.hasSecondPw==='boolean'){
      var m=$('gate-enabled-msg');
      m.textContent = '現在の状態 → 顔:'+((j.adminFaces&&j.adminFaces.length)||0)+'/'+(j.maxFaces||3)+' / 第二PW:'+(j.hasSecondPw?'OK':'未')+' / コード残:'+(j.backupCount||0)+(j.killKeyConfigured?'':' （※緊急停止キー未設定）');
      renderFaces(j.adminFaces, j.maxFaces);
    }
  }).catch(function(){});
}
window.__gateRefresh = refreshStatus;
refreshStatus();
})();
`;

const VIDEO_BOX = (id: string, scan = false) => `
  <div class="fa-cam" style="position:relative;background:#0f172a;border-radius:12px;overflow:hidden;aspect-ratio:4/3;max-width:480px;">
    <video id="${id}" playsinline muted style="width:100%;height:100%;object-fit:cover;transform:scaleX(-1);"></video>
    ${scan ? `<div class="fa-scan" id="fa-scan">
      <div class="fa-grid"></div>
      <div class="fa-band"></div>
      <div class="fa-line"></div>
      <span class="fa-corner tl"></span><span class="fa-corner tr"></span><span class="fa-corner bl"></span><span class="fa-corner br"></span>
      <span class="fa-tag" id="fa-scan-tag">起動待ち</span>
    </div>` : ''}
  </div>`;

// スキャンレーザー演出（照合中に赤い走査線が上下、一致すると緑にロックオン）
const SCAN_CSS = `
<style>
  .fa-scan{ position:absolute; inset:0; pointer-events:none; opacity:0; transition:opacity .35s ease; }
  .fa-scan.on{ opacity:1; }
  .fa-scan .fa-grid{
    position:absolute; inset:0;
    background-image:linear-gradient(rgba(255,60,60,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,60,60,.08) 1px, transparent 1px);
    background-size:26px 26px; mix-blend-mode:screen;
  }
  .fa-scan .fa-line{
    position:absolute; left:0; right:0; height:2px; top:6%;
    background:linear-gradient(90deg, transparent, #ff2d2d 18%, #ffd0d0 50%, #ff2d2d 82%, transparent);
    box-shadow:0 0 10px 2px rgba(255,45,45,.75), 0 0 34px 6px rgba(255,45,45,.35);
    animation:fa-sweep 2.1s cubic-bezier(.5,0,.5,1) infinite;
  }
  .fa-scan .fa-band{
    position:absolute; left:0; right:0; height:70px; top:6%; transform:translateY(-50%);
    background:linear-gradient(180deg, rgba(255,45,45,0), rgba(255,45,45,.16) 48%, rgba(255,45,45,0));
    mix-blend-mode:screen; animation:fa-sweep 2.1s cubic-bezier(.5,0,.5,1) infinite;
  }
  .fa-scan .fa-corner{ position:absolute; width:26px; height:26px; border:2px solid rgba(255,45,45,.9); box-shadow:0 0 10px rgba(255,45,45,.5); transition:border-color .25s, box-shadow .25s; }
  .fa-scan .fa-corner.tl{ top:12px; left:12px; border-right:0; border-bottom:0; }
  .fa-scan .fa-corner.tr{ top:12px; right:12px; border-left:0; border-bottom:0; }
  .fa-scan .fa-corner.bl{ bottom:12px; left:12px; border-right:0; border-top:0; }
  .fa-scan .fa-corner.br{ bottom:12px; right:12px; border-left:0; border-top:0; }
  .fa-scan .fa-tag{
    position:absolute; left:50%; bottom:12px; transform:translateX(-50%);
    font-size:11px; font-weight:800; letter-spacing:.22em; color:#ff6b6b;
    text-shadow:0 0 8px rgba(255,45,45,.85); font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  }
  .fa-scan.locked .fa-line, .fa-scan.locked .fa-band{ opacity:0; animation-play-state:paused; }
  .fa-scan.locked .fa-grid{ background-image:linear-gradient(rgba(34,197,94,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,.08) 1px, transparent 1px); }
  .fa-scan.locked .fa-corner{ border-color:rgba(34,197,94,.95); box-shadow:0 0 14px rgba(34,197,94,.65); }
  .fa-scan.locked .fa-tag{ color:#4ade80; text-shadow:0 0 10px rgba(34,197,94,.85); }
  @keyframes fa-sweep{ 0%{ top:6%; } 50%{ top:94%; } 100%{ top:6%; } }
  @media (prefers-reduced-motion: reduce){ .fa-scan .fa-line, .fa-scan .fa-band{ animation:none; top:50%; } }
</style>`;

function headScripts(adminPath: string): string {
  return `
  <script>window.__FA_ADMIN=${JSON.stringify(adminPath)};window.__FA_MODEL_URL=${JSON.stringify(MODEL_URL)};</script>
  <script src="${FACEAPI_SRC}" crossorigin="anonymous"></script>`;
}

// ---- サイドバー「顔認証」= 照合テスト ----
export function faceAuthMatchPage(adminPath: string): string {
  return `
  ${SCAN_CSS}
  <div style="max-width:960px;margin:0 auto;">
    <h2 style="font-size:18px;font-weight:700;color:#1e3a5f;margin:0 0 4px;">顔認証（照合テスト）</h2>
    <p style="font-size:12px;color:#9ca3af;margin:0 0 16px;">今後のセキュリティ機能に向けた検証用ページです。ログイン等には接続していません。</p>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 16px;font-size:13px;color:#1e3a5f;line-height:1.7;margin-bottom:16px;">
      <b>この画面でわかること</b><br>
      カメラに写った顔を、登録済みの顔と比べて「一致度%」を出します。<br>
      「本人と認める最低ライン（しきい値）」を上げるほど<b>厳しく</b>なり、他人はまず通れませんが、メガネ・照明・角度で本人も弾かれやすくなります。下げるほど<b>甘く</b>なり、本人は通りますが他人が紛れ込みやすくなります。<br>
      <b>測り方：</b>まず自分の顔で通ることを確認 → 別の人に映ってもらって弾かれることを確認 → その両方が成り立つ一番高いラインが、この環境での実力です。
    </div>

    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">
      <div style="flex:1;min-width:300px;">
        ${VIDEO_BOX('fa-video', true)}
        <div style="margin-top:10px;">
          <button id="fa-start" style="padding:9px 20px;background:#1e3a5f;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">カメラを起動</button>
        </div>
        <div id="fa-status" style="font-size:12px;color:#6b7280;margin-top:8px;min-height:18px;">初期化中…</div>
      </div>

      <div style="flex:1;min-width:300px;">
        <div id="fa-result" style="border:1px solid #e5e7eb;background:#f3f4f6;border-radius:12px;padding:16px;margin-bottom:14px;">
          <div id="fa-verdict" style="font-size:16px;font-weight:800;color:#6b7280;">カメラ未起動</div>
          <div id="fa-detail" style="font-size:12px;color:#6b7280;margin-top:6px;min-height:16px;"></div>
        </div>

        <label style="display:block;font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">本人と認める最低ライン（しきい値）：<span id="fa-th-val">50%</span></label>
        <input id="fa-th" type="range" min="0" max="95" value="50" step="1" style="width:100%;">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#9ca3af;margin-top:2px;">
          <span>甘い（他人も通りやすい）</span><span>厳しい（本人も弾かれやすい）</span>
        </div>

        <div id="fa-table" style="margin-top:16px;"></div>
      </div>
    </div>
  </div>
  ${headScripts(adminPath)}
  <script>${MATCH_JS}</script>`;
}

// ---- 設定サブページ「顔認証（顔の登録）」 ----
export function faceAuthRegisterPage(adminPath: string, defaultName = '', isAdmin = false, gatePanel = ''): string {
  const adminLoginCheckbox = isAdmin ? `
    <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:#1e3a5f;margin-top:10px;line-height:1.5;cursor:pointer;">
      <input id="fa-admin-login" type="checkbox" style="width:15px;height:15px;margin-top:1px;">
      <span>この顔を <b>admin 本人のログイン認証</b> にも使う（下の「2段階認証」で有効化）。登録する顔が admin 本人のときだけチェック。</span>
    </label>` : '';
  return `
  <div class="no-print" style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
    <a href="${adminPath}/settings" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:white;">← 設定に戻る</a>
    <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;margin:0;">顔認証（顔の登録）</h2>
  </div>

  <div style="max-width:900px;">
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px 16px;font-size:13px;color:#166534;line-height:1.7;margin-bottom:16px;">
      カメラで顔を数フレーム撮影する、または<b>顔写真ファイルを選ぶ</b>と、そこから<b>その人固有の特徴（数値128個）</b>を作って保存します。<br>
      <b>顔写真そのものは保存しません。</b>保存されるのは数値の列だけなので、漏れても写真は復元できません。<br>
      登録した顔は、左メニュー「顔認証」の照合テストで使えます。同じ名前で登録し直すと上書きされます。
    </div>

    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:6px;">名前</label>
      <input id="fa-name" type="text" value="${String(defaultName).replace(/"/g, '&quot;')}" placeholder="例: 管理者名" style="max-width:360px;width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">
      ${adminLoginCheckbox}
    </div>

    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start;">
      <div style="flex:1;min-width:300px;">
        <div style="font-size:12px;font-weight:700;color:#9ca3af;letter-spacing:.06em;margin-bottom:8px;">方法1：カメラで撮る</div>
        ${VIDEO_BOX('fa-video')}
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button id="fa-start" style="padding:9px 20px;background:#1e3a5f;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">カメラを起動</button>
          <button id="fa-capture" style="padding:9px 20px;background:#166534;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">この顔を登録</button>
        </div>

        <div style="font-size:12px;font-weight:700;color:#9ca3af;letter-spacing:.06em;margin:18px 0 8px;">方法2：写真ファイルから登録（カメラが無いPC向け）</div>
        <p style="font-size:12px;color:#6b7280;margin:0 0 8px;line-height:1.6;">顔が正面ではっきり写った写真を選んでください。複数枚選ぶと平均して精度が上がります。</p>
        <input id="fa-file" type="file" accept="image/*" multiple style="font-size:12px;">
        <div id="fa-file-preview" style="margin-top:8px;"></div>

        <div id="fa-status" style="font-size:12px;color:#6b7280;margin-top:12px;min-height:18px;">初期化中…</div>
      </div>

      <div style="flex:1;min-width:300px;">
        <div style="font-size:13px;font-weight:700;color:#1e3a5f;margin-bottom:8px;">登録済みの顔</div>
        <div id="fa-list"></div>
      </div>
    </div>

    ${gatePanel}
  </div>
  ${headScripts(adminPath)}
  <script>${REGISTER_JS}</script>
  ${gatePanel ? `<script>${GATE_JS}</script>` : ''}`;
}
