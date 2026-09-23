import AppKit
import Foundation

@main
final class InstallerDelegate: NSObject, NSApplicationDelegate {
    private let nativeHostName = "jp.anti_webclass.reminders"
    private let nativeHostBundleName = "WebClass Reminders.app"
    private let nativeHostExecutableName = "WebClassReminders"
    private let installerWindow = NSWindow(
        contentRect: NSRect(x: 0, y: 0, width: 560, height: 410),
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
        heading.frame = NSRect(x: 28, y: 350, width: 500, height: 30)
        content.addSubview(heading)

        let instructions = NSTextField(wrappingLabelWithString: "macOS 14以降のGoogle Chromeで、chrome://extensions を開き、右上の「デベロッパーモード」をオンにしてANTI-WebClassの拡張機能IDをコピーしてください。IDは32文字の英小文字です。")
        instructions.frame = NSRect(x: 28, y: 282, width: 500, height: 56)
        content.addSubview(instructions)

        let idLabel = NSTextField(labelWithString: "Chrome 拡張機能 ID")
        idLabel.font = .systemFont(ofSize: 13, weight: .medium)
        idLabel.frame = NSRect(x: 28, y: 248, width: 500, height: 20)
        content.addSubview(idLabel)

        extensionIDField.placeholderString = "例: abcdefghijklmnopqrstuvwxyzabcdef"
        extensionIDField.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
        extensionIDField.frame = NSRect(x: 28, y: 210, width: 500, height: 30)
        content.addSubview(extensionIDField)

        let privacyNote = NSTextField(wrappingLabelWithString: "IDはこのMac上のChromeの接続設定にだけ保存されます。WebClassや外部サーバーには送信しません。同期中の場合は、同期を止めてからインストールしてください。")
        privacyNote.frame = NSRect(x: 28, y: 150, width: 500, height: 48)
        content.addSubview(privacyNote)

        let installButton = NSButton(title: "インストール", target: self, action: #selector(install))
        installButton.keyEquivalent = "\r"
        installButton.bezelStyle = .rounded
        installButton.frame = NSRect(x: 386, y: 92, width: 142, height: 32)
        content.addSubview(installButton)

        let uninstallButton = NSButton(title: "アンインストール", target: self, action: #selector(uninstall))
        uninstallButton.bezelStyle = .rounded
        uninstallButton.frame = NSRect(x: 28, y: 92, width: 142, height: 32)
        content.addSubview(uninstallButton)

        statusLabel.stringValue = "既存のリマインダーと同期データはインストール時に変更されません。"
        statusLabel.lineBreakMode = .byWordWrapping
        statusLabel.frame = NSRect(x: 28, y: 28, width: 500, height: 48)
        content.addSubview(statusLabel)
    }

    @objc private func install() {
        let extensionID = extensionIDField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard extensionID.range(of: #"^[a-p]{32}$"#, options: .regularExpression) != nil else {
            showStatus("拡張機能IDは a〜p の英小文字32文字で入力してください。", isError: true)
            return
        }

        do {
            try installNativeHost(for: extensionID)
            showStatus("インストールしました。Chromeを開き、ANTI-WebClassの設定でAppleリマインダーに接続してください。", isError: false)
        } catch {
            showStatus("インストールできませんでした: \(error.localizedDescription)", isError: true)
        }
    }

    @objc private func uninstall() {
        let alert = NSAlert()
        alert.messageText = "WebClass Reminders をアンインストールしますか？"
        alert.informativeText = "同期を停止してから実行してください。補助アプリとChromeの接続設定を削除します。Appleリマインダーの項目と同期データは残ります。"
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

    private func installNativeHost(for extensionID: String) throws {
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
            "name": nativeHostName,
            "description": "WebClass Apple Reminders bridge",
            "path": hostExecutable.path,
            "type": "stdio",
            "allowed_origins": ["chrome-extension://\(extensionID)/"]
        ]
        let manifestData = try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
        let manifestURL = nativeHostManifestURL
        try fileManager.createDirectory(at: manifestURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try manifestData.write(to: manifestURL, options: .atomic)
    }

    private func uninstallNativeHost() throws {
        let fileManager = FileManager.default
        let installedApp = fileManager.homeDirectoryForCurrentUser
            .appendingPathComponent("Applications", isDirectory: true)
            .appendingPathComponent(nativeHostBundleName, isDirectory: true)
        let manifestURL = nativeHostManifestURL
        if fileManager.fileExists(atPath: manifestURL.path) {
            try fileManager.removeItem(at: manifestURL)
        }
        if fileManager.fileExists(atPath: installedApp.path) {
            try fileManager.removeItem(at: installedApp)
        }
    }

    private var nativeHostManifestURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Google/Chrome/NativeMessagingHosts", isDirectory: true)
            .appendingPathComponent("\(nativeHostName).json")
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
