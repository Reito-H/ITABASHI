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

  var SFX = {
    buzz: function(t){ noise(t, 0.09, 0.9, 'highpass', 2500); tone(1400, t, 0.18, 'square', 0.35, null, 700); tone(2100, t + 0.02, 0.12, 'sawtooth', 0.15); },
    correct: function(t){ tone(1318.5, t, 0.22, 'sine', 0.6); tone(2637, t, 0.15, 'sine', 0.12); tone(1046.5, t + 0.2, 0.7, 'sine', 0.6); tone(2093, t + 0.2, 0.4, 'sine', 0.12); },
    wrong: function(t){ tone(150, t, 0.28, 'square', 0.35, null, 0, 900); tone(150, t + 0.33, 0.45, 'square', 0.35, null, 0, 900); tone(75, t, 0.8, 'sawtooth', 0.2, null, 0, 400); },
    start: function(t){ noise(t, 0.35, 0.35, 'bandpass', 600, null, 6000); chord([523.25, 659.25, 783.99, 1046.5], t + 0.3, 0.6, 'sawtooth', 0.45, null, 3000); tone(1046.5, t + 0.3, 0.6, 'square', 0.15); },
    timeup: function(t){ tone(880, t, 0.12, 'square', 0.3); tone(880, t + 0.18, 0.12, 'square', 0.3); tone(440, t + 0.36, 0.7, 'square', 0.35, null, 0, 1500); },
    tick: function(t){ tone(1600, t, 0.04, 'square', 0.18, null, 0, 4000); },
    whoosh: function(t){ noise(t, 0.45, 0.5, 'bandpass', 300, null, 5000); },
    pop: function(t){ tone(500, t, 0.09, 'sine', 0.5, null, 1400); },
    score: function(t){ [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function(f, i){ tone(f, t + i * 0.055, 0.16, 'square', 0.22, null, 0, 5000); }); tone(1568, t + 0.3, 0.4, 'sine', 0.3); },
    reveal: function(t){ noise(t, 0.25, 0.25, 'highpass', 6000); chord([659.25, 830.61, 987.77, 1318.5], t + 0.05, 0.9, 'triangle', 0.5); },
    drumroll: function(t){
      for (var i = 0; i < 44; i++) { var tt = t + i * 0.055; noise(tt, 0.06, 0.12 + i * 0.012, 'bandpass', 1800); }
      noise(t + 44 * 0.055, 1.2, 0.7, 'highpass', 4000); tone(98, t + 44 * 0.055, 0.6, 'sine', 0.6, null, 40);
    },
    fanfare: function(t){
      var n = [[523.25, 659.25, 783.99], [523.25, 659.25, 783.99], [523.25, 659.25, 783.99], [698.46, 880, 1046.5], [783.99, 987.77, 1174.66], [1046.5, 1318.5, 1568]];
      var at = [0, 0.14, 0.28, 0.46, 0.7, 0.98], du = [0.1, 0.1, 0.14, 0.2, 0.25, 1.4];
      n.forEach(function(c, i){ chord(c, t + at[i], du[i], 'sawtooth', 0.55, null, 3500); chord(c, t + at[i], du[i], 'square', 0.18, null, 2000); });
      noise(t + 0.98, 1.4, 0.35, 'highpass', 5000);
    },
    fanfare_short: function(t){ chord([783.99, 987.77, 1174.66], t, 0.12, 'sawtooth', 0.4, null, 3500); chord([1046.5, 1318.5, 1568], t + 0.14, 0.5, 'sawtooth', 0.45, null, 3500); }
  };
  function sfx(name){
    if (!ready() || !SFX[name]) return;
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
