# WEAPONLESS hero + turret bodies — the creator round-2 two-gun defect fix

**Deliverable #3 (unblocks the sibling weapon-defect loop).** Regenerated the hero
(all poses) and the purple turret as **weaponless bodies with NO baked weapon**, so the
engine's existing procedural aiming weapon (`render.js drawGun` / `drawTurretBarrel`) is
the **sole** gun per entity. Same sprite keys → a byte-compatible **drop-in, no engine
wiring change**.

## Why (CREATOR_FEEDBACK.md — ROUND 2, still REJECT)
The armed sprites baked a fixed-direction weapon (hero: "rifle at his side pointing
right"; turret: "single thick cannon barrel"). The engine ALSO draws a procedural aiming
weapon over them → **two guns on screen** (the creator's "second gun at the waist" /
"phantom turret"). `render.js:1169` states the procedural gun is "meant to be the ONLY
gun once the art loop ships weaponless hero sprites (same keys)". This ships them.

## What changed (generate.py, all cached-deterministic)
| key | before | after | prompt/seed |
|-----|--------|-------|-------------|
| `player_idle` | armed, rifle across body | weaponless commando, empty hands | `STYLE` / seed 212 |
| `player_run` (4f) | armed | weaponless stride, no rifle any frame | derives from idle |
| `player_prone` | aiming a rifle | propped on elbows, empty hands | `PRONE_*` / seed 33 |
| `player_jump` | holding a rifle | airborne, no gun | `JUMP_*` / seed 61 |
| `turret` | purple dome **+ barrel** | bare purple dome + base, no barrel | `ENEMY_SPECS.turret` / seed 220 |

Selection: 4 hero candidates (`hero_A..D`) + 2 turret (`turret_A|B`) generated via
PixelLab and judged **by looking** — `hero_C` (cleanest 19-colour weaponless read) and
`turret_A` (clean dome, no barrel) won. Candidates + before/after are in this folder.

## Evidence (this folder)
- `COMPARE-hero-idle.png` — BEFORE armed (visible rifle) vs AFTER weaponless.
- `COMPARE-turret.png` — BEFORE barrel vs AFTER bare dome.
- `MOCK-one-gun.png` — weaponless body + the engine's `drawGun` geometry = ONE gun at
  the hands (`gx=x+w/2, gy=y+h*0.28`).
- `hero_A..D_6x.png`, `turret_A|B_6x.png` — the raw candidate bake-off.
- `BEFORE-*.png` — the armed sprites this replaced.
These are **real PixelLab pixflux** outputs (also satisfies deliverable #1: real
on-STYLE-BIBLE art end-to-end; total spend this cycle $0.04).

## Drop-in contract for the sibling loops
- **No engine change required.** Same keys; the run strip is pinned to the engine's
  hardcoded `PLAYER_RUN {fw:22,fh:31}` cell (`pack_strip(..., cell=(22,31))`, feet-
  anchored — clip verified lossless by looking) so it slices correctly.
- **Contract gate green:** `python assets/pipeline/generate.py verify` → 19/19, 0
  violations (cross-source + reachability + no-placeholder + blit-meta all pass).
- **Gun mount:** hero — `drawGun` at the hands (chest height, `h*0.28`, centred). The
  weaponless hero stands hands-at-sides; if the composite wants the gun visually gripped,
  the engine loop can nudge `drawGun` `gy`, or ping me for a forward-extended-hand pose
  variant. Turret — barrel pivot is engine data (`config barrelPivotFromBottom/
  barrelLen`), independent of the (now bare) dome art.
- **What's left for a full creator re-APPROVE (NOT art):** the engine must still (a) show
  the correct **8-way directional** gun/frame per aim and fire from that muzzle, and (b)
  give the **boss movement** (CREATOR_FEEDBACK #4). Those are engine-side.
