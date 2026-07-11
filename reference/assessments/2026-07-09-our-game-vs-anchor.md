# Fidelity/Feel Assessment #1 — OUR game vs. arcade Contra anchor

> **ADDENDUM 2026-07-09 (post competitor-capture cycle):** two things below are now
> superseded — read them as historical. (1) **FID-1 is RESOLVED:** the game adopted
> **one-hit-death** (PR#5, citing this corpus); the `maxHp=4` health bar this assessment
> flagged no longer exists. (2) **Frames re-captured:** `frames/our-game/` now holds the
> one-hit-death build (`state-0001/0120/0300/0480.png`, LIVES-only HUD, bench has no
> `playerHp`); the `state-0060/0180/0320` filenames cited below are the old build. The
> rubric scores for dims 1/4/5 remain broadly valid but should be re-run as pixel
> side-by-sides vs the new competitor stills (`teardowns/competitors-visual-bar.md`).

**Date:** 2026-07-09 · **Subject:** loop-root-B `game/index.html` (vertical slice) ·
**Native res:** 480×270 (confirmed by parent) · **Seed:** 1234 (deterministic headless)

**Method (grounded, not read-from-code):** served `game/` on a static server, drove the
deterministic headless harness (`?headless=1&frames=N&seed=1234`) at 5 sim states, read
each canvas at **native 480×270 pixels** via `toDataURL` (tool:
`reference/tools/capture-our-game.mjs`), then **looked at every frame** and cross-checked
`window.__bench` + `game/data/config.js`. Frames + bench sidecars:
`reference/frames/our-game/` (`state-0001/0060/0180/0320/0480.png`).

Judged against `reference/teardowns/arcade-contra-1987.md` (nostalgic-feel anchor) and
the 5-dimension rubric in `reference/manifest.json`. **Caveat (honest):** the "beats the
modern competition" axis is only partially grounded — competitor gameplay frames are not
yet captured (OPEN ISSUE CAP-1), so competitor comparisons below are qualitative/from
teardown, not pixel side-by-sides yet.

---

## What the frames actually show (observed)

- **state-0001 (spawn):** hero at far left firing right with a bright **yellow muzzle
  flash**; a red **Grunt** (placeholder red rounded square) approaching. HUD: `SCORE`,
  `LIVES ▮▮▮` (3), weapon `RIFLE`, and **4 red health pips** top-right.
- **state-0180 (jump+fire):** hero mid-run; a diagonal arc of yellow rifle rounds trails
  up-right (fired during a showcase jump) — reads as an ~40%-screen-tall arc.
- **state-0320 (spread):** weapon `SPREAD`; a **purple Sentry turret** on a platform with
  a purple telegraph arc; cyan spread pellets fanning.
- **state-0480 (spread firefight):** clear **cyan 5-pellet Spread fan** + yellow muzzle
  flash; a **red death-particle burst** on the right where a Grunt died. Parallax
  mountains (2 layers) + floating platforms + grassy ground edge throughout.

## Computed cadence facts (from `config.js`, sim 60 Hz — FACTS not opinion)

| metric | value | note |
|--------|-------|------|
| run speed | 2.3 px/step = **138 px/s** | crosses the 480px view in **3.48 s** |
| jump apex (full) | **74 px** = 27.4% of screen = **3.7× player height** | tall |
| jump apex time | 287 ms; airtime ~573 ms | |
| jump height range | **15–74 px (VARIABLE)** | coyote+buffer+**jump-cut** → not a fixed arc |
| rifle fire rate | 8.57 shots/s | |
| spread | 5 bursts/s × 5 = **25 pellets/s**, 0.28 rad cone | |

---

## Rubric scores (0–5; evidence-backed, this build only)

1. **Sprite & animation quality — 1.5/5.** Silhouettes are *readable* (blue hero distinct
   from teal bg; enemies color-coded), which is the load-bearing art job. But everything
   is a **procedural placeholder** (hero = blocky figure, Grunt = red square, Sentry =
   purple blob). No detailed run/somersault frames. Far below the Blazing Chrome /
   Metal Slug fidelity bar — expected: art hasn't landed (`game/README.md` "Art
   assumption"). This is the #1 gap to close for "matches/exceeds fidelity."
2. **Hit feedback & hit-stop — 3/5.** Real and present: `bench` shows `hitStop`/`trauma`;
   config has hit-stop 3/7/9 frames, trauma-based shake (max 9px), hit-flash, death
   bursts (seen in state-0480). Solid kernel; can't judge freeze *duration feel* from
   stills — needs a motion capture pass (pptr) to compare hit-stop snap vs Huntdown.
3. **Movement cadence — 3/5.** Run 138 px/s reads brisk and Contra-appropriate. **Jump
   is the concern:** 74px/27%-screen apex is on the *floaty/tall* side, and it is
   **variable-height** (jump-cut) — a modern-platformer feel that **diverges from the
   arcade fixed-arc somersault** invariant. Defensible as modern polish, but flag it.
4. **Weapon juice — 3/5.** Muzzle flash ✓, Spread 5-pellet fan ✓ (legible), recoil +
   per-shot trauma ✓, death particles ✓. Genuinely juicy for a slice. Gaps: projectiles
   are plain squares (no tracer/impact-spark art), Spread is cyan (a stylistic choice,
   not the classic warm palette) — minor.
5. **Enemy density & pacing — 2.5/5.** `bench`: 12 spawns thinning 12→7 over 480 frames,
   but typically **1 enemy on-screen at a time** in these frames — lighter than the
   arcade Stage-1 "steady trickle of runners + aimed pressure." Reads calm, not tense.
   Add cadence/overlap to hit the run-and-gun pressure invariant.

---

## HARD nostalgic-invariant check (vs arcade anchor) — pass/fail

| invariant (anchor) | status | evidence |
|--------------------|--------|----------|
| 8-way aim incl. diagonals | ✅ present | config aim + up-arc trail; README "8-way Contra aiming" |
| Somersault/airborne fire | ✅ present | state-0180 airborne rifle arc |
| Single-slot weapon, swap | ✅ present | RIFLE→SPREAD HUD; `C` swap |
| Spread = 5-way fan | ✅ present | state-0480 5-pellet fan (spread.pellets=5) |
| Run-right pacing | ✅ present | x 40→962 over the run |
| **One-hit death (no health bar)** | ❌ **DIVERGES** | `PLAYER.maxHp=4`, 66 i-frames, 4 HUD pips |
| Fixed-arc jump (not variable) | ⚠️ diverges | jump-cut → variable 15–74px height |
| Weapon lost on death | ✅ (per selftest respawn resets) | selftest death→respawn |

The **soul-level identity** (aim, spread fantasy, run-right, airborne fire) is intact.
Two deviations from the anchor are recorded below — they are *design tensions*
(nostalgia vs. modern accessibility), for loop-root-B / parent to rule on, **not** things
this corpus loop can or should silently accept or fix (I don't own `game/`).

---

## OPEN ISSUES (dated; report-don't-work-around)

### FID-1 — Health bar (maxHp=4) diverges from arcade one-hit-death invariant · sev: MEDIUM
- **Observed:** `game/data/config.js` `PLAYER.maxHp = 4`, `iFrames = 66`; HUD shows 4 red
  pips. Arcade anchor HARD invariant is **one-hit death, no health bar**.
- **Repro:** `node reference/tools/capture-our-game.mjs --frames "1"` → `bench.playerHp=4`.
- **Why it matters:** one-hit tension is *the* defining Contra feel; a 4-hit buffer
  fundamentally changes per-screen risk reading. Modern Contra-likes (Galuga) *do* add
  health for accessibility, so this may be an intentional concession — **needs a ruling**,
  not a silent pass. If kept, document it as a deliberate modern-feel divergence.
- **Owner:** loop-root-B (game) / parent decision. Corpus records the gap.

### FID-2 — Variable-height (jump-cut) jump diverges from arcade fixed-arc somersault · sev: LOW
- **Observed:** `jumpCut=0.45` → apex varies 15–74px with button-hold; arcade jump is a
  fixed parabola.
- **Repro:** config values; motion-verify via pptr capture of live jumps (next pass).
- **Note:** widely-loved modern feel; likely *fine*, but it is a measured deviation from
  the anchor and its floatiness (27% screen apex) should be tuned against real Contra
  footage once CAP-1 lands.

### FID-3 — Low on-screen enemy density vs arcade run-and-gun pressure · sev: LOW
- **Observed:** typically 1 enemy visible; arcade Stage-1 keeps a steady trickle.
- **Repro:** `bench.enemiesAlive` across states (12→7) with sparse on-screen overlap.
- **Note:** pacing/tuning, owned by game/level loops. Corpus flags the feel gap.

### FID-4 — Sprite fidelity is placeholder (blocks) — the primary fidelity gap · sev: HIGH (for GOAL, not for slice)
- **Observed:** hero/enemy/turret are procedural placeholders.
- **Note:** expected (art pending); this is the biggest lever for "matches/exceeds visual
  fidelity." Tracked so it is not mistaken for shippable art.

---

## Next capture pass (feeds future assessments)
- **CAP-1:** capture real competitor gameplay frames (Blazing Chrome, Galuga, Metal Slug,
  Gunslugs, Huntdown, web HTML5 set) so scores 1/4/5 become **pixel side-by-sides**, not
  qualitative-from-teardown.
- **Motion pass:** use `capture-frames.mjs --mode pptr` on the live game to judge hit-stop
  snap and jump feel *in motion* (stills undersell dimensions 2 & 3).
