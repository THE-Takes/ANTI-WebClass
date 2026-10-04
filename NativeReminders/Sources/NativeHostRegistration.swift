import Foundation

enum NativeHostRegistration {
    static func install(for browser: BrowserTarget, executableURL: URL, extensionID: String,
                        homeDirectory: URL = FileManager.default.homeDirectoryForCurrentUser) throws {
        let manifest: [String: Any] = [
            "name": browser.nativeHostName,
            "description": "WebClass Apple Reminders bridge",
            "path": executableURL.path,
            "type": "stdio",
            "allowed_origins": ["chrome-extension://\(extensionID)/"]
        ]
        let data = try JSONSerialization.data(withJSONObject: manifest, options: [.prettyPrinted, .sortedKeys])
        let url = browser.manifestURL(hostName: browser.nativeHostName, homeDirectory: homeDirectory)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: url, options: .atomic)
        try removeManifests(at: browser.obsoleteManifestURLs(homeDirectory: homeDirectory))
    }

    static func uninstall(for browser: BrowserTarget,
                          homeDirectory: URL = FileManager.default.homeDirectoryForCurrentUser) throws {
        let current = browser.manifestURL(hostName: browser.nativeHostName, homeDirectory: homeDirectory)
        try removeManifests(at: [current] + browser.obsoleteManifestURLs(homeDirectory: homeDirectory))
    }

    private static func removeManifests(at urls: [URL]) throws {
        for url in urls where FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
    }

    static func allows(origin: String) -> Bool {
        guard origin.range(of: #"^chrome-extension://[a-p]{32}/$"#, options: .regularExpression) != nil,
              let registration = loadOwnManifest(),
              registration.manifest["name"] as? String == registration.browser.nativeHostName,
              Bundle.main.bundleIdentifier == registration.browser.bundleIdentifier,
              registration.manifest["path"] as? String == Bundle.main.executableURL?.path,
              let allowedOrigins = registration.manifest["allowed_origins"] as? [String] else {
            return false
        }

        return allowedOrigins == [origin]
    }

    private static func loadOwnManifest() -> (browser: BrowserTarget, manifest: [String: Any])? {
        for browser in BrowserTarget.allCases where Bundle.main.bundleIdentifier == browser.bundleIdentifier {
            let url = browser.manifestURL(hostName: browser.nativeHostName)
            guard let data = try? Data(contentsOf: url),
                  let manifest = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return nil
            }
            return (browser, manifest)
        }
        return nil
    }
}
