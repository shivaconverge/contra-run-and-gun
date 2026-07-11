# Teardown — Environment / Tileset BAR (FID-5)

**Role in corpus:** ASSESS-2 found OUR *character* sprites now clear the indie-tier bar,
so the biggest remaining perceived-fidelity gap was the **environment** — ground/tiles +
background layers + set-dressing. This teardown is the **ground-truth target the render/art
loops build against**. Every claim below was written by **zooming into and looking at** the
real competitor stills in the corpus (crops from `frames/<slug>/shot-00.jpg`).

> ## UPDATE 2026-07-09 — engine reality + PR#14 response (read this first)
> **Engine reality (parent-corrected):** `render.js` has **NO tileset-blit or data-driven
> layer path** — the environment is drawn *procedurally* (`drawParallax` + `drawSolids`/
> `fillRect`). So the "16px-grid authored tileset" framing in the targets below is NOT
> directly consumable; treat it as the *look spec*, achieved procedurally.
> **PR#14 did exactly that** and it worked: a 5-layer procedural parallax (moon + hills +
> treeline + foliage) + textured grassy-cap/speckled-dirt ground + grass-topped platforms.
> **ASSESS-3 verified FID-5 is now SUBSTANTIALLY CLOSED (LOW-MEDIUM).** So the invariants
> below are validated as the right target; what remains is *refinement*, re-tiered:
> - **TIER-1 (procedural, achievable now — where the remaining gap is):** ground-cap
>   **bevel/contrast** (highlight top + dark under-lip so it reads as chunky tiles, not a
>   line); **denser, higher-contrast dirt fill** (add a darker + a lighter clod tone);
>   2–3 discrete set-dressing props scattered from `level1.js` data.
> - **TIER-2 (optional, needs engine work):** a real authored-tileset blit path in
>   render.js. Higher ceiling (hand-crafted per-tile detail like Blazing Chrome) but only
>   worth it if TIER-1 procedural polish plateaus below the bar. Not required to clear the
>   *indie* bar.

---

## What competitor environments actually do (observed at zoom)

### Gunslugs 2 — `frames/gunslugs-2/shot-00.jpg` (the realistic indie/web bar)
- **Ground = a real tileset, not a fill.** A top row of rounded **tan "cap" tiles**
  (each with a bright top highlight + a darker bottom lip, and per-tile variation), sitting
  over a **dirt-fill zone**: scattered brown pebbles/clods on near-black with occasional
  **yellow mineral speckle**. Two distinct sub-zones (cap + textured fill).
- Palette per material ≈ **3–4 values** (tan highlight → mid → dark lip → near-black fill).

### Blazing Chrome — `frames/blazing-chrome-2019/shot-00.jpg` (pixel pinnacle)
- Ground/wall is a **tiled industrial motif**: repeating vertical struts/pillars, a lighter
  **concrete band** up top, **red-brown rust/grime** in the recesses, rivets, and a solid
  dark base. Strong structural repetition + **weathering variation** so no two tiles read
  identical. Tri-tone+ (light concrete / mid grime / dark recess).

### Metal Slug 3 — `frames/metal-slug-3/shot-00.jpg` (background-depth ceiling)
- **3–4 parallax depth layers with atmospheric perspective:** far = hazy blue sky + faint
  desaturated rock (low contrast, cool); mid = a big bluish shipwreck silhouette; near-mid =
  a saturated green tree/rock cluster (high contrast); foreground = **warm tan sand with
  directional wind-ripple striations** + debris crates. Depth is sold by
  **saturation+contrast falloff with distance**, not just scroll speed.

### Contra: Operation Galuga — `frames/contra-operation-galuga-2024/shot-00.jpg` (official)
- **Material variety across planes:** foreground **metal grated catwalk** (rivets + red
  lights), **rock cliff strata** with moss/dirt, **reflective teal water** (its own layer),
  **grass tufts**, wall-mounted mechanisms, layered jungle depth. Every plane is a different
  material, each individually detailed.

---

## Extracted BAR invariants (what makes environment read as a *place*)

1. **Ground is TILED: edge-cap + textured fill.** A distinct surface/cap row (highlighted
   top, darker under-lip) over a fill zone that carries **texture** (pebbles / rivets /
   strata / ripples), never a single flat color.
2. **≥3 tone values per material** (highlight / mid / shadow) — flat single-tone fills are
   the tell of placeholder art.
3. **3–4 background layers with atmospheric perspective:** distant layers desaturated,
   lower-contrast, cooler; near layers saturated, higher-contrast, warmer. Each layer has
   its own readable silhouette (skyline → hills/structures → cliffs/trees → foreground).
4. **Set-dressing props:** crates, debris, foliage tufts, pipes/mechanisms, water — a
   handful of non-collidable details that say "someone lives/fights here."
5. **Per-stage material coherence:** one material story (jungle-rock-water / concrete-rust /
   sand-sky) so the palette reads unified.
6. **Tile variation:** repeat tiles carry small differences (cracks, wear, speckle) so the
   ground doesn't visibly loop.

---

## OUR precise gap — PRE-PR#14 BASELINE (historical; superseded by ASSESS-3)
> The table below describes the FLAT environment *before* PR#14. It's kept as the baseline
> the fix was measured against. For the CURRENT state see the UPDATE box up top + ASSESS-3.

| element | OURS now | vs BAR |
|---------|----------|--------|
| ground fill | **single flat dark-brown rectangle** | needs textured fill (strata/pebbles), ≥3 tones |
| ground cap | a thin **green dashed grass line** (good start — a cap *exists*) | make it a shaded cap tile (highlight + under-lip), not a 1px dashed line |
| background | **one flat dark-teal color** (+ 2 flat mountain triangles above) | needs 3–4 layers w/ atmospheric perspective + texture |
| platforms | **flat brown rects + 1px lighter top** | tile them (cap + fill) to match ground |
| set-dressing | **none** | add a few props (crates/foliage/pipes) |

Net: characters are competitive; the **stage reads as a gradient with a green line, not a
place.** This is the single highest-leverage fidelity lever remaining.

---

## Concrete targets, SIZED to our 480×270 canvas (for root.C — spec, not pixels)

- **Tile grid:** author on a **16px grid** (480×270 → 30×~17 tiles). Ground band is ~34px
  tall (≈2 tiles) from the play floor (y≈236) to the bottom.
- **Ground tileset (min viable):** 1 **cap/surface tile** (grass-or-metal top with
  highlight + dark under-lip) + 2–3 **fill variants** (dirt/rock with pebble/strata
  texture, ≥3 tones) + 1–2 **edge/corner tiles**. ~4–6 tiles total is enough to kill the
  flat-fill read.
- **Platforms:** reuse the same cap+fill tiles so floating platforms read as the same
  material (competitors do this).
- **Parallax:** **3 layers** minimum — (a) far skyline/haze (desaturated, ~0.2× scroll),
  (b) mid structures/hills (~0.5×), (c) near detail band just behind play (~0.8×). Apply
  the saturation/contrast falloff rule (invariant #3).
- **Set-dressing:** 3–5 small props (crate, foliage tuft, pipe/barrel) scatterable via
  `level1.js` data.
- **Priority order (highest ROI first):** (1) textured ground cap+fill tileset →
  (2) tile the platforms to match → (3) one extra mid parallax layer with texture →
  (4) set-dressing props. Items 1–2 alone would move dim-1/FID-5 the most.

**Verification hook:** once tiles land, this loop re-captures OUR ground crop and puts it
beside `frames/gunslugs-2` / `frames/blazing-chrome-2019` for a pixel side-by-side — the
verdict is the look, not a tile count.
