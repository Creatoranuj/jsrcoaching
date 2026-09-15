#!/usr/bin/env bash
# Stream colorized logs from the connected Android device/emulator,
# filtered to the JSR COACHING app process.
set -euo pipefail

PKG="com.jsrcoaching.app"

if ! command -v adb >/dev/null 2>&1; then
  echo "❌ adb not found. Install Android Platform Tools or Android Studio." >&2
  exit 1
fi

if [ -z "$(adb devices | sed -n '2p' | awk '{print $1}')" ]; then
  echo "❌ No device/emulator connected. Run \`adb devices\` to verify." >&2
  exit 1
fi

PID=$(adb shell pidof "$PKG" 2>/dev/null || true)
if [ -z "$PID" ]; then
  echo "ℹ️  $PKG is not running yet. Streaming all logs filtered by package name."
  echo "    Launch the app to see process-scoped logs."
  exec adb logcat -v color | grep -i "$PKG\|Capacitor\|chromium"
fi

echo "📱 Streaming logs for $PKG (pid=$PID). Ctrl+C to stop."
exec adb logcat -v color --pid="$PID"