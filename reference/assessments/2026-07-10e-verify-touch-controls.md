# Assessment #14 — on-screen touch controls (mobile/Android playability)

**Date:** 2026-07-10 · **Subject:** `game/index.html` @ `9bf33af` (PR#74) · **Native:** 480×270 ·
**Method:** ran the live build in headless Chrome **emulating a landscape Android phone**
(Pixel 7 UA, 844×390, `hasTouch`) so the touch overlay mounts, then **looked** at the full-page
screenshot (canvas + DOM overlay). Evidence: `frames/our-game-touch/touch-play.png`.

The goal is **browser-playable web/Android**; a keyboard-only build is unplayable on a phone,
so touch controls are core scope. Verifying them + their fit with OUR positioning.

---

## Touch controls — VERIFIED, clean + arcade-mapped
Looked (`touch-play.png`, phone viewport): the overlay mounts on touch devices
(`ontouchstart`/`maxTouchPoints>0`) and renders:
- **Cyan D-pad** (left): ▲ ◄ ► ▼ — move + **aim up** + **prone (down)**, the arcade scheme.
- **Action circles** (right): **JUMP** (yellow) + **FIRE** (red, larger, shows the ammo count).
- **Semi-transparent, edge-positioned, thumb-sized** (76–84px). The night-jungle gameplay
  (hero firing, red grunts, a Drone flyer, moon) stays **fully readable** underneath.

The game is now genuinely **playable on a mobile browser** — a real step toward the web/Android
goal. Multitouch (Pointer Events) allows run+aim+fire simultaneously (per touch.js), and the sim
stays deterministic (touch feeds the same input state as keyboard).

## Confirms OUR positioning advantage (vs Contra Returns)
Last cycle's teardown found the official mobile Contra (Contra Returns) has a **cluttered** F2P
touch UI (d-pad + JUMP + grenade + special-move icons + ammo meters + operator portraits +
mission objectives + boss bars). OURS is **minimal**: a d-pad + JUMP + FIRE, and nothing else on
screen. Side-by-side (`frames/contra-returns-mobile/` vs `frames/our-game-touch/`), OUR touch
build is markedly **cleaner and more arcade-authentic** — exactly the confirmed differentiator
(pixel-nostalgia + clean HUD + zero-friction browser). Strong.

## Minor polish (TOUCH-1, LOW)
On a touch device the **keyboard help line** ("←/→ or A/D move · ↑ aim · ↓ prone · Z/Space jump ·
X fire · R restart") still renders under the touch controls — mildly redundant on a phone (no
keyboard). A "TOUCH" label also shows at the left edge. Cosmetic; consider hiding keyboard hints
when the touch overlay is active. Owner: game (root.B). Not a blocker.

## Scores / gate
- No rubric-dimension change (touch is input/usability, not one of the 5 fidelity dims), but it
  **materially advances the "web/Android browser-playable" goal criterion** and reinforces the
  clean-HUD positioning. Scorecard gate note updated.

## Open issues
- **TOUCH-1 (low)** — keyboard help text (+ "TOUCH" label) still shown on touch devices; hide on touch.
- Carried: BOSS-3 (render matte, render's fix) · BOSS-2, LEAP-1, HUD-1 (low).
