/* export.js — MP3 export + stem export (one WAV per track, packed in a ZIP) */
(function () {
  'use strict';
  const VMI = window.VMI, ST = VMI.st;
  const X = (VMI.exp = {});

  /* ---------- minimal ZIP writer (stored, no compression — WAV barely compresses anyway) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  X.zip = (files) => { // files: [{name, data: Uint8Array}]
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach((f) => {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, f.data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + size;
    });
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(end.buffer)]), { type: 'application/zip' });
  };

  const safe = (s) => (s || 'track').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, ' ') || 'track';
  X.download = (blob, name) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000);
  };

  /* ---------- MP3 (lamejs, loaded from cdnjs only when you export; pinned with an integrity hash) ---------- */
  const LAME_URL = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';
  const LAME_SRI = 'sha512-xT0S/xXvkrfkRXGBPlzZPCAncnMK5c1N7slRkToUbv8Z901aUEuKO84tLy8dWU+3ew4InFEN7TebPaVMy2npZw==';
  let lameP = null;
  X.loadLame = () => {
    if (window.lamejs) return Promise.resolve(window.lamejs);
    if (lameP) return lameP;
    lameP = new Promise((res, rej) => {
      const sc = document.createElement('script');
      sc.src = LAME_URL; sc.integrity = LAME_SRI; sc.crossOrigin = 'anonymous'; sc.referrerPolicy = 'no-referrer';
      sc.onload = () => (window.lamejs ? res(window.lamejs) : rej(new Error('the MP3 encoder did not start')));
      sc.onerror = () => { lameP = null; sc.remove(); rej(new Error('could not download the MP3 encoder — MP3 export needs an internet connection')); };
      document.head.append(sc);
    });
    return lameP;
  };
  const toI16 = (f, a, b) => { const o = new Int16Array(b - a); for (let i = a; i < b; i++) { const v = Math.max(-1, Math.min(1, f[i])); o[i - a] = v < 0 ? v * 0x8000 : v * 0x7fff; } return o; };
  X.mp3 = async (kbps, loopOnly) => {
    const P = ST.proj();
    ST.toast('Rendering your song…');
    const buf = await ST.renderMix({ loopOnly });
    if (!buf) { ST.toast('Nothing to export yet — add some clips', 'warn'); return null; }
    ST.safePeak(buf);
    const lame = await X.loadLame();
    const sr = [32000, 44100, 48000].includes(buf.sampleRate) ? buf.sampleRate : 44100;
    const enc = new lame.Mp3Encoder(2, sr, kbps);
    const L = buf.getChannelData(0), R = buf.getChannelData(1), parts = [];
    const BLOCK = 1152 * 40;
    for (let i = 0; i < L.length; i += BLOCK) {
      const e = Math.min(L.length, i + BLOCK), l = toI16(L, i, e), r = toI16(R, i, e);
      for (let k = 0; k < l.length; k += 1152) { const m = enc.encodeBuffer(l.subarray(k, k + 1152), r.subarray(k, k + 1152)); if (m.length) parts.push(new Uint8Array(m)); }
      if ((i / BLOCK) % 20 === 19) { ST.toast('Encoding MP3… ' + Math.round((e / L.length) * 100) + '%'); await new Promise((rr) => setTimeout(rr, 0)); }
    }
    const end = enc.flush(); if (end.length) parts.push(new Uint8Array(end));
    const blob = new Blob(parts, { type: 'audio/mpeg' });
    X.download(blob, safe(P.name) + (loopOnly ? ' (loop)' : '') + '.mp3');
    ST.toast('Exported MP3 (' + kbps + ' kbps, ' + (blob.size / 1048576).toFixed(1) + ' MB)');
    return blob;
  };

  /** render every track that has clips on its own (same start and length, so they line up) */
  X.stems = async () => {
    const P = ST.proj(), tracks = P.tracks.filter((t) => t.clips.length);
    if (!tracks.length) { ST.toast('Nothing to export yet — add some clips', 'warn'); return null; }
    const files = [];
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      ST.toast('Rendering stem ' + (i + 1) + ' of ' + tracks.length + ': ' + t.name);
      await new Promise((r) => setTimeout(r, 20));
      const buf = await ST.renderMix({ only: t.id });
      if (!buf) continue;
      const wav = await ST.encodeWav(buf).arrayBuffer();
      files.push({ name: String(i + 1).padStart(2, '0') + ' - ' + safe(t.name) + '.wav', data: new Uint8Array(wav) });
    }
    const full = await ST.renderMix({}); if (full) ST.safePeak(full);
    if (full) files.push({ name: '00 - Full mix.wav', data: new Uint8Array(await ST.encodeWav(full).arrayBuffer()) });
    const readme = 'Stems from "' + P.name + '" — ' + P.bpm + ' BPM, 4/4.\nEvery file starts at bar 1 and has the same length, so drop them all at the start of your DAW timeline and they line up.\nEach stem includes its track effects (EQ, drive, compression, reverb and echo sends).\n';
    files.push({ name: 'README.txt', data: new TextEncoder().encode(readme) });
    const zip = X.zip(files);
    X.download(zip, safe(P.name) + ' - stems.zip');
    ST.toast('Exported ' + (files.length - 2) + ' stems + full mix (' + (zip.size / 1048576).toFixed(1) + ' MB)');
    return zip;
  };
})();
