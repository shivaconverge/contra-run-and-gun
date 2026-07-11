# Assessment #7 — weapon roster (M/S/L lineage) vs weapon-juice bar

**Date:** 2026-07-09 · **Subject:** `game/index.html` @ `59c7e01` · **Native:** 480×270 ·
**Method:** ran the LIVE build; set each weapon via the game's own `player.setWeapon(key)`
(a REAL state via the real API — single-slot economy blocks free cycling, so this is the
honest way to exercise each), fired, grabbed the canvas, and **looked**. Evidence:
`frames/our-game-weapons/{rifle,spread,machine,laser}.png`.

Two new weapons landed (Machine, Laser) — dimension 4 (weapon juice) + arcade §3 weapon
lineage.

---

## Arcade weapon-lineage coverage (§3: M/S/L/F + R/B)
`teardowns/arcade-contra-1987.md §3` documents the arcade guns: **M**achine, **S**pread,
**L**aser, **F**ire. OUR roster is now **Rifle + Spread(S) + Machine(M) + Laser(L)** →
**M/S/L covered**; only **F (Fire/corkscrew)** is absent (WEAP-1, low/optional). Configs are
arcade-faithful: Machine = fast single stream (fireRate 3); Laser = slow, powerful, PIERCING
beam (damage 3, `pierce:true`). This is a strong lineage match for a Stage-1 slice.

## Looked — each weapon reads distinct + legible (dim-4 core job)
- **Rifle** — single yellow shots. Baseline, clean.
- **Spread (S)** — 5-pellet cyan fan, legible spread. (The nostalgic centerpiece; reads.)
- **Machine (M) — ✅** dense fast **warm-gold stream** streaming to the target; reads
  unmistakably as a machine gun (rapid, alive). Muzzle flash present.
- **Laser (L) — ✅** a long thin **mint-green beam** — elongated and bright, clearly distinct
  from the bullet weapons; reads as a laser. (Piercing is a mechanic — config `pierce:true`
  + selftest territory; the LOOK is a proper beam.)

**Weapon identity is solid:** each gun has a unique **color + projectile shape**
(yellow dot / cyan fan / gold stream / mint beam), so the player always knows what they're
holding — exactly the arcade convention (visually-distinct weapons). Muzzle flash on all.

## vs the competitor weapon-juice bar
Competitors (Blazing Chrome, Metal Slug, Huntdown — `frames/*/motion/`) push bigger
tracer-glow + layered impact sparks. OURS is **legible and distinct but simpler**:
projectiles are flat dashes/beam vs competitor glow/tracer. Not a defect — a low polish
lever (carried under weapon-juice; the roster + distinctness is the higher-value part, and
it's met).

## Scores (vs ASSESS-6)
- **Weapon juice — 3.0 → 3.5** — roster breadth (M/S/L) + clear per-weapon identity lift it;
  projectile-glow polish is the remaining headroom.

## Open issues after this assessment
- **WEAP-1 (low/optional)** — Fire (F, corkscrew) is the one missing arcade lineage gun;
  optional for a Stage-1 slice.
- **Weapon-projectile glow/tracer** — low polish vs competitor bar (carried).
- LEAP-1, BOSS-1, HUD-1 — carried low.
