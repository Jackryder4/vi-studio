/* engine.js — studio core: library, project model, transport/scheduler, recording, analysis, export */
(function () {
  'use strict';
  const VMI = window.VMI, A = VMI.audio;
  const ST = (VMI.st = {});
  const uid = (p) => p + Math.random().toString(36).slice(2, 9);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  ST.uid = uid; ST.clamp = clamp;

  /* ---------- tiny event bus ---------- */
  const L = {};
  ST.on = (e, f) => { (L[e] = L[e] || []).push(f); };
  ST.emit = (e, a) => (L[e] || []).forEach((f) => { try { f(a); } catch (err) { console.error(err); } });
  ST.toast = (msg, kind) => ST.emit('toast', { msg, kind });

  const COLORS = ['#ffb02e', '#3dd6c6', '#ff6b81', '#8f9bff', '#7ed957', '#ff8fd1', '#ffd84d', '#58b8ff'];
  ST.COLORS = COLORS;

  /* =========================================================
     Library: samples + custom instruments
     ========================================================= */
  const lib = (ST.lib = { samples: new Map(), defs: [] });
  const KEYS16 = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'Digit1', 'Digit2', 'Digit3', 'Digit4'];
  const CLASS_COLOR = { kick: '#ff6b81', snare: '#ffb02e', hat: '#3dd6c6', perc: '#8f9bff' };

  lib.getBuffer = (id) => {
    const s = lib.samples.get(id);
    if (!s) return null;
    if (!s._buf) {
      const b = new AudioBuffer({ length: s.ch[0].length, sampleRate: s.sr, numberOfChannels: s.ch.length });
      s.ch.forEach((d, i) => b.copyToChannel(d, i));
      s._buf = b;
    }
    return s._buf;
  };
  const persistSample = (s) => VMI.store.put('samples', { id: s.id, name: s.name, sr: s.sr, ch: s.ch, dur: s.dur, kind: s.kind, created: s.created });
  lib.addRaw = async (ch, sr, name, kind) => {
    const s = { id: uid('s_'), name, sr, ch, dur: ch[0].length / sr, kind: kind || 'rec', created: Date.now() };
    lib.samples.set(s.id, s);
    await persistSample(s);
    ST.emit('lib');
    return s;
  };
  lib.addBuffer = (buf, name, kind) => {
    const ch = [];
    for (let i = 0; i < Math.min(2, buf.numberOfChannels); i++) ch.push(Float32Array.from(buf.getChannelData(i)));
    return lib.addRaw(ch, buf.sampleRate, name, kind);
  };
  lib.importFile = async (file) => {
    A.init();
    const ab = await file.arrayBuffer();
    const buf = await A.ctx().decodeAudioData(ab);
    return lib.addBuffer(buf, file.name.replace(/\.[^.]+$/, ''), 'import');
  };
  lib.rename = (id, name) => { const s = lib.samples.get(id); if (s) { s.name = name; persistSample(s); ST.emit('lib'); } };
  lib.remove = (id) => { lib.samples.delete(id); VMI.store.del('samples', id); ST.emit('lib'); };
  lib.load = async () => {
    const [ss, ds] = await Promise.all([VMI.store.all('samples'), VMI.store.all('instruments')]);
    ss.forEach((s) => lib.samples.set(s.id, s));
    ds.forEach((d) => ST.registerInstrument(d, true));
    ST.emit('lib');
  };

  /* sampled voices */
  function samplerVoice(def, c, out, p) {
    const buf = lib.getBuffer(def.sample); if (!buf) return null;
    const rate = Math.pow(2, (p.midi - (def.root == null ? 60 : def.root)) / 12);
    const src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const s0 = def.start || 0, s1 = def.end || buf.duration;
    if (def.loop) { src.loop = true; src.loopStart = s0; src.loopEnd = s1; }
    const g = c.createGain();
    const lvl = 0.35 + 0.65 * p.vel;
    g.gain.setValueAtTime(0, p.t); g.gain.linearRampToValueAtTime(lvl, p.t + 0.006);
    src.connect(g); g.connect(out);
    src.start(p.t, s0);
    if (!def.loop) { const d = (s1 - s0) / rate; try { src.stop(p.t + d + 0.05); } catch (e) { /* ignore */ } }
    let done = false;
    const end = (tau, when) => {
      if (done) return; done = true;
      const n = Math.max(c.currentTime, when || 0);
      if (g.gain.cancelAndHoldAtTime) { try { g.gain.cancelAndHoldAtTime(n); } catch (e) { g.gain.cancelScheduledValues(n); } } else g.gain.cancelScheduledValues(n);
      g.gain.setTargetAtTime(0, n, tau);
      try { src.stop(n + tau * 8 + 0.05); } catch (e) { /* ignore */ }
      src.onended = () => { try { g.disconnect(); } catch (e) { /* ignore */ } };
    };
    return { release(when) { if (def.gate !== false) end(0.05, when); }, kill(when) { end(0.012, when); } };
  }
  function kitVoice(c, out, p) {
    const pad = p.pad, buf = lib.getBuffer(pad.sample); if (!buf) return null;
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain();
    const lvl = 0.45 + 0.55 * p.vel;
    const dur = Math.max(0.03, (pad.end || buf.duration) - (pad.start || 0));
    g.gain.setValueAtTime(lvl, p.t); g.gain.setValueAtTime(lvl, p.t + Math.max(0, dur - 0.01)); g.gain.linearRampToValueAtTime(0, p.t + dur);
    src.connect(g); g.connect(out);
    src.start(p.t, pad.start || 0, dur);
    src.onended = () => { try { g.disconnect(); } catch (e) { /* ignore */ } };
    return {
      release() { },
      kill(when) { const n = Math.max(c.currentTime, when || 0); g.gain.cancelScheduledValues(n); g.gain.setTargetAtTime(0, n, 0.01); try { src.stop(n + 0.08); } catch (e) { /* ignore */ } },
    };
  }
  function buildCustom(def) {
    if (def.type === 'kit') {
      return {
        id: def.id, name: def.name, cat: 'mine', emoji: def.emoji || '🥁', desc: 'Your sampled drum kit', custom: true, def,
        layout: 'pads', ring: true, gain: 1, reverb: 0.15, controls: [], voice: kitVoice,
        cfg: { arrange: 'grid', cols: 4, pads: def.pads.map((p, i) => Object.assign({}, p, { keys: [KEYS16[i]], snd: 'sample', color: CLASS_COLOR[p.cls] || '#8f9bff' })) },
      };
    }
    return {
      id: def.id, name: def.name, cat: 'mine', emoji: def.emoji || '🎙️', desc: 'Your sampled instrument', custom: true, def,
      layout: 'keys', gain: 1, reverb: 0.2, controls: [], cfg: { skin: 'synth', start: 48, min: 24, max: 96 },
      voice: (c, out, p) => samplerVoice(def, c, out, p),
    };
  }
  ST.registerInstrument = (def, skipSave) => {
    if (!VMI.catById.mine) { const cat = { id: 'mine', name: 'My Sounds', color: '#ff8fd1' }; VMI.cats.push(cat); VMI.catById.mine = cat; }
    const inst = buildCustom(def);
    const i = VMI.instruments.findIndex((x) => x.id === def.id);
    if (i >= 0) VMI.instruments[i] = inst; else VMI.instruments.push(inst);
    VMI.byId[def.id] = inst;
    lib.defs = lib.defs.filter((d) => d.id !== def.id).concat([def]);
    if (!skipSave) VMI.store.put('instruments', def);
    ST.emit('lib'); ST.emit('instruments');
    return inst;
  };
  ST.removeInstrument = (id) => {
    VMI.instruments = VMI.instruments.filter((x) => x.id !== id); // eslint-disable-line
    delete VMI.byId[id]; lib.defs = lib.defs.filter((d) => d.id !== id); VMI.store.del('instruments', id);
    ST.emit('lib'); ST.emit('instruments');
  };

  /* =========================================================
     Built-in patterns
     ========================================================= */
  const steps = (map, vel) => {
    const notes = [];
    Object.keys(map).forEach((id) => [...map[id]].forEach((ch, i) => { if (ch === 'x' || ch === 'X') notes.push({ t: i * 0.25, d: 0.2, n: id, v: ch === 'X' ? 0.95 : vel || 0.7 }); }));
    return notes;
  };
  const chord = (notes, t, d) => notes.map((n) => ({ t, d, n, v: 0.7 }));
  ST.patterns = [
    { id: 'rock', name: 'Rock beat', kind: 'drums', bars: 1, notes: steps({ kick: 'X.......x.x.....', snare: '....X.......X...', hatC: 'x.x.x.x.x.x.x.x.' }) },
    { id: 'hiphop', name: 'Hip-hop boom bap', kind: 'drums', bars: 1, notes: steps({ kick: 'X.....x...x.....', snare: '....X.......X...', hatC: 'x.x.x.x.x.x.x.xx' }) },
    { id: 'house', name: 'House four-on-floor', kind: 'drums', bars: 1, notes: steps({ kick: 'X...X...X...X...', snare: '....x.......x...', hatO: '..x...x...x...x.', hatC: 'x.x.x.x.x.x.x.x.' }) },
    { id: 'trap', name: 'Trap', kind: 'drums', bars: 1, notes: steps({ kick: 'X.......x..x....', snare: '........X.......', hatC: 'xxxxxxxxxxxxxxxx' }, 0.55) },
    { id: 'dembow', name: 'Dembow', kind: 'drums', bars: 1, notes: steps({ kick: 'X...X...X...X...', snare: '...x..x....x..x.', hatC: 'x.x.x.x.x.x.x.x.' }) },
    { id: 'bass1', name: 'Bass groove (A minor)', kind: 'bass', bars: 2, notes: [[0, 0.5, 33], [1, 0.5, 33], [1.5, 0.5, 36], [2.5, 0.5, 38], [3, 1, 40], [4, 0.5, 33], [5, 0.5, 33], [5.5, 0.5, 36], [6.5, 0.5, 31], [7, 1, 33]].map(([t, d, n]) => ({ t, d, n, v: 0.85 })) },
    { id: 'bass2', name: 'Driving eighths (A)', kind: 'bass', bars: 1, notes: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((t, i) => ({ t, d: 0.45, n: i % 4 === 3 ? 40 : 33, v: 0.8 })) },
    { id: 'chords1', name: 'Pop: C – G – Am – F', kind: 'chords', bars: 4, notes: [].concat(chord([60, 64, 67], 0, 3.8), chord([55, 59, 62], 4, 3.8), chord([57, 60, 64], 8, 3.8), chord([53, 57, 60], 12, 3.8)) },
    { id: 'chords2', name: 'Sad: Am – F – C – G', kind: 'chords', bars: 4, notes: [].concat(chord([57, 60, 64], 0, 3.8), chord([53, 57, 60], 4, 3.8), chord([60, 64, 67], 8, 3.8), chord([55, 59, 62], 12, 3.8)) },
    { id: 'chords3', name: 'Lo-fi: Dm7 – G7 – Cmaj7 – Am7', kind: 'chords', bars: 4, notes: [].concat(chord([50, 53, 57, 60], 0, 3.8), chord([55, 59, 62, 65], 4, 3.8), chord([48, 55, 59, 64], 8, 3.8), chord([57, 60, 64, 67], 12, 3.8)) },
    { id: 'arp1', name: 'Arpeggio (C major)', kind: 'melody', bars: 1, notes: [60, 64, 67, 72, 67, 64, 60, 64, 67, 72, 76, 72, 67, 64, 60, 64].map((n, i) => ({ t: i * 0.25, d: 0.22, n, v: 0.7 })) },
    { id: 'mel1', name: 'Pentatonic hook', kind: 'melody', bars: 2, notes: [[0, 1, 72], [1, 0.5, 74], [1.5, 0.5, 76], [2, 1, 79], [3, 1, 76], [4, 1.5, 74], [5.5, 0.5, 72], [6, 2, 69]].map(([t, d, n]) => ({ t, d, n, v: 0.75 })) },
  ];

  /* =========================================================
     Project model
     ========================================================= */
  let project = null, undo = [], redo = [], saveT = null;
  const T = (ST.tr = { playing: false, pos: 0, sa: null, anchors: [], sched: 0, timer: null, live: [], choke: {}, metro: false, countIn: true });
  ST.quant = 0.25;
  ST.armed = null; ST.selTrack = null; ST.selClip = null;
  ST.latencyMs = 0;
  ST.proj = () => project;

  ST.newProject = (tpl) => {
    ST.stop(true);
    project = { v: 1, id: uid('p_'), name: 'Untitled song', bpm: 100, bars: 16, loop: { on: false, start: 0, end: 16 }, tracks: [], master: { vol: 0.85, rev: 'hall', dly: '8d', fb: 0.38 } };
    undo = []; redo = []; T.pos = 0; ST.selTrack = null; ST.selClip = null; ST.armed = null;
    if (tpl && TEMPLATES[tpl]) TEMPLATES[tpl]();
    undo = []; redo = [];
    if (project.tracks.length) { ST.selTrack = project.tracks[0].id; ST.armed = project.tracks[0].id; }
    ST.sync(); ST.emit('project'); ST.emit('selection'); ST.autosave();
  };
  ST.setProject = (p) => {
    ST.stop(true);
    project = p; undo = []; redo = []; T.pos = 0;
    project.tracks.forEach((t) => { if (!t.eq) t.eq = [0, 0, 0]; });
    ST.selTrack = project.tracks[0] ? project.tracks[0].id : null; ST.armed = ST.selTrack; ST.selClip = null;
    ST.sync(); ST.emit('project'); ST.emit('selection');
  };
  ST.beats = () => project.bars * 4;
  ST.unsnap = () => { undo.pop(); };
  ST.snap = () => { undo.push(JSON.stringify(project)); if (undo.length > 60) undo.shift(); redo = []; };
  ST.undo = () => { if (!undo.length) return; redo.push(JSON.stringify(project)); project = JSON.parse(undo.pop()); ST.fix(); };
  ST.redo = () => { if (!redo.length) return; undo.push(JSON.stringify(project)); project = JSON.parse(redo.pop()); ST.fix(); };
  ST.fix = () => {
    if (!project.tracks.find((t) => t.id === ST.selTrack)) ST.selTrack = project.tracks[0] ? project.tracks[0].id : null;
    ST.sync(); ST.emit('project'); ST.emit('selection'); ST.autosave();
  };
  ST.touch = () => { ST.sync(); ST.emit('project'); ST.autosave(); };
  ST.autosave = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => { if (project) VMI.store.put('projects', { id: 'autosave', name: project.name, data: JSON.stringify(project), saved: Date.now() }); }, 600);
  };
  ST.saveAs = async (name) => {
    project.name = name || project.name;
    await VMI.store.put('projects', { id: project.id, name: project.name, data: JSON.stringify(project), saved: Date.now() });
    ST.emit('toast', { msg: 'Saved “' + project.name + '”' }); ST.emit('project');
  };
  ST.listProjects = async () => (await VMI.store.all('projects')).filter((p) => p.id !== 'autosave').sort((a, b) => b.saved - a.saved);
  ST.openProject = async (id) => { const r = await VMI.store.get('projects', id); if (r) ST.setProject(JSON.parse(r.data)); };
  ST.deleteProject = (id) => VMI.store.del('projects', id);
  ST.loadAutosave = async () => { const r = await VMI.store.get('projects', 'autosave'); if (r) { ST.setProject(JSON.parse(r.data)); return true; } return false; };

  ST.addTrack = (o) => {
    const inst = o.inst ? VMI.byId[o.inst] : null;
    const n = project.tracks.length;
    const t = {
      id: uid('t_'), type: o.type || 'inst', inst: o.inst || null, name: o.name || (inst ? inst.name : 'Audio'), color: COLORS[n % COLORS.length],
      vol: 0.8, pan: 0, mute: false, solo: false, rev: inst ? clamp(inst.reverb * 0.5, 0, 0.35) : 0.12, dly: 0, eq: [0, 0, 0], comp: false, drive: 0, transpose: 0, opts: {}, clips: [],
    };
    if (inst) inst.controls.forEach((c) => { t.opts[c.id] = c.value; });
    project.tracks.push(t);
    ST.selTrack = t.id; if (t.type === 'audio' || (inst && inst.layout !== 'theremin')) ST.armed = t.id;
    return t;
  };
  ST.track = (id) => project.tracks.find((t) => t.id === id);
  ST.removeTrack = (id) => {
    project.tracks = project.tracks.filter((t) => t.id !== id);
    if (ST.graph) ST.graph.drop(id);
    if (ST.armed === id) ST.armed = null;
    ST.fix();
  };
  ST.addClip = (tr, start, len, notes) => {
    const c = { id: uid('c_'), start, len, notes: notes || [] };
    tr.clips.push(c); return c;
  };
  ST.findClip = (id) => { for (const t of project.tracks) { const c = t.clips.find((x) => x.id === id); if (c) return { t, c }; } return null; };
  ST.noteSpec = (inst, n) => {
    if (typeof n === 'string') {
      const pad = inst.cfg && inst.cfg.pads && inst.cfg.pads.find((p) => p.id === n);
      return pad ? { pad, midi: pad.note ? A.n2m(pad.note) : undefined, choke: pad.choke } : null;
    }
    return { midi: n };
  };
  /** put notes (absolute beats) into a clip on the track, merging overlapping clips */
  ST.mergeNotes = (tr, a, b, notes) => {
    const over = tr.clips.filter((c) => c.start < b && c.start + c.len > a);
    let s = a, e = b;
    over.forEach((c) => { s = Math.min(s, c.start); e = Math.max(e, c.start + c.len); });
    const dst = ST.addClip(tr, s, e - s, []);
    over.forEach((c) => { c.notes.forEach((n) => dst.notes.push({ t: n.t + c.start - s, d: n.d, n: n.n, v: n.v })); });
    tr.clips = tr.clips.filter((c) => !over.includes(c));
    notes.forEach((n) => dst.notes.push({ t: n.t - s, d: n.d, n: n.n, v: n.v }));
    return dst;
  };
  ST.insertPattern = (tr, pat, atBeat) => {
    const inst = VMI.byId[tr.inst];
    if (!inst) return ST.toast('Pick an instrument track first', 'warn');
    const pads = inst.layout === 'pads';
    if ((pat.kind === 'drums') !== pads) return ST.toast(pat.kind === 'drums' ? 'Drum patterns need a drum track (Drum Kit, Drum Machine…)' : 'Select a melodic track for this pattern', 'warn');
    ST.snap();
    const start = Math.floor(atBeat / 4) * 4, len = pat.bars * 4;
    const alias = { kick: ['kick'], snare: ['snare', 'clap', 'rim'], hatC: ['hatC'], hatO: ['hatO', 'hatC'] };
    const notes = [];
    pat.notes.forEach((n) => {
      let id = n.n;
      if (pads) { const ids = (alias[id] || [id]).find((x) => inst.cfg.pads.some((p) => p.id === x)); if (!ids) return; id = ids; }
      notes.push({ t: start + n.t, d: n.d, n: id, v: n.v });
    });
    const cl = ST.mergeNotes(tr, start, start + len, notes);
    ST.selClip = cl.id; ST.touch(); ST.emit('selection');
    return cl;
  };
  ST.ensureBars = (beats) => { const need = Math.ceil(beats / 4); if (need > project.bars) { project.bars = need; project.loop.end = Math.min(project.loop.end, need * 4); } };

  const TEMPLATES = {
    beat() {
      project.name = 'Beat starter'; project.bpm = 92;
      const d = ST.addTrack({ inst: 'drum-kit' }); const b = ST.addTrack({ inst: 'bass-guitar' }); const k = ST.addTrack({ inst: 'electric-piano' });
      const P = (id) => ST.patterns.find((p) => p.id === id);
      for (let i = 0; i < 4; i++) ST.insertPattern(d, P('hiphop'), i * 4);
      ST.insertPattern(b, P('bass1'), 0); ST.insertPattern(b, P('bass1'), 8);
      ST.insertPattern(k, P('chords3'), 0);
      b.vol = 0.75; k.vol = 0.6; k.rev = 0.3; project.loop = { on: true, start: 0, end: 16 };
    },
    voice() {
      project.name = 'Voice & beat'; project.bpm = 96;
      const d = ST.addTrack({ inst: 'drum-machine' });
      const P = ST.patterns.find((p) => p.id === 'hiphop');
      for (let i = 0; i < 4; i++) ST.insertPattern(d, P, i * 4);
      const v = ST.addTrack({ type: 'audio', name: 'Voice' }); v.rev = 0.25; v.comp = true;
      project.loop = { on: true, start: 0, end: 16 };
    },
  };
  ST.templates = [['blank', 'Blank project', 'Start from nothing'], ['beat', 'Beat starter', 'Drums, bass and chords ready to remix'], ['voice', 'Voice & beat', 'A drum loop plus an empty vocal track']];

  /* =========================================================
     Mixer graph sync
     ========================================================= */
  ST.ensure = () => {
    A.init();
    ST.ctx = A.ctx();
    if (!ST.graph) ST.graph = new VMI.Graph(ST.ctx);
    return ST.graph;
  };
  ST.sync = () => {
    if (!project) return;
    const g = ST.ensure();
    g.setMaster(project.master, project.bpm);
    const anySolo = project.tracks.some((t) => t.solo);
    project.tracks.forEach((t) => { const s = g.strip(t.id); s.apply(t); s.setMuted(t.mute || (anySolo && !t.solo)); });
    Array.from(g.strips.keys()).forEach((id) => { if (!project.tracks.some((t) => t.id === id)) g.drop(id); });
  };
  const skip = (tr) => tr.mute || (project.tracks.some((t) => t.solo) && !tr.solo);

  /* =========================================================
     Transport + scheduler (shared with offline export)
     ========================================================= */
  const spb = () => 60 / project.bpm;
  ST.spb = spb;

  function startAudio(env, tr, cl, strip, when, offSec) {
    const buf = lib.getBuffer(cl.sample); if (!buf) return;
    const c = env.c, off = (cl.off || 0) + offSec;
    const dur = Math.min(cl.len * env.spb - offSec, buf.duration - off);
    if (dur <= 0.005) return;
    const src = c.createBufferSource(); src.buffer = buf;
    const g = c.createGain(), lv = cl.gain == null ? 1 : cl.gain;
    const t0 = Math.max(when, 0);
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(lv, t0 + 0.004);
    g.gain.setValueAtTime(lv, t0 + Math.max(0.004, dur - 0.006)); g.gain.linearRampToValueAtTime(0, t0 + dur);
    src.connect(g); g.connect(strip.input);
    src.start(t0, off, dur);
    src.onended = () => { try { g.disconnect(); } catch (e) { /* ignore */ } };
    if (env.live) env.live.push({ release() { }, kill() { try { src.stop(); } catch (e) { /* ignore */ } } });
  }
  function playNote(env, tr, inst, strip, nt, ab, endB) {
    const spec = ST.noteSpec(inst, nt.n); if (!spec) return;
    const midi = spec.midi != null ? spec.midi + (tr.transpose || 0) : undefined;
    const when = env.timeOf(ab);
    const p = { freq: midi != null ? A.mtof(midi) : undefined, midi, vel: nt.v == null ? 0.8 : nt.v, t: when, o: tr.opts || {}, pad: spec.pad, spec };
    let v = null;
    try { v = inst.voice(env.c, strip.input, p); } catch (e) { console.error('voice', inst.id, e); }
    if (!v) return;
    if (spec.choke) { const k = tr.id + spec.choke, prev = env.choke[k]; if (prev) { try { prev.kill(when); } catch (e) { /* ignore */ } } env.choke[k] = v; }
    try { v.release(env.timeOf(endB)); } catch (e) { /* ignore */ }
    if (env.live) { env.live.push(v); if (env.live.length > 500) env.live.splice(0, 250); }
  }
  function scheduleRange(env, a, b) {
    for (const tr of project.tracks) {
      if (env.skip(tr)) continue;
      const strip = env.strip(tr.id); if (!strip) continue;
      if (tr.type === 'audio') {
        tr.clips.forEach((cl) => { if (cl.start >= a && cl.start < b) startAudio(env, tr, cl, strip, env.timeOf(cl.start), 0); });
      } else {
        const inst = VMI.byId[tr.inst]; if (!inst || !inst.voice) continue;
        tr.clips.forEach((cl) => {
          const cs = cl.start, ce = cs + cl.len;
          if (ce <= a || cs >= b) return;
          cl.notes.forEach((nt) => { const ab = cs + nt.t; if (ab >= a && ab < b && nt.t < cl.len) playNote(env, tr, inst, strip, nt, ab, Math.min(ab + nt.d, ce)); });
        });
      }
    }
  }
  function enterMid(env, beat, time) {
    for (const tr of project.tracks) {
      if (tr.type !== 'audio' || env.skip(tr)) continue;
      const strip = env.strip(tr.id); if (!strip) continue;
      tr.clips.forEach((cl) => { if (cl.start < beat && cl.start + cl.len > beat) startAudio(env, tr, cl, strip, time, (beat - cl.start) * env.spb); });
    }
  }
  const liveEnv = () => ({
    c: ST.ctx, spb: spb(), live: T.live, choke: T.choke, skip,
    timeOf: (b) => T.sa.t0 + (b - T.sa.beat0) * spb(), strip: (id) => ST.graph.strips.get(id),
  });

  T.beatAt = (t) => {
    let a = T.anchors[0];
    for (let i = T.anchors.length - 1; i >= 0; i--) { if (T.anchors[i].t0 <= t) { a = T.anchors[i]; break; } }
    return a.beat0 + (t - a.t0) / spb();
  };
  ST.curBeat = () => (T.playing ? T.beatAt(ST.ctx.currentTime) : T.pos);

  function metroTick(a, b) {
    for (let k = Math.ceil(a - 1e-9); k < b; k++) {
      const pre = ST.rec.on && k < ST.rec.startBeat;
      if (T.metro || pre) A.click(((k % 4) + 4) % 4 === 0, T.sa.t0 + (k - T.sa.beat0) * spb());
    }
  }
  function tick() {
    const c = ST.ctx, horizon = c.currentTime + 0.25, lp = project.loop;
    const useLoop = lp.on && !ST.rec.on;
    let guard = 0;
    while (guard++ < 6) {
      const hb = T.sa.beat0 + (horizon - T.sa.t0) / spb();
      const end = useLoop && T.sched < lp.end ? Math.min(hb, lp.end) : hb;
      const env = liveEnv();
      if (end > T.sched) { scheduleRange(env, Math.max(T.sched, 0), end); metroTick(T.sched, end); T.sched = end; }
      if (useLoop && T.sched >= lp.end - 1e-9 && hb >= lp.end) {
        const wt = env.timeOf(lp.end);
        T.sa = { t0: wt, beat0: lp.start }; T.anchors.push(T.sa); T.sched = lp.start;
        enterMid(liveEnv(), lp.start, wt);
        continue;
      }
      break;
    }
    if (T.anchors.length > 3) T.anchors = T.anchors.filter((a, i) => i >= T.anchors.length - 3 || a.t0 > c.currentTime - 1);
    if (!useLoop && !ST.rec.on && ST.curBeat() >= project.bars * 4 + 1) { ST.stop(); T.pos = 0; ST.emit('transport'); }
  }
  ST.play = () => {
    if (!project || T.playing) return;
    ST.ensure(); A.resume(); ST.sync();
    T.sa = { t0: ST.ctx.currentTime + 0.12, beat0: T.pos }; T.anchors = [T.sa]; T.sched = T.pos;
    T.playing = true; T.live = []; T.choke = {};
    if (ST.rec.on) ST.rec.t0 = T.sa.t0 + (ST.rec.startBeat - T.pos) * spb();
    enterMid(liveEnv(), T.pos, T.sa.t0);
    T.timer = setInterval(tick, 25); tick();
    ST.emit('transport');
  };
  ST.stop = (silent) => {
    if (!T.playing && !ST.rec.on) { return; }
    const cur = ST.curBeat();
    clearInterval(T.timer);
    T.live.forEach((v) => { try { v.kill(); } catch (e) { /* ignore */ } }); T.live = [];
    const wasPlaying = T.playing;
    T.playing = false;
    if (ST.rec.on) finishRecording(cur);
    else if (wasPlaying) T.pos = clamp(cur, 0, 1e6);
    if (!silent) ST.emit('transport');
  };
  ST.toggle = () => (T.playing ? ST.stop() : ST.play());
  ST.seek = (b) => {
    b = Math.max(0, b);
    if (T.playing) {
      ST.stop(true); T.pos = b; ST.play();
    } else { T.pos = b; ST.emit('transport'); }
  };
  ST.setBpm = (bpm) => {
    bpm = clamp(Math.round(bpm) || 100, 40, 220);
    if (T.playing) { const cur = ST.curBeat(); ST.stop(true); project.bpm = bpm; T.pos = cur; ST.sync(); ST.play(); }
    else { project.bpm = bpm; ST.sync(); }
    ST.emit('project'); ST.autosave();
  };

  /* =========================================================
     Recording: notes (from the Play panel) and microphone
     ========================================================= */
  const rec = (ST.rec = { on: false, track: null, startBeat: 0, notes: [], mode: 'notes', t0: 0 });
  ST.mic = {};
  ST.micOpen = async () => {
    if (ST.mic.stream) return ST.mic;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Microphone access needs https:// or http://localhost');
    A.init(); const c = A.ctx();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const src = c.createMediaStreamSource(stream);
    const an = c.createAnalyser(); an.fftSize = 1024; src.connect(an);
    const proc = c.createScriptProcessor(4096, 1, 1);
    const mute = c.createGain(); mute.gain.value = 0;
    src.connect(proc); proc.connect(mute); mute.connect(c.destination);
    const m = (ST.mic = { stream, src, an, proc, mute, cap: null, buf: new Float32Array(1024) });
    proc.onaudioprocess = (e) => { if (m.cap) m.cap.push({ t: e.playbackTime, d: new Float32Array(e.inputBuffer.getChannelData(0)) }); };
    return m;
  };
  ST.micLevel = () => {
    const m = ST.mic; if (!m.an) return 0;
    m.an.getFloatTimeDomainData(m.buf);
    let p = 0; for (let i = 0; i < m.buf.length; i++) { const v = Math.abs(m.buf[i]); if (v > p) p = v; }
    return p;
  };
  ST.micClose = () => {
    const m = ST.mic; if (!m.stream) return;
    m.stream.getTracks().forEach((t) => t.stop());
    try { m.proc.disconnect(); m.src.disconnect(); } catch (e) { /* ignore */ }
    ST.mic = {};
  };
  ST.micBegin = () => { if (ST.mic.proc) ST.mic.cap = []; };
  ST.micEnd = (startTime, endTime) => {
    const m = ST.mic, chunks = m.cap; m.cap = null;
    if (!chunks || !chunks.length) return null;
    const sr = ST.ctx.sampleRate, n = chunks.length * 4096, all = new Float32Array(n);
    chunks.forEach((ch, i) => all.set(ch.d, i * 4096));
    const comp = ((ST.ctx.outputLatency || 0) + (ST.ctx.baseLatency || 0) + ST.latencyMs / 1000);
    const t0 = chunks[0].t;
    const i0 = clamp(Math.round((startTime - t0 + comp) * sr), 0, n), i1 = clamp(Math.round((endTime - t0 + comp) * sr), 0, n);
    return i1 > i0 + 100 ? all.slice(i0, i1) : null;
  };

  ST.canRecord = (tr) => tr && (tr.type === 'audio' || (VMI.byId[tr.inst] && VMI.byId[tr.inst].layout !== 'theremin'));
  ST.record = async () => {
    if (rec.on) return ST.stop();
    const tr = ST.track(ST.armed) || ST.track(ST.selTrack);
    if (!tr) return ST.toast('Add a track first (pick an instrument on the left)', 'warn');
    if (!ST.canRecord(tr)) return ST.toast('This instrument can’t be recorded (continuous control). Pick another track.', 'warn');
    ST.ensure(); A.resume();
    try { if (tr.type === 'audio') await ST.micOpen(); } catch (e) { return ST.toast('Microphone: ' + (e.message || 'permission denied'), 'warn'); }
    if (T.playing) ST.stop(true);
    const start = Math.floor(T.pos / 4) * 4;
    rec.on = true; rec.track = tr.id; rec.startBeat = start; rec.notes = []; rec.mode = tr.type === 'audio' ? 'audio' : 'notes'; rec.open = {};
    T.pos = start - (T.countIn ? 4 : 0);
    ST.armed = tr.id;
    ST.play();
    if (rec.mode === 'audio') ST.micBegin();
    ST.emit('transport');
  };
  /* called by the Play panel */
  ST.noteOn = (spec, vel, key) => {
    if (!rec.on || rec.mode !== 'notes') return null;
    const b = ST.curBeat(); if (b < rec.startBeat - 0.05) return null;
    const o = { b: Math.max(b, rec.startBeat), vel, n: spec.pad ? spec.pad.id : spec.midi, key };
    rec.open[key] = o; return o;
  };
  ST.noteOff = (key) => {
    const o = rec.open && rec.open[key]; if (!o) return;
    delete rec.open[key];
    rec.notes.push({ t: o.b, d: Math.max(0.05, ST.curBeat() - o.b), n: o.n, v: o.vel });
  };
  function finishRecording(endBeat) {
    const r = rec; r.on = false;
    const tr = ST.track(r.track);
    const cur = endBeat;
    if (r.mode === 'notes') {
      Object.keys(r.open || {}).forEach((k) => { const o = r.open[k]; r.notes.push({ t: o.b, d: Math.max(0.05, cur - o.b), n: o.n, v: o.vel }); });
      T.pos = r.startBeat;
      if (!tr || !r.notes.length) { ST.emit('transport'); return; }
      ST.snap();
      const q = ST.quant;
      const notes = r.notes.map((n) => { let t = n.t, d = n.d; if (q) { t = Math.round(t / q) * q; d = Math.max(q, Math.round(d / q) * q); } return { t, d, n: n.n, v: n.v }; });
      const first = Math.min.apply(null, notes.map((n) => n.t)), last = Math.max.apply(null, notes.map((n) => n.t + n.d));
      const a = Math.floor(first / 4) * 4, b = Math.max(a + 4, Math.ceil(last / 4) * 4);
      ST.ensureBars(b);
      const cl = ST.mergeNotes(tr, a, b, notes);
      ST.selClip = cl.id; ST.toast('Recorded ' + notes.length + ' notes'); ST.touch(); ST.emit('selection');
    } else {
      const startTime = r.t0, endTime = ST.ctx.currentTime;
      const data = ST.micEnd(startTime, endTime);
      T.pos = r.startBeat;
      if (!data || !tr) { ST.toast('Nothing recorded — check the microphone', 'warn'); ST.emit('transport'); return; }
      const sr = ST.ctx.sampleRate;
      lib.addRaw([data], sr, tr.name + ' take', 'rec').then((s) => {
        ST.snap();
        const lenB = (data.length / sr) / spb();
        ST.ensureBars(r.startBeat + lenB);
        // replace anything under the new take
        tr.clips = tr.clips.filter((c) => c.start + c.len <= r.startBeat || c.start >= r.startBeat + lenB);
        const cl = ST.addClip(tr, r.startBeat, lenB, []); cl.sample = s.id; cl.off = 0; cl.gain = 1; cl.name = s.name;
        ST.selClip = cl.id; ST.touch(); ST.emit('selection'); ST.toast('Take saved to your library');
        ST.emit('take', { t: tr, c: cl, s });
      });
    }
    ST.emit('transport');
  }

  /* quick sample recorder (library) */
  ST.quick = { on: false, t: 0 };
  ST.quickStart = async () => { await ST.micOpen(); A.resume(); ST.quick.on = true; ST.quick.t = ST.ctx.currentTime; ST.micBegin(); };
  ST.quickStop = async (name) => {
    ST.quick.on = false;
    const data = ST.micEnd(ST.quick.t, ST.ctx.currentTime + 0.05);
    if (!data) return null;
    // trim leading/trailing silence
    let a = 0, b = data.length; const th = 0.01;
    while (a < b && Math.abs(data[a]) < th) a++;
    while (b > a && Math.abs(data[b - 1]) < th) b--;
    const s = await lib.addRaw([data.slice(Math.max(0, a - 400), Math.min(data.length, b + 2000))], ST.ctx.sampleRate, name || 'Recording', 'rec');
    return s;
  };

  /* =========================================================
     Beatbox analysis
     ========================================================= */
  const an = (ST.an = {});
  an.onsets = (data, sr, sens) => {
    const hop = Math.round(sr * 0.004), win = hop * 2, n = Math.floor((data.length - win) / hop);
    if (n < 6) return [];
    const lev = new Float32Array(n);
    let mx = 0;
    for (let i = 0; i < n; i++) { let s = 0; const o = i * hop; for (let k = 0; k < win; k++) { const v = data[o + k]; s += v * v; } lev[i] = Math.sqrt(s / win); if (lev[i] > mx) mx = lev[i]; }
    if (mx < 0.003) return [];
    const L = new Float32Array(n); for (let i = 0; i < n; i++) L[i] = 20 * Math.log10(lev[i] + 1e-5);
    const thDb = 5 + (1 - sens) * 14, floor = mx * 0.04, gap = Math.round(0.07 / (hop / sr));
    const rise = new Float32Array(n);
    const Lp = (k) => (k < 0 ? -100 : L[k]);
    for (let i = 0; i < n; i++) rise[i] = L[i] - Math.min(Lp(i - 1), Lp(i - 2), Lp(i - 3));
    const out = []; let lastI = -1e9;
    for (let i = 0; i < n - 1; i++) {
      if (rise[i] > thDb && (i === 0 || rise[i] >= rise[i - 1]) && rise[i] >= rise[i + 1] && lev[i] > floor && i - lastI > gap) {
        let j = i; while (j > 1 && lev[j - 1] < lev[j]) j--;
        out.push(Math.max(0, (j - 1) * hop) / sr); lastI = i;
      }
    }
    return out;
  };
  an.classify = (data, sr, start, end) => {
    const i0 = Math.round(start * sr), i1 = Math.min(data.length, i0 + Math.min(Math.round((end - start) * sr), Math.round(0.12 * sr)));
    const n = i1 - i0; if (n < 64) return 'perc';
    let tot = 0, low = 0, lp = 0, hi = 0, lpH = 0, zc = 0, prev = 0;
    const a = 1 - Math.exp((-2 * Math.PI * 220) / sr), b = 1 - Math.exp((-2 * Math.PI * 4500) / sr);
    for (let i = i0; i < i1; i++) {
      const v = data[i]; tot += v * v;
      lp += a * (v - lp); low += lp * lp;
      lpH += b * (v - lpH); const hp = v - lpH; hi += hp * hp;
      if ((v >= 0) !== (prev >= 0)) zc++; prev = v;
    }
    const lowR = low / (tot + 1e-9), hiR = hi / (tot + 1e-9), zcr = zc / n;
    if (lowR > 0.35) return 'kick';
    if (hiR > 0.35) return 'hat';
    if (zcr > 0.04) return 'snare';
    return 'perc';
  };
  /** returns slices: [{start,end,cls,peak}] in seconds */
  an.slices = (data, sr, sens) => {
    const ons = an.onsets(data, sr, sens), dur = data.length / sr;
    return ons.map((t, i) => {
      const end = Math.min(i + 1 < ons.length ? ons[i + 1] : dur, t + 0.55, dur);
      let pk = 0; for (let k = Math.round(t * sr); k < Math.min(data.length, Math.round(end * sr)); k++) pk = Math.max(pk, Math.abs(data[k]));
      return { start: t, end: Math.max(end, t + 0.04), cls: an.classify(data, sr, t, end), peak: pk };
    });
  };

  /* =========================================================
     Export (offline mixdown to WAV)
     ========================================================= */
  function encodeWav(buf) {
    const nc = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
    const ab = new ArrayBuffer(44 + len * nc * 2), v = new DataView(ab);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + len * nc * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, len * nc * 2, true);
    const ch = []; for (let i = 0; i < nc; i++) ch.push(buf.getChannelData(i));
    let o = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < nc; c++) { const s = clamp(ch[c][i], -1, 1); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    return new Blob([ab], { type: 'audio/wav' });
  }
  ST.exportWav = async (loopOnly) => {
    ST.ensure();
    let from = 0, to = 0;
    project.tracks.forEach((t) => t.clips.forEach((c) => { to = Math.max(to, c.start + c.len); }));
    if (loopOnly && project.loop.on) { from = project.loop.start; to = project.loop.end; }
    if (to <= from) { ST.toast('Nothing to export yet — add some clips', 'warn'); return null; }
    const sp = spb(), sr = ST.ctx.sampleRate, dur = (to - from) * sp + 2.5;
    const off = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
    const g = new VMI.Graph(off);
    g.setMaster(project.master, project.bpm);
    project.tracks.forEach((t) => g.strip(t.id).apply(t));
    const env = { c: off, spb: sp, live: null, choke: {}, skip, timeOf: (b) => (b - from) * sp, strip: (id) => g.strips.get(id) };
    enterMid(env, from, 0);
    scheduleRange(env, from, to);
    const buf = await off.startRendering();
    return encodeWav(buf);
  };

  ST.encodeWav = encodeWav;
})();
