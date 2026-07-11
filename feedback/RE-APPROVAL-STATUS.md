# Re-approval status — path from creator REJECT back to a shippable APPROVE

## ⛔ ROUND-2 FIX NOT COMPLETE — verified by LOOKING (2026-07-10). Do NOT re-request review yet.

The round-2 "two weapons per entity" fix needs BOTH halves; only one has landed:
- **Engine half — DONE** (`ff435b8`): the procedural hero gun + turret barrel are
  upgraded to quality shaded pixel art ("the sole gun once art reships weaponless
  sprites").
- **Art half — NOT DONE**: no commit reships weaponless hero/turret sprites since the
  round-2 reject (the art loop has been on the Stage-2 chopper boss). So the sprites
  STILL carry a baked weapon.

**Grounded by looking** (`feedback/frames/hero-weapon-check.png`, drove the live build
firing UP): the hero's bullets stream **straight up**, but the sprite's baked rifle
still points **diagonally up-right** — the weapon you SEE ≠ where the shot GOES. This is
exactly the creator's round-2 complaint, **still present**. → **NOT READY for
re-review**; requesting one now would earn a round-3 reject. Owner of the remaining
half: **art `assets/`** (reship hero + purple-turret sprites weaponless, or directional
frames), then re-verify by looking: one weapon per entity, drawn where it fires.

## ⛔ CREATOR RE-REVIEWED → RE-REJECTED (ROUND 2, 2026-07-10). Gate HELD.

The creator re-played the fixed build and **rejected again** (dev.json entry #3,
reject 3/5, ts 1783682770327; `CREATOR_FEEDBACK.md` "ROUND 2"). **git says 4/4 code
in-build, but the CREATOR — the authoritative signal — says #2/#3 were "fixed" in
CODE ONLY (cosmetic).** The tracker's "in-build" measures *code landed*; the creator
measures *does it actually look/work right* — and the creator wins.

**Round-2 root cause (ONE art+engine problem behind #2 AND #3):** the hero and the
purple turret each show **TWO weapons** — a weapon **baked into the sprite art** (fixed
direction) PLUS a **procedural code-drawn weapon** that aims. CR-2/CR-3 only moved the
*bullet* to the code weapon; the phantom baked weapon is still on screen. Required end
state: **exactly ONE weapon per entity, drawn where it fires** — either regenerate the
sprites weaponless (+ keep the procedural weapon, at STYLE-BIBLE pixel quality) OR
author directional/rotating weapon art. **Owner: art `assets/` + engine `game/`
(root.B).** NOT root.E. #1 (theme) and #4 (boss movement) were not re-raised in round 2.

**Gate STILL HELD.** Reopening requires a NEW artifact-bound creator APPROVE after the
two-weapons fix. Do NOT re-request review on another code-offset nudge — the creator
explicitly rejected that; verify by looking: one weapon per entity.

<details><summary>(superseded) round-1 READY snapshot</summary>
All 4 round-1 defects reached code in-build (bridge-over-water #1 wired `b20e7b4`/`883638b`;
`defect-behavior-test` 3/3). That triggered the round-2 re-review above, which re-rejected.
</details>

Owner: root.E (creator-approval gate). **Living tracker.** The release gate is
**HELD** by the real creator REJECT (`feedback/approvals/dev.json`,
`CREATOR_FEEDBACK.md`; see FINDINGS OI-6). It re-opens ONLY on a new creator
**APPROVE**, artifact-bound to a build that fixes all 4 defects. This file tracks —
**factually, from git** — whether each defect has landed in the shipped build, so
the org knows when a creator re-review is actually warranted (and doesn't request
one prematurely).

**Discipline:** entries below record what the IMPLEMENTER CLAIMS (with commit refs).
A claim is NOT a close. The creator explicitly said *"do not self-certify these as
fixed from frame comparison alone."* Only a creator APPROVE via the panel closes a
defect. root.E does not certify fixes and owns none of the `game/`/`assets/` code.

Build changed since the reject: artifact hash `36824a43…` (38 files, rejected) →
`b34a2ab7…` (40 files, current) — the current build is materially different.

## The 4 defects (from CREATOR_FEEDBACK.md / OI-6)

> **Machine-checked.** The rows below are re-derived from git+code every health
> check by `feedback/re-approval-status.mjs` (wired into `feedback/verify-all.mjs`);
> it emits `feedback/frames/re-approval-status.json`. Run `node
> feedback/re-approval-status.mjs` to re-ground this table — it cannot silently go
> stale the way the earlier hand-kept version did (row #3 lagged the turret fix).
>
> **Behaviorally grounded (stronger than comment-greps).** The two runtime-measurable
> defects are confirmed by OBSERVED behavior in the live build, per the creator's
> "verify by behavior" directive — `feedback/defect-behavior-test.mjs`
> (`feedback/frames/defect-behavior.json`, **2/2**): **#4** boss.y varies 13.74px over
> 40–200 frames (⇒ MOVES); **#2** bullets spawn 28% down the body (⇒ hands/upper, not
> waist). #1 (theme legibility) and #3 (turret barrel geometry) are visual-judgment /
> geometry — not behaviorally asserted here; the creator's re-review owns them. This
> is grounding evidence, NOT a creator close.

| # | Defect | Owner | In-build status (git+code FACT) | Creator-verified? |
|---|--------|-------|----------------------------|-------------------|
| 1 | Environment/theme: bridge over water + multi-height traversal | art `assets/` + engine `game/` | **[unwired] Art ready, NOT wired.** Bridge+water 16px tiles refined (PR#200 `f2b0a21`, `529e79c`), "art ready to wire, pending ENGINE tile slot." No `bridge`/`water` ref in `game/data/level1.js` or `game/src/render.js` yet — not placed in the level. | ❌ pending |
| 2 | Hero firing origin → the hands (was waist) | engine `game/` + art | **[in-build]** Engine fix `6109f41` ("fix hero firing origin to the hands, item #2"); code carries `player.js:150` "muzzle origin at the HANDS". Art side verified sprite CLEAN (PR#205 `dfdd433`). | ❌ pending |
| 3 | Tank/turret firing origin → the visible barrel | engine + art | **[in-build]** Fixed by `69870d5` (PR#204 `7b0657e`): turret fires from the VISIBLE BARREL TIP; barrel geometry is data (`config.js barrelPivotFromBottom`/`barrelLen`) shared by render+sim; `enemy.js:74` "fire from the visible barrel TIP". (Corrected: an earlier revision of this row said "not started" — that was stale.) | ❌ pending |
| 4 | Boss movement (static → real movement) | engine `game/` | **[in-build]** `ad7a07c` (PR#199 `54ddee9`): "boss now MOVES"; `enemy.js:102` "the Sentinel HOVERS" (deterministic vertical bob). | ❌ pending |

**Readiness verdict (factual): NOT READY for creator re-review.** 3 of 4 addressed
in-build (#2, #3, #4 — code-confirmed, not just claimed); #1 is art-ready but
unwired (engine must place the bridge/water tiles + add multi-height). Requesting
creator re-approval now would waste the creator's time on an incomplete build —
re-review is warranted once #1 is wired (then `verify-all` shows 4/4 in-build).

## Gate-reopening procedure (when all 4 are addressed)

1. Engine wires #1 (bridge+water tiles + multi-height) — the last remaining defect;
   #2/#3/#4 are already in the served build (re-confirmed by
   `node feedback/re-approval-status.mjs` → 3/4 in-build).
2. The **creator** plays the fixed served build and, if satisfied, clicks
   **APPROVE** in the panel (rating ≥3) → `⤓ EXPORT JSON`.
3. **Bind to the fixed bytes** (mandatory — an unbound approve ships any `dev` build):
   ```sh
   node feedback/release-gate.mjs --stamp <exported.json> --artifact game --build dev > feedback/approvals/dev.json
   ```
4. Gate: `node feedback/ship-decision.mjs feedback/approvals/dev.json --build dev --artifact game`
   → **SHIP** only if QA is green AND the approve is bound to the current bytes.

Until step 4 prints SHIP, wider release stays DENIED.
