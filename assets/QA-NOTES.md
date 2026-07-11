# Sprite QA Notes

Verification is by **direct visual inspection** of the produced PNGs (upscaled
6× nearest-neighbour and viewed), not by pixel-count heuristics. CV metrics
(palette size, opaque-pixel count) are advisory pre-filters only.

## 2026-07-10 — cycle 49 (two-stage build: Stage-2 gameplay art verified by looking; no new need)

Post-chopper-finalize grounding. Gate 19/19 (all 6 spawned kinds across level1+level2 have
real sprites; cross-source + reachability + blit-meta clean); no new asset key / dynamic
route / spawned kind → Stage-2 introduced no new art need (the chopper was the only one,
done cycle 48). **Verified Stage-2 GAMEPLAY by looking** (`?level=2` @x900,
`experiments/stage2-regression/stage2-gameplay.png`, 0 page errors): the full enemy roster
(2 flyers + mortar + turret + grunts), floating grass-cap platforms, dirt ground, theme
bridge/water tiles (left edge), night-jungle parallax + moon all render coherently — a
cohesive Contra stage. (Player white = i-frame blink, expected.) The sprite deliverable now
spans **2 stages / 2 bosses / 19 sprites**, all wired + live + gated. STYLE.md roadmap
updated. No in-slice art gap remains; the fidelity levers (denser run, bigger explosion)
stay engine-blocked with ready art.

## 2026-07-10 — cycle 48 (Stage-2 2nd boss `chopper` FINALIZED + WIRED + LIVE) ✅✅

Engine applied its patches (config ENEMIES.chopper isBoss 62×30 hitbox, enemy.js sweep/
fire branch, render.js:568 dedicated draw with chopper_enraged swap, level2 spawn @x2340,
`?level=2` hook). render.js blits `assets.get('chopper')` but assets.js had NO chopper key
→ it was rendering PROCEDURALLY (placeholder) in level2. **FINALIZED my art:** regenerated
both phases from the cached `CHOPPER_*`/`CHOPPER_ENRAGED_*` recipe ($0), packed
(chopper 76×52, chopper_enraged 78×51), synced to game/assets, added `manifest.sprites.
chopper`(+enraged) with hitboxPx 62×30, and keyed `chopper`+`chopper_enraged` in
`game/data/assets.js`.

**Gate fix (report-don't-work-around):** the per-frame OVERSIZE cap flagged 76×52 (>64).
That cap is the STANDARD tier; the chopper is a deliberately WIDE boss set-piece (native
80, confirmed by SPEC+WIRE+config). Fixed the CHECK to be boss-class-aware (boss/chopper
keys → ≤80, else ≤64) — did NOT shrink the confirmed-spec art. Gate GREEN 19/19.

**Verified LIVE by looking** (`?level=2`, drove to the chopper @x2340; captures
`experiments/chopper-boss/LIVE-base.png` + `LIVE-enraged.png`, 0 page errors):
- BASE: renders as MY wide gunmetal gunship (cockpit, rotor, tail-boom, skids, glowing
  nose cannon) hovering over the night-jungle — NOT the procedural placeholder. ✅
- ENRAGED (forced hp→30%): swaps to `chopper_enraged` — same silhouette with glowing
  red belly ordnance/engine pods. The enrage form-change works live. ✅

**The Stage-2 2nd boss is COMPLETE** (both phases, wired, live). Doubles the boss count
(the highest-leverage content-depth gap per CONTENT-GAP-REPORT). Also extended my
no-placeholder gate to scan ALL `level*.js` (was level1-only — the gap that let the
chopper render as a placeholder without my check flagging it): now 6/6 spawned kinds
have real sprites. Feel/balance (BAL-1) is human-playtest-gated, not my slice.

## 2026-07-10 — cycle 47 (chopper hitbox CONFIRMED 62×30 — synced source-of-truth; still engine-blocked)

`content/stage2/WIRE.md` landed (paste-ready engine patches, mirroring my READY-TO-WIRE
pattern). Two facts: (1) the engine has NOT applied the patches yet (no `chopper` in
config/enemy/world) → I still correctly hold the art finalize (adding the key now would
fail draw-reachability); gate 17/17. (2) **The chopper SIM hitbox is now CONFIRMED = 62×30**
(WIRE.md Patch 1: the FUSELAGE of my 76×52 art, rotor + tail-boom excluded from
collision) — replacing my SPEC start-box guess of 64×34.

**Grounded correctness update:** set `CHOPPER_HITBOX = {62,30}` in generate.py + synced
the chopper README + READY-TO-WIRE to the confirmed number, so my ~10-min finalize writes
`manifest.sprites.chopper.hitboxPx` correctly (no re-guess). My 76×52 art is compatible —
the fuselage is the bulk, rotor/boom overhang, which is exactly the 62×30-fuselage design
the WIRE.md author measured against my candidate. No art change; frame stays 76×52.
Finalize triggers when root.B applies Patches 1–3 (config kind + behavior + isBoss win).

## 2026-07-10 — cycle 46 (chopper finalize handoff — accelerate the one open deliverable)

Verified (grep + gate): engine still has NO `chopper` kind (config/enemy/assets/render
clean); gate 17/17 green; no new spawned kind or asset need. Creator #1 theme confirmed
DONE by parent. So the sole open in-slice deliverable is the Stage-2 `chopper` boss,
blocked on the engine. Both art phases are produced + reproducible; holding polish until
the engine sets the hitbox (SPEC: confirm dims vs real art) — re-generating the strong
seed-81 gunship now would risk a worse result for an unconfirmed frame.

**Highest-value move: the same handoff that got my theme tiles wired last cycle.** Updated
`READY-TO-WIRE.md` — marked creator #1 theme ✅ DONE, and made the chopper the ⭐ top
section with the exact engine steps (config `ENEMIES.chopper isBoss` + assets.js key +
enemy.js sweep branch + world.js `isBoss` win-generalization + render drawBoss routing +
level2 spawn) and my ~10-min FINALIZE (regen from cached `CHOPPER_*` → pack → sync →
manifest → gate → live-look). Copy-paste, so the 2nd boss closes fast when root.B picks
it up. Gate 17/17.

## 2026-07-10 — cycle 45 (creator #1 theme tiles WIRED + FINALIZED + verified LIVE by looking) ✅

The engine WIRED my theme tiles: added `theme_bridge`/`theme_water`/`theme_water_top`
keys to `game/data/assets.js` + shipped the PNGs, drawn by `render.js` drawBridge (:320)
+ drawWater (:213/214). **FACT (byte-compare): the shipped tiles are my exact candidates
— and the engine picked the NIGHT-muted water variant I produced cycle 42 to de-risk the
neon-cyan concern.** This left my `manifest.json` out of sync → gate went RED (3
cross-source mismatches: engine-referenced files not in manifest).

**Finalized (my source-of-truth):** added `sprites.theme_bridge/theme_water/
theme_water_top` to manifest.json, placed the tiles in `assets/sprites/` (byte-synced),
and wired a reproducible `THEME_TILE_SPECS` + `night_tint()` + run() block into
generate.py — **verified the recipe reproduces all 3 shipped tiles PIXEL-IDENTICAL**.
Gate back to GREEN: **17/17 sprites, 0 violations** (was 14 → +3 theme tiles),
cross-source 17=17=17, all reachable (theme_* are literal `assets.get` draws), tiles
opaque + synced.

**Verified LIVE by looking** (`experiments/environment-theme/LIVE-bridge-over-water.png`,
drove to the level1 bridge @x1700, 0 page errors): the bridge-over-water crossing renders
with MY tiles — grey metal girder deck + trusses spanning a muted blue-teal water band
(my night variant), a mid-span WATER GAP fall-hazard, and a rope CATWALK high route above
(multi-height). Reads as the iconic Contra bridge-over-water. **Creator #1's stage-theme
ask is now visually addressed with real art.** (Final closure still = a fresh creator
APPROVE of the live build — not self-cert; but the art side of #1 is DONE + wired + live.)

## 2026-07-10 — cycle 44 (Stage-2 boss: `chopper_enraged` phase-2 produced — 2nd-boss art set COMPLETE)

Engine hasn't added `ENEMIES.chopper` yet (config/enemy/assets/render all clean; level2
still unwired in main/world) → base chopper stays a candidate. Proportional next step:
completed the assigned 2nd-boss art by producing the SPEC's optional-but-named phase-2
`chopper_enraged`, so the whole 2nd boss is ready to wire at once (as boss+boss_enraged did).

**Produced** via `CHOPPER_ENRAGED_PROMPT`/seed 91, INIT-ANCHORED to the base chopper
(`init_strength=180`, the proven boss_enraged method); $0.02. **Judged by looking**
(`experiments/chopper-boss/base-vs-enraged.png`): same gunship silhouette (rotor/cockpit/
tail-boom held by the anchor) escalated with glowing red-orange belly ordnance/engine pods
+ scorched hull — a clean, distinct phase-2 form-change, unmistakably the same chopper.
Matches the Sentinel's two-phase spectacle.

**Both phases held as candidates** (engine kind absent → shipping keys would fail my
reachability gate). Recipes (`CHOPPER_*` + `CHOPPER_ENRAGED_*`) in generate.py for
deterministic finalize. 2nd-boss ART is now COMPLETE + ready; wiring is the engine's
(add ENEMIES.chopper isBoss + spawn + generalize boss-win to isBoss + route drawEnemy
kind 'chopper'→drawBoss with the enraged swap). Gate 14/14.

## 2026-07-10 — cycle 43 (Stage-2 2nd boss: `chopper` GUNSHIP produced — confirmed in-slice art need)

Two parent corrections adopted: (1) creator #1 bridge-over-water is now drawn ENGINE-side
PROCEDURALLY (render.js drawWater/drawBridge; the engine does NOT sample my water_*.png)
— so my water-variant work is moot for stage-1; my `theme.png` tiles may still be
consumed by Stage-2 per its SPEC, TBD. (2) A `content/stage2/` build landed — the
long-flagged "2nd level" now exists.

**Acted on the real new in-slice need:** `content/stage2/SPEC.md` §4/§6 explicitly
assigns root.C to draw a **2nd boss — the `chopper` GUNSHIP** (a wide MOVING aerial boss,
distinct from the fixed Sentinel). Produced it (PixelLab, `CHOPPER_PROMPT`/seed 81, added
to generate.py; $0.02) and **judged by looking** (raw + night-sky, `experiments/
chopper-boss/`): reads unmistakably as a wide gunmetal+red attack-helicopter gunship,
faces left, rotor+tail-boom+cockpit+skids+nose-cannon — palette-matches the corpus,
totally distinct silhouette from the tall wall-mech. Trimmed 76×52 (SPEC start box was
~80×44; root.B confirms hitbox vs real art per the SPEC).

**Candidate only (report-don't-work-around):** the engine has no `ENEMIES.chopper` and
doesn't spawn it (only the unwired level2 data references it) → shipping the key would
fail my draw-reachability gate. Held as a candidate; recipe (`CHOPPER_*` consts) in
generate.py for deterministic finalize. Finalize (pack→sync→manifest→assets.js) when the
engine adds the chopper kind — the produce→engine-wires pattern (as boss/mortar/flyer).
Gate 14/14 green. This is the highest-leverage content gap (2nd stage/2nd boss) per
`content/CONTENT-GAP-REPORT.md`.

## 2026-07-10 — cycle 42 (theme tiles: critical by-looking re-judge at engine scale + night-water option)

Engine still hasn't wired #1 (TILES = cap/dirt/dirt2, no bridge/water ref in
level1/render). My tiles are confirmed ready; the creator will judge them LIVE. So I
critically RE-JUDGED them by looking (`experiments/environment-theme/
setpiece-engine-scale.png` — bridge deck elevated over water surface+body on a night
sky, ~engine 2× scale), not assuming "good enough":

**Verdict:** the set-piece READS as bridge-over-water — theme legible (the creator's
core #1 ask). Bridge deck reads as a riveted metal girder span; water reads as a pool.
**One honest in-context risk:** the water is quite SATURATED/neon cyan — could read too
bright against the night-jungle palette. I did NOT over-tune in isolation (parent
deferred final quality to the live review + I can't replicate the real bg/lighting), but
de-risked it: produced a **muted night-water variant** (`water_night16.png` /
`water_top_night16.png`; desaturated 0.6 + darkened 0.72) so whoever wires it can pick
the read that works in-context (`water-bright-vs-night.png`). Both read as water; the
night variant blends better into a dark scene. Recorded both options in READY-TO-WIRE.
Gate 14/14; still candidates (engine unwired).

## 2026-07-10 — cycle 41 (creator #1 is the LAST defect — drive engine wiring friction to ~0)

`feedback/RE-APPROVAL-STATUS.md` (new): item #1 (bridge-over-water theme) is the SOLE
unwired creator defect gating re-APPROVE — "Art ready, NOT wired, pending ENGINE tile
slot"; #2/#3/#4 engine-fixed/in-build. Confirmed by grep: engine still has no
bridge/water ref (TILES = cap/dirt/dirt2 only; none in level1/render). So the ball is
engine-side; my art can't ship (unreachable tiles fail my own gate — correct guard).

**Highest-value move I CAN make: minimize the engine's wiring friction so #1 closes
fast.** Packed my 3 theme tiles into one concrete artifact
`experiments/environment-theme/theme.png` (48×16, opaque, tiles.png convention:
bridge x0 / water_top x16 / water x32), and wrote a **copy-paste wire** in
READY-TO-WIRE.md (⭐ top section): two non-breaking engine integration options
(separate `theme` key vs append-to-tiles-sheet) with the exact assets.js/manifest/rect
changes, so the engine picks one and it's minutes of work. Multi-height + placement
remain engine-only. Gate 14/14. Closure still = engine set-piece live + creator APPROVE.

## 2026-07-10 — cycle 40 (creator #2 firing-origin: my hero sprite verified CLEAN — no art fix owed)

Followed up my cycle-38 queued check on creator #2 ("hero fires from a waist secondary
gun, not the hand rifle"). Parent confirmed the fix is ENGINE-side (muzzle/projectile
spawn, PR#193/dcf4f85). Verified my slice's contribution by looking + facts:

- **Sprite (by looking, `player_idle.png` 12×):** the commando holds the rifle in BOTH
  hands, foregrip at chest, muzzle angled UP-RIGHT at ~shoulder/head height. It is NOT
  a waist gun — the art is correct and aim-neutral as specced (engine overlays the
  8-way aim gun on top).
- **Live fire (FACT, current build):** fired right, `bullets[0]` spawned at y≈183 with
  the hero hitbox py=190 (h20) → the feet-anchored sprite top is ≈182, so the bullet
  originates at the sprite's GUN-MUZZLE height (upper/shoulder), NOT the waist (~200+).
  Consistent with the PR#193 engine spawn fix; firing now reads from the hand-held gun.
  0 page errors.

**Conclusion: creator #2 has NO art defect — my hero sprite is correct; the spawn-point
fix was correctly engine-side.** No re-author (report-don't-work-around: verified, not
needlessly changed). Same reasoning applies to #3 turret barrel (engine drawTurretBarrel
+ spawn origin own the aim; the turret sprite's barrel is a static neutral mount) — I'll
spot-verify the turret sprite next if the creator re-flags it. Final closure of #2/#3
still = a fresh creator APPROVE (not my self-cert). Gate 14/14.

## 2026-07-10 — cycle 39 (creator #1 theme: refined bridge-over-water to a coherent 3-tile set)

Parent CONFIRMED creator #1 (stage theme) is a JOINT, ACTIVE need (engine is adding the
bridge-over-water set-piece + multi-height + tile slot; #2/#3 firing origins already
fixed engine-side PR#193; #4 boss movement is engine). So the theme art is a CONFIRMED
creator-driven deliverable now — invested proportionally to make it good.

**Refined the tile set (by looking, stacked set-piece mock
`experiments/environment-theme/bridge-over-water-scene-mock.png` vs the arcade
`cliff-bridge` frame):**
- `bridge16.png` v2 — now an elevated metal GIRDER/TRUSS span (deck plate + visible
  cross-beam below) → reads as a bridge, fixing v1's "flat metal ground" read.
- `water_top16.png` — water surface edge (bright cyan foam ripple line).
- `water16.png` — deep blue water body.
Stacked, they read as the iconic bridge-over-water set-piece; coherent + in-lineage.

**Still candidates (NOT in manifest/assets.js):** the engine's bridge/water tile slot
(dims, keys, water=bg-vs-solid) isn't defined yet — shipping unreferenced tiles would
fail the gate's reverse/orphan checks. On the engine slot landing I finalize + wire +
sync (gate/blit-meta then verify). Gate 14/14 green this cycle. Creator #1 art side is
now READY; closure still requires the engine set-piece + a fresh creator APPROVE.

## 2026-07-10 — cycle 38 (REAL CREATOR REJECT triage + started theme fix; overrides AI-vision self-score)

`CREATOR_FEEDBACK.md` landed — a REAL human played the build and REJECTED (3/5) for
wider release. **This is ground truth and overrides my AI-vision fidelity self-score**
(the human caught firing-origin + boss-movement defects the frame-comparison missed).
Triage of the 4 notes, mapped to ownership + my art response:

1. **Environment depth / level theme (jungle BRIDGE over WATER + multi-height)** —
   JOINT art+engine. **← my clearest in-slice item; STARTED this cycle:** produced
   bridge + water 16px tile candidates grounded on the arcade `cliff-bridge` frame,
   judged by looking (`experiments/environment-theme/`). Not shipped — engine must add
   the bridge/water tile slot + multi-height + bridge-over-water level section first
   (else the tiles are unreachable → gate fail). Wiring surfaced in that README. My
   PRIOR deferral of the bridge/water motif as "not my slice" (STYLE.md cycle 11) is
   NOW OVERRIDDEN by the creator — it IS wanted; treating it as a real need.
2. **Hero firing origin (looks like a waist secondary gun, not the hand rifle)** —
   primarily ENGINE (procedural muzzle/projectile spawn point, render.js drawGun).
   MY part: verify the hero sprite holds the rifle at hand height so a hand-anchored
   muzzle would read right — TODO next cycle (fact-check the idle/run gun position).
3. **Turret fires from an implicit turret, not the drawn barrel** — primarily ENGINE
   (drawTurretBarrel dynamic aim vs the sprite barrel + firing origin). MY part: confirm
   the turret sprite's barrel position; possibly re-align. TODO next cycle.
4. **Boss has no movement** — pure ENGINE (behavior); not art. Flagged to root.B.

**GATE STANCE (report-don't-work-around):** these are REAL open defects until fixed AND
re-verified by looking, AND re-APPROVED by the creator via the panel. Do NOT self-certify
from frame comparison. The sprite deliverable being "gate 14/14" is MECHANICAL only — the
creator's human verdict is the fidelity truth, and it says the STAGE THEME + firing reads
are not there yet. dim-1/environment are NOT actually "done" per the human.

## 2026-07-09 — cycle 0 (pipeline stand-up)

| Asset | Source | Verdict | Notes |
|-------|--------|---------|-------|
| `sprites/player_idle.png` (64→51×56) | pixflux, seed 101 | **PASS** | Muscular commando, blue tank + red bandana + rifle, bold outline, clean transparent bg, high-contrast palette. Reads at Contra benchmark fidelity. |
| `sprites/player_run.png` (4× 64×63) | animate-with-text, seed 101 | **FAIL** | See OPEN ISSUES #1. Disabled in manifest; kept as evidence. |

Spend this cycle: metered `generations` quota (USD balance unchanged at $10.00);
2 API calls (1 pixflux, 1 animate-with-text), both cached for $0 re-runs.

## 2026-07-09 — cycle 1 (native-scale correction, verified in real engine)

Parent corrected three assumptions: engine consumes `game/data/assets.js` (flat
map, not our strip manifest); `reference/` corpus HAS landed; player is **12×20
px in a 480×270 view** (my 64px canvas / ~56px sprite was ~3× oversized).

**What I did:** re-authored the player idle at the engine's **native display
scale** (`gen_pixflux` at 32×32 → trimmed **20×29**) so `render.js` blits it near
1:1 with uniform pixels instead of destructively decimating a 56px sprite to 28px
(scale 0.5). Added auto-sync into `game/assets/`. Ran a 2-candidate native
bake-off and locked the higher-contrast prompt + seed 7.

**Verification — actually ran the game headless** (Chrome + `?headless=1`,
showcase timeline), cropped the player at gameplay zoom, and judged by eye:

| Asset | Source | Verdict | Notes |
|-------|--------|---------|-------|
| `sprites/player_idle.png` (32→20×29) | pixflux, seed 7 | **PASS** | In-engine render is crisp (uniform pixels) AND readable: red bandana, bright tan arm pops, blue tank, rifle, red boots — unmistakable Contra commando. Fixes the pre-fix "muddy decimation" look. |

Before/after evidence captured; the pre-fix 56→28 decimation showed broken
outlines and irregular pixel sizes, the native 20×29 shows uniform Contra-crisp
pixels. Style is now grounded on the `reference/` teardown (frames still pending),
not memory. Spend: metered `generations` (USD balance unchanged at $10.00);
3 pixflux calls (2 candidates + 1 locked), all cached for $0 re-runs.

## 2026-07-09 — cycle 2 (enemy sprites: grunt + turret)

Parent CONFIRMED enemy hitbox sizes exact (grunt 14×18, turret 18×16). Produced
both enemy types the GOAL requires, at 32px native scale (consistent with the
player), palette-distinct from the hero.

**Verification — judged by looking** (`/tmp/enemy_sheet.png`: raw native + engine
hitbox-size + player-analogous 1.4× hitbox, all on the game bg, side by side with
the hero):

| Asset | Source | Native | Verdict | Notes |
|-------|--------|--------|---------|-------|
| `sprites/grunt.png` | pixflux, seed 3 | 26×26 | **PASS** | Crimson enemy soldier, helmet, rifle aimed left toward the hero, charging pose. Reads at hitbox size; clearly beats the procedural block. |
| `sprites/turret.png` | pixflux, seed 5 | 26×27 | **PASS** | Purple armored sentry dome + cannon barrel on a bolted base. Menacing, reads at hitbox size. |

**Silhouette invariant (teardown §6, non-negotiable):** hero = blue tank / tan
arms / red bandana; grunt = crimson; turret = purple. All three instantly
distinguishable — silhouettes do NOT merge. ✓

**Loads in the REAL engine:** headless bench reports
`spritesLoaded: ["player_idle","turret","grunt"]`, 0 page errors. Valid PNGs,
correct format. Spend: metered `generations` (USD balance unchanged at $10.00);
2 pixflux calls, cached for $0 re-runs.

## 2026-07-09 — cycle 3 (weapon-juice FX + enemy in-context re-verify)

**Enemies now LIVE (engine wired them).** Re-verified by **looking** at a real
gameplay capture (`?headless=1`, `/tmp/grunt_ctx.png`): the crimson grunt renders
in-context as a helmeted soldier aiming its rifle *left toward the player* (mirror
correct), feet planted, clearly distinct from the blue/tan hero. In-engine render
matches the last-cycle art judgment. PASS. (OPEN ISSUE #2 confirmed resolved.)

**Weapon-juice FX (competitor visual-bar §2/§4 — rated "very high", the cheapest
lever to close perceived fidelity).** Produced multi-frame warm-palette strips:

| Asset | Source | Frames | Verdict | Notes |
|-------|--------|--------|---------|-------|
| `sprites/explosion.png` | pixflux, seed 11+ | 4 (28×32) | **PASS (rough)** | spark → fireball → flame+smoke → smoke. Reads as a real explosion; big upgrade over plain red death-particles. Caveats logged in OPEN ISSUE #3. |
| `sprites/muzzle.png` v1 | pixflux, seed 13+ | 2 | **FAIL** | Prompt "…at a gun barrel" made pixflux draw whole GUNS, not an isolated flash. Unusable as an overlay. Fixed by re-prompt. |
| `sprites/muzzle.png` v2 | pixflux, seed 23+ | 2 (22×25) | **PASS (rough)** | Re-prompted "isolated flash, no gun, horizontal" → clean warm flame + star-burst flashes, no barrel. |

**Loads in the REAL engine:** headless bench
`spritesLoaded: ["grunt","explosion","player_idle","turret","muzzle"]`, 0 page
errors. Keys added to `game/data/assets.js`. Spend: metered `generations` (USD
balance unchanged at $10.00); 6 pixflux calls (4 explosion + 2 muzzle v2), all
cached for $0 re-runs (muzzle v1 cache orphaned/pruned).

---

## 2026-07-09 — cycle 5 (FX verified LIVE + ground tileset for FID-5)

**FX regression check (parent-flagged fh mismatch) — NO regression, verified by
looking.** Parent worried `drawFxCell` samples a fixed `fh=32` cell while my
registered explosion frames are 40px tall. **FACT:** current `render.js FX.explosion
= {fw:28, fh:40, frames:4}` — the engine already updated fh 32→40 to match my
strip; `muzzle = {fw:22,fh:25,frames:2}` also matches. Ran the game headless,
captured a live enemy-death explosion (`/tmp/explosion_live.png`): white-hot core,
warm yellow-red flames (no pink), additive glow, centred on the death point — reads
as a proper Contra blast. **FX is wired, live, and correct.** (OPEN ISSUE #3 →
RESOLVED below.)

**Ground tileset (FID-5, the #1 fidelity gap — `environment-tileset-bar.md`).**
Produced a 16px jungle ground tileset: `cap` (grass surface, highlight + dark
under-lip) + `dirt` + `dirt2` (cohesive dark pebbly/speckled fills, ≥3 tones).
Generated 32px native (opaque, no bg-strip), nearest-downscaled to 16px, packed
into `sprites/tiles.png` (48×16) with per-tile role metadata.

**Verified by looking** — assembled a ground band (cap row + randomised fills) and
compared **side-by-side to `reference/frames/gunslugs-2/shot-00.jpg`** (the indie/web
ground bar): our cap↔their tan cap and our dirt fill↔their pebbly dirt both **meet
the bar** (cap+textured fill, ≥3 tones, seams hidden by noise, 2 variants for the
anti-loop invariant). First `rock` variant was too light (polka-dot patches, broke
material-coherence invariant #5) → replaced with a dark low-contrast `dirt2`.
Loads in the real engine (`spritesLoaded` includes `tiles`), 0 page errors.

**Honest residual:** `dirt2` has one prominent light clod (minor; usable). Tileset
is NOT yet blitted — engine wiring pending (OPEN ISSUE #4).

---

## 2026-07-09 — cycle 6 (tileset refinement per ASSESS-3; tiles now LIVE)

Tileset was WIRED by the engine (drawGround/drawPlatform blit `assets.get('tiles')`,
`TILES{cap:x0,dirt:x16,dirt2:x32}`) and FID-5 downgraded MEDIUM-HIGH→LOW-MEDIUM.
`assessments/2026-07-09c` verified by looking and left 3 grounded refinements; I
captured the LIVE ground and confirmed each by eye, then fixed all three
(deterministic post-process, $0 — cap+dirt reused from cache):

1. **Repeating clod motif (worst, found by looking at the live ground):** the old
   pixflux `dirt2` was one big light CLOD → checkerboarded with `dirt` it read as a
   repeating "face" pattern. **Fix:** `dirt2` is now DERIVED from `dirt`
   (`ImageChops.offset(7,5)` + re-stipple) — same material/tone, different pebble
   arrangement → variation with no visible repeat. Motif eliminated.
2. **Cap read as a flat line (ASSESS-3 #1).** `cap_bevel`: bright highlight on the
   top grass row + a 2px dark under-lip band at the bottom → reads as a lit surface
   block with depth, not a green line.
3. **Sparse/low-contrast dirt (ASSESS-3 #2).** `enhance_dirt`: contrast-stretch +
   denser deterministic stipple (dark pebbles + mid earth clumps + warm mineral
   flecks), border-safe so tiles still repeat.

**Verified by looking** (`/tmp/ground_ba.png` before/after live-ground zoom +
full-frame `/tmp/ground_after.png`): the clod motif is gone, dirt reads as dense
organic earth with mineral speckle (matches `gunslugs-2/shot-00.jpg` fill density),
cap has a defined surface edge. Loads in-engine (`spritesMissing=[player_run]`
only), 0 page errors.

---

## 2026-07-09 — cycle 7 (real player RUN cycle via /animate-with-skeleton — FID-4b)

`player_run` had been disabled since cycle 0 (OPEN ISSUE #1: `/animate-with-text`
gave motion-blur + frame drift), leaving the hero a static sliding idle — the top
CHARACTER gap per ASSESS-3. Fixed properly this cycle with the right tool:

- **Method:** `/estimate-skeleton` on the 32px idle → author 3 run-gait pose
  skeletons (two wide contact strides + one upright passing frame, normalised
  coords, arms kept forward for run-and-gun) → `/animate-with-skeleton` with
  `reference_image`=idle and `color_image`=idle (**forces the palette**, so the
  commando is identical frame-to-frame). Endpoint takes exactly 3 poses; packed
  into a 4-beat loop `[contactL, pass, contactR, pass]`.
- **Result:** native 32px, `player_run.png` = 88×31 (4 frames of 22×31), fps 10,
  loop. A punchier v2 gait (wider stride) was picked over a first moderate pass.

**Verified by looking** (`/tmp/run2_sheet.png` frames + `/tmp/run_display.png` at
the engine's 28px display scale): all frames are the SAME commando (red bandana,
blue tank, tan arms, rifle forward, red boots) — **no motion-blur, no character
drift, no scale jitter** (the exact failures of the old attempt), legs clearly
alternating into a readable energetic run. Loads in-engine: `spritesMissing: []`
(all 7 assets now real + loaded), 0 page errors.

**Engine wiring pending (surfaced as a need):** `render.js drawPlayer` still blits
`player_idle` for every state; it must select `player_run` frames by `walkPhase`
when the player is grounded + moving. Same produce→engine-wires pattern as
enemies/FX/tiles. Until then the run cycle loads but isn't shown in motion.

Spend: ~$0.01 (estimate-skeleton + 2 animate calls; v2 cached for $0 re-runs).

---

## 2026-07-09 — cycle 8 (run cycle verified LIVE; prone/duck frame for the boss)

**Run cycle now WIRED + verified LIVE (FID-4b RESOLVED).** The engine added
`PLAYER_RUN = {fw:22,fh:31,frames:4}` (exactly my strip) and `drawPlayer` plays it
off `walkPhase` when grounded + moving. Captured the running player in-engine
across consecutive frames (`/tmp/player_run_live.png`): the commando cycles through
clean stride poses, firing, feet planted, correctly mirrored — **no blur/drift/
clip**, frame slicing correct. My biggest asset is live and reads as a real Contra
run-and-gun. FID-4b closed.

**Prone/duck frame produced (gameplay-critical).** The Stage-1 SENTINEL boss fires
chest-height cannon volleys the player must go PRONE to duck (`config.js`
proneH=11; the in-game help says "hold ↓ to duck its cannon fire"), and
`render.js drawProne` is a procedural placeholder. Produced a real low prone
commando (pixflux, palette-locked to the idle → same character): `player_prone.png`
28×15 native, lying propped on tan arms, red bandana, rifle aimed right — a low
flat silhouette that ducks under chest-height fire. Picked candidate A (flat prone)
over a too-tall kneel by looking (`/tmp/prone_cands.png`). Loads in-engine
(`spritesMissing: []`, all 8 assets), 0 page errors. Spend: ~$0.03 (2 prone
candidates; chosen one cached for $0).

---

## 2026-07-09 — cycle 9 (Stage-1 SENTINEL boss sprite)

The stage climaxes on a fixed **Sentinel boss** (config `boss` 46×52, fires
left-aimed chest-height cannon volleys; arcade §4 "a fixed boss is the minimum
that reads as Contra"; competitor bar grades "boss screen composition"), but
`render.js drawBoss` was an explicit procedural placeholder ("no boss art authored
yet"). Produced a real boss sprite.

- **Method:** pixflux at 64px native (≈ the 52px hitbox display size → crisp).
  Two candidates; **picked A by looking** (`/tmp/boss_cands.png`) — a steel
  gun-sentinel with a LEFT-aimed cannon barrel + glowing red core eye — over a
  twin-fist brawler mech (B) whose weapon read was weaker and didn't match the
  cannon-volley behaviour.
- **Result:** `boss.png` 57×54, background-removed, distinct steel+red palette
  (not the blue hero / red grunt / purple turret — no silhouette merge).
- **Verified by looking** at display scale beside the 28px hero (`/tmp/boss_scale.png`):
  the boss is ~2.4× the hero's height — reads as a genuine menacing stage boss,
  cannon aimed left toward the incoming player. Loads in-engine
  (`spritesMissing: []`, all 9 assets), 0 page errors.

Spend: ~$0.02 (2 boss candidates; chosen one cached for $0 re-runs).

---

## 2026-07-09 — cycle 10 (player JUMP/airborne frame; prone+boss confirmed wired)

`drawPlayer` blits the standing `idle` sprite whenever the player is airborne
(FACT: render.js:594 falls through to idle when not grounded, not prone, not
grounded+moving) — a static-in-air read during the constant jumping of a
run-and-gun, and the arcade §2 somersault is a signature silhouette. Produced a
real airborne leap frame.

- **Method:** pixflux 32px native, palette-locked to the idle (same commando). Two
  candidates; **picked A by looking** (`/tmp/jump_cands.png` + `/tmp/jump_display.png`
  at 28px) — a compact airborne leap that aims the rifle forward (jump-and-gun) —
  over an extended lunge that read run-like.
- **Result:** `player_jump.png` 25×25, palette-consistent, reads as airborne at
  display scale. Loads in-engine (`spritesMissing: []`, all 10 assets), 0 errors.
- **Honest gap:** pixflux would not curl a true tucked-ball somersault; this is a
  single leap pose, not a multi-frame spinning somersault (optional polish, same
  posture the parent took on the 4-beat run vs the ≥6 bar).

**Also confirmed this cycle (facts from render.js):** `drawProne` now blits
`assets.get('player_prone')` (569–576) and `drawBoss` blits `assets.get('boss')`
(324/371) — my prone + boss sprites are WIRED and LIVE. OPEN ISSUES #5 and #6
RESOLVED (below).

Spend: ~$0.02 (2 jump candidates; chosen one cached for $0).

## 2026-07-09 — cycle 11 (STYLE CONFIRMED vs the now-landed arcade corpus)

Since cycle 0 the style has been an ASSUMPTION (`styleConfirmed:false`) grounded
only on the arcade-1987 teardown TEXT, because the arcade frame-grabs were pending.
This cycle `reference/frames/arcade-contra-1987/stage1/` **landed** (4 real Stage-1
grabs from an archive.org 1cc longplay). Closed the mandate's "declare the
assumption until confirmed" loop by **looking** (`/tmp/style_match.png` — my hero +
in-game scene beside the arcade hero + arcade jungle; no spend, no generation).

**Verdict — style CONFIRMED in-lineage.** Hero/enemies/boss/FX/tileset are the same
Contra run-and-gun lineage as the arcade anchor and clear the competitor character/
fidelity bar (gunslugs verified earlier). The arcade grabs are blurry longplay
frames (feel/cadence anchor per their `capture.json` role) — sufficient to confirm
IDENTITY, not for pixel-level matching. `manifest.meta.styleConfirmed` → true;
STYLE.md updated with the full verification.

**Honest deltas logged (observations, not sprite defects):** (1) era palette —
arcade hero is tan/bare-chest, ours is the iconic NES-era blue-tank/red-bandana
(deliberate, clears the modern bar); (2) time-of-day — arcade Stage-1 is a bright
DAY jungle with a signature metal bridge over blue water, ours is a coherent NIGHT
jungle. #2 is the environment/engine loop's art-direction (not this sprite slice) —
surfaced as a `need` in case a closer nostalgic-arcade environment is wanted.

No new art produced or changed this cycle — this was a grounding/verification pass
that retired the longest-standing assumption in the art work with real evidence.

---

## 2026-07-09 — cycle 12 (weapon-pickup falcon pod — kill the last placeholder box)

`render.js drawPickup` was an explicit placeholder — a blinking gold PILL + the
weapon LETTER (comment literally says "Contra falcon icon, placeholder"). The
mandate forbids placeholder boxes, and the flying weapon pod is an iconic Contra
nostalgia element. The player jump also got WIRED this cycle (render.js:609
`!p.grounded → player_jump`) — OPEN ISSUE #7 RESOLVED.

- **Produced:** a real Contra **falcon weapon-pod** — golden winged pod with a dark
  central emblem window (pixflux, native 32×15). Two candidates; **picked the
  winged falcon by looking** (`/tmp/pickup_cands.png`) over a rounder gem-pod, for
  the iconic Contra-falcon read. The dark center is sized to hold the engine's
  per-weapon letter overlay (S/M/L/R/F).
- **Verified by looking** at the engine display size (scale-to-fit 14×12 + the
  cyan letter overlaid, `/tmp/pickup_ingame.png`): reads as a winged gold power-up
  with a legible letter on the dark center — a real pickup, not a lettered box.
  Loads in-engine (`spritesMissing: []`, all 11 assets), 0 page errors.

Spend: ~$0.02 (2 pod candidates; chosen one cached for $0).

---

## 2026-07-09 — cycle 13 (competitor-fidelity grounding + honest HUD-icon deferral)

The GOAL's success bar is "players PREFER over today's popular games … match or
exceed THEIR visual fidelity." Pickup got wired (drawPickup blits assets.get('pickup'),
#8 resolved) — all my sprites are live. This cycle I grounded the sprite set against
the **current-popular competitor tiers** by looking at their real frames (not the
arcade nostalgic anchor, which was cycle 11):

**Competitor-fidelity scorecard (judged by looking, evidence in `reference/frames/*`):**
| tier | reference | verdict on OUR sprites |
|------|-----------|------------------------|
| Official modern Contra | `contra-operation-galuga-2024/shot-00` | Our hero is **Bill-Rizer-lineage** (blue harness, muscular, rifle) — matches Galuga's Bill directly. Enemies/boss read on-lineage. ✅ meets identity bar. |
| Indie/web tier | `gunslugs-2/shot-00` | Character + ground tileset **meet/exceed** (verified earlier). ✅ |
| Pixel pinnacle | `blazing-chrome-2019/shot-00` | Hero + FX in the right spirit; pinnacle has more anim frames + denser interior tilework + bigger tracer-glow. Close, below on animation density (stretch). |

**Remaining fidelity deltas (ranked), and whose slice:**
1. **Iconized weapon HUD (HUD-1)** — EVERY competitor (Galuga falcon-letter S/M/F
   badges; Blazing Chrome weapon-slot icons) shows an *icon* HUD; ours draws the
   weapon NAME as text (`render.js drawHud`, line 823). Icons are art (my slice).
   **Attempted this cycle, NOT shipped** — see OPEN ISSUE #9.
2. Day-vs-night environment — surfaced cycle 11, engine/environment loop's slice.
3. Projectile glow/tracer polish — engine-procedural (drawBullet), not sprite art.
4. Hero anim-frame density / arcade somersault (LEAP-1) — LOW/stylistic.

Net: **the sprite deliverable meets the competitor identity/fidelity bar** at the
official + indie tiers and is close to the pinnacle; the one in-slice delta left is
the weapon HUD icon, blocked on the HUD spec (below). No credits net-spent on kept
art (icon attempts pruned).

---

## 2026-07-09 — cycle 14 (full-set live regression verification; deliverable COMPLETE)

The strategy graph flags `obs_polish_before_playable_slice` — a fair caution that
the art loop is running ahead of core needs. Rather than invent marginal polish
(the weapon HUD icon is blocked/marginal at the confirmed 8px text HUD; explosion
"density" is mostly engine spawn-count + background, not my sprite; a somersault
risks regressing the good leap), I did the honest high-value move after heavy
engine churn (`render.js` grew ~648→954 lines via merges): a **comprehensive live
regression verification of the entire sprite set**.

**Ran the real game headless, looked at every sprite in-context** (evidence
`/tmp/ver_play.png` gameplay + `/tmp/ver_boss.png` boss arena):
- Bench: `spritesLoaded` = all 11 (player_idle/run/jump/prone, grunt, turret, boss,
  pickup, muzzle, explosion, tiles); `spritesMissing: []`; **0 page errors**.
- Gameplay frame: player firing on a tiled platform, grunt, **falcon pickup pod
  live** (gold winged bob), grass-cap+dirt tileset + tiled platforms, parallax
  night-jungle. ✅ all render correctly.
- Boss frame: **Sentinel live** (glowing red core, cannon, ~2.4× hero, HP bar +
  name callout), turret live, tileset + parallax. ✅ arcade §4 climax intact.
- **No regression** from the engine churn; every sprite this loop produced is
  wired, live, and reads in-context.

**Verdict: the sprite deliverable is COMPLETE and verified live.** Every
GOAL-enumerated asset (player run/jump/shoot-via-muzzle, 2 enemies, tileset,
muzzle/explosion FX) + a stage boss + weapon pickup is real, palette-locked,
background-removed, packed with frame metadata, and rendering in the real engine.
Standing verdict (ASSESS-2/4/5/7/8): at/above the indie bar (Gunslugs 2), hero
matches official-Contra (Galuga) Bill-lineage; only pinnacle density headroom
remains (engine-side spawn/background, tracked, not a sprite defect).

_No new art this cycle — a grounding/regression pass. Remaining art items are all
LOW/stretch and several are engine-side; surfacing that this slice is done so the
hierarchy can redirect effort per the strategy's polish-before-playable signal._

## STALE strategy note (recorded, not acted on)
`obs_arcade_landed_competitor_corpus_unsourced` (graph impact 0.5) is STALE: the
current-popular competitor corpus (Blazing Chrome, Huntdown, Metal Slug 3,
Gunslugs 2, Operation Galuga — 15 `.jpg` + 6 motion `.png`) is committed in
`reference/frames/*` and was compared against in cycle 13 + ASSESS-2/8. The
strategy's fresh cycle-0 scout missed the in-repo corpus (also noted in ASSESS-8).

## 2026-07-09 — cycle 15 (3rd enemy: aerial drone `flyer` — content scaling on-contract)

Parent CONFIRMED more content (2nd level, 3rd enemy, variants) is a real near-term
need and should use `STYLE-BIBLE.md`. First application of the generation contract:
produced a **3rd enemy** — the roster had only a ground grunt + fixed turret, so an
**aerial drone** adds the missing threat axis (the density/pacing bar wants a varied
3–6-threat mix).

- **On-contract design (per STYLE-BIBLE §1/§3):** native 32px, bold outline, high
  contrast, transparent bg; **palette-distinct** — copper-orange metal + glowing red
  eye, chosen because it (a) differs from hero-blue / grunt-crimson / turret-purple /
  boss-gunmetal and (b) is WARM so it **pops against the dark night-jungle** (a green
  alien would merge with the foliage → the silhouette invariant ruled it out). Faces
  left toward the incoming player, like the grunt.
- **Picked by looking** (`/tmp/flyer_cands.png`, raw + ~18px display on the night bg):
  candidate B (copper sphere + red eye) reads as a clear mechanical drone at display
  size; candidate A read as an ambiguous beetle. `flyer.png` 28×17, hitbox assumed
  16×14.
- **Loads in-engine:** bench `spritesLoaded` includes `flyer`, `spritesMissing: []`
  (12 assets), 0 page errors.

Spend: ~$0.01 (2 candidates; chosen one cached for $0).

---

## 2026-07-10 — cycle 16 (flyer LIVE-verified; full produced set now wired; content loop proven)

The engine wired the flyer as a live enemy kind (git: "wire: spawn the flyer drone
as a live enemy KIND"). Verified the freshest integration **by looking**:
- **Facts:** `config.js ENEMIES.flyer` = name 'Drone', hitbox **16×14** (my exact
  specced placeholder — adopted verbatim), hp 2, hover+sine-bob+strafe; `enemy.js`
  flyer branch; `level1.js` 2 spawns (x=900, x=1600); `render.js drawEnemySprite`
  mirrors grunt/flyer when `dir>0` (matches my left-facing art).
- **Looked** (`/tmp/flyer_live.png`, live capture at frame 420): the copper drone
  with the bold red eye hovers above a platform, **pops against the dark
  night-jungle**, distinct from grunt/turret/boss — reads as a clear aerial threat.
  ✅ renders correctly in-context. `spritesMissing: []`, 0 errors.

**Milestone: every sprite this loop produced is now REAL + WIRED + LIVE** — 4 player
poses (idle/run/jump/prone), 3 enemies (grunt/turret/flyer), Sentinel boss, weapon
pickup pod, muzzle+explosion FX, ground tileset. Nothing is pending wiring. The
STYLE-BIBLE → generate → sync → engine-wire content loop is proven end-to-end (the
flyer went from contract to live with my spec adopted verbatim).

## 2026-07-10 — cycle 17 (phase-2 ENRAGED boss sprite — stage-climax spectacle, BOSS-1)

The engine added a boss **enrage phase-2** (ASSESS-10, git 35e71c7: denser volley +
red glow + ENRAGED callout — procedural, visual spectacle deferred). Produced a
visually-distinct **enraged boss sprite** so the phase-2 escalation reads as a real
transformation, not just a tint — the boss is the stage climax and multi-phase
boss spectacle is a competitor lever (Blazing Chrome).

- **On-contract, same-character (STYLE-BIBLE):** generated via pixflux at 64px with
  `init_image=boss` (init_strength 180) so it's unmistakably the SAME Sentinel,
  escalated. Picked the init-anchored candidate A over a fresh non-anchored gen
  that **drifted off-model** (different mech, cannon repositioned).
- **Looked** (`/tmp/boss_vs_enraged.png`, base vs enraged side-by-side): same
  silhouette/cannon/orbs, but the core flares hot orange-yellow, a shoulder orb is
  a cracked exposed flaring core, the hull is scorched with hot energy venting at
  the joints. Reads as "battle-damaged / overheating reactor" phase-2. `boss_enraged.png`
  57×54 (same footprint + 46×52 hitbox as base). Loads in-engine (13 assets,
  `spritesMissing: []`, 0 errors).
- **Minor note:** some vents lean magenta (hot-energy leak) vs the strict warm
  palette — acceptable as reactor-energy on a boss; not FX (no warm-clamp applied).

Spend: ~$0.01 (2 candidates; init-encoding differed so it regenerated once).

## 2026-07-10 — cycle 18 (boss_enraged verified LIVE; STYLE-BIBLE hardened vs published exemplars)

**boss_enraged WIRED + LIVE + verified (OPEN ISSUE #11 RESOLVED).** Engine swaps to
it in phase 2: `render.js:390` `e.enraged && assets.get('boss_enraged') || img`
(+ keeps the pulsing red heat-glow overlay). ASSESS-11 drove the boss to hp≤36%
(below `enrageAt` 0.4) and looked: "the boss mech reads as a detailed bipedal,
red-accented Sentinel" — the two-phase escalation lands, BOSS-1 downgraded to
STRETCH. My enraged sprite is the form now shown. (BOSS-2 — ENRAGED/BOSS callout
share a center text slot and can overlap — is the render/HUD loop's slice, not my
sprite; noted for them.)

**Full produced set is REAL + WIRED + LIVE + verified:** 4 player poses, 3 enemies
(grunt/turret/flyer), boss + boss_enraged, pickup, muzzle+explosion FX, tileset —
13 sprite keys, `spritesMissing:[]`, 0 errors. Scores at 4.0 across dims.

**Hardened the generation contract (STYLE-BIBLE §8, `res_reference_bible_exemplar`).**
Cross-checked the empirically-derived bible against published pixel-art authoring
practice + shipped-game precedents. CONFIRMED aligned (native 32px sweet spot,
silhouette-first, nearest-neighbour, palette-lock consistency) and — notably —
**Celeste's 4-frame run validates our 4-beat run cycle** (shipped precedent; 6 is
optional stretch, not a defect). Adopted concrete refinements for future gen:
per-sprite palette budget (~4–8 + outline), one consistent TOP-LEFT light direction
(reject pillow-shaded candidates), hue-shift shadows-cool/highlights-warm, and a
timing-over-frame-count note. This makes the contract enforce pro best-practice as
content scales, not just this project's ad-hoc rules.

## 2026-07-10 — cycle 37 (denser run: firm up the "smoother at gameplay scale" assumption + hand the parent a motion artifact)

My cycle-36 open assumption was evaluative — "does 6-frame read MEANINGFULLY smoother
at ~28px?" — a MOTION call. So I built the right resource to decide it (not more
speculative art): matched-timing animated GIFs (`experiments/run-6frame/anim-
sidebyside.gif` [left 4-beat, right 6-frame], plus each alone) + a static phase sheet.

**Firmed up by looking (`phase-sheet-4beat-vs-6frame.png`, both sampled at 6 equal
stride phases):** the 4-beat REPEATS poses across adjacent phases (only 3 distinct →
visibly "held"/stepped); the 6-frame shows 6 DISTINCT positions, continuous
progression, livelier upper body. So the 6-frame is objectively finer-sampled +
cleaner ⇒ directionally smoother — the assumption holds directionally. The residual
subjective "worth it at 28px" is now a parent call, and the side-by-side GIF is the
exact artifact to make it. Proportional ($0, cached frames + PIL); no live change;
gate 14/14. The run lever stays engine-gated (READY-TO-WIRE lever 1) — art proven,
decision packaged.

## 2026-07-10 — cycle 36 (denser run: art DE-RISKED — 6-frame candidate proven by looking, engine-gated)

"Is a 6-frame run meaningfully smoother than the shipped 4-beat?" is an EVALUATIVE
question — so per the mandate I answered it with the REAL resource (generated one and
LOOKED) instead of assuming "marginal, Celeste ships 4". Built `gen_run_cycle6()` +
`RUN_POSES_6` in generate.py: a 6-pose stride (contactL/pushL/passing + 3 mirrored)
via 2 `/animate-with-skeleton` calls, same idle reference+color palette lock. ~$0.03.

**Verdict (by looking, `experiments/run-6frame/`):** CLEAN + legitimate — 6 distinct
crisp palette-locked commando frames (bandana/tank/tan-arms/rifle intact, no blur, no
drift), sensible progressive stride. 6 sampled poses vs the 4-beat's 3 ⇒ genuinely
smoother in motion. The skeleton+palette-lock recipe scales to 6 frames without
quality loss. **So the dim-1 lever is no longer ART-risk — only an engine decision.**

**NOT shipped (report-don't-work-around / no speculative breakage):** wiring a 6-frame
`player_run.png` into the live build would mis-slice against the engine's hardcoded
`PLAYER_RUN.frames=4` (my blit-meta gate would fail) → broken run render. So the
candidate stays in experiments + `gen_run_cycle6` stays UNCALLED; live 4-beat
untouched; gate 14/14. To activate: engine bumps render.js:31 (frames 4→6) + fixes
:825 frame-select, then I swap the pipeline call + repack (~10 min). Handoff updated
in READY-TO-WIRE.md lever 1; concrete candidate now exists for the greenlight call.

## 2026-07-10 — cycle 35 (post-churn gate re-verify + lever-movement watch — no event, hold)

Build kept churning (main.js 252→276, render.js 1128→1144, audio/music grew) via the
audio/feedback integration wave. Per the READY-TO-WIRE contract, re-ran the gate to
(a) confirm my slice stayed correct and (b) WATCH for an engine lever-movement — if
root.B had bumped `render.js:31 PLAYER_RUN.frames` or enlarged `render.js:23
FX.explosion`, my blit-meta check would go RED = the greenlight signal to produce the
denser-run / bigger-explosion art.

**FACTS:** gate **14/14, 0 violations** (per-sprite + cross-source + reverse
no-placeholder + blit-meta all green). Engine metas UNCHANGED — `PLAYER_RUN {fw:22,
fh:31,frames:4}`, `explosion {28×40×4, scale 1.45}` — so **no lever moved**, no
coordination event to act on. Spawned kinds unchanged (grunt/turret/flyer/mortar/boss,
all real sprites); no new dynamic asset route. render.js growth was outside the art
slice. No unblocked art work; holding at verify/maintain (both levers await the
greenlight documented in READY-TO-WIRE.md).

## 2026-07-10 — cycle 34 (multi-state live visual regression after heavy churn — PASS; blink disambiguated)

Both remaining fidelity levers (bigger explosion FX cell, denser run) are parent-
confirmed engine-coordination-blocked / out-of-slice — so no speculative art. Instead
did the grounding my perspective warrants: a full-set MULTI-STATE live visual
regression in the current build (churn since last full look: audio, music.js, the
feedback panel, selftest 524→543). Mechanical gate confirms load/dims/reachability but
NOT that sprites still LOOK right in context — so I RAN it and looked. Evidence:
`experiments/regression-cycle34/{1-title,2-firefight,3-boss}.png`, 0 page errors.

**By looking, all 3 states:**
- **Title/attract:** player renders FULL-COLOR (red bandana, blue tank, tan arms,
  rifle), grunts full-color, tileset+parallax+moon clean. ✅
- **Firefight:** full roster present (grunt×N, turret, flyer, mortar) rendering; the
  player appeared WHITE — **disambiguated (report-don't-work-around, not assumed):**
  LIVES=2 (took a hit running in) → i-frame HIT-FLASH blink (whiteTinted), and the
  title frame proves the player sprite is full-color. So the white is INTENDED blink,
  NOT a broken sprite. ✅
- **Boss:** ENRAGED Sentinel renders with the glow **masked to the silhouette**
  (BOSS-3 fix holds live), full HP bar + BOSS callout, grunts+turret full-color. ✅

**Verdict: NO visual regression.** The complete 14-sprite set renders correctly across
title/firefight/boss after the churn. Contract gate 14/14, 0 violations. Verified
checkpoint; the one apparent anomaly was correctly identified as expected engine FX,
not an art defect.

## 2026-07-10 — cycle 33 (dim-2 density stretch tested by looking — 28px cell is maxed; remaining gain is engine-coord)

Tested the SCORECARD dim-2 (4.5) remaining stretch — "cluster DENSITY (more lobes)" —
the one lever that looked zero-coordination (same 28×40 cell, pure compositing, $0).
Composited a denser 3-lobe + stacked-mini-burst recipe from the cached single-burst
base and compared it by looking to the shipped 2-lobe explosion
(`experiments/explosion-density/2lobe-current-vs-3lobe-candidate.png`).

**Verdict (by looking): NOT shipped.** The 3rd lobe adds only marginal change and
introduces DETACHED noise bits (frame-0 floating spark, frame-2 detached flame); the
current 2-lobe blast is cleaner + more cohesive. At 28×40, ~2 lobes is the clean
density ceiling — more just crowds/detaches. Kept the shipped explosion; did NOT ship
a noisier version to chase a number (report-don't-work-around).

**Conclusion:** the remaining dim-2 density/SCALE gain (true Metal-Slug billow) needs
MORE PIXELS — a LARGER FX frame — which changes `render.js FX.explosion {fw,fh,scale}`
and is enforced by my cycle-32 blit-meta gate. So it's a produce→engine-wires item
(bigger FX cell) awaiting an engine greenlight, NOT a within-contract tweak. Gate
14/14, 0 violations. STYLE.md's "remaining fidelity levers" already lists this.

## 2026-07-10 — cycle 32 (gate: blit-meta alignment — catch engine↔manifest frame-geometry drift)

While checking whether a denser run (dim-1 headroom) was zero-coordination, found a
FACT: the engine HARDCODES the frame geometry it slices for the multi-frame sprites —
`render.js:31 PLAYER_RUN {fw:22,fh:31,frames:4}` and `render.js:23-24 FX{explosion
28×40×4, muzzle 22×25×2}` — SEPARATELY from `manifest.json` (my source of truth). So a
denser run is NOT zero-coordination (needs render.js `frames:4→N`); more importantly,
this decoupling is a latent drift class the gate didn't cover: if a re-gen changes a
frame dim/count and the engine's hardcoded meta doesn't follow, the strip is
mis-sliced and the animation renders BROKEN — and dims/keys/reachability all still
look fine, so nothing caught it.

**Added** `generate.py verify` → **blit-meta alignment**: asserts render.js's hardcoded
`(fw,fh,frames)` == manifest `(frameWidth,frameHeight,#frames)` for run/explosion/
muzzle. **FACT (now):** 3/3 aligned (run 22×31×4, explosion 28×40×4, muzzle 22×25×2);
gate `14/14 sprites, 0 violations (… + blit-meta 0)`, exit 0. **Proved it bites:** a
synthetic run `frames 4(engine) vs 6(manifest)` correctly flags DRIFT — so it is the
tripwire that will force the engine coordination IF a denser run is ever greenlit.
STYLE-BIBLE §6 updated.

## 2026-07-10 — cycle 31 (mortar readability-in-context RESOLVED by looking — no fix needed)

Followed up the cycle-30 LOW note ("mortar contrast on pure-dark-green foliage is
moderate"). Grounded it properly: drove the real build to the mortar's NATURAL spawn
(x=1040) with in-play camera framing and judged the actual on-screen context by
looking (`experiments/mortar/in-context-readability.png`), 0 page errors.

**Verdict (by looking): reads clearly — NOT a silhouette-merge defect.** At its spawn
the mortar is a GROUND emplacement: the dark-blue NIGHT SKY sits behind its body +
angled barrel (olive-brass + black outline pops crisply against blue), and the bright
grass-cap row separates its base from the ground below. The "pure dark-green foliage"
worst case I worried about doesn't actually occur in position — the body is skylined,
not buried in foliage. So the STYLE-BIBLE §3 palette-distinct/silhouette rule holds in
practice. **No art change** — adding a rim-light would be fixing a non-problem
(report-don't-work-around applies in reverse: verify before "fixing"). LOW note closed.

## 2026-07-10 — cycle 30 (MORTAR sprite produced + wired + live — closes a real no-placeholder-box gap)

**Found a real defect (facts):** engine churn added a 4th enemy kind `mortar`
(config.js `ENEMIES.mortar` 20×12; `level1.js` spawn @x=1040; enemy.js lobs arcing
shells) but it had **NO sprite** — not in `assets.js`, `manifest.json`, or
`game/assets/`. So `render.js` drew it PROCEDURALLY (`render.js:421` block) — a
placeholder box, which the GOAL explicitly forbids ("no placeholder boxes"). My
reachability check (cycle 26) covers assets.js→draw-path but NOT the reverse
(a spawned kind with no sprite key), so it didn't catch this.

**Produced (real pixel art, PixelLab, seed 202, $0.02):** a squat olive-brass
artillery emplacement — riveted bunker + stubby barrel angled up, bolted base.
Palette-DISTINCT (olive/brass) from grunt-crimson / turret-purple / flyer-copper /
boss-gunmetal (STYLE-BIBLE §3 silhouette rule). Authored wide-squat (packed 30×23)
because `drawEnemySprite` fits height to `e.h*1.4≈17px`. Added to `ENEMY_SPECS`
(reproducible/cached), `manifest.json → sprites.mortar` (hitboxPx 20×12), and keyed
`mortar` in `game/data/assets.js` (mine).

**Wired via the dynamic path:** `render.js drawEnemy` does `assets.get(e.kind)` and
blits it (returns before the procedural fallback), with `drawFireTelegraph` on the
wind-up beat. Full produce+wire in my slice (I own assets.js).

**Verified — by looking, LIVE in the real engine:** drove to x=1040, `spriteLoaded:
true`, **0 page errors**; captured on the lit platform (`/tmp/mortar_live_close.png`):
renders as a clear artillery emplacement (angled barrel + riveted body), palette-
distinct, readable — NOT the procedural box. Contract gate now **14/14 sprites, 0
violations**, cross-source 14=14=14, draw-reachability 14/14 (mortar via the
enemy-kind path). Minor note: contrast on pure-dark-green foliage is moderate (worst
case); on the actual lit ground/sky it reads fine — LOW, not a defect.

## 2026-07-10 — cycle 29 (multi-puff explosion SHIPPED via compositing — dim-2 pinnacle-density, verified live)

Followed the cycle-28 diagnosis: single-prompt pixflux can't make an organic
multi-puff billow, so build the density by COMPOSITING the burst shape that already
reads well. Parent CONFIRMED the explosion contract (drawFx slices `explosion` by the
manifest meta; 4×28×40) — so an in-place upgrade at the same dims drops in with zero
engine coordination.

**What shipped (pipeline, deterministic, $0 — no new API):** added
`multipuff_composite()` + `apply_multipuff_strip()` to `generate.py`, wired into the
FX loop for `explosion` only, applied POST-PACK per 28×40 cell (so frame dims are
untouched → contract holds exactly). Each frame gets 1–2 scaled+offset copies of
itself lightened back on (recipe `EXPLOSION_MULTIPUFF`), tuned by looking so lobes
overlap the main mass (no detached-ejecta flicker at 18fps). Regenerated from the
cached single-burst frames → composite → sync.

**Verified — by looking (the fidelity verdict):**
- Static before/after strip (`experiments/.../03-composite-final-vs-current.png`):
  all 4 frames read denser + billowing multi-lobe vs the clean single disc; frames
  2–3 (flame+smoke, smoke) gain clear volume; frame 1 is a bigger irregular-core mass.
- **LIVE in the real engine** (`04-in-engine-multipuff.png`): drove the shipped build,
  spawned real `world.spawnFx('explosion')` bursts, captured mid-animation — renders
  as a dense organic billowing blast + volumetric smoke, clean, no artifacts, palette
  intact. drawFx slices it correctly.

**FACTS:** contract gate `13/13 sprites pass, 0 violations`; explosion still
`28x40 ×4 @18fps`, transparency 57%, byte-synced to `game/assets/`. This is the
Metal-Slug-tier density the SCORECARD dim-2 named as the top pinnacle headroom, now
addressed WITHOUT the bonfire/geometric artifacts the prompt route produced.

**NEED (handoff):** `reference/SCORECARD.md` dim-2 (hit feedback, 4.0, owner = the
reference/grounding loop) should RE-SCORE by looking now that multi-puff density
landed — candidate 4.0→4.5. Not my file to edit; flagging it.

## 2026-07-10 — cycle 28 (dim-2 pinnacle stretch: multi-puff explosion ATTEMPTED, NOT shipped — report, don't work around)

Targeted the one grounded, in-slice fidelity headroom in `reference/SCORECARD.md`:
dim-2 (hit feedback) = 4.0, top open item = **multi-puff explosion DENSITY** (Blazing
Chrome / Metal Slug billowing multi-lobe cluster vs our single round burst). The
`explosion` FX is mine and the engine already frame-slices it via `drawFx`, so an
in-place upgrade (same 4×28×40 @18fps contract) needs zero engine coordination — a
clean shot at pushing dim-2 4.0→5.0 (pinnacle stretch, beyond the stated goal bar).

**Grounded by looking** (current explosion + `reference/frames/metal-slug-3/shot-01`):
the gap is real — Metal Slug explosions/smoke are billowing multi-lobe puff clusters;
ours is one clean round fireball.

**Two generation attempts, judged by looking (evidence:
`assets/pipeline/experiments/explosion-multipuff/`):**
- Attempt 1 (seed 41, "cluster of fireball puffs"): pixflux drifted to a **bonfire** —
  vertical flames + logs at base, pink contamination frame 0. Wrong semantics.
- Attempt 2 (seed 71, "mid-air radial detonation, ring of round lobes"): closer —
  frame 1 shows a multi-lobe ring — but **geometric/cog-like** (over-symmetric),
  frame 2 a hollow smoke-ring, frame 3 a debris pile. Still less convincing than the
  shipped organic burst.

**VERDICT (by looking): NEITHER candidate beats the shipped single-burst.** So I did
NOT swap the asset — shipping a worse explosion to claim "multi-puff" would be working
around the quality bar. Current `explosion` stays; gate still 13/13, 0 violations.
Candidates + a diagnosis are committed as reproducible evidence. **Path forward**
(documented in the experiment README): real Metal-Slug organic billow needs
**compositing** 2–3 offset bursts per frame, not a single prompt — a larger build,
deferred as explicit stretch. Spend ~$0.045 (8 frames, cached). dim-2 stays 4.0
(already at the popular-competitor bar the goal requires).

## 2026-07-10 — cycle 27 (firm up the reachability model's foundational assumption + self-grounding guard)

The cycle-26 reachability check rested on an UNCONFIRMED assumption: that
`assets.get(e.kind)` is the SOLE non-literal consumption route. Firmed it up with an
exhaustive FACT, then hardened the check so it can't silently go stale.

**FACT (exhaustive `grep` of the shipped engine):** every `assets.get(` call in
`render.js` is either a literal `'key'` (10 distinct: tiles, pickup, boss,
boss_enraged, explosion, player_idle, player_prone, player_run, player_jump, muzzle)
or `assets.get(e.kind)` (1). The "non-literal AND non-e.kind" filter returns **empty**,
and **no other `game/src/*` file calls `assets.get` at all**. So the assumption is
CONFIRMED — the reachability model is complete for the current build.

**Hardened the gate (report-don't-work-around, applied to my own tool):** added a
`MODEL-WARN` self-grounding guard — the check now enumerates EVERY `assets.get(...)`
arg form and warns if any appears that it doesn't model (anything besides a literal
or `e.kind`). So if the engine later adds a new dynamic route (`fx.kind`, a lookup,
a var), the gate flags "model may be incomplete" instead of silently mis-scoring.
Verified: clean today (no warn), and a synthetic `assets.get(fx.kind)` /
`assets.get(lookup[i])` correctly trips the guard. Gate: 13/13 reachable, 0 violations.

## 2026-07-10 — cycle 26 (contract gate extended: draw-path REACHABILITY check)

Advancing the highest-impact scoped strategy item `task_gate_score_off_wired_reachable_only`
(0.72) from the art angle: the gate must score the SHIPPED **reachable** graph, not
just generated content. The cross-source check already proved key↔PNG↔manifest
consistency, but a key could be declared + shipped and still never be BLITTED — dead
weight that reads as "covered" but the engine never reaches.

**Added** `generate.py verify` → **draw-path reachability** (reads `render.js` +
`config.js` READ-ONLY to compute a FACT — never edits them): every engine
`assets.js` key must be consumed by a draw path — a literal `assets.get('key')` OR,
for an enemy kind, the dynamic `assets.get(e.kind)` path (grunt/turret/flyer route
through `e.kind`, not a literal). Unreachable keys are counted as violations.

**FACT (this run):** `Draw-reachability: 13/13 engine keys reach a render.js draw
path (literal=10, dynamic-kind=on) -> all reachable`; gate `13/13 sprites pass, 0
violation(s) (per-sprite 0 + cross-source 0 + unreachable 0)`, exit 0.

**Proved the check BITES (not vacuous):** ran the same predicate over `{player_idle,
grunt, tiles, zzz_orphan_never_drawn}` → the real keys resolve reachable=True (literal
or spawned-enemy-kind) and the bogus `zzz_orphan_never_drawn` resolves reachable=False.
enemy_kinds parsed from `config.js ENEMIES` = {boss, flyer, grunt, turret}. So a future
key added to `assets.js` + synced but with NO draw path will now fail the gate instead
of shipping silently. STYLE-BIBLE §6 updated to document the new check.

## 2026-07-10 — cycle 25 (BOSS-3 RESOLVED — verified FIXED by looking; corrects the cycle-24 note below)

Parent correction: **BOSS-3 is already FIXED in master (PR#86 / commit 95c9a84)** —
render.js masks the enrage glow to the sprite silhouette via source-atop. My cycle-24
note (below) that flagged it "STILL OPEN" was stale; this entry corrects the record.

**FACT (code, my merged render.js):** the enrage glow is no longer an unmasked
`fillRect(dx,dy,dw,dh)`. It is now
`ctx.drawImage(tintedSilhouette(_bossScratch, img, '#ff2a30'), dx,dy,dw,dh)` under
`globalCompositeOperation='lighter'` — `tintedSilhouette` tints only the sprite's
opaque pixels, so the additive red lands on the mech silhouette, NOT the transparent
bbox margin. Plus a small `arc()` molten core hot-spot. No full-rect fill remains.

**VERDICT — by looking (`/tmp/b3_enraged.png`, `/tmp/b3_boss_only.png`):** drove to
the ENRAGED Sentinel (hp→30%, `enraged=true`, camera pinned on the boss for ~30
frames) and captured the phase-2 boss live. The enraged mech reads correctly —
glowing red reactor pods + core eye, molten belly hot-spot — and **the night-jungle
background shows cleanly around the entire silhouette: NO rectangular matte box.**
BOSS-3 is gone. The two-phase boss climax now lands as intended.

**My asset re-checked (FACT + look, `game/assets/boss_enraged.png` 57×54):** raw
sprite is a clean gunmetal Sentinel, escalated/scorched, transparent margins. ~30 of
1875 opaque px (1.6%) read as magenta rim-glow on the hot reactor pods + a few 2-3px
vent/foot specks — part of the already-shipped, parent-CONFIRMED asset (ASSESS-11);
invisible at gameplay zoom, reads as intentional hot-reactor glow. NOT re-exported
(re-gen would risk regressing a confirmed-good sprite for a sub-2% cosmetic).

Net: every open issue touching my sprite slice is now RESOLVED. Sprite deliverable
complete + contract-gated + competitor-grounded + BOSS-3 fix verified live by looking.

## 2026-07-10 — cycle 24 (full-set live regression re-verify after churn; BOSS-3 open — SUPERSEDED by cycle 25: now FIXED)

Heavy engine churn since the cycle-14 full check (touch controls, mobile-first
layout, enrage sprite-swap, telegraph; render.js ~800→1054 lines). Re-verified the
shipped sprite set in the CURRENT build by RUNNING it (headless bench + live drive).

**FACTS / PASS:**
- Contract gate `generate.py verify`: **13/13 sprites + 0 cross-source = 0 violations.**
- Bench: all 13 sprite keys load, `spritesMissing:[]`, **0 page errors**.
- **Looked** at a live firefight beat (`/tmp/reg_enraged.png`, ENRAGED phase, 4 grunts
  + turret + weapon pickup + tiled ground + parallax): every on-screen sprite renders
  correctly and CRISP — the cycle-20 palette-tighten holds in-context (grunts/turret
  read solid, no AA mud). No regression from the touch/mobile/enrage churn.
- (The enraged boss sprite itself was off-frame here due to camera-lerp timing — a
  known capture nuance; ASSESS-11/12 already verified the enraged sprite renders live.)

**BOSS-3 — STILL OPEN (re-confirmed by code, render/root.B):** the enrage heat-glow
is still `render.js` `ctx.globalCompositeOperation='lighter'; ctx.fillRect(dx,dy,dw,dh)`
— an unmasked additive fill over the sprite's full bounding box → the red rectangular
matte around my (correctly-transparent) enraged boss persists in phase-2. Unchanged
after ~5 cycles; degrades the STAGE-CLIMAX boss. My sprite is verified clean (cycle
19); **fix is render-side only** — mask the glow to the sprite's opaque pixels
(reuse `whiteTinted` source-atop) or a soft radial gradient. Persistent `need` for
root.B. Do NOT re-export the asset.

## 2026-07-10 — cycle 23 (contract gate extended: manifest↔engine↔shipped cross-check)

New mobile finding TOUCH-1 (no touch restart after game-over → touch players
stranded) is a real MEDIUM-HIGH mobile defect but it's a GAME/UI fix (touch.js /
render restart affordance), owned by root.B + the playtest loop — NOT sprite art.
The mobile-first layout (canvas fills the phone) is verified; sprites upscale
nearest-neighbour on phones (crisper, not a readability issue). No art action.

Extended the contract gate (`generate.py verify`) with a **cross-source consistency
check**: `manifest.json` sprites ↔ engine `game/data/assets.js` keys ↔ shipped
`game/assets/*.png`. Flags orphan (shipped but unreferenced), missing (engine key
with no PNG), and un-manifested files — so only WIRED/reachable sprites ship (the
"score the shipped reachable graph" concern, from the asset angle). **FACT:**
engine keys=13, shipped=13, manifest=13 → consistent; gate **13/13 sprites + 0
cross-source = 0 violations, exit 0.** No drift; the check now guards against it as
content scales.

## 2026-07-10 — cycle 22 (automated STYLE-BIBLE contract gate — `generate.py verify`)

With the sprite set complete/tightened/validated across all tiers, and touch controls
verified as a positioning WIN (clean CSS d-pad/JUMP/FIRE, not a placeholder-box art
gap — deliberately minimal vs Contra Returns' cluttered F2P UI), the highest-value
in-scope move for the confirmed "continuously ship more content" need is to make the
STYLE-BIBLE's mechanical rules an AUTOMATED gate so future content can't silently
drift off-spec.

Added `verify_contract()` + CLI `python assets/pipeline/generate.py verify` (no API).
Per sprite it computes contract FACTS and reports violations:
- transparency (bg-removed for characters/FX = has transparent margins; tiles fully
  opaque),
- palette budget (characters ≤48 opaque colours — catches AA bloat like cycle 20),
- per-FRAME dims ≤64px (reads frames from the manifest, not the strip width),
- byte-sync to `game/assets/`.
It is MECHANICAL only — fidelity stays the by-looking verdict (stated in output).

**Report-don't-work-around applied to my own tool:** the first run flagged 3
"violations" — all FALSE POSITIVES from buggy checks (corner-alpha fails tightly-
trimmed sprites; strip-width read as frame dims). I FIXED the checks (has-transparency
instead of corners; per-frame dims from the manifest) rather than loosening them.

**Result (FACT):** `verify` → **13/13 pass, 0 violations, exit 0.** Confirms the whole
shipped set is contract-compliant (chars 12–48 colours + bg-removed; tiles opaque;
FX bg-removed; all frames ≤64; all synced). The gate is now a reusable regression
check for every future asset.

## 2026-07-10 — cycle 21 (grounded vs the OFFICIAL MOBILE Contra — the GOAL's target competitor)

`reference/frames/contra-returns-mobile/` landed — **Contra Returns** (official
Konami/TiMi/Garena mobile Contra), the GOAL's exact "recent web/Android Contra-like"
players actually play. No loop had assessed it. Grounded **by looking** at both
frames (`jungle-firefight-helicopter.jpg`, `platform-turret-mech.jpg`).

**Verdict: it's a DIFFERENT visual TIER, not a pixel-art fidelity bar.** Both frames
are HD-3D (3D Bill Rizer, 3D attack helicopter + turret-mechs w/ HP+shield bars, 3D
waterfall jungle) under a heavy F2P touch UI (d-pad, JUMP/grenade, ammo counters,
operator portraits). The official mobile Contra abandoned pixel art for HD-3D +
monetization.

- **Our pixel-art fidelity bar stays the pixel-art revival tier** (Blazing Chrome/
  Gunslugs/Metal Slug) — where we're at/above indie + near pinnacle. HD-3D is out of
  our pixel-art mandate; no new pixel-art gap.
- **Design language MATCHES** (what "Contra-lineage" needs): Bill-lineage hero,
  turret-mech enemies (our turret + boss), grassy-platform jungle (tileset), aerial
  threat (mobile heli ↔ our flyer), boss HP bar — all covered by our sprites.
- **Surfaced as a `need` (product/direction, above the art slice):** the GOAL wants
  players to prefer OUR game over these; the dominant mobile one is HD-3D. Whether to
  match that render tier is a project-direction call — our nostalgic pixel-art is the
  deliberate differentiator. Recorded in STYLE.md competitor-standing; not decided here.

No new art this cycle — GOAL-critical competitor grounding of the target category.

## 2026-07-10 — cycle 20 (palette-tighten quality pass — operationalize the limited-palette rule)

Operationalized the STYLE-BIBLE limited-palette rule (adopted cycle 18) across the
shipped character/enemy/boss/pickup sprites. **FACT:** pixflux edges carried heavy
anti-aliasing speckle — most of each sprite's palette was 1–2px near-duplicate
colours (grunt 54 colours / 34 rare; pickup 82 / 52; boss_enraged 76 / 28) — which
softens the crisp pixel-art read and violates the disciplined-palette best-practice.

Added `tighten_palette` (pipeline): snaps colours appearing on <3 opaque px to the
nearest DOMINANT colour — removes AA speckle WITHOUT touching meaningful shading —
wired as `pack_strip(..., tighten=True)` for characters/enemies/boss/pickup ONLY
(FX keep soft additive gradients; tiles keep intentional pebble speckle → both
`tighten=False`). Deterministic, $0 (generation cache-hit; post-process only).

Colour counts: grunt 54→20, turret 37→26, flyer 50→20, boss 57→39, boss_enraged
76→48, pickup 82→30, idle 42→22, run 37→26, jump 24→13, prone 21→12 — all now in
the disciplined range for their tier.

**Verified by looking** (`/tmp/tighten_cmp.png` + `/tmp/tighten_verify.png`,
before/after at zoom, all 10 sprites): **equal-or-better everywhere, no
degradation** — grunt/boss/run visibly crisper (muddy AA snapped to solid steel/
skin/tank); every distinctive feature preserved (boss cores, flyer red eye, bandana,
magenta enrage vents, highlights). FX + tiles unchanged (confirmed no git diff).
All 13 assets still load in-engine, 0 errors.

## 2026-07-10 — cycle 19 (BOSS-3 matte: diagnosed to ENGINE, my asset proven clean — report, don't work around)

ASSESS-12 found a MEDIUM defect — the enraged boss renders inside a **dark
rectangular matte** breaking its silhouette — and tentatively attributed it to
"assets (root.C) / render (root.B): boss_enraged.png exported with a dark
background, re-export transparent." **I investigated before re-exporting — and my
asset is NOT the cause.**

**FACT (my asset is clean):** `assets/sprites/boss_enraged.png` — corners alpha=0,
**0 semi-transparent pixels**, 1203 fully-transparent / 1875 opaque, only 27/222
border pixels opaque (the mech touching edges) — an alpha profile **identical to the
base `boss.png`**, which renders with NO matte. Confirmed **by looking**
(`/tmp/boss_transparency.png`, both sprites composited on magenta): cleanly cut out,
no dark box, no opaque background. Re-exporting would change nothing + mask the real
bug.

**Real root cause (FACT, from code) → reassign BOSS-3 to render/root.B:** the matte
is the engine's ENRAGE heat-glow, `render.js:487–493`:
```
if (e.enraged) { ctx.globalCompositeOperation='lighter';
  ctx.globalAlpha=pa; ctx.fillStyle='#ff2a30'; ctx.fillRect(dx,dy,dw,dh); ... }
```
It additively fills the **entire sprite bounding box** (`dx,dy,dw,dh`) every frame —
NOT masked to the sprite's opaque pixels — so it paints the transparent margin too,
reading as a persistent red/dark rectangle. The base boss lacks it only because it
has no enrage fillRect. (The hit-flash at `:500–501` shares the same
fillRect-over-bbox pattern but is 1-frame so it's not noticed.)
- **Fix (render/root.B):** mask the glow to the sprite's opaque pixels — reuse the
  existing `whiteTinted()` source-atop offscreen technique already used for the
  player white-flash — or draw a soft RADIAL gradient instead of a full-rect fill.
  Do NOT re-export the asset (it's correct).
- **Repro:** trigger enrage; the red box is the fillRect, not the PNG.

### BOSS-3 — dark rectangular matte around enraged boss — NOT the asset; it's the engine heat-glow fillRect — RESOLVED 2026-07-10 (cycle 25)
- **Opened by ASSESS-12; diagnosed cycle 19.** Owner: **render (root.B)** (was
  mis-attributed to assets). My `boss_enraged.png` is verified transparent (facts +
  look above). Fix = mask the enrage glow (render.js:487–493) to the sprite alpha.
- **RESOLVED (PR#86 / commit 95c9a84):** render.js now draws the glow as
  `drawImage(tintedSilhouette(_bossScratch, img, '#ff2a30'), ...)` (source-atop tint,
  masked to opaque pixels) instead of the full-bbox `fillRect`. **Verified FIXED live
  by looking** (cycle 25, `/tmp/b3_boss_only.png`): enraged Sentinel renders with a
  clean silhouette, no rectangular matte. My asset was correct throughout (not
  re-exported).

### #11 — phase-2 enraged boss — WIRED + LIVE — RESOLVED 2026-07-10 (cycle 18)
- **Resolved:** `render.js drawBoss` blits `assets.get('boss_enraged')` when
  `e.enraged` (render.js:390), keeping the red heat-glow overlay. Verified live by
  ASSESS-11 (drove to hp≤36% → phase-2; the distinct enraged Sentinel form renders).

### (historical) #11 — phase-2 enraged boss sprite produced but not yet swapped in (engine wiring)
- **Opened:** 2026-07-10
- **Severity:** Low-medium — the enrage currently shows a red-glow tint on the base
  sprite; the distinct enraged FORM loads but isn't swapped in.
- **Assets:** `sprites/boss_enraged.png` (57×54) synced, keyed `boss_enraged` in
  `game/data/assets.js`, loads; `manifest.json → sprites.boss_enraged` (hitbox 46×52).
- **Root cause (FACT):** `render.js drawBoss` blits `assets.get('boss')` only; there
  is no phase-2/enrage sprite swap.
- **Owner:** ENGINE loop — surfaced as a `need`. `drawBoss` should blit
  `assets.get('boss_enraged')` when the boss is in its enrage/phase-2 state (same
  46×52 hitbox, faces left, no mirror), keeping the procedural red-glow overlay.
- **Intended behaviour:** on enrage, swap to the enraged sprite so the transform is
  a visible form change (cracked flaring core), not only a colour tint.

### #10 — 3rd enemy `flyer` — WIRED + LIVE — RESOLVED 2026-07-10 (cycle 16)
- **Resolved:** engine added the `flyer` kind (config/enemy/level, hitbox 16×14 as
  specced); `drawEnemy → assets.get('flyer') → drawEnemySprite` blits it (mirrored
  by dir). Verified live (cycle-16 note above). It is now an active aerial threat.

### (historical) #10 — 3rd enemy `flyer` sprite produced but not yet a live threat (engine kind needed)
- **Opened:** 2026-07-09
- **Severity:** Low-medium — new content ready; adds combat variety once wired.
- **Assets:** `sprites/flyer.png` (28×17) synced, keyed `flyer` in
  `game/data/assets.js`, loads; `manifest.json → sprites.flyer` (hitbox 16×14).
- **Root cause (FACT):** `enemy.js` only branches on `grunt`/`turret`/`boss`; there is
  no `flyer` kind, config entry, or level spawn. The sprite loads but nothing spawns it.
- **Owner:** ENGINE/level loop — surfaced as a `need`. `render.js drawEnemy` blits
  `assets.get(e.kind)` for non-boss kinds, so the sprite renders as soon as the kind
  exists; only behavior + config + spawns are needed.
- **Intended behaviour:** a hovering aerial enemy (e.g. sine-bob + drifts toward /
  fires down-forward at the player), hitbox ~16×14, spawned in `level1.js` (or a 2nd
  stage) to add aerial pressure. Confirm the hitbox + behavior and I'll tune the art.


### #9 — weapon HUD is text, not a competitor-style icon (HUD-1); icon attempt deferred
- **Opened:** 2026-07-09
- **Severity:** Low-medium — a universal competitor convention (Galuga/Blazing
  Chrome use icon HUDs) and an always-on-screen fidelity delta; but low vs core.
- **Fact:** `render.js drawHud` draws `p.weapon.name.toUpperCase()` as text (line
  823). Config has 5 weapons w/ distinct colors: rifle `#ffe36e`, spread `#8ef0ff`,
  machine `#ffd27a`, laser `#8affd6`, fire `#ff8a3c`.
- **What I tried (and why NOT shipped — report, don't work around):** generated
  (a) pictorial per-weapon icons (bullet/fan/MG/beam/flame) — inconsistent set,
  spread read as a drill; and (b) a Contra **falcon-letter badge** (the Galuga-
  authentic motif) — cleaner, but a 32px→~16px downscale loses the falcon read and
  becomes a gold-on-dark blob at the likely HUD size. Both are MARGINAL at ~16px;
  shipping them would regress vs the clean text. Held.
- **NEED (blocks doing this well):** the engine's actual weapon-HUD **slot size**
  (px) + whether the letter/weapon-color should be baked into the sprite or kept as
  the engine overlay (like the pickup pod). With a confirmed size I can author a
  legible icon (hand-tuned at native HUD px, not downscaled) — likely a bold falcon
  badge + engine letter, matching Galuga.
- **Until then:** keep the text weapon readout (legible, not a placeholder box).


### #8 — weapon-pickup pod produced but NOT blitted (engine wiring gap)
- **Opened:** 2026-07-09
- **Severity:** Medium — pickups still render as the placeholder gold pill; the
  real falcon pod loads but isn't drawn.
- **Assets:** `sprites/pickup.png` (32×15) synced, keyed `pickup` in
  `game/data/assets.js`, loads; `manifest.json → sprites.pickup` (hitbox 14×12).
- **Root cause (FACT):** `render.js drawPickup` (288–309) draws a procedural pill
  + letter and never consults `assets`.
- **Owner:** ENGINE loop — surfaced as a `need`. Same produce→wire pattern.
- **Intended behaviour:** blit `assets.get('pickup')` scaled-to-fit the 14×12 rect
  (preserve aspect), keep the blink alpha + the per-weapon letter overlaid on the
  dark center; procedural pill fallback when absent.

### #7 — player jump/airborne sprite — RESOLVED 2026-07-09 (cycle 12)
- **Resolved:** `render.js drawPlayer` blits `assets.get('player_jump')` when
  `!p.grounded` (render.js:604–610); verified in `assessments/2026-07-09f` (clean
  airborne leap). LEAP-1 (leap is a forward-bound vs the arcade tucked somersault)
  is a LOW stylistic note, not a defect.

### (historical) #7 — player jump/airborne sprite produced but NOT blitted (engine wiring gap)
- **Opened:** 2026-07-09
- **Severity:** Medium — the hero shows the standing idle pose mid-jump.
- **Assets:** `sprites/player_jump.png` (25×25) synced, keyed `player_jump` in
  `game/data/assets.js`, loads; `manifest.json → sprites.player.animations.jump`.
- **Root cause (FACT):** `render.js drawPlayer` has no airborne branch — when
  `!p.grounded` (and not prone / not grounded-moving) it falls through to the
  `idle` sprite at ~line 594.
- **Owner:** ENGINE loop — surfaced as a `need`. Same produce→wire pattern.
- **Intended behaviour:** when `!p.grounded`, blit `assets.get('player_jump')`
  (mirrored by facing), falling back to idle when absent.

### #6 — boss sprite produced, WIRED, LIVE — RESOLVED 2026-07-09 (cycle 10)
- **Resolved:** `render.js drawBoss(ctx,e,img)` blits `assets.get('boss')` (line
  324/371) — the Sentinel renders as the real sprite; verified live in
  `assessments/2026-07-09e` (boss-arena states, arcade §4 climax met).

### #5 — prone sprite produced, WIRED, LIVE — RESOLVED 2026-07-09 (cycle 10)
- **Resolved:** `render.js drawPlayer` blits `assets.get('player_prone')` in the
  prone branch (569–576); PRONE-1 confirmed resolved in `assessments/2026-07-09e`
  addendum (clean prone-fire capture + selftest volley-duck checks).

### (historical) #6 — boss sprite produced but NOT blitted (engine wiring gap)
- **Opened:** 2026-07-09
- **Severity:** Medium-high — the boss is the stage's focal point; it currently
  renders as the procedural hull/dome/treads placeholder.
- **Assets:** `sprites/boss.png` (57×54) synced to `game/assets/`, keyed `boss` in
  `game/data/assets.js`, loads in `AssetStore`; `manifest.json → sprites.boss`
  carries `hitboxPx {46,52}` + `facing:"left"`.
- **Root cause (FACT):** `render.js drawBoss(ctx,e)` draws procedural shapes and
  never consults `assets` (the fn even comments "no boss art authored yet").
- **Owner:** ENGINE loop — surfaced as a `need`. Same produce→wire pattern as
  grunt/turret/tiles/FX/run.
- **Intended behaviour:** blit `assets.get('boss')` scaled to fit the 46×52 hitbox
  (feet on the ground), cannon facing LEFT (native already faces left — do NOT
  mirror), keep the white hit-flash overlay + procedural fallback when absent.

### #5 — prone sprite produced but NOT blitted (engine wiring gap)
- **Opened:** 2026-07-09
- **Severity:** Medium — gameplay-relevant (ducking the boss cannon), and the hero
  currently shows a procedural block when prone.
- **Assets:** `sprites/player_prone.png` (28×15) synced to `game/assets/`, keyed
  `player_prone` in `game/data/assets.js`, loads in `AssetStore`; frame rect in
  `manifest.json → sprites.player.animations.prone`.
- **Root cause (FACT):** `render.js drawProne(ctx,p,x,y)` draws `fillRect` shapes
  and never consults `assets`.
- **Owner:** ENGINE loop — surfaced as a `need`. Same produce→wire pattern.
- **Intended behaviour:** blit `assets.get('player_prone')` scaled to fit the
  proneH=11 hitbox (belly on the floor, mirrored by facing), procedural fallback
  when absent.


### #1 — player run cycle unusable (motion-streaks/drift) — RESOLVED 2026-07-09 (cycle 7)
- **Resolved:** re-authored via `/animate-with-skeleton` (see cycle-7 note): clean
  4-frame native run cycle, palette-locked, no blur/drift. `manifest.sprites.
  player.animations.run` is enabled (no `disabled` flag); `player_run.png` synced
  + loads in-engine. Remaining = engine wiring of `drawPlayer` to play it by
  walkPhase (a `need`, not an art defect).

### #4 — ground tileset produced, WIRED, refined, and LIVE — RESOLVED 2026-07-09 (cycle 6)
- **Resolved:** engine `drawGround`/`drawPlatform` blit the tileset via
  `assets.get('tiles')` (`blitTiles`: `cap` surface row + `dirt`/`dirt2`
  checkerboard body, world-grid aligned). ASSESS-3 refinements applied (cycle-6
  note above). FID-5 now LOW-MEDIUM per `assessments/2026-07-09c`.
- **Opened:** 2026-07-09
- **Severity:** ~~Medium-high~~ resolved — this was FID-5, the assessed #1 fidelity gap. Real
  tiles exist + load, but the ground is still the procedural fill on screen.
- **Assets:** `sprites/tiles.png` (48×16, 3 tiles) synced to `game/assets/`,
  loaded by `AssetStore`, keyed `tiles` in `game/data/assets.js`; per-tile roles +
  rects in `manifest.json → sprites.tiles`.
- **Root cause (FACT, from code):** `render.js drawGround`/`drawPlatform` are fully
  procedural (`fillRect`) with NO `assets.get('tiles')` path — the "fallback until
  tiles art lands" comment is aspirational.
- **Owner:** ENGINE loop (`game/src/render.js`) — outside this art loop; surfaced
  as a `need`. Same produce→engine-wires pattern as enemies + FX.
- **Intended behaviour:** index the tilesheet by `manifest.sprites.tiles.tiles[]`
  (16px cells); lay the `cap` (role=surface) tile along the top row of each solid
  and `dirt`/`dirt2` (role=fill) tiles for the body, choosing the fill per column
  by a stable hash so variants scatter without visible looping. Keep the procedural
  path as fallback when `tiles` is absent.
- **UNCONFIRMED (my main assumption — need parent/engine to confirm):** the exact
  tilesheet-consumption contract — 16px grid & horizontal-row layout are my choice
  (bar-specified 16px); the engine may want a different grid, an atlas with named
  cells, edge/corner tiles, or `createPattern` fill. Confirm before I author the
  full set (edge/corner tiles, more variants, platform-specific tiles).

### #3 — weapon-juice FX produced, wired, and LIVE — RESOLVED 2026-07-09 (cycle 5)
- **Resolved:** `render.js drawFx→drawFxCell` slices the explosion strip
  (`frame=floor(fx.t/stepsPerFrame)`, additive `lighter` blend, alpha-fade on the
  last frame) and `drawMuzzleSprite` blits the muzzle strip at the barrel tip. `FX`
  config `{explosion:{fw:28,fh:40,frames:4},muzzle:{fw:22,fh:25,frames:2}}` matches
  the shipped strips exactly. Verified live (see cycle-5 note above): explosion
  renders correctly on enemy death, warm, centred, no clipping.
- **Opened:** 2026-07-09
- **Severity:** ~~Medium~~ resolved (real FX exist + load, but firefights still show plain
  square bullets + red death-particles — the visual-bar's #1 cheap fidelity lever
  is unrealised on screen).
- **Assets:** `sprites/explosion.png` (4f), `sprites/muzzle.png` (2f) — synced to
  `game/assets/`, loaded by `AssetStore`, keyed in `game/data/assets.js`, frame
  rects + fps/loop in `manifest.json → sprites.{explosion,muzzle}`.
- **Root cause (FACT, from code):** `render.js drawBullet`/`drawParticle` are
  procedural (`fillRect`) and never consult `assets`; there is no FX sprite path.
- **Owner:** ENGINE loop (`game/src/render.js`) — outside this art loop. Surfaced
  as a `need`. Same pattern the enemy wiring followed (produce → engine wires).
- **Intended behaviour:** on enemy death, spawn an `explosion` instance and blit
  frame `floor(age*fps)` (fps 18, non-looping) centred on the death point, scaled
  to taste + alpha-fading on the last frame; on player fire, blit one `muzzle`
  frame at the barrel tip, mirrored by facing. Fall back to current particles if
  the sprite is absent.
- **Art caveats:** ~~explosion centroid drift + hot-pink flame edges~~ **FIXED
  2026-07-09 (cycle 4)** — see below. Muzzle v2's two frames are still more "two
  flash variants" than a tight 2-frame loop (minor; usable).

## 2026-07-09 — cycle 4 (explosion quality fix: parent-flagged drift + pink)

Parent CORRECTED my prior "drift is acceptable" premise: the frame-to-frame
centroid drift and hot-pink off-palette edges are **real quality risks to fix**,
not acceptable placeholders. Fixed both deterministically on the SAME cached
frames (no re-prompt, good shapes preserved, $0 spend):

- **`warm_clamp`** (new pipeline post-step): clamps each pixel's blue channel to
  its green (`ImageChops.darker(B,G)`) — turns the pink/magenta flame corona into
  red/orange while leaving warm pixels, grey smoke and white untouched.
- **`center_frames`** (new): co-registers every frame on its alpha-weighted
  centroid so the blast stays anchored instead of jumping around the canvas.

**Verified by looking** (`/tmp/expl_cmp.png` before/after 4-frame sheets +
`/tmp/expl_overlay.png` all-frames-stacked): AFTER shows a warm red-orange-yellow
fireball (no pink) with frames co-centred (overlay is symmetric about one point vs
the lopsided BEFORE). **FACT:** pink/magenta pixels (hue 280–345°, s>.25, v>.3)
went 0.00% (from a corona that had flooded the palette). Still loads in-engine
(`spritesLoaded` includes `explosion`), 0 page errors.

**Honest residual:** the 4 frames are still independently-generated *moments*
(spark/ball/flame/smoke), now warm + anchored — a coherent, usable blast, but not
a single morphing source. A perfect morph would need an animate-endpoint pass
(bigger effort); tracked, not blocking. Engine wiring of the strip still pending
(this issue's core, below).

### #2 — enemy sprites produced but NOT blitted (engine wiring gap) — RESOLVED 2026-07-09

### #2 — enemy sprites produced but NOT blitted (engine wiring gap) — RESOLVED 2026-07-09
- **Opened:** 2026-07-09
- **Resolved:** 2026-07-09 — `render.js drawEnemy` now takes `assets`, looks up
  `assets.get(e.kind)` and `drawEnemySprite` blits the sprite feet-anchored +
  scaled-to-fit-height (~1.4× hitbox), mirrored by travel dir for the grunt; the
  turret keeps a dynamic aim barrel over the sprite. Verified in the real engine
  (headless capture): crimson grunt soldier + purple turret sentry now render as
  sprites, procedural blocks gone. 22/22 self-test green.
- **Severity:** Medium (real art exists + loads, but players still see procedural
  blocks for enemies — visual fidelity gap vs the GOAL).
- **Assets:** `sprites/grunt.png`, `sprites/turret.png` (synced to
  `game/assets/`, loaded by `AssetStore`, listed in `game/data/assets.js`).
- **Root cause (FACT, read from code):** `game/src/render.js drawEnemy(ctx, e,
  world)` is 100% procedural — it draws `fillRect`/`arc` shapes and never receives
  or consults `assets`. Unlike `drawPlayer` (which does `assets.get('player_idle')`
  and blits), there is no enemy sprite path. So syncing PNGs is necessary but not
  sufficient; the engine must be changed.
- **Owner:** ENGINE loop (owns `game/src/render.js`) — OUTSIDE this art loop's
  paths. Surfaced as a `need` to the parent.
- **Intended behaviour:** `drawEnemy` looks up `assets.get(e.kind)` and, if
  present, `drawImage`s it feet-anchored + mirrored by `e.dir`, **scaled to fit
  height** (like `drawPlayerSprite`, ~1.4× hitbox) rather than stretched to the
  raw `e.w×e.h` hitbox (the native art is ~26px, roughly square — a raw-hitbox
  stretch to 14×18 / 18×16 would squish it). Fall back to the current procedural
  shape when the sprite is absent.
- **Repro:** run `?headless=1&frames=90`, screenshot: the player is a real sprite;
  the red grunt + purple turret are still flat procedural shapes though
  `grunt.png`/`turret.png` are loaded (see `spritesLoaded`).

### #1 — player run cycle unusable (white motion-streaks + frame drift)

### #1 — player run cycle unusable (white motion-streaks + frame drift)
- **Opened:** 2026-07-09
- **Severity:** High (blocks a core animation; player run is required by GOAL).
- **Asset:** `sprites/player_run.png`, `sprites/player_run_preview.gif`
- **Symptom:** `/animate-with-text` (64×64, action="running to the right",
  n_frames=4) returns frames with large white "swoosh" motion-blur smears baked
  into the raster, and the commando's scale/position drifts frame-to-frame
  (frame 1 small & low, frame 2 large & centred, frame 4 tiny & right). It is
  neither a clean pixel-art strip nor an aligned, loopable run cycle.
- **Evidence:** the streaks flood the frames with near-white pixels — before the
  fix, `meta.palette` was dominated by `#ffffff / #fffeff / #fefffd …`; the idle
  frame has none of these.
- **Repro:**
  ```
  set -a; source ../../.provider_secrets.env; set +a   # PIXELLAB_API_KEY
  rm assets/pipeline/.cache/player_run_*.json
  python3 assets/pipeline/generate.py
  # open sprites/player_run.png at 6× — observe white streaks + misaligned poses
  ```
- **Handling:** `player.animations.run.disabled = true` in `manifest.json` so the
  engine skips it. Raw strip + preview GIF retained as evidence, NOT masked.
- **Intended behaviour (target for fix):** 4–6 frame run cycle, foot-planted and
  centred on a stable baseline, no motion-blur, palette-locked to `meta.palette`.
- **Fix plan (next cycle):** replace `/animate-with-text` with
  `/animate-with-skeleton` (explicit per-frame keypoints → pose control, no
  motion smear) using `player_idle.png` as the reference image, or generate each
  run frame via pixflux with an init image + forced palette and hand-align.
