# Per-stage art kits — the SCALING ENGINE front door

**`python assets/pipeline/generate.py stage <biome>` = one command → a whole stage's art
kit.** This is deliverable #2's headline ("one command produces a new stage's art kit")
and strategy `task_scale_generate_batch_7x` (batched, resumable 7-stage pipeline). It
composes the four per-class recipes for a biome:

| class | source dict | key | wired? |
|-------|-------------|-----|--------|
| tileset    | `BIOME_TILESETS`  | `theme_<biome>` | ✅ synced + manifest |
| background | `BIOME_BACKDROPS` | `bg_<biome>`    | ✅ synced + manifest |
| boss       | `BIOME_BOSSES`    | `boss_<biome>`  | ✅ synced + manifest |
| set-dressing | `SET_DRESSING`  | `decor_<biome>_<name>` | ⏳ STAGED (engine decor render unwired — see `../GATE-NOTES.md`) |

A biome only gets the classes it defines (e.g. `cascade` = Stage 2 has no themed boss; it
uses the base chopper, so its kit is tileset + bg + decor). The **wired** classes sync to
`game/assets/` and merge into `assets/manifest.json` (additive, idempotent — the same
records `run()` produces, so `stage` and the full `run()` never drift; verified zero
manifest diff). The **staged** decor is written to `assets/sprites/` + the kit fragment.

## Commands
- `stage <biome>` — produce one stage's kit (`snow` / `desert` / `foundry` / `caverns` /
  `fortress` / `cascade`).
- `stage all` — every biome. **Resumable + timeout-safe** (strategy
  `obs_agent_timeout_vs_full_biome_gen`): every PixelLab result is cached the instant it
  returns, so an interrupted run re-runs at $0 and continues. Prefer per-biome `stage <id>`
  to stay under any single wall-clock window.

## Output
`<biome>.json` here = the combined kit fragment (`wired` + `staged` records) for that stage.

## Adding a NEW stage (the scaling recipe)
1. Add the biome's entry to the four dicts in `generate.py` (`BIOME_TILESETS`,
   `BIOME_BACKDROPS`, `BIOME_BOSSES`, `SET_DRESSING`) — a theme spec each.
2. `python generate.py stage <biome>` — the whole art kit, one command, made live.
3. `python generate.py verify` — the contract gate covers it (cross-source + reachability).
