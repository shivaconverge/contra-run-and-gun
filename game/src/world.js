// World: owns all sim state and advances it one fixed step at a time.
// Collision/scoring/feel wiring lives here so actors stay simple.
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { Bullet, Particle, Pickup, burst } from './entities.js';
import { Camera } from './camera.js';
import { Feel } from './feel.js';
import { FEEL, PLAYER, SIM, DIFFICULTY, ENEMIES, resolveTheme } from '../data/config.js';
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
    // Re-bind the ACTIVE level's geometry every reset. CRITICAL for stage transitions:
    // loadStage() swaps this.level then calls reset(), so without this the sim kept
    // colliding against the PREVIOUS stage's solids and the camera stayed clamped to
    // the old width — i.e. every stage past 1 in the normal (loadStage) play flow ran
    // on stage-1 geometry. (The ?level=N dev shortcut hid it: it constructs a fresh
    // World per stage, so the constructor set these correctly.) Mutating the camera's
    // bounds (not replacing the object) keeps any held reference valid.
    this.solids = this.level.solids;
    this.camera.levelW = this.level.width;
    this.camera.levelH = this.level.height;
    const s = this.level.playerStart;
    this.player = new Player(s.x, s.y);
    this.player.shield = this.modeDef.shield;
    // Resolved biome descriptor for THIS stage (data-driven). Render/audio read
    // world.theme to pick the backdrop/tileset/music without per-stage branches.
    this.theme = resolveTheme(this.level.theme);
    // Spawn enemies. A spawn may carry a per-stage `override` (folded onto its
    // archetype def) — used by the campaign ladder to give each stage's boss a
    // distinct identity/stats (name/hp/color/cadence) while reusing the PROVEN
    // behavior branch + arena. Keeps enemy.js untouched (it reads this.def.*).
    this.enemies = this.level.spawns.map((sp) => this._spawnEnemy(sp));
    // Generalized boss-finder: any archetype flagged def.isBoss (Sentinel, or the
    // Stage-2 chopper) — not a hardcoded kind — so new bosses register + get the HP
    // bar / callout / win path for free.
    this.boss = this.enemies.find((e) => e.def && e.def.isBoss) || null;
    this.bossActive = false;  // set once the arena is entered (shows HP bar)
    this.bossCallout = 0;     // "BOSS" title flash timer
    this.enrageFlash = 0;     // "ENRAGED" phase-2 callout timer
    this.pickups = (this.level.pickups || []).map((pk) => new Pickup(pk.weapon, pk.x, pk.y));
    // Per-stage SET-DRESSING props (inert data: {x, key, parallax?}). Bound off the
    // active level every reset (like solids/theme) so stage transitions swap the
    // biome's decor. render.js drawDecor blits each base-anchored to the ground.
    this.decor = this.level.decor || [];
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

  // Build one Enemy from a spawn record, applying an optional per-spawn `override`
  // that shadows fields on its archetype def (name/hp/color/cadence/size). The
  // behavior branch in enemy.js reads this.def.* so a stat re-skin needs no engine
  // change; hp/size are re-synced onto the instance since the ctor read the base def.
  _spawnEnemy(sp) {
    const e = new Enemy(sp.type, sp.x, sp.y);
    if (sp.override) {
      e.def = { ...e.def, ...sp.override };
      if (sp.override.hp !== undefined) e.hp = e.def.hp;
      if (sp.override.w !== undefined) e.w = e.def.w;
      if (sp.override.h !== undefined) e.h = e.def.h;
      // Cooldown seeds from fireEvery in the ctor; re-seed if the cadence changed.
      if (sp.override.fireEvery !== undefined) e.cooldown = Math.floor(e.def.fireEvery * 0.5);
    }
    return e;
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

  // ==========================================================================
  // HEADLESS CAMPAIGN SPINE SELFTEST (pure sim, no DOM — runnable under Node).
  // Asserts the INTENDED progression: boot stage 1 → its boss registers via the
  // isBoss finder → clearing it flips status to 'cleared' → the transition
  // (loadStage of the next entry, exactly what main.js requestNextStage does)
  // advances to stage 2 and REACHES stage 2's boss → repeat through all 7 →
  // clearing the LAST stage is terminal with NO next stage (== final VICTORY).
  // Carries score/lives across like the live transition. Force-kills each boss so
  // this measures the STATE MACHINE (a fact), NOT boss balance (a live-playtest
  // judgment — see content/stage2/WIRE.md). Returns a machine-readable report.
  //
  // Repro (from game/):
  //   node --input-type=module -e "import {World} from './src/world.js'; \
  //     import {STAGES} from './data/config.js'; \
  //     console.log(JSON.stringify(World.campaignSpineTest(STAGES),null,2))"
  // ==========================================================================
  static campaignSpineTest(stages, seed = 1234) {
    const errors = [];
    const stageReports = [];
    const ck = (cond, msg) => { if (!cond) errors.push(msg); return cond; };

    ck(Array.isArray(stages) && stages.length === 7,
      `expected a 7-stage ladder, got ${stages && stages.length}`);

    const world = new World(stages[0], seed, 'arcade');
    let carry = { score: 0, lives: world.lives };

    for (let i = 0; i < stages.length; i++) {
      const num = i + 1;
      const rep = { stage: num, name: world.level.name, theme: world.level.theme };

      // Boss must register on load via the generalized isBoss finder.
      ck(!!world.boss, `stage ${num}: no boss registered`);
      ck(world.boss && world.boss.def && world.boss.def.isBoss === true,
        `stage ${num}: registered boss is not flagged isBoss`);
      rep.status0 = world.status;
      rep.bossKind = world.boss && world.boss.kind;
      rep.bossName = world.boss && world.boss.def && world.boss.def.name;
      rep.bossHp = world.boss && world.boss.hp;
      ck(world.status === 'playing', `stage ${num}: should boot 'playing', got '${world.status}'`);

      // Boot integrity: step the real sim a beat with no input — must not throw
      // and must stay 'playing' (nothing clears a stage on its own at spawn).
      for (let f = 0; f < 30; f++) world.step({});
      ck(world.status === 'playing', `stage ${num}: left 'playing' during idle boot`);

      // Force-clear: destroy the boss, then step once so the win check fires.
      const boss = world.boss;
      let guard = 0;
      while (boss && !boss.dead && guard++ < 100) boss.takeDamage(999);
      world.step({});
      ck(world.status === 'cleared', `stage ${num}: boss down but status='${world.status}' (expected 'cleared')`);
      rep.cleared = world.status === 'cleared';

      carry = { score: world.score, lives: world.lives };

      if (i < stages.length - 1) {
        // Transition (== main.js requestNextStage): same world object, next level,
        // carry score/lives. Assert we REACH the next stage's boss.
        world.loadStage(stages[i + 1], carry);
        ck(world.level === stages[i + 1], `stage ${num}→${num + 1}: level did not advance`);
        ck(world.status === 'playing', `stage ${num + 1}: not 'playing' after transition`);
        ck(!!world.boss && world.boss.def.isBoss,
          `stage ${num + 1}: next boss not reached/registered after transition`);
        // GEOMETRY must switch with the level (regression guard for the loadStage bug
        // where sim collided against the previous stage's solids / stale camera width).
        ck(world.solids === stages[i + 1].solids,
          `stage ${num + 1}: world.solids did not switch to the new level's geometry`);
        ck(world.camera.levelW === stages[i + 1].width,
          `stage ${num + 1}: camera width bound did not switch to the new level`);
        rep.advancedTo = world.level.name;
      } else {
        // Final stage cleared → VICTORY: terminal 'cleared' with no next stage.
        rep.victory = world.status === 'cleared';
        ck(world.status === 'cleared', `final stage: expected terminal 'cleared' (victory)`);
      }
      stageReports.push(rep);
    }

    return {
      pass: errors.length === 0,
      stageCount: stages.length,
      finalScoreCarried: carry.score,
      stages: stageReports,
      errors,
    };
  }

  // ==========================================================================
  // BOSS DEFEATABILITY DRIVE (headless, aim-tracking spread bot at the barrier).
  // A COMPLETABILITY oracle: does a competent player actually kill this stage's
  // boss from the firing line, or does the fight STALL? Reproduces CHOP-1 — at
  // chopper sweepAmp 90 the enraged low-hover sweep sits outside the spread cone
  // and the fight stalls at the enrage threshold (31 HP) forever. Pins the player
  // at the barrier, 8-way aims the fan at the boss each frame, holds i-frames (we
  // measure damage output, not survival), and steps until the boss dies or the
  // frame budget runs out. Returns {defeated, killFrame, killSec, minHp, enraged}.
  //
  // FACTS-vs-judgments: this proves "can it die under continuous competent fire"
  // (a completability FACT), NOT the fight's FEEL/balance (a live-human judgment —
  // see content/stage2/WIRE.md instrument caveat). Fixed-position single-stream
  // weapons are noisy here; spread is the fair oracle (it's the fan this arena
  // wants + a Stage-2 pickup).
  static bossDefeatableTest(level, opts = {}) {
    const { weapon = 'spread', maxFrames = 5200, seed = 1234 } = opts;
    const w = new World(level, seed, 'arcade');
    w.enemies = w.enemies.filter((e) => e.def && e.def.isBoss);
    w.boss = w.enemies[0] || null;
    if (!w.boss) return { defeated: false, error: 'no boss', killFrame: -1, minHp: null };
    w.boss.active = true;
    // Firing line: just left of the arena barrier (bullets pass it, the player
    // does not). Grounded on the floor beneath that x.
    const barrier = level.solids.find((s) => s.kind === 'barrier');
    const lineX = barrier ? barrier.x - PLAYER.w - 4 : w.boss.x - 200;
    const ground = level.solids.find((s) => s.kind === 'ground' && lineX >= s.x && lineX <= s.x + s.w);
    const groundY = ground ? ground.y - PLAYER.h : 216;
    const p = w.player;
    p.setWeapon(weapon);
    p.x = lineX; p.y = groundY; p.vx = 0; p.vy = 0;
    w.camera.follow(p, true);
    let minHp = w.boss.hp, killFrame = -1;
    for (let i = 0; i < maxFrames; i++) {
      p.iframe = 999; // measure DPS/reach, not survival
      const bcx = w.boss.x + w.boss.w / 2, bcy = w.boss.y + w.boss.h / 2;
      const pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
      w.step({
        left: bcx < pcx - 6, right: bcx > pcx + 6,
        up: bcy < pcy - 6, down: bcy > pcy + 6,
        fire: true, jump: false, swap: false, jumpPressed: false, swapPressed: false,
      });
      if (!w.boss.dead) minHp = Math.min(minHp, w.boss.hp);
      if (w.boss.dead) { killFrame = i; break; }
    }
    return {
      defeated: killFrame >= 0,
      killFrame,
      killSec: killFrame >= 0 ? +(killFrame / SIM.STEP_HZ).toFixed(1) : null,
      minHp,
      enraged: !!w.boss.enraged,
      bossName: w.boss.def.name,
    };
  }

  // Run the defeatability drive across the whole ladder. Asserts EVERY stage's boss
  // is killable with spread from the barrier inside the budget — the regression
  // guard that keeps the campaign actually completable to victory (would FAIL if the
  // chopper sweepAmp stall, or any future unwinnable boss, returns).
  static campaignDefeatabilityTest(stages, opts = {}) {
    const results = stages.map((lvl, i) => ({ stage: i + 1, name: lvl.name, ...World.bossDefeatableTest(lvl, opts) }));
    const undefeated = results.filter((r) => !r.defeated);
    return { pass: undefeated.length === 0, results, undefeated };
  }

  // FOOTING guard: every GROUND-resting spawn (a gravity grunt, or a stationary
  // turret/mortar emplacement) must sit over a `kind:'ground'` solid — otherwise a
  // grunt falls straight into a pit (wasted spawn) or an emplacement hangs in the
  // air over a chasm. Flyers/bosses are airborne and exempt. Guards the per-stage
  // enemy MIX so a future spawn edit can't silently float a unit off the map.
  static validateFooting(stages) {
    const GROUNDED = new Set(['grunt', 'turret', 'mortar']);
    const violations = [];
    stages.forEach((lvl, i) => {
      for (const sp of lvl.spawns) {
        if (!GROUNDED.has(sp.type)) continue;
        const arche = ENEMIES[sp.type];
        const cx = sp.x + (arche ? arche.w / 2 : 0);
        const onGround = lvl.solids.some((s) => s.kind === 'ground' && cx >= s.x && cx <= s.x + s.w);
        if (!onGround) violations.push({ stage: i + 1, type: sp.type, x: sp.x });
      }
    });
    return { pass: violations.length === 0, violations };
  }

  // SET-DRESSING guard: every level.decor prop is BASE-anchored (its bottom sits on the
  // ground under `x`), so `x` MUST be over a `kind:'ground'` solid and `key` must be a
  // decor_* sprite id. Keeps the per-stage set-dressing data well-formed for whenever
  // render.js blits it (props are inert until then). Returns the flat prop list too, so
  // an asset harness can cross-check the keys against the manifest.
  static validateDecor(stages) {
    const violations = [];
    const keys = new Set();
    stages.forEach((lvl, i) => {
      for (const d of (lvl.decor || [])) {
        keys.add(d.key);
        const badKey = typeof d.key !== 'string' || !d.key.startsWith('decor_');
        const onGround = lvl.solids.some((s) => s.kind === 'ground' && d.x >= s.x && d.x <= s.x + s.w);
        if (badKey) violations.push({ stage: i + 1, x: d.x, reason: 'bad key ' + d.key });
        else if (!onGround) violations.push({ stage: i + 1, x: d.x, key: d.key, reason: 'x not over ground' });
      }
    });
    return { pass: violations.length === 0, violations, keys: [...keys] };
  }

  // CAMPAIGN STRUCTURE guard — the GOAL's per-stage-DISTINCTNESS + escalation invariants,
  // as one committed regression check. Motivated by a real miss: a prior cycle silently
  // DROPPED enemy density after stage 2 and every existing guard (spine/defeatable/
  // footing/decor) still passed — the regression was only found by hand-counting. This
  // asserts the structural facts so that class of drift fails loudly next time:
  //   • 7 stages, each with UNIQUE geometry (no two share a solids array) and a UNIQUE
  //     theme id — i.e. no reskin/biome-collision regression.
  //   • each stage registers EXACTLY ONE isBoss spawn (the win target).
  //   • difficulty ESCALATES: non-boss enemy density is non-decreasing across the
  //     post-opening stages (S2→S7) and the finale (S7) is the densest AND its boss HP
  //     is the campaign maximum.
  // Structural invariants (facts), NOT a fairness/fun verdict — that stays human-playtest.
  static validateCampaignStructure(stages) {
    const errors = [];
    const ck = (c, m) => { if (!c) errors.push(m); };
    ck(stages.length === 7, `expected 7 stages, got ${stages.length}`);

    // Unique geometry + unique theme (distinctness).
    ck(new Set(stages.map((s) => s.solids)).size === stages.length,
      'geometry reuse: two stages share a solids array (reskin regression)');
    ck(new Set(stages.map((s) => s.theme)).size === stages.length,
      'theme collision: two stages share a theme id');

    // Exactly one boss per stage.
    const density = [];
    stages.forEach((s, i) => {
      const bosses = s.spawns.filter((sp) => ENEMIES[sp.type] && ENEMIES[sp.type].isBoss);
      ck(bosses.length === 1, `stage ${i + 1}: expected exactly 1 boss spawn, got ${bosses.length}`);
      density[i] = s.spawns.length - bosses.length; // non-boss enemy count
    });

    // Escalation: non-decreasing density S2→S7, finale is the densest.
    for (let i = 2; i < density.length; i++) {
      ck(density[i] >= density[i - 1],
        `difficulty regression: stage ${i + 1} density ${density[i]} < stage ${i} density ${density[i - 1]}`);
    }
    const maxDensity = Math.max(...density);
    ck(density[density.length - 1] === maxDensity,
      `finale (stage 7) density ${density[density.length - 1]} is not the campaign max (${maxDensity})`);

    // Finale boss HP is the campaign max (the hardest fight last).
    const bossHp = stages.map((s) => {
      const b = s.spawns.find((sp) => ENEMIES[sp.type] && ENEMIES[sp.type].isBoss);
      return b.override && b.override.hp !== undefined ? b.override.hp : ENEMIES[b.type].hp;
    });
    ck(bossHp[6] === Math.max(...bossHp),
      `finale boss HP ${bossHp[6]} is not the campaign max (${Math.max(...bossHp)})`);

    return { pass: errors.length === 0, errors, density, bossHp };
  }

  // RESPAWN-SAFETY guard — a pit death must NEVER respawn the player back into a pit,
  // or the campaign dead-ends in an infinite death loop (game over → retry → fall →
  // repeat). This is a real risk on the 5 authored GAP-heavy stages (canyons/crevasses/
  // moats). It exercises the ACTUAL respawn logic (_safeGroundX, from _doRespawn) across
  // every camera position in every stage and asserts the chosen respawn x sits over a
  // `kind:'ground'` solid — plus one END-TO-END pit-death→respawn per stage that must
  // leave the player alive and grounded. Guards the geometry this loop authored.
  static validateRespawnSafety(stages) {
    const violations = [];
    stages.forEach((lvl, i) => {
      const w = new World(lvl, 1234, 'arcade');
      const overGround = (cx) => lvl.solids.some((s) => s.kind === 'ground' && cx >= s.x && cx <= s.x + s.w);
      // Sample every camera position: the respawn x must land over ground.
      for (let camX = 0; camX <= lvl.width; camX += 32) {
        w.camera.x = camX;
        const rx = w._safeGroundX(Math.max(camX + 40, 20));
        if (!overGround(rx + w.player.w / 2)) {
          violations.push({ stage: i + 1, camX, rx, reason: 'respawn x not over ground' });
        }
      }
      // End-to-end: drop the player into a gap and run the real respawn cycle.
      const gapMid = (() => {
        const grounds = lvl.solids.filter((s) => s.kind === 'ground').sort((a, b) => a.x - b.x);
        for (let g = 0; g < grounds.length - 1; g++) {
          const gapStart = grounds[g].x + grounds[g].w, gapEnd = grounds[g + 1].x;
          if (gapEnd > gapStart) return (gapStart + gapEnd) / 2; // midpoint of the first pit
        }
        return null;
      })();
      if (gapMid !== null) {
        const w2 = new World(lvl, 1234, 'arcade');
        w2.camera.x = Math.max(0, gapMid - 100);
        w2.player.x = gapMid; w2.player.y = lvl.gravityFloor + 10; // in the pit, below floor
        w2._onPitFall();
        for (let f = 0; f < 80 && w2.status === 'playing'; f++) w2.step({});
        const p = w2.player;
        const grounded = overGround(p.x + p.w / 2);
        if (w2.status === 'playing' && (p.dead || !grounded)) {
          violations.push({ stage: i + 1, gapMid, reason: 'post-pit respawn left player dead/ungrounded', px: Math.round(p.x), dead: p.dead });
        }
      }
    });
    return { pass: violations.length === 0, violations };
  }
}
