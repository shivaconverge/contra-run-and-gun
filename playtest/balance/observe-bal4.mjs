// observe-bal4.mjs — GROUNDING probe for the BAL-4 mode-gated weapon-on-death rule.
//
// Drives the REAL served game build in headless Chrome, boots BOTH modes, gives the
// player a non-rifle weapon, forces a death, and reads back player.weaponKey after the
// death (and after the respawn). Proves the contributed world.js code path is LIVE:
//   • arcade → death REVERTS to rifle   (1987 single-slot invariant holds)
//   • casual → death RETAINS the weapon (BAL-4 accessibility)
// Exit non-zero if either expectation fails. Pure observation, writes nothing.

import { serveGame, findChrome } from '../e2e/harness.mjs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// puppeteer-core is installed under reference/tools; resolve it from there so this
// probe runs without a fresh install in playtest/e2e.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const requireFromTools = createRequire(path.join(REPO, 'reference', 'tools', 'package.json'));
const loadPuppeteer = () => requireFromTools('puppeteer-core');

const SEED = 1234;

async function probe(page, url, mode) {
  await page.goto(`${url}/index.html?headless=1&scenario=idle&frames=0&seed=${SEED}&mode=${mode}`,
    { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__game && window.__game.status === "playing"');
  return await page.evaluate(() => {
    const w = window.__game, p = w.player;
    p.setWeapon('spread');                 // arm a non-rifle weapon
    const before = p.weaponKey;
    // Force a genuine death through the real path: mark dead, route _onHurt→_onPlayerDeath.
    p.dead = true;
    w._onPlayerDeath();
    const afterDeath = p.weaponKey;
    // Now advance past the respawn timer so _doRespawn runs (mirrors the death gate).
    for (let i = 0; i < 80 && w.status === 'playing'; i++) {
      w.step({ left: false, right: false, up: false, down: false, jump: false, fire: false });
      if (!p.dead) break;                  // respawned
    }
    const afterRespawn = p.weaponKey;
    return { mode: w.modeKey, before, afterDeath, afterRespawn, status: w.status, lives: w.lives };
  });
}

async function main() {
  const srv = await serveGame();
  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: 'shell',
    args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage();
    const arcade = await probe(page, srv.url, 'arcade');
    const casual = await probe(page, srv.url, 'casual');
    console.log('ARCADE:', JSON.stringify(arcade));
    console.log('CASUAL:', JSON.stringify(casual));

    const arcadeOk = arcade.before === 'spread' && arcade.afterDeath === 'rifle' && arcade.afterRespawn === 'rifle';
    const casualOk = casual.before === 'spread' && casual.afterDeath === 'spread' && casual.afterRespawn === 'spread';
    console.log(`\narcade reverts on death+respawn : ${arcadeOk ? 'PASS' : 'FAIL'}`);
    console.log(`casual retains on death+respawn : ${casualOk ? 'PASS' : 'FAIL'}  <-- BAL-4 contribution`);
    const ok = arcadeOk && casualOk;
    console.log(`\nVERDICT: ${ok ? 'PASS — mode-gated weapon-on-death is LIVE' : 'FAIL'}`);
    process.exitCode = ok ? 0 : 1;
  } finally {
    await browser.close();
    await srv.close();
  }
}

main().catch((e) => { console.error('PROBE ERROR:', e); process.exit(2); });
