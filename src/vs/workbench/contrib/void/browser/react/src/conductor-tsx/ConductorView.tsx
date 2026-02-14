/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useMemo } from 'react';
import { ArrowDown, Play, Square, RotateCcw, Zap, Clock, CheckCircle } from 'lucide-react';
import { useSettingsState } from '../util/services.js';
import { AgentRole, displayInfoOfProviderName } from '../../../../common/voidSettingsTypes.js';
import { AgentState, AgentStatus, roleDisplayConfig } from './ConductorTypes.js';

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

const statusColors: Record<AgentStatus, string> = {
	completed: '#10b981',
	running: '#3b82f6',
	waiting: '#f59e0b',
	idle: 'var(--void-fg-4)',
	error: '#ef4444',
};

const statusLabels: Record<AgentStatus, string> = {
	completed: 'Done',
	running: 'Running',
	waiting: 'Waiting',
	idle: 'Idle',
	error: 'Error',
};

export const ConductorView: React.FC = () => {
	const settingsState = useSettingsState();
	const roleAssignments = settingsState.globalSettings.roleAssignments;

	const [isRunning, setIsRunning] = useState(false);
	const [agents, setAgents] = useState<AgentState[]>(() => createDemoAgents(roleAssignments));

	const completedCount = agents.filter(a => a.status === 'completed').length;
	const totalTokens = agents.reduce((sum, a) => sum + a.tokensUsed, 0);

	const handleStart = () => {
		setIsRunning(true);
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

	const handleReset = () => {
		setIsRunning(false);
		setAgents(createDemoAgents(roleAssignments));
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
			{/* Header with controls */}
			<div style={{
				display: 'flex', alignItems: 'center', justifyContent: 'space-between',
				padding: '12px 16px',
				borderBottom: '1px solid var(--void-border-2)',
			}}>
				<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
					<span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--void-fg-1)' }}>Pipeline</span>
					<span style={{
						fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
						background: 'rgba(59,130,246,0.1)', color: '#60a5fa',
					}}>Preview</span>
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
					<button
						onClick={handleReset}
						style={{
							padding: '4px', borderRadius: '4px', cursor: 'pointer',
							background: 'none', border: 'none', color: 'var(--void-fg-3)',
						}}
						title="Reset pipeline"
					>
						<RotateCcw size={14} />
					</button>
					{isRunning ? (
						<button
							onClick={handleStop}
							style={{
								display: 'flex', alignItems: 'center', gap: '4px',
								padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
								background: 'rgba(239,68,68,0.1)', color: '#f87171',
								border: 'none', fontSize: '11px', fontWeight: 500,
							}}
						>
							<Square size={10} /> Stop
						</button>
					) : (
						<button
							onClick={handleStart}
							style={{
								display: 'flex', alignItems: 'center', gap: '4px',
								padding: '4px 10px', borderRadius: '6px', cursor: 'pointer',
								background: 'rgba(16,185,129,0.1)', color: '#34d399',
								border: 'none', fontSize: '11px', fontWeight: 500,
							}}
						>
							<Play size={10} /> Run
						</button>
					)}
				</div>
			</div>

			{/* Quick stats bar */}
			<div style={{
				display: 'flex', alignItems: 'center', gap: '12px',
				padding: '8px 16px',
				borderBottom: '1px solid var(--void-border-2)',
				fontSize: '11px', color: 'var(--void-fg-3)',
			}}>
				<div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
					<CheckCircle size={11} color="#10b981" />
					<span>{completedCount}/{agents.length}</span>
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
					<Zap size={11} color="#f59e0b" />
					<span>{totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}K` : totalTokens} tokens</span>
				</div>
			</div>

			{/* Pipeline Flow */}
			<div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: '16px' }}>
				<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
					{agents.map((agent, index) => {
						const display = roleDisplayConfig[agent.role];
						const providerTitle = displayInfoOfProviderName(agent.provider).title;

						return (
							<React.Fragment key={agent.role}>
								{/* Agent Card - clean compact style */}
								<div style={{
									display: 'flex', alignItems: 'center', gap: '10px',
									padding: '10px 12px',
									borderRadius: '8px',
									border: `1px solid ${agent.status === 'running' ? display.color : 'var(--void-border-2)'}`,
									background: agent.status === 'running'
										? `linear-gradient(135deg, ${display.color}08, ${display.color}04)`
										: 'var(--void-bg-1)',
									boxShadow: agent.status === 'running' ? `0 0 12px ${display.glowColor}` : undefined,
									transition: 'all 0.3s ease',
								}}>
									{/* Status dot */}
									<div style={{
										width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
										backgroundColor: statusColors[agent.status],
										boxShadow: agent.status === 'running' ? `0 0 6px ${statusColors[agent.status]}` : undefined,
									}} />

									{/* Info */}
									<div style={{ flex: 1, minWidth: 0 }}>
										<div style={{
											display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px',
										}}>
											<span style={{ fontSize: '12px', fontWeight: 600, color: display.color }}>
												{display.label}
											</span>
											<span style={{ fontSize: '10px', color: 'var(--void-fg-4)' }}>
												{statusLabels[agent.status]}
											</span>
										</div>
										<div style={{ fontSize: '10px', color: 'var(--void-fg-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
											{providerTitle} · {agent.model}
										</div>
									</div>

									{/* Tokens */}
									{agent.tokensUsed > 0 && (
										<span style={{ fontSize: '10px', color: 'var(--void-fg-4)', flexShrink: 0 }}>
											{agent.tokensUsed > 1000 ? `${(agent.tokensUsed / 1000).toFixed(1)}K` : agent.tokensUsed}
										</span>
									)}
								</div>

								{/* Connector */}
								{index < agents.length - 1 && (
									<div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}>
										<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
											<div style={{
												width: '1px', height: '12px',
												backgroundColor: agent.status === 'completed' ? display.color : 'var(--void-border-2)',
												opacity: agent.status === 'completed' ? 0.5 : 0.3,
											}} />
											<ArrowDown size={10} style={{
												color: agent.status === 'completed' ? display.color : 'var(--void-fg-4)',
												opacity: agent.status === 'completed' ? 0.7 : 0.3,
											}} />
										</div>
									</div>
								)}
							</React.Fragment>
						);
					})}
				</div>
			</div>
		</div>
	);
};
