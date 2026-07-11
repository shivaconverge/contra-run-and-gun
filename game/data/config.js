// Data-driven tuning for the vertical slice.
// All units are pixels-per-fixed-step (the sim runs at STEP_HZ). Edit freely;
// nothing here is hardcoded in the engine — the engine reads these values.
// Strategy: task_data_driven_content_arch (config, not hardcoded).
//
// This file also assembles the 7-stage CAMPAIGN ladder (bottom of file) from the
// authored geometries + a data-driven per-stage THEME descriptor, so the campaign
// spine (clear N → N+1 → … → VICTORY) is pure data the engine reads, not hardcoded.
import { LEVEL1 } from './level1.js';
import { LEVEL2 } from './level2.js';

export const SIM = {
  STEP_HZ: 60,          // fixed-timestep updates per second
  VIEW_W: 480,          // logical render width  (retro 16:9-ish)
  VIEW_H: 270,          // logical render height
  MAX_FRAME_STEPS: 5,   // clamp catch-up after a stall
};

export const PHYSICS = {
  gravity: 0.5,
  maxFall: 9,
  runSpeed: 2.3,
  groundAccel: 0.55,
  airAccel: 0.32,
  friction: 0.42,
  jumpVel: 8.6,
  // Contra HARD INVARIANT (arcade-contra-1987.md §2): the jump arc is a FIXED
  // parabola — height is NOT variable-with-button-hold like Mario. So jump-cut
  // is OFF by default (arcade-faithful). Flag kept data-driven/reversible in
  // case player-preference data later favours the modern variable-height feel.
  // Exact apex/airtime remain [MEASURE]-gated on CAP footage; only the
  // fixed-vs-variable *shape* is fixed here (jumpVel unchanged).
  jumpCutEnabled: false,
  jumpCut: 0.45,        // (only applied when jumpCutEnabled) upward-vel multiplier on early release
  coyoteFrames: 6,      // grace after leaving a ledge
  jumpBufferFrames: 6,  // grace pressing jump before landing
};

export const PLAYER = {
  w: 12, h: 20,          // standing hitbox
  proneH: 11,            // prone hitbox height — short enough to duck aimed fire
  // Contra HARD INVARIANT (reference/teardowns/arcade-contra-1987.md §1):
  // ONE-HIT DEATH — no health bar. Any hit costs a life; weapon reverts to the
  // default rifle on death, so dying is a real setback.
  lives: 3,
  respawnProtect: 90,   // spawn-in invulnerability frames (blink), NOT a health bar
  hitIFrames: 66,       // invuln after a CASUAL-mode shield hit (arcade never uses it)
  defaultWeapon: 'rifle',
  spawn: { x: 40, y: 180 },
};

// Difficulty is DATA. ARCADE is the default and is the pure Contra invariant
// (one-hit death, no shield). CASUAL is an OPTIONAL accessibility hedge the
// competitor corpus recommends (modern Contra-likes ship health) — a small
// shield + extra lives so more players/testers can reach & judge the boss.
// The arcade identity is never diluted; casual is opt-in.
export const DIFFICULTY = {
  default: 'arcade',
  order: ['arcade', 'casual'],
  modes: {
    arcade: { label: 'ARCADE', lives: 3, shield: 0 },
    casual: { label: 'CASUAL', lives: 5, shield: 2 },
  },
};

// Weapons are data: the engine spawns bullets from these numbers.
export const WEAPONS = {
  rifle: {
    name: 'Rifle',
    fireRate: 7,        // frames between shots
    bulletSpeed: 6.4,
    damage: 1,
    spread: 0.0,        // radians of random cone
    pellets: 1,
    recoil: 0.35,       // player push-back along -aim
    trauma: 0.16,       // screen-shake added per shot
    bulletLife: 90,
    color: '#ffe36e',
  },
  spread: {
    name: 'Spread',
    fireRate: 12,
    bulletSpeed: 5.6,
    damage: 1,
    spread: 0.28,
    pellets: 5,
    recoil: 0.6,
    trauma: 0.3,
    bulletLife: 70,
    color: '#8ef0ff',
  },
  // Machine Gun (arcade §3 'M'): a fast single stream held down.
  machine: {
    name: 'Machine',
    fireRate: 3,
    bulletSpeed: 6.8,
    damage: 1,
    spread: 0.04,       // tiny bloom so the stream reads alive
    pellets: 1,
    recoil: 0.18,
    trauma: 0.09,
    bulletLife: 90,
    color: '#ffd27a',
  },
  // Laser (arcade §3 'L'): a slow-firing, powerful PIERCING beam.
  laser: {
    name: 'Laser',
    fireRate: 16,
    bulletSpeed: 9.5,
    damage: 3,
    spread: 0,
    pellets: 1,
    recoil: 0.5,
    trauma: 0.28,
    bulletLife: 55,
    color: '#8affd6',
    pierce: true,       // passes THROUGH enemies, damaging each once
    bw: 14, bh: 3,      // long thin beam
  },
  // Fire (arcade §3 'F'): twin rounds that travel in a CORKSCREW (double-helix,
  // the two pellets weave in opposite phase). Wave params live here (data-driven).
  fire: {
    name: 'Fire',
    fireRate: 9,
    bulletSpeed: 5.2,
    damage: 1,
    spread: 0,
    pellets: 2,         // the two helix strands
    recoil: 0.32,
    trauma: 0.15,
    bulletLife: 84,
    color: '#ff8a3c',
    wave: true,
    waveAmp: 5,
    waveFreq: 0.5,      // radians of helix phase per sim step
  },
};

// One enemy set for the slice.
export const ENEMIES = {
  grunt: {
    name: 'Grunt',
    w: 14, h: 18,
    hp: 3,
    speed: 0.75,
    contactDamage: 1,
    score: 100,
    gravity: true,
    color: '#e5484d',
  },
  // Aerial attack drone (arcade §4 read: a hovering flyer adds a vertical threat
  // axis the ground grunts/sentries can't). Hovers at its spawn altitude, bobs on
  // a deterministic sine (no RNG → replay-safe), closes to `standoff` px of the
  // player and then holds station strafing aimed shots. Sprite art: assets/flyer.png
  // (native 28×17, copper drone, faces left). Renders via drawEnemy → assets.get('flyer').
  flyer: {
    name: 'Drone',
    w: 16, h: 14,
    hp: 2,
    speed: 0.9,
    contactDamage: 1,
    score: 200,
    gravity: false,
    standoff: 90,       // horizontal gap it settles to before strafing
    bobAmp: 10,         // vertical hover amplitude (px)
    bobFreq: 0.08,      // radians of bob phase per sim step
    fireEvery: 96,      // frames between aimed shots
    shotSpeed: 2.4,     // slow + aimed → dodgeable in the air
    color: '#e08a3c',   // copper-orange, matches the sprite / pops on night-jungle
  },
  turret: {
    name: 'Sentry',
    w: 18, h: 16,
    hp: 5,
    speed: 0,
    contactDamage: 1,
    score: 250,
    gravity: false,
    fireEvery: 78,      // frames between shots
    shotSpeed: 2.6,
    color: '#d08bff',
    // Barrel geometry (CREATOR_FEEDBACK CR-3: "tanks look like they have a
    // secondary turret ... firing from it, not the one in the sprite"). The
    // shot must LEAVE the visible barrel TIP, not the hull centre. Both the
    // renderer (drawTurretBarrel/drawFireTelegraph) and the sim (enemy fire)
    // read these so the drawn barrel and the muzzle can never drift apart.
    barrelPivotFromBottom: 8, // barrel pivot Y = e.y + e.h - this (dome top)
    barrelLen: 11,            // barrel length in px; muzzle = pivot + aim*len
  },
  // Mortar emplacement (arcade §4: an AREA-DENIAL threat). Stationary; instead of
  // a straight aimed shot it LOBS a parabolic shell that arcs toward the player's
  // ground position — you dodge by REPOSITIONING (keep moving / clear the landing
  // spot), a distinct pattern from the straight-line turret/flyer/boss shots.
  // Telegraphs before firing (fair). Shell arc is deterministic (no rng).
  mortar: {
    name: 'Mortar',
    w: 20, h: 12,
    hp: 4,
    speed: 0,
    contactDamage: 1,
    score: 300,
    gravity: false,     // the emplacement itself is fixed where placed
    fireEvery: 150,     // slow lob cadence (area denial, not a stream)
    shellVy: 4.8,       // initial upward launch speed of the shell
    shellGravity: 0.16, // downward accel per step → the parabola
    shellVxMax: 3.2,    // cap horizontal speed so the arc stays dodgeable
    color: '#b98a4a',   // olive-brass emplacement
  },
  // Stage-1 boss (arcade §4: a fixed boss is the minimum that reads as Contra).
  // Fires slow horizontal CANNON volleys at standing-chest height that a PRONE
  // (or jumping) player ducks — turns the prone mechanic into the boss's answer.
  boss: {
    name: 'Sentinel',
    w: 46, h: 52,
    hp: 90,
    speed: 0,
    contactDamage: 1,
    score: 3000,
    gravity: false,
    fireEvery: 82,      // frames between cannon volleys
    shotSpeed: 2.1,     // slow + telegraphed → dodgeable
    color: '#c65b8a',
    // Phase-2 "enrage": at/below this HP fraction the Sentinel speeds up and
    // fires a denser volley. Bullets stay at chest height so PRONE still ducks
    // them (fair), but a standing/jumping player feels a real escalation.
    enrageAt: 0.4,
    enrageFireEvery: 46,
    // Movement (CREATOR_FEEDBACK CR-4: "boss has no movement"). The Sentinel now
    // HOVERS with a vertical bob so it reads as a live, breathing threat. Vertical
    // only: horizontal distance (fight balance) is unchanged and the cannon volley
    // fires from a FIXED baseY, so PRONE still ducks it (fair). Enrage bobs harder
    // + faster for a real phase-2 escalation. Deterministic (sine, no rng).
    swayAmp: 7, swayFreq: 0.05,
    enrageSwayAmp: 11, enrageSwayFreq: 0.09,
    isBoss: true, // generalized boss-detection flag (world.js/render.js read def.isBoss)
  },
  // Stage-2 boss: ATTACK CHOPPER "GUNSHIP" (content/stage2) — a MOVING aerial boss,
  // mechanically distinct from the fixed Sentinel: sweeps horizontally, hovers, fires
  // aimed bursts + lobs bombs; phase-2 drops LOW and fires faster. Deterministic
  // (sine + cooldown, no rng). Sprite: procedural gunship until assets.get('chopper')
  // lands (art candidate exists in assets/pipeline/experiments/chopper-boss).
  chopper: {
    name: 'Gunship',
    w: 62, h: 30,            // SIM hitbox = fuselage (rotor/boom excluded from collision)
    // BAL-1 (content/stage2/WIRE.md): the authored 110hp/y96/sweep120 made a ~63s kill;
    // applied the content loop's suggested tuning (hp~78, hoverY~120) so it dies in a
    // Stage-1-comparable window. Feel still human-playtest-gated.
    hp: 78,
    speed: 0,
    contactDamage: 1,
    score: 3500,
    gravity: false,
    isBoss: true,            // HP bar + name callout + win path (generalized boss-finder)
    shotSpeed: 2.6,
    fireEvery: 70, enrageFireEvery: 44,
    bombEvery: 130, enrageBombEvery: 90,
    // CHOP-1 COMPLETABILITY FIX (root.C 2026-07-12): sweepAmp was 90 — REPRODUCED as
    // UNBEATABLE at the barrier firing line (headless aim-tracking spread bot STALLS at
    // exactly 31 HP = the enrage threshold; the enraged low-hover chopper sweeps ~30px
    // outside the spread cone). That made the chopper stages (2/4/6) impossible to clear
    // in normal play → the campaign could never reach VICTORY. Restored to 120 (WIRE.md
    // CHOP-1's data-backed value): spread now kills ~48s, laser ~56s (both are Stage-2
    // pickups). Guarded by World.bossDefeatableTest so the stall cannot silently return.
    // NOTE (open, live-playtest): single-stream machine/rifle still struggle under the
    // crude fixed-position bot — a human leads/repositions; final FEEL is human-judged.
    sweepAmp: 120, sweepFreq: 0.018, enrageSweepFreq: 0.03,
    hoverY: 120, enrageHoverY: 150,
    enrageAt: 0.4,
    // bomb arc (reuses Enemy._lobShell — same fields as mortar)
    shellVy: 3.4, shellGravity: 0.10, shellVxMax: 2.4,
    color: '#8a9098',        // gunmetal
  },
};

export const FEEL = {
  hitStopHit: 3,        // freeze frames on landing a hit
  hitStopKill: 7,       // freeze frames on a kill
  hitStopPlayerHurt: 9,
  traumaKill: 0.5,
  traumaPlayerHurt: 0.85,
  shakeMax: 9,          // px at full trauma
  traumaDecay: 1.6,     // trauma units per second
};

// ============================================================================
// THEMES — per-stage biome descriptor (DATA-DRIVEN). Each stage's level carries a
// `theme` id; the engine resolves it to one of these records so RENDER (backdrop
// gradient / ground tint / set-dressing accent / tileset key) and AUDIO (music
// track) pick the right look+sound WITHOUT hardcoding per-stage branches.
//
// Consumer status (2026-07-12): the SPINE reads `theme` and exposes the resolved
// record on `world.theme`. render.js/audio (owned by other loops) do NOT yet branch
// on it — that wiring is declared as an OPEN NEED so each biome renders/sounds
// distinct. Palettes here are PROVISIONAL art direction (pipeline owns final art);
// `tileset`/`music` are the asset-key contracts those loops fill in.
// ============================================================================
// `back` is the RENDER contract the procedural backdrop reads (render.js
// drawSky/drawParallax consume world.theme.back). `sky` = 3 vertical gradient
// stops (top→horizon); `haze` = distance band tint; `ridgeFar`/`ridgeNear` =
// the two parallax hill silhouettes; `canopy`/`foliage` = the two near bump
// bands. JUNGLE's values are the EXACT pixels the renderer hardcoded before this
// wiring, so Stage 1 stays byte-identical (fixed-frame gate captures unmoved);
// every other biome supplies its own palette so the stage reads distinct.
export const THEMES = {
  jungle:   { id: 'jungle',   name: 'Jungle Approach',  sky: ['#12321f', '#1d5233'], ground: '#2c3b24', accent: '#6fae4a', fog: '#14361f', tileset: 'theme_jungle',   music: 'jungle',
    back: { sky: ['#0f2036', '#1a2f4a', '#3a5f6b'], haze: 'rgba(120,160,170,0.10)', ridgeFar: '#23405a', ridgeNear: '#1c3446', canopy: '#173026', foliage: '#0e2119' } },
  cascade:  { id: 'cascade',  name: 'Cascade Base',     sky: ['#0f2634', '#164055'], ground: '#26343d', accent: '#4aa6c0', fog: '#123040', tileset: 'theme_cascade',  music: 'cascade',
    back: { sky: ['#0b1c2a', '#12384a', '#2a6a72'], haze: 'rgba(120,185,195,0.11)', ridgeFar: '#1d4a5a', ridgeNear: '#163c48', canopy: '#123a38', foliage: '#0b2a2a' } },
  snow:     { id: 'snow',     name: 'Frozen Ridge',     sky: ['#1b2a3a', '#33506b'], ground: '#4a5a6a', accent: '#bfe0f5', fog: '#2a3f52', tileset: 'theme_snow',     music: 'snow',
    back: { sky: ['#1b2a3a', '#3a5a78', '#8fb2cf'], haze: 'rgba(205,224,240,0.16)', ridgeFar: '#5a748c', ridgeNear: '#7690a8', canopy: '#a8c2d8', foliage: '#c8dcec' } },
  desert:   { id: 'desert',   name: 'Scorched Dunes',   sky: ['#3a2a16', '#7a5326'], ground: '#8a6a38', accent: '#e6c072', fog: '#5a3f1e', tileset: 'theme_desert',   music: 'desert',
    back: { sky: ['#3a2916', '#8a5e28', '#d69a44'], haze: 'rgba(232,204,150,0.14)', ridgeFar: '#8a6636', ridgeNear: '#a07a40', canopy: '#b88a48', foliage: '#7a5628' } },
  foundry:  { id: 'foundry',  name: 'Iron Foundry',     sky: ['#241014', '#4a1e18'], ground: '#33272a', accent: '#ff7a3c', fog: '#3a1a1a', tileset: 'theme_foundry',  music: 'foundry',
    back: { sky: ['#180a0e', '#3a1418', '#742a1e'], haze: 'rgba(210,120,80,0.13)', ridgeFar: '#382a2c', ridgeNear: '#46332e', canopy: '#52281f', foliage: '#2c1613' } },
  caverns:  { id: 'caverns',  name: 'Crystal Caverns',  sky: ['#160f2a', '#2a1e52'], ground: '#2c2440', accent: '#b98ad9', fog: '#1c1436', tileset: 'theme_caverns',  music: 'caverns',
    back: { sky: ['#120b22', '#241844', '#3e2c6e'], haze: 'rgba(160,124,205,0.13)', ridgeFar: '#2c2444', ridgeNear: '#382c56', canopy: '#48376c', foliage: '#241a3a' } },
  fortress: { id: 'fortress', name: 'Red Falcon Keep',  sky: ['#2a0f12', '#5a161c'], ground: '#33202a', accent: '#ff5a6e', fog: '#3a1216', tileset: 'theme_fortress', music: 'fortress',
    back: { sky: ['#1a080c', '#3a0f14', '#701c22'], haze: 'rgba(210,96,116,0.13)', ridgeFar: '#35212b', ridgeNear: '#442730', canopy: '#4e2028', foliage: '#2a1216' } },
};
export const THEME_DEFAULT = 'jungle';
export function resolveTheme(id) { return THEMES[id] || THEMES[THEME_DEFAULT]; }

// ============================================================================
// CAMPAIGN — the 7-stage progression ladder (the spine root.C owns). Clearing a
// stage advances to the next; clearing the LAST reaches VICTORY. Assembled as DATA
// so main.js reads a ready STAGES array (no hardcoded 2-stage cap).
//
// Stages 1–2 are the AUTHORED geometries (LEVEL1 / LEVEL2) passed through by
// IDENTITY — byte-identical, so the shipped fidelity/gate captures are unaffected.
// Stages 3–7 are THEMED variants of those two geometries: each boss keeps its
// PROVEN arena+behavior (Sentinel on LEVEL1's barrier@2300, Gunship on LEVEL2's
// barrier@2140) and only the theme + the boss's identity/stats (name/hp/color/
// cadence, via a per-spawn `override` world.js merges into the enemy def) change —
// so every stage still ends on a boss that registers via the isBoss finder and is
// defeatable on a geometry we've already validated live.
//
// Each variant stage also gets a SIGNATURE ENEMY MIX (`mix`) — extra spawns folded
// onto the base layout so S3–7 stop being identical to S1/S2 in what you actually
// FIGHT. Each biome leans on one threat axis (air / artillery / turrets / ambush /
// gauntlet) and density RAMPS with stage number, on validated footing (LEVEL1 ground
// [0,1700]∪[1900,2220]∪[2278,2400]; LEVEL2 ground [0,1180]∪[1346,2600] — additions
// avoid the pits/chasms and stay clear of the boss arena). Verified: every added
// ground unit sits over ground, and every boss stays defeatable (World.campaign*Test).
//
// OPEN NEEDS (declared, not worked around): (1) distinct GEOMETRY per biome
// (pipeline/content) so stages 3–7 stop reusing two layouts; (2) distinct boss
// MECHANICS beyond stat re-skins (weapon-defect owns enemy.js behavior branches);
// (3) render.js to draw a FINAL VICTORY screen — it still shows only STAGE CLEAR /
// GAME OVER (render.js:1618); world.isFinalStage + world.nextStageLabel are exposed
// for it. render/audio ALREADY consume world.theme (backdrop/tileset/music). The
// spine below is correct and live now; those layer in without changing its shape.
// ============================================================================
function bossVariant(base, spec) {
  // Clone the base level, retag its theme/name, fold the boss stat override onto the
  // boss spawn, and splice this stage's signature MIX in just before the boss (order
  // is cosmetic — the boss is found by the isBoss flag, not position). Geometry is
  // untouched; the mix only ADDS enemies at hand-validated, on-ground coordinates.
  const spawns = base.spawns.map((sp) => {
    const arche = ENEMIES[sp.type];
    if (arche && arche.isBoss && spec.boss) {
      return { ...sp, override: { ...(sp.override || {}), ...spec.boss } };
    }
    return sp;
  });
  if (spec.mix && spec.mix.length) {
    const bi = spawns.findIndex((sp) => ENEMIES[sp.type] && ENEMIES[sp.type].isBoss);
    if (bi >= 0) spawns.splice(bi, 0, ...spec.mix);
    else spawns.push(...spec.mix);
  }
  // `decor` is set EXPLICITLY (not inherited via ...base) so a variant built on LEVEL2
  // does NOT leak the cascade base's set-dressing — each biome gets ITS own props or none.
  return { ...base, name: spec.name, theme: spec.theme, spawns, decor: spec.decor || [] };
}

// ============================================================================
// SET-DRESSING placement hook — CONFIRMED CONTRACT (campaign loop answers the
// pipeline's "confirm the placement-hook shape + prop SIZE" ask in
// assets/pipeline/experiments/set-dressing/README.md).
//   Level field:  decor: [{ x:<worldX>, key:<spriteKey>, parallax?:<factor, default 1> }]
//   Anchor:       BASE — the prop's BOTTOM sits on the ground y beneath `x` (like an
//                 enemy's feet). x MUST be over ground (validated: World.validateDecor).
//   Size:         render at NATIVE resolution (1×) — the props are authored 28–48px,
//                 already scaled for the 480×270 view (a 48px pine ≈ 2.4× the 20px hero).
//   parallax:     omit/1 = foreground playfield plane (moves with the world). A factor
//                 <1 pushes a prop into the mid-ground (scrolls slower) for depth.
// Biome → prop key (assets/pipeline/set-dressing.json; jungle intentionally has none —
// Stage 1 keeps render.js's procedural grass tufts):
//   cascade→decor_cascade_valve  snow→decor_snow_pine  desert→decor_desert_cactus
//   foundry→decor_foundry_vat  caverns→decor_caverns_crystal  fortress→decor_fortress_brazier
// OPEN NEEDS to finish the wire (this loop owns only the DATA half): (1) assets owner —
// key decor_*.png into game/data/assets.js + sync/manifest (pipeline is staged, waiting
// on this hook confirmation); (2) render.js (weapon-defect) — after drawParallax/before
// entities, blit each level.decor prop base-anchored to the ground y. Until both land the
// arrays are inert (render ignores unknown level fields), so this is gate-safe.
// ============================================================================

// Ground-emplacement Y helpers (base ground top = y236): a gravity-less turret (h16)
// sits at 220, a mortar (h12) at 224; grunts spawn at 210 and fall onto the ground.
// One row per stage. `boss` folds onto the base boss spawn; `mix` adds the signature.
const CAMPAIGN = [
  { base: LEVEL1 },  // Stage 1 — Jungle Approach (authored; theme in level1.js)
  { base: LEVEL2 },  // Stage 2 — Cascade Base   (authored; theme in level2.js)
  // Stage 3 — Frozen Ridge (AIR pressure: drones own the cold open sky).
  { base: LEVEL1, theme: 'snow', name: 'Frozen Ridge',
    boss: { name: 'Ice Sentinel', hp: 72, color: '#7fb6d9', enrageFireEvery: 42 },
    mix: [
      { type: 'flyer', x: 520,  y: 120 },
      { type: 'flyer', x: 1120, y: 115 },
      { type: 'flyer', x: 1500, y: 120 },
      { type: 'grunt', x: 1150, y: 210 },
    ],
    decor: [ // snow-laden pines lining the ridge (x over LEVEL1 ground [0,1700])
      { x: 360, key: 'decor_snow_pine' },
      { x: 780, key: 'decor_snow_pine' },
      { x: 1280, key: 'decor_snow_pine' },
      { x: 1640, key: 'decor_snow_pine' },
    ] },
  // Stage 4 — Scorched Dunes (ARTILLERY: mortar bombardment denies the open flats).
  { base: LEVEL2, theme: 'desert', name: 'Scorched Dunes',
    boss: { name: 'Sand Gunship', hp: 88, color: '#d9b06a', enrageFireEvery: 42 },
    mix: [
      { type: 'mortar', x: 820,  y: 224 },
      { type: 'mortar', x: 1560, y: 224 },
      { type: 'grunt',  x: 1000, y: 210 },
      { type: 'grunt',  x: 1700, y: 210 },
    ],
    decor: [ // saguaro cacti on the flats (x over LEVEL2 ground, clear of the gap 1290–1346)
      { x: 300,  key: 'decor_desert_cactus' },
      { x: 900,  key: 'decor_desert_cactus' },
      { x: 1620, key: 'decor_desert_cactus' },
      { x: 1980, key: 'decor_desert_cactus' },
    ] },
  // Stage 5 — Iron Foundry (TURRET fortress: automated sentries lock the lanes).
  { base: LEVEL1, theme: 'foundry', name: 'Iron Foundry',
    boss: { name: 'Foundry Core', hp: 104, color: '#9aa4b0', fireEvery: 74, enrageFireEvery: 40 },
    mix: [
      { type: 'turret', x: 640,  y: 220 },
      { type: 'turret', x: 1150, y: 220 },
      { type: 'turret', x: 1950, y: 169 }, // on the 1900 platform (top y185)
      { type: 'grunt',  x: 1000, y: 210 },
      { type: 'grunt',  x: 1980, y: 210 },
    ],
    decor: [ // molten smelting vats along the foundry floor
      { x: 450,  key: 'decor_foundry_vat' },
      { x: 1080, key: 'decor_foundry_vat' },
      { x: 1600, key: 'decor_foundry_vat' },
    ] },
  // Stage 6 — Crystal Caverns (MIXED ambush: aerial + artillery crossfire).
  { base: LEVEL2, theme: 'caverns', name: 'Crystal Caverns',
    boss: { name: 'Crystal Wing', hp: 96, color: '#b98ad9', enrageFireEvery: 40 },
    mix: [
      { type: 'flyer',  x: 850,  y: 115 },
      { type: 'flyer',  x: 1620, y: 120 },
      { type: 'mortar', x: 1000, y: 224 },
      { type: 'mortar', x: 1750, y: 224 },
      { type: 'grunt',  x: 1560, y: 210 },
    ],
    decor: [ // glowing violet crystal clusters (clear of the gap 1290–1346)
      { x: 380,  key: 'decor_caverns_crystal' },
      { x: 950,  key: 'decor_caverns_crystal' },
      { x: 1640, key: 'decor_caverns_crystal' },
      { x: 2000, key: 'decor_caverns_crystal' },
    ] },
  // Stage 7 — Red Falcon Keep (GAUNTLET: every threat axis at once, densest run).
  { base: LEVEL1, theme: 'fortress', name: 'Red Falcon Keep',
    boss: { name: 'Red Falcon', hp: 128, color: '#ff5a6e', fireEvery: 68, enrageFireEvery: 36 },
    mix: [
      { type: 'grunt',  x: 600,  y: 210 },
      { type: 'grunt',  x: 1000, y: 210 },
      { type: 'grunt',  x: 1980, y: 210 },
      { type: 'turret', x: 700,  y: 220 },
      { type: 'turret', x: 1300, y: 220 },
      { type: 'flyer',  x: 1100, y: 110 },
      { type: 'flyer',  x: 1550, y: 110 },
      { type: 'mortar', x: 1250, y: 224 },
    ],
    decor: [ // flaming iron braziers lining the keep approach
      { x: 420,  key: 'decor_fortress_brazier' },
      { x: 920,  key: 'decor_fortress_brazier' },
      { x: 1500, key: 'decor_fortress_brazier' },
      { x: 1960, key: 'decor_fortress_brazier' },
    ] },
];

// The playable ladder: stages 1–2 pass through by identity; 3–7 are themed variants.
export const STAGES = CAMPAIGN.map((c) => (c.boss ? bossVariant(c.base, c) : c.base));
