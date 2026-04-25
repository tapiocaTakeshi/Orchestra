# Next.js + TypeScript + CSS Modules エラー修正ガイド

## 一般的なエラーと原因

Next.js プロジェクトで CSS Modules をインポートする際に型エラーが発生する主な原因は以下の通りです：

1. **型定義ファイルの欠落**：CSS Modules の型情報が TypeScript に認識されていない[1]
2. **tsconfig.json の不適切な設定**：型定義ファイルやモジュール宣言が includeに含まれていない[1][2]
3. **インポート方法の誤り**：named import（`import * as`）を使用している[1]

## 推奨される修正パターン

### パターン1：型定義ファイルの作成（推奨）

最も確実な解決方法は、**カスタム型定義ファイルを作成する**ことです[1]：

**1. `types/cssModule.d.ts` を作成**
```typescript
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
```

**2. `tsconfig.json` を更新**
```json
{
  "compilerOptions": {
    "typeRoots": ["./types", "./node_modules/@types"],
    "baseUrl": "."
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    "types"
  ]
}
```

**3. CSS Modules は default import で読み込む**[1]
```typescript
// ✅ 正しい書き方
import styles from './SidebarChat.module.css';
<div className={styles.className}></div>
```

```typescript
// ❌ 間違った書き方
import * as styles from './SidebarChat.module.css';
```

**4. IDE を再起動**[1]
- VSCode を完全に再起動、またはCtrl + Shift + P → `TypeScript: Restart TS Server` を実行

### パターン2：シンプルな型宣言

より簡潔な方法として、プロジェクトルートに型定義ファイルを作成する場合[2]：

```typescript
declare module "*.css";
declare module "*.scss";
```

その後、`tsconfig.json` の `include` にそのファイルを追加します。

### パターン3：自動生成ツール（SCSS/複数ファイル対応）

より厳密な型情報が必要な場合、`typed-css-modules` で .d.ts を自動生成できます[1]：

```bash
npm install --save-dev typed-css-modules
npx tcm '**/*.module.css' --watch
```

## あなたの場合の修正ステップ

| ステップ | 実行内容 |
|---------|---------|
| 1 | `types/cssModule.d.ts` を作成して型定義を追加 |
| 2 | `tsconfig.json` に `"typeRoots"` と `"include"` を設定 |
| 3 | インポート文が `import styles from './SidebarChat.module.css'` であることを確認 |
| 4 | VSCode/TS Server を再起動 |

現在のインポート方法は正しい形式です。エラー解消の鍵は**型定義ファイルの設定と IDE の再起動**にあります[1]。