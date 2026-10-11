/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// クラウドエージェント (レンダラー側)。
//
// Division API の /api/cloud-sessions を使って、クラウド (Daytona サンドボックス) 上で
// エージェントを動かす。ローカルのチャットとは独立していて、いくつでも並列に走らせられる。
//
// - 通信はすべて main プロセスの ICloudAgentMainService 経由 (Division に CORS が無いため)。
// - 状態はポーリングで追う。一覧は「動いているものがある / パネルが開いている」間は 4 秒ごと、
//   それ以外は 30 秒ごと。イベント (トランスクリプト) は選択中と実行中のセッションを 2 秒ごとに差分で取る。
// - 結果 (サンドボックス内のファイル変更) は、ローカルのワークスペースに「承認待ちの差分」として取り込む。
//   ローカルのチャットが Division の file operation を取り込むとき (chatThreadService.ts) と同じ手順。

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { VSBuffer, decodeBase64 } from '../../../../base/common/buffer.js';
import { ProxyChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { IMainProcessService } from '../../../../platform/ipc/common/mainProcessService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { IVoidModelService } from '../common/voidModelService.js';
import { DIVISION_API_BASE_URL } from '../common/divisionAuthConfig.js';
import {
	CLOUD_AGENT_CHANNEL_NAME,
	CLOUD_AGENTS_MAX_PARALLEL,
	CLOUD_AGENTS_OPEN_ACTION_ID,
	CLOUD_SESSIONS_API_PREFIX,
	CloudAgentResponse,
	CloudAgentUploadResult,
	CloudChange,
	CloudFileResponse,
	CloudSession,
	CloudSessionEvent,
	CloudWorkspaceInfo,
	ICloudAgentMainService,
	isCloudSessionActive,
} from '../common/cloudAgentTypes.js';
import { IEditCodeService } from './editCodeServiceInterface.js';
import {
	CloudAgentState,
	CloudApplyResult,
	CloudChangesState,
	CreateCloudSessionsOptions,
	ICloudAgentService,
} from './cloudAgentServiceInterface.js';


const LIST_INTERVAL_ACTIVE_MS = 4_000;
const LIST_INTERVAL_IDLE_MS = 30_000;
const EVENTS_INTERVAL_MS = 2_000;
const EVENTS_PAGE_LIMIT = 500;
/**
 * 作成 (サンドボックスの用意、最大 3 分ほど) と開始 (スナップショットの展開と base コミット、大きな
 * ワークスペースでは数分) はサーバー側で同期的に待つので長めにする
 */
const CREATE_TIMEOUT_MS = 300_000;
/** 変更一覧 (git diff) とファイル取得 */
const CHANGES_TIMEOUT_MS = 120_000;
/** それ以外 (一覧・イベント・停止・追加指示など) */
const DEFAULT_TIMEOUT_MS = 30_000;
/** 取り込み時に、差分を開いて見せるファイル数の上限 (全部開くとタブが溢れる) */
const MAX_FILES_TO_REVEAL = 5;
/** 取り込み時のファイル取得の同時実行数 */
const FETCH_CONCURRENCY = 4;

/** key を除いたコピー (状態は差し替えで更新するので、元のオブジェクトは触らない) */
const omitKey = <T>(obj: Record<string, T>, key: string): Record<string, T> => {
	const copy = { ...obj };
	delete copy[key];
	return copy;
};

const firstLine = (s: string) => (s.split('\n').find(l => l.trim()) ?? '').trim();

/** サーバーの相対パスとして安全か (絶対パス・.. ・バックスラッシュは拒否) */
const isSafeRelPath = (p: string) =>
	!!p && !p.startsWith('/') && !/^[A-Za-z]:/.test(p) && !p.includes('\\') && !p.split('/').some(seg => seg === '..' || seg === '');

/** NUL を含むものはテキストとして扱わない */
const looksBinary = (buf: VSBuffer) => {
	const n = Math.min(buf.byteLength, 8000);
	for (let i = 0; i < n; i++) if (buf.buffer[i] === 0) return true;
	return false;
};

/** Division API の HTTP エラーを、ユーザー向けの日本語にする (sendLLMMessage.impl.ts の divisionErrorMessage と同じ方針) */
export const describeCloudAgentError = (res: { status: number; error?: string; data?: any }): string => {
	const detail = (res.data && typeof res.data.error === 'string' ? res.data.error : '') || res.error || '';
	switch (res.status) {
		case 0:
			return `Division に接続できませんでした。ネットワークを確認してください。${detail ? ` (${detail})` : ''}`;
		case 401:
			return 'Division にログインしていないか、ログインの有効期限が切れています。一度ログアウトしてから、再度ログインしてください。';
		case 402:
			return 'クレジットが不足しているため、クラウドエージェントを実行できません。設定の「プラン・支払い方法を管理」からクレジットを追加してください。';
		case 403:
			return /Orchestra Plus/i.test(detail) || !detail
				? 'クラウドエージェントの実行には Orchestra Plus プランが必要です。設定の「プラン・支払い方法を管理」からアップグレードしてください。'
				: `この操作は許可されていません: ${detail}`;
		case 404:
			return `セッションが見つかりません (サーバーがクラウドエージェントに未対応の可能性があります)。${detail ? ` (${detail})` : ''}`;
		case 429:
			// 同時に動かせるセッション数 (1 ユーザー 10 個) の上限。サーバーの日本語メッセージをそのまま出す
			return detail || '同時に動かせるクラウドエージェントの上限 (10 個) に達しています。終わったものを停止 / アーカイブしてから再度お試しください。';
		case 413:
			return 'ファイルが大きすぎるため取得できません (3 MB 超)。';
		case 503:
			if (/DAYTONA_API_KEY/.test(detail)) {
				return 'サーバー側でクラウドのサンドボックスが設定されていないため、クラウドエージェントを使えません (管理者に連絡してください)。';
			}
			if (/Billing verification/i.test(detail)) {
				return 'Division 側でプラン・クレジットの確認ができませんでした (サーバー側の一時的な問題です)。しばらくしてから再度お試しください。';
			}
			return `Division が一時的に利用できません。しばらくしてから再度お試しください。${detail ? ` (${detail})` : ''}`;
		default:
			return `Division API エラー (HTTP ${res.status})${detail ? `: ${detail}` : ''}`;
	}
};


class CloudAgentService extends Disposable implements ICloudAgentService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChangeState = this._register(new Emitter<void>());
	readonly onDidChangeState: Event<void> = this._onDidChangeState.event;

	private readonly _main: ICloudAgentMainService;

	private _state: CloudAgentState = {
		sessions: [],
		eventsById: {},
		selectedId: null,
		loading: false,
		lastError: null,
		creating: false,
		creatingProgress: null,
		changesById: {},
		isLoggedIn: false,
		sendingById: {},
		workspaceName: null,
		focusFormRequest: 0,
	};
	get state(): CloudAgentState { return this._state; }

	/** セッションごとに、取得済みイベントの最大 seq */
	private readonly _lastSeqById = new Map<string, number>();
	private _paneVisible = false;
	private _listTimer: ReturnType<typeof setTimeout> | undefined;
	private _eventsTimer: ReturnType<typeof setTimeout> | undefined;
	private _listInFlight = false;
	private _eventsInFlight = false;
	private _listLoadedOnce = false;
	/** 401 を受けたら、トークンが変わるまでポーリングを止める */
	private _authFailedToken: string | null = null;
	private _lastToken = '';
	/** 作成直後のセッション (一覧 API にまだ出てこなくても消さない) → 作成時刻 */
	private readonly _recentlyCreated = new Map<string, number>();

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@IVoidSettingsService private readonly _settingsService: IVoidSettingsService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IWorkspaceContextService private readonly _workspaceService: IWorkspaceContextService,
		@IFileService private readonly _fileService: IFileService,
		@IDialogService private readonly _dialogService: IDialogService,
		@ICommandService private readonly _commandService: ICommandService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditCodeService private readonly _editCodeService: IEditCodeService,
		@IVoidModelService private readonly _voidModelService: IVoidModelService,
	) {
		super();
		this._main = ProxyChannel.toService<ICloudAgentMainService>(mainProcessService.getChannel(CLOUD_AGENT_CHANNEL_NAME));

		this._lastToken = this._token();
		this._state = { ...this._state, isLoggedIn: this._isLoggedIn(), workspaceName: this._workspaceFolder()?.name ?? null };

		this._register(this._settingsService.onDidChangeState(() => this._onSettingsChanged()));
		this._register(this._workspaceService.onDidChangeWorkspaceFolders(() => {
			this._setState({ workspaceName: this._workspaceFolder()?.name ?? null });
		}));
		this._register({ dispose: () => this._clearTimers() });

		// 起動直後は他の処理を邪魔しないよう、少し待ってから一覧を取る
		if (this._state.isLoggedIn) this._scheduleList(3_000);
		this._scheduleEvents(EVENTS_INTERVAL_MS);
	}


	// -----------------------------------------------------------------------
	// 状態
	// -----------------------------------------------------------------------

	private _setState(partial: Partial<CloudAgentState>) {
		this._state = { ...this._state, ...partial };
		this._onDidChangeState.fire();
	}

	private _setChanges(id: string, partial: Partial<CloudChangesState>) {
		const prev = this._state.changesById[id] ?? { loading: false };
		this._setState({ changesById: { ...this._state.changesById, [id]: { ...prev, ...partial } } });
	}

	private _token(): string {
		const g = this._settingsService.state.globalSettings;
		return g.divisionUserApiKey || g.divisionAccessToken || g.divisionApiKey || '';
	}

	private _isLoggedIn(): boolean {
		return !!this._settingsService.state.globalSettings.isLoggedIn && !!this._token();
	}

	private _endpoint(): string {
		return (this._settingsService.state.settingsOfProvider.divisionAPI?.endpoint || DIVISION_API_BASE_URL).trim().replace(/\/+$/, '');
	}

	private _workspaceFolder() {
		return this._workspaceService.getWorkspace().folders[0] ?? null;
	}

	private _onSettingsChanged() {
		const token = this._token();
		const isLoggedIn = this._isLoggedIn();
		const tokenChanged = token !== this._lastToken;
		this._lastToken = token;

		if (!isLoggedIn) {
			if (this._state.isLoggedIn || this._state.sessions.length) {
				// ログアウト: 他人に見えないよう、手元の一覧も消す
				this._lastSeqById.clear();
				this._listLoadedOnce = false;
				this._setState({ isLoggedIn: false, sessions: [], eventsById: {}, changesById: {}, selectedId: null, lastError: null, sendingById: {} });
			}
			this._clearListTimer();
			return;
		}
		if (!this._state.isLoggedIn || tokenChanged) {
			this._authFailedToken = null;
			this._setState({ isLoggedIn: true, lastError: null });
			this._scheduleList(0);
		}
	}

	private _upsertSession(session: CloudSession) {
		if (!session || typeof session.id !== 'string') return;
		const sessions = this._state.sessions;
		const idx = sessions.findIndex(s => s.id === session.id);
		const prev = idx >= 0 ? sessions[idx] : undefined;
		const next = idx >= 0
			? sessions.map((s, i) => i === idx ? session : s)
			: [session, ...sessions];
		this._setState({ sessions: next });
		if (prev) this._maybeNotifyTransition(prev, session);
	}

	/** 実行中 → 待機 / 失敗 に変わったら知らせる (パネルでそのセッションを見ているときは出さない) */
	private _maybeNotifyTransition(prev: CloudSession, next: CloudSession) {
		if (!isCloudSessionActive(prev.status)) return;
		if (next.status !== 'idle' && next.status !== 'failed') return;
		if (this._paneVisible && this._state.selectedId === next.id) return;

		const title = next.title || firstLine(next.prompt).slice(0, 60) || next.id;
		const message = next.status === 'idle'
			? `クラウドエージェント「${title}」が作業を終えました。${next.changedFiles ? ` (変更 ${next.changedFiles} ファイル)` : ''}`
			: `クラウドエージェント「${title}」が失敗しました。${next.errorMsg ? ` ${next.errorMsg}` : ''}`;
		this._notificationService.notify({
			severity: next.status === 'idle' ? Severity.Info : Severity.Warning,
			message,
			actions: {
				primary: [{
					id: 'orchestra.cloudAgents.showSession',
					label: '結果を見る',
					tooltip: '',
					class: undefined,
					enabled: true,
					run: () => {
						this.select(next.id);
						void this.openPane();
					},
				}],
			},
		});
	}


	// -----------------------------------------------------------------------
	// HTTP
	// -----------------------------------------------------------------------

	private async _request(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs?: number): Promise<CloudAgentResponse> {
		const token = this._token();
		if (!token) return { ok: false, status: 401, data: null, error: 'not logged in' };
		let res: CloudAgentResponse | undefined;
		try {
			res = await this._main.request({ endpoint: this._endpoint(), token, method, path, body: method === 'POST' ? (body ?? {}) : undefined, timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS });
		} catch (e) {
			res = { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : String(e) };
		}
		res = res ?? { ok: false, status: 0, data: null, error: 'request failed' };
		if (res.status === 401) {
			// トークンが変わる (ログインし直す) までポーリングしない
			this._authFailedToken = token;
		}
		return res;
	}

	private _sessionPath(id: string, suffix = '') {
		return `${CLOUD_SESSIONS_API_PREFIX}/${encodeURIComponent(id)}${suffix}`;
	}


	// -----------------------------------------------------------------------
	// ポーリング
	// -----------------------------------------------------------------------

	private _clearListTimer() {
		if (this._listTimer !== undefined) { clearTimeout(this._listTimer); this._listTimer = undefined; }
	}

	private _clearTimers() {
		this._clearListTimer();
		if (this._eventsTimer !== undefined) { clearTimeout(this._eventsTimer); this._eventsTimer = undefined; }
	}

	private _scheduleList(delayMs: number) {
		this._clearListTimer();
		this._listTimer = setTimeout(() => {
			this._listTimer = undefined;
			void this._pollList();
		}, delayMs);
	}

	private _nextListDelay(): number {
		const anyActive = this._state.sessions.some(s => isCloudSessionActive(s.status));
		return anyActive || this._paneVisible || this._state.creating ? LIST_INTERVAL_ACTIVE_MS : LIST_INTERVAL_IDLE_MS;
	}

	private _canPoll(): boolean {
		return this._isLoggedIn() && this._authFailedToken !== this._token();
	}

	private async _pollList() {
		if (!this._canPoll()) return; // ログインし直したら _onSettingsChanged が再開する
		if (this._listInFlight) { this._scheduleList(this._nextListDelay()); return; }
		this._listInFlight = true;
		const firstLoad = !this._listLoadedOnce;
		if (firstLoad) this._setState({ loading: true });
		try {
			const res = await this._request('GET', `${CLOUD_SESSIONS_API_PREFIX}?limit=50`);
			if (res.ok && Array.isArray(res.data?.sessions)) {
				this._listLoadedOnce = true;
				this._applyList(res.data.sessions as CloudSession[]);
				if (this._state.lastError && firstLoad) this._setState({ lastError: null });
			} else if (!res.ok && (firstLoad || res.status === 401 || this._paneVisible)) {
				this._setState({ lastError: describeCloudAgentError(res) });
			}
		} finally {
			this._listInFlight = false;
			if (firstLoad) this._setState({ loading: false });
			if (this._canPoll()) this._scheduleList(this._nextListDelay());
		}
	}

	private _applyList(list: CloudSession[]) {
		const prevById = new Map(this._state.sessions.map(s => [s.id, s]));
		const seen = new Set<string>();
		const sessions: CloudSession[] = [];
		for (const s of list) {
			if (!s || typeof s.id !== 'string' || seen.has(s.id)) continue;
			seen.add(s.id);
			sessions.push(s);
		}
		// まだ一覧に出てこない作成直後のセッションは残しておく (作成 API と一覧 API のタイミング差)
		const now = Date.now();
		for (const s of this._state.sessions) {
			const createdAt = this._recentlyCreated.get(s.id);
			if (seen.has(s.id)) { this._recentlyCreated.delete(s.id); continue; }
			if (createdAt !== undefined && now - createdAt < 30_000) sessions.unshift(s);
		}
		const selectedId = this._state.selectedId && sessions.some(s => s.id === this._state.selectedId) ? this._state.selectedId : null;
		this._setState({ sessions, selectedId });
		for (const s of sessions) {
			const prev = prevById.get(s.id);
			if (prev) this._maybeNotifyTransition(prev, s);
		}
	}

	private _scheduleEvents(delayMs: number) {
		if (this._eventsTimer !== undefined) clearTimeout(this._eventsTimer);
		this._eventsTimer = setTimeout(() => {
			this._eventsTimer = undefined;
			void this._pollEvents().finally(() => {
				if (!this._store.isDisposed) this._scheduleEvents(EVENTS_INTERVAL_MS);
			});
		}, delayMs);
	}

	/** イベントを取りに行くべきセッション: 選択中 (未取得・新着あり) と、動いているもの */
	private _eventTargets(): string[] {
		const targets: string[] = [];
		for (const s of this._state.sessions) {
			const lastSeq = this._lastSeqById.get(s.id);
			const isSelected = s.id === this._state.selectedId;
			const hasNew = lastSeq === undefined ? isSelected : s.lastSeq > lastSeq;
			if (isCloudSessionActive(s.status) || (isSelected && (lastSeq === undefined || hasNew)) || (hasNew && this._state.eventsById[s.id])) {
				targets.push(s.id);
			}
		}
		return targets;
	}

	private async _pollEvents() {
		if (this._eventsInFlight || !this._canPoll()) return;
		const targets = this._eventTargets();
		if (!targets.length) return;
		this._eventsInFlight = true;
		try {
			await Promise.all(targets.map(id => this._fetchEvents(id)));
		} finally {
			this._eventsInFlight = false;
		}
	}

	private async _fetchEvents(id: string) {
		// 長いトランスクリプトは 500 件ずつ。1 回のポーリングで取りに行くのは数ページまで
		for (let page = 0; page < 10; page++) {
			const after = this._lastSeqById.get(id) ?? 0;
			const res = await this._request('GET', `${this._sessionPath(id, '/events')}?after=${after}&limit=${EVENTS_PAGE_LIMIT}`);
			if (!res.ok) {
				if (res.status === 404) {
					// アーカイブ済み / 削除済み
					this._removeSessionLocally(id);
				}
				return;
			}
			const events: CloudSessionEvent[] = Array.isArray(res.data?.events) ? res.data.events : [];
			if (res.data?.session) this._upsertSession(res.data.session as CloudSession);
			this._appendEvents(id, events);
			if (events.length < EVENTS_PAGE_LIMIT) return;
		}
	}

	private _appendEvents(id: string, events: CloudSessionEvent[]) {
		const prevLast = this._lastSeqById.get(id) ?? 0;
		const fresh = events.filter(e => e && typeof e.seq === 'number' && e.seq > prevLast).sort((a, b) => a.seq - b.seq);
		const existing = this._state.eventsById[id];
		if (!fresh.length) {
			// 「取得済み」(空) を記録しておく。でないと選択中の空セッションを毎回取りに行く
			if (!this._lastSeqById.has(id)) this._lastSeqById.set(id, 0);
			if (!existing) this._setState({ eventsById: { ...this._state.eventsById, [id]: [] } });
			return;
		}
		this._lastSeqById.set(id, fresh[fresh.length - 1].seq);
		this._setState({ eventsById: { ...this._state.eventsById, [id]: [...(existing ?? []), ...fresh] } });

		// 新しい done が来たら、変更の一覧が古くなっているので読み直す (表示中のときだけ)
		if (fresh.some(e => e.type === 'done') && this._state.changesById[id]?.changes) {
			void this.loadChanges(id);
		}
	}

	private _removeSessionLocally(id: string) {
		this._lastSeqById.delete(id);
		this._recentlyCreated.delete(id);
		this._setState({
			sessions: this._state.sessions.filter(s => s.id !== id),
			eventsById: omitKey(this._state.eventsById, id),
			changesById: omitKey(this._state.changesById, id),
			selectedId: this._state.selectedId === id ? null : this._state.selectedId,
		});
	}


	// -----------------------------------------------------------------------
	// 公開メソッド
	// -----------------------------------------------------------------------

	async refresh(): Promise<void> {
		if (!this._isLoggedIn()) {
			this._setState({ isLoggedIn: false });
			return;
		}
		this._authFailedToken = null;
		this._clearListTimer();
		await this._pollList();
		await this._pollEvents();
	}

	async createSession(opts: CreateCloudSessionsOptions): Promise<CloudSession[]> {
		const prompt = (opts.prompt ?? '').trim();
		if (!prompt) return [];
		if (!this._isLoggedIn()) {
			this._setState({ lastError: 'クラウドエージェントを使うには、Orchestra にログインしてください。' });
			return [];
		}
		if (this._state.creating) return [];

		const requested = Number.isFinite(opts.count) ? Math.floor(opts.count!) : 1;
		const count = Math.max(1, Math.min(CLOUD_AGENTS_MAX_PARALLEL, requested));
		const folder = this._workspaceFolder();
		const folderPath = opts.includeWorkspace && folder && folder.uri.scheme === 'file' ? folder.uri.fsPath : null;
		if (opts.includeWorkspace && folder && folder.uri.scheme !== 'file') {
			this._notificationService.warn('リモートのフォルダはアップロードできないため、空のフォルダでクラウドエージェントを起動します。');
		}
		const baseTitle = (opts.title ?? '').trim();
		const model = (opts.model ?? '').trim();

		this._authFailedToken = null;
		this._setState({ creating: true, creatingProgress: count > 1 ? `${count} 個のセッションを準備しています…` : 'セッションを準備しています…', lastError: null });

		let uploaded = 0;
		const errors: string[] = [];
		const launchOne = async (i: number): Promise<CloudSession | null> => {
			const title = count > 1
				? `${baseTitle || firstLine(prompt).slice(0, 60)} #${i + 1}`
				: (baseTitle || undefined);
			const created = await this._request('POST', CLOUD_SESSIONS_API_PREFIX, {
				prompt,
				...(title ? { title } : {}),
				...(model ? { model } : {}),
				...(folder ? { workspaceName: folder.name } : {}),
			}, CREATE_TIMEOUT_MS);
			const session = created.ok ? created.data?.session as CloudSession | undefined : undefined;
			if (!session?.id) {
				errors.push(describeCloudAgentError(created.ok ? { status: created.status, error: '作成したセッションの情報が返ってきませんでした' } : created));
				return null;
			}
			this._recentlyCreated.set(session.id, Date.now());
			this._upsertSession(session);
			if (i === 0 || !this._state.selectedId) this.select(session.id);

			let workspaceInfo: CloudWorkspaceInfo | undefined;
			if (folderPath) {
				this._setState({ creatingProgress: `ワークスペースをアップロード中 (${uploaded}/${count})…` });
				let up: CloudAgentUploadResult;
				try {
					up = await this._main.uploadWorkspace({ endpoint: this._endpoint(), token: this._token(), sessionId: session.id, folderPath });
				} catch (e) {
					up = { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
				}
				if (!up?.ok) {
					const reason = up?.status ? describeCloudAgentError({ status: up.status, error: up.error }) : (up?.error ?? 'アップロードに失敗しました');
					errors.push(`ワークスペースを送れませんでした: ${reason}`);
					// 空のフォルダで勝手に走らせないよう、サンドボックスごと片付ける
					await this._request('POST', this._sessionPath(session.id, '/archive'), {});
					this._removeSessionLocally(session.id);
					return null;
				}
				uploaded++;
				this._setState({ creatingProgress: `ワークスペースをアップロード中 (${uploaded}/${count})…` });
				workspaceInfo = up.info;
			}

			const started = await this._request('POST', this._sessionPath(session.id, '/start'), workspaceInfo ? { workspaceInfo } : {}, CREATE_TIMEOUT_MS);
			if (!started.ok) {
				errors.push(`エージェントを開始できませんでした: ${describeCloudAgentError(started)}`);
				return session;
			}
			const startedSession = started.data?.session as CloudSession | undefined;
			if (startedSession?.id) {
				this._upsertSession(startedSession);
				return startedSession;
			}
			return session;
		};

		let results: (CloudSession | null)[] = [];
		try {
			// 並列数ぶんを同時に起動する (サーバー側でもそれぞれ独立したサンドボックスになる)
			results = await Promise.all(Array.from({ length: count }, (_, i) => launchOne(i).catch(e => {
				errors.push(e instanceof Error ? e.message : String(e));
				return null;
			})));
		} finally {
			const unique = [...new Set(errors)];
			this._setState({ creating: false, creatingProgress: null, lastError: unique.length ? unique.join('\n') : null });
			this._scheduleList(500);
		}
		return results.filter((s): s is CloudSession => !!s);
	}

	select(id: string | null): void {
		if (this._state.selectedId === id) return;
		this._setState({ selectedId: id });
		if (id && !this._lastSeqById.has(id)) {
			// 初めて開いたセッションは、すぐにトランスクリプトを取りに行く
			void this._fetchEvents(id);
		}
	}

	async sendMessage(id: string, text: string): Promise<boolean> {
		const trimmed = text.trim();
		if (!trimmed || this._state.sendingById[id]) return false;
		this._setState({ sendingById: { ...this._state.sendingById, [id]: true } });
		try {
			const res = await this._request('POST', this._sessionPath(id, '/messages'), { text: trimmed });
			if (!res.ok) {
				this._setState({ lastError: describeCloudAgentError(res) });
				return false;
			}
			if (res.data?.session) this._upsertSession(res.data.session as CloudSession);
			this._scheduleList(LIST_INTERVAL_ACTIVE_MS);
			void this._fetchEvents(id);
			return true;
		} finally {
			this._setState({ sendingById: omitKey(this._state.sendingById, id) });
		}
	}

	async stop(id: string): Promise<void> {
		const res = await this._request('POST', this._sessionPath(id, '/stop'), {});
		if (!res.ok) {
			this._setState({ lastError: describeCloudAgentError(res) });
			return;
		}
		if (res.data?.session) this._upsertSession(res.data.session as CloudSession);
		void this._fetchEvents(id);
	}

	async stopAll(): Promise<number> {
		const active = this._state.sessions.filter(s => isCloudSessionActive(s.status));
		await Promise.all(active.map(s => this.stop(s.id)));
		return active.length;
	}

	async archive(id: string): Promise<void> {
		const session = this._state.sessions.find(s => s.id === id);
		const { confirmed } = await this._dialogService.confirm({
			message: 'このクラウドエージェントをアーカイブしますか？',
			detail: `「${session?.title || id}」のサンドボックスを削除し、一覧から外します。取り込んでいない変更は失われます。`,
			primaryButton: 'アーカイブ',
			cancelButton: 'キャンセル',
		});
		if (!confirmed) return;
		const res = await this._request('POST', this._sessionPath(id, '/archive'), {});
		if (!res.ok && res.status !== 404) {
			this._setState({ lastError: describeCloudAgentError(res) });
			return;
		}
		this._removeSessionLocally(id);
	}

	async loadChanges(id: string): Promise<void> {
		this._setChanges(id, { loading: true, error: undefined });
		const res = await this._request('GET', this._sessionPath(id, '/changes'), undefined, CHANGES_TIMEOUT_MS);
		if (!res.ok) {
			this._setChanges(id, { loading: false, error: describeCloudAgentError(res) });
			return;
		}
		const changes: CloudChange[] = Array.isArray(res.data?.changes) ? res.data.changes : [];
		this._setChanges(id, {
			loading: false,
			changes,
			patch: typeof res.data?.patch === 'string' ? res.data.patch : '',
			patchTruncated: !!res.data?.patchTruncated,
			error: undefined,
		});
	}

	private async _fetchFile(id: string, relPath: string, ref: 'current' | 'base'): Promise<{ exists: boolean; buffer: VSBuffer } | { error: string }> {
		const res = await this._request('GET', `${this._sessionPath(id, '/file')}?path=${encodeURIComponent(relPath)}&ref=${ref}`, undefined, CHANGES_TIMEOUT_MS);
		if (!res.ok) return { error: describeCloudAgentError(res) };
		const data = res.data as CloudFileResponse | null;
		if (!data || !data.exists) return { exists: false, buffer: VSBuffer.alloc(0) };
		try {
			return { exists: true, buffer: decodeBase64(data.content ?? '') };
		} catch (e) {
			return { error: `ファイルの中身を読めませんでした: ${e instanceof Error ? e.message : String(e)}` };
		}
	}

	private async _readLocal(uri: URI): Promise<VSBuffer | null> {
		try {
			if (!(await this._fileService.exists(uri))) return null;
			return (await this._fileService.readFile(uri)).value;
		} catch {
			return null;
		}
	}

	async applyChanges(id: string, paths?: string[]): Promise<CloudApplyResult | null> {
		const folder = this._workspaceFolder();
		if (!folder) {
			this._setState({ lastError: '変更を取り込むには、先にフォルダを開いてください。' });
			return null;
		}
		if (this._state.changesById[id]?.applying) return null;
		if (!this._state.changesById[id]?.changes) await this.loadChanges(id);
		const all = this._state.changesById[id]?.changes;
		if (!all) return null;

		const wanted = paths ? new Set(paths) : null;
		const targets = all.filter(c => !wanted || wanted.has(c.path));
		if (!targets.length) return null;

		this._setChanges(id, { applying: true });
		const result: CloudApplyResult = { applied: [], conflicts: [], deleted: [], unchanged: [], failed: [] };
		const toDelete: string[] = [];
		const toReveal: URI[] = [];
		const root = folder.uri;
		const uriOf = (rel: string) => URI.joinPath(root, ...rel.split('/'));

		const applyOne = async (change: CloudChange) => {
			if (!isSafeRelPath(change.path) || (change.oldPath && !isSafeRelPath(change.oldPath))) {
				result.failed.push({ path: change.path, error: '不正なパスなので取り込みませんでした' });
				return;
			}
			if (change.status === 'deleted') {
				toDelete.push(change.path);
				return;
			}
			const target = uriOf(change.path);
			const [current, base] = await Promise.all([
				this._fetchFile(id, change.path, 'current'),
				change.status === 'added' ? Promise.resolve(null) : this._fetchFile(id, change.status === 'renamed' && change.oldPath ? change.oldPath : change.path, 'base'),
			]);
			if ('error' in current) { result.failed.push({ path: change.path, error: current.error }); return; }
			if (!current.exists) { toDelete.push(change.path); return; }

			const local = await this._readLocal(target);
			// 競合: ローカルのファイルがアップロード時 (base) から変わっている
			if (local) {
				if (local.equals(current.buffer)) {
					result.unchanged.push(change.path);
					if (change.status === 'renamed' && change.oldPath) toDelete.push(change.oldPath);
					return;
				}
				const baseBuf = base && !('error' in base) && base.exists ? base.buffer : null;
				if (change.status === 'added' || change.status === 'renamed' || !baseBuf || !local.equals(baseBuf)) {
					result.conflicts.push(change.path);
				}
			}

			try {
				if (change.binary || looksBinary(current.buffer)) {
					// バイナリは差分にできないので、そのまま書き込む
					await this._fileService.writeFile(target, current.buffer);
				} else {
					if (!local) {
						await this._fileService.createFolder(URI.joinPath(target, '..')).catch(() => { /* 既にある */ });
						if (!(await this._fileService.exists(target))) await this._fileService.createFile(target);
						this._editCodeService.markFileCreatedByAgent(target);
					}
					// 自動 accept はしない: 緑 / 赤の差分をエディタに残し、ユーザーが確認してから Accept / Reject する
					await this._voidModelService.initializeModel(target);
					await this._editCodeService.callBeforeApplyOrEdit(target);
					this._editCodeService.instantlyRewriteFile({ uri: target, newContent: current.buffer.toString() });
					if (toReveal.length < MAX_FILES_TO_REVEAL) toReveal.push(target);
				}
				result.applied.push(change.path);
				if (change.status === 'renamed' && change.oldPath) toDelete.push(change.oldPath);
			} catch (e) {
				result.failed.push({ path: change.path, error: e instanceof Error ? e.message : String(e) });
			}
		};

		try {
			// 同時に取りに行く数を絞る
			const queue = [...targets];
			await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, queue.length) }, async () => {
				while (queue.length) {
					const next = queue.shift()!;
					await applyOne(next);
				}
			}));

			// 削除は取り返しがつかないので、必ず確認する
			const existingDeletes: string[] = [];
			for (const rel of [...new Set(toDelete)]) {
				if (await this._fileService.exists(uriOf(rel))) existingDeletes.push(rel);
			}
			if (existingDeletes.length) {
				const list = existingDeletes.slice(0, 15).join('\n') + (existingDeletes.length > 15 ? `\n… ほか ${existingDeletes.length - 15} 件` : '');
				const { confirmed } = await this._dialogService.confirm({
					message: `クラウドエージェントが削除した ${existingDeletes.length} 個のファイルを、ローカルでも削除しますか？`,
					detail: list,
					primaryButton: '削除する',
					cancelButton: '削除しない',
				});
				if (confirmed) {
					for (const rel of existingDeletes) {
						const uri = uriOf(rel);
						try {
							await this._fileService.del(uri, { useTrash: true, recursive: false });
							result.deleted.push(rel);
						} catch {
							try {
								await this._fileService.del(uri, { useTrash: false, recursive: false });
								result.deleted.push(rel);
							} catch (e) {
								result.failed.push({ path: rel, error: e instanceof Error ? e.message : String(e) });
							}
						}
					}
				}
			}

			for (const uri of toReveal) {
				try {
					await this._editorService.openEditor({ resource: uri, options: { preserveFocus: true, pinned: false } });
				} catch { /* 見せられなくても取り込みは済んでいる */ }
			}
		} finally {
			this._setChanges(id, { applying: false, lastApply: result });
		}

		const parts: string[] = [];
		if (result.applied.length) parts.push(`${result.applied.length} ファイルを差分として取り込みました (エディタで確認して Accept / Reject してください)`);
		if (result.deleted.length) parts.push(`${result.deleted.length} ファイルを削除しました`);
		if (result.unchanged.length) parts.push(`${result.unchanged.length} ファイルは既に同じ内容でした`);
		if (result.conflicts.length) parts.push(`${result.conflicts.length} ファイルはローカルでも変更されていました (上書き差分になっているので、内容を確認してください)`);
		if (result.failed.length) parts.push(`${result.failed.length} ファイルは取り込めませんでした`);
		if (parts.length) {
			this._notificationService.notify({
				severity: result.failed.length || result.conflicts.length ? Severity.Warning : Severity.Info,
				message: `クラウドエージェントの変更: ${parts.join('。')}。`,
			});
		}
		return result;
	}

	async openPane(): Promise<void> {
		await this._commandService.executeCommand(CLOUD_AGENTS_OPEN_ACTION_ID);
	}

	setPaneVisible(visible: boolean): void {
		if (this._paneVisible === visible) return;
		this._paneVisible = visible;
		if (visible && this._canPoll()) {
			// 開いた瞬間に最新にする
			this._scheduleList(0);
		}
	}

	requestFocusForm(): void {
		this._setState({ focusFormRequest: this._state.focusFormRequest + 1 });
	}

	dismissError(): void {
		if (this._state.lastError) this._setState({ lastError: null });
	}
}

registerSingleton(ICloudAgentService, CloudAgentService, InstantiationType.Delayed);
