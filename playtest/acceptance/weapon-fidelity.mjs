// weapon-fidelity.mjs — player-POV verification of the creator-rejected
// TWO-WEAPON defect (CREATOR_FEEDBACK.md round 2).
//
// THE DEFECT (verbatim, the gate that keeps the build REJECTED until fixed):
//   Each entity (the hero `player_*` AND the purple turret/cannon) showed TWO
//   weapons on screen — a weapon BAKED INTO THE SPRITE ART (fixed direction) plus a
//   PROCEDURAL code-drawn weapon overlaid on top that aims. The creator wants
//   exactly ONE weapon per entity, drawn where the shot actually goes. The creator
//   was explicit: "Verify by looking: one weapon per entity" and "do not
//   self-certify from frame comparison alone — the human eye caught what the vision
//   score missed."
//
// WHY THIS HARNESS (my slice): scope_served proves the campaign spine + biome
// distinctness, but never checks the two-weapon defect from a PLAYER's eyes. This
// drives the LIVE build, makes the hero actually FIRE in each aim pose and a turret
// actually fire, and captures a ZOOMED crop of each weapon straight off the live
// <canvas>. The crop PNGs are the evidence a human (or this multimodal loop) READS
// to render the real verdict: is there ONE gun per entity, at its hands/barrel,
// pointing where it fires — or two? CV here is only a pre-filter; the LOOK decides.
//
// This is a FACTS-vs-judgments boundary: the harness computes FACTS (which pose,
// weapon key, whether a shot/muzzle was live at capture) and produces the frames;
// the "one weapon, correctly placed" JUDGMENT is made by looking, recorded in
// ACCEPTANCE.md. A defect seen here is filed as an OPEN ISSUE, never smoothed over.
//
// Run (from repo root):
//   node playtest/acceptance/weapon-fidelity.mjs          # local served game/
//   node playtest/acceptance/weapon-fidelity.mjs --url=<public URL>
// Emits: playtest/acceptance/weapon-fidelity.json (+ frames/weapon/*.png)

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const GAME_DIR = path.join(REPO, 'game');
const FRAMES_DIR = path.join(HERE, 'frames', 'weapon');

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

// ATOMIC entity capture: read the entity's LIVE screen position AND crop a zoomed
// window around it in the SAME evaluate, so there is ZERO drift between the
// position read and the pixels grabbed (critical for running/prone poses where the
// hero moves or changes height frame-to-frame). Returns { info, png } where png is
// a crisp nearest-neighbor upscale of the real rendered weapon. `pick` runs in the
// page and returns the target entity + its center, or null.
async function captureEntity(page, pick, size, scale) {
  const res = await page.evaluate((pickSrc, size, scale) => {
    const w = window.__game, c = w.camera;
    const pick = eval('(' + pickSrc + ')');
    const t = pick(w, c);
    if (!t) return null;
    const cx = t.cx, cy = t.cy;
    const cv = document.getElementById('game');
    const sx = Math.max(0, Math.min(cv.width - size, Math.round(cx - size / 2)));
    const sy = Math.max(0, Math.min(cv.height - size, Math.round(cy - size / 2)));
    const out = document.createElement('canvas');
    out.width = size * scale; out.height = size * scale;
    const octx = out.getContext('2d');
    octx.imageSmoothingEnabled = false;
    octx.drawImage(cv, sx, sy, size, size, 0, 0, size * scale, size * scale);
    return { info: t.info, dataUrl: out.toDataURL('image/png') };
  }, pick.toString(), size, scale);
  if (!res) return null;
  return { info: res.info, png: Buffer.from(res.dataUrl.split(',')[1], 'base64') };
}

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
  const run = { ts: new Date().toISOString(), mode, target: bootUrl, killedProcs: killed, captures: [], consoleErrors: [] };

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

    // Helper: hold a set of keys, keep the hero invincible + firing, settle, then
    // capture N crops centered on the player (to catch a muzzle-flash frame).
    const releaseAll = async () => { for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyX']) await page.keyboard.up(k).catch(() => {}); };

    // The hero picker — center on the player, report weapon/aim state. Runs in-page.
    const heroPick = (w, c) => {
      const p = w.player;
      // Anchor the crop to the FEET (stable across stand/prone, since prone keeps
      // the feet planted and only shrinks the top). Center ~20px above the feet so
      // the whole body + the held weapon sit inside the window in either stance.
      const feetY = p.y + p.h;
      return {
        cx: p.x + p.w / 2 - c.x,
        cy: feetY - 22 - c.y,
        info: {
          weaponKey: p.weaponKey, facing: p.facing,
          aiming: p.aim || p.aimDir || (p.aimUp ? 'up' : null),
          prone: !!p.prone, bullets: w.bullets.length,
        },
      };
    };

    async function heroPose(label, keys, shots = 3) {
      await releaseAll();
      await page.evaluate(() => { window.__game.player.iframe = 99999; }); // survive the fire window
      for (const k of keys) await page.keyboard.down(k);
      await page.keyboard.down('KeyX'); // fire
      await sleep(360);
      for (let i = 0; i < shots; i++) {
        // CRITICAL: iframe>0 makes render.js:1253 SKIP drawing the hero on alternate
        // 4-frame windows (the arcade invuln BLINK) — so a capture landing on a
        // blink-off frame is EMPTY. Zero iframe and let a couple frames render the
        // hero SOLID before grabbing, then restore invuln so he survives the rest of
        // the pose. (Near spawn the hero can't be hit in this brief window.)
        await page.evaluate(() => { window.__game.player.iframe = 0; });
        await sleep(70);
        const cap = await captureEntity(page, heroPick, 64, 6);
        if (cap) {
          const file = path.join(framesDir, `hero-${label}-${i}.png`);
          await writeFile(file, cap.png);
          run.captures.push({ entity: 'hero', pose: label, frame: path.relative(REPO, file), ...cap.info });
        }
        await page.evaluate(() => { window.__game.player.iframe = 99999; });
        await sleep(90);
      }
      await releaseAll();
    }

    // HERO — the always-visible case. Fire in the canonical aim poses.
    await heroPose('aim-right', []);                       // straight ahead
    await heroPose('aim-up', ['ArrowUp']);                 // vertical
    await heroPose('aim-diag-up', ['ArrowUp', 'ArrowRight']); // 8-way diagonal (running)
    await heroPose('prone', ['ArrowDown']);                // prone shot

    // TURRET — drive right to the stage-1 turret (x≈500) and capture it firing.
    // Keep the hero alive; stop just left of it so both are on screen.
    await releaseAll();
    await page.evaluate(() => { window.__game.player.iframe = 99999; });
    const turretPick = (w, c) => {
      const tur = w.enemies.find((e) => (e.kind === 'turret' || e.kind === 'cannon') && !e.dead && e.x - c.x > 20 && e.x - c.x < 460);
      if (!tur) return null;
      return { cx: tur.x + tur.w / 2 - c.x, cy: tur.y + tur.h / 2 - c.y, info: { kind: tur.kind, active: !!tur.active, px: Math.round(w.player.x) } };
    };
    let turretShot = false;
    for (let step = 0; step < 60 && !turretShot; step++) {
      await page.keyboard.down('ArrowRight');
      await sleep(120);
      const probe = await page.evaluate((pickSrc) => { const w = window.__game, c = w.camera; const t = eval('(' + pickSrc + ')')(w, c); return t ? t.info : null; }, turretPick.toString());
      if (probe && probe.active) {
        await page.keyboard.up('ArrowRight');
        await page.evaluate(() => { window.__game.player.iframe = 99999; });
        for (let i = 0; i < 4; i++) {
          const cap = await captureEntity(page, turretPick, 52, 6);
          if (cap) {
            const file = path.join(framesDir, `turret-${i}.png`);
            await writeFile(file, cap.png);
            run.captures.push({ entity: 'turret', pose: `at-x${cap.info.px}`, frame: path.relative(REPO, file), ...cap.info });
          }
          await sleep(140);
        }
        turretShot = true;
      }
    }
    await releaseAll();
    run.turretCaptured = turretShot;
  } finally {
    await browser.close();
    await closeServer();
  }

  // Pre-filter FACTS only (advisory). The verdict is by LOOKING at the crops.
  run.heroPoses = [...new Set(run.captures.filter((c) => c.entity === 'hero').map((c) => c.pose))];
  run.heroWeaponKeys = [...new Set(run.captures.filter((c) => c.entity === 'hero').map((c) => c.weaponKey))];
  run.note = 'VERDICT IS BY LOOKING: read frames/weapon/*.png and assert exactly ONE weapon per entity, drawn where it fires (CREATOR_FEEDBACK.md round 2). CV cannot make this call.';

  const outJson = path.join(HERE, mode === 'public' ? 'weapon-fidelity-live.json' : 'weapon-fidelity.json');
  await writeFile(outJson, JSON.stringify(run, null, 2));
  console.log(`weapon-fidelity mode=${mode} captures=${run.captures.length} heroPoses=${run.heroPoses.join(',')} turretCaptured=${run.turretCaptured}`);
  console.log(`  heroWeaponKeys=${run.heroWeaponKeys.join(',')}`);
  console.log(`  wrote ${path.relative(REPO, outJson)} + ${run.captures.length} zoomed crops → frames/weapon/`);
  console.log('  NEXT: read the crops and judge ONE-weapon-per-entity by looking (see ACCEPTANCE.md).');
}

main().catch((e) => { console.error('weapon-fidelity ERROR:', e); process.exit(2); });
