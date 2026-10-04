#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${REMINDERS_BUILD_DIR:-$ROOT/build}"
mkdir -p "$OUTPUT/module-cache"
bash "$ROOT/scripts/build-icons.sh"
for ARCH in arm64 x86_64; do
    xcrun swiftc -swift-version 5 -parse-as-library -target "$ARCH-apple-macos14.0" \
        -module-cache-path "$OUTPUT/module-cache" -O \
        "$ROOT/Sources/Protocol.swift" "$ROOT/Sources/ReminderMetadata.swift" "$ROOT/Sources/ListSelection.swift" "$ROOT/Sources/ListPicker.swift" "$ROOT/Sources/ListCreation.swift" "$ROOT/Sources/ReminderStore.swift" "$ROOT/Sources/BrowserTarget.swift" "$ROOT/Sources/NativeHostRegistration.swift" "$ROOT/Sources/Host.swift" \
        -o "$OUTPUT/WebClassReminders-$ARCH"
done
for BROWSER in 'Google Chrome' Dia; do
    APP="$OUTPUT/WebClass Reminders $BROWSER.app"
    mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
    cp "$OUTPUT/icons/Reminders.icns" "$APP/Contents/Resources/Reminders.icns"
    cp "$ROOT/Info.plist" "$APP/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $(tr -d '\n' < "$ROOT/VERSION")" "$APP/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $(tr -d '\n' < "$ROOT/VERSION")" "$APP/Contents/Info.plist"
    case "$BROWSER" in
        'Google Chrome') BROWSER_ID=chrome ;;
        Dia) BROWSER_ID=dia ;;
    esac
    /usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier jp.anti-webclass.reminders.$BROWSER_ID" "$APP/Contents/Info.plist"
    /usr/libexec/PlistBuddy -c "Set :CFBundleName WebClass Reminders $BROWSER" "$APP/Contents/Info.plist"
    lipo -create "$OUTPUT/WebClassReminders-arm64" "$OUTPUT/WebClassReminders-x86_64" -output "$APP/Contents/MacOS/WebClassReminders"
    SIGN_OPTIONS=(--force --options runtime --entitlements "$ROOT/Reminders.entitlements" --sign "${REMINDERS_SIGN_IDENTITY:--}")
    if [[ "${REMINDERS_SIGN_IDENTITY:--}" != "-" ]]; then SIGN_OPTIONS+=(--timestamp); fi
    codesign "${SIGN_OPTIONS[@]}" "$APP"
    echo "$APP"
done
