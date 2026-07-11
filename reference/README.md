# reference/ — Fidelity & Feel Ground-Truth Corpus

This folder is the **single source of truth** for the question every build/QA loop keeps
asking: *"Does OUR rendered frame look and feel like a Contra that beats today's popular
2D Contra-likes?"*

It is not opinion. It is a corpus of **reference frames** + **teardowns** that OUR
rendered output is compared against, plus a **capture pipeline** to keep growing it.

## What's here

| Path | What it is |
|------|-----------|
| `SCORECARD.md` | **Consolidated fidelity+feel verdict** — the 5-dim rubric scored + arcade-invariant feel check (the TEST/PLAYTEST GATE deliverable). Read this for the at-a-glance "where do we stand". |
| `manifest.json` | Machine-readable index: target titles, the 5 scoring dimensions, capture status, and OPEN ISSUES. |
| `assessments/` | Dated by-looking judgments (ASSESS-1..8) the scorecard rolls up. |
| `teardowns/` | Fidelity/feel invariants. `arcade-contra-1987.md` = **nostalgic-feel anchor** (real Stage-1 frames). `competitors-visual-bar.md` = **fidelity bar to match/exceed** (+ MOTION). `contra-returns-mobile.md` = the **official mobile Contra** (3D-HD/F2P — a different tier; positioning insight). `environment-tileset-bar.md` = tile/bg spec. `cadence-dim3.md` = movement-cadence grounding. |
| `frames/<slug>/` | Captured PNGs per title/subject + `capture.json` provenance. `frames/our-game/` = OUR slice captured at native 480×270; `frames/_probe/` proves the pipeline renders. |
| `assessments/` | Dated fidelity/feel judgments of OUR game vs the anchor+rubric (the corpus *doing its job*). `2026-07-09-our-game-vs-anchor.md` is assessment #1. |
| `tools/` | `capture-frames.mjs` (generic headless capture) · `capture-our-game.mjs` (native-res capture of OUR game) · `fetch-steam-shots.mjs` (official competitor stills) · `fetch-trailer-frames.mjs` (competitor MOTION via official Steam trailers). See `tools/README.md`. |

## The 5 scoring dimensions (fixed rubric — see `manifest.json` for sub-metrics)

1. **Sprite & animation quality**
2. **Hit feedback & hit-stop**
3. **Movement cadence**
4. **Weapon juice**
5. **Enemy density & pacing**

Every loop that judges feel scores these same five axes so results are comparable
across cycles.

## How another loop should USE this corpus

1. Read the relevant `teardowns/<title>.md` for the invariants of the dimension you're
   judging.
2. Put OUR rendered frame **next to** `frames/<slug>/*.png` and **look at both** — the
   verdict is the multimodal side-by-side comparison, made by an agent that can see
   images. **CV metrics (palette counts, pixel sums, size thresholds) are advisory
   pre-filters ONLY — never the verdict.**
3. Preserve the arcade **HARD INVARIANTS** absolutely; measure/beat the competitor
   **bar** for polish.

## Honesty rules for this corpus (so it never lies)

- A frame is only "reference gameplay" if it's a real capture with a `capture.json`
  documenting its source. No mock/placeholder frame is ever presented as a comparand.
- Unverified feel numbers are marked `[MEASURE]` in teardowns and must be
  frame-measured from footage, not invented.
- Gaps are logged as `open_issues` in `manifest.json` with exact repro — never hidden.

## Current state (2026-07-09, cycle 0)

- ✅ Corpus scaffold, manifest, and 5-dimension rubric established.
- ✅ Capture pipeline built and **proven end-to-end** — `cli` single still
  (`frames/_probe/capture-pipeline-ok.png`) and `pptr` real gameplay sequence with
  injected input (actor moved x=464→x=1616 across 4 frames). See `tools/README.md`.
- ✅ Arcade-Contra-1987 teardown grounded (nostalgic-feel anchor).
- ✅ **Assessment #1 landed**: OUR slice captured at native 480×270 and judged vs the
  anchor+rubric (`assessments/2026-07-09-our-game-vs-anchor.md`). Soul-level identity
  intact; recorded divergences FID-1..4 (health-bar vs one-hit-death, jump-cut vs
  fixed-arc, low density, placeholder sprites).
- ✅ **Competitor visual bar landed**: 5 benchmark titles captured as official Steam
  gameplay stills (Blazing Chrome, Operation Galuga, Metal Slug 3, Huntdown, Gunslugs 2)
  + `teardowns/competitors-visual-bar.md`. Dimensions 1/4/5 now pixel-comparable (CAP-1).
- ✅ **Assessment #2 landed**: current build (real sprites) judged vs competitor bar via
  zoom side-by-sides (`assessments/2026-07-09b-our-game-vs-competitor-bar.md`). Character
  sprites now MEET/EXCEED the indie-tier bar → **FID-4 resolved-for-characters**; the gap
  moved to **environment art (FID-5)** and **run animation (FID-4b)**.
- ◑ **Competitor MOTION** partially grounded (**CAP-2**): hit-feedback/juice/explosion/boss
  framing from official Steam trailers (Blazing Chrome + Huntdown, `frames/*/motion/`) +
  the MOTION section in `competitors-visual-bar.md`. Residual: precise cadence (dim 3) —
  not measurable from edited trailers; needs same-scale capture.
- ⏳ Contra Returns (mobile) + web-HTML5 competitive set — not yet captured.
