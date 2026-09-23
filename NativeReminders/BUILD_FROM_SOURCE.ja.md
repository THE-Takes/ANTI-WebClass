# WebClass Remindersをソースからビルドする

[English version](BUILD_FROM_SOURCE.md)

Appleリマインダー用補助アプリは、利用者が自分のMacでビルドします。このリポジトリでは、ビルド済みアプリを配布しません。Chrome拡張機能は別途インストールしてください。

## 必要なもの

- macOS 14以降のMac
- Google Chrome
- GitとXcode Command Line Tools（Xcode本体は不要）
- 自分のMacでビルドして使うだけなら、Apple Developer Programへの登録、Developer ID証明書、公証用の資格情報は不要です。

ビルドスクリプトはアドホック署名を付けます。この手順では、補助アプリをビルドしたMacにインストールします。生成したアプリやZIPを他の人に配布しないでください。

## 1. 公開ソースを取得する

Gitで公開リポジトリをcloneします。GitHubからソースZIPをダウンロードするのではなく、実行するMac上でビルドしてください。

```sh
git clone https://github.com/THE-Takes/ANTI-WebClass.git
cd ANTI-WebClass
```

Xcode Command Line Toolsがまだない場合はインストールします。

```sh
xcode-select --install
```

## 2. Chrome拡張機能を読み込み、IDをコピーする

ANTI-WebClassがChromeにまだ入っていない場合:

1. `chrome://extensions` を開きます。
2. 「デベロッパーモード」をオンにします。
3. 「パッケージ化されていない拡張機能を読み込む」を押し、このチェックアウト内の `Extension` フォルダを選びます。
4. 拡張機能カードに表示されたIDをコピーします。

別の方法でインストール済みの場合は、そのANTI-WebClassのIDを使います。補助アプリの登録には、接続する拡張機能と完全に同じIDが必要です。

## 3. 補助アプリをビルドする

リポジトリのルートで実行します。

```sh
bash NativeReminders/scripts/package-release.sh
```

Apple SiliconとIntelの両方に対応したアプリと、次のZIPが生成されます。

```text
NativeReminders/dist/WebClass-Reminders-v0.3.0.zip
NativeReminders/dist/build/Install WebClass Reminders.app
```

インストーラーでChrome拡張機能IDを入力するため、ビルド時にIDを渡す必要はありません。生成されたインストーラーを直接開きます。

```sh
open "NativeReminders/dist/build/Install WebClass Reminders.app"
```

手順2でコピーしたIDを貼り付け、「インストール」を選びます。補助アプリは `~/Applications/WebClass Reminders.app` にコピーされ、そのChrome拡張機能用に登録されます。

## 4. Appleリマインダーに接続する

ChromeでANTI-WebClassの設定を開き、外部ToDo連携を有効にし、連携先にAppleリマインダーを選びます。「Appleリマインダーに接続」を押し、ChromeのNative Messaging要求とmacOSのリマインダーアクセス要求を許可します。その後、ログイン済みのWebClassホーム画面から通常のToDo同期を実行します。

## 更新・アンインストール

展開した拡張機能のIDが変わらないよう、cloneしたフォルダは同じ場所に置いてください。更新前に同期を停止し、拡張機能の設定画面を閉じます。最新ソースを取得して再ビルドし、生成されたインストーラーを開きます。

```sh
git pull
bash NativeReminders/scripts/package-release.sh
open "NativeReminders/dist/build/Install WebClass Reminders.app"
```

同じChrome拡張機能IDを入力して補助アプリを更新します。アンインストールする場合は、インストーラーを開いて「アンインストール」を選びます。Appleリマインダーと同期メタデータは保持されます。

## 注意事項

- この手順は、自分のMacでビルドして使うためのものです。コンパイルしたアプリやZIPを他の人へ配布する手順ではありません。
- 補助アプリはGoogle Chrome専用で、macOS 14以降、Apple Silicon／IntelのMacに対応します。
- 同期の仕様、バックアップ、詳しいトラブルシューティングは[README.md](README.md)と[日本語の更新手順](README.ja.md)を参照してください。
