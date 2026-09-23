import Foundation

@main
struct ProtocolTests {
    static func main() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let path = folder.appendingPathComponent("messages")
        FileManager.default.createFile(atPath: path.path, contents: nil)
        let output = try FileHandle(forWritingTo: path)
        try NativeFraming.write(["version": 1, "requestId": "request-1", "command": "status"], to: output)
        try NativeFraming.write(["version": 1, "requestId": "request-2", "command": "snapshot", "offset": 0], to: output)
        try output.close()
        let input = try FileHandle(forReadingFrom: path)
        let first = try NativeRequest(NativeFraming.read(from: input)!)
        let second = try NativeRequest(NativeFraming.read(from: input)!)
        let eof = try NativeFraming.read(from: input)
        assert(first.requestId == "request-1")
        assert(second.command == "snapshot")
        assert(eof == nil)
        try input.close()
        func rejects(_ action: () throws -> Void) {
            do { try action(); fatalError("Expected rejection") } catch { }
        }
        rejects { _ = try NativeRequest(Data(#"{"version":2,"requestId":"1","command":"status"}"#.utf8)) }
        rejects { _ = try NativeRequest(Data(#"{"version":1,"requestId":"1","command":"shell"}"#.utf8)) }
        assert(syncIdentity(in: "Course: Test\nWC_SYNC_ID:wc_v1_0123456789abcdef") == "wc_v1_0123456789abcdef")
        assert(syncIdentity(in: "WC_SYNC_ID:malformed") == nil)
        try validateTask(["title": "課題", "content": "WC_SYNC_ID:wc_v1_0123456789abcdef", "status": 2, "dueDate": "2026-09-18T23:59:00+0900"], creating: true)
        rejects { try validateTask(["title": "課題", "content": "Personal reminder"], creating: true) }
        rejects { try validateTask(["status": 1], creating: false) }
        rejects { try validateTask(["dueDate": "bad date"], creating: false) }
        rejects { try validateTask(["script": "open something"], creating: false) }
        let date = ReminderDates.parse("2026-09-18T23:59:00+0900")!
        assert(ReminderDates.format(date) == "2026-09-18T23:59:00+0900")
        for bytes in [Data([1, 0]), Data([255, 255, 255, 255]), Data([5, 0, 0, 0, 1])] {
            try bytes.write(to: path)
            let malformed = try FileHandle(forReadingFrom: path)
            rejects { _ = try NativeFraming.read(from: malformed) }
            try malformed.close()
        }
        print("Native protocol, validation and date tests passed (no EventKit access).")
    }
}
