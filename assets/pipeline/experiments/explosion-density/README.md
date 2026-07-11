# Experiment: explosion cluster DENSITY (dim-2 stretch, cycle 33)

**Outcome:** NOT SHIPPED — the current 2-lobe multi-puff explosion is the clean
sweet spot for the 28×40 FX cell. Tested by looking; more lobes ≠ better here.

## Why
`reference/SCORECARD.md` dim-2 = 4.5 (above the popular-competitor bar). Its named
remaining stretch is "cluster DENSITY (Blazing Chrome/Metal Slug run more lobes +
stacked bursts)". Adding lobes within the existing 28×40 cell is zero-coordination
(same contract, pure compositing, $0) — so I tested whether a denser recipe pushes
dim-2 toward 5.0.

## What was tried
`2lobe-current-vs-3lobe-candidate.png` — top = current shipped 2-lobe recipe
(`EXPLOSION_MULTIPUFF`); bottom = a denser 3-lobe + stacked-mini-burst recipe, both
composited from the same cached single-burst base frames.

## Verdict (by looking)
The 3rd lobe adds only MARGINAL change, and where it differs it tends to add
DETACHED bits (frame-0 floating spark, frame-2 detached flame upper-left) that read
as minor NOISE, not richer density. The current 2-lobe blast is cleaner and more
cohesive. At 28×40, ~2 lobes is the density ceiling before crowding/detachment.

## Conclusion → the remaining dim-2 gain is engine-coordination-blocked
Real Metal-Slug/Blazing-Chrome density+SCALE needs MORE PIXELS to hold more lobes
cleanly — i.e. a LARGER FX frame (e.g. 40×48). That changes `render.js FX.explosion`
`{fw,fh}` (and the draw `scale`), which my **blit-meta alignment** gate check now
enforces (a manifest/engine dim mismatch fails the gate). So: keep the shipped 2-lobe
explosion; the further density stretch is a produce→engine-wires item (bigger FX cell)
awaiting an engine greenlight, not a within-contract tweak. Gate stays 14/14, 0 viol.
