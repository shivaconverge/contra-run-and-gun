// Procedural SFX via Web Audio — no audio assets, synthesized on the fly so the
// slice has a full sensory layer with zero art/asset dependency. Driven by game
// EVENTS (world.emit'd strings); the sim itself never touches Web Audio, so it
// stays deterministic and headless-safe. Degrades gracefully: if AudioContext is
// unavailable/blocked, everything becomes a silent no-op (never throws).
//
// SUBJECTIVE-QUALITY CAVEAT (declared): the event WIRING and no-throw synth paths
// are verified in-engine (selftest), but whether the mix actually *sounds good*
// is a human judgment — a headless loop can't listen. Tuning is data below.

import { MusicKit } from './music.js';

export class AudioKit {
  constructor() {
    this.enabled = false;
    this.muted = false;
    this.ctx = null;
    this.master = null;
    this._noiseBuf = null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this._noiseBuf = this._makeNoise();
      this.enabled = true;
      this.music = new MusicKit(this.ctx, this.master); // shares the one AudioContext
    } catch (e) {
      this.enabled = false; // blocked or unsupported → silent no-op
    }
  }

  // Browsers suspend audio until a user gesture; call this from an input handler.
  resume() {
    if (this.enabled && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.music) this.music.resume(); // starts music on the same user gesture
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.music) this.music.setMuted(this.muted); // keep music in sync with KeyM
    return this.muted;
  }

  // Duck the music under hit-stop (called each frame by the render loop).
  duck(active) { if (this.music) this.music.duck(active); }

  // Switch the music section (stage | boss). Idempotent + queues to the next
  // downbeat, so main.js can call it every frame with the live boss state.
  setSection(name) { if (this.music) this.music.setSection(name); }

  // Scene gate: fade the BGM out when a run isn't in progress (title / game-over /
  // victory) so the 'gameover'/'clear' SFX sting lands clean, back in on restart.
  // Idempotent — main.js calls it every frame with world.status === 'playing'.
  setPlaying(active) { if (this.music) this.music.setPlaying(active); }

  // Phase-2 boss ENRAGE: lift the music mix + add double-time hats while the boss is
  // enraged. Idempotent — main.js calls it every frame with the live boss.enraged flag.
  setIntensity(active) { if (this.music) this.music.setIntensity(active); }

  _makeNoise() {
    const n = this.ctx.sampleRate * 0.4;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    // deterministic-ish LCG so the buffer is stable (not that it matters for audio)
    let s = 1234567;
    for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x40000000) - 1; }
    return buf;
  }

  _now() { return this.ctx.currentTime; }

  // A pitched blip with an ADSR-ish envelope and optional pitch slide.
  _tone(freq, dur, { type = 'square', gain = 0.2, slideTo = null, attack = 0.005 } = {}) {
    const t = this._now();
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // A filtered noise burst (impacts / explosions).
  _noise(dur, { gain = 0.3, filter = 1400, sweepTo = null, type = 'lowpass' } = {}) {
    const t = this._now();
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filter, t);
    if (sweepTo != null) f.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  // Map an event name → a synth recipe. Unknown names are ignored.
  play(name) {
    if (!this.enabled || this.muted) return;
    if (this.ctx.state === 'suspended') return; // no gesture yet → stay silent
    switch (name) {
      case 'shoot_rifle': this._tone(680, 0.06, { type: 'square', gain: 0.12, slideTo: 300 }); break;
      case 'shoot_spread':
        this._tone(420, 0.08, { type: 'sawtooth', gain: 0.1, slideTo: 200 });
        this._noise(0.06, { gain: 0.08, filter: 2600, sweepTo: 800 });
        break;
      case 'shoot_machine': this._tone(560, 0.045, { type: 'square', gain: 0.08, slideTo: 340 }); break;
      case 'shoot_fire':
        this._tone(300, 0.1, { type: 'sawtooth', gain: 0.09, slideTo: 520 }); // whoosh up (corkscrew)
        this._noise(0.08, { gain: 0.07, filter: 1800, sweepTo: 3200, type: 'bandpass' });
        break;
      case 'shoot_laser':
        this._tone(1200, 0.12, { type: 'sawtooth', gain: 0.12, slideTo: 420 });
        this._noise(0.05, { gain: 0.06, filter: 5000, sweepTo: 2000, type: 'bandpass' });
        break;
      case 'jump': this._tone(300, 0.12, { type: 'sine', gain: 0.14, slideTo: 560 }); break;
      case 'enemyHit': this._noise(0.05, { gain: 0.12, filter: 3200, sweepTo: 1400, type: 'bandpass' }); break;
      case 'explosion':
        this._noise(0.32, { gain: 0.32, filter: 1600, sweepTo: 120 });
        this._tone(120, 0.28, { type: 'sine', gain: 0.22, slideTo: 45 });
        break;
      case 'hurt': this._tone(400, 0.28, { type: 'sawtooth', gain: 0.22, slideTo: 90 }); break;
      case 'shield': this._tone(760, 0.16, { type: 'triangle', gain: 0.16, slideTo: 300 }); break;
      case 'pickup':
        this._tone(660, 0.09, { type: 'square', gain: 0.16 });
        this._later(0.09, () => this._tone(990, 0.12, { type: 'square', gain: 0.16 }));
        break;
      case 'bossHit': this._tone(220, 0.05, { type: 'square', gain: 0.1, slideTo: 160 }); break;
      case 'bossEnrage':
        this._tone(70, 0.5, { type: 'sawtooth', gain: 0.24, slideTo: 190 }); // menacing rising growl
        this._noise(0.4, { gain: 0.14, filter: 500, sweepTo: 2200 });
        break;
      case 'bossDeath':
        this._noise(0.6, { gain: 0.4, filter: 1800, sweepTo: 80 });
        this._tone(90, 0.6, { type: 'sine', gain: 0.3, slideTo: 30 });
        break;
      case 'gameover':
        [330, 262, 196].forEach((f, i) => this._later(i * 0.18, () => this._tone(f, 0.22, { type: 'triangle', gain: 0.2 })));
        break;
      case 'clear':
        [523, 659, 784, 1047].forEach((f, i) => this._later(i * 0.12, () => this._tone(f, 0.16, { type: 'square', gain: 0.18 })));
        break;
      case 'splash': // fell into the bridge water: watery hiss up + a plunk down
        this._noise(0.22, { gain: 0.16, filter: 900, sweepTo: 2600, type: 'bandpass' });
        this._tone(300, 0.14, { type: 'sine', gain: 0.14, slideTo: 90 });
        break;
      case 'land': // soft touchdown thud (quiet — fires on every jump landing)
        this._tone(140, 0.07, { type: 'sine', gain: 0.09, slideTo: 70 });
        this._noise(0.05, { gain: 0.05, filter: 1200, sweepTo: 300 });
        break;
      default: break;
    }
  }

  _later(delay, fn) {
    // schedule via a short silent oscillator's onended? simpler: setTimeout (live only)
    try { setTimeout(fn, delay * 1000); } catch (e) { /* no-op */ }
  }
}
