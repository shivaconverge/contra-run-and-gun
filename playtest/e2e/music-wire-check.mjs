// music-wire-check.mjs — LIVE grounding that the wired BGM actually runs in the
// real browser build: start the game with a key gesture, confirm AudioKit built
// a MusicKit sharing the one ctx, the transport is running, KeyM mutes it, and
// hit-stop ducking flips duckGain. Drives the ACTUAL rAF build, not the sim harness.
import { serveGame, findChrome, loadPuppeteer, sleep } from './harness.mjs';

const puppeteer = loadPuppeteer();
const { url, close } = await serveGame();
const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: 'new',
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const results = [];
const ok = (name, cond, detail) => { results.push({ name, pass: !!cond, detail }); };
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForFunction('window.__audio && window.__game', { timeout: 8000 });

  // MusicKit was constructed and shares AudioKit's single AudioContext.
  const built = await page.evaluate(() => {
    const a = window.__audio;
    return { hasMusic: !!a.music, enabled: !!(a.music && a.music.enabled),
             sharedCtx: !!(a.music && a.ctx && a.music.ctx === a.ctx) };
  });
  ok('music.constructed', built.hasMusic, JSON.stringify(built));
  ok('music.enabledInBrowser', built.enabled, JSON.stringify(built));
  ok('music.sharesOneAudioContext', built.sharedCtx, JSON.stringify(built));

  // First user gesture: start the game — this fires audio.resume() → music.resume().
  await page.focus('canvas');
  await page.keyboard.press('Enter');
  await sleep(500);
  const afterStart = await page.evaluate(() => ({
    status: window.__game.status, running: window.__audio.music.running,
    ctxState: window.__audio.ctx.state,
    musicGain: window.__audio.music.musicGain.gain.value,
  }));
  ok('music.transportRunning', afterStart.running, JSON.stringify(afterStart));

  // REAL PER-STAGE TRACK: main.js registers the Udio-generated biome mp3s from
  // assets/audio/manifest.json and useTrack()s stage 1's on boot. Confirm the buffer
  // decoded, the active track is the jungle theme, and the real-track gain is up while
  // the synth gain is ducked to silence — i.e. the campaign is playing the REAL audio,
  // not the procedural fallback. (Buffers decode async, so wait for readiness first.)
  await page.waitForFunction(
    "window.__audio.music._trackBuffers && Object.keys(window.__audio.music._trackBuffers).length === 7",
    { timeout: 20000 },
  );
  await sleep(300); // let useTrack's gain cross-fade settle
  const realTrack = await page.evaluate(() => {
    const m = window.__audio.music;
    return {
      hasS1: m.hasTrack('s1_jungle'),
      active: m.track,
      trackGain: m.trackGain.gain.value,
      synthGain: m.musicGain.gain.value,
      loadedCount: [1, 2, 3, 4, 5, 6, 7]
        .filter((n) => Object.keys(m._trackBuffers || {}).some((k) => k.startsWith('s' + n + '_'))).length,
    };
  });
  ok('music.realTrackDecoded', realTrack.hasS1, JSON.stringify(realTrack));
  ok('music.playsRealStage1Track', realTrack.active === 's1_jungle', JSON.stringify(realTrack));
  ok('music.realTrackAudible', realTrack.trackGain > 0.05 && realTrack.synthGain < 0.02, JSON.stringify(realTrack));
  ok('music.allSevenBiomeTracksLoaded', realTrack.loadedCount === 7, JSON.stringify(realTrack));

  // CAMPAIGN ADVANCE: clearing a stage → CONTINUE swaps the BGM to the next biome's
  // real track. Drive world.onStageChange (the hook main.js installed) across all 7
  // stages and confirm each selects its own distinct registered track.
  const ladder = await page.evaluate(async () => {
    const w = window.__game, m = window.__audio.music;
    const seen = [];
    for (let i = 0; i < 7; i++) {
      w.onStageChange(i);
      await new Promise((r) => setTimeout(r, 120));
      seen.push(m.track);
    }
    return seen;
  });
  const distinct = new Set(ladder);
  ok('music.everyStageHasDistinctTrack', distinct.size === 7 && ladder.every(Boolean), JSON.stringify(ladder));

  // KeyM mutes music in lockstep with SFX.
  await page.keyboard.press('KeyM');
  await sleep(200);
  const muted = await page.evaluate(() => ({ muted: window.__audio.music.muted, sfxMuted: window.__audio.muted }));
  ok('music.mutedByKeyM', muted.muted && muted.sfxMuted, JSON.stringify(muted));
  await page.keyboard.press('KeyM'); // un-mute
  await sleep(150);

  // Hit-stop ducking: force feel.hitStop and confirm the render-loop duck() call
  // pulls duckGain below unity, then restores when hit-stop clears.
  const duck = await page.evaluate(async () => {
    const a = window.__audio, w = window.__game;
    // Pin hitStop high (the sim decrements it) so the render loop keeps ducking,
    // sampling the lowest duckGain reached + the live _ducked flag.
    let minDuck = 1, sawFlag = false;
    const pin = setInterval(() => {
      w.feel.hitStop = 8;
      minDuck = Math.min(minDuck, a.music.duckGain.gain.value);
      if (a.music._ducked) sawFlag = true;
    }, 16);
    await new Promise((r) => setTimeout(r, 300));
    clearInterval(pin);
    w.feel.hitStop = 0;
    await new Promise((r) => setTimeout(r, 400));
    return { ducked: minDuck, flag: sawFlag, restored: a.music.duckGain.gain.value };
  });
  ok('music.ducksUnderHitStop', duck.flag === true && duck.ducked < 0.99, JSON.stringify(duck));
  ok('music.restoresAfterHitStop', duck.restored > 0.9, JSON.stringify(duck));

  // Bar scheduler advanced (music is genuinely sequencing, not idling).
  const advanced = await page.evaluate(() => window.__audio.music._bar);
  ok('music.schedulerAdvanced', advanced > 0, `bars scheduled=${advanced}`);

  // BOSS SECTION SWITCH: the render loop calls audio.setSection(...) every frame
  // off world.bossActive/world.boss.dead. Drive the live boss state and confirm the
  // MusicKit hard-cuts to the 'boss' theme (queued to the next downbeat), then back
  // to 'stage' when the boss is defeated. This exercises the +2-line boss hook.
  const boss = await page.evaluate(async () => {
    const w = window.__game, a = window.__audio;
    const start = a.music.section;                 // 'stage' during the normal run
    w.bossActive = true;                            // arena wakes → hook requests 'boss'
    if (w.boss) w.boss.dead = false;
    // section switch queues to the next downbeat; give the scheduler >1 bar to apply.
    await new Promise((r) => setTimeout(r, 1600));
    const inBoss = a.music.section;
    if (w.boss) w.boss.dead = true;                 // victory → hook requests 'stage'
    else w.bossActive = false;
    await new Promise((r) => setTimeout(r, 1600));
    const afterWin = a.music.section;
    return { start, inBoss, afterWin, hadBoss: !!w.boss };
  });
  ok('music.switchesToBossTheme', boss.inBoss === 'boss', JSON.stringify(boss));
  ok('music.returnsToStageOnWin', boss.afterWin === 'stage', JSON.stringify(boss));

  // SCENE GATE: the render loop calls audio.setPlaying(world.status === 'playing')
  // EVERY frame (outside the play branch), so it also fires on the frozen title /
  // game-over / victory screens. Drive the live run status and confirm MusicKit
  // fades sceneGain OUT when a run isn't in progress (so the 'gameover'/'clear'
  // sting lands clean) and back IN when play resumes. This exercises the Step-4 hook.
  const scene = await page.evaluate(async () => {
    const w = window.__game, a = window.__audio;
    // reset() → a clean, HELD 'playing' run (revives player + lives) so the sim
    // won't flip us back to gameover the way a forced status would mid-frame.
    w.reset();
    await new Promise((r) => setTimeout(r, 300)); // > the ~0.12s fade-in
    const playingGain = a.music.sceneGain.gain.value;
    const playingFlag = a.music._playing;
    // A run ending (death): gameover is a terminal status the sim leaves in place,
    // so the render loop's setPlaying(false) sticks and the music gates down.
    w.status = 'gameover';
    await new Promise((r) => setTimeout(r, 600)); // > the ~0.35s fade-out
    const overGain = a.music.sceneGain.gain.value;
    const overFlag = a.music._playing;
    // Restart the run (R does world.reset() live) → music fades back in.
    w.reset();
    await new Promise((r) => setTimeout(r, 350)); // > the ~0.12s fade-in
    const resumedGain = a.music.sceneGain.gain.value;
    const resumedFlag = a.music._playing;
    return { playingGain, playingFlag, overGain, overFlag, resumedGain, resumedFlag };
  });
  ok('music.playsDuringRun', scene.playingFlag === true && scene.playingGain > 0.9, JSON.stringify(scene));
  ok('music.gatesOutOnGameOver', scene.overFlag === false && scene.overGain < 0.15, JSON.stringify(scene));
  ok('music.resumesOnRestart', scene.resumedFlag === true && scene.resumedGain > 0.9, JSON.stringify(scene));
} finally {
  await browser.close();
  await close();
}
let allPass = true;
for (const r of results) { if (!r.pass) allPass = false; console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  — ${r.detail}`); }
console.log(allPass ? '\nVERDICT: PASS — BGM is wired and live in the real build.' : '\nVERDICT: FAIL');
process.exit(allPass ? 0 : 1);
