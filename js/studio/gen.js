/* gen.js — song generator: genre + mood + key + tempo + length → a full arranged, editable song */
(function () {
  'use strict';
  const VMI = window.VMI, A = VMI.audio, ST = VMI.st;
  const GEN = (VMI.gen = {});
  const h = (...a) => VMI.sui.h(...a);

  /* ---------- seeded randomness ---------- */
  const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10] };

  /* ---------- moods: scale + chord progressions (scale degrees, 0 = tonic) ---------- */
  const MOODS = {
    happy: { label: '😄 Happy', scale: 'major', progs: [[0, 4, 5, 3], [0, 3, 4, 3], [0, 5, 3, 4], [3, 4, 0, 0]] },
    chill: { label: '😎 Chill', scale: 'major', sev: true, progs: [[1, 4, 0, 5], [0, 3, 1, 4], [3, 2, 1, 0]] },
    sad: { label: '😢 Sad', scale: 'minor', progs: [[0, 5, 2, 6], [0, 3, 5, 4], [5, 3, 0, 6], [0, 6, 5, 6]] },
    dark: { label: '🖤 Dark', scale: 'minor', progs: [[0, 5, 6, 0], [0, 3, 0, 4], [0, 1, 0, 6]] },
    energetic: { label: '⚡ Energetic', scale: 'minor', progs: [[0, 5, 2, 6], [0, 6, 5, 6], [5, 6, 0, 0]] },
    dreamy: { label: '🌙 Dreamy', scale: 'major', sev: true, progs: [[0, 3, 0, 3], [3, 4, 2, 5], [0, 5, 3, 4]] },
    epic: { label: '🔥 Epic', scale: 'minor', progs: [[0, 5, 2, 6], [5, 6, 0, 0], [0, 3, 5, 6]] },
  };

  /* ---------- genres ---------- */
  const D = (map) => map; // drum pattern map: padId → 16 steps
  const GENRES = {
    'Hip-hop': { emoji: '🎤', bpm: [86, 96], swing: 0.18, drums: 'drum-kit', moods: ['chill', 'dark', 'sad', 'energetic'],
      beat: { verse: D({ kick: 'X.....x...x.....', snare: '....X.......X...', hatC: 'x.x.x.x.x.x.x.x.' }), chorus: D({ kick: 'X.....x.x.x.....', snare: '....X.......X...', hatC: 'x.x.x.x.x.x.x.xx', hatO: '..............x.' }) },
      bass: { inst: 'bass-guitar', style: 'groove' }, chords: { inst: 'electric-piano', style: 'stab' }, lead: { inst: 'flute', fx: 'Space echo' }, pad: { inst: 'string-ensemble' } },
    Trap: { emoji: '💎', bpm: [134, 148], swing: 0, drums: 'drum-machine', half: true, moods: ['dark', 'sad', 'energetic', 'epic'],
      beat: { verse: D({ kick: 'X.......x..x....', snare: '........X.......', hatC: 'x.x.x.x.x.x.x.x.' }), chorus: D({ kick: 'X.....x...x..x..', snare: '........X.......', clap: '........X.......', hatC: 'xxxxxxxxxxxxxxxx', hatO: '......x.........' }) },
      bass: { inst: 'synthesizer', style: '808', opts: { wave: 'sine', cutoff: 600, res: 1, attack: 0.005, release: 0.2, detune: 0, sub: false } }, chords: { inst: 'choir', style: 'pad', opts: { vowel: 'o' } }, lead: { inst: 'glockenspiel', fx: 'Wide shimmer' }, pad: { inst: 'string-ensemble' } },
    'Lo-fi': { emoji: '☕', bpm: [72, 84], swing: 0.5, drums: 'drum-kit', soft: true, moods: ['chill', 'dreamy', 'sad'],
      beat: { verse: D({ kick: 'X......x..x.....', snare: '....x.......x...', hatC: 'x.xxx.x.x.xxx.x.' }), chorus: D({ kick: 'X......x..x..x..', snare: '....x.......x...', hatC: 'x.xxx.x.x.xxx.x.', hatO: '..............x.' }) },
      bass: { inst: 'bass-guitar', style: 'root' }, chords: { inst: 'electric-piano', style: 'pad', fx: 'Lo-fi tape' }, lead: { inst: 'kalimba', fx: 'Space echo' }, pad: { inst: 'string-ensemble' }, vinyl: true },
    Pop: { emoji: '🌟', bpm: [100, 120], swing: 0, drums: 'drum-kit', moods: ['happy', 'sad', 'energetic', 'dreamy'],
      beat: { verse: D({ kick: 'X.......X.......', snare: '....X.......X...', hatC: 'x.x.x.x.x.x.x.x.' }), chorus: D({ kick: 'X...X...X...X...', snare: '....X.......X...', hatC: 'x.x.x.x.x.x.x.x.', hatO: '..x...x...x...x.' }) },
      bass: { inst: 'synthesizer', style: 'eighths', opts: { wave: 'sawtooth', cutoff: 700, res: 2, attack: 0.005, release: 0.1, detune: 4, sub: true } }, chords: { inst: 'grand-piano', style: 'arp' }, lead: { inst: 'synthesizer', opts: { wave: 'square', cutoff: 3000, res: 2, attack: 0.01, release: 0.2, detune: 6, sub: false }, fx: 'Wide shimmer' }, pad: { inst: 'string-ensemble' } },
    'House / EDM': { emoji: '🪩', bpm: [122, 128], swing: 0, drums: 'drum-machine', moods: ['energetic', 'happy', 'dreamy', 'dark'],
      beat: { verse: D({ kick: 'X...X...X...X...', clap: '....x.......x...', hatC: '..x...x...x...x.' }), chorus: D({ kick: 'X...X...X...X...', clap: '....x.......x...', hatO: '..x...x...x...x.', hatC: 'x.x.x.x.x.x.x.x.', shk: 'xxxxxxxxxxxxxxxx' }) },
      bass: { inst: 'synthesizer', style: 'offbeat', opts: { wave: 'sawtooth', cutoff: 900, res: 6, attack: 0.005, release: 0.1, detune: 10, sub: true } }, chords: { inst: 'synthesizer', style: 'house', opts: { wave: 'sawtooth', cutoff: 2500, res: 3, attack: 0.005, release: 0.15, detune: 14, sub: false }, fx: 'Space echo' }, lead: { inst: 'synthesizer', style: 'arp', opts: { wave: 'square', cutoff: 3500, res: 5, attack: 0.005, release: 0.1, detune: 8, sub: false } }, pad: { inst: 'string-ensemble' } },
    Afrobeat: { emoji: '🌍', bpm: [100, 112], swing: 0.1, drums: 'drum-machine', moods: ['happy', 'chill', 'energetic'],
      beat: { verse: D({ kick: 'X...x.x...x.....', rim: '...x..x....x..x.', cLo: '..x.....x.x.....', cHi: '.x...x.x...x..x.', shk: 'x.xx.xx.x.xx.xx.' }), chorus: D({ kick: 'X...x.x...x.....', snare: '....x.......x..x', cLo: '..x.....x.x.....', cHi: '.x...x.x...x..x.', hatC: 'x.xx.xx.x.xx.xx.', cow: 'x..x..x...x.x...' }) },
      bass: { inst: 'bass-guitar', style: 'sync' }, chords: { inst: 'marimba', style: 'stab' }, lead: { inst: 'steel-drum' }, pad: { inst: 'string-ensemble' } },
    'R&B': { emoji: '💜', bpm: [68, 82], swing: 0.25, drums: 'drum-kit', soft: true, moods: ['chill', 'dreamy', 'sad'],
      beat: { verse: D({ kick: 'X......x.x......', snare: '....X.......X...', hatC: 'x.x.x.x.x.x.x.x.' }), chorus: D({ kick: 'X......x.x..x...', snare: '....X.......X...', hatC: 'xxx.x.xxx.x.x.x.' }) },
      bass: { inst: 'synthesizer', style: 'root', opts: { wave: 'sine', cutoff: 800, res: 1, attack: 0.01, release: 0.2, detune: 0, sub: false } }, chords: { inst: 'electric-piano', style: 'pad' }, lead: { inst: 'string-ensemble' }, pad: { inst: 'choir', opts: { vowel: 'u' } } },
    Reggaeton: { emoji: '🔥', bpm: [90, 98], swing: 0, drums: 'drum-machine', moods: ['energetic', 'happy', 'dark'],
      beat: { verse: D({ kick: 'X...X...X...X...', snare: '...x..x....x..x.', hatC: 'x.x.x.x.x.x.x.x.' }), chorus: D({ kick: 'X...X...X...X...', snare: '...x..x....x..x.', clap: '...x..x....x..x.', hatC: 'xxxxxxxxxxxxxxxx' }) },
      bass: { inst: 'synthesizer', style: '808', opts: { wave: 'sine', cutoff: 600, res: 1, attack: 0.005, release: 0.15, detune: 0, sub: false } }, chords: { inst: 'synthesizer', style: 'stab', opts: { wave: 'sawtooth', cutoff: 2000, res: 2, attack: 0.005, release: 0.15, detune: 10, sub: false } }, lead: { inst: 'acoustic-guitar' }, pad: { inst: 'string-ensemble' } },
    Rock: { emoji: '🎸', bpm: [112, 140], swing: 0, drums: 'drum-kit', moods: ['energetic', 'epic', 'happy', 'dark'],
      beat: { verse: D({ kick: 'X.......x.x.....', snare: '....X.......X...', hatC: 'x.x.x.x.x.x.x.x.' }), chorus: D({ kick: 'X.x.....x.x.....', snare: '....X.......X...', ride: 'x.x.x.x.x.x.x.x.' }) },
      bass: { inst: 'bass-guitar', style: 'eighths' }, chords: { inst: 'electric-guitar', style: 'power', opts: { drive: 'lead' } }, lead: { inst: 'electric-guitar', opts: { drive: 'lead' }, fx: 'Space echo' }, pad: { inst: 'organ' } },
    Cinematic: { emoji: '🎬', bpm: [70, 90], swing: 0, drums: 'drum-kit', moods: ['epic', 'dark', 'sad', 'dreamy'],
      beat: { verse: D({ floor: 'X.......x.......' }), chorus: D({ floor: 'X.....x.X.......', tom2: '........x...x.x.', crash: 'x...............' }) },
      bass: { inst: 'cello', style: 'root' }, chords: { inst: 'string-ensemble', style: 'pad' }, lead: { inst: 'french-horn', fx: 'Cathedral' }, pad: { inst: 'choir', opts: { vowel: 'a' } } },
  };
  GEN.GENRES = GENRES; GEN.MOODS = MOODS;
  const LENGTHS = {
    loop: { label: 'Loop · 8 bars', secs: [['Loop', 8, 2]] },
    short: { label: 'Short · about 1 min', secs: [['Intro', 4, 0], ['Verse', 8, 1], ['Chorus', 8, 2], ['Outro', 4, 0]] },
    full: { label: 'Full song · 2–3 min', secs: [['Intro', 4, 0], ['Verse', 8, 1], ['Chorus', 8, 2], ['Verse', 8, 1], ['Chorus', 8, 2], ['Bridge', 4, 1], ['Chorus', 8, 3], ['Outro', 4, 0]] },
  };

  /* ---------- music theory helpers ---------- */
  const deg = (g, i) => { const sc = SCALES[g.scale]; return g.key + sc[((i % 7) + 7) % 7] + 12 * Math.floor(i / 7); };
  const chordTones = (g, d, sev) => [0, 2, 4].concat(sev ? [6] : []).map((k) => deg(g, d + k));
  /** voice-led chord: pick the octave/inversion closest to the previous voicing */
  function voice(tones, prev, center) {
    const cands = [];
    for (let inv = 0; inv < tones.length; inv++) {
      const v = tones.map((t, i) => t + (i < inv ? 12 : 0));
      for (let o = -2; o <= 2; o++) cands.push(v.map((n) => n + 12 * o));
    }
    const score = (v) => prev ? v.reduce((s, n, i) => s + Math.abs(n - (prev[i] != null ? prev[i] : prev[prev.length - 1])), 0) : Math.abs(v.reduce((a, b) => a + b, 0) / v.length - center);
    cands.sort((a, b) => score(a) - score(b) || Math.abs(a[0] - center) - Math.abs(b[0] - center));
    return cands.find((v) => v[0] >= center - 10 && v[v.length - 1] <= center + 16) || cands[0];
  }
  const into = (n, lo, hi) => { while (n < lo) n += 12; while (n > hi) n -= 12; return n; };

  /* ---------- part writers: each returns notes for one bar-range (beats relative to section start) ---------- */
  const W = {};
  W.drums = (G, g, sec, r) => {
    const inst = VMI.byId[G.drums], has = (id) => inst.cfg.pads.some((p) => p.id === id);
    const notes = [], beatMap = sec.e >= 2 ? G.beat.chorus : G.beat.verse;
    const vel = G.soft ? 0.6 : 0.8;
    for (let bar = 0; bar < sec.bars; bar++) {
      const last = bar === sec.bars - 1 && sec.bars >= 4;
      const map = sec.e === 0 ? (sec.name === 'Outro' ? { kick: 'X...............' } : (has('hatC') ? { hatC: 'x.x.x.x.x.x.x.x.' } : {})) : beatMap;
      Object.keys(map).forEach((id) => {
        if (!has(id)) return;
        [...map[id]].forEach((ch, i) => {
          if (!/[xX]/.test(ch)) return;
          if (last && sec.e > 0 && i >= 12 && id !== 'kick') return; // make room for the fill
          const sw = G.swing && i % 2 ? G.swing * 0.25 : 0;
          notes.push({ t: bar * 4 + i * 0.25 + sw, d: 0.2, n: id, v: Math.min(1, (ch === 'X' ? 0.95 : vel) * (0.9 + r() * 0.12)) });
        });
      });
      if (last && sec.e > 0) { // fill
        const fill = has('tom1') && r() > 0.5 ? ['tom1', 'tom1', 'tom2', 'tom2'] : ['snare', 'snare', 'snare', 'snare'];
        const ids = has('floor') ? fill.concat(['floor']) : fill;
        [3, 3.25, 3.5, 3.75].forEach((b, k) => { const id = ids[k]; if (has(id)) notes.push({ t: bar * 4 + b, d: 0.2, n: id, v: 0.6 + k * 0.1 }); });
      }
    }
    if (sec.e >= 2 && has('crash')) notes.push({ t: 0, d: 0.3, n: 'crash', v: 0.9 });
    if (sec.name === 'Outro' && has('crash')) notes.push({ t: 0, d: 0.3, n: 'crash', v: 0.8 });
    return notes;
  };
  W.bass = (G, g, sec, r, prog) => {
    const notes = [], st = G.bass.style, lo = G.bass.inst === 'synthesizer' ? 28 : 33, hi = lo + 12;
    for (let bar = 0; bar < sec.bars; bar++) {
      const d = prog[bar % prog.length], root = into(deg(g, d), lo, hi), fifth = root + 7, oct = root + 12, b0 = bar * 4;
      const P = {
        root: [[0, 2, root], [2, 2, r() > 0.5 ? root : fifth]],
        eighths: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].map((t, i) => [t, 0.45, i === 7 ? fifth : root]),
        groove: [[0, 0.5, root], [0.75, 0.25, root], [1.5, 0.5, oct], [2.5, 0.5, root], [3, 0.5, fifth], [3.5, 0.25, root]],
        '808': [[0, 1.5, root], [2.5, 0.5, root], [3, 0.75, r() > 0.6 ? oct : root]],
        offbeat: [0.5, 1.5, 2.5, 3.5].map((t) => [t, 0.4, root]),
        sync: [[0, 0.5, root], [0.75, 0.5, root], [1.5, 0.25, fifth], [2, 0.5, oct], [3, 0.25, root], [3.5, 0.5, fifth]],
      }[st] || [[0, 4, root]];
      P.forEach(([t, dd, n]) => notes.push({ t: b0 + t, d: dd, n, v: 0.8 + r() * 0.1 }));
    }
    return notes;
  };
  W.chords = (G, g, sec, r, prog) => {
    const notes = [], st = G.chords.style, sev = g.sev; let prev = null;
    const center = G.chords.inst === 'electric-guitar' ? 52 : 62;
    for (let bar = 0; bar < sec.bars; bar++) {
      const d = prog[bar % prog.length], v = voice(chordTones(g, d, sev), prev, center); prev = v;
      const b0 = bar * 4, vel = sec.e === 0 ? 0.5 : 0.7;
      const hit = (t, dd, ns, vv) => ns.forEach((n, i) => notes.push({ t: b0 + t + (st === 'strum' ? i * 0.015 : 0), d: dd, n, v: vv || vel }));
      if (st === 'pad' || sec.e === 0) hit(0, 3.9, v);
      else if (st === 'stab') [[0, 0.45], [1.5, 0.45], [2.5, 0.45], [3, 0.7]].forEach(([t, dd]) => hit(t, dd, v));
      else if (st === 'house') [0.5, 1.5, 2.5, 3.5].forEach((t) => hit(t, 0.3, v));
      else if (st === 'arp') [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].forEach((t, i) => notes.push({ t: b0 + t, d: 0.45, n: v[[0, 1, 2, 1, 0, 2, 1, 2][i] % v.length] + (i === 4 ? 12 : 0), v: vel }));
      else if (st === 'power') { const root = into(v[0], 40, 52); [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].forEach((t) => [root, root + 7, root + 12].forEach((n) => notes.push({ t: b0 + t, d: 0.4, n, v: 0.75 }))); }
      else hit(0, 3.9, v);
    }
    return notes;
  };
  W.pad = (G, g, sec, r, prog) => {
    const notes = []; let prev = null;
    for (let bar = 0; bar < sec.bars; bar += 2) {
      const d = prog[bar % prog.length], v = voice(chordTones(g, d, false), prev, 60); prev = v;
      v.forEach((n) => notes.push({ t: bar * 4, d: Math.min(8, (sec.bars - bar) * 4) - 0.1, n, v: 0.45 }));
    }
    return notes;
  };
  const RHYTHMS = [
    [[0, 0.75], [0.75, 0.25], [1, 1], [2, 0.5], [2.5, 0.5], [3, 1], [4, 0.75], [4.75, 0.25], [5, 1], [6, 2]],
    [[0.5, 0.5], [1, 0.5], [1.5, 1], [3, 0.5], [3.5, 0.5], [4.5, 0.5], [5, 0.5], [5.5, 1.5], [7, 1]],
    [[0, 1.5], [1.5, 0.5], [2, 2], [4, 1], [5, 1], [6, 2]],
    [[0, 0.5], [0.5, 0.5], [1, 0.5], [1.5, 0.5], [2, 1], [3, 1], [4, 0.5], [4.5, 0.5], [5, 0.5], [5.5, 0.5], [6, 2]],
  ];
  W.lead = (G, g, sec, r, prog, motif) => {
    if (G.lead.style === 'arp') { // arpeggiated lead (EDM)
      const notes = [];
      for (let bar = 0; bar < sec.bars; bar++) { const tones = chordTones(g, prog[bar % prog.length], false).map((n) => into(n, 72, 84)).sort((a, b) => a - b); for (let i = 0; i < 16; i++) notes.push({ t: bar * 4 + i * 0.25, d: 0.22, n: tones[[0, 1, 2, 1][i % 4]] + (i % 8 === 7 ? 12 : 0), v: 0.6 }); }
      return notes;
    }
    const notes = [], lo = G.lead.inst === 'electric-guitar' ? 62 : 67, hi = lo + 17;
    for (let ph = 0; ph < sec.bars; ph += 2) {
      let last = motif.start;
      motif.rhythm.forEach(([t, dd], i) => {
        const bar = ph + Math.floor(t / 4); if (bar >= sec.bars) return;
        const tones = chordTones(g, prog[bar % prog.length], false);
        let n;
        if (t % 1 === 0) { // strong beat: nearest chord tone, following the motif's contour
          const want = last + motif.contour[i % motif.contour.length];
          n = tones.map((x) => into(x, lo, hi)).concat(tones.map((x) => into(x, lo, hi) + 12)).filter((x) => x <= hi).sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0];
        } else { // passing note: one scale step towards the contour
          const step = motif.contour[i % motif.contour.length] > 0 ? 1 : -1;
          const sc = SCALES[g.scale].map((x) => x + g.key);
          n = last + step; let k = 0; while (!sc.some((x) => (((n - x) % 12) + 12) % 12 === 0) && k++ < 3) n += step;
        }
        n = Math.max(lo, Math.min(hi, n)); last = n;
        const end = ph + 2 >= sec.bars && i === motif.rhythm.length - 1;
        notes.push({ t: ph * 4 + t, d: dd * 0.92, n: end ? into(deg(g, 0), lo, hi) : n, v: 0.7 + r() * 0.15 });
      });
    }
    return notes;
  };

  /* ---------- build the whole project ---------- */
  GEN.create = async (o) => {
    const G = GENRES[o.genre], M = MOODS[o.mood];
    const seed = o.seed || Math.floor(Math.random() * 1e9), r = mulberry(seed);
    const key = o.key === 'auto' ? Math.floor(r() * 12) : +o.key;
    const bpm = o.bpm || Math.round(G.bpm[0] + r() * (G.bpm[1] - G.bpm[0]));
    const g = { genre: o.genre, mood: o.mood, key, scale: M.scale, sev: !!M.sev, bpm, seed, len: o.len, melody: o.melody !== false, fxOn: o.fx !== false };
    g.verseProg = pick(r, M.progs); g.chorusProg = pick(r, M.progs.filter((p) => p !== g.verseProg)) || g.verseProg;
    let at = 0; g.sections = LENGTHS[o.len].secs.map(([name, bars, e]) => { const s = { name, bars, e, start: at }; at += bars * 4; return s; });
    g.motif = makeMotif(r);
    // keep the current song safe
    const cur = ST.proj(); if (cur && cur.tracks.some((t) => t.clips.length)) { await ST.saveAs(); }
    ST.newProject(null);
    const P = ST.proj();
    P.name = o.genre + ' · ' + M.label.replace(/^\S+\s/, '') + ' · ' + KEYS[key] + (M.scale === 'minor' ? 'm' : ''); P.bpm = bpm; P.bars = at / 4;
    P.loop = { on: o.len === 'loop', start: 0, end: at }; P.gen = g;
    const roles = [['drums', G.drums, 'Drums'], ['bass', G.bass.inst, 'Bass'], ['chords', G.chords.inst, 'Chords']];
    if (g.melody) roles.push(['lead', G.lead.inst, 'Lead']);
    roles.push(['pad', G.pad.inst, 'Pad']);
    roles.forEach(([role, inst, name]) => {
      const t = ST.addTrack({ inst }); t.name = name + ' · ' + VMI.byId[inst].name; t.gen = role;
      const spec = G[role] && G[role].opts; if (spec) Object.assign(t.opts, spec);
      if (role === 'drums') { t.vol = 0.85; if (g.fxOn) VMI.FX.applyPreset(t, VMI.FX.presets.find((p) => p.name === 'Big punchy drums')); }
      if (role === 'bass') t.vol = 0.78;
      if (role === 'chords') { t.vol = 0.6; t.rev = 0.25; }
      if (role === 'lead') { t.vol = 0.62; t.rev = 0.3; t.dly = 0.18; }
      if (role === 'pad') { t.vol = 0.4; t.rev = 0.45; }
      const fxName = G[role] && G[role].fx; if (g.fxOn && fxName) VMI.FX.applyPreset(t, VMI.FX.presets.find((p) => p.name === fxName));
      writeRole(t, role, G, g, r);
    });
    ST.selTrack = P.tracks[0].id; ST.armed = P.tracks[0].id;
    ST.touch(); ST.emit('selection'); ST.emit('transport');
    // audio extras: risers before choruses, vinyl crackle for lo-fi
    if (g.fxOn) {
      const ris = g.sections.filter((s, i) => s.e >= 2 && i > 0).map((s) => s.start - 8).filter((b) => b >= 0);
      let fxTrack = null;
      for (const b of ris) { const c = await VMI.loops.add('fx-riser', b, fxTrack); if (c && !fxTrack) fxTrack = ST.findClip(c.id).t; }
      if (fxTrack) { fxTrack.name = 'FX · Risers'; fxTrack.vol = 0.5; }
      if (G.vinyl) { let vt = null; for (let b = 0; b < at; b += 8) { const c = await VMI.loops.add('fx-vinyl', b, vt); if (c && !vt) vt = ST.findClip(c.id).t; } if (vt) { vt.name = 'FX · Vinyl'; vt.vol = 0.45; } }
      ST.selTrack = P.tracks[0].id; ST.touch(); ST.emit('selection');
    }
    ST.seek(0);
    return P;
  };
  function makeMotif(r) {
    const contour = []; for (let i = 0; i < 10; i++) contour.push(pick(r, [-3, -2, -1, 1, 2, 3, 0, 2, -2]));
    return { rhythm: pick(r, RHYTHMS), contour, start: 72 };
  }
  function writeRole(t, role, G, g, r) {
    t.clips = [];
    g.sections.forEach((sec) => {
      if (role === 'bass' && sec.e === 0 && sec.name !== 'Outro') return;
      if (role === 'lead' && sec.e < 2 && !(sec.e === 1 && r() > 0.6)) return;
      if (role === 'pad' && sec.e < 2 && sec.name !== 'Bridge' && sec.name !== 'Intro') return;
      if (role === 'drums' && G.half === undefined && false) return;
      const prog = sec.e >= 2 ? g.chorusProg : g.verseProg;
      const notes = role === 'lead' ? W.lead(G, g, sec, r, prog, sec.e >= 2 ? g.motif : Object.assign({}, g.motif, { start: 67 }))
        : W[role](G, g, sec, r, prog);
      if (!notes.length) return;
      const c = ST.addClip(t, sec.start, sec.bars * 4, notes);
      c.name = sec.name;
    });
  }
  /** regenerate one part of a generated song with fresh randomness */
  GEN.regenerate = (t) => {
    const P = ST.proj(), g = P.gen; if (!g || !t.gen) return;
    const G = GENRES[g.genre], r = mulberry(Math.floor(Math.random() * 1e9));
    ST.snap();
    if (t.gen === 'lead') g.motif = makeMotif(r);
    if (t.gen === 'chords') { const M = MOODS[g.mood]; g.verseProg = pick(r, M.progs); g.chorusProg = pick(r, M.progs); }
    writeRole(t, t.gen, G, g, r);
    if (t.gen === 'chords') { P.tracks.filter((x) => x.gen === 'bass' || x.gen === 'pad' || x.gen === 'lead').forEach((x) => writeRole(x, x.gen, G, g, mulberry(g.seed))); }
    ST.touch(); ST.toast('New ' + t.gen + ' part generated — Ctrl+Z to go back');
  };

  /* ---------- the “Create a song” window ---------- */
  GEN.dialog = () => {
    const st = { genre: 'Hip-hop', mood: 'chill', key: 'auto', bpm: 0, len: 'full', melody: true, fx: true };
    const grid = h('div', { class: 'gen-genres' });
    const moods = h('div', { class: 'gen-moods' });
    const bpmIn = h('input', { type: 'range', min: 60, max: 160, step: 1 });
    const bpmOut = h('output');
    const setBpm = (v) => { st.bpm = v; bpmIn.value = v; bpmOut.textContent = v + ' BPM'; };
    const paint = () => {
      grid.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.g === st.genre));
      moods.innerHTML = '';
      Object.keys(MOODS).forEach((k) => moods.append(h('button', { class: 'chip' + (st.mood === k ? ' on' : '') + (GENRES[st.genre].moods.includes(k) ? ' rec' : ''), onclick: () => { st.mood = k; paint(); } }, MOODS[k].label)));
    };
    Object.keys(GENRES).forEach((k) => grid.append(h('button', { class: 'gen-card', 'data-g': k, onclick: () => { st.genre = k; const b = GENRES[k].bpm; setBpm(Math.round((b[0] + b[1]) / 2)); if (!GENRES[k].moods.includes(st.mood)) st.mood = GENRES[k].moods[0]; paint(); } }, h('span', { class: 'ge' }, GENRES[k].emoji), h('b', null, k), h('small', null, GENRES[k].bpm.join('–') + ' BPM'))));
    bpmIn.oninput = () => setBpm(+bpmIn.value);
    const keySel = h('select', { class: 'sel', onchange: (e) => { st.key = e.target.value; } }, h('option', { value: 'auto' }, 'Surprise me'), KEYS.map((k, i) => h('option', { value: i }, k)));
    const lenSel = h('div', { class: 'gen-moods' }, Object.keys(LENGTHS).map((k) => h('button', { class: 'chip' + (k === st.len ? ' on' : ''), onclick: (e) => { st.len = k; e.currentTarget.parentNode.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === e.currentTarget)); } }, LENGTHS[k].label)));
    const melody = h('input', { type: 'checkbox', class: 'sw', checked: true, onchange: (e) => { st.melody = e.target.checked; } });
    const fx = h('input', { type: 'checkbox', class: 'sw', checked: true, onchange: (e) => { st.fx = e.target.checked; } });
    const go = async (surprise) => {
      if (surprise) { const ks = Object.keys(GENRES); st.genre = ks[Math.floor(Math.random() * ks.length)]; st.mood = pick(Math.random, GENRES[st.genre].moods); st.bpm = 0; st.key = 'auto'; }
      m.close(); ST.toast('Writing your ' + st.genre + ' track…');
      try { await GEN.create(st); ST.toast('Done! Press Space to play. Regenerate any part from its track menu (⋯).'); } catch (e) { console.error(e); ST.toast('Generator error: ' + e.message, 'warn'); }
    };
    const body = h('div', { class: 'gen' },
      h('p', { class: 'muted small' }, 'Pick a style and a vibe. WACK MUZIC writes a complete arranged track (drums, bass, chords, melody, pads and transitions) as normal tracks you can edit, re-record over, add your vocals to, and export. Your current song is saved first.'),
      h('div', { class: 'gen-h' }, 'Genre'), grid,
      h('div', { class: 'gen-h' }, 'Mood'), moods,
      h('div', { class: 'gen-row' },
        h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Tempo'), h('span', { class: 'sl' }, bpmIn, bpmOut)),
        h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Key'), keySel)),
      h('div', { class: 'gen-h' }, 'Length'), lenSel,
      h('div', { class: 'gen-row' }, h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Lead melody'), melody), h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Risers & FX'), fx)),
      h('div', { class: 'row gen-go' }, h('button', { class: 'btn accent', onclick: () => go(false) }, '✨ Generate song'), h('button', { class: 'btn', onclick: () => go(true) }, '🎲 Surprise me')));
    const m = VMI.sui.modal('✨ Create a song', body, { cls: 'wide' });
    setBpm(Math.round((GENRES[st.genre].bpm[0] + GENRES[st.genre].bpm[1]) / 2)); paint();
  };
})();
