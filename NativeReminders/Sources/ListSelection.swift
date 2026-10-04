import Darwin
import Foundation

struct ListSelection {
    private let file: URL
    private let origin: String

    init(directory: URL, origin: String) {
        self.file = directory.appendingPathComponent("list-selections.json")
        self.origin = origin
    }

    func selectedID() throws -> String? {
        try selections()[origin]
    }

    func select(_ listID: String) throws {
        let lockFile = file.deletingLastPathComponent().appendingPathComponent("list-selections.lock")
        let descriptor = open(lockFile.path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
        guard descriptor >= 0 else { throw HostError("リスト設定のロックを開けません。") }
        defer { close(descriptor) }
        guard flock(descriptor, LOCK_EX) == 0 else { throw HostError("リスト設定のロックを取得できません。") }
        defer { flock(descriptor, LOCK_UN) }
        var values = try selections()
        if let owner = values.first(where: { $0.value == listID })?.key, owner != origin {
            throw HostError("このリストは別の拡張機能に接続されています。別のリストを選んでください。")
        }
        values[origin] = listID
        let data = try JSONSerialization.data(withJSONObject: values, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: file, options: .atomic)
    }

    private func selections() throws -> [String: String] {
        guard FileManager.default.fileExists(atPath: file.path) else { return [:] }
        let data = try Data(contentsOf: file)
        guard let values = try JSONSerialization.jsonObject(with: data) as? [String: String] else {
            throw HostError("リマインダーのリスト設定を読み取れません。バックアップから復元してください。")
        }
        return values
    }
}
