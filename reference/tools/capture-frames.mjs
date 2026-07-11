#!/usr/bin/env node
// capture-frames.mjs -- capture real frames from a live HTML5 run-and-gun (or any
// rendered page) into the reference corpus, using headless Chrome.
//
// TWO MODES (proven behaviour -- verified 2026-07-09, do not overclaim):
//   * pptr (DEFAULT, needs puppeteer-core): keeps ONE live page open, INJECTS keyboard
//          input between frames, and screenshots. This is the ONLY mode that produces a
//          real gameplay SEQUENCE (distinct, progressing frames) and can get past menus.
//          PROVEN: injected ArrowRight moved a canvas actor from x=464 -> x=1616 across
//          4 frames. Requires a one-time `npm install` in this dir (node_modules is
//          gitignored); if puppeteer-core is not resolvable the tool prints the install
//          command and exits non-zero.
//   * cli  (ZERO DEPENDENCIES, single-frame): drives the Chrome binary directly via
//          `--screenshot`. Reliable for capturing ONE settled frame of a page (proven:
//          frames/_probe/). NOTE: passing --frames>1 in cli mode does NOT advance a
//          requestAnimationFrame loop -- Chrome's --virtual-time-budget pauses while a
//          rAF loop keeps the page busy, so the frames come out near-identical. Use cli
//          for single stills / rendering saved footage pages; use pptr for real motion.
//
// Every run writes a capture.json provenance sidecar (params + per-frame timing + source
// URL) so the corpus is reproducible and each frame traces back to its source.
//
// SETUP (one-time, for default pptr mode):  cd reference/tools && npm install
//
// USAGE (pptr, DEFAULT -- real gameplay sequence with input injection):
//   node reference/tools/capture-frames.mjs \
//     --url "https://example.com/game" --out reference/frames/<slug> \
//     --settle 8000 --frames 10 --keys "ArrowRight,KeyX,Space" --click 480,300
//
// USAGE (cli -- single settled still, zero dependencies):
//   node reference/tools/capture-frames.mjs --mode cli \
//     --url "https://example.com/page" --out reference/frames/<slug> --settle 4000

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- locate a usable Chrome binary ---------------------------------------
function findChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  const cache = path.join(os.homedir(), '.cache', 'puppeteer');
  for (const kind of ['chrome-headless-shell', 'chrome']) {
    const base = path.join(cache, kind);
    if (existsSync(base)) {
      try {
        const hit = execSync(`ls ${base}/*/*/${kind}* 2>/dev/null | head -1`)
          .toString().trim();
        if (hit) candidates.push(hit);
      } catch {}
    }
  }
  for (const c of candidates) if (c && existsSync(c)) return c;
  throw new Error('No Chrome binary found (looked in /Applications and ~/.cache/puppeteer)');
}

// ---- optional puppeteer-core resolution ----------------------------------
function loadPuppeteerOrNull() {
  const tries = [];
  try { return require('puppeteer-core'); } catch (e) { tries.push(e.message); }
  for (const root of ['npm root -g', '/opt/homebrew/bin/npm root -g']) {
    try {
      const groot = execSync(root).toString().trim();
      return require(path.join(groot, 'puppeteer-core'));
    } catch (e) { tries.push(e.message); }
  }
  return null;
}

// ---- args ----------------------------------------------------------------
function parseArgs(argv) {
  const a = { mode: 'pptr', w: 960, h: 600, settle: 4000, frames: 6, interval: 500,
              keys: '', click: '', headed: false, title: '', url: '', out: '' };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    switch (k) {
      case '--mode': a.mode = v; i++; break;
      case '--url': a.url = v; i++; break;
      case '--out': a.out = v; i++; break;
      case '--title': a.title = v; i++; break;
      case '--w': a.w = +v; i++; break;
      case '--h': a.h = +v; i++; break;
      case '--settle': a.settle = +v; i++; break;
      case '--frames': a.frames = +v; i++; break;
      case '--interval': a.interval = +v; i++; break;
      case '--keys': a.keys = v; i++; break;
      case '--click': a.click = v; i++; break;
      case '--headed': a.headed = true; break;
    }
  }
  if (!a.url || !a.out) { console.error('ERROR: --url and --out are required'); process.exit(2); }
  return a;
}

function runChrome(chrome, args) {
  return new Promise((resolve) => {
    const p = spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => resolve({ code, err }));
  });
}

// ---- cli mode: zero-dependency single settled still (per frame index) -----
// NOTE: --virtual-time-budget does NOT fast-forward a rAF loop (it pauses while the
// page stays busy), so with --frames>1 the frames are near-identical. Intended for a
// single still or for rendering saved footage pages -- use pptr mode for real motion.
async function captureCli(a, chrome, meta) {
  for (let f = 0; f < a.frames; f++) {
    const budget = a.settle + f * a.interval; // cap on boot time before the shot
    const file = path.join(a.out, `frame-${String(f).padStart(2, '0')}.png`);
    const args = ['--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--autoplay-policy=no-user-gesture-required',
      `--window-size=${a.w},${a.h}`,
      `--virtual-time-budget=${budget}`,
      `--screenshot=${file}`, a.url];
    const { code, err } = await runChrome(chrome, args);
    if (!existsSync(file)) {
      console.log(`[capture] frame ${f} FAILED (code ${code}) ${err.split('\n')[0] || ''}`);
      continue;
    }
    meta.captured.push({ frame: f, file: path.basename(file), virtual_time_ms: budget });
    console.log(`[capture] wrote ${file} (vt=${budget}ms)`);
  }
}

// ---- pptr mode: live page + keyboard injection ---------------------------
async function capturePptr(a, chrome, meta) {
  const puppeteer = loadPuppeteerOrNull();
  if (!puppeteer) {
    console.error('ERROR: --mode pptr needs puppeteer-core. Install it, e.g.:\n' +
                  '  npm i -g puppeteer-core   (or run from a dir that has it)\n' +
                  'Or use the default --mode cli which needs no dependencies.');
    process.exit(3);
  }
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: a.headed ? false : 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars',
           '--autoplay-policy=no-user-gesture-required', `--window-size=${a.w},${a.h}`],
    defaultViewport: { width: a.w, height: a.h },
  });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.log('[page-error]', e.message));
    await page.goto(a.url, { waitUntil: 'networkidle2', timeout: 45000 })
      .catch((e) => console.log('[goto-warn]', e.message));
    if (a.click) {
      const [cx, cy] = a.click.split(',').map(Number);
      await page.mouse.click(cx, cy).catch(() => {});
      await sleep(600); await page.mouse.click(cx, cy).catch(() => {});
    }
    await sleep(a.settle);
    const keys = a.keys ? a.keys.split(',').map((s) => s.trim()).filter(Boolean) : [];
    for (let f = 0; f < a.frames; f++) {
      const key = keys.length ? keys[f % keys.length] : null;
      if (key) {
        try { await page.keyboard.down(key); await sleep(80); await page.keyboard.up(key); }
        catch {}
      }
      await sleep(a.interval);
      const file = path.join(a.out, `frame-${String(f).padStart(2, '0')}.png`);
      await page.screenshot({ path: file });
      meta.captured.push({ frame: f, file: path.basename(file), key });
      console.log(`[capture] wrote ${file}`);
    }
  } finally { await browser.close(); }
}

async function main() {
  const a = parseArgs(process.argv);
  const chrome = findChrome();
  await mkdir(a.out, { recursive: true });
  console.log(`[capture] mode=${a.mode} chrome=${chrome}`);
  console.log(`[capture] url=${a.url}`);
  const meta = { title: a.title, url: a.url, mode: a.mode, viewport: [a.w, a.h],
                 settle_ms: a.settle, frames: a.frames, interval_ms: a.interval,
                 captured: [], tool: 'capture-frames.mjs' };
  try {
    if (a.mode === 'pptr') await capturePptr(a, chrome, meta);
    else await captureCli(a, chrome, meta);
  } finally {
    await writeFile(path.join(a.out, 'capture.json'), JSON.stringify(meta, null, 2));
  }
  console.log(`[capture] done -> ${a.out} (${meta.captured.length} frame(s))`);
}

main().catch((e) => { console.error(e); process.exit(1); });
