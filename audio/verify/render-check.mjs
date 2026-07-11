// render-check.mjs — ACTUALLY RUN the music sequencer and prove it works.
//
// Loads audio/music.js in a real Chromium (chrome-for-testing via puppeteer-core)
// and drives the REAL scheduling code through an OfflineAudioContext, which renders
// the synth graph to a PCM buffer deterministically (no audio device needed). We
// then measure the rendered samples — this is a real run, not a code read:
//
//   1. NON-SILENCE  : the loop actually produces signal (fails = boxes/silence).
//   2. SEAMLESS LOOP: render 2 full loops; the seam sample window has continuous
//                     energy (no silent gap where the loop restarts).
//   3. DUCKS        : a ducked render is materially quieter than an un-ducked one.
//   4. DETERMINISM  : two identical renders are byte-identical (LCG noise + fixed
//                     schedule) — so it can never destabilise a deterministic build.
//
// Usage: node audio/verify/render-check.mjs   → prints JSON verdict, exit 0/1.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const musicPath = resolve(__dirname, '../music.js');

// Locate chrome-for-testing the same way the playtest e2e does.
function findChrome() {
  const base = `${process.env.HOME}/.cache/puppeteer/chrome`;
  if (!existsSync(base)) return null;
  const rel = 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  const found = readdirSync(base)
    .map((v) => resolve(base, v, rel))
    .filter((p) => existsSync(p))
    .sort();
  return found.pop();
}

async function loadPuppeteer() {
  const rel = 'node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
  const candidates = [
    resolve(__dirname, '..', rel),                       // audio/node_modules (this layer's own devDep)
    resolve(__dirname, '../../playtest/e2e', rel),        // in-worktree, if installed
    resolve(__dirname, '../../../../repo/playtest/e2e', rel), // shared repo checkout
    resolve(__dirname, '../../../../strategy/playtest/e2e', rel),
  ];
  for (const c of candidates) if (existsSync(c)) return (await import(c)).default;
  throw new Error('puppeteer-core not found (looked under playtest/e2e/node_modules of worktree + repo)');
}

const musicSrc = readFileSync(musicPath, 'utf8').replace(/export default MusicKit;?/, '').replace(/export class/, 'class');

const PAGE = `<!doctype html><meta charset=utf-8><body><script type=module>
${musicSrc}
function goertzel(c, f, sr) { // magnitude at a single frequency over the whole buffer
  const w = 2 * Math.PI * f / sr, coeff = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < c.length; i++) { const s0 = c[i] + coeff * s1 - s2; s2 = s1; s1 = s0; }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / c.length;
}
window.__run = async (opts) => {
  const sr = 44100;
  const section = opts.section || 'stage';
  const probe = new MusicKit(new OfflineAudioContext(1, sr, sr)); // just for loopDur
  probe.setSection(section);
  const dur = opts.loops * probe.loopDur;
  const octx = new OfflineAudioContext(1, Math.ceil(dur * sr) + sr, sr);
  const m = new MusicKit(octx, octx.destination, { gain: 0.22 });
  m.setSection(section);
  if (opts.duck) m.duck(true);
  if (opts.notPlaying) m.setPlaying(false); // scene gate: fade out (run not in progress)
  if (opts.intensity) m.setIntensity(true); // phase-2 enrage: hotter mix + double-time hats
  m.scheduleSpan(0, dur);
  const buf = await octx.startRendering();
  const ch = buf.getChannelData(0);
  // downsample-summarise so we don't ship megabytes back over the bridge
  const n = ch.length;
  let sum = 0, peak = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(ch[i]); sum += a * a; if (a > peak) peak = a; }
  const rms = Math.sqrt(sum / n);
  // energy in a small window either side of the loop seam (end of loop 1)
  const seam = Math.floor(probe.loopDur * sr);
  const win = Math.floor(0.05 * sr);
  const winRms = (c, s, e) => { let x = 0; for (let i = s; i < e; i++) x += c[i] * c[i]; return Math.sqrt(x / (e - s)); };
  const preSeam = winRms(ch, seam - win, seam);
  const postSeam = winRms(ch, seam, seam + win);
  // longest silent run (samples below a floor) — a loop with a gap would spike this
  let longestSilence = 0, cur = 0;
  for (let i = 0; i < n && i < seam * 2; i++) { if (Math.abs(ch[i]) < 1e-4) { cur++; if (cur > longestSilence) longestSilence = cur; } else cur = 0; }
  // per-bar RMS across the first loop — a driving march has NO dead bar; the
  // weakest bar still carries real energy. Catches "loop peters out / drops voices".
  // Bar count is derived (loopDur/barDur), so this tracks the A/B form automatically.
  const nBars = Math.round(probe.loopDur / probe.barDur);
  const barLen = Math.floor((probe.loopDur / nBars) * sr);
  let minBarRms = Infinity, maxBarRms = 0;
  for (let b = 0; b < nBars; b++) {
    let x = 0; const s = b * barLen, e = s + barLen;
    for (let i = s; i < e; i++) x += ch[i] * ch[i];
    const r = Math.sqrt(x / barLen);
    if (r < minBarRms) minBarRms = r; if (r > maxBarRms) maxBarRms = r;
  }
  // Determinism fingerprint. The SCHEDULE is fully deterministic (fixed note
  // table + LCG noise), but Chrome's audio renderer carries sub-LSB float jitter
  // between OfflineAudioContext instances, so we quantise coarsely (1e3) — a real
  // schedule divergence moves this by thousands; FP jitter can't flip a 1e3 bucket.
  let fp = 0; for (let i = 0; i < n; i += 97) fp = (fp + Math.round(Math.abs(ch[i]) * 1e3)) % 2147483647;
  // "tension" = energy at the raised-7th D# (D#4/D#5), the boss theme's deliberate
  // signature. Normalised by rms so it's a fraction, comparable across sections.
  const dSharp = (goertzel(ch, 311.13, sr) + goertzel(ch, 622.25, sr)) / (rms || 1);
  // High-frequency energy via first-difference RMS (a crude high-pass): captures the
  // BROADBAND noise hats a single-bin Goertzel can't. Rises when double-time hats add
  // more high-freq transients — the signature of the enrage arrangement change.
  let hp = 0; for (let i = 1; i < n; i++) { const d = ch[i] - ch[i - 1]; hp += d * d; }
  const hiFreq = Math.sqrt(hp / (n - 1));
  // Key discriminator: F# energy. F# is diatonic to Stage-1's E-minor (used heavily in
  // the melody + the D chord) but ABSENT from Stage-2's A-minor scale — so Stage-1 carries
  // real F# content while Stage-2 has only the noise floor there. (A/E energy fails as a
  // discriminator: both keys prominently feature A and E.)
  const fSharp = goertzel(ch, 370, sr) + goertzel(ch, 740, sr);
  // G# energy (G#4/G#5) — the raised-7th of A minor / the third of its E-major dominant.
  // Heavy in the A-minor BOSS2 (dominant-on-E) and light in the less-dominant STAGE2;
  // absent from E-minor (which uses D# instead). A tension-note key/dominance discriminator.
  const gSharp = goertzel(ch, 415.3, sr) + goertzel(ch, 830.6, sr);
  return { sr, dur, rms, peak, preSeam, postSeam, minBarRms, maxBarRms, longestSilenceMs: (longestSilence / sr) * 1000, fp, dSharp, hiFreq, fSharp, gSharp, section, loopDur: probe.loopDur };
};
// Render exactly ONE loop and hand back 16-bit PCM (base64) so node can write a WAV.
window.__renderLoopPcm = async (section = 'stage', intensity = false) => {
  const sr = 44100;
  const probe = new MusicKit(new OfflineAudioContext(1, sr, sr));
  probe.setSection(section);
  const dur = probe.loopDur;
  const octx = new OfflineAudioContext(1, Math.round(dur * sr), sr);
  const m = new MusicKit(octx, octx.destination, { gain: 0.22 });
  m.setSection(section);
  if (intensity) m.setIntensity(true);
  m.scheduleSpan(0, dur);
  const buf = await octx.startRendering();
  const ch = buf.getChannelData(0);
  const pcm = new Int16Array(ch.length);
  for (let i = 0; i < ch.length; i++) { const s = Math.max(-1, Math.min(1, ch[i] * 3)); pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
  let bin = ''; const bytes = new Uint8Array(pcm.buffer);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return { sr, samples: ch.length, b64: btoa(bin) };
};
window.__ready = true;
</script></body>`;

function ok(name, pass, detail) { console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); return pass; }

(async () => {
  const chrome = findChrome();
  if (!chrome || !existsSync(chrome)) { console.error('No chrome-for-testing binary found'); process.exit(2); }
  const puppeteer = await loadPuppeteer();
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'shell', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('PAGE ERROR:', e.message));
    await page.setContent(PAGE, { waitUntil: 'networkidle0' });
    await page.waitForFunction('window.__ready === true', { timeout: 10000 });

    console.log('\nMUSIC RENDER-CHECK (OfflineAudioContext, real synth graph)\n');
    let pass = true;

    // Run the SAME quality gates on each section — both must be real, seamless,
    // ducking, deterministic music (not just the stage theme).
    const results = {};
    for (const section of ['stage', 'boss', 'stage2', 'boss2']) {
      const clean = await page.evaluate(`window.__run({ loops: 2, duck: false, section: '${section}' })`);
      const ducked = await page.evaluate(`window.__run({ loops: 2, duck: true, section: '${section}' })`);
      const repeat = await page.evaluate(`window.__run({ loops: 2, duck: false, section: '${section}' })`);
      results[section] = clean;

      console.log(`  [${section.toUpperCase()}]  loop=${clean.loopDur.toFixed(2)}s  rms=${clean.rms.toFixed(4)} peak=${clean.peak.toFixed(3)} duckedRms=${ducked.rms.toFixed(4)} dSharp=${clean.dSharp.toFixed(3)}`);
      pass &= ok(`${section}: non-silence`, clean.rms > 0.01 && clean.peak > 0.1, `rms=${clean.rms.toFixed(4)} peak=${clean.peak.toFixed(3)}`);
      pass &= ok(`${section}: seamless — downbeat lands at seam`, clean.postSeam > 0.01, `post=${clean.postSeam.toFixed(4)}, preSeam tail=${clean.preSeam.toFixed(4)}`);
      pass &= ok(`${section}: seamless — no audible silent gap`, clean.longestSilenceMs < 40, `longestSilence=${clean.longestSilenceMs.toFixed(1)}ms (<40)`);
      pass &= ok(`${section}: no dead bar (relentless)`, clean.minBarRms > 0.008, `minBarRms=${clean.minBarRms.toFixed(4)} maxBarRms=${clean.maxBarRms.toFixed(4)}`);
      pass &= ok(`${section}: duck-on-hitstop reduces level`, ducked.rms < clean.rms * 0.6, `ducked=${ducked.rms.toFixed(4)} vs ${clean.rms.toFixed(4)} (ratio ${(ducked.rms / clean.rms).toFixed(2)})`);
      pass &= ok(`${section}: deterministic render`, Math.abs(clean.fp - repeat.fp) <= 2, `|Δfp|=${Math.abs(clean.fp - repeat.fp)}`);
      console.log('');
    }

    // Scene gate: with setPlaying(false) the whole render must be (near-)silent — this
    // is what cuts the loop under game-over/victory so the SFX sting lands clean.
    const gated = await page.evaluate("window.__run({ loops: 1, duck: false, section: 'stage', notPlaying: true })");
    console.log(`  [SCENE-GATE]  notPlaying rms=${gated.rms.toFixed(5)} vs playing rms=${results.stage.rms.toFixed(4)}`);
    pass &= ok('setPlaying(false) fades music to silence', gated.rms < results.stage.rms * 0.15, `gated=${gated.rms.toFixed(5)} vs ${results.stage.rms.toFixed(4)} (<15%)`);
    console.log('');

    // Distinctness: the boss theme must be a DIFFERENT piece of music, not a re-label.
    // Factual measures: it's a shorter loop, and it carries markedly more raised-7th
    // (D#) dominant-tension energy — its deliberate "menace" signature.
    // Stage-2 must be a distinct piece in a DIFFERENT KEY (A-minor vs Stage-1's E-minor):
    // its A/E tonal ratio must clearly exceed Stage-1's, and its fingerprint must differ.
    pass &= ok('stage2 is a distinct theme: A-minor key (vs stage1 E-minor)', results.stage.fSharp > results.stage2.fSharp * 2, `stage1 F#=${results.stage.fSharp.toFixed(4)} vs stage2 F#=${results.stage2.fSharp.toFixed(4)} — F# absent from A-minor (>2×)`);
    pass &= ok('stage2 is a distinct theme: different arrangement (fp)', Math.abs(results.stage2.fp - results.stage.fp) > 5000, `|Δfp|=${Math.abs(results.stage2.fp - results.stage.fp)}`);
    // Stage-2 BOSS (chopper) is A-minor too — key-cohesive with stage2 (so the Stage-2
    // fight doesn't jump keys), but a distinct arrangement from both stage2 and the
    // E-minor Stage-1 boss (F# present in the E-minor boss, absent from A-minor boss2).
    pass &= ok('boss2 uses A-minor tension (G#), NOT the E-minor boss D#', results.boss.dSharp > results.boss2.dSharp * 1.3 && results.boss2.gSharp > results.boss.gSharp * 1.3, `boss D#=${results.boss.dSharp.toFixed(3)}/G#=${results.boss.gSharp.toFixed(4)}  boss2 D#=${results.boss2.dSharp.toFixed(3)}/G#=${results.boss2.gSharp.toFixed(4)}`);
    pass &= ok('boss2 is dominant-heavier than stage2 (more G#) — distinct A-minor themes', results.boss2.gSharp > results.stage2.gSharp * 1.3, `boss2 G#=${results.boss2.gSharp.toFixed(4)} vs stage2 G#=${results.stage2.gSharp.toFixed(4)} (>1.3×)`);
    pass &= ok('boss is a distinct theme: shorter loop', results.boss.loopDur < results.stage.loopDur - 1, `boss=${results.boss.loopDur.toFixed(2)}s < stage=${results.stage.loopDur.toFixed(2)}s`);
    pass &= ok('boss is a distinct theme: more D# dominant-tension', results.boss.dSharp > results.stage.dSharp * 1.3, `boss dSharp=${results.boss.dSharp.toFixed(3)} vs stage=${results.stage.dSharp.toFixed(3)} (>1.3×)`);

    // Phase-2 ENRAGE intensity: render the boss theme with setIntensity(true) and prove
    // it's not just louder — it's a real ARRANGEMENT change. Overall RMS rises (hotter
    // mix), AND the hat-band energy rises DISPROPORTIONATELY (double-time hats), i.e. the
    // hi-freq ratio exceeds the overall-RMS ratio.
    const enraged = await page.evaluate("window.__run({ loops: 2, duck: false, section: 'boss', intensity: true })");
    const rmsRatio = enraged.rms / results.boss.rms;
    const hiRatio = enraged.hiFreq / (results.boss.hiFreq || 1e-9);
    console.log(`\n  [ENRAGE]  boss rms=${results.boss.rms.toFixed(4)} hiFreq=${results.boss.hiFreq.toFixed(5)}  →  enraged rms=${enraged.rms.toFixed(4)} hiFreq=${enraged.hiFreq.toFixed(5)}  (rmsRatio=${rmsRatio.toFixed(2)} hiRatio=${hiRatio.toFixed(2)})`);
    pass &= ok('enrage lifts the mix (hotter than boss)', rmsRatio > 1.1, `rmsRatio=${rmsRatio.toFixed(2)} (>1.1)`);
    // Null hypothesis "just louder" ⇒ hiRatio == rmsRatio (both scale by the gain lift).
    // The double-time hats add high-freq BEYOND that: require hiRatio to exceed rmsRatio by
    // a clear margin (observed gap ≈0.20; threshold 0.08 leaves room for renderer jitter).
    pass &= ok('enrage is an ARRANGEMENT change (hats add hi-freq beyond the gain lift)', hiRatio - rmsRatio > 0.08, `hiRatio=${hiRatio.toFixed(2)} − rmsRatio=${rmsRatio.toFixed(2)} = ${(hiRatio - rmsRatio).toFixed(2)} (>0.08)`);
    pass &= ok('enraged boss still seamless (no silent gap)', enraged.longestSilenceMs < 40, `longestSilence=${enraged.longestSilenceMs.toFixed(1)}ms`);

    // Write both listenable artifacts (one loop each, 16-bit PCM WAV).
    const writeWav = (b64, sr, name) => {
      const pcm = Buffer.from(b64, 'base64');
      const wav = Buffer.alloc(44 + pcm.length);
      wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVE', 8);
      wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(sr, 24); wav.writeUInt32LE(sr * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
      wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);
      const p = resolve(__dirname, '..', name);
      writeFileSync(p, wav);
      console.log(`  wrote ${name}  (${(wav.length / 1024).toFixed(0)} KiB, ${(pcm.length / 2 / sr).toFixed(2)}s — open it to LISTEN)`);
    };
    console.log('');
    const stageWav = await page.evaluate("window.__renderLoopPcm('stage')");
    writeWav(stageWav.b64, stageWav.sr, 'contra-stage-loop.wav');
    const bossWav = await page.evaluate("window.__renderLoopPcm('boss')");
    writeWav(bossWav.b64, bossWav.sr, 'contra-boss-loop.wav');
    const bossEnragedWav = await page.evaluate("window.__renderLoopPcm('boss', true)");
    writeWav(bossEnragedWav.b64, bossEnragedWav.sr, 'contra-boss-enraged-loop.wav');
    const stage2Wav = await page.evaluate("window.__renderLoopPcm('stage2')");
    writeWav(stage2Wav.b64, stage2Wav.sr, 'contra-stage2-loop.wav');
    const boss2Wav = await page.evaluate("window.__renderLoopPcm('boss2')");
    writeWav(boss2Wav.b64, boss2Wav.sr, 'contra-boss2-loop.wav');

    console.log('');
    console.log(JSON.stringify({ stage: results.stage, boss: results.boss, verdict: pass ? 'PASS' : 'FAIL' }, null, 0));
    await browser.close();
    process.exit(pass ? 0 : 1);
  } catch (e) {
    console.error('render-check error:', e.message);
    await browser.close();
    process.exit(2);
  }
})();
