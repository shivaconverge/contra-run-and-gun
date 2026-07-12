# ACCEPTANCE — `scope_served` (player-POV, normal progression)

**Perspective:** end-to-end player, driving the **live** browser build in headless
Chrome. Boot at the campaign start (`/`, **no `?level=` param**), start with a real
`Space` keypress, then advance stage 1 → 2 → … → 7 → VICTORY using the SHIPPED
player transition (`world.requestNextStage`, fired by the real **`N`** CONTINUE
keydown that `game/src/main.js` binds). One real, native-resolution frame is
captured off the live `<canvas>` per stage.

**The single fact this run emits (BOTH targets, latest run 2026-07-12):**

```
LOCAL  (served game/):        scope_served=7/7  verdict=PASS  victory=true
PUBLIC (live github.io URL):  scope_served=7/7  verdict=PASS  victory=true  deployDrift=none
```

- **Harness:** `playtest/acceptance/scope-served.mjs` (self-contained; own static
  server on an ephemeral port + puppeteer-core). One harness, two targets.
- **Run it (from repo root):**
  ```bash
  cd playtest/acceptance && npm install     # one-time (node_modules gitignored)
  # LOCAL — serves game/ on an ephemeral port, plays 1→7:
  node playtest/acceptance/scope-served.mjs
  # PUBLIC — drives the LIVE deployed URL real players reach:
  node playtest/acceptance/scope-served.mjs --url=https://shivaconverge.github.io/contra-run-and-gun/
  ```
- **Machine-readable output:** `scope-served.json` (local) / `scope-served-live.json` (public)
- **Frame evidence:** `frames/stage-<n>-<theme>.png` (local) / `frames/public/stage-<n>-<theme>.png` (public)

### ONE COMMAND — the consolidated acceptance gate

```bash
node playtest/acceptance/run-acceptance.mjs        # local + public (authoritative)
node playtest/acceptance/run-acceptance.mjs --local-only
```

`run-acceptance.mjs` is the single player-POV signal. It runs **every** harness fresh
against BOTH targets, aggregates their real FACTS into `acceptance-summary.json`, and
**exits 0 iff the LIVE public campaign serves 7/7 to victory with no deploy drift AND
the local build agrees AND fresh weapon evidence was captured**. Latest gate
(2026-07-12): **`scope_served=7/7 (public-url) verdict=PASS`**, 8/8 checks green.

Honest boundary it holds: the campaign facts gate the exit code; the "exactly ONE
weapon per entity" call is **by-looking** (from `weapon-verdict.json`) and is NOT
faked — the gate re-hashes the weapon render path and flags the verdict
POSSIBLY-STALE (forcing a human re-look) if `render.js`/`player.js` changed. A
run that boots but never sustains play (a gate-sequencing artifact, not a game
defect) is retried and, if still invalid, reported as `GATE-INFRA-ERROR` (exit 2),
distinct from a real campaign FAIL — so a false 0/7 can never read as a game defect.

---

## What `scope_served` counts (a FACT, computed by code)

A stage counts toward `scope_served` **only** when all three hold:

1. **Reached via normal progression** — stage 1 from a param-free boot; every later
   stage only via the real `N`/`requestNextStage` transition (never a URL jump). The
   boot probe records `urlHasLevel=false, stageNum=1` to prove no stage was skipped.
2. **Boss present** — `world.boss` registered and flagged `def.isBoss === true`.
3. **Visually distinct** — its 24×14 average-color grid AND its palette histogram
   diverge from **every** other reached stage above the reuse thresholds
   (grid ≥ 6.0 / 255, palette-L1 ≥ 0.35). Below both ⇒ suspected tile/background
   reuse of that sibling, and the stage is dropped from `scope_served`.
4. **Music present + distinct** — the LIVE audio layer (`window.__audio.track`,
   read off the running game) selects a real biome loop that is (a) non-null (not
   the synth fallback), (b) **unique** among all reached stages, AND (c) names this
   stage's theme (track ids are `s<N>_<theme>`, so a snow stage must be playing
   `s3_snow`). A stage on the synth fallback, or reusing a sibling's track, is
   dropped from `scope_served`.

> The CV grid/palette diff is an **advisory pre-filter, not the fidelity verdict.**
> The frames are written to disk so a human LOOKS at them side-by-side. The
> by-looking verdict is recorded below.

**Harness affordance (documented, not a cheat):** to keep a 7-stage playthrough
deterministic, once a stage's biome frame is captured the sensor marks that stage's
boss dead through the live world so the **shipped** win-check flips it to `cleared`,
then presses the real `N`. This measures REACH + VISUAL DISTINCTNESS + the real
transition chain. Combat DEFEATABILITY (can a competent player actually kill each
boss) is a *separate* fact proven by `World.bossDefeatableTest` in
`game/src/world.js` — it is intentionally out of scope here.

---

## Per-stage result — latest run (2026-07-12)

| # | Theme | Boss (isBoss) | Reached via | Nearest sibling (min grid / hist Δ) | Vis. distinct | Music (distinct) | Pass |
|---|-------|---------------|-------------|--------------------------------------|---------------|------------------|------|
| 1 | jungle   | Sentinel      | boot (stage 1, no param) | 2 · 18.58 / 0.593 | ✅ | `s1_jungle` ✅ | ✅ |
| 2 | cascade  | Gunship       | `N` → requestNextStage   | 1 · 18.58 / 0.593 | ✅ | `s2_cascade` ✅ | ✅ |
| 3 | snow     | Ice Sentinel  | `N` → requestNextStage   | 4 · 54.13 / 1.481 | ✅ | `s3_snow` ✅ | ✅ |
| 4 | desert   | Sand Gunship  | `N` → requestNextStage   | 5 · 49.65 / 1.719 | ✅ | `s4_desert` ✅ | ✅ |
| 5 | foundry  | Foundry Core  | `N` → requestNextStage   | 7 · 10.12 / 0.558 | ✅ | `s5_foundry` ✅ | ✅ |
| 6 | caverns  | Crystal Wing  | `N` → requestNextStage   | 7 · 18.57 / 1.618 | ✅ | `s6_caverns` ✅ | ✅ |
| 7 | fortress | Red Falcon    | `N` → requestNextStage   | 5 · 10.12 / 0.558 | ✅ | `s7_fortress` ✅ | ✅ |

Verified on BOTH targets (local serve + public URL). All 7 stages play a distinct,
theme-matched biome track live — no synth fallback, no reused track.

**scope_served = 7/7**, VICTORY reached (final stage cleared → terminal `cleared`,
no next stage offered).

- **Missing stages:** none.
- **Reachable-only-by-param:** none (all 7 reached from a param-free boot via the
  real `N` transition; stage 1 boot probe confirms `urlHasLevel=false`).
- **Reusing another stage's tiles:** none. The closest pair by CV is 5↔7
  (foundry/fortress, both dark-warm), min grid Δ 10.12 — still comfortably above the
  6.0 reuse floor.

---

## By-looking verdict (the real distinctness call — I read all 7 frames)

Each stage renders a clearly different biome — distinct background silhouette,
tileset/floor, set-dressing, and boss:

- **1 jungle** — green canopy ridges, moonlit night sky, dirt-and-grass floor.
- **2 cascade** — teal waterfalls over a dam silhouette, blue-green tiled floor.
- **3 snow** — white snow-capped peaks, pale ice ground, falling snow, snow-pines.
- **4 desert** — golden dunes, warm tan sky, sand-brick floor, saguaro cacti.
- **5 foundry** — orange industrial smokestacks, molten/flaming floor line, dark
  girder tiles.
- **6 caverns** — violet crystal clusters glowing off a purple cave wall, crystal
  floor.
- **7 fortress** — dark-crimson castle wall with banners and red hills, brazier
  decor, red-black tiles.

The tightest CV pair (5 foundry vs 7 fortress) is **unambiguously distinct by eye**:
foundry is bright-orange industrial with fire; fortress is dark-crimson castle with
banners. Confirmed: all 7 pass the human distinctness bar, matching the CV
pre-filter. No stage reuses another's art.

---

## BOSS axis — the 7 bosses are PRESENT + visibly distinct (by looking)

`scope-served` asserts each stage's boss is *registered in state* (`world.boss`,
`def.isBoss`) but its per-stage frame is captured at SPAWN, where the boss — parked
past the arena barrier — is off-screen and never rendered. So the boss was never
actually LOOKED at. `boss-fidelity.mjs` closes that: it plays 1→7 via NORMAL
progression, and for each stage drives the player to the boss firing line,
**activates the boss, snaps the camera to center it**, and captures a zoomed frame
of the rendered boss off the live `<canvas>` (`frames/boss/…`, public under
`frames/boss/public/…`). Latest run: **7/7 bosses captured, 7 distinct names**, on
both local and the public URL.

**Affordance GROUNDED (2026-07-12) — `boss-arena-validate.mjs`.** The obvious worry:
does "force `boss.active=true` + snap the camera" show the REAL boss the player
meets, or a degraded/pre-entry pose? I proved it faithful by capturing stage 1's
Sentinel **two ways in one run**: (a) NATURAL — actually driving the player the full
length of stage 1 with real `ArrowRight` + auto-hopping the gaps until the boss woke
on its own AND the camera settled at the arena barrier; (b) AFFORDANCE — the exact
boss-fidelity move. Result: identical camera position (`camx=1920` both), same boss
(`Sentinel`), and a near-zero crop diff (grid Δ **4.45**/255, palette-L1 **0.081**)
— the tiny residual is just the boss's idle-bob animation phase. By looking, the two
frames are the same boss, palette, silhouette, and framing. Since the natural
activation gate (camera-proximity, `world.js`) is identical for every stage, this
validates the affordance for all 7. (Caveat honestly noted: the capture lands on
whatever animation frame is live, not a fixed pose — fine for a presence/distinctness
look.)

**By-looking verdict (2026-07-12): all 7 bosses PRESENT and visibly distinct.** Two
design families — a walker MECH and a flying CHOPPER — each themed per biome:

| # | Boss | Family | What I see |
|---|------|--------|-----------|
| 1 | Sentinel     | mech    | steel-grey walker mech, **red** eye/core, big cannon arm (jungle) |
| 2 | Gunship      | chopper | **dark** military attack helicopter, rotor + chin gun (cascade teal) |
| 3 | Ice Sentinel | mech    | **ice-blue** walker, **cyan** core, rounded armor (snow) |
| 4 | Sand Gunship | chopper | **tan/sand-camo** helicopter, pink tracers (desert dunes) |
| 5 | Foundry Core | mech    | squat industrial **cannon-turret tower**, **orange furnace** glow (molten foundry) |
| 6 | Crystal Wing | chopper | **purple** sleek jet-gunship, pointed nose (violet caverns) |
| 7 | Red Falcon   | mech    | **crimson + gold** humanoid mech (fortress) |

The CV-closest pair (Foundry Core vs Red Falcon, min grid Δ 22) is **starkly
different by silhouette** — a fixed turret tower vs a humanoid biped — the CV only
rated them near for shared dark-warm palettes, which is exactly why the LOOK is the
verdict. Every boss is distinguishable.

**Feed-to-builder note (B = art):** within a family the base silhouette is shared and
differentiated by palette recolor + biome background — cascade Gunship vs desert Sand
Gunship are the same helicopter chassis in different liveries; Sentinel vs Ice
Sentinel the same walker recolored. They ARE distinguishable as-is; if a higher
distinctness bar is wanted later, the chopper/mech families are where added silhouette
variation would pay off. (Foundry Core already breaks its family's mold — a good model.)

---

## TWO-WEAPON defect — player-POV verification (the creator's REJECT gate)

`CREATOR_FEEDBACK.md` round 2 keeps the build REJECTED until the **two-weapon
defect** is fixed: the hero and the purple turret each showed TWO weapons on screen
— a gun baked into the sprite art (fixed) PLUS a procedural aiming gun drawn over it
— so you saw "a second gun at the waist" / a "phantom turret". The creator was
explicit: **"Verify by looking: one weapon per entity"**, and **"do not
self-certify from frame comparison alone."** That is exactly a judge-by-looking,
player-POV check — so `weapon-fidelity.mjs` drives the LIVE build, makes the hero
actually FIRE in each aim pose and a turret actually fire, and captures a **zoomed
crop of each weapon off the live canvas** (`frames/weapon/…`, public under
`frames/weapon/public/…`). I then READ the crops.

**By-looking verdict (BOTH local + public URL, 2026-07-12): ONE weapon per entity —
defect FIXED.**

- **Hero, `aim-right`** — holds a single rifle in **both hands**, horizontal; the
  muzzle flash sits at the **barrel tip**, exactly where the shot spawns. No waist
  gun. (`frames/weapon/hero-aim-right-*.png`)
- **Hero, `aim-up`** — the same single rifle rotates to point **straight up**, held
  in the hands, bullet leaving the muzzle. One gun, following the aim.
  (`frames/weapon/hero-aim-up-*.png`)
- **Turret** — a single grey gunmetal cannon barrel on a **weaponless purple dome**
  (the canonical rotating-barrel-over-weaponless-base solution). No second baked
  gun. (`frames/weapon/turret-*.png`)

The weapon you SEE and the weapon that FIRES are the same one, for both entities, on
the deployed build. This clears the *behavioral* half of the creator's gate from the
player's eyes; the formal **creator APPROVE** artifact is the feedback loop's to
record.

**RE-CONFIRMED 2026-07-12 (later), after `render.js` drift.** The staleness guard in
`run-acceptance.mjs` fired when a set-dressing commit changed `render.js`
(`d57dd3e8…` → `ea2492a1…`). Acting on it, I re-captured weapon frames on the
render-drifted build and re-judged BY LOOKING: hero still shows ONE horizontal rifle
in both hands (muzzle at the barrel tip), turret still ONE barrel on a weaponless
dome — the set-dressing change did **not** reintroduce the two-weapon defect. A
full-canvas capture also confirmed the hero renders correctly at its `px/py` (no
render-offset regression). `weapon-verdict.json` `renderPathHashesAtVerdict` is
updated to the confirmed build (stale flag cleared with a fresh grounded verdict);
the re-look is logged under `reconfirmations`.

---

## PUBLIC-URL grounding — the LIVE deploy real players reach

`scope_served` is now proven against **both** the local worktree AND the deployed
public URL `https://shivaconverge.github.io/contra-run-and-gun/` (parent correction:
"local == public is unverifiable from the integration subtree — live scope_served
must still be confirmed against the public URL"). The `--url=` mode drives the
identical playthrough (param-free boot → `N`-progression 1→7 → victory) against the
CDN and captures its own frames under `frames/public/`.

**Latest public run (2026-07-12): `scope_served=7/7 verdict=PASS victory=true`**,
boot probe `stageNum=1, urlHasLevel=false`. The public frames were read side-by-side
with the local ones — every biome (jungle…fortress) renders the same distinct
tileset/background/set-dressing/boss on the live URL as locally. No missing art, no
param-only stage, no reuse.

**Deploy-drift guard (remote stale-serve):** we cannot kill a lingering process on a
CDN, so instead we FETCH the live modules and diff their sha256 against local
`game/`. Latest run — all match, `deployDrift=none`:

| file | HTTP | remote sha16 | local sha16 | match |
|------|------|--------------|-------------|-------|
| index.html               | 200 | 1984a026f957cee3 | 1984a026f957cee3 | ✅ |
| src/main.js              | 200 | 8bc26f8f52bc0bcb | 8bc26f8f52bc0bcb | ✅ |
| data/config.js           | 200 | 0170aa74f2b4fbb9 | 0170aa74f2b4fbb9 | ✅ |
| data/level1.js           | 200 | 9d669e4955f62b36 | 9d669e4955f62b36 | ✅ |
| assets/audio/manifest.json | 200 | 7d0347519cdec35c | 7d0347519cdec35c | ✅ |

⇒ the live public build **is** this worktree's build (not a stale deploy). If a
future run shows `deployDrift=[…]`, the named files have not shipped to the live URL
yet — that gap is the **deploy owner's** to resolve, and the report will flag it
without masking (`scope_served` still reflects the bytes the URL actually served).

## Stale-serve guard (local mode)

- The sensor `pgrep -f`/`kill -9`s any lingering `serve.mjs` / `stage-boot-music` /
  `go-live` before serving, then serves `game/` on an **ephemeral** port (never
  `:8080`), so no stale shipped server can shadow the run. Latest run killed: none
  (box was clean).
- Every file handed to the browser is sha256-hashed; the digest map is recorded in
  `scope-served.json` under `staleServeGuard` — proof of exactly which bytes drove
  the run.

---

## OPEN ISSUES

### 2026-07-12 — favicon.ico 404 (cosmetic, non-blocking)
- **Severity:** trivial / cosmetic.
- **Symptom:** the browser auto-requests `/favicon.ico`; `game/index.html` declares
  no favicon, so the server returns 404. This is the *only* 404 (verified: audio
  `manifest.json` + all 7 `s*_*.mp3` tracks and every module resolve 200).
- **Impact:** none on gameplay, progression, art, or audio. Recorded here rather
  than swept so it is not mistaken for a missing game asset.
- **Repro:** boot the served build, watch the network panel — a single 404 for
  `/favicon.ico`. Fix (art/index owner): add a 16×16 favicon + `<link rel="icon">`.

### 2026-07-12 — gate (mine): back-to-back sessions can stall a run on the title screen
- **Severity:** gate robustness (NOT a game/deploy defect).
- **Symptom:** running 4 heavy browser sessions back-to-back in `run-acceptance.mjs`,
  the later public `scope-served` run booted + started but did **not sustain play** —
  every stage captured in `status:'title'`, every transition `STUCK` → a false
  `scope_served=0/7`. **Grounded that it is NOT a deploy defect:** the SAME public URL
  run standalone (and 2nd in the gate) plays 7/7 to victory with `deployDrift=none`.
- **Fix (this commit):** the gate (a) settles a few seconds between sessions so the
  prior browser fully tears down, (b) runs the scope playthroughs BEFORE the weapon
  captures (so the public scope run is 2nd, not 4th), and (c) detects an INVALID run
  (booted but no stage ever reached `playing`/`cleared` AND scope 0) and retries it up
  to 3×; a genuine content FAIL (some stages played, failed a predicate) is NEVER
  retried. A still-invalid run is reported `GATE-INFRA-ERROR` (exit 2), never a game
  FAIL. Post-fix: both scope runs valid on the first attempt, gate PASS 8/8.

### 2026-07-12 — harness (mine): weapon crops intermittently missed the hero — ROOT-CAUSED + FIXED
- **Severity:** harness reliability (NOT a game defect). RESOLVED this cycle.
- **Symptom:** `weapon-fidelity.mjs` intermittently captured empty crops (ground/
  bullets, no hero) for `aim-up`, `aim-diag-up`, and especially `prone`.
- **Root cause (found by reading `render.js`):** the harness set `player.iframe =
  99999` to keep the hero alive, but `render.js:1253`
  (`if (p.iframe > 0 && Math.floor(p.iframe/4) % 2 === 0) return;`) SKIPS drawing the
  hero on alternate 4-frame windows — the arcade invulnerability BLINK. A capture
  landing on a blink-OFF frame was therefore empty. Not a game bug — the blink is
  correct gameplay; the harness was fighting it.
- **Fix (this commit):** before each capture, zero `iframe` (so the hero draws SOLID,
  no blink), let ~70ms render, grab, then restore invuln for the rest of the pose.
  Verified: 24/24 hero crops across 2 runs are non-empty (grayscale σ 45–70, vs the
  near-uniform empties before), and by looking, every pose (incl. prone) now frames
  the hero holding ONE weapon. This also retires the earlier "prone crop" limitation
  — prone now frames reliably.

### 2026-07-12 — harness (mine): dropped synthetic `KeyN` caused a FALSE 5/7 (fixed)
- **Severity:** harness robustness (NOT a game/deploy defect) — but a *false* fail
  is as harmful as a masked pass: the first public run reported `scope_served=5/7`
  with stage 6→7 "not-reached-normally", which would wrongly point wiring/C at a
  non-existent transition bug.
- **Root cause:** a single `page.keyboard.press('KeyN')` can be dropped under remote
  (github.io) latency, so the CONTINUE never registered and stage 7 was never
  reached. **Grounding that it is NOT a deploy bug:** two immediately-subsequent
  public runs, and the `--url` runs after the fix, all reached 7/7 fortress with a
  distinct `s7_fortress` track; `World.campaignSpineTest` proves the 6→7 state
  machine deterministically.
- **Fix (this commit):** the transition presses the real `KeyN` up to 3× (proving
  the shipped key binding), then — only if the synthetic key never lands — falls back
  to the EXPOSED `window.__game.requestNextStage()` closure, which is the *same
  normal-progression function the `N` key invokes* (main.js binds `N →
  requestNextStage`), NOT a param skip. Crucially the fallback calls the SAME game
  function, so it can only rescue a dropped-keystroke flake — if the GAME's
  transition were actually broken the fallback fails too and the stage is recorded
  `transitionVia:"STUCK"` (real failure still surfaces, never masked). Each stage
  records `transitionVia` (`KeyN(real-key)` | `requestNextStage()-closure` | `STUCK`)
  and the run records `keyBindingProven`. Post-fix: 4/4 consecutive 7/7 runs (1
  local + 3 public), all 6 transitions via the real key (`keyBindingProven=true`).

_No campaign-blocking GAME defects observed this run — the live public campaign
plays 1→7 to victory with all four axes (tileset/background/set-dressing/boss +
music) present and distinct per stage. If a future run drops `scope_served` below
7/7, the failing stage's `reasons[]` in the JSON names the cause and routes it:
`not-reached-normally` → wiring/C, `boss-missing-or-not-isBoss` → wiring/C,
`visual-reuse-of-sibling` → art/B, `music-missing`/`music-reuse-of-sibling` →
audio+wiring — and the captured frame is the evidence to hand that builder._
