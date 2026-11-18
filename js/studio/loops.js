/* loops.js — built-in loop & sample library. Every sound is a recipe rendered by our own engine,
   at the song's current tempo, so loops always fit and there are no copyright issues. */
(function () {
  'use strict';
  const VMI = window.VMI, A = VMI.audio, ST = VMI.st;
  const LP = (VMI.loops = {});

  /* ---------- helpers to write patterns ---------- */
  const steps = (map, o) => {
    o = o || {}; const notes = [], bars = Object.values(map)[0].replace(/\|/g, '').length / 16;
    Object.keys(map).forEach((id) => [...map[id].replace(/\|/g, '')].forEach((ch, i) => {
      if (!/[xX]/.test(ch)) return;
      const sw = o.swing && i % 2 ? o.swing * 0.25 : 0;
      notes.push({ t: i * 0.25 + sw, d: 0.2, n: id, v: ch === 'X' ? 0.95 : (o.vel || 0.7) * (o.human ? 0.85 + Math.random() * 0.15 : 1) });
    }));
    return { notes, beats: bars * 4 };
  };
  const twice = (r) => ({ notes: r.notes.concat(r.notes.map((n) => Object.assign({}, n, { t: n.t + r.beats }))), beats: r.beats * 2 });
  const chords = (list, beatsEach) => ({ notes: [].concat(...list.map((c, i) => c.map((n) => ({ t: i * beatsEach, d: beatsEach - 0.1, n, v: 0.7 })))), beats: list.length * beatsEach });
  const seq = (arr, beats) => ({ notes: arr.map(([t, d, n, v]) => ({ t, d, n, v: v || 0.8 })), beats });
  const pat = (id) => ST.patterns.find((p) => p.id === id);
  const fromPat = (id, times) => { const p = pat(id); let r = { notes: p.notes.slice(), beats: p.bars * 4 }; for (let i = 1; i < (times || 1); i++) r = twice(r); return r; };
  const hit = (inst, id, opts) => Object.assign({ inst, oneShot: true, sec: 2.5 }, opts || {}, { notes: [{ t: 0, d: 0.3, n: id, v: 0.95 }], beats: 1 });

  /* ---------- the library ---------- */
  const L = [];
  const add = (cat, id, name, r) => L.push(Object.assign({ cat, id, name }, r));

  add('Drum loops', 'dl-boombap', 'Boom bap', Object.assign({ inst: 'drum-kit', rev: 0.12 }, twice(steps({ kick: 'X.....x...x.....', snare: '....X.......X...', hatC: 'x.x.x.x.x.x.x.x.' }, { swing: 0.25 }))));
  add('Drum loops', 'dl-lofi', 'Lo-fi swing', Object.assign({ inst: 'drum-kit', rev: 0.2 }, twice(steps({ kick: 'X......x..x.....', snare: '....x.......x...', hatC: 'x.xxx.x.x.xxx.x.' }, { swing: 0.55, vel: 0.55, human: true }))));
  add('Drum loops', 'dl-trap', 'Trap', Object.assign({ inst: 'drum-machine', rev: 0.1 }, steps({ kick: 'X.......x..x....|X......x..x.....', snare: '........X.......|........X.......', hatC: 'x.x.x.x.x.x.x.x.|x.x.x.x.xxxxxxxx' }, { vel: 0.6 })));
  add('Drum loops', 'dl-drill', 'Drill', Object.assign({ inst: 'drum-machine', rev: 0.12 }, steps({ kick: 'X......x..x.....|X.....x...x..x..', snare: '......X.......X.|......X.......X.', hatC: 'x..x..x.x..x..x.|x..x..x.x.xx..x.' }, { vel: 0.6 })));
  add('Drum loops', 'dl-house', 'House', Object.assign({ inst: 'drum-machine', rev: 0.15 }, twice(steps({ kick: 'X...X...X...X...', clap: '....x.......x...', hatO: '..x...x...x...x.', hatC: 'x.x.x.x.x.x.x.x.' }, { vel: 0.55 }))));
  add('Drum loops', 'dl-afro', 'Afrobeat', Object.assign({ inst: 'drum-machine', rev: 0.15 }, twice(steps({ kick: 'X...x.x...x.....', snare: '....x.......x..x', cLo: '..x.....x.x.....', cHi: '.x...x.x...x..x.', hatC: 'x.xx.xx.x.xx.xx.', cow: 'x..x..x...x.x...' }, { vel: 0.6 }))))
  add('Drum loops', 'dl-dembow', 'Reggaeton / dembow', Object.assign({ inst: 'drum-machine', rev: 0.1 }, twice(steps({ kick: 'X...X...X...X...', snare: '...x..x....x..x.', hatC: 'x.x.x.x.x.x.x.x.' }))));
  add('Drum loops', 'dl-rock', 'Rock', Object.assign({ inst: 'drum-kit', rev: 0.15 }, twice(steps({ kick: 'X.......x.x.....', snare: '....X.......X...', hatC: 'x.x.x.x.x.x.x.x.' }))));
  add('Drum loops', 'dl-funk', 'Funk', Object.assign({ inst: 'drum-kit', rev: 0.12 }, twice(steps({ kick: 'X..x..x...x..x..', snare: '....X..x.x..X...', hatC: 'xxxxxxxxxxxxxxxx' }, { vel: 0.5 }))));

  add('Melodic loops', 'ml-lofikeys', 'Lo-fi keys · Dm7 G7 Cmaj7 Am7', Object.assign({ inst: 'electric-piano', rev: 0.3, dly: 0.12 }, fromPat('chords3')));
  add('Melodic loops', 'ml-poppiano', 'Pop piano · C G Am F', Object.assign({ inst: 'grand-piano', rev: 0.3 }, fromPat('chords1')));
  add('Melodic loops', 'ml-strings', 'Sad strings · Am F C G', Object.assign({ inst: 'string-ensemble', rev: 0.45 }, fromPat('chords2')));
  add('Melodic loops', 'ml-choir', 'Choir pad · Am F C G', Object.assign({ inst: 'choir', rev: 0.5, opts: { vowel: 'o' } }, fromPat('chords2')));
  add('Melodic loops', 'ml-bass', 'Funky bass · A minor', Object.assign({ inst: 'bass-guitar', rev: 0.05 }, fromPat('bass1')));
  add('Melodic loops', 'ml-808', '808 bass · A minor', Object.assign({ inst: 'synthesizer', rev: 0.05, opts: { wave: 'sine', cutoff: 500, res: 1, attack: 0.005, release: 0.12, detune: 0, sub: false } }, seq([[0, 1.5, 33], [2, 0.5, 33], [3, 1, 36], [4, 1.5, 31], [6, 0.75, 33], [7, 1, 28]], 8)));
  add('Melodic loops', 'ml-arp', 'Synth arp · C major', Object.assign({ inst: 'synthesizer', rev: 0.25, dly: 0.2, opts: { wave: 'sawtooth', cutoff: 2200, res: 4, attack: 0.005, release: 0.15, detune: 8, sub: false } }, fromPat('arp1', 2)));
  add('Melodic loops', 'ml-kalimba', 'Kalimba hook', Object.assign({ inst: 'kalimba', rev: 0.35 }, fromPat('mel1')));
  add('Melodic loops', 'ml-guitar', 'Acoustic strum · C G Am F', Object.assign({ inst: 'acoustic-guitar', rev: 0.2 }, (() => {
    const shapes = [[48, 52, 55, 60, 64], [43, 47, 50, 55, 59, 67], [45, 52, 57, 60, 64], [41, 48, 53, 57, 60, 65]], notes = [];
    shapes.forEach((sh, bar) => [0, 1, 1.5, 2.5, 3, 3.5].forEach((b, k) => { const up = k % 2 === 1; (up ? sh.slice().reverse() : sh).forEach((n, i) => notes.push({ t: bar * 4 + b + i * 0.012, d: 0.45, n, v: up ? 0.55 : 0.75 })); }));
    return { notes, beats: 16 };
  })()));

  add('Drum hits', 'dh-kick', 'Kick', hit('drum-kit', 'kick'));
  add('Drum hits', 'dh-808', '808 kick (long)', hit('drum-machine', 'kick'));
  add('Drum hits', 'dh-snare', 'Snare', hit('drum-kit', 'snare'));
  add('Drum hits', 'dh-clap', 'Clap', hit('drum-machine', 'clap'));
  add('Drum hits', 'dh-hatc', 'Closed hi-hat', hit('drum-kit', 'hatC'));
  add('Drum hits', 'dh-hato', 'Open hi-hat', hit('drum-kit', 'hatO'));
  add('Drum hits', 'dh-crash', 'Crash', hit('drum-kit', 'crash', { sec: 4 }));
  add('Drum hits', 'dh-rim', 'Rim shot', hit('drum-machine', 'rim'));
  add('Drum hits', 'dh-cow', 'Cowbell', hit('drum-machine', 'cow'));
  add('Drum hits', 'dh-tom', 'Floor tom', hit('drum-kit', 'floor'));

  add('Vocal chops', 'vc-ah', '“Ah” chop · A', { inst: 'choir', oneShot: true, sec: 2, rev: 0.35, opts: { vowel: 'a' }, notes: [{ t: 0, d: 0.6, n: 69, v: 0.9 }], beats: 1 });
  add('Vocal chops', 'vc-oh', '“Oh” chop · E', { inst: 'choir', oneShot: true, sec: 2, rev: 0.35, opts: { vowel: 'o' }, notes: [{ t: 0, d: 0.6, n: 64, v: 0.9 }], beats: 1 });
  add('Vocal chops', 'vc-ee', '“Ee” stab · C chord', { inst: 'choir', oneShot: true, sec: 1.6, rev: 0.3, opts: { vowel: 'i' }, notes: [60, 64, 67].map((n) => ({ t: 0, d: 0.3, n, v: 0.85 })), beats: 1 });
  add('Vocal chops', 'vc-ooh', '“Ooh” swell · Am', { inst: 'choir', oneShot: true, sec: 5, rev: 0.5, opts: { vowel: 'u' }, notes: [57, 60, 64].map((n) => ({ t: 0, d: 3, n, v: 0.8 })), beats: 4 });
  add('Vocal chops', 'vc-robot', 'Robot “ah” · vocoder-style', { inst: 'synthesizer', oneShot: true, sec: 1.5, rev: 0.2, opts: { wave: 'square', cutoff: 1100, res: 9, attack: 0.01, release: 0.2, detune: 12, sub: false }, notes: [{ t: 0, d: 0.5, n: 57, v: 0.9 }], beats: 1 });

  /* FX: custom synthesis (c = context, out = node, spb = seconds per beat) */
  const fx = (id, name, o) => add('FX & transitions', id, name, Object.assign({ oneShot: true }, o));
  fx('fx-riser', 'Riser (2 bars)', { beats: 8, tempo: true, rev: 0.4, fx(c, out, spb) {
    const T = 8 * spb, n = A.noiseSrc(c), bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = 'bandpass'; bp.Q.value = 2; bp.frequency.setValueAtTime(250, 0); bp.frequency.exponentialRampToValueAtTime(9000, T);
    g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.7, T); g.gain.setValueAtTime(0, T + 0.01);
    n.connect(bp); bp.connect(g); g.connect(out); n.start(0); n.stop(T + 0.05);
    const o = c.createOscillator(), og = c.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(1760, T);
    og.gain.setValueAtTime(0.0001, 0); og.gain.exponentialRampToValueAtTime(0.12, T); og.gain.setValueAtTime(0, T + 0.01); o.connect(og); og.connect(out); o.start(0); o.stop(T + 0.05);
  } });
  fx('fx-down', 'Downlifter (1 bar)', { beats: 4, tempo: true, rev: 0.4, fx(c, out, spb) {
    const T = 4 * spb, n = A.noiseSrc(c), bp = c.createBiquadFilter(), g = c.createGain();
    bp.type = 'bandpass'; bp.Q.value = 2; bp.frequency.setValueAtTime(9000, 0); bp.frequency.exponentialRampToValueAtTime(200, T);
    g.gain.setValueAtTime(0.7, 0); g.gain.exponentialRampToValueAtTime(0.0001, T); n.connect(bp); bp.connect(g); g.connect(out); n.start(0); n.stop(T);
  } });
  fx('fx-impact', 'Impact boom', { sec: 4, rev: 0.6, fx(c, out) {
    const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(80, 0); o.frequency.exponentialRampToValueAtTime(32, 1.5);
    g.gain.setValueAtTime(1, 0); g.gain.setTargetAtTime(0, 0.02, 0.6); o.connect(g); g.connect(out); o.start(0); o.stop(3.5);
    const n = A.noiseSrc(c), lp = c.createBiquadFilter(), ng = c.createGain(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    ng.gain.setValueAtTime(0.8, 0); ng.gain.setTargetAtTime(0, 0, 0.12); n.connect(lp); lp.connect(ng); ng.connect(out); n.start(0); n.stop(2);
  } });
  fx('fx-subdrop', 'Sub drop', { sec: 3, rev: 0.1, fx(c, out) {
    const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(30, 1.6);
    g.gain.setValueAtTime(0.9, 0); g.gain.setTargetAtTime(0, 0.8, 0.4); o.connect(g); g.connect(out); o.start(0); o.stop(3);
  } });
  fx('fx-revcrash', 'Reverse cymbal', { sec: 3, rev: 0.3, reverse: true, inst: 'drum-kit', notes: [{ t: 0, d: 0.3, n: 'crash', v: 1 }], beats: 1 });
  fx('fx-laser', 'Laser zap', { sec: 0.8, rev: 0.2, fx(c, out) {
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(3200, 0); o.frequency.exponentialRampToValueAtTime(90, 0.35);
    g.gain.setValueAtTime(0.4, 0); g.gain.exponentialRampToValueAtTime(0.0001, 0.4); o.connect(g); g.connect(out); o.start(0); o.stop(0.45);
  } });
  fx('fx-vinyl', 'Vinyl crackle (2 bars)', { beats: 8, tempo: true, loop: true, rev: 0, fx(c, out, spb) {
    const T = 8 * spb, n = A.noiseSrc(c), lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'bandpass'; lp.frequency.value = 3000; lp.Q.value = 0.5; g.gain.value = 0.025; n.connect(lp); lp.connect(g); g.connect(out); n.start(0); n.stop(T);
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let t = 0; t < T; t += 0.01 + rnd() * 0.12) { const ck = c.createBufferSource(); ck.buffer = A.noiseBuffer(c); const cg = c.createGain(); cg.gain.setValueAtTime(0.15 + rnd() * 0.4, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.004); ck.connect(cg); cg.connect(out); ck.start(t, rnd()); ck.stop(t + 0.006); }
  } });

  LP.items = L;
  LP.cats = ['Drum loops', 'Melodic loops', 'Drum hits', 'Vocal chops', 'FX & transitions'];
  LP.byId = (id) => L.find((x) => x.id === id);
  LP.isTempo = (it) => !it.oneShot || it.tempo;
  LP.lenLabel = (it) => (it.oneShot && !it.tempo ? 'one-shot' : (it.beats / 4) + (it.beats > 4 ? ' bars' : ' bar'));

  /* ---------- rendering ---------- */
  const cache = new Map();
  LP.render = async (it, bpm) => {
    const key = it.id + '@' + (LP.isTempo(it) ? bpm : 0);
    if (cache.has(key)) return cache.get(key);
    ST.ensure();
    const sr = ST.ctx.sampleRate, spb = 60 / bpm;
    const body = LP.isTempo(it) ? it.beats * spb : it.sec;
    const tail = it.loop || !it.oneShot ? 2.5 : 0.5;
    const off = new OfflineAudioContext(2, Math.ceil((body + tail) * sr), sr);
    const g = new VMI.Graph(off);
    g.setMaster({ vol: 0.95, rev: 'hall', dly: '8d', fb: 0.3 }, bpm);
    const strip = g.strip('x');
    strip.apply({ vol: 1, pan: 0, rev: it.rev || 0, dly: it.dly || 0, eq: [0, 0, 0], comp: false, drive: 0 });
    if (it.fx) it.fx(off, strip.input, spb);
    else {
      const inst = VMI.byId[it.inst], o = {};
      inst.controls.forEach((cc) => { o[cc.id] = cc.value; });
      Object.assign(o, it.opts || {});
      it.notes.forEach((n) => {
        const spec = ST.noteSpec(inst, n.n); if (!spec) return;
        const t = n.t * spb, p = { freq: spec.midi != null ? A.mtof(spec.midi) : undefined, midi: spec.midi, vel: n.v, t, o, pad: spec.pad, spec };
        const v = inst.voice(off, strip.input, p); if (v) v.release(t + n.d * spb);
      });
    }
    const buf = await off.startRendering();
    let ch = [buf.getChannelData(0), buf.getChannelData(1)];
    if (!it.oneShot || it.loop) { // fold the reverb tail back onto the start → seamless loop
      const L0 = Math.round(body * sr);
      ch = ch.map((d) => { const o2 = d.slice(0, L0); for (let i = L0; i < d.length; i++) o2[(i - L0) % L0] += d[i]; return o2; });
    } else { // trim trailing silence
      let e = ch[0].length; while (e > 1000 && Math.abs(ch[0][e - 1]) < 1e-4 && Math.abs(ch[1][e - 1]) < 1e-4) e--;
      ch = ch.map((d) => d.slice(0, Math.min(d.length, e + 200)));
    }
    if (it.reverse) ch = ch.map((d) => Float32Array.from(d).reverse());
    let mx = 0; ch.forEach((d) => { for (let i = 0; i < d.length; i++) mx = Math.max(mx, Math.abs(d[i])); });
    if (mx > 0) { const k = 0.89 / mx; ch.forEach((d) => { for (let i = 0; i < d.length; i++) d[i] *= k; }); }
    const r = { ch, sr }; cache.set(key, r);
    return r;
  };

  let playing = null;
  LP.preview = async (id) => {
    if (playing) { try { playing.stop(); } catch (e) { /* ignore */ } const was = playing._id; playing = null; if (was === id) return; }
    const it = LP.byId(id); if (!it) return;
    A.resume();
    const r = await LP.render(it, ST.proj().bpm), c = ST.ctx;
    const b = c.createBuffer(2, r.ch[0].length, r.sr); r.ch.forEach((d, i) => b.copyToChannel(d, i));
    const s = c.createBufferSource(); s.buffer = b; s.loop = !it.oneShot || !!it.loop; s.connect(c.destination); s.start(); s._id = id;
    if (s.loop) s.stop(c.currentTime + Math.min(16, b.duration * 2));
    s.onended = () => { if (playing === s) playing = null; };
    playing = s;
  };
  LP.stopPreview = () => { if (playing) { try { playing.stop(); } catch (e) { /* ignore */ } playing = null; } };

  /** add an item to the song at `beat` (default: playhead bar). Uses the given audio track or makes a new one. */
  LP.add = async (id, beat, track) => {
    const it = LP.byId(id); if (!it) return;
    const bpm = ST.proj().bpm;
    const name = it.name + (LP.isTempo(it) ? ' · ' + bpm + ' BPM' : '');
    let s = Array.from(ST.lib.samples.values()).find((x) => x.kind === 'pack' && x.name === name);
    if (!s) { const r = await LP.render(it, bpm); s = await ST.lib.addRaw(r.ch.map((d) => Float32Array.from(d)), r.sr, name, 'pack'); }
    ST.snap();
    if (!track || track.type !== 'audio') { track = ST.addTrack({ type: 'audio', name: it.name.split(' · ')[0] }); track.rev = 0; }
    const start = beat == null ? Math.floor(ST.curBeat() / 4) * 4 : beat;
    const len = s.dur / ST.spb();
    const clipLen = LP.isTempo(it) ? it.beats : len;
    ST.ensureBars(start + clipLen);
    const c = ST.addClip(track, start, clipLen, []); c.sample = s.id; c.off = 0; c.gain = 1; c.name = it.name;
    ST.selTrack = track.id; ST.selClip = c.id; ST.touch(); ST.emit('selection');
    ST.toast('Added “' + it.name + '” — drag its right edge or use Ctrl+D to repeat it');
    return c;
  };
})();
