# Per-stage SET-DRESSING props — deliverable #2, the art class after tilesets

**One command produces a signature decoration prop for every biome.**
`python assets/pipeline/generate.py decor` (or `decor <biome>`) generates transparent
free-standing pixel-art props, one per biome, real PixelLab pixflux. Adds the "set-
dressing" the GOAL lists per stage and directly answers the creator's ROUND-1 note
("background looks very simple"): before this, biome distinctness was only the tileset +
a procedural parallax sine-band (render.js drawParallax); nothing decorated the playfield.

## What it produces (real art, judged by LOOKING)
| key | biome | prop | native |
|-----|-------|------|--------|
| `decor_cascade_valve`   | cascade  | rusty red-wheel pipe valve      | 42×44 |
| `decor_snow_pine`       | snow     | snow-laden evergreen pine       | 28×48 |
| `decor_desert_cactus`   | desert   | green saguaro cactus            | 30×46 |
| `decor_foundry_vat`     | foundry  | molten-metal smelting vat       | 42×38 |
| `decor_caverns_crystal` | caverns  | glowing violet crystal cluster  | 40×48 |
| `decor_fortress_brazier`| fortress | flaming iron brazier            | 30×44 |

Distinct-yet-coherent (strategy `obs_consistency_vs_distinct_tension`): each prop is a
biome-specific object on that theme's palette; all share `PROP_STYLE_BASE` (bold outline,
chunky 16-bit, transparent, single centered object). Base-anchored: the engine sits the
prop BOTTOM on the ground y.

## Evidence (this folder)
- `props-montage.png` — all 6 props at 5× zoom.
- `props-in-context.png` — each prop composited base-anchored on its REAL live biome
  frame (from `../biomes/live/`) at two x positions, so the in-scene read is judged, not
  just the isolated sprite. They ground correctly and add clear biome identity.

## Timeout note (strategy `obs_agent_timeout_vs_full_biome_gen`)
Generating all 6 exceeded a 2-min foreground window mid-run, then a re-run FINISHED at
~$0 because every prior prop was already cached — demonstrating the pipeline's cache
makes full-kit generation RESUMABLE (a timeout loses only the in-flight call, never
committed progress). Prefer `decor <biome>` for single-prop iteration.

## HANDOFF — engine placement hook (produce-ahead-of-wire, gate-safe)
STAGED only: `assets/sprites/decor_*.png` + fragment `assets/pipeline/set-dressing.json`.
NOT synced to `game/assets/` and NOT in `manifest.json` — held back so the cross-source
gate stays green until the engine LOADS + DRAWS decor.

## ⚠️ PARTIAL WIRE — Stage-2 places my decor but it renders NOTHING (OPEN ISSUE)
The engine started wiring decor: `config.js` documents the `decor:[{x,key,parallax}]`
level field, `world.js validateDecor` enforces the `decor_` contract, and **`level2.js`
now places `decor_cascade_valve ×3`** (Cascade). BUT `assets.js` doesn't key it (no LOAD)
and `render.js` has no `level.decor` blit (no DRAW) → **Stage 2 shows zero props**.
Verified LIVE (`live/level2-cascade.png`: tileset + `bg_cascade` render, no valve). My new
`Decor-reachability` gate check catches this ("1 WONT-RENDER"); full repro + the 3-step
fix are in `assets/pipeline/GATE-NOTES.md` (dated 2026-07-12). Remaining engine steps:
1. `game/data/assets.js` — `decor_cascade_valve: 'assets/decor_cascade_valve.png'` (+ others as placed).
2. `game/src/render.js` — iterate `world.decor` and blit `assets.get(d.key)` base-anchored
   to the ground y at `d.x` (parallax `d.parallax ?? 1`), mirroring `drawEnemySprite`.
Then I sync + manifest-finalize (like the tileset/bg finalize) and verify LIVE by looking.
The other 5 biome props are produced + staged, awaiting per-biome `decor:[]` placement.
**Confirmed:** ~28–48px native prop size is fine for the 480×270 view (parent).
