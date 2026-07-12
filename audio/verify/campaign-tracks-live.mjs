// campaign-tracks-live.mjs — prove the 7 REAL Udio per-biome mp3s actually play in
// the SHIPPED browser build, one per campaign stage. This is the FACT behind the
// deliverable's headline claim ("real generated audio, hard-cut per stage"): not a
// file/loudness check (that's analyze-tracks.py) and not the synth wiring (that's
// live-check.mjs) — this boots game/serve.mjs in real Chromium and, on the ACTUAL
// window.__audio the game built, drives every stage's selector and asserts:
//   1. wireCampaignMusic fetched the manifest and DECODED all 7 mp3s (m.hasTrack(id));
//   2. audio.useTrack(id) — the exact call main.js's world.onStageChange makes —
//      hard-cuts to that biome: m.track===id, trackGain goes hot (real audio audible),
//      synth musicGain drops to ~0 (procedural fallback silenced);
//   3. selecting the next stage swaps the live BufferSource cleanly.
// Exit 0 all-pass, 1 on any fail, 2 on infra (no chrome / server).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const gameDir = resolve(__dirname, '../../game');
const manifestPath = resolve(gameDir, 'assets/audio/manifest.json');

function findChrome() {
  const base = `${process.env.HOME}/.cache/puppeteer/chrome`;
  if (!existsSync(base)) return null;
  const rel = 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  return readdirSync(base).map((v) => resolve(base, v, rel)).filter(existsSync).sort().pop();
}
async function waitForPort(proc) {
  return new Promise((res, rej) => {
    let buf = '';
    const onData = (d) => { buf += d.toString(); const m = /localhost:(\d+)/.exec(buf); if (m) res(parseInt(m[1], 10)); };
    proc.stdout.on('data', onData); proc.stderr.on('data', onData);
    proc.on('exit', (c) => rej(new Error(`server exited early (${c}): ${buf}`)));
    setTimeout(() => rej(new Error(`server never announced a port: ${buf}`)), 8000);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ok(name, pass, detail) { console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); return pass; }

// campaign stage order === config.js STAGES (the contract the manifest must satisfy)
const CAMPAIGN = ['jungle', 'cascade', 'snow', 'desert', 'foundry', 'caverns', 'fortress'];

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.error('No chrome-for-testing binary'); process.exit(2); }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const ids = Object.keys(manifest.tracks).sort((a, b) => {
    const n = (s) => parseInt((/^s(\d+)/.exec(s) || [])[1] || '0', 10);
    return n(a) - n(b);
  });

  const server = spawn('node', ['serve.mjs'], { cwd: gameDir });
  let port;
  try { port = await waitForPort(server); } catch (e) { console.error(e.message); server.kill('SIGKILL'); process.exit(2); }
  const url = `http://localhost:${port}`;
  console.log(`\nCAMPAIGN REAL-TRACK LIVE CHECK  (served at ${url})\n`);

  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'shell', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  let pass = true;
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
    await page.goto(`${url}/`, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.waitForFunction('window.__booted === true && window.__audio && window.__audio.music', { timeout: 15000 });

    // user gesture → unlock autoplay + start transport (same path as a real keypress)
    await page.focus('body').catch(() => {});
    await page.keyboard.press('Space');
    await page.evaluate('window.__audio && window.__audio.resume()');

    // wait for wireCampaignMusic to fetch + decode ALL 7 mp3s (network + decodeAudioData)
    let decoded = false;
    for (let i = 0; i < 60; i++) { // up to ~15s (cold-start decode margin)
      decoded = await page.evaluate(`(() => { const m = window.__audio.music; return ${JSON.stringify(ids)}.every((id) => m.hasTrack(id)); })()`);
      if (decoded) break;
      await sleep(250);
    }
    pass &= ok('all 7 biome mp3s fetched + decoded in-browser (decodeAudioData)', decoded, `${ids.length} tracks`);

    // ctx must be live for real playback
    const ctxState = await page.evaluate('window.__audio.ctx && window.__audio.ctx.state');
    pass &= ok('AudioContext running (real playback possible)', ctxState === 'running', `ctx=${ctxState}`);

    // Drive each stage's selector — the EXACT call main.js's world.onStageChange makes —
    // and assert the engine hard-cuts to that biome's real buffer.
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const r = await page.evaluate(`(async () => {
        const a = window.__audio, m = a.music;
        a.useTrack(${JSON.stringify(id)});     // === onStageChange(${i})
        await new Promise((res) => setTimeout(res, 180)); // let gains ramp
        return {
          active: m.track,
          hasBuf: m.hasTrack(${JSON.stringify(id)}),
          trackGain: m.trackGain ? +m.trackGain.gain.value.toFixed(3) : null,
          synthGain: m.musicGain ? +m.musicGain.gain.value.toFixed(3) : null,
          srcLive: !!m._trackSource,
        };
      })()`);
      const theme = manifest.tracks[id].theme;
      const themeOk = theme === CAMPAIGN[i];
      const good = r.active === id && r.hasBuf && r.srcLive && r.trackGain > 0.1 && r.synthGain < 0.02 && themeOk;
      pass &= ok(`stage ${i + 1} '${theme}' (${id}) plays its real loop`, good,
        `active=${r.active} trackGain=${r.trackGain} synthGain=${r.synthGain} src=${r.srcLive} themeMatch=${themeOk}`);
    }

    // Boss phase-2 ENRAGE lifts the REAL track LIVE (shipped build). The last stage's biome
    // loop is active. The main loop drives `audio.setIntensity(!!(world.boss && world.boss.enraged))`
    // EVERY frame, so we can't just call setIntensity directly (it'd be reverted next frame);
    // instead force the boss ENRAGE flag the hook reads, then assert trackGain gets the
    // ×intensityBoost lift, and relaxes when de-enraged. (Grounds the just-synced boost fix live.)
    const enr = await page.evaluate(`(async () => {
      const m = window.__audio.music, w = window.__game;
      if (w.status !== 'playing') w.start();
      const before = +m.trackGain.gain.value.toFixed(3);
      if (w.boss) { w.boss.active = true; w.boss.enraged = true; } else { w.boss = { active: true, enraged: true }; }
      await new Promise((r) => setTimeout(r, 400));       // frame hook → setIntensity(true) held
      const lifted = +m.trackGain.gain.value.toFixed(3);
      const intensity = m._intensity;
      if (w.boss) w.boss.enraged = false;
      await new Promise((r) => setTimeout(r, 400));
      const relaxed = +m.trackGain.gain.value.toFixed(3);
      return { active: m.track, intensity, before, lifted, relaxed };
    })()`);
    pass &= ok('boss ENRAGE lifts the live real track (trackGain → base×boost)',
      enr.active && enr.intensity === true && enr.lifted > 0.24 && enr.relaxed < 0.24 && enr.lifted > enr.relaxed,
      `_intensity=${enr.intensity} before=${enr.before} lifted=${enr.lifted} relaxed=${enr.relaxed} (base×1.22≈0.27)`);

    // return to synth (useTrack(null)) — proves the fallback path still works. Deterministic
    // contract: the real-track source is STOPPED (active===null, srcLive===false) and the
    // synth is re-selected (muted===false). We wait >1 bar (~1.58s @152 BPM) before reading
    // musicGain so the synth scheduler has resumed feeding it — otherwise headless-shell
    // returns a stale value for a momentarily source-less gain node (an inaudible artifact,
    // not a defect). trackGain's numeric value on the now-sourceless bus is not asserted.
    const back = await page.evaluate(`(async () => {
      const m = window.__audio.music; window.__audio.useTrack(null);
      await new Promise((res) => setTimeout(res, 1900)); // let the synth scheduler resume a bar
      return { active: m.track, srcLive: !!m._trackSource, muted: m.muted, synthGain: +m.musicGain.gain.value.toFixed(3) };
    })()`);
    pass &= ok('useTrack(null) returns to the procedural synth fallback',
      back.active === null && back.srcLive === false && back.muted === false && back.synthGain > 0.1,
      `active=${back.active} src=${back.srcLive} muted=${back.muted} synthGain=${back.synthGain}`);

    await page.close();
  } catch (e) {
    console.error('CHECK ERROR:', e.message);
    pass = false;
  } finally {
    await browser.close();
    server.kill('SIGKILL');
  }

  console.log(`\n${pass ? 'ALL PASS' : 'FAIL'} — campaign real-track live check\n`);
  process.exit(pass ? 0 : 1);
})();
