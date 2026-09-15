#!/usr/bin/env bash
# Stream logs from the booted iOS simulator, filtered to the JSR COACHING app.
# For a real device, use: xcrun devicectl device log stream --device <UUID>
set -euo pipefail

APP_NAME="JSR COACHING"

if ! command -v xcrun >/dev/null 2>&1; then
  echo "❌ xcrun not found. This script requires macOS with Xcode installed." >&2
  exit 1
fi

if ! xcrun simctl list devices booted | grep -q "Booted"; then
  echo "❌ No booted simulator. Start one from Xcode or:" >&2
  echo "    xcrun simctl boot \"iPhone 15\"" >&2
  exit 1
fi

echo "📱 Streaming logs for \"$APP_NAME\" from booted simulator. Ctrl+C to stop."
exec xcrun simctl spawn booted log stream \
  --predicate "process == \"$APP_NAME\"" \
  --level debug