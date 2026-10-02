/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Orchestra Mobile からの操作をワークベンチのサービスへつなぐ。
//
// LAN の HTTP サーバとトークン / アカウントの確認はメインプロセスが受け持ち、
// ここには確認済みのリクエストだけが IPC で届く。エンドポイントの一覧は
// docs/REMOTE-CONTROL.md、型は common/remoteControlTypes.ts を参照。

import { Disposable } from '../../../../base/common/lifecycle.js';
import { language } from '../../../../base/common/platform.js';
import { isEqualOrParent, joinPath, relativePath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ipcRenderer } from '../../../../base/parts/sandbox/electron-sandbox/globals.js';
import { localize } from '../../../../nls.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IChatThreadService } from '../browser/chatThreadServiceInterface.js';
import { DivisionProjectConfig, IDivisionProjectService } from '../browser/divisionProjectService.js';
import { IKanbanService } from '../browser/kanbanService.js';
import { IRemoteSessionSyncService, RemoteGatewayStatus } from '../browser/remoteSessionSyncService.js';
import { ChatMessage } from '../common/chatThreadServiceTypes.js';
import { divisionModelNamesByProvider } from '../common/divisionModelCatalog.js';
import { defaultKanbanSettings, KanbanColumn, KanbanTask } from '../common/kanbanServiceTypes.js';
import {
	REMOTE_CONTROL_IPC_ANNOUNCE,
	REMOTE_CONTROL_IPC_COPY_PAIRING_LINK,
	REMOTE_CONTROL_IPC_READY,
	REMOTE_CONTROL_IPC_REQUEST,
	REMOTE_CONTROL_IPC_RESPONSE,
	REMOTE_CONTROL_PROTOCOL_VERSION,
	REMOTE_CONTROL_SETTING_ALLOW_CHAT,
	REMOTE_CONTROL_SETTING_ALLOW_COMMANDS,
	REMOTE_CONTROL_SETTING_ALLOW_KANBAN_EDIT,
	REMOTE_CONTROL_SETTING_ALLOW_PROJECT_EDIT,
	RemoteChatMessage,
	RemoteChatState,
	RemoteControlIpcRequest,
	RemoteControlIpcResponse,
	RemoteDivisionState,
	RemoteFileEntry,
	RemoteIdeInfo,
	RemoteSessionInfo,
	RemoteThreadSummary,
} from '../common/remoteControlTypes.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { AgentRole, ProviderName, providerNames, RoleAssignment } from '../common/voidSettingsTypes.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'orchestraRemoteControl',
	title: localize('orchestraRemoteControl', "リモートコントロール"),
	type: 'object',
	properties: {
		[REMOTE_CONTROL_SETTING_ALLOW_CHAT]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('orchestraRemoteControl.allowChat', "Orchestra Mobile からエージェントへの指示・中断・ツールの承認を許可します。"),
		},
		[REMOTE_CONTROL_SETTING_ALLOW_KANBAN_EDIT]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('orchestraRemoteControl.allowKanbanEdit', "Orchestra Mobile からカンバンの編集とタスクの実行を許可します。"),
		},
		[REMOTE_CONTROL_SETTING_ALLOW_PROJECT_EDIT]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('orchestraRemoteControl.allowProjectEdit', "Orchestra Mobile から Division プロジェクトの編集を許可します。"),
		},
		[REMOTE_CONTROL_SETTING_ALLOW_COMMANDS]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			description: localize('orchestraRemoteControl.allowCommands', "Orchestra Mobile からのコマンド実行とファイルを開く操作を許可します。"),
		},
	},
});

/** 1 メッセージあたりの本文の上限。長いツール結果でポーリングが重くならないようにする */
const MAX_MESSAGE_CHARS = 4_000;
/** 1 回のスナップショットに載せる直近メッセージ数 */
const MAX_MESSAGES = 200;
const MAX_THREADS = 50;
const MAX_COMMANDS = 300;

class HttpError extends Error {
	constructor(readonly status: number, message: string, readonly detail?: string) {
		super(message);
	}
}

type Handler = (params: string[], request: RemoteControlIpcRequest) => Promise<unknown> | unknown;
type Route = { method: RemoteControlIpcRequest['method']; pattern: RegExp; handler: Handler };

const truncate = (text: string, max = MAX_MESSAGE_CHARS): string =>
	text.length > max ? `${text.slice(0, max)}…` : text;

const asObject = (body: unknown): Record<string, unknown> =>
	body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};

const requireString = (value: unknown, name: string): string => {
	if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, 'invalid_request', `${name} is required`);
	return value;
};

const optionalString = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;

class OrchestraRemoteControlContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.orchestraRemoteControl';

	private _revision = Date.now();
	private readonly _routes: Route[] = [];

	constructor(
		@IChatThreadService private readonly _chatThreadService: IChatThreadService,
		@IKanbanService private readonly _kanbanService: IKanbanService,
		@IDivisionProjectService private readonly _divisionProjectService: IDivisionProjectService,
		@IVoidSettingsService private readonly _settingsService: IVoidSettingsService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IEditorService private readonly _editorService: IEditorService,
		@IProductService private readonly _productService: IProductService,
		@IRemoteSessionSyncService private readonly _remoteSessionSyncService: IRemoteSessionSyncService,
	) {
		super();

		this._register(this._remoteSessionSyncService.setGateway({
			announce: () => ipcRenderer.invoke(REMOTE_CONTROL_IPC_ANNOUNCE) as Promise<RemoteGatewayStatus>,
			copyPairingLink: async () => { await ipcRenderer.invoke(REMOTE_CONTROL_IPC_COPY_PAIRING_LINK); },
		}));

		// スナップショットの revision。どれかが変わったら進め、モバイルはこれで再描画を判断する
		const bump = () => { this._revision++; };
		this._register(this._chatThreadService.onDidChangeCurrentThread(bump));
		this._register(this._chatThreadService.onDidChangeStreamState(bump));
		this._register(this._kanbanService.onDidChangeState(bump));
		this._register(this._divisionProjectService.onDidChangeProject(bump));
		this._register(this._settingsService.onDidChangeState(bump));
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(bump));
		this._register(this._remoteSessionSyncService.onDidChangeSync(bump));

		this._registerRoutes();

		const onRequest = (_event: unknown, request: RemoteControlIpcRequest) => { void this._handle(request); };
		ipcRenderer.on(REMOTE_CONTROL_IPC_REQUEST, onRequest);
		this._register({ dispose: () => ipcRenderer.removeListener(REMOTE_CONTROL_IPC_REQUEST, onRequest) });
		ipcRenderer.send(REMOTE_CONTROL_IPC_READY);
	}

	// -----------------------------------------------------------------------
	// ルーティング
	// -----------------------------------------------------------------------

	private _route(method: Route['method'], path: string, handler: Handler): void {
		// ':id' を 1 セグメントのキャプチャにする
		const pattern = new RegExp(`^${path.replace(/:[a-zA-Z]+/g, '([^/]+)')}$`);
		this._routes.push({ method, pattern, handler });
	}

	private async _handle(request: RemoteControlIpcRequest): Promise<void> {
		let response: RemoteControlIpcResponse;
		try {
			const body = await this._dispatch(request);
			response = { id: request.id, status: 200, body: body ?? { ok: true } };
		} catch (error) {
			response = error instanceof HttpError
				? { id: request.id, status: error.status, body: { error: error.message, detail: error.detail } }
				: { id: request.id, status: 500, body: { error: 'internal_error', detail: error instanceof Error ? error.message : String(error) } };
		}
		ipcRenderer.send(REMOTE_CONTROL_IPC_RESPONSE, response);
	}

	private async _dispatch(request: RemoteControlIpcRequest): Promise<unknown> {
		let pathMatched = false;
		for (const route of this._routes) {
			const match = route.pattern.exec(request.path);
			if (!match) continue;
			pathMatched = true;
			if (route.method !== request.method) continue;
			return route.handler(match.slice(1).map(decodeURIComponent), request);
		}
		throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'method_not_allowed' : 'not_found');
	}

	private _requirePermission(setting: string, what: string): void {
		if (this._configurationService.getValue<boolean>(setting) === false) {
			throw new HttpError(403, 'forbidden', `${what}は IDE の設定 (リモートコントロール) で無効になっています。`);
		}
	}

	private _registerRoutes(): void {
		const chat = () => this._requirePermission(REMOTE_CONTROL_SETTING_ALLOW_CHAT, 'エージェントの操作');
		const kanban = () => this._requirePermission(REMOTE_CONTROL_SETTING_ALLOW_KANBAN_EDIT, 'カンバンの編集');
		const project = () => this._requirePermission(REMOTE_CONTROL_SETTING_ALLOW_PROJECT_EDIT, 'プロジェクトの編集');
		const commands = () => this._requirePermission(REMOTE_CONTROL_SETTING_ALLOW_COMMANDS, 'コマンドの実行');

		// --- 全体 ---
		this._route('GET', '/api/state', () => this._snapshot());

		// --- カンバン ---
		this._route('GET', '/api/kanban', () => this._kanbanState());
		this._route('POST', '/api/kanban/reload', () => this._kanbanService.reload());
		this._route('PATCH', '/api/kanban/board', (_, { body }) => {
			kanban();
			this._kanbanService.setBoardTitle(requireString(asObject(body).title, 'title'));
		});
		this._route('POST', '/api/kanban/tasks', (_, { body }) => {
			kanban();
			const input = asObject(body);
			const task = this._kanbanService.createTask({
				title: requireString(input.title, 'title'),
				columnId: optionalString(input.columnId),
				description: optionalString(input.description),
				labels: Array.isArray(input.labels) ? input.labels.filter((l): l is string => typeof l === 'string') : undefined,
				priority: optionalString(input.priority) as KanbanTask['priority'] | undefined,
				dueDate: optionalString(input.dueDate),
				assignee: optionalString(input.assignee),
			});
			return { task };
		});
		this._route('PATCH', '/api/kanban/tasks/:id', ([taskId], { body }) => {
			kanban();
			const { id: _id, createdAt: _createdAt, ...patch } = asObject(body) as Partial<KanbanTask>;
			this._kanbanService.updateTask(this._requireTask(taskId).id, patch);
			return { task: this._findTask(taskId) };
		});
		this._route('DELETE', '/api/kanban/tasks/:id', ([taskId]) => {
			kanban();
			this._kanbanService.deleteTask(this._requireTask(taskId).id);
		});
		this._route('POST', '/api/kanban/tasks/:id/move', ([taskId], { body }) => {
			kanban();
			const input = asObject(body);
			const columnId = requireString(input.columnId, 'columnId');
			if (!this._kanbanService.state.board.columns.some(c => c.id === columnId)) throw new HttpError(404, 'column_not_found');
			const index = typeof input.index === 'number' && Number.isFinite(input.index) ? Math.max(0, Math.floor(input.index)) : Number.MAX_SAFE_INTEGER;
			this._kanbanService.moveTask(this._requireTask(taskId).id, columnId, index);
		});
		this._route('POST', '/api/kanban/tasks/:id/run', ([taskId]) => {
			kanban();
			// 完了までは待たない。進捗はスナップショットで見る
			void this._kanbanService.runTask(this._requireTask(taskId).id);
		});
		this._route('POST', '/api/kanban/tasks/:id/comments', ([taskId], { body }) => {
			kanban();
			this._kanbanService.addComment(this._requireTask(taskId).id, requireString(asObject(body).body, 'body'));
			return { task: this._findTask(taskId) };
		});
		this._route('POST', '/api/kanban/tasks/:id/checklist', ([taskId], { body }) => {
			kanban();
			this._kanbanService.addChecklistItem(this._requireTask(taskId).id, requireString(asObject(body).text, 'text'));
			return { task: this._findTask(taskId) };
		});
		this._route('PATCH', '/api/kanban/tasks/:id/checklist/:itemId', ([taskId, itemId], { body }) => {
			kanban();
			const input = asObject(body);
			this._kanbanService.updateChecklistItem(this._requireTask(taskId).id, itemId, {
				text: optionalString(input.text),
				done: typeof input.done === 'boolean' ? input.done : undefined,
			});
			return { task: this._findTask(taskId) };
		});
		this._route('DELETE', '/api/kanban/tasks/:id/checklist/:itemId', ([taskId, itemId]) => {
			kanban();
			this._kanbanService.deleteChecklistItem(this._requireTask(taskId).id, itemId);
		});
		this._route('POST', '/api/kanban/columns', (_, { body }) => {
			kanban();
			const { title, id: _id, ...patch } = asObject(body) as Partial<KanbanColumn>;
			const column = this._kanbanService.addColumn(requireString(title, 'title'));
			if (Object.keys(patch).length) this._kanbanService.updateColumn(column.id, patch);
			return { column: this._kanbanService.state.board.columns.find(c => c.id === column.id) ?? column };
		});
		this._route('PATCH', '/api/kanban/columns/:id', ([columnId], { body }) => {
			kanban();
			this._requireColumn(columnId);
			const { id: _id, ...patch } = asObject(body) as Partial<KanbanColumn>;
			this._kanbanService.updateColumn(columnId, patch);
		});
		this._route('DELETE', '/api/kanban/columns/:id', ([columnId], { body }) => {
			kanban();
			this._requireColumn(columnId);
			this._kanbanService.deleteColumn(columnId, optionalString(asObject(body).moveTasksTo));
		});
		this._route('POST', '/api/kanban/auto-run', async (_, { body }) => {
			kanban();
			const enabled = asObject(body).enabled;
			if (typeof enabled !== 'boolean') throw new HttpError(400, 'invalid_request', 'enabled must be a boolean');
			await this._kanbanService.setAutoRunEnabled(enabled);
		});
		this._route('POST', '/api/kanban/run-now', () => {
			kanban();
			void this._kanbanService.runNow();
		});
		this._route('POST', '/api/kanban/cancel', () => {
			kanban();
			return this._kanbanService.cancelCurrent();
		});

		// --- Division ---
		this._route('GET', '/api/division/projects', () => this._divisionState());
		this._route('GET', '/api/division/models', () => ({ providers: this._providerModels() }));
		this._route('POST', '/api/division/projects', async (_, { body }) => {
			project();
			const input = asObject(body);
			const projectId = requireString(input.projectId, 'projectId');
			if (this._divisionProjectService.projects.some(p => p.projectId === projectId)) {
				throw new HttpError(409, 'project_exists', `プロジェクト ${projectId} は既にあります。`);
			}
			await this._divisionProjectService.addProject({
				projectId,
				name: optionalString(input.name) || projectId,
				agents: this._parseAgents(input.agents) ?? [],
			});
			return this._divisionState();
		});
		this._route('PATCH', '/api/division/projects/:id', async ([projectId], { body }) => {
			project();
			const current = this._requireProject(projectId);
			const input = asObject(body);
			const next: DivisionProjectConfig = {
				...current,
				name: optionalString(input.name) ?? current.name,
				agents: this._parseAgents(input.agents) ?? current.agents,
			};
			await this._divisionProjectService.save(next);
			return this._divisionState();
		});
		this._route('DELETE', '/api/division/projects/:id', async ([projectId]) => {
			project();
			this._requireProject(projectId);
			await this._divisionProjectService.removeProject(projectId);
			return this._divisionState();
		});
		this._route('POST', '/api/division/projects/:id/activate', async ([projectId], { body }) => {
			project();
			this._requireProject(projectId);
			if (asObject(body).exclusive === false) await this._divisionProjectService.toggleActiveProject(projectId);
			else await this._divisionProjectService.setActiveProject(projectId);
			return this._divisionState();
		});
		this._route('POST', '/api/division/sync/pull', (_, { body }) => {
			project();
			return this._divisionProjectService.fetchFromSupabase(optionalString(asObject(body).projectId));
		});
		this._route('POST', '/api/division/sync/push', () => {
			project();
			return this._divisionProjectService.pushToSupabase();
		});

		// --- チャット ---
		this._route('GET', '/api/chat', () => this._chatState());
		this._route('GET', '/api/chat/threads', () => ({ threads: this._threads() }));
		this._route('POST', '/api/chat/message', (_, { body }) => {
			chat();
			const input = asObject(body);
			const message = requireString(input.message, 'message');
			const requestedThreadId = optionalString(input.threadId);
			if (input.newThread === true) {
				this._openNewThread();
			} else if (requestedThreadId && requestedThreadId !== this._remoteThreadId()) {
				this._requireThread(requestedThreadId);
				this._switchThread(requestedThreadId);
			}
			const threadId = this._remoteThreadId();
			const running = this._chatThreadService.streamState[threadId]?.isRunning;
			if (running) {
				throw new HttpError(409, 'agent_busy', running === 'awaiting_user'
					? 'エージェントがツールの承認を待っています。承認か却下をしてから送ってください。'
					: 'エージェントが実行中です。終わるのを待つか中断してから送ってください。');
			}
			// 完了は待たない。進捗はスナップショットで見る
			void this._chatThreadService.addUserMessageAndStreamResponse({ userMessage: message, threadId });
			return { threadId };
		});
		this._route('POST', '/api/chat/abort', async (_, { body }) => {
			chat();
			await this._chatThreadService.abortRunning(this._threadIdFrom(body));
			return this._chatState();
		});
		this._route('POST', '/api/chat/new', () => {
			chat();
			this._openNewThread();
			return this._chatState();
		});
		this._route('POST', '/api/chat/threads/:id', ([threadId]) => {
			chat();
			this._requireThread(threadId);
			this._switchThread(threadId);
			return this._chatState();
		});
		this._route('POST', '/api/chat/approve', (_, { body }) => {
			chat();
			const threadId = this._threadIdFrom(body);
			this._requireAwaitingApproval(threadId);
			this._chatThreadService.approveLatestToolRequest(threadId);
			return this._chatState();
		});
		this._route('POST', '/api/chat/reject', (_, { body }) => {
			chat();
			const threadId = this._threadIdFrom(body);
			this._requireAwaitingApproval(threadId);
			this._chatThreadService.rejectLatestToolRequest(threadId);
			return this._chatState();
		});

		// --- コマンド / ファイル ---
		this._route('GET', '/api/commands', (_, { query }) => {
			const q = (query.q ?? '').toLowerCase();
			const ids = [...CommandsRegistry.getCommands().keys()]
				.filter(id => !id.startsWith('_') && (!q || id.toLowerCase().includes(q)))
				.sort()
				.slice(0, MAX_COMMANDS);
			return { commands: ids };
		});
		this._route('POST', '/api/commands/run', async (_, { body }) => {
			commands();
			const input = asObject(body);
			const commandId = requireString(input.commandId, 'commandId');
			if (!CommandsRegistry.getCommand(commandId)) throw new HttpError(404, 'command_not_found', commandId);
			const result = await this._commandService.executeCommand(commandId, ...(Array.isArray(input.args) ? input.args : []));
			return { result: this._toJson(result) };
		});
		this._route('GET', '/api/files/list', async (_, { query }) => {
			const { root, uri, path } = this._resolveWorkspacePath(query.path ?? '');
			const stat = await this._fileService.resolve(uri).catch(() => undefined);
			if (!stat) throw new HttpError(404, 'file_not_found', path);
			if (!stat.isDirectory) throw new HttpError(400, 'not_a_directory', path);
			const children: RemoteFileEntry[] = (stat.children ?? [])
				.map(child => ({ name: child.name, isDirectory: child.isDirectory, path: relativePath(root, child.resource) ?? child.name }))
				.sort((a, b) => a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1);
			return { path, children };
		});
		this._route('POST', '/api/files/open', async (_, { body }) => {
			commands();
			const { uri, path } = this._resolveWorkspacePath(requireString(asObject(body).path, 'path'));
			const stat = await this._fileService.stat(uri).catch(() => undefined);
			if (!stat) throw new HttpError(404, 'file_not_found', path);
			if (stat.isDirectory) throw new HttpError(400, 'is_a_directory', path);
			await this._editorService.openEditor({ resource: uri, options: { pinned: true } });
		});
	}

	// -----------------------------------------------------------------------
	// 状態の組み立て
	// -----------------------------------------------------------------------

	private _snapshot() {
		return {
			ide: this._ideInfo(),
			division: this._divisionState(),
			kanban: this._kanbanState(),
			chat: this._chatState(),
			threads: this._threads(),
			remoteSession: this._remoteSessionInfo(),
			revision: this._revision,
			generatedAt: Date.now(),
		};
	}

	private _ideInfo(): RemoteIdeInfo {
		const workspace = this._workspaceContextService.getWorkspace();
		return {
			protocolVersion: REMOTE_CONTROL_PROTOCOL_VERSION,
			appName: this._productService.nameLong || 'Orchestra',
			version: this._productService.version,
			workspaceName: workspace.folders[0]?.name ?? '',
			workspaceFolders: workspace.folders.map(f => f.uri.fsPath),
			uiLanguage: language,
		};
	}

	private _kanbanState() {
		const { board, isLoaded, source, isPolling, isRunning, awaitingApproval, runningTaskId, queuedTaskIds, lastPolledAt, lastError } = this._kanbanService.state;
		const autoRunEnabled = (this._settingsService.state.globalSettings.kanban ?? defaultKanbanSettings).autoRunEnabled;
		return {
			board,
			runtime: { isLoaded, source, isPolling, isRunning, awaitingApproval, runningTaskId, queuedTaskIds, lastPolledAt, lastError, autoRunEnabled },
		};
	}

	private _divisionState(): RemoteDivisionState {
		const service = this._divisionProjectService;
		return {
			projects: service.projects.map(p => ({
				projectId: p.projectId,
				name: p.name,
				agents: p.agents.map(a => ({ role: a.role, provider: a.provider, model: a.model })),
				isActive: service.isProjectActive(p.projectId),
			})),
			activeProjectIds: [...service.activeProjectIds],
			configPath: service.projectConfigUri?.fsPath ?? null,
			hasProject: service.hasProject,
		};
	}

	private _providerModels(): { provider: string; models: string[] }[] {
		const settingsOfProvider = this._settingsService.state.settingsOfProvider;
		// Division API が扱うプロバイダは、起動時に Division API から取得した最新のモデル一覧を返す
		const divisionModels = divisionModelNamesByProvider(settingsOfProvider);
		return providerNames
			.map(provider => ({
				provider,
				models: divisionModels[provider]?.length
					? divisionModels[provider]
					: (settingsOfProvider[provider]?.models ?? []).filter(m => !m.isHidden).map(m => m.modelName),
			}))
			.filter(p => p.models.length > 0);
	}

	/**
	 * モバイルのチャットが向くスレッド。`/remote-control` で同期中ならそのスレッド、
	 * そうでなければデスクトップで開いているスレッド。
	 */
	private _remoteThreadId(): string {
		const synced = this._remoteSessionSyncService.synced;
		if (synced && this._chatThreadService.state.allThreads[synced.threadId]) return synced.threadId;
		return this._chatThreadService.state.currentThreadId;
	}

	/** 同期中はデスクトップの表示を動かさず、モバイルの向き先だけ変える */
	private _switchThread(threadId: string): void {
		if (this._remoteSessionSyncService.synced) this._remoteSessionSyncService.retarget(threadId);
		else this._chatThreadService.switchToThread(threadId);
	}

	private _openNewThread(): void {
		this._chatThreadService.openNewThread();
		if (this._remoteSessionSyncService.synced) this._remoteSessionSyncService.retarget(this._chatThreadService.state.currentThreadId);
	}

	private _remoteSessionInfo(): RemoteSessionInfo | null {
		const synced = this._remoteSessionSyncService.synced;
		if (!synced || !this._chatThreadService.state.allThreads[synced.threadId]) return null;
		return { threadId: synced.threadId, title: this._threadTitle(synced.threadId), syncedAt: synced.syncedAt };
	}

	private _chatState(): RemoteChatState {
		const threadId = this._remoteThreadId();
		const thread = this._chatThreadService.state.allThreads[threadId];
		const stream = this._chatThreadService.streamState[threadId];
		const messages = (thread?.messages ?? []).map(m => this._toRemoteMessage(m)).filter((m): m is RemoteChatMessage => !!m);

		// ストリーミング中の返答はまだ messages に入っていないので末尾に足す
		if (stream?.isRunning === 'LLM' && stream.llmInfo.displayContentSoFar) {
			messages.push({ role: 'assistant', text: truncate(stream.llmInfo.displayContentSoFar) });
		} else if (stream?.isRunning === 'tool') {
			messages.push({ role: 'tool', text: '実行中…', toolName: stream.toolInfo.toolName });
		}

		return {
			threadId,
			messages: messages.slice(-MAX_MESSAGES),
			isRunning: !!stream?.isRunning,
			awaitingApproval: stream?.isRunning === 'awaiting_user',
			error: stream?.error?.message,
		};
	}

	private _toRemoteMessage(message: ChatMessage): RemoteChatMessage | undefined {
		switch (message.role) {
			case 'user':
				return { role: 'user', text: truncate(message.displayContent || message.content) };
			case 'assistant':
				return { role: 'assistant', text: truncate(message.displayContent) };
			case 'tool': {
				const text = message.type === 'tool_request' ? '承認待ち'
					: message.type === 'running_now' ? '実行中…'
						: message.type === 'rejected' ? '却下されました'
							: message.content;
				return { role: 'tool', text: truncate(text ?? ''), toolName: message.name };
			}
			case 'interrupted_streaming_tool':
				return { role: 'interrupted', text: '中断されました', toolName: message.name };
			case 'checkpoint':
				return { role: 'checkpoint', text: '' };
			case 'flow_review':
				return { role: 'system', text: truncate(`${message.flowRole}: ${message.mdFileName} (${message.status})`) };
			default:
				return undefined;
		}
	}

	private _threads(): RemoteThreadSummary[] {
		return Object.values(this._chatThreadService.state.allThreads)
			.filter((t): t is NonNullable<typeof t> => !!t && t.messages.length > 0)
			.sort((a, b) => b.lastModified.localeCompare(a.lastModified))
			.slice(0, MAX_THREADS)
			.map(t => ({
				threadId: t.id,
				title: this._threadTitle(t.id),
				lastModified: t.lastModified,
				messageCount: t.messages.length,
			}));
	}

	private _threadTitle(threadId: string): string {
		const firstUser = this._chatThreadService.state.allThreads[threadId]?.messages.find(m => m.role === 'user');
		const title = firstUser?.role === 'user' ? (firstUser.displayContent || firstUser.content).trim().split('\n')[0] : '';
		return truncate(title || '(無題)', 80);
	}

	// -----------------------------------------------------------------------
	// 入力の検証
	// -----------------------------------------------------------------------

	private _findTask(taskId: string): KanbanTask | null {
		return this._kanbanService.state.board.tasks.find(t => t.id === taskId) ?? null;
	}

	private _requireTask(taskId: string): KanbanTask {
		const task = this._findTask(taskId);
		if (!task) throw new HttpError(404, 'task_not_found', taskId);
		return task;
	}

	private _requireColumn(columnId: string): void {
		if (!this._kanbanService.state.board.columns.some(c => c.id === columnId)) throw new HttpError(404, 'column_not_found', columnId);
	}

	private _requireProject(projectId: string): DivisionProjectConfig {
		const project = this._divisionProjectService.projects.find(p => p.projectId === projectId);
		if (!project) throw new HttpError(404, 'project_not_found', projectId);
		return project;
	}

	private _requireThread(threadId: string): void {
		if (!this._chatThreadService.state.allThreads[threadId]) throw new HttpError(404, 'thread_not_found', threadId);
	}

	private _threadIdFrom(body: unknown): string {
		const threadId = optionalString(asObject(body).threadId) || this._remoteThreadId();
		this._requireThread(threadId);
		return threadId;
	}

	private _requireAwaitingApproval(threadId: string): void {
		if (this._chatThreadService.streamState[threadId]?.isRunning !== 'awaiting_user') {
			throw new HttpError(409, 'not_awaiting_approval', '承認待ちのツールはありません。');
		}
	}

	private _parseAgents(raw: unknown): RoleAssignment[] | undefined {
		if (!Array.isArray(raw)) return undefined;
		return raw.map((entry, i) => {
			const a = asObject(entry);
			const provider = requireString(a.provider, `agents[${i}].provider`);
			if (!(providerNames as string[]).includes(provider)) throw new HttpError(400, 'invalid_request', `agents[${i}].provider: unknown provider ${provider}`);
			return {
				role: requireString(a.role, `agents[${i}].role`) as AgentRole,
				provider: provider as ProviderName,
				model: requireString(a.model, `agents[${i}].model`),
			};
		});
	}

	/** ワークスペース内の相対パスだけを受け付ける ('..' でルートの外へ出るものは拒否) */
	private _resolveWorkspacePath(rawPath: string): { root: URI; uri: URI; path: string } {
		const root = this._workspaceContextService.getWorkspace().folders[0]?.uri;
		if (!root) throw new HttpError(409, 'no_workspace', 'IDE でフォルダが開かれていません。');
		const segments = rawPath.split(/[\\/]+/).filter(s => s && s !== '.');
		const uri = segments.length ? joinPath(root, ...segments) : root;
		if (!isEqualOrParent(uri, root)) throw new HttpError(403, 'outside_workspace', rawPath);
		return { root, uri, path: relativePath(root, uri) ?? '' };
	}

	/** コマンドの戻り値は何でもあり得るので、JSON にできないものは捨てる */
	private _toJson(value: unknown): unknown {
		if (value === undefined) return null;
		try {
			return JSON.parse(JSON.stringify(value)) ?? null;
		} catch {
			return null;
		}
	}
}

registerWorkbenchContribution2(OrchestraRemoteControlContribution.ID, OrchestraRemoteControlContribution, WorkbenchPhase.AfterRestored);
