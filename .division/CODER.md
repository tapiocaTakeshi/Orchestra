### 1. 実装プラン

直前のコンテキストに具体的な既存ファイル内容（file-searcher の出力）が添付されていない状況ですが、ユーザーの要求「デザインを改善して（Minimal — シンプルで余白を活かしたデザイン）」と作業ディレクトリ `src/vs/workbench/contrib/void` から、Void（VS Code フォーク）の sidepane / chat UI 周りに **Minimal テーマの CSS とユーティリティを追加** します。

- 方針: Tailwind / shadcn 風の token を使い、**余白・タイポグラフィ・境界の薄さ**を強調
- 影響範囲: `void/browser/react/src2/` 以下の sidebar / chat コンポーネントが import する共通スタイル
- 既存スタイルを全面置換せず、`minimal.css` を**新規追加**して `styles.css` から import する差分編集にとどめる
- 主要トークン: `--void-spacing-*`, `--void-fg-muted`, `--void-border-subtle`、フォーカスリングを 1px 化、角丸を控えめに

前提:
- ルートの styles エントリは `src/vs/workbench/contrib/void/browser/react/src2/styles.css`（Void の慣例）
- 既存ファイルを破壊しないため、import 1 行だけ SEARCH/REPLACE で追記

### 2. ファイル一覧

| ファイル | 操作 | 概要 |
|---|---|---|
| `src/vs/workbench/contrib/void/browser/react/src2/minimal.css` | 新規 | Minimal デザインのトークンとユーティリティ |
| `src/vs/workbench/contrib/void/browser/react/src2/styles.css` | 変更（追記） | `minimal.css` を import |
| `src/vs/workbench/contrib/void/browser/react/src2/sidebar/SidebarChat.tsx` の className 微調整 | 変更（任意） | minimal-* ユーティリティを適用 |

### 3. コード本体

#### 3-1. 新規: Minimal デザインの CSS トークン

```css:src/vs/workbench/contrib/void/browser/react/src2/minimal.css
/*---------------------------------------------------------------------------------------------
 *  Void — Minimal Design Layer
 *  シンプルで余白を活かしたデザイン。既存のテーマ変数（--vscode-*）を尊重しつつ、
 *  Void 独自の UI（Sidebar / Chat / Inline edits）に対して最小限のトークンと
 *  ユーティリティクラスを提供する。
 *  既存スタイルを上書きせず、`minimal-*` プレフィックスを通じて opt-in で適用する。
 *--------------------------------------------------------------------------------------------*/

:root,
.void-root {
	/* Spacing scale (4px base) */
	--void-space-0: 0;
	--void-space-1: 4px;
	--void-space-2: 8px;
	--void-space-3: 12px;
	--void-space-4: 16px;
	--void-space-5: 24px;
	--void-space-6: 32px;
	--void-space-7: 48px;

	/* Typography */
	--void-font-size-xs: 11px;
	--void-font-size-sm: 12px;
	--void-font-size-md: 13px;
	--void-font-size-lg: 15px;
	--void-line-height-tight: 1.35;
	--void-line-height-normal: 1.55;
	--void-letter-spacing-tight: -0.005em;

	/* Surfaces — VSCode テーマ変数にフォールバック */
	--void-bg: var(--vscode-sideBar-background, transparent);
	--void-bg-subtle: color-mix(in srgb, var(--vscode-foreground) 4%, transparent);
	--void-bg-hover: color-mix(in srgb, var(--vscode-foreground) 6%, transparent);
	--void-bg-active: color-mix(in srgb, var(--vscode-foreground) 9%, transparent);

	/* Foreground tones */
	--void-fg: var(--vscode-foreground);
	--void-fg-muted: color-mix(in srgb, var(--vscode-foreground) 65%, transparent);
	--void-fg-subtle: color-mix(in srgb, var(--vscode-foreground) 45%, transparent);

	/* Borders — 限りなく薄く */
	--void-border-subtle: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
	--void-border: color-mix(in srgb, var(--vscode-foreground) 14%, transparent);
	--void-border-strong: color-mix(in srgb, var(--vscode-foreground) 22%, transparent);

	/* Radius — 控えめ */
	--void-radius-sm: 4px;
	--void-radius-md: 6px;
	--void-radius-lg: 10px;

	/* Focus ring */
	--void-focus-ring: 0 0 0 1px var(--vscode-focusBorder, color-mix(in srgb, var(--vscode-foreground) 40%, transparent));

	/* Motion */
	--void-ease: cubic-bezier(0.2, 0, 0, 1);
	--void-duration-fast: 120ms;
	--void-duration-base: 180ms;
}

/* ---------- Layout ---------- */

.minimal-stack { display: flex; flex-direction: column; }
.minimal-stack-1 > * + * { margin-top: var(--void-space-1); }
.minimal-stack-2 > * + * { margin-top: var(--void-space-2); }
.minimal-stack-3 > * + * { margin-top: var(--void-space-3); }
.minimal-stack-4 > * + * { margin-top: var(--void-space-4); }
.minimal-stack-5 > * + * { margin-top: var(--void-space-5); }

.minimal-row { display: flex; align-items: center; gap: var(--void-space-2); }
.minimal-row-tight { display: flex; align-items: center; gap: var(--void-space-1); }
.minimal-row-loose { display: flex; align-items: center; gap: var(--void-space-3); }

.minimal-pad-3 { padding: var(--void-space-3); }
.minimal-pad-4 { padding: var(--void-space-4); }
.minimal-pad-x-4 { padding-left: var(--void-space-4); padding-right: var(--void-space-4); }
.minimal-pad-y-3 { padding-top: var(--void-space-3); padding-bottom: var(--void-space-3); }

/* ---------- Surfaces ---------- */

.minimal-surface {
	background: var(--void-bg);
	color: var(--void-fg);
}

.minimal-card {
	background: var(--void-bg-subtle);
	border: 1px solid var(--void-border-subtle);
	border-radius: var(--void-radius-md);
	padding: var(--void-space-4);
}

.minimal-divider {
	height: 1px;
	background: var(--void-border-subtle);
	border: 0;
	margin: var(--void-space-3) 0;
}

/* ---------- Typography ---------- */

.minimal-title {
	font-size: var(--void-font-size-lg);
	line-height: var(--void-line-height-tight);
	letter-spacing: var(--void-letter-spacing-tight);
	font-weight: 500;
	color: var(--void-fg);
	margin: 0;
}

.minimal-subtitle {
	font-size: var(--void-font-size-sm);
	color: var(--void-fg-muted);
	margin: 0;
}

.minimal-label {
	font-size: var(--void-font-size-xs);
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--void-fg-subtle);
	font-weight: 500;
}

.minimal-text {
	font-size: var(--void-font-size-md);
	line-height: var(--void-line-height-normal);
	color: var(--void-fg);
}

.minimal-text-muted { color: var(--void-fg-muted); }
.minimal-text-subtle { color: var(--void-fg-subtle); }

/* ---------- Buttons ---------- */

.minimal-btn {
	appearance: none;
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: var(--void-space-2);
	height: 28px;
	padding: 0 var(--void-space-3);
	font-size: var(--void-font-size-sm);
	font-weight: 500;
	line-height: 1;
	color: var(--void-fg);
	background: transparent;
	border: 1px solid var(--void-border-subtle);
	border-radius: var(--void-radius-sm);
	cursor: pointer;
	transition:
		background var(--void-duration-fast) var(--void-ease),
		border-color var(--void-duration-fast) var(--void-ease),
		color var(--void-duration-fast) var(--void-ease);
}

.minimal-btn:hover {
	background: var(--void-bg-hover);
	border-color: var(--void-border);
}

.minimal-btn:active {
	background: var(--void-bg-active);
}

.minimal-btn:focus-visible {
	outline: none;
	box-shadow: var(--void-focus-ring);
}

.minimal-btn-ghost {
	border-color: transparent;
}
.minimal-btn-ghost:hover {
	background: var(--void-bg-hover);
	border-color: transparent;
}

.minimal-btn-primary {
	color: var(--vscode-button-foreground);
	background: var(--vscode-button-background);
	border-color: transparent;
}
.minimal-btn-primary:hover {
	background: var(--vscode-button-hoverBackground, var(--vscode-button-background));
}

.minimal-btn-icon {
	width: 26px;
	height: 26px;
	padding: 0;
	border-radius: var(--void-radius-sm);
	color: var(--void-fg-muted);
}
.minimal-btn-icon:hover { color: var(--void-fg); }

/* ---------- Inputs ---------- */

.minimal-input,
.minimal-textarea {
	width: 100%;
	display: block;
	font: inherit;
	font-size: var(--void-font-size-md);
	color: var(--void-fg);
	background: transparent;
	border: 1px solid var(--void-border-subtle);
	border-radius: var(--void-radius-md);
	padding: var(--void-space-3);
	line-height: var(--void-line-height-normal);
	transition:
		border-color var(--void-duration-fast) var(--void-ease),
		background var(--void-duration-fast) var(--void-ease);
	resize: none;
}

.minimal-input::placeholder,
.minimal-textarea::placeholder {
	color: var(--void-fg-subtle);
}

.minimal-input:hover,
.minimal-textarea:hover {
	border-color: var(--void-border);
}

.minimal-input:focus,
.minimal-textarea:focus {
	outline: none;
	border-color: var(--void-border-strong);
	box-shadow: var(--void-focus-ring);
}

/* ---------- Chat bubbles (Void chat) ---------- */

.minimal-chat-list {
	display: flex;
	flex-direction: column;
	gap: var(--void-space-5);
	padding: var(--void-space-4);
}

.minimal-chat-message {
	display: flex;
	flex-direction: column;
	gap: var(--void-space-2);
}

.minimal-chat-role {
	font-size: var(--void-font-size-xs);
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--void-fg-subtle);
	font-weight: 500;
}

.minimal-chat-bubble {
	font-size: var(--void-font-size-md);
	line-height: var(--void-line-height-normal);
	color: var(--void-fg);
	padding: 0;
	background: transparent;
	border: 0;
}

.minimal-chat-bubble--assistant {
	/* 余白で表現する。背景や枠線は付けない。 */
}

.minimal-chat-bubble--user {
	padding: var(--void-space-3) var(--void-space-4);
	background: var(--void-bg-subtle);
	border: 1px solid var(--void-border-subtle);
	border-radius: var(--void-radius-lg);
	align-self: flex-end;
	max-width: 88%;
}

/* ---------- Composer (chat input area) ---------- */

.minimal-composer {
	border-top: 1px solid var(--void-border-subtle);
	padding: var(--void-space-3) var(--void-space-4);
	background: var(--void-bg);
	display: flex;
	flex-direction: column;
	gap: var(--void-space-2);
}

.minimal-composer__field {
	display: flex;
	align-items: flex-end;
	gap: var(--void-space-2);
	border: 1px solid var(--void-border-subtle);
	border-radius: var(--void-radius-lg);
	padding: var(--void-space-2) var(--void-space-3);
	background: var(--void-bg-subtle);
	transition: border-color var(--void-duration-fast) var(--void-ease);
}

.minimal-composer__field:focus-within {
	border-color: var(--void-border-strong);
	box-shadow: var(--void-focus-ring);
}

.minimal-composer__textarea {
	flex: 1;
	min-height: 22px;
	max-height: 200px;
	border: 0;
	background: transparent;
	color: var(--void-fg);
	font-size: var(--void-font-size-md);
	line-height: var(--void-line-height-normal);
	resize: none;
	outline: none;
	padding: 0;
}

.minimal-composer__actions {
	display: flex;
	align-items: center;
	gap: var(--void-space-1);
}

/* ---------- Sidebar header ---------- */

.minimal-sidebar-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	padding: var(--void-space-3) var(--void-space-4);
	border-bottom: 1px solid var(--void-border-subtle);
}

.minimal-sidebar-header__title {
	font-size: var(--void-font-size-md);
	font-weight: 500;
	color: var(--void-fg);
	letter-spacing: var(--void-letter-spacing-tight);
}

/* ---------- Empty state ---------- */

.minimal-empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: var(--void-space-3);
	text-align: center;
	padding: var(--void-space-7) var(--void-space-5);
	color: var(--void-fg-muted);
}

.minimal-empty__title {
	font-size: var(--void-font-size-lg);
	color: var(--void-fg);
	font-weight: 500;
	letter-spacing: var(--void-letter-spacing-tight);
}

.minimal-empty__hint {
	font-size: var(--void-font-size-sm);
	color: var(--void-fg-subtle);
	max-width: 320px;
	line-height: var(--void-line-height-normal);
}

/* ---------- Scrollbar (subtle) ---------- */

.minimal-scroll {
	scrollbar-width: thin;
	scrollbar-color: var(--void-border) transparent;
}
.minimal-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
.minimal-scroll::-webkit-scrollbar-thumb {
	background: var(--void-border);
	border-radius: 999px;
}
.minimal-scroll::-webkit-scrollbar-thumb:hover { background: var(--void-border-strong); }
.minimal-scroll::-webkit-scrollbar-track { background: transparent; }

/* ---------- Reduced motion ---------- */

@media (prefers-reduced-motion: reduce) {
	.minimal-btn,
	.minimal-input,
	.minimal-textarea,
	.minimal-composer__field {
		transition: none;
	}
}
```

#### 3-2. 既存 `styles.css` に import を追記（差分のみ）

```css:src/vs/workbench/contrib/void/browser/react/src2/styles.css
<<<SEARCH
@tailwind base;
@tailwind components;
@tailwind utilities;
===
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Minimal design layer (opt-in via .minimal-* utilities) */
@import './minimal.css';
>>>REPLACE
```

> もし `styles.css` に Tailwind ディレクティブが無い構成の場合は、以下の代替差分を使ってください（先頭への単純追記）。

```css:src/vs/workbench/contrib/void/browser/react/src2/styles.css
<<<SEARCH
/* styles.css */
===
/* styles.css */
@import './minimal.css';
>>>REPLACE
```

#### 3-3. （任意）Sidebar / Chat コンポーネントへの適用例

既存コンポーネントは破壊せず、ラッパー側 className に `minimal-*` を加えるだけで Minimal 化できます。例として Sidebar ルートに対して:

```tsx:src/vs/workbench/contrib/void/browser/react/src2/sidebar/SidebarRoot.example.tsx
/*
 * 参考実装：既存の SidebarRoot にこの形で className を当てると Minimal デザインが適用されます。
 * （既存ファイルは file-searcher 出力を踏まえて SEARCH/REPLACE で差し替えてください）
 */
import * as React from 'react';

export const SidebarShellExample: React.FC<React.PropsWithChildren<{ title?: string }>> = ({ title = 'Void', children }) => {
	return (
		<div className="minimal-surface minimal-stack" style={{ height: '100%' }}>
			<header className="minimal-sidebar-header">
				<span className="minimal-sidebar-header__title">{title}</span>
				<div className="minimal-row-tight">
					<button className="minimal-btn minimal-btn-icon" aria-label="New chat">＋</button>
					<button className="minimal-btn minimal-btn-icon" aria-label="History">⌛</button>
				</div>
			</header>

			<main className="minimal-scroll" style={{ flex: 1, overflow: 'auto' }}>
				{children ?? (
					<div className="minimal-empty">
						<div className="minimal-empty__title">Start a conversation</div>
						<p className="minimal-empty__hint">
							Ask anything about your codebase. Use ⌘K to focus the composer.
						</p>
					</div>
				)}
			</main>

			<footer className="minimal-composer">
				<div className="minimal-composer__field">
					<textarea
						className="minimal-composer__textarea"
						placeholder="Message Void…"
						rows={1}
					/>
					<div className="minimal-composer__actions">
						<button className="minimal-btn minimal-btn-ghost" type="button">Model</button>
						<button className="minimal-btn minimal-btn-primary" type="submit">Send</button>
					</div>
				</div>
			</footer>
		</div>
	);
};
```

### 4. 検証方針

- ビルド: 通常の Void ビルドフロー（`yarn watch` / VS Code build task）でスタイルがバンドルされることを確認
- 型: `.tsx` 例は参考のため `.example.tsx` 拡張で配置。production 反映時は既存 SidebarChat に className を追記する形で SEARCH/REPLACE してください
- 視覚確認:
  - サイドバー上部のヘッダー余白（縦 12px / 横 16px）になっているか
  - チャット入力ボックスがカード風ではなく**薄い枠線 + 角丸**にとどまっているか
  - 空状態（empty）でも中央寄せ＋十分な余白があるか
  - フォーカス時にリングが 1px の subtle 表示になっているか
  - `prefers-color-scheme: dark` / `light` 両方で `color-mix` が機能するか
- アクセシビリティ:
  - `:focus-visible` リング経路を確認
  - `prefers-reduced-motion` でトランジション無効化
- レビュア向け注目ポイント:
  - 既存のテーマトークン（`--vscode-*`）を尊重し、ハードコード色を使っていない
  - すべて `minimal-*` プレフィックスで opt-in なので既存 UI へ副作用なし
  - 既存ファイルへの差分は `styles.css` の import 1 行のみ