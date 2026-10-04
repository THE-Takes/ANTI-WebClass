#!/bin/bash
set -euo pipefail
# User reminder data and list ownership records are intentionally retained for reconnection.
USER_HOME="${REMINDERS_INSTALL_HOME:-${HOME:?HOME is not set}}"
case "${1:-}" in
    chrome)
        HOST_RELATIVE_DIR='Google/Chrome/NativeMessagingHosts'
        HOST_NAME='jp.anti_webclass.reminders.chrome'
        APP_NAME='WebClass Reminders Google Chrome.app'
        ;;
    dia)
        HOST_RELATIVE_DIR='Dia/NativeMessagingHosts'
        HOST_NAME='jp.anti_webclass.reminders.dia'
        APP_NAME='WebClass Reminders Dia.app'
        ;;
    *) echo 'Usage: bash NativeReminders/scripts/uninstall.sh <chrome|dia>' >&2; exit 1 ;;
esac
rm -f "$USER_HOME/Library/Application Support/$HOST_RELATIVE_DIR/$HOST_NAME.json"
rm -rf "$USER_HOME/Applications/$APP_NAME"
echo 'Selected native host removed. Existing reminders and the other browser host were retained.'
