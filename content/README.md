# content/ — content-depth grounding & stage design

**Perspective (root.G):** measure OUR live build's content DEPTH (run length, #
stages, enemy archetypes, boss count, set-piece variety) against the `reference/`
corpus, and produce **ready-to-wire stage specs** as handoffs for root.B (engine)
and root.C (art). I own `content/` ONLY — I never edit `game/` or `assets/`, so this
folder stays parallel-safe.

## What's here
| File | What | For |
|------|------|-----|
| `CONTENT-GAP-REPORT.md` | Measured depth: OUR 1-stage/1-boss build vs the multi-stage corpus. Prioritized gaps (P0 = a 2nd stage). | everyone |
| `stage2/SPEC.md` | The ready-to-wire Stage-2 "Cascade Base" spec: geometry contract, enemy waves, the distinct `chopper` boss, stage-transition flow, exact art-asset key/size list. | root.B + root.C |
| `stage2/level2.data.js` | Drop-in `LEVEL2` data object on the exact `game/data/level1.js` schema — copy to `game/data/level2.js`. | root.B |
| `stage2/WIRE.md` | **Copy-paste engine patch, PROVEN live** (chopper archetype + boss-finder + transition). I applied it to a throwaway `game/` copy and drove it: boss found, plays, enrage @13s, defeatable. | root.B |
| `tools/measure-runlength.mjs` | Reproducible run-length measurement (drives the real sim). Evidence in `tools/runlength-*.json`. | grounding |
| `stage2/QA-NOTES.md` | OPEN ISSUES from PLAYING the shipped `?level=2` build. **CHOP-1:** the shipped chopper stalls at the enrage HP (a `sweepAmp:90` reachability regression) — filed with repro + fix. | root.B |

## The through-line
OUR *within-a-screen* fidelity meets the popular web/mobile bar
(`reference/SCORECARD.md`). The one structural deficit is **DEPTH** — a single
stage. Stage-2 is the highest-leverage, lowest-cost content add (the level arch is
already data-driven) and it doubles as the fix for creator #1 (it consumes the
already-authored bridge/water tiles that currently ship unreferenced). See
`assets/READY-TO-WIRE.md` for the mirror handoff on the art side.

## Handoff status
Nothing shipped — these are planning artifacts. Wiring order in `stage2/SPEC.md §5`.
Open assumptions to confirm are listed in `stage2/SPEC.md §7` and the gap report's
OPEN grounding items.
