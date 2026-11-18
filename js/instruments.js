/* instruments.js — the catalog: metadata, layout config, voice and controls */
(function () {
  'use strict';
  const VMI = window.VMI, V = VMI.voices;

  const CATS = [
    { id: 'keys', name: 'Keyboards', color: '#7c9cff' },
    { id: 'strings', name: 'Strings', color: '#ff9d5c' },
    { id: 'wind', name: 'Winds & Brass', color: '#4fd6a6' },
    { id: 'mallet', name: 'Mallets & Bells', color: '#ffd04d' },
    { id: 'perc', name: 'Drums & Percussion', color: '#ff6b81' },
    { id: 'elec', name: 'Electronic & Voice', color: '#c77dff' },
  ];

  const sel = (id, label, options, value) => ({ id, label, type: 'select', options, value });
  const rng = (id, label, min, max, step, value) => ({ id, label, type: 'range', min, max, step, value });
  const tog = (id, label, value) => ({ id, label, type: 'toggle', value });

  /* ---------- chord shapes (fret per string, low → high, -1 = muted) ---------- */
  const GUITAR_CHORDS = [
    { n: 'C', f: [-1, 3, 2, 0, 1, 0], k: 'KeyA' }, { n: 'G', f: [3, 2, 0, 0, 0, 3], k: 'KeyS' },
    { n: 'D', f: [-1, -1, 0, 2, 3, 2], k: 'KeyD' }, { n: 'A', f: [-1, 0, 2, 2, 2, 0], k: 'KeyF' },
    { n: 'E', f: [0, 2, 2, 1, 0, 0], k: 'KeyG' }, { n: 'Am', f: [-1, 0, 2, 2, 1, 0], k: 'KeyH' },
    { n: 'Em', f: [0, 2, 2, 0, 0, 0], k: 'KeyJ' }, { n: 'Dm', f: [-1, -1, 0, 2, 3, 1], k: 'KeyK' },
    { n: 'F', f: [1, 3, 3, 2, 1, 1], k: 'KeyL' }, { n: 'Bm', f: [-1, 2, 4, 4, 3, 2], k: 'Semicolon' },
  ];
  const BANJO_CHORDS = [
    { n: 'G', f: [0, 0, 0, 0, 0], k: 'KeyA' }, { n: 'C', f: [2, 0, 1, 2, 0], k: 'KeyS' },
    { n: 'D', f: [0, 2, 3, 4, 2], k: 'KeyD' }, { n: 'Em', f: [2, 0, 0, 2, 0], k: 'KeyF' },
    { n: 'Am', f: [2, 2, 1, 2, 2], k: 'KeyG' }, { n: 'A', f: [2, 2, 2, 2, 2], k: 'KeyH' },
  ];

  /* ---------- pad definitions ---------- */
  const ROW1 = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
  const ROWQ = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'];
  const ROWA = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'];
  const ROWZ = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'];

  const kit = [
    { id: 'crash', label: 'Crash', keys: ['KeyQ', 'KeyU'], snd: 'crash', x: 19, y: 15, r: 10, shape: 'cymbal' },
    { id: 'ride', label: 'Ride', keys: ['KeyW', 'KeyI'], snd: 'ride', x: 82, y: 15, r: 11, shape: 'cymbal' },
    { id: 'hatC', label: 'Hi-Hat', keys: ['KeyC', 'KeyK'], snd: 'hatC', x: 10, y: 36, r: 8, shape: 'cymbal', choke: 'hat' },
    { id: 'hatO', label: 'Open Hat', keys: ['KeyV', 'KeyL'], snd: 'hatO', x: 10, y: 53, r: 6.5, shape: 'cymbal', choke: 'hat' },
    { id: 'tom1', label: 'Tom 1', keys: ['KeyA', 'KeyH'], snd: 'tom', f: 190, tau: 0.22, x: 38, y: 25, r: 9.5, color: '#e0463c' },
    { id: 'tom2', label: 'Tom 2', keys: ['KeyS', 'KeyG'], snd: 'tom', f: 150, tau: 0.26, x: 62, y: 25, r: 9.5, color: '#e0463c' },
    { id: 'snare', label: 'Snare', keys: ['KeyX', 'KeyJ'], snd: 'snare', x: 27, y: 47, r: 10.5, color: '#f3f0e6' },
    { id: 'kick', label: 'Kick', keys: ['Space', 'KeyZ', 'KeyF'], snd: 'kick', x: 50, y: 48, r: 13, color: '#3b3f4a' },
    { id: 'floor', label: 'Floor Tom', keys: ['KeyD', 'KeyB'], snd: 'tom', f: 105, tau: 0.32, x: 76, y: 47, r: 11, color: '#e0463c' },
  ];

  const machine = [
    ['kick', 'Kick', 'kick808'], ['snare', 'Snare', 'snare'], ['clap', 'Clap', 'clap'], ['hatC', 'Closed Hat', 'hatC', { choke: 'hat' }],
    ['hatO', 'Open Hat', 'hatO', { choke: 'hat' }], ['tomL', 'Low Tom', 'tom', { f: 100, tau: 0.3 }], ['tomH', 'Hi Tom', 'tom', { f: 165, tau: 0.22 }], ['cow', 'Cowbell', 'cowbell'],
    ['rim', 'Rim', 'rim'], ['crash', 'Crash', 'crash'], ['clave', 'Clave', 'clave'], ['wood', 'Wood', 'wood'],
    ['cLo', 'Conga Lo', 'drum', { f: 230, tau: 0.2 }], ['cHi', 'Conga Hi', 'drum', { f: 330, tau: 0.16 }], ['shk', 'Shaker', 'shaker'], ['tamb', 'Tambourine', 'tamb'],
  ];
  const machineKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyV'];
  const machinePads = machine.map((m, i) => Object.assign({ id: m[0], label: m[1], keys: [machineKeys[i]], snd: m[2], color: i < 8 ? '#ff6b81' : '#ffa45c' }, m[3] || {}));

  const notePads = (notes, keys, extra) => notes.map((n, i) => Object.assign({ id: 'n' + i, note: n, label: n, keys: [keys[i]] }, extra || {}));

  const BOWL_NOTES = ['C3', 'E3', 'G3', 'A3', 'C4'];

  /* ---------- the instruments ---------- */
  const I = [];
  const add = (o) => { I.push(Object.assign({ gain: 1, reverb: 0.25, controls: [] }, o)); };

  /* Keyboards */
  add({ id: 'grand-piano', name: 'Grand Piano', cat: 'keys', emoji: '🎹', desc: 'Concert grand with sustain pedal.', layout: 'keys', cfg: { skin: 'piano', start: 48, min: 21, max: 108 }, voice: V.piano, pedal: true, reverb: 0.3 });
  add({ id: 'electric-piano', name: 'Electric Piano', cat: 'keys', emoji: '🎛️', desc: 'Warm, bell-like tine piano.', layout: 'keys', cfg: { skin: 'dark', start: 48, min: 28, max: 100 }, voice: V.epiano, pedal: true, reverb: 0.2 });
  add({ id: 'organ', name: 'Drawbar Organ', cat: 'keys', emoji: '🎶', desc: 'Tonewheel organ with rotary speaker.', layout: 'keys', cfg: { skin: 'organ', start: 36, min: 24, max: 96 }, voice: V.hammond, reverb: 0.15,
    controls: [sel('reg', 'Registration', [['jazz', 'Jazz'], ['gospel', 'Gospel'], ['rock', 'Rock'], ['full', 'Full'], ['flute', 'Flutes'], ['mellow', 'Mellow']], 'jazz'), sel('leslie', 'Rotary', [['off', 'Off'], ['slow', 'Slow'], ['fast', 'Fast']], 'slow'), tog('perc', 'Key click', true)] });
  add({ id: 'pipe-organ', name: 'Pipe Organ', cat: 'keys', emoji: '⛪', desc: 'Cathedral organ with stops.', layout: 'keys', cfg: { skin: 'organ', start: 36, min: 24, max: 96 }, voice: V.pipeorgan, reverb: 0.6,
    controls: [sel('reg', 'Stops', [['full', 'Full'], ['principal', 'Principal'], ['flutes', 'Flutes'], ['diapason', 'Diapason']], 'full')] });
  add({ id: 'harpsichord', name: 'Harpsichord', cat: 'keys', emoji: '🏰', desc: 'Plucked baroque keyboard.', layout: 'keys', cfg: { skin: 'harpsi', start: 48, min: 29, max: 96 }, voice: V.harpsichord, reverb: 0.3 });
  add({ id: 'celesta', name: 'Celesta', cat: 'keys', emoji: '✨', desc: 'Delicate, glassy bell keyboard.', layout: 'keys', cfg: { skin: 'piano', start: 60, min: 48, max: 108 }, voice: V.celesta, pedal: true, reverb: 0.4 });
  add({ id: 'accordion', name: 'Accordion', cat: 'keys', emoji: '🪗', desc: 'Reedy squeezebox keyboard.', layout: 'keys', cfg: { skin: 'wood', start: 48, min: 36, max: 84 }, voice: V.accordion, reverb: 0.2 });

  /* Mallets & bells */
  add({ id: 'xylophone', name: 'Xylophone', cat: 'mallet', emoji: '🪵', desc: 'Bright wooden bars.', layout: 'keys', cfg: { skin: 'bars', start: 72, min: 60, max: 108, kw: 62 }, voice: V.xylophone, ring: true, reverb: 0.2 });
  add({ id: 'marimba', name: 'Marimba', cat: 'mallet', emoji: '🥢', desc: 'Warm, resonant rosewood bars.', layout: 'keys', cfg: { skin: 'bars', start: 48, min: 36, max: 96, kw: 62 }, voice: V.marimba, ring: true, reverb: 0.25 });
  add({ id: 'glockenspiel', name: 'Glockenspiel', cat: 'mallet', emoji: '🔔', desc: 'Sparkling steel bars.', layout: 'keys', cfg: { skin: 'metal', start: 72, min: 67, max: 108, kw: 62 }, voice: V.glock, ring: true, reverb: 0.35 });
  add({ id: 'vibraphone', name: 'Vibraphone', cat: 'mallet', emoji: '🎼', desc: 'Metal bars with a shimmering motor.', layout: 'keys', cfg: { skin: 'metal', start: 48, min: 48, max: 96, kw: 62 }, voice: V.vibes, pedal: true, reverb: 0.35,
    controls: [sel('motor', 'Motor', [['off', 'Off'], ['slow', 'Slow'], ['fast', 'Fast']], 'slow')] });
  add({ id: 'tubular-bells', name: 'Tubular Bells', cat: 'mallet', emoji: '🛎️', desc: 'Orchestral chime tubes.', layout: 'scale', cfg: { skin: 'tubes', start: 'C4', scale: [0, 2, 4, 5, 7, 9, 11], count: 15, minw: 40, max: 17 }, voice: V.tubular, ring: true, reverb: 0.5 });
  add({ id: 'music-box', name: 'Music Box', cat: 'mallet', emoji: '🎁', desc: 'Tiny steel comb.', layout: 'scale', cfg: { skin: 'tines', start: 'C5', scale: [0, 2, 4, 5, 7, 9, 11], count: 22, minw: 28, comb: true }, voice: V.musicbox, ring: true, reverb: 0.4 });
  add({ id: 'kalimba', name: 'Kalimba', cat: 'mallet', emoji: '🪘', desc: 'African thumb piano, 17 tines.', layout: 'scale', cfg: { skin: 'tines', start: 'C4', scale: [0, 2, 4, 5, 7, 9, 11], count: 17, minw: 26, zigzag: true }, voice: V.kalimba, ring: true, reverb: 0.3 });
  add({ id: 'steel-drum', name: 'Steel Drum', cat: 'mallet', emoji: '🌴', desc: 'Caribbean tenor pan.', layout: 'pads', cfg: { arrange: 'ring', glide: true, r: 36, pr: 8.6, round: true,
    pads: [{ id: 'c', note: 'C5', label: 'C5', keys: ['Space'], r: 11 }].concat(notePads(['C4', 'F4', 'A#4', 'D#4', 'G#4', 'C#4', 'F#4', 'B4', 'E4', 'A4', 'D4', 'G4'], ROWQ)) }, voice: V.steelpan, ring: true, reverb: 0.3 });
  add({ id: 'handpan', name: 'Handpan', cat: 'mallet', emoji: '🛸', desc: 'Hand-played steel hang in D Kurd.', layout: 'pads', cfg: { arrange: 'ring', glide: true, r: 35, pr: 10, round: true,
    pads: [{ id: 'ding', note: 'D3', label: 'D3', keys: ['Space'], r: 14 }].concat(notePads(['A3', 'A#3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4'], ROWA)) }, voice: V.handpan, ring: true, reverb: 0.4 });
  add({ id: 'tongue-drum', name: 'Tongue Drum', cat: 'mallet', emoji: '🌙', desc: 'Pentatonic steel tongue drum.', layout: 'pads', cfg: { arrange: 'ring', glide: true, r: 33, pr: 11, round: true, pads: notePads(['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5'], ROWA) }, voice: V.tongue, ring: true, reverb: 0.35 });
  add({ id: 'singing-bowls', name: 'Singing Bowls', cat: 'mallet', emoji: '🧘', desc: 'Resonant meditation bowls.', layout: 'pads', cfg: { arrange: 'ring', r: 32, pr: 12, round: true, bowl: true,
    pads: [{ id: 'b0', note: 'C3', label: 'C3', keys: ['KeyA'], r: 17 }].concat(['E3', 'G3', 'A3', 'C4'].map((n, i) => ({ id: 'b' + (i + 1), note: n, label: n, keys: [['KeyS', 'KeyD', 'KeyF', 'KeyG'][i]], r: 13 - i }))) }, voice: V.bowl, ring: true, reverb: 0.55 });
  add({ id: 'wind-chimes', name: 'Wind Chimes', cat: 'mallet', emoji: '🎐', desc: 'Hover or swipe; try the breeze.', layout: 'scale', cfg: { skin: 'chimes', start: 'C5', scale: [0, 2, 4, 7, 9], count: 15, minw: 30, hover: true }, voice: V.chimes, ring: true, reverb: 0.5,
    controls: [tog('breeze', 'Gentle breeze', false)] });

  /* Strings */
  add({ id: 'acoustic-guitar', name: 'Acoustic Guitar', cat: 'strings', emoji: '🎸', desc: 'Steel-string guitar with chord strumming.', layout: 'frets', cfg: { tuning: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], frets: 12, chords: GUITAR_CHORDS, skin: 'wood' }, voice: V.guitar, ring: true, reverb: 0.2 });
  add({ id: 'electric-guitar', name: 'Electric Guitar', cat: 'strings', emoji: '🤘', desc: 'Clean to screaming lead distortion.', layout: 'frets', cfg: { tuning: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], frets: 12, chords: GUITAR_CHORDS, skin: 'dark' }, voice: V.eguitar, ring: true, reverb: 0.2,
    controls: [sel('drive', 'Amp', [['clean', 'Clean'], ['crunch', 'Crunch'], ['lead', 'Lead']], 'crunch')] });
  add({ id: 'bass-guitar', name: 'Bass Guitar', cat: 'strings', emoji: '🎚️', desc: 'Four deep strings; each key row is a string.', layout: 'frets', cfg: { tuning: ['E1', 'A1', 'D2', 'G2'], frets: 12, rows: true, skin: 'dark' }, voice: V.bass, ring: true, reverb: 0.1 });
  add({ id: 'ukulele', name: 'Ukulele', cat: 'strings', emoji: '🌺', desc: 'Cheerful four-string uke.', layout: 'frets', cfg: { tuning: ['G4', 'C4', 'E4', 'A4'], frets: 12, rows: true, skin: 'wood' }, voice: V.ukulele, ring: true, reverb: 0.2 });
  add({ id: 'banjo', name: 'Banjo', cat: 'strings', emoji: '🤠', desc: 'Five-string open-G banjo.', layout: 'frets', cfg: { tuning: ['D3', 'G3', 'B3', 'D4', 'G4'], frets: 12, chords: BANJO_CHORDS, skin: 'wood' }, voice: V.banjo, ring: true, reverb: 0.15 });
  add({ id: 'mandolin', name: 'Mandolin', cat: 'strings', emoji: '🍕', desc: 'Double-course Italian mandolin.', layout: 'frets', cfg: { tuning: ['G3', 'D4', 'A4', 'E5'], frets: 12, rows: true, skin: 'wood' }, voice: V.mandolin, ring: true, reverb: 0.25 });
  add({ id: 'harp', name: 'Harp', cat: 'strings', emoji: '🪉', desc: 'Swipe across the strings for glissandi.', layout: 'scale', cfg: { skin: 'strings', start: 'C2', scale: [0, 2, 4, 5, 7, 9, 11], count: 40, minw: 24 }, voice: V.harp, ring: true, reverb: 0.4 });
  add({ id: 'koto', name: 'Koto', cat: 'strings', emoji: '🎎', desc: 'Japanese 13-string zither (Hirajoshi).', layout: 'scale', cfg: { skin: 'strings', start: 'D3', scale: [0, 2, 3, 7, 8], count: 13, minw: 40 }, voice: V.koto, ring: true, reverb: 0.3 });
  add({ id: 'violin', name: 'Violin', cat: 'strings', emoji: '🎻', desc: 'Bowed, with vibrato. Drag to slide between notes.', layout: 'frets', cfg: { tuning: ['G3', 'D4', 'A4', 'E5'], frets: 12, rows: true, skin: 'ebony' }, voice: V.violin, reverb: 0.3 });
  add({ id: 'cello', name: 'Cello', cat: 'strings', emoji: '🪕', desc: 'Rich, low bowed strings.', layout: 'frets', cfg: { tuning: ['C2', 'G2', 'D3', 'A3'], frets: 12, rows: true, skin: 'ebony' }, voice: V.cello, reverb: 0.3 });
  add({ id: 'string-ensemble', name: 'String Ensemble', cat: 'strings', emoji: '🎼', desc: 'Lush orchestral string section.', layout: 'keys', cfg: { skin: 'dark', start: 48, min: 36, max: 96 }, voice: V.strings, reverb: 0.4 });

  /* Winds & brass */
  add({ id: 'flute', name: 'Flute', cat: 'wind', emoji: '🪈', desc: 'Breathy concert flute.', layout: 'keys', cfg: { skin: 'wood', start: 60, min: 60, max: 96 }, voice: V.flute, reverb: 0.3 });
  add({ id: 'recorder', name: 'Recorder', cat: 'wind', emoji: '🎵', desc: 'Simple, pure schoolroom recorder.', layout: 'keys', cfg: { skin: 'wood', start: 72, min: 60, max: 100 }, voice: V.recorder, reverb: 0.25 });
  add({ id: 'ocarina', name: 'Ocarina', cat: 'wind', emoji: '🥚', desc: 'Soft, hollow ceramic flute.', layout: 'keys', cfg: { skin: 'wood', start: 60, min: 57, max: 89 }, voice: V.ocarina, reverb: 0.35 });
  add({ id: 'pan-flute', name: 'Pan Flute', cat: 'wind', emoji: '🌬️', desc: 'Breathy bundled pipes.', layout: 'scale', cfg: { skin: 'pipes', start: 'C5', scale: [0, 2, 4, 5, 7, 9, 11], count: 15, minw: 34 }, voice: V.panflute, hold: true, reverb: 0.35 });
  add({ id: 'clarinet', name: 'Clarinet', cat: 'wind', emoji: '🎶', desc: 'Dark, woody reed.', layout: 'keys', cfg: { skin: 'ebony', start: 48, min: 48, max: 91 }, voice: V.clarinet, reverb: 0.25 });
  add({ id: 'saxophone', name: 'Saxophone', cat: 'wind', emoji: '🎷', desc: 'Smoky alto sax.', layout: 'keys', cfg: { skin: 'brass', start: 48, min: 48, max: 90 }, voice: V.sax, reverb: 0.3 });
  add({ id: 'oboe', name: 'Oboe', cat: 'wind', emoji: '🦆', desc: 'Nasal double reed.', layout: 'keys', cfg: { skin: 'ebony', start: 60, min: 58, max: 93 }, voice: V.oboe, reverb: 0.3 });
  add({ id: 'trumpet', name: 'Trumpet', cat: 'wind', emoji: '🎺', desc: 'Bright, brassy fanfare.', layout: 'keys', cfg: { skin: 'brass', start: 48, min: 54, max: 84 }, voice: V.trumpet, reverb: 0.3 });
  add({ id: 'trombone', name: 'Trombone', cat: 'wind', emoji: '📯', desc: 'Big, bold slide brass.', layout: 'keys', cfg: { skin: 'brass', start: 36, min: 40, max: 74 }, voice: V.trombone, reverb: 0.3 });
  add({ id: 'french-horn', name: 'French Horn', cat: 'wind', emoji: '🐚', desc: 'Mellow, noble horn.', layout: 'keys', cfg: { skin: 'brass', start: 36, min: 34, max: 79 }, voice: V.horn, reverb: 0.4 });
  add({ id: 'harmonica', name: 'Harmonica', cat: 'wind', emoji: '🎤', desc: '10-hole blues harp. Top row blow, bottom row draw.', layout: 'pads', cfg: { arrange: 'grid', cols: 10, glide: true, harp: true,
    pads: ['C4', 'E4', 'G4', 'C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'].map((n, i) => ({ id: 'b' + i, note: n, label: n, sub: 'blow', hole: i + 1, keys: [ROWQ[i]], color: '#9aa4b4' }))
      .concat(['D4', 'G4', 'B4', 'D5', 'F5', 'A5', 'B5', 'D6', 'F6', 'A6'].map((n, i) => ({ id: 'd' + i, note: n, label: n, sub: 'draw', hole: i + 1, keys: [ROWA[i]], color: '#7b8596' }))) }, voice: V.harmonica, reverb: 0.2 });

  /* Electronic & voice */
  add({ id: 'synthesizer', name: 'Synthesizer', cat: 'elec', emoji: '🎚️', desc: 'Analog-style poly synth with filter.', layout: 'keys', cfg: { skin: 'synth', start: 36, min: 12, max: 108 }, voice: V.synth, reverb: 0.25,
    controls: [sel('wave', 'Wave', [['sawtooth', 'Saw'], ['square', 'Square'], ['triangle', 'Triangle'], ['sine', 'Sine']], 'sawtooth'), rng('cutoff', 'Cutoff', 200, 9000, 10, 2600), rng('res', 'Resonance', 0.5, 14, 0.1, 3), rng('attack', 'Attack', 0.005, 1.5, 0.005, 0.01), rng('release', 'Release', 0.05, 3, 0.05, 0.3), rng('detune', 'Detune', 0, 40, 1, 8), tog('sub', 'Sub oscillator', true)] });
  add({ id: 'choir', name: 'Choir', cat: 'elec', emoji: '😇', desc: 'Formant-synthesized vocal pad.', layout: 'keys', cfg: { skin: 'dark', start: 48, min: 36, max: 84 }, voice: V.choir, reverb: 0.5,
    controls: [sel('vowel', 'Vowel', [['a', 'Ah'], ['e', 'Eh'], ['i', 'Ee'], ['o', 'Oh'], ['u', 'Oo']], 'a')] });
  add({ id: 'theremin', name: 'Theremin', cat: 'elec', emoji: '👋', desc: 'Move to play: left/right = pitch, up/down = volume.', layout: 'theremin', cfg: { lo: 'C3', octaves: 3 }, voice: null, reverb: 0.35,
    controls: [sel('wave', 'Wave', [['sine', 'Sine'], ['triangle', 'Triangle'], ['sawtooth', 'Saw']], 'sine'), rng('vibrato', 'Vibrato', 0, 60, 1, 18), tog('snap', 'Snap to notes', false)] });
  add({ id: 'drum-machine', name: 'Drum Machine', cat: 'elec', emoji: '🤖', desc: '808-style pads with a 16-step sequencer.', layout: 'pads', cfg: { arrange: 'grid', cols: 4, pads: machinePads, seq: true }, voice: V.padVoice, ring: true, reverb: 0.15 });

  /* Drums & percussion */
  add({ id: 'drum-kit', name: 'Drum Kit', cat: 'perc', emoji: '🥁', desc: 'Full acoustic kit. Space = kick.', layout: 'pads', cfg: { arrange: 'free', w: 100, h: 62, pads: kit }, voice: V.padVoice, ring: true, reverb: 0.2 });
  add({ id: 'bongos', name: 'Bongos', cat: 'perc', emoji: '🪘', desc: 'High and low Latin bongos.', layout: 'pads', cfg: { arrange: 'free', w: 100, h: 64, pads: [
    { id: 'hi', label: 'Hi Open', keys: ['KeyF', 'KeyG'], snd: 'drum', f: 430, tau: 0.13, drop: 1.25, x: 30, y: 28, r: 17, color: '#d9a066' },
    { id: 'lo', label: 'Lo Open', keys: ['KeyJ', 'KeyH'], snd: 'drum', f: 310, tau: 0.15, drop: 1.25, x: 70, y: 28, r: 19, color: '#c98b52' },
    { id: 'hiS', label: 'Hi Slap', keys: ['KeyD'], snd: 'slap', f: 700, nf: 3600, x: 30, y: 55, r: 7.5, color: '#f2d7a8' },
    { id: 'loS', label: 'Lo Slap', keys: ['KeyK'], snd: 'slap', f: 500, nf: 2800, x: 70, y: 55, r: 7.5, color: '#f2d7a8' }] }, voice: V.padVoice, ring: true, reverb: 0.2 });
  add({ id: 'congas', name: 'Congas', cat: 'perc', emoji: '🪇', desc: 'Quinto, conga and tumba.', layout: 'pads', cfg: { arrange: 'free', w: 100, h: 64, pads: [
    { id: 'q', label: 'Quinto', keys: ['KeyA'], snd: 'drum', f: 420, tau: 0.17, drop: 1.2, x: 20, y: 29, r: 15, color: '#b3562f' },
    { id: 'c', label: 'Conga', keys: ['KeyS'], snd: 'drum', f: 320, tau: 0.2, drop: 1.2, x: 50, y: 29, r: 16, color: '#a24a28' },
    { id: 't', label: 'Tumba', keys: ['KeyD'], snd: 'drum', f: 240, tau: 0.24, drop: 1.2, x: 81, y: 29, r: 17, color: '#923f20' },
    { id: 'qS', label: 'Slap', keys: ['KeyZ'], snd: 'slap', f: 600, nf: 3200, x: 20, y: 55, r: 6.5, color: '#f2d7a8' },
    { id: 'cS', label: 'Slap', keys: ['KeyX'], snd: 'slap', f: 480, nf: 2800, x: 50, y: 55, r: 6.5, color: '#f2d7a8' },
    { id: 'tS', label: 'Slap', keys: ['KeyC'], snd: 'slap', f: 380, nf: 2400, x: 81, y: 55, r: 6.5, color: '#f2d7a8' }] }, voice: V.padVoice, ring: true, reverb: 0.2 });
  add({ id: 'djembe', name: 'Djembe', cat: 'perc', emoji: '🥁', desc: 'West African hand drum: bass, tone, slap.', layout: 'pads', cfg: { arrange: 'grid', cols: 3, pads: [
    { id: 'bass', label: 'Bass', keys: ['KeyA', 'KeyF'], snd: 'bassdrum', f: 80, tau: 0.32, color: '#8d5a34' },
    { id: 'tone', label: 'Tone', keys: ['KeyS', 'KeyG'], snd: 'drum', f: 190, tau: 0.14, drop: 1.3, color: '#b5793f' },
    { id: 'slap', label: 'Slap', keys: ['KeyD', 'KeyH'], snd: 'slap', f: 420, nf: 3500, color: '#e0b27a' }] }, voice: V.padVoice, ring: true, reverb: 0.2 });
  add({ id: 'tabla', name: 'Tabla', cat: 'perc', emoji: '🪘', desc: 'Dayan (top) and bayan (bottom) strokes.', layout: 'pads', cfg: { arrange: 'grid', cols: 4, pads: [
    { id: 'na', label: 'Na', keys: ['KeyQ'], snd: 'dayan', f: 300, tau: 0.16, color: '#d6a45a' },
    { id: 'tin', label: 'Tin', keys: ['KeyW'], snd: 'dayan', f: 300, tau: 0.6, parts: [[1, 1], [2, 0.5], [3, 0.3]], color: '#d6a45a' },
    { id: 'tun', label: 'Tun', keys: ['KeyE'], snd: 'dayan', f: 225, tau: 0.3, parts: [[1, 1], [1.5, 0.12]], color: '#d6a45a' },
    { id: 'te', label: 'Te', keys: ['KeyR'], snd: 'slap', f: 600, nf: 2300, color: '#d6a45a' },
    { id: 'ge', label: 'Ge', keys: ['KeyA'], snd: 'ge', f: 95, color: '#9b6a3a' },
    { id: 'ka', label: 'Ka', keys: ['KeyS'], snd: 'slap', f: 170, nf: 1400, color: '#9b6a3a' },
    { id: 'dha', label: 'Dha', keys: ['KeyD'], snd: 'dha', color: '#b77c43' },
    { id: 'dhin', label: 'Dhin', keys: ['KeyF'], snd: 'dhin', color: '#b77c43' }] }, voice: V.padVoice, ring: true, reverb: 0.25 });
  add({ id: 'cajon', name: 'Cajón', cat: 'perc', emoji: '📦', desc: 'Flamenco box drum.', layout: 'pads', cfg: { arrange: 'grid', cols: 3, pads: [
    { id: 'bass', label: 'Bass', keys: ['KeyA', 'KeyF', 'Space'], snd: 'bassdrum', f: 90, tau: 0.22, color: '#b78350' },
    { id: 'slap', label: 'Slap', keys: ['KeyS', 'KeyG'], snd: 'slap', f: 220, nf: 2200, color: '#d9b080' },
    { id: 'edge', label: 'Tap', keys: ['KeyD', 'KeyH'], snd: 'slap', f: 600, nf: 4500, color: '#ecd1a8' }] }, voice: V.padVoice, ring: true, reverb: 0.2 });
  add({ id: 'hand-percussion', name: 'Hand Percussion', cat: 'perc', emoji: '🪇', desc: 'Shaker, tambourine, cowbell and more.', layout: 'pads', cfg: { arrange: 'grid', cols: 4, pads: [
    ['Shaker', 'shaker', 'KeyQ'], ['Tambourine', 'tamb', 'KeyW'], ['Cowbell', 'cowbell', 'KeyE'], ['Triangle', 'triangle', 'KeyR'],
    ['Wood Block', 'wood', 'KeyA'], ['Claves', 'clave', 'KeyS'], ['Maracas', 'maracas', 'KeyD'], ['Finger Cymbals', 'fingercym', 'KeyF']].map((a, i) => ({ id: 'h' + i, label: a[0], snd: a[1], keys: [a[2]], color: i < 4 ? '#ffa45c' : '#ffcf6b' })) }, voice: V.padVoice, ring: true, reverb: 0.25 });
  add({ id: 'timpani', name: 'Timpani', cat: 'perc', emoji: '🔥', desc: 'Orchestral kettle drums.', layout: 'pads', cfg: { arrange: 'free', w: 100, h: 64, pads: [
    { id: 't0', note: 'D2', label: 'D2', keys: ['KeyA'], snd: 'timpani', x: 17, y: 32, r: 17, color: '#c2762f' },
    { id: 't1', note: 'F2', label: 'F2', keys: ['KeyS'], snd: 'timpani', x: 39, y: 32, r: 15, color: '#c2762f' },
    { id: 't2', note: 'A2', label: 'A2', keys: ['KeyD'], snd: 'timpani', x: 61, y: 32, r: 14, color: '#c2762f' },
    { id: 't3', note: 'D3', label: 'D3', keys: ['KeyF'], snd: 'timpani', x: 83, y: 32, r: 12, color: '#c2762f' }] }, voice: V.padVoice, ring: true, reverb: 0.45 });

  VMI.cats = CATS;
  VMI.instruments = I;
  VMI.byId = Object.fromEntries(I.map((x) => [x.id, x]));
  VMI.catById = Object.fromEntries(CATS.map((x) => [x.id, x]));
})();
