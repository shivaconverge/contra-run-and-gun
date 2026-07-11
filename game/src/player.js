// Player actor: run / jump / 8-way aim / shoot — the core run-and-gun feel.
import { PHYSICS, PLAYER, WEAPONS } from '../data/config.js';
import { approach, clamp, sign, aabbOverlap } from './util.js';
import { moveAndCollide } from './physics.js';

const SQRT1_2 = Math.SQRT1_2;

// Hero weapon geometry — the SINGLE source of truth for where the one rifle sits
// and where its muzzle is, SHARED with render.js drawGun so the drawn muzzle and
// the bullet spawn are the exact same point (seen-gun == firing-gun). This is the
// CREATOR round-2 fix: the hero carries ONE procedural aiming weapon (no baked
// sprite gun), and the shot leaves that weapon's real muzzle. `pivotY` is the
// hands/chest height as a fraction of the standing hitbox; `muzzle` is the barrel
// reach in px along the unit 8-way aim (|aim| == 1 for cardinals AND diagonals).
export const HERO_GUN = { pivotY: 0.30, muzzle: 11 };

// Muzzle world-point for the current aim — the rifle tip the shot leaves from.
export function heroMuzzle(p) {
  const gx = p.x + p.w / 2, gy = p.y + p.h * HERO_GUN.pivotY;
  return { gx, gy, mx: gx + p.aim.x * HERO_GUN.muzzle, my: gy + p.aim.y * HERO_GUN.muzzle };
}

// Landing feedback tuning. LAND_MIN_VY gates out micro step-downs so only real
// jumps/falls (fall speed > this) trigger the squash + dust; LAND_SQUASH_FRAMES is
// how long the touchdown squash eases out over.
const LAND_MIN_VY = 4.2;
const LAND_SQUASH_FRAMES = 7;

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.w = PLAYER.w; this.h = PLAYER.h;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.iframe = 0;      // invulnerability frames (spawn protection only)
    this.fireCd = 0;
    this.weaponKeys = Object.keys(WEAPONS);
    this.weaponIdx = Math.max(0, this.weaponKeys.indexOf(PLAYER.defaultWeapon));
    this.muzzle = 0;      // muzzle-flash timer (frames)
    this.flash = 0;       // hurt flash timer
    this.aim = { x: 1, y: 0 };
    this.dead = false;
    this.shield = 0;      // CASUAL-mode hit buffer (0 in ARCADE = pure one-hit death)
    this.prone = false;   // Contra prone stance (duck aimed fire, hit low)
    this.walkPhase = 0;   // for placeholder leg animation
    this.recoilKick = 0;  // visual recoil offset along -aim
    // Contra death throw: on a lethal hit the commando is flung upward and
    // spins as it arcs down (the iconic death read), animated for the respawn
    // window by updateDeath(). deathAngle drives the render spin.
    this.dying = false;
    this.deathAngle = 0;
    this.airborneT = 0;   // frames since leaving the ground (drives jump somersault)
    this.landT = 0;       // landing-squash timer (drives the touchdown squash + dust)
  }

  // Enter/leave prone by resizing the hitbox while keeping the feet planted.
  // Standing up is blocked while a solid occupies the headroom (no clipping).
  _setStance(wantProne, solids) {
    const targetH = wantProne ? PLAYER.proneH : PLAYER.h;
    if (targetH === this.h) { this.prone = wantProne; return; }
    const bottom = this.y + this.h;
    if (targetH < this.h) {           // dropping prone — always allowed
      this.y = bottom - targetH;
      this.h = targetH;
      this.prone = true;
    } else {                          // standing up — only with headroom
      const grown = { x: this.x, y: bottom - targetH, w: this.w, h: targetH };
      for (const s of solids) if (aabbOverlap(grown, s)) { this.prone = true; return; }
      this.y = grown.y;
      this.h = targetH;
      this.prone = false;
    }
  }

  get weapon() { return WEAPONS[this.weaponKeys[this.weaponIdx]]; }
  get weaponKey() { return this.weaponKeys[this.weaponIdx]; }

  // Single-slot weapon economy (Contra invariant): a pickup REPLACES the
  // current weapon; death reverts to the default rifle. No free cycling.
  setWeapon(key) {
    const i = this.weaponKeys.indexOf(key);
    if (i >= 0) this.weaponIdx = i;
  }
  resetWeapon() { this.setWeapon(PLAYER.defaultWeapon); }

  // Contra-style 8-way aim from directional inputs + facing.
  computeAim(inp) {
    const h = inp.right ? 1 : inp.left ? -1 : 0;
    if (h !== 0) this.facing = h;
    const up = inp.up, down = inp.down;
    let ax = 0, ay = 0;
    if (up && !down) {
      ay = -1;
      ax = h !== 0 ? h : 0;
    } else if (down && !up && !this.grounded) {
      ay = 1;
      ax = h !== 0 ? h : 0;
    } else {
      ax = this.facing;
      ay = 0;
    }
    if (ax !== 0 && ay !== 0) { ax *= SQRT1_2; ay *= SQRT1_2; }
    if (ax === 0 && ay === 0) ax = this.facing;
    this.aim.x = ax; this.aim.y = ay;
  }

  update(inp, world) {
    if (this.dead) return;

    // --- prone stance: hold Down while grounded and still (Contra dodge). A
    //     movement input cancels prone, so you stand up by running. ---
    const dir = inp.right ? 1 : inp.left ? -1 : 0;
    this._setStance(this.grounded && inp.down && !inp.up && dir === 0, world.solids);

    // --- horizontal movement with accel / friction curves ---
    const accel = this.grounded ? PHYSICS.groundAccel : PHYSICS.airAccel;
    if (dir !== 0) {
      this.vx = approach(this.vx, dir * PHYSICS.runSpeed, accel);
    } else {
      this.vx = approach(this.vx, 0, this.grounded ? PHYSICS.friction : PHYSICS.airAccel * 0.5);
    }

    // --- jump: FIXED-ARC parabola (arcade invariant) + coyote/buffer forgiveness ---
    if (inp.jumpPressed) this.jumpBuffer = PHYSICS.jumpBufferFrames;
    else if (this.jumpBuffer > 0) this.jumpBuffer--;

    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.vy = -PHYSICS.jumpVel;
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
      world.emit('jump');
    }
    // Jump-cut (variable height) is OFF by default — a Contra deviation. The arc
    // stays fixed regardless of how long jump is held. Data-gated for reversibility.
    if (PHYSICS.jumpCutEnabled && !inp.jump && this.vy < 0) this.vy *= PHYSICS.jumpCut;

    // --- gravity ---
    this.vy = clamp(this.vy + PHYSICS.gravity, -99, PHYSICS.maxFall);

    // --- integrate + collide ---
    const wasAir = !this.grounded;   // grounded still holds last frame's value here
    const fallVy = this.vy;          // downward speed this frame, before collision zeroes it
    const c = moveAndCollide(this, world.solids);
    if (c.grounded) this.coyote = PHYSICS.coyoteFrames;
    else if (this.coyote > 0) this.coyote--;
    this.grounded = c.grounded;
    // TOUCHDOWN FEEL (movement cadence): landing after a real fall kicks a brief
    // squash (render) + a ground dust puff (cosmetic fx, NO rng → determinism-safe),
    // scaled by impact speed. Micro-steps (fallVy below the threshold) stay silent.
    if (wasAir && c.grounded && fallVy > LAND_MIN_VY) {
      this.landT = LAND_SQUASH_FRAMES;
      this.landImpact = Math.min(1, fallVy / PHYSICS.maxFall);
      world.spawnFx('landdust', this.x + this.w / 2, this.y + this.h);
      world.emit('land');
    }
    if (this.landT > 0) this.landT--;

    // --- aim + shooting ---
    this.computeAim(inp);
    if (this.fireCd > 0) this.fireCd--;
    if (inp.fire && this.fireCd <= 0) this.shoot(world);

    // --- timers / cosmetic ---
    if (this.muzzle > 0) this.muzzle--;
    if (this.flash > 0) this.flash--;
    if (this.iframe > 0) this.iframe--;
    this.recoilKick *= 0.75;
    if (Math.abs(this.vx) > 0.2 && this.grounded) this.walkPhase += Math.abs(this.vx) * 0.25;
    else this.walkPhase = 0;
    // Airborne frame counter — drives the Contra somersault tuck on the jump's
    // rise (render.js). Reset on landing; the fixed-arc rise is ~17 frames.
    this.airborneT = this.grounded ? 0 : this.airborneT + 1;
  }

  shoot(world) {
    const wpn = this.weapon;
    this.fireCd = wpn.fireRate;
    this.muzzle = 4;
    world.emit('shoot_' + this.weaponKey); // audio maps per-weapon (falls back to rifle)
    // Muzzle origin = the ONE rifle's real muzzle (heroMuzzle / HERO_GUN), the
    // exact point render.js draws the barrel tip at, so the weapon you SEE and the
    // weapon that FIRES are the same one (CREATOR round-2 fix — no phantom waist gun).
    const { mx, my } = heroMuzzle(this);
    const baseAng = Math.atan2(this.aim.y, this.aim.x);
    for (let p = 0; p < wpn.pellets; p++) {
      let ang = baseAng;
      if (wpn.spread > 0) {
        const t = wpn.pellets > 1 ? p / (wpn.pellets - 1) - 0.5 : 0;
        ang += t * wpn.spread + (world.rng() - 0.5) * wpn.spread * 0.4;
      }
      world.spawnBullet(mx, my, Math.cos(ang) * wpn.bulletSpeed, Math.sin(ang) * wpn.bulletSpeed, {
        from: 'player', damage: wpn.damage, color: wpn.color, life: wpn.bulletLife,
        pierce: wpn.pierce, w: wpn.bw, h: wpn.bh,
        // Fire: each strand starts a half-cycle apart → the twin double-helix.
        wave: wpn.wave, waveAmp: wpn.waveAmp, waveFreq: wpn.waveFreq,
        wavePhase: wpn.wave ? p * Math.PI : 0,
      });
    }
    // recoil: small self push + visual kick + screen trauma + spark
    this.vx -= this.aim.x * wpn.recoil;
    this.recoilKick = 3;
    world.feel.addTrauma(wpn.trauma);
    world.spawnMuzzleSpark(mx, my, this.aim);
  }

  // Any connecting hit is lethal (ARCADE one-hit death) UNLESS a CASUAL shield
  // absorbs it — then the shield drops and brief i-frames engage instead of
  // death. Ignored entirely while already invulnerable. Returns true on a hit.
  takeHit(fromX) {
    if (this.iframe > 0 || this.dead) return false;
    this.flash = 12;
    const kb = sign(this.x + this.w / 2 - fromX) || -this.facing;
    this.vx = kb * 3.2;
    this.vy = -3.2;
    if (this.shield > 0) {
      this.shield--;
      this.iframe = PLAYER.hitIFrames; // survive the hit with a blink of grace
    } else {
      this.dead = true;
      // Fling the body up + away from the hit and start spinning — Contra's
      // signature death arc (updateDeath integrates it over the respawn window).
      this.dying = true;
      this.deathAngle = 0;
      this.vx = kb * 1.6;
      this.vy = -6.6;
    }
    return true;
  }

  // Ballistic death arc, run each step by world.step while the respawn timer
  // holds. Free-falls (no collision) so the commando visibly launches, spins,
  // and drops — dramatic, deterministic, and cleared on respawn.
  updateDeath() {
    if (!this.dying) return;
    this.vy = clamp(this.vy + PHYSICS.gravity, -99, PHYSICS.maxFall);
    this.x += this.vx;
    this.y += this.vy;
    this.deathAngle += 0.34;
  }
}
