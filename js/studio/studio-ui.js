/* studio-ui.js — studio shell: transport, browser, arrangement, play panel, mixer */
(function () {
  'use strict';
  const VMI = window.VMI, A = VMI.audio, ST = VMI.st;
  const U = (VMI.sui = { ppb: 40, tab: 'play', open: false });
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  let HEAD = 210;
  const touch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'style') e.style.cssText = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
        else if (v === true) e.setAttribute(k, '');
        else e.setAttribute(k, v);
      }
    }
    kids.flat(2).forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  }
  U.h = h; U.$ = $; U.$$ = $$; U.touch = touch;

  /* ---------- small UI helpers ---------- */
  U.toast = (msg, kind) => {
    const box = $('#toasts'); if (!box) return;
    const t = h('div', { class: 'toast ' + (kind || '') }, msg); box.append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
  };
  ST.on('toast', (o) => U.toast(o.msg, o.kind));

  U.modal = (title, body, opts) => {
    opts = opts || {};
    const close = () => { back.remove(); if (opts.onclose) opts.onclose(); };
    const card = h('div', { class: 'modal ' + (opts.cls || '') },
      h('div', { class: 'modal-h' }, h('b', null, title), h('button', { class: 'btn icon sm', onclick: close, 'aria-label': 'Close' }, '✕')),
      h('div', { class: 'modal-b' }, body));
    const back = h('div', { class: 'modal-back', onpointerdown: (e) => { if (e.target === back) close(); } }, card);
    document.body.append(back);
    return { close, card, body };
  };
  U.menu = (anchor, items) => {
    $$('.popmenu').forEach((m) => m.remove());
    const r = anchor.getBoundingClientRect();
    const m = h('div', { class: 'popmenu' });
    items.forEach((it) => {
      if (it === '-') return m.append(h('hr'));
      m.append(h('button', { class: 'pm-item' + (it.danger ? ' danger' : ''), onclick: () => { m.remove(); it.fn(); } }, it.label, it.hint ? h('kbd', null, it.hint) : null));
    });
    document.body.append(m);
    const w = m.offsetWidth, hh = m.offsetHeight;
    m.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left)) + 'px';
    m.style.top = (r.bottom + hh + 8 > innerHeight ? Math.max(6, r.top - hh - 4) : r.bottom + 4) + 'px';
    const off = (e) => { if (!m.contains(e.target)) { m.remove(); removeEventListener('pointerdown', off, true); } };
    setTimeout(() => addEventListener('pointerdown', off, true), 0);
  };
  U.inlineEdit = (el, value, cb) => {
    const inp = h('input', { class: 'inline-edit', value });
    el.replaceWith(inp); inp.focus(); inp.select();
    const done = (ok) => { if (!inp.isConnected) return; if (ok && inp.value.trim()) cb(inp.value.trim()); else cb(null); };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); });
    inp.addEventListener('blur', () => done(true));
  };
  const fmtTime = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return m + ':' + (s % 60).toFixed(1).padStart(4, '0'); };
  U.fmtTime = fmtTime;
  const selClip = () => { const f = ST.selClip && ST.findClip(ST.selClip); return f || null; };
  U.selClip = selClip;

  /* =========================================================
     Clip operations
     ========================================================= */
  const ops = (U.ops = {
    del(id) {
      const f = ST.findClip(id); if (!f) return;
      ST.snap(); f.t.clips = f.t.clips.filter((c) => c.id !== id);
      if (ST.selClip === id) ST.selClip = null;
      ST.touch(); ST.emit('selection');
    },
    dup(id) {
      const f = ST.findClip(id); if (!f) return;
      ST.snap();
      const c = JSON.parse(JSON.stringify(f.c)); c.id = ST.uid('c_'); c.start = f.c.start + f.c.len;
      f.t.clips.push(c); ST.ensureBars(c.start + c.len); ST.selClip = c.id; ST.touch(); ST.emit('selection');
    },
    split(id, beat) {
      const f = ST.findClip(id); if (!f) return;
      const c = f.c; beat = Math.round(beat * 4) / 4;
      if (beat <= c.start + 0.25 || beat >= c.start + c.len - 0.25) return ST.toast('Move the playhead inside the clip to split it', 'warn');
      ST.snap();
      const rel = beat - c.start, d = JSON.parse(JSON.stringify(c)); d.id = ST.uid('c_');
      d.start = beat; d.len = c.len - rel;
      if (c.sample) { d.off = (c.off || 0) + rel * ST.spb(); } else {
        d.notes = c.notes.filter((n) => n.t >= rel).map((n) => ({ t: n.t - rel, d: n.d, n: n.n, v: n.v }));
        c.notes = c.notes.filter((n) => n.t < rel).map((n) => ({ t: n.t, d: Math.min(n.d, rel - n.t), n: n.n, v: n.v }));
      }
      c.len = rel; f.t.clips.push(d); ST.touch();
    },
  });

  /* =========================================================
     Build the shell
     ========================================================= */
  U.build = () => {
    const root = $('#studio'); root.innerHTML = '';
    root.append(buildTop(), h('div', { class: 'st-main' }, buildBrowser(), buildArr()), buildBottom(), h('div', { id: 'toasts', class: 'toasts' }));
    U.renderBrowser(); U.renderArr(); U.renderBottom(); U.updateTransport();
  };

  /* ---------- top bar ---------- */
  function buildTop() {
    const iconBtn = (id, label, title, fn, cls) => h('button', { id, class: 'btn tbtn ' + (cls || ''), title, onclick: fn, 'aria-label': title }, label);
    return h('header', { class: 'st-top' },
      h('a', { class: 'btn tbtn', href: '#/', title: 'Home' }, h('span', { class: 'ic' }, '⌂')),
      h('button', { id: 'btnSide', class: 'btn tbtn only-narrow', title: 'Sounds & library', onclick: () => $('.st-browser').classList.toggle('open') }, '☰'),
      h('input', { id: 'prjName', class: 'prj-name', value: ST.proj().name, 'aria-label': 'Project name', onchange: (e) => { ST.proj().name = e.target.value || 'Untitled song'; ST.autosave(); } }),
      h('button', { id: 'btnFile', class: 'btn tbtn', onclick: (e) => fileMenu(e.currentTarget) }, 'File ▾'),
      h('div', { class: 'tgroup', id: 'tr-transport' },
        iconBtn('btnRew', '⏮', 'Go to start (Home)', () => ST.seek(0)),
        iconBtn('btnPlay', '▶', 'Play / pause (Space)', () => ST.toggle(), 'play'),
        iconBtn('btnStop', '■', 'Stop and return to start', () => { ST.stop(); ST.seek(0); }),
        iconBtn('btnRec', '●', 'Record on the armed track', () => ST.record(), 'rec'),
        iconBtn('btnLoop', '⟲', 'Loop (the loop range is set on the ruler)', () => { const p = ST.proj(); p.loop.on = !p.loop.on; ST.touch(); U.updateTransport(); })),
      h('div', { class: 'lcd', id: 'lcd', title: 'Position' }, h('b', { id: 'lcdPos' }, '001.1'), h('small', { id: 'lcdTime' }, '0:00.0')),
      h('div', { class: 'tgroup bpmbox' },
        h('span', { class: 'lbl' }, 'BPM'),
        h('button', { class: 'btn tbtn sm', onclick: () => ST.setBpm(ST.proj().bpm - 1) }, '−'),
        h('input', { id: 'bpmIn', class: 'num', type: 'number', min: 40, max: 220, value: ST.proj().bpm, onchange: (e) => ST.setBpm(+e.target.value) }),
        h('button', { class: 'btn tbtn sm', onclick: () => ST.setBpm(ST.proj().bpm + 1) }, '+')),
      h('div', { class: 'tgroup' },
        h('button', { id: 'btnMetro', class: 'btn tbtn', title: 'Metronome', onclick: () => { ST.tr.metro = !ST.tr.metro; A.resume(); U.updateTransport(); } }, '♩ Metro'),
        h('button', { id: 'btnCount', class: 'btn tbtn', title: 'Count-in bar before recording', onclick: () => { ST.tr.countIn = !ST.tr.countIn; U.updateTransport(); } }, 'Count-in')),
      h('div', { class: 'tgroup hide-narrow' },
        h('span', { class: 'lbl' }, 'Bars'),
        h('button', { class: 'btn tbtn sm', onclick: () => { const p = ST.proj(); p.bars = Math.max(4, p.bars - 4); p.loop.end = Math.min(p.loop.end, p.bars * 4); ST.touch(); } }, '−'),
        h('b', { id: 'barsVal', class: 'val' }, ST.proj().bars),
        h('button', { class: 'btn tbtn sm', onclick: () => { const p = ST.proj(); p.bars = Math.min(128, p.bars + 4); ST.touch(); } }, '+'),
        h('span', { class: 'lbl' }, 'Snap'),
        h('select', { id: 'quantSel', class: 'sel', title: 'Quantize recorded notes', onchange: (e) => { ST.quant = +e.target.value; } },
          h('option', { value: '0' }, 'Off'), h('option', { value: '0.5' }, '1/8'), h('option', { value: '0.25', selected: true }, '1/16'))),
      h('div', { class: 'tgroup' },
        h('button', { class: 'btn tbtn', title: 'Undo (Ctrl+Z)', onclick: () => ST.undo() }, '↶'),
        h('button', { class: 'btn tbtn', title: 'Redo (Ctrl+Shift+Z)', onclick: () => ST.redo() }, '↷'),
        h('button', { id: 'btnHelp', class: 'btn tbtn accent', title: 'Tutorials', onclick: () => VMI.tour.menu() }, '? Learn')));
  }
  function fileMenu(anchor) {
    U.menu(anchor, [
      { label: 'New project…', fn: newDialog },
      { label: 'Open saved project…', fn: openDialog },
      { label: 'Save', hint: 'Ctrl+S', fn: () => ST.saveAs() },
      '-',
      { label: 'Export mixdown (WAV)', fn: () => exportWav(false) },
      { label: 'Export loop range (WAV)', fn: () => exportWav(true) },
    ]);
  }
  function newDialog() {
    const m = U.modal('New project', h('div', { class: 'tpl-list' }, ST.templates.map(([id, name, desc]) =>
      h('button', { class: 'tpl', onclick: () => { m.close(); ST.newProject(id === 'blank' ? null : id); } }, h('b', null, name), h('span', null, desc)))));
  }
  async function openDialog() {
    const list = await ST.listProjects();
    const body = h('div', { class: 'tpl-list' }, list.length ? list.map((p) => h('div', { class: 'tpl row' },
      h('button', { class: 'tpl-open', onclick: () => { m.close(); ST.openProject(p.id); } }, h('b', null, p.name), h('span', null, new Date(p.saved).toLocaleString())),
      h('button', { class: 'btn sm danger', onclick: async (e) => { await ST.deleteProject(p.id); e.target.closest('.tpl').remove(); } }, 'Delete'))) : h('p', { class: 'muted' }, 'No saved projects yet. Use File → Save.'));
    const m = U.modal('Open project', body);
  }
  async function exportWav(loopOnly) {
    U.toast('Rendering mixdown…');
    try {
      const blob = await ST.exportWav(loopOnly); if (!blob) return;
      const a = h('a', { href: URL.createObjectURL(blob), download: (ST.proj().name || 'song').replace(/[^\w\- ]+/g, '') + '.wav' });
      document.body.append(a); a.click(); a.remove();
      U.toast('Exported ' + Math.round(blob.size / 1024) + ' KB WAV');
    } catch (e) { console.error(e); U.toast('Export failed: ' + e.message, 'warn'); }
  }
  U.exportWav = exportWav;

  U.updateTransport = () => {
    const P = ST.proj(); if (!P || !$('#btnPlay')) return;
    $('#btnPlay').textContent = ST.tr.playing ? '⏸' : '▶'; $('#btnPlay').classList.toggle('active', ST.tr.playing);
    $('#btnRec').classList.toggle('active', ST.rec.on);
    $('#btnLoop').classList.toggle('active', P.loop.on);
    $('#btnMetro').classList.toggle('active', ST.tr.metro);
    $('#btnCount').classList.toggle('active', ST.tr.countIn);
    $('#bpmIn').value = P.bpm; $('#barsVal').textContent = P.bars; $('#prjName').value = P.name;
  };
  ST.on('transport', () => U.updateTransport());

  /* =========================================================
     Browser: Sounds / Library / Patterns
     ========================================================= */
  let bTab = 'sounds', soundQ = '';
  function buildBrowser() {
    const tabs = ['sounds', 'library', 'patterns'].map((t) => h('button', { class: 'bt', 'data-t': t, id: 'bt-' + t, onclick: () => { bTab = t; U.renderBrowser(); } }, { sounds: 'Sounds', library: 'My Library', patterns: 'Patterns' }[t]));
    return h('aside', { class: 'st-browser', id: 'st-browser' },
      h('div', { class: 'bt-tabs' }, tabs, h('button', { class: 'btn icon sm only-narrow', onclick: () => $('.st-browser').classList.remove('open') }, '✕')),
      h('div', { class: 'bt-body', id: 'btBody' }));
  }
  U.renderBrowser = () => {
    $$('.bt').forEach((b) => b.classList.toggle('active', b.dataset.t === bTab));
    const body = $('#btBody'); if (!body) return;
    const keep = body.scrollTop; body.innerHTML = '';
    if (bTab === 'sounds') renderSounds(body); else if (bTab === 'library') renderLibrary(body); else renderPatterns(body);
    body.scrollTop = keep;
  };
  ST.on('lib', () => { if (U.open && bTab === 'library') U.renderBrowser(); });
  ST.on('instruments', () => { if (U.open && bTab === 'sounds') U.renderBrowser(); });

  function addInstTrack(id) {
    ST.snap(); const t = ST.addTrack({ inst: id }); ST.touch(); ST.emit('selection');
    U.toast('Added “' + t.name + '” — play it with your keyboard or the panel below');
    setTimeout(() => { const r = $('[data-track="' + t.id + '"]'); if (r && r.scrollIntoView) r.scrollIntoView({ block: 'nearest' }); }, 30);
    $('.st-browser').classList.remove('open');
  }
  U.addInstTrack = addInstTrack;
  function renderSounds(body) {
    const q = h('input', { class: 'search', type: 'search', placeholder: 'Search sounds…', value: soundQ, oninput: (e) => { soundQ = e.target.value.toLowerCase(); fill(); } });
    const list = h('div', { class: 'snd-list' });
    const fill = () => {
      list.innerHTML = '';
      VMI.cats.forEach((cat) => {
        const items = VMI.instruments.filter((i) => i.cat === cat.id && (!soundQ || i.name.toLowerCase().includes(soundQ)));
        if (!items.length) return;
        list.append(h('div', { class: 'snd-cat', style: '--c:' + cat.color }, cat.name));
        items.forEach((i) => list.append(h('button', { class: 'snd', title: i.desc, onclick: () => addInstTrack(i.id) },
          h('span', { class: 'se' }, i.emoji), h('span', { class: 'sn' }, i.name), h('span', { class: 'sp' }, '+'))));
      });
    };
    fill(); body.append(q, list);
  }
  function previewSample(id) {
    ST.ensure(); A.resume();
    const buf = ST.lib.getBuffer(id); if (!buf) return;
    const c = ST.ctx, s = c.createBufferSource(); s.buffer = buf;
    const g = c.createGain(); g.gain.value = 0.9; s.connect(g); g.connect(c.destination); s.start();
    s.onended = () => g.disconnect();
    return s;
  }
  U.previewSample = previewSample;
  function addSampleTrack(id, beat) {
    const s = ST.lib.samples.get(id); if (!s) return;
    ST.snap();
    const t = ST.addTrack({ type: 'audio', name: s.name });
    const start = beat == null ? Math.floor(ST.curBeat() / 4) * 4 : beat;
    const len = s.dur / ST.spb();
    ST.ensureBars(start + len);
    const c = ST.addClip(t, start, len, []); c.sample = s.id; c.off = 0; c.gain = 1; c.name = s.name;
    ST.selClip = c.id; ST.touch(); ST.emit('selection');
  }
  U.addSampleTrack = addSampleTrack;
  function renderLibrary(body) {
    const file = h('input', { type: 'file', accept: 'audio/*', multiple: true, class: 'hidden', onchange: async (e) => {
      for (const f of e.target.files) { try { await ST.lib.importFile(f); } catch (err) { U.toast('Could not read ' + f.name, 'warn'); } }
      e.target.value = '';
    } });
    body.append(
      h('div', { class: 'lib-actions' },
        h('button', { class: 'btn accent', id: 'btnQuickRec', onclick: () => U.quickRec() }, '● Record sound'),
        h('button', { class: 'btn', onclick: () => file.click() }, '⬆ Import audio'), file),
      h('p', { class: 'muted small' }, 'Record your voice or beatbox, or import audio files. Everything is saved in your browser.'));
    const samples = Array.from(ST.lib.samples.values()).sort((a, b) => b.created - a.created);
    const list = h('div', { class: 'lib-list' });
    if (!samples.length) list.append(h('div', { class: 'empty-note' }, 'No sounds yet — hit “Record sound” and try a beatbox loop!'));
    samples.forEach((s) => {
      const name = h('span', { class: 'ln', title: 'Double-click to rename', ondblclick: (e) => U.inlineEdit(e.target, s.name, (v) => { if (v) ST.lib.rename(s.id, v); else U.renderBrowser(); }) }, s.name);
      list.append(h('div', { class: 'lib-item', draggable: true, ondragstart: (e) => { e.dataTransfer.setData('text/plain', 'vmi-sample:' + s.id); e.dataTransfer.effectAllowed = 'copy'; } },
        h('div', { class: 'li-top' }, h('button', { class: 'btn sm icon', title: 'Preview', onclick: () => previewSample(s.id) }, '▶'), name, h('small', null, s.dur.toFixed(1) + 's')),
        h('div', { class: 'li-btns' },
          h('button', { class: 'btn sm', title: 'Add to a new audio track at the playhead', onclick: () => addSampleTrack(s.id) }, '+ Track'),
          h('button', { class: 'btn sm', title: 'Detect hits and turn beatbox into drums', onclick: () => U.beatLab(s.id) }, '🥁 Beatbox Lab'),
          h('button', { class: 'btn sm', title: 'Play this sound on a keyboard', onclick: () => U.makeInstrument(s.id) }, '🎹 Instrument'),
          h('button', { class: 'btn sm danger', title: 'Delete', onclick: () => { if (confirm('Delete “' + s.name + '”? Clips using it will go silent.')) ST.lib.remove(s.id); } }, '🗑'))));
    });
    body.append(list);
    const mine = ST.lib.defs;
    if (mine.length) {
      body.append(h('div', { class: 'snd-cat', style: '--c:#ff8fd1' }, 'My instruments'));
      mine.forEach((d) => body.append(h('div', { class: 'snd mine' },
        h('button', { class: 'snd-main', onclick: () => addInstTrack(d.id) }, h('span', { class: 'se' }, d.emoji || (d.type === 'kit' ? '🥁' : '🎙️')), h('span', { class: 'sn' }, d.name), h('span', { class: 'sp' }, '+')),
        h('button', { class: 'btn sm danger', onclick: () => { if (confirm('Delete instrument “' + d.name + '”?')) ST.removeInstrument(d.id); } }, '🗑'))));
    }
  }
  function renderPatterns(body) {
    body.append(h('p', { class: 'muted small' }, 'Select a track, move the playhead, then insert a ready-made pattern. Drum patterns need a drum track.'));
    const kinds = { drums: '🥁', bass: '🎸', chords: '🎹', melody: '🎵' };
    ST.patterns.forEach((p) => body.append(h('div', { class: 'pat' },
      h('span', { class: 'pk' }, kinds[p.kind]), h('span', { class: 'pn' }, p.name, h('small', null, p.bars + (p.bars > 1 ? ' bars' : ' bar'))),
      h('button', { class: 'btn sm', onclick: () => { const t = ST.track(ST.selTrack); if (!t) return ST.toast('Add or select a track first', 'warn'); ST.insertPattern(t, p, ST.curBeat()); } }, 'Insert'))));
  }

  /* =========================================================
     Arrangement
     ========================================================= */
  let arrScroll, arrInner;
  function buildArr() {
    arrInner = h('div', { class: 'arr-inner', id: 'arrInner' });
    arrScroll = h('div', { class: 'arr-scroll', id: 'arrScroll' }, arrInner);
    const zoom = h('input', { type: 'range', min: 16, max: 96, step: 4, value: U.ppb, class: 'zoom', title: 'Zoom', oninput: (e) => { U.ppb = +e.target.value; U.renderArr(); } });
    return h('section', { class: 'st-arr', id: 'st-arr' }, arrScroll, h('div', { class: 'arr-zoom' }, '🔍', zoom));
  }
  const peaksCache = new Map();
  function peaks(sampleId, n) {
    const key = sampleId + ':' + n, got = peaksCache.get(key); if (got) return got;
    const s = ST.lib.samples.get(sampleId); if (!s) return null;
    const d = s.ch[0], step = Math.max(1, Math.floor(d.length / n)), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { let m = 0; const o = i * step; for (let k = 0; k < step; k += Math.max(1, step >> 4)) { const v = Math.abs(d[o + k] || 0); if (v > m) m = v; } out[i] = m; }
    peaksCache.set(key, out); if (peaksCache.size > 200) peaksCache.clear();
    return out;
  }
  U.peaks = peaks;
  function drawPreview(cv, tr, cl, w, hgt) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.floor(w * dpr)); cv.height = Math.floor(hgt * dpr);
    const g = cv.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, hgt);
    g.fillStyle = 'rgba(255,255,255,.85)';
    if (cl.sample) {
      const s = ST.lib.samples.get(cl.sample); if (!s) return;
      const n = Math.max(8, Math.floor(w / 2)), spb = ST.spb();
      const total = s.dur, a = (cl.off || 0) / total, b = Math.min(1, ((cl.off || 0) + cl.len * spb) / total);
      const pk = peaks(cl.sample, Math.max(16, Math.round(n / Math.max(0.05, b - a))));
      if (!pk) return;
      const i0 = Math.floor(a * pk.length), i1 = Math.ceil(b * pk.length);
      for (let x = 0; x < n; x++) { const v = pk[i0 + Math.floor((x / n) * (i1 - i0))] || 0; const hh = Math.max(1, v * (hgt - 4)); g.fillRect(x * (w / n), (hgt - hh) / 2, Math.max(1, w / n - 0.5), hh); }
    } else if (cl.notes.length) {
      const inst = VMI.byId[tr.inst], pads = inst && inst.layout === 'pads';
      let lo = 127, hi = 0;
      cl.notes.forEach((nt) => { const v = pads ? (inst.cfg.pads.findIndex((p) => p.id === nt.n)) : nt.n; if (v < lo) lo = v; if (v > hi) hi = v; });
      const span = Math.max(pads ? 3 : 11, hi - lo), nh = Math.min(5, Math.max(2, (hgt - 8) / (span + 1)));
      cl.notes.forEach((nt) => {
        const v = pads ? inst.cfg.pads.findIndex((p) => p.id === nt.n) : nt.n;
        const y = 4 + (hi - v) * ((hgt - 8 - nh) / span);
        g.fillRect((nt.t / cl.len) * w, y, Math.max(2, (nt.d / cl.len) * w - 1), nh);
      });
    }
  }
  U.renderArr = () => {
    if (!arrInner) return;
    const P = ST.proj(), ppb = U.ppb, W = P.bars * 4 * ppb;
    HEAD = innerWidth < 700 ? 132 : 210;
    const sl = arrScroll.scrollLeft, st = arrScroll.scrollTop;
    arrInner.innerHTML = ''; arrInner.style.width = HEAD + W + 'px'; arrInner.style.setProperty('--ppb', ppb + 'px');
    // ruler
    const ruler = h('div', { class: 'ruler' }, h('div', { class: 'corner' }, 'Tracks'));
    const rl = h('div', { class: 'rl', style: 'width:' + W + 'px' });
    for (let b = 0; b < P.bars; b++) rl.append(h('span', { class: 'bar', style: 'left:' + b * 4 * ppb + 'px' }, b + 1));
    const loopReg = h('div', { class: 'loopreg' + (P.loop.on ? ' on' : ''), style: `left:${P.loop.start * ppb}px;width:${(P.loop.end - P.loop.start) * ppb}px` });
    rl.append(loopReg, h('div', { class: 'rl-seek' }), h('div', { class: 'rl-loop', title: 'Drag here to set the loop range' }));
    bindRuler(rl);
    ruler.append(rl); arrInner.append(ruler);
    // tracks
    P.tracks.forEach((t) => arrInner.append(trackRow(t, W)));
    // add rows
    arrInner.append(h('div', { class: 'addrow' },
      h('div', { class: 'ah' },
        h('button', { class: 'btn sm', id: 'add-track', onclick: () => { bTab = 'sounds'; U.renderBrowser(); $('.st-browser').classList.add('open'); $('.search') && $('.search').focus(); } }, '+ Instrument track'),
        h('button', { class: 'btn sm', id: 'add-audio', onclick: () => { ST.snap(); const t = ST.addTrack({ type: 'audio', name: 'Voice' }); ST.touch(); ST.emit('selection'); U.toast('Audio track added — arm it and press ● to record your mic'); } }, '+ Audio / voice track')),
      h('div', { class: 'alane drop', style: 'width:' + W + 'px', ondragover: (e) => e.preventDefault(), ondrop: (e) => { const d = e.dataTransfer.getData('text/plain'); if (d.startsWith('vmi-sample:')) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); addSampleTrack(d.slice(11), Math.max(0, Math.round((e.clientX - r.left) / ppb))); } } }, 'Drop a sound here to make a new audio track')));
    arrInner.append(h('div', { class: 'playhead', id: 'playhead' }));
    arrScroll.scrollLeft = sl; arrScroll.scrollTop = st;
    U.markSelection();
    if ($('#barsVal')) $('#barsVal').textContent = P.bars;
  };
  ST.on('project', () => { if (U.open) { U.renderArr(); if (U.tab === 'mixer') U.renderBottom(); U.refreshEditor && U.refreshEditor(); } });

  function bindRuler(rl) {
    const beatAt = (e) => { const r = rl.getBoundingClientRect(); return Math.max(0, (e.clientX - r.left) / U.ppb); };
    rl.addEventListener('pointerdown', (e) => {
      const inLoop = e.target.classList.contains('rl-loop');
      const b0 = beatAt(e);
      if (!inLoop) { ST.seek(Math.round(b0 * 4) / 4); const mv = (ev) => ST.seek(Math.round(beatAt(ev) * 4) / 4); const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); return; }
      const P = ST.proj(), a = Math.floor(b0 / 4) * 4; let moved = false;
      const mv = (ev) => { const b = beatAt(ev), s = Math.min(a, Math.floor(b / 4) * 4), en = Math.max(a + 4, Math.ceil(b / 4) * 4); if (!moved) { ST.snap(); moved = true; } P.loop.start = s; P.loop.end = Math.min(en, P.bars * 4); P.loop.on = true; const el = $('.loopreg'); el.className = 'loopreg on'; el.style.left = s * U.ppb + 'px'; el.style.width = (P.loop.end - s) * U.ppb + 'px'; };
      const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) { ST.touch(); U.updateTransport(); } else { P.loop.on = !P.loop.on; ST.touch(); U.updateTransport(); } };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
  }

  function trackRow(t, W) {
    const inst = VMI.byId[t.inst];
    const name = h('span', { class: 'tn', title: 'Double-click to rename', ondblclick: (e) => U.inlineEdit(e.target, t.name, (v) => { if (v) { ST.snap(); t.name = v; } ST.touch(); }) }, t.name);
    const head = h('div', { class: 'th', style: '--c:' + t.color },
      h('div', { class: 'th-top' }, h('span', { class: 'swatch' }), name, h('button', { class: 'btn xs icon', title: 'Track menu', onclick: (e) => { e.stopPropagation(); trackMenu(e.currentTarget, t); } }, '⋯')),
      h('div', { class: 'th-sub' }, t.type === 'audio' ? 'Audio · mic & samples' : (inst ? inst.emoji + ' ' + inst.name : 'No instrument')),
      h('div', { class: 'th-btns' },
        h('button', { class: 'tb m' + (t.mute ? ' on' : ''), title: 'Mute', onclick: (e) => { e.stopPropagation(); t.mute = !t.mute; ST.touch(); } }, 'M'),
        h('button', { class: 'tb s' + (t.solo ? ' on' : ''), title: 'Solo', onclick: (e) => { e.stopPropagation(); t.solo = !t.solo; ST.touch(); } }, 'S'),
        h('button', { class: 'tb r' + (ST.armed === t.id ? ' on' : ''), title: 'Arm for recording', onclick: (e) => { e.stopPropagation(); if (!ST.canRecord(t)) return ST.toast('This instrument can’t be recorded', 'warn'); ST.armed = t.id; ST.selTrack = t.id; ST.emit('selection'); } }, '●'),
        h('input', { type: 'range', class: 'tvol', min: 0, max: 1, step: 0.01, value: t.vol, title: 'Volume', onclick: (e) => e.stopPropagation(), oninput: (e) => { t.vol = +e.target.value; ST.sync(); ST.autosave(); } })));
    const lane = h('div', { class: 'lane', style: `width:${W}px;--c:${t.color}`,
      ondblclick: (e) => { if (e.target !== e.currentTarget || t.type === 'audio') return; const r = e.currentTarget.getBoundingClientRect(); const b = Math.floor(((e.clientX - r.left) / U.ppb) / 4) * 4; ST.snap(); const c = ST.addClip(t, b, 8, []); ST.ensureBars(b + 8); ST.selClip = c.id; ST.selTrack = t.id; ST.touch(); ST.emit('selection'); U.setTab('editor'); },
      onpointerdown: (e) => { if (e.target === e.currentTarget) { ST.selTrack = t.id; if (ST.canRecord(t)) ST.armed = t.id; ST.selClip = null; ST.emit('selection'); } },
      ondragover: (e) => { if (t.type === 'audio') e.preventDefault(); },
      ondrop: (e) => {
        const d = e.dataTransfer.getData('text/plain'); if (t.type !== 'audio' || !d.startsWith('vmi-sample:')) return; e.preventDefault();
        const s = ST.lib.samples.get(d.slice(11)); if (!s) return; const r = e.currentTarget.getBoundingClientRect();
        const b = Math.max(0, Math.round((e.clientX - r.left) / U.ppb)), len = s.dur / ST.spb();
        ST.snap(); ST.ensureBars(b + len); const c = ST.addClip(t, b, len, []); c.sample = s.id; c.off = 0; c.gain = 1; c.name = s.name; ST.selClip = c.id; ST.touch(); ST.emit('selection');
      } });
    t.clips.forEach((cl) => lane.append(clipEl(t, cl)));
    return h('div', { class: 'trk', 'data-track': t.id, onpointerdown: () => { if (ST.selTrack !== t.id) { ST.selTrack = t.id; if (ST.canRecord(t)) ST.armed = t.id; ST.emit('selection'); } } }, head, lane);
  }
  function trackMenu(anchor, t) {
    U.menu(anchor, [
      { label: 'Rename', fn: () => { const el = $('[data-track="' + t.id + '"] .tn'); if (el) U.inlineEdit(el, t.name, (v) => { if (v) { ST.snap(); t.name = v; } ST.touch(); }); } },
      t.type === 'inst' ? { label: 'Change instrument…', fn: () => chooseInstrument(t) } : null,
      { label: 'Change colour', fn: () => { ST.snap(); t.color = ST.COLORS[(ST.COLORS.indexOf(t.color) + 1) % ST.COLORS.length]; ST.touch(); } },
      { label: 'Duplicate track', fn: () => { ST.snap(); const c = JSON.parse(JSON.stringify(t)); c.id = ST.uid('t_'); c.name += ' copy'; c.clips.forEach((k) => { k.id = ST.uid('c_'); }); ST.proj().tracks.push(c); ST.touch(); } },
      { label: 'Clear all clips', fn: () => { ST.snap(); t.clips = []; ST.touch(); } },
      '-', { label: 'Delete track', danger: true, fn: () => { ST.snap(); ST.removeTrack(t.id); } },
    ].filter(Boolean));
  }
  function chooseInstrument(t) {
    const list = h('div', { class: 'snd-list pick' });
    VMI.cats.forEach((cat) => {
      list.append(h('div', { class: 'snd-cat', style: '--c:' + cat.color }, cat.name));
      VMI.instruments.filter((i) => i.cat === cat.id).forEach((i) => list.append(h('button', { class: 'snd', onclick: () => { m.close(); ST.snap(); t.inst = i.id; t.opts = {}; i.controls.forEach((c) => { t.opts[c.id] = c.value; }); if (t.name === (VMI.byId[t.inst] || {}).name || true) { /* keep user name */ } ST.touch(); ST.emit('selection'); } }, h('span', { class: 'se' }, i.emoji), h('span', { class: 'sn' }, i.name))));
    });
    const m = U.modal('Choose instrument for “' + t.name + '”', list);
  }

  function clipEl(t, cl) {
    const ppb = U.ppb, w = Math.max(6, cl.len * ppb);
    const cv = h('canvas', { class: 'cprev' });
    const el = h('div', { class: 'clip ' + (cl.sample ? 'audio' : 'inst'), 'data-id': cl.id, style: `left:${cl.start * ppb}px;width:${w}px` },
      h('span', { class: 'cn' }, cl.sample ? (cl.name || 'Audio') : t.name), cv, h('i', { class: 'rs', title: 'Drag to resize' }));
    requestAnimationFrame(() => drawPreview(cv, t, cl, w, 54));
    el.addEventListener('dblclick', (e) => { e.stopPropagation(); ST.selClip = cl.id; ST.selTrack = t.id; ST.emit('selection'); U.setTab('editor'); });
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; e.stopPropagation();
      ST.selClip = cl.id; ST.selTrack = t.id; if (ST.canRecord(t)) ST.armed = t.id; ST.emit('selection');
      const rs = e.target.classList.contains('rs'), x0 = e.clientX, o = { start: cl.start, len: cl.len };
      let moved = false;
      const buf = cl.sample && ST.lib.getBuffer(cl.sample);
      const mv = (ev) => {
        const dx = (ev.clientX - x0) / U.ppb;
        if (!moved && Math.abs(ev.clientX - x0) < 3) return;
        if (!moved) { ST.snap(); moved = true; }
        if (rs) { let l = Math.max(1, Math.round(o.len + dx)); if (buf) l = Math.min(l, Math.floor(((buf.duration - (cl.off || 0)) / ST.spb()) * 4) / 4 || l); cl.len = l; el.style.width = l * U.ppb + 'px'; }
        else { cl.start = Math.max(0, Math.round(o.start + dx)); el.style.left = cl.start * U.ppb + 'px'; }
      };
      const up = () => {
        removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
        if (moved) { ST.ensureBars(cl.start + cl.len); ST.touch(); }
      };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
    return el;
  }

  U.markSelection = () => {
    $$('.trk').forEach((r) => r.classList.toggle('sel', r.dataset.track === ST.selTrack));
    $$('.clip').forEach((c) => c.classList.toggle('sel', c.dataset.id === ST.selClip));
    $$('.tb.r').forEach((b) => { const r = b.closest('.trk'); b.classList.toggle('on', r && r.dataset.track === ST.armed); });
  };

  /* =========================================================
     Bottom panel (Play / Editor / Mixer)
     ========================================================= */
  function buildBottom() {
    const tab = (id, label) => h('button', { class: 'bp-tab', id: 'tab-' + id, onclick: () => U.setTab(id) }, label);
    return h('section', { class: 'st-bottom', id: 'st-bottom' },
      h('div', { class: 'bp-tabs' }, tab('play', '🎹 Play'), tab('editor', '✏️ Editor'), tab('mixer', '🎚 Mixer'),
        h('span', { class: 'bp-info', id: 'bpInfo' }),
        h('button', { class: 'btn xs', id: 'bpCollapse', title: 'Show / hide panel', onclick: () => { const b = $('#st-bottom'); b.classList.toggle('collapsed'); setTimeout(() => U.layout && U.layout.resize && U.layout.resize(), 50); } }, '▾')),
      h('div', { class: 'bp-body', id: 'bpBody' }));
  }
  U.setTab = (t) => { U.tab = t; U.renderBottom(); };

  /* ---- adapter so the instrument layouts can play into a studio track ---- */
  let keyId = 0; const sustained = new Set(); let pedal = false;
  const curTrack = () => ST.track(ST.selTrack);
  const sapp = (U.sapp = {
    touch, rec: { log() { } }, wake: () => A.resume(),
    get transpose() { return 0; },
    get opts() { const t = curTrack(); return t ? t.opts : {}; },
    get bus() { const t = curTrack(); ST.ensure(); const s = t && ST.graph.strips.get(t.id); return s ? s.input : null; },
    start(inst, spec, vel) {
      const t = curTrack(); if (!t) return null; ST.ensure(); A.resume(); ST.sync();
      const strip = ST.graph.strips.get(t.id); if (!strip) return null;
      const c = ST.ctx, midi = spec.midi != null ? spec.midi + (t.transpose || 0) : undefined;
      let v = null;
      try { v = inst.voice(c, strip.input, { freq: midi != null ? A.mtof(midi) : undefined, midi, vel, t: c.currentTime, o: t.opts, pad: spec.pad, spec }); } catch (e) { console.error(e); }
      if (!v) return null;
      const key = ++keyId; ST.noteOn(spec, vel, key);
      return { voice: v, spec, key };
    },
    stop(inst, hd) { if (!hd) return; ST.noteOff(hd.key); if (inst.pedal && pedal) sustained.add(hd); else hd.voice.release(); },
    kill(hd) { if (!hd) return; sustained.delete(hd); try { hd.voice.kill(); } catch (e) { /* ignore */ } },
  });
  U.setPedal = (on) => { if (pedal === on) return; pedal = on; const b = $('#pedalBtn2'); if (b) b.classList.toggle('active', on); if (!on) { sustained.forEach((x) => x.voice.release()); sustained.clear(); } };

  let layoutFor = null;
  function unmountLayout() { if (U.layout) { U.layout.unmount(); U.layout = null; layoutFor = null; } }
  U.unmountLayout = unmountLayout;

  U.renderBottom = () => {
    const body = $('#bpBody'); if (!body) return;
    ['play', 'editor', 'mixer'].forEach((t) => $('#tab-' + t).classList.toggle('active', U.tab === t));
    if (U.tab !== 'play') { unmountLayout(); if (VMI.voice) VMI.voice.leave(); }
    body.className = 'bp-body bp-' + U.tab;
    if (U.tab === 'play') renderPlay(body);
    else if (U.tab === 'editor') { body.innerHTML = ''; VMI.sedit.render(body); }
    else renderMixer(body);
    updateInfo();
  };
  function updateInfo() {
    const t = curTrack(), el = $('#bpInfo'); if (!el) return;
    el.textContent = t ? (t.name + (ST.armed === t.id && ST.canRecord(t) ? '  · armed ●' : '')) : 'No track selected';
    el.style.color = t ? t.color : '';
  }
  ST.on('selection', () => {
    if (!U.open) return;
    if (ST.selTrack !== ST.armed) { const t = curTrack(); if (t && ST.canRecord(t)) ST.armed = t.id; }
    U.markSelection(); updateInfo();
    if (U.tab === 'play') renderPlay($('#bpBody'));
    else if (U.tab === 'editor') { $('#bpBody').innerHTML = ''; VMI.sedit.render($('#bpBody')); }
    else if (U.tab === 'mixer') U.renderBottom();
  });

  function control(c, t) {
    const set = (v) => { t.opts[c.id] = v; ST.autosave(); if (U.layout && U.layout.onControl) U.layout.onControl(c.id, v); };
    let node;
    if (c.type === 'select') { node = h('select', { class: 'sel', onchange: (e) => set(e.target.value) }, c.options.map(([v, l]) => h('option', { value: v }, l))); node.value = t.opts[c.id] != null ? t.opts[c.id] : c.value; }
    else if (c.type === 'range') { const out = h('output', null, t.opts[c.id] != null ? t.opts[c.id] : c.value); node = h('span', { class: 'sl' }, h('input', { type: 'range', min: c.min, max: c.max, step: c.step, value: t.opts[c.id] != null ? t.opts[c.id] : c.value, oninput: (e) => { out.textContent = e.target.value; set(+e.target.value); } }), out); }
    else { node = h('input', { type: 'checkbox', class: 'sw', onchange: (e) => set(e.target.checked) }); node.checked = !!(t.opts[c.id] != null ? t.opts[c.id] : c.value); }
    return h('label', { class: 'field' }, h('span', { class: 'flabel' }, c.label), node);
  }
  function renderPlay(body) {
    if (!body) return;
    const t = curTrack(), inst = t && VMI.byId[t.inst];
    if (!t) { unmountLayout(); body.innerHTML = ''; body.append(h('div', { class: 'empty-panel' }, h('b', null, 'Pick a sound to start'), h('span', null, 'Choose an instrument on the left (Sounds) — it becomes a track you can play with your keyboard and record.'))); return; }
    if (!inst) {
      unmountLayout(); layoutFor = null;
      VMI.voice.panel(body, t);
      return;
    }
    if (layoutFor === t.id + ':' + t.inst && U.layout && body.querySelector('.stage')) return;
    unmountLayout(); body.innerHTML = '';
    const tools = h('div', { class: 'play-tools' },
      h('span', { class: 'pt-name' }, inst.emoji + ' ' + inst.name),
      h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Transpose'), h('span', { class: 'sl' }, h('input', { type: 'range', min: -12, max: 12, step: 1, value: t.transpose || 0, oninput: (e) => { t.transpose = +e.target.value; e.target.nextSibling.textContent = (t.transpose > 0 ? '+' : '') + t.transpose; ST.autosave(); } }), h('output', null, (t.transpose > 0 ? '+' : '') + (t.transpose || 0)))),
      inst.layout === 'keys' ? h('span', { class: 'octs' }, h('button', { class: 'btn xs', onclick: () => U.layout && U.layout.shift(-12) }, '− Oct'), h('button', { class: 'btn xs', onclick: () => U.layout && U.layout.shift(12) }, 'Oct +')) : null,
      inst.pedal ? h('button', { id: 'pedalBtn2', class: 'btn xs pedal', onpointerdown: (e) => { e.preventDefault(); U.setPedal(true); }, onpointerup: () => U.setPedal(false), onpointerleave: () => U.setPedal(false) }, 'Sustain') : null,
      inst.controls.map((c) => control(c, t)));
    const stage = h('div', { class: 'stage', id: 'playStage' });
    body.append(tools, stage);
    const Layout = VMI.layouts[inst.layout];
    U.layout = new Layout(sapp, inst, stage); layoutFor = t.id + ':' + t.inst;
    requestAnimationFrame(() => {
      if (U.layout && U.layout.root === stage) { U.layout.mount(); U.layout.keymap.delete('Space'); Object.keys(t.opts).forEach((k) => U.layout.onControl && U.layout.onControl(k, t.opts[k])); }
    });
  }
  U.resizeLayout = () => { if (U.layout) U.layout.resize(); };

  /* ---- mixer ---- */
  const meters = [];
  function strip(t, master) {
    const o = master ? ST.proj().master : t;
    const set = (fn) => (e) => { fn(+e.target.value); ST.sync(); ST.autosave(); };
    const knob = (label, val, min, max, step, fn, cls) => h('label', { class: 'kn ' + (cls || '') }, h('span', null, label), h('input', { type: 'range', min, max, step, value: val, oninput: set(fn), ondblclick: (e) => { e.target.value = 0; set(fn)(e); } }));
    const meter = h('div', { class: 'meter' }, h('i'));
    meters.push({ el: meter.firstChild, id: master ? null : t.id });
    const fader = h('input', { type: 'range', class: 'fader', min: 0, max: 1, step: 0.01, value: o.vol, orient: 'vertical', title: 'Volume', oninput: set((v) => { o.vol = v; }) });
    if (master) {
      return h('div', { class: 'cstrip master' },
        h('div', { class: 'cs-name' }, 'MASTER'),
        h('label', { class: 'kn' }, h('span', null, 'Reverb'), h('select', { class: 'sel', onchange: (e) => { o.rev = e.target.value; ST.sync(); ST.autosave(); } }, VMI.REVERBS.map((r) => h('option', { value: r, selected: o.rev === r }, r)))),
        h('label', { class: 'kn' }, h('span', null, 'Delay'), h('select', { class: 'sel', onchange: (e) => { o.dly = e.target.value; ST.sync(); ST.autosave(); } }, [['4', '1/4'], ['8', '1/8'], ['8d', 'dotted 1/8'], ['16', '1/16']].map(([v, l]) => h('option', { value: v, selected: o.dly === v }, l)))),
        knob('Echo fb', o.fb, 0, 0.8, 0.01, (v) => { o.fb = v; }),
        h('div', { class: 'fader-wrap' }, fader, meter), h('div', { class: 'cs-vol' }, 'Out'));
    }
    return h('div', { class: 'cstrip' + (ST.selTrack === t.id ? ' sel' : ''), style: '--c:' + t.color, onpointerdown: () => { if (ST.selTrack !== t.id) { ST.selTrack = t.id; ST.emit('selection'); } } },
      h('div', { class: 'cs-name', title: t.name }, t.name),
      h('div', { class: 'cs-btns' },
        h('button', { class: 'tb m' + (t.mute ? ' on' : ''), onclick: () => { t.mute = !t.mute; ST.touch(); } }, 'M'),
        h('button', { class: 'tb s' + (t.solo ? ' on' : ''), onclick: () => { t.solo = !t.solo; ST.touch(); } }, 'S'),
        h('button', { class: 'tb c' + (t.comp ? ' on' : ''), title: 'Compressor — evens out loud and quiet parts (great for voice)', onclick: () => { t.comp = !t.comp; ST.touch(); } }, 'C')),
      h('div', { class: 'knobs' },
      knob('Pan', t.pan, -1, 1, 0.01, (v) => { t.pan = v; }),
      knob('Low', t.eq[0], -12, 12, 0.5, (v) => { t.eq[0] = v; }),
      knob('Mid', t.eq[1], -12, 12, 0.5, (v) => { t.eq[1] = v; }),
      knob('High', t.eq[2], -12, 12, 0.5, (v) => { t.eq[2] = v; }),
      knob('Drive', t.drive || 0, 0, 1, 0.01, (v) => { t.drive = v; }, 'drive'),
      knob('Reverb', t.rev, 0, 1, 0.01, (v) => { t.rev = v; }),
      knob('Echo', t.dly, 0, 1, 0.01, (v) => { t.dly = v; })),
      h('div', { class: 'fader-wrap' }, fader, meter), h('div', { class: 'cs-vol' }, Math.round(t.vol * 100)));
  }
  function renderMixer(body) {
    body.innerHTML = ''; meters.length = 0;
    const wrap = h('div', { class: 'mixer' });
    ST.proj().tracks.forEach((t) => wrap.append(strip(t)));
    if (!ST.proj().tracks.length) wrap.append(h('div', { class: 'empty-panel' }, h('b', null, 'The mixer is empty'), h('span', null, 'Add a track and its channel strip appears here: volume, pan, EQ, drive, reverb and echo.')));
    wrap.append(strip(null, true));
    body.append(wrap);
  }

  /* =========================================================
     Animation loop: playhead, LCD, meters
     ========================================================= */
  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!U.open) return;
    const P = ST.proj(); if (!P) return;
    const b = ST.tr.playing ? ST.curBeat() : ST.tr.pos;
    const ph = $('#playhead');
    if (ph) {
      const x = HEAD + b * U.ppb; ph.style.transform = 'translateX(' + x + 'px)'; ph.style.opacity = b < 0 ? 0.3 : 1;
      if (ST.tr.playing && arrScroll) { const vx = x - arrScroll.scrollLeft; if (vx > arrScroll.clientWidth - 40 || vx < HEAD) arrScroll.scrollLeft = Math.max(0, x - HEAD - 60); }
    }
    const lp = $('#lcdPos');
    if (lp) {
      if (b < 0) lp.textContent = 'COUNT ' + Math.ceil(-b);
      else lp.textContent = String(Math.floor(b / 4) + 1).padStart(3, '0') + '.' + (Math.floor(b % 4) + 1);
      $('#lcdTime').textContent = fmtTime(Math.max(0, b) * ST.spb());
    }
    if (U.tab === 'mixer' && ST.graph) {
      meters.forEach((m) => { const pk = m.id ? (ST.graph.strips.get(m.id) || { peak: () => 0 }).peak() : ST.graph.peak(); m.el.style.height = Math.min(100, Math.pow(pk, 0.6) * 100) + '%'; });
    }
    if (U.editorFrame) U.editorFrame(b);
  }

  /* =========================================================
     Open / close
     ========================================================= */
  U.openStudio = async () => {
    if (U.open || U.opening) return;
    U.opening = true;
    if (!ST.proj()) { const ok = await ST.loadAutosave(); if (!ok) ST.newProject('beat'); }
    U.opening = false;
    if (location.hash !== '#/studio') return;
    ST.ensure(); ST.sync();
    U.build();
    U.open = true;
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    if (!localStorage.getItem('vmi.seenTour')) { try { localStorage.setItem('vmi.seenTour', '1'); } catch (e) { /* ignore */ } setTimeout(() => VMI.tour.menu(true), 600); }
  };
  U.closeStudio = () => {
    if (!U.open) return;
    ST.stop(); unmountLayout(); U.open = false; cancelAnimationFrame(raf);
    if (VMI.voice) { VMI.voice.leave(); VMI.voice.stopMonitor(); }
    $$('.popmenu,.modal-back').forEach((n) => n.remove());
    if (VMI.tour) VMI.tour.stop();
  };

  /* keyboard */
  window.addEventListener('keydown', (e) => {
    if (!U.open) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' && !['range', 'checkbox'].includes(t.type) || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if ($('.modal-back')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? ST.redo() : ST.undo(); return; }
    if (mod && e.code === 'KeyY') { e.preventDefault(); ST.redo(); return; }
    if (mod && e.code === 'KeyS') { e.preventDefault(); ST.saveAs(); return; }
    if (mod && e.code === 'KeyD') { e.preventDefault(); if (ST.selClip) ops.dup(ST.selClip); return; }
    if (mod || e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) ST.toggle(); return; }
    if (e.code === 'Home') { e.preventDefault(); ST.seek(0); return; }
    if (e.code === 'Escape') { if (ST.rec.on) ST.stop(); else location.hash = '#/'; return; }
    if ((e.code === 'Delete' || e.code === 'Backspace') && ST.selClip && U.tab !== 'editor-note') {
      if (VMI.sedit && VMI.sedit.deleteSelection && VMI.sedit.deleteSelection()) { e.preventDefault(); return; }
      e.preventDefault(); ops.del(ST.selClip); return;
    }
    if (U.tab !== 'mixer' && U.layout && U.layout.keyDown(e)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { if (U.open && U.layout && U.layout.keyUp(e)) e.preventDefault(); });
  window.addEventListener('blur', () => { if (U.layout) U.layout.releaseAll(); });
  window.addEventListener('resize', () => { if (U.open) { clearTimeout(U.rt); U.rt = setTimeout(() => { U.resizeLayout(); if (VMI.sedit && VMI.sedit.resize) VMI.sedit.resize(); }, 150); } });
})();
