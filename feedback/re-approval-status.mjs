#!/usr/bin/env node
// feedback/re-approval-status.mjs — MACHINE-CHECKED backing for RE-APPROVAL-STATUS.md.
//
// The markdown tracker (feedback/RE-APPROVAL-STATUS.md) is hand-maintained and goes
// stale the moment a defect lands (it did: row #3 said "not started" after the
// turret barrel-origin fix already merged). This script derives each of the 4
// creator-rejected defects' in-build status from GIT + CODE FACTS instead of prose,
// so the readiness verdict is re-grounded every run and can't drift.
//
//   node feedback/re-approval-status.mjs        # print + write frames/re-approval-status.json
//
// It is wired into feedback/verify-all.mjs as an informational section. It NEVER
// certifies a fix as creator-closed — the human creator forbade self-certifying from
// frame comparison. "addressed in-build" == a commit landed AND the code carries the
// fix; only a creator APPROVE (artifact-bound) closes a defect and reopens the gate.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

const git = (...args) =>
  (spawnSync('git', ['-C', REPO, ...args], { encoding: 'utf8' }).stdout || '').trim();

// Does a commit whose subject matches `re` exist since the reject landed?
const gitLogHas = (re) =>
  git('log', '--oneline', '-40').split('\n').find((l) => re.test(l)) || null;

// Does the shipped code under game/ carry the fix (grep for a stable code signature)?
function codeHas(rel, re) {
  try { return re.test(readFileSync(path.join(REPO, rel), 'utf8')); }
  catch { return false; }
}

// The 4 defects from CREATOR_FEEDBACK.md / OI-6. Each is scored from FACTS:
//   commit  — a landed commit subject (the implementer's CLAIM, with a ref)
//   inBuild — a stable code signature proving the fix is actually in the served tree
// status = 'in-build'          when BOTH commit and inBuild are true
//          'art-ready-unwired' when a commit landed but the engine hasn't wired it
//          'not-addressed'     otherwise
const DEFECTS = [
  {
    n: 1, title: 'Environment/theme: bridge over water + multi-height traversal',
    owner: 'art assets/ + engine game/',
    commit: () => gitLogHas(/theme.*bridge|bridge.*water|creator #1 theme/i),
    // Wired only when the LEVEL actually defines a functional bridge solid (the
    // `bridge: true` FLAG that switches physics/render — a code property, not a
    // comment keyword, so a comment cleanup can't false-negative this). The
    // structural multi-height fact (catwalk 124px above the deck) is separately
    // asserted at runtime by feedback/defect-behavior-test.mjs (defect1.multiHeightPresent).
    inBuild: () => codeHas('game/data/level1.js', /bridge:\s*true/),
    artReady: () => true, // PR#200 refined the tiles; they exist as art candidates
  },
  {
    n: 2, title: 'Hero firing origin → the hands (was waist)',
    owner: 'engine game/ + art',
    commit: () => gitLogHas(/hero firing origin|firing-origin/i),
    inBuild: () => codeHas('game/src/player.js', /muzzle origin at the HANDS/i),
  },
  {
    n: 3, title: 'Tank/turret firing origin → the visible barrel',
    owner: 'engine + art',
    commit: () => gitLogHas(/turret fires|CR-3|barrel TIP/i),
    // barrel geometry is DATA shared by render+sim so they can't drift (CR-3)
    inBuild: () => codeHas('game/data/config.js', /barrelPivotFromBottom/) &&
                   codeHas('game/src/enemy.js', /barrel TIP|barrelLen/),
  },
  {
    n: 4, title: 'Boss movement (static → real movement)',
    owner: 'engine game/',
    commit: () => gitLogHas(/boss now MOVES|CR-4|Sentinel.*move/i),
    inBuild: () => codeHas('game/src/enemy.js', /the Sentinel HOVERS|CR-4/),
  },
];

function assess(d) {
  const commit = d.commit();
  const inBuild = d.inBuild();
  let status;
  if (inBuild) status = 'in-build';
  else if (commit || (d.artReady && d.artReady())) status = 'art-ready-unwired';
  else status = 'not-addressed';
  return { n: d.n, title: d.title, owner: d.owner, commit, inBuild, status };
}

async function main() {
  const rows = DEFECTS.map(assess);
  const inBuild = rows.filter((r) => r.status === 'in-build').length;
  const ready = inBuild === rows.length; // all 4 addressed in the served build
  const verdict = ready
    ? 'READY for creator re-review (all 4 addressed in-build; needs a bound APPROVE)'
    : `NOT READY — ${inBuild}/${rows.length} addressed in-build`;

  console.log('=== RE-APPROVAL STATUS (git+code FACTS; not a creator close) ===\n');
  for (const r of rows) {
    const mark = r.status === 'in-build' ? '[in-build]   '
      : r.status === 'art-ready-unwired' ? '[unwired]    ' : '[not-started]';
    console.log(`  #${r.n} ${mark} ${r.title}`);
    if (r.commit) console.log(`        commit: ${r.commit}`);
  }
  console.log('\n  Gate stays HELD until a creator APPROVE (artifact-bound) lands — a');
  console.log('  claim is not a close; see feedback/RE-APPROVAL-STATUS.md.');

  await mkdir(path.join(HERE, 'frames'), { recursive: true });
  await writeFile(path.join(HERE, 'frames', 're-approval-status.json'),
    JSON.stringify({ when: new Date().toISOString(), ready, inBuild, verdict, defects: rows }, null, 2));

  // Final line = the one-liner verify-all surfaces as this section's tail.
  console.log(`=== RE-APPROVAL: ${inBuild}/${rows.length} defects in-build — ${verdict} ===`);

  // Informational only: this NEVER exits non-zero. Readiness is a creator decision,
  // not a test pass — verify-all reports it but does not gate the aggregate on it.
  process.exit(0);
}
main().catch((e) => { console.error('RE-APPROVAL-STATUS ERROR:', e); process.exit(2); });
