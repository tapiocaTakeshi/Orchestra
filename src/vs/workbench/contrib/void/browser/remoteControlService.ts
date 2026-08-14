/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Orchestra リモートコントロールのワークベンチ側。
//
// HTTP サーバ本体は electron-main/remoteControlChannel.ts にあり、ここには
//   「受け取ったリクエストをどのサービスに流すか」
// だけが書いてある。操作対象 (カンバン / Division プロジェクト / チャットスレッド /
// コマンド) のサービスはすべてレンダラ側にしか無いため。
//
// ウィンドウが複数開いている場合、サーバを持てるのは 1 つだけ。start() を投げた
// ウィンドウの ownerId が main 側に記録され、リクエストはその ownerId 付きで
// ブロードキャストされるので、他ウィンドウは自分宛でないものを捨てる。

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';

import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { providerNames } from '../common/voidSettingsTypes.js';
import { IKanbanService } from './kanbanService.js';
import { IDivisionProjectService, DivisionProjectConfig } from './divisionProjectService.js';
import { IChatThreadService } from './chatThreadService.js';
import { ChatMessage } from '../common/chatThreadServiceTypes.js';
import {
	buildPairingPayload,
	clampRemoteControlPort,
	emptyRemoteControlStatus,
	encodePairingUri,
	RemoteChatMessage,
	RemoteChatState,
	RemoteControlPairingPayload,
	RemoteControlRequest,
	RemoteControlServerStatus,
	RemoteDivisionState,
	RemoteIdeInfo,
	RemoteSnapshot,
	RemoteThreadSummary,
	REMOTE_CONTROL_CHANNEL,
	REMOTE_CONTROL_PROTOCOL_VERSION,
} from '../common/remoteControlTypes.js';


// 1 メッセージあたりモバイルへ返す本文の長さ。全文を返すとスマホ側が重くなる。
const MAX_MESSAGE_CHARS = 4000;
// チャット履歴として返す直近メッセージ数。
const MAX_MESSAGES = 60;
// ファイル一覧の打ち切り件数。
const MAX_DIR_ENTRIES = 500;

// 設定変更のたびに再起動しないよう、少し待ってからサーバへ反映する。
const APPLY_DEBOUNCE_MS = 300;

/** allowCommands が off でも通す、明らかに無害な操作。 */
const SAFE_COMMAND_IDS = new Set<string>([
	'workbench.action.files.save',
	'workbench.action.files.saveAll',
	'workbench.action.reloadWindow',
	'workbench.action.toggleSidebarVisibility',
	'workbench.action.terminal.new',
	'editor.action.formatDocument',
]);


export interface IRemoteControlService {
	readonly _serviceBrand: undefined;

	readonly status: RemoteControlServerStatus;
	readonly onDidChangeStatus: Event<RemoteControlServerStatus>;

	/** 設定を見てサーバを起動 / 停止する (設定変更時に自動で呼ばれる) */
	apply(): Promise<void>;
	/** 有効 / 無効を切り替える (設定 remoteControl.enabled も更新する) */
	setEnabled(enabled: boolean): Promise<void>;
	/** トークンを作り直す。既存のペアリングは無効になる */
	regenerateToken(): Promise<string>;
	/** QR / 手入力で渡す接続情報。サーバが動いていなければ null */
	getPairingPayload(): RemoteControlPairingPayload | null;
	getPairingUri(): string | null;
}

export const IRemoteControlService = createDecorator<IRemoteControlService>('remoteControlService');


// ---------------------------------------------------------------------------
// 変換ヘルパ
// ---------------------------------------------------------------------------

const truncate = (s: string, max = MAX_MESSAGE_CHARS): string =>
	s.length <= max ? s : `${s.slice(0, max)}\n…(${s.length - max} chars truncated)`;

const toRemoteMessage = (m: ChatMessage): RemoteChatMessage | null => {
	switch (m.role) {
		case 'user':
			return { role: 'user', text: truncate(m.displayContent || m.content || '') };
		case 'assistant':
			return { role: 'assistant', text: truncate(m.displayContent || '') };
		case 'tool':
			return { role: 'tool', toolName: m.name, text: truncate(m.content || '', 800) };
		case 'interrupted_streaming_tool':
			return { role: 'interrupted', toolName: m.name, text: '' };
		case 'checkpoint':
			return null; // モバイルに出しても操作しようがないので落とす
		case 'flow_review':
			return { role: 'system', text: truncate(`[${m.flowRole}] ${m.mdFileName}`, 400) };
		default:
			return null;
	}
};

const randomToken = (): string => `${generateUuid()}${generateUuid()}`.replace(/-/g, '').slice(0, 40);


class RemoteControlService extends Disposable implements IRemoteControlService {
	readonly _serviceBrand: undefined;

	private readonly _channel = this._mainProcessService.getChannel(REMOTE_CONTROL_CHANNEL);
	private readonly _ownerId = generateUuid();

	private readonly _onDidChangeStatus = this._register(new Emitter<RemoteControlServerStatus>());
	readonly onDidChangeStatus: Event<RemoteControlServerStatus> = this._onDidChangeStatus.event;

	private _status: RemoteControlServerStatus = emptyRemoteControlStatus();
	get status(): RemoteControlServerStatus { return this._status; }

	/** モバイルのポーリングで「変化があったか」を判定させるためのカウンタ */
	private _revision = 0;

	private readonly _applyScheduler = this._register(new RunOnceScheduler(() => { void this.apply(); }, APPLY_DEBOUNCE_MS));

	constructor(
		@IMainProcessService private readonly _mainProcessService: IMainProcessService,
		@IVoidSettingsService private readonly _settingsService: IVoidSettingsService,
		@IKanbanService private readonly _kanbanService: IKanbanService,
		@IDivisionProjectService private readonly _divisionProjectService: IDivisionProjectService,
		@IChatThreadService private readonly _chatThreadService: IChatThreadService,
		@ICommandService private readonly _commandService: ICommandService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IProductService private readonly _productService: IProductService,
		@IFileService private readonly _fileService: IFileService,
		@IEditorService private readonly _editorService: IEditorService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();

		this._register(this._channel.listen<RemoteControlRequest>('onRequest')(req => {
			void this._onRequest(req);
		}));

		this._register(this._channel.listen<RemoteControlServerStatus>('onDidChangeStatus')(status => {
			// 他ウィンドウが所有しているサーバの状態は自分の UI に出さない。
			if (status.ownerId && status.ownerId !== this._ownerId) return;
			this._status = status;
			this._onDidChangeStatus.fire(status);
		}));

		// state が動いたら revision を進める。モバイルは revision の変化だけ見ればよい。
		const bump = () => { this._revision++; };
		this._register(this._kanbanService.onDidChangeState(bump));
		this._register(this._divisionProjectService.onDidChangeProject(bump));
		this._register(this._chatThreadService.onDidChangeCurrentThread(bump));
		this._register(this._chatThreadService.onDidChangeStreamState(bump));

		this._register(this._settingsService.onDidChangeState(() => { this._applyScheduler.schedule(); }));

		void this._settingsService.waitForInitState.then(() => this.apply());
	}

	// -----------------------------------------------------------------------
	// ライフサイクル
	// -----------------------------------------------------------------------

	private get _settings() {
		return this._settingsService.state.globalSettings.remoteControl;
	}

	async apply(): Promise<void> {
		const settings = this._settings;
		if (!settings) return;

		if (!settings.enabled) {
			this._status = await this._channel.call<RemoteControlServerStatus>('stop', { ownerId: this._ownerId });
			this._onDidChangeStatus.fire(this._status);
			return;
		}

		// 有効化した時点でトークンが無ければ作る。
		let token = settings.token;
		if (!token) {
			token = randomToken();
			await this._settingsService.setGlobalSetting('remoteControl', { ...settings, token });
		}

		const status = await this._channel.call<RemoteControlServerStatus>('start', {
			ownerId: this._ownerId,
			port: clampRemoteControlPort(settings.port),
			token,
			allowLan: settings.allowLan,
		});

		this._status = status;
		this._onDidChangeStatus.fire(status);

		if (!status.running && status.error) {
			this._notificationService.notify({
				severity: Severity.Error,
				message: `Orchestra リモートコントロールを開始できませんでした: ${status.error}`,
			});
		}
	}

	async setEnabled(enabled: boolean): Promise<void> {
		await this._settingsService.setGlobalSetting('remoteControl', { ...this._settings, enabled });
		await this.apply();
	}

	async regenerateToken(): Promise<string> {
		const token = randomToken();
		await this._settingsService.setGlobalSetting('remoteControl', { ...this._settings, token });
		await this.apply();
		return token;
	}

	getPairingPayload(): RemoteControlPairingPayload | null {
		if (!this._status.running) return null;
		// LAN のアドレスがあればそれを優先する (スマホから 127.0.0.1 は届かない)。
		const url = this._status.addresses.find(a => !a.includes('127.0.0.1')) ?? this._status.addresses[0];
		if (!url) return null;
		return buildPairingPayload({
			url,
			token: this._settings.token,
			workspace: this._workspaceName(),
		});
	}

	getPairingUri(): string | null {
		const payload = this.getPairingPayload();
		return payload ? encodePairingUri(payload) : null;
	}

	// -----------------------------------------------------------------------
	// リクエストのディスパッチ
	// -----------------------------------------------------------------------

	private async _onRequest(req: RemoteControlRequest): Promise<void> {
		if (req.ownerId !== this._ownerId) return; // 他ウィンドウ宛

		let status = 200;
		let body: unknown;
		try {
			const result = await this._route(req);
			status = result.status;
			body = result.body;
		} catch (e) {
			status = 500;
			body = { error: 'internal_error', detail: e instanceof Error ? e.message : String(e) };
		}

		try {
			await this._channel.call('respond', { requestId: req.requestId, status, body });
		} catch {
			// 応答先が既に消えている (タイムアウト等) 場合は捨てる
		}
	}

	private _deny(feature: string): { status: number; body: unknown } {
		return { status: 403, body: { error: 'forbidden', detail: `${feature} は IDE 側の設定で無効になっています` } };
	}

	private async _route(req: RemoteControlRequest): Promise<{ status: number; body: unknown }> {
		const { method, path } = req;
		const segments = path.split('/').filter(s => !!s); // ['api', 'kanban', ...]
		const [, area, ...rest] = segments;
		const body = (req.body ?? {}) as Record<string, any>;
		const settings = this._settings;

		if (area === 'state' && method === 'GET') {
			return { status: 200, body: this._snapshot() };
		}
		if (area === 'ide') {
			if (method === 'GET') return { status: 200, body: this._ideInfo() };
		}

		// --- カンバン ---
		if (area === 'kanban') {
			if (method === 'GET' && rest.length === 0) {
				return { status: 200, body: { board: this._kanbanService.state.board, runtime: this._kanbanRuntime() } };
			}
			if (method !== 'GET' && !settings.allowKanbanWrites) return this._deny('カンバンの編集');
			return this._routeKanban(method, rest, body);
		}

		// --- Division プロジェクト ---
		if (area === 'division') {
			if (method === 'GET' && rest[0] === 'projects') {
				return { status: 200, body: this._divisionState() };
			}
			if (method === 'GET' && rest[0] === 'models') {
				return { status: 200, body: { providers: this._providerModels() } };
			}
			if (method !== 'GET' && !settings.allowProjectWrites) return this._deny('Division プロジェクトの編集');
			return this._routeDivision(method, rest, body);
		}

		// --- チャット (エージェント) ---
		if (area === 'chat') {
			if (method === 'GET' && rest.length === 0) return { status: 200, body: this._chatState() };
			if (method === 'GET' && rest[0] === 'threads') return { status: 200, body: { threads: this._threadSummaries() } };
			if (!settings.allowAgentPrompts) return this._deny('エージェントへの指示');
			return this._routeChat(method, rest, body);
		}

		// --- コマンド / ファイル ---
		if (area === 'commands') return this._routeCommands(method, rest, req.query, body);
		if (area === 'files') return this._routeFiles(method, rest, req.query, body);

		return { status: 404, body: { error: 'not_found', detail: path } };
	}

	// -----------------------------------------------------------------------
	// カンバン
	// -----------------------------------------------------------------------

	private _kanbanRuntime() {
		const s = this._kanbanService.state;
		return {
			isLoaded: s.isLoaded,
			source: s.source,
			isPolling: s.isPolling,
			isRunning: s.isRunning,
			awaitingApproval: s.awaitingApproval,
			runningTaskId: s.runningTaskId,
			queuedTaskIds: s.queuedTaskIds,
			lastPolledAt: s.lastPolledAt,
			lastError: s.lastError,
			autoRunEnabled: this._settingsService.state.globalSettings.kanban.autoRunEnabled,
		};
	}

	private async _routeKanban(method: string, rest: string[], body: Record<string, any>): Promise<{ status: number; body: unknown }> {
		const kanban = this._kanbanService;
		const [head, id, sub, subId] = rest;

		if (head === 'reload' && method === 'POST') {
			await kanban.reload();
			return { status: 200, body: { board: kanban.state.board } };
		}

		if (head === 'board' && method === 'PATCH') {
			if (typeof body.title === 'string') kanban.setBoardTitle(body.title);
			return { status: 200, body: { board: kanban.state.board } };
		}

		if (head === 'auto-run' && method === 'POST') {
			await kanban.setAutoRunEnabled(!!body.enabled);
			return { status: 200, body: this._kanbanRuntime() };
		}
		if (head === 'run-now' && method === 'POST') {
			void kanban.runNow(); // 実行は長いので待たない
			return { status: 202, body: { accepted: true } };
		}
		if (head === 'cancel' && method === 'POST') {
			await kanban.cancelCurrent();
			return { status: 200, body: this._kanbanRuntime() };
		}

		if (head === 'tasks') {
			if (method === 'POST' && !id) {
				const title = String(body.title ?? '').trim();
				if (!title) return { status: 400, body: { error: 'title_required' } };
				const task = kanban.createTask({
					title,
					columnId: body.columnId,
					description: body.description,
					labels: Array.isArray(body.labels) ? body.labels.map(String) : undefined,
					priority: body.priority,
					dueDate: body.dueDate,
					assignee: body.assignee,
				});
				return { status: 201, body: { task } };
			}
			if (!id) return { status: 404, body: { error: 'not_found' } };

			if (!sub) {
				if (method === 'PATCH') {
					kanban.updateTask(id, body);
					return { status: 200, body: { task: kanban.state.board.tasks.find(t => t.id === id) ?? null } };
				}
				if (method === 'DELETE') {
					kanban.deleteTask(id);
					return { status: 200, body: { deleted: id } };
				}
			}

			if (sub === 'move' && method === 'POST') {
				const columnId = String(body.columnId ?? '');
				if (!columnId) return { status: 400, body: { error: 'columnId_required' } };
				const index = Number.isFinite(body.index) ? Number(body.index) : 0;
				kanban.moveTask(id, columnId, index);
				return { status: 200, body: { task: kanban.state.board.tasks.find(t => t.id === id) ?? null } };
			}

			if (sub === 'run' && method === 'POST') {
				if (!this._settings.allowAgentPrompts) return this._deny('エージェントへの指示');
				void kanban.runTask(id); // 完了までは待たない (モバイルは state をポーリングする)
				return { status: 202, body: { accepted: true, taskId: id } };
			}

			if (sub === 'comments' && method === 'POST') {
				const text = String(body.body ?? body.text ?? '').trim();
				if (!text) return { status: 400, body: { error: 'body_required' } };
				kanban.addComment(id, text);
				return { status: 201, body: { task: kanban.state.board.tasks.find(t => t.id === id) ?? null } };
			}
			if (sub === 'comments' && method === 'DELETE' && subId) {
				kanban.deleteComment(id, subId);
				return { status: 200, body: { deleted: subId } };
			}

			if (sub === 'checklist') {
				if (method === 'POST' && !subId) {
					const text = String(body.text ?? '').trim();
					if (!text) return { status: 400, body: { error: 'text_required' } };
					kanban.addChecklistItem(id, text);
					return { status: 201, body: { task: kanban.state.board.tasks.find(t => t.id === id) ?? null } };
				}
				if (method === 'PATCH' && subId) {
					kanban.updateChecklistItem(id, subId, {
						text: typeof body.text === 'string' ? body.text : undefined,
						done: typeof body.done === 'boolean' ? body.done : undefined,
					});
					return { status: 200, body: { task: kanban.state.board.tasks.find(t => t.id === id) ?? null } };
				}
				if (method === 'DELETE' && subId) {
					kanban.deleteChecklistItem(id, subId);
					return { status: 200, body: { deleted: subId } };
				}
			}
		}

		if (head === 'columns') {
			if (method === 'POST' && !id) {
				const title = String(body.title ?? '').trim();
				if (!title) return { status: 400, body: { error: 'title_required' } };
				const column = kanban.addColumn(title);
				if (body.role || body.color || Number.isFinite(body.wipLimit)) {
					kanban.updateColumn(column.id, {
						role: body.role,
						color: body.color,
						wipLimit: Number.isFinite(body.wipLimit) ? Number(body.wipLimit) : undefined,
					});
				}
				return { status: 201, body: { column } };
			}
			if (id && method === 'PATCH') {
				kanban.updateColumn(id, body);
				return { status: 200, body: { column: kanban.state.board.columns.find(c => c.id === id) ?? null } };
			}
			if (id && method === 'DELETE') {
				kanban.deleteColumn(id, typeof body.moveTasksTo === 'string' ? body.moveTasksTo : undefined);
				return { status: 200, body: { deleted: id } };
			}
			if (id && sub === 'move' && method === 'POST') {
				kanban.moveColumn(id, Number(body.index ?? 0));
				return { status: 200, body: { board: kanban.state.board } };
			}
		}

		return { status: 404, body: { error: 'not_found', detail: `/api/kanban/${rest.join('/')}` } };
	}

	// -----------------------------------------------------------------------
	// Division プロジェクト
	// -----------------------------------------------------------------------

	private _divisionState(): RemoteDivisionState {
		const svc = this._divisionProjectService;
		return {
			projects: svc.projects.map(p => ({
				projectId: p.projectId,
				name: p.name,
				agents: p.agents.map(a => ({ role: String(a.role), provider: String(a.provider), model: String(a.model) })),
				isActive: svc.isProjectActive(p.projectId),
			})),
			activeProjectIds: svc.activeProjectIds,
			configPath: svc.projectConfigUri?.fsPath ?? null,
			hasProject: svc.hasProject,
		};
	}

	/** ロール割り当てを編集するときに選べるモデルの一覧 (非表示のものは除く)。 */
	private _providerModels() {
		const settingsOfProvider = this._settingsService.state.settingsOfProvider;
		return providerNames.map(providerName => ({
			provider: providerName,
			models: (settingsOfProvider[providerName]?.models ?? [])
				.filter(m => !m.isHidden)
				.map(m => m.modelName),
		})).filter(p => p.models.length > 0);
	}

	private _parseProjectBody(body: Record<string, any>, fallback?: DivisionProjectConfig): DivisionProjectConfig | null {
		const projectId = String(body.projectId ?? fallback?.projectId ?? '').trim();
		const name = String(body.name ?? fallback?.name ?? '').trim();
		if (!name) return null;
		const rawAgents = Array.isArray(body.agents) ? body.agents : fallback?.agents ?? [];
		const agents = rawAgents
			.filter((a: any) => a && typeof a === 'object')
			.map((a: any) => ({ role: a.role, provider: a.provider, model: String(a.model ?? '') }));
		return { projectId, name, agents } as DivisionProjectConfig;
	}

	private async _routeDivision(method: string, rest: string[], body: Record<string, any>): Promise<{ status: number; body: unknown }> {
		const svc = this._divisionProjectService;
		const [head, id, sub] = rest;

		if (head === 'sync' && method === 'POST') {
			if (id === 'pull') {
				const result = await svc.fetchFromSupabase(typeof body.projectId === 'string' ? body.projectId : undefined);
				return { status: result.success ? 200 : 502, body: result };
			}
			if (id === 'push') {
				const result = await svc.pushToSupabase();
				return { status: result.success ? 200 : 502, body: result };
			}
		}

		if (head === 'projects') {
			if (method === 'POST' && !id) {
				const config = this._parseProjectBody(body);
				if (!config) return { status: 400, body: { error: 'name_required' } };
				await svc.addProject(config);
				return { status: 201, body: this._divisionState() };
			}
			if (id && method === 'PATCH' && !sub) {
				const existing = svc.projects.find(p => p.projectId === id);
				if (!existing) return { status: 404, body: { error: 'project_not_found', detail: id } };
				const config = this._parseProjectBody(body, existing);
				if (!config) return { status: 400, body: { error: 'name_required' } };
				await svc.save({ ...config, projectId: existing.projectId });
				return { status: 200, body: this._divisionState() };
			}
			if (id && method === 'DELETE' && !sub) {
				await svc.removeProject(id);
				return { status: 200, body: this._divisionState() };
			}
			if (id && sub === 'activate' && method === 'POST') {
				if (body.exclusive === false) await svc.toggleActiveProject(id);
				else await svc.setActiveProject(id);
				return { status: 200, body: this._divisionState() };
			}
		}

		return { status: 404, body: { error: 'not_found', detail: `/api/division/${rest.join('/')}` } };
	}

	// -----------------------------------------------------------------------
	// チャット (エージェント)
	// -----------------------------------------------------------------------

	private _chatState(): RemoteChatState {
		const threadId = this._chatThreadService.state.currentThreadId;
		const thread = this._chatThreadService.state.allThreads[threadId];
		const stream = this._chatThreadService.streamState[threadId];

		const messages = (thread?.messages ?? [])
			.slice(-MAX_MESSAGES)
			.map(toRemoteMessage)
			.filter((m): m is RemoteChatMessage => !!m);

		// ストリーミング中の未確定テキストも見せる (スマホ側で進捗が分かるように)。
		if (stream?.isRunning === 'LLM' && stream.llmInfo?.displayContentSoFar) {
			messages.push({ role: 'assistant', text: truncate(stream.llmInfo.displayContentSoFar) });
		}
		if (stream?.isRunning === 'tool' && stream.toolInfo) {
			messages.push({ role: 'tool', toolName: stream.toolInfo.toolName, text: truncate(stream.toolInfo.content ?? '', 400) });
		}

		return {
			threadId,
			messages,
			isRunning: !!stream?.isRunning && stream.isRunning !== 'idle',
			awaitingApproval: stream?.isRunning === 'awaiting_user',
			error: stream?.error?.message,
		};
	}

	private _threadSummaries(): RemoteThreadSummary[] {
		const all = this._chatThreadService.state.allThreads;
		return Object.values(all)
			.filter((t): t is NonNullable<typeof t> => !!t)
			.map(t => ({
				threadId: t.id,
				title: (() => {
					const firstUser = t.messages.find(m => m.role === 'user');
					const raw = firstUser && firstUser.role === 'user' ? (firstUser.displayContent || firstUser.content) : '';
					return truncate(raw.split('\n')[0] || '(空のスレッド)', 80);
				})(),
				lastModified: t.lastModified,
				messageCount: t.messages.length,
			}))
			.sort((a, b) => (a.lastModified < b.lastModified ? 1 : -1))
			.slice(0, 50);
	}

	private async _routeChat(method: string, rest: string[], body: Record<string, any>): Promise<{ status: number; body: unknown }> {
		const chat = this._chatThreadService;
		const [head, id] = rest;

		if (head === 'message' && method === 'POST') {
			const message = String(body.message ?? '').trim();
			if (!message) return { status: 400, body: { error: 'message_required' } };
			if (body.newThread) chat.openNewThread();
			const threadId = typeof body.threadId === 'string' && body.threadId ? body.threadId : chat.state.currentThreadId;
			// エージェントの実行は数分かかるので投げっぱなしにし、状態はポーリングで拾わせる。
			void chat.addUserMessageAndStreamResponse({ userMessage: message, threadId });
			return { status: 202, body: { accepted: true, threadId } };
		}

		if (head === 'abort' && method === 'POST') {
			const threadId = typeof body.threadId === 'string' && body.threadId ? body.threadId : chat.state.currentThreadId;
			await chat.abortRunning(threadId);
			return { status: 200, body: this._chatState() };
		}

		if (head === 'new' && method === 'POST') {
			chat.openNewThread();
			return { status: 201, body: this._chatState() };
		}

		if (head === 'approve' && method === 'POST') {
			chat.approveLatestToolRequest(typeof body.threadId === 'string' && body.threadId ? body.threadId : chat.state.currentThreadId);
			return { status: 200, body: this._chatState() };
		}
		if (head === 'reject' && method === 'POST') {
			chat.rejectLatestToolRequest(typeof body.threadId === 'string' && body.threadId ? body.threadId : chat.state.currentThreadId);
			return { status: 200, body: this._chatState() };
		}

		if (head === 'threads' && id && method === 'POST') {
			if (!chat.state.allThreads[id]) return { status: 404, body: { error: 'thread_not_found', detail: id } };
			chat.switchToThread(id);
			return { status: 200, body: this._chatState() };
		}

		return { status: 404, body: { error: 'not_found', detail: `/api/chat/${rest.join('/')}` } };
	}

	// -----------------------------------------------------------------------
	// コマンド / ファイル
	// -----------------------------------------------------------------------

	private async _routeCommands(method: string, rest: string[], query: Record<string, string>, body: Record<string, any>): Promise<{ status: number; body: unknown }> {
		if (method === 'GET' && rest.length === 0) {
			const filter = (query.q ?? '').toLowerCase();
			const ids = [...CommandsRegistry.getCommands().keys()]
				.filter(id => !id.startsWith('_'))
				.filter(id => !filter || id.toLowerCase().includes(filter))
				.sort()
				.slice(0, 500);
			return { status: 200, body: { commands: ids } };
		}

		if (method === 'POST' && rest[0] === 'run') {
			const commandId = String(body.commandId ?? '').trim();
			if (!commandId) return { status: 400, body: { error: 'commandId_required' } };
			if (!this._settings.allowCommands && !SAFE_COMMAND_IDS.has(commandId)) return this._deny('コマンド実行');

			const args = Array.isArray(body.args) ? body.args : [];
			try {
				const result = await this._commandService.executeCommand(commandId, ...args);
				// コマンドの戻り値は任意のオブジェクトなので、JSON 化できる形だけ返す。
				let serialized: unknown = null;
				try { serialized = JSON.parse(JSON.stringify(result ?? null)); } catch { serialized = String(result); }
				return { status: 200, body: { commandId, result: serialized } };
			} catch (e) {
				return { status: 500, body: { error: 'command_failed', detail: e instanceof Error ? e.message : String(e) } };
			}
		}

		return { status: 404, body: { error: 'not_found', detail: `/api/commands/${rest.join('/')}` } };
	}

	private _resolveWorkspacePath(raw: string): URI | null {
		const folders = this._workspaceContextService.getWorkspace().folders;
		if (folders.length === 0) return null;
		const root = folders[0].uri;
		const rel = raw.replace(/^[\\/]+/, '');
		if (!rel) return root;
		// ワークスペースの外へ出る指定は弾く。
		if (rel.split(/[\\/]/).includes('..')) return null;
		return URI.joinPath(root, rel);
	}

	private async _routeFiles(method: string, rest: string[], query: Record<string, string>, body: Record<string, any>): Promise<{ status: number; body: unknown }> {
		if (method === 'GET' && rest[0] === 'list') {
			const uri = this._resolveWorkspacePath(query.path ?? '');
			if (!uri) return { status: 400, body: { error: 'invalid_path' } };
			try {
				const stat = await this._fileService.resolve(uri);
				const children = (stat.children ?? []).slice(0, MAX_DIR_ENTRIES).map(c => ({
					name: c.name,
					isDirectory: !!c.isDirectory,
					path: c.resource.fsPath,
				}));
				return { status: 200, body: { path: uri.fsPath, children } };
			} catch (e) {
				return { status: 404, body: { error: 'not_found', detail: e instanceof Error ? e.message : String(e) } };
			}
		}

		if (method === 'POST' && rest[0] === 'open') {
			const uri = this._resolveWorkspacePath(String(body.path ?? ''));
			if (!uri) return { status: 400, body: { error: 'invalid_path' } };
			await this._editorService.openEditor({ resource: uri, options: { pinned: true } });
			return { status: 200, body: { opened: uri.fsPath } };
		}

		return { status: 404, body: { error: 'not_found', detail: `/api/files/${rest.join('/')}` } };
	}

	// -----------------------------------------------------------------------
	// スナップショット
	// -----------------------------------------------------------------------

	private _workspaceName(): string {
		const folders = this._workspaceContextService.getWorkspace().folders;
		return folders[0]?.name ?? '';
	}

	private _ideInfo(): RemoteIdeInfo {
		const folders = this._workspaceContextService.getWorkspace().folders;
		return {
			protocolVersion: REMOTE_CONTROL_PROTOCOL_VERSION,
			appName: this._productService.nameLong ?? 'Orchestra',
			version: this._productService.version ?? '',
			workspaceName: this._workspaceName(),
			workspaceFolders: folders.map(f => f.uri.fsPath),
			uiLanguage: this._settingsService.state.globalSettings.uiLanguage,
		};
	}

	private _snapshot(): RemoteSnapshot {
		return {
			ide: this._ideInfo(),
			division: this._divisionState(),
			kanban: { board: this._kanbanService.state.board, runtime: this._kanbanRuntime() },
			chat: this._chatState(),
			threads: this._threadSummaries(),
			revision: this._revision,
			generatedAt: Date.now(),
		};
	}
}

registerSingleton(IRemoteControlService, RemoteControlService, InstantiationType.Eager);
