/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// クラウドエージェント (Division API 上の Daytona サンドボックスでエージェントを動かす機能) の
// 型・ID・main プロセス側サービスのインターフェース。
//
// このファイルはレンダラー (browser/cloudAgentService.ts, React)、electron-main
// (electron-main/cloudAgentMainService.ts)、ウォーターマークなどから import されるので、
// createDecorator 以外の実行時依存を持たせないこと。
//
// サーバー側の API 契約 (Division ⇄ Orchestra) に合わせてある:
//   POST /api/cloud-sessions                  → { session }
//   POST /api/cloud-sessions/:id/upload       { index, total, data(base64) }
//   POST /api/cloud-sessions/:id/start        { workspaceInfo? } → { session }
//   GET  /api/cloud-sessions?limit=50         → { sessions }
//   GET  /api/cloud-sessions/:id              → { session }
//   GET  /api/cloud-sessions/:id/events?after=&limit=  → { events, session }
//   POST /api/cloud-sessions/:id/messages     { text } → { session }
//   POST /api/cloud-sessions/:id/stop         {} → { session }
//   POST /api/cloud-sessions/:id/archive      {} → { ok }
//   GET  /api/cloud-sessions/:id/changes      → { changes, patch, patchTruncated }
//   GET  /api/cloud-sessions/:id/file?path=&ref=current|base → { path, ref, exists, encoding, content, size }

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';


// ---------------------------------------------------------------------------
// DTO (サーバーの JSON そのまま)
// ---------------------------------------------------------------------------

export type CloudSessionStatus =
	| 'provisioning'  // サンドボックス作成中
	| 'uploading'     // ワークスペースのアップロード + /start 待ち
	| 'running'       // エージェントが作業中
	| 'idle'          // 1 ターン終わった (追加の指示を送れる)
	| 'failed'        // 失敗した (追加の指示を送ると再開する)
	| 'cancelled';    // ユーザーが止めた (追加の指示を送ると再開する)

export type CloudWorkspaceInfo = {
	fileCount: number;
	bytes: number;
	skipped: number;
	gitBranch?: string;
	gitCommit?: string;
};

export interface CloudSession {
	id: string;
	title: string;
	prompt: string;
	status: CloudSessionStatus;
	model: string | null;
	modelLabel: string | null;
	projectId: string | null;
	workspaceName: string | null;
	workspaceInfo: CloudWorkspaceInfo | null;
	summary: string | null;
	errorMsg: string | null;
	changedFiles: number;
	lastSeq: number;
	createdAt: string;
	updatedAt: string;
	startedAt: string | null;
	completedAt: string | null;
}

export type CloudSessionEventType = 'user' | 'assistant' | 'tool' | 'status' | 'error' | 'done';

export interface CloudSessionEvent {
	seq: number;
	type: CloudSessionEventType;
	/**
	 * type ごとの中身:
	 *  - user:      { text }
	 *  - assistant: { text, toolCall?: { name, args } }
	 *  - tool:      { name, args, ok, output, durationMs }
	 *  - status:    { status, message? }
	 *  - error:     { message }
	 *  - done:      { summary, changedFiles }
	 */
	data: any;
	createdAt: string;
}

export interface CloudChange {
	path: string;
	status: 'added' | 'modified' | 'deleted' | 'renamed';
	oldPath?: string;
	additions: number; // バイナリは -1
	deletions: number; // バイナリは -1
	binary: boolean;
}

export type CloudFileResponse = {
	path: string;
	ref: 'current' | 'base';
	exists: boolean;
	encoding: 'base64';
	content: string;
	size: number;
};

/** エージェントが動いている (または動き出す途中の) 状態か */
export const isCloudSessionActive = (status: CloudSessionStatus): boolean =>
	status === 'provisioning' || status === 'uploading' || status === 'running';


// ---------------------------------------------------------------------------
// ID
// ---------------------------------------------------------------------------

export const CLOUD_AGENT_CHANNEL_NAME = 'void-channel-cloudAgent';

export const CLOUD_AGENTS_OPEN_ACTION_ID = 'orchestra.cloudAgents.open';
export const CLOUD_AGENTS_NEW_ACTION_ID = 'orchestra.cloudAgents.new';
export const CLOUD_AGENTS_STOP_ALL_ACTION_ID = 'orchestra.cloudAgents.stopAll';

/** API のパスはすべてこの下。main プロセス側の中継もこれ以外は通さない */
export const CLOUD_SESSIONS_API_PREFIX = '/api/cloud-sessions';

/** 1 回の起動で並列に走らせられるセッション数の上限 */
export const CLOUD_AGENTS_MAX_PARALLEL = 10;


// ---------------------------------------------------------------------------
// main プロセス側サービス (Division への認証付き HTTP と、ワークスペースのアップロード)
//
// レンダラーから Division を直接叩くと CORS で失敗するので、必ず main 経由にする。
// ProxyChannel で公開するので、引数・戻り値は JSON にできる値だけにすること。
// ---------------------------------------------------------------------------

export type CloudAgentRequestParams = {
	endpoint: string;
	token: string;
	method: 'GET' | 'POST';
	/** `/api/cloud-sessions` で始まるパス (クエリ文字列を含んでよい) */
	path: string;
	body?: unknown;
	timeoutMs?: number;
};

export type CloudAgentResponse = { ok: boolean; status: number; data: any; error?: string };

export type CloudAgentUploadParams = {
	endpoint: string;
	token: string;
	sessionId: string;
	/** アップロードするワークスペースのフォルダ (ローカルの絶対パス) */
	folderPath: string;
};

export type CloudAgentUploadResult = {
	ok: boolean;
	info?: CloudWorkspaceInfo;
	/** HTTP ステータス (失敗した POST のもの。分からなければ 0) */
	status?: number;
	error?: string;
};

export interface ICloudAgentMainService {
	readonly _serviceBrand: undefined;

	/** Division の /api/cloud-sessions 配下への GET / POST。例外は投げず ok:false で返す */
	request(params: CloudAgentRequestParams): Promise<CloudAgentResponse>;

	/** ワークスペースを tar.gz にまとめ、2 MiB ずつ /upload に送る。例外は投げず ok:false で返す */
	uploadWorkspace(params: CloudAgentUploadParams): Promise<CloudAgentUploadResult>;
}

export const ICloudAgentMainService = createDecorator<ICloudAgentMainService>('cloudAgentMainService');
