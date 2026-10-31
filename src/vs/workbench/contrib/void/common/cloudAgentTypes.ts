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
//   POST /api/cloud-sessions                  { prompt, title?, model?, projectId?, workspaceName?, goalLoop?, maxRounds?, approvalMode? } → { session }
//        model: "provider/model" (単体のモデル) / "division-project" (projectId 必須。Division Project として動く) / 省略 (プロジェクトの coder)
//        goalLoop: "auto" (既定。目標を立てて達成するまでラウンドを繰り返す) / "confirm" (未達のラウンドごとに止まる) / "off"
//        approvalMode: true (Division Project のみ): coder 以外のロールの成果物 (.division/*.md) ができるたびに止まり、承認を待つ
//   POST /api/cloud-sessions/:id/upload       { index, total, data(base64) }
//   POST /api/cloud-sessions/:id/start        { workspaceInfo?, repo? } → { session }
//   GET  /api/cloud-sessions?limit=50         → { sessions }
//   GET  /api/cloud-sessions/:id              → { session }
//   GET  /api/cloud-sessions/:id/events?after=&limit=  → { events, session }
//   POST /api/cloud-sessions/:id/messages     { text } → { session }
//        { continueGoal: true, text? }: 目標ループが「毎回確認」で止まっているとき、次のラウンドへ進める (text は追加の指示)
//   GET  /api/cloud-sessions/:id/approval     → { approval: CloudPendingApproval | null }  (status が awaiting_approval のとき)
//   POST /api/cloud-sessions/:id/approval     { taskSeq, action: "approve" | "revise", content?, feedback? } → { session }
//        content: 編集した成果物 (変えたときだけ送る)。approve で次のタスクへ、revise (feedback 必須) で同じロールがやり直す
//        承認待ちの間 /messages は 409 { code: "awaiting_approval" }
//   POST /api/cloud-sessions/:id/stop         {} → { session }
//   POST /api/cloud-sessions/:id/archive      {} → { ok }
//   GET  /api/cloud-sessions/:id/changes      → { changes, patch, patchTruncated }
//   GET  /api/cloud-sessions/:id/file?path=&ref=current|base → { path, ref, exists, encoding, content, size }
//
// GitHub アカウント連携 (リポジトリを一覧から選んで、サーバーがユーザーのトークンで clone する):
//   GET  /api/github/status                   → { configured, connected, login?, avatarUrl?, scopes? }
//   POST /api/github/connect                  {} → { url }  (システムのブラウザで開いて GitHub で許可してもらう)
//   POST /api/github/disconnect               {} → { ok }
//   GET  /api/github/repos?q=&page=           → { repos, hasMore }  (最近 push した順に 50 件ずつ)
//   GET  /api/github/branches?repo=owner/name → { branches, defaultBranch }
//   エラー: 409 { code: 'github_not_connected' } (未連携 / トークン失効)、503 { code: 'github_not_configured' }
//
// Pull requests (only for sessions started from a GitHub repo, i.e. workspaceInfo.repoFullName is set):
//   GET  /api/cloud-sessions/:id/pull-request → { pullRequest, pullRequestState?, suggestion, canCreate, reason?, code? }
//   POST /api/cloud-sessions/:id/pull-request { title, body?, branch?, base?, draft? } → { pullRequest, updated, action }
//        Creates the PR on the first call; while it is open, later calls push a new commit to the same branch ("update").
//        Once it is merged / closed, the next call opens a new PR.
//   Errors: { error: <Japanese message>, code } (see CLOUD_PR_ERROR_CODES)

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';


// ---------------------------------------------------------------------------
// DTO (サーバーの JSON そのまま)
// ---------------------------------------------------------------------------

export type CloudSessionStatus =
	| 'provisioning'  // サンドボックス作成中
	| 'uploading'     // ワークスペースのアップロード + /start 待ち
	| 'running'       // エージェントが作業中
	| 'awaiting_approval' // 承認モード: ロールの成果物 (.division/*.md) の承認待ち
	| 'idle'          // 1 ターン終わった (追加の指示を送れる)
	| 'failed'        // 失敗した (追加の指示を送ると再開する)
	| 'cancelled';    // ユーザーが止めた (追加の指示を送ると再開する)

export type CloudWorkspaceInfo = {
	fileCount: number;
	bytes: number;
	skipped: number;
	gitBranch?: string;
	gitCommit?: string;
	/** リポジトリから始めたとき (サーバーが付ける)。例: https://github.com/owner/name */
	repoUrl?: string;
	/** GitHub のリポジトリから始めたとき (サーバーが付ける)。"owner/name" */
	repoFullName?: string;
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
	/**
	 * ここまでに課金されたモデルの料金 (USD)。一覧 (GET /api/cloud-sessions) と GET /api/cloud-sessions/:id にだけ付く。
	 * 無ければ「不明」(0 ではない)。イベントの応答などに付いてくる session には無いので、上書きで消さないこと
	 */
	costUsd?: number;
	/**
	 * The pull request opened from this session (GitHub-repo sessions only). null / absent = no PR yet.
	 * Present on list / detail / create responses; sessions embedded in other responses may omit it,
	 * so an absent value must not wipe a known one.
	 */
	pullRequest?: CloudPullRequest | null;
	/** 目標ループ。この機能より前のサーバー・セッションには無い (= 'off') */
	goalLoop?: CloudGoalLoopMode;
	/** 目標ループのラウンド数の上限 */
	goalMaxRounds?: number;
	/** 承認モード (Division Project のみ)。この機能より前のサーバーには無い (= false) */
	approvalMode?: boolean;
}

export type CloudSessionEventType = 'user' | 'assistant' | 'tool' | 'status' | 'error' | 'done' | 'plan' | 'task' | 'approval' | 'pull_request' | 'goal' | 'review' | 'compaction';

export interface CloudSessionEvent {
	seq: number;
	type: CloudSessionEventType;
	/**
	 * type ごとの中身:
	 *  - user:      { text }
	 *  - assistant: { text, toolCall?: { name, args } }
	 *  - tool:      { name, args, ok, output, durationMs }
	 *               name が 'update_plan' なら plan: { step, status: 'pending' | 'in_progress' | 'completed' }[] と explanation? も付く
	 *               (エージェント自身の計画。Codex の update_plan と同じ。最新のものがいまの計画)
	 *               name が 'apply_patch' なら成功時に files: { kind: 'add' | 'update' | 'delete', path, fromPath, added, removed }[] も付く
	 *  - status:    { status, message? }
	 *  - error:     { message }
	 *  - done:      { summary, changedFiles }
	 *  - plan:      CloudPlanEventData (Division Project モードのみ。リーダーの計画)
	 *  - task:      CloudTaskEventData (Division Project モードのみ。ロールごとのタスクの開始 / 完了 / 失敗)
	 *  - approval:  CloudApprovalEventData (承認モード。ユーザーが成果物を承認した / 差し戻した)
	 *  - pull_request: CloudPullRequestEventData (a PR was created / updated from this session)
	 *  - goal:      CloudGoalEventData (目標ループ。作業の前にリーダーが立てた目標と達成条件)
	 *  - review:    CloudReviewEventData (目標ループ。ラウンドの終わりのレビュー。status: start → done)
	 *  - compaction: { summary, upToSeq, beforeChars?, auto?, role?, phase? } 会話が長くなったので、upToSeq までの経緯を
	 *               エージェントが要約した (Codex の自動コンパクション)。以後のモデルにはその要約が渡る
	 *  目標ループでは各ラウンドのイベントに round が付き、レビュアーの assistant / tool には phase: 'review' が付く。
	 *  Division Project モードでは assistant に role?: string (ロールの slug) も付く。
	 *  assistant / tool は直前に start した task に属する。
	 */
	data: any;
	createdAt: string;
}

/**
 * model にこの値を指定して作成すると、サーバーは「Division Project」(マルチエージェント) として動かす:
 * プロジェクトのリーダーがロールごとにタスクを計画し (plan イベント)、各タスクをそのロールに割り当てたモデルが
 * サンドボックスで順に行い (task イベント)、最後にまとめ (done) を出す。projectId が必須。
 * IDE のチャットのモデル選択の「Division Project」(divisionAPI / division-orchestrator) に当たる。
 */
export const CLOUD_DIVISION_PROJECT_MODEL = 'division-project';

/** plan イベントの 1 タスク */
export type CloudPlanTask = {
	index: number;
	/** ロールの slug (例: coder) */
	role: string;
	/** ロールの表示名 (例: 実装) */
	roleName: string;
	title: string;
	instruction: string;
	/** "Provider · modelId" */
	model: string;
};

/** plan イベントの data */
export type CloudPlanEventData = {
	tasks: CloudPlanTask[];
	leaderModel: string;
};

/** task イベントの data */
export type CloudTaskEventData = {
	index: number;
	role: string;
	roleName: string;
	title: string;
	model: string;
	status: 'start' | 'done' | 'failed';
	summary?: string;
	/** 承認モード: この結果 (ロールの .division ファイル) はユーザーの承認待ち */
	needsApproval?: boolean;
};

/** GET .../approval: 承認待ちの成果物 */
export type CloudPendingApproval = {
	/** 結果の task イベントの seq。承認するときにそのまま返す */
	taskSeq: number;
	index: number;
	role: string;
	roleName: string;
	title: string;
	/** ワークスペースからの相対パス (例: .division/REVIEW.md) */
	file: string;
	summary: string;
	/** ファイルの中身。無い / 大きすぎる (tooLarge) ときは null */
	content: string | null;
	tooLarge?: boolean;
};

/** approval イベント: ユーザーが成果物を承認した / 差し戻した */
export type CloudApprovalEventData = {
	taskSeq: number;
	index: number;
	role: string;
	roleName: string;
	title: string;
	file: string;
	status: 'approved' | 'revised';
	/** ユーザーがファイルを編集してから承認 / 差し戻しした */
	edited: boolean;
	feedback?: string;
};

export type CloudApprovalAction = 'approve' | 'revise';

/**
 * 目標ループ (IDE の Division フローの「ループ」と同じ):
 *  - auto:    目標を達成するまで、未達なら自動で次のラウンドへ進む
 *  - confirm: 未達のラウンドが終わるたびに止まり (idle)、「次のラウンドへ進む」(continueGoal) を待つ
 *  - off:     目標を立てずに 1 回だけ作業する
 */
export type CloudGoalLoopMode = 'auto' | 'confirm' | 'off';
export const CLOUD_GOAL_LOOP_DEFAULT: CloudGoalLoopMode = 'auto';
export const isCloudGoalLoopMode = (v: unknown): v is CloudGoalLoopMode => v === 'auto' || v === 'confirm' || v === 'off';

/** goal イベントの data */
export type CloudGoalEventData = {
	goal: string;
	criteria: string[];
	maxRounds: number;
	mode: CloudGoalLoopMode;
	/** 目標を立てたモデル ("Provider · modelId" など) */
	model?: string;
};

/** review イベントの 1 条件の判定 */
export type CloudReviewCriterion = {
	/** 1 始まり */
	index: number;
	text: string;
	met: boolean;
	reason: string;
};

/**
 * review イベントの data。next:
 *  - continue: 未達 → 次のラウンドへ / achieved: 達成 / limit: 上限で未達のまま終了 / paused: 未達で確認待ち
 */
export type CloudReviewEventData =
	| { round: number; status: 'start'; model?: string; role?: string }
	| {
		round: number;
		status: 'done';
		achieved: boolean;
		criteria: CloudReviewCriterion[];
		summary: string;
		next: 'continue' | 'achieved' | 'limit' | 'paused';
		maxRounds?: number;
		model?: string;
		role?: string;
	};

/**
 * 「次のラウンドへ進む」を出すべきレビュー: 最後のレビューが paused で、そのあとにユーザーの発言が無い。無ければ null
 */
export const pausedGoalReview = (events: readonly CloudSessionEvent[]): Extract<CloudReviewEventData, { status: 'done' }> | null => {
	for (let i = events.length - 1; i >= 0; i--) {
		const ev = events[i];
		if (ev.type === 'user' || ev.type === 'goal') return null;
		if (ev.type === 'review' && ev.data?.status === 'done') return ev.data.next === 'paused' ? ev.data : null;
	}
	return null;
};

/** A pull request opened from a session (CloudSession.pullRequest, GET/POST .../pull-request) */
export type CloudPullRequest = {
	number: number;
	/** https://github.com/owner/name/pull/<number> */
	url: string;
	/** Head branch the session's commits are pushed to */
	branch: string;
	base: string;
	headSha: string;
	title: string;
	draft: boolean;
	createdAt: string;
	updatedAt: string;
};

/** Data of a pull_request event */
export type CloudPullRequestEventData = {
	number: number;
	url: string;
	branch: string;
	base: string;
	action: 'created' | 'updated';
	title: string;
};

/** Server-generated defaults for the PR form */
export type CloudPullRequestSuggestion = {
	title: string;
	body: string;
	branch: string;
	base: string;
};

/** State of the session's PR on GitHub. null = it could not be read */
export type CloudPullRequestStatus = 'open' | 'closed' | 'merged';

/** GET /api/cloud-sessions/:id/pull-request */
export type CloudPullRequestInfo = {
	pullRequest: CloudPullRequest | null;
	/** Only meaningful when pullRequest is set. merged / closed → the next POST opens a new PR */
	pullRequestState: CloudPullRequestStatus | null;
	/**
	 * Prefill for the form. While the PR is open: its current title / body / branch / base on GitHub.
	 * Otherwise a fresh suggestion for a new PR.
	 */
	suggestion: CloudPullRequestSuggestion;
	/** false → `reason` (Japanese) says why the PR cannot be created / updated right now, `code` says it for machines */
	canCreate: boolean;
	reason?: string;
	code?: string;
};

/** POST /api/cloud-sessions/:id/pull-request body */
export type CreateCloudPullRequestParams = {
	title: string;
	body?: string;
	/** Head branch to create (ignored by the server once the session has a PR) */
	branch?: string;
	base?: string;
	draft?: boolean;
};

/** POST /api/cloud-sessions/:id/pull-request response. updated=false / action 'unchanged': nothing to push or patch */
export type CloudPullRequestResult = {
	pullRequest: CloudPullRequest;
	updated: boolean;
	action: 'created' | 'updated' | 'unchanged';
};

/**
 * Error codes the PR endpoints return in `{ error, code }`. github_not_connected is shared with the GitHub API.
 * `validation` is also used locally when the form is rejected before sending.
 */
export const CLOUD_PR_ERROR_CODES = {
	notGitHubRepo: 'not_github_repo',
	validation: 'validation',
	sessionRunning: 'session_running',
	noChanges: 'no_changes',
	inProgress: 'pr_in_progress',
	branchExists: 'branch_exists',
	noPushAccess: 'github_no_push_access',
	githubError: 'github_error',
	sessionArchived: 'session_archived',
	branchDiverged: 'branch_diverged',
	missingParent: 'missing_parent',
	sandboxError: 'sandbox_error',
} as const;

export const CLOUD_PR_TITLE_MAX = 256;
export const CLOUD_PR_BODY_MAX = 60_000;

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

/** /start の repo。fullName (GitHub。連携したトークンで clone するので非公開も可) か url (公開リポジトリ) のどちらか一方 */
export type CloudStartRepo =
	| { fullName: string; branch?: string }
	| { url: string; branch?: string };

/** GET /api/github/status */
export type GitHubStatus = {
	/** false = サーバーに GitHub の OAuth アプリが設定されていない (連携できない) */
	configured: boolean;
	connected: boolean;
	login?: string;
	avatarUrl?: string;
	scopes?: string;
};

/** GET /api/github/repos の 1 件 */
export interface GitHubRepo {
	/** "owner/name" */
	fullName: string;
	name: string;
	owner: string;
	private: boolean;
	defaultBranch: string;
	description: string | null;
	/** ISO */
	pushedAt: string | null;
	htmlUrl: string;
}

/** サーバーが { error, code } の code で返す、HTTP ステータスだけでは分からない理由 */
export const GITHUB_NOT_CONNECTED = 'github_not_connected';
export const GITHUB_NOT_CONFIGURED = 'github_not_configured';

/**
 * The PR that "PR を更新" would push to: the given one unless GET .../pull-request reported that same PR as
 * merged / closed (then the next submit opens a new PR). An unknown state counts as open.
 */
export const updatablePullRequest = (pullRequest: CloudPullRequest | null, info: CloudPullRequestInfo | undefined): CloudPullRequest | null => {
	if (!pullRequest) return null;
	const sameAsInfo = info?.pullRequest?.number === pullRequest.number;
	return sameAsInfo && (info.pullRequestState === 'merged' || info.pullRequestState === 'closed') ? null : pullRequest;
};

/** Whether the session was started from a GitHub repo (the only kind that can open a pull request) */
export const isGitHubRepoSession = (session: { workspaceInfo: CloudWorkspaceInfo | null }): boolean =>
	!!session.workspaceInfo?.repoFullName;

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

/** クラウドで使った料金 (costUsd) の表示。AutoRouting.tsx の見積もりと同じ書き方 ($0.12 / $0.0034 / $1.50) */
export const formatCloudCostUsd = (n: number): string => {
	if (!Number.isFinite(n) || n <= 0) return '$0';
	if (n < 0.0001) return '<$0.0001';
	if (n >= 1) return `$${n.toFixed(2)}`;
	return `$${n.toFixed(4).replace(/(\.\d\d\d*?)0+$/, '$1')}`;
};

/** costUsd が付いているセッションだけを足す。1 つも無ければ null (= 不明) */
export const sumCloudCostUsd = (sessions: readonly { costUsd?: number }[]): number | null => {
	let total = 0;
	let known = false;
	for (const s of sessions) {
		if (typeof s.costUsd === 'number' && Number.isFinite(s.costUsd)) {
			total += s.costUsd;
			known = true;
		}
	}
	return known ? total : null;
};

/** API のパスはすべてこの下 (と GITHUB_API_PREFIX の下)。main プロセス側の中継もこれ以外は通さない */
export const CLOUD_SESSIONS_API_PREFIX = '/api/cloud-sessions';
/** GitHub アカウント連携の API */
export const GITHUB_API_PREFIX = '/api/github';
/** ログイン中アカウントの Division プロジェクトとロール割り当て (Pull from Remote が読む) */
export const DIVISION_PROJECTS_API_PREFIX = '/api/projects';
/** Decision Inbox (判断が必要な項目をセッション横断で集めたもの) */
export const DECISIONS_API_PREFIX = '/api/decisions';

/** 1 回の起動で並列に走らせられるセッション数の上限 */
export const CLOUD_AGENTS_MAX_PARALLEL = 10;


// ---------------------------------------------------------------------------
// リポジトリ名・URL・ブランチの確認 (サーバーの zod スキーマと同じ条件。送る前に日本語で弾く)
// ---------------------------------------------------------------------------

/** "owner/name" の形か。問題があれば理由 (日本語)、無ければ null */
export const validateGitHubFullName = (raw: string): string | null => {
	const value = raw.trim();
	if (!value) return 'リポジトリを選んでください。';
	// owner は GitHub のユーザー名の規則 (英数字とハイフン、39 文字まで)
	const m = /^([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})$/.exec(value);
	if (!m || m[2] === '.' || m[2] === '..') return 'リポジトリ名の形式が正しくありません (owner/name)。';
	return null;
};

/** 公開リポジトリの https URL か (認証情報を含めない) */
export const validateCloudRepoUrl = (raw: string): string | null => {
	const value = raw.trim();
	if (!value) return 'リポジトリの URL を入力してください。';
	if (value.length > 500) return 'URL が長すぎます。';
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return 'URL の形式が正しくありません。';
	}
	if (url.protocol !== 'https:') return 'https:// で始まる URL を入力してください。';
	if (url.username || url.password) return 'URL にユーザー名やトークンを含めないでください (非公開のリポジトリは GitHub 連携から選んでください)。';
	if (/[\s'"`$\\]/.test(value)) return 'URL に使えない文字が含まれています。';
	return null;
};

/** ブランチ名 (空は「既定のブランチ」なので OK) */
export const validateCloudRepoBranch = (raw: string): string | null => {
	const value = raw.trim();
	if (!value) return null;
	if (!/^[A-Za-z0-9._\/-]{1,200}$/.test(value) || value.startsWith('-') || value.includes('..')) {
		return 'ブランチ名に使えない文字が含まれています。';
	}
	return null;
};

/**
 * Head branch name for a new PR (git check-ref-format rules, plus no leading '-'). Returns a Japanese reason or null.
 * Looser than validateCloudRepoBranch on purpose: the server's suggestion may contain any character git allows.
 */
export const validateCloudPullRequestBranch = (raw: string): string | null => {
	const value = raw.trim();
	if (!value) return 'ブランチ名を入力してください。';
	if (value.length > 200) return 'ブランチ名が長すぎます。';
	if (
		value.startsWith('-') || value.startsWith('/') || value.endsWith('/') || value.endsWith('.') || value.endsWith('.lock')
		|| value.includes('..') || value.includes('//') || value.includes('@{') || value === '@'
		// eslint-disable-next-line no-control-regex
		|| /[\x00-\x20\x7f~^:?*\[\\]/.test(value)
		|| value.split('/').some(seg => seg.startsWith('.'))
	) {
		return 'ブランチ名に使えない文字が含まれています。';
	}
	return null;
};

/** PR title and body limits (same as the server). Returns a Japanese reason or null */
export const validateCloudPullRequestFields = (title: string, body: string): string | null => {
	const t = title.trim();
	if (!t) return 'タイトルを入力してください。';
	if (t.length > CLOUD_PR_TITLE_MAX) return `タイトルは ${CLOUD_PR_TITLE_MAX} 文字以内にしてください。`;
	if (body.length > CLOUD_PR_BODY_MAX) return `説明は ${CLOUD_PR_BODY_MAX} 文字以内にしてください。`;
	return null;
};

/** 'https://github.com/owner/repo.git' → 'github.com/owner/repo' */
export const cloudRepoLabel = (url: string): string =>
	url.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').replace(/\.git$/i, '');

/** clone したときのフォルダ名 ('owner/repo' や 'https://github.com/owner/repo.git' → 'repo')。分からなければ空 */
export const cloudRepoFolderName = (repo: { fullName?: string; url?: string }): string => {
	const label = repo.fullName ? repo.fullName.trim() : cloudRepoLabel(repo.url ?? '');
	const parts = label.split('/').filter(Boolean);
	return parts.length > 1 ? parts[parts.length - 1] : '';
};


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
	/** `/api/cloud-sessions` / `/api/github` / `/api/projects` で始まるパス (クエリ文字列を含んでよい) */
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

	/** Division の /api/cloud-sessions・/api/github 配下への GET / POST。例外は投げず ok:false で返す */
	request(params: CloudAgentRequestParams): Promise<CloudAgentResponse>;

	/** ワークスペースを tar.gz にまとめ、2 MiB ずつ /upload に送る。例外は投げず ok:false で返す */
	uploadWorkspace(params: CloudAgentUploadParams): Promise<CloudAgentUploadResult>;
}

export const ICloudAgentMainService = createDecorator<ICloudAgentMainService>('cloudAgentMainService');


// ---------------------------------------------------------------------------
// Decision Inbox (Division API の /api/decisions)
// ---------------------------------------------------------------------------
//
// 人間の判断が要るものだけをセッション横断で 1 つにまとめた一覧。
//  - source 'session' … 承認待ち / 変更の確認待ち (PR 前) / 失敗。サーバーがセッションの状態から毎回組み立てる
//  - source 'signal'  … 監視中のリポジトリで検出された CI 失敗・修正依頼 (Friction Detector)。
//                       investigation (調査用の指示とリポジトリ) が付いていて、ワンタップで AI に調査させられる

export type CloudDecisionKind = 'approval' | 'review_changes' | 'session_failed' | 'ci_failure' | 'changes_requested';
export type CloudDecisionStatus = 'open' | 'in_progress' | 'resolved' | 'dismissed';
export type CloudDecisionPriority = 'low' | 'medium' | 'high';
export type CloudDecisionOptionId = 'open_session' | 'create_pr' | 'investigate' | 'open_url' | 'dismiss';

export type CloudDecisionOption = { id: CloudDecisionOptionId; label: string; primary?: boolean; url?: string };
export type CloudDecisionEvidence = { label: string; url?: string; detail?: string };
export type CloudDecisionInvestigation = { title: string; prompt: string; repo: { fullName: string; branch?: string } };

export type CloudDecision = {
	id: string;
	source: 'session' | 'signal';
	kind: CloudDecisionKind;
	status: CloudDecisionStatus;
	priority: CloudDecisionPriority;
	title: string;
	summary: string;
	recommendation: string | null;
	evidence: CloudDecisionEvidence[];
	risks: string[];
	options: CloudDecisionOption[];
	investigation: CloudDecisionInvestigation | null;
	sessionId: string | null;
	createdAt: string;
};

export const CLOUD_DECISION_KIND_LABELS: Record<CloudDecisionKind, string> = {
	approval: '承認',
	review_changes: '変更の確認',
	session_failed: '停止',
	ci_failure: 'CI 失敗',
	changes_requested: '修正依頼',
};

const DECISION_KINDS: CloudDecisionKind[] = ['approval', 'review_changes', 'session_failed', 'ci_failure', 'changes_requested'];
const DECISION_STATUSES: CloudDecisionStatus[] = ['open', 'in_progress', 'resolved', 'dismissed'];
const DECISION_PRIORITIES: CloudDecisionPriority[] = ['low', 'medium', 'high'];
const DECISION_OPTION_IDS: CloudDecisionOptionId[] = ['open_session', 'create_pr', 'investigate', 'open_url', 'dismiss'];

const decisionStr = (v: unknown): string => (typeof v === 'string' ? v : '');
const isHttpsUrl = (v: unknown): v is string => typeof v === 'string' && /^https:\/\/\S+$/i.test(v);

/** サーバーの DTO を読む。欠けた値・知らない値・https 以外のリンクは捨てる (画面が落ちない・危ない URL を開かない)。 */
export const toCloudDecision = (raw: unknown): CloudDecision | null => {
	const d = (raw ?? {}) as Record<string, unknown>;
	if (!decisionStr(d.id) || !decisionStr(d.title)) return null;
	const inv = (d.investigation ?? {}) as Record<string, unknown>;
	const invRepo = (inv.repo ?? {}) as Record<string, unknown>;
	const investigation: CloudDecisionInvestigation | null = decisionStr(inv.prompt).trim() && /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(decisionStr(invRepo.fullName))
		? { title: decisionStr(inv.title), prompt: decisionStr(inv.prompt), repo: { fullName: decisionStr(invRepo.fullName), ...(decisionStr(invRepo.branch) ? { branch: decisionStr(invRepo.branch) } : {}) } }
		: null;
	const options: CloudDecisionOption[] = [];
	for (const o of Array.isArray(d.options) ? d.options as Record<string, unknown>[] : []) {
		if (!o || !DECISION_OPTION_IDS.includes(o.id as CloudDecisionOptionId)) continue;
		if (o.id === 'open_url' && !isHttpsUrl(o.url)) continue;
		if (o.id === 'investigate' && !investigation) continue;
		options.push({ id: o.id as CloudDecisionOptionId, label: decisionStr(o.label) || String(o.id), ...(o.primary === true ? { primary: true } : {}), ...(isHttpsUrl(o.url) ? { url: o.url } : {}) });
	}
	return {
		id: decisionStr(d.id),
		source: d.source === 'signal' ? 'signal' : 'session',
		kind: DECISION_KINDS.includes(d.kind as CloudDecisionKind) ? d.kind as CloudDecisionKind : 'review_changes',
		status: DECISION_STATUSES.includes(d.status as CloudDecisionStatus) ? d.status as CloudDecisionStatus : 'open',
		priority: DECISION_PRIORITIES.includes(d.priority as CloudDecisionPriority) ? d.priority as CloudDecisionPriority : 'medium',
		title: decisionStr(d.title),
		summary: decisionStr(d.summary),
		recommendation: decisionStr(d.recommendation) || null,
		evidence: (Array.isArray(d.evidence) ? d.evidence as Record<string, unknown>[] : [])
			.filter(e => e && decisionStr(e.label))
			.map(e => ({ label: decisionStr(e.label), ...(isHttpsUrl(e.url) ? { url: e.url } : {}), ...(decisionStr(e.detail) ? { detail: decisionStr(e.detail) } : {}) })),
		risks: (Array.isArray(d.risks) ? d.risks : []).filter((r): r is string => typeof r === 'string' && !!r),
		options,
		investigation,
		sessionId: decisionStr(d.sessionId) || null,
		createdAt: decisionStr(d.createdAt),
	};
};

/** カードの主ボタン (対応中のものは押させない)。 */
export const primaryDecisionOption = (d: CloudDecision): CloudDecisionOption | null =>
	d.status !== 'open' ? null : d.options.find(o => o.primary) ?? d.options.find(o => o.id !== 'dismiss') ?? null;

/**
 * 受信箱を読み直すべきかの目印。セッションの状態 (承認待ち・変更・PR) が変わったときだけ変わる
 * (一覧のポーリングのたびには読み直さない)。
 */
export const decisionInboxSignature = (sessions: readonly { id: string; status: string; changedFiles?: number; pullRequest?: { number?: number } | null }[]): string =>
	sessions.map(s => `${s.id}:${s.status}:${s.changedFiles ?? 0}:${s.pullRequest?.number ?? ''}`).join('|');
