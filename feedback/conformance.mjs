// feedback/conformance.mjs — EXECUTABLE acceptance test for feedback/SPEC.md,
// driven against the REAL SHIPPED build (game/src/feedback.js, wired in main.js).
//
// root.B landed game/src/feedback.js (PR#99) and wired window.__approval +
// world.approval in runLive. This harness serves the ACTUAL committed game/ tree
// UNMODIFIED (no temp copy, no patching) and drives it in headless Chrome through
// AC-1…AC-11, asserting the INTENDED behavior. A failure here is a real defect in
// the shipped panel and is recorded as an OPEN ISSUE (never worked around).
//
//   node feedback/conformance.mjs
//
// Evidence -> feedback/frames/conformance.json + conformance-open.png.
// (History: earlier revisions drove feedback/reference-impl/feedback.js in a
//  patched temp copy to PROVE the contract satisfiable before root.B built it.)

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveGame, findChrome, sleep } from '../playtest/e2e/harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'frames');
const require = createRequire('/Users/avinashsaxena/matrix-dfs-statemachine-pre-clock/loop_hierarchy/runs/contra-live3/repo/playtest/e2e/');
const puppeteer = require('puppeteer-core');

const results = [];
function assert(id, ok, detail, critical = true) {
  results.push({ id, ok: !!ok, critical, detail: String(detail) });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  —  ${detail}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const srv = await serveGame(); // default: the REAL committed game/ tree
  const browser = await puppeteer.launch({
    executablePath: findChrome(), headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
    defaultViewport: { width: 960, height: 540 },
  });
  try {
    const page = await browser.newPage();
    const boot = async () => {
      await page.goto(`${srv.url}/`, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForFunction(() => !!window.__game && !!window.__approval, { timeout: 15000 });
    };
    await page.goto(`${srv.url}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await boot();
    await sleep(200);

    // AC-8 default closed / gate closed
    let s = await page.evaluate(() => ({ open: window.__approval.isOpen(),
      hidden: document.getElementById('feedback-panel').hidden, gate: window.__approval.releaseApproved }));
    assert('AC-8.defaultClosed', s.open === false && s.hidden === true && s.gate === false, JSON.stringify(s));

    // AC-11 ship-gate predicate (the exact playthrough.mjs check)
    const gate = await page.evaluate(() => ({
      apiHit: !!(window.__approval || (window.__game && window.__game.approval)),
      domHit: /approve|creator (review|approval|feedback)|thumbs|rate this build/i.test(document.body.innerHTML || ''),
    }));
    assert('AC-11.shipGatePredicate', gate.apiHit && gate.domHit, `apiHit=${gate.apiHit} domHit=${gate.domHit}`);

    // AC-1 hotkey toggle on TITLE
    await page.keyboard.press('KeyF'); await sleep(80);
    const open1 = await page.evaluate(() => window.__approval.isOpen());
    await page.keyboard.press('KeyF'); await sleep(80);
    const open2 = await page.evaluate(() => window.__approval.isOpen());
    assert('AC-1.toggleTitle', open1 === true && open2 === false, `openAfter1=${open1} openAfter2=${open2}`);

    // AC-2b pause-on-open at TITLE (attract mode): root.B added a self-playing bot
    // demo behind the title; opening the panel must FREEZE it (main.js sets
    // world.attract=false + acc=0), else the demo animates behind the overlay.
    // Regression guard for the refactored panel-pause condition.
    await sleep(500); // let the attract demo advance the bot
    const attractBefore = await page.evaluate(() => ({ x: Math.round(window.__game.player.x * 100), attract: window.__game.attract }));
    await page.keyboard.press('KeyF'); await sleep(120); // open panel at title
    const tp0 = await page.evaluate(() => Math.round(window.__game.player.x * 100));
    await sleep(900);
    const tp1 = await page.evaluate(() => ({ x: Math.round(window.__game.player.x * 100), attract: window.__game.attract, open: window.__approval.isOpen(), status: window.__game.status }));
    assert('AC-2b.pauseAttractOnOpen',
      attractBefore.attract === true && tp0 === tp1.x && tp1.attract === false && tp1.open === true && tp1.status === 'title',
      `attractRan=${attractBefore.attract} frozen=${tp0 === tp1.x} attractOff=${tp1.attract === false}`);
    await page.keyboard.press('KeyF'); await sleep(120); // close → attract resumes

    // Enter play
    await page.keyboard.press('KeyZ'); await sleep(300);
    await page.keyboard.down('ArrowRight'); await page.keyboard.down('KeyX'); await sleep(1200);
    await page.keyboard.up('KeyX'); await page.keyboard.up('ArrowRight'); await sleep(100);

    // AC-1 toggle during play + AC-2 pause on open
    await page.keyboard.press('KeyF'); await sleep(80);
    const before = await page.evaluate(() => ({ x: window.__game.player.x, status: window.__game.status, open: window.__approval.isOpen() }));
    await sleep(1100);
    const after = await page.evaluate(() => ({ x: window.__game.player.x, status: window.__game.status }));
    assert('AC-1.togglePlay', before.open === true, `open during play=${before.open}`);
    assert('AC-2.pauseOnOpen', before.x === after.x && before.status === after.status && after.status === 'playing',
      `x ${before.x}->${after.x}, status ${before.status}->${after.status}`);
    await page.screenshot({ path: path.join(OUT, 'conformance-open.png') });

    // AC-3 no key leak while open (R/1/2/M/P swallowed). P (pause) added after
    // root.B shipped the pause feature — the panel must own the keyboard fully, so
    // toggling pause while typing feedback must NOT reach the game (main.js swallows
    // all game keys when feedback.isOpen()). Guards against a future refactor moving
    // the P handler above the swallow.
    const scoreBefore = await page.evaluate(() => window.__game.score);
    const muteBefore = await page.evaluate(() => !!(window.__audio && window.__audio.muted));
    const pausedBefore = await page.evaluate(() => !!window.__game.paused);
    await page.keyboard.press('KeyR'); await page.keyboard.press('Digit2'); await page.keyboard.press('KeyM'); await page.keyboard.press('KeyP'); await sleep(120);
    const leak = await page.evaluate(() => ({ status: window.__game.status, mode: window.__game.modeKey,
      score: window.__game.score, muted: !!(window.__audio && window.__audio.muted), paused: !!window.__game.paused }));
    assert('AC-3.noKeyLeak', leak.status === 'playing' && leak.mode === 'arcade' && leak.score === scoreBefore && leak.muted === muteBefore && leak.paused === pausedBefore,
      JSON.stringify(leak));

    // AC-7 context auto-captured + AC-4 approve gates (click the REAL button)
    await page.click('#fb-approve'); await sleep(120);
    const afterApprove = await page.evaluate(() => ({ gate: window.__approval.releaseApproved, latest: window.__approval.latest() }));
    const ctx = (afterApprove.latest && afterApprove.latest.context) || {};
    assert('AC-7.contextCaptured',
      ctx.buildId != null && ctx.status != null && ctx.mode === 'arcade' && typeof ctx.score === 'number' && typeof ctx.lives === 'number',
      JSON.stringify(ctx));
    assert('AC-4.approveGates', afterApprove.gate === true && afterApprove.latest.verdict === 'approve', JSON.stringify(afterApprove).slice(0,170));

    // AC-4 persistence across reload
    await boot(); await sleep(150);
    const afterReload = await page.evaluate(() => ({ gate: window.__approval.releaseApproved, n: window.__approval.entries().length }));
    assert('AC-4.persistsReload', afterReload.gate === true && afterReload.n >= 1, JSON.stringify(afterReload));

    // AC-12 EXPORT path (root.B closed OI-3): the panel has a one-click export
    // button AND controller.exportJson() returns a JSON string == entries(), and
    // — the whole point — that exported record feeds release-gate.mjs to a correct
    // ship decision. Proves the complete chain: in-panel approve → export → gate.
    const exp = await page.evaluate(() => {
      const hasBtn = !!document.getElementById('fb-export');
      const json = window.__approval.exportJson ? window.__approval.exportJson() : null;
      let parsed = null; try { parsed = JSON.parse(json); } catch (_) {}
      const entries = window.__approval.entries();
      const matches = Array.isArray(parsed) && JSON.stringify(parsed) === JSON.stringify(entries);
      return { hasBtn, json, matches, buildId: entries[0] && entries[0].context && entries[0].context.buildId };
    });
    assert('AC-12.exportReturnsEntries', exp.hasBtn && typeof exp.json === 'string' && exp.matches,
      `hasBtn=${exp.hasBtn} matchesEntries=${exp.matches}`);
    // End-to-end: write the EXPORTED record to disk and run the real gate on it.
    let chainExit = -1;
    if (exp.json) {
      const recPath = path.join(os.tmpdir(), 'fb-exported-record.json');
      await writeFile(recPath, exp.json);
      chainExit = spawnSync('node', [path.join(HERE, 'release-gate.mjs'), recPath, '--build', exp.buildId || 'dev'],
        { encoding: 'utf8' }).status;
    }
    assert('AC-12.exportedRecordGatesShip', chainExit === 0,
      `release-gate on exported approve record exit=${chainExit} (want 0 = APPROVED)`);

    // AC-14 NOTES round-trip — the "logs STRUCTURED feedback" requirement. Type a
    // note into the panel's textarea, submit a verdict, and assert the note
    // survives verbatim into entries() AND the exported record (what release-gate
    // consumes). Verifies the creator's free-text reasoning isn't dropped anywhere
    // in panel → persist → export.
    const NOTE = 'boss phase-2 telegraph too short — e2e-note-check';
    const notesRT = await page.evaluate((note) => {
      window.__approval.open();
      const ta = document.getElementById('fb-notes');
      ta.value = note;                         // simulate the creator typing
      document.getElementById('fb-approve').click();
      const latest = window.__approval.latest();
      let exported = null;
      try { exported = JSON.parse(window.__approval.exportJson()); } catch (_) {}
      const inExport = Array.isArray(exported) && exported.some((e) => e.notes === note);
      window.__approval.close();
      return { latestNotes: latest && latest.notes, inExport };
    }, NOTE);
    assert('AC-14.notesRoundTrip', notesRT.latestNotes === NOTE && notesRT.inExport === true,
      `latest.notes==typed:${notesRT.latestNotes === NOTE} inExportedRecord:${notesRT.inExport}`);

    // AC-5 reject revokes
    const rej = await page.evaluate(() => { window.__approval.submit({ verdict: 'reject' }); return window.__approval.releaseApproved; });
    assert('AC-5.rejectRevokes', rej === false, `gate after reject=${rej}`);

    // AC-6 contradictory approve (rating 1-2) does NOT gate
    const contra = await page.evaluate(() => { window.__approval.submit({ verdict: 'approve', rating: 2 }); return window.__approval.releaseApproved; });
    assert('AC-6.lowStarApproveNoGate', contra === false, `gate after approve@2star=${contra}`);

    // AC-10 corrupt storage tolerated
    await page.evaluate(() => { localStorage.setItem('contra:feedback:v1', '{not json'); });
    await boot(); await sleep(150);
    const tol = await page.evaluate(() => { try { return { n: window.__approval.entries().length, gate: window.__approval.releaseApproved, err: null }; } catch (e) { return { err: String(e) }; } });
    assert('AC-10.corruptStorageTolerated', tol.err === null && tol.n === 0 && tol.gate === false, JSON.stringify(tol));

    // AC-9 no game-key regression when CLOSED (R restarts to fresh play)
    await page.keyboard.press('KeyZ'); await sleep(200);
    await page.evaluate(() => { window.__game.score = 999; });
    await page.keyboard.press('KeyR'); await sleep(150);
    const reg = await page.evaluate(() => ({ status: window.__game.status, score: window.__game.score, open: window.__approval.isOpen() }));
    assert('AC-9.noRegressionClosed', reg.open === false && reg.status === 'playing' && reg.score === 0, JSON.stringify(reg));

  } finally {
    const passed = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    const criticalFailed = results.filter((r) => !r.ok && r.critical).length;
    await writeFile(path.join(OUT, 'conformance.json'), JSON.stringify({
      when: new Date().toISOString(), target: 'game/src/feedback.js (SHIPPED build, served unmodified)',
      passed, failed, criticalFailed, verdict: criticalFailed === 0 ? 'PASS' : `FAIL (${criticalFailed} critical)`, results,
    }, null, 2));
    await browser.close();
    await srv.close();
    console.log(`\n=== CONFORMANCE (shipped build): ${passed} passed, ${failed} failed (${criticalFailed} critical) ===`);
    process.exit(criticalFailed > 0 ? 1 : 0);
  }
}
main().catch((e) => { console.error('CONFORMANCE ERROR:', e); process.exit(2); });
