# reference/tools — capture pipeline

## capture-frames.mjs

Captures real frames from a live HTML5 run-and-gun (or any rendered page) into the
corpus, using headless Chrome. Two modes, with **verified** behaviour (2026-07-09):

| mode | deps | what it proves | use for |
|------|------|----------------|---------|
| **`pptr`** (default) | `puppeteer-core` (one-time `npm install` here) | **PROVEN** real gameplay sequence: injected `ArrowRight` moved a canvas actor x=464 → x=1616 across 4 frames | actual gameplay: getting past menus, moving/shooting, distinct progressing frames |
| `cli` | none | **PROVEN** single settled still (`frames/_probe/capture-pipeline-ok.png`) | one still, or rendering a saved-footage page |

> **Honest limitation:** in `cli` mode, `--frames > 1` does **not** advance a
> `requestAnimationFrame` loop — Chrome's `--virtual-time-budget` pauses while the page
> is busy, so the frames come out near-identical. For real motion, use `pptr`.

### Setup (one-time, for the default pptr mode)

```bash
cd reference/tools && npm install     # installs puppeteer-core (node_modules is gitignored)
```

Uses the local Chrome / `chrome-headless-shell` binary — no browser download needed.

### Run (pptr, default — real gameplay)

```bash
node reference/tools/capture-frames.mjs \
  --url "https://example.com/game" \
  --out reference/frames/<slug> \
  --title "<Human Title>" \
  --settle 8000 \
  --frames 10 --interval 500 \
  --keys "ArrowRight,KeyX,Space,ArrowRight" \
  --click 480,300      # optional: dismiss a click-to-play overlay
```

### Run (cli — single still, zero deps)

```bash
node reference/tools/capture-frames.mjs --mode cli \
  --url "https://example.com/page" --out reference/frames/<slug> --settle 4000 --frames 1
```

Both modes write `frame-NN.png` + a `capture.json` provenance sidecar (params, per-frame
key/timing, source URL) so every frame is reproducible and traceable.

### Flags

| flag | default | meaning |
|------|---------|---------|
| `--mode` | `pptr` | `pptr` (gameplay) or `cli` (single still) |
| `--url` | (required) | page/embed to load |
| `--out` | (required) | output dir (e.g. `reference/frames/<slug>`) |
| `--title` | "" | human title recorded in `capture.json` |
| `--w` / `--h` | 960 / 600 | viewport |
| `--settle` | 4000 | ms to wait after load (boot past menus) |
| `--frames` | 6 | number of screenshots |
| `--interval` | 500 | ms between screenshots (pptr) |
| `--keys` | "" | comma list of [DOM key codes](https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_code_values) tapped one-per-frame, e.g. `ArrowRight,KeyX,Space` (pptr only) |
| `--click` | "" | `x,y` click(s) before capture to dismiss a play overlay (pptr only) |
| `--headed` | off | visible window for debugging (pptr only) |

### Capturing console / non-web titles

Blazing Chrome, Operation Galuga, Huntdown, etc. are **not browser-playable**, so live
capture does not apply. Frame-grab official gameplay footage and drop the PNGs into
`frames/<slug>/` with a hand-written `capture.json` recording the source URL, grab
timestamp, and what the frame depicts (firefight / jump / hit / boss).
