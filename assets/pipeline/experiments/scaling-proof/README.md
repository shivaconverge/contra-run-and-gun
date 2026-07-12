# SCALING-ENGINE proof — a NOVEL biome's full art kit from a ONE-SHOT theme spec

**The core claim of this loop's perspective** ("wire the pipeline as the SCALING ENGINE
before stages 3-7 are mass-produced") and deliverable #2's headline ("one command produces
a **new** stage's art kit") — demonstrated end-to-end on a biome that is NOT in the 7-stage
campaign and was NEVER prompt-tuned: **volcano**.

## What was done
Wrote ONE theme spec (4 prompts: tileset cap/dirt, background, boss, decor) and ran the
exact recipe primitives generate.py uses — `gen_tile`→`cap_bevel`/`enhance_dirt`(biome
speckle)/`pack_tiles`; `gen_pixflux_wh`; `gen_pixflux`+`tighten_to_budget`+`pack_strip` —
in ONE pass (5 PixelLab calls, ~$0.02). No per-biome seed/prompt iteration; the first spec
was the shipped one. Output is EXPERIMENT-ONLY: `volcano/` — NOT synced to `game/assets`,
NOT in `manifest.json`, NOT in `config.STAGES` (it is a proof + a ready stage-8 candidate,
not a campaign stage). Real PixelLab art (placeholder/procedural = FAILURE).

## Verdict — judged BY LOOKING (`volcano/kit-montage.png`)
All 4 art classes came out DISTINCT + COHERENT + USABLE in one shot:
| class | key | result |
|-------|-----|--------|
| tileset    | `theme_volcano`        | dark obsidian rock, glowing lava-crack cap line, lava flecks — reads volcanic |
| background | `bg_volcano`           | erupting central volcano (lava spurt + flows), deep-red sky — strong, distinct |
| boss       | `boss_volcano`         | Magma Golem: molten-red lava core + glowing veins, sentinel geometry — a genuinely new boss |
| decor      | `decor_volcano_geyser` | obsidian rock with lava geyser spurting up |

**DISTINCT** (unmistakably lava/obsidian/red, ≠ the 7 shipped biomes) yet **COHERENT** (same
chunky bold-outline pixel-art discipline + the same per-class formats: 48×16 [cap,dirt,dirt2]
tileset, 128×56 far-strip bg, ≤64px sentinel boss, base-anchored prop). This closes
`obs_consistency_vs_distinct_tension` on fresh input and proves the recipe is mature —
adding stage 8 needs no re-tuning, just a spec.

Minor (honest): the tileset dirt has a few cool blue-grey chunks (slightly off pure-volcanic);
a seed nudge would perfect it — one-shot is ~90%, not a defect.

## To ADOPT volcano as a real stage (handoff, ~1 command + engine wire)
1. Add the 4 volcano entries to `BIOME_TILESETS` / `BIOME_BACKDROPS` / `BIOME_BOSSES` /
   `SET_DRESSING` in `generate.py` (the prompts are in `/tmp`-style spec above / this dir's art).
2. `python generate.py stage volcano` — mints + syncs + manifests the whole kit (the unified
   command), then the contract gate + Kit-completeness cover it.
3. Engine: add `volcano` to `config.THEMES` + `CAMPAIGN`, key the sprites in `assets.js`
   (theme/bg/boss/decor keys the render already resolves dynamically). Then verify LIVE.
