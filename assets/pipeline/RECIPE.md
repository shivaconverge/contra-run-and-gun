# RECIPE — the art SCALING ENGINE (authoritative index)

The one reference for what `assets/pipeline/generate.py` produces, how, and how the engine
consumes it. Facts below are computed from `assets/manifest.json` + `generate.py` (not
memory). Detail per class lives in `experiments/*/README.md`; the STYLE contract is
`../STYLE-BIBLE.md` (canvas/palette/silhouette rules). Status: **complete + LIVE** (all 7
stages verified on the public prod URL — `experiments/campaign-live/README.md`; contract
gate `generate.py verify` = 42/42 sprites, 4 known engine-owned aliases).

## What it produces — 39 manifest sprite keys, all real PixelLab pixel-art
**Base / character (deliverables #1, #3):**
- `player` (animations: idle / run / prone / jump) — WEAPONLESS hero bodies (two-weapon fix;
  engine draws the one aiming gun via `drawGun`). `grunt` `turret` `flyer` `mortar` (enemies,
  turret weaponless). `boss` + `boss_enraged` (Sentinel), `chopper` + `chopper_enraged`
  (gunship). `explosion` `muzzle` (FX). `pickup`. `tiles` (jungle ground). `theme_bridge/
  water/water_top` (creator-1 bridge-over-water).

**Per-stage biome kit (deliverable #2) — 4 classes × the 6 themed biomes:**
| class | keys | engine draw path | format |
|-------|------|------------------|--------|
| tileset | `theme_{cascade,snow,desert,foundry,caverns,fortress}` | `assets.get(world.theme.tileset)` in drawGround | 48×16 [cap,dirt,dirt2] |
| background | `bg_{snow,desert,foundry,caverns,fortress,cascade}` | `assets.get('bg_'+theme.id)` tiled at camx*0.15 in drawParallax | 128×56 far strip |
| boss | `boss_{snow,desert,foundry,caverns,fortress}` | `assets.get('boss_'+theme.id)‖e.kind` in drawEnemy | ≤64px (sentinel) / ≤80 (chopper) |
| set-dressing | `decor_<biome>_<name>` (valve/pine/cactus/vat/crystal/brazier) | `drawDecor` over `world.decor` (`assets.get(d.key)`) | native ~28–48px, base-anchored |
(jungle = Stage 1 keeps base `tiles`/`boss`; cascade = Stage 2 keeps base `chopper` — no
themed boss. `Kit-completeness` in `verify` asserts each biome has its defined classes.)

## Commands (`python assets/pipeline/generate.py <cmd>`), source `../.provider_secrets.env`
- `run` (no arg) — full canonical build: every sprite → `assets/sprites/` → sync `game/assets/`
  → rebuild `manifest.json`. Idempotent; cache makes re-runs ~$0.
- `stage <biome>` / `stage all` — **one command = one stage's whole kit** (tileset+bg+boss+
  decor); merges wired classes into manifest (idempotent with `run`), fragment → `stage-kits/`.
- `biomes` / `backdrops` / `bosses` / `decor` [<biome>] — fast per-class iterators (merge, not
  clobber, into their `*.json` fragments).
- `verify` — the contract GATE (no API): per-sprite (transparency/palette/dims/sync) +
  cross-source (manifest↔assets.js↔shipped) + draw-reachability (every engine key is blitted;
  models literal / `e.kind` / wrapper / `theme.tileset` / `'bg_'+id` / `'boss_'+id` / `d.key`
  paths) + no-placeholder-enemy + decor-reachability + blit-meta alignment + kit-completeness.
  Exit 0 = green. Resumable + timeout-safe (every API result cached the instant it returns).

## Add a stage (the SCALING recipe — proven on a novel biome, `experiments/scaling-proof/`)
1. Add the biome's 4 entries to `BIOME_TILESETS`/`BIOME_BACKDROPS`/`BIOME_BOSSES`/`SET_DRESSING`.
2. `python generate.py stage <biome>` — mints + syncs + manifests the full kit.
3. Engine: add the biome to `config.THEMES`+`CAMPAIGN`, key the sprites in `game/data/assets.js`
   (the render draw paths above resolve them dynamically); then `verify` + look LIVE.
(Campaign is a FIXED 7 stages — volcano in `experiments/scaling-proof/` is proof-only, not wired.)

## Known / handoff
- 4 redundant bare `player_*` keys in `game/data/assets.js` alias the same weaponless PNGs the
  `_noweapon` keys draw → `verify` flags them shipped-but-unreachable (engine cleanup; see
  `GATE-NOTES.md`). Not a visible bug. bg periodicity + other polish: `experiments/*/README.md`.
