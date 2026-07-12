# Campaign BALANCE & real-play grounding — damage ON, natural progression

**Perspective (this seat):** a real player driving the **FULL 7-stage campaign** in a
**real headless browser**, advancing **only by beating each stage's boss for real** and
taking the shipped next-stage transition — **never `?level=`, never a force-killed boss,
never the N-key-without-a-clear affordance**. For each stage I record what a player
actually feels: reachable, boss beatable, time-to-clear, **deaths and their cause
(pit / contact / projectile)**, lives remaining, and any soft-lock / unwinnable state.
Then I **look at** a rendered frame of every stage and give a distinctness verdict.

**Harness:** [`campaign-playthrough.mjs`](./campaign-playthrough.mjs) (drives the real
`game/` build via puppeteer-core + the shared `playtest/e2e/harness.mjs` server/Chrome
infra). Run it from repo root:

```bash
node playtest/balance/campaign-playthrough.mjs
```

**Evidence written here:** [`campaign-playthrough.json`](./campaign-playthrough.json)
(every FACT below, machine-readable, incl. the full per-death log) +
`frames/<mode>/stage-N-boss.png` (real mid-boss-fight frames off the live `<canvas>`,
one per stage per mode).

**Why this seat is DISTINCT from the existing gates.** The `scenario=campaign` oracle in
`game/src/main.js` and `playtest/acceptance/scope-served.mjs` both drive the campaign with
**invincibility ON** (`p.iframe = 999`) — by construction a one-hit-death arcade run with
damage OFF can never die, so those gates prove **traversability + boss defeatability + the
transition chain** but *cannot surface a survival/balance problem*. scope-served
additionally uses the N-key affordance **and marks the boss dead** to make the 7-stage walk
deterministic. This harness is the missing half: **damage ON (invincibility OFF)**, in
**both arcade and casual**, with each boss **beaten by genuinely shooting it down**, so the
numbers are real end-user pressure.

---

## THE BOT (honest disclosure — read before trusting the arcade numbers)

The driver is a **baseline** run-and-gun heuristic, **not a skilled human**: always advance
right, hop when there's no ground just ahead (clears pits/water), grab on-path weapon
pickups by running over them, and once the boss is live aim vertically at it and hold fire.
It has **one survival reflex** — jump over / prone under an enemy bullet that is close, on
its horizontal band, and closing in (the machine analog of weaving aimed fire). It does
**not** memorise boss patterns or lane-weave like a practised player.

**So the arcade death counts are an UPPER BOUND on difficulty for a naive player, not a
claim the game is unwinnable.** Casual mode (5 lives + a 2-hit shield) is the accessibility
read; the invincible pass is the pure reach/defeat ground truth. Every judgment below is
framed accordingly, and separates **FACTS** (reach / defeat / deaths / causes / lives /
frames, computed from the live world each frame) from **JUDGMENTS** (the balance opinion and
the by-looking verdict).

Deterministic: `seed=1234`, `STAGE_BUDGET=15000` frames/stage (~250 s — DPS is never the
limiter; survival is).

---

## HEADLINE FACTS (this run)

| Fact | Result |
|------|--------|
| All 7 stages **reachable** via natural progression (invincible ground truth) | ✅ **7/7** |
| All 7 bosses **defeatable** by genuinely shooting them (invincible) → VICTORY | ✅ **yes** |
| **Soft-locks / unwinnable geometry** detected (any mode) | ✅ **none** |
| Damage-ON **ARCADE** baseline-bot outcome | ❌ **GAME OVER at Stage-1 boss** (0/7 cleared, 4 deaths) |
| Damage-ON **CASUAL** baseline-bot outcome | ⚠️ **GAME OVER at Stage-2 boss** (1/7 cleared, 6 deaths) |
| **Every** damage-on death cause | **projectile, 100%** — at the boss barrier |
| Pit / contact deaths across all traversal, both modes | **0 / 0** |

**One-line read:** the campaign's spine is sound (reachable, defeatable, no soft-locks, all
7 biomes distinct), and **level traversal is fair** — zero pit and zero contact deaths, the
gap-hops and enemy mix are survivable. **The entire difficulty is boss-projectile
survival**, and the **arcade first-boss wall is very steep** for anything short of skilled
human pattern-play.

---

## Ground truth — reach + defeatability + time-to-clear (invincible)

Same bot, invincibility ON, natural `requestNextStage` between stages. This isolates
"geometry/DPS works" from "survival is hard".

| Stage | Biome | Boss (HP) | Reached boss | Beaten | Boss-inclusive clear |
|------:|-------|-----------|:---:|:---:|--------:|
| 1 | Jungle Approach | Sentinel (90) | ✅ | ✅ | **30.7 s** |
| 2 | Cascade Base | Gunship (78) | ✅ | ✅ | **65.0 s** |
| 3 | Frozen Ridge | Ice Sentinel (86) | ✅ | ✅ | **23.2 s** |
| 4 | Scorched Dunes | Sand Gunship (88) | ✅ | ✅ | **73.2 s** |
| 5 | Iron Foundry | Foundry Core (104) | ✅ | ✅ | **26.3 s** |
| 6 | Crystal Caverns | Crystal Wing (96) | ✅ | ✅ | **82.9 s** |
| 7 | Red Falcon Keep | Red Falcon (128) | ✅ | ✅ | **27.0 s** |

VICTORY reached. The chopper stages (2 / 4 / 6 — Gunship family, sweeping targets) take
**~2–3× longer** to down than the fixed Sentinel bosses (1 / 3 / 5 / 7): the sweeping boss
spends much of its arc off the player's firing lane, so effective DPS is low. This is the
**DPS-bound fight length** — the floor a damage-on player must survive.

---

## Damage ON — the real pressure (per stage, per mode)

### ARCADE (3 lives, no shield) — baseline bot

| Stage | Reached boss | Beaten | Deaths (cause) | Lives left | Outcome |
|------:|:---:|:---:|---|---:|---|
| 1 Jungle | ✅ | ❌ | **4** (projectile ×4) | −1 | **GAME OVER** |

Per-death timeline (Stage 1): first death at **20.3 s** into the run — i.e. the bot cleared
the whole level and survived ~10 s of boss fire — then dies at 23.0 s, 25.9 s, 29.7 s.
Best boss HP reached: **55/90**. It never got close: the fixed Sentinel's aimed fire density
outpaces a 3-life budget over the ~30 s DPS-bound kill time.

### CASUAL (5 lives + 2-hit shield ≈ 7 effective hits) — baseline bot

| Stage | Reached boss | Beaten | Deaths (cause) | Lives left | Outcome |
|------:|:---:|:---:|---|---:|---|
| 1 Jungle | ✅ | ✅ | 3 (projectile ×3) | 2 | cleared @ **44.5 s** |
| 2 Cascade | ✅ | ❌ | 3 (projectile ×3) | −1 | **GAME OVER** |

Casual **can** clear Stage 1 (boss to 1 HP, then down) with margin (2 lives spare), which
confirms the fight is winnable at a survival budget of ~7 hits. It then wears out at the
**Stage-2 Gunship**, whose sweeping arc doubles the fight length (65 s invincible) — more
seconds under fire = more projectile deaths.

*(Full per-death frame/x/cause log for every stage is in `campaign-playthrough.json` →
`damageOn.{arcade,casual}.stages[].deathLog`.)*

---

## BALANCE FINDINGS → evidence for root.C (`game/data/config.js`)

These are **directional balance signals**, not verdicts — root.C owns the intended
difficulty curve and should decide. All are backed by the FACTS above.

1. **Difficulty is 100% boss-projectile-survival-bound; traversal is fair.** Zero pit and
   zero contact deaths in either mode across all reached stages — the gap-hops, chasms and
   enemy mix are survivable. **Every** death is an enemy projectile **at the boss barrier**.
   If the campaign feels too hard, the lever is boss fire, not the levels.

2. **The arcade Stage-1 boss is a hard wall.** A baseline dodging bot GAME-OVERs at boss 1
   in arcade (3 lives). The **DPS-bound kill time (~30 s)** exceeds what a 3-life/no-shield
   budget survives at the Sentinel's aimed-fire density. Decide: is boss 1 *meant* to demand
   human pattern-play this early? If not, candidate levers in `config.js`:
   `enemies.boss.fireEvery` / `enrageFireEvery` (slower cadence), bullet speed, or a small
   arcade telegraph/gap between volleys.

3. **Chopper bosses (Stages 2/4/6) are the survival spikes, not the fixed bosses.** They
   take 2–3× longer to down (65 / 73 / 83 s invincible) because the sweep pulls them off the
   firing lane — so the player eats far more volleys per kill. Casual dies at the Stage-2
   Gunship for exactly this reason. Consider raising chopper *effective* DPS (tighter sweep,
   or a stationary telegraph window) so fight length ≈ the fixed bosses', reducing the
   time-under-fire tax.

4. **The death → rifle-revert spiral compounds arcade difficulty at bosses.** Contra's
   invariant reverts the weapon to the default rifle on death (`world.js:_onPlayerDeath`).
   At a boss that means every death *also* resets your DPS, lengthening an already
   DPS-bound fight — a death spiral precisely where deaths are most likely. This is
   working-as-designed arcade-faithful, but it's the mechanism behind the arcade wall; worth
   a conscious call (e.g. a mid-arena weapon capsule so a post-death player isn't stuck on
   rifle vs a 90+ HP boss).

**None of these are soft-locks or bugs** — the spine is intact and every boss is beatable.
They are difficulty-tuning signals.

---

## Distinctness-by-LOOKING verdict — all 7 biomes side by side

I looked at the 7 captured boss-arena frames (`frames/arcade-inv/stage-1..7-boss.png`)
directly, side by side, and against the reference corpus (`reference/frames/`).

| Stage | Palette | Tileset | Backdrop / set-dressing | Distinct? |
|------:|---------|---------|-------------------------|:---:|
| 1 Jungle | night green | grass-cap dirt | jungle hills, fireflies, water/bridge | ✅ |
| 2 Cascade | teal / cyan | metal grate | tiered waterfalls, industrial skyline | ✅ |
| 3 Snow | blue-white | ice blocks | snow mountains + laden pines, snowfall | ✅ |
| 4 Desert | amber / gold | sandstone | dune ridges, saguaro cacti, warm haze | ✅ |
| 5 Foundry | dark red / ember | lava-lit metal | smokestack skyline, glowing molten vats | ✅ |
| 6 Caverns | violet / magenta | crystal rock | glowing crystal stalagmites, purple mist | ✅ |
| 7 Fortress | crimson | red brick | castle silhouette + banners, flaming braziers | ✅ |

**VERDICT: 7/7 visibly their OWN biome.** Each stage reads as a distinct place on sight —
its own dominant palette (green → teal → white → amber → ember-red → violet → crimson), its
own tileset, its own parallax backdrop, its own set-dressing prop, and its own boss sprite.
There is **no tile/background reuse** between siblings by eye.

**Vs the competitor bar (by looking):** compared with `reference/frames/gunslugs-2` (the
indie/mobile bar) our per-biome backdrop richness, parallax depth and palette cohesion
**meet or exceed** that bar; the boss-sprite/biomech *detail* sits below the
`blazing-chrome-2019` pinnacle (smaller, simpler boss silhouettes). This matches root.B's
`reference/SCORECARD.md` standing (sprite 4.0 = meets indie bar, headroom to Metal-Slug
density). Net: **distinctness requirement cleared; at/above the popular indie competitor
bar; below the Blazing-Chrome pinnacle for boss/biomech sprite detail** — a fidelity-polish
headroom item for root.B, not a distinctness failure.

---

## OPEN ISSUES

### 2026-07-12 — [BAL-1] Arcade campaign not completable by a baseline (non-expert) run — GAME OVER at Stage-1 boss
- **Severity:** medium (balance / accessibility; NOT a soft-lock — the boss IS defeatable).
- **Repro:** `node playtest/balance/campaign-playthrough.mjs` → `damageOn.arcade`: reaches
  the Stage-1 Sentinel, dies 4× to boss projectiles (first at 20.3 s), GAME OVER, best boss
  HP 55/90.
- **Intended behavior (the test asserts this):** a real player of *ordinary* skill should be
  able to progress past boss 1 in the default (arcade) mode without perfect pattern-play.
- **Owner/fix:** root.C — decide intended arcade boss-1 difficulty; if too steep, ease
  `enemies.boss` fire cadence/bullet-speed in `config.js` and/or add a mid-arena weapon
  capsule to blunt the death→rifle spiral (BAL-4). Left as a **recorded finding**, not
  worked around — re-run this harness to confirm arcade reaches ≥ Stage 2 after tuning.

### 2026-07-12 — [BAL-2] Casual campaign stalls at Stage-2 Gunship (chopper survival spike)
- **Severity:** low-medium (balance). Casual clears Stage 1 with margin but GAME-OVERs at
  the Stage-2 chopper (deaths at 24.0 / 34.4 / 45.8 s, all projectile).
- **Cause (measured):** chopper bosses take 2–3× longer to down (sweep off-lane) → more
  time under fire. See finding #3.
- **Owner/fix:** root.C — raise chopper effective DPS window or lower its fire tax so casual
  can clear the mid-campaign chopper stages. Recorded, not masked.

### 2026-07-12 — [BAL-3 / caveat] Arcade numbers are a baseline-bot upper bound, not a human-skill verdict
- The bot does not memorise boss patterns. A skilled human likely survives boss 1 in arcade.
  BAL-1/BAL-2 are **directional** evidence + a request for root.C to set the intended curve,
  **not** a claim the game is unwinnable. The invincible pass proves every boss is beatable.

*(No pit/contact/soft-lock/unwinnable issues found — traversal and the campaign spine are
clean this run.)*

---

## What this seat does NOT cover (honest gaps)
- **Human-skill survival ceiling:** the bot is a floor, not a skilled player. A future cycle
  could add pattern-aware dodging to estimate the *skilled-human* survival probability per
  boss (turning BAL-1 from "baseline fails" into a calibrated difficulty score).
- **Weapon-loadout sensitivity:** the bot fires whatever it picks up on-path; it does not
  compare clear-ability across a forced Rifle/Spread/Laser start. A per-weapon boss TTK
  sweep would sharpen the DPS-vs-survival balance argument.
