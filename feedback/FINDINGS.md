# FINDINGS — driving the live build for the creator-approval SPEC

Date: 2026-07-10 · Branch: loop-root-E · Perspective: creator approval (root.E)

## What I actually did

Wrote `feedback/drive.mjs` and ran it: it serves the **real committed `game/`
tree** (via the playtest harness's `serveGame`) and drives it in **headless
Chrome** through the full player arc — **title → start → play (move + fire) →
die → restart** — capturing a PNG and a `window.__game` state snapshot at each
stage. This is not a read of the code; it is the shipped ES-module app booting
and responding to real `page.keyboard` events on the live rAF loop.

Run it: `node feedback/drive.mjs` → evidence in `feedback/frames/` (`1-title.png`
… `5-restart-playing.png`, `drive.json`).

## Observed states (from `drive.json`, verbatim)

| Stage | status | mode | lives | score | localStorage | `window.__feedback` |
|------|--------|------|-------|-------|--------------|---------------------|
| 1 title | `title` | arcade | 3 | 0 | present | undefined |
| 2 start→play | `playing` | arcade | 3 | 0 | present | undefined |
| 3 firefight (3s) | `playing` | arcade | 3 | **200** | present | undefined |
| 4 game-over | `gameover` | arcade | -1 | 200 | present | undefined |
| 5 restart (R) | `playing` | arcade | 3 | 0 | present | undefined |

Interpretation for the spec:

- The four `world.status` values in `world.js` (`title/playing/cleared/gameover`)
  are all real and reachable; `R` cleanly returns `gameover → playing` and resets
  score/lives. The panel's context capture (§3.4) reads exactly these fields, and
  they are all live and correct at each stage.
- `localStorage` is available in the served origin and **currently unused by the
  game** — the `contra:feedback:v1` namespace in the SPEC is clean.
- `window.__feedback` is `undefined` at every stage — confirming the capture
  channel does not exist yet (this is the gap the SPEC closes), and that the
  global name is free for the contract.
- Firing while running right scored 200 within 3s (enemies die), i.e. the play
  loop is genuinely responsive to input — the drive is exercising real gameplay,
  not a frozen frame.

## Visual grounding (frames read directly)

- `1-title.png`: RUN & GUN title, ARCADE/CASUAL select, "PRESS Z / SPACE TO
  START". A hotkey-toggled overlay must be reachable **from here** (creator may
  want to log "title art looks great" before playing) — AC-1 requires it.
- `4-gameover.png`: canvas-drawn "GAME OVER / press R to restart" centered over
  the frozen scene. This is the natural moment a creator forms a verdict, so the
  panel must be openable over this overlay (it is DOM, so it layers cleanly on
  top without touching `render.js`).

Both overlays are **canvas-drawn**, which is *why* the SPEC puts the feedback
panel in the **DOM** (like `#boot-help`/`#rotate-hint`) instead of the canvas:
zero coupling to `render.js`, it can host a real `<textarea>`, and it survives
independent of the render loop.

## Key-code availability (verified against `input.js` + `main.js`)

In use: arrows, WASD, `Z/K/Space` (jump), `X/J` (fire), `C/L` (swap), `M` (mute),
`R` (restart), `1/2` (mode), `Enter` (start). **Free:** `KeyF`, `Backquote`,
`Escape`, `Tab`. SPEC claims `F` (mnemonic) to toggle + `Escape` to close — no
collision.

## OPEN ISSUES

### OI-1 (observation, low severity) — arcade "one-hit death" did not trigger within ~10s of walking right unarmed

During the DIE stage the driver held `ArrowRight` with fire released for ~10s and
the player did **not** reach `gameover` (`diedViaRealPlay: false` in `drive.json`).
To capture the game-over overlay state I therefore **forced** it
(`world.lives = -1; world.status = 'gameover'` — recorded as `forcedDeath: true`).

- This is **not** claimed as an engine bug — the run may simply have out-paced or
  out-positioned the early spawns, and arcade death is clearly implemented
  (`world.js:294`). But it is a real, honest limitation of this drive: I did not
  witness a *natural* death, only the death *state*.
- **Severity: low, and it does not affect the SPEC** — in fact it *strengthens*
  it. Because death is not guaranteed quickly, the feedback panel must be
  reachable from **any** state via the global hotkey (SPEC AC-1), not bolted only
  to a game-over screen. A verdict channel that required dying first would often
  be unreachable.
- **Repro:** `node feedback/drive.mjs`; observe stage-4 `forcedDeath:true`.
- **Follow-up owner:** engine/QA (root.B) — if a *natural* arcade death within a
  bounded window is a design expectation, add a scripted-hazard death path to a
  QA harness. Out of root.E's scope (approval), left as a recorded issue rather
  than worked around.

## Update 2026-07-10 (cycle 2) — reconciled the SPEC to the ACTUAL ship gate

Fresh grounding against the committed QA gate (root.D's `run-all.mjs` +
`playthrough.mjs`) surfaced a real, ship-blocking contract detail my v1 spec got
wrong. Recorded here and fixed in `SPEC.md §3.5 + AC-11`.

**FACT (from the shipped gate, not a guess):** `playtest/frames/live/qa-summary.json`
= `VERDICT FAIL (1 critical)`, `criticalFailed: 1`. The single critical red is
`creatorApproval.panelExists` — *"KNOWN GAP (TOP): no in-game creator-approval
feedback panel — DOM=false api=false"*. This is the ONLY thing failing the whole
build verdict (the other 2 reds — BOSS-3 glow, fps-telemetry — are non-critical).
Confirmed by `git`: `game/src/feedback.js` does **not** exist yet (root.B has not
implemented it).

**The mismatch I found (read verbatim from `playthrough.mjs:795-802`):** the gate
passes iff `domHit || apiHit`, where
`apiHit = !!(window.__approval || window.__game.approval)`. My v1 SPEC exposed the
controller only as `window.__feedback` — a name the gate never reads. So a
build-to-v1-spec could leave `apiHit=false` and rely on incidental DOM-regex
matching (`/approve|creator (…|approval|…)/`), which only holds once the (hidden)
panel is mounted and is timing-fragile.

**Fix applied (SPEC only — I own no game/ files):**
- §3.2 wiring now REQUIRES `window.__approval = feedback` and `world.approval =
  feedback` (so `window.__game.approval` is truthy), with `window.__feedback` kept
  as a readable alias.
- New §3.5 "QA-gate alignment" quotes the exact gate predicate and requires BOTH
  the API handle and a DOM-text handle (the existing button/title labels already
  satisfy the regex).
- New **AC-11**: acceptance = `run-all.mjs` no longer reports
  `creatorApproval.panelExists` critical and its verdict flips `FAIL → PASS`.

Net: implementing `game/src/feedback.js` to this reconciled contract flips the
one CRITICAL red and is the concrete action that unblocks "wider release"
(strategy `obs_critical_red_is_creator_approval`, `obs_no_ship_action_in_loop`).

## Update 2026-07-10 (cycle 3) — proved the contract implementable AND gate-clearing

root.B has still not landed `game/src/feedback.js` (confirmed: file absent; latest
root.B PR#94 was the explosion-punch FX). The gate verdict is unchanged —
`qa-summary.json` = `FAIL (1 critical)`, the lone critical still
`creatorApproval.panelExists (DOM=false api=false)`. To de-risk the handoff and
prove the SPEC is real (not aspirational), I built and RAN the acceptance test:

- **`feedback/reference-impl/feedback.js`** — a complete 144-line implementation of
  the SPEC (vanilla DOM overlay + localStorage, zero deps). root.B may drop it into
  `game/src/` verbatim and add the ~5 `main.js` wiring lines (SPEC §3.2).
- **`feedback/conformance.mjs`** — copies the REAL committed `game/` tree to a temp
  dir, drops in the reference `feedback.js`, patches `main.js` with the exact §3.2
  wiring, serves it, and drives it in headless Chrome through **AC-1…AC-11**.
  Touches NOTHING under `game/` (all patching is in a throwaway copy).

**Result (feedback/frames/conformance.json): 13 passed, 0 failed — VERDICT PASS.**
Every acceptance criterion verified against the actual browser build:
AC-1 hotkey toggle (title + play), AC-2 pause-on-open (player.x frozen
173.85→173.85 over 1.1s), AC-3 no key-leak (R/1/2/M swallowed), AC-4 approve gates
+ persists across reload, AC-5 reject revokes, AC-6 low-star approve does NOT gate,
AC-7 context auto-captured, AC-8 default-closed gate-closed, AC-9 no regression when
closed (R restarts), AC-10 corrupt storage tolerated, **AC-11 ship-gate predicate
`apiHit && domHit` both true** (the exact `playthrough.mjs` check that is currently
red). Visual: `feedback/frames/conformance-open.png` — the panel reads cleanly,
layered over the frozen (paused) game.

**Meaning:** the SPEC is satisfiable and, when implemented, flips the single
CRITICAL red `FAIL → PASS`. The remaining blocker is purely that root.B must land
the module — the design risk is retired.

## Update 2026-07-10 (cycle 4) — SHIPPED panel landed; verified live end-to-end

root.B independently implemented `game/src/feedback.js` (188 lines, PR#99) and
wired it into `main.js` runLive exactly per SPEC §3.2 — `window.__approval`,
`world.approval`, `window.__feedback`, KeyF toggle, Escape-close, and the
title-style pause (`world.status === 'title' || feedback.isOpen()`). The
ship-blocking critical red is CLEARED: `playtest/frames/live/qa-summary.json` now
`criticalFailed: 0` and `creatorApproval.panelExists` passes.

I repointed `feedback/conformance.mjs` at the **REAL shipped build** — it now
serves the committed `game/` tree UNMODIFIED (no temp copy, no patch) and drives
`game/src/feedback.js` in headless Chrome. **Result
(`feedback/frames/conformance.json`): 13 passed, 0 failed — VERDICT PASS**, every
AC verified against root.B's actual code:

- AC-1 toggle (title + play), AC-2 pause-on-open (`player.x` frozen 175.95→175.95
  over 1.1s), AC-3 key-swallow (R/1/2/M inert while open), AC-4 approve gates +
  persists across reload, AC-5 reject revokes, AC-6 low-star approve does NOT gate,
  AC-7 context auto-captured (`{buildId,status,mode,score,lives}`), AC-8
  default-closed, AC-9 no regression closed (R restarts to score 0), AC-10 corrupt
  storage tolerated, AC-11 ship-gate predicate `apiHit && domHit` both true.

**Visual grounding** (`feedback/frames/conformance-open.png`, Read directly): the
shipped panel is on-brand and clean — rounded card, outlined verdict buttons
(approve = green outline, reject = red outline), gold title, context line
`build dev · arcade · playing · score 100`, optional stars + notes, `esc to close`
— layered over the correctly-frozen (paused) game. Reads as a finished feature.

**Status of my artifacts:** `feedback/reference-impl/feedback.js` is now HISTORICAL
(it proved the contract satisfiable before root.B built; the shipped
`game/src/feedback.js` is authoritative). `feedback/conformance.mjs` is now a live
regression guard for the shipped panel — re-run it after any `game/` change that
could touch input routing, the pause path, or the gate.

No OPEN ISSUES this cycle — the shipped panel matches the intended behavior on
every asserted criterion.

## Update 2026-07-10 (cycle 5) — built the RELEASE-GATE CONSUMER (gate now fires ship)

The panel CAPTURES approval, but I confirmed by grep that `releaseApproved` has
**zero consumers** — nothing reads it to actually gate wider release, and the value
lives only in browser localStorage (invisible to a publish/CI step). That is
strategy `obs_gate_passes_but_ship_never_fires` verbatim. Closed the loop with a
consumer, entirely in `feedback/` (I own no `game/`):

- **`feedback/release-gate.mjs`** — reads an exported approval record
  (`feedback/approvals/<buildId>.json` = the panel's persisted `Entry[]`) and
  **exits 0 (APPROVED → publish may proceed) / 1 (BLOCKED)**. Pipeline usage:
  `node feedback/release-gate.mjs feedback/approvals/v1.json --build v1 && <publish>`.
  Verified live: approved record → exit 0, reject-latest record → exit 1, unknown
  build → exit 1 (default CLOSED), buildId auto-inferred from newest entry.
- **`feedback/approvals/`** — durable record store + README documenting the
  browser→file export contract, with `example-approved.v1.json` /
  `example-rejected.v1.json`.
- **Anti-drift proof:** `node feedback/release-gate.mjs --verify` drives the REAL
  shipped build, seeds localStorage per case, reads `window.__approval.
  releaseApproved`, and asserts my consumer matches it. **8/8 PASS**
  (`feedback/frames/release-gate.json`) across empty / approve-unrated / 5★ /
  contradictory-2★ / reject / approve→reject / reject→approve / other-build-only.
  The consumer's verdict is byte-identical to the panel's own gate.

Net: the approval→release chain is now end-to-end runnable — a real publish step
can hard-gate on the creator's verdict instead of the boolean sitting unused.

## OPEN ISSUES

### OI-2 (gap, MEDIUM) — `releaseApproved` scopes to `'dev'`; no real `window.__buildId`
`game/src/feedback.js:20` falls back to `buildId='dev'` and nothing injects
`window.__buildId` (grep: only referenced at `feedback.js:20` + `main.js:155`, both
consumers not producers). So every approval is bucketed as `'dev'` and a stale
approval of an old build could green-light a new one — the exact failure the
buildId-scoping was meant to prevent. **Repro:** approve in the live build →
`window.__approval.entries()[0].context.buildId === 'dev'`. **Owner:** root.B —
inject a real build id (git short-sha or `package.json` version) as
`window.__buildId` before `mountFeedback`. My `release-gate.mjs` already supports
explicit `--build <id>` so records can be scoped today via the exported file.
**MITIGATED on the consumer side (cycle 6):** `release-gate.mjs --artifact game`
now binds an approval to a sha256 fingerprint of the actual shipped tree and
fails closed if the build changed — so the gate is SOUND even while every approval
self-reports `buildId='dev'`. The in-browser `window.__buildId` fix is still
worth doing (so records self-scope without a stamp step), but it no longer gates
a sound ship decision.

### OI-3 (gap, LOW) — panel has no one-click Export; verdict handoff is manual — ✅ RESOLVED 2026-07-10
The creator must run `copy(JSON.stringify(window.__approval.entries()))` in the
console to produce a record. **Owner:** root.B — add an Export button (download
`entries()` as JSON). Non-blocking; the manual/driven paths work today
(documented in `feedback/approvals/README.md`). Not a defect in shipped behavior,
a missing convenience on the consumption path.
**RESOLVED (cycle 8):** root.B shipped the `⤓ EXPORT JSON` button +
`controller.exportJson()` (downloads `<buildId>.json`, also returns the JSON
string). Verified live end-to-end by conformance AC-12 — see cycle-8 update below.

## Update 2026-07-10 (cycle 6) — hardened the gate: artifact binding (fail-closed)

Parent confirmed no publish/CI pipeline exists yet, so the consumer stands ready
but uncalled. Rather than build a pipeline I don't own, I closed the sharper risk:
the OI-2 staleness hole. With `buildId='dev'` on every approval, verdict-scoping
alone would let an approval of build A green-light a changed build B — precisely
the "gate passes on stale signal" failure the strategy flags as *worse than no
gate*.

Added **`feedback/lib/artifact-hash.mjs`** (deterministic sha256 over the sorted
served `game/` tree — 38 files) and extended `release-gate.mjs`:
- `--stamp <entries.json> --artifact game` → emits a record bound to the exact
  bytes approved (`feedback/approvals/example-bound.v1.json` is a committed one).
- `<record> --artifact game` → re-hashes at ship time and **fails closed** on
  mismatch or an unbound record.

Proven end-to-end (`feedback/artifact-gate-test.mjs` → `release-gate-artifact.json`,
**4/4 PASS**): bound+unchanged → APPROVED (exit 0); one byte appended to
`src/main.js` in a temp copy → BLOCKED (exit 1, "artifact MISMATCH… build changed
since approval"); unbound record under `--artifact` → BLOCKED (exit 1); legacy
no-`--artifact` path → still APPROVED (exit 0, backward compatible). Parity with
the shipped panel is untouched — `--verify` still 8/8. The gate is now SOUND
against stale approvals without needing the upstream `window.__buildId` fix.

## Update 2026-07-10 (cycle 7) — made the artifact-gate test drift-proof

Grounding re-run this cycle surfaced a latent false-failure in my OWN regression
test. `artifact-gate-test.mjs` originally asserted the COMMITTED
`example-bound.v1.json` hash equals the current `game/` tree. `game/` is unchanged
right now (verified: `git diff --stat 5cd9745 HEAD -- game/` empty, hashes match),
so it passed — but the day root.B edits any `game/` file, the frozen fixture hash
would mismatch and the `bound-match-approves` case would FAIL (exit 1), a false
negative firing inside another loop's PR. Demonstrated the mismatch explicitly
(committed-bound vs a 1-byte-changed tree → exit 1).

Fix (REPORT-don't-work-around applied to my own tooling): the test now **stamps a
fresh bound record at runtime** against whatever `game/` currently is, then asserts
match→0 / tampered→1 / unbound→1 / legacy→0. It validates the binding MECHANISM,
not a frozen hash. Proven robust: re-ran against a simulated future `game/` edit
(`/tmp/game-future` with an extra line in `render.js`) — still `bound-match PASS(0)`
and `changed-blocks PASS(1)`. `example-bound.v1.json` remains as an illustrative
sample, now documented as intentionally-goes-stale in `approvals/README.md`.
Suite status: artifact-gate **4/4 PASS**, panel parity `--verify` **8/8**,
conformance **13/13** — all green against the current shipped build.

## Update 2026-07-10 (cycle 8) — root.B closed OI-3; whole approve→export→ship chain grounded

`game/` changed materially since cycle 7 (`feedback.js` 188→211 lines; also config,
enemy, render, selftest edits). Re-grounded the ENTIRE suite against the current
shipped build — all green, no regression: parity `--verify` **8/8**, conformance
**now 15/15** (added AC-12), artifact-gate **4/4** (drift-proof design paid off —
it stamped fresh and passed despite `game/` moving; the committed
`example-bound.v1.json` is stale as designed).

**root.B implemented OI-3** (the Export affordance I filed cycle 6): a `⤓ EXPORT
JSON` footer button + `controller.exportJson()` that downloads `<buildId>.json` and
returns the JSON string. I extended `feedback/conformance.mjs` with **AC-12** to
ground it against the real build:
- `AC-12.exportReturnsEntries` — the button exists and `exportJson()` returns a
  JSON string byte-equal to `entries()`.
- `AC-12.exportedRecordGatesShip` — the EXPORTED string, written to disk and fed to
  `feedback/release-gate.mjs`, returns **exit 0 (APPROVED)**.

That second check closes the loop I have been building across cycles: the COMPLETE
creator-approval chain now runs end-to-end against the live build —
**in-panel approve → one-click export → durable record → release-gate → ship
decision** — no console step, no hand-authored record. Visual: the re-captured
`feedback/frames/conformance-open.png` shows the Export button rendering cleanly in
the footer (cyan outline) without crowding the layout.

Only remaining open item is org-level, not my slice: no publish/CI step yet calls
`release-gate.mjs` (OI-2 stays consumer-mitigated via `--artifact`;
`obs_no_ship_action_in_loop`).

## Update 2026-07-10 (cycle 9) — composed the wider-release SHIP decision (QA ∧ creator)

Re-grounded against the still-evolving build (world.js 313→338, +music.js, config,
level1, selftest all grew): suite still green — parity 8/8, conformance 15/15,
artifact-gate 4/4. Current `qa-summary.json` = PASS (91/0, criticalFailed 0).

Gap addressed: my SPEC defined the creator gate and the QA gate separately but
never their COMPOSITION. "Gates wider release" must mean **both** green — a build
that passes QA but the creator rejected must NOT ship, and vice-versa. Nothing
emitted that single go/no-go. Built **`feedback/ship-decision.mjs`**: it ANDs
root.D's real QA verdict (`qa-summary.json` criticalFailed===0) with the
artifact-bound creator gate, printing one verdict and exiting **0 = SHIP / 1 =
HOLD**. It also surfaces a freshness caveat — the QA summary is not artifact-bound,
so it prints the summary's age and warns when stale (the creator half already is
bound).

Proven with a drift-proof regression guard **`feedback/ship-decision-test.mjs`**
(stamps fresh approve/reject records against the current `game/`, synthesizes QA
summaries) — **4/4 PASS** (`feedback/frames/ship-decision-test.json`):
QA-green+approve → SHIP (0); QA-green+reject → HOLD (1); QA-red+approve → HOLD (1);
QA-red+reject → HOLD (1). This is the concrete single go/no-go a publish step
calls; the publish action itself remains org-owned (`obs_no_ship_action_in_loop`).

## Update 2026-07-10 (cycle 10) — fresh live drive of the CURRENT build (my cycle-1 evidence was stale)

My last full start→play→die→restart drive was cycle 1; the build has since gained
music, boss content, more level, etc. Re-drove the REAL current build
(`feedback/drive.mjs`, now opening the panel at each state + probing audio):

- **Reachability** — panel opens from **title, play, AND game-over** (probe
  `panelOpen:true` at all three). The natural verdict moment (game-over) works.
- **Sim pause holds on the current build** — with the panel open during play,
  `player.x` 389.10 → 389.10 over 1.2s, `status` stays `playing`
  (`simFrozenWhilePanelOpen:true`). AC-2 re-confirmed by live drive, not just
  conformance.
- **Visual** — `feedback/frames/3b-play-panel.png` (Read directly): the panel now
  renders over a frozen mid-play scene (context `build dev · arcade · playing ·
  score 200`), Export button present, dimmed backdrop. On-brand and legible. (Fixed
  a capture bug in my own driver: panel frames now use a full-page screenshot;
  `canvas.toDataURL()` can't see the DOM overlay, so the old `*-panel` frames were
  misleading — corrected, not worked around.)

### OI-4 (observation, LOW — root.B's call, NOT a spec violation) — music keeps playing while the panel is open
Probed live: with the panel open (sim frozen), `audio.ctx.state==='running'` and
`audio.music.running===true` — the background **music continues** while the creator
reads/types feedback. This does NOT violate any AC (AC-2 requires the *sim* to
freeze — it does; AC-3 requires no key-leak — holds; no SFX leak since `drainSfx`
only runs while stepping). Ambient music under a pause/overlay is conventional, so
I'm recording it as an observation, not a bug. **If** root.B wants the panel to
feel like a hard pause, `AudioKit` already exposes `duck(true)` (used for hit-stop)
and `music.setMuted()` — calling one while `feedback.isOpen()` would dip/stop music.
**Repro:** `node feedback/drive.mjs` → `drive.json.panelProbes.playPanelB.musicRunning===true`.

## Update 2026-07-10 (cycle 11) — grounded the UX mandate (panel vs shipped-game feedback UX)

Suite re-verified green on the further-evolved build (music.js 266→294, render 1122):
parity 8/8, conformance 15/15, artifact-gate 4/4, ship-decision 4/4.

Closed the one under-covered SPEC mandate clause — "ground the UX against how shipped
Contra-likes and comparable games surface feedback/ratings" — with
**`feedback/UX-ASSESSMENT.md`**: a grounded, look-at-the-real-screenshots comparison
of the shipped panel against documented shipped-game rating/feedback UX (win-moment
timing, sentiment-first two-path routing, minimal friction, verdict-as-submit,
auto-context, no 5-star begging). Verdict: the panel **matches** every applicable
pattern (native aesthetic, minimal fields, verdict-as-submit, auto-context, neutral
stars, private-feedback path); the one divergence (always-reachable vs win-moment
timing) is **correct** for a creator-invoked gate, not a defect. Two optional
non-aspirational recs handed to root.B (a "press F to rate this run" hint on the
cleared/gameover overlays; otherwise leave it alone).

Honest scope note recorded (ties to `task_obs_only_preference_channel_just_spawned`):
this panel captures the CREATOR's approval — necessary for the gate, but NOT evidence
that real PLAYERS prefer our game (the GOAL's exit bar). `releaseApproved` is a
creator sign-off, not a player-preference signal; a player-preference channel would
be a separate deliverable (kept out of scope to avoid an aspirational spec).

## Update 2026-07-10 (cycle 12) — UX rec landed: "press F to rate this build" on game-over

Suite re-verified green on the current build (main.js 225→247, audio grew):
parity 8/8, conformance 15/15, artifact-gate 4/4, ship-decision 4/4.

root.B implemented my cycle-11 UX recommendation #1: `render.js:1112-1119` now draws
a desktop-only cyan hint **"press F to rate this build"** on the GAME OVER / STAGE
CLEAR overlay — the shipped-game "prompt at the completion moment" pattern. Verified
by re-driving the live build and **looking** at `feedback/frames/4-gameover.png`:
the hint renders below "press R to restart", legible and on-brand. This closes the
discoverability gap (the panel was F-key-only) at exactly the natural verdict moment
— recommendation → implemented → verified live. UX-ASSESSMENT rec #1 marked done.

OI-4 status unchanged (accepted): re-probed — music still runs while the panel is
open (`musicRunning:true`); parent confirmed this is acceptable pause-overlay
behavior, so it stays an accepted observation, not a defect.

## Update 2026-07-10 (cycle 13) — grounded panel reachability on TOUCH/MOBILE

Answered the open question from cycle 12 (can the creator open the panel on a
phone?) with a live test — drove the served build at `?touch=1` in a mobile
viewport (430×932, `isMobile/hasTouch`):

- `body.touch-active` set, on-screen controls mount (`dpad/up/left/right/down/
  jump/fire`) — but **NO feedback affordance** among them.
- `window.__approval.isOpen()===false` and there is no on-screen element that
  toggles it. The panel DOM exists (`#fb-approve/#fb-reject/#fb-export` present) but
  the **only open path is `KeyF`** (`main.js:184`), which a touch-only device lacks.
- The game-over "press F to rate this build" hint is `!isTouchUI()`-gated, so it
  isn't shown on touch either.

**Conclusion (FACT): the creator-approval panel is UNREACHABLE on touch-only
devices.** This is CONSISTENT with the SPEC's explicit v1 scope (desktop is the
gate owner) — not a regression or spec violation — but it is a real limitation
worth stating plainly given the GOAL targets web/**Android**.

### OI-5 (limitation, LOW — by design; fix only if mobile creator-review is wanted)
No way to open the feedback panel on touch: no `KeyF`, no on-screen button, hint
desktop-gated. **Repro:** serve the build, open `/?touch=1` on a touch device (or
`defaultViewport hasTouch:true`), observe no affordance opens `window.__approval`.
**Owner:** root.B (game/). **Minimal fix:** add one button to the `touch.js` action
cluster that calls `feedback.toggle()` (mirror the existing fire/jump buttons; don't
overlap them). Until then, treat the gate as **desktop-only** — an accepted,
documented boundary, now explicit in SPEC §3.3.

**ACCEPTANCE GATE (cycle 14): `feedback/touch-reach-test.mjs`.** Per
report-don't-work-around, this test asserts the INTENDED behavior — a touch-only
creator can open the panel via an on-screen tap — and is **EXPECTED TO FAIL today**
(KNOWN BUG OI-5). It is implementation-agnostic: it drives `?touch=1` in a mobile
viewport, taps every on-screen control outside the panel, and checks whether any
opens `window.__approval`. Current run (evidence `feedback/frames/touch-reach.json`):
**FAIL** — 13 controls tried (`dpad/up/left/right/down/jump/fire/…`), none opened the
panel. When root.B adds the touch button, this flips to **PASS (exit 0)** with no
test change — that is the definition of done for OI-5. NOTE: this is a *known-red
acceptance gate*, deliberately NOT part of the always-green desktop suite
(parity/conformance/artifact/ship); those remain 8/8 · 15/15 · 4/4 · 4/4.

## Update 2026-07-10 (cycle 15) — one-command health check for the whole deliverable

The build changes every cycle and I was re-running five harnesses by hand. Added
**`feedback/verify-all.mjs`** — the single entry point that re-grounds the entire
creator-approval slice against the live build:

- Runs the four GREEN suites (must all pass): `parity` (consumer↔shipped
  `releaseApproved`, 8/8), `conformance` (AC-1..12 live, 15/15), `artifact-gate`
  (fail-closed binding, 4/4), `ship-decision` (QA ∧ creator, 4/4).
- Runs the ONE tracked-open acceptance gate separately: `touch-reach` (OI-5) —
  reported as RED but it does NOT fail the aggregate, and if it ever flips to PASS
  the tool prints "OI-5 may be RESOLVED; update FINDINGS."
- Exit 0 iff all green suites pass. Evidence `feedback/frames/verify-all.json`.

This-cycle result: **VERIFY-ALL PASS — green 4/4, OI-5 still red (as expected)**
against the current build (main.js 252→276, render 1128→1144; no feedback-wiring
changes, so OI-5 remains open — re-confirmed live). Any future loop (or root.B) can
now run `node feedback/verify-all.mjs` to know the deliverable's health in one shot.

## Update 2026-07-10 (cycle 16) — closed a real coverage gap: NOTES round-trip (AC-14)

Grounding audit found my conformance suite never asserted the **notes** field — yet
"logs STRUCTURED feedback" (the creator's free-text reasoning) is core to the
requirement. It verified verdict/rating/context/export-equals-entries, but a typed
note could have been silently dropped anywhere in panel → persist → export and no
test would catch it.

Added **AC-14 (notes round-trip)** to `conformance.mjs`: types a note into the live
panel's `#fb-notes` textarea, submits approve, and asserts the note survives
**verbatim** into `entries()` AND into the exported record `release-gate.mjs`
consumes. Verified live: `AC-14.notesRoundTrip PASS` (`latest.notes==typed:true
inExportedRecord:true`). Conformance is now **16/16**; `verify-all` still PASS
(green 4/4), OI-5 still red (re-checked: `touch.js` has no `feedback.toggle()`; no
feedback selftest added by root.B this cycle). SPEC AC-14 + README counts updated.

## Update 2026-07-10 (cycle 17) — new panel-pause interaction: attract mode (AC-2b)

Re-grounding caught a real change to the exact line wiring my panel's pause. root.B
added an **attract mode** (self-playing bot demo behind the title) and refactored the
freeze condition from `if (status==='title' || feedback.isOpen())` to a dedicated
`if (feedback.isOpen()) { acc=0; world.attract=false; }`. That created a NEW
interaction my suite didn't cover: opening the panel *at the title* must freeze the
demo, else the bot animates behind the overlay.

Verified live first (title demo advances `player.x` 170.97→223.82; open panel →
frozen 223.82→223.82, `attract=false`), then added **AC-2b** to `conformance.mjs` as
a regression guard: **`AC-2b.pauseAttractOnOpen PASS`** (`attractRan=true frozen=true
attractOff=true`). Conformance now **17/17**; `verify-all` PASS (green 4/4); OI-5
still red. SPEC AC-2b + README (17/17) updated. No regression from the refactor —
the panel-pause contract holds in the new attract state.

## Update 2026-07-10 (cycle 18) — ⛔ REAL CREATOR REJECT: release gate is BLOCKED (authoritative)

**The channel fired for real.** A human creator played the served build
(`buildId: dev`, arcade+casual, reached boss / cleared) and submitted a **REJECT
(3/5)** through the in-game panel. The verdict persisted via my exact schema into
`feedback/approvals/dev.json` (3 entries, newest `reject`), and repo-root
`CREATOR_FEEDBACK.md` carries the human breakdown. This is a **real player-preference
signal that OVERRIDES the AI-vision fidelity self-score** (self-score rated sprites
~4.0; the human immediately caught firing-origin + boss-movement defects the frame
comparison missed).

Ran the REAL record through my gate — every layer agrees, all FACTS (not fabricated):
- `release-gate.mjs feedback/approvals/dev.json --build dev` → **BLOCKED (exit 1)**.
- `ship-decision.mjs …` → **HOLD** (QA `criticalFailed:0` PASS, **Creator gate FAIL**
  → wider release DENIED).
- Live panel seeded with the record → `releaseApproved:false`, latest `reject`.

**Deliverable vs verdict — keep distinct:** my creator-approval *machinery* is green
(panel 17/17 conformance, gate chain verified) — it WORKED, capturing a real reject.
But the *build itself* is **NOT creator-approved**: **RELEASE = HELD**. "Panel works"
≠ "build approved."

### OI-6 (CRITICAL, blocks wider release) — creator rejected the build; 4 defects to fix + re-approve
Authoritative human verdict, owners are OTHER loops (root.E owns none of these — I
own the verdict record + gate, which correctly report HOLD):
1. **Environment depth / level theme** — background too simple; theme illegible;
   arcade Stage 1 is a **jungle w/ BRIDGE over WATER + multi-height traversal**.
   *(owner: art `assets/` + engine `game/` render+level)*
2. **Hero firing origin** — shots appear from a waist "secondary gun", not the
   hand-held weapon; muzzle/projectile spawn must match the hands. *(engine+art)*
3. **Tank/turret firing origin** — tanks fire from an implicit turret, not the
   barrel drawn in the sprite; align origin to the visible barrel. *(engine+art)*
4. **Boss has no movement** — static boss; needs real reposition/lunge/pattern, not
   just volleys from a fixed pose. *(engine `game/`)*
**Close condition:** a **new creator APPROVE** via the same panel, **artifact-bound**
to a build that fixes the above (`--stamp … --artifact game` then re-approve). Do NOT
self-certify from frame comparison — the human eye caught what vision missed.
**Repro:** `node feedback/ship-decision.mjs feedback/approvals/dev.json --build dev` → HOLD.

## Update 2026-07-10 (cycle 19) — hardened the RE-APPROVAL path: artifact-binding now MANDATORY

With a real reject on the board and the org actively fixing the 4 defects (art:
`assets/pipeline/experiments/environment-theme/`, `READY-TO-WIRE.md`; audio:
`CREATOR-FEEDBACK-RESPONSE.md`; engine: player.js/render.js growing), the *next*
event will be the creator RE-APPROVING a fixed build — and that is where a real
ship could go wrong. Proven this cycle:

- `ship-decision dev.json --build dev --artifact game` → **HOLD** (authoritative).
- A raw/unbound `dev` **approve** (exactly what the panel exports) → **ships (exit 0)
  WITHOUT `--artifact`**, but is correctly **BLOCKED (exit 1) WITH `--artifact`**.

So an unbound approve could green-light *any* `dev` build — including one that did
NOT fix the defects. **Hardening:** `--artifact` is now documented as **MANDATORY**
for the authoritative ship decision, with the exact bound re-approval procedure in
`README.md` + `approvals/README.md`, and a new regression guard locks the fail-safe:
`ship-decision-test.mjs` → **5/5** (added `qaPass+UNBOUNDapprove+artifact=HOLD`).
`verify-all` PASS (green 4/4), OI-5 red. This ensures the gate reopens ONLY on a
creator approve **bound to the exact fixed bytes** — closing OI-2's staleness hole
for the case that now matters.

## Update 2026-07-10 (cycle 20) — tracking the path back to APPROVE (RE-APPROVAL-STATUS.md)

The org is actively fixing the 4 rejected defects. Grounded the progress FROM GIT
(facts, not fix-certification — the creator forbade self-certifying) and added
**`feedback/RE-APPROVAL-STATUS.md`**, a living tracker the gate owner maintains so a
creator re-review is requested only when the build is actually ready:

- #2 hero firing origin — **claimed fixed in-build** (`6109f41`).
- #4 boss movement — **claimed fixed in-build** (`ad7a07c` "boss now MOVES").
- #1 environment/theme — **art ready, NOT wired** (PR#200 bridge+water tiles; engine
  tile slot + multi-height pending).
- #3 tank/turret firing origin — **not started** (no commit found).

**Readiness verdict: NOT READY** — 2/4 claimed in-build, #1 unwired, #3 not begun.
Build hash changed `36824a43…`(38f) → `b34a2ab7…`(40f), so the current build differs
from the rejected one, but the defects aren't all addressed. Gate stays **HELD**
(re-confirmed `ship-decision … --artifact game` → HOLD; verify-all PASS green 4/4).
A claim is not a close — only a creator APPROVE (artifact-bound) reopens the gate.

## Update 2026-07-10 (cycle 21) — behaviorally GROUNDED the measurable creator fixes (#2, #4)

The re-approval tracker inferred "in-build" from commit subjects + code COMMENT
signatures (brittle: reword the comment, false-negative). Upgraded to OBSERVED
behavior for the two runtime-measurable creator defects — exactly the creator's
"verify by behavior, the eye caught what claims missed" directive. Added
**`feedback/defect-behavior-test.mjs`** (drives the real build) — **2/2 PASS**:

- **#4 boss movement** — drove `?headless=1&scenario=boss` at 40/80/120/160/200
  frames; `boss.y` = [190.94, 182.55, 177.2, 185.51, 190.7], **range 13.74px** ⇒ the
  boss genuinely MOVES (deterministic hover). Directly refutes the creator's "boss
  has no movement" on the current build.
- **#2 hero firing origin** — drove the showcase; the nearest fresh bullet spawns
  **28% down the body** (playerY 216, h 20, bulletY 222) ⇒ **hands/upper body, not
  waist**. Confirms the firing-origin fix behaviorally.

Scope: #1 (theme legibility) and #3 (turret barrel geometry) are visual-judgment /
geometry — left to the tracker's commit+code signature and the creator's re-review.
The test FAILS LOUDLY if a claimed-fixed defect is behaviorally absent (report, don't
mask). This is grounding evidence, NOT a creator close — the gate still needs an
artifact-bound creator APPROVE (still HELD; #1 remains unwired ⇒ NOT READY).

## Update 2026-07-10 (cycle 22) — made the creator-fix behavioral guards CONTINUOUS

The behavioral verification of the creator's #2/#4 fixes (`defect-behavior-test.mjs`)
only ran on manual invocation, so a regression while root.B keeps editing
`enemy.js`/`player.js` would slip past the standing health check. Wired it into
`verify-all.mjs` as a GREEN (must-pass) suite: **verify-all now green 5/5** (parity,
conformance, artifact-gate, ship-decision, **defect-behavior**), OI-5 red, re-approval
3/4 NOT READY. If the boss stops moving or the hero fires from the waist again, the
one-command health check now fails loudly.

Re-grounded state (unchanged): #1 (bridge+water + multi-height) still **unwired**
(PR#211 `ba86a17` names it "the last defect gating re-approval"); #2/#3/#4 in-build.
Gate **HELD**. When #1 lands, the tracker flips to 4/4 → request creator re-review.

## Update 2026-07-10 (cycle 23) — ✅ 4/4 DEFECTS IN-BUILD → READY for creator re-review

Defect #1 (the last blocker) landed: engine wired a **bridge-over-water set-piece +
water fall-hazard gap + upper rope catwalk** (`b20e7b4`, `883638b`; `level1.js`
87→112, `render.js` +116). The re-approval tracker flipped **NOT READY → READY**
(`re-approval-status.mjs` = 4/4 in-build).

Grounded #1 this cycle (facts, not a creator close):
- **Structural multi-height** (added to `defect-behavior-test.mjs`, now **3/3**):
  over the water region the level has bridge deck solids + a catwalk **124px above**
  it (`bridge=2 catwalk=3 heightSpread=124`) ⇒ the creator's "move at multiple
  heights" is genuinely present.
- **Looked at it** (`feedback/frames/bridge-water-region.png`, Read directly): plank
  deck with truss supports over a teal water channel, a mid-bridge water gap, an
  upper rope catwalk, elevated grass platforms — the "bridge over water + multiple
  heights" motif now reads clearly. THEME ADEQUACY is still the creator's verdict.

**Gate STILL HELD.** "READY" = all 4 fixes are in-build so a creator re-review is now
worth requesting — it is NOT approval (dev.json still REJECT, `releaseApproved`
false). **ACTION NEEDED (surfaced to parent): have the human creator re-play the
fixed build and re-verdict in the panel.** Reopening requires a new artifact-bound
creator APPROVE (README/approvals procedure).

## Update 2026-07-10 (cycle 24) — blocked on human re-review; hardened tracker #1 signature

No new creator verdict has arrived — `dev.json` is unchanged (3 reject entries,
latest ts 1783652411794), `CREATOR_FEEDBACK.md` still REJECT. Gate correctly **HELD**;
readiness **READY** (4/4 in-build). **The loop is now blocked on a human action I
cannot perform: the creator must re-play the fixed build and re-verdict in the panel.**
Nothing in my slice advances until that happens.

Re-grounded against the heavy churn since last cycle (`render.js` +41, `selftest.js`
+115, `world.js` +7, Stage 2 being authored in `content/stage2/`): **verify-all PASS,
green 5/5** — no regression to the panel or the creator-fixes.

Small robustness fix to my own tool: `re-approval-status.mjs`'s #1 detection keyed
off comment words `/bridge|water/i` (would false-negative if root.B cleans up the
comments). Switched it to the FUNCTIONAL flag `/bridge:\s*true/` — the actual solid
property that makes the feature work (2 present in `level1.js`), robust to comment
edits and consistent with `defect-behavior-test.mjs`'s runtime structural check. Still
reports 4/4.

## Update 2026-07-10 (cycle 25) — forward-proofed the channel for multi-stage (SPEC §3.4 + dormant tripwire)

Still blocked on the human re-review (dev.json byte-unchanged, gate HELD-READY;
verify-all green). Used the wait to close a real, grounded FORWARD gap the growing
content creates: Stage 2 is being authored across the org (chopper boss, `boss2`
theme, `content/stage2/`; PR#226/228/229) and will land in `game/`. The panel's
captured `context` today is `{buildId,status,mode,score,lives}` — **no stage id**, so
once the game is multi-stage a creator note like "the boss is unfair" can't be told
apart between the Stage-1 Sentinel and the Stage-2 Chopper — the only preference
channel would lose actionability.

- **SPEC §3.4** now carries a grounded forward requirement: once the shipped game
  exposes >1 stage, `feedback.js` MUST add `context.stage` (e.g. `world.levelKey`).
  Backward-compatible (extra `context` key; `computeGate` ignores it). Explicitly
  NOT to be added before multi-stage ships (spec stays grounded, not aspirational).
- **`feedback/multistage-context-check.mjs`** is the DORMANT tripwire: PASS while
  single-stage (facts: no `level2` data file, no stage-advance wiring in
  world/main), FLIPS to FAIL the moment multi-stage lands in `game/` without a stage
  id. Wired into `verify-all` (now **green 6/6**) so it can't be forgotten.

## Update 2026-07-10 (cycle 26) — re-grounded #1 visually on the churned build (no regression)

Still blocked on the human re-review (dev.json byte-unchanged, gate HELD-READY,
verify-all **green 6/6** — no regression from heavy churn: `render.js` +80, `player.js`
+19, `selftest.js` +30 since the fixes). `render.js` growing risked silently breaking
the #1 set-piece the creator will judge, so I **re-captured and looked at** the
bridge-water region on the CURRENT build (`feedback/frames/bridge-water-region.png`,
refreshed): plank deck + trusses over a teal water channel, mid-deck fall-gap, upper
rope catwalk, multi-height platforms — renders cleanly, **no visual regression**. The
re-review reference frame is now current, and the behavioral guard
(`defect1.multiHeightPresent`) still passes. The one lever remains the human creator's
re-play + re-verdict; nothing in my slice advances until then.

## Update 2026-07-10 (cycle 27) — guarded the panel vs the new PAUSE key (AC-3 extended)

`touch.js` grew (+19) — but it added a **PAUSE button** (tap toggle), NOT the OI-5
feedback affordance, so **OI-5 stays red** (`touch-reach-test` tried 14 controls incl.
the new "pause"; none open the panel). The new feature added a `world.paused` state +
**P key** (`main.js:197`). Verified the panel still owns the keyboard: pressing **P
while the panel is open does NOT toggle pause** (`paused` false→false; main.js:190
blanket-swallows all game keys before the P handler). Extended **AC-3** (conformance
17/17) to include `P` so a future refactor moving the P handler above the swallow
fails loudly. SPEC AC-3 updated. verify-all **green 6/6**; gate still HELD-READY; no
new creator verdict.

## Update 2026-07-10 (cycle 28) — ⛔ creator RE-REJECTED (round 2) + OI-7 tripwire fired (Stage 2 landed)

**The channel fired again — the creator re-reviewed and REJECTED (round 2).** dev.json
now has a 4th entry (reject 3/5, ts 1783682770327); `CREATOR_FEEDBACK.md` "ROUND 2".
Ran it through the gate: `ship-decision … --artifact game` → **HOLD** (newest verdict
reject). This VALIDATES the whole channel end-to-end: capture → persist → gate → HOLD,
a second real human loop.

**Round-2 root cause (routes to art+engine, NOT root.E):** the CR-2/CR-3 firing-origin
fixes were **cosmetic** — hero AND turret each render **two weapons** (a baked-in sprite
weapon + a procedural aiming weapon); moving the *bullet* didn't remove the phantom
sprite gun. Required: **one weapon per entity, drawn where it fires** (weaponless sprite
+ procedural weapon at STYLE-BIBLE quality, OR directional/rotating art). Owner: art
`assets/` + engine `game/`. Full breakdown + the reset readiness in `RE-APPROVAL-STATUS.md`.

### OI-7 (gap, MEDIUM) — Stage 2 shipped without `context.stage` (my tripwire fired)
`game/data/level2.js` now exists ⇒ the game is **multi-stage**, but `feedback.js`
`context` still lacks a stage id — so the round-2 reject carries `context.stage:
undefined` and we can't tell whether the creator was on Stage 1 or 2. This is the exact
degradation SPEC §3.4 forward-required against; `feedback/multistage-context-check.mjs`
**FIRED** (now a tracked-open red in verify-all, alongside OI-5 — machinery still green
5/5). **Owner: root.B** — add `context.stage` (e.g. `world.levelKey`) at submit time.
**Repro:** `node feedback/multistage-context-check.mjs` → FAIL.

## Update 2026-07-10 (cycle 29) — grounded the round-2 fix status BY LOOKING: not complete

No new creator verdict (still round-2 reject); OI-7 still red; machinery green 5/5. The
round-2 two-weapons fix needs engine + art; only **engine** landed (`ff435b8` — procedural
gun/turret upgraded to quality pixel art). To avoid requesting a premature re-review, I
drove the live build firing UP and **looked** (`feedback/frames/hero-weapon-check.png`):
the hero's shots go **straight up** while the sprite's baked rifle still points
**diagonally** — the weapon shown ≠ the weapon that fires, i.e. the creator's round-2
defect is **still present** (art hasn't reshipped weaponless sprites; the art loop is on
the Stage-2 chopper boss). Recorded in `RE-APPROVAL-STATUS.md`: **NOT READY** — art
`assets/` owes weaponless (or directional) hero + purple-turret sprites; then re-verify by
looking. Gate correctly HELD; the loop still ends on a human APPROVE.

## Handoff to root.B

Drop-in path (SUPERSEDED — root.B already implemented independently and it
passes): copy `feedback/reference-impl/feedback.js` → `game/src/feedback.js`,
add the SPEC §3.2 wiring to `main.js`, then run `node feedback/conformance.mjs`
(and `node playtest/e2e/run-all.mjs`) to confirm green. The full integration
contract (module surface, `runLive` wiring incl. the `window.__approval` alias,
DOM overlay, entry schema, release-gate semantics, **11** acceptance criteria incl.
the ship-gate flip) is in `feedback/SPEC.md`.
Once `game/src/feedback.js` lands, `feedback/drive.mjs` can be extended to assert
AC-1…AC-11 against the live build (it already boots and drives the real app, so
adding the panel assertions is incremental), and `run-all.mjs` is the
authoritative pass/fail signal for AC-11.
