# PERF REPORT — LIVE campaign cold-load, payload & frame pacing

**Seat:** root.I (perf / end-user device POV). **Owns:** `playtest/perf/` only.
**Target:** the LIVE public deployment in `deploy/PUBLIC-URL.txt`
(`https://shivaconverge.github.io/contra-run-and-gun/`), driven with a **cold
browser cache** in headless Chrome over the real network.
**Generated:** 2026-07-12. Re-run with `node playtest/perf/run-all.mjs`.

All numbers below are **measured facts** — bytes-over-the-wire from CDP
`Network.loadingFinished.encodedDataLength`, rAF inter-frame deltas from a
page-side recorder installed before any game code, and decoded-audio PCM summed
from real `decodeAudioData` in the browser. Nothing here is self-reported by the
game.

---

## Headline verdict

| Question (from the perf mandate) | Answer |
|---|---|
| Does the 10× asset payload blow the browser/memory budget? | **YES — via AUDIO, not images.** 14.5 MB of music downloads cold and decodes to **403 MB of resident PCM** in a 480×270 tab. |
| Is stage-1 boot fast on cold cache, or does it block on all 7 biomes preloading? | **Boot is FAST** (first playable frame 363 ms desktop / 2.14 s mobile). It does **not** block on biome images — they are tiny. But the full cold download runs **75 s on Slow-4G**. |
| Is per-stage lazy-loading REQUIRED? | **YES, for MUSIC.** 93% of the cold payload and 86% of resident audio RAM belong to stages 2..7 and are loaded upfront. Image lazy-load is optional (images are negligible). |
| Runtime frame pacing vs the 60fps bar? | **PASS.** Median 59.9 fps, ≤0.2% dropped frames, JS heap flat. The engine is not the bottleneck; the asset-loading *strategy* is. |

---

## 1. Cold-load payload (what a first-time player downloads)

Total cold first-paint payload: **14.72 MB across 74 requests.**

| Asset kind | Cold bytes | Share |
|---|---:|---:|
| **music (7 mp3)** | **14.50 MB** | **98.5%** |
| code (js/mjs) | 130 KB | 0.9% |
| boss sprites (7) | 28 KB | 0.2% |
| backgrounds (6) | 16 KB | 0.1% |
| player/enemy sprites | 15 KB | 0.1% |
| tilesets (all biomes) | 14 KB | 0.1% |
| decor (6) | 11 KB | 0.1% |
| html + json | 24 KB | 0.2% |

**The entire art payload for all 7 biomes — every tileset, boss, background and
decor sprite — is ~85 KB combined.** The images are not the wall. The wall is
audio: seven 81–216 s music tracks (854 KB – 3.12 MB each).

### Stage-1-critical vs stages-2..7-upfront

- Stage-1-critical bytes: **1.01 MB** (of which 854 KB is the stage-1 music track).
- Stages 2..7 loaded upfront (deferrable): **13.71 MB = 93.2% of cold payload.**

A cold visitor who quits during stage 1 still paid to download the music for six
stages they never reached.

## 2. Time-to-first-playable-frame & full download

| Profile | First playable frame | Fully loaded (all music) |
|---|---:|---:|
| desktop (1× CPU, unthrottled) | **363 ms** | 1.87 s |
| mobile (4× CPU, Slow-4G: 1.6 Mbit/s, 150 ms RTT) | **2.14 s** | **75.2 s** |

The first playable frame is fast on both profiles because `assets.load()` only
gates on the (tiny) images, and `audio.loadTracks()` streams the mp3s **without
blocking** the rAF loop. So the strategy graph's specific worry — *"stage-1 boot
blocks on all 7 biomes preloading"* — is **REFUTED for boot latency**: boot does
not block. But the 14.5 MB still downloads in the background over **75 s on
Slow-4G**, a large silent data cost for mobile/metered players.

## 3. Decoded-audio memory — the real budget blower

`audio.loadTracks()` fetches **and decodes** all 7 mp3s at boot. Decoded audio is
float32 PCM held as `AudioBuffer`s in the browser's native audio memory — invisible
to `performance.memory` / the JS heap, so a heap probe under-reports it. Measured
directly:

| Track | Length | mp3 | Decoded PCM (resident) |
|---|---:|---:|---:|
| s1_jungle | 81.0 s | 854 KB | 27.24 MB |
| s2_cascade | 216.2 s | 3.12 MB | 72.74 MB |
| s3_snow | 180.6 s | 1.79 MB | 60.76 MB |
| s4_desert | 131.8 s | 1.32 MB | 44.34 MB |
| s5_foundry | 194.9 s | 2.55 MB | 65.59 MB |
| s6_caverns | 193.0 s | 2.58 MB | 64.94 MB |
| s7_fortress | 200.5 s | 2.30 MB | 67.46 MB |
| **TOTAL** | **1198 s** | **14.49 MB** | **403.07 MB** |

**403 MB of resident PCM (27.8× the mp3 size) held in a 480×270 browser tab from
stage 1 onward.** Mobile browsers routinely evict tabs above ~200–400 MB, so this
is a real crash/eviction risk on the target device, not just a data-cost concern.
Loading one track at a time would hold **~58 MB average** instead — inside budget.

## 4. Runtime frame pacing & heap (good news)

Sampled from live rAF deltas at the title (same rAF loop as gameplay):

| Profile | Median fps | p95 frame Δ | Dropped frames | JS heap growth (5 s) |
|---|---:|---:|---:|---:|
| desktop | 59.9 fps | 18.2 ms | 1 / 399 (0.3%) | −0.14 MB (GC) |
| mobile (4× CPU) | 59.9 fps | 18.5 ms | 7 / 4787 (0.1%) | +0.04 MB |

Frame pacing is at the reference-corpus 60 fps bar with negligible drops even
under 4× CPU throttle, and the JS heap is flat (no leak). **The engine is
healthy; the fix belongs in the loading strategy, not the render loop.**

> Scope note: this cycle samples steady-state pacing at the title/stage-1. Driven
> frame pacing through all 7 stage transitions + boss fights is the next perf
> increment (a driving harness on top of the e2e state driver) — tracked in
> OPEN-ISSUES.md. The cold-load/memory verdict above does not depend on it.

---

## Required fixes (for the builder seats — I only report)

**PERF-1 (blocker) — lazy-load music per stage.** Owner: **root.C (game code)**.
Change `main.js` so `audio.loadTracks` no longer eager-loads all 7 tracks. Instead
fetch+decode only the current stage's track on `world.onStageChange` (optionally
prefetch stage N+1), and release the previous track's `AudioBuffer`. Expected
effect, measured against today's live build:
- cold payload **14.72 MB → ~1.0 MB** (−93%)
- Slow-4G full download **75 s → ~5 s**
- resident decoded audio **403 MB → ~58 MB** (−86%)

**PERF-2 (should) — trim track weight.** Owner: **root.B (asset regen)**. Even
lazily, a single 72 MB decoded / 3.12 MB mp3 track (s2, 216 s) is heavy for a
biome loop. Shorter seamless loops (≤90 s), mono, or lower bitrate would cut
per-track decode and download further. s1 (81 s / 854 KB / 27 MB) is a good target
size to match.

**PERF-3 (optional) — images need no action.** All biome art is ~85 KB total;
eager image preload is fine and keeps boot instant. Do **not** spend lazy-load
complexity on images.

Machine-readable evidence: `playtest/perf/results/*.json`. Budget thresholds and
rationale: `playtest/perf/BUDGET.md`. Open/failing items: `playtest/perf/OPEN-ISSUES.md`.
