#!/usr/bin/env bash
# Maestro Android E2E — everything that runs *inside* the booted emulator.
#
# Why a script file and not inline YAML: reactivecircus/android-emulator-runner
# executes each line of its `script:` input through a fresh `sh -c`, so
# `set -e`, `trap`, and shell variables (LOGCAT_PID) never carry over between
# lines. In run #88 that meant no final screenshot, no `maestro --debug-output`,
# and a logcat that only survived because the runner killed the orphan later.
# One bash process = one lifetime for the trap + variables.
#
# Inputs (env): MAESTRO_EMAIL / MAESTRO_PASSWORD (preferred) or
#               TEST_USER_EMAIL / TEST_USER_PASSWORD, APP_ID (default debug id)
# Outputs:      maestro-artifacts/**  (logcat, final screen, package dumps,
#               Maestro debug output), maestro-report.xml (junit)
set -euo pipefail

APP_ID="${APP_ID:-com.jsrcoaching.app.debug}"
APK="${APK:-android/app/build/outputs/apk/debug/app-debug.apk}"
ART=maestro-artifacts
mkdir -p "$ART"

EMAIL="${MAESTRO_EMAIL:-${TEST_USER_EMAIL:-}}"
PASSWORD="${MAESTRO_PASSWORD:-${TEST_USER_PASSWORD:-}}"
if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  echo "::error::No Maestro login credentials (MAESTRO_EMAIL/PASSWORD or TEST_USER_EMAIL/PASSWORD)"
  exit 1
fi

adb logcat -c || true
adb logcat -v threadtime > "$ART/logcat.txt" 2>&1 &
LOGCAT_PID=$!

collect_evidence() {
  local rc=$?
  set +e
  adb shell screencap -p /sdcard/maestro-final.png >/dev/null 2>&1 \
    && adb pull /sdcard/maestro-final.png "$ART/final-screen.png" >/dev/null 2>&1
  adb shell pm list packages > "$ART/packages.txt" 2>&1
  adb shell getprop ro.product.cpu.abilist > "$ART/device-abis.txt" 2>&1
  adb shell dumpsys package "$APP_ID" > "$ART/app-package.txt" 2>&1
  adb shell dumpsys meminfo > "$ART/meminfo.txt" 2>&1
  adb shell cat /proc/net/unix 2>/dev/null | grep -i devtools_remote > "$ART/devtools-sockets.txt" || true
  kill "$LOGCAT_PID" >/dev/null 2>&1
  if [ "$rc" -ne 0 ]; then
    echo "::group::App-related logcat tail (crashes / kills / ANR)"
    grep -E "FATAL|AndroidRuntime|ANR in|Killing [0-9]+:$APP_ID|has died|lowmemorykiller|Firebase-Installations" "$ART/logcat.txt" | tail -40 || true
    echo "::endgroup::"
  fi
  exit "$rc"
}
trap collect_evidence EXIT

echo "::group::Device"
adb shell getprop ro.build.fingerprint
adb shell getprop ro.product.cpu.abilist
adb shell cat /proc/meminfo | head -3
echo "::endgroup::"

# Trim background pressure on the google_apis image: Maps' recovery loop and
# the Play-services font provider crashing under memory pressure killed the
# app process in run #88 ("depends on provider ...FontsProvider in dying proc
# com.google.android.gms.persistent"). Nothing in the flows needs them.
for pkg in com.google.android.apps.maps com.google.android.youtube com.google.android.apps.messaging com.google.android.googlequicksearchbox; do
  adb shell pm disable-user --user 0 "$pkg" >/dev/null 2>&1 || true
done
adb shell settings put global package_verifier_enable 0 >/dev/null 2>&1 || true
adb shell settings put system screen_off_timeout 1800000 >/dev/null 2>&1 || true

adb uninstall "$APP_ID" >/dev/null 2>&1 || true
adb install -r "$APK"
adb shell pm path "$APP_ID" | tee "$ART/install-check.txt"
grep -q '^package:' "$ART/install-check.txt" || { echo "::error::$APP_ID was not installed"; exit 1; }

# Smoke is the release gate — it must fail the job when it fails.
# --debug-output keeps per-step screenshots + hierarchy for every command.
maestro test \
  --env MAESTRO_EMAIL="$EMAIL" \
  --env MAESTRO_PASSWORD="$PASSWORD" \
  --debug-output "$ART/maestro-debug" \
  --format junit --output maestro-report.xml \
  maestro/smoke.yaml

# Secondary flows stay non-blocking — optional paths that flake on cold
# emulators and shouldn't gate release.
maestro test --debug-output "$ART/maestro-debug-secondary" maestro/pdf-back.yaml || echo "::warning::pdf-back flow failed (non-blocking)"
maestro test --debug-output "$ART/maestro-debug-secondary" maestro/back-button-cold-start.yaml || echo "::warning::back-button-cold-start flow failed (non-blocking)"
