// Virtual Instruments Studio — Windows desktop app (Electron).
// Serves the website from a private app:// origin so mic, MIDI, AudioWorklet and IndexedDB behave like on https.
const { app, BrowserWindow, protocol, net, session, shell, Menu } = require('electron');
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

let win = null;
if (!SELFTEST && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#0e0f12', title: 'Virtual Instruments Studio',
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
    { label: 'Help', submenu: [{ label: 'Lessons & guides', click: go('#/learn') }, { label: 'Open the website', click: () => shell.openExternal(SITE) }] },
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
  if (SELFTEST) selfTest();
});
app.on('window-all-closed', () => app.quit());

/* `npm run selftest`: loads the app hidden, checks the important features and prints the result. */
function selfTest() {
  const timeout = setTimeout(() => { console.log('SELFTEST_TIMEOUT'); app.exit(2); }, 60000);
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
