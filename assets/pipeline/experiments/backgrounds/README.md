# Per-stage BACKGROUND parallax art — deliverable #2 "background layers"

**One command produces a detailed distant-scenery far-layer for every biome.**
`python assets/pipeline/generate.py backdrops` (or `backdrops <biome>`) generates a
transparent 128×56 far-parallax scenery strip per biome via PixelLab pixflux. This is the
authored art the engine is explicitly waiting for: `render.js drawParallax` is labelled
*"Procedural placeholder for the environment until authored background art lands"* and the
creator's ROUND-1 note was *"background looks very simple"*.

## Grounded experiment first (can pixflux do wide backgrounds?) — YES
Before building the recipe I tested three candidates on snow (`snow_far_strip*`,
`snow_peak_prop`) and judged by LOOKING: the 128×56 **wide strip** with concrete
landmarks ("distant mountain range, snow-capped peaks, pine treeline") rendered a
detailed, layered mountain range — far richer than the procedural sine-band. A vague
"hazy/flat" prompt gave a featureless band → **the prompt must name concrete distant
landmarks.** So the recipe uses per-biome landmark scenes.

## What it produces (real art, judged by LOOKING — all 6 in-context)
| key | biome | distant scene |
|-----|-------|---------------|
| `bg_snow`     | snow     | snow-capped mountain range + pine treeline |
| `bg_desert`   | desert   | mesas / sandstone buttes + dunes |
| `bg_foundry`  | foundry  | industrial skyline, smokestacks w/ molten-orange windows |
| `bg_caverns`  | caverns  | rock spires + glowing violet crystal veins |
| `bg_fortress` | fortress | castle towers / battlements w/ red banners |
| `bg_cascade`  | cascade  | dam wall + water towers, teal mist |

Distinct-yet-coherent: per-biome landmarks + palette, one shared `BG_STYLE_BASE`
(distant silhouette, misty, flat, chunky, bold outline). Transparent above the ridge
so the sky gradient shows through.

## Evidence (this folder)
- `backdrops-in-context.png` — each backdrop tiled as the far layer over its REAL live
  biome frame. Every biome gains clear depth + identity; the foundry skyline and cavern
  crystal spires especially transform the scene.
- `snow-tile-seam.png` — 3× horizontal tile: the treeline joins continuously.
- `snow_far_strip*_4x.png`, `snow_peak_prop_4x.png` — the initial approach experiment.

## KNOWN LIMITATION (honest — tuning follow-up, not a blocking bug)
The 128px strip **repeats periodically** when tiled across the 480px view (~4×): the big
central peak recurs every 128px. It reads as a natural range at the far 0.15 parallax
rate (slow scroll), but the periodicity is visible. Mitigations for a polish pass: author
a wider strip (e.g. 240–256px so it repeats once per screen), edge-blend the seam, or
generate 2–3 variant strips the engine cycles. Recorded so it gets improved, not hidden.
Scope this cycle = the FAR layer only (biggest fidelity carrier); the engine keeps its
procedural near/canopy/foliage bands. A near-layer strip is the obvious next step.

## HANDOFF — engine background-image blit hook (produce-ahead-of-wire, gate-safe)
STAGED only: `assets/sprites/bg_*.png` + fragment `assets/pipeline/backgrounds.json`.
NOT synced to `game/assets/` and NOT in `manifest.json` (no bg-blit hook yet → keeps the
cross-source gate green). To wire (engine loop):
1. `game/data/assets.js` — key the strips (`bg_snow: 'assets/bg_snow.png'`, …).
2. `game/src/render.js drawParallax` — when `assets.get('bg_'+world.theme.id)` exists,
   blit it tiled horizontally at `camx*0.15`, ridge base ~y=158 (over the sky gradient,
   in place of / behind the procedural far-ridge). Keep the procedural fallback so jungle
   / unloaded stays byte-identical (mirrors the tileset swap pattern).
Then I finalize (sync + manifest merge + run() fold-in) and verify LIVE by looking.
**NEED:** confirm the bg-blit hook shape + whether a NEAR layer is also wanted before I
polish the seam / add layers.
