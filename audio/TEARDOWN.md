# Stage-music teardown — what the Contra lineage sounds like, and what we built

Grounding for the BGM in `music.js`. The goal (per GOAL) is a looping stage track a
player recognises as *arcade run-and-gun* and that captures the nostalgic feel of the
original Contra. This documents the **musical character** the corpus shares, where that
character is grounded, and the exact choices `music.js` makes to hit it.

> Honesty note on grounding: the frame corpus under `reference/frames/` is **visual**
> (gameplay screengrabs for cadence/fidelity) — there are no soundtrack audio files in
> the repo, and UDIO_API_KEY was not reachable this cycle. So this teardown is grounded
> in the **documented, well-known musical character** of these titles (tempo class,
> instrumentation, harmonic/rhythmic idiom), not in a fresh spectral analysis of their
> audio. Where a number is our own measurement it is marked `[measured]`; where it is a
> characterisation of the reference it is marked `[reference-character]`. The one thing
> fully measured here is OUR track (see `verify/render-check.mjs`).

## 1. The corpus's shared stage-music DNA `[reference-character]`

| Title (era) | Stage-music character that defines the feel |
|---|---|
| **Contra (Arcade/NES, 1987)** — the anchor | Fast, martial, **relentless** driving pulse. Stage-1 "Jungle" theme: brisk tempo (~150 BPM feel), a **galloping bass** under a **heroic minor-key melody**, non-stop 16th-note motion, an 8–16 bar loop that never rests. This is the nostalgia target. |
| **Blazing Chrome (2019)** | Deliberately retro synth/metal homage — same relentless drive, heavier low end, minor-key heroics. Modern production, 16-bit-era arrangement. |
| **Huntdown (2020)** | Synthwave/action score — pulsing arpeggios, driving bass, cinematic but still loop-forward. |
| **Gunslugs / Gunslugs 2** | Chiptune-forward, fast and punchy, arcade-loop structure. |
| **Contra: Operation Galuga (2024) / Contra Returns (mobile)** | Re-orchestrated Contra themes — the SAME galloping-bass + heroic-lead DNA, higher-fidelity instruments. Confirms the 1987 idiom is still the franchise's musical identity. |

**The five invariants the whole corpus shares:**
1. **Tempo class** — fast, ~140–160 BPM. Music is a *metronome for the run*.
2. **Driving bassline** — constant 8th/16th-note motion (the "gallop"); it never sits still.
3. **March feel** — a strong, regular downbeat with backbeat percussion; propulsive, forward.
4. **Heroic minor key** — minor tonality with major-chord lifts (VI/III) = "heroic, not sad".
5. **Short seamless loop** — 8–16 bars, loops with no gap; you stop *noticing* it starts over.

**A sixth trait: the boss-theme hard-cut `[reference-character]`.** Every game in the
corpus swaps the stage theme for a **distinct, more intense/menacing boss track** the
moment the boss fight starts — usually a hard cut on a downbeat, tighter loop, heavier
dominant/chromatic tension. That intensity shift is one of the most recognisable audio
moments in the lineage, so we build it too (see §2 BOSS).

**A seventh trait: the BGM stops for the punctuation `[reference-character]`.** The stage
loop does **not** keep grinding under a death or a stage-clear — the corpus cuts (or hard-
ducks) the music so the **game-over sting** / **victory fanfare** lands in relief. A
relentless loop under "GAME OVER" reads as a bug, not a march. We model this with the
`setPlaying` scene-gate (see §2) — the music fades out whenever a run isn't in progress
and fades back in on restart, letting the existing `gameover`/`clear` SFX cues breathe.

## 2. What we built (`music.js`) and how each choice maps back

An original **16-bar A/B loop** (**not a transcription** — avoids copyright, still hits
the idiom), NES-voiced (2 pulse + triangle + noise = the 2A03 chip Contra actually used).

| Corpus invariant | `music.js` choice |
|---|---|
| Tempo class ~140–160 | **152 BPM**, 4/4, 16th-note grid `[measured]` loop = 25.26s |
| Driving bassline | **Triangle gallop**: root–root–octave–fifth ×2 per bar, steady 8ths |
| March feel | **Noise drum kit**: kick on 1 & 3, snare on 2 & 4, hats on every off-beat 8th |
| Heroic minor key | **E minor**. **A** (bars 1-8): `i VI III VII …` (Em C G D) — the VI/III/VII major lifts are the "heroic". **B** (bars 9-16): a bridge that lifts to the relative major (C/G), climbs iv→v (Am/Bm), then slams back on a **B7 with a raised-7th D# leading tone** `[measured]` — the harmonic-minor pull that screams "resolve to Em" and kicks the loop over. |
| Multi-phrase (not a vamp) | **16 bars / A-B form**, not an 8-bar loop — the corpus's stage themes are multi-phrase; a single 8-bar vamp reads as "cheap". Doubling to ~25s roughly halves how often the ear clocks the repeat. |
| Seamless loop | Bars scheduled on absolute times so the downbeat lands exactly on the loop point (verified: 22 ms max silence anywhere across two loops). |
| Chip authenticity | **2 pulse voices**: a syncopated heroic lead + a 16th-note triad **arpeggio** (the shimmering NES drive) |
| Boss-theme hard-cut | **BOSS section** — a tighter, darker **8-bar** loop in the same key/tempo/kit (so the switch is a clean downbeat cut). Dominant-heavy: **B7 lands on bars 4 & 8** and the raised-7th **D#** recurs through the lead for unresolved menace; the lead sits lower/angular. Selected at runtime via `setSection('boss')` when the boss arena is live. |
| BGM stops for punctuation | **`setPlaying` scene-gate** — a dedicated gain stage that fades the music out on title / game-over / victory and back in on restart, so the `gameover`/`clear` SFX sting isn't buried under a relentless loop. Composes independently of mute (KeyM) and hit-stop duck. |
| Phase-2 boss ramp | **`setIntensity` enrage lift** — when the boss crosses its phase-2 HP threshold (`boss.enraged`), the boss theme gets a hotter mix (×1.22) **and double-time hats** (a real arrangement change, verified via first-difference/high-pass energy rising beyond the gain lift). The corpus escalates the music for the boss's second phase; this is that "it just got serious" moment. Default OFF (byte-safe). |
| Per-stage themes (stage + boss) | The corpus gives every stage its own **stage AND boss** music. Two A-minor sections stand ready for Stage-2 ("Cascade Base", `content/stage2/SPEC.md`): **`stage2`** (tenser/mechanical vs the E-minor Stage-1 march) and **`boss2`** (dominant-heavy, for the aerial chopper GUNSHIP). Both in A minor so the Stage-2 stage→boss transition stays key-cohesive (like Stage-1's Em→Em). Verified distinct by tension-note: Stage-1 boss is D#/E-minor, `boss2` is G#/A-minor; `boss2` is more dominant-heavy than `stage2`. Same 152 BPM / kit; enrage-intensity applies to `boss2` too. Dormant until root.B wires the stage-×-fight selector (INTEGRATION Step 6). |

## 3. What we MEASURED on our own track `[measured]`

From `node audio/verify/render-check.mjs` (real OfflineAudioContext render of the exact
synth graph — not a code read):

- **It is music, not a tone/noise.** FFT of bar 1 (Em) shows energy concentrated on the
  E-minor scale — tonic **E dominant across octaves (E2/E3/E4)**, ~2–3× the off-scale
  reference. Pitched, tonal, key-centered.
- **Relentless (march feel).** Per-bar RMS stays strong across all 16 bars
  (0.0150–0.0169, the B-section bridge peaks slightly hotter at its climax) — **no dead
  bar**, the drive never lets up.
- **The bridge is real tonal music, not filler.** FFT of bar 10 (G) shows G-major
  content dominant; at bar 16's leading-tone beat the **raised-7th D#5 is the dominant
  lead pitch (~26× the natural D)** — the intended harmonic-minor tension actually renders.
- **The boss theme is real AND distinct, not a re-label.** It clears all six quality gates
  (non-silence, seamless, no dead bar, ducks, deterministic) in its own right, and is
  measurably different from the stage theme: a **shorter 12.63s loop** and **~1.5× the D#
  dominant-tension energy** (0.010 vs 0.006, normalised) — the deliberate "menace"
  signature. Both are rendered and gated by `verify/render-check.mjs` (14/14).
- **Seamless loop.** The downbeat lands with force at the loop point (post-seam RMS
  0.041) and the longest near-silent run anywhere in two full loops is **22 ms**
  (inaudible). No gap, no click.
- **Ducks under hit-stop.** With duck engaged, level drops to **29%** — the music gets
  out of the way when the game freezes on a kill/hit.
- **Deterministic & headless-safe.** Two renders match within audio-negligible tolerance;
  with no AudioContext every method is a silent no-op (`verify/headless-safety.mjs`), so
  it cannot perturb the deterministic sim or the headless self-tests.

## 4. The subjective gap (declared)

A headless loop cannot *listen*. The numbers above prove structure, tonality, loop
integrity, and ducking — they do **not** prove it *sounds good*. That is a human
judgment. The listenable artifact `audio/contra-stage-loop.wav` (one 25.26s loop) exists
precisely so a human (or root.B on integration) can play it and make that call. If it
reads as thin or off-feel on a listen, that is a real finding — log it and re-tune the
note tables in `music.js §Composition data`; the verification harness stays valid.
