# feedback/approvals/ — durable creator-approval records (the ship-gate input)

The in-game panel (`game/src/feedback.js`) persists the creator's verdicts to
**browser localStorage** (`contra:feedback:v1`). That is per-origin, per-browser —
a publish/CI step running outside that browser **cannot read it**. This folder is
the hand-off: an exported copy of the panel's `entries()` array, committed here so
`feedback/release-gate.mjs` (and any publish pipeline) can gate wider release on it.

## Record format

A record is exactly the panel's persisted `Entry[]` (SPEC §3.4) — a JSON array,
or a `{ "entries": [...] }` wrapper. One file per build under gate, named for the
build id, e.g. `approvals/v1.json`. Examples: `example-approved.v1.json`,
`example-rejected.v1.json`.

## How the creator produces a record

Today (v1) the panel has no one-click export, so either:

1. **Manual copy** — after approving in the live build, open the console and run
   `copy(JSON.stringify(window.__approval.entries()))`, paste into
   `feedback/approvals/<buildId>.json`, commit.
2. **Driven capture** — a harness drives the build, the creator approves within
   that session, and the harness reads `window.__approval.entries()` to disk.

> OPEN (needs root.B): add a one-click **Export** affordance to the panel
> (download `entries()` as JSON) and inject a real `window.__buildId` so records
> are scoped to the actual shipped build, not the `'dev'` fallback. Tracked in
> `feedback/FINDINGS.md` OPEN ISSUES. Until then, records may carry any explicit
> `context.buildId` and the gate is invoked with `--build <id>`.

## Artifact binding (recommended — makes the gate sound despite buildId='dev')

Bind the approval to the exact bytes approved, so a later build change can't reuse
a stale approval (the OI-2 staleness hole). Stamp right after approving:

```sh
# entries.json = the exported Entry[]; emits a { buildId, artifactHash, entries } record
node feedback/release-gate.mjs --stamp entries.json --artifact game --build v1 > feedback/approvals/v1.json
```

Then the ship-time gate re-hashes `game/` and BLOCKS on any mismatch. See
`example-bound.v1.json` for a stamped record — note it is a **frozen illustrative
sample**: its `artifactHash` matches the `game/` tree only as of when it was
stamped, and goes stale the moment any `game/` file changes (that staleness IS the
feature — a stale bound record correctly BLOCKS). Real records are produced fresh
per build via `--stamp`; the regression test `feedback/artifact-gate-test.mjs`
stamps fresh at runtime so it never false-fails when `game/` legitimately changes.

## How the pipeline consumes it

```sh
# exits 0 (APPROVED → publish may proceed) or 1 (BLOCKED → wider release denied)
node feedback/release-gate.mjs feedback/approvals/v1.json --build v1 --artifact game && npm run publish
```

Guarantees:
- Gate logic is a verified byte-for-byte replica of the shipped panel's
  `releaseApproved` — `--verify` proves parity against the live build across 8
  cases (`feedback/frames/release-gate.json`).
- With `--artifact`, the gate is fail-closed: build changed or record unbound →
  BLOCK. Proven by `feedback/artifact-gate-test.mjs`
  (`feedback/frames/release-gate-artifact.json`, 4/4 PASS).
