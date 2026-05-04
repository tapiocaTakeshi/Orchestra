# Sidebar Chat — Design Prototypes

このディレクトリには、Orchestra AI Sidebar Chat の UI デザインプロトタイプ（HTML 単体で表示確認可能）を配置します。

## 提供中のプロトタイプ

| ファイル | 方針 | 概要 |
| --- | --- | --- |
| [`sidebar-chat-modern.html`](./sidebar-chat-modern.html) | **Modern**（採用） | モダン / ミニマル。スレート＆ホワイトの中立パレット、極細ボーダー、ソフトシャドウ、12px 角丸。アクセントはステータスドットのみで使用。 |

## デザイントークン（Modern）

| Token | Value | 用途 |
| --- | --- | --- |
| `--bg-app` | `#f9fafb` | アプリ背景 |
| `--bg-sidebar` | `#ffffff` | サイドバー本体 |
| `--bg-surface` | `#f3f4f6` | カード／ホバー面 |
| `--text-primary` | `#111827` | 主要テキスト |
| `--text-secondary` | `#4b5563` | 補助テキスト |
| `--text-tertiary` | `#9ca3af` | プレースホルダ／アイコン |
| `--border-color` | `#e5e7eb` | 標準ボーダー |
| `--border-focus` | `#cbd5e1` | フォーカス／ホバー時 |
| `--accent-color` | `#0f172a` | 強調（最小限） |
| `--status-yellow` / `--status-green` / `--status-dark` | `#eab308` / `#22c55e` / `#6b7280` | ステータスドット |

## 含まれる UI セクション

1. **ヘッダー**: ログインボタン＋設定アイコン。下端は淡いグラデーションで境界をぼかす。
2. **チャット履歴**:
   - ユーザーメッセージ: 角丸 12px のホワイトカード＋ファイルバッジ＋hover 時に編集アイコン。
   - AI メッセージ: 思考／ツール実行を chevron 付きアコーディオンで折りたたみ、ストリーミング中はパルスドット＋スピナーで状態提示。
3. **コマンドバー**: 入力欄上部に変更ファイル数・コピー/拒否/承認・ステータスドットを集約。
4. **入力欄**: contenteditable のリッチ入力＋モデルドロップダウン＋添付＋丸型送信ボタン。フォーカス時は影付きフォーカスリング。

## 確認方法

ブラウザで `prototypes/sidebar-chat-modern.html` を直接開いてください（外部依存なし）。
