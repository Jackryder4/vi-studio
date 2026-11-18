/* voicefx.js — the Voice FX panel shown for every recorded (audio) track.
   Pitch, Auto-Tune, Voice synth (robot/talkbox/choir…), reverb and echo — all live, all non-destructive. */
(function () {
  'use strict';
  const VMI = window.VMI, A = VMI.audio, ST = VMI.st, P = VMI.pitch, FX = VMI.FX;
  const VO = VMI.voice;
  const h = (...a) => VMI.sui.h(...a);
  const clamp = ST.clamp;

  const DEF = { pitch: 0, fine: 0, tune: false, key: 'auto', scale: 'auto', strength: 0.75, synth: 'off', soct: 0, reverb: 0.25, size: 'hall', echo: 0, etime: '1/8d' };
  const SIZES = { room: [0.9, 0.55], hall: [2.4, 0.5], cathedral: [5.5, 0.45] };
  const SYNTHS = {
    off: { label: 'Natural', icon: '🎙️', chain: () => [] },
    robot: { label: 'Robot', icon: '🤖', chain: (k) => [['synthvoice', { key: k.key, scale: k.scale, chord: 'mono', wave: 'saw', mix: 0.88 }], ['robot', { freq: 60, mix: 0.22 }]] },
    talkbox: { label: 'Talkbox', icon: '🎛️', chain: (k) => [['synthvoice', { key: k.key, scale: k.scale, chord: 'octave', wave: 'square', glide: 40, mix: 1 }], ['chorus', { rate: 0.5, depth: 0.4, mix: 0.3 }]] },
    choir: { label: 'Choir of me', icon: '👥', chain: (k) => [['synthvoice', { key: k.key, scale: k.scale, chord: k.scale === 'major' ? 'triad' : 'minor', mix: 0.75 }], ['chorus', { rate: 0.6, depth: 0.6, mix: 0.5 }]] },
    alien: { label: 'Alien', icon: '👽', chain: () => [['robot', { freq: 190, mix: 0.6 }], ['flanger', { rate: 0.4, depth: 0.8, fb: 0.6, mix: 0.5 }]] },
    monster: { label: 'Monster', icon: '👹', pitch: -7, chain: () => [['distortion', { drive: 7, tone: 2400, out: 0.55 }], ['robot', { freq: 32, mix: 0.3 }]] },
    chipmunk: { label: 'Chipmunk', icon: '🐭', pitch: 7, chain: () => [] },
    telephone: { label: 'Telephone', icon: '☎️', chain: () => [['filter', { kind: 'bandpass', freq: 1600, res: 1.2 }], ['distortion', { drive: 3, tone: 3500, out: 0.8 }]] },
    megaphone: { label: 'Megaphone', icon: '📣', chain: () => [['filter', { kind: 'bandpass', freq: 1800, res: 2 }], ['distortion', { drive: 12, tone: 4000, out: 0.45 }]] },
    radio: { label: 'Old radio', icon: '📻', chain: () => [['filter', { kind: 'bandpass', freq: 1200, res: 0.8 }], ['crusher', { bits: 7, tone: 4500 }]] },
    underwater: { label: 'Underwater', icon: '🌊', chain: () => [['filter', { kind: 'lowpass', freq: 520, res: 3 }], ['chorus', { rate: 0.4, depth: 0.9, mix: 0.6 }]] },
    lofi: { label: 'Lo-fi', icon: '📼', chain: () => [['filter', { kind: 'lowpass', freq: 4200, res: 0.7 }], ['crusher', { bits: 10, tone: 6000, mix: 0.6 }]] },
  };
  VO.SYNTHS = SYNTHS;
  const settings = (t) => { if (!t.vx) t.vx = Object.assign({}, DEF); return Object.assign(t.vx, Object.assign({}, DEF, t.vx)); };

  /** key + scale for Auto-Tune / synth: the song's key if generated, otherwise detected from the recording */
  function keyFor(t) {
    const v = settings(t), Pj = ST.proj();
    let key = v.key, scale = v.scale;
    if (key === 'auto' || scale === 'auto') {
      let k = null;
      if (Pj.gen) k = { key: Pj.gen.key, scale: Pj.gen.scale === 'dorian' ? 'minor' : Pj.gen.scale };
      else if (v.det) k = v.det;
      else {
        const c = t.clips.find((x) => x.sample), s = c && ST.lib.samples.get(c.sample);
        if (s) { const d = P.detectKey(s.ch[0], s.sr); k = v.det = { key: d.key, scale: d.scale }; } else k = { key: 0, scale: 'minor' };
      }
      if (key === 'auto') key = k.key; if (scale === 'auto') scale = k.scale;
    }
    return { key: +key, scale };
  }
  /** rebuild the vx_ effects in the track's FX chain from the panel settings (user's own FX are kept in the middle) */
  VO.applyVX = (t) => {
    const v = settings(t), k = keyFor(t);
    const keep = (t.fx || []).filter((f) => !String(f.id).startsWith('vx_'));
    const mk = (id, type, p) => ({ id, type, on: true, p: Object.assign(FX.defaults(type), p) });
    const S = SYNTHS[v.synth] || SYNTHS.off;
    const total = v.pitch + v.fine / 100 + (S.pitch || 0);
    const pre = [];
    if (Math.abs(total) > 0.001) { const semis = Math.round(total); pre.push(mk('vx_pitch', 'pitch', { semis, fine: Math.round((total - semis) * 100) })); }
    if (v.tune) pre.push(mk('vx_tune', 'autotune', { key: k.key, scale: k.scale, speed: Math.round(150 * Math.pow(1 - v.strength, 2)), amount: 1 }));
    S.chain(k).forEach(([type, p], i) => pre.push(mk('vx_s' + i, type, type === 'synthvoice' ? Object.assign({ oct: v.soct }, p) : p)));
    const post = [];
    if (v.echo > 0) post.push(mk('vx_echo', 'delay', { mix: v.echo * 0.6, time: v.etime, fb: 0.38, pp: true }));
    if (v.reverb > 0) { const z = SIZES[v.size] || SIZES.hall; post.push(mk('vx_rev', 'reverb', { mix: v.reverb * 0.75, size: z[0], tone: z[1], pre: 0.02 })); }
    t.fx = pre.concat(keep, post);
    if (t.rev > 0.1 && v.reverb > 0) t.rev = 0.05; // the panel reverb replaces the old send
    ST.sync(); ST.autosave();
  };

  /* ---------- hear yourself through the track's effects ---------- */
  const mon = { t: null, g: null, an: null, buf: null };
  VO.monitor = async (t, on) => {
    if (mon.g) { try { ST.mic.src.disconnect(mon.g); } catch (e) { /* ignore */ } try { mon.g.disconnect(); } catch (e) { /* ignore */ } mon.g = null; mon.t = null; }
    if (!on) return true;
    try { await ST.micOpen(); } catch (e) { ST.toast('⚠ Microphone: ' + (e.message || 'blocked'), 'warn'); return false; }
    ST.ensure(); A.resume(); ST.sync();
    const c = ST.ctx, strip = ST.graph.strips.get(t.id); if (!strip) return false;
    mon.g = c.createGain(); mon.g.gain.value = 0.9; ST.mic.src.connect(mon.g); mon.g.connect(strip.input); mon.t = t.id;
    if (!mon.an) { mon.an = c.createAnalyser(); mon.an.fftSize = 4096; mon.buf = new Float32Array(4096); }
    ST.mic.src.connect(mon.an);
    return true;
  };
  VO.stopMonitor = () => { VO.monitor(null, false); };

  /* ---------- the panel ---------- */
  let raf = 0;
  VO.leave = () => { cancelAnimationFrame(raf); };
  VO.panel = (body, t) => {
    cancelAnimationFrame(raf);
    const v = settings(t);
    const P0 = ST.proj();
    const clip = () => { const sel = ST.selClip && ST.findClip(ST.selClip); return sel && sel.t.id === t.id && sel.c.sample ? sel.c : t.clips.find((c) => c.sample); };
    const change = () => { VO.applyVX(t); paintChips(); };
    const out = (txt) => h('output', { class: 'vx-val' }, txt);
    const slider = (min, max, step, val, fn) => h('input', { type: 'range', min, max, step, value: val, oninput: (e) => fn(+e.target.value) });
    // --- pitch tile
    const pOut = out(''), fOut = out('');
    const pTxt = () => { pOut.textContent = (v.pitch > 0 ? '+' : '') + v.pitch + ' st'; fOut.textContent = (v.fine > 0 ? '+' : '') + v.fine + '¢'; };
    const pSl = slider(-12, 12, 1, v.pitch, (x) => { v.pitch = x; pTxt(); change(); });
    const fSl = slider(-100, 100, 1, v.fine, (x) => { v.fine = x; pTxt(); change(); });
    const pBtn = (lbl, d) => h('button', { class: 'btn xs', onclick: () => { v.pitch = d === 0 ? 0 : clamp(v.pitch + d, -12, 12); if (d === 0) v.fine = 0; pSl.value = v.pitch; fSl.value = v.fine; pTxt(); change(); } }, lbl);
    pTxt();
    // --- auto-tune tile
    const k0 = keyFor(t);
    const tuneSw = h('input', { type: 'checkbox', class: 'sw big', onchange: (e) => { v.tune = e.target.checked; change(); } }); tuneSw.checked = v.tune;
    const keySel = h('select', { class: 'sel', onchange: (e) => { v.key = e.target.value; change(); } }, h('option', { value: 'auto' }, 'Auto (' + P.KEYS[k0.key] + ')'), P.KEYS.map((k, i) => h('option', { value: i, selected: String(v.key) === String(i) }, k)));
    const scSel = h('select', { class: 'sel', onchange: (e) => { v.scale = e.target.value; change(); } }, h('option', { value: 'auto' }, 'Auto (' + k0.scale + ')'), ['major', 'minor', 'pentatonic minor', 'pentatonic major', 'blues', 'chromatic'].map((s) => h('option', { value: s, selected: v.scale === s }, s)));
    const stOut = out('');
    const stTxt = () => { stOut.textContent = v.strength > 0.9 ? 'Robotic (T-Pain)' : v.strength > 0.6 ? 'Strong' : v.strength > 0.3 ? 'Medium' : 'Natural'; };
    stTxt();
    // --- synth chips
    const chips = h('div', { class: 'vx-chips' });
    const paintChips = () => {
      chips.innerHTML = '';
      Object.keys(SYNTHS).forEach((k) => chips.append(h('button', { class: 'vx-chip' + (v.synth === k ? ' on' : ''), onclick: () => { v.synth = k; change(); } }, h('span', null, SYNTHS[k].icon), SYNTHS[k].label)));
    };
    paintChips();
    const octSel = h('select', { class: 'sel', onchange: (e) => { v.soct = +e.target.value; change(); } }, [[-1, 'Lower'], [0, 'Same'], [1, 'Higher']].map(([x, l]) => h('option', { value: x, selected: v.soct === x }, l)));
    // --- space
    const rOut = out(Math.round(v.reverb * 100) + '%'), eOut = out(Math.round(v.echo * 100) + '%');
    // --- tuner
    const tn = h('div', { class: 'vx-tuner' }, h('b', null, '–'), h('span', { class: 'muted small' }, 'Turn on “Hear myself” to see your pitch live'));
    // --- transport helpers
    const loopBtn = h('button', { class: 'btn sm accent', onclick: () => {
      const c = clip(); if (!c) return ST.toast('Record something first (● Record) or drop a sound on this track', 'warn');
      if (ST.tr.playing) { ST.stop(); loopBtn.textContent = '🔁 Loop my recording'; return; }
      P0.loop = { on: true, start: Math.floor(c.start * 4) / 4, end: Math.ceil((c.start + c.len) * 4) / 4 };
      ST.seek(P0.loop.start); ST.play(); loopBtn.textContent = '■ Stop';
      ST.toast('Looping your recording — move any knob and hear it change');
    } }, ST.tr.playing ? '■ Stop' : '🔁 Loop my recording');
    const monSw = h('input', { type: 'checkbox', class: 'sw', onchange: async (e) => { const ok = await VO.monitor(t, e.target.checked); if (!ok) e.target.checked = false; else if (e.target.checked) ST.toast('🎧 Use headphones! You now hear your mic through these effects.'); } }); monSw.checked = mon.t === t.id;
    const bake = async () => {
      const c = clip(); if (!c) return ST.toast('No recording on this track yet', 'warn');
      const s = ST.lib.samples.get(c.sample); if (!s) return;
      const chain = (t.fx || []).filter((f) => f.on).map((f) => [f.type, f.p]);
      if (!chain.length) return ST.toast('No effects to bake — move a knob first', 'warn');
      ST.toast('Baking effects into a new take…');
      const off = Math.round((c.off || 0) * s.sr), n = Math.min(s.ch[0].length - off, Math.round(c.len * ST.spb() * s.sr));
      const seg = s.ch.map((d) => d.slice(off, off + n)), outCh = await VMI.slab.bounce(seg.length === 1 ? [seg[0], seg[0]] : seg, s.sr, chain, 1);
      const ns = await ST.lib.addRaw(outCh, s.sr, s.name.replace(/ \(.*\)$/, '') + ' (FX)', 'edit');
      ST.snap(); c.raw = c.raw || c.sample; c.sample = ns.id; c.off = 0; c.name = ns.name;
      t.vx = Object.assign({}, DEF, { reverb: 0 }); VO.applyVX(t); ST.touch(); ST.emit('selection');
      ST.toast('Baked! The new take is in your Library too — open it in Sound Lab or make an instrument from it.');
    };
    body.innerHTML = '';
    body.append(
      h('div', { class: 'play-tools' },
        h('span', { class: 'pt-name' }, '🎤 Voice FX · ' + t.name),
        h('button', { class: 'btn sm rec-big', onclick: () => ST.record() }, '● Record'),
        loopBtn,
        h('label', { class: 'field' }, h('span', { class: 'flabel' }, '🎧 Hear myself live'), monSw),
        h('span', { class: 'muted small hint-inline' }, 'Everything here is live and undoable. Your original recording is never changed.')),
      h('div', { class: 'vx' },
        h('div', { class: 'vx-tile' }, h('div', { class: 'vx-h' }, '🎚 Pitch', pOut),
          pSl, h('div', { class: 'row' }, pBtn('−12', -12), pBtn('−1', -1), pBtn('Reset', 0), pBtn('+1', 1), pBtn('+12', 12)),
          h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Fine'), fSl, fOut),
          h('span', { class: 'muted small' }, 'Raise or lower your voice without changing its speed.')),
        h('div', { class: 'vx-tile' + (v.tune ? ' lit' : '') }, h('div', { class: 'vx-h' }, '🎤 Auto-Tune', tuneSw),
          h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Key'), keySel), h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Scale'), scSel),
          h('label', { class: 'field col' }, h('span', { class: 'flabel' }, 'Strength: ', stOut), slider(0, 1, 0.05, v.strength, (x) => { v.strength = x; stTxt(); if (v.tune) change(); else ST.autosave(); })),
          tn),
        h('div', { class: 'vx-tile wide' }, h('div', { class: 'vx-h' }, '🤖 Voice synth & character', h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Synth pitch'), octSel)),
          chips, h('span', { class: 'muted small' }, 'Robot, Talkbox and Choir turn your words into an electric synth voice that sings in the song’s key. Combine with Auto-Tune for the hard robotic sound.')),
        h('div', { class: 'vx-tile' }, h('div', { class: 'vx-h' }, '🌌 Space'),
          h('label', { class: 'field col' }, h('span', { class: 'flabel' }, 'Reverb ', rOut), slider(0, 1, 0.01, v.reverb, (x) => { v.reverb = x; rOut.textContent = Math.round(x * 100) + '%'; change(); })),
          h('div', { class: 'vx-chips small' }, Object.keys(SIZES).map((z) => h('button', { class: 'vx-chip' + (v.size === z ? ' on' : ''), onclick: (e) => { v.size = z; e.currentTarget.parentNode.querySelectorAll('.vx-chip').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); change(); } }, z))),
          h('label', { class: 'field col' }, h('span', { class: 'flabel' }, 'Echo ', eOut), slider(0, 1, 0.01, v.echo, (x) => { v.echo = x; eOut.textContent = Math.round(x * 100) + '%'; change(); })),
          h('select', { class: 'sel', onchange: (e) => { v.etime = e.target.value; change(); } }, [['1/4', 'Echo: 1/4'], ['1/8', 'Echo: 1/8'], ['1/8d', 'Echo: dotted 1/8'], ['1/16', 'Echo: 1/16']].map(([x, l]) => h('option', { value: x, selected: v.etime === x }, l))))),
      h('div', { class: 'vx-actions' },
        h('button', { class: 'btn sm accent', title: 'Group your beatbox/mouth sounds and turn each into any drum or instrument', onclick: () => { const c = clip(); if (c) VMI.mapper.open(c.sample, c); else ST.toast('Record or drop a sound first', 'warn'); } }, '🗣→🎹 Map my sounds to instruments'),
        h('button', { class: 'btn sm', title: 'Cut, stretch, pitch precisely and make a playable instrument', onclick: () => { const c = clip(); if (c) VMI.slab.open(c.sample, c); } }, '🔬 Sound Lab'),
        h('button', { class: 'btn sm', title: 'Melody → instrument, harmonies, vocoder with chords', onclick: () => { const c = clip(); if (c) VO.lab(c, 'mel'); } }, '🎹 Hum → instrument'),
        h('button', { class: 'btn sm', title: 'Print these effects into a new take (so you can chop it or make an instrument from the processed sound)', onclick: bake }, '💾 Bake effects')));
    VO.applyVX(t);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!body.isConnected) { cancelAnimationFrame(raf); return; }
      if (loopBtn.textContent.startsWith('■') && !ST.tr.playing) loopBtn.textContent = '🔁 Loop my recording';
      if (!mon.an || mon.t !== t.id) return;
      mon.an.getFloatTimeDomainData(mon.buf);
      const tr = P.track(mon.buf, ST.ctx.sampleRate), fs = Array.from(tr.f0).filter((f) => f);
      if (fs.length) {
        fs.sort((a, b) => a - b); const m = P.ftom(fs[Math.floor(fs.length / 2)]), kk = keyFor(t), tgt = P.snap(m, kk.key, kk.scale), near = Math.round(m), cents = Math.round((m - near) * 100);
        tn.firstChild.textContent = A.m2n(near) + (v.tune && tgt !== near ? ' → ' + A.m2n(tgt) : '');
        tn.lastChild.textContent = (Math.abs(cents) < 12 ? '✔ in tune' : (cents > 0 ? '▲ ' : '▼ ') + Math.abs(cents) + '¢ ' + (cents > 0 ? 'sharp' : 'flat')) + (v.tune ? ' · Auto-Tune fixes it' : '');
      }
    };
    loop();
  };
})();
