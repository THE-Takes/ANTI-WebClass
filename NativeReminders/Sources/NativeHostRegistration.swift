import Foundation

enum NativeHostRegistration {
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
