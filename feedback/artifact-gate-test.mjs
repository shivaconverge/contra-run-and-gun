#!/usr/bin/env node
// feedback/artifact-gate-test.mjs — regression guard for the artifact-bound
// release gate (FINDINGS OI-2 mitigation). Asserts EXIT CODES of the real CLI:
// bound+match -> 0, artifact changed -> 1 (fail-closed), unbound -> 1. Writes
// feedback/frames/release-gate-artifact.json. Run: node feedback/artifact-gate-test.mjs
import { spawnSync } from 'node:child_process';
import { cpSync, appendFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const GATE = path.join(HERE, 'release-gate.mjs');
const unbound = path.join(HERE, 'approvals', 'example-approved.v1.json');
const gameDir = path.join(REPO, 'game');

const run = (args) => spawnSync('node', [GATE, ...args], { encoding: 'utf8' }).status;
const results = [];
const check = (name, got, want) => { results.push({ name, exit: got, expect: want, ok: got === want });
  console.log(`  ${got === want ? 'PASS' : 'FAIL'}  ${name}  exit=${got} (want ${want})`); };

// DRIFT-PROOF: stamp a FRESH bound record against the CURRENT game/ tree at
// runtime, so this test validates the binding MECHANISM regardless of what
// root.B changes in game/ (a committed frozen hash would false-fail on any edit).
const tmpDir = path.join(os.tmpdir(), 'fb-artifact-gate-test');
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
const bound = path.join(tmpDir, 'bound.json');
const stamp = spawnSync('node', [GATE, '--stamp', unbound, '--artifact', gameDir, '--build', 'v1'], { encoding: 'utf8' });
if (stamp.status !== 0) { console.error('STAMP FAILED — cannot run test:', stamp.stderr); process.exit(3); }
writeFileSync(bound, stamp.stdout);

// freshly-stamped record vs the SAME (unchanged) tree -> APPROVED (0)
check('bound-match-approves', run([bound, '--artifact', gameDir]), 0);

// same record vs a tampered copy -> BLOCKED (1), fail-closed
const mut = path.join(tmpDir, 'game-mut');
cpSync(gameDir, mut, { recursive: true });
appendFileSync(path.join(mut, 'src', 'main.js'), '\n// tamper\n');
check('artifact-changed-blocks', run([bound, '--artifact', mut]), 1);

// unbound (raw Entry[]) under --artifact -> BLOCKED (1), refuses unbound ship
check('unbound-under-artifact-blocks', run([unbound, '--artifact', gameDir, '--build', 'v1']), 1);

// approved verdict, no --artifact -> still 0 (legacy path preserved)
check('legacy-no-artifact-approves', run([unbound, '--build', 'v1']), 0);

rmSync(tmpDir, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok).length;
mkdirSync(path.join(HERE, 'frames'), { recursive: true });
writeFileSync(path.join(HERE, 'frames', 'release-gate-artifact.json'), JSON.stringify({
  when: new Date().toISOString(), purpose: 'artifact-bound release gate fail-closed behavior (OI-2 mitigation)',
  passed: results.length - failed, failed, verdict: failed === 0 ? 'PASS' : `FAIL (${failed})`, results }, null, 2));
console.log(`\n=== ARTIFACT-GATE: ${results.length - failed}/${results.length} PASS ===`);
process.exit(failed ? 1 : 0);
