#!/usr/bin/env node
// capture-our-game.mjs -- capture OUR game (loop-root-B, game/index.html) at its
// NATIVE resolution (480x270) via the deterministic headless harness, for
// side-by-side fidelity/feel judgment against the reference corpus.
//
// The game's headless mode (?headless=1&frames=N&seed=S) steps the sim N fixed
// frames with a scripted showcase input timeline, renders ONE deterministic frame
// to the canvas, and publishes window.__bench. We read the canvas at native pixels
// via toDataURL (NOT a scaled element screenshot) so the capture is pixel-exact.
//
// USAGE:
//   node reference/tools/capture-our-game.mjs \
//     --base http://localhost:8137 --out reference/frames/our-game \
//     --frames "30,120,240,400" --seed 1234
//
// Needs puppeteer-core (cd reference/tools && npm install). Writes one PNG per
// frame-count plus bench-<N>.json, and a capture.json index.

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
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
      try { const h = execSync(`ls ${base}/*/*/${kind}* 2>/dev/null | head -1`).toString().trim(); if (h) cands.push(h); } catch {}
    }
  }
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error('No Chrome binary found');
}
function loadPuppeteer() {
  try { return require('puppeteer-core'); } catch {}
  const groot = execSync('npm root -g').toString().trim();
  return require(path.join(groot, 'puppeteer-core'));
}

function args() {
  const a = { base: 'http://localhost:8137', out: 'reference/frames/our-game',
              frames: '30,120,240,400', seed: '1234' };
  const v = process.argv;
  for (let i = 2; i < v.length; i++) {
    if (v[i] === '--base') a.base = v[++i];
    else if (v[i] === '--out') a.out = v[++i];
    else if (v[i] === '--frames') a.frames = v[++i];
    else if (v[i] === '--seed') a.seed = v[++i];
  }
  return a;
}

async function main() {
  const a = args();
  await mkdir(a.out, { recursive: true });
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: findChrome(), headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
    defaultViewport: { width: 640, height: 400 },
  });
  const index = { subject: 'our-game (loop-root-B game/index.html)', base: a.base,
                  seed: a.seed, native: [480, 270], captures: [] };
  try {
    for (const nStr of a.frames.split(',').map((s) => s.trim()).filter(Boolean)) {
      const n = parseInt(nStr, 10);
      const page = await browser.newPage();
      const url = `${a.base}/index.html?headless=1&frames=${n}&seed=${a.seed}`;
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      // wait for the deterministic render + bench publish
      await page.waitForSelector('#headless-done', { timeout: 15000 }).catch(() => {});
      await sleep(150);
      const dataUrl = await page.evaluate(() => {
        const c = document.getElementById('game');
        return c ? c.toDataURL('image/png') : null;
      });
      const bench = await page.evaluate(() => window.__bench || null);
      if (dataUrl) {
        const b64 = dataUrl.replace(/^data:image\/png;base64,/, '');
        const file = path.join(a.out, `state-${String(n).padStart(4, '0')}.png`);
        await writeFile(file, Buffer.from(b64, 'base64'));
        await writeFile(path.join(a.out, `bench-${String(n).padStart(4, '0')}.json`),
                        JSON.stringify(bench, null, 2));
        index.captures.push({ frames: n, file: path.basename(file), bench });
        console.log(`[our-game] frames=${n} -> ${file}  status=${bench && bench.status} x=${bench && bench.playerX} hp=${bench && bench.playerHp} enemies=${bench && bench.enemiesAlive}/${bench && bench.enemiesStart}`);
      } else {
        console.log(`[our-game] frames=${n} FAILED to read canvas`);
      }
      await page.close();
    }
  } finally {
    await writeFile(path.join(a.out, 'capture.json'), JSON.stringify(index, null, 2));
    await browser.close();
  }
  console.log(`[our-game] done -> ${a.out} (${index.captures.length} states)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
