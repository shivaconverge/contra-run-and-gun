// In-engine behavior tests. These run against the REAL World/Player/physics
// (no mocks) and assert INTENDED mechanics, so a regression shows up as a
// failing check rather than a silently-passing green. Invoked via ?selftest=1.
import { World } from './world.js';
import { Player } from './player.js';
import { Enemy, TELEGRAPH_FRAMES } from './enemy.js';
import { Bullet, Pickup } from './entities.js';
import { moveAndCollide } from './physics.js';
import { CombinedInput } from './input.js';
import { aabbOverlap } from './util.js';
import { LEVEL1 } from '../data/level1.js';
import { LEVEL2 } from '../data/level2.js';
import { ASSET_MANIFEST } from '../data/assets.js';
import { PLAYER, WEAPONS, ENEMIES, STAGES } from '../data/config.js';
import { AudioKit } from './audio.js';
import { MusicKit } from './music.js';

export function runSelfTest() {
  const results = [];
  const check = (name, cond, detail = '') =>
    results.push({ name, pass: !!cond, detail });

  // 1. AABB collision: a body falling under gravity lands on the ground,
  //    becomes grounded, stops, and rests exactly on the surface (no sink/
  //    tunnel). Step several frames so it actually reaches the floor.
  {
    const body = { x: 100, y: 200, w: 12, h: 20, vx: 0, vy: 0 };
    let grounded = false;
    for (let i = 0; i < 30 && !grounded; i++) {
      body.vy = Math.min(body.vy + 0.5, 9); // gravity, capped like PHYSICS
      grounded = moveAndCollide(body, LEVEL1.solids).grounded;
    }
    check('collision.grounded', grounded && body.vy === 0, `vy=${body.vy}`);
    check('collision.restsOnTop', Math.abs(body.y + body.h - 236) < 0.001, `y=${body.y}`);
  }

  // 2. ONE-HIT DEATH (Contra HARD INVARIANT): any hit is lethal; a hit while
  //    invulnerable (spawn protection) is ignored.
  {
    const p = new Player(40, 180);
    const hit1 = p.takeHit(0);
    check('onehit.dies', hit1 === true && p.dead === true, `dead=${p.dead}`);

    const p2 = new Player(40, 180);
    p2.iframe = 30; // spawn protection active
    const blocked = p2.takeHit(0);
    check('onehit.invulnBlocks', blocked === false && p2.dead === false, `dead=${p2.dead}`);
  }

  // 2b. CASUAL difficulty: the opt-in shield absorbs hits (survives) until
  //     drained, THEN one-hit death resumes. ARCADE default is unchanged (no
  //     shield → dies on the first hit, asserted above).
  {
    const w = new World(LEVEL1, 3, 'casual');
    const p = w.player;
    check('casual.startsWithShield', p.shield === 2 && w.lives === 5, `shield=${p.shield} lives=${w.lives}`);
    const h1 = p.takeHit(0);
    check('casual.shieldAbsorbs', h1 === true && !p.dead && p.shield === 1, `dead=${p.dead} shield=${p.shield}`);
    p.iframe = 0; p.takeHit(0);
    check('casual.shieldDrains', !p.dead && p.shield === 0, `dead=${p.dead} shield=${p.shield}`);
    p.iframe = 0; p.takeHit(0);
    check('casual.diesWhenDrained', p.dead === true, `dead=${p.dead}`);

    // ARCADE default really has no shield (guards against a default regression).
    const wa = new World(LEVEL1, 3);
    check('arcade.noShield', wa.player.shield === 0 && wa.lives === 3, `shield=${wa.player.shield} lives=${wa.lives}`);
  }

  // 3. Death -> life lost -> WEAPON REVERTS TO RIFLE -> respawn restores control.
  {
    const w = new World(LEVEL1, 7);
    w.lives = 3;
    w.player.setWeapon('spread');
    check('death.hadSpread', w.player.weaponKey === 'spread', `w=${w.player.weaponKey}`);
    w.player.dead = true;
    w._onPlayerDeath();
    check('death.lifeLost', w.lives === 2, `lives=${w.lives}`);
    check('death.weaponReverts', w.player.weaponKey === PLAYER.defaultWeapon, `w=${w.player.weaponKey}`);
    check('death.respawnQueued', w.respawnTimer > 0, `t=${w.respawnTimer}`);
    const noInput = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    for (let i = 0; i < 60 && w.respawnTimer > 0; i++) w.step(noInput);
    check('respawn.aliveAgain', !w.player.dead && w.player.iframe > 0, `dead=${w.player.dead} iframe=${w.player.iframe}`);
  }

  // 3b. Weapon PICKUP replaces the single slot (single-slot economy).
  {
    const w = new World(LEVEL1, 13);
    check('pickup.startsRifle', w.player.weaponKey === PLAYER.defaultWeapon, `w=${w.player.weaponKey}`);
    const before = w.pickups.length;
    w.pickups.push(new Pickup('spread', w.player.x, w.player.y));
    const noInput = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    w.step(noInput);
    check('pickup.grantsSpread', w.player.weaponKey === 'spread', `w=${w.player.weaponKey}`);
    check('pickup.consumed', w.pickups.length === before, `n=${w.pickups.length} (was ${before + 1})`);
  }

  // 4. Player bullet kills an enemy: enemy removed, score awarded, hit-stop set.
  {
    const w = new World(LEVEL1, 9);
    const e = w.enemies[0];
    const scoreBefore = w.score;
    // place a lethal bullet on top of the enemy
    w.bullets.push(new Bullet(e.x + e.w / 2, e.y + e.h / 2, 0, 0, { from: 'player', damage: 99 }));
    const noInput = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    w.step(noInput);
    check('kill.enemyRemoved', w.enemies.indexOf(e) === -1, `alive=${w.enemies.length}`);
    check('kill.scoreAwarded', w.score === scoreBefore + e.def.score, `score=${w.score}`);
    check('kill.hitStop', w.feel.hitStop > 0 || w.feel.trauma > 0, `hs=${w.feel.hitStop} tr=${w.feel.trauma}`);
  }

  // 5. Victory is gated on the BOSS (Stage-1 has one): reaching the goal X does
  //    NOT clear while the boss lives; defeating the boss does.
  {
    const w = new World(LEVEL1, 11);
    const noInput = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    w.player.x = LEVEL1.goalX + 5;
    w.player.iframe = 600; // invulnerable so boss contact doesn't confound the gate
    w.step(noInput);
    check('victory.notByGoalWhileBossAlive', w.status === 'playing', `status=${w.status} bossDead=${w.boss && w.boss.dead}`);
    // now defeat the boss
    w.boss.hp = 1; w.boss.takeDamage(99);
    w.step(noInput);
    check('victory.bossDefeatClears', w.status === 'cleared', `status=${w.status}`);
  }

  // 5b. Boss cannon volley is fair: every bullet sits at standing-chest height
  //     that a PRONE player (grounded hitbox top = 236 − proneH = 225) ducks.
  {
    const w = new World(LEVEL1, 12);
    w.bullets = [];
    w.boss._cannonVolley(w);
    const proneTop = 236 - PLAYER.proneH;
    const shots = w.bullets.filter((b) => b.from === 'enemy');
    const allDuckable = shots.length >= 3 && shots.every((b) => (b.y + b.h) <= proneTop + 0.001);
    // and they WOULD hit a standing player (box 216..236)
    const allHitStanding = shots.every((b) => b.y < 236 && b.y + b.h > 216);
    check('boss.volleyProneDuckable', allDuckable, `n=${shots.length} maxBottom=${Math.max(...shots.map((b) => b.y + b.h))}`);
    check('boss.volleyHitsStanding', allHitStanding, `n=${shots.length}`);
  }

  // 5c. WIN-PATH integration: a player proned at the arena firing Spread ducks
  //     every cannon volley and kills the boss → stage clears, player survives.
  //     This is the real "the boss is beatable and fair" grounding (live sim).
  {
    const w = new World(LEVEL1, 5);
    w.enemies = w.enemies.filter((e) => e.kind === 'boss');
    w.boss = w.enemies[0];
    const p = w.player;
    p.setWeapon('spread');
    p.x = 2285; p.y = 210; // at the barrier, left of the boss
    w.camera.follow(p, true);
    const prone = { left: false, right: false, up: false, down: true, jump: false, fire: true, swap: false, jumpPressed: false, swapPressed: false };
    let steps = 0;
    for (; steps < 1400 && w.status === 'playing'; steps++) w.step(prone);
    check('boss.beatableByProne', w.status === 'cleared' && !p.dead, `status=${w.status} dead=${p.dead} lives=${w.lives} steps=${steps}`);
  }

  // 5c-int. INTEGRATED SPINE (strategy task_close_boss_win_spine_before_widen):
  //     prove ONE continuous run holds together from level START → through the
  //     stage (enemy clusters, the mortar, the CHASM jump) → the boss → WIN. A
  //     ledge-aware run-right + fire bot with demo invincibility (so it survives
  //     enemy fire) drives the REAL sim from spawn. This is PATH/integration
  //     evidence — no soft-lock, the boss is reachable + killable and victory
  //     fires end-to-end — NOT a fairness proof (feel is human-gated). It also
  //     retro-validates that the mortar + chasm widening didn't break the spine.
  {
    const w = new World(LEVEL1, 3);
    w.player.setWeapon('machine'); // strong enough to fell the boss within the budget
    let reachedBoss = false, maxX = 0, cleared = false;
    for (let i = 0; i < 6000; i++) {
      const p = w.player;
      p.iframe = 999; // demo-only invincibility to ENEMY fire (pit falls still cost a life)
      // Ledge-aware jump: hop only when the ground ends just ahead (clears the
      // chasm + any gap at full running speed), else run flat to build speed.
      const aheadX = p.x + p.w + 10, footY = p.y + p.h + 4;
      const groundAhead = w.solids.some((s) => s.kind === 'ground' && aheadX >= s.x && aheadX <= s.x + s.w && footY >= s.y && footY <= s.y + s.h + 4);
      const jump = p.grounded && !groundAhead;
      w.step({ left: false, right: true, up: false, down: false, jump, fire: true, swap: false, jumpPressed: jump, swapPressed: false });
      maxX = Math.max(maxX, p.x);
      if (w.bossActive) reachedBoss = true;
      if (w.status === 'cleared') { cleared = true; break; }
      if (w.status === 'gameover') break;
    }
    check('spine.reachesBossFromStart', reachedBoss && maxX > 2200, `maxX=${maxX.toFixed(0)} reachedBoss=${reachedBoss} status=${w.status}`);
    check('spine.startToBossWinIntegrated', cleared, `cleared=${cleared} status=${w.status} maxX=${maxX.toFixed(0)}`);
  }

  // 5d. BOSS-DEATH FINALE: killing the boss with a PLAYER BULLET (via _resolveCombat,
  //     the real kill path — NOT a direct takeDamage) fires the multi-blast climax:
  //     _bossDeath spawns the 6-explosion cluster, the boss score is awarded, the
  //     sim hit-stop-freezes, and 'bossDeath' SFX emits. Locks the finale FX that
  //     scenario=bosskill made witnessable (EXPL-1) so it can't silently regress.
  {
    const w = new World(LEVEL1, 7);
    w.enemies = w.enemies.filter((e) => e.kind === 'boss');
    w.boss = w.enemies[0];
    const b = w.boss; b.hp = 2; b.active = true;
    const noInput = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    const score0 = w.score, fx0 = w.fx.length;
    w.bullets.push(new Bullet(b.x + b.w / 2, b.y + b.h / 2, 0, 0, { from: 'player', damage: 99 })); // overlaps + out-damages
    w.step(noInput);
    check('bossDeath.multiBlastFx', w.boss.dead && (w.fx.length - fx0) >= 6, `dead=${w.boss.dead} fxAdded=${w.fx.length - fx0}`);
    check('bossDeath.awardsScoreAndFreezes', w.score === score0 + b.def.score && w.feel.hitStop > 0, `scoreAdded=${w.score - score0} hitStop=${w.feel.hitStop}`);
    check('bossDeath.emitsSfx', w.sfxEvents.includes('bossDeath'), `ev=${w.sfxEvents.join(',')}`);
  }

  // 5e. BOSS MOVEMENT (CREATOR_FEEDBACK CR-4: "boss has no movement"): the Sentinel
  //     now HOVERS — its y bobs over time — so it reads as live, not a static prop.
  //     Vertical only, so the cannon volley (fired from the FIXED baseY) stays
  //     prone-duckable — the fairness invariant. Deterministic.
  {
    const w = new World(LEVEL1, 8);
    w.enemies = w.enemies.filter((e) => e.kind === 'boss'); w.boss = w.enemies[0];
    const boss = w.boss; boss.active = true;
    const none = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    const ys = []; let xConst = true; const x0 = boss.x;
    for (let i = 0; i < 220; i++) { w.step(none); ys.push(boss.y); if (Math.abs(boss.x - x0) > 0.001) xConst = false; }
    const lo = Math.min(...ys), hi = Math.max(...ys);
    check('boss.hoversVertically', (hi - lo) > 8, `yspan=${(hi - lo).toFixed(1)}`);
    check('boss.horizontalStableForBalance', xConst, `x0=${x0}`);
    // Volley height must stay prone-duckable despite the bob (fires from baseY).
    w.bullets = []; boss._cannonVolley(w);
    const proneTop = 236 - PLAYER.proneH;
    const shots = w.bullets.filter((b) => b.from === 'enemy');
    check('boss.hoverVolleyStillDuckable', shots.length >= 3 && shots.every((b) => (b.y + b.h) <= proneTop + 0.001), `n=${shots.length} maxBottom=${Math.max(...shots.map((b) => b.y + b.h)).toFixed(0)}`);
  }

  // 6. PRONE (Contra dodge invariant): going prone shrinks the hitbox from the
  //    top while feet stay planted, so a shot that connects standing passes
  //    OVER a prone player; standing back up restores the full box.
  {
    const p = new Player(500, 216);      // standing box y 216..236 (feet on 236 floor)
    const chestShot = { x: p.x + 2, y: 218, w: 4, h: 3 }; // chest height
    check('prone.standingHit', aabbOverlap(chestShot, p) === true, `h=${p.h}`);

    p._setStance(true, LEVEL1.solids);
    check('prone.shrinks', p.h === PLAYER.proneH, `h=${p.h}`);
    check('prone.feetPlanted', Math.abs((p.y + p.h) - 236) < 0.001, `bottom=${p.y + p.h}`);
    check('prone.ducksFire', aabbOverlap(chestShot, p) === false, `top=${p.y}`);

    p._setStance(false, LEVEL1.solids);
    check('prone.standsBack', p.h === PLAYER.h && Math.abs((p.y + p.h) - 236) < 0.001, `h=${p.h}`);
  }

  // 6b. Standing up is blocked when a solid occupies the headroom (no clipping).
  //     Platform at x300,y150,w60,h10 (spans y150..160). Prone box 162..173 is
  //     clear of it, but the full-height box 153..173 would poke into it.
  {
    const p = new Player(310, 162);
    p.y = 162; p.h = PLAYER.proneH; p.prone = true;
    p._setStance(false, LEVEL1.solids);
    check('prone.blockedByCeiling', p.prone === true && p.h === PLAYER.proneH, `h=${p.h} prone=${p.prone}`);
  }

  // 7. Wall-impact juice: a bullet driven into level geometry dies flagged
  //    hitSolid and kicks off impact spark particles (weapon-juice pass).
  {
    const w = new World(LEVEL1, 31);
    w.enemies = []; w.pickups = []; w.bullets = []; w.particles = [];
    // Ground solid spans y 236..276; fire a bullet straight down into it.
    const b = new Bullet(600, 232, 0, 8, { from: 'player', color: '#ffe36e' });
    w.bullets.push(b);
    const before = w.particles.length;
    const noInput = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    w.step(noInput);
    check('impact.bulletDies', b.dead === true && b.hitSolid === true, `dead=${b.dead} solid=${b.hitSolid}`);
    check('impact.sparksSpawned', w.particles.length > before, `particles=${w.particles.length}`);
  }

  // 8. Density pacing: an enemy far off-screen stays DORMANT (does not move)
  //    until the camera nears it, then activates — so clusters are fought as
  //    groups rather than trickling toward the player from across the level.
  {
    const w = new World(LEVEL1, 41);
    const noInput = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    const far = w.enemies[w.enemies.length - 1]; // last spawn is far to the right
    const x0 = far.x;
    w.step(noInput); // camera at the start; `far` is off-screen
    check('density.dormantFar', far.active === false && far.x === x0, `active=${far.active} x=${far.x}`);
    // bring the camera to the enemy and step: it must wake
    w.player.x = far.x - 120; w.camera.follow(w.player, true);
    w.step(noInput);
    check('density.activatesNear', far.active === true, `active=${far.active}`);
  }

  // 9. FIXED-ARC jump (arcade invariant): apex is the SAME whether jump is
  //    tapped (released after 1 frame) or held — height is NOT button-hold
  //    variable. Measures the real min-y over a jump from the settled ground.
  {
    const none = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    const apex = (hold) => {
      const w = new World(LEVEL1, 3);
      w.enemies = []; w.pickups = []; w.bullets = []; // isolate the player
      const p = w.player;
      for (let i = 0; i < 6; i++) w.step(none); // settle onto the ground
      let minY = p.y;
      for (let i = 0; i < 45; i++) {
        const inp = { ...none, jump: hold || i === 0, jumpPressed: i === 0 };
        w.step(inp);
        if (p.y < minY) minY = p.y;
      }
      return minY;
    };
    const tap = apex(false), held = apex(true);
    check('jump.fixedArc', Math.abs(tap - held) < 0.5, `tapApexY=${tap.toFixed(1)} heldApexY=${held.toFixed(1)}`);
    check('jump.actuallyLeavesGround', held < 210, `heldApexY=${held.toFixed(1)}`); // rose well above the ~216 floor
  }

  // 10. SFX EVENT WIRING: gameplay emits the right sound-event strings that the
  //     live audio layer plays. (The sim never touches Web Audio — deterministic
  //     + headless-silent; only the event wiring is asserted here.)
  {
    const w = new World(LEVEL1, 7);
    w.player.shoot(w);
    check('sfx.shootEmitted', w.sfxEvents.includes('shoot_rifle'), `ev=${w.sfxEvents.join(',')}`);

    const w2 = new World(LEVEL1, 8);
    const e = w2.enemies.find((en) => en.kind === 'grunt');
    w2.bullets.push(new Bullet(e.x + e.w / 2, e.y + e.h / 2, 0, 0, { from: 'player', damage: 99 }));
    const noInput = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    w2.step(noInput);
    check('sfx.killEmitsExplosion', w2.sfxEvents.includes('explosion'), `ev=${w2.sfxEvents.join(',')}`);
    const drained = w2.drainSfx();
    check('sfx.drainClears', drained.length > 0 && w2.sfxEvents.length === 0, `drained=${drained.length} left=${w2.sfxEvents.length}`);
  }

  // 11. AUDIO SYNTH is crash-safe: constructing the kit and playing every event
  //     name never throws, even when the AudioContext is blocked/suspended
  //     (graceful no-op). Subjective sound quality is a human judgment (declared).
  {
    let threw = null;
    try {
      const kit = new AudioKit();
      ['shoot_rifle', 'shoot_spread', 'shoot_machine', 'shoot_laser', 'shoot_fire', 'jump', 'enemyHit', 'explosion', 'hurt', 'shield',
        'pickup', 'bossHit', 'bossEnrage', 'bossDeath', 'gameover', 'clear', 'unknown_evt'].forEach((n) => kit.play(n));
    } catch (err) { threw = String(err); }
    check('audio.synthNoThrow', threw === null, threw || 'ok');

    // MusicKit (looping BGM) is built the same crash-safe way: no/blocked ctx →
    // silent no-op, and the full transport (start/duck/mute/stop) never throws.
    let mThrew = null;
    try {
      const m = new MusicKit();     // no ctx → disabled, every call a no-op
      m.start(); m.duck(true); m.setMuted(true); m.setSection('boss'); m.setIntensity(true); m.setSection('stage'); m.setIntensity(false); m.duck(false); m.stop();
    } catch (err) { mThrew = String(err); }
    check('audio.musicNoThrow', mThrew === null, mThrew || 'ok');
  }

  // 12. TITLE/START gate (arcade entry). The DEFAULT boot stays 'playing' so the
  //     deterministic capture/headless harnesses are unaffected; the live loop opts
  //     into the title via toTitle(). While on the title the sim is frozen; a
  //     start() begins play; selecting a mode on the title does NOT start play.
  {
    const w = new World(LEVEL1, 3);
    check('title.defaultBootsPlaying', w.status === 'playing', `status=${w.status}`);
    w.toTitle();
    check('title.toTitleEntersTitle', w.status === 'title', `status=${w.status}`);
    const noInput = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    const f0 = w.frame;
    w.step(noInput);
    check('title.stepFrozen', w.frame === f0 && w.status === 'title', `frame=${w.frame} status=${w.status}`);
    w.setMode('casual');
    check('title.modeSelectStaysTitle', w.status === 'title' && w.modeKey === 'casual', `status=${w.status} mode=${w.modeKey}`);
    w.start();
    check('title.startBeginsPlay', w.status === 'playing', `status=${w.status}`);

    // Attract-demo mode: with `attract` set the sim RUNS on the title (the live
    // arcade demo drives the player), but the run NEVER leaves the title —
    // victory is SUPPRESSED so even a dead boss can't flip it to 'cleared'.
    // (Headless/self-tests never set attract, so title.stepFrozen above proves the
    // default frozen behavior — this locks the live-only escape hatch's bounds.)
    const wa = new World(LEVEL1, 3); wa.toTitle(); wa.attract = true;
    const ax0 = wa.player.x;
    for (let i = 0; i < 30; i++) { wa.player.iframe = 999; wa.step({ ...noInput, right: true, fire: true }); }
    check('attract.runsSimOnTitle', wa.player.x > ax0 && wa.frame > 0 && wa.status === 'title', `x ${ax0}->${wa.player.x.toFixed(0)} frame=${wa.frame} status=${wa.status}`);
    wa.boss.hp = 1; wa.boss.takeDamage(99); wa.step({ ...noInput });
    check('attract.victorySuppressed', wa.boss.dead && wa.status === 'title', `bossDead=${wa.boss.dead} status=${wa.status}`);
  }

  // 13. ARSENAL: Machine Gun fires faster than the rifle; the Laser PIERCES —
  //     one beam damages multiple aligned enemies in a single frame and survives.
  {
    check('machine.rapidFire', WEAPONS.machine.fireRate < WEAPONS.rifle.fireRate,
      `machine=${WEAPONS.machine.fireRate} rifle=${WEAPONS.rifle.fireRate}`);

    const w = new World(LEVEL1, 5);
    w.enemies = [new Enemy('grunt', 600, 210), new Enemy('grunt', 612, 210)]; // two along the beam
    const beforeScore = w.score;
    // a wide piercing beam overlapping both grunts (grunt hp=3, laser damage=3 → both die)
    w.bullets = [new Bullet(596, 214, 0, 0, { from: 'player', damage: 3, pierce: true, w: 30, h: 4 })];
    const b = w.bullets[0];
    const noInput = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    w.step(noInput);
    check('laser.piercesBoth', w.enemies.length === 0 && w.score === beforeScore + 200,
      `alive=${w.enemies.length} score=${w.score}`);
    check('laser.beamSurvives', b.dead === false, `dead=${b.dead}`);
  }

  // 14. FIRE weapon corkscrews: a wave bullet advances along its axis while
  //     oscillating perpendicular; the twin strands are a half-cycle apart.
  {
    const b = new Bullet(100, 100, 5, 0, { from: 'player', wave: true, waveAmp: 5, waveFreq: 0.5, wavePhase: 0 });
    const ys = [];
    for (let i = 0; i < 24; i++) { b.step([]); ys.push(b.y); }
    const spanY = Math.max(...ys) - Math.min(...ys);
    check('fire.corkscrewsPerp', spanY > 6, `spanY=${spanY.toFixed(1)}`);
    check('fire.advancesForward', b.x > 140, `x=${b.x.toFixed(1)}`);
    const a = new Bullet(100, 100, 5, 0, { from: 'player', wave: true, waveAmp: 5, waveFreq: 0.5, wavePhase: 0 });
    const c = new Bullet(100, 100, 5, 0, { from: 'player', wave: true, waveAmp: 5, waveFreq: 0.5, wavePhase: Math.PI });
    a.step([]); c.step([]);
    check('fire.strandsOppositePhase', a.y !== 100 && Math.sign(a.y - 100) === -Math.sign(c.y - 100),
      `a=${a.y.toFixed(2)} c=${c.y.toFixed(2)}`);
  }

  // 15. Boss PHASE-2 enrage: crossing the HP threshold flips `enraged` and yields
  //     a DENSER (4-bullet) volley that STAYS chest-height, so a prone player still
  //     ducks it (the win-path stays fair). Standing players feel the escalation.
  {
    const w = new World(LEVEL1, 9);
    const boss = w.boss;
    boss.active = true;
    check('boss.notEnragedAtFull', boss.enraged !== true, `enraged=${boss.enraged}`);
    boss.hp = boss.def.hp * boss.def.enrageAt - 1; // drop below the threshold
    boss.update(w);
    check('boss.enragesBelowThreshold', boss.enraged === true, `enraged=${boss.enraged} hp=${boss.hp}`);
    w.bullets = [];
    boss._cannonVolley(w);
    const proneTop = 236 - PLAYER.proneH;
    const shots = w.bullets.filter((b) => b.from === 'enemy');
    check('boss.enrageVolleyDenser', shots.length === 4, `n=${shots.length}`);
    check('boss.enrageStillProneFair', shots.every((b) => (b.y + b.h) <= proneTop + 0.001),
      `maxBottom=${Math.max(...shots.map((b) => b.y + b.h))}`);
  }

  // 16. FLYER drone (3rd enemy set): HOVERS (no gravity — never falls to the
  //     floor), bobs deterministically, strafes toward the player, fires aimed
  //     shots, and is killable (hp 2 → score 200). Aerial threat that makes the
  //     up-aim matter. No RNG in its behavior → replay/self-test stays identical.
  {
    const w = new World(LEVEL1, 5);
    w.enemies = [new Enemy('flyer', 800, 120)];
    w.boss = null; // isolate from the goal/victory gate
    const f = w.enemies[0];
    f.active = true;
    w.player.x = 300; w.player.y = 216; // far left → flyer strafes left + aims left
    const noInput = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    const ys = [];
    for (let i = 0; i < 100 && !f.dead; i++) { w.step(noInput); ys.push(f.y); }
    const lo = Math.min(...ys), hi = Math.max(...ys);
    check('flyer.hoversNoGravity', lo > 90 && hi < 200, `y in [${lo.toFixed(0)},${hi.toFixed(0)}] (never falls)`);
    check('flyer.bobs', (hi - lo) > 5, `span=${(hi - lo).toFixed(1)}`);
    check('flyer.strafesTowardPlayer', f.x < 800, `x=${f.x.toFixed(0)}`);
    check('flyer.firesAimedShots', w.bullets.some((b) => b.from === 'enemy'), `enemyBullets=${w.bullets.filter((b) => b.from === 'enemy').length}`);
  }
  {
    const w = new World(LEVEL1, 6);
    w.enemies = [new Enemy('flyer', 800, 120)];
    w.boss = null;
    const f = w.enemies[0];
    const before = w.score;
    w.bullets.push(new Bullet(f.x + f.w / 2, f.y + f.h / 2, 0, 0, { from: 'player', damage: 99 }));
    const noInput = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    w.step(noInput);
    check('flyer.killableAwardsScore', w.enemies.length === 0 && w.score === before + 200, `alive=${w.enemies.length} score=${w.score}`);
  }
  // 18. AIMED-FIRE TELEGRAPH (turret + flyer): each raises a wind-up counter for
  //     the last TELEGRAPH_FRAMES steps BEFORE it fires (readable, not a cheap
  //     no-warning hit), and the telegraph is 0 on the exact step a shot spawns.
  //     Mirrors the boss's existing wind-up. Deterministic — no rng consumed.
  for (const kind of ['turret', 'flyer']) {
    const w = new World(LEVEL1, 9);
    w.enemies = [new Enemy(kind, 700, kind === 'turret' ? 200 : 120)];
    w.boss = null;
    const e = w.enemies[0];
    e.active = true;
    w.player.x = 300; w.player.y = 216;
    const noInput = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    let telBeforeShot = -1, telPeak = 0, sawWindup = false;
    for (let i = 0; i < 200; i++) {
      const before = w.bullets.filter((b) => b.from === 'enemy').length;
      w.step(noInput);
      const after = w.bullets.filter((b) => b.from === 'enemy').length;
      if (e.telegraph > 0) sawWindup = true;
      telPeak = Math.max(telPeak, e.telegraph);
      if (after > before) { telBeforeShot = e.telegraph; break; } // telegraph reset on fire
    }
    check(`${kind}.telegraphsBeforeFiring`, sawWindup && telPeak <= TELEGRAPH_FRAMES, `peak=${telPeak}`);
    check(`${kind}.telegraphClearsOnShot`, telBeforeShot === 0, `telAtShot=${telBeforeShot}`);
  }

  // 18b. TURRET MUZZLE ORIGIN (CREATOR_FEEDBACK CR-3): the shot must LEAVE the
  //      VISIBLE BARREL TIP, not the hull centre — the creator saw shots come
  //      from a "secondary" point off the drawn barrel. The barrel pivots at the
  //      dome top (y + h - barrelPivotFromBottom) and points at the player; the
  //      muzzle is pivot + aim*barrelLen. Assert the first turret bullet spawns
  //      at that exact tip (within a bullet-half) AND is measurably offset from
  //      the hull centre toward the player (i.e. NOT firing from the middle).
  {
    const w = new World(LEVEL1, 21);
    w.enemies = [new Enemy('turret', 700, 200)]; w.boss = null;
    const e = w.enemies[0]; e.active = true;
    w.player.x = 300; w.player.y = 216;
    const T = ENEMIES.turret;
    const none = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    let shot = null;
    for (let i = 0; i < 200 && !shot; i++) {
      const before = w.bullets.filter((b) => b.from === 'enemy').length;
      w.step(none);
      if (w.bullets.filter((b) => b.from === 'enemy').length > before) shot = w.bullets.find((b) => b.from === 'enemy');
    }
    // Expected barrel-tip geometry, computed the same way the renderer draws it.
    const px = e.x + e.w / 2, py = e.y + e.h - T.barrelPivotFromBottom;
    const dx = (w.player.x + w.player.w / 2) - px, dy = (w.player.y + w.player.h / 2) - py;
    const d = Math.hypot(dx, dy) || 1;
    const tipX = px + (dx / d) * T.barrelLen, tipY = py + (dy / d) * T.barrelLen;
    // Bullet stores its spawn point verbatim (x,y) and has already moved ONE step
    // by the time we read it — back that single velocity step out to recover the
    // exact spawn point, which must equal the barrel tip.
    const spawnX = shot ? shot.x - shot.vx : NaN, spawnY = shot ? shot.y - shot.vy : NaN;
    const atTip = shot && Math.hypot(spawnX - tipX, spawnY - tipY) < 0.001;
    check('turret.firesFromBarrelTip', !!atTip, `tip=(${tipX.toFixed(2)},${tipY.toFixed(2)}) spawn=(${spawnX.toFixed(2)},${spawnY.toFixed(2)})`);
    // The tip must be meaningfully left of the hull centre (player is to the left),
    // i.e. the muzzle is NOT the hull middle the old code fired from.
    check('turret.muzzleOffsetFromHullCentre', shot && (px - tipX) > 3, `centreX=${px.toFixed(1)} tipX=${tipX.toFixed(1)}`);
  }

  // 19. DEATH THROW: a lethal hit flings the commando UP + spins it (the Contra
  //     death read), animates over the respawn window, then fully clears on
  //     respawn (dying off, standing, one life spent). Deterministic arc.
  {
    const w = new World(LEVEL1, 7);
    w.boss = null; w.enemies = [];
    const p = w.player; p.x = 300; p.y = 200; p.iframe = 0; p.shield = 0;
    const y0 = p.y, lives0 = w.lives;
    const killed = p.takeHit(p.x + 80); // hit from the right → flung up + left
    w._onHurt();
    check('death.entersDyingState', killed && p.dying && p.dead && w.respawnTimer > 0, `dying=${p.dying} rt=${w.respawnTimer}`);
    const noInput = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    const ys = []; let spun = false;
    for (let i = 0; i < 10; i++) { w.step(noInput); ys.push(p.y); if (p.deathAngle > 0) spun = true; }
    check('death.flingsUpAndSpins', Math.min(...ys) < y0 && spun, `minY=${Math.min(...ys).toFixed(0)} y0=${y0} ang=${p.deathAngle.toFixed(2)}`);
    for (let i = 0; i < 60 && w.respawnTimer > 0; i++) w.step(noInput);
    check('death.clearsOnRespawn', !p.dying && !p.dead && w.lives === lives0 - 1, `dying=${p.dying} dead=${p.dead} lives=${w.lives}`);
  }

  // 20. SOMERSAULT STATE: airborneT (drives the jump tuck-spin render) is 0 on
  //     the ground, becomes >=1 the moment a jump leaves it while RISING (vy<0),
  //     and resets to 0 on landing. Asserts the deterministic counter the render
  //     rotates the leap frame by — not pixels.
  {
    const w = new World(LEVEL1, 11); w.boss = null; w.enemies = [];
    const p = w.player;
    const none = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    for (let i = 0; i < 20 && !p.grounded; i++) w.step(none); // settle on ground
    const groundedAir = p.airborneT;
    w.step({ ...none, jump: true, jumpPressed: true }); // jump
    const roseAir = p.airborneT, rising = p.vy < 0;
    check('somersault.airborneTracksRise', groundedAir === 0 && roseAir >= 1 && rising, `grounded=${groundedAir} rise=${roseAir} vy=${p.vy.toFixed(1)}`);
    for (let i = 0; i < 120 && !p.grounded; i++) w.step(none); // land
    check('somersault.resetsOnLand', p.grounded && p.airborneT === 0, `grounded=${p.grounded} air=${p.airborneT}`);
  }

  // 21. TOUCH+KEYBOARD MERGE: CombinedInput ORs the held-state of every source
  //     (so on-screen touch and the keyboard both drive the game at once) and
  //     edge-tracks jumpPressed across the merge. Null sources (desktop, no touch
  //     overlay) are ignored. Pure logic — the same input the live loop feeds.
  {
    const blankHeld = () => ({ left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false });
    const kb = { held: blankHeld() };   // stands in for KeyboardInput.held
    const tc = { held: blankHeld() };   // stands in for TouchInput.held
    const ci = new CombinedInput([kb, null, tc]);
    tc.held.right = true; kb.held.fire = true; // different sources, held together
    let s = ci.poll();
    check('input.mergesTouchAndKeyboard', s.right && s.fire && !s.left, `right=${s.right} fire=${s.fire} left=${s.left}`);
    tc.held.jump = true;
    s = ci.poll();
    check('input.mergedJumpPressedOnEdge', s.jump && s.jumpPressed, `jump=${s.jump} pressed=${s.jumpPressed}`);
    s = ci.poll(); // still held, not a fresh press
    check('input.jumpPressedClearsWhenHeld', s.jump && !s.jumpPressed, `pressed=${s.jumpPressed}`);
  }

  // 22. MORTAR (area-denial enemy): telegraphs, then LOBS a parabolic shell — a
  //     gravity bullet whose vy climbs from negative (up) through zero to positive
  //     (down), i.e. it ARCS, unlike the straight turret/flyer/boss shots.
  //     Deterministic (no rng). Dodge = reposition off the landing spot.
  {
    const w = new World(LEVEL1, 12);
    w.solids = w.solids.filter((s) => s.kind === 'ground'); // clear airspace so the arc isn't clipped by a platform (isolates the lob)
    w.enemies = [new Enemy('mortar', 700, 200)]; w.boss = null;
    const m = w.enemies[0]; m.active = true;
    w.player.x = 400; w.player.y = 216;
    const noInput = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    let sawTel = false, shell = null;
    for (let i = 0; i < 200 && !shell; i++) { w.step(noInput); if (m.telegraph > 0) sawTel = true; shell = w.bullets.find((b) => b.from === 'enemy'); }
    check('mortar.lobsGravityShell', !!shell && shell.gravity > 0, `gravity=${shell && shell.gravity}`);
    check('mortar.telegraphsBeforeLob', sawTel, `sawTel=${sawTel}`);
    const vy0 = shell ? shell.vy : 0; let vyMax = vy0;
    for (let i = 0; i < 90 && shell && !shell.dead; i++) { w.step(noInput); vyMax = Math.max(vyMax, shell.vy); }
    check('mortar.shellArcsUpThenDown', vy0 < 0 && vyMax > 0, `vy0=${vy0.toFixed(1)} vyMax=${vyMax.toFixed(1)}`);
  }

  // 23. PIT / CHASM HAZARD: falling through the x2220–2278 gap is lethal (costs a
  //     life), respawn is nudged back onto SOLID GROUND (no death loop), and the
  //     gap is CLEARABLE by a running jump (fair). New platforming failure mode.
  {
    const none = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    // (a) fall kills
    {
      const w = new World(LEVEL1, 13); w.boss = null; w.enemies = [];
      const p = w.player; p.x = 2246; p.y = 210; p.iframe = 0; // standing over the chasm
      const lives0 = w.lives;
      let died = false;
      for (let i = 0; i < 40 && !died; i++) { w.step(none); if (w.respawnTimer > 0 || w.lives < lives0) died = true; }
      check('pit.fallKills', died && w.lives === lives0 - 1, `lives ${lives0}->${w.lives} rt=${w.respawnTimer}`);
    }
    // (b) safe respawn: _safeGroundX nudges a chasm x back over ground (no loop)
    {
      const w = new World(LEVEL1, 14);
      const sx = w._safeGroundX(2246); // 2246 is over the gap
      const overGround = w.solids.some((s) => s.kind === 'ground' && (sx + w.player.w / 2) >= s.x && (sx + w.player.w / 2) <= s.x + s.w);
      check('pit.safeRespawnAvoidsChasm', overGround && sx < 2220, `safeX=${sx} overGround=${overGround}`);
    }
    // (c) a running jump clears the gap (fairness)
    {
      const w = new World(LEVEL1, 15); w.boss = null; w.enemies = [];
      const p = w.player; p.x = 2170; p.y = 216;
      for (let i = 0; i < 20 && !p.grounded; i++) w.step(none);
      const lives0 = w.lives;
      let crossed = false, jumped = false;
      for (let i = 0; i < 200 && !crossed; i++) {
        const doJump = (p.x + p.w / 2 > 2206) && p.grounded && !jumped;
        if (doJump) jumped = true;
        w.step({ ...none, right: true, jump: doJump, jumpPressed: doJump });
        if (p.x + p.w / 2 > 2280 && p.grounded && !p.dead) crossed = true;
        if (p.dead || w.respawnTimer > 0) break; // fell in → not clearable
      }
      check('pit.runningJumpClears', crossed && w.lives === lives0, `x=${p.x.toFixed(0)} crossed=${crossed} lives=${w.lives}`);
    }
  }

  // 24. BRIDGE-OVER-WATER + MULTI-HEIGHT (CREATOR_FEEDBACK CR-1: "original had a
  //     bridge and water ... you can move at multiple heights"). The bridge span is
  //     `kind:'ground'` (so physics/bot/respawn treat it as footing) with a
  //     `bridge` flag that only changes RENDER; a water region sits under it; and a
  //     `catwalk` platform forms a genuine higher tier above it.
  {
    const none = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    const bridge = LEVEL1.solids.find((s) => s.bridge);
    const water = (LEVEL1.water || [])[0];
    const catwalk = LEVEL1.solids.find((s) => s.catwalk);
    // (a) the bridge exists, is solid GROUND (not a special kind that would confuse
    //     the run bot / respawn / pit checks), and a water channel sits beneath it.
    check('bridge.isSolidGroundKind', !!bridge && bridge.kind === 'ground', `bridge=${JSON.stringify(bridge)}`);
    const waterUnder = !!bridge && !!water && water.x < bridge.x + bridge.w && water.x + water.w > bridge.x && water.y >= bridge.y;
    check('bridge.hasWaterChannelBelow', waterUnder, `water=${JSON.stringify(water)}`);
    // (b) footing: a player falling onto the bridge span lands and is grounded at
    //     the deck surface — identical to normal ground.
    {
      const w = new World(LEVEL1, 24); w.boss = null; w.enemies = [];
      const p = w.player; p.x = bridge.x + bridge.w / 2; p.y = 180; p.vy = 0; p.iframe = 999;
      for (let i = 0; i < 60 && !p.grounded; i++) w.step(none);
      check('bridge.playerStandsOnDeck', p.grounded && Math.abs((p.y + p.h) - bridge.y) < 2 && !p.dead,
        `grounded=${p.grounded} feetY=${(p.y + p.h).toFixed(1)} deckY=${bridge.y} dead=${p.dead}`);
    }
    // (c) MULTI-HEIGHT: the catwalk is a standable tier ABOVE the bridge deck (a
    //     real high route), and clearly higher than the ground it spans.
    check('multiheight.catwalkAboveBridge', !!catwalk && catwalk.y < bridge.y - 40, `catwalkY=${catwalk && catwalk.y} bridgeY=${bridge.y}`);
    {
      const w = new World(LEVEL1, 25); w.boss = null; w.enemies = [];
      const p = w.player; p.x = catwalk.x + catwalk.w / 2; p.y = catwalk.y - 30; p.vy = 0; p.iframe = 999;
      for (let i = 0; i < 60 && !p.grounded; i++) w.step(none);
      check('multiheight.playerStandsOnCatwalk', p.grounded && Math.abs((p.y + p.h) - catwalk.y) < 2 && !p.dead,
        `grounded=${p.grounded} feetY=${(p.y + p.h).toFixed(1)} deckY=${catwalk.y} dead=${p.dead}`);
    }
    // (d) WATER GAP is a real FALL-HAZARD (CR-1 "bridge and water"). The two bridge
    //     decks leave a gap; standing over it with no deck below is a lethal pit
    //     fall (like the chasm), NOT safe scenery.
    const decks = LEVEL1.solids.filter((s) => s.bridge).sort((a, b) => a.x - b.x);
    const gapL = decks[0].x + decks[0].w, gapR = decks[1].x, gapMid = (gapL + gapR) / 2;
    check('bridgegap.gapBreaksDeck', decks.length === 2 && gapR > gapL && (gapR - gapL) <= 79,
      `gap=${gapL}..${gapR} (${(gapR - gapL)}px), clearable≤79`);
    {
      const w = new World(LEVEL1, 26); w.boss = null; w.enemies = [];
      const p = w.player; p.x = gapMid - p.w / 2; p.y = 210; p.iframe = 0; p.shield = 0;
      const lives0 = w.lives;
      let died = false;
      for (let i = 0; i < 60 && !died; i++) { w.step(none); if (w.respawnTimer > 0 || w.lives < lives0) died = true; }
      check('bridgegap.fallInWaterKills', died && w.lives === lives0 - 1, `lives ${lives0}->${w.lives} rt=${w.respawnTimer}`);
    }
    // (e) but it's FAIR: a running jump from the left deck clears the gap onto the
    //     right deck (no life lost).
    {
      const w = new World(LEVEL1, 27); w.boss = null; w.enemies = [];
      const p = w.player; p.x = gapL - 40; p.y = 216; p.iframe = 999;
      for (let i = 0; i < 20 && !p.grounded; i++) w.step(none);
      const lives0 = w.lives;
      let crossed = false, jumped = false;
      for (let i = 0; i < 200 && !crossed; i++) {
        const doJump = (p.x + p.w / 2 > gapL - 14) && p.grounded && !jumped;
        if (doJump) jumped = true;
        w.step({ ...none, right: true, jump: doJump, jumpPressed: doJump });
        if (p.x > gapR + 4 && p.grounded && !p.dead) crossed = true;
        if (p.dead || w.respawnTimer > 0) break;
      }
      check('bridgegap.runningJumpClears', crossed && w.lives === lives0, `x=${p.x.toFixed(0)} crossed=${crossed} lives=${w.lives}`);
    }
    // (f) MULTI-HEIGHT PAYOFF: the catwalk spans the whole gap, so the high route
    //     lets a player bypass the hazard entirely (the height choice matters).
    check('bridgegap.catwalkBypassesGap', !!catwalk && catwalk.x <= gapL && catwalk.x + catwalk.w >= gapR,
      `catwalk=${catwalk && catwalk.x}..${catwalk && (catwalk.x + catwalk.w)} gap=${gapL}..${gapR}`);
    // (g) the high route is REAL, not just teleport-standable: a running jump from
    //     the 1650 ledge actually reaches and lands on the catwalk (so committing to
    //     the high route to bypass the gap is a genuine, playable choice).
    {
      const ledge = LEVEL1.solids.find((s) => s.x === 1650 && s.kind === 'platform');
      const w = new World(LEVEL1, 28); w.boss = null; w.enemies = [];
      const p = w.player; p.x = ledge.x + 40; p.y = ledge.y - p.h; p.vy = 0; p.iframe = 999;
      for (let i = 0; i < 30 && !p.grounded; i++) w.step(none);
      let onCat = false, jumped = false;
      for (let i = 0; i < 160; i++) {
        const doJump = p.grounded && !jumped && p.x > 1700;
        if (doJump) jumped = true;
        w.step({ ...none, right: true, jump: doJump, jumpPressed: doJump });
        if (p.grounded && Math.abs((p.y + p.h) - catwalk.y) < 2 && p.x > catwalk.x && p.x < catwalk.x + catwalk.w) { onCat = true; break; }
        if (p.dead || w.respawnTimer > 0) break;
      }
      check('multiheight.catwalkReachableByJump', onCat, `reachedCatwalk=${onCat} x=${p.x.toFixed(0)} feetY=${(p.y + p.h).toFixed(0)} catY=${catwalk.y}`);
    }
    // (h) WATER SPLASH FEEDBACK: falling into the WATER spawns a 'splash' fx (+ SFX)
    //     so the hazard reads as water — but the DRY chasm does NOT (it's a plain
    //     pit). Distinguishes the two fall types; fx are cosmetic (no rng).
    {
      const w = new World(LEVEL1, 29); w.boss = null; w.enemies = [];
      const p = w.player; p.x = gapMid - p.w / 2; p.y = 210; p.iframe = 0; p.shield = 0;
      let splashFx = false, splashSfx = false;
      for (let i = 0; i < 60 && !splashFx; i++) {
        w.step(none);
        if (w.fx.some((f) => f.kind === 'splash')) splashFx = true;
        if (w.sfxEvents.includes('splash')) splashSfx = true;
      }
      check('splash.waterFallSplashes', splashFx && splashSfx, `fx=${splashFx} sfx=${splashSfx}`);
    }
    {
      const w = new World(LEVEL1, 30); w.boss = null; w.enemies = [];
      const p = w.player; p.x = 2246; p.y = 210; p.iframe = 0; p.shield = 0; // over the DRY chasm
      let sawSplash = false, died = false;
      for (let i = 0; i < 60 && !died; i++) {
        w.step(none);
        if (w.fx.some((f) => f.kind === 'splash')) sawSplash = true;
        if (w.respawnTimer > 0) died = true;
      }
      check('splash.dryChasmNoSplash', died && !sawSplash, `died=${died} sawSplash=${sawSplash}`);
    }
    // (i) AUTHORED THEME ART WIRED: the art loop's bridge/water tiles are registered
    //     in the manifest so the loader fetches them and render.js can blit them
    //     (with procedural fallback). Locks the wire so the keys can't silently drop.
    check('theme.tilesWiredInManifest',
      !!ASSET_MANIFEST.theme_bridge && !!ASSET_MANIFEST.theme_water && !!ASSET_MANIFEST.theme_water_top,
      `bridge=${ASSET_MANIFEST.theme_bridge} water=${ASSET_MANIFEST.theme_water} top=${ASSET_MANIFEST.theme_water_top}`);
  }

  // 25. LANDING FEEDBACK (movement-cadence feel): a touchdown after a real fall
  //     kicks a squash (player.landT) + a 'landdust' fx; running on flat ground
  //     never does (micro-steps gated out). Dust is cosmetic (no rng).
  {
    const none = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    // (a) a real fall → dust + squash on touchdown (x250 is clear of platforms so
    //     the drop reaches the ground rather than snapping onto a ledge)
    {
      const w = new World(LEVEL1, 31); w.boss = null; w.enemies = [];
      const p = w.player; p.x = 250; p.y = 120; p.vy = 0; p.iframe = 999; // drop from height
      let sawDust = false, sawSquash = false;
      for (let i = 0; i < 80 && !(sawDust && sawSquash); i++) {
        w.step(none);
        if (w.fx.some((f) => f.kind === 'landdust')) sawDust = true;
        if (p.landT > 0) sawSquash = true;
      }
      check('land.hardLandingPuffs', sawDust && sawSquash && p.grounded, `dust=${sawDust} squash=${sawSquash} grounded=${p.grounded}`);
    }
    // (b) running on flat ground never puffs (no phantom landings)
    {
      const w = new World(LEVEL1, 32); w.boss = null; w.enemies = [];
      const p = w.player; p.x = 300; p.y = 216; p.iframe = 999;
      for (let i = 0; i < 12; i++) w.step(none);          // settle onto the ground
      w.fx = w.fx.filter((f) => f.kind !== 'landdust');   // clear the initial-settle puff
      let dust = false;
      for (let i = 0; i < 40; i++) { w.step({ ...none, right: true }); if (w.fx.some((f) => f.kind === 'landdust')) dust = true; }
      check('land.flatRunNoPuff', !dust && p.grounded, `dustWhileRunning=${dust} grounded=${p.grounded}`);
    }
  }

  // 26. PAUSE (live-only freeze): world.paused makes step() a no-op — the frame
  //     counter and actors hold — and clearing it resumes cleanly. Mirrors the
  //     title-freeze guard; headless/self-tests never set it in normal runs, so
  //     the deterministic capture stream is untouched.
  {
    const w = new World(LEVEL1, 40); w.boss = null;
    const inp = { left: false, right: true, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    for (let i = 0; i < 6; i++) w.step(inp); // settle + start moving right
    w.paused = true;
    const f0 = w.frame, x0 = w.player.x;
    for (let i = 0; i < 30; i++) w.step(inp);
    check('pause.freezesSim', w.frame === f0 && w.player.x === x0, `frame ${f0}->${w.frame} x ${x0.toFixed(1)}->${w.player.x.toFixed(1)}`);
    w.paused = false;
    w.step(inp);
    check('pause.resumesSim', w.frame === f0 + 1 && w.player.x !== x0, `frame ${w.frame} (want ${f0 + 1}) x ${w.player.x.toFixed(1)}`);
  }

  // 27. STAGE-2 + GENERALIZED BOSS (content/stage2 WIRE): the boss is found by the
  //     def.isBoss FLAG (not a hardcoded kind), so the Stage-1 Sentinel AND the new
  //     Stage-2 chopper both register; the chopper MOVES (sweeps), fires, enrages,
  //     and dies to player fire firing the shared boss-death finale. Stage-1 boss
  //     detection is unchanged.
  {
    const none = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    // (a) generalized boss-finder: both stages register their boss via isBoss.
    const w1 = new World(LEVEL1, 50);
    check('boss.stage1SentinelRegisters', !!w1.boss && w1.boss.kind === 'boss' && w1.boss.def.isBoss === true, `boss=${w1.boss && w1.boss.kind}`);
    const w2 = new World(LEVEL2, 51);
    check('boss.stage2ChopperRegisters', !!w2.boss && w2.boss.kind === 'chopper' && w2.boss.def.isBoss === true, `boss=${w2.boss && w2.boss.kind}`);
    // (b) the chopper MOVES (horizontal sweep) — mechanically distinct from the
    //     fixed Sentinel — and fires aimed shots.
    {
      const w = new World(LEVEL2, 52); w.enemies = w.enemies.filter((e) => e.kind === 'chopper'); w.boss = w.enemies[0];
      const ch = w.boss; ch.active = true; w.player.x = ch.x - 60; w.player.y = 210;
      const xs = []; let fired = false;
      for (let i = 0; i < 200; i++) { w.step(none); xs.push(ch.x); if (w.bullets.some((b) => b.from === 'enemy')) fired = true; }
      check('chopper.sweepsAndFires', (Math.max(...xs) - Math.min(...xs)) > 20 && fired, `sweep=${(Math.max(...xs) - Math.min(...xs)).toFixed(0)} fired=${fired}`);
    }
    // (c) DEFEATABLE via the real kill path → the generalized boss-death finale fires
    //     (isBoss → _bossDeath multi-blast), and the win path closes (status cleared).
    {
      const w = new World(LEVEL2, 53); w.enemies = w.enemies.filter((e) => e.kind === 'chopper'); w.boss = w.enemies[0];
      const ch = w.boss; ch.active = true;
      const fx0 = w.fx.length;
      // apply lethal damage through the real combat path via direct hp drain + a kill bullet
      ch.hp = 3;
      w.player.x = ch.x - 40; w.player.y = ch.y; w.player.setWeapon('spread');
      let cleared = false;
      for (let i = 0; i < 400 && !cleared; i++) { w.step({ ...none, fire: true, up: true }); if (w.status === 'cleared') cleared = true; }
      check('chopper.defeatableFiresFinale', ch.dead && (w.fx.length - fx0) >= 6 && cleared, `dead=${ch.dead} fxAdded=${w.fx.length - fx0} status=${w.status}`);
    }
  }

  // 28. STAGE TRANSITION (loadStage): the player-initiated Stage-1→Stage-2 advance
  //     re-inits THIS world with the next level, CARRIES score + lives, resets to
  //     'playing', and the new stage's boss (chopper) registers. Weapon reverts to
  //     the default rifle (arcade single-slot). The transition trigger itself is
  //     live-only (main.js N / touch), but loadStage is the load-bearing mechanic.
  {
    const w = new World(LEVEL1, 60);
    // simulate an end-of-Stage-1 run state
    w.score = 4200; w.lives = 2; w.status = 'cleared';
    w.player.setWeapon('spread');
    w.loadStage(LEVEL2, { score: w.score, lives: w.lives });
    const bossKind = w.boss && w.boss.kind;
    check('stagexfer.loadsNextLevelCarryingRun',
      w.level === LEVEL2 && w.status === 'playing' && w.score === 4200 && w.lives === 2 && bossKind === 'chopper' && w.player.weaponKey === 'rifle',
      `level2=${w.level === LEVEL2} status=${w.status} score=${w.score} lives=${w.lives} boss=${bossKind} weapon=${w.player.weaponKey}`);
    // Stage 2 is playable: the player can move and the chopper is present + finite HP.
    const none = { left: false, right: false, up: false, down: false, jump: false, fire: false, swap: false, jumpPressed: false, swapPressed: false };
    const x0 = w.player.x;
    for (let i = 0; i < 20; i++) w.step({ ...none, right: true });
    check('stagexfer.stage2Playable', w.player.x > x0 && w.enemies.some((e) => e.kind === 'chopper'), `moved=${(w.player.x - x0).toFixed(0)} chopper=${w.enemies.some((e) => e.kind === 'chopper')}`);
  }

  // 29. CAMPAIGN STRUCTURE guard (World.validateCampaignStructure over the REAL
  //     shipping STAGES ladder): the GOAL's per-stage-DISTINCTNESS + escalation
  //     invariants as a committed regression check — 7 stages, each with UNIQUE
  //     geometry + UNIQUE theme, EXACTLY ONE boss each, non-decreasing non-boss
  //     density S2→S7, and the finale (S7) both the densest AND the max-HP boss.
  //     Motivated by a real miss (a prior cycle silently DROPPED density after
  //     stage 2 and every other guard still passed); wiring it here makes that
  //     class of drift fail the self-test loudly. Structural facts, not fun.
  {
    const cs = World.validateCampaignStructure(STAGES);
    check('campaign.structureInvariantsHold', cs.pass, cs.errors.join('; ') || `density=[${cs.density}] bossHp=[${cs.bossHp}]`);
    check('campaign.sevenDistinctStages', STAGES.length === 7 && new Set(STAGES.map((s) => s.theme)).size === 7, `n=${STAGES.length} themes=${new Set(STAGES.map((s) => s.theme)).size}`);
    check('campaign.finaleIsDensestAndHardest', cs.density[6] === Math.max(...cs.density) && cs.bossHp[6] === Math.max(...cs.bossHp), `density=[${cs.density}] bossHp=[${cs.bossHp}]`);
  }

  const passed = results.filter((r) => r.pass).length;
  return { passed, total: results.length, ok: passed === results.length, results };
}
