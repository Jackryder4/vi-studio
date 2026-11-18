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
      id: 'voicefx', icon: '🤖', title: 'Your voice: pitch, Auto-Tune, robot, reverb', mins: 3, desc: 'Record yourself, then pitch it up or down, Auto-Tune it, turn it into an electric robot voice and add reverb, all live.',
      steps: [
        { sel: '#qa-voice', title: '1. Record my voice', text: 'Click 🎤 Record my voice. After a 1-bar count-in, sing, rap, talk or beatbox. Press Space to stop.' },
        { sel: '#st-bottom', title: '2. Loop it', text: 'In the Voice FX panel press 🔁 Loop my recording. It keeps playing while you change things, so you hear every knob.', before: tab('play') },
        { sel: '#st-bottom', title: '3. Pitch & Auto-Tune', text: 'Pitch: −12 … +12 semitones (timing stays the same). Turn on Auto-Tune and push Strength to “Robotic” for the hard T-Pain sound. Not a singer? Auto-Tune snaps every note into the song’s key.' },
        { sel: '#st-bottom', title: '4. Electric voice + space', text: 'Pick 🤖 Robot, 🎛️ Talkbox or 👥 Choir of me to turn your voice into a synth that sings in key. Add Reverb (room / hall / cathedral) and Echo. 🎧 Hear myself live lets you sing through it all in real time (use headphones).' },
      ],
    },
    {
      id: 'mapper', icon: '🗣', title: 'Beatbox → a full song (Sound Mapper)', mins: 3, desc: 'Every different mouth sound becomes the drum or instrument you choose: kicks, snares, hats, a hummed bass line…',
      steps: [
        { sel: '#qa-beatbox', title: '1. Beatbox a loop', text: 'Click 🗣 Beatbox → beat, press ● Record and beatbox: kicks, snares, hats, clicks, and hum a melody too. Press Stop.' },
        { sel: '.modal', title: '2. Your sounds, grouped', text: 'The Sound Mapper finds each different sound and groups them (Sound A, B, C…). Press ▶ to hear a group.' },
        { sel: '.modal', title: '3. Choose what each becomes', text: 'Any drum, any instrument (turn on “Follow my pitch” to play the melody you hummed), or “🎹 My own sound as an instrument”, which you can then pitch up and down on any note.' },
        { sel: '.modal', title: '4. Build', text: 'Press 🎶 Build tracks from my sounds. You get real tracks that keep your exact rhythm, ready to edit, add FX to and mix.' },
      ],
    },
    {
      id: 'create', icon: '✨', title: 'Generate a full song', mins: 2, desc: 'Pick a genre and mood, get an arranged track, then make it yours.',
      steps: [
        { sel: '#btnGen', title: '1. Create', text: 'Click ✨ Create. Choose a genre (Hip-hop, Trap, Lo-fi, Afrobeat…), a mood, tempo, key and length, then Generate. Your current song is saved first.' },
        { sel: '#st-arr', title: '2. It’s all editable', text: 'You get real tracks: drums, bass, chords, lead and pad, arranged into intro, verse, chorus, bridge and outro. Double-click any clip to edit notes.' },
        { sel: '#st-arr', title: '3. Regenerate a part', text: 'Don’t like the melody? Open that track’s ⋯ menu → 🎲 Regenerate this part. Ctrl+Z goes back.' },
        { sel: '#add-audio', title: '4. Add your voice', text: 'Add an audio track and record your vocals or beatbox on top, then use FX and Auto-Tune to make it sit in the beat.' },
      ],
    },
    {
      id: 'fx', icon: '🎛️', title: 'FX rack: transform any sound', mins: 2, desc: 'Reverb, echo, distortion, robot, telephone, wobble, Auto-Tune… on any track.',
      steps: [
        { sel: '#tab-fx', title: '1. Open FX', text: 'Select a track, then the 🎛 FX tab. Every track has its own chain of insert effects, like a real mixer.', before: tab('fx') },
        { sel: '#st-bottom', title: '2. Start from a preset', text: '★ Presets gives you whole chains: Radio-ready vocal, Hard Auto-Tune, Robot voice, Telephone, Cathedral, Dubstep wobble, Lo-fi tape…' },
        { sel: '#st-bottom', title: '3. Tweak and stack', text: 'Move any knob while the song plays. Add more effects, reorder them with ◀ ▶, switch one off to compare. Everything is included when you export.' },
      ],
    },
    {
      id: 'soundlab', icon: '🔬', title: 'Sound Lab: turn any sound into an instrument', mins: 3, desc: 'Record a “beep”, pitch it, stretch it, add effects, then play it on the keyboard.',
      steps: [
        { sel: '#bt-library', title: '1. Record anything', text: 'My Library → ● Record sound. A beep, a hum, a clap, a bottle, anything.', before: click('#bt-library') },
        { sel: '#btnQuickRec', title: '2. Open Sound Lab', text: 'After recording press 🔬 Sound Lab (or the Sound Lab button on any sound). Drag on the wave to select a part; crop, fade, reverse, normalize.' },
        { sel: '#btnQuickRec', title: '3. Pitch & stretch', text: 'Pitch it up or down by semitones and cents: “Keep timing” keeps its length, “Tape” changes speed too, “Voice-safe” avoids the chipmunk sound. Speed changes length without changing pitch. 🎯 Tune snaps it to the nearest note.' },
        { sel: '#btnQuickRec', title: '4. Make it an instrument', text: '🎹 Make playable instrument: the app detects the sound’s note, so your beep plays in tune on every key. Shape it with Attack, Release, Fine tune and Loop.' },
      ],
    },
    {
      id: 'bblive', icon: '🎤', title: 'Live beatbox → drums', mins: 3, desc: 'Beatbox into the mic and hear real drums instantly, then record them.',
      steps: [
        { sel: '#st-arr', title: '1. Pick a drum track', text: 'Select a Drum Kit or Drum Machine track (add one from Sounds if needed).' },
        { sel: '#st-bottom', title: '2. Teach your sounds (once)', text: 'Click 🧠 Teach my sounds. For Kick, Snare, Hi-hat (and more), press ● Teach and make that sound 4–6 times. Now the app knows YOUR voice.', before: tab('play') },
        { sel: '#st-bottom', title: '3. Go live', text: 'Click 🎤 Beatbox → drums and beatbox: each sound plays a real drum instantly. Wear headphones.' },
        { sel: '#btnRec', title: '4. Record it', text: 'Press ● Record while live: your beatbox becomes drum notes on the track, snapped to the grid, fully editable.' },
      ],
    },
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
    ['Z … /  then  Q … ]', 'Play the selected instrument (3 octaves, low → high)'], ['↑ / ↓', 'Octave up / down (keyboards)'], ['Right-click', 'Delete a note in the editor'], ['✨ Create', 'Generate a full song'], ['🎛 FX tab', 'Effects chain for the selected track'],
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
