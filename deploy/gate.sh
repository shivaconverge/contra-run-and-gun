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
#
#   ./deploy/gate.sh
#   URL=https://owner.github.io/repo/ ./deploy/gate.sh
#
# Exit 0 only if BOTH gates pass (a SKIPPED functional gate does not fail the
# release — reachability+currency is the hard requirement; the functional gate is
# an additional assurance that needs a browser). Writes deploy/GATE-STATUS.txt.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
STATUS="${HERE}/GATE-STATUS.txt"
STAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

log()  { printf '\033[36m[gate]\033[0m %s\n' "$*"; }
line() { printf '%s\n' "----------------------------------------------------------------"; }

# 1) Reachability + currency (HARD requirement).
line; log "1/2  reachability + byte-currency  (verify.sh)"; line
if bash "${HERE}/verify.sh"; then verify_rc=0; else verify_rc=$?; fi

# 2) Functional soundness (skips cleanly with no browser → treated as non-blocking).
line; log "2/2  functional self-test on the deployed build  (live-selftest.sh)"; line
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

verify_state=$([ "$verify_rc" -eq 0 ] && echo PASS || echo FAIL)

# Verdict: reachability MUST pass; functional must not FAIL (SKIP is tolerated).
if [ "$verify_state" = "PASS" ] && [ "$selftest_state" != "FAIL" ]; then
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
    echo "| UTC timestamp | commit | reach+currency | functional | verdict |"
    echo "|---|---|---|---|---|"
  } > "$LOG"
fi
printf '| %s | `%s` | %s | %s | %s |\n' \
  "$STAMP" "$SHA" "$verify_state" "$selftest_state" "$verdict" >> "$LOG"

line
if [ "$rc" -eq 0 ]; then
  printf '\033[32m[gate] SHIP AUTHORIZED\033[0m — %s\n' "$verdict"
else
  printf '\033[31m[gate] SHIP BLOCKED\033[0m — reachability=%s functional=%s\n' "$verify_state" "$selftest_state"
fi
log "status -> $STATUS"
exit "$rc"
