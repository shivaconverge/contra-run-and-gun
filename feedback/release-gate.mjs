#!/usr/bin/env node
// feedback/release-gate.mjs — the RELEASE-GATE CONSUMER.
//
// The shipped panel (game/src/feedback.js) CAPTURES a creator verdict and exposes
// `window.__approval.releaseApproved`, but that boolean lives only in the
// creator's browser localStorage and NOTHING downstream reads it — so "the gate
// passes but the ship never fires" (strategy obs_gate_passes_but_ship_never_fires).
// This is the missing link: a machine-readable gate a publish/CI step calls to
// decide whether a build may go to WIDER RELEASE.
//
//   node feedback/release-gate.mjs <approval-record.json> [--build <id>]
//     -> prints verdict, exits 0 if APPROVED (publish may proceed), 1 if not.
//   node feedback/release-gate.mjs --verify
//     -> drives the REAL shipped build and proves this consumer's verdict is
//        byte-identical to the panel's own releaseApproved across cases (no drift).
//
// The approval record is the panel's persisted Entry[] (SPEC §3.4) exported from
// the creator's browser to feedback/approvals/<buildId>.json (see that README).
//
// Usage in a pipeline:   node feedback/release-gate.mjs feedback/approvals/v1.json --build v1 && npm run publish

import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeArtifactHash } from './lib/artifact-hash.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// EXACT replica of game/src/feedback.js computeGate() — kept in lockstep by the
// --verify cross-check below (asserts parity against the live controller).
export function computeGate(list, buildId) {
  if (!Array.isArray(list)) return false;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    if (e && e.context && e.context.buildId === buildId) {
      return e.verdict === 'approve' && (e.rating == null || e.rating >= 3);
    }
  }
  return false;
}

// Accept either a raw Entry[] or a { entries: Entry[] } wrapper.
function entriesOf(record) {
  if (Array.isArray(record)) return record;
  if (record && Array.isArray(record.entries)) return record.entries;
  throw new Error('approval record must be an Entry[] or { entries: Entry[] }');
}

// Resolve the build under gate: explicit --build wins, else the buildId of the
// newest entry in the record (there must be one, else the gate is undecidable).
function resolveTargetBuild(entries, explicit) {
  if (explicit) return explicit;
  for (let i = entries.length - 1; i >= 0; i--) {
    const b = entries[i] && entries[i].context && entries[i].context.buildId;
    if (b) return b;
  }
  return null;
}

async function gateFromFile(recordPath, opts = {}) {
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  const entries = entriesOf(record);
  // A wrapper record may carry a top-level buildId (from --stamp). --build wins.
  const recordBuild = (!Array.isArray(record) && record.buildId) || null;
  const buildId = resolveTargetBuild(entries, opts.explicitBuild || recordBuild);
  if (!buildId) {
    console.error('RELEASE-GATE: no buildId in record and none passed via --build — undecidable.');
    process.exit(2);
  }
  const verdictApproved = computeGate(entries, buildId);
  const latest = [...entries].reverse().find((e) => e.context && e.context.buildId === buildId) || null;

  // ---- Artifact binding (fail-closed) --------------------------------------
  // If --artifact is given, the approval must be bound to the EXACT bytes being
  // shipped: the record's artifactHash must equal a fresh hash of the tree. This
  // is what makes the gate sound while window.__buildId is unset (OI-2): even if
  // every approval self-reports buildId='dev', a changed artifact → new hash →
  // BLOCK. A record with no artifactHash under --artifact is BLOCKED (unbound).
  let artifactOk = true;
  let artifactNote = '';
  if (opts.artifactDir) {
    const fresh = await computeArtifactHash(opts.artifactDir);
    const bound = (!Array.isArray(record) && record.artifactHash) || null;
    if (!bound) {
      artifactOk = false;
      artifactNote = `record is NOT artifact-bound (no artifactHash) — refusing to ship. Re-stamp: node feedback/release-gate.mjs --stamp <entries.json> --artifact ${opts.artifactDir}`;
    } else if (bound !== fresh.hash) {
      artifactOk = false;
      artifactNote = `artifact MISMATCH — approval was for ${bound.slice(0, 16)}…, shipping ${fresh.hash.slice(0, 16)}… (${fresh.fileCount} files). Build changed since approval; re-approve.`;
    } else {
      artifactNote = `artifact bound ✓ ${fresh.hash.slice(0, 16)}… (${fresh.fileCount} files)`;
    }
  } else if (buildId === 'dev') {
    artifactNote = 'WARNING: build is \'dev\' and no --artifact binding — gate is NOT build-scoped (a stale approval could pass). Pass --artifact game to bind, or inject window.__buildId (OI-2).';
  }

  const approved = verdictApproved && artifactOk;
  console.log(`RELEASE-GATE  build=${buildId}  ->  ${approved ? 'APPROVED ✓ (publish may proceed)' : 'BLOCKED ✗ (wider release denied)'}`);
  if (latest) {
    console.log(`  newest verdict: ${latest.verdict}${latest.rating != null ? ` @${latest.rating}★` : ''}` +
      `  notes=${JSON.stringify(latest.notes || '')}  score=${latest.context.score}  ts=${latest.ts}`);
  } else {
    console.log(`  no entry for build '${buildId}' — default CLOSED.`);
  }
  if (artifactNote) console.log(`  ${artifactNote}`);
  process.exit(approved ? 0 : 1);
}

// --stamp: bind an exported Entry[] to the CURRENT artifact, emitting a wrapper
// record { buildId, artifactHash, stampedAt, entries } to stdout. The creator
// runs this right after approving, against the build they approved, then commits
// the output to feedback/approvals/. At ship time the gate re-hashes and compares.
async function stampRecord(entriesPath, artifactDir, explicitBuild) {
  const raw = JSON.parse(await readFile(entriesPath, 'utf8'));
  const entries = entriesOf(raw);
  const buildId = explicitBuild || resolveTargetBuild(entries, null) || 'dev';
  const art = await computeArtifactHash(artifactDir);
  const record = { buildId, artifactHash: art.hash, artifactFiles: art.fileCount, stampedAt: new Date().toISOString(), entries };
  process.stdout.write(JSON.stringify(record, null, 2) + '\n');
  process.exit(0);
}

// --verify: prove this consumer never drifts from the SHIPPED panel. Seed the
// real build's localStorage with each case, read window.__approval.releaseApproved,
// and assert it equals computeGate() here. FACT-based equivalence, not eyeball.
async function verifyAgainstShippedBuild() {
  const require = createRequire('/Users/avinashsaxena/matrix-dfs-statemachine-pre-clock/loop_hierarchy/runs/contra-live3/repo/playtest/e2e/');
  const puppeteer = require('puppeteer-core');
  const { serveGame, findChrome, sleep } = await import('../playtest/e2e/harness.mjs');
  const OUT = path.join(HERE, 'frames');
  await mkdir(OUT, { recursive: true });

  // buildId 'dev' matches the shipped controller's resolved id (no window.__buildId).
  const B = 'dev';
  const ctx = (over = {}) => ({ buildId: B, status: 'playing', mode: 'arcade', score: 100, lives: 3, ...over });
  const cases = [
    { name: 'empty', entries: [] },
    { name: 'approve-unrated', entries: [{ verdict: 'approve', rating: null, notes: '', context: ctx(), ts: 1 }] },
    { name: 'approve-5star', entries: [{ verdict: 'approve', rating: 5, notes: '', context: ctx(), ts: 1 }] },
    { name: 'approve-2star-contradictory', entries: [{ verdict: 'approve', rating: 2, notes: '', context: ctx(), ts: 1 }] },
    { name: 'reject', entries: [{ verdict: 'reject', rating: null, notes: '', context: ctx(), ts: 1 }] },
    { name: 'approve-then-reject', entries: [
      { verdict: 'approve', rating: 5, notes: '', context: ctx(), ts: 1 },
      { verdict: 'reject', rating: null, notes: '', context: ctx(), ts: 2 }] },
    { name: 'reject-then-approve', entries: [
      { verdict: 'reject', rating: null, notes: '', context: ctx(), ts: 1 },
      { verdict: 'approve', rating: 4, notes: '', context: ctx(), ts: 2 }] },
    { name: 'approve-other-build-only', entries: [
      { verdict: 'approve', rating: 5, notes: '', context: ctx({ buildId: 'other' }), ts: 1 }] },
  ];

  const srv = await serveGame();
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--mute-audio'], defaultViewport: { width: 640, height: 360 } });
  const results = [];
  try {
    const page = await browser.newPage();
    for (const c of cases) {
      await page.goto(`${srv.url}/`, { waitUntil: 'domcontentloaded' });
      await page.evaluate((entries) => {
        localStorage.clear();
        localStorage.setItem('contra:feedback:v1', JSON.stringify(entries));
      }, c.entries);
      await page.goto(`${srv.url}/`, { waitUntil: 'networkidle2' });
      await page.waitForFunction(() => !!window.__approval, { timeout: 15000 });
      const shipped = await page.evaluate(() => window.__approval.releaseApproved);
      const mine = computeGate(c.entries, B);
      const ok = shipped === mine;
      results.push({ case: c.name, shipped, consumer: mine, parity: ok });
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${c.name.padEnd(30)} shipped=${shipped} consumer=${mine}`);
    }
  } finally {
    await browser.close();
    await srv.close();
  }
  const failed = results.filter((r) => !r.parity).length;
  await writeFile(path.join(OUT, 'release-gate.json'), JSON.stringify({
    when: new Date().toISOString(),
    purpose: 'parity: feedback/release-gate.mjs computeGate === shipped window.__approval.releaseApproved',
    passed: results.length - failed, failed, verdict: failed === 0 ? 'PASS' : `FAIL (${failed})`, results,
  }, null, 2));
  console.log(`\n=== RELEASE-GATE PARITY: ${results.length - failed}/${results.length} match shipped panel ===`);
  process.exit(failed > 0 ? 1 : 0);
}

const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
if (argv[0] === '--verify') {
  verifyAgainstShippedBuild().catch((e) => { console.error('VERIFY ERROR:', e); process.exit(3); });
} else if (argv[0] === '--stamp') {
  const entriesPath = argv[1] && !argv[1].startsWith('--') ? argv[1] : flag('--stamp');
  const artifactDir = flag('--artifact');
  if (!entriesPath || !artifactDir) {
    console.error('usage: node feedback/release-gate.mjs --stamp <entries.json> --artifact <dir> [--build <id>]');
    process.exit(2);
  }
  stampRecord(entriesPath, artifactDir, flag('--build')).catch((e) => { console.error('STAMP ERROR:', e.message); process.exit(2); });
} else if (argv[0] && !argv[0].startsWith('--')) {
  gateFromFile(argv[0], { explicitBuild: flag('--build'), artifactDir: flag('--artifact') })
    .catch((e) => { console.error('GATE ERROR:', e.message); process.exit(2); });
} else {
  console.error('usage:\n' +
    '  node feedback/release-gate.mjs <approval-record.json> [--build <id>] [--artifact <dir>]\n' +
    '  node feedback/release-gate.mjs --stamp <entries.json> --artifact <dir> [--build <id>]  > record.json\n' +
    '  node feedback/release-gate.mjs --verify');
  process.exit(2);
}
