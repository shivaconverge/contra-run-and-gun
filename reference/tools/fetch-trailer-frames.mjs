#!/usr/bin/env node
// fetch-trailer-frames.mjs -- ground competitor MOTION (CAP-2) by frame-grabbing
// OFFICIAL Steam store trailers. Steam serves each title's trailer as HLS/DASH via the
// appdetails `movies` API; ffmpeg reads the HLS .m3u8 directly and samples frames.
//
// HONEST SCOPE: trailers are EDITED (cuts, unknown zoom/scroll/framerate), so they ground
// hit-FEEDBACK / weapon-JUICE / explosion-scale / boss-composition IN MOTION (dims 2 & 4)
// and rough enemy density — but NOT precise movement cadence (dim 3 px/frame), which needs
// same-scale in-engine capture. Curate the gameplay frames by LOOKING; discard title cards.
//
// USAGE:
//   node reference/tools/fetch-trailer-frames.mjs --app 609110 --out /tmp/bc --fps 1 --n 110
// then look at the frames, copy the gameplay ones into reference/frames/<slug>/motion/.
// Needs: ffmpeg on PATH + Node 18 (global fetch). No npm deps.

import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/149.0 Safari/537.36';

function args() {
  const a = { app: null, out: null, fps: '1', n: '110', movie: 0 };
  const v = process.argv;
  for (let i = 2; i < v.length; i++) {
    if (v[i] === '--app') a.app = v[++i];
    else if (v[i] === '--out') a.out = v[++i];
    else if (v[i] === '--fps') a.fps = v[++i];
    else if (v[i] === '--n') a.n = v[++i];
    else if (v[i] === '--movie') a.movie = +v[++i];
  }
  if (!a.app || !a.out) { console.error('need --app <appid> --out <dir>'); process.exit(2); }
  return a;
}

async function main() {
  const a = args();
  await mkdir(a.out, { recursive: true });
  const r = await fetch(
    `https://store.steampowered.com/api/appdetails?appids=${a.app}&filters=movies&l=english`,
    { headers: { 'User-Agent': UA } });
  const j = await r.json();
  const d = j[a.app];
  if (!d || !d.success) { console.error('appdetails failed'); process.exit(1); }
  const movies = d.data.movies || [];
  if (!movies.length) { console.error('no movies for this app'); process.exit(1); }
  const mv = movies[a.movie] || movies[0];
  const hls = mv.hls_h264;
  console.log(`[trailer] app=${a.app} movie="${mv.name}"`);
  console.log(`[trailer] hls=${hls}`);
  const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-user_agent', UA,
    '-i', hls, '-vf', `fps=${a.fps},scale=640:-1`,
    `${a.out}/f_%03d.png`], { encoding: 'utf8' });
  if (ff.status !== 0) { console.error(ff.stderr || 'ffmpeg failed'); process.exit(1); }
  console.log(`[trailer] frames -> ${a.out}/f_*.png (look, then curate gameplay frames)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
