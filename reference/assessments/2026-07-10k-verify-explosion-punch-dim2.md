# Assessment #20 — verify the explosion-punch change (dim 2, hit feedback)

**Date:** 2026-07-10 · **Subject:** `game/index.html` @ `e6a4621` (post `b1fa0df` "explosion
punch — additive flash-pop + shock ring + bigger fireball on kills/boss-death") · **Native:**
480×270 · **Method:** served the CURRENT committed build, ran the deterministic headless
showcase, swept frame-counts across a firefight kill window to catch the transient FX, and
**looked** — then compared side-by-side against the corpus's explosion reference. Evidence:
`frames/our-game-explosion/` + `frames/blazing-chrome-2019/motion/firefight-explosion-dashring-~85s.png`.

**Why this cycle:** my SCORECARD's dim-2 (3.5) named "bigger explosion/particle density" as the
open headroom. A build change (`b1fa0df`) explicitly targets exactly that. My job is to
re-ground the current build against the corpus as it changes — so I verified it BY LOOKING
rather than trusting the commit message.

---

## FACT — the kill explosion (looked)
Kill lands between frame **324** (21 enemies alive, no FX) and **328** (20 alive). At **328**
(`kill-flashpop-f328.png`): a bright **white-cored additive flash-pop + orange fireball +
starburst**, with a muzzle/tracer trail leading into it. At **332** (`kill-shockring-f332.png`,
+4 frames): the flash has faded and an **expanding shock-ring** streak + fireball remnant
remain — so it's a **multi-frame** burst, not a single-frame overlay.

**Engine FACTS (window.__bench) corroborate:** the punch is backed by real state, not a decal —
at the scripted death punch (f1720) `trauma=1.0, hitStop=9, particles=54, fx=1`; `explosion` +
`muzzle` sprites both loaded; `fxSpawned` climbs across the run. Screen-shake + hit-stop +
particle burst are all live.

## Direct comparison vs the bar (JUDGE BY LOOKING)
- **OURS:** a strong, legible **single burst** — flash-pop → shock-ring → fireball. Punchy and
  readable at native res.
- **Blazing Chrome** (`firefight-explosion-dashring-~85s.png`): a denser **multi-puff billowing
  cluster** — many overlapping orange fireballs forming a big mass — plus a white dash-ring.

**Verdict:** the explosion-punch change is REAL and lifts per-hit juice to the **popular-
competitor bar**. The remaining gap to the pinnacle is **particle DENSITY** (BC's multi-puff
cluster vs our single puff), which stays as the explicit stretch headroom — not a defect.

## Boss-death fireball — honest gap (REPORT, don't fake)
`b1fa0df` also adds a "bigger fireball on **boss-death**." That path is **not reachable in this
deterministic showcase**: the scripted player dies to the boss (~f1720 → `gameover`, 9 enemies
still alive) BEFORE the boss is killed. So the boss-death fireball is **code-present but
un-captured here** — I did NOT witness it, and I do not claim it visually. Grounding rests on
the grunt-kill explosion (same flash-pop/ring/fireball FX). If a boss-kill showcase timeline is
added, capture + confirm the bigger boss fireball directly. (Filed below as EXPL-1, low.)

## Scores / gate
- **Dimension 2 (hit feedback & hit-stop): 3.5 → 4.0** — flash-pop + shock ring + fireball, on
  top of existing hit-stop/trauma-shake/muzzle/i-frame-blink, now reads at the competitor bar.
  Headroom narrows to **multi-puff explosion DENSITY** (pinnacle stretch).

## Open issues
- **EXPL-1 (low, other-loop/QA)** — boss-death "bigger fireball" is un-witnessed: the showcase
  player dies before the boss. Add a boss-kill showcase beat to make it capturable. Not a
  fidelity defect; a capture-coverage gap. Repro: `capture-our-game.mjs --frames 1560..1800` →
  `status` reaches `gameover` (player death) with 9 enemies alive, boss never dies.
- Carried low/cosmetic: BOSS-2, TOUCH-2, LEAP-1, HUD-1. No medium+ fidelity defects.
