/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// チャット欄で `/` から始めて打つコマンド。入力中の候補メニュー (react/src/util/inputs.tsx) の
// 一覧で、実際の解釈は browser/remoteSessionSyncService.ts の parseRemoteControlCommand が行う。
// 候補だけ増やして解釈を足し忘れると、送った文字がそのままモデルに渡るので、両方そろえること。

export type ChatSlashCommand = {
	/** 入力欄に補完される文字列 (`/` から始まる) */
	name: string;
	/** 候補に添える説明 */
	description: string;
};

export const CHAT_SLASH_COMMANDS: readonly ChatSlashCommand[] = [
	{ name: '/remote-control', description: 'このチャットを Orchestra Mobile と同期する' },
	{ name: '/remote-control off', description: 'Orchestra Mobile との同期をやめる' },
	{ name: '/remote-control status', description: '同期とサーバーの状態を表示する' },
];

/** 入力が `/` で始まる一行のときだけ、前方一致する候補を返す。それ以外は空 */
export const matchChatSlashCommands = (text: string): ChatSlashCommand[] => {
	if (!text.startsWith('/') || text.includes('\n')) return [];
	const query = text.trim().toLowerCase();
	return CHAT_SLASH_COMMANDS.filter(c => c.name.startsWith(query));
};
