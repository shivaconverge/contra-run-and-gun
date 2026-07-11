# Assessment #3 — FID-5 environment: verify the PR#14 response

**Date:** 2026-07-09 · **Subject:** `game/index.html` @ `e3c5107` (after PR#14 "richer
jungle environment render") · **Native res:** 480×270 · **Seed:** 1234

**Why:** last cycle this corpus filed FID-5 (flat environment = the #1 fidelity gap) with a
grounded target (`teardowns/environment-tileset-bar.md`). PR#14 responded. This assessment
**verifies the response by looking** — did the gap actually close? Method: re-captured 5
deterministic states via `capture-our-game.mjs`, made a 3× ground zoom crop, and put it
beside `frames/gunslugs-2/shot-00.jpg` (the realistic indie bar) + the old flat crop.
Evidence: `frames/our-game/state-*.png` (this build).

---

## Verdict: FID-5 SUBSTANTIALLY CLOSED (downgrade MEDIUM-HIGH → LOW-MEDIUM)

The stage now reads as a **night-jungle place**, not a gradient. Concretely, checking the
`environment-tileset-bar.md` invariants against what I now see:

| invariant | before (flat) | now (PR#14) | met? |
|-----------|---------------|-------------|------|
| ground = cap + textured fill | flat brown rect + 1px green line | **grassy-blade cap over speckled dirt fill** | ✅ mostly |
| ≥3 tones per material | single-tone | dirt has brown tones + reddish speckle; grass green tones | ✅ |
| 3–4 parallax layers + atmospheric perspective | 2 flat teal triangles | **5 layers: moon + 2–3 hill bands + treeline + foliage** (PR#14) | ✅ |
| set-dressing | none | foliage/bush silhouette band, grass tufts | ◑ partial (no discrete props yet) |
| material coherence | n/a | unified night-jungle theme; **platforms are grass-topped to match ground** | ✅ |
| tile variation | none | procedural texture varies | ✅ |

This is the corpus→build loop working: a grounded teardown drove a real render upgrade,
verified here by looking.

## Remaining gap vs the Gunslugs 2 bar (close zoom side-by-side)

Honest, still real but now *refinement-level*:
1. **Cap contrast / bevel.** Gunslugs' ground cap is bright tan **chunky tiles** with a
   highlight top + dark under-lip + seams between tiles — it reads as *tiled blocks*. OURS
   is a flat green grass-blade line over uniform dark dirt — reads as a *textured band*,
   not chunky tiles. **Fix:** add a highlight top edge + a darker under-lip band to the
   ground cap so it pops as a surface, not a line.
2. **Fill density/contrast.** Gunslugs' dirt is dense multi-tone pebbles + yellow mineral
   speckle; OURS is sparse, low-contrast speckle on near-uniform dark brown. **Fix:**
   denser + higher-contrast dirt detail (a second darker + a lighter clod tone).
3. **Discrete set-dressing props** (crate/barrel/foliage clump) still absent — competitors
   scatter a few. Low priority.

These are **procedural-renderer tweaks** (see teardown update), not a pipeline rebuild.

## Scores touched (vs ASSESS-2)
- **Sprite & animation quality — 3.0 → 3.5.** Environment richness lifts the whole-frame
  read; hero/enemy sprites unchanged (player_run still disabled — FID-4b stands).
- Dims 2/3/4/5-density unchanged from ASSESS-2 (still need CAP-2 competitor motion).

## OPEN ISSUES (updated)
- **FID-5 → LOW-MEDIUM (was MEDIUM-HIGH):** environment reads as a place; remaining =
  ground-cap bevel/contrast + denser fill + a few props. Owner: game render / assets.
- **FID-4b (player_run disabled)** — unchanged, now the top *character* gap.
- **CAP-2 (competitor motion)** — unchanged, blocks dims 2/3 bar.
