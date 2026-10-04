# WebClass Reminders

[Build from source](BUILD_FROM_SOURCE.md) · [ソースからビルドする（日本語）](BUILD_FROM_SOURCE.ja.md) · [日本語の更新手順（メモ短縮版への移行・バックアップ）](README.ja.md)

macOS 14+ / Google Chrome or Dia. The extension remains cross-platform. This host is only used when Apple Reminders is selected and the user grants the optional `nativeMessaging` permission. Chrome and Dia use separately identified helper apps and may coexist on one Mac.

## Build and install on your Mac

The WebClass Reminders v0.4.0 installer ZIP is available in the [latest GitHub release](https://github.com/THE-Takes/ANTI-WebClass/releases/latest). You can also build the helper locally from the public source. Follow [Build from source](BUILD_FROM_SOURCE.md) or the [Japanese guide](BUILD_FROM_SOURCE.ja.md). A local self-build does not require an Apple Developer membership, Developer ID certificate, or notarization credentials.

The installer removes only the selected browser helper and registration when uninstalling. Uninstalling keeps the selected Reminders list and metadata files. During installation, the extension ID is written only to the selected browser's local native messaging manifest; installing the other browser leaves the first registration in place.

When connecting, choose an existing list or click “新しいリストを作成…” to enter a custom name and choose a local or CalDAV account (including iCloud). “作成して接続” saves the new list and links it immediately. “戻る” returns to existing-list selection without creating a list. Empty names and save failures keep the creation dialog open for correction. Creation is available even when there are no existing writable lists, provided a supported account is available.

## Development setup

From the repository root on macOS, with Xcode Command Line Tools installed:

```sh
bash NativeReminders/scripts/build.sh
bash NativeReminders/scripts/install.sh <chrome|dia> <32-character-extension-ID>
```

The install script writes exactly one extension ID to the selected browser's `allowed_origins` manifest and preserves the other supported browser. The build script creates a Universal 2 `.app` (arm64 + x86_64) and ad-hoc signs it for local development. At launch each host verifies its own browser registration, executable path, bundle ID, and requesting origin.

The installer copies the app to `~/Applications/WebClass Reminders Google Chrome.app` or `~/Applications/WebClass Reminders Dia.app` and registers the corresponding location:

```text
Google Chrome: ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/jp.anti_webclass.reminders.chrome.json
Dia:           ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/jp.anti_webclass.reminders.dia.json
```

Dia reads Chrome's native messaging directory. The browser-specific filenames keep both registrations separate. Reinstalling the Dia helper removes its old registration under `Dia/NativeMessagingHosts`; installing or uninstalling either helper preserves the other browser's registration. A build does not install or launch the EventKit host.

In the browser selected during installation, enable external ToDo integration in extension settings, choose Apple Reminders and click Connect. Accept the browser's native permission and macOS's reminder permission. The helper enumerates writable Reminders lists and asks the user to choose one. A list already linked to another extension cannot be selected. Connecting does not retrieve WebClass pages or export tasks; the existing home synchronization flow does that.

## Behavior and ownership

- The extension's existing synchronization engine is shared with TickTick. Remote title, deadline and completion are imported; a local mutation takes priority for that target. Trash forces remote completion. Missing active tasks are recreated during full sync.
- Only reminders bearing a valid `WC_SYNC_ID` in the managed list are read or modified. Removing that metadata makes a reminder unmanaged; the next full sync can recreate the task. Never remove metadata as a way to stop synchronization; disconnect or use WebClass's trash instead.
- ID matching prefers fallback URL, then source URL; remote item IDs are stored separately from assignments so the WebClass scraper does not need changing. EventKit IDs may change during full account sync; embedded sync IDs are used for recovery.
- Original metadata and current deadline follow TickTick's format. Apple-exported links are normalized to remove known session parameters. No task data goes to a custom server; Apple may sync the selected account through its normal service.
- Failed local edits are retained in a local pending queue so the next full sync does not pull stale remote data over them. Reads must complete before writes start. Calls are sequential; a per-extension process lock prevents concurrent writes by the same extension while allowing the two browser helpers to run together.
- Runtime connection, list IDs, pending edits and status are excluded from settings backup. They are local to this browser installation. The selected provider is a normal setting. Importing Apple settings on Windows does not fall back silently to TickTick.
- As with the current TickTick integration, a browser assignment store is intended for one WebClass account. This feature adds no account-switching or scraping behavior.

## Update / removal

Disable synchronization and close extension settings before rebuilding and reinstalling for the same extension ID. To remove the host:

```sh
bash NativeReminders/scripts/uninstall.sh <chrome|dia>
```

The uninstall script removes only the host registration and installed app. Reminders and list ownership preferences are retained to allow reconnection. Rebuilding with a different signature can require granting macOS permission again. If a selected list has been deleted, reconnect and choose an existing writable list; scheduled sync fails until then.

## Source-only validation

```sh
npm run check
npm test
bash NativeReminders/scripts/test.sh
bash NativeReminders/scripts/build.sh
```

The build creates both browser-specific apps without needing an extension ID. `install.sh` takes one target browser and one extension ID; each host accepts only its own browser manifest with exactly one extension origin. Protocol tests link Foundation only and never load EventKit or request permission.

## Local build package

The packaging script creates a Universal ZIP with a guided installer for the user who built it. It uses an ad-hoc signature. The same installer format is attached to GitHub releases:

```sh
bash NativeReminders/scripts/package-release.sh
```

The generated files are under `NativeReminders/dist/`, which is ignored by Git. Each user should build and install the helper on the Mac where it will run.

## Protocol

Version 1, UTF-8 JSON with a 4-byte little-endian length header (both supported macOS architectures are little-endian). Requests have `version`, `requestId`, `command`. Commands: `status`, `connect`, `snapshot`, `create`, `patch`, `complete`, `delete`. Task operations require the host-owned `listId`; item updates additionally require an owned `id`. Task data is mapped into the established TickTick shape (`title`, `content`, `dueDate`, `status` 0/2).

Snapshots include completed reminders and are paginated in groups of 10. The maximum message size is 900 KB; an oversized snapshot fails rather than being treated as an empty list. stdout is reserved for framed responses; diagnostics go to stderr. Disconnecting closes the port and terminates the host process; there is no daemon or localhost server.

References: [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [Apple EventKit access](https://developer.apple.com/documentation/eventkit/accessing-the-event-store), [EventKit item IDs](https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemidentifier).


## Compact notes (host 0.2.0)

The visible note contains only a short course name (at most 40 characters) and the existing `WC_SYNC_ID` line. The deadline and URL use the standard Reminders fields. Full metadata is stored atomically on the Mac at:

```text
~/Library/Application Support/ANTI-WebClass/Reminders/metadata-jp.anti_webclass.reminders.<chrome|dia>-<extension-ID>.json
```

The file is separated by browser and extension ID, and records by list ID plus stable sync ID. An existing `metadata-<extension-ID>.json` is copied to the browser-specific file on first use and retained as a backup. Snapshot reads migrate managed legacy notes, including completed tasks: first save the full metadata, then shorten the note. A failed local write aborts migration without shortening that note. Corrupt metadata fails closed; restore the JSON file from backup rather than deleting it to bypass the error. No unmarked personal reminders are migrated.

The native host expands saved metadata when communicating with the extension, retaining the shared TickTick matching and deadline-fallback rules. Actual title, completion and due date still come from EventKit. Short course names are supplied by the extension when supported; older extension versions use a shortened version of the original Course field. An older host remains compatible with the updated extension, but will continue to show long notes until upgraded.

Back up the metadata JSON along with extension settings for complete recovery of original titles/deadlines. Uninstall retains it. If the file is absent, the remaining sync ID and standard URL still permit matching and later reconstruction from local assignments; historical originals cannot always be recovered. Avoid downgrading the native host after migration, because older hosts do not expand compact notes.

To activate, disable sync, close settings, rebuild and reinstall using the **actual** extension ID with the commands above, reload the extension, then run the normal sync. Existing reminders are updated in place; do not delete and recreate the list. This update was tested with Foundation-only metadata tests, JavaScript regression tests and a Universal 2 build; it does not itself install the host or touch real reminders.
