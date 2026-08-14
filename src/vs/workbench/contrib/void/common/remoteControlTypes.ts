/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// orchestra-mobile (src/api/types.ts) が期待するプロトコルの型。
// Phase 1 では `/api/ping` と `/api/state` のみを実装する。カンバン / チャット /
// Division / ファイル操作は将来のフェーズで追加するため、ここでは Snapshot の
// 該当フィールドを「空の最小構造」として定義するだけに留める。

export const PROTOCOL_VERSION = 1;

export type KanbanColumnRole = 'none' | 'todo' | 'in-progress' | 'done' | 'error';
export type KanbanPriority = 'urgent' | 'high' | 'normal' | 'low';

export type KanbanChecklistItem = { id: string; text: string; done: boolean };
export type KanbanComment = { id: string; author: 'user' | 'agent'; body: string; createdAt: number };
export type KanbanRunStatus = 'done' | 'error' | 'timeout' | 'canceled' | 'dry-run';
export type KanbanRunRecord = {
	status: KanbanRunStatus;
	startedAt: number;
	endedAt: number;
	threadId?: string;
	error?: string;
	summary?: string;
};

export type KanbanTask = {
	id: string;
	columnId: string;
	title: string;
	description: string;
	labels: string[];
	priority: KanbanPriority;
	dueDate: string;
	assignee: string;
	checklist: KanbanChecklistItem[];
	comments: KanbanComment[];
	agentEnabled: boolean;
	createdAt: number;
	updatedAt: number;
	runs: KanbanRunRecord[];
};

export type KanbanColumn = { id: string; title: string; role: KanbanColumnRole; wipLimit: number; color: string };
export type KanbanBoard = { version: 1; title: string; columns: KanbanColumn[]; tasks: KanbanTask[]; updatedAt: number };
export type KanbanRuntime = {
	isLoaded: boolean;
	source: { kind: 'file'; path: string } | { kind: 'storage' };
	isPolling: boolean;
	isRunning: boolean;
	awaitingApproval: boolean;
	runningTaskId: string | null;
	queuedTaskIds: string[];
	lastPolledAt: number | null;
	lastError?: string;
	autoRunEnabled: boolean;
};
export type KanbanState = { board: KanbanBoard; runtime: KanbanRuntime };

export type RoleAssignment = { role: string; provider: string; model: string };
export type DivisionProject = { projectId: string; name: string; agents: RoleAssignment[]; isActive: boolean };
export type DivisionState = { projects: DivisionProject[]; activeProjectIds: string[]; configPath: string | null; hasProject: boolean };

export type IdeInfo = {
	protocolVersion: number;
	appName: string;
	version: string;
	workspaceName: string;
	workspaceFolders: string[];
	uiLanguage: string;
};

export type ChatMessage = { role: 'user' | 'assistant' | 'tool' | 'system' | 'checkpoint' | 'interrupted'; text: string; toolName?: string };
export type ChatState = { threadId: string; messages: ChatMessage[]; isRunning: boolean; awaitingApproval: boolean; error?: string };
export type ThreadSummary = { threadId: string; title: string; lastModified: string; messageCount: number };

/** GET /api/state のレスポンス。Phase 1 では division/kanban/chat/threads は空の最小構造。 */
export type Snapshot = {
	ide: IdeInfo;
	division: DivisionState;
	kanban: KanbanState;
	chat: ChatState;
	threads: ThreadSummary[];
	revision: number;
	generatedAt: number;
};

export const emptyKanbanState = (): KanbanState => ({
	board: { version: 1, title: '', columns: [], tasks: [], updatedAt: 0 },
	runtime: {
		isLoaded: false,
		source: { kind: 'storage' },
		isPolling: false,
		isRunning: false,
		awaitingApproval: false,
		runningTaskId: null,
		queuedTaskIds: [],
		lastPolledAt: null,
		autoRunEnabled: false,
	},
});

export const emptyDivisionState = (): DivisionState => ({
	projects: [],
	activeProjectIds: [],
	configPath: null,
	hasProject: false,
});

export const emptyChatState = (): ChatState => ({
	threadId: '',
	messages: [],
	isRunning: false,
	awaitingApproval: false,
});

// ---------------------------------------------------------------------------
// リモートコントロールサーバー自体の状態 / 接続情報
// ---------------------------------------------------------------------------

export type RemoteControlConnectionInfo = {
	/** 例: http://192.168.0.12:39231 */
	url: string;
	token: string;
	workspaceName: string;
	/** orchestra-mobile/src/lib/pairing.ts が受け付ける形式 */
	pairingLink: string;
};

export type RemoteControlServerState =
	| { kind: 'stopped' }
	| { kind: 'starting' }
	| { kind: 'running'; info: RemoteControlConnectionInfo }
	| { kind: 'error'; message: string };

export type RemoteControlIdeInfoInput = {
	workspaceName: string;
	workspaceFolders: string[];
	uiLanguage: string;
};
