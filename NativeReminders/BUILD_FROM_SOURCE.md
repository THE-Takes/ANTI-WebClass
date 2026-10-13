# Build WebClass Reminders from source

[日本語版](BUILD_FROM_SOURCE.ja.md)

The Apple Reminders helper can be downloaded as a Universal installer ZIP from the [latest release](https://github.com/THE-Takes/ANTI-WebClass/releases/latest), or built from source on your own Mac by following this guide. The Chrome-compatible extension is installed separately in Google Chrome or Dia.

## Requirements

- A Mac running macOS 14 or later.
- Google Chrome or Dia. Separate Chrome and Dia helpers can be registered on the same Mac.
- Git and the Xcode Command Line Tools. A full Xcode installation is not required.
- No Apple Developer Program membership, Developer ID certificate, or Apple notarization credentials are needed for a personal build on the same Mac.

The build script uses an ad-hoc code signature by default. This guide is for building and installing your own copy on the same Mac. Use the official release package when installing on another user's Mac; do not redistribute a package you built yourself.

## 1. Clone the public source

Clone the public repository with Git. Building a local clone keeps the app local to the Mac where it will run.

```sh
git clone https://github.com/THE-Takes/ANTI-WebClass.git
cd ANTI-WebClass
```

Install the Xcode Command Line Tools if needed:

```sh
xcode-select --install
```

## 2. Copy each browser extension ID

Choose a browser where you want to use Apple Reminders. To use both browsers, note the extension ID in each and repeat installation for each browser.

If ANTI-WebClass is not already installed in that browser:

1. In Google Chrome, open `chrome://extensions`. In Dia, open `dia://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked** and choose the `Extension` folder inside this checkout.
4. Copy the extension ID shown on its card.

If you already use ANTI-WebClass from another installation, use that installation's ID instead. The helper registration must use the exact ID of the extension in the one browser you selected.

## 3. Build the helper app

From the repository root, run:

```sh
bash NativeReminders/scripts/package-release.sh
```

The script builds a Universal macOS app for Apple silicon and Intel and creates:

```text
NativeReminders/dist/WebClass-Reminders-v0.4.0.zip
NativeReminders/dist/build/Install WebClass Reminders.app
```

The installer asks which browser to target and for that browser's extension ID, so the build does not need either value. You can open the generated installer directly:

```sh
open "NativeReminders/dist/build/Install WebClass Reminders.app"
```

Select the same browser as in step 2, paste its extension ID, and select **Install**. The helper is copied to `~/Applications/WebClass Reminders Google Chrome.app` or `~/Applications/WebClass Reminders Dia.app`. Installing one leaves the other in place.

## 4. Connect Apple Reminders

In the selected browser, open ANTI-WebClass settings, enable external ToDo integration, select Apple Reminders, and choose **Connect to Apple Reminders**. Allow the browser's native messaging request and the macOS Reminders access prompt. Choose one writable Reminders list in the helper dialog. Choose a different list for the other browser. Then run the normal ToDo sync from a logged-in WebClass home page.

## Update or uninstall

Keep this checkout in the same location so the unpacked extension keeps its ID. Before updating, stop synchronization and close the extension settings page. Pull the latest source, rebuild, and open the generated installer again:

```sh
git pull
bash NativeReminders/scripts/package-release.sh
open "NativeReminders/dist/build/Install WebClass Reminders.app"
```

Select the same browser and enter its extension ID to replace the helper. To use the other browser, install again with its extension ID. To uninstall, select that browser in the installer and choose **Uninstall**. Existing Reminders and sync metadata are retained.

## Notes

- This guide is for building and running the app locally on your own Mac, not for distributing compiled binaries.
- The helper supports Google Chrome or Dia, macOS 14 or later, and Apple silicon and Intel Macs. Both browsers can connect when each has its own registration and selected Reminders list.
- For sync behavior, backups, and troubleshooting, see [README.md](README.md) and [the Japanese update guide](README.ja.md).
