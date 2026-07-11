# Assessment #6 — title/attract screen + airborne leap sprite

**Date:** 2026-07-09 · **Subject:** `game/index.html` @ `03d5653` · **Native:** 480×270 ·
**Method:** ran the LIVE build (not headless — the title only shows live), grabbed the title
screen + a difficulty-select frame + an airborne-leap frame via canvas `toDataURL`, then
**looked** (+ 5× leap zoom). Evidence: `frames/our-game-title/`, `frames/our-game-jump/`.

Two new visual features landed since ASSESS-5 (PR#34 title screen, PR#35 leap sprite).

---

## Title / attract screen (PR#34) — arcade-AUTHENTIC ✅
Looked (`frames/our-game-title/title-0.png`):
- **"RUN & GUN — A CONTRA-LINEAGE VERTICAL SLICE"** big yellow title, clean arcade type.
- **Mode select: `► ARCADE   CASUAL`** with "1/2 select mode" + **"one hit = one life — the
  1987 way"**, and **"PRESS Z / SPACE TO START"**.
- **Live gameplay runs BEHIND the title** (grunts, moon, jungle) — i.e. a real **attract-mode
  screen**, exactly the arcade convention. This is a strong nostalgic-feel hit.
- **Resolves the FID-1 tension elegantly:** cycles ago I flagged one-hit-death (arcade
  purity) vs health (modern accessibility). The game now ships **ARCADE (one-hit, "the 1987
  way") as default + CASUAL as the accessibility hedge** — precisely the recommended
  resolution. FID-1 is not just resolved, it's turned into a player-facing choice.

## Airborne leap sprite (PR#35) — completes the sprite set ✅ (one minor note)
Looked (`frames/our-game-jump/leap-rising.png`, 5× zoom):
- A **distinct, dynamic airborne pose** — red bandana, muscular torso, blue harness, rifle
  forward + cyan tracer, one leg extended fore / one back in a running-**bound**. Clean,
  palette-locked, **no blur**. Distinct from idle/run/prone → the character sprite set
  (idle · run · leap · prone) is now **complete and all real**.
- **Minor divergence (LEAP-1, low):** the arcade jump is a **tucked somersault** (§2
  signature silhouette); OUR leap is a **forward-bound** (more Metal-Slug/Blazing-Chrome
  than arcade). Defensible modern style, but it does not read as the arcade somersault. Not
  a defect — a stylistic choice to note vs the anchor.

## Scores (vs ASSESS-5)
- **Sprite & animation quality — 4.0 → 4.0** (leap completes the set; quality holds).
- **Nostalgic-feel / presentation — NEW: strong** — the arcade attract-title + "1987 way"
  mode select materially raise the nostalgic read; this was previously ungraded.

## Cadence residual (dim-3) — honest update
I re-attempted the pixel-precise arcade jump apex/airtime this cycle (native-fps frame-step
of `Contraarcade1cc`, multiple windows). **Outcome: not reliably extractable** — arcade
Stage-1 is **terraced** (the hero hops between multi-level ledges, so "ground" is ambiguous
frame-to-frame) and the hero is tiny at 30 fps. Rather than fabricate a number by guessing
leave/apex/land frames on ambiguous terrain, this stays a documented residual (see
`teardowns/cadence-dim3.md`). OUR cadence remains measured-exact + arcade-plausible.

## Open issues after this assessment
- **LEAP-1 (low)** — leap is a forward-bound, not the arcade somersault (stylistic).
- **BOSS-1 (low)** — single-core boss vs multi-part set-piece (stretch).
- **HUD-1 (low)** — text weapon indicator vs falcon icon.
- **dim-3 precise arcade number** — documented residual (terraced-terrain limit), not a blocker.
