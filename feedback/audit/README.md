# feedback/audit — deterministic weapon-defect audit (all 7 stages)

Independent, deterministic verifier for the creator **round-2 REJECT** (see
`CREATOR_FEEDBACK.md`): every armed entity must show **exactly ONE weapon, fired
from where it is drawn** — no sprite-baked gun sitting beside a procedural aiming
weapon ("two guns"), and no shot leaving a phantom origin (waist gun / hull-centre
turret). This audit proves that as a **FACT per stage**, across all 7 campaign
stages — not just the ones hand-checked.

## What it checks

The only two on-screen entities that overlay a **procedural** aiming weapon on a
body — the surface of the defect — are the **hero** (`render.js drawGun`) and the
**turret/cannon** (`render.js drawTurretBarrel`), exactly the two the creator named.
But the mandate is **every armed enemy**, so the audit does not merely *assert* the
rest are clean — it **enumerates every armed enemy each stage resolves** (from
config: `hero`, plus any spawn whose `ENEMIES` def can fire — `fireEvery`/`shotSpeed`/
`shellVy`/`isBoss`) and machine-verifies each draws exactly **one weapon type**:
`hero → gun`, `turret → barrel`, and **every other armed kind → none** (its baked
art is its only weapon). `boss`/`chopper` have **dedicated** draws (`drawBoss`/
`drawChopper`) that A3's whole-file counts imply but never inspect on their own — so
`A6` parses those functions directly and proves they invoke neither procedural weapon,
and that `drawEnemy` overlays no `drawGun` on any body. A kind drawing **both** a gun
and a barrel, or a non-`{hero,turret}` kind drawing **any** procedural weapon, trips
the per-stage `keys.everyArmedEnemyOneWeapon` fact (non-vacuous: verified to go red on
an injected boss-gun / hero-both defect).

- **Layer A — static render-path invariants** (parses the shipped `game/src`):
  - `A1` `drawPlayer` blits the hero body **only** through weaponless `*_noweapon`
    keys; the gun-baked `player_idle/run/jump/prone` keys are never blitted as a body.
  - `A2` `drawEnemy`'s turret branch blits the body via `turret_base` (weaponless
    dome) / `weaponlessTurret()`; the baked `turret` sprite is only the
    `assets.get(e.kind)` existence gate, never the drawn body.
  - `A3` the procedural weapons are the **only** weapons: `drawGun` is invoked only
    on hero paths, `drawTurretBarrel` only in the turret branches.
  - `A4` hero **shot origin == drawn muzzle**: `render.js drawGun` and `player.js
    shoot()` key off the SAME exported `HERO_GUN {pivotY, muzzle}` — one geometry.
  - `A5` turret **shot origin == drawn barrel tip**: `render.js drawTurretBarrel`
    and `enemy.js` turret fire key off the SAME `e.def.barrelPivotFromBottom` +
    `e.def.barrelLen` — one geometry.
  - `A6` **every OTHER armed enemy is weaponless-overlay**: the dedicated `drawBoss`/
    `drawChopper` invoke neither procedural weapon, and `drawEnemy` overlays no
    `drawGun` on any body — so `boss`/`chopper`/`flyer`/`mortar`/`grunt` each show at
    most one weapon (their own art). Closes the enumeration to **all** armed kinds.
  - `A7` **coverage / anti-staleness guard**: every enemy kind in `game/data/config.js`
    `ENEMIES` is MODELED by the audit (`RESOLVE`+`weaponDrawMap`). Fails **closed** the
    moment the campaign adds a new enemy/boss the audit hasn't weapon-classified — so
    the two-weapon FACT cannot silently lose coverage as content grows. Per-stage
    `keys.allSpawnsModeled` localizes the drift to the stage that introduced it. (Red =
    an **audit-coverage** gap this slice fixes by classifying the new kind — NOT a
    source bug.)
- **Layer B — per-stage runtime grounding** (drives the REAL browser build headless,
  one load per stage, `?headless=1&level=N`):
  - `B1` the stage boots on its configured theme; the enumerated armed entities
    instantiate in the live world.
  - `B2` the hero's fired bullet leaves the **hand muzzle** (upper body, <55% down,
    ahead of centre), not a waist/centre "second gun".
  - `B3` **every** turret in the stage fires from its **drawn barrel tip**: the shot
    origin is captured exactly (via a `spawnBullet` hook), its aim recovered from the
    shot's own velocity, and asserted equal to `pivot + aim·barrelLen` (≤2px) while
    displaced from the hull centre by the barrel length — i.e. one weapon, firing
    where it is drawn, not a phantom hull-centre turret.
  - `B4` **VISUAL capture**: the REAL 480×270 frame the shipped build renders is saved
    per stage to `report/frames/stage<N>-<theme>.png` (the showcase fires the whole run,
    so the hero is drawn mid-fire). The creator's defect is a *look* ("two guns"), so a
    number isn't enough — a reviewer LOOKS at these (embedded in `REPORT.md`, judged in
    `VISUAL-REVIEW.md`) to confirm one weapon per entity. CV is a pre-filter; eyes are
    the verdict.

Each stage's verdict = AND of the checks that apply. Layer-A facts are shared: a
render-path regression fails **every** stage (correct — it is a global break).

## Run

```
node feedback/audit/weapon-defect-audit.mjs                     # full: static FACT + browser grounding
WEAPON_AUDIT_STATIC_ONLY=1 node feedback/audit/weapon-defect-audit.mjs   # fast: deterministic static FACT only
```

Deterministic (no rng in the audit; the sim is seeded). Exit `0` iff all 7 stages
are clean, else `1` — so a deploy gate can consume it directly.

**Fail-closed static / skip-when-no-browser.** Layer A + the static `keys.*` checks
are the HARD two-weapon FACT and run with only Node (no Chrome). Layer B (per-stage
runtime grounding) drives a real headless browser; with **no headless Chrome /
`puppeteer-core` it SKIPS gracefully** (`[weapon-audit] SKIP:`, `runtime.*` marked
`skipped`, never red) and the static FACT still governs the exit code — exactly like
`deploy/live-selftest.sh`. A browser that IS present but a stage then fails to drive,
or a runtime origin assertion that goes red, is a **real** failure and blocks. This
makes the audit safe to run in a browserless gate. See **`INTEGRATION.md`** for the
drop-in `deploy/gate.sh` wiring (handoff to root.D).

Outputs (this dir only):
- `report/weapon-audit.json` — one machine-checked record per stage (verdict + every
  check); top-level `layerB.grounded` distinguishes a browser-grounded PASS from a
  static-only PASS.
- `REPORT.md` — regenerated human summary, with an `## OPEN ISSUES` section listing any
  failing fact (severity + repro + owner) so a real defect is recorded, never masked.
- `gate-step.sh` — self-contained ONE-LINE deploy-gate step (`bash feedback/audit/gate-step.sh`):
  resolves the repo root itself, runs the audit fast/static-only, prints one `[weapon-audit]`
  line, fail-closed exit (0 clean / 1 red / 0+SKIP if no toolchain). For root.D to source.
- `INTEGRATION.md` — the proposed deploy-gate wire (now one line via `gate-step.sh`) for
  root.D. Status banner tracks that the gate is **not yet wired** (as of 2026-07-12).

## Ownership & boundaries

This slice owns **only `feedback/audit/`**. It **reports**, it does not fix:

- A **source regression** (Layer A red, or a runtime origin mismatch) is a
  `game/src` / `game/data` defect → **root.A**. The audit leaves the failing fact +
  an OPEN ISSUE; it never blurs or skips to go green.
- **Wiring this audit into the deploy gate** (fail-closed on a red stage) is
  **root.D**'s deploy-gate half — this audit just provides the exit code + JSON.

**Not a creator close.** These are deterministic grounding FACTS that the two-weapon
defect is gone in the build; only a new creator **APPROVE** via the in-game panel
reopens the release gate (see `feedback/RE-APPROVAL-STATUS.md`).
