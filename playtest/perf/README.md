# playtest/perf — LIVE cold-load, payload & frame-pacing seat (root.I)

The end-user-device perspective. This harness drives the **actual public
deployment** (`deploy/PUBLIC-URL.txt`) in headless Chrome with a **cold browser
cache**, over the real network (optionally throttled to Slow-4G + 4× CPU), and
measures what a first-time player's device pays: the cold-load waterfall, total
first-paint payload broken down by asset kind and by the stage that first needs
it, time-to-first-playable-frame, live rAF-delta frame pacing / dropped frames,
JS-heap growth, and the true resident decoded-audio RAM.

This seat **reports** — it owns `playtest/perf/` only and does not edit game or
asset source. Fixes are applied by the builder seats (root.C game code, root.B
assets). Findings and required fixes are in `REPORT.md`; failing budget items in
`OPEN-ISSUES.md`; threshold rationale in `BUDGET.md`.

## Run it

```bash
node playtest/perf/run-all.mjs                    # full suite, roll-up
node playtest/perf/cold-load.mjs --profile desktop
node playtest/perf/cold-load.mjs --profile mobile # Slow-4G + 4x CPU
node playtest/perf/music-memory.mjs               # decoded-audio resident RAM
```

Each probe writes a machine-readable artifact to `results/` and exits non-zero on
a hard-budget failure (so it can gate a release / CI). Uses `puppeteer-core`
(installed here) + the system Chrome; no game source is imported.

## Files

- `harness.mjs` — live-URL locator, Chrome locator, stage→biome asset classifier, `BUDGET`, profiles.
- `cold-load.mjs` — cold waterfall + payload breakdown + ttff + pacing + heap; `--profile desktop|mobile`.
- `music-memory.mjs` — decodes all 7 tracks in a real AudioContext, sums resident PCM.
- `campaign-pacing.mjs` — drives the live loop through all 7 biomes + boss fights, grades rAF pacing per stage + campaign heap growth; `--profile desktop|mobile`.
- `run-all.mjs` — runs the suite, prints a PASS/FAIL roll-up.
- `results/*.json` — machine-readable evidence (regenerated each run).
- `REPORT.md` / `BUDGET.md` / `OPEN-ISSUES.md` — synthesis, thresholds, open defects.

## Facts, not vibes

Payload bytes are CDP `Network.loadingFinished.encodedDataLength` (real
over-the-wire size). Frame deltas come from a rAF recorder installed before any
game script, independent of the game's own fps meter. Decoded-audio RAM is summed
from real `decodeAudioData` `AudioBuffer`s — it is not visible to
`performance.memory`, which is exactly why the eager-decode cost was hidden until
measured here.
