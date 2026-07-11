# Fidelity/Feel Assessment #2 — OUR game vs. the competitor visual BAR

**Date:** 2026-07-09 (cycle after real sprites + prone landed) ·
**Subject:** loop-root-B `game/index.html` @ commit `3326880` (real grunt+turret sprites wired) ·
**Native res:** 480×270 · **Seed:** 1234

**Method (grounded, ran the real build):** served `game/`, captured 5 deterministic static
states via `capture-our-game.mjs` (native 480×270 canvas via `toDataURL`) + an 8-frame
**live motion** sequence via `capture-frames.mjs --mode pptr` (run→fire→jump→prone).
Confirmed real art actually loaded (`bench.spritesLoaded = [player_idle, grunt, turret]`,
missing = [player_run, tiles]). Made 5× nearest-neighbour **zoom crops** of the hero and
grunt so their pixel detail is judgeable against the 1920×1080 competitor stills, then
**looked at** OUR crops beside `frames/{gunslugs-2,blazing-chrome-2019,metal-slug-3}/`.
Evidence: `frames/our-game/state-*.png`, `frames/our-game-motion/frame-*.png`.

---

## Headline: the fidelity bottleneck moved from CHARACTERS to ENVIRONMENT

Last assessment (#1) scored sprites **1.5/5** — placeholder blocks. Real art has since
landed and it is **good**. The blocking gap is no longer the hero/enemies; it is the
**background/tile art** and **animation frame-count**.

## What I see now (looked, at zoom)

- **Hero (5× crop):** a genuine Contra-authentic soldier — **red bandana, bare muscular
  torso, blue harness/straps, blue pants, red boots, rifle forward + chunky yellow muzzle
  flash**. Strong readable silhouette; clean 16-bit shading. Reads unmistakably as a
  Bill-Rizer-lineage run-and-gun hero.
- **Grunt (5× crop):** red-armored helmeted soldier in a combat crouch, rifle aimed,
  maroon+orange palette — distinct silhouette from the blue hero (no hero/enemy merge).
- **Motion:** live run shows muzzle flash + Spread fan; on contact the hero enters a
  **white i-frame invuln-blink** (one-hit-death → respawn-protect) — real hit feedback in
  motion. Live run also put **2 grunts on screen** (denser than the scripted showcase).
- **Still flat:** background is 2 parallax mountain bands + procedural ground/platforms;
  **`tiles` art is unauthored** (fallback), and **`player_run` is QA-failed/disabled**.

## Side-by-side vs the BAR (real pixel comparison)

| vs | verdict (by looking) |
|----|----------------------|
| **Gunslugs 2** (indie/web bar) | **OUR character sprites now MEET/EXCEED Gunslugs-2's hero** — their protagonist is chunkier & lower-detail than ours. Gunslugs wins on **environment** (stratified dirt-tile ground, layered city ruins, a big detailed boss) and onomatopoeia juice. → we've cleared the *character* bar for the realistic tier; **environment is the gap**. |
| **Blazing Chrome** (pinnacle) | our hero is in the right spirit but their sprites carry more animation frames + interior detail, and their backgrounds are dense biomech tilework. Gap = **animation density + environment**, not base character design. |
| **Metal Slug 3** (anim ceiling) | far more per-frame animation + destructible set-dressing. Aspirational; not the near-term bar. |
| **Operation Galuga** (official) | 2.5D + M/S/F falcon weapon-slot HUD + lush jungle layers. Our HUD is text-only for weapon (see HUD-1). |

## Rubric scores (current build; Δ vs Assessment #1)

1. **Sprite & animation quality — 3.0/5** (↑ from 1.5). Real, readable, Contra-authentic
   hero + grunt that beat the indie-tier character bar. Held back by **disabled run cycle**
   (idle-only → limited run anim) and **flat/unauthored environment**.
2. **Hit feedback & hit-stop — 3/5** (=). Confirmed i-frame white-blink + muzzle flash +
   death particles in motion; hit-stop/trauma kernel present. Competitor motion still
   ungrounded (CAP-2) so the *bar* isn't pinned.
3. **Movement cadence — 3/5** (=). Facts from ASSESS-1 unchanged (run 138px/s; jump apex
   74px/variable). Competitor cadence still needs footage (CAP-2).
4. **Weapon juice — 3/5** (=). Chunky muzzle flash reads well; Spread fan legible.
   Projectiles are plain squares & cyan (competitors favor warm tracers). Cheap upside.
5. **Enemy density & pacing — 2.5/5** (≈). Live run reached 2 on-screen; competitors run
   3–6. Still reads calmer than the run-and-gun pressure bar. (FID-3.)

---

## OPEN ISSUES (dated)

### FID-4 — Placeholder character sprites — **RESOLVED for hero + grunt + turret**
Real sprites landed and clear the indie-tier character bar (verified by zoom side-by-side
vs Gunslugs 2). Remaining sprite work is split into FID-4b + FID-5 below.

### FID-5 — Environment/background art is the new #1 fidelity gap · sev: MEDIUM-HIGH (for GOAL)
- **Observed:** background = 2 flat parallax mountain bands; ground/platforms are
  procedural fills; `tiles` sprite unauthored (`bench.spritesMissing` includes `tiles`).
  Competitors (Gunslugs 2, Blazing Chrome, Galuga) all carry **detailed tiled grounds +
  multi-layer set-dressing**, which is a large share of their perceived fidelity.
- **Repro:** `bench.spritesMissing` contains `tiles`; look `frames/our-game/state-0200.png`
  vs `frames/gunslugs-2/shot-00.jpg`.
- **Target:** authored ground/wall tileset + ≥2 richer parallax layers (foliage/structure),
  so the stage reads as a *place*, not a gradient. Owner: assets/art loop + game render.

### FID-4b — `player_run` animation disabled (QA-failed) → weak run cadence read · sev: MEDIUM
- **Observed:** `assets.js` notes `player_run` generated but QA-FAILED/disabled; only
  `player_idle` blits, so the run is a static/limited pose. Competitors have multi-frame
  run cycles (a dimension-1 sub-metric).
- **Repro:** `bench.spritesMissing` includes `player_run`; see `assets/QA-NOTES.md`.
- **Target:** a passing ≥6-frame run cycle. Owner: assets/art loop.

### FID-3 — Enemy density below run-and-gun pressure bar · sev: LOW (carried)
Live run reached 2 on-screen; target 3+ concurrent during firefights. Owner: game/level.

### HUD-1 — Weapon indicator is text-only vs competitors' icon/falcon slots · sev: LOW (carried)
Cheap nostalgia win: iconize the weapon (Galuga uses M/S/F falcon icons). Owner: game HUD.

### PRONE-1 — Prone stance (PR#8) not yet cleanly captured · sev: LOW (corpus TODO)
The prone frame coincided with the hit-flash blink, obscuring the pose. Re-capture a clean
prone frame (hold ↓, no contact) next cycle to verify the duck-under-fire silhouette vs
the arcade prone invariant (`teardowns/arcade-contra-1987.md §2`).

---

## Still blocked (unchanged)
- **CAP-2:** competitor MOTION (hit-stop duration, run/jump cadence) — needs footage
  frame-grabs (no yt-dlp) or live web-title capture. Until then dims 2/3 bars stay soft.
