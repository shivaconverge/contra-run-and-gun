// MusicKit — deterministic WebAudio chiptune BGM sequencer (drop-in for game/src/audio.js).
//
// WHY THIS EXISTS: the slice has procedural SFX (AudioKit) but NO looping stage
// music — the single biggest missing sensory layer vs the corpus (every Contra-like
// runs a driving looped stage theme). UDIO_API_KEY was not reachable this cycle, so
// this is REAL synthesized music (an original NES-voiced march loop), not a
// placeholder tone: 2 pulse voices (heroic lead + chord arpeggio), a triangle
// gallop bass, and a noise drum kit — the classic 2A03 arrangement. See TEARDOWN.md
// for the corpus grounding behind the tempo / bassline / march-feel choices.
//
// DESIGN CONTRACT (so it composes with AudioKit and stays headless/determinism-safe):
//   * The sim NEVER calls this — music is a LIVE-only presentation layer, driven by
//     the render loop, exactly like AudioKit. No sim state is read or written, so
//     determinism + headless self-tests are untouched.
//   * Constructing it with no/blocked AudioContext is a silent no-op (never throws).
//   * Note scheduling is a PURE function of an absolute start time, so the SAME code
//     path renders live (lookahead scheduler) AND offline (OfflineAudioContext) —
//     that's what verify/render-check.mjs actually runs to prove it loops + ducks.
//
// Signal graph:  [per-note osc]→[per-note env] → musicGain → duckGain → sceneGain → destination
//   musicGain : master music level + mute (KeyM, shared with AudioKit)
//   duckGain  : hit-stop ducking (quick transient dip)
//   sceneGain : run-active gate — fades music out on title/gameover/victory so the
//               'gameover'/'clear' SFX stings land clean (setPlaying); all three
//               compose independently (mute × duck × scene).

// ---- Composition data -------------------------------------------------------
// TWO sections in E minor @ 152 BPM, 4/4 — same tempo & drum kit so switching
// between them is a clean downbeat cut, not a jarring stop/start:
//   * STAGE — a 16-bar A/B loop: heroic forward-driving march (A) + tension bridge (B).
//   * BOSS  — a tighter, darker 8-bar loop: menacing, dominant-heavy (repeated B7 with
//     the raised-7th D#), lower/angular lead. The corpus hard-cuts to a distinct boss
//     theme on the intensity spike; this is that theme. Selected via setSection('boss').
// Original compositions (not transcriptions) that capture the corpus's character; see
// TEARDOWN.md.
const BPM = 152;
const STEPS_PER_BAR = 16;          // 16th-note grid

// note name -> frequency (equal temperament, A4=440)
const A4 = 440;
const SEMI = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };
function hz(name) {
  const m = /^([A-G]#?)(\d)$/.exec(name);
  if (!m) return 0;
  const semis = SEMI[m[1]] + (parseInt(m[2], 10) - 4) * 12;
  return A4 * Math.pow(2, semis / 12);
}

// 16-bar A/B song form (not an 8-bar vamp — the corpus's stage themes are multi-
// phrase, so a single short loop reads as "cheap"). A (bars 1-8): the heroic Em
// theme. B (bars 9-16): a tension-building bridge that lifts toward the relative
// major (C/G), climbs through iv/v, and slams back on a B7 with a raised-7th (D#)
// leading tone that pulls hard into Em bar 1 — the classic run-and-gun "here comes
// the next wave" release. Doubling the loop to ~25s roughly halves how often the
// ear notices the repeat.
//
// Chord per bar: [root note for the bass gallop, triad notes for the arpeggio].
const STAGE_CHORDS = [
  // --- A: heroic theme (i VI III VII …) ---
  { bass: 'E2', triad: ['E4', 'G4', 'B4'] }, // 1  Em
  { bass: 'C2', triad: ['C4', 'E4', 'G4'] }, // 2  C
  { bass: 'G2', triad: ['G3', 'B3', 'D4'] }, // 3  G
  { bass: 'D2', triad: ['D3', 'F#3', 'A3'] }, // 4  D
  { bass: 'E2', triad: ['E4', 'G4', 'B4'] }, // 5  Em
  { bass: 'C2', triad: ['C4', 'E4', 'G4'] }, // 6  C
  { bass: 'D2', triad: ['D3', 'F#3', 'A3'] }, // 7  D
  { bass: 'E2', triad: ['E4', 'G4', 'B4'] }, // 8  Em (A cadence)
  // --- B: bridge — lift to rel. major, build, resolve on the dominant ---
  { bass: 'C2', triad: ['C4', 'E4', 'G4'] },  // 9  C   (VI, opens brighter)
  { bass: 'G2', triad: ['G3', 'B3', 'D4'] },  // 10 G   (III / rel. major)
  { bass: 'A2', triad: ['A3', 'C4', 'E4'] },  // 11 Am  (iv)
  { bass: 'B2', triad: ['B3', 'D4', 'F#4'] }, // 12 Bm  (v)
  { bass: 'C2', triad: ['C4', 'E4', 'G4'] },  // 13 C   (VI)
  { bass: 'D2', triad: ['D3', 'F#3', 'A3'] }, // 14 D   (VII)
  { bass: 'A2', triad: ['A3', 'C4', 'E4'] },  // 15 Am  (iv)
  { bass: 'B2', triad: ['B3', 'D#4', 'F#4'] }, // 16 B7  (V, raised 7th → slams to Em)
];

// Lead melody, per bar, as [noteName, durationInSteps]. Durations sum to 16/bar.
const STAGE_LEAD = [
  // --- A ---
  [['E5', 4], ['G5', 2], ['F#5', 2], ['E5', 4], ['B4', 4]],
  [['C5', 4], ['E5', 2], ['D5', 2], ['C5', 4], ['G4', 4]],
  [['D5', 4], ['G5', 2], ['F#5', 2], ['G5', 4], ['B5', 2], ['A5', 2]],
  [['A5', 4], ['F#5', 4], ['D5', 4], ['A4', 2], ['A4', 2]],
  [['E5', 2], ['F#5', 2], ['G5', 4], ['B5', 4], ['E5', 4]],
  [['G5', 2], ['E5', 2], ['C5', 4], ['D5', 4], ['E5', 4]],
  [['F#5', 4], ['A5', 4], ['D6', 4], ['A5', 2], ['F#5', 2]],
  [['E5', 4], ['B4', 4], ['E5', 2], ['D5', 2], ['B4', 4]],
  // --- B: soaring first half, descending tension run into the B7 ---
  [['E5', 4], ['G5', 4], ['C6', 4], ['B5', 2], ['A5', 2]],
  [['B5', 4], ['D6', 4], ['B5', 4], ['G5', 2], ['D5', 2]],
  [['C6', 4], ['A5', 4], ['E5', 4], ['A5', 2], ['C6', 2]],
  [['B5', 4], ['F#5', 4], ['D5', 4], ['B4', 2], ['F#5', 2]],
  [['E5', 2], ['G5', 2], ['C6', 4], ['A5', 4], ['G5', 4]],
  [['F#5', 4], ['A5', 4], ['D6', 4], ['A5', 2], ['F#5', 2]],
  [['E5', 4], ['A5', 4], ['C6', 4], ['B5', 2], ['A5', 2]],
  [['B5', 4], ['A5', 2], ['G5', 2], ['F#5', 4], ['D#5', 4]], // D# leading tone → Em
];

// BOSS — 8-bar loop. Dominant-heavy (B7 lands on bars 4 & 8), lower/angular lead with
// the raised-7th D# recurring for unresolved menace. Same tempo/drums as STAGE so the
// switch is a clean downbeat cut.
const BOSS_CHORDS = [
  { bass: 'E2', triad: ['E4', 'G4', 'B4'] },   // 1  Em
  { bass: 'E2', triad: ['E4', 'G4', 'B4'] },   // 2  Em (pedal)
  { bass: 'C2', triad: ['C4', 'E4', 'G4'] },   // 3  C
  { bass: 'B2', triad: ['B3', 'D#4', 'F#4'] }, // 4  B7  (dominant tension)
  { bass: 'E2', triad: ['E4', 'G4', 'B4'] },   // 5  Em
  { bass: 'G2', triad: ['G3', 'B3', 'D4'] },   // 6  G
  { bass: 'A2', triad: ['A3', 'C4', 'E4'] },   // 7  Am
  { bass: 'B2', triad: ['B3', 'D#4', 'F#4'] }, // 8  B7  (unresolved → loops back menacing)
];
const BOSS_LEAD = [
  [['E4', 2], ['B4', 2], ['E5', 4], ['D#5', 4], ['B4', 4]],
  [['E5', 2], ['G5', 2], ['F#5', 2], ['E5', 2], ['D#5', 4], ['B4', 4]],
  [['C5', 4], ['G4', 2], ['E4', 2], ['C5', 4], ['G4', 4]],
  [['B4', 4], ['D#5', 4], ['F#5', 4], ['B4', 2], ['F#5', 2]],
  [['E5', 2], ['D#5', 2], ['E5', 2], ['F#5', 2], ['G5', 4], ['E5', 4]],
  [['D5', 4], ['G5', 4], ['B5', 4], ['A5', 2], ['G5', 2]],
  [['C5', 2], ['E5', 2], ['A5', 4], ['E5', 4], ['C5', 4]],
  [['B5', 4], ['A5', 2], ['G5', 2], ['F#5', 4], ['D#5', 4]],
];

// STAGE 2 — "Cascade Base" (content/stage2/SPEC.md): a bridge-over-water industrial
// base, tenser + more mechanical than the heroic Stage-1 jungle march. In **A minor**
// (a 4th up from Stage-1's E minor) for a clear key-contrast, with an insistent pedal-ish
// bass and a G#-leading-tone tension over the E-major dominant. Same 152 BPM / drum kit
// so switching stages is cohesive; distinct via key + angular melody, not tempo.
const STAGE2_CHORDS = [
  { bass: 'A2', triad: ['A3', 'C4', 'E4'] },   // 1  Am  (tonic pedal)
  { bass: 'A2', triad: ['A3', 'C4', 'E4'] },   // 2  Am
  { bass: 'F2', triad: ['F3', 'A3', 'C4'] },   // 3  F   (VI)
  { bass: 'G2', triad: ['G3', 'B3', 'D4'] },   // 4  G   (VII)
  { bass: 'A2', triad: ['A3', 'C4', 'E4'] },   // 5  Am
  { bass: 'F2', triad: ['F3', 'A3', 'C4'] },   // 6  F
  { bass: 'E2', triad: ['E3', 'G#3', 'B3'] },  // 7  E   (V, raised-7th G# tension)
  { bass: 'E2', triad: ['E3', 'G#3', 'B3'] },  // 8  E   (unresolved → slams back to Am)
];
const STAGE2_LEAD = [
  [['A4', 4], ['C5', 2], ['B4', 2], ['A4', 4], ['E4', 4]],
  [['A4', 2], ['B4', 2], ['C5', 2], ['D5', 2], ['E5', 4], ['C5', 4]],
  [['F5', 4], ['E5', 2], ['D5', 2], ['C5', 4], ['A4', 4]],
  [['G4', 4], ['B4', 2], ['D5', 2], ['G5', 4], ['D5', 4]],
  [['A4', 4], ['C5', 2], ['B4', 2], ['A4', 4], ['E5', 4]],
  [['C5', 2], ['A4', 2], ['F4', 4], ['A4', 4], ['C5', 4]],
  [['G#4', 4], ['B4', 4], ['E5', 4], ['B4', 2], ['G#4', 2]], // G# leading tone
  [['B4', 4], ['A4', 2], ['G#4', 2], ['E4', 4], ['B4', 4]],
];

// STAGE-2 BOSS — the `chopper` GUNSHIP (content/stage2/SPEC.md §4): a MOVING aerial
// attack helicopter. In **A minor** so it's key-cohesive with the Stage-2 theme (the way
// the Stage-1 boss stays in E minor with its stage) — but dominant-HEAVY on E major (the
// G# leading tone recurs, mirroring how the Stage-1 boss leans on B7/D#), tighter and more
// aggressive: the aerial-menace boss loop. Same 152 BPM / kit; enrage-intensity applies to
// any section, so the chopper's phase-2 strafing gets the double-time-hat lift for free.
const BOSS2_CHORDS = [
  { bass: 'A2', triad: ['A3', 'C4', 'E4'] },   // 1  Am
  { bass: 'E2', triad: ['E3', 'G#3', 'B3'] },  // 2  E   (V, G# tension)
  { bass: 'A2', triad: ['A3', 'C4', 'E4'] },   // 3  Am
  { bass: 'E2', triad: ['E3', 'G#3', 'B3'] },  // 4  E
  { bass: 'F2', triad: ['F3', 'A3', 'C4'] },   // 5  F   (VI)
  { bass: 'E2', triad: ['E3', 'G#3', 'B3'] },  // 6  E
  { bass: 'A2', triad: ['A3', 'C4', 'E4'] },   // 7  Am
  { bass: 'E2', triad: ['E3', 'G#3', 'B3'] },  // 8  E   (unresolved → loops back menacing)
];
const BOSS2_LEAD = [
  [['A4', 2], ['E4', 2], ['A4', 4], ['G#4', 4], ['E4', 4]],
  [['B4', 4], ['G#5', 4], ['E5', 4], ['B4', 2], ['G#4', 2]],
  [['A4', 2], ['C5', 2], ['E5', 2], ['C5', 2], ['A4', 4], ['E4', 4]],
  [['G#4', 4], ['B4', 4], ['E5', 4], ['B4', 2], ['G#4', 2]],
  [['F5', 4], ['C5', 4], ['A4', 4], ['F4', 2], ['A4', 2]],
  [['B4', 2], ['E5', 2], ['G#5', 4], ['E5', 4], ['B4', 4]],
  [['A5', 4], ['E5', 4], ['C5', 4], ['A4', 2], ['C5', 2]],
  [['B5', 4], ['G#5', 2], ['B5', 2], ['E5', 4], ['G#4', 4]],
];

// Section registry. `bars` is derived length; scheduler wraps barIndex % bars.
const SECTIONS = {
  stage: { bars: STAGE_CHORDS.length, chords: STAGE_CHORDS, lead: STAGE_LEAD },
  boss: { bars: BOSS_CHORDS.length, chords: BOSS_CHORDS, lead: BOSS_LEAD },
  stage2: { bars: STAGE2_CHORDS.length, chords: STAGE2_CHORDS, lead: STAGE2_LEAD },
  boss2: { bars: BOSS2_CHORDS.length, chords: BOSS2_CHORDS, lead: BOSS2_LEAD },
};

export class MusicKit {
  // destination: a GainNode/AudioNode to connect under (AudioKit.master). If omitted,
  // connects straight to ctx.destination. ctx is REQUIRED to make sound — pass
  // AudioKit's shared ctx so there's one AudioContext (browsers cap them).
  constructor(ctx = null, destination = null, opts = {}) {
    this.ctx = ctx;
    this.enabled = false;
    this.running = false;
    this.muted = false;
    this._ducked = false;
    this._base = opts.gain != null ? opts.gain : 0.22; // music sits UNDER sfx
    this._duckAmt = opts.duckAmount != null ? opts.duckAmount : 0.28; // ×base when ducked
    this._intensity = false;  // phase-2 boss enrage: hotter mix + double-time hats
    this._intensityBoost = opts.intensityBoost != null ? opts.intensityBoost : 1.22; // ×base when enraged
    this._lookahead = 0.10;   // seconds of audio scheduled ahead of the clock
    this._tickMs = 25;        // scheduler wakeup interval
    this._timer = null;
    this._bar = 0;            // next bar index to schedule (monotonic; % section.bars)
    this._nextBarTime = 0;    // absolute ctx time the next bar starts
    this._section = 'stage';  // active section (stage | boss)
    this._pendingSection = null; // set by setSection() while running → applied at next bar
    this._noiseBuf = null;
    this._playing = true;     // scene gate: 1 while a run is in progress, fades to 0 on
                              // title/gameover/victory so the SFX sting lands clean
    try {
      if (!ctx) return;
      this.dest = destination || ctx.destination;
      // graph: musicGain (mute/vol) → duckGain (hitstop) → sceneGain (run-active) → dest
      this.sceneGain = ctx.createGain();
      this.sceneGain.gain.value = 1;
      this.sceneGain.connect(this.dest);
      this.duckGain = ctx.createGain();
      this.duckGain.gain.value = 1;
      this.duckGain.connect(this.sceneGain);
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = this._base;
      this.musicGain.connect(this.duckGain);
      this._noiseBuf = this._makeNoise();
      this.enabled = true;
    } catch (e) {
      this.enabled = false; // blocked/unsupported → silent no-op
    }
  }

  get barDur() { return (60 / BPM) * 4; }          // one 4/4 bar, seconds
  get stepDur() { return this.barDur / STEPS_PER_BAR; }
  get loopDur() { return this.barDur * SECTIONS[this._section].bars; } // active section
  get section() { return this._section; }

  _makeNoise() {
    const n = Math.floor(this.ctx.sampleRate * 0.2);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let s = 9781; // deterministic LCG so renders are byte-stable
    for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x40000000) - 1; }
    return buf;
  }

  // ---- voices -------------------------------------------------------------
  _voice(type, freq, when, dur, peak) {
    if (freq <= 0) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    // chiptune env: fast attack, exp decay that FILLS the note slot (ends at
    // ~dur, not early) so the loop never opens a silent gap before the downbeat —
    // re-articulation comes from the fast decay curve + each note attacking from 0,
    // not from dead air between notes. That keeps the march relentless across the seam.
    const a = 0.004;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + a);
    g.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(a + 0.02, dur * 0.98));
    o.connect(g); g.connect(this.musicGain);
    o.start(when); o.stop(when + dur + 0.02);
  }

  _drum(kind, when) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    let dur, peak;
    if (kind === 'kick') {
      // pitched sine thump + a click of noise
      f.type = 'lowpass'; f.frequency.setValueAtTime(220, when); dur = 0.12; peak = 0.5;
      const ko = this.ctx.createOscillator(); const kg = this.ctx.createGain();
      ko.type = 'sine'; ko.frequency.setValueAtTime(150, when);
      ko.frequency.exponentialRampToValueAtTime(50, when + 0.11);
      kg.gain.setValueAtTime(0.6, when); kg.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
      ko.connect(kg); kg.connect(this.musicGain); ko.start(when); ko.stop(when + 0.14);
    } else if (kind === 'snare') {
      f.type = 'bandpass'; f.frequency.setValueAtTime(1800, when); dur = 0.13; peak = 0.32;
    } else { // hat
      f.type = 'highpass'; f.frequency.setValueAtTime(7000, when); dur = 0.03; peak = 0.12;
    }
    g.gain.setValueAtTime(peak, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f); f.connect(g); g.connect(this.musicGain);
    src.start(when); src.stop(when + dur + 0.02);
  }

  // Schedule EVERY voice for one bar at absolute time `when`. Pure w.r.t. `when`,
  // so the exact same call drives both the live scheduler and the offline render.
  _scheduleBar(barIndex, when) {
    const sec = SECTIONS[this._section];
    const ch = sec.chords[barIndex % sec.bars];
    const step = this.stepDur;

    // Bass: triangle gallop — root, root, octave, fifth × 2 (driving 8th notes).
    const root = hz(ch.bass), oct = root * 2, fifth = root * Math.pow(2, 7 / 12);
    const gallop = [root, root, oct, fifth, root, root, oct, fifth];
    for (let i = 0; i < 8; i++) this._voice('triangle', gallop[i], when + i * 2 * step, step * 1.8, 0.34);

    // Arp: pulse voice cycling the chord triad in 16ths (shimmering NES drive).
    // Full-slot dur so step 15 rings right up to the bar boundary → seamless loop.
    const tri = ch.triad.map(hz);
    for (let i = 0; i < STEPS_PER_BAR; i++) this._voice('square', tri[i % 3], when + i * step, step, 0.075);

    // Lead: pulse melody.
    let t = 0;
    for (const [name, d] of sec.lead[barIndex % sec.bars]) {
      this._voice('square', hz(name), when + t * step, d * step, 0.16);
      t += d;
    }

    // Drums: kick on 1 & 3, snare on 2 & 4, hats on every off-beat 8th.
    this._drum('kick', when + 0 * step);
    this._drum('kick', when + 8 * step);
    this._drum('snare', when + 4 * step);
    this._drum('snare', when + 12 * step);
    for (const s of [2, 6, 10, 14]) this._drum('hat', when + s * step);
    // Phase-2 enrage: DOUBLE-TIME hats on the remaining 16ths — a real arrangement
    // change (not just louder) that reads as "the boss just got serious".
    if (this._intensity) for (const s of [1, 3, 5, 7, 9, 11, 13, 15]) this._drum('hat', when + s * step);
  }

  // ---- live transport -----------------------------------------------------
  start() {
    if (!this.enabled || this.running) return;
    if (this.ctx.state === 'suspended') return; // no user gesture yet → caller retries on resume
    this.running = true;
    this._bar = 0;
    this._nextBarTime = this.ctx.currentTime + 0.06;
    const tick = () => {
      if (!this.running) return;
      const horizon = this.ctx.currentTime + this._lookahead;
      while (this._nextBarTime < horizon) {
        // Apply a queued section switch on the DOWNBEAT (clean cut, no mid-bar glitch).
        if (this._pendingSection) { this._section = this._pendingSection; this._pendingSection = null; this._bar = 0; }
        this._scheduleBar(this._bar, this._nextBarTime);
        this._nextBarTime += this.barDur;
        this._bar++;
      }
    };
    tick();
    this._timer = setInterval(tick, this._tickMs);
  }

  stop() {
    this.running = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    // scheduled notes are short and self-terminating; a hard cut is a fast gain dip.
    if (this.enabled) this._ramp(this.musicGain.gain, 0.0001, 0.05);
  }

  // Call from the same user-gesture handler that resumes the AudioContext. Starts
  // (or re-arms) playback once the ctx is actually running.
  resume() {
    if (!this.enabled) return;
    if (this.ctx.state === 'suspended') { this.ctx.resume(); }
    if (!this.running) this.start();
    else this._applyGain();
  }

  toggleMute() { this.setMuted(!this.muted); return this.muted; }
  setMuted(m) { this.muted = !!m; this._applyGain(); }

  // Switch stage ↔ boss theme. While playing, the switch is queued and applied on the
  // NEXT downbeat so it's a clean musical cut (no mid-bar glitch). Idempotent — safe to
  // call every frame with the current boss-state boolean. Unknown names are ignored.
  // e.g. root.B: audio.music && audio.music.setSection(world.bossActive ? 'boss' : 'stage')
  setSection(name) {
    if (!SECTIONS[name] || name === this._section) return;
    if (this.running) this._pendingSection = name; // clean downbeat cut in the scheduler
    else { this._section = name; this._bar = 0; }   // offline / pre-start: apply now
  }

  // Duck the music under hit-stop (or any transient). Pass the boolean each frame;
  // it's idempotent, so calling every frame is cheap and glitch-free.
  duck(active) {
    active = !!active;
    if (active === this._ducked) return;
    this._ducked = active;
    if (this.enabled) this._ramp(this.duckGain.gain, active ? this._duckAmt : 1, active ? 0.02 : 0.14);
  }

  // Scene gate: fade the music OUT when a run isn't in progress (title / game-over /
  // victory) so the 'gameover'/'clear' SFX sting isn't fighting a relentless loop, and
  // back IN when play resumes. Idempotent — call every frame with world.status==='playing'.
  // The transport keeps running underneath (cheap), so resume is instant and seamless.
  // e.g. root.B: audio.music && audio.music.setPlaying(world.status === 'playing')
  setPlaying(active) {
    active = !!active;
    if (active === this._playing) return;
    this._playing = active;
    // fade OUT a touch slower than the ~0.28s 'gameover' sting so the loop ebbs under it;
    // fade IN quickly so restarting a run feels immediate.
    if (this.enabled) this._ramp(this.sceneGain.gain, active ? 1 : 0.0001, active ? 0.12 : 0.35);
  }

  // Phase-2 boss ENRAGE intensity: hotter mix (×intensityBoost) + double-time hats (added
  // in _scheduleBar on the next bar). Idempotent — call every frame with boss.enraged.
  // Default OFF, so a plain re-sync with no hook changes nothing (byte-safe).
  // e.g. main.js: audio.setIntensity(!!(world.boss && world.boss.enraged))
  setIntensity(active) {
    active = !!active;
    if (active === this._intensity) return;
    this._intensity = active;    // the hat change takes effect on the next scheduled bar
    this._applyGain();           // the mix lift ramps immediately
  }

  _applyGain() {
    if (!this.enabled) return;
    const target = this.muted ? 0.0001 : this._base * (this._intensity ? this._intensityBoost : 1);
    this._ramp(this.musicGain.gain, target, 0.05);
  }

  _ramp(param, to, secs) {
    const t = this.ctx.currentTime;
    const from = Math.max(0.0001, param.value);
    param.cancelScheduledValues(t);
    param.setValueAtTime(from, t);
    param.exponentialRampToValueAtTime(Math.max(0.0001, to), t + secs);
  }

  // ---- offline / verification --------------------------------------------
  // Schedule all bars overlapping [start, start+seconds). Used by the offline
  // render-check to exercise the exact scheduling path deterministically.
  scheduleSpan(start, seconds) {
    if (!this.enabled) return;
    let bar = 0;
    let when = start;
    const end = start + seconds;
    while (when < end) {
      this._scheduleBar(bar, when);
      when += this.barDur;
      bar++;
    }
  }
}

export default MusicKit;
