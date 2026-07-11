// Game-feel primitives — the reusable "feel kernel": hit-stop and
// trauma-based screen shake. Strategy: task_spec_as_reusable_kernel.
import { FEEL, SIM } from '../data/config.js';
import { clamp } from './util.js';

export class Feel {
  constructor(rng) {
    this.rng = rng;
    this.hitStop = 0;   // frames the sim is frozen
    this.trauma = 0;    // 0..1, decays over time; shake = trauma^2
    this.t = 0;         // frame counter for shake noise
  }

  addTrauma(amount) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  freeze(frames) {
    if (frames > this.hitStop) this.hitStop = frames;
  }

  // Call once per fixed step. Returns true if the sim should run this step,
  // false while hit-stop is holding the frame.
  tick() {
    this.t++;
    this.trauma = Math.max(0, this.trauma - FEEL.traumaDecay / SIM.STEP_HZ);
    if (this.hitStop > 0) {
      this.hitStop--;
      return false;
    }
    return true;
  }

  // Deterministic per-frame shake offset (uses the seeded rng once per frame
  // via a cached sample so X/Y stay coherent across a frame's draws).
  shakeOffset() {
    const s = this.trauma * this.trauma * FEEL.shakeMax;
    if (s <= 0.01) return { x: 0, y: 0, angle: 0 };
    const nx = this.rng() * 2 - 1;
    const ny = this.rng() * 2 - 1;
    const na = this.rng() * 2 - 1;
    return { x: nx * s, y: ny * s, angle: na * s * 0.006 };
  }
}
