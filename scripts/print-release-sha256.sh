#!/usr/bin/env bash
# Print the SHA-256 fingerprint of the Android release keystore for use in
# public/.well-known/assetlinks.json. Requires KEYSTORE_PATH, KEY_ALIAS,
# KEYSTORE_PASSWORD, KEY_PASSWORD env vars (or prompts).
set -euo pipefail

KEYSTORE_PATH="${KEYSTORE_PATH:-android/app/release.keystore}"
KEY_ALIAS="${KEY_ALIAS:-${1:-}}"

if [ -z "${KEY_ALIAS}" ]; then
  read -rp "Key alias: " KEY_ALIAS
fi
if [ -z "${KEYSTORE_PASSWORD:-}" ]; then
  read -rsp "Keystore password: " KEYSTORE_PASSWORD; echo
fi
if [ -z "${KEY_PASSWORD:-}" ]; then
  KEY_PASSWORD="${KEYSTORE_PASSWORD}"
fi

SHA=$(keytool -list -v \
  -keystore "${KEYSTORE_PATH}" \
  -alias "${KEY_ALIAS}" \
  -storepass "${KEYSTORE_PASSWORD}" \
  -keypass "${KEY_PASSWORD}" 2>/dev/null \
  | grep -E "SHA256:" | head -1 | awk '{print $2}')

if [ -z "${SHA}" ]; then
  echo "❌ Could not extract SHA-256. Check keystore path / alias / password." >&2
  exit 1
fi

echo
echo "✅ SHA-256: ${SHA}"
echo
echo "Paste this into public/.well-known/assetlinks.json (sha256_cert_fingerprints array),"
echo "redeploy your web origin, then verify with:"
echo "  adb shell pm verify-app-links --re-verify com.jsrcoaching.app"
echo "  adb shell pm get-app-links com.jsrcoaching.app"
