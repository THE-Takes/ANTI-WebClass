import AppKit
import Darwin
import Foundation

@main
struct RemindersHost {
    @MainActor
    static func main() async {
        let arguments = CommandLine.arguments
        guard arguments.count >= 2,
              NativeHostRegistration.allows(origin: arguments[1]) else {
            FileHandle.standardError.write(Data("Unregistered extension origin. Install the host for this extension ID.\n".utf8))
            return
        }
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        do {
            let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                .appendingPathComponent("ANTI-WebClass/Reminders", isDirectory: true)
            try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
            let lock = open(support.appendingPathComponent("host.lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
            guard lock >= 0 else { throw HostError("Cannot open native host lock.") }
            defer { close(lock) }
            // A single process owns EventKit writes across Chrome profiles and extension versions.
            let locked = flock(lock, LOCK_EX | LOCK_NB) == 0
            defer { if locked { flock(lock, LOCK_UN) } }
            let store = try ReminderStore(origin: arguments[1], metadataDirectory: support)
            // Keep AppKit's main run loop alive while EventKit displays its permission prompt.
            // Blocking native-messaging input on the main actor prevents that prompt from appearing.
            Task.detached {
                await processMessages(store: store, locked: locked)
            }
            app.run()
        } catch {
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
        }
    }

    private static func processMessages(store: ReminderStore, locked: Bool) async {
        do {
            while let body = try NativeFraming.read(from: .standardInput) {
                var requestId = ""
                do {
                    let request = try NativeRequest(body)
                    requestId = request.requestId
                    guard locked else { throw HostError("別の同期が実行中です。少し待ってから再試行してください。") }
                    let result = try await store.handle(request)
                    try NativeFraming.write(["version": 1, "requestId": requestId, "success": true, "result": result], to: .standardOutput)
                } catch {
                    try NativeFraming.write(["version": 1, "requestId": requestId, "success": false, "error": error.localizedDescription], to: .standardOutput)
                }
            }
        } catch {
            FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
        }
        await MainActor.run {
            NSApplication.shared.terminate(nil)
        }
    }
}
