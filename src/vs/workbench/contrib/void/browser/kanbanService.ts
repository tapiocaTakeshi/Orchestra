/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Orchestra 内蔵カンバンのサービス。役割は 2 つある。
//
//  1. ボードの読み書き
//     ワークスペース直下の `.orchestra/kanban.json` が唯一の保存先。外部サービスを
//     介さないのでタスクは git に乗るし、オフラインでも動く。ファイルは人が直接
//     編集することもあるので、外部変更を watch して読み直す。
//     ワークスペースが開かれていない場合だけ、アプリのストレージへ退避する。
//
//  2. タスクのエージェント実行
//     カラムの「役割」を見て
//       todo カラムから拾う → in-progress へ移す → プロンプトを組み立てて流す
//         → 完了を待つ → 結果をコメントに残して done / error へ移す
//     と進める。エージェントは 1 スレッド 1 ループなので実行は必ず直列。

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IntervalTimer, RunOnceScheduler, timeout } from '../../../../base/common/async.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import {
	buildKanbanPrompt,
	columnWithRole,
	defaultKanbanBoard,
	defaultKanbanSettings,
	KANBAN_BOARD_FILE_RELPATH,
	KANBAN_MAX_RUNS_PER_TASK,
	KANBAN_MAX_SUMMARY_CHARS,
	KanbanBoard,
	KanbanColumn,
	KanbanRunRecord,
	KanbanRunStatus,
	KanbanServiceState,
	KanbanSettings,
	KanbanTask,
	MIN_KANBAN_POLL_INTERVAL_SEC,
	MIN_KANBAN_TASK_TIMEOUT_MIN,
	normalizeKanbanBoard,
} from '../common/kanbanServiceTypes.js';
import { IChatThreadService } from './chatThreadServiceInterface.js';

/** ワークスペースが無いときの退避先 */
const KANBAN_STORAGE_KEY = 'void.kanban.board';

/** 連続した編集を 1 回の書き込みにまとめる */
const SAVE_DEBOUNCE_MS = 400;

// addUserMessageAndStreamResponse は投げっぱなしで、ストリーム状態は少し遅れて
// 立ち上がる。開始を観測できないまま idle 判定しないよう、開始待ちに猶予を持たせる。
const STREAM_START_GRACE_MS = 15_000;
const STREAM_POLL_MS = 500;

export type NewKanbanTaskInput = {
	title: string;
	columnId?: string;
	description?: string;
	labels?: string[];
	priority?: KanbanTask['priority'];
	dueDate?: string;
	assignee?: string;
};

export interface IKanbanService {
	readonly _serviceBrand: undefined;

	readonly state: KanbanServiceState;
	onDidChangeState: Event<void>;

	/** ボードをディスクから読み直す */
	reload(): Promise<void>;
	/** ボードファイル (.orchestra/kanban.json) の場所。ストレージ保存中なら null */
	readonly boardFileUri: URI | null;

	// --- タスク ---
	createTask(input: NewKanbanTaskInput): KanbanTask;
	updateTask(taskId: string, patch: Partial<Omit<KanbanTask, 'id' | 'createdAt'>>): void;
	deleteTask(taskId: string): void;
	/** タスクを別カラム (または同カラム内の別位置) へ移す。index はそのカラム内での挿入位置 */
	moveTask(taskId: string, toColumnId: string, toIndex: number): void;
	addComment(taskId: string, body: string): void;
	deleteComment(taskId: string, commentId: string): void;
	addChecklistItem(taskId: string, text: string): void;
	updateChecklistItem(taskId: string, itemId: string, patch: { text?: string; done?: boolean }): void;
	deleteChecklistItem(taskId: string, itemId: string): void;

	// --- カラム ---
	setBoardTitle(title: string): void;
	addColumn(title: string): KanbanColumn;
	updateColumn(columnId: string, patch: Partial<Omit<KanbanColumn, 'id'>>): void;
	/** カラムを消す。中のタスクは moveTasksTo が指すカラムへ移す (未指定なら一緒に消える) */
	deleteColumn(columnId: string, moveTasksTo?: string): void;
	moveColumn(columnId: string, toIndex: number): void;

	// --- エージェント実行 ---
	/** todo カラムを 1 回さらって、対象タスクがあれば実行する */
	runNow(): Promise<void>;
	/** 指定タスクを今すぐ実行する (カラムやラベル条件を問わない) */
	runTask(taskId: string): Promise<void>;
	/** 実行中のタスクを中断する */
	cancelCurrent(): Promise<void>;
	/** 自動実行を開始 / 停止する (設定 autoRunEnabled も更新する) */
	setAutoRunEnabled(enabled: boolean): Promise<void>;
}

export const IKanbanService = createDecorator<IKanbanService>('kanbanService');

const clampPollIntervalSec = (n: number | undefined): number => {
	if (!Number.isFinite(n)) return 60;
	return Math.max(MIN_KANBAN_POLL_INTERVAL_SEC, Math.floor(n as number));
};

const clampTaskTimeoutMin = (n: number | undefined): number => {
	if (!Number.isFinite(n)) return 30;
	return Math.max(MIN_KANBAN_TASK_TIMEOUT_MIN, Math.floor(n as number));
};

const clampMaxTasksPerRun = (n: number | undefined): number => {
	if (!Number.isFinite(n)) return 1;
	return Math.min(20, Math.max(1, Math.floor(n as number)));
};

const errorMessageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const serializeBoard = (board: KanbanBoard): string => JSON.stringify(board, null, 2) + '\n';

class KanbanService extends Disposable implements IKanbanService {
	_serviceBrand: undefined;

	state: KanbanServiceState = {
		board: defaultKanbanBoard(),
		isLoaded: false,
		source: { kind: 'storage' },
		isPolling: false,
		isRunning: false,
		awaitingApproval: false,
		runningTaskId: null,
		queuedTaskIds: [],
		lastPolledAt: null,
		lastError: undefined,
	};

	private readonly _onDidChangeState = new Emitter<void>();
	readonly onDidChangeState: Event<void> = this._onDidChangeState.event;

	private _boardFileUri: URI | null = null;
	get boardFileUri(): URI | null { return this._boardFileUri; }

	/** 自分が書いた内容。watch の通知が自分の書き込みなら読み直さないために覚えておく */
	private _lastWrittenText: string | null = null;

	/** ボードファイルの watch。ワークスペースが切り替わるたびに張り直す */
	private readonly _boardFileWatch = this._register(new DisposableStore());

	private readonly _saveScheduler = this._register(new RunOnceScheduler(() => { void this._saveNow(); }, SAVE_DEBOUNCE_MS));

	/** ポーリングタイマー。_pollIntervalSecInUse が null なら止まっている */
	private readonly _pollTimer = this._register(new IntervalTimer());
	private _pollIntervalSecInUse: number | null = null;

	/** runNow / runTask / ポーリングの多重実行ガード */
	private _isProcessing = false;

	/**
	 * 自動実行が既に一度拾ったタスク。
	 *
	 * 普段は実行後に done / error カラムへ移るので todo からは消えるが、移動先のカラムが
	 * 用意されていないボードだと同じタスクが todo に残り続け、ポーリングのたびに永久に
	 * 実行されてしまう。それを防ぐための記録。ユーザーがそのタスクを編集するか動かした
	 * 時点で忘れるので、「直してもう一度流す」は普通にできる。
	 */
	private readonly _autoRunAttempted = new Set<string>();
	private _currentRunCts: CancellationTokenSource | null = null;
	private _currentRunThreadId: string | null = null;

	constructor(
		@IVoidSettingsService private readonly _settingsService: IVoidSettingsService,
		@IChatThreadService private readonly _chatThreadService: IChatThreadService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IFileService private readonly _fileService: IFileService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) {
		super();

		this._register(toDisposable(() => this._stopPolling()));
		this._register(this._settingsService.onDidChangeState(() => this._syncPollingWithSettings()));
		this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => { void this._initForWorkspace(); }));

		void this._initialize();
	}

	private async _initialize() {
		try {
			await this._initForWorkspace();
			await this._settingsService.waitForInitState;
			this._syncPollingWithSettings();
		} catch (e) {
			console.error('[Kanban] failed to initialize:', e);
		}
	}

	// -----------------------------------------------------------------------
	// 永続化
	// -----------------------------------------------------------------------

	private async _initForWorkspace(): Promise<void> {
		const folders = this._workspaceContextService.getWorkspace().folders;

		if (folders.length === 0) {
			// ワークスペースが無いのでファイルに置く場所が無い。アプリのストレージへ退避する。
			this._boardFileWatch.clear();
			this._boardFileUri = null;
			this._setState({ source: { kind: 'storage' } });
			this._loadFromStorage();
			return;
		}

		const uri = URI.joinPath(folders[0].uri, ...KANBAN_BOARD_FILE_RELPATH);
		this._boardFileUri = uri;
		this._setState({ source: { kind: 'file', path: uri.fsPath } });

		await this._loadFromFile();
		this._watchBoardFile(uri);
	}

	private _watchBoardFile(uri: URI) {
		this._boardFileWatch.clear();
		try {
			this._boardFileWatch.add(this._fileService.watch(uri));
			this._boardFileWatch.add(this._fileService.onDidFilesChange(e => {
				if (!e.affects(uri)) return;
				// 保存待ちの編集を抱えている間に読み直すと、その編集を捨ててしまう
				if (this._saveScheduler.isScheduled()) return;
				void this._loadFromFile({ externalOnly: true });
			}));
		} catch {
			// watch は best-effort。失敗しても手動の reload で読み直せる
		}
	}

	private async _loadFromFile(opts?: { externalOnly?: boolean }): Promise<void> {
		const uri = this._boardFileUri;
		if (!uri) return;

		try {
			const exists = await this._fileService.exists(uri);
			if (!exists) {
				// 既定のボードを書き出して、以降は普通のファイルとして扱う
				const board = defaultKanbanBoard();
				this._setState({ board, isLoaded: true, lastError: undefined });
				await this._saveNow();
				return;
			}

			const content = await this._fileService.readFile(uri);
			const text = content.value.toString();

			// 自分で書いた内容の通知なら何もしない (書く → watch → 読む のループを避ける)
			if (opts?.externalOnly && text === this._lastWrittenText) return;

			this._lastWrittenText = text;
			this._setState({ board: normalizeKanbanBoard(JSON.parse(text)), isLoaded: true, lastError: undefined });
		} catch (e) {
			// 壊れた JSON を既定のボードで上書きしてしまうと、手で直す機会を奪ってしまう。
			// 読めなかったことだけ伝えて、メモリ上のボードはそのまま残す。
			this._setState({ isLoaded: true, lastError: `${uri.fsPath} を読み込めませんでした: ${errorMessageOf(e)}` });
		}
	}

	private _loadFromStorage() {
		const raw = this._storageService.get(KANBAN_STORAGE_KEY, StorageScope.APPLICATION);
		if (!raw) {
			this._setState({ board: defaultKanbanBoard(), isLoaded: true });
			return;
		}
		try {
			this._setState({ board: normalizeKanbanBoard(JSON.parse(raw)), isLoaded: true, lastError: undefined });
		} catch {
			this._setState({ board: defaultKanbanBoard(), isLoaded: true });
		}
	}

	private async _saveNow(): Promise<void> {
		const text = serializeBoard(this.state.board);

		if (!this._boardFileUri) {
			this._storageService.store(KANBAN_STORAGE_KEY, text, StorageScope.APPLICATION, StorageTarget.MACHINE);
			return;
		}

		try {
			this._lastWrittenText = text;
			await this._fileService.writeFile(this._boardFileUri, VSBuffer.fromString(text));
			if (this.state.lastError) this._setState({ lastError: undefined });
		} catch (e) {
			this._setState({ lastError: `ボードを保存できませんでした: ${errorMessageOf(e)}` });
		}
	}

	async reload(): Promise<void> {
		if (this._boardFileUri) await this._loadFromFile();
		else this._loadFromStorage();
	}

	/** ボードを書き換えて、状態通知と保存予約をまとめて行う */
	private _mutateBoard(fn: (board: KanbanBoard) => KanbanBoard | void): void {
		const draft: KanbanBoard = {
			...this.state.board,
			columns: [...this.state.board.columns],
			tasks: [...this.state.board.tasks],
		};
		const result = fn(draft) ?? draft;
		result.updatedAt = Date.now();
		this._setState({ board: result });
		this._saveScheduler.schedule();
	}

	private _replaceTask(board: KanbanBoard, taskId: string, patch: (task: KanbanTask) => KanbanTask): void {
		const idx = board.tasks.findIndex(t => t.id === taskId);
		if (idx === -1) return;
		board.tasks[idx] = { ...patch(board.tasks[idx]), updatedAt: Date.now() };
	}

	// -----------------------------------------------------------------------
	// タスクの CRUD
	// -----------------------------------------------------------------------

	createTask(input: NewKanbanTaskInput): KanbanTask {
		const now = Date.now();
		const columnId = input.columnId && this.state.board.columns.some(c => c.id === input.columnId)
			? input.columnId
			: (columnWithRole(this.state.board, 'todo')?.id ?? this.state.board.columns[0].id);

		const task: KanbanTask = {
			id: generateUuid(),
			columnId,
			title: input.title.trim() || 'Untitled task',
			description: input.description ?? '',
			labels: input.labels ?? [],
			priority: input.priority ?? 'normal',
			dueDate: input.dueDate ?? '',
			assignee: input.assignee ?? '',
			checklist: [],
			comments: [],
			agentEnabled: true,
			createdAt: now,
			updatedAt: now,
			runs: [],
		};

		this._mutateBoard(board => { board.tasks.push(task); });
		return task;
	}

	updateTask(taskId: string, patch: Partial<Omit<KanbanTask, 'id' | 'createdAt'>>): void {
		this._autoRunAttempted.delete(taskId);
		this._mutateBoard(board => {
			this._replaceTask(board, taskId, task => ({ ...task, ...patch }));
		});
	}

	deleteTask(taskId: string): void {
		this._mutateBoard(board => { board.tasks = board.tasks.filter(t => t.id !== taskId); });
	}

	moveTask(taskId: string, toColumnId: string, toIndex: number): void {
		// ユーザーが動かしたということは「もう一度流していい」の合図。
		// 実行パイプライン自身の移動は _moveTaskCore を直に呼ぶので、ここは通らない。
		this._autoRunAttempted.delete(taskId);
		this._moveTaskCore(taskId, toColumnId, toIndex);
	}

	private _moveTaskCore(taskId: string, toColumnId: string, toIndex: number): void {
		this._mutateBoard(board => {
			if (!board.columns.some(c => c.id === toColumnId)) return;

			const task = board.tasks.find(t => t.id === taskId);
			if (!task) return;

			const moved: KanbanTask = { ...task, columnId: toColumnId, updatedAt: Date.now() };
			const without = board.tasks.filter(t => t.id !== taskId);

			// tasks はカラム横断の 1 本の配列なので、「移動先カラムの toIndex 番目」が
			// 全体配列のどこかに翻訳してから差し込む。
			const targetIds = without.filter(t => t.columnId === toColumnId).map(t => t.id);
			const clampedIndex = Math.max(0, Math.min(toIndex, targetIds.length));

			let insertAt: number;
			if (targetIds.length === 0) {
				insertAt = without.length; // 空のカラムへ入れる場合は末尾でよい
			} else if (clampedIndex === targetIds.length) {
				insertAt = without.findIndex(t => t.id === targetIds[targetIds.length - 1]) + 1;
			} else {
				insertAt = without.findIndex(t => t.id === targetIds[clampedIndex]);
			}

			without.splice(insertAt, 0, moved);
			board.tasks = without;
		});
	}

	addComment(taskId: string, body: string): void {
		const text = body.trim();
		if (!text) return;
		this._mutateBoard(board => {
			this._replaceTask(board, taskId, task => ({
				...task,
				comments: [...task.comments, { id: generateUuid(), author: 'user', body: text, createdAt: Date.now() }],
			}));
		});
	}

	deleteComment(taskId: string, commentId: string): void {
		this._mutateBoard(board => {
			this._replaceTask(board, taskId, task => ({
				...task,
				comments: task.comments.filter(c => c.id !== commentId),
			}));
		});
	}

	addChecklistItem(taskId: string, text: string): void {
		const trimmed = text.trim();
		if (!trimmed) return;
		this._mutateBoard(board => {
			this._replaceTask(board, taskId, task => ({
				...task,
				checklist: [...task.checklist, { id: generateUuid(), text: trimmed, done: false }],
			}));
		});
	}

	updateChecklistItem(taskId: string, itemId: string, patch: { text?: string; done?: boolean }): void {
		this._mutateBoard(board => {
			this._replaceTask(board, taskId, task => ({
				...task,
				checklist: task.checklist.map(item => item.id === itemId ? { ...item, ...patch } : item),
			}));
		});
	}

	deleteChecklistItem(taskId: string, itemId: string): void {
		this._mutateBoard(board => {
			this._replaceTask(board, taskId, task => ({
				...task,
				checklist: task.checklist.filter(item => item.id !== itemId),
			}));
		});
	}

	// -----------------------------------------------------------------------
	// カラムの CRUD
	// -----------------------------------------------------------------------

	setBoardTitle(title: string): void {
		this._mutateBoard(board => { board.title = title.trim() || 'Orchestra Board'; });
	}

	addColumn(title: string): KanbanColumn {
		const column: KanbanColumn = {
			id: generateUuid(),
			title: title.trim() || 'New column',
			role: 'none',
			wipLimit: 0,
			color: '',
		};
		this._mutateBoard(board => { board.columns.push(column); });
		return column;
	}

	updateColumn(columnId: string, patch: Partial<Omit<KanbanColumn, 'id'>>): void {
		this._mutateBoard(board => {
			const idx = board.columns.findIndex(c => c.id === columnId);
			if (idx === -1) return;

			// 役割は 1 カラムにつき 1 つ。付け替えたら、前に持っていたカラムからは外す。
			if (patch.role && patch.role !== 'none') {
				board.columns = board.columns.map(c =>
					c.id !== columnId && c.role === patch.role ? { ...c, role: 'none' as const } : c
				);
			}
			board.columns[idx] = { ...board.columns[idx], ...patch };
		});
	}

	deleteColumn(columnId: string, moveTasksTo?: string): void {
		this._mutateBoard(board => {
			if (board.columns.length <= 1) return; // 最後の 1 本は残す

			const destination = moveTasksTo && board.columns.some(c => c.id === moveTasksTo && c.id !== columnId)
				? moveTasksTo
				: null;

			board.columns = board.columns.filter(c => c.id !== columnId);
			board.tasks = destination
				? board.tasks.map(t => t.columnId === columnId ? { ...t, columnId: destination, updatedAt: Date.now() } : t)
				: board.tasks.filter(t => t.columnId !== columnId);
		});
	}

	moveColumn(columnId: string, toIndex: number): void {
		this._mutateBoard(board => {
			const from = board.columns.findIndex(c => c.id === columnId);
			if (from === -1) return;
			const [column] = board.columns.splice(from, 1);
			board.columns.splice(Math.max(0, Math.min(toIndex, board.columns.length)), 0, column);
		});
	}

	// -----------------------------------------------------------------------
	// 設定 / ポーリング
	// -----------------------------------------------------------------------

	private _kanbanSettings(): KanbanSettings {
		// 古い設定 JSON をインポートした直後などは kanban キーごと無いことがある
		return this._settingsService.state.globalSettings.kanban ?? defaultKanbanSettings;
	}

	private _syncPollingWithSettings() {
		const settings = this._kanbanSettings();
		const intervalSec = clampPollIntervalSec(settings.pollIntervalSec);

		if (!settings.autoRunEnabled) {
			if (this._pollIntervalSecInUse !== null) this._stopPolling();
			return;
		}
		if (this._pollIntervalSecInUse === intervalSec) return; // 既に正しい間隔で動いている

		this._startPolling(intervalSec);
	}

	private _startPolling(intervalSec: number) {
		this._pollTimer.cancelAndSet(() => { void this._pollAndRun('auto'); }, intervalSec * 1000);
		this._pollIntervalSecInUse = intervalSec;
		this._setState({ isPolling: true });

		// タイマーの最初の発火まで待たずに、有効化した直後に 1 回走らせる
		void this._pollAndRun('auto');
	}

	private _stopPolling() {
		this._pollTimer.cancel();
		this._pollIntervalSecInUse = null;
		if (this.state.isPolling) this._setState({ isPolling: false });
	}

	async setAutoRunEnabled(enabled: boolean): Promise<void> {
		if (enabled && !columnWithRole(this.state.board, 'todo')) {
			const error = '自動実行の対象になるカラム (役割: To Do) がありません。';
			this._setState({ lastError: error });
			this._notificationService.notify({ severity: Severity.Warning, message: `カンバン: ${error}` });
			return;
		}
		// setGlobalSetting → onDidChangeState → _syncPollingWithSettings でタイマーが張られる
		this._settingsService.setGlobalSetting('kanban', { ...this._kanbanSettings(), autoRunEnabled: enabled });
	}

	// -----------------------------------------------------------------------
	// エージェント実行
	// -----------------------------------------------------------------------

	async runNow(): Promise<void> {
		await this._pollAndRun('manual');
	}

	async runTask(taskId: string): Promise<void> {
		if (this._isProcessing) {
			this._notificationService.notify({ severity: Severity.Info, message: 'カンバン: 別のタスクを実行中です。完了までお待ちください。' });
			return;
		}
		const task = this.state.board.tasks.find(t => t.id === taskId);
		if (!task) return;

		this._isProcessing = true;
		try {
			await this._executeTask(task);
		} finally {
			this._isProcessing = false;
			this._setState({ isRunning: false, runningTaskId: null, queuedTaskIds: [], awaitingApproval: false });
		}
	}

	private async _pollAndRun(trigger: 'auto' | 'manual'): Promise<void> {
		if (this._isProcessing) {
			// 前回の実行がまだ終わっていない。自動ポーリングなら黙って見送る。
			if (trigger === 'manual') {
				this._notificationService.notify({ severity: Severity.Info, message: 'カンバン: タスクを実行中です。完了までお待ちください。' });
			}
			return;
		}

		const todoColumn = columnWithRole(this.state.board, 'todo');
		if (!todoColumn) {
			const error = '自動実行の対象になるカラム (役割: To Do) がありません。';
			this._setState({ lastError: error });
			if (trigger === 'manual') {
				this._notificationService.notify({ severity: Severity.Warning, message: `カンバン: ${error}` });
			}
			return;
		}

		this._isProcessing = true;
		try {
			const settings = this._kanbanSettings();
			const requiredLabel = settings.requiredLabel.trim().toLowerCase();

			const targets = this.state.board.tasks
				.filter(t => t.columnId === todoColumn.id)
				.filter(t => t.agentEnabled)
				.filter(t => !this._autoRunAttempted.has(t.id))
				.filter(t => !requiredLabel || t.labels.some(l => l.trim().toLowerCase() === requiredLabel))
				.slice(0, clampMaxTasksPerRun(settings.maxTasksPerRun));

			this._setState({ lastPolledAt: Date.now(), queuedTaskIds: targets.map(t => t.id), lastError: undefined });

			if (targets.length === 0) {
				if (trigger === 'manual') {
					this._notificationService.notify({ severity: Severity.Info, message: 'カンバン: 実行対象のタスクはありませんでした。' });
				}
				return;
			}

			for (const task of targets) {
				// 実行に入る前に記録する。途中でクラッシュしても同じタスクを繰り返さない。
				this._autoRunAttempted.add(task.id);
				await this._executeTask(task);
				this._setState({ queuedTaskIds: this.state.queuedTaskIds.filter(id => id !== task.id) });
			}
		} finally {
			this._isProcessing = false;
			this._setState({ isRunning: false, runningTaskId: null, queuedTaskIds: [], awaitingApproval: false });
		}
	}

	private async _executeTask(task: KanbanTask): Promise<void> {
		const settings = this._kanbanSettings();
		const startedAt = Date.now();

		const columnName = this.state.board.columns.find(c => c.id === task.columnId)?.title;
		const prompt = buildKanbanPrompt(task, {
			boardTitle: this.state.board.title,
			columnName,
			template: settings.promptTemplate,
		});

		if (settings.dryRun) {
			this._recordRun(task.id, {
				status: 'dry-run', startedAt, endedAt: Date.now(), summary: prompt,
			}, { moveTo: null, comment: false });
			this._notificationService.notify({
				severity: Severity.Info,
				message: `カンバン (dry run): 「${task.title}」のプロンプトを生成しました。実行はしていません。`,
			});
			return;
		}

		this._setState({ isRunning: true, runningTaskId: task.id });

		const inProgressColumn = columnWithRole(this.state.board, 'in-progress');
		if (inProgressColumn && inProgressColumn.id !== task.columnId) {
			this._moveTaskCore(task.id, inProgressColumn.id, 0);
		}

		// タスクごとに新規スレッドにしておくと、前のタスクの文脈を引きずらず、
		// カードと会話が 1 対 1 で対応する。
		if (settings.newThreadPerTask) this._chatThreadService.openNewThread();
		const threadId = this._chatThreadService.state.currentThreadId;

		let status: KanbanRunStatus = 'done';
		let error: string | undefined;
		let summary: string | undefined;

		const cts = new CancellationTokenSource();
		this._currentRunCts = cts;
		this._currentRunThreadId = threadId;

		try {
			await this._chatThreadService.addUserMessageAndStreamResponse({ userMessage: prompt, threadId });

			const outcome = await this._waitForThreadIdle(threadId, clampTaskTimeoutMin(settings.taskTimeoutMin) * 60_000, cts);
			status = outcome.status;
			error = outcome.error;

			if (status === 'timeout' || status === 'canceled') {
				await this._chatThreadService.abortRunning(threadId).catch(() => { /* noop */ });
			}
			summary = this._lastAssistantText(threadId);
		} catch (e) {
			status = 'error';
			error = errorMessageOf(e);
		} finally {
			this._currentRunCts = null;
			this._currentRunThreadId = null;
			cts.dispose();
		}

		const destinationRole = status === 'done' ? 'done' : 'error';
		const destination = columnWithRole(this.state.board, destinationRole);

		this._recordRun(task.id, { status, startedAt, endedAt: Date.now(), threadId, error, summary }, {
			moveTo: destination?.id ?? null,
			comment: settings.postResultComment,
		});

		this._setState({ isRunning: false, runningTaskId: null, awaitingApproval: false });

		this._notificationService.notify({
			severity: status === 'done' ? Severity.Info : Severity.Warning,
			message: status === 'done'
				? `カンバン: 「${task.title}」の実行が完了しました。`
				: `カンバン: 「${task.title}」の実行が ${status} で終了しました。${error ? ` (${error})` : ''}`,
		});
	}

	/** 実行結果をタスクへ書き戻す (履歴 / コメント / カラム移動をまとめて 1 回の保存にする) */
	private _recordRun(
		taskId: string,
		run: KanbanRunRecord,
		opts: { moveTo: string | null; comment: boolean },
	): void {
		const trimmedRun: KanbanRunRecord = {
			...run,
			summary: run.summary ? run.summary.slice(0, KANBAN_MAX_SUMMARY_CHARS) : undefined,
		};

		this._mutateBoard(board => {
			this._replaceTask(board, taskId, task => {
				const comments = opts.comment
					? [...task.comments, {
						id: generateUuid(),
						author: 'agent' as const,
						body: this._buildRunComment(trimmedRun),
						createdAt: Date.now(),
					}]
					: task.comments;

				return {
					...task,
					comments,
					runs: [trimmedRun, ...task.runs].slice(0, KANBAN_MAX_RUNS_PER_TASK),
				};
			});
		});

		if (opts.moveTo) this._moveTaskCore(taskId, opts.moveTo, 0);
	}

	private _buildRunComment(run: KanbanRunRecord): string {
		const statusLabel: Record<KanbanRunStatus, string> = {
			'done': '完了',
			'error': 'エラー',
			'timeout': 'タイムアウト',
			'canceled': '中断',
			'dry-run': 'ドライラン',
		};
		const durationSec = Math.round((run.endedAt - run.startedAt) / 1000);
		const lines = [`🎼 エージェント実行 — ${statusLabel[run.status]} (${durationSec}s)`, ''];
		if (run.error) lines.push(`エラー: ${run.error}`, '');
		lines.push(run.summary || '(エージェントからのテキスト出力はありませんでした)');
		return lines.join('\n');
	}

	/**
	 * スレッドのエージェントループが終わるまで待つ。
	 * isRunning が undefined = 動いていない、だが投げた直後はまだ立ち上がっていないので、
	 * 「一度でも走り出したのを観測する」か「猶予時間が過ぎる」までは idle 判定しない。
	 *
	 * isRunning === 'awaiting_user' はツール実行の承認待ち。無人実行では誰も承認しないので
	 * 最終的にタイムアウトするが、原因が分かるようにエラー文言を変えて返す。
	 */
	private async _waitForThreadIdle(
		threadId: string,
		timeoutMs: number,
		cts: CancellationTokenSource,
	): Promise<{ status: KanbanRunStatus; error?: string }> {
		const startedAt = Date.now();
		let hasStarted = false;
		let isAwaitingApproval = false;

		while (true) {
			if (cts.token.isCancellationRequested) return { status: 'canceled' };

			const streamState = this._chatThreadService.streamState[threadId];
			const isRunning = !!streamState?.isRunning;
			if (isRunning) hasStarted = true;

			const awaitingNow = streamState?.isRunning === 'awaiting_user';
			if (awaitingNow !== isAwaitingApproval) {
				isAwaitingApproval = awaitingNow;
				this._setState({ awaitingApproval: awaitingNow });
			}

			const elapsed = Date.now() - startedAt;
			if (!isRunning && (hasStarted || elapsed > STREAM_START_GRACE_MS)) {
				const streamError = streamState?.error;
				if (streamError) return { status: 'error', error: streamError.message };
				return { status: 'done' };
			}

			if (elapsed > timeoutMs) {
				return {
					status: 'timeout',
					error: isAwaitingApproval
						? `ツール実行の承認待ちのまま ${Math.round(timeoutMs / 60_000)} 分が経過しました。無人で流すなら Settings > Feature Options の Auto-approve を有効にしてください。`
						: `${Math.round(timeoutMs / 60_000)} 分以内に完了しませんでした。`,
				};
			}

			await timeout(STREAM_POLL_MS);
		}
	}

	/** スレッド末尾のアシスタント出力 (= 最終報告) を取り出す */
	private _lastAssistantText(threadId: string): string | undefined {
		const messages = this._chatThreadService.state.allThreads[threadId]?.messages ?? [];
		for (let i = messages.length - 1; i >= 0; i--) {
			const m = messages[i];
			if (m.role !== 'assistant') continue;
			const text = (m.displayContent || '').trim();
			if (text) return text;
		}
		return undefined;
	}

	async cancelCurrent(): Promise<void> {
		const threadId = this._currentRunThreadId;
		this._currentRunCts?.cancel();
		if (threadId) await this._chatThreadService.abortRunning(threadId).catch(() => { /* noop */ });
	}

	// -----------------------------------------------------------------------
	// state
	// -----------------------------------------------------------------------

	private _setState(partial: Partial<KanbanServiceState>) {
		this.state = { ...this.state, ...partial };
		this._onDidChangeState.fire();
	}
}

registerSingleton(IKanbanService, KanbanService, InstantiationType.Eager);
