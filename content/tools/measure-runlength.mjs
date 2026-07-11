#!/usr/bin/env node
// measure-runlength.mjs — GROUND the content-depth "total run length (seconds)"
// number by DRIVING THE REAL SIM, not code-reading. Imports the shipped World +
// LEVEL1 (read-only; this tool lives in content/ and never edits game/) and steps
// the actual deterministic sim with a naive run-and-gun BOT (hold right + fire,
// pulse jump to clear gaps) until status==='cleared' or a frame cap. Reports real
// frames-to-clear → seconds at SIM.STEP_HZ.
//
//   node content/tools/measure-runlength.mjs [mode] [seed]
//   mode = arcade|casual (default casual, to maximise reaching the boss)
//
// This is a MEASUREMENT of the real deliverable, honest about how far the bot got —
// a lower bound on "content that exists to play", not a skill demonstration.

import { World } from '../../game/src/world.js';
import { LEVEL1 } from '../../game/data/level1.js';
import { ScriptedInput } from '../../game/src/input.js';
import { SIM } from '../../game/data/config.js';

const mode = process.argv[2] || 'casual';
const seed = parseInt(process.argv[3] || '1234', 10);
const CAP = 60 * 60 * 4; // 4 min hard cap

// Build a bot timeline: hold right + fire from frame 0; pulse jump every 40 frames
// (2 frames on) so the bot hops the chasm/bridge gaps as it advances.
const timeline = [{ at: 0, set: { right: true, fire: true } }];
for (let f = 30; f < CAP; f += 40) {
  timeline.push({ at: f, set: { jump: true } });
  timeline.push({ at: f + 2, set: { jump: false } });
}

const world = new World(LEVEL1, seed, mode);
const bot = new ScriptedInput(timeline);

let frames = 0;
let maxX = 0;
let deaths = 0;
let prevLives = world.lives;
const bossHp0 = world.boss ? world.boss.hp : null;
let bossEngagedAt = null;

while (world.status === 'playing' && frames < CAP) {
  world.step(bot.poll());
  frames++;
  const px = world.player.x;
  if (px > maxX) maxX = px;
  if (world.lives < prevLives) { deaths++; prevLives = world.lives; }
  if (bossEngagedAt === null && world.bossActive) bossEngagedAt = frames;
}

const secs = (frames / SIM.STEP_HZ);
const bossHp = world.boss ? world.boss.hp : null;
const out = {
  mode, seed,
  status: world.status,
  frames,
  seconds: +secs.toFixed(1),
  reachedX: Math.round(maxX),
  levelWidth: LEVEL1.width,
  goalX: LEVEL1.goalX,
  pctTraversed: +((maxX / LEVEL1.goalX) * 100).toFixed(1),
  deaths,
  livesLeft: world.lives,
  bossEngagedAtSec: bossEngagedAt === null ? null : +(bossEngagedAt / SIM.STEP_HZ).toFixed(1),
  bossHp0, bossHpLeft: bossHp,
  bossDead: !!(world.boss && world.boss.dead),
  stepHz: SIM.STEP_HZ,
};
console.log(JSON.stringify(out, null, 2));
