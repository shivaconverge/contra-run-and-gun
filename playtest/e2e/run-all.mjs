#!/usr/bin/env node
// run-all.mjs — the consolidated QA ACCEPTANCE GATE. Runs every e2e harness in a
// clobber-safe order and aggregates their real pass/fail FACTS into one verdict +
// one machine-readable summary (frames/live/qa-summary.json). This is the single
// signal the hierarchy/creator can read to answer "does the build pass QA?" —
// replacing four separate script runs and the manual go-live/touch re-run dance.
//
//   node playtest/e2e/run-all.mjs
//
// Order matters: playthrough.mjs FIRST because it wipes frames/live/ at start;
// go-live + touch then add their own frames/JSON there without wiping; fidelity
// writes to frames/fidelity/ (independent). Exit code is non-zero iff any
// CRITICAL assertion is red (e.g. the required creator-approval panel), so the
// gate stays honestly red until the build is ship-complete. Non-critical reds
// (known defects like BOSS-3, fps-telemetry) are reported but don't fail the gate.

import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRAMES = path.resolve(HERE, '..', 'frames');

// Sequential, clobber-safe order. `json` is the evidence each harness writes.
const HARNESSES = [
  { name: 'playthrough', script: 'playthrough.mjs', json: path.join(FRAMES, 'live', 'results.json') },
  { name: 'go-live', script: 'go-live.mjs', json: path.join(FRAMES, 'live', 'go-live.json') },
  { name: 'touch', script: 'touch.mjs', json: path.join(FRAMES, 'live', 'touch.json') },
  { name: 'fidelity', script: 'fidelity.mjs', json: path.join(FRAMES, 'fidelity', 'metrics.json') },
];

function run(script) {
  return new Promise((resolve) => {
    const child = spawn('node', [path.join(HERE, script)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const cap = (b) => { tail = (tail + b.toString()).slice(-4000); };
    child.stdout.on('data', cap);
    child.stderr.on('data', cap);
    child.on('exit', (code) => resolve({ exit: code ?? -1, tail }));
  });
}

// Normalize each harness's evidence to { passed, failed, reds:[{id,critical,detail}] }.
function normalize(name, json, exit) {
  if (!json) return { passed: 0, failed: 1, reds: [{ id: `${name}.harnessError`, critical: true, detail: `exit=${exit}, no JSON` }] };
  if (name === 'fidelity') {
    // Gate harness: failures[] = unfair-frame validity failures (each is critical).
    const reds = (json.failures || []).map((f) => ({ id: 'fidelity.validity', critical: true, detail: f }));
    const pairs = (json.pairs || []).length;
    return { passed: json.ok ? pairs : Math.max(0, pairs - reds.length), failed: reds.length, reds };
  }
  const reds = (json.results || []).filter((r) => !r.ok)
    .map((r) => ({ id: r.id, critical: r.critical !== false, detail: r.detail }));
  return { passed: json.passed ?? 0, failed: json.failed ?? reds.length, reds };
}

async function main() {
  const summary = { when: new Date().toISOString?.() || null, harnesses: [] };
  console.log('=== QA ACCEPTANCE GATE — running all harnesses ===\n');
  for (const h of HARNESSES) {
    process.stdout.write(`▶ ${h.name} … `);
    const { exit, tail } = await run(h.script);
    let json = null;
    try { json = JSON.parse(await readFile(h.json, 'utf8')); } catch { /* missing/crash */ }
    const n = normalize(h.name, json, exit);
    const critReds = n.reds.filter((r) => r.critical).length;
    summary.harnesses.push({ name: h.name, exit, passed: n.passed, failed: n.failed, criticalFailed: critReds, reds: n.reds });
    console.log(`${n.passed} passed, ${n.failed} failed (${critReds} critical) [exit ${exit}]`);
    if (!json) console.log(tail.split('\n').slice(-4).join('\n'));
  }

  const totals = summary.harnesses.reduce((a, h) => ({
    passed: a.passed + h.passed, failed: a.failed + h.failed, criticalFailed: a.criticalFailed + h.criticalFailed,
  }), { passed: 0, failed: 0, criticalFailed: 0 });
  summary.totals = totals;
  summary.reds = summary.harnesses.flatMap((h) => h.reds.map((r) => ({ harness: h.name, ...r })));
  summary.verdict = totals.criticalFailed === 0 ? 'PASS' : `FAIL (${totals.criticalFailed} critical)`;

  await writeFile(path.join(FRAMES, 'live', 'qa-summary.json'), JSON.stringify(summary, null, 2));

  console.log(`\n=== QA TOTAL: ${totals.passed} passed, ${totals.failed} failed (${totals.criticalFailed} critical) ===`);
  if (summary.reds.length) {
    console.log('Standing reds (each is a filed OPEN ISSUE — a gate, not a mask):');
    for (const r of summary.reds) console.log(`  ${r.critical ? 'CRIT' : 'note'}  [${r.harness}] ${r.id}`);
  }
  console.log(`VERDICT: ${summary.verdict}`);
  console.log(`summary -> ${path.join(FRAMES, 'live', 'qa-summary.json')}`);
  process.exit(totals.criticalFailed > 0 ? 1 : 0);
}

main().catch((e) => { console.error('QA RUNNER ERROR:', e); process.exit(2); });
