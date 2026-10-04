import Foundation

@main
struct RegistrationTests {
    static func main() throws {
        let home = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: home) }

        let chrome = BrowserTarget.googleChrome
        let dia = BrowserTarget.dia
        let chromeURL = chrome.manifestURL(hostName: chrome.nativeHostName, homeDirectory: home)
        let diaURL = dia.manifestURL(hostName: dia.nativeHostName, homeDirectory: home)
        assert(chromeURL.deletingLastPathComponent() == diaURL.deletingLastPathComponent())
        assert(diaURL.path.contains("Google/Chrome/NativeMessagingHosts/"))
        assert(chromeURL != diaURL)

        for first in BrowserTarget.allCases {
            let second: BrowserTarget = first == chrome ? dia : chrome
            for browser in [first, second] {
                for url in browser.obsoleteManifestURLs(homeDirectory: home) {
                    try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                    try Data("legacy".utf8).write(to: url)
                }
                try NativeHostRegistration.install(for: browser,
                    executableURL: home.appendingPathComponent(browser.appName + "/Contents/MacOS/WebClassReminders"),
                    extensionID: browser == chrome ? String(repeating: "a", count: 32) : String(repeating: "b", count: 32),
                    homeDirectory: home)
                assert(browser.obsoleteManifestURLs(homeDirectory: home).allSatisfy { !FileManager.default.fileExists(atPath: $0.path) })
            }
            let firstURL = first.manifestURL(hostName: first.nativeHostName, homeDirectory: home)
            let original = try Data(contentsOf: firstURL)
            try NativeHostRegistration.install(for: second, executableURL: home.appendingPathComponent(second.appName),
                extensionID: String(repeating: "c", count: 32), homeDirectory: home)
            let afterReinstall = try Data(contentsOf: firstURL)
            assert(afterReinstall == original)

            let secondURL = second.manifestURL(hostName: second.nativeHostName, homeDirectory: home)
            let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: secondURL)) as! [String: Any]
            assert(manifest["name"] as? String == second.nativeHostName)
            assert(manifest["allowed_origins"] as? [String] == ["chrome-extension://" + String(repeating: "c", count: 32) + "/"])
            try NativeHostRegistration.uninstall(for: second, homeDirectory: home)
            assert(!FileManager.default.fileExists(atPath: secondURL.path))
            let afterUninstall = try Data(contentsOf: firstURL)
            assert(afterUninstall == original)
            try NativeHostRegistration.uninstall(for: first, homeDirectory: home)
        }
        print("Native host registration, legacy migration and browser coexistence checks passed.")
    }
}
