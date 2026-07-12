// boss-arena-validate.mjs — GROUND the boss-fidelity capture affordance.
//
// boss-fidelity.mjs captures each boss by FORCING it active (boss.active=true) and
// SNAPPING the camera to center it — an affordance so I don't have to hand-traverse
// the whole stage per boss. That rests on an unconfirmed assumption: "forcing the
// boss active + snapping the camera reproduces the boss's REAL arena appearance a
// player sees on natural arrival." If it produced a degraded / pre-entry / wrong
// pose, every boss frame would be misleading evidence. This harness grounds that
// assumption with a REAL side-by-side:
//
//   NATURAL  — from a param-free stage-1 boot, actually DRIVE the player right (real
//              ArrowRight + auto-hop the gaps, invulnerable so we measure appearance
//              not survival) until the boss activates ON ITS OWN (world.bossActive
//              flips true because the camera reached the arena). Capture that frame.
//   AFFORDANCE — from the same live world, apply boss-fidelity's exact affordance
//              (center player on boss → camera.follow(snap)) and capture again.
//
// Then compute a palette/grid diff of the two boss crops AND write both frames so a
// human LOOKS: does the affordance show the same boss (same sprite/silhouette/
// palette, same arena) as the natural arrival? Small diff + a matching look ⇒ the
// affordance is faithful and boss-fidelity's evidence is trustworthy. A large diff
// or a different look ⇒ report it (the affordance is misleading) — do NOT paper over.
//
// Stage 1 (the Sentinel mech) is the representative grounded case; the natural
// activation mechanism (camera-proximity gate, world.js) is identical for every
// stage, so confirming it here validates the method for all 7.
//
// Run:  node playtest/acceptance/boss-arena-validate.mjs
// Emits: playtest/acceptance/boss-arena-validate.json + frames/boss-validate/*.png

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
const OUT_DIR = path.join(HERE, 'frames', 'boss-validate');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.woff2': 'font/woff2' };

function killLingeringServers() {
  for (const pat of ['serve.mjs', 'stage-boot-music', 'go-live']) {
    try { const pids = execSync(`pgrep -f "${pat}" 2>/dev/null || true`).toString().trim(); if (pids) for (const pid of pids.split(/\s+/)) { try { execSync(`kill -9 ${pid} 2>/dev/null || true`); } catch {} } } catch {}
  }
}
async function serveGame() {
  const server = createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const full = path.join(GAME_DIR, path.normalize(rel));
      if (!full.startsWith(GAME_DIR)) { res.writeHead(403).end('forbidden'); return; }
      const body = await readFile(full);
      res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' }); res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}
function findChrome() {
  const cands = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  const cache = path.join(os.homedir(), '.cache', 'puppeteer');
  for (const kind of ['chrome', 'chrome-headless-shell']) { const base = path.join(cache, kind); if (existsSync(base)) { try { const h = execSync(`ls ${base}/*/*/${kind}* 2>/dev/null | head -1`).toString().trim(); if (h) cands.push(h); } catch {} } }
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error('No Chrome binary found');
}

// Atomic zoomed crop centered on the boss + palette/grid signature (one evaluate).
async function captureBoss(page, label) {
  const res = await page.evaluate(() => {
    const w = window.__game, c = w.camera, b = w.boss;
    if (!b) return null;
    const cv = document.getElementById('game');
    const margin = 22, size = Math.min(cv.height, Math.max(b.w, b.h) + margin * 2);
    const cx = b.x + b.w / 2 - c.x, cy = b.y + b.h / 2 - c.y;
    const sx = Math.max(0, Math.min(cv.width - size, Math.round(cx - size / 2)));
    const sy = Math.max(0, Math.min(cv.height - size, Math.round(cy - size / 2)));
    const scale = Math.max(2, Math.round(300 / size));
    const out = document.createElement('canvas'); out.width = size * scale; out.height = size * scale;
    const octx = out.getContext('2d'); octx.imageSmoothingEnabled = false;
    octx.drawImage(cv, sx, sy, size, size, 0, 0, size * scale, size * scale);
    const g = octx.getImageData(0, 0, out.width, out.height).data;
    const GX = 16, GY = 16, grid = new Array(GX * GY).fill(0).map(() => [0, 0, 0, 0]), hist = new Array(512).fill(0);
    for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
      const i = (y * out.width + x) * 4, r = g[i], gg = g[i + 1], bb = g[i + 2];
      hist[((r >> 5) << 6) | ((gg >> 5) << 3) | (bb >> 5)]++;
      const cell = grid[Math.min(GY - 1, (y * GY / out.height) | 0) * GX + Math.min(GX - 1, (x * GX / out.width) | 0)];
      cell[0] += r; cell[1] += gg; cell[2] += bb; cell[3]++;
    }
    const tot = out.width * out.height;
    return { dataUrl: out.toDataURL('image/png'),
      info: { bx: b.x, by: b.y, kind: b.kind, name: b.def && b.def.name, active: !!b.active, bossActive: !!w.bossActive, camx: Math.round(c.x) },
      sig: { hist: hist.map((n) => n / tot), grid: grid.map((cc) => (cc[3] ? [Math.round(cc[0] / cc[3]), Math.round(cc[1] / cc[3]), Math.round(cc[2] / cc[3])] : [0, 0, 0])) } };
  });
  if (!res) return null;
  await writeFile(path.join(OUT_DIR, `${label}.png`), Buffer.from(res.dataUrl.split(',')[1], 'base64'));
  return res;
}
const gridDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i][0] - b[i][0]) + Math.abs(a[i][1] - b[i][1]) + Math.abs(a[i][2] - b[i][2]); return s / (a.length * 3); };
const histDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s; };

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  killLingeringServers();
  const server = await serveGame();
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--force-color-profile=srgb', '--window-size=520,320', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const run = { ts: new Date().toISOString(), stage: 1, note: 'grounds boss-fidelity affordance vs natural arrival (stage 1 Sentinel)' };
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 520, height: 320, deviceScaleFactor: 1 });
    await page.goto(server.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction('window.__booted === true', { timeout: 20000 });
    await page.waitForFunction("window.__game && window.__game.status", { timeout: 20000 });
    await page.bringToFront();
    await page.keyboard.press('Space');
    await page.waitForFunction("window.__game.status === 'playing'", { timeout: 10000 });

    // NATURAL: drive right + auto-hop gaps (invulnerable) until the boss wakes on its own.
    await page.keyboard.down('ArrowRight');
    let natural = false;
    for (let t = 0; t < 240 && !natural; t++) { // ~240 * 100ms budget
      const st = await page.evaluate(() => {
        const w = window.__game, p = w.player; p.iframe = 999999; p.dead = false;
        // hop when there's no ground just ahead of the feet (clears water/chasm gaps)
        const aheadX = p.x + p.w + 14, footY = p.y + p.h + 4;
        const groundAhead = w.solids.some((g) => g.kind === 'ground' && aheadX >= g.x && aheadX <= g.x + g.w && footY >= g.y && footY <= g.y + g.h + 4);
        return { grounded: p.grounded, groundAhead, bossActive: !!w.bossActive, px: Math.round(p.x) };
      });
      if (st.bossActive) { natural = true; break; }
      if (st.grounded && !st.groundAhead) { await page.keyboard.down('Space'); await sleep(90); await page.keyboard.up('Space'); }
      await sleep(90);
    }
    run.reachedNaturally = natural;
    // bossActive flips the INSTANT the boss enters camR+margin — but at that moment
    // the camera is still lerping and the boss is at the far right edge. A real
    // player keeps advancing to the arena BARRIER (the firing line) and the camera
    // settles with the boss on screen. Keep driving right until the player is pinned
    // at the barrier AND the camera has stopped moving, THEN capture — that is the
    // appearance the player actually fights in.
    let prevCam = -1, settleFrames = 0;
    for (let t = 0; t < 60 && settleFrames < 4; t++) {
      const cam = await page.evaluate(() => { const w = window.__game; w.player.iframe = 999999; w.player.dead = false; return Math.round(w.camera.x); });
      settleFrames = Math.abs(cam - prevCam) <= 1 ? settleFrames + 1 : 0;
      prevCam = cam;
      await sleep(80);
    }
    await page.keyboard.up('ArrowRight');
    await page.evaluate(() => { window.__game.player.iframe = 999999; });
    await sleep(200);
    const nat = await captureBoss(page, 'stage1-natural');
    run.natural = nat && nat.info;

    // AFFORDANCE: boss-fidelity's exact move — center player on boss, snap camera.
    await page.evaluate(() => {
      const w = window.__game, p = w.player;
      if (w.boss) { const b = w.boss; b.active = true; p.x = b.x + b.w / 2 - 58 - p.w / 2; p.vx = 0; p.vy = 0;
        const cx = p.x + p.w / 2; const ground = w.solids.find((s) => s.kind === 'ground' && cx >= s.x && cx <= s.x + s.w); if (ground) p.y = ground.y - p.h;
        p.iframe = 999999; if (w.camera && w.camera.follow) w.camera.follow(p, true); }
    });
    await sleep(250);
    const aff = await captureBoss(page, 'stage1-affordance');
    run.affordance = aff && aff.info;

    if (nat && aff) {
      run.gridDiff = +gridDiff(nat.sig.grid, aff.sig.grid).toFixed(2);
      run.histDiff = +histDiff(nat.sig.hist, aff.sig.hist).toFixed(3);
      run.sameBossName = nat.info.name === aff.info.name;
    }
  } finally {
    await browser.close();
    await server.close();
  }

  await writeFile(path.join(HERE, 'boss-arena-validate.json'), JSON.stringify(run, null, 2));
  console.log(`boss-arena-validate: reachedNaturally=${run.reachedNaturally} sameBoss=${run.sameBossName} gridDiff=${run.gridDiff} histDiff=${run.histDiff}`);
  console.log(`  natural: ${JSON.stringify(run.natural)}`);
  console.log(`  affordance: ${JSON.stringify(run.affordance)}`);
  console.log('  NEXT: LOOK at frames/boss-validate/stage1-{natural,affordance}.png — same boss appearance?');
}

main().catch((e) => { console.error('boss-arena-validate ERROR:', e); process.exit(2); });
