#!/usr/bin/env bash
# Drift guard: compare this project's supabase/functions with GitHub main.
#
# Why: the server code lives both in the GitHub repo and in the Lovable project.
# If they diverge, an old copy can be deployed by mistake — exactly how the live
# site ended up running retired CORS config (AUDIT 2026-09-17).
#
# Usage: ./scripts/check-functions-drift.sh [owner/repo] [ref]
set -uo pipefail

REPO="${1:-Creatoranuj/jsrcoaching}"
REF="${2:-main}"
LOCAL_DIR="supabase/functions"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -d "$LOCAL_DIR" ] || { echo "No $LOCAL_DIR here — nothing to compare."; exit 1; }

echo "Fetching $REPO@$REF ..."
curl -sSL "https://codeload.github.com/$REPO/tar.gz/$REF" | tar -xz -C "$TMP" || {
  echo "FAIL: could not download $REPO@$REF"; exit 1; }
REMOTE_DIR="$(find "$TMP" -maxdepth 4 -type d -path "*/supabase/functions" | head -1)"
[ -n "$REMOTE_DIR" ] || { echo "FAIL: $REF has no supabase/functions"; exit 1; }

# node_modules / .deno are local Deno cache artifacts, never part of the repo.
if diff -ru -x node_modules -x .deno -x '.DS_Store' "$REMOTE_DIR" "$LOCAL_DIR" > "$TMP/diff.txt"; then
  echo "OK: server code here is identical to $REPO@$REF."
  exit 0
fi

echo "DRIFT DETECTED between $REPO@$REF and local $LOCAL_DIR:"
sed -n '1,200p' "$TMP/diff.txt"
echo
echo "Resolve the drift (push local changes, or pull remote) before deploying."
exit 1
