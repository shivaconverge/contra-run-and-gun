#!/usr/bin/env bash
# LIVE self-test gate — drive the DEPLOYED public URL in a headless browser with
# ?selftest=1 and assert the deployed game passes its OWN regression suite. This
# complements verify.sh: verify.sh proves the bundle is REACHABLE + byte-CURRENT
# (curl only); this proves the served build is FUNCTIONALLY SOUND — the campaign
# structure holds and every invariant passes when the real ES-module tree runs in
# a real browser against the live URL.
#
# The game's ?selftest=1 mode (game/src/main.js publishSelfTest) runs runSelfTest()
# and writes the JSON report into a <div id="selftest-done">. We dump the live DOM,
# parse that report, and fail if ok!=true, any result failed, or the campaign-
# structure tests (campaign.sevenDistinctStages / finaleIsDensestAndHardest /
# structureInvariantsHold) are missing or failing — the core 7-distinct-stage GOAL.
#
#   ./deploy/live-selftest.sh
#   URL=https://owner.github.io/repo/ ./deploy/live-selftest.sh
#
# Exits non-zero on any failure. Writes evidence to deploy/last-selftest.json.
# Skips gracefully (exit 0, SKIP note) if no headless Chrome is available — this
# is an ADDITIONAL functional gate, not the reachability gate, so a browserless
# CI runner should not hard-fail the pipeline on it.
set -euo pipefail

OWNER="${OWNER:-shivaconverge}"
REPO="${REPO:-contra-run-and-gun}"
URL="${URL:-https://${OWNER}.github.io/${REPO}/}"
BASE="${URL%/}"
OUT="$(cd "$(dirname "$0")" && pwd)/last-selftest.json"

log() { printf '\033[36m[live-selftest]\033[0m %s\n' "$*"; }
fail() { printf '\033[31m[live-selftest] FAIL:\033[0m %s\n' "$*" >&2; exit 1; }
pass() { printf '\033[32m[live-selftest] OK:\033[0m %s\n' "$*"; }
skip() { printf '\033[33m[live-selftest] SKIP:\033[0m %s\n' "$*"; exit 0; }

# Locate a headless Chrome/Chromium (Playwright cache, then common installs).
find_chrome() {
  local c
  for c in \
    "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-*/chrome-headless-shell \
    "$HOME"/Library/Caches/ms-playwright/chromium-*/chrome-mac*/*/Chromium \
    "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/chrome-headless-shell \
    "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/chrome \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "$(command -v google-chrome 2>/dev/null || true)" \
    "$(command -v chromium 2>/dev/null || true)"; do
    [ -n "$c" ] && [ -x "$c" ] && { printf '%s' "$c"; return 0; }
  done
  return 1
}

CHROME="$(find_chrome || true)"
[ -n "$CHROME" ] || skip "no headless Chrome found — reachability is covered by verify.sh; run that for the deploy gate"
command -v python3 >/dev/null || skip "python3 not available to parse the report"
log "browser: $CHROME"
log "driving $BASE/?selftest=1"

DOM="$(mktemp)"; trap 'rm -f "$DOM"' EXIT
# RETRY on transient browser-run/parse misses: a single headless drive can come
# back with a blank DOM (slow load / connection blip → the #selftest-done div
# never appears) and produce a FALSE gate FAIL that BLOCKS a healthy deploy —
# observed the dump-dom come back empty while an immediate re-run passed 119/119.
# The parser exits 2 for "report not captured" (transient → retry) vs 1 for a
# REAL parsed regression (definitive → never retried).
attempt=0; parse_rc=2
while [ "$attempt" -lt 3 ]; do
  attempt=$((attempt+1))
  : >"$DOM"
  if ! "$CHROME" --headless --disable-gpu --no-sandbox --virtual-time-budget=12000 \
       --dump-dom "${BASE}/?selftest=1" >"$DOM" 2>/dev/null; then
    log "browser run failed (attempt ${attempt}/3) — retrying"; sleep 3; continue
  fi
python3 - "$DOM" "$OUT" <<'PY'
import re, json, sys, html as H
dom = open(sys.argv[1]).read()
m = re.search(r'id="selftest-done"[^>]*>(.*?)</div>', dom, re.S)
if not m:
    print("no #selftest-done div — selftest did not run on the live build"); sys.exit(2)
try:
    rep = json.loads(H.unescape(m.group(1)))
except Exception as e:
    print("report parse error:", e); sys.exit(2)
open(sys.argv[2], "w").write(json.dumps(rep, indent=2))

results = rep.get("results", [])
def ok_of(r): return r.get("ok", r.get("pass"))
fails = [r for r in results if isinstance(r, dict) and ok_of(r) is False]
names = {(r.get("name") or r.get("id") or ""): ok_of(r) for r in results if isinstance(r, dict)}

# Core GOAL invariants that MUST be present AND passing on the live build.
required = [
    "campaign.sevenDistinctStages",
    "campaign.finaleIsDensestAndHardest",
    "campaign.structureInvariantsHold",
]
missing = [n for n in required if n not in names]
notpass = [n for n in required if names.get(n) is False]

print(f"passed={rep.get('passed')} total={rep.get('total')} ok={rep.get('ok')} failures={len(fails)}")
for n in required:
    print(f"  {n}: {'PASS' if names.get(n) else ('MISSING' if n in missing else 'FAIL')}")

bad = False
if rep.get("ok") is not True: print("VERDICT: report ok != true"); bad = True
if fails: print(f"VERDICT: {len(fails)} test(s) failed:", [r.get('name') for r in fails][:10]); bad = True
if missing: print("VERDICT: required campaign tests MISSING:", missing); bad = True
if notpass: print("VERDICT: required campaign tests FAILING:", notpass); bad = True
sys.exit(1 if bad else 0)
PY
  parse_rc=$?
  # 0 = full pass, 1 = REAL regression (report parsed) → both definitive, stop.
  # 2 = report not captured (transient) → retry.
  [ "$parse_rc" -ne 2 ] && break
  log "self-test report not captured (attempt ${attempt}/3) — retrying"; sleep 3
done
case "$parse_rc" in
  0) : ;;
  1) fail "live self-test found a REAL regression on the deployed build (see above); report saved to $OUT" ;;
  *) fail "live self-test report could not be captured after 3 attempts (transient browser/load failure); reachability is still covered by verify.sh" ;;
esac
pass "deployed build passes its OWN regression suite incl. 7-distinct-stage campaign invariants"
log "report -> $OUT"
