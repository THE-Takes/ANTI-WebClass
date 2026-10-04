import AppKit
import EventKit

@MainActor
enum ListPicker {
    static func choose(from lists: [EKCalendar], selectedID: String?, canCreate: Bool,
                       createList: () throws -> EKCalendar?) throws -> EKCalendar {
        let alert = NSAlert()
        alert.messageText = "WebClassと連携するリストを選択"
        alert.informativeText = "この拡張機能が同期するリマインダーリストを1つ選んでください。リスト内のWebClass課題は同期時に更新されます。"
        alert.addButton(withTitle: "このリストに接続")
        alert.addButton(withTitle: "キャンセル")
        alert.addButton(withTitle: "新しいリストを作成…")
        alert.buttons[0].isEnabled = !lists.isEmpty
        alert.buttons[2].isEnabled = canCreate
        let picker = NSPopUpButton(frame: NSRect(x: 0, y: 0, width: 380, height: 28), pullsDown: false)
        for (index, list) in lists.enumerated() {
            picker.addItem(withTitle: "\(list.title) — \(list.source.title)")
            picker.item(at: index)?.representedObject = list.calendarIdentifier
            if list.calendarIdentifier == selectedID { picker.selectItem(at: index) }
        }
        alert.accessoryView = picker
        NSApp.activate(ignoringOtherApps: true)
        while true {
            switch alert.runModal() {
            case .alertFirstButtonReturn:
                guard let id = picker.selectedItem?.representedObject as? String,
                      let list = lists.first(where: { $0.calendarIdentifier == id }) else {
                    throw HostError("接続するリストを選択してください。")
                }
                return list
            case .alertThirdButtonReturn:
                if let list = try createList() { return list }
            default:
                throw HostError("リストの選択をキャンセルしました。")
            }
        }
    }
}
