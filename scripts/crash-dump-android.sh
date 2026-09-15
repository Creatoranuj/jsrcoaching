#!/usr/bin/env bash
# One-shot Android crash log capture for JSR COACHING.
# Saves crash-relevant logs + memory snapshot to ./android-crash-<timestamp>.log
set -euo pipefail

PKG="com.jsrcoaching.app"
OUT="android-crash-$(date +%Y%m%d-%H%M%S).log"

if ! command -v adb >/dev/null 2>&1; then
  echo "❌ adb not found. Install Android Platform Tools." >&2
  exit 1
fi

if [ -z "$(adb devices | sed -n '2p' | awk '{print $1}')" ]; then
  echo "❌ No device connected. Enable USB debugging and run: adb devices" >&2
  exit 1
fi

echo "📋 Dumping crash data to $OUT ..."
{
  echo "===== DEVICE ====="
  adb shell getprop ro.product.model
  adb shell getprop ro.build.version.release
  echo
  echo "===== MEMINFO ====="
  adb shell dumpsys meminfo "$PKG" 2>/dev/null || echo "(app not running)"
  echo
  echo "===== RECENT CRASHES (logcat -b crash) ====="
  adb logcat -b crash -d -v threadtime
  echo
  echo "===== FILTERED MAIN LOG (last 2000 lines) ====="
  adb logcat -d -v threadtime -t 2000 | grep -iE \
    "AndroidRuntime|FATAL|chromium|WebView|lowmemorykiller|lmkd|$PKG|Capacitor" || true
} > "$OUT"

echo "✅ Saved: $OUT"
echo "📤 Share this file with support."
