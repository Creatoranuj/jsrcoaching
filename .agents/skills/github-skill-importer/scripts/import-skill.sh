#!/usr/bin/env bash
# One-shot skill importer — clones Cap-go/capgo-skills (cached in /tmp),
# copies the requested skill directories into .agents/skills/, and prints
# the exact skills--apply_draft paths the agent must fire next.
#
# Usage:
#   bash .agents/skills/github-skill-importer/scripts/import-skill.sh <skill> [<skill> ...]
#   bash .agents/skills/github-skill-importer/scripts/import-skill.sh --all-capacitor
#   bash .agents/skills/github-skill-importer/scripts/import-skill.sh --list
#
# Env overrides:
#   SKILL_REPO_URL   default: https://github.com/Cap-go/capgo-skills.git
#   SKILL_REPO_DIR   default: /tmp/capgo-skills
#   TARGET_DIR       default: .agents/skills
set -euo pipefail

REPO_URL="${SKILL_REPO_URL:-https://github.com/Cap-go/capgo-skills.git}"
REPO_DIR="${SKILL_REPO_DIR:-/tmp/capgo-skills}"
TARGET_DIR="${TARGET_DIR:-.agents/skills}"

# Cache the clone across turns — refresh only when older than 6h.
need_clone=1
if [ -d "$REPO_DIR/.git" ]; then
  age=$(( $(date +%s) - $(stat -c %Y "$REPO_DIR/.git" 2>/dev/null || echo 0) ))
  [ "$age" -lt 21600 ] && need_clone=0
fi
if [ "$need_clone" -eq 1 ]; then
  rm -rf "$REPO_DIR"
  git clone --depth 1 --quiet "$REPO_URL" "$REPO_DIR"
fi

SRC="$REPO_DIR/skills"
[ -d "$SRC" ] || { echo "::error::No skills/ directory in $REPO_DIR" >&2; exit 1; }

if [ "${1:-}" = "--list" ]; then
  ls -1 "$SRC"
  exit 0
fi

# Canonical Capacitor + Razorpay curation matrix (see SKILL.md).
ALL_CAPACITOR=(
  capacitor-best-practices capacitor-plugins capacitor-security
  capacitor-performance capacitor-accessibility capacitor-deep-linking
  capacitor-splash-screen capacitor-keyboard safe-area-handling
  debugging-capacitor ios-android-logs capacitor-ci-cd capacitor-app-store
  capacitor-testing capacitor-push-notifications framework-to-capacitor
  webapp-to-capacitor ionic-design razorpay-payments
)

if [ "${1:-}" = "--all-capacitor" ]; then
  set -- "${ALL_CAPACITOR[@]}"
fi

[ "$#" -gt 0 ] || { echo "::error::No skill name(s) given. Try --list or --all-capacitor" >&2; exit 1; }

mkdir -p "$TARGET_DIR"
imported=(); skipped=(); missing=()
for name in "$@"; do
  if [ ! -d "$SRC/$name" ]; then
    missing+=("$name"); continue
  fi
  if [ -d "$TARGET_DIR/$name" ]; then
    # Overwrite so upstream updates land; local edits should live in a
    # different skill name to avoid churn.
    rm -rf "$TARGET_DIR/$name"
  fi
  cp -r "$SRC/$name" "$TARGET_DIR/$name"
  imported+=("$name")
done

echo "=== import-skill summary ==="
echo "imported: ${#imported[@]}  ${imported[*]:-}"
echo "missing : ${#missing[@]}   ${missing[*]:-}"
echo
echo "Next: fire skills--apply_draft for EACH of these paths (parallel is fine):"
for n in "${imported[@]}"; do
  echo "  $TARGET_DIR/$n"
done
