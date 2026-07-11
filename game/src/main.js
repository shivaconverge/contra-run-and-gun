// Boot + main loop. Live mode uses a fixed-timestep accumulator driven by
// rAF; headless mode (?headless=1&frames=N) steps the sim synchronously with a
// scripted input timeline and renders one deterministic frame for capture.
import { SIM, STAGES } from '../data/config.js';
import { LEVEL1 } from '../data/level1.js';
import { ASSET_MANIFEST } from '../data/assets.js';
import { World } from './world.js';
import { KeyboardInput, ScriptedInput, CombinedInput } from './input.js';
import { AssetStore } from './assets.js';
import { render } from './render.js';
import { runSelfTest } from './selftest.js';
import { AudioKit } from './audio.js';
import { mountTouchControls } from './touch.js';
import { mountFeedback } from './feedback.js';

const STEP = 1 / SIM.STEP_HZ;

function setupCanvas() {
  const canvas = document.getElementById('game');
  canvas.width = SIM.VIEW_W;
  canvas.height = SIM.VIEW_H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

// A canned "showcase" run for headless verification: sprint right, fire the
// whole time, pulse jumps, aim up briefly, and swap weapons once.
function showcaseTimeline() {
  const tl = [{ at: 0, set: { right: true, fire: true } }];
  for (let j = 40; j < 900; j += 70) {
    tl.push({ at: j, set: { jump: true } });
    tl.push({ at: j + 4, set: { jump: false } });
  }
  tl.push({ at: 150, set: { up: true } });
  tl.push({ at: 185, set: { up: false } });
  // Spread is acquired by grabbing the on-path pickup (~x=210), not by swapping.
  return tl;
}

// Prone demo: run right briefly, halt, then hold Down (go prone) while firing.
function proneTimeline() {
  return [
    { at: 0,  set: { right: true } },
    { at: 40, set: { right: false } },   // stop so Down triggers prone (dir === 0)
    { at: 46, set: { down: true, fire: true } },
  ];
}

function timelineFor(name) {
  return name === 'prone' ? proneTimeline() : showcaseTimeline();
}

function main() {
  window.__booted = true; // signals the index.html boot guard that modules loaded
  var bh = document.getElementById('boot-help'); // hide the "serve me" card if it showed on a slow load
  if (bh) bh.hidden = true;
  const params = new URLSearchParams(location.search);
  const headless = params.get('headless') === '1';
  const selftest = params.get('selftest') === '1';
  const seed = parseInt(params.get('seed') || '1234', 10);

  if (selftest) { publishSelfTest(); return; }

  const { ctx } = setupCanvas();
  const assets = new AssetStore();
  // 7-STAGE CAMPAIGN LADDER (data-driven, from config.STAGES). Default boots Stage 1.
  // `?level=N` (1..7) is a DEV shortcut to boot any stage directly — de-risking hook
  // (content/stage2/WIRE.md), NOT the normal play path (which is clear→CONTINUE). The
  // gate harnesses never pass ?level, so the default build stays byte-identical and
  // STAGES[0] === LEVEL1 by identity (fidelity captures untouched).
  const lvl = parseInt(params.get('level') || '1', 10);
  let stageIndex = lvl >= 1 && lvl <= STAGES.length ? lvl - 1 : 0;
  const world = new World(STAGES[stageIndex], seed, params.get('mode') || undefined);
  window.__game = world;
  window.__assets = assets; // exposed so a harness can confirm real art loaded

  // Publish the progression metadata the renderer/HUD reads (dynamic — no hardcoded
  // "STAGE 2"). `isFinalStage` + status==='cleared' == final VICTORY (render open
  // need: show a VICTORY screen for that pair). `nextStageLabel` names the stage the
  // CONTINUE prompt advances to.
  const syncStageMeta = () => {
    world.stageIndex = stageIndex;
    world.stageNum = stageIndex + 1;
    world.stageCount = STAGES.length;
    world.hasNextStage = stageIndex < STAGES.length - 1;
    world.isFinalStage = !world.hasNextStage;
    world.nextStageLabel = world.hasNextStage
      ? `STAGE ${stageIndex + 2}` + (STAGES[stageIndex + 1].name ? ` — ${STAGES[stageIndex + 1].name}` : '')
      : null;
    // Campaign audio hook: whenever the active stage changes (boot + every CONTINUE),
    // let the live layer swap to THIS stage's real generated biome track. Wired in
    // runLive (undefined in headless), so the sim path stays byte-identical.
    if (world.onStageChange) world.onStageChange(stageIndex);
  };
  syncStageMeta();

  // Player-INITIATED stage transition (content/stage2/WIRE.md §5, made gate-safe):
  // clearing a stage leaves status='cleared' (the playthrough gate never presses
  // continue); the player then advances via N / the touch CONTINUE tap. loadStage()
  // keeps the SAME world object so all the live-loop closures (feedback/audio/
  // HI-score) stay valid. Score/lives carry over; clearing the LAST stage is the
  // campaign VICTORY (no next stage, so CONTINUE is not offered).
  world.requestNextStage = () => {
    if (world.status !== 'cleared' || stageIndex >= STAGES.length - 1) return;
    stageIndex++;
    world.loadStage(STAGES[stageIndex], { score: world.score, lives: world.lives });
    syncStageMeta();
  };

  // "Play again" from the VICTORY screen restarts the whole CAMPAIGN at stage 1 (fresh
  // score/lives) — not world.reset(), which would rebuild only the final stage. Exposed
  // as a closure so runLive's key handler (no stageIndex scope) can drive it.
  world.restartCampaign = () => {
    stageIndex = 0;
    world.loadStage(STAGES[0]); // no carry → fresh score/lives for a new run
    syncStageMeta();
  };

  assets.load(ASSET_MANIFEST).then(() => {
    if (headless) runHeadless(ctx, world, assets, params);
    else runLive(ctx, world, assets);
  });
}

function publishSelfTest() {
  const report = runSelfTest();
  window.__selftest = report;
  const flag = document.createElement('div');
  flag.id = 'selftest-done';
  flag.textContent = JSON.stringify(report);
  document.body.appendChild(flag);
}

function runHeadless(ctx, world, assets, params) {
  const frames = parseInt(params.get('frames') || '200', 10);
  if (params.get('scenario') === 'boss') {
    // Boss-arena demo: drop the player at the barrier vs the boss, prone + fire.
    // Verifies/visualizes the win path without needing a bot to survive the level.
    world.enemies = world.enemies.filter((e) => e.kind === 'boss');
    world.boss = world.enemies[0];
    world.player.setWeapon(params.get('weapon') || 'spread'); // QA: test any weapon vs boss
    world.player.x = 2285; world.player.y = 210;
    world.camera.follow(world.player, true);
    const bossInput = new ScriptedInput([{ at: 0, set: { down: true, fire: true } }]);
    for (let i = 0; i < frames && world.status === 'playing'; i++) world.step(bossInput.poll());
  } else if (params.get('scenario') === 'bosskill') {
    // Boss-DEATH finale demo (EXPL-1): make the boss actually DIE so its multi-blast
    // finale FX are witnessable/capturable — the normal showcase can't out-damage
    // 90 HP in the frame budget, so the climax was never seen end-to-end. The demo
    // player is invincible (iframe held) + laser so the fight resolves determin-
    // istically; we run until the boss dies, then hold ~6 frames so the explosion
    // cluster is on-screen (still inside the death hit-stop freeze → FX at peak).
    world.enemies = world.enemies.filter((e) => e.kind === 'boss');
    world.boss = world.enemies[0];
    world.player.setWeapon('laser'); // strong + piercing → kills within the budget
    world.player.x = 2285; world.player.y = 210;
    world.camera.follow(world.player, true);
    const bossInput = new ScriptedInput([{ at: 0, set: { down: true, fire: true } }]);
    const maxF = Math.max(frames, 1500);
    let held = 0;
    for (let i = 0; i < maxF; i++) {
      world.player.iframe = 999; // demo-only invincibility so the fight always resolves
      world.step(bossInput.poll());
      if (world.boss.dead) { if (++held >= 6) break; } // hold past death so the FX render
    }
  } else {
    // Showcase demo (fidelity firefight capture). Keep the demo player ALIVE so it
    // pushes into a DENSE cluster and the captured beat is reliably BUSY — a
    // death+respawn-near-spawn demo makes the fixed-frame fidelity capture fragile
    // to tiny combat-timing shifts. Invincibility is a capture-only concern; the
    // real arcade one-hit death is unaffected (live play never runs this branch).
    const input = new ScriptedInput(timelineFor(params.get('script')));
    for (let i = 0; i < frames; i++) { world.player.iframe = 999; world.step(input.poll()); }
  }
  render(ctx, world, assets);

  // Publish a machine-readable summary for the verification harness.
  window.__bench = {
    frames,
    mode: world.modeKey,
    sfxCount: world.sfxEvents.length, // cumulative SFX events emitted this run
    playerShield: world.player.shield,
    playerX: Math.round(world.player.x),
    playerDead: world.player.dead,
    playerProne: world.player.prone,
    playerH: world.player.h,
    weapon: world.player.weaponKey,
    lives: world.lives,
    pickupsLeft: world.pickups.length,
    enemiesAlive: world.enemies.length,
    enemiesStart: LEVEL1.spawns.length,
    onScreenEnemies: world.onScreenEnemies,
    peakOnScreen: world.peakOnScreen, // max concurrent on-screen enemies this run (FID-3)
    bullets: world.bullets.length,
    particles: world.particles.length,
    fx: world.fx.length, // live explosion strips this frame
    fxSpawned: world.fxSpawned, // cumulative explosions blitted over the run
    score: world.score,
    status: world.status,
    bossDefeated: !!(world.boss && world.boss.dead), // explicit finale signal (scenario=bosskill)
    trauma: +world.feel.trauma.toFixed(3),
    hitStop: world.feel.hitStop,
    spritesLoaded: Object.keys(assets.images),
    spritesMissing: assets.missing,
  };
  const flag = document.createElement('div');
  flag.id = 'headless-done';
  flag.textContent = JSON.stringify(window.__bench);
  document.body.appendChild(flag);
}

const START_KEYS = ['Space', 'KeyZ', 'KeyX', 'Enter'];

// CAMPAIGN MUSIC — wire the REAL Udio-generated per-stage tracks (audio/tracks/,
// served under game/assets/audio/) into the live audio layer. Reads the manifest,
// decodes every biome's mp3 into a reusable buffer, then installs world.onStageChange
// so each stage (boot + every CONTINUE) hard-cuts the BGM to ITS biome loop. The synth
// (music.js) stays the fallback: a track that's still decoding or failed keeps the
// procedural theme, so the game is never silent. LIVE-only — headless never calls this,
// so the sim path is byte-identical and deterministic.
function wireCampaignMusic(audio, world) {
  if (!audio || !audio.music) return; // audio blocked/unsupported → synth-or-silent, no-op
  fetch('assets/audio/manifest.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((manifest) => {
      if (!manifest || !manifest.tracks) return;
      // Order tracks by their s<N>_ prefix so index i === campaign stage i (s1..s7).
      const ids = Object.keys(manifest.tracks).sort((a, b) => {
        const n = (s) => parseInt((/^s(\d+)/.exec(s) || [])[1] || '0', 10);
        return n(a) - n(b);
      });
      const urls = {};
      for (const id of ids) {
        const file = (manifest.tracks[id].file || `${id}.mp3`).split('/').pop();
        urls[id] = `assets/audio/${file}`;
      }
      // Select-by-stage stays live even while buffers are still decoding: useTrack keeps
      // the current source until the target buffer is ready, so early advances degrade
      // gracefully to the synth rather than going silent.
      world.onStageChange = (i) => audio.useTrack(ids[i] || null);
      audio.loadTracks(urls).then(() => world.onStageChange(world.stageIndex || 0));
    })
    .catch(() => { /* no manifest / offline → synth fallback, never throw */ });
}

function runLive(ctx, world, assets) {
  const audio = new AudioKit();
  window.__audio = audio;
  wireCampaignMusic(audio, world); // register the real per-stage biome tracks + select stage 1's
  world.toTitle(); // arcade "insert coin": boot onto a title/start screen
  // Keyboard (desktop) + on-screen touch (phones/Android) feed one merged input,
  // so both work. Touch mounts only on touch devices, or forced via ?touch=1.
  const keyboard = new KeyboardInput(window);
  const forceTouch = new URLSearchParams(location.search).get('touch') === '1';
  const touch = mountTouchControls(world, audio, { force: forceTouch });
  const input = new CombinedInput([keyboard, touch]);
  window.__touch = touch; // exposed so a harness can drive/verify the overlay

  // Creator-approval feedback panel (feedback/SPEC.md). Reachable from any state
  // via F; its verdict persists as the machine-readable release gate. Both API
  // handles the shipped QA gate reads are set (window.__approval / world.approval).
  const feedback = mountFeedback(world, { buildId: window.__buildId });
  window.__feedback = feedback;   // rich controller alias
  window.__approval = feedback;   // REQUIRED — the name the QA gate reads
  world.approval = feedback;      // so window.__game.approval is truthy too

  window.addEventListener('keydown', (e) => {
    // Feedback panel owns the keyboard first: F toggles it from anywhere, and
    // while open it swallows the game keys (R/1/2/M/start) so they don't leak.
    if (e.code === 'KeyF') { feedback.toggle(); e.preventDefault(); return; }
    if (feedback.isOpen()) { if (e.code === 'Escape') feedback.close(); return; }
    audio.resume(); // browsers gate audio until the first user gesture
    const onTitle = world.status === 'title';
    if (e.code === 'Digit1') world.setMode('arcade'); // one-hit death (default)
    else if (e.code === 'Digit2') world.setMode('casual');  // shield + extra lives
    else if (e.code === 'KeyM') audio.toggleMute();
    else if (e.code === 'KeyR' && world.status === 'cleared' && world.isFinalStage && world.restartCampaign) world.restartCampaign(); // victory → replay from stage 1
    else if (e.code === 'KeyR') world.reset();          // R otherwise → fresh playing (current stage)
    else if (e.code === 'KeyP' && world.status === 'playing') world.paused = !world.paused; // pause/resume
    else if (e.code === 'KeyN' && world.status === 'cleared' && world.hasNextStage) world.requestNextStage(); // continue to next stage
    else if (onTitle && START_KEYS.includes(e.code)) world.start();
  });

  // Persisted HI-SCORE — the arcade "beat your best" hook (attract screen + end
  // screen). LIVE-ONLY: localStorage, never read/written by the sim, so
  // determinism + headless are untouched. Exposed on the world for the renderer.
  const HS_KEY = 'contra:highscore:v1';
  const loadHigh = () => { try { return parseInt(localStorage.getItem(HS_KEY), 10) || 0; } catch (_) { return 0; } };
  const saveHigh = (v) => { try { localStorage.setItem(HS_KEY, String(v)); } catch (_) {} };
  let high = loadHigh();
  world.highScore = high;
  world.newHigh = false;
  let prevStatus = world.status;

  let last = performance.now();
  let acc = 0;
  let fps = 60, fpsT = 0, fpsN = 0;

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25; // tab-switch guard
    if (feedback.isOpen()) {
      acc = 0; // panel open → freeze the whole scene while the creator types
      world.attract = false;
    } else if (world.status === 'title') {
      // ATTRACT MODE (arcade): a self-playing bot demos the run-and-gun behind the
      // title overlay so the screen is ALIVE, not a dead frozen frame. Loops the
      // opening before the chasm/boss. SFX drained-but-silent (calm title); music
      // stays off (scene-gated to 'playing'). LIVE-only; sim determinism untouched.
      world.attract = true;
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < SIM.MAX_FRAME_STEPS) {
        const p = world.player;
        p.iframe = 999; // demo player never dies → a clean continuous loop
        const aheadX = p.x + p.w + 10, footY = p.y + p.h + 4;
        const groundAhead = world.solids.some((s) => s.kind === 'ground' && aheadX >= s.x && aheadX <= s.x + s.w && footY >= s.y && footY <= s.y + s.h + 4);
        const jump = p.grounded && !groundAhead;
        world.step({ left: false, right: true, up: false, down: false, jump, fire: true, swap: false, jumpPressed: jump, swapPressed: false });
        if (world.player.x > 2000) world.toTitle(); // loop the demo before the chasm/boss
        acc -= STEP; steps++;
      }
      if (acc > STEP * SIM.MAX_FRAME_STEPS) acc = 0;
      world.drainSfx(); // discard demo SFX — keep the title quiet
    } else if (world.paused) {
      // PAUSED (P / touch Pause): freeze the sim but keep rendering (frozen frame +
      // PAUSED overlay). Drop accumulated time so resume doesn't burst-catch-up, and
      // poll input so releasing keys mid-pause doesn't leave a control stuck held.
      acc = 0;
      input.poll();
    } else {
      world.attract = false;
      acc += dt;
      let steps = 0;
      while (acc >= STEP && steps < SIM.MAX_FRAME_STEPS) {
        world.step(input.poll());
        acc -= STEP;
        steps++;
      }
      if (acc > STEP * SIM.MAX_FRAME_STEPS) acc = 0;
      // Play any SFX the sim queued this frame (sim stays silent + deterministic).
      for (const ev of world.drainSfx()) audio.play(ev);
      audio.duck(world.feel.hitStop > 0); // dip music while the sim is hit-stop-frozen
      audio.setSection(world.bossActive && world.boss && !world.boss.dead ? 'boss' : 'stage'); // hard-cut to the boss theme in the arena
      audio.setIntensity(!!(world.boss && world.boss.enraged)); // phase-2 ENRAGE: hotter mix + double-time hats
    }

    // HI-SCORE: best-so-far ticks up live once you pass it; on the transition
    // INTO a terminal state, lock + persist it and flag a fresh record for the
    // end screen. Resets the flag when a new run begins. On the TITLE (attract
    // demo) show the persisted best, NOT the bot's demo score.
    world.highScore = world.status === 'playing' ? Math.max(high, world.score) : high;
    if ((world.status === 'gameover' || world.status === 'cleared') && prevStatus === 'playing') {
      world.newHigh = world.score > high;
      high = world.highScore;
      saveHigh(high);
    } else if (world.status === 'playing' && prevStatus !== 'playing') {
      world.newHigh = false;
    }
    prevStatus = world.status;

    render(ctx, world, assets);

    // CAMPAIGN END SCREENS (composited over render's generic overlay, the same way
    // drawFps/attract draw on top — LIVE-only, so headless/fidelity captures stay
    // byte-identical). render.js (weapon-defect's) currently draws only "STAGE CLEAR"
    // + a HARDCODED "STAGE 2" continue line and has no final victory screen; until it
    // consumes world.nextStageLabel/isFinalStage, this layer supplies the real thing:
    //  • intermediate clear → a STAGE CLEAR interstitial naming the ACTUAL next stage,
    //  • final stage cleared → a VICTORY / CAMPAIGN COMPLETE screen (goal payoff).
    drawCampaignEndOverlay(ctx, world);

    // Scene-gate the BGM: play only while a run is live; fade out under title /
    // game-over / victory so the 'gameover'/'clear' sting reads clean. Runs every
    // frame (outside the play branch) so it also covers the frozen title screen.
    audio.setPlaying(world.status === 'playing');

    // fps meter — also PUBLISHED on the world so a perf/QA harness can read live
    // telemetry (window.__game.__fps), not just the on-screen number. Entity
    // counts ride along for perf grounding (draw-load without re-reading arrays).
    fpsN++; fpsT += dt;
    if (fpsT >= 0.5) { fps = Math.round(fpsN / fpsT); fpsN = 0; fpsT = 0; }
    world.__fps = fps;
    world.__perf = { fps, enemies: world.enemies.length, bullets: world.bullets.length, particles: world.particles.length, fx: world.fx.length };
    drawFps(ctx, fps);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function drawFps(ctx, fps) {
  ctx.save();
  ctx.font = '7px monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(fps + 'fps', 4, SIM.VIEW_H - 2);
  ctx.restore();
}

// Campaign end screens, drawn OVER render's generic 'cleared' overlay (a full opaque
// dim first, so render's "STAGE CLEAR / STAGE 2" is fully superseded). Only fires on
// the 'cleared' status — 'gameover'/'title'/'playing'/'paused' keep render's screens.
// INTERIM: this belongs in render.js long-term (open need); it lives here so the
// victory payoff + correct next-stage label SHIP now without editing another loop's file.
function drawCampaignEndOverlay(ctx, world) {
  if (!world || world.status !== 'cleared') return;
  const W = SIM.VIEW_W, H = SIM.VIEW_H, cx = W / 2, cy = H / 2;
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  const score = 'SCORE ' + String(world.score || 0).padStart(6, '0');
  const hi = world.highScore || 0;
  ctx.save();
  // Near-opaque so render's already-drawn 'cleared' text (incl. its stale "STAGE 2"
  // line) is fully covered — a lighter dim let it ghost through underneath.
  ctx.fillStyle = 'rgba(0,0,0,0.985)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (world.isFinalStage) {
    // FINAL VICTORY — the campaign payoff after clearing stage 7.
    ctx.fillStyle = '#ffd23c';
    ctx.font = '24px monospace';
    ctx.fillText('VICTORY', cx, cy - 46);
    ctx.fillStyle = '#7CFC7C';
    ctx.font = '10px monospace';
    ctx.fillText('CAMPAIGN COMPLETE', cx, cy - 24);
    ctx.fillStyle = '#9fe0c0';
    ctx.font = '7px monospace';
    ctx.fillText('ALL ' + (world.stageCount || 7) + ' STAGES CLEARED', cx, cy - 12);
    ctx.fillStyle = '#ffe36e';
    ctx.font = '11px monospace';
    ctx.fillText(score, cx, cy + 6);
    if (world.newHigh) {
      ctx.fillStyle = '#ffd23c'; ctx.font = '9px monospace';
      ctx.fillText('★ NEW HIGH SCORE ★', cx, cy + 22);
    } else {
      ctx.fillStyle = '#8a97a8'; ctx.font = '8px monospace';
      ctx.fillText('HI ' + String(hi).padStart(6, '0'), cx, cy + 22);
    }
    ctx.fillStyle = '#fff'; ctx.font = '8px monospace';
    ctx.fillText(isTouch ? 'TAP TO PLAY AGAIN' : 'press R to play again', cx, cy + 38);
  } else {
    // INTERMEDIATE STAGE CLEAR — interstitial naming the ACTUAL next stage.
    ctx.fillStyle = '#7CFC7C';
    ctx.font = '16px monospace';
    ctx.fillText('STAGE CLEAR', cx, cy - 34);
    ctx.fillStyle = '#ffe36e';
    ctx.font = '10px monospace';
    ctx.fillText(score, cx, cy - 16);
    if (world.newHigh) {
      ctx.fillStyle = '#ffd23c'; ctx.font = '8px monospace';
      ctx.fillText('★ NEW HIGH SCORE ★', cx, cy - 3);
    } else {
      ctx.fillStyle = '#8a97a8'; ctx.font = '8px monospace';
      ctx.fillText('HI ' + String(hi).padStart(6, '0'), cx, cy - 3);
    }
    ctx.fillStyle = '#7CFC7C';
    ctx.font = '9px monospace';
    ctx.fillText(isTouch ? 'TAP TO CONTINUE' : 'press N to continue', cx, cy + 16);
    if (world.nextStageLabel) {
      ctx.fillStyle = '#cfe';
      ctx.font = '7px monospace';
      ctx.fillText('▶  ' + world.nextStageLabel, cx, cy + 30);
    }
  }
  ctx.restore();
}

main();
