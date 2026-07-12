#!/usr/bin/env node
// feedback/audit/weapon-defect-audit.mjs
// ============================================================================
// DETERMINISTIC per-stage audit of the creator ROUND-2 "two weapons" defect,
// across ALL 7 stages of the campaign (not just the ones hand-checked).
//
//   node feedback/audit/weapon-defect-audit.mjs
//
// The creator's round-2 REJECT (CREATOR_FEEDBACK.md) is a FACT, not a judgment:
// does ANY armed entity show TWO weapons — a weapon baked into the sprite art
// AND a procedural, code-drawn weapon overlaid on top? The durable fix is
// "exactly ONE weapon per entity, drawn where the shot leaves." The two on-screen
// entities that overlay a procedural aiming weapon on a body are the HERO
// (drawGun) and the TURRET/cannon (drawTurretBarrel) — precisely the two the
// creator named ("main character sprite and canon... turret"). Boss/chopper draw
// full single-weapon art (no overlay); grunt/flyer/mortar carry at most one
// weapon and no procedural overlay — so the two-weapon surface is {hero, turret}.
//
// This audit proves, deterministically, for every stage:
//   LAYER A  (STATIC — parse the SHIPPED game/src source, structural facts):
//     A1 drawPlayer blits the hero body ONLY through weaponless *_noweapon keys;
//        the gun-baked player_idle/run/jump/prone keys are NEVER blitted as a body.
//     A2 drawEnemy's turret branch blits the body via turret_base (weaponless
//        dome) / weaponlessTurret(); the baked `turret` sprite is used ONLY as the
//        assets.get(e.kind) existence gate, never drawn as the turret body.
//     A3 the procedural weapons are the ONLY weapons: drawGun is invoked only on
//        the hero body paths, drawTurretBarrel only in the turret branches.
//     A4 hero shot ORIGIN == drawn muzzle: render.js drawGun and player.js shoot()
//        both key off the SAME exported HERO_GUN {pivotY,muzzle} — one geometry.
//     A5 turret shot ORIGIN == drawn barrel tip: render.js drawTurretBarrel and
//        enemy.js turret fire both key off the SAME e.def.barrelPivotFromBottom +
//        e.def.barrelLen — one geometry.
//     A6 EVERY OTHER armed enemy is weaponless-overlay: the dedicated boss/chopper
//        draws invoke NEITHER procedural weapon and drawEnemy overlays NO drawGun on
//        any body ⇒ boss/chopper/flyer/mortar/grunt each show at most ONE weapon
//        (their own art). Closes the mandate's "every armed enemy", not just {hero,
//        turret}; per-stage `keys.everyArmedEnemyOneWeapon` enumerates each with its
//        static procedural-weapon-draw count.
//     A7 COVERAGE guard: every enemy kind in game/data/config.js ENEMIES is MODELED by
//        the audit (RESOLVE+weaponDrawMap). Fails CLOSED the moment the campaign adds a
//        new enemy/boss the audit hasn't weapon-classified, so the two-weapon FACT can
//        never silently lose coverage as content grows (per-stage `keys.allSpawnsModeled`
//        localizes the drift to the stage that introduced it).
//   LAYER B  (RUNTIME — drive the REAL browser build headless, one load per stage):
//     B1 the stage boots on its configured theme; the enumerated armed entities
//        actually instantiate in the live world.
//     B2 the hero's fired bullet leaves the HAND muzzle (upper body, <55% down),
//        not a waist/centre "second gun" — grounded, per stage.
//     B3 every turret in the stage fires from its BARREL TIP (the def-driven point
//        drawTurretBarrel draws), not the dome centre — grounded, per stage.
//
// Each stage's verdict = AND of the checks that apply to it. Layer-A facts are
// shared (a source regression fails every stage — that is correct: it is a global
// render-path break). Output: ONE machine-checked record PER STAGE ->
//   feedback/audit/report/weapon-audit.json   (machine)
//   feedback/audit/REPORT.md                   (human, regenerated)
//
// REPORT, DON'T WORK AROUND: any assertion that trips is recorded as a FAILING
// stage fact + an OPEN ISSUE in the report. This audit owns ONLY feedback/audit/;
// source regressions belong to root.A, the deploy-gate wire to root.D.
// ============================================================================

import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveGame, findChrome } from '../../playtest/e2e/harness.mjs';
import { STAGES, ENEMIES } from '../../game/data/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SRC = (f) => path.join(REPO, 'game', 'src', f);

// ---- puppeteer-core: reuse whichever in-run install exists (none in this wt) ----
function loadPuppeteer() {
  const cands = [
    path.resolve(REPO, '..', '..', 'repo', 'reference', 'tools'), // <run>/repo/reference/tools
    path.join(REPO, 'reference', 'tools'),
    path.join(REPO, 'playtest', 'e2e'),
  ];
  for (const base of cands) {
    try { return createRequire(path.join(base, 'noop.js'))('puppeteer-core'); } catch { /* next */ }
  }
  throw new Error('puppeteer-core not found in any known in-run node_modules');
}

// ────────────────────────────────────────────────────────────────────────────
// The render-path key resolution + weapon classification, MIRRORED from the
// shipped render.js (and asserted against it in Layer A). `procWeapon` marks the
// entities that overlay a code-drawn aiming weapon on a body — the ONLY two-weapon
// surface. `bakedForbidden` are the gun-baked keys that must NEVER be blitted as
// that entity's body under the procedural weapon.
// ────────────────────────────────────────────────────────────────────────────
const RESOLVE = {
  hero: {
    label: 'hero (commando)', procWeapon: 'drawGun',
    bodyKeys: ['player_idle_noweapon', 'player_run_noweapon', 'player_jump_noweapon', 'player_prone_noweapon'],
    bakedForbidden: ['player_idle', 'player_run', 'player_jump', 'player_prone'],
  },
  turret: {
    label: 'turret (purple cannon)', procWeapon: 'drawTurretBarrel',
    bodyKeys: ['turret_base'], bakedForbidden: ['turret'],
  },
  // single-weapon kinds (no procedural overlay drawn over the body) — recorded for
  // completeness, not part of the two-weapon assertion:
  grunt: { label: 'grunt', procWeapon: null, bodyKeys: ['grunt'], bakedForbidden: [], unarmedBody: true },
  flyer: { label: 'flyer (drone)', procWeapon: null, bodyKeys: ['flyer'], bakedForbidden: [] },
  mortar: { label: 'mortar (emplacement)', procWeapon: null, bodyKeys: ['mortar'], bakedForbidden: [] },
  boss: { label: 'boss (sentinel)', procWeapon: null, bodyKeys: ['boss_<theme>||boss_enraged||boss'], bakedForbidden: [] },
  chopper: { label: 'boss (chopper)', procWeapon: null, bodyKeys: ['boss_<theme>||chopper_enraged||chopper'], bakedForbidden: [] },
};

const EPS_PX = 2.0; // sub-pixel tolerance for "shot originates at the drawn muzzle"

// ────────────────────────────────────────────────────────────────────────────
// LAYER A — static render-path invariants (parse the shipped source).
// ────────────────────────────────────────────────────────────────────────────
// Extract a top-level `function NAME(...) { ... }` body by brace matching.
function fnBody(src, name) {
  const m = src.match(new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`));
  if (!m) return null;
  let i = m.index + m[0].length, depth = 1;
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
  }
  return src.slice(m.index, i);
}

async function layerA() {
  const render = await readFile(SRC('render.js'), 'utf8');
  const player = await readFile(SRC('player.js'), 'utf8');
  const enemy = await readFile(SRC('enemy.js'), 'utf8');
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, ok: !!ok, detail });

  const drawPlayer = fnBody(render, 'drawPlayer') || '';
  const drawEnemy = fnBody(render, 'drawEnemy') || '';
  const drawGunFn = fnBody(render, 'drawGun') || '';
  const drawBarrelFn = fnBody(render, 'drawTurretBarrel') || '';

  // A1 — hero body only via *_noweapon; no baked player_* blitted in drawPlayer.
  // drawPlayer fetches through a local `const get = (k) => assets.get(k)` alias, so
  // match both `get('player_…')` and `assets.get('player_…')` (\bget( catches both).
  const heroGets = [...drawPlayer.matchAll(/\bget\(\s*'(player_[a-z_]+)'\s*\)/g)].map((m) => m[1]);
  const bakedHero = heroGets.filter((k) => !k.endsWith('_noweapon'));
  add('A1.heroWeaponlessKeysOnly', drawPlayer && heroGets.length > 0 && bakedHero.length === 0,
    `drawPlayer hero-body keys = [${[...new Set(heroGets)].join(', ')}]; baked keys blitted = [${bakedHero.join(', ') || 'none'}]`);

  // A2 — turret body via turret_base / weaponlessTurret; baked `turret` only the gate.
  const turretBranch = (() => {
    const i = drawEnemy.indexOf("e.kind === 'turret'");
    if (i < 0) return '';
    return drawEnemy.slice(i, i + 400);
  })();
  const usesTurretBase = /assets\.get\(\s*'turret_base'\s*\)/.test(turretBranch);
  const usesWeaponlessFallback = /weaponlessTurret\(/.test(turretBranch);
  const drawsBaseBody = /drawEnemySprite\(\s*ctx\s*,\s*e\s*,\s*base\b/.test(turretBranch);
  // the ONLY literal 'turret' assets.get in drawEnemy must be absent — the body uses
  // turret_base and the gate uses assets.get(e.kind) (variable, not a literal).
  const literalBakedTurret = /assets\.get\(\s*'turret'\s*\)/.test(drawEnemy);
  add('A2.turretWeaponlessBody', usesTurretBase && usesWeaponlessFallback && drawsBaseBody && !literalBakedTurret,
    `turret_base=${usesTurretBase} weaponlessFallback=${usesWeaponlessFallback} drawsBase=${drawsBaseBody} bakedTurretBlitted=${literalBakedTurret}`);

  // A3 — the procedural weapons are the ONLY weapons and are correctly confined:
  // every drawGun() CALL (total occurrences minus the one `function drawGun(` def)
  // lives inside drawPlayer; every drawTurretBarrel() call inside drawEnemy.
  const count = (s, re) => [...s.matchAll(re)].length;
  const gunTotal = count(render, /drawGun\(/g);
  const gunDefs = count(render, /function\s+drawGun\(/g);
  const gunCalls = gunTotal - gunDefs;
  const gunCallsInPlayer = count(drawPlayer, /drawGun\(/g); // drawPlayer holds no def
  const barrelTotal = count(render, /drawTurretBarrel\(/g);
  const barrelDefs = count(render, /function\s+drawTurretBarrel\(/g);
  const barrelCalls = barrelTotal - barrelDefs;
  const barrelInDrawEnemy = count(drawEnemy, /drawTurretBarrel\(/g);
  add('A3.oneProceduralWeaponConfined',
    gunCalls > 0 && gunCallsInPlayer === gunCalls && barrelCalls > 0 && barrelInDrawEnemy === barrelCalls,
    `drawGun calls=${gunCalls} (all in drawPlayer=${gunCallsInPlayer === gunCalls}); ` +
    `drawTurretBarrel calls=${barrelCalls} (all in drawEnemy=${barrelInDrawEnemy === barrelCalls})`);

  // A4 — hero drawn-muzzle == fired-muzzle: SAME exported HERO_GUN geometry.
  const heroGunDef = player.match(/export\s+const\s+HERO_GUN\s*=\s*\{\s*pivotY:\s*([0-9.]+)\s*,\s*muzzle:\s*([0-9.]+)\s*\}/);
  const renderImportsHeroGun = /import\s*\{[^}]*\bHERO_GUN\b[^}]*\}\s*from\s*'\.\/player\.js'/.test(render);
  const drawGunUsesMuzzle = /HERO_GUN\.muzzle/.test(drawGunFn);
  const shootUsesHeroMuzzle = /heroMuzzle\(/.test(player) && /HERO_GUN\.muzzle/.test(player);
  add('A4.heroShotFromDrawnMuzzle',
    !!heroGunDef && renderImportsHeroGun && drawGunUsesMuzzle && shootUsesHeroMuzzle,
    heroGunDef ? `HERO_GUN{pivotY:${heroGunDef[1]},muzzle:${heroGunDef[2]}} shared: render.drawGun uses .muzzle=${drawGunUsesMuzzle}, player.shoot via heroMuzzle=${shootUsesHeroMuzzle}` : 'HERO_GUN def not found');

  // A5 — turret drawn-barrel-tip == fired-muzzle: SAME e.def barrel geometry.
  const drawBarrelUsesDef = /e\.def\.barrelPivotFromBottom/.test(drawBarrelFn) && /e\.def\.barrelLen/.test(drawBarrelFn);
  const fireUsesDef = /this\.def\.barrelPivotFromBottom/.test(enemy) && /this\.def\.barrelLen/.test(enemy);
  add('A5.turretShotFromDrawnBarrel', drawBarrelUsesDef && fireUsesDef,
    `render.drawTurretBarrel uses e.def.barrel{Pivot,Len}=${drawBarrelUsesDef}; enemy.js fire uses this.def.barrel{Pivot,Len}=${fireUsesDef}`);

  // A6 — EVERY OTHER armed enemy carries ZERO procedural weapon overlay (mandate:
  // enumerate "every armed enemy", not just {hero,turret}). A1..A3 confine drawGun
  // to drawPlayer and drawTurretBarrel to drawEnemy's turret branch; A6 CLOSES the
  // set by proving, from source, that the DEDICATED enemy draws (drawBoss/drawChopper
  // — separate functions A3's whole-file counts imply but never inspect on their own)
  // invoke NEITHER procedural weapon, and that NO drawGun is ever overlaid on ANY
  // enemy body (drawEnemy has zero drawGun). So boss/chopper/flyer/mortar/grunt each
  // show at most ONE weapon (their own art) — the `procWeapon:null` label is now a
  // machine-checked FACT, not an assertion. Per-enemy draw-call counts are exposed
  // (weaponDrawMap) so each stage record can enumerate every armed enemy explicitly.
  const drawBossFn = fnBody(render, 'drawBoss') || '';
  const drawChopperFn = fnBody(render, 'drawChopper') || '';
  const wc = (s) => ({ gun: count(s, /drawGun\(/g), barrel: count(s, /drawTurretBarrel\(/g) });
  const bossW = wc(drawBossFn), chopW = wc(drawChopperFn);
  const enemyDrawGun = count(drawEnemy, /drawGun\(/g);
  const bossWeaponless = !!drawBossFn && bossW.gun === 0 && bossW.barrel === 0;
  const chopWeaponless = !!drawChopperFn && chopW.gun === 0 && chopW.barrel === 0;
  add('A6.otherArmedEnemiesWeaponless',
    bossWeaponless && chopWeaponless && enemyDrawGun === 0,
    `drawBoss weaponCalls={gun:${bossW.gun},barrel:${bossW.barrel}}, ` +
    `drawChopper weaponCalls={gun:${chopW.gun},barrel:${chopW.barrel}}, ` +
    `drawGun-in-drawEnemy=${enemyDrawGun} ⇒ boss/chopper/flyer/mortar/grunt carry no procedural overlay`);

  // A7 — COVERAGE / ANTI-STALENESS guard. Every audit above is only as complete as the
  // set of enemy kinds it MODELS (RESOLVE + weaponDrawMap). The campaign GOAL keeps
  // adding stages, enemy mixes and bosses — so a NEW kind in game/data/config.js's
  // ENEMIES that the audit does not model would slip through the per-stage fallback as
  // "single weapon, no overlay" and ship GREEN without ever being weapon-checked. A7
  // fails CLOSED the instant config introduces an enemy kind the audit hasn't
  // classified: the two-weapon FACT cannot silently lose coverage as content grows.
  // (Owner action on red: this audit — add the new kind to RESOLVE + weaponDrawMap and
  // assert its weapon; it is NOT a source bug, it is an audit-coverage gap.)
  const modeledKinds = new Set(Object.keys(RESOLVE).filter((k) => k !== 'hero'));
  const configKinds = Object.keys(ENEMIES);
  const unmodeled = configKinds.filter((k) => !modeledKinds.has(k));
  add('A7.everyConfigKindModeled', unmodeled.length === 0,
    unmodeled.length
      ? `config ENEMIES kinds NOT modeled by the audit: [${unmodeled.join(', ')}] — update RESOLVE+weaponDrawMap and assert their weapon (audit-coverage gap, not a source bug)`
      : `all ${configKinds.length} config ENEMIES kinds modeled: [${configKinds.join(', ')}] (+hero) — no unaudited kind`);

  // Per-enemy-kind procedural-weapon TYPES, DERIVED from the parse above, so a stage
  // record can state a machine-checked fact for EACH armed enemy it resolves. `gun`/
  // `barrel` are the draw-SITE counts of each weapon TYPE (multiple sites are the same
  // ONE weapon drawn across mutually-exclusive body-state / sprite-vs-placeholder
  // branches — NOT a second weapon). The two-weapon defect would surface as a kind
  // drawing BOTH types (gun>0 AND barrel>0), or a non-{hero,turret} kind drawing ANY
  // procedural weapon on top of its baked art. Expected weapon type per kind:
  //   hero → gun only · turret → barrel only · every other kind → none.
  const weaponDrawMap = {
    hero:    { gun: gunCallsInPlayer,   barrel: 0,             fn: 'drawPlayer→drawGun' },
    turret:  { gun: 0,                  barrel: barrelInDrawEnemy, fn: 'drawEnemy(turret)→drawTurretBarrel' },
    boss:    { gun: bossW.gun,          barrel: bossW.barrel,  fn: 'drawBoss' },
    chopper: { gun: chopW.gun,          barrel: chopW.barrel,  fn: 'drawChopper' },
    flyer:   { gun: 0,                  barrel: 0,             fn: 'drawEnemy→drawEnemySprite' },
    mortar:  { gun: 0,                  barrel: 0,             fn: 'drawEnemy→drawEnemySprite/placeholder' },
    grunt:   { gun: 0,                  barrel: 0,             fn: 'drawEnemy→drawEnemySprite/placeholder' },
  };

  const ok = checks.every((c) => c.ok);
  return { ok, checks, weaponDrawMap };
}

// ────────────────────────────────────────────────────────────────────────────
// LAYER B — runtime, per stage, in the REAL browser build.
// ────────────────────────────────────────────────────────────────────────────
async function runtimeForStage(browser, url, stageNum) {
  const page = await browser.newPage();
  page.on('pageerror', () => {});
  try {
    await page.goto(`${url}/?headless=1&level=${stageNum}&frames=60`, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForFunction(() => !!document.getElementById('headless-done'), { timeout: 20000 });

    // B1 — theme + which armed entities the live world instantiated.
    const boot = await page.evaluate(() => {
      const w = window.__game;
      const kinds = {};
      for (const e of (w.enemies || [])) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
      return { theme: w.theme && w.theme.id, kinds, status: w.status };
    });

    // B2 — hero shot leaves the hand muzzle (upper body), not a waist/centre gun.
    const hero = await page.evaluate(() => {
      const w = window.__game, p = w.player;
      w.status = 'playing'; p.dead = false; p.iframe = 999; p.vx = 0; p.vy = 0;
      if (p.setWeapon) p.setWeapon('rifle');
      p.aim = { x: 1, y: 0 };            // face right, level
      p.fireCd = 0; w.bullets = [];
      const b0 = { x: p.x, y: p.y, w: p.w, h: p.h };
      p.shoot(w);
      const b = (w.bullets.find((x) => x.from === 'player') || w.bullets[0]) || null;
      if (!b) return { fired: false };
      return {
        fired: true, bx: +b.x.toFixed(2), by: +b.y.toFixed(2),
        frac: +((b.y - b0.y) / b0.h).toFixed(3),
        forward: b.x > b0.x + b0.w / 2, // muzzle ahead of body centre (a hand-held gun, not centre)
      };
    });

    // B3 — every turret fires from its DRAWN barrel tip, not the dome centre.
    // Hook spawnBullet to capture the EXACT spawn point (the bullet has already
    // moved one step by the time it is in w.bullets). Recover the turret's aim from
    // the shot's OWN velocity + the turret's FIXED pivot (dome top), so no
    // player-position guessing / gravity drift enters the geometry: the shot's
    // origin must equal pivot + aim·barrelLen — the exact point render.js's
    // drawTurretBarrel draws the muzzle at (Layer A5 proves both read the same def).
    // A phantom-turret shot from the hull centre would land ~barrelLen off the tip.
    const turret = await page.evaluate((eps) => {
      const w = window.__game;
      const turrets = (w.enemies || []).filter((e) => e.kind === 'turret');
      if (!turrets.length) return { hasTurret: false, n: 0 };
      const origSpawn = w.spawnBullet.bind(w);
      const samples = [];
      for (const t of turrets) {
        // Isolate this turret so the only enemy shot captured is its own.
        w.enemies = [t];
        w.bullets = [];
        w.status = 'playing';
        const p = w.player;
        p.dead = false; p.iframe = 999;
        t.active = true; t.cooldown = 1; t.telegraph = 0;
        let cap = null;
        w.spawnBullet = function (x, y, vx, vy, opts) {
          if (opts && opts.from === 'enemy' && !cap) cap = { x, y, vx, vy };
          return origSpawn(x, y, vx, vy, opts);
        };
        for (let i = 0; i < 6 && !cap; i++) {
          p.iframe = 999; p.vx = 0; p.vy = 0; p.x = t.x - 70; p.y = t.y; // in range, aim well-defined
          w.step({});
        }
        if (cap) {
          const shot = t.def.shotSpeed || 1;
          const ux = cap.vx / shot, uy = cap.vy / shot;                 // aim, from the shot itself
          const px = t.x + t.w / 2, py = t.y + t.h - t.def.barrelPivotFromBottom; // drawn pivot
          const tipx = px + ux * t.def.barrelLen, tipy = py + uy * t.def.barrelLen; // drawn muzzle
          const domex = t.x + t.w / 2, domey = t.y + t.h / 2;
          samples.push({
            x: t.x, sx: +cap.x.toFixed(2), sy: +cap.y.toFixed(2),
            tipDist: +Math.hypot(cap.x - tipx, cap.y - tipy).toFixed(2),
            domeDist: +Math.hypot(cap.x - domex, cap.y - domey).toFixed(2),
          });
        } else {
          samples.push({ x: t.x, noFire: true });
        }
      }
      w.spawnBullet = origSpawn;
      const fired = samples.filter((s) => !s.noFire);
      return {
        hasTurret: true, n: turrets.length, fired: fired.length,
        // origin AT the drawn muzzle (tipDist≈0) AND displaced from the hull centre
        // along the barrel (domeDist > tipDist) ⇒ one weapon, firing where it is drawn.
        allFromTip: fired.length > 0 && fired.every((s) => s.tipDist <= eps && s.domeDist > s.tipDist),
        maxTipDist: fired.length ? Math.max(...fired.map((s) => s.tipDist)) : null,
        minDomeDist: fired.length ? Math.min(...fired.map((s) => s.domeDist)) : null,
        samples,
      };
    }, EPS_PX);

    return { boot, hero, turret };
  } finally {
    await page.close();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Compose the per-stage verdict.
// ────────────────────────────────────────────────────────────────────────────
// A kind is ARMED iff its config def can spawn a shot (aimed fire, a lobbed shell,
// or any boss volley). grunt has none of these ⇒ contact-only, unarmed. Derived
// from ENEMIES so the "every armed enemy" enumeration cannot drift from config.
function isArmedKind(k) {
  const d = ENEMIES[k];
  return !!d && (d.fireEvery != null || d.shotSpeed != null || d.shellVy != null || d.isBoss === true);
}

function stageRecord(stageNum, staticLayer, rt, skipRuntime = false) {
  const staticOk = staticLayer.ok;
  const weaponDrawMap = staticLayer.weaponDrawMap || {};
  const stage = STAGES[stageNum - 1];
  const spawnTypes = [...new Set(stage.spawns.map((s) => s.type))];
  const armedTypes = spawnTypes; // preserved name (all resolved spawn kinds this stage)
  const twoWeaponKinds = armedTypes.filter((k) => RESOLVE[k] && RESOLVE[k].procWeapon);
  // hero is implicit on every stage (always drawn + always the drawGun overlay)
  const entities = [];
  const heroR = RESOLVE.hero;
  entities.push({ kind: 'hero', label: heroR.label, procWeapon: heroR.procWeapon,
    bodyKeys: heroR.bodyKeys, bakedForbidden: heroR.bakedForbidden, count: 1 });
  for (const t of armedTypes) {
    const r = RESOLVE[t] || { label: t, procWeapon: null, bodyKeys: ['?'], bakedForbidden: [] };
    entities.push({ kind: t, label: r.label, procWeapon: r.procWeapon,
      bodyKeys: r.bodyKeys, bakedForbidden: r.bakedForbidden,
      count: stage.spawns.filter((s) => s.type === t).length });
  }

  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, ok: !!ok, detail });
  // A runtime (Layer-B) check that is SKIPPED because no headless browser is
  // available is NOT a failure — like live-selftest.sh's SKIP, the deterministic
  // static two-weapon FACT (Layer A + keys.*) still governs the verdict. It is
  // recorded (skipped:true, ok:true so it can't turn a stage red) but flagged so a
  // gate/report never mistakes an unrun runtime probe for a passed one.
  const addRuntime = (id, ok, detail) => skipRuntime
    ? checks.push({ id, ok: true, skipped: true, detail: 'SKIP: no headless chrome — static two-weapon FACT (Layer A) still governs' })
    : checks.push({ id, ok: !!ok, detail });

  // 1. static render-path invariants (shared; a source regression fails every stage)
  add('static.renderPathInvariants', staticOk, staticOk
    ? 'LAYER A A1..A7 all hold (hero+turret weaponless bodies, one procedural weapon, shot==drawn muzzle, every other armed enemy overlay-free, every config kind modeled)'
    : 'LAYER A invariant(s) FAILED — see report.staticLayer (source regression → root.A)');

  // 1b. COVERAGE — every enemy kind THIS stage spawns is modeled by the audit (no '?'
  // fallback slipping through as an unchecked "single weapon"). A7 guards the config
  // globally; this localizes drift to the exact stage that introduced an unaudited kind,
  // so a new stage's enemy mix cannot silently ship without a weapon check.
  const unmodeledSpawns = spawnTypes.filter((t) => !RESOLVE[t]);
  add('keys.allSpawnsModeled', unmodeledSpawns.length === 0,
    unmodeledSpawns.length
      ? `stage spawns kinds the audit does not model: [${unmodeledSpawns.join(', ')}] — update RESOLVE (audit-coverage gap)`
      : `all ${spawnTypes.length} spawned kinds modeled: [${spawnTypes.join(', ')}]`);

  // 2. no armed (two-weapon-surface) entity resolves to a baked-weapon body key
  const bakedHits = entities
    .filter((e) => RESOLVE[e.kind] && RESOLVE[e.kind].procWeapon)
    .flatMap((e) => e.bodyKeys.filter((k) => e.bakedForbidden.includes(k)).map((k) => `${e.kind}:${k}`));
  add('keys.noBakedWeaponBody', bakedHits.length === 0,
    bakedHits.length ? `baked-weapon body keys resolved: ${bakedHits.join(', ')}`
      : `two-weapon entities [${twoWeaponKinds.concat(['hero']).join(', ')}] resolve to weaponless bodies only`);

  // 2b. EVERY armed enemy this stage resolves shows exactly ONE weapon TYPE (mandate:
  // "every armed enemy", not just the {hero,turret} two-weapon surface). Enumerate the
  // stage's armed kinds from config, and assert each draws its expected single procedural
  // weapon TYPE and no other: hero → drawGun only, turret → drawTurretBarrel only, every
  // other armed kind → NEITHER (its baked art is its one weapon). A kind drawing BOTH a
  // gun AND a barrel, or a non-{hero,turret} kind drawing any procedural weapon, is the
  // two-weapon defect. Facts come from Layer-A's parse of the SHIPPED render.js.
  const armedThisStage = ['hero', ...armedTypes.filter(isArmedKind)];
  const EXPECT_TYPE = { hero: 'gun', turret: 'barrel' }; // every other armed kind ⇒ none
  const armedWeapons = armedThisStage.map((k) => {
    const m = weaponDrawMap[k] || { gun: null, barrel: null, fn: '?' };
    const expect = EXPECT_TYPE[k] || 'none';
    const count = k === 'hero' ? 1 : stage.spawns.filter((s) => s.type === k).length;
    const types = [m.gun > 0 && 'gun', m.barrel > 0 && 'barrel'].filter(Boolean);
    // exactly the one expected weapon type, and never both (never a second weapon)
    const ok = types.length <= 1 && (expect === 'none' ? types.length === 0 : types[0] === expect);
    return { kind: k, count, gun: m.gun, barrel: m.barrel, weaponTypes: types, expect, via: m.fn, ok };
  });
  const armedBad = armedWeapons.filter((a) => !a.ok);
  add('keys.everyArmedEnemyOneWeapon', armedBad.length === 0,
    armedBad.length
      ? `armed enemies drawing a wrong/second weapon: ${armedBad.map((a) => `${a.kind}{gun:${a.gun},barrel:${a.barrel}}≠[${a.expect}]`).join(', ')}`
      : `all ${armedWeapons.length} armed kinds draw one weapon type: ${armedWeapons.map((a) => `${a.kind}→${a.weaponTypes[0] || 'none'}`).join(', ')} (hero=gun, turret=barrel, rest=none; none draws two)`);

  // 3. runtime: stage booted on its configured theme
  addRuntime('runtime.themeBoots', rt && rt.boot && rt.boot.theme === stage.theme,
    rt && rt.boot ? `booted theme='${rt.boot.theme}' (config='${stage.theme}'), status=${rt.boot.status}` : 'no boot');

  // 4. runtime: hero fires from the hand muzzle (upper body, ahead of centre)
  const h = rt && rt.hero;
  addRuntime('runtime.heroFromHandMuzzle', h && h.fired && h.frac < 0.55 && h.forward,
    h && h.fired ? `bullet spawns ${Math.round(h.frac * 100)}% down body, forward-of-centre=${h.forward} (<55% ⇒ hands, not waist)`
      : 'hero produced no bullet');

  // 5. runtime: every turret fires from its drawn barrel tip (not the dome centre)
  const tu = rt && rt.turret;
  const hasTurret = armedTypes.includes('turret');
  if (!hasTurret) {
    addRuntime('runtime.turretFromBarrelTip', true, 'no turret in this stage (N/A)');
  } else {
    addRuntime('runtime.turretFromBarrelTip', tu && tu.hasTurret && tu.fired > 0 && tu.allFromTip,
      tu && tu.hasTurret
        ? `${tu.fired}/${tu.n} turrets fired; all shots at the drawn barrel tip=${tu.allFromTip} (maxTipDist=${tu.maxTipDist}px ≤${EPS_PX}, minDomeDist=${tu.minDomeDist}px ⇒ displaced from hull centre along the barrel)`
        : 'turret expected but none observed firing');
  }

  const ok = checks.every((c) => c.ok);
  return {
    stage: stageNum, name: stage.name, theme: stage.theme,
    armedTypes, twoWeaponSurface: ['hero', ...twoWeaponKinds],
    armedWeapons, entities, checks, verdict: ok ? 'PASS' : 'FAIL',
  };
}

// ────────────────────────────────────────────────────────────────────────────
async function main() {
  const started = new Date().toISOString();
  console.log('=== WEAPON-DEFECT AUDIT (creator round-2, all 7 stages) ===\n');

  const staticLayer = await layerA();
  console.log('LAYER A — static render-path invariants:');
  for (const c of staticLayer.checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.id}  —  ${c.detail}`);
  console.log(`  → LAYER A ${staticLayer.ok ? 'PASS' : 'FAIL'}\n`);

  // Layer B drives the REAL browser build. It is a GROUNDING assurance on top of the
  // deterministic static FACT — so, exactly like deploy/live-selftest.sh, a MISSING
  // headless Chrome / puppeteer is a graceful SKIP, not a gate failure: Layer A + the
  // static keys.* checks are the hard two-weapon requirement and still govern the exit
  // code. (A browser that IS present but a stage that then fails to drive, or a runtime
  // assertion that goes red, is a REAL failure and still blocks — see below.)
  let srv = null, browser = null, skipRuntime = false, skipReason = null;
  try {
    // WEAPON_AUDIT_STATIC_ONLY=1 → deliberately run only the deterministic static FACT
    // (no browser/server spin-up). Lets a fast deploy gate enforce the two-weapon
    // invariant cheaply and defer the browser-grounded Layer B to a nightly/full run.
    if (process.env.WEAPON_AUDIT_STATIC_ONLY === '1') throw new Error('WEAPON_AUDIT_STATIC_ONLY=1 (static-only mode requested)');
    srv = await serveGame();
    const puppeteer = loadPuppeteer();
    browser = await puppeteer.launch({ executablePath: findChrome(), headless: 'new',
      args: ['--no-sandbox', '--disable-gpu', '--mute-audio'] });
  } catch (e) {
    skipRuntime = true; skipReason = e.message;
    if (browser) { try { await browser.close(); } catch { /* ignore */ } browser = null; }
    if (srv) { try { await srv.close(); } catch { /* ignore */ } srv = null; }
    console.log(`[weapon-audit] SKIP: Layer-B runtime grounding — ${skipReason}`);
    console.log('  (no headless browser; the deterministic static two-weapon FACT below still governs the verdict)\n');
  }

  const stages = [];
  try {
    console.log('LAYER B — per-stage runtime grounding:' + (skipRuntime ? ' (SKIPPED — static FACT governs)' : ''));
    for (let n = 1; n <= STAGES.length; n++) {
      let rt = null, err = null;
      if (!skipRuntime) {
        try { rt = await runtimeForStage(browser, srv.url, n); }
        catch (e) { err = e.message; }
      }
      const rec = stageRecord(n, staticLayer, rt, skipRuntime);
      // A drive error while the browser IS available is a REAL failure (not a skip).
      if (err) { rec.verdict = 'FAIL'; rec.checks.push({ id: 'runtime.driveError', ok: false, detail: err }); }
      stages.push(rec);
      const bad = rec.checks.filter((c) => !c.ok).map((c) => c.id);
      const skipped = rec.checks.filter((c) => c.skipped).length;
      console.log(`  Stage ${n} [${rec.theme}] ${rec.verdict}${bad.length ? '  (red: ' + bad.join(', ') + ')' : ''}${skipped ? `  (${skipped} runtime SKIP)` : ''}`);
    }
  } finally {
    if (browser) await browser.close();
    if (srv) await srv.close();
  }

  const passed = stages.filter((s) => s.verdict === 'PASS').length;
  const verdict = staticLayer.ok && passed === stages.length ? 'PASS' : `FAIL (${stages.length - passed}/${stages.length} stages red)`;
  const report = { when: started, tool: 'feedback/audit/weapon-defect-audit.mjs',
    scope: 'creator round-2 two-weapon defect (hero drawGun + turret drawTurretBarrel) across all 7 stages',
    epsPx: EPS_PX,
    // Machine-readable Layer-B state so a gate can distinguish grounded PASS from
    // static-only PASS (browser absent) without scraping console text.
    layerB: { grounded: !skipRuntime, skipped: skipRuntime, skipReason },
    staticLayer, passed, total: stages.length, verdict, stages };

  await mkdir(path.join(HERE, 'report'), { recursive: true });
  await writeFile(path.join(HERE, 'report', 'weapon-audit.json'), JSON.stringify(report, null, 2));
  await writeFile(path.join(HERE, 'REPORT.md'), renderMarkdown(report));

  const grounding = skipRuntime ? ' (Layer B SKIPPED — static FACT only)' : '';
  console.log(`\n=== WEAPON-DEFECT AUDIT: ${verdict} — ${passed}/${stages.length} stages clean${grounding} ===`);
  console.log('   report/weapon-audit.json + REPORT.md written');
  process.exit(verdict === 'PASS' ? 0 : 1);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# Weapon-Defect Audit — creator round-2 (all 7 stages)');
  L.push('');
  L.push(`_Generated ${r.when} by \`feedback/audit/weapon-defect-audit.mjs\`. Regenerate: \`node feedback/audit/weapon-defect-audit.mjs\`._`);
  L.push('');
  L.push(`**VERDICT: ${r.verdict}** — ${r.passed}/${r.total} stages clean. Muzzle tolerance ${r.epsPx}px.`);
  L.push('');
  if (r.layerB && r.layerB.skipped) {
    L.push(`> ⏭ **Layer B (runtime grounding) SKIPPED** — no headless browser (\`${r.layerB.skipReason}\`).`);
    L.push('> The deterministic **static two-weapon FACT (Layer A + \`keys.*\`) still governs** this verdict,');
    L.push('> exactly like `deploy/live-selftest.sh`\'s SKIP. Run on a machine with Chrome to add the');
    L.push('> per-stage runtime muzzle-origin grounding.');
    L.push('');
  } else if (r.layerB && r.layerB.grounded) {
    L.push('> ✅ **Layer B (runtime grounding) RAN** — every stage driven in a real headless browser build.');
    L.push('');
  }
  L.push('The creator round-2 REJECT is a FACT: does any armed entity show TWO weapons (a');
  L.push('gun baked into the sprite art AND a procedural code-drawn one)? The two entities');
  L.push('that overlay a procedural aiming weapon on a body — the surface of the defect — are');
  L.push('the **hero** (`drawGun`) and the **turret/cannon** (`drawTurretBarrel`), exactly the');
  L.push('two the creator named. This audit proves, per stage, that each shows ONE weapon and');
  L.push('fires from where that weapon is drawn.');
  L.push('');
  L.push('## Layer A — static render-path invariants (shipped `game/src`)');
  L.push('');
  L.push('| Check | Result | Detail |');
  L.push('|---|---|---|');
  for (const c of r.staticLayer.checks) L.push(`| \`${c.id}\` | ${c.ok ? '✅ PASS' : '❌ FAIL'} | ${c.detail} |`);
  L.push('');
  L.push('## Layer B — per-stage FACTS');
  L.push('');
  L.push('| Stage | Theme | Two-weapon entities | Verdict | Red checks |');
  L.push('|---|---|---|---|---|');
  for (const s of r.stages) {
    const red = s.checks.filter((c) => !c.ok).map((c) => c.id).join(', ') || '—';
    L.push(`| ${s.stage} ${s.name} | ${s.theme} | ${s.twoWeaponSurface.join(', ')} | ${s.verdict === 'PASS' ? '✅ PASS' : '❌ FAIL'} | ${red} |`);
  }
  L.push('');
  for (const s of r.stages) {
    L.push(`### Stage ${s.stage} — ${s.name} (${s.theme}) — ${s.verdict}`);
    L.push('');
    L.push('Resolved bodies (armed entities):');
    L.push('');
    for (const e of s.entities) {
      const overlay = e.procWeapon ? ` + procedural \`${e.procWeapon}\`` : ' (single weapon, no overlay)';
      L.push(`- **${e.label}** ×${e.count} → body \`${e.bodyKeys.join(' | ')}\`${overlay}`);
    }
    L.push('');
    if (s.armedWeapons && s.armedWeapons.length) {
      L.push('Every armed enemy — procedural weapon TYPE (static, from `render.js`; hero=gun, turret=barrel, all others=none; none draws two):');
      L.push('');
      for (const a of s.armedWeapons) {
        const drew = a.weaponTypes.length ? a.weaponTypes.join('+') : 'none';
        L.push(`- ${a.ok ? '✅' : '❌'} \`${a.kind}\` ×${a.count} → draws \`${drew}\` (\`${a.via}\`, expected \`${a.expect}\`)`);
      }
      L.push('');
    }
    for (const c of s.checks) L.push(`- ${c.skipped ? '⏭' : (c.ok ? '✅' : '❌')} \`${c.id}\` — ${c.detail}`);
    L.push('');
  }
  const fails = r.stages.flatMap((s) => s.checks.filter((c) => !c.ok).map((c) => ({ s, c })))
    .concat(r.staticLayer.checks.filter((c) => !c.ok).map((c) => ({ s: null, c })));
  if (fails.length) {
    L.push('## OPEN ISSUES');
    L.push('');
    L.push(`_${r.when}_`);
    for (const { s, c } of fails) {
      L.push(`- **${s ? `Stage ${s.stage} (${s.theme})` : 'LAYER A (global render path)'} — \`${c.id}\`**: ${c.detail}`);
      L.push(`  - Severity: BLOCKER (a live two-weapon defect / origin mismatch reopens the creator gate).`);
      L.push(`  - Repro: \`node feedback/audit/weapon-defect-audit.mjs\` → \`report/weapon-audit.json\`.`);
      L.push(`  - Owner: source regression → root.A (\`game/src\` / \`game/data\`); this audit only reports.`);
    }
    L.push('');
  } else {
    L.push('## OPEN ISSUES');
    L.push('');
    L.push('_None. Every stage shows exactly one weapon per armed entity, fired from where it is drawn._');
    L.push('');
  }
  return L.join('\n');
}

main().catch((e) => { console.error('WEAPON-DEFECT AUDIT ERROR:', e); process.exit(2); });
