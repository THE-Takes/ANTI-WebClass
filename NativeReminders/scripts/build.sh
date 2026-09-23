#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXTENSION_ID="${1:-}"
if [[ -n "$EXTENSION_ID" && ! "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
    echo 'Usage: bash NativeReminders/scripts/build.sh [Chrome extension ID]' >&2
    exit 1
fi
OUTPUT="${REMINDERS_BUILD_DIR:-$ROOT/build}"
APP="$OUTPUT/WebClass Reminders.app"
mkdir -p "$APP/Contents/MacOS" "$OUTPUT/module-cache"
cp "$ROOT/Info.plist" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion $(tr -d '\n' < "$ROOT/VERSION")" "$APP/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $(tr -d '\n' < "$ROOT/VERSION")" "$APP/Contents/Info.plist"
for ARCH in arm64 x86_64; do
    xcrun swiftc -swift-version 5 -parse-as-library -target "$ARCH-apple-macos14.0" \
        -module-cache-path "$OUTPUT/module-cache" -O \
        "$ROOT/Sources/Protocol.swift" "$ROOT/Sources/ReminderMetadata.swift" "$ROOT/Sources/ReminderStore.swift" "$ROOT/Sources/NativeHostRegistration.swift" "$ROOT/Sources/Host.swift" \
        -o "$OUTPUT/WebClassReminders-$ARCH"
done
lipo -create "$OUTPUT/WebClassReminders-arm64" "$OUTPUT/WebClassReminders-x86_64" -output "$APP/Contents/MacOS/WebClassReminders"
# Ad-hoc signing is intended for apps each user builds and installs locally.
SIGN_OPTIONS=(--force --options runtime --entitlements "$ROOT/Reminders.entitlements" --sign "${REMINDERS_SIGN_IDENTITY:--}")
if [[ "${REMINDERS_SIGN_IDENTITY:--}" != "-" ]]; then SIGN_OPTIONS+=(--timestamp); fi
codesign "${SIGN_OPTIONS[@]}" "$APP"
echo "$APP"
