#!/usr/bin/env bash
# feedback/audit/gate-step.sh
# ============================================================================
# ONE-LINE deploy-gate step for the creator round-2 TWO-WEAPON defect FACT.
# Self-contained so deploy/gate.sh (root.D) can wire the audit with a single call
# instead of pasting a multi-block snippet:
#
#     bash "${HERE}/../feedback/audit/gate-step.sh"   # rc 0 = clean, 1 = a stage is red → BLOCK
#
# It resolves the repo root relative to ITSELF (works from any CWD), runs the
# deterministic audit, prints ONE summary line, and returns a fail-closed exit code
# on the static two-weapon FACT. See INTEGRATION.md for how to fold the result into
# the gate verdict + GATE-STATUS.txt.
#
# Contract (stable):
#   exit 0  → all 7 stages clean (two-weapon FACT holds)   → gate PASS
#   exit 1  → >=1 stage red (a real two-weapon / origin defect) → gate BLOCK
#   exit 0 + "[weapon-audit] SKIP:" on stdout → toolchain absent (no node);
#             tolerated like live-selftest.sh's browser SKIP — the FACT is enforced
#             whenever the toolchain is present. Set WEAPON_AUDIT_REQUIRE=1 to make a
#             missing toolchain HARD-fail instead (rc 1).
#
# Env:
#   WEAPON_AUDIT_STATIC_ONLY  default 1 — fast, deterministic, no browser/server.
#                             verify.sh byte-currency makes local game/src === the
#                             live bundle, so the static render-path FACT is
#                             authoritative for the deploy. Set 0 to also drive the
#                             browser grounding (Layer B); it self-SKIPs with no Chrome.
#   WEAPON_AUDIT_REQUIRE      default 0 — if 1, a missing node toolchain fails the gate.
# ============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"           # .../feedback/audit
REPO="$(cd "${HERE}/../.." && pwd)"             # repo root (feedback/audit/ -> repo)
AUDIT="${HERE}/weapon-defect-audit.mjs"

# Toolchain present? The FACT needs node. Absent → SKIP (tolerated) unless REQUIRE=1.
if ! command -v node >/dev/null 2>&1; then
  echo "[weapon-audit] SKIP: node not found — two-weapon FACT not computed on this runner"
  [ "${WEAPON_AUDIT_REQUIRE:-0}" = "1" ] && { echo "[weapon-audit] REQUIRE=1 → treating missing toolchain as FAIL"; exit 1; }
  exit 0
fi
if [ ! -f "$AUDIT" ]; then
  echo "[weapon-audit] SKIP: audit script missing ($AUDIT)"
  [ "${WEAPON_AUDIT_REQUIRE:-0}" = "1" ] && exit 1
  exit 0
fi

# Run the audit from the repo root so its report/ writes land under feedback/audit/.
out="$( (cd "$REPO" && WEAPON_AUDIT_STATIC_ONLY="${WEAPON_AUDIT_STATIC_ONLY:-1}" node "$AUDIT") 2>&1 )"
rc=$?
printf '%s\n' "$out"

# One clear summary line in the [weapon-audit] convention the gate can grep.
verdict_line="$(printf '%s\n' "$out" | grep -E 'WEAPON-DEFECT AUDIT:' | tail -1)"
if [ "$rc" -eq 0 ]; then
  echo "[weapon-audit] PASS: ${verdict_line:-7/7 stages clean} (two-weapon FACT holds)"
else
  echo "[weapon-audit] FAIL: ${verdict_line:-a stage is red} — a baked/second weapon or phantom shot origin. BLOCK the release; a red is a game/src regression → root.A. Report: feedback/audit/REPORT.md (## OPEN ISSUES)."
fi
exit "$rc"
