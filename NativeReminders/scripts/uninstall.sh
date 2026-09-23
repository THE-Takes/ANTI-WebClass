#!/bin/bash
set -euo pipefail
# User reminder data and list ownership records are intentionally retained for reconnection.
rm -f "$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/jp.anti_webclass.reminders.json"
rm -rf "$HOME/Applications/WebClass Reminders.app"
echo 'Native host removed. Existing reminders were retained.'
