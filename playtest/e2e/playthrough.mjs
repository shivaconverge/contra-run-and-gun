#!/usr/bin/env node
// playthrough.mjs — drive the LIVE browser build as a first-time player and
// assert every state transition, capturing a real native-resolution PNG + the
// live world snapshot at each beat. This is grounding evidence, not self-report.
//
//   node playtest/e2e/playthrough.mjs
//
// Output:
//   playtest/frames/live/NN-<state>.png   one real frame per state
//   playtest/frames/live/results.json     machine-readable pass/fail + snapshots
//   console: PASS/FAIL per assertion; process exits 1 if any assertion FAILS
//            (we do NOT mask defects to stay green — a red assertion is the bug report).

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveGame, findChrome, loadPuppeteer, sleep } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..', 'frames', 'live');

const results = [];   // { id, ok, detail, critical }
const snapshots = {}; // state -> world snapshot
let feel = null;      // wall-clock feel/cadence measurements (populated late)
let sfx = null;       // live SFX-wiring evidence (populated late)
let weapons = null;   // per-weapon live fire-signature evidence (populated late)
let bossEnrage = null; // live boss phase-2 enrage transition evidence (populated late)
let creatorApproval = null; // creator-approval panel presence + functional-contract evidence
let frameNo = 0;

function assert(id, ok, detail, critical = true) {
  results.push({ id, ok: !!ok, detail: String(detail), critical });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  —  ${detail}`);
}

// Read the live world. main.js exposes window.__game = world (the real sim).
async function snap(page) {
  return page.evaluate(() => {
    const w = window.__game;
    if (!w) return null;
    const p = w.player;
    return {
      status: w.status,
      lives: w.lives,
      score: w.score,
      frame: w.frame,
      onScreenEnemies: w.onScreenEnemies,
      enemiesAlive: w.enemies.length,
      bullets: w.bullets.length,
      playerBullets: w.bullets.filter((b) => b.from === 'player').length,
      bossActive: w.bossActive,
      bossAlive: !!(w.boss && !w.boss.dead),
      px: Math.round(p.x), py: Math.round(p.y),
      pvx: +p.vx.toFixed(2), pvy: +p.vy.toFixed(2),
      ph: p.h, prone: p.prone, dead: p.dead,
      aimx: p.aim.x, aimy: p.aim.y, facing: p.facing,
      grounded: !!p.grounded, weapon: p.weaponKey,
      // Difficulty/mode state (arcade one-hit vs casual shield) — drives the
      // title mode-select assertions and confirms one-hit death is armed.
      mode: w.modeKey || null,
      shield: typeof p.shield === 'number' ? p.shield : null,
      fps: w.__fps || null,
      // Live game-feel state, read straight off the sim's feel kernel.
      // hitStop = frames the whole sim is frozen; trauma = 0..1 shake driver.
      hitStop: w.feel ? w.feel.hitStop : null,
      trauma: w.feel ? +w.feel.trauma.toFixed(3) : null,
    };
  });
}

// Poll the live world every ~15ms for `ms`, returning a time series of
// { t (wall-clock ms), frame, playerBullets, hitStop, trauma }. This lets us
// MEASURE feel/cadence in wall-clock off the live rAF loop instead of trusting
// a single end-of-hold snapshot (hit-stop and bullet spawns are transient).
async function timeSeries(page, ms, keysDown = []) {
  for (const k of keysDown) await page.keyboard.down(k);
  const series = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await page.evaluate(() => {
      const w = window.__game;
      if (!w) return null;
      return {
        frame: w.frame,
        playerBullets: w.bullets.filter((b) => b.from === 'player').length,
        hitStop: w.feel ? w.feel.hitStop : 0,
        trauma: w.feel ? w.feel.trauma : 0,
      };
    });
    if (s) series.push({ t: Date.now() - t0, ...s });
    await sleep(15);
  }
  for (const k of keysDown) await page.keyboard.up(k).catch(() => {});
  return series;
}

// Capture the canvas at NATIVE 480x270 (toDataURL, not a scaled screenshot).
async function capture(page, state) {
  const dataUrl = await page.evaluate(() => {
    const c = document.getElementById('game');
    return c ? c.toDataURL('image/png') : null;
  });
  if (!dataUrl) return null;
  const file = path.join(OUT, `${String(++frameNo).padStart(2, '0')}-${state}.png`);
  await writeFile(file, Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  return path.basename(file);
}

// Capture a canvas frame under a FIXED name (no sequence counter) — for side
// evidence like per-weapon shots that shouldn't renumber the main state frames.
async function captureNamed(page, name) {
  const dataUrl = await page.evaluate(() => {
    const c = document.getElementById('game');
    return c ? c.toDataURL('image/png') : null;
  });
  if (!dataUrl) return null;
  await writeFile(path.join(OUT, `${name}.png`),
    Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  return `${name}.png`;
}

async function state(page, name) {
  const s = await snap(page);
  snapshots[name] = s;
  const file = await capture(page, name);
  console.log(`[state:${name}] frame=${file} ${JSON.stringify(s)}`);
  return s;
}

// Hold keys down for a duration while the live rAF loop runs, then read state.
async function hold(page, keys, ms) {
  for (const k of keys) await page.keyboard.down(k);
  await sleep(ms);
}
async function release(page, keys) {
  for (const k of keys) await page.keyboard.up(k).catch(() => {});
}
async function tap(page, key, ms = 60) {
  await page.keyboard.down(key);
  await sleep(ms);
  await page.keyboard.up(key);
}

// Hold keys for `ms`, polling the world every ~40ms, and return the peak of a
// chosen field seen DURING the hold (bullets/particles are transient — a single
// end-of-hold snapshot misses them). Keys are released afterward.
async function holdAndWatch(page, keys, ms, pick) {
  for (const k of keys) await page.keyboard.down(k);
  let peak = -Infinity, deadSeen = false;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await snap(page);
    if (s) {
      const v = pick(s);
      if (v > peak) peak = v;
      if (s.dead) deadSeen = true;
    }
    await sleep(40);
  }
  for (const k of keys) await page.keyboard.up(k).catch(() => {});
  return { peak, deadSeen };
}

// Restart to a clean spawn (R -> world.reset). Enemies are dormant/far for the
// first ~1.5s, so each mechanic kata runs on a safe fresh slate.
async function freshRun(page) {
  await page.keyboard.press('KeyR');
  await sleep(300);
}

// Inspect the live world for the aerial 'flyer' drones: how many are alive, and
// whether any is on-screen AND airborne (well above the ground line). Reads real
// per-enemy state off the sim — the flyer is a distinct vertical-threat KIND the
// ground-enemy encounter never exercises.
async function flyerScan(page) {
  return page.evaluate(() => {
    const w = window.__game;
    if (!w) return null;
    const camL = w.camera.x, camR = camL + 480; // SIM.VIEW_W
    const flyers = w.enemies.filter((e) => e.kind === 'flyer');
    const alive = flyers.filter((e) => !e.dead);
    const onScreenAirborne = alive.filter((e) => e.x + e.w > camL && e.x < camR && e.y < 200);
    // First on-screen flyer's position (for seeding the player beneath it).
    const first = onScreenAirborne[0] || alive[0] || flyers[0] || null;
    return {
      total: flyers.length,
      alive: alive.length,
      onScreenAirborne: onScreenAirborne.length,
      minY: alive.length ? Math.min(...alive.map((e) => Math.round(e.y))) : null,
      firstX: first ? Math.round(first.x) : null,
    };
  });
}

// BOSS-3 probe: measure the redness (R−B) of the boss sprite's TRUE TRANSPARENT
// margin — the TOP-LEFT/TOP-RIGHT corners of the glow bounding-rect, which a
// centered mech never occupies — vs a far background strip at the same screen-y.
// If the enrage heat-glow is masked to the sprite (intended), the corners match
// background (excess≈0). If drawn as an unmasked fillRect over the whole rect, the
// corners get a red wash → a rectangular halo (excess high). A pixel FACT of the
// intended-masking behavior, NOT an aesthetic judgment.
//   NB: we sample the CORNERS, not the top-center — center overlaps the mech's head
//   (which correctly glows on-sprite), which would be a false positive. Corners
//   isolate the transparent margin the box would light up.
async function bossGlowExcess(page) {
  return page.evaluate(() => {
    const w = window.__game, b = w.boss;
    if (!b) return null;
    const ctx = document.getElementById('game').getContext('2d');
    const img = window.__assets && window.__assets.images &&
      (window.__assets.images.boss_enraged || window.__assets.images.boss);
    const scale = (b.h * 1.4) / (img ? img.height : b.h);
    const dw = (img ? img.width : b.w) * scale, dh = (img ? img.height : b.h) * scale;
    const cx = b.x + b.w / 2;
    const dx = Math.round(cx - dw / 2 - w.camera.x), dy = Math.round((b.y + b.h) - dh);
    const patch = (x0, y0, s = 8) => {
      const d = ctx.getImageData(Math.max(0, x0), Math.max(0, y0), s, s).data; let r = 0, bl = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; bl += d[i + 2]; n++; }
      return (r - bl) / n;
    };
    const tl = patch(dx + 1, dy + 1);                        // top-left transparent corner
    const tr = patch(dx + Math.round(dw) - 9, dy + 1);       // top-right transparent corner
    const bg = patch(30, dy + 2);                            // far-left night sky, same y
    const worst = Math.max(tl, tr);                          // the box reddens BOTH corners
    return { enraged: !!b.enraged, cornerTL: +tl.toFixed(1), cornerTR: +tr.toFixed(1),
      marginRedness: +worst.toFixed(1), bgRedness: +bg.toFixed(1), excess: +(worst - bg).toFixed(1) };
  });
}

// Save a 4× zoom of the boss glow-rect region as crisp defect evidence.
async function captureBossZoom(page, name) {
  const durl = await page.evaluate(() => {
    const w = window.__game, b = w.boss, src = document.getElementById('game');
    const gt = b.y + b.h, dh = b.h * 1.4, cx = b.x + b.w / 2;
    const sx = Math.round(cx - w.camera.x - 40), sy = Math.round(gt - dh - 10), sw = 100, sh = Math.round(dh + 24);
    const z = document.createElement('canvas'); z.width = sw * 4; z.height = sh * 4;
    const zx = z.getContext('2d'); zx.imageSmoothingEnabled = false;
    zx.drawImage(src, sx, sy, sw, sh, 0, 0, sw * 4, sh * 4);
    return z.toDataURL('image/png');
  });
  if (!durl) return null;
  await writeFile(path.join(OUT, `${name}.png`), Buffer.from(durl.replace(/^data:image\/png;base64,/, ''), 'base64'));
  return `${name}.png`;
}

// Hold fire for `ms` and return the SIGNATURE of the player bullets actually in
// flight — peak count, the union of bullet colors/flags seen. Each weapon spawns
// bullets carrying its own color/pierce/wave/damage (player.js), so this reads the
// REAL projectile identity, not just the weapon label.
async function fireSignature(page, ms = 480) {
  await page.keyboard.down('KeyX');
  let peakCount = 0, maxDamage = 0, pierce = false, wave = false;
  const colors = new Set();
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await page.evaluate(() => {
      const pb = window.__game.bullets.filter((b) => b.from === 'player');
      return {
        count: pb.length,
        colors: [...new Set(pb.map((b) => b.color))],
        pierce: pb.some((b) => b.pierce === true),
        wave: pb.some((b) => b.wave === true),
        maxDamage: pb.reduce((m, b) => Math.max(m, b.damage), 0),
      };
    });
    if (s.count > peakCount) peakCount = s.count;
    s.colors.forEach((c) => colors.add(c));
    pierce = pierce || s.pierce; wave = wave || s.wave; maxDamage = Math.max(maxDamage, s.maxDamage);
    await sleep(30);
  }
  await page.keyboard.up('KeyX');
  return { peakCount, colors: [...colors], pierce, wave, maxDamage };
}

// Seed the player onto a level pickup (ground pickups only) under spawn i-frames
// and let the real sim's AABB overlap COLLECT it — verifies the pickup is
// reachable and swaps the weapon. Returns {weapon, pickupsBefore, pickupsAfter}.
async function armViaPickup(page, pickupX) {
  await freshRun(page);
  const before = await page.evaluate((px) => {
    const w = window.__game;
    w.player.x = px; w.player.iframe = 200; // safe setup; real collect happens on overlap
    return w.pickups.length;
  }, pickupX);
  await sleep(300); // let the overlap register and the pickup get consumed
  const after = await page.evaluate(() => ({ weapon: window.__game.player.weaponKey, pickups: window.__game.pickups.length }));
  return { weapon: after.weapon, pickupsBefore: before, pickupsAfter: after.pickups };
}

// --- Live SFX wiring probe ------------------------------------------------
// The sim emits named SFX events; the live rAF loop drains them each frame and
// calls window.__audio.play(name) (main.js). We wrap that method IN THE PAGE so
// we capture exactly what the real loop dispatched — end-to-end wiring evidence,
// independent of whether headless Chrome actually renders sound. We do NOT edit
// game/: this is harness-side instrumentation of a public window hook.
async function installSfxProbe(page) {
  return page.evaluate(() => {
    if (!window.__audio || typeof window.__audio.play !== 'function') return false;
    window.__sfxLog = [];
    const orig = window.__audio.play.bind(window.__audio);
    window.__audio.play = (name) => { window.__sfxLog.push(name); return orig(name); };
    return true;
  });
}
async function clearSfx(page) { await page.evaluate(() => { window.__sfxLog = []; }); }
async function readSfx(page) { return page.evaluate(() => (window.__sfxLog || []).slice()); }

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const srv = await serveGame();
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
    defaultViewport: { width: 960, height: 540 },
  });

  const consoleLog = [];
  const pageErrors = [];
  const page = await browser.newPage();
  page.on('console', (m) => consoleLog.push({ type: m.type(), text: m.text(), url: m.location()?.url || '' }));
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('requestfailed', (r) => pageErrors.push(`requestfailed ${r.url()} ${r.failure()?.errorText}`));

  try {
    // ---- STATE 1: title / boot -------------------------------------------
    await page.goto(`${srv.url}/index.html`, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForFunction(() => !!window.__game, { timeout: 15000 });
    await sleep(400);
    const boot = await state(page, 'boot');
    assert('boot.worldExists', !!boot, `world present`);
    // No console errors on boot.
    assert('boot.noPageErrors', pageErrors.length === 0, `errors=${JSON.stringify(pageErrors)}`);
    // Sprites actually loaded (window.__assets.missing empty).
    const missing = await page.evaluate(() => (window.__assets ? window.__assets.missing : ['no-assetstore']));
    assert('boot.spritesLoaded', Array.isArray(missing) && missing.length === 0, `missing=${JSON.stringify(missing)}`);
    // Arcade entry gate: the build now boots onto a title/start screen (PR#34).
    // The rendered canvas carries the prompt text, so the DOM innerText check is
    // relaxed to the world status + the on-canvas title; we assert status='title'.
    const hasTitleGate = boot && boot.status === 'title';
    assert('title.startGateExists', hasTitleGate,
      `title/start gate present: status='${boot.status}' (arcade insert-coin entry)`, true);
    // Boots into the ARCADE default (one-hit death, no shield) — the Contra invariant.
    assert('title.bootsArcadeDefault', boot.mode === 'arcade' && boot.lives === 3 && boot.shield === 0,
      `mode=${boot.mode} lives=${boot.lives} shield=${boot.shield} (intended arcade/3/0)`);
    // Wrap the live audio hook so later drives can prove SFX wiring end-to-end.
    const sfxProbe = await installSfxProbe(page);
    assert('audio.hookPresent', sfxProbe, `window.__audio.play present & wrapped=${sfxProbe}`, false);

    // ---- STATE 1b: title MODE SELECT (live, on the title screen) ----------
    // Digit2 → CASUAL (shield + extra lives); mode-select must NOT start play.
    await tap(page, 'Digit2', 60); await sleep(120);
    const casual = await state(page, 'title-casual');
    assert('title.modeSelectCasual',
      casual.status === 'title' && casual.mode === 'casual' && casual.lives === 5 && casual.shield === 2,
      `after Digit2: status=${casual.status} mode=${casual.mode} lives=${casual.lives} shield=${casual.shield} (intended title/casual/5/2)`);
    // Digit1 → back to ARCADE (leaves us armed for the one-hit-death katas below).
    await tap(page, 'Digit1', 60); await sleep(120);
    const arcade = await snap(page);
    assert('title.modeSelectArcade',
      arcade.status === 'title' && arcade.mode === 'arcade' && arcade.lives === 3 && arcade.shield === 0,
      `after Digit1: status=${arcade.status} mode=${arcade.mode} lives=${arcade.lives} (intended title/arcade/3)`);

    // ---- STATE 1c: START transition (title → playing on a START key) ------
    // The canonical arcade entry: a first-time player presses Start and play begins.
    await tap(page, 'Enter', 60); await sleep(150);
    const started = await state(page, 'start-play');
    assert('title.startTransitions', started.status === 'playing',
      `START (Enter) on title → status=${started.status} (intended playing)`);

    // Each mechanic runs as a KATA on a fresh spawn: enemies are dormant/far
    // for the first ~1.5s so we isolate the mechanic without dying mid-check.

    // ---- STATE 2: run right ----------------------------------------------
    await freshRun(page);
    const x0 = (await snap(page)).px;
    await hold(page, ['ArrowRight'], 700);
    const run = await state(page, 'run-right');
    await release(page, ['ArrowRight']);
    assert('move.right', run.px > x0 + 20, `x ${x0} -> ${run.px}`);
    assert('move.facingRight', run.facing === 1, `facing=${run.facing}`);

    // ---- STATE 3: jump ---------------------------------------------------
    await freshRun(page);
    const beforeJump = await snap(page);
    await page.keyboard.down('Space');
    await sleep(100); // sample early in the arc
    const midJump = await snap(page);
    await state(page, 'jump');
    await page.keyboard.up('Space');
    assert('jump.leavesGround', (midJump.pvy < 0 || midJump.py < beforeJump.py) && !midJump.grounded,
      `vy ${beforeJump.pvy}->${midJump.pvy}, y ${beforeJump.py}->${midJump.py}, grounded=${midJump.grounded}`);
    await sleep(500); // let it land

    // ---- STATE 4: aim up -------------------------------------------------
    await freshRun(page);
    await hold(page, ['ArrowUp'], 180);
    const aim = await state(page, 'aim-up');
    await release(page, ['ArrowUp']);
    assert('aim.up', aim.aimy < 0, `aim=(${aim.aimx},${aim.aimy})`);

    // ---- STATE 5: prone / duck ------------------------------------------
    await freshRun(page);
    await hold(page, ['ArrowDown'], 220);
    const prone = await state(page, 'prone');
    assert('prone.engages', prone.prone === true, `prone=${prone.prone}`);
    assert('prone.shrinksHitbox', prone.ph < boot.ph, `h ${boot.ph} -> ${prone.ph}`);
    await release(page, ['ArrowDown']);

    // ---- STATE 6: fire ---------------------------------------------------
    // Fire in place at spawn (safe). Watch for a real player bullet in flight —
    // NO fallback: if no bullet is ever seen, this FAILS honestly.
    await freshRun(page);
    const fireWatch = await holdAndWatch(page, ['KeyX'], 400, (s) => s.playerBullets);
    const fire = await state(page, 'fire');
    assert('fire.spawnsBullets', fireWatch.peak > 0, `peak player bullets in flight=${fireWatch.peak}`);

    // ---- STATE 7: enemy encounter + kill --------------------------------
    // Stand near spawn and fire RIGHT: bullets reach the dormant cluster-1
    // grunts (x~320, within rifle range) and drop them — score rises, count
    // falls. This is the run-and-gun core proven through live input.
    await freshRun(page);
    const encStart = await snap(page);
    const encWatch = await holdAndWatch(page, ['KeyX'], 2500, (s) => s.onScreenEnemies);
    const enc = await state(page, 'enemy-encounter');
    assert('enemy.onScreen', encWatch.peak > 0 || encStart.onScreenEnemies > 0,
      `peak on-screen enemies=${Math.max(encWatch.peak, encStart.onScreenEnemies)}`);
    assert('enemy.killable', enc.score > encStart.score && enc.enemiesAlive < encStart.enemiesAlive,
      `score ${encStart.score}->${enc.score}, alive ${encStart.enemiesAlive}->${enc.enemiesAlive}`);

    // ---- STATE 7b: FLYER (aerial drone) encounter -----------------------
    // The flyer is a new enemy KIND (PR#59/60): a hovering aerial drone that adds
    // a VERTICAL threat the ground grunts/turrets don't. It spawns high (level1
    // x~900/1600, y~120) and, once the player is within `standoff`, holds station
    // bobbing overhead. We drive the ENCOUNTER (not the ~900px traversal grind, a
    // long flaky live run): seed the player beneath the drone — a documented setup
    // shortcut like the game-over `lives=0` — under real spawn i-frames, confirm a
    // flyer is on-screen AND airborne, then AIM UP + fire to drop it (hp=2). The
    // flyer's hover/strafe and our bullets are the REAL sim; only the position is set.
    await freshRun(page);
    // Wake the flyer zone: put the player under the first flyer so the camera
    // reveals it and it settles overhead (within standoff → bobs, doesn't flee).
    const seeded = await page.evaluate(() => {
      const w = window.__game;
      const f = w.enemies.find((e) => e.kind === 'flyer');
      if (!f) return { ok: false };
      w.player.x = Math.round(f.x); // directly beneath → vertical fire connects
      w.player.iframe = 120;        // keep setup safe (real spawn-protect is ~90)
      return { ok: true, flyerX: Math.round(f.x) };
    });
    assert('flyer.spawnsInLevel', seeded.ok, `a 'flyer' enemy is authored in level1 (x=${seeded.flyerX})`);
    await sleep(200); // let the camera follow + the drone settle overhead
    const fBefore = await flyerScan(page);
    assert('flyer.onScreenAirborne', !!fBefore && fBefore.onScreenAirborne > 0,
      `flyer on-screen & airborne: ${JSON.stringify(fBefore)} (aerial, y<200 vs ground 236)`);
    // Aim UP and fire to kill the overhead drone (hp=2). Watch the alive count drop.
    let flyerKilled = false;
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('KeyX');
    for (let i = 0; i < 60 && !flyerKilled; i++) {
      const fs = await flyerScan(page);
      if (fs && fBefore && fs.alive < fBefore.alive) flyerKilled = true;
      await sleep(50);
    }
    await page.keyboard.up('KeyX');
    await page.keyboard.up('ArrowUp');
    await state(page, 'flyer');
    assert('flyer.killable', flyerKilled,
      `aimed-up fire dropped an aerial flyer: alive ${fBefore && fBefore.alive} -> killed=${flyerKilled}`);

    // ---- STATE 7c: WEAPON ROSTER (pickup + distinct fire signature) ------
    // The build ships 5 weapons (rifle default + spread/machine/laser/fire), each
    // with its own projectile identity in the data. Rifle is proven at STATE 6.
    // Here we verify the NEW four are (a) acquired and (b) fire their SIGNATURE —
    // reading the real bullet color/pellets/pierce/wave off the sim, not a label.
    // spread/machine/laser sit on GROUND pickups → acquired via real live pickup;
    // fire's pickup is on a high platform, so it's armed via the engine's own
    // setWeapon() QA hook (same one the boss scenario uses) and its wave verified.
    weapons = {};
    // spread — 5-pellet fan, cyan bullets.
    const spr = await armViaPickup(page, 210);
    assert('weapon.spread.pickup', spr.weapon === 'spread' && spr.pickupsAfter < spr.pickupsBefore,
      `walked onto spread pickup → weapon=${spr.weapon}, pickups ${spr.pickupsBefore}->${spr.pickupsAfter}`);
    const sprSig = await fireSignature(page);
    weapons.spread = sprSig;
    assert('weapon.spread.signature', sprSig.peakCount >= 5 && sprSig.colors.includes('#8ef0ff'),
      `spread fires ${sprSig.peakCount} bullets/volley (pellets=5), colors=${JSON.stringify(sprSig.colors)}`);
    await captureNamed(page, 'weap-spread');

    // machine — fast stream, amber bullets.
    const mac = await armViaPickup(page, 880);
    assert('weapon.machine.pickup', mac.weapon === 'machine' && mac.pickupsAfter < mac.pickupsBefore,
      `machine pickup → weapon=${mac.weapon}, pickups ${mac.pickupsBefore}->${mac.pickupsAfter}`);
    const macSig = await fireSignature(page);
    weapons.machine = macSig;
    assert('weapon.machine.signature', macSig.peakCount > 0 && macSig.colors.includes('#ffd27a'),
      `machine fires (peak ${macSig.peakCount}), colors=${JSON.stringify(macSig.colors)}`);

    // laser — PIERCING high-damage beam, teal bullets.
    const las = await armViaPickup(page, 1580);
    assert('weapon.laser.pickup', las.weapon === 'laser' && las.pickupsAfter < las.pickupsBefore,
      `laser pickup → weapon=${las.weapon}, pickups ${las.pickupsBefore}->${las.pickupsAfter}`);
    const lasSig = await fireSignature(page);
    weapons.laser = lasSig;
    assert('weapon.laser.signature', lasSig.pierce === true && lasSig.maxDamage >= 3 && lasSig.colors.includes('#8affd6'),
      `laser bullets pierce=${lasSig.pierce} dmg=${lasSig.maxDamage}, colors=${JSON.stringify(lasSig.colors)}`);
    await captureNamed(page, 'weap-laser');

    // fire — twin CORKSCREW (wave) rounds, orange bullets. Pickup is elevated;
    // arm via the engine's setWeapon() QA hook and verify the wave signature.
    await freshRun(page);
    const fireArmed = await page.evaluate(() => {
      window.__game.player.setWeapon('fire');
      return window.__game.player.weaponKey;
    });
    assert('weapon.fire.arm', fireArmed === 'fire', `setWeapon('fire') → weapon=${fireArmed} (elevated pickup; QA-armed)`);
    const fireSig = await fireSignature(page);
    weapons.fire = fireSig;
    assert('weapon.fire.signature', fireSig.wave === true && fireSig.colors.includes('#ff8a3c'),
      `fire bullets wave=${fireSig.wave} (corkscrew), colors=${JSON.stringify(fireSig.colors)}`);
    await captureNamed(page, 'weap-fire');

    // ---- STATE 8: death (one-hit) + ICONIC Contra death animation -------
    // Fresh run: charge right WITHOUT firing so a grunt lands the one-hit kill.
    // The death is no longer a frozen teleport (PR#66): the player is FLUNG UP
    // (vy=-6.6) and SPINS (deathAngle grows) before respawn — the iconic Contra
    // death. We verify both the one-hit fact AND the animation live off the sim.
    await freshRun(page);
    await state(page, 'restart-fresh');
    const before = await snap(page);
    const groundY = before.py;
    let died = false, dyingSeen = false, minPy = before.py, maxAngle = 0, animFrame = null;
    await page.keyboard.down('ArrowRight');
    // Detect the lethal hit, then tight-poll the dying arc to capture fling + spin.
    for (let i = 0; i < 140 && !dyingSeen; i++) {
      const s = await page.evaluate(() => {
        const w = window.__game, p = w.player;
        return { dead: p.dead, dying: !!p.dying, ang: p.deathAngle || 0, py: Math.round(p.y),
          lives: w.lives, rt: w.respawnTimer };
      });
      if (s.dead || s.lives < before.lives) died = true;
      if (s.dying) dyingSeen = true;
      await sleep(30);
    }
    let respawnTimerSeen = 0;
    if (dyingSeen) {
      for (let i = 0; i < 24; i++) {
        const s = await page.evaluate(() => {
          const w = window.__game, p = w.player;
          return { dying: !!p.dying, ang: p.deathAngle || 0, py: Math.round(p.y), rt: w.respawnTimer };
        });
        if (s.dying) {
          if (s.py < minPy) minPy = s.py;
          if (s.ang > maxAngle) maxAngle = s.ang;
          if (s.rt > respawnTimerSeen) respawnTimerSeen = s.rt;
          // Grab a frame mid-arc: airborne (flung up) and clearly spinning.
          if (!animFrame && s.ang > 0.3 && s.py < groundY - 4) animFrame = await captureNamed(page, 'death-anim');
        }
        await sleep(25);
      }
    }
    await page.keyboard.up('ArrowRight');
    const death = await state(page, 'death');
    assert('death.oneHit', died, `dead=${death.dead} lives=${death.lives} (was ${before.lives})`);
    // Iconic death: entered a dying state, flung UP (y above the ground it died on),
    // and SPUN (deathAngle grew) — NOT a frozen teleport.
    assert('death.iconicAnim', dyingSeen && minPy < groundY - 4 && maxAngle > 0 && respawnTimerSeen > 0,
      `dying=${dyingSeen} flungUp(minY ${minPy} < ${groundY - 4}) spin(maxAngle=${maxAngle.toFixed(2)}) respawnTimer=${respawnTimerSeen}`);

    // ---- STATE 9: game over ---------------------------------------------
    // Reaching gameover live means burning all lives. Seed lives low (documented
    // setup shortcut) then let the REAL death path drive the transition — we are
    // verifying the transition, not the grind. The death itself is real gameplay.
    await page.keyboard.press('KeyR');
    await sleep(300);
    await page.evaluate(() => { window.__game.lives = 0; });
    let gameover = false;
    for (let i = 0; i < 80 && !gameover; i++) {
      await hold(page, ['ArrowRight'], 120);
      const s = await snap(page);
      if (s.status === 'gameover') gameover = true;
    }
    await release(page, ['ArrowRight']);
    const go = await state(page, 'game-over');
    assert('gameover.reached', gameover && go.status === 'gameover', `status=${go.status} lives=${go.lives}`);

    // ---- STATE 10: restart from game over -------------------------------
    await page.keyboard.press('KeyR');
    await sleep(300);
    const restart = await state(page, 'restart-after-gameover');
    assert('restart.backToPlaying', restart.status === 'playing', `status=${restart.status}`);
    assert('restart.livesReset', restart.lives === 3, `lives=${restart.lives}`);
    assert('restart.playerReset', restart.px < 100 && !restart.dead, `x=${restart.px} dead=${restart.dead}`);

    // ---- STATE 10b: BOSS PHASE-2 ENRAGE (live transition + red volley) ---
    // The Sentinel enters an ENRAGED phase-2 at hp<=enrageAt (0.4·90=36): a
    // faster, denser volley + RED bullets (#ff5a6e) + a distinct enraged sprite.
    // The deterministic headless WIN (STATE 11) proves a PRONE player survives the
    // whole fight *including* enrage (the fairness invariant). Here we ground the
    // TRANSITION itself on the LIVE sim — headless __bench does NOT expose
    // boss.enraged. We seed the player into the arena and, PURELY as observation
    // instrumentation, pin the arena x + top up i-frames so we can watch the boss
    // cross into phase-2. This measures the BOSS state change, NOT survivability
    // (which is proven separately, deterministically, by the win below).
    await freshRun(page);
    const bossSeed = await page.evaluate(() => {
      const w = window.__game;
      const b = w.enemies.find((e) => e.kind === 'boss');
      if (!b) return { ok: false };
      w.player.setWeapon('spread');
      w.player.x = 2285; w.player.y = 210; w.camera.follow(w.player, true);
      return { ok: true, enrageAt: b.def.enrageAt, bossMaxHp: b.def.hp };
    });
    assert('bossEnrage.arenaReady', bossSeed.ok,
      `boss authored in level1; enrageAt=${bossSeed.enrageAt} maxHp=${bossSeed.bossMaxHp}`);
    // Baseline: the boss's margin redness BEFORE enrage (glow off) — control.
    const glowPre = await bossGlowExcess(page);
    await page.keyboard.down('ArrowDown'); await page.keyboard.down('KeyX');
    let enraged = false, enrageHp = null, redVolley = false, bossDead = false;
    for (let i = 0; i < 200 && !bossDead; i++) {
      const s = await page.evaluate(() => {
        const w = window.__game; const b = w.boss;
        w.player.x = 2285; w.player.iframe = Math.max(w.player.iframe, 10); // observation pin ONLY
        return {
          enraged: !!(b && b.enraged), hp: b ? b.hp : null, dead: !!(b && b.dead),
          redVolley: w.bullets.some((x) => x.from === 'enemy' && x.color === '#ff5a6e'),
        };
      });
      if (s.enraged && !enraged) { enraged = true; enrageHp = s.hp; }
      if (s.redVolley) redVolley = true;
      if (enraged && redVolley) break; // captured the phase-2 volley — done
      if (s.dead) bossDead = true;
      await sleep(50);
    }
    await captureNamed(page, 'boss-enrage');
    await sleep(120); // let the glow pulse toward its peak for a stable read
    const glowEnraged = await bossGlowExcess(page);
    await captureBossZoom(page, 'boss-enrage-zoom'); // crisp defect evidence
    await page.keyboard.up('KeyX'); await page.keyboard.up('ArrowDown');
    const enrageThresh = Math.round(bossSeed.bossMaxHp * bossSeed.enrageAt);
    bossEnrage = { enraged, enrageHp, redVolley, threshold: enrageThresh, maxHp: bossSeed.bossMaxHp,
      glowPreExcess: glowPre && glowPre.excess, glowEnragedExcess: glowEnraged && glowEnraged.excess };
    assert('bossEnrage.triggers', enraged && enrageHp !== null && enrageHp <= enrageThresh,
      `boss entered phase-2 ENRAGE at hp=${enrageHp} (threshold ${enrageThresh})`);
    assert('bossEnrage.redVolley', redVolley,
      `enraged phase fires the distinct RED volley (#ff5a6e): seen=${redVolley}`);
    // BOSS-3 (was a MEDIUM render defect) is FIXED (PR#86): the enrage heat-glow is
    // now masked to the sprite, so the transparent corners of the glow-rect stay at
    // background instead of getting a red rectangle. This asserts the masked state
    // (corner redness excess ≈ 0) as a REGRESSION GUARD — it re-reddens if an
    // unmasked fillRect ever comes back. (Verified by looking: boss-enrage-zoom.png.)
    const gpe = glowPre && glowPre.excess, gee = glowEnraged && glowEnraged.excess;
    assert('bossEnrage.glowMaskedToSprite', gee !== null && gee < 15,
      `enrage glow masked to sprite (BOSS-3 fixed): transparent-corner redness excess ` +
      `pre=${gpe} → enraged=${gee} (≈0 = no red rectangle; corners TL=${glowEnraged && glowEnraged.cornerTL} TR=${glowEnraged && glowEnraged.cornerTR})`);

    // ---- STATE 11: boss win path (deterministic scenario render) ---------
    // Living through the whole stage to the boss on live keyboard is a long,
    // flaky play. The build ships a REAL boss-arena scenario (?headless=1&
    // scenario=boss) that steps the actual sim with a prone+fire timeline and
    // renders the real frame. We assert the WIN (status='cleared', player alive)
    // and capture the frame. Labeled deterministic-harness, NOT live keyboard.
    const bossPage = await browser.newPage();
    await bossPage.goto(`${srv.url}/index.html?headless=1&scenario=boss&frames=1400&seed=1234`,
      { waitUntil: 'networkidle2', timeout: 30000 });
    await bossPage.waitForSelector('#headless-done', { timeout: 20000 }).catch(() => {});
    await sleep(150);
    const bench = await bossPage.evaluate(() => window.__bench || null);
    const bossDataUrl = await bossPage.evaluate(() => {
      const c = document.getElementById('game');
      return c ? c.toDataURL('image/png') : null;
    });
    if (bossDataUrl) {
      await writeFile(path.join(OUT, `${String(++frameNo).padStart(2, '0')}-boss-win.png`),
        Buffer.from(bossDataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    }
    snapshots['boss-win'] = bench;
    assert('boss.telegraphAndWin', !!bench && bench.status === 'cleared' && bench.playerDead === false,
      `status=${bench && bench.status} dead=${bench && bench.playerDead} (deterministic scenario)`);
    assert('boss.proneUsed', !!bench && bench.playerProne === true,
      `prone=${bench && bench.playerProne} (win path requires ducking cannon volleys)`);
    await bossPage.close();

    // ---- FEEL & CADENCE (live, wall-clock — measured, never self-reported) --
    // My mandate: "measure timing/hit-stop/cadence (feel) — never self-report."
    // These are computed from the LIVE rAF loop's own counters, then checked
    // against the build's INTENDED config values (game/data/config.js). Intended:
    //   SIM.STEP_HZ = 60           -> live sim should advance ~60 frames/sec
    //   WEAPONS.rifle.fireRate = 7 -> ~1 shot / 7 sim frames while held
    //   FEEL.hitStopKill = 7, traumaKill = 0.5 -> kill freezes + shakes the sim
    feel = {};

    // (a) Live sim cadence. world.frame++ runs every fixed step (main.js), so the
    //     frame delta over a known wall-clock window IS the real-time step rate.
    await freshRun(page);
    const cadStart = await snap(page);
    const cadT0 = Date.now();
    await sleep(1000);
    const cadEnd = await snap(page);
    const cadSecs = (Date.now() - cadT0) / 1000;
    const simFps = (cadEnd.frame - cadStart.frame) / cadSecs;
    feel.simCadenceFps = +simFps.toFixed(1);
    // A healthy live loop holds ~60Hz. Band is generous to tolerate headless
    // scheduling jitter but still catches a stalled / runaway loop.
    assert('feel.simCadence', simFps >= 45 && simFps <= 66,
      `live sim cadence ${feel.simCadenceFps} steps/s (intended STEP_HZ=60)`);

    // (b) Fire cadence. Hold fire in place; every rising edge of playerBullets is
    //     a spawn — stamp its world.frame and take the median inter-spawn gap.
    await freshRun(page);
    const fireTs = await timeSeries(page, 1000, ['KeyX']);
    const spawnFrames = [];
    for (let i = 1; i < fireTs.length; i++) {
      if (fireTs[i].playerBullets > fireTs[i - 1].playerBullets) spawnFrames.push(fireTs[i].frame);
    }
    const gaps = [];
    for (let i = 1; i < spawnFrames.length; i++) gaps.push(spawnFrames[i] - spawnFrames[i - 1]);
    gaps.sort((a, b) => a - b);
    const medGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;
    feel.fireSpawns = spawnFrames.length;
    feel.fireIntervalFrames = medGap;
    // rifle.fireRate=7. Median gap between spawns should land near it (allow 5..10
    // for sampling granularity — 15ms sampling vs ~116ms spawn spacing).
    assert('feel.fireCadence', medGap !== null && medGap >= 5 && medGap <= 10,
      `median ${medGap} sim-frames between rifle shots over ${spawnFrames.length} spawns (intended fireRate=7)`);

    // (c) Hit-stop + trauma actually fire on a kill in the LIVE loop. Fire right
    //     into the dormant grunt cluster and watch the feel kernel spike.
    await freshRun(page);
    const killTs = await timeSeries(page, 2500, ['KeyX']);
    const hitStopPeak = Math.max(0, ...killTs.map((s) => s.hitStop));
    const traumaPeak = Math.max(0, ...killTs.map((s) => s.trauma));
    feel.hitStopPeak = hitStopPeak;
    feel.traumaPeak = +traumaPeak.toFixed(3);
    // A kill must freeze the sim (hitStopKill=7) and add shake (traumaKill=0.5).
    // We assert the feel FIRES live (>0) and record the peak as the timing evidence.
    assert('feel.hitStopOnKill', hitStopPeak > 0,
      `live hit-stop peak ${hitStopPeak} frames on kill (intended hitStopKill=7)`);
    assert('feel.traumaOnKill', traumaPeak > 0,
      `live trauma peak ${feel.traumaPeak} on kill (intended traumaKill=0.5)`);

    // Telemetry gap: the on-screen fps meter is a LOCAL var in the rAF loop and is
    // NOT exposed on window (snap().fps is always null). Record it as a finding —
    // engine could publish window.__game.__fps / entity counts for perf grounding.
    feel.fpsExposedOnWindow = cadEnd.fps !== null;
    assert('feel.fpsTelemetryExposed', cadEnd.fps !== null,
      `KNOWN GAP: live fps/entity telemetry not exposed on window (__fps=${cadEnd.fps}); measured sim cadence used instead`, false);

    // ---- AUDIO / SFX WIRING (live, end-to-end — measured, not self-reported) --
    // A procedural Web-Audio SFX layer shipped (game/src/audio.js). The sim emits
    // event NAMES; the live loop drains them to window.__audio.play. We verify the
    // FULL chain fires in the real browser loop by driving each action and reading
    // what actually reached the audio kit. selftest.js checks emission at the sim
    // level; this is the missing LIVE end-to-end grounding — without it, a broken
    // world→drain→audio wiring would leave every existing test green.
    sfx = {};
    if (sfxProbe) {
      // shoot → 'shoot_rifle'
      await freshRun(page); await clearSfx(page);
      await hold(page, ['KeyX'], 300); await release(page, ['KeyX']);
      sfx.shoot = await readSfx(page);
      assert('audio.shootWired', sfx.shoot.includes('shoot_rifle'),
        `live SFX on fire: [${sfx.shoot.join(',')}] (intended shoot_rifle)`, false);

      // jump → 'jump'
      await freshRun(page); await clearSfx(page);
      await tap(page, 'Space', 80); await sleep(120);
      sfx.jump = await readSfx(page);
      assert('audio.jumpWired', sfx.jump.includes('jump'),
        `live SFX on jump: [${sfx.jump.join(',')}] (intended jump)`, false);

      // kill → 'enemyHit' and/or 'explosion' (fire right into the grunt cluster)
      await freshRun(page); await clearSfx(page);
      await hold(page, ['KeyX'], 2500); await release(page, ['KeyX']);
      sfx.kill = await readSfx(page);
      assert('audio.killWired', sfx.kill.includes('enemyHit') || sfx.kill.includes('explosion'),
        `live SFX on kill: [${[...new Set(sfx.kill)].join(',')}] (intended enemyHit/explosion)`, false);

      // death → 'hurt', then game-over → 'gameover' (seed lives low, charge unarmed)
      await page.keyboard.press('KeyR'); await sleep(300);
      await page.evaluate(() => { window.__game.lives = 0; window.__sfxLog = []; });
      let sawGameover = false;
      for (let i = 0; i < 80 && !sawGameover; i++) {
        await hold(page, ['ArrowRight'], 120);
        const s = await snap(page);
        if (s.status === 'gameover') sawGameover = true;
      }
      await release(page, ['ArrowRight']);
      sfx.death = await readSfx(page);
      assert('audio.hurtWired', sfx.death.includes('hurt'),
        `live SFX on death: [${[...new Set(sfx.death)].join(',')}] (intended hurt)`, false);
      assert('audio.gameoverWired', sfx.death.includes('gameover'),
        `live SFX on game-over: includes gameover=${sfx.death.includes('gameover')}`, false);
    }

    // ---- CREATOR-APPROVAL PANEL (required deliverable) ------------------
    // Verify the in-game creator-approval feedback panel. Its contract is now
    // SPEC'd in feedback/SPEC.md (root.E) → window.__approval controller +
    // release gate. Implementer is root.B (game/src/feedback.js), NOT yet shipped.
    // (1) PRESENCE gate (critical): the ship-blocking red, per SPEC §3.5 / AC-11.
    const approval = await page.evaluate(() => {
      const domHit = /approve|creator (review|approval|feedback)|thumbs|rate this build/i.test(document.body.innerHTML || '');
      const ctl = window.__approval || (window.__game && window.__game.approval) || null;
      return { domHit, apiHit: !!ctl, hasCtl: !!ctl };
    });
    assert('creatorApproval.panelExists', approval.domHit || approval.apiHit,
      approval.apiHit || approval.domHit
        ? `panel present: DOM=${approval.domHit} api=${approval.apiHit}`
        : `KNOWN GAP (TOP): no in-game creator-approval feedback panel — DOM=${approval.domHit} api=${approval.apiHit} (SPEC: feedback/SPEC.md)`,
      true);
    creatorApproval = { present: approval.apiHit || approval.domHit, apiHit: approval.apiHit, domHit: approval.domHit };

    // (2) FUNCTIONAL contract — only runs once the controller lands. Verifies the
    //     SPEC's acceptance criteria so the gate proves the channel WORKS, not just
    //     that some element exists. Drives window.__approval per feedback/SPEC.md §4/§5.
    if (approval.apiHit) {
      const fx = await page.evaluate(() => {
        const c = window.__approval || window.__game.approval;
        const isFn = (k) => typeof c[k] === 'function';
        const surface = ['toggle', 'submit', 'entries', 'latest', 'clear'].every(isFn) && ('releaseApproved' in c);
        const out = { surface };
        try {
          if (c.clear) c.clear();
          // AC-4/AC-7: APPROVE (rating>=3) persists w/ full context + opens the gate.
          c.submit({ verdict: 'approve', rating: 5, notes: 'qa-e2e' });
          const l = c.latest();
          out.approveOk = !!l && l.verdict === 'approve' &&
            !!l.context && ['buildId', 'status', 'mode', 'score', 'lives'].every((k) => k in l.context) &&
            c.releaseApproved === true;
          // AC-5: a later REJECT revokes (newest verdict wins).
          c.submit({ verdict: 'reject' });
          out.rejectRevokes = c.latest().verdict === 'reject' && c.releaseApproved === false;
          // AC-6: contradictory APPROVE + rating 1-2 saves but keeps the gate CLOSED.
          c.submit({ verdict: 'approve', rating: 2 });
          out.contradictoryClosed = c.releaseApproved === false;
          if (c.clear) c.clear();
          // AC-8: fresh (cleared) → gate closed.
          out.defaultClosed = c.releaseApproved === false;
        } catch (e) { out.error = String(e); }
        return out;
      });
      creatorApproval.functional = fx;
      assert('creatorApproval.controllerSurface', fx.surface,
        `controller has toggle/submit/entries/latest/clear + releaseApproved: ${fx.surface}`);
      assert('creatorApproval.approveGatesRelease', fx.approveOk === true,
        `APPROVE (rating≥3) persists w/ full context and opens releaseApproved: ${fx.approveOk} (err=${fx.error || 'none'})`);
      assert('creatorApproval.rejectRevokes', fx.rejectRevokes === true,
        `a later REJECT flips releaseApproved back to false: ${fx.rejectRevokes}`);
      assert('creatorApproval.contradictoryClosed', fx.contradictoryClosed === true,
        `APPROVE with rating 1-2 keeps releaseApproved=false: ${fx.contradictoryClosed}`);
      assert('creatorApproval.defaultClosed', fx.defaultClosed === true,
        `after clear(), releaseApproved=false (release closed by default): ${fx.defaultClosed}`);
      // AC-1: the F hotkey toggles the panel (needs a real keydown).
      const toggled = await page.evaluate(() => {
        const c = window.__approval; if (typeof c.isOpen !== 'function') return null;
        return c.isOpen();
      });
      if (toggled !== null) {
        await page.keyboard.press('KeyF'); await sleep(80);
        const open1 = await page.evaluate(() => window.__approval.isOpen());
        await page.keyboard.press('KeyF'); await sleep(80);
        const open2 = await page.evaluate(() => window.__approval.isOpen());
        creatorApproval.hotkey = { open1, open2 };
        assert('creatorApproval.hotkeyToggles', open1 === true && open2 === false,
          `F toggles panel: closed→${open1}→${open2}`);
      }

      // ---- REAL CREATOR PATH: drive the DOM UI (not the programmatic submit) ----
      // A creator opens the panel with F, clicks stars, and clicks the real
      // APPROVE button. Also verify the two gameplay-integrity ACs that only hold
      // via the live loop: AC-2 (sim frozen while open) and AC-3 (no key leak).
      await freshRun(page); // clean 'playing' slate
      await page.evaluate(() => { try { window.__approval.clear(); } catch (_) {} });
      await hold(page, ['ArrowRight'], 500); await release(page, ['ArrowRight']); // move off spawn so a reset-leak is visible
      await sleep(120); // let residual run-velocity settle before opening
      await page.keyboard.press('KeyF'); await sleep(150); // OPEN via hotkey
      const panelVisible = await page.evaluate(() => {
        const p = document.getElementById('feedback-panel');
        return { open: !!(window.__approval.isOpen()), domVisible: !!p && !p.hidden,
          hasApprove: !!document.getElementById('fb-approve'), hasReject: !!document.getElementById('fb-reject'),
          hasStars: !!document.getElementById('fb-stars'), hasNotes: !!document.getElementById('fb-notes') };
      });
      assert('creatorApproval.opensAndRenders',
        panelVisible.open && panelVisible.domVisible && panelVisible.hasApprove && panelVisible.hasReject && panelVisible.hasStars && panelVisible.hasNotes,
        `F opened panel with verdict buttons + rating + notes: ${JSON.stringify(panelVisible)}`);
      // Evidence: a FULL-PAGE screenshot (the panel is a DOM overlay, not on the
      // canvas — canvas.toDataURL would miss it, same as the touch overlay).
      await writeFile(path.join(OUT, 'creator-approval.png'), await page.screenshot({ type: 'png' }));

      // Baseline is captured AFTER the panel is confirmed open (freeze engaged), so
      // AC-2/AC-3 measure "frozen WHILE open" — NOT the ~1-2 frames that slip through
      // the open transition itself (that pre-open→post-open delta is a test race, not
      // a pause failure; verified separately: frame delta is 0 once open & frozen).
      await sleep(120); // let the freeze settle
      const frozen = await page.evaluate(() => {
        const w = window.__game; return { frame: w.frame, px: Math.round(w.player.x), mode: w.modeKey, status: w.status };
      });

      // AC-2: sim frozen while the panel is open (creator can't die/advance).
      await sleep(800);
      const midOpen = await page.evaluate(() => {
        const w = window.__game; return { frame: w.frame, px: Math.round(w.player.x), status: w.status };
      });
      assert('creatorApproval.pausesOnOpen',
        midOpen.frame === frozen.frame && midOpen.px === frozen.px && midOpen.status === 'playing',
        `sim frozen while panel open: frame ${frozen.frame}→${midOpen.frame}, x ${frozen.px}→${midOpen.px}, status=${midOpen.status}`);

      // AC-3: game keys do not leak while the panel owns the keyboard.
      await page.keyboard.press('KeyR');    // must NOT reset the run
      await page.keyboard.press('Digit2');  // must NOT switch to casual
      await sleep(120);
      const afterKeys = await page.evaluate(() => {
        const w = window.__game; return { px: Math.round(w.player.x), mode: w.modeKey, status: w.status };
      });
      assert('creatorApproval.noKeyLeak',
        afterKeys.px === frozen.px && afterKeys.mode === 'arcade' && afterKeys.status === 'playing',
        `R/2 swallowed while open (no reset, mode stays arcade): x=${afterKeys.px}(frozen base ${frozen.px}) mode=${afterKeys.mode}`);

      // AC-4 via the REAL UI: click ★4 then the APPROVE button → gate opens.
      await page.click('#fb-stars .fb-star[data-v="4"]').catch(() => {});
      await page.click('#fb-approve').catch(() => {});
      await sleep(120);
      const uiApprove = await page.evaluate(() => {
        const c = window.__approval; const l = c.latest();
        return { verdict: l && l.verdict, rating: l && l.rating, release: c.releaseApproved };
      });
      creatorApproval.uiApprove = uiApprove;
      assert('creatorApproval.approveButtonWorks',
        uiApprove.verdict === 'approve' && uiApprove.rating === 4 && uiApprove.release === true,
        `clicking ★4 + APPROVE button → entry verdict=${uiApprove.verdict} rating=${uiApprove.rating}, releaseApproved=${uiApprove.release}`);

      // Close via Escape (panel was left open by the approve click). Keep the
      // persisted approval for the reload test below — do NOT clear yet.
      await page.keyboard.press('Escape'); await sleep(100);
      const closed = await page.evaluate(() => window.__approval.isOpen());
      assert('creatorApproval.escCloses', closed === false, `Escape closed the panel: isOpen=${closed}`);

      // AC-4 PERSISTENCE (the release-gate's foundation): the approved verdict must
      // survive a real page RELOAD so a later ship/publish step (feedback/
      // release-gate.mjs) reads it from localStorage. Reload and re-read the
      // freshly-mounted controller — the approve above (★4) must still gate open.
      await page.reload({ waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForFunction(() => !!window.__game && !!window.__approval, { timeout: 15000 });
      const persisted = await page.evaluate(() => {
        const c = window.__approval; const l = c.latest();
        return { release: c.releaseApproved, entries: c.entries().length, latest: l && l.verdict, rating: l && l.rating };
      });
      creatorApproval.persistedAcrossReload = persisted;
      assert('creatorApproval.persistsAcrossReload',
        persisted.release === true && persisted.entries >= 1 && persisted.latest === 'approve',
        `after page RELOAD the approve survives (release gate readable by a ship step): releaseApproved=${persisted.release}, entries=${persisted.entries}, latest=${persisted.latest} ★${persisted.rating}`);
      await page.evaluate(() => { try { window.__approval.clear(); } catch (_) {} }); // leave storage clean
    }

  } finally {
    // Persist all evidence.
    const summary = {
      when: new Date().toISOString?.() || null,
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      criticalFailed: results.filter((r) => !r.ok && r.critical).length,
      results,
      snapshots,
      // Wall-clock feel/cadence measurements (null if the run failed before them).
      feel,
      // Live SFX-wiring evidence: which events each action dispatched to __audio.
      sfx,
      // Per-weapon live fire-signature evidence (color/pellets/pierce/wave).
      weapons,
      // Live boss phase-2 enrage transition evidence.
      bossEnrage,
      creatorApproval,
      pageErrors,
      // favicon.ico 404 is a browser auto-request our ephemeral test server does
      // not serve — benign, not a game asset. Filter it so the evidence is honest.
      consoleErrors: consoleLog.filter((c) => c.type === 'error' && !/favicon\.ico/i.test(c.text + ' ' + c.url)),
      consoleTail: consoleLog.slice(-40),
    };
    await writeFile(path.join(OUT, 'results.json'), JSON.stringify(summary, null, 2));
    await browser.close();
    await srv.close();

    const { passed, failed } = summary;
    console.log(`\n=== PLAYTHROUGH: ${passed} passed, ${failed} failed (${summary.criticalFailed} critical) ===`);
    console.log(`evidence -> ${OUT}`);
    // Exit non-zero if anything failed — we report defects, we don't hide them.
    process.exit(failed > 0 ? 1 : 0);
  }
}

main().catch((e) => { console.error('HARNESS ERROR:', e); process.exit(2); });
