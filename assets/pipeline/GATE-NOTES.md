# Pipeline contract-gate notes (`generate.py verify`)

The gate computes MECHANICAL contract FACTS across the shipped sprite graph
(transparency/palette/dims/sync + cross-source + draw-reachability + no-placeholder +
blit-meta). Fidelity stays the by-looking verdict, never this gate. Exit 0 = green.

## OPEN ISSUES

### 2026-07-12 (updated: now ALL 6 stages) — placed set-dressing renders NOTHING (owner: engine loop / assets.js + render.js)
**Severity:** medium→HIGH (the GOAL requires "every stage has its own set-dressing"; the campaign now PLACES it on all 6 themed stages but shows NONE). **Status:** OPEN — surfaced by the `Decor-reachability` gate check + verified LIVE by looking.

**Fact (from `generate.py verify` + live capture):** the campaign places 6 decor props
across the stages — `config.js CAMPAIGN[].decor` (stages 3-7: `decor_snow_pine`×4,
`decor_desert_cactus`×4, `decor_foundry_vat`×3, `decor_caverns_crystal`×4,
`decor_fortress_brazier`×4) + `level2.js` (`decor_cascade_valve`×3) — and `world.js
validateDecor` enforces the `decor_` contract. BUT (a) `game/data/assets.js` keys NONE of
them (never LOAD) and (b) `game/src/render.js` has NO `level.decor` blit (never DRAW).
Result: **every stage renders zero set-dressing props.**
**Live evidence:** `experiments/set-dressing/live/level3-snow.png` (S3 early-game) — snow
tileset + `bg_snow` mountains render, but no `decor_snow_pine` at x=360 (placed in config).

**Repro:** `python assets/pipeline/generate.py verify` → "Decor-reachability: 6 placed
prop(s) (…) → 6 WONT-RENDER". (The gate now scans ALL of `game/data/` — the campaign
placements live in `config.js`, not just `level*.js`; a level-only scan under-reported 1/6.)

**Fix — pipeline side DONE, only 2 engine lines remain:**
- ✅ **(me, done this cycle)** All 6 props FINALIZED: synced to `game/assets/` + folded
  into `run()`/`manifest.json` (§5f). The art the engine needs is now present where the
  loader reads it. Placed decor is excluded from the cross-source orphan rule (it is
  referenced by level data, not dead weight), so the gate stays green (42/42) while
  Decor-reachability keeps honestly reporting the render gap.
1. **(engine)** `game/data/assets.js` — key all 6 (`decor_snow_pine: 'assets/decor_snow_pine.png'`, …).
2. **(engine)** `game/src/render.js` — after `drawParallax`/`drawGround`, iterate
   `world.decor` and blit each `assets.get(d.key)` BASE-anchored to the ground y at `d.x`
   (parallax `d.parallax ?? 1`); mirror `drawEnemySprite`'s feet-anchor.
Once those 2 lines land, the props render (I verify LIVE by looking + close this issue).

### 2026-07-12 — 4 superseded armed `player_*` keys are shipped-but-unreachable  (owner: engine loop / game/data/assets.js)
**Severity:** low (dead weight, not a visible bug). **Status:** OPEN — surfaced by the gate, not maskable here.

**Fact (from `generate.py verify`):** `game/data/assets.js` registers 8 player keys —
`player_idle/run/prone/jump` (armed) **and** `player_idle/run/prone/jump_noweapon`
(weaponless). `game/src/render.js` (post master `b37951b`) draws player sprites **only**
through the local wrapper `const get = (k) => assets.get(k)` calling
`get('player_*_noweapon')` — it never references the 4 armed `player_*` keys. So those 4
keys load an asset the engine never blits → **shipped-but-unreachable**.

**Why it exists:** last cycle I regenerated the hero WEAPONLESS in place (same keys); the
engine loop then registered that art under NEW `_noweapon` keys and pointed render at
them, leaving the original `player_*` keys behind as redundant registrations.

**Repro:** `python assets/pipeline/generate.py verify` → "Draw-reachability: 20/24 …
4 unreachable" listing `player_idle/jump/prone/run`.

**Fix (engine loop owns `assets.js`):** either (a) remove the 4 redundant `player_*`
keys from `assets.js` (render already uses `_noweapon`), or (b) collapse to ONE set —
drop the `_noweapon` suffix and register the weaponless art under the bare `player_*`
keys, updating render's `get('player_*_noweapon')` → `get('player_*')`. Option (b) is
cleaner (the weaponless bodies are now the canonical hero; there is no armed variant).
Not fixable from `assets/pipeline/` — this is the engine loop's asset map.

**Gate self-fix applied this cycle:** the reachability model previously understood only
`assets.get('literal')` + `assets.get(e.kind)`. Master's `get(k)` wrapper made it emit a
MODEL-WARN and false-fail all 8 player keys. `verify_contract` now detects single-arg
assets wrappers, harvests the literal keys passed to them, and models the wrapper param —
so the gate reports the TRUE 4, not a false 8.
