/* ui.js — instrument layouts: keys, scale (harp/kalimba…), frets, pads, theremin */
(function () {
  'use strict';
  const VMI = window.VMI, A = VMI.audio, V = VMI.voices;
  const L = (VMI.layouts = {});
  const $ = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const BLACK = [1, 3, 6, 8, 10];
  const KL = { Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '-', Space: 'Space' };
  const klabel = (c) => KL[c] || (c.startsWith('Key') ? c.slice(3) : c.startsWith('Digit') ? c.slice(5) : c);

  const R_NUM = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal'];
  const R_Q = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP', 'BracketLeft', 'BracketRight'];
  const R_A = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote'];
  const R_Z = ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN', 'KeyM', 'Comma', 'Period', 'Slash'];

  /* piano-style computer keyboard map: [code, semitone offset] */
  const LOWER = [['KeyZ', 0], ['KeyS', 1], ['KeyX', 2], ['KeyD', 3], ['KeyC', 4], ['KeyV', 5], ['KeyG', 6], ['KeyB', 7], ['KeyH', 8], ['KeyN', 9], ['KeyJ', 10], ['KeyM', 11], ['Comma', 12], ['KeyL', 13], ['Period', 14], ['Semicolon', 15], ['Slash', 16]];
  const UPPER = [['KeyQ', 0], ['Digit2', 1], ['KeyW', 2], ['Digit3', 3], ['KeyE', 4], ['KeyR', 5], ['Digit5', 6], ['KeyT', 7], ['Digit6', 8], ['KeyY', 9], ['Digit7', 10], ['KeyU', 11], ['KeyI', 12], ['Digit9', 13], ['KeyO', 14], ['Digit0', 15], ['KeyP', 16], ['BracketLeft', 17], ['Equal', 18], ['BracketRight', 19]];

  /* =========================================================
     Base layout: pointer + keyboard plumbing, press/lift
     ========================================================= */
  class Base {
    constructor(app, inst, root) {
      this.app = app; this.inst = inst; this.root = root;
      this.active = new Map(); this.specs = new Map(); this.els = new Map(); this.keymap = new Map();
      this.ptr = new Map(); this.held = new Map(); this.cleanups = []; this.glide = false; this.timers = new Set();
    }
    on(target, ev, fn, opt) { target.addEventListener(ev, fn, opt); this.cleanups.push(() => target.removeEventListener(ev, fn, opt)); }
    later(fn, ms) { const id = setTimeout(() => { this.timers.delete(id); fn(); }, ms); this.timers.add(id); return id; }
    mount() { this.root.classList.add('layout-' + this.inst.layout); this.render(); this.bindPointer(); this.lastW = this.root.clientWidth; this.lastH = this.root.clientHeight; }
    unmount() {
      this.releaseAll(); this.timers.forEach(clearTimeout); this.timers.clear();
      this.cleanups.forEach((f) => f()); this.cleanups = []; this.root.innerHTML = '';
    }
    register(id, el, spec, codes) {
      this.els.set(id, el); this.specs.set(id, spec); el.dataset.id = id;
      (codes || []).forEach((c) => { if (!this.keymap.has(c)) this.keymap.set(c, id); });
    }
    clearMaps() { this.els.clear(); this.specs.clear(); this.keymap.clear(); }
    velAt() { return 0.8; }
    press(id, vel) {
      if (this.active.has(id)) return;
      const spec = this.specs.get(id); if (!spec) return;
      if (spec.choke) {
        for (const [oid, a] of Array.from(this.active)) {
          if (this.specs.get(oid).choke === spec.choke) { this.app.kill(a.h); this.active.delete(oid); const e = this.els.get(oid); if (e) e.classList.remove('on'); }
        }
      }
      const h = this.app.start(this.inst, spec, vel == null ? 0.8 : vel);
      this.active.set(id, { h, t: performance.now() });
      const el = this.els.get(id); if (el) el.classList.add('on');
      this.app.rec.log('on', id, vel);
    }
    lift(id) {
      const a = this.active.get(id); if (!a) return;
      this.active.delete(id);
      this.app.stop(this.inst, a.h);
      const el = this.els.get(id);
      if (el) {
        const rem = Math.max(0, (this.inst.ring ? 150 : 0) - (performance.now() - a.t));
        if (rem) this.later(() => { if (!this.active.has(id)) el.classList.remove('on'); }, rem); else el.classList.remove('on');
      }
      this.app.rec.log('off', id);
    }
    pulse(id, vel, ms) { this.press(id, vel); this.later(() => this.lift(id), ms || 45); }
    releaseAll() { Array.from(this.active.keys()).forEach((id) => this.lift(id)); this.ptr.clear(); this.held.clear(); }
    bindPointer() {
      const el = this.root;
      const hit = (e) => {
        const t = document.elementFromPoint(e.clientX, e.clientY);
        const k = t && t.closest ? t.closest('[data-id]') : null;
        return k && el.contains(k) ? k : null;
      };
      this.on(el, 'pointerdown', (e) => {
        if (e.button > 0) return;
        this.app.wake();
        const k = hit(e); if (!k) return;
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        this.ptr.set(e.pointerId, k.dataset.id);
        this.press(k.dataset.id, this.velAt(k, e));
      });
      this.on(el, 'pointermove', (e) => {
        if (!this.glide || !this.ptr.has(e.pointerId)) return;
        const k = hit(e), cur = this.ptr.get(e.pointerId);
        if (!k || k.dataset.id === cur) return;
        this.lift(cur);
        this.ptr.set(e.pointerId, k.dataset.id);
        this.press(k.dataset.id, this.velAt(k, e));
      });
      const up = (e) => { const id = this.ptr.get(e.pointerId); if (id == null) return; this.ptr.delete(e.pointerId); this.lift(id); };
      this.on(el, 'pointerup', up); this.on(el, 'pointercancel', up); this.on(el, 'lostpointercapture', up);
      this.on(el, 'contextmenu', (e) => e.preventDefault());
    }
    keyDown(e) {
      const id = this.keymap.get(e.code);
      if (id == null || this.held.has(e.code)) return id != null;
      this.held.set(e.code, id); this.press(id, 0.8); return true;
    }
    keyUp(e) {
      const id = this.held.get(e.code); if (id == null) return false;
      this.held.delete(e.code); this.lift(id); return true;
    }
    resize() {
      const w = this.root.clientWidth, h = this.root.clientHeight;
      if (Math.abs(w - this.lastW) > 30 || Math.abs(h - this.lastH) > 30) { this.lastW = w; this.lastH = h; this.releaseAll(); this.render(); }
    }
    onControl() { }
    hint() { return ''; }
  }

  /* =========================================================
     Keys — chromatic piano-style keyboard (many skins)
     ========================================================= */
  class Keys extends Base {
    constructor(a, i, r) { super(a, i, r); this.glide = true; this.start = i.cfg.start; }
    cmin() { return Math.ceil(this.inst.cfg.min / 12) * 12; }
    whiteCount(s) { let n = 0; for (let m = s; m <= this.inst.cfg.max; m++) if (!BLACK.includes(((m % 12) + 12) % 12)) n++; return n; }
    render() {
      const cfg = this.inst.cfg, root = this.root;
      root.innerHTML = ''; this.clearMaps();
      const w = root.clientWidth || window.innerWidth;
      const kw = this.app.touch ? Math.min(cfg.kw || 44, 46) : (cfg.kw || 48);
      let want = Math.max(7, Math.round(w / kw));
      let start = this.start - (((this.start % 12) + 12) % 12);
      start = Math.max(start, this.cmin());
      while (this.whiteCount(start) < want && start - 12 >= this.cmin()) start -= 12;
      want = Math.min(want, this.whiteCount(start));
      this.start = start; this.want = want;
      const wrap = $('div', 'kb skin-' + cfg.skin); root.appendChild(wrap);
      const unit = 100 / want;
      let wi = 0;
      for (let m = start; wi < want && m <= cfg.max; m++) {
        const pc = m % 12, black = BLACK.includes(pc);
        const k = $('div', 'key ' + (black ? 'b' : 'w') + (pc === 0 ? ' c' : ''));
        if (!black) { k.style.left = wi * unit + '%'; k.style.width = unit + '%'; wi++; }
        else { const bw = unit * 0.62; k.style.left = wi * unit - bw / 2 + '%'; k.style.width = bw + '%'; }
        k.style.setProperty('--i', (wi / want).toFixed(3));
        k.appendChild($('span', 'nl', A.m2n(m)));
        this.register(String(m), k, { midi: m }, []);
        wrap.appendChild(k);
      }
      const base = start + (want >= 22 ? 12 : 0);
      const assign = (list, b) => list.forEach(([code, off]) => {
        const id = String(b + off);
        if (!this.els.has(id) || this.keymap.has(code)) return;
        this.keymap.set(code, id);
        const el = this.els.get(id);
        if (!el.querySelector('.kl')) el.appendChild($('span', 'kl', klabel(code)));
      });
      assign(LOWER, base); assign(UPPER, base + 12);
    }
    shift(d) {
      const last = Math.max(this.cmin(), Math.floor(this.inst.cfg.max / 12) * 12 - 12);
      this.start = clamp(this.start + d, this.cmin(), last);
      this.releaseAll(); this.render();
    }
    velAt(k, e) { const r = k.getBoundingClientRect(); return clamp(0.4 + 0.6 * ((e.clientY - r.top) / r.height), 0.3, 1); }
    keyDown(e) {
      if (e.code === 'ArrowUp') { this.shift(12); return true; }
      if (e.code === 'ArrowDown') { this.shift(-12); return true; }
      return super.keyDown(e);
    }
    hint() { return this.app.touch ? 'Tap the keys — multi-touch works, slide a finger for glissando. Use the octave buttons in ⚙ to move up and down.' : 'Play with your keyboard: bottom rows Z–M and Q–P are two octaves (S D G H J and 2 3 5 6 7 = sharps). ↑ / ↓ shifts octave.' + (this.inst.pedal ? ' Hold Space for sustain.' : ''); }
  }
  L.keys = Keys;

  /* =========================================================
     Scale — harp, kalimba, tubular bells, chimes, pan flute…
     ========================================================= */
  const FLAT = [].concat(R_Z.slice(0, 10), R_A.slice(0, 10), R_Q.slice(0, 10), R_NUM.slice(0, 10));
  class Scale extends Base {
    constructor(a, i, r) { super(a, i, r); this.glide = true; }
    render() {
      const cfg = this.inst.cfg, root = this.root;
      root.innerHTML = ''; this.clearMaps();
      const w = root.clientWidth || window.innerWidth;
      const count = Math.min(cfg.count, Math.max(5, Math.floor(w / cfg.minw)));
      const startM = A.n2m(cfg.start), sc = cfg.scale;
      const midi = (i) => startM + Math.floor(i / sc.length) * 12 + sc[i % sc.length];
      let order = [...Array(count).keys()];
      if (cfg.zigzag) {
        const left = [], right = [];
        for (let i = 1; i < count; i++) (i % 2 ? left : right).push(i);
        order = left.reverse().concat([0], right);
      }
      const wrap = $('div', 'scale skin-' + cfg.skin); root.appendChild(wrap);
      order.forEach((idx) => {
        const m = midi(idx), pc = m % 12;
        const k = $('div', 'str' + (pc === 0 ? ' c' : '') + (pc === 5 ? ' f' : ''));
        const len = cfg.zigzag ? 1 - 0.5 * (idx / Math.max(1, count - 1)) : 1 - 0.55 * (idx / Math.max(1, count - 1));
        k.style.setProperty('--h', len.toFixed(3));
        k.appendChild($('span', 'body'));
        k.appendChild($('span', 'nl', A.m2n(m)));
        if (idx < FLAT.length) k.appendChild($('span', 'kl', klabel(FLAT[idx])));
        this.register(String(idx), k, { midi: m }, idx < FLAT.length ? [FLAT[idx]] : []);
        wrap.appendChild(k);
      });
      this.wrap = wrap;
      if (cfg.hover && !this.hoverBound) {
        this.hoverBound = true;
        let last = null;
        this.on(root, 'pointerover', (e) => {
          if (e.pointerType !== 'mouse' || e.buttons) return;
          const k = e.target.closest && e.target.closest('[data-id]');
          if (!k || k.dataset.id === last) return;
          last = k.dataset.id; this.app.wake();
          this.pulse(last, 0.45, 80);
        });
        this.on(root, 'pointerleave', () => { last = null; });
      }
    }
    onControl(id, val) {
      if (id !== 'breeze') return;
      clearTimeout(this.breezeT);
      if (!val) return;
      const gust = () => {
        const ids = Array.from(this.els.keys());
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.later(() => this.pulse(ids[Math.floor(Math.random() * ids.length)], 0.25 + Math.random() * 0.4, 70), i * (60 + Math.random() * 120));
        this.breezeT = setTimeout(gust, 350 + Math.random() * 1400);
      };
      gust();
    }
    unmount() { clearTimeout(this.breezeT); super.unmount(); }
    hint() {
      const touch = this.app.touch;
      const k = this.inst.cfg.hover ? (touch ? 'Swipe across the chimes.' : 'Just hover the mouse over the chimes, or use your keyboard.') : (touch ? 'Tap or swipe across to play.' : 'Click, drag across, or use the keyboard rows (Z-row = lowest, 1-row = highest).');
      return k;
    }
  }
  L.scale = Scale;

  /* =========================================================
     Frets — guitar, bass, ukulele, banjo, mandolin, violin, cello
     ========================================================= */
  class Frets extends Base {
    constructor(a, i, r) { super(a, i, r); this.glide = true; this.chord = i.cfg.chords ? 0 : null; this.strLast = []; }
    render() {
      const cfg = this.inst.cfg, root = this.root, n = cfg.tuning.length, nf = cfg.frets;
      root.innerHTML = ''; this.clearMaps(); this.chordBtns = [];
      if (cfg.chords) {
        const bar = $('div', 'chordbar');
        cfg.chords.forEach((ch, i) => {
          const b = $('button', 'chord'); b.type = 'button';
          b.appendChild($('b', null, ch.n)); b.appendChild($('i', null, klabel(ch.k)));
          b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.app.wake(); this.strum(i, false); });
          bar.appendChild(b); this.chordBtns.push(b);
          this.keymap.set(ch.k, 'chord:' + i);
        });
        root.appendChild(bar);
      }
      const board = $('div', 'fretboard skin-' + cfg.skin);
      board.style.setProperty('--nf', nf + 1);
      const head = $('div', 'frow fhead');
      for (let f = 0; f <= nf; f++) head.appendChild($('div', 'fnum' + ([3, 5, 7, 9, 12].includes(f) ? ' dot' : ''), f === 0 ? '' : String(f)));
      board.appendChild(head);
      for (let r = 0; r < n; r++) {
        const s = n - 1 - r, row = $('div', 'frow srow s' + s);
        row.style.setProperty('--th', (1 + s * 0.35).toFixed(2));
        for (let f = 0; f <= nf; f++) {
          const m = A.n2m(cfg.tuning[s]) + f;
          const c = $('div', 'cell' + (f === 0 ? ' open' : '') + ([3, 5, 7, 9, 12].includes(f) ? ' mark' : ''));
          c.appendChild($('span', 'nl', A.m2n(m)));
          this.register(s + ':' + f, c, { midi: m, string: s, fret: f }, []);
          row.appendChild(c);
        }
        board.appendChild(row);
      }
      root.appendChild(board);
      if (cfg.rows) {
        const sets = [R_NUM, R_Q, R_A, R_Z];
        for (let r = 0; r < n && r < 4; r++) {
          const s = n - 1 - r;
          sets[r].slice(0, nf).forEach((code, f) => {
            const id = s + ':' + f;
            this.keymap.set(code, id);
            this.els.get(id).appendChild($('span', 'kl', klabel(code)));
          });
        }
      }
      this.markChord();
    }
    markChord() {
      this.els.forEach((e) => e.classList.remove('fing'));
      this.chordBtns.forEach((b, i) => b.classList.toggle('active', i === this.chord));
      const cfg = this.inst.cfg;
      if (this.chord == null) return;
      cfg.chords[this.chord].f.forEach((f, s) => { if (f >= 0) { const e = this.els.get(s + ':' + f); if (e) e.classList.add('fing'); } });
    }
    press(id, vel) {
      if (this.active.has(id) || !this.specs.has(id)) return;
      const s = this.specs.get(id).string;
      super.press(id, vel);
      const a = this.active.get(id); if (!a || !a.h) return;
      const prev = this.strLast[s];
      if (prev && prev !== a.h) this.app.kill(prev);
      this.strLast[s] = a.h;
    }
    strum(i, up) {
      const ch = this.inst.cfg.chords[i];
      this.chord = i; this.markChord();
      let strs = []; ch.f.forEach((f, s) => { if (f >= 0) strs.push(s); });
      if (up) strs = strs.reverse();
      strs.forEach((s, k) => this.later(() => this.pulse(s + ':' + ch.f[s], 0.7 + Math.random() * 0.2, 60), k * 22));
    }
    keyDown(e) {
      const cfg = this.inst.cfg;
      if (cfg.chords) {
        const target = this.keymap.get(e.code);
        if (target && target.startsWith('chord:')) { if (!e.repeat) this.strum(+target.slice(6), e.shiftKey); return true; }
        if (e.code === 'Space') { if (!e.repeat) this.strum(this.chord == null ? 0 : this.chord, e.shiftKey); return true; }
        const m = /^Digit([1-9])$/.exec(e.code);
        if (m) {
          const s = +m[1] - 1;
          if (s < cfg.tuning.length && !e.repeat) {
            const f = this.chord == null ? 0 : cfg.chords[this.chord].f[s];
            if (f >= 0) this.pulse(s + ':' + f, 0.8, 60);
          }
          return true;
        }
        return false;
      }
      return super.keyDown(e);
    }
    hint() {
      const c = this.inst.cfg;
      if (c.chords) return this.app.touch ? 'Tap a chord to strum it, or press/drag across the fretboard to pick notes.' : 'Chord keys A S D F G H J K L ; strum (hold Shift for an upstroke). Keys 1–6 pick single strings of the current chord, Space strums again. You can also click the fretboard.';
      return this.app.touch ? 'Press frets with your fingers; each row is a string. Slide to change notes.' : 'Each keyboard row is a string (top row = highest string); each column is a fret. You can also click the fretboard.';
    }
  }
  L.frets = Frets;

  /* =========================================================
     Pads — drums, percussion, pans, bowls, harmonica
     ========================================================= */
  class Pads extends Base {
    constructor(a, i, r) { super(a, i, r); this.glide = !!i.cfg.glide; }
    render() {
      const cfg = this.inst.cfg, root = this.root;
      root.innerHTML = ''; this.clearMaps();
      const field = $('div', 'padfield arr-' + cfg.arrange + (cfg.harp ? ' harp' : '') + (cfg.round ? ' round' : '') + (cfg.bowl ? ' bowls' : ''));
      root.appendChild(field);
      const mk = (p) => {
        const d = $('div', 'pad' + (p.shape ? ' ' + p.shape : '') + (p.note ? ' tuned' : ''));
        if (p.color) d.style.setProperty('--c', p.color);
        d.appendChild($('span', 'pl', p.label));
        if (p.sub) d.appendChild($('span', 'ps', p.sub));
        if (p.keys && p.keys[0]) d.appendChild($('span', 'kl', klabel(p.keys[0])));
        this.register(p.id, d, { pad: p, midi: p.note ? A.n2m(p.note) : undefined, choke: p.choke }, p.keys);
        field.appendChild(d);
        return d;
      };
      const place = (d, x, y, r, h) => {
        d.style.left = x - r + '%'; d.style.top = ((y - r) / h) * 100 + '%';
        d.style.width = r * 2 + '%'; d.style.height = ((r * 2) / h) * 100 + '%';
      };
      const fit = (ratio) => {
        field.style.aspectRatio = String(ratio);
        const rw = root.clientWidth - 24, rh = root.clientHeight - 20;
        field.style.width = Math.max(200, Math.min(rw, rh * ratio)) + 'px';
      };
      if (cfg.arrange === 'grid') {
        const rows = Math.ceil(cfg.pads.length / cfg.cols);
        field.style.gridTemplateColumns = 'repeat(' + cfg.cols + ', 1fr)';
        field.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';
        fit((cfg.cols * (cfg.harp ? 0.75 : 1.2)) / rows);
        cfg.pads.forEach(mk);
      } else if (cfg.arrange === 'free') {
        fit(cfg.w / cfg.h);
        cfg.pads.forEach((p) => place(mk(p), p.x, p.y, p.r, cfg.h));
      } else {
        fit(1);
        const hasCenter = cfg.pads[0].r != null;
        const ring = hasCenter ? cfg.pads.slice(1) : cfg.pads;
        if (hasCenter) place(mk(cfg.pads[0]), 50, 50, cfg.pads[0].r, 100);
        ring.forEach((p, i) => {
          const a = ((-90 + (360 / ring.length) * i + (cfg.rot || 0)) * Math.PI) / 180;
          const pr = p.r || cfg.pr;
          place(mk(p), 50 + cfg.r * Math.cos(a), 50 + cfg.r * Math.sin(a), pr, 100);
        });
      }
    }
    hint() {
      const t = this.app.touch;
      const c = this.inst.cfg;
      if (c.harp) return t ? 'Press and slide across holes — top row blows, bottom row draws.' : 'Hold a key (Q–P = blow, A–; = draw) or click and drag across the holes.';
      if (c.seq) return t ? 'Tap pads to play, or build a loop with the sequencer below.' : 'Pads map to the keys shown on each one. Build a beat in the sequencer below and press Play.';
      return t ? 'Tap the pads — multi-touch is supported.' : 'Use the keyboard keys shown on each pad, or click / tap them.';
    }
  }
  L.pads = Pads;

  /* =========================================================
     Theremin — continuous XY control
     ========================================================= */
  class Theremin extends Base {
    constructor(a, i, r) { super(a, i, r); this.v = null; this.pid = null; this.kcodes = []; }
    render() {
      const cfg = this.inst.cfg, root = this.root;
      root.innerHTML = '';
      this.lo = A.n2m(cfg.lo); this.span = cfg.octaves * 12;
      const f = $('div', 'thfield'); root.appendChild(f); this.field = f;
      for (let i = 0; i <= this.span; i++) {
        const pc = (this.lo + i) % 12;
        if (BLACK.includes(pc)) continue;
        const g = $('div', 'thline' + (pc === 0 ? ' c' : '')); g.style.left = (i / this.span) * 100 + '%';
        if (pc === 0 || pc === 7) g.appendChild($('span', null, A.m2n(this.lo + i)));
        f.appendChild(g);
      }
      this.dot = $('div', 'thdot'); f.appendChild(this.dot);
      this.readout = $('div', 'throut', 'Touch or click here'); f.appendChild(this.readout);
      const ant = $('div', 'thant'); f.appendChild(ant);
    }
    bindPointer() {
      const el = this.root;
      const pos = (e) => { const r = this.field.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)]; };
      this.on(el, 'pointerdown', (e) => {
        if (this.pid != null || e.button > 0 || !this.field.contains(e.target)) return;
        this.app.wake(); e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        this.pid = e.pointerId; this.begin(); this.move(pos(e));
      });
      this.on(el, 'pointermove', (e) => { if (e.pointerId === this.pid) this.move(pos(e)); });
      const up = (e) => { if (e.pointerId === this.pid) { this.pid = null; this.end(); } };
      this.on(el, 'pointerup', up); this.on(el, 'pointercancel', up); this.on(el, 'lostpointercapture', up);
      this.on(el, 'contextmenu', (e) => e.preventDefault());
    }
    begin() {
      if (this.v) return;
      const c = A.ctx(); if (!c) return;
      this.v = V.thereminStart(c, this.app.bus, this.app.opts);
      this.field.classList.add('on');
    }
    end() { if (this.v) { this.v.release(); this.v = null; } this.field.classList.remove('on'); this.readout.textContent = 'Touch or click here'; }
    setNote(midi, amp, x, y) {
      if (!this.v) return;
      const m = midi + this.app.transpose;
      this.v.set(A.mtof(m), amp);
      this.dot.style.left = x * 100 + '%'; this.dot.style.top = y * 100 + '%';
      this.dot.style.setProperty('--a', amp.toFixed(2));
      this.readout.textContent = A.m2n(Math.round(m)) + '  ·  ' + Math.round(A.mtof(m)) + ' Hz';
    }
    move([x, y]) {
      let m = this.lo + x * this.span;
      if (this.app.opts.snap) m = Math.round(m);
      this.setNote(m, Math.pow(clamp(1 - y, 0, 1), 1.4), x, y);
    }
    keyDown(e) {
      const base = this.lo + 12;
      const hit = LOWER.concat(UPPER.map(([c, o]) => [c, o + 12])).find(([c]) => c === e.code);
      if (!hit) return false;
      if (e.repeat) return true;
      this.app.wake(); this.begin();
      this.kcodes.push(e.code);
      const m = base + hit[1];
      this.setNote(m, 0.8, clamp((m - this.lo) / this.span, 0, 1), 0.3);
      return true;
    }
    keyUp(e) {
      const i = this.kcodes.indexOf(e.code); if (i < 0) return false;
      this.kcodes.splice(i, 1);
      if (!this.kcodes.length && this.pid == null) this.end();
      return true;
    }
    releaseAll() { this.end(); this.pid = null; this.kcodes = []; }
    resize() { }
    hint() { return this.app.touch ? 'Touch and slide: left–right changes pitch, up–down changes volume.' : 'Click and drag: left–right = pitch, up–down = volume. Or use the piano keys on your keyboard (Z–M / Q–P).'; }
  }
  L.theremin = Theremin;
})();
