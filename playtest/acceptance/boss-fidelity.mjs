// boss-fidelity.mjs — player-POV verification that every stage's BOSS is PRESENT
// and VISIBLY DISTINCT (the boss axis of the goal's "distinct theme/biome with its
// own … boss").
//
// WHY THIS HARNESS (my slice): scope-served proves the boss is REGISTERED in state
// (world.boss with def.isBoss) and force-clears it to advance — but its per-stage
// frame is captured at SPAWN, where the boss (parked at the far end past the arena
// barrier) is off-screen and never rendered. So the boss has never actually been
// LOOKED at. This harness plays 1→7 via NORMAL progression, and for each stage
// drives the player to the boss firing line, ACTIVATES the boss, and captures a
// zoomed frame of the rendered boss off the live <canvas>. I then READ all 7 boss
// frames and judge — by looking — that each is present and visibly distinct from
// the others (per-stage themed boss art: boss_<theme>). CV (palette/pixel diff) is
// only an advisory pre-filter; the distinctness verdict is by looking, recorded in
// ACCEPTANCE.md.
//
// FACTS vs JUDGMENTS: the harness computes FACTS (boss name/kind/theme/dims, a
// palette+grid signature, pairwise diffs) and produces the frames. "Are the 7
// bosses visibly distinct" is a by-looking JUDGMENT, not a threshold verdict.
//
// CAPTURE AFFORDANCE (documented, not a cheat): to reach the boss without a full
// hand-played traversal, the player is parked at the arena firing line (barrier.x −
// player.w − margin, grounded, invulnerable) and the boss's `active` flag is set —
// exactly the state "player reached the arena" produces. This measures the boss's
// APPEARANCE + presence, not combat balance (that is World.bossDefeatableTest).
//
// Run (from repo root):
//   node playtest/acceptance/boss-fidelity.mjs               # local served game/
//   node playtest/acceptance/boss-fidelity.mjs --url=<url>   # public URL
// Emits: playtest/acceptance/boss-fidelity.json (+ frames/boss/*.png)

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const GAME_DIR = path.join(REPO, 'game');
const FRAMES_DIR = path.join(HERE, 'frames', 'boss');
const EXPECTED_STAGES = 7;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

function killLingeringServers() {
  const killed = [];
  for (const pat of ['serve.mjs', 'stage-boot-music', 'go-live']) {
    try {
      const pids = execSync(`pgrep -f "${pat}" 2>/dev/null || true`).toString().trim();
      if (pids) for (const pid of pids.split(/\s+/)) { try { execSync(`kill -9 ${pid} 2>/dev/null || true`); killed.push(`${pat}:${pid}`); } catch {} }
    } catch {}
  }
  return killed;
}

async function serveGame() {
  const server = createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const full = path.join(GAME_DIR, path.normalize(rel));
      if (!full.startsWith(GAME_DIR)) { res.writeHead(403).end('forbidden'); return; }
      const body = await readFile(full);
      res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) };
}

function findChrome() {
  const cands = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  const cache = path.join(os.homedir(), '.cache', 'puppeteer');
  for (const kind of ['chrome', 'chrome-headless-shell']) {
    const base = path.join(cache, kind);
    if (existsSync(base)) { try { const h = execSync(`ls ${base}/*/*/${kind}* 2>/dev/null | head -1`).toString().trim(); if (h) cands.push(h); } catch {} }
  }
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error('No Chrome binary found');
}

// Park the player at the boss firing line and activate the boss. Returns the boss's
// live position so the caller can center the crop. Kept invulnerable + grounded so a
// pit/one-hit death doesn't reset the camera before the capture.
async function parkAtBoss(page) {
  return page.evaluate(() => {
    const w = window.__game, p = w.player;
    if (w.boss) w.boss.active = true;
    // Position the player so the camera-follow (want = px + pw/2 − VIEW_W*0.38)
    // CENTERS the boss on screen, then SNAP the camera there. Without this the
    // camera trails the player at the barrier and a boss parked further past it
    // (esp. the FLYING chopper) falls outside the rendered window → background-only
    // crop. Centering + snapping guarantees the boss is drawn and framed.
    if (w.boss) {
      const b = w.boss;
      // Derivation: camera.x = px + pw/2 − 480*0.38 = px + pw/2 − 182.4. For the
      // boss center to land at screen 240: (b.x+b.w/2) − camera.x = 240 ⇒
      // px = b.x + b.w/2 − 58 − pw/2.
      p.x = b.x + b.w / 2 - 58 - p.w / 2;
    } else {
      const barrier = w.solids.find((s) => s.kind === 'barrier');
      p.x = barrier ? barrier.x - p.w - 24 : p.x;
    }
    p.vx = 0; p.vy = 0;
    const cx = p.x + p.w / 2;
    const ground = w.solids.find((s) => s.kind === 'ground' && cx >= s.x && cx <= s.x + s.w);
    if (ground) p.y = ground.y - p.h;
    p.iframe = 999999; p.dead = false;
    if (w.camera && w.camera.follow) w.camera.follow(p, true); // SNAP camera to center the boss now
    return w.boss ? { bx: w.boss.x, by: w.boss.y, bw: w.boss.w, bh: w.boss.h } : null;
  });
}

// Atomic zoomed crop centered on the boss (read boss position + crop in one evaluate
// so there is no drift). Sizes the window to the boss's own bounds + margin.
async function captureBoss(page) {
  const res = await page.evaluate(() => {
    const w = window.__game, c = w.camera, b = w.boss;
    if (!b) return null;
    const cv = document.getElementById('game');
    const margin = 22;
    const size = Math.min(cv.height, Math.max(b.w, b.h) + margin * 2);
    const cx = b.x + b.w / 2 - c.x, cy = b.y + b.h / 2 - c.y;
    const sx = Math.max(0, Math.min(cv.width - size, Math.round(cx - size / 2)));
    const sy = Math.max(0, Math.min(cv.height - size, Math.round(cy - size / 2)));
    const scale = Math.max(2, Math.round(300 / size));
    const out = document.createElement('canvas');
    out.width = size * scale; out.height = size * scale;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(cv, sx, sy, size, size, 0, 0, size * scale, size * scale);
    // Palette + grid signature for the advisory distinctness pre-filter.
    const g = octx.getImageData(0, 0, out.width, out.height).data;
    const GX = 16, GY = 16, grid = new Array(GX * GY).fill(0).map(() => [0, 0, 0, 0]);
    const hist = new Array(512).fill(0);
    for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
      const i = (y * out.width + x) * 4, r = g[i], gg = g[i + 1], bb = g[i + 2];
      hist[((r >> 5) << 6) | ((gg >> 5) << 3) | (bb >> 5)]++;
      const cell = grid[Math.min(GY - 1, (y * GY / out.height) | 0) * GX + Math.min(GX - 1, (x * GX / out.width) | 0)];
      cell[0] += r; cell[1] += gg; cell[2] += bb; cell[3]++;
    }
    const tot = out.width * out.height;
    return {
      dataUrl: out.toDataURL('image/png'),
      info: { kind: b.kind, hp: b.hp, active: !!b.active, bossActive: !!w.bossActive, w: b.w, h: b.h,
        name: b.def && b.def.name, theme: w.level && w.level.theme, enraged: !!b.enraged },
      sig: {
        hist: hist.map((n) => n / tot),
        grid: grid.map((c) => (c[3] ? [Math.round(c[0] / c[3]), Math.round(c[1] / c[3]), Math.round(c[2] / c[3])] : [0, 0, 0])),
      },
    };
  });
  if (!res) return null;
  return { info: res.info, sig: res.sig, png: Buffer.from(res.dataUrl.split(',')[1], 'base64') };
}

const gridDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i][0] - b[i][0]) + Math.abs(a[i][1] - b[i][1]) + Math.abs(a[i][2] - b[i][2]); return s / (a.length * 3); };
const histDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };

async function main() {
  const urlArg = process.argv.find((a) => a.startsWith('--url='));
  const TARGET_URL = urlArg ? urlArg.slice(6) : (process.env.ACCEPT_URL || null);
  const mode = TARGET_URL ? 'public' : 'local';
  const framesDir = mode === 'public' ? path.join(FRAMES_DIR, 'public') : FRAMES_DIR;
  await mkdir(framesDir, { recursive: true });

  let bootUrl, closeServer = async () => {}, killed = [];
  if (mode === 'public') { bootUrl = TARGET_URL.endsWith('/') ? TARGET_URL : TARGET_URL + '/'; }
  else { killed = killLingeringServers(); const s = await serveGame(); bootUrl = s.url; closeServer = s.close; }

  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath: findChrome(), headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb', '--window-size=520,320'],
  });
  const run = { ts: new Date().toISOString(), mode, target: bootUrl, killedProcs: killed, bosses: [], consoleErrors: [] };

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 520, height: 320, deviceScaleFactor: 1 });
    page.on('console', (m) => { if (m.type() === 'error') run.consoleErrors.push(m.text()); });
    await page.goto(bootUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForFunction('window.__booted === true', { timeout: 20000 });
    await page.waitForFunction('window.__game && window.__game.status', { timeout: 20000 });
    await page.bringToFront();
    await page.keyboard.press('Space');
    await page.waitForFunction("window.__game.status === 'playing'", { timeout: 10000 });

    for (let idx = 0; idx < EXPECTED_STAGES; idx++) {
      const num = idx + 1;
      // Drive to the boss, keeping the player parked/alive so the camera settles on it.
      let bpos = null;
      for (let k = 0; k < 8; k++) { bpos = await parkAtBoss(page); await sleep(120); }
      await sleep(300);
      const cap = await captureBoss(page);
      if (cap) {
        const theme = cap.info.theme || 'unknown';
        const nmeSafe = (cap.info.name || cap.info.kind || 'boss').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const file = path.join(framesDir, `stage-${num}-${theme}-${nmeSafe}.png`);
        await writeFile(file, cap.png);
        run.bosses.push({ stage: num, frame: path.relative(REPO, file), ...cap.info, _sig: cap.sig });
      } else {
        run.bosses.push({ stage: num, frame: null, error: 'no boss captured', theme: null });
      }

      // Advance via normal progression (force-clear boss → real N, closure fallback).
      if (idx < EXPECTED_STAGES - 1) {
        await page.evaluate(() => { const w = window.__game; if (w.boss) { w.boss.dead = true; w.boss.hp = 0; } });
        await page.waitForFunction("window.__game.status === 'cleared'", { timeout: 5000 }).catch(() => {});
        let advanced = false;
        for (let a = 0; a < 3 && !advanced; a++) {
          await page.keyboard.press('KeyN');
          advanced = await page.waitForFunction(`window.__game.status==='playing' && window.__game.stageNum===${num + 1}`, { timeout: 2500 }).then(() => true).catch(() => false);
        }
        if (!advanced) {
          await page.evaluate(() => { if (window.__game.requestNextStage) window.__game.requestNextStage(); });
          await page.waitForFunction(`window.__game.status==='playing' && window.__game.stageNum===${num + 1}`, { timeout: 4000 }).catch(() => {});
        }
      }
    }
  } finally {
    await browser.close();
    await closeServer();
  }

  // Advisory CV pre-filter: nearest-sibling palette/grid diff per boss.
  const sigs = run.bosses.map((b) => b._sig);
  const GRID_REUSE = 6.0, HIST_REUSE = 0.35;
  for (let i = 0; i < run.bosses.length; i++) {
    if (!sigs[i]) { run.bosses[i].visuallyDistinct = null; continue; }
    let minGrid = Infinity, minHist = Infinity, nearest = null; const clones = [];
    for (let j = 0; j < run.bosses.length; j++) {
      if (i === j || !sigs[j]) continue;
      const gd = gridDiff(sigs[i].grid, sigs[j].grid), hd = histDiff(sigs[i].hist, sigs[j].hist);
      if (gd < minGrid) { minGrid = gd; nearest = run.bosses[j].stage; }
      minHist = Math.min(minHist, hd);
      if (gd < GRID_REUSE && hd < HIST_REUSE) clones.push(run.bosses[j].stage);
    }
    const b = run.bosses[i];
    b.nearestSibling = nearest; b.minGridDiff = +minGrid.toFixed(2); b.minHistDiff = +minHist.toFixed(3);
    b.suspectedReuseOf = clones; b.visuallyDistinct = clones.length === 0;
    delete b._sig;
  }

  const captured = run.bosses.filter((b) => b.frame).length;
  const names = run.bosses.map((b) => b.name).filter(Boolean);
  run.bossesCaptured = `${captured}/${EXPECTED_STAGES}`;
  run.distinctNames = new Set(names).size === names.length && names.length === EXPECTED_STAGES;
  run.note = 'VERDICT IS BY LOOKING: read frames/boss/*.png and judge all 7 bosses PRESENT + visibly distinct. CV diffs are advisory only.';

  const outJson = path.join(HERE, mode === 'public' ? 'boss-fidelity-live.json' : 'boss-fidelity.json');
  await writeFile(outJson, JSON.stringify(run, null, 2));
  console.log(`boss-fidelity mode=${mode} bossesCaptured=${run.bossesCaptured} distinctNames=${run.distinctNames}`);
  for (const b of run.bosses) console.log(`  stage ${b.stage} [${b.theme}] ${b.name || '—'} kind=${b.kind} distinctCV=${b.visuallyDistinct} nearest=${b.nearestSibling}(grid ${b.minGridDiff}/hist ${b.minHistDiff})`);
  console.log(`  wrote ${path.relative(REPO, outJson)} + ${captured} boss frames → frames/boss/`);
  console.log('  NEXT: read the boss crops and judge PRESENT + distinct by looking (ACCEPTANCE.md).');
}

main().catch((e) => { console.error('boss-fidelity ERROR:', e); process.exit(2); });
