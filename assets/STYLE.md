# Art Direction Contract

> **To generate NEW on-style assets, use [`STYLE-BIBLE.md`](STYLE-BIBLE.md)** — the
> fact-grounded generation contract (canvas/scale rules, palette, silhouette rules,
> per-asset dims, animation frame budgets, the pixflux/skeleton recipe, and the
> "add a new asset" checklist). This file is art direction + status/roadmap.

> **Style: CONFIRMED against the landed corpus (2026-07-09, cycle 11).** No longer
> an assumption. Verified by direct multimodal side-by-side (`/tmp/style_match.png`):
> the competitor stills (gunslugs/blazing-chrome/galuga) ground the FIDELITY bar
> and the arcade-contra-1987 Stage-1 frame-grabs ground the nostalgic IDENTITY.
> Our sprites read as in-lineage Contra run-and-gun and clear the competitor
> character bar. `manifest.json → meta.styleConfirmed = true`.

## Style verification vs landed corpus (2026-07-09)
Judged by looking, not metrics (arcade frames = archive.org 1cc longplay grabs,
low-res/blurry → they anchor *feel/cadence*, not pixel-level sprite matching):
- **Hero — in-lineage ✅.** Our commando (red bandana, blue tank/harness, tan
  muscular arms, rifle, red boots, 8-way-aim-ready) is the same run-and-gun soldier
  lineage as the arcade hero, and crisper/higher-fidelity than the blurry grab.
  Era-palette differs (arcade = tan/bare-chest; ours = the iconic NES-era Contra
  look) — a deliberate, canonical choice, not a defect; it clears the Galuga/
  Blazing-Chrome character bar.
- **Enemies / boss / FX / tileset — in-lineage ✅** (grunt+turret palette-distinct,
  Sentinel is a mechanical weak-point boss per arcade §4, warm muzzle/explosion,
  jungle ground tileset).
- **Honest delta (NOT our sprite slice → surfaced to the environment/engine loop):**
  arcade Stage-1 is a **bright DAY jungle with a signature metal bridge over blue
  water**; our build renders a **night jungle**. Both are jungle-Contra and ours is
  a verified-coherent night scene (ASSESS-3 vs the indie bar), but if a closer
  nostalgic-arcade match is wanted, the background/parallax layers could lean
  brighter-green-day + add a bridge-over-water set-piece. Our tileset already
  supports a green-jungle read.

_Prior status (superseded): style was an ASSUMPTION grounded only on the
arcade-1987 teardown TEXT while frame grabs were pending; the frames have now
landed and the assumption is CONFIRMED._

## Engine scale (CONFIRMED against game/ — 2026-07-09)
Verified by reading `game/data/config.js`, `game/src/render.js`, and by rendering
the real game headless:
- **View:** 480×270 logical px (`SIM.VIEW_W/H`), nearest-neighbour, smoothing off.
- **Player hitbox:** 12×20 px. `render.js drawPlayerSprite` scales the sprite to
  `p.h * 1.4 = 28 px` tall, feet-anchored, mirrored by facing.
- **∴ Sprites are authored at NATIVE display resolution (~32 px tall)** so the
  engine blits them at a gentle ~0.9× with uniform, Contra-crisp pixels — NOT
  up-authored on a 64 px canvas and destructively decimated (0.5×) every frame.
  The player idle is currently **20×29 px** (see `meta.spriteNativePx`).
- **Engine interface:** `game/data/assets.js` `ASSET_MANIFEST` — a flat
  `{key: 'assets/<file>.png'}` map; `AssetStore.load` loads one `Image` per key.
  Our per-animation strips + frame rects in `manifest.json` are the pipeline's
  *source-of-truth*; the engine consumes the flat single-image map. The pipeline
  auto-syncs QA-PASS sprites into `game/assets/` (server root) so the two never
  drift.

## Target look
- **Lineage:** classic arcade Contra / Contra III (SNES) run-and-gun.
- **Player:** muscular commando, **bright tan bare arms** (the contrast that makes
  the hero pop at gameplay zoom), blue tank top, red headband, rifle, bold black
  outline, high-contrast saturated palette, clear readable silhouette.
- **View:** side view, characters face/run to the right; engine mirrors for left.
- **Background:** fully transparent (alpha), no matte, no halo.

## Palette
Recorded in `manifest.json` → `meta.palette` (hex, most-frequent first), read from
the produced player art. Families: dark outline `#050302`, blues `#242e60 /
#2b60c7`, tan skin `#fb9e73 / #f89b6f`, reds `#55041c / #ac1536`, rifle browns.
Future assets should be palette-locked to this set via the pipeline's
`color_image` forced-palette option for cross-sprite consistency.

## Pipeline
`assets/pipeline/generate.py` — text→pixel-art via PixelLab
(`/generate-image-pixflux`), background-strip, palette read, strip packing,
`manifest.json` emission, and **auto-sync into `game/assets/`**. Deterministic:
every API result is cached under `assets/pipeline/.cache/` so re-runs cost $0.
The idle prompt + seed are **locked after a native-scale candidate bake-off**
judged by eye in the real engine (see `QA-NOTES.md`).

## Roadmap (per goal: player run/jump/shoot, 1–2 enemies, tileset, FX)
- [x] Player idle base sprite — real, native-scale, LIVE, verified in-engine.
- [x] Player RUN cycle — real 4-beat native cycle via `/animate-with-skeleton`,
  palette-locked; **LIVE in-engine** (drawPlayer plays it off walkPhase), verified
  running in-game (cycle 8). FID-4b resolved.
- [x] Player PRONE/duck frame — real low prone commando (native 28×15, palette-
  locked); **LIVE in-engine** (drawProne blits it), verified (ASSESS-5 addendum).
- [x] Player JUMP/airborne frame — real compact leap (native 25×25, forward-aim,
  palette-locked); **LIVE in-engine** (drawPlayer blits it when airborne). LEAP-1:
  a forward-bound vs the arcade tucked somersault — LOW stylistic note.
- [x] Enemy types — grunt + turret, native 32px, palette-distinct; LIVE.
- [x] 3rd enemy (`flyer`) — copper aerial drone (28×17, palette-distinct, pops on
  night-jungle); **LIVE in-engine** (config `flyer` kind, hitbox 16×14 as specced;
  hovers/strafes; verified in-context, cycle 16).
- [x] 4th enemy (`mortar`) — olive-brass artillery emplacement (native 30×23, squat
  bunker + angled barrel, palette-distinct); **LIVE in-engine** (config `mortar` kind
  20×12, level1 spawn @x=1040, lobs arcing shells; verified by looking, cycle 30).
  Closed a no-placeholder-box gap — the engine had added the kind but it was drawing
  procedurally until this sprite landed.
- [x] Stage boss (Sentinel) — big 64px steel gun-sentinel, cannon aimed left,
  ~2.4× hero scale; **LIVE in-engine** (drawBoss blits it), arcade §4 climax met.
- [x] Boss phase-2 ENRAGED variant — same Sentinel init-anchored, escalated
  (flaring core, scorched hull); **LIVE in-engine** (drawBoss swaps to it on
  enrage, verified ASSESS-11). Two-phase boss spectacle (BOSS-1 → STRETCH).
- [x] Muzzle-flash + explosion FX — explosion (4f) + muzzle (2f) warm strips; LIVE.
  Explosion upgraded to an organic **multi-lobe billow** (post-pack compositing,
  cycle 29) → dim-2 4.0→4.5 (SCORECARD, ASSESS-22).
- [x] Ground/jungle tileset (FID-5) — 16px cap + dirt + derived dirt2, LIVE.
- [x] Weapon pickup pod — Contra golden falcon-pod (native 32×15); LIVE (drawPickup
  blits it). Replaced the placeholder lettered pill.
- [x] 4th enemy — MORTAR emplacement (olive-brass, native 30×23), cycle 30; LIVE,
  palette-distinct, verified by looking → dim-5 now credits 4 non-boss types
  (SCORECARD, ASSESS-21).
- [x] **2nd boss — `chopper` GUNSHIP** (Stage-2): wide gunmetal+red attack helicopter
  (native 76×52, 62×30 fuselage hitbox) + init-anchored `chopper_enraged` phase-2
  (glowing belly ordnance). A MOVING aerial boss, distinct from the fixed Sentinel.
  **LIVE in-engine** (`?level=2`, both phases + enrage swap verified by looking,
  cycle 48). Doubles the boss count (top content-depth gap).
- [x] **Creator #1 bridge-over-water theme tiles** (theme_bridge/water/water_top, 16px,
  night-muted water) — WIRED (drawBridge/drawWater) + LIVE (cycle 45).

**Two-stage build (cycle 49): Stage-2 gameplay verified by looking** — full roster
(grunt/turret/flyer/mortar + chopper boss), floating platforms, ground + theme
bridge/water tiles, night-jungle parallax all render coherently, 0 errors
(`experiments/stage2-regression/`). Sprite deliverable spans 2 stages / 2 bosses,
19 sprites, gate 19/19.

### Remaining fidelity levers — ALL blocked on engine coordination (not unilateral art)
Per the authoritative `reference/SCORECARD.md` (all art dims 4.0–4.5, at/above the
popular-competitor bar; below only the console pinnacle on animation/particle density):
- **Denser run cycle** (dim-1 4.0→5, the top remaining lever): needs the engine to
  change `render.js:31 PLAYER_RUN.frames` 4→N **and** the `render.js:825` frame-select
  (parent-confirmed). My blit-meta gate check (cycle 32) is the tripwire enforcing it.
  Producing a ≥6-frame run also needs 2 `/animate-with-skeleton` calls (3-pose cap).
  → I hold until greenlit; a bumped frame count without the engine following would
  render BROKEN, so I will NOT overwrite the live 4-beat speculatively.
- **5th enemy type** (dim-5 → Huntdown-tier 5–6): needs the ENGINE to add the kind
  (config + behavior + spawn) FIRST — then I produce the sprite (the mortar/flyer
  pattern). A sprite for a non-existent kind would be an orphan (my gate flags it).
- **Bigger/denser explosion scale** (dim-2 4.5→5 stretch): more lobes fit the 28×40
  cell only up to a point; real SCALE needs a larger FX frame = `render.js FX{}` meta
  coordination (blit-meta gate enforces alignment).
- **Weapon HUD icon** (HUD-1): still blocked on a confirmed HUD slot size (QA #9).
- LOW/stylistic: somersault-spin jump (LEAP-1), set-dressing props (needs a decoration
  kind), 2nd-level/biome tileset (needs level 2). All stretch per assessments.

Every asset the GOAL enumerated (player run/jump/shoot-via-muzzle, 2 enemies,
tileset, muzzle/explosion FX) + a stage boss + a weapon pickup is produced, real,
and LIVE; all `no-placeholder-box` targets are real sprite art.

**Sprite set status (cycle 32): COMPLETE + gated.** 14 shipped sprites (idle, run,
jump, prone, grunt, turret, flyer, mortar, boss, boss_enraged, pickup, explosion,
muzzle, tiles) all load + render live, 0 page errors. Contract gate green: 14/14
per-sprite, cross-source consistent, 14/14 draw-reachable, 5/5 spawned enemies have
real sprites (no placeholder), 3/3 multi-frame blit-metas aligned with the engine.
Grounding loop (SCORECARD) grades the art dims 4.0–4.5 (at/above popular-competitor
bar). Further fidelity gains are the engine-coordination-blocked levers listed above.

**Ship-gate standing (2026-07-10, cycle 25 — grounded in the authoritative gate):**
Cross-checked the sprite slice against the build's own pass/fail signal
(`playtest/frames/live/qa-summary.json`, root.D's `run-all.mjs`). **The art slice
contributes ZERO reds to the verdict.** The gate's only reds are
`feel.fpsTelemetryExposed` (non-critical, engine telemetry) and
`creatorApproval.panelExists` (the single CRITICAL — a DOM feedback panel owed by
root.B, NOT sprite art). BOSS-3 (enrage glow matte) no longer appears as a gate red —
consistent with its confirmed render-side fix (PR#86; verified live by looking, QA
cycle 25). So: nothing in the sprite deliverable blocks the build verdict, and the
last open art-touching issue (BOSS-3) is resolved. The build's path to PASS is the
creator-approval panel, which is out of the art slice.

## Competitor-fidelity standing (2026-07-09, cycle 13 — verified by looking)
Grounded the sprite set against the current-popular competitor tiers (the GOAL's
"match or exceed their fidelity" bar), evidence in `reference/frames/*` (see
QA-NOTES cycle 13 for the scorecard):
- **Official modern Contra (Galuga):** hero is Bill-Rizer-lineage, matches. ✅
- **Indie/web (Gunslugs 2):** character + tileset meet/exceed. ✅
- **Pixel pinnacle (Blazing Chrome):** close; below on animation-frame density
  (stretch). 
The one in-slice delta left is the **iconized weapon HUD** (every competitor has
one; ours is text) — blocked on the engine's HUD slot size (QA OPEN ISSUE #9);
icon attempts were marginal at ~16px and were NOT shipped (would regress vs text).

### Mobile-Contra tier added (2026-07-10, cycle 21 — verified by looking)
Grounded against the GOAL's most on-target competitor — **Contra Returns**
(official Konami/TiMi/Garena mobile Contra, Android/iOS), `reference/frames/
contra-returns-mobile/*`. **Verdict by looking: it's a DIFFERENT visual TIER, not a
pixel-art fidelity bar.** Both frames are **HD-3D-rendered** (3D Bill Rizer, 3D
attack helicopter + turret-mechs with HP/shield bars, 3D waterfall-jungle) under a
**heavy F2P touch UI** (virtual d-pad, JUMP/grenade buttons, ammo counters, operator
portraits, mission stars). The official mobile Contra **abandoned pixel art** for
HD-3D + monetization.
- **Implication for our slice:** our pixel-art fidelity bar stays the **pixel-art
  revival tier** (Blazing Chrome / Gunslugs / Metal Slug), where we're at/above
  indie + near pinnacle. No new pixel-art gap — HD-3D is out of our (pixel-art)
  mandate.
- **Design-language match (what matters for "Contra-lineage"):** the mobile game
  shares the same Contra vocabulary our sprites already cover — Bill-lineage hero
  (ours = NES-Bill blue-tank/red-bandana variant), turret-MECH enemies (ours =
  turret + Sentinel boss), grassy-platform jungle (ours = tileset), an aerial
  threat (mobile = helicopter; ours = flyer drone), boss HP bar (✓). So our art
  reads as the same lineage, rendered in the nostalgic pixel tier the GOAL targets.
- **Surfaced (product/direction, above the art slice):** the GOAL says "prefer over
  today's popular web/Android Contra-likes"; the biggest one is HD-3D. Whether to
  match that render tier is a PROJECT-DIRECTION call, not an art-pipeline one — our
  pixel-art bet is the nostalgic differentiator. Flagged as a `need`, not decided.
