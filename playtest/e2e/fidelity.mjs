#!/usr/bin/env node
// fidelity.mjs — build a REPEATABLE side-by-side fidelity comparison of our live
// captured frames against the competitor reference corpus, so the fidelity
// "looking frame" can be judged multimodally each cycle instead of by prose alone.
//
//   node playtest/e2e/fidelity.mjs
//
// For each pair it composes a real contact-sheet PNG (OURS | REFERENCE, same
// height, retro-crisp) into playtest/frames/fidelity/, and computes ADVISORY CV
// pre-filter metrics (palette richness / ink coverage / edge-density busyness).
//
// IMPORTANT: the metrics are an ADVISORY PRE-FILTER, NEVER the verdict. The
// fidelity verdict is a human/multimodal READ of the contact sheets, recorded in
// playtest/REPORT.md. This harness only makes that read fast and repeatable.

import { mkdir, writeFile, rm, access } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveGame, findChrome, loadPuppeteer, sleep } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const OUT = path.resolve(HERE, '..', 'frames', 'fidelity');

// Pairs: an OURS live/reference frame vs the closest-context competitor frame.
// Paths are repo-root-relative (served same-origin). Judge like-for-like beats
// (gameplay firefight vs gameplay firefight; boss vs boss).
const PAIRS = [
  {
    id: 'firefight-vs-blazing-chrome',
    // BUSY firefight beat (peak on-screen enemies + bullets + explosion),
    // captured fresh below — NOT the calm 2-enemy spawn beat, which unfairly
    // compared a lull against a competitor's peak action (FIDHARNESS-1 PARTIAL).
    ours: 'playtest/frames/fidelity/ours-firefight-busy.png',
    oursLabel: 'firefight peak beat (live sim)',
    ref: 'reference/frames/blazing-chrome-2019/motion/firefight-explosion-dashring-~85s.png',
    refLabel: 'Blazing Chrome — firefight',
  },
  {
    id: 'firefight-vs-huntdown',
    ours: 'playtest/frames/fidelity/ours-firefight-busy.png',
    oursLabel: 'firefight peak beat (live sim)',
    ref: 'reference/frames/huntdown-2020/motion/dense-interior-firefight-~40s.png',
    refLabel: 'Huntdown — dense interior firefight',
  },
  {
    id: 'boss-vs-blazing-chrome',
    // MID-FIGHT boss frame (boss present + HP bar), captured fresh below — NOT the
    // post-victory STAGE CLEAR screen, which was an unfair pairing (closed issue).
    ours: 'playtest/frames/fidelity/ours-boss-midfight.png',
    oursLabel: 'boss mid-fight (live sim)',
    ref: 'reference/frames/blazing-chrome-2019/motion/boss-composition-~65s.png',
    refLabel: 'Blazing Chrome — boss composition',
  },
  // The GOAL's DIRECT browser rivals: itch.io/CrazyGames HTML5 run-and-guns — the
  // games a player would actually pick INSTEAD of ours. Console-tier refs above are
  // a HIGHER bar; these are the literal "prefer over web Contra-likes" comparison.
  {
    id: 'firefight-vs-gunnrun-web',
    ours: 'playtest/frames/fidelity/ours-firefight-busy.png',
    oursLabel: 'firefight peak beat (live sim)',
    ref: 'reference/frames/web-html5-competitive-set/gun-n-run/firefight-muzzle.png',
    refLabel: "GUN N' RUN (itch HTML5) — firefight",
  },
  {
    id: 'duel-vs-gunnrun-web',
    ours: 'playtest/frames/fidelity/ours-firefight-busy.png',
    oursLabel: 'firefight peak beat (live sim)',
    ref: 'reference/frames/web-html5-competitive-set/gun-n-run/duel-laser.png',
    refLabel: "GUN N' RUN (itch HTML5) — duel",
  },
];

// Drive the build's OWN boss-arena scenario to a MID-FIGHT frame (boss alive,
// HP bar raised) and capture the real rendered canvas. Probed live: the boss is
// engaged with status='playing' & enemiesAlive=1 through ~frame 350 and dies by
// ~450, so frames=300 lands squarely mid-fight — the fair composition to judge
// our boss look against a competitor's. (Re-probe if boss HP/tuning changes.)
async function captureBossMidfight(browser, srvUrl, outDir) {
  const page = await browser.newPage();
  try {
    await page.goto(`${srvUrl}/game/index.html?headless=1&scenario=boss&frames=300&seed=1234`,
      { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('#headless-done', { timeout: 20000 }).catch(() => {});
    const bench = await page.evaluate(() => window.__bench || null);
    const dataUrl = await page.evaluate(() => {
      const c = document.getElementById('game');
      return c ? c.toDataURL('image/png') : null;
    });
    if (dataUrl) {
      await writeFile(path.join(outDir, 'ours-boss-midfight.png'),
        Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    }
    // Boss scenario filters the world to only the boss, so enemiesAlive>=1 while
    // status==='playing' proves the boss is present and the fight is ongoing.
    const bossPresent = !!bench && bench.status === 'playing' && bench.enemiesAlive >= 1;
    return { captured: !!dataUrl, bossPresent, bench };
  } finally {
    await page.close();
  }
}

// Drive the build's OWN showcase scenario to a BUSY firefight beat and capture it.
// Probed live: frame 300 lands on a peak — onScreenEnemies=4, bullets~10,
// particles~19, an active explosion (fx=1). This is the FAIR beat to judge our
// firefight look against a competitor's peak-action frame (fixes the calm-beat
// unfairness the reference loop flagged as FIDHARNESS-1). Re-probe if tuning shifts.
async function captureFirefight(browser, srvUrl, outDir) {
  const page = await browser.newPage();
  try {
    await page.goto(`${srvUrl}/game/index.html?headless=1&frames=300&seed=1234`,
      { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector('#headless-done', { timeout: 20000 }).catch(() => {});
    const bench = await page.evaluate(() => window.__bench || null);
    const dataUrl = await page.evaluate(() => {
      const c = document.getElementById('game');
      return c ? c.toDataURL('image/png') : null;
    });
    if (dataUrl) {
      await writeFile(path.join(outDir, 'ours-firefight-busy.png'),
        Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    }
    // A FAIR firefight beat = real action on screen: multiple enemies AND either a
    // live explosion (fx>0) or a dense particle field. These are facts off __bench.
    const busy = !!bench && bench.onScreenEnemies >= 3 && (bench.fx >= 1 || bench.particles >= 10);
    return { captured: !!dataUrl, busy, bench };
  } finally {
    await page.close();
  }
}

// Runs IN THE PAGE: load both images same-origin, compute advisory metrics on
// the natural-size pixels, and compose a labelled side-by-side contact sheet.
async function compose(page, pair, base) {
  return page.evaluate(async ({ ours, ref, oursLabel, refLabel, base }) => {
    const load = (src) => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('load failed: ' + src));
      im.src = base + '/' + src;
    });

    // Advisory CV pre-filter metrics — NOT the verdict.
    const measure = (img) => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const { data, width, height } = x.getImageData(0, 0, c.width, c.height);
      const n = width * height;
      // quantize to 16 levels/channel to fold anti-alias noise into buckets
      const counts = new Map();
      for (let i = 0; i < data.length; i += 4) {
        const k = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      let bgCount = 0;
      for (const v of counts.values()) if (v > bgCount) bgCount = v;
      const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      let edges = 0;
      for (let y = 0; y < height; y++) {
        for (let xx = 0; xx < width - 1; xx++) {
          const i = (y * width + xx) * 4;
          if (Math.abs(lum(i) - lum(i + 4)) > 24) edges++;
        }
      }
      return {
        w: width, h: height,
        uniqueColors: counts.size,                       // palette richness
        inkFraction: +(1 - bgCount / n).toFixed(3),      // non-background coverage
        edgeDensity: +(edges / (width * height)).toFixed(3), // detail/busyness proxy
      };
    };

    const our = await load(ours);
    const rf = await load(ref);
    const om = measure(our), rm = measure(rf);

    // Contact sheet: normalize both to a common height, retro-crisp, labelled.
    const H = 360;
    const ow = Math.round(our.naturalWidth * H / our.naturalHeight);
    const rw = Math.round(rf.naturalWidth * H / rf.naturalHeight);
    const pad = 8, labelH = 22;
    const cs = document.createElement('canvas');
    cs.width = ow + rw + pad * 3;
    cs.height = H + labelH + pad * 2;
    const g = cs.getContext('2d');
    g.imageSmoothingEnabled = false; // keep our pixel art crisp when upscaled
    g.fillStyle = '#0b0b0f'; g.fillRect(0, 0, cs.width, cs.height);
    g.drawImage(our, pad, labelH + pad, ow, H);
    g.drawImage(rf, ow + pad * 2, labelH + pad, rw, H);
    g.font = '12px monospace'; g.textBaseline = 'top';
    g.fillStyle = '#8ef0ff'; g.fillText('OURS: ' + oursLabel, pad, 5);
    g.fillStyle = '#ffd166'; g.fillText('REF:  ' + refLabel, ow + pad * 2, 5);

    return { sheet: cs.toDataURL('image/png'), our: om, ref: rm };
  }, { ...pair, base });
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const srv = await serveGame(REPO_ROOT);
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
    defaultViewport: { width: 1400, height: 800 },
  });

  // Validity failures are FACTS (is the boss actually present in the frame we
  // compare?), NOT fidelity judgments. A failure here means a pairing is UNFAIR,
  // so the harness must fail loudly rather than silently ship a skewed sheet.
  const failures = [];
  const report = { when: new Date().toISOString?.() || null, base: 'repo-root', ok: true, pairs: [] };
  try {
    // Capture a real mid-fight boss frame FIRST — it's an input to the boss pair.
    const boss = await captureBossMidfight(browser, srv.url, OUT);
    const bossFrameValid = boss.captured && boss.bossPresent;
    report.bossMidfight = { captured: boss.captured, bossPresent: boss.bossPresent, valid: bossFrameValid,
      status: boss.bench && boss.bench.status, enemiesAlive: boss.bench && boss.bench.enemiesAlive,
      frames: boss.bench && boss.bench.frames };
    console.log(`[boss-midfight] captured=${boss.captured} bossPresent=${boss.bossPresent} ` +
      `status=${boss.bench && boss.bench.status} enemiesAlive=${boss.bench && boss.bench.enemiesAlive}`);
    if (!bossFrameValid) {
      // Do NOT work around it: record a hard failure. The sheet is still composed
      // below (as evidence of the bad frame), but the run exits non-zero.
      failures.push(`boss-midfight frame is UNFAIR: bossPresent=${boss.bossPresent} ` +
        `(status=${boss.bench && boss.bench.status}, enemiesAlive=${boss.bench && boss.bench.enemiesAlive}). ` +
        `Boss died before the sampled frame — re-probe the boss-alive window and adjust frames=N in captureBossMidfight.`);
      console.error('FAIL: mid-fight boss frame not confirmed — boss pair marked INVALID.');
    }

    // Capture a BUSY firefight beat — the fair input to the firefight pairs.
    const fire = await captureFirefight(browser, srv.url, OUT);
    const fireFrameValid = fire.captured && fire.busy;
    report.firefight = { captured: fire.captured, busy: fire.busy, valid: fireFrameValid,
      onScreenEnemies: fire.bench && fire.bench.onScreenEnemies, bullets: fire.bench && fire.bench.bullets,
      particles: fire.bench && fire.bench.particles, fx: fire.bench && fire.bench.fx,
      frames: fire.bench && fire.bench.frames };
    console.log(`[firefight] captured=${fire.captured} busy=${fire.busy} ` +
      `onScreen=${fire.bench && fire.bench.onScreenEnemies} particles=${fire.bench && fire.bench.particles} fx=${fire.bench && fire.bench.fx}`);
    if (!fireFrameValid) {
      failures.push(`firefight frame is UNFAIR (calm beat): busy=${fire.busy} ` +
        `(onScreenEnemies=${fire.bench && fire.bench.onScreenEnemies}, fx=${fire.bench && fire.bench.fx}, ` +
        `particles=${fire.bench && fire.bench.particles}). Re-probe the showcase for a peak beat and adjust frames=N in captureFirefight.`);
      console.error('FAIL: busy firefight frame not confirmed — firefight pairs marked INVALID.');
    }

    // Fail loudly if any input frame is missing (run playthrough.mjs first).
    for (const p of PAIRS) {
      for (const rel of [p.ours, p.ref]) {
        await access(path.join(REPO_ROOT, rel)).catch(() => {
          throw new Error(`missing input frame: ${rel} (run playthrough.mjs first)`);
        });
      }
    }

    const page = await browser.newPage();
    const perr = [];
    page.on('pageerror', (e) => perr.push(String(e)));
    await page.goto(`${srv.url}/playtest/e2e/compositor.html`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(150);

    for (const pair of PAIRS) {
      const r = await compose(page, pair, srv.url);
      const file = `${pair.id}.png`;
      await writeFile(path.join(OUT, file),
        Buffer.from(r.sheet.replace(/^data:image\/png;base64,/, ''), 'base64'));
      // Advisory deltas (ref − ours): positive = competitor is richer/busier here.
      const delta = {
        uniqueColors: r.ref.uniqueColors - r.our.uniqueColors,
        inkFraction: +(r.ref.inkFraction - r.our.inkFraction).toFixed(3),
        edgeDensity: +(r.ref.edgeDensity - r.our.edgeDensity).toFixed(3),
      };
      // A pair is VALID unless its inputs are known-unfair: a boss frame without a
      // boss, or a firefight frame that isn't a busy beat. Facts, not judgments.
      let valid = true;
      if (pair.ours.includes('ours-boss-midfight')) valid = bossFrameValid;
      else if (pair.ours.includes('ours-firefight-busy')) valid = fireFrameValid;
      report.pairs.push({ id: pair.id, sheet: file, valid, ours: r.our, ref: r.ref, delta,
        oursLabel: pair.oursLabel, refLabel: pair.refLabel });
      console.log(`[${pair.id}] sheet=${file}`);
      console.log(`   OURS  colors=${r.our.uniqueColors} ink=${r.our.inkFraction} edge=${r.our.edgeDensity}`);
      console.log(`   REF   colors=${r.ref.uniqueColors} ink=${r.ref.inkFraction} edge=${r.ref.edgeDensity}`);
      console.log(`   Δref-ours colors=${delta.uniqueColors} ink=${delta.inkFraction} edge=${delta.edgeDensity}`);
    }
    if (perr.length) failures.push(`page errors during compositing: ${JSON.stringify(perr)}`);
    report.pageErrors = perr;
  } finally {
    report.ok = failures.length === 0;
    report.failures = failures;
    await writeFile(path.join(OUT, 'metrics.json'), JSON.stringify(report, null, 2));
    await browser.close();
    await srv.close();
    const validPairs = report.pairs.filter((p) => p.valid).length;
    console.log(`\n=== FIDELITY: ${report.pairs.length} sheets (${validPairs} valid) -> ${OUT} ===`);
    console.log('ADVISORY metrics only. Verdict = multimodal READ of the sheets in REPORT.md.');
    if (failures.length) {
      console.error(`\nFIDELITY GATE FAILED (${failures.length}):`);
      for (const f of failures) console.error(`  - ${f}`);
      process.exit(1); // an unfair/invalid comparison must not pass silently
    }
  }
}

main().catch((e) => { console.error('FIDELITY HARNESS ERROR:', e); process.exit(2); });
