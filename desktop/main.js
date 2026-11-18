// WACK MUZIC — Windows desktop app (Electron).
// Serves the website from a private app:// origin so mic, MIDI, AudioWorklet and IndexedDB behave like on https.
const { app, BrowserWindow, protocol, net, session, shell, Menu, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const WEB = path.join(__dirname, 'web');
const SELFTEST = process.argv.includes('--selftest');
const SITE = 'https://jackryder4.github.io/vi-studio/';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);
// instruments should sound on the very first key press
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Self-tests run in a throw-away profile so they never touch the user's projects.
if (SELFTEST) app.setPath('userData', path.join(app.getPath('temp'), 'wack-muzic-selftest'));
// Keep projects/recordings from version 1 ("Virtual Instruments Studio") after the rename.
else try {
  const legacy = path.join(app.getPath('appData'), 'Virtual Instruments Studio');
  const current = path.join(app.getPath('appData'), 'WACK MUZIC');
  if (fs.existsSync(legacy) && !fs.existsSync(current)) app.setPath('userData', legacy);
} catch (e) { /* ignore */ }

let win = null;
if (!SELFTEST && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#07070b', title: 'WACK MUZIC',
    icon: path.join(WEB, 'icons', 'icon-512.png'), autoHideMenuBar: true, show: false,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false },
  });
  win.once('ready-to-show', () => { if (!SELFTEST) { win.show(); } });
  // links to the outside world open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
  win.loadURL('app://vi/index.html');
  return win;
}

function buildMenu() {
  const go = (hash) => () => win && win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ label: 'Home', accelerator: 'Alt+Home', click: go('#/') }, { label: 'Open Studio', accelerator: 'Ctrl+Shift+S', click: go('#/studio') }, { label: 'Learn', click: go('#/learn') }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] },
    { label: 'Help', submenu: [
      { label: 'Lessons & guides', click: go('#/learn') },
      { label: 'Check for updates…', click: () => checkUpdates(true) },
      { label: 'Open the website', click: () => shell.openExternal(SITE) },
      { type: 'separator' },
      { label: 'About WACK MUZIC', click: () => dialog.showMessageBox(win, { type: 'info', title: 'About', message: 'WACK MUZIC ' + app.getVersion(), detail: 'Make it loud. Underground music production studio. ' + SITE }) },
    ] },
  ]));
}

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    let p = decodeURIComponent(new URL(req.url).pathname);
    if (!p || p === '/') p = '/index.html';
    const file = path.normalize(path.join(WEB, p));
    if (!file.startsWith(WEB)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // only what a music app needs, and only for the app's own pages: microphone (audio only), MIDI, fullscreen.
  // (Electron reports every Web MIDI request as 'midiSysex'; the app itself never asks for sysex.)
  const ses = session.defaultSession;
  const ok = new Set(['media', 'midi', 'midiSysex', 'fullscreen', 'clipboard-sanitized-write']);
  const own = (u) => typeof u === 'string' && u.startsWith('app://vi/');
  ses.setPermissionRequestHandler((wc, perm, cb, details) => {
    if (!own(details.requestingUrl || wc.getURL())) return cb(false);
    if (perm === 'media') return cb(!(details.mediaTypes || []).includes('video'));
    cb(ok.has(perm));
  });
  ses.setPermissionCheckHandler((wc, perm, origin) => ok.has(perm) && (!origin || origin.startsWith('app://')));
  buildMenu();
  createWindow();
  if (SELFTEST) selfTest(); else setTimeout(() => checkUpdates(false), 6000);
});
app.on('window-all-closed', () => app.quit());

/* ---------- automatic updates from GitHub Releases (installed version only; portable can't self-update) ---------- */
let updater = null;
function checkUpdates(manual) {
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) { if (manual) dialog.showMessageBox(win, { message: 'Updates install automatically in the installed version of WACK MUZIC.', detail: 'Download the latest from ' + SITE.replace('jackryder4.github.io/vi-studio/', 'github.com/Jackryder4/vi-studio/releases') }); return; }
  try { updater = updater || require('electron-updater').autoUpdater; } catch (e) { return; }
  updater.autoDownload = true;
  updater.removeAllListeners();
  updater.on('update-downloaded', (info) => {
    dialog.showMessageBox(win, { type: 'info', buttons: ['Restart now', 'Later'], defaultId: 0, title: 'Update ready', message: 'WACK MUZIC ' + info.version + ' is ready.', detail: 'Restart to finish updating. Your projects and sounds are kept.' })
      .then((r) => { if (r.response === 0) updater.quitAndInstall(); });
  });
  if (manual) {
    updater.once('update-not-available', () => dialog.showMessageBox(win, { message: 'You have the latest version (' + app.getVersion() + ').' }));
    updater.once('error', (e) => dialog.showMessageBox(win, { type: 'warning', message: 'Could not check for updates.', detail: String(e && e.message || e) }));
  } else updater.on('error', () => {});
  updater.checkForUpdates().catch(() => {});
}

/* `npm run selftest`: loads the app hidden, checks the important features and prints the result. */
function selfTest() {
  const timeout = setTimeout(() => { console.log('SELFTEST_TIMEOUT'); app.exit(2); }, 300000);
  win.webContents.once('did-finish-load', async () => {
    try {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const out = { origin: location.origin, secureContext: isSecureContext };
        await sleep(1500);
        out.instruments = VMI.instruments.length;
        out.homeCards = document.querySelectorAll('.card').length;
        location.hash = '#/studio'; await sleep(1500);
        document.querySelector('.modal-back')?.remove();
        out.studioTracks = VMI.st.proj().tracks.length;
        VMI.audio.resume(); await sleep(200);
        out.audioState = VMI.st.ctx.state;
        try { await VMI.voice.live.ensure(); out.liveAutoTuneWorklet = 'loaded'; } catch (e) { out.liveAutoTuneWorklet = 'FAIL ' + e.message; }
        out.micApi = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        try { const st = await navigator.permissions.query({ name: 'microphone' }); out.micPermission = st.state; } catch (e) { out.micPermission = 'n/a'; }
        out.midiApi = !!navigator.requestMIDIAccess;
        try { await navigator.requestMIDIAccess(); out.midiAccess = 'granted'; } catch (e) { out.midiAccess = 'FAIL ' + e.message; }
        await VMI.store.put('projects', { id: 'selftest', name: 'x', data: '{}', saved: 1 });
        out.indexedDB = !!(await VMI.store.get('projects', 'selftest')); await VMI.store.del('projects', 'selftest');
        const buf = await VMI.st.renderMix({});
        let mx = 0; const d = buf.getChannelData(0); for (let i = 0; i < d.length; i += 7) mx = Math.max(mx, Math.abs(d[i]));
        out.exportSeconds = +buf.duration.toFixed(1); out.exportPeak = +mx.toFixed(2);
        const loop = await VMI.loops.render(VMI.loops.byId('dl-house'), 120); out.loopRender = +(loop.ch[0].length / loop.sr).toFixed(2);
        out.keyboardKeys = VMI.KEYMAP.length;
        out.title = document.title;
        out.modules = ['FX', 'fxui', 'slab', 'gen', 'bb', 'mapper', 'logoMark', 'heroSign'].filter((k) => !VMI[k]).join(',') || 'all loaded';
        out.livingLogo = document.querySelectorAll('.wm-mark').length + ' marks, sign ' + !!document.querySelector('.hero-sign svg animate');
        let t0 = performance.now();
        await VMI.gen.create({ genre: 'Hip-hop', mood: 'chill', key: 'auto', bpm: 0, len: 'full', melody: true, fx: true });
        out.generateMs = Math.round(performance.now() - t0);
        t0 = performance.now(); const song = await VMI.st.renderMix({});
        out.fullSongSeconds = +song.duration.toFixed(1); out.fullSongExportMs = Math.round(performance.now() - t0);
        const sl = VMI.slab.pitch(new Float32Array(48000).map((_, i) => Math.sin(i / 10)), 48000, 5, 'keep'); out.soundLabPitch = sl.length === 48000;
        { // voice engines (audio worklets) inside the packaged app: 230 Hz voice-like tone
          const sr0 = 44100, N0 = sr0, tone = new Float32Array(N0);
          for (let i = 0; i < N0; i++) { let v = 0; for (let k = 1; k < 10; k++) v += Math.sin(2 * Math.PI * 230 * k * i / sr0) / k; tone[i] = 0.2 * v; }
          const D = VMI.FX.defaults, hz = async (chain) => { const r = await VMI.slab.bounce([tone], sr0, chain, 0); const dd = VMI.slab.detect(r[0].subarray(9000, N0 - 2000), sr0); return dd ? +dd.hz.toFixed(1) : 0; };
          out.pitchUp5Hz_want307 = await hz([['pitch', Object.assign(D('pitch'), { semis: 5 })]]);
          out.pitchDown12Hz_want115 = await hz([['pitch', Object.assign(D('pitch'), { semis: -12 })]]);
          out.autoTuneHz_want233 = await hz([['autotune', Object.assign(D('autotune'), { key: 1, scale: 'major', speed: 0 })]]);
          out.robotVoiceHz_want233 = await hz([['synthvoice', Object.assign(D('synthvoice'), { key: 1, scale: 'major', mix: 1 })]]);
        }
        out.fxTypes = Object.keys(VMI.FX.types).length; out.fxPresets = VMI.FX.presets.length; out.loops = VMI.loops.items.length;
        return out;
      })()`, true);
      console.log('SELFTEST ' + JSON.stringify(r));
      if (process.env.VMI_SHOT) { // optional screenshot of the real window for visual checks
        await new Promise((res) => setTimeout(res, 800));
        const img = await win.webContents.capturePage();
        require('fs').writeFileSync(process.env.VMI_SHOT, img.toPNG());
        console.log('SHOT ' + img.getSize().width + 'x' + img.getSize().height);
      }
    } catch (e) { console.log('SELFTEST_ERR ' + e.message); }
    clearTimeout(timeout);
    app.exit(0);
  });
}
