/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Orchestra リモートコントロール (スマホアプリ Orchestra-Mobile から IDE を操作する) の
// 共有型定義。
//
// 構成:
//   [Orchestra-Mobile (React Native)]
//        │  HTTP + JSON (Bearer token)
//        ▼
//   [electron-main: remoteControlChannel.ts]   ← HTTP サーバはここ (Node が要る)
//        │  IPC (onRequest / respond)
//        ▼
//   [workbench: remoteControlService.ts]       ← ルーティングと実処理はここ
//                                                 (kanbanService / divisionProjectService /
//                                                  chatThreadService はレンダラ側にしか無いため)
//
// main 側は「HTTP を JSON の封筒に詰め替えて渡すだけ」の薄いプロキシに徹する。
// エンドポイントを増やすときに触るのは remoteControlService.ts だけで済む。

// ---------------------------------------------------------------------------
// プロトコル
// ---------------------------------------------------------------------------

/** 互換性チェック用。モバイル側と数値が合わない場合は警告を出す。 */
export const REMOTE_CONTROL_PROTOCOL_VERSION = 1;

export const REMOTE_CONTROL_CHANNEL = 'void-channel-remote-control';

export const REMOTE_CONTROL_DEFAULT_PORT = 39231;

/** 認証ヘッダ。`Authorization: Bearer <token>` でも受ける。 */
export const REMOTE_CONTROL_TOKEN_HEADER = 'x-orchestra-token';

/** レンダラが応答を返すまでの猶予。超えたら 504 を返す。 */
export const REMOTE_CONTROL_REQUEST_TIMEOUT_MS = 60_000;

/** リクエストボディの上限 (バイト)。 */
export const REMOTE_CONTROL_MAX_BODY_BYTES = 2 * 1024 * 1024;

/** main → renderer に流れるリクエスト。 */
export type RemoteControlRequest = {
	/** 応答を紐づけるための ID */
	requestId: string;
	/** start() を呼んだウィンドウの ID。他ウィンドウはこれを見て無視する */
	ownerId: string;
	method: string;
	/** '/api/kanban/tasks' のようなパス (クエリは含まない) */
	path: string;
	query: Record<string, string>;
	/** JSON としてパースできた場合のみ値が入る */
	body: unknown;
};

/** renderer → main に返す応答。 */
export type RemoteControlResponse = {
	requestId: string;
	status: number;
	body: unknown;
};

export type RemoteControlStartOptions = {
	ownerId: string;
	port: number;
	token: string;
	/** true なら 0.0.0.0 で待ち受ける (同一 LAN のスマホから繋げる) */
	allowLan: boolean;
};

export type RemoteControlServerStatus = {
	running: boolean;
	port: number;
	/** 接続先候補の URL 一覧 (LAN IP を含む) */
	addresses: string[];
	ownerId: string | null;
	/** 直近の起動エラー (ポート使用中など) */
	error?: string;
};

export const emptyRemoteControlStatus = (): RemoteControlServerStatus => ({
	running: false,
	port: REMOTE_CONTROL_DEFAULT_PORT,
	addresses: [],
	ownerId: null,
});

// ---------------------------------------------------------------------------
// 設定 (GlobalSettings.remoteControl)
// ---------------------------------------------------------------------------

export type RemoteControlSettings = {
	/** true の間だけ HTTP サーバが立つ */
	enabled: boolean;
	/** 待ち受けポート */
	port: number;
	/** 認証トークン。'' の場合は有効化時に自動生成する */
	token: string;
	/** false なら 127.0.0.1 のみ。実機から繋ぐ場合は true にする */
	allowLan: boolean;
	/** モバイルから任意のコマンド ID を実行できるようにするか */
	allowCommands: boolean;
	/** モバイルからエージェントにプロンプトを送れるようにするか */
	allowAgentPrompts: boolean;
	/** モバイルからカンバンを編集できるようにするか (false なら閲覧のみ) */
	allowKanbanWrites: boolean;
	/** モバイルから Division プロジェクトを編集できるようにするか (false なら閲覧のみ) */
	allowProjectWrites: boolean;
};

export const defaultRemoteControlSettings: RemoteControlSettings = {
	enabled: false,
	port: REMOTE_CONTROL_DEFAULT_PORT,
	token: '',
	allowLan: true,
	allowCommands: true,
	allowAgentPrompts: true,
	allowKanbanWrites: true,
	allowProjectWrites: true,
};

export const MIN_REMOTE_CONTROL_PORT = 1024;
export const MAX_REMOTE_CONTROL_PORT = 65535;

export const clampRemoteControlPort = (n: unknown): number => {
	const parsed = typeof n === 'number' ? Math.floor(n) : parseInt(String(n ?? ''), 10);
	if (!Number.isFinite(parsed)) return REMOTE_CONTROL_DEFAULT_PORT;
	return Math.min(MAX_REMOTE_CONTROL_PORT, Math.max(MIN_REMOTE_CONTROL_PORT, parsed));
};

// ---------------------------------------------------------------------------
// ペアリング
// ---------------------------------------------------------------------------

/**
 * QR コードや手入力で渡す接続情報。
 * モバイル側は `orchestra://pair?...` かこの JSON をそのまま読む。
 */
export type RemoteControlPairingPayload = {
	v: number;
	url: string;
	token: string;
	workspace: string;
};

export const buildPairingPayload = (
	args: { url: string; token: string; workspace: string },
): RemoteControlPairingPayload => ({
	v: REMOTE_CONTROL_PROTOCOL_VERSION,
	url: args.url,
	token: args.token,
	workspace: args.workspace,
});

export const encodePairingUri = (payload: RemoteControlPairingPayload): string => {
	const q = [
		`v=${encodeURIComponent(String(payload.v))}`,
		`url=${encodeURIComponent(payload.url)}`,
		`token=${encodeURIComponent(payload.token)}`,
		`workspace=${encodeURIComponent(payload.workspace)}`,
	].join('&');
	return `orchestra://pair?${q}`;
};

// ---------------------------------------------------------------------------
// モバイルに返すスナップショット
// ---------------------------------------------------------------------------

export type RemoteIdeInfo = {
	protocolVersion: number;
	appName: string;
	version: string;
	/** 開いているワークスペース名 ('' ならフォルダ未オープン) */
	workspaceName: string;
	workspaceFolders: string[];
	uiLanguage: string;
};

export type RemoteChatMessage = {
	role: 'user' | 'assistant' | 'tool' | 'system' | 'checkpoint' | 'interrupted';
	/** 表示用テキスト (長い場合は先頭のみ) */
	text: string;
	/** tool メッセージのときのツール名 */
	toolName?: string;
};

export type RemoteChatState = {
	threadId: string;
	/** 新しい順ではなく会話順 */
	messages: RemoteChatMessage[];
	isRunning: boolean;
	/** ツール承認待ちで止まっているか */
	awaitingApproval: boolean;
	/** 直近のエラー文言 */
	error?: string;
};

export type RemoteThreadSummary = {
	threadId: string;
	title: string;
	lastModified: string;
	messageCount: number;
};

export type RemoteRoleAssignment = {
	role: string;
	provider: string;
	model: string;
};

export type RemoteDivisionProject = {
	projectId: string;
	name: string;
	agents: RemoteRoleAssignment[];
	isActive: boolean;
};

export type RemoteDivisionState = {
	projects: RemoteDivisionProject[];
	activeProjectIds: string[];
	/** .division/projects.json のパス (無ければ null) */
	configPath: string | null;
	hasProject: boolean;
};

/** GET /api/state のレスポンス */
export type RemoteSnapshot = {
	ide: RemoteIdeInfo;
	division: RemoteDivisionState;
	/** カンバンは KanbanBoard / KanbanServiceState をそのまま載せる */
	kanban: unknown;
	chat: RemoteChatState;
	threads: RemoteThreadSummary[];
	/** 変化検知用。state が変わるたびに単調増加する */
	revision: number;
	generatedAt: number;
};

/** エラー応答の形 */
export type RemoteErrorBody = { error: string; detail?: string };
