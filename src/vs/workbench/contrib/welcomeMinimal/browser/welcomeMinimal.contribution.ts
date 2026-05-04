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
