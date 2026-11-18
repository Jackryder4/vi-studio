/* mapper.js — Sound Mapper: every distinct mouth sound in a recording → any drum, any instrument, or your own sample */
(function () {
  'use strict';
  const VMI = window.VMI, A = VMI.audio, ST = VMI.st;
  const MP = (VMI.mapper = {});
  const h = (...a) => VMI.sui.h(...a);
  const clamp = ST.clamp;
  const GCOL = ['#ff2bd6', '#22e6ff', '#ffb02e', '#46d37a', '#b57cff', '#ff6b81', '#7ff0ff', '#ffd84d'];

  /* k-means on feature vectors */
  function kmeans(X, K, iters) {
    const n = X.length, dim = X[0].length; let C = [];
    // k-means++ style seeding (deterministic: farthest point)
    C.push(X[0].slice());
    while (C.length < K) { let best = 0, bd = -1; X.forEach((x, i) => { const d = Math.min(...C.map((c) => dist(x, c))); if (d > bd) { bd = d; best = i; } }); C.push(X[best].slice()); }
    let lab = new Array(n).fill(0);
    for (let it = 0; it < (iters || 25); it++) {
      lab = X.map((x) => { let b = 0, bd = Infinity; C.forEach((c, j) => { const d = dist(x, c); if (d < bd) { bd = d; b = j; } }); return b; });
      C = C.map((c, j) => { const m = new Array(dim).fill(0); let cnt = 0; X.forEach((x, i) => { if (lab[i] === j) { cnt++; for (let d = 0; d < dim; d++) m[d] += x[d]; } }); return cnt ? m.map((v) => v / cnt) : c; });
    }
    const sse = X.reduce((s, x, i) => s + dist(x, C[lab[i]]), 0);
    return { lab, sse };
  }
  function dist(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const w = i < 16 ? 1 : i < 18 ? 2.5 : 5; s += w * (a[i] - b[i]) * (a[i] - b[i]); } return s; }
  const rmsOf = (d, a, b) => { a = Math.max(0, a); b = Math.min(d.length, b); let e = 0; for (let i = a; i < b; i++) e += d[i] * d[i]; return b > a ? Math.sqrt(e / (b - a)) : 0; };
  /** how a sound evolves: does it ring on (hum, whistle) or die fast (kick, click)? is its pitch steady (a note) or not? */
  function shape(d, sr, a, b) {
    const dur = (b - a) / sr, head = rmsOf(d, a, a + sr * 0.04) + 1e-6, body = rmsOf(d, a + sr * 0.09, Math.min(b, a + sr * 0.25));
    let tonal = 0;
    if (dur > 0.12) {
      const tr = VMI.pitch.track(d.subarray(a, b), sr), ms = []; let n = 0;
      tr.f0.forEach((f) => { n++; if (f) ms.push(VMI.pitch.ftom(f)); });
      if (ms.length >= 3) { const mean = ms.reduce((x, y) => x + y, 0) / ms.length, sd = Math.sqrt(ms.reduce((x, y) => x + (y - mean) * (y - mean), 0) / ms.length); tonal = (ms.length / Math.max(1, n)) * (sd < 0.8 ? 1 : sd < 2 ? 0.4 : 0.1); }
    }
    return { sustain: Math.min(1.5, body / head), durF: Math.min(1.5, Math.max(0, Math.log2(dur / 0.04) / 4)), tonal };
  }

  MP.kmeans = (X, K) => kmeans(X, K);
  const melodic = () => VMI.instruments.filter((i) => i.layout !== 'pads' && i.layout !== 'theremin');
  const DRUMS = () => VMI.instruments.filter((i) => i.layout === 'pads' && !i.custom && i.cfg.pads.some((p) => p.id === 'kick'));

  MP.open = (sampleId, clip) => {
    const s = ST.lib.samples.get(sampleId); if (!s) return;
    const sr = s.sr, full = s.ch[0];
    const off = clip ? Math.round((clip.off || 0) * sr) : 0;
    const len = clip ? Math.min(full.length - off, Math.round(clip.len * ST.spb() * sr)) : full.length;
    const seg = full.slice(off, off + len);
    let sens = 0.5, kSel = 'auto', slices = [], groups = [], drumInst = 'drum-kit', quant = 0.25, muteOrig = true;
    const cv = h('canvas', { class: 'mp-wave' });
    const list = h('div', { class: 'mp-groups' });
    const info = h('div', { class: 'muted small' });

    function analyze() {
      slices = ST.an.slices(seg, sr, sens).map((sl) => {
        const f = VMI.bb.features(seg, sr, sl.start).slice(0, 18);
        const a = Math.round(sl.start * sr), b = Math.min(seg.length, Math.round(sl.end * sr));
        const d = b - a > sr * 0.06 ? VMI.slab.detect(seg.subarray(a, b), sr) : null, sh = shape(seg, sr, a, b);
        return Object.assign(sl, { f: f.concat([sh.sustain, sh.durF, sh.tonal]), tonal: sh.tonal, midi: d ? d.midi : null, cls: VMI.bb.classify(VMI.bb.features(seg, sr, sl.start)) });
      });
      cluster();
    }
    function cluster() {
      groups = [];
      if (!slices.length) { paint(); return; }
      let lab;
      if (kSel === 'taught' && VMI.bb.trained()) {
        const names = [...new Set(slices.map((x) => x.cls))]; lab = slices.map((x) => names.indexOf(x.cls));
      } else {
        const X = slices.map((x) => x.f), maxK = Math.min(6, X.length);
        if (kSel === 'auto') {
          const base = kmeans(X, 1).sse || 1; let K = maxK;
          for (let k = 2; k <= maxK; k++) { if (kmeans(X, k).sse <= 0.08 * base) { K = k; break; } } // tight: better to split one sound in two than merge a snare into the hats
          lab = kmeans(X, Math.max(1, K)).lab;
        } else lab = kmeans(X, Math.min(+kSel, X.length)).lab;
      }
      const ids = [...new Set(lab)];
      ids.forEach((gid, gi) => {
        const idx = lab.map((l, i) => (l === gid ? i : -1)).filter((i) => i >= 0);
        const vote = {}; idx.forEach((i) => { vote[slices[i].cls] = (vote[slices[i].cls] || 0) + 1; });
        const cls = Object.keys(vote).sort((a, b) => vote[b] - vote[a])[0];
        const pitched = idx.filter((i) => slices[i].midi != null && slices[i].tonal > 0.45).length / idx.length > 0.6;
        groups.push({ i: gi, idx, cls, pitched, name: 'Sound ' + String.fromCharCode(65 + gi), color: GCOL[gi % GCOL.length], target: defaultTarget(cls, pitched) });
      });
      groups.sort((a, b) => slices[a.idx[0]].start - slices[b.idx[0]].start).forEach((g, i) => { g.name = 'Sound ' + String.fromCharCode(65 + i); g.color = GCOL[i % GCOL.length]; });
      paint();
    }
    function defaultTarget(cls, pitched) {
      if (pitched) return { type: 'inst', inst: 'synthesizer', note: 60, follow: true };
      const pid = { kick: 'kick', snare: 'snare', hat: 'hatC', openhat: 'hatO', clap: 'clap', perc: 'tom2' }[cls] || 'snare';
      return { type: 'drum', pad: pid };
    }
    const kit = () => VMI.byId[drumInst];
    const padOk = (id) => kit().cfg.pads.some((p) => p.id === id);
    const fixPad = (id) => (padOk(id) ? id : ((VMI.bb.PADS[{ hatC: 'hat', hatO: 'openhat', tom2: 'perc', clap: 'clap', snare: 'snare', kick: 'kick' }[id]] || []).find(padOk) || kit().cfg.pads[0].id));

    function drawWave() {
      const w = Math.max(320, cv.parentElement ? cv.parentElement.clientWidth : 640), hh = 120, dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = w * dpr; cv.height = hh * dpr; cv.style.height = hh + 'px';
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#0b0b12'; g.fillRect(0, 0, w, hh);
      const step = seg.length / w; g.fillStyle = '#5b5f6e';
      for (let x = 0; x < w; x++) { let m = 0; const o = Math.floor(x * step), e = Math.min(seg.length, Math.floor((x + 1) * step)); for (let k = o; k < e; k += Math.max(1, (e - o) >> 5)) m = Math.max(m, Math.abs(seg[k])); const hh2 = Math.max(1, m * (hh - 8)); g.fillRect(x, (hh - hh2) / 2, 1, hh2); }
      const dur = seg.length / sr;
      groups.forEach((gr) => gr.idx.forEach((i) => { const sl = slices[i], x0 = (sl.start / dur) * w, x1 = (sl.end / dur) * w; g.fillStyle = gr.color + '33'; g.fillRect(x0, 0, x1 - x0, hh); g.fillStyle = gr.color; g.fillRect(x0, 0, 2, hh); g.font = '700 11px system-ui'; g.fillText(gr.name.slice(-1), x0 + 4, 13); }));
    }
    const playGroup = (gr) => {
      ST.ensure(); A.resume(); const c = ST.ctx; let t = c.currentTime + 0.05;
      const buf = c.createBuffer(1, seg.length, sr); buf.copyToChannel(seg, 0);
      gr.idx.slice(0, 4).forEach((i) => { const sl = slices[i], d = Math.min(0.6, sl.end - sl.start); const src = c.createBufferSource(); src.buffer = buf; src.connect(c.destination); src.start(t, sl.start, d); t += d + 0.18; });
    };
    function targetSelect(gr) {
      const sel = h('select', { class: 'sel' });
      const og1 = h('optgroup', { label: '🥁 Drum (' + kit().name + ')' }); kit().cfg.pads.forEach((p) => og1.append(h('option', { value: 'drum:' + p.id }, p.label)));
      const og2 = h('optgroup', { label: '🎹 Instrument' }); melodic().forEach((i) => og2.append(h('option', { value: 'inst:' + i.id }, i.emoji + ' ' + i.name)));
      const og3 = h('optgroup', { label: 'Other' }, h('option', { value: 'mine' }, '🎹 My own sound as an instrument (plays notes)'), h('option', { value: 'own' }, '🗣 Keep my own sound (as a drum pad)'), h('option', { value: 'ignore' }, '✖ Ignore this sound'));
      sel.append(og1, og2, og3);
      const t = gr.target; sel.value = t.type === 'drum' ? 'drum:' + fixPad(t.pad) : t.type === 'inst' ? 'inst:' + t.inst : t.type;
      if (!sel.value) sel.value = 'ignore';
      sel.onchange = () => { const v = sel.value; if (v.startsWith('drum:')) gr.target = { type: 'drum', pad: v.slice(5) }; else if (v.startsWith('inst:')) gr.target = { type: 'inst', inst: v.slice(5), note: gr.target.note || 60, follow: gr.pitched }; else if (v === 'mine') gr.target = { type: 'mine', note: gr.target.note || 60, follow: gr.pitched }; else gr.target = { type: v }; paint(); };
      return sel;
    }
    function paint() {
      drawWave();
      const cnt = groups.length;
      info.textContent = slices.length ? 'Found ' + slices.length + ' sounds in ' + cnt + ' group' + (cnt === 1 ? '' : 's') + '. Listen to each group (▶) and choose what it should become.' : 'No sounds found. Raise the sensitivity, or record louder and closer to the mic.';
      list.innerHTML = '';
      groups.forEach((gr) => {
        const t = gr.target;
        const melo = t.type === 'inst' || t.type === 'mine';
        const noteSel = h('select', { class: 'sel', disabled: !melo || (t.follow && gr.pitched), onchange: (e) => { t.note = +e.target.value; } });
        for (let m = 24; m <= 84; m++) noteSel.append(h('option', { value: m, selected: m === (t.note || 60) }, A.m2n(m)));
        const follow = h('input', { type: 'checkbox', class: 'sw', disabled: !melo || !gr.pitched, onchange: (e) => { t.follow = e.target.checked; noteSel.disabled = t.follow; } }); follow.checked = melo && !!t.follow && gr.pitched;
        list.append(h('div', { class: 'mp-row', style: '--c:' + gr.color },
          h('button', { class: 'btn xs icon', title: 'Listen to this sound', onclick: () => playGroup(gr) }, '▶'),
          h('div', { class: 'mp-name' }, h('b', null, gr.name), h('span', { class: 'muted small' }, gr.idx.length + ' hit' + (gr.idx.length > 1 ? 's' : '') + ' · ' + (gr.pitched ? 'a hummed / sung melody' : 'sounds like ' + ({ kick: 'a kick', snare: 'a snare', hat: 'a hi-hat', openhat: 'an open hat', clap: 'a clap', perc: 'a tom/perc' }[gr.cls] || gr.cls)))),
          h('span', { class: 'mp-arrow' }, '→'),
          targetSelect(gr),
          h('label', { class: 'field', title: 'Which note the instrument plays' }, h('span', { class: 'flabel' }, 'Note'), noteSel),
          h('label', { class: 'field', title: 'Use the pitch you sang/hummed for each hit' }, h('span', { class: 'flabel' }, 'Follow my pitch'), follow)));
      });
    }
    async function build() {
      if (!groups.length) return;
      const spb = ST.spb(), start = clip ? clip.start : Math.floor(ST.curBeat() / 4) * 4;
      const mx = Math.max(...slices.map((x) => x.peak)) || 1;
      const out = new Map(); // key → { inst, name, notes }
      const add = (key, inst, name, note) => { if (!out.has(key)) out.set(key, { inst, name, notes: [] }); out.get(key).notes.push(note); };
      let ownDef = null;
      groups.forEach((gr, gi) => {
        const t = gr.target; if (t.type === 'ignore') return;
        gr.idx.forEach((i, k) => {
          const sl = slices[i];
          let b = start + sl.start / spb; if (quant) b = Math.round(b / quant) * quant;
          const v = clamp(0.45 + 0.55 * (sl.peak / mx), 0.3, 1);
          if (t.type === 'drum') add('drums', drumInst, '🗣 Beatbox drums', { t: b, d: 0.2, n: fixPad(t.pad), v });
          else if (t.type === 'mine') { const nextStart = gr.idx[k + 1] != null ? slices[gr.idx[k + 1]].start : sl.end; let d = Math.max(0.12, Math.min(nextStart, sl.end + 0.1) - sl.start) / spb; if (quant) d = Math.max(quant, Math.round(d / quant) * quant); add('mine:' + gi, 'mine:' + gi, '🗣 ' + gr.name + ' → my instrument', { t: b, d: Math.min(d, 4), n: t.follow && gr.pitched && sl.midi != null ? sl.midi : t.note || 60, v }); }
          else if (t.type === 'own') add('own', null, '🗣 My mouth kit', { t: b, d: 0.2, n: 'g' + gi, v });
          else {
            const nextStart = gr.idx[k + 1] != null ? slices[gr.idx[k + 1]].start : sl.end;
            let d = Math.max(0.12, Math.min(nextStart, sl.end + 0.15) - sl.start) / spb; if (quant) d = Math.max(quant, Math.round(d / quant) * quant);
            const n = t.follow && gr.pitched && sl.midi != null ? sl.midi : t.note || 60;
            add('inst:' + t.inst, t.inst, '🗣 ' + gr.name + ' → ' + VMI.byId[t.inst].name, { t: b, d: Math.min(d, 4), n, v });
          }
        });
      });
      if (!out.size) return ST.toast('Everything is set to “Ignore”', 'warn');
      ST.snap();
      if (out.has('own')) {
        const ownGroups = groups.filter((g) => g.target.type === 'own');
        ownDef = { id: ST.uid('i_'), type: 'kit', name: 'My mouth kit', emoji: '🗣️', pads: ownGroups.map((g) => { const sl = slices[g.idx[0]]; return { id: 'g' + groups.indexOf(g), label: g.name, cls: g.cls, sample: sampleId, start: off / sr + sl.start, end: off / sr + Math.min(sl.end, sl.start + 0.8) }; }) };
        ST.registerInstrument(ownDef);
        out.get('own').inst = ownDef.id;
      }
      // "my own sound as an instrument": the loudest hit of the group becomes a sampler that plays any note
      groups.forEach((g, gi) => {
        if (!out.has('mine:' + gi)) return;
        const best = g.idx.reduce((a, i) => (slices[i].peak > slices[a].peak ? i : a), g.idx[0]), sl = slices[best];
        const root = g.pitched && sl.midi != null ? sl.midi : 60; // unpitched: C4 = the sound as you made it, other notes pitch it up or down
        const def = { id: ST.uid('i_'), type: 'sampler', name: s.name.replace(/ \(.*\)$/, '') + ' · ' + g.name, sample: sampleId, root, cents: 0, loop: false, gate: false, start: off / sr + sl.start, end: off / sr + Math.min(sl.end + 0.05, sl.start + 2.5), emoji: '🗣️' };
        ST.registerInstrument(def); out.get('mine:' + gi).inst = def.id;
      });
      let first = null;
      out.forEach((o) => {
        const tr = ST.addTrack({ inst: o.inst }); tr.name = o.name; if (!first) first = tr;
        const a = Math.floor(Math.min(...o.notes.map((n) => n.t)) / 4) * 4, b = Math.ceil(Math.max(...o.notes.map((n) => n.t + n.d)) / 4) * 4;
        ST.ensureBars(Math.max(b, a + 4)); ST.mergeNotes(tr, a, Math.max(b, a + 4), o.notes);
      });
      if (muteOrig && clip) { const f = ST.findClip(clip.id); if (f) f.t.mute = true; }
      ST.selTrack = first.id; ST.touch(); ST.emit('selection');
      m.close();
      ST.toast('Built ' + out.size + ' track' + (out.size > 1 ? 's' : '') + ' from your sounds' + (muteOrig && clip ? ' (your original is muted — press M to hear it again)' : '') + '. Press Space to play!');
    }
    const body = h('div', { class: 'mp' },
      h('p', { class: 'muted small' }, 'Beatbox, click, pop, hum, whistle: every different sound you made becomes its own group. Choose what each group should be (any drum, any instrument at any note, or your own sound), then build. Your rhythm is kept exactly.'),
      h('div', { class: 'mp-wavewrap' }, cv),
      h('div', { class: 'row mp-ctrl' },
        h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Sensitivity'), h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: sens, onchange: (e) => { sens = +e.target.value; analyze(); } })),
        h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Sound types'), h('select', { class: 'sel', onchange: (e) => { kSel = e.target.value; cluster(); } }, h('option', { value: 'auto' }, 'Automatic'), [2, 3, 4, 5, 6].map((k) => h('option', { value: k }, k + ' types')), VMI.bb.trained() ? h('option', { value: 'taught' }, 'My taught sounds') : null)),
        h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Drum kit'), h('select', { class: 'sel', onchange: (e) => { drumInst = e.target.value; paint(); } }, DRUMS().map((i) => h('option', { value: i.id, selected: i.id === drumInst }, i.emoji + ' ' + i.name)))),
        h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Snap'), h('select', { class: 'sel', onchange: (e) => { quant = +e.target.value; } }, h('option', { value: 0.25 }, '1/16'), h('option', { value: 0.5 }, '1/8'), h('option', { value: 0 }, 'Off (exact)'))),
        clip ? h('label', { class: 'field' }, h('span', { class: 'flabel' }, 'Mute my original'), (() => { const x = h('input', { type: 'checkbox', class: 'sw', onchange: (e) => { muteOrig = e.target.checked; } }); x.checked = true; return x; })()) : null),
      info, list,
      h('div', { class: 'row' }, h('button', { class: 'btn accent', onclick: build }, '🎶 Build tracks from my sounds'), h('button', { class: 'btn', onclick: () => VMI.bb.trainer() }, '🧠 Teach my sounds')));
    const m = VMI.sui.modal('🗣→🎹 Sound Mapper — ' + s.name, body, { cls: 'wide' });
    requestAnimationFrame(analyze);
  };
})();
