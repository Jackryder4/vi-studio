/* voices.js — every instrument sound is synthesized here (no samples) */
(function () {
  'use strict';
  const VMI = window.VMI, A = VMI.audio;
  const V = (VMI.voices = {});
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  /* =========================================================
     Helpers
     ========================================================= */
  function hold(p, t, c) {
    if (p.cancelAndHoldAtTime) { try { p.cancelAndHoldAtTime(t); return; } catch (e) { /* fall through */ } }
    if (c && t > c.currentTime + 0.001) { p.cancelScheduledValues(t); return; }
    const v = p.value;
    p.cancelScheduledValues(t);
    p.setValueAtTime(v, t);
  }

  /** Keeps track of every source/node of a voice so they can be stopped and freed together. */
  class Rack {
    constructor(c) { this.c = c; this.src = []; this.nodes = []; this.dead = false; }
    osc(type, f, t, dest) {
      const o = this.c.createOscillator();
      o.type = type; o.frequency.value = f;
      if (dest) o.connect(dest);
      o.start(t); this.src.push(o); return o;
    }
    noise(t, dest) {
      const s = A.noiseSrc(this.c);
      if (dest) s.connect(dest);
      s.start(t, Math.random() * 1.5); this.src.push(s); return s;
    }
    g(v) { const g = this.c.createGain(); g.gain.value = v == null ? 1 : v; this.nodes.push(g); return g; }
    f(type, freq, q) {
      const f = this.c.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q == null ? 1 : q;
      this.nodes.push(f); return f;
    }
    stop(t) {
      for (const s of this.src) { try { s.stop(t); } catch (e) { /* ignore */ } }
      if (this.src[0] && !this.dead) {
        this.dead = true;
        this.src[0].onended = () => {
          this.nodes.forEach((n) => { try { n.disconnect(); } catch (e) { /* ignore */ } });
          this.src.forEach((s) => { try { s.disconnect(); } catch (e) { /* ignore */ } });
        };
      }
    }
  }

  function chainN(R, t, filters, dest) {
    let node = R.noise(t);
    for (const [type, f, q] of filters) { const fl = R.f(type, f, q); node.connect(fl); node = fl; }
    node.connect(dest);
    return dest;
  }
  /** exponentially decaying gain */
  function env(R, dest, t, peak, tau, a) {
    const att = a || 0.001;
    const e = R.g(0);
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(peak, t + att);
    e.gain.setTargetAtTime(0, t + att, tau);
    e.connect(dest);
    return e;
  }
  /** release / kill handle for a voice with master gain g */
  function handle(c, R, g, tau, ring) {
    const end = (tt, when) => {
      const n = Math.max(c.currentTime, when || 0);
      hold(g.gain, n, c);
      g.gain.setTargetAtTime(0, n, tt);
      R.stop(n + tt * 8 + 0.05);
    };
    let done = false;
    return {
      release(when) { if (ring || done) return; done = true; end(tau, when); },
      kill(when) { done = true; end(0.012, when); },
    };
  }
  function vibrato(R, t, targets, rate, depth, delay) {
    const lg = R.g(0);
    R.osc('sine', rate, t, lg);
    lg.gain.setValueAtTime(0, t);
    lg.gain.setValueAtTime(0, t + delay);
    lg.gain.linearRampToValueAtTime(depth, t + delay + 0.5);
    targets.forEach((o) => lg.connect(o.detune));
  }
  /** sustained voice scaffold: attack → sustain, release on note off */
  function sus(c, out, t, o, build) {
    const R = new Rack(c);
    const g = R.g(0);
    g.connect(out);
    const peak = o.peak == null ? 0.3 : o.peak, a = o.a == null ? 0.02 : o.a;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    build(R, g, t);
    const rel = (tau, when) => {
      const n = Math.max(c.currentTime, when || 0);
      hold(g.gain, n, c);
      g.gain.setTargetAtTime(0, n, tau);
      R.stop(n + tau * 8 + 0.05);
    };
    let done = false;
    return {
      release(when) { if (done) return; done = true; rel((o.r == null ? 0.15 : o.r) / 4, when); },
      kill(when) { done = true; rel(0.012, when); },
    };
  }
  /** one-shot (percussion) scaffold */
  function shot(c, out, t, dur, build) {
    const R = new Rack(c);
    const g = R.g(1);
    g.connect(out);
    build(R, g, t);
    R.stop(t + dur + 0.05);
    return {
      release() { },
      kill(when) { const n = Math.max(c.currentTime, when || 0); hold(g.gain, n, c); g.gain.setTargetAtTime(0, n, 0.01); R.stop(n + 0.1); },
    };
  }
  const waveCache = new WeakMap();
  function wave(c, name) {
    let m = waveCache.get(c);
    if (!m) { m = {}; waveCache.set(c, m); }
    if (!m[name]) {
      const n = 24, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) {
        if (name === 'odd') im[k] = k % 2 ? 1 / k : 0;                 // clarinet-ish
        else if (name === 'reed') im[k] = 1 / Math.pow(k, 0.85) * (k % 2 ? 1 : 0.55);
        else im[k] = 1 / k;
      }
      m[name] = c.createPeriodicWave(re, im);
    }
    return m[name];
  }
  const curveCache = {};
  function distCurve(k) {
    if (curveCache[k]) return curveCache[k];
    const n = 1024, cv = new Float32Array(n), nt = Math.tanh(k);
    for (let i = 0; i < n; i++) { const x = (i * 2) / (n - 1) - 1; cv[i] = Math.tanh(x * k) / nt; }
    return (curveCache[k] = cv);
  }

  /* =========================================================
     Keyboards
     ========================================================= */
  V.piano = (c, out, p) => {
    const f = p.freq, v = p.vel, t = p.t, R = new Rack(c);
    const lp = R.f('lowpass', clamp(f * (4 + v * 10), 700, 15000), 0.4);
    const g = R.g(0.16 + 0.34 * v);
    g.connect(lp); lp.connect(out);
    const dec = clamp(5.2 - 1.15 * Math.log2(f / 55), 0.8, 5.2);
    const B = 0.00003 * Math.pow(f / 27.5, 1.3);
    const amps = [1, 0.62, 0.42, 0.28, 0.18, 0.12, 0.08, 0.05];
    for (let n = 1; n <= 8; n++) {
      const pf = f * n * Math.sqrt(1 + B * n * n);
      if (pf > 12000) break;
      const a = amps[n - 1] * (n > 1 ? 0.35 + 0.65 * v : 1);
      const copies = n <= 3 ? [0, 1.6] : [0];
      copies.forEach((dc) => {
        const pg = R.g(0); pg.connect(g);
        const o = R.osc('sine', pf, t, pg); o.detune.value = dc;
        const ag = a / copies.length;
        const tau1 = 0.35 / (1 + 0.5 * (n - 1)), tau2 = dec / (2.2 * (1 + 0.35 * (n - 1)));
        pg.gain.setValueAtTime(0, t);
        pg.gain.linearRampToValueAtTime(ag, t + 0.003);
        pg.gain.setTargetAtTime(ag * 0.35, t + 0.003, tau1);
        pg.gain.setTargetAtTime(0, t + 0.45, tau2);
      });
    }
    chainN(R, t, [['bandpass', clamp(f * 2.5, 300, 4000), 1]], env(R, g, t, 0.14 * v, 0.012));
    R.stop(t + 0.5 + dec * 3.2);
    return handle(c, R, g, 0.07 + (f < 150 ? 0.06 : 0), false);
  };

  V.epiano = (c, out, p) => {
    const f = p.freq, v = p.vel, t = p.t, R = new Rack(c);
    const g = R.g(0.14 + 0.2 * v); g.connect(out);
    const tau = clamp(1.7 - 0.35 * Math.log2(f / 130), 0.5, 2.4);
    [0, 5].forEach((det) => {
      const cg = R.g(0); cg.connect(g);
      cg.gain.setValueAtTime(0, t);
      cg.gain.linearRampToValueAtTime(0.55, t + 0.003);
      cg.gain.setTargetAtTime(0, t + 0.003, tau);
      const car = R.osc('sine', f, t, cg); car.detune.value = det;
      const mod = R.osc('sine', f, t, null);
      const mg = R.g(0); mod.connect(mg); mg.connect(car.frequency);
      mg.gain.setValueAtTime(f * (0.4 + 1.6 * v), t);
      mg.gain.setTargetAtTime(f * 0.1, t, 0.4);
      const m2 = R.osc('sine', f * 14, t, null);
      const mg2 = R.g(0); m2.connect(mg2); mg2.connect(car.frequency);
      mg2.gain.setValueAtTime(f * 1.4 * v, t);
      mg2.gain.setTargetAtTime(0, t, 0.035);
    });
    R.stop(t + 0.003 + tau * 8);
    return handle(c, R, g, 0.1, false);
  };

  const DRAW = [0.5, 1.5, 1, 2, 3, 4, 5, 6, 8];
  function organ(cfg) {
    return (c, out, p) => {
      const f = p.freq, o = p.o;
      const regs = cfg.regs[o.reg] || cfg.regs[cfg.def];
      const rate = { off: 0, slow: 0.8, fast: 6.6 }[o.leslie == null ? cfg.leslie : o.leslie] || 0;
      return sus(c, out, p.t, { a: cfg.a, r: cfg.r, peak: cfg.peak }, (R, g, t) => {
        const mix = R.g(1); mix.connect(g);
        regs.forEach((lv, i) => {
          const pf = f * DRAW[i];
          if (!lv || pf > 14000) return;
          const og = R.g(Math.pow(lv / 8, 1.4) * 0.3); og.connect(mix);
          R.osc('sine', pf, t, og);
        });
        if (rate) {
          const depth = rate > 3 ? 0.16 : 0.1;
          mix.gain.value = 1 - depth;
          const lg = R.g(depth); lg.connect(mix.gain);
          R.osc('sine', rate, t, lg);
        }
        if (cfg.chiff) chainN(R, t, [['lowpass', 1800, 0.7]], env(R, g, t, 0.35, 0.07, 0.02));
        if (o.perc !== false && cfg.perc) {
          chainN(R, t, [['bandpass', 3200, 1]], env(R, out, t, 0.12, 0.012));
          R.osc('sine', f * 3, t, env(R, out, t, 0.12, 0.1));
        }
      });
    };
  }
  V.hammond = organ({
    a: 0.008, r: 0.06, peak: 0.13, perc: true, leslie: 'slow', def: 'jazz',
    regs: {
      jazz: [8, 8, 8, 0, 0, 0, 0, 0, 0], gospel: [8, 8, 8, 8, 0, 0, 0, 0, 0], rock: [8, 8, 8, 8, 8, 0, 0, 0, 8],
      full: [8, 8, 8, 8, 8, 8, 8, 8, 8], flute: [0, 0, 8, 0, 4, 0, 0, 0, 0], mellow: [6, 0, 8, 6, 0, 0, 0, 0, 0],
    },
  });
  V.pipeorgan = organ({
    a: 0.055, r: 0.28, peak: 0.12, chiff: true, leslie: 'off', def: 'full',
    regs: {
      full: [6, 0, 8, 7, 5, 6, 3, 3, 2], principal: [0, 0, 8, 6, 0, 4, 0, 0, 2], flutes: [4, 0, 8, 0, 3, 2, 0, 0, 0],
      diapason: [5, 0, 8, 8, 0, 5, 0, 0, 0],
    },
  });

  V.harpsichord = (c, out, p) => {
    const f = p.freq, t = p.t, R = new Rack(c);
    const g = R.g(0.2);
    const lp = R.f('lowpass', 7500, 0.7);
    lp.frequency.setValueAtTime(7500, t); lp.frequency.setTargetAtTime(2400, t, 0.25);
    g.connect(lp); lp.connect(out);
    const dec = clamp(2.6 - 0.5 * Math.log2(f / 130), 0.5, 3);
    [[1, 1, 0], [2, 0.45, 4], [1, 0.5, 9]].forEach(([r, a, det]) => {
      const pf = f * r; if (pf > 12000) return;
      const og = R.g(0); og.connect(g);
      const o = R.osc('sawtooth', pf, t, og); o.detune.value = det;
      og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(a * 0.5, t + 0.002); og.gain.setTargetAtTime(0, t + 0.002, dec / 4);
    });
    chainN(R, t, [['highpass', 3500, 0.7]], env(R, g, t, 0.25, 0.006));
    R.stop(t + dec * 2.2 + 0.3);
    return handle(c, R, g, 0.05, false);
  };

  V.synth = (c, out, p) => {
    const o = p.o, wv = o.wave || 'sawtooth', cut = +o.cutoff || 3000, res = +o.res || 2;
    const a = o.attack == null ? 0.01 : +o.attack, r = o.release == null ? 0.3 : +o.release, det = o.detune == null ? 8 : +o.detune;
    return sus(c, out, p.t, { a, r, peak: 0.13 * (0.6 + 0.4 * p.vel) }, (R, g, t) => {
      const f = p.freq;
      const lp = R.f('lowpass', cut, res);
      lp.frequency.setValueAtTime(Math.min(cut * 3.5, 18000), t);
      lp.frequency.setTargetAtTime(cut, t, 0.18);
      lp.connect(g);
      [-det, det].forEach((d) => { const oo = R.osc(wv, f, t, lp); oo.detune.value = d; });
      if (o.sub !== false) { const sg = R.g(0.6); sg.connect(lp); R.osc('sine', f / 2, t, sg); }
    });
  };

  function freereed(cfg) {
    return (c, out, p) => sus(c, out, p.t, { a: cfg.a, r: cfg.r, peak: cfg.peak * (0.65 + 0.35 * p.vel) }, (R, g, t) => {
      const f = p.freq;
      const mix = R.g(1);
      const lp = R.f('lowpass', clamp(f * cfg.lp + cfg.base, 600, 9000), 0.9);
      const pk = R.f('peaking', cfg.pf, 1.2); pk.gain.value = cfg.pg;
      mix.connect(lp); lp.connect(pk); pk.connect(g);
      const os = cfg.det.map((d) => { const o = R.osc(cfg.type, f, t, mix); o.detune.value = d; return o; });
      if (cfg.trem) {
        mix.gain.value = 1 - cfg.trem[1];
        const lg = R.g(cfg.trem[1]); lg.connect(mix.gain);
        R.osc('sine', cfg.trem[0], t, lg);
      }
      vibrato(R, t, os, 5.2, cfg.vd || 0, 0.5);
    });
  }
  V.harmonica = freereed({ type: 'sawtooth', det: [-5, 5], lp: 5, base: 900, pf: 1800, pg: 6, trem: [5.5, 0.1], a: 0.03, r: 0.08, peak: 0.2, vd: 0 });
  V.accordion = freereed({ type: 'sawtooth', det: [-13, 0, 13], lp: 4, base: 1100, pf: 1300, pg: 5, trem: [0.7, 0.12], a: 0.07, r: 0.12, peak: 0.11, vd: 0 });

  /* =========================================================
     Mallets, bells & tuned percussion (modal synthesis)
     ========================================================= */
  function modal(cfg) {
    return (c, out, p) => {
      const f = p.freq, v = p.vel, t = p.t, R = new Rack(c);
      const lvl = (cfg.level || 0.35) * (0.4 + 0.6 * v);
      const g = R.g(lvl); g.connect(out);
      const fs = clamp(Math.pow(261 / f, cfg.fscale == null ? 0.3 : cfg.fscale), 0.35, 2.4);
      let maxd = 0;
      cfg.ratios.forEach((r, i) => {
        const pf = f * r; if (pf > 15000) return;
        const amp = (cfg.amps[i] == null ? 0.1 : cfg.amps[i]) * (i ? 0.45 + 0.55 * v : 1);
        const d = cfg.decay * Math.pow(cfg.tilt == null ? 0.6 : cfg.tilt, i) * fs;
        maxd = Math.max(maxd, d);
        const pg = R.g(0); pg.connect(g);
        const a = cfg.attack || 0.002;
        pg.gain.setValueAtTime(0, t); pg.gain.linearRampToValueAtTime(amp, t + a); pg.gain.setTargetAtTime(0, t + a, d / 5);
        const o = R.osc('sine', pf, t, pg);
        if (cfg.bend) { o.frequency.setValueAtTime(pf * (1 + cfg.bend), t); o.frequency.setTargetAtTime(pf, t, 0.03); }
        if (cfg.beat) R.osc('sine', pf + cfg.beat * (1 + i * 0.37), t, pg);
      });
      if (cfg.click) chainN(R, t, [['bandpass', clamp(f * 3, 500, 9000), 1]], env(R, g, t, cfg.click, 0.012));
      const mot = { off: 0, slow: 3.2, fast: 6.5 }[p.o.motor];
      if (cfg.trem && mot) {
        g.gain.value = lvl * 0.65;
        const lg = R.g(lvl * 0.35); lg.connect(g.gain);
        R.osc('sine', mot, t, lg);
      }
      R.stop(t + maxd * 1.8 + 0.3);
      return handle(c, R, g, cfg.damp || 0.12, !cfg.damp);
    };
  }
  V.xylophone = modal({ ratios: [1, 3, 6.2], amps: [1, 0.45, 0.2], decay: 0.55, click: 0.25, level: 0.5, fscale: 0.2 });
  V.marimba = modal({ ratios: [1, 4, 9.8], amps: [1, 0.3, 0.08], decay: 1.5, attack: 0.003, click: 0.12, level: 0.55, fscale: 0.5, tilt: 0.35 });
  V.glock = modal({ ratios: [1, 2.76, 5.4, 8.93], amps: [1, 0.5, 0.3, 0.15], decay: 2.2, tilt: 0.5, click: 0.15, level: 0.36, fscale: 0.4 });
  V.vibes = modal({ ratios: [1, 4, 10], amps: [1, 0.28, 0.07], decay: 3.4, attack: 0.003, click: 0.07, level: 0.45, tilt: 0.4, trem: true, damp: 0.25 });
  V.celesta = modal({ ratios: [1, 4.1, 6.8], amps: [1, 0.2, 0.1], decay: 2, attack: 0.002, click: 0.08, level: 0.45, tilt: 0.45, damp: 0.2 });
  V.tubular = modal({ ratios: [1, 2.01, 2.76, 4.07, 5.4], amps: [1, 0.7, 0.5, 0.3, 0.2], decay: 5.5, tilt: 0.8, beat: 0.8, click: 0.1, level: 0.2, fscale: 0.5 });
  V.musicbox = modal({ ratios: [1, 6.27], amps: [1, 0.14], decay: 1.3, click: 0.05, level: 0.4, fscale: 0.4, tilt: 0.4 });
  V.kalimba = modal({ ratios: [1, 6.27, 2], amps: [1, 0.18, 0.06], decay: 1.7, attack: 0.002, click: 0.18, level: 0.6, fscale: 0.5, tilt: 0.4 });
  V.steelpan = modal({ ratios: [1, 2, 3, 4.01], amps: [1, 0.6, 0.32, 0.14], decay: 1.7, attack: 0.003, bend: 0.02, level: 0.36, beat: 0.5, tilt: 0.55 });
  V.handpan = modal({ ratios: [1, 2, 2.98], amps: [1, 0.55, 0.28], decay: 3.6, attack: 0.006, click: 0.1, level: 0.5, fscale: 0.4 });
  V.tongue = modal({ ratios: [1, 2.4, 4.1], amps: [1, 0.22, 0.08], decay: 1.2, attack: 0.003, click: 0.2, level: 0.65, fscale: 0.5 });
  V.bowl = modal({ ratios: [1, 2.71, 5.14, 8.34], amps: [1, 0.5, 0.25, 0.12], decay: 9, attack: 0.04, beat: 0.9, level: 0.3, fscale: 0.2, tilt: 0.55 });
  V.chimes = modal({ ratios: [1, 2.76, 5.4], amps: [1, 0.35, 0.12], decay: 4.5, attack: 0.002, click: 0.1, level: 0.3, fscale: 0.4, tilt: 0.5 });

  /* =========================================================
     Plucked strings (Karplus–Strong, rendered to a buffer and cached)
     ========================================================= */
  const KS = new Map();
  function ksBuf(c, f, cfg) {
    const sr = c.sampleRate, a = cfg.a;
    const N = Math.max(3, Math.round(sr / f - (1 - a)));
    const key = cfg.id + '|' + sr + '|' + N;
    let b = KS.get(key);
    if (b) return b;
    const t60 = cfg.t60 * clamp(Math.pow(110 / f, 0.25), 0.5, 1.6);
    const rho = Math.pow(10, (-3 * (N / sr)) / t60);
    const len = Math.floor(sr * Math.min(cfg.dur, t60 * 1.1));
    const line = new Float32Array(N);
    let seed = 12345 + N * 7;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed / 4294967296) * 2 - 1; };
    for (let i = 0; i < N; i++) line[i] = rnd();
    if (cfg.pick) {
      const k = Math.max(1, Math.round(N * cfg.pick)), tmp = line.slice();
      for (let i = 0; i < N; i++) line[i] = tmp[i] - tmp[(i + k) % N];
    }
    for (let s = 0; s < (cfg.soft || 0); s++) { let y = 0; for (let i = 0; i < N; i++) { y += 0.5 * (line[i] - y); line[i] = y; } }
    let mx = 0; for (let i = 0; i < N; i++) mx = Math.max(mx, Math.abs(line[i]));
    for (let i = 0; i < N; i++) line[i] /= mx || 1;
    const d = new Float32Array(len);
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const cur = line[idx], nx = line[idx + 1 === N ? 0 : idx + 1];
      d[i] = cur;
      line[idx] = (a * cur + (1 - a) * nx) * rho;
      idx = idx + 1 === N ? 0 : idx + 1;
    }
    const fade = Math.min(len, 2400);
    for (let i = 0; i < fade; i++) d[len - 1 - i] *= i / fade;
    b = c.createBuffer(1, len, sr);
    b.copyToChannel(d, 0);
    b._f0 = sr / (N + 1 - a);
    if (KS.size > 160) KS.clear();
    KS.set(key, b);
    return b;
  }
  const DRIVE = { clean: 0, crunch: 4, lead: 14 };
  function pluck(cfg) {
    return (c, out, p) => {
      const f = p.freq, v = p.vel, t = p.t, R = new Rack(c);
      const g = R.g((cfg.level || 0.6) * (0.45 + 0.55 * v));
      let node = g;
      const lp = R.f('lowpass', cfg.lp || 6000, 0.6);
      node.connect(lp); node = lp;
      const drive = cfg.useDrive ? DRIVE[p.o.drive == null ? 'crunch' : p.o.drive] : 0;
      if (drive) {
        const pre = R.g(1 + drive * 0.5), sh = c.createWaveShaper(); sh.curve = distCurve(drive); sh.oversample = '2x';
        R.nodes.push(sh);
        const cab = R.f('lowpass', 3800, 0.7);
        node.connect(pre); pre.connect(sh); sh.connect(cab); node = cab;
        g.gain.value *= 0.5;
      }
      (cfg.body || []).forEach(([bf, bg, bq]) => { const pk = R.f('peaking', bf, bq); pk.gain.value = bg; node.connect(pk); node = pk; });
      node.connect(out);
      let maxdur = 0;
      (cfg.double ? [-6, 6] : [0]).forEach((cn, i) => {
        const buf = ksBuf(c, f, cfg);
        const s = c.createBufferSource(); s.buffer = buf;
        const rate = (f / buf._f0) * Math.pow(2, cn / 1200);
        s.playbackRate.value = rate;
        const sg = R.g(cfg.double ? 0.6 : 1); s.connect(sg); sg.connect(g);
        s.start(t + i * 0.006);
        R.src.push(s);
        maxdur = Math.max(maxdur, buf.duration / rate + 0.05);
      });
      R.stop(t + maxdur + 0.1);
      return handle(c, R, g, 0.1, true);
    };
  }
  V.guitar = pluck({ id: 'ag', a: 0.52, t60: 3.4, dur: 3.6, pick: 0.12, soft: 1, lp: 6500, body: [[100, 5, 1.2], [210, 3, 1.5]], level: 0.7 });
  V.eguitar = pluck({ id: 'eg', a: 0.6, t60: 5, dur: 4, pick: 0.18, soft: 0, lp: 5200, level: 0.4, useDrive: true });
  V.bass = pluck({ id: 'bs', a: 0.5, t60: 3.2, dur: 3.6, pick: 0.4, soft: 3, lp: 1100, level: 1.0, body: [[90, 4, 1]] });
  V.ukulele = pluck({ id: 'uk', a: 0.5, t60: 1.7, dur: 2.2, pick: 0.15, soft: 2, lp: 4800, level: 0.75, body: [[320, 4, 1.3]] });
  V.banjo = pluck({ id: 'bj', a: 0.72, t60: 1.1, dur: 1.7, soft: 0, lp: 9500, level: 0.7, body: [[900, 5, 1.2], [2200, 3, 1.5]] });
  V.mandolin = pluck({ id: 'md', a: 0.62, t60: 1.6, dur: 2.2, pick: 0.1, soft: 0, lp: 8000, level: 0.55, double: true });
  V.harp = pluck({ id: 'hp', a: 0.5, t60: 5.5, dur: 5.5, pick: 0.28, soft: 2, lp: 5600, level: 0.75, body: [[180, 3, 1]] });
  V.koto = pluck({ id: 'kt', a: 0.58, t60: 2.6, dur: 3.2, pick: 0.2, soft: 0, lp: 6500, level: 0.7, body: [[300, 4, 1.4]] });

  /* =========================================================
     Bowed strings & choir
     ========================================================= */
  function bowed(cfg) {
    return (c, out, p) => sus(c, out, p.t, { a: cfg.a, r: cfg.r, peak: cfg.peak * (0.6 + 0.4 * p.vel) }, (R, g, t) => {
      const f = p.freq;
      const lp = R.f('lowpass', clamp(f * cfg.bright * (0.7 + 0.5 * p.vel), 600, 9000), 0.7);
      const pk = R.f('peaking', cfg.res, 1.4); pk.gain.value = 5;
      lp.connect(pk); pk.connect(g);
      const os = cfg.det.map((d) => { const o = R.osc('sawtooth', f, t, lp); o.detune.value = d; return o; });
      chainN(R, t, [['bandpass', clamp(f * 3, 400, 6000), 1.2]], R.g(cfg.noise)).connect(g);
      vibrato(R, t, os, cfg.vr || 5.4, cfg.vd, cfg.vdelay);
    });
  }
  V.violin = bowed({ a: 0.09, r: 0.2, peak: 0.16, det: [-6, 6], bright: 7, noise: 0.5, res: 2800, vd: 16, vdelay: 0.25, vr: 5.6 });
  V.cello = bowed({ a: 0.14, r: 0.25, peak: 0.15, det: [-5, 5], bright: 5, noise: 0.5, res: 900, vd: 12, vdelay: 0.3, vr: 5 });
  V.strings = bowed({ a: 0.35, r: 0.5, peak: 0.12, det: [-14, -5, 5, 14], bright: 5, noise: 0.3, res: 1800, vd: 8, vdelay: 0.5, vr: 5 });

  const VOW = {
    a: [[800, 9, 3], [1150, 10, 2], [2900, 12, 1.2]], e: [[400, 8, 3.5], [1700, 10, 2], [2600, 12, 1.2]],
    i: [[270, 8, 4], [2150, 10, 2], [2900, 12, 1.4]], o: [[450, 8, 3.5], [800, 10, 2.2], [2830, 12, 1]],
    u: [[325, 8, 4], [700, 9, 2], [2700, 12, 0.8]],
  };
  V.choir = (c, out, p) => sus(c, out, p.t, { a: 0.28, r: 0.45, peak: 0.2 }, (R, g, t) => {
    const f = p.freq, vw = VOW[p.o.vowel] || VOW.a;
    const src = R.g(1);
    const os = [-11, 0, 11].map((d) => { const o = R.osc('sawtooth', f, t, src); o.detune.value = d; return o; });
    vibrato(R, t, os, 5.3, 14, 0.4);
    vw.forEach(([fr, q, amp]) => { const bp = R.f('bandpass', fr, q), bg = R.g(amp); src.connect(bp); bp.connect(bg); bg.connect(g); });
    chainN(R, t, [['bandpass', 1500, 0.8]], R.g(0.05)).connect(g);
  });

  /* =========================================================
     Winds & brass
     ========================================================= */
  function flutey(cfg) {
    return (c, out, p) => sus(c, out, p.t, { a: cfg.a, r: cfg.r || 0.12, peak: cfg.peak * (0.65 + 0.35 * p.vel) }, (R, g, t) => {
      const f = p.freq, os = [];
      cfg.harm.forEach((a, i) => {
        const pf = f * (i + 1); if (pf > 12000) return;
        const og = R.g(a); og.connect(g); os.push(R.osc('sine', pf, t, og));
      });
      chainN(R, t, [['bandpass', clamp(f * (cfg.nf || 2), 300, 9000), cfg.nq || 1.5]], R.g(cfg.noise * (0.6 + 0.8 * p.vel))).connect(g);
      if (cfg.vd) vibrato(R, t, os, cfg.vr || 5, cfg.vd, cfg.vdelay || 0.45);
      if (cfg.chiff) chainN(R, t, [['bandpass', clamp(f * 2, 500, 6000), 1]], env(R, g, t, cfg.chiff, 0.04, 0.005));
    });
  }
  V.flute = flutey({ a: 0.07, peak: 0.26, harm: [1, 0.22, 0.07, 0.03], noise: 0.5, nq: 1.2, vd: 12, vr: 5, vdelay: 0.5, chiff: 0.25 });
  V.recorder = flutey({ a: 0.045, peak: 0.26, harm: [1, 0.09, 0.03], noise: 0.25, nq: 1.5, chiff: 0.12 });
  V.ocarina = flutey({ a: 0.07, peak: 0.27, harm: [1, 0.03], noise: 0.12, nq: 2, vd: 6, vr: 4.5, vdelay: 0.6 });
  V.panflute = flutey({ a: 0.06, peak: 0.25, harm: [1, 0.1], noise: 2.4, nq: 10, nf: 1, chiff: 0.3 });

  function reed(cfg) {
    return (c, out, p) => sus(c, out, p.t, { a: cfg.a, r: cfg.r, peak: cfg.peak * (0.6 + 0.4 * p.vel) }, (R, g, t) => {
      const f = p.freq;
      const lp = R.f('lowpass', clamp(f * cfg.lp + cfg.base, 500, 8000), cfg.q || 1);
      const pk = R.f('peaking', cfg.pf, cfg.pq || 2); pk.gain.value = cfg.pg;
      lp.connect(pk); pk.connect(g);
      const os = [];
      cfg.osc.forEach(([w, d, a]) => {
        const og = R.g(a); og.connect(lp);
        const o = R.osc('sine', f, t, og);
        o.setPeriodicWave(wave(c, w)); o.detune.value = d; os.push(o);
      });
      chainN(R, t, [['highpass', 1500, 0.7]], R.g(cfg.noise)).connect(g);
      vibrato(R, t, os, cfg.vr || 5, cfg.vd, cfg.vdelay || 0.35);
    });
  }
  V.clarinet = reed({ a: 0.05, r: 0.1, peak: 0.19, lp: 5, base: 600, pf: 1500, pg: 4, osc: [['odd', 0, 1]], noise: 0.025, vd: 5 });
  V.sax = reed({ a: 0.04, r: 0.1, peak: 0.22, lp: 5, base: 900, q: 2, pf: 1000, pq: 2, pg: 8, osc: [['reed', 0, 1], ['reed', 7, 0.6]], noise: 0.06, vd: 16, vr: 5.2 });
  V.oboe = reed({ a: 0.04, r: 0.1, peak: 0.2, lp: 7, base: 1000, pf: 1250, pq: 1.5, pg: 10, osc: [['reed', 0, 1], ['reed', -4, 0.5]], noise: 0.03, vd: 9 });

  function brass(cfg) {
    return (c, out, p) => sus(c, out, p.t, { a: cfg.a, r: cfg.r, peak: cfg.peak * (0.6 + 0.4 * p.vel) }, (R, g, t) => {
      const f = p.freq;
      const lp = R.f('lowpass', f * 1.5, cfg.q || 1.2);
      lp.frequency.setValueAtTime(f * 1.5, t);
      lp.frequency.linearRampToValueAtTime(clamp(f * cfg.bright * (0.6 + 0.6 * p.vel), 500, 9000), t + cfg.a * 2.4);
      const pk = R.f('peaking', cfg.pf, 1.4); pk.gain.value = cfg.pg;
      lp.connect(pk); pk.connect(g);
      const os = [-4, 4].map((d) => {
        const o = R.osc('sawtooth', f, t, lp); o.detune.value = d;
        o.frequency.setValueAtTime(f * (1 - cfg.scoop), t); o.frequency.setTargetAtTime(f, t, 0.03); return o;
      });
      chainN(R, t, [['highpass', 2000, 0.7]], R.g(0.02)).connect(g);
      vibrato(R, t, os, 5.2, cfg.vd, 0.5);
    });
  }
  V.trumpet = brass({ a: 0.035, r: 0.1, peak: 0.16, bright: 9, pf: 1500, pg: 6, scoop: 0.02, vd: 10 });
  V.trombone = brass({ a: 0.06, r: 0.14, peak: 0.16, bright: 6, pf: 500, pg: 5, scoop: 0.03, vd: 8 });
  V.horn = brass({ a: 0.09, r: 0.2, peak: 0.17, bright: 4, q: 0.8, pf: 400, pg: 4, scoop: 0.015, vd: 7 });

  /* =========================================================
     Theremin (continuous control)
     ========================================================= */
  V.thereminStart = (c, out, o) => {
    const t = c.currentTime, R = new Rack(c);
    const g = R.g(0); g.connect(out);
    const lp = R.f('lowpass', 3500, 0.5); lp.connect(g);
    const o1 = R.osc(o.wave || 'sine', 440, t, lp);
    const g2 = R.g(0.1); g2.connect(lp);
    const o2 = R.osc('sine', 880, t, g2);
    const vd = o.vibrato == null ? 18 : +o.vibrato;
    const vg = R.g(vd); R.osc('sine', 5.6, t, vg); vg.connect(o1.detune); vg.connect(o2.detune);
    let alive = true;
    return {
      set(freq, amp) {
        if (!alive) return; const n = c.currentTime;
        o1.frequency.setTargetAtTime(freq, n, 0.04); o2.frequency.setTargetAtTime(freq * 2, n, 0.04);
        g.gain.setTargetAtTime(amp * 0.4, n, 0.04);
      },
      release() { if (!alive) return; alive = false; const n = c.currentTime; hold(g.gain, n); g.gain.setTargetAtTime(0, n, 0.06); R.stop(n + 0.6); },
      kill() { this.release(); },
    };
  };

  /* =========================================================
     Drums & percussion (one-shots)
     ========================================================= */
  const D = (V.drums = {});
  const lvl = (v) => 0.35 + 0.65 * v;
  const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];

  D.kick = (c, out, t, v) => shot(c, out, t, 0.7, (R, g) => {
    const a = lvl(v);
    const o = R.osc('sine', 160, t, env(R, g, t, a * 1.05, 0.12));
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    chainN(R, t, [['lowpass', 3500, 0.7]], env(R, g, t, a * 0.45, 0.006));
  });
  D.kick808 = (c, out, t, v) => shot(c, out, t, 1.6, (R, g) => {
    const a = lvl(v);
    const o = R.osc('sine', 150, t, env(R, g, t, a * 1.1, 0.42, 0.002));
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    chainN(R, t, [['lowpass', 2500, 0.7]], env(R, g, t, a * 0.3, 0.005));
  });
  D.snare = (c, out, t, v) => shot(c, out, t, 0.5, (R, g) => {
    const a = lvl(v);
    const o = R.osc('triangle', 230, t, env(R, g, t, a * 0.5, 0.06));
    o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(175, t + 0.04);
    chainN(R, t, [['highpass', 1700, 0.7]], env(R, g, t, a * 0.8, 0.1));
  });
  D.rim = (c, out, t, v) => shot(c, out, t, 0.2, (R, g) => {
    const a = lvl(v);
    R.osc('triangle', 1700, t, env(R, g, t, a * 0.35, 0.012));
    R.osc('sine', 480, t, env(R, g, t, a * 0.4, 0.02));
    chainN(R, t, [['bandpass', 5000, 1]], env(R, g, t, a * 0.4, 0.01));
  });
  D.clap = (c, out, t, v) => shot(c, out, t, 0.5, (R, g) => {
    const a = lvl(v);
    [0, 0.011, 0.022, 0.034].forEach((dt, i) => chainN(R, t + dt, [['bandpass', 1250, 1.4]], env(R, g, t + dt, a * (i < 3 ? 0.6 : 1), i < 3 ? 0.008 : 0.09)));
  });
  function hat(tau, dur) {
    return (c, out, t, v) => shot(c, out, t, dur, (R, g) => {
      const a = lvl(v);
      const mix = R.g(0.2), bp = R.f('bandpass', 10000, 0.8), hp = R.f('highpass', 7000, 0.7);
      mix.connect(bp); bp.connect(hp); hp.connect(env(R, g, t, a * 0.6, tau));
      METAL.forEach((fr) => R.osc('square', fr, t, mix));
      chainN(R, t, [['highpass', 8000, 0.7]], env(R, g, t, a * 0.3, tau));
    });
  }
  D.hatC = hat(0.025, 0.25);
  D.hatO = hat(0.16, 1);
  D.tom = (c, out, t, v, p) => shot(c, out, t, 1.2, (R, g) => {
    const a = lvl(v), f = p.pad.f || 150, tau = p.pad.tau || 0.2;
    const o = R.osc('sine', f * 1.5, t, env(R, g, t, a * 0.9, tau));
    o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    R.osc('sine', f * 1.6, t, env(R, g, t, a * 0.2, tau * 0.5));
    chainN(R, t, [['bandpass', 2500, 1]], env(R, g, t, a * 0.3, 0.012));
  });
  D.crash = (c, out, t, v) => shot(c, out, t, 3.4, (R, g) => {
    const a = lvl(v);
    chainN(R, t, [['highpass', 3500, 0.7]], env(R, g, t, a * 0.55, 0.85, 0.002));
    const mix = R.g(0.12), bp = R.f('bandpass', 6500, 0.7); mix.connect(bp); bp.connect(env(R, g, t, a * 0.5, 0.9));
    METAL.forEach((fr) => R.osc('square', fr * 2.2, t, mix));
  });
  D.ride = (c, out, t, v) => shot(c, out, t, 2.2, (R, g) => {
    const a = lvl(v);
    chainN(R, t, [['bandpass', 8000, 0.8]], env(R, g, t, a * 0.35, 0.3, 0.002));
    const mix = R.g(0.1), bp = R.f('bandpass', 7000, 1); mix.connect(bp); bp.connect(env(R, g, t, a * 0.4, 0.55));
    METAL.forEach((fr) => R.osc('square', fr * 2.7, t, mix));
    R.osc('sine', 3100, t, env(R, g, t, a * 0.12, 0.25));
  });
  D.cowbell = (c, out, t, v) => shot(c, out, t, 0.7, (R, g) => {
    const a = lvl(v), mix = R.g(0.3), bp = R.f('bandpass', 2650, 2.5);
    mix.connect(bp); bp.connect(env(R, g, t, a * 0.9, 0.09));
    R.osc('square', 540, t, mix); R.osc('square', 800, t, mix);
  });
  D.clave = (c, out, t, v) => shot(c, out, t, 0.25, (R, g) => {
    const a = lvl(v);
    R.osc('sine', 2400, t, env(R, g, t, a * 0.7, 0.02)); R.osc('sine', 4900, t, env(R, g, t, a * 0.15, 0.012));
  });
  D.wood = (c, out, t, v) => shot(c, out, t, 0.3, (R, g) => {
    const a = lvl(v), o = R.osc('sine', 900, t, env(R, g, t, a * 0.7, 0.045));
    o.frequency.setValueAtTime(950, t); o.frequency.exponentialRampToValueAtTime(700, t + 0.05);
    R.osc('sine', 1850, t, env(R, g, t, a * 0.25, 0.03));
  });
  function shaker(f, q) {
    return (c, out, t, v) => shot(c, out, t, 0.35, (R, g) => {
      const a = lvl(v);
      chainN(R, t, [['bandpass', f, q]], env(R, g, t, a * 0.7, 0.035, 0.018));
    });
  }
  D.shaker = shaker(7000, 0.9);
  D.maracas = shaker(5200, 1.3);
  D.tamb = (c, out, t, v) => shot(c, out, t, 0.7, (R, g) => {
    const a = lvl(v);
    chainN(R, t, [['highpass', 6000, 0.7]], env(R, g, t, a * 0.5, 0.06));
    chainN(R, t + 0.013, [['highpass', 6000, 0.7]], env(R, g, t + 0.013, a * 0.4, 0.06));
    chainN(R, t, [['bandpass', 9500, 6]], env(R, g, t, a * 0.3, 0.25));
  });
  function ringy(base, ratios, amps, tau, dur) {
    return (c, out, t, v) => shot(c, out, t, dur, (R, g) => {
      const a = lvl(v);
      ratios.forEach((r, i) => R.osc('sine', base * r, t, env(R, g, t, a * 0.4 * amps[i], tau / (1 + i * 0.5))));
      chainN(R, t, [['highpass', 5000, 0.7]], env(R, g, t, a * 0.12, 0.01));
    });
  }
  D.triangle = ringy(2800, [1, 2.7, 4.6, 6.9], [1, 0.5, 0.3, 0.2], 0.8, 3.5);
  D.fingercym = ringy(4200, [1, 2.52, 4.1], [1, 0.5, 0.3], 1.8, 5);

  /* membrane family: pad.f, pad.tau, pad.drop */
  D.drum = (c, out, t, v, p) => shot(c, out, t, 1.3, (R, g) => {
    const a = lvl(v), f = p.pad.f, tau = p.pad.tau || 0.16, drop = p.pad.drop || 1.2;
    const o = R.osc('sine', f * drop, t, env(R, g, t, a * 0.9, tau));
    o.frequency.setValueAtTime(f * drop, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.035);
    R.osc('sine', f * 1.58, t, env(R, g, t, a * 0.22, tau * 0.6));
    R.osc('sine', f * 2.3, t, env(R, g, t, a * 0.1, tau * 0.4));
    chainN(R, t, [['bandpass', 1800, 1]], env(R, g, t, a * 0.28, 0.012));
  });
  D.slap = (c, out, t, v, p) => shot(c, out, t, 0.4, (R, g) => {
    const a = lvl(v), f = p.pad.f || 400;
    chainN(R, t, [['bandpass', p.pad.nf || 2600, 1.4]], env(R, g, t, a * 0.85, 0.05));
    R.osc('sine', f, t, env(R, g, t, a * 0.3, 0.04));
  });
  D.bassdrum = (c, out, t, v, p) => shot(c, out, t, 1.3, (R, g) => {
    const a = lvl(v), f = p.pad.f || 80, tau = p.pad.tau || 0.3;
    const o = R.osc('sine', f * 1.9, t, env(R, g, t, a * 1.0, tau));
    o.frequency.setValueAtTime(f * 1.9, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    chainN(R, t, [['lowpass', 900, 0.7]], env(R, g, t, a * 0.3, 0.05));
  });
  D.dayan = (c, out, t, v, p) => shot(c, out, t, 1.6, (R, g) => {
    const a = lvl(v), f = p.pad.f || 300, tau = p.pad.tau || 0.16;
    (p.pad.parts || [[1, 1], [2, 0.45], [3, 0.25], [4.2, 0.12]]).forEach(([r, am], i) => R.osc('sine', f * r, t, env(R, g, t, a * 0.55 * am, tau / (1 + i * 0.35))));
    chainN(R, t, [['bandpass', 3000, 1]], env(R, g, t, a * 0.3, 0.012));
  });
  D.ge = (c, out, t, v, p) => shot(c, out, t, 1.4, (R, g) => {
    const a = lvl(v), f = p.pad.f || 95;
    const o = R.osc('sine', f * 0.8, t, env(R, g, t, a * 1.0, 0.35, 0.004));
    o.frequency.setValueAtTime(f * 0.8, t); o.frequency.linearRampToValueAtTime(f * 1.3, t + 0.14); o.frequency.setTargetAtTime(f, t + 0.14, 0.15);
    R.osc('sine', f * 2.1, t, env(R, g, t, a * 0.2, 0.2));
  });
  D.dha = (c, out, t, v) => { D.ge(c, out, t, v, { pad: { f: 95 } }); return D.dayan(c, out, t, v, { pad: { f: 300, tau: 0.16 } }); };
  D.dhin = (c, out, t, v) => { D.ge(c, out, t, v, { pad: { f: 95 } }); return D.dayan(c, out, t, v, { pad: { f: 300, tau: 0.6, parts: [[1, 1], [2, 0.5], [3, 0.3]] } }); };
  D.timpani = (c, out, t, v, p) => shot(c, out, t, 3, (R, g) => {
    const a = lvl(v), f = p.freq;
    [[1, 1], [1.5, 0.45], [1.99, 0.3], [2.44, 0.18]].forEach(([r, am], i) => {
      const o = R.osc('sine', f * r * 1.05, t, env(R, g, t, a * 0.7 * am, 1.1 / (1 + i * 0.5), 0.003));
      o.frequency.setValueAtTime(f * r * 1.05, t); o.frequency.exponentialRampToValueAtTime(f * r, t + 0.08);
    });
    chainN(R, t, [['lowpass', 1500, 0.7]], env(R, g, t, a * 0.35, 0.012));
  });

  V.padVoice = (c, out, p) => D[p.pad.snd](c, out, p.t, p.vel, p);
})();
