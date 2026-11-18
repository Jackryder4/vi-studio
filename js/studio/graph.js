/* graph.js — mixer graph: channel strips + master (works on live and offline contexts) */
(function () {
  'use strict';
  const VMI = window.VMI;

  function makeIR(c, sec, decay, bright) {
    const len = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        lp += (Math.random() * 2 - 1 - lp) * (bright - (bright - 0.1) * k);
        d[i] = lp * Math.pow(1 - k, decay) * (i < 160 ? i / 160 : 1);
      }
    }
    return b;
  }
  const REVERBS = { room: [0.9, 3.2, 0.6], hall: [2.6, 2.2, 0.5], plate: [1.7, 2.6, 0.85], cave: [4.5, 1.6, 0.3] };
  const DELAYS = { '4': 1, '8': 0.5, '8d': 0.75, '16': 0.25 };
  const driveCurve = (() => {
    const n = 1024, cv = new Float32Array(n), k = 7, nt = Math.tanh(k);
    for (let i = 0; i < n; i++) { const x = (i * 2) / (n - 1) - 1; cv[i] = Math.tanh(x * k) / nt; }
    return cv;
  })();

  class Strip {
    constructor(graph) {
      const c = graph.c; this.g = graph; this.c = c;
      this.input = c.createGain();
      this.dry = c.createGain(); this.drv = c.createWaveShaper(); this.drv.curve = driveCurve; this.drvG = c.createGain(); this.sum = c.createGain();
      this.lo = c.createBiquadFilter(); this.lo.type = 'lowshelf'; this.lo.frequency.value = 220;
      this.mid = c.createBiquadFilter(); this.mid.type = 'peaking'; this.mid.frequency.value = 1200; this.mid.Q.value = 0.9;
      this.hi = c.createBiquadFilter(); this.hi.type = 'highshelf'; this.hi.frequency.value = 4500;
      this.cmp = c.createDynamicsCompressor();
      this.pan = c.createStereoPanner ? c.createStereoPanner() : null;
      this.fader = c.createGain(); this.mute = c.createGain();
      this.revSend = c.createGain(); this.dlySend = c.createGain();
      this.an = c.createAnalyser(); this.an.fftSize = 512; this.buf = new Float32Array(512);
      this.input.connect(this.dry); this.dry.connect(this.sum);
      this.input.connect(this.drv); this.drv.connect(this.drvG); this.drvG.connect(this.sum);
      // insert FX slots live between drive and the channel EQ (FL-style mixer inserts)
      this.fxIn = c.createGain(); this.fxOut = c.createGain(); this.fxMods = []; this.fxKey = '';
      this.sum.connect(this.fxIn); this.fxIn.connect(this.fxOut);
      let n = this.fxOut;
      [this.lo, this.mid, this.hi, this.cmp].forEach((x) => { n.connect(x); n = x; });
      if (this.pan) { n.connect(this.pan); n = this.pan; }
      n.connect(this.fader); this.fader.connect(this.mute);
      this.mute.connect(graph.masterIn);
      this.mute.connect(this.revSend); this.revSend.connect(graph.reverbIn);
      this.mute.connect(this.dlySend); this.dlySend.connect(graph.delayIn);
      this.mute.connect(this.an);
    }
    setFx(list, bpm) {
      list = (list || []).filter((f) => f.on && VMI.FX && VMI.FX.types[f.type]);
      const key = list.map((f) => f.id + f.type).join('|') + (list.some((f) => f.type === 'autotune') && VMI.FX.workletReady(this.c) ? '+w' : '');
      if (key === this.fxKey) { list.forEach((f, i) => { try { this.fxMods[i].set(f.p, bpm); } catch (e) { /* ignore */ } }); return; }
      this.fxMods.forEach((m) => { try { m.stop && m.stop(); m.output.disconnect(); } catch (e) { /* ignore */ } });
      try { this.fxIn.disconnect(); } catch (e) { /* ignore */ }
      this.fxMods = []; let n = this.fxIn;
      list.forEach((f) => { const m = VMI.FX.build(this.c, f, bpm); n.connect(m.input); n = m.output; this.fxMods.push(m); });
      n.connect(this.fxOut);
      this.fxKey = key;
    }
    apply(t, bpm) {
      this.setFx(t.fx, bpm || this.g.bpm || 120);
      const set = (p, v) => { p.value = v; };
      set(this.fader.gain, t.vol); if (this.pan) set(this.pan.pan, t.pan || 0);
      set(this.revSend.gain, t.rev || 0); set(this.dlySend.gain, t.dly || 0);
      const eq = t.eq || [0, 0, 0];
      set(this.lo.gain, eq[0]); set(this.mid.gain, eq[1]); set(this.hi.gain, eq[2]);
      const d = t.drive || 0;
      set(this.drvG.gain, d * 0.55); set(this.dry.gain, 1 - d * 0.6);
      if (t.comp) { set(this.cmp.threshold, -26); set(this.cmp.ratio, 4); set(this.cmp.knee, 10); set(this.cmp.attack, 0.008); set(this.cmp.release, 0.18); }
      else { set(this.cmp.threshold, 0); set(this.cmp.ratio, 1); set(this.cmp.knee, 0); }
    }
    setMuted(m) { this.mute.gain.value = m ? 0 : 1; }
    peak() {
      this.an.getFloatTimeDomainData(this.buf);
      let m = 0; for (let i = 0; i < this.buf.length; i++) { const v = Math.abs(this.buf[i]); if (v > m) m = v; }
      return m;
    }
    destroy() { this.fxMods.forEach((m) => { try { m.stop && m.stop(); } catch (e) { /* ignore */ } }); [this.input, this.sum, this.mute, this.fader, this.an].forEach((n) => { try { n.disconnect(); } catch (e) { /* ignore */ } }); }
  }

  class Graph {
    constructor(c, dest) {
      this.c = c;
      this.masterIn = c.createGain();
      this.limiter = c.createDynamicsCompressor();
      this.limiter.threshold.value = -4; this.limiter.knee.value = 4; this.limiter.ratio.value = 14; this.limiter.attack.value = 0.002; this.limiter.release.value = 0.12;
      this.master = c.createGain();
      this.an = c.createAnalyser(); this.an.fftSize = 512; this.buf = new Float32Array(512);
      this.masterIn.connect(this.limiter); this.limiter.connect(this.master); this.master.connect(dest || c.destination); this.master.connect(this.an);
      // reverb
      this.reverbIn = c.createGain(); this.conv = c.createConvolver(); this.revRet = c.createGain();
      this.reverbIn.connect(this.conv); this.conv.connect(this.revRet); this.revRet.connect(this.masterIn);
      this.revType = null;
      // delay (ping-pong-ish single tap with feedback + lowpass)
      this.delayIn = c.createGain(); this.dly = c.createDelay(2); this.fb = c.createGain(); this.dlp = c.createBiquadFilter(); this.dlp.type = 'lowpass'; this.dlp.frequency.value = 3800;
      this.dRet = c.createGain();
      this.delayIn.connect(this.dly); this.dly.connect(this.dlp); this.dlp.connect(this.fb); this.fb.connect(this.dly); this.dlp.connect(this.dRet); this.dRet.connect(this.masterIn);
      this.strips = new Map();
    }
    setMaster(m, bpm) {
      this.bpm = bpm;
      this.master.gain.value = m.vol;
      if (m.rev !== this.revType) { const r = REVERBS[m.rev] || REVERBS.hall; this.conv.buffer = makeIR(this.c, r[0], r[1], r[2]); this.revType = m.rev; }
      this.dly.delayTime.value = Math.min(1.99, (60 / bpm) * (DELAYS[m.dly] || 0.5));
      this.fb.gain.value = m.fb == null ? 0.38 : m.fb;
    }
    strip(id) { let s = this.strips.get(id); if (!s) { s = new Strip(this); this.strips.set(id, s); } return s; }
    drop(id) { const s = this.strips.get(id); if (s) { s.destroy(); this.strips.delete(id); } }
    peak() {
      this.an.getFloatTimeDomainData(this.buf);
      let m = 0; for (let i = 0; i < this.buf.length; i++) { const v = Math.abs(this.buf[i]); if (v > m) m = v; }
      return m;
    }
  }
  VMI.Graph = Graph;
  VMI.REVERBS = Object.keys(REVERBS);
  VMI.DELAYS = DELAYS;
})();
