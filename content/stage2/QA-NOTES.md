# Stage-2 content QA notes

Grounding notes from PLAYING the real shipped build (root.B wired Stage-2 behind
`?level=2`; `game/data/level2.js` == my `content/stage2/level2.data.js` verbatim,
`ENEMIES.chopper` in `game/data/config.js`).

## OPEN ISSUES

### 2026-07-10 · CHOP-1 (MEDIUM-HIGH) — shipped chopper stalls at the enrage HP; likely a reachability regression from `sweepAmp:90`
**Severity:** medium-high (a boss that may be un-finishable = a stage that can't be
cleared = the content-depth win is void). **Status:** CONFIRMED by headless bot;
needs LIVE human confirmation (my bot is a defeatability proxy, not a feel oracle).

**What I observed (FACT, reproducible):** driving the REAL shipped build's Stage-2
boss in isolation (only the chopper, player at the barrier firing line, `spread` +
aim-tracking bot + permanent i-frames), the chopper's HP **plateaus at exactly 31 and
never drops further** across 3 minutes / all firing positions x2060–2135. 31 == the
enrage threshold (`hp 78 × enrageAt 0.4 = 31.2`), i.e. it dies down to enrage then
gets STUCK.

**Isolated cause = `sweepAmp: 90`** (the shipped value). Holding everything else at
the shipped config and varying only the sweep:
| config | result |
|--------|--------|
| SHIPPED `hp78 / hoverY120 / sweepAmp90` | **STUCK at 31 HP (not dead, >180s)** |
| `hp78 / hoverY120 / sweepAmp120` | dies **54.9s** ✓ |
| `hp78 / hoverY96 / sweepAmp120` (orig geom) | dies **47.7s** ✓ |
| `hp110 / hoverY96 / sweepAmp120` (pre-tune) | dies **62.8s** ✓ |

**Mechanism (hypothesis):** post-enrage the chopper hovers low (`enrageHoverY150`)
and sweeps a NARROW band (`baseX2340 ± 90` = x2250–2430). From the barrier firing
line (~x2090–2135) the `spread` fan only connects when the boss swings close enough;
`sweepAmp120` (x2220–2460) brings it into the tight-fan zone, `sweepAmp90` keeps it
~30px too far, so the last 40% of HP can't be chipped off. (`enrageHoverY` also has no
paired `enrageSweepAmp`, so the enraged boss inherits the narrow base sweep.)

**This is my own bad suggestion.** `content/stage2/WIRE.md` BAL-1 speculatively
suggested "narrow `sweepAmp` to ~90"; root.B applied it. Grounding now shows it
harmful — RETRACTED (see WIRE.md).

**STRENGTHENED 2026-07-10 (leading-aim + fix validation — still shipped, unfixed):**
- **The stall survives target-LEADING.** Re-ran with a bot that leads the sweeping
  boss (aims at `bossPos + bossVel×lead` for lead 8/20/40 frames) — spread STILL floors
  at exactly 31 at every lead. So the 31-HP wall is a **positional/reachability**
  property of the enrage phase (enraged boss hovers low @y150 and sweeps a narrow
  ±90 band that leaves the barrier player's reach), **NOT** a no-lead aiming artifact.
  A real human leads too and shares the same fixed firing line (barrier @x2140) → the
  human-also-affected case is now stronger (still not 100% — a human can also
  jump/reposition, which my parked bot doesn't; a live playtest still owns final feel).
- **The fix is VALIDATED (same leading instrument):** `sweepAmp:120` → boss **dies in
  54.9s**; shipped `sweepAmp:90` → `>180s` stall. Clean, reproducible.
- **⚠ Correction to my earlier fix note:** "add `enrageSweepAmp:~120`" does NOT work
  as-is — `enemy.js` reads `this.def.sweepAmp` for BOTH phases; there is no
  `enrageSweepAmp` field in the code path. So the fix is EITHER (a) set base
  **`sweepAmp` to ~120** (proven), OR (b) add an `enrageSweepAmp` field AND wire
  `enemy.js`'s enraged branch to read it. (a) is the one-number fix.
- **Weapon note (INCONCLUSIVE — not asserted):** at this parked position only `spread`
  chipped HP at all; rifle/machine/laser/fire showed 0 damage even with leading. That
  is likely a range/single-projectile-vs-parked-position confound, NOT a claim that
  those guns can't hit the chopper — a moving/repositioning human would differ. Left
  as a flag, not a finding.

**Recommended fix (data-backed):** keep `hp78`/`hoverY120`, set **`sweepAmp` to ~120**
(dies ~55s, Stage-1-comparable). Then LIVE human playtest (desktop + mobile) to confirm.

**Repro:** apply nothing (shipped). Node harness importing `game/src/world.js` +
`game/data/level2.js`: filter enemies to `e.def.isBoss`, park player x2090/y210 with
`spread`, aim-tracking (±lead) bot + `player.iframe=999` each step; `boss.hp` floors at
31. Evidence: `content/tools/chopper-killtime-2026-07-10.json`.

---
_Living doc — resolve CHOP-1 when root.B sets sweepAmp~120 + a live playtest confirms a clean kill._
