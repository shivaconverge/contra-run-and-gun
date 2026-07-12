#!/usr/bin/env node
// music-memory.mjs — measure the TRUE resident memory cost of the campaign's
// audio. The 7 per-stage tracks are fetched AND decoded eagerly at boot
// (main.js → audio.loadTracks). Decoded audio lives as float32 PCM AudioBuffers
// in the browser's NATIVE audio memory — invisible to performance.memory / the
// JS heap — so a JS-heap probe under-reports the real footprint. Here we decode
// every track in a real (Offline)AudioContext and sum the exact PCM bytes.
//
//   node playtest/perf/music-memory.mjs [--url <live>]
//
// FACT: decodedBytes = Σ (buffer.length × numberOfChannels × 4) — the actual
// resident size of each AudioBuffer. This is what the 480x270 tab pays in RAM.
//
// Output: playtest/perf/results/music-memory.json + console table.

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPuppeteer, findChrome, liveUrl, fmtBytes, BUDGET } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, 'results');
const i = process.argv.indexOf('--url');
const URL = (i >= 0 && process.argv[i + 1]) ? process.argv[i + 1] : liveUrl();

async function main() {
  await mkdir(OUT, { recursive: true });
  const puppeteer = loadPuppeteer();
  const browser = await puppeteer.launch({
    executablePath: findChrome(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  // Load the live page so relative asset URLs + the manifest resolve exactly as
  // the game resolves them (basename under assets/audio/, per main.js).
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const result = await page.evaluate(async () => {
    // Reproduce the game's own URL resolution: manifest → basename under audio/.
    const man = await fetch('assets/audio/manifest.json').then((r) => r.json());
    const ids = Object.keys(man.tracks).sort();
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const tracks = [];
    let totalMp3 = 0, totalPcm = 0, totalSeconds = 0;
    for (const id of ids) {
      const file = (man.tracks[id].file || `${id}.mp3`).split('/').pop();
      const url = `assets/audio/${file}`;
      try {
        const buf = await fetch(url).then((r) => r.arrayBuffer());
        const mp3Bytes = buf.byteLength;
        // Short-lived context just to decode; length param must be >=1.
        const ctx = new AC(1, 1, 44100);
        const audio = await ctx.decodeAudioData(buf.slice(0));
        const pcmBytes = audio.length * audio.numberOfChannels * 4; // float32
        tracks.push({
          id, file, mp3Bytes, pcmBytes,
          seconds: +audio.duration.toFixed(1),
          sampleRate: audio.sampleRate,
          channels: audio.numberOfChannels,
        });
        totalMp3 += mp3Bytes; totalPcm += pcmBytes; totalSeconds += audio.duration;
      } catch (e) {
        tracks.push({ id, file, error: String(e) });
      }
    }
    return { tracks, totalMp3, totalPcm, totalSeconds: +totalSeconds.toFixed(1) };
  });

  await browser.close();

  const decodedMB = result.totalPcm / (1024 * 1024);
  const perTrackMB = result.tracks.length ? decodedMB / result.tracks.length : 0;
  const checks = [];
  checks.push({
    id: 'audio.decoded-ram-ceiling', severity: 'hard',
    pass: decodedMB <= BUDGET.maxDecodedAudioMB,
    detail: `all-7-tracks resident decoded PCM ${fmtBytes(result.totalPcm)} vs ceiling ${BUDGET.maxDecodedAudioMB}MB`,
  });
  checks.push({
    id: 'audio.decoded-ram-warn', severity: 'warn',
    pass: decodedMB <= BUDGET.warnDecodedAudioMB,
    detail: `decoded PCM ${fmtBytes(result.totalPcm)} vs warn ${BUDGET.warnDecodedAudioMB}MB`,
  });
  const perStageWouldFit = perTrackMB <= BUDGET.warnDecodedAudioMB;
  const hardFails = checks.filter((c) => c.severity === 'hard' && !c.pass);

  const report = {
    generatedAt: new Date().toISOString(),
    url: URL,
    trackCount: result.tracks.length,
    totalMp3Bytes: result.totalMp3,
    totalMp3Human: fmtBytes(result.totalMp3),
    totalDecodedPcmBytes: result.totalPcm,
    totalDecodedPcmHuman: fmtBytes(result.totalPcm),
    perTrackAvgDecodedHuman: fmtBytes(result.totalPcm / (result.tracks.length || 1)),
    lazyLoadWouldFitBudget: perStageWouldFit,
    totalSeconds: result.totalSeconds,
    decodeExpansionRatio: result.totalMp3 ? +(result.totalPcm / result.totalMp3).toFixed(1) : null,
    checks,
    verdict: hardFails.length === 0 ? 'PASS' : 'FAIL',
    tracks: result.tracks.map((t) => ({
      ...t,
      mp3Human: t.mp3Bytes != null ? fmtBytes(t.mp3Bytes) : null,
      pcmHuman: t.pcmBytes != null ? fmtBytes(t.pcmBytes) : null,
    })),
  };
  await writeFile(path.join(OUT, 'music-memory.json'), JSON.stringify(report, null, 2));

  console.log(`\nMUSIC DECODED-MEMORY (live) — ${result.tracks.length} tracks`);
  console.log('─'.repeat(70));
  console.log('  track            seconds   mp3        decoded PCM (resident)');
  for (const t of report.tracks) {
    if (t.error) { console.log(`  ${t.id.padEnd(14)} ERROR ${t.error}`); continue; }
    console.log(`  ${t.id.padEnd(14)} ${String(t.seconds).padStart(6)}s  ${t.mp3Human.padStart(9)}  ${t.pcmHuman.padStart(10)}  (${t.channels}ch @ ${t.sampleRate}Hz)`);
  }
  console.log('─'.repeat(70));
  console.log(`  TOTAL mp3 (download):        ${report.totalMp3Human}`);
  console.log(`  TOTAL decoded PCM (RAM):     ${report.totalDecodedPcmHuman}   (${report.decodeExpansionRatio}× the mp3)`);
  console.log(`  All 7 decoded eagerly at boot → resident in the 480×270 tab from stage 1.`);
  console.log(`  Deferring to 1 track per stage would hold ~${fmtBytes(report.totalDecodedPcmBytes / report.trackCount)} instead.`);
  console.log('─'.repeat(70));
  for (const c of report.checks) {
    const tag = c.pass ? 'PASS' : (c.severity === 'hard' ? 'FAIL' : 'WARN');
    console.log(`  ${tag}  ${c.id}  —  ${c.detail}`);
  }
  console.log(`VERDICT: ${report.verdict}\n`);

  process.exit(hardFails.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(3); });
