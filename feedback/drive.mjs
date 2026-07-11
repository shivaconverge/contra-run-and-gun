// feedback/drive.mjs — GROUNDING driver for the creator-approval SPEC.
// Serves the REAL committed game/ tree and drives it in headless Chrome through
// the full player arc: title -> start -> play (move+fire) -> die -> restart.
// Captures a PNG + world-state snapshot at each stage so the feedback-panel
// contract is grounded in the build's ACTUAL states, not assumptions.
//
//   node feedback/drive.mjs
//
// Evidence -> feedback/frames/*.png + feedback/frames/drive.json
// This lives under feedback/ (my owned path); it imports serveGame/findChrome
// read-only from the playtest harness and loads puppeteer-core from the repo.

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveGame, findChrome, sleep } from '../playtest/e2e/harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'frames');
// puppeteer-core is installed in the committed repo tree, not this worktree.
const require = createRequire('/Users/avinashsaxena/matrix-dfs-statemachine-pre-clock/loop_hierarchy/runs/contra-live3/repo/playtest/e2e/');
const puppeteer = require('puppeteer-core');

const snaps = [];
async function shot(page, name) {
  const dataUrl = await page.evaluate(() => {
    const c = document.getElementById('game');
    return c ? c.toDataURL('image/png') : null;
  });
  if (dataUrl) await writeFile(path.join(OUT, `${name}.png`),
    Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  const st = await page.evaluate(() => {
    const w = window.__game;
    return w ? { status: w.status, mode: w.modeKey, lives: w.lives,
      playerDead: w.player?.dead, score: w.score,
      hasLocalStorage: typeof localStorage !== 'undefined',
      feedbackGlobal: typeof window.__feedback, } : null;
  });
  snaps.push({ name, state: st });
  console.log(`  [${name}] ${JSON.stringify(st)}`);
  return st;
}

async function press(page, code, ms = 60) {
  await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code);
}

// Full-page screenshot — REQUIRED to capture the feedback panel, which is a DOM
// overlay (canvas.toDataURL only captures the canvas, never the overlay on top).
async function fullShot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
}

// Read live audio/music + panel state — grounds the panel-vs-audio interaction
// introduced by root.B's music.js (does opening the panel pause the music?).
async function probe(page) {
  return page.evaluate(() => {
    const a = window.__audio;
    return {
      panelOpen: window.__approval ? window.__approval.isOpen() : null,
      playerX: window.__game && window.__game.player ? Math.round(window.__game.player.x * 100) / 100 : null,
      status: window.__game ? window.__game.status : null,
      ctxState: a && a.ctx ? a.ctx.state : null,
      musicRunning: a && a.music ? !!a.music.running : null,
      muted: a ? !!a.muted : null,
    };
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const srv = await serveGame();
  const browser = await puppeteer.launch({
    executablePath: findChrome(), headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
    defaultViewport: { width: 960, height: 540 },
  });
  try {
    const page = await browser.newPage();
    await page.goto(`${srv.url}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForFunction(() => !!window.__game, { timeout: 15000 });
    await sleep(300);
    await shot(page, '1-title');

    // Panel reachable from TITLE (F to open) — capture, then close.
    await press(page, 'KeyF'); await sleep(150);
    await fullShot(page, '1b-title-panel');
    const titlePanel = await probe(page);
    console.log(`  [probe title-panel] ${JSON.stringify(titlePanel)}`);
    await press(page, 'KeyF'); await sleep(120); // close

    // START (Z) -> playing
    await press(page, 'KeyZ');
    await sleep(300);
    await shot(page, '2-playing-start');

    // PLAY: run right + fire for ~3s (real gameplay, music running)
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('KeyX');
    await sleep(3000);
    await shot(page, '3-playing-firefight');
    await page.keyboard.up('KeyX');
    await page.keyboard.up('ArrowRight');

    // Open panel DURING play → probe the freeze-vs-audio interaction: sim must
    // freeze (playerX unchanged over 1.2s), and observe whether music keeps
    // running while the sim is paused (a real UX question on the current build).
    await press(page, 'KeyF'); await sleep(120);
    const playPanelA = await probe(page);
    await sleep(1200);
    const playPanelB = await probe(page);
    await fullShot(page, '3b-play-panel');
    const simFrozen = playPanelA.playerX === playPanelB.playerX && playPanelB.status === 'playing';
    console.log(`  [probe play-panel A] ${JSON.stringify(playPanelA)}`);
    console.log(`  [probe play-panel B] ${JSON.stringify(playPanelB)}  simFrozen=${simFrozen}`);
    await press(page, 'KeyF'); await sleep(120); // close

    // DIE: keep running right into hazards with no fire; poll for gameover.
    await page.keyboard.down('ArrowRight');
    let died = false;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      const s = await page.evaluate(() => window.__game?.status);
      if (s === 'gameover') { died = true; break; }
    }
    await page.keyboard.up('ArrowRight');
    let forcedDeath = false;
    if (!died) {
      // Real play didn't kill us within ~10s; force the gameover STATE so we can
      // capture that overlay. Recorded as forced in evidence (not a real death).
      forcedDeath = true;
      await page.evaluate(() => { const w = window.__game; w.lives = -1; w.status = 'gameover'; });
    }
    await sleep(200);
    const goState = await shot(page, '4-gameover');

    // Panel reachable from GAME-OVER (the natural verdict moment) — capture.
    await press(page, 'KeyF'); await sleep(150);
    await fullShot(page, '4b-gameover-panel');
    const goPanel = await probe(page);
    console.log(`  [probe gameover-panel] ${JSON.stringify(goPanel)}`);
    await press(page, 'KeyF'); await sleep(120); // close

    // RESTART (R) -> playing
    await press(page, 'KeyR');
    await sleep(300);
    await shot(page, '5-restart-playing');

    await writeFile(path.join(OUT, 'drive.json'), JSON.stringify({
      when: new Date().toISOString(), url: srv.url,
      diedViaRealPlay: died, forcedDeath,
      panelProbes: { titlePanel, playPanelA, playPanelB, simFrozenWhilePanelOpen: simFrozen, goPanel },
      snaps,
    }, null, 2));
    console.log(`\nDONE. died=${died} forced=${forcedDeath}. evidence -> feedback/frames/`);
  } finally {
    await browser.close();
    await srv.close();
  }
}
main().catch((e) => { console.error('DRIVE ERROR:', e); process.exit(2); });
