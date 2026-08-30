/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

// IChatThreadService の decorator (と interface) は、実装である chatThreadService.ts
// ではなくこのファイルに置く。editCodeServiceInterface.ts と同じ「実装と decorator を
// 分離する」パターン。
//
// 理由: chatThreadService.ts は toolsService → voidCommandBarService → react/out の
// バンドル → (services.ts の外部 import) → kanbanService という経路で
// 自分自身へ戻ってくる循環 import の輪に入っている。バンドラ (esbuild) は循環を
// 検出すると片方のモジュールを先に評価するため、kanbanService が
// 評価される時点で chatThreadService.ts の `const IChatThreadService` がまだ未初期化
// (バンドル後は巻き上げられた `var` なので undefined) になり、
//   TypeError: decorator is not a function
// で workbench 全体の起動が失敗していた。
//
// このファイルは createDecorator 以外に実行時依存を持たない (型は import type で
// 参照するだけなので出力 JS からは消える)。そのため必ず利用側より先に評価され、
// 循環に巻き込まれない。**decorator を使う側は必ずこのファイルから import すること。**

import type { Event } from '../../../../base/common/event.js';
import type { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type { CodespanLocationLink, StagingSelectionItem } from '../common/chatThreadServiceTypes.js';
import type { FeatureName } from '../common/voidSettingsTypes.js';
import type { ThreadsState, ThreadStreamState, ThreadType, UserMessageState } from './chatThreadService.js';


export interface IChatThreadService {
	readonly _serviceBrand: undefined;

	readonly state: ThreadsState;
	readonly streamState: ThreadStreamState; // not persistent

	onDidChangeCurrentThread: Event<void>;
	onDidChangeStreamState: Event<{ threadId: string }>

	getCurrentThread(): ThreadType;
	openNewThread(): void;
	switchToThread(threadId: string, opts?: { revertFiles?: boolean }): void;

	// 指定スレッド内の最後のチェックポイントの voidFileSnapshot にファイル群を戻す。
	// 過去チャットを開いた瞬間にワークスペースを当時の状態へ復元する用途で使う。
	revertFilesToThreadEnd(threadId: string): void;

	// thread selector
	deleteThread(threadId: string): void;
	duplicateThread(threadId: string): void;

	// exposed getters/setters
	// these all apply to current thread
	getCurrentMessageState: (messageIdx: number) => UserMessageState
	setCurrentMessageState: (messageIdx: number, newState: Partial<UserMessageState>) => void
	getCurrentThreadState: () => ThreadType['state']
	setCurrentThreadState: (newState: Partial<ThreadType['state']>) => void

	// you can edit multiple messages - the one you're currently editing is "focused", and we add items to that one when you press cmd+L.
	getCurrentFocusedMessageIdx(): number | undefined;
	isCurrentlyFocusingMessage(): boolean;
	setCurrentlyFocusedMessageIdx(messageIdx: number | undefined): void;

	popStagingSelections(numPops?: number): void;
	addNewStagingSelection(newSelection: StagingSelectionItem): void;

	dangerousSetState: (newState: ThreadsState) => void;
	resetState: () => void;

	// // current thread's staging selections
	// closeCurrentStagingSelectionsInMessage(opts: { messageIdx: number }): void;
	// closeCurrentStagingSelectionsInThread(): void;

	// codespan links (link to symbols in the markdown)
	getCodespanLink(opts: { codespanStr: string, messageIdx: number, threadId: string }): CodespanLocationLink | undefined;
	addCodespanLink(opts: { newLinkText: string, newLinkLocation: CodespanLocationLink, messageIdx: number, threadId: string }): void;
	generateCodespanLink(opts: { codespanStr: string, threadId: string }): Promise<CodespanLocationLink>;
	getRelativeStr(uri: URI): string | undefined

	// entry pts
	abortRunning(threadId: string): Promise<void>;
	dismissStreamError(threadId: string): void;

	// call to edit a message
	editUserMessageAndStreamResponse({ userMessage, messageIdx, threadId }: { userMessage: string, messageIdx: number, threadId: string }): Promise<void>;

	// call to add a message
	// featureNameOverride: use a different feature's model selection for this run (eg. 'ErrorFix' for Fix with Agent) instead of 'Chat'.
	// Sticks for the duration of the agentic run (including tool-approval turns); omit to use (and reset to) the Chat model.
	addUserMessageAndStreamResponse({ userMessage, _chatSelections, threadId, featureNameOverride }: { userMessage: string, _chatSelections?: StagingSelectionItem[], threadId: string, featureNameOverride?: FeatureName }): Promise<void>;

	// approve/reject
	approveLatestToolRequest(threadId: string): void;
	rejectLatestToolRequest(threadId: string): void;

	// flow review approve/reject
	approveFlowReview(threadId: string, editedOutputs?: Array<{ mdFileName: string; mdContent: string }>): Promise<void>;
	rejectFlowReview(threadId: string): void;

	// jump to history
	jumpToCheckpointBeforeMessageIdx(opts: { threadId: string, messageIdx: number, jumpToUserModified: boolean }): void;

	focusCurrentChat: () => Promise<void>
	blurCurrentChat: () => Promise<void>
}

export const IChatThreadService = createDecorator<IChatThreadService>('voidChatThreadService');
