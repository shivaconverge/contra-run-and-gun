# Assessment #12 — distinct ENRAGED boss sprite (BOSS-1) + a matte-box defect (BOSS-3)

**Date:** 2026-07-10 · **Subject:** `game/index.html` @ `a92423b` · **Native:** 480×270 ·
**Method:** ran live; drove the Sentinel to phase-2 (`boss.enraged=true`, hp<enrageAt) via
real game state, **waited for the camera to lerp to the arena** (a earlier capture caught a
mid-lerp frame — corrected), then **looked** + 5× zoom. Evidence:
`frames/our-game-boss-enrage/enraged-sprite-distinct.png`.

Verifies PR#63 (distinct `boss_enraged` sprite) which upgrades the enrage I assessed at #11.

---

## The distinct enraged sprite — a real spectacle upgrade (BOSS-1 further addressed)
Looked (5× zoom): phase-2 now swaps in a **distinct `boss_enraged` sprite** — a **scorched
copper bipedal mech** with **glowing pink/red vents + a bright red weak-point core**, a
**flaring red-orange belly cannon**, a large cannon arm, and a horned head. It is a genuine
**visual transformation** from the grey base Sentinel (ASSESS-5/11), not just a red tint. The
boss now *becomes* something scarier in phase 2 — a strong step toward the competitor
boss-spectacle bar. BOSS-1 continues to close.

## DEFECT found by looking — BOSS-3 (MEDIUM): dark rectangular matte around the sprite
The enraged sprite renders inside a **hard-edged DARK RECTANGULAR box** — a
non-transparent (or semi-transparent dark) background matte that shows as a rectangle around
the mech, breaking its silhouette against the night-jungle. A CV metric would never flag this;
**by looking it's obvious and it noticeably cheapens the climactic boss.**
- **Likely cause:** the `boss_enraged.png` was exported with a dark background instead of
  transparent (or the swap draws a backing rect). It reads as a **bounding-box**, not a soft
  aura (an intentional enrage aura would be radial/soft, not a hard rectangle).
- **Severity MEDIUM** — it's the Stage-1 climax boss; the box undercuts the otherwise-strong
  new sprite. Not a crash/blocker.
- **Repro:** trigger enrage, look at the boss — `frames/our-game-boss-enrage/enraged-sprite-distinct.png`.
- **Fix:** re-export `boss_enraged.png` with a transparent background (or drop the backing
  rect in the drawEnemy swap). Owner: assets (root.C) / render (root.B).

## Not covered this cycle (honest)
The enemy fire TELEGRAPH (PR#62, ~0.18s turret/flyer muzzle wind-up) — a fairness/readability
feel feature — was not verified this cycle (timing-sensitive capture). Deferred to next.

## Scores
- **Boss spectacle** improves within the score (distinct enraged sprite), but **BOSS-3
  offsets it** until the matte box is fixed — net no numeric change; SCORECARD boss row updated.

## Open issues after this assessment
- **BOSS-3 (MEDIUM)** — dark rectangular matte around the enraged boss sprite (transparency).
- **BOSS-2 (low)** — ENRAGED/BOSS callout share a center slot (overlap only if concurrent;
  bossCallout normally fades first — parent-confirmed).
- **BOSS-1** — stretch (multi-part set-piece). · LEAP-1, HUD-1 low.
- Enemy fire telegraph — verify next cycle.
