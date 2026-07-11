# Assessment #16 — verify the TOUCH-1 fix (touch restart from game-over)

**Date:** 2026-07-10 · **Subject:** `game/index.html` @ `7a916be` · **Native:** 480×270 ·
**Method:** ran the live build in headless Chrome emulating a landscape Android phone
(Pixel 7, 844×390, `hasTouch`); forced game-over via real game state, dispatched a **touch
press** (PointerEvent on the FIRE button), and read the world state; then **looked** at the
rendered game-over screen. Evidence: `frames/our-game-mobile/mobile-gameover-fixed.png`.

Closes the loop: ASSESS-15 filed TOUCH-1 (touch player stranded after death) → root.B fixed
it (PR#82) → verified here.

---

## TOUCH-1 → RESOLVED (verified by running + looking)
The fix landed (`touch.js` on `status==='gameover'||'cleared'` → `world.reset()` on a touch
press; `render.js:1051` shows `'TAP TO RESTART'` on touch instead of `'press R'`).

**Ran it (FACT):** forced `status='gameover'`, `lives=0`, `player.dead=true`, then dispatched
a touch press on the FIRE button →
`status: gameover → playing`, `lives: 0 → 3`, `dead: false`, `player.x = 40` (fresh respawn).
A keyboard-less phone player can now restart after dying.

**Looked (`mobile-gameover-fixed.png`):** the game-over screen now reads **"GAME OVER — TAP
TO RESTART"** (was "press R to restart" in ASSESS-15's `mobile-gameover.png`). Touch-appropriate.

**Verdict:** the game-over→restart loop works on touch → **the game is now FULLY
mobile-browser-playable**. This clears the caveat ASSESS-15 added to the web/Android gate.

## Bonus — TOUCH-2 partially addressed
The in-canvas prompts now adapt to touch: **"TAP TO START"** (title) / **"TAP TO RESTART"**
(game-over), via `isTouchUI()` (render.js:1033/1051). Residual TOUCH-2: the bottom keyboard
help LINE (+ a "TOUCH" label) may still render on touch — cosmetic, low.

## Scores / gate
- No rubric-dimension change. **Web/Android playability gate: now a clean PASS** (mobile
  layout + touch controls + touch restart all verified). Scorecard caveat removed.

## Open issues
- **TOUCH-2 (low)** — bottom keyboard help line still shown on touch (prompts now adapt).
- Carried: BOSS-3 (render matte, render's fix), BOSS-2, LEAP-1, HUD-1 (low).
