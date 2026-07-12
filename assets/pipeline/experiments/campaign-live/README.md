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
themed HUD name) on production. **0 page errors, 0 missing assets, tileset loaded=true**
per stage (`capture.json`). This is the GOAL's "7-stage campaign in which every stage has
a DISTINCT theme/biome with its own high-quality generated tileset ... boss" — LIVE at a
public URL real players can reach, and it matches the local finalized art (no deploy drift).

## Honest exception (tracked, engine-owned): SET-DRESSING props not yet on-screen
The montage shows distinct tileset+bg+boss per stage, but **no set-dressing props** render
yet — `level2.js` places `decor_cascade_valve` but `assets.js`/`render.js` don't load/blit
level.decor (see `../../GATE-NOTES.md` OPEN ISSUE + the `Decor-reachability` gate check =
"1 WONT-RENDER"). The prop ART is produced + staged (`../set-dressing/`); it needs the
engine's 2-step decor wire, then it renders per stage. Everything else the GOAL enumerates
for per-stage ART distinctness is LIVE.
