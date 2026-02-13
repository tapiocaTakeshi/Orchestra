/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { AgentRole, ProviderName } from '../../../../common/voidSettingsTypes.js';

// Agent execution status
export type AgentStatus = 'idle' | 'running' | 'completed' | 'error' | 'waiting';

// Individual agent state in the conductor view
export interface AgentState {
	role: AgentRole;
	status: AgentStatus;
	provider: ProviderName;
	model: string;
	startTime: number | null;
	endTime: number | null;
	tokensUsed: number;
	summary: string;
	error: string | null;
}

// Metrics for the meta panel
export interface ConductorMetrics {
	totalTokens: number;
	estimatedCost: number;
	totalTime: number;
	successRate: number;
	agentCount: number;
	completedCount: number;
}

// Pipeline step configuration
export interface PipelineStep {
	id: string;
	role: AgentRole;
	provider: ProviderName;
	model: string;
	order: number;
}

// Thought tree node
export interface ThoughtNode {
	id: string;
	role: AgentRole;
	content: string;
	children: ThoughtNode[];
	status: AgentStatus;
	depth: number;
}

// Pipeline template
export interface PipelineTemplate {
	id: string;
	name: string;
	description: string;
	icon: string;
	steps: PipelineStep[];
}

// Conductor view tabs
export type ConductorTab = 'pipeline' | 'builder' | 'thoughts' | 'conductor';

// Agent strength tags
export interface AgentStrengthTag {
	label: string;
	color: string;
}

// Strength tags for known capabilities
export const agentStrengthTags: Record<AgentRole, AgentStrengthTag[]> = {
	leader: [
		{ label: 'Coordination', color: '#f59e0b' },
		{ label: 'Task Analysis', color: '#8b5cf6' },
	],
	coder: [
		{ label: 'Code Generation', color: '#3b82f6' },
		{ label: 'Debugging', color: '#ef4444' },
	],
	planner: [
		{ label: 'Architecture', color: '#10b981' },
		{ label: 'Strategy', color: '#6366f1' },
	],
	search: [
		{ label: 'Research', color: '#06b6d4' },
		{ label: 'Documentation', color: '#84cc16' },
	],
	design: [
		{ label: 'UI/UX', color: '#ec4899' },
		{ label: 'Visual Design', color: '#f97316' },
	],
};

// Role display configuration
export const roleDisplayConfig: Record<AgentRole, { label: string; color: string; glowColor: string }> = {
	leader: { label: 'Leader', color: '#f59e0b', glowColor: 'rgba(245, 158, 11, 0.4)' },
	coder: { label: 'Coder', color: '#3b82f6', glowColor: 'rgba(59, 130, 246, 0.4)' },
	planner: { label: 'Planner', color: '#10b981', glowColor: 'rgba(16, 185, 129, 0.4)' },
	search: { label: 'Search', color: '#06b6d4', glowColor: 'rgba(6, 182, 212, 0.4)' },
	design: { label: 'Design', color: '#ec4899', glowColor: 'rgba(236, 72, 153, 0.4)' },
};

// Default pipeline templates
export const defaultTemplates: PipelineTemplate[] = [
	{
		id: 'web-article',
		name: 'Web Article Generation',
		description: 'Research, plan, write, and review web articles',
		icon: 'FileText',
		steps: [
			{ id: '1', role: 'leader', provider: 'openAI', model: 'gpt-4o', order: 0 },
			{ id: '2', role: 'search', provider: 'openAI', model: 'gpt-4o', order: 1 },
			{ id: '3', role: 'planner', provider: 'gemini', model: 'gemini-2.0-flash', order: 2 },
			{ id: '4', role: 'coder', provider: 'anthropic', model: 'claude-sonnet-4-20250514', order: 3 },
		],
	},
	{
		id: 'app-dev',
		name: 'App Development',
		description: 'Plan, code, design, and review applications',
		icon: 'Code',
		steps: [
			{ id: '1', role: 'leader', provider: 'openAI', model: 'gpt-4o', order: 0 },
			{ id: '2', role: 'planner', provider: 'gemini', model: 'gemini-2.0-flash', order: 1 },
			{ id: '3', role: 'coder', provider: 'anthropic', model: 'claude-sonnet-4-20250514', order: 2 },
			{ id: '4', role: 'design', provider: 'gemini', model: 'gemini-2.0-flash', order: 3 },
		],
	},
	{
		id: 'research',
		name: 'Research & Analysis',
		description: 'Search, analyze, and synthesize research findings',
		icon: 'Search',
		steps: [
			{ id: '1', role: 'leader', provider: 'openAI', model: 'gpt-4o', order: 0 },
			{ id: '2', role: 'search', provider: 'openAI', model: 'gpt-4o', order: 1 },
			{ id: '3', role: 'planner', provider: 'gemini', model: 'gemini-2.0-flash', order: 2 },
		],
	},
];
