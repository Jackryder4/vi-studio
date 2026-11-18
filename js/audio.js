/* audio.js — Web Audio engine: master chain, reverb, note helpers */
(function () {
  'use strict';
  const VMI = (window.VMI = window.VMI || {});
  const A = (VMI.audio = {});
  let ctx = null, inputBus, dry, wet, conv, comp, master;
  let noiseBuf = null;

  A.volume = 0.8;
  A.reverb = 0.25;
  A.ctx = () => ctx;

  /* ---------- note helpers ---------- */
  const NN = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  A.mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  A.n2m = (n) => {
    if (typeof n === 'number') return n;
    const m = /^([A-G][#b]?)(-?\d)$/.exec(n);
    return NN[m[1]] + (parseInt(m[2], 10) + 1) * 12;
  };
  A.m2n = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  A.pc = (m) => NAMES[((m % 12) + 12) % 12];

  /* ---------- reverb impulse ---------- */
  function makeIR(c, sec, decay) {
    const len = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        lp += (Math.random() * 2 - 1 - lp) * (0.62 - 0.5 * k);
        d[i] = lp * Math.pow(1 - k, decay) * (i < 160 ? i / 160 : 1);
      }
    }
    return b;
  }

  /* ---------- engine ---------- */
  A.init = function () {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
    ctx = new AC({ latencyHint: 'interactive' });
    inputBus = ctx.createGain();
    dry = ctx.createGain();
    wet = ctx.createGain();
    conv = ctx.createConvolver();
    conv.buffer = makeIR(ctx, 2.4, 2.2);
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    master = ctx.createGain();
    inputBus.connect(dry); dry.connect(comp);
    inputBus.connect(conv); conv.connect(wet); wet.connect(comp);
    comp.connect(master); master.connect(ctx.destination);
    A.setVolume(A.volume);
    A.setReverb(A.reverb);
    return ctx;
  };
  A.resume = function () {
    A.init();
    if (ctx && ctx.state !== 'running') { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); }
  };
  A.setVolume = (v) => {
    A.volume = v;
    if (master) master.gain.setTargetAtTime(v * v * 1.1, ctx.currentTime, 0.02);
  };
  A.setReverb = (v) => {
    A.reverb = v;
    if (wet) { wet.gain.setTargetAtTime(v * 1.3, ctx.currentTime, 0.05); dry.gain.setTargetAtTime(1 - v * 0.25, ctx.currentTime, 0.05); }
  };
  /** instrument bus */
  A.bus = (gain) => {
    A.init();
    const g = ctx.createGain();
    g.gain.value = gain == null ? 1 : gain;
    g.connect(inputBus);
    return g;
  };
  A.noiseBuffer = (c) => {
    if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
      const len = c.sampleRate * 2;
      noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  };
  A.noiseSrc = (c) => {
    const s = c.createBufferSource();
    s.buffer = A.noiseBuffer(c);
    s.loop = true;
    return s;
  };

  /** short click for the metronome */
  A.click = (accent, when) => {
    A.init();
    const t = when || ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = accent ? 1800 : 1200;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(accent ? 0.35 : 0.22, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.07);
    o.onended = () => { try { g.disconnect(); } catch (e) { /* ignore */ } };
  };
})();
