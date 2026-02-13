/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState, useMemo } from 'react';
import { Brain, Code, FileText, Search, Palette, Music } from 'lucide-react';
import { useSettingsState } from '../util/services.js';
import { AgentRole, displayInfoOfProviderName } from '../../../../common/voidSettingsTypes.js';
import { AgentState, AgentStatus, roleDisplayConfig } from './ConductorTypes.js';

const roleIcons: Record<AgentRole, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
	leader: Brain,
	coder: Code,
	planner: FileText,
	search: Search,
	design: Palette,
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
	running: 'Active',
	waiting: 'Queue',
	idle: 'Idle',
	error: 'Error',
};

// Circular layout positions
const getCircularPositions = (count: number, radius: number, centerX: number, centerY: number) => {
	return Array.from({ length: count }, (_, i) => {
		const angle = (i * 2 * Math.PI / count) - Math.PI / 2;
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

	const viewSize = 260;
	const center = viewSize / 2;
	const outerRadius = 90;
	const innerRadius = 26;
	const positions = getCircularPositions(agents.length, outerRadius, center, center);

	const selected = selectedAgent ? agents.find(a => a.role === selectedAgent) : null;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
			{/* Header */}
			<div style={{
				display: 'flex', alignItems: 'center', justifyContent: 'space-between',
				padding: '12px 16px',
				borderBottom: '1px solid var(--void-border-2)',
			}}>
				<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
					<Music size={14} style={{ color: 'var(--void-fg-2)' }} />
					<span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--void-fg-1)' }}>Conductor</span>
					<span style={{
						fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
						background: 'rgba(251,146,60,0.1)', color: '#fb923c',
					}}>Preview</span>
				</div>
			</div>

			{/* Circular visualization */}
			<div style={{
				flex: '1 1 0', minHeight: 0,
				display: 'flex', flexDirection: 'column', alignItems: 'center',
				justifyContent: 'center', padding: '16px',
				overflowY: 'auto',
			}}>
				<div style={{ position: 'relative', width: viewSize, height: viewSize }}>
					{/* SVG connections */}
					<svg
						style={{ position: 'absolute', inset: 0 }}
						width={viewSize}
						height={viewSize}
					>
						{/* Lines from center to agents */}
						{positions.map((pos, i) => {
							const agent = agents[i];
							const display = roleDisplayConfig[agent.role];
							return (
								<line
									key={`line-${i}`}
									x1={center} y1={center}
									x2={pos.x} y2={pos.y}
									stroke={agent.status === 'running' ? display.color
										: agent.status === 'completed' ? '#10b981'
											: 'var(--void-border-2)'}
									strokeWidth={agent.status === 'running' ? 2 : 1}
									strokeDasharray={agent.status === 'waiting' ? '4,4' : undefined}
									opacity={agent.status === 'idle' ? 0.2 : agent.status === 'waiting' ? 0.4 : 0.5}
								/>
							);
						})}

						{/* Outer ring */}
						<circle
							cx={center} cy={center} r={outerRadius + 18}
							fill="none" stroke="var(--void-border-2)"
							strokeWidth={0.5} opacity={0.2} strokeDasharray="3,6"
						/>
					</svg>

					{/* Center conductor node */}
					<div style={{
						position: 'absolute',
						left: center - innerRadius, top: center - innerRadius,
						width: innerRadius * 2, height: innerRadius * 2,
						borderRadius: '50%',
						display: 'flex', alignItems: 'center', justifyContent: 'center',
						background: 'radial-gradient(circle, var(--void-bg-1) 0%, var(--void-bg-2) 100%)',
						border: '2px solid var(--void-border-1)',
						zIndex: 10,
					}}>
						<Music size={16} style={{ color: 'var(--void-fg-1)' }} />
					</div>

					{/* Agent nodes */}
					{positions.map((pos, i) => {
						const agent = agents[i];
						const Icon = roleIcons[agent.role];
						const display = roleDisplayConfig[agent.role];
						const nodeSize = 36;
						const isSelected = selectedAgent === agent.role;

						return (
							<button
								key={agent.role}
								onClick={() => setSelectedAgent(isSelected ? null : agent.role)}
								style={{
									position: 'absolute',
									left: pos.x - nodeSize / 2, top: pos.y - nodeSize / 2,
									width: nodeSize, height: nodeSize,
									borderRadius: '50%',
									display: 'flex', alignItems: 'center', justifyContent: 'center',
									border: `2px solid ${agent.status === 'running' ? display.color
										: agent.status === 'completed' ? '#10b981'
											: 'var(--void-border-2)'}`,
									backgroundColor: `${display.color}15`,
									cursor: 'pointer',
									transition: 'all 0.3s',
									transform: isSelected ? 'scale(1.2)' : undefined,
									boxShadow: agent.status === 'running'
										? `0 0 16px ${display.glowColor}`
										: isSelected ? `0 0 12px ${display.glowColor}` : undefined,
									zIndex: isSelected ? 20 : 5,
								}}
							>
								<Icon size={14} style={{ color: display.color }} />
							</button>
						);
					})}

					{/* Labels */}
					{positions.map((pos, i) => {
						const agent = agents[i];
						const display = roleDisplayConfig[agent.role];
						const labelOffset = 28;
						const angle = Math.atan2(pos.y - center, pos.x - center);
						const labelX = pos.x + labelOffset * Math.cos(angle);
						const labelY = pos.y + labelOffset * Math.sin(angle);

						return (
							<div
								key={`label-${agent.role}`}
								style={{
									position: 'absolute',
									left: labelX - 28, top: labelY - 7,
									width: 56, textAlign: 'center',
									pointerEvents: 'none',
								}}
							>
								<div style={{ fontSize: '10px', fontWeight: 500, color: display.color }}>
									{display.label}
								</div>
								<div style={{ fontSize: '9px', color: 'var(--void-fg-4)' }}>
									{statusLabels[agent.status]}
								</div>
							</div>
						);
					})}
				</div>

				{/* Selected agent details */}
				{selected && (
					<div style={{
						width: '100%', marginTop: '16px',
						padding: '12px', borderRadius: '8px',
						border: '1px solid var(--void-border-2)',
						background: 'var(--void-bg-1)',
					}}>
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
							<div style={{
								width: '24px', height: '24px', borderRadius: '6px',
								display: 'flex', alignItems: 'center', justifyContent: 'center',
								backgroundColor: `${roleDisplayConfig[selected.role].color}20`,
							}}>
								{(() => { const I = roleIcons[selected.role]; return <I size={12} style={{ color: roleDisplayConfig[selected.role].color }} />; })()}
							</div>
							<div>
								<div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--void-fg-1)' }}>
									{roleDisplayConfig[selected.role].label}
								</div>
								<div style={{ fontSize: '10px', color: 'var(--void-fg-3)' }}>
									{displayInfoOfProviderName(selected.provider).title} · {selected.model}
								</div>
							</div>
						</div>
						<div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: 'var(--void-fg-4)' }}>
							<span>Status: {statusLabels[selected.status]}</span>
							{selected.tokensUsed > 0 && <span>Tokens: {selected.tokensUsed}</span>}
						</div>
					</div>
				)}
			</div>
		</div>
	);
};
