# Visual grounding — looked-at review of the two-weapon defect

The creator round-2 REJECT is a **visual** complaint ("the main character sprite and
the cannon look like they have a second weapon"). The numeric audit
(`weapon-defect-audit.mjs` Layer A + B) proves the render path draws one weapon and the
shot leaves the drawn muzzle — but a number is not a look. This doc records the
**multimodal, eyes-on** grounding: the audit now captures the REAL 480×270 frame the
shipped build renders per stage (`report/frames/stage<N>-<theme>.png`, `B4`), and a
reviewer LOOKS at them. CV metrics are only a pre-filter; the verdict below is the eyes.

## 2026-07-12 — reviewed frames (hero mid-run, firing; showcase captures)

Captured by `node feedback/audit/weapon-defect-audit.mjs` (headless showcase, `frames=60`,
fire held the whole run so the hero's weapon is extended). Looked at 4 of 7 spanning the
distinct biomes + the armed enemy mix that appears near each level's start:

| Frame | Armed entities in view | Looked-at verdict |
|---|---|---|
| `stage1-jungle.png` | hero (mid-jump, firing right), grunt | Hero holds **one** rifle with a single muzzle flash — no gun baked beside it. Grunt is a single sprite, no weapon overlay. ✅ one weapon each |
| `stage3-snow.png` | hero (firing right), grunts, copper drone (flyer) | Hero **one** rifle + muzzle flash. Grunts single sprites. Drone at upper-right is a single body, no barrel overlay. ✅ |
| `stage5-foundry.png` | hero (firing right), **turret** (firing left), grunts | Turret shows its dome + **one** rotating barrel firing a single stream toward the hero — no second baked gun on the hull. Hero one rifle. ✅ |
| `stage7-fortress.png` | hero (firing right), **turret** (aimed), grunts | Turret = dome + **one** barrel, no baked weapon beside it. Hero one rifle. ✅ |

**Verdict:** in every frame looked at, each armed entity shows **exactly one weapon**,
drawn where its shot originates. No sprite-baked gun sits beside a procedural aiming
weapon; no turret shows a second barrel. This is consistent with the numeric FACT
(Layer A A1–A7 + Layer B B1–B3 all green, 7/7). **No two-weapon defect observed.**

Boss/chopper are not in these early-level frames (they spawn in the arena tail); their
weaponless draw is proven statically by `A6` (dedicated `drawBoss`/`drawChopper` invoke
no procedural weapon). A future pass can capture an in-arena boss frame for eyes-on boss
grounding — logged as a nice-to-have, not a gap in the FACT.

## How to regenerate + look

```
node feedback/audit/weapon-defect-audit.mjs      # writes report/frames/stage<N>-<theme>.png
```
Then open the PNGs (they are also embedded per-stage in `REPORT.md`) and confirm one
weapon per armed entity. If a frame ever shows two weapons on one body, that is a REAL
source defect → **root.A** (`game/src/render.js` / the sprite art), and it must be filed
as an OPEN ISSUE with the offending frame, never masked.
