// campaign-playthrough.mjs — DAMAGE-ON, natural-progression campaign grounding.
//
// PERSPECTIVE (this seat): a real player driving the FULL 7-stage campaign in a
// REAL headless browser, advancing ONLY by beating each stage's boss for real and
// taking the SHIPPED next-stage transition — never ?level=, never a force-killed
// boss, never the N-key-without-a-clear affordance. For EACH stage we record the
// things a player actually experiences: is it reachable, is the boss beatable,
// how long the clear takes, how many times we die and WHY (pit / contact /
// projectile), lives remaining, and any soft-lock / unwinnable state.
//
// WHY THIS IS DISTINCT from the existing coverage:
//   • game/src/main.js `scenario=campaign` oracle and playtest/acceptance/scope-served
//     both drive the campaign with INVINCIBILITY ON (p.iframe=999) — they prove
//     TRAVERSABILITY + boss DEFEATABILITY + the transition chain, but by construction
//     they can NEVER surface a survival/balance problem: a one-hit-death arcade run
//     with damage OFF cannot die. scope-served additionally uses the KeyN affordance
//     AND marks the boss dead to make the 7-stage walk deterministic.
//   • This harness is the missing half: damage ON (invincibility OFF), in BOTH
//     arcade and casual, with the boss beaten by genuinely shooting it down, so the
//     numbers reflect real end-user pressure — deaths, causes, lives, soft-locks.
//
// GROUND TRUTH PASS: we ALSO run the identical driver with invincibility ON so the
// report can separate "unreachable / undefeatable geometry" (a real BUILD defect for
// root.C) from "hard but survivable" (a BALANCE signal in config.js). Same bot, one
// flag flipped — so the two passes are directly comparable.
//
// THE BOT (documented, honest): a BASELINE run-and-gun heuristic — always advance
// right, hop when there's no ground just ahead (clears pits/water), grab on-path
// weapon pickups by running over them, and once the boss is live aim vertically at
// it and hold fire. It has ONE survival reflex: a short hop when an enemy bullet is
// imminent at standing height. It does NOT play like a skilled human (no lane
// weaving, no pattern memorisation). So arcade death counts are an UPPER BOUND on
// difficulty for a naive player, not a claim the game is unwinnable; casual (shield
// + 5 lives) is the accessibility read. All findings are framed accordingly.
//
// FACTS vs JUDGMENTS: reach / defeat / deaths / causes / lives / frames are FACTS
// computed from the live world each frame. The distinctness-by-looking verdict is
// NOT in here — it is a human multimodal read of the captured frames, recorded in
// BALANCE-REPORT.md. CV numbers here are never a fidelity verdict.
//
// Run (from repo root):  node playtest/balance/campaign-playthrough.mjs
// Emits: playtest/balance/campaign-playthrough.json
//        playtest/balance/frames/<mode>/stage-N-boss.png   (real boss-fight frames)

import { serveGame, findChrome, loadPuppeteer } from '../e2e/harness.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRAMES = path.join(HERE, 'frames');
const SEED = 1234;                 // fixed → reproducible
const STAGE_BUDGET = 15000;        // frames/stage cap (~250s) — DPS is never the limiter; survival is
const CHUNK = 120;                 // frames per evaluate() call (so Node can screenshot between chunks)
const HZ = 60;

// The bot + per-frame instrumentation, injected as a function so it runs inside the
// page against the live World. Accumulates deaths (with cause) across chunks on
// window.__bal so screenshots between chunks don't lose state. `stopAtBoss` lets the
// caller pause the drive the first frame the boss is live, screenshot the real
// boss-fight from Node, then resume the SAME __bal state to finish the stage.
const STEP_CHUNK = (invincible, chunk, stopAtBoss) => {
  const w = window.__game, p = w.player;
  const gf = w.level.gravityFloor;
  const B = window.__bal;
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  let stopped = null;
  for (let i = 0; i < chunk; i++) {
    const preLives = w.lives;
    // --- BASELINE run-and-gun bot -------------------------------------------
    const aheadX = p.x + p.w + 14, footY = p.y + p.h + 4;
    const groundAhead = w.solids.some((g) => g.kind === 'ground' && aheadX >= g.x && aheadX <= g.x + g.w && footY >= g.y && footY <= g.y + g.h + 4);
    let jump = p.grounded && !groundAhead;               // hop the gap
    let up = false, down = false, left = false, right = true;
    // SURVIVAL REFLEX (traversal + boss): react to an enemy bullet that is close,
    // on our horizontal band, and closing in. Jump over a low shot; prone under a
    // high one. A player weaves the boss's aimed fire — this is the machine analog.
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
    // aim at the boss once it is live
    const bo = w.boss;
    if (bo && w.bossActive && !bo.dead) {
      const bcy = bo.y + bo.h / 2;
      up = bcy < pcy0 - 6; down = down || bcy > pcy0 + 6;
      // small horizontal weave off the barrier when a shot is dead-on and level
      if (danger && !dHigh && !jump && Math.abs(danger.y + 1 - pcy0) < 8) { left = true; right = false; }
    }
    if (invincible) p.iframe = 999;
    w.step({ left, right, up, down, jump, fire: true, swap: false, jumpPressed: jump, swapPressed: false });

    // --- death detection + cause classification -----------------------------
    if (w.lives < preLives) {                            // lost a life THIS frame
      let cause;
      if (p.y > gf) cause = 'pit';                       // fell past the floor (dry chasm or water)
      else if (w.enemies.some((e) => !e.dead && overlap(e, p))) cause = 'contact';  // enemy body on us
      else cause = 'projectile';                          // otherwise an enemy bullet
      // Contra invariant: a death reverts the weapon to the default rifle
      // (world.js _onPlayerDeath -> resetWeapon, before the lives-- / gameover check).
      // Record it so the gate can assert the weapon-persistence rule holds every death.
      B.deaths.push({ frame: w.frame, x: Math.round(p.x), cause, livesAfter: w.lives, weaponAfterDeath: p.weaponKey });
    }
    if (w.boss && w.bossActive) B.reachedBoss = true;
    if (w.boss && !w.boss.dead && w.bossActive) {
      if (B.minBossHp === null || w.boss.hp < B.minBossHp) B.minBossHp = w.boss.hp;
    }
    // progress watchdog (soft-lock: playing, not at boss, x not advancing)
    if (w.status === 'playing' && !w.bossActive) {
      if (p.x > B.maxX + 2) { B.maxX = p.x; B.stuckFrames = 0; } else B.stuckFrames++;
    } else B.stuckFrames = 0;
    if (w.status !== 'playing') { stopped = w.status; break; }
    if (stopAtBoss && w.bossActive && !B.pausedAtBoss) { B.pausedAtBoss = true; stopped = 'at-boss'; break; }
  }
  return {
    status: w.status, lives: w.lives, playerX: Math.round(p.x), frame: w.frame,
    reachedBoss: B.reachedBoss, bossActive: !!w.bossActive,
    bossHp: w.boss ? w.boss.hp : null, bossHpMax: w.boss ? (w.boss.def.hp) : null,
    bossDead: w.boss ? w.boss.dead : null, deathCount: B.deaths.length,
    minBossHp: B.minBossHp, stuckFrames: B.stuckFrames,
    weapon: w.player.weaponKey, elapsed: w.frame - B.startFrame, stopped,
  };
};

async function bootStage1(page, url, mode) {
  // headless idle scenario, 0 frames → World sits at stage 1 'playing', drivable.
  await page.goto(`${url}/index.html?headless=1&scenario=idle&frames=0&seed=${SEED}&mode=${mode}`, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__game && window.__game.status === "playing"');
}

// Run the chunk loop until `stopAtBoss` pauses at the boss, or the stage ends, or a
// watchdog trips. `init=true` resets __bal (phase 1); `init=false` resumes it (phase 2).
async function runChunks(page, invincible, stopAtBoss, init) {
  if (init) await page.evaluate(() => {
    window.__bal = { deaths: [], reachedBoss: false, minBossHp: null, startFrame: window.__game.frame, maxX: window.__game.player.x, stuckFrames: 0, pausedAtBoss: false };
  });
  let last = null, softlock = null;
  for (;;) {
    last = await page.evaluate(STEP_CHUNK, invincible, CHUNK, stopAtBoss);
    if (last.stopped) break;                       // 'cleared' | 'gameover' | 'at-boss'
    if (last.stuckFrames > 1200) { softlock = 'stuck-no-progress'; break; }  // 20s no forward progress, pre-boss
    if (last.elapsed > STAGE_BUDGET) {
      softlock = last.reachedBoss ? 'boss-not-downed-in-budget' : 'level-not-traversed-in-budget';
      break;
    }
  }
  return { last, softlock };
}

async function stageSnapshot(page) {
  return page.evaluate(() => {
    const w = window.__game, B = window.__bal;
    return {
      stageNum: w.stageNum, name: w.level.name, theme: w.level.theme,
      isFinalStage: !!w.isFinalStage, hasNextStage: !!w.hasNextStage,
      bossName: w.boss ? (w.boss.def.name || w.boss.kind) : null,
      bossHpMax: w.boss ? w.boss.def.hp : null,
      deaths: B.deaths, elapsedFrames: w.frame - B.startFrame,
    };
  });
}

// Headless steps the sim but never draws — so force a real paint from the live
// world before capturing. We pull the SHIPPED render.js in via a dynamic import
// (same module instance main.js uses) and draw the current World onto the canvas.
async function renderNow(page) {
  await page.evaluate(async () => {
    if (!window.__balRender) { const m = await import('./src/render.js'); window.__balRender = m.render; }
    const ctx = document.getElementById('game').getContext('2d');
    window.__balRender(ctx, window.__game, window.__assets);
  });
}

async function shotBoss(page, mode, stageNum) {
  const dir = path.join(FRAMES, mode);
  await mkdir(dir, { recursive: true });
  await renderNow(page);
  const canvas = await page.$('#game');
  const file = path.join(dir, `stage-${stageNum}-boss.png`);
  if (canvas) await canvas.screenshot({ path: file });
  return path.relative(path.join(HERE, '..', '..'), file);
}

async function runCampaign(page, url, mode, invincible) {
  await bootStage1(page, url, mode);
  const stages = [];
  let victory = false, gameoverAtStage = null;
  for (let s = 0; s < 7; s++) {
    // PHASE 1 — drive to the boss (pauses the frame it goes live), so we can
    // screenshot the REAL mid-fight beat from Node before the boss dies.
    let { last, softlock } = await runChunks(page, invincible, true, true);
    const stageNum = await page.evaluate(() => window.__game.stageNum);
    let frame = null;
    if (last.reachedBoss && last.stopped === 'at-boss') {
      try { frame = await shotBoss(page, mode + (invincible ? '-inv' : ''), stageNum); } catch { /* non-fatal */ }
    }
    // PHASE 2 — resume the SAME run (shared __bal) to finish the stage.
    if (last.stopped === 'at-boss') {
      const cont = await runChunks(page, invincible, false, false);
      last = cont.last; softlock = softlock || cont.softlock;
    }
    const snap = await stageSnapshot(page);
    const r = { ...snap, ...last, softlock };
    const deathsByCause = { pit: 0, contact: 0, projectile: 0 };
    for (const d of r.deaths) deathsByCause[d.cause] = (deathsByCause[d.cause] || 0) + 1;
    const cleared = r.status === 'cleared';
    stages.push({
      stage: r.stageNum, name: r.name, theme: r.theme, bossName: r.bossName, bossHpMax: r.bossHpMax,
      reachable: true, reachedBoss: r.reachedBoss, bossBeaten: cleared && !!r.bossDead,
      status: r.status, timeToClearSec: cleared ? +(r.elapsedFrames / HZ).toFixed(1) : null,
      elapsedSec: +(r.elapsedFrames / HZ).toFixed(1),
      deaths: r.deaths.length, deathsByCause, deathLog: r.deaths,
      livesRemaining: r.lives, minBossHpReached: r.minBossHp, softlock: r.softlock,
      isFinalStage: r.isFinalStage, frame,
    });
    if (!cleared) { if (r.status === 'gameover') gameoverAtStage = r.stageNum; break; }
    if (r.isFinalStage) { victory = true; break; }
    // NATURAL progression: shipped requestNextStage (== what the N CONTINUE key calls),
    // reached ONLY because the boss was genuinely shot dead above. No ?level=, no force-kill.
    const advanced = await page.evaluate(() => {
      const before = window.__game.stageNum;
      window.__game.requestNextStage();
      return { before, after: window.__game.stageNum, status: window.__game.status };
    });
    if (advanced.after <= advanced.before) { stages[stages.length - 1].softlock = 'advance-failed'; break; }
  }
  const stagesCleared = stages.filter((x) => x.bossBeaten).length;
  return {
    mode, invincible, victory, stagesCleared, gameoverAtStage,
    totalDeaths: stages.reduce((a, x) => a + x.deaths, 0), stages,
  };
}

async function main() {
  const srv = await serveGame();
  const pptr = loadPuppeteer();
  const browser = await pptr.launch({ executablePath: findChrome(), headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const consoleErrors = [], pageErrors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 480, height: 270, deviceScaleFactor: 2 });
    page.on('pageerror', (e) => pageErrors.push(String(e.message)));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    // GROUND TRUTH (invincible): reach + defeatability + time-to-clear, all 7.
    const groundTruth = await runCampaign(page, srv.url, 'arcade', true);
    // DAMAGE ON: the real end-user pressure, both difficulty modes.
    const arcade = await runCampaign(page, srv.url, 'arcade', false);
    const casual = await runCampaign(page, srv.url, 'casual', false);

    const out = {
      ts: new Date().toISOString(),
      target: srv.url, seed: SEED, stageBudgetFrames: STAGE_BUDGET,
      botPolicy: 'baseline run+gun+gaphop+bossaim + one bullet-hop reflex (documented; NOT skilled-human)',
      groundTruthInvincible: groundTruth,
      damageOn: { arcade, casual },
      // headline FACTS
      reachAll7: groundTruth.stages.length === 7 && groundTruth.stages.every((s) => s.reachedBoss),
      defeatableAll7Invincible: groundTruth.victory,
      arcadeVictory: arcade.victory, casualVictory: casual.victory,
      softlocks: [...groundTruth.stages, ...arcade.stages, ...casual.stages].filter((s) => s.softlock).map((s) => ({ stage: s.stage, mode: s.name, softlock: s.softlock })),
      consoleErrors: [...new Set(consoleErrors)], pageErrors,
    };
    await mkdir(HERE, { recursive: true });
    await writeFile(path.join(HERE, 'campaign-playthrough.json'), JSON.stringify(out, null, 2));

    // console summary
    const line = (r) => `${r.mode}${r.invincible ? '(inv)' : ''}: victory=${r.victory} cleared=${r.stagesCleared}/7 deaths=${r.totalDeaths}${r.gameoverAtStage ? ` GAMEOVER@stage${r.gameoverAtStage}` : ''}`;
    console.log('=== CAMPAIGN PLAYTHROUGH (damage-on grounding) ===');
    console.log(line(groundTruth));
    console.log(line(arcade));
    console.log(line(casual));
    console.log('reachAll7(inv):', out.reachAll7, '| defeatableAll7(inv):', out.defeatableAll7Invincible);
    console.log('softlocks:', out.softlocks.length ? JSON.stringify(out.softlocks) : 'none');
    for (const r of [groundTruth, arcade, casual]) {
      console.log(`--- ${r.mode}${r.invincible ? '(inv)' : ''} per-stage ---`);
      for (const s of r.stages) console.log(`  S${s.stage} ${s.name}: reachedBoss=${s.reachedBoss} beaten=${s.bossBeaten} t=${s.timeToClearSec ?? '—'}s deaths=${s.deaths}${Object.entries(s.deathsByCause).filter(([, n]) => n).map(([c, n]) => ` ${c}:${n}`).join('')} lives=${s.livesRemaining}${s.softlock ? ` SOFTLOCK:${s.softlock}` : ''}`);
    }
  } finally {
    await browser.close();
    await srv.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
