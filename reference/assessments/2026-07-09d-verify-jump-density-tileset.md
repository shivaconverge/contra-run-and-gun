# Assessment #4 — verify FID-2 (jump), FID-3 (density), FID-5 (tileset) responses

**Date:** 2026-07-09 · **Subject:** `game/index.html` @ `5d439f3` · **Native:** 480×270 ·
**Seed:** 1234 · **Method:** re-captured 5 deterministic states + a 3× ground zoom crop;
read config/bench facts; **looked** at every frame. Evidence: `frames/our-game/state-*.png`,
`bench-*.json`.

Three open issues this corpus filed got build responses (PR#17 density, PR#20 jump, PR#21
tileset). This assessment **verifies each by looking + facts**, closing the loops.

---

## FID-2 — fixed-arc jump → RESOLVED
- **Fact:** `config.js` `PHYSICS.jumpCutEnabled: false` (data-gated, reversible), `jumpVel`
  unchanged at 8.6. `selftest.js` asserts **tap-apex == hold-apex** (28/28).
- **Verdict:** the variable jump-cut this corpus flagged (ASSESS-1 FID-2) is OFF by default →
  the jump is now a **fixed parabola**, matching arcade §2 (`arcade-contra-1987.md`). The
  reversible flag keeps a modern variable-jump option without breaking the nostalgic default.
  **RESOLVED.**

## FID-3 — enemy density/pacing → SUBSTANTIALLY ADDRESSED (LOW)
- **Fact:** spawn count **12 → 20** (`bench.enemiesStart`), thinning 20→14 over 520 frames.
- **Looked:** firefight states now show **3–5 concurrent threats** — ground grunts + **turrets
  on platforms** (vertical threat variety) + multiple bullet streams (`state-0240`, `-0360`).
  Previously ~1–2 on screen (ASSESS-2). Now reads as run-and-gun **pressure**, not a calm
  stroll — at the arcade Stage-1 "steady trickle + aimed pressure" bar.
- **Verdict:** the core FID-3 gap is closed. Still below the Huntdown ceiling (5–6 + hazards),
  but that's a stretch target, not the near-term bar. **Downgrade MEDIUM→LOW.**

## FID-5 — ground tileset refinement → FURTHER CLOSED (LOW)
- **Fact:** a **real 16px ground tileset is now blitted** (`drawGround`/`drawPlatform`,
  PR#21/8907c9a) — the engine gained the authored-tileset path (my teardown's TIER-2), not
  just procedural fills.
- **Looked (3× ground zoom vs the ASSESS-3 asks + Gunslugs bar):**
  - **Denser dirt fill — RESOLVED.** Dirt is now dense multi-tone speckle with tan/yellow
    clods (dirt2 derived to kill the repeating-clod motif). Matches the Gunslugs fill density.
  - **Grass cap — improved.** Proper grass-blade cap row + platforms tiled to match (material
    coherence). **Partial on "chunky bevel":** it reads as a textured grassy *surface*, but
    the strong highlight-top + dark-under-lip that makes Gunslugs' cap read as *raised chunky
    tiles* is only modestly present.
- **Verdict:** environment now reads as a tiled night-jungle **place** competitive with the
  indie bar. **Downgrade LOW-MEDIUM→LOW.** Residual (optional polish): a stronger cap
  highlight/under-lip bevel for extra "chunk."

## Scores (vs ASSESS-3)
- **Sprite & animation quality — 3.5 → 3.5** (env tiling holds; **FID-4b run-cycle still
  disabled** — now the top character gap).
- **Enemy density & pacing — 2.5 → 3.5** (FID-3 response).
- **Movement cadence — 3 → 3.5** (fixed-arc jump is more Contra-authentic; precise vs-
  competitor cadence still CAP-2 residual).

## Open issues after this assessment
- **FID-4b (player_run disabled)** — unchanged; the highest-value remaining character gap.
- **FID-5** LOW — optional cap-bevel polish only.
- **CAP-2** — dim-3 precise cadence residual (dim-2 feedback grounded via trailers).
- **HUD-1** (text weapon vs falcon icon), **PRONE-1** (clean prone capture) — carried, low.
