// capture-biome.mjs — LIVE in-engine capture of the per-stage biome tilesets.
// Boots the real game headless at ?level=N for several stages, waits for the sim to
// render (window.__bench), and grabs the native 480x270 canvas via toDataURL so we can
// JUDGE BY LOOKING that each biome renders its distinct tileset (not the jungle fallback).
//
// Usage: node capture-biome.mjs --base http://localhost:8137 --out <dir> --levels 1,3,5,6
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import os from 'node:os';
const require = createRequire(import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const cands = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                 '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  const cache = path.join(os.homedir(), '.cache', 'puppeteer');
  for (const kind of ['chrome-headless-shell', 'chrome']) {
    const base = path.join(cache, kind);
    if (existsSync(base)) {
      const { execSync } = require('node:child_process');
      try { const h = execSync(`ls ${base}/*/*/${kind}* 2>/dev/null | head -1`).toString().trim(); if (h) cands.push(h); } catch {}
    }
  }
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error('no chrome found');
}

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) =>
  (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const base = args.base || 'http://localhost:8137';
const out = args.out || 'assets/pipeline/experiments/biomes/live';
const levels = (args.levels || '1,3,5,6').split(',').map((s) => parseInt(s, 10));
const frames = parseInt(args.frames || '150', 10);

const puppeteer = (await import('puppeteer-core')).default;
await mkdir(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true,
  args: ['--no-sandbox', '--disable-gpu'] });
const results = [];
for (const lvl of levels) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const url = `${base}/game/index.html?headless=1&frames=${frames}&level=${lvl}&seed=1234`;
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction('window.__bench !== undefined', { timeout: 30000 });
  const info = await page.evaluate(() => ({
    theme: (window.__game && window.__game.theme) ? window.__game.theme.id : null,
    tilesetKey: (window.__game && window.__game.theme) ? window.__game.theme.tileset : null,
    missing: (window.__assets && window.__assets.missing) || [],
    tilesetLoaded: !!(window.__game && window.__game.theme && window.__game.theme.tileset
                      && window.__assets && window.__assets.get(window.__game.theme.tileset)),
    dataURL: document.getElementById('game').toDataURL('image/png'),
  }));
  const png = Buffer.from(info.dataURL.split(',')[1], 'base64');
  const file = path.join(out, `level${lvl}-${info.theme}.png`);
  await writeFile(file, png);
  results.push({ lvl, theme: info.theme, tilesetKey: info.tilesetKey,
    tilesetLoaded: info.tilesetLoaded, missing: info.missing.length, errors: errors.length, file });
  console.log(`level ${lvl}: theme=${info.theme} tileset=${info.tilesetKey} loaded=${info.tilesetLoaded} missing=${info.missing.length} errors=${errors.length} -> ${file}`);
  await page.close();
}
await browser.close();
await writeFile(path.join(out, 'capture.json'), JSON.stringify(results, null, 2));
console.log('DONE', results.length, 'captures');
