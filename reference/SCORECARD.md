# Fidelity & Feel SCORECARD — OUR game vs the bar

**Purpose:** the consolidated "fidelity rubric scored + feel check vs Contra reference" that
the TEST/PLAYTEST GATE needs (strategy `stage_test_gate`). Rolls up 20 by-looking assessments
(`assessments/`) + a fresh current-build capture into one at-a-glance verdict. **Scores are
by-looking judgments against this corpus's real frames — CV metrics are pre-filters only.**

**Build:** `game/index.html` @ `e6a4621` · native 480×270 · dim-2 re-grounded this cycle by
capturing + looking at the CURRENT build's kill explosion (`frames/our-game-explosion/`,
ASSESS-20); other dims verified prior cycles (`frames/our-game-scorecard/`, `frames/our-game-boss/`,
playtest `fidelity/` sheets). Scale: 0–5, where **3 = matches the indie/mobile bar (Gunslugs 2)**,
**4 = clearly at the popular-competitor bar**, **5 = the pinnacle (Blazing Chrome / Metal Slug)**.

---

## The 5 dimensions

| # | Dimension | Score | Standing verdict (by looking) |
|---|-----------|-------|-------------------------------|
| 1 | **Sprite & animation quality** | **4.0** | Full sprite set (idle · run 4-beat · leap · prone), Contra-authentic hero + grunt/turret/Sentinel; **meets/exceeds the indie bar** (root.C re-grounded vs Galuga/Gunslugs/Blazing Chrome, PR#47 = meets identity/fidelity bar). Headroom: Metal-Slug-tier per-frame animation density (5). |
| 2 | **Hit feedback & hit-stop** | **4.5** | Hit-stop + trauma screen-shake kernel, muzzle flash, i-frame blink, explosion punch (flash-pop + shock ring), and now a shipped **organic MULTI-LOBE billow** explosion — spark → 2–3-lobe white-hot fireball → flame+smoke breakup → smoke billow (verified by looking at the 6× sprite sheet, ASSESS-22, `frames/our-game-multipuff/`). Above the popular-competitor bar, approaching pinnacle. Remaining stretch: cluster DENSITY/SCALE (Blazing Chrome/Metal Slug run more lobes + stacked bursts) + (optional) the informational feedback layer (damage numbers/combo-text). |
| 3 | **Movement cadence** | **3.5** | Fixed-arc jump (arcade §2; jumpCutEnabled=false), 138 px/s run, 8-way aim, prone duck. Measured-exact + **arcade-plausible** vs real arcade Stage-1 frames. (Residual: one pixel-precise arcade apex number — not reliably extractable from terraced footage; documented, not a blocker.) |
| 4 | **Weapon juice** | **4.0** | Roster Rifle/Spread(S)/Machine(M)/Laser(L)/**Fire(F)** — the **complete arcade M/S/L/F lineage** (ASSESS-10, Fire = corkscrew spiral); each gun a distinct color+shape = legible identity. Headroom: projectile glow/tracer polish. |
| 5 | **Enemy density & pacing** | **4.0** | 24 spawns, 3–5 concurrent threats; **4 non-boss types spanning 4 threat axes** — ground **Grunt** (approach) + fixed **Turret** (horizontal suppression) + aerial **Drone** (strafe) + **Mortar** (telegraphed arcing area-denial lob, ASSESS-21) + two-phase fixed-boss climax (arcade §4). NOW ALSO a **terrain hazard**: a 58px pit-death CHASM before the boss (arcade lethal-fall, witnessed lethal by live drive — ASSESS-23, `frames/our-game-chasm/`). Verified by looking + running. The "+ hazards" headroom is now partly in; remaining stretch: Huntdown-tier 5–6 enemy types. |

**Environment (cross-cutting):** now a **living night-jungle place** — real 16px tileset
(grass-cap + dense dirt), 5-layer parallax + moon, and a twinkling-stars/fireflies/vignette
atmosphere pass (PR#46, verified: hero stays readable). At/above the indie bar; below the
Blazing-Chrome biomech-detail pinnacle.

---

## Nostalgic-feel check vs the arcade anchor (`teardowns/arcade-contra-1987.md`)

| Arcade invariant | Status |
|------------------|--------|
| One-hit death (no health bar) | ✅ ARCADE mode default ("1987 way"); CASUAL (lives5/shield2) is the accessibility hedge |
| 8-way aim incl. diagonals + airborne | ✅ |
| Prone duck (dodge over-fire, hit low) | ✅ (load-bearing vs the boss volley) |
| Fixed-arc jump | ✅ (tap-apex == hold-apex) |
| Single-slot weapon, lost on death | ✅ (pickup replaces; death → rifle) |
| Spread = 5-way fan | ✅ |
| Run-right pacing | ✅ |
| Lethal pits / falls (arcade hazard) | ✅ 58px pit-death chasm before the boss — witnessed lethal by live drive (ASSESS-23) |
| Weapon lineage (M/S/L/F) | ✅ M/S/L/F all present (Fire = corkscrew, ASSESS-10) |
| Fixed-boss climax | ✅ Sentinel — two-phase (HP bar + telegraphed volleys; phase-2 ENRAGE red-alert, ASSESS-11); death = a **multi-blast finale** (ASSESS-24, witnessed via scenario=bosskill) |
| Somersault jump silhouette | ◑ forward-bound leap, not a tuck (LEAP-1) |
| Attract-mode title screen | ✅ "RUN & GUN" over live attract gameplay |

**Feel verdict:** the nostalgic soul is **intact and strong** — the identity invariants are
met; the two ◑'s (Fire gun, somersault) are low/stylistic.

---

## GATE verdict

- **Nostalgic feel (arcade):** **PASS** — arcade HARD invariants met.
- **Fidelity vs today's popular web/Android Contra-likes (the goal's actual bar):**
  **PASS / meets-or-exceeds the indie-mobile tier** (Gunslugs 2, and root.C's grounding vs
  Galuga/Gunslugs/Blazing Chrome). Below the **console pinnacle** (Blazing Chrome / Metal
  Slug) on animation + explosion/particle/bg-detail density — a **stretch**, not required by
  the stated goal ("prefer over today's *popular 2D Contra-likes*", i.e. the web/mobile set).
- **POSITIONING (Contra Returns, the official mobile Contra):** it is **3D-HD + heavy F2P
  touch UI, NOT pixel** (`teardowns/contra-returns-mobile.md`). OURS does not — and should not
  — compete on its 3D spectacle/content volume; OURS wins a **different** player with
  **nostalgic pixel feel + a clean uncluttered arcade HUD + zero-friction instant browser play
  (no download/gacha)**. OUR clean HUD is a genuine advantage vs Returns' cluttered screen. The
  real head-to-head is the **pixel revival tier** (Blazing Chrome/Gunslugs), where OURS is at-bar.
- **POSITIONING (itch.io/CrazyGames HTML5 — the direct browser head-to-head):** the browser
  run-and-gun tier a player actually chooses between skews **minimalist / jam-quality** — e.g.
  GUN N' RUN: stark mono+pink pixel art, blocky chars, no rich environment or parallax
  (`assessments/2026-07-10j-web-html5-competitive-set.md`, `frames/web-html5-competitive-set/`).
  OUR detailed 16-bit night-jungle Contra (real sprite set, 5-layer parallax, M/S/L/F roster,
  3 enemy types + two-phase boss) **EXCEEDS the typical itch/CrazyGames HTML5 run-and-gun** on
  visual fidelity + content — the literal browser win axis. (Sample, not an exhaustive survey.)
- **Web/Android playability (goal criterion): clean PASS.** Fully mobile-browser-playable —
  clean touch controls (D-pad + JUMP/FIRE) + mobile-first layout (canvas fills screen) +
  **touch restart from game-over** ('TAP TO RESTART'), all verified by running (ASSESS-14/15/16;
  the ASSESS-15 restart caveat is now RESOLVED, PR#82). A real advantage vs Contra Returns'
  cluttered touch UI.
- **Overall:** the Stage-1 slice **clears the fidelity + feel gate** for the retro-pixel
  run-and-gun tier, and is **playable on desktop + mobile browsers**. Remaining items are
  low/optional polish or explicit stretch.

## Open items (all LOW / optional / other-loop; none block the gate)
- ~~WEAP-1~~ RESOLVED — Fire(F) corkscrew gun landed; arcade M/S/L/F lineage complete (ASSESS-10).
- **LEAP-1** — somersault vs forward-bound leap. Stylistic.
- **BOSS-1** — substantially addressed (two-phase enrage + distinct enraged sprite, ASSESS-11/12); multi-part set-piece = stretch.
- ~~BOSS-3~~ RESOLVED (ASSESS-17, PR#86) — enrage heat-glow now masked to the sprite; no bounding-box matte, clean boss silhouette (verified by looking). No medium+ fidelity defects now open.
- **BOSS-2** (low) — ENRAGED/BOSS callouts share a center slot (render.js:909/916); latent overlap only, bossCallout normally fades first.
- **HUD-1** — falcon weapon-icon vs text (root.C filed it too, marginal at 16px — deferred).
- ~~explosion PUNCH~~ LANDED (ASSESS-20, `b1fa0df`) — additive flash-pop + shock ring + fireball on kills; dim-2 3.5→4.0. Verified by looking.
- ~~multi-puff explosion DENSITY~~ LANDED (ASSESS-22, `6ea2a2d`) — shipped an organic multi-lobe billow (spark→2–3-lobe fireball→flame/smoke→smoke) via post-pack compositing; dim-2 4.0→4.5. Verified by looking at the 6× sprite sheet. The top pinnacle-headroom item is now substantially closed.
- ~~EXPL-1~~ CLOSED (ASSESS-24, `d6a8146`) — the `scenario=bosskill` beat now makes the boss-death finale witnessable; verified by looking: a **multi-blast** cluster (fx=7, particles=63, trauma 0.867, hitStop 13) — a satisfying climax, the shared multi-lobe FX ×7. This also delivers the "stacked bursts" element at the climax.
- **Pinnacle headroom (remaining)** — explosion cluster DENSITY/SCALE (more lobes + stacked bursts, BC/MS3) + bg-detail density. The multi-lobe STRUCTURE is now in; the remaining gap is scale, a smaller stretch.
- ~~FIDHARNESS-1~~ RESOLVED (ASSESS-10) — playtest now samples matched beats for BOTH boss and
  firefight pairs; CV deltas narrowed (+545→+376 / +837→+668) as predicted.

_Living document — re-score on major build changes. Source of each score: the dated
`assessments/` files + this cycle's capture._
