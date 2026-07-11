# Pipeline contract-gate notes (`generate.py verify`)

The gate computes MECHANICAL contract FACTS across the shipped sprite graph
(transparency/palette/dims/sync + cross-source + draw-reachability + no-placeholder +
blit-meta). Fidelity stays the by-looking verdict, never this gate. Exit 0 = green.

## OPEN ISSUES

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
