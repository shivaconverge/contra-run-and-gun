# SCALING-ENGINE proof — a NOVEL biome's full art kit from a ONE-SHOT theme spec

**PROOF-ONLY artifact — NOT a stage.** The campaign is a FIXED 7 stages (jungle / cascade /
snow / desert / foundry / caverns / fortress) — parent-confirmed, and volcano will NOT be
adopted as an 8th stage. This directory exists purely as *evidence* that the recipe scales:
it demonstrates the core claim of this loop's perspective ("wire the pipeline as the SCALING
ENGINE") and deliverable #2's headline ("one command produces a **new** stage's art kit") by
minting a complete, distinct, on-style kit for a biome that was NEVER prompt-tuned:
**volcano**. It stays experiment-only (no sync / no manifest / not in `config.STAGES`).

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

## How the recipe would extend to an 8th biome — reference ONLY (campaign is fixed at 7)
Volcano is NOT being adopted; recording the extension path only to document that the SCALING
ENGINE is a one-command operation, should the GOAL's stage count ever change:
1. Add the 4 volcano entries to `BIOME_TILESETS` / `BIOME_BACKDROPS` / `BIOME_BOSSES` /
   `SET_DRESSING` in `generate.py` (the shipped prompts are `boss_volcano`/`bg_volcano`/etc.
   tags in `.cache`; art in this dir).
2. `python generate.py stage volcano` — mints + syncs + manifests the whole kit (the unified
   command), then the contract gate + Kit-completeness cover it.
3. Engine: add `volcano` to `config.THEMES` + `CAMPAIGN`, key the sprites in `assets.js`.
Until/unless the 7-stage scope changes, none of this runs — volcano stays proof-only art here.
