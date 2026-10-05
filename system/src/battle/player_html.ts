// ITABASHI BATTLE 2 — 参加者（新卒）のスマホ画面
//   社員番号で参加 → チーム発表 → 代表者決め → チーム名決め → 管理者のメニューどおりに進行。
//   早押しの反応時間は「ボタンが表示されてから押すまで」を端末内で測って送る（電波の遅れに左右されにくい）。
import { battleHead, BATTLE_BASE_CSS, BATTLE_NET_JS } from './theme';
import { BATTLE_AUDIO_JS } from './audio';

export function battlePlayerPage(base: string): string {
  return `<!DOCTYPE html><html lang="ja"><head>${battleHead('ITABASHI BATTLE 2')}
<style>${BATTLE_BASE_CSS}
body{display:flex;flex-direction:column;height:100dvh;}
.top{flex:none;display:flex;align-items:center;gap:10px;padding:max(10px,env(safe-area-inset-top)) 14px 10px;border-bottom:1px solid var(--line);background:rgba(7,6,15,.7);backdrop-filter:blur(8px);}
.logo{font-family:var(--num);font-weight:900;font-size:13px;letter-spacing:.12em;--glow:var(--pink);}
.logo b{color:var(--pink);}
.chip{margin-left:auto;display:flex;align-items:center;gap:8px;padding:5px 12px;border-radius:999px;background:var(--panel);border:1px solid var(--tc,var(--line));font-size:12px;}
.chip .tl{font-family:var(--num);font-weight:900;color:var(--tc);}
.chip .sc{font-family:var(--num);font-weight:900;font-size:15px;}
.net{width:9px;height:9px;border-radius:50%;background:#555;flex:none;}
.net.ok{background:var(--green);box-shadow:0 0 10px var(--green);} .net.ng{background:var(--pink);animation:pulse 1s infinite;}
main{flex:1;overflow-y:auto;padding:18px 16px max(24px,env(safe-area-inset-bottom));display:flex;flex-direction:column;}
.center{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px;}
h1.big{font-family:var(--disp);font-weight:900;font-size:30px;line-height:1.3;}
.sub{color:var(--mute);font-size:14px;line-height:1.7;}
.card{width:100%;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:16px;}
input.in{width:100%;font:800 28px/1 var(--num);text-align:center;letter-spacing:.12em;color:var(--ink);background:rgba(255,255,255,.08);border:2px solid var(--line);border-radius:14px;padding:16px;outline:none;}
input.in:focus{border-color:var(--cyan);box-shadow:0 0 0 4px rgba(47,211,255,.2);}
input.txt{width:100%;font:800 20px/1.3 var(--jp);color:var(--ink);background:rgba(255,255,255,.08);border:2px solid var(--line);border-radius:14px;padding:14px;outline:none;}
textarea.txt{width:100%;min-height:90px;font:700 16px/1.5 var(--jp);color:var(--ink);background:rgba(255,255,255,.08);border:2px solid var(--line);border-radius:14px;padding:12px;outline:none;resize:none;}
.btn{width:100%;border:0;border-radius:16px;padding:18px;font:900 18px/1 var(--jp);color:#07060f;background:linear-gradient(135deg,var(--cyan),var(--violet));box-shadow:0 8px 30px rgba(47,211,255,.35);cursor:pointer;}
.btn:disabled{opacity:.4;}
.btn.alt{background:linear-gradient(135deg,var(--pink),var(--yellow));box-shadow:0 8px 30px rgba(255,59,107,.35);}
.err{color:var(--pink);font-size:13px;min-height:18px;}
.teamL{font-family:var(--num);font-weight:900;font-size:120px;line-height:1;color:var(--tc);--glow:var(--tc);}
.mem{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;}
.mem span{padding:7px 12px;border-radius:999px;background:var(--panel);border:1px solid var(--line);font-size:14px;}
.mem span.me{border-color:var(--tc);color:var(--tc);}
.pick{display:grid;gap:10px;width:100%;}
.pick button{border:2px solid var(--line);background:var(--panel);color:var(--ink);border-radius:14px;padding:15px;font:800 17px/1 var(--jp);}
.pick button.on{border-color:var(--tc);background:color-mix(in srgb,var(--tc) 22%,transparent);box-shadow:0 0 22px color-mix(in srgb,var(--tc) 50%,transparent);}
.buzz{width:min(78vw,320px);aspect-ratio:1;border-radius:50%;border:0;font:900 44px/1 var(--num);color:#fff;
  background:radial-gradient(circle at 35% 30%,color-mix(in srgb,var(--tc) 60%,#fff),var(--tc) 55%,color-mix(in srgb,var(--tc) 60%,#000));
  box-shadow:0 14px 0 color-mix(in srgb,var(--tc) 45%,#000),0 0 60px var(--tc);animation:glowpulse 1.4s infinite;letter-spacing:.06em;}
.buzz:active{transform:translateY(10px);box-shadow:0 4px 0 color-mix(in srgb,var(--tc) 45%,#000),0 0 80px var(--tc);}
.buzz:disabled{filter:grayscale(.85) brightness(.6);animation:none;}
.ch{display:grid;gap:12px;width:100%;}
.ch.c2{grid-template-columns:1fr 1fr;}
.ch button{border:0;border-radius:18px;padding:20px 14px;min-height:78px;font:900 19px/1.35 var(--jp);color:#07060f;text-align:center;}
.ch button:nth-child(1){background:var(--pink);} .ch button:nth-child(2){background:var(--cyan);} .ch button:nth-child(3){background:var(--yellow);} .ch button:nth-child(4){background:var(--green);}
.ch button:disabled{opacity:.35;} .ch button.sel{opacity:1;outline:4px solid #fff;outline-offset:3px;}
.ch button.ok{box-shadow:0 0 0 4px #fff,0 0 40px #fff;} .ch button.ng{opacity:.18;}
.ox button{font-size:56px;font-family:var(--disp);font-weight:900;}
.timer{font-family:var(--num);font-weight:900;font-size:44px;color:var(--yellow);--glow:var(--yellow);}
.prompt{font-size:19px;line-height:1.55;font-weight:800;}
.ord{display:flex;flex-direction:column;gap:8px;width:100%;}
.ord .it{display:flex;align-items:center;gap:8px;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:10px 10px 10px 14px;text-align:left;font-size:15px;}
.ord .it b{font-family:var(--num);color:var(--cyan);width:22px;}
.ord .it span{flex:1;}
.ord .it button{width:42px;height:42px;border-radius:10px;border:1px solid var(--line);background:rgba(255,255,255,.08);color:var(--ink);font-size:18px;}
.res{font-family:var(--disp);font-weight:900;font-size:46px;}
.res.ok{color:var(--green);--glow:var(--green);} .res.ng{color:var(--pink);--glow:var(--pink);}
.qlist{display:flex;flex-direction:column;gap:8px;width:100%;}
.qlist .qi{display:flex;gap:10px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px;text-align:left;font-size:14px;line-height:1.5;}
.qlist .qi span{flex:1;}
.qlist .qi button{flex:none;border:1px solid var(--line);background:transparent;color:var(--ink);border-radius:999px;padding:8px 12px;font:800 13px/1 var(--jp);}
.qlist .qi button.on{background:var(--pink);border-color:var(--pink);color:#fff;}
.rank{font-family:var(--num);font-size:64px;color:var(--tc);--glow:var(--tc);}
.flash{position:fixed;inset:0;pointer-events:none;background:var(--tc,#fff);opacity:0;}
.flash.go{animation:fl .5s ease;}
@keyframes fl{0%{opacity:.55;}100%{opacity:0;}}
.big2{font-family:var(--num);font-weight:900;font-size:64px;line-height:1;}
.big2.up{color:var(--green);--glow:var(--green);} .big2.down{color:var(--pink);--glow:var(--pink);}
.mrow{display:grid;grid-template-columns:80px 1fr auto;gap:8px;align-items:center;padding:10px 12px;border-bottom:1px solid var(--line);font-size:14px;text-align:left;}
.mrow:last-child{border-bottom:0;}
.mrow .r{font-family:var(--num);font-weight:900;font-size:15px;}
.mrow .r.up{color:var(--green);} .mrow .r.down{color:var(--pink);}
.priv{font-size:11px;color:var(--mute);display:flex;align-items:center;gap:6px;justify-content:center;}
.dtbl{width:100%;border-collapse:collapse;font-size:12px;text-align:left;}
.dtbl th,.dtbl td{padding:7px 6px;border-bottom:1px solid var(--line);white-space:nowrap;}
.dtbl th{color:var(--mute);font-size:10.5px;position:sticky;top:0;background:#100d22;}
.dtbl td.n{text-align:right;font-family:var(--num);}
.scrollbox{width:100%;max-height:46vh;overflow:auto;border-radius:14px;border:1px solid var(--line);background:var(--panel);}
.b2{border:1px solid var(--line);background:transparent;color:var(--mute);border-radius:999px;padding:7px 12px;font:800 12px/1 var(--jp);}
.b2.on{background:var(--ink);color:#07060f;border-color:var(--ink);}
.stepLbl{font-family:var(--num);font-size:12px;letter-spacing:.18em;color:var(--mute);}
</style></head><body>
<div class="top"><span class="net" id="net"></span><span class="logo neon">ITABASHI <b>BATTLE 2</b></span><span class="chip" id="chip" style="display:none"></span></div>
<main id="app"></main>
<div class="flash" id="flash"></div>
<script>${BATTLE_AUDIO_JS}</script>
<script>${BATTLE_NET_JS}</script>
<script>
(function(){
  var BASE = ${JSON.stringify(base)};
  var KEY = 'ib2_token';
  var app = document.getElementById('app');
  var S = null, token = null, shownAt = 0, openKey = '', draft = { leader: '', order: null, orderKey: '', num: '', chart: 'day', sel: -1 }, lastHtml = '';
  function store(k, v){ try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }
  function vib(p){ try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }
  function flash(){ var f = document.getElementById('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go'); }
  document.addEventListener('pointerdown', function(){ IB2A.unlock(); }, { passive: true });

  function joinView(msg){
    app.innerHTML = '<div class="center">'
      + '<div class="stepLbl">ENTRY</div><h1 class="big neon" style="--glow:var(--cyan)">社員番号を入力して<br>バトルに参戦！</h1>'
      + '<div class="card"><input class="in" id="emp" inputmode="numeric" autocomplete="off" placeholder="社員番号" maxlength="12">'
      + '<div class="err" id="err" style="margin-top:10px">' + escH(msg || '') + '</div>'
      + '<button class="btn" id="go" style="margin-top:6px">参戦する！</button></div>'
      + '<div class="sub">名簿にない場合は、講師に声をかけてください</div></div>';
    var go = document.getElementById('go'), inp = document.getElementById('emp');
    inp.focus();
    inp.addEventListener('keydown', function(e){ if (e.key === 'Enter') go.click(); });
    go.onclick = function(){
      var v = (inp.value || '').trim();
      if (!v) return;
      go.disabled = true;
      fetch(BASE + '/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emp_no: v }) })
        .then(function(r){ return r.json(); }).then(function(j){
          if (!j || !j.token) { document.getElementById('err').textContent = (j && j.error) || '参加できませんでした'; go.disabled = false; return; }
          token = j.token; store(KEY, token); start();
        }).catch(function(){ document.getElementById('err').textContent = '通信に失敗しました'; go.disabled = false; });
    };
  }

  function start(){
    app.innerHTML = '<div class="center"><div class="blink sub">接続中…</div></div>';
    var proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    IB2N.connect(proto + location.host + BASE + '/ws?token=' + encodeURIComponent(token), function(s){ S = s; render(); }, onMsg);
  }
  function onMsg(m){
    if (m.t === 'kicked') { if (!m.soft) { store(KEY, null); location.reload(); } return; }
    if (m.t === 'score' && S && S.me && m.team === S.me.team && m.delta > 0) { IB2A.sfx('score'); vib([40, 40, 80]); flash(); }
    if (m.t === 'buzzed') vib(60);
  }

  function chip(){
    var el = document.getElementById('chip');
    if (!S || !S.me) { el.style.display = 'none'; return; }
    var t = S.teams.filter(function(x){ return x.team === S.me.team; })[0] || {};
    el.className = 'chip t' + S.me.team; el.style.display = '';
    el.innerHTML = '<span class="tl">' + S.me.team + '</span><span>' + escH(t.name || 'チーム' + S.me.team) + '</span><span class="sc">' + (t.score || 0) + '</span>';
  }
  function myTeam(){ return S.teams.filter(function(x){ return x.team === S.me.team; })[0] || { members: [] }; }
  function tick(){
    var el = document.getElementById('tm');
    if (!el || !S) return;
    var end = el.getAttribute('data-end') * 1;
    var left = Math.max(0, end - IB2N.now());
    if (el.getAttribute('data-fmt') === 'mmss') el.textContent = Math.floor(left / 60000) + ':' + ('0' + Math.floor(left / 1000) % 60).slice(-2);
    else el.textContent = Math.ceil(left / 1000);
  }
  setInterval(tick, 200);

  function render(){
    if (!S) return;
    if (!S.me) { store(KEY, null); joinView('もう一度、社員番号を入力してください'); return; }
    chip();
    document.body.className = 't' + S.me.team;
    var me = S.me, h = '';
    if (S.stage === 'lobby') {
      h = '<div class="center"><div class="stepLbl">ENTRY COMPLETE</div><h1 class="big pop">' + escH(me.name) + ' さん<br>エントリー完了！</h1>'
        + '<div class="sub blink">まもなくバトル開始…<br>前の画面に注目！</div><div class="sub">参戦中 <span class="num" style="color:var(--cyan)">' + S.joined + '</span> 人</div></div>';
    } else if (S.stage === 'reveal') {
      var mt = myTeam();
      h = '<div class="center"><div class="sub">あなたのチームは…</div><div class="teamL neon pop">' + me.team + '</div>'
        + '<h1 class="big rise">チームメンバーで<br>集まろう！</h1><div class="mem">'
        + mt.members.map(function(x){ return '<span class="' + (x.emp === me.emp ? 'me' : '') + '">' + escH(x.name) + '</span>'; }).join('') + '</div></div>';
    } else if (S.stage === 'setup') {
      h = setupView();
    } else if (S.stage === 'step' && S.step) {
      h = stepView();
    }
    if (h === lastHtml) return;
    // 入力途中の文字とフォーカスを残したまま描き直す（他の人の操作で画面が更新されても消えないように）
    var keep = {};
    ['tname', 'qt', 'numIn'].forEach(function(id){ var el = document.getElementById(id); if (el) keep[id] = { v: el.value, f: document.activeElement === el }; });
    lastHtml = h;
    app.innerHTML = h;
    Object.keys(keep).forEach(function(id){ var el = document.getElementById(id); if (el) { el.value = keep[id].v; if (keep[id].f) el.focus(); } });
    bind();
    tick();
  }

  function setupView(){
    var me = S.me, mt = myTeam();
    if (!mt.leader) {
      if (!draft.leader) draft.leader = '';
      return '<div class="center"><div class="stepLbl">TEAM ' + me.team + '</div><h1 class="big neon" style="--glow:var(--tc)">代表者を決めてね！</h1>'
        + '<div class="sub">話し合って、代表者を1人選んで送信</div><div class="pick">'
        + mt.members.map(function(x){ return '<button data-leader="' + escH(x.emp) + '" class="' + (draft.leader === x.emp ? 'on' : '') + '">' + escH(x.name) + '</button>'; }).join('')
        + '</div><button class="btn" id="sendLeader"' + (draft.leader ? '' : ' disabled') + '>この人に決定！</button></div>';
    }
    if (!mt.name) {
      if (me.isLeader) {
        return '<div class="center"><div class="stepLbl">LEADER</div><h1 class="big neon" style="--glow:var(--tc)">チーム名を決めてね！</h1>'
          + '<div class="sub">あなたが代表者です。みんなで決めた名前を入力</div><div class="card"><input class="txt" id="tname" maxlength="16" placeholder="例：環七ライダーズ">'
          + '<button class="btn alt" id="sendName" style="margin-top:12px">このチーム名で決定！</button></div></div>';
      }
      return '<div class="center"><div class="stepLbl">TEAM ' + me.team + '</div><h1 class="big">チーム名を決めてね！</h1>'
        + '<div class="sub">代表者：<b style="color:var(--tc)">' + escH(mt.leaderName) + '</b> さん<br>代表者のスマホから入力します</div><div class="blink sub">入力中…</div></div>';
    }
    return '<div class="center"><div class="stepLbl">READY</div><div class="sub">チーム' + me.team + '</div><h1 class="big neon pop" style="--glow:var(--tc);color:var(--tc)">' + escH(mt.name) + '</h1>'
      + '<div class="sub">代表者：' + escH(mt.leaderName) + ' さん</div><div class="sub blink">準備完了！ 開始を待て…</div></div>';
  }

  function head(){ return '<div class="stepLbl">ROUND ' + (S.stepIdx + 1) + ' / ' + S.stepCount + '</div><div class="sub" style="color:var(--ink)">' + escH(S.step.title) + '</div>'; }
  function waitScreen(msg){ return '<div class="center">' + head() + '<h1 class="big" style="margin-top:8px">' + (msg || '前の画面に注目！') + '</h1></div>'; }

  function stepView(){
    var st = S.step, me = S.me, q = S.q, ph = S.phase;
    if (st.kind === 'title') {
      var t = S.timerEnd ? '<div class="timer neon" id="tm" data-fmt="mmss" data-end="' + S.timerEnd + '"></div><div class="sub">後に再開</div>' : '';
      return '<div class="center">' + head() + '<h1 class="big">' + escH(st.title) + '</h1>' + (st.subtitle ? '<div class="sub">' + escH(st.subtitle) + '</div>' : '') + t + '</div>';
    }
    if (['ranking', 'timeattack', 'scoreboard'].indexOf(st.kind) >= 0) return waitScreen('結果発表！<br>前の画面に注目！');
    if (st.kind === 'video') return waitScreen('映像スタート！<br>前の画面に注目！');
    if (st.kind === 'mygrowth') return growthView();
    if (st.kind === 'mysales') return salesView();
    if (st.kind === 'qbox') return qboxView();
    if (!q) return waitScreen();
    if (ph === 'intro') return '<div class="center">' + head() + '<h1 class="big neon pop" style="--glow:var(--pink)">まもなく開始！</h1><div class="sub">' + kindLabel(st) + '</div></div>';
    if (st.kind === 'buzzer') return buzzerView();
    return answerView();
  }
  function kindLabel(st){
    var m = { buzzer: '早押しクイズ', choice: st.survival ? '○×サバイバル' : '選択クイズ', number: 'ピタリ賞', order: '並べ替え', vote: '投票' };
    return (m[st.kind] || '') + (st.mode === 'leader' ? '（代表者が回答）' : '');
  }

  function buzzerView(){
    var q = S.q, ph = S.phase, me = S.me;
    var top = head() + '<div class="stepLbl" style="color:var(--yellow)">Q' + q.no + '　' + q.points + 'pt</div>';
    if (ph === 'ready') return '<div class="center">' + top + '<button class="buzz" disabled>待機中</button><div class="sub blink">画像が出たら早押し！</div></div>';
    if (ph === 'open' || ph === 'judge') {
      var key = q.id + ':' + S.openAt;
      if (openKey !== key) { openKey = key; shownAt = performance.now(); }
      var mine = (S.buzz || []).map(function(b){ return b.emp; }).indexOf(me.emp);
      if (me.locked) return '<div class="center">' + top + '<div class="res ng neon">残念…</div><div class="sub">この問題の回答権はなくなりました</div></div>';
      if (mine >= 0 || me.buzzed) {
        var cur = S.buzz && S.buzz[S.buzzCursor];
        var myTurn = cur && cur.emp === me.emp && ph === 'judge';
        return '<div class="center">' + top + (mine >= 0 ? '<div class="rank neon pop">' + (mine + 1) + '<span style="font-size:24px">位</span></div><div class="num" style="font-size:20px">' + fmtSec(S.buzz[mine].show) + 's</div>' : '<div class="sub blink">判定中…</div>')
          + (myTurn ? '<h1 class="big neon pop" style="--glow:var(--yellow);color:var(--yellow)">あなたの番！<br>答えて！</h1>' : '<div class="sub">判定を待て…</div>') + '</div>';
      }
      return '<div class="center">' + top + '<button class="buzz" id="buzz">PUSH!</button><div class="sub">早い者勝ち！</div></div>';
    }
    if (ph === 'reveal') {
      var w = S.result && S.result.winner;
      var win = (S.buzz || []).filter(function(b){ return b.emp === w; })[0];
      return '<div class="center">' + top + '<div class="sub">正解は…</div><h1 class="big neon pop" style="--glow:var(--green)">' + escH(q.answerText || '') + '</h1>'
        + (win ? '<div class="sub">正解：<b style="color:var(--t' + win.team + ')">' + escH(win.name) + '</b>（チーム' + win.team + '）</div>' : '<div class="sub">正解者なし</div>')
        + (win && win.team === me.team ? '<div class="res ok neon">+' + q.points + 'pt</div>' : '') + '</div>';
    }
    return waitScreen();
  }

  function answerView(){
    var st = S.step, q = S.q, ph = S.phase, me = S.me, mt = myTeam();
    var top = head() + '<div class="stepLbl" style="color:var(--yellow)">Q' + q.no + (st.kind === 'vote' ? '' : '　' + q.points + 'pt') + '</div>';
    var prompt = '<div class="prompt">' + escH(q.prompt) + '</div>';
    if (st.survival && me.out) return '<div class="center">' + top + '<div class="res ng neon">脱落…</div><div class="sub">残り <b class="num">' + (S.survivors || 0) + '</b> 人。チームの仲間を応援しよう！</div></div>';
    var canAnswer = st.mode !== 'leader' || me.isLeader;
    if (ph === 'ready') return '<div class="center">' + top + prompt + '<div class="sub blink">まもなく回答スタート！</div></div>';
    if (ph === 'open') {
      var key = q.id + ':' + S.openAt;
      if (openKey !== key) { openKey = key; shownAt = performance.now(); draft.num = ''; }
      var tm = '<div class="timer neon" id="tm" data-end="' + S.deadline + '"></div>';
      if (!canAnswer) return '<div class="center">' + top + prompt + tm + '<h1 class="big">代表者が回答中！</h1><div class="sub">' + escH(mt.leaderName) + ' さんと相談しよう</div></div>';
      if (me.answer != null) return '<div class="center">' + top + prompt + tm + '<h1 class="big neon pop" style="--glow:var(--cyan)">回答完了！</h1><div class="sub">締め切りまで待て…</div></div>';
      return '<div class="center" style="justify-content:flex-start">' + top + prompt + tm + inputView() + '</div>';
    }
    if (ph === 'closed') return '<div class="center">' + top + prompt + '<h1 class="big">締め切り！</h1><div class="sub blink">正解発表を待て…</div></div>';
    if (ph === 'reveal' || ph === 'survived') return '<div class="center">' + top + prompt + resultView() + '</div>';
    return waitScreen();
  }

  function inputView(){
    var st = S.step, q = S.q;
    if (st.kind === 'choice' || st.kind === 'vote') {
      var ox = q.choices.length === 2 && (q.choices[0] === '○' || q.choices[0] === '〇');
      return '<div class="ch ' + (q.choices.length === 2 ? 'c2 ' : '') + (ox ? 'ox' : '') + '">' + q.choices.map(function(c, i){ return '<button data-ans="' + i + '">' + escH(c) + '</button>'; }).join('') + '</div>';
    }
    if (st.kind === 'number') {
      return '<div class="card"><input class="in" id="numIn" inputmode="decimal" placeholder="数字を入力" value="' + escH(draft.num) + '"><div class="sub" style="margin:8px 0">' + escH(st.unit || '') + '</div><button class="btn alt" id="sendNum">この答えで勝負！</button></div>';
    }
    if (st.kind === 'order') {
      var k = q.id + ':' + S.openAt;
      if (draft.orderKey !== k) { draft.orderKey = k; draft.order = q.choices.map(function(c){ return c.i; }); }
      var byI = {}; q.choices.forEach(function(c){ byI[c.i] = c.text; });
      return '<div class="ord">' + draft.order.map(function(i, pos){ return '<div class="it"><b>' + (pos + 1) + '</b><span>' + escH(byI[i]) + '</span><button data-up="' + pos + '">▲</button><button data-dn="' + pos + '">▼</button></div>'; }).join('')
        + '</div><button class="btn alt" id="sendOrd">この順番で決定！</button>';
    }
    return '';
  }

  function resultView(){
    var st = S.step, q = S.q, me = S.me, r = S.result || {};
    if (st.kind === 'vote') {
      var tot = (r.dist || []).reduce(function(a, b){ return a + b; }, 0) || 1;
      return '<div class="card" style="text-align:left">' + q.choices.map(function(c, i){ var n = (r.dist || [])[i] || 0; return '<div style="margin:8px 0">' + escH(c) + '　<b class="num">' + n + '</b>票<div style="height:10px;border-radius:6px;background:var(--line);margin-top:4px"><div style="height:10px;border-radius:6px;width:' + Math.round(n / tot * 100) + '%;background:var(--cyan)"></div></div></div>'; }).join('') + '</div>';
    }
    var my = me.answer, ok = false, txt = '';
    if (st.kind === 'choice') { ok = my != null && String(my) === String(q.answer); txt = q.choices[Number(q.answer)]; }
    if (st.kind === 'number') { txt = q.answerText; var top3 = (r.ranked || []).slice(0, 3).map(function(x){ return x.emp; }); ok = top3.indexOf(me.emp) >= 0; }
    if (st.kind === 'order') { ok = (r.correct || []).some(function(x){ return x.emp === me.emp; }); txt = q.answerText; }
    var mine = st.mode === 'leader' && !me.isLeader ? '<div class="sub">代表者の回答で勝負！</div>' : (my == null ? '<div class="sub">未回答</div>' : '<div class="res ' + (ok ? 'ok' : 'ng') + ' neon pop">' + (ok ? (st.kind === 'number' ? 'TOP3入り！' : '正解！') : (st.kind === 'number' ? '惜しい！' : '不正解…')) + '</div>');
    var extra = S.phase === 'survived' ? '<h1 class="big neon pop" style="--glow:var(--yellow)">' + (me.out ? '健闘！' : '生き残り！') + '</h1>' : '';
    return '<div class="sub">正解</div><h1 class="big neon" style="--glow:var(--green);color:var(--green)">' + escH(txt) + '</h1>' + mine + extra + (q.note ? '<div class="sub">' + escH(q.note) + '</div>' : '');
  }

  function yen(n){ return Math.round(n || 0).toLocaleString('ja-JP'); }
  function mLabel(mo){ return mo.m + '月度' + (mo.partial ? '<span style="color:var(--mute);font-size:11px">（集計中）</span>' : ''); }
  var PRIV = '<div class="priv">この画面は、あなたのスマホにだけ表示されています</div>';
  // 月度ごとの平均売上の棒グラフ（SVG）。棒の上に前月比
  function growthChart(ms){
    var W = 340, H = 180, pad = 26, n = ms.length, max = Math.max.apply(null, ms.map(function(x){ return x.avg; })) || 1, bw = Math.min(46, (W - pad * 2) / n - 10);
    var bars = ms.map(function(x, i){
      var cx = pad + (W - pad * 2) * (i + 0.5) / n, h = Math.max(4, (H - 60) * x.avg / max), y = H - 24 - h;
      var col = x.partial ? 'rgba(255,255,255,.25)' : (x.rate == null || x.rate >= 0 ? 'url(#gUp)' : 'url(#gDn)');
      return '<rect x="' + (cx - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + h + '" rx="6" fill="' + col + '"/>'
        + '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#9a95c4">' + x.m + '月</text>'
        + (x.rate != null ? '<text x="' + cx + '" y="' + (y - 6) + '" text-anchor="middle" font-size="11" font-weight="900" fill="' + (x.rate >= 0 ? '#7cff6b' : '#ff3b6b') + '">' + (x.rate >= 0 ? '+' : '') + x.rate + '%</text>' : '');
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="max-width:420px"><defs><linearGradient id="gUp" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2fd3ff"/><stop offset="1" stop-color="#7cff6b"/></linearGradient><linearGradient id="gDn" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#9b6bff"/><stop offset="1" stop-color="#ff3b6b"/></linearGradient></defs>' + bars + '</svg>';
  }
  function growthView(){
    var d = S.mine;
    if (!d) return '<div class="center">' + head() + '<div class="sub blink">データを読み込み中…</div></div>';
    var ms = d.months || [];
    if (!ms.length) return '<div class="center">' + head() + '<h1 class="big">まだ売上データがありません</h1><div class="sub">乗務が始まると、ここに成長の記録が出ます</div>' + PRIV + '</div>';
    var done = ms.filter(function(x){ return !x.partial; }), last = done[done.length - 1] || ms[ms.length - 1], first = ms[0];
    var rate = last.rate, up = rate == null || rate >= 0;
    var msg = rate == null ? 'ここからスタート！' : rate >= 20 ? '絶好調！ぐんぐん伸びてる！' : rate >= 0 ? '着実にレベルアップ中！' : 'ここから巻き返そう！';
    var times = first.avg ? Math.round(last.avg / first.avg * 10) / 10 : null;
    return '<div class="center" style="justify-content:flex-start">' + head() + '<div class="stepLbl">YOUR GROWTH</div>'
      + '<div class="sub" style="color:var(--ink)">' + escH(S.me.name) + ' さんの 1乗務あたり平均売上</div>'
      + '<div class="sub">' + last.m + '月度の前月比</div>'
      + '<div class="big2 neon pop ' + (up ? 'up' : 'down') + '">' + (rate == null ? '―' : (rate >= 0 ? '+' : '') + rate + '%') + '</div>'
      + '<h1 class="big" style="font-size:22px">' + msg + '</h1>'
      + (times && ms.length > 1 ? '<div class="sub">' + first.m + '月度 ' + yen(first.avg) + '円 → ' + last.m + '月度 ' + yen(last.avg) + '円<br>はじめの月度の <b class="num" style="color:var(--yellow)">' + times + '</b> 倍に！</div>' : '')
      + '<div class="card" style="padding:10px">' + growthChart(ms) + '</div>'
      + '<div class="card" style="padding:0">' + ms.map(function(x){ return '<div class="mrow"><span>' + mLabel(x) + '</span><span class="num">' + yen(x.avg) + '円<span style="color:var(--mute);font-size:11px">（' + x.n + '乗務）</span></span><span class="r ' + (x.rate == null ? '' : x.rate >= 0 ? 'up' : 'down') + '">' + (x.rate == null ? '―' : (x.rate >= 0 ? '+' : '') + x.rate + '%') + '</span></div>'; }).join('') + '</div>'
      + '<button class="btn" id="dlPdf">PDFでダウンロード</button>'
      + '<div class="sub" style="font-size:11px">平均＝その月度の売上合計 ÷ 乗務した日数。データ最終日 ' + escH(d.latest || '') + '</div>' + PRIV + '</div>';
  }
  function salesView(){
    var d = S.mine;
    if (!d) return '<div class="center">' + head() + '<div class="sub blink">データを読み込み中…</div></div>';
    var days = d.days || [], ms = d.months || [];
    if (!days.length) return '<div class="center">' + head() + '<h1 class="big">まだ売上データがありません</h1>' + PRIV + '</div>';
    var total = days.reduce(function(a, x){ return a + x.amount; }, 0), best = days.reduce(function(a, x){ return x.amount > a.amount ? x : a; }, days[0]);
    var rows = days.slice().reverse().map(function(x){ return '<tr><td>' + escH(x.date.slice(5).replace('-', '/')) + '</td><td>' + escH(x.duty || '') + '</td><td class="n">' + yen(x.amount) + '</td><td class="n">' + (x.rides == null ? '' : x.rides) + '</td><td class="n">' + (x.km == null ? '' : x.km) + '</td><td>' + escH((x.start || '') + (x.ret ? '〜' + x.ret : '')) + '</td></tr>'; }).join('');
    return '<div class="center" style="justify-content:flex-start">' + head() + '<div class="stepLbl">MY SALES</div>'
      + '<div class="sub" style="color:var(--ink)">' + escH(S.me.name) + ' さんの売上記録</div>'
      + '<div class="card" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;text-align:center"><div><div class="sub" style="margin:0;font-size:11px">乗務数</div><div class="num" style="font-size:22px">' + days.length + '</div></div><div><div class="sub" style="margin:0;font-size:11px">累計</div><div class="num" style="font-size:18px">' + yen(total) + '</div></div><div><div class="sub" style="margin:0;font-size:11px">最高（' + escH(best.date.slice(5).replace('-', '/')) + '）</div><div class="num" style="font-size:18px;color:var(--yellow)">' + yen(best.amount) + '</div></div></div>'
      + trendChart(days, ms)
      + '<div class="card" style="padding:0">' + ms.map(function(x){ return '<div class="mrow"><span>' + mLabel(x) + '</span><span class="num">計 ' + yen(x.sum) + '円</span><span class="num" style="font-size:12px;color:var(--mute)">平均 ' + yen(x.avg) + '</span></div>'; }).join('') + '</div>'
      + '<div class="scrollbox"><table class="dtbl"><tr><th>日付</th><th>勤務</th><th style="text-align:right">売上(円)</th><th style="text-align:right">回数</th><th style="text-align:right">km</th><th>出庫〜帰庫</th></tr>' + rows + '</table></div>'
      + '<button class="btn" id="dlPdf">PDFでダウンロード</button><button class="btn alt" id="dlCsv">CSVでダウンロード</button><div class="sub" style="font-size:11px">LINEの中で開いている場合は、右上のメニューから「ブラウザで開く」にしてから保存してください</div>' + PRIV + '</div>';
  }
  // 売上の推移グラフ。日ごと＝1乗務ごとの棒＋直近5乗務の平均線、月度ごと＝合計の棒。棒をタップすると金額を表示
  function trendChart(days, months, forceMode, forPdf){
    var W = 360, H = 220, L = 34, R = 8, T = 30, B = 26, iw = W - L - R, ih = H - T - B;
    var mode = forceMode || draft.chart, sel = forceMode ? -1 : sel, pts = mode === 'day' ? days.map(function(x){ return { v: x.amount, lab: x.date.slice(5).replace('-', '/'), key: x.py + '-' + x.pm }; })
      : months.map(function(x){ return { v: x.sum, lab: x.m + '月度', key: x.y + '-' + x.m, part: x.partial, n: x.n }; });
    if (!pts.length) return '';
    var max = Math.max.apply(null, pts.map(function(p){ return p.v; })) || 1;
    var step = max > 400000 ? 200000 : max > 200000 ? 100000 : max > 80000 ? 20000 : 10000, top = Math.ceil(max / step) * step;
    var y = function(v){ return T + ih - ih * v / top; }, bw = iw / pts.length;
    var g = '';
    for (var v = 0; v <= top; v += step) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="rgba(255,255,255,.08)"/><text x="' + (L - 4) + '" y="' + (y(v) + 3) + '" text-anchor="end" font-size="9" fill="#9a95c4">' + (v / 10000) + '万</text>';
    var keys = [], bars = '';
    pts.forEach(function(p, i){
      if (keys.indexOf(p.key) < 0) keys.push(p.key);
      var odd = keys.indexOf(p.key) % 2, x = L + i * bw, h = Math.max(1, ih * p.v / top), sel = sel === i;
      var col = mode === 'day' ? (odd ? '#9b6bff' : '#2fd3ff') : (p.part ? 'rgba(255,255,255,.3)' : 'url(#tg)');
      bars += '<rect data-bar="' + i + '" x="' + (x + bw * 0.12) + '" y="' + y(p.v) + '" width="' + Math.max(1, bw * 0.76) + '" height="' + h + '" rx="' + Math.min(4, bw * 0.3) + '" fill="' + col + '"' + (sel ? ' stroke="#fff" stroke-width="1.5"' : '') + ' opacity="' + (sel >= 0 && !sel ? 0.55 : 1) + '"/>';
    });
    var line = '';
    if (mode === 'day' && pts.length > 2) {
      var avgPts = pts.map(function(p, i){ var a = pts.slice(Math.max(0, i - 4), i + 1); var m = a.reduce(function(s, q){ return s + q.v; }, 0) / a.length; return (L + i * bw + bw / 2) + ',' + y(m); });
      line = '<polyline points="' + avgPts.join(' ') + '" fill="none" stroke="#ffd23f" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" style="filter:drop-shadow(0 0 4px rgba(255,210,63,.7))"/>';
    }
    var labs = '';
    if (mode === 'day') {
      var seen = {};
      pts.forEach(function(p, i){ if (!seen[p.key]) { seen[p.key] = 1; var mm = p.key.split('-')[1]; labs += '<line x1="' + (L + i * bw) + '" x2="' + (L + i * bw) + '" y1="' + T + '" y2="' + (T + ih) + '" stroke="rgba(255,255,255,.15)" stroke-dasharray="2 3"/><text x="' + (L + i * bw + 3) + '" y="' + (H - 8) + '" font-size="10" fill="#9a95c4">' + mm + '月度</text>'; } });
    } else {
      pts.forEach(function(p, i){ labs += '<text x="' + (L + i * bw + bw / 2) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="#9a95c4">' + p.lab + '</text><text x="' + (L + i * bw + bw / 2) + '" y="' + (y(p.v) - 5) + '" text-anchor="middle" font-size="9.5" font-weight="900" fill="#f4f2ff">' + Math.round(p.v / 1000) / 10 + '万</text>'; });
    }
    var info = sel >= 0 && pts[sel] ? '<b style="color:var(--yellow)">' + escH(pts[sel].lab) + '</b>　' + yen(pts[sel].v) + '円' + (mode === 'month' ? '（' + pts[sel].n + '乗務）' : '') : (mode === 'day' ? '棒をタップすると金額が出ます　<span style="color:var(--yellow)">━</span> 直近5乗務の平均' : '月度ごとの売上合計（棒をタップで詳細）');
    var svg = '<svg' + (forPdf ? '' : ' id="trend"') + ' viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;touch-action:manipulation"><defs><linearGradient id="tg' + (forPdf ? mode : '') + '" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2fd3ff"/><stop offset="1" stop-color="#ff3b6b"/></linearGradient></defs>' + g + bars.split('url(#tg)').join('url(#tg' + (forPdf ? mode : '') + ')') + line + labs + '</svg>';
    if (forPdf) return '<div class="card" style="padding:12px 10px"><div class="stepLbl" style="margin-bottom:6px">' + (mode === 'day' ? 'DAILY TREND　日ごとの推移（黄色の線＝直近5乗務の平均）' : 'MONTHLY TREND　月度ごとの売上合計') + '</div>' + svg + '</div>';
    return '<div class="card" style="padding:10px 8px">'
      + '<div style="display:flex;gap:6px;justify-content:center;margin-bottom:6px"><button class="b2 ' + (mode === 'day' ? 'on' : '') + '" data-chart="day">日ごとの推移</button><button class="b2 ' + (mode === 'month' ? 'on' : '') + '" data-chart="month">月度ごとの推移</button></div>'
      + svg
      + '<div class="sub" style="font-size:12px;margin-top:4px;min-height:18px">' + info + '</div></div>';
  }

  // ---- PDF（今の画面デザインのまま A4 に。html2canvas で描いて jsPDF でページ分割） ----
  function loadLib(src, globalName){
    return new Promise(function(res, rej){
      if (window[globalName]) return res();
      var sc = document.createElement('script'); sc.src = src; sc.onload = function(){ res(); }; sc.onerror = function(){ rej(new Error('PDF作成ツールの読み込みに失敗しました。通信状況を確認してください')); };
      document.head.appendChild(sc);
    });
  }
  function reportHtml(){
    var d = S.mine || {}, ms = d.months || [], days = d.days || [], now = new Date();
    var done = ms.filter(function(x){ return !x.partial; }), last = done[done.length - 1] || ms[ms.length - 1], first = ms[0];
    var h = '<div style="display:flex;align-items:center;gap:10px;padding:4px 2px 14px;border-bottom:1px solid var(--line)"><span class="logo neon" style="font-family:var(--num);font-weight:900;font-size:15px;letter-spacing:.12em;--glow:var(--pink)">ITABASHI <b style="color:var(--pink)">BATTLE 2</b></span><span style="margin-left:auto;font-size:11px;color:var(--mute)">' + now.getFullYear() + '/' + (now.getMonth() + 1) + '/' + now.getDate() + ' 作成</span></div>';
    h += '<div style="text-align:center;padding:18px 0 6px"><div class="stepLbl">SALES REPORT</div><h1 class="big" style="margin-top:6px">' + escH(S.me.name) + ' さんの売上レポート</h1><div class="sub">データ最終日 ' + escH(d.latest || '') + '</div></div>';
    if (last) {
      var rate = last.rate, up = rate == null || rate >= 0, times = first && first.avg ? Math.round(last.avg / first.avg * 10) / 10 : null;
      h += '<div class="card" style="text-align:center;margin-bottom:12px"><div class="sub" style="margin:0">' + last.m + '月度の前月比（1乗務あたり平均売上）</div><div class="big2 neon ' + (up ? 'up' : 'down') + '" style="margin:8px 0">' + (rate == null ? '―' : (rate >= 0 ? '+' : '') + rate + '%') + '</div>'
        + (times && ms.length > 1 ? '<div class="sub" style="margin:0">' + first.m + '月度 ' + yen(first.avg) + '円 → ' + last.m + '月度 ' + yen(last.avg) + '円（はじめの月度の <b class="num" style="color:var(--yellow)">' + times + '</b> 倍）</div>' : '') + '</div>';
    }
    if (days.length) {
      var total = days.reduce(function(a, x){ return a + x.amount; }, 0), best = days.reduce(function(a, x){ return x.amount > a.amount ? x : a; }, days[0]);
      h += '<div class="card" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;text-align:center;margin-bottom:12px"><div><div class="sub" style="margin:0;font-size:11px">乗務数</div><div class="num" style="font-size:22px">' + days.length + '</div></div><div><div class="sub" style="margin:0;font-size:11px">累計</div><div class="num" style="font-size:18px">' + yen(total) + '</div></div><div><div class="sub" style="margin:0;font-size:11px">最高（' + escH(best.date.slice(5).replace('-', '/')) + '）</div><div class="num" style="font-size:18px;color:var(--yellow)">' + yen(best.amount) + '</div></div></div>';
      h += '<div style="margin-bottom:12px">' + trendChart(days, ms, 'day', true) + '</div><div style="margin-bottom:12px">' + trendChart(days, ms, 'month', true) + '</div>';
    }
    if (ms.length) {
      h += '<div class="card" style="padding:12px 10px;margin-bottom:12px"><div class="stepLbl" style="margin-bottom:6px">GROWTH　1乗務あたり平均売上と前月比</div>' + growthChart(ms) + '</div>';
      h += '<div class="card" style="padding:0;margin-bottom:12px">' + ms.map(function(x){ return '<div class="mrow"><span>' + mLabel(x) + '</span><span class="num">平均 ' + yen(x.avg) + '円<span style="color:var(--mute);font-size:11px">（' + x.n + '乗務・計 ' + yen(x.sum) + '円）</span></span><span class="r ' + (x.rate == null ? '' : x.rate >= 0 ? 'up' : 'down') + '">' + (x.rate == null ? '―' : (x.rate >= 0 ? '+' : '') + x.rate + '%') + '</span></div>'; }).join('') + '</div>';
    }
    if (days.length) {
      h += '<div class="card" style="padding:0"><table class="dtbl"><tr><th>日付</th><th>月度</th><th>勤務</th><th style="text-align:right">売上(円)</th><th style="text-align:right">回数</th><th style="text-align:right">km</th><th>出庫〜帰庫</th></tr>'
        + days.map(function(x){ return '<tr><td>' + escH(x.date.replace(/-/g, '/')) + '</td><td>' + x.pm + '月度</td><td>' + escH(x.duty || '') + '</td><td class="n">' + yen(x.amount) + '</td><td class="n">' + (x.rides == null ? '' : x.rides) + '</td><td class="n">' + (x.km == null ? '' : x.km) + '</td><td>' + escH((x.start || '') + (x.ret ? '〜' + x.ret : '')) + '</td></tr>'; }).join('') + '</table></div>';
    }
    h += '<div class="priv" style="margin-top:14px">このレポートは ' + escH(S.me.name) + ' さん本人の売上データです</div>';
    return h;
  }
  function buildPdf(){
    return loadLib('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', 'html2canvas')
      .then(function(){ return loadLib('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf'); })
      .then(function(){ return document.fonts && document.fonts.ready; })
      .then(function(){
        var box = document.createElement('div');
        box.style.cssText = 'position:absolute;left:-10000px;top:0;width:760px;padding:28px 30px 34px;color:#f4f2ff;font-family:var(--jp);font-weight:700;'
          + 'background:radial-gradient(60% 18% at 15% 3%,rgba(155,107,255,.30),transparent 70%),radial-gradient(55% 16% at 90% 12%,rgba(255,59,107,.20),transparent 70%),radial-gradient(60% 20% at 80% 60%,rgba(47,211,255,.16),transparent 70%),#07060f;';
        box.innerHTML = reportHtml();
        document.body.appendChild(box);
        // ページの切れ目にしてよい位置（カード・表の行・月度の行の下端）を先に測っておく
        var top0 = box.getBoundingClientRect().top, breaks = [];
        Array.prototype.forEach.call(box.querySelectorAll('.card, .dtbl tr:not(:first-child), .mrow'), function(el){ breaks.push(el.getBoundingClientRect().bottom - top0 + 6); });
        breaks.sort(function(a, b){ return a - b; });
        var cssW = box.offsetWidth, cssH = box.offsetHeight;
        return window.html2canvas(box, { scale: 2, backgroundColor: '#07060f', logging: false }).then(function(cv){ box.remove(); return { cv: cv, breaks: breaks, cssW: cssW, cssH: cssH }; }, function(e){ box.remove(); throw e; });
      })
      .then(function(r){
        var cv = r.cv, k = cv.width / r.cssW;
        var pdf = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
        var pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
        var pageCss = r.cssW * ph / pw, padCss = 24, start = 0, page = 0;
        while (start < r.cssH - 1) {
          var room = pageCss - (page ? padCss : 0), limit = start + room, cut = limit;
          if (limit < r.cssH) {
            var ok = r.breaks.filter(function(b){ return b > start + 40 && b <= limit; });
            if (ok.length) cut = ok[ok.length - 1];
          } else cut = r.cssH;
          var c = document.createElement('canvas');
          c.width = cv.width; c.height = Math.round(pageCss * k);
          var g = c.getContext('2d'); g.fillStyle = '#07060f'; g.fillRect(0, 0, c.width, c.height);
          var sy = Math.round(start * k), sh = Math.round((cut - start) * k);
          g.drawImage(cv, 0, sy, cv.width, sh, 0, page ? Math.round(padCss * k) : 0, cv.width, sh);
          if (page) pdf.addPage();
          pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, ph);
          start = cut; page++;
          if (page > 40) break;
        }
        return pdf;
      });
  }
  window.IB2PDF = buildPdf;
  function downloadPdf(btn){
    btn.disabled = true; var t = btn.textContent; btn.textContent = 'PDFを作成中…';
    buildPdf().then(function(pdf){
      var now = new Date();
      pdf.save('売上レポート_' + S.me.name.split(' ').join('') + '_' + now.getFullYear() + ('0' + (now.getMonth() + 1)).slice(-2) + ('0' + now.getDate()).slice(-2) + '.pdf');
    }).catch(function(e){ alert((e && e.message) || 'PDFの作成に失敗しました'); }).then(function(){ btn.disabled = false; btn.textContent = t; });
  }

  function downloadCsv(){
    var d = S.mine; if (!d || !d.days) return;
    var NL = String.fromCharCode(13) + String.fromCharCode(10);
    var head = ['日付', '月度', '勤務', '売上(円)', '回数', '距離(km)', '出庫', '帰庫', '実労働(時間)'];
    var lines = [head.join(',')].concat(d.days.map(function(x){ return [x.date, x.py + '年' + x.pm + '月度', x.duty || '', x.amount, x.rides == null ? '' : x.rides, x.km == null ? '' : x.km, x.start || '', x.ret || '', x.hours == null ? '' : x.hours].join(','); }));
    lines.push('');
    lines.push(['月度', '乗務数', '売上合計(円)', '1乗務平均(円)', '前月比(%)'].join(','));
    (d.months || []).forEach(function(x){ lines.push([x.y + '年' + x.m + '月度' + (x.partial ? '（集計中）' : ''), x.n, x.sum, x.avg, x.rate == null ? '' : x.rate].join(',')); });
    var blob = new Blob([String.fromCharCode(0xfeff) + lines.join(NL)], { type: 'text/csv' });
    var a = document.createElement('a'), now = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = '売上_' + S.me.name.split(' ').join('') + '_' + now.getFullYear() + ('0' + (now.getMonth() + 1)).slice(-2) + ('0' + now.getDate()).slice(-2) + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function qboxView(){
    var open = S.phase === 'open';
    var list = (S.qbox || []).map(function(x){ return '<div class="qi"><span>' + escH(x.text) + '</span>' + (x.mine ? '<b class="num" style="color:var(--mute)">♥' + x.likes + '</b>' : '<button data-like="' + x.id + '" class="' + (x.liked ? 'on' : '') + '">聞きたい ' + x.likes + '</button>') + '</div>'; }).join('');
    return '<div class="center" style="justify-content:flex-start">' + head() + '<h1 class="big">質問箱</h1>'
      + (open ? '<div class="card"><textarea class="txt" id="qt" maxlength="120" placeholder="先輩に聞きたいことを書こう"></textarea><button class="btn alt" id="sendQ" style="margin-top:10px">送信</button></div>' : '<div class="sub">受付は終了しました</div>')
      + '<div class="qlist">' + list + '</div></div>';
  }

  function send(o){ if (!IB2N.send(o)) alert('通信が切れています。少し待ってからもう一度押してください'); }
  function bind(){
    Array.prototype.forEach.call(app.querySelectorAll('[data-leader]'), function(b){ b.onclick = function(){ draft.leader = b.getAttribute('data-leader'); lastHtml = ''; render(); }; });
    var sl = document.getElementById('sendLeader'); if (sl) sl.onclick = function(){ send({ t: 'leader', emp: draft.leader }); };
    var sn = document.getElementById('sendName'); if (sn) sn.onclick = function(){ var v = document.getElementById('tname').value.trim(); if (v) send({ t: 'teamname', name: v }); };
    var bz = document.getElementById('buzz');
    if (bz) bz.addEventListener('pointerdown', function(e){ e.preventDefault(); var ms = Math.round(performance.now() - shownAt); bz.disabled = true; IB2A.unlock(); IB2A.sfx('buzz', S && S.me ? S.me.team : null); vib(80); send({ t: 'buzz', ms: ms }); });
    Array.prototype.forEach.call(app.querySelectorAll('[data-ans]'), function(b){ b.onclick = function(){ var ms = Math.round(performance.now() - shownAt); b.classList.add('sel'); Array.prototype.forEach.call(app.querySelectorAll('[data-ans]'), function(x){ x.disabled = true; }); vib(30); send({ t: 'answer', a: b.getAttribute('data-ans'), ms: ms }); }; });
    var ni = document.getElementById('numIn'); if (ni) ni.oninput = function(){ draft.num = ni.value; };
    var sn2 = document.getElementById('sendNum'); if (sn2) sn2.onclick = function(){ var v = (ni.value || '').trim(); if (!v) return; send({ t: 'answer', a: v, ms: Math.round(performance.now() - shownAt) }); };
    Array.prototype.forEach.call(app.querySelectorAll('[data-up],[data-dn]'), function(b){ b.onclick = function(){
      var up = b.hasAttribute('data-up'), p = Number(b.getAttribute(up ? 'data-up' : 'data-dn')), o = draft.order, j = up ? p - 1 : p + 1;
      if (j < 0 || j >= o.length) return; var t = o[p]; o[p] = o[j]; o[j] = t; vib(15); lastHtml = ''; render(); }; });
    var so = document.getElementById('sendOrd'); if (so) so.onclick = function(){ send({ t: 'answer', a: draft.order.join(','), ms: Math.round(performance.now() - shownAt) }); };
    var sq = document.getElementById('sendQ'); if (sq) sq.onclick = function(){ var v = document.getElementById('qt').value.trim(); if (v) { send({ t: 'q', text: v }); document.getElementById('qt').value = ''; } };
    var dl = document.getElementById('dlCsv'); if (dl) dl.onclick = downloadCsv;
    var dp = document.getElementById('dlPdf'); if (dp) dp.onclick = function(){ downloadPdf(dp); };
    Array.prototype.forEach.call(app.querySelectorAll('[data-chart]'), function(b){ b.onclick = function(){ draft.chart = b.getAttribute('data-chart'); draft.sel = -1; lastHtml = ''; render(); }; });
    var tr = document.getElementById('trend');
    if (tr) tr.addEventListener('click', function(e){
      var t = e.target && e.target.getAttribute ? e.target.getAttribute('data-bar') : null, i;
      if (t != null) i = Number(t);
      else { var r = tr.getBoundingClientRect(), bars = tr.querySelectorAll('[data-bar]'); if (!bars.length) return; var x = (e.clientX - r.left) / r.width * 360; i = Math.max(0, Math.min(bars.length - 1, Math.floor((x - 34) / ((360 - 42) / bars.length)))); }
      draft.sel = draft.sel === i ? -1 : i; lastHtml = ''; render();
    });
    Array.prototype.forEach.call(app.querySelectorAll('[data-like]'), function(b){ b.onclick = function(){ send({ t: 'like', id: Number(b.getAttribute('data-like')) }); }; });
  }

  token = store(KEY);
  if (token) start(); else joinView('');
})();
</script></body></html>`;
}
