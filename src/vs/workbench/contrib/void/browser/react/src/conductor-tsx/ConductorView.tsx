/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useMemo } from 'react';
import { ArrowDown, Play, Square, RotateCcw } from 'lucide-react';
import { useSettingsState } from '../util/services.js';
import { AgentRole } from '../../../../common/voidSettingsTypes.js';
import { AgentCard } from './AgentCard.js';
import { MetaPanel } from './MetaPanel.js';
import { AgentState, AgentStatus, ConductorMetrics, roleDisplayConfig } from './ConductorTypes.js';

// Demo data generator for visualization
const createDemoAgents = (roleAssignments: { role: AgentRole; provider: any; model: string }[]): AgentState[] => {
	const statuses: AgentStatus[] = ['completed', 'completed', 'running', 'waiting', 'idle'];
	return roleAssignments.map((ra, i) => ({
		role: ra.role,
		status: statuses[i] || 'idle',
		provider: ra.provider,
		model: ra.model,
		startTime: statuses[i] === 'running' ? Date.now() - 3200
			: statuses[i] === 'completed' ? Date.now() - 15000
				: null,
		endTime: statuses[i] === 'completed' ? Date.now() - (10000 - i * 2000) : null,
		tokensUsed: statuses[i] === 'completed' ? 1200 + i * 800
			: statuses[i] === 'running' ? 450
				: 0,
		summary: statuses[i] === 'completed'
			? i === 0 ? 'Task decomposed into 3 sub-tasks for parallel processing'
				: 'Analysis complete, findings synthesized'
			: '',
		error: null,
	}));
};

const computeMetrics = (agents: AgentState[]): ConductorMetrics => {
	const completed = agents.filter(a => a.status === 'completed');
	const totalTokens = agents.reduce((sum, a) => sum + a.tokensUsed, 0);
	const totalTime = agents.reduce((sum, a) => {
		if (a.startTime && a.endTime) return sum + (a.endTime - a.startTime);
		if (a.startTime && a.status === 'running') return sum + (Date.now() - a.startTime);
		return sum;
	}, 0);

	return {
		totalTokens,
		estimatedCost: totalTokens * 0.000003, // rough estimate
		totalTime,
		successRate: agents.length > 0 ? (completed.length / agents.length) * 100 : 0,
		agentCount: agents.length,
		completedCount: completed.length,
	};
};

export const ConductorView: React.FC = () => {
	const settingsState = useSettingsState();
	const roleAssignments = settingsState.globalSettings.roleAssignments;

	const [isRunning, setIsRunning] = useState(false);
	const [agents, setAgents] = useState<AgentState[]>(() => createDemoAgents(roleAssignments));

	const metrics = useMemo(() => computeMetrics(agents), [agents]);

	const handleStart = () => {
		setIsRunning(true);
		// Reset all agents to running state
		setAgents(prev => prev.map((a, i) => ({
			...a,
			status: i === 0 ? 'running' as AgentStatus : 'waiting' as AgentStatus,
			startTime: i === 0 ? Date.now() : null,
			endTime: null,
			tokensUsed: 0,
			summary: '',
			error: null,
		})));
	};

	const handleStop = () => {
		setIsRunning(false);
		setAgents(prev => prev.map(a => ({
			...a,
			status: a.status === 'running' ? 'idle' as AgentStatus : a.status,
		})));
	};

	const handleRerun = (role: AgentRole) => {
		setAgents(prev => prev.map(a =>
			a.role === role
				? { ...a, status: 'running' as AgentStatus, startTime: Date.now(), endTime: null, tokensUsed: 0, summary: '', error: null }
				: a
		));
	};

	const handleReset = () => {
		setIsRunning(false);
		setAgents(createDemoAgents(roleAssignments));
	};

	return (
		<div className="void-flex void-flex-col void-h-full void-overflow-hidden">
			{/* Meta Panel */}
			<MetaPanel metrics={metrics} />

			{/* Controls */}
			<div className="void-flex void-items-center void-justify-between void-px-4 void-py-2 void-border-b void-border-void-border-2">
				<div className="void-text-sm void-text-void-fg-1 void-font-medium">
					Pipeline
				</div>
				<div className="void-flex void-items-center void-gap-2">
					<button
						onClick={handleReset}
						className="void-p-1.5 void-rounded void-text-void-fg-3 hover:void-text-void-fg-1 hover:void-bg-void-bg-2 void-transition-colors"
						title="Reset pipeline"
					>
						<RotateCcw size={14} />
					</button>
					{isRunning ? (
						<button
							onClick={handleStop}
							className="void-flex void-items-center void-gap-1.5 void-px-3 void-py-1.5 void-rounded-lg void-bg-red-500/10 void-text-red-400 hover:void-bg-red-500/20 void-transition-colors void-text-xs void-font-medium"
						>
							<Square size={10} />
							Stop
						</button>
					) : (
						<button
							onClick={handleStart}
							className="void-flex void-items-center void-gap-1.5 void-px-3 void-py-1.5 void-rounded-lg void-bg-emerald-500/10 void-text-emerald-400 hover:void-bg-emerald-500/20 void-transition-colors void-text-xs void-font-medium"
						>
							<Play size={10} />
							Run
						</button>
					)}
				</div>
			</div>

			{/* Pipeline Flow */}
			<div className="void-flex-1 void-overflow-y-auto void-p-4">
				<div className="void-flex void-flex-col void-gap-2">
					{agents.map((agent, index) => (
						<React.Fragment key={agent.role}>
							<AgentCard
								agent={agent}
								onRerun={() => handleRerun(agent.role)}
							/>

							{/* Flow connector arrow */}
							{index < agents.length - 1 && (
								<div className="void-flex void-justify-center void-py-1">
									<div className="void-flex void-flex-col void-items-center">
										<div
											className="void-w-px void-h-4"
											style={{
												backgroundColor: agent.status === 'completed'
													? roleDisplayConfig[agent.role].color
													: 'var(--void-border-2)',
												opacity: agent.status === 'completed' ? 0.6 : 0.3,
											}}
										/>
										<ArrowDown
											size={12}
											style={{
												color: agent.status === 'completed'
													? roleDisplayConfig[agent.role].color
													: 'var(--void-fg-4)',
												opacity: agent.status === 'completed' ? 0.8 : 0.3,
											}}
										/>
									</div>
								</div>
							)}
						</React.Fragment>
					))}
				</div>
			</div>
		</div>
	);
};
