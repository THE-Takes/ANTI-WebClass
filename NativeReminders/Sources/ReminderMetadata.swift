import Foundation

struct ReminderMetadata: Codable {
    let content: String
    let course: String
}

// Persist synchronization details before replacing the visible notes. Invalid stores fail closed.
final class ReminderMetadataStore {
    private struct Archive: Codable {
        var version = 1
        var records: [String: ReminderMetadata] = [:]
    }
    private let file: URL
    private var archive: Archive

    init(file: URL) throws {
        self.file = file
        if FileManager.default.fileExists(atPath: file.path) {
            archive = try JSONDecoder().decode(Archive.self, from: Data(contentsOf: file))
            guard archive.version == 1 else { throw HostError("Unsupported reminder metadata version.") }
        } else {
            archive = Archive()
        }
    }

    private func key(listID: String, identity: String) -> String { listID + "\n" + identity }

    func get(listID: String, identity: String) -> ReminderMetadata? {
        archive.records[key(listID: listID, identity: identity)]
    }

    func save(_ record: ReminderMetadata, listID: String, identity: String) throws {
        guard syncIdentity(in: record.content) == identity else { throw HostError("Invalid reminder metadata identity.") }
        var next = archive
        next.records[key(listID: listID, identity: identity)] = record
        let data = try JSONEncoder().encode(next)
        try data.write(to: file, options: .atomic)
        archive = next
    }
}

enum ReminderNoteFormat {
    static func labeled(_ label: String, in content: String) -> String {
        let prefix = label + ":"
        return content.components(separatedBy: .newlines)
            .first(where: { $0.hasPrefix(prefix) })
            .map { String($0.dropFirst(prefix.count)).trimmingCharacters(in: .whitespaces) } ?? ""
    }

    static func isLegacy(_ content: String) -> Bool {
        let prefixes = ["Course:", "Original Task:", "Original Deadline:", "Current Deadline:", "WC_DEADLINE_TEXT:"]
        let metadataLines = content.components(separatedBy: .newlines).filter { line in
            prefixes.contains(where: { line.hasPrefix($0) })
        }
        return metadataLines.count >= 2
    }

    static func shortCourse(_ value: String) -> String {
        let firstLine = value.components(separatedBy: .newlines).first ?? ""
        let shortened = firstLine.replacingOccurrences(of: "[（(\\[【].*$", with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        return String((shortened.isEmpty ? "WebClass" : shortened).prefix(40))
    }

    static func compact(course: String, identity: String) -> String {
        shortCourse(course) + "\nWC_SYNC_ID:" + identity
    }

    static func record(content: String, displayCourse: String? = nil) -> ReminderMetadata {
        ReminderMetadata(content: content, course: shortCourse(displayCourse ?? labeled("Course", in: content)))
    }

    static func restoredContent(notes: String, record: ReminderMetadata?, sourceURL: String?) -> String {
        if isLegacy(notes) { return notes }
        if let record, syncIdentity(in: record.content) == syncIdentity(in: notes) { return record.content }
        // The sync marker survives a lost local cache. Never invent original task/deadline values.
        if let sourceURL, !sourceURL.isEmpty { return notes + "\nWC_SOURCE_URL:" + sourceURL }
        return notes
    }
}
