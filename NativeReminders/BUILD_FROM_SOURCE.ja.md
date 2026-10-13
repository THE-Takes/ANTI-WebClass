# WebClass Remindersをソースからビルドする

[English version](BUILD_FROM_SOURCE.md)

Appleリマインダー用補助アプリは、[最新リリース](https://github.com/THE-Takes/ANTI-WebClass/releases/latest)からUniversal版インストーラーZIPを取得するか、この手順で自分のMac上でソースからビルドできます。ChromeとDiaでそれぞれ拡張機能を利用でき、各ブラウザーの拡張機能IDには、そのブラウザー用の補助アプリを1つ登録します。

## 必要なもの

- macOS 14以降のMac
- Google ChromeまたはDia（両方への登録も可能です）
- GitとXcode Command Line Tools（Xcode本体は不要）
- 自分のMacでビルドして使うだけなら、Apple Developer Programへの登録、Developer ID証明書、公証用の資格情報は不要です。

ビルドスクリプトは既定でアドホック署名を付けます。この手順は、自分用の補助アプリを同じMacでビルド・インストールする方法です。他の人に導入する場合は公式リリースのパッケージを使用し、自分でビルドしたアプリやZIPは再配布しないでください。

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

## 2. 使うブラウザーを1つ選び、IDをコピーする

まず対象ブラウザーを1つ選びます。両方で使う場合は、各ブラウザーの拡張機能IDを控え、インストール手順をそれぞれ実行します。

選んだブラウザーにANTI-WebClassがまだ入っていない場合:

1. Google Chromeでは `chrome://extensions`、Diaでは `dia://extensions` を開きます。
2. 「デベロッパーモード」をオンにします。
3. 「パッケージ化されていない拡張機能を読み込む」を押し、このチェックアウト内の `Extension` フォルダを選びます。
4. 拡張機能カードに表示されたIDをコピーします。

既に使っている場合は、選んだブラウザーにあるANTI-WebClassのIDを使います。補助アプリの登録には、そのブラウザーで接続する拡張機能と完全に同じIDが必要です。

## 3. 補助アプリをビルドする

リポジトリのルートで実行します。

```sh
bash NativeReminders/scripts/package-release.sh
```

Apple SiliconとIntelの両方に対応したアプリと、次のZIPが生成されます。

```text
NativeReminders/dist/WebClass-Reminders-v0.4.0.zip
NativeReminders/dist/build/Install WebClass Reminders.app
```

生成されたインストーラーを直接開きます。インストーラーで対象ブラウザーと拡張機能IDを指定します。

```sh
open "NativeReminders/dist/build/Install WebClass Reminders.app"
```

手順2で選んだブラウザーと同じものを選び、コピーしたIDを貼り付けて「インストール」を押します。補助アプリは `~/Applications/WebClass Reminders Google Chrome.app` または `~/Applications/WebClass Reminders Dia.app` にコピーされます。他方の補助アプリと登録は保持されます。

## 4. Appleリマインダーに接続する

選んだブラウザーでANTI-WebClassの設定を開き、外部ToDo連携を有効にし、連携先にAppleリマインダーを選びます。「Appleリマインダーに接続」を押し、ブラウザーのNative Messaging要求とmacOSのリマインダーアクセス要求を許可します。補助アプリが取得した書き込み可能なリストから同期先を1つ選びます。もう一方の拡張機能では別のリストを選んでください。その後、ログイン済みのWebClassホーム画面から通常のToDo同期を実行します。

## 更新・アンインストール

展開した拡張機能のIDが変わらないよう、cloneしたフォルダは同じ場所に置いてください。更新前に同期を停止し、拡張機能の設定画面を閉じます。最新ソースを取得して再ビルドし、生成されたインストーラーを開きます。

```sh
git pull
bash NativeReminders/scripts/package-release.sh
open "NativeReminders/dist/build/Install WebClass Reminders.app"
```

同じブラウザーを選び、同じ拡張機能IDを入力して補助アプリを更新します。別のブラウザーを選ぶ場合は、そのブラウザーの拡張機能IDでもインストールします。アンインストールする場合は、インストーラーで削除するブラウザーを選んで「アンインストール」を押します。Appleリマインダーと同期メタデータは保持されます。

## 注意事項

- この手順は、自分のMacでビルドして使うためのものです。コンパイルしたアプリやZIPを他の人へ配布する手順ではありません。
- 補助アプリはGoogle ChromeまたはDiaに対応し、macOS 14以降、Apple Silicon／IntelのMacで動作します。Chrome用とDia用は同じMacに共存できます。各ブラウザーに登録できる拡張機能IDは1つです。
- 同期の仕様、バックアップ、詳しいトラブルシューティングは[README.md](README.md)と[日本語の更新手順](README.ja.md)を参照してください。
