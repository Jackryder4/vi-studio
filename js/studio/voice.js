/* voice.js — vocal production: live Auto-Tune monitor, Voice Lab (Auto-Tune, voice FX, vocoder, melody→instrument), vocoder instrument */
(function () {
  'use strict';
  const VMI = window.VMI, A = VMI.audio, ST = VMI.st, P = VMI.pitch;
  const VO = (VMI.voice = {});
  const clamp = ST.clamp;
  const h = (...a) => VMI.sui.h(...a);
  const U = () => VMI.sui;

  const DEF = { monitor: false, live: false, tuneTakes: false, key: 0, scale: 'major', speed: 20, amount: 1, mode: 'tune', note: 60, mon: 0.9 };
  VO.settings = (t) => { if (!t.vocal) t.vocal = Object.assign({}, DEF); return t.vocal; };

  /* =========================================================
     Live chain: mic → Auto-Tune worklet → track strip
     ========================================================= */
  const LV = (VO.live = { node: null, mon: null, track: null, info: { f: 0, note: 0 }, failed: false });
  LV.ensure = async () => {
    ST.ensure();
    const c = ST.ctx;
    if (LV.node) return LV.node;
    if (!c.audioWorklet) throw new Error('Live Auto-Tune needs a modern browser on https:// or localhost');
    await c.audioWorklet.addModule('js/studio/worklets.js?v=19');
    LV.node = new AudioWorkletNode(c, 'vmi-autotune', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    LV.node.port.onmessage = (e) => { LV.info = e.data; };
    LV.mon = c.createGain(); LV.node.connect(LV.mon);
    return LV.node;
  };
  LV.push = (v) => {
    if (!LV.node) return;
    LV.node.port.postMessage({ on: !!v.live, key: +v.key, scale: P.SCALES[v.scale] || P.SCALES.major, speed: +v.speed, amount: +v.amount, mode: v.mode, note: +v.note });
  };
  /** route (or un-route) the microphone into a track for monitoring */
  VO.setMonitor = async (t) => {
    const v = VO.settings(t);
    if (!v.monitor && !v.live) { VO.stopMonitor(); return; }
    try {
      await ST.micOpen();
      await LV.ensure();
    } catch (e) { v.monitor = false; ST.toast('⚠ ' + (e.message || 'Microphone blocked'), 'warn'); VO.stopMonitor(); return false; }
    ST.sync();
    const strip = ST.graph.strips.get(t.id);
    try { ST.mic.src.disconnect(LV.node); } catch (e) { /* ignore */ }
    try { LV.mon.disconnect(); } catch (e) { /* ignore */ }
    ST.mic.src.connect(LV.node);
    LV.mon.gain.value = v.monitor ? v.mon : 0;
    if (strip) LV.mon.connect(strip.input);
    LV.track = t.id; LV.push(v);
    return true;
  };
  VO.stopMonitor = () => {
    if (!LV.node) return;
    try { ST.mic.src && ST.mic.src.disconnect(LV.node); } catch (e) { /* ignore */ }
    try { LV.mon.disconnect(); } catch (e) { /* ignore */ }
    LV.track = null;
  };

  /* =========================================================
     Vocal chain panel (Play tab of an audio track)
     ========================================================= */
  let raf = 0;
  VO.panel = (body, t) => {
    cancelAnimationFrame(raf);
    const v = VO.settings(t);
    const save = () => { ST.autosave(); LV.push(v); };
    const sel = (opts, val, on) => { const s = h('select', { class: 'sel', onchange: (e) => on(e.target.value) }, opts.map(([k, l]) => h('option', { value: k, selected: String(val) === String(k) }, l))); return s; };
    const sw = (val, on) => { const i = h('input', { type: 'checkbox', class: 'sw', onchange: (e) => on(e.target.checked) }); i.checked = !!val; return i; };
    const field = (label, node, cls) => h('label', { class: 'field ' + (cls || '') }, h('span', { class: 'flabel' }, label), node);
    const speedOut = h('output', null, v.speed + ' ms');
    const amtOut = h('output', null, Math.round(v.amount * 100) + '%');
    const noteSel = sel(Array.from({ length: 25 }, (_, i) => [48 + i, A.m2n(48 + i)]), v.note, (x) => { v.note = +x; save(); });
    const tuner = h('canvas', { class: 'tuner' });
    const noteBig = h('div', { class: 'tn-note' }, '–');
    const centsBar = h('div', { class: 'tn-cents' }, h('i'));
    const lvl = h('div', { class: 'qmeter' }, h('i'));
    body.innerHTML = '';
    body.append(
      h('div', { class: 'play-tools' },
        h('span', { class: 'pt-name' }, '🎤 Vocal chain · ' + t.name),
        h('button', { class: 'btn xs accent', onclick: () => ST.record() }, '● Record take'),
        field('Hear yourself', sw(v.monitor, async (x) => { v.monitor = x; save(); await VO.setMonitor(t); })),
        field('Live Auto-Tune', sw(v.live, async (x) => { v.live = x; save(); await VO.setMonitor(t); })),
        field('Auto-Tune takes', sw(v.tuneTakes, (x) => { v.tuneTakes = x; save(); })),
        h('span', { class: 'muted small hint-inline' }, '🎧 Use headphones when “Hear yourself” is on, or you’ll get feedback.')),
      h('div', { class: 'vocal' },
        h('div', { class: 'vc-tuner' }, noteBig, centsBar, tuner, h('div', { class: 'vc-lvl' }, h('span', { class: 'flabel' }, 'Input'), lvl)),
        h('div', { class: 'vc-ctrl' },
          h('div', { class: 'vc-h' }, 'Auto-Tune'),
          field('Key', sel(P.KEYS.map((k, i) => [i, k]), v.key, (x) => { v.key = +x; save(); })),
          field('Scale', sel(Object.keys(P.SCALES).map((k) => [k, k[0].toUpperCase() + k.slice(1)]), v.scale, (x) => { v.scale = x; save(); })),
          field('Mode', sel([['tune', 'Auto-Tune (snap to scale)'], ['robot', 'Robot (one note)']], v.mode, (x) => { v.mode = x; save(); })),
          field('Robot note', noteSel),
          field('Retune speed', h('span', { class: 'sl' }, h('input', { type: 'range', min: 0, max: 200, step: 1, value: v.speed, oninput: (e) => { v.speed = +e.target.value; speedOut.textContent = v.speed + ' ms' + (v.speed < 8 ? ' (hard)' : v.speed > 80 ? ' (natural)' : ''); save(); } }), speedOut)),
          field('Amount', h('span', { class: 'sl' }, h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: v.amount, oninput: (e) => { v.amount = +e.target.value; amtOut.textContent = Math.round(v.amount * 100) + '%'; save(); } }), amtOut)),
          h('p', { class: 'muted small' }, 'Retune speed 0 ms = the hard robotic “T-Pain” effect. 40–80 ms = subtle, natural correction. Use the Mixer for reverb, echo and the compressor (C).'))));
    const ln = [];
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!body.isConnected) { cancelAnimationFrame(raf); return; }
      lvl.firstChild.style.width = Math.min(100, Math.pow(ST.micLevel(), 0.5) * 100) + '%';
      const f = LV.track === t.id ? LV.info.f : 0;
      if (!f && ST.mic.an && LV.track !== t.id) { /* mic open but not routed: show nothing */ }
      const m = f ? P.ftom(f) : 0;
      ln.push(m); if (ln.length > 240) ln.shift();
      if (f) {
        const target = v.mode === 'robot' ? v.note : P.snap(m, v.key, v.scale), c = (m - Math.round(m)) * 100;
        noteBig.textContent = A.m2n(Math.round(m)) + (v.live ? ' → ' + A.m2n(target) : '');
        centsBar.firstChild.style.left = 50 + clamp(c, -50, 50) + '%';
        centsBar.firstChild.style.background = Math.abs(c) < 10 ? '#46d37a' : Math.abs(c) < 25 ? '#ffd84d' : '#ff4458';
      }
      // pitch trail
      const w = tuner.clientWidth || 300, hh = tuner.clientHeight || 90, dpr = Math.min(2, devicePixelRatio || 1);
      if (tuner.width !== w * dpr) { tuner.width = w * dpr; tuner.height = hh * dpr; }
      const g = tuner.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
      const vis = ln.filter((x) => x), mid = vis.length ? vis[vis.length - 1] : 60, lo = Math.round(mid) - 6;
      const yOf = (mm) => hh - ((mm - lo) / 12) * hh;
      const sc = P.SCALES[v.scale] || P.SCALES.major;
      for (let n = lo; n <= lo + 12; n++) {
        const inS = sc.includes((((n - v.key) % 12) + 12) % 12);
        g.fillStyle = inS ? '#ffffff22' : '#ffffff08'; g.fillRect(0, yOf(n), w, 1);
        if (inS) { g.fillStyle = '#8b93a1'; g.font = '10px system-ui'; g.fillText(A.m2n(n), 4, yOf(n) - 2); }
      }
      g.strokeStyle = '#ffb02e'; g.lineWidth = 2; g.beginPath(); let pen = false;
      ln.forEach((mm, i) => { const x = (i / 240) * w; if (!mm) { pen = false; return; } const y = yOf(mm); if (pen) g.lineTo(x, y); else g.moveTo(x, y); pen = true; });
      g.stroke();
      if (!ST.mic.an) { g.fillStyle = '#8b93a1'; g.font = '13px system-ui'; g.fillText('Turn on “Hear yourself” or “Live Auto-Tune” to see your pitch', 40, hh / 2); }
    };
    loop();
    if (v.monitor || v.live) VO.setMonitor(t);
  };
  VO.leave = () => { cancelAnimationFrame(raf); };

  /* auto-tune new takes */
  ST.on('take', ({ t, c, s }) => {
    const v = t.vocal; if (!v || !v.tuneTakes) return;
    setTimeout(async () => {
      const { out } = P.autotune(s.ch[0], s.sr, v);
      const ns = await ST.lib.addRaw([out], s.sr, s.name + ' (tuned)', 'edit');
      c.raw = s.id; c.sample = ns.id; c.name = ns.name; ST.touch(); ST.toast('Take auto-tuned to ' + P.KEYS[v.key] + ' ' + v.scale);
    }, 30);
  });

  /* =========================================================
     Vocoder
     ========================================================= */
  const absCurve = (() => { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = Math.abs((i * 2) / (n - 1) - 1); return c; })();
  function buildVocoder(c, modulator, out, bands) {
    bands = bands || 20;
    const carrier = c.createGain(), outG = c.createGain(); outG.gain.value = 3.2; outG.connect(out);
    const pre = c.createBiquadFilter(); pre.type = 'highpass'; pre.frequency.value = 70; modulator.connect(pre);
    const lo = 110, hi = 7500;
    for (let b = 0; b < bands; b++) {
      const f = lo * Math.pow(hi / lo, b / (bands - 1)), q = 7;
      const mb = c.createBiquadFilter(); mb.type = 'bandpass'; mb.frequency.value = f; mb.Q.value = q;
      const rect = c.createWaveShaper(); rect.curve = absCurve;
      const env = c.createBiquadFilter(); env.type = 'lowpass'; env.frequency.value = 28;
      const eg = c.createGain(); eg.gain.value = 5;
      pre.connect(mb); mb.connect(rect); rect.connect(env); env.connect(eg);
      const cb = c.createBiquadFilter(); cb.type = 'bandpass'; cb.frequency.value = f; cb.Q.value = q;
      const cb2 = c.createBiquadFilter(); cb2.type = 'bandpass'; cb2.frequency.value = f; cb2.Q.value = q;
      const vca = c.createGain(); vca.gain.value = 0;
      carrier.connect(cb); cb.connect(cb2); cb2.connect(vca); vca.connect(outG);
      eg.connect(vca.gain);
    }
    // sibilance ("s", "t") passes through as filtered noise
    const sh = c.createBiquadFilter(); sh.type = 'highpass'; sh.frequency.value = 5500; pre.connect(sh);
    const sr = c.createWaveShaper(); sr.curve = absCurve; const se = c.createBiquadFilter(); se.type = 'lowpass'; se.frequency.value = 40;
    const sg = c.createGain(); sg.gain.value = 0; sh.connect(sr); sr.connect(se); se.connect(sg.gain);
    const nz = A.noiseSrc(c); const nh = c.createBiquadFilter(); nh.type = 'highpass'; nh.frequency.value = 5000;
    const ng = c.createGain(); ng.gain.value = 1.5; nz.connect(nh); nh.connect(sg); sg.connect(ng); ng.connect(outG); nz.start();
    return { carrier, nz };
  }
  VO.buildVocoder = buildVocoder;
  const banks = new WeakMap();
  let micAsked = false;
  function vocoderVoice(c, out, p) {
    if (typeof OfflineAudioContext !== 'undefined' && c instanceof OfflineAudioContext) return null;
    if (!ST.mic.src || ST.mic.src.context !== c) {
      if (!micAsked) { micAsked = true; ST.micOpen().then(() => ST.toast('Mic on — hold keys and talk or sing to play the vocoder')).catch((e) => ST.toast('⚠ Vocoder needs the microphone: ' + (e.message || 'blocked'), 'warn')).finally(() => { setTimeout(() => { micAsked = false; }, 2000); }); }
      return null;
    }
    let bank = banks.get(out);
    if (!bank) { bank = buildVocoder(c, ST.mic.src, out); banks.set(out, bank); }
    const t = p.t, o = p.o || {}, g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.01); g.connect(bank.carrier);
    const oscs = [0, 7, -7].map((det) => { const os = c.createOscillator(); os.type = o.carrier || 'sawtooth'; os.frequency.value = p.freq; os.detune.value = det; os.connect(g); os.start(t); return os; });
    if (o.octave) { const os = c.createOscillator(); os.type = 'square'; os.frequency.value = p.freq / 2; const sg = c.createGain(); sg.gain.value = 0.5; os.connect(sg); sg.connect(g); os.start(t); oscs.push(os); }
    let done = false;
    const end = (tau, when) => { if (done) return; done = true; const n = Math.max(c.currentTime, when || 0); g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(0, n, tau); oscs.forEach((os) => { try { os.stop(n + tau * 8); } catch (e) { /* ignore */ } }); oscs[0].onended = () => g.disconnect(); };
    return { release(when) { end(0.06, when); }, kill(when) { end(0.01, when); } };
  }
  const vocInst = {
    id: 'vocoder', name: 'Vocoder', cat: 'elec', emoji: '🤖', desc: 'Talk or sing into the mic while playing keys — the classic robot-choir voice.',
    layout: 'keys', cfg: { skin: 'synth', start: 48, min: 36, max: 84 }, voice: vocoderVoice, reverb: 0.3, gain: 1,
    controls: [{ id: 'carrier', label: 'Carrier', type: 'select', options: [['sawtooth', 'Saw (bright)'], ['square', 'Square (hollow)'], ['triangle', 'Triangle (soft)']], value: 'sawtooth' }, { id: 'octave', label: 'Sub octave', type: 'toggle', value: true }],
  };
  VMI.instruments.push(vocInst); VMI.byId.vocoder = vocInst;

  /* =========================================================
     Voice Lab (offline processing of a recorded clip)
     ========================================================= */
  async function swap(clip, data, sr, label) {
    const base = ST.lib.samples.get(clip.sample);
    const ns = await ST.lib.addRaw([data], sr, (base ? base.name.replace(/ \(.*\)$/, '') : 'Voice') + ' (' + label + ')', 'edit');
    ST.snap(); if (!clip.raw) clip.raw = clip.sample; clip.sample = ns.id; clip.name = ns.name; ST.touch(); ST.emit('selection');
    ST.toast('Applied: ' + label + (clip.raw ? ' — “Revert” brings back the original' : ''));
  }
  const busy = (fn) => { ST.toast('Processing… one moment'); setTimeout(() => { try { fn(); } catch (e) { console.error(e); ST.toast('Processing failed: ' + e.message, 'warn'); } }, 40); };
  /** clip segment as mono data */
  function clipData(clip) {
    const s = ST.lib.samples.get(clip.sample); if (!s) return null;
    const off = Math.round((clip.off || 0) * s.sr), n = Math.min(s.ch[0].length - off, Math.round(clip.len * ST.spb() * s.sr));
    const d = s.ch[0].slice(off, off + Math.max(0, n));
    return { d, sr: s.sr, s };
  }

  VO.lab = (clip, startTab) => {
    const cd = clipData(clip); if (!cd) return;
    const { d, sr } = cd;
    const tr = P.track(d, sr);
    const det = P.detectKey(d, sr, tr);
    const tv = Object.assign({}, DEF, { key: det.key, scale: det.scale, speed: 20 });
    const sel = (opts, val, on) => h('select', { class: 'sel', onchange: (e) => on(e.target.value) }, opts.map(([k, l]) => h('option', { value: k, selected: String(val) === String(k) }, l)));
    const field = (label, node) => h('label', { class: 'field' }, h('span', { class: 'flabel' }, label), node);
    const graph = h('canvas', { class: 'pgraph' });
    let preview = null;
    const drawGraph = (shift) => {
      const w = graph.clientWidth || 800, hh = 170, dpr = Math.min(2, devicePixelRatio || 1);
      graph.width = w * dpr; graph.height = hh * dpr; graph.style.height = hh + 'px';
      const g = graph.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#101114'; g.fillRect(0, 0, w, hh);
      const ms = []; tr.f0.forEach((f) => { if (f) ms.push(P.ftom(f)); });
      if (!ms.length) { g.fillStyle = '#8b93a1'; g.font = '13px system-ui'; g.fillText('No singing/pitched voice detected in this clip.', 16, 30); return; }
      ms.sort((a, b) => a - b);
      const lo = Math.floor(ms[Math.floor(ms.length * 0.03)]) - 2, hi = Math.ceil(ms[Math.floor(ms.length * 0.97)]) + 2;
      const yOf = (m) => hh - 6 - ((m - lo) / Math.max(1, hi - lo)) * (hh - 12);
      const sc = P.SCALES[tv.scale] || P.SCALES.major;
      for (let n = lo; n <= hi; n++) { const inS = sc.includes((((n - tv.key) % 12) + 12) % 12); g.fillStyle = inS ? '#ffffff20' : '#ffffff07'; g.fillRect(0, yOf(n), w, 1); if (inS) { g.fillStyle = '#8b93a1'; g.font = '10px system-ui'; g.fillText(A.m2n(n), 4, yOf(n) - 2); } }
      const plot = (fn, color) => { g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); let pen = false; tr.f0.forEach((f, i) => { const x = (i / tr.f0.length) * w; if (!f) { pen = false; return; } const y = yOf(fn(P.ftom(f), i)); if (pen) g.lineTo(x, y); else g.moveTo(x, y); pen = true; }); g.stroke(); };
      plot((m) => m, '#6b7280');
      if (shift) plot((m, i) => m + shift[i], '#ffb02e');
      g.fillStyle = '#6b7280'; g.fillText('grey = your voice', w - 210, 14); g.fillStyle = '#ffb02e'; g.fillText('amber = after Auto-Tune', w - 120, 14);
    };
    const tuneTab = () => {
      const speedOut = h('output', null, tv.speed + ' ms'), amtOut = h('output', null, '100%');
      const refresh = () => { const n = tr.f0.length, sh = new Float32Array(n); const a = tv.speed > 0 ? 1 - Math.exp(-(tr.hop / sr) / (tv.speed / 1000)) : 1; let s = 0, pv = false; for (let i = 0; i < n; i++) { const f = tr.f0[i]; if (!f) { pv = false; continue; } const m = P.ftom(f), want = (P.snap(m, tv.key, tv.scale) - m) * tv.amount; s = pv ? s + a * (want - s) : want; sh[i] = s; pv = true; } drawGraph(sh); };
      const box = h('div', { class: 'vl-tab' },
        h('p', { class: 'muted small' }, 'Detected key: ', h('b', null, P.KEYS[det.key] + ' ' + det.scale), '. Auto-Tune moves every sung note to the nearest note of the key, keeping your voice’s character.'),
        h('div', { class: 'row' },
          field('Key', sel(P.KEYS.map((k, i) => [i, k]), tv.key, (x) => { tv.key = +x; refresh(); })),
          field('Scale', sel(Object.keys(P.SCALES).map((k) => [k, k]), tv.scale, (x) => { tv.scale = x; refresh(); })),
          field('Retune speed', h('span', { class: 'sl' }, h('input', { type: 'range', min: 0, max: 200, value: tv.speed, oninput: (e) => { tv.speed = +e.target.value; speedOut.textContent = tv.speed + ' ms'; refresh(); } }), speedOut)),
          field('Amount', h('span', { class: 'sl' }, h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: 1, oninput: (e) => { tv.amount = +e.target.value; amtOut.textContent = Math.round(tv.amount * 100) + '%'; refresh(); } }), amtOut))),
        graph,
        h('div', { class: 'row' },
          h('button', { class: 'btn sm', onclick: () => busy(() => { stopPrev(); const { out } = P.autotune(d, sr, tv, tr); preview = play(out, sr); }) }, '▶ Preview tuned'),
          h('button', { class: 'btn sm', onclick: () => { stopPrev(); preview = play(d, sr); } }, '▶ Original'),
          h('button', { class: 'btn sm', onclick: stopPrev }, '■'),
          h('button', { class: 'btn sm', onclick: () => { tv.speed = 0; tv.amount = 1; m.close(); busy(() => { const { out } = P.autotune(d, sr, tv, tr); swap(clip, out, sr, 'hard tune'); }); } }, '⚡ Hard “T-Pain” tune'),
          h('button', { class: 'btn accent sm', onclick: () => { m.close(); busy(() => { const { out } = P.autotune(d, sr, tv, tr); swap(clip, out, sr, 'auto-tuned'); }); } }, 'Apply Auto-Tune')));
      requestAnimationFrame(refresh);
      return box;
    };
    const fxTab = () => {
      const note = sel(Array.from({ length: 25 }, (_, i) => [48 + i, A.m2n(48 + i)]), 57, () => { });
      const fx = (label, desc, fn) => h('div', { class: 'lab-card' }, h('b', null, label), h('span', { class: 'muted small' }, desc), h('button', { class: 'btn sm', onclick: () => { m.close(); busy(() => swap(clip, fn(), sr, label.replace(/^\S+\s/, '').toLowerCase())); } }, 'Apply'));
      return h('div', { class: 'vl-tab' },
        h('div', { class: 'lab-actions four' },
          h('div', { class: 'lab-card' }, h('b', null, '🤖 Robot voice'), h('span', { class: 'muted small' }, 'Every word on one note — a monotone machine voice.'), field('Note', note), h('button', { class: 'btn sm', onclick: () => { const nn = +note.value; m.close(); busy(() => swap(clip, P.robot(d, sr, nn), sr, 'robot')); } }, 'Apply')),
          fx('🎶 Harmony: 3rd above', 'Adds a second voice a third above you, in key.', () => P.harmonize(d, sr, { key: det.key, scale: det.scale, voices: [2] })),
          fx('🎼 Harmony: 3rd + 5th', 'A full three-part chord from one voice.', () => P.harmonize(d, sr, { key: det.key, scale: det.scale, voices: [2, 4] })),
          fx('👥 Octave double', 'Adds the same line an octave below — big, thick vocals.', () => P.harmonize(d, sr, { key: det.key, scale: 'chromatic', voices: [-12] })),
          fx('🐻 Deep voice', 'Pitch down 5 semitones.', () => P.shift(d, sr, -5, tr)),
          fx('🐭 Chipmunk', 'Pitch up 7 semitones.', () => P.shift(d, sr, 7, tr)),
          fx('⬇ Octave down', 'One octave lower.', () => P.shift(d, sr, -12, tr)),
          fx('⬆ Octave up', 'One octave higher.', () => P.shift(d, sr, 12, tr))));
    };
    const vocTab = () => {
      const melodic = ST.proj().tracks.filter((t) => t.type === 'inst' && VMI.byId[t.inst] && VMI.byId[t.inst].layout !== 'pads' && t.clips.some((c) => c.notes.length));
      const src = sel([['__chord', 'A sustained chord in the detected key']].concat(melodic.map((t) => [t.id, 'Notes of “' + t.name + '”'])), melodic[0] ? melodic[0].id : '__chord', () => { });
      return h('div', { class: 'vl-tab' },
        h('p', { class: 'muted small' }, 'A vocoder makes your voice “sing” the notes of a synth: your words shape the sound, the synth gives the pitch. Pick which notes the robot choir should sing.'),
        h('div', { class: 'row' }, field('Notes from', src)),
        h('div', { class: 'row' }, h('button', { class: 'btn accent sm', onclick: async () => { m.close(); ST.toast('Rendering vocoder…'); try { const out = await renderVocoder(clip, d, sr, src.value, det); swap(clip, out, sr, 'vocoder'); } catch (e) { console.error(e); ST.toast('Vocoder failed: ' + e.message, 'warn'); } } }, 'Apply vocoder')),
        h('p', { class: 'muted small' }, 'Tip: for live vocoding, add the “Vocoder” instrument (Sounds → Electronic) and play keys while you talk.'));
    };
    const melTab = () => {
      const insts = VMI.instruments.filter((i) => i.layout !== 'pads' && i.layout !== 'theremin');
      const inst = sel(insts.map((i) => [i.id, i.emoji + ' ' + i.name]), 'grand-piano', () => { });
      const snapKey = h('input', { type: 'checkbox', class: 'sw', checked: true });
      const q = sel([['0.25', '1/16'], ['0.5', '1/8'], ['0', 'Off']], '0.25', () => { });
      return h('div', { class: 'vl-tab' },
        h('p', { class: 'muted small' }, 'Sing, hum or whistle a melody: it is turned into notes you can play on any instrument, and edit in the piano roll.'),
        h('div', { class: 'row' }, field('Instrument', inst), field('Snap to ' + P.KEYS[det.key] + ' ' + det.scale, snapKey), field('Timing snap', q)),
        h('button', { class: 'btn accent sm', onclick: () => {
          const notes = P.melody(d, sr, snapKey.checked ? { key: det.key, scale: det.scale } : {});
          if (!notes.length) return ST.toast('No clear melody found — sing steady notes, one at a time', 'warn');
          const spb = ST.spb(), qq = +q.value, b0 = clip.start;
          const nn = notes.map((n) => { let t = b0 + n.t / spb, dd = n.d / spb; if (qq) { t = Math.round(t / qq) * qq; dd = Math.max(qq, Math.round(dd / qq) * qq); } return { t, d: dd, n: n.n, v: n.v }; });
          ST.snap();
          const tr2 = ST.addTrack({ inst: inst.value }); tr2.name = 'Voice → ' + VMI.byId[inst.value].name;
          const a = Math.floor(nn[0].t / 4) * 4, b = Math.ceil(Math.max(...nn.map((n) => n.t + n.d)) / 4) * 4;
          ST.ensureBars(b); const cl = ST.mergeNotes(tr2, a, Math.max(b, a + 4), nn);
          ST.selClip = cl.id; ST.touch(); ST.emit('selection'); m.close();
          ST.toast('Turned your voice into ' + nn.length + ' notes on ' + VMI.byId[inst.value].name);
        } }, 'Create instrument track'));
    };
    const tabs = { tune: ['🎚 Auto-Tune', tuneTab], fx: ['🤖 Voice FX', fxTab], voc: ['🎛 Vocoder', vocTab], mel: ['🎹 Melody → instrument', melTab] };
    const tabBar = h('div', { class: 'vl-tabs' });
    const holder = h('div');
    const show = (k) => { tabBar.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.k === k)); holder.innerHTML = ''; holder.append(tabs[k][1]()); };
    Object.keys(tabs).forEach((k) => { const b = h('button', { class: 'bp-tab', onclick: () => show(k) }, tabs[k][0]); b.dataset.k = k; tabBar.append(b); });
    const body = h('div', { class: 'vlab' }, tabBar, holder,
      clip.raw ? h('button', { class: 'btn xs', onclick: () => { ST.snap(); clip.sample = clip.raw; delete clip.raw; const s0 = ST.lib.samples.get(clip.sample); clip.name = s0 ? s0.name : clip.name; ST.touch(); ST.emit('selection'); m.close(); ST.toast('Reverted to the original take'); } }, '↺ Revert clip to original take') : null);
    const stopPrev = () => { if (preview) { try { preview.stop(); } catch (e) { /* ignore */ } preview = null; } };
    const m = U().modal('Voice Lab — ' + (clip.name || 'vocal'), body, { cls: 'wide', onclose: stopPrev });
    show(startTab || 'tune');
  };
  function play(data, sr) {
    ST.ensure(); A.resume();
    const c = ST.ctx, b = c.createBuffer(1, data.length, sr); b.copyToChannel(data, 0);
    const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(); return s;
  }
  async function renderVocoder(clip, d, sr, srcId, det) {
    const off = new OfflineAudioContext(1, d.length + sr, sr);
    const buf = off.createBuffer(1, d.length, sr); buf.copyToChannel(d, 0);
    const mod = off.createBufferSource(); mod.buffer = buf;
    const bank = buildVocoder(off, mod, off.destination);
    const spb = ST.spb(), clipStartSec = clip.start * spb, dur = d.length / sr;
    const voice = (f, t0, t1) => {
      const g = off.createGain(); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.35, t0 + 0.01); g.gain.setValueAtTime(0.35, Math.max(t0 + 0.01, t1 - 0.03)); g.gain.linearRampToValueAtTime(0, t1); g.connect(bank.carrier);
      [0, 8].forEach((det2) => { const o = off.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det2; o.connect(g); o.start(t0); o.stop(t1 + 0.05); });
    };
    if (srcId === '__chord') {
      const root = 48 + det.key, third = det.scale === 'minor' ? 3 : 4;
      [root, root + third, root + 7, root + 12].forEach((n) => voice(P.mtof(n), 0, dur));
    } else {
      const t = ST.track(srcId);
      t.clips.forEach((c) => c.notes.forEach((n) => {
        if (typeof n.n !== 'number') return;
        const s0 = (c.start + n.t) * spb - clipStartSec, s1 = s0 + n.d * spb;
        if (s1 <= 0 || s0 >= dur) return;
        voice(P.mtof(n.n + (t.transpose || 0)), Math.max(0, s0), Math.min(dur, s1));
      }));
    }
    mod.start(0); bank.nz.stop(dur + 0.5);
    const r = await off.startRendering();
    const out = r.getChannelData(0).slice(0, d.length);
    let mx = 0; for (let i = 0; i < out.length; i++) mx = Math.max(mx, Math.abs(out[i]));
    if (mx > 0) for (let i = 0; i < out.length; i++) out[i] *= 0.9 / mx;
    return out;
  }
})();
