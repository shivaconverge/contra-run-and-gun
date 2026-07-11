# Assessment #23 — verify the chasm PIT-DEATH hazard (dim 5) + the Mortar real sprite (MORTAR-VIS-1)

**Date:** 2026-07-10 · **Subject:** `game/index.html` @ current HEAD (post `f0c4339` 58px chasm
hazard + `6ca9905` mortar real sprite) · **Native:** 480×270 · **Method:** served the CURRENT
build; captured the chasm region + mortar in the deterministic showcase, **live-drove** the
player off the chasm edge to witness the pit-death mechanic, and zoomed the shipped mortar
sprite. Evidence: `frames/our-game-chasm/`.

**Why this cycle:** two fidelity changes landed in my domain that I had not verified — a new
environmental HAZARD (the exact "+ hazards" dim-5 headroom my SCORECARD names) and a real sprite
for the Mortar (directly addressing MORTAR-VIS-1, the readability nit I filed in ASSESS-21). Both
warrant judge-by-looking + run-the-deliverable, not trust-the-commit.

---

## (1) Chasm pit-death hazard — dim 5 + arcade pit-feel

**FACT (layout):** `level1.js` ground is two segments (`x0 w2220` + `x2278 w122`) = a **58px
chasm at x2220–2278**, just before the boss (x2340); `gravityFloor=268`; a fall past it triggers
`world._onPitFall` (world.js:159 + 305): **lose a life** (arcade one-hit, same as a bullet),
short trauma, respawn onto solid ground to the left.

**By looking (`chasm-before-boss-f1200.png`):** the ground ends under the player (x2209), a dark
GAP, then a bullet-blocking barrier pole + the Sentinel boss arena. Reads clearly as a final pit
you must leap to reach the boss.

**RAN it (behavioral witness, `tools/chasm-drive.mjs`):** positioned the player at the chasm and
drove RIGHT off the edge; the **real engine** computed the outcome — the player fell past the
floor (py 239→**274** > 268) and **LOST A LIFE (3→2)**, then respawned on solid ground (x≈43),
repeatable to 3→2→1. The pit is genuinely **lethal + respawns**, not decorative.
*Honest caveat:* the forced-position set in the drive was racy (player read at x=−12 during the
fall), so this witnesses the **mechanic** (fall past floor → life loss → respawn on ground), not
a pixel-perfect edge-walk; the showcase AI avoids the pit, so a natural in-showcase pit-death
isn't capturable (a capture-coverage note, cf. EXPL-1). **No respawn bug claimed** — respawn
landed cleanly on the left ground.

**Why it matters:** a bottomless-pit failure mode is a **Contra/arcade staple** (the original has
lethal falls) and the literal "+ hazards" item my dim-5 headroom named. The stage now threatens
via **terrain**, not just enemies.

## (2) Mortar real sprite — MORTAR-VIS-1

**FACT:** `game/assets/mortar.png` is now a real **30×23** sprite (was procedural). `mortar-sprite-10x.png`:
an olive-brass **artillery emplacement** — squat armored base + upward-angled cannon barrel +
shading tiers. A genuine dim-1 upgrade over the old rectangle+line-barrel. In-scene
(`mortar-inscene-f540.png`) the raised angled barrel gives it a **distinct silhouette**.

**Verdict — MORTAR-VIS-1 SUBSTANTIALLY RESOLVED:** the real sprite gives the mortar a distinct
raised-barrel artillery silhouette + real shading (no more small dark box). **Residual (very
low):** the olive palette is still only mid-contrast against the night-jungle greens (less pop
than the magenta turret) — an optional art-loop tweak, not a defect.

## Scores / gate
- **Dimension 5 (enemy density & pacing): HOLDS 4.0**, now with an arcade **PIT-DEATH hazard**
  added — a terrain failure mode beyond enemies. Strengthens the pacing basis; adds a nostalgic
  arcade invariant (lethal pits). Not inflated — the hazard broadens the threat model, concurrent
  density is unchanged.
- **Dimension 1 (sprite quality):** the mortar joins the real-sprite roster — **no procedural
  placeholder enemies remain**.

## Open issues
- ~~MORTAR-VIS-1~~ SUBSTANTIALLY RESOLVED (real artillery sprite, distinct silhouette); residual =
  olive/night-jungle palette contrast, very low, art-loop-optional.
- Carried low/cosmetic: EXPL-1, BOSS-2, TOUCH-2, LEAP-1, HUD-1. No medium+ fidelity defects.
