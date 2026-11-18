/* pitch.js — pitch detection (YIN), Auto-Tune, PSOLA pitch shifting, voice FX, melody extraction, key detection */
(function () {
  'use strict';
  const VMI = window.VMI;
  const P = (VMI.pitch = {});
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const ftom = (f) => 69 + 12 * Math.log2(f / 440);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  P.ftom = ftom; P.mtof = mtof;

  P.SCALES = {
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10],
    'pentatonic major': [0, 2, 4, 7, 9], 'pentatonic minor': [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10],
    'harmonic minor': [0, 2, 3, 5, 7, 8, 11], dorian: [0, 2, 3, 5, 7, 9, 10],
  };
  P.KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  /** nearest note (fractional midi in → integer midi out) allowed by key + scale */
  P.snap = (m, key, scale) => {
    const sc = P.SCALES[scale] || P.SCALES.chromatic;
    let best = Math.round(m), bd = 1e9;
    for (let n = Math.floor(m) - 2; n <= Math.ceil(m) + 2; n++) {
      if (!sc.includes((((n - key) % 12) + 12) % 12)) continue;
      const d = Math.abs(n - m); if (d < bd) { bd = d; best = n; }
    }
    return best;
  };

  /* ---------- YIN pitch tracking ---------- */
  function decimate(data, D) {
    if (D <= 1) return data;
    const n = Math.floor(data.length / D), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < D; k++) s += data[i * D + k]; out[i] = s / D; }
    return out;
  }
  function yinAt(x, off, W, sr, minF, maxF, thr, d) {
    const maxLag = Math.min(Math.floor(sr / minF), x.length - off - W - 1), minLag = Math.max(2, Math.floor(sr / maxF));
    if (maxLag <= minLag + 2) return [0, 0];
    d[0] = 1; let sum = 0;
    for (let tau = 1; tau <= maxLag; tau++) {
      let s = 0;
      for (let i = 0; i < W; i++) { const df = x[off + i] - x[off + i + tau]; s += df * df; }
      sum += s; d[tau] = sum > 0 ? (s * tau) / sum : 1;
    }
    let tau = -1;
    for (let t = minLag; t <= maxLag; t++) { if (d[t] < thr) { while (t + 1 <= maxLag && d[t + 1] < d[t]) t++; tau = t; break; } }
    if (tau < 0) return [0, 0];
    const a = d[tau - 1], b = d[tau], c = d[tau + 1] != null ? d[tau + 1] : b;
    const den = a + c - 2 * b, sh = den ? (a - c) / (2 * den) : 0;
    return [sr / (tau + clamp(sh, -1, 1)), 1 - b];
  }
  /** returns {hop, f0:Float32Array (Hz, 0 = unvoiced), rms:Float32Array} with hop in original samples */
  P.track = (data, sr, o) => {
    o = o || {};
    const D = Math.max(1, Math.floor(sr / 16000)), x = decimate(data, D), dsr = sr / D;
    const hop = 128, W = 512, minF = o.minF || 70, maxF = o.maxF || 1100;
    const n = Math.max(0, Math.floor((x.length - W) / hop));
    const f0 = new Float32Array(n), rms = new Float32Array(n), d = new Float32Array(Math.floor(dsr / minF) + 2);
    let mx = 0;
    for (let i = 0; i < n; i++) { let s = 0; const off = i * hop; for (let k = 0; k < W; k++) s += x[off + k] * x[off + k]; rms[i] = Math.sqrt(s / W); if (rms[i] > mx) mx = rms[i]; }
    const gate = Math.max(0.004, mx * 0.06);
    for (let i = 0; i < n; i++) {
      if (rms[i] < gate) continue;
      const [f, conf] = yinAt(x, i * hop, W, dsr, minF, maxF, 0.15, d);
      if (f && conf > 0.5) f0[i] = f;
    }
    // median-of-3 to remove octave glitches
    const sm = Float32Array.from(f0);
    for (let i = 1; i < n - 1; i++) { if (f0[i] && f0[i - 1] && f0[i + 1]) { const a = [f0[i - 1], f0[i], f0[i + 1]].sort((p, q) => p - q); sm[i] = a[1]; } }
    return { hop: hop * D, f0: sm, rms, sr };
  };
  const at = (tr, s) => { const i = clamp(Math.floor(s / tr.hop), 0, tr.f0.length - 1); return tr.f0[i] || 0; };

  /* ---------- TD-PSOLA pitch shifter ---------- */
  /** ratioAt(sampleIndex, f0) → pitch ratio (1 = unchanged). Formants stay put, so voices stay natural. */
  P.psola = (data, sr, tr, ratioAt) => {
    const len = data.length, out = new Float32Array(len), wsum = new Float32Array(len);
    // analysis marks: pitch-synchronous in voiced parts, every 5 ms elsewhere
    const marks = [], per = [];
    let t = 0;
    while (t < len) {
      const f = at(tr, t);
      let p = f ? sr / f : Math.round(sr * 0.005);
      if (f) { // snap mark to local peak
        const lo = Math.max(0, Math.round(t - p / 4)), hi = Math.min(len - 1, Math.round(t + p / 4));
        let bi = Math.round(t), bv = -1;
        for (let k = lo; k <= hi; k++) { const v = Math.abs(data[k]); if (v > bv) { bv = v; bi = k; } }
        t = Math.max(t, bi);
      }
      marks.push(Math.round(t)); per.push(Math.max(16, Math.round(p)));
      t += p;
    }
    let mi = 0, o = 0;
    while (o < len) {
      while (mi + 1 < marks.length && Math.abs(marks[mi + 1] - o) <= Math.abs(marks[mi] - o)) mi++;
      const c = marks[mi], P0 = per[mi], f = at(tr, c);
      const r = f ? clamp(ratioAt(c, f), 0.25, 4) : 1;
      const half = P0;
      for (let k = -half; k < half; k++) {
        const si = c + k, di = Math.round(o) + k;
        if (si < 0 || si >= len || di < 0 || di >= len) continue;
        const w = 0.5 + 0.5 * Math.cos((Math.PI * k) / half);
        out[di] += data[si] * w; wsum[di] += w;
      }
      o += f ? P0 / r : P0;
    }
    for (let i = 0; i < len; i++) out[i] = wsum[i] > 1e-4 ? out[i] / Math.max(wsum[i], 0.5) : 0;
    return out;
  };

  /* ---------- Auto-Tune (offline) ---------- */
  /** o: {key 0-11, scale, speed (ms, 0 = hard snap), amount 0-1, humanize} */
  P.autotune = (data, sr, o, tr) => {
    tr = tr || P.track(data, sr);
    const n = tr.f0.length, shift = new Float32Array(n);
    const a = o.speed > 0 ? 1 - Math.exp(-(tr.hop / sr) / (o.speed / 1000)) : 1;
    let s = 0, prevVoiced = false;
    for (let i = 0; i < n; i++) {
      const f = tr.f0[i];
      if (!f) { prevVoiced = false; continue; }
      const m = ftom(f), target = P.snap(m, o.key, o.scale);
      const want = (target - m) * (o.amount == null ? 1 : o.amount);
      s = prevVoiced ? s + a * (want - s) : want;
      shift[i] = s; prevVoiced = true;
    }
    const out = P.psola(data, sr, tr, (idx) => Math.pow(2, shift[clamp(Math.floor(idx / tr.hop), 0, n - 1)] / 12));
    return { out, tr, shift };
  };
  /** robot voice: every syllable on one note (or follow the scale with hard snap) */
  P.robot = (data, sr, note) => {
    const tr = P.track(data, sr);
    return P.psola(data, sr, tr, (idx, f) => mtof(note) / f);
  };
  P.shift = (data, sr, semis, tr) => P.psola(data, sr, tr || P.track(data, sr), () => Math.pow(2, semis / 12));
  /** harmonizer: adds diatonic voices above/below and mixes them with the dry voice */
  P.harmonize = (data, sr, o) => {
    const tr = P.track(data, sr), sc = P.SCALES[o.scale] || P.SCALES.major;
    const step = (m, k) => { // move k scale steps from note m
      let n = P.snap(m, o.key, o.scale), c = 0; const dir = Math.sign(k);
      while (c < Math.abs(k)) { n += dir; if (sc.includes((((n - o.key) % 12) + 12) % 12)) c++; }
      return n;
    };
    const out = Float32Array.from(data);
    o.voices.forEach((k) => {
      const v = P.psola(data, sr, tr, (idx, f) => { const m = ftom(f); return mtof(step(m, k)) / f; });
      for (let i = 0; i < out.length; i++) out[i] += v[i] * 0.7;
    });
    let mx = 0; for (let i = 0; i < out.length; i++) mx = Math.max(mx, Math.abs(out[i]));
    if (mx > 0.98) for (let i = 0; i < out.length; i++) out[i] *= 0.98 / mx;
    return out;
  };

  /* ---------- melody extraction ---------- */
  /** returns notes [{t (seconds), d (seconds), n (midi), v}] */
  P.melody = (data, sr, o) => {
    o = o || {};
    const tr = P.track(data, sr), n = tr.f0.length, dt = tr.hop / sr;
    let mx = 0; tr.rms.forEach((v) => { if (v > mx) mx = v; });
    const notes = []; let cur = null;
    const close = (i) => { if (cur && (i - cur.i0) * dt >= (o.minDur || 0.08)) { const ms = cur.ms.sort((a, b) => a - b); cur.n = Math.round(ms[Math.floor(ms.length / 2)]); notes.push({ t: cur.i0 * dt, d: (i - cur.i0) * dt, n: cur.n, v: clamp(0.4 + 0.6 * (cur.pk / (mx || 1)), 0.3, 1) }); } cur = null; };
    for (let i = 0; i < n; i++) {
      const f = tr.f0[i];
      if (!f) { close(i); continue; }
      let m = ftom(f); if (o.key != null) m = P.snap(m, o.key, o.scale);
      const r = Math.round(m);
      const onset = i > 2 && tr.rms[i] > tr.rms[i - 2] * 2.2 && tr.rms[i] > mx * 0.15;
      if (cur && (Math.abs(m - cur.ref) > 0.7 || onset)) close(i);
      if (!cur) cur = { i0: i, ref: r, ms: [], pk: 0 };
      cur.ms.push(m); cur.pk = Math.max(cur.pk, tr.rms[i]);
      if (cur.ms.length > 3) cur.ref = cur.ms.slice(-4).reduce((a, b) => a + b, 0) / 4;
    }
    close(n);
    return notes;
  };

  /* ---------- key detection (Krumhansl-Schmuckler) ---------- */
  const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  P.detectKey = (data, sr, tr) => {
    tr = tr || P.track(data, sr);
    const h = new Array(12).fill(0);
    tr.f0.forEach((f, i) => { if (f) h[((Math.round(ftom(f)) % 12) + 12) % 12] += tr.rms[i]; });
    let best = { key: 0, scale: 'major', r: -2 };
    const corr = (prof, k) => { const mh = h.reduce((a, b) => a + b, 0) / 12, mp = prof.reduce((a, b) => a + b, 0) / 12; let nu = 0, da = 0, db = 0; for (let i = 0; i < 12; i++) { const x = h[(i + k) % 12] - mh, y = prof[i] - mp; nu += x * y; da += x * x; db += y * y; } return nu / Math.sqrt(da * db || 1); };
    for (let k = 0; k < 12; k++) { const a = corr(MAJ, k), b = corr(MIN, k); if (a > best.r) best = { key: k, scale: 'major', r: a }; if (b > best.r) best = { key: k, scale: 'minor', r: b }; }
    return best;
  };
})();
