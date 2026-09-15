#!/usr/bin/env bash
# Local APK build script — mirrors .github/workflows/build-apk.yml
# Usage: ./scripts/build-apk-local.sh
# Polished per capacitor-bun-apk-build skill: Node 24, Bun-first install,
# tsgo typecheck (never tsc), numeric APP_VERSION_NAME guard, APK smoke check.
set -euo pipefail

echo "🔍 Checking prerequisites..."
command -v node >/dev/null || { echo "❌ Node.js not found. Install Node 22 LTS."; exit 1; }
command -v java >/dev/null || { echo "❌ Java not found. Install JDK 21 (Temurin)."; exit 1; }
[ -n "${ANDROID_HOME:-}" ] || { echo "❌ ANDROID_HOME not set. Install Android Studio + SDK 35."; exit 1; }

NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
[ "$NODE_MAJOR" = "24" ] || echo "⚠️  Node $NODE_MAJOR detected; workflow pins Node 24. Continuing..."

JAVA_MAJOR=$(java -version 2>&1 | head -n1 | sed -E 's/.*"([0-9]+).*/\1/')
[ "$JAVA_MAJOR" = "21" ] || echo "⚠️  Java $JAVA_MAJOR detected; workflow uses JDK 21. Continuing..."

# versionName MUST be numeric — android/app/build.gradle strips non-numeric
# chars but a totally empty / "main" value trips ForceUpdateGate. Default 1.0.0.
export APP_VERSION_NAME="${APP_VERSION_NAME:-1.0.0}"
echo "🔖 APP_VERSION_NAME=$APP_VERSION_NAME"

echo ""
echo "📦 Installing dependencies (Bun-first, npm fallback)..."
if command -v bun >/dev/null; then
  bun install --no-save
else
  echo "⚠️  bun not found — falling back to npm."
  npm install --legacy-peer-deps --no-audit --no-fund
fi

echo ""
echo "🔍 TypeScript typecheck (tsgo)..."
# Single source of truth with CI: package.json "typecheck" script.
if command -v bun >/dev/null; then
  bun run typecheck
else
  npm run typecheck
fi

echo ""
echo "🏗️  Building web app..."
npm run build

echo ""
echo "🔄 Syncing Capacitor (dist → android)..."
npx cap sync android

echo ""
echo "🔧 Making gradlew executable..."
chmod +x android/gradlew

echo ""
echo "🤖 Building Debug APK (this can take a few minutes)..."
( cd android && ./gradlew assembleDebug --no-daemon --parallel --build-cache )

APK="android/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK" ]; then
  SIZE=$(du -sh "$APK" | cut -f1)
  echo ""
  echo "✅ APK built successfully!"
  echo "   Path: $APK"
  echo "   Size: $SIZE"

  echo ""
  echo "🔎 APK smoke check (MainActivity + capacitor.plugins.json)..."
  PLUGINS_JSON="android/app/src/main/assets/capacitor.plugins.json"
  if [ -f "$PLUGINS_JSON" ] && grep -q "MainActivity" android/app/src/main/AndroidManifest.xml; then
    PLUGIN_COUNT=$(grep -c '"pkg"' "$PLUGINS_JSON" || echo 0)
    echo "   ✓ MainActivity present, $PLUGIN_COUNT Capacitor plugins bundled."
  else
    echo "   ⚠️  Smoke check failed — MainActivity or capacitor.plugins.json missing."
  fi

  echo ""
  echo "📲 Install on device:"
  echo "   adb install -r $APK"
else
  echo "❌ APK not found at $APK"
  exit 1
fi
