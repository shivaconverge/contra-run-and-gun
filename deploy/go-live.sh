#!/usr/bin/env bash
# GO-LIVE driver — create (or reuse) the PUBLIC GitHub repo, push the current
# build, enable GitHub Pages via the Actions workflow, and leave the live URL
# publishing on every future push. Idempotent: safe to re-run whenever master
# advances. Verification (fetch the live URL) is a separate step: deploy/verify.sh
#
#   ./deploy/go-live.sh            # push current HEAD -> remote default branch
#   REPO=my-name ./deploy/go-live.sh
#
# Requires: gh (authenticated), git. Account: shivaconverge (see gh auth status).
set -euo pipefail

OWNER="${OWNER:-shivaconverge}"
REPO="${REPO:-contra-run-and-gun}"
SLUG="${OWNER}/${REPO}"
# The remote branch the Pages workflow watches. Other loops land on master; we
# publish that. Push whatever HEAD we're on TO the remote default branch so the
# public site reflects the merged campaign.
REMOTE_BRANCH="${REMOTE_BRANCH:-master}"

log() { printf '\033[36m[go-live]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[go-live] FATAL:\033[0m %s\n' "$*" >&2; exit 1; }

command -v gh >/dev/null || die "gh CLI not found"
gh auth status >/dev/null 2>&1 || die "gh not authenticated"

# 1) Create the PUBLIC repo if it doesn't exist yet.
if gh repo view "$SLUG" >/dev/null 2>&1; then
  log "repo $SLUG already exists — reusing"
else
  log "creating PUBLIC repo $SLUG"
  gh repo create "$SLUG" --public \
    --description "Contra-lineage run-and-gun — 7-stage campaign, playable in-browser (480x270). Live via GitHub Pages." \
    --disable-wiki
fi

# 2) Wire the remote (idempotent).
REMOTE_URL="https://github.com/${SLUG}.git"
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$REMOTE_URL"
else
  git remote add origin "$REMOTE_URL"
fi
log "origin -> $REMOTE_URL"

# 3) Push the CURRENT commit to the remote default branch. We do NOT touch the
#    local master/loop branches — we only publish HEAD to the remote. gh's token
#    is used for HTTPS auth via the credential helper it installed.
log "pushing HEAD -> origin/$REMOTE_BRANCH"
git push origin "HEAD:refs/heads/${REMOTE_BRANCH}" --force

# Make sure the remote's default branch is the one the workflow watches.
gh repo edit "$SLUG" --default-branch "$REMOTE_BRANCH" >/dev/null 2>&1 || true

# 4) Enable Pages with the GitHub Actions build type (so our workflow deploys).
#    The configure-pages step in the workflow also enables this, but doing it
#    here makes the very first run deterministic.
log "enabling Pages (build_type=workflow)"
gh api -X POST "repos/${SLUG}/pages" \
  -f build_type=workflow >/dev/null 2>&1 \
  || gh api -X PUT "repos/${SLUG}/pages" -f build_type=workflow >/dev/null 2>&1 \
  || log "Pages already configured (or will be by the workflow)"

# 5) Kick the workflow explicitly (in case the path-filtered push didn't match).
log "dispatching deploy workflow"
gh workflow run deploy-pages.yml --repo "$SLUG" --ref "$REMOTE_BRANCH" >/dev/null 2>&1 \
  || log "workflow_dispatch not yet available (first push triggers it automatically)"

PAGES_URL="https://${OWNER}.github.io/${REPO}/"
log "DONE. Public URL (live once the deploy run finishes): $PAGES_URL"
log "Watch:  gh run watch --repo $SLUG"
log "Verify: ./deploy/verify.sh"
echo "$PAGES_URL"
