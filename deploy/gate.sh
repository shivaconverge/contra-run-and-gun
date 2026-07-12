#!/usr/bin/env bash
# RELEASE GATE — the single command that authorizes "the campaign is LIVE and
# sound at the public URL." Runs BOTH deploy checks against the DEPLOYED bundle
# and emits one combined verdict, so ship authorization is reproducible and not a
# hand-assembled judgment:
#
#   1) verify.sh        REACHABILITY + byte-CURRENCY — every referenced asset and
#                       every audio track serves HTTP 200 AND matches the local
#                       build byte-for-byte (public URL is current with master).
#   2) live-selftest.sh FUNCTIONAL soundness — the served build passes its OWN
#                       in-browser regression suite incl. the 7-distinct-stage
#                       campaign invariants (skips gracefully if no headless Chrome).
#   3) weapon audit     The creator-rejected TWO-WEAPON defect FACT — a deterministic
#                       static render-path audit over all 7 stages (feedback/audit/
#                       gate-step.sh). HARD: a red (a baked/second weapon or phantom
#                       shot origin) BLOCKS the release. SKIPs only if node absent.
#
#   ./deploy/gate.sh
#   URL=https://owner.github.io/repo/ ./deploy/gate.sh
#
# Exit 0 only if reachability+currency passes, the functional gate does not FAIL,
# and the two-weapon audit does not FAIL (a SKIPPED functional or weapon gate does
# not fail the release — reachability+currency is the hard requirement; the others
# are additional assurances, one needing a browser, one needing node). Writes
# deploy/GATE-STATUS.txt.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
STATUS="${HERE}/GATE-STATUS.txt"
STAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

log()  { printf '\033[36m[gate]\033[0m %s\n' "$*"; }
line() { printf '%s\n' "----------------------------------------------------------------"; }

# 1) Reachability + currency (HARD requirement).
line; log "1/3  reachability + byte-currency  (verify.sh)"; line
if bash "${HERE}/verify.sh"; then verify_rc=0; else verify_rc=$?; fi

# 2) Functional soundness (skips cleanly with no browser → treated as non-blocking).
line; log "2/3  functional self-test on the deployed build  (live-selftest.sh)"; line
selftest_out="$(bash "${HERE}/live-selftest.sh" 2>&1)"; selftest_rc=$?
printf '%s\n' "$selftest_out"
# Distinguish a real SKIP (no browser / no python) from a genuine pass/fail.
if printf '%s' "$selftest_out" | grep -q '\[live-selftest\] SKIP:'; then
  selftest_state="SKIPPED"
elif [ "$selftest_rc" -eq 0 ]; then
  selftest_state="PASS"
else
  selftest_state="FAIL"
fi

# 3) Two-weapon defect audit (HARD FACT; skips cleanly with no node → non-blocking).
line; log "3/3  creator two-weapon defect audit  (feedback/audit/gate-step.sh)"; line
weapon_out="$(bash "${HERE}/../feedback/audit/gate-step.sh" 2>&1)"; weapon_rc=$?
printf '%s\n' "$weapon_out"
# Classify off the WRAPPER's terminal verdict line, which gate-step.sh prints only
# AFTER its toolchain check. (Static-only mode always emits an internal
# "[weapon-audit] SKIP: Layer-B ..." line even on a clean PASS, so a bare SKIP grep
# would mislabel a real PASS/FAIL — key off PASS:/FAIL: instead.) A run with neither
# verdict line means the wrapper exited early on an absent toolchain → real SKIP.
if printf '%s' "$weapon_out" | grep -q '\[weapon-audit\] FAIL:'; then
  weapon_state="FAIL"
elif printf '%s' "$weapon_out" | grep -q '\[weapon-audit\] PASS:'; then
  weapon_state="PASS"
else
  weapon_state="SKIPPED"
fi
[ "$weapon_rc" -ne 0 ] && weapon_state="FAIL"   # rc is authoritative for a block

verify_state=$([ "$verify_rc" -eq 0 ] && echo PASS || echo FAIL)

# Verdict: reachability MUST pass; functional and the two-weapon audit must not
# FAIL (SKIP is tolerated for both).
if [ "$verify_state" = "PASS" ] && [ "$selftest_state" != "FAIL" ] && [ "$weapon_state" != "FAIL" ]; then
  verdict="LIVE ✅"; rc=0
else
  verdict="BLOCKED ❌"; rc=1
fi

TARGET_URL="${URL:-https://shivaconverge.github.io/contra-run-and-gun/}"
{
  echo "=== RELEASE GATE @ ${STAMP} ==="
  echo "URL:                 ${TARGET_URL}"
  echo "reachability+currency: ${verify_state}   (verify.sh)"
  echo "functional self-test:  ${selftest_state}   (live-selftest.sh)"
  echo "two-weapon audit:      ${weapon_state}   (feedback/audit/gate-step.sh)"
  echo "VERDICT:             ${verdict}"
} | tee "$STATUS"

# OPERATE-phase audit trail: append every ship decision (never overwrite) so we
# keep a durable history of what was authorized live and when — GATE-STATUS.txt
# only holds the latest. Records the commit SHA actually gated, so a ship can be
# traced back to a master revision.
LOG="${HERE}/DEPLOY-LOG.md"
SHA="$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || echo '?')"
if [ ! -f "$LOG" ]; then
  {
    echo "# Deploy / ship-authorization log"
    echo ""
    echo "Append-only audit trail of \`gate.sh\` verdicts (newest at bottom). Each row"
    echo "is one release-gate run against the live public URL."
    echo ""
    echo "| UTC timestamp | commit | reach+currency | functional | two-weapon | verdict |"
    echo "|---|---|---|---|---|---|"
  } > "$LOG"
fi
printf '| %s | `%s` | %s | %s | %s | %s |\n' \
  "$STAMP" "$SHA" "$verify_state" "$selftest_state" "$weapon_state" "$verdict" >> "$LOG"

line
if [ "$rc" -eq 0 ]; then
  printf '\033[32m[gate] SHIP AUTHORIZED\033[0m — %s\n' "$verdict"
else
  printf '\033[31m[gate] SHIP BLOCKED\033[0m — reachability=%s functional=%s\n' "$verify_state" "$selftest_state"
fi
log "status -> $STATUS"
exit "$rc"
