#!/usr/bin/env node
// touch.mjs — drive the build as a MOBILE (Android/touch) player through the
// on-screen control overlay, not the keyboard. The goal targets web/Android, so
// the touch path is a required capability; every other harness here uses the
// keyboard. We force the overlay with ?touch=1 (main.js), emulate a touch phone
// viewport, and operate the real DOM buttons via Pointer Events — asserting the
// overlay exists, a touch player can START from the title, and each button
// actually drives the live sim (move / jump / fire / prone / aim-up).
//
//   node playtest/e2e/touch.mjs
//
// Exits non-zero if the mobile control path is broken. Evidence:
//   playtest/frames/live/touch-play.png (full page: overlay over gameplay)
//   playtest/frames/live/touch.json

import { mkdir, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveGame, findChrome, loadPuppeteer, sleep } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'frames', 'live');

const results = [];
function assert(id, ok, detail, critical = true) {
  results.push({ id, ok: !!ok, detail: String(detail), critical });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  —  ${detail}`);
}

const BTN = { up: '#touch-controls .up', left: '#touch-controls .left', right: '#touch-controls .right',
  down: '#touch-controls .down', jump: '#touch-controls .jump', fire: '#touch-controls .fire' };

// Operate a real overlay button via Pointer Events (what a finger does).
async function press(page, sel) {
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch' }));
  }, sel);
}
async function lift(page, sel) {
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'touch' }));
  }, sel);
}
async function tap(page, sel, ms = 200) { await press(page, sel); await sleep(ms); await lift(page, sel); }

async function snap(page) {
  return page.evaluate(() => {
    const w = window.__game; if (!w) return null; const p = w.player;
    return { status: w.status, px: Math.round(p.x), py: Math.round(p.y), pvy: +p.vy.toFixed(2),
      grounded: !!p.grounded, prone: p.prone, aimy: p.aim.y,
      playerBullets: w.bullets.filter((b) => b.from === 'player').length };
  });
}
// Hold a button for `ms`, polling `pick` each ~40ms, return the peak seen.
async function holdWatch(page, sel, ms, pick) {
  await press(page, sel);
  let peak = -Infinity; const t0 = Date.now();
  while (Date.now() - t0 < ms) { const s = await snap(page); if (s) peak = Math.max(peak, pick(s)); await sleep(40); }
  await lift(page, sel);
  return peak;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const srv = await serveGame();
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: findChrome(), headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
  });
  const evidence = { when: new Date().toISOString?.() || null, viewport: 'landscape phone (hasTouch)' };
  let browserClosed = false;
  try {
    const page = await browser.newPage();
    // Emulate a landscape touch phone so the overlay lays out as on a device.
    await page.emulate({
      viewport: { width: 812, height: 375, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
    });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));

    // ?touch=1 forces the overlay even off a real touch device (main.js:146).
    await page.goto(`${srv.url}/index.html?touch=1`, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForFunction(() => !!window.__game, { timeout: 15000 });
    await sleep(300);

    // 1) The on-screen overlay mounted with the full control set.
    const dom = await page.evaluate(() => {
      const w = document.getElementById('touch-controls');
      const btns = w ? [...w.querySelectorAll('button')].map((b) => b.className) : [];
      return { overlay: !!w, api: !!window.__touch, buttons: btns };
    });
    evidence.buttons = dom.buttons;
    assert('touch.overlayMounts', dom.overlay && dom.api, `#touch-controls present=${dom.overlay}, window.__touch=${dom.api}`);
    const need = ['up', 'left', 'right', 'down', 'jump', 'fire'];
    assert('touch.buttonSet', need.every((c) => dom.buttons.includes(c)),
      `buttons=${JSON.stringify(dom.buttons)} (need ${JSON.stringify(need)})`);

    // 1b) MOBILE-FIRST LAYOUT (PR#78): on a touch device the desktop chrome is
    //     hidden and the canvas fills the viewport at 16:9. Facts off the DOM.
    const layout = await page.evaluate(() => {
      const c = document.getElementById('game'), r = c.getBoundingClientRect();
      const h1 = document.querySelector('h1'), help = document.getElementById('help');
      const rot = document.getElementById('rotate-hint');
      return {
        touchActive: document.body.classList.contains('touch-active'),
        cw: Math.round(r.width), ch: Math.round(r.height), vw: window.innerWidth, vh: window.innerHeight,
        h1Hidden: h1 ? getComputedStyle(h1).display === 'none' : true,
        helpHidden: help ? getComputedStyle(help).display === 'none' : true,
        rotateShown: rot ? getComputedStyle(rot).display !== 'none' : false,
      };
    });
    evidence.layout = layout;
    assert('touch.mobileLayoutEngages', layout.touchActive && layout.h1Hidden && layout.helpHidden,
      `body.touch-active=${layout.touchActive}, desktop chrome hidden (h1=${layout.h1Hidden}, help=${layout.helpHidden})`);
    // Landscape 16:9: canvas fills the limiting axis (here height==vh) and keeps ratio.
    const fillsHeight = layout.ch >= layout.vh * 0.95;
    const ratio = layout.cw / layout.ch;
    assert('touch.canvasFillsViewport', fillsHeight && Math.abs(ratio - 16 / 9) < 0.06,
      `canvas ${layout.cw}×${layout.ch} in ${layout.vw}×${layout.vh} viewport: fills height=${fillsHeight}, ratio=${ratio.toFixed(2)} (want 1.78)`);
    // In LANDSCAPE the rotate-hint must be hidden (we're already correctly oriented).
    assert('touch.rotateHintHiddenLandscape', !layout.rotateShown,
      `landscape → rotate-hint shown=${layout.rotateShown} (should be hidden)`);

    // 2) A touch-only player can START from the title (else mobile is stranded).
    const boot = await snap(page);
    assert('touch.bootsToTitle', boot.status === 'title', `status='${boot.status}'`);
    await tap(page, BTN.fire, 250);
    await sleep(200);
    const afterStart = await snap(page);
    assert('touch.startFromTitle', afterStart.status === 'playing',
      `tapped FIRE on title → status='${afterStart.status}' (mobile must be able to start)`);

    // 3) Each control button drives the live sim. Enemies are dormant/far for the
    //    first ~1.5s at spawn, so these mechanic checks run on a safe slate.
    const x0 = (await snap(page)).px;
    const xPeak = await holdWatch(page, BTN.right, 700, (s) => s.px);
    assert('touch.dpadRightMoves', xPeak > x0 + 20, `▶ held: x ${x0} → peak ${xPeak}`);

    await press(page, BTN.jump); await sleep(120);
    const jump = await snap(page);
    await lift(page, BTN.jump);
    assert('touch.jumpButton', jump.pvy < 0 || !jump.grounded, `JUMP: vy=${jump.pvy} grounded=${jump.grounded}`);
    await sleep(500);

    const firePeak = await holdWatch(page, BTN.fire, 400, (s) => s.playerBullets);
    assert('touch.fireButton', firePeak > 0, `FIRE held: peak player bullets=${firePeak}`);

    const pronePeak = await holdWatch(page, BTN.down, 260, (s) => (s.prone ? 1 : 0));
    assert('touch.dpadDownProne', pronePeak === 1, `▼ held → prone engaged=${pronePeak === 1}`);

    const aimPeak = await holdWatch(page, BTN.up, 220, (s) => (s.aimy < 0 ? 1 : 0));
    assert('touch.dpadUpAims', aimPeak === 1, `▲ held → aim up engaged=${aimPeak === 1}`);

    // Evidence: full-page screenshot so the DOM overlay shows over the canvas.
    const shot = await page.screenshot({ type: 'png' });
    await writeFile(path.join(OUT, 'touch-play.png'), shot);

    // 4) RESTART after game-over via touch. On a real phone there is NO keyboard,
    //    so a touch player MUST be able to restart from game-over. We seed lives=0
    //    (documented setup shortcut), let a real death drive gameover, then try
    //    every touch button to restart. INTENDED: one of them returns to 'playing'.
    await page.evaluate(() => { window.__game.lives = 0; });
    let gameover = false;
    await press(page, BTN.right);
    for (let i = 0; i < 60 && !gameover; i++) { if ((await snap(page)).status === 'gameover') gameover = true; await sleep(80); }
    await lift(page, BTN.right);
    assert('touch.reachesGameover', gameover, `drove into a grunt on touch → status=${(await snap(page)).status}`);
    let restarted = false, restartBtn = null;
    for (const [name, b] of [['FIRE', BTN.fire], ['JUMP', BTN.jump], ['▲', BTN.up], ['▼', BTN.down]]) {
      await tap(page, b, 200); await sleep(120);
      if ((await snap(page)).status === 'playing') { restarted = true; restartBtn = name; break; }
    }
    // TOUCH-1 (was a mobile blocker) is FIXED: touch.js:84 calls world.reset() on a
    // press while status is 'gameover'/'cleared', so a keyboard-less phone player can
    // replay. This asserts that path stays working (regression guard).
    assert('touch.restartFromGameover', restarted,
      `a touch press restarts after game-over (TOUCH-1 fixed): ${restartBtn} → status=${(await snap(page)).status}`);

    evidence.pageErrors = pageErrors.filter((e) => !/favicon\.ico/i.test(e));
    assert('touch.noErrors', evidence.pageErrors.length === 0, `errors=${JSON.stringify(evidence.pageErrors)}`);

    // 5) PORTRAIT rotate-hint: the game is landscape, so a phone held in portrait
    //    should be nudged to rotate. Separate page in a portrait touch viewport.
    const pv = await browser.newPage();
    await pv.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile' });
    await pv.goto(`${srv.url}/index.html?touch=1`, { waitUntil: 'networkidle2', timeout: 30000 });
    await pv.waitForFunction(() => !!window.__game, { timeout: 15000 });
    await sleep(300);
    const portrait = await pv.evaluate(() => {
      const rot = document.getElementById('rotate-hint');
      return { rotateShown: rot ? getComputedStyle(rot).display !== 'none' : false, hasHint: !!rot };
    });
    await pv.screenshot({ type: 'png' }).then((b) => writeFile(path.join(OUT, 'touch-portrait.png'), b));
    await pv.close();
    evidence.portrait = portrait;
    assert('touch.portraitRotateHint', portrait.hasHint && portrait.rotateShown,
      `portrait phone → rotate-to-landscape hint shown=${portrait.rotateShown}`);
  } finally {
    evidence.results = results;
    evidence.passed = results.filter((r) => r.ok).length;
    evidence.failed = results.filter((r) => !r.ok).length;
    await writeFile(path.join(OUT, 'touch.json'), JSON.stringify(evidence, null, 2));
    await browser.close(); browserClosed = true;
    await srv.close();
    const { passed = 0, failed = results.length } = evidence;
    console.log(`\n=== TOUCH: ${passed} passed, ${failed} failed (mobile on-screen controls) ===`);
    console.log(`evidence -> ${OUT}/touch.json + touch-play.png`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

main().catch((e) => { console.error('TOUCH HARNESS ERROR:', e); process.exit(2); });
