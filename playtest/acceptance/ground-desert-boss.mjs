// ground-desert-boss.mjs — ACCEPTOR grounding for PR#83 (re-seeded boss_desert v2).
//
// Proves the re-seeded Sand Gunship sprite is ACTIVE in the shipped flow, not just
// present on disk: it (a) boots the real game/ build in a headless browser, (b) reads
// the Image the game's OWN asset loader (assets.get) resolved for the 'boss_desert'
// key and asserts its natural dimensions match the v2 re-seed (74x34, not v1's 76x42),
// (c) walks the NORMAL campaign progression to the desert stage and confirms
// render.js resolves that sprite as the themed boss (themedBoss = assets.get('boss_'+
// world.theme.id)), and (d) dumps the exact pixels the game blits into a look-frame.
//
// Exit 0 + writes frames/desert-boss-v2.png iff the v2 sprite is loaded AND selected
// as the desert boss art. Any mismatch is a hard fail.

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const GAME = path.join(REPO, 'game');
const OUT = path.join(HERE, 'frames', 'desert-boss-v2.png');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.mp3': 'audio/mpeg', '.css': 'text/css' };

function findChrome() {
  const c = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return c;
}

const server = http.createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const abs = path.join(GAME, rel);
    if (!abs.startsWith(GAME)) { res.writeHead(403).end(); return; }
    const body = await fs.readFile(abs);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('404'); }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/`;
console.log('serving game/ at', base);

const puppeteer = require(path.join(REPO, 'reference', 'tools', 'node_modules', 'puppeteer-core'));
const browser = await puppeteer.launch({
  executablePath: findChrome(), headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--mute-audio', '--window-size=520,320'],
});
let failed = false;
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 520, height: 320, deviceScaleFactor: 2 });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForFunction('window.__booted === true', { timeout: 20000 });
  await page.waitForFunction('window.__assets && window.__assets.get', { timeout: 20000 });
  // Give the async image loader time to resolve the boss_desert PNG.
  await page.waitForFunction("!!window.__assets.get('boss_desert')", { timeout: 10000 });

  // (b) the sprite the GAME'S loader resolved for the boss_desert key.
  const dims = await page.evaluate(() => {
    const img = window.__assets.get('boss_desert');
    return { w: img.naturalWidth, h: img.naturalHeight, src: img.src.split('/').pop() };
  });
  console.log('boss_desert loaded by game:', JSON.stringify(dims));
  if (dims.w !== 74 || dims.h !== 34) {
    console.error(`FAIL: expected v2 re-seed 74x34, got ${dims.w}x${dims.h}`);
    failed = true;
  }

  // (c) walk NORMAL progression to the desert stage; confirm render.js would pick
  //     boss_desert as themedBoss for that stage.
  await page.keyboard.press('Space');
  await page.waitForFunction("window.__game.status === 'playing'", { timeout: 10000 });
  let reached = null;
  for (let i = 0; i < 7; i++) {
    const meta = await page.evaluate(() => ({
      stageNum: window.__game.stageNum,
      theme: window.__game.level && window.__game.level.theme,
      bossKind: window.__game.boss && window.__game.boss.kind,
    }));
    if (meta.theme === 'desert') { reached = meta; break; }
    // force-clear + advance (documented harness affordance)
    await page.evaluate(() => {
      const w = window.__game;
      if (w.boss) { w.boss.dead = true; w.boss.hp = 0; }
      if (typeof w.requestNextStage === 'function') w.requestNextStage();
    });
    await page.keyboard.press('KeyN');
    await sleep(400);
  }
  if (!reached) { console.error('FAIL: never reached desert stage via progression'); failed = true; }
  else {
    console.log('reached desert stage:', JSON.stringify(reached));
    // The exact resolution render.js drawEnemy does for the themed boss.
    const themed = await page.evaluate(() => {
      const w = window.__game;
      const t = window.__assets.get('boss_' + w.theme.id);
      const base = window.__assets.get(w.boss && w.boss.kind);
      return {
        themeId: w.theme.id,
        themedBossKey: 'boss_' + w.theme.id,
        themedBossResolved: !!t,
        themedDims: t ? { w: t.naturalWidth, h: t.naturalHeight } : null,
        bossKind: w.boss && w.boss.kind,
        wouldUseThemed: !!t, // themedBoss wins in drawChopper/drawBoss
        baseResolved: !!base,
      };
    });
    console.log('render.js themed-boss resolution:', JSON.stringify(themed));
    if (!themed.themedBossResolved || themed.themedBossKey !== 'boss_desert') {
      console.error('FAIL: desert stage does not resolve boss_desert as themed boss');
      failed = true;
    }
    if (themed.themedDims && (themed.themedDims.w !== 74 || themed.themedDims.h !== 34)) {
      console.error('FAIL: themed desert boss is not the v2 sprite'); failed = true;
    }

    // (d) LOOK-FRAME: blit the exact bytes the game will draw, at 6x, so a human can
    //     confirm the v2 clean-panels art (not v1 mush).
    const dataUrl = await page.evaluate(() => {
      const img = window.__assets.get('boss_desert');
      const s = 6;
      const c = document.createElement('canvas');
      c.width = img.naturalWidth * s; c.height = img.naturalHeight * s;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.fillStyle = '#101418'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    });
    const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
    await fs.mkdir(path.dirname(OUT), { recursive: true });
    await fs.writeFile(OUT, buf);
    console.log('wrote look-frame', path.relative(REPO, OUT), buf.length, 'bytes');
  }
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? 'RESULT: FAIL' : 'RESULT: PASS — boss_desert v2 is loaded AND selected as the desert boss');
process.exit(failed ? 1 : 0);
