#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${REMINDERS_BUILD_DIR:-$ROOT/build}"
ICONS="$OUTPUT/icons"
mkdir -p "$ICONS" "$OUTPUT/module-cache"
xcrun swiftc -module-cache-path "$OUTPUT/module-cache" "$ROOT/scripts/GenerateIcons.swift" -o "$ICONS/generate-icons"
"$ICONS/generate-icons" "$ROOT/../Extension/icons/icon-source.png" "$ICONS"
for NAME in Reminders Installer; do
    ICONSET="$ICONS/$NAME.iconset"
    mkdir -p "$ICONSET"
    for SIZE in 16 32 128 256 512; do
        sips -z "$SIZE" "$SIZE" "$ICONS/$NAME.png" --out "$ICONSET/icon_${SIZE}x${SIZE}.png" >/dev/null
        DOUBLE_SIZE=$((SIZE * 2))
        sips -z "$DOUBLE_SIZE" "$DOUBLE_SIZE" "$ICONS/$NAME.png" --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" >/dev/null
    done
    iconutil -c icns "$ICONSET" -o "$ICONS/$NAME.icns"
done
