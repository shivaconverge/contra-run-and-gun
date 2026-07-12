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

| # | Theme | Boss (isBoss) | Reached via | Nearest sibling (min grid / hist Δ) | Distinct? | Pass |
|---|-------|---------------|-------------|--------------------------------------|-----------|------|
| 1 | jungle   | Sentinel      | boot (stage 1, no param) | 2 · 18.58 / 0.593 | ✅ | ✅ |
| 2 | cascade  | Gunship       | `N` → requestNextStage   | 1 · 18.58 / 0.593 | ✅ | ✅ |
| 3 | snow     | Ice Sentinel  | `N` → requestNextStage   | 4 · 54.13 / 1.481 | ✅ | ✅ |
| 4 | desert   | Sand Gunship  | `N` → requestNextStage   | 5 · 49.65 / 1.719 | ✅ | ✅ |
| 5 | foundry  | Foundry Core  | `N` → requestNextStage   | 7 · 10.12 / 0.558 | ✅ | ✅ |
| 6 | caverns  | Crystal Wing  | `N` → requestNextStage   | 7 · 18.57 / 1.618 | ✅ | ✅ |
| 7 | fortress | Red Falcon    | `N` → requestNextStage   | 5 · 10.12 / 0.558 | ✅ | ✅ |

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

_No campaign-blocking defects observed this run. If a future run drops
`scope_served` below 7/7, the failing stage's `reasons[]` in `scope-served.json`
names the cause (`not-reached-normally` → wiring/C, `boss-missing-or-not-isBoss` →
wiring/C, `visual-reuse-of-sibling` → art/B) and its frame is the evidence to hand
that builder._
