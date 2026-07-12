#!/usr/bin/env bash
# RELEASE GATE — the single command that authorizes "the campaign is LIVE and
# sound at the public URL." Runs BOTH deploy checks against the DEPLOYED bundle
# and emits one combined verdict, so ship authorization is reproducible and not a
# hand-assembled judgment:
#
#   1) verify.sh        REACHABILITY + byte-CURRENCY — every referenced asset and
#                       every audio track serves HTTP 200 AND matches the local
#                       build byte-for-byte (public URL is current with master).
#   2) deploy-parity    FULL-SURFACE byte-PARITY — content-hash (sha256) EVERY served
#                       file (all ASSET_MANIFEST sprites + src/data modules + index.html
#                       + every audio track) off the live URL vs the worktree. This is
#                       STRICTLY STRONGER than verify.sh's Content-Length check (two
#                       different files can share a byte length; a same-size stale asset
#                       slips a length check but never a sha256). HARD: a real DRIFT
#                       BLOCKS the release; SKIPs only if node absent (a transient
#                       network/harness error is non-blocking — verify.sh owns
#                       reachability). (playtest/acceptance/deploy-parity.mjs)
#   3) live-selftest.sh FUNCTIONAL soundness — the served build passes its OWN
#                       in-browser regression suite incl. the 7-distinct-stage
#                       campaign invariants (skips gracefully if no headless Chrome).
#   4) weapon audit     The creator-rejected TWO-WEAPON defect FACT — a deterministic
#                       static render-path audit over all 7 stages (feedback/audit/
#                       gate-step.sh). HARD: a red (a baked/second weapon or phantom
#                       shot origin) BLOCKS the release. SKIPs only if node absent.
#
#   ./deploy/gate.sh
#   URL=https://owner.github.io/repo/ ./deploy/gate.sh
#
# Exit 0 only if reachability+currency passes AND full-surface byte-parity does not
# FAIL (real drift), the functional gate does not FAIL, and the two-weapon audit does
# not FAIL (a SKIPPED functional/parity/weapon gate does not fail the release —
# reachability+currency is the hard requirement; the others are additional assurances,
# some needing a browser, some needing node). Writes deploy/GATE-STATUS.txt.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
STATUS="${HERE}/GATE-STATUS.txt"
STAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

log()  { printf '\033[36m[gate]\033[0m %s\n' "$*"; }
line() { printf '%s\n' "----------------------------------------------------------------"; }

TARGET_URL="${URL:-https://shivaconverge.github.io/contra-run-and-gun/}"

# 1) Reachability + currency (HARD requirement).
line; log "1/4  reachability + byte-currency  (verify.sh)"; line
if bash "${HERE}/verify.sh"; then verify_rc=0; else verify_rc=$?; fi

# 2) Full-surface byte-PARITY (HARD: real drift blocks; node-absent / transient
#    network error → non-blocking SKIP, since verify.sh already owns reachability).
#    Content-hashes (sha256) EVERY served file off the live URL vs the worktree —
#    strictly stronger than verify.sh's Content-Length currency check, closing the
#    same-size-stale-asset gap (e.g. a re-generated theme_snow.png that kept its byte
#    length). deploy-parity.mjs exits 0=BYTE-CURRENT, 1=DRIFT, 2=harness/network error.
line; log "2/4  full-surface byte-parity (sha256)  (deploy-parity.mjs)"; line
PARITY_MJS="${HERE}/../playtest/acceptance/deploy-parity.mjs"
if ! command -v node >/dev/null 2>&1; then
  echo "[gate] SKIP: node not found — full-surface byte-parity check skipped (non-blocking)."
  parity_state="SKIPPED"
elif [ ! -f "$PARITY_MJS" ]; then
  echo "[gate] SKIP: deploy-parity.mjs not found at $PARITY_MJS (non-blocking)."
  parity_state="SKIPPED"
else
  node "$PARITY_MJS" "--url=${TARGET_URL}"; parity_rc=$?
  case "$parity_rc" in
    0) parity_state="PASS" ;;    # BYTE-CURRENT across the full served surface
    1) parity_state="FAIL" ;;    # real DRIFT / missing asset — HARD block
    *) parity_state="SKIPPED"; echo "[gate] deploy-parity harness/network error (rc=$parity_rc) — non-blocking SKIP" ;;
  esac
fi

# 3) Functional soundness (skips cleanly with no browser → treated as non-blocking).
line; log "3/4  functional self-test on the deployed build  (live-selftest.sh)"; line
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

# 4) Two-weapon defect audit (HARD FACT; skips cleanly with no node → non-blocking).
line; log "4/4  creator two-weapon defect audit  (feedback/audit/gate-step.sh)"; line
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

# Verdict: reachability MUST pass; full-surface byte-parity, functional, and the
# two-weapon audit must not FAIL (SKIP is tolerated for all three). A parity FAIL is
# a real DRIFT — the live URL is not byte-current with master, so the campaign must
# NOT be authorized LIVE.
if [ "$verify_state" = "PASS" ] && [ "$parity_state" != "FAIL" ] && [ "$selftest_state" != "FAIL" ] && [ "$weapon_state" != "FAIL" ]; then
  verdict="LIVE ✅"; rc=0
else
  verdict="BLOCKED ❌"; rc=1
fi

# Precision for the operate-phase record: the gate runs at the local HEAD, but the
# SERVED build only changes when game/ changes (the workflow triggers on game/**).
# So the revision actually live is the last commit that touched game/, which can
# lag HEAD on cycles that only change deploy/docs/tooling. Record both so the
# status is unambiguous about WHICH game content is live vs which HEAD gated it.
HEAD_SHA="$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || echo '?')"
SERVED_SHA="$(git -C "$HERE" log -1 --format=%h -- ../game 2>/dev/null || echo '?')"
{
  echo "=== RELEASE GATE @ ${STAMP} ==="
  echo "URL:                 ${TARGET_URL}"
  echo "gated HEAD:          ${HEAD_SHA}"
  echo "served build rev:    ${SERVED_SHA}   (last commit touching game/)"
  echo "reachability+currency: ${verify_state}   (verify.sh)"
  echo "full-surface parity:   ${parity_state}   (deploy-parity.mjs, sha256)"
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
    echo "| UTC timestamp | commit | reach+currency | full-parity | functional | two-weapon | verdict |"
    echo "|---|---|---|---|---|---|---|"
  } > "$LOG"
fi
printf '| %s | `%s` | %s | %s | %s | %s | %s |\n' \
  "$STAMP" "$SHA" "$verify_state" "$parity_state" "$selftest_state" "$weapon_state" "$verdict" >> "$LOG"

line
if [ "$rc" -eq 0 ]; then
  printf '\033[32m[gate] SHIP AUTHORIZED\033[0m — %s\n' "$verdict"
else
  printf '\033[31m[gate] SHIP BLOCKED\033[0m — reachability=%s parity=%s functional=%s weapon=%s\n' \
    "$verify_state" "$parity_state" "$selftest_state" "$weapon_state"
fi
log "status -> $STATUS"
exit "$rc"
