# Playtest REPORT — live end-to-end grounding

**Perspective:** first-time player, driving the **live** browser build with **real
keyboard events** (the `KeyboardInput` backend + live `requestAnimationFrame`
loop) through a headless Chrome — NOT the deterministic `?headless=` sim harness
the engine/art loops use for capture. Every claim below is backed by a captured
native-resolution frame and the live world snapshot at that beat.

**Harness:** `playtest/e2e/playthrough.mjs` (+ `harness.mjs`, `serve.mjs` infra).
Run it:

```bash
cd playtest/e2e && npm install        # one-time: puppeteer-core (node_modules gitignored)
node playtest/e2e/playthrough.mjs     # from repo root; serves game/ on an ephemeral port
```

Evidence written to `playtest/frames/live/`:
`NN-<state>.png` (one real frame per state) + `results.json` (assertions,
per-state world snapshots, console + page errors).

---

## ONE COMMAND — the consolidated QA acceptance gate

```bash
node playtest/e2e/run-all.mjs     # runs every harness, prints ONE verdict, exit code
```

`run-all.mjs` is the single signal for "does the build pass QA?". It runs all four
e2e harnesses in a **clobber-safe order** (playthrough first — it wipes
`frames/live/`; then go-live + touch add their own evidence there; fidelity writes
`frames/fidelity/`), aggregates their real pass/fail FACTS into
`frames/live/qa-summary.json`, and **exits non-zero iff any CRITICAL assertion is
red**. Non-critical known defects (BOSS-3, fps-telemetry) are reported but do not
fail the gate; the required-deliverable gaps do.

**Latest gate (2026-07-10): 91 passed / 0 failed → VERDICT: PASS (0 critical).**

| Harness | Drives | Result |
|---------|--------|--------|
| `playthrough` | live keyboard, every state (title→boss→death→restart) + feel/SFX/weapons/enrage + **creator-approval (API + DOM UI + reload-persistence)** | 64 / 0 |
| `go-live` | the SHIPPED `serve.mjs` entrypoint (real player path) | 6 / 0 |
| `touch` | mobile on-screen overlay (Android), mobile-first layout | 16 / 0 |
| `fidelity` | side-by-side vs competitor corpus — console-tier + the goal's DIRECT web-HTML5 rivals (validity-gated) | 5 / 0 |

**The ship gate is fully GREEN — zero reds.** The creator-approval panel LANDED
(`game/src/feedback.js`, wired in `main.js`) and my acceptance harness verified it
works via both the API contract and the real creator DOM path (all 12
`creatorApproval.*` checks PASS, matching `feedback/SPEC.md`). The last non-critical
red, `feel.fpsTelemetryExposed`, also flipped green this cycle — master exposed the
perf hook on `window`, so my telemetry assertion now passes directly (no longer
measured only around). Every harness is green; VERDICT PASS.

---

## GO-LIVE grounding — reachable by a real player via the SHIPPED entrypoint

Every other harness here serves the build through playtest's own `serveGame`.
`playtest/e2e/go-live.mjs` instead grounds the actual **ship path**: it launches
the committed `game/serve.mjs` as a subprocess *exactly as the README tells a
player* (`node serve.mjs <port>`, the `npm start` target), parses the REAL bound
URL from its stdout (it auto-increments if the port is busy), and drives that URL
in headless Chrome. This closes the strategy gap `task_obs_not_actually_live`
("reachable by real players" was asserted, never proven end-to-end).

Run: `node playtest/e2e/go-live.mjs` → exits non-zero if the shipped server fails
to serve a booting game. Evidence: `frames/live/go-live-boot.png` + `go-live.json`.

Latest run (2026-07-09): **6 passed / 0 failed**, exit 0.

| Check | Fact asserted | Result |
|-------|---------------|--------|
| `golive.serverBinds` | committed `serve.mjs` binds & advertises a URL | PASS (`http://localhost:8137`) |
| `golive.rootServes200` | bare `GET /` (what a player types) → 200 index.html | PASS |
| `golive.gameBoots` | ES-module app ran → `window.__game` + player exist (proves correct MIME on the ship path) | PASS (`status=title mode=arcade`) |
| `golive.landsOnTitle` | player lands on the arcade title (README's documented entry) | PASS |
| `golive.spritesLoaded` | real art loaded through the shipped server, `__assets.missing=[]` | PASS |
| `golive.noErrors` | no page/console/4xx errors on the ship path | PASS |

`go-live-boot.png` (looked at it): the served page renders the real title —
"RUN & GUN · A CONTRA-LINEAGE VERTICAL SLICE", ARCADE/CASUAL mode select,
"one hit = one life — the 1987 way", HUD + hero sprite, 63fps. This is what a
first-time player sees on `npm start`. **Only** 404 on the path is the browser's
own `favicon.ico` auto-request (a static server legitimately has none — filtered
by URL, verified it's the sole 4xx); it is not a game asset and a player sees no
functional error.

---

## MOBILE / TOUCH grounding — playable on Android via the on-screen overlay

The GOAL targets **web/Android**, so the touch-control path is a required
capability. Every other harness drives the keyboard; `playtest/e2e/touch.mjs`
drives the build as a **mobile player**: it emulates a landscape touch phone
(`isMobile`, `hasTouch`, Pixel-7 UA), forces the overlay with `?touch=1`
(`main.js:146`, `game/src/touch.js`), and operates the REAL DOM buttons via
Pointer Events (what a finger does) — never the keyboard.

Run: `node playtest/e2e/touch.mjs` → exits non-zero if the mobile control path is
broken. Evidence: `frames/live/touch-play.png` (full page: overlay over gameplay)
+ `touch.json`.

Latest run (2026-07-10): **16 passed / 0 failed**. The mobile control path is now
fully green — **TOUCH-1 (touch restart from game-over) was fixed** (PR#82,
`touch.js:84` calls `world.reset()` on a press while `gameover`/`cleared`) and my
previously-red assertion flipped to PASS (verified: FIRE → `playing`). It now
stands as a regression guard. The **mobile-first layout** (PR#78) is also grounded
— canvas fills the viewport, desktop chrome hidden, portrait "rotate" nudge.

| Check | Fact asserted (driven by touch) | Result |
|-------|--------------------------------|--------|
| `touch.overlayMounts` | `#touch-controls` overlay + `window.__touch` present | PASS |
| `touch.buttonSet` | D-pad up/left/right/down + JUMP + FIRE all rendered | PASS |
| `touch.mobileLayoutEngages` | `body.touch-active`; desktop `h1`/`#help` chrome hidden | PASS |
| `touch.canvasFillsViewport` | landscape: canvas `667×375` fills viewport height at 16:9 (ratio 1.78) | PASS |
| `touch.rotateHintHiddenLandscape` | landscape → rotate-hint hidden (already oriented) | PASS |
| `touch.portraitRotateHint` | portrait → "ROTATE TO LANDSCAPE" nudge shown (`touch-portrait.png`) | PASS |
| `touch.bootsToTitle` | mobile boots onto the title (`status='title'`) | PASS |
| `touch.startFromTitle` | **tapping FIRE on the title starts play** — a touch-only player is not stranded | PASS (`→ playing`) |
| `touch.dpadRightMoves` | holding ▶ moves the player (`x 40 → 119`) | PASS |
| `touch.jumpButton` | JUMP leaves the ground (`vy<0`, airborne) | PASS |
| `touch.fireButton` | FIRE spawns player bullets | PASS |
| `touch.dpadDownProne` | ▼ engages prone | PASS |
| `touch.dpadUpAims` | ▲ aims up | PASS |
| `touch.reachesGameover` | driving into a grunt on touch → `status='gameover'` | PASS |
| `touch.restartFromGameover` | a touch press restarts after game-over (FIRE → `playing`) | PASS (TOUCH-1 fixed) |
| `touch.noErrors` | no page errors on the mobile path | PASS |

`touch-play.png` (looked at it): the left D-pad (▲◀▶▼, ▶ shown *active*/highlighted)
and right JUMP + FIRE buttons render over the live night-jungle gameplay, exactly
as an Android player sees them — with the desktop keyboard chrome hidden and the
canvas maximized (mobile-first layout). `touch-portrait.png` (looked at it): held
in portrait, the build shows a clear **"ROTATE TO LANDSCAPE — Run & Gun plays in
widescreen, turn your device sideways"** nudge over the dimmed game — the right
call for a landscape run-and-gun. I explicitly verified both touch **start-from-
title** and touch **restart-from-game-over** by RUNNING them (both were keydown-
wired in `main.js`; the engine added the touch paths in `touch.js` — `world.start()`
on title, `world.reset()` on gameover/cleared). A keyboard-less phone player can
now start AND replay — TOUCH-1 is closed and the assertion guards against regression.

Latest run (2026-07-10): **49 passed / 3 failed** (1 critical). The failures are
required-scope GAPS + defects below — deliberately-red tests that assert the
*intended* behavior so each stays visible until an engine loop closes it. We do
**not** mask defects to go green. (New this cycle: independently ground the
**BOSS-3** render defect from the player POV — the enrage heat-glow bleeds a red
RECTANGLE into the boss sprite's transparent margin (confirmed by looking +
measured: margin redness excess 0.8→65.8), now a red KNOWN-BUG test. Prior
iconic-death, boss-enrage, weapon-roster, flyer, title/start, SFX, and feel
grounding all still hold — no regression.)

---

## State machine coverage (driven live, first-time-player order)

| # | State | Live input driven | Assertion | Result | Frame |
|---|-------|-------------------|-----------|--------|-------|
| 1 | title / boot (arcade entry) | page load | `status='title'`; world present, no page errors, sprites loaded | PASS | `01-boot.png` |
| 1 | title / start GATE | — | a title/start gate exists (`status='title'`) | PASS | `01-boot.png` |
| 1 | title / boots arcade default | — | `mode=arcade, lives=3, shield=0` (one-hit invariant) | PASS | `01-boot.png` |
| 1b | title / mode select → CASUAL | Digit2 | stays `title`; `mode=casual, lives=5, shield=2` | PASS | `02-title-casual.png` |
| 1b | title / mode select → ARCADE | Digit1 | stays `title`; `mode=arcade, lives=3` (re-arms one-hit) | PASS | `02-title-casual.png` |
| 1c | title → PLAYING (start) | Enter (START key) | `status: title → playing` | PASS | `03-start-play.png` |
| 2 | run right | hold → | `x 40 → 133`, facing=1 | PASS | `04-run-right.png` |
| 3 | jump | Space | left ground: `vy 0→-5.6`, airborne | PASS | `05-jump.png` |
| 4 | aim up | ↑ | `aim=(0,-1)` | PASS | `06-aim-up.png` |
| 5 | prone / duck | ↓ | prone=true, hitbox `h 20→11` | PASS | `07-prone.png` |
| 6 | fire | X | real player bullets in flight (peak 4) | PASS | `08-fire.png` |
| 7 | enemy encounter + kill (ground grunts) | X (fire right) | on-screen enemies>0; `score 0→200`, `alive 21→19` | PASS | `09-enemy-encounter.png` |
| 7b | FLYER aerial-drone encounter | seed under drone†, ↑ + X | flyer authored in level1 (x=900); on-screen & **airborne** (y=115 vs ground 236); aimed-up fire drops it (alive 2→1) | PASS | `10-flyer.png` |
| 7c | WEAPON ROSTER — pickup + fire signature | walk onto pickup†, X | spread/machine/laser **collected via real pickup** (pickups 6→5, weapon swaps); each weapon fires its distinct projectile read off the bullets — spread 5-pellet cyan fan, machine amber stream, laser **pierce + dmg3** teal, fire **wave** corkscrew orange (fire QA-armed: elevated pickup) | PASS (8) | `weap-spread.png`, `weap-laser.png`, `weap-fire.png` |
| 8 | death (one-hit) | → into grunt | `dead=true, lives 3→2`, `mode=arcade shield=0` | PASS | `12-death.png` |
| 8b | ICONIC death animation | (death arc) | not a frozen teleport: `dying=true`, flung UP (minY 176 < ground 212), SPINS (`deathAngle`→10.5 rad), `respawnTimer=48` | PASS | `death-anim.png` |
| 9 | game over | → (lives seeded 0) | real death path → `status=gameover` | PASS | `13-game-over.png` |
| 10 | restart after game over | R | `status=playing, lives=3, x=40, alive` | PASS | `14-restart-after-gameover.png` |
| 10b | boss PHASE-2 ENRAGE transition | seed arena‡, ↓ + X | boss crosses into enrage at **hp≤36** (=threshold 0.4·90) and fires the distinct **RED volley** (`#ff5a6e`); enraged sprite + "ENRAGED!" callout render | PASS (3) | `boss-enrage.png` |
| 10b | boss enrage glow masked to sprite | (corner pixel probe) | BOSS-3 **fixed** (PR#86): glow masked to sprite; transparent-corner redness excess ≈ **−1.9** (was 65.8) — no red rectangle. Regression guard. | PASS | `boss-enrage-zoom.png` |
| 11 | boss telegraph + prone-dodge WIN | scenario* | `status=cleared, player alive, prone used` — this win **traverses & survives** the enrage phase (hp 90→0 must pass 36) | PASS | `15-boss-win.png` |
| — | creator-approval panel | — | in-game creator-approval feedback panel exists | **FAIL (GAP, TOP)** | `01-boot.png` |

\* Boss win path is driven by the build's **own real boss-arena scenario**
(`?headless=1&scenario=boss`) which steps the *actual* sim with a prone+fire
timeline and renders the real frame — verified `status='cleared'`, player alive,
`prone=true`. It is honestly labeled **deterministic-harness**, not live keyboard:
surviving the whole stage to the boss on live input is a long, flaky play unfit
for a per-cycle gate. States 1–10 above ARE live keyboard.

† Flyer beat: the drone spawns ~900px into the level; rather than grind the full
traversal (long, flaky, one-hit death) we seed `player.x` to the drone's x under
real spawn i-frames — a documented setup shortcut like `lives=0` for game-over.
The drone's hover/strafe AND our aimed-up bullets are the REAL sim; only the
starting position is set. We verify the *aerial encounter + kill*, not the walk to it.

‡ Boss enrage beat: headless `__bench` does NOT expose `boss.enraged`/`bossHp`, so
the phase-2 TRANSITION is grounded on the LIVE sim (which does expose it). We seed
the player into the arena, and — purely as **observation instrumentation** — pin the
arena `x` + top up i-frames each poll so we can watch the boss cross into enrage.
This measures the BOSS's state change (a real fact: enraged at hp=36, red `#ff5a6e`
volley), NOT player survivability. Survivability is proven separately and
deterministically by the headless prone-win (STATE 11), which must pass hp=36 to
reach 0. A one-line engine hook (`bossEnraged`/`bossHp` in `__bench`) would let this
be asserted headlessly without the live pin — filed as a QA request, not a blocker.

Notes:
- `game over` uses a documented setup shortcut — `window.__game.lives = 0` — so we
  don't grind three deaths; the death that triggers the transition is still a real
  in-game one-hit kill. We verify the *transition*, not the grind.

---

## Feel & cadence (measured live, wall-clock — NOT self-reported)

My mandate is to *measure* timing/hit-stop/cadence, never trust a self-report.
These are computed from the **live rAF loop's own counters** (`world.frame`,
`world.feel.hitStop`, `world.feel.trauma`) over real wall-clock windows, then
checked against the build's INTENDED config in `game/data/config.js`. Recorded
in `results.json → feel`.

| Metric | Measured (live) | Intended (config) | Result |
|--------|-----------------|-------------------|--------|
| Sim cadence | **58.8 steps/s** | `SIM.STEP_HZ = 60` | PASS — live loop holds 60Hz, no stall/runaway |
| Rifle fire cadence | **7 sim-frames** median between shots (7 spawns) | `WEAPONS.rifle.fireRate = 7` | PASS — fire rate is exactly on spec |
| Hit-stop on kill | **7 frames** peak freeze | `FEEL.hitStopKill = 7` | PASS — kill-freeze fires live, on spec |
| Trauma on kill | **0.68** peak | `FEEL.traumaKill = 0.5` (+ `rifle.trauma 0.16`/shot, stacked, clamp 1) | PASS — screen-shake driver fires live |

Method: `feel.simCadence` samples `world.frame` across a 1s window (frame
increments every fixed step regardless of hit-stop, so its delta IS the real
step rate). `feel.fireCadence` holds fire and takes the median `world.frame` gap
between rising edges of the player-bullet count. `feel.hitStopOnKill` /
`traumaOnKill` fire right into the dormant grunt cluster and watch the feel
kernel spike during real kills. All four land on the intended numbers — the
game-feel kernel is genuinely engaged in the live loop, confirmed by
measurement, not by reading the code.

---

## Audio / SFX wiring (live, end-to-end — measured, not self-reported)

A procedural Web-Audio SFX layer shipped (`game/src/audio.js`, PR#30). The sim
`emit()`s event **names**; the live rAF loop `drainSfx()`s them each frame and
calls `window.__audio.play(name)`. `selftest.js` checks emission at the **sim**
level — but nothing verified the **live** end-to-end chain, so a broken
world→drain→audio wiring would have left every existing test green. This cycle
the harness wraps `window.__audio.play` in the page (harness-side only, no
`game/` edit) and drives each action, capturing what actually reached the audio
kit. Recorded in `results.json → sfx`.

| Action driven (live) | SFX dispatched to `__audio` | Intended | Result |
|----------------------|-----------------------------|----------|--------|
| Hold fire (X) | `shoot_rifle` ×3 | `shoot_rifle` | PASS |
| Jump (Space) | `jump` | `jump` | PASS |
| Fire into grunt cluster | `shoot_rifle`, `enemyHit`, `explosion` | `enemyHit`/`explosion` | PASS |
| One-hit death | `hurt` (+ incidental `pickup`) | `hurt` | PASS |
| Game-over transition | `gameover` | `gameover` | PASS |

`audio.hookPresent` also confirms `window.__audio.play` exists and is wrappable.
Note: headless Chrome runs `--mute-audio` and the AudioContext may stay
suspended without a gesture — so this proves the **wiring dispatches the correct
events**, not that a speaker made sound (which headless cannot verify). That is
the right end-to-end grounding for this seat: the event chain from gameplay to
the audio layer is intact and correctly keyed.

---

## Fidelity judgment (multimodal, direct frame comparison — NOT CV metrics)

Judged by reading our captured frames against the reference corpus side by side.

- **Feel / state completeness: strong.** Every Contra-lineage state is present and
  reads correctly live: run/jump/8-way-aim/prone, one-hit death, weapon-revert on
  death, boss telegraph → prone-dodge → STAGE CLEAR, GAME OVER → restart. HUD
  (SCORE / LIVES icons / weapon name) is clear. FPS meter reads ~60–68.
- **Visual fidelity vs the competitor bar: BELOW bar.** Against
  `reference/frames/blazing-chrome-2019/motion/firefight-explosion-dashring-~85s.png`
  and the Huntdown motion frames, our `09-enemy-encounter.png` is clean but sparse:
  flat two-tone parallax hills + a single moon, simple grass-topped platforms, a
  small player sprite, and thin dash-style bullets. The competitors show dense
  metallic tilework, real fore/mid/background depth, detailed enemy sprites, and
  layered explosion particle systems. This matches the prior written assessments in
  `reference/assessments/`. **This is the art builder's domain** — reported, not fixed.

### Fidelity comparison harness (repeatable — closes the "looking frame" gap)

`playtest/e2e/fidelity.mjs` now builds this comparison as a **repeatable
artifact** each cycle instead of prose alone: it serves the repo root, loads our
live frame next to the closest-context competitor frame same-origin, and composes
a labelled side-by-side contact-sheet PNG (`OURS | REF`, normalized height,
retro-crisp) into `playtest/frames/fidelity/`. It also computes **advisory** CV
pre-filter metrics (palette richness / ink coverage / edge-density busyness) into
`metrics.json` — advisory ONLY; the verdict below is a direct multimodal READ of
the sheets, per mandate.

Run: `node playtest/e2e/fidelity.mjs` (after `playthrough.mjs` refreshes frames).

**It is now a GATE, not just an artifact generator.** The harness validates the
FACTS a fair comparison requires — every input frame exists, and both the boss frame
(mid-fight: `status=playing & enemiesAlive>=1`) AND the firefight frame (a BUSY
peak beat: `onScreenEnemies>=3 && (fx>=1 || particles>=10)`) are genuine captures —
facts read off `__bench`, NOT fidelity thresholds. If a fact fails, the pair is
recorded `valid:false`, the sheet is STILL composed (as evidence of the bad
frame), `metrics.json.ok` goes false with a `failures[]` repro, and the process
**exits non-zero** — an unfair pairing can no longer pass silently. (Verified both
ways: boss-alive @frame300 → exit 0, all pairs valid; boss-dead @frame800 → exit 1,
boss pair INVALID. The fidelity *verdict* stays a human multimodal read — the gate
only enforces that what we're looking at is a legitimate like-for-like frame.)

| Contact sheet | Advisory Δ (ref − ours) | My multimodal verdict (looked at the sheet) |
|---------------|--------------------------|---------------------------------------------|
| `firefight-vs-huntdown.png` | colors +668, ink −0.116, edge +0.067 | **Now a fair peak-vs-peak beat** (OURS = busy firefight @frame300: 4 on-screen enemies, rifle stream, a ground explosion — verified `busy`). Huntdown is still a denser ornate interior (pillars, signage, layered props). Our action reads honestly now but the **environment/tile density** remains below bar; the gap narrowed (colors +837→+668) once the calm-beat artifact was removed. |
| `firefight-vs-blazing-chrome.png` | colors +376, ink +0.178, edge +0.031 | **Now a fair peak-vs-peak beat** — OURS at frame300 shows its own action: grunts on platforms + red runners, a rifle-fire stream, and a ground explosion. Blazing Chrome still has denser metallic tilework + a bigger layered explosion + dash-ring VFX. Our explosion/particle layering + environment density are **below bar**, but the gap narrowed (colors +535→+376) now that OURS is a real firefight, not a lull. |
| `boss-vs-blazing-chrome.png` | colors +105, ink +0.053, edge **−0.02** | **Now a FAIR pairing** — the harness captures a real mid-fight boss frame (`ours-boss-midfight.png`, boss scenario @frame 300, verified `status=playing enemiesAlive=1`). Our boss encounter reads correctly: SENTINEL mech + red HP bar + name callout + prone-dodge player firing SPREAD. Remaining gap is narrower and specific — **boss sprite SCALE + arena composition/detail**, not "no boss." (Edge density is now *higher* than this ref frame; the old +249 gap was an artifact of comparing an empty STAGE CLEAR screen.) |
| `firefight-vs-gunnrun-web.png` | colors **−199**, ink −0.549, edge −0.053 | **DIRECT browser rival (the goal's literal win condition).** GUN N' RUN (top itch.io HTML5 run-and-gun) is stark near-monochrome: small blocky box-characters, girder platforms, one pink muzzle blast, ammo-pip HUD — minimalist jam-quality. **OURS clearly EXCEEDS it** — detailed 16-bit sprites, multiple enemies, a ground explosion, tiled platforms, layered parallax + moon/stars, full HUD. Ours has *more* colors/ink/edge (negative Δ = ref is sparser). |
| `duel-vs-gunnrun-web.png` | colors **−201**, ink −0.459, edge −0.053 | Same verdict, second GUN N' RUN beat (blocky box hero vs pink box enemy exchanging pink projectiles on a girder). **OURS exceeds** on sprite detail, environment depth, and palette richness. |

**Verdict — two competitive axes, honestly distinguished:**
- **vs console/premium tier (Blazing Chrome, Huntdown):** OURS is **below bar** — the
  specific deficits are environment/tile density, fore/mid/back depth, and explosion/
  particle layering. Confirmed *by looking*. Art builder's domain — reported, not fixed.
- **vs the goal's DIRECT browser rivals (itch.io/CrazyGames HTML5, e.g. GUN N' RUN):**
  OURS is **above bar** — confirmed *by looking* and corroborated by the advisory metrics
  (ours is richer/busier). This is the literal "players prefer over today's web Contra-likes"
  comparison, now grounded from the e2e seat with repeatable contact sheets.
- **Honest caveat:** GUN N' RUN is ONE sample; the itch HTML5 tag spans jam entries of
  varying quality (a few are more polished). The tier *skews* minimalist, so this is a
  representative-not-exhaustive read. Feel/state completeness remains strong across the board.

---

## OPEN ISSUES

### 2026-07-10 — ✅ RESOLVED — [TOUCH-1] Touch restart from game-over (was: keyboard-less player stranded)
- **Was:** MEDIUM — after game-over, no overlay button restarted (tried all six); a keyboard-less
  Android player could not replay without reloading. `restart` was `R`-keydown only.
- **Fixed:** PR#82 — `touch.js:84` now calls `world.reset()` on a touch press while status is
  `gameover`/`cleared` (and `world.start()` while `title`). Verified LIVE this cycle on a mobile-
  emulated phone: reached `gameover` on touch, tapped FIRE → `status='playing'`. My previously-red
  `touch.restartFromGameover` assertion flipped to PASS and now stands as a **regression guard**.
- **Still a low-pri nicety (not asserted):** no on-screen weapon-**swap** button (swap is keyboard);
  not blocking, so left unfiled as a gate.

### 2026-07-10 — ✅ RESOLVED — [BOSS-3] Enrage heat-glow red rectangle around the boss (render bug)
- **Was:** MEDIUM — the enrage heat-glow was an unmasked `fillRect` over the whole sprite bounding-rect
  (`render.js`), washing a hard-edged red rectangle into the boss's transparent margins during the boss
  climax. I confirmed it by looking (4× zoom) + measured margin redness excess ~62–66.
- **Fixed:** PR#86 — the glow (and the boss hit-flash) is now masked to the sprite. Verified LIVE this
  cycle: `boss-enrage-zoom.png` shows the red glow ON the mech armor (intended) with **clean corners** —
  no rectangle. The mech's core/chest glow is the intended effect and remains.
- **Grounding note (why my test briefly looked red first):** my original probe sampled the glow-rect's
  top-CENTER, which now overlaps the mech's (correctly-glowing) head → a false positive (excess ~40).
  I re-sampled the true transparent **corners** (top-left/top-right, which a centered mech never fills):
  excess dropped to **≈ −1.9** (corners TL=−37.9, TR=−39.2 match background −36). Per mandate I trusted
  the LOOK over the stale CV region and corrected the metric. `bossEnrage.glowMaskedToSprite` now PASSES
  and stands as a **regression guard** (re-reddens if an unmasked fillRect returns).

### 2026-07-09 — ✅ RESOLVED — Firefight fidelity sampled a CALM beat (FIDHARNESS-1, parent-flagged)
- **Was:** the firefight pairs used `09-enemy-encounter.png` — a lull (player at
  spawn firing at a dormant 2-enemy cluster), unfairly compared against a
  competitor's peak firefight. The reference loop downgraded FIDHARNESS-1
  RESOLVED→PARTIAL because these deltas (+545/+837) were a calm-vs-busy artifact.
- **Now:** `fidelity.mjs` captures a real **busy** beat via the showcase scenario
  (`?headless=1&frames=300`) → `ours-firefight-busy.png`, and GATES it: the pair is
  `valid:false` + the run exits non-zero unless the frame is genuinely busy
  (`onScreenEnemies>=3 && (fx>=1 || particles>=10)` off `__bench`). Probed & verified:
  frame300 = 4 enemies on-screen, 10 bullets, 19 particles, 1 live explosion.
  Looked at both sheets: OURS now shows its own firefight (grunts + runners + rifle
  stream + ground explosion). Gap narrowed (colors +545→+376, +837→+668) and is now
  a like-for-like read: **environment/tile density + explosion scale** remain below
  bar — the art builder's target, judged on a fair beat. Same class of fix as the
  boss-frame caveat resolved below.

### 2026-07-09 — ✅ RESOLVED — Boss-fight fidelity now fairly captured
- **Was:** LOW — the boss pair used `14-boss-win.png` (post-victory STAGE CLEAR,
  boss already gone), an unfair apples-to-oranges comparison.
- **Now:** `fidelity.mjs` drives the build's own boss scenario to a **mid-fight
  frame** (`?scenario=boss&frames=300`) and captures `ours-boss-midfight.png`,
  asserting the boss is genuinely present (`status=playing`, `enemiesAlive=1`)
  before compositing — else it WARNs and flags the pair unfair. Boss-alive window
  probed live (engaged through ~frame 350, dies ~450); re-probe if boss HP/tuning
  changes. The boss row above now carries a real verdict. Metric gap collapsed
  from colors +249 → +105 (edge density even flips in our favour), confirming the
  prior number was a comparison artifact, not a fidelity signal.

### 2026-07-09 → ✅ RESOLVED 2026-07-10 — [TOP / required scope] In-game creator-approval feedback panel
- **Resolved:** the panel **LANDED** (`game/src/feedback.js`, wired in `main.js`, per
  `feedback/SPEC.md`). Verified LIVE — the gate's single critical red is CLOSED and the ship
  VERDICT flipped **FAIL → PASS**. Two layers of grounding:
  - **API/contract (7 checks):** `panelExists` + `controllerSurface` + `approveGatesRelease`
    (APPROVE rating≥3 → `releaseApproved=true` w/ full auto-context) + `rejectRevokes` +
    `contradictoryClosed` (rating 1–2 keeps gate closed) + `defaultClosed` + `hotkeyToggles`.
    My functional harness was validated vs compliant + broken mocks — it catches real flaws.
  - **REAL creator DOM path (5 checks, added this cycle):** `opensAndRenders` (F opens a panel
    with ✓APPROVE/✗REJECT buttons + stars + notes) + `pausesOnOpen` (AC-2: sim frozen while
    open — frame/x unchanged, creator can't die) + `noKeyLeak` (AC-3: R/2 swallowed — no reset,
    mode stays arcade) + `approveButtonWorks` (clicking ★4 then the real APPROVE **button** →
    entry verdict=approve rating=4, `releaseApproved=true`) + `escCloses`.
  - **RELEASE-GATE PERSISTENCE (AC-4, added this cycle):** `persistsAcrossReload` — after a
    real `page.reload()`, the ★4 APPROVE submitted via the live panel is **still** present
    (`releaseApproved=true`, entries=1, latest=approve) — read back from `localStorage` by the
    freshly-mounted controller. This grounds the exact mechanism the release-gate consumer
    (`feedback/release-gate.mjs`, PR#112) depends on: a creator's verdict must survive so a
    later ship/publish step reads it. root.E verified consumer↔panel *parity* on synthetic
    entries; this is the missing end-to-end live-panel→reload persistence, from the e2e seat.
  - **Looked at it:** `frames/live/creator-approval.png` (full-page shot) renders the panel per
    SPEC §3.3 — title "BUILD FEEDBACK — creator approval", auto-context line (`build dev · arcade
    · playing · score 0`), 5-star rating, notes textarea, green APPROVE + red REJECT, "esc to
    close", translucent backdrop over the dimmed frozen game. Clean, correct, professional.
- **History (was, for the record):** HIGH — required deliverable, the ONLY critical red.
  The CONTRACT first landed as `feedback/SPEC.md` (root.E) speccing `window.__approval`
  (`submit/latest/entries/releaseApproved/toggle/…`), hotkey `F`, localStorage, release
  gate. **Implementer root.B** shipped `game/src/feedback.js`. Before that — the
  live build still has no `window.__approval` and no matching DOM (verified this cycle:
  `DOM=false api=false`).
- **My gate is now a FUNCTIONAL acceptance harness (upgraded this cycle), not presence-only.**
  While the controller is absent, only the critical `creatorApproval.panelExists` red
  fires. The moment `window.__approval` lands, these ADDITIONAL checks activate and
  verify the SPEC's acceptance criteria (feedback/SPEC.md §4/§5) — so the gate proves the
  channel *works*, not just that an element exists:
  - `creatorApproval.controllerSurface` — has `toggle/submit/entries/latest/clear` + `releaseApproved`.
  - `creatorApproval.approveGatesRelease` — APPROVE (rating≥3) persists with full auto-context (buildId/status/mode/score/lives) and opens `releaseApproved` (AC-4/AC-7).
  - `creatorApproval.rejectRevokes` — a later REJECT flips `releaseApproved` back to false (AC-5).
  - `creatorApproval.contradictoryClosed` — APPROVE + rating 1–2 keeps the gate closed (AC-6).
  - `creatorApproval.defaultClosed` — after `clear()`, release is closed by default (AC-8).
  - `creatorApproval.hotkeyToggles` — `F` toggles the panel (AC-1).
- **Harness validated (not a rubber-stamp):** I injected a SPEC-compliant mock controller
  → all checks PASS; injected a broken one (`releaseApproved` ignores rating) → my
  `contradictoryClosed` check correctly FAILS. So it catches real violations.
- **Test:** `playthrough.mjs → creatorApproval.*` — `panelExists` goes green + the
  functional checks run and must pass once root.B ships `game/src/feedback.js` per the SPEC.

### 2026-07-09 — No perf/fps telemetry exposed on `window` (measured around, not blocked on)
- **Severity:** LOW (feel is measurable via `world.frame`; this is a convenience/perf-grounding gap).
- **Owner:** engine builder (`game/`).
- **Repro:** the on-screen fps meter is a **local `fps` variable** inside the rAF
  loop (`game/src/main.js` ~L137/155) and is never published. `window.__game.__fps`
  is `undefined`, so `snap().fps` is always `null`. `results.json → feel.fpsExposedOnWindow = false`.
- **Impact:** QA cannot read the render-side frame rate or entity/draw counts
  programmatically for perf grounding under load — I fall back to measuring the
  **sim** cadence from `world.frame` (which works: 58.8 steps/s). But render fps ≠
  sim cadence when the loop does catch-up steps, so a real perf regression on the
  render side could hide.
- **Intended behavior:** publish `world.__fps` (render fps) and lightweight entity/
  draw counts (enemies, bullets, particles, draw calls) on a stable `window` hook so
  a headless harness can gate perf. Aligns with strategy `task_instrument_fps_entity_telemetry`.
- **Test:** `playthrough.mjs → assert('feel.fpsTelemetryExposed', …)` (non-critical
  red; goes green once `__fps` is exposed).

### 2026-07-09 — ✅ RESOLVED — No title / start state (closed by PR#34)
- **Was:** MEDIUM — build booted straight to `playing` with no title/start gate.
- **Now:** live boots to `status='title'` (arcade insert-coin entry), difficulty
  mode-select (Digit1 ARCADE / Digit2 CASUAL) on the title, and a START key
  (Space/Z/X/Enter) transitions title→playing. Verified LIVE this cycle — see the
  state-machine table rows 1/1b/1c. `title.startGateExists`, `title.bootsArcadeDefault`,
  `title.modeSelectCasual`, `title.modeSelectArcade`, `title.startTransitions` all PASS.
  Captured frames: `01-boot.png` (title), `02-title-casual.png`, `03-start-play.png`.

### 2026-07-09 — Visual fidelity below the competitor bar (tracked, art domain)
- **Severity:** MEDIUM (feel is there; look is not yet at the bar).
- **Owner:** art builder (`assets/`, `game/src/render.js`).
- **Repro:** compare `playtest/frames/live/09-enemy-encounter.png` against
  `reference/frames/blazing-chrome-2019/motion/*` and `huntdown-2020/motion/*`.
- **Gap:** background/environment tile density, sprite detail, and explosion/particle
  richness are well short of the competitors. Not currently gated by an assertion
  (fidelity is a judgment, not a fact) — tracked here as the standing art target.

---

## What this seat does NOT yet cover (honest gaps in QA itself)
- **Live boss win path** is scenario-driven, not live-keyboard (see note above). A
  future cycle could add a save-state / warp hook (engine) so the boss fight is
  reachable on live input for a true end-to-end run.
- **Feel timing** (fire cadence, hit-stop duration, trauma/shake, sim cadence) is
  now MEASURED live in wall-clock — see the Feel & cadence table. Still open:
  render-side fps/entity counts (blocked on the telemetry gap above) and a
  per-frame motion-diff of the *animation* cadence (run-cycle beat spacing).
- **Frame-diff fidelity metric** is currently a human read of the PNGs; a pixel/SSIM
  pre-filter against the corpus could be added as an advisory gate (never the verdict).
