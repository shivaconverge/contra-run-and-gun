# Campaign art acceptance — verified LIVE on the PUBLIC PRODUCTION URL

**The whole pipeline art contribution, judged end-to-end by looking, from the deployed
site real players reach:** `https://shivaconverge.github.io/contra-run-and-gun/`.
Captured all 7 stages headless against the LIVE URL (not localhost) via
`../../tools/capture-biome.mjs --base <prod> --gamepath index.html --scenario boss
--levels 1-7`. Evidence: `CAMPAIGN-live-prod.png` + `capture.json`.

## Verdict (by LOOKING at `CAMPAIGN-live-prod.png`) — every stage is DISTINCT, LIVE
| stage | tileset | background (far parallax) | boss | HUD |
|-------|---------|---------------------------|------|-----|
| S1 Jungle        | green grass  | procedural jungle (base, no bg_jungle) | base Sentinel  | SENTINEL |
| S2 Cascade Base  | blue-grey concrete | dam wall + waterfalls (`bg_cascade`) | base Gunship | GUNSHIP |
| S3 Frozen Ridge  | snow/ice     | snow-capped mountains (`bg_snow`)      | Ice Sentinel (blue-white) | ICE SENTINEL |
| S4 Scorched Dunes| gold sand    | desert mesas (`bg_desert`)             | Sand Gunship (tan) | SAND GUNSHIP |
| S5 Iron Foundry  | dark steel   | industrial skyline (`bg_foundry`)      | Foundry Core (molten turret) | FOUNDRY CORE |
| S6 Crystal Caverns| purple crystal | crystal spires (`bg_caverns`)        | Crystal Wing (violet) | CRYSTAL WING |
| S7 Red Falcon Keep| grey-red stone | castle towers (`bg_fortress`)        | Red Falcon (crimson+gold) | RED FALCON |

Every stage renders its OWN distinct **tileset + background + themed boss** (with the
themed HUD name) on production. **0 page errors, 0 missing assets** on every stage
(`capture.json`). Tileset-load fact (from `capture.json`, corrected): **S2-S7 load their
own `theme_<biome>` tileset (`tilesetLoaded=true`); S1 Jungle is `false` BY DESIGN** — it
has no `theme_jungle` key and correctly uses the base `tiles` sheet (the confirmed
jungle-keeps-the-base fallback), which is why its ground reads green-grass, not a fallback
bug. This is the GOAL's "7-stage campaign in which every stage has
a DISTINCT theme/biome with its own high-quality generated tileset ... boss" — LIVE at a
public URL real players can reach, and it matches the local finalized art (no deploy drift).

## ✅ SET-DRESSING verified LIVE on the PUBLIC PRODUCTION URL (all 6 decor stages)
Definitive prod acceptance (`../set-dressing/live-prod/MONTAGE-decor-live-prod.png`): driving
the DEPLOYED site `shivaconverge.github.io/contra-run-and-gun` at `?level=2..7`, every decor-
bearing stage renders its prop on the ground for real players — cascade valves / snow pines /
desert cacti / foundry vats / cavern crystals / fortress braziers; 0 page errors, 0 missing.
Prod is byte-current with local (boss_desert v2 + decor PNGs md5-match live==local). So the
full distinct-per-stage art kit (tileset + background + set-dressing + boss) is LIVE for real
players — grounded by looking, not asserted.

## ✅ SET-DRESSING now WIRED + LIVE (was pending when this montage was captured)
When this montage was taken the decor wire didn't exist yet; the engine has since wired it
(`assets.js` keys 6 `decor_*` + `render.js drawDecor` over `world.decor`). All 6 decor-
bearing stages now render their prop (snow pines / desert cacti / foundry vats / cavern
crystals / fortress braziers / cascade valves), verified this cycle by engine state
(`world.decor.length=7` on Cascade) + looking (`../set-dressing/live-wired/
MONTAGE-decor-live.png`). The gate's `Decor-reachability` = **"6 → all render"** and the new
`Kit-completeness` roll-up shows `decor:ok` for every biome. Every per-stage ART class the
GOAL enumerates — distinct tileset + background + set-dressing + boss — is now LIVE.
