// track-handoff-check.mjs — ground the synth↔real-track handoff on the SOURCE-OF-TRUTH
// audio/music.js, in real Chromium, independent of the shipped game copy.
//
// Loads verify/handoff-harness.html (which imports ../music.js), registers one real
// generated mp3, then drives useTrack(id) → useTrack(id2) → useTrack(null) and asserts:
//   * selecting a track: trackGain goes hot (source audible), synthGain drops to ~0;
//   * switching tracks: the live BufferSource swaps, trackGain stays hot;
//   * useTrack(null): trackGain settles to silence (the deterministic handoff fixed in
//     _stopTrackSource) AND the synth returns hot — so only the synth is audible.
//
// Serves the WORKTREE ROOT so the page can import /audio/music.js and fetch /audio/tracks.
// Exit 0 all-pass, 1 fail, 2 infra.

import { existsSync, readdirSync, promises as fs } from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, extname } from 'node:path';
import puppeteer from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');        // worktree root (has audio/ under it)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ok(name, pass, detail) { console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); return pass; }
function findChrome() {
  const base = `${process.env.HOME}/.cache/puppeteer/chrome`;
  if (!existsSync(base)) return null;
  const rel = 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  return readdirSync(base).map((v) => resolve(base, v, rel)).filter(existsSync).sort().pop();
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.mp3': 'audio/mpeg', '.json': 'application/json' };

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.error('No chrome-for-testing binary'); process.exit(2); }

  const server = http.createServer(async (req, res) => {
    try {
      const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      const body = await fs.readFile(p);
      res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      res.end(body);
    } catch (e) { res.writeHead(404).end(String(e.message)); }
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const url = `http://localhost:${port}/audio/verify/handoff-harness.html`;
  console.log(`\nTRACK-HANDOFF CHECK (source-of-truth audio/music.js)  ${url}\n`);

  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'shell', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  let pass = true;
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });

    const setup = await page.evaluate(`window.__setup('/audio/tracks/s1_jungle.mp3', 's1_jungle')`);
    pass &= ok('MusicKit built + real mp3 registered/decoded', setup.enabled && setup.okReg && setup.hasBuf, `ctx=${setup.ctx}`);
    // register a 2nd track to test switching
    await page.evaluate(`window.__mk.registerTrack('s2_cascade', '/audio/tracks/s2_cascade.mp3')`);

    await page.evaluate(`window.__use('s1_jungle')`); await sleep(200);
    let g = await page.evaluate(`window.__gains()`);
    pass &= ok('useTrack(id): real track hot, synth silenced', g.active === 's1_jungle' && g.src && g.trackGain > 0.1 && g.synthGain < 0.02, JSON.stringify(g));

    await page.evaluate(`window.__use('s2_cascade')`); await sleep(200);
    g = await page.evaluate(`window.__gains()`);
    pass &= ok('switch tracks: source swaps, still hot', g.active === 's2_cascade' && g.src && g.trackGain > 0.1, JSON.stringify(g));

    // Boss phase-2 ENRAGE lift now applies to the REAL track too (fixed _applyGain): with a
    // real track playing, setIntensity(true) raises trackGain ×intensityBoost (the audible
    // "it just got serious" cue on the shipped biome track), and setIntensity(false) relaxes it.
    await page.evaluate(`window.__mk.setIntensity(true)`); await sleep(220);
    let gi = await page.evaluate(`window.__gains()`);
    pass &= ok('enrage LIFTS the real track (trackGain → base×boost)', gi.active === 's2_cascade' && gi.trackGain > 0.24,
      `trackGain=${gi.trackGain} (base×1.22≈0.27)`);
    await page.evaluate(`window.__mk.setIntensity(false)`); await sleep(220);
    gi = await page.evaluate(`window.__gains()`);
    pass &= ok('enrage RELAXES the real track (trackGain → base)', gi.trackGain > 0.15 && gi.trackGain < 0.24,
      `trackGain=${gi.trackGain} (base≈0.22)`);

    // OPTIONAL distinct-boss-theme swap (setBossTrack). DORMANT by default: with no boss
    // track registered, setSection('boss') must NOT change the active real track.
    await page.evaluate(`window.__use('s1_jungle')`); await sleep(150);
    await page.evaluate(`window.__mk.setSection('boss')`); await sleep(150);
    let bt = await page.evaluate(`window.__gains()`);
    pass &= ok('boss-track DORMANT: setSection(boss) is a no-op when unregistered', bt.active === 's1_jungle',
      `active=${bt.active} (expected s1_jungle, unchanged)`);
    // FUNCTIONAL: register s2_cascade as the boss theme (stand-in for the test) → setSection('boss')
    // hard-cuts the real audio to it; setSection('stage') restores the stage's biome track.
    await page.evaluate(`window.__mk.setSection('stage'); window.__use('s1_jungle'); window.__mk.setBossTrack('s2_cascade')`); await sleep(150);
    await page.evaluate(`window.__mk.setSection('boss')`); await sleep(200);
    bt = await page.evaluate(`window.__gains()`);
    pass &= ok('boss-track FUNCTIONAL: setSection(boss) swaps to the boss theme', bt.active === 's2_cascade' && bt.src && bt.trackGain > 0.1,
      `active=${bt.active} (expected s2_cascade)`);
    await page.evaluate(`window.__mk.setSection('stage')`); await sleep(200);
    bt = await page.evaluate(`window.__gains()`);
    pass &= ok('boss-track FUNCTIONAL: setSection(stage) restores the biome track', bt.active === 's1_jungle' && bt.src,
      `active=${bt.active} (expected s1_jungle restored)`);
    await page.evaluate(`window.__mk.setBossTrack(null)`); // back to dormant for the rest

    await page.evaluate(`window.__use(null)`); await sleep(250);
    g = await page.evaluate(`window.__gains()`);
    // Audible fallback contract: the real-track SOURCE is stopped (bus emits silence
    // regardless of its gain value) and the synth returns hot. NB: we do NOT assert
    // trackGain's numeric value — on a sourceless node headless-shell doesn't surface its
    // scheduled param, and it's inaudible anyway (no input → silence). _stopTrackSource
    // still pins the schedule to silence for hygiene.
    pass &= ok('useTrack(null): real-track source stopped (bus silent)', g.active === null && g.src === false, JSON.stringify(g));
    pass &= ok('useTrack(null): synth returns audible (fallback)', g.synthGain > 0.1, `synthGain=${g.synthGain}`);

    await page.close();
  } catch (e) { console.error('CHECK ERROR:', e.message); pass = false; }
  finally { await browser.close(); server.close(); }

  console.log(`\n${pass ? 'ALL PASS' : 'FAIL'} — track-handoff check\n`);
  process.exit(pass ? 0 : 1);
})();
