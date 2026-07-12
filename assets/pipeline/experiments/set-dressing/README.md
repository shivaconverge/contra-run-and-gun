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

## ✅ WIRED + LIVE on ALL 6 decor-bearing stages (verified this cycle)
Fully wired end-to-end: `assets.js:194-199` keys all 6 `decor_*`, `render.js drawDecor`
iterates `world.decor` and blits `assets.get(d.key)` base-anchored, and `world.js` binds
`this.decor = this.level.decor`. Placement: stages 3-7 via `config.js CAMPAIGN[].decor`
(snow pine / desert cactus / foundry vat / cavern crystal / fortress brazier) + Stage-2
Cascade via `level2.js` (`decor_cascade_valve ×7`).

**Cascade (parent-flagged) is LIVE — verified by FACT + looking this cycle:** engine state
`window.__game.decor.length = 7`, `decor0 = {x:200, key:'decor_cascade_valve'}`,
`assets.get('decor_cascade_valve')` truthy; and a start-frame capture shows two big red-wheel
valve props on the ground (distinct from the small purple turret — the valve blits at native
42×44, ~2× the turret's ~22px). The gate's `Decor-reachability` reads **"6 → all render"** and
`Kit-completeness` shows `decor:ok` for every biome. Earlier "renders nothing" notes were the
PRE-wiring state (superseded). All 6 art props are finalized (synced + in manifest).
