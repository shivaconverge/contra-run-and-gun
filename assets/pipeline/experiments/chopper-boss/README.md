# Stage-2 boss: `chopper` GUNSHIP (candidate)

**Driver:** `content/stage2/SPEC.md` §4/§6 — a P0 second stage needs a mechanically
distinct 2nd boss; the spec assigns root.C (art) to "draw the chopper boss." A **wide,
MOVING aerial** gunship, deliberately unlike the tall fixed Sentinel wall-mech.

**Hitbox CONFIRMED 62×30** (`content/stage2/WIRE.md` Patch 1 — the fuselage of the
76×52 art; rotor + tail-boom excluded from collision). Frame stays the real 76×52.
**Spec (SPEC §6):** `sprites/chopper.png`, faces left,
"wide gunship silhouette, rotor blur on top, twin under-nose cannons, belly bomb bay,
match corpus palette." Sizes are a "starting box — confirm against the real art."

**Candidate (cycle 43, `chopper_candidate.png`, trimmed 76×52):** generated via
`CHOPPER_PROMPT`/`CHOPPER_SEED` in `generate.py`. **Judged by looking (raw + on a night
sky):** reads unmistakably as a wide attack-helicopter gunship boss — gunmetal steel
hull with red warning details (matches the Sentinel/`meta.palette` corpus), facing
left, main rotor + tail boom, cockpit, landing skids, glowing nose cannon. Totally
distinct silhouette from the tall wall-mech. Minor spec gaps (chin cannons / bomb bay
not super distinct; rotor is a static blade not blur) — acceptable; core read is strong.
Actual frame 76×52 (taller than the 44 start box; the rotor mast + boom add height —
root.B confirms the hitbox against this real art per the SPEC).

**Phase-2 `chopper_enraged` (cycle 44, `chopper_enraged_candidate.png`, 78×51):**
produced via `CHOPPER_ENRAGED_PROMPT`/seed 91, **init-anchored** to the base chopper
(`init_strength=180`) exactly like `boss_enraged`. **Judged by looking (`base-vs-
enraged.png`):** the SAME gunship silhouette (rotor/cockpit/boom held) escalated with
glowing red-orange belly ordnance/engine pods + scorched hull → a clear phase-2
form-change, unmistakably the same chopper. Optional per SPEC but completes the
two-phase boss spectacle matching the Sentinel's enrage.

**NOT shipped (candidate only).** The engine has no `ENEMIES.chopper` (config.js) and
does not spawn it (only `content/stage2/level2.data.js` references it, unwired). Adding
the `chopper` key now would fail my contract gate's draw-reachability (unreachable) —
correct guard. **Finalize when the engine adds the chopper kind:** re-gen (cached, $0),
pack, sync to `game/assets/`, add `manifest.json → sprites.chopper` (hitbox from
config), add `chopper` to `game/data/assets.js`; the gate + `assets.get('chopper')` (like
`assets.get('boss')`) then verify it. `chopper_enraged` (phase-2) is optional per SPEC —
produce on request. See `../../../READY-TO-WIRE.md`.
