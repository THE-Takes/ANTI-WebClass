import AppKit

@MainActor
enum InstallerCompletion {
    static func present(for browser: BrowserTarget) {
        let alert = NSAlert()
        alert.alertStyle = .informational
        alert.messageText = "完了しました。"
        alert.informativeText = "\(browser.displayName)用の補助アプリをインストールしました。同じブラウザーでANTI-WebClassの設定を開き、Appleリマインダーに接続してください。"
        alert.addButton(withTitle: "OK")
        alert.runModal()
        NSApp.terminate(nil)
    }
}
