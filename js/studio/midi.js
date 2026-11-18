/* midi.js — play any instrument from a USB/Bluetooth MIDI keyboard (Web MIDI: Chrome, Edge, Opera, Android Chrome) */
(function () {
  'use strict';
  const VMI = window.VMI, A = VMI.audio;
  const M = (VMI.midi = { access: null, inputs: [], on: false, supported: !!navigator.requestMIDIAccess });
  const held = new Map(); // midi note -> { target, h, id }

  // General MIDI drum map → pad ids used by our kits (first match wins)
  const GM = {
    35: ['kick'], 36: ['kick'], 37: ['rim', 'snare'], 38: ['snare'], 39: ['clap', 'snare'], 40: ['snare'],
    41: ['floor', 'tomL'], 43: ['floor', 'tomL'], 45: ['tom2', 'tomL'], 47: ['tom2', 'tomH'], 48: ['tom1', 'tomH'], 50: ['tom1', 'tomH'],
    42: ['hatC'], 44: ['hatC'], 46: ['hatO'], 49: ['crash'], 57: ['crash'], 51: ['ride', 'crash'], 59: ['ride'], 53: ['ride'],
    56: ['cow'], 75: ['clave'], 76: ['wood'], 62: ['cHi'], 63: ['cHi'], 64: ['cLo'], 69: ['shk'], 70: ['shk'], 54: ['tamb'],
  };
  /** turn a MIDI note into a spec for this instrument (pads need mapping) */
  M.spec = (inst, note) => {
    if (inst.layout !== 'pads') return { midi: note };
    const pads = inst.cfg.pads;
    const tuned = pads.filter((p) => p.note);
    if (tuned.length) { // handpan, steel drum, timpani…: nearest tuned pad
      let best = tuned[0], bd = 1e9;
      tuned.forEach((p) => { const d = Math.abs(A.n2m(p.note) - note); if (d < bd) { bd = d; best = p; } });
      return { pad: best, midi: A.n2m(best.note), choke: best.choke };
    }
    const ids = GM[note] || [];
    let pad = null;
    for (const id of ids) { pad = pads.find((p) => p.id === id); if (pad) break; }
    if (!pad) pad = pads[(((note - 36) % pads.length) + pads.length) % pads.length];
    return { pad, choke: pad.choke };
  };

  /* where notes go: the studio (selected track) or the full-screen instrument page */
  function target() {
    const U = VMI.sui, app = VMI.app;
    if (U && U.open) {
      const t = VMI.st.track(VMI.st.selTrack), inst = t && VMI.byId[t.inst];
      if (!inst || !inst.voice) return null;
      return { inst, start: (s, v) => U.sapp.start(inst, s, v), stop: (h) => U.sapp.stop(inst, h), layout: U.layout, pedal: (on) => U.setPedal(on) };
    }
    if (app && app.inst && app.layout && app.inst.voice) {
      const inst = app.inst;
      return { inst, start: (s, v) => app.start(inst, s, v), stop: (h) => app.stop(inst, h), layout: app.layout, pedal: (on) => app.setPedal(on) };
    }
    return null;
  }
  const elFor = (layout, spec) => {
    if (!layout || !layout.els) return null;
    if (spec.pad) return layout.els.get(spec.pad.id);
    return layout.els.get(String(spec.midi)) || null;
  };
  function noteOn(note, vel) {
    noteOff(note);
    const tg = target(); if (!tg) return;
    A.resume();
    const spec = M.spec(tg.inst, note);
    const h = tg.start(spec, Math.max(0.15, vel / 127));
    const el = elFor(tg.layout, spec); if (el) el.classList.add('on');
    held.set(note, { tg, h, el });
    M.flash();
  }
  function noteOff(note) {
    const o = held.get(note); if (!o) return;
    held.delete(note);
    if (o.h) o.tg.stop(o.h);
    if (o.el) setTimeout(() => o.el.classList.remove('on'), o.tg.inst.ring ? 120 : 0);
  }
  function cc(n, v) {
    const tg = target();
    if (n === 64) { if (tg) tg.pedal(v >= 64); return; }
    const U = VMI.sui, ST = VMI.st;
    if (U && U.open) { // knobs control the selected track
      const t = ST.track(ST.selTrack); if (!t) return;
      if (n === 7) t.vol = v / 127; else if (n === 10) t.pan = (v - 64) / 64; else if (n === 91) t.rev = v / 127; else if (n === 93) t.dly = v / 127; else if (n === 1) t.drive = v / 127; else return;
      ST.sync(); ST.autosave();
    } else if (n === 7) A.setVolume(v / 127);
  }
  function onMessage(e) {
    const [st, d1, d2] = e.data, type = st & 0xf0;
    if (type === 0x90 && d2 > 0) noteOn(d1, d2);
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) noteOff(d1);
    else if (type === 0xb0) cc(d1, d2);
  }
  function wire() {
    M.inputs = [];
    M.access.inputs.forEach((inp) => { inp.onmidimessage = onMessage; M.inputs.push(inp.name || 'MIDI device'); });
    M.update();
  }
  M.enable = async (quiet) => {
    if (!M.supported) { if (!quiet) toast('This browser has no MIDI support. Use Chrome or Edge on a computer or Android.', 'warn'); return false; }
    try {
      M.access = M.access || await navigator.requestMIDIAccess({ sysex: false });
      M.access.onstatechange = wire; wire(); M.on = true;
      try { localStorage.setItem('vmi.midi', '1'); } catch (e) { /* ignore */ }
      if (!quiet) toast(M.inputs.length ? '🎹 MIDI connected: ' + M.inputs.join(', ') : 'MIDI is on — plug in a keyboard and it connects automatically');
      return true;
    } catch (e) { if (!quiet) toast('MIDI permission was blocked', 'warn'); return false; }
  };
  function toast(msg, kind) { VMI.sui.toast(msg, kind); }
  M.flash = () => { document.querySelectorAll('.midi-btn').forEach((b) => { b.classList.add('hit'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('hit'), 120); }); };
  M.update = () => {
    document.querySelectorAll('.midi-btn').forEach((b) => {
      b.classList.toggle('active', M.on && M.inputs.length > 0);
      b.title = !M.supported ? 'MIDI keyboards work in Chrome or Edge' : M.on ? (M.inputs.length ? 'MIDI: ' + M.inputs.join(', ') : 'MIDI on — no keyboard plugged in') : 'Connect a MIDI keyboard';
    });
  };
  M.button = (cls) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn midi-btn ' + (cls || ''); b.innerHTML = '🎹 <span>MIDI</span>';
    b.addEventListener('click', () => M.enable(false));
    setTimeout(M.update, 0);
    return b;
  };
  // reconnect silently if the user allowed MIDI before
  try { if (M.supported && localStorage.getItem('vmi.midi') === '1') setTimeout(() => M.enable(true), 800); } catch (e) { /* ignore */ }
  M._test = { noteOn, noteOff, cc };
})();
