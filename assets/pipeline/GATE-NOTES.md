# Pipeline contract-gate notes (`generate.py verify`)

The gate computes MECHANICAL contract FACTS across the shipped sprite graph
(transparency/palette/dims/sync + cross-source + draw-reachability + no-placeholder +
blit-meta). Fidelity stays the by-looking verdict, never this gate. Exit 0 = green.

## OPEN ISSUES

### 2026-07-12 — placed set-dressing renders NOTHING → ✅ CLOSED (WIRED + LIVE)
**Severity:** medium→HIGH (the GOAL requires "every stage has its own set-dressing"). **Status:** ✅ RESOLVED — the 2 engine lines landed this cycle; all 6 props now render, verified LIVE by looking.

**Was:** the campaign placed 6 decor props across the stages — `config.js CAMPAIGN[].decor`
(stages 3-7: `decor_snow_pine`×4, `decor_desert_cactus`×4, `decor_foundry_vat`×3,
`decor_caverns_crystal`×4, `decor_fortress_brazier`×4) + `level2.js` (`decor_cascade_valve`×3)
— and `world.js validateDecor` enforced the `decor_` contract, BUT (a) `game/data/assets.js`
keyed NONE of them (never LOAD) and (b) `game/src/render.js` had NO `level.decor` blit (never
DRAW), so every stage rendered zero props.

**Fix — LANDED (pipeline side + engine side both DONE):**
- ✅ **(pipeline)** All 6 props FINALIZED: synced to `game/assets/` + folded into
  `run()`/`manifest.json` (§5f) — the art is present where the loader reads it.
- ✅ **(engine)** `game/data/assets.js` — all 6 `decor_*` keys added (→ they LOAD).
- ✅ **(engine)** `game/src/world.js` reset() — binds `this.decor = this.level.decor || []`
  every stage (like solids/theme), so stage transitions swap the biome's decor.
- ✅ **(engine)** `game/src/render.js` — new `drawDecor()` (called after `drawSolids`, before
  the actors) iterates `world.decor` and blits each `assets.get(d.key)` at native size,
  BASE-anchored to the ground surface under `d.x` (`parallax d.parallax ?? 1`), off-screen
  props skipped; an unloaded key draws nothing (pure dressing, no procedural fallback).

**Live evidence (verified by looking):** `experiments/set-dressing/live/level{2..7}-*.png`
(capture harness `assets/pipeline/tools/capture-decor.mjs`) — every decor-bearing stage now
renders its OWN distinct prop on the ground behind the actors: cascade valve (S2), snow pine
(S3), desert saguaro (S4), foundry molten vat (S5), caverns crystal cluster (S6), fortress
brazier (S7). `window.__game.decor` populated + every key `allLoaded=true`, 0 page errors,
boot selftest 118/118. Closes the GOAL's "every stage has its own set-dressing" on-screen.
**Follow-up (pipeline):** the `Decor-reachability` gate check can now flip from "WONT-RENDER"
to reachable (the render draw-path exists) — a pipeline-side gate-model update, non-blocking.

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
