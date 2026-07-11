# Environment theme — bridge + water tiles (creator REJECT #1)

**Driver:** `CREATOR_FEEDBACK.md` (REAL human, authoritative, overrides the AI-vision
self-score). Verdict REJECT 3/5. Note #1: *"background looks very simple… theme of this
level is not clear… original one had bridge and water… you can move at multiple levels
(heights)."* The arcade Contra Stage-1 is a jungle with a **metal BRIDGE over blue
WATER** (`reference/frames/arcade-contra-1987/stage1/cliff-bridge-~37s.png`).

**Cycle 38 (rough pass):** first bridge + water 16px candidates.
**Cycle 39 (refined to a coherent 3-tile set — parent CONFIRMED #1 is a joint, active
need, so invested proportionally):** judged in a stacked set-piece mock (`/tmp` →
kept as the candidate set), by looking vs the arcade cliff-bridge frame:
- `bridge16.png` (v2) — elevated metal **girder/truss** span: grey deck plate on top +
  visible cross-beam truss below → reads as a BRIDGE, not flat metal ground (the v1
  fix). Tiles horizontally.
- `water_top16.png` — water **surface edge**: bright cyan foam ripple line over blue.
- `water16.png` — deep blue water **body** fill, seamless.
Stacked (bridge / air gap / water-surface / water-body) they read as the iconic
bridge-over-water set-piece. Coherent, on-theme, in-lineage. Ready to wire.

**NOT shipped to manifest/assets.js yet — deliberately.** These are terrain the engine
must PLACE, and there is no bridge/water tile slot or multi-height water level today.
Shipping unreferenced tiles would fail the contract gate's reverse checks
(orphan / unreachable). So they stay as candidates until the engine side lands.

## Wiring need (joint art + engine — owner tag from CREATOR_FEEDBACK #1)
- **Engine (root.B / level):** add a level section with **multi-height platforms** and
  a **bridge-over-water** set-piece; extend the tile system with a `bridge` (solid
  platform) tile and a `water` (background/hazard) tile — either widen the `tiles`
  sheet with new `TILES.bridge/water` rects (append at x48/x64 so the existing
  cap/dirt/dirt2 at x0–47 are untouched) or add `bridge`/`water` asset keys.
- **Art (me), on greenlight:** finalize these tiles at the confirmed slot size/format,
  add to `manifest.json` + `game/data/assets.js`, sync; the contract gate + blit-meta
  will then verify them. Can also add themed set-dressing (girder supports, far
  waterfall) if the engine adds a decoration/parallax-sprite slot.

The **background "too simple"** part is largely engine-drawn parallax (render.js), not
tiles — flagged to the render/environment loop; I can supply themed parallax sprites
(bridge silhouette, distant water, cliffs) IF a background-sprite slot is added.
