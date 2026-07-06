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

source ./build-secrets.sh

if [ -z "$APPLE_TEAM_ID" ] || [ "$APPLE_TEAM_ID" = "YOUR_TEAM_ID_HERE" ]; then
  echo "ERROR: Set APPLE_TEAM_ID in build-secrets.sh before building."
  exit 1
fi

echo "==> Running prebuild..."
npx expo prebuild --platform ios --clean

echo "==> Patching Podfile (use_modular_headers!)..."
sed -i '' 's/^prepare_react_native_project!$/use_modular_headers!\n\nprepare_react_native_project!/' ios/Podfile

echo "==> Installing CocoaPods..."
(cd ios && pod install)

mkdir -p build

echo "==> Archiving..."
xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  -allowProvisioningUpdates \
  archive

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
