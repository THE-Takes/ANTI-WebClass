import Foundation

enum BrowserTarget: Int, CaseIterable {
    case googleChrome = 1
    case dia = 2

    var displayName: String {
        switch self {
        case .googleChrome: return "Google Chrome"
        case .dia: return "Dia"
        }
    }

    var extensionsPageURL: String {
        switch self {
        case .googleChrome: return "chrome://extensions"
        case .dia: return "dia://extensions"
        }
    }

    var nativeHostName: String {
        switch self {
        case .googleChrome: return "jp.anti_webclass.reminders.chrome"
        case .dia: return "jp.anti_webclass.reminders.dia"
        }
    }

    var appName: String {
        "WebClass Reminders \(displayName).app"
    }

    var bundleIdentifier: String {
        switch self {
        case .googleChrome: return "jp.anti-webclass.reminders.chrome"
        case .dia: return "jp.anti-webclass.reminders.dia"
        }
    }

    func manifestURL(hostName: String, homeDirectory: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        // Dia reads Chrome's native-host directory; distinct host names keep registrations separate.
        homeDirectory
            .appendingPathComponent("Library/Application Support/Google/Chrome/NativeMessagingHosts", isDirectory: true)
            .appendingPathComponent("\(hostName).json")
    }

    func obsoleteManifestURLs(homeDirectory: URL = FileManager.default.homeDirectoryForCurrentUser) -> [URL] {
        switch self {
        case .googleChrome:
            return [manifestURL(hostName: "jp.anti_webclass.reminders", homeDirectory: homeDirectory)]
        case .dia:
            let legacyDirectory = homeDirectory.appendingPathComponent("Library/Application Support/Dia/NativeMessagingHosts", isDirectory: true)
            return [nativeHostName, "jp.anti_webclass.reminders"].map {
                legacyDirectory.appendingPathComponent("\($0).json")
            }
        }
    }
}
