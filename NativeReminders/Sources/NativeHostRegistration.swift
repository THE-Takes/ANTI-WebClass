import Foundation

enum NativeHostRegistration {
    static func allows(origin: String) -> Bool {
        guard origin.range(of: #"^chrome-extension://[a-p]{32}/$"#, options: .regularExpression) != nil,
              let registration = loadSingleBrowserManifest(),
              registration.manifest["name"] as? String == registration.browser.nativeHostName,
              registration.manifest["path"] as? String == Bundle.main.executableURL?.path,
              let allowedOrigins = registration.manifest["allowed_origins"] as? [String] else {
            return false
        }

        return allowedOrigins == [origin]
    }

    private static func loadSingleBrowserManifest() -> (browser: BrowserTarget, manifest: [String: Any])? {
        let fileManager = FileManager.default
        let registrations = BrowserTarget.allCases.flatMap { browser in
            BrowserTarget.managedNativeHostNames.map { hostName in
                (browser, hostName, browser.manifestURL(hostName: hostName))
            }
        }
        let installedManifests = registrations.filter { fileManager.fileExists(atPath: $0.2.path) }
        guard installedManifests.count == 1,
              let (browser, hostName, manifestURL) = installedManifests.first,
              hostName == browser.nativeHostName else {
            return nil
        }

        guard let data = try? Data(contentsOf: manifestURL),
              let manifest = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }

        return (browser, manifest)
    }
}
