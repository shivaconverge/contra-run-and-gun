// campaign-gate.mjs — AUTOMATED, GATED full 1→7→victory playthrough assertion.
//
// Closes strategy task_wire_test_fullrun ("automated + gated full 1→7→victory
// playthrough; assert no soft-locks, weapon-persistence intact"). It runs the REAL
// damage-ON campaign harness (campaign-playthrough.mjs — real headless Chrome, real
// World, natural boss-clear progression) and asserts INTENDED behavior over the FACTS
// it emits, with a pass/fail exit code so root.C can re-run it after balance tuning
// and watch KNOWN-BUG reds flip green.
//
// TWO SEVERITY TIERS (mirrors playtest/e2e/run-all.mjs's contract):
//   • CRITICAL  — the campaign SPINE + invariants that must NEVER break. Any red here
//                 exits non-zero (a real regression: a stage went unreachable, a boss
//                 became undefeatable, a soft-lock/unwinnable state appeared, the
//                 weapon-on-death rule broke (ARCADE must revert to rifle; CASUAL
//                 retains per BAL-4 — mode-gated), or progression stopped being a
//                 genuine boss-clear).
//   • KNOWN-BUG — the balance defects this seat FOUND and filed (BAL-1 arcade GAME-OVER
//                 at boss 1; BAL-2 casual GAME-OVER at boss 2). Asserted as the INTENDED
//                 behavior ("the campaign is completable in this mode") so they read as
//                 tracked reds; NON-blocking per the report's framing that these are
//                 config.js tuning signals for root.C, not spine breakage. When root.C
//                 tunes and a mode completes, drop its `knownBug` flag here and it
//                 becomes a CRITICAL guard against regressing back.
//
// This is a GATE, not a workaround: it never masks a defect. The KNOWN-BUGs stay RED
// and printed loudly; they simply don't fail CI while they're the documented state.
//
// Run (from repo root):  node playtest/balance/campaign-gate.mjs [--reuse]
//   --reuse : assert over an existing campaign-playthrough.json instead of re-driving
//             the browser (fast re-check; default is a fresh real run).
// Emits: playtest/balance/campaign-gate.json  + a one-line VERDICT + exit code.

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const HARNESS = path.join(HERE, 'campaign-playthrough.mjs');
const DATA = path.join(HERE, 'campaign-playthrough.json');
const OUT = path.join(HERE, 'campaign-gate.json');
const reuse = process.argv.includes('--reuse');

function runHarness() {
  return new Promise((resolve, reject) => {
    const p = spawn('node', [HARNESS], { cwd: REPO, stdio: 'inherit' });
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`harness exited ${code}`))));
    p.on('error', reject);
  });
}

// Every death across every pass — used by the weapon-revert + cause invariants.
function allDeaths(d) {
  const passes = [d.groundTruthInvincible, d.damageOn.arcade, d.damageOn.casual];
  return passes.flatMap((r) => r.stages.flatMap((s) => (s.deathLog || []).map((x) => ({ mode: r.mode + (r.invincible ? '(inv)' : ''), stage: s.stage, ...x }))));
}

async function main() {
  if (!reuse) await runHarness();
  if (!existsSync(DATA)) throw new Error(`no ${DATA} — run without --reuse`);
  const d = JSON.parse(await readFile(DATA, 'utf8'));

  const gt = d.groundTruthInvincible, ar = d.damageOn.arcade, ca = d.damageOn.casual;
  const deaths = allDeaths(d);
  // Weapon-on-death is MODE-GATED (BAL-4, world.js _onPlayerDeath/_doRespawn): ARCADE
  // — and the invincible ground truth, which runs in arcade — revert to the rifle (the
  // 1987 single-slot invariant the hard mode must keep); CASUAL RETAINS the weapon so a
  // death doesn't cripple the retry (the parent-endorsed accessibility path). So a
  // violation is an ARCADE-family death that KEPT a non-rifle weapon; a casual death
  // keeping its weapon is the INTENDED new behavior, not a revert failure.
  const revertDeaths = deaths.filter((x) => x.weaponAfterDeath !== undefined && !x.mode.startsWith('casual'));
  const badRevert = revertDeaths.filter((x) => x.weaponAfterDeath !== 'rifle');
  // Casual deaths that retained a non-rifle weapon — the observable footprint of the
  // BAL-4 fix in the run (0 is not a failure; the baseline bot often dies still on rifle).
  const casualRetained = deaths.filter((x) => x.mode.startsWith('casual') && x.weaponAfterDeath !== undefined && x.weaponAfterDeath !== 'rifle');
  // "advanced only by natural boss-clear": every stage that counts as beaten must have
  // ended 'cleared' with the boss actually dead (the harness never uses ?level=/force-kill).
  const beatenStages = [gt, ar, ca].flatMap((r) => r.stages.filter((s) => s.bossBeaten));
  const fakeClears = beatenStages.filter((s) => s.status !== 'cleared');

  const checks = [
    // ---- CRITICAL: spine + invariants -------------------------------------
    { id: 'spine.reachAll7', crit: true, pass: gt.stages.length === 7 && gt.stages.every((s) => s.reachedBoss),
      detail: `invincible ground truth reached boss on ${gt.stages.filter((s) => s.reachedBoss).length}/7 stages` },
    { id: 'spine.defeatableAll7', crit: true, pass: gt.victory === true,
      detail: `invincible full-campaign victory=${gt.victory} (all 7 bosses shot down + VICTORY)` },
    { id: 'spine.noSoftlocks', crit: true, pass: (d.softlocks || []).length === 0,
      detail: (d.softlocks || []).length ? `SOFT-LOCKS: ${JSON.stringify(d.softlocks)}` : 'no soft-lock / unwinnable state in any pass' },
    { id: 'spine.naturalProgressionOnly', crit: true, pass: fakeClears.length === 0,
      detail: fakeClears.length ? `beaten-but-not-cleared: ${JSON.stringify(fakeClears.map((s) => s.stage))}` : 'every beaten stage ended status=cleared via genuine boss-kill (no ?level=/force-kill/N-skip)' },
    { id: 'invariant.weaponRevertsOnDeath', crit: true, pass: badRevert.length === 0,
      detail: badRevert.length
        ? `${badRevert.length} ARCADE-family deaths did NOT revert to rifle: ${JSON.stringify(badRevert.slice(0, 3))}`
        : `all ${revertDeaths.length} arcade-family deaths reverted to rifle (single-slot invariant holds); casual RETAINED weapon on ${casualRetained.length} death(s) per BAL-4 (mode-gated: accessibility keeps the weapon, arcade stays hard)` },
    { id: 'accessibility.casualClearsStage1', crit: true, pass: !!(ca.stages[0] && ca.stages[0].bossBeaten),
      detail: `casual (5 lives + shield) cleared Stage 1 = ${!!(ca.stages[0] && ca.stages[0].bossBeaten)} (accessibility floor: an ordinary player must pass boss 1 in the assist mode)` },
    // The INTENDED invariant is NOT "zero pit/contact deaths" — pit hazards are a
    // DELIBERATE design element (level1.js CR-1: the water gap + pre-boss chasm are
    // real fall-hazards). The real property is that the LEVELS are not the primary
    // killer — the boss fights are. So we assert traversal deaths do not DOMINATE
    // projectile deaths, and separately track/report the exact pit/contact incidents
    // (see BAL-5 in BALANCE-REPORT.md for the boss-arena footing interaction).
    { id: 'balance.bossesAreThePrimaryKiller', crit: true,
      pass: (deaths.filter((x) => x.cause === 'projectile').length) >= (deaths.filter((x) => x.cause !== 'projectile').length),
      detail: `deaths by cause — projectile:${deaths.filter((x) => x.cause === 'projectile').length} pit:${deaths.filter((x) => x.cause === 'pit').length} contact:${deaths.filter((x) => x.cause === 'contact').length} (boss fire must be ≥ traversal deaths; if pits/contact dominate, the LEVELS became the difficulty — a real regression)` },

    // ---- KNOWN-BUG: the balance defects this seat filed (non-blocking) ------
    { id: 'balance.arcadeCompletesCampaign', crit: false, knownBug: 'BAL-1', pass: ar.victory === true,
      detail: `arcade victory=${ar.victory} — cleared ${ar.stagesCleared}/7${ar.gameoverAtStage ? `, GAME OVER at stage ${ar.gameoverAtStage}` : ''} (INTENDED: an ordinary run completes arcade; currently a baseline bot walls at boss ${ar.gameoverAtStage})` },
    { id: 'balance.casualCompletesCampaign', crit: false, knownBug: 'BAL-2', pass: ca.victory === true,
      detail: `casual victory=${ca.victory} — cleared ${ca.stagesCleared}/7${ca.gameoverAtStage ? `, GAME OVER at stage ${ca.gameoverAtStage}` : ''} (INTENDED: the assist mode completes the campaign; currently walls at the stage-${ca.gameoverAtStage} chopper)` },
  ];

  const critFails = checks.filter((c) => c.crit && !c.pass);
  const knownRed = checks.filter((c) => !c.crit && !c.pass);
  const critPass = checks.filter((c) => c.crit && c.pass).length;
  const verdict = critFails.length === 0 ? 'PASS' : 'FAIL';

  const out = {
    ts: new Date().toISOString(), harnessTs: d.ts, seed: d.seed,
    verdict, criticalPassed: critPass, criticalTotal: checks.filter((c) => c.crit).length,
    criticalFailures: critFails.map((c) => c.id),
    knownBugsRed: knownRed.map((c) => ({ id: c.id, bug: c.knownBug, detail: c.detail })),
    checks,
  };
  await writeFile(OUT, JSON.stringify(out, null, 2));

  console.log('\n=== CAMPAIGN GATE (damage-on, natural progression) ===');
  for (const c of checks) {
    const tag = c.pass ? 'PASS' : (c.crit ? 'FAIL' : `KNOWN-BUG(${c.knownBug})`);
    console.log(`  [${c.pass ? '✓' : '✗'}] ${c.id.padEnd(38)} ${tag}`);
    if (!c.pass) console.log(`        ${c.detail}`);
  }
  console.log(`\nCRITICAL: ${critPass}/${out.criticalTotal} passed | KNOWN-BUG reds: ${knownRed.length} (${knownRed.map((c) => c.knownBug).join(', ') || 'none'})`);
  console.log(`VERDICT: ${verdict}  (exit ${verdict === 'PASS' ? 0 : 1})`);
  if (knownRed.length) console.log('NOTE: KNOWN-BUG reds are tracked balance findings for root.C (see BALANCE-REPORT.md OPEN ISSUES); they do NOT fail the gate while documented.');
  process.exit(verdict === 'PASS' ? 0 : 1);
}

main().catch((e) => { console.error('GATE ERROR:', e.message); process.exit(2); });
