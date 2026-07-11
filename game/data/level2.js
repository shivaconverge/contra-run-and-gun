// ============================================================================
// STAGE-2 SPEC ARTIFACT — "Cascade Base" (waterfall / bridge-over-water approach)
// ============================================================================
// READY-TO-WIRE data object authored on the EXACT `game/data/level1.js` schema
// (name/width/height/gravityFloor/solids/water/spawns/pickups/playerStart/goalX).
// HANDOFF for root.B — copy to `game/data/level2.js` as `export const LEVEL2 = {...}`
// and wire the stage transition (see ../SPEC.md §5).
//
// CONVENTIONS VERIFIED AGAINST THE REAL ENGINE (level1.js, world.js, render.js,
// physics.js) this cycle — a parent correction fixed my earlier guess:
//   • BRIDGE deck  = a `kind:'ground'` solid with a `bridge:true` FLAG. Collision is
//     normal ground; the flag only switches the RENDER to planks+trusses. NOT a new
//     solid kind. (level1.js:22,24 · render.js:303,350)
//   • WATER        = a top-level `water:[]` array of {x,y,w,h} bands drawn BEHIND the
//     deck (render.js:205 reads `world.level.water`). Purely VISUAL/atmospheric — the
//     real fall-hazard is the literal GAP between ground segments (drop past
//     gravityFloor = pit death, world._onPitFall). Water bands do NOT collide.
//   • CATWALK      = a `kind:'platform'` solid with a `catwalk:true` FLAG (high bypass
//     route; render.js:388,416). NOT a new kind.
//   • BOSS         = registered by `world.js:45` as `enemies.find(e=>e.kind==='boss')`.
//     A `chopper` boss is NOT found this way → the ONLY true [ENGINE-ADD] here is the
//     `chopper` archetype + generalizing boss-detection to a flag. See ../SPEC.md §4.
//
// So Stage-2 needs NO new solid kinds — it reuses the shipped bridge/water/catwalk
// grammar, which also means it exercises creator #1's bridge-over-water art path.
// ============================================================================

export const LEVEL2 = {
  name: 'Cascade Base',
  // Biome id → resolved via THEMES (config.js), exposed on world.theme (data-driven
  // render/audio selection). Additive; ignored safely by the current renderer.
  theme: 'cascade',
  width: 2600,
  height: 270,
  // Falling below this y is a PIT/WATER DEATH (world._onPitFall). The water GAPS
  // below rely on it exactly like the Stage-1 chasm/bridge-gap.
  gravityFloor: 268,

  solids: [
    // --- Ground broken by two WATER channels crossed on plank BRIDGES (the shipped
    //     bridge grammar: kind:'ground' + bridge:true). Mirrors Stage-1's CR-1 motif. ---
    { x: 0,    y: 236, w: 560, h: 40, kind: 'ground' },
    // WATER CHANNEL 1 (x560..720, 160px) — INTACT bridge deck (safe teaching cross).
    { x: 560,  y: 236, w: 160, h: 40, kind: 'ground', bridge: true },
    { x: 720,  y: 236, w: 460, h: 40, kind: 'ground' },
    // WATER CHANNEL 2 (x1180..1460, 280px) — BROKEN bridge: two deck stubs with a
    // 56px missing-plank GAP (x1290..1346) over open water = jump-or-die, matching the
    // Stage-1 gap reach (~79px running jump clears it). High catwalk bypasses it.
    { x: 1180, y: 236, w: 110, h: 40, kind: 'ground', bridge: true }, // deck stub A
    // — 56px water gap here (x1290–1346): no deck; drop through = pit death —
    { x: 1346, y: 236, w: 114, h: 40, kind: 'ground', bridge: true }, // deck stub B
    // Continuous ground up to and PAST the barrier so the player can stand at the
    // firing line (x2140) — no accidental pit here (validated). Boss arena is the
    // far end; the chopper hovers over it.
    { x: 1460, y: 236, w: 1140, h: 40, kind: 'ground' },

    // --- MULTI-HEIGHT platforming (creator #1 "multiple heights"): a low approach
    //     tier, a HIGH mesa feeding the catwalk bypass over the broken bridge, then a
    //     descent + pre-boss perches. Two readable tiers. ---
    { x: 300,  y: 188, w: 80,  h: 10, kind: 'platform' }, // low, approach
    { x: 780,  y: 170, w: 90,  h: 10, kind: 'platform' }, // pre-channel-2 step-up
    { x: 1000, y: 138, w: 110, h: 10, kind: 'platform' }, // HIGH mesa (catwalk lead-in)
    // Upper CATWALK over the broken bridge — the genuine high route (multi-height):
    // reachable from the 1000 mesa, spans the water gap, drop off the right onto the
    // 1400 platform / far deck. Set above the ground run-jump apex so the low route
    // still clears the gap cleanly under it (mirrors level1.js:46).
    { x: 1250, y: 120, w: 150, h: 8,  kind: 'platform', catwalk: true },
    { x: 1400, y: 150, w: 90,  h: 10, kind: 'platform' }, // catwalk drop-off / descent
    { x: 1600, y: 180, w: 100, h: 10, kind: 'platform' }, // descent
    { x: 1800, y: 150, w: 90,  h: 10, kind: 'platform' }, // pre-boss high sentry perch
    { x: 1980, y: 190, w: 120, h: 10, kind: 'platform' }, // pre-boss ground cover

    // Boss-arena barrier: stops the player at a firing line, lets bullets pass
    // (noBullet) — same convention as Stage-1 (level1.js:50). Chopper fights across it.
    { x: 2140, y: 90, w: 12, h: 146, kind: 'barrier', noBullet: true },
  ],

  // Water channels beneath the two bridges (visual/atmospheric band; the hazard is
  // the ground gap, not this rect). Same shape as level1.js `water:[]`.
  water: [
    { x: 560,  y: 244, w: 160, h: 24 }, // channel 1 (under intact deck)
    { x: 1180, y: 244, w: 280, h: 24 }, // channel 2 (under broken deck + the gap)
  ],

  // Enemy wave CHOREOGRAPHY — reuses the 4 shipped non-boss archetypes
  // (grunt/turret/flyer/mortar); the boss is NEW. Distinct from Stage-1 by USING THE
  // THEME: flyers own the open water where there's no ducking cover; a mortar denies
  // the broken-bridge jump timing.
  spawns: [
    // Wave 1 — ground approach ramp-in (grunt pair + sentry on the low platform)
    { type: 'grunt',  x: 260, y: 210 },
    { type: 'grunt',  x: 340, y: 210 },
    { type: 'turret', x: 320, y: 172 },
    // Wave 2 — BRIDGE 1 aerial ambush: two drones strafe while you're exposed on the
    // deck over open water (no low cover) — the theme's signature threat.
    { type: 'flyer',  x: 640, y: 120 },
    { type: 'flyer',  x: 700, y: 140 },
    { type: 'grunt',  x: 760, y: 210 }, // grunt waiting on the far bank
    // Wave 3 — MULTI-HEIGHT firefight: high-mesa turret suppresses while a mortar lobs
    // onto the broken-bridge crossing (area-denial forces a committed jump/bypass).
    { type: 'turret', x: 1030, y: 122 },
    { type: 'mortar', x: 1000, y: 122 },
    { type: 'grunt',  x: 900,  y: 210 },
    { type: 'grunt',  x: 960,  y: 210 },
    // Wave 4 — far-bank landing party (3 runners + sentry + closing drone).
    { type: 'grunt',  x: 1500, y: 210 },
    { type: 'grunt',  x: 1570, y: 210 },
    { type: 'grunt',  x: 1640, y: 210 },
    { type: 'turret', x: 1620, y: 164 },
    { type: 'flyer',  x: 1620, y: 120 },
    // Wave 5 — pre-boss gauntlet (high sentry perch + swarm + mortar on the run-in)
    { type: 'turret', x: 1830, y: 134 },
    { type: 'mortar', x: 1840, y: 210 },
    { type: 'grunt',  x: 1960, y: 210 },
    { type: 'grunt',  x: 2020, y: 210 },
    { type: 'grunt',  x: 2080, y: 210 },
    // STAGE-2 BOSS — the ATTACK CHOPPER "GUNSHIP" (arcade §4). A MOVING AERIAL boss,
    // mechanically distinct from Stage-1's fixed wall Sentinel: sweeps the arena
    // horizontally, drops bombs (mortar-arc), phase-2 strafes low.
    // [ENGINE-ADD archetype 'chopper' + boss-detection flag] — see ../SPEC.md §4.
    { type: 'chopper', x: 2340, y: 120 },
  ],

  // Weapon pickups — carries the arcade single-slot arc. Early SPREAD (bridge fights
  // want fan coverage vs drones), a mid LASER on the high route (reward for the mesa
  // bypass + pierce for the turret), a pre-boss MACHINE resupply so the chopper fight
  // isn't rifle-only.
  pickups: [
    { weapon: 'spread',  x: 460,  y: 218 },
    { weapon: 'laser',   x: 1300, y: 108 }, // on the catwalk — reward for the high route
    { weapon: 'machine', x: 1700, y: 218 },
    { weapon: 'spread',  x: 2020, y: 218 }, // pre-boss safety net
  ],

  // Biome SET-DRESSING (contract in config.js): rusty pipe-valve props base-anchored on
  // the ground, giving the Cascade Base its industrial read. x over ground, clear of the
  // water gap (x1290–1346) and the boss arena (x>2140). Inert until render blits it.
  decor: [
    { x: 400,  key: 'decor_cascade_valve' },
    { x: 980,  key: 'decor_cascade_valve' },
    { x: 1650, key: 'decor_cascade_valve' },
  ],

  playerStart: { x: 40, y: 200 },
  goalX: 2340, // chopper's x is the fight trigger; boss.dead = stage clear
};
