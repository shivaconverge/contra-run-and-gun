// headless-safety.mjs — proves MusicKit is safe to construct/drive with NO
// AudioContext (the headless/self-test environment), exactly like AudioKit's
// `audio.synthNoThrow` check. If this passes, dropping MusicKit into game/src/
// cannot break the deterministic headless self-tests: the sim never touches it,
// and with no ctx every method is a silent no-op that never throws.
//
// Runs in plain node (no browser) — there is no window/AudioContext here, which
// is precisely the condition we assert is safe. Exit 0 on pass, 1 on fail.

import { MusicKit } from '../music.js';

let threw = null;
try {
  const m = new MusicKit();            // no ctx → disabled, no-op
  // drive every public method the integration will call
  m.start(); m.resume(); m.duck(true); m.duck(false);
  m.toggleMute(); m.setMuted(true); m.setMuted(false);
  m.setSection('boss'); m.setSection('stage'); m.setSection('stage2'); m.setSection('boss2'); m.setSection('bogus');
  m.setPlaying(false); m.setPlaying(true);
  m.setIntensity(true); m.setIntensity(false);
  m.scheduleSpan(0, 5); m.stop();
  // the geometry getters must still compute (they're pure math)
  void m.barDur; void m.stepDur; void m.loopDur;
  if (m.enabled !== false) throw new Error(`expected enabled=false with no ctx, got ${m.enabled}`);
  if (m.running !== false) throw new Error(`expected running=false, got ${m.running}`);
  if (!(m.loopDur > 0)) throw new Error(`loopDur should be positive, got ${m.loopDur}`);
} catch (e) { threw = String(e); }

if (threw) { console.log(`FAIL  music.headlessSafe — ${threw}`); process.exit(1); }
console.log('PASS  music.headlessSafe — no ctx: construct + all methods are silent no-ops, never throw');
console.log('PASS  music.loopGeometry — barDur/stepDur/loopDur compute without a ctx');

// ---- section-switch logic (pure state machine; no ctx / no audio needed) ----
// This is the contract root.B wires to: setSection applies immediately when idle,
// queues to the next downbeat while running, ignores unknown/same names, and drives
// loopDur off the active section (boss loop is shorter than stage).
let s2 = null;
try {
  const m = new MusicKit();
  if (m.section !== 'stage') throw new Error(`default section should be 'stage', got ${m.section}`);
  const stageLoop = m.loopDur;
  m.setSection('boss'); // idle → immediate
  if (m.section !== 'boss') throw new Error(`idle setSection should apply now, got ${m.section}`);
  const bossLoop = m.loopDur;
  if (!(bossLoop > 0 && bossLoop < stageLoop)) throw new Error(`boss loop (${bossLoop.toFixed(2)}s) should be shorter than stage (${stageLoop.toFixed(2)}s)`);
  m.setSection('nope'); // unknown → ignored
  if (m.section !== 'boss') throw new Error(`unknown section must be ignored, got ${m.section}`);
  for (const sec of ['stage2', 'boss2']) { // the second-stage theme + its boss are registered
    m.setSection(sec);
    if (m.section !== sec) throw new Error(`setSection('${sec}') should apply, got ${m.section}`);
    if (!(m.loopDur > 0)) throw new Error(`${sec} loopDur should be positive, got ${m.loopDur}`);
  }
  m.setSection('stage');
  // simulate "running": a queued switch should NOT change the active section until a bar fires
  m.running = true; m._section = 'stage'; m._pendingSection = null;
  m.setSection('boss');
  if (m.section !== 'stage' || m._pendingSection !== 'boss') throw new Error(`running setSection should QUEUE, not apply: section=${m.section} pending=${m._pendingSection}`);
  m.running = false;
} catch (e) { s2 = String(e); }

if (s2) { console.log(`FAIL  music.sectionSwitch — ${s2}`); process.exit(1); }
console.log('PASS  music.sectionSwitch — idle=immediate, running=queued-to-downbeat, unknown-ignored, boss loop < stage loop');

// ---- scene-gate logic (pure state; no ctx needed) --------------------------
// setPlaying gates the run-active fade. Default is playing=true (so a plain re-sync
// with no wiring is byte-safe — music behaves exactly as before). Idempotent + boolean.
let s3 = null;
try {
  const m = new MusicKit();
  if (m._playing !== true) throw new Error(`default _playing should be true (byte-safe), got ${m._playing}`);
  m.setPlaying(false);
  if (m._playing !== false) throw new Error(`setPlaying(false) should set _playing=false, got ${m._playing}`);
  m.setPlaying(true);
  if (m._playing !== true) throw new Error(`setPlaying(true) should restore _playing=true, got ${m._playing}`);
  m.setPlaying('x'); // coerced truthy → stays true, no throw
  if (m._playing !== true) throw new Error(`truthy coercion expected, got ${m._playing}`);
} catch (e) { s3 = String(e); }

if (s3) { console.log(`FAIL  music.sceneGate — ${s3}`); process.exit(1); }
console.log('PASS  music.sceneGate — default playing=true (byte-safe), setPlaying toggles run-active fade');

// ---- enrage-intensity logic (pure state; no ctx needed) --------------------
// setIntensity gates the phase-2 boss lift. Default OFF, so a plain re-sync with no
// hook is byte-safe — music is identical until root.B wires it to boss.enraged.
let s4 = null;
try {
  const m = new MusicKit();
  if (m._intensity !== false) throw new Error(`default _intensity should be false (byte-safe), got ${m._intensity}`);
  m.setIntensity(true);
  if (m._intensity !== true) throw new Error(`setIntensity(true) should set _intensity=true, got ${m._intensity}`);
  m.setIntensity(false);
  if (m._intensity !== false) throw new Error(`setIntensity(false) should clear _intensity, got ${m._intensity}`);
  if (!(m._intensityBoost > 1)) throw new Error(`intensityBoost should be >1 (a lift), got ${m._intensityBoost}`);
} catch (e) { s4 = String(e); }

if (s4) { console.log(`FAIL  music.enrageIntensity — ${s4}`); process.exit(1); }
console.log('PASS  music.enrageIntensity — default OFF (byte-safe), setIntensity toggles phase-2 lift');
process.exit(0);
