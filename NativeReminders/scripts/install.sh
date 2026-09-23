#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXTENSION_ID="${1:-}"
if [[ ! "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
    echo 'Usage: bash NativeReminders/scripts/install.sh <Chrome extension ID>' >&2
    exit 1
fi
SOURCE="${REMINDERS_BUILD_DIR:-$ROOT/build}/WebClass Reminders.app"
codesign --verify --strict "$SOURCE"
APP="$HOME/Applications/WebClass Reminders.app"
mkdir -p "$HOME/Applications"
# Stop synchronization and close the settings page before replacing the host.
ditto "$SOURCE" "$APP"
HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
mkdir -p "$HOST_DIR"
MANIFEST_TMP="$(mktemp "$HOST_DIR/.reminders.XXXXXX")"
trap 'rm -f "$MANIFEST_TMP"' EXIT
/usr/bin/plutil -create xml1 "$MANIFEST_TMP"
/usr/bin/plutil -insert name -string jp.anti_webclass.reminders "$MANIFEST_TMP"
/usr/bin/plutil -insert description -string 'WebClass Apple Reminders bridge' "$MANIFEST_TMP"
/usr/bin/plutil -insert path -string "$APP/Contents/MacOS/WebClassReminders" "$MANIFEST_TMP"
/usr/bin/plutil -insert type -string stdio "$MANIFEST_TMP"
/usr/bin/plutil -insert allowed_origins -json "[\"chrome-extension://$EXTENSION_ID/\"]" "$MANIFEST_TMP"
/usr/bin/plutil -convert json "$MANIFEST_TMP"
mv "$MANIFEST_TMP" "$HOST_DIR/jp.anti_webclass.reminders.json"
echo 'Installed. Open extension settings and connect Apple Reminders.'
