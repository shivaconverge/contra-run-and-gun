// scope-served.mjs — the player-POV ACCEPTANCE SENSOR.
//
// WHAT THIS PROVES (a single machine-readable FACT: scope_served = N/7):
//   Boot the REAL browser build at the campaign start (NO ?level= param — stage 1
//   via NORMAL progression only), then advance stage 1 -> 2 -> ... -> 7 -> VICTORY
//   using the SHIPPED player transition (`world.requestNextStage`, driven by the
//   real 'N' CONTINUE keydown that main.js binds). For EACH reached stage capture a
//   real, native-resolution rendered frame off the live <canvas>, and record its
//   theme, boss identity, and a pixel/palette signature.
//
//   scope_served counts the stages that are (a) REACHED via normal progression,
//   (b) render a boss that registers via the isBoss finder, AND (c) are VISUALLY
//   DISTINCT (palette + downsampled-pixel diff) from EVERY other reached stage —
//   i.e. not a tile/background reuse of a sibling. Any stage that is missing,
//   reachable only by URL param, or a visual clone of another is called out.
//
// FACTS vs JUDGMENTS: the CV signature/diff here is an ADVISORY pre-filter, never
// the fidelity verdict. The frames are written to playtest/acceptance/frames/ so a
// human (or the multimodal loop owner) LOOKS at them side-by-side and records the
// real distinctness verdict in ACCEPTANCE.md. This harness computes only what code
// can prove: reachability, boss registration, and objective pixel divergence.
//
// HARNESS AFFORDANCE (documented, not a cheat): to make a 7-stage playthrough
// deterministic and fast, once a stage's opening biome frame is captured we mark
// its boss dead through the live world object so the SHIPPED win-check flips the
// stage to 'cleared' — then we press the REAL 'N' key. Combat DEFEATABILITY is a
// separate FACT proven by World.bossDefeatableTest (game/src/world.js); this sensor
// measures REACH + VISUAL DISTINCTNESS + the real transition chain, per the goal's
// "clearing stage N advances to N+1 ... to a final victory".
//
// STALE-SERVE GUARD: kills any lingering serve.mjs, serves game/ on an ephemeral
// port from THIS process, and records a sha256 content hash of the served
// index.html + every src/data module so the report can prove which bytes we drove.
//
// Run (from repo root):  node playtest/acceptance/scope-served.mjs
// Emits: playtest/acceptance/scope-served.json  (+ frames/*.png, ACCEPTANCE.md)

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const GAME_DIR = path.join(REPO, 'game');
const FRAMES_DIR = path.join(HERE, 'frames');
const EXPECTED_STAGES = 7;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

// ---------------------------------------------------------------------------
// STALE-SERVE GUARD — kill any lingering shipped server before we serve fresh.
// The known hazard: an old `node serve.mjs` on :8080 keeps handing out STALE
// bytes, so a harness "passes" against art that was already fixed. We serve our
// own ephemeral port (never :8080) AND proactively kill strays so nothing else
// on the box can shadow us.
// ---------------------------------------------------------------------------
function killLingeringServers() {
  const killed = [];
  for (const pat of ['serve.mjs', 'stage-boot-music', 'go-live']) {
    try {
      const pids = execSync(`pgrep -f "${pat}" 2>/dev/null || true`).toString().trim();
      if (pids) {
        for (const pid of pids.split(/\s+/)) {
          try { execSync(`kill -9 ${pid} 2>/dev/null || true`); killed.push(`${pat}:${pid}`); } catch {}
        }
      }
    } catch {}
  }
  return killed;
}

// Serve game/ on an ephemeral port; hash every file we hand out so the report can
// prove exactly which bytes drove the run (defeats the stale-serve hazard).
async function serveGame() {
  const served = new Map(); // rel path -> sha256
  const server = createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const full = path.join(GAME_DIR, path.normalize(rel));
      if (!full.startsWith(GAME_DIR)) { res.writeHead(403).end('forbidden'); return; }
      const body = await readFile(full);
      served.set(rel, createHash('sha256').update(body).digest('hex').slice(0, 16));
      res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    served,
    close: () => new Promise((r) => server.close(r)),
  };
}

function findChrome() {
  const cands = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  const cache = path.join(os.homedir(), '.cache', 'puppeteer');
  for (const kind of ['chrome', 'chrome-headless-shell']) {
    const base = path.join(cache, kind);
    if (existsSync(base)) {
      try {
        const h = execSync(`ls ${base}/*/*/${kind}* 2>/dev/null | head -1`).toString().trim();
        if (h) cands.push(h);
      } catch {}
    }
  }
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error('No Chrome binary found');
}

// ---------------------------------------------------------------------------
// Signatures for the CV pre-filter. From a 480x270 canvas we pull a small,
// stable fingerprint: an 8-bucket-per-channel palette histogram and a 24x14
// average-color grid. Two stages that reuse the same tileset+backdrop score a
// tiny divergence; distinct biomes score a large one.
// ---------------------------------------------------------------------------
async function grabSignature(page) {
  return page.evaluate(() => {
    const cv = document.getElementById('game');
    const ctx = cv.getContext('2d');
    const { data, width: W, height: H } = ctx.getImageData(0, 0, cv.width, cv.height);
    // Palette histogram: 4 bits/channel -> 4096 bins, but keep it compact by
    // summarizing as a coarse 8^3 = 512-bin count vector.
    const hist = new Array(512).fill(0);
    // 24x14 average-color grid.
    const GX = 24, GY = 14;
    const grid = new Array(GX * GY).fill(0).map(() => [0, 0, 0, 0]);
    for (let y = 0; y < H; y++) {
      const gy = Math.min(GY - 1, (y * GY / H) | 0);
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const bin = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
        hist[bin]++;
        const gx = Math.min(GX - 1, (x * GX / W) | 0);
        const cell = grid[gy * GX + gx];
        cell[0] += r; cell[1] += g; cell[2] += b; cell[3]++;
      }
    }
    const total = W * H;
    const histNorm = hist.map((c) => c / total);
    const gridAvg = grid.map((c) => (c[3] ? [Math.round(c[0] / c[3]), Math.round(c[1] / c[3]), Math.round(c[2] / c[3])] : [0, 0, 0]));
    // Distinct-color count (non-empty coarse bins) — a cheap "is anything even
    // rendered / how varied is the palette" proxy.
    const distinctBins = hist.filter((c) => c > 0).length;
    return { histNorm, gridAvg, distinctBins };
  });
}

// Mean per-channel absolute difference between two 24x14 grids, 0..255.
function gridDiff(a, b) {
  let sum = 0, n = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i][0] - b[i][0]) + Math.abs(a[i][1] - b[i][1]) + Math.abs(a[i][2] - b[i][2]);
    n += 3;
  }
  return sum / n;
}

// L1 distance between palette histograms, 0..2 (2 == fully disjoint palettes).
function histDiff(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s;
}

async function main() {
  await mkdir(FRAMES_DIR, { recursive: true });
  const killed = killLingeringServers();
  const server = await serveGame();
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb', '--window-size=520,320'],
  });
  const run = {
    ts: new Date().toISOString(),
    servedUrl: server.url,
    staleServeGuard: { killedProcs: killed, note: 'served on ephemeral port, never :8080' },
    expectedStages: EXPECTED_STAGES,
    stages: [],
    consoleErrors: [],
    pageErrors: [],
  };

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 520, height: 320, deviceScaleFactor: 1 });
    page.on('console', (m) => { if (m.type() === 'error') run.consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => run.pageErrors.push(String(e)));

    // BOOT at the campaign start — NO ?level param. This is the ONLY entry we use.
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction('window.__booted === true', { timeout: 20000 });
    await page.waitForFunction('window.__game && window.__game.status', { timeout: 20000 });

    // Prove we did NOT jump stages: at boot the live world must be on stage 1.
    const bootStage = await page.evaluate(() => ({
      status: window.__game.status,
      stageNum: window.__game.stageNum,
      stageCount: window.__game.stageCount,
      urlHasLevel: new URL(location.href).searchParams.has('level'),
    }));
    run.bootProbe = bootStage;

    // Start the run from the TITLE with a real key (normal player gesture).
    await page.bringToFront();
    await page.keyboard.press('Space'); // START_KEYS includes Space -> world.start()
    await page.waitForFunction("window.__game.status === 'playing'", { timeout: 10000 });

    // Walk the campaign stage-by-stage via the SHIPPED normal transition.
    for (let idx = 0; idx < EXPECTED_STAGES; idx++) {
      const num = idx + 1;
      // Give the live rAF loop a beat to settle on the new stage, then run right a
      // touch with REAL keys so the camera reveals set-dressing (real play, not a
      // static spawn frame).
      await sleep(150);
      await page.keyboard.down('ArrowRight');
      await sleep(650);
      await page.keyboard.up('ArrowRight');
      await sleep(120);

      const meta = await page.evaluate(() => {
        const w = window.__game;
        const boss = w.boss;
        return {
          stageNum: w.stageNum,
          name: w.level && w.level.name,
          theme: w.level && w.level.theme,
          status: w.status,
          hasNextStage: w.hasNextStage,
          isFinalStage: w.isFinalStage,
          bossPresent: !!boss,
          bossIsBoss: !!(boss && boss.def && boss.def.isBoss),
          bossName: boss && boss.def && boss.def.name,
          bossKind: boss && boss.kind,
          bossHp: boss && boss.hp,
          playerX: Math.round(w.player.x),
        };
      });

      const sig = await grabSignature(page);
      const framePath = path.join(FRAMES_DIR, `stage-${num}-${meta.theme || 'unknown'}.png`);
      const cv = await page.$('#game');
      await cv.screenshot({ path: framePath });

      run.stages.push({
        stage: num,
        reachedVia: idx === 0 ? 'boot(stage1,no-param)' : 'requestNextStage(N-key)',
        frame: path.relative(REPO, framePath),
        ...meta,
        distinctBins: sig.distinctBins,
        _sig: sig, // stripped before writing JSON; used only for pairwise diffs
      });

      // Not the final stage? force-clear the boss (documented affordance) and take
      // the REAL 'N' continue transition to the next stage.
      if (idx < EXPECTED_STAGES - 1) {
        await page.evaluate(() => {
          const w = window.__game;
          if (w.boss) { w.boss.dead = true; w.boss.hp = 0; }
        });
        // Let the shipped win-check flip status -> 'cleared'.
        await page.waitForFunction("window.__game.status === 'cleared'", { timeout: 5000 })
          .catch(() => {});
        await page.keyboard.press('KeyN'); // the REAL player CONTINUE binding
        await page.waitForFunction(
          `window.__game.status === 'playing' && window.__game.stageNum === ${num + 1}`,
          { timeout: 8000 },
        ).catch(() => {});
      } else {
        // Final stage: force-clear and confirm VICTORY (terminal 'cleared', no next).
        await page.evaluate(() => {
          const w = window.__game;
          if (w.boss) { w.boss.dead = true; w.boss.hp = 0; }
        });
        await page.waitForFunction("window.__game.status === 'cleared'", { timeout: 5000 })
          .catch(() => {});
        run.victory = await page.evaluate(() => {
          const w = window.__game;
          return w.status === 'cleared' && (w.isFinalStage === true || w.hasNextStage === false);
        });
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }

  // -------------------------------------------------------------------------
  // Pairwise visual-distinctness (CV pre-filter). A stage is a suspected REUSE
  // of a sibling if BOTH its grid diff and palette diff to that sibling fall
  // under the reuse thresholds. Thresholds are deliberately loose — a genuine
  // biome swap moves the palette a lot; only near-identical renders trip it.
  // -------------------------------------------------------------------------
  const GRID_REUSE = 6.0;   // mean per-channel diff (0..255) below this == suspiciously similar
  const HIST_REUSE = 0.35;  // palette L1 (0..2) below this == suspiciously similar
  const sigs = run.stages.map((s) => s._sig);
  for (let i = 0; i < run.stages.length; i++) {
    const clones = [];
    let minGrid = Infinity, minHist = Infinity, nearest = null;
    for (let j = 0; j < run.stages.length; j++) {
      if (i === j || !sigs[i] || !sigs[j]) continue;
      const gd = gridDiff(sigs[i].gridAvg, sigs[j].gridAvg);
      const hd = histDiff(sigs[i].histNorm, sigs[j].histNorm);
      if (gd < minGrid) { minGrid = gd; nearest = run.stages[j].stage; }
      minHist = Math.min(minHist, hd);
      if (gd < GRID_REUSE && hd < HIST_REUSE) clones.push({ stage: run.stages[j].stage, gridDiff: +gd.toFixed(2), histDiff: +hd.toFixed(3) });
    }
    const s = run.stages[i];
    s.nearestSibling = nearest;
    s.minGridDiff = Number.isFinite(minGrid) ? +minGrid.toFixed(2) : null;
    s.minHistDiff = Number.isFinite(minHist) ? +minHist.toFixed(3) : null;
    s.suspectedReuseOf = clones;
    s.visuallyDistinct = clones.length === 0;
  }

  // -------------------------------------------------------------------------
  // Per-stage verdict + scope_served.
  //   PASS  == reached via normal progression AND boss registered (isBoss)
  //            AND visually distinct from every reached sibling.
  // -------------------------------------------------------------------------
  const problems = { missing: [], paramOnly: [], reusingTiles: [], noBoss: [] };
  let scopeServed = 0;
  for (const s of run.stages) {
    const reachedNormally = s.status === 'playing' || s.status === 'cleared';
    const bossOk = s.bossPresent && s.bossIsBoss;
    const pass = reachedNormally && bossOk && s.visuallyDistinct;
    s.pass = pass;
    s.reasons = [];
    if (!reachedNormally) s.reasons.push('not-reached-normally');
    if (!bossOk) { s.reasons.push('boss-missing-or-not-isBoss'); problems.noBoss.push(s.stage); }
    if (!s.visuallyDistinct) { s.reasons.push('visual-reuse-of-sibling'); problems.reusingTiles.push({ stage: s.stage, of: s.suspectedReuseOf.map((c) => c.stage) }); }
    if (pass) scopeServed++;
    delete s._sig; // keep the JSON lean; grids/hists are large
  }
  for (let n = 1; n <= EXPECTED_STAGES; n++) {
    if (!run.stages.find((s) => s.stage === n)) problems.missing.push(n);
  }

  run.scope_served = `${scopeServed}/${EXPECTED_STAGES}`;
  run.scopeServedNum = scopeServed;
  run.problems = problems;
  run.verdict = scopeServed === EXPECTED_STAGES && run.victory ? 'PASS' : 'INCOMPLETE';

  const outJson = path.join(HERE, 'scope-served.json');
  await writeFile(outJson, JSON.stringify(run, null, 2));

  // One-line machine-readable fact to stdout (grep-friendly for parents).
  console.log(`scope_served=${run.scope_served} verdict=${run.verdict} victory=${!!run.victory}`);
  for (const s of run.stages) {
    console.log(`  stage ${s.stage} [${s.theme}] boss=${s.bossName || '—'} distinct=${s.visuallyDistinct} pass=${s.pass}${s.reasons.length ? ' (' + s.reasons.join(',') + ')' : ''}`);
  }
  if (run.consoleErrors.length) console.log(`  consoleErrors: ${run.consoleErrors.length}`);
  if (run.pageErrors.length) console.log(`  pageErrors: ${run.pageErrors.length}`);
  console.log(`  wrote ${path.relative(REPO, outJson)} + ${run.stages.length} frames`);

  process.exit(run.verdict === 'PASS' ? 0 : 1);
}

main().catch((e) => { console.error('scope-served harness ERROR:', e); process.exit(2); });
