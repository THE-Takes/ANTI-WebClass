import Foundation

enum BrowserTarget: Int, CaseIterable {
    case googleChrome = 1
    case dia = 2

    static var managedNativeHostNames: [String] {
        [
            "jp.anti_webclass.reminders",
            "jp.anti_webclass.reminders.chrome",
            "jp.anti_webclass.reminders.dia"
        ]
    }

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

    private var nativeMessagingDirectory: String {
        switch self {
        case .googleChrome: return "Google/Chrome/NativeMessagingHosts"
        case .dia: return "Dia/NativeMessagingHosts"
        }
    }

    func manifestURL(hostName: String, homeDirectory: URL = FileManager.default.homeDirectoryForCurrentUser) -> URL {
        homeDirectory
            .appendingPathComponent("Library/Application Support/\(nativeMessagingDirectory)", isDirectory: true)
            .appendingPathComponent("\(hostName).json")
    }
}
