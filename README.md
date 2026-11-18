# Virtual Instruments Studio

A music studio and 53 playable instruments that run in the browser. Every instrument sound is synthesized with the Web Audio API, so there are no sample files and no libraries.

## Run it
```
python -m http.server 8123
```
Then open http://localhost:8123.

Opening `index.html` directly works for playing, but browsers only allow the **microphone** on `https://` pages or on `http://localhost`. To use it on a phone, host the folder on any static host (GitHub Pages, Netlify and similar) and open the https URL.

## Install as an app
The site is an installable web app (PWA). On a phone, open it over https and choose “Add to Home Screen”. On desktop Chrome or Edge, click “Install app” on the home page. It then opens full-screen and works offline. The same code can later be wrapped for the App Store and Google Play (for example with Capacitor).

## Pages
- **Home** (`#/`): the instrument gallery and links to everything else.
- **Studio** (`#/studio`): the multitrack music studio.
- **Learn** (`#/learn`): written guides, keyboard shortcuts and tips. Every guide also has an interactive version that highlights the buttons to press.
- **Instrument pages** (`#/<id>`, for example `#/grand-piano`): one instrument full-screen.

## Studio features
- Arrangement timeline: drag clips to move them, drag the right edge to resize, double-click a lane to make a clip. Dragging the lower half of the ruler sets the loop.
- Piano roll for melodic tracks and a step grid for drum tracks: velocity, quantize, ×2 loop, octave shift, split and duplicate.
- Recording what you play on any instrument, with count-in, metronome and snap. Recording your microphone onto audio tracks.
- Mixer with volume, pan, 3-band EQ, drive, compressor, reverb and echo on every track. The master has a limiter, four reverb types and tempo-synced echo.
- **Beatbox Lab**: detects each hit in a recording and labels it kick, snare, hi-hat or percussion. It can turn the recording into a real drum track, or into your own drum kit made from your voice.
- **Make instrument**: plays any recording at any pitch from a keyboard.
- **Vocal chain** on audio tracks: hear yourself, **live Auto-Tune** (key, scale, retune speed from natural to hard “T-Pain” snap, robot mode), a live pitch tuner, and optional Auto-Tune of every new take.
- **Voice Lab** for recorded vocals: Auto-Tune with a before/after pitch graph, harmonies (3rd, 3rd+5th, octave double), robot, deep and chipmunk voices, an offline vocoder that sings another track's notes, and **melody → instrument** (sing or hum a tune and it becomes editable notes on any instrument). Every change keeps the original take so you can revert.
- **Vocoder instrument**: talk or sing into the mic while playing keys.
- **My Library**: your recordings, imported audio and custom instruments, stored in the browser's IndexedDB.
- Ready-made patterns (drum beats, bass lines, chord progressions, melodies) and project templates.
- Undo/redo, autosave, named saves, and WAV export of the whole song or only the loop.

## Files
- `js/audio.js`, `js/voices.js`: the audio engine and all instrument synthesis.
- `js/instruments.js`: the instrument catalog.
- `js/ui.js`: instrument layouts (keys, strings, frets, pads, theremin), used by both the instrument pages and the studio.
- `js/app.js`: routing, home page, Learn page and the single-instrument player.
- `js/studio/store.js`: saving to IndexedDB.
- `js/studio/graph.js`: the mixer graph (channel strips and master), used for both live playback and export.
- `js/studio/engine.js`: project model, transport and scheduler, recording, beatbox analysis and WAV export.
- `js/studio/studio-ui.js`: studio layout, browser, arrangement, Play panel and mixer.
- `js/studio/studio-edit.js`: piano roll and step editor, audio editor, Beatbox Lab, recorder and sampler maker.
- `js/studio/lessons.js`: tutorial content and the guided-tour overlay.
- `js/studio/pitch.js`: pitch detection (YIN), Auto-Tune, PSOLA pitch shifting, harmonizer, melody extraction, key detection.
- `js/studio/worklets.js`: live Auto-Tune on the audio thread.
- `js/studio/voice.js`: vocal chain panel, Voice Lab, vocoder.
- `manifest.webmanifest`, `sw.js`, `icons/`: installable app and offline support.
- `css/base.css`, `css/style.css`, `css/studio.css`: design system and home page, instrument skins, studio.

When you change any JS or CSS file, bump the `?v=` number in `index.html` so browsers load the new version.
