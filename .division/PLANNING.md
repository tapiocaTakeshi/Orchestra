## planner — 実装方針の確定: Orchestra UI/UX リファクタリング戦略

本ドキュメントは、Orchestra プロジェクトの既存コードベースと `file-searcher` の調査結果（推定含む）に基づき、UI/UXリファクタリングの具体的な実装ロードマップを策定したものです。

---

### 1. 既存環境分析と技術選定（調整版）
既存のアーキテクチャ（React + TypeScript を前提）に対し、破壊的変更を最小限に抑えつつモダンな UI/UX を導入します。

| 項目 | 既存想定 | 採用方針 | 移行・統合コスト |
| :--- | :--- | :--- | :--- |
| **Styling** | CSS Modules / SCSS | **Tailwind CSS 導入** | 低 (CSS Modules と併存可能) |
| **Component** | 独自定義UI | **Radix UI (Headless)** | 中 (既存UIをラップしつつ置換) |
| **State** | Redux (重厚) | **Zustand (UI状態専用)** | 低 (Reduxと共存可能) |
| **Layout** | コンポーネント混在 | **MainLayout コンテナ化** | 中 (全ページのルート置換が必要) |

---

### 2. アトミック・コンポーネント構造
`designer` が作成したモックアップを実装するため、以下のディレクトリ構造に再編します。

```text
src/
  components/
    ui/          # Radix UI + Tailwind でラップした基礎パーツ (Button, Input, Modal)
    layout/      # MainLayout, Sidebar, Topbar
    features/    # 画面ごとの有機的コンポーネント (Dashboard, EditorCard)
  store/         # UIの状態管理 (Zustand)
  hooks/         # Electron IPC を抽象化したフック
```

---

### 3. ロードマップとフェーズ別移行コスト

リファクタリングによる機能停滞を防ぐため、以下の順序で実装を進めます。

| フェーズ | 実装内容 | 移行リスク |
| :--- | :--- | :--- |
| **P1: 基盤準備** | Tailwind/Radixの導入、MainLayoutの共通化 | 低 |
| **P2: 共通UI整備** | Baseコンポーネント（Button, Input等）の実装 | 低 |
| **P3: 画面移行** | 既存画面の個別コンポーネント化とレイアウト適用 | 中 (デザイン修正が必要) |
| **P4: 状態/UX強化** | ZustandによるUI状態管理と通知(Toast)実装 | 低 |

---

### 4. 既存コードに対する実装ルール
`coder` が実装する際、以下の制約を遵守してください。

1.  **既存 CSS との分離:** 既存の `src/styles/*.css` はそのままに、新規UIは Tailwind クラスを用いて記述する。
2.  **IPC 通信の抽象化:** 既存の `window.api` (preload.js) を通じた IPC 通信は直接コンポーネントで呼ばず、`src/hooks/useElectron.ts` 等を作成してラップする。
3.  **状態管理の分離:** ビジネスロジック（データ取得等）は既存の Redux を維持し、画面の開閉や選択状態など「UI State」のみ `Zustand` に切り出す。

---

### 5. 移行リスクと対策
- **リスク:** 既存のデザイン崩れ
    - **対策:** 実装ごとに `Visual Regression Test` を実施する。まずはサイドバー等、影響範囲の小さい箇所から適用する。
- **リスク:** パフォーマンス低下
    - **対策:** 大規模リストを表示する場合、既存のテーブル実装を維持し、スタイルの上書きのみに留める。無理な仮想スクロール化は P4 以降とする。

---

### 次のアクション (coder への指示)
`coder` は、以下の順序で実装を開始してください。

1.  `tailwind.config.js` を作成し、プロジェクトに導入。
2.  `src/components/layout/MainLayout.tsx` を作成し、`designer` が提供した HTML モックアップの構造を React 化する。
3.  `src/components/ui/Button.tsx` (Radix UI) を作成し、デザインシステムの一部を実装する。

**coder は、まずは MainLayout の骨格と基礎コンポーネントの実装コードを提出してください。**