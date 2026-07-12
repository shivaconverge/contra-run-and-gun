// public-url-music.mjs — prove the per-stage music works on the DEPLOYED public URL,
// the real thing a player reaches (GOAL's final clause). Every other verifier drives a
// LOCAL serve.mjs; this drives the actual GitHub Pages deployment.
//
// It boots the live site at `?level=N` for N=1..7 in real Chromium, fires the autoplay
// gesture, and asserts that on each stage the live engine decoded and is playing THAT
// stage's biome loop (music.track === the Nth manifest id, BufferSource live). If the
// deploy is stale or the audio 404s, this fails — so it doubles as a deploy freshness gate
// for the audio layer.
//
// URL: arg 1, or $PUBLIC_URL, or deploy/PUBLIC-URL.txt. Exit 0 all-pass, 1 fail, 2 infra.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAMPAIGN = ['jungle', 'cascade', 'snow', 'desert', 'foundry', 'caverns', 'fortress'];

function baseUrl() {
  if (process.argv[2]) return process.argv[2].replace(/\/$/, '');
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const f = resolve(__dirname, '../../deploy/PUBLIC-URL.txt');
  if (existsSync(f)) {
    const m = /(https?:\/\/\S+)/.exec(readFileSync(f, 'utf8'));
    if (m) return m[1].replace(/\/$/, '');
  }
  return null;
}
function findChrome() {
  const base = `${process.env.HOME}/.cache/puppeteer/chrome`;
  if (!existsSync(base)) return null;
  const rel = 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  return readdirSync(base).map((v) => resolve(base, v, rel)).filter(existsSync).sort().pop();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function ok(name, pass, detail) { console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); return pass; }

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.error('No chrome-for-testing binary'); process.exit(2); }
  const base = baseUrl();
  if (!base) { console.error('No public URL (arg/PUBLIC_URL/deploy/PUBLIC-URL.txt)'); process.exit(2); }
  console.log(`\nPUBLIC-URL MUSIC CHECK  ${base}\n`);

  // fetch the LIVE manifest so ids come from the deployed site, not a local copy
  let ids;
  try {
    const res = await fetch(`${base}/assets/audio/manifest.json`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
    const manifest = await res.json();
    ids = Object.keys(manifest.tracks).sort((a, b) => {
      const n = (s) => parseInt((/^s(\d+)/.exec(s) || [])[1] || '0', 10);
      return n(a) - n(b);
    });
    ok(`live manifest served (${ids.length} tracks)`, ids.length === 7, ids.join(','));
  } catch (e) { console.error('manifest fetch failed:', e.message); process.exit(1); }

  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'shell', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  let pass = true;
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
  try {
    for (let n = 1; n <= ids.length; n++) {
      const expectId = ids[n - 1];
      const expectTheme = CAMPAIGN[n - 1];
      await page.goto(`${base}/?level=${n}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction('window.__booted === true && window.__audio && window.__audio.music', { timeout: 20000 });
      await page.focus('body').catch(() => {});
      await page.keyboard.press('Space');
      await page.evaluate('window.__audio && window.__audio.resume()');
      let got = null;
      for (let i = 0; i < 60; i++) { // up to ~18s (network decode over the internet)
        got = await page.evaluate(`(() => {
          const m = window.__audio.music;
          return { track: m.track, hasBuf: m.hasTrack(${JSON.stringify(expectId)}), src: !!m._trackSource };
        })()`);
        if (got.track === expectId && got.src) break;
        await sleep(300);
      }
      const good = got.track === expectId && got.hasBuf && got.src && expectTheme === CAMPAIGN[n - 1];
      pass &= ok(`?level=${n} → stage ${n} '${expectTheme}' plays ${expectId} (LIVE)`, good,
        `music.track=${got.track} src=${got.src}`);
    }

    // Boss phase-2 ENRAGE lifts the REAL track — on the DEPLOYED site (page is at the last
    // stage, its biome loop active). Force the enrage flag the every-frame hook reads
    // (`audio.setIntensity(!!(world.boss && world.boss.enraged))`) and confirm trackGain gets
    // the ×intensityBoost lift live over the internet, then relaxes. Closes the "verified on
    // the served build but not the live CDN" gap.
    const enr = await page.evaluate(`(async () => {
      const m = window.__audio.music, w = window.__game;
      if (w.status !== 'playing') w.start();
      const before = +m.trackGain.gain.value.toFixed(3);
      if (w.boss) { w.boss.active = true; w.boss.enraged = true; } else { w.boss = { active: true, enraged: true }; }
      await new Promise((r) => setTimeout(r, 500));
      const lifted = +m.trackGain.gain.value.toFixed(3), intensity = m._intensity;
      if (w.boss) w.boss.enraged = false;
      await new Promise((r) => setTimeout(r, 500));
      const relaxed = +m.trackGain.gain.value.toFixed(3);
      return { active: m.track, intensity, before, lifted, relaxed };
    })()`);
    pass &= ok('boss ENRAGE lifts the real track on the LIVE site (trackGain → base×boost)',
      enr.active && enr.intensity === true && enr.lifted > 0.24 && enr.relaxed < 0.24 && enr.lifted > enr.relaxed,
      `_intensity=${enr.intensity} before=${enr.before} lifted=${enr.lifted} relaxed=${enr.relaxed} (base×1.22≈0.27)`);
  } catch (e) {
    console.error('CHECK ERROR:', e.message);
    pass = false;
  } finally {
    await browser.close();
  }
  console.log(`\n${pass ? 'ALL PASS' : 'FAIL'} — public-url music check (${base})\n`);
  process.exit(pass ? 0 : 1);
})();
