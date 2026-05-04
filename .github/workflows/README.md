# GitHub Actions Workflows

Orchestra のリリース自動化ワークフローを提供します。

## ワークフロー一覧

### `release.yml` — フル自動ビルド & リリース

タグ (`v*`) を push すると **macOS / Windows / Linux** の 3 OS で並列にビルドし、
成果物を GitHub Release に自動添付します。

- **トリガー**: `git push origin v1.4.10` または手動 (workflow_dispatch)
- **生成物**:
  - `Orchestra-vX.Y.Z-darwin-arm64.dmg`
  - `Orchestra-vX.Y.Z-darwin-arm64.zip`
  - `Orchestra-vX.Y.Z-win32-x64.zip`
  - `Orchestra-vX.Y.Z-linux-x64.tar.gz`
- **所要時間**: 30 〜 90 分 / OS（並列実行）
- **ランナー**: `macos-14` (Apple Silicon), `windows-latest`, `ubuntu-latest`

#### 使い方

```bash
# 1. product.json の voidVersion を更新
# 2. コミットして push
git add product.json
git commit -m "chore: bump to 1.4.10"
git push

# 3. タグを切って push (これで自動で workflow が走る)
git tag v1.4.10
git push origin v1.4.10
```

#### 注意点

- 初回はランナーのキャッシュが効かないため特に時間がかかります
- 一部 OS だけ自動化したい場合は不要な `build-*` ジョブを削除してください
- macOS は ad-hoc 署名 (`codesign --sign -`) のみ。Apple Notarization が必要な場合は
  別途 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` などの secrets を追加してください
- Windows のコード署名 (Authenticode) も同様に追加実装が必要です

### `release-manual.yml` — 手動アップロード用ドラフトリリース作成

CI で全 OS をフルビルドすると重いので、**ローカルで作った成果物を手動添付する**
パターン用の簡易ワークフローです。タグの作成とドラフトリリースの作成だけ行います。

#### 使い方

```bash
# ローカルでビルド
npm run release-macos
# DMG を手元に作る (ローカルでよく使うコマンド例)
hdiutil create -volname "Orchestra" \
  -srcfolder ../VSCode-darwin-arm64/Orchestra.app \
  -ov -format UDZO Orchestra-darwin-arm64.dmg

# タグを切って push
git tag v1.4.10
git push origin v1.4.10

# Actions タブで release-manual.yml を手動実行 (workflow_dispatch)
# → ドラフトリリースが作成される

# ローカルから成果物をアップロード
gh release upload v1.4.10 \
  Orchestra-darwin-arm64.dmg

# 確認したら publish
gh release edit v1.4.10 --draft=false
```

## オートアップデート機能との連携

Orchestra のオートアップデート (`voidUpdateMainService.ts`) は
`tapiocaTakeshi/Orchestra` の **最新リリース** (`/releases/latest`) を見ています。

- **ドラフト** や **prerelease** はこの API では返ってこないので、
  テスト用にバナーを出したい場合は publish & latest 設定が必要です
- リリースのタグ名は `v1.4.10` のような **semver 形式** にしてください
  (ロジック上 "v" は除去されます)

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| `npm ci` が失敗 | `.nvmrc` の Node バージョンを確認。Python 3 が必要 |
| native modules のビルド失敗 (Windows) | `npm config set msvs_version 2022` などが必要な場合あり |
| Linux で `libsecret` 系エラー | `apt-get install libsecret-1-dev` を確認 |
| DMG 作成時にエラー | `hdiutil` が古い macOS ランナーで動かない可能性。`macos-14` 利用を確認 |
| Release が `latest` にならない | ドラフトのままになっていないか確認 |
