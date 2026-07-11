# Assessment #5 — verify run-cycle (FID-4b) + Stage-1 boss (arcade §4)

**Date:** 2026-07-09 · **Subject:** `game/index.html` @ `0e8d80c` · **Native:** 480×270 ·
**Seed:** 1234 · **Method:** ran the current build; captured a live ground-run sequence
(pptr, hold-Right), deterministic boss-arena states (frames 1000–1900), and a fresh bench;
**looked** at every frame + a boss zoom. Evidence: `frames/our-game-run/`,
`frames/our-game-boss/`.

Two big corpus-relevant features landed (PR#24 run cycle, PR#23 boss). Verified by looking.

---

## FID-4b — player run cycle → RESOLVED
- **Fact:** fresh bench `spritesLoaded` now includes **`player_run`** and `spritesMissing`
  is **`[]`** — every declared sprite (player_idle, player_run, grunt, turret, tiles,
  explosion, muzzle) loads. Last assessment this was the top character gap (run disabled).
- **Looked:** live hold-Right sequence — the hero shows **distinct stride poses** across
  frames (legs alternating mid-run), i.e. a real animating run cycle, not a static idle.
  Git: PR#24 "real, clean player run cycle via /animate-with-skeleton (native 4-beat)".
- **Verdict:** **RESOLVED.** Character-art gaps FID-4 (idle/enemies) + FID-4b (run) are now
  both closed; the hero reads as an animated Contra soldier. (Fine 4-beat cadence quality
  is fine at gameplay zoom; a dedicated frame-step could grade individual beats later.)

## Stage-1 Sentinel boss → arcade §4 climax invariant MET
`arcade-contra-1987.md §4` records "a fixed boss is the minimum that reads as Contra."
PR#23 delivers it. **Looked (boss-arena states + zoom):**
- **Boss-climax framing ✅** — a **"SENTINEL" HP bar** spans the top (depletes as you damage
  it) + name callout; matches the boss-HUD convention of Blazing Chrome / Operation Galuga
  (`frames/blazing-chrome-2019/motion/boss-composition-~65s.png`).
- **Boss design ✅ Contra-authentic** — a **mechanical armored core** (grey plating, rivets,
  a large glowing **pink weak-point core**) behind a bullet-passable **arena rail**. Contra
  bosses are classically mechanical weak-point installations, so this reads on-lineage.
- **Telegraphed, dodgeable attack ✅ + ties in prone (arcade §2)** — slow horizontal
  **cannon volleys at standing-chest height** (`shotSpeed 2.1`, `fireEvery 82`) that a
  **prone or jumping** player ducks (seen as the red chest-height projectile in `state-1300`).
  This makes the prone mechanic *load-bearing* — exactly the arcade dodge game.
- **Honest gap vs the top bar:** the Sentinel is a single clean turret-core, smaller and
  less spectacular than Blazing Chrome's screen-filling multi-part beast. Fine for a
  Stage-1 boss / vertical slice; a larger multi-phase set-piece is a later stretch.
- **Note:** the scripted showcase input reached the arena and **died to the boss**
  (status=gameover by frame 1900) because it doesn't prone-dodge — expected (the AI-less
  timeline isn't meant to win the fight); the win-path is covered by the game's own
  32/32 self-test per PR#23.

## Scores (vs ASSESS-4)
- **Sprite & animation quality — 3.5 → 4.0** (run cycle closes the last character gap;
  all sprites load).
- **Enemy density & pacing — 3.5 → 4.0** (a boss climax adds the missing stage-structure
  beat; arcade §4 met).
- Others unchanged.

## VERIFICATION ADDENDUM (2026-07-09, same day) — 2 assumptions grounded + PRONE-1 closed

Follow-up to firm up ASSESS-5's two unconfirmed assumptions, by RUNNING the deliverable's
own behavior test + clean canvas capture (not waiting on the parent):

- **Boss win-path — CONFIRMED (fact, not a mock).** Ran `?selftest=1` (the game's in-engine
  behavior suite, real World/Player/physics): **32/32 pass**, including
  `victory.bossDefeatClears=PASS`, `boss.beatableByProne=PASS`,
  `boss.volleyProneDuckable=PASS`, `boss.volleyHitsStanding=PASS`,
  `victory.notByGoalWhileBossAlive=PASS`. So the boss IS beatable, defeating it clears the
  stage, the volley ducks under prone but hits standing, and you can't cheese the goal while
  it lives. **Assumption #1 resolved.**
- **Run cycle clean/no-blur — CONFIRMED by looking.** Clean native-res canvas grab (hold-
  Right), 5× zoom: crisp Contra stride (red bandana, muscular torso, blue harness, clear
  leg-forward/leg-back beats across `run-0..3`), **palette-locked, no blur/ghosting**.
  Evidence: `frames/our-game-run/run-*.png`. **Assumption #2 resolved.**
- **PRONE-1 — RESOLVED.** Clean prone capture (hold-Down at spawn, before contact): the hero
  **ducks flat with the gun dropped low** + muzzle-flash — matches arcade §2 ("duck under
  over-fire, hit low targets"). Evidence: `frames/our-game-prone/prone-fire.png`;
  behaviour corroborated by the selftest volley-duck checks above.

## Open issues after this assessment (updated by addendum)
- **CAP-2** — dim-3 precise competitor cadence residual (dim-2 feedback grounded).
- **HUD-1** — text weapon indicator vs falcon icon (low, carried).
- **FID-5** — optional cap-bevel polish only (low).
- **BOSS-1 (low)** — a larger/multi-phase boss set-piece is a stretch vs the top bar; the
  Stage-1 fixed-boss invariant is met.
- ~~PRONE-1~~ RESOLVED (this addendum).
