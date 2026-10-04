import AppKit
import EventKit

@MainActor
enum ListCreation {
    static func create(in store: EKEventStore, sources: [EKSource], preferredSourceID: String?) -> EKCalendar? {
        let alert = NSAlert()
        alert.messageText = "新しいリマインダーリストを作成"
        alert.informativeText = "任意のリスト名と保存先を指定してください。作成したリストにWebClassを接続します。"
        alert.addButton(withTitle: "作成して接続")
        alert.addButton(withTitle: "戻る")

        let form = NSStackView()
        form.orientation = .vertical
        form.alignment = .leading
        form.spacing = 8
        form.addArrangedSubview(NSTextField(labelWithString: "リスト名"))
        let name = NSTextField(string: "WebClass")
        name.placeholderString = "リスト名を入力"
        name.setAccessibilityLabel("リスト名")
        form.addArrangedSubview(name)
        form.addArrangedSubview(NSTextField(labelWithString: "保存先アカウント"))
        let account = NSPopUpButton(frame: .zero, pullsDown: false)
        account.setAccessibilityLabel("保存先アカウント")
        for (index, source) in sources.enumerated() {
            account.addItem(withTitle: source.title)
            account.item(at: index)?.representedObject = source.sourceIdentifier
            if source.sourceIdentifier == preferredSourceID { account.selectItem(at: index) }
        }
        form.addArrangedSubview(account)
        let errorLabel = NSTextField(wrappingLabelWithString: "")
        errorLabel.textColor = .systemRed
        form.addArrangedSubview(errorLabel)
        for view in [name, account, errorLabel] {
            view.widthAnchor.constraint(equalToConstant: 380).isActive = true
        }
        form.translatesAutoresizingMaskIntoConstraints = false
        form.widthAnchor.constraint(equalToConstant: 380).isActive = true
        alert.accessoryView = form
        alert.window.initialFirstResponder = name

        while true {
            form.setFrameSize(form.fittingSize)
            guard alert.runModal() == .alertFirstButtonReturn else { return nil }
            let title = name.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !title.isEmpty else {
                errorLabel.stringValue = "リスト名を入力してください。"
                alert.window.makeFirstResponder(name)
                continue
            }
            guard let id = account.selectedItem?.representedObject as? String,
                  let source = sources.first(where: { $0.sourceIdentifier == id }) else {
                errorLabel.stringValue = "保存先アカウントを選択してください。"
                continue
            }
            let list = EKCalendar(for: .reminder, eventStore: store)
            list.title = title
            list.source = source
            do {
                try store.saveCalendar(list, commit: true)
                return list
            } catch {
                errorLabel.stringValue = "リストを作成できませんでした。保存先を確認して再試行してください。\n\(error.localizedDescription)"
            }
        }
    }
}
