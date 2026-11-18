# WACK MUZIC: make it loud

An underground music production studio for the browser, Windows and phones. You can record your voice or beatbox and turn it into drums and instruments, pitch any sound into a playable instrument, Auto-Tune it, stack studio effects, generate full songs from a genre and mood, then mix and export.

**Live:** https://jackryder4.github.io/vi-studio/ · **Windows app:** [Releases](https://github.com/Jackryder4/vi-studio/releases)

## What it does
**Make music**
- **54 instruments:** pianos, guitars, drums, winds, bells, synth, vocoder and more. Play them with the mouse, touch, computer keyboard or a MIDI keyboard.
- **Multitrack studio:** an arrangement timeline, piano roll and drum step grid, a mixer, undo/redo, and autosave.
- **✨ Song generator:** choose from 10 genres (Hip-hop, Trap, Lo-fi, Pop, House/EDM, Afrobeat, R&B, Reggaeton, Rock, Cinematic), 7 moods, and a key, tempo and length. It writes a full arranged song as editable tracks: intro, verses, choruses, bridge and outro, with drums, bass, chords, melody and pads plus risers. Any part can be regenerated on its own.
- **Loops tab:** 40 royalty-free loops, hits, vocal chops and FX, rendered at the song's tempo.

**Your voice, your sounds**
- **Recording:** record your voice or beatbox with a count-in and metronome.
- **🔬 Sound Lab:** an editor for any recorded sound.
  - Select, crop, cut, fade, reverse and normalize.
  - Pitch up or down by semitones and cents. "Keep timing" keeps the length, "Tape" changes speed too, and "Voice-safe" avoids the chipmunk sound.
  - Time-stretch without changing pitch, and burn in effects.
  - Detect the sound's note and tune it.
  - **Make a playable instrument:** your "beep" plays in tune on every key, with attack, release, fine tune and loop.
- **🎤 Live beatbox to drums:** beatbox into the mic and every sound plays and records as a real kick, snare, hat, clap or percussion hit. **🧠 Teach my sounds** learns your own voice.
- **🥁 Beatbox Lab:** turns a recorded beatbox into a drum track or a drum kit made from your voice.
- **🎤 Voice Lab:** Auto-Tune with a pitch graph, harmonies, robot, deep and chipmunk voices, a vocoder, and melody-to-instrument.
- **Live Auto-Tune:** hear yourself tuned in real time while you record.

**Mix and export**
- **🎛 FX rack** (FL-style inserts) on every track:
  - **Effects:** reverb, delay, chorus, flanger, phaser, distortion, bitcrusher, filter/wobble, tremolo/auto-pan, robot, compressor, parametric EQ and Auto-Tune.
  - **16 one-click presets:** Radio-ready vocal, Hard Auto-Tune, Telephone, Robot, Monster, Underwater, Cathedral, Lo-fi tape, Dubstep wobble and more.
- **Mixer:** volume, pan, EQ, drive, compressor, reverb and echo sends, and a master limiter.
- **Export:** WAV, MP3 (192 or 320 kbps), and stems (one WAV per track plus the full mix, in a ZIP).

**Learn**
- Interactive lessons that highlight each button.
- Written guides and keyboard shortcuts on the Learn page.

## Run the website locally
```
python -m http.server 8123
```
Then open http://localhost:8123. The microphone needs `https://` or `localhost`.

## Windows app (`desktop/`)
```
cd desktop
npm install
npm run dist
```
- **Approve Electron's download step:** if npm 11+ blocks install scripts, run `npm approve-scripts electron`, then `node node_modules/electron/install.js`.
- **Output** goes to `desktop/dist/`:
  - `WACK-MUZIC-Setup-<version>.exe`: the installer, with automatic updates.
  - `WACK-MUZIC-Portable-<version>.exe`: runs without installing.
  - `latest.yml` and the `.blockmap` file: needed for automatic updates.
- **Other commands:**
  - `npm start` runs the app without building an installer.
  - `npm run selftest` checks audio, effects, Auto-Tune, mic and MIDI access, saving, song generation and export. It uses its own temporary profile.
- **Upgrading from 1.0:** the app keeps your projects and recordings from "Virtual Instruments Studio" 1.0.

### Publishing an update (so installed apps update themselves)
1. Bump `"version"` in `desktop/package.json` (for example 2.0.1), then run `npm run dist`.
2. On GitHub, create a release whose tag matches the version (for example `v2.0.1`).
3. Attach these three files from `desktop/dist/`:
   - `WACK-MUZIC-Setup-<version>.exe`
   - `WACK-MUZIC-Setup-<version>.exe.blockmap`
   - `latest.yml`

   The portable `.exe` is optional.
4. Publish the release. Installed copies find it within a minute of starting, download it, and offer **Restart now**.

## Updating the website
Bump the `?v=` numbers in `index.html` and the cache name in `sw.js`, then commit and push. GitHub Pages republishes in about a minute.

## Brand
`brand/` contains:
- the logo (`logo-mark.svg`, `logo-horizontal.svg`)
- a brand board, key art and store graphics in `brand/out/`
- AI-generation prompts in `BRAND-PROMPTS.md`

`brand/render.js` re-renders all the PNGs (`npx electron ../brand/render.js` from `desktop/`).

## Files
- `js/audio.js`, `js/voices.js`, `js/instruments.js`, `js/ui.js`, `js/app.js`: the sound engine, instruments, layouts, pages and routing.
- `js/studio/`:
  - `engine.js`: transport, recording, export.
  - `graph.js`: the mixer.
  - `fx.js`, `fxui.js`: the FX rack.
  - `soundlab.js`: the Sound Lab.
  - `gen.js`: the song generator.
  - `beatbox.js`: live beatbox and the classifier.
  - `pitch.js`, `voice.js`: Auto-Tune and Voice Lab.
  - `worklets.js`: live Auto-Tune and the hit detector.
  - `midi.js`: MIDI input.
  - `export.js`: MP3 and stem export.
  - `loops.js`: the loop library.
  - `studio-ui.js`, `studio-edit.js`: the studio interface and editors.
  - `lessons.js`: the tutorials.
  - `store.js`: saving.
- `css/base.css`, `css/style.css`, `css/studio.css`: the design.
- `desktop/`: the Windows app.
- `brand/`: identity files.
