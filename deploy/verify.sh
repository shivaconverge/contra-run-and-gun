#!/usr/bin/env bash
# GO-LIVE verification — FETCH the live URL and confirm the game actually boots.
# This is the evidence step: a green deploy that serves a 404 or a blank page is
# NOT live. We assert the served HTML is the game's entrypoint AND that the
# ES-module tree + a real asset are reachable (same-origin, relative paths).
#
#   ./deploy/verify.sh                       # verify default public URL
#   URL=https://owner.github.io/repo/ ./deploy/verify.sh
#
# Exit 0 only if every check passes. Writes evidence to deploy/last-verify.txt
set -euo pipefail

OWNER="${OWNER:-shivaconverge}"
REPO="${REPO:-contra-run-and-gun}"
URL="${URL:-https://${OWNER}.github.io/${REPO}/}"
BASE="${URL%/}"
OUT="$(cd "$(dirname "$0")" && pwd)/last-verify.txt"

log() { printf '\033[36m[verify]\033[0m %s\n' "$*"; }
fail() { printf '\033[31m[verify] FAIL:\033[0m %s\n' "$*" >&2; exit 1; }
pass() { printf '\033[32m[verify] OK:\033[0m %s\n' "$*"; }

fetch() { curl -fsSL --max-time 25 "$1"; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$1"; }

{
  echo "=== GO-LIVE verification @ $(date -u '+%Y-%m-%dT%H:%M:%SZ') ==="
  echo "URL: $URL"
} >"$OUT"

# 1) Root HTML must be the game entrypoint (200 + the game's <canvas id="game">).
log "GET $URL"
HTML="$(fetch "$URL")" || fail "root URL not reachable (curl failed)"
echo "--- root HTTP ${?} ---" >>"$OUT"
echo "$HTML" | head -40 >>"$OUT"
grep -q 'id="game"' <<<"$HTML"        || fail "root HTML has no #game canvas — not the game"
grep -q 'type="module"' <<<"$HTML"    || fail "root HTML loads no ES module — wrong page"
grep -q './src/main.js' <<<"$HTML"    || fail "root HTML does not reference ./src/main.js"
pass "root serves the game entrypoint (index.html)"

# 2) The ES-module entry must be reachable and be JavaScript, not an HTML 404.
MAIN_URL="${BASE}/src/main.js"
log "GET $MAIN_URL"
MC="$(code "$MAIN_URL")"
[ "$MC" = "200" ] || fail "src/main.js returned HTTP $MC (module tree not published)"
MAIN="$(fetch "$MAIN_URL")"
grep -qi '<html' <<<"$MAIN" && fail "src/main.js served an HTML page (Pages 404 fallback)"
pass "src/main.js reachable (HTTP 200, JS payload)"

# 3) A real binary asset must be reachable (relative paths resolve under subpath).
ASSET_URL="${BASE}/assets/player_idle.png"
AC="$(code "$ASSET_URL")"
log "GET $ASSET_URL -> $AC"
[ "$AC" = "200" ] || fail "assets/player_idle.png returned HTTP $AC (assets not published)"
pass "sprite asset reachable (HTTP 200)"

{
  echo ""
  echo "src/main.js: HTTP $MC ($(wc -c <<<"$MAIN" | tr -d ' ') bytes)"
  echo "assets/player_idle.png: HTTP $AC"
  echo "RESULT: LIVE ✅"
} >>"$OUT"

pass "GAME IS LIVE at $URL"
log "evidence -> $OUT"
