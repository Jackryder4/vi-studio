/* app.js — home gallery, player shell, settings, recorder, metronome, sequencer */
(function () {
  'use strict';
  const VMI = window.VMI, A = VMI.audio;
  const $ = (s, r) => (r || document).querySelector(s);
  const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem('vmi.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('vmi.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  const app = (VMI.app = {
    touch: window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window,
    inst: null, layout: null, bus: null, opts: {}, transpose: 0, pedal: false, sustained: new Set(),
    seq: null,
  });

  app.wake = () => A.resume();

  /* ---------- note start / stop ---------- */
  app.start = (inst, spec, vel, when) => {
    A.resume();
    const c = A.ctx();
    if (!c || !app.bus || !inst.voice) return null;
    const midi = spec.midi != null ? spec.midi + app.transpose : undefined;
    const p = { freq: midi != null ? A.mtof(midi) : undefined, midi, vel, t: when || c.currentTime, o: app.opts, pad: spec.pad, spec };
    let voice = null;
    try { voice = inst.voice(c, app.bus, p); } catch (e) { console.error('voice error', inst.id, e); }
    return voice ? { voice, spec } : null;
  };
  app.stop = (inst, h) => {
    if (!h) return;
    if (inst.pedal && app.pedal) app.sustained.add(h); else h.voice.release();
  };
  app.kill = (h) => { if (!h) return; app.sustained.delete(h); try { h.voice.kill(); } catch (e) { /* ignore */ } };
  app.setPedal = (on) => {
    if (app.pedal === on) return;
    app.pedal = on;
    const b = $('#pedalBtn'); if (b) b.classList.toggle('active', on);
    if (!on) { app.sustained.forEach((h) => h.voice.release()); app.sustained.clear(); }
  };

  /* ---------- recorder ---------- */
  const rec = (app.rec = {
    on: false, playing: false, events: [], t0: 0, timers: [],
    log(type, id, vel) {
      if (!this.on || this.playing) return;
      const now = performance.now();
      if (!this.events.length) this.t0 = now;
      this.events.push({ t: now - this.t0, type, id, vel });
      $('#recBtn span').textContent = 'Stop (' + this.events.filter((e) => e.type === 'on').length + ')';
    },
    toggle() {
      if (this.playing) this.stopPlay();
      this.on = !this.on;
      if (this.on) { this.events = []; $('#recBtn').classList.add('active'); $('#recBtn span').textContent = 'Stop (0)'; }
      else { $('#recBtn').classList.remove('active'); $('#recBtn span').textContent = 'Rec'; }
      $('#playBtn').disabled = this.on || !this.events.length;
    },
    play() {
      if (this.playing) return this.stopPlay();
      if (!this.events.length || !app.layout) return;
      this.playing = true; $('#playBtn').classList.add('active'); $('#playBtn span').textContent = 'Stop';
      const lay = app.layout;
      this.events.forEach((ev) => this.timers.push(setTimeout(() => { if (ev.type === 'on') lay.press(ev.id, ev.vel); else lay.lift(ev.id); }, ev.t)));
      this.timers.push(setTimeout(() => this.stopPlay(), this.events[this.events.length - 1].t + 900));
    },
    stopPlay() {
      this.timers.forEach(clearTimeout); this.timers = [];
      if (this.playing && app.layout) app.layout.releaseAll();
      this.playing = false; $('#playBtn').classList.remove('active'); $('#playBtn span').textContent = 'Play';
    },
    reset() {
      this.stopPlay(); this.on = false; this.events = [];
      $('#recBtn').classList.remove('active'); $('#recBtn span').textContent = 'Rec'; $('#playBtn').disabled = true;
    },
  });

  /* ---------- metronome ---------- */
  const met = (app.met = {
    on: false, bpm: store.get('bpm', 100), next: 0, beat: 0, timer: null,
    start() {
      A.resume(); this.on = true; this.beat = 0; this.next = A.ctx().currentTime + 0.06;
      this.timer = setInterval(() => this.tick(), 25);
    },
    tick() {
      const c = A.ctx();
      while (this.next < c.currentTime + 0.12) { A.click(this.beat % 4 === 0, this.next); this.next += 60 / this.bpm; this.beat++; }
    },
    stop() { this.on = false; clearInterval(this.timer); },
    toggle() { if (this.on) this.stop(); else this.start(); $('#metBtn').classList.toggle('active', this.on); },
  });

  /* ---------- drum machine sequencer ---------- */
  const PATTERNS = {
    Rock: { kick: 'x.......x.x.....', snare: '....x.......x...', hatC: 'x.x.x.x.x.x.x.x.' },
    'Hip-hop': { kick: 'x.....x...x.....', snare: '....x.......x...', hatC: 'x.x.x.x.x.x.x.xx', clap: '....x.......x...' },
    House: { kick: 'x...x...x...x...', clap: '....x.......x...', hatO: '..x...x...x...x.', hatC: 'x.x.x.x.x.x.x.x.' },
    Funk: { kick: 'x..x..x...x..x..', snare: '....x..x.x..x...', hatC: 'xxxxxxxxxxxxxxxx', cow: '..x.......x.....' },
  };
  class Seq {
    constructor(host, inst) {
      this.inst = inst; this.host = host; this.rows = inst.cfg.pads.slice(0, 8); this.bpm = store.get('seqBpm', 100);
      this.steps = this.rows.map(() => new Array(16).fill(false)); this.playing = false; this.step = 0; this.cells = [];
      this.build(); this.load('Rock');
    }
    build() {
      const h = this.host; h.innerHTML = '';
      const bar = mk('div', 'seqbar');
      this.playBtn = mk('button', 'btn primary', '▶ Play'); this.playBtn.type = 'button';
      this.playBtn.onclick = () => (this.playing ? this.stop() : this.play());
      const bpmL = mk('label', 'seqlab', 'BPM'); const bpm = mk('input'); bpm.type = 'range'; bpm.min = 60; bpm.max = 200; bpm.value = this.bpm;
      const bv = mk('b', null, String(this.bpm));
      bpm.oninput = () => { this.bpm = +bpm.value; bv.textContent = this.bpm; store.set('seqBpm', this.bpm); };
      bpmL.append(bpm, bv);
      const pre = mk('select', 'sel');
      Object.keys(PATTERNS).forEach((k) => pre.appendChild(new Option(k, k)));
      pre.onchange = () => this.load(pre.value);
      const clr = mk('button', 'btn', 'Clear'); clr.type = 'button'; clr.onclick = () => { this.steps.forEach((r) => r.fill(false)); this.paint(); };
      bar.append(this.playBtn, bpmL, pre, clr);
      const grid = mk('div', 'seqgrid');
      this.rows.forEach((p, r) => {
        const row = mk('div', 'seqrow'); row.appendChild(mk('span', 'seqname', p.label));
        const cs = [];
        for (let s = 0; s < 16; s++) {
          const c = mk('button', 'seqcell' + (s % 4 === 0 ? ' beat' : '')); c.type = 'button';
          c.onclick = () => { this.steps[r][s] = !this.steps[r][s]; c.classList.toggle('on', this.steps[r][s]); };
          row.appendChild(c); cs.push(c);
        }
        this.cells.push(cs); grid.appendChild(row);
      });
      h.append(bar, grid);
    }
    load(name) {
      const pat = PATTERNS[name];
      this.rows.forEach((p, r) => { const s = pat[p.id] || ''.padEnd(16, '.'); for (let i = 0; i < 16; i++) this.steps[r][i] = s[i] === 'x'; });
      this.paint();
    }
    paint() { this.cells.forEach((cs, r) => cs.forEach((c, s) => c.classList.toggle('on', this.steps[r][s]))); }
    play() {
      A.resume(); const c = A.ctx(); if (!c) return;
      this.playing = true; this.step = 0; this.next = c.currentTime + 0.06;
      this.playBtn.textContent = '■ Stop'; this.playBtn.classList.add('active');
      this.timer = setInterval(() => this.tick(), 25);
    }
    tick() {
      const c = A.ctx();
      while (this.next < c.currentTime + 0.12) {
        const s = this.step, t = this.next;
        this.rows.forEach((p, r) => { if (this.steps[r][s]) app.start(this.inst, { pad: p, choke: p.choke }, s % 4 === 0 ? 0.95 : 0.75, t); });
        const delay = Math.max(0, (t - c.currentTime) * 1000);
        setTimeout(() => this.flash(s), delay);
        this.next += 60 / this.bpm / 4; this.step = (this.step + 1) % 16;
      }
    }
    flash(s) {
      this.cells.forEach((cs) => { cs.forEach((c) => c.classList.remove('now')); if (this.playing) cs[s].classList.add('now'); });
    }
    stop() {
      this.playing = false; clearInterval(this.timer);
      this.playBtn.textContent = '▶ Play'; this.playBtn.classList.remove('active');
      this.cells.forEach((cs) => cs.forEach((c) => c.classList.remove('now')));
    }
    destroy() { this.stop(); this.host.innerHTML = ''; }
  }

  /* ---------- home gallery ---------- */
  const home = {
    cat: 'all', q: '',
    build() {
      const pills = $('#pills');
      const all = mk('button', 'pill active', 'All'); all.dataset.cat = 'all'; pills.appendChild(all);
      VMI.cats.forEach((c) => { const b = mk('button', 'pill', c.name); b.dataset.cat = c.id; b.style.setProperty('--c', c.color); pills.appendChild(b); });
      pills.addEventListener('click', (e) => {
        const b = e.target.closest('.pill'); if (!b) return;
        this.cat = b.dataset.cat; pills.querySelectorAll('.pill').forEach((x) => x.classList.toggle('active', x === b)); this.render();
      });
      $('#search').addEventListener('input', (e) => { this.q = e.target.value.trim().toLowerCase(); this.render(); });
      $('#countNum').textContent = VMI.instruments.length;
      this.render();
    },
    render() {
      const host = $('#grid'); host.innerHTML = '';
      VMI.cats.forEach((cat) => {
        if (this.cat !== 'all' && this.cat !== cat.id) return;
        const list = VMI.instruments.filter((i) => i.cat === cat.id && (!this.q || (i.name + ' ' + i.desc).toLowerCase().includes(this.q)));
        if (!list.length) return;
        const sec = mk('section', 'cat'); sec.style.setProperty('--c', cat.color);
        const h = mk('h2'); h.append(mk('span', 'dot'), cat.name, mk('small', null, list.length + ''));
        sec.appendChild(h);
        const g = mk('div', 'cards');
        list.forEach((i) => {
          const a = mk('a', 'card'); a.href = '#/' + i.id;
          const ic = mk('span', 'cicon', i.emoji);
          const body = mk('span', 'cbody'); body.append(mk('b', null, i.name), mk('em', null, i.desc));
          a.append(ic, body); g.appendChild(a);
        });
        sec.appendChild(g); host.appendChild(sec);
      });
      if (!host.children.length) host.appendChild(mk('p', 'empty', 'No instruments match “' + this.q + '”.'));
    },
  };

  /* ---------- settings panel ---------- */
  function pitched(inst) {
    if (inst.layout === 'pads') return inst.cfg.pads.some((p) => p.note);
    return true;
  }
  function field(label, node, cls) { const f = mk('label', 'field' + (cls ? ' ' + cls : '')); f.append(mk('span', 'flabel', label), node); return f; }
  function slider(min, max, step, value, fmt, on) {
    const wrap = mk('span', 'sl'); const i = mk('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value;
    const o = mk('output', null, fmt(value)); i.addEventListener('input', () => { o.textContent = fmt(+i.value); on(+i.value); });
    wrap.append(i, o); return wrap;
  }
  function buildSettings(inst) {
    const host = $('#settings'); host.innerHTML = '';
    host.appendChild(field('Volume', slider(0, 1, 0.01, A.volume, (v) => Math.round(v * 100) + '%', (v) => { A.setVolume(v); store.set('vol', v); })));
    host.appendChild(field('Reverb', slider(0, 1, 0.01, A.reverb, (v) => Math.round(v * 100) + '%', (v) => A.setReverb(v))));
    if (pitched(inst) && inst.layout !== 'pads') {
      host.appendChild(field('Transpose', slider(-12, 12, 1, app.transpose, (v) => (v > 0 ? '+' : '') + v + ' st', (v) => { app.transpose = v; })));
    }
    if (inst.layout === 'keys') {
      const oct = mk('span', 'octs'); const dn = mk('button', 'btn sm', '− Octave'), up = mk('button', 'btn sm', 'Octave +');
      dn.type = up.type = 'button';
      dn.onclick = () => app.layout.shift(-12); up.onclick = () => app.layout.shift(12);
      oct.append(dn, up); host.appendChild(field('Range', oct));
    }
    inst.controls.forEach((c) => {
      let node;
      const set = (v) => { app.opts[c.id] = v; if (app.layout) app.layout.onControl(c.id, v); };
      if (c.type === 'select') {
        node = mk('select', 'sel'); c.options.forEach(([v, l]) => node.appendChild(new Option(l, v))); node.value = app.opts[c.id];
        node.onchange = () => set(node.value);
      } else if (c.type === 'range') {
        const fmt = (v) => (c.step < 1 ? (+v).toFixed(c.step < 0.1 ? 2 : 1) : Math.round(v));
        node = slider(c.min, c.max, c.step, app.opts[c.id], fmt, set);
      } else {
        node = mk('input'); node.type = 'checkbox'; node.checked = !!app.opts[c.id]; node.className = 'sw';
        node.onchange = () => set(node.checked);
      }
      host.appendChild(field(c.label, node));
    });
    const kn = mk('input'); kn.type = 'checkbox'; kn.className = 'sw'; kn.checked = store.get('notes', false);
    kn.onchange = () => { store.set('notes', kn.checked); $('#stage').classList.toggle('show-notes', kn.checked); };
    host.appendChild(field('Note names', kn));
    if (!app.touch) {
      const kk = mk('input'); kk.type = 'checkbox'; kk.className = 'sw'; kk.checked = store.get('keys', true);
      kk.onchange = () => { store.set('keys', kk.checked); $('#stage').classList.toggle('hide-keys', !kk.checked); };
      host.appendChild(field('Key labels', kk));
    }
  }

  /* ---------- player ---------- */
  let resizeT = null;
  function openInstrument(id) {
    const inst = VMI.byId[id];
    if (!inst) { location.hash = '#/'; return; }
    closeInstrument();
    A.init();
    app.inst = inst; app.transpose = 0; app.pedal = false; app.sustained.clear();
    app.opts = {}; inst.controls.forEach((c) => { app.opts[c.id] = c.value; });
    A.setReverb(inst.reverb);
    app.bus = A.bus(inst.gain);
    show('player');
    document.title = inst.name + ' — Virtual Instruments';
    document.body.classList.add('playing');
    $('#pEmoji').textContent = inst.emoji;
    $('#instSelect').value = inst.id;
    const stage = $('#stage');
    stage.className = 'stage';
    stage.classList.toggle('show-notes', store.get('notes', false));
    stage.classList.toggle('hide-keys', !app.touch && !store.get('keys', true));
    const Layout = VMI.layouts[inst.layout];
    app.layout = new Layout(app, inst, stage);
    buildSettings(inst);
    rec.reset();
    $('#recBtn').disabled = inst.layout === 'theremin'; $('#playBtn').disabled = true;
    // extras
    $('#player').classList.toggle('scrolly', !!inst.cfg.seq);
    const ex = $('#extras'); ex.innerHTML = '';
    if (inst.pedal) {
      const pb = mk('button', 'btn pedal', 'Sustain'); pb.id = 'pedalBtn'; pb.type = 'button';
      const on = (e) => { e.preventDefault(); app.wake(); app.setPedal(true); };
      const off = () => app.setPedal(false);
      pb.addEventListener('pointerdown', on); pb.addEventListener('pointerup', off); pb.addEventListener('pointerleave', off); pb.addEventListener('pointercancel', off);
      if (!app.touch) pb.appendChild(mk('kbd', null, 'Space'));
      ex.appendChild(pb);
    }
    if (inst.cfg.seq) { const h = mk('div', 'seq'); ex.appendChild(h); app.seq = new Seq(h, inst); }
    ex.hidden = !ex.children.length;
    // layout needs real dimensions
    requestAnimationFrame(() => {
      app.layout.mount();
      $('#hint').textContent = app.layout.hint();
      Object.keys(app.opts).forEach((k) => app.layout.onControl(k, app.opts[k]));
    });
    showRotateTip(inst);
  }
  function closeInstrument() {
    if (app.seq) { app.seq.destroy(); app.seq = null; }
    if (app.layout) { app.layout.unmount(); app.layout = null; }
    rec.reset();
    app.setPedal(false);
    if (met.on) { met.stop(); $('#metBtn').classList.remove('active'); }
    if (app.bus) { const b = app.bus; app.bus = null; try { b.gain.setTargetAtTime(0, A.ctx().currentTime, 0.05); } catch (e) { /* ignore */ } setTimeout(() => { try { b.disconnect(); } catch (e) { /* ignore */ } }, 600); }
    app.inst = null;
  }
  function showRotateTip(inst) {
    const t = $('#rotate'); t.hidden = true;
    if (!app.touch || inst.layout === 'theremin') return;
    if (window.innerHeight > window.innerWidth) { t.hidden = false; setTimeout(() => { t.hidden = true; }, 7000); }
  }
  const SECTIONS = ['home', 'learn', 'studio', 'player'];
  function show(name) {
    SECTIONS.forEach((n) => { $('#' + n).hidden = n !== name; });
    document.body.classList.toggle('playing', name === 'player');
    document.body.classList.toggle('studio', name === 'studio');
  }
  app.show = show;
  function renderLearn() {
    const T = VMI.tour, host = $('#learnBody'); host.innerHTML = '';
    const h = VMI.sui.h;
    host.append(
      h('h1', null, 'Learn the Studio'),
      h('p', { class: 'lead' }, 'Short guides from your first beat to a finished, exported song. Every guide has an interactive version: it opens the Studio and highlights each button as you go.'),
      h('div', { class: 'guides' }, T.lessons.map((l) => h('article', { class: 'guide' },
        h('h3', null, h('span', null, l.icon), l.title, h('small', null, l.mins + ' MIN')),
        h('p', null, l.desc),
        h('ol', null, l.steps.map((st) => h('li', null, h('b', null, st.title.replace(/^\d+\.\s*/, '') + ': '), st.text))),
        h('button', { class: 'btn accent sm', onclick: () => T.start(l.id) }, '▶ Start interactive lesson')))),
      h('div', { class: 'sec-h' }, h('div', null, h('h2', null, 'Playing single instruments'), h('p', null, 'Every instrument also has its own full-screen page (Home → Instruments).'))),
      h('div', { class: 'tips' },
        h('div', null, '🎹 Keyboards: bottom row Z–M is one octave, Q–P the next. S D G H J and 2 3 5 6 7 are the black keys. ↑ / ↓ shift octaves. Hold Space for the sustain pedal.'),
        h('div', null, '🎸 Guitars and banjo: A S D F G H J K L ; strum chords (hold Shift for an upstroke). 1–6 pick single strings. Bass, ukulele, violin and cello use one key row per string.'),
        h('div', null, '🥁 Drums and percussion: the key for each pad is printed on it. Space is the kick drum.'),
        h('div', null, '📱 Phones and tablets: tap with several fingers at once and slide for glissandos. Turn the phone sideways for more keys.')),
      h('div', { class: 'sec-h' }, h('div', null, h('h2', null, 'Studio keyboard shortcuts'))),
      h('div', { class: 'shortcuts' }, T.shortcuts.map(([k, v]) => h('div', null, h('span', null, v), h('kbd', null, k)))),
      h('div', { class: 'sec-h' }, h('div', null, h('h2', null, 'Recording tips'))),
      h('div', { class: 'tips' },
        h('div', null, '🎧 Wear headphones when you record, so the beat and the metronome don’t leak into the microphone.'),
        h('div', null, '🔒 The browser only allows the microphone on https:// pages or on http://localhost. If you open the file directly and the mic is blocked, use a local server (see the README).'),
        h('div', null, '🗣️ For Beatbox Lab, keep each sound short and leave small gaps. “B” = kick, “K” or “Pf” = snare, “Ts” = hi-hat.'),
        h('div', null, '⏱ If your takes sound a little late, nudge the clip left on the timeline. Count-in gives you one bar to get ready.')));
    window.scrollTo(0, 0);
  }
  function route() {
    const m = /^#\/(.+)$/.exec(location.hash);
    const id = m ? decodeURIComponent(m[1]) : '';
    if (id !== 'studio' && VMI.sui) VMI.sui.closeStudio();
    if (id === 'studio') {
      closeInstrument(); show('studio'); document.title = 'Studio — Virtual Instruments Studio';
      VMI.sui.openStudio();
    } else if (id === 'learn') {
      closeInstrument(); show('learn'); document.title = 'Learn — Virtual Instruments Studio'; renderLearn();
    } else if (id) openInstrument(id);
    else {
      closeInstrument(); show('home');
      document.title = 'Virtual Instruments Studio — make music in your browser';
    }
  }

  /* ---------- boot ---------- */
  function boot() {
    document.body.classList.toggle('touch', app.touch);
    A.volume = store.get('vol', 0.8);
    // instrument switcher
    const sel = $('#instSelect');
    const fillSelect = () => {
      sel.innerHTML = '';
      VMI.cats.forEach((c) => {
        const g = document.createElement('optgroup'); g.label = c.name;
        VMI.instruments.filter((i) => i.cat === c.id).forEach((i) => g.appendChild(new Option(i.emoji + '  ' + i.name, i.id)));
        sel.appendChild(g);
      });
    };
    // learn teaser + smooth scrolling links on the home page
    const teaser = $('#learnTeaser');
    VMI.tour.lessons.slice(1, 4).forEach((l) => {
      const b = mk('button', 'lt'); b.append(mk('span', 'li-i', l.icon), mk('b', null, l.title), mk('span', null, l.desc));
      b.addEventListener('click', () => VMI.tour.start(l.id)); teaser.appendChild(b);
    });
    document.querySelectorAll('[data-scroll]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault(); const t = $(a.getAttribute('href')); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    VMI.st.on('instruments', () => { fillSelect(); home.render(); });
    sel.addEventListener('change', () => { location.hash = '#/' + sel.value; sel.blur(); });
    $('#recBtn').addEventListener('click', () => rec.toggle());
    $('#playBtn').addEventListener('click', () => rec.play());
    $('#metBtn').addEventListener('click', () => { app.wake(); met.toggle(); });
    $('#setBtn').addEventListener('click', () => { const s = $('#settings'); s.hidden = !s.hidden; store.set('panel', !s.hidden); $('#setBtn').classList.toggle('active', !s.hidden); setTimeout(() => app.layout && app.layout.resize(), 50); });
    const bpm = $('#bpm'); bpm.value = met.bpm; $('#bpmVal').textContent = met.bpm;
    bpm.addEventListener('input', () => { met.bpm = +bpm.value; $('#bpmVal').textContent = met.bpm; store.set('bpm', met.bpm); });
    const fs = $('#fsBtn');
    if (!document.documentElement.requestFullscreen) fs.hidden = true;
    fs.addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); });
    document.addEventListener('fullscreenchange', () => setTimeout(() => app.layout && app.layout.resize(), 120));
    const open = store.get('panel', !app.touch);
    $('#settings').hidden = !open; $('#setBtn').classList.toggle('active', open);

    // unlock audio on first interaction (iOS/Chrome autoplay policies)
    ['pointerdown', 'keydown', 'touchend'].forEach((ev) => window.addEventListener(ev, () => A.resume(), { capture: true, passive: true }));

    // computer keyboard
    const typing = (e) => { const t = e.target; return t && (t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox' || t.tagName === 'TEXTAREA'); };
    window.addEventListener('keydown', (e) => {
      if (!app.layout || e.ctrlKey || e.metaKey || e.altKey || typing(e)) return;
      if (e.code === 'Escape') { location.hash = '#/'; return; }
      if (e.target && e.target.tagName === 'SELECT') return;
      let handled = false;
      if (app.inst.pedal && e.code === 'Space') { if (!e.repeat) app.setPedal(true); handled = true; }
      else handled = app.layout.keyDown(e);
      if (handled) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      if (!app.layout) return;
      if (app.inst.pedal && e.code === 'Space') { app.setPedal(false); e.preventDefault(); return; }
      if (app.layout.keyUp(e)) e.preventDefault();
    });
    window.addEventListener('blur', () => { if (app.layout) app.layout.releaseAll(); app.setPedal(false); });
    window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (app.layout) app.layout.resize(); }, 150); });
    window.addEventListener('orientationchange', () => setTimeout(() => app.layout && app.layout.resize(), 300));
    window.addEventListener('hashchange', route);
    // custom instruments live in IndexedDB: load them before showing anything
    const go = () => { home.build(); fillSelect(); route(); };
    // installable app: offline cache + "Install" button where the browser supports it
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      const nav = document.querySelector('#home .topnav nav'); if (!nav || nav.querySelector('.install')) return;
      const b = mk('a', 'install', '⬇ Install app'); b.href = '#'; b.addEventListener('click', (ev) => { ev.preventDefault(); e.prompt(); b.remove(); });
      nav.insertBefore(b, nav.firstChild);
    });
    Promise.race([VMI.st.lib.load(), new Promise((r) => setTimeout(r, 1500))]).catch(() => {}).then(go);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
