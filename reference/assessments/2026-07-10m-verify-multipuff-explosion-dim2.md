# Assessment #22 — verify the SHIPPED multi-puff explosion (dim 2)

**Date:** 2026-07-10 · **Subject:** `game/index.html` @ current HEAD (post `6ea2a2d` "explosion:
ship multi-puff density via post-pack compositing") · **Native:** 480×270 · **Method:** served
the CURRENT committed build, captured the first firefight kill live, AND upscaled the shipped
explosion sprite for a fair structural read (the in-scene FX is only 28×40 at native res).
Evidence: `frames/our-game-multipuff/`.

**Why this cycle:** the multi-puff explosion density was my longest-carried dim-2 headroom —
flagged in ASSESS-20 ("BC's denser multi-puff billowing cluster remains the pinnacle stretch"),
its recipe formalized in `teardowns/metal-slug-3.md` (layered offset lobes + smoke tail + sparks),
attempted-and-failed by the assets loop's single-prompt experiment, then shipped via the
compositing path that experiment itself recommended. My job is to check — BY LOOKING — whether
the shipped result actually reaches the billow bar, not to trust the commit message.

---

## By looking — the shipped sprite IS an organic multi-lobe billow
`explosion-sheet-6x.png` (the shipped `game/assets/explosion.png`, 4 frames of 28×40, 6×
nearest-neighbor over the game's night bg):
1. **Spark spray** + a bright impact flash at the base.
2. A **white-hot fireball that is now 2–3 OVERLAPPING ROUND LOBES**, with flame tongues curling
   off the edges — the multi-puff billow, not the old single round puff.
3. **Breakup** — orange flame tongues + grey smoke beginning to separate into lobes.
4. A **grey multi-lobe SMOKE billow** with a few orange embers at the base.

This is exactly the recipe I documented as the pinnacle target in the Metal Slug teardown
(**layered offset lobes + smoke tail + sparks**). In-scene (`kill-burst-peak-f328.png`,
`kill-burst-inscene-f330.png`) the burst reads correspondingly taller/punchier than the prior
single burst, consistent with the sheet.

## Direct comparison vs the bar
- **OURS:** a compact organic **2–3 lobe** billow with a proper smoke tail.
- **Blazing Chrome** (`firefight-explosion-dashring-~85s.png`): a **denser, wider cluster of
  MANY lobes** with smoke mixed into the fireball. **Metal Slug 3:** larger still + stacks
  multiple bursts.
- So OURS now shares the **structure** (multi-lobe + smoke) and clears the popular-competitor
  single-burst bar; the remaining gap to the pinnacle is **cluster DENSITY/SCALE** (more lobes,
  wider mass, stacked bursts) — not the recipe.

## Scores / gate
- **Dimension 2 (hit feedback & hit-stop): 4.0 → 4.5** — the explosion is now an organic
  multi-lobe billow on top of the existing hit-stop/trauma-shake/muzzle/flash-pop/shock-ring;
  above the popular-competitor bar, approaching pinnacle. **Not 5.0:** the honest remaining
  stretch is lobe-count/cluster-density/stacked-bursts (BC/MS3 scale), a smaller gap than before.

## Open issues
- ~~multi-puff density~~ **LANDED** (this assessment, `6ea2a2d`) — the top "pinnacle headroom"
  dim-2 item is substantially closed; downgraded to a scale/density stretch.
- Carried low/cosmetic: EXPL-1 (boss-death fireball still un-witnessed in the showcase — the same
  shared `drawFx` path now renders this billow, so boss-death gets it too), MORTAR-VIS-1, BOSS-2,
  TOUCH-2, LEAP-1, HUD-1. No medium+ fidelity defects.
