// harness.mjs — shared infrastructure for the LIVE end-to-end playtest:
//   - a zero-dep static HTTP server that serves the real game/ tree
//   - a Chrome locator + puppeteer-core loader (reuses the reference/tools pattern)
//
// This is the QA seat: we drive the ACTUAL browser build with REAL keyboard
// events (KeyboardInput backend, live rAF loop) — NOT the deterministic
// ?headless= sim harness the art/engine loops use for capture. That is the
// whole point of grounding: exercise what a first-time player's fingers do.

import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HERE = path.dirname(fileURLToPath(import.meta.url));
// playtest/e2e -> repo root -> game/
export const GAME_DIR = path.resolve(HERE, '..', '..', 'game');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

// Serve the real game/ directory. Returns { url, close }. Modules resolve
// (index.html -> ./src/main.js -> ../data/config.js) because root === game/.
export async function serveGame(root = GAME_DIR) {
  const server = createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (rel === '/' || rel === '') rel = '/index.html';
      const full = path.join(root, path.normalize(rel));
      if (!full.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
      const body = await readFile(full);
      res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

export function findChrome() {
  const cands = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  const cache = path.join(os.homedir(), '.cache', 'puppeteer');
  for (const kind of ['chrome-headless-shell', 'chrome']) {
    const base = path.join(cache, kind);
    if (existsSync(base)) {
      try {
        const h = execSync(`ls ${base}/*/*/${kind}* 2>/dev/null | head -1`).toString().trim();
        if (h) cands.push(h);
      } catch { /* ignore */ }
    }
  }
  for (const c of cands) if (existsSync(c)) return c;
  throw new Error('No Chrome binary found');
}

export function loadPuppeteer() {
  return require('puppeteer-core');
}
