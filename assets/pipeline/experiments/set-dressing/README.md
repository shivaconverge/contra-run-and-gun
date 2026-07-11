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
NOT synced to `game/assets/` and NOT in `manifest.json` — there is no engine decor hook
yet, so shipping now would trip the cross-source gate (orphan). To wire (engine loop):
1. `game/data/assets.js` — key the props to use (`decor_snow_pine: 'assets/decor_snow_pine.png'`, …).
2. Level data — a `decor: [{ x, key, parallax? }]` array per stage (world-x, optional
   parallax factor for mid-ground depth).
3. `game/src/render.js` — after `drawParallax`/before entities, blit each decor sprite
   base-anchored to the ground y (mirror the existing `drawEnemySprite` feet-anchor).
Then I finalize (sync + manifest merge + a run() fold-in like the tilesets) and verify
LIVE by looking. **NEED from parent/campaign loop:** confirm the placement-hook shape +
the intended on-screen prop SIZE (I authored ~28–48px native; the engine may want a
specific scale) before I polish/expand to multiple props per biome.
