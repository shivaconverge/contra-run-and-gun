# audio/ — the missing music layer (BGM staging + drop-in patch)

The slice has procedural **SFX** (`game/src/audio.js` → `AudioKit`) but no looping
**stage music** — the biggest missing sensory layer vs the Contra corpus, where a
driving looped theme is core to the feel. This dir supplies it, as a hand-off to root.B.

UDIO_API_KEY was **not reachable** this cycle, so the track is a **deterministic
WebAudio chiptune sequencer** — real synthesized music (2 pulse + triangle + noise, the
NES 2A03 arrangement Contra used), not a placeholder tone. If UDIO becomes available, a
generated track can replace/augment this behind the same `MusicKit` interface.

## Files
| File | What it is |
|---|---|
| **`music.js`** | The drop-in `MusicKit` — deterministic chiptune BGM sequencer. `start/stop/resume/toggleMute/setMuted/duck/setSection/setPlaying/setIntensity` + a live look-ahead scheduler and an offline `scheduleSpan` for verification. Four sections: 16-bar **stage** (E-min) + 8-bar **boss** (E-min) + 8-bar **stage2** (A-min "Cascade Base") + 8-bar **boss2** (A-min chopper gunship); scene-gate cuts music on game-over/victory; **enrage-intensity** lifts the boss theme (hotter mix + double-time hats) in phase 2. Headless-safe (no ctx = silent no-op). **This is the deliverable root.B integrates.** |
| **`TEARDOWN.md`** | Corpus-grounded music teardown: the 5 stage-music invariants (fast tempo, gallop bass, march feel, heroic-minor key, seamless short loop) and how each maps to a choice in `music.js`. Marks what's reference-character vs measured. |
| **`INTEGRATION.md`** | The ~10-line wiring spec for root.B (merge into `AudioKit`, one line in `main.js`). |
| **`contra-stage-loop.wav`** | Listenable artifact — one 25.26s seamless stage A/B loop rendered from `music.js`, so a human can actually **hear** it and judge sound quality (the one thing a headless loop can't). Reference only; the live music is synthesized at runtime. |
| **`contra-boss-loop.wav`** | Listenable artifact — the 12.63s **boss** theme loop (darker, dominant-heavy). Same reference-only status. |
| **`contra-boss-enraged-loop.wav`** | Listenable artifact — the boss loop with phase-2 **enrage** intensity ON (hotter + double-time hats). |
| **`contra-stage2-loop.wav`** | Listenable artifact — the A-minor **Stage-2** "Cascade Base" theme loop (tenser/mechanical). |
| **`contra-boss2-loop.wav`** | Listenable artifact — the A-minor **Stage-2 boss** theme (chopper gunship; dominant-heavy, aerial menace). |
| **`SPECTROGRAM-ASSESSMENT.md` + `spectrograms/`** | **Multimodal (visual) fidelity check** — spectrograms of all four tracks, read directly (JUDGE BY LOOKING): confirms driving bass floor, dense regular rhythmic grid, balanced spectrum, no dead air, stage < boss < enraged density/heat, and a healthy distinct Stage-2. Structural grounding beyond the scalar metrics; not a substitute for a human listen. |
| **`verify/render-check.mjs`** | RUNS the sequencer in real Chromium via OfflineAudioContext and asserts, **for all four sections** (stage/boss/stage2/boss2): non-silence, seamless loop (no audible gap), no dead bar, ducks under hit-stop, deterministic — plus distinctness (boss shorter+D#-heavy; stage2 is A-minor, no F#; boss2 is A-minor G#-tension and dominant-heavier than stage2) and the scene-gate + enrage-intensity. Writes all 5 WAVs. |
| **`verify/headless-safety.mjs`** | Plain-node proof that constructing/driving `MusicKit` with no AudioContext never throws — so it can't break the deterministic headless self-tests. |
| **`verify/live-check.mjs`** | Boots the SHIPPED build (`game/serve.mjs`) in real Chromium and asserts the music is live end-to-end: self-test passes with music mounted; transport starts, `audio.duck()` engages, KeyM mutes; **the boss theme switches live** (real `world.boss.active` latch → `stage→boss`, holds, restart resumes `stage`); **the scene-gate cuts BGM on victory/death** (`sceneGain→0` on `'cleared'` and `'gameover'`, `→1` on restart); **the wiring is present in the served source** (duck/setSection/setPlaying call sites asserted by signature, drift-proof vs line numbers); **rapid state-churn is robust** (20 fast interleaved setPlaying/setSection/mute toggles — a player mashing restart — leave no stuck gain); **and the boss ENRAGE intensity engages live** (forcing `boss.enraged` lifts `musicGain` above base with `_intensity=true`, relaxes on restart); **plus a Stage-2 `?level=2` probe** that asserts the intended `stage2` theme and prints a ⏳ PENDING line until root.B wires it (tracks OI-A1; auto-flips to PASS on fix). The authoritative "it's actually wired and working" check. |
| **`verify/all.mjs`** | **One command for the whole layer** (`npm run verify:all`) — runs all four verifiers below in sequence (fast→slow) and reports a single consolidated PASS/FAIL (62 assertions). The verdict is each child's exit code. **`--json`** (`npm run verify:all:json`) emits a machine-readable `{layer,allPass,totalAssertions,verifiers[]}` line so a gate-scoring harness can consume the audio-layer verdict programmatically. Use this as the audio-layer gate. |
| **`verify/perf-soak.mjs`** | **Production-readiness soak** — runs sustained music (~20s) on the served build and **asserts** by measurement: FPS ≥55, no FPS degradation, transport stays running, scheduler on musical pace (not stalled/runaway), and **no heap growth** (early-vs-late-window JS heap ≤ +4 MB — the direct no-leak gate; reported UNAVAILABLE, never faked, if `performance.memory` is absent). Latest run: 60 fps flat, heap flat at 10.0 MB (Δ +0.00 MB), scheduler on-pace. 5/5. |

## Run it
```
node audio/verify/all.mjs               # ONE command → runs all 4 below; consolidated PASS/FAIL (62 assertions)
node audio/verify/render-check.mjs      # 34/34 PASS; stage+boss+stage2+boss2 render, scene-gate, enrage, distinctness + 5 WAVs
node audio/verify/headless-safety.mjs   # 5/5 PASS; no-ctx safety + section/scene/intensity logic (incl. stage2)
node audio/verify/live-check.mjs        # 18/18 PASS; music LIVE (boss switch + scene-gate + enrage) + wiring-in-source + churn robustness
node audio/verify/perf-soak.mjs         # 5/5 PASS; ~20s soak — FPS stable, heap flat (no leak, asserted), scheduler on-pace
```
All green this cycle (render numbers in TEARDOWN §3; live results in the Status block below).

## The one wiring call root.B needs
Copy `music.js` → `game/src/music.js`, then in `AudioKit`:
`this.music = new MusicKit(this.ctx, this.master)`, forward `resume()` / `toggleMute()`
to it, add `duck(active)`, and add one `audio.duck(world.feel.hitStop > 0)` line to the
main.js render loop. Full patch in **INTEGRATION.md**.

## ✅ REAL GENERATED PER-BIOME CAMPAIGN TRACKS (7/7) — the primary deliverable
**Real Udio-generated instrumental loops, one per campaign stage/biome** (via
`pipeline/generate-udio.py` → udioapi.pro/chirp-v4-5). These are the required *real
generated* audio — the procedural synth (`music.js`) is now only the fallback when a
track is still decoding or fails to load. Source of truth: `audio/tracks/`; served copy:
`game/assets/audio/`. The engine loads them (`MusicKit.loadTracks`/`useTrack`, added this
workstream) and **hard-cuts to each stage's biome loop** on stage change (`main.js`
`world.onStageChange`). `stage_id` order (`s<N>_`) === campaign stage index; `theme` ===
`game/data/config.js` THEMES id (confirmed against the real STAGES registry):

| stage | theme id | track file | key | status |
|---:|---|---|---|---|
| 1 | `jungle`   | `s1_jungle.mp3`   | E min  | generated |
| 2 | `cascade`  | `s2_cascade.mp3`  | A min  | generated |
| 3 | `snow`     | `s3_snow.mp3`     | C min  | generated |
| 4 | `desert`   | `s4_desert.mp3`   | D min  | generated |
| 5 | `foundry`  | `s5_foundry.mp3`  | G min  | generated |
| 6 | `caverns`  | `s6_caverns.mp3`  | F# min | generated |
| 7 | `fortress` | `s7_fortress.mp3` | B min  | generated |

Grounded by `pipeline/analyze-tracks.py` → `TRACK-ANALYSIS.md` (numpy/ffmpeg measurement
of the real files): all 7 are real/non-silent (RMS ≈ −12…−14 dB), each in a distinct key,
min pairwise timbre distance 0.017 (none identical), and every `theme` matches the campaign
stage order (7/7 OK). Regenerate/extend: `source ../../.provider_secrets.env && python3
audio/pipeline/generate-udio.py`; re-verify: `python3 audio/pipeline/analyze-tracks.py`.

**LIVE-VERIFIED in a real browser (`verify/campaign-tracks-live.mjs`, all-pass):** boots the
SHIPPED build (`game/serve.mjs`) in Chromium, fires the autoplay gesture, and asserts that
`wireCampaignMusic` fetched the manifest + **decoded all 7 mp3s** (`decodeAudioData`), then
drives every stage's selector (the exact `audio.useTrack(id)` call `world.onStageChange`
makes) and asserts the engine **hard-cuts to that biome's real loop** (`m.track===id`, its
`BufferSource` live, `trackGain` hot, the procedural synth silenced) — for all 7 stages —
and that `useTrack(null)` cleanly restores the synth fallback. `verify/track-handoff-check.mjs`
grounds the same handoff on the **source-of-truth `audio/music.js`** (loads it directly via
`verify/handoff-harness.html`, independent of the shipped copy). Both need `puppeteer-core`
(this layer's devDep) + a cached chrome-for-testing; run `npm run tracks:live` /
`npm run tracks:handoff` from `audio/`.

> 🔁 **OPEN NEED — re-sync `game/src/music.js` from `audio/music.js`.** This cycle added a
> `_stopTrackSource` hygiene fix (pins the stopped real-track bus's schedule to silence) to
> the source of truth. `game/src/music.js` (owned by the integrator, kept as a verbatim
> copy) must be re-synced (`cp audio/music.js game/src/music.js`) to carry it. Byte-safe: the
> served build's 7-track playback already passes today; this only tidies the sourceless-bus
> gain state. (Finding: the "trackGain lingers hot after useTrack(null)" I chased is a
> **headless-shell readback artifact on a sourceless GainNode**, not an audible defect — the
> bus emits silence regardless; verifiers now assert the audible contract, not that value.)

> Open need (parent to confirm): the boss fight currently keeps the stage's real biome
> loop (no per-biome *boss* track yet — confirmed: `onStageChange` fires only on stage
> change, so the boss inherits the stage loop by construction). If a distinct boss cue per
> stage is wanted, that's a follow-up generation pass — flag it and I'll produce boss loops.

## Status: LIVE ✅ (integrated by root.B, commit `89f6f80`)
The music is wired into the shipped build and **verified live end-to-end** by
`verify/live-check.mjs` (boots `game/serve.mjs` in real Chromium):
- self-test suite **80/80** with music mounted (determinism/headless intact),
  incl. root.B's new `audio.musicNoThrow` check;
- on the real served game: music mounted + `enabled`, AudioContext `running`, the
  transport starts on gesture (scheduler advances bars), `audio.duck(true)` engages
  ducking (→0.28×), and the **KeyM** path mutes it.

`audio/music.js` is the **source of truth**; `game/src/music.js` is a copy root.B
keeps in sync. This dir stays the staging home for the teardown, the WAV artifact,
and the three verifiers.

### ✅ Shipped: 16-bar A/B stage loop
root.B promoted the 16-bar A/B loop (~25.26s; heroic A theme + tension bridge with a
raised-7th B7 turnaround) into `game/src/music.js` (commit `643c582`). Live now.

### ✅ Shipped + LIVE-VERIFIED: BOSS theme + `setSection`
The second section — a tighter, darker 8-bar **boss** loop (dominant-heavy, ~1.5× the
D# leading-tone tension of the stage theme) plus the `setSection('stage'|'boss')` API —
is **live in the shipped build**. root.B re-synced `music.js` and hooked the render loop
to `world.bossActive` (commit `1fa8ecf`; `audio.setSection(...)` in main.js's frame loop). Verified end-to-end this cycle
by `live-check.mjs`: triggering the real `world.boss.active` latch cuts the live music
**stage→boss**, it **holds through the fight**, and a **restart resumes stage** — all via
the actual shipped render-loop wiring, not a stub.

### ✅ Shipped + LIVE-VERIFIED: cut music on game-over / victory (`setPlaying`)
**Original finding (ran the shipped build):** the stage march kept looping at full volume
under the game-over and **victory (`'cleared'`)** screens, fighting the existing
`gameover`/`clear` SFX stings — a real fidelity gap vs the corpus, which cuts BGM on
death/victory so the sting lands clean. Fix: `setPlaying(active)` scene-gate on `MusicKit`
(dedicated `sceneGain`) fades the music out when a run isn't in progress and back in on
restart (transport keeps running underneath; resume is instant). root.B wired it —
`game/src/audio.js` passthrough + `audio.setPlaying(world.status === 'playing')` in main.js's frame loop
(commit `437f1fe`). **Verified end-to-end on the shipped build** by `live-check.mjs` against
the REAL statuses: on `'cleared'` `sceneGain→0.04`, on `'gameover'` `→0.00`, and a restart
restores `→1.00`. (Note: victory is `'cleared'`, not `'won'` — the `=== 'playing'` hook is
deliberately status-name-agnostic, so it fades on every non-playing state regardless.)

### ✅ Shipped + LIVE-VERIFIED: boss phase-2 ENRAGE intensity (`setIntensity`)
The boss moves and **enrages at a phase-2 HP threshold** (`enemy.js`: `boss.enraged`, a stable
persistent flag). `setIntensity(active)` on `MusicKit` lifts the boss theme when enraged — a
hotter mix (×1.22) **and double-time hats** (a real arrangement change, not just volume,
proven offline in `render-check`: enraged hat/high-freq energy rises **beyond** the gain lift,
hiRatio 1.42 vs rmsRatio 1.22). root.B wired it — `game/src/audio.js` passthrough +
`audio.setIntensity(!!(world.boss && world.boss.enraged))` in main.js's play branch (commit
`8623f8d`). **Verified end-to-end on the shipped build** by `live-check.mjs`: forcing the boss
into `enraged` lifts the live `musicGain` above base (→0.25+) with `_intensity=true`, and a
restart relaxes it back to base. Matches the corpus's phase-2 boss music ramp. *(Whether it
subjectively feels like the right escalation is still a human-listen call — see below.)*

### ⚠️ Ready-when-Stage-2-ships: per-stage themes (`stage2` + `boss2`)
`content/stage2/` "Cascade Base" is a P0 second stage — **confirmed being built** (chopper
boss PR#221), not yet wired. The corpus gives each stage its own **stage AND boss** music,
so I added two A-minor sections grounded to `content/stage2/SPEC.md`:
- **`stage2`** — tenser/mechanical vs the E-minor Stage-1 march.
- **`boss2`** — for the aerial chopper GUNSHIP (dominant-heavy), in the **same key as
  `stage2`** so the Stage-2 stage→boss transition stays cohesive (playing the E-minor
  Stage-1 `boss` under an A-minor Stage-2 would clash keys).

Both verified real + **distinct** in `render-check` (tension-note discriminators: Stage-1
boss D#/E-minor vs `boss2` G#/A-minor; `boss2` more dominant-heavy than `stage2`) and
visually healthy (`spectrograms/{stage2,boss2}.png`). Enrage-intensity applies to `boss2`
too (section-independent), so the chopper's phase-2 strafing gets the lift for free.
**Dormant/byte-safe** — default non-boss section stays `'stage'`. Selector: `INTEGRATION.md`
Step 6 (a 2×2 stage-×-fight matrix). 🔴 **LIVE GAP (grounded by running `?level=2` this
cycle):** Stage-2 "Cascade Base" is now reachable in the shipped build, and it plays the
**Stage-1 E-minor music** (`music.section === 'stage'` under `world.level.name === 'Cascade
Base'`) — the key clash `stage2`/`boss2` exist to fix. Two root.B steps close it: (1) re-sync
`music.js` (shipped copy still lacks `stage2`/`boss2`), and (2) the 1-line selector, now
**grounded to the real shipped `main.js`**: `onStage2 = world.level === LEVEL2` (LEVEL2 is
already imported; `world.level` = `world.js:15` — works for `?level=2` now AND a future
world-swap). The stage-transition music is handled for free by the live-verified scene-gate.

## Real human signal (2026-07-10) — audio NOT in the rejection path
The creator played the live build (music included) to boss/clear and submitted a REJECT
(3/5) with **four items, all non-audio** (level theme, hero firing origin, tank turret
origin, boss movement). **Zero audio concerns.** See `CREATOR-FEEDBACK-RESPONSE.md` for the
full read + routing. Net: the music layer is not a gate blocker; the "subjective listen"
below is now downgraded from *unknown* to *no-complaint-from-a-full-playthrough*.

## Remaining / optional
- **root.C** (open): keep runtime synthesis (nothing to ship — recommended: zero asset
  weight, deterministic, passes verification) vs. adopt a pre-rendered track under
  `game/assets/audio/`. No blocker either way; the live music is synthesized at runtime.
- **Targeted subjective listen** (open, human — LOW priority now): the creator raised no
  audio issue over a full playthrough, so gross problems are ruled out; and the
  **spectrogram assessment** (`SPECTROGRAM-ASSESSMENT.md`, this cycle) visually confirms the
  arrangement is structurally healthy (driving bass, dense grid, balanced spectrum, no dead
  air) — so we now have both a scalar AND a visual bill of health. What neither can settle
  is *musical taste* (catchy melody / pleasing harmony). Only a *targeted* human listen
  ("rate the stage/boss themes 1-5, say what feels off") would push the music from "fine"
  toward "memorable highlight". Until then the composition stays as-is (grounded to the
  arcade Stage-1 march, `TEARDOWN.md`); do NOT speculatively re-compose.

## Assumptions — now CONFIRMED by parent + live run
- `AudioKit` exposes `this.ctx`/`this.master` and `resume()`/`toggleMute()`/`this.muted`
  as used — CONFIRMED (parent) and exercised live.
- `world.feel.hitStop` is a truthy-when-frozen frame counter for `duck(active)` —
  CONFIRMED (parent), and main.js's frame loop calls `audio.duck(world.feel.hitStop > 0)`.
- Placement in `game/src/` makes it reachable from `game/index.html` — CONFIRMED: the
  copy now lives at `game/src/music.js` and `live-check.mjs` boots it from the served
  build.
