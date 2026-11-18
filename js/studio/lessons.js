/* lessons.js — interactive guided tours + the content of the Learn page */
(function () {
  'use strict';
  const VMI = window.VMI;
  const TOUR = (VMI.tour = {});
  const S = () => VMI.sui;
  const click = (sel) => () => { const e = document.querySelector(sel); if (e) e.click(); };
  const tab = (t) => () => S().setTab(t);

  TOUR.lessons = [
    {
      id: 'tour', icon: '🧭', title: 'Studio tour', mins: 2, desc: 'Find your way around: transport, sounds, tracks, editor and mixer.',
      steps: [
        { sel: '#tr-transport', title: 'Transport', text: 'Play / pause (Space), stop, record (red dot) and loop. Everything you build plays from here.' },
        { sel: '#lcd', title: 'Position', text: 'Shows the bar and beat of the playhead, and the time. During a count-in it counts down.' },
        { sel: '.bpmbox', title: 'Tempo', text: 'Beats per minute. Hip-hop is often 85–95, pop 100–120, house 120–128.' },
        { sel: '#st-browser', title: 'Sounds, library & patterns', text: 'Pick any of the 50+ instruments to add a track. “My Library” holds your recordings; “Patterns” has ready-made beats, bass lines and chords.', before: click('#bt-sounds') },
        { sel: '#st-arr', title: 'Tracks & timeline', text: 'Each row is a track. Coloured blocks are clips. Drag clips to move them, drag the right edge to resize, double-click an empty spot to create one. Click the ruler to move the playhead; drag the lower half of the ruler to set a loop.' },
        { sel: '#tab-play', title: 'Play panel', text: 'The selected track’s instrument appears here. Play it with your mouse, fingers, or computer keyboard (the letters on the keys).', before: tab('play') },
        { sel: '#tab-editor', title: 'Editor', text: 'Edit notes in a piano roll (or a drum step grid), or edit recorded audio and open Beatbox Lab.', before: tab('editor') },
        { sel: '#tab-mixer', title: 'Mixer', text: 'A channel strip per track: volume, pan, 3-band EQ, drive, compressor, reverb and echo. The master has the reverb type and echo timing.', before: tab('mixer') },
        { sel: '#btnFile', title: 'Save & export', text: 'Your project autosaves in this browser. Use File to save named versions, open old ones, or export a WAV you can share.', before: tab('play') },
        { sel: '#btnHelp', title: 'Lessons any time', text: 'Open this menu again for step-by-step lessons: your first beat, recording, beatbox-to-drums and mixing.' },
      ],
    },
    {
      id: 'beat', icon: '🥁', title: 'Make your first beat', mins: 3, desc: 'Add a drum kit, draw a pattern in the step grid and loop it.',
      steps: [
        { sel: '#st-browser', title: '1. Add a drum kit', text: 'In Sounds, click “Drum Kit” (or “Drum Machine”). A new track appears and becomes selected.', before: click('#bt-sounds') },
        { sel: '#st-arr', title: '2. Create a clip', text: 'Double-click an empty spot on the drum track’s lane. A 2-bar clip appears and the Editor opens.' },
        { sel: '#st-bottom', title: '3. Draw the beat', text: 'Each row is a drum, each column a 1/16 step. Click to add hits: kick on 1 and 3, snare on 2 and 4, hi-hats on every other step. Right-click removes.', before: tab('editor') },
        { sel: '#tr-transport', title: '4. Loop it', text: 'Turn on Loop (⟲) and press Play. Change notes while it plays — you hear edits instantly.' },
        { sel: '#bt-patterns', title: 'Shortcut: patterns', text: 'In a hurry? The Patterns tab inserts a complete rock, hip-hop, house, trap or dembow beat on the selected track.', before: click('#bt-patterns') },
      ],
    },
    {
      id: 'record', icon: '🎹', title: 'Play & record an instrument', mins: 3, desc: 'Record what you play on the keyboard straight into a track.',
      steps: [
        { sel: '#st-browser', title: '1. Choose a sound', text: 'Add an instrument, e.g. Grand Piano or Synthesizer.', before: click('#bt-sounds') },
        { sel: '#st-bottom', title: '2. Try it out', text: 'On a computer the keys run low to high in one line: Z X C V B N M , . / then Q W E R T Y U I O P [ ] (3 octaves). Black keys are the keys just above (S D G H J L ; and 2 3 4 6 7 9 0 -). ↑/↓ change octave. On a phone, just tap.', before: tab('play') },
        { sel: '#btnCount', title: '3. Count-in & metronome', text: 'Count-in gives you one bar of clicks before recording starts. Turn on Metro to hear the beat while you play.' },
        { sel: '#quantSel', title: '4. Snap', text: 'Snap tidies the timing of recorded notes (1/16 is a good default). Choose Off to keep your exact feel.' },
        { sel: '#btnRec', title: '5. Record', text: 'Press the red record button (the track with the red ● is armed). Play, then press Space or Stop. Your notes become a clip you can edit in the Editor.' },
      ],
    },
    {
      id: 'voice', icon: '🎤', title: 'Record your voice', mins: 3, desc: 'Sing or rap over your beat with reverb and compression.',
      steps: [
        { sel: '#add-audio', title: '1. Add an audio track', text: 'Click “+ Audio / voice track”. Audio tracks record your microphone.' },
        { sel: '#btnRec', title: '2. Record', text: 'Wear headphones so the beat doesn’t leak into the mic. Press record, allow the microphone, wait for the count-in and perform. Press Space to stop.' },
        { sel: '#tab-mixer', title: '3. Make it sound produced', text: 'In the Mixer, turn on C (compressor) on the voice track, add some Reverb, a little Echo, and cut Low EQ to remove rumble.', before: tab('mixer') },
        { sel: '#st-arr', title: '4. Clean up', text: 'Drag the take to line it up, drag its right edge to trim, or use Split in the Editor to cut out mistakes.', before: tab('play') },
      ],
    },
    {
      id: 'autotune', icon: '🎚️', title: 'Auto-Tune & voice effects', mins: 4, desc: 'Live Auto-Tune, the hard “T-Pain” effect, harmonies, robot voice, vocoder and singing a melody into any instrument.',
      steps: [
        { sel: '#add-audio', title: '1. A vocal track', text: 'Add an audio / voice track (or select one). Its Play panel turns into a vocal chain.' },
        { sel: '#st-bottom', title: '2. Live Auto-Tune', text: 'Put on headphones, switch on “Hear yourself” and “Live Auto-Tune”. Pick the song’s key and scale. Retune speed 0 ms = robotic snap; 40–80 ms = natural. The tuner shows your pitch live.', before: tab('play') },
        { sel: '#btnRec', title: '3. Record', text: 'Record as usual. Your raw take is kept; turn on “Auto-Tune takes” to correct every new take automatically with the same settings.' },
        { sel: '#tab-editor', title: '4. Voice Lab', text: 'Select a vocal clip and open the Editor → “🎤 Voice Lab”. Auto-Tune shows your pitch line before (grey) and after (amber). Voice FX adds harmonies, robot, deep or chipmunk voices.', before: tab('editor') },
        { sel: '#tab-editor', title: '5. Vocoder & melody', text: 'Vocoder makes your words sing the chords of another track. “Melody → instrument” turns a sung or hummed tune into notes for piano, sax, synth… Every change can be reverted with “↺ Original”.' },
      ],
    },
    {
      id: 'beatbox', icon: '🗣️', title: 'Beatbox → drums', mins: 4, desc: 'Turn your mouth sounds into a real drum track or your own kit.',
      steps: [
        { sel: '#bt-library', title: '1. Open My Library', text: 'Your recordings live here and are kept in this browser.', before: click('#bt-library') },
        { sel: '#btnQuickRec', title: '2. Record a beatbox', text: 'Click “Record sound” and beatbox a simple loop: “boots – cats – boots – cats”. Keep the hits short and separated.' },
        { sel: '#btnQuickRec', title: '3. Beatbox Lab', text: 'After recording, press “Beatbox Lab” (or use the 🥁 button on any sound). It finds each hit and labels it kick, snare or hi-hat — fix any wrong guesses.' },
        { sel: '#st-arr', title: '4. Convert', text: '“Create drum track” places real drums exactly where you beatboxed. “Create my kit” turns your voice hits into pads you can play and sequence.' },
        { sel: '#st-browser', title: '5. Make it musical', text: 'Hum or whistle a note, then “Make instrument” turns it into a keyboard you can play melodies with.' },
      ],
    },
    {
      id: 'mix', icon: '🎚️', title: 'Mix & export', mins: 2, desc: 'Balance your tracks and export a WAV to share.',
      steps: [
        { sel: '#tab-mixer', title: '1. Balance', text: 'Start with every fader low, bring up the drums, then bass, then everything else. Use Solo (S) to focus on one track and Mute (M) to compare.', before: tab('mixer') },
        { sel: '#st-bottom', title: '2. Space & tone', text: 'Pan instruments slightly left/right. Add Reverb to pads and voice, keep kick and bass dry. Use Drive to make a sound grittier and louder.' },
        { sel: '#btnFile', title: '3. Export', text: 'File → Export mixdown renders the whole song to a WAV file. Export loop range renders only the looped section.', before: tab('play') },
      ],
    },
  ];
  TOUR.shortcuts = [
    ['Space', 'Play / pause'], ['Home', 'Go to start'], ['Esc', 'Stop recording / leave studio'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
    ['Ctrl+D', 'Duplicate selected clip'], ['Delete', 'Delete selected note or clip'], ['Ctrl+S', 'Save project'],
    ['Z … /  then  Q … ]', 'Play the selected instrument (3 octaves, low → high)'], ['↑ / ↓', 'Octave up / down (keyboards)'], ['Right-click', 'Delete a note in the editor'],
  ];

  /* ---------- overlay ---------- */
  let st = null;
  TOUR.stop = () => { if (!st) return; st.el.remove(); removeEventListener('resize', st.place); st = null; };
  TOUR.start = (id) => {
    const L = TOUR.lessons.find((l) => l.id === id); if (!L) return;
    if (!S() || !S().open) { location.hash = '#/studio'; setTimeout(() => TOUR.start(id), 700); return; }
    TOUR.stop();
    const hole = document.createElement('div'); hole.className = 'tour-hole';
    const card = document.createElement('div'); card.className = 'tour-card';
    const el = document.createElement('div'); el.className = 'tour'; el.append(hole, card);
    document.body.append(el);
    st = { L, i: 0, el, hole, card };
    const place = () => {
      if (!st) return;
      const step = st.L.steps[st.i], t = document.querySelector(step.sel);
      const r = t ? t.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0, right: innerWidth / 2, bottom: innerHeight / 2 };
      const pad = 6;
      Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      const cw = Math.min(340, innerWidth - 24); card.style.width = cw + 'px';
      const ch = card.offsetHeight;
      let top = r.bottom + 12; if (top + ch > innerHeight - 8) top = r.top - ch - 12; if (top < 8) top = Math.max(8, Math.min(innerHeight - ch - 8, r.top + 12));
      card.style.top = top + 'px'; card.style.left = Math.max(12, Math.min(innerWidth - cw - 12, r.left)) + 'px';
    };
    st.place = place; addEventListener('resize', place);
    const show = () => {
      const step = st.L.steps[st.i];
      if (step.before) { try { step.before(); } catch (e) { /* ignore */ } }
      card.innerHTML = '';
      const n = st.L.steps.length;
      const h = VMI.sui.h;
      card.append(
        h('div', { class: 'tc-k' }, st.L.icon + ' ' + st.L.title + ' · ' + (st.i + 1) + '/' + n),
        h('b', null, step.title), h('p', null, step.text),
        h('div', { class: 'tc-btns' },
          h('button', { class: 'btn xs', onclick: TOUR.stop }, 'Close'),
          h('span', { style: 'flex:1' }),
          st.i > 0 ? h('button', { class: 'btn xs', onclick: () => { st.i--; show(); } }, 'Back') : null,
          h('button', { class: 'btn xs accent', onclick: () => { if (st.i < n - 1) { st.i++; show(); } else { TOUR.stop(); VMI.sui.toast('Lesson complete — nice work!'); } } }, st.i < n - 1 ? 'Next' : 'Done')));
      requestAnimationFrame(place); setTimeout(place, 120);
    };
    show();
  };
  TOUR.menu = (welcome) => {
    const h = VMI.sui.h;
    const m = VMI.sui.modal(welcome ? 'Welcome to the Studio 👋' : 'Lessons', h('div', { class: 'lessons' },
      welcome ? h('p', { class: 'muted' }, 'A starter beat is loaded so you can press Play right away. Pick a short lesson — each one highlights the buttons to press.') : null,
      TOUR.lessons.map((l) => h('button', { class: 'lesson', onclick: () => { m.close(); TOUR.start(l.id); } }, h('span', { class: 'li-i' }, l.icon), h('span', { class: 'li-t' }, h('b', null, l.title), h('span', null, l.desc)), h('small', null, l.mins + ' min'))),
      h('a', { class: 'btn sm', href: '#/learn', onclick: () => m.close() }, '📖 Read all guides & shortcuts')));
  };
})();
