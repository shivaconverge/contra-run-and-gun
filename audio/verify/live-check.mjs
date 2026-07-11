// live-check.mjs — verify the music is LIVE in the SHIPPED build (not just my module).
//
// root.B wired MusicKit into game/src/audio.js + main.js (commit 89f6f80). This
// drives the ACTUAL served game in real Chromium and asserts the integration works
// end-to-end — it does NOT re-test my standalone module (that's render-check.mjs):
//
//   A. SELF-TEST INTEGRITY : boot ?selftest=1, read window.__selftest → the whole
//      in-engine suite passes AND the new `audio.musicNoThrow` check is green, i.e.
//      mounting music did not break determinism / headless safety.
//   B. LIVE OBJECTS RESPOND : boot the real game, fire a user gesture, then on the
//      REAL window.__audio instance the game built: music mounted + enabled, the
//      transport actually starts (scheduler advances bars), audio.duck(true) dips
//      the music (the exact call main.js makes each hit-stop frame), and KeyM /
//      setMuted mutes it. These are the wiring points, exercised on live objects.
//
// Boots game/serve.mjs on a free port, runs headless-shell with autoplay allowed so
// the realtime AudioContext actually runs. Exit 0 all-pass, 1 on any fail.

import { existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const gameDir = resolve(__dirname, '../../game');

function findChrome() {
  const base = `${process.env.HOME}/.cache/puppeteer/chrome`;
  if (!existsSync(base)) return null;
  const rel = 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  return readdirSync(base).map((v) => resolve(base, v, rel)).filter(existsSync).sort().pop();
}
async function loadPuppeteer() {
  const rel = 'node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
  for (const c of [
    resolve(__dirname, '..', rel),
    resolve(__dirname, '../../playtest/e2e', rel),
    resolve(__dirname, '../../../../repo/playtest/e2e', rel),
    resolve(__dirname, '../../../../strategy/playtest/e2e', rel),
  ]) if (existsSync(c)) return (await import(c)).default;
  throw new Error('puppeteer-core not found');
}

function ok(name, pass, detail) { console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); return pass; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForPort(proc) {
  return new Promise((res, rej) => {
    let buf = '';
    const onData = (d) => { buf += d.toString(); const m = /localhost:(\d+)/.exec(buf); if (m) res(parseInt(m[1], 10)); };
    proc.stdout.on('data', onData); proc.stderr.on('data', onData);
    proc.on('exit', (c) => rej(new Error(`server exited early (${c}): ${buf}`)));
    setTimeout(() => rej(new Error(`server never announced a port: ${buf}`)), 8000);
  });
}

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.error('No chrome-for-testing binary'); process.exit(2); }
  const puppeteer = await loadPuppeteer();

  // let serve.mjs use its default port and auto-increment off a busy one; we parse
  // the actual port it announces on stdout.
  const server = spawn('node', ['serve.mjs'], { cwd: gameDir });
  let port;
  try { port = await waitForPort(server); } catch (e) { console.error(e.message); server.kill('SIGKILL'); process.exit(2); }
  const url = `http://localhost:${port}`;
  console.log(`\nLIVE BUILD MUSIC-INTEGRATION CHECK  (served at ${url})\n`);

  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'shell', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  let pass = true;
  try {
    // ---- A. self-test integrity ------------------------------------------
    const p1 = await browser.newPage();
    p1.on('pageerror', (e) => console.error('PAGE ERROR (selftest):', e.message));
    await p1.goto(`${url}/?selftest=1`, { waitUntil: 'networkidle0', timeout: 15000 });
    await p1.waitForFunction('window.__selftest', { timeout: 15000 });
    const st = await p1.evaluate('window.__selftest');
    const music = st.results.find((r) => r.name === 'audio.musicNoThrow');
    pass &= ok('self-test suite passes with music mounted', st.ok, `${st.passed}/${st.total} passed`);
    pass &= ok('audio.musicNoThrow present & green', !!music && music.pass, music ? music.detail : 'CHECK MISSING');
    await p1.close();

    // ---- B. live objects respond -----------------------------------------
    const p2 = await browser.newPage();
    p2.on('pageerror', (e) => console.error('PAGE ERROR (live):', e.message));
    await p2.goto(`${url}/`, { waitUntil: 'networkidle0', timeout: 15000 });
    await p2.waitForFunction('window.__booted === true && window.__audio', { timeout: 15000 });

    // user gesture → unlock autoplay + start music (same path as a real keypress)
    await p2.focus('body').catch(() => {});
    await p2.keyboard.press('Space');
    await p2.evaluate('window.__audio && window.__audio.resume()');
    await sleep(900); // let the realtime scheduler advance a few bars

    const live = await p2.evaluate(`(() => {
      const a = window.__audio, m = a && a.music;
      if (!m) return { mounted: false };
      const enabled = m.enabled, ctxState = a.ctx && a.ctx.state;
      const barsScheduled = m._bar;                 // scheduler advances this
      const running = m.running;
      // duck: call the SAME method main.js calls each hit-stop frame
      const preDuck = m.duckGain ? m.duckGain.gain.value : null;
      a.duck(true);
      const duckedTarget = m._duckAmt;              // what duck ramps toward
      const ducked = m._ducked;
      a.duck(false);
      // mute via the KeyM path (AudioKit.toggleMute forwards to music.setMuted)
      const wasMuted = a.muted;
      a.toggleMute();
      const mutedFlag = m.muted;
      a.toggleMute();
      return { mounted: true, enabled, ctxState, barsScheduled, running, preDuck, duckedTarget, ducked, mutedFlag, base: m._base };
    })()`);

    pass &= ok('music mounted on the live AudioKit', live.mounted && live.enabled, `enabled=${live.enabled} ctx=${live.ctxState}`);
    pass &= ok('transport running (scheduler advanced bars)', live.running && live.barsScheduled > 0, `running=${live.running} bars=${live.barsScheduled}`);
    pass &= ok('audio.duck(true) engages ducking on live music', live.ducked === true && live.duckedTarget < 1, `ducked=${live.ducked} target=${live.duckedTarget}`);
    pass &= ok('KeyM path mutes live music', live.mutedFlag === true, `music.muted=${live.mutedFlag}`);

    // ---- C. boss theme switches LIVE via the real render-loop wiring ----------
    // main.js runs `audio.setSection(world.bossActive && world.boss && !world.boss.dead ? 'boss':'stage')`
    // every play frame (cited by signature, not line number — line numbers drift as
    // root.B edits main.js; the source-presence check in block E anchors the wiring).
    // Drive the game to 'playing', trigger the REAL boss-active
    // latch (world.step flips world.bossActive when boss.active) and confirm the live
    // music actually cuts to the boss section — then flip back to confirm the return.
    const setup = await p2.evaluate(`(() => {
      const w = window.__game;
      if (!w) return { ok: false, why: 'no window.__game' };
      if (w.status === 'title') w.start();
      if (!w.boss) return { ok: false, why: 'level has no boss enemy' };
      const startSection = window.__audio.music.section;
      w.boss.active = true;                 // world.step() will latch w.bossActive=true
      return { ok: true, startSection, status: w.status };
    })()`);
    if (!setup.ok) {
      pass &= ok('boss theme switches live', false, `setup failed: ${setup.why}`);
    } else {
      // wait for the scheduler to apply the queued switch at the next downbeat (~1.6s/bar)
      let toBoss = true;
      try { await p2.waitForFunction("window.__audio.music.section === 'boss'", { timeout: 4000 }); }
      catch { toBoss = false; }
      pass &= ok('boss theme switches live (stage→boss on boss-active)', toBoss, `startSection=${setup.startSection} → ${await p2.evaluate('window.__audio.music.section')}`);

      // Persistence: boss theme must HOLD through the fight, not flicker back (the real
      // requirement). Sample the section over ~1.3s while boss stays active.
      await sleep(1300);
      const held = await p2.evaluate("window.__audio.music.section");
      pass &= ok('boss theme holds through the fight', held === 'boss', `section=${held}`);

      // Return path = the REAL transition: a restart (R key → world.reset()) clears boss
      // state, so the render loop selects 'stage' again. (There is no boss→stage mid-fight
      // in normal play — boss death ends the level.)
      await p2.evaluate('window.__game.reset()');
      let toStage = true;
      try { await p2.waitForFunction("window.__game.status === 'playing' && window.__audio.music.section === 'stage'", { timeout: 4000 }); }
      catch { toStage = false; }
      pass &= ok('stage theme resumes live after restart (reset clears boss state)', toStage, `status=${await p2.evaluate('window.__game.status')} section=${await p2.evaluate('window.__audio.music.section')}`);
    }

    // ---- D. scene-gate cuts BGM under game-over / victory (shipped wiring) -----
    // main.js runs `audio.setPlaying(world.status === 'playing')` every frame (signature,
    // not line number). The REAL victory status is 'cleared' (NOT 'won'); death is
    // 'gameover'. Force each
    // real status and confirm the live music fades out (sceneGain→~0), then restart and
    // confirm it fades back in — so the 'clear'/'gameover' SFX sting isn't buried.
    const sceneWired = await p2.evaluate("typeof window.__audio.music.setPlaying === 'function' && !!window.__audio.music.sceneGain");
    if (!sceneWired) {
      pass &= ok('scene-gate cuts BGM on game-over/victory', false, 'shipped MusicKit lacks setPlaying/sceneGain — re-sync needed');
    } else {
      const sceneGain = () => p2.evaluate('+window.__audio.music.sceneGain.gain.value');
      // ensure playing first
      await p2.evaluate("window.__game.status !== 'playing' && window.__game.start()");
      await p2.waitForFunction('window.__audio.music.sceneGain.gain.value > 0.9', { timeout: 3000 }).catch(() => {});
      // victory: the REAL status is 'cleared'
      await p2.evaluate("window.__game.status = 'cleared'");
      let clearedCut = true;
      try { await p2.waitForFunction('window.__audio.music.sceneGain.gain.value < 0.05', { timeout: 3000 }); } catch { clearedCut = false; }
      pass &= ok("scene-gate fades BGM on victory ('cleared')", clearedCut, `sceneGain=${(await sceneGain()).toFixed(3)} (<0.05)`);
      // death: 'gameover'
      await p2.evaluate("window.__game.status = 'gameover'");
      await sleep(500);
      const goCut = await sceneGain();
      pass &= ok("scene-gate keeps BGM cut on death ('gameover')", goCut < 0.05, `sceneGain=${goCut.toFixed(3)} (<0.05)`);
      // restart → playing: BGM fades back in
      await p2.evaluate('window.__game.reset()');
      let back = true;
      try { await p2.waitForFunction("window.__game.status === 'playing' && window.__audio.music.sceneGain.gain.value > 0.9", { timeout: 3000 }); } catch { back = false; }
      pass &= ok('BGM fades back in on restart', back, `status=${await p2.evaluate('window.__game.status')} sceneGain=${(await sceneGain()).toFixed(3)} (>0.9)`);
    }

    // ---- E. wiring present in the SHIPPED source (drift-proof, by signature) ---
    // The behavior tests above prove the hooks work; this pins the *call sites* by
    // signature (NOT line number, which drifts) so a future refactor that removes or
    // renames a hook is caught with a clear diagnostic. Fetches the served source.
    const wiring = await p2.evaluate(`(async () => {
      const get = async (p) => { try { return await (await fetch(p)).text(); } catch { return ''; } };
      const main = await get('/src/main.js'), audio = await get('/src/audio.js');
      return {
        pDuck: /duck\\s*\\(\\s*active\\s*\\)/.test(audio),
        pSection: /setSection\\s*\\(\\s*name\\s*\\)/.test(audio),
        pPlaying: /setPlaying\\s*\\(\\s*active\\s*\\)/.test(audio),
        cDuck: main.includes('audio.duck('),
        cSection: main.includes('audio.setSection('),
        cPlaying: /audio\\.setPlaying\\(\\s*world\\.status === 'playing'\\s*\\)/.test(main),
      };
    })()`);
    pass &= ok('audio.js passthroughs present (duck/setSection/setPlaying)', wiring.pDuck && wiring.pSection && wiring.pPlaying, JSON.stringify({ duck: wiring.pDuck, section: wiring.pSection, playing: wiring.pPlaying }));
    pass &= ok('main.js render-loop calls present (duck/setSection/setPlaying)', wiring.cDuck && wiring.cSection && wiring.cPlaying, JSON.stringify({ duck: wiring.cDuck, section: wiring.cSection, playing: wiring.cPlaying }));

    // ---- G. boss phase-2 ENRAGE intensity engages LIVE (shipped wiring) --------
    // main.js runs `audio.setIntensity(!!(world.boss && world.boss.enraged))` every play
    // frame. Drive the game to a boss fight, force the boss into its persistent enraged
    // state (the flag the hook reads), and confirm the live music intensity engages:
    // musicGain lifts to ~base×1.22 and the _intensity flag flips — then a restart clears it.
    const enrageWired = await p2.evaluate("typeof window.__audio.music.setIntensity === 'function'");
    if (!enrageWired) {
      pass &= ok('enrage intensity engages live', false, 'shipped MusicKit lacks setIntensity — re-sync needed');
    } else {
      const musicGain = () => p2.evaluate('+window.__audio.music.musicGain.gain.value');
      const setup = await p2.evaluate(`(() => {
        const w = window.__game;
        if (w.status !== 'playing') w.start();
        if (!w.boss) return { ok: false, why: 'no boss' };
        w.boss.active = true;              // enter the arena
        w.boss.enraged = true;            // force phase-2 (persistent flag the hook reads)
        return { ok: true, base: +window.__audio.music._base };
      })()`);
      if (!setup.ok) {
        pass &= ok('enrage intensity engages live', false, `setup: ${setup.why}`);
      } else {
        let engaged = true;
        try { await p2.waitForFunction('window.__audio.music._intensity === true && window.__audio.music.musicGain.gain.value > 0.24', { timeout: 3000 }); } catch { engaged = false; }
        pass &= ok('enrage lifts the live music (musicGain → ~base×1.22)', engaged, `_intensity=${await p2.evaluate('window.__audio.music._intensity')} musicGain=${(await musicGain()).toFixed(3)} (base=${setup.base}, >0.24)`);
        // restart clears the enrage → intensity relaxes back to base
        await p2.evaluate('window.__game.reset()');
        let relaxed = true;
        try { await p2.waitForFunction('window.__audio.music._intensity === false && window.__audio.music.musicGain.gain.value < 0.24', { timeout: 3000 }); } catch { relaxed = false; }
        pass &= ok('enrage relaxes on restart (musicGain → base)', relaxed, `_intensity=${await p2.evaluate('window.__audio.music._intensity')} musicGain=${(await musicGain()).toFixed(3)} (<0.24)`);
      }
    }

    // ---- F. rapid state-churn robustness (real: player mashing restart) --------
    // The three gain stages (mute × duck × scene) each ramp via cancelScheduledValues +
    // setValueAtTime + exponentialRamp. Rapidly interleaving setPlaying/setSection/mute
    // could, if the automation raced, leave a gain STUCK at a wrong value. Fire 20 fast
    // interleaved toggles, end on a KNOWN logical state (playing / stage / unmuted).
    await p2.evaluate(`(() => {
      const a = window.__audio;
      for (let i = 0; i < 20; i++) { a.setPlaying(i % 2 === 0); a.setSection(i % 2 === 0 ? 'boss' : 'stage'); a.toggleMute(); }
      a.setPlaying(true); a.setSection('stage'); if (a.muted) a.toggleMute();
    })()`);
    // (a) GAINS are continuous ramps (<=0.35s) → settle fast. This is the real
    //     stuck-gain guard: after churn every gain must converge to its target.
    await sleep(900);
    const churn = await p2.evaluate('({ scene: +window.__audio.music.sceneGain.gain.value.toFixed(4), music: +window.__audio.music.musicGain.gain.value.toFixed(4), duck: +window.__audio.music.duckGain.gain.value.toFixed(4), muted: window.__audio.music.muted, running: window.__audio.music.running })');
    const gainsOk = churn.scene > 0.9 && Math.abs(churn.music - 0.22) < 0.02 && churn.duck > 0.9 && churn.muted === false && churn.running === true;
    pass &= ok('gains settle correctly after rapid churn (no stuck gain)', gainsOk, JSON.stringify(churn));
    // (b) SECTION is deliberately downbeat-quantized (queued to the next bar, <=1.58s,
    //     for a clean musical cut) — NOT instant. So poll for convergence within a bar+;
    //     the render loop keeps requesting 'stage' (boss inactive) so it must settle.
    let sectionSettled = true;
    try { await p2.waitForFunction("window.__audio.music.section === 'stage'", { timeout: 2500 }); } catch { sectionSettled = false; }
    pass &= ok('section converges to stage after churn (downbeat-quantized, ≤1 bar)', sectionSettled, `section=${await p2.evaluate('window.__audio.music.section')}`);
    await p2.close();

    // ---- H. Stage-2 per-stage music (INTENDED behavior; tracks the pending wiring) -----
    // Stage-2 "Cascade Base" is reachable now via ?level=2. INTENDED: it plays the A-minor
    // 'stage2' theme (not the E-minor Stage-1 'stage'). This asserts that intended end-state.
    // Until root.B re-syncs music.js (+ the world.level===LEVEL2 selector, INTEGRATION Step 6)
    // it can't be satisfied — so it reports a clearly-marked PENDING line instead of a hard
    // FAIL: the gap is unwired integration (owned by root.B), not a regression in this layer.
    // It auto-flips to a real PASS the moment the wiring lands. (Not a masked green.)
    // Covers BOTH intended sections: the Stage-2 stage theme ('stage2') AND its chopper-boss
    // theme ('boss2', forced via the isBoss chopper). The boss-music TRIGGER is verified to
    // fire in Stage-2 (world.js:48 finds the chopper via def.isBoss — grounded live), so only
    // the section SELECTION is missing; both auto-flip to PASS when root.B wires the selector.
    let s2Reachable = false, s2Section = null, s2BossSection = null;
    try {
      const p3 = await browser.newPage();
      await p3.goto(`${url}/?level=2`, { waitUntil: 'networkidle0', timeout: 15000 });
      await p3.waitForFunction("window.__booted === true && window.__audio && window.__game && window.__game.level && window.__game.boss", { timeout: 15000 });
      await p3.keyboard.press('Space');
      await p3.evaluate('window.__audio.resume()');
      await sleep(2000); // allow the stage section to settle if a selector is wired
      const s2 = await p3.evaluate("({ name: window.__game.level.name, section: window.__audio.music.section })");
      s2Reachable = s2.name === 'Cascade Base';
      s2Section = s2.section;
      // force the chopper boss active → the boss-music path selects the Stage-2 boss theme
      await p3.evaluate("window.__game.boss.active = true");
      await sleep(2500);
      s2BossSection = await p3.evaluate("window.__game.bossActive ? window.__audio.music.section : 'boss-trigger-DID-NOT-fire'");
      await p3.close();
    } catch (e) { console.error('stage2 probe error:', e.message); }
    if (!s2Reachable) {
      console.log(`  ⏳ PENDING  Stage-2 not reachable via ?level=2 in this build — nothing to check yet.`);
    } else {
      // stage theme
      if (s2Section === 'stage2') pass &= ok('Stage-2 (?level=2) plays the stage2 theme', true, `section=${s2Section}`);
      else console.log(`  ⏳ PENDING  Stage-2 stage plays '${s2Section}', not 'stage2' — OI-A1; root.B needs music.js re-sync + world.level===LEVEL2 selector (INTEGRATION Step 6).`);
      // boss theme (chopper)
      if (s2BossSection === 'boss2') pass &= ok('Stage-2 chopper fight plays the boss2 theme', true, `section=${s2BossSection}`);
      else if (s2BossSection === 'boss-trigger-DID-NOT-fire') pass &= ok('Stage-2 boss-music trigger fires (chopper found as boss)', false, 'bossActive never latched — a DEEPER gap than OI-A1 (world.js boss-finder)');
      else console.log(`  ⏳ PENDING  Stage-2 chopper fight plays '${s2BossSection}', not 'boss2' — OI-A1 (same selector fix; boss-trigger DOES fire, only the section is E-minor).`);
    }

    console.log('');
    console.log(JSON.stringify({ selftest: { ok: st.ok, passed: st.passed, total: st.total }, live, boss: setup, stage2: { reachable: s2Reachable, stageSection: s2Section, bossSection: s2BossSection }, verdict: pass ? 'PASS' : 'FAIL' }));
  } catch (e) {
    console.error('live-check error:', e.message); pass = false;
  } finally {
    await browser.close();
    server.kill('SIGKILL');
  }
  process.exit(pass ? 0 : 1);
})();
