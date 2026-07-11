#!/bin/bash
# Local iOS production build script
# Run from project root: ./build-ios.sh

set -e

# Guard against a leftover `expo start` / sourced .env in this shell silently
# shadowing .env.production — Expo's env loader never overrides a variable
# that's already set in the process environment.
for var in $(compgen -e | grep '^EXPO_PUBLIC_'); do unset "$var"; done
unset API_KEY

export APP_ENV=production
export NODE_ENV=production
export GOOGLE_SERVICES_PLIST="./GoogleService-Info.plist"

WORKSPACE="ios/Crease.xcworkspace"
SCHEME="Crease"
ARCHIVE_PATH="build/Crease.xcarchive"
EXPORT_PATH="build/ios-export"
DERIVED_DATA_PATH="build/DerivedData"

source ./build-secrets.sh

if [ -z "$APPLE_TEAM_ID" ] || [ "$APPLE_TEAM_ID" = "YOUR_TEAM_ID_HERE" ]; then
  echo "ERROR: Set APPLE_TEAM_ID in build-secrets.sh before building."
  exit 1
fi

echo "==> Running prebuild..."
npx expo prebuild --platform ios --clean

# expo-notifications' config plugin always writes aps-environment as
# 'development' at prebuild time (it can't know here whether this'll end up
# a dev or App Store build) — EAS Build normally corrects this as part of
# its own pipeline, but this script builds locally, so exportArchive rejects
# an App Store distribution profile against a 'development' entitlement.
# Must patch AFTER prebuild (which regenerates this file every run) and
# BEFORE `xcodebuild archive` (entitlements are baked in at archive time,
# not at export time).
echo "==> Setting aps-environment to production for App Store distribution..."
ENTITLEMENTS="ios/${SCHEME}/${SCHEME}.entitlements"
if [ ! -f "$ENTITLEMENTS" ]; then
  echo "ERROR: $ENTITLEMENTS not found after prebuild — expected the expo-notifications"
  echo "        plugin to generate it. Did the plugin config change?"
  exit 1
fi
/usr/libexec/PlistBuddy -c "Set :aps-environment production" "$ENTITLEMENTS"

echo "==> Patching Podfile (use_modular_headers!)..."
sed -i '' 's/^prepare_react_native_project!$/use_modular_headers!\n\nprepare_react_native_project!/' ios/Podfile

echo "==> Installing CocoaPods..."
(cd ios && pod install)

mkdir -p build

# A DerivedData cache shared with `expo run:ios` / Xcode.app can leave behind
# arm64 build products from a simulator run; on Apple Silicon that arch string
# matches device arm64 too, so Xcode's incremental build can silently link the
# archive against simulator-built frameworks (e.g. Hermes) instead of device
# ones. Force a clean, isolated DerivedData dir for every archive build.
rm -rf "$DERIVED_DATA_PATH"

echo "==> Archiving..."
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  -allowProvisioningUpdates \
  archive

echo "==> Verifying production environment was embedded in the bundle..."
BUNDLE_JS="$ARCHIVE_PATH/Products/Applications/${SCHEME}.app/main.jsbundle"
PROD_PROJECT_ID=$(grep '^EXPO_PUBLIC_FIREBASE_PROJECT_ID=' .env.production | cut -d= -f2)
DEV_PROJECT_ID=$(grep '^EXPO_PUBLIC_FIREBASE_PROJECT_ID=' .env | cut -d= -f2)

if [ ! -f "$BUNDLE_JS" ]; then
  echo "ERROR: Couldn't find bundled JS at $BUNDLE_JS to verify."
  exit 1
fi

if [ -z "$PROD_PROJECT_ID" ] || ! grep -q "$PROD_PROJECT_ID" "$BUNDLE_JS"; then
  echo "ERROR: Production Firebase project id ('$PROD_PROJECT_ID') not found in the bundle."
  echo "        The archive was built with the wrong environment. Aborting before export."
  exit 1
fi

if [ -n "$DEV_PROJECT_ID" ] && [ "$DEV_PROJECT_ID" != "$PROD_PROJECT_ID" ] && grep -q "$DEV_PROJECT_ID" "$BUNDLE_JS"; then
  echo "ERROR: Dev/staging Firebase project id ('$DEV_PROJECT_ID') found in the bundle."
  echo "        .env leaked into a production build. Aborting before export."
  exit 1
fi

if grep -q "Emulator sign-in failed" "$BUNDLE_JS"; then
  echo "ERROR: Emulator sign-in code is present in the bundle — EXPO_PUBLIC_USE_EMULATOR"
  echo "        was not inlined to false. Aborting before export."
  exit 1
fi

if ! grep -q "Sign in with Google" "$BUNDLE_JS"; then
  echo "ERROR: 'Sign in with Google' button not found in the bundle — the emulator"
  echo "        sign-in branch is showing instead. Aborting before export."
  exit 1
fi

echo "    OK — production environment correctly embedded."

echo "==> Writing ExportOptions.plist..."
cat > build/ExportOptions.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>${APPLE_TEAM_ID}</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>uploadSymbols</key>
  <true/>
  <key>compileBitcode</key>
  <false/>
</dict>
</plist>
EOF

echo "==> Exporting IPA..."
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "build/ExportOptions.plist"

echo ""
echo "==> Done! IPA is at:"
echo "    $EXPORT_PATH/Crease.ipa"
echo ""
echo "==> Upload via Xcode: Window → Organizer → open the archive → Distribute App"
echo "==> Or drag the IPA into Transporter (free on Mac App Store)"
