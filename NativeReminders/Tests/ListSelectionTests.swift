import Foundation

@main
struct ListSelectionTests {
    static func main() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let chrome = ListSelection(directory: directory, origin: "chrome|chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/")
        let dia = ListSelection(directory: directory, origin: "dia|chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/")
        let initial = try chrome.selectedID()
        assert(initial == nil)
        try chrome.select("list-a")
        let chromeFirst = try chrome.selectedID()
        assert(chromeFirst == "list-a")
        do {
            try dia.select("list-a")
            fatalError("Expected list ownership rejection")
        } catch let error as HostError {
            assert(error.localizedDescription.contains("別の拡張機能"))
        }
        try dia.select("list-b")
        let diaFirst = try dia.selectedID()
        assert(diaFirst == "list-b")
        try chrome.select("list-c")
        try dia.select("list-a")
        let chromeFinal = try chrome.selectedID()
        let diaFinal = try dia.selectedID()
        assert(chromeFinal == "list-c")
        assert(diaFinal == "list-a")
        print("Reminder list selection isolation and ownership checks passed.")
    }
}
