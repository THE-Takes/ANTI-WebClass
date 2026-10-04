#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_BROWSER="${1:-}"
EXTENSION_ID="${2:-}"
USER_HOME="${REMINDERS_INSTALL_HOME:-${HOME:?HOME is not set}}"
case "$TARGET_BROWSER" in
    chrome)
        BROWSER_NAME='Google Chrome'
        HOST_RELATIVE_DIR='Google/Chrome/NativeMessagingHosts'
        HOST_NAME='jp.anti_webclass.reminders.chrome'
        APP_NAME='WebClass Reminders Google Chrome.app'
        ;;
    dia)
        BROWSER_NAME='Dia'
        HOST_RELATIVE_DIR='Dia/NativeMessagingHosts'
        HOST_NAME='jp.anti_webclass.reminders.dia'
        APP_NAME='WebClass Reminders Dia.app'
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
SOURCE="${REMINDERS_BUILD_DIR:-$ROOT/build}/$APP_NAME"
codesign --verify --strict "$SOURCE"
APP="$USER_HOME/Applications/$APP_NAME"
mkdir -p "$USER_HOME/Applications"
# Stop synchronization and close the settings page before replacing the host.
STAGED_APP="$USER_HOME/Applications/.$APP_NAME.$$"
trap 'rm -rf "$STAGED_APP"' EXIT
ditto "$SOURCE" "$STAGED_APP"
rm -rf "$APP"
mv "$STAGED_APP" "$APP"
HOST_DIR="$USER_HOME/Library/Application Support/$HOST_RELATIVE_DIR"
mkdir -p "$HOST_DIR"
MANIFEST_TMP="$(mktemp "$HOST_DIR/.reminders.XXXXXX")"
trap 'rm -f "$MANIFEST_TMP"; rm -rf "$STAGED_APP"' EXIT
/usr/bin/plutil -create xml1 "$MANIFEST_TMP"
/usr/bin/plutil -insert name -string "$HOST_NAME" "$MANIFEST_TMP"
/usr/bin/plutil -insert description -string 'WebClass Apple Reminders bridge' "$MANIFEST_TMP"
/usr/bin/plutil -insert path -string "$APP/Contents/MacOS/WebClassReminders" "$MANIFEST_TMP"
/usr/bin/plutil -insert type -string stdio "$MANIFEST_TMP"
/usr/bin/plutil -insert allowed_origins -json "[\"chrome-extension://$EXTENSION_ID/\"]" "$MANIFEST_TMP"
/usr/bin/plutil -convert json "$MANIFEST_TMP"
mv "$MANIFEST_TMP" "$HOST_DIR/$HOST_NAME.json"
rm -f "$HOST_DIR/jp.anti_webclass.reminders.json"
case "$TARGET_BROWSER" in
    chrome) rm -f "$HOST_DIR/jp.anti_webclass.reminders.dia.json" ;;
    dia) rm -f "$HOST_DIR/jp.anti_webclass.reminders.chrome.json" ;;
esac
echo "Installed for $BROWSER_NAME. Open its extension settings, connect Apple Reminders, and select a list."
