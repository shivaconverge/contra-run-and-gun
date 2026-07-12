#!/usr/bin/env node
// cold-load.mjs — drive the LIVE PUBLIC deployment with a COLD browser cache and
// measure what a first-time player's device actually pays: the full cold-load
// network waterfall, the total first-paint payload broken down by asset kind and
// by the campaign stage that first needs it, the time-to-first-playable-frame,
// live rAF-delta frame pacing + dropped frames, and JS-heap growth.
//
//   node playtest/perf/cold-load.mjs [--profile desktop|mobile] [--url <live>]
//   node playtest/perf/cold-load.mjs --profile mobile
//
// FACTS only: encodedDataLength is the real bytes-over-wire per response
// (CDP Network.loadingFinished); rAF deltas come from a page-side recorder
// installed BEFORE any game code runs. Nothing here is self-reported by the game.
//
// Output (this loop OWNS playtest/perf/ only):
//   playtest/perf/results/cold-load-<profile>.json   machine-readable facts+verdict
//   console: per-check PASS/WARN/FAIL; exit 1 if any hard budget check FAILs.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadPuppeteer, findChrome, liveUrl, sleep,
  classifyAsset, PROFILES, BUDGET, fmtBytes, STAGE_BIOME,
} from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, 'results');

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const PROFILE = arg('profile', 'desktop');
const URL = arg('url', null) || liveUrl();
const prof = PROFILES[PROFILE];
if (!prof) { console.error(`unknown profile ${PROFILE}`); process.exit(2); }

// rAF-delta recorder + heap sampler, installed before any page script. Captures
// the real inter-frame delta of the live rAF loop (independent of the game's own
// fps meter) plus periodic heap snapshots. Also stamps the first frame time.
const RECORDER = `
(() => {
  window.__perfRec = { deltas: [], firstFrameT: null, navStart: performance.now(), heap: [] };
  let last = null;
  const raf = window.requestAnimationFrame.bind(window);
  function tick(t) {
    if (window.__perfRec.firstFrameT === null) window.__perfRec.firstFrameT = performance.now();
    if (last !== null) window.__perfRec.deltas.push(t - last);
    last = t;
    raf(tick);
  }
  raf(tick);
  setInterval(() => {
    if (performance.memory) window.__perfRec.heap.push({ t: performance.now(), used: performance.memory.usedJSHeapSize });
  }, 500);
})();
`;

async function main() {
  await mkdir(OUT, { recursive: true });
  const puppeteer = loadPuppeteer();
  const chrome = findChrome();
  console.log(`\nPERF cold-load — profile=${PROFILE}  url=${URL}`);
  console.log(`chrome: ${chrome}\n`);

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--mute-audio', '--disable-dev-shm-usage'],
    defaultViewport: prof.viewport,
  });

  const page = await browser.newPage();
  const client = await page.target().createCDPSession();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('requestfailed', (r) => pageErrors.push(`requestfailed ${r.url()} ${r.failure()?.errorText}`));

  // Record every request's real over-the-wire size + timing via CDP.
  await client.send('Network.enable');
  const reqs = new Map();   // requestId -> { url, start, mime, status, encoded, finished }
  client.on('Network.requestWillBeSent', (e) => {
    reqs.set(e.requestId, { url: e.request.url, start: e.timestamp, mime: '', status: 0, encoded: 0, finished: null });
  });
  client.on('Network.responseReceived', (e) => {
    const r = reqs.get(e.requestId);
    if (r) { r.mime = e.response.mimeType; r.status = e.response.status; r.fromCache = e.response.fromDiskCache || e.response.fromServiceWorker; }
  });
  client.on('Network.loadingFinished', (e) => {
    const r = reqs.get(e.requestId);
    if (r) { r.encoded = e.encodedDataLength; r.finished = e.timestamp; }
  });

  // COLD cache: clear disk cache + cookies before the very first byte.
  await client.send('Network.clearBrowserCache');
  await client.send('Network.clearBrowserCookies');

  // Throttling (mobile profile): 4x CPU + Slow-4G network.
  if (prof.cpu > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
  if (prof.net) await client.send('Network.emulateNetworkConditions', prof.net);

  await page.evaluateOnNewDocument(RECORDER);

  const t0 = Date.now();
  // Navigate with an EARLY resolve (domcontentloaded) so measuring the first
  // playable frame is NOT polluted by the tail of the cold download (the 7 music
  // tracks stream for tens of seconds on throttled links but do NOT gate the
  // rAF loop). We wait for full network-idle separately, below, for payload.
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

  // TRUE time-to-first-playable-frame: the game's rAF loop only starts (and
  // __fps ticks) AFTER assets.load(ASSET_MANIFEST) resolves — i.e. after every
  // eagerly-preloaded biome IMAGE is decoded. That image gate is boot-critical;
  // music is not. We time from navigation start (t0) to fps>0.
  let interactive = false;
  const ttffDeadline = Date.now() + 30000;
  while (Date.now() < ttffDeadline) {
    const st = await page.evaluate(() => {
      const g = window.__game;
      return { hasGame: !!g, fps: g && g.__fps, status: g && g.status };
    });
    if (st.hasGame && st.fps > 0) { interactive = true; break; }
    await sleep(50);
  }
  const ttffMs = Date.now() - t0;

  // FULLY-LOADED: now drain the network so ALL cold assets (incl. every music
  // track) are counted toward the payload — bounded so a throttled run can't hang.
  const idleDeadline = Date.now() + 100000;
  let pending = 1;
  while (Date.now() < idleDeadline && pending > 0) {
    await sleep(500);
    pending = 0;
    for (const r of reqs.values()) if (r.finished === null) pending++;
  }
  const fullyLoadedMs = Date.now() - t0;

  // Let it run a sustained sample at the title to measure steady-state pacing +
  // heap growth (title runs the same rAF loop; boot is what we grade cold).
  await sleep(5000);

  // Pull page-side telemetry.
  const rec = await page.evaluate(() => {
    const r = window.__perfRec;
    const g = window.__game;
    return {
      deltas: r.deltas,
      heap: r.heap,
      gameFps: g && g.__fps,
      gamePerf: g && g.__perf,
      status: g && g.status,
      spritesLoaded: (window.__selftest && window.__selftest.spritesLoaded && window.__selftest.spritesLoaded.length) || null,
      spritesMissing: (window.__selftest && window.__selftest.spritesMissing) || null,
    };
  });

  // Heap via CDP (authoritative; performance.memory may be coarse/absent).
  let heapCdp = null;
  try {
    const m = await client.send('Performance.getMetrics').catch(() => null);
  } catch { /* ignore */ }
  try {
    await client.send('HeapProfiler.enable');
    await client.send('HeapProfiler.collectGarbage');
    const before = rec.heap.length ? rec.heap[0].used : null;
    const after = rec.heap.length ? rec.heap[rec.heap.length - 1].used : null;
    heapCdp = { before, after };
  } catch { /* ignore */ }

  await browser.close();

  // ---- Aggregate the network waterfall into the payload breakdown ----------
  const assets = [];
  for (const r of reqs.values()) {
    if (!r.finished) continue; // still pending / failed
    const cls = classifyAsset(r.url);
    assets.push({
      url: r.url,
      file: r.url.split('?')[0].split('/').pop(),
      bytes: r.encoded,
      mime: r.mime,
      status: r.status,
      ...cls,
    });
  }
  assets.sort((a, b) => b.bytes - a.bytes);

  const totalBytes = assets.reduce((s, a) => s + a.bytes, 0);
  const byKind = {};
  for (const a of assets) byKind[a.kind] = (byKind[a.kind] || 0) + a.bytes;

  // Deferrable = belongs to a stage-2..7 biome; could be lazy-loaded on entry.
  const deferrable = assets.filter((a) => a.deferrable);
  const deferrableBytes = deferrable.reduce((s, a) => s + a.bytes, 0);
  const stage1Bytes = totalBytes - deferrableBytes;

  // Per-stage byte attribution (earliest stage that needs each asset).
  const perStage = {};
  for (const a of assets) {
    const k = a.stageNeeded || 1;
    perStage[k] = (perStage[k] || 0) + a.bytes;
  }

  // ---- Frame pacing facts (rAF deltas) -------------------------------------
  const deltas = rec.deltas.slice().filter((d) => d > 0 && d < 1000);
  const sorted = deltas.slice().sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : null;
  const medianFps = median ? +(1000 / median).toFixed(1) : null;
  const frameBudget = 1000 / 60;
  const dropped = deltas.filter((d) => d > frameBudget * 1.5).length;
  const droppedFrac = deltas.length ? +(dropped / deltas.length).toFixed(4) : null;

  const heapGrowthMB = (heapCdp && heapCdp.before != null && heapCdp.after != null)
    ? +((heapCdp.after - heapCdp.before) / (1024 * 1024)).toFixed(2) : null;

  // ---- Machine-checked verdict ---------------------------------------------
  const checks = [];
  const check = (id, sev, ok, detail) => checks.push({ id, severity: sev, pass: !!ok, detail });

  check('boot.interactive', 'hard', interactive, `first playable frame reached=${interactive} (ttff=${ttffMs}ms)`);
  check('boot.no-page-errors', 'hard', pageErrors.length === 0, pageErrors.length ? pageErrors.slice(0, 4).join(' | ') : 'no page errors');

  const payloadCeil = BUDGET.coldPayloadBytes;
  check('payload.cold-ceiling', 'hard', totalBytes <= payloadCeil,
    `cold first-paint payload ${fmtBytes(totalBytes)} vs ceiling ${fmtBytes(payloadCeil)}`);
  check('payload.cold-warn', 'warn', totalBytes <= BUDGET.coldPayloadWarnBytes,
    `payload ${fmtBytes(totalBytes)} vs warn ${fmtBytes(BUDGET.coldPayloadWarnBytes)}`);

  const ttffCeil = PROFILE === 'mobile' ? BUDGET.ttffMobileMs : BUDGET.ttffDesktopMs;
  check('boot.ttff', 'hard', ttffMs <= ttffCeil, `time-to-first-frame ${ttffMs}ms vs ceiling ${ttffCeil}ms (${PROFILE})`);
  if (PROFILE === 'mobile') check('boot.ttff-warn', 'warn', ttffMs <= BUDGET.ttffMobileWarnMs, `ttff ${ttffMs}ms vs warn ${BUDGET.ttffMobileWarnMs}ms`);

  if (medianFps != null) {
    check('pacing.median-fps', 'hard', medianFps >= BUDGET.minMedianFps,
      `median ${medianFps}fps (Δmed ${median?.toFixed(2)}ms) vs bar ${BUDGET.minMedianFps}fps`);
    check('pacing.dropped-frames', 'hard', droppedFrac != null && droppedFrac <= BUDGET.maxDroppedFrac,
      `dropped ${dropped}/${deltas.length} (${((droppedFrac || 0) * 100).toFixed(1)}%) vs ≤${BUDGET.maxDroppedFrac * 100}%`);
  } else {
    check('pacing.median-fps', 'warn', false, 'no rAF deltas captured');
  }

  if (heapGrowthMB != null) {
    check('heap.growth', 'warn', heapGrowthMB <= BUDGET.maxHeapGrowthMB,
      `heap grew ${heapGrowthMB}MB over 5s vs ≤${BUDGET.maxHeapGrowthMB}MB`);
  }

  // THE lazy-load verdict: is per-stage lazy-loading REQUIRED?
  const deferrableFrac = totalBytes ? +(deferrableBytes / totalBytes).toFixed(3) : 0;
  const lazyRequired = deferrableFrac >= BUDGET.deferrableFracRequiresLazy ||
    totalBytes > payloadCeil ||
    (PROFILE === 'mobile' && ttffMs > BUDGET.ttffMobileMs);
  check('lazyload.not-required', 'warn', !lazyRequired,
    `${fmtBytes(deferrableBytes)} (${(deferrableFrac * 100).toFixed(0)}%) of cold payload is stages 2..7 art loaded upfront → lazy-load ${lazyRequired ? 'REQUIRED' : 'optional'}`);

  const hardFails = checks.filter((c) => c.severity === 'hard' && !c.pass);
  const warns = checks.filter((c) => c.severity === 'warn' && !c.pass);

  const report = {
    generatedAt: new Date().toISOString(),
    profile: PROFILE,
    url: URL,
    chrome,
    interactive,
    ttffMs,
    fullyLoadedMs,
    payload: {
      totalBytes,
      totalHuman: fmtBytes(totalBytes),
      stage1Bytes, stage1Human: fmtBytes(stage1Bytes),
      deferrableBytes, deferrableHuman: fmtBytes(deferrableBytes),
      deferrableFrac,
      byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, { bytes: v, human: fmtBytes(v) }])),
      perStage: Object.fromEntries(Object.entries(perStage).map(([k, v]) => [k, { bytes: v, human: fmtBytes(v), name: (STAGE_BIOME[k - 1] || {}).name }])),
      assetCount: assets.length,
      deferrableAssets: deferrable.map((a) => ({ file: a.file, kind: a.kind, biome: a.biome, bytes: a.bytes, human: fmtBytes(a.bytes) })),
      largest: assets.slice(0, 15).map((a) => ({ file: a.file, kind: a.kind, bytes: a.bytes, human: fmtBytes(a.bytes), deferrable: a.deferrable })),
    },
    pacing: { median, medianFps, p95, dropped, droppedFrac, sampleFrames: deltas.length, gameFps: rec.gameFps, gamePerf: rec.gamePerf },
    heap: { ...heapCdp, growthMB: heapGrowthMB, samples: rec.heap.length },
    sprites: { loaded: rec.spritesLoaded, missing: rec.spritesMissing },
    lazyLoadRequired: lazyRequired,
    pageErrors,
    checks,
    verdict: hardFails.length === 0 ? (warns.length ? 'PASS-WITH-WARNINGS' : 'PASS') : 'FAIL',
  };

  const outFile = path.join(OUT, `cold-load-${PROFILE}.json`);
  await writeFile(outFile, JSON.stringify(report, null, 2));

  // ---- Console summary ------------------------------------------------------
  console.log('─'.repeat(70));
  console.log(`COLD-LOAD PAYLOAD (${PROFILE})  total=${fmtBytes(totalBytes)}  assets=${assets.length}`);
  console.log(`  by kind: ` + Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmtBytes(v)}`).join('  '));
  console.log(`  stage-1 critical: ${fmtBytes(stage1Bytes)}   stages 2..7 upfront (deferrable): ${fmtBytes(deferrableBytes)} (${(deferrableFrac * 100).toFixed(0)}%)`);
  console.log(`  time-to-first-playable-frame: ${ttffMs}ms   fully-loaded (all music): ${fullyLoadedMs}ms   interactive=${interactive}`);
  console.log(`  pacing: median ${medianFps}fps  p95Δ ${p95?.toFixed(1)}ms  dropped ${dropped}/${deltas.length}  heapΔ ${heapGrowthMB}MB`);
  console.log('─'.repeat(70));
  for (const c of checks) {
    const tag = c.pass ? 'PASS' : (c.severity === 'hard' ? 'FAIL' : 'WARN');
    console.log(`  ${tag}  ${c.id}  —  ${c.detail}`);
  }
  console.log('─'.repeat(70));
  console.log(`VERDICT: ${report.verdict}   lazy-load required: ${lazyRequired ? 'YES' : 'no'}`);
  console.log(`report: ${outFile}\n`);

  process.exit(hardFails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(3); });
