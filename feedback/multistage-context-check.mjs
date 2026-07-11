#!/usr/bin/env node
// feedback/multistage-context-check.mjs — DORMANT tripwire for SPEC §3.4's forward
// requirement: once the shipped game is multi-stage, the feedback panel MUST capture
// context.stage so creator notes disambiguate which stage/boss. Stage 2 is being
// authored (content/stage2/, chopper boss); this guard flips from PASS (dormant) to
// FAIL the moment multi-stage lands in game/ without a stage id — so it isn't
// forgotten. FACTS only (file presence + code signature), no judgment.
//
//   node feedback/multistage-context-check.mjs   # exit 0 dormant/satisfied, 1 tripwire fired

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => { try { return readFileSync(path.join(REPO, rel), 'utf8'); } catch { return ''; } };

// Is the SHIPPED game multi-stage? (a) a level2+ data file lives in game/data/, or
// (b) world/data wires a stage-advance / second level into the served build.
const dataFiles = (() => { try { return readdirSync(path.join(REPO, 'game/data')); } catch { return []; } })();
const hasLevel2File = dataFiles.some((f) => /level([2-9]|\d\d)/i.test(f));
const worldWiresStages = /nextLevel|loadLevel|this\.stage\s*=|levelIndex|LEVELS\s*\[/.test(read('game/src/world.js') + read('game/src/main.js'));
const multiStage = hasLevel2File || worldWiresStages;

// Does the panel capture a stage/level id in the entry context?
const fb = read('game/src/feedback.js');
const capturesStage = /context\s*:\s*{[^}]*\b(stage|levelKey|levelId|level)\b/s.test(fb) || /stage\s*:\s*world\./.test(fb);

let ok, status;
if (!multiStage) { ok = true; status = 'DORMANT — game is single-stage; context.stage not yet required'; }
else if (capturesStage) { ok = true; status = 'SATISFIED — multi-stage shipped AND context captures stage id'; }
else { ok = false; status = 'TRIPWIRE FIRED — multi-stage shipped but feedback.js context has NO stage id (SPEC §3.4). root.B: add context.stage (e.g. world.levelKey).'; }

console.log(`  ${ok ? 'PASS' : 'FAIL'}  multistage.contextStage  —  multiStage=${multiStage} capturesStage=${capturesStage}`);
console.log(`  ${status}`);
console.log(`\n=== MULTISTAGE-CONTEXT: ${ok ? 'PASS' : 'FAIL (tripwire)'} ===`);
process.exit(ok ? 0 : 1);
