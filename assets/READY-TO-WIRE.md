# READY-TO-WIRE — art-slice fidelity levers awaiting an engine greenlight

## 🎨 STAGED — per-stage BOSS sprites (5 distinct bosses, deliverable #2 LAST art class)
`python assets/pipeline/generate.py bosses` produces a **distinct themed boss per stage** —
real PixelLab art: Ice Sentinel (3), Foundry Core (5), Red Falcon (7), Sand Gunship (4),
Crystal Wing (6). Closes the GOAL's "every stage has its own boss": today `drawBoss` blits
the SAME gunmetal Sentinel for 1/3/5/7 and same chopper for 2/4/6 (config only recolors).
Each keeps its family geometry (sentinel≈46×52 / gunship≈62×30). Judged by looking:
`assets/pipeline/experiments/bosses/all-bosses.png`. **Grounded finding:** init-anchoring
can't re-palette a boss (stays grey at every strength) — the recipe is FRESH generation
with a strong biome prompt (`strength-sweep.png` vs `fresh-vs-base.png`).

**Engine per-stage boss-swap hook to wire (then I finalize sync+manifest):**
1. `game/data/assets.js` — key the bosses (`boss_snow: 'assets/boss_snow.png'`, …).
2. `game/src/render.js drawEnemy` — resolve boss art as
   `assets.get('boss_' + world.theme.id) || assets.get(e.kind)` (mirrors tileset/bg swap);
   same hitbox → no geometry change. Enrage can stay base or gain per-biome variants.
STAGED out of manifest/game-assets (no boss-swap hook yet → gate stays green, 31/31).
**NEED:** confirm the boss-swap hook shape + whether per-biome ENRAGE variants are wanted.
Known: `boss_desert` reads slightly mushy — a re-seed/polish candidate.

## ✅ DONE — per-stage BACKGROUND parallax art (6 biomes, deliverable #2 "background layers") — FINALIZED + LIVE
WIRED by the engine (commit 43d2db2: `assets.js` keys `bg_snow..bg_cascade`, `render.js
drawParallax` blits `assets.get('bg_'+theme.id)` tiled at `camx*0.15`, base y=158, with the
procedural fallback) and FINALIZED by me: folded into canonical `run()` (§5d) so
`manifest.json` carries all 6 `bg_<biome>` entries; byte-synced to `game/assets/`; gate
extended (bg draw-path modeled + wide-strip frame-cap exemption) → cross-source consistent
(31=31=31), bg keys reachable, 31/31 sprites pass.

**Verified LIVE by looking** (headless capture at `?level=3/5/6`):
`assets/pipeline/experiments/backgrounds/live/MONTAGE-live-bg.png` — snow's mountain range,
foundry's glowing industrial skyline, and caverns' violet crystal spires all render as the
far layer in-engine; jungle keeps the procedural fallback; 0 errors, 0 missing. Answers the
creator's "background looks very simple". Known limitation (recorded, non-blocking): 128px
strip repeats ~4×/screen — wider-strip/seam-blend is a noted polish follow-up.
**NEED (future):** whether a NEAR authored parallax layer is also wanted (far layer is the
confirmed scope; engine keeps procedural near/canopy/foliage bands for now).

## ⚠️ PARTIAL-WIRE — per-stage SET-DRESSING props (deliverable #2; Stage-2 gap OPEN)
`python assets/pipeline/generate.py decor` produces one signature transparent prop per
biome — real PixelLab art (snow pine / desert cactus / cavern crystal / foundry molten
vat / fortress brazier / cascade valve). Proven distinct-yet-coherent + composited on the
live biome frames: `assets/pipeline/experiments/set-dressing/`.

**The engine STARTED wiring decor but Stage 2 renders NOTHING (verified LIVE, OPEN ISSUE):**
`config.js` documents the `decor:[{x,key,parallax}]` field, `world.js validateDecor`
enforces it, and `level2.js` places `decor_cascade_valve ×3` — but `assets.js` doesn't key
it (no LOAD) and `render.js` has no `level.decor` blit (no DRAW). My new **`Decor-
reachability` gate check** catches this ("1 WONT-RENDER"); repro + fix in `GATE-NOTES.md`.
Remaining engine steps (art is READY in `assets/sprites/`):
1. `game/data/assets.js` — `decor_cascade_valve: 'assets/decor_cascade_valve.png'` (+ others as placed).
2. `game/src/render.js` — iterate `world.decor`, blit `assets.get(d.key)` base-anchored to
   the ground y at `d.x` (parallax `d.parallax ?? 1`), mirroring `drawEnemySprite`.
Then I sync + manifest-finalize (like the tileset/bg finalize) and verify LIVE.
**Confirmed:** ~28–48px native prop size is fine for the 480×270 view (parent).

## ✅ DONE — per-stage BIOME TILESETS (6 biomes, deliverable #2 scaling engine) — FINALIZED + LIVE
WIRED by the engine (commit 41e9563: `assets.js` keys `theme_cascade..theme_fortress`,
`render.js drawGround` blits `assets.get(world.theme.tileset)` with the jungle `tiles`
fallback) and FINALIZED by me this cycle: folded into the canonical `run()` (section 5c)
so `manifest.json` carries all 6 `theme_<id>` entries; byte-synced to `game/assets/`;
contract gate cross-source consistent (25=25=25) and the biome keys report reachable via
the modeled theme-tileset draw path.

**Verified LIVE by looking** (headless capture of the real game at `?level=3..7`):
`assets/pipeline/experiments/biomes/live/MONTAGE-live-biomes.png` — every stage renders
its OWN distinct tileset (snow ice / desert sand / foundry steel+molten / caverns crystal
/ fortress stone), 0 page errors, 0 missing assets, `tileset loaded=true` per stage;
jungle correctly falls back to `tiles`. Capture harness: `assets/pipeline/tools/
capture-biome.mjs` (`node … --levels 1,3,4,5,6,7`). One command still (re)builds any
biome: `python assets/pipeline/generate.py biomes [id]`.

## 🔧 SHIPPED — WEAPONLESS hero + turret (creator round-2 two-gun defect fix)
**Unblocks the weapon-defect loop.** `player_idle/run/prone/jump` and `turret` are
regenerated as **weaponless bodies (no baked weapon)** — same keys, byte-compatible
**drop-in, NO engine change**. The engine's existing `drawGun`/`drawTurretBarrel` is now
the SOLE gun per entity (render.js:1169 was already waiting on "weaponless hero sprites,
same keys"). Contract gate green (19/19, 0 violations); real PixelLab art.
- Evidence + candidate bake-off + before/after: `assets/pipeline/experiments/weaponless/`
  (`COMPARE-*.png`, `MOCK-one-gun.png`, `README.md`).
- Run strip pinned to the engine's `PLAYER_RUN {fw:22,fh:31}` cell so it slices right.
- **Still engine-side for a creator re-APPROVE (NOT art):** 8-way directional gun/frame
  per aim + fire from that muzzle (CR-2/CR-3), and boss MOVEMENT (CR-4).

## ✅ DONE — Creator #1 theme (bridge-over-water)
WIRED + finalized + verified live (cycle 45). Engine consumes `theme_bridge`/
`theme_water`/`theme_water_top` (drawBridge/drawWater) and picked my NIGHT-muted water
variant; tiles are in manifest + a reproducible `THEME_TILE_SPECS` run() block
(pixel-identical to shipped). Gate 17/17. Final gate closure = a fresh creator APPROVE
of the live build (feedback loop's to obtain) — art side complete.

## ✅ DONE — Stage-2 2nd boss `chopper` GUNSHIP (FINALIZED + LIVE, cycle 48)
Engine wired the chopper kind; I finalized both phases (chopper 76×52 + chopper_enraged
78×51, hitbox 62×30) into manifest + assets.js + sync, and verified LIVE by looking
(`?level=2` → renders as my gunship, enrage swap works, 0 errors). Gate 19/19. Original
handoff below (kept for provenance):

Per `content/stage2/SPEC.md` §4/§6, the P0 second stage needs a distinct 2nd boss.
**Both art phases are PRODUCED + proven by looking + reproducible** (candidates in
`assets/pipeline/experiments/chopper-boss/`; recipes `CHOPPER_*` / `CHOPPER_ENRAGED_*`
in `generate.py`): a wide gunmetal+red attack helicopter (base 76×52, faces left) and an
init-anchored enraged phase-2 (78×51, glowing belly ordnance). Held as candidates
because the engine has no `chopper` kind yet (shipping the key would fail my
draw-reachability gate — correct guard).

**Engine (root.B) side to unblock (SPEC §4/§A2):**
1. `game/data/config.js` — add `ENEMIES.chopper` (`isBoss:true`, hitbox **62×30
   CONFIRMED** per `content/stage2/WIRE.md` Patch 1 = the fuselage of the 76×52 art,
   rotor/boom excluded) + optional enrage threshold like the Sentinel.
2. `game/data/assets.js` — add `chopper: 'assets/chopper.png'` (+ optional
   `chopper_enraged: 'assets/chopper_enraged.png'`).
3. `game/src/enemy.js` — add a `kind==='chopper'` behavior branch (horizontal sweep +
   hover + fire), patterned on the `boss`/`mortar` branches.
4. `game/src/world.js` — generalize the boss-assignment/win from `sp.type==='boss'` to
   `ENEMIES[sp.type].isBoss` so a 2nd boss registers.
5. `game/src/render.js` drawEnemy — route `kind==='chopper'` through `drawBoss` (like
   `boss`), swapping to `chopper_enraged` on the enrage phase (mirrors boss/boss_enraged).
6. Spawn it — wire `content/stage2/level2.data.js` into a live World.

**Art (me) FINALIZE — ~10 min once the kind exists:** `python generate.py` regenerates
`chopper`(+`chopper_enraged`) from the cached gens (`CHOPPER_*` consts, $0), packs, syncs
to `game/assets/`, adds `manifest.json → sprites.chopper`(+enraged) with the config
hitbox. My gate's cross-source + draw-reachability then verify it (as it did the theme
tiles + boss). Then I verify LIVE by looking (drive to the Stage-2 boss).

---

# (original) art-slice fidelity levers awaiting an engine greenlight

The sprite deliverable is **complete + gated** (14 sprites; `python
assets/pipeline/generate.py verify` = 14/14, cross-source + reverse-reachability +
no-placeholder + blit-meta all green) and grounding-loop-validated (`reference/
SCORECARD.md` art dims 4.0–4.5, at/above the popular-competitor bar).

Two fidelity levers remain toward the goal's "match **or exceed**" bar. Both are
**engine-coordination-blocked** — not unilateral art changes — because the engine
hardcodes the frame geometry it slices, decoupled from my `manifest.json`. This file
is the whole coordination contract in one place so either loop can execute in minutes
when greenlit. (Facts below verified by reading the cited files; re-check line numbers
before applying — they drift with engine churn.)

---

## Lever 1 — denser run cycle (dim-1 4.0 → 5, "Metal-Slug per-frame density")
**Engine change (root.B), 2 spots:**
- `game/src/render.js:31` — `const PLAYER_RUN = { fw: 22, fh: 31, frames: 4 }` →
  bump `frames` to N (e.g. 6 or 8).
- `game/src/render.js:825` — the frame-select `Math.floor(p.walkPhase / (Math.PI/2))
  % PLAYER_RUN.frames`: the `Math.PI/2` quarter-turn assumes 4 beats; make the step
  `2π / PLAYER_RUN.frames` so cadence stays tied to run speed at N frames.

**Art side (me): DONE / de-risked (cycle 36).** `generate.py gen_run_cycle6()` +
`RUN_POSES_6` produce a 6-frame stride (2 skeleton calls; poses 3–5 mirror 0–2),
proven CLEAN by looking — candidate in `pipeline/experiments/run-6frame/`
(`player_run6.png`, frame 23×30). NOT wired into `run()` (would break the live 4-frame
engine). To activate on greenlight: swap `gen_run_cycle`→`gen_run_cycle6` in `run()`,
repack `sprites.player.animations.run` at 6 frames, sync — a ~10-min wire.

**Enforcement:** the gate's **blit-meta alignment** check fails if manifest `#frames`
≠ render.js `PLAYER_RUN.frames` — so ship order is: art bumps manifest → gate goes RED
until the engine follows (or vice-versa). Coordinate to land together.

**Cost/scope:** rough pass first (judge a 6-frame loop by looking at gameplay scale vs
the shipped 4-beat before committing to 8). Celeste ships a 4-frame run, so this is a
pinnacle stretch, not a defect — invest proportionally.

---

## Lever 2 — bigger/denser explosion FX (dim-2 4.5 → 5, organic billow density+scale)
**Fact (why it's blocked):** the current 2-lobe multi-puff is the clean density
ceiling for the **28×40** cell — a 3rd lobe just adds detached noise (verified by
looking, `experiments/explosion-density/`). More lobes need more pixels.

**Engine change (root.B), 1 spot:**
- `game/src/render.js:23` — `explosion: { fw: 28, fh: 40, frames: 4, stepsPerFrame: 3,
  scale: 1.45 }` → enlarge the cell (e.g. `fw: 40, fh: 48`) and drop `scale` toward
  ~1.0–1.1 to keep on-screen size sane (bigger native cell, less upscale).

**Art side (me), then:** re-author the explosion at the larger native cell (more room
for stacked bursts / a wider billow), update `manifest.json → sprites.explosion`
frame dims to match, re-run `multipuff_composite` tuned for the bigger canvas, sync.

**Enforcement:** blit-meta gate asserts render.js `FX.explosion {fw,fh,frames}` ==
manifest — lands together or the gate is RED.

---

## Also blocked on engine (not levers, just tracked)
- **5th enemy type** (dim-5 → Huntdown-tier 5–6): engine must add the KIND first
  (config `ENEMIES.<kind>` + behavior + `level1` spawn); then I produce the sprite —
  the flyer/mortar pattern. A sprite for a non-spawned kind is an orphan (gate flags).
- **Weapon HUD icon** (HUD-1): blocked on a confirmed HUD icon slot size.
- **2nd-level / biome tileset**: needs a level 2 to exist.

Everything else the GOAL enumerated is shipped, real, wired, live-verified. See
`STYLE.md` (roadmap/status), `STYLE-BIBLE.md` (generation contract), `QA-NOTES.md`
(per-asset verification log).
