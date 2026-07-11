# Experiment: multi-puff explosion (dim-2 pinnacle-density stretch)

**Cycle 28 (prompt route):** NOT SHIPPED — single-prompt pixflux drifted to bonfire /
over-symmetric shapes; neither candidate beat the shipped single-burst.
**Cycle 29 (compositing route): SHIPPED ✅** — the diagnosed path (composite the
organic burst) worked. `explosion` is now a billowing multi-lobe cluster, verified
live in-engine by looking. Same 4×28×40 contract → zero engine coordination.

## Why
`reference/SCORECARD.md` dim-2 (hit feedback) is 4.0 = popular-competitor bar. Its
only remaining headroom, and the top "Pinnacle headroom" open item, is **multi-puff
explosion DENSITY** — Blazing Chrome / Metal Slug use billowing multi-lobe puff
clusters vs our single round burst. That FX is in the art slice and the engine already
frame-slices `explosion` via `drawFx`, so an in-place upgrade (same 4-frame 28×40
@18fps contract) would drop in with zero engine coordination. This was an attempt to
push dim-2 4.0 → 5.0 (pinnacle) — an explicit STRETCH beyond the stated goal bar.

## What was tried (grounded by looking vs `reference/frames/metal-slug-3/`)
- `01-attempt-cluster-seed41.png` — prompts asking for "cluster of overlapping
  fireball puffs / multi-lobed blast". **Failure:** pixflux read "flame puffs/cluster"
  as a **bonfire** — vertical flames with logs at the base (frames 1–2), plus pink
  contamination in frame 0. Wrong semantics for a mid-air kill blast.
- `02-attempt-radial-seed71.png` — retry forcing "mid-air radial detonation, no
  ground, no logs, ring of separate round lobes". **Better but still not shipped:**
  frame 1 achieves a multi-lobe ring but reads **geometric/cog-like** (too symmetric,
  not organic); frame 2 is a **hollow smoke-ring**; frame 3 is a **debris pile**, not
  dispersing puffs. Overall less convincing as an explosion than the shipped burst.

`00-current-shipped.png` — the shipped 4-frame explosion (spark → white-cored
fireball → flame+smoke → smoke). Reads as a punchy, organic kill burst; still the best.

## Resolution (cycle 29) — compositing SHIPPED
Single-prompt pixflux does not reliably produce Metal-Slug-tier ORGANIC multi-puff
billows at 32px (drifts to bonfire / over-symmetric / hollow). So the density is now
built by **compositing**: `generate.py multipuff_composite()` lightens 1–2
scaled+offset copies of each burst frame back onto itself (small offsets + larger
secondary scale → lobes overlap the main mass, no detached-ejecta flicker), applied
post-pack per 28×40 cell so frame dims are unchanged. Recipe = `EXPLOSION_MULTIPUFF`;
wired into the FX loop for `explosion` only. `03-composite-final-vs-current.png` is
the before(top)/after(bottom) strip; `04-in-engine-multipuff.png` is the live capture.
**Verified live in-engine by looking** (spawned real `world.spawnFx('explosion')`,
captured mid-animation): reads as a dense billowing multi-lobe blast, clean, no
artifacts; contract gate 13/13, dims still 4×28×40. Deterministic + $0 (uses the
cached single-burst frames; the composite is pure PIL, no new API call).
Spend to date: 8 API frames across the 2 failed prompt attempts (~$0.045, cached);
the shipped compositing route cost $0.
