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
# HTTP status + Content-Type + byte size, tab-separated (for binary assets we
# must NOT slurp the body — mp3 tracks are multi-MB). Follows redirects.
head_meta() { curl -sIL --max-time 30 "$1" | awk '
  BEGIN{IGNORECASE=1}
  {gsub(/\r/,"")}                       # strip CR so numeric compares work
  /^HTTP\//{c=$2}
  /^content-type:/{t=$2}
  /^content-length:/{l=$2}
  END{printf "%s\t%s\t%s", c, t, l}'; }

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

# 3) ASSET RESOLVE-GATE — every asset the game references must be published.
#    Source of truth is the game's OWN manifest (game/data/assets.js), so this
#    stays in sync as loops add biome tilesets/sprites: we don't hard-code a list.
#    A missing biome tileset (e.g. theme_snow.png) would silently drop that stage
#    back to the default sheet — a distinct-theme fidelity regression that a plain
#    "site is 200" check misses. We assert HTTP 200 for each referenced path.
ASSETS_JS="$(cd "$(dirname "$0")/.." && pwd)/game/data/assets.js"
ASSET_PATHS=()
if [ -f "$ASSETS_JS" ]; then
  # bash 3.2 (macOS default) has no mapfile — read line by line.
  while IFS= read -r p; do ASSET_PATHS+=("$p"); done \
    < <(grep -oE "'assets/[^']+'" "$ASSETS_JS" | tr -d "'" | sort -u)
else
  # Deploy dir checked out without game/ alongside — fall back to a core sprite.
  ASSET_PATHS=(assets/player_idle.png)
  log "assets.js not found at $ASSETS_JS — checking core sprite only"
fi
log "resolve-gate: ${#ASSET_PATHS[@]} referenced assets vs the deployed bundle"
ASSET_FAILED=0
for rel in "${ASSET_PATHS[@]}"; do
  ac="$(code "${BASE}/${rel}")"
  if [ "$ac" != "200" ]; then
    printf '\033[31m[verify]   MISSING\033[0m %s -> HTTP %s\n' "$rel" "$ac"
    echo "  MISSING: $rel -> HTTP $ac" >>"$OUT"
    ASSET_FAILED=$((ASSET_FAILED+1))
  fi
done
[ "$ASSET_FAILED" -eq 0 ] || fail "$ASSET_FAILED/${#ASSET_PATHS[@]} referenced assets are NOT published (see above)"
pass "all ${#ASSET_PATHS[@]} referenced assets reachable (HTTP 200) — incl. per-stage biome tilesets"

# 4) Audio: the live campaign now FETCHES the per-stage Udio mp3 tracks at boot
#    (main.js reads assets/audio/manifest.json, then fetch()+decodeAudioData on
#    each assets/audio/<file>.mp3). A dropped file or a wrong MIME = silent music
#    failure for real players, so the deploy gate must confirm the audio serves.
MANIFEST_URL="${BASE}/assets/audio/manifest.json"
log "GET $MANIFEST_URL"
MJ="$(fetch "$MANIFEST_URL")" || fail "assets/audio/manifest.json not reachable"
grep -qi '<html' <<<"$MJ" && fail "audio manifest served an HTML page (Pages 404 fallback)"
# Pull the first track's basename straight from the manifest the game reads —
# don't hard-code, so this survives track renames on the game side.
TRACK_FILE="$(sed -n 's/.*"file"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' <<<"$MJ" | head -1 | sed 's#.*/##')"
[ -n "$TRACK_FILE" ] || fail "no track 'file' found in audio manifest"
TRACK_URL="${BASE}/assets/audio/${TRACK_FILE}"
log "HEAD $TRACK_URL"
IFS=$'\t' read -r TCODE TTYPE TLEN <<<"$(head_meta "$TRACK_URL")"
[ "$TCODE" = "200" ] || fail "audio track $TRACK_FILE returned HTTP $TCODE (track not published)"
case "$TTYPE" in
  audio/mpeg*|audio/mp3*) : ;;
  *) fail "audio track $TRACK_FILE served wrong Content-Type '$TTYPE' (want audio/mpeg — decodeAudioData will fail)";;
esac
# A real Udio track is hundreds of KB+; a truncated/LFS-pointer file would be tiny.
[ "${TLEN:-0}" -ge 100000 ] || fail "audio track $TRACK_FILE only ${TLEN:-0} bytes (looks truncated)"
pass "audio manifest + track '$TRACK_FILE' reachable (HTTP 200, $TTYPE, $TLEN bytes)"

{
  echo ""
  echo "src/main.js: HTTP $MC ($(wc -c <<<"$MAIN" | tr -d ' ') bytes)"
  echo "asset resolve-gate: ${#ASSET_PATHS[@]}/${#ASSET_PATHS[@]} referenced assets HTTP 200"
  echo "assets/audio/manifest.json: HTTP 200"
  echo "assets/audio/${TRACK_FILE}: HTTP $TCODE, $TTYPE, $TLEN bytes"
  echo "RESULT: LIVE ✅"
} >>"$OUT"

pass "GAME IS LIVE at $URL"
log "evidence -> $OUT"
