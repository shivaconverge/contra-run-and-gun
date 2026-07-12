#!/usr/bin/env node
// campaign-pacing.mjs — the driven half of the perf mandate: run the LIVE build
// through ALL 7 biomes + their boss fights under the REAL rAF render loop and
// grade frame pacing per stage, plus JS-heap growth across the whole campaign.
//
//   node playtest/perf/campaign-pacing.mjs [--profile desktop|mobile] [--url <live>]
//
// Unlike the game's own headless sim harness (world.step, CPU-only, no draw),
// this drives runLive's actual requestAnimationFrame loop so every measured
// frame includes real canvas draw cost for that biome's tileset/bg/decor/boss.
//
// How it drives (no source edits — all via exposed hooks on window.__game):
//   - import()s the served data/config.js to get the real STAGES array
//   - world.loadStage(STAGES[i]) to enter each biome under the live loop
//   - holds Right+Fire (injected keys) to scroll+fight → representative FIELD load
//   - teleports the player to the boss arena (camera activates the boss) → BOSS load
//   - tops up lives during sampling so a death doesn't truncate the render sample
//     (this harness grades DRAW PACING, not survival — balance is graded elsewhere)
// rAF deltas come from a page-side recorder, tagged per frame with stage + boss +
// live entity counts, so pacing is sliced by biome and by field-vs-boss directly.
//
// Output: playtest/perf/results/campaign-pacing-<profile>.json + console table.
// Exits non-zero if any stage misses the pacing budget (recorded, not masked).

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, findChrome, liveUrl, sleep, PROFILES, BUDGET, STAGE_BIOME } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, 'results');
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PROFILE = arg('profile', 'desktop');
const URL = arg('url', null) || liveUrl();
const prof = PROFILES[PROFILE];
if (!prof) { console.error(`unknown profile ${PROFILE}`); process.exit(2); }

const FIELD_MS = 3500;   // per-stage field-combat sample window
const BOSS_MS = 3500;    // per-stage boss-arena sample window

// rAF recorder, tagged per frame from the live world. Installed before any game code.
const RECORDER = `
(() => {
  window.__pace = { samples: [], on: false };
  let last = null;
  const raf = window.requestAnimationFrame.bind(window);
  function tick(t) {
    const g = window.__game;
    if (window.__pace.on && last !== null && g) {
      window.__pace.samples.push({
        dt: t - last,
        stage: g.stageNum || 0,
        boss: !!g.bossActive,
        ne: g.enemies ? g.enemies.length : 0,
        nb: g.bullets ? g.bullets.length : 0,
        np: g.particles ? g.particles.length : 0,
        nfx: g.fx ? g.fx.length : 0,
      });
    }
    last = t;
    raf(tick);
  }
  raf(tick);
})();
`;

function stats(deltas) {
  const d = deltas.filter((x) => x > 0 && x < 1000).sort((a, b) => a - b);
  if (!d.length) return null;
  const median = d[Math.floor(d.length / 2)];
  const p95 = d[Math.floor(d.length * 0.95)];
  const budget = 1000 / 60;
  const dropped = d.filter((x) => x > budget * 1.5).length;
  return {
    frames: d.length,
    medianFps: +(1000 / median).toFixed(1),
    p95Ms: +p95.toFixed(2),
    worstMs: +d[d.length - 1].toFixed(2),
    dropped,
    droppedFrac: +(dropped / d.length).toFixed(4),
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const puppeteer = loadPuppeteer();
  const chrome = findChrome();
  console.log(`\nPERF campaign-pacing — profile=${PROFILE}  url=${URL}\n`);

  const browser = await puppeteer.launch({
    executablePath: chrome, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--mute-audio', '--disable-dev-shm-usage'],
    defaultViewport: prof.viewport,
  });
  const page = await browser.newPage();
  const client = await page.target().createCDPSession();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await client.send('HeapProfiler.enable').catch(() => {});
  if (prof.cpu > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });

  await page.evaluateOnNewDocument(RECORDER);
  // Casual mode → shield instead of one-hit, so the render sample isn't dominated
  // by respawn frames. Lives are also topped up live during sampling.
  await page.goto(URL + '?mode=casual', { waitUntil: 'domcontentloaded', timeout: 120000 });

  // Wait for the live loop to be running (assets decoded, rAF ticking).
  const deadline = Date.now() + 30000;
  let ready = false;
  while (Date.now() < deadline) {
    if (await page.evaluate(() => !!(window.__game && window.__game.__fps > 0))) { ready = true; break; }
    await sleep(100);
  }
  if (!ready) { console.error('game never became interactive'); await browser.close(); process.exit(3); }

  // Pull the real STAGES array from the served config module (no source edits).
  const stageCount = await page.evaluate(async () => {
    const mod = await import('./data/config.js');
    window.__STAGES = mod.STAGES;
    return mod.STAGES.length;
  });

  const heapAt = async () => {
    await client.send('HeapProfiler.collectGarbage').catch(() => {});
    return page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : null));
  };

  const perStage = [];
  const heapSeries = [];
  heapSeries.push({ point: 'boot', bytes: await heapAt() });

  for (let i = 0; i < stageCount; i++) {
    const meta = STAGE_BIOME[i] || { stage: i + 1, name: `Stage ${i + 1}` };
    // Enter the biome under the live loop; carry generous lives.
    await page.evaluate((idx) => {
      const w = window.__game;
      w.loadStage(window.__STAGES[idx], { score: w.score, lives: 9 });
      w.status = 'playing';
      w.lives = 9;
    }, i);
    await sleep(250); // let the biome's first frames render/settle

    // ---- FIELD sample: hold Right+Fire, scroll & fight ----
    await page.evaluate(() => { window.__pace.samples.length = 0; window.__pace.on = true; });
    await page.keyboard.down('ArrowRight');
    await page.keyboard.down('x');
    const fieldEnd = Date.now() + FIELD_MS;
    while (Date.now() < fieldEnd) {
      await sleep(250);
      await page.evaluate(() => { const w = window.__game; if (w) { w.lives = 9; if (w.player && w.player.dead) w.status = 'playing'; } });
    }
    await page.keyboard.up('ArrowRight');
    const fieldSamples = await page.evaluate(() => { window.__pace.on = false; return window.__pace.samples.slice(); });

    // ---- BOSS sample: teleport to the boss arena so the camera activates it ----
    const bossInfo = await page.evaluate(() => {
      const w = window.__game;
      const boss = w.enemies.find((e) => e.def && e.def.isBoss) || w.boss || null;
      if (!boss) return { hasBoss: false };
      w.player.x = Math.max(0, boss.x - 150); // camera follows player → boss enters view → activates
      w.player.dead = false; w.lives = 9;
      return { hasBoss: true, bossX: boss.x };
    });
    let bossSamples = [];
    let bossReached = false;
    if (bossInfo.hasBoss) {
      // wait for bossActive, then sample
      const bd = Date.now() + 4000;
      while (Date.now() < bd) {
        if (await page.evaluate(() => !!(window.__game && window.__game.bossActive))) { bossReached = true; break; }
        await sleep(100);
      }
      await page.evaluate(() => { window.__pace.samples.length = 0; window.__pace.on = true; });
      const bossEnd = Date.now() + BOSS_MS;
      while (Date.now() < bossEnd) {
        await sleep(250);
        await page.evaluate(() => { const w = window.__game; if (w) { w.lives = 9; if (w.player) w.player.dead = false; } });
      }
      bossSamples = await page.evaluate(() => { window.__pace.on = false; return window.__pace.samples.slice(); });
    }
    await page.keyboard.up('x');

    const fieldStat = stats(fieldSamples.map((s) => s.dt));
    const bossStat = stats(bossSamples.map((s) => s.dt));
    const peak = (arr, k) => arr.reduce((m, s) => Math.max(m, s[k]), 0);
    perStage.push({
      stage: meta.stage, biome: meta.name,
      field: fieldStat,
      boss: bossStat,
      bossReached,
      peakEntities: {
        field: { enemies: peak(fieldSamples, 'ne'), bullets: peak(fieldSamples, 'nb'), particles: peak(fieldSamples, 'np'), fx: peak(fieldSamples, 'nfx') },
        boss: { enemies: peak(bossSamples, 'ne'), bullets: peak(bossSamples, 'nb'), particles: peak(bossSamples, 'np'), fx: peak(bossSamples, 'nfx') },
      },
    });
    heapSeries.push({ point: `after-stage-${meta.stage}`, bytes: await heapAt() });
    console.log(`  stage ${meta.stage} ${meta.biome.padEnd(16)} field ${fieldStat ? fieldStat.medianFps : '—'}fps (drop ${fieldStat ? (fieldStat.droppedFrac * 100).toFixed(1) : '—'}%)  boss ${bossReached && bossStat ? bossStat.medianFps + 'fps (drop ' + (bossStat.droppedFrac * 100).toFixed(1) + '%)' : bossReached ? 'no samples' : 'NOT REACHED'}`);
  }

  await browser.close();

  // ---- Grade ----------------------------------------------------------------
  const checks = [];
  const check = (id, ok, detail) => checks.push({ id, pass: !!ok, detail });
  for (const s of perStage) {
    for (const phase of ['field', 'boss']) {
      const st = s[phase];
      if (!st) { if (phase === 'boss' && !s.bossReached) check(`s${s.stage}.boss.reached`, false, `boss arena not reached in sample`); continue; }
      check(`s${s.stage}.${phase}.median-fps`, st.medianFps >= BUDGET.minMedianFps,
        `${s.biome} ${phase}: median ${st.medianFps}fps (p95 ${st.p95Ms}ms, worst ${st.worstMs}ms) vs bar ${BUDGET.minMedianFps}`);
      check(`s${s.stage}.${phase}.dropped`, st.droppedFrac <= BUDGET.maxDroppedFrac,
        `${s.biome} ${phase}: dropped ${st.dropped}/${st.frames} (${(st.droppedFrac * 100).toFixed(1)}%) vs ≤${BUDGET.maxDroppedFrac * 100}%`);
    }
  }
  const heapBoot = heapSeries[0].bytes;
  const heapEnd = heapSeries[heapSeries.length - 1].bytes;
  const heapGrowthMB = (heapBoot != null && heapEnd != null) ? +((heapEnd - heapBoot) / (1024 * 1024)).toFixed(2) : null;
  if (heapGrowthMB != null) check('campaign.heap-growth', heapGrowthMB <= BUDGET.maxHeapGrowthMB * 2,
    `JS heap grew ${heapGrowthMB}MB across all ${stageCount} stages (post-GC) vs ≤${BUDGET.maxHeapGrowthMB * 2}MB`);
  check('campaign.no-page-errors', pageErrors.length === 0, pageErrors.length ? pageErrors.slice(0, 4).join(' | ') : 'no page errors');

  const fails = checks.filter((c) => !c.pass);
  const report = {
    generatedAt: new Date().toISOString(), profile: PROFILE, url: URL, chrome,
    cpuThrottle: prof.cpu, stageCount, fieldMs: FIELD_MS, bossMs: BOSS_MS,
    perStage, heapSeries, heapGrowthMB, pageErrors, checks,
    verdict: fails.length ? 'FAIL' : 'PASS',
  };
  await writeFile(path.join(OUT, `campaign-pacing-${PROFILE}.json`), JSON.stringify(report, null, 2));

  console.log('─'.repeat(70));
  for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.id}  —  ${c.detail}`);
  console.log('─'.repeat(70));
  console.log(`heap across campaign: ${heapGrowthMB}MB   VERDICT: ${report.verdict}`);
  console.log(`report: ${path.join(OUT, `campaign-pacing-${PROFILE}.json`)}\n`);
  process.exit(fails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(3); });
