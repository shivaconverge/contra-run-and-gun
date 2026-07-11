# feedback/ — creator-approval requirement (root.E)

The in-game **creator-approval panel** + the **release gate** that turns a creator
verdict into a wider-release ship decision. Owner: root.E (spec/verification only —
the panel lives in `game/src/feedback.js`, implemented by root.B to this contract).

## ⛔ RELEASE VERDICT: HELD — creator REJECT (2026-07-10, authoritative)

A **real human creator** rejected the build (3/5) via the panel — recorded in
`feedback/approvals/dev.json`, detailed in repo-root `CREATOR_FEEDBACK.md`.
Canonical release check (**`--artifact` is MANDATORY** — see below):
`node feedback/ship-decision.mjs feedback/approvals/dev.json --build dev --artifact game`
→ **HOLD**. Wider release is DENIED until 4 defects are fixed and the creator
re-APPROVEs (FINDINGS **OI-6**): environment/theme (bridge+water, multi-height),
hero firing origin, tank turret origin, boss movement. This human verdict
**overrides** the AI-vision self-score. NOTE: the creator-approval *machinery* below
is green and working — it is what captured this reject; "panel works" ≠ "build approved."

**➡️ UPDATE (2026-07-10): creator RE-REVIEWED → RE-REJECTED (round 2).** The firing-origin fixes (#2/#3) were cosmetic — hero+turret each show TWO weapons (baked sprite gun + procedural aiming gun); required: ONE weapon per entity drawn where it fires (art+engine, root.B). Also OI-7: Stage 2 shipped without context.stage (tripwire fired). Gate STILL HELD; see `RE-APPROVAL-STATUS.md` + `CREATOR_FEEDBACK.md`.

**Re-approval MUST be artifact-bound (fail-safe).** The panel exports a raw,
UNBOUND record (buildId `dev`, no `artifactHash`). An unbound approve would ship
*any* `dev` build without `--artifact` — proven and guarded by
`ship-decision-test.mjs` (`qaPass+UNBOUNDapprove+artifact=HOLD`). So the reopening
procedure is: creator APPROVEs the fixed build in the panel → export → bind to the
fixed bytes → gate:
```sh
node feedback/release-gate.mjs --stamp <exported.json> --artifact game --build dev > feedback/approvals/dev.json
node feedback/ship-decision.mjs feedback/approvals/dev.json --build dev --artifact game   # SHIP only if bytes match
```

## Status (verified live 2026-07-10)

- Panel **shipped & verified** in the build (`game/src/feedback.js`, wired in
  `main.js`): hotkey-`F` DOM overlay, verdict (approve/reject) + optional stars +
  notes, auto-captured build context, `localStorage`-persisted, `releaseApproved`
  boolean, one-click `⤓ EXPORT JSON`, "press F to rate this build" hint on
  game-over.
- **`node feedback/verify-all.mjs` → PASS** (green 4/4). The one CRITICAL ship-gate
  red (`creatorApproval.panelExists`) is CLEARED; QA `qa-summary.json` criticalFailed 0.
- One in-scope item **open**: **OI-5** — panel unreachable on touch (desktop-only;
  known-red acceptance gate). One org-level item open: no publish step calls the
  ship decision (see NEEDS).

## Run it

| Command | What it proves | Expected |
|---|---|---|
| `node feedback/verify-all.mjs` | whole deliverable health in one shot | **PASS**, OI-5 red |
| `node feedback/drive.mjs` | live start→play→die→restart, panel at each state | frames + `drive.json` |
| `node feedback/release-gate.mjs --verify` | consumer verdict == shipped `releaseApproved` | 8/8 |
| `node feedback/conformance.mjs` | AC-1..14 (+AC-2b) against the live panel | 17/17 |
| `node feedback/artifact-gate-test.mjs` | artifact-bound gate fails closed | 4/4 |
| `node feedback/ship-decision-test.mjs` | SHIP iff QA-green **and** creator-approved (+staleness fail-safe) | 5/5 |
| `node feedback/defect-behavior-test.mjs` | creator fixes #2/#4 still behave (boss moves, fires from hands) | 2/2 |
| `node feedback/re-approval-status.mjs` | which of the 4 rejected defects are in-build | 3/4, NOT READY |
| `node feedback/touch-reach-test.mjs` | OI-5 gate (panel openable on touch) | **red until fixed** |

Gate a real publish: `node feedback/ship-decision.mjs feedback/approvals/<b>.json --artifact game && <publish>`

## Files

- **SPEC.md** — the contract: acceptance criteria (AC-1..14), integration wiring
  (§3.2), entry schema (§3.4), release-gate semantics (§4), consumption + composed
  ship decision (§5b/5c), touch scope (§3.3).
- **FINDINGS.md** — dated log of driving the real build + all OPEN ISSUES (OI-1..5).
- **UX-ASSESSMENT.md** — panel UX vs shipped-game feedback/rating patterns.
- **release-gate.mjs** — the ship-gate CONSUMER (reads an approval record, exits
  0=publish / 1=deny; `--verify` proves parity; `--stamp`/`--artifact` bind to bytes).
- **ship-decision.mjs** — composes QA verdict ∧ creator gate → one go/no-go.
- **lib/artifact-hash.mjs** — deterministic fingerprint of the shipped `game/` tree.
- **conformance.mjs / drive.mjs / artifact-gate-test.mjs / ship-decision-test.mjs /
  touch-reach-test.mjs / verify-all.mjs** — the verification harnesses.
- **approvals/** — durable exported approval records + how the creator produces one.
- **reference-impl/feedback.js** — HISTORICAL: proved the contract satisfiable
  before root.B built the real panel (now authoritative in `game/`).
- **frames/** — captured evidence (JSON + PNGs) from every harness.

## Open (needs parent/root.B)

- **OI-5** (root.B): add a touch button in `touch.js` calling `feedback.toggle()`
  so the panel is reachable on Android/web touch. `touch-reach-test.mjs` is the
  definition-of-done (flips green automatically).
- **Wider-release wiring** (org-level): nothing invokes `ship-decision.mjs`, so the
  proven approve→ship chain never fires. The gate + verifier are complete and green;
  a publish step must call it. A real ship also requires the **creator's** exported
  approval of the current artifact (a judgment root.E cannot fabricate).
