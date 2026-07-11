#!/usr/bin/env node
// feedback/ship-decision.mjs — the COMPOSED wider-release decision.
//
// "Gates wider release" (my scope) means BOTH gates must be green, not either:
//   1. QA gate      — root.D's run-all.mjs verdict (playtest/frames/live/qa-summary.json):
//                     criticalFailed === 0.
//   2. Creator gate — feedback/release-gate.mjs on the exported approval record,
//                     artifact-bound (--artifact) so the approval is for THESE bytes.
// SHIP iff (QA green) AND (creator approved for this artifact). One verdict, one
// exit code (0 = SHIP, 1 = HOLD), one evidence file. This is the single go/no-go a
// publish/CI step calls before wider release — closing the "gate passes but ship
// never fires" gap on the decision side (the publish action itself is org-owned).
//
//   node feedback/ship-decision.mjs <approval-record.json> --artifact game [--build id] [--qa <qa-summary.json>]
//
// FRESHNESS: the QA summary is an INPUT — run `node playtest/e2e/run-all.mjs`
// against the current build first so it reflects these bytes (the creator gate is
// already artifact-bound; the QA summary is not, so the caller must keep it fresh).

import { spawnSync } from 'node:child_process';
import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const record = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
const qaPath = flag('--qa') || path.join(REPO, 'playtest', 'frames', 'live', 'qa-summary.json');
const artifactDir = flag('--artifact');
const buildId = flag('--build');

if (!record) {
  console.error('usage: node feedback/ship-decision.mjs <approval-record.json> --artifact game [--build id] [--qa <path>]');
  process.exit(2);
}

async function main() {
  // ---- QA gate (read root.D's real run-all summary) ----
  let qa = { pass: false, detail: '', when: null, totals: null };
  try {
    const j = JSON.parse(await readFile(qaPath, 'utf8'));
    const crit = (j.totals && j.totals.criticalFailed);
    qa.totals = j.totals || null;
    qa.when = j.when || null;
    qa.pass = crit === 0;
    qa.detail = `verdict=${j.verdict} criticalFailed=${crit} (${qaPath})`;
    try { qa.ageMin = Math.round((Date.now() - Date.parse(j.when)) / 60000); } catch (_) {}
  } catch (e) {
    qa.detail = `no readable QA summary at ${qaPath} — run 'node playtest/e2e/run-all.mjs' first (${e.message})`;
  }

  // ---- Creator gate (artifact-bound release-gate) ----
  const gateArgs = [path.join(HERE, 'release-gate.mjs'), record];
  if (buildId) gateArgs.push('--build', buildId);
  if (artifactDir) gateArgs.push('--artifact', artifactDir);
  const gate = spawnSync('node', gateArgs, { encoding: 'utf8' });
  const creatorPass = gate.status === 0;
  const creatorDetail = (gate.stdout || '').trim().split('\n')[0] || `exit=${gate.status}`;

  const ship = qa.pass && creatorPass;
  console.log('=== WIDER-RELEASE SHIP DECISION ===');
  console.log(`  QA gate      : ${qa.pass ? 'PASS ✓' : 'FAIL ✗'}  — ${qa.detail}${qa.ageMin != null ? `  [age ${qa.ageMin}m]` : ''}`);
  console.log(`  Creator gate : ${creatorPass ? 'PASS ✓' : 'FAIL ✗'}  — ${creatorDetail}`);
  console.log(`  DECISION     : ${ship ? 'SHIP ✓ (both gates green → wider release permitted)' : 'HOLD ✗ (at least one gate red → wider release denied)'}`);
  if (!artifactDir) console.log('  note: no --artifact — creator approval is NOT bound to these bytes (pass --artifact game).');
  if (qa.ageMin != null && qa.ageMin > 60) console.log(`  note: QA summary is ${qa.ageMin}m old — re-run run-all.mjs to ensure it reflects the current build.`);

  await mkdir(path.join(HERE, 'frames'), { recursive: true });
  await writeFile(path.join(HERE, 'frames', 'ship-decision.json'), JSON.stringify({
    when: new Date().toISOString(), record, qaPath, artifactDir: artifactDir || null,
    qa, creator: { pass: creatorPass, detail: creatorDetail },
    decision: ship ? 'SHIP' : 'HOLD',
  }, null, 2));
  process.exit(ship ? 0 : 1);
}
main().catch((e) => { console.error('SHIP-DECISION ERROR:', e); process.exit(2); });
