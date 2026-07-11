# Assessment #13 — enemy fire telegraph verified + BOSS-3 root-cause corrected

**Date:** 2026-07-10 · **Subject:** `game/index.html` @ current · **Native:** 480×270 ·
**Method:** ran live; (a) polled for an on-screen turret/flyer with `telegraph>0` and captured
+ zoomed it; (b) re-examined the enraged-boss box against `render.js` after the parent
confirmed the sprite is transparent. Evidence: `frames/our-game-telegraph/telegraph.png`,
`frames/our-game-boss-enrage/enraged-sprite-distinct.png`.

---

## Enemy fire TELEGRAPH (PR#62) — VERIFIED (fairness/readability feel)
Looked (turret at `telegraph=4`, 5× zoom): a **yellow-white core wind-up glow** appears on the
turret for ~0.18s (`TELEGRAPH_FRAMES` ≈ 11) **before** its aimed shot — a clear "about to fire"
tell that makes the shot **dodgeable/fair**. It's drawn as soft additive arcs (render.js
505–512), not a box. **Modest/subtle** at gameplay scale, which is appropriate for common
enemies (you don't want a giant telegraph on every turret). This aligns OUR enemy fire with the
competitor norm (Blazing Chrome / Galuga telegraph their attacks) and improves hit-feedback
readability. No defect. Nice feel win.

## BOSS-3 root cause CORRECTED (parent flagged: the sprite is transparent)
Last cycle I filed BOSS-3 (dark rectangular box around the enraged boss) and **guessed the
cause was a sprite-export transparency defect**. **The parent verified `boss_enraged.png` is
fully transparent (corners alpha=0, clean silhouette) — my cause was WRONG.** I dug into the
render and found the real cause:

> **`render.js:493`** — the phase-2 enrage heat-glow is
> `ctx.globalCompositeOperation='lighter'; ctx.globalAlpha=pa; ctx.fillStyle='#ff2a30';`
> **`ctx.fillRect(dx, dy, dw, dh);`** — it additively tints the **ENTIRE sprite bounding
> rectangle**, NOT masked to the sprite's opaque pixels. So the (correctly-transparent) margins
> around the mech get a red wash → a visible **reddish RECTANGLE** around the boss, breaking the
> silhouette (re-confirmed by looking: hard-edged reddish box vs the clean night-jungle outside it).

- **BOSS-3 stays REAL and MEDIUM**, but re-attributed: it's a **render bug** (unmasked glow-rect),
  NOT a sprite/asset defect. The sprite is fine.
- **Fix:** mask the glow to the sprite — after `drawImage`, draw the tint with
  `globalCompositeOperation='source-atop'` (lands only on opaque pixels), or clip to the sprite.
- **Same latent pattern at `render.js:501`** (hit-flash `fillRect(dx,dy,dw,dh)`) — briefer so
  less visible, but the same box-flash bug class on any sprite with transparent margins.

## Scores
- No numeric change. Telegraph is a positive feel detail within hit-feedback (already 3.5);
  BOSS-3 still offsets the enraged-sprite gain until fixed.

## Open issues
- **BOSS-3 (MEDIUM)** — re-attributed to render.js:493 unmasked heat-glow fillRect (+ latent
  :501 hit-flash). Fix: mask glow to sprite alpha. Owner: **render (root.B)**, not assets.
- **BOSS-2 (low)** · **LEAP-1 (low)** · **HUD-1 (low)** · BOSS-1/pinnacle stretch. Telegraph ✓.
