/* studio-edit.js — piano roll / step editor, audio clip editor, Beatbox Lab, recorder, sampler maker */
(function () {
  'use strict';
  const VMI = window.VMI, A = VMI.audio, ST = VMI.st, U = VMI.sui;
  const h = U.h, $ = U.$;
  const E = (VMI.sedit = {});
  const clamp = ST.clamp;
  let ed = null;

  E.render = (body) => {
    ed = null; U.editorFrame = null;
    const f = U.selClip();
    if (!f) {
      body.append(h('div', { class: 'empty-panel' }, h('b', null, 'No clip selected'),
        h('span', null, 'Double-click an empty spot on an instrument lane to create a clip, or click an existing clip. Recorded takes appear here too.')));
      return;
    }
    if (f.c.sample) audioEditor(body, f.t, f.c); else roll(body, f.t, f.c);
  };
  U.refreshEditor = () => {
    if (U.tab !== 'editor') return;
    const f = ST.selClip && ST.findClip(ST.selClip);
    if (ed && f && f.c === ed.c) { ed.draw(); return; }
    const body = $('#bpBody'); if (body) { body.innerHTML = ''; E.render(body); }
  };
  E.deleteSelection = () => {
    if (!ed || !ed.sel || U.tab !== 'editor') return false;
    ST.snap(); ed.c.notes = ed.c.notes.filter((n) => n !== ed.sel); ed.sel = null; ST.touch(); return true;
  };
  E.resize = () => { if (ed && ed.draw) ed.draw(); };

  const clipTools = (t, c) => [
    h('button', { class: 'btn xs', title: 'Split the clip at the playhead', onclick: () => U.ops.split(c.id, ST.curBeat()) }, '✂ Split'),
    h('button', { class: 'btn xs', title: 'Duplicate (Ctrl+D)', onclick: () => U.ops.dup(c.id) }, '⧉ Duplicate'),
    h('button', { class: 'btn xs danger', title: 'Delete clip (Del)', onclick: () => U.ops.del(c.id) }, '🗑 Delete'),
  ];

  /* =========================================================
     Piano roll / drum step editor
     ========================================================= */
  function rowsFor(inst, c) {
    if (inst.layout === 'pads') return { rows: inst.cfg.pads.map((p) => ({ key: p.id, label: p.label })), rh: 28, pads: true };
    const cfg = inst.cfg;
    let lo = 48, hi = 84;
    if (inst.layout === 'keys') { lo = Math.max(cfg.min, 24); hi = Math.min(cfg.max, 108); }
    else if (inst.layout === 'frets') { lo = A.n2m(cfg.tuning[0]); hi = A.n2m(cfg.tuning[cfg.tuning.length - 1]) + cfg.frets; }
    else if (inst.layout === 'scale') { lo = A.n2m(cfg.start); hi = lo + Math.ceil((cfg.count / cfg.scale.length) * 12); }
    c.notes.forEach((n) => { if (typeof n.n === 'number') { lo = Math.min(lo, n.n); hi = Math.max(hi, n.n); } });
    const rows = [];
    for (let m = hi; m >= lo; m--) rows.push({ key: m, label: A.m2n(m), black: [1, 3, 6, 8, 10].includes(m % 12), c: m % 12 === 0 });
    return { rows, rh: 16, pads: false };
  }
  function roll(body, t, c) {
    const inst = VMI.byId[t.inst];
    if (!inst) { body.append(h('div', { class: 'empty-panel' }, 'This track has no instrument.')); return; }
    const R = rowsFor(inst, c);
    const st = { t, c, inst, sel: null, grid: R.pads ? 0.25 : 0.25, ppb: R.pads ? 44 : 56, lastD: R.pads ? 0.25 : 1 };
    ed = st;
    const GW = R.pads ? 96 : 56;
    const gut = h('canvas', { class: 'roll-gut' });
    const grid = h('canvas', { class: 'roll-grid' });
    const ph = h('div', { class: 'roll-ph' });
    const inner = h('div', { class: 'roll-inner' }, gut, grid, ph);
    const scroll = h('div', { class: 'roll-scroll' }, inner);
    const vel = h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: 0.8, title: 'Velocity of the selected note', oninput: (e) => { if (st.sel) { st.sel.v = +e.target.value; draw(); ST.autosave(); } } });
    const lenSel = h('select', { class: 'sel', onchange: (e) => { ST.snap(); c.len = +e.target.value * 4; ST.ensureBars(c.start + c.len); ST.touch(); } },
      [1, 2, 4, 8, 16].map((b) => h('option', { value: b, selected: c.len === b * 4 }, b + (b > 1 ? ' bars' : ' bar'))));
    if (![1, 2, 4, 8, 16].includes(c.len / 4)) lenSel.append(h('option', { value: c.len / 4, selected: true }, (c.len / 4).toFixed(2) + ' bars'));
    const tools = h('div', { class: 'ed-tools' },
      h('span', { class: 'pt-name', style: 'color:' + t.color }, (R.pads ? '🥁 Step editor' : '🎹 Piano roll') + ' · ' + t.name),
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Grid'), h('select', { class: 'sel', onchange: (e) => { st.grid = +e.target.value; st.lastD = Math.max(st.grid, R.pads ? st.grid : st.lastD); draw(); } },
        [[1, '1/4'], [0.5, '1/8'], [0.25, '1/16'], [0.125, '1/32']].map(([v, l]) => h('option', { value: v, selected: v === st.grid }, l)))),
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Length'), lenSel),
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Zoom'), h('input', { type: 'range', min: 20, max: 140, value: st.ppb, oninput: (e) => { st.ppb = +e.target.value; draw(); } })),
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Velocity'), vel),
      h('button', { class: 'btn xs', title: 'Snap all notes to the grid', onclick: () => { ST.snap(); c.notes.forEach((n) => { n.t = Math.round(n.t / st.grid) * st.grid; n.d = Math.max(st.grid, Math.round(n.d / st.grid) * st.grid); }); ST.touch(); } }, 'Quantize'),
      h('button', { class: 'btn xs', title: 'Double the clip and copy its notes', onclick: () => { ST.snap(); const L = c.len; c.notes = c.notes.concat(c.notes.map((n) => ({ t: n.t + L, d: n.d, n: n.n, v: n.v }))); c.len = L * 2; ST.ensureBars(c.start + c.len); ST.touch(); } }, '×2 Loop'),
      R.pads ? null : h('button', { class: 'btn xs', onclick: () => { ST.snap(); c.notes.forEach((n) => { n.n -= 12; }); ST.touch(); } }, 'Oct −'),
      R.pads ? null : h('button', { class: 'btn xs', onclick: () => { ST.snap(); c.notes.forEach((n) => { n.n += 12; }); ST.touch(); } }, 'Oct +'),
      h('button', { class: 'btn xs', onclick: () => { ST.snap(); c.notes = []; ST.touch(); } }, 'Clear'),
      clipTools(t, c),
      h('span', { class: 'muted small hint-inline' }, U.touch ? 'Tap to add · drag to move · drag the end to stretch · long-press to delete' : 'Click to add · drag to move · drag the right edge to resize · right-click or Del to delete'));
    body.append(tools, scroll);

    const rowOf = (n) => R.rows.findIndex((r) => r.key === n);
    function draw() {
      if (ed !== st || !grid.isConnected) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(40, c.len * st.ppb), H = R.rows.length * R.rh;
      [[gut, GW], [grid, W]].forEach(([cv, w]) => { cv.width = w * dpr; cv.height = H * dpr; cv.style.width = w + 'px'; cv.style.height = H + 'px'; });
      inner.style.width = GW + W + 'px'; inner.style.height = H + 'px';
      const g = grid.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      R.rows.forEach((r, i) => { g.fillStyle = r.black ? '#14161b' : i % 2 && R.pads ? '#1c1f26' : '#1a1d23'; g.fillRect(0, i * R.rh, W, R.rh); if (r.c) { g.fillStyle = '#2a2f3a'; g.fillRect(0, (i + 1) * R.rh - 1, W, 1); } });
      for (let b = 0; b <= c.len + 1e-6; b += st.grid) {
        const x = Math.round(b * st.ppb) + 0.5;
        g.fillStyle = b % 4 === 0 ? '#5a6478' : b % 1 === 0 ? '#343b49' : '#23272f';
        g.fillRect(x, 0, 1, H);
      }
      c.notes.forEach((n) => {
        const r = rowOf(n.n); if (r < 0) return;
        const x = n.t * st.ppb, w = Math.max(3, n.d * st.ppb - 1), y = r * R.rh + 1;
        g.globalAlpha = 0.45 + 0.55 * (n.v == null ? 0.8 : n.v);
        g.fillStyle = t.color; roundRect(g, x + 0.5, y, w, R.rh - 2, 3); g.fill();
        g.globalAlpha = 1;
        if (n === st.sel) { g.strokeStyle = '#fff'; g.lineWidth = 2; roundRect(g, x + 0.5, y, w, R.rh - 2, 3); g.stroke(); }
        if (R.rh >= 16 && w > 26 && !R.pads) { g.fillStyle = '#0b0d12'; g.font = '600 10px system-ui'; g.fillText(A.m2n(n.n), x + 4, y + R.rh - 5); }
      });
      if (n0(c)) { g.fillStyle = '#ffffff10'; g.fillRect(c.len * st.ppb, 0, 1, H); }
      const q = gut.getContext('2d'); q.setTransform(dpr, 0, 0, dpr, 0, 0);
      R.rows.forEach((r, i) => {
        const y = i * R.rh;
        q.fillStyle = R.pads ? '#20232b' : r.black ? '#16181d' : '#e9e9ee'; q.fillRect(0, y, GW, R.rh);
        q.fillStyle = '#0006'; q.fillRect(0, y + R.rh - 1, GW, 1);
        q.fillStyle = R.pads ? '#d7dbe4' : r.black ? '#9aa1ad' : '#333';
        q.font = (R.pads ? '600 12px' : '600 10px') + ' system-ui';
        if (R.pads || r.c || R.rh >= 16) q.fillText(r.label, 6, y + R.rh / 2 + 4);
      });
    }
    function n0() { return true; }
    st.draw = draw;
    const pos = (e) => { const r = grid.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const hitNote = (p) => { const r = Math.floor(p.y / R.rh); for (let i = c.notes.length - 1; i >= 0; i--) { const n = c.notes[i]; if (rowOf(n.n) === r && p.x >= n.t * st.ppb && p.x <= (n.t + n.d) * st.ppb + 2) return n; } return null; };
    const audition = (n) => { const spec = ST.noteSpec(inst, n); if (!spec) return; const hd = U.sapp.start(inst, spec, 0.8); setTimeout(() => U.sapp.stop(inst, hd), 220); };
    let pressT = 0;
    grid.addEventListener('contextmenu', (e) => e.preventDefault());
    grid.addEventListener('pointerdown', (e) => {
      e.preventDefault(); try { grid.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ } A.resume();
      const p = pos(e), hit = hitNote(p);
      if (e.button === 2 || (hit && e.altKey)) { if (hit) { ST.snap(); c.notes = c.notes.filter((n) => n !== hit); st.sel = null; ST.touch(); } return; }
      ST.snap();
      let mode, n, created = false;
      if (hit) { n = hit; mode = p.x > (hit.t + hit.d) * st.ppb - 7 ? 'resize' : 'move'; }
      else {
        const r = clamp(Math.floor(p.y / R.rh), 0, R.rows.length - 1);
        const tt = clamp(Math.floor(p.x / st.ppb / st.grid) * st.grid, 0, c.len - st.grid);
        n = { t: tt, d: Math.min(st.lastD, c.len - tt), n: R.rows[r].key, v: +vel.value }; c.notes.push(n); mode = 'resize'; created = true;
      }
      st.sel = n; vel.value = n.v == null ? 0.8 : n.v; audition(n.n); draw();
      const o = { t: n.t, d: n.d, r: rowOf(n.n), x: p.x, y: p.y }; let changed = created; pressT = performance.now();
      const mv = (ev) => {
        const q = pos(ev);
        if (mode === 'move') {
          const dt = Math.round((q.x - o.x) / st.ppb / st.grid) * st.grid;
          const nr = clamp(o.r + Math.round((q.y - o.y) / R.rh), 0, R.rows.length - 1);
          const nt = clamp(o.t + dt, 0, c.len - st.grid);
          if (nt !== n.t || R.rows[nr].key !== n.n) { changed = true; if (R.rows[nr].key !== n.n) audition(R.rows[nr].key); n.t = nt; n.n = R.rows[nr].key; }
        } else {
          const end = Math.max(n.t + st.grid, Math.round(q.x / st.ppb / st.grid) * st.grid);
          const d = Math.min(end - n.t, c.len - n.t); if (d !== n.d) { n.d = d; changed = true; st.lastD = d; }
        }
        draw();
      };
      const up = () => {
        grid.removeEventListener('pointermove', mv); grid.removeEventListener('pointerup', up); grid.removeEventListener('pointercancel', up);
        if (U.touch && !changed && hit && performance.now() - pressT > 550) { c.notes = c.notes.filter((x) => x !== hit); st.sel = null; changed = true; }
        if (changed) ST.touch(); else ST.unsnap();
      };
      grid.addEventListener('pointermove', mv); grid.addEventListener('pointerup', up); grid.addEventListener('pointercancel', up);
    });
    gut.addEventListener('pointerdown', (e) => { const r = Math.floor((e.clientY - gut.getBoundingClientRect().top) / R.rh); if (R.rows[r]) { A.resume(); audition(R.rows[r].key); } });
    draw();
    // initial scroll: centre on notes or middle C
    requestAnimationFrame(() => {
      const keys = c.notes.map((n) => rowOf(n.n)).filter((r) => r >= 0);
      const target = keys.length ? keys.reduce((a, b) => a + b, 0) / keys.length : Math.max(0, rowOf(60));
      scroll.scrollTop = Math.max(0, target * R.rh - scroll.clientHeight / 2);
    });
    U.editorFrame = (b) => {
      if (ed !== st) return;
      const rel = b - c.start;
      if (ST.tr.playing && rel >= 0 && rel <= c.len) { ph.style.display = 'block'; ph.style.transform = 'translateX(' + (GW + rel * st.ppb) + 'px)'; }
      else ph.style.display = 'none';
    };
  }
  function roundRect(g, x, y, w, hh, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  /* =========================================================
     Audio clip editor
     ========================================================= */
  function drawWave(cv, data, w, hgt, regions, color) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = hgt * dpr; cv.style.height = hgt + 'px';
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#121418'; g.fillRect(0, 0, w, hgt);
    (regions || []).forEach((r) => { g.fillStyle = r.fill; g.fillRect(r.a * w, 0, (r.b - r.a) * w, hgt); });
    g.fillStyle = color || '#3dd6c6';
    const step = data.length / w;
    for (let x = 0; x < w; x++) {
      let m = 0; const o = Math.floor(x * step), e = Math.min(data.length, Math.floor((x + 1) * step));
      for (let k = o; k < e; k += Math.max(1, (e - o) >> 5)) { const v = Math.abs(data[k]); if (v > m) m = v; }
      const hh = Math.max(1, m * (hgt - 6)); g.fillRect(x, (hgt - hh) / 2, 1, hh);
    }
  }
  function audioEditor(body, t, c) {
    const s = ST.lib.samples.get(c.sample);
    if (!s) { body.append(h('div', { class: 'empty-panel' }, h('b', null, 'Missing sound'), h('span', null, 'The sound used by this clip was deleted from your library.'), h('div', { class: 'row' }, clipTools(t, c)))); return; }
    const st = { c, t }; ed = st;
    const cv = h('canvas', { class: 'wave' });
    const ph = h('div', { class: 'roll-ph' });
    const gainOut = h('output', null, Math.round((c.gain == null ? 1 : c.gain) * 100) + '%');
    const swap = async (ch, label) => { const ns = await ST.lib.addRaw(ch, s.sr, s.name + ' (' + label + ')', 'edit'); ST.snap(); c.sample = ns.id; c.name = ns.name; ST.touch(); };
    const tools = h('div', { class: 'ed-tools' },
      h('span', { class: 'pt-name', style: 'color:' + t.color }, '🎙 ' + (c.name || s.name)),
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Clip gain'), h('span', { class: 'sl' }, h('input', { type: 'range', min: 0, max: 2.5, step: 0.05, value: c.gain == null ? 1 : c.gain, oninput: (e) => { c.gain = +e.target.value; gainOut.textContent = Math.round(c.gain * 100) + '%'; ST.autosave(); } }), gainOut)),
      h('button', { class: 'btn xs accent', title: 'Cut, pitch, stretch, burn in effects, make an instrument', onclick: () => VMI.slab.open(s.id, c) }, '🔬 Sound Lab'),
      h('button', { class: 'btn xs accent', title: 'Auto-Tune, robot voice, harmonies, vocoder, melody → instrument', onclick: () => VMI.voice.lab(c) }, '🎤 Voice Lab'),
      h('button', { class: 'btn xs', title: 'Detect the hits in this sound and turn them into drums or a kit', onclick: () => U.beatLab(s.id, c) }, '🥁 Beatbox Lab'),
      c.raw ? h('button', { class: 'btn xs', title: 'Go back to the unprocessed take', onclick: () => { ST.snap(); c.sample = c.raw; delete c.raw; const s0 = ST.lib.samples.get(c.sample); if (s0) c.name = s0.name; ST.touch(); } }, '↺ Original') : null,
      h('button', { class: 'btn xs', title: 'Play this sound at any pitch on a keyboard', onclick: () => U.makeInstrument(s.id) }, '🎹 Make instrument'),
      h('button', { class: 'btn xs', title: 'Make it as loud as possible without clipping', onclick: () => { let m = 0; s.ch.forEach((d) => { for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i])); }); if (m < 1e-4) return; const k = 0.98 / m; swap(s.ch.map((d) => d.map((v) => v * k)), 'loud'); } }, '⇧ Normalize'),
      h('button', { class: 'btn xs', onclick: () => swap(s.ch.map((d) => Float32Array.from(d).reverse()), 'reversed') }, '⇆ Reverse'),
      h('button', { class: 'btn xs', title: 'Play the whole sound', onclick: () => U.previewSample(s.id) }, '▶ Preview'),
      clipTools(t, c),
      h('span', { class: 'muted small hint-inline' }, 'Tip: Mixer → Drive “amplifies” the sound, C = compressor, Reverb/Echo add space.'));
    const wrap = h('div', { class: 'wave-wrap' }, cv, ph);
    body.append(tools, wrap);
    const draw = () => {
      if (ed !== st || !cv.isConnected) return;
      const w = Math.max(200, wrap.clientWidth), dur = s.dur, a = (c.off || 0) / dur, b = Math.min(1, ((c.off || 0) + c.len * ST.spb()) / dur);
      drawWave(cv, s.ch[0], w, Math.max(110, wrap.clientHeight - 4), [{ a, b, fill: '#3dd6c61f' }], t.color);
      st.a = a; st.b = b; st.w = w;
    };
    st.draw = draw;
    requestAnimationFrame(draw);
    U.editorFrame = (beat) => {
      if (ed !== st) return;
      const rel = beat - c.start;
      if (ST.tr.playing && rel >= 0 && rel <= c.len) { ph.style.display = 'block'; const x = (((c.off || 0) + rel * ST.spb()) / s.dur) * st.w; ph.style.transform = 'translateX(' + x + 'px)'; }
      else ph.style.display = 'none';
    };
  }

  /* =========================================================
     Beatbox Lab
     ========================================================= */
  const CLS = ['kick', 'snare', 'hat', 'perc'];
  const CLS_NAME = { kick: 'Kick', snare: 'Snare', hat: 'Hi-hat', perc: 'Perc' };
  const CLS_COL = { kick: '#ff6b81', snare: '#ffb02e', hat: '#3dd6c6', perc: '#8f9bff' };
  const PADMAP = { kick: ['kick'], snare: ['snare', 'clap'], hat: ['hatC'], perc: ['tom2', 'tomH', 'rim', 'tom1'] };

  U.beatLab = (sampleId, clip) => {
    const s = ST.lib.samples.get(sampleId); if (!s) return;
    const data = s.ch[0], sr = s.sr;
    let sens = 0.5, slices = ST.an.slices(data, sr, sens);
    const cv = h('canvas', { class: 'wave lab' });
    const info = h('div', { class: 'lab-info' });
    const list = h('div', { class: 'lab-list' });
    const drumTargets = VMI.instruments.filter((i) => i.layout === 'pads' && !i.custom && i.cfg.pads.some((p) => p.id === 'kick')).sort((x, y) => (y.id === 'drum-kit') - (x.id === 'drum-kit'));
    const target = h('select', { class: 'sel' }, drumTargets.map((i) => h('option', { value: i.id }, i.emoji + ' ' + i.name)));
    const quant = h('select', { class: 'sel' }, h('option', { value: 0.25, selected: true }, '1/16'), h('option', { value: 0.5 }, '1/8'), h('option', { value: 0 }, 'Off'));
    const kitName = h('input', { class: 'txt', value: 'My ' + s.name + ' kit' });
    const playSlice = (sl) => {
      ST.ensure(); A.resume();
      const c = ST.ctx, src = c.createBufferSource(); src.buffer = ST.lib.getBuffer(sampleId);
      src.connect(c.destination); src.start(0, sl.start, sl.end - sl.start);
    };
    const draw = () => {
      const w = Math.max(300, cv.parentElement ? cv.parentElement.clientWidth : 640), dur = s.dur;
      drawWave(cv, data, w, 150, slices.map((sl) => ({ a: sl.start / dur, b: sl.end / dur, fill: CLS_COL[sl.cls] + '33' })), '#cfd6e4');
      const g = cv.getContext('2d');
      slices.forEach((sl) => { g.fillStyle = CLS_COL[sl.cls]; g.fillRect((sl.start / dur) * w, 0, 2, 150); g.font = '700 10px system-ui'; g.fillText(CLS_NAME[sl.cls][0], (sl.start / dur) * w + 4, 12); });
      const cnt = {}; slices.forEach((sl) => { cnt[sl.cls] = (cnt[sl.cls] || 0) + 1; });
      info.textContent = slices.length ? 'Found ' + slices.length + ' hits — ' + CLS.filter((k) => cnt[k]).map((k) => cnt[k] + ' ' + CLS_NAME[k].toLowerCase() + (cnt[k] > 1 ? 's' : '')).join(', ') + '. Click a hit to hear it; change its type if the guess is wrong.' : 'No hits found — raise the sensitivity, or record louder / closer to the mic.';
      list.innerHTML = '';
      slices.forEach((sl, i) => list.append(h('div', { class: 'lab-row', style: '--c:' + CLS_COL[sl.cls] },
        h('button', { class: 'btn xs icon', onclick: () => playSlice(sl) }, '▶'),
        h('span', null, '#' + (i + 1) + ' · ' + sl.start.toFixed(2) + 's'),
        h('select', { class: 'sel', onchange: (e) => { sl.cls = e.target.value; draw(); } }, CLS.map((k) => h('option', { value: k, selected: sl.cls === k }, CLS_NAME[k]))))));
    };
    cv.addEventListener('pointerdown', (e) => {
      const r = cv.getBoundingClientRect(), tt = ((e.clientX - r.left) / r.width) * s.dur;
      const sl = slices.find((x) => tt >= x.start && tt < x.end); if (!sl) return;
      if (e.shiftKey || e.button === 2) { sl.cls = CLS[(CLS.indexOf(sl.cls) + 1) % CLS.length]; draw(); } else playSlice(sl);
    });
    const startBeat = () => clip ? clip.start - (clip.off || 0) / ST.spb() : Math.floor(ST.curBeat() / 4) * 4;
    const toDrums = () => {
      if (!slices.length) return;
      const inst = VMI.byId[target.value], spb = ST.spb(), q = +quant.value, sb = startBeat();
      const mx = Math.max.apply(null, slices.map((x) => x.peak)) || 1;
      const notes = [];
      slices.forEach((sl) => {
        const pid = PADMAP[sl.cls].find((id) => inst.cfg.pads.some((p) => p.id === id)); if (!pid) return;
        let b = sb + sl.start / spb; if (q) b = Math.round(b / q) * q;
        if (b < 0) return;
        notes.push({ t: b, d: 0.2, n: pid, v: clamp(0.45 + 0.55 * (sl.peak / mx), 0.3, 1) });
      });
      if (!notes.length) return;
      ST.snap();
      const tr = ST.addTrack({ inst: inst.id }); tr.name = 'Beatbox → ' + inst.name;
      const a = Math.floor(Math.min.apply(null, notes.map((n) => n.t)) / 4) * 4, b = Math.ceil((Math.max.apply(null, notes.map((n) => n.t)) + 0.25) / 4) * 4;
      ST.ensureBars(b); const cl = ST.mergeNotes(tr, a, Math.max(b, a + 4), notes);
      ST.selClip = cl.id; ST.touch(); ST.emit('selection');
      m.close(); U.toast('Created a ' + inst.name + ' track from your beatbox — mute the original to hear only the drums');
    };
    const toKit = () => {
      if (!slices.length) return;
      const num = {};
      const def = { id: ST.uid('i_'), type: 'kit', name: kitName.value.trim() || 'My kit', emoji: '🗣️', pads: slices.slice(0, 16).map((sl, i) => { num[sl.cls] = (num[sl.cls] || 0) + 1; return { id: 'p' + i, label: CLS_NAME[sl.cls] + ' ' + num[sl.cls], cls: sl.cls, sample: sampleId, start: sl.start, end: sl.end }; }) };
      ST.registerInstrument(def);
      U.addInstTrack(def.id); m.close();
      U.toast('“' + def.name + '” is now an instrument — play the pads with Q W E R / A S D F…');
    };
    const sensIn = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: sens, oninput: (e) => { sens = +e.target.value; slices = ST.an.slices(data, sr, sens); draw(); } });
    const body = h('div', { class: 'lab' },
      h('p', { class: 'muted small' }, 'Beatbox Lab finds each hit in your recording and guesses whether it is a kick (“b”, “boom”), a snare (“k”, “pf”) or a hi-hat (“ts”, “t”). Then turn it into a real drum track, or into your own drum kit made of your voice.'),
      h('div', { class: 'lab-wave' }, cv),
      h('div', { class: 'lab-ctrl' },
        h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Sensitivity'), sensIn),
        h('button', { class: 'btn xs', onclick: () => U.previewSample(sampleId) }, '▶ Play all')),
      info, list,
      h('div', { class: 'lab-actions' },
        h('div', { class: 'lab-card' }, h('b', null, '🥁 Turn into a drum track'), h('span', { class: 'muted small' }, 'Each hit becomes a real drum note at the same time, snapped to the grid.'),
          h('div', { class: 'row' }, target, h('span', { class: 'flabel' }, 'Snap'), quant), h('button', { class: 'btn accent', onclick: toDrums }, 'Create drum track')),
        h('div', { class: 'lab-card' }, h('b', null, '🗣️ Make a kit from my voice'), h('span', { class: 'muted small' }, 'Each hit becomes a pad you can play and sequence (up to 16).'),
          kitName, h('button', { class: 'btn accent', onclick: toKit }, 'Create my kit')),
        h('div', { class: 'lab-card' }, h('b', null, '🎹 Melodic instrument'), h('span', { class: 'muted small' }, 'Play the whole sound at any pitch — great for hums, whistles and sung notes.'),
          h('button', { class: 'btn', onclick: () => { m.close(); U.makeInstrument(sampleId); } }, 'Make instrument…'))));
    const m = U.modal('Beatbox Lab — ' + s.name, body, { cls: 'wide' });
    requestAnimationFrame(draw);
  };

  /* =========================================================
     Sampler instrument maker
     ========================================================= */
  U.makeInstrument = (sampleId, rootGuess, centsGuess) => {
    const s = ST.lib.samples.get(sampleId); if (!s) return;
    const name = h('input', { class: 'txt', value: s.name + ' synth' });
    const root = h('select', { class: 'sel' });
    let guess = rootGuess, cents = centsGuess || 0;
    if (guess == null && VMI.slab) { const d = VMI.slab.detect(s.ch[0], s.sr); guess = d ? d.midi : 60; cents = d ? d.cents : 0; }
    for (let m = 24; m <= 96; m++) root.append(h('option', { value: m, selected: m === (guess || 60) }, A.m2n(m)));
    const loop = h('input', { type: 'checkbox', class: 'sw' });
    const gate = h('input', { type: 'checkbox', class: 'sw', checked: true });
    const body = h('div', { class: 'form' },
      h('p', { class: 'muted small' }, 'Your sound becomes a keyboard instrument: each key plays it higher or lower, so a “beep” becomes a full melody instrument. The original note was detected automatically' + (guess ? ' (' + A.m2n(guess) + ')' : '') + ' so it plays in tune. Attack, release, fine tune and loop can be changed later in the Play panel.'),
      h('label', { class: 'field col' }, h('span', { class: 'flabel' }, 'Name'), name),
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Original note'), root),
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Stop when key is released'), gate),
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Loop while held (pads, drones)'), loop),
      h('div', { class: 'row' }, h('button', { class: 'btn accent', onclick: () => {
        const def = { id: ST.uid('i_'), type: 'sampler', name: name.value.trim() || 'My instrument', sample: sampleId, root: +root.value, loop: loop.checked, gate: gate.checked, start: 0, end: s.dur, emoji: '🎙️', cents: +root.value === guess ? cents : 0 };
        ST.registerInstrument(def); U.addInstTrack(def.id); m.close();
        U.toast('“' + def.name + '” added — play it with your keyboard');
      } }, 'Create instrument')));
    const m = U.modal('Make an instrument from “' + s.name + '”', body);
  };

  /* =========================================================
     Quick recorder (for the library)
     ========================================================= */
  U.quickRec = () => {
    let raf = 0, t0 = 0, last = null;
    const meter = h('div', { class: 'qmeter' }, h('i'));
    const timer = h('div', { class: 'qtime' }, '0.0 s');
    const status = h('div', { class: 'muted small' }, 'Press Record, then sing, speak, beatbox or play something into your microphone. Headphones help avoid echo.');
    const after = h('div', { class: 'qafter' });
    const btn = h('button', { class: 'qbtn', onclick: async () => {
      if (!ST.quick.on) {
        try { await ST.quickStart(); } catch (e) { status.textContent = '⚠ ' + (e.message || 'Microphone permission was denied') + '. Allow the microphone in your browser and try again.'; return; }
        t0 = performance.now(); btn.classList.add('on'); btn.textContent = '■ Stop'; after.innerHTML = ''; status.textContent = 'Recording…';
      } else {
        btn.classList.remove('on'); btn.textContent = '● Record';
        const sNew = await ST.quickStop('Recording ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        if (!sNew) { status.textContent = 'Nothing was captured — check that the right microphone is selected.'; return; }
        last = sNew; status.textContent = 'Saved to My Library as “' + sNew.name + '”.';
        after.append(
          h('button', { class: 'btn', onclick: () => U.previewSample(last.id) }, '▶ Listen'),
          h('button', { class: 'btn accent', onclick: () => { m.close(); VMI.slab.open(last.id); } }, '🔬 Sound Lab'),
          h('button', { class: 'btn accent', onclick: () => { m.close(); U.beatLab(last.id); } }, '🥁 Beatbox Lab'),
          h('button', { class: 'btn', onclick: () => { m.close(); U.makeInstrument(last.id); } }, '🎹 Make instrument'),
          h('button', { class: 'btn', onclick: () => { m.close(); U.addSampleTrack(last.id); } }, '+ Add to song'));
      }
    } }, '● Record');
    const loop = () => {
      raf = requestAnimationFrame(loop);
      meter.firstChild.style.width = Math.min(100, Math.pow(ST.micLevel(), 0.5) * 100) + '%';
      if (ST.quick.on) timer.textContent = ((performance.now() - t0) / 1000).toFixed(1) + ' s';
    };
    const m = U.modal('Record a sound', h('div', { class: 'qrec' }, status, h('div', { class: 'qrow' }, btn, h('div', { class: 'qcol' }, timer, meter)), after), {
      onclose: () => { cancelAnimationFrame(raf); if (ST.quick.on) ST.quickStop('Recording'); if (!ST.rec.on) setTimeout(() => ST.micClose(), 100); },
    });
    ST.micOpen().then(() => { loop(); }).catch((e) => { status.textContent = '⚠ ' + (e.message || 'Microphone permission was denied'); });
  };
})();
