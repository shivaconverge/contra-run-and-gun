# Deploy-gate integration — weapon-defect audit (handoff to root.D)

**Status (2026-07-12):** `deploy/gate.sh` runs `verify.sh` (reachability + byte-currency)
and `live-selftest.sh` (functional), but has **NO static two-weapon audit step**. This
doc is the drop-in wiring so the creator round-2 defect is gate-enforced. The audit is
**owned by `feedback/audit/`**; the gate wire is **root.D's** (this doc only proposes it).

## Why this belongs in the gate

The two-weapon defect (`CREATOR_FEEDBACK.md` round-2) is a **deterministic FACT** of the
shipped render path — `feedback/audit/weapon-defect-audit.mjs` proves it per stage
(Layer A static invariants A1–A6 + per-stage `keys.*`), and grounds it in a real headless
browser (Layer B). Because `verify.sh`'s module resolve-gate asserts the **served ES
modules are byte-current with the local build**, auditing local `game/src` is equivalent
to auditing the live bundle — so the static FACT is authoritative for the deploy without
re-fetching the remote (parent-CONFIRMED).

Without this step a render-path regression (a baked-gun body key, a `drawGun`/
`drawTurretBarrel` on the wrong body, or a shot leaving a phantom origin) could ship green.

## Contract the audit exposes (stable — wire against these)

| Interface | Value |
|---|---|
| Command | `node feedback/audit/weapon-defect-audit.mjs` (run from repo root) |
| Exit `0` | all 7 stages clean (two-weapon FACT holds) |
| Exit `1` | ≥1 stage red — a real two-weapon / origin defect → **BLOCK** |
| Exit `2` | audit internal error |
| Machine report | `feedback/audit/report/weapon-audit.json` → `.verdict`, `.stages[].verdict`, `.layerB.grounded` |
| Human report | `feedback/audit/REPORT.md` (regenerated; carries an `## OPEN ISSUES` section on any red) |
| Console SKIP marker | `[weapon-audit] SKIP:` (same convention as `[live-selftest] SKIP:`) |

### Fail-closed static / skip-when-no-browser (matches live-selftest.sh)

- **Layer A + `keys.*` (static, no browser) is the HARD requirement.** It runs with only
  Node — no Chrome, no server — and fails-closed (exit 1) the instant any render path
  regresses. This is the two-weapon FACT.
- **Layer B (runtime grounding) SKIPS gracefully** when no headless Chrome / `puppeteer-core`
  is present: it prints `[weapon-audit] SKIP:`, marks the `runtime.*` checks `skipped`
  (never red), and the static FACT still governs the exit code. A browser that IS present
  but then a stage fails to drive, or a runtime muzzle-origin assertion goes red, is a
  **real** failure and still exits 1.
- **`WEAPON_AUDIT_STATIC_ONLY=1`** forces static-only mode (skips the browser/server
  spin-up entirely) — use this for a fast gate; reserve the full grounded run for a nightly.

Both behaviours are verified:
```
node feedback/audit/weapon-defect-audit.mjs            # grounded → PASS 7/7, exit 0
WEAPON_AUDIT_STATIC_ONLY=1 node feedback/audit/weapon-defect-audit.mjs   # static-only → PASS 7/7, exit 0, Layer B SKIPPED
```

## Drop-in snippet for `deploy/gate.sh` (root.D applies)

Add as a **hard** step (the static FACT must pass; a browserless Layer-B SKIP is tolerated,
exactly like the functional gate). Insert before the final verdict block:

```bash
# 3) Two-weapon defect FACT (static render-path, all 7 stages). HARD: a red stage
#    means a baked/second weapon or a phantom shot origin shipped — block the release.
#    Layer B (browser grounding) SKIPs cleanly with no Chrome; the static FACT governs.
line; log "3/3  two-weapon defect audit (feedback/audit)"; line
audit_out="$( (cd "${HERE}/.." && WEAPON_AUDIT_STATIC_ONLY="${WEAPON_AUDIT_STATIC_ONLY:-1}" node feedback/audit/weapon-defect-audit.mjs) 2>&1 )"
audit_rc=$?
printf '%s\n' "$audit_out"
if [ "$audit_rc" -eq 0 ]; then audit_state="PASS"; else audit_state="FAIL"; fi
```

Then fold `audit_state` into the verdict (it is a HARD requirement — a red audit blocks):

```bash
if [ "$verify_state" = "PASS" ] && [ "$audit_state" = "PASS" ] && [ "$selftest_state" != "FAIL" ]; then
  verdict="LIVE ✅"; rc=0
else
  verdict="BLOCKED ❌"; rc=1
fi
```

And add a line to the `GATE-STATUS.txt` block:

```bash
  echo "two-weapon audit:      ${audit_state}   (feedback/audit/weapon-defect-audit.mjs)"
```

> `${HERE}/..` is the repo root (`gate.sh` lives in `deploy/`); the audit resolves
> `game/src` + `game/data/config.js` relative to itself, so the `cd` is only to keep the
> report paths under `feedback/audit/`. Default `WEAPON_AUDIT_STATIC_ONLY=1` keeps the gate
> fast and browserless; drop it (or set `=0`) to demand the full browser-grounded run.

## Boundaries

- A **red audit** = a `game/src` / `game/data` render-path regression → **root.A** fixes the
  source; the audit only reports (leaves the failing stage fact + an `## OPEN ISSUES` entry).
- This doc **proposes** the gate wire; editing `deploy/gate.sh` is **root.D**'s call.
- Re-approval of the release is still a separate **creator APPROVE** in-game (see
  `feedback/RE-APPROVAL-STATUS.md`); this audit proves the defect is gone, not that the
  creator has re-accepted.
