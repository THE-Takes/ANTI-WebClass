import EventKit
import Foundation

@MainActor
final class ReminderStore {
    private let store = EKEventStore()
    private let defaults: UserDefaults
    private var snapshot: [[String: Any]]?
    private let listKey: String
    private let metadata: ReminderMetadataStore

    init(origin: String, metadataDirectory: URL) throws {
        guard let extensionID = URL(string: origin)?.host else { throw HostError("Invalid extension origin.") }
        metadata = try ReminderMetadataStore(file: metadataDirectory.appendingPathComponent("metadata-" + extensionID + ".json"))
        defaults = UserDefaults.standard
        listKey = "managedList." + origin
    }

    private var authorized: Bool { EKEventStore.authorizationStatus(for: .reminder) == .fullAccess }

    private func managedList() -> EKCalendar? {
        guard let id = defaults.string(forKey: listKey) else { return nil }
        return store.calendar(withIdentifier: id)
    }

    private func status() -> [String: Any] {
        let list = authorized ? managedList() : nil
        return ["authorized": authorized, "listId": list?.calendarIdentifier ?? "", "listName": list?.title ?? "",
                "hostVersion": "0.2.0", "compactNotes": true, "authorizationStatus": EKEventStore.authorizationStatus(for: .reminder).rawValue]
    }

    private func connect() async throws -> [String: Any] {
        if !authorized {
            guard try await store.requestFullAccessToReminders() else {
                throw HostError("リマインダーへのアクセスを許可してください。システム設定のプライバシーとセキュリティから変更できます。")
            }
        }
        if let list = managedList() {
            guard list.allowsContentModifications else { throw HostError("同期先リストは読み取り専用です。") }
        } else {
            // Create our own list. A user-created list with the same name is not implicitly adopted.
            guard let source = store.defaultCalendarForNewReminders()?.source else {
                throw HostError("リマインダーで書き込み可能なアカウントを設定してください。")
            }
            let calendar = EKCalendar(for: .reminder, eventStore: store)
            calendar.title = "WebClass"
            calendar.source = source
            try store.saveCalendar(calendar, commit: true)
            defaults.set(calendar.calendarIdentifier, forKey: listKey)
        }
        return status()
    }

    private func reminders(in list: EKCalendar) async throws -> [EKReminder] {
        let predicate = store.predicateForReminders(in: [list])
        return try await withCheckedThrowingContinuation { continuation in
            store.fetchReminders(matching: predicate) { reminders in
                guard let reminders else {
                    continuation.resume(throwing: HostError("リマインダーの取得に失敗しました。再接続してください。"))
                    return
                }
                continuation.resume(returning: reminders)
            }
        }
    }

    private func serialize(_ reminder: EKReminder) throws -> [String: Any] {
        let notes = reminder.notes ?? ""
        guard let identity = syncIdentity(in: notes) else { throw HostError("Missing sync identity.") }
        let listID = reminder.calendar.calendarIdentifier
        let originalModified = reminder.lastModifiedDate
        if ReminderNoteFormat.isLegacy(notes) {
            let record = ReminderNoteFormat.record(content: notes)
            try metadata.save(record, listID: listID, identity: identity)
            reminder.notes = ReminderNoteFormat.compact(course: record.course, identity: identity)
            setSourceURL(notes, on: reminder)
            try store.save(reminder, commit: true)
        }
        let content = ReminderNoteFormat.restoredContent(notes: notes,
            record: metadata.get(listID: listID, identity: identity), sourceURL: reminder.url?.absoluteString)
        var result: [String: Any] = [
            "id": reminder.calendarItemIdentifier, "projectId": reminder.calendar.calendarIdentifier,
            "title": reminder.title ?? "", "content": content,
            "status": reminder.isCompleted ? 2 : 0, "isAllDay": false, "timeZone": "Asia/Tokyo", "dueDate": ""
        ]
        if let components = reminder.dueDateComponents {
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = components.timeZone ?? TimeZone(identifier: "Asia/Tokyo")!
            if let date = calendar.date(from: components) { result["dueDate"] = ReminderDates.format(date) }
        }
        if let date = originalModified { result["modifiedTime"] = ReminderDates.format(date) }
        if let date = reminder.completionDate { result["completedTime"] = ReminderDates.format(date) }
        return result
    }

    private func setSourceURL(_ content: String, on reminder: EKReminder) {
        let value = ReminderNoteFormat.labeled("WC_SOURCE_URL", in: content)
        if let url = URL(string: value), ["https", "http"].contains(url.scheme ?? "") {
            reminder.url = url
        }
    }

    private func apply(_ task: [String: Any], to reminder: EKReminder) throws {
        if let title = task["title"] as? String { reminder.title = title }
        if let content = task["content"] as? String {
            guard let identity = syncIdentity(in: content) else { throw HostError("WebClass metadata is required.") }
            let record = ReminderNoteFormat.record(content: content, displayCourse: task["displayCourse"] as? String)
            try metadata.save(record, listID: reminder.calendar.calendarIdentifier, identity: identity)
            reminder.notes = ReminderNoteFormat.compact(course: record.course, identity: identity)
            setSourceURL(content, on: reminder)
        }
        if let due = task["dueDate"] {
            if let text = due as? String, !text.isEmpty, let date = ReminderDates.parse(text) {
                var calendar = Calendar(identifier: .gregorian)
                calendar.timeZone = TimeZone(identifier: "Asia/Tokyo")!
                reminder.dueDateComponents = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second, .timeZone], from: date)
            } else {
                reminder.dueDateComponents = nil
            }
        }
        if let value = task["status"] as? Int { reminder.isCompleted = value == 2 }
    }

    func handle(_ request: NativeRequest) async throws -> [String: Any] {
        if request.command == "status" { return status() }
        if request.command == "connect" { return try await connect() }
        guard authorized else { throw HostError("リマインダーのアクセス権限がありません。設定画面で再接続してください。") }
        guard let list = managedList(), list.allowsContentModifications,
              request.fields["listId"] as? String == list.calendarIdentifier else {
            throw HostError("同期先リストが見つかりません。設定画面で再接続してください。")
        }
        if request.command == "snapshot" {
            let offset = request.fields["offset"] as? Int ?? 0
            if offset == 0 {
                snapshot = try await reminders(in: list)
                    .filter { syncIdentity(in: $0.notes ?? "") != nil }
                    .map(serialize)
            }
            guard let snapshot, offset >= 0, offset <= snapshot.count else { throw HostError("Invalid snapshot cursor.") }
            return ["tasks": Array(snapshot.dropFirst(offset).prefix(10)), "total": snapshot.count]
        }
        if request.command == "create" {
            guard let task = request.fields["task"] as? [String: Any] else { throw HostError("Missing task.") }
            try validateTask(task, creating: true)
            let identity = syncIdentity(in: task["content"] as? String ?? "")!
            // Recover a successful write whose response was lost, even if EventKit changed the local ID.
            if let existing = try await reminders(in: list).first(where: { syncIdentity(in: $0.notes ?? "") == identity }) {
                return try serialize(existing)
            }
            let reminder = EKReminder(eventStore: store)
            reminder.calendar = list
            try apply(task, to: reminder)
            try store.save(reminder, commit: true)
            return try serialize(reminder)
        }
        guard let id = request.fields["id"] as? String,
              let reminder = store.calendarItem(withIdentifier: id) as? EKReminder,
              reminder.calendar.calendarIdentifier == list.calendarIdentifier,
              syncIdentity(in: reminder.notes ?? "") != nil else {
            throw HostError("同期対象のリマインダーが見つかりません。再同期してください。")
        }
        switch request.command {
        case "patch":
            guard let task = request.fields["task"] as? [String: Any] else { throw HostError("Missing task patch.") }
            try validateTask(task, creating: false)
            try apply(task, to: reminder)
            try store.save(reminder, commit: true)
        case "complete":
            reminder.isCompleted = true
            try store.save(reminder, commit: true)
        case "delete":
            // Only uncompleted managed duplicates may be removed by the shared engine.
            guard !reminder.isCompleted else { throw HostError("Completed reminders cannot be deleted by sync.") }
            try store.remove(reminder, commit: true)
            return [:]
        default: throw HostError("Unsupported operation.")
        }
        return try serialize(reminder)
    }
}
