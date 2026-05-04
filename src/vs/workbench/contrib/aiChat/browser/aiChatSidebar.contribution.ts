/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * AI Chat Sidebar contribution.
 *
 * VS Code 系ワークベンチで View を登録するエントリポイント。
 * 既存のチャット拡張がある場合はこのファイルではなく、その拡張側の
 * View 描画関数から `mountAiChatSidebar` を呼び出す形でも利用可能。
 */

import { AiChatSidebarView, IAiChatTurnController } from './aiChatSidebarView.js';

export const AI_CHAT_VIEW_ID = 'workbench.view.aiChat.glass';

/**
 * 任意の HTMLElement にガラス風 AI チャットをマウントするユーティリティ。
 * 戻り値の view を介して dispose 等を制御できる。
 */
export function mountAiChatSidebar(container: HTMLElement): AiChatSidebarView {
	const view = new AiChatSidebarView({
		onSubmit: async (prompt: string, _controller: IAiChatTurnController) => {
			// 実際の送信処理は ChatService 等に委譲する想定。
			// ここではスタブとしてログ出力のみ。
			// eslint-disable-next-line no-console
			console.log('[ai-chat] send:', prompt);
		},
		onClear: () => {
			// eslint-disable-next-line no-console
			console.log('[ai-chat] clear');
		},
	});
	view.attach(container);
	return view;
}
