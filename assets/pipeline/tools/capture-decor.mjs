// capture-decor.mjs — LIVE in-engine capture of per-stage SET-DRESSING props.
// Boots the real game headless at ?level=N for the decor-bearing stages, asserts
// window.__game.decor is populated + every decor key is LOADED in __assets, then
// grabs the native 480x270 canvas so we can JUDGE BY LOOKING that each biome's
// prop actually blits on-screen (base-anchored to the ground). Mirrors capture-biome.
//
// Usage: node capture-decor.mjs --base http://localhost:8137 --out <dir> --levels 2,3,4,5,6,7
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url);

function findChrome() {
  const cands = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                 '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error('no chrome found');
}

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) =>
  (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const base = args.base || 'http://localhost:8137';
const out = args.out || 'assets/pipeline/experiments/set-dressing/live';
const levels = (args.levels || '2,3,4,5,6,7').split(',').map((s) => parseInt(s, 10));
const frames = parseInt(args.frames || '90', 10);
const gamepath = args.gamepath || 'index.html';

const puppeteer = (await import(path.join(process.cwd(), 'reference/tools/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js'))).default;
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true,
  args: ['--no-sandbox', '--disable-gpu'] });
const results = [];
for (const lvl of levels) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const url = `${base}/${gamepath}?headless=1&frames=${frames}&level=${lvl}&seed=1234`;
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction('window.__bench !== undefined', { timeout: 30000 });
  const info = await page.evaluate(() => {
    const g = window.__game, a = window.__assets;
    const decor = (g && g.decor) || [];
    const keys = [...new Set(decor.map((d) => d.key))];
    const loaded = {};
    for (const k of keys) loaded[k] = !!(a && a.get(k));
    return {
      theme: (g && g.theme) ? g.theme.id : null,
      decorCount: decor.length,
      decorXs: decor.map((d) => d.x),
      keys, loaded,
      missing: (a && a.missing) || [],
      dataURL: document.getElementById('game').toDataURL('image/png'),
    };
  });
  const png = Buffer.from(info.dataURL.split(',')[1], 'base64');
  const file = path.join(out, `level${lvl}-${info.theme}.png`);
  await writeFile(file, png);
  const allLoaded = info.keys.length > 0 && info.keys.every((k) => info.loaded[k]);
  results.push({ lvl, theme: info.theme, decorCount: info.decorCount, keys: info.keys,
    allLoaded, decorXs: info.decorXs, errors: errors.length, file });
  console.log(`level ${lvl}: theme=${info.theme} decor=${info.decorCount} keys=[${info.keys}] allLoaded=${allLoaded} xs=[${info.decorXs}] errors=${errors.length} -> ${file}`);
  await page.close();
}
await browser.close();
await writeFile(path.join(out, 'capture.json'), JSON.stringify(results, null, 2));
console.log('DONE', results.length, 'captures');
