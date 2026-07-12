# Perf budget — thresholds & rationale

The machine-checked thresholds live in `harness.mjs` (`BUDGET`). This file
explains each so a builder can argue with a number, not a vibe. A 480×270
run-and-gun that ships to mobile browsers is the target device class.

| Key | Value | Rationale |
|---|---|---|
| `coldPayloadBytes` | 3.5 MB hard | A lean 2D run-and-gun boots well under this. The reference corpus (arcade Contra ports, modern indie run-and-guns) ships single-digit-MB total; the *cold first-paint* slice should be a fraction of that. |
| `coldPayloadWarnBytes` | 2.0 MB warn | Comfortable headroom below the ceiling. |
| `ttffMobileMs` | 6000 hard | A cold mobile visitor should reach a playable frame within ~6 s on Slow-4G, else they bounce. |
| `ttffMobileWarnMs` | 3500 warn | Target for a snappy cold mobile boot. |
| `ttffDesktopMs` | 2500 hard | Desktop cold boot should feel instant. |
| `minMedianFps` | 58 | The reference-corpus bar is 60 fps; 58 allows measurement jitter without masking a real regression. |
| `maxDroppedFrac` | 0.05 | ≤5% of frames may exceed 1.5× the 16.67 ms budget. Above this, pacing reads as visibly janky. |
| `maxHeapGrowthMB` | 8 | JS-heap growth over a sustained sample; a leak guard, not a size cap. |
| `deferrableFracRequiresLazy` | 0.45 | If ≥45% of the cold payload is art/audio for stages the player hasn't reached, per-stage lazy-loading is **required**, not cosmetic. |
| `maxDecodedAudioMB` | 128 hard | Resident decoded PCM held in the tab. Mobile browsers evict tabs around 200–400 MB; 128 MB leaves room for canvas, textures, JS heap and the OS. |
| `warnDecodedAudioMB` | 80 warn | A comfortable one-to-two-track ceiling — the lazy-load target. |

## Why decoded-audio RAM is a first-class budget

`decodeAudioData` expands a compressed mp3 to float32 PCM: `length ×
channels × 4` bytes. At 44.1 kHz stereo that is ~352 KB **per second** of audio,
independent of the mp3 bitrate — so a 3 MB / 216 s track becomes ~73 MB resident.
This memory lives in the browser's native audio subsystem, **not** the JS heap, so
`performance.memory` and a normal heap snapshot miss it entirely. It must be
measured by decoding and summing `AudioBuffer` sizes directly, which
`music-memory.mjs` does. Eager-decoding all 7 campaign tracks is the single
largest memory consumer in this build by nearly two orders of magnitude over all
the sprite/tileset art combined.

## What "10× content" actually costs here

The goal scales seeded content ~10× (7 distinct biomes + bosses + 7 tracks). The
measured cost of that scale-up on the live build:

- **Art (all 7 biomes):** ~85 KB total. Negligible. Scales fine eagerly.
- **Audio (all 7 tracks):** 14.5 MB download / **403 MB decoded**. Does **not**
  scale eagerly. This is where lazy-per-stage loading becomes mandatory.

The budget therefore singles out audio: the fix is to load one stage's track at a
time, not to touch the (already cheap) image pipeline.
