#!/usr/bin/env node
// GO-LIVE: zero-dependency static server for the vertical slice. This makes the
// deliverable "served locally / reachable by real players" with ONE command
// (`node serve.mjs` or `npm start`) and no toolchain beyond Node — no Python, no
// build step. It serves THIS directory (the game/ static root) so it works both
// from inside game/ and as `node game/serve.mjs` from the repo root.
//
//   node serve.mjs            # serves on http://localhost:8080
//   node serve.mjs 3000       # custom port
//   PORT=3000 node serve.mjs  # custom port via env
//
// If the chosen port is busy it auto-increments (up to +20) so a stale server
// never blocks go-live.

import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url)); // the game/ dir
const START_PORT = parseInt(process.argv[2] || process.env.PORT || '8080', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
};

// Resolve a request path to a real file inside ROOT (blocks path traversal).
function resolveSafe(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const abs = path.normalize(path.join(ROOT, rel));
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null; // escaped root
  return abs;
}

const server = http.createServer(async (req, res) => {
  try {
    let abs = resolveSafe(req.url || '/');
    if (!abs) { res.writeHead(403).end('403 Forbidden'); return; }
    let stat;
    try { stat = await fs.stat(abs); } catch { res.writeHead(404).end('404 Not Found'); return; }
    if (stat.isDirectory()) { abs = path.join(abs, 'index.html'); }
    const body = await fs.readFile(abs);
    const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': body.length,
      'Cache-Control': 'no-cache', // always serve the freshest build
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end('500 ' + (err && err.message));
  }
});

function listen(port, attemptsLeft) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
    } else {
      console.error('serve.mjs failed:', err.message);
      process.exit(1);
    }
  });
  server.listen(port, () => {
    console.log(`RUN & GUN — serving ${ROOT}`);
    console.log(`  ▶ http://localhost:${port}/   (Ctrl-C to stop)`);
  });
}

listen(START_PORT, 20);
