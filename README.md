# ANTI-WebClass

`ANTI-WebClass-dev` は、神奈川大学の WebClass (`https://kulms.kanagawa-u.ac.jp/webclass/*`) を対象にした Google Chrome / Chromium 向け Manifest V3 拡張機能です。

現在のリポジトリにはビルド工程はなく、[`Extension`](./Extension) をそのまま「パッケージ化されていない拡張機能」として読み込む構成になっています。

## 現在の実装内容

### 1. ホーム画面のダッシュボード化

- `Switch View 2` として、ホーム画面を 3 カラムのダッシュボードに再構成
- 時間割の当日列・現在コマのハイライト
- 課題一覧 (`My TODOs`) と件数サマリー表示
- 未読メッセージの取得、表示、既読化補助
- `Alt+Shift+M` で `Plain` 表示とダッシュボード表示を切り替え

### 2. コース名の短縮・表示調整

- 手動のカスタムコース名
- ルールベースの短縮
- LLM ベースの短縮
  - OpenAI
  - Groq
- ダッシュボード読み込み時の自動変換
- 設定画面からの手動再実行

### 3. 課題収集と ToDo 同期

- WebClass から課題を取得してローカル保存
- 次の外部 ToDo サービスと同期
  - Microsoft To Do
  - Google Tasks
  - Todoist
  - TickTick
- バックグラウンドでの定期同期
- タイトル形式や短縮コース名マッピングの設定

### 4. 資料ページ・ダウンロード改善

- 資料/試験ページのファイル名リネームダウンロード
- 元のファイル名でのダウンロードとの切り替え
- PDF ビューア上でのダウンロード補助
- 資料ページの目次オーバーレイ
  - 初期開閉
  - 自動非表示
  - ホバー再表示
  - セクション名表示切り替え
- `beforeunload` ダイアログの抑制

### 5. 試験ページの改善

- 試験フレームの UI 調整
- セレクトボックスの表示件数調整

### 6. 追加機能

- 自動ログイン
- デバッグモード
- ローカル専用の安全な保存補助
  - 一部の機密値は `chrome.storage.session` を優先
  - 一部のローカル保存値は `IndexedDB + Web Crypto (AES-GCM)` を利用して暗号化

## 設定画面で扱う外部サービス

| 用途 | サービス | 必要な設定 |
| --- | --- | --- |
| コース名短縮 | OpenAI | API キー |
| コース名短縮 | Groq | API キー |
| ToDo 同期 | Microsoft To Do | Client ID / Tenant ID |
| ToDo 同期 | Google Tasks | Client ID / Client Secret |
| ToDo 同期 | Todoist | Personal Token |
| ToDo 同期 | TickTick | Client ID / Client Secret |

## 権限とアクセス先

### Chrome 権限

- `storage`
- `downloads`
- `tabs`
- `scripting`
- `identity`
- `alarms`

### ホスト権限

- WebClass 本体: `https://kulms.kanagawa-u.ac.jp/*`
- LLM API: `https://api.openai.com/*`, `https://api.groq.com/*`
- ToDo 連携:
  - `https://graph.microsoft.com/*`
  - `https://login.microsoftonline.com/*`
  - `https://accounts.google.com/*`
  - `https://oauth2.googleapis.com/*`
  - `https://tasks.googleapis.com/*`
  - `https://api.todoist.com/*`
  - `https://ticktick.com/*`
  - `https://api.ticktick.com/*`

## インストール

1. このリポジトリを取得します。
2. Chrome または Chromium で `chrome://extensions/` を開きます。
3. 右上の「デベロッパーモード」を有効にします。
4. 「パッケージ化されていない拡張機能を読み込む」から [`Extension`](./Extension) を選択します。

## リポジトリ構成

- [`Extension/manifest.json`](./Extension/manifest.json): 拡張機能マニフェスト
- [`Extension/src/home.js`](./Extension/src/home.js): ホーム画面ダッシュボード
- [`Extension/src/course.js`](./Extension/src/course.js): 資料/試験/ダウンロード改善
- [`Extension/src/background.js`](./Extension/src/background.js): ダウンロード処理、OAuth、ToDo 同期、LLM 呼び出し
- [`Extension/src/options.html`](./Extension/src/options.html), [`Extension/src/options.js`](./Extension/src/options.js): 設定 UI
- [`Extension/src/login.js`](./Extension/src/login.js): 自動ログイン
- [`Extension/src/secure-storage.js`](./Extension/src/secure-storage.js): ローカル暗号化補助

## 注意事項

- 対応ブラウザは Chrome / Chromium 系を前提としています。
- 対象サイトは神奈川大学の WebClass に固定されています。
- 自動ログインや外部 API 連携を使う場合は、信頼できる個人端末での利用を前提にしてください。
- Google Tasks は仕様上、期限日時ではなく期限日ベースの扱いになる場面があります。
- 本拡張機能は非公式です。神奈川大学および WebClass 提供元とは無関係です。

## License

このプロジェクト本体は MIT License です。詳細は [`LICENSE`](./LICENSE) を参照してください。

同梱しているサードパーティライブラリ:

- `flatpickr` v4.6.13 (`Extension/lib/flatpickr.min.js`, `Extension/lib/flatpickr.min.css`, `Extension/lib/ja.js`) - MIT
- `mobile-select` (`Extension/lib/mobile-select.js`, `Extension/lib/mobile-select.css`) - MIT
- `mux.js` (`Extension/lib/mux-mp4.min.js`) - Apache-2.0
- `mp4box.js` (`Extension/lib/mp4box.all.js`) - BSD-3-Clause

Bundled third-party license texts are available in [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md).
