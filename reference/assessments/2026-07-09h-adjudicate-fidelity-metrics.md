# Assessment #8 — adjudicate the playtest fidelity METRICS by looking

**Date:** 2026-07-09 · **Subject:** `playtest/frames/fidelity/` (a playtest loop now
composites OUR live frames beside this corpus's competitor refs + computes CV metrics) ·
**Method:** read `metrics.json`, then **looked** at the three composite sheets. This is the
corpus doing its defining job: **CV metrics are advisory pre-filters, NEVER the verdict —
the multimodal look adjudicates them** (`manifest.json` purpose).

The playtest loop is correct in structure (side-by-side sheets + metric deltas, using this
corpus's refs). This assessment supplies the missing **by-looking verdict** on its deltas.

---

## The metric deltas OVERSTATE the gap — because the paired BEATS aren't comparable

`metrics.json` shows OURS with far fewer unique colors / lower edge density than the refs
(firefight: 303 vs 838/1130; boss: 181 vs 430). Looking at the sheets shows **why**, and it
is mostly a **capture-beat mismatch**, not a fidelity deficit:

| sheet | OURS beat (looked) | REF beat (looked) | comparable? |
|-------|--------------------|-------------------|-------------|
| `firefight-vs-blazing-chrome` | **calm mid-run**: hero + a thin bullet stream, ~no enemies/explosions on screen | **peak combat**: enemy detonating in a huge multi-cluster explosion + dash VFX + spider-mechs + dense biomech bg | ❌ calm-vs-peak |
| `firefight-vs-huntdown` | same calm mid-run OURS | Huntdown dense interior (5–6 enemies + set-dressing) | ❌ calm-vs-peak |
| `boss-vs-blazing-chrome` | **STAGE CLEAR** — the boss is ALREADY DEAD; near-empty victory screen | Blazing Chrome **BOSS-intro splash** — screen-filling beast at max presence | ❌ post-fight-vs-intro |

So the CV deltas are dominated by **OURS being sampled at low-action beats** (a quiet run;
a post-victory empty screen), not by OUR game being incapable of density. A metric harness
that pairs a quiet OURS frame with a peak REF frame will always report a large false gap.

## The GENUINE, comparable-beat gap (from this corpus's like-for-like assessments)
When OURS is compared at a *matched* beat (ASSESS-2/4/5/7, which used real firefights and a
boss-ON-screen frame `frames/our-game-boss/state-1600.png`), the standing verdict holds:
- OUR characters + environment + weapon roster are **at/above the indie bar** (Gunslugs 2).
- The remaining real gap is the **Blazing-Chrome/Metal-Slug PINNACLE**: explosion/particle
  density + background detail density (already tracked; not a regression). OURS is genuinely
  less "busy" than the pinnacle — but that is the known top-tier headroom, not a defect the
  metrics newly discovered.

## Recommendation to the fidelity harness (so the pre-filter is meaningful)
Capture OURS at **comparable beats** before diffing:
1. **Firefight sheet:** sample OURS during a real firefight — 3+ enemies on screen + an
   active explosion/muzzle spray (e.g. the Machine/Spread beat, or `frames/our-game-weapons/`).
2. **Boss sheet:** sample OURS with the **Sentinel ON screen mid-fight** (HP bar + volleys),
   e.g. `frames/our-game-boss/state-1600.png` — NOT the STAGE CLEAR screen.
Then the color/edge-density delta becomes a real signal (and will shrink substantially).
Even then, treat it as a **pre-filter**: the verdict stays the side-by-side look.

## Facts confirmed this cycle
- **CASUAL mode grounded** (playtest `results.json`/REPORT): title mode-select →
  `mode=casual, lives=5, shield=2`; ARCADE re-arms `lives=3` one-hit. Fully confirms the
  FID-1 accessibility hedge shipped (ASSESS-6) — not inferred.
- **Competitor corpus IS committed** (15 competitor `.jpg` + 6 motion `.png` tracked in git).
  The strategy graph's `obs_arcade_landed_competitor_corpus_unsourced` (impact 0.85) is
  **STALE** — the competitor corpus was sourced cycles ago (Blazing Chrome, Huntdown, Metal
  Slug 3, Gunslugs 2, Operation Galuga) and is in-repo; only the strategy's fresh cycle-0
  scout missed it.

## Open issues
- **FIDHARNESS-1 (medium, for playtest loop):** fidelity sheets pair non-comparable beats
  (calm/empty OURS vs peak/intro REF), inflating the CV gap. Fix: sample OURS at matched
  beats (above). Owner: playtest loop. Corpus flags + provides the matched frames.
- Pinnacle headroom (explosion/particle + bg detail density vs Blazing Chrome/Metal Slug) —
  carried, known; OURS at/above the indie bar.
