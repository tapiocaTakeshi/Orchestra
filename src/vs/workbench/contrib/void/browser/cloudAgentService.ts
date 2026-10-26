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
// - GitHub アカウント連携 (/api/github): 連携するとリポジトリとブランチを一覧から選んで始められる。
//   トークンは Division のサーバーだけが持ち、clone もサーバーがそのトークンで行う (非公開リポジトリも可)。
//   連携はシステムのブラウザで完了するので、/status を 2 秒ごと (最大 5 分) とウィンドウに戻ったときに確かめる。

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
import { IHostService } from '../../../services/host/browser/host.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IVoidSettingsService } from '../common/voidSettingsService.js';
import { IVoidModelService } from '../common/voidModelService.js';
import { DIVISION_API_BASE_URL } from '../common/divisionAuthConfig.js';
import { ensureDivisionSession } from '../common/divisionSession.js';
import {
	CLOUD_AGENT_CHANNEL_NAME,
	CLOUD_AGENTS_MAX_PARALLEL,
	CLOUD_AGENTS_OPEN_ACTION_ID,
	CLOUD_DIVISION_PROJECT_MODEL,
	CLOUD_GOAL_LOOP_DEFAULT,
	CLOUD_SESSIONS_API_PREFIX,
	CloudGoalLoopMode,
	isCloudGoalLoopMode,
	CloudAgentResponse,
	CloudAgentUploadResult,
	CloudApprovalAction,
	CloudChange,
	CloudFileResponse,
	CloudPendingApproval,
	CloudPullRequest,
	CloudPullRequestInfo,
	CloudPullRequestResult,
	CLOUD_PR_ERROR_CODES,
	CloudSession,
	CloudSessionEvent,
	CloudStartRepo,
	CloudWorkspaceInfo,
	GITHUB_API_PREFIX,
	GITHUB_NOT_CONFIGURED,
	GITHUB_NOT_CONNECTED,
	GitHubRepo,
	GitHubStatus,
	ICloudAgentMainService,
	CreateCloudPullRequestParams,
	cloudRepoFolderName,
	isCloudSessionActive,
	isGitHubRepoSession,
	updatablePullRequest,
	validateCloudPullRequestBranch,
	validateCloudPullRequestFields,
	validateCloudRepoBranch,
	validateCloudRepoUrl,
	validateGitHubFullName,
} from '../common/cloudAgentTypes.js';
import { IEditCodeService } from './editCodeServiceInterface.js';
import {
	CloudAgentState,
	CloudApiError,
	CloudApplyResult,
	CloudApprovalState,
	CloudChangesState,
	CloudGitHubBranchesState,
	CloudGitHubPick,
	CloudGitHubReposState,
	CloudGitHubState,
	CloudModelPick,
	CloudPullRequestCreateResult,
	CloudPullRequestInfoResult,
	CloudPullRequestState,
	CloudSessionSource,
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
/** GET .../pull-request may start a stopped sandbox and diff it (up to ~3 min on the server) */
const PULL_REQUEST_INFO_TIMEOUT_MS = 300_000;
/** Creating / updating a PR commits the workspace, pushes it and calls the GitHub API synchronously (up to ~10 min) */
const PULL_REQUEST_TIMEOUT_MS = 600_000;
/** それ以外 (一覧・イベント・停止・追加指示など) */
const DEFAULT_TIMEOUT_MS = 30_000;
/** 取り込み時に、差分を開いて見せるファイル数の上限 (全部開くとタブが溢れる) */
const MAX_FILES_TO_REVEAL = 5;
/** 取り込み時のファイル取得の同時実行数 */
const FETCH_CONCURRENCY = 4;
/** GitHub の連携をブラウザで許可してもらうあいだ、/status を確かめる間隔と待つ上限 */
const GITHUB_CONNECT_POLL_MS = 2_000;
const GITHUB_CONNECT_TIMEOUT_MS = 5 * 60_000;
/** 最後に選んだ GitHub のリポジトリとブランチ (StorageScope.APPLICATION) */
const GITHUB_PICK_STORAGE_KEY = 'orchestra.cloudAgents.githubPick';
/** 最後に選んだモデル (StorageScope.APPLICATION) */
const MODEL_PICK_STORAGE_KEY = 'orchestra.cloudAgents.modelPick';
/** 最後に選んだ目標ループ (StorageScope.APPLICATION) */
const GOAL_LOOP_PICK_STORAGE_KEY = 'orchestra.cloudAgents.goalLoop';
/** 最後に選んだ承認モード (StorageScope.APPLICATION) */
const APPROVAL_MODE_PICK_STORAGE_KEY = 'orchestra.cloudAgents.approvalMode';

/** 覚えておけるモデルの選択か (壊れた値・古い形式は null) */
const toModelPick = (raw: any): CloudModelPick | null => {
	if (!raw || typeof raw !== 'object') return null;
	if (raw.kind === 'default') return { kind: 'default' };
	if (raw.kind === 'divisionProject' && typeof raw.projectId === 'string' && raw.projectId.trim()) return { kind: 'divisionProject', projectId: raw.projectId.trim() };
	if (raw.kind === 'model' && typeof raw.model === 'string' && raw.model.trim() && raw.model.trim() !== CLOUD_DIVISION_PROJECT_MODEL) return { kind: 'model', model: raw.model.trim() };
	return null;
};

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

/** サーバーが { error, code } で返した code (無ければ空) */
const errorCodeOf = (res: { data?: any }): string => res.data && typeof res.data.code === 'string' ? res.data.code : '';

/** Division API の HTTP エラーを、ユーザー向けの日本語にする (sendLLMMessage.impl.ts の divisionErrorMessage と同じ方針) */
export const describeCloudAgentError = (res: { status: number; error?: string; data?: any }): string => {
	const detail = (res.data && typeof res.data.error === 'string' ? res.data.error : '') || res.error || '';
	// GitHub 連携の理由は HTTP ステータスより code を優先する (409 / 503 は他の理由でも返るため)
	const code = errorCodeOf(res);
	if (code === GITHUB_NOT_CONNECTED) {
		return 'GitHub と連携されていないか、連携が解除されています。もう一度「GitHub と連携」してください。';
	}
	if (code === GITHUB_NOT_CONFIGURED) {
		return 'サーバー側で GitHub 連携が未設定です。リポジトリの URL を直接指定してください (公開リポジトリのみ)。';
	}
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


// ---------------------------------------------------------------------------
// GitHub の DTO の取り出し (欠けた値で画面が落ちないように)
// ---------------------------------------------------------------------------

const str = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;
const strOrNull = (value: unknown): string | null => typeof value === 'string' && value ? value : null;

const toGitHubStatus = (raw: unknown): GitHubStatus => {
	const s = (raw ?? {}) as Record<string, unknown>;
	const configured = s.configured === true;
	return {
		configured,
		connected: configured && s.connected === true,
		...(typeof s.login === 'string' && s.login ? { login: s.login } : {}),
		...(typeof s.avatarUrl === 'string' && /^https:\/\//i.test(s.avatarUrl) ? { avatarUrl: s.avatarUrl } : {}),
		...(typeof s.scopes === 'string' ? { scopes: s.scopes } : {}),
	};
};

const toGitHubRepo = (raw: unknown): GitHubRepo => {
	const r = (raw ?? {}) as Record<string, unknown>;
	const fullName = str(r.fullName).trim();
	const [ownerPart = '', namePart = ''] = fullName.split('/');
	return {
		fullName,
		name: str(r.name) || namePart,
		owner: str(r.owner) || ownerPart,
		private: r.private === true,
		defaultBranch: str(r.defaultBranch),
		description: strOrNull(r.description),
		pushedAt: strOrNull(r.pushedAt),
		htmlUrl: str(r.htmlUrl) || (fullName ? `https://github.com/${fullName}` : ''),
	};
};

/** 次のページを足す。読んでいるあいだに push されて順番がずれると同じリポジトリが 2 ページに出るので、fullName で重複を除く */
const mergeRepoPages = (current: GitHubRepo[], next: GitHubRepo[]): GitHubRepo[] => {
	const seen = new Set(current.map(r => r.fullName));
	const merged = [...current];
	for (const r of next) {
		if (seen.has(r.fullName)) continue;
		seen.add(r.fullName);
		merged.push(r);
	}
	return merged;
};

const initialGitHubState = (): CloudGitHubState => ({
	loading: false,
	loaded: false,
	configured: false,
	connected: false,
	starting: false,
	waitingForAuth: false,
	disconnecting: false,
});

const initialGitHubRepos = (): CloudGitHubReposState => ({ q: '', page: 0, hasMore: false, loading: false, loaded: false, repos: [] });


// ---------------------------------------------------------------------------
// Pull request DTOs (tolerate missing fields so a partial response cannot break the panel)
// ---------------------------------------------------------------------------

/** A PR object from the server, or null when it is missing / unusable (no number or a non-https URL) */
const toPullRequest = (raw: unknown): CloudPullRequest | null => {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	const number = typeof r.number === 'number' && Number.isFinite(r.number) ? r.number : NaN;
	const url = str(r.url);
	if (!(number > 0) || !/^https:\/\//i.test(url)) return null;
	return {
		number,
		url,
		branch: str(r.branch),
		base: str(r.base),
		headSha: str(r.headSha),
		title: str(r.title),
		draft: r.draft === true,
		createdAt: str(r.createdAt),
		updatedAt: str(r.updatedAt),
	};
};

const toPullRequestInfo = (raw: unknown): CloudPullRequestInfo => {
	const r = (raw ?? {}) as Record<string, unknown>;
	const sg = (r.suggestion ?? {}) as Record<string, unknown>;
	const pullRequest = toPullRequest(r.pullRequest);
	const state = r.pullRequestState;
	return {
		pullRequest,
		pullRequestState: pullRequest && (state === 'open' || state === 'closed' || state === 'merged') ? state : null,
		suggestion: { title: str(sg.title), body: str(sg.body), branch: str(sg.branch), base: str(sg.base) },
		canCreate: r.canCreate === true,
		...(typeof r.reason === 'string' && r.reason.trim() ? { reason: r.reason.trim() } : {}),
		...(typeof r.code === 'string' && r.code ? { code: r.code } : {}),
	};
};

/** The newer of two PR snapshots (by updatedAt; the first one wins a tie) */
const newerPullRequest = (a: CloudPullRequest | null | undefined, b: CloudPullRequest | null | undefined): CloudPullRequest | null => {
	if (!a) return b ?? null;
	if (!b) return a;
	return (Date.parse(b.updatedAt) || 0) > (Date.parse(a.updatedAt) || 0) ? b : a;
};

/**
 * Error text for the PR endpoints. They answer with a Japanese `error` plus a `code`, which is shown as is;
 * transport / auth / billing failures (no code) use the shared wording.
 */
const describePullRequestError = (res: CloudAgentResponse): string => {
	const code = errorCodeOf(res);
	const detail = res.data && typeof res.data.error === 'string' ? res.data.error.trim() : '';
	if (code === GITHUB_NOT_CONNECTED) return detail || describeCloudAgentError(res);
	if (code && detail) return detail;
	if (res.status === 404 && !code) return 'この Division サーバーはプルリクエストの作成に未対応か、セッションが見つかりません。';
	return describeCloudAgentError(res);
};

const toApiError = (res: CloudAgentResponse, error: string): CloudApiError => ({ ok: false, error, code: errorCodeOf(res), status: res.status });


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
		github: initialGitHubState(),
		githubRepos: initialGitHubRepos(),
		githubBranchesByRepo: {},
		githubPick: null,
		modelPick: null,
		goalLoopPick: CLOUD_GOAL_LOOP_DEFAULT,
		approvalModePick: false,
		approvalById: {},
		pullRequestById: {},
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
	/** Division に 401 で弾かれた認証情報 (ログインし直すまで使わない) */
	private readonly _rejectedTokens = new Set<string>();
	private _lastToken = '';
	/** 作成直後のセッション (一覧 API にまだ出てこなくても消さない) → 作成時刻 */
	private readonly _recentlyCreated = new Map<string, number>();

	/** ログアウト / アカウントの切り替えで増やす。古いアカウントの GitHub の応答を捨てるため */
	private _githubGen = 0;
	private _githubStatusInFlight: Promise<void> | null = null;
	/** リポジトリ検索の通し番号 (古い検索結果で上書きしない) */
	private _repoRequestId = 0;
	private _githubConnectTimer: ReturnType<typeof setTimeout> | undefined;
	private _githubConnectDeadline = 0;
	private _githubConnectCheckInFlight = false;

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
		@IOpenerService private readonly _openerService: IOpenerService,
		@IHostService private readonly _hostService: IHostService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._main = ProxyChannel.toService<ICloudAgentMainService>(mainProcessService.getChannel(CLOUD_AGENT_CHANNEL_NAME));

		this._lastToken = this._tokenSignature();
		this._state = { ...this._state, isLoggedIn: this._isLoggedIn(), workspaceName: this._workspaceFolder()?.name ?? null, githubPick: this._loadGitHubPick(), modelPick: this._loadModelPick(), goalLoopPick: this._loadGoalLoopPick(), approvalModePick: this._loadApprovalModePick() };

		this._register(this._settingsService.onDidChangeState(() => this._onSettingsChanged()));
		this._register(this._workspaceService.onDidChangeWorkspaceFolders(() => {
			this._setState({ workspaceName: this._workspaceFolder()?.name ?? null });
		}));
		// ブラウザで GitHub の連携を許可して戻ってきたら、ポーリングを待たずにすぐ確かめる
		this._register(this._hostService.onDidChangeFocus(focused => {
			if (focused && this._state.github.waitingForAuth) this._checkGitHubConnectNow();
		}));
		this._register({ dispose: () => { this._clearTimers(); this._clearGitHubConnectTimer(); } });

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

	private _setApproval(id: string, partial: Partial<CloudApprovalState>) {
		const prev = this._state.approvalById[id] ?? { loading: false, submitting: false };
		this._setState({ approvalById: { ...this._state.approvalById, [id]: { ...prev, ...partial } } });
	}

	private _setPullRequest(id: string, partial: Partial<CloudPullRequestState>) {
		const prev = this._state.pullRequestById[id] ?? { loading: false, submitting: false };
		this._setState({ pullRequestById: { ...this._state.pullRequestById, [id]: { ...prev, ...partial } } });
	}

	/**
	 * 使える可能性のある認証情報を優先順に並べる。
	 * ログイン時に保存した長期の API キーが Division に登録されていないアカウントがある (401 になる) ので、
	 * その場合は Supabase の JWT へ順に切り替える。
	 */
	private _candidateTokens(): string[] {
		const g = this._settingsService.state.globalSettings;
		return [...new Set([g.divisionUserApiKey, g.divisionAccessToken, g.divisionApiKey].filter((t): t is string => !!t))];
	}

	/** 認証情報の組み合わせ (ログインし直し・アカウント切り替えの検出用) */
	private _tokenSignature(): string {
		return this._candidateTokens().join('\n');
	}

	/** 401 で弾かれたものを除いた、いま使うべき認証情報 */
	private _token(): string {
		const candidates = this._candidateTokens();
		return candidates.find(t => !this._rejectedTokens.has(t)) ?? candidates[0] ?? '';
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
		const signature = this._tokenSignature();
		const isLoggedIn = this._isLoggedIn();
		const tokenChanged = signature !== this._lastToken;
		this._lastToken = signature;
		if (tokenChanged) this._rejectedTokens.clear();

		if (!isLoggedIn) {
			if (this._state.isLoggedIn || this._state.sessions.length) {
				// ログアウト: 他人に見えないよう、手元の一覧も消す
				this._lastSeqById.clear();
				this._listLoadedOnce = false;
				this._setState({ isLoggedIn: false, sessions: [], eventsById: {}, changesById: {}, pullRequestById: {}, approvalById: {}, selectedId: null, lastError: null, sendingById: {} });
			}
			if (this._state.github.loaded || this._state.github.waitingForAuth || this._state.githubRepos.loaded) this._resetGitHub();
			this._clearListTimer();
			return;
		}
		if (!this._state.isLoggedIn || tokenChanged) {
			// 別のアカウントかもしれないので、GitHub の連携状態も取り直す
			this._resetGitHub();
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
		// costUsd は一覧と GET /:id にしか付かない。イベントや操作の応答で来た session で消さない
		let merged = prev && typeof session.costUsd !== 'number' && typeof prev.costUsd === 'number'
			? { ...session, costUsd: prev.costUsd }
			: session;
		// Same for pullRequest: only an explicit null clears it. Also normalize the server's object
		const pullRequest = session.pullRequest === undefined ? prev?.pullRequest : toPullRequest(session.pullRequest);
		if (pullRequest !== undefined) merged = { ...merged, pullRequest };
		const next = idx >= 0
			? sessions.map((s, i) => i === idx ? merged : s)
			: [merged, ...sessions];
		this._setState({ sessions: next });
		if (prev) this._maybeNotifyTransition(prev, merged);
	}

	/** 実行中 → 待機 / 承認待ち / 失敗 に変わったら知らせる (パネルでそのセッションを見ているときは出さない) */
	private _maybeNotifyTransition(prev: CloudSession, next: CloudSession) {
		if (!isCloudSessionActive(prev.status)) return;
		if (next.status !== 'idle' && next.status !== 'failed' && next.status !== 'awaiting_approval') return;
		if (next.status === 'awaiting_approval') this._setApproval(next.id, { approval: undefined });
		if (this._paneVisible && this._state.selectedId === next.id) return;

		const title = next.title || firstLine(next.prompt).slice(0, 60) || next.id;
		const message = next.status === 'idle'
			? `クラウドエージェント「${title}」が作業を終えました。${next.changedFiles ? ` (変更 ${next.changedFiles} ファイル)` : ''}`
			: next.status === 'awaiting_approval'
				? `クラウドエージェント「${title}」の成果物が承認待ちです。内容を確認して承認してください。`
				: `クラウドエージェント「${title}」が失敗しました。${next.errorMsg ? ` ${next.errorMsg}` : ''}`;
		this._notificationService.notify({
			severity: next.status === 'failed' ? Severity.Warning : Severity.Info,
			message,
			actions: {
				primary: [{
					id: 'orchestra.cloudAgents.showSession',
					label: next.status === 'awaiting_approval' ? '確認する' : '結果を見る',
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
		await ensureDivisionSession(this._settingsService);
		if (!this._token()) return { ok: false, status: 401, data: null, error: 'not logged in' };
		let didRefresh = false;
		for (;;) {
			const token = this._token();
			let res: CloudAgentResponse | undefined;
			try {
				res = await this._main.request({ endpoint: this._endpoint(), token, method, path, body: method === 'POST' ? (body ?? {}) : undefined, timeoutMs: timeoutMs ?? DEFAULT_TIMEOUT_MS });
			} catch (e) {
				res = { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : String(e) };
			}
			res = res ?? { ok: false, status: 0, data: null, error: 'request failed' };
			if (res.status !== 401) return res;
			// この認証情報は使えない。次の候補があればそれで試し直す
			this._rejectedTokens.add(token);
			if (!didRefresh && token === this._settingsService.state.globalSettings.divisionAccessToken) {
				didRefresh = true;
				const session = await ensureDivisionSession(this._settingsService, token);
				if (session && session.access_token !== token) continue;
			}
			if (this._candidateTokens().every(t => this._rejectedTokens.has(t))) {
				// どれも通らない: ログインし直す (認証情報が変わる) までポーリングしない
				this._authFailedToken = this._tokenSignature();
				return res;
			}
		}
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
		return this._isLoggedIn() && this._authFailedToken !== this._tokenSignature();
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
		// The PR suggestion (summary in the body) and canCreate depend on the latest turn: refresh it if it is shown
		if (fresh.some(e => e.type === 'done') && this._state.pullRequestById[id]?.info) {
			void this.getPullRequestInfo(id);
		}
	}

	private _removeSessionLocally(id: string) {
		this._lastSeqById.delete(id);
		this._recentlyCreated.delete(id);
		this._setState({
			sessions: this._state.sessions.filter(s => s.id !== id),
			eventsById: omitKey(this._state.eventsById, id),
			changesById: omitKey(this._state.changesById, id),
			pullRequestById: omitKey(this._state.pullRequestById, id),
			approvalById: omitKey(this._state.approvalById, id),
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
		const source: CloudSessionSource = opts.source ?? (opts.includeWorkspace ? 'workspace' : 'empty');

		// github / url: アップロードせず、サーバーに clone してもらう
		let repo: CloudStartRepo | undefined;
		if (source === 'github' || source === 'url') {
			const branch = (opts.repo?.branch ?? '').trim();
			const target = source === 'github' ? (opts.repo?.fullName ?? '').trim() : (opts.repo?.url ?? '').trim();
			const issue = (source === 'github' ? validateGitHubFullName(target) : validateCloudRepoUrl(target)) ?? validateCloudRepoBranch(branch);
			if (issue) {
				this._setState({ lastError: issue });
				return [];
			}
			repo = source === 'github'
				? { fullName: target, ...(branch ? { branch } : {}) }
				: { url: target, ...(branch ? { branch } : {}) };
		}

		const folder = this._workspaceFolder();
		const folderPath = source === 'workspace' && folder && folder.uri.scheme === 'file' ? folder.uri.fsPath : null;
		if (source === 'workspace' && folder && folder.uri.scheme !== 'file') {
			this._notificationService.warn('リモートのフォルダはアップロードできないため、空のフォルダでクラウドエージェントを起動します。');
		}
		// 一覧と詳細に出す名前: リポジトリならリポジトリ名 (clone したフォルダ名)、フォルダを送るならフォルダ名
		const workspaceName = repo
			? cloudRepoFolderName(repo) || undefined
			: (folderPath && folder ? folder.name : undefined);
		const repoLabel = repo ? ('fullName' in repo ? repo.fullName : repo.url) : '';
		const baseTitle = (opts.title ?? '').trim();
		const model = (opts.model ?? '').trim();
		const projectId = (opts.projectId ?? '').trim();
		const selectCreated = opts.select !== false;
		const goalLoop: CloudGoalLoopMode = isCloudGoalLoopMode(opts.goalLoop) ? opts.goalLoop : this._state.goalLoopPick;
		const approvalMode = typeof opts.approvalMode === 'boolean' ? opts.approvalMode : this._state.approvalModePick;
		if (model === CLOUD_DIVISION_PROJECT_MODEL && !projectId) {
			// サーバーも 400 を返すが、サンドボックスを作る前に日本語で弾く
			this._setState({ lastError: 'Division Project をモデルにするには、Division と同期したプロジェクトを選んでください。' });
			return [];
		}

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
				...(projectId ? { projectId } : {}),
				...(workspaceName ? { workspaceName } : {}),
				goalLoop,
				...(model === CLOUD_DIVISION_PROJECT_MODEL && approvalMode ? { approvalMode: true } : {}),
			}, CREATE_TIMEOUT_MS);
			const session = created.ok ? created.data?.session as CloudSession | undefined : undefined;
			if (!session?.id) {
				errors.push(describeCloudAgentError(created.ok ? { status: created.status, error: '作成したセッションの情報が返ってきませんでした' } : created));
				return null;
			}
			this._recentlyCreated.set(session.id, Date.now());
			this._upsertSession(session);
			if (selectCreated && (i === 0 || !this._state.selectedId)) this.select(session.id);

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

			if (repo && i === 0) {
				this._setState({ creatingProgress: `リポジトリを clone しています (${repoLabel})…` });
			}
			const started = await this._request('POST', this._sessionPath(session.id, '/start'), {
				...(workspaceInfo ? { workspaceInfo } : {}),
				...(repo ? { repo } : {}),
			}, CREATE_TIMEOUT_MS);
			if (!started.ok) {
				errors.push(`エージェントを開始できませんでした: ${describeCloudAgentError(started)}`);
				if (errorCodeOf(started) === GITHUB_NOT_CONNECTED) {
					// 連携が切れていた: 状態を未連携に戻し、開始できないサンドボックスは片付ける
					this._markGitHubDisconnected();
					await this._request('POST', this._sessionPath(session.id, '/archive'), {});
					this._removeSessionLocally(session.id);
					return null;
				}
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

	async sendMessage(id: string, text: string, opts?: { continueGoal?: boolean }): Promise<boolean> {
		const trimmed = text.trim();
		const continueGoal = opts?.continueGoal === true;
		if ((!trimmed && !continueGoal) || this._state.sendingById[id]) return false;
		this._setState({ sendingById: { ...this._state.sendingById, [id]: true } });
		try {
			const body = continueGoal ? { continueGoal: true, ...(trimmed ? { text: trimmed } : {}) } : { text: trimmed };
			const res = await this._request('POST', this._sessionPath(id, '/messages'), body);
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
			changesTruncated: !!res.data?.changesTruncated,
			error: undefined,
		});
	}

	async loadApproval(id: string): Promise<void> {
		if (this._state.approvalById[id]?.loading) return;
		this._setApproval(id, { loading: true, error: undefined });
		const res = await this._request('GET', this._sessionPath(id, '/approval'), undefined, CHANGES_TIMEOUT_MS);
		if (!res.ok) {
			this._setApproval(id, { loading: false, error: describeCloudAgentError(res) });
			return;
		}
		const raw = res.data?.approval;
		const approval: CloudPendingApproval | null = raw && typeof raw === 'object' && typeof raw.taskSeq === 'number' && typeof raw.file === 'string'
			? {
				taskSeq: raw.taskSeq,
				index: Number(raw.index) || 0,
				role: String(raw.role ?? ''),
				roleName: String(raw.roleName ?? raw.role ?? ''),
				title: String(raw.title ?? ''),
				file: raw.file,
				summary: String(raw.summary ?? ''),
				content: typeof raw.content === 'string' ? raw.content : null,
				...(raw.tooLarge ? { tooLarge: true } : {}),
			}
			: null;
		this._setApproval(id, { loading: false, approval });
	}

	async resolveApproval(id: string, params: { taskSeq: number; action: CloudApprovalAction; content?: string; feedback?: string }): Promise<boolean> {
		if (this._state.approvalById[id]?.submitting) return false;
		const feedback = (params.feedback ?? '').trim();
		if (params.action === 'revise' && !feedback) {
			this._setApproval(id, { error: '差し戻すときは、どう直してほしいかを書いてください。' });
			return false;
		}
		this._setApproval(id, { submitting: true, error: undefined });
		try {
			const res = await this._request('POST', this._sessionPath(id, '/approval'), {
				taskSeq: params.taskSeq,
				action: params.action,
				...(params.content !== undefined ? { content: params.content } : {}),
				...(feedback ? { feedback } : {}),
			});
			if (!res.ok) {
				this._setApproval(id, { error: describeCloudAgentError(res) });
				// 別の画面で先に承認された / 次の成果物に変わった: 今の承認待ちを取り直す
				if (res.status === 409) void this.loadApproval(id);
				return false;
			}
			this._setApproval(id, { approval: null });
			if (res.data?.session) this._upsertSession(res.data.session as CloudSession);
			this._scheduleList(LIST_INTERVAL_ACTIVE_MS);
			void this._fetchEvents(id);
			return true;
		} finally {
			this._setApproval(id, { submitting: false });
		}
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


	// -----------------------------------------------------------------------
	// Pull requests (GitHub-repo sessions only)
	// -----------------------------------------------------------------------

	/** Local checks shared by both PR calls. Returns an error for sessions that can never have a PR */
	private _pullRequestPrecheck(id: string): CloudApiError | null {
		if (!this._isLoggedIn()) return { ok: false, error: describeCloudAgentError({ status: 401 }), code: '', status: 401 };
		const session = this._state.sessions.find(s => s.id === id);
		if (session && !isGitHubRepoSession(session)) {
			return { ok: false, error: 'GitHub のリポジトリから始めたセッションだけがプルリクエストを作成できます。', code: CLOUD_PR_ERROR_CODES.notGitHubRepo, status: 0 };
		}
		return null;
	}

	/** github_not_connected from a PR call means the token is gone: reflect it in the shared GitHub state too */
	private _notePullRequestFailure(res: CloudAgentResponse) {
		if (errorCodeOf(res) === GITHUB_NOT_CONNECTED) this._markGitHubDisconnected();
	}

	async getPullRequestInfo(id: string): Promise<CloudPullRequestInfoResult> {
		const pre = this._pullRequestPrecheck(id);
		if (pre) return pre;
		const gen = this._githubGen;
		this._setPullRequest(id, { loading: true });
		const res = await this._request('GET', this._sessionPath(id, '/pull-request'), undefined, PULL_REQUEST_INFO_TIMEOUT_MS);
		// Logged out / switched accounts meanwhile: drop the answer (the state was already reset)
		if (gen !== this._githubGen || !this._state.isLoggedIn) return toApiError(res, describePullRequestError(res));
		if (!res.ok) {
			const error = describePullRequestError(res);
			this._notePullRequestFailure(res);
			this._setPullRequest(id, { loading: false, error, errorCode: errorCodeOf(res), errorFrom: 'info' });
			return toApiError(res, error);
		}
		const info = toPullRequestInfo(res.data);
		this._mergeSessionPullRequest(id, info.pullRequest);
		const prev = this._state.pullRequestById[id];
		// Keep a submit error visible (a fresh GET only clears its own error), except "GitHub not connected":
		// a successful GET after reconnecting means it no longer applies
		const keepError = prev?.errorFrom === 'submit' && prev.errorCode !== GITHUB_NOT_CONNECTED;
		this._setPullRequest(id, {
			loading: false,
			info,
			...(keepError ? {} : { error: undefined, errorCode: undefined, errorFrom: undefined }),
		});
		return { ok: true, ...info };
	}

	async createPullRequest(id: string, params: CreateCloudPullRequestParams): Promise<CloudPullRequestCreateResult> {
		const pre = this._pullRequestPrecheck(id);
		if (pre) return pre;
		const current = this._state.pullRequestById[id];
		if (current?.submitting) {
			return { ok: false, error: 'プルリクエストを送信中です。終わるまでお待ちください。', code: CLOUD_PR_ERROR_CODES.inProgress, status: 0 };
		}
		const session = this._state.sessions.find(s => s.id === id);
		// An open PR is updated; with none (or a merged / closed one) the server opens a new PR
		const hasPr = !!updatablePullRequest(newerPullRequest(session?.pullRequest, current?.info?.pullRequest), current?.info);

		// Same limits as the server, checked here so the user gets the reason without a round trip
		const title = (params.title ?? '').trim();
		const body = params.body ?? '';
		const branch = (params.branch ?? '').trim();
		const invalid = validateCloudPullRequestFields(title, body) ?? (!hasPr && branch ? validateCloudPullRequestBranch(branch) : null);
		if (invalid) {
			const error: CloudApiError = { ok: false, error: invalid, code: CLOUD_PR_ERROR_CODES.validation, status: 0 };
			this._setPullRequest(id, { error: error.error, errorCode: error.code, errorFrom: 'submit' });
			return error;
		}

		// Updating an open PR only takes title / body (the server ignores branch, base and draft then)
		const payload: CreateCloudPullRequestParams = hasPr
			? { title, ...(body ? { body } : {}) }
			: {
				title,
				...(body ? { body } : {}),
				...(branch ? { branch } : {}),
				...(params.base?.trim() ? { base: params.base.trim() } : {}),
				...(typeof params.draft === 'boolean' ? { draft: params.draft } : {}),
			};
		const gen = this._githubGen;
		this._setPullRequest(id, { submitting: true, lastResult: undefined, lastAction: undefined, error: undefined, errorCode: undefined, errorFrom: undefined });
		const res = await this._request('POST', this._sessionPath(id, '/pull-request'), payload, PULL_REQUEST_TIMEOUT_MS);
		if (gen !== this._githubGen || !this._state.isLoggedIn) return toApiError(res, describePullRequestError(res));
		if (!res.ok) {
			const error = describePullRequestError(res);
			this._notePullRequestFailure(res);
			this._setPullRequest(id, { submitting: false, error, errorCode: errorCodeOf(res), errorFrom: 'submit' });
			return toApiError(res, error);
		}
		const pullRequest = toPullRequest(res.data?.pullRequest);
		if (!pullRequest) {
			const error = 'プルリクエストの情報を受け取れませんでした。GitHub で作成されているか確認してください。';
			this._setPullRequest(id, { submitting: false, error, errorCode: CLOUD_PR_ERROR_CODES.githubError, errorFrom: 'submit' });
			return { ok: false, error, code: CLOUD_PR_ERROR_CODES.githubError, status: res.status };
		}
		const updated = res.data?.updated !== false;
		const rawAction = res.data?.action;
		const action: CloudPullRequestResult['action'] = rawAction === 'created' || rawAction === 'updated' || rawAction === 'unchanged'
			? rawAction
			: !hasPr ? 'created' : updated ? 'updated' : 'unchanged';
		const result: CloudPullRequestResult = { pullRequest, updated, action };
		this._mergeSessionPullRequest(id, pullRequest);
		const info = this._state.pullRequestById[id]?.info;
		this._setPullRequest(id, {
			submitting: false,
			lastResult: result,
			lastAction: action,
			// The PR we just pushed to is open (the old state may describe a merged predecessor)
			...(info ? { info: { ...info, pullRequest, pullRequestState: 'open' } } : {}),
		});
		// The server appended a pull_request event; also refresh canCreate / the suggestion for the next update
		void this._fetchEvents(id);
		void this.getPullRequestInfo(id);
		return { ok: true, ...result };
	}

	/** Store a PR snapshot on the session when it is newer than what the list gave us */
	private _mergeSessionPullRequest(id: string, pullRequest: CloudPullRequest | null) {
		if (!pullRequest) return;
		const session = this._state.sessions.find(s => s.id === id);
		if (!session) return;
		const next = newerPullRequest(pullRequest, session.pullRequest);
		if (next === session.pullRequest) return;
		this._setState({ sessions: this._state.sessions.map(s => s.id === id ? { ...s, pullRequest: next } : s) });
	}

	async openPullRequest(url: string): Promise<void> {
		const target = (url ?? '').trim();
		if (!/^https:\/\//i.test(target)) return;
		try {
			await this._openerService.open(target, { openExternal: true });
		} catch (e) {
			this._setState({ lastError: `ブラウザを開けませんでした: ${e instanceof Error ? e.message : String(e)}` });
		}
	}


	// -----------------------------------------------------------------------
	// GitHub アカウント連携
	// -----------------------------------------------------------------------

	private _setGitHub(partial: Partial<CloudGitHubState>) {
		this._setState({ github: { ...this._state.github, ...partial } });
	}

	private _setGitHubRepos(partial: Partial<CloudGitHubReposState>) {
		this._setState({ githubRepos: { ...this._state.githubRepos, ...partial } });
	}

	private _setGitHubBranches(fullName: string, partial: Partial<CloudGitHubBranchesState>) {
		const prev = this._state.githubBranchesByRepo[fullName] ?? { loading: false };
		this._setState({ githubBranchesByRepo: { ...this._state.githubBranchesByRepo, [fullName]: { ...prev, ...partial } } });
	}

	/** ログアウト / アカウントの切り替え: 連携の状態・一覧を捨てて、待っている応答も無視する */
	private _resetGitHub() {
		this._githubGen++;
		this._repoRequestId++;
		this._githubStatusInFlight = null;
		this._clearGitHubConnectTimer();
		this._setState({ github: initialGitHubState(), githubRepos: initialGitHubRepos(), githubBranchesByRepo: {} });
	}

	/** 409 github_not_connected (未連携 / トークン失効) や解除のあと: 未連携に戻し、一覧も捨てる */
	private _markGitHubDisconnected(error?: string) {
		this._repoRequestId++;
		this._setState({
			github: { ...this._state.github, loaded: true, configured: true, connected: false, login: undefined, avatarUrl: undefined, error },
			githubRepos: initialGitHubRepos(),
			githubBranchesByRepo: {},
		});
	}

	/** GitHub の API の失敗を状態に反映し、ユーザー向けの文言を返す */
	private _handleGitHubFailure(res: CloudAgentResponse): string {
		const code = errorCodeOf(res);
		const message = res.status === 404 && !code
			? 'この Division サーバーは GitHub 連携に未対応です。リポジトリの URL を指定してください。'
			: describeCloudAgentError(res);
		if (code === GITHUB_NOT_CONNECTED) {
			this._markGitHubDisconnected(message);
		} else if (code === GITHUB_NOT_CONFIGURED) {
			this._setGitHub({ loaded: true, configured: false, connected: false, login: undefined, avatarUrl: undefined });
		}
		return message;
	}

	/** /api/github/status。サーバーが未対応 (404) / OAuth アプリが無い (503 github_not_configured) なら configured:false として扱う */
	private async _fetchGitHubStatus(): Promise<{ status?: GitHubStatus; res: CloudAgentResponse }> {
		const res = await this._request('GET', `${GITHUB_API_PREFIX}/status`);
		if (res.ok) return { status: toGitHubStatus(res.data), res };
		const code = errorCodeOf(res);
		if ((res.status === 404 && !code) || code === GITHUB_NOT_CONFIGURED) return { status: { configured: false, connected: false }, res };
		return { res };
	}

	private _applyGitHubStatus(status: GitHubStatus) {
		const prev = this._state.github;
		// 別のアカウントになった / 連携が外れたら、前のアカウントの一覧は捨てる
		const accountChanged = !status.connected || (prev.loaded && prev.login !== status.login);
		if (accountChanged) {
			this._repoRequestId++;
			this._setState({ githubRepos: initialGitHubRepos(), githubBranchesByRepo: {} });
		}
		this._setGitHub({
			loaded: true,
			configured: status.configured,
			connected: status.connected,
			login: status.login,
			avatarUrl: status.avatarUrl,
			error: undefined,
		});
	}

	refreshGitHubStatus(): Promise<void> {
		if (!this._isLoggedIn()) return Promise.resolve();
		if (this._githubStatusInFlight) return this._githubStatusInFlight;
		const gen = this._githubGen;
		const promise = (async () => {
			this._setGitHub({ loading: true });
			try {
				const { status, res } = await this._fetchGitHubStatus();
				if (gen !== this._githubGen) return;
				if (status) this._applyGitHubStatus(status);
				else this._setGitHub({ error: describeCloudAgentError(res) });
			} finally {
				if (gen === this._githubGen) {
					this._githubStatusInFlight = null;
					this._setGitHub({ loading: false });
				}
			}
		})();
		this._githubStatusInFlight = promise;
		return promise;
	}

	async connectGitHub(): Promise<void> {
		const gh = this._state.github;
		if (!this._isLoggedIn() || gh.starting || gh.waitingForAuth) return;
		const gen = this._githubGen;
		this._setGitHub({ starting: true, error: undefined });
		const res = await this._request('POST', `${GITHUB_API_PREFIX}/connect`, {});
		if (gen !== this._githubGen) return;
		if (!res.ok) {
			this._setGitHub({ starting: false, error: this._handleGitHubFailure(res) });
			return;
		}
		const url = typeof res.data?.url === 'string' ? res.data.url.trim() : '';
		if (!/^https:\/\//i.test(url)) {
			this._setGitHub({ starting: false, error: 'GitHub の連携ページの URL を受け取れませんでした。' });
			return;
		}
		try {
			// URI にせず文字列のまま渡す (文字列ならそのまま開かれる)。URI にすると、OAuth の URL のクエリ
			// (redirect_uri などのエンコード済みの値) が decode → encodeURI で変わってしまうことがある
			await this._openerService.open(url, { openExternal: true });
		} catch (e) {
			if (gen === this._githubGen) {
				this._setGitHub({ starting: false, error: `ブラウザを開けませんでした: ${e instanceof Error ? e.message : String(e)}` });
			}
			return;
		}
		if (gen !== this._githubGen) return;
		this._setGitHub({ starting: false, waitingForAuth: true });
		this._githubConnectDeadline = Date.now() + GITHUB_CONNECT_TIMEOUT_MS;
		// 開いた直後はまだ許可されていないので、最初の確認も 1 間隔おいてから
		this._scheduleGitHubConnectCheck(GITHUB_CONNECT_POLL_MS);
	}

	private _clearGitHubConnectTimer() {
		if (this._githubConnectTimer !== undefined) { clearTimeout(this._githubConnectTimer); this._githubConnectTimer = undefined; }
	}

	private _scheduleGitHubConnectCheck(delayMs: number) {
		this._clearGitHubConnectTimer();
		const wait = Math.min(delayMs, Math.max(0, this._githubConnectDeadline - Date.now()));
		this._githubConnectTimer = setTimeout(() => {
			this._githubConnectTimer = undefined;
			void this._checkGitHubConnect();
		}, wait);
	}

	/** ウィンドウに戻ってきたとき: 確認中でなければすぐ確かめる */
	private _checkGitHubConnectNow() {
		if (this._githubConnectCheckInFlight) return;
		this._clearGitHubConnectTimer();
		void this._checkGitHubConnect();
	}

	private async _checkGitHubConnect() {
		if (!this._state.github.waitingForAuth || this._githubConnectCheckInFlight) return;
		this._githubConnectCheckInFlight = true;
		const gen = this._githubGen;
		let status: GitHubStatus | undefined;
		try {
			({ status } = await this._fetchGitHubStatus());
		} catch {
			// 一時的な失敗は無視して次の確認を待つ
		} finally {
			this._githubConnectCheckInFlight = false;
		}
		if (gen !== this._githubGen || !this._state.github.waitingForAuth) return;

		if (status?.connected) {
			this._clearGitHubConnectTimer();
			this._setGitHub({ waitingForAuth: false });
			this._applyGitHubStatus(status);
			this._notificationService.notify({
				severity: Severity.Info,
				message: status.login ? `GitHub (@${status.login}) と連携しました` : 'GitHub と連携しました',
			});
			return;
		}
		if (Date.now() >= this._githubConnectDeadline) {
			this._clearGitHubConnectTimer();
			this._setGitHub({ waitingForAuth: false, error: '5 分待ちましたが連携を確認できませんでした。もう一度「GitHub と連携」からお試しください。' });
			return;
		}
		this._scheduleGitHubConnectCheck(GITHUB_CONNECT_POLL_MS);
	}

	cancelGitHubConnect(): void {
		this._clearGitHubConnectTimer();
		if (this._state.github.waitingForAuth || this._state.github.starting) {
			this._setGitHub({ waitingForAuth: false });
		}
	}

	async disconnectGitHub(): Promise<boolean> {
		const gh = this._state.github;
		if (!gh.connected || gh.disconnecting) return false;
		const { confirmed } = await this._dialogService.confirm({
			message: 'GitHub の連携を解除しますか？',
			detail: `${gh.login ? `@${gh.login} の` : ''}リポジトリを一覧から選べなくなります (URL の指定は引き続き使えます)。動いているセッションには影響しません。`,
			primaryButton: '解除',
			cancelButton: 'キャンセル',
		});
		if (!confirmed) return false;
		const gen = this._githubGen;
		this._setGitHub({ disconnecting: true, error: undefined });
		const res = await this._request('POST', `${GITHUB_API_PREFIX}/disconnect`, {});
		if (gen !== this._githubGen) return false;
		// 既に未連携 (409 github_not_connected) なら、解除できたのと同じ
		if (!res.ok && errorCodeOf(res) !== GITHUB_NOT_CONNECTED) {
			this._setGitHub({ disconnecting: false, error: this._handleGitHubFailure(res) });
			return false;
		}
		this._markGitHubDisconnected();
		this._setGitHub({ disconnecting: false });
		this._notificationService.notify({ severity: Severity.Info, message: 'GitHub の連携を解除しました' });
		return true;
	}

	async searchGitHubRepos(q: string, page = 1): Promise<void> {
		if (!this._isLoggedIn()) return;
		const query = (q ?? '').trim();
		const nextPage = Math.max(1, Math.floor(page) || 1);
		const id = ++this._repoRequestId;
		const gen = this._githubGen;
		this._setGitHubRepos({ q: query, loading: true, error: undefined });
		const params = [...(query ? [`q=${encodeURIComponent(query)}`] : []), `page=${nextPage}`].join('&');
		const res = await this._request('GET', `${GITHUB_API_PREFIX}/repos?${params}`);
		if (id !== this._repoRequestId || gen !== this._githubGen) return;
		if (!res.ok) {
			const error = this._handleGitHubFailure(res);
			// 未連携に戻ったときは一覧ごと捨てている (_markGitHubDisconnected)
			if (id === this._repoRequestId) this._setGitHubRepos({ loading: false, error });
			return;
		}
		const fetched = (Array.isArray(res.data?.repos) ? res.data.repos as unknown[] : []).map(toGitHubRepo).filter(r => !!r.fullName);
		this._setGitHubRepos({
			q: query,
			repos: nextPage === 1 ? mergeRepoPages([], fetched) : mergeRepoPages(this._state.githubRepos.repos, fetched),
			page: nextPage,
			hasMore: res.data?.hasMore === true,
			loading: false,
			loaded: true,
			error: undefined,
		});
	}

	async loadGitHubBranches(fullName: string, force?: boolean): Promise<void> {
		const name = (fullName ?? '').trim();
		if (!this._isLoggedIn() || validateGitHubFullName(name)) return;
		const current = this._state.githubBranchesByRepo[name];
		if (current?.loading || (current?.branches && !force)) return;
		const gen = this._githubGen;
		this._setGitHubBranches(name, { loading: true, error: undefined });
		const res = await this._request('GET', `${GITHUB_API_PREFIX}/branches?repo=${encodeURIComponent(name)}`);
		if (gen !== this._githubGen) return;
		if (!res.ok) {
			const error = this._handleGitHubFailure(res);
			if (errorCodeOf(res) !== GITHUB_NOT_CONNECTED) this._setGitHubBranches(name, { loading: false, error });
			return;
		}
		const branches = (Array.isArray(res.data?.branches) ? res.data.branches as unknown[] : []).filter((b): b is string => typeof b === 'string' && !!b);
		const defaultBranch = str(res.data?.defaultBranch) || branches[0] || '';
		// 既定のブランチを必ず先頭に置く (サーバーがそう返す前提だが、念のため)
		const ordered = defaultBranch ? [defaultBranch, ...branches.filter(b => b !== defaultBranch)] : branches;
		this._setGitHubBranches(name, { loading: false, branches: ordered, defaultBranch, error: undefined });
	}

	setGitHubPick(pick: CloudGitHubPick | null): void {
		const next = pick && !validateGitHubFullName(pick.repo?.fullName ?? '')
			? { repo: toGitHubRepo(pick.repo), branch: validateCloudRepoBranch(pick.branch ?? '') ? '' : (pick.branch ?? '').trim() }
			: null;
		this._setState({ githubPick: next });
		try {
			if (next) this._storageService.store(GITHUB_PICK_STORAGE_KEY, JSON.stringify(next), StorageScope.APPLICATION, StorageTarget.MACHINE);
			else this._storageService.remove(GITHUB_PICK_STORAGE_KEY, StorageScope.APPLICATION);
		} catch { /* 覚えられなくても選択はできている */ }
	}

	setModelPick(pick: CloudModelPick | null): void {
		const next = toModelPick(pick);
		this._setState({ modelPick: next });
		try {
			if (next) this._storageService.store(MODEL_PICK_STORAGE_KEY, JSON.stringify(next), StorageScope.APPLICATION, StorageTarget.MACHINE);
			else this._storageService.remove(MODEL_PICK_STORAGE_KEY, StorageScope.APPLICATION);
		} catch { /* 覚えられなくても選択はできている */ }
	}

	setGoalLoopPick(mode: CloudGoalLoopMode): void {
		if (!isCloudGoalLoopMode(mode)) return;
		this._setState({ goalLoopPick: mode });
		try {
			this._storageService.store(GOAL_LOOP_PICK_STORAGE_KEY, mode, StorageScope.APPLICATION, StorageTarget.MACHINE);
		} catch { /* 覚えられなくても選択はできている */ }
	}

	setApprovalModePick(on: boolean): void {
		this._setState({ approvalModePick: !!on });
		try {
			this._storageService.store(APPROVAL_MODE_PICK_STORAGE_KEY, !!on, StorageScope.APPLICATION, StorageTarget.MACHINE);
		} catch { /* 覚えられなくても選択はできている */ }
	}

	private _loadApprovalModePick(): boolean {
		try {
			return this._storageService.getBoolean(APPROVAL_MODE_PICK_STORAGE_KEY, StorageScope.APPLICATION, false);
		} catch {
			return false;
		}
	}

	private _loadGoalLoopPick(): CloudGoalLoopMode {
		try {
			const raw = this._storageService.get(GOAL_LOOP_PICK_STORAGE_KEY, StorageScope.APPLICATION);
			return isCloudGoalLoopMode(raw) ? raw : CLOUD_GOAL_LOOP_DEFAULT;
		} catch {
			return CLOUD_GOAL_LOOP_DEFAULT;
		}
	}

	private _loadModelPick(): CloudModelPick | null {
		try {
			const raw = this._storageService.get(MODEL_PICK_STORAGE_KEY, StorageScope.APPLICATION);
			return raw ? toModelPick(JSON.parse(raw)) : null;
		} catch {
			return null;
		}
	}

	private _loadGitHubPick(): CloudGitHubPick | null {
		try {
			const raw = this._storageService.get(GITHUB_PICK_STORAGE_KEY, StorageScope.APPLICATION);
			if (!raw) return null;
			const parsed = JSON.parse(raw);
			const repo = toGitHubRepo(parsed?.repo);
			if (validateGitHubFullName(repo.fullName)) return null;
			const branch = typeof parsed?.branch === 'string' && !validateCloudRepoBranch(parsed.branch) ? parsed.branch.trim() : '';
			return { repo, branch };
		} catch {
			return null;
		}
	}
}

registerSingleton(ICloudAgentService, CloudAgentService, InstantiationType.Delayed);
