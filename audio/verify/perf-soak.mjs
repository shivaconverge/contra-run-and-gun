// perf-soak.mjs — production-readiness soak for the audio layer.
//
// The BGM scheduler creates ~37 short WebAudio nodes per bar, forever, via a 25 ms
// look-ahead timer. If those nodes leaked, or the scheduler fell behind / ran away,
// a long session would degrade FPS or stall the music. "Production-ready" (the GOAL)
// means that does NOT happen. This boots the SHIPPED build in real Chromium, runs the
// music transport for a sustained window, and asserts by MEASUREMENT:
//
//   1. FPS floor      : the frame rate stays healthy the whole time (audio never
//                       starves the render loop).
//   2. No degradation : late-window FPS ≈ early-window FPS (no gradual leak/slowdown).
//   3. Scheduler pace : bars advance at the real musical rate (ctx.currentTime based) —
//                       neither stalled (0 new bars) nor runaway (look-ahead loop bug
//                       scheduling far ahead). This is the audio-specific correctness.
//
// It's a SOAK (longer than the other verifiers by design). Exit 0 all-pass, 1 on fail.

import { existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const gameDir = resolve(__dirname, '../../game');
const SOAK_MS = Number(process.env.SOAK_MS || 20000); // total soak window
const STEP_MS = 2000;                                  // sample cadence

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
    const on = (d) => { buf += d.toString(); const m = /localhost:(\d+)/.exec(buf); if (m) res(parseInt(m[1], 10)); };
    proc.stdout.on('data', on); proc.stderr.on('data', on);
    proc.on('exit', (c) => rej(new Error(`server exited early (${c})`)));
    setTimeout(() => rej(new Error('server never announced a port')), 8000);
  });
}
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;

(async () => {
  const chrome = findChrome();
  if (!chrome) { console.error('No chrome-for-testing binary'); process.exit(2); }
  const puppeteer = await loadPuppeteer();
  const server = spawn('node', ['serve.mjs'], { cwd: gameDir });
  let port; try { port = await waitForPort(server); } catch (e) { console.error(e.message); server.kill('SIGKILL'); process.exit(2); }

  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'shell', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  let pass = true;
  try {
    const p = await browser.newPage();
    p.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
    await p.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0', timeout: 15000 });
    await p.waitForFunction('window.__booted === true && window.__audio && window.__game', { timeout: 15000 });
    // start play + music (real user-gesture path)
    await p.keyboard.press('Space');
    await p.evaluate('window.__audio.resume()');
    await p.waitForFunction('window.__audio.music.running === true', { timeout: 4000 }).catch(() => {});

    const t0 = await p.evaluate('+window.__audio.ctx.currentTime');
    const bar0 = await p.evaluate('window.__audio.music._bar');
    const barDur = await p.evaluate('window.__audio.music.barDur');

    console.log(`\nAUDIO PERF-SOAK  (${(SOAK_MS / 1000).toFixed(0)}s sustained music @ served build)\n`);
    const samples = [];
    const n = Math.floor(SOAK_MS / STEP_MS);
    for (let i = 0; i < n; i++) {
      await sleep(STEP_MS);
      const s = await p.evaluate('({ fps: window.__game.__fps, bar: window.__audio.music._bar, t: +window.__audio.ctx.currentTime, running: window.__audio.music.running, heap: (performance.memory ? performance.memory.usedJSHeapSize : 0) })');
      samples.push(s);
      console.log(`  t=${(s.t - t0).toFixed(1)}s  fps=${s.fps}  bars=${s.bar - bar0}  running=${s.running}${s.heap ? `  heap=${(s.heap / 1e6).toFixed(1)}MB` : ''}`);
    }

    const fps = samples.map((s) => s.fps);
    const minFps = Math.min(...fps);
    const third = Math.max(1, Math.floor(fps.length / 3));
    const early = avg(fps.slice(0, third)), late = avg(fps.slice(-third));
    const last = samples[samples.length - 1];
    const elapsed = last.t - t0, barsAdvanced = last.bar - bar0;
    const expectedBars = elapsed / barDur;
    // Heap growth = the most DIRECT leak signal from the per-bar node churn. Compare
    // the early-window vs late-window heap (not single samples — GC timing is noisy).
    const heaps = samples.map((s) => s.heap).filter((h) => h > 0);
    const heapAvailable = heaps.length >= samples.length - 1; // reported on ~every sample
    const earlyHeap = heapAvailable ? avg(samples.slice(0, third).map((s) => s.heap)) : 0;
    const lateHeap = heapAvailable ? avg(samples.slice(-third).map((s) => s.heap)) : 0;
    const heapGrowMB = (lateHeap - earlyHeap) / 1e6;

    console.log('');
    pass &= ok('FPS floor healthy under sustained music', minFps >= 55, `min=${minFps} (>=55)`);
    pass &= ok('no FPS degradation over the soak', late >= early - 3, `early=${early.toFixed(1)} late=${late.toFixed(1)} (late >= early-3)`);
    pass &= ok('music transport stayed running', samples.every((s) => s.running), `running all ${samples.length} samples`);
    // scheduler on-pace: within ~3 bars of the wall clock (start slack + 0.1s look-ahead)
    pass &= ok('scheduler on musical pace (not stalled/runaway)', Math.abs(barsAdvanced - expectedBars) <= 3, `advanced=${barsAdvanced} expected≈${expectedBars.toFixed(1)} (|Δ|<=3)`);
    // Heap-growth GATE (the direct no-leak assertion). Bound: late-window heap must not
    // exceed early-window by >4 MB over the soak — a real per-bar node leak would blow
    // far past this. If performance.memory is unavailable, this is reported UNAVAILABLE
    // (not silently passed) so the leak claim is never faked.
    if (heapAvailable) {
      pass &= ok('no heap growth over the soak (direct no-leak gate)', heapGrowMB <= 4, `early=${(earlyHeap / 1e6).toFixed(1)}MB late=${(lateHeap / 1e6).toFixed(1)}MB Δ=${heapGrowMB >= 0 ? '+' : ''}${heapGrowMB.toFixed(2)}MB (<=+4MB)`);
    } else {
      console.log('  UNAVAILABLE  no heap growth gate — performance.memory not exposed by this browser (FPS-degradation gate still covers leaks indirectly)');
    }

    console.log('');
    console.log(JSON.stringify({ minFps, early: +early.toFixed(1), late: +late.toFixed(1), barsAdvanced, expectedBars: +expectedBars.toFixed(1), heapGrowMB: heapAvailable ? +heapGrowMB.toFixed(2) : null, verdict: pass ? 'PASS' : 'FAIL' }));
    await p.close();
  } catch (e) {
    console.error('perf-soak error:', e.message); pass = false;
  } finally {
    await browser.close();
    server.kill('SIGKILL');
  }
  process.exit(pass ? 0 : 1);
})();
