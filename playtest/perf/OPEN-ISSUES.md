# PERF OPEN ISSUES

Failing/known perf items on the LIVE build, most severe first. Each is backed by
a machine-checked probe under `playtest/perf/` and a JSON artifact in `results/`.
These are recorded (not masked) so builder seats can close them; the perf harness
asserts the INTENDED behavior and will flip to PASS once fixed.

---

## 2026-07-12 — PERF-1 (BLOCKER): all 7 music tracks eager-loaded & decoded at boot

**Severity:** blocker (memory + cold-payload budget both fail).
**Owner to fix:** root.C (game code) — asset-loading strategy.
**Probes:** `cold-load.mjs` (`payload.cold-ceiling` FAIL), `music-memory.mjs`
(`audio.decoded-ram-ceiling` FAIL).

**Repro:**
```
node playtest/perf/cold-load.mjs --profile mobile   # payload.cold-ceiling FAIL: 14.72 MB vs 3.5 MB
node playtest/perf/music-memory.mjs                 # audio.decoded-ram-ceiling FAIL: 403 MB vs 128 MB
```

**Observed on live build (`shivaconverge.github.io/contra-run-and-gun/`):**
- Cold first-paint payload **14.72 MB**, of which **14.50 MB (98.5%) is the 7
  music mp3s**; 93.2% of the total is stages-2..7 content loaded upfront.
- All 7 tracks decode eagerly to **403 MB of resident float32 PCM** (27.8× the
  mp3), held in a 480×270 tab from stage 1 — a tab-eviction risk on mobile.
- Slow-4G cold download completes in **75.2 s**.

**Root cause:** `game/src/main.js` calls `audio.loadTracks(urls)` with all 7
track URLs at boot; each is fetched and `decodeAudioData`-decoded immediately.
`game/src/assets.js` `AssetStore.load(ASSET_MANIFEST)` similarly eager-loads every
image, but images are ~85 KB total so that path is fine.

**Intended behavior (what the harness asserts):** load one stage's music at a
time. Fetch+decode the current stage's track on `world.onStageChange` (optionally
prefetch N+1); release the prior track's `AudioBuffer`. Expected: cold payload
→ ~1.0 MB, resident audio → ~58 MB, Slow-4G download → ~5 s. `cold-load` and
`music-memory` will then PASS.

**Status:** OPEN. Harness is red by design until root.C lands lazy music loading.

---

## 2026-07-12 — PERF-2 (should): individual tracks are long/heavy

**Severity:** medium. **Owner:** root.B (asset regen).
**Probe:** `music-memory.mjs` per-track table.

s2_cascade is 216 s / 3.12 MB mp3 / **72.7 MB decoded** — even loaded lazily,
that is a heavy single track. Tracks range 81–216 s. Shorter seamless loops
(≤90 s), mono, or lower bitrate would cut per-track download+decode. s1_jungle
(81 s / 854 KB / 27 MB) is a good size target to match.

**Status:** OPEN (secondary to PERF-1; lazy-loading alone brings the build inside
budget, this reduces the per-stage residual further).

---

## 2026-07-12 — PERF-3 (follow-up, NOT a defect): driven per-stage pacing not yet captured

This cycle measured steady-state rAF pacing at the title/stage-1 (59.9 fps,
≤0.2% dropped, flat heap — PASS). Frame pacing *driven through all 7 stage
transitions + boss fights* (and heap growth across a full campaign run) is the
next perf increment: a driving harness layered on the e2e state driver
(`playtest/e2e/playthrough.mjs`). Not a defect — a coverage gap in the perf
seat's own evidence. Tracked here so it is not forgotten.

**Status:** OPEN (next perf increment).
