/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useMemo, useState } from 'react';
import { CopyButton, IconShell1 } from '../markdown/ApplyBlockHoverButtons.js';
import { useAccessor, useChatThreadsState, useChatThreadsStreamState, useFullChatThreadsStreamState, useSettingsState } from '../util/services.js';
import { IconX } from './SidebarChat.js';
import { Check, Copy, Icon, LoaderCircle, MessageCircleQuestion, Trash2, UserCheck, X } from 'lucide-react';
import { IsRunningType, ThreadType } from '../../../chatThreadService.js';
import { getModelCapabilities } from '../../../../common/modelCapabilities.js';
import { OverridesOfModel, ProviderName } from '../../../../common/voidSettingsTypes.js';


const numInitialThreads = 3

export const PastThreadsList = ({ className = '' }: { className?: string }) => {
	const [showAll, setShowAll] = useState(false);

	const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

	const threadsState = useChatThreadsState()
	const { allThreads } = threadsState

	const streamState = useFullChatThreadsStreamState()

	const runningThreadIds: { [threadId: string]: IsRunningType | undefined } = {}
	for (const threadId in streamState) {
		const isRunning = streamState[threadId]?.isRunning
		if (isRunning) { runningThreadIds[threadId] = isRunning }
	}

	if (!allThreads) {
		return <div key="error" className="p-1">{`Error accessing chat history.`}</div>;
	}

	// sorted by most recent to least recent
	const sortedThreadIds = Object.keys(allThreads ?? {})
		.sort((threadId1, threadId2) => (allThreads[threadId1]?.lastModified ?? 0) > (allThreads[threadId2]?.lastModified ?? 0) ? -1 : 1)
		.filter(threadId => (allThreads![threadId]?.messages.length ?? 0) !== 0)

	// Get only first 5 threads if not showing all
	const hasMoreThreads = sortedThreadIds.length > numInitialThreads;
	const displayThreads = showAll ? sortedThreadIds : sortedThreadIds.slice(0, numInitialThreads);

	return (
		<div className={`flex flex-col mb-2 gap-2 w-full text-nowrap text-void-fg-3 select-none relative ${className}`}>
			{displayThreads.length === 0 // this should never happen
				? <></>
				: displayThreads.map((threadId, i) => {
					const pastThread = allThreads[threadId];
					if (!pastThread) {
						return <div key={i} className="p-1">{`Error accessing chat history.`}</div>;
					}

					return (
						<PastThreadElement
							key={pastThread.id}
							pastThread={pastThread}
							idx={i}
							hoveredIdx={hoveredIdx}
							setHoveredIdx={setHoveredIdx}
							isRunning={runningThreadIds[pastThread.id]}
						/>
					);
				})
			}

			{hasMoreThreads && !showAll && (
				<div
					className="text-void-fg-3 opacity-80 hover:opacity-100 hover:brightness-115 cursor-pointer p-1 text-xs"
					onClick={() => setShowAll(true)}
				>
					Show {sortedThreadIds.length - numInitialThreads} more...
				</div>
			)}
			{hasMoreThreads && showAll && (
				<div
					className="text-void-fg-3 opacity-80 hover:opacity-100 hover:brightness-115 cursor-pointer p-1 text-xs"
					onClick={() => setShowAll(false)}
				>
					Show less
				</div>
			)}
		</div>
	);
};





// Format date to display as today, yesterday, or date
const formatDate = (date: Date) => {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);

	if (date >= today) {
		return 'Today';
	} else if (date >= yesterday) {
		return 'Yesterday';
	} else {
		return `${date.toLocaleString('default', { month: 'short' })} ${date.getDate()}`;
	}
};

// Format time to 12-hour format
const formatTime = (date: Date) => {
	return date.toLocaleString('en-US', {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});
};

// 実際のトークン使用量は保存されていないため、文字数からの概算値
const CHARS_PER_TOKEN_ESTIMATE = 4

// スレッド内の各メッセージの文字数から、送信のたびに会話履歴全体が
// 再送されるチャットの性質を踏まえて入出力トークン数を概算し、
// 現在選択中のモデルの料金表（$/1Mトークン）を掛けて費用を見積もる
const estimateThreadCostUSD = (
	pastThread: ThreadType,
	providerName: ProviderName,
	modelName: string,
	overridesOfModel: OverridesOfModel | undefined,
): number | null => {
	const { cost } = getModelCapabilities(providerName, modelName, overridesOfModel)
	if (!cost || (!cost.input && !cost.output)) return null

	let runningChars = 0
	let estimatedInputTokens = 0
	let estimatedOutputTokens = 0

	for (const msg of pastThread.messages) {
		if (msg.role === 'user') {
			runningChars += msg.displayContent?.length ?? msg.content?.length ?? 0
		} else if (msg.role === 'assistant') {
			const outChars = (msg.displayContent?.length ?? 0) + (msg.reasoning?.length ?? 0)
			// このターンの入力は、それまでの会話全体
			estimatedInputTokens += runningChars / CHARS_PER_TOKEN_ESTIMATE
			estimatedOutputTokens += outChars / CHARS_PER_TOKEN_ESTIMATE
			runningChars += outChars
		} else if (msg.role === 'tool' && typeof msg.content === 'string') {
			runningChars += msg.content.length
		}
	}

	if (estimatedInputTokens === 0 && estimatedOutputTokens === 0) return null

	const costUSD = (estimatedInputTokens / 1_000_000) * cost.input + (estimatedOutputTokens / 1_000_000) * cost.output
	return costUSD
}

const formatEstimatedCost = (costUSD: number): string => {
	if (costUSD < 0.01) return '<$0.01'
	return `~$${costUSD.toFixed(2)}`
}


const DuplicateButton = ({ threadId }: { threadId: string }) => {
	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')
	return <IconShell1
		Icon={Copy}
		className='size-[11px]'
		onClick={() => { chatThreadsService.duplicateThread(threadId); }}
		data-tooltip-id='void-tooltip'
		data-tooltip-place='top'
		data-tooltip-content='Duplicate thread'
	>
	</IconShell1>

}

const TrashButton = ({ threadId }: { threadId: string }) => {

	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')


	const [isTrashPressed, setIsTrashPressed] = useState(false)

	return (isTrashPressed ?
		<div className='flex flex-nowrap text-nowrap gap-1'>
			<IconShell1
				Icon={X}
				className='size-[11px]'
				onClick={() => { setIsTrashPressed(false); }}
				data-tooltip-id='void-tooltip'
				data-tooltip-place='top'
				data-tooltip-content='Cancel'
			/>
			<IconShell1
				Icon={Check}
				className='size-[11px]'
				onClick={() => { chatThreadsService.deleteThread(threadId); setIsTrashPressed(false); }}
				data-tooltip-id='void-tooltip'
				data-tooltip-place='top'
				data-tooltip-content='Confirm'
			/>
		</div>
		: <IconShell1
			Icon={Trash2}
			className='size-[11px]'
			onClick={() => { setIsTrashPressed(true); }}
			data-tooltip-id='void-tooltip'
			data-tooltip-place='top'
			data-tooltip-content='Delete thread'
		/>
	)
}

const PastThreadElement = ({ pastThread, idx, hoveredIdx, setHoveredIdx, isRunning }: {
	pastThread: ThreadType,
	idx: number,
	hoveredIdx: number | null,
	setHoveredIdx: (idx: number | null) => void,
	isRunning: IsRunningType | undefined,
}

) => {


	const accessor = useAccessor()
	const chatThreadsService = accessor.get('IChatThreadService')

	const settingsState = useSettingsState()
	const modelSelection = settingsState.modelSelectionOfFeature['Chat']
	const estimatedCostUSD = modelSelection
		? estimateThreadCostUSD(pastThread, modelSelection.providerName, modelSelection.modelName, settingsState.overridesOfModel)
		: null

	// const convertService = accessor.get('IConvertToLLMMessageService')
	// const chatMode = settingsState.globalSettings.chatMode
	// const modelSelection = settingsState.modelSelectionOfFeature?.Chat ?? null
	// const copyChatButton = <CopyButton
	// 	codeStr={async () => {
	// 		const { messages } = await convertService.prepareLLMChatMessages({
	// 			chatMessages: currentThread.messages,
	// 			chatMode,
	// 			modelSelection,
	// 		})
	// 		return JSON.stringify(messages, null, 2)
	// 	}}
	// 	toolTipName={modelSelection === null ? 'Copy As Messages Payload' : `Copy As ${displayInfoOfProviderName(modelSelection.providerName).title} Payload`}
	// />


	// const currentThread = chatThreadsService.getCurrentThread()
	// const copyChatButton2 = <CopyButton
	// 	codeStr={async () => {
	// 		return JSON.stringify(currentThread.messages, null, 2)
	// 	}}
	// 	toolTipName={`Copy As Void Chat`}
	// />

	let firstMsg = null;
	const firstUserMsgIdx = pastThread.messages.findIndex((msg) => msg.role === 'user');

	if (firstUserMsgIdx !== -1) {
		const firsUsertMsgObj = pastThread.messages[firstUserMsgIdx];
		firstMsg = firsUsertMsgObj.role === 'user' && firsUsertMsgObj.displayContent || '';
	} else {
		firstMsg = '""';
	}

	const numMessages = pastThread.messages.filter((msg) => msg.role === 'assistant' || msg.role === 'user').length;

	const detailsHTML = <span
		data-tooltip-id='void-tooltip'
		data-tooltip-content={estimatedCostUSD !== null ? `推定使用額（現在選択中のモデル基準の概算）: ${formatEstimatedCost(estimatedCostUSD)}` : undefined}
		data-tooltip-place='top'
	>
		{estimatedCostUSD !== null && <>
			<span className='opacity-60'>{formatEstimatedCost(estimatedCostUSD)}</span>
			{` `}
		</>}
		<span className='opacity-60'>{numMessages}</span>
		{` `}
		{formatDate(new Date(pastThread.lastModified))}
		{/* {` messages `} */}
	</span>

	return <div
		key={pastThread.id}
		className={`
			py-1 px-2 rounded text-sm bg-zinc-700/5 hover:bg-zinc-700/10 dark:bg-zinc-300/5 dark:hover:bg-zinc-300/10 cursor-pointer opacity-80 hover:opacity-100
		`}
		onClick={() => {
			// 過去チャットを開いた瞬間に、当該スレッド最終チェックポイントの
			// ファイル状態へワークスペースを自動 revert する。
			chatThreadsService.switchToThread(pastThread.id, { revertFiles: true });
		}}
		onMouseEnter={() => setHoveredIdx(idx)}
		onMouseLeave={() => setHoveredIdx(null)}
	>
		<div className="flex items-center justify-between gap-1">
			<span className="flex items-center gap-2 min-w-0 overflow-hidden">
				{/* spinner */}
				{isRunning === 'LLM' || isRunning === 'tool' || isRunning === 'idle' ? <LoaderCircle className="animate-spin bg-void-stroke-1 flex-shrink-0 flex-grow-0" size={14} />
					:
					isRunning === 'awaiting_user' ? <MessageCircleQuestion className="bg-void-stroke-1 flex-shrink-0 flex-grow-0" size={14} />
						:
						null}
				{/* name */}
				<span className="truncate overflow-hidden text-ellipsis"
					data-tooltip-id='void-tooltip'
					data-tooltip-content={numMessages + ' messages'}
					data-tooltip-place='top'
				>{firstMsg}</span>

				{/* <span className='opacity-60'>{`(${numMessages})`}</span> */}
			</span>

			<div className="flex items-center gap-x-1 opacity-60">
				{idx === hoveredIdx ?
					<>
						{/* trash icon */}
						<DuplicateButton threadId={pastThread.id} />

						{/* trash icon */}
						<TrashButton threadId={pastThread.id} />
					</>
					: <>
						{detailsHTML}
					</>
				}
			</div>
		</div>
	</div>
}
