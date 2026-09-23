import Foundation

struct HostError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

struct NativeRequest {
    let requestId: String
    let command: String
    let fields: [String: Any]

    init(_ data: Data) throws {
        guard let fields = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              fields["version"] as? Int == 1,
              let requestId = fields["requestId"] as? String, !requestId.isEmpty, requestId.utf8.count <= 100,
              let command = fields["command"] as? String,
              ["status", "connect", "snapshot", "create", "patch", "complete", "delete"].contains(command)
        else { throw HostError("Unsupported native protocol or command.") }
        self.requestId = requestId
        self.command = command
        self.fields = fields
    }
}

enum NativeFraming {
    static let maxBytes = 900_000

    static func readExactly(_ count: Int, from input: FileHandle) throws -> Data {
        var result = Data()
        while result.count < count {
            guard let chunk = try input.read(upToCount: count - result.count), !chunk.isEmpty else { break }
            result.append(chunk)
        }
        return result
    }

    static func read(from input: FileHandle) throws -> Data? {
        let prefix = try readExactly(4, from: input)
        if prefix.isEmpty { return nil }
        guard prefix.count == 4 else { throw HostError("Truncated native message header.") }
        let length = prefix.enumerated().reduce(UInt32(0)) { $0 | UInt32($1.element) << UInt32($1.offset * 8) }
        guard length > 0, length <= maxBytes else { throw HostError("Native message exceeds size limit.") }
        let body = try readExactly(Int(length), from: input)
        guard body.count == length else { throw HostError("Truncated native message body.") }
        return body
    }

    static func write(_ object: [String: Any], to output: FileHandle) throws {
        let body = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
        guard body.count <= maxBytes else { throw HostError("Native response exceeds size limit.") }
        var length = UInt32(body.count).littleEndian
        let header = withUnsafeBytes(of: &length) { Data($0) }
        try output.write(contentsOf: header + body)
    }
}

func syncIdentity(in content: String) -> String? {
    let lines = content.components(separatedBy: .newlines)
    for line in lines {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("WC_SYNC_ID:") {
            let value = String(trimmed.dropFirst("WC_SYNC_ID:".count))
            if value.range(of: "^wc_v1_[0-9a-f]{16}$", options: .regularExpression) != nil { return value }
        }
    }
    return nil
}

func validateTask(_ task: [String: Any], creating: Bool) throws {
    let allowed: Set<String> = ["id", "projectId", "title", "content", "dueDate", "hasDue", "status", "isAllDay", "timeZone", "displayCourse"]
    guard Set(task.keys).isSubset(of: allowed) else { throw HostError("Unsupported reminder fields.") }
    for key in ["title", "content", "displayCourse"] {
        if let value = task[key] {
            guard let text = value as? String, text.utf8.count <= (key == "title" ? 4096 : 64000) else {
                throw HostError("Invalid reminder text.")
            }
        }
    }
    if let value = task["status"], let status = value as? Int, status != 0 && status != 2 {
        throw HostError("Invalid completion status.")
    }
    if task["status"] != nil && !(task["status"] is Int) { throw HostError("Invalid completion status.") }
    if let due = task["dueDate"], !(due is NSNull) {
        guard let text = due as? String, text.isEmpty || ReminderDates.parse(text) != nil else {
            throw HostError("Invalid reminder deadline.")
        }
    }
    if creating {
        guard let title = task["title"] as? String, !title.isEmpty,
              let content = task["content"] as? String, syncIdentity(in: content) != nil else {
            throw HostError("A task title and WebClass sync identity are required.")
        }
    }
}

enum ReminderDates {
    static func parse(_ text: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZ"
        formatter.isLenient = false
        return formatter.date(from: text)
    }
    static func format(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "Asia/Tokyo")
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZ"
        return formatter.string(from: date)
    }
}
