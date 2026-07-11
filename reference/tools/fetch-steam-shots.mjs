#!/usr/bin/env node
// fetch-steam-shots.mjs -- seed the corpus with OFFICIAL in-game screenshots of
// competitor run-and-gun titles from the Steam store (appdetails API). These are
// developer-published gameplay stills: legit, high-fidelity comparanda for the
// visual dimensions (sprite/animation quality, palette, HUD, enemy density).
//
// HONEST SCOPE: stills, not motion. They ground dimensions 1/4/5 (look/density) but
// NOT 2/3 (hit-stop snap, movement cadence) -- those still need footage/live capture.
//
// USAGE:
//   node reference/tools/fetch-steam-shots.mjs \
//     --out reference/frames --n 3 \
//     716010:blazing-chrome-2019 598550:huntdown-2020 2235020:contra-operation-galuga-2024
//
// Each title id:slug downloads up to --n screenshots to <out>/<slug>/ plus a
// capture.json recording the Steam appid, canonical name, source URLs, and the
// CDN asset timestamp -- so every frame is traceable and reproducible.
// Needs only Node 18+ (global fetch); no npm deps.

import { mkdir, writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/149.0 Safari/537.36';

function parseArgs(argv) {
  const a = { out: 'reference/frames', n: 3, titles: [] };
  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--out') a.out = argv[++i];
    else if (t === '--n') a.n = parseInt(argv[++i], 10);
    else if (t.includes(':')) {
      const [id, ...rest] = t.split(':');
      a.titles.push({ id, slug: rest.join(':') });
    }
  }
  if (!a.titles.length) { console.error('give at least one appid:slug'); process.exit(2); }
  return a;
}

async function getJson(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function main() {
  const a = parseArgs(process.argv);
  for (const { id, slug } of a.titles) {
    const dir = path.join(a.out, slug);
    await mkdir(dir, { recursive: true });
    let data;
    try {
      const j = await getJson(
        `https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic,screenshots&l=english`);
      if (!j[id] || !j[id].success) throw new Error('appdetails success=false');
      data = j[id].data;
    } catch (e) { console.log(`[skip] ${slug} (${id}): ${e.message}`); continue; }

    const shots = (data.screenshots || []).slice(0, a.n);
    const prov = { title: data.name, steam_appid: +id, slug,
                   source: 'Steam store appdetails (official developer screenshots)',
                   note: 'STILLS not motion: grounds visual dims (sprite/palette/density), not cadence/hit-stop.',
                   shots: [] };
    for (let i = 0; i < shots.length; i++) {
      const url = shots[i].path_full;
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        const file = path.join(dir, `shot-${String(i).padStart(2, '0')}.jpg`);
        await writeFile(file, buf);
        prov.shots.push({ i, file: path.basename(file), url, bytes: buf.length });
        console.log(`[ok] ${slug} shot ${i} (${buf.length} B) <- ${url.split('?')[0].split('/').pop()}`);
      } catch (e) { console.log(`[fail] ${slug} shot ${i}: ${e.message}`); }
    }
    await writeFile(path.join(dir, 'capture.json'), JSON.stringify(prov, null, 2));
    console.log(`[done] ${slug} -> ${dir} (${prov.shots.length} shots, "${data.name}")`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
