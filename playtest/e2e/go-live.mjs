#!/usr/bin/env node
// go-live.mjs — GROUND the "reachable by a real player" claim against the ACTUAL
// shipped entrypoint, not my test scaffold. Every other harness here serves the
// build through playtest's own `serveGame`; this one instead launches the
// committed GO-LIVE server (`game/serve.mjs`, i.e. `npm start` / `node serve.mjs
// <port>`) as a subprocess exactly as the README tells a player to, parses the
// REAL bound URL from its stdout (it auto-increments if the port is busy), and
// drives that URL in headless Chrome to prove the game boots and is playable.
//
//   node playtest/e2e/go-live.mjs
//
// Exits non-zero if the shipped entrypoint fails to serve a booting game — a
// hard grounding gate for strategy task_obs_not_actually_live ("not actually
// live"). Evidence: playtest/frames/live/go-live-boot.png + go-live.json.

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome, loadPuppeteer, sleep } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.resolve(HERE, '..', '..', 'game');
const OUT = path.resolve(HERE, '..', 'frames', 'live');
const PORT = 8137; // uncommon; serve.mjs auto-increments if busy — we parse the real one

const results = [];
function assert(id, ok, detail) {
  results.push({ id, ok: !!ok, detail: String(detail) });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  —  ${detail}`);
}

// Launch the committed entrypoint the player's way and resolve its real URL.
function startShippedServer() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['serve.mjs', String(PORT)], { cwd: GAME_DIR });
    let out = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`serve.mjs did not report a URL within 10s. stdout:\n${out}`));
    }, 10000);
    const onData = (buf) => {
      out += buf.toString();
      const m = out.match(/http:\/\/localhost:(\d+)\//);
      if (m) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        resolve({ child, url: `http://localhost:${m[1]}`, banner: out.trim() });
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (b) => { out += b.toString(); });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('exit', (code) => {
      if (code !== null && code !== 0) { clearTimeout(timer); reject(new Error(`serve.mjs exited early code=${code}\n${out}`)); }
    });
  });
}

async function main() {
  await mkdir(OUT, { recursive: true });
  let srv = null;
  let browser = null;
  const evidence = { when: new Date().toISOString?.() || null, entrypoint: 'game/serve.mjs (npm start)' };
  try {
    // 1) The shipped server actually binds and advertises a URL.
    srv = await startShippedServer();
    evidence.url = srv.url;
    assert('golive.serverBinds', /^http:\/\/localhost:\d+$/.test(srv.url), `shipped serve.mjs → ${srv.url}`);

    // 2) A real browser can load the served root and the ES-module app runs.
    const puppeteer = loadPuppeteer();
    browser = await puppeteer.launch({
      executablePath: findChrome(), headless: 'new',
      args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
      defaultViewport: { width: 960, height: 540 },
    });
    const page = await browser.newPage();
    const pageErrors = [];
    const badResponses = []; // {url,status} for any 4xx/5xx — carries the URL (console text does not)
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    page.on('requestfailed', (r) => pageErrors.push(`requestfailed ${r.url()} ${r.failure()?.errorText}`));
    page.on('response', (r) => { if (r.status() >= 400) badResponses.push({ url: r.url(), status: r.status() }); });

    // Hit the bare root (what a player types) — serve.mjs must map "/" → index.html.
    const resp = await page.goto(`${srv.url}/`, { waitUntil: 'networkidle2', timeout: 30000 });
    assert('golive.rootServes200', !!resp && resp.status() === 200, `GET ${srv.url}/ → ${resp && resp.status()}`);

    // 3) The ES-module game actually booted (world exists) — proves correct MIME
    //    types (wrong MIME would block the module graph and __game would be absent).
    await page.waitForFunction(() => !!window.__game, { timeout: 15000 }).catch(() => {});
    const boot = await page.evaluate(() => {
      const w = window.__game;
      return w ? { status: w.status, mode: w.modeKey, hasPlayer: !!w.player } : null;
    });
    assert('golive.gameBoots', !!boot && boot.hasPlayer, `window.__game present: ${JSON.stringify(boot)}`);

    // 4) A real player lands on the arcade TITLE screen (the documented entry).
    assert('golive.landsOnTitle', !!boot && boot.status === 'title',
      `status='${boot && boot.status}' (README: opens on title screen)`);

    // 5) Real art loaded through the shipped server (no missing sprites).
    const missing = await page.evaluate(() => (window.__assets ? window.__assets.missing : ['no-assetstore']));
    assert('golive.spritesLoaded', Array.isArray(missing) && missing.length === 0, `missing=${JSON.stringify(missing)}`);

    // 6) No real errors on the ship path. favicon.ico is the browser's own auto-
    //    request that a static file server legitimately doesn't have — not a game
    //    asset — so it's filtered by URL (verified: only /favicon.ico 404s).
    const real4xx = badResponses.filter((r) => !/\/favicon\.ico$/i.test(r.url));
    const realErrors = pageErrors.concat(real4xx.map((r) => `${r.status} ${r.url}`));
    assert('golive.noErrors', realErrors.length === 0,
      `real errors=${JSON.stringify(realErrors)} (favicon.ico 404 excluded as benign)`);

    // Evidence frame from the shipped server.
    const dataUrl = await page.evaluate(() => {
      const c = document.getElementById('game');
      return c ? c.toDataURL('image/png') : null;
    });
    if (dataUrl) {
      await writeFile(path.join(OUT, 'go-live-boot.png'),
        Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'));
    }
    evidence.realErrors = realErrors;
    evidence.allBadResponses = badResponses; // incl. benign favicon, for transparency
    evidence.boot = boot;
  } finally {
    evidence.results = results;
    evidence.passed = results.filter((r) => r.ok).length;
    evidence.failed = results.filter((r) => !r.ok).length;
    await writeFile(path.join(OUT, 'go-live.json'), JSON.stringify(evidence, null, 2));
    if (browser) await browser.close();
    if (srv && srv.child) srv.child.kill('SIGTERM');
    const { passed = 0, failed = results.length } = evidence;
    console.log(`\n=== GO-LIVE: ${passed} passed, ${failed} failed (shipped entrypoint: game/serve.mjs) ===`);
    console.log(`evidence -> ${OUT}/go-live.json + go-live-boot.png`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

main().catch((e) => { console.error('GO-LIVE HARNESS ERROR:', e); process.exit(2); });
