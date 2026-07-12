// harness.mjs — shared infrastructure for the LIVE cold-load / frame-pacing perf seat.
//
// This is the PERF seat (root.I). Unlike the e2e playthrough (which drives the
// LOCAL served tree), the perf harness drives the ACTUAL PUBLIC DEPLOYMENT
// (deploy/PUBLIC-URL.txt) over the real network with a COLD browser cache — the
// only way to measure what a first-time player's device actually downloads and
// paints. CV/byte metrics here are FACTS (encodedDataLength over the wire, rAF
// deltas from a page-side recorder); the fidelity verdict lives elsewhere.

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HERE = path.dirname(fileURLToPath(import.meta.url));
// playtest/perf -> playtest -> repo-root (worktree). PUBLIC-URL lives in deploy/.
export const REPO_ROOT = path.resolve(HERE, '..', '..');

export function liveUrl() {
  const f = path.join(REPO_ROOT, 'deploy', 'PUBLIC-URL.txt');
  const raw = readFileSync(f, 'utf8');
  // File may carry a comment line; take the first http(s) token.
  const m = raw.match(/https?:\/\/\S+/);
  if (!m) throw new Error(`No URL in ${f}`);
  return m[0].replace(/\/+$/, '') + '/';
}

// Prefer the full Chrome (real network stack, Navigation Timing L2, CDP heap).
export function findChrome() {
  const cands = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  const cache = path.join(os.homedir(), '.cache', 'puppeteer');
  for (const kind of ['chrome', 'chrome-headless-shell']) {
    const base = path.join(cache, kind);
    if (existsSync(base)) {
      try {
        const h = execSync(`ls -d ${base}/*/*/ 2>/dev/null`).toString().trim().split('\n');
        for (const dir of h) {
          for (const bin of ['Google Chrome for Testing', 'chrome', 'chrome-headless-shell']) {
            const p = path.join(dir, bin);
            if (existsSync(p)) cands.push(p);
          }
        }
      } catch { /* ignore */ }
    }
  }
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error('No Chrome binary found');
}

export function loadPuppeteer() {
  return require('puppeteer-core');
}

// ---------------------------------------------------------------------------
// Stage → biome mapping (from game/data/config.js CAMPAIGN order). Stage 1 is
// the ONLY biome a cold visitor needs to see the first playable frame; every
// byte fetched for stages 2..7 upfront is "deferred-eligible" — it could be
// lazy-loaded on stage entry instead of blocking boot. This mapping is the
// analytical core of the lazy-load verdict.
// ---------------------------------------------------------------------------
export const STAGE_BIOME = [
  { stage: 1, biome: 'jungle', name: 'Jungle Approach' },
  { stage: 2, biome: 'cascade', name: 'Cascade Base' },
  { stage: 3, biome: 'snow', name: 'Frozen Ridge' },
  { stage: 4, biome: 'desert', name: 'Scorched Dunes' },
  { stage: 5, biome: 'foundry', name: 'Iron Foundry' },
  { stage: 6, biome: 'caverns', name: 'Crystal Caverns' },
  { stage: 7, biome: 'fortress', name: 'Red Falcon Keep' },
];

// Biome keywords that belong to STAGE 1's art (jungle approach crosses a
// bridge/river, so bridge+water tiles ship with stage 1). Everything else that
// carries a stages-2..7 biome keyword is deferred-eligible.
const STAGE1_BIOME_WORDS = ['jungle', 'bridge', 'water'];
const LATER_BIOME_WORDS = ['cascade', 'snow', 'desert', 'foundry', 'caverns', 'fortress'];

// Classify a served asset URL into { kind, biome, stageNeeded, deferrable }.
//   kind: tileset | boss | background | decor | music | sprite | code | html | data | other
//   stageNeeded: earliest campaign stage that needs it (1 = boot-critical), or null (shared/unknown → treated as boot-critical)
//   deferrable: true if it belongs to a stage-2..7 biome and could be lazy-loaded on stage entry
export function classifyAsset(url) {
  const u = url.toLowerCase();
  const file = u.split('?')[0].split('/').pop() || u;
  const ext = file.includes('.') ? file.split('.').pop() : '';

  let kind = 'other';
  if (/\.(js|mjs)$/.test(file)) kind = 'code';
  else if (/\.html?$/.test(file)) kind = 'html';
  else if (/\.json$/.test(file)) kind = 'data';
  else if (ext === 'mp3' || ext === 'wav' || ext === 'ogg' || u.includes('/tracks/') || u.includes('/audio/')) kind = 'music';
  else if (file.startsWith('theme_') || file === 'tiles.png') kind = 'tileset';
  else if (file.startsWith('boss_') || file === 'boss.png' || file.startsWith('chopper')) kind = 'boss';
  else if (file.startsWith('bg_')) kind = 'background';
  else if (file.startsWith('decor_')) kind = 'decor';
  else if (/\.png$/.test(file)) kind = 'sprite';

  // Biome detection from the filename / track name.
  let biome = null;
  for (const w of [...STAGE1_BIOME_WORDS, ...LATER_BIOME_WORDS]) {
    if (file.includes(w)) { biome = w; break; }
  }
  // s2_..s7_ music prefixes map to campaign stage directly.
  const sm = file.match(/(?:^|[^0-9])s([1-7])[_-]/);
  const stageFromPrefix = sm ? Number(sm[1]) : null;

  let stageNeeded = null;
  let deferrable = false;
  if (stageFromPrefix) {
    stageNeeded = stageFromPrefix;
    deferrable = stageFromPrefix > 1;
  } else if (biome) {
    const entry = STAGE_BIOME.find((s) => s.biome === biome) ||
      (STAGE1_BIOME_WORDS.includes(biome) ? { stage: 1 } : null);
    stageNeeded = entry ? entry.stage : 1;
    deferrable = LATER_BIOME_WORDS.includes(biome);
  } else {
    // Shared/common asset (player, grunt, turret, explosion, muzzle, pickup,
    // tiles, code, html, generic boss/chopper). Needed at boot → not deferrable.
    stageNeeded = 1;
    deferrable = false;
  }
  // Generic (non-biome) boss/chopper sprites are the stage-1/2 chopper boss — keep boot-critical.
  return { kind, biome, stageNeeded, deferrable };
}

// Reference network profiles. "mobile" = Lighthouse's simulated Slow-4G + 4x CPU
// (RTT 150ms, 1.6 Mbit/s down, 750 Kbit/s up) — the standard mobile-perf baseline.
export const PROFILES = {
  desktop: { cpu: 1, net: null, viewport: { width: 960, height: 540 } },
  mobile: {
    cpu: 4,
    net: { latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, offline: false },
    viewport: { width: 412, height: 732, isMobile: true, deviceScaleFactor: 2 },
  },
};

// Budget for a 480x270 browser run-and-gun. These are the machine-checked
// thresholds the report grades against. Rationale documented in BUDGET.md.
export const BUDGET = {
  // Cold first-paint payload a first-time player downloads BEFORE the first
  // playable frame. A lean 2D run-and-gun should boot well under this.
  coldPayloadBytes: 3.5 * 1024 * 1024,        // 3.5 MB hard ceiling
  coldPayloadWarnBytes: 2.0 * 1024 * 1024,    // 2.0 MB warn
  // Time-to-first-playable-frame on the MOBILE profile (throttled). Above this
  // a cold mobile visitor stares at a black canvas too long.
  ttffMobileMs: 6000,
  ttffMobileWarnMs: 3500,
  ttffDesktopMs: 2500,
  // Frame pacing vs the reference-corpus 60fps bar.
  minMedianFps: 58,
  maxDroppedFrac: 0.05,       // ≤5% of frames may exceed 1.5x the 16.67ms budget
  // JS heap growth over a sustained sample (leak guard).
  maxHeapGrowthMB: 8,
  // If deferrable (stages 2..7) bytes exceed this fraction of cold payload,
  // per-stage lazy-loading is REQUIRED, not merely nice-to-have.
  deferrableFracRequiresLazy: 0.45,
  // Resident DECODED-audio RAM. All 7 tracks decode to float32 PCM AudioBuffers
  // (native audio memory). A 480x270 tab — especially on mobile, where the OS
  // kills tabs around 200-400MB — must not hold the whole campaign's audio at
  // once. One-track-at-a-time is the target.
  maxDecodedAudioMB: 128,       // hard: above this the campaign audio blows the tab budget
  warnDecodedAudioMB: 80,       // warn: a comfortable one-to-two-track ceiling
};

export function fmtBytes(n) {
  if (n == null) return 'n/a';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
