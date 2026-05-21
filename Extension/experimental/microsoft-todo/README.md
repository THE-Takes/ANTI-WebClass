# Microsoft To Do 連携（実験的機能）

⚠️ **これは実験的な機能です。**

## 概要

WebClassの課題をMicrosoft To Doに同期します。

## セットアップ手順

### 1. Azure ADでアプリを登録

1. [Azure Portal](https://portal.azure.com/) にアクセス
2. 「Azure Active Directory」→「アプリの登録」→「新規登録」
3. 以下の情報を入力：
   - 名前: `WebClass To Do Sync`
   - サポートされているアカウントの種類: 「任意の組織ディレクトリ内のアカウントと個人のMicrosoftアカウント」
   - リダイレクトURI: 「単一ページアプリケーション (SPA)」を選択し、以下を入力：
     ```
     https://[拡張機能ID].chromiumapp.org/
     ```
     （拡張機能IDは `chrome://extensions` で確認）

4. 登録後、「概要」ページで「アプリケーション (クライアント) ID」をコピー

### 2. APIのアクセス許可を追加

1. 「APIのアクセス許可」→「アクセス許可の追加」
2. 「Microsoft Graph」→「委任されたアクセス許可」
3. 以下を追加：
   - `Tasks.ReadWrite`
   - `User.Read`
4. 「アクセス許可の追加」をクリック

### 3. 拡張機能に設定

1. 設定画面を開く
2. 「Microsoft To Do」セクションでクライアントIDを入力
3. 「Microsoftでサインイン」をクリック

## 使い方

1. サインイン後、同期先のリストを選択
2. 「今すぐ同期」で手動同期

## ファイル構成

```
experimental/microsoft-todo/
├── README.md           # このファイル
├── ms-graph-client.js  # Microsoft Graph APIクライアント
├── ms-todo-sync.js     # 同期ロジック
├── ms-todo-ui.html     # 設定UI
├── ms-todo-ui.js       # 設定UIのスクリプト
└── ms-todo-ui.css      # 設定UIのスタイル
```

## 注意事項

- OAuth2トークンはブラウザのローカルストレージに保存されます
- トークンは1時間で期限切れになりますが、自動的に更新されます

