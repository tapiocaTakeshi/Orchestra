/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * Auto-compaction of chat threads (as in OpenAI Codex; the Division cloud agent does the same).
 *
 * When a thread gets close to the model's context window, the model writes a handoff summary and a
 * `compaction` message is added to the thread. From then on, everything before that message is sent
 * to the model as ONE user turn: the user's own messages (word for word, first + newest), the
 * summary, and the current update_plan plan. The thread itself keeps every message, so the user
 * still sees (and can restore checkpoints in) the full history.
 */

import type { ChatMessage } from './chatThreadServiceTypes.js'
import { formatAgentPlan, type AgentPlanStep } from './agentPlan.js'

/** Compact when the conversation uses this share of the input budget. */
export const COMPACT_AT_RATIO = 0.75
/** Assistant replies that must follow a compaction before the next one. */
export const MIN_ASSISTANT_STEPS_BETWEEN_COMPACTIONS = 3
/** The user's own messages kept word for word after a compaction. */
export const COMPACT_USER_MESSAGES_CHARS = 60_000
export const MAX_SUMMARY_CHARS = 30_000
/** A summary shorter than this is treated as a failed compaction. */
export const MIN_SUMMARY_CHARS = 20

export const COMPACTION_PROMPT = `You are performing a CONTEXT CHECKPOINT COMPACTION. The conversation is getting too long for your context window, so everything so far will be replaced by your summary. Create a handoff summary for another LLM that will resume the task.

Include:
- The user's request and current progress, and the key decisions made
- Important context, constraints, or user preferences
- Files you created, changed or deleted, and what you found in the files you read that still matters
- Commands you ran to build or test, and their latest results (what passes, what still fails and why)
- The result of your most recent tool call
- Approaches that did not work, so they are not tried again
- What remains to be done (clear next steps)
- Any critical data, examples, or references needed to continue

Be concise, structured, and focused on helping the next LLM seamlessly continue the work. Reply with the summary only, in plain text: do NOT call any tool.`

export const SUMMARY_PREFIX = `Another language model started to solve this problem and produced a summary of its work so far. You also have access to the state of the workspace it changed. Use this to build on the work that has already been done and avoid duplicating work. Here is the summary produced by the other language model:`

export type ChatCompactionMessage = Extract<ChatMessage, { role: 'compaction' }>

const truncateMiddle = (s: string, max: number) => {
	if (s.length <= max) { return s }
	const head = Math.floor(max * 0.6)
	return `${s.slice(0, head)}\n\n...[${s.length - max} characters omitted]...\n\n${s.slice(s.length - (max - head))}`
}

/** The user's messages kept word for word: the first one, then the newest ones that fit. */
export const keptUserMessages = (texts: string[], maxChars = COMPACT_USER_MESSAGES_CHARS): string => {
	const nonEmpty = texts.filter(t => t.trim())
	if (nonEmpty.length === 0) { return '' }
	const first = truncateMiddle(nonEmpty[0], Math.floor(maxChars / 2))
	const rest: string[] = []
	let used = first.length
	let omitted = 0
	for (let i = nonEmpty.length - 1; i >= 1; i--) {
		if (used + nonEmpty[i].length > maxChars) { omitted = i; break }
		rest.unshift(nonEmpty[i])
		used += nonEmpty[i].length
	}
	return [first, ...(omitted ? [`(${omitted} more message${omitted > 1 ? 's' : ''} omitted)`] : []), ...rest].join('\n\n---\n\n')
}

export const compactedContextText = (userTexts: string[], summary: string, plan: AgentPlanStep[] | null): string => {
	const kept = keptUserMessages(userTexts)
	return [
		kept ? `Messages from the user so far (oldest first):\n\n${kept}` : '',
		`${SUMMARY_PREFIX}\n${summary.trim()}`,
		plan && plan.length ? `Your current plan (update_plan):\n${formatAgentPlan(plan)}` : '',
	].filter(Boolean).join('\n\n')
}

/** Index of the newest compaction message (-1 when none). */
export const lastCompactionIdx = (messages: ChatMessage[]): number => {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]
		if (m.role === 'compaction' && m.summary.trim()) { return i }
	}
	return -1
}

/** The newest successful update_plan plan among the messages. */
const latestPlan = (messages: ChatMessage[]): AgentPlanStep[] | null => {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i]
		if (m.role === 'tool' && m.name === 'update_plan' && m.type === 'success') {
			const plan = (m.result as { plan?: AgentPlanStep[] } | null)?.plan
			if (Array.isArray(plan)) { return plan }
		}
	}
	return null
}

/**
 * The messages as the model should see them: everything before the newest compaction becomes one
 * user turn (user messages + summary + plan). Messages after it are unchanged.
 */
export const applyChatCompaction = (messages: ChatMessage[]): ChatMessage[] => {
	const idx = lastCompactionIdx(messages)
	if (idx < 0) { return messages }
	const compaction = messages[idx] as ChatCompactionMessage
	const before = messages.slice(0, idx)
	const userTexts = before.flatMap(m => m.role === 'user' ? [m.content || m.displayContent || ''] : [])
	const context: ChatMessage = {
		role: 'user',
		content: compactedContextText(userTexts, compaction.summary, latestPlan(before)),
		displayContent: '',
		selections: null,
		state: { stagingSelections: [], isBeingEdited: false },
	}
	return [context, ...messages.slice(idx + 1)]
}

/** Assistant replies since the newest compaction (or since the start). */
export const assistantStepsSinceCompaction = (messages: ChatMessage[]): number => {
	const idx = lastCompactionIdx(messages)
	return messages.slice(idx + 1).filter(m => m.role === 'assistant').length
}

/** Rough size (characters) of what the messages put in the prompt. */
export const chatMessagesChars = (messages: ChatMessage[]): number => {
	let n = 0
	for (const m of messages) {
		if (m.role === 'user') { n += m.content.length }
		else if (m.role === 'assistant') { n += m.displayContent.length }
		else if (m.role === 'tool') { n += m.content.length }
	}
	return n
}

/** The summary text from the model's reply (prose only; a stray tool call is ignored). */
export const cleanSummary = (fullText: string): string => truncateMiddle(fullText.trim(), MAX_SUMMARY_CHARS)
