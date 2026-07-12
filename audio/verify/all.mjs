// all.mjs — one command to verify the ENTIRE audio layer.
//
// Runs every audio verifier in sequence and reports a single consolidated PASS/FAIL, so
// any loop or release gate can confirm the music layer with one call (`npm run verify:all`)
// instead of remembering four scripts. The verdict is each child's EXIT CODE (each verifier
// already exits non-zero on any failed assertion); the pass/fail line counts are shown for
// context. Exits 0 only if ALL verifiers pass.
//
//   headless-safety     — no-ctx safety + section/scene/intensity state logic (plain node)
//   render-check        — offline render of all 4 SYNTH sections: real/seamless/ducking/
//                         deterministic + distinctness + scene-gate + enrage; writes WAVs
//   track-handoff-check — REAL generated mp3s: synth↔track handoff on source-of-truth music.js
//   campaign-tracks-live— REAL generated mp3s in the SHIPPED build: all 7 biome loops decode
//                         + hard-cut per stage, procedural synth silenced, useTrack(null) fallback
//   stage-boot-music    — REAL campaign path: boot ?level=1..7, onStageChange selects each
//                         stage's biome track (music.track === Nth manifest id)
//   live-check          — SHIPPED build in real Chromium: mounted, boss switch, scene-gate,
//                         enrage, wiring-in-source, rapid-churn robustness
//   perf-soak           — ~20s sustained-music production soak: FPS stable, no heap leak
//
// The three REAL-TRACK verifiers were previously MISSING here, so `verify:all` passed without
// ever testing the actual per-biome generated music (the core deliverable) — now included.
// Ordered fast→slow so a cheap failure surfaces first. Each verifier is self-contained
// (spawns its own server/Chromium and cleans up), so they run safely back-to-back.
// The LIVE public-URL check (public-url-music.mjs) is deliberately NOT here — it depends on
// external deploy state/network; run it explicitly via `npm run tracks:public` as a deploy gate.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VERIFIERS = [
  'headless-safety',      // fast, plain-node
  'render-check',         // offline synth render
  'track-handoff-check',  // real-track handoff (source-of-truth music.js)
  'campaign-tracks-live', // real per-biome mp3s decode + hard-cut per stage (shipped build)
  'stage-boot-music',     // real campaign path selects each stage's biome track
  'live-check',           // shipped-build synth wiring (boss/scene/enrage/churn)
  'perf-soak',            // slowest: ~20s production soak
];
// `--json`: suppress child verbose output and emit ONLY a structured summary on stdout,
// so a gate-scoring harness can parse the audio-layer verdict programmatically. The
// verdict is still each child's real exit code (not a self-report) + the process exit code.
const JSON_MODE = process.argv.includes('--json');
const w = (s) => { if (!JSON_MODE) process.stdout.write(s); };

const results = [];
for (const name of VERIFIERS) {
  w(`\n══════ ${name} ══════\n`);
  const r = spawnSync('node', [resolve(__dirname, `${name}.mjs`)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const out = (r.stdout || '') + (r.stderr || '');
  w(out);
  const pass = (out.match(/^\s*PASS\b/gm) || []).length;
  const fail = (out.match(/^\s*FAIL\b/gm) || []).length;
  const ok = r.status === 0;
  results.push({ name, ok, pass, fail, code: r.status });
}

const allOk = results.every((r) => r.ok);
const totalPass = results.reduce((s, r) => s + r.pass, 0);

if (JSON_MODE) {
  // Single machine-readable line for a harness to consume. No timestamp → no git noise
  // if ever redirected to a file; the freshness is the caller's run, not a stored claim.
  process.stdout.write(JSON.stringify({ layer: 'audio', allPass: allOk, totalAssertions: totalPass, verifiers: results }) + '\n');
} else {
  console.log('\n══════════════ AUDIO VERIFY-ALL SUMMARY ══════════════');
  for (const r of results) {
    console.log(`  ${r.ok ? '✅ PASS' : '❌ FAIL'}  ${r.name.padEnd(16)} ${r.pass} passed${r.fail ? `, ${r.fail} FAILED` : ''}${r.ok ? '' : `  (exit ${r.code})`}`);
  }
  console.log('══════════════════════════════════════════════════════');
  console.log(allOk ? `✅ AUDIO LAYER: ALL VERIFIERS PASS (${totalPass} assertions)` : '❌ AUDIO LAYER: ONE OR MORE VERIFIERS FAILED');
}
process.exit(allOk ? 0 : 1);
