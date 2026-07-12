# Deploy — GO LIVE at a public URL

The campaign is a **static ES-module site** (no build step). Its entire runtime
lives under `game/` with all-relative paths (`./src/main.js`, `assets/...`) and
procedural WebAudio (no external audio fetch), so it serves cleanly as-is — we
just publish the `game/` directory to **GitHub Pages**.

## Public URL

```
https://shivaconverge.github.io/contra-run-and-gun/
```

(Recorded machine-readably in [`PUBLIC-URL.txt`](./PUBLIC-URL.txt). The live
proof from the last verify run is in [`last-verify.txt`](./last-verify.txt).)

## How it works

| Piece | Role |
|-------|------|
| `.github/workflows/deploy-pages.yml` | Auto-deploy on every push to `master`/`main` that touches `game/**`. Uploads **only `game/`** as the Pages artifact and publishes it. Keeps the public URL current with the default branch. |
| `deploy/go-live.sh` | One-shot bootstrap: creates the PUBLIC repo, wires `origin`, pushes `HEAD`, enables Pages (build type = GitHub Actions), and dispatches the workflow. Idempotent. |
| `deploy/live-selftest.sh` | **Functional gate** — drives the DEPLOYED URL with `?selftest=1` in headless Chrome and asserts the served build passes its own regression suite (118 tests) incl. the campaign-structure invariants (7 distinct stages, densest finale). Writes `last-selftest.json`. Skips gracefully with no browser. |
| `deploy/verify.sh` | **Evidence step** — FETCHES the live URL and asserts the game boots: root HTML is the `#game` entrypoint, `src/main.js` returns real JS (not a 404 HTML page), and a sprite asset is reachable. Writes `last-verify.txt`. |

Because it's a **project site**, the URL has a `/contra-run-and-gun/` subpath.
The game only uses relative paths, so every module and asset resolves correctly
under that subpath — verified by `verify.sh`.

## First-time go-live

```bash
./deploy/go-live.sh      # create repo, push, enable Pages, trigger deploy
gh run watch --repo shivaconverge/contra-run-and-gun   # ~1-2 min
./deploy/verify.sh       # fetch live URL, confirm the game boots
```

## Keeping it current

Nothing to do — the workflow re-deploys automatically whenever `game/**` changes
on the default branch. To force a manual refresh:

```bash
gh workflow run deploy-pages.yml --repo shivaconverge/contra-run-and-gun
```

## Notes / decisions

- **Why a Pages Actions workflow (not `docs/` or `gh-pages`):** the game lives in
  `game/`, not the repo root, and we must NOT move/duplicate game source (owned by
  other loops). The workflow uploads `game/` verbatim as the artifact — zero
  source changes, and only the served build reaches the public site (design docs,
  QA notes, audio `.wav` sources, and pipeline tooling stay private to the repo).
- **`.nojekyll`** is created in the CI runner (not committed) so Pages skips its
  Jekyll pass and never drops files.
- **Account:** `shivaconverge` (gh authenticated; scopes include `repo`,
  `workflow`).
