# WebClass Reminders public release

[日本語版](README.release.ja.md)

This file and the release workflow are intentionally kept only in the public THE-Takes/ANTI-WebClass repository. Do not copy release credentials or this workflow into ANTI-WebClass-Dev.

## One-time repository setup

Add these GitHub Actions secrets in the public repository:

- DEVELOPER_ID_CERTIFICATE_BASE64: base64-encoded Developer ID Application .p12 certificate.
- DEVELOPER_ID_CERTIFICATE_PASSWORD: password protecting the .p12.
- BUILD_KEYCHAIN_PASSWORD: a new password used only for the ephemeral CI keychain.
- APPLE_NOTARY_KEY_BASE64: base64-encoded App Store Connect API .p8 key.
- APPLE_NOTARY_KEY_ID: the API key ID.
- APPLE_NOTARY_ISSUER_ID: the API issuer ID.

The workflow signs the Universal 2 helper app and installer, submits both to Apple notarization, staples the tickets, and uploads the ZIP plus its SHA-256 checksum.

## Publish a prerelease

Merge the same source changes into the public repository's default branch first. Then create and push the tag matching NativeReminders/VERSION; for version 0.3.0, use these commands:

    git tag webclass-reminders-v0.3.0
    git push origin webclass-reminders-v0.3.0

The workflow publishes the asset to this repository's Releases page. It marks the release as a prerelease until Chrome native-host lookup, real Reminders permissions, task edits, and iCloud propagation have been verified. GitHub's /releases/latest endpoint excludes prereleases, so the helper version will not be mistaken for an ANTI-WebClass extension update.
