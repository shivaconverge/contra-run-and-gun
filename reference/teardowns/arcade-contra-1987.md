# Teardown — Contra (Arcade, 1987) · Konami

**Role in corpus:** NOSTALGIC-FEEL ANCHOR. This document codifies the invariants that
make a run-and-gun "feel like Contra." Every fidelity/feel judgment of OUR game must
preserve the **HARD INVARIANTS** below; deviating from them breaks the nostalgic feel
even if the art is more modern. Modern polish (juice, animation density) is layered
*on top of* these invariants, never in place of them — see the competitor teardowns for
that bar.

Source of record: <https://en.wikipedia.org/wiki/Contra_(video_game)> (fetched 2026-07-09).
Facts marked **[SRC]** are documented; facts marked **[MEASURE]** are feel invariants
whose exact numeric target must be frame-measured from captured footage in a later
capture pass (tracked as OPEN ISSUE CAP-1 in `manifest.json`) — do NOT invent the
numbers, measure them.

---

## 1. Identity invariants (what makes it Contra) — HARD

- **[SRC] One-hit death.** Contact with any enemy, projectile, or a bottomless pit
  costs a life. There is no health bar. This is the single most defining feel property:
  tension per screen is high, and the player reads *every* projectile.
- **[SRC] Limited continues / lives.** 3 continues in the arcade; on death the weapon
  reverts to the default rifle. (The 30-lives Konami Code is a *home/NES* addition, not
  arcade.) → **Weapon loss on death is an invariant**: dying is a real setback because
  you lose your Spread.
- **[SRC] Two-player simultaneous co-op** (Bill = P1, Lance = P2). The European
  cabinet (*Gryzor*) was alternating-only; the co-op version is the canonical feel.
- **[SRC] Run-right pacing.** The marquee stages (1 and 7) are horizontal
  side-scrollers — relentless forward push through a jungle/fortress.

## 2. Control & movement invariants — HARD identity, MEASURE for tuning

- **[SRC] Eight-way aim on the movement stick.** Move and aim share the stick; you can
  fire in 8 directions, including diagonals, and **while jumping**. Two buttons:
  **shoot (left), jump (right)**.
- **[SRC] Somersault jump.** The jump animation is a forward somersault, not a static
  arc pose — a signature silhouette.
- **[SRC] Prone.** Pressing down while standing goes prone to dodge over-fire and hit
  low targets. Prone ↔ stand ↔ jump transitions are core to the dodge game.
- **[MEASURE] Run speed** (px/frame at native res), **[MEASURE] jump apex height &
  airtime**, and **[MEASURE] jump arc shape** (Contra's arc is a *fixed* parabola — jump
  height is NOT variable-with-button-hold like Mario). Preserve fixed-arc feel; measure
  exact values from footage before locking OUR jump.
- **[MEASURE] Turnaround / aim-flip snappiness** — aiming feels instantaneous; there is
  no aim-rotation delay. Latency target to be measured against footage.

## 3. Weapon lineage & fantasy — HARD lineage, MEASURE for cadence

Default **Rifle** (unlimited ammo, single shots) upgradable to ONE of four guns; two
auxiliary power-ups stack on top. Icons are falcon-shaped power-up capsules. **[SRC]**:

| Icon | Weapon | Behavior (arcade) |
|------|--------|-------------------|
| M | Machine Gun | Rapid auto-fire while held |
| S | Spread / Shotgun | **Five bullets in separate directions** — the iconic crowd-clear |
| L | Laser | Single powerful beam |
| F | Fire | Rounds travel in a **corkscrew** pattern |
| R | Rapid Bullets (aux) | Boosts projectile/fire speed |
| B | Barrier (aux) | Temporary invulnerability |

- **Invariant:** The **Spread (S)** is the emotional centerpiece — the "I feel powerful"
  weapon. Its five-way fan and screen-clearing feel is a nostalgia load-bearing element.
- **Invariant:** Weapons are a *single-slot upgrade*, lost on death. No inventory.
- **[MEASURE]** per-weapon **fire rate, projectile speed/size, spread angle** — measure
  from footage; do not guess. These define whether OUR Spread "feels right."

## 4. Stage structure & perspective variety — HARD

Seven stages, three perspectives **[SRC]**:

1. **Side-scroll** — Jungle (Stage 1)
2. **Pseudo-3D "into the screen" base** (Stage 2) — proceed by shooting toward the
   background; the depth-run is a signature Contra set piece.
3. **Fixed-screen boss** (Stage 3) — gun aimed **upward** by default.
4. **Vertical scroll** — waterfall climb (Stage 4).
5. **Pseudo-3D base** (Stage 5).
6. **Fixed-screen boss** (Stage 6).
7. **Side-scroll** — final assault (Stage 7).

- **Invariant:** perspective *variety* within a run is part of the identity. A pure
  flat side-scroller under-delivers on "Contra"; the base-run and boss-arena beats are
  expected texture. (For a browser MVP, Stage-1 side-scroll + a fixed boss is the
  minimum that reads as Contra; the base-run is the aspirational differentiator.)

## 5. Enemy density & pacing — MEASURE

- **[MEASURE]** Baseline firefight enemy/projectile count, spawn cadence, and the
  balance point between "constant trickle of runners" and "aimed-shot pressure." Contra
  is *run-and-gun*, not bullet-hell — the density invariant is "always something to
  shoot, rarely an unavoidable wall of bullets." Measure the actual on-screen counts
  from Stage-1 footage before tuning OUR spawner.

## 6. Art / render invariants — HARD identity, MEASURE for palette

- **[SRC]** Arcade board: Nintendo VS. System. No documented resolution/sprite-count in
  the source article — **[MEASURE]** native resolution, sprite scale, and palette count
  from captured frames (do not assume NES specs; the arcade art is higher-fidelity than
  the NES port and the two must not be conflated).
  - **OUR render target (confirmed by parent 2026-07-09):** loop-root-B renders at
    **native 480×270 (16:9)**. Size all [MEASURE] comparisons and captured reference
    frames to that canvas so cadence/sprite-scale numbers are apples-to-apples. Arcade
    Contra is 4:3 (~256×224-class); expect to letterbox/re-frame arcade footage when
    overlaying, and compare *proportions* (apex as % of screen height, hero as % of
    screen), not raw pixels.
- **Invariant (silhouette):** hero (tank-top/bandana soldier) must stay instantly
  readable against jungle/metal backdrops; enemy and hero silhouettes never merge. This
  readability-under-density is the art job Contra always solves.

---

## Scoring hooks (how a build/QA loop uses this)

When judging OUR rendered frame against this anchor, check, in priority order:
1. **Identity present?** one-hit tension, 8-way aim incl. diagonals & airborne, prone,
   somersault jump, single-slot weapon lost on death, Spread fan. (Binary — missing any
   = not-Contra, regardless of polish.)
2. **Cadence right?** run speed / jump arc / fire rate within the measured [MEASURE]
   targets once CAP-1 capture lands.
3. **Reads under load?** hero silhouette + projectile legibility at firefight density.

Modern juice (hit-stop, screen shake, animation density) is scored against the
*competitor* teardowns, not this anchor — this anchor guards the soul, not the gloss.
