# Sidebar Chat — Modern Design (Prototype)

このディレクトリは Orchestra AI Sidebar Chat の **Modern 方針**デザインプロトタイプを保持します。

## ファイル

- `sidebar-chat.modern.html` — 実装の見た目を 1:1 で確認できる単体プロトタイプ（HTML/CSS のみ、外部依存なし）。
- `tokens.modern.css` — CSS カスタムプロパティ（カラー / タイポ / ラジアス）の SSOT。実装側は本ファイルを取り込み、`var(--bg-sidebar)` などで参照する。

## 方針サマリ

- **配色**: `#f9fafb`（app bg）／ `#ffffff`（sidebar）／ `#f3f4f6`（surface）。アクセントは `#0f172a`（slate-900）。
- **タイポ**: Inter / 13px ベース。Tool ラベルは 12px、Desc / Badge は 11px。
- **カード**: ユーザー発話は白カード + 12px ラジアス + ごく薄い 1px ボーダー（`--border-color`）。
- **アコーディオン**: Tool / Reasoning は chevron + 6px パディング。`open` で 90° 回転 & `tool-body` がスライドイン。
- **Command Bar**: 入力欄の上に貼り付き、左に変更ファイル数、右にコピー / 拒否 / 承認 / ステータスドット。
- **送信ボタン**: 28px 円形、白→灰のグラデーション + inset highlight。
- **アニメーション**: `pulse`（思考ドット）、`spin`（編集中スピナー）、`slideDown`（accordion）。

## 既存実装への適用ガイド（実装担当向け）

1. 既存の Sidebar スタイルシート（例: `src/vs/workbench/contrib/void/browser/react/src/styles.css` など実プロジェクトの該当ファイル）に `tokens.modern.css` の `:root` ブロックをマージする。
2. クラス命名は `sidebar` / `header` / `history` / `msg-user` / `msg-ai` / `tool-header` / `command-bar` / `input-wrapper` をそのまま採用するか、既存命名に合わせてマップする。
3. アコーディオン開閉・placeholder 切替は `sidebar-chat.modern.html` の `<script>` を React フック化して移植する。
