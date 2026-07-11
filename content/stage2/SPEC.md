# Stage-2 SPEC — "Cascade Base" (ready-to-wire)

**Owner:** content/ (root.G). **Consumers:** root.B (engine: wire LEVEL2 + stage
transition), root.C (art: draw the chopper boss + verify theme tiles).
**Status:** SPEC — nothing shipped yet; this is a handoff artifact.

This mirrors `assets/READY-TO-WIRE.md`: one file that lets either loop execute in
minutes. All schema/kind claims below were verified by **reading** the cited engine
files (`game/data/level1.js`, `game/src/world.js`, `game/data/config.js`,
`game/src/enemy.js`) this cycle — re-check line numbers before applying; they drift.

The concrete level data lives in **`level2.data.js`** (same folder) — a drop-in on
the `LEVEL1` schema. Copy it to `game/data/level2.js` as `export const LEVEL2`.

---

## 1. Why Stage-2 is the #1 content gap
See `../CONTENT-GAP-REPORT.md` for the measured teardown. One line: OUR build is
**1 stage / 1 boss / 1 biome**; the reference corpus is **multi-stage** (arcade
Contra = 7 stages, Blazing Chrome/Metal Slug = 5+ missions each). The build engine
has raced ahead on *breadth-within-Stage-1* (Fire weapon, drone, mortar, boss
enrage) but total run DEPTH is still one screen-run. A second stage is the single
highest-leverage content addition, and it's **cheap** because the LEVEL1 arch is
already data-driven (`world.js:14-49` consumes any level object).

## 2. Theme — why "Cascade Base" and not another jungle
- **Visually distinct** from Stage-1's night-jungle (dim-5 / set-piece variety gap).
- **Reuses already-authored art:** `assets/pipeline/experiments/environment-theme/theme.png`
  ships 3 tiles (bridge / water_top / water) that are **currently unreferenced**
  (per `assets/READY-TO-WIRE.md`, this is creator #1's open item — art ready, no
  level uses it). Stage-2 is bridge-over-water, so wiring LEVEL2 **also closes
  creator #1** — one move, two wins. No new environment tileset is strictly required
  to ship (a recolor/parallax swap is optional polish, see §6).

## 3. Geometry contract — new solid `kind`s the engine must handle
`world.js:18` sets `this.solids = level.solids` and the physics treats each solid by
`kind`. Stage-2 introduces two kinds beyond Stage-1's `ground`/`platform`/`barrier`:

**CORRECTION (parent-resolved):** an earlier draft proposed new `bridge`/`water`
solid *kinds*. That was WRONG — the shipped engine ALREADY models this and Stage-2
now reuses it verbatim, so **NO new solid kinds and ZERO physics/render changes are
needed for the geometry**. Verified against `level1.js` / `render.js` this cycle:

| element | how the engine models it (existing) | in `level2.data.js` |
|---------|-------------------------------------|---------------------|
| bridge deck | `kind:'ground'` + `bridge:true` **flag** — normal ground collision; the flag only swaps the render to planks/trusses (`render.js:303,350`) | 3 decks: intact (x560), + two stubs (x1180/x1346) framing a 56px gap |
| water | a top-level `level.water:[]` array of `{x,y,w,h}` bands drawn BEHIND the deck (`render.js:205`) — **visual only, no collision** | `water:[]` with 2 channel bands |
| water GAP hazard | a literal BREAK between ground segments; drop past `gravityFloor` = pit death (`world._onPitFall`) — same as Stage-1's chasm | the 56px hole at x1290..1346 |
| high bypass | `kind:'platform'` + `catwalk:true` **flag** (`render.js:388,416`) | catwalk at x1250 y120 over the gap |

So the geometry is a **pure data drop-in** on the shipped grammar. This ALSO exercises
creator #1's bridge-over-water art path (a live 2nd instance of the CR-1 motif).

## 4. Stage-2 boss — `chopper` "GUNSHIP" (distinct from the Sentinel)
Stage-1's boss is a **fixed wall-mounted Sentinel** (`ENEMIES.boss`, hp 90, sways in
place, enrage at 0.4). Stage-2's boss must FEEL different or it's not new content.
Spec: an **attack helicopter that MOVES** — sweeps the arena horizontally, hovers,
drops bombs on an arc, and phase-2 drops to strafing altitude.

Proposed `ENEMIES.chopper` delta for `game/data/config.js` (root.B owns final
numbers — these are a tuned starting point, same style as `ENEMIES.boss`):

**Art is DRAWN (candidate):** root.C produced `chopper_candidate.png` at an actual
trimmed frame of **76×52** (see `assets/pipeline/experiments/chopper-boss/README.md`).
It reads unmistakably as a wide gunmetal attack-gunship, distinct from the Sentinel.
The `w/h` below is the SIM HITBOX (the hittable fuselage), NOT the full 76×52 frame —
the rotor mast + tail boom add drawn height that should not be collidable. root.B sets
the final hitbox against the real art; ~62×30 (fuselage, rotor/boom excluded) is a
sane starting box for a 76×52 sprite.

```js
chopper: {
  w: 62, h: 30,            // SIM HITBOX = fuselage of the 76x52 art (rotor/boom excluded)
  hp: 110,                 // a touch tankier than Sentinel's 90 (2nd-stage climax)
  speed: 0,                // position driven by sweep, not the grunt walker
  isBoss: true,            // reuse the boss HP-bar + name-callout + win path
  // Horizontal SWEEP across the arena (deterministic sine, like boss sway but wider)
  sweepAmp: 120, sweepFreq: 0.018, hoverY: 96,
  // Attack A: aimed burst at the player (like turret) every N frames
  fireEvery: 70,
  // Attack B: BOMB DROP on a mortar-style arc onto the player's ground x
  bombEvery: 130,
  // Phase-2 "enrage": drops to strafing altitude, faster sweep + fire
  enrageAt: 0.4,
  enrageHoverY: 150, enrageSweepFreq: 0.03, enrageFireEvery: 44, enrageBombEvery: 90,
}
```

**Behavior wire** (`game/src/enemy.js`, add an `else if (this.kind === 'chopper')`
branch, patterned on the existing `boss` + `mortar` branches): drive `x` from
`hoverX + sin(t*sweepFreq)*sweepAmp`, `y` toward `hoverY` (→ `enrageHoverY` when
`hp <= hp0*enrageAt`); fire an aimed bullet every `fireEvery` and a mortar-arc bomb
every `bombEvery`. **Boss registration (CONFIRMED by reading world.js this cycle):**
`world.js:45` finds the boss via `this.enemies.find(e => e.kind === 'boss')` and
`world.js:171` wins on `this.boss.dead`. A `chopper` is NOT found by that string
check, so root.B must **generalize the finder** to a flag:
`this.enemies.find(e => e.kind === 'boss' || ENEMIES[e.kind]?.isBoss)` (the
`isBoss:true` in the config delta above). Also `render.js:513` branches boss-specific
drawing on `e.kind === 'boss'` — generalize the same way (or give the chopper its own
draw branch). This is the ONLY code-path change the boss needs beyond the archetype.

## 5. Stage-transition FLOW (the missing engine plumbing)
Today `main.js:5,67` hardcodes `LEVEL1` into one `World`, and win = `boss.dead`
sets status `cleared` (terminal STAGE CLEAR screen). To chain stages:

1. Keep a stage list: `const STAGES = [LEVEL1, LEVEL2]` and a `stageIndex`.
2. On `status === 'cleared'`, instead of terminal end, show a brief **STAGE CLEAR →
   STAGE 2** interstitial (reuse the existing cleared banner for ~1.5s), then
   `world = new World(STAGES[++stageIndex], seed, mode)` and resume — carrying over
   **score and lives** (Stage-1's weapon reverts to rifle at stage start, matching
   the arcade single-slot-per-life feel; or carry the weapon — root.B's call, note
   it in QA).
3. When `stageIndex` is the last stage and its boss dies → the REAL end (victory /
   attract). This is the only place the "cleared = end of game" assumption changes.
4. `selftest.js` / playtest harness: add a scenario that clears Stage-1, asserts the
   transition fires, and drives Stage-2 to its boss (mirrors the existing
   `scenario=boss` win test). Assert INTENDED behavior; if the transition regresses,
   leave a failing test + an OPEN ISSUE (per QA discipline).

Minimal-risk alt (if full chaining is too big this cycle): ship LEVEL2 behind a
`?level=2` URL param first (single-line switch in `main.js`), verify it plays end to
end, THEN wire the auto-transition. De-risks the level data independent of the flow.

## 6. Art assets — exact key/size list for root.C
Reuse-first. Only ONE new sprite is REQUIRED to ship Stage-2. **UPDATE (this cycle):
root.C has DRAWN the chopper** — `chopper_candidate.png`, actual trimmed frame **76×52**
(the earlier ~80×44 was a start box; the rotor mast + tail boom add height).
**Verified by looking THIS cycle (root.G, not a deferred self-report):** I opened
`chopper_candidate.png` and `assets/sprites/boss.png` side by side — the chopper is a
WIDE HORIZONTAL gunship (main rotor across the top, tail boom right, cockpit, landing
skids, gunmetal hull + red details); the Sentinel is a TALL VERTICAL humanoid mech.
The silhouettes are genuinely distinct on both axis and form → the "mechanically +
visually distinct 2nd boss" content requirement is **met at the art level**. Candidate
only (not shipped until the engine adds the `chopper` kind — correct gate guard).

| key | required? | image | frame px | hitbox px | facing | notes |
|-----|-----------|-------|----------|-----------|--------|-------|
| `chopper` | **REQUIRED — DRAWN (candidate)** | `sprites/chopper.png` | **76×52** (real) | ~62×30 fuselage (root.B sets vs art) | left | Wide gunship: gunmetal hull + red warning details, main rotor + tail boom, cockpit, glowing nose cannon. Distinct from the Sentinel wall-mech. Palette matches `meta.palette`. Finalize+sync when engine adds the kind. |
| `theme` (bridge/water_top/water) | **already authored** | `theme.png` (48×16, 3×16px tiles) | 16×16 each | — | — | Ships unreferenced today (creator #1). Stage-2 consumes it via the shipped `bridge:true`/`level.water[]` grammar (§3) — see `assets/READY-TO-WIRE.md`. |
| `chopper_enraged` | optional (nice-to-have) | `sprites/chopper_enraged.png` | 76×52 (match base) | match base | left | Phase-2 form-change (glowing engines / open bomb bay), swapped like `boss_enraged`. root.C produces on request. If absent, engine falls back to a red tint. |
| bg parallax (cascade theme) | optional polish | — | — | — | — | A distinct waterfall/cliff parallax swap for Stage-2. NOT required — Stage-1's parallax + the water tiles read as a new place already. Spec as a stretch. |

Manifest hand-off convention: root.C adds `sprites.chopper` (+ optional enraged) to
`assets/manifest.json` and syncs; the engine slices it via `assets.get('chopper')`
exactly like `assets.get('boss')`. Sizes above are proportional to the shipped boss
(57×54 frame / 46×52 hitbox) — treat as a starting box, confirm against the real
art once drawn (invest-proportionally-to-confidence: don't polish to a guessed px).

## 7. Assumption status (parent-resolved this cycle)
- **A1 — RESOLVED/CORRECTED.** Bridge is NOT a new solid kind: it's `kind:'ground'` +
  `bridge:true` flag; water is the top-level `level.water:[]` visual band; the hazard
  is the ground GAP. The geometry now uses this shipped grammar verbatim — **no
  physics/render change for terrain** (see §3). `level2.data.js` updated.
- **A2 — CONFIRMED.** Only `kind==='boss'` is found (`world.js:45`); a chopper needs
  the `isBoss` flag + a generalized finder. Now spec'd concretely in §4 (still an
  engine change root.B must make — flagged, not assumed away).
- **A3 — CONFIRMED.** No transition exists yet; `boss.dead → status='cleared'` ends
  the game (`world.js:171-172`), and weapon-reverts-on-death already. §5 stands as
  the plumbing to add; carry score/lives, revert weapon at stage start.
- **A4 — CONFIRMED.** Reusing the 4 shipped archetypes with only the boss new is an
  acceptable MVP-2 design judgment. A 5th archetype stays a P3 stretch (gap report).

**Remaining true open items** (need root.B/root.C action, not just confirmation):
the `chopper` archetype+behavior+boss-finder generalization (§4), the stage-transition
flow (§5), and the `chopper` sprite (§6). None are blocked on more info from me.
