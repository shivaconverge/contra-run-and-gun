# assets/

Static server root for the engine's sprites. The renderer looks them up via
`data/assets.js` and uses them automatically; until a file exists the engine
draws a procedural placeholder, so the slice stays playable with zero art.

## Synced from the art pipeline

`player_idle.png` is the pipeline's QA-**PASS** commando sprite. The pipeline
(`assets/pipeline/generate.py`) now **auto-syncs** it here from the source of
truth at `../../assets/sprites/player_idle.png` on every run — no manual `cp`.
The server root is `game/`, so the sprite must live here for the browser. Manual
re-sync if ever needed:

```sh
cp ../../assets/sprites/player_idle.png ./player_idle.png
```

`player_run.png` is intentionally **not** synced — it QA-FAILED (motion-blur
streaks, frame drift; see `assets/QA-NOTES.md`) and is disabled upstream.

Keys and sizes (player_idle CONFIRMED in-engine 2026-07-09; sprites authored at
**native display resolution** so `render.js` blits them near 1:1 — see
`assets/STYLE.md` "Engine scale"):

| key          | size            | notes                                       |
|--------------|-----------------|---------------------------------------------|
| player_idle  | **20×29** ✓     | headband commando, faces right, native scale |
| player_run   | 20×29 × N       | run cycle (pending re-do; see QA OPEN ISSUES)|
| grunt        | ~14×20          | red foot soldier (hitbox 14×18)             |
| turret       | ~18×16          | sentry dome + barrel                        |
| tiles        | tile-native     | ground/platform                             |

Player hitbox is 12×20 in a 480×270 view; `drawPlayerSprite` scales sprites to
`p.h*1.4 ≈ 28 px` tall. Enemy sizes above are **rough** (matched to hitboxes in
`data/config.js`) until their sprites are authored + verified in-engine.
