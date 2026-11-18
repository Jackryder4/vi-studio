// Renders the WACK MUZIC brand assets to PNG with Electron (Chromium) — run from the desktop folder:
//   npx electron ../brand/render.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const BRAND = __dirname;
const OUT = path.join(BRAND, 'out');
const ICONS = path.join(BRAND, '..', 'icons');
const iconPage = (size, opts) => pathToFileURL(path.join(BRAND, 'icon.html')).toString() + '?s=' + size + '&k=' + (opts.scale || 1) + (opts.bg ? '&bg=' + encodeURIComponent(opts.bg) : '');

const jobs = [
  // app icons (website, PWA, desktop installer)
  { out: path.join(OUT, 'icon-1024.png'), url: iconPage(1024, {}), w: 1024, h: 1024, transparent: true },
  { out: path.join(ICONS, 'icon-512.png'), url: iconPage(512, {}), w: 512, h: 512, transparent: true },
  { out: path.join(ICONS, 'icon-192.png'), url: iconPage(192, {}), w: 192, h: 192, transparent: true },
  { out: path.join(ICONS, 'apple-touch-icon.png'), url: iconPage(180, { bg: '#07070b', scale: 1.06 }), w: 180, h: 180 },
  { out: path.join(ICONS, 'maskable-512.png'), url: iconPage(512, { bg: '#0b0b12', scale: 0.86 }), w: 512, h: 512 },
  { out: path.join(ICONS, 'favicon-64.png'), url: iconPage(64, {}), w: 64, h: 64, transparent: true },
  // logo lockup
  { out: path.join(OUT, 'logo-horizontal.png'), file: 'logo-horizontal.svg', w: 1800, h: 440, transparent: true },
  // key art
  { out: path.join(OUT, 'hero-2560x1440.jpg'), file: 'keyart.html', w: 2560, h: 1440, jpg: true },
  // website hero background: no sign (the site draws the animated sign on top)
  { out: path.join(BRAND, '..', 'assets', 'hero.jpg'), file: 'keyart.html', q: '?nosign=1', w: 1920, h: 1080, jpg: true },
  { out: path.join(OUT, 'hero-text-1920x1080.png'), file: 'keyart.html', q: '?text=1', w: 1920, h: 1080 },
  { out: path.join(OUT, 'play-feature-1024x500.png'), file: 'keyart.html', q: '?text=1', w: 1024, h: 500 },
  { out: path.join(OUT, 'social-1200x630.png'), file: 'keyart.html', q: '?text=1', w: 1200, h: 630 },
  { out: path.join(OUT, 'phone-1080x1920.png'), file: 'keyart.html', q: '?text=1', w: 1080, h: 1920 },
  { out: path.join(OUT, 'brand-board-1600x1000.png'), file: 'board.html', w: 1600, h: 1000 },
];

const wins = {};
function getWin(transparent) {
  const k = transparent ? 't' : 'o';
  if (!wins[k]) wins[k] = new BrowserWindow({ show: false, width: 800, height: 600, useContentSize: true, frame: false, transparent, backgroundColor: transparent ? '#00000000' : '#07070b', enableLargerThanScreen: true, webPreferences: { offscreen: true } });
  return wins[k];
}
async function shot(j) {
  const win = getWin(!!j.transparent);
  win.setContentSize(j.w, j.h);
  await win.loadURL(j.url || pathToFileURL(path.join(BRAND, j.file)).toString() + (j.q || ''));
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 600)))');
  const img = (await win.webContents.capturePage({ x: 0, y: 0, width: j.w, height: j.h })).resize({ width: j.w, height: j.h, quality: 'best' });
  fs.mkdirSync(path.dirname(j.out), { recursive: true });
  fs.writeFileSync(j.out, j.jpg ? img.toJPEG(90) : img.toPNG());
  console.log('wrote', path.relative(path.join(BRAND, '..'), j.out), j.w + 'x' + j.h);
}
app.disableHardwareAcceleration();
const only = process.argv.slice(2).find((x) => !x.startsWith('-') && !x.endsWith('.js'));
app.whenReady().then(async () => { for (const j of jobs.filter((x) => !only || x.out.includes(only))) { try { await shot(j); } catch (e) { console.log('FAILED', j.out, e.message); } } app.quit(); });
