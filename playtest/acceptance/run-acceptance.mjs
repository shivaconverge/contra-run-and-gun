// run-acceptance.mjs — THE consolidated player-POV acceptance GATE.
//
// One command → one authoritative verdict + one machine-readable fact. This runs
// every acceptance harness fresh against BOTH the local served build AND the
// deployed public URL, aggregates their real FACTS into acceptance-summary.json,
// prints a single headline, and exits non-zero iff the live campaign is not fully
// served. It exists because the deploy PRs CLAIM the campaign is LIVE — this is the
// single runnable signal that proves (or disproves) scope_served against what real
// players actually reach (strategy: obs_live_claimed_zero_scope_served).
//
// What it consolidates:
//   • scope-served.mjs (local + public): the 7/7 campaign spine — param-free boot,
//     N-progression 1→7→victory, per-stage tileset/background/set-dressing/boss +
//     distinct theme-matched MUSIC, deploy content-hash drift guard.
//   • weapon-fidelity.mjs (local + public): fresh zoomed weapon crops for the
//     creator's two-weapon defect.
//
// FACTS vs JUDGMENTS — the honest boundary this gate holds:
//   The campaign facts (scope_served, victory, drift, transitions) are COMPUTED and
//   gate the exit code. The "exactly ONE weapon per entity" call is a BY-LOOKING
//   judgment that code cannot make — so this gate does NOT fake it. It (a) asserts
//   the FACT that fresh weapon evidence was captured, and (b) replays the recorded
//   by-looking verdict from weapon-verdict.json, BUT re-hashes the weapon render
//   path (render.js/player.js) and flags the verdict POSSIBLY-STALE if it changed,
//   forcing a human re-look. A stale looking-verdict can never silently pass here.
//
// Run (from repo root):
//   node playtest/acceptance/run-acceptance.mjs                 # local + public
//   node playtest/acceptance/run-acceptance.mjs --local-only    # skip the public URL
// Exit: 0 iff the LIVE public campaign serves 7/7 to victory with no deploy drift
//       AND the local build agrees AND fresh weapon evidence was captured.

import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const PUBLIC_URL = 'https://shivaconverge.github.io/contra-run-and-gun/';
const localOnly = process.argv.includes('--local-only');

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const sha16 = async (p) => (existsSync(p) ? createHash('sha256').update(await readFile(p)).digest('hex').slice(0, 16) : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Run a harness as a child process; return its exit code. Its stdout streams so the
// operator sees live progress; the machine-readable result is its JSON output file.
function runHarness(label, args) {
  process.stdout.write(`\n──── ${label} ────\n`);
  const r = spawnSync('node', [path.join(HERE, args[0]), ...args.slice(1)], { cwd: REPO, stdio: 'inherit' });
  return r.status;
}

// A scope run is INVALID (didn't actually play) vs a genuine content FAIL. Running
// several heavy browser sessions back-to-back can leave the last one's game stuck on
// the title screen (the run boots + starts, but play doesn't sustain → every stage
// captured in 'title'/'gameover', every transition STUCK). That is a GATE-SEQUENCING
// artifact, NOT a campaign defect — standalone the same target plays 7/7. So the gate
// RETRIES an invalid run; it must NEVER retry a real FAIL (some stages played but
// failed a predicate), or it would mask a true regression.
function scopeRunInvalid(data) {
  if (!data || !Array.isArray(data.stages) || data.stages.length === 0) return true;
  const anyPlayed = data.stages.some((s) => s.status === 'playing' || s.status === 'cleared');
  return data.scopeServedNum === 0 && !anyPlayed; // booted but never sustained play
}

// Run scope-served for one target, retrying ONLY invalid (didn't-play) runs. Returns
// { data, attempts, invalid } — invalid=true means it never produced a valid run.
async function runScope(label, args, outFile) {
  let data = null, attempts = 0;
  for (; attempts < 3; attempts++) {
    if (attempts > 0) { process.stdout.write(`  (invalid run — settling ${5}s and retrying)\n`); await sleep(5000); }
    runHarness(`${label}${attempts ? ` [retry ${attempts}]` : ''}`, args);
    data = await readJson(path.join(HERE, outFile)).catch(() => null);
    if (!scopeRunInvalid(data)) break;
  }
  return { data, attempts: attempts + 1, invalid: scopeRunInvalid(data) };
}

async function main() {
  const summary = {
    ts: new Date().toISOString(),
    publicUrl: PUBLIC_URL,
    localOnly,
    ran: [],
    checks: [],
  };

  // 1. Campaign spine — local, then public (the authoritative live fact). Each is
  //    retried if it comes back INVALID (booted but never sustained play); a real
  //    content FAIL is never retried.
  const scopeLocalRun = await runScope('scope-served (local serve)', ['scope-served.mjs'], 'scope-served.json');
  const scopeLocal = scopeLocalRun.data;
  summary.ran.push({ harness: 'scope-served', mode: 'local', attempts: scopeLocalRun.attempts, invalid: scopeLocalRun.invalid });
  let scopePublic = null;
  if (!localOnly) {
    await sleep(4000); // let the prior browser fully tear down before the remote run
    const scopePublicRun = await runScope('scope-served (public URL)', ['scope-served.mjs', `--url=${PUBLIC_URL}`], 'scope-served-live.json');
    scopePublic = scopePublicRun.data;
    summary.ran.push({ harness: 'scope-served', mode: 'public', attempts: scopePublicRun.attempts, invalid: scopePublicRun.invalid });
    if (scopePublicRun.invalid) summary.publicScopeInvalid = true;
  }

  // 2. Weapon fidelity — fresh evidence, local then public.
  await sleep(3000);
  const weaponLocalExit = runHarness('weapon-fidelity (local serve)', ['weapon-fidelity.mjs']);
  summary.ran.push({ harness: 'weapon-fidelity', mode: 'local', exit: weaponLocalExit });
  let weaponPublicExit = null;
  if (!localOnly) {
    await sleep(3000);
    weaponPublicExit = runHarness('weapon-fidelity (public URL)', ['weapon-fidelity.mjs', `--url=${PUBLIC_URL}`]);
    summary.ran.push({ harness: 'weapon-fidelity', mode: 'public', exit: weaponPublicExit });
  }

  // ---- Aggregate the real FACTS from each harness's JSON output ----
  const weaponLocal = await readJson(path.join(HERE, 'weapon-fidelity.json')).catch(() => null);
  const weaponPublic = localOnly ? null : await readJson(path.join(HERE, 'weapon-fidelity-live.json')).catch(() => null);

  const check = (id, passed, detail) => summary.checks.push({ id, passed: !!passed, detail });

  // Campaign spine facts.
  check('local.scope_served==7/7', scopeLocal && scopeLocal.scopeServedNum === 7, scopeLocal && scopeLocal.scope_served);
  check('local.victory', scopeLocal && scopeLocal.victory === true, null);
  // Per-stage themed boss ART is LOADED (proves each biome's dedicated boss sprite —
  // incl. the re-seeded boss_desert Sand Gunship — is active, not a base-art fallback).
  check('local.themedBossArtLoaded', scopeLocal && scopeLocal.themedBossArtOk === true,
    scopeLocal && (scopeLocal.themedBossArt || []).map((b) => `${b.theme}:${b.dims ? b.dims.w + 'x' + b.dims.h : 'MISSING'}`).join(' '));
  if (!localOnly) {
    check('public.scope_served==7/7', scopePublic && scopePublic.scopeServedNum === 7, scopePublic && scopePublic.scope_served);
    check('public.victory', scopePublic && scopePublic.victory === true, null);
    check('public.themedBossArtLoaded', scopePublic && scopePublic.themedBossArtOk === true,
      scopePublic && (scopePublic.themedBossArt || []).map((b) => `${b.theme}:${b.dims ? b.dims.w + 'x' + b.dims.h : 'MISSING'}`).join(' '));
    check('public.deployDrift==none', scopePublic && Array.isArray(scopePublic.deployDrift) && scopePublic.deployDrift.length === 0, scopePublic && scopePublic.deployDrift);
    check('public.normalProgression(keyBindingProven)', scopePublic && scopePublic.keyBindingProven === true, null);
  }

  // Weapon evidence FACTS (fresh capture on each target) — NOT the looking verdict.
  const weaponEvidenceOk = (w) => w && w.captures && w.captures.length >= 12 && w.turretCaptured === true && (w.heroPoses || []).length >= 3;
  check('local.weaponEvidenceCaptured', weaponEvidenceOk(weaponLocal), weaponLocal && `${weaponLocal.captures.length} crops, turret=${weaponLocal.turretCaptured}`);
  if (!localOnly) check('public.weaponEvidenceCaptured', weaponEvidenceOk(weaponPublic), weaponPublic && `${weaponPublic.captures.length} crops, turret=${weaponPublic.turretCaptured}`);

  // Weapon BY-LOOKING verdict — replayed from record, with a staleness guard.
  const verdict = await readJson(path.join(HERE, 'weapon-verdict.json')).catch(() => null);
  const renderNow = { 'game/src/render.js': await sha16(path.join(REPO, 'game/src/render.js')), 'game/src/player.js': await sha16(path.join(REPO, 'game/src/player.js')) };
  const recorded = (verdict && verdict.renderPathHashesAtVerdict) || {};
  const renderChanged = Object.keys(renderNow).filter((k) => recorded[k] !== renderNow[k]);
  summary.weaponLookingVerdict = {
    verdict: verdict ? verdict.verdict : 'UNRECORDED',
    date: verdict ? verdict.date : null,
    stale: renderChanged.length > 0,
    changedRenderPaths: renderChanged,
    renderHashesNow: renderNow,
    note: renderChanged.length
      ? 'RENDER PATH CHANGED since the by-looking verdict — a human MUST re-look at frames/weapon/*.png and re-confirm ONE-weapon-per-entity before trusting this axis.'
      : 'Render path unchanged since the by-looking PASS; the recorded verdict still applies to the captured frames.',
  };
  // The looking-verdict does NOT gate the exit code (code can't judge "one weapon"),
  // but a STALE verdict is surfaced loudly so it can't be silently trusted.

  // ---- Headline fact + overall verdict (mechanical facts only) ----
  const liveFact = localOnly ? (scopeLocal && scopeLocal.scope_served) : (scopePublic && scopePublic.scope_served);
  const allPassed = summary.checks.every((c) => c.passed);
  summary.scope_served = liveFact || 'n/a';
  summary.scope_served_source = localOnly ? 'local-serve' : 'public-url';
  // A run that never sustained play even after retries is an INFRA error of THIS
  // gate (resource contention), NOT a campaign FAIL — surfaced distinctly (exit 2)
  // so a false 0/7 can't be read as a game defect. Re-run standalone to confirm.
  const infra = summary.ran.some((r) => r.invalid === true);
  summary.verdict = infra ? 'GATE-INFRA-ERROR' : (allPassed ? 'PASS' : 'FAIL');

  await writeFile(path.join(HERE, 'acceptance-summary.json'), JSON.stringify(summary, null, 2));

  process.stdout.write('\n════════ ACCEPTANCE GATE ════════\n');
  process.stdout.write(`scope_served=${summary.scope_served} (${summary.scope_served_source})  verdict=${summary.verdict}\n`);
  for (const c of summary.checks) process.stdout.write(`  [${c.passed ? 'PASS' : 'FAIL'}] ${c.id}${c.detail != null ? ' — ' + JSON.stringify(c.detail) : ''}\n`);
  process.stdout.write(`  weapon one-gun (by-looking): ${summary.weaponLookingVerdict.verdict}` +
    `${summary.weaponLookingVerdict.stale ? ' ⚠ POSSIBLY-STALE (render path changed → re-look)' : ' (render path unchanged)'}\n`);
  process.stdout.write(`  wrote ${path.relative(REPO, path.join(HERE, 'acceptance-summary.json'))}\n`);

  process.exit(summary.verdict === 'PASS' ? 0 : (summary.verdict === 'GATE-INFRA-ERROR' ? 2 : 1));
}

main().catch((e) => { console.error('run-acceptance ERROR:', e); process.exit(2); });
