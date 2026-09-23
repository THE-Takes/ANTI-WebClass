import Foundation

enum NativeHostRegistration {
    private static let manifestName = "jp.anti_webclass.reminders"

    static func allows(origin: String) -> Bool {
        guard origin.range(of: #"^chrome-extension://[a-p]{32}/$"#, options: .regularExpression) != nil,
              let manifest = loadManifest(),
              manifest["name"] as? String == manifestName,
              manifest["path"] as? String == Bundle.main.executableURL?.path,
              let allowedOrigins = manifest["allowed_origins"] as? [String] else {
            return false
        }

        return allowedOrigins.contains(origin)
    }

    private static func loadManifest() -> [String: Any]? {
        let manifestURL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Google/Chrome/NativeMessagingHosts", isDirectory: true)
            .appendingPathComponent("\(manifestName).json")

        guard let data = try? Data(contentsOf: manifestURL),
              let manifest = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }

        return manifest
    }
}
