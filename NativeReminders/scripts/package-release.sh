#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(cat "$ROOT/VERSION")"
OUTPUT="${REMINDERS_RELEASE_DIR:-$ROOT/dist}"
BUILD="$OUTPUT/build"
MODULE_CACHE="$BUILD/installer-module-cache"
INSTALLER_APP="$BUILD/Install WebClass Reminders.app"
SIGN_IDENTITY="${REMINDERS_SIGN_IDENTITY:--}"

mkdir -p "$BUILD" "$MODULE_CACHE"
REMINDERS_BUILD_DIR="$BUILD" REMINDERS_SIGN_IDENTITY="$SIGN_IDENTITY" bash "$ROOT/scripts/build.sh"

rm -rf "$INSTALLER_APP"
mkdir -p "$INSTALLER_APP/Contents/MacOS" "$INSTALLER_APP/Contents/Resources"
cp "$BUILD/icons/Installer.icns" "$INSTALLER_APP/Contents/Resources/Installer.icns"
cp "$ROOT/Installer-Info.plist" "$INSTALLER_APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $VERSION" "$INSTALLER_APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" "$INSTALLER_APP/Contents/Info.plist"
for BROWSER in 'Google Chrome' Dia; do
    ditto "$BUILD/WebClass Reminders $BROWSER.app" "$INSTALLER_APP/Contents/Resources/WebClass Reminders $BROWSER.app"
done

for ARCH in arm64 x86_64; do
    xcrun swiftc -swift-version 5 -parse-as-library -target "$ARCH-apple-macos14.0" -module-cache-path "$MODULE_CACHE" -O \
        "$ROOT/Sources/BrowserTarget.swift" "$ROOT/Sources/NativeHostRegistration.swift" "$ROOT/Sources/InstallerMenu.swift" "$ROOT/Sources/InstallerCompletion.swift" "$ROOT/Sources/Installer.swift" -o "$BUILD/WebClassRemindersInstaller-$ARCH"
done
lipo -create "$BUILD/WebClassRemindersInstaller-arm64" "$BUILD/WebClassRemindersInstaller-x86_64" \
    -output "$INSTALLER_APP/Contents/MacOS/WebClassRemindersInstaller"
INSTALLER_SIGN_OPTIONS=(--force --options runtime --sign "$SIGN_IDENTITY")
if [[ "$SIGN_IDENTITY" != "-" ]]; then INSTALLER_SIGN_OPTIONS+=(--timestamp); fi
codesign "${INSTALLER_SIGN_OPTIONS[@]}" "$INSTALLER_APP"
codesign --verify --deep --strict "$INSTALLER_APP"

ARCHIVE="$OUTPUT/WebClass-Reminders-v$VERSION.zip"
rm -f "$ARCHIVE" "$ARCHIVE.sha256"
ditto -c -k --sequesterRsrc --keepParent "$INSTALLER_APP" "$ARCHIVE"
(
    cd "$OUTPUT"
    shasum -a 256 "$(basename "$ARCHIVE")" > "$(basename "$ARCHIVE").sha256"
)
echo "$ARCHIVE"
