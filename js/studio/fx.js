/* fx.js — insert effects (FL-style FX slots) usable on any track, live and in export */
(function () {
  'use strict';
  const VMI = window.VMI;
  const FX = (VMI.FX = {});
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const SYNC = { '1/16': 0.25, '1/8': 0.5, '1/8d': 0.75, '1/4': 1, '1/4d': 1.5, '1/2': 2, '1 bar': 4, '2 bars': 8, '4 bars': 16 };
  const sel = (id, label, options, def) => ({ id, label, type: 'select', options, def });
  const rng = (id, label, min, max, step, def, unit) => ({ id, label, type: 'range', min, max, step, def, unit: unit || '' });
  const tog = (id, label, def) => ({ id, label, type: 'toggle', def });

  /* ---------- shared helpers ---------- */
  const irCache = new WeakMap();
  function ir(c, sec, bright) {
    let m = irCache.get(c); if (!m) { m = {}; irCache.set(c, m); }
    const key = sec.toFixed(1) + ':' + bright.toFixed(2);
    if (m[key]) return m[key];
    const len = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) { const k = i / len; lp += (Math.random() * 2 - 1 - lp) * (bright * (1 - 0.8 * k) + 0.05); d[i] = lp * Math.pow(1 - k, 2.2) * (i < 120 ? i / 120 : 1); }
    }
    return (m[key] = b);
  }
  const curves = {};
  function tanhCurve(k) { const key = 't' + Math.round(k * 10); if (curves[key]) return curves[key]; const n = 2048, cv = new Float32Array(n), nt = Math.tanh(k); for (let i = 0; i < n; i++) { const x = (i * 2) / (n - 1) - 1; cv[i] = Math.tanh(x * k) / nt; } return (curves[key] = cv); }
  function crushCurve(bits) { const key = 'b' + bits; if (curves[key]) return curves[key]; const n = 4096, cv = new Float32Array(n), q = Math.pow(2, bits - 1); for (let i = 0; i < n; i++) { const x = (i * 2) / (n - 1) - 1; cv[i] = Math.round(x * q) / q; } return (curves[key] = cv); }
  /** dry/wet wrapper: returns {input, output, wetIn, wetOut, setMix(m)} */
  function mixer(c, mix) {
    const input = c.createGain(), output = c.createGain(), dry = c.createGain(), wet = c.createGain();
    input.connect(dry); dry.connect(output); wet.connect(output);
    const setMix = (m) => { dry.gain.value = Math.cos((m * Math.PI) / 2); wet.gain.value = Math.sin((m * Math.PI) / 2); };
    setMix(mix);
    return { input, output, wet, setMix, nodes: [input, output, dry, wet] };
  }
  function lfo(c, rate, depth, target) {
    const o = c.createOscillator(), g = c.createGain(); o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(target); o.start();
    return { o, g, stop() { try { o.stop(); } catch (e) { /* ignore */ } } };
  }
  const beatSec = (p, bpm) => (60 / bpm) * (SYNC[p] || 0.5);

  /* =========================================================
     Effect types
     ========================================================= */
  /** effects that run on the audio thread need the worklet module loaded in that context first */
  function needWorklet(c) {
    if (FX.workletReady(c)) return null;
    FX.loadWorklet(c).then(() => { if (VMI.st && VMI.st.graph && VMI.st.graph.c === c) { VMI.st.graph.strips.forEach((s) => { s.fxKey = null; }); VMI.st.sync(); } }).catch(() => {});
    const pass = c.createGain(); return { input: pass, output: pass, set() { } };
  }
  const SCALE = (k) => (VMI.pitch && VMI.pitch.SCALES[k]) || [0, 2, 4, 5, 7, 9, 11];
  const CHORDS = { mono: [0], octave: [0, 12], power: [0, 7], triad: [0, 4, 7], minor: [0, 3, 7], stack: [0, 7, 12] };

  FX.types = {
    pitch: {
      name: 'Pitch shift', icon: '🎚️', desc: 'Raise or lower the pitch, keeps the timing', worklet: true,
      params: [rng('semis', 'Semitones', -24, 24, 1, 0), rng('fine', 'Fine (cents)', -100, 100, 1, 0), rng('mix', 'Mix', 0, 1, 0.01, 1)],
      build(c, p) {
        const pass = needWorklet(c); if (pass) return pass;
        const msg = (q) => ({ on: true, mode: 'shift', shift: +q.semis + q.fine / 100, speed: 0 });
        const m = mixer(c, p.mix), n = new AudioWorkletNode(c, 'vmi-autotune', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: msg(p) });
        m.input.connect(n); n.connect(m.wet);
        const set = (q) => { m.setMix(q.mix); n.port.postMessage(msg(q)); };
        set(p);
        return { input: m.input, output: m.output, set };
      },
    },
    synthvoice: {
      name: 'Voice synth', icon: '🤖', desc: 'Electric robot / talkbox voice that follows your melody', worklet: true,
      params: [sel('key', 'Key', ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((k, i) => [i, k]), 0), sel('scale', 'Scale', [['major', 'Major'], ['minor', 'Minor'], ['pentatonic minor', 'Pentatonic minor'], ['chromatic', 'Chromatic']], 'minor'),
        sel('chord', 'Voices', [['mono', 'Single (robot)'], ['octave', 'Octave'], ['power', 'Power (5th)'], ['triad', 'Major chord'], ['minor', 'Minor chord'], ['stack', 'Stack']], 'mono'),
        sel('wave', 'Tone', [['saw', 'Bright (saw)'], ['square', 'Hollow (square)']], 'saw'), rng('oct', 'Octave', -2, 1, 1, 0), rng('glide', 'Glide', 0, 150, 1, 20, 'ms'), rng('mix', 'Mix', 0, 1, 0.01, 0.85)],
      build(c, p) {
        const pass = needWorklet(c); if (pass) return pass;
        const msg = (q) => ({ key: +q.key, scale: SCALE(q.scale), chord: CHORDS[q.chord] || [0], wave: q.wave, oct: +q.oct, glide: +q.glide });
        const m = mixer(c, p.mix), n = new AudioWorkletNode(c, 'vmi-synthvoice', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: msg(p) });
        const split = c.createChannelSplitter(2), modG = c.createGain(), out = c.createGain();
        m.input.connect(n); n.connect(split); split.connect(modG, 1);
        const bank = VMI.voice.buildVocoder(c, modG, out, 22); split.connect(bank.carrier, 0);
        out.connect(m.wet);
        const set = (q) => { m.setMix(q.mix); n.port.postMessage(msg(q)); };
        set(p);
        return { input: m.input, output: m.output, set, stop() { try { bank.nz.stop(); } catch (e) { /* ignore */ } } };
      },
    },
    reverb: {
      name: 'Reverb', icon: '🌌', desc: 'Room, hall or cathedral space',
      params: [rng('mix', 'Mix', 0, 1, 0.01, 0.35), rng('size', 'Size', 0.3, 8, 0.1, 2.2, 's'), rng('tone', 'Tone', 0.05, 1, 0.01, 0.5), rng('pre', 'Pre-delay', 0, 0.2, 0.005, 0.02, 's')],
      build(c, p) {
        const m = mixer(c, p.mix), pre = c.createDelay(0.5), conv = c.createConvolver();
        pre.delayTime.value = p.pre; conv.buffer = ir(c, p.size, p.tone);
        m.input.connect(pre); pre.connect(conv); conv.connect(m.wet);
        let last = p.size + ':' + p.tone;
        return { input: m.input, output: m.output, set(q) { m.setMix(q.mix); pre.delayTime.value = q.pre; const k = q.size + ':' + q.tone; if (k !== last) { conv.buffer = ir(c, q.size, q.tone); last = k; } } };
      },
    },
    delay: {
      name: 'Delay / Echo', icon: '🔁', desc: 'Tempo-synced echoes',
      params: [rng('mix', 'Mix', 0, 1, 0.01, 0.3), sel('time', 'Time', Object.keys(SYNC).slice(0, 7).map((k) => [k, k]), '1/8d'), rng('fb', 'Feedback', 0, 0.92, 0.01, 0.4), rng('tone', 'Tone', 500, 12000, 50, 4000, 'Hz'), tog('pp', 'Ping-pong', true)],
      build(c, p, bpm) {
        const m = mixer(c, p.mix), dl = c.createDelay(4), dr = c.createDelay(4), fb = c.createGain(), lp = c.createBiquadFilter(), merge = c.createChannelMerger(2), cross = c.createGain();
        lp.type = 'lowpass';
        m.input.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl);
        lp.connect(merge, 0, 0); lp.connect(dr); dr.connect(merge, 0, 1); dr.connect(cross); cross.connect(dl);
        merge.connect(m.wet);
        const set = (q, b) => { const t = Math.min(3.9, beatSec(q.time, b || bpm)); m.setMix(q.mix); dl.delayTime.value = t; dr.delayTime.value = q.pp ? t : 0.0001; fb.gain.value = q.pp ? q.fb * 0.5 : q.fb; cross.gain.value = q.pp ? q.fb * 0.5 : 0; lp.frequency.value = q.tone; };
        set(p, bpm);
        return { input: m.input, output: m.output, set };
      },
    },
    chorus: {
      name: 'Chorus', icon: '🌊', desc: 'Wide, thick, doubled sound',
      params: [rng('mix', 'Mix', 0, 1, 0.01, 0.5), rng('rate', 'Rate', 0.05, 5, 0.01, 0.8, 'Hz'), rng('depth', 'Depth', 0, 1, 0.01, 0.5)],
      build(c, p) {
        const m = mixer(c, p.mix), merge = c.createChannelMerger(2), ls = [];
        [0, 1].forEach((ch) => {
          const d = c.createDelay(0.1); d.delayTime.value = 0.018; m.input.connect(d); d.connect(merge, 0, ch);
          const l = lfo(c, p.rate * (ch ? 1.13 : 1), 0.006 * p.depth, d.delayTime); ls.push(l);
        });
        merge.connect(m.wet);
        return { input: m.input, output: m.output, set(q) { m.setMix(q.mix); ls.forEach((l, i) => { l.o.frequency.value = q.rate * (i ? 1.13 : 1); l.g.gain.value = 0.006 * q.depth; }); }, stop() { ls.forEach((l) => l.stop()); } };
      },
    },
    flanger: {
      name: 'Flanger', icon: '✈️', desc: 'Jet-plane sweep',
      params: [rng('mix', 'Mix', 0, 1, 0.01, 0.5), rng('rate', 'Rate', 0.02, 4, 0.01, 0.25, 'Hz'), rng('depth', 'Depth', 0, 1, 0.01, 0.7), rng('fb', 'Feedback', 0, 0.9, 0.01, 0.6)],
      build(c, p) {
        const m = mixer(c, p.mix), d = c.createDelay(0.05), fb = c.createGain();
        d.delayTime.value = 0.004; m.input.connect(d); d.connect(fb); fb.connect(d); d.connect(m.wet);
        const l = lfo(c, p.rate, 0.0035 * p.depth, d.delayTime);
        const set = (q) => { m.setMix(q.mix); l.o.frequency.value = q.rate; l.g.gain.value = 0.0035 * q.depth; fb.gain.value = q.fb; };
        set(p);
        return { input: m.input, output: m.output, set, stop: l.stop };
      },
    },
    phaser: {
      name: 'Phaser', icon: '🌀', desc: 'Swirling, psychedelic sweep',
      params: [rng('mix', 'Mix', 0, 1, 0.01, 0.5), rng('rate', 'Rate', 0.02, 5, 0.01, 0.4, 'Hz'), rng('depth', 'Depth', 0, 1, 0.01, 0.8)],
      build(c, p) {
        const m = mixer(c, p.mix); let n = m.input; const aps = [], ls = [];
        [400, 800, 1600, 3200].forEach((f) => { const a = c.createBiquadFilter(); a.type = 'allpass'; a.frequency.value = f; a.Q.value = 0.6; n.connect(a); n = a; aps.push(a); ls.push(lfo(c, p.rate, f * 0.8 * p.depth, a.frequency)); });
        n.connect(m.wet);
        return { input: m.input, output: m.output, set(q) { m.setMix(q.mix); ls.forEach((l, i) => { l.o.frequency.value = q.rate; l.g.gain.value = aps[i].frequency.value * 0.8 * q.depth; }); }, stop() { ls.forEach((l) => l.stop()); } };
      },
    },
    distortion: {
      name: 'Distortion', icon: '🔥', desc: 'Grit, crunch, amp fuzz',
      params: [rng('drive', 'Drive', 0.5, 30, 0.1, 6), rng('tone', 'Tone', 300, 12000, 50, 5000, 'Hz'), rng('mix', 'Mix', 0, 1, 0.01, 1), rng('out', 'Output', 0, 1.5, 0.01, 0.6)],
      build(c, p) {
        const m = mixer(c, p.mix), pre = c.createGain(), sh = c.createWaveShaper(), lp = c.createBiquadFilter(), out = c.createGain();
        sh.oversample = '2x'; lp.type = 'lowpass';
        m.input.connect(pre); pre.connect(sh); sh.connect(lp); lp.connect(out); out.connect(m.wet);
        const set = (q) => { m.setMix(q.mix); sh.curve = tanhCurve(q.drive); lp.frequency.value = q.tone; out.gain.value = q.out; };
        set(p);
        return { input: m.input, output: m.output, set };
      },
    },
    crusher: {
      name: 'Bitcrusher / Lo-fi', icon: '👾', desc: '8-bit, broken-speaker, tape lo-fi',
      params: [rng('bits', 'Bits', 2, 12, 1, 6), rng('tone', 'Tone', 400, 12000, 50, 3500, 'Hz'), rng('mix', 'Mix', 0, 1, 0.01, 1)],
      build(c, p) {
        const m = mixer(c, p.mix), sh = c.createWaveShaper(), lp = c.createBiquadFilter(); lp.type = 'lowpass';
        m.input.connect(sh); sh.connect(lp); lp.connect(m.wet);
        const set = (q) => { m.setMix(q.mix); sh.curve = crushCurve(q.bits); lp.frequency.value = q.tone; };
        set(p);
        return { input: m.input, output: m.output, set };
      },
    },
    filter: {
      name: 'Filter / Wobble', icon: '🎛️', desc: 'Sweeps, wobble bass, telephone',
      params: [sel('kind', 'Type', [['lowpass', 'Low-pass'], ['highpass', 'High-pass'], ['bandpass', 'Band-pass']], 'lowpass'), rng('freq', 'Cutoff', 60, 16000, 10, 1800, 'Hz'), rng('res', 'Resonance', 0.3, 20, 0.1, 4), sel('lfo', 'Wobble', [['off', 'Off']].concat(Object.keys(SYNC).map((k) => [k, k])), 'off'), rng('depth', 'Wobble depth', 0, 1, 0.01, 0.6)],
      build(c, p, bpm) {
        const f = c.createBiquadFilter(), g = c.createGain(), o = c.createOscillator(), lg = c.createGain();
        f.connect(g); o.connect(lg); lg.connect(f.frequency); o.start();
        const set = (q, b) => { f.type = q.kind; f.frequency.value = q.freq; f.Q.value = q.res; const on = q.lfo !== 'off'; o.frequency.value = on ? 1 / beatSec(q.lfo, b || bpm) : 0.0001; lg.gain.value = on ? q.freq * 0.9 * q.depth : 0; };
        set(p, bpm);
        return { input: f, output: g, set, stop() { try { o.stop(); } catch (e) { /* ignore */ } } };
      },
    },
    tremolo: {
      name: 'Tremolo / Auto-pan', icon: '〰️', desc: 'Pulsing volume or left-right movement',
      params: [sel('rate', 'Rate', Object.keys(SYNC).slice(0, 6).map((k) => [k, k]), '1/8'), rng('depth', 'Depth', 0, 1, 0.01, 0.6), tog('pan', 'Auto-pan', false)],
      build(c, p, bpm) {
        const g = c.createGain(), pn = c.createStereoPanner ? c.createStereoPanner() : c.createGain(), o = c.createOscillator(), lg = c.createGain(), pg = c.createGain();
        g.connect(pn); o.connect(lg); lg.connect(g.gain); o.connect(pg); if (pn.pan) pg.connect(pn.pan); o.start();
        const set = (q, b) => { o.frequency.value = 1 / beatSec(q.rate, b || bpm); if (q.pan) { g.gain.value = 1; lg.gain.value = 0; pg.gain.value = q.depth; } else { g.gain.value = 1 - q.depth / 2; lg.gain.value = q.depth / 2; pg.gain.value = 0; } };
        set(p, bpm);
        return { input: g, output: pn, set, stop() { try { o.stop(); } catch (e) { /* ignore */ } } };
      },
    },
    robot: {
      name: 'Robot (ring mod)', icon: '🤖', desc: 'Metallic robot / Dalek voice',
      params: [rng('freq', 'Pitch', 20, 800, 1, 60, 'Hz'), rng('mix', 'Mix', 0, 1, 0.01, 0.8)],
      build(c, p) {
        const m = mixer(c, p.mix), vca = c.createGain(), o = c.createOscillator(); vca.gain.value = 0; o.connect(vca.gain); o.start();
        m.input.connect(vca); vca.connect(m.wet);
        const set = (q) => { m.setMix(q.mix); o.frequency.value = q.freq; }; set(p);
        return { input: m.input, output: m.output, set, stop() { try { o.stop(); } catch (e) { /* ignore */ } } };
      },
    },
    comp: {
      name: 'Compressor', icon: '🗜️', desc: 'Punch and consistent level',
      params: [rng('thr', 'Threshold', -60, 0, 1, -24, 'dB'), rng('ratio', 'Ratio', 1, 20, 0.5, 4), rng('att', 'Attack', 0.001, 0.2, 0.001, 0.01, 's'), rng('rel', 'Release', 0.02, 1, 0.01, 0.2, 's'), rng('gain', 'Make-up', 0, 4, 0.01, 1.4)],
      build(c, p) {
        const k = c.createDynamicsCompressor(), g = c.createGain(); k.connect(g);
        const set = (q) => { k.threshold.value = q.thr; k.ratio.value = q.ratio; k.attack.value = q.att; k.release.value = q.rel; k.knee.value = 8; g.gain.value = q.gain; }; set(p);
        return { input: k, output: g, set };
      },
    },
    eq: {
      name: 'Parametric EQ', icon: '📶', desc: 'Shape bass, mids and highs',
      params: [rng('low', 'Low (100 Hz)', -18, 18, 0.5, 0, 'dB'), rng('lmid', 'Low-mid (400)', -18, 18, 0.5, 0, 'dB'), rng('mid', 'Mid (1.5k)', -18, 18, 0.5, 0, 'dB'), rng('pres', 'Presence (4k)', -18, 18, 0.5, 0, 'dB'), rng('air', 'Air (12k)', -18, 18, 0.5, 0, 'dB'), rng('hp', 'Low cut', 20, 600, 5, 20, 'Hz')],
      build(c, p) {
        const hp = c.createBiquadFilter(); hp.type = 'highpass';
        const bands = [['lowshelf', 100], ['peaking', 400], ['peaking', 1500], ['peaking', 4000], ['highshelf', 12000]].map(([t, f]) => { const b = c.createBiquadFilter(); b.type = t; b.frequency.value = f; b.Q.value = 0.9; return b; });
        let n = hp; bands.forEach((b) => { n.connect(b); n = b; });
        const set = (q) => { hp.frequency.value = q.hp; ['low', 'lmid', 'mid', 'pres', 'air'].forEach((k, i) => { bands[i].gain.value = q[k]; }); }; set(p);
        return { input: hp, output: n, set };
      },
    },
    autotune: {
      name: 'Auto-Tune', icon: '🎤', desc: 'Pitch-correct vocals as they play', worklet: true,
      params: [sel('key', 'Key', ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map((k, i) => [i, k]), 0), sel('scale', 'Scale', [['major', 'Major'], ['minor', 'Minor'], ['pentatonic minor', 'Pentatonic minor'], ['pentatonic major', 'Pentatonic major'], ['blues', 'Blues'], ['chromatic', 'Chromatic']], 'major'), rng('speed', 'Retune speed', 0, 200, 1, 10, 'ms'), rng('amount', 'Amount', 0, 1, 0.01, 1)],
      build(c, p) {
        const pass = needWorklet(c); if (pass) return pass;
        const msg = (q) => ({ on: true, key: +q.key, scale: (VMI.pitch.SCALES[q.scale] || VMI.pitch.SCALES.major), speed: +q.speed, amount: +q.amount, mode: 'tune', shift: 0 });
        const n = new AudioWorkletNode(c, 'vmi-autotune', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], processorOptions: msg(p) });
        const set = (q) => { n.port.postMessage(msg(q)); };
        set(p);
        return { input: n, output: n, set };
      },
    },
  };

  /* worklet loading (live context and offline export contexts) */
  const ready = new WeakSet(), loading = new WeakMap();
  FX.workletReady = (c) => ready.has(c);
  FX.loadWorklet = (c) => {
    if (ready.has(c)) return Promise.resolve();
    if (!loading.has(c)) loading.set(c, c.audioWorklet.addModule('js/studio/worklets.js?v=27').then(() => { ready.add(c); }));
    return loading.get(c);
  };
  /** call before building strips in an offline context */
  FX.prepare = async (c, project) => {
    if (project.tracks.some((t) => (t.fx || []).some((f) => f.on && FX.types[f.type] && FX.types[f.type].worklet))) await FX.loadWorklet(c);
  };

  FX.defaults = (type) => { const o = {}; FX.types[type].params.forEach((q) => { o[q.id] = q.def; }); return o; };
  FX.make = (type, p) => ({ id: 'fx' + Math.random().toString(36).slice(2, 8), type, on: true, p: Object.assign(FX.defaults(type), p || {}) });
  FX.build = (c, f, bpm) => {
    const T = FX.types[f.type]; if (!T) { const g = c.createGain(); return { input: g, output: g, set() { } }; }
    const p = Object.assign(FX.defaults(f.type), f.p);
    const m = T.build(c, p, bpm || 120);
    const set0 = m.set; m.set = (q, b) => set0(Object.assign(FX.defaults(f.type), q), b);
    return m;
  };

  /* ---------- one-click presets (chains) ---------- */
  const P = (name, icon, desc, chain) => ({ name, icon, desc, chain });
  FX.presets = [
    P('Electric robot voice', '🤖', 'Your words, sung by a robot synth in key', [['autotune', { speed: 0, amount: 1 }], ['synthvoice', { chord: 'mono', mix: 0.85 }], ['crusher', { bits: 10, tone: 7000, mix: 0.25 }], ['reverb', { mix: 0.2, size: 1.6 }]]),
    P('Talkbox', '🎛️', 'Funky talkbox / Daft-Punk style voice', [['synthvoice', { chord: 'octave', wave: 'square', mix: 1, glide: 40 }], ['chorus', { rate: 0.5, depth: 0.4, mix: 0.3 }], ['reverb', { mix: 0.15, size: 1.2 }]]),
    P('Choir of me', '👥', 'Your voice as a big synth choir', [['synthvoice', { chord: 'triad', mix: 0.7 }], ['chorus', { rate: 0.6, depth: 0.6, mix: 0.5 }], ['reverb', { mix: 0.45, size: 4 }]]),
    P('Chipmunk', '🐭', 'Pitch up an octave-ish', [['pitch', { semis: 7 }]]),
    P('Deep voice', '🐻', 'Pitch down', [['pitch', { semis: -5 }], ['eq', { low: 3 }]]),
    P('Reverb · room', '🏠', 'Natural small-room reverb', [['reverb', { mix: 0.3, size: 0.9, tone: 0.55, pre: 0.01 }]]),
    P('Reverb · hall', '🌌', 'Big, lush concert-hall reverb', [['reverb', { mix: 0.42, size: 2.6, tone: 0.5, pre: 0.025 }]]),
    P('Echo + reverb', '🔁', 'Tempo echoes in a big space', [['delay', { mix: 0.3, time: '1/8d', fb: 0.4 }], ['reverb', { mix: 0.3, size: 2.2 }]]),
    P('Radio-ready vocal', '🎙️', 'Clean, upfront, polished pop/rap vocal', [['eq', { hp: 90, lmid: -2, pres: 3, air: 4 }], ['comp', { thr: -22, ratio: 4, gain: 1.5 }], ['delay', { mix: 0.12, time: '1/8d', fb: 0.25 }], ['reverb', { mix: 0.18, size: 1.6 }]]),
    P('Hard Auto-Tune', '⚡', 'The robotic “T-Pain” effect (set the key!)', [['autotune', { speed: 0, amount: 1 }], ['comp', { thr: -20, ratio: 3 }], ['reverb', { mix: 0.2, size: 1.8 }]]),
    P('Soft Auto-Tune', '🎶', 'Natural pitch correction', [['autotune', { speed: 60, amount: 0.8 }], ['reverb', { mix: 0.15, size: 1.4 }]]),
    P('Telephone', '☎️', 'Thin, old phone line', [['filter', { kind: 'bandpass', freq: 1600, res: 1.2 }], ['distortion', { drive: 3, tone: 3500, out: 0.8 }]]),
    P('Old radio', '📻', 'AM radio crackle and grit', [['filter', { kind: 'bandpass', freq: 1200, res: 0.8 }], ['crusher', { bits: 7, tone: 4500 }]]),
    P('Robot voice', '🤖', 'Metallic machine voice', [['robot', { freq: 55, mix: 0.85 }], ['crusher', { bits: 8, tone: 6000, mix: 0.4 }], ['reverb', { mix: 0.15, size: 0.8 }]]),
    P('Monster / demon', '👹', 'Dark, growling, distorted', [['pitch', { semis: -7 }], ['robot', { freq: 30, mix: 0.4 }], ['distortion', { drive: 10, tone: 2200, out: 0.5 }], ['reverb', { mix: 0.35, size: 3.5, tone: 0.2 }]]),
    P('Underwater', '🌊', 'Muffled and wobbly', [['filter', { kind: 'lowpass', freq: 500, res: 3 }], ['chorus', { rate: 0.4, depth: 0.9, mix: 0.7 }]]),
    P('Cathedral', '⛪', 'Huge, long, dreamy space', [['reverb', { mix: 0.55, size: 6, tone: 0.45, pre: 0.04 }]]),
    P('Space echo', '🚀', 'Dub-style repeating echoes', [['delay', { mix: 0.45, time: '1/4d', fb: 0.7, tone: 2500 }], ['reverb', { mix: 0.3, size: 3 }]]),
    P('Lo-fi tape', '📼', 'Warm, dusty, chill', [['filter', { kind: 'lowpass', freq: 4500, res: 0.7 }], ['crusher', { bits: 10, tone: 6000, mix: 0.6 }], ['chorus', { rate: 0.3, depth: 0.3, mix: 0.3 }]]),
    P('Dubstep wobble', '🧨', 'Rhythmic filter wobble', [['distortion', { drive: 5, tone: 9000, out: 0.6 }], ['filter', { kind: 'lowpass', freq: 1400, res: 8, lfo: '1/8', depth: 0.85 }]]),
    P('Big punchy drums', '🥁', 'Fat, compressed, slightly crunchy', [['comp', { thr: -28, ratio: 6, att: 0.02, rel: 0.12, gain: 1.8 }], ['distortion', { drive: 2, tone: 9000, mix: 0.35, out: 0.9 }], ['reverb', { mix: 0.12, size: 0.9 }]]),
    P('Wide shimmer', '✨', 'Lush, wide, sparkly pads and keys', [['chorus', { rate: 0.6, depth: 0.6, mix: 0.5 }], ['delay', { mix: 0.25, time: '1/4', fb: 0.4 }], ['reverb', { mix: 0.4, size: 4, tone: 0.8 }]]),
    P('Jet flanger', '✈️', 'Sweeping jet-plane effect', [['flanger', { rate: 0.2, depth: 0.8, fb: 0.7 }]]),
    P('Psychedelic', '🌀', 'Phaser + echo swirl', [['phaser', { rate: 0.3, depth: 0.9 }], ['delay', { mix: 0.25, time: '1/8d', fb: 0.5 }]]),
  ];
  FX.applyPreset = (track, preset) => { track.fx = preset.chain.map(([t, p]) => FX.make(t, p)); };
})();
