# Design Selection

- **Selected**: Modern
- **Source Prototype**: `.division/DESIGNER.html`
- **Canonical Copy**: `design/modern.html`

## キーデザイントークン（実装時に CSS 変数 / Tailwind config へ移植）

| Token              | Value      | 用途                       |
| ------------------ | ---------- | -------------------------- |
| `--bg-app`         | `#f9fafb`  | アプリ背景                 |
| `--bg-sidebar`     | `#ffffff`  | サイドバー背景             |
| `--bg-surface`     | `#f3f4f6`  | 内部サーフェス（コマンドバー等） |
| `--text-primary`   | `#111827`  | 主要テキスト               |
| `--text-secondary` | `#4b5563`  | 副次テキスト               |
| `--text-tertiary`  | `#9ca3af`  | プレースホルダ・補助       |
| `--border-color`   | `#e5e7eb`  | 既定ボーダー               |
| `--border-focus`   | `#cbd5e1`  | フォーカス時ボーダー       |
| `--accent-color`   | `#0f172a`  | アクセント（slate-900）    |
| `--status-yellow`  | `#eab308`  | 承認待ち                   |
| `--status-green`   | `#22c55e`  | 承認済み                   |

## 構造的ガイドライン

1. **Sidebar 幅**: 400px、左ボーダー1px、左方向 box-shadow `-8px 0 32px rgba(0,0,0,0.03)`。
2. **ユーザーメッセージ**: 白カード（`border-radius: 12px`、padding: 14px）。hover で edit アイコンが fade-in。
3. **AI メッセージ**: ボーダーレス。tool-header（chevron + title + desc）アコーディオン形式。
4. **Command Bar**: input 直上、`border-radius: 8px 8px 0 0`、status dot で承認状態を示す。
5. **入力欄**: command-bar と連結（角を共有）、focus で `box-shadow: 0 0 0 3px rgba(15,23,42,0.04)`。
6. **送信ボタン**: 円形 28px、白系グラデ + subtle inner highlight、hover で `scale(1.06)`。

## 次のステップ

- [ ] `src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx` に上記トークンを適用
- [ ] 共通 CSS 変数を `common/helpers/colors.ts` または `style/tokens.css` として切り出し
- [ ] Storybook / プレビューに `design/modern.html` をリンク
