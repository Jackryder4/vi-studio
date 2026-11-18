/* soundlab.js — Sound Lab: an Edison-style editor for any recorded/imported sound.
   Select · cut · fade · reverse · normalize · pitch (tape / keep timing / voice-safe) · time-stretch ·
   burn-in effects · detect pitch & tune · save · make it a playable instrument. */
(function () {
  'use strict';
  const VMI = window.VMI, A = VMI.audio, ST = VMI.st;
  const SL = (VMI.slab = {});
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const h = (...a) => VMI.sui.h(...a);

  /* =========================================================
     DSP
     ========================================================= */
  /** linear-interpolated resample: ratio > 1 = faster/higher & shorter */
  SL.resample = (d, ratio) => {
    const n = Math.max(1, Math.floor(d.length / ratio)), o = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * ratio, i0 = Math.floor(x), f = x - i0, a = d[i0] || 0, b = d[i0 + 1] || 0; o[i] = a + (b - a) * f; }
    return o;
  };
  /** WSOLA time-stretch that keeps pitch: factor > 1 = longer/slower */
  SL.stretch = (d, sr, factor) => {
    if (Math.abs(factor - 1) < 1e-3) return Float32Array.from(d);
    const N = (Math.round(sr * 0.04) >> 1) << 1, Hs = N / 2, Ha = Hs / factor, tol = Math.round(sr * 0.006);
    const outLen = Math.max(1, Math.floor(d.length * factor));
    if (d.length < N * 2) return SL.resample(d, 1 / factor);
    const out = new Float32Array(outLen + N), w = new Float32Array(outLen + N), win = new Float32Array(N);
    for (let j = 0; j < N; j++) win[j] = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / N);
    let prev = 0;
    for (let k = 0; k * Hs < outLen; k++) {
      const nominal = Math.round(k * Ha);
      let best = clamp(nominal, 0, d.length - N);
      if (k > 0) {
        const target = prev + Hs; let bc = -Infinity;
        if (target + N / 2 < d.length) {
          for (let dl = -tol; dl <= tol; dl += 2) {
            const pos = nominal + dl; if (pos < 0 || pos + N > d.length) continue;
            let c = 0; for (let j = 0; j < N / 2; j += 4) c += d[pos + j] * d[target + j];
            if (c > bc) { bc = c; best = pos; }
          }
        }
      }
      const o0 = k * Hs;
      for (let j = 0; j < N; j++) { out[o0 + j] += d[best + j] * win[j]; w[o0 + j] += win[j]; }
      prev = best;
    }
    const r = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) r[i] = w[i] > 1e-3 ? out[i] / w[i] : 0;
    return r;
  };
  /** pitch shift by semitones. mode: tape | keep | voice */
  SL.pitch = (d, sr, semis, mode) => {
    if (!semis) return Float32Array.from(d);
    const r = Math.pow(2, semis / 12);
    if (mode === 'tape') return SL.resample(d, r);
    if (mode === 'voice') return VMI.pitch.shift(d, sr, semis);
    const o = SL.resample(SL.stretch(d, sr, r), r); // same length as the input (timing kept exactly)
    if (o.length === d.length) return o;
    const z = new Float32Array(d.length); z.set(o.subarray(0, d.length)); return z;
  };
  /** run audio through effect presets / chains offline ("burn in") */
  SL.bounce = async (chs, sr, chain, tail) => {
    const len = chs[0].length + Math.round((tail || 0) * sr);
    const off = new OfflineAudioContext(2, len, sr);
    if (chain.some(([t]) => VMI.FX.types[t] && VMI.FX.types[t].worklet)) await VMI.FX.loadWorklet(off);
    const b = off.createBuffer(chs.length, chs[0].length, sr); chs.forEach((c, i) => b.copyToChannel(c, i));
    const src = off.createBufferSource(); src.buffer = b;
    let n = src; const bpm = ST.proj() ? ST.proj().bpm : 120;
    chain.forEach(([t, p]) => { const m = VMI.FX.build(off, { type: t, p }, bpm); n.connect(m.input); n = m.output; });
    n.connect(off.destination); src.start();
    const r = await off.startRendering();
    return [r.getChannelData(0).slice(), r.getChannelData(1).slice()];
  };
  /** dominant pitch of a sound → {midi, cents, hz} or null */
  SL.detect = (d, sr) => {
    const tr = VMI.pitch.track(d, sr), ms = [];
    tr.f0.forEach((f, i) => { if (f) for (let k = 0; k < Math.max(1, Math.round(tr.rms[i] * 50)); k++) ms.push(VMI.pitch.ftom(f)); });
    if (ms.length < 3) return null;
    ms.sort((a, b) => a - b);
    const m = ms[Math.floor(ms.length / 2)], n = Math.round(m);
    return { midi: n, cents: Math.round((m - n) * 100), hz: VMI.pitch.mtof(m) };
  };

  /* =========================================================
     The Sound Lab window
     ========================================================= */
  SL.open = (sampleId, clip) => {
    const s0 = ST.lib.samples.get(sampleId); if (!s0) return;
    const sr = s0.sr;
    let chs = s0.ch.map((c) => Float32Array.from(c)), undo = [], redo = [], sel = null, playing = null, dirty = false, det = null;
    const cv = h('canvas', { class: 'sl-wave' });
    const ph = h('div', { class: 'roll-ph' });
    const info = h('div', { class: 'sl-info' });
    const detOut = h('span', { class: 'sl-det' });
    const len = () => chs[0].length;
    const range = () => (sel && sel[1] - sel[0] > 64 ? sel : [0, len()]);
    const commit = (next, label) => { undo.push(chs); if (undo.length > 30) undo.shift(); redo = []; chs = next; dirty = true; sel = null; analyze(); draw(); if (label) ST.toast(label); };
    const mono = () => { if (chs.length === 1) return chs[0]; const m = new Float32Array(len()); for (let i = 0; i < m.length; i++) m[i] = (chs[0][i] + chs[1][i]) / 2; return m; };
    const analyze = () => {
      det = SL.detect(mono(), sr);
      detOut.innerHTML = '';
      detOut.append(det ? h('span', null, 'Pitch: ', h('b', null, A.m2n(det.midi)), ' ' + (det.cents >= 0 ? '+' : '') + det.cents + '¢ (' + Math.round(det.hz) + ' Hz)') : h('span', null, 'Pitch: none (unpitched / noisy sound)'));
    };
    function draw() {
      if (!cv.isConnected) return;
      const w = Math.max(320, cv.parentElement.clientWidth), hh = 170, dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = w * dpr; cv.height = hh * dpr; cv.style.height = hh + 'px';
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = '#0b0b12'; g.fillRect(0, 0, w, hh);
      for (let x = 0; x < w; x += w / 16) { g.fillStyle = '#ffffff08'; g.fillRect(Math.round(x), 0, 1, hh); }
      g.fillStyle = '#ffffff14'; g.fillRect(0, hh / 2, w, 1);
      if (sel) { g.fillStyle = '#22e6ff22'; g.fillRect((sel[0] / len()) * w, 0, ((sel[1] - sel[0]) / len()) * w, hh); }
      const d = chs[0], step = d.length / w, grad = g.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#ff2bd6'); grad.addColorStop(0.5, '#6b2bff'); grad.addColorStop(1, '#22e6ff');
      g.fillStyle = grad;
      for (let x = 0; x < w; x++) {
        let mn = 0, mx = 0; const o = Math.floor(x * step), e = Math.min(d.length, Math.floor((x + 1) * step));
        for (let k = o; k < e; k += Math.max(1, (e - o) >> 6)) { const v = d[k]; if (v < mn) mn = v; if (v > mx) mx = v; }
        g.fillRect(x, hh / 2 - mx * (hh / 2 - 4), 1, Math.max(1, (mx - mn) * (hh / 2 - 4)));
      }
      const dur = len() / sr, [a, b] = range();
      info.textContent = 'Length ' + dur.toFixed(2) + 's' + (sel ? ' · selection ' + ((b - a) / sr).toFixed(2) + 's (' + (a / sr).toFixed(2) + '–' + (b / sr).toFixed(2) + ')' : ' · drag on the wave to select a part');
    }
    // selection by dragging
    cv.addEventListener('pointerdown', (e) => {
      const r = cv.getBoundingClientRect(), at = (ev) => clamp(Math.round(((ev.clientX - r.left) / r.width) * len()), 0, len());
      const s = at(e); sel = [s, s];
      const mv = (ev) => { const x = at(ev); sel = [Math.min(s, x), Math.max(s, x)]; draw(); };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (sel[1] - sel[0] < 64) sel = null; draw(); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });

    /* playback */
    const stop = () => { if (playing) { try { playing.stop(); } catch (e) { /* ignore */ } playing = null; } ph.style.display = 'none'; };
    const play = (all) => {
      stop(); ST.ensure(); A.resume();
      const c = ST.ctx, [a, b] = all ? [0, len()] : range();
      const buf = c.createBuffer(chs.length, b - a, sr); chs.forEach((d, i) => buf.copyToChannel(d.slice(a, b), i));
      const src = c.createBufferSource(); src.buffer = buf; src.connect(c.destination); src.start();
      const t0 = c.currentTime; playing = src; ph.style.display = 'block';
      const tick = () => { if (playing !== src) return; const pos = a + (c.currentTime - t0) * sr; if (pos >= b) { stop(); return; } ph.style.transform = 'translateX(' + (pos / len()) * cv.clientWidth + 'px)'; requestAnimationFrame(tick); };
      tick(); src.onended = () => { if (playing === src) stop(); };
    };

    /* edits (on the selection, or the whole sound) */
    const onSel = (fn) => { const [a, b] = range(); return chs.map((d) => { const o = Float32Array.from(d); fn(o, a, b); return o; }); };
    const E = {
      crop: () => { if (!sel) return ST.toast('Select a part of the wave first', 'warn'); const [a, b] = sel; commit(chs.map((d) => d.slice(a, b)), 'Cropped to selection'); },
      del: () => { if (!sel) return ST.toast('Select a part of the wave first', 'warn'); const [a, b] = sel; commit(chs.map((d) => { const o = new Float32Array(d.length - (b - a)); o.set(d.subarray(0, a)); o.set(d.subarray(b), a); return o; }), 'Deleted selection'); },
      silence: () => commit(onSel((o, a, b) => o.fill(0, a, b)), 'Silenced'),
      fadeIn: () => commit(onSel((o, a, b) => { for (let i = a; i < b; i++) o[i] *= (i - a) / (b - a); }), 'Faded in'),
      fadeOut: () => commit(onSel((o, a, b) => { for (let i = a; i < b; i++) o[i] *= (b - i) / (b - a); }), 'Faded out'),
      reverse: () => commit(onSel((o, a, b) => { o.subarray(a, b).reverse(); }), 'Reversed'),
      normalize: () => { let m = 0; const [a, b] = range(); chs.forEach((d) => { for (let i = a; i < b; i++) m = Math.max(m, Math.abs(d[i])); }); if (m < 1e-5) return; const k = 0.98 / m; commit(onSel((o, aa, bb) => { for (let i = aa; i < bb; i++) o[i] *= k; }), 'Normalized'); },
      gain: (db) => { const k = Math.pow(10, db / 20); commit(onSel((o, a, b) => { for (let i = a; i < b; i++) o[i] = clamp(o[i] * k, -1, 1); }), (db > 0 ? '+' : '') + db + ' dB'); },
      trimSilence: () => { const d = chs[0]; let a = 0, b = d.length; while (a < b && Math.abs(d[a]) < 0.01) a++; while (b > a && Math.abs(d[b - 1]) < 0.01) b--; commit(chs.map((x) => x.slice(Math.max(0, a - 200), Math.min(x.length, b + 800))), 'Trimmed silence'); },
    };
    const applyPartial = (fn) => { // apply a length-changing process to the selection (or all)
      const [a, b] = range();
      commit(chs.map((d) => { const mid = fn(d.slice(a, b)), o = new Float32Array(a + mid.length + (d.length - b)); o.set(d.subarray(0, a)); o.set(mid, a); o.set(d.subarray(b), a + mid.length); return o; }));
    };

    /* pitch & time controls */
    const semi = h('input', { type: 'range', min: -24, max: 24, step: 1, value: 0 }), semiOut = h('output', null, '0 st');
    const fine = h('input', { type: 'range', min: -100, max: 100, step: 1, value: 0 }), fineOut = h('output', null, '0¢');
    const speed = h('input', { type: 'range', min: 0.25, max: 2.5, step: 0.05, value: 1 }), speedOut = h('output', null, '100%');
    const mode = h('select', { class: 'sel' }, h('option', { value: 'keep' }, 'Keep timing (pitch only)'), h('option', { value: 'tape' }, 'Tape (pitch + speed, like vinyl)'), h('option', { value: 'voice' }, 'Voice-safe (no chipmunk)'));
    semi.oninput = () => { semiOut.textContent = (semi.value > 0 ? '+' : '') + semi.value + ' st'; };
    fine.oninput = () => { fineOut.textContent = (fine.value > 0 ? '+' : '') + fine.value + '¢'; };
    speed.oninput = () => { speedOut.textContent = Math.round(speed.value * 100) + '%'; };
    const busy = (msg, fn) => { ST.toast(msg); setTimeout(async () => { try { await fn(); } catch (e) { console.error(e); ST.toast('Failed: ' + e.message, 'warn'); } }, 30); };
    const applyPitch = () => {
      const st = +semi.value + +fine.value / 100, sp = +speed.value;
      if (!st && sp === 1) return ST.toast('Move the pitch or speed slider first', 'warn');
      busy('Processing…', () => {
        applyPartial((d) => { let o = st ? SL.pitch(d, sr, st, mode.value) : d; if (sp !== 1) o = SL.stretch(o, sr, 1 / sp); return o; });
        ST.toast('Pitch ' + (st > 0 ? '+' : '') + st.toFixed(2) + ' st' + (sp !== 1 ? ', speed ' + Math.round(sp * 100) + '%' : ''));
        semi.value = 0; fine.value = 0; speed.value = 1; semi.oninput(); fine.oninput(); speed.oninput();
      });
    };
    const tuneToNote = () => { if (!det) return ST.toast('No clear pitch in this sound', 'warn'); if (!det.cents) return ST.toast('Already in tune: ' + A.m2n(det.midi)); busy('Tuning…', () => { applyPartial((d) => SL.pitch(d, sr, -det.cents / 100, 'keep')); }); };
    const presetSel = h('select', { class: 'sel' }, VMI.FX.presets.map((p, i) => h('option', { value: i }, p.icon + ' ' + p.name)));
    const applyFx = () => busy('Rendering effects…', async () => {
      const p = VMI.FX.presets[+presetSel.value], [a, b] = range();
      // keep the whole echo / reverb tail: it rings on over whatever comes after (never cut off)
      const tail = Math.min(7, Math.max(1.5, ...p.chain.map(([t, q]) => (t === 'reverb' ? (q.size || 2.2) + 0.4 : t === 'delay' ? 2.5 : 0))));
      const seg = chs.map((d) => d.slice(a, b)), out = await SL.bounce(seg.length === 1 ? [seg[0], seg[0]] : seg, sr, p.chain, tail);
      const base = chs.length === 1 ? [chs[0], chs[0]] : chs;
      commit(base.map((d, ch) => {
        const w = out[ch], o = new Float32Array(Math.max(d.length, a + w.length));
        o.set(d.subarray(0, a)); o.set(w.subarray(0, b - a), a);
        for (let i = b; i < o.length; i++) o[i] = (i < d.length ? d[i] : 0) + (i - a < w.length ? w[i - a] : 0);
        return o;
      }), 'Applied “' + p.name + '”');
    });

    /* saving & using */
    const save = async (suffix) => {
      const ns = await ST.lib.addRaw(chs.map((d) => Float32Array.from(d)), sr, s0.name.replace(/ \(.*\)$/, '') + ' (' + (suffix || 'edited') + ')', 'edit');
      dirty = false; return ns;
    };
    const useInClip = async () => {
      const ns = await save('edited'); ST.snap(); if (!clip.raw) clip.raw = clip.sample; clip.sample = ns.id; clip.name = ns.name; clip.off = 0; clip.len = (ns.dur) / ST.spb(); ST.ensureBars(clip.start + clip.len); ST.touch(); ST.emit('selection');
      m.close(); ST.toast('Clip updated — “↺ Original” brings the old take back');
    };
    const btn = (label, fn, cls, title) => h('button', { class: 'btn xs ' + (cls || ''), title: title || '', onclick: fn }, label);
    const body = h('div', { class: 'slab' },
      h('div', { class: 'sl-top' }, btn('▶ Play', () => play(false), 'accent', 'Plays the selection, or everything'), btn('▶ All', () => play(true)), btn('■', stop), detOut, h('span', { style: 'flex:1' }), info),
      h('div', { class: 'sl-wrap' }, cv, ph),
      h('div', { class: 'sl-row' },
        h('span', { class: 'sl-h' }, 'Edit'),
        btn('Select all', () => { sel = [0, len()]; draw(); }), btn('✂ Crop', E.crop, '', 'Keep only the selection'), btn('Delete', E.del), btn('Silence', E.silence), btn('Fade in', E.fadeIn), btn('Fade out', E.fadeOut), btn('⇆ Reverse', E.reverse), btn('⇧ Normalize', E.normalize), btn('−3 dB', () => E.gain(-3)), btn('+3 dB', () => E.gain(3)), btn('Trim silence', E.trimSilence),
        btn('↶', () => { if (!undo.length) return; redo.push(chs); chs = undo.pop(); sel = null; analyze(); draw(); }, '', 'Undo'), btn('↷', () => { if (!redo.length) return; undo.push(chs); chs = redo.pop(); sel = null; analyze(); draw(); }, '', 'Redo')),
      h('div', { class: 'sl-grid' },
        h('div', { class: 'lab-card' }, h('b', null, '🎚 Pitch & time'),
          h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Pitch'), h('span', { class: 'sl' }, semi, semiOut)),
          h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Fine'), h('span', { class: 'sl' }, fine, fineOut)),
          h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Speed'), h('span', { class: 'sl' }, speed, speedOut)),
          h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Mode'), mode),
          h('div', { class: 'row' }, btn('Apply pitch / speed', applyPitch, 'accent'), btn('🎯 Tune to nearest note', tuneToNote))),
        h('div', { class: 'lab-card' }, h('b', null, '🎛 Burn in effects'),
          h('span', { class: 'muted small' }, 'Prints the effect permanently into the sound (selection or all). For adjustable effects use the track’s FX tab instead.'),
          presetSel, btn('Apply effect', applyFx, 'accent')),
        h('div', { class: 'lab-card' }, h('b', null, '🎹 Use this sound'),
          h('span', { class: 'muted small' }, 'Turn it into an instrument you can play at any pitch, chop it into drum pads, or save it to your library.'),
          btn('🎹 Make playable instrument', async () => { const ns = await save('instrument'); m.close(); U().makeInstrument(ns.id, det ? det.midi : 60, det ? det.cents : 0); }, 'accent'),
          btn('🥁 Chop into drum pads', async () => { const ns = dirty ? await save('edited') : s0; m.close(); U().beatLab(ns.id, clip); }),
          btn('💾 Save as new sound', async () => { await save('edited'); ST.toast('Saved to My Library'); }),
          clip ? btn('✔ Use in this clip', useInClip, 'accent') : null)));
    const U = () => VMI.sui;
    const m = U().modal('🔬 Sound Lab — ' + s0.name, body, { cls: 'wide', onclose: stop });
    analyze(); requestAnimationFrame(draw);
  };
})();
