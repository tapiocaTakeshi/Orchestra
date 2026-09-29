/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Orchestra Mobile リモートコントロールのプロトコル。
//
// LAN の HTTP サーバはメインプロセス (vs/code/electron-main/orchestraMobileRemoteControl.ts)
// が持ち、トークンとアカウントの確認を済ませたリクエストだけを IPC でワークベンチへ渡す。
// ワークベンチ側 (electron-sandbox/remoteControl.contribution.ts) がチャット・カンバン・
// Division などのサービスを実際に操作して応答を返す。
//
// モバイル側の `src/api/types.ts` はこのファイルに対応する。形を変えたら
// PROTOCOL_VERSION を上げ、モバイル側も合わせること。

export const REMOTE_CONTROL_PROTOCOL_VERSION = 1;

/** vs/code 側からはこのファイルを import できないので、同じ文字列を向こうにも書いてある */
export const REMOTE_CONTROL_IPC_READY = 'vscode:orchestraRemote:ready';
export const REMOTE_CONTROL_IPC_REQUEST = 'vscode:orchestraRemote:request';
export const REMOTE_CONTROL_IPC_RESPONSE = 'vscode:orchestraRemote:response';

export type RemoteControlHttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** メイン → ワークベンチ */
export type RemoteControlIpcRequest = {
	id: string;
	method: RemoteControlHttpMethod;
	path: string;
	query: Record<string, string>;
	body: unknown;
};

/** ワークベンチ → メイン */
export type RemoteControlIpcResponse = {
	id: string;
	status: number;
	body: unknown;
};

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

export const REMOTE_CONTROL_SETTING_ALLOW_CHAT = 'orchestra.remoteControl.allowChat';
export const REMOTE_CONTROL_SETTING_ALLOW_KANBAN_EDIT = 'orchestra.remoteControl.allowKanbanEdit';
export const REMOTE_CONTROL_SETTING_ALLOW_PROJECT_EDIT = 'orchestra.remoteControl.allowProjectEdit';
export const REMOTE_CONTROL_SETTING_ALLOW_COMMANDS = 'orchestra.remoteControl.allowCommands';

// ---------------------------------------------------------------------------
// レスポンスの形 (モバイルの src/api/types.ts と同じ)
// ---------------------------------------------------------------------------

export type RemoteIdeInfo = {
	protocolVersion: number;
	appName: string;
	version: string;
	workspaceName: string;
	workspaceFolders: string[];
	uiLanguage: string;
};

export type RemoteChatMessage = {
	role: 'user' | 'assistant' | 'tool' | 'system' | 'checkpoint' | 'interrupted';
	text: string;
	toolName?: string;
};

export type RemoteChatState = {
	threadId: string;
	messages: RemoteChatMessage[];
	isRunning: boolean;
	awaitingApproval: boolean;
	error?: string;
};

export type RemoteThreadSummary = {
	threadId: string;
	title: string;
	lastModified: string;
	messageCount: number;
};

export type RemoteDivisionProject = {
	projectId: string;
	name: string;
	agents: { role: string; provider: string; model: string }[];
	isActive: boolean;
};

export type RemoteDivisionState = {
	projects: RemoteDivisionProject[];
	activeProjectIds: string[];
	configPath: string | null;
	hasProject: boolean;
};

export type RemoteFileEntry = {
	name: string;
	isDirectory: boolean;
	/** ワークスペースルートからの相対パス ('/' 区切り) */
	path: string;
};
