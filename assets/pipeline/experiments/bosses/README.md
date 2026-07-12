# Per-stage BOSS re-themes — deliverable #2's last art class ("boss sprite from a theme spec")

`python assets/pipeline/generate.py bosses` produces a **distinct themed boss per stage**,
real PixelLab art. Closes the last unbuilt art class of deliverable #2 and the GOAL's
"every stage has ... its own boss": today `render.js drawBoss` blits the SAME
`assets.get('boss')` Sentinel for stages 1/3/5/7 and `assets.get('chopper')` for 2/4/6 —
config STAGES only overrides name/hp/COLOR, so Ice Sentinel / Foundry Core / Red Falcon
all show the identical gunmetal Sentinel (parent-confirmed: reused).

## The bosses (real art, judged by LOOKING — `all-bosses.png`)
| key | stage | boss | family | native |
|-----|-------|------|--------|--------|
| `boss_snow`     | 3 | Ice Sentinel — blue-white ice/crystal mech | sentinel | 45×48 |
| `boss_foundry`  | 5 | Foundry Core — steel cannon-turret, molten lava base | sentinel | 60×60 |
| `boss_fortress` | 7 | Red Falcon — crimson+gold bird-of-prey war-mech | sentinel | 56×54 |
| `boss_desert`   | 4 | Sand Gunship — tan/ochre desert-camo chopper | chopper | 76×42 |
| `boss_caverns`  | 6 | Crystal Wing — violet crystalline gunship | chopper | 73×48 |

Each keeps its family's gameplay silhouette (sentinel emplacement ≈ base 46×52 hitbox;
gunship ≈ 62×30) so it drops into the existing boss draw/hitbox.

## GROUNDED FINDING — init-anchoring can't re-palette a boss (judged by looking)
First attempt init-anchored each themed boss to the base boss/chopper (the `boss_enraged`
pattern). It **failed**: `strength-sweep.png` shows that at every `init_image_strength`
(165/110/90) the boss stayed GUNMETAL GREY — the "ice"/"sand" theme never applied; lower
strength only warped the pose. The base sprite's palette dominates the init. **FRESH
generation** (no init, strong biome-themed prompt) DOES produce a genuinely distinct,
on-palette boss — `fresh-vs-base.png` (ice = blue-white, sand = tan/ochre). So the recipe
is fresh-gen, not re-theme. (Evidence kept: `tune_*`, `*_fresh`, the sweeps.)

## ✅ RESOLVED: `boss_desert` (Sand Gunship) re-seeded (v1 was mushy)
v1 (seed 172, "dusty sun-bleached weathered" prompt) had a mottled/muddy camo surface —
the weakest boss. v2 (seed 184, CLEAN flat-panel prompt) is crisper: sharp silhouette,
defined cockpit + chin cannon + rotor. Judged by looking (`desert-reseed/compare.png`)
+ verified LIVE (`desert-reseed/level4-desert.png` boss scenario). Finalized + synced.

## HANDOFF — engine per-stage boss swap hook (produce-ahead-of-wire, gate-safe)
STAGED: `assets/sprites/boss_*.png` + fragment `assets/pipeline/bosses.json`. NOT synced /
in manifest (no boss-swap hook yet → keeps the cross-source gate green). To wire:
1. `game/data/assets.js` — key the bosses (`boss_snow: 'assets/boss_snow.png'`, …).
2. `game/src/render.js drawEnemy` — resolve the boss sprite as
   `assets.get('boss_' + world.theme.id) || assets.get(e.kind)` (mirrors the tileset/bg
   swap); the enrage swap can stay `boss_enraged`/`chopper_enraged` or gain per-biome
   variants later. Drawn to the same hitbox, so no geometry change.
Then I sync + manifest-finalize (like the tileset/bg finalize) and verify LIVE by looking.
**NEED:** confirm the boss-swap hook shape + whether per-biome ENRAGE variants are wanted.
