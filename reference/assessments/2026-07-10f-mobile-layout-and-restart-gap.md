# Assessment #15 — mobile-first layout (PR#78) + game-over touch-restart GAP

**Date:** 2026-07-10 · **Subject:** `game/index.html` @ `7f7872d` · **Native:** 480×270 ·
**Method:** ran the live build in headless Chrome emulating a landscape Android phone
(Pixel 7, 844×390, `hasTouch`); measured the canvas fill, **looked** at the layout, then
forced game-over via real game state and checked for a touch restart affordance.
Evidence: `frames/our-game-mobile/`.

Follows ASSESS-14 (touch controls verified). This grounds the new mobile-first layout AND a
real caveat to the "mobile-playable" claim.

---

## Mobile-first layout (PR#78) — VERIFIED
Fact: the canvas now fills **100% of viewport height** (`ch=390=vh`; 82% width = 16:9
letterbox on a wider phone) — previously it was centered/letterboxed with help text below.
Looked (`mobile-layout-play.png`): the night-jungle gameplay fills the mobile screen
moon-to-ground; the clean D-pad + JUMP/FIRE overlay sits on top. This is a proper
**mobile-first** presentation — good.

## GAME-OVER touch-restart GAP — real mobile-playability defect (TOUCH-1)
Forced game-over; **looked** (`mobile-gameover.png`): the screen shows **"GAME OVER — press R
to restart"** (keyboard-only prompt), and the touch overlay exposes only ▲◀▶▼ / JUMP / FIRE —
**no restart control** (`hasRestartControl=false`). So a **touchscreen player who dies is
STRANDED** — there is no way to restart without a keyboard. The game is mobile-playable *until
you die*, then the loop is broken.
- **Severity: MEDIUM–HIGH for mobile** — the goal is "browser-playable web/**Android**"; a
  run-and-gun with one-hit death where a mobile player *will* die and then cannot restart is
  not fully playable on the target platform. Not a desktop issue (R works).
- **This QUALIFIES the ASSESS-14 verdict:** the game is mobile-playable **except** the
  game-over→restart loop is keyboard-only. Corrected in the scorecard gate note.
- The playtest loop independently found this (their `bf1518d`, also labelled "TOUCH-1").
- **Repro:** on a touch device, die → GAME OVER → no touch control restarts. **Fix:** add a
  touch "TAP TO RESTART" affordance (or make a touch button restart on game-over).

## ID reconciliation
The restart-gap is the important one → keep it as **TOUCH-1** (aligns with the playtest loop's
naming). My earlier cosmetic finding (keyboard help text shown on touch) is renamed **TOUCH-2**.

## Scores / gate
- No rubric-dimension change. The **web/Android playability** gate note is corrected: playable
  on mobile browsers, **BUT** blocked by the keyboard-only game-over restart (TOUCH-1) — a real
  caveat to full mobile playability until fixed.

## Open issues
- **TOUCH-1 (MEDIUM–HIGH, mobile)** — no touch restart after game-over; touch players stranded.
- **TOUCH-2 (low)** — keyboard help text (+ "TOUCH" label) shown on touch devices.
- Carried: BOSS-3 (render matte), BOSS-2, LEAP-1, HUD-1 (low).
