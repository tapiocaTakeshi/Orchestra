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
- Windows のコード署名 (Authenticode) は別途実装が必要です（現状は未署名）

## macOS Developer ID 署名 + Notarization のセットアップ

Apple Developer ID で署名 + Notarization すると、ユーザーがダウンロードした
`.app` がそのまま起動できるようになります（Gatekeeper の「壊れている」表示が
出なくなる）。下記の secrets を登録すると `release.yml` が自動的に正規署名
モードで動きます。未登録なら ad-hoc 署名にフォールバックします。

### 1. Developer ID Application 証明書の発行

1. <https://developer.apple.com/account/resources/certificates/list> を開く
2. `+` → **Developer ID Application** を選択 → Continue
3. ローカルの **Keychain Access.app → Certificate Assistant → Request a
   Certificate From a Certificate Authority…** で `.certSigningRequest` を作成
4. Apple Developer サイトに `.certSigningRequest` をアップロード → 証明書を
   ダウンロード
5. ダウンロードした `.cer` をダブルクリックして Keychain に登録

### 2. 証明書を `.p12` でエクスポート

1. **Keychain Access.app** を開く
2. login keychain → My Certificates から **Developer ID Application: ...**
   を右クリック → **Export…**
3. Format: `Personal Information Exchange (.p12)` で保存
4. **強力なパスワード**を設定（このパスワードを後で secret に登録）

### 3. App-specific password の発行

Notarization 用に Apple ID のアプリ固有パスワードを作成します。

1. <https://account.apple.com> にログイン
2. サインインとセキュリティ → App 用パスワード → `+` で新規作成
3. ラベル例: `Orchestra Notarization` → 16 文字のパスワードが発行される

### 4. Team ID を確認

<https://developer.apple.com/account> 右上のメンバーシップ詳細から **Team
ID** (10 文字英数) を確認します。

### 5. GitHub Secrets を登録

リポジトリの **Settings → Secrets and variables → Actions → New repository
secret** で以下を登録します。

| Secret 名 | 値 | 例 |
|---|---|---|
| `MACOS_CODESIGN_IDENTITY` | 証明書の Common Name 全体 | `Developer ID Application: Yuya Higuchi (ABCDE12345)` |
| `MACOS_CERTIFICATE_P12_BASE64` | `.p12` ファイルを base64 化した文字列 | `base64 -i cert.p12 \| pbcopy` の結果 |
| `MACOS_CERTIFICATE_PASSWORD` | `.p12` 作成時のパスワード | `********` |
| `MACOS_NOTARIZATION_APPLE_ID` | Apple Developer 登録の Apple ID メール | `you@example.com` |
| `MACOS_NOTARIZATION_PASSWORD` | App-specific password | `abcd-efgh-ijkl-mnop` |
| `MACOS_NOTARIZATION_TEAM_ID` | Team ID（10 文字） | `ABCDE12345` |

#### `MACOS_CODESIGN_IDENTITY` の確認方法

ローカルで証明書をインポート済みなら以下で確認できます:

```bash
security find-identity -p codesigning -v | grep "Developer ID Application"
# 例: 1) ABCDEF1234567890ABCDEF1234567890ABCDEF12 "Developer ID Application: Yuya Higuchi (ABCDE12345)"
```

ダブルクォートの中の文字列をそのまま secret に貼り付けます。

#### `MACOS_CERTIFICATE_P12_BASE64` の作り方

```bash
base64 -i ~/Desktop/orchestra.p12 | pbcopy
# クリップボードに base64 文字列が入るので、そのまま GitHub Secrets に貼り付ける
```

### 6. リリース実行

タグを push すれば自動で署名 + Notarization が走ります。

```bash
git tag v1.4.11
git push origin v1.4.11
```

ワークフローのログで `Notarize and staple DMG` ステップが成功していれば、
ダウンロードしたユーザーは追加操作不要で起動できます。

### 7. ローカル検証

CI を待たずに署名済み `.dmg` の検証だけしたい場合:

```bash
# 署名済みかチェック
codesign --verify --verbose=2 Orchestra-v1.4.11-darwin-arm64.dmg

# Notarization staple が貼られているかチェック
xcrun stapler validate Orchestra-v1.4.11-darwin-arm64.dmg

# Gatekeeper による評価
spctl -a -t open --context context:primary-signature -vvv \
  Orchestra-v1.4.11-darwin-arm64.dmg
```

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
