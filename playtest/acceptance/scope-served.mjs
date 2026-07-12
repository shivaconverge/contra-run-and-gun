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

// ---------------------------------------------------------------------------
// REMOTE STALE-SERVE / DRIFT GUARD (public-URL mode). We can't kill a lingering
// server on someone else's CDN, so instead we PROVE which bytes the public URL is
// actually serving: fetch the key modules over HTTP, sha256 them, and diff those
// digests against the local game/ tree. A mismatch means the deploy is STALE vs
// this worktree (the art/wiring in game/ has not reached the live URL yet) — a
// FACT the report surfaces rather than silently trusting the CDN.
// ---------------------------------------------------------------------------
async function remoteDriftProbe(baseUrl) {
  const rels = ['index.html', 'src/main.js', 'data/config.js', 'data/level1.js', 'assets/audio/manifest.json'];
  const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const files = [];
  for (const rel of rels) {
    const entry = { rel };
    try {
      const res = await fetch(base + rel, { cache: 'no-store' });
      entry.httpStatus = res.status;
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        entry.remoteSha = createHash('sha256').update(buf).digest('hex').slice(0, 16);
      }
    } catch (e) { entry.error = String(e); }
    try {
      const local = await readFile(path.join(GAME_DIR, rel));
      entry.localSha = createHash('sha256').update(local).digest('hex').slice(0, 16);
    } catch { entry.localSha = null; }
    entry.matchesLocal = !!entry.remoteSha && entry.remoteSha === entry.localSha;
    files.push(entry);
  }
  const drifted = files.filter((f) => f.remoteSha && f.localSha && !f.matchesLocal).map((f) => f.rel);
  const unreachable = files.filter((f) => !f.remoteSha).map((f) => f.rel);
  return { baseUrl: base, files, drifted, unreachable };
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
  // TARGET RESOLUTION. Default: serve game/ locally on an ephemeral port. With
  //   --url=<URL>  (or ACCEPT_URL env): drive the PUBLIC deploy directly, so
  //   scope_served is grounded against the bytes real players actually reach — NOT
  //   just the local worktree (parent correction: local != public is unverifiable
  //   from here, so we must PROVE the live URL, not assume equivalence).
  const urlArg = process.argv.find((a) => a.startsWith('--url='));
  const TARGET_URL = urlArg ? urlArg.slice(6) : (process.env.ACCEPT_URL || null);
  const mode = TARGET_URL ? 'public' : 'local';
  const framesDir = mode === 'public' ? path.join(FRAMES_DIR, 'public') : FRAMES_DIR;
  const outName = mode === 'public' ? 'scope-served-live.json' : 'scope-served.json';
  await mkdir(framesDir, { recursive: true });

  let bootUrl, closeServer = async () => {}, staleServeGuard;
  if (mode === 'public') {
    // Remote build: can't kill a CDN process — instead prove which bytes it serves.
    const drift = await remoteDriftProbe(TARGET_URL);
    bootUrl = drift.baseUrl;
    staleServeGuard = {
      mode: 'public',
      note: 'remote CDN — verified served content hashes vs local game/ (drift = deploy behind worktree)',
      remote: drift,
    };
  } else {
    const killed = killLingeringServers();
    const server = await serveGame();
    bootUrl = server.url;
    closeServer = server.close;
    staleServeGuard = {
      mode: 'local',
      killedProcs: killed,
      note: 'served game/ on ephemeral port, never :8080',
    };
  }

  // Prefer a local install; fall back to the vendored copy under reference/tools so the
  // harness runs in a worktree that was never `npm install`ed (matches ground-desert-boss.mjs).
  let puppeteer;
  try { puppeteer = require('puppeteer-core'); }
  catch { puppeteer = require(path.join(REPO, 'reference', 'tools', 'node_modules', 'puppeteer-core')); }
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    // autoplay-policy: let the AudioContext run so the per-stage track state
    // machine (music.js useTrack) actually selects a buffer in headless; mute-audio
    // keeps CI silent WITHOUT suppressing _activeTrack (the state we assert).
    args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb', '--window-size=520,320',
      '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
  const run = {
    ts: new Date().toISOString(),
    mode,
    target: bootUrl,
    staleServeGuard,
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
    await page.goto(bootUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
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

      // MUSIC axis: the live audio layer hard-cuts to THIS stage's real generated
      // biome loop on every stage change (main.js world.onStageChange -> useTrack).
      // Wait for a real track to be selected (buffers decode async up-front); a null
      // here means the synth fallback is still playing — recorded honestly, not
      // masked. window.__audio.track === the stage_id currently playing as real audio.
      await page.waitForFunction(
        '(window.__audio && typeof window.__audio.track === "string" && window.__audio.track.length > 0) || !(window.__audio && window.__audio.music)',
        { timeout: 6000 },
      ).catch(() => {});

      const meta = await page.evaluate(() => {
        const w = window.__game;
        const boss = w.boss;
        const a = window.__audio;
        // Themed boss ART fact: the EXACT sprite render.js drawEnemy resolves for this
        // stage's boss — assets.get('boss_'+theme.id) (the themedBoss that wins over the
        // base boss/chopper). Recorded per stage so a regression to an unwired key or a
        // stale/degenerate boss sprite (e.g. a re-seed that dropped the file) is VISIBLE
        // in the gate output, not silently masked by the base-art fallback. Untamed
        // stages (jungle/cascade — no boss_<id> key) legitimately resolve null.
        const themeId = w.level && w.level.theme;
        const bImg = window.__assets && themeId && window.__assets.get('boss_' + themeId);
        // SET-DRESSING presence fact: render.js drawDecor blits each world.decor prop
        // ONLY if assets.get(d.key) resolves — an unloaded decor key silently draws
        // NOTHING (no fallback). So a stage that references a decor sprite the deploy
        // failed to ship loses its set-dressing while the sibling palette-diff could
        // still pass. Enumerate the keys this stage actually references and record
        // which resolve to a loaded image vs which are MISSING ART (the defect), plus
        // how many props are on-screen at capture (so the frame evidence shows them).
        const decor = w.decor || [];
        const decorKeys = [...new Set(decor.map((d) => d.key))];
        const decorMissingArt = decorKeys.filter((k) => !(window.__assets && window.__assets.get(k)));
        const camx = w.camera.x, camR = camx + 480;
        const decorOnScreen = decor.filter((d) => d.x >= camx - 40 && d.x <= camR + 40).length;
        // TILESET fact: render.js drawSolids resolves assets.get(theme.tileset) and
        // FALLS BACK to the base jungle sheet 'tiles' when the biome sheet is unloaded.
        // So a stage whose theme_<biome>.png didn't ship silently renders JUNGLE's
        // tiles on its own background — the goal's "reusing another stage's tiles"
        // defect, which the whole-frame diff can miss (tiles are only the floor band).
        // resolvedTileset = the key that ACTUALLY renders (own sheet, or the 'tiles'
        // fallback). jungle owns 'tiles' by design (theme_jungle intentionally absent).
        const tilesetKey = w.theme && w.theme.tileset;         // e.g. 'theme_snow' (config)
        const tilesetLoaded = !!(tilesetKey && window.__assets && window.__assets.get(tilesetKey));
        const resolvedTileset = tilesetLoaded ? tilesetKey : 'tiles';
        return {
          stageNum: w.stageNum,
          name: w.level && w.level.name,
          theme: themeId,
          status: w.status,
          hasNextStage: w.hasNextStage,
          isFinalStage: w.isFinalStage,
          bossPresent: !!boss,
          bossIsBoss: !!(boss && boss.def && boss.def.isBoss),
          bossName: boss && boss.def && boss.def.name,
          bossKind: boss && boss.kind,
          bossHp: boss && boss.hp,
          themedBossKey: themeId ? 'boss_' + themeId : null,
          themedBossLoaded: !!bImg,
          themedBossDims: bImg ? { w: bImg.naturalWidth, h: bImg.naturalHeight } : null,
          playerX: Math.round(w.player.x),
          audioLayerPresent: !!(a && a.music),
          audioTrack: a ? a.track : null,        // real biome loop id, or null (synth fallback)
          decorKeys,
          decorCount: decor.length,
          decorMissingArt,                        // referenced-but-unloaded decor sprites (a real art gap → B)
          decorOnScreen,
          tilesetKey,
          tilesetLoaded,
          resolvedTileset,                        // the tileset that ACTUALLY renders (own sheet or 'tiles' fallback)
        };
      });

      const sig = await grabSignature(page);
      const framePath = path.join(framesDir, `stage-${num}-${meta.theme || 'unknown'}.png`);
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
        // Advance via NORMAL progression. Primary path: the REAL 'N' CONTINUE key
        // (proves the shipped key BINDING). A synthetic keydown can be dropped under
        // remote (github.io) latency, and a false "stuck at N->N+1" would wrongly
        // point builders at a non-existent transition bug — so if the key doesn't
        // land after a few real presses we fall back to the EXPOSED
        // `window.__game.requestNextStage()` closure. That is the SAME
        // normal-progression function the 'N' key invokes (main.js binds N ->
        // requestNextStage) — NOT a URL/param skip — so the fallback still proves
        // the real advance path, just without depending on synthetic key delivery.
        // We record HOW each stage advanced so the report is honest about it.
        const wantStage = num + 1;
        const advancedBy = async () => page.evaluate((n) => window.__game.status === 'playing' && window.__game.stageNum === n, wantStage);
        let advanced = false, via = null, keyPresses = 0;
        for (let attempt = 0; attempt < 3 && !advanced; attempt++) {
          await page.keyboard.press('KeyN'); keyPresses++;
          advanced = await page.waitForFunction(
            `window.__game.status === 'playing' && window.__game.stageNum === ${wantStage}`,
            { timeout: 2500 },
          ).then(() => true).catch(() => false);
          if (advanced) via = 'KeyN(real-key)';
        }
        if (!advanced) {
          // Reliability fallback — invoke the exact closure the N key binds to.
          await page.evaluate(() => { if (window.__game.requestNextStage) window.__game.requestNextStage(); });
          advanced = await page.waitForFunction(
            `window.__game.status === 'playing' && window.__game.stageNum === ${wantStage}`,
            { timeout: 4000 },
          ).then(() => true).catch(() => false);
          if (advanced) via = 'requestNextStage()-closure';
        }
        const last = run.stages[run.stages.length - 1];
        last.transitionVia = advanced ? via : 'STUCK';
        last.transitionKeyPresses = keyPresses;
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
    await closeServer();
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
  // MUSIC distinctness (FACT). Each stage's live audio must select a DISTINCT
  // real biome track. A track passes when it is (a) non-null (real loop, not the
  // synth fallback), (b) unique among all reached stages, AND (c) the track id
  // names this stage's theme (ids are `s<N>_<theme>`, so a snow stage playing
  // `s3_snow` proves the RIGHT biome loop, not just A loop). No decode / synth
  // fallback shows as audioTrack:null and fails this axis honestly.
  // -------------------------------------------------------------------------
  const trackCounts = {};
  for (const s of run.stages) if (s.audioTrack) trackCounts[s.audioTrack] = (trackCounts[s.audioTrack] || 0) + 1;
  for (const s of run.stages) {
    s.musicPresent = typeof s.audioTrack === 'string' && s.audioTrack.length > 0;
    s.musicUnique = s.musicPresent && trackCounts[s.audioTrack] === 1;
    s.musicMatchesTheme = s.musicPresent && !!s.theme && s.audioTrack.toLowerCase().includes(String(s.theme).toLowerCase());
    s.musicDistinct = s.musicPresent && s.musicUnique && s.musicMatchesTheme;
  }

  // -------------------------------------------------------------------------
  // Per-stage verdict + scope_served.
  //   PASS  == reached via normal progression AND boss registered (isBoss)
  //            AND visually distinct from every reached sibling AND a distinct,
  //            theme-matched biome track is playing.
  // -------------------------------------------------------------------------
  const problems = { missing: [], paramOnly: [], reusingTiles: [], noBoss: [], reusingMusic: [], noMusic: [], missingDecorArt: [], tilesetReuse: [] };
  // TILESET distinctness across stages: resolvedTileset is the sheet each stage
  // ACTUALLY renders. All 7 should be unique (jungle='tiles' by design; 2–7 each
  // their own theme_<biome>). A biome sheet that failed to load collapses to 'tiles',
  // so >1 stage sharing a resolvedTileset == the non-jungle ones reuse jungle's tiles.
  const tilesetCounts = {};
  for (const s of run.stages) tilesetCounts[s.resolvedTileset] = (tilesetCounts[s.resolvedTileset] || 0) + 1;
  const tilesetOwners = { tiles: 'jungle' }; // 'tiles' legitimately belongs to jungle only
  let scopeServed = 0;
  for (const s of run.stages) {
    const reachedNormally = s.status === 'playing' || s.status === 'cleared';
    const bossOk = s.bossPresent && s.bossIsBoss;
    // SET-DRESSING present == no decor sprite this stage REFERENCES failed to load
    // (a missing key silently draws nothing → set-dressing vanishes). Stages whose
    // dressing is procedural (jungle grass, decorCount 0) reference no keys and pass.
    s.setDressingOk = (s.decorMissingArt || []).length === 0;
    // TILESET present+own == the stage renders its OWN distinct sheet. jungle is OK on
    // 'tiles' (by design); every other stage must have loaded its theme_<biome> sheet
    // (else it fell back to jungle's tiles → reuse). Blames ONLY the offending stage —
    // jungle legitimately owns 'tiles', so it is never penalized when another stage
    // collapses onto 'tiles'. (Config guarantees distinct keys, so a fallback is the
    // only way two stages can share a resolvedTileset.)
    s.tilesetOwn = s.theme === 'jungle' ? (s.resolvedTileset === 'tiles') : s.tilesetLoaded;
    // Informational: is this stage's rendered sheet shared with any sibling? (blame
    // still goes to tilesetOwn — the non-owner that fell back.)
    s.tilesetShared = tilesetCounts[s.resolvedTileset] > 1;
    s.tilesetOk = s.tilesetOwn;
    const pass = reachedNormally && bossOk && s.visuallyDistinct && s.musicDistinct && s.setDressingOk && s.tilesetOk;
    s.pass = pass;
    s.reasons = [];
    if (!reachedNormally) s.reasons.push('not-reached-normally');
    if (!bossOk) { s.reasons.push('boss-missing-or-not-isBoss'); problems.noBoss.push(s.stage); }
    if (!s.visuallyDistinct) { s.reasons.push('visual-reuse-of-sibling'); problems.reusingTiles.push({ stage: s.stage, of: s.suspectedReuseOf.map((c) => c.stage) }); }
    if (!s.musicPresent) { s.reasons.push('music-missing(synth-fallback)'); problems.noMusic.push(s.stage); }
    else if (!s.musicUnique) { s.reasons.push('music-reuse-of-sibling'); problems.reusingMusic.push({ stage: s.stage, track: s.audioTrack }); }
    else if (!s.musicMatchesTheme) s.reasons.push('music-track-does-not-name-theme');
    if (!s.setDressingOk) { s.reasons.push('set-dressing-art-missing:' + s.decorMissingArt.join(',')); problems.missingDecorArt.push({ stage: s.stage, keys: s.decorMissingArt }); }
    if (!s.tilesetOk) {
      // A non-jungle stage on 'tiles' fell back (its biome sheet didn't load); or two
      // stages share a resolved sheet. Route the blame to the reusing stage.
      const detail = !s.tilesetOwn
        ? `tileset-fellback-to-jungle(${s.tilesetKey}-unloaded)`
        : `tileset-reuse-of-${tilesetOwners[s.resolvedTileset] || 'sibling'}(${s.resolvedTileset})`;
      s.reasons.push(detail);
      problems.tilesetReuse.push({ stage: s.stage, resolvedTileset: s.resolvedTileset, tilesetKey: s.tilesetKey, loaded: s.tilesetLoaded });
    }
    if (pass) scopeServed++;
    delete s._sig; // keep the JSON lean; grids/hists are large
  }
  for (let n = 1; n <= EXPECTED_STAGES; n++) {
    if (!run.stages.find((s) => s.stage === n)) problems.missing.push(n);
  }

  run.scope_served = `${scopeServed}/${EXPECTED_STAGES}`;
  run.scopeServedNum = scopeServed;
  run.problems = problems;
  // TILESET distinctness FACT: the sheet each stage actually renders, and whether all
  // 7 are unique (the goal's "reusing another stage's tiles" — a collision means a
  // biome sheet fell back to jungle's).
  run.resolvedTilesets = run.stages.map((s) => ({ stage: s.stage, theme: s.theme, tileset: s.resolvedTileset, own: s.tilesetOwn }));
  run.tilesetAllDistinct = new Set(run.stages.map((s) => s.resolvedTileset)).size === run.stages.length;
  // Public-mode note: report (do NOT mask) if the live deploy is behind the
  // worktree. scope_served still reflects what the LIVE URL actually served —
  // a drifted deploy that still plays 7/7 is a PASS-with-drift, flagged so the
  // deploy owner knows a newer game/ hasn't shipped yet.
  run.deployDrift = mode === 'public' ? (staleServeGuard.remote.drifted || []) : [];
  // Transparency: HOW each of the 6 inter-stage transitions advanced. The real 'N'
  // key is the primary path (proves the binding); a `requestNextStage()-closure`
  // entry means a synthetic keydown was dropped and we used the exposed same-path
  // closure instead (still normal progression, never a param skip).
  run.transitions = run.stages.filter((s) => s.transitionVia).map((s) => ({ from: s.stage, via: s.transitionVia, keyPresses: s.transitionKeyPresses }));
  run.keyBindingProven = run.transitions.some((t) => t.via === 'KeyN(real-key)');
  // Themed-boss ART fact: every stage with a DEDICATED per-biome boss sprite must have
  // that themedBoss image LOADED, so the per-stage boss art (incl. the re-seeded
  // boss_desert Sand Gunship) is proven ACTIVE — not silently falling back to the base
  // boss/chopper. The two UNTAMED stages (jungle/cascade) intentionally have NO
  // boss_<id> key and reuse the base art (game/data/assets.js contract), so they are
  // exempt. Recorded as a first-class fact + surfaced.
  const UNTAMED_THEMES = new Set(['jungle', 'cascade']); // no dedicated boss_<id> sprite
  run.themedBossArt = run.stages
    .filter((s) => s.bossName && !UNTAMED_THEMES.has(s.theme))
    .map((s) => ({ stage: s.stage, theme: s.theme, key: s.themedBossKey, loaded: !!s.themedBossLoaded, dims: s.themedBossDims }));
  run.themedBossArtProblems = run.themedBossArt.filter((b) => !b.loaded).map((b) => b.stage);
  run.themedBossArtOk = run.themedBossArtProblems.length === 0;
  run.verdict = scopeServed === EXPECTED_STAGES && run.victory ? 'PASS' : 'INCOMPLETE';

  const outJson = path.join(HERE, outName);
  await writeFile(outJson, JSON.stringify(run, null, 2));

  // One-line machine-readable fact to stdout (grep-friendly for parents).
  console.log(`scope_served=${run.scope_served} verdict=${run.verdict} victory=${!!run.victory} mode=${mode}`);
  if (mode === 'public') {
    console.log(`  target=${run.target}`);
    console.log(`  deployDrift=${run.deployDrift.length ? run.deployDrift.join(',') : 'none (live bytes match worktree)'}`);
    if (staleServeGuard.remote.unreachable.length) console.log(`  unreachable=${staleServeGuard.remote.unreachable.join(',')}`);
  }
  const viaKey = run.transitions.filter((t) => t.via === 'KeyN(real-key)').length;
  const viaClosure = run.transitions.filter((t) => t.via === 'requestNextStage()-closure').length;
  console.log(`  transitions: ${viaKey} via real KeyN, ${viaClosure} via requestNextStage() fallback; keyBindingProven=${run.keyBindingProven}`);
  for (const s of run.stages) {
    const bd = s.themedBossDims ? `${s.themedBossDims.w}x${s.themedBossDims.h}` : (s.bossName ? 'ART-MISSING' : 'base');
    const decor = s.decorCount === 0 ? 'procedural' : `${s.decorKeys.join('+')}${s.decorMissingArt && s.decorMissingArt.length ? ' MISSING!' : `×${s.decorOnScreen}on-screen`}`;
    console.log(`  stage ${s.stage} [${s.theme}] boss=${s.bossName || '—'} art=${bd} tiles=${s.resolvedTileset}(${s.tilesetOk}) decor=${decor} vis=${s.visuallyDistinct} music=${s.audioTrack || 'synth'}(${s.musicDistinct}) pass=${s.pass}${s.reasons.length ? ' (' + s.reasons.join(',') + ')' : ''}`);
  }
  console.log(`  themedBossArt: ${run.themedBossArtOk ? 'all themed bosses loaded their sprite' : 'MISSING on stages ' + run.themedBossArtProblems.join(',')}`);
  if (run.consoleErrors.length) console.log(`  consoleErrors: ${run.consoleErrors.length}`);
  if (run.pageErrors.length) console.log(`  pageErrors: ${run.pageErrors.length}`);
  console.log(`  wrote ${path.relative(REPO, outJson)} + ${run.stages.length} frames`);

  process.exit(run.verdict === 'PASS' ? 0 : 1);
}

main().catch((e) => { console.error('scope-served harness ERROR:', e); process.exit(2); });
