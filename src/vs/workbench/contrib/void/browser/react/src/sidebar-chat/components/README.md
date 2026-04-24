# SidebarChat UX 改善コンポーネント

planner / designer / researcher の合意に基づく Phase 1〜2 実装。

## 構成

| コンポーネント | 担当 | 対応案 |
| --- | --- | --- |
| `ChatInput` | 統合入力欄。バリデーション + 送信前プレビュー + 状態階層化 | H1 / H2 / M5 / M6 |
| `DisableReason` | 送信不可理由のインライン表示（info/warning/error） | H1 |
| `SendPreviewModal` | 送信前プレビュー（Esc キャンセル / ⌘⏎ 確定） | H2 |
| `ToolCallBlock` | tool 結果の折りたたみ + 状態アイコン + 要約ラベル | H3 / M7 |
| `useSendValidation` | 送信可否ロジック（フック） | H1 |

## 既存 `SidebarChat` への差し込み例

