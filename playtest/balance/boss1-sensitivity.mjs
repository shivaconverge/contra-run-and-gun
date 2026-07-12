// boss1-sensitivity.mjs — ACTIONABLE cadence-sensitivity probe for BAL-1.
//
// BAL-1 (BALANCE-REPORT.md): the baseline bot GAME-OVERs at the arcade Stage-1 boss.
// root.C has eased the Sentinel's fire twice (…→80→92 fireEvery) and it STILL walls a
// baseline run — but "how much slower would the fire have to be to cross the survivable
// threshold?" was unanswered. This probe answers it with a FACT curve: it drives the
// SAME baseline bot at the REAL Stage-1 boss while live-overriding ONLY the boss's fire
// cadence (`def.fireEvery` / `def.enrageFireEvery`) by a factor, and records, per factor,
// whether the bot clears, how many times it dies, the min boss HP it reaches, and its
// survival time.
//
// WHAT THIS IS / ISN'T:
//   • It is a WHAT-IF sensitivity measurement run against the REAL engine — NOT an edit to
//     game source (the override is transient, in-memory, per page-load) and NOT a claim of
//     the "correct" value. It hands root.C the shape of the difficulty response so the
//     config.js call is informed, not blind.
//   • The bot is the same BASELINE heuristic as campaign-playthrough.mjs (run+gun+gap-hop
//     +boss-aim + one dodge reflex, pit-aware) — NOT a skilled human. So the factor at
//     which the BOT first clears is an UPPER BOUND on the easing a human would need; a
//     skilled player crosses the threshold at a smaller factor. Framed accordingly.
//
// Run (from repo root):  node playtest/balance/boss1-sensitivity.mjs
// Emits: playtest/balance/boss1-sensitivity.json

import { serveGame, findChrome, loadPuppeteer } from '../e2e/harness.mjs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED = 1234;
const HZ = 60;
const BUDGET = 9000;            // frames cap for a single boss-1 attempt (~150s)
const CHUNK = 120;
const FACTORS = [1.0, 1.15, 1.3, 1.5, 1.75, 2.0, 2.5];  // ×fireEvery (bigger = slower fire)

// Same baseline bot + instrumentation as the main harness, plus a live cadence override
// applied to the Stage-1 boss (idempotent each chunk so it survives any state change).
const STEP_CHUNK = (chunk, factor) => {
  const w = window.__game, p = w.player;
  const gf = w.level.gravityFloor;
  const B = window.__b1;
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  // apply the cadence override off the ORIGINAL values captured at boot
  if (w.boss && B.baseFire) {
    w.boss.def.fireEvery = Math.round(B.baseFire * factor);
    if (B.baseEnrage) w.boss.def.enrageFireEvery = Math.round(B.baseEnrage * factor);
  }
  let stopped = null;
  for (let i = 0; i < chunk; i++) {
    const preLives = w.lives;
    const aheadX = p.x + p.w + 14, footY = p.y + p.h + 4;
    const groundAhead = w.solids.some((g) => g.kind === 'ground' && aheadX >= g.x && aheadX <= g.x + g.w && footY >= g.y && footY <= g.y + g.h + 4);
    let jump = p.grounded && !groundAhead;
    let up = false, down = false, left = false, right = true;
    const pcx = p.x + p.w / 2, pcy0 = p.y + p.h / 2;
    let danger = null, dHigh = false;
    for (const b of w.bullets) {
      if (b.from === 'player' || b.dead) continue;
      const bx = b.x + (b.w || 2) / 2, by = b.y + (b.h || 2) / 2;
      const dx = bx - pcx, vx = (b.vx || 0);
      const closing = (dx < 0 ? vx > 0.1 : vx < -0.1) || Math.abs(dx) < 24;
      if (Math.abs(dx) < 60 && Math.abs(by - pcy0) < 16 && closing) { danger = b; dHigh = by < pcy0 - 3; break; }
    }
    if (danger && p.grounded) { if (dHigh) down = true; else jump = true; }
    const bo = w.boss;
    if (bo && w.bossActive && !bo.dead) {
      const bcy = bo.y + bo.h / 2;
      up = bcy < pcy0 - 6; down = down || bcy > pcy0 + 6;
      const leftFootX = p.x - 6;
      const groundLeft = w.solids.some((g) => g.kind === 'ground' && leftFootX >= g.x && leftFootX <= g.x + g.w && (p.y + p.h + 4) >= g.y && (p.y + p.h + 4) <= g.y + g.h + 6);
      if (danger && !dHigh && !jump && groundLeft && Math.abs(danger.y + 1 - pcy0) < 8) { left = true; right = false; }
    }
    w.step({ left, right, up, down, jump, fire: true, swap: false, jumpPressed: jump, swapPressed: false });
    if (w.lives < preLives) B.deaths++;
    if (w.boss && w.bossActive) B.reachedBoss = true;
    if (w.boss && !w.boss.dead && w.bossActive && (B.minHp === null || w.boss.hp < B.minHp)) B.minHp = w.boss.hp;
    if (w.status !== 'playing') { stopped = w.status; break; }
  }
  return { status: w.status, lives: w.lives, deaths: B.deaths, reachedBoss: B.reachedBoss,
    minHp: B.minHp, bossHpMax: w.boss ? w.boss.def.hp : null, elapsed: w.frame - B.start,
    fireEvery: w.boss ? w.boss.def.fireEvery : null, enrageFireEvery: w.boss ? w.boss.def.enrageFireEvery : null, stopped };
};

async function runFactor(page, url, factor) {
  await page.goto(`${url}/index.html?headless=1&scenario=idle&frames=0&seed=${SEED}&mode=arcade`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__game && window.__game.status === "playing"');
  await page.evaluate(() => {
    const w = window.__game;
    window.__b1 = { deaths: 0, reachedBoss: false, minHp: null, start: w.frame,
      baseFire: w.boss ? w.boss.def.fireEvery : null, baseEnrage: w.boss ? w.boss.def.enrageFireEvery : null };
  });
  let last = null;
  for (;;) {
    last = await page.evaluate(STEP_CHUNK, CHUNK, factor);
    if (last.stopped) break;
    if (last.elapsed > BUDGET) { last.stopped = 'budget'; break; }
  }
  const cleared = last.status === 'cleared';
  return {
    factor, fireEvery: last.fireEvery, enrageFireEvery: last.enrageFireEvery,
    cleared, deaths: last.deaths, minBossHp: last.minHp, bossHpMax: last.bossHpMax,
    survivalSec: +(last.elapsed / HZ).toFixed(1), outcome: last.stopped,
  };
}

async function main() {
  const srv = await serveGame();
  const pptr = loadPuppeteer();
  const browser = await pptr.launch({ executablePath: findChrome(), headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 480, height: 270 });
    const rows = [];
    for (const f of FACTORS) rows.push(await runFactor(page, srv.url, f));
    const firstClear = rows.find((r) => r.cleared);
    const out = {
      ts: new Date().toISOString(), seed: SEED, mode: 'arcade', stage: 1,
      boss: 'Sentinel', note: 'baseline bot; live cadence override (what-if, no source edit); factor = ×fireEvery (bigger = slower fire)',
      baselineFireEvery: rows[0] ? rows[0].fireEvery : null,
      firstClearFactor: firstClear ? firstClear.factor : null,
      firstClearFireEvery: firstClear ? firstClear.fireEvery : null,
      rows,
    };
    await writeFile(path.join(HERE, 'boss1-sensitivity.json'), JSON.stringify(out, null, 2));
    console.log('=== BOSS-1 ARCADE CADENCE SENSITIVITY (baseline bot; what-if override) ===');
    console.log(`baseline fireEvery=${out.baselineFireEvery} (shipped). factor = ×fireEvery, bigger = slower fire.`);
    for (const r of rows) {
      console.log(`  ×${r.factor.toFixed(2)} (fireEvery ${r.fireEvery}/${r.enrageFireEvery}): cleared=${r.cleared} deaths=${r.deaths} minBossHp=${r.minBossHp}/${r.bossHpMax} t=${r.survivalSec}s [${r.outcome}]`);
    }
    console.log(firstClear
      ? `\nBASELINE-BOT threshold: first clears arcade boss 1 at ×${firstClear.factor} (fireEvery ${firstClear.fireEvery}). A skilled human crosses it at a SMALLER factor — this is an UPPER BOUND on the easing needed.`
      : `\nBASELINE-BOT never cleared arcade boss 1 within ×${FACTORS[FACTORS.length - 1]} — the boss out-DPS-survives the bot even at ${FACTORS[FACTORS.length - 1]}× slower fire (bot-skill-bound, not purely cadence-bound).`);
  } finally {
    await browser.close();
    await srv.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
