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
| `deploy/gate.sh` | **Release gate** — the single ship-authorization command. Runs four checks against the deployed bundle and emits one combined verdict (`LIVE ✅` / `BLOCKED ❌`): **1/4** `verify.sh` (reachability + Content-Length byte-currency), **2/4** `playtest/acceptance/deploy-parity.mjs` (full-surface **sha256** byte-parity of EVERY served file — strictly stronger than Content-Length: catches same-size/different-content drift; exits 0=byte-current, 1=DRIFT→hard block, 2=harness/network→non-blocking SKIP), **3/4** `live-selftest.sh` (functional self-test), **4/4** `feedback/audit/gate-step.sh` (creator two-weapon defect audit — 7/7 stages clean, grounding the "two-weapon defect fixed for good" deliverable). Exit 0 only if reachability+currency PASS and none of parity / functional / two-weapon FAIL (a no-browser or network SKIP of the non-reachability checks is tolerated; the static two-weapon FACT still governs). Writes `GATE-STATUS.txt` (latest) and appends an audit row to `DEPLOY-LOG.md` (durable ship history: timestamp + commit + reach/parity/functional/two-weapon/verdict). |
| `deploy/verify.sh` | **Reachability + byte-currency** — FETCHES the live URL and asserts: root HTML is the `#game` entrypoint, `src/main.js` returns real JS (not a 404 page), and **every** referenced asset (read from `game/data/assets.js`) + **every** audio track (from the live manifest) serves HTTP 200 AND matches the local build **byte-for-byte** (proves the public URL is current with master, not a stale CDN copy). Retries transient network blips. Writes `last-verify.txt`. |
| `deploy/live-selftest.sh` | **Functional gate** — drives the DEPLOYED URL with `?selftest=1` in headless Chrome and asserts the served build passes its own in-browser regression suite incl. the campaign-structure invariants (7 distinct stages, densest finale, structure holds). Writes `last-selftest.json`. Skips gracefully with no browser. |

Because it's a **project site**, the URL has a `/contra-run-and-gun/` subpath.
The game only uses relative paths, so every module and asset resolves correctly
under that subpath — verified by `verify.sh`.

## First-time go-live

```bash
./deploy/go-live.sh      # create repo, push, enable Pages, trigger deploy
gh run watch --repo shivaconverge/contra-run-and-gun   # ~1-2 min
./deploy/gate.sh         # release gate: reachability+currency + sha256 parity + functional + two-weapon audit
```

## Keeping it current

Nothing to do — the workflow re-deploys automatically whenever `game/**` changes
on the default branch. After master advances, refresh + re-authorize with:

```bash
./deploy/go-live.sh      # push HEAD → remote master (fires auto-deploy)
./deploy/gate.sh         # confirm LIVE ✅ against the deployed bundle

# or force a manual workflow run without a push:
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
