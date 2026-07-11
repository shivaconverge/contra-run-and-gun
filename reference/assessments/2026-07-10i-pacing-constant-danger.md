# Assessment #18 — arcade "constant danger" pacing (dim 5) + adjudicate feedback OI-1

**Date:** 2026-07-10 · **Subject:** `game/index.html` @ `06ba819` · **Native:** 480×270 ·
**Method:** ran the live build; drove a **non-firing forward run** (hold ArrowRight, NO fire,
NO jump — exactly root.E's `feedback/drive.mjs` DIE-stage scenario) and polled `window.__game`
lives/status every 400ms; then **looked** at a mid-run frame. Evidence:
`frames/our-game-pacing/nofire-run-danger.png` + the trace below.

New angle: my earlier density assessments (ASSESS-4/10) used the *firing* showcase. This tests
the arcade **"constant danger / one-hit tension"** invariant from the harder angle — does the
early level threaten a player who *doesn't* shoot? — prompted by a real observation in
`feedback/FINDINGS.md` OI-1.

---

## FACT — non-firing runner dies fast (arcade pressure confirmed)
Live trace (arcade mode, 3 lives, holding right, no fire):
`life lost @1.6s (x=221) · @4.0s (x=246) · @8.8s (x=708) · GAME OVER @11.6s`.
Each death respawns the player back near spawn, and they're killed again pushing forward — a
repeating gauntlet. **Looked** (`nofire-run-danger.png`, ~1.3s): the hero is already among red
grunts + a platform turret, running straight into the enemy stream.

**Verdict:** OUR early level delivers the arcade **constant-danger** pacing — a non-firing
runner loses a life within ~1.6s and is fully game-over within ~11.6s. This **grounds
dimension 5 (enemy density & pacing)** on the one-hit-tension axis from the non-firing angle
(not just "3–5 enemies on screen"): the level *threatens*, not just *populates*. Confirms the
SCORECARD density score (4.0) and the arcade run-and-gun "always in danger" invariant.

## Adjudication of feedback/FINDINGS.md OI-1 (low)
OI-1 reported that during root.E's DIE drive the player did **not** reach `gameover` in ~10s of
walking right unarmed (they force-set gameover, `forcedDeath:true`), raising a possible pacing
concern. **Grounded:** the concern is a **drive-window artifact**, not a density gap. My run
shows the player *is* being killed throughout (lives 3→2→1→0 at 1.6/4.0/8.8s); the FINAL
game-over just lands at ~11.6s — a bit past root.E's 10s window. root.E themselves flagged it
as "not claimed as an engine bug" and it does not affect their (creator-approval) SPEC. So:
**no pacing defect** — the early level's danger is arcade-appropriate. (Note: root.E's
`feedback/` work is a creator-approval *feedback panel* — a product-UI concern outside the
fidelity/feel corpus; only OI-1 intersected my domain, and it's resolved as no-gap.)

## Scores / gate
- **Enemy density & pacing — holds at 4.0**, now grounded on the *threat/danger* axis (not
  just on-screen count). No change; stronger basis.

## Open issues
- None new. Carried low/cosmetic: BOSS-2, TOUCH-2, LEAP-1, HUD-1. No medium+ fidelity defects.
