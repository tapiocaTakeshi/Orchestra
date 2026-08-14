/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Orchestra 内蔵カンバンの型定義。
//
// ボードはワークスペース直下の `.orchestra/kanban.json` に置く。外部サービスを介さないので
// タスクはリポジトリと一緒に git に乗るし、オフラインでも動く。
//
// カラムには「役割 (role)」を持たせている。エージェント実行はこの役割だけを見て
//   todo のカラムから拾う → in-progress へ移す → 成否に応じて done / error へ移す
// と動くので、カラム名を自由に変えても (日本語にしても) 実行フローは壊れない。

// ---------------------------------------------------------------------------
// ボードのデータモデル
// ---------------------------------------------------------------------------

/**
 * カラムの役割。エージェント実行のパイプラインはこの値だけを見る。
 *  - none:        ただの置き場 (Backlog など)。自動実行の対象にならない
 *  - todo:        実行待ち。自動実行はここからタスクを拾う
 *  - in-progress: 実行中の置き場
 *  - done:        正常終了したタスクの置き場
 *  - error:       失敗 / タイムアウトしたタスクの置き場
 */
export type KanbanColumnRole = 'none' | 'todo' | 'in-progress' | 'done' | 'error';

export const kanbanColumnRoles: KanbanColumnRole[] = ['none', 'todo', 'in-progress', 'done', 'error'];

export type KanbanPriority = 'urgent' | 'high' | 'normal' | 'low';

export const kanbanPriorities: KanbanPriority[] = ['urgent', 'high', 'normal', 'low'];

export type KanbanChecklistItem = {
	id: string;
	text: string;
	done: boolean;
};

export type KanbanComment = {
	id: string;
	/** agent = エージェント実行の結果として書き込まれたもの */
	author: 'user' | 'agent';
	body: string;
	createdAt: number;
};

export type KanbanRunStatus = 'done' | 'error' | 'timeout' | 'canceled' | 'dry-run';

export type KanbanRunRecord = {
	status: KanbanRunStatus;
	startedAt: number;
	endedAt: number;
	/** 実行に使ったチャットスレッド。カードから会話を開き直すのに使う */
	threadId?: string;
	error?: string;
	/** アシスタントの最終出力 (先頭部分) */
	summary?: string;
};

export type KanbanTask = {
	id: string;
	columnId: string;
	title: string;
	description: string;
	labels: string[];
	priority: KanbanPriority;
	/** 'YYYY-MM-DD'。未設定なら '' */
	dueDate: string;
	assignee: string;
	checklist: KanbanChecklistItem[];
	comments: KanbanComment[];
	/** false なら自動実行の対象外 (手動で実行することは引き続きできる) */
	agentEnabled: boolean;
	createdAt: number;
	updatedAt: number;
	/** 実行履歴 (新しい順、最大 KANBAN_MAX_RUNS_PER_TASK 件) */
	runs: KanbanRunRecord[];
};

export type KanbanColumn = {
	id: string;
	title: string;
	role: KanbanColumnRole;
	/** WIP 上限。0 なら上限なし */
	wipLimit: number;
	/** カラム見出しの色 (CSS カラー文字列)。'' なら既定色 */
	color: string;
};

/** `.orchestra/kanban.json` のフォーマット */
export type KanbanBoard = {
	version: 1;
	title: string;
	columns: KanbanColumn[];
	/**
	 * 全カラムのタスクを 1 本の配列で持つ。カラム内の並び順はこの配列の並び順
	 * (同じ columnId のものを抽出した順序) で決まるので、順序用のフィールドは持たない。
	 */
	tasks: KanbanTask[];
	updatedAt: number;
};

export const KANBAN_BOARD_FILE_RELPATH = ['.orchestra', 'kanban.json'] as const;

export const KANBAN_MAX_RUNS_PER_TASK = 10;

/** サマリ (カードに残す実行結果) の最大文字数 */
export const KANBAN_MAX_SUMMARY_CHARS = 8000;

// ---------------------------------------------------------------------------
// 実行の設定 (GlobalSettings.kanban)
// ---------------------------------------------------------------------------

export type KanbanSettings = {
	/** true の間、pollIntervalSec ごとに todo カラムを見に行き、あれば実行する */
	autoRunEnabled: boolean;
	/** ポーリング間隔 (秒)。下限 MIN_KANBAN_POLL_INTERVAL_SEC */
	pollIntervalSec: number;
	/** 1 回のポーリングで処理するタスクの最大数 */
	maxTasksPerRun: number;
	/** 1 タスクあたりの実行タイムアウト (分)。超えたら中断して error 扱い */
	taskTimeoutMin: number;
	/** タスクを実行するたびに新しいチャットスレッドを開く */
	newThreadPerTask: boolean;
	/** 実行結果をカードのコメントとして書き戻す */
	postResultComment: boolean;
	/** このラベルが付いたタスクだけを自動実行の対象にする。'' なら全タスク */
	requiredLabel: string;
	/** true なら「プロンプトを組み立てるがエージェントには投げない」動作確認モード */
	dryRun: boolean;
	/**
	 * true の間、ボードを開くコマンドが常に別ウィンドウ (auxiliary window) を使う。
	 * サブディスプレイにボードを出しっぱなしにして、メインウィンドウではコードを書く使い方向け。
	 */
	openInNewWindow: boolean;
	/**
	 * プロンプトのテンプレート。以下のプレースホルダが展開される:
	 *   {{title}} {{description}} {{checklist}} {{labels}} {{priority}}
	 *   {{due}} {{assignee}} {{comments}} {{columnName}} {{boardTitle}} {{taskId}}
	 * 空文字なら組み込みの既定テンプレートを使う。
	 */
	promptTemplate: string;
};

export const defaultKanbanSettings: KanbanSettings = {
	autoRunEnabled: false,
	pollIntervalSec: 60,
	maxTasksPerRun: 1,
	taskTimeoutMin: 30,
	newThreadPerTask: true,
	postResultComment: true,
	requiredLabel: '',
	dryRun: false,
	openInNewWindow: false,
	promptTemplate: '',
};

export const MIN_KANBAN_POLL_INTERVAL_SEC = 15;
export const MIN_KANBAN_TASK_TIMEOUT_MIN = 1;

// ---------------------------------------------------------------------------
// サービスの実行状態 (永続化しない)
// ---------------------------------------------------------------------------

export type KanbanBoardSource =
	/** ワークスペースの .orchestra/kanban.json */
	| { kind: 'file'; path: string }
	/** ワークスペースが開かれていないので、アプリのストレージに保存している */
	| { kind: 'storage' };

export type KanbanServiceState = {
	board: KanbanBoard;
	/** 初回読み込みが済んだか。false の間 UI はローディングを出す */
	isLoaded: boolean;
	source: KanbanBoardSource;
	/** ポーリングタイマーが動いているか */
	isPolling: boolean;
	/** タスクを実行中か */
	isRunning: boolean;
	/** エージェントがツール承認待ちで止まっているか (無人実行だと進まない) */
	awaitingApproval: boolean;
	/** 実行中タスクの ID */
	runningTaskId: string | null;
	/** 今回のポーリングで実行待ちになっているタスクの ID */
	queuedTaskIds: string[];
	lastPolledAt: number | null;
	/** 読み書き / 実行で起きた最後のエラー */
	lastError: string | undefined;
};

// ---------------------------------------------------------------------------
// 既定のボード
// ---------------------------------------------------------------------------

export const defaultKanbanColumns = (): KanbanColumn[] => [
	{ id: 'backlog', title: 'Backlog', role: 'none', wipLimit: 0, color: '#8b95a5' },
	{ id: 'todo', title: 'To Do', role: 'todo', wipLimit: 0, color: '#3b82f6' },
	{ id: 'in-progress', title: 'In Progress', role: 'in-progress', wipLimit: 0, color: '#f59e0b' },
	{ id: 'blocked', title: 'Blocked', role: 'error', wipLimit: 0, color: '#ef4444' },
	{ id: 'done', title: 'Done', role: 'done', wipLimit: 0, color: '#10b981' },
];

export const defaultKanbanBoard = (): KanbanBoard => ({
	version: 1,
	title: 'Orchestra Board',
	columns: defaultKanbanColumns(),
	tasks: [],
	updatedAt: Date.now(),
});

// ---------------------------------------------------------------------------
// 正規化
//
// kanban.json は人が直接編集するし、git のマージ結果がそのまま入ってくることもある。
// 読み込んだ値は必ずここを通して、UI と実行側が壊れた形を見ないようにする。
// ---------------------------------------------------------------------------

const asString = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);

const asNumber = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

const asBool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

const asStringArray = (v: unknown): string[] =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map(x => x.trim()).filter(x => !!x) : [];

const asPriority = (v: unknown): KanbanPriority =>
	kanbanPriorities.includes(v as KanbanPriority) ? (v as KanbanPriority) : 'normal';

const asColumnRole = (v: unknown): KanbanColumnRole =>
	kanbanColumnRoles.includes(v as KanbanColumnRole) ? (v as KanbanColumnRole) : 'none';

const asRunStatus = (v: unknown): KanbanRunStatus => {
	const known: KanbanRunStatus[] = ['done', 'error', 'timeout', 'canceled', 'dry-run'];
	return known.includes(v as KanbanRunStatus) ? (v as KanbanRunStatus) : 'error';
};

/** '' か 'YYYY-MM-DD' に丸める。日付として読めない値は落とす。 */
const asDueDate = (v: unknown): string => {
	const raw = asString(v).trim();
	if (!raw) return '';
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	const parsed = new Date(raw);
	if (Number.isNaN(parsed.getTime())) return '';
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
};

/** ID が空・重複しているときに一意な値を振り直すためのヘルパ */
const uniqueId = (candidate: string, taken: Set<string>, prefix: string): string => {
	let id = candidate.trim();
	if (!id || taken.has(id)) {
		let n = taken.size + 1;
		do { id = `${prefix}-${n++}`; } while (taken.has(id));
	}
	taken.add(id);
	return id;
};

const normalizeChecklist = (raw: unknown): KanbanChecklistItem[] => {
	if (!Array.isArray(raw)) return [];
	const taken = new Set<string>();
	return raw
		.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
		.map(item => ({
			id: uniqueId(asString(item.id), taken, 'check'),
			text: asString(item.text),
			done: asBool(item.done, false),
		}));
};

const normalizeComments = (raw: unknown): KanbanComment[] => {
	if (!Array.isArray(raw)) return [];
	const taken = new Set<string>();
	return raw
		.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
		.map(item => ({
			id: uniqueId(asString(item.id), taken, 'comment'),
			author: item.author === 'agent' ? 'agent' as const : 'user' as const,
			body: asString(item.body),
			createdAt: asNumber(item.createdAt, Date.now()),
		}));
};

const normalizeRuns = (raw: unknown): KanbanRunRecord[] => {
	if (!Array.isArray(raw)) return [];
	return raw
		.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
		.map(item => ({
			status: asRunStatus(item.status),
			startedAt: asNumber(item.startedAt, 0),
			endedAt: asNumber(item.endedAt, 0),
			threadId: typeof item.threadId === 'string' ? item.threadId : undefined,
			error: typeof item.error === 'string' ? item.error : undefined,
			summary: typeof item.summary === 'string' ? item.summary : undefined,
		}))
		.slice(0, KANBAN_MAX_RUNS_PER_TASK);
};

/**
 * 任意の JSON をボードとして読める形に整える。
 * カラムが 1 つも無いファイルは既定のカラムに戻し、行き場を失ったタスクは先頭カラムへ寄せる。
 */
export const normalizeKanbanBoard = (raw: unknown): KanbanBoard => {
	const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

	const columnIds = new Set<string>();
	const rawColumns = Array.isArray(obj.columns) ? obj.columns : [];
	let columns: KanbanColumn[] = rawColumns
		.filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
		.map(c => ({
			id: uniqueId(asString(c.id), columnIds, 'column'),
			title: asString(c.title) || 'Untitled',
			role: asColumnRole(c.role),
			wipLimit: Math.max(0, Math.floor(asNumber(c.wipLimit, 0))),
			color: asString(c.color),
		}));

	if (columns.length === 0) columns = defaultKanbanColumns();

	// 同じ役割のカラムが複数あると実行先が定まらないので、先勝ちで 1 つに絞る。
	const seenRoles = new Set<KanbanColumnRole>();
	columns = columns.map(c => {
		if (c.role === 'none') return c;
		if (seenRoles.has(c.role)) return { ...c, role: 'none' as const };
		seenRoles.add(c.role);
		return c;
	});

	const validColumnIds = new Set(columns.map(c => c.id));
	const fallbackColumnId = columns[0].id;

	const taskIds = new Set<string>();
	const rawTasks = Array.isArray(obj.tasks) ? obj.tasks : [];
	const tasks: KanbanTask[] = rawTasks
		.filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
		.map(t => {
			const createdAt = asNumber(t.createdAt, Date.now());
			const columnId = asString(t.columnId);
			return {
				id: uniqueId(asString(t.id), taskIds, 'task'),
				columnId: validColumnIds.has(columnId) ? columnId : fallbackColumnId,
				title: asString(t.title) || 'Untitled task',
				description: asString(t.description),
				labels: asStringArray(t.labels),
				priority: asPriority(t.priority),
				dueDate: asDueDate(t.dueDate),
				assignee: asString(t.assignee),
				checklist: normalizeChecklist(t.checklist),
				comments: normalizeComments(t.comments),
				agentEnabled: asBool(t.agentEnabled, true),
				createdAt,
				updatedAt: asNumber(t.updatedAt, createdAt),
				runs: normalizeRuns(t.runs),
			};
		});

	return {
		version: 1,
		title: asString(obj.title) || 'Orchestra Board',
		columns,
		tasks,
		updatedAt: asNumber(obj.updatedAt, Date.now()),
	};
};

// ---------------------------------------------------------------------------
// 参照用ヘルパ (UI・サービス双方から使う)
// ---------------------------------------------------------------------------

export const tasksInColumn = (board: KanbanBoard, columnId: string): KanbanTask[] =>
	board.tasks.filter(t => t.columnId === columnId);

export const columnWithRole = (board: KanbanBoard, role: KanbanColumnRole): KanbanColumn | undefined =>
	board.columns.find(c => c.role === role);

export const checklistProgress = (task: KanbanTask): { done: number; total: number } => ({
	done: task.checklist.filter(i => i.done).length,
	total: task.checklist.length,
});

/** カード上に出す直近の実行結果 */
export const latestRun = (task: KanbanTask): KanbanRunRecord | undefined => task.runs[0];

/** 期限が今日より前か (今日は「超過」に含めない) */
export const isOverdue = (task: KanbanTask, now: Date = new Date()): boolean => {
	if (!task.dueDate) return false;
	const pad = (n: number) => String(n).padStart(2, '0');
	const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	return task.dueDate < today;
};

/** ボード内で実際に使われているラベルを、使用頻度の高い順に返す */
export const allLabels = (board: KanbanBoard): string[] => {
	const counts = new Map<string, number>();
	for (const task of board.tasks) {
		for (const label of task.labels) counts.set(label, (counts.get(label) ?? 0) + 1);
	}
	return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label]) => label);
};

// ---------------------------------------------------------------------------
// プロンプト組み立て
// ---------------------------------------------------------------------------

export const DEFAULT_KANBAN_PROMPT_TEMPLATE = `\
以下はカンバンボードに登録されたタスクです。内容を読み取り、ワークスペース上で最後まで実行してください。

# タスク: {{title}}

## 説明
{{description}}

## チェックリスト
{{checklist}}

## メタ情報
- 優先度: {{priority}}
- 期限: {{due}}
- 担当: {{assignee}}
- ラベル: {{labels}}

## これまでのコメント
{{comments}}

---
作業方針:
1. 何をすべきかを整理し、必要ならワークスペースのファイルを調べる。
2. 実際にコードやファイルを変更して完了させる。
3. 最後に「何を変更したか」「未完了・要確認の点」を箇条書きで報告する。
`;

const listOrPlaceholder = (items: string[], placeholder: string): string =>
	items.length > 0 ? items.join('\n') : placeholder;

const priorityLabels: Record<KanbanPriority, string> = {
	urgent: '最優先',
	high: '高',
	normal: '中',
	low: '低',
};

/** タスクからプロンプトのプレースホルダ値を作る */
export const kanbanTaskPromptFields = (
	task: KanbanTask,
	ctx: { boardTitle?: string; columnName?: string },
): Record<string, string> => {
	const checklistLines = task.checklist
		.filter(item => !!item.text.trim())
		.map(item => `- [${item.done ? 'x' : ' '}] ${item.text}`);

	// 直近のコメントだけを渡す。長い議論をそのまま入れるとプロンプトが膨らむため。
	const commentLines = task.comments
		.slice(-5)
		.map(c => `- (${c.author === 'agent' ? 'エージェント' : 'ユーザー'}) ${c.body.trim().replace(/\s*\n\s*/g, ' ')}`);

	return {
		title: task.title || '(無題のタスク)',
		description: task.description.trim() || '(説明なし)',
		checklist: listOrPlaceholder(checklistLines, '(チェックリストなし)'),
		labels: task.labels.length > 0 ? task.labels.join(', ') : '(ラベルなし)',
		priority: priorityLabels[task.priority],
		due: task.dueDate || '(期限なし)',
		assignee: task.assignee || '(未割り当て)',
		comments: listOrPlaceholder(commentLines, '(コメントなし)'),
		columnName: ctx.columnName ?? '',
		boardTitle: ctx.boardTitle ?? '',
		taskId: task.id,
	};
};

/** テンプレートの {{key}} を展開する。未知のキーは空文字にする。 */
export const renderKanbanPrompt = (
	template: string,
	fields: Record<string, string>,
): string =>
	template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) =>
		Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : ''
	);

export const buildKanbanPrompt = (
	task: KanbanTask,
	ctx: { boardTitle?: string; columnName?: string; template?: string },
): string => {
	const template = ctx.template?.trim() ? ctx.template : DEFAULT_KANBAN_PROMPT_TEMPLATE;
	return renderKanbanPrompt(template, kanbanTaskPromptFields(task, ctx)).trim();
};
