#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${REMINDERS_BUILD_DIR:-$ROOT/build}"
mkdir -p "$OUTPUT/module-cache"
xcrun swiftc -swift-version 5 -parse-as-library -module-cache-path "$OUTPUT/module-cache" \
    "$ROOT/Sources/Protocol.swift" "$ROOT/Tests/ProtocolTests.swift" -o "$OUTPUT/protocol-tests"
"$OUTPUT/protocol-tests"
xcrun swiftc -swift-version 5 -parse-as-library -module-cache-path "$OUTPUT/module-cache" \
    "$ROOT/Sources/Protocol.swift" "$ROOT/Sources/ReminderMetadata.swift" "$ROOT/Tests/MetadataTests.swift" -o "$OUTPUT/metadata-tests"
"$OUTPUT/metadata-tests"
