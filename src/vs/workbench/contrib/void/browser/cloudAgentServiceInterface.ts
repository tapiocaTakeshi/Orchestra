/*--------------------------------------------------------------------------------------
 *  Copyright 2025 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// ICloudAgentService の decorator (と interface・状態の型) は、実装である cloudAgentService.ts
// ではなくこのファイルに置く。chatThreadServiceInterface.ts と同じ「実装と decorator を分離する」パターン。
//
// React の services.ts から import されるので、実装側の依存 (voidSettingsService など) を
// 引き込むと循環 import の輪に入り、バンドル後に `decorator is not a function` で
// workbench の起動が失敗する (build/checkDecoratorInitOrder.js が検出する)。
// このファイルは createDecorator 以外に実行時依存を持たない (型は import type だけ)。

import type { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type { CloudChange, CloudPullRequestInfo, CloudPullRequestResult, CloudSession, CloudSessionEvent, CreateCloudPullRequestParams, GitHubRepo } from '../common/cloudAgentTypes.js';


/** 「変更を取り込む」の結果 (パスはワークスペースからの相対パス) */
export type CloudApplyResult = {
	/** エディタに差分 (承認待ち) として入れた / バイナリとして書き込んだ */
	applied: string[];
	/** ローカルのファイルがアップロード時から変わっていた (それでも取り込んではいる) */
	conflicts: string[];
	/** 削除したファイル */
	deleted: string[];
	/** ローカルが既にクラウドと同じ中身だったので何もしなかった */
	unchanged: string[];
	failed: { path: string; error: string }[];
};

export type CloudChangesState = {
	loading: boolean;
	changes?: CloudChange[];
	patch?: string;
	patchTruncated?: boolean;
	/** 変更ファイルが多すぎて、サーバーが一覧の一部だけを返した (サーバーが changesTruncated を付けたとき) */
	changesTruncated?: boolean;
	error?: string;
	applying?: boolean;
	lastApply?: CloudApplyResult;
};

/**
 * A failed cloud API call, with the server's `{ error, code }` (code is '' when the server sent none).
 * `error` is already user-facing Japanese text.
 */
export type CloudApiError = { ok: false; error: string; code: string; status: number };

export type CloudPullRequestInfoResult = ({ ok: true } & CloudPullRequestInfo) | CloudApiError;
export type CloudPullRequestCreateResult = ({ ok: true } & CloudPullRequestResult) | CloudApiError;

/** Per-session pull request state (shared by the header button, the inline form and the completion card) */
export type CloudPullRequestState = {
	/** GET .../pull-request in flight */
	loading: boolean;
	/** Last successful GET (refreshed after a create / update) */
	info?: CloudPullRequestInfo;
	/** POST .../pull-request in flight */
	submitting: boolean;
	/** Last successful POST (cleared when a new submit starts) */
	lastResult?: CloudPullRequestResult;
	/** What the last successful POST did: opened the PR, pushed new commits to it, or found nothing new to push */
	lastAction?: 'created' | 'updated' | 'unchanged';
	/** Last failed GET / POST */
	error?: string;
	errorCode?: string;
	/** Whether `error` came from the POST (shown in the form) or the GET (shown instead of the button) */
	errorFrom?: 'info' | 'submit';
};

/** GitHub アカウント連携の状態 */
export type CloudGitHubState = {
	/** /api/github/status を取りに行っている */
	loading: boolean;
	/** status を一度でも取れたか (取れるまでは configured / connected は当てにならない) */
	loaded: boolean;
	/** false = サーバーに GitHub の OAuth アプリが無い (またはサーバーが連携に未対応) */
	configured: boolean;
	connected: boolean;
	login?: string;
	avatarUrl?: string;
	/** 「GitHub と連携」を押して、連携用の URL を取りに行っているあいだ */
	starting: boolean;
	/** ブラウザで許可してもらうのを待っているあいだ (/status をポーリング中) */
	waitingForAuth: boolean;
	disconnecting: boolean;
	error?: string;
};

/** GitHub のリポジトリ一覧 (検索語 q で絞った結果を page まで読んだもの) */
export type CloudGitHubReposState = {
	q: string;
	page: number;
	hasMore: boolean;
	loading: boolean;
	/** 一度でも読み込めたか */
	loaded: boolean;
	repos: GitHubRepo[];
	error?: string;
};

/** リポジトリごとのブランチ一覧 (既定のブランチが先頭) */
export type CloudGitHubBranchesState = {
	loading: boolean;
	branches?: string[];
	defaultBranch?: string;
	error?: string;
};

/** 最後に選んだリポジトリとブランチ (IStorageService に覚えておき、次回の初期値にする) */
export type CloudGitHubPick = {
	repo: GitHubRepo;
	/** 空なら既定のブランチ */
	branch: string;
};

/**
 * 新しいエージェントのモデルの選択 (IStorageService に覚えておき、次回の初期値にする):
 *  - divisionProject: Division Project (マルチエージェント) として動かす。model = 'division-project' と projectId を送る
 *  - default:         モデルを送らない (サーバーはプロジェクトの coder ロールの割り当てを使う)
 *  - model:           単体のモデル ("providerId/modelId")
 */
export type CloudModelPick =
	| { kind: 'divisionProject'; projectId: string }
	| { kind: 'default' }
	| { kind: 'model'; model: string };

export type CloudAgentState = {
	sessions: CloudSession[];
	eventsById: Record<string, CloudSessionEvent[]>;
	selectedId: string | null;
	/** 一覧の初回読み込み中 */
	loading: boolean;
	lastError: string | null;
	/** 「起動」を押してから、全セッションの起動 (作成 → アップロード → 開始) が終わるまで */
	creating: boolean;
	/** 起動中の進捗 (例: 「ワークスペースをアップロード中 (2/3)」)。起動していなければ null */
	creatingProgress: string | null;
	changesById: Record<string, CloudChangesState>;
	isLoggedIn: boolean;
	/** 送信中の追加指示があるセッション */
	sendingById: Record<string, boolean>;
	/** ワークスペース (最初のフォルダ) の名前。フォルダを開いていなければ null */
	workspaceName: string | null;
	/**
	 * 「新しいクラウドエージェント」コマンドで増える番号。パネルはこれが前回見た値より
	 * 大きくなったら入力欄にフォーカスする (パネルのマウント前に来た要求も取りこぼさない)。
	 */
	focusFormRequest: number;
	github: CloudGitHubState;
	githubRepos: CloudGitHubReposState;
	/** fullName ("owner/name") → ブランチ一覧 */
	githubBranchesByRepo: Record<string, CloudGitHubBranchesState>;
	githubPick: CloudGitHubPick | null;
	/** 最後に選んだモデル。null = まだ選んだことがない (パネルは使用中の Division プロジェクトがあれば Division Project を既定にする) */
	modelPick: CloudModelPick | null;
	/** session id → pull request state (only for GitHub-repo sessions that were looked at) */
	pullRequestById: Record<string, CloudPullRequestState>;
};

/**
 * サンドボックスに何を置いて始めるか:
 *  - workspace: 開いているフォルダを tar.gz にしてアップロードする
 *  - github:    GitHub のリポジトリ (連携したアカウントのトークンでサーバーが clone する。非公開も可)
 *  - url:       公開リポジトリの https URL をサーバーが clone する
 *  - empty:     空のフォルダ
 */
export type CloudSessionSource = 'workspace' | 'github' | 'url' | 'empty';

export type CreateCloudSessionsOptions = {
	prompt: string;
	title?: string;
	/**
	 * provider/model の指定。空ならプロジェクトの coder 割り当て。
	 * CLOUD_DIVISION_PROJECT_MODEL ('division-project') なら Division Project として動かす (projectId が必須)
	 */
	model?: string;
	/** 何を置いて始めるか。省略時は includeWorkspace から決める (true → workspace / false → empty) */
	source?: CloudSessionSource;
	/** source が github なら fullName、url なら url (と、どちらも任意で branch) */
	repo?: { fullName?: string; url?: string; branch?: string };
	/** 旧オプション (source を省略したときだけ見る): ワークスペースを tar.gz にしてサンドボックスへ送る */
	includeWorkspace?: boolean;
	/** 同じ指示で並列に起動するセッション数 (1〜10) */
	count?: number;
	/**
	 * Division プロジェクトの ID (.division/projects.json の projectId)。指定するとサーバーはそのプロジェクトの
	 * coder の割り当てをモデルに使う (model を指定したときは model が優先)。空なら送らない
	 */
	projectId?: string;
	/** false なら、起動したセッションを選択しない (カンバンからの起動など、見ている画面を切り替えたくないとき)。既定は true */
	select?: boolean;
};

export interface ICloudAgentService {
	readonly _serviceBrand: undefined;

	readonly state: CloudAgentState;
	readonly onDidChangeState: Event<void>;

	refresh(): Promise<void>;
	createSession(opts: CreateCloudSessionsOptions): Promise<CloudSession[]>;
	select(id: string | null): void;
	sendMessage(id: string, text: string): Promise<boolean>;
	stop(id: string): Promise<void>;
	/** 動いているセッションをすべて止める。止めた数を返す */
	stopAll(): Promise<number>;
	archive(id: string): Promise<void>;
	loadChanges(id: string): Promise<void>;
	/** サンドボックスの変更をワークスペース (最初のフォルダ) に差分として取り込む。paths 省略で全部 */
	applyChanges(id: string, paths?: string[]): Promise<CloudApplyResult | null>;
	openPane(): Promise<void>;
	/** パネルの表示状態 (表示中はポーリングを速くする)。cloudAgentsPane.ts から呼ぶ */
	setPaneVisible(visible: boolean): void;
	requestFocusForm(): void;
	dismissError(): void;

	// --- GitHub アカウント連携 ---

	/** 連携の状態を取り直す */
	refreshGitHubStatus(): Promise<void>;
	/** 連携を始める: 連携用の URL をシステムのブラウザで開き、連携できるまで /status をポーリングする */
	connectGitHub(): Promise<void>;
	/** ブラウザでの許可待ちをやめる */
	cancelGitHubConnect(): void;
	/** 確認してから連携を解除する。解除できたら true */
	disconnectGitHub(): Promise<boolean>;
	/** リポジトリを検索する (q はサーバー側で名前を絞る)。page 2 以降は今の一覧に足す */
	searchGitHubRepos(q: string, page?: number): Promise<void>;
	/** ブランチ一覧を読む (読み込み済みなら force のときだけ読み直す) */
	loadGitHubBranches(fullName: string, force?: boolean): Promise<void>;
	/** 選んだリポジトリとブランチを覚える (次回の初期値になる)。null で忘れる */
	setGitHubPick(pick: CloudGitHubPick | null): void;

	/** 選んだモデルを覚える (次回の初期値になる)。null で忘れる */
	setModelPick(pick: CloudModelPick | null): void;

	// --- Pull requests (GitHub-repo sessions only) ---

	/** GET .../pull-request: the existing PR, the form's suggestion and whether a PR can be created now. Also stored in pullRequestById */
	getPullRequestInfo(id: string): Promise<CloudPullRequestInfoResult>;
	/** POST .../pull-request: creates the PR, or pushes the current workspace to it when one exists. Also stored in pullRequestById */
	createPullRequest(id: string, params: CreateCloudPullRequestParams): Promise<CloudPullRequestCreateResult>;
	/** Opens a pull request URL (https only) in the system browser */
	openPullRequest(url: string): Promise<void>;
}

export const ICloudAgentService = createDecorator<ICloudAgentService>('cloudAgentService');
