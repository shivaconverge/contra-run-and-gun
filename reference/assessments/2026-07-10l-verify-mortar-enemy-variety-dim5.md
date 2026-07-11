# Assessment #21 — verify the Mortar (4th enemy type, dim 5 variety)

**Date:** 2026-07-10 · **Subject:** `game/index.html` @ current HEAD (post `592be76` "widen
enemy set — Mortar arcing area-denial lob") · **Native:** 480×270 · **Method:** served the
CURRENT committed build, ran the deterministic headless showcase, swept the frame window where
the player traverses the mortar platform (player x ≈929→1122), **probed exact on-screen enemy
positions** (window.__game.enemies − camera.x), and **looked**. Evidence:
`frames/our-game-mortar/` (mortar-centered-f540 / mortar-vs-turret-f600 / arc-shell-inflight / telegraph-and-arc).

> **⚠ CORRECTION (added 2026-07-10, same day):** my first pass mislabeled the on-screen unit.
> I called the **magenta upward-angled** emplacement "the Mortar." That is WRONG — magenta
> `#d08bff` is the **Turret (Sentry)** at x=1245. The actual **Mortar** is `#b98a4a` **olive-brass**,
> squat 20×12, at x=1040 (center-screen). Caught by reading `render.js:421` (mortar's own draw
> path) + `config.js` colors and **probing exact screen-x** (`tools/mortar-probe.mjs`): at frame
> 540 the mortar is at screenX 233 (center) while the magenta turret is at screenX 438 (right edge).
> The BEHAVIORAL evidence below (parabolic lob, telegraph, enemiesStart 23→24) was all correct;
> only the emplacement's identity-in-frame was wrong. Fixed throughout. This is why identity is
> now grounded on code+color FACTS, not a look-guess at a small dark sprite.

**Why this cycle:** a new fidelity-relevant change landed in my domain (dim-5, enemy density &
pacing) — a 4th non-boss enemy. My SCORECARD still said "3 enemy types." My job is to re-ground
the live build against the corpus as it changes, BY LOOKING, not by trusting the commit.

---

## FACT (computed) — the set widened
`enemiesStart` in the live bench went **23 → 24** — the added unit is the Mortar. Spawn is
`level1.js {type:'mortar', x:1040, y:178}` on the 1000-platform; `enemy.js kind==='mortar'`
counts down `TELEGRAPH_FRAMES=11`, then `_lobShell()` a **deterministic parabolic** shell at the
player's ground position (gravity arc, no RNG — replay stays byte-identical).

## Identity — a distinct entity (grounded on FACTS, then looked at)
- **Distinct kind (code+color FACT):** `config.js` mortar is its own def — `color #b98a4a`
  (olive-brass), `w20 h12`, `fireEvery150`, `shellVy4.8`+`shellGravity0.16` (a parabola);
  `render.js:421` gives it its own draw ("squat olive-brass emplacement + stubby barrel angled UP"),
  separate from the turret's dome. It is NOT a re-skinned turret.
- **Correctly located (probe FACT, mortar-centered-f540.png):** at frame 540 the mortar sits at
  screenX 233 (dead center) on the mid grass platform — a small squat olive unit with a short
  stub barrel. (The magenta unit at the right edge is the Turret, screenX 438.)
- **Behavior (arc-shell-inflight.png):** the shell travels a **descending diagonal / parabolic**
  path through the upper screen — visibly a different trajectory from the flat horizontal
  machine-gun tracers. The "arcing area-denial lob" is real, not a re-skinned straight shot.
- **Fairness (telegraph-and-arc.png):** a telegraph precedes the lob (the 11-frame wind-up),
  so the threat is a "reposition to dodge" tell, not an unreadable insta-hit — the arcade-fair
  telegraph convention my teardowns credit in the competitor set.

## Why it matters (dim-5) — a new threat AXIS, not just a skin
The roster is now **ground-Grunt (approach) · fixed-Turret (horizontal suppression) · aerial-Drone
(strafe) · area-denial-Mortar (arcing lob) + two-phase boss**. The Mortar adds the one axis the
other three lacked: **denying ground space** and forcing the player to keep moving. That is a
genuine variety/pacing gain toward the competitor bar (my teardowns note the tier runs ~5–6 enemy
types + hazards).

## Scores / gate
- **Dimension 5 (enemy density & pacing): HOLDS at 4.0** — concurrent on-screen density is
  unchanged (~3–5), so I do NOT inflate the number. But the score now rests on a **stronger
  basis**: a 4-type roster spanning four distinct threat axes narrows the Huntdown 5–6-type
  headroom. Honest call: **variety up, raw density flat → same score, firmer footing.**

## Open issues
- **MORTAR-VIS-1 (low, cosmetic → art loop):** at native 480×270 the olive-brass mortar (small
  20×12, dark on the night-jungle bg) is noticeably LESS legible / pops off the background less
  than the magenta turret — it took a code+coordinate probe to identify with confidence, which is
  a fair proxy for "a player may not register it as a distinct threat at a glance." A brighter rim
  / a touch more contrast on the emplacement (or a clearer barrel tell) would improve read. Not a
  defect — the behavior is correct and telegraphed; a readability polish nit. Repro: look
  `frames/our-game-mortar/mortar-centered-f540.png` at screenX≈233.
- Carried low/cosmetic: EXPL-1 (boss-death fireball un-witnessed), BOSS-2, TOUCH-2, LEAP-1, HUD-1.
  No medium+ fidelity defects. Remaining dim-5 headroom (Huntdown 5–6 types + hazards) is stretch.
