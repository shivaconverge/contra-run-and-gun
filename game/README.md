# Run-and-Gun Vertical Slice (live, browser-playable)

A zero-build, zero-dependency vanilla-JS + Canvas2D vertical slice of a
Contra-lineage run-and-gun game. Runs from a static file server.

## Play it (GO-LIVE — one command, zero dependencies)

```sh
cd game
npm start            # → http://localhost:8080/   (just Node — no install/build)
# or:  node serve.mjs 3000        # custom port (auto-increments if busy)
# or:  python3 -m http.server 8080   # fallback, no Node
```

`serve.mjs` is a zero-dependency Node static server (correct MIME types so the ES
modules load) that serves this `game/` directory — the single, always-available
way to bring the slice **live and reachable by a real player**. Open the URL and
you land on the title screen; pick a mode and press **Z/Space** to start.

### Deploy anywhere (static, subpath-portable)

The whole thing is static files with **only relative paths** — drop `game/` on any
static host (GitHub Pages, itch.io, Netlify, S3…). Verified live at a subpath
(`/game/…`): the full ES-module graph and all sprites resolve, 52/52 self-test.
It must be served over **http(s)** (ES modules are blocked on `file://`); if you
open it as a local file the page shows a clear "serve me to play" card instead of
a blank screen.

Controls: **←/→ or A/D** move · **↑** aim up (8-way incl. diagonals & airborne) ·
**↓** prone on the ground / aim down in the air · **Z/Space** jump · **X** fire ·
**R** restart · **1** Arcade / **2** Casual · **M** mute. The build opens on an
arcade **title screen** (pick a mode, **Z/Space** to start), then fight to the
**Sentinel boss** and defeat it — hold **↓** to prone under its cannon volleys.

**Difficulty (data-driven, `data/config.js` `DIFFICULTY`):** **Arcade** (default) is
the purist one-hit-death identity; **Casual** is an opt-in accessibility mode (a
2-hit shield + extra lives) — the arcade invariant is never diluted.

**One-hit death** (Contra invariant — no health bar): any hit costs a life and
reverts your weapon to the rifle. Grab weapon capsules — **S**pread, **M**achine
(rapid), **L**aser (piercing beam), **F**ire (corkscrew) — single weapon slot,
lost on death.

## Why this stack

Vanilla Canvas2D + ES modules: no build step, instant edit-refresh, trivially
served, and it keeps playing after every commit. Pixi/Kaplay were considered
(strategy `task_prior_art_web_engines`) but add a bundler and dependency
surface the slice does not yet need. Revisit if we hit fill-rate limits.

## Architecture (data-driven where cheap)

- `data/config.js` — physics, weapons, enemies, feel constants (tunable).
- `data/level1.js` — level geometry + enemy spawns as data.
- `data/assets.js` — sprite manifest (paths under `assets/`).
- `src/world.js` — owns the sim; advances one **fixed timestep** at a time.
- `src/player.js` — run / fixed-arc jump (coyote + buffer) / 8-way aim / prone / shoot.
- `src/enemy.js` — enemy set: walking Grunt, Sentry turret, + the **Sentinel boss**
  (telegraphed cannon volleys you prone/jump to duck; defeat it to clear the stage).
- `src/physics.js` — AABB move-and-collide vs solids (ground + platforms).
- `src/feel.js` — **feel kernel**: hit-stop + trauma-based screen shake.
- `src/audio.js` — procedural Web Audio SFX (no audio assets); sim emits event
  strings, the live loop plays them (M mutes). Deterministic sim untouched.
- `src/entities.js` — bullets + particles.
- `src/render.js` — renderer: real sprites when loaded, else procedural
  placeholders; 5-layer parallax jungle (moon, ridges, canopy, ferns) + textured
  ground/platforms (fallback until authored `tiles` art lands).
- `src/main.js` — boot, fixed-timestep loop, headless harness.

## Game feel implemented

Fixed 60 Hz sim (deterministic, seeded RNG) · **fixed-arc jump** (arcade-faithful,
not button-hold-variable) with coyote time + input buffering · 8-way Contra aiming ·
activation-gated **enemy clusters** (run-and-gun density) · **prone** (hold ↓ to duck aimed
fire, gun drops low) · **hit-stop** freeze frames on hit/kill/hurt · **recoil**
(self push + visual kick) · **trauma screen shake** (shake ∝ trauma²) ·
**glowing tracer projectiles** + chunky warm star **muzzle flash** ·
hit-flash, death bursts, **wall-impact sparks** · i-frames + knockback ·
**procedural SFX** (shoot / jump / hit / explosion / boss / clear, synthesized).

## Art assumption (declared)

No real art has landed yet. Every `data/assets.js` path is expected to 404 and
the renderer falls back to procedural placeholders. When an art loop drops a PNG
at a listed path, it is picked up on next load — **no engine change needed**.

## Headless verification

`?headless=1&frames=N` steps the sim synchronously with a scripted showcase
input timeline and renders one deterministic frame, publishing a summary at
`window.__bench` and in `#headless-done`. See `QA-NOTES.md` for captured runs.

`?selftest=1` runs the in-engine behavior suite (`src/selftest.js`) against the
real World/Player/physics and publishes pass/fail at `window.__selftest`.
