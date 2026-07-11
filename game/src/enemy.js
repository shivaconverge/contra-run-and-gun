// One enemy set: a walking Grunt and a stationary Sentry turret.
// Both are data-configured via ENEMIES; behavior branches on `kind`.
//
// ── ONE-WEAPON-PER-ARMED-ENTITY AUDIT (creator ROUND-2 REJECT) — 2026-07-12 ──
// The two-weapon defect is a DETERMINISTIC render fact: it occurs only when a
// render path draws a PROCEDURAL aiming weapon ON TOP of a sprite that already
// bakes a weapon. Audited every armed entity + VERIFIED BY LOOKING (headless
// 8-way + per-enemy fire capture):
//   • hero   — was defective (baked rifle + procedural drawGun); FIXED: weaponless
//              body sprite + the single procedural rifle (render.js drawGun).
//   • turret — was defective (baked barrel + procedural drawTurretBarrel); FIXED:
//              weaponless dome (turret_base / runtime strip) + one barrel.
//   • mortar — one baked barrel, shell lobs from it. render.js draws NO procedural
//              weapon over the mortar sprite. Single weapon. ✓
//   • flyer  — copper drone, NO baked gun; fires an energy shot from its body/eye.
//              No procedural weapon overlaid. Single weapon. ✓
//   • boss / chopper — one baked cannon/gunship; drawBoss/drawChopper add only
//              telegraph + core-glow FX, never a second gun. Single weapon. ✓
//   • grunt  — melee/contact, unarmed.
// INVARIANT for future edits: do NOT draw a procedural aiming weapon over an
// enemy sprite that already carries one (that is exactly what reopened the reject
// for hero+turret). If a NEW enemy needs an aiming weapon, ship its body
// weaponless (like turret_base) OR fire from the baked weapon — never both.
import { ENEMIES, PHYSICS } from '../data/config.js';
import { moveAndCollide } from './physics.js';
import { sign } from './util.js';

// Frames of muzzle wind-up before a turret/flyer aimed shot. ~0.18s at 60Hz:
// long enough to read + react (jump/prone), short enough to stay pressuring.
export const TELEGRAPH_FRAMES = 11;

export class Enemy {
  constructor(kind, x, y) {
    const def = ENEMIES[kind];
    this.kind = kind;
    this.def = def;
    this.x = x; this.y = y;
    this.w = def.w; this.h = def.h;
    this.vx = 0; this.vy = 0;
    this.hp = def.hp;
    this.flash = 0;       // white hit-flash frames
    this.dead = false;
    this.cooldown = def.fireEvery ? Math.floor(def.fireEvery * 0.5) : 0;
    this.grounded = false;
    this.dir = -1;
    // Pre-fire wind-up: counts down for the last TELEGRAPH_FRAMES steps before an
    // aimed shot so the muzzle glows a beat early and the shot is READABLE, not a
    // cheap hit. Deterministic (driven by cooldown, never rng). Boss has its own.
    this.telegraph = 0;
    // Dormant until the camera nears it, so clusters are met together (denser
    // firefights) instead of distant enemies trickling toward the player.
    this.active = false;
  }

  update(world) {
    const p = world.player;
    if (this.kind === 'grunt') {
      // walk toward the player, respecting gravity + ground collision
      this.dir = sign((p.x + p.w / 2) - (this.x + this.w / 2)) || this.dir;
      this.vx = this.dir * this.def.speed;
      this.vy = Math.min(this.vy + PHYSICS.gravity, PHYSICS.maxFall);
      const c = moveAndCollide(this, world.solids);
      this.grounded = c.grounded;
      if (c.wallL || c.wallR) this.dir *= -1; // turn at walls
    } else if (this.kind === 'flyer') {
      // Aerial drone: hover at spawn altitude (deterministic sine bob), close to
      // strafing range, then hold station firing aimed shots at the player. No
      // gravity, no RNG — replay/self-test stays byte-identical.
      if (this.baseY === undefined) this.baseY = this.y;
      this.t = (this.t || 0) + 1;
      const pcx = p.x + p.w / 2, ecx = this.x + this.w / 2;
      this.dir = sign(pcx - ecx) || this.dir;
      if (Math.abs(pcx - ecx) > this.def.standoff) this.x += this.dir * this.def.speed;
      this.y = this.baseY + Math.sin(this.t * this.def.bobFreq) * this.def.bobAmp;
      this.telegraph = Math.max(0, this.telegraph - 1);
      this.cooldown--;
      if (this.cooldown === TELEGRAPH_FRAMES) this.telegraph = TELEGRAPH_FRAMES; // wind-up
      if (this.cooldown <= 0) {
        this.cooldown = this.def.fireEvery;
        this.telegraph = 0;
        const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
        const dx = (p.x + p.w / 2) - cx, dy = (p.y + p.h / 2) - cy;
        const d = Math.hypot(dx, dy) || 1;
        world.spawnBullet(cx, cy, (dx / d) * this.def.shotSpeed, (dy / d) * this.def.shotSpeed, {
          from: 'enemy', damage: this.def.contactDamage, color: '#ff8a3c', life: 200, w: 5, h: 5,
        });
      }
    } else if (this.kind === 'turret') {
      this.telegraph = Math.max(0, this.telegraph - 1);
      this.cooldown--;
      if (this.cooldown === TELEGRAPH_FRAMES) this.telegraph = TELEGRAPH_FRAMES; // wind-up
      if (this.cooldown <= 0) {
        this.cooldown = this.def.fireEvery;
        this.telegraph = 0;
        // CR-3: fire from the visible barrel TIP, not the hull centre. The barrel
        // pivots at the dome top and aims at the player; the shot exits its tip
        // along that same aim. Geometry is shared with the renderer via def so the
        // drawn barrel and the muzzle stay locked together.
        const px = this.x + this.w / 2, py = this.y + this.h - this.def.barrelPivotFromBottom;
        const dx = (p.x + p.w / 2) - px, dy = (p.y + p.h / 2) - py;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d, uy = dy / d;
        const mx = px + ux * this.def.barrelLen, my = py + uy * this.def.barrelLen; // barrel tip
        world.spawnBullet(mx, my, ux * this.def.shotSpeed, uy * this.def.shotSpeed, {
          from: 'enemy', damage: this.def.contactDamage, color: '#ff5d5d', life: 160, w: 5, h: 5,
        });
      }
    } else if (this.kind === 'mortar') {
      // Area-denial emplacement: telegraph, then LOB a parabolic shell toward the
      // player's ground position. Deterministic arc (no rng); reposition to dodge.
      this.telegraph = Math.max(0, this.telegraph - 1);
      this.cooldown--;
      if (this.cooldown === TELEGRAPH_FRAMES) this.telegraph = TELEGRAPH_FRAMES; // wind-up
      if (this.cooldown <= 0) {
        this.cooldown = this.def.fireEvery;
        this.telegraph = 0;
        this._lobShell(world);
      }
    } else if (this.kind === 'boss') {
      // MOVEMENT (CR-4): advance-toward-the-line / retreat sway. Horizontal only,
      // so the ground-referenced cannon volley stays prone-duckable; amplitude
      // keeps it right of the arena barrier (x2300). Wider/faster once enraged.
      // MOVEMENT (CR-4): the Sentinel HOVERS — a vertical bob (rise/settle) so it
      // reads as a live, breathing threat, not a static prop. Vertical only: it
      // doesn't change the horizontal distance to the player (fight balance stays)
      // and the cannon volley is computed from a FIXED baseY (below), so PRONE
      // still ducks it (fair). Deterministic (sine, no rng). Enrage bobs harder.
      if (this.baseY === undefined) this.baseY = this.y;
      this.t = (this.t || 0) + 1;
      const amp = this.enraged ? this.def.enrageSwayAmp : this.def.swayAmp;
      const freq = this.enraged ? this.def.enrageSwayFreq : this.def.swayFreq;
      this.y = this.baseY + Math.sin(this.t * freq) * amp;
      // Phase-2 escalation once HP crosses the enrage threshold.
      if (!this.enraged && this.hp <= this.def.hp * this.def.enrageAt) {
        this.enraged = true;
        this.cooldown = Math.min(this.cooldown, 16); // snap toward a quick enraged volley
        if (world.onBossEnrage) world.onBossEnrage(this);
      }
      const fireEvery = this.enraged ? this.def.enrageFireEvery : this.def.fireEvery;
      this.telegraph = Math.max(0, (this.telegraph || 0) - 1);
      this.cooldown--;
      if (this.cooldown === 12) this.telegraph = 12; // wind-up flash before firing
      if (this.cooldown <= 0) {
        this.cooldown = fireEvery;
        this._cannonVolley(world);
      }
    } else if (this.kind === 'chopper') {
      // Stage-2 boss: a MOVING aerial GUNSHIP. Sweeps horizontally (sine around
      // baseX), eases to a hover altitude (drops to enrageHoverY when enraged),
      // fires aimed bursts and lobs bombs. Deterministic (sine + cooldown, no rng).
      if (this.baseX === undefined) { this.baseX = this.x; this.baseY = this.y; }
      this.t = (this.t || 0) + 1;
      if (!this.enraged && this.hp <= this.def.hp * this.def.enrageAt) {
        this.enraged = true;
        this.cooldown = Math.min(this.cooldown, 16);
        if (world.onBossEnrage) world.onBossEnrage(this);
      }
      const sweepFreq = this.enraged ? this.def.enrageSweepFreq : this.def.sweepFreq;
      const hoverY = this.enraged ? this.def.enrageHoverY : this.def.hoverY;
      this.x = this.baseX + Math.sin(this.t * sweepFreq) * this.def.sweepAmp;
      this.y += sign(hoverY - this.y) * Math.min(1.5, Math.abs(hoverY - this.y));
      this.dir = -1;
      // Aimed burst (like flyer/turret), telegraphed.
      const fireEvery = this.enraged ? this.def.enrageFireEvery : this.def.fireEvery;
      this.telegraph = Math.max(0, this.telegraph - 1);
      this.cooldown--;
      if (this.cooldown === TELEGRAPH_FRAMES) this.telegraph = TELEGRAPH_FRAMES;
      if (this.cooldown <= 0) {
        this.cooldown = fireEvery;
        this.telegraph = 0;
        const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
        const dx = (p.x + p.w / 2) - cx, dy = (p.y + p.h / 2) - cy;
        const d = Math.hypot(dx, dy) || 1;
        world.spawnBullet(cx, cy, (dx / d) * this.def.shotSpeed, (dy / d) * this.def.shotSpeed, {
          from: 'enemy', damage: this.def.contactDamage, color: '#ffd24a', life: 200, w: 5, h: 5,
        });
      }
      // Bomb drop (reuse the mortar parabolic lob).
      const bombEvery = this.enraged ? this.def.enrageBombEvery : this.def.bombEvery;
      this.bombCd = (this.bombCd === undefined ? Math.floor(this.def.bombEvery * 0.5) : this.bombCd) - 1;
      if (this.bombCd <= 0) { this.bombCd = bombEvery; this._lobShell(world); }
    }
    if (this.flash > 0) this.flash--;
  }

  // Lob a parabolic shell toward the player's current x. Launch straight up at
  // shellVy, and pick a horizontal speed (capped for fairness) so the shell lands
  // near the player after its airtime — a shot you dodge by moving off the spot.
  _lobShell(world) {
    const p = world.player;
    const cx = this.x + this.w / 2, cy = this.y; // launch from the muzzle (top)
    const dx = (p.x + p.w / 2) - cx;
    const g = this.def.shellGravity, vy0 = this.def.shellVy;
    const airtime = (2 * vy0) / g;               // time to fall back to launch height
    let vx = dx / airtime;                        // land near the player
    const cap = this.def.shellVxMax;
    vx = Math.max(-cap, Math.min(cap, vx));
    world.spawnBullet(cx, cy, vx, -vy0, {
      from: 'enemy', damage: this.def.contactDamage, color: '#ffb14e',
      life: 240, w: 6, h: 6, gravity: g,
    });
  }

  // Boss cannon: slow bullets left at standing-chest height. A PRONE player
  // (hitbox top ~225 when grounded) ducks them all; standing takes the hit.
  // Enrage adds a 4th (higher, still chest) bullet and a redder tint.
  _cannonVolley(world) {
    // Volley height from the FIXED post height (baseY), NOT the bobbing this.y, so
    // the cannon fire stays at prone-duckable chest height as the boss hovers.
    const groundTop = (this.baseY ?? this.y) + this.h;
    const fx = this.x + 2;
    const ys = this.enraged
      ? [groundTop - 25, groundTop - 22, groundTop - 18, groundTop - 15]
      : [groundTop - 22, groundTop - 18, groundTop - 15];
    const color = this.enraged ? '#ff5a6e' : '#ff7ba8';
    for (const y of ys) {
      world.spawnBullet(fx, y, -this.def.shotSpeed, 0, {
        from: 'enemy', damage: this.def.contactDamage, color, life: 300, w: 6, h: 4,
      });
    }
  }

  takeDamage(dmg) {
    this.hp -= dmg;
    this.flash = 4;
    if (this.hp <= 0) this.dead = true;
  }
}
