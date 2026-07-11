# Teardown — Movement Cadence (dimension 3) grounding

**Role:** dimension 3 (movement cadence: run speed, jump apex, airtime, arc shape) was the
last corpus dimension without a competitor/anchor source. This teardown grounds it —
honestly, in **scale-invariant units** (time in seconds; distances in character-heights),
which ARE measurable from footage regardless of zoom/scroll.

---

## OUR game — cadence measured exactly (from config, sim 60 Hz)
`PHYSICS`: gravity 0.5, jumpVel 8.6, runSpeed 2.3 px/step, jumpCutEnabled=false (fixed arc).

| metric | raw | scale-invariant |
|--------|-----|-----------------|
| jump airtime | 34.4 steps | **0.573 s** |
| jump apex | 74 px | **≈2.5 sprite-heights** (hero sprite ≈29 px) |
| jump arc | fixed parabola (jump-cut off) | **fixed-arc** (arcade §2) — tap-apex==hold-apex (selftest) |
| run speed | 138 px/s | **≈4.8 sprite-heights/s** |

## The cadence ANCHOR is ARCADE Contra, not the modern competitors
"Nostalgic feel" pins cadence to the 1987 arcade original, so that is the right reference.
**New this cycle:** real arcade Stage-1 gameplay frames are now in the corpus —
`frames/arcade-contra-1987/stage1/` (from archive.org `Contraarcade1cc`, `contra1cc.mp4`,
480×360 ~30 fps; see that dir's `capture.json`). Previously the arcade teardown was
text-only (Wikipedia); it now has real imagery.

**Observed from the arcade footage (grounded by looking):** brisk **run-right** pacing;
**8-way diagonal aim** (clear diagonal bullet streams); **fixed-arc somersault jumps** that
clear ledges/water; a **steady trickle** of enemies (not bullet-hell). OUR fixed-arc,
~0.57 s, ~2.5-height jump + brisk run reads as **arcade-plausible** on these axes.

## Honest precision limit (REPORT, don't fake)
A **pixel-precise** arcade apex/airtime number is NOT pinned, and — after a thorough
second attempt (2026-07-09, ASSESS-6) — is judged **not reliably extractable from this
footage**. Reason (grounded, not lazy): arcade Contra **Stage-1 is terraced** — the hero
hops between multi-level jungle ledges, so the "ground" reference changes frame-to-frame
and a rise onto a higher ledge is indistinguishable from a jump apex. Combined with the
tiny hero at 30 fps, isolating a clean flat-ground rise→apex→land is ambiguous. Picking
frames anyway would be **fabricated precision** — so I did not. Attempted windows: 33–39 s
(terraced bridge), 40–46 s, 52–55 s.
- **What WOULD pin it:** a flat-ground jump on an unambiguous single-level stretch (rarer in
  Stage 1), or a MAME run with a debug/RAM position readout; then
  **airtime = (f_land − f_leave)/fps**, **apex-in-heights = (max feet-rise px)/(hero height px)**.
- **Practical stance:** this residual is a *refinement*, not a blocker. OUR cadence is
  measured-exact and reads arcade-plausible against the Stage-1 frames (fixed-arc jump,
  brisk run, 8-way aim). Treat OUR values as the working spec unless a flat-ground arcade
  jump is later isolated.

## Competitor TRAILERS cannot ground cadence (recorded finding)
Steam trailers for Blazing Chrome / Huntdown / Galuga are **boss-fight + title-card
montages** (verified via contact sheets this cycle), with camera-follow scroll and co-op
special-move VFX — **no clean isolated side-scroll jump** to measure. So dim-3 is anchored
to the **arcade** (above), not the trailers. Modern-competitor cadence would need a
same-scale **in-engine** capture (owning the build) — out of reach for third-party titles;
the arcade anchor is the more on-point reference for the nostalgic-feel goal anyway.

## Verdict (dim-3)
- **OUR cadence: measured exactly** (0.573 s / 2.5-height / fixed-arc / 138 px/s).
- **Arcade anchor: now in the corpus** (real Stage-1 frames) and qualitatively matched
  (fixed-arc jump, 8-way aim, brisk run, steady trickle).
- **Residual:** the single pixel-precise arcade apex/airtime number (repro above). This is
  a *refinement*, not a blocker — OUR cadence is grounded and arcade-plausible.
