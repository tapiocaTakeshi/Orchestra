/*--------------------------------------------------------------------------------------
 *  Copyright 2026 He-ro Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

/**
 * update_plan: the agent's own checklist for the current task (modelled on OpenAI Codex's plan
 * tool; the Division cloud agent has the same tool). Nothing is run: the tool validates the plan,
 * the chat shows it as a checklist, and the model is told "Plan updated".
 *
 * Tool parameters are strings, so the plan is a Markdown checklist
 *   - [x] done step
 *   - [~] the step in progress
 *   - [ ] pending step
 * or a JSON array of {"step", "status": "pending" | "in_progress" | "completed"}.
 */

export type AgentPlanStepStatus = 'pending' | 'in_progress' | 'completed'
export type AgentPlanStep = { step: string, status: AgentPlanStepStatus }
export type AgentPlan = { plan: AgentPlanStep[], explanation: string | null }

export const MAX_AGENT_PLAN_STEPS = 50
const MAX_STEP_CHARS = 300
const MAX_EXPLANATION_CHARS = 1000

const STATUS_ALIASES: Record<string, AgentPlanStepStatus> = {
	pending: 'pending', todo: 'pending', not_started: 'pending',
	in_progress: 'in_progress', 'in-progress': 'in_progress', inprogress: 'in_progress', doing: 'in_progress', active: 'in_progress', running: 'in_progress',
	completed: 'completed', complete: 'completed', done: 'completed',
}

const normalizeStatus = (v: unknown): AgentPlanStepStatus | null =>
	typeof v === 'string' ? STATUS_ALIASES[v.trim().toLowerCase().replace(/\s+/g, '_')] ?? null : null

const parseChecklist = (text: string): AgentPlanStep[] => {
	const steps: AgentPlanStep[] = []
	for (const line of text.split('\n')) {
		const m = /^\s*(?:[-*+]|\d+[.)])?\s*\[([ xX~>\-/])\]\s+(.+)$/.exec(line)
		if (!m) { continue }
		const mark = m[1]
		steps.push({ step: m[2].trim(), status: mark === ' ' ? 'pending' : mark === 'x' || mark === 'X' ? 'completed' : 'in_progress' })
	}
	return steps
}

/** Validate update_plan's raw parameters; throws an Error whose message is shown to the model. */
export const parseAgentPlan = (rawPlan: unknown, rawExplanation: unknown): AgentPlan => {
	let raw: unknown = rawPlan
	if (typeof raw === 'string') {
		const s = raw.trim()
		if (s.startsWith('[')) {
			try { raw = JSON.parse(s) }
			catch { throw new Error(`plan is not valid JSON. Pass a Markdown checklist ("- [x] step", "- [~] step", "- [ ] step") or a JSON array of {"step", "status"}.`) }
		}
		else {
			raw = parseChecklist(s)
		}
	}
	if (!Array.isArray(raw) || raw.length === 0) {
		throw new Error(`plan must be a non-empty Markdown checklist ("- [x] done", "- [~] in progress", "- [ ] pending"), one step per line.`)
	}
	if (raw.length > MAX_AGENT_PLAN_STEPS) { throw new Error(`plan has ${raw.length} steps; keep it to at most ${MAX_AGENT_PLAN_STEPS}.`) }

	const plan: AgentPlanStep[] = []
	raw.forEach((item: unknown, i) => {
		const o = item && typeof item === 'object' ? item as Record<string, unknown> : null
		const text = typeof item === 'string' ? item : typeof o?.step === 'string' ? o.step : typeof o?.title === 'string' ? o.title : typeof o?.content === 'string' ? o.content : ''
		if (!text.trim()) { throw new Error(`Step ${i + 1} of the plan has no text.`) }
		const status = typeof item === 'string' ? 'pending' : normalizeStatus(o?.status)
		if (!status) { throw new Error(`Step ${i + 1} has an invalid status ${JSON.stringify(o?.status ?? null)}; use "pending", "in_progress" or "completed".`) }
		plan.push({ step: text.trim().replace(/\s+/g, ' ').slice(0, MAX_STEP_CHARS), status })
	})
	const active = plan.filter(s => s.status === 'in_progress').length
	if (active > 1) { throw new Error(`At most one step can be in progress at a time (got ${active}).`) }

	const explanation = typeof rawExplanation === 'string' && rawExplanation.trim() ? rawExplanation.trim().slice(0, MAX_EXPLANATION_CHARS) : null
	return { plan, explanation }
}

export const agentPlanProgress = (plan: AgentPlanStep[]) => ({ done: plan.filter(s => s.status === 'completed').length, total: plan.length })

export const formatAgentPlan = (plan: AgentPlanStep[]): string => {
	const mark = { completed: '[x]', in_progress: '[~]', pending: '[ ]' } as const
	return plan.map(s => `- ${mark[s.status]} ${s.step}`).join('\n')
}
