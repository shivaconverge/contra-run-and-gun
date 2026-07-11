#!/usr/bin/env node
// feedback/defect-behavior-test.mjs — BEHAVIORAL grounding of the creator-rejected
// defects that are actually measurable at runtime. The re-approval tracker infers
// "in-build" from commit subjects + code COMMENT signatures (brittle if reworded).
// This drives the REAL build and OBSERVES behavior instead — the creator's own
// directive ("verify by behavior, the human eye caught what claims missed").
//
//   node feedback/defect-behavior-test.mjs
//
// Scope: the 2 cleanly-measurable engine defects. #1 (theme legibility) and #3
// (turret barrel GEOMETRY) are visual-judgment / geometry — left to the tracker's
// commit+code signature and, ultimately, the creator's re-review. This test is
// GROUNDING evidence, NOT a creator close; only a creator APPROVE reopens the gate.
// It FAILS LOUDLY if a claimed-fixed defect is behaviorally ABSENT (report, not mask).
// Evidence -> feedback/frames/defect-behavior.json.

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveGame, findChrome } from '../playtest/e2e/harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire('/Users/avinashsaxena/matrix-dfs-statemachine-pre-clock/loop_hierarchy/runs/contra-live3/repo/playtest/e2e/');
const puppeteer = require('puppeteer-core');

const results = [];
const check = (id, ok, detail) => { results.push({ id, ok: !!ok, detail }); console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  —  ${detail}`); };

async function main() {
  const srv = await serveGame();
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--mute-audio'] });
  try {
    // --- #4 boss movement: boss.y must vary across the deterministic sim ---
    const bossYAt = async (frames) => {
      const p = await browser.newPage();
      await p.goto(`${srv.url}/?headless=1&scenario=boss&frames=${frames}`, { waitUntil: 'networkidle2', timeout: 30000 });
      await p.waitForFunction(() => !!document.getElementById('headless-done'), { timeout: 20000 });
      const y = await p.evaluate(() => (window.__game && window.__game.boss ? Math.round(window.__game.boss.y * 100) / 100 : null));
      await p.close(); return y;
    };
    const ys = [];
    for (const f of [40, 80, 120, 160, 200]) ys.push(await bossYAt(f));
    const vals = ys.filter((v) => v != null);
    const range = vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
    check('defect4.bossMoves', range > 2, `boss.y over 40..200f = [${ys.join(', ')}], range ${range.toFixed(2)}px (>2 ⇒ MOVES; creator said "boss has no movement")`);

    // --- #2 hero firing origin: bullets must spawn at the hands/upper body, not waist ---
    const p2 = await browser.newPage();
    await p2.goto(`${srv.url}/?headless=1&frames=20`, { waitUntil: 'networkidle2', timeout: 30000 });
    await p2.waitForFunction(() => !!document.getElementById('headless-done'), { timeout: 20000 });
    const fo = await p2.evaluate(() => {
      const w = window.__game, pl = w.player;
      const near = w.bullets.filter((b) => Math.abs(b.x - (pl.x + pl.w)) < 60).sort((a, b) => Math.abs(a.x - pl.x) - Math.abs(b.x - pl.x))[0] || w.bullets[0];
      return near ? { frac: +(((near.y - pl.y) / pl.h).toFixed(2)), n: w.bullets.length } : { none: true, n: 0 };
    });
    await p2.close();
    // hands/shoulder ≈ upper 55% of body; waist ≈ 0.6+. Fail if no bullets (can't verify).
    check('defect2.firingFromHands', fo.frac != null && fo.frac < 0.55,
      fo.frac != null ? `bullet spawns ${(fo.frac * 100).toFixed(0)}% down body (<55% ⇒ hands/upper, not waist)` : `no bullets observed (n=${fo.n})`);

    // --- #1 MULTI-HEIGHT (structural FACT only): the level has a bridge deck AND a
    // catwalk ≥40px above it over the water region — the creator's "move at multiple
    // heights". NOTE: theme LEGIBILITY (does it look like bridge/water?) is a VISUAL
    // JUDGMENT reserved for the creator's re-review — NOT asserted here. ---
    const p1 = await browser.newPage();
    await p1.goto(`${srv.url}/?headless=1&frames=2`, { waitUntil: 'networkidle2', timeout: 30000 });
    await p1.waitForFunction(() => !!document.getElementById('headless-done'), { timeout: 20000 });
    const mh = await p1.evaluate(() => {
      const s = (window.__game.solids || []).filter((o) => o.x < 1950 && o.x + o.w > 1650);
      if (!s.length) return { none: true };
      const groundY = Math.max(...s.map((o) => o.y)), highY = Math.min(...s.map((o) => o.y));
      return { bridge: s.filter((o) => o.bridge).length, catwalk: s.filter((o) => o.y <= groundY - 40).length, spread: groundY - highY };
    });
    await p1.close();
    check('defect1.multiHeightPresent', !mh.none && mh.bridge > 0 && mh.catwalk > 0 && mh.spread >= 40,
      mh.none ? 'no solids over the bridge region' : `bridge=${mh.bridge} catwalk=${mh.catwalk} heightSpread=${mh.spread}px (⇒ multi-height traversal; THEME legibility is the creator's call)`);
  } finally {
    await browser.close();
    await srv.close();
  }
  const failed = results.filter((r) => !r.ok).length;
  await mkdir(path.join(HERE, 'frames'), { recursive: true });
  await writeFile(path.join(HERE, 'frames', 'defect-behavior.json'), JSON.stringify({
    when: new Date().toISOString(),
    scope: 'behavioral grounding of measurable creator defects #2 (firing origin) + #4 (boss movement); #1/#3 are judgment/geometry, tracker+creator own those',
    note: 'grounding evidence, NOT a creator close — only a creator APPROVE reopens the gate',
    passed: results.length - failed, failed, verdict: failed === 0 ? 'PASS' : `FAIL (${failed})`, results,
  }, null, 2));
  console.log(`\n=== DEFECT-BEHAVIOR: ${results.length - failed}/${results.length} behaviorally confirmed ===`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error('DEFECT-BEHAVIOR ERROR:', e); process.exit(2); });
