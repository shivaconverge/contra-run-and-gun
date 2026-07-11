// Level 1 geometry + enemy spawns as data. `solids` are AABBs the physics
// treats as one-way-safe solid ground/platforms. Coordinates are world px.
// Strategy: task_data_driven_content_arch.

export const LEVEL1 = {
  name: 'Jungle Approach',
  // Biome id → resolved to a THEMES record (config.js) exposed on world.theme for
  // render/audio to pick this stage's backdrop/tileset/music (data-driven, no
  // per-stage hardcoding). Additive field; the current renderer ignores it safely.
  theme: 'jungle',
  width: 2400,
  height: 270,
  // Vertical world bound; falling below this y is a PIT DEATH (see world._onPitFall).
  gravityFloor: 268,
  solids: [
    // Ground runs in segments. The BRIDGE span (x1700–1900) is a plank deck over a
    // WATER channel (CREATOR_FEEDBACK CR-1: "original had a bridge and water ... you
    // can move at multiple heights"). Decks are `kind:'ground'` so physics, the run
    // bot, respawn and pit checks treat them as footing; the `bridge` flag only
    // switches the RENDER to planks + trusses + shimmering water below. A 56px
    // WATER GAP breaks the deck (x1790–1846): the water is now a real FALL-HAZARD —
    // fall in = pit death — jump-clearable (~79px reach) OR bypass via the catwalk
    // high route above (so the height choice matters). Enemy-free stretch between
    // clusters 4 and 5, off both fixed-frame captures.
    { x: 0, y: 236, w: 1700, h: 40, kind: 'ground' },
    { x: 1700, y: 236, w: 90, h: 40, kind: 'ground', bridge: true },
    // — 56px water gap here (x1790–1846): no deck; drop through = pit death —
    { x: 1846, y: 236, w: 54, h: 40, kind: 'ground', bridge: true },
    { x: 1900, y: 236, w: 320, h: 40, kind: 'ground' },
    // 58px CHASM at x2220–2278 — the final gap before the boss arena (a platforming
    // failure hazard, distinct from enemy fire). Clearable by a running jump (~79px
    // reach). No ground grunt crosses it and it clears the boss firing line (x2285).
    { x: 2278, y: 236, w: 122, h: 40, kind: 'ground' },
    // platforms (x, y = top-left, w, h)
    { x: 150, y: 190, w: 70, h: 10, kind: 'platform' },
    { x: 300, y: 150, w: 60, h: 10, kind: 'platform' },
    { x: 470, y: 195, w: 90, h: 10, kind: 'platform' },
    { x: 640, y: 160, w: 70, h: 10, kind: 'platform' },
    { x: 820, y: 130, w: 80, h: 10, kind: 'platform' },
    { x: 1000, y: 190, w: 120, h: 10, kind: 'platform' },
    { x: 1220, y: 150, w: 70, h: 10, kind: 'platform' },
    { x: 1420, y: 190, w: 100, h: 10, kind: 'platform' },
    { x: 1650, y: 155, w: 80, h: 10, kind: 'platform' },
    // Upper rope CATWALK over the bridge — the genuine high route (CR-1 "you can
    // move at multiple heights"): reachable from the 1650 ledge, spans the water gap,
    // drop off its right end onto the far deck / 1900 ledge. Set ABOVE the ground
    // run-jump apex (feet reach ~y162 from the deck) so the ground route clears the
    // gap cleanly UNDER it, while it stays reachable from the 1650 ledge (feet reach
    // ~y81) — i.e. you COMMIT to the high route from the ledge to bypass the hazard.
    { x: 1745, y: 112, w: 110, h: 8, kind: 'platform', catwalk: true },
    { x: 1900, y: 185, w: 120, h: 10, kind: 'platform' },
    // Boss-arena barrier: stops the player at a firing line but lets bullets
    // pass (noBullet), so the fight happens across it. See entities.Bullet.step.
    { x: 2300, y: 96, w: 12, h: 140, kind: 'barrier', noBullet: true },
  ],
  // Water channel under the bridge (CR-1). Animated teal band beneath the plank
  // deck so the "bridge over water" motif reads (deterministic shimmer off
  // world.frame, no rng). Where the deck is present the player is safe; where the
  // 56px GAP breaks it (x1790–1846) the water is a real FALL-HAZARD (pit death).
  water: [
    { x: 1700, y: 244, w: 200, h: 24 },
  ],
  // Enemies are placed in CLUSTERS (2–4 per firefight) with a sentry for aimed
  // pressure, so activation-gated encounters read as run-and-gun waves (3+ on
  // screen), not a lone-enemy trickle. Turret y = platformTop − 16.
  spawns: [
    // Cluster 1 — ramp-in (+ sentry on the 470 platform)
    { type: 'grunt',  x: 320,  y: 210 },
    { type: 'grunt',  x: 400,  y: 210 },
    { type: 'turret', x: 500,  y: 179 },
    // Cluster 2 — 3 runners + high sentry (820 platform)
    { type: 'grunt',  x: 800,  y: 210 },
    { type: 'grunt',  x: 860,  y: 210 },
    { type: 'grunt',  x: 930,  y: 210 },
    { type: 'turret', x: 845,  y: 114 },
    // Aerial drone patrolling above cluster 2 — adds a vertical threat axis.
    { type: 'flyer',  x: 900,  y: 120 },
    // Mortar emplacement on the 1000 platform — lobs arcing shells over the
    // cluster-2→3 approach, forcing the player to keep moving (area denial).
    { type: 'mortar', x: 1040, y: 178 },
    // Cluster 3 — sentry (1220 platform) covering 3 runners
    { type: 'turret', x: 1245, y: 134 },
    { type: 'grunt',  x: 1180, y: 210 },
    { type: 'grunt',  x: 1250, y: 210 },
    { type: 'grunt',  x: 1320, y: 210 },
    // Cluster 4 — 3 runners + sentry (1650 platform)
    { type: 'grunt',  x: 1540, y: 210 },
    { type: 'grunt',  x: 1610, y: 210 },
    { type: 'grunt',  x: 1680, y: 210 },
    { type: 'turret', x: 1680, y: 139 },
    // Second drone closing on cluster 4 from above.
    { type: 'flyer',  x: 1600, y: 115 },
    // Cluster 5 — finale swarm + sentry (1900 platform)
    { type: 'turret', x: 1930, y: 169 },
    { type: 'grunt',  x: 1980, y: 210 },
    { type: 'grunt',  x: 2050, y: 210 },
    { type: 'grunt',  x: 2120, y: 210 },
    { type: 'grunt',  x: 2200, y: 210 },
    // Stage boss beyond the arena barrier (defeat it to clear the stage).
    { type: 'boss',   x: 2340, y: 184 },
  ],
  // Weapon power-ups (single-slot upgrade; reverts to rifle on death). Spread is
  // the early staple; Machine + Laser round out the arcade arsenal mid-stage, and
  // a Laser re-supply sits before the boss run so a skilled player can pierce it.
  pickups: [
    { weapon: 'spread',  x: 210,  y: 218 },
    { weapon: 'machine', x: 880,  y: 218 },
    { weapon: 'fire',    x: 1050, y: 174 },
    { weapon: 'spread',  x: 1360, y: 172 },
    { weapon: 'laser',   x: 1580, y: 218 },
    { weapon: 'machine', x: 2080, y: 218 },
  ],
  playerStart: { x: 40, y: 200 },
  goalX: 2340, // reaching here = slice cleared
};
