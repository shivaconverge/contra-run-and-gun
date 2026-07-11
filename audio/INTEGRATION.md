# Integration spec — wire the stage music LIVE (hand-off to root.B)

> ✅ **APPLIED by root.B (commit `89f6f80`).** The wiring is done and verified live —
> `AudioKit` mounts MusicKit, main.js's frame loop ducks it (`audio.duck(...)`), and `selftest.js` gained
> `audio.musicNoThrow`. Confirmed end-to-end by `audio/verify/live-check.mjs`
> (6/6, self-test 80/80). The steps below are the record of exactly what was wired.
>
> 🔁 **RE-SYNC (16-bar A/B): DONE** — root.B promoted `audio/music.js` → `game/src/music.js`
> in commit `643c582`; the shipped build now plays the 16-bar A/B loop.
>
> 🎛️ **BOSS THEME + `setSection`: DONE & LIVE-VERIFIED.** root.B re-synced `music.js` and
> wired the Step 3 hook — `game/src/audio.js` (`setSection` passthrough) + main.js's frame loop
> (`audio.setSection(world.bossActive && world.boss && !world.boss.dead ? 'boss':'stage')`)
> — in commit `1fa8ecf`. `live-check.mjs` now proves it end-to-end on the served build:
> the live music cuts **stage→boss** on the real boss-active latch, holds through the fight,
> and resumes **stage** on restart. Staging still gates both themes 14/14. Step 3 below is
> the record of what was wired.

`audio/music.js` is a **drop-in** for the game's audio layer. root.B owns
`game/src/audio.js` + `game/src/main.js`; below is the exact, minimal patch to make
the music play. It's ~7 lines of real change and touches determinism/headless nowhere
(the sim never calls music; no-ctx = silent no-op — proven by
`audio/verify/headless-safety.mjs`).

## Step 0 — place the module in the SHIPPED reachable graph
Copy `audio/music.js` → **`game/src/music.js`** (verbatim). It MUST live under `game/src/`
so it's reachable from `game/index.html` and counted in the shipped build the release
gate scores. (Optional: the listenable `audio/contra-stage-loop.wav` is a reference
artifact only — the live music is synthesized at runtime, so no asset needs to ship. If
you'd rather ship a pre-rendered track instead of the synth, that's a root.C call on
`game/assets/audio/` — flagged below.)

## Step 1 — `game/src/audio.js` (merge MusicKit into AudioKit; 4 edits)

```js
// (a) top of file
import { MusicKit } from './music.js';

// (b) in the constructor, right after `this.enabled = true;` (ctx + master exist):
    this.music = new MusicKit(this.ctx, this.master); // shares the one AudioContext

// (c) in resume() — after the existing ctx.resume(), also arm the loop:
    if (this.music) this.music.resume();  // starts music on the same user gesture

// (d) in toggleMute() — keep the music in sync with KeyM:
    if (this.music) this.music.setMuted(this.muted); // add before `return this.muted;`

// (e) NEW one-line method so main.js can duck under hit-stop:
    duck(active) { if (this.music) this.music.duck(active); }
```

## Step 2 — `game/src/main.js` (ONE new line)

In the render loop's play branch, right after
`for (const ev of world.drainSfx()) audio.play(ev);`:

```js
      audio.duck(world.feel.hitStop > 0); // dip music while the sim is hit-stop-frozen
```

## Step 3 — Boss theme (NEW this cycle; optional, +2 lines)

Hard-cut to the menacing boss loop when the boss arena is live, back to the stage theme
otherwise. `world.bossActive` is set true when the arena is entered; `world.boss.dead`
flips on defeat (both read from `game/src/world.js:45-46,181`). `setSection` is
idempotent + queues to the next downbeat, so calling it every frame is cheap and glitch-free.

```js
// (f) game/src/audio.js — passthrough next to duck():
    setSection(name) { if (this.music) this.music.setSection(name); }

// (g) game/src/main.js — in the play branch, right after the audio.duck(...) line:
      audio.setSection(world.bossActive && world.boss && !world.boss.dead ? 'boss' : 'stage');
```

Result: stage theme during the run → clean downbeat cut to the boss theme when the arena
wakes → back to stage on victory. Skipping this hook is safe: the code ships dormant and
the game keeps playing the stage loop exactly as it does today.

## Step 4 — Cut music on game-over / victory (NEW this cycle; optional, +2 lines)

> ✅ **APPLIED & LIVE-VERIFIED (acceptance wire).** root promoted the sceneGain build
> `audio/music.js` → `game/src/music.js`, added the `setPlaying` passthrough at
> `game/src/audio.js` (next to `duck`/`setSection`), and the every-frame hook at
> `game/src/main.js` (right after `render(...)`, so it covers the frozen title too).
> Grounded in the REAL rAF build by `playtest/e2e/music-wire-check.mjs`: during a run
> `sceneGain≈1`; on `status='gameover'` it fades to `~0.0001` (`_playing=false`) so the
> `gameover`/`clear` sting lands clean; on restart it fades back to `1`. 13/13 live,
> full playthrough 64/64.

> ✅ **APPLIED by root.B (commit `437f1fe`)** and independently re-verified this cycle on
> the shipped build against the REAL statuses: `sceneGain` `0.04` on victory (`'cleared'`),
> `0.00` on `'gameover'`, `1.00` after restart (`audio/verify/live-check.mjs`, 12/12).

GROUNDED FINDING (ran the shipped build): the stage march kept looping at full volume under
the **game-over** and **victory** screens, fighting the existing `gameover`/`clear` SFX
stings. The corpus cuts the BGM on death/victory so the sting lands clean. `setPlaying`
fades the music out when a run isn't in progress and back in when play resumes (transport
keeps running underneath, so resume is instant). Idempotent; default is `playing=true`, so
a plain re-sync with no hook changes nothing.

> ⚠️ STATUS NAMES: the game's states are `title | playing | cleared | gameover` — **victory
> is `'cleared'`, not `'won'`.** The hook below is `=== 'playing'`, i.e. deliberately
> name-agnostic: it fades on EVERY non-playing state (title, cleared, gameover), so it stays
> correct no matter how the victory/death states are named.

```js
// (h) game/src/audio.js — passthrough next to duck()/setSection():
    setPlaying(active) { if (this.music) this.music.setPlaying(active); }

// (i) game/src/main.js — run EVERY frame (put it right after render(...) so it also
//     covers the title screen, which the play branch skips):
    audio.setPlaying(world.status === 'playing');
```

Result: music plays only while a run is live → fades out under game-over / victory
(`'cleared'`) so the sting reads clean → fades back in on restart. (Now LIVE.)

## Step 5 — Boss phase-2 ENRAGE intensity (NEW this cycle; optional, +2 lines)

The boss now moves and **enrages at a phase-2 HP threshold** (`enemy.js`: `boss.enraged`
flips true and persists). The corpus ramps the music when a boss enters phase 2.
`setIntensity(active)` gives the boss theme a hotter mix (×1.22) **and double-time hats**
(a real arrangement change, not just louder) — verified in `render-check`: enraged render's
high-freq (hat) energy rises well beyond the gain lift. Default **OFF**, so a plain re-sync
with no hook changes nothing.

```js
// (j) game/src/audio.js — passthrough next to duck()/setSection()/setPlaying():
    setIntensity(active) { if (this.music) this.music.setIntensity(active); }

// (k) game/src/main.js — in the play branch, right after the audio.setSection(...) line:
      audio.setIntensity(!!(world.boss && world.boss.enraged));
```

Result: when the boss crosses into phase 2, the boss theme audibly kicks up a gear;
it relaxes back if the boss ever de-enrages (it doesn't in current design, so it just
holds through the finale). Skipping it is safe (ships dormant, boss theme unchanged).

## Step 6 — Per-stage themes for STAGE 2 (ready-when-Stage-2-ships, +1 selector)

The corpus gives **each stage its own music — stage AND boss**. Two new sections are now
in `MusicKit`, both grounded to `content/stage2/SPEC.md`:
- `'stage2'` — an **A-minor** "Cascade Base" theme (tenser/mechanical vs the E-minor
  Stage-1 jungle march).
- `'boss2'` — an **A-minor** theme for the **chopper GUNSHIP** boss (dominant-heavy,
  aerial menace) — in the SAME key as `stage2` so the Stage-2 stage→boss transition stays
  cohesive, exactly like Stage-1's `stage`(Em)→`boss`(Em). (Playing the E-minor Stage-1
  `boss` under an A-minor Stage-2 would clash keys.)

Verified in `render-check`: both are real/seamless/ducking/deterministic and distinct by
tension-note (Stage-1 boss is D#/E-minor; `boss2` is G#/A-minor; `boss2` is more
dominant-heavy than `stage2`). **Dormant until wired** — default non-boss stays `'stage'`.

> 🔴 **LIVE GAP (grounded by running `?level=2` this cycle):** Stage-2 "Cascade Base" is
> now reachable in the shipped build (`main.js` imports `LEVEL2` + the `?level=2` boot), and
> it plays the **Stage-1 E-minor music** (`__audio.music.section === 'stage'` on
> `world.level.name === 'Cascade Base'`) — the A-minor-stage-under-E-minor-music key clash
> these themes exist to fix. Not a defect in my code; it needs root.B's two steps below.
> Repro: serve `game/`, open `/?level=2`, press Space, read `window.__audio.music.section`.

**Grounded to the ACTUAL shipped `main.js` (verified live this cycle):** `main.js:72` binds
`const LEVEL = params.get('level')==='2' ? LEVEL2 : LEVEL1`, and `World` stores it as
`world.level` (`world.js:15`). So the "current stage" signal is simply **`world.level === LEVEL2`**
— `LEVEL2` is already imported (`main.js:6`), and `world.level` tracks the current level for
BOTH the `?level=2` boot (live now) AND a future auto-transition world-swap (WIRE.md §5,
still proposed). Make the existing `setSection` call a 2×2 stage-×-fight matrix:

```js
// game/src/main.js — replace the existing setSection line (~line 268).
      const inBoss   = world.bossActive && world.boss && !world.boss.dead;
      const onStage2 = world.level === LEVEL2;   // LEVEL2 already imported; world.level = world.js:15
      audio.setSection(onStage2 ? (inBoss ? 'boss2' : 'stage2') : (inBoss ? 'boss' : 'stage'));
```

Plus re-sync `music.js` (the shipped `game/src/music.js` still lacks `stage2`/`boss2`):
`cp audio/music.js game/src/music.js`. Byte-safe — the four new sections are dormant until
the selector above picks them.

**The stage TRANSITION music is handled for FREE by the existing scene-gate** (Step 4,
live-verified): on `'clear'` the music fades out so the clear sting lands; the new
`World(LEVEL2)` boots at `status:'playing'` → scene-gate fades back in and `setSection`
picks `stage2`. So Stage-1 → interstitial → Stage-2 music "just works" — no extra wiring.
Minor edge (honest): section switches are downbeat-quantized (≤1 bar ≈1.6 s), so for up
to ~1.6 s of the Stage-2 fade-in you could hear the Stage-1 section before `stage2` locks
on the next downbeat. Usually masked by the interstitial + the 0.12 s fade-in. If you want
a **crisp hard cut** on the swap instead, ask and I'll add a `setSection(name, {now:true})`
immediate-apply option to `MusicKit` (small, byte-safe) — I've left it out to avoid
building on the not-yet-wired transition.

Note: the chopper is `isBoss:true` with `enrageAt:0.4` (SPEC §4), so the existing
`audio.setIntensity(world.boss.enraged)` hook (Step 5) already lifts `boss2` on the
chopper's phase-2 strafing — no extra wiring; enrage is section-independent.

⚠️ Still root.B's to own: adding `stageIndex`/`STAGES` + the transition (WIRE.md §5 is
PROPOSED/untested) and re-syncing `music.js` (which now carries `stage2`/`boss2`). Both
themes are ready + byte-safe now; the selector above is a 1-line drop-in once `stageIndex`
exists. When it lands, drive Stage-2 and confirm `stage2`/`boss2` play (add a live-check
block mirroring the Stage-1 boss-switch check).

That's the whole wiring. Result:
- **Loops** continuously once audio resumes (seamless, verified 22 ms max gap).
- **Boss theme** (if Step 3 wired): distinct darker 8-bar loop under the boss fight.
- **Resume-on-gesture**: already handled — `audio.resume()` (main.js keydown) now also
  starts the music, so it respects the browser autoplay gate exactly like SFX do.
- **Mute via KeyM**: already handled — `audio.toggleMute()` (main.js keydown) now mutes
  music too.
- **Ducks under hit-stop**: the new `audio.duck(...)` line drops music to ~29% during
  the freeze frames on kills/hits, then restores.

## Notes / knobs
- Music level defaults to `0.22` (sits under SFX). Change via
  `new MusicKit(this.ctx, this.master, { gain: 0.2, duckAmount: 0.28 })`.
- If you'd prefer music to **stop on the title / game-over** and restart on `start()`,
  call `audio.music.stop()` / `audio.music.start()` on those transitions — optional; the
  default is a continuous loop, which matches arcade Contra.
- `audio.synthNoThrow` in `selftest.js` constructs `new AudioKit()` and plays every
  event with no AudioContext; MusicKit is built the same way, so that test stays green
  (confirmed by `audio/verify/headless-safety.mjs`). No new self-test is required, but
  you may add `new MusicKit(); m.start(); m.duck(true); m.stop();` to it for belt-and-braces.

## Verify after wiring
```
node audio/verify/render-check.mjs     # music renders, loops, ducks, deterministic
node audio/verify/headless-safety.mjs  # no-ctx = silent no-op, never throws
# then your usual: game headless self-test + QA gate should be unchanged
```
