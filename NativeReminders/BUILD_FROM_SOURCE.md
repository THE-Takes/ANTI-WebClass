# Build WebClass Reminders from source

[日本語版](BUILD_FROM_SOURCE.ja.md)

The Apple Reminders helper is built on each user's Mac. This repository does not provide a prebuilt helper app. The Chrome extension is installed separately.

## Requirements

- A Mac running macOS 14 or later.
- Google Chrome.
- Git and the Xcode Command Line Tools. A full Xcode installation is not required.
- No Apple Developer Program membership, Developer ID certificate, or Apple notarization credentials are needed for a personal build on the same Mac.

The build script applies an ad-hoc code signature. This guide builds and installs the helper on the same Mac; do not distribute the generated app or ZIP.

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

## 2. Install the Chrome extension and copy its ID

If ANTI-WebClass is not already installed in Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked** and choose the `Extension` folder inside this checkout.
4. Copy the extension ID shown on its card.

If you already use ANTI-WebClass from another installation, use that installation's ID instead. The helper registration must use the exact ID of the extension that will connect to it.

## 3. Build the helper app

From the repository root, run:

```sh
bash NativeReminders/scripts/package-release.sh
```

The script builds a Universal macOS app for Apple silicon and Intel and creates:

```text
NativeReminders/dist/WebClass-Reminders-v0.3.0.zip
NativeReminders/dist/build/Install WebClass Reminders.app
```

The installer asks for the Chrome extension ID, so the build does not need an ID argument. You can open the generated installer directly:

```sh
open "NativeReminders/dist/build/Install WebClass Reminders.app"
```

Paste the ID copied in step 2 and select **Install**. The helper is copied to `~/Applications/WebClass Reminders.app` and registered for that Chrome extension.

## 4. Connect Apple Reminders

In Chrome, open ANTI-WebClass settings, enable external ToDo integration, select Apple Reminders, and choose **Connect to Apple Reminders**. Allow the Chrome native messaging request and the macOS Reminders access prompt. Then run the normal ToDo sync from a logged-in WebClass home page.

## Update or uninstall

Keep this checkout in the same location so the unpacked Chrome extension keeps its ID. Before updating, stop synchronization and close the extension settings page. Pull the latest source, rebuild, and open the generated installer again:

```sh
git pull
bash NativeReminders/scripts/package-release.sh
open "NativeReminders/dist/build/Install WebClass Reminders.app"
```

Enter the same Chrome extension ID to replace the helper. To uninstall, open the installer app and select **Uninstall**. Existing Reminders and sync metadata are retained.

## Notes

- This guide is for building and running the app locally on your own Mac, not for distributing compiled binaries.
- The helper supports Google Chrome, macOS 14 or later, and Apple silicon and Intel Macs.
- For sync behavior, backups, and troubleshooting, see [README.md](README.md) and [the Japanese update guide](README.ja.md).
