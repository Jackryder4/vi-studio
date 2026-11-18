/* logo.js — the living WACK MUZIC mark + the neon sign behind the home hero.
   Both beat like a pulse monitor (each peak jumps as an electric current runs through the line, then the whole line
   bounces up, down, up, down) on a fixed 3.2 s cycle. Pure SVG (SMIL) so it also runs in Safari / phones. */
(function () {
  'use strict';
  const VMI = (window.VMI = window.VMI || {});
  const CYCLE = 3.2; // seconds between electric pulses
  const still = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  // scale of each moving corner (peak1, trough1, peak2, trough2, peak3) at each moment of the cycle
  const FRAMES = [
    [0, [1, 1, 1, 1, 1]],
    [0.046, [1.4, 1, 1, 1, 1]],
    [0.104, [1.05, 1.35, 1, 1, 1]],
    [0.15, [1, 1.05, 1.6, 1, 1]],
    [0.196, [1, 1, 1.1, 1.35, 1]],
    [0.254, [1, 1, 1, 1.05, 1.4]],
    [0.3, [1, 1, 1, 1, 1]],
    [0.4, [0.78, 0.78, 0.78, 0.78, 0.78]],
    [0.5, [1.15, 1.15, 1.15, 1.15, 1.15]],
    [0.6, [0.88, 0.88, 0.88, 0.88, 0.88]],
    [0.7, [1.05, 1.05, 1.05, 1.05, 1.05]],
    [0.8, [1, 1, 1, 1, 1]],
    [1, [1, 1, 1, 1, 1]],
  ];
  const r1 = (v) => Math.round(v * 10) / 10;
  /** points of the W, baseline y → the static path and the SMIL animation of its shape */
  function wave(pts, base) {
    const d = (sc) => pts.map(([x, y], i) => (i ? 'L' : 'M') + x + ' ' + r1(i >= 2 && i <= 6 ? base + (y - base) * sc[i - 2] : y)).join(' ');
    return { d: d([1, 1, 1, 1, 1]), values: FRAMES.map((f) => d(f[1])).join(';'), keyTimes: FRAMES.map((f) => f[0]).join(';') };
  }
  const anim = (attr, values, keyTimes, begin, extra) =>
    still() ? '' : `<animate attributeName="${attr}" values="${values}" keyTimes="${keyTimes}" dur="${CYCLE}s" begin="${begin}s" repeatCount="indefinite"${extra || ''}/>`;
  /** shared SVG pieces: the animated path (in <defs>), the electric current and the zap filter */
  function parts(id, w, begin, sz) {
    const shape = anim('d', w.values, w.keyTimes, begin);
    const defs = `<path id="${id}w" d="${w.d}" pathLength="1000">${shape}</path>
      <filter id="${id}z" x="-20%" y="-40%" width="140%" height="180%"><feTurbulence type="turbulence" baseFrequency="${0.06 / sz}" numOctaves="1" seed="1" result="t">${still() ? '' : '<animate attributeName="seed" values="1;2;3;4;5;6;7;8" dur="0.24s" repeatCount="indefinite" calcMode="discrete"/>'}</feTurbulence><feDisplacementMap in="SourceGraphic" in2="t" scale="${14 * sz}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
    const run = anim('stroke-dashoffset', '80;-1000;-1000', '0;0.3;1', begin);
    const vis = still() ? ' visibility="hidden"' : '';
    const current = `<use href="#${id}w" class="wm-cur" stroke="#ffffff" stroke-width="${16 * sz}" stroke-dasharray="80 2000" stroke-dashoffset="80" filter="url(#${id}b)"${vis}>${run}</use>
      <use href="#${id}w" class="wm-zap" stroke="#e8ffff" stroke-width="${5 * sz}" stroke-dasharray="80 2000" stroke-dashoffset="80" filter="url(#${id}z)"${vis}>${run}${anim('visibility', 'visible;hidden', '0;0.3', begin, ' calcMode="discrete"')}</use>
      <use href="#${id}w" stroke="#ffffff" stroke-width="${7 * sz}" stroke-dasharray="40 2000" stroke-dashoffset="80"${vis}>${anim('stroke-dashoffset', '60;-1020;-1020', '0;0.3;1', begin)}</use>`;
    const flash = (r, big) => anim('r', `${r};${r};${big};${r};${r}`, '0;0.28;0.32;0.45;1', begin);
    const glowPulse = anim('opacity', '.75;1;1;.75;.9;.7;.75', '0;0.1;0.3;0.4;0.5;0.6;1', begin);
    return { defs, current, flash, glowPulse };
  }

  /* ---------- the app mark (top bar, hero, studio button) ---------- */
  const MARK = [[64, 262], [116, 262], [150, 148], [203, 362], [256, 198], [309, 362], [362, 148], [396, 262], [448, 262]];
  const markWave = wave(MARK, 262);
  let uid = 0;
  /** returns an <svg> element; opts.tile = draw the rounded tile behind it */
  VMI.logoMark = (opts) => {
    opts = opts || {};
    const id = 'wm' + ++uid, tile = opts.tile !== false, P = parts(id, markWave, 1.6, 1);
    const svg = `<svg class="wm-mark${opts.big ? ' big' : ''}" viewBox="0 0 512 512" aria-hidden="true">
      <defs>
        <linearGradient id="${id}n" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FF2BD6"/><stop offset=".5" stop-color="#6B2BFF"/><stop offset="1" stop-color="#22E6FF"/></linearGradient>
        <linearGradient id="${id}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#191924"/><stop offset="1" stop-color="#07070B"/></linearGradient>
        <filter id="${id}b" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="16"/></filter>
        <clipPath id="${id}c"><rect x="16" y="16" width="480" height="480" rx="112"/></clipPath>
        ${P.defs}
      </defs>
      ${tile ? `<rect x="16" y="16" width="480" height="480" rx="112" fill="url(#${id}t)"/><rect class="wm-edge" x="18" y="18" width="476" height="476" rx="110" fill="none" stroke="url(#${id}n)" stroke-width="4"/>` : ''}
      <g clip-path="url(#${id}c)" fill="none" stroke-linecap="round" stroke-linejoin="round">
        <g class="wm-glow"><use href="#${id}w" stroke="url(#${id}n)" stroke-width="46" filter="url(#${id}b)">${P.glowPulse}</use></g>
        <g class="wm-split"><use href="#${id}w" stroke="#22E6FF" stroke-width="26" opacity=".35" transform="translate(-7 0)"/><use href="#${id}w" stroke="#FF2BD6" stroke-width="26" opacity=".35" transform="translate(7 0)"/></g>
        <use class="wm-line" href="#${id}w" stroke="url(#${id}n)" stroke-width="26"/>
        <use class="wm-core" href="#${id}w" stroke="#fff" stroke-width="7" opacity=".75"/>
        ${P.current}
        <g class="wm-spark"><circle cx="448" cy="262" r="24" fill="#22E6FF" filter="url(#${id}b)">${P.flash(24, 46)}</circle><circle cx="448" cy="262" r="11" fill="#E9FDFF">${P.flash(11, 19)}</circle></g>
      </g>
    </svg>`;
    const wrap = document.createElement('span'); wrap.innerHTML = svg.trim();
    const el = wrap.firstChild;
    el.addEventListener('pointerenter', () => { el.classList.remove('burst'); void el.getBoundingClientRect(); el.classList.add('burst'); });
    return el;
  };

  /* ---------- the big neon sign on the wall behind the home hero ----------
     Same coordinates as brand/keyart.html (the hero photo is rendered without its sign; this draws it live on top). */
  const SIGN = [[0, 140], [60, 140], [100, 20], [160, 250], [220, 70], [280, 250], [340, 20], [380, 140], [440, 140]];
  VMI.heroSign = () => {
    const hero = document.querySelector('.hero2'); if (!hero || hero.querySelector('.hero-sign')) return;
    const id = 'hs', P = parts(id, wave(SIGN, 140), 0.5, 1.3);
    const div = document.createElement('div'); div.className = 'hero-sign'; div.setAttribute('aria-hidden', 'true');
    div.innerHTML = `<svg viewBox="0 0 1920 1080" preserveAspectRatio="xMaxYMid slice">
      <defs>
        <linearGradient id="${id}n" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#FF2BD6"/><stop offset=".5" stop-color="#6B2BFF"/><stop offset="1" stop-color="#22E6FF"/></linearGradient>
        <filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22"/></filter>
        <filter id="${id}s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
        <clipPath id="${id}c" clipPathUnits="userSpaceOnUse"><path clip-rule="evenodd" d="M-200 -200 H700 V600 H-200 Z M-12 229 H500 V600 H-12 Z"/></clipPath>
        ${P.defs}
      </defs>
      <g transform="translate(1000 120) scale(1.35)" fill="none" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#${id}c)">
        <use href="#${id}w" stroke="url(#${id}n)" stroke-width="30" filter="url(#${id}b)" opacity=".9">${P.glowPulse}</use>
        <use href="#${id}w" stroke="url(#${id}n)" stroke-width="13"/>
        <use href="#${id}w" stroke="#fff" stroke-width="4" opacity=".8"/>
        ${P.current}
        <circle cx="440" cy="140" r="14" fill="#22E6FF" filter="url(#${id}s)">${P.flash(14, 30)}</circle><circle cx="440" cy="140" r="6" fill="#eaffff">${P.flash(6, 11)}</circle>
      </g>
    </svg>`;
    hero.prepend(div);
    // line the sign up with the photo exactly as CSS draws it (background-size: cover; x = 100% on wide screens,
    // 76% on phones so the sign is in view there too — keep in sync with .hero2::before in base.css)
    const svg = div.firstElementChild; svg.setAttribute('preserveAspectRatio', 'none');
    const fit = () => {
      const W = div.clientWidth, H = div.clientHeight; if (!W || !H) return;
      const k = Math.max(W / 1920, H / 1080), vw = W / k, vh = H / k, px = W < 760 ? 0.76 : 1;
      svg.setAttribute('viewBox', `${((1920 - vw) * px).toFixed(1)} ${((1080 - vh) / 2).toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`);
    };
    fit();
    if (window.ResizeObserver) new ResizeObserver(fit).observe(div); else addEventListener('resize', fit);
  };

  /** swap every static logo image for the living one */
  VMI.animateLogos = () => {
    document.querySelectorAll('img.bm-img').forEach((img) => { const m = VMI.logoMark(); m.classList.add('bm-img'); img.replaceWith(m); });
    const hero = document.querySelector('.hero2 > div:not(.hero-sign)');
    if (hero && !hero.querySelector('.hero-mark')) { const m = VMI.logoMark({ big: true }); m.classList.add('hero-mark'); hero.prepend(m); }
    VMI.heroSign();
  };
})();
