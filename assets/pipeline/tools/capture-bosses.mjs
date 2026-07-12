#!/usr/bin/env node
// capture-bosses.mjs -- drive each themed stage's boss arena headless and capture
// the canvas, to VERIFY BY LOOKING that render.js now swaps in the per-stage themed
// boss art (assets.get('boss_'+theme.id)). One PNG per stage + a JSON diagnostic
// asserting the boss_<id> asset resolved and the live enemy is a boss kind.
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
    if (existsSync(base)) { try { const h = execSync(`ls ${base}/*/*/${kind}* 2>/dev/null | head -1`).toString().trim(); if (h) cands.push(h); } catch {} }
  }
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error('No Chrome binary found');
}
const require2 = createRequire(path.join(process.cwd(), 'reference/tools/index.js'));
const puppeteer = require2('puppeteer-core');

const BASE = 'http://localhost:8137';
const OUT = 'assets/pipeline/experiments/bosses/live';
// stage -> expected themed boss key (jungle/cascade have none -> base art)
const STAGES = [
  { level: 1, theme: 'jungle',   expect: null },
  { level: 3, theme: 'snow',     expect: 'boss_snow' },
  { level: 4, theme: 'desert',   expect: 'boss_desert' },
  { level: 5, theme: 'foundry',  expect: 'boss_foundry' },
  { level: 6, theme: 'caverns',  expect: 'boss_caverns' },
  { level: 7, theme: 'fortress', expect: 'boss_fortress' },
];

const browser = await puppeteer.launch({ executablePath: findChrome(), headless: 'shell', args: ['--no-sandbox'] });
await mkdir(OUT, { recursive: true });
const diag = [];
for (const s of STAGES) {
  const page = await browser.newPage();
  await page.setViewport({ width: 480, height: 270, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  const url = `${BASE}/?headless=1&scenario=boss&level=${s.level}&frames=90&weapon=spread`;
  await page.goto(url, { waitUntil: 'networkidle0' });
  await sleep(400);
  const info = await page.evaluate((expect) => {
    const g = window.__game, a = window.__assets;
    const themeId = g && g.theme && g.theme.id;
    const themedLoaded = !!(a && a.get('boss_' + themeId));
    const boss = g && g.boss;
    return {
      themeId,
      themedKey: 'boss_' + themeId,
      themedLoaded,
      expectMatchesLoaded: expect ? themedLoaded : !themedLoaded,
      bossKind: boss ? boss.kind : null,
      bossAlive: !!(boss && !boss.dead),
    };
  }, s.expect);
  const dataUrl = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  const file = path.join(OUT, `boss-${s.level}-${s.theme}.png`);
  await writeFile(file, png);
  diag.push({ ...s, ...info, errs: errs.length, file });
  await page.close();
}
await writeFile(path.join(OUT, 'diag.json'), JSON.stringify(diag, null, 2));
console.log(JSON.stringify(diag, null, 2));
await browser.close();
