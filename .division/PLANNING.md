ご指摘を真摯に受け止め、前回失敗した「設計と実装の乖離」および「デザインの具体性欠如」を解消するため、実装フェーズに直結する具体的な計画を策定します。

本プランは、`SidebarChat.tsx` の機能的健全性を保ちつつ、UI を「Gallery (読みやすさ)」と「HUD (状態管理)」を融合させたデザインに昇華させるための設計書です。

---

# SidebarChat リファクタリングおよびUI刷新 実装設計案

## 1. コンセプトの再定義とデザイントークン
`ideaman` による「案2 (Gallery) + 案1 (HUD)」を採用し、以下のトーン＆マナーを既存の `void-*` トークンに適用します。

*   **Gallery (読みやすさ):** メッセージカードは `bg-void-bg-2` をベースに、薄い枠線で囲む。本文は prose 階層を遵守。
*   **HUD (状態管理):** ツールやフローの結果は左側にアクセントバー（`vscode-focusBorder`）を配し、右上のメタ領域で状態を一括表示する。
*   **新規ライブラリの導入判断:** 既存プロジェクトの安定性を最優先し、**`framer-motion` などの追加導入は行いません**。既存の CSS Transition と Tailwind の `transition-all` でマイクロインタラクションを実現します。

## 2. 実装アーキテクチャ設計 (コードの分離)

`SidebarChat.tsx` に集中していたロジックを以下の役割に分離します。各コンポーネントは `SidebarChat.tsx` を親として Props を受け取る関数コンポーネントとして実装します。

| ファイルパス | 責務 | 主なProps |
| :--- | :--- | :--- |
| `ChatBubble.tsx` | ユーザー/アシスタントの吹き出し生成 | `message`, `isEditing`, `onEdit` |
| `ToolHeaderWrapper.tsx` | ツール実行結果の展開/折りたたみ、状態表示 | `status`, `title`, `isOpen`, `onToggle` |
| `CommandBarInChat.tsx` | ファイル変更の統合管理パネル | `changes`, `onAcceptAll`, `onReject` |
| `ChatInputBox.tsx` | 入力欄とモデル選択、添付ファイルUI | `onSend`, `selectedFiles` |

## 3. 具体的なデザイン実装方針

### A. メッセージカードのカード化 (Gallery)
`ChatBubble.tsx` 内で以下を適用します。
```tsx
// ChatBubble.tsx のクラス設計方針
className="p-4 rounded-lg bg-void-bg-2 border border-void-border-1 shadow-sm hover:border-void-border-2 transition-colors"
```
*   アシスタント応答は、モデルラベル（上部）と本文（ProseWrapper）の間隔を `gap-2` で統一。
*   思考過程（Reasoning）がある場合は `ToolHeaderWrapper` の collapsible パターンを流用。

### B. ツール実行結果の HUD 化 (Status HUD)
`ToolHeaderWrapper.tsx` で、状態を明確にするためのレイアウトを固定します。
```tsx
// header 部分の flex レイアウト設計
<div className="flex items-center justify-between min-h-[28px] px-2 gap-2">
  <div className="flex items-center gap-2">
    <StatusIcon status={status} /> {/* 16px アイコン */}
    <span className="text-xs font-medium text-void-fg-1">{title}</span>
  </div>
  <div className="flex items-center gap-1">
    {/* メタ情報（件数・時間など） */}
    <Badge count={num} />
  </div>
</div>
```

## 4. 既存制約との適合性チェック

*   **VS Code Theme 変数:** すべての背景・境界線には `var(--void-*)` および `var(--vscode-*)` を使用します。ハードコードは行いません。
*   **状態管理:** `SidebarChat` が持つ `isRunning`, `isError` 等の State を、新コンポーネントの Props として流し込みます。Store 構造は変更せず、Presentational Component の分離のみに注力します。
*   **Accessibility:** すべてのクリック可能なヘッダーには `role="button"` を付与し、`onKeyDown` で Enter/Space をハンドリングしてアクセシビリティを確保します。

## 5. コーディング手順 (Coded のための詳細タスク)

実装担当の `coder` は以下の順序で作業を行ってください。

1.  **STEP 1: コンポーネント抽出**
    *   `SidebarChat.tsx` から `AssistantMessageComponent` 等の大きな塊を `components/` ディレクトリに分離します。
2.  **STEP 2: スタイルの共通化**
    *   `styles.ts` (新規) を作成し、カードのデザイン共通クラスを定義します。
    *   `const cardStyle = "bg-void-bg-2 border border-void-border-1 rounded-lg";`
3.  **STEP 3: 状態表示の統合**
    *   `ToolHeaderWrapper` を修正し、現状の「色のみの判定」を「アイコン＋テキスト＋色」の HUD パターンに置換します。
4.  **STEP 4: テスト**
    *   ツール実行時、エラー時、ストリーミング中の見た目が一貫しているかを確認します。

## 6. デザイナーへの指示事項
前回の欠落を補完するため、以下のスタイルをデザインのベースとしてください。

*   **アクセント線:** ツールカードの左端には必ず `2px` の border を設ける。
*   **余白:** コンポーネント内のパディングは最小 8px、最大 16px を基本とし、密度感を統一する。
*   **状態色:** 成功時: `var(--vscode-testing-iconPassed)` / エラー時: `var(--vscode-testing-iconFailed)` を積極的に使用する。

---

**後続タスクへの提案:**
この設計書に基づき、`coder` ロールはまず **`ToolHeaderWrapper.tsx` のリファクタリング** から着手してください。これにより、デザインシステムの「HUD パターン」を確立し、他のコンポーネントへ展開しやすくなります。