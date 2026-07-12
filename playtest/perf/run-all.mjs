#!/usr/bin/env node
// run-all.mjs — run the full perf suite against the LIVE deployment and print a
// one-line PASS/FAIL roll-up. Each probe writes its own results/*.json and exits
// non-zero on a hard-budget failure; this runner aggregates the exit codes.
//
//   node playtest/perf/run-all.mjs
//
// Probes (in order):
//   cold-load.mjs --profile desktop   cold waterfall + payload + pacing (desktop)
//   cold-load.mjs --profile mobile    same, throttled Slow-4G + 4x CPU
//   music-memory.mjs                  decoded-audio resident RAM (the memory budget)

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const run = (file, args = []) => new Promise((resolve) => {
  const p = spawn(process.execPath, [path.join(HERE, file), ...args], { stdio: 'inherit' });
  p.on('exit', (code) => resolve({ file: `${file} ${args.join(' ')}`.trim(), code: code ?? 1 }));
});

const results = [];
results.push(await run('cold-load.mjs', ['--profile', 'desktop']));
results.push(await run('cold-load.mjs', ['--profile', 'mobile']));
results.push(await run('music-memory.mjs'));

console.log('\n' + '='.repeat(70));
console.log('PERF SUITE ROLL-UP');
for (const r of results) console.log(`  ${r.code === 0 ? 'PASS' : 'FAIL'}  ${r.file}`);
const failed = results.filter((r) => r.code !== 0);
console.log('='.repeat(70));
console.log(failed.length
  ? `${failed.length}/${results.length} probes FAIL budget — see playtest/perf/OPEN-ISSUES.md`
  : `all ${results.length} probes PASS budget`);
process.exit(failed.length ? 1 : 0);
