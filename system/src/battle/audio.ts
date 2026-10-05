// ITABASHI BATTLE 2 — 効果音・BGM（ブラウザの Web Audio で合成。音源ファイル不要）
//   IB2A.unlock()            … 最初のタップで音を有効化（ブラウザの自動再生制限のため）
//   IB2A.sfx(name)           … buzz/correct/wrong/start/timeup/tick/whoosh/pop/score/reveal/drumroll/fanfare/fanfare_short
//   IB2A.bgm(key, base)      … 'builtin:lobby|battle|think|result' は内蔵曲、'media:<id>' は管理画面でアップした曲、null で停止
//   IB2A.vol(bgm, sfx)       … 音量（0〜1）
// テンプレートリテラルに埋め込むため、バックスラッシュ・バッククォート・ドル波括弧は使わない。
export const BATTLE_AUDIO_JS = `
var IB2A = (function(){
  var ctx = null, master = null, sfxBus = null, bgmBus = null;
  var curKey = null, seqTimer = null, step = 0, nextT = 0, track = null, audioEl = null;
  var volB = 0.55, volS = 0.9;
  function unlock(){
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
      var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = volS; sfxBus.connect(comp);
      bgmBus = ctx.createGain(); bgmBus.gain.value = volB; bgmBus.connect(comp);
    }
    if (ctx.state === 'suspended') ctx.resume();
    if (curKey && !seqTimer && !audioEl) { var k = curKey; curKey = null; bgm(k, lastBase); }
  }
  function ready(){ return ctx && ctx.state === 'running'; }
  function env(g, t0, a, d, peak, end){
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, end || 0.0001), t0 + a + d);
  }
  function tone(f, t0, dur, type, vol, dest, f2, filt){
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    env(g, t0, 0.005, dur, vol, 0.0001);
    if (filt) { var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = filt; o.connect(lp); lp.connect(g); }
    else o.connect(g);
    g.connect(dest || sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  var noiseBuf = null;
  function noise(t0, dur, vol, type, freq, dest, f2){
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = type || 'highpass'; f.frequency.setValueAtTime(freq || 1000, t0);
    if (f2) f.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    env(g, t0, 0.003, dur, vol, 0.0001);
    s.connect(f); f.connect(g); g.connect(dest || sfxBus);
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }
  function chord(fs, t0, dur, type, vol, dest, filt){ fs.forEach(function(f){ tone(f, t0, dur, type, vol / fs.length, dest, 0, filt); }); }

  function sweep(f1, f2, t0, dur, type, vol, filt){ tone(f1, t0, dur, type, vol, null, f2, filt); }
  function clap(t, v){ for (var i = 0; i < 3; i++) noise(t + i * 0.011, 0.05, v, 'bandpass', 1300); noise(t + 0.03, 0.12, v * 0.6, 'bandpass', 1100); }
  function arp(fs, t, step, dur, type, vol, filt){ fs.forEach(function(f, i){ tone(f, t + i * step, dur, type, vol, null, 0, filt); }); }
  // 歓声：帯域を絞ったノイズを細かく揺らして、ざわめきに聞かせる
  function crowd(t, dur, vol){
    for (var i = 0; i < dur / 0.06; i++) { var tt = t + i * 0.06; noise(tt, 0.12, vol * (0.55 + Math.random() * 0.45) * Math.min(1, (dur - i * 0.06) / 0.6 + 0.2), 'bandpass', 700 + Math.random() * 1500); }
  }
  var C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, G6 = 1568, C7 = 2093;

  var SFX = {
    // ---- 早押し（チームごとに音色が違う） ----
    buzz: function(t){ noise(t, 0.09, 0.9, 'highpass', 2500); tone(1400, t, 0.18, 'square', 0.35, null, 700); tone(2100, t + 0.02, 0.12, 'sawtooth', 0.15); },
    buzzA: function(t){ sweep(2400, 300, t, 0.22, 'sawtooth', 0.4, 5000); noise(t, 0.06, 0.6, 'highpass', 4000); tone(1800, t, 0.12, 'square', 0.15); },
    buzzB: function(t){ tone(988, t, 0.08, 'square', 0.32, null, 0, 6000); tone(1319, t + 0.08, 0.3, 'square', 0.32, null, 0, 6000); },
    buzzC: function(t){ tone(110, t, 0.35, 'sine', 0.9, null, 55); noise(t, 0.05, 0.5, 'lowpass', 900); tone(220, t, 0.08, 'triangle', 0.4); },
    buzzD: function(t){ chord([392, 493.88, 587.33, 784], t, 0.28, 'sawtooth', 0.6, null, 2600); noise(t, 0.05, 0.4, 'highpass', 3000); },
    // ---- 正解 ----
    correct1: function(t){ tone(E6, t, 0.22, 'sine', 0.6); tone(2637, t, 0.15, 'sine', 0.12); tone(C6, t + 0.2, 0.7, 'sine', 0.6); tone(C7, t + 0.2, 0.4, 'sine', 0.12); },
    correct2: function(t){ arp([C6, E6, G6, C7, E6 * 2], t, 0.05, 0.25, 'triangle', 0.32); noise(t + 0.2, 0.4, 0.12, 'highpass', 8000); },
    correct3: function(t){ chord([C5, E5, G5], t, 0.12, 'sawtooth', 0.45, null, 3200); chord([C6, E6, G6], t + 0.15, 0.6, 'sawtooth', 0.5, null, 3600); tone(C5 / 2, t + 0.15, 0.6, 'square', 0.25, null, 0, 900); },
    // ---- 不正解 ----
    wrong1: function(t){ tone(150, t, 0.28, 'square', 0.35, null, 0, 900); tone(150, t + 0.33, 0.45, 'square', 0.35, null, 0, 900); tone(75, t, 0.8, 'sawtooth', 0.2, null, 0, 400); },
    wrong2: function(t){ tone(392, t, 1.4, 'sine', 0.5); tone(784.6, t, 0.9, 'sine', 0.12); tone(1180, t, 0.5, 'sine', 0.06); },
    wrong3: function(t){ sweep(1400, 180, t, 0.7, 'sine', 0.45); tone(90, t + 0.65, 0.25, 'sine', 0.7, null, 50); noise(t + 0.65, 0.12, 0.4, 'lowpass', 600); },
    trombone: function(t){ [[311.13, 0], [293.66, 0.35], [277.18, 0.7], [261.63, 1.05]].forEach(function(n, i){ tone(n[0], t + n[1], i === 3 ? 1.1 : 0.32, 'sawtooth', 0.35, null, i === 3 ? n[0] * 0.94 : 0, 1400); }); },
    // ---- 出題・スタート・カウント ----
    quizIntro: function(t){ noise(t, 0.08, 0.6, 'highpass', 3000); chord([293.66, 369.99, 440, 587.33], t, 0.35, 'sawtooth', 0.6, null, 3000); tone(73.4, t, 0.5, 'sine', 0.8, null, 60); },
    start: function(t){ noise(t, 0.35, 0.35, 'bandpass', 600, null, 6000); chord([C5, E5, G5, C6], t + 0.3, 0.6, 'sawtooth', 0.45, null, 3000); tone(C6, t + 0.3, 0.6, 'square', 0.15); },
    gong: function(t){ [130.8, 196.2, 293.7, 351.2, 523.3].forEach(function(f, i){ tone(f, t, 2.6 - i * 0.3, 'sine', 0.35 / (i + 1)); }); noise(t, 0.4, 0.25, 'bandpass', 900); },
    count: function(t){ tone(880, t, 0.12, 'square', 0.25, null, 0, 3000); },
    go: function(t){ tone(1760, t, 0.5, 'square', 0.28, null, 0, 4000); tone(880, t, 0.5, 'square', 0.12, null, 0, 3000); },
    countdown: function(t){ [0, 1, 2].forEach(function(i){ tone(880, t + i, 0.12, 'square', 0.25, null, 0, 3000); }); tone(1760, t + 3, 0.6, 'square', 0.3, null, 0, 4000); },
    tick: function(t){ tone(1600, t, 0.04, 'square', 0.18, null, 0, 4000); },
    ticktock: function(t){ for (var i = 0; i < 8; i++) tone(i % 2 ? 1100 : 1500, t + i * 0.5, 0.05, 'square', 0.12, null, 0, 5000); },
    timeup1: function(t){ tone(880, t, 0.12, 'square', 0.3); tone(880, t + 0.18, 0.12, 'square', 0.3); tone(440, t + 0.36, 0.7, 'square', 0.35, null, 0, 1500); },
    timeup2: function(t){ SFX.gong(t); },
    whistle: function(t){ var o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain(); o.type = 'sine'; o.frequency.value = 2900; l.frequency.value = 38; lg.gain.value = 120; l.connect(lg); lg.connect(o.frequency); env(g, t, 0.01, 0.7, 0.3, 0.0001); o.connect(g); g.connect(sfxBus); o.start(t); l.start(t); o.stop(t + 0.75); l.stop(t + 0.75); },
    // ---- 発表・演出 ----
    reveal1: function(t){ noise(t, 0.25, 0.25, 'highpass', 6000); chord([E5, 830.61, 987.77, E6], t + 0.05, 0.9, 'triangle', 0.5); },
    reveal2: function(t){ sweep(800, 5000, t, 0.25, 'sawtooth', 0.2, 6000); noise(t, 0.3, 0.3, 'highpass', 5000, null, 12000); tone(2637, t + 0.22, 0.6, 'sine', 0.25); tone(3951, t + 0.22, 0.4, 'sine', 0.1); },
    drumroll: function(t){
      for (var i = 0; i < 44; i++) { var tt = t + i * 0.055; noise(tt, 0.06, 0.12 + i * 0.012, 'bandpass', 1800); }
      noise(t + 44 * 0.055, 1.2, 0.7, 'highpass', 4000); tone(98, t + 44 * 0.055, 0.6, 'sine', 0.6, null, 40);
    },
    heartbeat: function(t){ for (var i = 0; i < 4; i++) { tone(60, t + i * 0.8, 0.14, 'sine', 0.9, null, 40); tone(55, t + i * 0.8 + 0.2, 0.18, 'sine', 0.7, null, 38); } },
    tension: function(t){ sweep(110, 440, t, 3, 'sawtooth', 0.22, 1200); sweep(116, 466, t, 3, 'sawtooth', 0.18, 1200); noise(t, 3, 0.08, 'bandpass', 400, null, 3000); },
    taiko: function(t){ [0, 0.18, 0.5].forEach(function(d, i){ tone(i === 2 ? 70 : 95, t + d, 0.45, 'sine', 1, null, 45); noise(t + d, 0.06, 0.5, 'lowpass', 800); }); },
    explosion: function(t){ noise(t, 1.6, 1, 'lowpass', 2400, null, 120); tone(70, t, 0.9, 'sine', 0.9, null, 30); noise(t, 0.15, 0.6, 'highpass', 2000); },
    laser: function(t){ sweep(3200, 200, t, 0.3, 'square', 0.25, 6000); sweep(3000, 180, t + 0.12, 0.3, 'square', 0.18, 6000); },
    boing: function(t){ var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(520, t + 0.12); o.frequency.exponentialRampToValueAtTime(240, t + 0.45); env(g, t, 0.005, 0.5, 0.5, 0.0001); o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.55); },
    horn: function(t){ [0, 0.22].forEach(function(d){ tone(330, t + d, 0.16, 'sawtooth', 0.4, null, 0, 1600); tone(331.5, t + d, 0.16, 'square', 0.2, null, 0, 1200); }); },
    reversal: function(t){ for (var i = 0; i < 3; i++) sweep(400, 1600, t + i * 0.28, 0.26, 'sawtooth', 0.28, 3500); chord([C6, E6, G6], t + 0.9, 0.6, 'square', 0.4, null, 4000); },
    bell: function(t){ tone(C7, t, 1.2, 'sine', 0.4); tone(C7 * 2.76, t, 0.4, 'sine', 0.08); },
    chime: function(t){ [E5, C5, 587.33, 392].forEach(function(f, i){ tone(f, t + i * 0.45, 1.1, 'sine', 0.4); tone(f * 2, t + i * 0.45, 0.5, 'sine', 0.06); }); },
    // ---- 得点 ----
    score: function(t){ [C5, E5, G5, C6, E6].forEach(function(f, i){ tone(f, t + i * 0.055, 0.16, 'square', 0.22, null, 0, 5000); }); tone(G6, t + 0.3, 0.4, 'sine', 0.3); },
    coin: function(t){ tone(987.77, t, 0.08, 'square', 0.28, null, 0, 6000); tone(1318.5, t + 0.08, 0.45, 'square', 0.28, null, 0, 6000); },
    scoreBig: function(t){ arp([C5, E5, G5, C6, E5 * 2, G5 * 2, C7], t, 0.07, 0.2, 'square', 0.25, 5000); chord([C6, E6, G6], t + 0.5, 0.7, 'sawtooth', 0.35, null, 4000); noise(t + 0.5, 0.6, 0.15, 'highpass', 7000); },
    combo: function(t){ for (var i = 0; i < 3; i++) arp([C6 * Math.pow(1.122, i), E6 * Math.pow(1.122, i), G6 * Math.pow(1.122, i)], t + i * 0.18, 0.04, 0.12, 'square', 0.22, 6000); tone(C7 * 1.26, t + 0.6, 0.5, 'sine', 0.3); },
    // ---- 脱落・生き残り ----
    eliminate: function(t){ sweep(600, 80, t, 0.6, 'sawtooth', 0.3, 1500); noise(t + 0.5, 0.4, 0.3, 'lowpass', 500); },
    survive: function(t){ arp([G5, C6, E6, G6, C7], t, 0.09, 0.4, 'triangle', 0.35); },
    // ---- 歓声・拍手・ファンファーレ ----
    applause: function(t){ for (var i = 0; i < 70; i++) clap(t + Math.random() * 2.6, 0.08 + Math.random() * 0.12); },
    cheer: function(t){ crowd(t, 2.4, 0.22); tone(G5, t + 0.1, 0.5, 'sine', 0.05); },
    clapCheer: function(t){ SFX.applause(t); SFX.cheer(t + 0.1); },
    fanfare: function(t){
      var n = [[C5, E5, G5], [C5, E5, G5], [C5, E5, G5], [698.46, 880, C6], [G5, 987.77, 1174.66], [C6, E6, G6]];
      var at = [0, 0.14, 0.28, 0.46, 0.7, 0.98], du = [0.1, 0.1, 0.14, 0.2, 0.25, 1.4];
      n.forEach(function(c, i){ chord(c, t + at[i], du[i], 'sawtooth', 0.55, null, 3500); chord(c, t + at[i], du[i], 'square', 0.18, null, 2000); });
      noise(t + 0.98, 1.4, 0.35, 'highpass', 5000);
    },
    fanfare_short: function(t){ chord([G5, 987.77, 1174.66], t, 0.12, 'sawtooth', 0.4, null, 3500); chord([C6, E6, G6], t + 0.14, 0.5, 'sawtooth', 0.45, null, 3500); },
    victory: function(t){
      var mel = [[G5, 0, 0.15], [G5, 0.17, 0.15], [G5, 0.34, 0.15], [E5 * 1.2599, 0.51, 0.5], [698.46 * 1.122, 1.05, 0.5], [G5 * 1.122, 1.6, 0.25], [698.46 * 1.122, 1.9, 0.15], [G5 * 1.122, 2.08, 1.4]];
      mel.forEach(function(m){ tone(m[0], t + m[1], m[2], 'sawtooth', 0.32, null, 0, 3200); tone(m[0] / 2, t + m[1], m[2], 'square', 0.14, null, 0, 1800); });
      chord([C5 * 1.122, 698.46 * 1.122, 880 * 1.122], t + 2.08, 1.4, 'sawtooth', 0.4, null, 3000);
      noise(t + 2.08, 1.6, 0.3, 'highpass', 5000);
    },
    // ---- 画面切替・小物 ----
    whoosh1: function(t){ noise(t, 0.45, 0.5, 'bandpass', 300, null, 5000); },
    whoosh2: function(t){ sweep(200, 1800, t, 0.4, 'sine', 0.3); sweep(220, 1900, t + 0.05, 0.4, 'triangle', 0.15); noise(t, 0.4, 0.2, 'bandpass', 500, null, 4000); },
    pop1: function(t){ tone(500, t, 0.09, 'sine', 0.5, null, 1400); },
    pop2: function(t){ tone(320, t, 0.06, 'sine', 0.6, null, 900); tone(1200, t + 0.05, 0.08, 'sine', 0.3); },
    sparkle: function(t){ for (var i = 0; i < 10; i++) tone(2000 + Math.random() * 3000, t + i * 0.05, 0.15, 'sine', 0.12); }
  };
  // 同じ場面でも毎回違う音にするグループ（サーバーはグループ名で送る）
  var GROUPS = {
    correct: ['correct1', 'correct2', 'correct3'],
    wrong: ['wrong1', 'wrong2', 'wrong3'],
    reveal: ['reveal1', 'reveal2'],
    whoosh: ['whoosh1', 'whoosh2'],
    pop: ['pop1', 'pop2'],
    timeup: ['timeup1', 'timeup2']
  };
  var lastPick = {};
  function sfx(name, team){
    if (!ready()) return;
    if (name === 'buzz' && team && SFX['buzz' + team]) name = 'buzz' + team;
    var g = GROUPS[name];
    if (g) { var i; do { i = Math.floor(Math.random() * g.length); } while (g.length > 1 && i === lastPick[name]); lastPick[name] = i; name = g[i]; }
    if (!SFX[name]) return;
    SFX[name](ctx.currentTime + 0.01);
  }

  // ---------- 内蔵BGM（16分音符のステップシーケンサー） ----------
  var AM = [220, 261.63, 329.63, 440], FM = [174.61, 220, 261.63, 349.23], CM = [261.63, 329.63, 392, 523.25], GM = [196, 246.94, 293.66, 392];
  var PROG = [AM, FM, CM, GM];
  var ROOT = [55, 43.65, 65.41, 49];
  function kick(t, v){ var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16); env(g, t, 0.002, 0.28, v, 0.0001); o.connect(g); g.connect(bgmBus); o.start(t); o.stop(t + 0.32); }
  function snare(t, v){ noise(t, 0.16, v, 'highpass', 1400, bgmBus); tone(190, t, 0.08, 'triangle', v * 0.5, bgmBus); }
  function hat(t, v){ noise(t, 0.035, v, 'highpass', 8000, bgmBus); }
  var TRACKS = {
    lobby: { bpm: 100, fn: function(s, t, sp){
      var bar = Math.floor(s / 16) % 4, i = s % 16, c = PROG[bar];
      if (i === 0 || i === 8) kick(t, 0.5);
      if (i % 4 === 2) hat(t, 0.08);
      if (i === 0) chord(c, t, sp * 15, 'triangle', 0.22, bgmBus, 1800);
      if (i % 2 === 0) tone(c[(i / 2) % 4] * 2, t, sp * 1.6, 'sine', 0.09, bgmBus);
      if (i === 0 || i === 6 || i === 10) tone(ROOT[bar] * 2, t, sp * 3, 'triangle', 0.32, bgmBus);
    }},
    battle: { bpm: 128, fn: function(s, t, sp){
      var bar = Math.floor(s / 16) % 4, i = s % 16, c = PROG[bar];
      if (i % 4 === 0) kick(t, 0.85);
      if (i === 4 || i === 12) snare(t, 0.38);
      if (i % 4 === 2) hat(t, 0.16); else if (i % 2 === 1) hat(t, 0.05);
      if (i % 2 === 0) tone(ROOT[bar] * (i % 4 === 2 ? 2 : 1) * 2, t, sp * 1.7, 'sawtooth', 0.3, bgmBus, 0, 700);
      var arp = [0, 1, 2, 3, 2, 1, 0, 2];
      tone(c[arp[i % 8]] * 2, t, sp * 0.9, 'square', 0.07, bgmBus, 0, 2600);
      if (i === 0) chord(c, t, sp * 15, 'sawtooth', 0.09, bgmBus, 1200);
    }},
    think: { bpm: 96, fn: function(s, t, sp){
      var bar = Math.floor(s / 16) % 2, i = s % 16;
      if (i % 4 === 0) tone(i % 8 === 0 ? 1500 : 1100, t, 0.05, 'square', 0.07, bgmBus, 0, 5000);
      if (i === 0 || i === 8) tone(bar ? 49 : 55, t, sp * 6, 'sine', 0.45, bgmBus);
      if (i === 0) chord(bar ? [196, 233.08, 293.66] : [220, 261.63, 311.13], t, sp * 16, 'triangle', 0.12, bgmBus, 900);
      if (i === 14) hat(t, 0.06);
    }},
    result: { bpm: 120, fn: function(s, t, sp){
      var P = [CM, GM, AM, FM], R = [65.41, 49, 55, 43.65];
      var bar = Math.floor(s / 16) % 4, i = s % 16, c = P[bar];
      if (i % 4 === 0) kick(t, 0.7);
      if (i === 4 || i === 12) snare(t, 0.3);
      if (i % 2 === 0) hat(t, 0.07);
      if (i === 0 || i === 3 || i === 6 || i === 10) chord(c, t, sp * 1.5, 'sawtooth', 0.22, bgmBus, 2800);
      if (i % 4 === 0) tone(R[bar] * 2, t, sp * 3, 'sawtooth', 0.28, bgmBus, 0, 600);
      var mel = [4, 0, 2, 0, 3, 0, 2, 1];
      if (i % 2 === 0 && mel[i / 2] !== 0) tone(c[mel[i / 2] - 1] * 4, t, sp * 1.8, 'square', 0.06, bgmBus, 0, 3500);
    }}
  };
  function stopSeq(){ if (seqTimer) { clearInterval(seqTimer); seqTimer = null; } track = null; }
  function stopEl(){ if (audioEl) { try { audioEl.pause(); } catch (e) {} audioEl = null; } }
  var lastBase = '';
  function bgm(key, base){
    lastBase = base || lastBase;
    if (key === curKey && (seqTimer || audioEl)) return;
    curKey = key || null;
    stopSeq(); stopEl();
    if (!key || !ctx) return;
    if (key.indexOf('builtin:') === 0) {
      var tr = TRACKS[key.slice(8)];
      if (!tr) return;
      track = tr; step = 0; nextT = ctx.currentTime + 0.1;
      var sp = 60 / tr.bpm / 4;
      seqTimer = setInterval(function(){
        while (nextT < ctx.currentTime + 0.15) { try { track.fn(step, nextT, sp); } catch (e) {} step++; nextT += sp; }
      }, 30);
    } else if (key.indexOf('media:') === 0) {
      audioEl = new Audio(lastBase + '/media/' + key.slice(6));
      audioEl.loop = true; audioEl.volume = volB;
      audioEl.play().catch(function(){});
    }
  }
  function vol(b, s){
    if (b != null) { volB = b; if (bgmBus) bgmBus.gain.value = b; if (audioEl) audioEl.volume = b; }
    if (s != null) { volS = s; if (sfxBus) sfxBus.gain.value = s; }
  }
  return { unlock: unlock, sfx: sfx, bgm: bgm, vol: vol, ready: ready, current: function(){ return curKey; } };
})();
`;

// 管理者画面のサウンドボード用（名前 → 表示名）。グループ名（correct など）を押すと毎回ランダムに鳴り分ける
export const SFX_CATALOG: Array<{ cat: string; items: Array<[string, string]> }> = [
  { cat: '正解・不正解', items: [['correct', '正解（ランダム）'], ['correct1', 'ピンポーン'], ['correct2', 'キラリン'], ['correct3', 'ジャジャーン'], ['wrong', '不正解（ランダム）'], ['wrong1', 'ブブー'], ['wrong2', 'チーン…'], ['wrong3', 'ずっこけ'], ['trombone', '残念ワワワワー']] },
  { cat: '早押し', items: [['buzzA', 'Aチーム（レーザー）'], ['buzzB', 'Bチーム（ピコーン）'], ['buzzC', 'Cチーム（ドン）'], ['buzzD', 'Dチーム（ジャン）'], ['buzz', '共通（バシッ）']] },
  { cat: '出題・スタート・時間', items: [['quizIntro', '出題（ジャン！）'], ['start', 'スタート'], ['countdown', '3・2・1・GO'], ['go', 'ピーッ'], ['ticktock', 'チクタク'], ['timeup', 'タイムアップ（ランダム）'], ['gong', 'ゴング'], ['whistle', '笛']] },
  { cat: '発表・演出', items: [['drumroll', 'ドラムロール'], ['reveal', '発表（ランダム）'], ['reveal2', 'シャキーン'], ['heartbeat', 'ドクンドクン'], ['tension', '緊迫'], ['taiko', '太鼓ドドン'], ['reversal', '逆転！'], ['explosion', 'ドカーン'], ['laser', 'ビーム'], ['boing', 'ビヨーン'], ['horn', 'パフパフ'], ['sparkle', 'キラキラ'], ['bell', 'チーン（鈴）'], ['chime', 'キンコンカンコン']] },
  { cat: '得点', items: [['score', '加点'], ['coin', 'コイン'], ['scoreBig', '大量得点'], ['combo', 'コンボ']] },
  { cat: '脱落・生き残り', items: [['eliminate', '脱落'], ['survive', '生き残り']] },
  { cat: '歓声・ファンファーレ', items: [['applause', '拍手'], ['cheer', '歓声'], ['clapCheer', '拍手＋歓声'], ['fanfare_short', 'ファンファーレ（短）'], ['fanfare', 'ファンファーレ'], ['victory', '優勝ファンファーレ']] },
  { cat: '画面切替', items: [['whoosh', 'シュッ（ランダム）'], ['whoosh2', 'ワープ'], ['pop', 'ポン']] },
];
