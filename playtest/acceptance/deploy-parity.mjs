// deploy-parity.mjs — the FULL-COVERAGE stale-serve / content-hash guard.
//
// The mandate requires "guard against the known stale-serve hazard … verify content
// hash." scope-served's `deployDrift` only hashes 5 core files (index.html,
// src/main.js, data/config.js, data/level1.js, assets/audio/manifest.json) — so it
// CANNOT prove the per-stage biome art (tilesets, boss/decor sprites, level 2–7
// data, music) on the live URL matches the worktree. A stage's `theme_snow.png`
// could be stale/absent on the deploy while all 5 core files match, and deployDrift
// would still read "none". This harness closes that: it enumerates the COMPLETE
// served surface — every ASSET_MANIFEST sprite, every src/ + data/ module,
// index.html, and every audio track — fetches each off the PUBLIC URL, content-hashes
// it, and diffs byte-for-byte against the worktree. One machine-readable fact:
// deploy is byte-current N/M, plus the exact list of drifted / missing files.
//
// This is a FAST, DETERMINISTIC check (HTTP GET + sha256, no browser, no playthrough)
// — so unlike the flaky live playthrough it gives a rock-solid "the LIVE deploy IS
// this worktree, across every stage's art" fact that backs scope_served's
// live-parity claim (obs_live_claimed_zero_scope_served) far more completely than the
// 5-file deployDrift.
//
// Run (from repo root):
//   node playtest/acceptance/deploy-parity.mjs
//   node playtest/acceptance/deploy-parity.mjs --url=<public URL>
// Emits: playtest/acceptance/deploy-parity.json ; exit 0 iff every served file matches.

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const GAME_DIR = path.join(REPO, 'game');
const DEFAULT_URL = 'https://shivaconverge.github.io/contra-run-and-gun/';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

// Build the COMPLETE list of game-relative paths the deploy must serve: every module
// (index.html + src/*.js + data/*.js), every ASSET_MANIFEST sprite, and every audio
// track named in the audio manifest. De-duped and sorted for a stable report.
async function collectServedPaths() {
  const rels = new Set(['index.html']);
  for (const dir of ['src', 'data']) {
    for (const f of await readdir(path.join(GAME_DIR, dir))) if (f.endsWith('.js') || f.endsWith('.mjs')) rels.add(`${dir}/${f}`);
  }
  // Sprite manifest — imported from the real game module so it never drifts from the build.
  const { ASSET_MANIFEST } = await import(path.join(GAME_DIR, 'data', 'assets.js'));
  for (const p of Object.values(ASSET_MANIFEST)) rels.add(p);
  // Audio: the manifest itself + every track file it references.
  const audioManRel = 'assets/audio/manifest.json';
  rels.add(audioManRel);
  try {
    const man = JSON.parse(await readFile(path.join(GAME_DIR, audioManRel), 'utf8'));
    for (const t of Object.values(man.tracks || {})) {
      const file = (t.file || '').split('/').pop();
      if (file) rels.add(`assets/audio/${file}`);
    }
  } catch { /* no audio manifest → skip tracks */ }
  return [...rels].sort();
}

async function fetchRemote(base, rel) {
  try {
    const res = await fetch(base + rel, { cache: 'no-store' });
    if (!res.ok) return { httpStatus: res.status, remoteSha: null };
    const buf = Buffer.from(await res.arrayBuffer());
    return { httpStatus: res.status, remoteSha: sha(buf), bytes: buf.length };
  } catch (e) { return { httpStatus: 0, remoteSha: null, error: String(e) }; }
}

async function main() {
  const urlArg = process.argv.find((a) => a.startsWith('--url='));
  const base0 = urlArg ? urlArg.slice(6) : (process.env.ACCEPT_URL || DEFAULT_URL);
  const base = base0.endsWith('/') ? base0 : base0 + '/';

  const rels = await collectServedPaths();
  const files = [];
  // Fetch in small batches so we don't hammer the CDN or exhaust sockets.
  const BATCH = 8;
  for (let i = 0; i < rels.length; i += BATCH) {
    const chunk = rels.slice(i, i + BATCH);
    const results = await Promise.all(chunk.map(async (rel) => {
      const entry = { rel };
      const localPath = path.join(GAME_DIR, rel);
      entry.localSha = existsSync(localPath) ? sha(await readFile(localPath)) : null;
      const r = await fetchRemote(base, rel);
      entry.httpStatus = r.httpStatus; entry.remoteSha = r.remoteSha; if (r.error) entry.error = r.error;
      entry.match = !!entry.localSha && entry.localSha === entry.remoteSha;
      return entry;
    }));
    files.push(...results);
  }

  const drifted = files.filter((f) => f.localSha && f.remoteSha && !f.match).map((f) => f.rel);
  const missingRemote = files.filter((f) => f.localSha && !f.remoteSha).map((f) => ({ rel: f.rel, http: f.httpStatus }));
  const localOnly = files.filter((f) => !f.localSha).map((f) => f.rel); // manifest entry not on disk
  const matched = files.filter((f) => f.match).length;

  const report = {
    ts: new Date().toISOString(),
    target: base,
    totalServed: files.length,
    matched,
    byteCurrent: `${matched}/${files.length}`,
    drifted,              // served but bytes differ from worktree (STALE deploy → re-deploy, C)
    missingRemote,        // in the build but NOT served on the live URL (missing asset → C/B)
    localOnlyManifest: localOnly,
    verdict: drifted.length === 0 && missingRemote.length === 0 ? 'BYTE-CURRENT' : 'DRIFT',
    // Keep the full per-file table for evidence (short shas).
    files: files.map((f) => ({ rel: f.rel, local: f.localSha && f.localSha.slice(0, 12), remote: f.remoteSha && f.remoteSha.slice(0, 12), http: f.httpStatus, match: f.match })),
  };

  await writeFile(path.join(HERE, 'deploy-parity.json'), JSON.stringify(report, null, 2));
  console.log(`deploy-parity ${report.byteCurrent} byte-current  verdict=${report.verdict}  target=${base}`);
  if (drifted.length) console.log(`  DRIFTED (stale on deploy): ${drifted.join(', ')}`);
  if (missingRemote.length) console.log(`  MISSING on deploy: ${missingRemote.map((m) => `${m.rel}(${m.http})`).join(', ')}`);
  if (localOnly.length) console.log(`  manifest entries not on disk (won't ship): ${localOnly.join(', ')}`);
  console.log(`  wrote ${path.relative(REPO, path.join(HERE, 'deploy-parity.json'))}`);
  process.exit(report.verdict === 'BYTE-CURRENT' ? 0 : 1);
}

main().catch((e) => { console.error('deploy-parity ERROR:', e); process.exit(2); });
