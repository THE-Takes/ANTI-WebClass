# CalDAV リマインダー同期（実験的機能）

⚠️ **これは実験的な機能です。本番環境では使用しないでください。**

## 概要

この機能は、WebClassの課題をAppleリマインダー（iCloud CalDAV）に同期します。

## スクリーンショット

設定画面のイメージ：
- ダークテーマのモダンなUI
- Apple IDとアプリ用パスワードで認証
- リマインダーリストの選択
- 同期状態の表示

## セットアップ手順

### 1. アプリ固有パスワードの作成

1. [appleid.apple.com](https://appleid.apple.com) にアクセス
2. サインイン → 「サインインとセキュリティ」
3. 「アプリ用パスワード」を選択
4. 「+」ボタンで新しいパスワードを生成（例: "WebClass Sync"）
5. 表示されたパスワードをメモ（形式: xxxx-xxxx-xxxx-xxxx）

### 2. manifest.jsonへの追加

この機能を有効にするには、`Extension/manifest.json`の`host_permissions`に以下を追加：

```json
{
  "host_permissions": [
    "https://kulms.kanagawa-u.ac.jp/*",
    "https://caldav.icloud.com/*"
  ]
}
```

### 3. 設定画面の開き方

#### スタンドアロンで開く場合

1. Chromeで`chrome://extensions`を開く
2. WebClass拡張機能の「詳細」をクリック
3. 「拡張機能のオプション」または直接以下のURLにアクセス：
   - `chrome-extension://[拡張機能ID]/experimental/caldav/caldav-ui.html`

#### 既存の設定画面に統合する場合

`options.html`に以下を追加：

```html
<!-- CalDAV設定へのリンク -->
<div class="section">
  <h2>リマインダー同期（実験的）</h2>
  <p>WebClassの課題をAppleリマインダーに同期します。</p>
  <a href="experimental/caldav/caldav-ui.html" target="_blank">
    <button type="button">設定を開く</button>
  </a>
</div>
```

## 使い方

1. 設定画面で「CalDAV同期を有効にする」をON
2. Apple IDとアプリ用パスワードを入力
3. 「接続テスト」で正常に接続できることを確認
4. 「保存」をクリック
5. 同期先のリマインダーリストを選択
6. 「今すぐ同期」で手動同期、またはWebClass閲覧時に自動同期

## ファイル構成

```
experimental/caldav/
├── README.md           # このファイル
├── caldav-client.js    # CalDAVプロトコルの実装
├── caldav-sync.js      # 同期ロジック
├── caldav-ui.html      # 設定UI（HTML）
├── caldav-ui.js        # 設定UIのスクリプト
└── caldav-ui.css       # 設定UIのスタイル
```

## 技術仕様

### CalDAVクライアント (`caldav-client.js`)

- iCloud CalDAVサーバーへの接続
- PROPFIND/REPORTリクエストでカレンダー情報を取得
- VTODOフォーマットでリマインダーを作成/更新/削除

### 同期マネージャー (`caldav-sync.js`)

- WebClassの課題データをVTODO形式に変換
- 同期済みアイテムの追跡（UID/href）
- 優先度の自動設定（締め切りに基づく）

### ストレージに保存される設定

```javascript
{
  caldavEnabled: false,           // 有効/無効
  caldavAppleId: '',              // Apple ID
  caldavAppPassword: '',          // アプリ用パスワード
  caldavSelectedList: '',         // 選択されたリマインダーリストのURL
  caldavLastSync: null,           // 最終同期日時
  caldavSyncedItems: {}           // 同期済みアイテムの情報
}
```

## 注意事項

### iOS 13以降の互換性問題

iOS 13/macOS Catalina以降でリマインダーアプリを「アップグレード」した場合、CalDAV経由のアクセスで互換性の問題が発生する可能性があります。

### データ削除のリスク

CalDAV経由でアクセスすると、サードパーティアプリのデータが削除されるケースが報告されています。**必ずバックアップを取ってから**テストしてください。

### セキュリティ

- 認証情報はブラウザのローカルストレージに保存されます
- 共有PCでは使用しないでください
- アプリ用パスワードは定期的に更新することを推奨

### Appleの仕様変更

Appleは予告なく仕様を変更することがあり、将来的に動作しなくなる可能性があります。

## 切り離し方

この機能を無効にするには：

1. `Extension/experimental/caldav/` フォルダを削除
2. `manifest.json`から`https://caldav.icloud.com/*`を削除
3. `options.html`から関連するUI部分を削除（統合した場合）

## トラブルシューティング

### 「接続失敗」エラー

1. Apple IDとアプリ用パスワードが正しいか確認
2. 2要素認証が有効になっているか確認
3. アプリ用パスワードを再生成

### リマインダーリストが表示されない

1. iCloudでリマインダーを有効にしているか確認
2. iOS 13以降でリマインダーを「アップグレード」していないか確認

### CORSエラー

`manifest.json`に`https://caldav.icloud.com/*`が追加されているか確認

## ライセンス

このコードはプロジェクトのライセンスに従います。
