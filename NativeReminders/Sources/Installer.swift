import AppKit
import Foundation

@main
final class InstallerDelegate: NSObject, NSApplicationDelegate {
    private let nativeHostBundleName = "WebClass Reminders.app"
    private let nativeHostExecutableName = "WebClassReminders"
    private let browserPicker = NSPopUpButton(frame: .zero, pullsDown: false)
    private let instructionsLabel = NSTextField(wrappingLabelWithString: "Google ChromeまたはDiaの一方だけに登録します。対象ブラウザーを選んでください。")
    private let extensionIDLabel = NSTextField(labelWithString: "拡張機能 ID")
    private let installerWindow = NSWindow(
        contentRect: NSRect(x: 0, y: 0, width: 560, height: 440),
        styleMask: [.titled, .closable],
        backing: .buffered,
        defer: false
    )
    private let extensionIDField = NSTextField(string: "")
    private let statusLabel = NSTextField(labelWithString: "")

    static func main() {
        let application = NSApplication.shared
        let delegate = InstallerDelegate()
        application.delegate = delegate
        application.run()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildWindow()
        installerWindow.center()
        installerWindow.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func buildWindow() {
        installerWindow.title = "WebClass Reminders"
        installerWindow.isReleasedWhenClosed = false

        let content = installerWindow.contentView!
        let heading = NSTextField(labelWithString: "WebClass Reminders をインストール")
        heading.font = .systemFont(ofSize: 22, weight: .semibold)
        heading.frame = NSRect(x: 28, y: 390, width: 500, height: 30)
        content.addSubview(heading)

        instructionsLabel.frame = NSRect(x: 28, y: 331, width: 500, height: 48)
        content.addSubview(instructionsLabel)

        let browserLabel = NSTextField(labelWithString: "対象ブラウザー（1つ選択）")
        browserLabel.font = .systemFont(ofSize: 13, weight: .medium)
        browserLabel.frame = NSRect(x: 28, y: 300, width: 500, height: 20)
        content.addSubview(browserLabel)

        browserPicker.addItem(withTitle: "ブラウザーを選択…")
        browserPicker.item(at: 0)?.tag = 0
        browserPicker.addItem(withTitle: BrowserTarget.googleChrome.displayName)
        browserPicker.item(at: 1)?.tag = BrowserTarget.googleChrome.rawValue
        browserPicker.addItem(withTitle: BrowserTarget.dia.displayName)
        browserPicker.item(at: 2)?.tag = BrowserTarget.dia.rawValue
        browserPicker.selectItem(at: 0)
        browserPicker.target = self
        browserPicker.action = #selector(browserTargetChanged)
        browserPicker.frame = NSRect(x: 28, y: 266, width: 500, height: 28)
        content.addSubview(browserPicker)

        extensionIDLabel.font = .systemFont(ofSize: 13, weight: .medium)
        extensionIDLabel.frame = NSRect(x: 28, y: 235, width: 500, height: 20)
        content.addSubview(extensionIDLabel)
        extensionIDField.placeholderString = "例: abcdefghijklmnopqrstuvwxyzabcdef"
        extensionIDField.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
        extensionIDField.frame = NSRect(x: 28, y: 199, width: 500, height: 30)
        content.addSubview(extensionIDField)

        let privacyNote = NSTextField(wrappingLabelWithString: "選択したブラウザー1つだけに登録します。切り替え時は前のブラウザーの登録を解除します。IDはこのMacに保存され、WebClassや外部サーバーには送信しません。同期を止めてからインストールしてください。")
        privacyNote.frame = NSRect(x: 28, y: 128, width: 500, height: 50)
        content.addSubview(privacyNote)

        let installButton = NSButton(title: "インストール", target: self, action: #selector(install))
        installButton.keyEquivalent = "\r"
        installButton.bezelStyle = .rounded
        installButton.frame = NSRect(x: 386, y: 72, width: 142, height: 32)
        content.addSubview(installButton)

        let uninstallButton = NSButton(title: "アンインストール", target: self, action: #selector(uninstall))
        uninstallButton.bezelStyle = .rounded
        uninstallButton.frame = NSRect(x: 28, y: 72, width: 142, height: 32)
        content.addSubview(uninstallButton)

        statusLabel.stringValue = "既存のリマインダーと同期データはインストール時に変更されません。"
        statusLabel.lineBreakMode = .byWordWrapping
        statusLabel.frame = NSRect(x: 28, y: 18, width: 500, height: 44)
        content.addSubview(statusLabel)
    }

    @objc private func browserTargetChanged() {
        extensionIDField.stringValue = ""
        statusLabel.stringValue = ""
        guard let browser = selectedBrowser else {
            instructionsLabel.stringValue = "Google ChromeまたはDiaの一方だけに登録します。対象ブラウザーを選んでください。"
            extensionIDLabel.stringValue = "拡張機能 ID"
            return
        }
        instructionsLabel.stringValue = "\(browser.displayName)で \(browser.extensionsPageURL) を開き、ANTI-WebClassの拡張機能IDをコピーしてください。IDは32文字の英小文字です。"
        extensionIDLabel.stringValue = "\(browser.displayName)の拡張機能 ID"
    }

    private var selectedBrowser: BrowserTarget? {
        guard let selectedItem = browserPicker.selectedItem else { return nil }
        return BrowserTarget(rawValue: selectedItem.tag)
    }

    @objc private func install() {
        guard let browser = selectedBrowser else {
            showStatus("Google ChromeまたはDiaのどちらか1つを選択してください。", isError: true)
            return
        }
        let extensionID = extensionIDField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard extensionID.range(of: #"^[a-p]{32}$"#, options: .regularExpression) != nil else {
            showStatus("拡張機能IDは a〜p の英小文字32文字で入力してください。", isError: true)
            return
        }

        do {
            try installNativeHost(for: browser, extensionID: extensionID)
            showStatus("\(browser.displayName)用にインストールしました。同じブラウザーでANTI-WebClassの設定を開いて接続してください。", isError: false)
        } catch {
            showStatus("インストールできませんでした: \(error.localizedDescription)", isError: true)
        }
    }

    @objc private func uninstall() {
        let alert = NSAlert()
        alert.messageText = "WebClass Reminders をアンインストールしますか？"
        alert.informativeText = "同期を停止してから実行してください。補助アプリとChrome・Diaにあるこの連携の登録を削除します。Appleリマインダーの項目と同期データは残ります。"
        alert.addButton(withTitle: "アンインストール")
        alert.addButton(withTitle: "キャンセル")
        guard alert.runModal() == .alertFirstButtonReturn else { return }

        do {
            try uninstallNativeHost()
            showStatus("アンインストールしました。既存のリマインダーと同期データは保持されています。", isError: false)
        } catch {
            showStatus("アンインストールできませんでした: \(error.localizedDescription)", isError: true)
        }
    }

    private func installNativeHost(for browser: BrowserTarget, extensionID: String) throws {
        guard let resourcesURL = Bundle.main.resourceURL else {
            throw InstallerError("インストーラーのリソースが見つかりません。")
        }
        let hostTemplate = resourcesURL.appendingPathComponent(nativeHostBundleName, isDirectory: true)
        let sourceExecutable = hostTemplate.appendingPathComponent("Contents/MacOS/\(nativeHostExecutableName)")
        guard FileManager.default.isExecutableFile(atPath: sourceExecutable.path) else {
            throw InstallerError("補助アプリが壊れているか、インストーラーに含まれていません。")
        }

        let fileManager = FileManager.default
        let applicationsDirectory = fileManager.homeDirectoryForCurrentUser.appendingPathComponent("Applications", isDirectory: true)
        try fileManager.createDirectory(at: applicationsDirectory, withIntermediateDirectories: true)

        let installedApp = applicationsDirectory.appendingPathComponent(nativeHostBundleName, isDirectory: true)
        let stagedApp = applicationsDirectory.appendingPathComponent(".WebClass Reminders-\(UUID().uuidString).app", isDirectory: true)
        let previousApp = applicationsDirectory.appendingPathComponent(".WebClass Reminders-previous-\(UUID().uuidString).app", isDirectory: true)
        defer { try? fileManager.removeItem(at: stagedApp) }
        try fileManager.copyItem(at: hostTemplate, to: stagedApp)
        let hadPreviousApp = fileManager.fileExists(atPath: installedApp.path)
        if hadPreviousApp {
            try fileManager.moveItem(at: installedApp, to: previousApp)
        }
        do {
            try fileManager.moveItem(at: stagedApp, to: installedApp)
        } catch {
            if hadPreviousApp {
                try? fileManager.moveItem(at: previousApp, to: installedApp)
            }
            throw error
        }
        if hadPreviousApp {
            try fileManager.removeItem(at: previousApp)
        }

        let hostExecutable = installedApp.appendingPathComponent("Contents/MacOS/\(nativeHostExecutableName)")
        let manifest: [String: Any] = [
            "name": browser.nativeHostName,
            "description": "WebClass Apple Reminders bridge",
            "path": hostExecutable.path,
            "type": "stdio",
            "allowed_origins": ["chrome-extension://\(extensionID)/"]
        ]
        let manifestData = try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
        let manifestURL = browser.manifestURL(hostName: browser.nativeHostName)
        for registeredBrowser in BrowserTarget.allCases {
            for hostName in BrowserTarget.managedNativeHostNames {
                let registeredManifestURL = registeredBrowser.manifestURL(hostName: hostName)
                if fileManager.fileExists(atPath: registeredManifestURL.path) {
                    try fileManager.removeItem(at: registeredManifestURL)
                }
            }
        }
        try fileManager.createDirectory(at: manifestURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try manifestData.write(to: manifestURL, options: .atomic)
    }

    private func uninstallNativeHost() throws {
        let fileManager = FileManager.default
        let installedApp = fileManager.homeDirectoryForCurrentUser
            .appendingPathComponent("Applications", isDirectory: true)
            .appendingPathComponent(nativeHostBundleName, isDirectory: true)
        for browser in BrowserTarget.allCases {
            for hostName in BrowserTarget.managedNativeHostNames {
                let manifestURL = browser.manifestURL(hostName: hostName)
                if fileManager.fileExists(atPath: manifestURL.path) {
                    try fileManager.removeItem(at: manifestURL)
                }
            }
        }
        if fileManager.fileExists(atPath: installedApp.path) {
            try fileManager.removeItem(at: installedApp)
        }
    }

    private func showStatus(_ message: String, isError: Bool) {
        statusLabel.stringValue = message
        statusLabel.textColor = isError ? .systemRed : .secondaryLabelColor
    }
}

private struct InstallerError: LocalizedError {
    let message: String

    init(_ message: String) {
        self.message = message
    }

    var errorDescription: String? { message }
}
