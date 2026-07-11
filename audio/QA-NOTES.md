# audio/ QA notes

Verification for the music layer lives in `verify/` (run `npm run verify:all`). This file
tracks OPEN ISSUES — real gaps found by running the deliverable, with severity + exact repro.

## OPEN ISSUES

### 2026-07-10 — OI-A1: Stage-2 (`?level=2`) plays the Stage-1 music (key clash)
- **Severity:** MEDIUM. Live in the shipped build but only behind the opt-in `?level=2`
  path — the default build (and every gate harness) never passes `?level=2`, so the
  DEFAULT shipped experience is unaffected. It affects anyone auditioning Stage-2 today.
- **What:** Stage-2 "Cascade Base" is now reachable (`game/src/main.js` imports `LEVEL2`
  and boots it on `?level=2`), but the music selector (`main.js` ~line 268) is still the
  Stage-1-only `audio.setSection(bossActive ? 'boss' : 'stage')`. So the A-minor Cascade
  Base stage plays the **E-minor Stage-1 jungle theme** — a key clash. The purpose-built
  `stage2`/`boss2` A-minor themes exist and are verified (render-check 34/34) but aren't
  selected, and the shipped `game/src/music.js` hasn't been re-synced to include them.
- **Grounded by running (not read), BOTH themes:** served `game/`, opened `/?level=2`, Space →
  `level.name === 'Cascade Base'` and `music.section === 'stage'` (should be `stage2`); then
  forced the chopper boss active → `bossActive` latches and `music.section === 'boss'` (should
  be `boss2`). So Stage-2 plays the E-minor Stage-1 stage AND boss themes under the A-minor
  Cascade Base — both cases of the SAME missing selector. **The boss-music TRIGGER itself works
  in Stage-2** (`world.js:48` finds the chopper via `def.isBoss` — confirmed live), so there is
  NO deeper gap; only the section selection is missing. Captured permanently by
  `verify/live-check.mjs` block H (⏳ PENDING for both stage2 + boss2 each run; each auto-flips
  to a real PASS once wired; a hard FAIL only if the boss-trigger ever stops firing).
- **Owner / fix (NOT this layer's code — pending root.B):** two steps, both in
  `INTEGRATION.md` Step 6:
  1. `cp audio/music.js game/src/music.js` (re-sync — adds `stage2`/`boss2`; byte-safe,
     the new sections stay dormant until selected).
  2. Replace the `setSection` line with the 2×2 matrix using the verified signal
     `onStage2 = world.level === LEVEL2` (`LEVEL2` already imported; `world.level` = world.js:15):
     `audio.setSection(onStage2 ? (inBoss ? 'boss2' : 'stage2') : (inBoss ? 'boss' : 'stage'))`.
- **Not a defect in the audio layer:** the themes + API are complete and verified; this is
  an unwired integration step. Recorded here (and surfaced in INTEGRATION.md/README) so it
  doesn't get lost; `live-check.mjs` block H will confirm the fix automatically.
