# CREATOR FEEDBACK — REAL HUMAN, not AI-vision (authoritative)

**Verdict: REJECT for wider release.** Rating 3/5. Source: the human creator played the
served build (`buildId: dev`, arcade + casual, reached boss / cleared) and submitted this via
the in-game feedback panel. This is a **real player preference signal** — the scope item
"Creator-approved via an in-game feedback panel" is **NOT met** until these are addressed.
Treat it as ground truth that **overrides the AI-vision fidelity self-score** where they
disagree (the self-score rated sprites ~4.0; a human immediately caught firing-origin and
boss-movement defects the frame-comparison missed).

## The creator's notes, verbatim
> background looks very simple.. compared to other games... also theme of this level is not
> clear... original one had bridge and water..and you can move at mutiple levels (heights)....
> also charector firing looks to be firing from a secondary gun which is at its waist but not
> its hands... similarly tanks looks like have secondary turret not the one in sprite and
> firing from it... also boss has no movement

## Actionable breakdown (do not close until each is fixed AND re-verified by looking)

1. **Environment depth & level theme** *(owner: art `assets/` + engine `game/` render/level)*
   - Background reads too **simple/generic vs the reference corpus**; the **stage theme is not
     legible**. The arcade Contra Stage 1 is unmistakably a **jungle with a BRIDGE over WATER**.
   - Add a **clear, themed setting** (bridge + water motif) and **multi-height traversal** —
     the original lets you move between **multiple vertical levels/heights**, not one flat plane.

2. **Hero firing origin is wrong** *(owner: engine `game/` + art `assets/`)*
   - The shot appears to originate from a **secondary gun at the hero's waist**, not from the
     **gun in his hands**. Muzzle/projectile spawn must come from the **hand-held weapon**.

3. **Tank/turret firing-origin mismatch** *(owner: engine + art)*
   - Tanks look like they fire from a **secondary/implicit turret**, not the **turret drawn in
     the sprite**. Align the firing origin with the **visible barrel** in the sprite.

4. **Boss has no movement** *(owner: engine `game/`)*
   - The boss is **static**. It needs real movement (reposition / lunge / pattern shift), not
     just telegraphed volleys from a fixed pose.

## How to close this
Only a **new creator APPROVE** (via the same panel, artifact-bound to a build that fixes the
above) clears the gate. Do not self-certify these as fixed from frame comparison alone — the
human eye caught what the vision score missed; re-verify against this list.


---

# CREATOR FEEDBACK — ROUND 2 (still REJECT): the firing-origin fixes were COSMETIC

**The turret is STILL wrong.** CR-2 (hero) and CR-3 (turret) were "fixed" in CODE only —
you moved the procedural weapon's origin, but you did NOT fix the actual defect. The gate
stays **REJECT**. This is the ROOT CAUSE behind BOTH #2 and #3 — treat them as ONE art problem.

## The creator's round-2 note, verbatim
> turret is still wrong. mark this problem both of main character sprite and canon (purple,
> firing straight) with turret... they both have their own gun/weapon (in the sprite) AND a
> procedural drawn-over one which moves. Remedy: the sprite should not carry its own weapon
> (or use proper directional/rotating art) so only the procedural aiming weapon shows — ONE gun.

## Root cause (applies to hero AND turret/cannon)
Each of these entities has **TWO weapons on screen**:
1. a **weapon baked into the sprite art** (fixed direction), and
2. a **procedural, code-drawn weapon** overlaid on top that **rotates/aims** at the player
   (hero: `drawGun` + muzzle; turret: `drawTurretBarrel`).

Because the baked sprite weapon can't aim, the code draws a second one — so you SEE two guns
(the "second gun at the waist" / "phantom turret" from round 1). Aligning the *bullet* to the
*code* weapon (what CR-2/CR-3 did) does nothing about the baked sprite weapon still sitting there.

## The remedy (a coordinated fix — NOT another code-offset nudge)
For **both** the hero (`player_*`) and the **purple turret/cannon**, the required end state is:
**exactly ONE weapon per entity, and it points where the shot actually goes.** Reaching that
takes two things done together (figure out the split yourselves):
- **The sprite art must stop carrying a conflicting weapon** — regenerate the sprites with NO
  baked-in weapon (just body/base/dome), OR author proper **directional/rotating** weapon art
  (multi-angle frames or a separable, rotatable barrel) that can point in the aim direction.
- **The build must show the right sprite/frame AND fire from its matching point** — select the
  correct sprite (or barrel frame) for the current aim and spawn the shot from *that* sprite's
  real muzzle, so the weapon you see and the weapon that fires are the same one.

**Grounded reference (use the corpus):** the 1987 arcade Contra solves the hero with
**directional aim frames** — 8-way poses where the rifle is drawn *in the pose, pointing the
aim direction* (see `reference/frames/arcade-contra-1987/stage1/hero-8way-aim-native-~53s.png`).
Rotating-barrel-over-weaponless-base is the canonical turret solution in every arcade game.

**Quality bar:** if you choose the weaponless-sprite + procedural-weapon route, the procedural
weapon must be drawn to the SAME pixel-art quality as the sprite (real pixel gun, shading,
palette from the STYLE-BIBLE) — swapping "two guns" for "one crude rectangle gun" is a fail.

Do not "fix" this again by only nudging code offsets under the old sprite. Verify by looking:
**one** weapon per entity, drawn exactly where it fires. Only a new creator APPROVE clears the gate.
