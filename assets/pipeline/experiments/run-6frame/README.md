# Experiment: 6-frame run cycle (dim-1 lever, art de-risked)

**Date:** 2026-07-10 (cycle 36) · **Status:** candidate PROVEN by looking, NOT shipped
(engine-gated). The art side of the denser-run fidelity lever is now de-risked.

## Why
`reference/SCORECARD.md` dim-1 (sprite & animation) = 4.0 — the lowest art dim; its
named headroom to 5.0 is "Metal-Slug-tier per-frame animation density". The shipped
run is a 4-beat `[contactL, pass, contactR, pass]` (3 distinct poses). "Is a 6-frame
run meaningfully smoother?" is an evaluative question, so I answered it with the REAL
resource — generated one and looked — instead of assuming.

## What was produced
`gen_run_cycle6()` in `generate.py` (recipe `RUN_POSES_6`): a 6-pose stride
(contactL, pushL, passing, contactR, pushR, passing2 — poses 3–5 mirror 0–2) via TWO
`/animate-with-skeleton` calls (endpoint caps at 3 poses/call), same reference+color=
idle palette lock as the shipped run. Cost: 2 API calls (~$0.03), cached.
- `6frame-candidate-poses.png` — the 6 frames at 8× on dark bg.
- `player_run6.png` — packed 6-frame strip (frame 23×30), tightened.

## Verdict (by looking)
CLEAN and legitimate: each of the 6 frames is a crisp, palette-locked commando
(red bandana, blue tank, tan arms, rifle) — no motion-blur, no drift, consistent
silhouette — and the 6 distinct leg positions form a sensible progressive stride.
6 distinct sampled poses vs the 4-beat's 3 ⇒ genuinely smoother in motion. The
skeleton + palette-lock recipe scales to 6 frames without quality loss. **The art is
achievable at quality; the lever is no longer art-risk, only an engine decision.**

## To ship (engine-gated — see ../../../READY-TO-WIRE.md lever 1)
1. Engine: `render.js:31` `PLAYER_RUN.frames` 4→6; `render.js:825` frame-select step
   `2π / PLAYER_RUN.frames` (not the hardcoded `π/2`).
2. Art: swap `gen_run_cycle` → `gen_run_cycle6` in `run()`, repack
   `manifest.json → sprites.player.animations.run` at 6 frames, sync.
3. The **blit-meta** gate enforces manifest#frames == engine PLAYER_RUN.frames — they
   must land together (gate goes RED otherwise), which is the intended tripwire.

Kept OUT of the live pipeline so the shipped 4-beat build stays correct until the
engine follows.

## Smoothness evidence for the greenlight call (cycle 37)
The open question was whether 6 frames read *meaningfully* smoother than the 4-beat at
gameplay scale — a MOTION judgment, so I produced the right artifact to decide it:
- `anim-sidebyside.gif` — left = shipped 4-beat, right = 6-frame candidate, matched
  stride period (~600ms), 5× scale. **Watch this to make the call.**
- `anim-4beat.gif`, `anim-6frame.gif` — each loop alone.
- `phase-sheet-4beat-vs-6frame.png` — both sampled at 6 equal stride phases (static,
  self-judgeable). **Finding by looking:** the 4-beat (top row) REPEATS poses across
  adjacent phases (3 distinct poses → visible "held"/stepped stride); the 6-frame
  (bottom row) shows 6 DISTINCT positions with continuous progression + subtly livelier
  upper body. So the 6-frame is objectively finer-sampled and cleaner — directionally
  smoother. Whether that margin is worth the engine change at ~28px is the parent's
  call from the side-by-side GIF; the art is proven and ready either way.
