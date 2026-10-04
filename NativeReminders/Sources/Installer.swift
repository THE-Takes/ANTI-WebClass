import AppKit
import Foundation

@main
@MainActor
final class InstallerDelegate: NSObject, NSApplicationDelegate {
    private let nativeHostExecutableName = "WebClassReminders"
    private let browserPicker = NSPopUpButton(frame: .zero, pullsDown: false)
    private let instructionsLabel = NSTextField(wrappingLabelWithString: "インストールするブラウザーを選んでください。Chrome用とDia用の補助アプリは同じMacに共存できます。")
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
        InstallerMenu.configure()
        buildWindow()
        installerWindow.center()
        installerWindow.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
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

        let browserLabel = NSTextField(labelWithString: "対象ブラウザー")
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
        extensionIDField.placeholderString = "例: abcdefghijklmnopabcdefghijklmnop"
        extensionIDField.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
        extensionIDField.frame = NSRect(x: 28, y: 199, width: 500, height: 30)
        content.addSubview(extensionIDField)

        let privacyNote = NSTextField(wrappingLabelWithString: "選んだブラウザーの登録だけを更新します。拡張機能IDはこのMacに保存され、外部サーバーには送信しません。接続時に同期するリマインダーリストを選択します。")
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
        statusLabel.stringValue = ""
        guard let browser = selectedBrowser else {
            instructionsLabel.stringValue = "インストールするブラウザーを選んでください。Chrome用とDia用の補助アプリは同じMacに共存できます。"
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
            showStatus("Google ChromeまたはDiaを選択してください。", isError: true)
            return
        }
        let extensionID = extensionIDField.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard extensionID.range(of: #"^[a-p]{32}$"#, options: .regularExpression) != nil else {
            showStatus("拡張機能IDは a〜p の英小文字32文字で入力してください。", isError: true)
            return
        }

        do {
            try installNativeHost(for: browser, extensionID: extensionID)
            InstallerCompletion.present(for: browser)
        } catch {
            showStatus("インストールできませんでした: \(error.localizedDescription)", isError: true)
        }
    }

    @objc private func uninstall() {
        let alert = NSAlert()
        guard let browser = selectedBrowser else {
            showStatus("削除するブラウザーを選択してください。", isError: true)
            return
        }
        alert.messageText = "\(browser.displayName)用の補助アプリをアンインストールしますか？"
        alert.informativeText = "同期を停止してから実行してください。他方のブラウザー用アプリと登録、Appleリマインダーの項目と同期データは残ります。"
        alert.addButton(withTitle: "アンインストール")
        alert.addButton(withTitle: "キャンセル")
        guard alert.runModal() == .alertFirstButtonReturn else { return }

        do {
            try uninstallNativeHost(for: browser)
            showStatus("アンインストールしました。既存のリマインダーと同期データは保持されています。", isError: false)
        } catch {
            showStatus("アンインストールできませんでした: \(error.localizedDescription)", isError: true)
        }
    }

    private func installNativeHost(for browser: BrowserTarget, extensionID: String) throws {
        guard let resourcesURL = Bundle.main.resourceURL else {
            throw InstallerError("インストーラーのリソースが見つかりません。")
        }
        let hostTemplate = resourcesURL.appendingPathComponent(browser.appName, isDirectory: true)
        let sourceExecutable = hostTemplate.appendingPathComponent("Contents/MacOS/\(nativeHostExecutableName)")
        guard FileManager.default.isExecutableFile(atPath: sourceExecutable.path) else {
            throw InstallerError("補助アプリが壊れているか、インストーラーに含まれていません。")
        }

        let fileManager = FileManager.default
        let applicationsDirectory = fileManager.homeDirectoryForCurrentUser.appendingPathComponent("Applications", isDirectory: true)
        try fileManager.createDirectory(at: applicationsDirectory, withIntermediateDirectories: true)

        let installedApp = applicationsDirectory.appendingPathComponent(browser.appName, isDirectory: true)
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
        let hostExecutable = installedApp.appendingPathComponent("Contents/MacOS/\(nativeHostExecutableName)")
        try NativeHostRegistration.install(for: browser, executableURL: hostExecutable, extensionID: extensionID)
        if hadPreviousApp { try fileManager.removeItem(at: previousApp) }
    }

    private func uninstallNativeHost(for browser: BrowserTarget) throws {
        let fileManager = FileManager.default
        let installedApp = fileManager.homeDirectoryForCurrentUser
            .appendingPathComponent("Applications", isDirectory: true)
            .appendingPathComponent(browser.appName, isDirectory: true)
        try NativeHostRegistration.uninstall(for: browser)
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
