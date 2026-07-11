# SPEC — Creator Approval / Feedback Panel (`game/src/feedback.js`)

Status: **v1 — IMPLEMENTED & VERIFIED IN THE SHIPPED BUILD** (2026-07-10). root.B
landed `game/src/feedback.js` (PR#99) wired per §3.2; `feedback/conformance.mjs`
drives the REAL served build through all 11 ACs — `feedback/frames/conformance.json`:
**13 passed, 0 failed, PASS**. The ship-blocking critical red
`creatorApproval.panelExists` is CLEARED (`qa-summary.json` criticalFailed: 0).
The contract below is now a live spec of a real feature, not a proposal.
Owner of this contract: root.E (approval perspective). Implemented by **root.B** —
root.E does **not** edit `game/`. `feedback/conformance.mjs` is the standing
regression guard; re-run it after any `game/` change to input routing, the pause
path, or the gate. (`feedback/reference-impl/feedback.js` is now historical —
it proved satisfiability pre-implementation; the shipped file is authoritative.)

## 0. Why this exists (the gap it closes)

The GOAL's exit gate demands that a real creator has *approved* the build for
wider release. Today the build has **no capture channel** for that verdict — the
only signals are AI-vision fidelity self-scores (strategy `obs_gate_passes_but_ship_never_fires`,
`task_obs_preference_has_no_capture_channel`). This panel is that channel: the
creator plays the real browser build, opens a hotkey overlay, records a
structured verdict + rating + notes, and that verdict — persisted — becomes a
machine-readable **release gate** any publish/ship step can read before going wide.

This spec is deliberately tight and small. It is a *feedback capture + gate*, not
an analytics platform. Do not add telemetry, network calls, or accounts.

## 1. Grounding summary (what the live build actually gives us)

Verified by driving the shipped tree in headless Chrome (`feedback/drive.mjs`):

- `world.status` ∈ `{ 'title', 'playing', 'cleared', 'gameover' }` (from `world.js`).
  Overlays for `title` / `gameover` / `cleared` are **canvas-drawn** in `render.js`.
- The live loop (`main.js runLive`) freezes the sim while `status === 'title'`
  (`acc = 0`, no `world.step`). We reuse that exact freeze pattern for "panel open".
- Globals already exposed for harnesses: `window.__game` (World), `window.__audio`,
  `window.__touch`, `window.__assets`. We add `window.__approval` (the name the
  shipped QA gate reads — see §3.5) and `window.__feedback` as a readable alias.
- Keydown routing lives in one `runLive` listener. Free key codes (nothing in
  `KEYMAP` or the live listener uses them): **`KeyF`**, `Backquote`, `Escape`, `Tab`.
  We claim **`KeyF`** (mnemonic: *Feedback*) to toggle, **`Escape`** to close.
- `localStorage` is available in the served context (confirmed) and is currently
  **unused** by the game — the key namespace is clean.
- No build-version global exists yet; the panel captures one *if present*
  (`window.__buildId`) and falls back to `game/package.json` version or `'dev'`.

## 2. Grounded UX requirements (from shipped-game practice)

From how shipped games / beta builds surface feedback (gamedeveloper.com "In-game
Feedback Forms"; Subnautica emoji-verdict pattern; Steam Playtest; Meta Horizon
remote playtest). Principles applied:

1. **One global hotkey reaches the panel from anywhere** — title, mid-play, or
   game-over. (Speed of access is the #1 driver of submission volume.)
2. **Minimal required fields.** Exactly one required decision: the **verdict**
   (Approve / Reject). Everything else (star rating, notes) is optional. Do not
   gate submit on a filled textarea.
3. **Verdict-as-action.** The Approve and Reject buttons *are* the submit action
   (Subnautica pattern) — click Approve → entry saved with `verdict:'approve'`.
4. **Auto-attach hidden context** so a terse note is still actionable: build id,
   `status`, `mode`, `score`, lives, timestamp. The creator never types these.
5. **Persist locally, survive reload.** Feedback and the resulting gate live in
   `localStorage` so a verdict is not lost on refresh and the gate is readable by
   a later publish step / harness without a server.
6. **Panel must pause the game** while open (so the creator isn't dying/typing
   into the sim) and must **not leak keystrokes** into gameplay. Scope: "pause"
   means the **simulation** freezes (verified live — AC-2 + the cycle-10 drive).
   Background **music intentionally continues** (it runs on the Web Audio clock,
   not the sim loop; no SFX leak since those are sim-driven) — conventional for a
   pause overlay. Ducking/pausing music while the panel is open is OPTIONAL and
   root.B's call (`AudioKit.duck()` / `music.setMuted()` are available). See
   FINDINGS OI-4.

## 3. Integration contract — EXACT

### 3.1 Module surface (`game/src/feedback.js`)

```js
// game/src/feedback.js
export function mountFeedback(world, opts = {}) { /* ... */ return controller; }
```

`mountFeedback(world, opts)` builds the DOM overlay (see §3.3), wires its own
`keydown` capture, and returns a **controller**:

```js
controller = {
  open(),            // show panel + request pause; focuses nothing destructive
  close(),           // hide panel
  toggle(),          // open if closed, else close
  isOpen(): boolean, // true while the panel is visible (loop reads this to pause)
  submit(entry),     // programmatic submit (harness path); same as clicking a verdict
  entries(): Entry[],// all persisted entries, newest last
  latest(): Entry|null,
  get releaseApproved(): boolean,  // THE RELEASE GATE (see §4)
  clear(),           // wipe persisted feedback (dev/testing)
}
```

`opts` (all optional): `{ hotkey = 'KeyF', buildId, storageKey = 'contra:feedback:v1' }`.

### 3.2 Wiring in `main.js runLive` (root.B adds these lines)

```js
import { mountFeedback } from './feedback.js';
// ...after world/audio/touch are created, before the rAF loop:
const feedback = mountFeedback(world, { buildId: window.__buildId });
window.__feedback = feedback;               // rich controller handle
window.__approval = feedback;               // REQUIRED alias — the shipped QA gate
world.approval = feedback;                  // reads window.__approval / __game.approval (see §3.5)

// in the existing keydown listener, BEFORE the game-key branches:
if (e.code === 'KeyF') { feedback.toggle(); e.preventDefault(); return; }
if (feedback.isOpen()) {                     // panel owns the keyboard while open
  if (e.code === 'Escape') feedback.close();
  return;                                    // swallow game keys (R/1/2/M/etc.)
}
```

And in the `frame()` loop, treat an open panel like the title freeze:

```js
if (world.status === 'title' || feedback.isOpen()) {
  acc = 0;                                    // freeze sim while paused/panel open
} else { /* existing accumulator stepping */ }
```

`render(ctx, world, assets)` still runs each frame (the frozen last frame shows
behind the translucent overlay — matches the go-live "sim keeps running behind
the hint" pattern already in `index.html`).

### 3.3 Overlay DOM (feedback.js builds this; NOT canvas)

A single `position:fixed` container appended to `<body>` (same technique as
`#boot-help` / `#rotate-hint` already in `index.html`), `hidden` by default:

- Title line: `BUILD FEEDBACK — creator approval`.
- Read-only context line rendered from the live snapshot at open time:
  `build <id> · <mode> · <status> · score <n>`.
- **Star rating** row: 1–5 selectable stars (optional; default unset).
- **Verdict buttons** (required decision, each *is* a submit):
  `✓ APPROVE FOR RELEASE`  and  `✗ REJECT`.
- **Notes** `<textarea>` (optional, free text, e.g. "boss phase-2 reads unfair").
- A small `esc to close` hint and a `feedback saved ✓` confirmation flash.
- Must be keyboard-usable: the textarea focused should NOT let keystrokes reach
  the game (guaranteed by the `return` in §3.2 + `e.stopPropagation()` on the
  overlay's own handlers).

Styling: reuse the existing dark palette (`#0a0e14` bg, `#cdd6e0` text,
`#8ef0ff` accent). Translucent backdrop so the frozen game shows through.
Touch/mobile — **desktop-only by design in v1, and VERIFIED so (cycle 13)**: the
only open path is the `KeyF` hotkey (`main.js:184`); `touch.js` mounts no feedback
affordance and the game-over "press F to rate" hint is `!isTouchUI()`-gated. So on a
touch-only device the panel is **unreachable** — an intentional scope choice (the
creator is the desktop gate owner), not a defect. Tracked as FINDINGS **OI-5**. If
mobile creator-review is ever wanted, the minimal fix (root.B) is a small on-screen
button in the `touch.js` action cluster that calls `feedback.toggle()` — it must not
overlap the D-pad/jump/fire.

### 3.4 Entry schema (persisted)

```
Entry = {
  verdict: 'approve' | 'reject',   // required
  rating: 1|2|3|4|5|null,          // optional star rating
  notes: string,                   // optional, '' if empty
  context: {                       // auto-captured at submit time
    buildId: string,               // opts.buildId ?? window.__buildId ?? pkg version ?? 'dev'
    status: string,                // world.status at submit
    mode: string,                  // world.modeKey
    score: number,                 // world.score
    lives: number,                 // world.lives
    stage?: string,                // FORWARD (see below): current stage/level id when multi-stage
  },
  ts: number,                      // Date.now() at submit
}
```

**Multi-stage context (FORWARD REQUIREMENT — grounded, activates when Stage 2 lands).**
Stage 2 is being authored across the org (chopper boss, `boss2` theme, `content/stage2/`;
PR#226/228/229) and will land in `game/`. Today the game is single-stage, so `context`
needs no stage id. **Once the shipped game exposes >1 stage, `feedback.js` MUST add
`context.stage` (e.g. `world.levelKey` / `world.stage`) at submit time** — otherwise a
creator note like *"the boss is unfair"* can't be disambiguated between the Stage-1
Sentinel and the Stage-2 Chopper, and the ONLY preference channel loses actionability
as content scales. Backward-compatible: it is an extra `context` key; the release gate
(`computeGate`) ignores it and all existing ACs/harnesses still pass. Do NOT add it
before multi-stage ships (keep the spec grounded, not aspirational) — this is a
tripwire for root.B, tracked so it isn't forgotten when Stage 2 merges into `game/`.

Persistence: `localStorage[storageKey]` holds `JSON.stringify(Entry[])`, newest
appended last. Reads must tolerate a missing/corrupt value (try/catch → `[]`).

### 3.5 QA-gate alignment (REQUIRED — this closes the ship-blocking red)

The consolidated ship gate `playtest/e2e/run-all.mjs` (via `playthrough.mjs`)
already has ONE **critical** red that fails the whole build verdict:
`creatorApproval.panelExists`. Verified live this cycle — `qa-summary.json`:
`VERDICT FAIL (1 critical)`, `criticalFailed: 1`, this exact assertion. The gate's
predicate (read verbatim from `playthrough.mjs`) is:

```js
const domHit = /approve|creator (review|approval|feedback)|thumbs|rate this build/i
                 .test(document.body.innerHTML || '');
const apiHit = !!(window.__approval || (window.__game && window.__game.approval));
// gate passes iff (domHit || apiHit)
```

So the panel MUST satisfy **both** an API handle and a DOM-text handle
(implement both — do not rely on either alone):

- **API handle:** set `window.__approval = <controller>` **and** `world.approval =
  <controller>` (i.e. `window.__game.approval`). My original spec used only
  `window.__feedback`; that name is NOT what the gate reads, so `window.__approval`
  is now a **required** alias (§3.2). `window.__feedback` stays as a readable alias.
- **DOM handle:** the overlay markup (present in `body.innerHTML` even while the
  panel is `hidden`) must contain gate-matching text. The §3.3 labels already do:
  the verdict button `✓ APPROVE FOR RELEASE` matches `/approve/i` and the title
  `BUILD FEEDBACK — creator approval` matches `/creator (…|approval|…)/i`. Keep at
  least one of those literal strings so `domHit` holds after mount.

Grounding note: `apiHit` is the robust handle (deterministic, timing-independent);
`domHit` is a fallback that only holds once the DOM is mounted. Implement the API
alias so the gate cannot flap on render timing.

## 4. Release gate — EXACT semantics

`window.__feedback.releaseApproved` is the machine-readable ship gate. Definition:

> **`releaseApproved === true`** iff the **most-recent entry whose `context.buildId`
> equals the current build** has `verdict === 'approve'` **and** (`rating === null`
> **or** `rating >= 3`).
> Otherwise `false` (including: no entries, latest is a reject, or latest approve
> carries rating 1–2).

Rationale, grounded: a later *reject* must be able to **revoke** an earlier
approve (velocity: the newest verdict wins), and an "approve" clicked alongside a
1–2 star rating is contradictory and must not gate-open. Scoping to the current
`buildId` prevents a stale approval of an old build from green-lighting a new one
(closes `obs_gate_passes_but_ship_never_fires`: a gate that passes on stale
signal is worse than no gate). If `buildId` is unknown (`'dev'`) the scope is
"entries tagged `'dev'`", which is acceptable for local iteration.

A publish/ship step (or a harness) reads it as:

```js
if (!window.__feedback.releaseApproved) abortWiderRelease();
```

## 5. Acceptance criteria (each is testable; a harness like `feedback/drive.mjs` checks it)

- **AC-1 Hotkey toggle.** Pressing `F` on title, during play, and on game-over
  opens the panel; pressing `F` again (or `Esc`) closes it. `isOpen()` reflects it.
- **AC-2 Pause on open.** With the panel open for ≥1s during `playing`, the sim
  does not advance (`world.player.x` and `world.status` unchanged; the creator
  cannot die while the panel is open).
- **AC-2b Pause attract-mode on open.** Opening the panel at the **title** freezes
  the attract-mode bot demo (root.B added a self-playing demo behind the title):
  `world.attract` goes `false` and `player.x` stops advancing, so the demo never
  animates behind the overlay. Verified live in `conformance.mjs`
  (`AC-2b.pauseAttractOnOpen`). Regression guard for the refactored panel-pause
  condition (`main.js`: `if (feedback.isOpen()) { acc = 0; world.attract = false; }`).
- **AC-3 No key leak.** With the panel open, pressing `R`/`1`/`2`/`M`/`P` does not
  reset the world, change mode, toggle mute, or toggle pause. (`P`/pause added after
  root.B shipped the pause feature — the panel must own the keyboard fully so the
  creator typing notes never nudges game state.)
- **AC-4 Approve persists + gates.** Clicking APPROVE (rating ≥3 or unset) saves
  an entry with `verdict:'approve'` and full `context`, and `releaseApproved`
  becomes `true`. Value survives a page reload (localStorage).
- **AC-5 Reject revokes.** After an approve, a later REJECT saves a
  `verdict:'reject'` entry and flips `releaseApproved` back to `false`.
- **AC-6 Contradictory approve rejected.** APPROVE with rating 1 or 2 saves the
  entry but leaves `releaseApproved === false`.
- **AC-7 Context auto-captured.** Every entry's `context` carries the live
  `buildId/status/mode/score/lives` at submit time — the creator typed none of it.
- **AC-8 Default closed / gate closed.** On a fresh load (no prior storage) the
  panel is hidden and `releaseApproved === false` — release is closed by default.
- **AC-9 No game-key regression.** With the panel closed, all existing controls
  (move/jump/fire/R/1/2/M/start) behave exactly as before mounting the panel.
- **AC-10 Corrupt storage tolerated.** A garbage `localStorage[storageKey]` value
  yields `entries() === []` and a closed gate, never a thrown error at boot.
- **AC-11 Ship gate turns green.** After the panel mounts, `window.__approval`
  (and `window.__game.approval`) is truthy AND `document.body.innerHTML` matches
  the gate regex (§3.5). Concretely: `node playtest/e2e/run-all.mjs` no longer
  reports `creatorApproval.panelExists` as a critical red, and its verdict flips
  from `FAIL (1 critical)` to `PASS` (assuming no other critical red appears).
  This is the acceptance criterion that unblocks wider release.
- **AC-14 Notes round-trip.** A note typed into the panel textarea survives
  verbatim into `entries()` **and** the exported record `release-gate.mjs` consumes
  — the "logs STRUCTURED feedback" requirement. Verified live in `conformance.mjs`
  (`AC-14.notesRoundTrip`): type → approve → `latest().notes === typed` and the note
  is present in `exportJson()`.
- **AC-12 Export → gate chain.** The panel exposes a one-click Export affordance
  (`#fb-export` button + `controller.exportJson()`); `exportJson()` returns a JSON
  string equal to `entries()`, and that exported record, fed to
  `feedback/release-gate.mjs`, yields the correct ship decision (exit 0 for a valid
  approve). Verified live in `feedback/conformance.mjs`
  (`AC-12.exportReturnsEntries` + `AC-12.exportedRecordGatesShip`): the complete
  chain **in-panel approve → export → release-gate → ship decision** runs against
  the real build. (Closes OI-3.)

## 5b. Release-gate CONSUMPTION (closing "gate passes but ship never fires")

Capturing `releaseApproved` is only half the requirement — something must READ it
to actually gate wider release. As of this writing NOTHING does (`releaseApproved`
has zero consumers outside `feedback.js`; verified by grep), and the value lives
only in the creator's **browser localStorage**, invisible to an out-of-browser
publish step. The consumption contract (owned by root.E, in `feedback/`):

1. **Durable record.** The panel's persisted `Entry[]` is exported from the
   creator's browser to `feedback/approvals/<buildId>.json` (see that folder's
   README for the export methods). This decouples the ship decision from any one
   browser session.
2. **The gate consumer.** `feedback/release-gate.mjs <record.json> --build <id>`
   computes the verdict with a byte-for-byte replica of the shipped
   `computeGate()` and **exits 0 (publish may proceed) / 1 (wider release denied)**.
   A pipeline calls: `node feedback/release-gate.mjs feedback/approvals/v1.json --build v1 && <publish>`.
3. **Anti-drift guarantee.** `node feedback/release-gate.mjs --verify` drives the
   REAL build and asserts the consumer's verdict equals `window.__approval.
   releaseApproved` across 8 cases (empty / approve-unrated / 5★ / contradictory-2★
   / reject / approve-then-reject / reject-then-approve / other-build-only) —
   `feedback/frames/release-gate.json`: **8/8 PASS**. If the panel's gate logic
   ever changes, `--verify` fails and this consumer must be updated in lockstep.

4. **Artifact binding (fail-closed).** Because `window.__buildId` is unset today
   (every approval self-reports `buildId='dev'`, OI-2), verdict-scoping alone can't
   tell build A's approval from build B's. The consumer closes this on its own
   side: `--artifact <dir>` computes a sha256 fingerprint of the actual shipped
   tree (`feedback/lib/artifact-hash.mjs`) and requires the record's `artifactHash`
   to match. The creator **stamps** an approval to the exact bytes approved
   (`--stamp <entries.json> --artifact game > record.json`); at ship time the gate
   re-hashes and **BLOCKS** if the build changed or the record is unbound. Proven:
   `feedback/frames/release-gate-artifact.json` (**4/4 PASS** — bound-match→ship,
   artifact-changed→block, unbound-under-artifact→block, legacy-no-artifact→ship);
   re-run `node feedback/artifact-gate-test.mjs`. This makes the gate SOUND even
   before OI-2 is fixed upstream.
5. **Composed ship decision (QA ∧ creator).** "Gates wider release" means BOTH
   gates green, not either. `feedback/ship-decision.mjs <record> --artifact game`
   ANDs (a) root.D's QA verdict (`playtest/frames/live/qa-summary.json`
   `criticalFailed === 0`) with (b) the artifact-bound creator gate, emitting one
   verdict + exit code: **0 = SHIP, 1 = HOLD**. This is the single go/no-go a
   publish step calls. Proven (`feedback/frames/ship-decision-test.json`,
   **4/4 PASS**): QA-green+approve → SHIP; QA-green+reject → HOLD;
   QA-red+approve → HOLD; QA-red+reject → HOLD. FRESHNESS caveat surfaced in the
   output: the QA summary is not artifact-bound, so the caller must run
   `run-all.mjs` against the current build first (the decision prints its age and
   warns when stale); the creator half is already artifact-bound.

Two upstream needs for full production use (do not block v1; tracked in FINDINGS
OPEN ISSUES): (a) root.B injects a real `window.__buildId` so records scope to the
shipped build, not the `'dev'` fallback — now *mitigated* on the consumer side by
artifact binding above, but still worth doing so in-browser records self-scope;
(b) ~~a one-click **Export** affordance on the panel~~ — **DONE**: root.B added the
`⤓ EXPORT JSON` button + `controller.exportJson()` (downloads `<buildId>.json`,
returns the JSON string); verified live by AC-12. OI-3 resolved.

## 6. Out of scope for v1 (do not build)

Network submission, accounts/auth, multi-user aggregation, screenshot capture,
voice/screen recording, analytics dashboards, per-level tagging beyond `status`.
These can layer on later once the local gate is proven.

## 7. References (UX grounding)

Full grounded comparison of the shipped panel against shipped-game feedback/rating
UX (with verdicts per pattern + the creator-gate-vs-player-preference scope note):
**`feedback/UX-ASSESSMENT.md`**. Summary: the panel matches every applicable
shipped-game pattern; `releaseApproved` is a creator sign-off, not player-preference
evidence.


- gamedeveloper.com — *In-game Feedback Forms* (quick-key access; minimal fields;
  Concealed Intent 2-box form; Subnautica emoji-verdict-as-submit).
- indieop.com — *Why In-Game Feedback Systems Are Essential* (auto-context capture
  turns "it crashed" into actionable reports).
- Steam Aquamarine Playtest news; Meta Horizon remote playtest best-practices
  (verdict-plus-context submission flow).
