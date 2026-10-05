// ITABASHI BATTLE 2 — 管理者画面（ホシコンのアカウントでログイン）
//   タブ: 進行 / メニュー / チーム / 素材 / 車椅子タイム / 得点履歴
//   進行はWebSocket（BattleRoom）へ直接操作を送り、設定の保存はREST API（/ib2/api/*）。保存後は reload を送って即反映。
import { battleHead, BATTLE_BASE_CSS, BATTLE_NET_JS } from './theme';
import { BATTLE_AUDIO_JS, SFX_CATALOG } from './audio';
import { STEP_KINDS } from './types';

export function battleAdminPage(opts: { adminPath: string; apiBase: string; wsPath: string; screenUrl: string; joinUrl: string; qrSvg: string; editable: boolean; hoshikonUrl: string }): string {
  return `<!DOCTYPE html><html lang="ja"><head>${battleHead('ITABASHI BATTLE 2 ｜ 管理者')}
<style>${BATTLE_BASE_CSS}
html,body{overflow:auto;}
body{font-weight:700;}
.bar{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:12px;padding:10px 18px;background:rgba(7,6,15,.9);backdrop-filter:blur(8px);border-bottom:1px solid var(--line);flex-wrap:wrap;}
.logo{font-family:var(--num);font-weight:900;font-size:15px;letter-spacing:.14em;--glow:var(--pink);} .logo b{color:var(--pink);}
.tabs{display:flex;gap:4px;flex-wrap:wrap;}
.tabs button{border:1px solid var(--line);background:transparent;color:var(--mute);border-radius:999px;padding:8px 14px;font:800 13px/1 var(--jp);cursor:pointer;}
.tabs button.on{background:var(--ink);color:#07060f;border-color:var(--ink);}
.sp{flex:1;}
.net{width:10px;height:10px;border-radius:50%;background:#555;} .net.ok{background:var(--green);box-shadow:0 0 10px var(--green);} .net.ng{background:var(--pink);}
a.lk{color:var(--cyan);font-size:12px;text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:7px 12px;}
.page{padding:18px;max-width:1500px;margin:0 auto;}
.grid3{display:grid;grid-template-columns:260px 1fr 340px;gap:16px;align-items:start;}
@media (max-width:1200px){ .grid3{grid-template-columns:1fr;} }
.pn{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:14px;}
.pn h3{font-size:12px;letter-spacing:.14em;color:var(--mute);margin-bottom:10px;font-family:var(--num);}
.flow{display:flex;flex-direction:column;gap:4px;max-height:76vh;overflow:auto;}
.flow button{display:flex;gap:8px;align-items:center;text-align:left;border:1px solid transparent;background:rgba(255,255,255,.03);color:var(--ink);border-radius:10px;padding:9px 10px;font:700 13px/1.35 var(--jp);cursor:pointer;}
.flow button .k{font-family:var(--num);font-size:10px;color:var(--mute);min-width:22px;}
.flow button .kd{margin-left:auto;font-size:10px;color:var(--mute);white-space:nowrap;}
.flow button.cur{border-color:var(--cyan);background:rgba(47,211,255,.12);box-shadow:0 0 16px rgba(47,211,255,.25);}
.big{display:flex;gap:10px;margin-bottom:14px;}
.b{border:0;border-radius:12px;padding:12px 16px;font:900 14px/1 var(--jp);cursor:pointer;color:#07060f;background:var(--ink);}
.b:disabled{opacity:.35;cursor:default;}
.b.go{background:linear-gradient(135deg,var(--cyan),var(--violet));color:#fff;font-size:17px;padding:16px 22px;}
.b.ok{background:var(--green);} .b.ng{background:var(--pink);color:#fff;} .b.y{background:var(--yellow);} .b.c{background:var(--cyan);}
.b.gh{background:transparent;color:var(--ink);border:1px solid var(--line);}
.b.sm{padding:8px 11px;font-size:12px;border-radius:9px;}
.acts{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;}
.now h2{font-family:var(--disp);font-weight:900;font-size:26px;line-height:1.3;}
.now .meta{color:var(--mute);font-size:12px;margin-top:4px;}
.qbox{margin-top:12px;padding:12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--line);font-size:14px;line-height:1.6;}
.qbox .ans{color:var(--green);}
.tb{width:100%;border-collapse:collapse;font-size:13px;}
.tb td,.tb th{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle;}
.tb th{color:var(--mute);font-size:11px;letter-spacing:.08em;}
.tm{display:flex;align-items:center;gap:8px;padding:10px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid color-mix(in srgb,var(--tc) 50%,transparent);margin-bottom:8px;flex-wrap:wrap;}
.tm .l{font-family:var(--num);font-weight:900;font-size:22px;color:var(--tc);width:24px;}
.tm .n{flex:1;min-width:90px;font-size:13px;}
.tm .s{font-family:var(--num);font-weight:900;font-size:22px;min-width:52px;text-align:right;}
.tm .bs{display:flex;gap:4px;width:100%;}
.tm .bs button{flex:1;border:1px solid var(--line);background:rgba(255,255,255,.06);color:var(--ink);border-radius:8px;padding:7px 0;font:800 12px/1 var(--num);cursor:pointer;}
input.f,select.f,textarea.f{width:100%;background:rgba(255,255,255,.07);border:1px solid var(--line);border-radius:9px;color:var(--ink);padding:8px 10px;font:700 13px/1.4 var(--jp);outline:none;}
textarea.f{min-height:64px;resize:vertical;}
select.f option{color:#111;}
label.lb{display:block;font-size:11px;color:var(--mute);margin:8px 0 3px;}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.row4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
.hint{font-size:12px;color:var(--mute);line-height:1.7;}
.steps{display:flex;flex-direction:column;gap:6px;}
.stp{display:flex;align-items:center;gap:8px;padding:10px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--line);cursor:pointer;}
.stp.sel{border-color:var(--cyan);background:rgba(47,211,255,.1);}
.stp .k{font-family:var(--num);font-size:11px;color:var(--mute);width:22px;}
.stp .t{flex:1;font-size:14px;}
.stp .kd{font-size:11px;color:var(--mute);}
.stp button{border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:8px;width:30px;height:30px;cursor:pointer;}
.qcard{padding:12px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid var(--line);margin-bottom:10px;}
.qcard .hd{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.qcard .hd b{font-family:var(--num);color:var(--yellow);}
.media{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;}
.media .m{background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:12px;padding:8px;font-size:12px;}
.media .m img{width:100%;height:110px;object-fit:cover;border-radius:8px;display:block;}
.media .m audio{width:100%;margin-top:6px;}
.drop{border:2px dashed var(--line);border-radius:14px;padding:22px;text-align:center;color:var(--mute);cursor:pointer;}
.msg{position:fixed;right:18px;bottom:18px;z-index:30;background:var(--ink);color:#07060f;border-radius:12px;padding:12px 16px;font-size:13px;font-weight:900;opacity:0;transition:opacity .3s;}
.msg.on{opacity:1;}
.qr{background:#fff;border-radius:10px;padding:8px;width:140px;}
.qr svg{display:block;width:100%;height:auto;}
.pill{display:inline-block;padding:3px 8px;border-radius:999px;font-size:11px;background:rgba(255,255,255,.08);margin:2px;}
.pill.on{background:rgba(124,255,107,.18);color:var(--green);}
.ro{background:rgba(255,210,63,.12);border:1px solid rgba(255,210,63,.4);color:var(--yellow);border-radius:10px;padding:10px 12px;font-size:12px;margin-bottom:12px;}
</style></head><body>
<div class="bar">
  <span class="net" id="net"></span><span class="logo neon">ITABASHI <b>BATTLE 2</b></span>
  <div class="tabs" id="tabs">
    <button data-tab="ctl" class="on">進行</button><button data-tab="menu">メニュー</button><button data-tab="team">チーム</button>
    <button data-tab="media">素材（画像・曲）</button><button data-tab="ta">車椅子タイム</button><button data-tab="log">得点履歴</button>
  </div>
  <span class="sp"></span>
  <a class="lk" href="${opts.screenUrl}" target="_blank" rel="noopener">プロジェクター画面を開く</a>
  <a class="lk" href="${opts.hoshikonUrl}">ホシコンへ戻る</a>
</div>
<div class="page" id="page"></div>
<div class="msg" id="msg"></div>
<script>${BATTLE_AUDIO_JS}</script>
<script>${BATTLE_NET_JS}</script>
<script>
(function(){
  var API = ${JSON.stringify(opts.apiBase)}, WS = ${JSON.stringify(opts.wsPath)}, JOIN = ${JSON.stringify(opts.joinUrl)}, QR = ${JSON.stringify(opts.qrSvg)};
  var EDIT = ${opts.editable ? 'true' : 'false'};
  var KINDS = ${JSON.stringify(STEP_KINDS)};
  var SFX_CAT = ${JSON.stringify(SFX_CATALOG)};
  var sfxLocal = false;
  var page = document.getElementById('page');
  var tab = 'ctl', S = null, D = null, selStep = null, cand = null;
  // ホシコンのサイドバー（板橋バトル2）から ?tab=menu などで直接開けるようにする
  (function(){ var t = new URLSearchParams(location.search).get('tab'); if (t && ['ctl', 'menu', 'team', 'media', 'ta', 'log'].indexOf(t) >= 0) { tab = t; Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function(x){ x.classList.toggle('on', x.getAttribute('data-tab') === t); }); } })();
  function msg(t){ var m = document.getElementById('msg'); m.textContent = t; m.classList.add('on'); clearTimeout(msg.t); msg.t = setTimeout(function(){ m.classList.remove('on'); }, 1800); }
  function api(method, path, body, raw){
    var o = { method: method, headers: {} };
    if (raw) { o.body = raw.body; o.headers['Content-Type'] = raw.type; o.headers['X-Name'] = encodeURIComponent(raw.name || ''); }
    else if (body !== undefined) { o.body = JSON.stringify(body); o.headers['Content-Type'] = 'application/json'; }
    return fetch(API + path, o).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ if (!r.ok) throw new Error(j.error || ('エラー ' + r.status)); return j; }); });
  }
  function err(e){ alert(e && e.message ? e.message : String(e)); }
  function send(o){ if (!IB2N.send(o)) msg('接続待ちです。もう一度押してください'); }
  function act(a, extra){ var o = { t: 'act', a: a }; for (var k in (extra || {})) o[k] = extra[k]; send(o); }
  function reload(){ send({ t: 'reload' }); }
  function kindL(k){ var x = KINDS.filter(function(v){ return v.v === k; })[0]; return x ? x.l : k; }
  function teamName(t){ var x = S && S.teams.filter(function(v){ return v.team === t; })[0]; return x && x.name ? x.name : 'チーム' + t; }
  function load(){ return api('GET', '/game').then(function(j){ D = j; draw(); }).catch(err); }

  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function(b){ b.onclick = function(){ tab = b.getAttribute('data-tab'); Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function(x){ x.classList.toggle('on', x === b); }); draw(); }; });
  var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
  IB2N.connect(proto + location.host + WS, function(s){ S = s; if (tab === 'ctl') drawCtl(); }, function(m){ if (m.t === 'score' && tab === 'log') load(); });

  function draw(){
    if (!D) { page.innerHTML = '<div class="hint">読み込み中…</div>'; return; }
    if (tab === 'ctl') drawCtl(); else if (tab === 'menu') drawMenu(); else if (tab === 'team') drawTeam(); else if (tab === 'media') drawMedia(); else if (tab === 'ta') drawTA(); else drawLog();
  }

  // ================= 進行 =================
  var ctlKeep = {};
  function drawCtl(){
    if (tab !== 'ctl' || !D) return;
    if (!S) { page.innerHTML = '<div class="hint blink">接続中…</div>'; return; }
    ['reason', 'cst', 'tmin'].forEach(function(id){ var el = document.getElementById(id); if (el) ctlKeep[id] = el.value; });
    var flow = [{ i: -3, t: '参加受付（ロビー）', k: 'START' }, { i: -2, t: 'チーム発表', k: '' }, { i: -1, t: '代表者・チーム名決め', k: '' }]
      .concat((S.steps || []).map(function(x, i){ return { i: i, t: x.title, k: kindL(x.kind) }; }));
    var curI = S.stage === 'lobby' ? -3 : S.stage === 'reveal' ? -2 : S.stage === 'setup' ? -1 : S.stepIdx;
    var left = '<div class="pn"><h3>FLOW</h3><div class="flow">' + flow.map(function(f, n){ return '<button data-goto="' + f.i + '" class="' + (f.i === curI ? 'cur' : '') + '"><span class="k">' + (f.i < 0 ? '◆' : (f.i + 1)) + '</span><span>' + escH(f.t) + '</span><span class="kd">' + escH(f.k) + '</span></button>'; }).join('') + '</div></div>';
    var center = '<div class="pn"><div class="big"><button class="b gh" id="prev">◀ 戻る</button><button class="b go" id="next" style="flex:1">次へ進む ▶</button></div>' + nowPanel() + '</div>';
    var right = scorePanel() + bgmPanel() + '<div class="pn" style="margin-top:12px"><h3>JOIN</h3><div style="display:flex;gap:12px;align-items:center"><div class="qr">' + QR + '</div><div class="hint" style="word-break:break-all">参加用URL<br><span style="color:var(--ink)">' + escH(JOIN) + '</span><br><br>参戦 ' + S.joined + ' 人／接続中 ' + S.online + ' 人</div></div>'
      + '<div class="acts"><button class="b sm gh" id="resetSoft">得点・チーム名をリセット</button><button class="b sm ng" id="resetAll">参加者も含め全部リセット</button></div></div>';
    page.innerHTML = '<div class="grid3">' + left + center + '<div>' + right + '</div></div>';
    Object.keys(ctlKeep).forEach(function(id){ var el = document.getElementById(id); if (el && ctlKeep[id]) el.value = ctlKeep[id]; });
    bindCtl();
  }
  function nowPanel(){
    var h = '';
    if (S.stage === 'lobby') {
      var names = []; S.teams.forEach(function(t){ t.members.forEach(function(m){ names.push('<span class="pill ' + (m.online ? 'on' : '') + '">' + escH(m.name) + '</span>'); }); });
      return '<div class="now"><h2>参加受付中</h2><div class="meta">プロジェクターにQRコードが出ています。全員そろったら「次へ」でチーム発表。</div></div><div class="qbox">参戦 ' + S.joined + ' 人<br>' + (names.join('') || '<span class="hint">まだいません</span>') + '</div>';
    }
    if (S.stage === 'reveal') return '<div class="now"><h2>チーム発表</h2><div class="meta">メンバーで集まってもらったら「次へ」で代表者・チーム名決め。</div></div>' + teamsTable(false);
    if (S.stage === 'setup') return '<div class="now"><h2>代表者・チーム名決め</h2><div class="meta">各チームのスマホで決めます。ここから直接直すこともできます。全チームそろったら「次へ」でメニュー開始。</div></div>' + teamsTable(true);
    var st = S.step; if (!st) return '<div class="hint">メニューがありません。「メニュー」タブで作成してください。</div>';
    var q = S.q, ph = S.phase;
    h = '<div class="now"><div class="meta">ROUND ' + (S.stepIdx + 1) + ' / ' + S.stepCount + '　' + escH(kindL(st.kind)) + (st.mode === 'leader' ? '（代表者のみ回答）' : '') + '</div><h2>' + escH(st.title) + '</h2>'
      + (q ? '<div class="meta">第' + q.no + '問 / 全' + S.qCount + '問　状態：' + phaseL(ph) + '</div>' : '') + '</div>';
    var a = [];
    if (st.kind === 'title') a.push('<input class="f" id="tmin" type="number" min="1" style="width:90px" placeholder="分" value="' + (st.timer || '') + '">', '<button class="b y" data-act="timer">' + (S.timerEnd ? 'タイマー停止' : 'タイマー開始') + '</button>');
    if (['buzzer', 'choice', 'number', 'order', 'vote'].indexOf(st.kind) >= 0 && q) {
      if (ph === 'intro') a.push('<button class="b c" data-act="show">問題画面へ</button>');
      if (ph === 'ready') a.push('<button class="b go" data-act="open">' + (st.kind === 'buzzer' ? '画像を出して早押しスタート' : '回答スタート') + '</button>');
      if (st.kind === 'buzzer') {
        if (ph === 'judge') a.push('<button class="b ok" data-act="ok">○ 正解</button>', '<button class="b ng" data-act="ng">× 不正解</button>');
        if (ph === 'open' || ph === 'judge') a.push('<button class="b gh" data-act="reveal">正解を見せる（加点なし）</button>');
      } else {
        if (ph === 'open') a.push('<button class="b y" data-act="close">締め切る</button>');
        if (ph === 'open' || ph === 'closed') a.push('<button class="b ok" data-act="reveal">' + (st.kind === 'vote' ? '結果発表' : '正解発表（自動採点）') + '</button>');
        if (st.survival && ph === 'reveal' && S.qIdx === S.qCount - 1) a.push('<button class="b y" data-act="survivalAward">生き残りに加点して終了</button>');
      }
      a.push('<span class="sp"></span><button class="b sm gh" data-act="prevq"' + (S.qIdx > 0 ? '' : ' disabled') + '>◀ 前の問題</button><button class="b sm c" data-act="nextq"' + (S.qIdx < S.qCount - 1 ? '' : ' disabled') + '>次の問題 ▶</button>');
    }
    if (st.kind === 'qbox') a.push('<button class="b y" data-act="qboxToggle">' + (ph === 'open' ? '受付を終了' : '受付を再開') + '</button>');
    if (['ranking', 'timeattack', 'scoreboard'].indexOf(st.kind) >= 0) a.push('<button class="b gh" data-act="drumroll">ドラムロール</button>', '<button class="b go" data-act="revealNext">1つ発表（' + (S.revealN || 0) + '/' + (S.total || 0) + '）</button>', '<button class="b gh" data-act="revealAll">全部発表</button>');
    h += '<div class="acts">' + a.join('') + '</div>';
    if (q && st.kind !== 'vote') h += '<div class="qbox">' + escH(q.prompt || '（問題文なし）') + (q.image ? '<br><img src="' + escH(q.image) + '" style="max-width:220px;border-radius:8px;margin-top:6px">' : '') + '<br><span class="ans">正解：' + escH(q.answerText || q.answer || '') + '</span>' + (st.kind === 'buzzer' ? '　' + q.points + 'pt' : '') + '</div>';
    if (st.kind === 'buzzer' && S.buzz && S.buzz.length) h += '<div class="qbox"><b>早押し順</b><br>' + S.buzz.map(function(b, i){ return (i === S.buzzCursor && ph === 'judge' ? '▶ ' : '　') + (i + 1) + '. ' + escH(b.name) + '（' + b.team + '）' + fmtSec(b.show) + 's' + (b.locked ? '　×' : ''); }).join('<br>') + '</div>';
    if (S.answers && S.answers.length) h += '<div class="qbox"><b>回答 ' + S.answers.length + ' / ' + (S.targets || 0) + '</b><br>' + S.answers.map(function(x){ return escH(x.name) + '（' + x.team + '）：' + escH(ansLabel(st, q, x.a)); }).join('<br>') + '</div>';
    if (st.kind === 'qbox') h += '<table class="tb" style="margin-top:10px"><tr><th>質問</th><th>チーム</th><th>♥</th><th></th></tr>' + (S.qbox || []).map(function(x){ return '<tr><td>' + escH(x.text) + '<div class="hint">' + escH(x.name || '') + '</div></td><td>' + x.team + '</td><td>' + x.likes + '</td><td style="white-space:nowrap"><button class="b sm ' + (S.picked === x.id ? 'y' : 'gh') + '" data-pick="' + x.id + '">' + (S.picked === x.id ? '表示中' : '大画面へ') + '</button> <button class="b sm ok" data-qpt="' + x.team + '">+5</button></td></tr>'; }).join('') + '</table>';
    if (st.kind === 'ranking' || st.kind === 'timeattack') h += '<table class="tb" style="margin-top:10px">' + (S.items || []).map(function(x){ return '<tr><td>' + x.rank + '位</td><td>' + escH(x.name) + '</td><td>' + (x.seconds != null ? fmtTA(x.seconds) : escH(x.sub || '')) + '</td><td>' + (x.rank > (S.total - (S.revealN || 0)) ? '発表済' : '') + '</td></tr>'; }).join('') + '</table>';
    return h;
  }
  function ansLabel(st, q, a){
    if (st.kind === 'choice' || st.kind === 'vote') return q.choices[Number(a)] || a;
    if (st.kind === 'order') { var m = {}; (q.choices || []).forEach(function(c){ m[c.i] = c.text; }); return String(a).split(',').map(function(i){ return m[i]; }).join(' → '); }
    return a;
  }
  function phaseL(p){ return { intro: 'タイトル表示', ready: '問題表示（回答前）', open: '回答受付中', judge: '判定中', closed: '締切', reveal: '正解発表', survived: '生き残り発表', show: '表示中' }[p] || p; }
  function teamsTable(edit){
    return '<table class="tb" style="margin-top:12px"><tr><th>チーム</th><th>代表者</th><th>チーム名</th><th>メンバー</th></tr>' + S.teams.map(function(t){
      var lead = edit ? '<select class="f" data-setleader="' + t.team + '"><option value="">（未定）</option>' + t.members.map(function(m){ return '<option value="' + escH(m.emp) + '"' + (m.emp === t.leader ? ' selected' : '') + '>' + escH(m.name) + '</option>'; }).join('') + '</select>' : escH(t.leaderName || '');
      var nm = edit ? '<input class="f" data-setname="' + t.team + '" value="' + escH(t.name) + '" maxlength="16">' : escH(t.name);
      return '<tr class="t' + t.team + '"><td style="color:var(--tc);font-family:var(--num);font-size:18px">' + t.team + '</td><td>' + lead + '</td><td>' + nm + '</td><td>' + t.members.map(function(m){ return '<span class="pill ' + (m.online ? 'on' : '') + '">' + escH(m.name) + '</span>'; }).join('') + '</td></tr>';
    }).join('') + '</table>';
  }
  function scorePanel(){
    return '<div class="pn"><h3>SCORE（手動加点）</h3>' + S.teams.map(function(t){
      return '<div class="tm t' + t.team + '"><span class="l">' + t.team + '</span><span class="n">' + escH(t.name || 'チーム' + t.team) + '</span><span class="s">' + t.score + '</span>'
        + '<div class="bs"><button data-sc="' + t.team + '" data-d="-5">−5</button><button data-sc="' + t.team + '" data-d="1">+1</button><button data-sc="' + t.team + '" data-d="3">+3</button><button data-sc="' + t.team + '" data-d="5">+5</button><button data-sc="' + t.team + '" data-d="10">+10</button><button data-sc="' + t.team + '" data-d="custom">±</button></div></div>';
    }).join('') + '<input class="f" id="reason" placeholder="理由（例：ディベート勝利、ナイス発言）"><input class="f" id="cst" type="number" placeholder="±の点数（例：20、-10）" style="margin-top:6px"></div>';
  }
  function bgmPanel(){
    var opts = [['', '（BGMなし）'], ['builtin:lobby', '内蔵：ロビー'], ['builtin:battle', '内蔵：バトル'], ['builtin:think', '内蔵：シンキングタイム'], ['builtin:result', '内蔵：結果発表']]
      .concat((D.media || []).filter(function(m){ return m.kind === 'audio'; }).map(function(m){ return ['media:' + m.id, '曲：' + m.name]; }));
    return '<div class="pn" style="margin-top:12px"><h3>SOUND</h3><select class="f" id="bgmSel">' + opts.map(function(o){ return '<option value="' + o[0] + '"' + ((S.bgm || '') === o[0] ? ' selected' : '') + '>' + escH(o[1]) + '</option>'; }).join('') + '</select>'
      + '<div class="hint" style="margin:6px 0">音はプロジェクター画面から流れます。回答受付中は内蔵BGMが自動でシンキングタイムに切り替わります。</div>'
      + '<label class="hint" style="display:flex;gap:6px;align-items:center;margin:4px 0 8px"><input type="checkbox" id="sfxLocal"' + (sfxLocal ? ' checked' : '') + '> この画面でも鳴らす（試聴）</label>'
      + SFX_CAT.map(function(c){ return '<div class="hint" style="margin-top:8px">' + escH(c.cat) + '</div><div class="acts" style="margin:4px 0">' + c.items.map(function(x){ return '<button class="b sm gh" data-sfx="' + x[0] + '">' + escH(x[1]) + '</button>'; }).join('') + '</div>'; }).join('') + '</div>';
  }
  function bindCtl(){
    var n = document.getElementById('next'), p = document.getElementById('prev');
    n.onclick = function(){ send({ t: 'next' }); }; p.onclick = function(){ send({ t: 'prev' }); };
    Array.prototype.forEach.call(page.querySelectorAll('[data-goto]'), function(b){ b.onclick = function(){ if (confirm('ここへ移動しますか？')) send({ t: 'goto', i: Number(b.getAttribute('data-goto')) }); }; });
    Array.prototype.forEach.call(page.querySelectorAll('[data-act]'), function(b){ b.onclick = function(){ var a = b.getAttribute('data-act'); if (a === 'timer') act('timer', { min: Number((document.getElementById('tmin') || {}).value || 0) }); else act(a); }; });
    Array.prototype.forEach.call(page.querySelectorAll('[data-sc]'), function(b){ b.onclick = function(){
      var d = b.getAttribute('data-d'), reason = document.getElementById('reason').value.trim();
      if (d === 'custom') { d = Number(document.getElementById('cst').value); if (!d) { alert('±の点数を入力してください'); return; } }
      send({ t: 'score', team: b.getAttribute('data-sc'), delta: Number(d), reason: reason || '手動' });
    }; });
    Array.prototype.forEach.call(page.querySelectorAll('[data-sfx]'), function(b){ b.onclick = function(){ var n = b.getAttribute('data-sfx'); send({ t: 'sfx', name: n }); if (sfxLocal) { IB2A.unlock(); setTimeout(function(){ IB2A.sfx(n); }, 30); } }; });
    var sl = document.getElementById('sfxLocal'); if (sl) sl.onchange = function(){ sfxLocal = sl.checked; if (sfxLocal) IB2A.unlock(); };
    var bs = document.getElementById('bgmSel'); if (bs) bs.onchange = function(){ send({ t: 'bgm', key: bs.value || null }); };
    Array.prototype.forEach.call(page.querySelectorAll('[data-pick]'), function(b){ b.onclick = function(){ act('pick', { id: Number(b.getAttribute('data-pick')) }); }; });
    Array.prototype.forEach.call(page.querySelectorAll('[data-qpt]'), function(b){ b.onclick = function(){ send({ t: 'score', team: b.getAttribute('data-qpt'), delta: 5, reason: '質問箱：いい質問' }); }; });
    Array.prototype.forEach.call(page.querySelectorAll('[data-setleader]'), function(s){ s.onchange = function(){ send({ t: 'setteam', team: s.getAttribute('data-setleader'), leader: s.value }); }; });
    Array.prototype.forEach.call(page.querySelectorAll('[data-setname]'), function(s){ s.onchange = function(){ send({ t: 'setteam', team: s.getAttribute('data-setname'), name: s.value }); }; });
    var rs = document.getElementById('resetSoft'); if (rs) rs.onclick = function(){ if (confirm('得点・チーム名・代表者・回答を消して、参加受付から始め直します。参加者はそのままです。よろしいですか？')) send({ t: 'reset' }); };
    var ra = document.getElementById('resetAll'); if (ra) ra.onclick = function(){ if (confirm('参加者も含めてすべて消し、最初からやり直します。リハーサル後などに使います。よろしいですか？')) send({ t: 'reset', players: true }); };
  }

  // ================= メニュー =================
  function mediaOpts(kind, val){
    return '<option value="">（なし）</option>' + (D.media || []).filter(function(m){ return m.kind === kind; }).map(function(m){ return '<option value="' + m.id + '"' + (String(val) === String(m.id) ? ' selected' : '') + '>' + escH(m.name) + '</option>'; }).join('');
  }
  function bgmOpts(val){
    var o = [['', '（変えない）'], ['none', '止める'], ['builtin:lobby', '内蔵：ロビー'], ['builtin:battle', '内蔵：バトル'], ['builtin:think', '内蔵：シンキングタイム'], ['builtin:result', '内蔵：結果発表']]
      .concat((D.media || []).filter(function(m){ return m.kind === 'audio'; }).map(function(m){ return ['media:' + m.id, '曲：' + m.name]; }));
    return o.map(function(x){ return '<option value="' + x[0] + '"' + ((val || '') === x[0] ? ' selected' : '') + '>' + escH(x[1]) + '</option>'; }).join('');
  }
  function drawMenu(){
    var steps = D.steps || [];
    if (selStep && !steps.some(function(s){ return s.id === selStep; })) selStep = null;
    var list = '<div class="pn"><h3>MENU（上から順に進みます）</h3>' + (EDIT ? '' : '<div class="ro">閲覧のみのアカウントです</div>') + '<div class="steps">' + steps.map(function(s, i){
      return '<div class="stp' + (s.id === selStep ? ' sel' : '') + '" data-sel="' + s.id + '"><span class="k">' + (i + 1) + '</span><span class="t">' + escH(s.title) + '</span><span class="kd">' + escH(kindL(s.kind)) + (s.questions.length ? '・' + s.questions.length + '問' : '') + '</span>'
        + (EDIT ? '<button data-mv="' + s.id + '" data-dir="-1">↑</button><button data-mv="' + s.id + '" data-dir="1">↓</button>' : '') + '</div>';
    }).join('') + '</div>'
      + (EDIT ? '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap"><select class="f" id="newKind" style="flex:1;min-width:200px">' + KINDS.map(function(k){ return '<option value="' + k.v + '">' + escH(k.l + ' … ' + k.desc) + '</option>'; }).join('') + '</select><input class="f" id="newTitle" placeholder="タイトル" style="flex:1;min-width:160px"><button class="b c" id="addStep">追加</button></div>'
        + (steps.length ? '' : '<div style="margin-top:14px"><button class="b go" id="preset">おすすめ構成を一括作成</button><div class="hint" style="margin-top:6px">オープニング・○×サバイバル・講座2回・交差点クイズ・運賃ピタリ賞・OK/NGジャッジ・ディベート・質問箱・スロープ手順の並べ替え・お店ランキング・タイムアタック・最終結果発表を、例題つきで作ります。</div></div>') : '')
      + '</div>';
    var ed = '<div class="pn">' + (selStep ? stepEditor(steps.filter(function(s){ return s.id === selStep; })[0]) : '<div class="hint">左のメニューを選ぶと、ここで中身を編集できます。</div>') + '</div>';
    page.innerHTML = '<div style="display:grid;grid-template-columns:minmax(320px,420px) 1fr;gap:16px;align-items:start">' + list + ed + '</div>';
    bindMenu();
  }
  function cfgField(s, key, label, type, extra){
    var v = s.config[key];
    if (type === 'check') return '<label class="lb"><input type="checkbox" data-cfg="' + key + '"' + (v ? ' checked' : '') + '> ' + label + '</label>';
    if (type === 'select') return '<label class="lb">' + label + '</label><select class="f" data-cfg="' + key + '">' + extra + '</select>';
    if (type === 'area') return '<label class="lb">' + label + '</label><textarea class="f" data-cfg="' + key + '">' + escH(v || '') + '</textarea>';
    return '<label class="lb">' + label + '</label><input class="f" data-cfg="' + key + '" type="' + (type || 'text') + '" value="' + escH(v == null ? '' : v) + '">';
  }
  function stepEditor(s){
    if (!s) return '';
    var c = s.config, k = s.kind, h = '<h3>' + escH(kindL(k)) + '</h3><label class="lb">タイトル</label><input class="f" id="stTitle" value="' + escH(s.title) + '">';
    h += '<div class="row2"><div>' + cfgField(s, 'bgm', 'このラウンドのBGM', 'select', bgmOpts(c.bgm)) + '</div><div>';
    if (['choice', 'number', 'order', 'vote'].indexOf(k) >= 0) h += cfgField(s, 'mode', '回答する人', 'select', '<option value="all"' + (c.mode !== 'leader' ? ' selected' : '') + '>全員（正解した人数ぶんチームに加点）</option><option value="leader"' + (c.mode === 'leader' ? ' selected' : '') + '>代表者だけ（チームで相談）</option>');
    h += '</div></div>';
    if (k === 'title') h += cfgField(s, 'subtitle', 'サブタイトル') + cfgField(s, 'body', '本文（改行可）', 'area') + '<div class="row2"><div>' + cfgField(s, 'image_id', '画像', 'select', mediaOpts('image', c.image_id)) + '</div><div>' + cfgField(s, 'timer', 'タイマー（分・休憩など）', 'number') + '</div></div>';
    if (k === 'buzzer') h += cfgField(s, 'zoom', '画像をズームから少しずつ引いて見せる（難易度アップ）', 'check');
    if (k === 'choice') h += '<div class="row2"><div>' + cfgField(s, 'survival', '○×サバイバル（間違えたら脱落）', 'check') + '</div><div>' + cfgField(s, 'survivalPoints', '生き残り1人あたりの得点', 'number') + '</div></div>';
    if (k === 'number') h += cfgField(s, 'unit', '単位（円・分など）');
    if (k === 'timeattack') h += cfgField(s, 'top', '表示する人数（上位）', 'number') + '<div class="hint">タイムは「車椅子タイム」タブで入力します。</div>';
    if (k === 'scoreboard') h += cfgField(s, 'final', '最終結果（優勝チームを紙吹雪で発表）', 'check');
    if (EDIT) h += '<div class="acts"><button class="b c" id="saveStep">ラウンド設定を保存</button><span class="sp"></span><button class="b sm ng" id="delStep">このラウンドを削除</button></div>';
    if (['buzzer', 'choice', 'number', 'order', 'vote', 'ranking'].indexOf(k) >= 0) {
      h += '<h3 style="margin-top:16px">' + (k === 'ranking' ? 'ランキング（上が1位）' : '問題') + '</h3>' + s.questions.map(function(q, i){ return qEditor(s, q, i); }).join('');
      if (EDIT) h += '<button class="b gh" id="addQ">＋ ' + (k === 'ranking' ? '項目' : '問題') + 'を追加</button>';
    }
    return h;
  }
  function qEditor(s, q, i){
    var k = s.kind, ch = (q.choices || []).join(String.fromCharCode(10));
    var h = '<div class="qcard" data-q="' + q.id + '"><div class="hd"><b>' + (k === 'ranking' ? (i + 1) + '位' : 'Q' + (i + 1)) + '</b><span class="sp"></span>' + (EDIT ? '<button class="b sm gh" data-qmv="' + q.id + '" data-dir="-1">↑</button><button class="b sm gh" data-qmv="' + q.id + '" data-dir="1">↓</button><button class="b sm ng" data-qdel="' + q.id + '">削除</button>' : '') + '</div>';
    if (k === 'ranking') {
      h += '<div class="row2"><div><label class="lb">名前（店名など）</label><input class="f" data-f="prompt" value="' + escH(q.prompt) + '"></div><div><label class="lb">ひとこと（ジャンル・エリアなど）</label><input class="f" data-f="answer" value="' + escH(q.answer) + '"></div></div>'
        + '<div class="row2"><div><label class="lb">補足</label><input class="f" data-f="note" value="' + escH(q.note) + '"></div><div><label class="lb">画像</label><select class="f" data-f="image_id">' + mediaOpts('image', q.image_id) + '</select></div></div>';
    } else {
      h += '<label class="lb">問題文</label><textarea class="f" data-f="prompt">' + escH(q.prompt) + '</textarea>';
      if (k === 'choice' || k === 'vote') h += '<label class="lb">選択肢（1行に1つ・2〜4個）</label><textarea class="f" data-f="choices">' + escH(ch) + '</textarea>';
      if (k === 'order') h += '<label class="lb">項目（正しい順に1行ずつ・スマホではバラバラに表示）</label><textarea class="f" data-f="choices">' + escH(ch) + '</textarea>';
      h += '<div class="row4">';
      if (k === 'choice') h += '<div><label class="lb">正解</label><select class="f" data-f="answer">' + (q.choices || []).map(function(c, j){ return '<option value="' + j + '"' + (String(q.answer) === String(j) ? ' selected' : '') + '>' + escH(c) + '</option>'; }).join('') + '</select></div>';
      if (k === 'buzzer') h += '<div style="grid-column:span 2"><label class="lb">正解（講師用・発表時に表示）</label><input class="f" data-f="answer" value="' + escH(q.answer) + '"></div>';
      if (k === 'number') h += '<div><label class="lb">正解の数字</label><input class="f" data-f="answer" value="' + escH(q.answer) + '"></div>';
      if (k !== 'vote') h += '<div><label class="lb">得点</label><input class="f" data-f="points" type="number" value="' + q.points + '"></div>';
      if (k !== 'buzzer') h += '<div><label class="lb">制限時間（秒）</label><input class="f" data-f="time_limit" type="number" value="' + q.time_limit + '"></div>';
      h += '<div><label class="lb">画像</label><select class="f" data-f="image_id">' + mediaOpts('image', q.image_id) + '</select></div></div>';
      h += '<label class="lb">解説（正解発表時に表示）</label><input class="f" data-f="note" value="' + escH(q.note) + '">';
    }
    return h + '</div>';
  }
  function bindMenu(){
    Array.prototype.forEach.call(page.querySelectorAll('[data-sel]'), function(el){ el.onclick = function(e){ if (e.target.tagName === 'BUTTON') return; selStep = Number(el.getAttribute('data-sel')); drawMenu(); }; });
    Array.prototype.forEach.call(page.querySelectorAll('[data-mv]'), function(b){ b.onclick = function(){
      var ids = D.steps.map(function(s){ return s.id; }), id = Number(b.getAttribute('data-mv')), i = ids.indexOf(id), j = i + Number(b.getAttribute('data-dir'));
      if (j < 0 || j >= ids.length) return; ids[i] = ids[j]; ids[j] = id;
      api('POST', '/steps/reorder', { ids: ids }).then(function(){ reload(); return load(); }).catch(err);
    }; });
    var add = document.getElementById('addStep'); if (add) add.onclick = function(){
      var kind = document.getElementById('newKind').value, title = document.getElementById('newTitle').value.trim() || kindL(kind);
      api('POST', '/steps', { kind: kind, title: title }).then(function(j){ selStep = j.id; reload(); return load(); }).catch(err);
    };
    var pre = document.getElementById('preset'); if (pre) pre.onclick = function(){ if (confirm('おすすめ構成を作成します。あとで自由に直せます。')) api('POST', '/preset', {}).then(function(){ reload(); return load(); }).then(function(){ msg('作成しました'); }).catch(err); };
    var s = selStep && D.steps.filter(function(x){ return x.id === selStep; })[0];
    if (!s) return;
    var sv = document.getElementById('saveStep'); if (sv) sv.onclick = function(){
      var cfg = {}; for (var k in s.config) cfg[k] = s.config[k];
      Array.prototype.forEach.call(page.querySelectorAll('[data-cfg]'), function(el){ var k = el.getAttribute('data-cfg'); cfg[k] = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value); });
      api('PATCH', '/steps/' + s.id, { title: document.getElementById('stTitle').value, config: cfg }).then(function(){ reload(); msg('保存しました'); return load(); }).catch(err);
    };
    var dl = document.getElementById('delStep'); if (dl) dl.onclick = function(){ if (confirm('このラウンドと問題を削除しますか？')) api('DELETE', '/steps/' + s.id).then(function(){ selStep = null; reload(); return load(); }).catch(err); };
    var aq = document.getElementById('addQ'); if (aq) aq.onclick = function(){ api('POST', '/steps/' + s.id + '/questions', {}).then(function(){ reload(); return load(); }).catch(err); };
    Array.prototype.forEach.call(page.querySelectorAll('[data-q]'), function(card){
      var qid = Number(card.getAttribute('data-q'));
      Array.prototype.forEach.call(card.querySelectorAll('[data-f]'), function(el){ el.onchange = function(){
        var body = {}, f = el.getAttribute('data-f'), v = el.value;
        if (f === 'choices') body.choices = v.split(String.fromCharCode(10)).map(function(x){ return x.trim(); }).filter(function(x){ return x; });
        else if (f === 'points' || f === 'time_limit') body[f] = Number(v);
        else if (f === 'image_id') body.image_id = v ? Number(v) : null;
        else body[f] = v;
        api('PATCH', '/questions/' + qid, body).then(function(){ reload(); msg('保存しました'); if (f === 'choices') return load(); }).catch(err);
      }; });
    });
    Array.prototype.forEach.call(page.querySelectorAll('[data-qdel]'), function(b){ b.onclick = function(){ if (confirm('削除しますか？')) api('DELETE', '/questions/' + b.getAttribute('data-qdel')).then(function(){ reload(); return load(); }).catch(err); }; });
    Array.prototype.forEach.call(page.querySelectorAll('[data-qmv]'), function(b){ b.onclick = function(){
      var ids = s.questions.map(function(q){ return q.id; }), id = Number(b.getAttribute('data-qmv')), i = ids.indexOf(id), j = i + Number(b.getAttribute('data-dir'));
      if (j < 0 || j >= ids.length) return; ids[i] = ids[j]; ids[j] = id;
      api('POST', '/steps/' + s.id + '/questions/reorder', { ids: ids }).then(function(){ reload(); return load(); }).catch(err);
    }; });
  }

  // ================= チーム =================
  function drawTeam(){
    var r = D.roster || [];
    var counts = { A: 0, B: 0, C: 0, D: 0 }; r.forEach(function(x){ counts[x.team] = (counts[x.team] || 0) + 1; });
    var h = '<div class="pn"><h3>ROSTER（チーム分け）</h3><div class="hint">参加者は社員番号を入力すると、ここで決めたチームに自動で入ります。人数　A ' + counts.A + '人／B ' + counts.B + '人／C ' + counts.C + '人／D ' + counts.D + '人</div>'
      + (EDIT ? '<div class="acts"><input class="f" id="gy" type="number" value="' + (D.gradYear || 2026) + '" style="width:110px"><button class="b c" id="loadCand">ホシコンから新卒を読み込む</button><button class="b y" id="autoAssign">自動でA〜Dに振り分け</button><button class="b go" id="saveRoster">名簿を保存</button></div>' : '')
      + '<table class="tb"><tr><th>社員番号</th><th>氏名</th><th>チーム</th><th></th></tr>' + r.map(function(x, i){
        return '<tr><td>' + escH(x.emp_no) + '</td><td>' + escH(x.name) + '</td><td><select class="f" data-rt="' + i + '" style="width:90px">' + ['A', 'B', 'C', 'D'].map(function(t){ return '<option' + (x.team === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></td><td>' + (EDIT ? '<button class="b sm gh" data-rdel="' + i + '">外す</button>' : '') + '</td></tr>';
      }).join('') + '</table>'
      + (EDIT ? '<div class="acts"><input class="f" id="addEmp" placeholder="社員番号を追加" style="width:200px"><button class="b gh" id="addRow">追加</button></div>' : '') + '</div>';
    if (cand) h += '<div class="pn" style="margin-top:14px"><h3>CANDIDATES（ホシコンの新卒）</h3><div class="hint">チェックした人を名簿に入れます（すでに名簿にいる人はそのまま）。</div><table class="tb"><tr><th></th><th>社員番号</th><th>氏名</th><th>課・班</th><th>入社日</th></tr>' + cand.map(function(c, i){
      return '<tr><td><input type="checkbox" data-ci="' + i + '" checked></td><td>' + escH(c.emp_no) + '</td><td>' + escH(c.name) + '</td><td>' + (c.division || '') + '課' + (c.team || '') + '班</td><td>' + escH(c.hire_date || '') + '</td></tr>';
    }).join('') + '</table><div class="acts"><button class="b c" id="takeCand">チェックした人を名簿に入れる</button></div></div>';
    page.innerHTML = h;
    Array.prototype.forEach.call(page.querySelectorAll('[data-rt]'), function(s){ s.onchange = function(){ D.roster[Number(s.getAttribute('data-rt'))].team = s.value; drawTeam(); }; });
    Array.prototype.forEach.call(page.querySelectorAll('[data-rdel]'), function(b){ b.onclick = function(){ D.roster.splice(Number(b.getAttribute('data-rdel')), 1); drawTeam(); }; });
    var lc = document.getElementById('loadCand'); if (lc) lc.onclick = function(){ api('GET', '/roster/candidates?year=' + encodeURIComponent(document.getElementById('gy').value)).then(function(j){ cand = j.candidates || []; D.gradYear = Number(document.getElementById('gy').value); drawTeam(); }).catch(err); };
    var tc = document.getElementById('takeCand'); if (tc) tc.onclick = function(){
      var have = {}; D.roster.forEach(function(x){ have[x.emp_no] = 1; });
      Array.prototype.forEach.call(page.querySelectorAll('[data-ci]'), function(c){ if (c.checked) { var x = cand[Number(c.getAttribute('data-ci'))]; if (!have[x.emp_no]) D.roster.push({ emp_no: x.emp_no, name: x.name, team: 'A' }); } });
      cand = null; drawTeam(); msg('名簿に入れました。振り分けて保存してください');
    };
    var aa = document.getElementById('autoAssign'); if (aa) aa.onclick = function(){
      var arr = D.roster.slice(); for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      arr.forEach(function(x, i){ x.team = 'ABCD'.charAt(i % 4); }); drawTeam();
    };
    var sr = document.getElementById('saveRoster'); if (sr) sr.onclick = function(){ api('PUT', '/roster', { roster: D.roster }).then(function(){ reload(); msg('名簿を保存しました'); return load(); }).catch(err); };
    var ar = document.getElementById('addRow'); if (ar) ar.onclick = function(){
      var v = document.getElementById('addEmp').value.trim(); if (!v) return;
      api('GET', '/roster/lookup?emp_no=' + encodeURIComponent(v)).then(function(j){ D.roster.push({ emp_no: j.emp_no, name: j.name, team: 'A' }); drawTeam(); }).catch(err);
    };
  }

  // ================= 素材 =================
  function drawMedia(){
    var m = D.media || [];
    page.innerHTML = '<div class="pn"><h3>MEDIA</h3><div class="hint">画像（交差点の写真・お店の写真など）と曲（BGM）をアップロードすると、メニューの各問題・ラウンドで選べるようになります。画像は自動で軽くします。曲は1ファイル15MBまで。</div>'
      + (EDIT ? '<div class="drop" id="drop" style="margin:12px 0">ここをクリック、またはファイルをドラッグ（複数可）<input type="file" id="file" multiple accept="image/*,audio/*" style="display:none"></div>' : '')
      + '<div class="media">' + m.map(function(x){
        var src = ${JSON.stringify(opts.joinUrl.replace(/\/$/, ''))} + '/media/' + x.id;
        return '<div class="m">' + (x.kind === 'image' ? '<img src="' + src + '">' : '<div style="font-size:30px;text-align:center">♪</div><audio controls preload="none" src="' + src + '"></audio>') + '<div style="margin-top:6px;word-break:break-all">' + escH(x.name) + '</div>' + (EDIT ? '<button class="b sm ng" data-mdel="' + x.id + '" style="margin-top:6px">削除</button>' : '') + '</div>';
      }).join('') + '</div></div>';
    var drop = document.getElementById('drop'), file = document.getElementById('file');
    if (drop) {
      drop.onclick = function(){ file.click(); };
      file.onchange = function(){ upload(file.files); };
      drop.ondragover = function(e){ e.preventDefault(); drop.style.borderColor = 'var(--cyan)'; };
      drop.ondragleave = function(){ drop.style.borderColor = ''; };
      drop.ondrop = function(e){ e.preventDefault(); upload(e.dataTransfer.files); };
    }
    Array.prototype.forEach.call(page.querySelectorAll('[data-mdel]'), function(b){ b.onclick = function(){ if (confirm('削除しますか？（使っている問題からも外れます）')) api('DELETE', '/media/' + b.getAttribute('data-mdel')).then(function(){ reload(); return load(); }).catch(err); }; });
  }
  function shrink(file){
    return new Promise(function(res){
      if (file.type.indexOf('image/') !== 0 || file.type === 'image/gif') return res(file);
      var img = new Image();
      img.onload = function(){ var sc = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight)); var cv = document.createElement('canvas'); cv.width = Math.round(img.naturalWidth * sc); cv.height = Math.round(img.naturalHeight * sc); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(img.src); cv.toBlob(function(b){ res(b || file); }, 'image/jpeg', 0.86); };
      img.onerror = function(){ res(file); };
      img.src = URL.createObjectURL(file);
    });
  }
  function upload(files){
    var list = Array.prototype.slice.call(files || []), chain = Promise.resolve();
    msg('アップロード中…');
    list.forEach(function(f){ chain = chain.then(function(){ return shrink(f); }).then(function(b){ return api('POST', '/media', undefined, { body: b, type: b.type || f.type, name: f.name }); }); });
    chain.then(function(){ msg('アップロードしました'); return load(); }).catch(err);
  }

  // ================= 車椅子タイム =================
  function drawTA(){
    var t = D.timeattack || [];
    page.innerHTML = '<div class="pn"><h3>WHEELCHAIR TIME ATTACK</h3><div class="hint">運転席からスライドドアを開け始めた時 → 車椅子の方が乗った状態で運転席に座るまでのタイム。入力するとランキングに反映され、メニューの「車椅子タイムアタック」で発表できます。</div>'
      + (EDIT ? '<div class="acts"><select class="f" id="taName" style="width:220px"><option value="">（名簿から選ぶ）</option>' + (D.roster || []).map(function(r){ return '<option value="' + escH(r.emp_no) + '">' + escH(r.name) + '</option>'; }).join('') + '</select><input class="f" id="taFree" placeholder="または氏名を入力" style="width:180px"><input class="f" id="taTime" placeholder="タイム（例 1:23.4 / 83.4）" style="width:200px"><input class="f" id="taNote" placeholder="メモ" style="width:160px"><button class="b go" id="taAdd">記録する</button></div>' : '')
      + '<table class="tb"><tr><th>順位</th><th>氏名</th><th>タイム</th><th>メモ</th><th>記録日時</th><th></th></tr>' + t.map(function(x, i){ return '<tr><td>' + (i + 1) + '</td><td>' + escH(x.name) + '</td><td class="num">' + fmtTA(x.seconds) + '</td><td>' + escH(x.note) + '</td><td class="hint">' + escH(x.created_at) + '</td><td>' + (EDIT ? '<button class="b sm ng" data-tadel="' + x.id + '">削除</button>' : '') + '</td></tr>'; }).join('') + '</table></div>';
    var add = document.getElementById('taAdd'); if (add) add.onclick = function(){
      var sel = document.getElementById('taName'), emp = sel.value, name = emp ? sel.options[sel.selectedIndex].text : document.getElementById('taFree').value.trim();
      var tv = document.getElementById('taTime').value.trim(), sec = 0;
      if (tv.indexOf(':') >= 0) { var p = tv.split(':'); sec = Number(p[0]) * 60 + Number(p[1]); } else sec = Number(tv);
      if (!name || !(sec > 0)) { alert('氏名とタイムを入力してください'); return; }
      api('POST', '/timeattack', { emp_no: emp, name: name, seconds: sec, note: document.getElementById('taNote').value }).then(function(){ reload(); msg('記録しました'); return load(); }).catch(err);
    };
    Array.prototype.forEach.call(page.querySelectorAll('[data-tadel]'), function(b){ b.onclick = function(){ if (confirm('削除しますか？')) api('DELETE', '/timeattack/' + b.getAttribute('data-tadel')).then(function(){ reload(); return load(); }).catch(err); }; });
  }

  // ================= 得点履歴 =================
  function drawLog(){
    var l = D.scores || [];
    page.innerHTML = '<div class="pn"><h3>SCORE LOG</h3><div class="hint">間違えて加点した場合は「取り消す」で戻せます。</div><table class="tb"><tr><th>時刻</th><th>チーム</th><th>点数</th><th>理由</th><th>操作者</th><th></th></tr>'
      + l.map(function(x){ return '<tr class="t' + x.team + '"><td class="hint">' + escH(x.created_at) + '</td><td style="color:var(--tc)">' + x.team + '</td><td class="num">' + (x.delta > 0 ? '+' : '') + x.delta + '</td><td>' + escH(x.reason) + '</td><td class="hint">' + escH(x.created_by) + '</td><td>' + (EDIT ? '<button class="b sm gh" data-sdel="' + x.id + '">取り消す</button>' : '') + '</td></tr>'; }).join('') + '</table></div>';
    Array.prototype.forEach.call(page.querySelectorAll('[data-sdel]'), function(b){ b.onclick = function(){ if (confirm('この加点を取り消しますか？')) api('DELETE', '/scores/' + b.getAttribute('data-sdel')).then(function(){ reload(); return load(); }).catch(err); }; });
  }

  load();
})();
</script></body></html>`;
}
