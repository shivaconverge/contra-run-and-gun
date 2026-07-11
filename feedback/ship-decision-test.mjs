#!/usr/bin/env node
// feedback/ship-decision-test.mjs — regression guard for the COMPOSED ship gate
// (feedback/ship-decision.mjs). Asserts the AND-composition: SHIP only when BOTH
// the QA gate and the artifact-bound creator gate are green. Drift-proof: stamps
// a fresh approval against the current game/ tree and synthesizes QA summaries, so
// it never depends on frozen fixtures. Evidence -> feedback/frames/ship-decision-test.json
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const GATE = path.join(HERE, 'release-gate.mjs');
const SHIP = path.join(HERE, 'ship-decision.mjs');
const gameDir = path.join(REPO, 'game');
const approvedEntries = path.join(HERE, 'approvals', 'example-approved.v1.json');
const rejectedEntries = path.join(HERE, 'approvals', 'example-rejected.v1.json');

const tmp = path.join(os.tmpdir(), 'fb-ship-test');
rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
const qaPass = path.join(tmp, 'qa-pass.json');
const qaFail = path.join(tmp, 'qa-fail.json');
writeFileSync(qaPass, JSON.stringify({ when: new Date().toISOString(), verdict: 'PASS', totals: { passed: 91, failed: 0, criticalFailed: 0 } }));
writeFileSync(qaFail, JSON.stringify({ when: new Date().toISOString(), verdict: 'FAIL (1 critical)', totals: { passed: 90, failed: 1, criticalFailed: 1 } }));

// fresh artifact-bound approve + reject records against the CURRENT tree
const stamp = (entries) => {
  const s = spawnSync('node', [GATE, '--stamp', entries, '--artifact', gameDir, '--build', 'v1'], { encoding: 'utf8' });
  if (s.status !== 0) { console.error('stamp failed', s.stderr); process.exit(3); }
  const p = path.join(tmp, `rec-${path.basename(entries)}`); writeFileSync(p, s.stdout); return p;
};
const approveRec = stamp(approvedEntries);
const rejectRec = stamp(rejectedEntries);

const ship = (rec, qa) => spawnSync('node', [SHIP, rec, '--artifact', gameDir, '--qa', qa], { encoding: 'utf8' }).status;
const results = [];
const check = (name, got, want) => { results.push({ name, exit: got, expect: want, ok: got === want });
  console.log(`  ${got === want ? 'PASS' : 'FAIL'}  ${name}  exit=${got} (want ${want})`); };

check('qaPass+approve=SHIP', ship(approveRec, qaPass), 0);      // both green -> SHIP
check('qaPass+reject=HOLD', ship(rejectRec, qaPass), 1);        // creator red -> HOLD
check('qaFail+approve=HOLD', ship(approveRec, qaFail), 1);      // QA red -> HOLD
check('qaFail+reject=HOLD', ship(rejectRec, qaFail), 1);        // both red -> HOLD

// STALENESS FAIL-SAFE (why --artifact is MANDATORY): an UNBOUND approve (raw panel
// export, no artifactHash — exactly what the creator's re-approval will be) must
// NOT ship under --artifact, even with QA green. Guards against a stale/fabricated
// 'dev' approve green-lighting bytes it was never for (FINDINGS OI-2/OI-6).
check('qaPass+UNBOUNDapprove+artifact=HOLD',
  spawnSync('node', [SHIP, approvedEntries, '--build', 'v1', '--artifact', gameDir, '--qa', qaPass], { encoding: 'utf8' }).status, 1);

rmSync(tmp, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok).length;
mkdirSync(path.join(HERE, 'frames'), { recursive: true });
writeFileSync(path.join(HERE, 'frames', 'ship-decision-test.json'), JSON.stringify({
  when: new Date().toISOString(), purpose: 'composed ship gate = QA-green AND creator-approved-bound',
  passed: results.length - failed, failed, verdict: failed === 0 ? 'PASS' : `FAIL (${failed})`, results }, null, 2));
console.log(`\n=== SHIP-DECISION: ${results.length - failed}/${results.length} PASS ===`);
process.exit(failed ? 1 : 0);
