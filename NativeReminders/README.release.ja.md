# WebClass Reminders 公開リリース手順

[English version](README.release.md)

この手順書とリリース用ワークフローは、公開用の `THE-Takes/ANTI-WebClass` リポジトリだけに置きます。署名用の認証情報やワークフローを `ANTI-WebClass-Dev` にコピーしないでください。

## 初回のみ: GitHub Actions Secrets の登録

公開用リポジトリの **Settings → Secrets and variables → Actions** に、次のSecretsを登録します。

- `DEVELOPER_ID_CERTIFICATE_BASE64`: Developer ID Application証明書（`.p12`）をBase64エンコードした値
- `DEVELOPER_ID_CERTIFICATE_PASSWORD`: `.p12`証明書のパスワード
- `BUILD_KEYCHAIN_PASSWORD`: CI実行時に一時作成するキーチェーン専用の新しいパスワード
- `APPLE_NOTARY_KEY_BASE64`: App Store Connect APIキー（`.p8`）をBase64エンコードした値
- `APPLE_NOTARY_KEY_ID`: APIキーID
- `APPLE_NOTARY_ISSUER_ID`: API発行者ID

ワークフローは、Apple SiliconとIntelに対応したUniversalアプリとインストーラーに署名し、Appleの公証を申請してチケットを付与します。その後、ZIPファイルとSHA-256チェックサムをGitHub Releaseにアップロードします。

## プレリリースの公開

まず、公開用リポジトリのデフォルトブランチに、同じソース変更をマージします。その後、`NativeReminders/VERSION` に合うタグを作成してプッシュします。バージョンが `0.3.0` の場合は次のとおりです。

```sh
git tag webclass-reminders-v0.3.0
git push origin webclass-reminders-v0.3.0
```

ワークフローがこのリポジトリのGitHub Releasesに配布ファイルを公開します。ChromeのNative Messagingホスト検出、実際のリマインダー権限、課題の編集、iCloud同期を確認するまでは、プレリリースとして公開されます。GitHubの`/releases/latest`エンドポイントはプレリリースを返さないため、WebClass拡張機能の更新処理が補助アプリのバージョンを拡張機能の最新リリースと誤認しません。
