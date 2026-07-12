# Deploy-gate integration — weapon-defect audit (handoff to root.D)

**Status (2026-07-12, re-checked):** ⚠️ **STILL NOT WIRED.** `deploy/gate.sh` (now 92
lines, after root.D added the append-only `DEPLOY-LOG.md` audit trail in `e17bc3a`) runs
only `verify.sh` (reachability + byte-currency) and `live-selftest.sh` (functional) —
`grep -rn weapon deploy/` finds **nothing**. So the creator round-2 two-weapon defect,
though proven clean 7/7 today, is **gate-unenforced**: a future render-path regression
could ship green. This doc is the drop-in wire; the gate edit is **root.D's** (this slice
owns only `feedback/audit/`, cannot touch `deploy/`). To remove all friction, the wire is
now a **single line** calling `feedback/audit/gate-step.sh` (below). **Ask to root.D:
adopt the one-line step as a HARD gate stage.**

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

## Drop-in snippet for `deploy/gate.sh` (root.D applies) — ONE line

`feedback/audit/gate-step.sh` is a self-contained wrapper (resolves the repo root
relative to itself, runs the audit fast/static-only, prints one `[weapon-audit]`
summary line, fail-closed exit code). So the whole wire is a single call — no
multi-block paste, no `cd`/env bookkeeping. Insert before the final verdict block:

```bash
# 3) Two-weapon defect FACT (static render-path, all 7 stages). HARD: a red stage
#    means a baked/second weapon or a phantom shot origin shipped — block the release.
line; log "3/3  two-weapon defect audit (feedback/audit)"; line
audit_out="$(bash "${HERE}/../feedback/audit/gate-step.sh" 2>&1)"; audit_rc=$?
printf '%s\n' "$audit_out"
# A missing toolchain prints "[weapon-audit] SKIP:" and rc 0 (tolerated like the
# functional gate); a real red stage is rc 1. Set WEAPON_AUDIT_REQUIRE=1 to make a
# missing toolchain HARD-fail instead.
if printf '%s' "$audit_out" | grep -q '\[weapon-audit\] SKIP:'; then audit_state="SKIPPED";
elif [ "$audit_rc" -eq 0 ]; then audit_state="PASS"; else audit_state="FAIL"; fi
```

Then fold `audit_state` into the verdict (a red audit blocks; SKIP is tolerated):

```bash
if [ "$verify_state" = "PASS" ] && [ "$audit_state" != "FAIL" ] && [ "$selftest_state" != "FAIL" ]; then
  verdict="LIVE ✅"; rc=0
else
  verdict="BLOCKED ❌"; rc=1
fi
```

And add a line to the `GATE-STATUS.txt` block:

```bash
  echo "two-weapon audit:      ${audit_state}   (feedback/audit/gate-step.sh)"
```

> `${HERE}/../feedback/audit/gate-step.sh` — `gate.sh` lives in `deploy/`, so `${HERE}/..`
> is the repo root. The wrapper itself resolves the repo root relative to its own location,
> so it also works if invoked from any CWD. It defaults to `WEAPON_AUDIT_STATIC_ONLY=1`
> (fast, no browser — verify.sh byte-currency makes local `game/src` authoritative for the
> live bundle); export `WEAPON_AUDIT_STATIC_ONLY=0` before the call to also drive the
> browser grounding (it self-SKIPs with no Chrome).

### Verified behaviour (this cycle)

```
bash feedback/audit/gate-step.sh                       # → PASS 7/7, rc 0, one [weapon-audit] PASS line
PATH=/bin:/usr/bin bash feedback/audit/gate-step.sh    # no node → [weapon-audit] SKIP, rc 0 (tolerated)
PATH=/bin:/usr/bin WEAPON_AUDIT_REQUIRE=1 bash …/gate-step.sh   # no node + REQUIRE → rc 1 (hard fail)
```

## Boundaries

- A **red audit** = a `game/src` / `game/data` render-path regression → **root.A** fixes the
  source; the audit only reports (leaves the failing stage fact + an `## OPEN ISSUES` entry).
- This doc **proposes** the gate wire; editing `deploy/gate.sh` is **root.D**'s call.
- Re-approval of the release is still a separate **creator APPROVE** in-game (see
  `feedback/RE-APPROVAL-STATUS.md`); this audit proves the defect is gone, not that the
  creator has re-accepted.
