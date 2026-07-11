# Per-title teardown — Metal Slug 3 (SNK, 2000; the run-and-gun animation/juice PINNACLE)

**Role in corpus:** this is the SCORECARD's **"5 = pinnacle"** anchor — the hand-drawn density
ceiling that OUR game is NOT required to reach (the stated-goal bar is the pixel-revival tier =
Blazing Chrome/Gunslugs, per `blazing-chrome-2019.md` + parent confirmation), but that DEFINES
the top of every look-dimension scale. It matters concretely right now because **another loop is
actively chasing the dim-2 multi-puff explosion stretch against these exact frames** (see
`assets/pipeline/experiments/explosion-multipuff/README.md`, which grounds its candidates vs
`frames/metal-slug-3/`). This doc formalizes what "Metal Slug tier" actually IS per the frames,
so that chase has a grounded target instead of a vibe.

**Evidence (all written by LOOKING at these frames):**
| frame | what it shows |
|-------|---------------|
| `frames/metal-slug-3/shot-00.jpg` | beach; hand-painted volumetric sky; overgrown downed mech (R724); 3 heroes (prone-crawl + flamethrower w/ **big orange flame billow + smoke** + mounted gun); enemy muzzle sparks; ARMS/BOMB HUD |
| `frames/metal-slug-3/shot-01.jpg` | dark cavern; 2 heroes firing — each shot throws a **billowing white smoke puff-cloud** + shell casings; giant orange crab-monster boss + alien grunts; fire bursts on crates; dense debris floor |
| `frames/metal-slug-3/shot-02.jpg` | Mars-dusk red sky; heroes in "05" mech-slugs firing **glowing cyan plasma cannonballs** (orbs w/ tracer); a big **multi-lobe blue plasma blast** billowing off the ground; wooden-bridge terrain |

Provenance: Steam appid **250180** (`capture.json`), official developer screenshots. **STILLS
only** — no motion frames for MS3, so this grades the LOOK axes (1,2-appearance,4,5); the timing
axes (hit-stop freeze duration, run-cycle frame count) are NOT gradeable here (honest scope).

---

## The 5 rubric axes — at the pinnacle

### 1. Sprite & animation quality — PINNACLE (defines 5)
Every sprite carries **3–4 shading tiers + a rim light**; heroes (~20% screen height) read
individual fingers/straps/creases, enemies are bespoke (the crab boss in shot-01 has segmented
carapace + per-claw shading, not a recolor). Backgrounds are **hand-painted**, not tiled — the
beach wreck, cavern brick, and Mars ridge each look drawn once at full detail. This is the
per-frame hand-animation ceiling; it is explicitly ABOVE OUR tier's bar. **OUR state (dim-1
4.0):** clean readable 16-bit set at the indie bar; the gap to here is *animation density*
(more shading tiers + more run/impact frames), an explicit non-required stretch.

### 2. Hit feedback & juice appearance — PINNACLE, and the multi-puff reference
The corpus's clearest **multi-puff / billow** exemplars live here: (a) the flamethrower's
layered orange flame lobes fading into grey smoke (shot-00); (b) muzzle fire that erupts into a
**billowing white smoke CLOUD** per shot, several stacked at once (shot-01); (c) a big
**multi-lobe cyan plasma blast** rolling off the ground with a soft glow halo (shot-02). The
common structure: **2–4 overlapping soft lobes + a smoke tail + spark bits**, organic and
asymmetric — never one hard round puff, never a symmetric ring. **This is the concrete target
for the art loop's multi-puff chase** — and it explains why its single-prompt attempts failed
(a "bonfire" or a "hollow geometric ring" both miss the *layered offset lobes + smoke tail*
recipe; the README's own "composite 2–3 offset bursts with jitter" path is exactly what these
frames show). **OUR state (dim-2 4.0):** punchy single burst at the competitor bar; the
multi-lobe billow is the pinnacle headroom.

### 3. Movement cadence — NOT gradeable (stills)
No motion frames for MS3; cadence/hit-stop timing deferred (CAP-2). MS3's feel is famously
weighty/deliberate, but I will not grade a number I cannot see. Our cadence facts live in
ASSESS-1 + `cadence-dim3.md` (anchored on ARCADE Contra, the correct nostalgic-feel anchor).

### 4. Weapon juice — PINNACLE
Projectiles are **art with glow**: the cyan plasma cannonballs (shot-02) are bright orbs with a
tracer + halo, not dots; the flamethrower is a screen-reaching layered flame (shot-00). The HUD
telegraphs a weapon economy (ARMS + BOMB counts, "H"/"C" ammo). **OUR state (dim-4 4.0):** full
M/S/L/F roster, distinct color+shape identity; the standing headroom (`projectile glow/tracer`)
is exactly the delta to these glowing orbs — same item the SCORECARD already lists.

### 5. Enemy density & pacing — PINNACLE-HIGH
shot-01 packs 2 heroes + 3–4 grunts + a screen-filling crab boss + fire + debris, still readable
via silhouette/rim contrast; shot-02 stacks mechs + plasma + terrain. Density is high but never
mud. **OUR state (dim-5 4.0):** 23 spawns / 3–5 concurrent + two-phase boss — in-band on count;
the gap is set-piece SCALE (MS3's boss dwarfs the player), i.e. the same BOSS-1 stretch.

---

## Net positioning (what this anchor tells the gate)
Metal Slug 3 is the **ceiling, not the bar**. OUR game does not need to reach it to clear the
stated goal — but MS3 is what "5" MEANS on every look axis, and, most usefully this cycle, it is
the **grounded target for the multi-puff explosion stretch**: the recipe is *layered offset
lobes + smoke tail + sparks*, which points at compositing (as the art loop's own experiment
concluded), not a single generated puff. Every OUR-game gap to MS3 is an already-listed,
non-blocking stretch (animation density, projectile glow, boss scale) — none are regressions.

## Honest scope
- STILLS only → axes 1/2-appearance/4/5 graded; **timing axes (3, hit-stop duration) NOT graded**
  (no motion frames). Stated, not hidden. Capturing MS3 motion (a trailer frame-grab like BC's)
  would let a future cycle grade its hit-stop — logged as an optional extension, not a blocker.
- MS3 is co-op/3-player in these shots; OUR subject is single-player — the extra heroes inflate
  the on-screen count, so the density read is of the SCENE, not a per-player target.
