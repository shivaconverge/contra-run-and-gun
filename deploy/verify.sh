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
# RETRY: a single HEAD can hit a transient network blip (curl exits non-zero,
# empty status) and produce a FALSE stale/missing verdict on a healthy deploy —
# observed s7_fortress.mp3 fail once then return 200 twice. So retry up to 3x when
# the status comes back EMPTY (a curl-level failure). We do NOT retry a real HTTP
# code (e.g. 404) — that's a definitive answer, kept fast.
head_meta() {
  local out c try
  for try in 1 2 3; do
    out="$(curl -sIL --max-time 30 "$1" | awk '
      BEGIN{IGNORECASE=1}
      {gsub(/\r/,"")}                     # strip CR so numeric compares work
      /^HTTP\//{c=$2}
      /^content-type:/{t=$2}
      /^content-length:/{l=$2}
      END{printf "%s\t%s\t%s", c, t, l}')"
    c="${out%%$'\t'*}"
    [ -n "$c" ] && break                  # got a real HTTP status → done
    sleep 2                               # transient failure → brief backoff, retry
  done
  printf '%s' "$out"
}

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
# Local image dir for byte-freshness (same idea as the audio gate): finalized
# assets (boss re-gen, tileset tweak) rewrite the PNG bytes but keep the filename,
# so an HTTP-200-only check would pass a stale CDN copy. When the local build is
# beside us, assert each live asset's Content-Length EQUALS the local file's size,
# proving the public URL serves the CURRENT art — not a lagging cached version.
LOCAL_GAME_DIR="$(cd "$(dirname "$0")/.." && pwd)/game"
ASSET_FAILED=0
ASSET_STALE=0
for rel in "${ASSET_PATHS[@]}"; do
  IFS=$'\t' read -r ac _atype alen <<<"$(head_meta "${BASE}/${rel}")"
  if [ "$ac" != "200" ]; then
    printf '\033[31m[verify]   MISSING\033[0m %s -> HTTP %s\n' "$rel" "$ac"
    echo "  MISSING: $rel -> HTTP $ac" >>"$OUT"
    ASSET_FAILED=$((ASSET_FAILED+1))
    continue
  fi
  # Byte-freshness vs the local build (only when the local file is present).
  if [ -f "${LOCAL_GAME_DIR}/${rel}" ]; then
    lsz="$(stat -f%z "${LOCAL_GAME_DIR}/${rel}" 2>/dev/null || stat -c%s "${LOCAL_GAME_DIR}/${rel}" 2>/dev/null)"
    if [ -n "$lsz" ] && [ "${alen:-x}" != "$lsz" ]; then
      printf '\033[31m[verify]   STALE\033[0m %s live=%s local=%s\n' "$rel" "${alen:-?}" "$lsz"
      echo "  STALE: $rel live=${alen:-?} local=$lsz" >>"$OUT"
      ASSET_STALE=$((ASSET_STALE+1))
    fi
  fi
done
[ "$ASSET_FAILED" -eq 0 ] || fail "$ASSET_FAILED/${#ASSET_PATHS[@]} referenced assets are NOT published (see above)"
if [ "$ASSET_STALE" -gt 0 ]; then
  fail "$ASSET_STALE/${#ASSET_PATHS[@]} live assets are STALE (size != local build) — public URL not current with master; wait for the deploy run or re-run go-live.sh"
fi
pass "all ${#ASSET_PATHS[@]} referenced assets reachable + byte-current with local build (incl. biome tilesets + themed bosses)"

# 4) AUDIO RESOLVE-GATE — the live campaign decodes EVERY per-stage Udio track at
#    boot (main.js reads assets/audio/manifest.json, sorts by s<N>_ prefix, then
#    fetch()+decodeAudioData on each assets/audio/<basename>.mp3). Tracks get
#    renamed/realigned as biomes settle (e.g. s2_base -> s2_cascade), so we read
#    the LIVE manifest and confirm EVERY track it lists serves — a partial rename
#    that leaves one stage's mp3 unpublished = silent music for that biome, and
#    checking only the first track would miss it.
MANIFEST_URL="${BASE}/assets/audio/manifest.json"
log "GET $MANIFEST_URL"
MJ="$(fetch "$MANIFEST_URL")" || fail "assets/audio/manifest.json not reachable"
grep -qi '<html' <<<"$MJ" && fail "audio manifest served an HTML page (Pages 404 fallback)"
# Every track basename the manifest lists (same field main.js reads).
TRACK_FILES=()
while IFS= read -r f; do [ -n "$f" ] && TRACK_FILES+=("$f"); done < <(
  grep -oE '"file"[[:space:]]*:[[:space:]]*"[^"]+"' <<<"$MJ" \
    | sed -E 's/.*"([^"]+)"$/\1/; s#.*/##')
[ "${#TRACK_FILES[@]}" -gt 0 ] || fail "no track 'file' entries found in audio manifest"
log "audio resolve-gate: ${#TRACK_FILES[@]} tracks vs the deployed bundle"
# FRESHNESS: audio changes (loudness re-master, seamless re-trim) rewrite the mp3
# bytes but keep the filename — invisible to a screenshot, and a stale CDN copy
# would still pass a plain HTTP-200 check. When the local build's audio is beside
# us, assert each live track's Content-Length EQUALS the local file's size, so we
# prove the public URL is serving the CURRENT build, not a lagging cached version.
LOCAL_AUDIO_DIR="$(cd "$(dirname "$0")/.." && pwd)/game/assets/audio"
AUDIO_FAILED=0
AUDIO_STALE=0
AUDIO_LINES=""
for tf in "${TRACK_FILES[@]}"; do
  IFS=$'\t' read -r tc tt tl <<<"$(head_meta "${BASE}/assets/audio/${tf}")"
  ok=1
  [ "$tc" = "200" ] || ok=0
  case "$tt" in audio/mpeg*|audio/mp3*) : ;; *) ok=0 ;; esac
  [ "${tl:-0}" -ge 100000 ] 2>/dev/null || ok=0
  # Byte-freshness vs the local build (only when the local file is present).
  fresh="-"
  if [ -f "${LOCAL_AUDIO_DIR}/${tf}" ]; then
    local_sz="$(stat -f%z "${LOCAL_AUDIO_DIR}/${tf}" 2>/dev/null || stat -c%s "${LOCAL_AUDIO_DIR}/${tf}" 2>/dev/null)"
    if [ "${tl:-0}" = "${local_sz:-x}" ]; then fresh="current"; else fresh="STALE(local=${local_sz})"; ok=0; AUDIO_STALE=$((AUDIO_STALE+1)); fi
  fi
  if [ "$ok" = 1 ]; then
    printf '\033[32m[verify]   ok\033[0m %-18s HTTP %s %s %s bytes  %s\n' "$tf" "$tc" "$tt" "$tl" "$fresh"
  else
    printf '\033[31m[verify]   BAD\033[0m %-18s HTTP %s %s %s bytes  %s\n' "$tf" "$tc" "$tt" "${tl:-0}" "$fresh"
    AUDIO_FAILED=$((AUDIO_FAILED+1))
  fi
  AUDIO_LINES="${AUDIO_LINES}  assets/audio/${tf}: HTTP ${tc:-?}, ${tt:-?}, ${tl:-0} bytes [${fresh}]"$'\n'
done
if [ "$AUDIO_STALE" -gt 0 ]; then
  fail "$AUDIO_STALE/${#TRACK_FILES[@]} live tracks are STALE (size != local build) — public URL not current with master; wait for the deploy run or re-run go-live.sh"
fi
[ "$AUDIO_FAILED" -eq 0 ] || fail "$AUDIO_FAILED/${#TRACK_FILES[@]} audio tracks failed (HTTP/MIME/size — see above)"
pass "audio manifest + all ${#TRACK_FILES[@]} per-stage tracks reachable + byte-current with local build"

{
  echo ""
  echo "src/main.js: HTTP $MC ($(wc -c <<<"$MAIN" | tr -d ' ') bytes)"
  echo "asset resolve-gate: ${#ASSET_PATHS[@]}/${#ASSET_PATHS[@]} referenced assets HTTP 200"
  echo "assets/audio/manifest.json: HTTP 200"
  echo "audio resolve-gate: ${#TRACK_FILES[@]}/${#TRACK_FILES[@]} tracks HTTP 200:"
  printf '%s' "$AUDIO_LINES"
  echo "RESULT: LIVE ✅"
} >>"$OUT"

pass "GAME IS LIVE at $URL"
log "evidence -> $OUT"
