/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// Trello 連携の型定義。
//
// Orchestra は Trello の「TODO リスト」に溜まっているカードを 1 枚ずつ取り出し、
// カード内容 (タイトル / 説明 / チェックリスト / ラベル / 添付 URL) をプロンプトへ
// 組み立ててエージェントチャットに投げる。実行が終わったらカードを Done リストへ
// 移動し、実行結果をコメントとして書き戻す。


// ---------------------------------------------------------------------------
// Trello REST API のレスポンス (必要なフィールドだけ)
// ---------------------------------------------------------------------------

export type TrelloMember = {
	id: string;
	username: string;
	fullName?: string;
};

export type TrelloBoard = {
	id: string;
	name: string;
	closed?: boolean;
	url?: string;
};

export type TrelloList = {
	id: string;
	name: string;
	closed?: boolean;
	idBoard?: string;
};

export type TrelloLabel = {
	id: string;
	name: string;
	color: string | null;
};

export type TrelloCheckItem = {
	id: string;
	name: string;
	state: 'complete' | 'incomplete';
};

export type TrelloChecklist = {
	id: string;
	name: string;
	checkItems?: TrelloCheckItem[];
};

export type TrelloAttachment = {
	id: string;
	name: string;
	url: string;
};

export type TrelloCard = {
	id: string;
	idShort?: number;
	name: string;
	desc: string;
	url: string;
	shortUrl?: string;
	idList: string;
	idBoard: string;
	pos?: number;
	due?: string | null;
	dateLastActivity?: string;
	labels?: TrelloLabel[];
	checklists?: TrelloChecklist[];
	attachments?: TrelloAttachment[];
};


// ---------------------------------------------------------------------------
// 永続化される設定 (GlobalSettings.trello)
// ---------------------------------------------------------------------------

export type TrelloSettings = {
	/** https://trello.com/power-ups/admin で発行する API Key */
	apiKey: string;
	/** 上記 Key に対してユーザーが許可して得る Token */
	token: string;

	/** 監視対象のボード */
	boardId: string;
	/** 実行待ちカードが積まれているリスト (必須) */
	todoListId: string;
	/** 実行開始時にカードを移す先。'' なら移動しない */
	inProgressListId: string;
	/** 正常終了時にカードを移す先。'' なら移動しない */
	doneListId: string;
	/** 失敗時にカードを移す先。'' なら元の場所に残す */
	errorListId: string;

	/** true の間、pollIntervalSec ごとに TODO リストを見に行き、あれば実行する */
	autoRunEnabled: boolean;
	/** ポーリング間隔 (秒)。下限 15 秒 */
	pollIntervalSec: number;
	/** 1 回のポーリングで処理するカードの最大数 */
	maxCardsPerRun: number;
	/** 1 カードあたりの実行タイムアウト (分)。超えたら中断して error 扱い */
	cardTimeoutMin: number;

	/** カードを実行するたびに新しいチャットスレッドを開く */
	newThreadPerCard: boolean;
	/** 実行結果の要約をカードのコメントとして書き戻す */
	postCommentOnDone: boolean;
	/** このラベル名が付いたカードだけを対象にする。'' なら全カード */
	requiredLabel: string;
	/** true なら「プロンプトを組み立てるがエージェントには投げない」動作確認モード */
	dryRun: boolean;

	/**
	 * プロンプトのテンプレート。以下のプレースホルダが展開される:
	 *   {{title}} {{description}} {{checklists}} {{labels}} {{attachments}}
	 *   {{due}} {{url}} {{cardId}} {{boardName}} {{listName}}
	 * 空文字なら組み込みの既定テンプレートを使う。
	 */
	promptTemplate: string;
};

export const defaultTrelloSettings: TrelloSettings = {
	apiKey: '',
	token: '',
	boardId: '',
	todoListId: '',
	inProgressListId: '',
	doneListId: '',
	errorListId: '',
	autoRunEnabled: false,
	pollIntervalSec: 60,
	maxCardsPerRun: 1,
	cardTimeoutMin: 30,
	newThreadPerCard: true,
	postCommentOnDone: true,
	requiredLabel: '',
	dryRun: false,
	promptTemplate: '',
};

export const MIN_TRELLO_POLL_INTERVAL_SEC = 15;
export const MIN_TRELLO_CARD_TIMEOUT_MIN = 1;

/** 実行結果コメントの冒頭に付ける印。Orchestra が書いたコメントを見分けるのに使う。 */
export const TRELLO_COMMENT_MARKER = '🎼 Orchestra';


// ---------------------------------------------------------------------------
// 実行状態
// ---------------------------------------------------------------------------

export type TrelloRunStatus =
	| 'running'
	| 'done'
	| 'error'
	| 'timeout'
	| 'canceled'
	| 'dry-run';

export type TrelloRunEntry = {
	cardId: string;
	cardName: string;
	cardUrl: string;
	status: TrelloRunStatus;
	startedAt: number;
	endedAt?: number;
	threadId?: string;
	error?: string;
	/** アシスタント最終出力の先頭部分 (コメント書き戻し・履歴表示用) */
	resultSummary?: string;
};

export type TrelloConnectionStatus =
	| { kind: 'unconfigured' }
	| { kind: 'checking' }
	| { kind: 'ok'; member: TrelloMember }
	| { kind: 'error'; error: string };

export type TrelloServiceState = {
	connection: TrelloConnectionStatus;
	/** 認証できたときに取得したボード一覧 */
	boards: TrelloBoard[];
	/** 選択中ボードのリスト一覧 */
	lists: TrelloList[];
	/** ポーリングタイマーが動いているか */
	isPolling: boolean;
	/** カードを実行中か */
	isRunning: boolean;
	/** エージェントがツール実行の承認待ちで止まっているか (無人実行だと進まない) */
	awaitingApproval: boolean;
	/** 実行中カード */
	currentCard: { id: string; name: string; url: string } | null;
	/** 今回のポーリングで実行待ちになっているカード */
	queue: { id: string; name: string; url: string }[];
	/** 直近の実行履歴 (新しい順、最大 TRELLO_MAX_HISTORY 件) */
	history: TrelloRunEntry[];
	lastPolledAt: number | null;
	/** ポーリング/実行時に起きた最後のエラー */
	lastError: string | undefined;
};

export const TRELLO_MAX_HISTORY = 30;


// ---------------------------------------------------------------------------
// プロンプト組み立て
// ---------------------------------------------------------------------------

export const DEFAULT_TRELLO_PROMPT_TEMPLATE = `\
以下は Trello カードとして登録されたタスクです。内容を読み取り、ワークスペース上で最後まで実行してください。

# タスク: {{title}}

## 説明
{{description}}

## チェックリスト
{{checklists}}

## ラベル
{{labels}}

## 参考リンク
{{attachments}}

## 期限
{{due}}

---
Trello カード: {{url}}

作業方針:
1. 何をすべきかを整理し、必要ならワークスペースのファイルを調べる。
2. 実際にコードやファイルを変更して完了させる。
3. 最後に「何を変更したか」「未完了・要確認の点」を箇条書きで報告する。
`;

const listOrPlaceholder = (items: string[], placeholder: string): string =>
	items.length > 0 ? items.join('\n') : placeholder;

/** カードからプロンプトのプレースホルダ値を作る */
export const trelloCardPromptFields = (
	card: TrelloCard,
	ctx: { boardName?: string; listName?: string },
): Record<string, string> => {
	const checklistLines: string[] = [];
	for (const checklist of card.checklists ?? []) {
		const items = checklist.checkItems ?? [];
		if (items.length === 0) continue;
		if ((card.checklists ?? []).length > 1) checklistLines.push(`### ${checklist.name}`);
		for (const item of items) {
			checklistLines.push(`- [${item.state === 'complete' ? 'x' : ' '}] ${item.name}`);
		}
	}

	const labelNames = (card.labels ?? [])
		.map(l => l.name || l.color || '')
		.filter(name => !!name);

	const attachmentLines = (card.attachments ?? [])
		.filter(a => !!a.url)
		.map(a => `- ${a.name || a.url}: ${a.url}`);

	return {
		title: card.name || '(無題のカード)',
		description: card.desc?.trim() || '(説明なし)',
		checklists: listOrPlaceholder(checklistLines, '(チェックリストなし)'),
		labels: labelNames.length > 0 ? labelNames.join(', ') : '(ラベルなし)',
		attachments: listOrPlaceholder(attachmentLines, '(添付なし)'),
		due: card.due ? new Date(card.due).toLocaleString() : '(期限なし)',
		url: card.shortUrl || card.url || '',
		cardId: card.id,
		boardName: ctx.boardName ?? '',
		listName: ctx.listName ?? '',
	};
};

/** テンプレートの {{key}} を展開する。未知のキーはそのまま残さず空文字にする。 */
export const renderTrelloPrompt = (
	template: string,
	fields: Record<string, string>,
): string =>
	template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) =>
		Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : ''
	);

export const buildTrelloPrompt = (
	card: TrelloCard,
	ctx: { boardName?: string; listName?: string; template?: string },
): string => {
	const template = ctx.template?.trim() ? ctx.template : DEFAULT_TRELLO_PROMPT_TEMPLATE;
	return renderTrelloPrompt(template, trelloCardPromptFields(card, ctx)).trim();
};
