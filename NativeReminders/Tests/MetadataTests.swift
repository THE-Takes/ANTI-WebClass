import Foundation

@main
struct MetadataTests {
    static func main() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let file = folder.appendingPathComponent("metadata.json")
        let identity = "wc_v1_0123456789abcdef"
        let original = """
        Course: アルゴリズム論（情報・総理・計算）[田中]
        Original Task: 提出課題
        Original Deadline: 2026/09/20 23:59
        Current Deadline: 2026/09/21 23:59
        WC_DEADLINE_TEXT:2026/09/21 23:59
        Task URL: https://example.com/task
        WC_SYNC_ID:\(identity)
        WC_SOURCE_URL:https://example.com/task
        """
        let store = try ReminderMetadataStore(file: file)
        let record = ReminderNoteFormat.record(content: original)
        assert(record.course == "アルゴリズム論")
        try store.save(record, listID: "list-1", identity: identity)
        let compact = ReminderNoteFormat.compact(course: record.course, identity: identity)
        assert(compact == "アルゴリズム論\nWC_SYNC_ID:" + identity)
        assert(!compact.contains("Deadline") && !compact.contains("https://"))
        assert(compact.components(separatedBy: .newlines).count == 2)
        assert(syncIdentity(in: compact) == identity)
        assert(ReminderNoteFormat.isLegacy(original))
        assert(!ReminderNoteFormat.isLegacy(ReminderNoteFormat.compact(course: "Course: Math", identity: identity)))
        let reloaded = try ReminderMetadataStore(file: file)
        assert(ReminderNoteFormat.restoredContent(notes: compact, record: reloaded.get(listID: "list-1", identity: identity), sourceURL: nil) == original)
        assert(reloaded.get(listID: "different-list", identity: identity) == nil)
        assert(ReminderNoteFormat.restoredContent(notes: original, record: nil, sourceURL: nil) == original)
        // A missing local store still returns the cloud-synced identity and the standard URL.
        let recovered = ReminderNoteFormat.restoredContent(notes: compact, record: nil, sourceURL: "https://example.com/task")
        assert(syncIdentity(in: recovered) == identity)
        assert(recovered.contains("WC_SOURCE_URL:https://example.com/task"))
        assert(!recovered.contains("Original Task:"))
        let preferred = ReminderNoteFormat.record(content: original, displayCourse: "アルゴリズム")
        assert(preferred.course == "アルゴリズム")
        assert(ReminderNoteFormat.shortCourse("数学\nWC_SYNC_ID:fake") == "数学")
        assert(ReminderNoteFormat.shortCourse(String(repeating: "あ", count: 100)).count == 40)
        func rejects(_ action: () throws -> Void) {
            do { try action(); fatalError("Expected failure") } catch { }
        }
        // Invalid identities must not damage the already-persisted metadata.
        rejects { try store.save(record, listID: "list-1", identity: "wc_v1_1111111111111111") }
        let afterRejected = try ReminderMetadataStore(file: file)
        assert(afterRejected.get(listID: "list-1", identity: identity)?.content == original)
        let missingParent = try ReminderMetadataStore(file: folder.appendingPathComponent("missing/metadata.json"))
        rejects { try missingParent.save(record, listID: "list-1", identity: identity) }
        assert(missingParent.get(listID: "list-1", identity: identity) == nil)
        // A failed atomic save leaves both memory and the old on-disk metadata untouched.
        try FileManager.default.moveItem(at: file, to: folder.appendingPathComponent("backup.json"))
        try FileManager.default.createDirectory(at: file, withIntermediateDirectories: false)
        rejects { try store.save(preferred, listID: "list-1", identity: identity) }
        assert(store.get(listID: "list-1", identity: identity)?.course == record.course)
        let backup = try ReminderMetadataStore(file: folder.appendingPathComponent("backup.json"))
        assert(backup.get(listID: "list-1", identity: identity)?.content == original)
        let corrupt = folder.appendingPathComponent("corrupt.json")
        try Data("invalid json".utf8).write(to: corrupt)
        rejects { _ = try ReminderMetadataStore(file: corrupt) }
        try Data(#"{"version":99,"records":{}}"#.utf8).write(to: corrupt)
        rejects { _ = try ReminderMetadataStore(file: corrupt) }
        print("Reminder metadata migration, compact notes, durable storage and recovery tests passed (no EventKit access).")
    }
}
