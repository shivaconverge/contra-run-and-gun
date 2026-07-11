// Horizontal-follow camera with a soft dead-zone and level clamping.
import { clamp, lerp } from './util.js';
import { SIM } from '../data/config.js';

export class Camera {
  constructor(levelW, levelH) {
    this.x = 0;
    this.y = 0;
    this.levelW = levelW;
    this.levelH = levelH;
  }

  follow(target, snap = false) {
    // Keep the player a third of the way in, biased toward facing direction.
    const want = target.x + target.w / 2 - SIM.VIEW_W * 0.38;
    this.x = snap ? want : lerp(this.x, want, 0.12);
    this.x = clamp(this.x, 0, Math.max(0, this.levelW - SIM.VIEW_W));
    this.y = clamp(this.y, 0, Math.max(0, this.levelH - SIM.VIEW_H));
  }
}
