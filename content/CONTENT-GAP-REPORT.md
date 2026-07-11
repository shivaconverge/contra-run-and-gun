# Content-Depth Gap Report — OUR build vs the reference corpus
_root.G (content/) · 2026-07-10 · first content-breadth pass_

**Perspective:** content DEPTH — total run length, # stages/screens, distinct enemy
archetypes, boss count, mid-stage set-piece variety — measured against the corpus
teardowns in `reference/`. This report is the "why" behind the Stage-2 spec
(`stage2/SPEC.md` + `stage2/level2.data.js`).

## How these numbers were derived
- **OUR counts:** code-computed FACTS from the shipped level data + config
  (`game/data/level1.js`, `game/data/config.js`) — not estimates. Reproduce:
  `grep -oE "type: '[a-z]+'" game/data/level1.js | sort | uniq -c`.
- **Corpus counts:** from the `reference/teardowns/*.md` (each cites its source
  frames/provenance).
- **Run length — MEASURED by driving the real sim** (`content/tools/measure-runlength.mjs`,
  evidence in `runlength-*.json`; GROUND-1 now CLOSED). A naive run-and-gun bot (hold
  right + fire + pulse-jump) stepping the shipped `World`+`LEVEL1`:
  - **CASUAL: full clear in 42.0s** (2518 frames @ 60Hz) — boss engages at **~20.4s**
    (so ≈20s of stage traversal + ≈22s boss fight incl. respawns), boss killed.
  - **ARCADE (one-hit): game-over at the boss** (32.5s, reached boss hp 90→29) — the
    naive bot can't finish arcade; that's a skill limit, not a content limit.
  - Corroborates the old ~17s pure-traverse floor (bot's ~20s traverse ≈ floor + deaths).
  **Total Stage-1 run length ≈ 42s to clear.** This is the single-stage content the
  whole game currently offers.

## Depth scoreboard

| Metric | OUR build (Stage-1) | Arcade Contra | Blazing Chrome | Metal Slug 3 | Gap |
|--------|--------------------|---------------|----------------|--------------|-----|
| **Total run length** | **~42s** (1 stage, MEASURED) | ~10-15 min (7 stages) | ~30-40 min | ~40+ min | **▲▲ biggest gap** |
| **Stages / screens** | **1** (Jungle Approach, 2400px) | **7** stages, 3 perspectives | 5+ missions | 5 missions | **▲ biggest gap** |
| **Distinct perspectives** | 1 (side-scroll) | 3 (side / pseudo-3D base / vertical) | side + vehicle | side + vehicle | high (stretch) |
| **Enemy archetypes (non-boss)** | **4** (grunt·turret·flyer·mortar) | many | many bespoke | many bespoke | medium |
| **Bosses** | **1** (Sentinel, 2-phase) | 6+ (incl. fixed-screen boss stages) | 1 per mission | 1 per mission | **high** |
| **Mid-stage set-pieces** | 1 hazard (58px chasm) + boss | pseudo-3D base run, waterfall climb | vehicle rides, gib set-pieces | mech rides, terrain gimmicks | medium-high |
| **Total spawns** | 24 (15 grunt·5 turret·2 flyer·1 mortar·1 boss) | — | ~in-band per screen | ~in-band per screen | in-band |

**Read:** OUR *within-a-screen* fidelity is at/above the popular web/mobile bar
(`reference/SCORECARD.md`: dims 3.5–4.5). The deficit is **DEPTH** — one stage, one
boss, one biome, **~42s of measured run** vs the corpus's 10–40+ minutes. Every
reference title delivers **multiple distinct stages with a boss each**. A player who
clears our whole game in well under a minute has nothing left to prefer us for — this
is the goal's binding gap. Shipping Stage-2 (`stage2/`) roughly **doubles** run length
(a comparable ~40s stage + a 2nd boss), the highest-leverage move on this number. The arcade teardown itself frames the MVP bar as
"Stage-1 side-scroll + a fixed boss" (met) — but "match or exceed today's popular
Contra-likes" needs **more than one stage** of content to hold a player.

## Prioritized content gaps

1. **[P0] A second stage.** Highest leverage, lowest cost — the level arch is
   already data-driven (`world.js` runs any level object), so a new stage is data +
   a boss + a transition, not an engine rewrite. → **`stage2/SPEC.md`** (ready to
   wire). Also closes creator #1 (unreferenced bridge/water tiles) by using them.
2. **[P1] A second, mechanically-distinct boss.** OUR only boss is a *fixed* wall
   Sentinel. A **moving aerial** boss (the spec's `chopper` gunship) doubles boss
   count and adds a threat pattern the fixed boss can't. → `stage2/SPEC.md §4`.
   **ART DRAWN (candidate):** root.C produced `chopper_candidate.png` (76×52) off this
   spec — I verified by looking (root.G) that its wide gunship silhouette is genuinely
   distinct from the tall Sentinel. The handoff loop is working; remaining is the
   engine `chopper` archetype + boss-finder generalization (still unwired).
3. **[P1] Stage-transition flow.** The engine assumption "boss.dead = end of game"
   is the single blocker to ANY multi-stage content. Spec'd in `§5` incl. a
   low-risk `?level=2`-first path to de-risk level data before the auto-transition.
4. **[P2] Mid-stage set-piece variety.** Stage-2 adds bridge-over-water crossings +
   a broken-bridge jump + multi-height mesa bypass (creator #1's "multi-height").
   Beyond that, a pseudo-3D base run / vertical climb are corpus staples = future
   stretch stages (P3), not this MVP.
5. **[P3] A 5th enemy archetype.** OUR 4 archetypes are in-band for a browser
   run-and-gun; a new grunt type is polish, not the binding gap. Deferred; Stage-2
   reuses the 4 and lets the new boss carry the "distinct" load.

## OPEN grounding items (honest gaps in THIS pass — not masked)
- ~~**GROUND-1**~~ **CLOSED (2026-07-10)** — Stage-1 run length is now MEASURED by
  driving the real sim: **42.0s full clear (casual)**, boss at ~20.4s
  (`content/tools/measure-runlength.mjs`; evidence `runlength-casual-1234.json` /
  `runlength-arcade-1234.json`). Reproduce: `node content/tools/measure-runlength.mjs`.
  Caveat: measured with a naive bot (deaths inflate wall-clock slightly); a skilled
  no-death clear would be a touch faster (~30-35s), still sub-minute — the gap stands.
- ~~**GROUND-2**~~ **PARTIALLY CLOSED (2026-07-10)** — Stage-2 is now PROVEN playable:
  I applied the `stage2/WIRE.md` patches to a throwaway `game/` copy and drove the real
  patched sim. FACTS: chopper registers as boss (`isBoss`), level plays, HP bar at
  **~17.8s** traversal (≈ Stage-1's 20.4s), phase-2 enrage fires at ~13s, and the boss
  is **defeatable** (isolated fight, 62.8s w/ spread+i-frames). → **total game run
  length ~doubles** (2 comparable stages), confirming the P0 payoff with real numbers.
  Remaining: two TUNING items (BAL-1 chopper is a slow kill @110hp/high-hover; BAL-2
  aim-up matters) recorded in `stage2/WIRE.md`; re-ground the FULL Stage-2 clear once
  root.B wires it live (the transition, Patch 5, is proposed-not-proven).

**SHIP status (2026-07-10 — SHIPPED behind `?level=2`):** root.B wired Stage-2 —
`game/data/level2.js` == my `level2.data.js` verbatim, `ENEMIES.chopper` added,
`main.js` routes `?level=2`. The P0 2nd stage + P1 2nd boss are now LIVE (manual URL
param; the auto stage-1→2 transition is still TODO). Remaining depth blocker: the
auto-transition so a normal player reaches Stage-2 without a URL.
**⚠ But playing the shipped build found `CHOP-1` (medium-high): the chopper STALLS at
its enrage HP (a `sweepAmp:90` reachability regression) — the stage may be
un-clearable as shipped.** Filed with repro + fix in `stage2/QA-NOTES.md`; must be
re-tuned + live-confirmed before Stage-2 counts as real, clearable content depth.

_Living document — re-measure when Stage-2 ships or the corpus teardowns update._
