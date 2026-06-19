#!/bin/bash
# Local Android production build script
# KEEP THIS FILE LOCAL — it contains secrets. It is gitignored.

set -e

export APP_ENV=production
export GOOGLE_SERVICES_JSON="./google-services.json"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

# Keystore credentials (from EAS: run `eas credentials --platform android` to download)
# source (not ./): exports must propagate to this shell so KEYSTORE_PATH is available below
source ./build-secrets.sh
# Resolve KEYSTORE_PATH to absolute so gradle can find it from android/ subdir
export KEYSTORE_PATH="$(pwd)/$KEYSTORE_PATH"

echo "==> Running prebuild..."
npx expo prebuild --platform android --clean

echo "==> Building release AAB..."
cd android
./gradlew bundleRelease

echo ""
echo "==> Done! AAB is at:"
echo "    android/app/build/outputs/bundle/release/app-release.aab"
