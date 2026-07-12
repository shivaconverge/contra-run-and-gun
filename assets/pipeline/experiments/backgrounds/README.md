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

## PERIODICITY — caverns FIXED (drop-in v2); foundry kept; rest acceptable
The 128px strip repeats ~4× across the 480px view (engine `BG.w=128`, CONFIRMED at
`render.js:173` + the tile loop `:196-198` — `for(x=-off; x<VIEW_W+BG.w; x+=BG.w)`).
**Fixed this cycle without any engine change** (128px stays; only the strip content changed):
- ✅ **caverns** (was the WORST offender — evenly-spaced spires → obvious sawtooth): re-authored
  v2 (seed 635) as IRREGULAR varied-height clustered crystals + evenly-spread veins → the 4×
  tile reads as one continuous crystal wall. Verified less-periodic by looking
  (`periodicity/v2-compare.png`) and LIVE at `?level=6` (`periodicity/` capture) — still
  distinctly violet-crystal. Finalized (synced + manifest).
- 🔒 **foundry** (2nd worst) — INVESTIGATION CLOSED, keep current. FOUR re-gen candidates
  judged by looking (`periodicity/foundry-v{2,3,4,5}*.png`), all WORSE than current:
  v2 (distributed windows) killed the coral MOLTEN sky → lost the hot-foundry identity;
  v3/v4/v5 (sunset / "no sun" / "flat coral no circle") EACH still drew a big celestial
  circle (sun/moon) that repeats 4× — pixflux insists on a sky landmark for a skyline, and
  removing it drifts the sky off coral. The current's single small glow-blob repeat is the
  LEAST obtrusive option + keeps the coral atmosphere → best balance. **Don't re-attempt
  foundry via re-gen** (dead end recorded to save rework); a true fix needs a wider strip
  (engine `BG.w` bump) or engine-side variant-cycling.
- **desert / snow / fortress / cascade**: mild/none, acceptable as-shipped (see below).
**PERIODICITY RESOLVED**: worst offender (caverns) fixed drop-in; foundry best-as-is
(4-candidate negative recorded); the rest acceptable. No open action on my side; any
further gain is an engine `BG.w` change (deferred).
**Assessment (evidence: `tiled-4x-all.png` = all 6 strips tiled 4× at worst-case static
full-opacity, no foreground):** ranked by how visible the repeat is —
- **desert**: barely (uniform dunes read as a continuous horizon) — fine.
- **snow / fortress / cascade**: mild (peaks/towers/dam recur, but read as a range/skyline).
- **caverns / foundry**: MOST visible (evenly-spaced bright landmarks — crystal spires,
  glow spots — repeat obviously); these are the priority polish candidates.
In ACTUAL gameplay the repeat is much less noticeable: the bg is the FAR layer at 0.15
parallax (slow), the foreground tileset + enemies + hero + FX draw the eye, and the engine's
procedural near-ridge/foliage bands partially occlude it (see the live prod frames,
`../set-dressing/live-prod/`). **Verdict: acceptable-as-shipped, polish-tier — NOT a blocking
defect.** Proper fix (deferred, needs API + an engine change): bump the engine's `BG.w` to
~240–256 and re-author wider strips (≤2 repeats/screen), starting with caverns/foundry; or
generate 2–3 variant strips the engine cycles. Recorded precisely so it gets improved, not
hidden. Scope stays the FAR layer (parent-confirmed); the engine keeps its procedural near bands.

## ✅ FINALIZED + LIVE (verified by looking)
The engine wired the bg-blit hook (commit 43d2db2: `assets.js bg_<biome>` keys +
`render.js drawParallax` blits `assets.get('bg_'+theme.id)` at `camx*0.15`, base y=158,
procedural fallback). Finalized here: folded into canonical `run()` (§5d) so
`manifest.json` carries all 6 `bg_<biome>`; byte-synced; gate extended (bg draw-path
modeled + wide-strip frame-cap exemption) → 31/31 pass, cross-source 31=31=31.

**LIVE proof:** `live/MONTAGE-live-bg.png` — headless capture of the REAL game at
`?level=3/5/6`. Snow's mountain range, foundry's glowing industrial skyline, caverns'
violet crystal spires render as the far layer in-engine; jungle keeps the procedural
fallback; 0 errors, 0 missing. Harness: `../../tools/capture-biome.mjs`.

## HANDOFF (historical) — engine background-image blit hook
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
