### 1. 実装プラン

ユーザー要求は「designを改善して」（Minimal / Electron）。VS Code (Electron) ベースのワークスペースに既存の Electron デスクトップアプリがあるため、**ミニマルデザインのウェルカム/スタートアップ画面**を Electron アプリ内に追加する形で改善します。

具体的には:
- Electron のレンダラ用に、シンプルで余白を活かしたミニマルなウェルカム画面（HTML + CSS）を新規作成
- 既存の `defaultExtensionsInitializer.ts` には触らず（ロジック層なのでデザインと無関係）、UI レイヤのみを追加
- 既存 `language-configuration.json` の動作には影響を与えない
- システムフォント・余白・モノクロ基調・最小限のアクセントカラーで「Minimal」テーマを表現

影響範囲:
- 新規: `src/vs/workbench/contrib/welcomeMinimal/browser/media/welcomeMinimal.css`
- 新規: `src/vs/workbench/contrib/welcomeMinimal/browser/media/welcomeMinimal.html`
- 新規: `src/vs/workbench/contrib/welcomeMinimal/browser/welcomeMinimal.contribution.ts`（最小限のコントリビューション）

既存の3ファイルは UI/デザインに関するファイルではない（言語設定 JSON、ドキュメントコンテキスト解決ロジック、拡張初期化ロジック）ため、デザイン改善とは関連性が低く、編集対象外とします。

### 2. ファイル一覧

| ファイル | 操作 | 概要 |
|---|---|---|
| `src/vs/workbench/contrib/welcomeMinimal/browser/media/welcomeMinimal.css` | 新規 | ミニマルデザインのスタイル |
| `src/vs/workbench/contrib/welcomeMinimal/browser/media/welcomeMinimal.html` | 新規 | ウェルカム画面のマークアップ |
| `src/vs/workbench/contrib/welcomeMinimal/browser/welcomeMinimal.contribution.ts` | 新規 | レンダラから読み込むエントリ |

### 3. コード本体

```css:src/vs/workbench/contrib/welcomeMinimal/browser/media/welcomeMinimal.css
/*---------------------------------------------------------------------------------------------
 *  Minimal Welcome — シンプルで余白を活かしたデザイン
 *--------------------------------------------------------------------------------------------*/

:root {
	--minimal-bg: var(--vscode-editor-background, #ffffff);
	--minimal-fg: var(--vscode-foreground, #1a1a1a);
	--minimal-muted: var(--vscode-descriptionForeground, #6b6b6b);
	--minimal-accent: var(--vscode-textLink-foreground, #0a66c2);
	--minimal-border: var(--vscode-panel-border, rgba(0, 0, 0, 0.08));
	--minimal-hover: var(--vscode-list-hoverBackground, rgba(0, 0, 0, 0.04));
	--minimal-radius: 6px;
	--minimal-space-xs: 6px;
	--minimal-space-sm: 12px;
	--minimal-space-md: 24px;
	--minimal-space-lg: 48px;
	--minimal-space-xl: 96px;
	--minimal-font:
		-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue",
		"Hiragino Sans", "Yu Gothic UI", Meiryo, system-ui, sans-serif;
}

.welcome-minimal {
	box-sizing: border-box;
	min-height: 100vh;
	margin: 0;
	padding: var(--minimal-space-xl) var(--minimal-space-lg);
	background: var(--minimal-bg);
	color: var(--minimal-fg);
	font-family: var(--minimal-font);
	font-size: 14px;
	line-height: 1.7;
	-webkit-font-smoothing: antialiased;
	display: flex;
	justify-content: center;
}

.welcome-minimal *,
.welcome-minimal *::before,
.welcome-minimal *::after {
	box-sizing: inherit;
}

.welcome-minimal__container {
	width: 100%;
	max-width: 720px;
}

/* --- Header --- */

.welcome-minimal__header {
	margin-bottom: var(--minimal-space-xl);
}

.welcome-minimal__eyebrow {
	font-size: 12px;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: var(--minimal-muted);
	margin: 0 0 var(--minimal-space-sm);
}

.welcome-minimal__title {
	font-size: 32px;
	font-weight: 300;
	letter-spacing: -0.02em;
	margin: 0 0 var(--minimal-space-sm);
	color: var(--minimal-fg);
}

.welcome-minimal__subtitle {
	font-size: 16px;
	font-weight: 400;
	color: var(--minimal-muted);
	margin: 0;
	max-width: 56ch;
}

/* --- Sections --- */

.welcome-minimal__section {
	margin-bottom: var(--minimal-space-lg);
}

.welcome-minimal__section-title {
	font-size: 13px;
	font-weight: 500;
	letter-spacing: 0.04em;
	text-transform: uppercase;
	color: var(--minimal-muted);
	margin: 0 0 var(--minimal-space-md);
	padding-bottom: var(--minimal-space-xs);
	border-bottom: 1px solid var(--minimal-border);
}

/* --- Action list --- */

.welcome-minimal__list {
	list-style: none;
	margin: 0;
	padding: 0;
}

.welcome-minimal__item {
	margin: 0;
	padding: 0;
}

.welcome-minimal__action {
	display: flex;
	align-items: baseline;
	gap: var(--minimal-space-md);
	width: 100%;
	padding: var(--minimal-space-sm) var(--minimal-space-xs);
	background: transparent;
	border: 0;
	border-radius: var(--minimal-radius);
	color: inherit;
	font: inherit;
	text-align: left;
	text-decoration: none;
	cursor: pointer;
	transition: background-color 120ms ease;
}

.welcome-minimal__action:hover,
.welcome-minimal__action:focus-visible {
	background-color: var(--minimal-hover);
	outline: none;
}

.welcome-minimal__action-label {
	flex: 1;
	font-size: 15px;
	color: var(--minimal-fg);
}

.welcome-minimal__action-shortcut {
	font-family: var(--vscode-editor-font-family, "SF Mono", Menlo, Consolas, monospace);
	font-size: 12px;
	color: var(--minimal-muted);
}

.welcome-minimal__action-arrow {
	color: var(--minimal-muted);
	transition: transform 160ms ease, color 160ms ease;
}

.welcome-minimal__action:hover .welcome-minimal__action-arrow {
	color: var(--minimal-accent);
	transform: translateX(2px);
}

/* --- Recents --- */

.welcome-minimal__recent {
	display: flex;
	align-items: baseline;
	gap: var(--minimal-space-md);
	padding: var(--minimal-space-xs) var(--minimal-space-xs);
	color: var(--minimal-fg);
	text-decoration: none;
	border-radius: var(--minimal-radius);
}

.welcome-minimal__recent:hover {
	background-color: var(--minimal-hover);
}

.welcome-minimal__recent-name {
	font-size: 14px;
}

.welcome-minimal__recent-path {
	font-size: 12px;
	color: var(--minimal-muted);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

/* --- Footer --- */

.welcome-minimal__footer {
	margin-top: var(--minimal-space-xl);
	padding-top: var(--minimal-space-md);
	border-top: 1px solid var(--minimal-border);
	display: flex;
	justify-content: space-between;
	align-items: center;
	font-size: 12px;
	color: var(--minimal-muted);
}

.welcome-minimal__checkbox {
	display: inline-flex;
	align-items: center;
	gap: var(--minimal-space-xs);
	cursor: pointer;
	user-select: none;
}

.welcome-minimal__checkbox input {
	accent-color: var(--minimal-accent);
}

/* --- Responsive --- */

@media (max-width: 600px) {
	.welcome-minimal {
		padding: var(--minimal-space-lg) var(--minimal-space-md);
	}

	.welcome-minimal__title {
		font-size: 26px;
	}

	.welcome-minimal__header {
		margin-bottom: var(--minimal-space-lg);
	}

	.welcome-minimal__action-shortcut {
		display: none;
	}
}

/* --- Reduced motion --- */

@media (prefers-reduced-motion: reduce) {
	.welcome-minimal__action,
	.welcome-minimal__action-arrow {
		transition: none;
	}
}
```

```html:src/vs/workbench/contrib/welcomeMinimal/browser/media/welcomeMinimal.html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Welcome</title>
	<link rel="stylesheet" href="./welcomeMinimal.css" />
</head>
<body class="welcome-minimal">
	<main class="welcome-minimal__container" role="main">
		<header class="welcome-minimal__header">
			<p class="welcome-minimal__eyebrow">Welcome</p>
			<h1 class="welcome-minimal__title">Start something new.</h1>
			<p class="welcome-minimal__subtitle">
				A quiet space to write code. Fewer buttons, more focus.
			</p>
		</header>

		<section class="welcome-minimal__section" aria-labelledby="start-heading">
			<h2 id="start-heading" class="welcome-minimal__section-title">Start</h2>
			<ul class="welcome-minimal__list">
				<li class="welcome-minimal__item">
					<button type="button" class="welcome-minimal__action" data-command="workbench.action.files.newUntitledFile">
						<span class="welcome-minimal__action-label">New file</span>
						<span class="welcome-minimal__action-shortcut">⌘ N</span>
						<span class="welcome-minimal__action-arrow" aria-hidden="true">→</span>
					</button>
				</li>
				<li class="welcome-minimal__item">
					<button type="button" class="welcome-minimal__action" data-command="workbench.action.files.openFile">
						<span class="welcome-minimal__action-label">Open file…</span>
						<span class="welcome-minimal__action-shortcut">⌘ O</span>
						<span class="welcome-minimal__action-arrow" aria-hidden="true">→</span>
					</button>
				</li>
				<li class="welcome-minimal__item">
					<button type="button" class="welcome-minimal__action" data-command="workbench.action.files.openFolder">
						<span class="welcome-minimal__action-label">Open folder…</span>
						<span class="welcome-minimal__action-shortcut">⌘ K ⌘ O</span>
						<span class="welcome-minimal__action-arrow" aria-hidden="true">→</span>
					</button>
				</li>
				<li class="welcome-minimal__item">
					<button type="button" class="welcome-minimal__action" data-command="git.clone">
						<span class="welcome-minimal__action-label">Clone repository…</span>
						<span class="welcome-minimal__action-shortcut"></span>
						<span class="welcome-minimal__action-arrow" aria-hidden="true">→</span>
					</button>
				</li>
			</ul>
		</section>

		<section class="welcome-minimal__section" aria-labelledby="recent-heading">
			<h2 id="recent-heading" class="welcome-minimal__section-title">Recent</h2>
			<ul class="welcome-minimal__list" id="welcome-recent-list">
				<li class="welcome-minimal__item">
					<a class="welcome-minimal__recent" href="#" data-command="workbench.action.openRecent">
						<span class="welcome-minimal__recent-name">No recent folders</span>
						<span class="welcome-minimal__recent-path"></span>
					</a>
				</li>
			</ul>
		</section>

		<footer class="welcome-minimal__footer">
			<label class="welcome-minimal__checkbox">
				<input type="checkbox" id="welcome-show-on-startup" checked />
				<span>Show on startup</span>
			</label>
			<span>Minimal</span>
		</footer>
	</main>

	<script>
		(function () {
			'use strict';
			// Bridge clicks to the host (Electron / VS Code command service) when available.
			const post = (command) => {
				try {
					if (typeof acquireVsCodeApi === 'function') {
						const vscode = window.__vscode || (window.__vscode = acquireVsCodeApi());
						vscode.postMessage({ type: 'command', command });
						return;
					}
				} catch (_) { /* ignore */ }
				if (window.parent && window.parent !== window) {
					window.parent.postMessage({ type: 'command', command }, '*');
				}
			};

			document.querySelectorAll('[data-command]').forEach((el) => {
				el.addEventListener('click', (e) => {
					const cmd = el.getAttribute('data-command');
					if (!cmd) return;
					e.preventDefault();
					post(cmd);
				});
			});

			const checkbox = document.getElementById('welcome-show-on-startup');
			if (checkbox) {
				checkbox.addEventListener('change', () => {
					post(checkbox.checked
						? 'welcome.showOnStartup.enable'
						: 'welcome.showOnStartup.disable');
				});
			}
		})();
	</script>
</body>
</html>
```

```ts:src/vs/workbench/contrib/welcomeMinimal/browser/welcomeMinimal.contribution.ts
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Minimal Welcome contribution.
 *
 * このモジュールは、シンプルで余白を活かした「Minimal」テーマのウェルカム画面を
 * Electron 上の VS Code レンダラに登録するためのエントリポイントです。
 * UI 本体は同ディレクトリの `media/welcomeMinimal.html` / `welcomeMinimal.css` に
 * 切り出されており、ここでは識別子・タイトル・メディアパスのみを公開します。
 *
 * 既存の Welcome / GettingStarted コントリビューションには手を入れず、追加ビューとして
 * 共存できるよう薄く保っています。実際にメニュー / コマンドへバインドする際は、
 * 利用側のレジストリからこの定義を import してください。
 */

export const WELCOME_MINIMAL_VIEW_ID = 'workbench.view.welcomeMinimal';
export const WELCOME_MINIMAL_TITLE = 'Welcome';

/**
 * メディア（HTML / CSS）への相対パス。
 * Electron のレンダラから `vscode-file://` プロトコル等で解決される想定。
 */
export const WelcomeMinimalMedia = Object.freeze({
	html: 'vs/workbench/contrib/welcomeMinimal/browser/media/welcomeMinimal.html',
	css: 'vs/workbench/contrib/welcomeMinimal/browser/media/welcomeMinimal.css',
});

/**
 * ホスト（コマンドサービス）へ転送可能なコマンド ID の一覧。
 * HTML 側の `data-command` 属性と一致させてください。
 */
export const WelcomeMinimalCommands = Object.freeze([
	'workbench.action.files.newUntitledFile',
	'workbench.action.files.openFile',
	'workbench.action.files.openFolder',
	'git.clone',
	'workbench.action.openRecent',
	'welcome.showOnStartup.enable',
	'welcome.showOnStartup.disable',
] as const);

export type WelcomeMinimalCommand = typeof WelcomeMinimalCommands[number];

/**
 * レンダラ側 (`postMessage`) から受け取るメッセージ型。
 */
export interface WelcomeMinimalMessage {
	readonly type: 'command';
	readonly command: WelcomeMinimalCommand | string;
}

/**
 * メッセージのバリデータ。レンダラから到達した不明なコマンドを弾く際に利用します。
 */
export function isWelcomeMinimalMessage(value: unknown): value is WelcomeMinimalMessage {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const v = value as Partial<WelcomeMinimalMessage>;
	return v.type === 'command' && typeof v.command === 'string' && v.command.length > 0;
}
```

### 4. 検証方針

- **ビルド**: 既存の VS Code (Electron) のビルドフローに新規ファイルが取り込まれることを確認（`npm run compile` 相当）。
- **型チェック**: `welcomeMinimal.contribution.ts` は外部依存ゼロのため、TypeScript の `strict` モードでもエラーが出ないこと。
- **手動確認**:
  1. `welcomeMinimal.html` をブラウザ / Electron のレンダラで直接開き、レイアウト（中央寄せ・最大幅 720px・大きな余白）が機能することを確認。
  2. 各アクションボタンをクリックして、`postMessage` が `{ type: 'command', command: ... }` の形でホストに飛ぶことを DevTools で確認。
  3. ライト/ダーク両テーマで `--vscode-*` 変数にフォールバックされ、文字色・背景色が崩れないことを確認。
  4. 600px 以下で余白とフォントサイズが縮み、ショートカット表示が消えるレスポンシブ動作を確認。
- **注目ポイント**:
  - 既存 3 ファイル（`language-configuration.json` / `documentContext.ts` / `defaultExtensionsInitializer.ts`）はデザインと無関係なため未変更。
  - カラーは独自 16 進値ではなく `--vscode-*` トークンを優先利用しており、既存テーマと整合します。
  - HTML 側は `acquireVsCodeApi` が存在する場合のみ使い、無い環境では `window.parent.postMessage` にフォールバックするため、開発時のスタンドアロン確認も容易です。