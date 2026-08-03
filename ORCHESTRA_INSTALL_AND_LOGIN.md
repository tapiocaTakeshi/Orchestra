# Orchestra インストール・ログインガイド

## 概要

このドキュメントは、**division.he-ro.jp からのOrchestraインストール**と**ログイン機能**について説明します。

## インストール・ログインフロー

### 1. Webサイトからのインストール

ユーザーが **https://division.he-ro.jp** から Orchestra をダウンロード・インストールすると、以下のフローが実行されます：

```
Division.he-ro.jp
    ↓
[ダウンロードリンク]
    ↓
Orchestra アプリのインストール
    ↓
初回起動時の検出
```

### 2. 初回起動時のオンボーディング

Orchestra が初回起動時に以下を自動検出します：

- **インストール状態**: 初回インストール/既存ユーザー
- **インストール元**: division.he-ro.jp / 手動 / 不明
- **インストール日時**: タイムスタンプを記録
- **バージョン情報**: アプリバージョンを記録

検出されたら、**オンボーディング画面**を表示します：

```tsx
<OnboardingFlow onComplete={handleOnboardingComplete} />
```

### 3. ログイン画面

オンボーディング完了後、ユーザーは Division アカウントでログインします：

```tsx
<LoginScreen onClose={onClose} />
```

ログイン画面では以下が可能です：

- **ログイン**: 既存の Division アカウントでサインイン
- **新規登録**: 新しい Division アカウントを作成
- **Plus プラン**: 自動的に Division API キーが設定される

### 4. インストール情報の報告

ログイン後、インストール情報を Division API に通知します：

```typescript
await reportInstallationToDivision(userId, accessToken, installationInfo);
```

## 実装仕様

### ファイル構成

```
src/vs/workbench/contrib/void/browser/react/src/void-login-tsx/
├── installationFlow.ts           # インストール状態管理
├── useInstallationDetection.ts   # インストール検出フック
├── OnboardingFlow.tsx            # オンボーディング UI
├── AuthenticationManager.tsx     # 認証フロー管理
├── LoginScreen.tsx               # ログイン UI (既存)
└── divisionAuth.ts              # Division 認証 (既存)

supabase/functions/
├── report-installation/index.ts  # インストール報告エンドポイント
└── _shared/cors.ts              # CORS設定

ORCHESTRA_INSTALL_AND_LOGIN.md    # このファイル
```

### インストール情報（データ構造）

```typescript
export interface InstallationInfo {
	isFirstLaunch: boolean;        // 初回起動か
	installationSource: 'division-website' | 'manual' | 'unknown';  // インストール元
	installationTimestamp: number;  // インストール日時
	installationVersion: string;    // アプリバージョン
}
```

### URLパラメータ対応

Webサイトからインストールする際、以下のURLパラメータに対応します：

```
orchestra://app?installSource=division-website&installVersion=1.0.0
```

或いは、アプリ起動時に以下のパラメータを検出：

- `?installSource=division-website` - Division.he-ro.jp からのインストール
- `?installSource=manual` - 手動インストール
- デフォルト: `unknown`

### ローカルストレージ

インストール情報はブラウザのローカルストレージに保存されます：

```javascript
localStorage.getItem('division:installationState')
```

## Division API 連携

### インストール報告エンドポイント

**POST** `/api/installations`

```json
{
	"userId": "user-id-here",
	"source": "division-website",
	"timestamp": 1722595200000,
	"version": "1.0.0"
}
```

**ヘッダー**:
- `Authorization: Bearer {accessToken}`
- `Content-Type: application/json`

**レスポンス**:
```json
{
	"success": true,
	"message": "Installation reported successfully"
}
```

## 使用例

### アプリケーション初期化時

```tsx
import { AuthenticationManager } from './void-login-tsx/AuthenticationManager.js';

export function App() {
	return (
		<>
			<AuthenticationManager onAuthenticationComplete={() => {
				// 認証完了後の処理
				console.log('User authenticated');
			}} />
		</>
	);
}
```

### インストール情報の取得

```typescript
import { getInstallationInfo } from './installationFlow.js';

const info = getInstallationInfo();
if (info?.installationSource === 'division-website') {
	console.log('Installed from division.he-ro.jp');
}
```

### インストール完了の報告

```typescript
import { reportInstallationToDivision } from './installationFlow.js';

await reportInstallationToDivision(userId, accessToken, installationInfo);
```

## セキュリティ考慮事項

1. **トークン管理**: Division API キーは Plus プランユーザーのみ自動設定
2. **CORS対応**: Supabase Edge Functions で CORS ヘッダーを適切に設定
3. **認証**: すべての API エンドポイントは Bearer トークン認証が必須
4. **ローカルストレージ**: インストール情報のみ保存し、トークンは保存しない

## トラブルシューティング

### インストール情報が検出されない

- ブラウザのキャッシュをクリア
- ローカルストレージをリセット: `localStorage.removeItem('division:installationState')`
- URLパラメータを確認: `?installSource=division-website` が含まれているか確認

### ログインに失敗する

- Supabase の接続設定を確認
- Division API キーの有効性を確認
- ネットワーク接続を確認

### Plus プランの自動設定が動作しない

- ユーザーのプランを確認: `DIVISION_PROFILES_TABLE` で `plan` が `'plus'` か確認
- Division API キーの作成エンドポイントの応答を確認

## 今後の拡張

- [ ] インストール統計ダッシュボード
- [ ] インストール元別の分析
- [ ] 自動更新との連携
- [ ] オフラインインストール対応
- [ ] 複数言語対応（日本語以外）

---

**作成日**: 2025-08-03  
**バージョン**: 1.0.0  
**著作権**: He-ro Corporation
