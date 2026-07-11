# STYLE-BIBLE — the generation contract for on-style sprite scaling

Authoritative, **fact-grounded** contract for producing NEW sprites that stay
on-style and load correctly. Every number here is pulled from a real source
(`assets/manifest.json`, `game/data/config.js`, `assets/pipeline/generate.py`) —
not memory. Use it to add enemies, poses, tiles, FX, level-2 art, or variants
without re-deriving the rules. Companion docs: `STYLE.md` (art direction + status),
`QA-NOTES.md` (per-asset verification log). Style is **CONFIRMED** vs the corpus
(`manifest.meta.styleConfirmed = true`): arcade-1987 nostalgic anchor + competitor
visual-bar fidelity (Galuga/Gunslugs/Blazing Chrome).

---

## 1. Canvas & scale contract (from config.js + render.js — CONFIRMED)
- **Logical view:** 480×270 px, nearest-neighbour, `imageSmoothingEnabled=false`.
- **Authoring rule:** author at NATIVE display scale so the engine blits near 1:1
  (uniform, Contra-crisp pixels) — do NOT up-author + decimate.
  - Characters/enemies/FX/pickup: **32 px** native canvas (pixflux min area).
  - Boss (and any large set-piece): **64 px** native.
  - Tiles: **16 px** native (opaque; see §5).
- **Engine display scale:** `render.js drawPlayerSprite`/`drawEnemySprite` scale a
  sprite to **`hitbox.h × 1.4`** tall, **feet-anchored** to the hitbox floor,
  **centred** on the hitbox, **mirrored by facing** (grunt mirrors when `dir>0`;
  boss faces LEFT — do NOT mirror). Author taller-than-hitbox; the engine fits it.
- **Background:** characters/enemies/FX/pickup are **transparent** (alpha, no matte,
  no halo). Tiles are **fully opaque** (ground is not see-through).

## 2. Palette (32 colours — `manifest.meta.palette`, read from the produced art)
```
#0f0f0d #0f0c0a #141212  (near-black outline/shadow)
#3c3982 #443e8d #656cdc #9b98f3 #938cef #767ced #7176dd #3c388c #393182 (hero blues)
#8a1313 #ed1711 #e7110e #941416 #a11a1d (reds — bandana/boots/grunt/warning)
#9e511a #b35e21 #c46d36 #b86634 #c9783c #f79b5e #e3965b (browns/tan — arms/dirt/rifle)
#e8b098 #e69e7f #ed9c6c #ffd89e (skin/highlights)
#787678 #736e6a #7e7d7d #131417 (steel greys — turret/boss)
```
Families: **outline** near-black `#0f0f0d`; **hero** saturated blues + tan skin +
red accents; **enemies** crimson (grunt) / purple-steel (turret) / gunmetal+red
(boss); **environment** earthy browns + grass greens. New art should draw from
these families; lock to them via the pipeline's forced-palette option (§4).

## 3. Silhouette / identity rules (the non-negotiable feel invariants)
- **Bold ~1px near-black outline**, high contrast, saturated — reads at gameplay zoom.
- **Palette-distinct per entity so silhouettes never merge** (arcade §6 invariant):
  hero = blue+tan+red-bandana; grunt = crimson; turret = purple dome; boss =
  gunmetal + glowing red core. A new enemy MUST get its own colour family.
- **Hero pose is aim-neutral** — the sprite holds the rifle forward; the engine
  overlays the 8-way aim gun/muzzle procedurally. Don't bake an aim angle in.
- **Bright tan bare arms** are what make the hero pop against dark backdrops — keep
  them explicit in any new hero pose.

## 4. Per-asset spec (CONFIRMED dims — from manifest.json)
| asset | native | shipped frame(s) | hitbox (config) | frames · fps | notes |
|-------|--------|------------------|-----------------|--------------|-------|
| player idle | 32 | 20×29 | 12×20 | 1 | base; also the skeleton + palette-lock reference |
| player run | 32 | 22×31 | 12×20 | **4 · 10** | 4-beat `[contactL,pass,contactR,pass]` |
| player jump | 32 | 25×25 | 12×20 | 1 | airborne leap, aim-forward |
| player prone | 32 | 28×15 | 12×11 (proneH) | 1 | low flat, ducks chest-height fire |
| grunt | 32 | 26×26 | 14×18 | 1 | crimson soldier, faces left |
| turret | 32 | 26×27 | 18×16 | 1 | purple dome + barrel |
| flyer (3rd enemy) | 32 | 28×17 | ~16×14 (assumed) | 1 | copper aerial drone, red eye, faces left |
| boss (Sentinel) | 64 | 57×54 | 46×52 | 1 | gunmetal, cannon LEFT, glowing core |
| boss_enraged | 64 | 57×54 | 46×52 | 1 | phase-2, init-anchored to boss; flaring core, scorched |
| pickup pod | 32 | 32×15 | 14×12 | 1 | gold falcon; engine overlays weapon LETTER |
| explosion FX | 32 | 28×40 | — | **4** · additive | spark→fireball→flame+smoke→smoke |
| muzzle FX | 32 | 22×25 | — | **2** | isolated warm flash, no gun |
| tiles | 16 | 48×16 sheet | — | 3 tiles | cap + dirt + dirt2 (derived) |

**Animation frame budget:** static single-pose is the default (idle/jump/prone,
all enemies, boss, pickup). Only the RUN (4) and FX (explosion 4 / muzzle 2) are
multi-frame. `/animate-with-skeleton` caps at **3 pose skeletons per call** → pack
to a 4-beat loop. More in-betweens (≥6-frame run) are optional polish.

## 5. Generation recipe (the pipeline contract — `generate.py`)
- **Single poses / enemies / boss / pickup:** `gen_pixflux(prompt, size, seed)` →
  PixelLab `/generate-image-pixflux`, `no_background:true` → `strip_background` →
  `pack_strip(..., tighten=True)` (`tighten_palette` snaps ≤2px AA speckle to the
  nearest dominant colour — enforces the limited palette, crisps edges; verified
  no-degrade cycle 20) → `content_bbox` trim → manifest → `sync_to_engine`.
  NOTE: `tighten=True` is for CHARACTERS/ENEMIES/BOSS/PICKUP only — FX (soft
  additive gradients) and tiles (intentional pebble speckle) pack with `tighten=False`.
- **Run cycle:** `/estimate-skeleton` on the idle → author 3 leg-pose skeletons
  (normalised 0–1 coords) → `/animate-with-skeleton` with `reference_image=idle`
  AND `color_image=idle` (forces palette) → pack `[f0,f1,f2,f1]`.
- **FX:** per-stage pixflux frames → `warm_clamp` (kills off-palette pink) →
  `center_frames` (co-register blast centroid) → strip. Explosion `register:True`.
- **Tiles:** pixflux 32px opaque → downscale to 16 → `cap_bevel` (highlight top +
  dark under-lip) / `enhance_dirt` (contrast + stipple); `dirt2` is DERIVED from
  dirt (offset + re-stipple) to avoid a repeating-clod motif. Opaque, seam-safe.
- **Palette-lock discipline:** pass `palette_lock=_encode(idle)` (→ `color_image`)
  for EVERY new player pose and FX so the commando/warm palette stays identical
  frame-to-frame. This is the cheap lever that makes the set read as one hero.
- **Determinism / cost:** fixed `seed` per asset; every API result is cached under
  `pipeline/.cache/` keyed by request-body hash → re-runs cost $0. Judge by
  looking at candidates; lock the winning seed/prompt.

## 6. "Add a new on-style asset" checklist
1. Pick the native size (§1) and a distinct colour family (§3); pick a fixed seed.
2. Generate 1–2 candidates; **judge by LOOKING** (raw + at engine display scale)
   against the closest `reference/frames/*` — never a CV metric.
3. Palette-lock to the idle if it's a hero pose/FX (§5). Background: transparent
   (character/FX) or opaque (tile).
4. Add a `manifest.json → sprites.*` entry (image + frameWidth/Height + frames +
   hitboxPx if an entity); `sync_to_engine`; add the key to `game/data/assets.js`.
5. It loads via `AssetStore` but the engine draw fn must consult it — surface the
   wiring as a `need` (produce→engine-wires pattern: idle/run/enemies/boss/tiles/
   FX/pickup all followed it) and file an OPEN ISSUE until blitted.
6. Run the **contract gate**: `python assets/pipeline/generate.py verify` (no API)
   — asserts every shipped sprite's MECHANICAL contract: background-removed
   (transparent margins) for characters/enemies/boss/pickup/FX; fully opaque for
   tiles; per-frame dims ≤64px; palette ≤48 opaque colours (characters); byte-synced
   to `game/assets/`. It ALSO cross-checks the three sources of truth —
   `manifest.json` ↔ engine `game/data/assets.js` keys ↔ shipped `game/assets/*.png`
   — flagging any orphan (shipped but unreferenced), missing (key with no PNG), or
   un-manifested file. It THEN runs a **draw-path reachability** check (reads
   `render.js`/`config.js` read-only): every engine key must actually be BLITTED —
   a literal `assets.get('key')` OR, for an enemy kind, the dynamic
   `assets.get(e.kind)` path (grunt/turret/flyer route through `e.kind`, not a
   literal). A key declared + shipped but never drawn is *shipped-but-unreachable*
   and counts as a violation — so the gate scores only the SHIPPED **reachable**
   sprite graph, not merely generated content. It ALSO runs the **reverse** check
   (`No-placeholder-enemy`): every enemy kind SPAWNED in `level1.js` must have a real
   sprite key in `assets.js`, else the engine draws it PROCEDURALLY — a placeholder
   box the GOAL forbids. (This is the exact gap that let `mortar` ship as a procedural
   shape when the engine added the kind, cycle 30; now auto-caught.) Exit 0 = green.
   Finally it checks **blit-meta alignment**: the engine HARDCODES the frame geometry
   it slices for the multi-frame sprites (`render.js` `PLAYER_RUN` + `FX{}`) separately
   from this manifest, so the gate asserts render.js's `(fw,fh,frames)` == the
   manifest's `(frameWidth,frameHeight,#frames)` for run/explosion/muzzle. A drift
   here mis-slices the strip → the animation renders BROKEN (nothing else catches it).
   This is also the coordination tripwire for a denser run: bumping run frames 4→N in
   the manifest without the engine following trips it. Exit 0 = green. Catches off-spec
   drift automatically (AA-palette bloat, opaque-bg matte, mis-sync, a new key with no
   synced art, a key with no draw path, a spawned enemy with no sprite, engine/manifest
   frame-geometry drift).
7. Verify LIVE in the real engine (headless capture) and log the verdict in
   QA-NOTES. `spritesMissing:[]` + 0 page errors is the load gate; the LOOK is the
   fidelity verdict (the contract gate is mechanical only — NEVER the fidelity call).

## 7. Grounding sources (compare NEW art against these, by looking)
- Nostalgic feel: `reference/frames/arcade-contra-1987/stage1/*` + teardown §1–6.
- Fidelity bar: `reference/frames/{contra-operation-galuga-2024,gunslugs-2,blazing-chrome-2019,huntdown-2020,metal-slug-3}/*` + `teardowns/competitors-visual-bar.md`.
- Environment: `teardowns/environment-tileset-bar.md`.

## 8. Validated against published pixel-art authoring practice (2026-07-10)
Cross-checked this contract against external best-practice guides + shipped-game
precedents (Celeste, Shovel Knight, Dead Cells). What's CONFIRMED aligned, and the
concrete refinements now folded into the rules above:

**Confirmed aligned (no change needed):**
- **Native 32px = the indie sweet spot** for 16-bit-style characters (our base);
  16px for tiles, 64px for the boss set-piece — standard tiers.
- **Silhouette-first / squint-test readability** (our §3) — the #1 pro rule.
- **Nearest-neighbour, no bilinear** (our §1; engine `imageSmoothingEnabled=false`).
- **Style-guide-before-second-asset + cross-entity consistency** — this file IS that
  guide; palette-lock (§5) is our consistency mechanism.
- **4-frame run cycle is a SHIPPED precedent** — Celeste's Madeline runs on 4 frames.
  Validates our `player.run` (4-beat); a 6-frame run is the *optional* stretch at
  32px (pro range is 6–8), not a defect. Idle 2–4 / attack 3–6 / jump 3–5 are the
  pro budgets → our single-frame idle/jump/prone are within the low end (a 2-frame
  idle "breathe" is an optional liveliness upgrade).

**Refinements adopted (apply when generating/judging new art):**
- **Per-sprite palette budget:** keep an individual sprite to ~4–8 colours + outline
  (≤4 for tiny icons like the HUD/pickup). The 32-colour `meta.palette` is the
  whole-GAME set, NOT a per-sprite licence. Fewer colours per sprite = cleaner read.
- **One consistent light direction — TOP-LEFT.** When choosing among candidates,
  reject any whose shading contradicts a single top-left key light (pillow-shading /
  outline-following shading is the beginner tell). Our hero/enemies already read
  top-lit; enforce it on new art.
- **Hue-shift, don't just darken:** shadows lean cooler, highlights lean warmer
  (the single biggest amateur→pro palette lever). Prefer candidates that hue-shift.
- **Timing carries weight (engine note):** animation feel comes from per-frame
  DURATION, not frame count — hold wind-up frames longer, play on 2s. Our engine
  ties run cadence to `walkPhase` (good); a per-frame duration table would let FX/
  future attacks emphasise the action beat (surfaced to the engine loop).

Source: pixel-art authoring best-practice guides (Sprite-AI style-guide/animation/
frame-count references) + cited shipped-game frame precedents. These are *judgment
aids*, not metrics — the fidelity verdict stays the side-by-side look (§7).
