# Assessment #9 — OUR firefight at a MATCHED beat vs the Blazing Chrome ref (grounds FIDHARNESS-1)

**Date:** 2026-07-09 · **Subject:** `game/index.html` (current) · **Native:** 480×270 ·
**Method:** the playtest fidelity harness pairs a CALM OURS mid-run against a PEAK-explosion
REF (FIDHARNESS-1). To ground what the gap actually is at a FAIR beat, I captured OURS across
the level and picked the densest by bench (`enemiesAlive` + `particles`): **state-0340**
(18 enemies, **24 particles = an active explosion**, bullets in flight), then **looked** at it
beside `frames/blazing-chrome-2019/shot-00.jpg` (BC firefight). Frames:
`frames/our-game-firefight/` (recommended pairing frame = `state-0340.png`).

---

## What OURS looks like at a matched firefight beat (looked)
`state-0340`: hero firing a rifle stream; **an orange explosion** on the right (enemy just
died); **two purple platform turrets + a red grunt** (3 concurrent threats); muzzle spray +
tracers; full night-jungle atmosphere (moon, stars, fireflies, layered hills, treeline,
tiled ground). It reads as a **real, lively firefight** — density + juice + atmosphere.

## Verdict vs the bar (by looking, not metrics)
- **vs the indie/mobile tier (the goal's confirmed bar):** OURS **meets/exceeds** it. This
  matched beat has *more* on screen than the Gunslugs 2 reference frames (1 hero + boss);
  ours has 3 threats + an explosion + a richer atmospheric background.
- **vs the Blazing Chrome PINNACLE:** the real residual is **explosion/particle density +
  background-detail density** — BC's detonation is a huge multi-cluster with debris + a denser
  biomech backdrop; OUR explosion is a single modest fireball on a cleaner bg. This is the
  **known, confirmed-STRETCH headroom** (parent: the goal's bar is the indie/mobile tier), not
  a defect.

## Consequence for FIDHARNESS-1 (the CV metric gap)
The playtest firefight CV deltas (+545/+837 unique colors) **overstate the real gap**: most of
it was the beat-mismatch (calm OURS vs peak REF). At this matched beat OURS is at-bar; the
color/edge delta that remains maps to the *stretch* pinnacle-density headroom — a **pre-filter
signal**, not a fidelity failure. The corpus now supplies the matched OURS frame
(`state-0340.png`) so the harness can pair fairly.

## No score change
This confirms (not changes) the SCORECARD: hit-feedback/juice **3.5**, density **3.75**,
whole-frame at-bar for the indie/mobile tier. FIDHARNESS-1 stays **PARTIAL** until the playtest
harness adopts the matched frame (owner: playtest loop) — this assessment removes the ambiguity
about what the gap IS.
