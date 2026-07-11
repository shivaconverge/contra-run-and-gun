# Assessment #11 — boss phase-2 ENRAGE (BOSS-1 spectacle)

**Date:** 2026-07-10 · **Subject:** `game/index.html` @ `2ced047` · **Native:** 480×270 ·
**Method:** ran the live build; drove to the boss arena and set `boss.hp` to 35% (below
`enrageAt`=0.4) via the real game state to trigger phase-2, holding player iframe to watch
the enraged volleys render; **looked**. Evidence: `frames/our-game-boss-enrage/`.

Last cycle (ASSESS-10) I deferred verifying the boss phase-2 enrage (PR 35e71c7). Done here.

---

## Enrage verified — a real two-phase escalation (BOSS-1 substantially addressed)
Looked (`enraged-volley.png`): at hp ≤ 36 the Sentinel enters phase 2, and the spectacle
lands:
- **HP bar turns bright RED** with the label **"SENTINEL — ENRAGED"** (was plain "SENTINEL").
- **"ENRAGED!" callout** flashes.
- **Denser RED volley** — a row of red-pink chest-height projectiles (`#ff5a6e`,
  `fireEvery` 82→46, ~1.8× denser) sweeps the arena. Config keeps them chest-height so
  **prone still ducks them (fair)** — the arcade dodge game escalates but stays honest.
- The **boss mech reads as a detailed bipedal, red-accented Sentinel** (more substantial
  than the plain grey weak-point core noted at ASSESS-5).

**Verdict:** the fixed-boss climax now has a genuine **two-phase escalation + red-alert
framing** — a clear step toward the competitor boss bar. **BOSS-1 downgrades** from "single
static core" to "substantially addressed"; the remaining gap vs the Blazing-Chrome PINNACLE
(a screen-filling, multi-part beast) is a STRETCH, not required at the confirmed indie tier.

## Finding — callout position collision (BOSS-2, LOW)
In my capture the **ENRAGED callout overlaps the BOSS callout** → renders as "EN**BOSS**D!"
(both drawn at the same center slot), and it **persists** across frames (not a 1-frame fade).
Because I triggered enrage *instantly at encounter start*, both callouts were concurrently
active — so this is **likely a capture artifact** (in natural play the BOSS callout fades
seconds before the player whittles the boss to 40%). BUT the two callouts **share a screen
position**, so they *can* collide in real play (e.g., a strong weapon fast-killing to 40%
before the BOSS callout times out). Flagged LOW for the render loop to de-conflict (stagger
positions or suppress BOSS while ENRAGED). Repro: trigger enrage while the BOSS intro callout
is still on screen.

## Scores
- **Enemy density & pacing / boss — holds at 4.0**, now with a two-phase boss (quality lift
  within the score). No numeric change; BOSS-1 severity drops.

## Open issues after this assessment
- **BOSS-2 (low)** — ENRAGED/BOSS callout share a center slot; can overlap. Verify in natural
  play + de-conflict.
- **BOSS-1** — downgraded to STRETCH (multi-part set-piece vs pinnacle). · LEAP-1, HUD-1 low.
