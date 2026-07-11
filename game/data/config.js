// Data-driven tuning for the vertical slice.
// All units are pixels-per-fixed-step (the sim runs at STEP_HZ). Edit freely;
// nothing here is hardcoded in the engine — the engine reads these values.
// Strategy: task_data_driven_content_arch (config, not hardcoded).

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
    // applied the content loop's suggested tuning (hp~78, hoverY~120, sweepAmp~90) so it
    // dies in a Stage-1-comparable window. STILL PLAYTEST-GATED (feel is human-judged).
    hp: 78,
    speed: 0,
    contactDamage: 1,
    score: 3500,
    gravity: false,
    isBoss: true,            // HP bar + name callout + win path (generalized boss-finder)
    shotSpeed: 2.6,
    fireEvery: 70, enrageFireEvery: 44,
    bombEvery: 130, enrageBombEvery: 90,
    sweepAmp: 90, sweepFreq: 0.018, enrageSweepFreq: 0.03,
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
