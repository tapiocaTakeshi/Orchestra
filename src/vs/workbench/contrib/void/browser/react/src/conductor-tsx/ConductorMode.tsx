/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useMemo } from 'react';
import { Brain, Code, FileText, Search, Palette, Music } from 'lucide-react';
import { useSettingsState } from '../util/services.js';
import { AgentRole, displayInfoOfProviderName } from '../../../../common/voidSettingsTypes.js';
import { AgentState, AgentStatus, roleDisplayConfig } from './ConductorTypes.js';
import { AgentCard } from './AgentCard.js';

const roleIcons: Record<AgentRole, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
	leader: Brain,
	coder: Code,
	planner: FileText,
	search: Search,
	design: Palette,
};

// Generate positions for circular layout
const getCircularPositions = (count: number, radius: number, centerX: number, centerY: number) => {
	return Array.from({ length: count }, (_, i) => {
		const angle = (i * 2 * Math.PI / count) - Math.PI / 2; // start from top
		return {
			x: centerX + radius * Math.cos(angle),
			y: centerY + radius * Math.sin(angle),
		};
	});
};

export const ConductorMode: React.FC = () => {
	const settingsState = useSettingsState();
	const roleAssignments = settingsState.globalSettings.roleAssignments;

	const [selectedAgent, setSelectedAgent] = useState<AgentRole | null>(null);

	// Demo agent states
	const agents: AgentState[] = useMemo(() =>
		roleAssignments.map((ra, i) => {
			const statuses: AgentStatus[] = ['completed', 'running', 'completed', 'waiting', 'idle'];
			return {
				role: ra.role,
				status: statuses[i] || 'idle',
				provider: ra.provider,
				model: ra.model,
				startTime: statuses[i] === 'running' ? Date.now() - 2500 : statuses[i] === 'completed' ? Date.now() - 12000 : null,
				endTime: statuses[i] === 'completed' ? Date.now() - 5000 : null,
				tokensUsed: statuses[i] === 'completed' ? 1500 + i * 600 : statuses[i] === 'running' ? 320 : 0,
				summary: '',
				error: null,
			};
		}),
		[roleAssignments]
	);

	const viewSize = 280;
	const center = viewSize / 2;
	const outerRadius = 100;
	const innerRadius = 30;
	const positions = getCircularPositions(agents.length, outerRadius, center, center);

	return (
		<div className="void-flex void-flex-col void-h-full void-overflow-hidden">
			{/* Header */}
			<div className="void-flex void-items-center void-justify-between void-px-4 void-py-3 void-border-b void-border-void-border-2">
				<div className="void-flex void-items-center void-gap-2">
					<Music size={14} className="void-text-void-fg-2" />
					<span className="void-text-sm void-text-void-fg-1 void-font-medium">Conductor View</span>
				</div>
			</div>

			{/* Circular visualization */}
			<div className="void-flex-1 void-flex void-flex-col void-items-center void-justify-center void-p-4 void-overflow-y-auto">
				<div className="void-relative" style={{ width: viewSize, height: viewSize }}>
					{/* SVG connections */}
					<svg
						className="void-absolute void-inset-0"
						width={viewSize}
						height={viewSize}
						style={{ overflow: 'visible' }}
					>
						{/* Connection lines from center to each agent */}
						{positions.map((pos, i) => {
							const agent = agents[i];
							const display = roleDisplayConfig[agent.role];
							return (
								<line
									key={`line-${i}`}
									x1={center}
									y1={center}
									x2={pos.x}
									y2={pos.y}
									stroke={agent.status === 'running' ? display.color
										: agent.status === 'completed' ? '#10b981'
											: 'var(--void-border-2)'}
									strokeWidth={agent.status === 'running' ? 2 : 1}
									strokeDasharray={agent.status === 'waiting' ? '4,4' : undefined}
									opacity={agent.status === 'idle' ? 0.2
										: agent.status === 'waiting' ? 0.4
											: 0.6}
									className={agent.status === 'running' ? 'conductor-line-pulse' : ''}
								/>
							);
						})}

						{/* Connecting arcs between adjacent agents */}
						{positions.map((pos, i) => {
							const nextPos = positions[(i + 1) % positions.length];
							const agent = agents[i];
							const nextAgent = agents[(i + 1) % agents.length];
							const bothActive = (agent.status === 'completed' || agent.status === 'running') &&
								(nextAgent.status === 'completed' || nextAgent.status === 'running');
							return (
								<line
									key={`arc-${i}`}
									x1={pos.x}
									y1={pos.y}
									x2={nextPos.x}
									y2={nextPos.y}
									stroke={bothActive ? 'var(--void-fg-4)' : 'var(--void-border-2)'}
									strokeWidth={0.5}
									opacity={bothActive ? 0.3 : 0.1}
								/>
							);
						})}

						{/* Outer ring */}
						<circle
							cx={center}
							cy={center}
							r={outerRadius + 20}
							fill="none"
							stroke="var(--void-border-2)"
							strokeWidth={0.5}
							opacity={0.2}
							strokeDasharray="3,6"
						/>
					</svg>

					{/* Center conductor node */}
					<div
						className="void-absolute void-flex void-items-center void-justify-center void-rounded-full conductor-center-glow"
						style={{
							left: center - innerRadius,
							top: center - innerRadius,
							width: innerRadius * 2,
							height: innerRadius * 2,
							background: 'radial-gradient(circle, var(--void-bg-1) 0%, var(--void-bg-2) 100%)',
							border: '2px solid var(--void-border-1)',
							zIndex: 10,
						}}
					>
						<Music size={18} className="void-text-void-fg-1" />
					</div>

					{/* Agent nodes */}
					{positions.map((pos, i) => {
						const agent = agents[i];
						const Icon = roleIcons[agent.role];
						const display = roleDisplayConfig[agent.role];
						const nodeSize = 40;
						const isSelected = selectedAgent === agent.role;

						return (
							<button
								key={agent.role}
								onClick={() => setSelectedAgent(isSelected ? null : agent.role)}
								className={`void-absolute void-flex void-items-center void-justify-center void-rounded-full
									void-transition-all void-duration-300 void-border-2
									${agent.status === 'running' ? 'conductor-pulse' : ''}
								`}
								style={{
									left: pos.x - nodeSize / 2,
									top: pos.y - nodeSize / 2,
									width: nodeSize,
									height: nodeSize,
									backgroundColor: `${display.color}15`,
									borderColor: agent.status === 'running' ? display.color
										: agent.status === 'completed' ? '#10b981'
											: agent.status === 'error' ? '#ef4444'
												: 'var(--void-border-2)',
									boxShadow: agent.status === 'running'
										? `0 0 20px ${display.glowColor}, 0 0 40px ${display.glowColor}`
										: isSelected
											? `0 0 15px ${display.glowColor}`
											: undefined,
									transform: isSelected ? 'scale(1.2)' : undefined,
									zIndex: isSelected ? 20 : 5,
								}}
							>
								<Icon size={16} style={{ color: display.color }} />
							</button>
						);
					})}

					{/* Role labels */}
					{positions.map((pos, i) => {
						const agent = agents[i];
						const display = roleDisplayConfig[agent.role];
						const labelOffset = 30;
						const angle = Math.atan2(pos.y - center, pos.x - center);
						const labelX = pos.x + labelOffset * Math.cos(angle);
						const labelY = pos.y + labelOffset * Math.sin(angle);

						return (
							<div
								key={`label-${agent.role}`}
								className="void-absolute void-text-center void-pointer-events-none"
								style={{
									left: labelX - 30,
									top: labelY - 8,
									width: 60,
								}}
							>
								<div className="void-text-xs void-font-medium" style={{ color: display.color }}>
									{display.label}
								</div>
								<div className="void-text-xs void-text-void-fg-4">
									{agent.status === 'running' ? 'Active' :
										agent.status === 'completed' ? 'Done' :
											agent.status === 'error' ? 'Error' :
												agent.status === 'waiting' ? 'Queue' : 'Idle'}
								</div>
							</div>
						);
					})}
				</div>

				{/* Selected agent details */}
				{selectedAgent && (
					<div className="void-w-full void-max-w-sm void-mt-4">
						<AgentCard
							agent={agents.find(a => a.role === selectedAgent)!}
						/>
					</div>
				)}
			</div>
		</div>
	);
};
