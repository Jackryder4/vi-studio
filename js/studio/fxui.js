/* fxui.js — the FX tab: an FL-style insert rack for the selected track */
(function () {
  'use strict';
  const VMI = window.VMI, ST = VMI.st, FX = VMI.FX;
  const FU = (VMI.fxui = {});
  const h = (...a) => VMI.sui.h(...a);

  function fmt(q, v) {
    if (q.type !== 'range') return v;
    if (q.unit === 'Hz') return v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v) + '';
    if (q.unit === 's') return v < 1 ? Math.round(v * 1000) + 'ms' : (+v).toFixed(1) + 's';
    if (q.unit === 'dB') return (v > 0 ? '+' : '') + (+v).toFixed(q.step < 1 ? 1 : 0);
    if (q.unit === 'ms') return Math.round(v) + 'ms';
    if (q.max <= 1 && q.min >= 0) return Math.round(v * 100) + '%';
    return (+v).toFixed(q.step < 1 ? (q.step < 0.1 ? 2 : 1) : 0);
  }
  const live = () => { ST.sync(); ST.autosave(); };
  const structural = () => { ST.touch(); FU.refresh(); };

  FU.render = (body, t) => {
    body.innerHTML = '';
    if (!t) { body.append(h('div', { class: 'empty-panel' }, h('b', null, 'No track selected'), h('span', null, 'Pick a track to add effects to it.'))); return; }
    if (!t.fx) t.fx = [];
    const presetBtn = h('button', { class: 'btn xs accent', onclick: (e) => VMI.sui.menu(e.currentTarget, FX.presets.map((p) => ({ label: p.icon + '  ' + p.name, hint: p.chain.length + ' fx', fn: () => { ST.snap(); FX.applyPreset(t, p); structural(); ST.toast('Applied “' + p.name + '” to ' + t.name); } }))) }, '★ Presets');
    const addBtn = h('button', { class: 'btn xs', onclick: (e) => VMI.sui.menu(e.currentTarget, Object.keys(FX.types).map((k) => ({ label: FX.types[k].icon + '  ' + FX.types[k].name, fn: () => { ST.snap(); t.fx.push(FX.make(k)); structural(); } }))) }, '+ Add effect');
    const tools = h('div', { class: 'ed-tools' },
      h('span', { class: 'pt-name', style: 'color:' + t.color }, '🎛 Effects · ' + t.name),
      presetBtn, addBtn,
      t.fx.length ? h('button', { class: 'btn xs', onclick: () => { ST.snap(); const any = t.fx.some((f) => f.on); t.fx.forEach((f) => { f.on = !any; }); structural(); } }, t.fx.some((f) => f.on) ? 'Bypass all' : 'Enable all') : null,
      t.fx.length ? h('button', { class: 'btn xs danger', onclick: () => { ST.snap(); t.fx = []; structural(); } }, 'Clear') : null,
      h('span', { class: 'muted small hint-inline' }, 'Effects run in order, left → right, and are included when you export. Mixer sends (Reverb/Echo knobs) come after.'));
    const rack = h('div', { class: 'fx-rack' });
    if (!t.fx.length) {
      rack.append(h('div', { class: 'empty-panel' }, h('b', null, 'No effects yet'),
        h('span', null, 'Start with a preset: “Radio-ready vocal”, “Hard Auto-Tune”, “Robot voice”, “Cathedral”… or add single effects. Anything you record can be transformed here.'),
        h('div', { class: 'row' }, FX.presets.slice(0, 6).map((p) => h('button', { class: 'btn sm', onclick: () => { ST.snap(); FX.applyPreset(t, p); structural(); } }, p.icon + ' ' + p.name)))));
    }
    t.fx.forEach((f, i) => {
      const T = FX.types[f.type]; if (!T) return;
      const p = Object.assign(FX.defaults(f.type), f.p); f.p = p;
      const ctrls = T.params.map((q) => {
        if (q.type === 'select') return h('label', { class: 'fx-p' }, h('span', null, q.label), h('select', { class: 'sel', onchange: (e) => { p[q.id] = isNaN(+e.target.value) || q.id === 'time' || q.id === 'rate' || q.id === 'lfo' ? e.target.value : +e.target.value; live(); } }, q.options.map(([v, l]) => h('option', { value: v, selected: String(p[q.id]) === String(v) }, l))));
        if (q.type === 'toggle') { const sw = h('input', { type: 'checkbox', class: 'sw', onchange: (e) => { p[q.id] = e.target.checked; live(); } }); sw.checked = !!p[q.id]; return h('label', { class: 'fx-p row' }, h('span', null, q.label), sw); }
        const out = h('output', null, fmt(q, p[q.id]));
        return h('label', { class: 'fx-p' }, h('span', null, q.label, out), h('input', { type: 'range', min: q.min, max: q.max, step: q.step, value: p[q.id], oninput: (e) => { p[q.id] = +e.target.value; out.textContent = fmt(q, p[q.id]); live(); }, ondblclick: (e) => { p[q.id] = q.def; e.target.value = q.def; out.textContent = fmt(q, q.def); live(); } }));
      });
      const pow = h('input', { type: 'checkbox', class: 'sw', title: 'On / bypass', onchange: (e) => { ST.snap(); f.on = e.target.checked; structural(); } }); pow.checked = f.on;
      rack.append(h('div', { class: 'fx-slot' + (f.on ? '' : ' off') },
        h('div', { class: 'fx-h' }, h('span', { class: 'fx-n' }, h('i', null, i + 1), T.icon + ' ' + T.name), pow),
        h('div', { class: 'fx-desc' }, T.desc),
        h('div', { class: 'fx-ps' }, ctrls),
        h('div', { class: 'fx-f' },
          h('button', { class: 'btn xs icon', title: 'Move left', disabled: i === 0, onclick: () => { ST.snap(); t.fx.splice(i - 1, 0, t.fx.splice(i, 1)[0]); structural(); } }, '◀'),
          h('button', { class: 'btn xs icon', title: 'Move right', disabled: i === t.fx.length - 1, onclick: () => { ST.snap(); t.fx.splice(i + 1, 0, t.fx.splice(i, 1)[0]); structural(); } }, '▶'),
          h('span', { style: 'flex:1' }),
          h('button', { class: 'btn xs danger', onclick: () => { ST.snap(); t.fx.splice(i, 1); structural(); } }, 'Remove'))));
    });
    body.append(tools, rack);
  };
  FU.refresh = () => { if (VMI.sui.tab === 'fx') { const b = document.getElementById('bpBody'); if (b) FU.render(b, ST.track(ST.selTrack)); } };
})();
