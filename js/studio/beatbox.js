/* beatbox.js — live beatbox → drums, plus a "teach my sounds" classifier that learns YOUR kick/snare/hat */
(function () {
  'use strict';
  const VMI = window.VMI, A = VMI.audio, ST = VMI.st;
  const BB = (VMI.bb = {});
  const h = (...a) => VMI.sui.h(...a);

  BB.CLASSES = [
    ['kick', 'Kick', '“B”, “boom”, “dum”'], ['snare', 'Snare', '“K”, “Pf”, “psh”'], ['hat', 'Hi-hat', '“ts”, “t”, “tk”'],
    ['openhat', 'Open hat', '“tssss”'], ['clap', 'Clap', 'tongue click / “kh”'], ['perc', 'Perc / tom', '“dun”, “pop”, “dok”'],
  ];
  BB.PADS = { kick: ['kick'], snare: ['snare', 'clap'], hat: ['hatC'], openhat: ['hatO', 'hatC'], clap: ['clap', 'snare'], perc: ['tom2', 'tomH', 'tom1', 'rim', 'cow'] };
  BB.COLOR = { kick: '#ff2bd6', snare: '#ffb02e', hat: '#22e6ff', openhat: '#7ff0ff', clap: '#b57cff', perc: '#46d37a' };

  /* ---------- features: 16 log-spaced band energies + brightness + noisiness ---------- */
  const N = 1024, win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  function fft(re, im) { // in-place radix-2
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nc = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nc; } }
    }
  }
  BB.features = (d, sr, start) => {
    const s0 = Math.max(0, Math.round((start || 0) * sr)), re = new Float32Array(N), im = new Float32Array(N);
    let zc = 0, prev = 0, en = 0;
    for (let i = 0; i < N; i++) { const v = d[s0 + i] || 0; re[i] = v * win[i]; en += v * v; if ((v >= 0) !== (prev >= 0)) zc++; prev = v; }
    fft(re, im);
    const mag = new Float32Array(N / 2); let tot = 0, cen = 0;
    for (let k = 1; k < N / 2; k++) { mag[k] = re[k] * re[k] + im[k] * im[k]; tot += mag[k]; cen += mag[k] * k; }
    const bands = [], lo = 40, hi = Math.min(16000, sr / 2 - 100);
    for (let b = 0; b < 16; b++) {
      const f0 = lo * Math.pow(hi / lo, b / 16), f1 = lo * Math.pow(hi / lo, (b + 1) / 16);
      const k0 = Math.max(1, Math.floor((f0 * N) / sr)), k1 = Math.max(k0 + 1, Math.ceil((f1 * N) / sr));
      let s = 0; for (let k = k0; k < k1 && k < N / 2; k++) s += mag[k];
      bands.push(Math.log10(s / (tot + 1e-12) + 1e-6) / 6 + 1); // 0..1-ish, loudness-independent
    }
    const centroid = (cen / (tot + 1e-12)) * (sr / N);
    return bands.concat([Math.log2(centroid / 100 + 1) / 8, (zc / N) * 4, Math.min(1, Math.sqrt(en / N) * 6)]);
  };

  /* ---------- model: your examples per class, k-nearest-neighbour ---------- */
  const KEY = 'wm.bbmodel';
  BB.model = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })();
  BB.save = () => { try { localStorage.setItem(KEY, JSON.stringify(BB.model)); } catch (e) { /* ignore */ } };
  BB.trained = () => Object.keys(BB.model).filter((k) => (BB.model[k] || []).length >= 2).length >= 2;
  BB.classify = (f) => {
    if (BB.trained()) {
      const all = [];
      Object.keys(BB.model).forEach((k) => (BB.model[k] || []).forEach((v) => { let d = 0; for (let i = 0; i < f.length - 1; i++) { const w = i < 16 ? 1 : 2.5; d += w * (f[i] - v[i]) * (f[i] - v[i]); } all.push([d, k]); }));
      all.sort((a, b) => a[0] - b[0]);
      const vote = {}; all.slice(0, 3).forEach(([d, k], i) => { vote[k] = (vote[k] || 0) + (3 - i) / (d + 1e-3); });
      return Object.keys(vote).sort((a, b) => vote[b] - vote[a])[0];
    }
    // untrained: spectral rules
    const low = f[0] + f[1] + f[2] + f[3], mid = f[6] + f[7] + f[8] + f[9], high = f[12] + f[13] + f[14] + f[15], cen = f[16];
    if (cen < 0.45 && low > high + 1) return 'kick';          // energy sits in the bass
    if (high - mid > 0.9 || cen > 0.85) return 'hat';         // bright, hissy, little body
    return 'snare';                                           // broad noisy burst
  };
  /* Beatbox Lab + offline analysis use the same brain */
  const origClassify = ST.an.classify;
  ST.an.classify = (data, sr, start, end) => {
    const f = BB.features(data, sr, start);
    const c = BB.classify(f);
    if (!BB.trained() && c === 'snare') { const o = origClassify(data, sr, start, end); return o === 'perc' ? 'snare' : o; }
    return c === 'openhat' ? 'hat' : c === 'clap' ? 'snare' : c;
  };

  /* ---------- live detector on the microphone ---------- */
  let node = null, sink = null, listeners = new Set();
  BB.sens = 0.5;
  BB.start = async () => {
    await ST.micOpen(); ST.ensure(); A.resume();
    const c = ST.ctx;
    if (!node) {
      await VMI.FX.loadWorklet(c);
      node = new AudioWorkletNode(c, 'vmi-onset', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      sink = c.createGain(); sink.gain.value = 0; node.connect(sink); sink.connect(c.destination);
      node.port.onmessage = (e) => {
        const f = BB.features(e.data.d, c.sampleRate, 192 / c.sampleRate * 0.5);
        const cls = BB.classify(f), vel = Math.max(0.35, Math.min(1, e.data.peak * 2.2));
        listeners.forEach((fn) => { try { fn(cls, vel, f); } catch (err) { console.error(err); } });
      };
    }
    try { ST.mic.src.disconnect(node); } catch (e) { /* ignore */ }
    ST.mic.src.connect(node);
    node.port.postMessage({ sens: BB.sens });
  };
  BB.setSens = (s) => { BB.sens = s; if (node) node.port.postMessage({ sens: s }); };
  BB.listen = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
  BB.stop = () => { listeners.clear(); if (node && ST.mic.src) { try { ST.mic.src.disconnect(node); } catch (e) { /* ignore */ } } };

  /* live mode on a drum track: your hits trigger the kit (and record if you press ● Record) */
  let liveOff = null;
  BB.live = { on: false };
  BB.toggleLive = async (inst, onHit) => {
    if (BB.live.on) { BB.live.on = false; if (liveOff) liveOff(); liveOff = null; BB.stop(); return false; }
    try { await BB.start(); } catch (e) { ST.toast('⚠ Microphone: ' + (e.message || 'blocked'), 'warn'); return false; }
    BB.live.on = true;
    liveOff = BB.listen((cls, vel) => {
      const pid = (BB.PADS[cls] || []).find((id) => inst.cfg.pads.some((p) => p.id === id)); if (!pid) return;
      const pad = inst.cfg.pads.find((p) => p.id === pid), spec = { pad, choke: pad.choke };
      const hd = VMI.sui.sapp.start(inst, spec, vel); setTimeout(() => VMI.sui.sapp.stop(inst, hd), 60);
      if (onHit) onHit(pid, cls);
    });
    return true;
  };

  /* ---------- "Teach my sounds" window ---------- */
  BB.trainer = () => {
    let target = null, off = null;
    const rows = h('div', { class: 'bbt-rows' }), big = h('div', { class: 'bbt-big' }, 'Make a sound…');
    const sens = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: BB.sens, oninput: (e) => BB.setSens(+e.target.value) });
    const paint = () => {
      rows.innerHTML = '';
      BB.CLASSES.forEach(([k, name, hint]) => {
        const n = (BB.model[k] || []).length;
        rows.append(h('div', { class: 'bbt-row' + (target === k ? ' rec' : ''), style: '--c:' + BB.COLOR[k] },
          h('b', null, name), h('span', { class: 'muted small' }, hint),
          h('span', { class: 'bbt-dots' }, Array.from({ length: Math.max(5, n) }, (_, i) => h('i', { class: i < n ? 'on' : '' }))),
          h('button', { class: 'btn xs' + (target === k ? ' accent' : ''), onclick: () => { target = target === k ? null : k; paint(); } }, target === k ? '■ Stop' : '● Teach'),
          h('button', { class: 'btn xs', disabled: !n, onclick: () => { delete BB.model[k]; BB.save(); paint(); } }, 'Clear')));
      });
    };
    const body = h('div', { class: 'bbt' },
      h('p', { class: 'muted small' }, 'Teach WACK MUZIC your own beatbox sounds so it converts them reliably. Click ● Teach next to a sound, then make that sound 4–6 times with short gaps. Repeat for each sound you use. Test it at the top: the big label shows what it hears.'),
      big,
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Sensitivity'), sens),
      rows,
      h('div', { class: 'row' }, h('button', { class: 'btn danger xs', onclick: () => { if (confirm('Forget all taught sounds?')) { BB.model = {}; BB.save(); paint(); } } }, 'Reset everything'), h('span', { class: 'muted small' }, BB.trained() ? '✔ Using your taught sounds' : 'Not trained yet: using automatic detection')));
    const m = VMI.sui.modal('🧠 Teach my beatbox sounds', body, { onclose: () => { if (off) off(); if (!BB.live.on) BB.stop(); } });
    paint();
    BB.start().then(() => {
      off = BB.listen((cls, vel, f) => {
        if (target) { (BB.model[target] = BB.model[target] || []).push(f.map((x) => +x.toFixed(4))); if (BB.model[target].length > 12) BB.model[target].shift(); BB.save(); paint(); big.textContent = '+1 ' + BB.CLASSES.find((c) => c[0] === target)[1]; big.style.color = BB.COLOR[target]; }
        else { const name = BB.CLASSES.find((c) => c[0] === cls); big.textContent = name ? name[1] : cls; big.style.color = BB.COLOR[cls] || '#fff'; }
        big.classList.remove('hit'); void big.offsetWidth; big.classList.add('hit');
      });
    }).catch((e) => { big.textContent = '⚠ ' + (e.message || 'Microphone blocked'); });
  };
})();
