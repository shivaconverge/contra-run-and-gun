#!/usr/bin/env node
// feedback/verify-all.mjs — ONE health check for the whole creator-approval
// deliverable. The build changes every cycle; this re-grounds the entire slice in
// a single command instead of running five harnesses by hand.
//
//   node feedback/verify-all.mjs
//
// Runs the four GREEN suites (must all pass) and the ONE known-red OI-5 acceptance
// gate (tracked-open, does NOT fail the aggregate). Exit 0 iff every green suite
// passes. Evidence -> feedback/frames/verify-all.json.
//
//   green suites : release-gate --verify (panel↔consumer parity), conformance
//                  (AC-1..12 live), artifact-gate (fail-closed binding),
//                  ship-decision (QA ∧ creator composition)
//   tracked-open : touch-reach (OI-5 — panel unreachable on touch; red until root.B
//                  adds a touch toggle button)
//   re-approval  : re-approval-status (git+code FACTS behind RE-APPROVAL-STATUS.md —
//                  which of the 4 rejected defects have landed in the served build;
//                  informational, never gates the aggregate — a creator APPROVE does)

import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const run = (script) => spawnSync('node', [path.join(HERE, script)], { encoding: 'utf8' });

const GREEN = [
  { name: 'parity',       script: 'release-gate.mjs', args: ['--verify'], note: 'consumer verdict == shipped releaseApproved' },
  { name: 'conformance',  script: 'conformance.mjs',  note: 'AC-1..14 (+AC-2b) against the live shipped panel' },
  { name: 'artifact-gate',script: 'artifact-gate-test.mjs', note: 'artifact-bound gate fails closed' },
  { name: 'ship-decision',script: 'ship-decision-test.mjs', note: 'SHIP iff QA-green AND creator-approved' },
  // Continuous behavioral guard on the CREATOR'S fixes (#2 firing origin, #4 boss
  // movement): fails loudly if an in-build fix regresses while root.B edits game/.
  { name: 'defect-behavior', script: 'defect-behavior-test.mjs', note: 'creator fixes #2/#4 still behave (boss moves, fires from hands)' },
];
const TRACKED_OPEN = [
  { name: 'touch-reach', script: 'touch-reach-test.mjs', issue: 'OI-5', note: 'panel reachable on touch (KNOWN RED until root.B adds touch button)' },
  // FIRED 2026-07-10: Stage 2 (game/data/level2.js) landed but feedback.js has no
  // context.stage — a multi-stage creator verdict can't say which stage. Red until
  // root.B adds context.stage (SPEC §3.4). Tracked-open like OI-5 so it's visible
  // without masking the green health of the panel/gate machinery.
  { name: 'multistage-context', script: 'multistage-context-check.mjs', issue: 'OI-7', note: 'context.stage missing on the now-multi-stage build (root.B: add it)' },
];

function exec(entry) {
  const r = entry.args
    ? spawnSync('node', [path.join(HERE, entry.script), ...entry.args], { encoding: 'utf8' })
    : run(entry.script);
  const tail = (r.stdout || '').trim().split('\n').filter(Boolean).slice(-1)[0] || '';
  return { name: entry.name, exit: r.status, ok: r.status === 0, tail: tail.trim(), issue: entry.issue || null, note: entry.note };
}

async function main() {
  console.log('=== CREATOR-APPROVAL DELIVERABLE — verify-all ===\n');
  console.log('GREEN suites (must all pass):');
  const green = GREEN.map((e) => { const r = exec(e); console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(14)} ${r.tail}`); return r; });
  console.log('\nTracked-open acceptance gates (expected red; do NOT fail the aggregate):');
  const open = TRACKED_OPEN.map((e) => { const r = exec(e); console.log(`  ${r.ok ? 'PASS→CLOSED' : 'RED (open)'}  ${r.name.padEnd(14)} [${r.issue}] ${r.tail}`); return r; });

  // Re-approval readiness — the RE-APPROVAL-STATUS.md tracker, machine-derived from
  // git+code so it can't go stale. Informational: never gates the aggregate (only a
  // creator APPROVE reopens the release gate), but re-grounded on every health check.
  console.log('\nRe-approval readiness (RE-APPROVAL-STATUS.md — git+code facts, creator-gated):');
  const reapproval = exec({ name: 're-approval', script: 're-approval-status.mjs', note: 'which of the 4 rejected defects are in the served build' });
  console.log(`  ${reapproval.tail}`);

  const greenFailed = green.filter((r) => !r.ok);
  const nowClosed = open.filter((r) => r.ok);
  const verdict = greenFailed.length === 0 ? 'PASS' : `FAIL (${greenFailed.length} green suite(s) red)`;
  console.log(`\n=== VERIFY-ALL: ${verdict} — green ${green.length - greenFailed.length}/${green.length}, open-gates ${open.length - nowClosed.length}/${open.length} still red ===`);
  if (nowClosed.length) console.log(`  NOTE: tracked-open gate(s) now PASS — ${nowClosed.map((r) => r.issue).join(', ')} may be RESOLVED; update FINDINGS.`);

  await mkdir(path.join(HERE, 'frames'), { recursive: true });
  await writeFile(path.join(HERE, 'frames', 'verify-all.json'), JSON.stringify({
    when: new Date().toISOString(), verdict, green, trackedOpen: open, reapproval,
  }, null, 2));
  process.exit(greenFailed.length === 0 ? 0 : 1);
}
main().catch((e) => { console.error('VERIFY-ALL ERROR:', e); process.exit(2); });
