#!/usr/bin/env bash
# Mandatory release gate for the EXACT APK users will download.
#
# Incident 2026-09-17: release v2026.09.17.1 was reported as "App not installed
# as package appears to be invalid" on a user device. CI had only inspected the
# bundled web assets and dex classes — it never validated the final signed
# distributable with Android's own tooling, so the pipeline could not prove the
# published bytes were installable. This script is that proof, and it must run
# on the renamed artifact that is uploaded/attached, not on an intermediate copy.
#
# Checks (all blocking):
#   1. apksigner verify — APK Signature Scheme v2 present, certificate printed,
#      and (optionally) the certificate SHA-256 matches EXPECTED_CERT_SHA256.
#   2. zipalign -c -P 16 — 4-byte alignment + 16 KB native-library page alignment
#      (required for Android 15+ devices with 16 KB page size).
#   3. aapt dump badging — package id, versionCode/versionName, sdk versions are
#      readable; package id must equal EXPECTED_PACKAGE (default com.jsrcoaching.app).
#   4. Archive integrity — every ZIP entry readable, AndroidManifest.xml,
#      classes.dex and resources.arsc present.
#   5. ABI coverage — arm64-v8a AND armeabi-v7a native libs present; x86/x86_64
#      libs are rejected unless ALLOW_X86=1 (emulator-only builds).
#   6. SHA-256 checksum written to <apk>.sha256 for publish-time comparison.
#
# Usage: scripts/verify-apk-release.sh <path-to-apk>
#   EXPECTED_PACKAGE      default com.jsrcoaching.app
#   EXPECTED_CERT_SHA256  optional, colon-separated or plain hex
#   ALLOW_X86             set to 1 to permit x86/x86_64 libs
set -euo pipefail

APK="${1:-}"
EXPECTED_PACKAGE="${EXPECTED_PACKAGE:-com.jsrcoaching.app}"
ALLOW_X86="${ALLOW_X86:-0}"

fail() { echo "::error::APK release verification FAILED — $*"; exit 1; }

[ -n "$APK" ] || fail "no APK path given. Usage: $0 <apk>"
[ -f "$APK" ] || fail "APK not found at $APK"

# ---- locate Android build-tools (apksigner / zipalign / aapt) ---------------
find_tool() {
  local name="$1" found=""
  if command -v "$name" >/dev/null 2>&1; then command -v "$name"; return 0; fi
  for root in "${ANDROID_SDK_ROOT:-}" "${ANDROID_HOME:-}" /usr/local/lib/android/sdk "$HOME/Android/Sdk"; do
    [ -n "$root" ] && [ -d "$root/build-tools" ] || continue
    found="$(find "$root/build-tools" -maxdepth 2 -name "$name" -type f 2>/dev/null | sort -V | tail -n1)"
    [ -n "$found" ] && { echo "$found"; return 0; }
  done
  return 1
}

APKSIGNER="$(find_tool apksigner)" || fail "apksigner not found. Install Android build-tools (setup-android or sdkmanager 'build-tools;35.0.0')."
ZIPALIGN="$(find_tool zipalign)"  || fail "zipalign not found. Install Android build-tools."
AAPT="$(find_tool aapt2 || true)"
AAPT_LEGACY="$(find_tool aapt || true)"

echo "🔎 Verifying release artifact: $APK"
echo "   size: $(stat -c%s "$APK") bytes"

# ---- 1. signature ----------------------------------------------------------
SIGN_OUT="$(mktemp)"
"$APKSIGNER" verify --verbose --print-certs "$APK" > "$SIGN_OUT" 2>&1 \
  || { cat "$SIGN_OUT"; fail "apksigner rejected the APK signature (see output above)."; }
cat "$SIGN_OUT"
grep -q "Verified using v2 scheme (APK Signature Scheme v2): true" "$SIGN_OUT" \
  || fail "APK Signature Scheme v2 is missing — Android 7+ devices reject or downgrade such packages."
CERT_SHA="$(grep -iE 'Signer #1 certificate SHA-?256 digest:' "$SIGN_OUT" | head -n1 | awk '{print $NF}' | tr 'A-F' 'a-f')"
[ -n "$CERT_SHA" ] || fail "could not read the signing certificate SHA-256 from apksigner output."
echo "   certificate SHA-256: $CERT_SHA"
if [ -n "${EXPECTED_CERT_SHA256:-}" ]; then
  WANT="$(echo "$EXPECTED_CERT_SHA256" | tr -d ': ' | tr 'A-F' 'a-f')"
  [ "$CERT_SHA" = "$WANT" ] \
    || fail "certificate mismatch — built with $CERT_SHA but expected $WANT. Existing users could not update over this build."
  echo "   ✅ certificate matches the expected production key"
fi

# ---- 2. alignment ----------------------------------------------------------
"$ZIPALIGN" -c -P 16 -v 4 "$APK" > /tmp/zipalign-check.txt 2>&1 \
  || { tail -n 40 /tmp/zipalign-check.txt; fail "zipalign check failed (4-byte alignment / 16 KB native-library pages)."; }
echo "   ✅ zipalign: 4-byte aligned, 16 KB page-aligned native libraries"

# ---- 3. manifest / package metadata ---------------------------------------
BADGING=""
if [ -n "$AAPT_LEGACY" ]; then
  BADGING="$("$AAPT_LEGACY" dump badging "$APK" 2>/dev/null || true)"
fi
if [ -z "$BADGING" ] && [ -n "$AAPT" ]; then
  BADGING="$("$AAPT" dump badging "$APK" 2>/dev/null || true)"
fi
[ -n "$BADGING" ] || fail "aapt/aapt2 could not read AndroidManifest.xml — the package is not parseable by Android's own tooling (this is exactly what 'package appears to be invalid' looks like)."
PKG="$(printf '%s\n' "$BADGING" | sed -n "s/^package: name='\([^']*\)'.*/\1/p" | head -n1)"
VCODE="$(printf '%s\n' "$BADGING" | sed -n "s/^package:.*versionCode='\([^']*\)'.*/\1/p" | head -n1)"
VNAME="$(printf '%s\n' "$BADGING" | sed -n "s/^package:.*versionName='\([^']*\)'.*/\1/p" | head -n1)"
MINSDK="$(printf '%s\n' "$BADGING" | sed -n "s/^sdkVersion:'\([^']*\)'.*/\1/p" | head -n1)"
TGTSDK="$(printf '%s\n' "$BADGING" | sed -n "s/^targetSdkVersion:'\([^']*\)'.*/\1/p" | head -n1)"
echo "   package=$PKG versionCode=$VCODE versionName=$VNAME minSdk=$MINSDK targetSdk=$TGTSDK"
[ "$PKG" = "$EXPECTED_PACKAGE" ] || fail "package id is '$PKG' but must be '$EXPECTED_PACKAGE' (a different id installs as a separate app and breaks updates)."
[ -n "$VCODE" ] && [ "$VCODE" != "0" ] || fail "versionCode is missing/zero — Android refuses such packages."
[ -n "$VNAME" ] || fail "versionName is missing."
[ -n "$MINSDK" ] || fail "minSdkVersion is unreadable from the manifest."

# ---- 4. archive integrity --------------------------------------------------
ENTRIES="$(mktemp)"
python3 - "$APK" > "$ENTRIES" <<'PY' || fail "the APK ZIP container is corrupt or truncated (python zipfile could not read every entry)."
import sys, zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
    bad = z.testzip()
    if bad:
        sys.stderr.write("corrupt entry: %s\n" % bad)
        raise SystemExit(1)
    for n in z.namelist():
        print(n)
PY
for required in AndroidManifest.xml classes.dex resources.arsc; do
  grep -qx "$required" "$ENTRIES" || fail "required entry '$required' is missing from the APK."
done
echo "   ✅ archive readable, $(wc -l < "$ENTRIES") entries, manifest + dex + resources present"

# ---- 5. ABI coverage -------------------------------------------------------
for abi in arm64-v8a armeabi-v7a; do
  grep -q "^lib/${abi}/" "$ENTRIES" \
    || fail "native libraries for $abi are missing — the app cannot install on real student devices."
done
echo "   ✅ ARM64 + ARMv7 native libraries present"
if grep -qE '^lib/(x86|x86_64)/' "$ENTRIES"; then
  if [ "$ALLOW_X86" = "1" ]; then
    echo "   ⚠️ x86 libraries present (ALLOW_X86=1, emulator build)"
  else
    fail "x86/x86_64 native libraries found in a production artifact. Set ALLOW_X86=1 only for emulator-only builds."
  fi
fi

# ---- 6. checksum -----------------------------------------------------------
sha256sum "$APK" | awk '{print $1"  "FILENAME}' FILENAME="$(basename "$APK")" > "${APK}.sha256"
CHECKSUM="$(awk '{print $1}' "${APK}.sha256")"
echo "   ✅ SHA-256: $CHECKSUM  → ${APK}.sha256"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### 🔐 APK release verification (exact published artifact)"
    echo ""
    echo "- **File:** \`$(basename "$APK")\`"
    echo "- **Package:** \`$PKG\` — versionCode \`$VCODE\`, versionName \`$VNAME\`"
    echo "- **minSdk / targetSdk:** \`$MINSDK\` / \`$TGTSDK\`"
    echo "- **Signature:** v2 scheme verified, cert SHA-256 \`$CERT_SHA\`"
    echo "- **Alignment:** 4-byte + 16 KB pages OK"
    echo "- **ABIs:** arm64-v8a, armeabi-v7a"
    echo "- **SHA-256:** \`$CHECKSUM\`"
  } >> "$GITHUB_STEP_SUMMARY"
fi
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "APK_SHA256=$CHECKSUM" >> "$GITHUB_ENV"
  echo "APK_CERT_SHA256=$CERT_SHA" >> "$GITHUB_ENV"
fi

echo "✅ APK release verification passed: signature, alignment, manifest/package, archive, ABIs, checksum."
