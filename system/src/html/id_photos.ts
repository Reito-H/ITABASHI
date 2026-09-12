// 課長ミッション: 乗務員証 証明写真 撮影・自動切り取り。
// 全処理はブラウザ内で完結（写真の保存なし）。顔検出は MediaPipe Tasks-Vision の
// BlazeFace（軽量モデルを同梱）。出力は A4タテ12面付け / Lサイズ の PDF・PPTX。
// 両面印刷用に「写真の真裏」へ 課/班/氏名 を刷る裏面ページも生成（長辺/短辺 綴じ切替）。
import { BLAZEFACE_TFLITE_B64 } from '../assets/blazeface_model';

// --- クライアント JS ---------------------------------------------------------
// 注意: この文字列はTSテンプレートリテラル。バックスラッシュは二重に、
// バッククォートと ${ は使わないこと（[[feedback_ts_template_client_js_escaping]]）。
const CLIENT_JS = `
(function(){
'use strict';

// ===== 定数 =====
var DPI = 220;                       // 出力キャンバスの解像度
var MM = DPI / 25.4;                 // 1mm = ? px
function mm(v){ return v * MM; }
var DEF_OUT_W = 40, DEF_OUT_H = 60;            // 証明写真 縦6cm×横4cm（既定・タクシーセンター基準）
var DEF_FACE_MM = 40;                          // 頭頂〜あご 既定（3cm以上）
var DEF_TOP_MM  = 7;                           // 頭の上の余白 既定
var MIN_FACE_MM = 30;                          // タクシーセンター基準の下限

var PAPERS = {
  a4: { w: 210, h: 297 },
  l:  { w: 89,  h: 127 }
};

// ===== 状態 =====
var PHOTOS = [];   // { id, img, natW, natH, cx, cy, boxH, rot, crownY, chinY, detected,
                   //   person(検索で選択したemployee) | null, mDiv, mTeam, mName(手入力),
                   //   dirty(サーバー保存後に調整したか), serverIdx(サーバー上で今この写真が入っているindex, 未保存はnull) }
var SEQ = 0;
var SET = { paper: 'a4', lslots: 1, binding: 'long', includeBack: true,
            outW: DEF_OUT_W, outH: DEF_OUT_H, faceMM: DEF_FACE_MM, topMM: DEF_TOP_MM };
var EDIT = -1;     // 編集中の PHOTOS index
var FACE_DETECTOR = null;
var FACE_INIT_STARTED = false;
var FACE_STATUS = 'idle';   // idle | loading | ready | error
var CURRENT_BATCH_ID = null;     // 呼び出し中/保存済みのバッチID（未保存はnull）
var CURRENT_BATCH_LABEL = '';
function markDirty(p){ p.dirty = true; }

// ===== ユーティリティ =====
function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtName(s){ return String(s||'').split('　').join(' ').trim(); }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function download(blob, name){
  var u = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(u); a.remove(); }, 1500);
}
function canvasToBlob(cv, type, q){
  return new Promise(function(res){ cv.toBlob(function(b){ res(b); }, type||'image/jpeg', q||0.92); });
}
function blobBytes(b){ return b.arrayBuffer().then(function(ab){ return new Uint8Array(ab); }); }

// ===== 顔検出（MediaPipe / 同梱モデル） =====
function b64ToBytes(b64){
  var bin = atob(b64);
  var out = new Uint8Array(bin.length);
  for (var i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
  return out;
}
function initFace(){
  if (FACE_INIT_STARTED) return;
  FACE_INIT_STARTED = true;
  FACE_STATUS = 'loading'; paintFaceStatus();
  import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs')
    .then(function(mod){
      return mod.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
        .then(function(fileset){
          return mod.FaceDetector.createFromOptions(fileset, {
            baseOptions: { modelAssetBuffer: b64ToBytes(window.__BLAZEFACE_B64) },
            runningMode: 'IMAGE',
            minDetectionConfidence: 0.4
          });
        });
    })
    .then(function(det){
      FACE_DETECTOR = det; FACE_STATUS = 'ready'; paintFaceStatus();
      // 未検出の写真を自動処理
      PHOTOS.forEach(function(p){ if (!p.detected) { try { detectFace(p); } catch(e){} } });
      renderList();
      if (EDIT >= 0) renderEditor();
    })
    .catch(function(err){
      console.error('face init failed', err);
      FACE_ERR = (err && (err.message || err.name)) ? String(err.message || err.name) : String(err);
      FACE_STATUS = 'error'; paintFaceStatus();
    });
}
var FACE_ERR = '';
function paintFaceStatus(){
  var el = $('face-status'); if (!el) return;
  var m = { idle:'', loading:'顔認識エンジンを読み込み中…（初回は11MBの読み込みで数秒）', ready:'顔認識: 準備完了', error:'顔認識エンジンを読み込めませんでした（手動で枠を調整できます）' };
  el.textContent = m[FACE_STATUS] || '';
  if (FACE_STATUS === 'error' && FACE_ERR) el.textContent += ' [' + FACE_ERR + ']';
  el.style.color = FACE_STATUS === 'error' ? '#b91c1c' : '#6b7280';
}

// crownY/chinY/cx/cy/boxH/rot を検出結果から算出
function detectFace(p){
  if (!FACE_DETECTOR) return false;
  var r = FACE_DETECTOR.detect(p.img);
  var ds = (r && r.detections) || [];
  if (!ds.length) return false;
  // 最大の顔
  ds.sort(function(a,b){ return (b.boundingBox.width*b.boundingBox.height) - (a.boundingBox.width*a.boundingBox.height); });
  var d = ds[0];
  var bb = d.boundingBox;                 // px 単位（origin は左上）
  var kp = d.keypoints || [];             // 正規化 0..1: 0=右目 1=左目 2=鼻 3=口 4=右耳 5=左耳
  var W = p.natW, H = p.natH;
  function kx(i){ return kp[i] ? kp[i].x * W : null; }
  function ky(i){ return kp[i] ? kp[i].y * H : null; }
  var reX = kx(0), reY = ky(0), leX = kx(1), leY = ky(1);
  var noseX = kx(2), mouthY = ky(3);
  var eyeMidX = (reX!=null&&leX!=null) ? (reX+leX)/2 : (bb.originX + bb.width/2);
  var eyeMidY = (reY!=null&&leY!=null) ? (reY+leY)/2 : (bb.originY + bb.height*0.4);
  var e2m = (mouthY!=null) ? (mouthY - eyeMidY) : bb.height*0.34;
  if (!(e2m > 4)) e2m = bb.height*0.34;

  // 頭頂・あごの推定（キーポイント基準 + バウンディングボックスで補正）
  var crownEst = eyeMidY - e2m * 2.85;
  var chinEst  = (mouthY!=null ? mouthY : eyeMidY + e2m) + e2m * 1.10;
  var crownBB  = bb.originY - bb.height * 0.28;
  var chinBB   = bb.originY + bb.height * 1.03;
  var crownY = clamp(crownEst*0.6 + crownBB*0.4, 0, H);
  var chinY  = clamp(chinEst*0.6  + chinBB*0.4,  0, H);
  if (chinY - crownY < 10) { crownY = clamp(bb.originY - bb.height*0.2,0,H); chinY = clamp(bb.originY + bb.height*1.05,0,H); }

  p.crownY = crownY;
  p.chinY  = chinY;
  p.cxAuto = (noseX!=null ? noseX : eyeMidX);
  // 眼のライン角度で傾き補正
  if (reX!=null && leX!=null && Math.abs(leX-reX) > 1){
    p.rot = -Math.atan2((leY-reY),(leX-reX)) * 180/Math.PI;
    if (Math.abs(p.rot) > 20) p.rot = 0;
  } else p.rot = 0;
  p.detected = true;
  autoFrame(p);
  return true;
}

// crownY/chinY と SET.faceMM / SET.topMM から cx,cy,boxH を決める
function autoFrame(p){
  var faceMM = clamp(SET.faceMM, Math.min(MIN_FACE_MM, SET.outH * 0.5), SET.outH - 4);
  var topMM  = clamp(SET.topMM, 1, SET.outH * 0.5);
  var faceSrc = Math.max(4, p.chinY - p.crownY);
  p.boxH = faceSrc * SET.outH / faceMM;                 // 出力60mmに対応する元画像px
  p.cx = (p.cxAuto!=null ? p.cxAuto : p.natW/2);
  p.cy = p.crownY + p.boxH/2 - topMM * p.boxH / SET.outH;
  p.offX = 0; p.offY = 0; p.zoom = 1;
}

// ===== 写真追加 =====
function addImageFromSrc(src){
  var img = new Image();
  img.onload = function(){
    var p = {
      id: (++SEQ), img: img, natW: img.naturalWidth, natH: img.naturalHeight,
      cx: img.naturalWidth/2, cy: img.naturalHeight/2,
      boxH: Math.min(img.naturalWidth*1.5, img.naturalHeight),
      rot: 0, crownY: img.naturalHeight*0.12, chinY: img.naturalHeight*0.62,
      cxAuto: img.naturalWidth/2, offX:0, offY:0, zoom:1,
      detected: false, person: null, mDiv:'', mTeam:'', mName:'',
      dirty: true, serverIdx: null
    };
    autoFrame(p);
    PHOTOS.push(p);
    renderList();
    if (FACE_DETECTOR){ try { if (detectFace(p)) renderList(); } catch(e){} }
    else initFace();
  };
  img.onerror = function(){ alert('この画像を読み込めませんでした。JPEGまたはPNGでお試しください（HEIC等は非対応の場合があります）。'); };
  img.src = src;
}
function handleFiles(files){
  Array.prototype.forEach.call(files, function(f){
    if (!/^image\\//.test(f.type) && !/\\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)) return;
    var fr = new FileReader();
    fr.onload = function(){ addImageFromSrc(fr.result); };
    fr.readAsDataURL(f);
  });
}

// ===== カメラ =====
var CAM_STREAM = null;
function openCamera(){
  var box = $('cam-box'); box.style.display = 'block';
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width:{ideal:1280}, height:{ideal:1600} }, audio:false })
    .then(function(st){ CAM_STREAM = st; var v = $('cam-video'); v.srcObject = st; v.play(); })
    .catch(function(){ alert('カメラを開始できませんでした。ブラウザのカメラ許可を確認してください。'); box.style.display='none'; });
}
function closeCamera(){
  if (CAM_STREAM){ CAM_STREAM.getTracks().forEach(function(t){ t.stop(); }); CAM_STREAM = null; }
  $('cam-box').style.display = 'none';
}
function shootCamera(){
  var v = $('cam-video');
  if (!v.videoWidth) return;
  var cv = document.createElement('canvas');
  cv.width = v.videoWidth; cv.height = v.videoHeight;
  cv.getContext('2d').drawImage(v, 0, 0);
  addImageFromSrc(cv.toDataURL('image/jpeg', 0.95));
  closeCamera();
}

// ===== 切り取り描画 =====
// 元画像 p を w×h（アスペクト 2:3）の ctx へ、cx/cy/boxH/rot と微調整(offX/offY mm, zoom)で描画
function drawCrop(ctx, p, x, y, w, h){
  var boxH = p.boxH / (p.zoom || 1);
  var boxW = boxH * (w / h);
  var cx = p.cx + (p.offX || 0) * boxH / SET.outH;
  var cy = p.cy + (p.offY || 0) * boxH / SET.outH;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, w, h);
  ctx.translate(x + w/2, y + h/2);
  ctx.rotate((p.rot || 0) * Math.PI / 180);
  var s = w / boxW;
  ctx.scale(s, s);
  ctx.translate(-cx, -cy);
  ctx.drawImage(p.img, 0, 0);
  ctx.restore();
  return { boxH: boxH, cx: cx, cy: cy };
}
// 現在のフレームでの 頭頂〜あご(mm)
function faceMMof(p){
  var boxH = p.boxH / (p.zoom || 1);
  return (p.chinY - p.crownY) / boxH * SET.outH * Math.cos((p.rot||0)*Math.PI/180);
}

// ===== 一覧 =====
function renderList(){
  var wrap = $('list');
  if (!PHOTOS.length){ wrap.innerHTML = '<p style="color:#9ca3af;font-size:13px;margin:8px 0;">写真がありません。上のボタンから撮影またはファイルを追加してください。</p>'; syncCount(); return; }
  wrap.innerHTML = PHOTOS.map(function(p, i){
    return '<div style="display:flex;gap:12px;align-items:center;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px;">' +
      '<canvas id="thumb-' + p.id + '" width="80" height="120" style="width:80px;height:120px;border:1px solid #d1d5db;border-radius:4px;background:#f3f4f6;flex:none;"></canvas>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:13px;font-weight:700;color:#1e3a5f;">' + (i+1) + '枚目' +
          '<span id="fm-' + p.id + '" style="margin-left:10px;font-weight:600;"></span></div>' +
        '<div style="font-size:12px;color:#374151;margin-top:4px;">' + personLabel(p) + '</div>' +
      '</div>' +
      '<div style="display:flex;flex-direction:column;gap:6px;flex:none;">' +
        '<button data-act="edit" data-i="' + i + '" style="padding:6px 14px;background:#1e3a5f;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;">調整</button>' +
        '<div style="display:flex;gap:4px;">' +
          '<button data-act="up" data-i="' + i + '" style="padding:5px 8px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;">↑</button>' +
          '<button data-act="down" data-i="' + i + '" style="padding:5px 8px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;">↓</button>' +
          '<button data-act="del" data-i="' + i + '" style="padding:5px 8px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:6px;font-size:12px;cursor:pointer;">削除</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
  PHOTOS.forEach(function(p){
    var cv = $('thumb-' + p.id);
    if (cv) drawCrop(cv.getContext('2d'), p, 0, 0, cv.width, cv.height);
    var fm = $('fm-' + p.id);
    if (fm){
      var v = faceMMof(p);
      fm.textContent = '頭頂〜あご ' + v.toFixed(1) + 'mm';
      fm.style.color = v < MIN_FACE_MM ? '#b91c1c' : '#166534';
    }
  });
  wrap.querySelectorAll('button[data-act]').forEach(function(b){
    b.addEventListener('click', function(){
      var i = parseInt(b.getAttribute('data-i'), 10);
      var act = b.getAttribute('data-act');
      if (act === 'edit') openEditor(i);
      else if (act === 'del'){ PHOTOS.splice(i,1); renderList(); }
      else if (act === 'up' && i > 0){ var t = PHOTOS[i-1]; PHOTOS[i-1] = PHOTOS[i]; PHOTOS[i] = t; renderList(); }
      else if (act === 'down' && i < PHOTOS.length-1){ var u = PHOTOS[i+1]; PHOTOS[i+1] = PHOTOS[i]; PHOTOS[i] = u; renderList(); }
    });
  });
  syncCount();
}
function personLabel(p){
  var d = p.person ? (p.person.division || '') : (p.mDiv || '');
  var t = p.person ? (p.person.team || '') : (p.mTeam || '');
  var n = p.person ? fmtName(p.person.name) : (p.mName || '');
  var parts = [];
  if (d) parts.push(d + '課');
  if (t) parts.push(t + '班');
  if (n) parts.push(n);
  if (!parts.length) return '<span style="color:#9ca3af;">裏面: 未設定（空欄で印刷）</span>';
  return '裏面: ' + esc(parts.join('　'));
}
function syncCount(){
  var per = perPage();
  var sheets = Math.ceil(PHOTOS.length / per) || 0;
  $('count').textContent = PHOTOS.length + '枚 / ' + SET.outW + '×' + SET.outH + 'mm / ' +
    (SET.paper === 'a4' ? ('A4 1枚' + per + '面 × ' + sheets + '枚') : ('L ' + sheets + '枚')) +
    (SET.includeBack ? '（＋裏面）' : '');
}

// ===== 編集モーダル =====
function openEditor(i){
  EDIT = i;
  $('editor').style.display = 'flex';
  renderEditor();
}
function closeEditor(){ EDIT = -1; $('editor').style.display = 'none'; }
function renderEditor(){
  if (EDIT < 0) return;
  var p = PHOTOS[EDIT];
  var host = $('editor-body');
  host.innerHTML =
    '<div style="display:flex;gap:20px;flex-wrap:wrap;">' +
      '<div style="flex:none;">' +
        '<canvas id="ed-cv" width="300" height="450" style="width:300px;height:450px;border:1px solid #cbd5e1;border-radius:6px;background:#f1f5f9;touch-action:none;cursor:move;"></canvas>' +
        '<div id="ed-fm" style="text-align:center;font-size:13px;font-weight:700;margin-top:6px;"></div>' +
        '<div style="font-size:11px;color:#6b7280;text-align:center;">枠内をドラッグ / ホイールで拡大縮小</div>' +
      '</div>' +
      '<div style="flex:1;min-width:260px;display:flex;flex-direction:column;gap:14px;">' +
        rangeRow('ed-zoom', '顔の大きさ', 60, 170, Math.round((p.zoom||1)*100), '%') +
        rangeRow('ed-top', '頭の上の余白', 1, 20, Math.round(clamp(currentTopMM(p),1,20)), 'mm') +
        rangeRow('ed-x', '左右位置', -18, 18, Math.round(p.offX||0), 'mm') +
        rangeRow('ed-rot', '傾き', -15, 15, Math.round(p.rot||0), '°') +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
          '<span style="font-size:12px;color:#374151;">検出線の補正</span>' +
          '<button data-adj="crown-up" style="padding:4px 9px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;cursor:pointer;">頭頂▲</button>' +
          '<button data-adj="crown-dn" style="padding:4px 9px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;cursor:pointer;">頭頂▼</button>' +
          '<button data-adj="chin-up" style="padding:4px 9px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;cursor:pointer;">あご▲</button>' +
          '<button data-adj="chin-dn" style="padding:4px 9px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;cursor:pointer;">あご▼</button>' +
          '<button data-adj="redetect" style="padding:4px 10px;font-size:12px;border:1px solid #93c5fd;border-radius:6px;background:#eff6ff;color:#1d4ed8;cursor:pointer;">顔を再検出</button>' +
          '<button data-adj="reset" style="padding:4px 10px;font-size:12px;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;cursor:pointer;">自動に戻す</button>' +
        '</div>' +
        '<hr style="border:none;border-top:1px solid #e5e7eb;margin:2px 0;">' +
        '<div>' +
          '<div style="font-size:12px;color:#374151;margin-bottom:4px;">裏面に刷る人物（氏名検索）</div>' +
          '<div id="ed-pwrap" style="position:relative;">' +
            '<input id="ed-q" placeholder="氏名の一部を入力" autocomplete="off" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:8px 10px;font-size:13px;">' +
            '<div id="ed-dd" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:5;background:#fff;border:1px solid #d1d5db;border-radius:0 0 6px 6px;max-height:220px;overflow:auto;box-shadow:0 6px 16px rgba(0,0,0,.12);"></div>' +
          '</div>' +
          '<div id="ed-psel" style="font-size:12px;margin-top:6px;color:#374151;"></div>' +
          '<div style="display:flex;gap:6px;margin-top:8px;align-items:center;flex-wrap:wrap;">' +
            '<span style="font-size:11px;color:#9ca3af;">未登録なら手入力可:</span>' +
            '<input id="ed-mdiv" placeholder="課" style="width:44px;border:1px solid #d1d5db;border-radius:6px;padding:5px 6px;font-size:12px;">' +
            '<input id="ed-mteam" placeholder="班" style="width:44px;border:1px solid #d1d5db;border-radius:6px;padding:5px 6px;font-size:12px;">' +
            '<input id="ed-mname" placeholder="氏名" style="flex:1;min-width:120px;border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:12px;">' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  $('ed-mdiv').value = p.mDiv || '';
  $('ed-mteam').value = p.mTeam || '';
  $('ed-mname').value = p.mName || '';
  paintPsel(p);
  bindEditor(p);
  drawEditor(p);
}
function rangeRow(id, label, min, max, val, unit){
  return '<div><div style="display:flex;justify-content:space-between;font-size:12px;color:#374151;margin-bottom:2px;">' +
    '<span>' + label + '</span><span id="' + id + '-v">' + val + unit + '</span></div>' +
    '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" value="' + val + '" style="width:100%;"></div>';
}
// 現フレームでの「頭の上の余白(mm)」 = baseTop - offY
function baseTopMM(p){
  var boxH = p.boxH / (p.zoom || 1);
  return (p.crownY - p.cy + boxH/2) / boxH * SET.outH;
}
function currentTopMM(p){ return baseTopMM(p) - (p.offY || 0); }
function setTopMM(p, targetMM){ p.offY = baseTopMM(p) - targetMM; }
function bindEditor(p){
  function num(id){ return parseFloat($(id).value); }
  function upd(){
    markDirty(p);
    p.zoom = clamp(num('ed-zoom')/100, 0.4, 2.2);
    p.offX = num('ed-x');
    p.rot  = num('ed-rot');
    setTopMM(p, num('ed-top'));
    $('ed-zoom-v').textContent = Math.round(p.zoom*100) + '%';
    $('ed-top-v').textContent = Math.round(num('ed-top')) + 'mm';
    $('ed-x-v').textContent = Math.round(p.offX) + 'mm';
    $('ed-rot-v').textContent = Math.round(p.rot) + '°';
    drawEditor(p);
  }
  ['ed-zoom','ed-top','ed-x','ed-rot'].forEach(function(id){ $(id).addEventListener('input', upd); });

  var cv = $('ed-cv');
  var dragging = false, lx = 0, ly = 0;
  cv.addEventListener('pointerdown', function(e){ dragging = true; lx = e.clientX; ly = e.clientY; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', function(e){
    if (!dragging) return;
    markDirty(p);
    var boxH = p.boxH / (p.zoom || 1);
    var srcPerCss = boxH / 450;               // キャンバス表示高450px
    p.cx -= (e.clientX - lx) * srcPerCss;
    p.cy -= (e.clientY - ly) * srcPerCss;
    lx = e.clientX; ly = e.clientY;
    drawEditor(p);
  });
  cv.addEventListener('pointerup', function(){ if (dragging){ dragging = false; renderEditor(); } });
  cv.addEventListener('wheel', function(e){
    e.preventDefault();
    markDirty(p);
    var z = clamp((p.zoom||1) * (1 - e.deltaY * 0.0012), 0.4, 2.2);
    p.zoom = z;
    $('ed-zoom').value = Math.round(z*100);
    $('ed-zoom-v').textContent = Math.round(z*100) + '%';
    drawEditor(p);
  }, { passive: false });

  $('editor-body').querySelectorAll('button[data-adj]').forEach(function(b){
    b.addEventListener('click', function(){
      markDirty(p);
      var a = b.getAttribute('data-adj');
      var step = (p.chinY - p.crownY) * 0.03 || 4;
      if (a === 'crown-up') p.crownY -= step;
      else if (a === 'crown-dn') p.crownY += step;
      else if (a === 'chin-up') p.chinY -= step;
      else if (a === 'chin-dn') p.chinY += step;
      else if (a === 'redetect'){ if (FACE_DETECTOR){ detectFace(p); } else { initFace(); alert('顔認識エンジンを読み込み中です。少し待ってからもう一度お試しください。'); } renderEditor(); return; }
      else if (a === 'reset'){ autoFrame(p); renderEditor(); return; }
      drawEditor(p);
    });
  });

  // 手入力
  ['ed-mdiv','ed-mteam','ed-mname'].forEach(function(id){
    $(id).addEventListener('input', function(){
      markDirty(p);
      p.mDiv = $('ed-mdiv').value.trim();
      p.mTeam = $('ed-mteam').value.trim();
      p.mName = $('ed-mname').value.trim();
    });
  });

  // 氏名検索
  var q = $('ed-q'), dd = $('ed-dd'), t = null;
  q.addEventListener('input', function(){
    var v = q.value.trim();
    if (t) clearTimeout(t);
    if (!v){ dd.style.display = 'none'; return; }
    t = setTimeout(function(){
      fetch('/api/kacho-mission/employees?q=' + encodeURIComponent(v))
        .then(function(r){ return r.json(); })
        .then(function(j){
          var list = j.employees || [];
          if (!list.length){ dd.innerHTML = '<div style="padding:8px 12px;color:#9ca3af;font-size:13px;">該当なし</div>'; dd.style.display = 'block'; return; }
          dd.innerHTML = list.map(function(e){
            return '<div class="ed-it" data-json="' + esc(JSON.stringify(e)) + '" style="padding:8px 12px;font-size:13px;cursor:pointer;border-bottom:1px solid #f3f4f6;">' +
              esc(fmtName(e.name)) + '<span style="font-size:11px;color:#6b7280;"> ' + esc(e.emp_no) + '　' + (e.division? e.division+'課':'-') + (e.team? ' '+e.team+'班':'') + '</span></div>';
          }).join('');
          dd.style.display = 'block';
          dd.querySelectorAll('.ed-it').forEach(function(it){
            it.addEventListener('click', function(){
              markDirty(p);
              p.person = JSON.parse(it.getAttribute('data-json'));
              p.mDiv = ''; p.mTeam = ''; p.mName = '';
              $('ed-mdiv').value = ''; $('ed-mteam').value = ''; $('ed-mname').value = '';
              q.value = fmtName(p.person.name);
              dd.style.display = 'none';
              paintPsel(p);
            });
          });
        })
        .catch(function(){ dd.style.display = 'none'; });
    }, 180);
  });
  document.addEventListener('click', function(ev){ if (!ev.target.closest('#ed-pwrap')) dd.style.display = 'none'; });
}
function paintPsel(p){
  var el = $('ed-psel'); if (!el) return;
  if (p.person){
    el.innerHTML = '選択中: <b>' + esc(fmtName(p.person.name)) + '</b> / ' + esc(p.person.emp_no) +
      ' <button id="ed-pclear" style="margin-left:8px;padding:2px 8px;font-size:11px;border:1px solid #d1d5db;border-radius:5px;background:#f9fafb;cursor:pointer;">解除</button>';
    $('ed-pclear').addEventListener('click', function(){ markDirty(p); p.person = null; $('ed-q').value = ''; paintPsel(p); });
  } else {
    el.textContent = '未選択（手入力欄が空なら裏面は空欄で印刷）';
  }
}
function drawEditor(p){
  var cv = $('ed-cv');
  var ctx = cv.getContext('2d');
  ctx.clearRect(0,0,cv.width,cv.height);
  drawCrop(ctx, p, 0, 0, cv.width, cv.height);
  // ガイド線（頭頂・あご）
  var boxH = p.boxH / (p.zoom || 1);
  var cy = p.cy + (p.offY || 0) * boxH / SET.outH;
  var topSrcY = cy - boxH/2;
  var cyf = Math.cos((p.rot||0)*Math.PI/180);
  var crownPx = (p.crownY - topSrcY) / boxH * cv.height;
  var chinPx  = (p.chinY  - topSrcY) / boxH * cv.height;
  function line(yy, col, label){
    if (yy < -20 || yy > cv.height + 20) return;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([6,4]);
    ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(cv.width, yy); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = col; ctx.font = '11px sans-serif';
    ctx.fillText(label, 4, clamp(yy - 3, 10, cv.height - 3));
    ctx.restore();
  }
  line(crownPx, '#2563eb', '頭頂');
  line(chinPx, '#dc2626', 'あご');
  // 顔サイズ表示
  var v = faceMMof(p);
  var fm = $('ed-fm');
  fm.textContent = '頭頂〜あご ' + v.toFixed(1) + 'mm' + (v < MIN_FACE_MM ? '（基準の3cm未満）' : ' OK');
  fm.style.color = v < MIN_FACE_MM ? '#b91c1c' : '#166534';
}

// ===== ページ（面付け）描画 =====
// A4は写真寸法から入る枚数を自動計算（gap 6mm・上下左右マージン最低8mm）。
function gridCounts(paper){
  var gx = 6, gy = 6, marginMin = 8;
  var cols = Math.max(1, Math.floor((paper.w - 2*marginMin + gx) / (SET.outW + gx)));
  var rows = Math.max(1, Math.floor((paper.h - 2*marginMin + gy) / (SET.outH + gy)));
  return { cols: cols, rows: rows, gx: gx, gy: gy };
}
function perPage(){
  if (SET.paper === 'a4'){ var g = gridCounts(PAPERS.a4); return g.cols * g.rows; }
  return SET.lslots === 2 ? 2 : 1;
}
function pageLayout(){
  var paper = PAPERS[SET.paper === 'a4' ? 'a4' : 'l'];
  var cells = [];
  if (SET.paper === 'a4'){
    var g = gridCounts(paper);
    var gridW = g.cols * SET.outW + (g.cols-1) * g.gx;
    var gridH = g.rows * SET.outH + (g.rows-1) * g.gy;
    var mx = (paper.w - gridW) / 2, my = (paper.h - gridH) / 2;
    for (var r=0;r<g.rows;r++) for (var c=0;c<g.cols;c++)
      cells.push({ x: mx + c*(SET.outW+g.gx), y: my + r*(SET.outH+g.gy), w: SET.outW, h: SET.outH });
  } else if (SET.lslots === 2){
    var gg = 6;
    var totW = SET.outW*2 + gg;
    var mxl = Math.max(1.5, (paper.w - totW) / 2), myl = Math.max(1.5, (paper.h - SET.outH) / 2);
    cells.push({ x: mxl, y: myl, w: SET.outW, h: SET.outH });
    cells.push({ x: mxl + SET.outW + gg, y: myl, w: SET.outW, h: SET.outH });
  } else {
    cells.push({ x: Math.max(1.5, (paper.w - SET.outW)/2), y: Math.max(1.5, (paper.h - SET.outH)/2), w: SET.outW, h: SET.outH });
  }
  return { paper: paper, cells: cells };
}
function mirrorCell(cell, paper){
  if (SET.binding === 'short') return { x: cell.x, y: paper.h - cell.y - cell.h, w: cell.w, h: cell.h };
  return { x: paper.w - cell.x - cell.w, y: cell.y, w: cell.w, h: cell.h };   // long（既定）: 左右反転
}
function newPageCanvas(paper){
  var cv = document.createElement('canvas');
  cv.width = Math.round(mm(paper.w));
  cv.height = Math.round(mm(paper.h));
  var ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,cv.width,cv.height);
  return { cv: cv, ctx: ctx };
}
function cropMarks(ctx, x, y, w, h){
  var o = mm(1.5), len = mm(3);
  ctx.save(); ctx.strokeStyle = '#4b5563'; ctx.lineWidth = Math.max(1, mm(0.18));
  var pts = [[x,y,-1,-1],[x+w,y,1,-1],[x,y+h,-1,1],[x+w,y+h,1,1]];
  pts.forEach(function(pt){
    ctx.beginPath();
    ctx.moveTo(pt[0] + pt[2]*o, pt[1]); ctx.lineTo(pt[0] + pt[2]*(o+len), pt[1]);
    ctx.moveTo(pt[0], pt[1] + pt[3]*o); ctx.lineTo(pt[0], pt[1] + pt[3]*(o+len));
    ctx.stroke();
  });
  ctx.restore();
}
function drawFrontPage(slice){
  var lay = pageLayout();
  var pg = newPageCanvas(lay.paper);
  slice.forEach(function(p, i){
    var c = lay.cells[i]; if (!c) return;
    var x = mm(c.x), y = mm(c.y), w = mm(c.w), h = mm(c.h);
    drawCrop(pg.ctx, p, x, y, w, h);
    pg.ctx.save(); pg.ctx.strokeStyle = '#e5e7eb'; pg.ctx.lineWidth = 1; pg.ctx.strokeRect(x, y, w, h); pg.ctx.restore();
    cropMarks(pg.ctx, x, y, w, h);
  });
  return pg.cv;
}
function drawBackPage(slice){
  var lay = pageLayout();
  var pg = newPageCanvas(lay.paper);
  slice.forEach(function(p, i){
    var c = lay.cells[i]; if (!c) return;
    var mcell = mirrorCell(c, lay.paper);
    var x = mm(mcell.x), y = mm(mcell.y), w = mm(mcell.w), h = mm(mcell.h);
    cropMarks(pg.ctx, x, y, w, h);
    var d = p.person ? (p.person.division || '') : (p.mDiv || '');
    var t = p.person ? (p.person.team || '') : (p.mTeam || '');
    var n = p.person ? fmtName(p.person.name) : (p.mName || '');
    var head = [];
    if (d) head.push(d + '課');
    if (t) head.push(t + '班');
    var ctx = pg.ctx;
    ctx.save();
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var cxp = x + w/2, cyp = y + h/2;
    if (head.length){
      ctx.font = '600 ' + Math.round(h*0.085) + 'px "Hiragino Sans","Yu Gothic",sans-serif';
      ctx.fillText(head.join('　'), cxp, cyp - h*0.16);
    }
    if (n){
      var fs = h * 0.15;
      ctx.font = '700 ' + Math.round(fs) + 'px "Hiragino Sans","Yu Gothic",sans-serif';
      while (ctx.measureText(n).width > w*0.9 && fs > 10){ fs -= 1; ctx.font = '700 ' + Math.round(fs) + 'px "Hiragino Sans","Yu Gothic",sans-serif'; }
      ctx.fillText(n, cxp, cyp + h*0.04);
    }
    ctx.restore();
  });
  return pg.cv;
}
function collectPages(){
  if (!PHOTOS.length){ alert('写真がありません。'); return null; }
  var per = perPage();
  var pages = [];
  for (var i=0;i<PHOTOS.length;i+=per){
    var slice = PHOTOS.slice(i, i+per);
    pages.push(drawFrontPage(slice));
    if (SET.includeBack) pages.push(drawBackPage(slice));
  }
  return { pages: pages, paper: PAPERS[SET.paper === 'a4' ? 'a4' : 'l'] };
}

// ===== PDF 出力 =====
function ensurePdfLib(){
  return loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js', 'PDFLib');
}
// pdf-lib 読み込み済み前提。pages(canvas[]) と paper({w,h}mm) から PDFバイト列を作る（保存/ダウンロード共用）
function buildPdfBytes(pages, paper){
  return PDFLib.PDFDocument.create().then(function(doc){
    var PT = 72 / 25.4;
    var wpt = paper.w * PT, hpt = paper.h * PT;
    var chain = Promise.resolve();
    pages.forEach(function(cv){
      chain = chain.then(function(){ return canvasToBlob(cv, 'image/jpeg', 0.92); })
        .then(blobBytes)
        .then(function(bytes){ return doc.embedJpg(bytes); })
        .then(function(img){
          var page = doc.addPage([wpt, hpt]);
          page.drawImage(img, { x: 0, y: 0, width: wpt, height: hpt });
        });
    });
    return chain.then(function(){ return doc.save(); });
  });
}
function exportPDF(){
  var r = collectPages(); if (!r) return;
  busy(true, 'PDFを作成中…');
  ensurePdfLib()
    .then(function(){ return buildPdfBytes(r.pages, r.paper); })
    .then(function(bytes){
      download(new Blob([bytes], { type: 'application/pdf' }), fileName('pdf'));
      busy(false);
    })
    .catch(function(err){ console.error(err); busy(false); alert('PDFの作成に失敗しました。'); });
}

// ===== PPTX 出力 =====
function exportPPTX(){
  var r = collectPages(); if (!r) return;
  busy(true, 'PowerPointを作成中…');
  loadScript('https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js', 'fflate')
    .then(function(){
      var EMU = 36000; // 1mm
      var cx = Math.round(r.paper.w * EMU), cy = Math.round(r.paper.h * EMU);
      var jobs = r.pages.map(function(cv){ return canvasToBlob(cv, 'image/jpeg', 0.9).then(blobBytes); });
      return Promise.all(jobs).then(function(images){ return { images: images, cx: cx, cy: cy }; });
    })
    .then(function(d){
      var files = buildPptx(d.images, d.cx, d.cy);
      var zipped = fflate.zipSync(files, { level: 6 });
      download(new Blob([zipped], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), fileName('pptx'));
      busy(false);
    })
    .catch(function(err){ console.error(err); busy(false); alert('PowerPointの作成に失敗しました。'); });
}
function enc(str){ return new TextEncoder().encode(str); }
function buildPptx(images, cx, cy){
  var n = images.length;
  var files = {};
  var slideList = '', slideRels = '', ctOverrides = '', presRels = '';

  files['[Content_Types].xml'] =
    enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
    (function(){ var s=''; for (var i=1;i<=n;i++) s += '<Override PartName="/ppt/slides/slide'+i+'.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'; return s; })() +
    '</Types>');

  files['_rels/.rels'] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
    '</Relationships>');

  var sldIdList = '';
  for (var i=1;i<=n;i++){
    sldIdList += '<p:sldId id="' + (255+i) + '" r:id="rId' + (i+1) + '"/>';
    presRels += '<Relationship Id="rId' + (i+1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + i + '.xml"/>';
  }
  var masterRid = 'rId' + (n+2);
  var themeRid = 'rId' + (n+3);
  presRels += '<Relationship Id="' + masterRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>';
  presRels += '<Relationship Id="' + themeRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>';

  files['ppt/presentation.xml'] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="' + masterRid + '"/></p:sldMasterIdLst>' +
    '<p:sldIdLst>' + sldIdList + '</p:sldIdLst>' +
    '<p:sldSz cx="' + cx + '" cy="' + cy + '"/>' +
    '<p:notesSz cx="6858000" cy="9144000"/>' +
    '</p:presentation>');

  files['ppt/_rels/presentation.xml.rels'] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + presRels + '</Relationships>');

  files['ppt/theme/theme1.xml'] = enc(THEME_XML);

  files['ppt/slideMasters/slideMaster1.xml'] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    '<p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' +
    '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>' +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    '</p:sldMaster>');
  files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>' +
    '</Relationships>');

  files['ppt/slideLayouts/slideLayout1.xml'] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">' +
    '<p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld>' +
    '<p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>' +
    '</p:sldLayout>');
  files['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
    '</Relationships>');

  for (var k=1;k<=n;k++){
    files['ppt/media/image' + k + '.jpeg'] = images[k-1];
    files['ppt/slides/slide' + k + '.xml'] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:spTree>' +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      '<p:pic><p:nvPicPr><p:cNvPr id="2" name="Picture ' + k + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
      '<p:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
      '<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>' +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>');
    files['ppt/slides/_rels/slide' + k + '.xml.rels'] = enc('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image' + k + '.jpeg"/>' +
      '</Relationships>');
  }
  return files;
}
var THEME_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">' +
  '<a:themeElements><a:clrScheme name="Office">' +
  '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
  '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' +
  '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>' +
  '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>' +
  '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>' +
  '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme>' +
  '<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
  '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
  '<a:fmtScheme name="Office"><a:fillStyleLst>' +
  '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>' +
  '<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="110000"/><a:satMod val="105000"/><a:tint val="67000"/></a:schemeClr></a:gs>' +
  '<a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="103000"/><a:tint val="73000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>' +
  '<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:shade val="98000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="90000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>' +
  '</a:fillStyleLst>' +
  '<a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
  '<a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>' +
  '<a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst>' +
  '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
  '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
  '</a:fmtScheme></a:themeElements></a:theme>';

// ===== 印刷 =====
// paperMM({w,h}) と 画像URL配列（data:URL でも通常URLでも可）から印刷用ウィンドウを開く
function openPrintWindow(urls, paperMM){
  var w = window.open('', '_blank');
  var css = '@page{size:' + paperMM.w + 'mm ' + paperMM.h + 'mm;margin:0}' +
    'html,body{margin:0;padding:0}img{display:block;width:' + paperMM.w + 'mm;height:' + paperMM.h + 'mm;page-break-after:always}';
  w.document.write('<html><head><meta charset="utf-8"><title>証明写真 印刷</title><style>' + css + '</style></head><body>' +
    urls.map(function(u){ return '<img src="' + u + '">'; }).join('') +
    '<script>window.onload=function(){setTimeout(function(){window.print();},300);}<' + '/script></body></html>');
  w.document.close();
}
function printPages(){
  var r = collectPages(); if (!r) return;
  Promise.all(r.pages.map(function(cv){ return cv.toDataURL('image/jpeg', 0.92); })).then(function(urls){
    openPrintWindow(urls, r.paper);
  });
}

// ===== 共通 =====
function fileName(ext){
  var d = new Date();
  function z(x){ return (x<10?'0':'') + x; }
  return '乗務員証写真_' + d.getFullYear() + z(d.getMonth()+1) + z(d.getDate()) + '_' + z(d.getHours()) + z(d.getMinutes()) + '.' + ext;
}
var _scripts = {};
function loadScript(src, globalName){
  if (globalName && window[globalName]) return Promise.resolve();
  if (_scripts[src]) return _scripts[src];
  _scripts[src] = new Promise(function(res, rej){
    var s = document.createElement('script');
    s.src = src; s.onload = function(){ res(); }; s.onerror = function(){ rej(new Error('load fail ' + src)); };
    document.head.appendChild(s);
  });
  return _scripts[src];
}
function busy(on, msg){
  var el = $('busy');
  el.style.display = on ? 'flex' : 'none';
  if (msg) $('busy-msg').textContent = msg;
}

// ===== 保存 / 呼び出し（サーバー保存・削除するまで残る／手動削除ボタンあり） =====
var API = '/api/kacho-mission/id-photos/batches';
function imgToJpegBlob(img, maxSide, q){
  var w = img.naturalWidth, h = img.naturalHeight;
  var sc = Math.min(1, maxSide / Math.max(w, h));
  var cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
  var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  cv.getContext('2d').drawImage(img, 0, 0, cw, ch);
  return new Promise(function(res){ cv.toBlob(function(b){ res({ blob: b, sc: sc }); }, 'image/jpeg', q || 0.9); });
}
function photoMeta(p, s){
  return {
    natW: Math.round(p.natW * s), natH: Math.round(p.natH * s),
    cx: p.cx * s, cy: p.cy * s, boxH: p.boxH * s,
    crownY: p.crownY * s, chinY: p.chinY * s, cxAuto: (p.cxAuto != null ? p.cxAuto : p.natW/2) * s,
    rot: p.rot || 0, offX: p.offX || 0, offY: p.offY || 0, zoom: p.zoom || 1,
    detected: !!p.detected,
    person: p.person || null, mDiv: p.mDiv || '', mTeam: p.mTeam || '', mName: p.mName || ''
  };
}
// id へ現在の作業一式を反映する（saveBatch/overwriteBatchの共通処理）。
// 画像は「調整済み(dirty)、または保存済みの位置から動いた」写真だけを再アップロードする。
// 印刷シート(表裏ページ画像＋PDF)は常に現在の内容で作り直す。
function persistToBatch(id, label){
  var metas = [];
  var chain = Promise.resolve();
  PHOTOS.forEach(function(p, i){
    var needUpload = !!p.dirty || p.serverIdx !== i;
    chain = chain.then(function(){
      if (!needUpload){ metas[i] = photoMeta(p, 1); return; }
      busy(true, '写真を保存中… (' + (i+1) + '/' + PHOTOS.length + ')');
      return imgToJpegBlob(p.img, 1600, 0.9).then(function(d){
        metas[i] = photoMeta(p, d.sc);
        return fetch(API + '/' + id + '/photo/' + i, { method:'PUT', headers:{'Content-Type':'image/jpeg'}, body: d.blob });
      }).then(function(r){ if (!r.ok) throw new Error('画像' + (i+1) + 'のアップロードに失敗'); });
    });
  });
  // 保存時点のA4/L印刷シート（表裏の各ページ画像＋PDF）は毎回作り直して同梱する
  var sheetPages = [], sheetPaper = null;
  chain = chain.then(function(){
    busy(true, '印刷シートを作成中…');
    var built = collectPages();
    if (!built) return;
    sheetPages = built.pages; sheetPaper = built.paper;
    return ensurePdfLib().then(function(){ return buildPdfBytes(sheetPages, sheetPaper); })
      .then(function(pdfBytes){
        var up = Promise.resolve();
        sheetPages.forEach(function(cv, si){
          up = up.then(function(){ busy(true, '印刷シートを保存中… (' + (si+1) + '/' + sheetPages.length + ')'); return canvasToBlob(cv, 'image/jpeg', 0.9); })
            .then(function(blob){ return fetch(API + '/' + id + '/sheet/' + si, { method:'PUT', headers:{'Content-Type':'image/jpeg'}, body: blob }); })
            .then(function(r){ if (!r.ok) throw new Error('印刷シート' + (si+1) + 'の保存に失敗'); });
        });
        return up.then(function(){
          return fetch(API + '/' + id + '/pdf', { method:'PUT', headers:{'Content-Type':'application/pdf'}, body: new Blob([pdfBytes], { type:'application/pdf' }) });
        }).then(function(r){ if (!r.ok) throw new Error('PDFの保存に失敗'); });
      });
  });
  return chain
    .then(function(){
      // 削除・入れ替えで不要になった旧インデックスのR2オブジェクトを掃除
      return fetch(API + '/' + id + '/trim', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ photo_count: PHOTOS.length, sheet_count: sheetPages.length }) });
    })
    .then(function(){
      return fetch(API + '/' + id + '/finalize', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ label: label, photo_count: PHOTOS.length, settings: SET, photos: metas,
          sheet_count: sheetPages.length, has_sheets: sheetPages.length > 0 }) });
    })
    .then(function(r){ return r.json(); })
    .then(function(){
      PHOTOS.forEach(function(p, i){ p.dirty = false; p.serverIdx = i; });
      CURRENT_BATCH_ID = id; CURRENT_BATCH_LABEL = label;
      updateBatchStatus();
    });
}
function saveBatch(){
  if (!PHOTOS.length){ alert('保存する写真がありません。'); return; }
  var label = ($('save-name').value || '').trim() || CURRENT_BATCH_LABEL || ('証明写真 ' + new Date().toLocaleString('ja-JP'));
  busy(true, '保存中…');
  fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ label: label }) })
    .then(function(r){ return r.json(); })
    .then(function(j){
      if (!j.id) throw new Error('バッチ作成に失敗');
      return persistToBatch(j.id, label);
    })
    .then(function(){ busy(false); alert('新しく保存しました（写真＋現在のA4/L印刷シート）。'); })
    .catch(function(e){ console.error(e); busy(false); alert('保存に失敗しました: ' + ((e && e.message) || e)); });
}
function overwriteBatch(){
  if (!CURRENT_BATCH_ID){ alert('まだ保存されていません。先に「新しく保存」してください。'); return; }
  if (!PHOTOS.length){ alert('写真がありません。'); return; }
  var label = ($('save-name').value || '').trim() || CURRENT_BATCH_LABEL;
  busy(true, '上書き保存中…');
  persistToBatch(CURRENT_BATCH_ID, label)
    .then(function(){ busy(false); alert('調整した部分だけ上書き保存しました。'); })
    .catch(function(e){ console.error(e); busy(false); alert('上書き保存に失敗しました: ' + ((e && e.message) || e)); });
}
function unbindBatch(){
  CURRENT_BATCH_ID = null; CURRENT_BATCH_LABEL = '';
  updateBatchStatus();
}
function updateBatchStatus(){
  var el = $('batch-status'); if (!el) return;
  var ov = $('btn-overwrite');
  if (CURRENT_BATCH_ID){
    el.innerHTML = '現在の保存先: <b>' + esc(CURRENT_BATCH_LABEL) + '</b> 　<a href="#" id="batch-unbind" style="color:#6b7280;">切り離す</a>';
    var unb = $('batch-unbind'); if (unb) unb.addEventListener('click', function(ev){ ev.preventDefault(); unbindBatch(); });
    if (ov) ov.disabled = false;
    if (!$('save-name').value) $('save-name').value = CURRENT_BATCH_LABEL;
  } else {
    el.textContent = '未保存（「新しく保存」してください）';
    if (ov) ov.disabled = true;
  }
}
function printFromBatch(id, b){
  busy(true, '印刷シートを開いています…');
  var paper = PAPERS[(b.settings_paper === 'l') ? 'l' : 'a4'];
  var urls = [];
  for (var i = 0; i < b.sheet_count; i++) urls.push(API + '/' + id + '/sheet/' + i);
  busy(false);
  openPrintWindow(urls, paper);
}
function openBatchList(){
  $('batch-modal').style.display = 'flex';
  var host = $('batch-list'); host.innerHTML = '<p style="color:#9ca3af;font-size:13px;">読み込み中…</p>';
  fetch(API).then(function(r){ return r.json(); }).then(function(j){
    var list = j.batches || [];
    if (!list.length){ host.innerHTML = '<p style="color:#9ca3af;font-size:13px;">保存されたデータはありません。</p>'; return; }
    host.innerHTML = list.map(function(b){
      var cre = String(b.created_at || '').replace('T',' ').slice(0,16);
      var sheetBtns = b.has_sheets
        ? ('<button data-pdf="' + esc(b.id) + '" style="padding:6px 10px;background:#fff;color:#b45309;border:1px solid #fcd34d;border-radius:6px;font-size:12px;cursor:pointer;">PDF</button>' +
           '<button data-print="' + esc(b.id) + '" data-sheets="' + esc(b.sheet_count) + '" style="padding:6px 10px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:6px;font-size:12px;cursor:pointer;">印刷</button>')
        : '';
      return '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;">' +
        '<div style="flex:1;min-width:140px;"><div style="font-size:13px;font-weight:700;color:#1e3a5f;">' + esc(b.label) + '</div>' +
        '<div style="font-size:11px;color:#6b7280;">' + esc(b.photo_count) + '枚 ・ 保存 ' + esc(cre) +
          (b.has_sheets ? ' ・ 印刷シート' + esc(b.sheet_count) + '面あり' : '') + '</div></div>' +
        '<button data-load="' + esc(b.id) + '" style="padding:6px 14px;background:#1e3a5f;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;">開く</button>' +
        sheetBtns +
        '<button data-del="' + esc(b.id) + '" style="padding:6px 10px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:6px;font-size:12px;cursor:pointer;">削除</button>' +
      '</div>';
    }).join('');
    host.querySelectorAll('button[data-load]').forEach(function(bt){ bt.addEventListener('click', function(){ loadBatch(bt.getAttribute('data-load')); }); });
    host.querySelectorAll('button[data-pdf]').forEach(function(bt){ bt.addEventListener('click', function(){ window.open(API + '/' + bt.getAttribute('data-pdf') + '/pdf', '_blank'); }); });
    host.querySelectorAll('button[data-print]').forEach(function(bt){ bt.addEventListener('click', function(){
      var id = bt.getAttribute('data-print');
      fetch(API + '/' + id).then(function(r){ return r.json(); }).then(function(j){
        var s = j.settings || {};
        printFromBatch(id, { settings_paper: s.paper, sheet_count: parseInt(bt.getAttribute('data-sheets'),10) || 0 });
      });
    }); });
    host.querySelectorAll('button[data-del]').forEach(function(bt){ bt.addEventListener('click', function(){
      if (!confirm('このデータを削除します。よろしいですか？')) return;
      fetch(API + '/' + bt.getAttribute('data-del'), { method:'DELETE' }).then(function(){ openBatchList(); });
    }); });
  }).catch(function(){ host.innerHTML = '<p style="color:#b91c1c;font-size:13px;">読み込みに失敗しました。</p>'; });
}
function loadBatch(id){
  busy(true, '呼び出し中…');
  fetch(API + '/' + id).then(function(r){ return r.json(); }).then(function(j){
    if (j.error) throw new Error(j.error);
    var s = j.settings || {};
    SET.paper = s.paper || 'a4';
    SET.lslots = s.lslots || 1;
    SET.binding = s.binding || 'long';
    SET.includeBack = s.includeBack !== false;
    SET.outW = s.outW || DEF_OUT_W;
    SET.outH = s.outH || DEF_OUT_H;
    SET.faceMM = s.faceMM || DEF_FACE_MM;
    SET.topMM = s.topMM || DEF_TOP_MM;
    var metas = j.photos || [];
    var loaded = [];
    var chain = Promise.resolve();
    metas.forEach(function(m, i){
      chain = chain.then(function(){ return fetch(API + '/' + id + '/photo/' + i); })
        .then(function(r){ return r.blob(); })
        .then(function(blob){ return new Promise(function(res, rej){
          var img = new Image();
          img.onload = function(){
            loaded[i] = {
              id: (++SEQ), img: img, natW: img.naturalWidth, natH: img.naturalHeight,
              cx: m.cx, cy: m.cy, boxH: m.boxH, rot: m.rot || 0,
              crownY: m.crownY, chinY: m.chinY, cxAuto: (m.cxAuto != null ? m.cxAuto : img.naturalWidth/2),
              offX: m.offX || 0, offY: m.offY || 0, zoom: m.zoom || 1,
              detected: !!m.detected, person: m.person || null,
              mDiv: m.mDiv || '', mTeam: m.mTeam || '', mName: m.mName || '',
              dirty: false, serverIdx: i   // サーバー上の画像とまだ一致している＝上書き保存で再アップロード不要
            };
            res();
          };
          img.onerror = function(){ rej(new Error('画像' + (i+1) + 'の読み込みに失敗')); };
          img.src = URL.createObjectURL(blob);
        }); });
    });
    return chain.then(function(){ return { loaded: loaded, label: j.label || '' }; });
  }).then(function(r){
    PHOTOS = r.loaded;
    CURRENT_BATCH_ID = id;
    CURRENT_BATCH_LABEL = r.label;
    $('save-name').value = r.label;
    syncSettingInputs();
    updateBatchStatus();
    renderList();
    $('batch-modal').style.display = 'none';
    busy(false);
    if (!FACE_DETECTOR) initFace();
  }).catch(function(e){ console.error(e); busy(false); alert('呼び出しに失敗しました: ' + ((e && e.message) || e)); });
}
function syncSettingInputs(){
  $('opt-paper').value = SET.paper;
  $('l-opts').style.display = SET.paper === 'l' ? 'block' : 'none';
  $('opt-lslots').value = String(SET.lslots);
  $('opt-binding').value = SET.binding;
  $('opt-back').checked = SET.includeBack;
  $('opt-outw').value = SET.outW; $('opt-outh').value = SET.outH;
  $('opt-facemm').value = SET.faceMM; $('opt-facemm-v').textContent = SET.faceMM + 'mm';
  $('opt-topmm').value = SET.topMM; $('opt-topmm-v').textContent = SET.topMM + 'mm';
}
// 出力設定（サイズ/顔mm/余白mm）を変えると自動フレームが変わる写真をまとめてdirty化
function reframeAll(){
  PHOTOS.forEach(function(p){ if (p.detected){ autoFrame(p); markDirty(p); } });
}
function applySize(){
  var w = clamp(parseFloat($('opt-outw').value) || DEF_OUT_W, 15, 120);
  var h = clamp(parseFloat($('opt-outh').value) || DEF_OUT_H, 15, 160);
  SET.outW = w; SET.outH = h;
  reframeAll();
  renderList();
}

// ===== 初期化 =====
function boot(){
  window.__BLAZEFACE_B64 = document.getElementById('blazeface-data').textContent.trim();

  $('btn-camera').addEventListener('click', openCamera);
  $('cam-shoot').addEventListener('click', shootCamera);
  $('cam-cancel').addEventListener('click', closeCamera);
  $('file-input').addEventListener('change', function(){ handleFiles(this.files); this.value = ''; });
  $('btn-file').addEventListener('click', function(){ $('file-input').click(); });

  $('opt-paper').addEventListener('change', function(){ SET.paper = this.value; $('l-opts').style.display = this.value === 'l' ? 'block' : 'none'; renderList(); });
  $('opt-lslots').addEventListener('change', function(){ SET.lslots = parseInt(this.value, 10); renderList(); });
  $('opt-binding').addEventListener('change', function(){ SET.binding = this.value; });
  $('opt-back').addEventListener('change', function(){ SET.includeBack = this.checked; renderList(); });
  $('opt-outw').addEventListener('change', applySize);
  $('opt-outh').addEventListener('change', applySize);
  $('opt-size-reset').addEventListener('click', function(){ $('opt-outw').value = DEF_OUT_W; $('opt-outh').value = DEF_OUT_H; applySize(); });
  $('opt-facemm').addEventListener('input', function(){ SET.faceMM = parseFloat(this.value); $('opt-facemm-v').textContent = this.value + 'mm'; reframeAll(); renderList(); });
  $('opt-topmm').addEventListener('input', function(){ SET.topMM = parseFloat(this.value); $('opt-topmm-v').textContent = this.value + 'mm'; reframeAll(); renderList(); });

  $('btn-pdf').addEventListener('click', exportPDF);
  $('btn-pptx').addEventListener('click', exportPPTX);
  $('btn-print').addEventListener('click', printPages);
  $('btn-save').addEventListener('click', saveBatch);
  $('btn-overwrite').addEventListener('click', overwriteBatch);
  $('btn-open').addEventListener('click', openBatchList);
  $('batch-close').addEventListener('click', function(){ $('batch-modal').style.display = 'none'; });
  $('editor-close').addEventListener('click', closeEditor);
  $('editor-done').addEventListener('click', function(){ closeEditor(); renderList(); });

  syncSettingInputs();
  updateBatchStatus();
  renderList();
  initFace();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
`;

export function idPhotosPage(): string {
  const b64 = BLAZEFACE_TFLITE_B64;
  return `
  <div class="no-print" style="max-width:960px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
      <a href="../kacho-mission" style="color:#6b7280;font-size:13px;text-decoration:none;padding:6px 12px;border:1px solid #d1d5db;border-radius:6px;background:#fff;">← 課長ミッション</a>
      <h2 style="font-size:17px;font-weight:700;color:#1e3a5f;">乗務員証 証明写真</h2>
      <span id="face-status" style="font-size:12px;color:#6b7280;"></span>
    </div>

    <p style="font-size:12px;color:#6b7280;line-height:1.9;margin:0 0 14px;">
      既定は縦6cm×横4cm・頭頂〜あご3cm以上（東京タクシーセンター基準）。写真サイズは出力設定で自由に変更できます。顔の位置と大きさは自動検出し、各写真の「調整」で微修正できます。<br>
「新しく保存」で写真と現在のA4/L印刷シート（PDF）をサーバーに保存できます。呼び出した保存を調整したときは「調整した部分だけ上書き保存」で、変更した写真だけ差し替えられます。<b>自動削除はしません</b>。不要になったら一覧の「削除」で手動で消してください。両面コピーすると写真の真裏に 課／班／氏名 が刷られます（未設定は空欄）。
    </p>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;">
      <button id="btn-camera" style="padding:10px 20px;background:#1e3a5f;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">カメラで撮影</button>
      <button id="btn-file" style="padding:10px 20px;background:#fff;color:#1e3a5f;border:1px solid #1e3a5f;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">ファイルを追加</button>
      <input id="file-input" type="file" accept="image/*" multiple style="display:none;">
    </div>

    <div id="cam-box" style="display:none;margin-bottom:16px;background:#111827;border-radius:10px;padding:12px;text-align:center;">
      <video id="cam-video" playsinline style="max-width:100%;max-height:60vh;border-radius:6px;background:#000;"></video>
      <div style="margin-top:10px;display:flex;gap:10px;justify-content:center;">
        <button id="cam-shoot" style="padding:9px 22px;background:#16a34a;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">撮影</button>
        <button id="cam-cancel" style="padding:9px 18px;background:#374151;color:#fff;border:none;border-radius:7px;font-size:13px;cursor:pointer;">閉じる</button>
      </div>
    </div>

    <div style="display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;">
      <div style="flex:1;min-width:320px;display:flex;flex-direction:column;gap:10px;" id="list"></div>

      <div style="flex:none;width:280px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
        <h3 style="font-size:13px;font-weight:700;color:#1e3a5f;margin:0 0 12px;">出力設定</h3>

        <label style="display:block;font-size:12px;color:#374151;margin-bottom:4px;">写真サイズ（幅×高さ mm）</label>
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
          <input id="opt-outw" type="number" min="15" max="120" step="1" style="width:56px;border:1px solid #d1d5db;border-radius:6px;padding:6px 7px;font-size:13px;">
          <span style="color:#9ca3af;">×</span>
          <input id="opt-outh" type="number" min="15" max="160" step="1" style="width:56px;border:1px solid #d1d5db;border-radius:6px;padding:6px 7px;font-size:13px;">
          <span style="font-size:12px;color:#6b7280;">mm</span>
          <button id="opt-size-reset" style="margin-left:auto;padding:5px 8px;font-size:11px;border:1px solid #d1d5db;border-radius:6px;background:#f9fafb;cursor:pointer;">6×4cm</button>
        </div>

        <label style="display:block;font-size:12px;color:#374151;margin-bottom:4px;">用紙</label>
        <select id="opt-paper" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:13px;margin-bottom:12px;">
          <option value="a4">A4タテ（面付けは自動）</option>
          <option value="l">Lサイズ（89×127mm）</option>
        </select>

        <div id="l-opts" style="display:none;margin-bottom:12px;">
          <label style="display:block;font-size:12px;color:#374151;margin-bottom:4px;">Lサイズの面付け</label>
          <select id="opt-lslots" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:13px;">
            <option value="1">1枚に1面</option>
            <option value="2">1枚に2面</option>
          </select>
        </div>

        <label style="display:block;font-size:12px;color:#374151;margin-bottom:4px;">両面の綴じ方向</label>
        <select id="opt-binding" style="width:100%;border:1px solid #d1d5db;border-radius:6px;padding:7px 8px;font-size:13px;margin-bottom:12px;">
          <option value="long">長辺綴じ（裏面を左右反転）</option>
          <option value="short">短辺綴じ（裏面を上下反転）</option>
        </select>

        <label style="display:flex;gap:6px;align-items:center;font-size:12px;color:#374151;margin-bottom:14px;">
          <input id="opt-back" type="checkbox" checked> 裏面ページを含める（両面印刷用）
        </label>

        <div style="font-size:12px;color:#374151;display:flex;justify-content:space-between;">頭頂〜あご<span id="opt-facemm-v">${40}mm</span></div>
        <input id="opt-facemm" type="range" min="20" max="90" value="40" style="width:100%;margin-bottom:10px;">

        <div style="font-size:12px;color:#374151;display:flex;justify-content:space-between;">頭の上の余白<span id="opt-topmm-v">${7}mm</span></div>
        <input id="opt-topmm" type="range" min="1" max="30" value="7" style="width:100%;margin-bottom:14px;">

        <div style="font-size:12px;color:#6b7280;margin-bottom:12px;">現在: <span id="count"></span></div>

        <button id="btn-pdf" style="width:100%;padding:10px;background:#166534;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;margin-bottom:8px;">PDFで出力</button>
        <button id="btn-pptx" style="width:100%;padding:10px;background:#b45309;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;margin-bottom:8px;">PowerPointで出力</button>
        <button id="btn-print" style="width:100%;padding:9px;background:#fff;color:#374151;border:1px solid #d1d5db;border-radius:7px;font-size:13px;cursor:pointer;margin-bottom:16px;">印刷（ブラウザ）</button>

        <h3 style="font-size:13px;font-weight:700;color:#1e3a5f;margin:0 0 4px;">保存（手動削除まで保持）</h3>
        <div id="batch-status" style="font-size:11px;color:#9ca3af;margin-bottom:8px;">未保存（「新しく保存」してください）</div>
        <input id="save-name" type="text" placeholder="保存名（例: 2026年4月入社分）" style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:7px 9px;font-size:13px;margin-bottom:8px;">
        <button id="btn-overwrite" disabled style="width:100%;padding:9px;background:#166534;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;margin-bottom:8px;opacity:1;">調整した部分だけ上書き保存</button>
        <button id="btn-save" style="width:100%;padding:9px;background:#1e3a5f;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;margin-bottom:8px;">新しく保存</button>
        <button id="btn-open" style="width:100%;padding:9px;background:#fff;color:#1e3a5f;border:1px solid #1e3a5f;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">保存済みを開く</button>
        <style>#btn-overwrite:disabled{opacity:.45;cursor:not-allowed;}</style>
      </div>
    </div>
  </div>

  <div id="batch-modal" style="display:none;position:fixed;inset:0;z-index:60;background:rgba(15,23,42,.55);align-items:center;justify-content:center;padding:20px;">
    <div style="background:#fff;border-radius:12px;max-width:560px;width:100%;max-height:88vh;overflow:auto;padding:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;margin:0;">保存済みの作業</h3>
        <button id="batch-close" style="border:none;background:#f3f4f6;border-radius:6px;width:30px;height:30px;font-size:16px;cursor:pointer;">×</button>
      </div>
      <p style="font-size:11px;color:#9ca3af;margin:0 0 12px;">自動削除はしません。「開く」は現在の作業を置き換え、以後この保存に「上書き保存」できるようになります。「PDF」「印刷」は保存時点の印刷シートをそのまま使います。</p>
      <div id="batch-list"></div>
    </div>
  </div>

  <div id="editor" style="display:none;position:fixed;inset:0;z-index:60;background:rgba(15,23,42,.55);align-items:center;justify-content:center;padding:20px;">
    <div style="background:#fff;border-radius:12px;max-width:760px;width:100%;max-height:92vh;overflow:auto;padding:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <h3 style="font-size:15px;font-weight:700;color:#1e3a5f;margin:0;">写真の調整</h3>
        <button id="editor-close" style="border:none;background:#f3f4f6;border-radius:6px;width:30px;height:30px;font-size:16px;cursor:pointer;">×</button>
      </div>
      <div id="editor-body"></div>
      <div style="text-align:right;margin-top:16px;">
        <button id="editor-done" style="padding:9px 24px;background:#1e3a5f;color:#fff;border:none;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">完了</button>
      </div>
    </div>
  </div>

  <div id="busy" style="display:none;position:fixed;inset:0;z-index:70;background:rgba(255,255,255,.7);align-items:center;justify-content:center;">
    <div style="background:#1e3a5f;color:#fff;padding:14px 26px;border-radius:10px;font-size:13px;font-weight:700;" id="busy-msg">処理中…</div>
  </div>

  <script type="application/octet-stream" id="blazeface-data">${b64}</script>
  <script type="module">${CLIENT_JS}</script>
  `;
}
