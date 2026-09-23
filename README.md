# ANTI-WebClass

`ANTI-WebClass` は、神奈川大学の WebClass (`https://kulms.kanagawa-u.ac.jp/webclass/*`) を対象にした Google Chrome / Chromium 向け Manifest V3 拡張機能です。

現在のリポジトリにはビルド工程はなく、[`Extension`](./Extension) をそのまま「パッケージ化されていない拡張機能」として読み込む構成になっています。現在の拡張機能バージョンは [`Extension/manifest.json`](./Extension/manifest.json) の `0.4.0` です。

## 現在の実装内容

### 1. ホーム画面のダッシュボード化

- `Plain` と `Switch View 2 (Dashboard View)` の切り替え
- ライト・ダーク・システム連動テーマ
- 同じページ内で開く設定パネル
- 表示モード切替ショートカットの設定
- 時間割の表示範囲設定、当日列・現在コマのハイライト
- 課題一覧 (`My TODOs`) と件数サマリー表示
- 課題の期限、状態、リマインダー、削除状態などのローカル編集
- 未読メッセージの取得、表示、既読化補助
- GitHub Releases の更新確認、バッジ表示、通知表示
- WebClass 右上のユーザーアイコンのカスタマイズ
- セッション切れ検知時の再読み込み案内

### 2. コース名の表示調整

- 手動のカスタムコース名
- 短縮名を使った時間割・コース一覧表示
- OpenAI / Groq によるコース名短縮は削除しました。旧設定の認証情報も削除されます。

### 3. 課題収集と ToDo 同期

- WebClass から課題を取得してローカル保存
- Smart ToDo と外部 ToDo サービスの同期
- TickTick と Appleリマインダー（macOS限定・専用補助アプリが必要）に対応
- バックグラウンドでの定期同期
- タイトル形式や短縮コース名マッピングの設定
- 課題取得の再試行、通信失敗時の既存データ保護、コース遷移時の取得停止
- Microsoft To Do、Google Tasks、Todoist の旧連携用ホスト権限は削除しました。
- Appleリマインダー用補助アプリはこのリポジトリ・配布ZIPに含まれません。拡張機能単体では利用できません。

### 4. 資料ページ・ダウンロード改善

- 資料/試験ページのファイル名リネームダウンロード
- 元のファイル名でのダウンロードとの切り替え
- PDF ビューア上でのダウンロード補助
- HLS (`.m3u8`) 動画の取得、MP4 変換、TS フォールバック
- 断片化 MP4 の互換性調整
- 動画フレームの表示調整
- 資料ページの目次オーバーレイ
  - 初期開閉
  - 自動非表示
  - ホバー再表示
  - セクション名表示切り替え
- `beforeunload` ダイアログの抑制

### 5. コースページ・試験ページの改善

- コースページの左ジャンプリンク表示設定
- 試験フレームの UI 調整
- 試験画面の表示モード切り替え、フレームサイズ調整
- PDF 表示時のスクロール連携とサイズ変更操作
- セレクトボックスの表示件数調整
- 試験アップロード/回答ページ周辺の表示補助

### 6. 追加機能

- 自動ログイン
- デバッグモード
- 秘密情報を除外した設定・ToDo データのエクスポート/インポート
- OAuth Redirect URL のコピー補助
- ローカル専用の安全な保存補助
  - 一部の機密値は `chrome.storage.session` を優先
  - 一部のローカル保存値は `IndexedDB + Web Crypto (AES-GCM)` を利用して暗号化

## 設定画面で扱う外部サービス

| 用途 | サービス | 必要な設定 |
| --- | --- | --- |
| ToDo 同期 | TickTick | Client ID / Client Secret（専用プロジェクトは WebClass） |
| ToDo 同期 | Appleリマインダー | macOS 14以降、専用補助アプリ、接続許可 |
| 更新確認 | GitHub Releases | ユーザー設定不要 |

## 権限とアクセス先

### Chrome 権限

現在の [`Extension/manifest.json`](./Extension/manifest.json) で宣言している権限:

- `storage`: 設定、課題、キャッシュ、暗号化済みローカル値の保存
- `downloads`: 資料、PDF、動画などのダウンロードとファイル名調整
- `tabs`: WebClass タブの検出、設定画面からの遷移、同期対象タブの探索
- `identity`: TickTick OAuth
- `alarms`: ToDo 定期同期と GitHub Releases 更新確認
- `notifications`: 更新通知の表示
- `nativeMessaging`（任意）: Appleリマインダー用補助アプリとの通信。接続時に要求します。

### ホスト権限

- WebClass 本体: `https://kulms.kanagawa-u.ac.jp/*`
- ローカル検証用 WebClass: `http://127.0.0.1/*`, `http://localhost/*`
- 更新確認: `https://api.github.com/*`
- TickTick / OAuth: `https://ticktick.com/*`, `https://api.ticktick.com/*`

## インストール

1. [最新リリース](https://github.com/THE-Takes/ANTI-WebClass/releases/latest) の `ANTI-WebClass-ver.0.4.0.zip` をダウンロードして展開するか、このリポジトリを取得します。
2. Chrome または Chromium で `chrome://extensions/` を開きます。
3. 右上の「デベロッパーモード」を有効にします。
4. 「パッケージ化されていない拡張機能を読み込む」から [`Extension`](./Extension) を選択します。

## リポジトリ構成

- [`Extension/manifest.json`](./Extension/manifest.json): 拡張機能マニフェスト
- [`Extension/src/home.js`](./Extension/src/home.js): ホーム画面ダッシュボード、Smart ToDo 表示
- [`Extension/src/course.js`](./Extension/src/course.js): コース/資料/試験/動画/ダウンロード改善
- [`Extension/src/background.js`](./Extension/src/background.js): ダウンロード処理、OAuth、ToDo 同期、更新確認
- [`Extension/src/options.html`](./Extension/src/options.html), [`Extension/src/options.js`](./Extension/src/options.js): 設定 UI
- [`Extension/src/login.js`](./Extension/src/login.js): 自動ログイン
- [`Extension/src/scraper.js`](./Extension/src/scraper.js): 課題収集
- [`Extension/src/shortcuts.js`](./Extension/src/shortcuts.js): 表示モード切替ショートカット
- [`Extension/src/todo-sync-identity.js`](./Extension/src/todo-sync-identity.js): ToDo 同期用の安定 ID 生成
- [`Extension/src/secure-storage.js`](./Extension/src/secure-storage.js): ローカル暗号化補助
- [`Extension/src/beforeunload-blocker.js`](./Extension/src/beforeunload-blocker.js): `beforeunload` 抑制
- [`Extension/lib`](./Extension/lib): 同梱サードパーティライブラリ

## 注意事項

- 対応ブラウザは Chrome / Chromium 系を前提としています。
- 対象サイトは神奈川大学の WebClass に固定されています。
- 本拡張機能は非公式です。神奈川大学および WebClass 提供元とは無関係です。
- 自動ログイン、外部 ToDo 連携を使う場合は、信頼できる個人端末での利用を前提にしてください。
- パスワード、Client Secret、OAuth トークンなどの機密値はブラウザ内に保存されます。一部は `chrome.storage.session` または `IndexedDB + Web Crypto (AES-GCM)` により保護されます。
- ローカルホスト向けの権限は開発・検証用途です。

## License

このプロジェクト本体は MIT License です。詳細は [`LICENSE`](./LICENSE) を参照してください。

同梱しているサードパーティライブラリ:

| ライブラリ | バージョン | ファイル | ライセンス |
| --- | --- | --- | --- |
| `flatpickr` | v4.6.13 | `Extension/lib/flatpickr.min.js`, `Extension/lib/flatpickr.min.css`, `Extension/lib/ja.js` | MIT |
| `mobile-select` | v1.4.0 | `Extension/lib/mobile-select.js`, `Extension/lib/mobile-select.css` | MIT |
| `mux.js` | v6.3.0 | `Extension/lib/mux-mp4.min.js` | Apache-2.0 |
| `mp4box.js` / `mp4box` | v2.3.0 | `Extension/lib/mp4box.all.js` | BSD-3-Clause |

Bundled third-party license texts are available in [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md).
