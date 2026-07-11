// World: owns all sim state and advances it one fixed step at a time.
// Collision/scoring/feel wiring lives here so actors stay simple.
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { Bullet, Particle, Pickup, burst } from './entities.js';
import { Camera } from './camera.js';
import { Feel } from './feel.js';
import { FEEL, PLAYER, SIM, DIFFICULTY } from '../data/config.js';
import { makeRng, aabbOverlap } from './util.js';

const ACTIVATE_MARGIN = 56; // px beyond the view where a dormant enemy wakes

export class World {
  constructor(level, seed = 1234, mode = DIFFICULTY.default) {
    this.level = level;
    this.rng = makeRng(seed);
    this.feel = new Feel(this.rng);
    this.solids = level.solids;
    this.camera = new Camera(level.width, level.height);
    this.modeKey = DIFFICULTY.modes[mode] ? mode : DIFFICULTY.default;
    this.reset();
  }

  get modeDef() { return DIFFICULTY.modes[this.modeKey]; }

  // Switch difficulty and restart the stage (live 1/2 toggle).
  setMode(mode) {
    if (!DIFFICULTY.modes[mode]) return;
    const wasTitle = this.status === 'title';
    this.modeKey = mode;
    this.reset();
    if (wasTitle) this.status = 'title'; // mode-select on the title screen doesn't start play
  }

  // Arcade entry: sit on a title/start screen (live only; headless boots straight
  // into 'playing' so the deterministic capture harnesses are unaffected).
  toTitle() { this.reset(); this.status = 'title'; }
  start() { this.reset(); } // reset() sets status='playing'

  // Load a NEW stage into THIS same world object — so the live-loop closures
  // (feedback panel, audio, HI-score) keep valid references (no reassignment).
  // Re-inits from the new level, then CARRIES the run's score/lives across; the
  // weapon reverts to the default rifle (arcade single-slot). Used by the
  // player-initiated Stage-1→Stage-2 transition in main.js. LIVE-only path.
  loadStage(level, carry) {
    this.level = level;
    this.reset(); // status → 'playing', fresh enemies/pickups for the new stage
    if (carry) {
      if (carry.score !== undefined) this.score = carry.score;
      if (carry.lives !== undefined) this.lives = carry.lives;
    }
  }

  reset() {
    const s = this.level.playerStart;
    this.player = new Player(s.x, s.y);
    this.player.shield = this.modeDef.shield;
    this.enemies = this.level.spawns.map((sp) => new Enemy(sp.type, sp.x, sp.y));
    // Generalized boss-finder: any archetype flagged def.isBoss (Sentinel, or the
    // Stage-2 chopper) — not a hardcoded kind — so new bosses register + get the HP
    // bar / callout / win path for free.
    this.boss = this.enemies.find((e) => e.def && e.def.isBoss) || null;
    this.bossActive = false;  // set once the arena is entered (shows HP bar)
    this.bossCallout = 0;     // "BOSS" title flash timer
    this.enrageFlash = 0;     // "ENRAGED" phase-2 callout timer
    this.pickups = (this.level.pickups || []).map((pk) => new Pickup(pk.weapon, pk.x, pk.y));
    this.bullets = [];
    this.particles = [];
    this.fx = []; // visual-only strip animations (explosions); no RNG, not sim-critical
    this.fxSpawned = 0; // cumulative explosion count (verification / observability)
    this.score = 0;
    this.lives = this.modeDef.lives;
    this.frame = 0;
    this.status = 'playing'; // playing | cleared | gameover
    this.respawnTimer = 0;
    this.onScreenEnemies = 0; // live density readout
    this.peakOnScreen = 0;    // max concurrent on-screen enemies this run (FACT)
    this.sfxEvents = [];      // SFX event names emitted this run (drained by the live loop)
    this.paused = false;      // LIVE-only freeze (main.js toggles on P / touch Pause)
    this.camera.follow(this.player, true);
  }

  // Record a sound-effect trigger. Pure output (strings only) — never touches sim
  // state or RNG, so the deterministic sim is unaffected and headless stays silent.
  emit(name) { this.sfxEvents.push(name); }
  // Live loop drains queued events each frame and hands them to the AudioKit.
  drainSfx() { const e = this.sfxEvents; this.sfxEvents = []; return e; }

  spawnBullet(x, y, vx, vy, opts) {
    this.bullets.push(new Bullet(x, y, vx, vy, opts));
  }

  // Visual-only strip animation (e.g. an enemy-death explosion). It carries a
  // step counter `t` and a lifetime in sim steps; the renderer slices the frame
  // from `t`. It consumes NO rng and touches no actor, so the deterministic sim/
  // replay stream is byte-identical whether or not FX are present. `life` is in
  // sim steps: explosion = 4 frames x 3 steps/frame (18fps strip at 60Hz sim).
  spawnFx(kind, x, y) {
    const life = kind === 'explosion' ? 12 : kind === 'splash' ? 22 : kind === 'landdust' ? 12 : 6;
    this.fx.push({ kind, x, y, t: 0, life });
    this.fxSpawned++;
  }

  spawnMuzzleSpark(x, y, aim) {
    for (let i = 0; i < 4; i++) {
      const spd = 1 + this.rng() * 1.6;
      this.particles.push(new Particle(
        x, y,
        aim.x * spd + (this.rng() - 0.5), aim.y * spd + (this.rng() - 0.5),
        { life: 20 + this.rng() * 10, size: 1 + Math.floor(this.rng() * 2), color: '#fff2b0', gravity: 0 }
      ));
    }
  }

  // Sparks kicked back off a wall/floor where a bullet struck. Directions are
  // derived from the bullet velocity (no RNG) so the deterministic sim/replay
  // stream is unchanged — only the on-screen juice is added.
  _impactSpark(b) {
    const m = Math.hypot(b.vx, b.vy) || 1;
    const base = Math.atan2(-b.vy / m, -b.vx / m); // back toward where it came from
    for (let i = 0; i < 4; i++) {
      const a = base + (i - 1.5) * 0.5;
      const s = 1.3 + (i % 2) * 0.7;
      this.particles.push(new Particle(
        b.x, b.y, Math.cos(a) * s, Math.sin(a) * s,
        { life: 7 + i, size: 1, color: b.color, gravity: 0.06, drag: 0.9 }
      ));
    }
  }

  // Boss crosses the phase-2 threshold: a jolt + "ENRAGED" callout + a spark
  // burst, so the escalation reads clearly to the player.
  onBossEnrage(e) {
    this.enrageFlash = 90;
    this.feel.freeze(8);
    this.feel.addTrauma(0.9);
    this.emit('bossEnrage');
    burst(this.particles, e.x + e.w / 2, e.y + e.h / 2, this.rng,
      { count: 14, color: '#ff5a6e', speed: 3.2, life: 22 });
  }

  // Big multi-blast finale when the boss dies: a spread of explosions across
  // its body + heavy shake + long hit-stop. Explosions are visual-only (no RNG).
  _bossDeath(e) {
    this.feel.freeze(18);
    this.feel.addTrauma(1);
    this.emit('bossDeath');
    const cols = [0.2, 0.5, 0.8], rows = [0.3, 0.7];
    for (const cx of cols) for (const ry of rows) {
      this.spawnFx('explosion', e.x + e.w * cx, e.y + e.h * ry);
    }
    burst(this.particles, e.x + e.w / 2, e.y + e.h / 2, this.rng,
      { count: 40, color: e.def.color, speed: 4.5, life: 40 });
  }

  // Advance exactly one fixed step.
  step(inp) {
    // Frozen on the title screen — UNLESS attract-demo mode is on, where a live
    // bot plays the game behind the title (arcade attract mode). Headless/self-
    // tests never set `attract`, so title stays frozen there (determinism intact).
    if (this.status === 'title' && !this.attract) return;
    // PAUSED (live only — main.js toggles world.paused on P / the touch Pause
    // button). Headless + self-tests never set it, so the deterministic capture
    // stream is untouched; this mirrors the attract/title live-only guard above.
    if (this.paused) return;
    this.frame++;

    // Hit-stop holds the whole sim frozen (feel.tick returns false while held),
    // but timers/particles still breathe a touch for readability.
    const live = this.feel.tick();
    if (!live) {
      for (const pt of this.particles) pt.step();
      this.particles = this.particles.filter((p) => !p.dead);
      return;
    }

    // Run the gameplay update while PLAYING, or during the ATTRACT demo (the
    // title-screen bot). `attract` keeps status='title' but drives the player so
    // the demo actually plays; victory/goal transitions are suppressed in attract
    // (the demo loops before the boss anyway) so it never leaves the title.
    if (this.status === 'playing' || this.attract) {
      if (this.respawnTimer > 0) {
        this.player.updateDeath(); // animate the Contra death-fling while held
        this.respawnTimer--;
        if (this.respawnTimer === 0) this._doRespawn();
      } else {
        this.player.update(inp, this);
        // PIT DEATH: fell through a chasm past the world floor → lose a life.
        if (!this.player.dead && this.player.y > this.level.gravityFloor) this._onPitFall();
        if (this.player.dead && this.respawnTimer === 0) this._onPlayerDeath();
        // Victory (real play only): defeat the boss, else reach the goal.
        if (!this.attract) {
          const won = this.boss ? this.boss.dead : this.player.x + this.player.w / 2 >= this.level.goalX;
          if (won) { this.status = 'cleared'; this.emit('clear'); }
        }
      }
    }

    // Activation-gated update: enemies stay dormant (do not move/fire) until the
    // camera nears them, so level clusters are fought as groups.
    const camL = this.camera.x, camR = camL + SIM.VIEW_W;
    for (const e of this.enemies) {
      if (!e.active) {
        if (e.x + e.w > camL - ACTIVATE_MARGIN && e.x < camR + ACTIVATE_MARGIN) e.active = true;
        else continue;
      }
      e.update(this);
    }
    // Boss arena: raise the HP bar + "BOSS" callout the first time it wakes.
    if (this.boss && this.boss.active && !this.bossActive) { this.bossActive = true; this.bossCallout = 100; }
    if (this.bossCallout > 0) this.bossCallout--;
    if (this.enrageFlash > 0) this.enrageFlash--;

    for (const b of this.bullets) {
      b.step(this.solids);
      if (b.hitSolid) this._impactSpark(b); // back-scatter sparks off geometry
    }
    for (const pt of this.particles) pt.step();
    for (const pk of this.pickups) pk.step();
    for (const fx of this.fx) fx.t++; // hold on frame 0 during the kill's hit-stop, then animate

    this._resolveCombat();
    this._resolvePickups();

    // Safety net: any actor that falls into the chasm is despawned (no stray
    // enemy falling forever off-screen). No score — it wasn't shot.
    for (const e of this.enemies) if (e.y > this.level.gravityFloor + 40) e.dead = true;
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.particles = this.particles.filter((p) => !p.dead);
    this.pickups = this.pickups.filter((pk) => !pk.dead);
    this.fx = this.fx.filter((fx) => fx.t < fx.life);

    // Density readout: how many living enemies are within the view right now.
    let onScreen = 0;
    for (const e of this.enemies) if (e.x + e.w > camL && e.x < camR) onScreen++;
    this.onScreenEnemies = onScreen;
    if (onScreen > this.peakOnScreen) this.peakOnScreen = onScreen;

    this.camera.follow(this.player);
  }

  _resolveCombat() {
    const p = this.player;

    // player bullets -> enemies. A PIERCE bullet (laser) passes through, damaging
    // each enemy once (tracked in b.hit); a normal bullet dies on first contact.
    for (const b of this.bullets) {
      if (b.from !== 'player' || b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (!aabbOverlap(b, e)) continue;
        if (b.pierce) { if (b.hit.has(e)) continue; b.hit.add(e); }
        e.takeDamage(b.damage);
        if (!b.pierce) b.dead = true;
        burst(this.particles, b.x, b.y, this.rng, { count: 5, color: e.def.color, speed: 1.8, life: 12 });
        if (e.dead) {
          this.score += e.def.score;
          this.feel.freeze(FEEL.hitStopKill);
          this.feel.addTrauma(FEEL.traumaKill);
          burst(this.particles, e.x + e.w / 2, e.y + e.h / 2, this.rng, { count: 16, color: e.def.color, speed: 3.2, life: 26 });
          this.spawnFx('explosion', e.x + e.w / 2, e.y + e.h / 2); // blitted strip over the debris
          if (e.def && e.def.isBoss) this._bossDeath(e);
          else this.emit('explosion');
        } else {
          this.feel.freeze(FEEL.hitStopHit);
          this.emit(e.def && e.def.isBoss ? 'bossHit' : 'enemyHit');
        }
        if (!b.pierce) break;
      }
    }

    if (p.dead || this.respawnTimer > 0) return;

    // enemy bullets -> player (one-hit death)
    for (const b of this.bullets) {
      if (b.from !== 'enemy' || b.dead) continue;
      if (aabbOverlap(b, p)) {
        if (p.takeHit(b.x)) this._onHurt();
        b.dead = true;
      }
    }
    // enemy bodies -> player (one-hit death)
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (aabbOverlap(e, p)) {
        if (p.takeHit(e.x + e.w / 2)) this._onHurt();
      }
    }
  }

  // Player grabs a weapon capsule: it replaces the single weapon slot.
  _resolvePickups() {
    const p = this.player;
    if (p.dead || this.respawnTimer > 0) return;
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      if (aabbOverlap(pk, p)) {
        p.setWeapon(pk.weapon);
        pk.dead = true;
        this.emit('pickup');
        this.feel.addTrauma(0.12);
        burst(this.particles, pk.x + pk.w / 2, pk.y + pk.h / 2, this.rng,
          { count: 10, color: '#8ef0ff', speed: 2.2, life: 18 });
      }
    }
  }

  _onHurt() {
    this.feel.freeze(FEEL.hitStopPlayerHurt);
    this.feel.addTrauma(FEEL.traumaPlayerHurt);
    this.emit(this.player.dead ? 'hurt' : 'shield'); // death vs CASUAL shield-absorb
    burst(this.particles, this.player.x + this.player.w / 2, this.player.y + this.player.h / 2, this.rng,
      { count: 12, color: '#ff5252', speed: 2.6, life: 20 });
    if (this.player.dead) this._onPlayerDeath();
  }

  _onPlayerDeath() {
    // Death gets its own explosion (bigger than the shield-absorb burst): a warm
    // blast + debris at the body, so a lost life reads as a real event.
    const px = this.player.x + this.player.w / 2, py = this.player.y + this.player.h / 2;
    this.spawnFx('explosion', px, py);
    burst(this.particles, px, py, this.rng, { count: 20, color: '#ffd27a', speed: 3.4, life: 30 });
    burst(this.particles, px, py, this.rng, { count: 12, color: '#ff5252', speed: 2.2, life: 24 });
    // Contra invariant: losing a life reverts the weapon to the default rifle.
    this.player.resetWeapon();
    this.lives--;
    if (this.lives < 0) { this.status = 'gameover'; this.emit('gameover'); return; }
    this.respawnTimer = 48;
  }

  // A fall through the chasm is lethal (one-hit, same as a bullet) — no fling
  // (the player is already falling), a short trauma, then the standard respawn.
  _onPitFall() {
    const p = this.player;
    p.dead = true;
    p.dying = false; // fell, wasn't flung
    this.feel.addTrauma(0.3);
    // Fell into the BRIDGE WATER (vs the dry chasm)? Spawn a splash at the surface
    // so the water hazard READS as "you fell in the water", not a generic pit. FX
    // are cosmetic (no rng) so determinism is untouched. `emit('splash')` lets the
    // live audio layer play a splash without the sim depending on it.
    const cx = p.x + p.w / 2;
    const wr = (this.level.water || []).find((w) => cx >= w.x && cx <= w.x + w.w);
    if (wr) { this.spawnFx('splash', cx, wr.y); this.emit('splash'); }
    this.emit('hurt');
    this._onPlayerDeath();
  }

  // Nearest x at/left of `x` that sits over SOLID GROUND, so a respawn never
  // drops the player straight back into the chasm (no death loop). Deterministic.
  _safeGroundX(x) {
    const overGround = (cx) => this.solids.some((s) => s.kind === 'ground' && cx >= s.x && cx <= s.x + s.w);
    let cx = x;
    for (let i = 0; i < 600 && !overGround(cx + this.player.w / 2); i++) cx -= 4;
    return Math.max(20, cx);
  }

  _doRespawn() {
    const p = this.player;
    // respawn a little to the left of where we fell, nudged onto solid ground
    const rx = this._safeGroundX(Math.max(this.camera.x + 40, 20));
    p.x = rx; p.y = this.level.playerStart.y;
    p.vx = 0; p.vy = 0;
    p.h = PLAYER.h; p.prone = false; // always respawn standing
    p.dead = false;
    p.dying = false; p.deathAngle = 0; p.vx = 0; p.vy = 0; // end the death arc
    p.shield = this.modeDef.shield;    // restore the CASUAL shield on respawn
    p.resetWeapon();
    p.iframe = PLAYER.respawnProtect;  // brief spawn-in invulnerability (blink)
    p.flash = 12;
  }
}
