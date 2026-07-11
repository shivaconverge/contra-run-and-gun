// Lightweight non-actor entities: bullets and particles.
import { aabbOverlap } from './util.js';

export class Bullet {
  constructor(x, y, vx, vy, opts) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.w = opts.w ?? 4; this.h = opts.h ?? 2;
    this.life = opts.life ?? 90;
    this.damage = opts.damage ?? 1;
    this.from = opts.from ?? 'player';
    this.color = opts.color ?? '#fff';
    this.dead = false;
    this.hitSolid = false; // set when it dies against level geometry (for sparks)
    this.pierce = opts.pierce ?? false; // laser: pass through enemies
    this.hit = this.pierce ? new Set() : null; // enemies already damaged (once each)
    // Gravity per step (0 = straight shot). Non-zero → a lobbed/arcing shell
    // (the Mortar's parabolic shot), so vy accelerates downward each step.
    this.gravity = opts.gravity ?? 0;
    // Fire weapon: bullets corkscrew — advance along the shot axis while
    // oscillating perpendicular to it (a 2D helix). Precompute the axis frame.
    this.wave = opts.wave ?? false;
    if (this.wave) {
      const sp = Math.hypot(vx, vy) || 1;
      this.speed = sp;
      this.ax = vx / sp; this.ay = vy / sp;       // forward unit
      this.px = -this.ay; this.py = this.ax;       // perpendicular unit
      this.baseX = x; this.baseY = y; this.dist = 0;
      this.amp = opts.waveAmp ?? 4.5;
      this.freq = opts.waveFreq ?? 0.45;
      this.phase = opts.wavePhase ?? 0;
    }
  }
  step(solids) {
    if (this.wave) {
      this.dist += this.speed;
      this.phase += this.freq;
      const o = Math.sin(this.phase) * this.amp;
      this.x = this.baseX + this.ax * this.dist + this.px * o;
      this.y = this.baseY + this.ay * this.dist + this.py * o;
    } else {
      if (this.gravity) this.vy += this.gravity; // arcing shell falls under gravity
      this.x += this.vx;
      this.y += this.vy;
    }
    if (--this.life <= 0) { this.dead = true; return; }
    for (const s of solids) {
      if (s.noBullet) continue; // actor-only barriers (e.g. boss arena) let shots pass
      if (aabbOverlap(this, s)) { this.dead = true; this.hitSolid = true; return; }
    }
  }
}

export class Particle {
  constructor(x, y, vx, vy, opts = {}) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.maxLife = opts.life ?? 24;
    this.life = this.maxLife;
    this.size = opts.size ?? 2;
    this.color = opts.color ?? '#fff';
    this.gravity = opts.gravity ?? 0.18;
    this.drag = opts.drag ?? 0.96;
    this.dead = false;
  }
  step() {
    this.vx *= this.drag;
    this.vy = this.vy * this.drag + this.gravity;
    this.x += this.vx;
    this.y += this.vy;
    if (--this.life <= 0) this.dead = true;
  }
}

// Weapon power-up capsule (Contra's falcon icon). Bobs in place; grabbing it
// REPLACES the player's single weapon slot. `weapon` is a WEAPONS key.
export class Pickup {
  constructor(weapon, x, y) {
    this.weapon = weapon;
    this.x = x; this.y = y; this.w = 14; this.h = 12;
    this.baseY = y; this.t = 0; this.dead = false;
  }
  step() {
    this.t += 0.12;
    this.y = this.baseY + Math.sin(this.t) * 2;
  }
}

// Burst helper used by kills / impacts.
export function burst(list, x, y, rng, opts = {}) {
  const n = opts.count ?? 10;
  const spd = opts.speed ?? 2.4;
  const color = opts.color ?? '#ffd166';
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2;
    const s = spd * (0.3 + rng() * 0.7);
    list.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s - 0.6, {
      life: (opts.life ?? 22) * (0.6 + rng() * 0.6),
      size: opts.size ?? (1 + Math.floor(rng() * 2)),
      color,
    }));
  }
}
