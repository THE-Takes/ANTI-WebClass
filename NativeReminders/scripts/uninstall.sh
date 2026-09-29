#!/bin/bash
set -euo pipefail
# User reminder data and list ownership records are intentionally retained for reconnection.
USER_HOME="${HOME:?HOME is not set}"
for HOST_RELATIVE_DIR in 'Google/Chrome/NativeMessagingHosts' 'Dia/NativeMessagingHosts'; do
    for HOST_NAME in 'jp.anti_webclass.reminders' 'jp.anti_webclass.reminders.chrome' 'jp.anti_webclass.reminders.dia'; do
        rm -f "$USER_HOME/Library/Application Support/$HOST_RELATIVE_DIR/$HOST_NAME.json"
    done
done
rm -rf "$USER_HOME/Applications/WebClass Reminders.app"
echo 'Native host removed. Existing reminders were retained.'
