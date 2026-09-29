#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_BROWSER="${1:-}"
EXTENSION_ID="${2:-}"
USER_HOME="${HOME:?HOME is not set}"
case "$TARGET_BROWSER" in
    chrome)
        BROWSER_NAME='Google Chrome'
        HOST_RELATIVE_DIR='Google/Chrome/NativeMessagingHosts'
        HOST_NAME='jp.anti_webclass.reminders.chrome'
        ;;
    dia)
        BROWSER_NAME='Dia'
        HOST_RELATIVE_DIR='Dia/NativeMessagingHosts'
        HOST_NAME='jp.anti_webclass.reminders.dia'
        ;;
    *)
        echo 'Usage: bash NativeReminders/scripts/install.sh <chrome|dia> <extension ID>' >&2
        exit 1
        ;;
esac
if [[ ! "$EXTENSION_ID" =~ ^[a-p]{32}$ ]]; then
    echo 'Usage: bash NativeReminders/scripts/install.sh <chrome|dia> <extension ID>' >&2
    exit 1
fi
SOURCE="${REMINDERS_BUILD_DIR:-$ROOT/build}/WebClass Reminders.app"
codesign --verify --strict "$SOURCE"
APP="$USER_HOME/Applications/WebClass Reminders.app"
mkdir -p "$USER_HOME/Applications"
# Stop synchronization and close the settings page before replacing the host.
ditto "$SOURCE" "$APP"
HOST_DIR="$USER_HOME/Library/Application Support/$HOST_RELATIVE_DIR"
mkdir -p "$HOST_DIR"
for HOST_RELATIVE_DIR_TO_CLEAN in 'Google/Chrome/NativeMessagingHosts' 'Dia/NativeMessagingHosts'; do
    for MANAGED_HOST_NAME in 'jp.anti_webclass.reminders' 'jp.anti_webclass.reminders.chrome' 'jp.anti_webclass.reminders.dia'; do
        rm -f "$USER_HOME/Library/Application Support/$HOST_RELATIVE_DIR_TO_CLEAN/$MANAGED_HOST_NAME.json"
    done
done
MANIFEST_TMP="$(mktemp "$HOST_DIR/.reminders.XXXXXX")"
trap 'rm -f "$MANIFEST_TMP"' EXIT
/usr/bin/plutil -create xml1 "$MANIFEST_TMP"
/usr/bin/plutil -insert name -string "$HOST_NAME" "$MANIFEST_TMP"
/usr/bin/plutil -insert description -string 'WebClass Apple Reminders bridge' "$MANIFEST_TMP"
/usr/bin/plutil -insert path -string "$APP/Contents/MacOS/WebClassReminders" "$MANIFEST_TMP"
/usr/bin/plutil -insert type -string stdio "$MANIFEST_TMP"
/usr/bin/plutil -insert allowed_origins -json "[\"chrome-extension://$EXTENSION_ID/\"]" "$MANIFEST_TMP"
/usr/bin/plutil -convert json "$MANIFEST_TMP"
mv "$MANIFEST_TMP" "$HOST_DIR/$HOST_NAME.json"
echo "Installed for $BROWSER_NAME only. Open its extension settings and connect Apple Reminders."
