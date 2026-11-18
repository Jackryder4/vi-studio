/* worklets.js — live Auto-Tune (runs on the audio thread) */
/* global sampleRate, registerProcessor, AudioWorkletProcessor */
class VmiAutoTune extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;
    this.N = 16384; this.buf = new Float32Array(this.N); this.w = 0;            // input ring (full rate)
    this.dN = 4096; this.dbuf = new Float32Array(this.dN); this.dw = 0; this.acc = 0; this.k = 0; // decimated ring (÷2)
    this.W = Math.round(this.sr * 0.03); this.ph = 0;                          // shifter window + phase
    this.ratio = 1; this.target = 1; this.cnt = 0; this.f = 0; this.note = 0; this.post = 0;
    this.o = { on: true, key: 0, scale: [0, 2, 4, 5, 7, 9, 11], speed: 20, amount: 1, mode: 'tune', note: 60 };
    this.dsr = this.sr / 2; this.maxLag = Math.floor(this.dsr / 75); this.Wd = 384;
    this.tmp = new Float32Array(this.Wd + this.maxLag + 2); this.d = new Float32Array(this.maxLag + 2);
    this.port.onmessage = (e) => { Object.assign(this.o, e.data); };
  }
  detect() {
    const L = this.Wd + this.maxLag + 1, x = this.tmp;
    for (let i = 0; i < L; i++) x[i] = this.dbuf[(this.dw - L + i + this.dN * 4) % this.dN];
    let e = 0; for (let i = 0; i < this.Wd; i++) e += x[i] * x[i];
    if (Math.sqrt(e / this.Wd) < 0.008) return 0;
    const d = this.d, minLag = Math.floor(this.dsr / 1000);
    d[0] = 1; let sum = 0;
    for (let tau = 1; tau <= this.maxLag; tau++) {
      let s = 0;
      for (let i = 0; i < this.Wd; i++) { const df = x[i] - x[i + tau]; s += df * df; }
      sum += s; d[tau] = sum > 0 ? (s * tau) / sum : 1;
    }
    for (let t = minLag; t < this.maxLag; t++) {
      if (d[t] < 0.15) {
        while (t + 1 < this.maxLag && d[t + 1] < d[t]) t++;
        const a = d[t - 1], b = d[t], c = d[t + 1], den = a + c - 2 * b;
        const sh = den ? Math.max(-1, Math.min(1, (a - c) / (2 * den))) : 0;
        return this.dsr / (t + sh);
      }
    }
    return 0;
  }
  snap(m) {
    const o = this.o; let best = Math.round(m), bd = 1e9;
    for (let n = Math.floor(m) - 2; n <= Math.ceil(m) + 2; n++) {
      if (o.scale.indexOf((((n - o.key) % 12) + 12) % 12) < 0) continue;
      const dd = Math.abs(n - m); if (dd < bd) { bd = dd; best = n; }
    }
    return best;
  }
  update() {
    const f = this.detect(); this.f = f;
    if (!f) { this.target = 1; this.note = 0; return; }
    const m = 69 + 12 * Math.log2(f / 440);
    let semis;
    if (this.o.mode === 'robot') { semis = this.o.note - m; this.note = this.o.note; }
    else { const t = this.snap(m); this.note = t; semis = (t - m) * this.o.amount; }
    this.target = Math.pow(2, Math.max(-24, Math.min(24, semis)) / 12);
  }
  process(inputs, outputs) {
    const out = outputs[0] && outputs[0][0]; if (!out) return true;
    const inp = inputs[0] && inputs[0][0];
    if (!inp) { out.fill(0); return true; }
    const o = this.o, N = this.N, W = this.W;
    const alpha = o.speed <= 0 ? 1 : 1 - Math.exp(-1 / ((o.speed / 1000) * this.sr));
    for (let i = 0; i < inp.length; i++) {
      const x = inp[i];
      this.buf[this.w] = x; this.w = (this.w + 1) % N;
      this.acc += x; if (++this.k === 2) { this.dbuf[this.dw] = this.acc * 0.5; this.dw = (this.dw + 1) % this.dN; this.acc = 0; this.k = 0; }
      if (++this.cnt >= 256) { this.cnt = 0; this.update(); }
      if (!o.on) { out[i] = x; continue; }
      this.ratio += alpha * (this.target - this.ratio);
      this.ph += (1 - this.ratio) / W; this.ph -= Math.floor(this.ph);
      let y = 0;
      for (let hh = 0; hh < 2; hh++) {
        let p = this.ph + hh * 0.5; if (p >= 1) p -= 1;
        const delay = p * W + 2, pos = this.w - delay + N * 2, i0 = Math.floor(pos), fr = pos - i0;
        const a = this.buf[i0 % N], b = this.buf[(i0 + 1) % N];
        const g = Math.sin(Math.PI * p);
        y += (a + (b - a) * fr) * g * g;
      }
      out[i] = y;
    }
    if (++this.post >= 12) { this.post = 0; this.port.postMessage({ f: this.f, note: this.note }); }
    return true;
  }
}
registerProcessor('vmi-autotune', VmiAutoTune);

/* live beatbox hit detector: finds each sound's start and sends the first ~24 ms to the app for classification */
class VmiOnset extends AudioWorkletProcessor {
  constructor() {
    super();
    this.hop = 64; this.acc = 0; this.n = 0; this.prev = [-100, -100, -100]; this.lastHit = -1e9; this.frame = 0;
    this.thr = 9; this.floor = 0.012; this.gapF = Math.round((0.075 * sampleRate) / 64);
    this.ring = new Float32Array(4096); this.w = 0; this.collect = 0; this.snapStart = 0;
    this.port.onmessage = (e) => { if (e.data.sens != null) { this.thr = 4 + (1 - e.data.sens) * 12; this.floor = 0.004 + (1 - e.data.sens) * 0.02; } };
  }
  process(inputs, outputs) {
    const inp = inputs[0] && inputs[0][0];
    if (outputs[0] && outputs[0][0]) outputs[0][0].fill(0);
    if (!inp) return true;
    for (let i = 0; i < inp.length; i++) {
      const x = inp[i];
      this.ring[this.w] = x; this.w = (this.w + 1) & 4095;
      this.acc += x * x;
      if (this.collect > 0 && --this.collect === 0) {
        const N = 1152, out = new Float32Array(N);
        for (let k = 0; k < N; k++) out[k] = this.ring[(this.snapStart + k) & 4095];
        let pk = 0; for (let k = 0; k < N; k++) pk = Math.max(pk, Math.abs(out[k]));
        this.port.postMessage({ d: out, peak: pk, t: currentTime });
      }
      if (++this.n === this.hop) {
        const rms = Math.sqrt(this.acc / this.hop);
        // peak-hold envelope (fast attack, slow release): waveform wobble of deep kicks can't fake a new hit
        const env = this.env || 1e-6, rise = 20 * Math.log10((rms + 1e-6) / (env + 1e-6));
        this.frame++;
        if (rise > this.thr && rms > this.floor && this.frame - this.lastHit > this.gapF && this.collect === 0) {
          this.lastHit = this.frame; this.snapStart = (this.w - 192 + 4096) & 4095; this.collect = 1152 - 192;
        }
        this.env = Math.max(rms, env * 0.94); this.acc = 0; this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor('vmi-onset', VmiOnset);
