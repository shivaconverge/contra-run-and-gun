// Asset manifest. Keys the renderer asks for -> file paths under assets/
// (relative to game/, the static server root).
// player_idle: REAL art — the pipeline's PASS sprite (assets/sprites/player_idle.png),
//   synced into game/assets/ and blitted by render.js drawPlayer (WIRED).
// grunt, turret: REAL art — synced native sprites (assets/sprites/{grunt,turret}.png).
//   WIRED: render.js drawEnemy looks up assets.get(e.kind) and drawEnemySprite blits
//   it feet-anchored + scaled-to-fit-height (~1.4× hitbox, like the player) so the
//   native ~26px art is not squished to the small hitbox. Grunt mirrors by travel
//   dir; the turret keeps a dynamic aim barrel drawn over the sprite. Falls back to
//   the procedural shape when a sprite is absent.
// player_run: REAL 4-beat run cycle (native 22×31, /animate-with-skeleton,
//   palette-locked, no blur) — synced + LOADED + BLITTED (WIRED). render.js
//   drawPlayer selects the run strip over player_idle when p.grounded &&
//   |p.vx| > 0.2, slicing a frame off p.walkPhase (quarter-turn per frame →
//   full 4-beat loop every 2π, cadence tied to run speed) via drawPlayerSprite
//   (meta = render.js PLAYER_RUN, mirrors manifest.json → sprites.player.run).
//   Prone/airborne/idle still use the idle sprite; falls back to the procedural
//   legs when the strip is absent.
// tiles: REAL 16px ground tileset (cap + 2 dark dirt fills), synced + LOADED +
//   BLITTED (WIRED). render.js drawSolids passes assets to drawGround/drawPlatform,
//   which call blitTiles(): the `cap` tile paves the surface row and the two dirt
//   fills checkerboard the body below, aligned to a world 16px grid and clipped to
//   the solid rect (crisp native pixels, clean edges). Falls back to the procedural
//   strata when the sheet is absent. Per-tile rects mirror manifest.json →
//   sprites.tiles in render.js TILES{}.
// explosion, muzzle: REAL weapon-juice FX strips (multi-frame, warm palette),
//   synced + LOADED + BLITTED (WIRED). On enemy death world.spawnFx pushes an
//   'explosion' onto world.fx; render.js drawFx slices the frame from its step
//   counter (18fps strip / 60Hz sim ≈ 3 steps/frame), scales ~1.15×, and fades
//   the last frame with additive blend. On player fire render.js drawGun blits a
//   `muzzle` frame at the barrel tip (frame off the p.muzzle timer), falling
//   back to the procedural spark-star if a strip is absent. Frame rects live in
//   render.js FX{} (mirrors assets/manifest.json → sprites.{explosion,muzzle}).
// player_prone: REAL low prone/duck sprite (native 28×15, palette-locked to idle)
//   — synced + LOADED + BLITTED (WIRED). render.js drawPlayer's prone branch
//   passes it to drawPlayerSprite (feet-anchored, scaled by p.h*1.4≈15px so it
//   stays low, mirrored by facing); drawProne is the procedural fallback.
//   Gameplay-relevant: the low silhouette ducks the SENTINEL boss's chest-height
//   cannon. See assets/QA-NOTES.md.
export const ASSET_MANIFEST = {
  player_idle: 'assets/player_idle.png',
  player_run: 'assets/player_run.png',
  player_prone: 'assets/player_prone.png',
  // player_jump: REAL airborne leap frame (native 25×25, aims rifle forward,
  //   palette-locked to idle) — synced + LOADED + BLITTED (WIRED). render.js
  //   drawPlayer blits assets.get('player_jump') when !p.grounded (before the
  //   run/idle branches, mirrored by facing) so the commando reads as mid-air
  //   rather than a frozen idle stance; falls back to idle when absent.
  //   See assets/QA-NOTES.md OPEN ISSUE #7.
  player_jump: 'assets/player_jump.png',
  grunt: 'assets/grunt.png',
  turret: 'assets/turret.png',
  // flyer: REAL 3rd enemy — Contra aerial attack drone (native 28×17, copper-orange
  //   metal sphere + glowing red eye, faces left, palette-distinct + pops on the
  //   dark night-jungle). Synced + LOADED + BLITTED (WIRED). A live threat now:
  //   config.js ENEMIES.flyer (16×14 hitbox) defines it, enemy.js runs a hover/
  //   bob + strafe-and-aim behavior, level1.js spawns two drones (over clusters
  //   2 and 4). drawEnemy blits assets.get('flyer') feet-anchored; drawEnemySprite
  //   mirrors it when travelling right (native art faces left). See assets/QA-NOTES.md.
  flyer: 'assets/flyer.png',
  // mortar: REAL 4th enemy — olive-brass artillery emplacement (native 30×23,
  //   squat riveted bunker + stubby barrel angled up, palette-distinct olive/brass
  //   vs grunt-crimson/turret-purple/flyer-copper/boss-gunmetal). Synced + keyed.
  //   WIRED via the dynamic path: render.js drawEnemy does assets.get(e.kind), and
  //   the `mortar` config kind (config.js ENEMIES.mortar 20×12, level1 spawn @x=1040,
  //   lobs arcing shells) routes through it → drawEnemySprite blits it feet-anchored
  //   scaled-to-fit-height (no mirror; fixed emplacement), with drawFireTelegraph on
  //   the wind-up beat. Replaces the render.js:421 procedural placeholder box (the
  //   GOAL's no-placeholder mandate). See assets/QA-NOTES.md.
  mortar: 'assets/mortar.png',
  // boss: REAL Sentinel boss sprite (native 57×54, steel gun-sentinel, cannon
  //   aimed left, glowing core) — synced + LOADED + BLITTED (WIRED). render.js
  //   drawEnemy routes kind==='boss' to drawBoss(e, img), which blits the sprite
  //   feet-anchored + scaled to fit the 46×52 hitbox (cannon faces left; no
  //   mirror) and overlays the animated telegraph (core glow + cannon-port
  //   flashes on the wind-up beat) the static art can't show. Procedural hull is
  //   the fallback. See assets/QA-NOTES.md OPEN ISSUE #6.
  boss: 'assets/boss.png',
  // boss_enraged: REAL phase-2 ENRAGE variant (native 57×54, same Sentinel
  //   init-anchored → same silhouette/cannon, escalated: flaring hot core, cracked
  //   exposed reactor, scorched hull + energy venting). Synced + LOADED + BLITTED
  //   (WIRED). render.js drawEnemy selects assets.get('boss_enraged') instead of
  //   'boss' once e.enraged is set (phase-2 threshold in enemy.js), passing it to
  //   drawBoss (same 46×52 hitbox, faces left, no mirror); the pulsing red-glow +
  //   telegraph overlays still apply on top. Falls back to the base boss sprite if
  //   the enraged art hasn't loaded. See assets/QA-NOTES.md #11.
  boss_enraged: 'assets/boss_enraged.png',
  // chopper: REAL Stage-2 2nd boss — a wide ATTACK-HELICOPTER GUNSHIP (native 76×52,
  //   gunmetal+red, faces left; rotor + tail-boom overhang the 62×30 fuselage hitbox).
  //   A MOVING aerial boss (sweeps/hovers/bombs), distinct from the tall fixed Sentinel.
  //   WIRED: config ENEMIES.chopper (isBoss, 62×30), enemy.js sweep/fire branch, level2
  //   spawn @x2340; render.js drawEnemy kind==='chopper' → dedicated drawBoss blitting
  //   assets.get('chopper'). Synced + keyed here. See assets/QA-NOTES.md + content/stage2.
  chopper: 'assets/chopper.png',
  // chopper_enraged: phase-2 form-change (native 78×51, init-anchored to the chopper —
  //   SAME gunship escalated with glowing red belly ordnance/engines). render.js:569
  //   swaps to assets.get('chopper_enraged') once e.enraged (enrageAt 0.4), like
  //   boss_enraged; falls back to the base chopper if absent.
  chopper_enraged: 'assets/chopper_enraged.png',
  // pickup: REAL Contra falcon weapon-pod (native 32×15, gold winged pod, dark
  //   central emblem window) — replaces the placeholder gold-pill in drawPickup.
  //   Synced + LOADED. Wire drawPickup to blit assets.get('pickup') scaled-to-fit
  //   the 14×12 pickup rect (keep the blink + the per-weapon LETTER overlaid on the
  //   dark center); procedural pill fallback. See assets/QA-NOTES.md OPEN ISSUE #8.
  pickup: 'assets/pickup.png',
  // WEAPONLESS bodies — the DURABLE fix for the creator's ROUND-2 REJECT (exactly
  // ONE weapon per armed entity). render.js draws the hero/turret WEAPONLESS and
  // adds exactly one procedural aiming weapon (drawGun / drawTurretBarrel), so the
  // seen gun == the firing gun. The hero body is selected ONLY through these
  // *_noweapon keys (drawPlayer never blits the bare player_* keys — that guards
  // against a gun-baked body sneaking back under the aiming rifle); the turret
  // prefers turret_base.
  //
  // ── DO NOT "CLEAN UP" THE ALIAS BELOW ──────────────────────────────────────
  // RESOLVED (was OPEN NEED): the art pipeline shipped the fix by regenerating the
  // BASE hero/turret sprites as WEAPONLESS bodies IN PLACE — same file paths,
  // byte-compatible drop-in (assets/manifest.json weaponlessContract:true; the
  // base files assets/player_*.png + assets/turret.png now carry NO gun/barrel;
  // verified LIVE by looking — 8-way hero + turret each render a single weapon).
  // So the *_noweapon / turret_base keys INTENTIONALLY point at those already-
  // weaponless base files. This aliasing is the bridge between the pipeline's
  // "same-key drop-in" contract and render.js's "only draw the hero through
  // _noweapon keys" invariant. Repointing these to nonexistent player_*_noweapon.png
  // files would make the loader skip them → render falls back to the procedural
  // drawHeroBody commando (still one gun, but loses the real art). Keep the alias.
  // Native dims (must match render.js meta): idle 16×31, run 88×31
  // (PLAYER_RUN 4×22×31), jump 22×25, prone 24×10, turret 32×32.
  player_idle_noweapon: 'assets/player_idle.png',
  player_run_noweapon: 'assets/player_run.png',
  player_jump_noweapon: 'assets/player_jump.png',
  player_prone_noweapon: 'assets/player_prone.png',
  turret_base: 'assets/turret.png',
  tiles: 'assets/tiles.png',
  explosion: 'assets/explosion.png',
  muzzle: 'assets/muzzle.png',
  // Bridge-over-water THEME tiles (16×16) authored by the art loop for CR-1
  // (assets/pipeline/experiments/environment-theme). Metal-grate bridge deck +
  // NIGHT water body/surface — the night variant was chosen by looking (reads
  // cohesively against the dark jungle; the bright cyan was garish). render.js
  // drawBridge/drawWater blit these when loaded, else fall back to procedural.
  theme_bridge: 'assets/theme_bridge.png',
  theme_water: 'assets/theme_water.png',
  theme_water_top: 'assets/theme_water_top.png',
  // Per-stage BIOME TILESETS (deliverable #2, from assets/pipeline/generate.py biomes).
  // One distinct on-palette 48×16 [cap,dirt,dirt2] sheet per themed stage, in the SAME
  // format as `tiles` (the jungle default). config.js THEMES.<id>.tileset names these
  // keys; render.js drawSolids resolves assets.get(world.theme.tileset) and swaps it in
  // for the ground/platform blit (falling back to `tiles` when a biome has no sheet —
  // e.g. jungle's theme_jungle is intentionally absent so Stage 1 keeps `tiles`). WIRED.
  theme_cascade: 'assets/theme_cascade.png',
  theme_snow: 'assets/theme_snow.png',
  theme_desert: 'assets/theme_desert.png',
  theme_foundry: 'assets/theme_foundry.png',
  theme_caverns: 'assets/theme_caverns.png',
  theme_fortress: 'assets/theme_fortress.png',
  // Per-stage BACKGROUND far-parallax scenery (deliverable #2 "background layers",
  // from assets/pipeline/generate.py backdrops). One detailed 128×56 distant-scenery
  // silhouette per themed biome (snow peaks / desert mesas / foundry skyline / cavern
  // crystal spires / fortress towers / cascade dam), transparent above the ridge.
  // Keyed as bg_<theme.id>; render.js drawParallax resolves assets.get('bg_'+theme.id)
  // and, when present, tiles it horizontally at camx*0.15 (far rate) with its base at
  // ~y=158 IN PLACE OF the procedural far ridge — the near ridge/canopy/foliage bands
  // still draw over it (mirrors the theme-tileset swap). Jungle has no bg_jungle key,
  // so Stage 1 keeps the procedural ridge byte-identical; same for any unloaded strip.
  bg_snow: 'assets/bg_snow.png',
  bg_desert: 'assets/bg_desert.png',
  bg_foundry: 'assets/bg_foundry.png',
  bg_caverns: 'assets/bg_caverns.png',
  bg_fortress: 'assets/bg_fortress.png',
  bg_cascade: 'assets/bg_cascade.png',
};
