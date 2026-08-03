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
- Windows のコード署名 (Authenticode) は secrets 未登録なら未署名でビルドされます
  (SmartScreen の警告が出ます)。署名する場合は下記セットアップを参照してください

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

## Windows Authenticode 署名のセットアップ

Authenticode で署名すると、ダウンロードした `Orchestra.exe` の実行時に出る
Microsoft Defender SmartScreen の「発行元不明」警告が出なくなります（新規署名
証明書は SmartScreen の評価が溜まるまでしばらく警告が出ることがあります）。
下記の secrets を登録すると `release.yml` が自動的に署名します。未登録なら
未署名のままビルドされます。

### 1. コード署名証明書の取得

DigiCert / Sectigo / SSL.com などの CA から **Code Signing** 証明書
(`.pfx`/`.p12` 形式でエクスポートできるもの) を購入します。EV 証明書の方が
SmartScreen の初期評価が早く付きますが、通常の OV 証明書でも動作します。

### 2. GitHub Secrets を登録

リポジトリの **Settings → Secrets and variables → Actions → New repository
secret** で以下を登録します。

| Secret 名 | 値 |
|---|---|
| `WINDOWS_CODESIGN_PFX_BASE64` | `.pfx` ファイルを base64 化した文字列 |
| `WINDOWS_CODESIGN_PASSWORD` | `.pfx` 作成時のパスワード |

```powershell
# .pfx を base64 化してクリップボードにコピー (Windows)
[Convert]::ToBase64String([IO.File]::ReadAllBytes("orchestra.pfx")) | Set-Clipboard
```

```bash
# macOS/Linux から作業する場合
base64 -i orchestra.pfx | pbcopy   # macOS
base64 -w0 orchestra.pfx | xclip   # Linux
```

### 3. リリース実行

タグを push すれば `build-windows` ジョブが自動的に `Orchestra.exe` を
Authenticode 署名 (SHA-256, RFC3161 タイムスタンプ) します。

```bash
git tag v1.4.11
git push origin v1.4.11
```

### 4. ローカル検証

```powershell
signtool verify /pa /v Orchestra.exe
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
- **タグ名は必ず `product.json` の `voidVersion` と一致させ、かつ前回リリースより
  大きい値にしてください。** アップデート判定は単純な数値比較
  (`compareVersions`) なので、タグの採番系列を変えたり `voidVersion` の更新を
  忘れたりすると、実際にはアップデートが公開されていてもクライアント側で
  「アップデートあり」と判定されなくなり、通知が一切出なくなります
  (2026-08 に `v0.1.x` 系列のタグと `voidVersion: 1.4.9` が食い違い、この理由で
  全プラットフォームでアップデート検知が機能しなくなった実例あり)。

## トラブルシューティング

| 症状 | 対処 |
|------|------|
| `npm ci` が失敗 | `.nvmrc` の Node バージョンを確認。Python 3 が必要 |
| native modules のビルド失敗 (Windows) | `npm config set msvs_version 2022` などが必要な場合あり |
| Linux で `libsecret` 系エラー | `apt-get install libsecret-1-dev` を確認 |
| DMG 作成時にエラー | `hdiutil` が古い macOS ランナーで動かない可能性。`macos-14` 利用を確認 |
| Release が `latest` にならない | ドラフトのままになっていないか確認 |
