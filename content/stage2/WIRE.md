# Stage-2 WIRE — copy-paste engine patch (PROVEN end-to-end)

**Owner:** content/ (root.G) · **Consumer:** root.B (engine) · mirrors
`assets/READY-TO-WIRE.md`'s friction-killer pattern: exact paste-ready code so
Stage-2 ships in minutes, not a spec-reading exercise. **Attacks the standing
strategy signal `obs_gate_greenlights_but_nothing_ships` (SHIP is the binding
constraint).**

## Proof this actually works (not a paper spec)
I copied the shipped `game/` to a throwaway dir, applied EXACTLY the patches below,
copied `content/stage2/level2.data.js` → `game/data/level2.js`, and DROVE the real
patched sim (`content/tools/` bot style). Observed FACTS:
- **Boss registers:** the generalized finder returns `bossFound: "chopper"` (via the
  `isBoss` flag) — the level's chopper is picked up as the boss. ✓
- **Plays without crash:** chopper sweeps/fires/bombs for thousands of frames; boss
  HP bar activates at **~17.8s** of stage traversal (≈ Stage-1's 20.4s). ✓
- **Phase-2 enrage fires:** `enrageReachedSec ~12.8s` into the isolated fight. ✓
- **Boss is DEFEATABLE → win path closes:** isolated boss fight (spread + up-aim +
  i-frames, like the engine's `scenario=boss`) → `bossDead: true`, `killSeconds 62.8`. ✓

So the archetype + boss-finder + level data are **verified live**. (The §4
STAGE-1→STAGE-2 transition snippet below is PROPOSED/untested — I drove LEVEL2
directly; that half still needs root.B to wire + a selftest.)

## ⚠ OPEN balance findings (REPORT, don't work around — tune LIVE, not from a bot)
Measured with an **aim-tracking headless bot** (aims the 8-way at the boss's live
position each frame, spread + permanent i-frames — a competent-player proxy). **The
honest result: this instrument is a reliable *defeatability* oracle, NOT a precise
balance oracle** — see the caveat below. Treat these as directional.

- **🔴 CHOP-1 (medium-high — SHIPPED REGRESSION, see `QA-NOTES.md`):** root.B applied
  the tune `hp78 / hoverY120 / sweepAmp90`. Driving the REAL shipped build, the boss
  now **STALLS at exactly 31 HP** (= the enrage threshold) and my bot cannot finish it
  at any firing position — because `sweepAmp:90` keeps the enraged low-hover chopper
  ~30px outside the barrier player's `spread` cone. **RETRACTED:** my earlier
  "narrow sweepAmp to ~90" was speculative and grounding shows it HARMFUL. **Fix
  (data-backed, validated under a LEADING-aim bot):** keep `hp78`/`hoverY120`, set
  **`sweepAmp` to ~120** → boss dies ~55s ✓ (shipped 90 → >180s stall). NOTE: adding
  `enrageSweepAmp` alone does NOT work — `enemy.js` reads `this.def.sweepAmp` for both
  phases, so either change base `sweepAmp` (one-number fix) or add the field AND wire
  the enraged branch to read it. The stall survives target-leading (positional, not an
  aim artifact). Full evidence + repro in `content/stage2/QA-NOTES.md` CHOP-1.
- **BAL-1 (superseded by CHOP-1):** HP is a directional lever but noisy/non-monotonic
  at fixed geometry (`hp110→62.8s · 100→66.1 · 90→51.8 · 85→44.3 · 80→51.1 · 75→44.1
  · 70→33.5s`); the boss is defeatable across hp 70–110 **only at sweepAmp≥~120**. Do
  NOT ship any single number as "proven optimal" (see caveat).
- **BAL-2 (low/expected):** aiming UP for the high hover materially raises damage
  (horizontal-only 110→94 vs up-aim 110→72). Normal Contra aim-up skill, not a
  defect — but confirm the barrier firing line (x2140) gives a clean up-right line to
  the full sweep arc (x2220–2460), no dead zones.
- **⚠ INSTRUMENT CAVEAT (FACTS-vs-judgments):** headless kill-time is **noisy and
  geometry-sensitive** — varying `hoverY`/`sweepAmp` (or even the Stage-1 Sentinel at
  an off-center player x) can make the fixed-position bot whiff entirely, because a
  sweeping aerial target + spread pellets + one bot position is a near-chaotic system.
  So kill-time here proves **"can it die" (yes, widely), not "what's the right feel."**
  Boss FEEL/balance needs a **live human (incl. mobile) playtest** — do not let root.B
  treat the numbers above as a balance verdict. Reported, not worked around.

These are TUNING, not wire bugs — the wire (spawn/find/enrage/defeat) is proven correct.

---

## Patch 1 — `game/data/config.js`: add the `chopper` archetype
Insert into `ENEMIES` (e.g. right after the `boss` block). Every field is referenced
by Patch 2 / `Enemy._lobShell`; verified against the real config idioms.

```js
  // Stage-2 boss: ATTACK CHOPPER "GUNSHIP" — a MOVING aerial boss (content/stage2).
  // Sweeps horizontally, hovers, fires aimed bursts + lobs bombs; phase-2 drops low.
  chopper: {
    name: 'Gunship',
    w: 62, h: 30,            // SIM hitbox = fuselage of the 76x52 art (rotor/boom excluded)
    hp: 110,                 // ⚠ BAL-1: consider ~70–80 (see WIRE OPEN findings)
    speed: 0,
    contactDamage: 1,
    score: 3500,
    gravity: false,
    isBoss: true,            // HP bar + name callout + win path (generalized boss-finder)
    shotSpeed: 2.6,
    fireEvery: 70, enrageFireEvery: 44,
    bombEvery: 130, enrageBombEvery: 90,
    sweepAmp: 120, sweepFreq: 0.018, enrageSweepFreq: 0.03,  // ⚠ keep ≥120 (CHOP-1: 90 stalls the fight)
    hoverY: 96, enrageHoverY: 150,                            // hoverY~120 ok; do NOT also narrow sweep
    enrageAt: 0.4,
    // bomb arc (reuses Enemy._lobShell — same fields as mortar)
    shellVy: 3.4, shellGravity: 0.10, shellVxMax: 2.4,
    color: '#8a9098',        // gunmetal
  },
```

## Patch 2 — `game/src/enemy.js`: add the `chopper` behavior branch
Add as a new `else if` in `update(world)`, immediately AFTER the `boss` branch (just
before the final `if (this.flash > 0) this.flash--;`). Uses only existing helpers
(`world.spawnBullet`, `world.onBossEnrage`, `this._lobShell`, `sign`, `TELEGRAPH_FRAMES`).

```js
    } else if (this.kind === 'chopper') {
      // Stage-2 boss: a MOVING aerial GUNSHIP. Sweeps horizontally (sine around
      // baseX), eases to a hover altitude (drops to enrageHoverY when enraged),
      // fires aimed bursts and lobs bombs. Deterministic (sine + cooldown, no rng).
      if (this.baseX === undefined) { this.baseX = this.x; this.baseY = this.y; }
      this.t = (this.t || 0) + 1;
      if (!this.enraged && this.hp <= this.def.hp * this.def.enrageAt) {
        this.enraged = true;
        this.cooldown = Math.min(this.cooldown, 16);
        if (world.onBossEnrage) world.onBossEnrage(this);
      }
      const sweepFreq = this.enraged ? this.def.enrageSweepFreq : this.def.sweepFreq;
      const hoverY = this.enraged ? this.def.enrageHoverY : this.def.hoverY;
      this.x = this.baseX + Math.sin(this.t * sweepFreq) * this.def.sweepAmp;
      this.y += sign(hoverY - this.y) * Math.min(1.5, Math.abs(hoverY - this.y));
      this.dir = -1;
      // Aimed burst (like flyer/turret).
      const fireEvery = this.enraged ? this.def.enrageFireEvery : this.def.fireEvery;
      this.telegraph = Math.max(0, this.telegraph - 1);
      this.cooldown--;
      if (this.cooldown === TELEGRAPH_FRAMES) this.telegraph = TELEGRAPH_FRAMES;
      if (this.cooldown <= 0) {
        this.cooldown = fireEvery;
        this.telegraph = 0;
        const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
        const dx = (p.x + p.w / 2) - cx, dy = (p.y + p.h / 2) - cy;
        const d = Math.hypot(dx, dy) || 1;
        world.spawnBullet(cx, cy, (dx / d) * this.def.shotSpeed, (dy / d) * this.def.shotSpeed, {
          from: 'enemy', damage: this.def.contactDamage, color: '#ffd24a', life: 200, w: 5, h: 5,
        });
      }
      // Bomb drop (reuse the mortar parabolic lob).
      const bombEvery = this.enraged ? this.def.enrageBombEvery : this.def.bombEvery;
      this.bombCd = (this.bombCd === undefined ? Math.floor(this.def.bombEvery * 0.5) : this.bombCd) - 1;
      if (this.bombCd <= 0) { this.bombCd = bombEvery; this._lobShell(world); }
    }
```

## Patch 3 — `game/src/world.js`: generalize the boss-finder (one line)
`reset()` currently hardcodes `kind === 'boss'`; a chopper is skipped without this.

```js
    // BEFORE:
    this.boss = this.enemies.find((e) => e.kind === 'boss') || null;
    // AFTER:
    this.boss = this.enemies.find((e) => e.kind === 'boss' || (e.def && e.def.isBoss)) || null;
```

## Patch 4 — render (root.C hand-off, not proven headless)
`render.js` `drawEnemy` blits `assets.get(e.kind)`, so a `chopper` sprite key (root.C's
76×52 candidate, see `SPEC.md §6`) draws automatically once added to `manifest.json` +
`game/data/assets.js`. The boss-specific HP-bar/callout draw branches on
`e.kind === 'boss'` (render.js:558, verified this cycle) — generalize those to `e.kind === 'boss' ||
e.def?.isBoss` (or add a `chopper` draw branch) so the chopper shows its HP bar. Until
the sprite lands the engine can fall back to the `color` swatch (gunmetal) — playable,
just unpolished.

## Patch 5 — `game/main.js`: STAGE-1 → STAGE-2 transition (PROPOSED — untested)
Today `main.js` boots one `World(LEVEL1)` and `boss.dead → status='cleared'` ends the
game (`world.js:171`). Minimal chaining (sketch — root.B owns final form + a selftest):

```js
import { LEVEL2 } from '../data/level2.js';
const STAGES = [LEVEL1, LEVEL2];
let stageIndex = 0;
// on 'clear': if another stage remains, advance instead of ending —
world.on('clear', () => {
  if (stageIndex < STAGES.length - 1) {
    stageIndex++;
    // brief STAGE CLEAR interstitial, then swap in the next stage carrying score/lives:
    const score = world.score, lives = world.lives;
    world = new World(STAGES[stageIndex], seed, world.modeKey);
    world.score = score; world.lives = lives; // weapon reverts to rifle (arcade single-slot)
    window.__game = world;
  } // else: real end-of-game (victory / attract)
});
```
**De-risk first:** ship LEVEL2 behind `?level=2` (a one-line `World(params.get('level')==='2'
? LEVEL2 : LEVEL1, …)`) to verify the level+boss live, THEN wire the auto-transition.
A `selftest`/playtest scenario should clear Stage-1, assert the swap fires, and drive
Stage-2 to its boss (assert intended behavior; leave a failing test if it regresses).

---
_Provenance: patches 1–3 + level2.data.js verified live on a throwaway build (boss
found via isBoss, plays, enrage ~13s, defeatable across hp 70–110; kill-time evidence
+ instrument caveat in `content/tools/chopper-killtime-2026-07-10.json`). Patches 4–5
are faithful-to-idiom but NOT headless-proven. render.js line (:558) checked this
cycle; re-check all line numbers before applying — engine churns._
