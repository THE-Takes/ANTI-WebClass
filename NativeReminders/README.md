# WebClass Reminders

[日本語の更新手順（メモ短縮版への移行・バックアップ）](README.ja.md)

macOS 14+ / Google Chrome. The extension remains cross-platform. This host is only used when Apple Reminders is selected and the user grants the optional `nativeMessaging` permission.

## Public installation

Download and expand the latest `WebClass-Reminders` ZIP from the [ANTI-WebClass Releases page](https://github.com/THE-Takes/ANTI-WebClass/releases). Open the installer app, paste the extension ID shown at `chrome://extensions`, and click **Install**. No Xcode tools or terminal commands are required. The installer registers the native host for that exact Chrome extension ID, then copies the host app to `~/Applications`.

The installer app also removes the host and Chrome registration. Uninstalling keeps the WebClass Reminders list and metadata files. The extension ID is written only to Chrome's local native messaging manifest.

## Development setup

From the repository root on macOS, with Xcode Command Line Tools installed:

```sh
bash NativeReminders/scripts/build.sh [32-character-Chrome-extension-ID]
bash NativeReminders/scripts/install.sh <32-character-Chrome-extension-ID>
```

The optional ID argument is checked for typos; the install script writes the selected ID to Chrome's `allowed_origins` manifest. The build script creates a Universal 2 `.app` (arm64 + x86_64) and ad-hoc signs it for local development. At launch the host verifies that Chrome's registration lists the requesting origin and points to the installed executable. The installer only supports Google Chrome, not other Chromium browsers.

The install script copies the app to `~/Applications/WebClass Reminders.app` and registers `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/jp.anti_webclass.reminders.json`. It does not install or launch the EventKit host during a build.

Enable external ToDo integration in extension settings, choose Apple Reminders and click Connect. Accept Chrome's native permission and macOS's reminder permission. A dedicated `WebClass` list is created in the default Reminders account. A same-named personal list is never adopted. Connecting does not retrieve WebClass pages or export tasks; the existing home synchronization flow does that.

## Behavior and ownership

- The extension's existing synchronization engine is shared with TickTick. Remote title, deadline and completion are imported; a local mutation takes priority for that target. Trash forces remote completion. Missing active tasks are recreated during full sync.
- Only reminders bearing a valid `WC_SYNC_ID` in the managed list are read or modified. Removing that metadata makes a reminder unmanaged; the next full sync can recreate the task. Never remove metadata as a way to stop synchronization; disconnect or use WebClass's trash instead.
- ID matching prefers fallback URL, then source URL; remote item IDs are stored separately from assignments so the WebClass scraper does not need changing. EventKit IDs may change during full account sync; embedded sync IDs are used for recovery.
- Original metadata and current deadline follow TickTick's format. Apple-exported links are normalized to remove known session parameters. No task data goes to a custom server; Apple may sync the selected account through its normal service.
- Failed local edits are retained in a local pending queue so the next full sync does not pull stale remote data over them. Reads must complete before writes start. Calls are sequential; a process lock prevents concurrent native writers.
- Runtime connection, list IDs, pending edits and status are excluded from settings backup. They are local to this browser installation. The selected provider is a normal setting. Importing Apple settings on Windows does not fall back silently to TickTick.
- As with the current TickTick integration, a browser assignment store is intended for one WebClass account. This feature adds no account-switching or scraping behavior.

## Update / removal

Disable synchronization and close extension settings before rebuilding and reinstalling for the same extension ID. To remove the host:

```sh
bash NativeReminders/scripts/uninstall.sh
```

The uninstall script removes only the host registration and installed app. Reminders and list ownership preferences are retained to allow reconnection. Rebuilding with a different signature can require granting macOS permission again. If a managed list has been deleted, explicit reconnection creates a new list; scheduled sync fails without silently creating one.

## Source-only validation

```sh
npm run check
npm test
bash NativeReminders/scripts/test.sh
bash NativeReminders/scripts/build.sh
```

The build is extension-ID independent; the optional ID argument only catches typos. `install.sh` writes the selected ID to Chrome's registration, and the host checks that registration when Chrome starts it. Protocol tests link Foundation only and never load EventKit or request permission.

## Packaging and public release

The packaging script creates a Universal 2 ZIP containing a guided installer app. A local build is ad-hoc signed by default and is only for development review:

```sh
bash NativeReminders/scripts/package-release.sh
```

Public distribution uses a separate Developer ID-signed and notarized build. The release workflow and its credentials are configured only in the public `THE-Takes/ANTI-WebClass` repository; local ad-hoc ZIP files must not be distributed.

The public package is built for Apple Silicon and Intel and requires macOS 14+. Before announcing a release, verify native-host lookup in Chrome, Reminders permission attribution and persistence across updates, task edits in a real test list, iCloud propagation, browser restart, older macOS rejection, Windows settings, and both CPU architectures. Source-only build checks do not replace those real-environment checks.

## Protocol

Version 1, UTF-8 JSON with a 4-byte little-endian length header (both supported macOS architectures are little-endian). Requests have `version`, `requestId`, `command`. Commands: `status`, `connect`, `snapshot`, `create`, `patch`, `complete`, `delete`. Task operations require the host-owned `listId`; item updates additionally require an owned `id`. Task data is mapped into the established TickTick shape (`title`, `content`, `dueDate`, `status` 0/2).

Snapshots include completed reminders and are paginated in groups of 10. The maximum message size is 900 KB; an oversized snapshot fails rather than being treated as an empty list. stdout is reserved for framed responses; diagnostics go to stderr. Disconnecting closes the port and terminates the host process; there is no daemon or localhost server.

References: [Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging), [Apple EventKit access](https://developer.apple.com/documentation/eventkit/accessing-the-event-store), [EventKit item IDs](https://developer.apple.com/documentation/eventkit/ekcalendaritem/calendaritemidentifier).


## Compact notes (host 0.2.0)

The visible note contains only a short course name (at most 40 characters) and the existing `WC_SYNC_ID` line. The deadline and URL use the standard Reminders fields. Full metadata is stored atomically on the Mac at:

```text
~/Library/Application Support/ANTI-WebClass/Reminders/metadata-<extension-ID>.json
```

The file is separated by extension ID and records by list ID plus stable sync ID. Snapshot reads migrate managed legacy notes, including completed tasks: first save the full metadata, then shorten the note. A failed local write aborts migration without shortening that note. Corrupt metadata fails closed; restore the JSON file from backup rather than deleting it to bypass the error. No unmarked personal reminders are migrated.

The native host expands saved metadata when communicating with the extension, retaining the shared TickTick matching and deadline-fallback rules. Actual title, completion and due date still come from EventKit. Short course names are supplied by the extension when supported; older extension versions use a shortened version of the original Course field. An older host remains compatible with the updated extension, but will continue to show long notes until upgraded.

Back up the metadata JSON along with extension settings for complete recovery of original titles/deadlines. Uninstall retains it. If the file is absent, the remaining sync ID and standard URL still permit matching and later reconstruction from local assignments; historical originals cannot always be recovered. Avoid downgrading the native host after migration, because older hosts do not expand compact notes.

To activate, disable sync, close settings, rebuild and reinstall using the **actual** extension ID with the commands above, reload the extension, then run the normal sync. Existing reminders are updated in place; do not delete and recreate the list. This update was tested with Foundation-only metadata tests, JavaScript regression tests and a Universal 2 build; it does not itself install the host or touch real reminders.
