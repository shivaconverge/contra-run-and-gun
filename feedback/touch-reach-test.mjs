#!/usr/bin/env node
// feedback/touch-reach-test.mjs — OI-5 ACCEPTANCE GATE (report-don't-work-around).
//
// Asserts the INTENDED behavior: on a touch-only device the creator can OPEN the
// feedback panel via an on-screen affordance (no keyboard). Today there is NO such
// affordance (only KeyF opens it), so this test is EXPECTED TO FAIL — it is a
// KNOWN BUG marker for OI-5, not a regression. When root.B adds a touch button in
// the touch.js action cluster that calls feedback.toggle(), this flips to PASS.
//
//   node feedback/touch-reach-test.mjs        # exit 0 = OI-5 fixed, 1 = still open
//
// Behavioral + implementation-agnostic: it taps every on-screen control OUTSIDE
// the panel and checks whether any of them opens window.__approval — so it passes
// for ANY reasonable button root.B adds, without hard-coding an id.

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveGame, findChrome, sleep } from '../playtest/e2e/harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'frames');
const require = createRequire('/Users/avinashsaxena/matrix-dfs-statemachine-pre-clock/loop_hierarchy/runs/contra-live3/repo/playtest/e2e/');
const puppeteer = require('puppeteer-core');

async function main() {
  await mkdir(OUT, { recursive: true });
  const srv = await serveGame();
  const browser = await puppeteer.launch({
    executablePath: findChrome(), headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
    defaultViewport: { width: 430, height: 932, isMobile: true, hasTouch: true },
  });
  let opened = false, detail = '', affordances = [];
  try {
    const page = await browser.newPage();
    await page.goto(`${srv.url}/?touch=1`, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForFunction(() => !!window.__approval, { timeout: 15000 });
    await sleep(400);

    // At title (sim frozen), tap every on-screen control OUTSIDE the panel and see
    // if any opens window.__approval. Implementation-agnostic reachability probe.
    const res = await page.evaluate(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const panel = document.getElementById('feedback-panel');
      const inPanel = (el) => panel && panel.contains(el);
      // Candidate tappables: buttons / role=button / elements with a data-key or in
      // the touch overlay — anything a thumb could press, excluding the panel itself.
      const cands = [...document.querySelectorAll('button, [role="button"], [data-key], .btn, #touch-controls *, [class*="touch"] *, [class*="pad"] *, [class*="action"] *')]
        .filter((el) => !inPanel(el) && el.offsetParent !== null);
      const seen = new Set(); const labels = [];
      for (const el of cands) {
        const key = el.id || el.className || el.textContent?.slice(0, 16) || 'el';
        if (seen.has(key)) continue; seen.add(key);
        labels.push(key);
        // simulate a tap
        const r = el.getBoundingClientRect();
        const opts = { bubbles: true, cancelable: true, composed: true };
        try {
          el.dispatchEvent(new PointerEvent('pointerdown', opts));
          el.dispatchEvent(new TouchEvent('touchstart', opts));
          el.dispatchEvent(new TouchEvent('touchend', opts));
          el.dispatchEvent(new MouseEvent('click', opts));
        } catch (_) { try { el.click(); } catch (_) {} }
        await wait(20);
        if (window.__approval.isOpen()) return { opened: true, by: key, labels };
        // ensure closed before next probe
        if (window.__approval.isOpen()) window.__approval.close();
      }
      return { opened: false, by: null, labels };
    });
    opened = res.opened; affordances = res.labels;
    detail = opened ? `panel opened by on-screen control: "${res.by}"`
      : `no on-screen affordance opened the panel; tried ${res.labels.length} controls: [${res.labels.join(', ')}]`;
  } finally {
    await browser.close();
    await srv.close();
  }

  const status = opened ? 'PASS (OI-5 fixed)' : 'FAIL — KNOWN BUG OI-5 (panel unreachable on touch)';
  console.log(`  ${opened ? 'PASS' : 'FAIL'}  touch.panelReachable  —  ${detail}`);
  console.log(`\n=== TOUCH-REACH (OI-5 acceptance gate): ${status} ===`);
  await writeFile(path.join(OUT, 'touch-reach.json'), JSON.stringify({
    when: new Date().toISOString(), intended: 'creator can open the feedback panel on a touch-only device (no keyboard)',
    knownBug: opened ? null : 'OI-5', passed: opened, detail, affordancesTried: affordances,
  }, null, 2));
  process.exit(opened ? 0 : 1);
}
main().catch((e) => { console.error('TOUCH-REACH ERROR:', e); process.exit(2); });
