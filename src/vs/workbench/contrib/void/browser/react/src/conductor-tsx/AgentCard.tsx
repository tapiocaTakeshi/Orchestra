/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useState } from 'react';
import { Brain, Code, FileText, Search, Palette, RotateCcw, Zap, Clock, Coins } from 'lucide-react';
import { AgentRole, displayInfoOfProviderName } from '../../../../common/voidSettingsTypes.js';
import { AgentState, AgentStatus, roleDisplayConfig, agentStrengthTags } from './ConductorTypes.js';

const roleIcons: Record<AgentRole, React.ComponentType<{ className?: string; size?: number }>> = {
	leader: Brain,
	coder: Code,
	planner: FileText,
	search: Search,
	design: Palette,
};

const statusConfig: Record<AgentStatus, { label: string; dotClass: string }> = {
	idle: { label: 'Idle', dotClass: 'void-bg-void-fg-4' },
	waiting: { label: 'Waiting', dotClass: 'void-bg-amber-400' },
	running: { label: 'Running', dotClass: 'void-bg-blue-400' },
	completed: { label: 'Done', dotClass: 'void-bg-emerald-400' },
	error: { label: 'Error', dotClass: 'void-bg-red-400' },
};

const formatDuration = (ms: number): string => {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	return `${(ms / 60000).toFixed(1)}m`;
};

const formatTokens = (tokens: number): string => {
	if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
	if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
	return `${tokens}`;
};

interface AgentCardProps {
	agent: AgentState;
	onRerun?: () => void;
	compact?: boolean;
}

export const AgentCard: React.FC<AgentCardProps> = ({ agent, onRerun, compact = false }) => {
	const Icon = roleIcons[agent.role];
	const display = roleDisplayConfig[agent.role];
	const status = statusConfig[agent.status];
	const tags = agentStrengthTags[agent.role];
	const providerTitle = displayInfoOfProviderName(agent.provider).title;

	const [elapsed, setElapsed] = useState(0);

	// Live timer for running agents
	useEffect(() => {
		if (agent.status !== 'running' || !agent.startTime) return;
		const interval = setInterval(() => {
			setElapsed(Date.now() - agent.startTime!);
		}, 100);
		return () => clearInterval(interval);
	}, [agent.status, agent.startTime]);

	const duration = agent.status === 'running' && agent.startTime
		? elapsed
		: agent.startTime && agent.endTime
			? agent.endTime - agent.startTime
			: 0;

	if (compact) {
		return (
			<div
				className={`
					void-flex void-items-center void-gap-2 void-px-3 void-py-2
					void-rounded-lg void-border void-border-void-border-2
					void-bg-void-bg-1 void-transition-all void-duration-300
					${agent.status === 'running' ? 'void-ring-1' : ''}
				`}
				style={{
					borderColor: agent.status === 'running' ? display.color : undefined,
					boxShadow: agent.status === 'running' ? `0 0 12px ${display.glowColor}` : undefined,
				}}
			>
				<div
					className="void-w-2 void-h-2 void-rounded-full void-flex-shrink-0"
					style={{
						backgroundColor: agent.status === 'running' ? display.color
							: agent.status === 'completed' ? '#10b981'
								: agent.status === 'error' ? '#ef4444'
									: undefined,
					}}
				/>
				<Icon size={14} style={{ color: display.color }} />
				<span className="void-text-xs void-text-void-fg-1 void-font-medium">{display.label}</span>
				<span className="void-text-xs void-text-void-fg-3">{agent.model.split('/').pop()}</span>
			</div>
		);
	}

	return (
		<div
			className={`
				void-relative void-rounded-xl void-border void-border-void-border-2
				void-bg-void-bg-1 void-p-4 void-transition-all void-duration-500
				hover:void-border-void-border-1
				${agent.status === 'running' ? 'conductor-card-running' : ''}
				${agent.status === 'error' ? 'conductor-card-error' : ''}
			`}
			style={{
				borderColor: agent.status === 'running' ? display.color : undefined,
				boxShadow: agent.status === 'running'
					? `0 0 20px ${display.glowColor}, inset 0 0 20px ${display.glowColor}`
					: agent.status === 'error'
						? '0 0 20px rgba(239, 68, 68, 0.3)'
						: undefined,
			}}
		>
			{/* Header */}
			<div className="void-flex void-items-center void-justify-between void-mb-3">
				<div className="void-flex void-items-center void-gap-2">
					<div
						className="void-w-8 void-h-8 void-rounded-lg void-flex void-items-center void-justify-center"
						style={{ backgroundColor: `${display.color}20` }}
					>
						<Icon size={16} style={{ color: display.color }} />
					</div>
					<div>
						<div className="void-text-sm void-font-semibold void-text-void-fg-1">{display.label}</div>
						<div className="void-text-xs void-text-void-fg-3">{providerTitle}</div>
					</div>
				</div>

				{/* Status indicator */}
				<div className="void-flex void-items-center void-gap-1.5">
					<div
						className={`void-w-2 void-h-2 void-rounded-full ${agent.status === 'running' ? 'conductor-pulse' : ''}`}
						style={{
							backgroundColor: agent.status === 'running' ? display.color
								: agent.status === 'completed' ? '#10b981'
									: agent.status === 'error' ? '#ef4444'
										: agent.status === 'waiting' ? '#f59e0b'
											: 'var(--void-fg-4)',
						}}
					/>
					<span className="void-text-xs void-text-void-fg-3">{status.label}</span>
				</div>
			</div>

			{/* Model name */}
			<div className="void-mb-3 void-px-2 void-py-1 void-rounded void-bg-void-bg-2 void-text-xs void-text-void-fg-2 void-font-mono void-truncate">
				{agent.model}
			</div>

			{/* Metrics row */}
			<div className="void-flex void-items-center void-gap-3 void-text-xs void-text-void-fg-3">
				<div className="void-flex void-items-center void-gap-1" title="Processing time">
					<Clock size={10} />
					<span>{duration > 0 ? formatDuration(duration) : '--'}</span>
				</div>
				<div className="void-flex void-items-center void-gap-1" title="Tokens used">
					<Zap size={10} />
					<span>{agent.tokensUsed > 0 ? formatTokens(agent.tokensUsed) : '--'}</span>
				</div>
			</div>

			{/* Strength tags */}
			<div className="void-flex void-flex-wrap void-gap-1 void-mt-3">
				{tags.map(tag => (
					<span
						key={tag.label}
						className="void-text-xs void-px-1.5 void-py-0.5 void-rounded-full void-font-medium"
						style={{
							backgroundColor: `${tag.color}15`,
							color: tag.color,
							border: `1px solid ${tag.color}30`,
						}}
					>
						{tag.label}
					</span>
				))}
			</div>

			{/* Summary */}
			{agent.summary && (
				<div className="void-mt-3 void-text-xs void-text-void-fg-3 void-leading-relaxed void-line-clamp-2">
					{agent.summary}
				</div>
			)}

			{/* Error display */}
			{agent.error && (
				<div className="void-mt-3 void-text-xs void-text-red-400 void-bg-red-400/10 void-rounded void-p-2">
					{agent.error}
				</div>
			)}

			{/* Re-run button */}
			{onRerun && (agent.status === 'completed' || agent.status === 'error') && (
				<button
					onClick={onRerun}
					className="void-absolute void-top-2 void-right-2 void-p-1 void-rounded void-text-void-fg-3 hover:void-text-void-fg-1 hover:void-bg-void-bg-2 void-transition-colors"
					title="Re-run this agent"
				>
					<RotateCcw size={12} />
				</button>
			)}
		</div>
	);
};
