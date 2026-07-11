// feedback/lib/artifact-hash.mjs — deterministic content fingerprint of the
// SHIPPED game artifact (the bytes a player actually receives). Used by the
// release gate to BIND a creator approval to the exact build it was given, so a
// stale approval of build A cannot green-light a changed build B — closing the
// buildId='dev' staleness hole (FINDINGS OI-2) on the CONSUMER side, without
// needing the in-browser window.__buildId fix.
//
// Fingerprint = sha256 over sorted (relativePath \0 sha256(fileBytes)) lines for
// every file under the served tree (default: game/), excluding node_modules and
// dotfiles. Stable across machines and runs; any byte change to any shipped file
// flips the hash.

import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const SKIP_DIRS = new Set(['node_modules', '.git']);

async function walk(dir, base, out) {
  const ents = await readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    if (e.name.startsWith('.')) continue;         // skip dotfiles/dirs
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      await walk(abs, base, out);
    } else if (e.isFile()) {
      out.push([path.relative(base, abs), abs]);
    }
  }
}

// Returns { hash, fileCount, files:[{path, sha}] }. `files` is sorted by path.
export async function computeArtifactHash(root) {
  const st = await stat(root);
  if (!st.isDirectory()) throw new Error(`artifact root is not a directory: ${root}`);
  const found = [];
  await walk(root, root, found);
  found.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const files = [];
  const top = createHash('sha256');
  for (const [rel, abs] of found) {
    const sha = createHash('sha256').update(await readFile(abs)).digest('hex');
    top.update(rel, 'utf8').update('\0').update(sha).update('\n');
    files.push({ path: rel, sha });
  }
  return { hash: top.digest('hex'), fileCount: files.length, files };
}
