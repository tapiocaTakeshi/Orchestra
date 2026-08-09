/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Trello 連携サービス。
//
// 「Trello の TODO リストに溜まっているカードを、プロンプトとして自動実行する」仕組み。
//
//   ポーリング (pollIntervalSec ごと)
//     → TODO リストのカードを取得
//     → 未処理 & ラベル条件を満たすカードをキューへ
//     → 1 枚ずつ直列に実行
//         1. カードを In Progress リストへ移動 (設定時)
//         2. カード内容からプロンプトを組み立て、チャットスレッドへ投げる
//         3. エージェントのループが終わるまで待つ (タイムアウトあり)
//         4. 結果をカードにコメント (設定時)、Done / Error リストへ移動 (設定時)
//
// エージェントは 1 スレッドで 1 本のループしか回せないので、実行は必ず直列。
// 同時に複数枚が走らないよう _isRunning でガードしている。

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { IntervalTimer, timeout } from '../../../../base/common/async.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import {
	buildTrelloPrompt,
	defaultTrelloSettings,
	MIN_TRELLO_CARD_TIMEOUT_MIN,
	MIN_TRELLO_POLL_INTERVAL_SEC,
	TRELLO_COMMENT_MARKER,
	TRELLO_MAX_HISTORY,
	TrelloBoard,
	TrelloCard,
	TrelloList,
	TrelloMember,
	TrelloRunEntry,
	TrelloRunStatus,
	TrelloServiceState,
	TrelloSettings,
} from '../common/trelloServiceTypes.js';
import { IChatThreadService } from './chatThreadService.js';

const TRELLO_API_BASE = 'https://api.trello.com/1';

// 実行済みカード ID の保存キー。カードを Done へ動かさない設定でも、
// 再起動をまたいで同じカードを二度実行しないようにする。
const PROCESSED_CARD_IDS_KEY = 'void.trello.processedCardIds';
const MAX_PROCESSED_CARD_IDS = 500;

// addUserMessageAndStreamResponse は「投げっぱなし」で、ストリーム状態は
// 少し遅れて立ち上がる。開始を観測できないまま idle 判定してしまわないよう、
// 開始待ちにこれだけ猶予を持たせる。
const STREAM_START_GRACE_MS = 15_000;
const STREAM_POLL_MS = 500;


export interface ITrelloService {
	readonly _serviceBrand: undefined;

	readonly state: TrelloServiceState; // NOT persisted
	onDidChangeState: Event<void>;

	/** 認証情報を検証し、成功したらボード一覧を取得する */
	testConnection(): Promise<{ success: boolean; error?: string }>;
	/** 選択中ボードのリスト一覧を取り直す */
	refreshLists(boardId?: string): Promise<void>;

	/** ポーリングを開始 / 停止する (設定 autoRunEnabled も更新する) */
	setAutoRunEnabled(enabled: boolean): Promise<void>;

	/** 今すぐ 1 回ポーリングして、対象カードがあれば実行する */
	runNow(): Promise<void>;

	/** 実行中のカードを中断する */
	cancelCurrent(): Promise<void>;

	/** 実行済みカードの記録を消す (同じカードをもう一度流したいとき) */
	clearProcessedCards(): void;
}

export const ITrelloService = createDecorator<ITrelloService>('trelloService');


const clampPollIntervalSec = (n: number | undefined): number => {
	if (!Number.isFinite(n)) return 60;
	return Math.max(MIN_TRELLO_POLL_INTERVAL_SEC, Math.floor(n as number));
};

const clampCardTimeoutMin = (n: number | undefined): number => {
	if (!Number.isFinite(n)) return 30;
	return Math.max(MIN_TRELLO_CARD_TIMEOUT_MIN, Math.floor(n as number));
};

const clampMaxCardsPerRun = (n: number | undefined): number => {
	if (!Number.isFinite(n)) return 1;
	return Math.min(20, Math.max(1, Math.floor(n as number)));
};

const errorMessageOf = (e: unknown): string =>
	e instanceof Error ? e.message : String(e);


class TrelloService extends Disposable implements ITrelloService {
	_serviceBrand: undefined;

	state: TrelloServiceState = {
		connection: { kind: 'unconfigured' },
		boards: [],
		lists: [],
		isPolling: false,
		isRunning: false,
		awaitingApproval: false,
		currentCard: null,
		queue: [],
		history: [],
		lastPolledAt: null,
		lastError: undefined,
	};

	private readonly _onDidChangeState = new Emitter<void>();
	readonly onDidChangeState: Event<void> = this._onDidChangeState.event;

	/** ポーリングタイマー。_pollIntervalSecInUse が null なら止まっている */
	private readonly _pollTimer = this._register(new IntervalTimer());
	/** ポーリング間隔が変わったときに張り直すため、現在の間隔を覚えておく */
	private _pollIntervalSecInUse: number | null = null;

	/** runNow / ポーリングの多重実行ガード */
	private _isProcessing = false;
	/** 実行中カードの中断トークン */
	private _currentRunCts: CancellationTokenSource | null = null;
	/** 実行中カードを流しているスレッド。中断時にこのスレッドを止める */
	private _currentRunThreadId: string | null = null;

	private _processedCardIds: string[] = [];

	constructor(
		@IVoidSettingsService private readonly _settingsService: IVoidSettingsService,
		@IChatThreadService private readonly _chatThreadService: IChatThreadService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		this._register(toDisposable(() => this._stopPolling()));
		this._register(this._settingsService.onDidChangeState(() => this._onSettingsChanged()));

		this._initialize();
	}

	private async _initialize() {
		try {
			await this._settingsService.waitForInitState;
			this._loadProcessedCardIds();

			const settings = this._trelloSettings();
			if (settings.apiKey && settings.token) {
				// 起動時に認証を検証しておくと、設定画面を開いた時点でボード一覧が出ている
				await this.testConnection();
				if (settings.boardId) await this.refreshLists(settings.boardId);
			}

			this._syncPollingWithSettings();
		} catch (e) {
			console.error('[Trello] failed to initialize:', e);
		}
	}


	// -----------------------------------------------------------------------
	// 設定
	// -----------------------------------------------------------------------

	private _trelloSettings(): TrelloSettings {
		// 古い設定 JSON をインポートした直後などは trello キーごと無いことがある
		return this._settingsService.state.globalSettings.trello ?? defaultTrelloSettings;
	}

	private _isConfigured(): { ok: true } | { ok: false; error: string } {
		const s = this._trelloSettings();
		if (!s.apiKey || !s.token) return { ok: false, error: 'Trello の API Key / Token が未設定です。' };
		if (!s.todoListId) return { ok: false, error: '実行対象の TODO リストが選択されていません。' };
		return { ok: true };
	}

	private _onSettingsChanged() {
		this._syncPollingWithSettings();
	}

	/** autoRunEnabled と pollIntervalSec を見て、タイマーを張る / 張り直す / 止める */
	private _syncPollingWithSettings() {
		const settings = this._trelloSettings();
		const shouldPoll = settings.autoRunEnabled && this._isConfigured().ok;
		const intervalSec = clampPollIntervalSec(settings.pollIntervalSec);

		if (!shouldPoll) {
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
		if (enabled) {
			const configured = this._isConfigured();
			if (!configured.ok) {
				this._setState({ lastError: configured.error });
				this._notificationService.notify({ severity: Severity.Warning, message: `Trello 自動実行を開始できません: ${configured.error}` });
				return;
			}
		}
		// setGlobalSetting → onDidChangeState → _syncPollingWithSettings でタイマーが張られる
		this._settingsService.setGlobalSetting('trello', { ...this._trelloSettings(), autoRunEnabled: enabled });
	}


	// -----------------------------------------------------------------------
	// Trello REST API
	// -----------------------------------------------------------------------

	private _authHeader(): Record<string, string> {
		const { apiKey, token } = this._trelloSettings();
		// クエリ文字列ではなくヘッダで渡す (URL やエラーログに鍵が残らないようにする)
		return { Authorization: `OAuth oauth_consumer_key="${apiKey}", oauth_token="${token}"` };
	}

	private async _api<T>(path: string, opts?: { method?: 'GET' | 'POST' | 'PUT'; query?: Record<string, string> }): Promise<T> {
		const url = new URL(`${TRELLO_API_BASE}${path}`);
		for (const [k, v] of Object.entries(opts?.query ?? {})) url.searchParams.set(k, v);

		const res = await fetch(url.toString(), {
			method: opts?.method ?? 'GET',
			headers: { ...this._authHeader(), Accept: 'application/json' },
		});

		if (!res.ok) {
			const body = await res.text().catch(() => '');
			const detail = body.trim().slice(0, 200);
			if (res.status === 401) throw new Error(`Trello 認証に失敗しました (401)。API Key / Token を確認してください。${detail ? ` — ${detail}` : ''}`);
			throw new Error(`Trello API エラー ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
		}

		// コメント投稿などボディを使わない呼び出しもあるので、パース失敗は無視する
		const text = await res.text();
		if (!text) return undefined as unknown as T;
		try { return JSON.parse(text) as T; }
		catch { return undefined as unknown as T; }
	}

	async testConnection(): Promise<{ success: boolean; error?: string }> {
		const { apiKey, token } = this._trelloSettings();
		if (!apiKey || !token) {
			this._setState({ connection: { kind: 'unconfigured' }, boards: [], lists: [] });
			return { success: false, error: 'API Key / Token が未設定です。' };
		}

		this._setState({ connection: { kind: 'checking' } });
		try {
			const member = await this._api<TrelloMember>('/members/me', { query: { fields: 'id,username,fullName' } });
			const boards = await this._api<TrelloBoard[]>('/members/me/boards', { query: { fields: 'id,name,closed,url', filter: 'open' } });
			this._setState({ connection: { kind: 'ok', member }, boards: boards ?? [], lastError: undefined });
			return { success: true };
		} catch (e) {
			const error = errorMessageOf(e);
			this._setState({ connection: { kind: 'error', error }, boards: [], lists: [] });
			return { success: false, error };
		}
	}

	async refreshLists(boardId?: string): Promise<void> {
		const id = boardId ?? this._trelloSettings().boardId;
		if (!id) { this._setState({ lists: [] }); return; }
		try {
			const lists = await this._api<TrelloList[]>(`/boards/${encodeURIComponent(id)}/lists`, { query: { fields: 'id,name,closed', filter: 'open' } });
			this._setState({ lists: lists ?? [], lastError: undefined });
		} catch (e) {
			this._setState({ lists: [], lastError: errorMessageOf(e) });
		}
	}

	private async _fetchTodoCards(): Promise<TrelloCard[]> {
		const { todoListId } = this._trelloSettings();
		const cards = await this._api<TrelloCard[]>(`/lists/${encodeURIComponent(todoListId)}/cards`, {
			query: {
				fields: 'id,idShort,name,desc,url,shortUrl,idList,idBoard,pos,due,dateLastActivity,labels',
				checklists: 'all',
				attachments: 'true',
				attachment_fields: 'id,name,url',
			},
		});
		return cards ?? [];
	}

	private async _moveCard(cardId: string, listId: string): Promise<void> {
		if (!listId) return;
		await this._api(`/cards/${encodeURIComponent(cardId)}`, { method: 'PUT', query: { idList: listId, pos: 'bottom' } });
	}

	private async _commentOnCard(cardId: string, text: string): Promise<void> {
		// Trello のコメントは 16384 文字まで。余裕を持って切る。
		const truncated = text.length > 15000 ? `${text.slice(0, 15000)}\n\n…(以下省略)` : text;
		await this._api(`/cards/${encodeURIComponent(cardId)}/actions/comments`, { method: 'POST', query: { text: truncated } });
	}


	// -----------------------------------------------------------------------
	// 実行済みカードの記録
	// -----------------------------------------------------------------------

	private _loadProcessedCardIds() {
		const raw = this._storageService.get(PROCESSED_CARD_IDS_KEY, StorageScope.APPLICATION);
		if (!raw) { this._processedCardIds = []; return; }
		try {
			const parsed = JSON.parse(raw);
			this._processedCardIds = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
		} catch {
			this._processedCardIds = [];
		}
	}

	private _markCardProcessed(cardId: string) {
		if (this._processedCardIds.includes(cardId)) return;
		this._processedCardIds.push(cardId);
		if (this._processedCardIds.length > MAX_PROCESSED_CARD_IDS) {
			this._processedCardIds = this._processedCardIds.slice(-MAX_PROCESSED_CARD_IDS);
		}
		this._storageService.store(PROCESSED_CARD_IDS_KEY, JSON.stringify(this._processedCardIds), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	clearProcessedCards(): void {
		this._processedCardIds = [];
		this._storageService.store(PROCESSED_CARD_IDS_KEY, JSON.stringify([]), StorageScope.APPLICATION, StorageTarget.MACHINE);
		this._setState({ lastError: undefined });
	}


	// -----------------------------------------------------------------------
	// ポーリング + 実行
	// -----------------------------------------------------------------------

	async runNow(): Promise<void> {
		await this._pollAndRun('manual');
	}

	private async _pollAndRun(trigger: 'auto' | 'manual'): Promise<void> {
		if (this._isProcessing) {
			// 前回の実行がまだ終わっていない。自動ポーリングなら黙って見送る。
			if (trigger === 'manual') {
				this._notificationService.notify({ severity: Severity.Info, message: 'Trello タスクを実行中です。完了までお待ちください。' });
			}
			return;
		}

		const configured = this._isConfigured();
		if (!configured.ok) {
			this._setState({ lastError: configured.error });
			if (trigger === 'manual') {
				this._notificationService.notify({ severity: Severity.Warning, message: `Trello: ${configured.error}` });
			}
			return;
		}

		this._isProcessing = true;
		try {
			const settings = this._trelloSettings();
			let cards: TrelloCard[];
			try {
				cards = await this._fetchTodoCards();
				this._setState({ lastPolledAt: Date.now(), lastError: undefined });
			} catch (e) {
				this._setState({ lastPolledAt: Date.now(), lastError: errorMessageOf(e) });
				if (trigger === 'manual') {
					this._notificationService.notify({ severity: Severity.Error, message: `Trello の取得に失敗しました: ${errorMessageOf(e)}` });
				}
				return;
			}

			const targets = cards
				.filter(card => !this._processedCardIds.includes(card.id))
				.filter(card => this._matchesRequiredLabel(card, settings.requiredLabel))
				.slice(0, clampMaxCardsPerRun(settings.maxCardsPerRun));

			this._setState({ queue: targets.map(c => ({ id: c.id, name: c.name, url: c.shortUrl || c.url })) });

			if (targets.length === 0) {
				if (trigger === 'manual') {
					this._notificationService.notify({ severity: Severity.Info, message: 'Trello: 実行対象の未処理カードはありませんでした。' });
				}
				return;
			}

			for (const card of targets) {
				await this._executeCard(card);
				this._setState({ queue: this.state.queue.filter(q => q.id !== card.id) });
			}
		} finally {
			this._isProcessing = false;
			this._setState({ isRunning: false, currentCard: null, queue: [], awaitingApproval: false });
		}
	}

	private _matchesRequiredLabel(card: TrelloCard, requiredLabel: string): boolean {
		const required = requiredLabel.trim();
		if (!required) return true;
		return (card.labels ?? []).some(l => (l.name || '').trim().toLowerCase() === required.toLowerCase());
	}

	private async _executeCard(card: TrelloCard): Promise<void> {
		const settings = this._trelloSettings();
		const cardUrl = card.shortUrl || card.url;
		const startedAt = Date.now();

		const boardName = this.state.boards.find(b => b.id === card.idBoard)?.name;
		const listName = this.state.lists.find(l => l.id === card.idList)?.name;
		const prompt = buildTrelloPrompt(card, { boardName, listName, template: settings.promptTemplate });

		// 実行に入る前に記録しておく。途中でクラッシュしても同じカードを無限に
		// 繰り返さないようにするため。
		this._markCardProcessed(card.id);

		if (settings.dryRun) {
			this._pushHistory({
				cardId: card.id, cardName: card.name, cardUrl,
				status: 'dry-run', startedAt, endedAt: Date.now(),
				resultSummary: prompt,
			});
			this._notificationService.notify({ severity: Severity.Info, message: `Trello (dry run): 「${card.name}」のプロンプトを生成しました。実行はしていません。` });
			return;
		}

		this._setState({ isRunning: true, currentCard: { id: card.id, name: card.name, url: cardUrl } });

		if (settings.inProgressListId) {
			try { await this._moveCard(card.id, settings.inProgressListId); }
			catch (e) { console.error('[Trello] failed to move card to In Progress:', e); }
		}

		// スレッドを用意する。カードごとに新規スレッドにしておくと、前のカードの
		// 文脈を引きずらず、Trello のコメントとスレッドが 1 対 1 で対応する。
		if (settings.newThreadPerCard) this._chatThreadService.openNewThread();
		const threadId = this._chatThreadService.state.currentThreadId;

		let status: TrelloRunStatus = 'done';
		let error: string | undefined;
		let resultSummary: string | undefined;

		const cts = new CancellationTokenSource();
		this._currentRunCts = cts;
		this._currentRunThreadId = threadId;

		try {
			await this._chatThreadService.addUserMessageAndStreamResponse({ userMessage: prompt, threadId });

			const outcome = await this._waitForThreadIdle(threadId, clampCardTimeoutMin(settings.cardTimeoutMin) * 60_000, cts);
			status = outcome.status;
			error = outcome.error;

			if (status === 'timeout' || status === 'canceled') {
				await this._chatThreadService.abortRunning(threadId).catch(() => { /* noop */ });
			}
			resultSummary = this._lastAssistantText(threadId);
		} catch (e) {
			status = 'error';
			error = errorMessageOf(e);
		} finally {
			this._currentRunCts = null;
			this._currentRunThreadId = null;
			cts.dispose();
		}

		const entry: TrelloRunEntry = {
			cardId: card.id, cardName: card.name, cardUrl,
			status, startedAt, endedAt: Date.now(), threadId, error, resultSummary,
		};
		this._pushHistory(entry);

		// 結果の書き戻し。ここで失敗しても実行自体は済んでいるので、握りつぶさず
		// lastError に出すだけにする。
		try {
			if (settings.postCommentOnDone) {
				await this._commentOnCard(card.id, this._buildComment(entry));
			}
			const destination = status === 'done' ? settings.doneListId : settings.errorListId;
			if (destination) await this._moveCard(card.id, destination);
		} catch (e) {
			this._setState({ lastError: `カードへの書き戻しに失敗しました: ${errorMessageOf(e)}` });
		}

		this._setState({ isRunning: false, currentCard: null, awaitingApproval: false });

		this._notificationService.notify({
			severity: status === 'done' ? Severity.Info : Severity.Warning,
			message: status === 'done'
				? `Trello: 「${card.name}」の実行が完了しました。`
				: `Trello: 「${card.name}」の実行が ${status} で終了しました。${error ? ` (${error})` : ''}`,
		});
	}

	private _buildComment(entry: TrelloRunEntry): string {
		const statusLabel: Record<TrelloRunStatus, string> = {
			'running': '実行中',
			'done': '完了',
			'error': 'エラー',
			'timeout': 'タイムアウト',
			'canceled': '中断',
			'dry-run': 'ドライラン',
		};
		const durationSec = Math.round(((entry.endedAt ?? Date.now()) - entry.startedAt) / 1000);
		const lines = [
			`${TRELLO_COMMENT_MARKER} — ${statusLabel[entry.status]} (${durationSec}s)`,
			'',
		];
		if (entry.error) lines.push(`エラー: ${entry.error}`, '');
		if (entry.resultSummary) lines.push(entry.resultSummary);
		else lines.push('(エージェントからのテキスト出力はありませんでした)');
		return lines.join('\n');
	}

	/**
	 * スレッドのエージェントループが終わるまで待つ。
	 * isRunning が undefined = 動いていない、だが投げた直後はまだ立ち上がっていないので、
	 * 「一度でも走り出したのを観測する」か「猶予時間が過ぎる」までは idle 判定しない。
	 *
	 * isRunning === 'awaiting_user' はツール実行の承認待ち。無人実行では誰も承認しないため
	 * 最終的にタイムアウトするが、原因が分かるようにエラー文言を変えて返す。
	 */
	private async _waitForThreadIdle(
		threadId: string,
		timeoutMs: number,
		cts: CancellationTokenSource,
	): Promise<{ status: TrelloRunStatus; error?: string }> {
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

	private _setState(partial: Partial<TrelloServiceState>) {
		this.state = { ...this.state, ...partial };
		this._onDidChangeState.fire();
	}

	private _pushHistory(entry: TrelloRunEntry) {
		this._setState({ history: [entry, ...this.state.history].slice(0, TRELLO_MAX_HISTORY) });
	}
}

registerSingleton(ITrelloService, TrelloService, InstantiationType.Eager);
