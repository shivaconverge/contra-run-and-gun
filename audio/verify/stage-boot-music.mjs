// stage-boot-music.mjs — prove the REAL campaign path selects the right biome track
// for EACH of the 7 stages, in the shipped build.
//
// campaign-tracks-live.mjs drives audio.useTrack(id) directly (simulating one stage
// change). This instead boots the actual game at `?level=N` for N=1..7 — which runs
// main.js's real stage-setup (`world.onStageChange(stageIndex)` at main.js:94, the SAME
// hook wireCampaignMusic installs) — and asserts that on each stage the live engine ends
// up playing THAT stage's biome loop (music.track === the Nth manifest id, and its theme
// matches config.js STAGES order). This grounds the end-to-end "stage N ⇒ biome N music"
// contract through the real progression wiring, not a manual selector call.
//
// Exit 0 all-pass, 1 fail, 2 infra.

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
  console.log(`\nPER-STAGE BOOT MUSIC CHECK  (served at ${url})\n`);

  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'shell', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  let pass = true;
  const page = await browser.newPage(); // reuse ONE page across stages (less connection churn)
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
  try {
    for (let n = 1; n <= ids.length; n++) {
      const expectId = ids[n - 1];
      const trackTheme = (manifest.tracks[expectId] || {}).theme; // biome this track is FOR
      await page.goto(`${url}/?level=${n}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForFunction('window.__booted === true && window.__audio && window.__audio.music', { timeout: 15000 });
      await page.focus('body').catch(() => {});
      await page.keyboard.press('Space');
      await page.evaluate('window.__audio && window.__audio.resume()');

      // wait until the REAL onStageChange path has selected this stage's decoded track
      let got = null;
      for (let i = 0; i < 60; i++) { // up to ~15s (decode + selection; cold-start margin)
        got = await page.evaluate(`(() => {
          const m = window.__audio.music, w = window.__game;
          // world.level.theme = the theme of the stage the campaign ACTUALLY loaded for ?level=N
          // (config.js STAGES[N-1].theme, resolved live) — the ground truth to match against.
          return { track: m.track, hasBuf: m.hasTrack(${JSON.stringify(expectId)}), src: !!m._trackSource,
                   stageNum: w && w.stageNum, loadedTheme: w && w.level && w.level.theme };
        })()`);
        if (got.track === expectId && got.src) break;
        await sleep(250);
      }
      // THE contract: the biome the campaign loaded for this stage (got.loadedTheme, live from
      // config.js) must equal the biome the selected track is for (trackTheme, from the manifest).
      // A tautology-free, drift-catching check — if the campaign reorders/renames stages, the
      // selected track's theme stops matching the loaded stage's theme and this FAILS.
      const themeMatch = got.loadedTheme === trackTheme;
      const good = got.track === expectId && got.hasBuf && got.src && themeMatch;
      pass &= ok(`?level=${n} → loaded biome '${got.loadedTheme}' plays ${expectId} (theme '${trackTheme}')`, good,
        `music.track=${got.track} src=${got.src} loadedTheme=${got.loadedTheme} trackTheme=${trackTheme} themeMatch=${themeMatch}`);
    }
  } catch (e) {
    console.error('CHECK ERROR:', e.message);
    pass = false;
  } finally {
    await browser.close();
    server.kill('SIGKILL');
  }

  console.log(`\n${pass ? 'ALL PASS' : 'FAIL'} — per-stage boot music check (${ids.length} stages)\n`);
  process.exit(pass ? 0 : 1);
})();
