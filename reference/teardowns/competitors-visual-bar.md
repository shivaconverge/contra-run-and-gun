# Teardown — Competitor Visual/Feel BAR (the fidelity we must match or exceed)

**Role in corpus:** the arcade-1987 teardown guards the *soul* (nostalgic invariants);
THIS doc sets the *gloss bar* — what today's popular run-and-guns actually look like, so
"matches or exceeds their visual and gameplay fidelity" has a concrete target. Every line
below was written by **looking at** real official gameplay screenshots now in the corpus.

**Evidence (official Steam gameplay stills, provenance in each dir's `capture.json`):**
| slug | title | appid | what the shots show |
|------|-------|-------|---------------------|
| `blazing-chrome-2019` | Blazing Chrome | 609110 | 16-bit co-op; weapon-slot HUD; dense biomech interior; melee slash arc + golden muzzle flash; gibs/debris |
| `contra-operation-galuga-2024` | Contra: Operation Galuga | 2235020 | official 2.5D Contra; **P1 Bill / P2 Lance + M/S/F falcon weapon-slot HUD**; jungle-waterfall Stage-1; spread + flamethrower; boss firing a spinning fire orb |
| `metal-slug-3` | Metal Slug 3 | 250180 | beach co-op; ARMS/BOMB HUD; flamethrower + muzzle flash; downed R724 mech; ultra-dense hand-drawn sprites |
| `huntdown-2020` | Huntdown | 598550 | neon-noir; portrait+health+ammo co-op HUD, "CRITICAL"/"REVIVE 07"; huge flamethrower billow; shop price board; theater set dressing |
| `gunslugs-2` | Gunslugs 2 | 340750 | chunky low-res pixel; heart+coin HUD; big segmented boss; onomatopoeia SFX text ("UMPFUMPF") — the indie/mobile-scale bar |

> **HONEST SCOPE:** these are **stills**, so they ground the *look* dimensions
> (sprite/animation quality, weapon-juice appearance, enemy density, HUD) — NOT the
> *motion* dimensions (hit-stop snap, movement cadence). Motion still needs footage/live
> capture (OPEN ISSUE CAP-2). Frame counts of run/jump cycles cannot be read from a still.

---

## Per-dimension BAR (what OUR 480×270 slice must reach)

### 1. Sprite & animation quality — BAR: high
- **What I see:** every title has **strong hero silhouettes** that pop off busy
  backgrounds via rim/outline contrast (Galuga's blue-black Bill on green jungle;
  Blazing Chrome's tan soldier on red-metal). Enemies are individually detailed, not
  color-blobs. Metal Slug is the density ceiling (hand-animated, per-frame shading).
- **OUR gap (FID-4):** our hero/enemies are procedural blocks (red-square Grunt, blob
  Sentry). This is the #1 fidelity deficit. **Target for the art loop:** a hero sprite
  with a readable 1–2px darker outline and ≥6-frame run cycle; enemies with distinct
  silhouettes, never a plain rectangle. At 480×270 a hero ~20px tall is right (Galuga/BC
  heroes are ~12–16% of screen height — our 20/270 = 7.4% is a touch SMALL; consider a
  slightly larger hero or tighter camera).

### 2. Hit feedback & hit-stop — BAR: high (partially gradeable from stills)
- **Visible juice:** muzzle flash on *every* firing sprite; Huntdown/MSlug/Galuga show
  **large fire/explosion billows** with layered smoke + sparks + flying debris. Impacts
  read instantly.
- **OUR state:** we have muzzle flash + death particles + hit-stop/trauma kernel (good
  foundation), but projectiles/impacts are plain squares. **Target:** multi-frame impact
  sparks and chunkier muzzle flashes; keep the hit-stop kernel (already present).
- **Ungradeable from stills:** freeze-frame duration, shake decay — CAP-2 motion pass.

### 3. Movement cadence — BAR: not gradeable from stills
- Stills can't show run speed / jump arc. Deferred to CAP-2 (footage/live capture of a
  competitor to frame-measure). Our computed cadence facts live in ASSESS-1.

### 4. Weapon juice — BAR: very high
- **What I see:** flamethrowers throw *screen-spanning* layered flame (Huntdown, MSlug,
  Galuga); guns have bright muzzle flash + tracer; Blazing Chrome adds a melee slash arc;
  Galuga's boss fires a telegraphed spinning fire-orb. Projectiles are **art**, not dots.
- **OUR gap:** Spread fan + muzzle flash exist and read, but bullets are plain squares and
  the Spread is cyan (competitors favor warm muzzle-flash palettes). **Target:** tracer/
  glow on projectiles, warmer flash, a bigger Spread signature. Juice is a strong lever
  because it's cheap relative to full sprite art and closes perceived-fidelity fast.

### 5. Enemy density & pacing — BAR: medium-high
- **What I see:** 3–6 active threats on screen is normal (Galuga: boss + 2 grunts + orb +
  fodder; Huntdown: shooter + 2 enemies + hazards). Never empty; always something to shoot
  — the run-and-gun pressure invariant, richly met.
- **OUR gap (FID-3):** typically 1 on-screen enemy → reads calm. **Target:** 3+ concurrent
  threats during firefights; overlap spawns so the screen is never idle.

---

## Cross-title findings that update OUR open issues

### FID-1 (one-hit-death) — RESOLVED: game adopted the arcade invariant (with a nuance)
**Correction (2026-07-09):** an earlier draft here recommended "keep the health bar" —
that was WRONG and based on a stale note. **The game already implements ONE-HIT DEATH**
(PR#5; `config.js` cites this corpus by name; verified by code + re-captured LIVES-only
HUD). So there is no health-bar to keep — the game matches the arcade anchor.
**The still-useful nuance from the competitor evidence:** Operation Galuga (official 2024
Contra) shows **per-player health bars + x3 lives**, and Huntdown shows a **health bar +
revive timer**. The modern competitive set — including the *official* Contra — chose
**health, not one-hit-death**. So OUR one-hit-death is an **arcade-purist bet**: maximally
faithful to 1987, but *divergent from the modern-accessibility norm* the "players prefer
it" goal must beat. Not a defect — a design bet to **track against player preference**;
an optional casual/health mode is the obvious hedge if data favors accessibility.

### HUD parity (new — HUD-1, LOW)
Every competitor uses a **weapon-slot / inventory HUD** and (co-op titles) **player
portraits + health**. Galuga uses the classic **M/S/F falcon icons** — a free nostalgia
signal. OUR HUD (SCORE/LIVES/weapon-name/health-pips) is functional but text-only for the
weapon. **Cheap win:** an iconized weapon indicator (falcon-style) would raise nostalgic
fidelity at trivial cost. Owned by game/HUD loop; corpus flags it.

---

## MOTION: hit-feedback & juice BAR (CAP-2, partially grounded 2026-07-09)

Grounded by frame-grabbing **official Steam trailers** (tool: `fetch-trailer-frames.mjs`);
curated gameplay frames in `frames/blazing-chrome-2019/motion/` +
`frames/huntdown-2020/motion/`. **Honest limit:** trailers are edited (unknown zoom/scroll/
fps) so these ground hit-FEEDBACK, weapon-JUICE, explosion-scale, and boss/density framing
IN MOTION — but **NOT precise movement cadence** (dim 3 px/frame), which still needs same-
scale in-engine competitor capture. Dim 3 stays open under CAP-2.

**What the feedback/juice bar looks like in motion (observed):**
- **Explosions are large, warm, layered, multi-frame** with flying debris + (Huntdown)
  blood-spray particles — they dominate the screen for a beat. (`bc/…-explosion…`, `hd/…-explosion…`)
- **A loud INFORMATIONAL feedback layer (Huntdown):** floating **damage numbers**, combat-
  text callouts (**"DOUBLE KILL!", "WEAPONS COMBO!", "EXPLOSIVE!"**), and a **kill-streak
  counter** — the game *celebrates* kills, not just registers them.
- **Special-move VFX (Blazing Chrome):** a bright ringed dash/shield bubble reads clearly
  over the action — signature moves get their own legible effect.
- **Boss framing:** scale contrast (tiny co-op heroes vs a screen-filling boss) + a "BOSS"
  callout — encounters are staged, not just bigger enemies.

**OUR game vs this bar (from `frames/our-game-motion/` + ASSESS-2):**
- HAVE (physical juice): muzzle flash, Spread fan, an explosion sprite, death particles,
  hit-stop + trauma screen-shake kernel, i-frame white-blink. Solid *physical* feedback.
- GAP: no **informational/celebratory** layer (damage numbers / combat-text / streaks), and
  explosions are smaller/less dense than the bar. Adding a modest hit-spark + bigger
  explosion closes the *physical* gap cheaply.
- **NUANCE (nostalgia tension):** the arcade anchor (`arcade-contra-1987.md`) is *minimal* —
  no damage numbers, no combo text (one-hit death, spare HUD). Huntdown's loud text layer is
  a **modern-juice choice that trades arcade minimalism for dopamine**. Recommend: match the
  *physical* juice (universal); treat the *text/number* layer as an **optional** modern mode,
  not a default — same purist-vs-accessibility axis as one-hit-death (FID-1). Track vs player
  preference; don't bolt combo-text onto a nostalgia build by reflex.

## What this unblocks
- Dimensions **1, 4, 5** = **pixel side-by-sides** (OUR frame vs stills). Dimension **2**
  (hit-feedback/juice) now has **motion** grounding (this section). Dimension **3**
  (precise cadence) still needs same-scale in-engine competitor capture — CAP-2 residual.
