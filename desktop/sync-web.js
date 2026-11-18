// Copies the website (one folder up) into ./web so the desktop app always ships the same code as the site.
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..');
const DST = path.join(__dirname, 'web');
const ITEMS = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'assets'];
fs.rmSync(DST, { recursive: true, force: true });
fs.mkdirSync(DST, { recursive: true });
for (const item of ITEMS) fs.cpSync(path.join(SRC, item), path.join(DST, item), { recursive: true });
console.log('Synced website into desktop/web');
