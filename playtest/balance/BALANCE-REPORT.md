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

## 🔁 2026-07-12 — RE-MEASUREMENT after root.C applied this report (boss fire eased ~15%)

root.C **acted on this seat's findings**: `game/data/config.js` now eases boss fire across
the campaign, explicitly citing this report — e.g. the Stage-1 Sentinel is
`fireEvery: 80, enrageFireEvery: 52 // eased ~15% (was 70/44) — BALANCE-REPORT: boss-fire is
the sole death cause`, and every stage boss's `enrageFireEvery` was raised (Ice Sentinel
42→50, Sand Gunship 42→50, Foundry Core 74/40→86/48, Crystal Wing 40→48, Red Falcon
68/36→80/44). I re-drove the **current** (eased) build; the numbers below are refreshed to
match. **FACT: the easing did NOT move the arcade or casual walls for a baseline run** —
BAL-1 and BAL-2 both PERSIST:

| Mode | Before (hotter cfg) | After (eased ~15%) | Δ |
|------|---------------------|--------------------|---|
| Arcade | GAME OVER @ Stage-1 boss, 4 deaths | **GAME OVER @ Stage-1 boss, 4 deaths** | no change to the wall |
| Casual | GAME OVER @ Stage-2 boss, cleared S1 | **GAME OVER @ Stage-2 boss, cleared S1** | no change to the wall |

**Read for root.C:** a ~15% cadence ease improves clear-time margin but is **too small to
let a baseline (non-expert) run past the Stage-1 arcade boss or the Stage-2 casual chopper.**
If the intent is baseline-clearable (not expert-only), the lever needs to be *larger* — a
bigger cadence ease, slower bullets, and/or the death→rifle-spiral mitigation (BAL-4). The
gate (`campaign-gate.mjs`) will flip BAL-1/BAL-2 green automatically when a future config
crosses the survivable threshold. *(New this run: one Stage-1 casual **pit** death at the
boss ledge — see [BAL-5].)*

---

## 🔁 2026-07-12 (later) — RE-MEASUREMENT after root.C shipped BAL-4 (mode-gated weapon-on-death)

root.C then shipped **BAL-4** (`game/src/world.js`): weapon-on-death is now **mode-gated** —
**ARCADE reverts to the rifle** (the 1987 single-slot invariant the hard mode must keep),
but **CASUAL RETAINS its weapon** on death so a lost life doesn't cripple the retry (the
accessibility path). I re-drove the merged build; this **moved the casual wall two stages
deeper**:

| Mode | After ~15% ease | After BAL-4 (merged) | Δ |
|------|-----------------|----------------------|---|
| Arcade | GAME OVER @ Stage-1 boss (0/7) | **GAME OVER @ Stage-1 boss (0/7)** | unchanged (BAL-4 exempts arcade by design) |
| Casual | GAME OVER @ Stage-2 boss (1/7) | **GAME OVER @ Stage-4 boss (3/7 cleared)** | **+2 stages** — clears S1/S2/S3, walls at the Scorched Dunes chopper |

**FACT (weapon retention observed):** casual deaths this run kept `machine` / `spread` at
respawn (not rifle); arcade deaths all reverted to `rifle` — the mode-gating is live and
correct (gate `invariant.weaponRevertsOnDeath` PASS, arcade-family only). Retaining the
weapon also **downed the Stage-1 boss faster (36.9 s, 2 deaths, then reached S2 with the
weapon)** and, as a side effect, the BAL-5 pit death **did not recur** (less time drifting at
the boss ledge — see [BAL-5], now marked intermittent). **BAL-1 (arcade) is untouched** — the
hard mode still walls at boss 1, correctly awaiting root.C's difficulty-target decision.

---

## 🔑 2026-07-12 (latest) — WHY casual walls at S4: CUMULATIVE ATTRITION, not S4's difficulty

root.C added `World.casualBossSurvivalTest` (an **isolated, fresh-pool** per-boss check) and,
on its evidence, eased **Stage-6 Crystal Wing hp 96→82** ("the ONE boss unbeatable in a fresh
casual pool"). I adopted the merged build and re-drove the **full natural campaign** — and it
**still walls at Stage 4 (3/7)**. The two tests measure different things, and the divergence
is the finding:

| Casual stage | Lives ENTERING | Deaths | Boss floored to | Result |
|-------------:|:---:|:---:|:---:|--------|
| S1 Jungle | 5 | 2 | **1/90** (barely) | cleared, 3 left |
| S2 Cascade | 3 | 2 | **2/78** (barely) | cleared, 1 left |
| S3 Frozen | 1 | 0 | 5/86 | cleared, 1 left |
| S4 Desert | **1** | 2 | 58/88 (barely dented) | **GAME OVER** |

**FACT:** casual reaches S4 with only **1 life** because S1 and S2 are *near-death* clears
(boss to 1 HP and 2 HP, costing 2 lives each). S4 is not individually brutal — a fresh-pool
test clears it — but the bot **arrives depleted**. So `casualBossSurvivalTest` (isolated) can
report "all bosses beatable" while the **continuous** campaign is still not completable for a
baseline run. **Only a full natural-progression run (this seat) sees cumulative attrition; an
isolated per-boss test structurally cannot.** → The lever for BAL-2 is therefore the **early
cost of S1/S2** (or the casual life/shield budget), NOT just the late choppers root.C has been
easing (see updated [BAL-2]).

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

## GATED TEST — re-runnable, pass/fail, exit code

[`campaign-gate.mjs`](./campaign-gate.mjs) turns everything below into an **automated
gate**: it drives the real damage-ON campaign (via the harness) and asserts INTENDED
behavior over the FACTS, with an exit code so root.C can re-run after tuning.

```bash
node playtest/balance/campaign-gate.mjs            # fresh real run, exits 0/1
node playtest/balance/campaign-gate.mjs --reuse    # re-assert over the last run (fast)
```

Two tiers (mirrors `playtest/e2e/run-all.mjs`): **CRITICAL** = spine + invariants that must
never break (exit non-zero on any red); **KNOWN-BUG** = the balance defects this seat filed
(BAL-1/BAL-2), asserted as intended behavior so they read as tracked reds but do **not**
fail the gate while documented. When root.C tunes a mode to completion, drop its `knownBug`
flag in the gate and it becomes a CRITICAL regression guard.

**Latest gate: CRITICAL 8/8 PASS · KNOWN-BUG reds: BAL-1, BAL-2 · VERDICT PASS (exit 0).**

| Check | Tier | Result |
|-------|------|--------|
| `spine.reachAll7` — all 7 reachable (invincible) | CRITICAL | ✅ |
| `spine.defeatableAll7` — full-campaign VICTORY (invincible) | CRITICAL | ✅ |
| `spine.noSoftlocks` — no soft-lock/unwinnable in any pass | CRITICAL | ✅ |
| `spine.naturalProgressionOnly` — every beaten stage ended `cleared` via genuine boss-kill | CRITICAL | ✅ |
| `invariant.weaponRevertsOnDeath` — mode-gated (BAL-4): ARCADE death reverts to rifle (single-slot); CASUAL retains | CRITICAL | ✅ |
| `accessibility.casualClearsStage1` — assist mode passes boss 1 | CRITICAL | ✅ |
| `balance.bossesAreThePrimaryKiller` — boss fire ≥ traversal deaths (levels aren't the killer) | CRITICAL | ✅ |
| `render.stageAssetsIntact` — every stage's required sprite keys load (no 404/broken/absent art) | CRITICAL | ✅ |
| `balance.arcadeCompletesCampaign` — arcade run reaches VICTORY | KNOWN-BUG **BAL-1** | ❌ (tracked) |
| `balance.casualCompletesCampaign` — assist run reaches VICTORY | KNOWN-BUG **BAL-2** | ❌ (tracked) |

Evidence: [`campaign-gate.json`](./campaign-gate.json).

> **Provenance / self-verify (this branch = `loop-root-H`).** `render.stageAssetsIntact` is
> a live CRITICAL check on THIS branch (8/8). It is **not on `master`** yet — this seat's
> work propagates to master only when the branch is merged, so a review of `master` will show
> 7 checks and no `renderPathAudit`. To confirm the branch state directly:
> `node -e "const g=require('./playtest/balance/campaign-gate.json'); console.log(g.criticalTotal, g.checks.map(c=>c.id))"`
> → prints `8` and includes `render.stageAssetsIntact`. Re-run `node playtest/balance/campaign-gate.mjs` to regenerate.

---

## HEADLINE FACTS (this run)

| Fact | Result |
|------|--------|
| All 7 stages **reachable** via natural progression (invincible ground truth) | ✅ **7/7** |
| All 7 bosses **defeatable** by genuinely shooting them (invincible) → VICTORY | ✅ **yes** |
| **Soft-locks / unwinnable geometry** detected (any mode) | ✅ **none** |
| Damage-ON **ARCADE** baseline-bot outcome | ❌ **GAME OVER at Stage-1 boss** (0/7 cleared, 4 deaths) |
| Damage-ON **CASUAL** baseline-bot outcome | ⚠️ **GAME OVER at Stage-4 boss** (3/7 cleared, 6 deaths) — BAL-4 moved this +2 stages |
| Weapon-on-death (BAL-4, mode-gated) | arcade → **rifle** (revert); casual → **retains** (machine/spread observed) |
| Damage-on death cause split (both modes) | **projectile 10 · pit 0 · contact 0** (100% boss fire this run) |
| Traversal deaths | **0** this run (BAL-5 pit did not recur — intermittent, time-at-ledge dependent) |

**One-line read:** the campaign's spine is sound (reachable, defeatable, no soft-locks, all
7 biomes distinct), and **the bosses are the primary killer** — 100% of deaths this run are
boss-fire projectiles, zero traversal deaths. **The difficulty is boss survival.** root.C's
BAL-4 mode-gated weapon-retention pushed the **casual** wall from Stage-2 to **Stage-4** (a
real accessibility gain); the **arcade first-boss wall is unchanged** (BAL-4 exempts arcade by
design) and still steep for anything short of skilled human pattern-play.

---

## Ground truth — reach + defeatability + time-to-clear (invincible)

Same bot, invincibility ON, natural `requestNextStage` between stages. This isolates
"geometry/DPS works" from "survival is hard".

| Stage | Biome | Boss (HP) | Reached boss | Beaten | Boss-inclusive clear |
|------:|-------|-----------|:---:|:---:|--------:|
| 1 | Jungle Approach | Sentinel (90) | ✅ | ✅ | **30.8 s** |
| 2 | Cascade Base | Gunship (78) | ✅ | ✅ | **69.7 s** |
| 3 | Frozen Ridge | Ice Sentinel (86) | ✅ | ✅ | **23.4 s** |
| 4 | Scorched Dunes | Sand Gunship (88) | ✅ | ✅ | **73.1 s** |
| 5 | Iron Foundry | Foundry Core (104) | ✅ | ✅ | **27.8 s** |
| 6 | Crystal Caverns | Crystal Wing (96) | ✅ | ✅ | **90.7 s** |
| 7 | Red Falcon Keep | Red Falcon (128) | ✅ | ✅ | **28.1 s** |

*(Clear times refreshed 2026-07-12 against the eased config; HP unchanged. The chopper
stages 2/4/6 remain the long fights — the eased cadence did not shorten the DPS-bound kill,
only the fire pressure.)*

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

Per-death timeline (Stage 1, eased config): first death at **20.5 s** — the bot cleared the
whole level and survived ~10 s of boss fire — then 23.2 s, 27.4 s, 30.2 s. Best boss HP
reached: **60/90** (vs 55/90 pre-easing — marginally better, still nowhere near a kill). The
fixed Sentinel's aimed fire still outpaces a 3-life budget over the ~31 s DPS-bound kill time.

### CASUAL (5 lives + 2-hit shield; **BAL-4: retains weapon on death**) — baseline bot

| Stage | Reached boss | Beaten | Deaths (cause) | Lives left | Weapon@death | Outcome |
|------:|:---:|:---:|---|---:|---|---|
| 1 Jungle | ✅ | ✅ | 2 (projectile ×2) | 3 | machine | cleared @ **36.9 s** |
| 2 Cascade | ✅ | ✅ | 2 (projectile ×2) | 1 | spread | cleared @ **72.5 s** |
| 3 Frozen Ridge | ✅ | ✅ | 0 | 1 | — | cleared @ **24.3 s** |
| 4 Scorched Dunes | ✅ | ❌ | 2 (projectile ×2) | −1 | spread | **GAME OVER** |

With **BAL-4** casual now clears **S1→S2→S3** and walls at the **Stage-4 Sand Gunship**
(chopper). Retaining the weapon after death is visible in the log (`machine`, `spread` at
respawn instead of rifle) and speeds the fights — Stage 1 fell in **36.9 s / 2 deaths** (vs
42.0 s / 3 deaths pre-BAL-4, and the [BAL-5] pit death did **not** recur). The wall is again a
**chopper** (Stage 4), consistent with finding #3: sweeping bosses stretch time-under-fire.

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

## Render-path sprite-key audit — all 7 stages (grounds `task_wire_defect_probe_across_7_stages`)

Distinctness-by-looking says the biomes *read* distinct; this audit proves the *wiring* under
it. During the natural-progression run I enumerate, per stage, the exact sprite keys
`render.js` resolves — tileset (`theme_<id>`), parallax (`bg_<id>`), boss art
(`boss_<id>`‖base), decor (`assets.get(d.key)` — **draws nothing if absent**), water/bridge —
and record each as **loaded** / **absent (no key)** / **MISSING (load failed / 404)** from the
live `window.__assets`. Gated as CRITICAL `render.stageAssetsIntact`.

| Stage | tileset | parallax | boss art | decor | missing/404 |
|------:|---------|----------|----------|-------|:---:|
| 1 Jungle | *procedural* | *procedural* | *base (Sentinel)* | — | none |
| 2 Cascade | `theme_cascade` ✅ | `bg_cascade` ✅ | *base (Gunship)* | `decor_cascade_valve` ✅ | none |
| 3 Snow | `theme_snow` ✅ | `bg_snow` ✅ | `boss_snow` ✅ | `decor_snow_pine` ✅ | none |
| 4 Desert | `theme_desert` ✅ | `bg_desert` ✅ | `boss_desert` ✅ | `decor_desert_cactus` ✅ | none |
| 5 Foundry | `theme_foundry` ✅ | `bg_foundry` ✅ | `boss_foundry` ✅ | `decor_foundry_vat` ✅ | none |
| 6 Caverns | `theme_caverns` ✅ | `bg_caverns` ✅ | `boss_caverns` ✅ | `decor_caverns_crystal` ✅ | none |
| 7 Fortress | `theme_fortress` ✅ | `bg_fortress` ✅ | `boss_fortress` ✅ | `decor_fortress_brazier` ✅ | none |

**VERDICT: render path INTACT.** No stage 404s or fails to load a required sprite
(`assets.missing = []` throughout). Every generated biome (stages 2–7) loads its themed
tileset + parallax; every themed-boss stage (3–7) loads its `boss_<id>` sprite; every
referenced decor key loads (no invisible set-dressing). The full matrix is in
`campaign-gate.json → renderPathAudit`. Two intentional states are called out below (RP-1/RP-2)
— they are observations for root.B/root.C, **not** defects (the gate does not fail on them).

- **[RP-1]** Stage 1 (jungle) renders its tileset/parallax **procedurally** (no generated
  `theme_jungle`/`bg_jungle` key) — it is the original seed baseline the other biomes were
  built to match. By looking it holds up (see the distinctness frames), but it is the only
  stage without a *generated* tileset sprite; root.B may want to confirm parity or generate a
  jungle tileset for consistency.
- **[RP-2]** Stages 1 & 2 use **base boss art** (Sentinel / Gunship) — no `boss_jungle` /
  `boss_cascade` sprite (intentional per `render.js:636`). They are distinct bosses by
  name/stats/behavior, but stages 3–7 additionally have *themed* boss sprites. If the GOAL's
  "its own boss" implies a themed sprite per stage, stages 1–2 are the gap for root.B.

---

## OPEN ISSUES

### 2026-07-12 — [BAL-1] Arcade campaign not completable by a baseline (non-expert) run — GAME OVER at Stage-1 boss
- **Severity:** medium (balance / accessibility; NOT a soft-lock — the boss IS defeatable).
- **Repro (merged build):** `node playtest/balance/campaign-playthrough.mjs` → `damageOn.arcade`:
  reaches the Stage-1 Sentinel, dies 4× to boss projectiles (first at ~20.5 s), GAME OVER,
  best boss HP 60/90. Unchanged by BAL-4 (arcade reverts to rifle by design).
- **Intended behavior (the test asserts this):** a real player of *ordinary* skill should be
  able to progress past boss 1 in the default (arcade) mode without perfect pattern-play.
- **⚠️ NEW — cadence is NOT the lever (`boss1-sensitivity.mjs`, 2026-07-12):** I swept the
  Stage-1 boss's fire cadence live from ×1.0 → ×2.5 (fireEvery 92 → 230) and drove the
  baseline bot each time. **It never cleared at any factor** — deaths stayed at **exactly 4**
  and the boss never dropped below **~46/90 HP** even at 2.5× slower fire. So **slowing boss
  fire will NOT move the arcade wall** for a baseline run; the wall is **DPS/dodge-skill
  bound**, not fire-rate bound (the ~4-death floor is a roughly fixed set of aimed shots this
  bot won't dodge, and each death reverts arcade to the low-DPS rifle so the boss is never
  out-damaged). This also *supports* the wall being **human-fair** — a skill artifact of a
  non-dodging bot, not unfair fire volume.
- **Owner/fix (redirected by the probe):** root.C — if baseline-clearable arcade is intended,
  the effective lever is **player DPS retention** (a mid-arena weapon capsule so a post-death
  player isn't stuck on rifle vs 90 HP) or **lower boss HP**, **NOT** fire cadence. If
  expert-tuned arcade is intended, the current values are defensible — the invincible pass
  proves defeatable, and the bot-only failure is consistent with a fight a skilled human
  passes. Recorded, not worked around; re-run the gate to confirm arcade reaches ≥ Stage 2
  after any DPS-side change. Data: `boss1-sensitivity.json`.

### 2026-07-12 — [BAL-2] Casual campaign stalls at a chopper survival spike — now **Stage-4** (was Stage-2)
- **Status update (BAL-4 shipped):** root.C's mode-gated weapon-retention (BAL-4) moved this
  wall **+2 stages** — casual now clears S1/S2/S3 and GAME-OVERs at the **Stage-4 Sand
  Gunship** (deaths 2×, boss floored to 50/88). The mid-campaign chopper is still the wall.
- **Severity:** low-medium (balance). Casual reaches 3/7.
- **⚠️ ROOT CAUSE CORRECTED (2026-07-12, cumulative-attrition analysis):** S4 is **not**
  individually the wall — the bot enters S4 with only **1 life** because S1 (boss→1 HP) and S2
  (boss→2 HP) are *near-death* clears costing 2 lives each. At S4 the boss is barely dented
  (58/88) before the last life is gone. So the campaign walls from **front-loaded cumulative
  attrition on S1/S2**, not S4's isolated difficulty.
- **Divergence from `casualBossSurvivalTest`:** root.C's isolated fresh-pool test (each boss,
  full resources) can report "all bosses beatable" — and it eased S6 (hp 96→82) on that basis —
  yet the **continuous** natural campaign still fails at S4. An isolated per-boss test cannot
  see attrition; this seat's full-run grounding is the end-user-truthful signal.
- **Owner/fix (REDIRECTED):** root.C — the lever is the **early-boss cost** (make S1/S2 clears
  cheaper — lower HP or fire so the bot doesn't spend ~2 lives each) **and/or** a larger casual
  **life/shield budget**, NOT just easing the late choppers (S6 hp cut doesn't help a run that
  dies at S4). Recorded, not masked; re-run the gate to confirm casual reaches ≥ Stage 5 after
  tuning. Data: `campaign-playthrough.json → damageOn.casual.stages[].{livesRemaining,deaths}`.

### 2026-07-12 — [BAL-4 / RESOLVED-IN-PART] Mode-gated weapon-on-death shipped and grounded
- root.C shipped BAL-4 in `game/src/world.js`: **arcade reverts to rifle** (1987 invariant),
  **casual retains its weapon** on death (accessibility). I re-drove the merged build and
  confirmed it live: casual deaths kept `machine`/`spread` at respawn; arcade deaths reverted
  to `rifle` (gate `invariant.weaponRevertsOnDeath` PASS, arcade-family only). **Effect:**
  casual wall Stage-2 → **Stage-4** (+2 stages). Arcade unchanged by design (BAL-1 still open).

### 2026-07-12 — [BAL-3 / caveat] Arcade numbers are a baseline-bot upper bound, not a human-skill verdict
- The bot does not memorise boss patterns. A skilled human likely survives boss 1 in arcade.
  BAL-1/BAL-2 are **directional** evidence + a request for root.C to set the intended curve,
  **not** a claim the game is unwinnable. The invincible pass proves every boss is beatable.

### 2026-07-12 — [BAL-5] Stage-1 boss firing ledge is a pit-death risk over the pre-boss chasm (INTERMITTENT)
- **Severity:** low (level-design / balance; NOT a soft-lock — the stage is clearable).
- **Status update:** this pit death **did NOT recur** in the post-BAL-4 run — casual now
  retains its weapon, downs the Stage-1 boss faster (36.9 s / 2 deaths vs 42.0 s / 3), and so
  spends less time drifting at the ledge. It is therefore **intermittent** (time-at-barrier
  dependent), not deterministic — but the underlying geometry hazard remains.
- **Repro (prior run):** `damageOn.casual.stages[0].deathLog` contained a **pit death at
  x=2241, ~36.9 s** into the Stage-1 boss fight. `level1.js` puts a **58 px chasm at
  x2220–2278** immediately left of the boss barrier (x2300), leaving only a **~22 px firing
  ledge** (2278–2300) for a 12 px-wide player.
- **Mechanism (measured):** it emerges with *time at the barrier* — firing recoil pushes the
  player back (−aim) and dodge-hops add drift, so extended boss exposure can nudge the player
  off the narrow ledge into the chasm. The bot already refuses to *weave* left into a gap
  (ground-checked); the residual risk is recoil/hop drift, which a human under fire also faces.
- **Intended behavior (the gate asserts the correct invariant):** the *levels* must not be the
  primary killer — `balance.bossesAreThePrimaryKiller` asserts boss-fire deaths ≥ traversal
  deaths (currently 10 ≥ 0, PASS). A designed pit hazard causing a rare death is fine; a **boss
  arena you get shoved into a pit from** may not be.
- **Owner/fix (root.C, `level1.js` geometry):** confirm intended tension, or widen the boss
  firing ledge / shift the chasm left. Recorded, not masked — the per-death log re-surfaces it
  whenever a run spends long enough at the ledge.

*(Spine clean this run: 7/7 reachable + defeatable, no soft-locks, mode-gated weapon rule
holds (arcade reverts, casual retains). Zero traversal deaths this run; bosses remain the
primary killer.)*

---

## What this seat does NOT cover (honest gaps)
- **Human-skill survival ceiling:** the bot is a floor, not a skilled player. A future cycle
  could add pattern-aware dodging to estimate the *skilled-human* survival probability per
  boss (turning BAL-1 from "baseline fails" into a calibrated difficulty score).
- **Weapon-loadout sensitivity:** the bot fires whatever it picks up on-path; it does not
  compare clear-ability across a forced Rifle/Spread/Laser start. A per-weapon boss TTK
  sweep would sharpen the DPS-vs-survival balance argument.
