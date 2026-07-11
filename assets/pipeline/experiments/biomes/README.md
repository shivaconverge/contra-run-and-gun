# Per-stage biome tileset recipe — the SCALING ENGINE (deliverable #2)

**One command produces a distinct biome tileset for every campaign stage.**
`python assets/pipeline/generate.py biomes` generates all 6 non-jungle biome tilesets
(`biomes <id>` for just one). Proves the asset-gen pipeline scales 1→7 biomes
(strategy `task_pipeline_throughput_1to7`).

## What it produces
For each biome id in `BIOME_TILESETS` (matching the engine's `config.js THEMES` keys),
a **48×16 tilesheet `assets/sprites/theme_<id>.png`** — three 16px tiles
`[cap@0, dirt@16, dirt2@32]`, the **exact same format** as the stage-1 `tiles` sheet, so
the engine swap is a one-liner (see handoff below). Manifest-ready records go to the
fragment `assets/pipeline/biome-tilesets.json`.

Biomes (all real PixelLab pixflux, on each theme's config `ground`/`accent` palette):
| id | material / palette | distinct read |
|----|--------------------|---------------|
| `cascade`  | wet blue-grey concrete + teal moss/water | dam base |
| `snow`     | bright white + pale ice-blue (v2)        | frozen ridge |
| `desert`   | golden sand + tan sandstone              | scorched dunes |
| `foundry`  | dark gunmetal steel + molten-orange edge | iron foundry |
| `caverns`  | dark purple rock + glowing violet crystal| crystal caverns |
| `fortress` | grey-red carved stone + red banner/rivets| red keep |

## Consistency-vs-distinct (strategy `obs_consistency_vs_distinct_tension`)
DISTINCT: biome-specific material nouns + a palette keyed to each theme's config
`ground`/`accent`; the dirt density-stipple (`enhance_dirt` `speckle`) is tuned per
biome so it stays on-palette. COHERENT: all share `TILE_STYLE_BASE` (chunky 16-bit,
bold near-black outline, three tone values, seamless) and the identical
`cap_bevel` / `enhance_dirt` / dirt2-derive pipeline + 16px grid as the shipped jungle.

## Evidence (this folder) — judged by LOOKING
- `ALL-biomes-vs-jungle.png` — all 6 biomes vs the stage-1 jungle ref, each shown as
  `[cap|dirt|dirt2]` + a tiled fill block (seamless + read check).
- `snow-v2.png` — the snow re-tune (see OPEN ISSUE below, now resolved).

## OPEN ISSUE (resolved this cycle) — snow v1 dark voids
Snow v1 (seeds 302/402) leaned into dark rock shadow → **24% near-black pixels** = black
voids that broke the seamless snow-ground read (would look like holes in terrain).
Re-tuned to a bright full-coverage snow/ice prompt + lower contrast (1.12); snow v2 =
**0% near-black**, verified clean by looking. The recipe now exposes a per-biome
`contrast` override for exactly this.

## HANDOFF — engine wire (produce-ahead-of-wire, like the chopper)
NOT synced to `game/assets/` and NOT in `manifest.json` yet — the engine loader
(`game/data/assets.js`) doesn't key `theme_<id>`, so shipping now would trip the
cross-source contract gate (orphan). Two small steps land them together:
1. **`game/data/assets.js`** — add `theme_cascade..theme_fortress: 'assets/theme_<id>.png'`.
2. **`game/src/render.js` `drawSolid`/`drawGround`** — swap `assets.get('tiles')` →
   `assets.get(world.theme.tileset) || assets.get('tiles')`. Slicing is unchanged
   (`TILES` rects identical). Jungle stays `tiles`; every other stage draws its biome.
Then art FINALIZE (~5 min, $0 cached): sync `theme_*.png` to `game/assets/` + merge
`biome-tilesets.json` into `manifest.json`; the contract gate then covers them.
