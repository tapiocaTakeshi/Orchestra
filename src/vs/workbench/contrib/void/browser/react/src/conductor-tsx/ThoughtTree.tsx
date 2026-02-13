/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Brain, Code, FileText, Search, Palette, GitBranch } from 'lucide-react';
import { AgentRole } from '../../../../common/voidSettingsTypes.js';
import { ThoughtNode, roleDisplayConfig } from './ConductorTypes.js';

const roleIcons: Record<AgentRole, React.ComponentType<{ size?: number; style?: React.CSSProperties }>> = {
	leader: Brain,
	coder: Code,
	planner: FileText,
	search: Search,
	design: Palette,
};

const statusColors: Record<string, string> = {
	completed: '#10b981',
	running: '#3b82f6',
	waiting: '#f59e0b',
	error: '#ef4444',
	idle: 'var(--void-fg-4)',
};

const statusLabels: Record<string, string> = {
	completed: 'Done',
	running: 'Active',
	waiting: 'Queued',
	error: 'Error',
	idle: 'Idle',
};

// Demo thought tree
const demoThoughtTree: ThoughtNode = {
	id: 'root',
	role: 'leader',
	content: 'Task Analysis: "Build a responsive dashboard with real-time data visualization"',
	status: 'completed',
	depth: 0,
	children: [
		{
			id: 'plan-1',
			role: 'planner',
			content: 'Architecture: React + D3.js, WebSocket for real-time data, responsive grid layout',
			status: 'completed',
			depth: 1,
			children: [
				{
					id: 'search-1',
					role: 'search',
					content: 'Found: D3.js v7 patterns, WebSocket best practices, responsive dashboard examples',
					status: 'completed',
					depth: 2,
					children: [],
				},
			],
		},
		{
			id: 'code-1',
			role: 'coder',
			content: 'Implementing dashboard component with chart widgets and data binding',
			status: 'running',
			depth: 1,
			children: [
				{
					id: 'design-1',
					role: 'design',
					content: 'UI: dark theme, card layout, gradient charts, glassmorphism panels',
					status: 'waiting',
					depth: 2,
					children: [],
				},
			],
		},
		{
			id: 'search-2',
			role: 'search',
			content: 'Performance: virtual scrolling, memoization, WebSocket connection pooling',
			status: 'waiting',
			depth: 1,
			children: [],
		},
	],
};

const ThoughtNodeComponent: React.FC<{ node: ThoughtNode; isLast?: boolean }> = ({ node, isLast = false }) => {
	const [expanded, setExpanded] = useState(true);
	const Icon = roleIcons[node.role];
	const display = roleDisplayConfig[node.role];
	const hasChildren = node.children.length > 0;

	return (
		<div style={{ position: 'relative' }}>
			{/* Node content */}
			<div style={{
				display: 'flex', alignItems: 'flex-start', gap: '8px',
				padding: '6px 0',
				paddingLeft: `${node.depth * 20}px`,
			}}>
				{/* Expand toggle */}
				{hasChildren ? (
					<button
						onClick={() => setExpanded(!expanded)}
						style={{
							flexShrink: 0, marginTop: '2px', padding: '2px', borderRadius: '3px',
							background: 'none', border: 'none', cursor: 'pointer',
							color: 'var(--void-fg-3)',
						}}
					>
						{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
					</button>
				) : (
					<div style={{ width: '16px', flexShrink: 0 }} />
				)}

				{/* Status + icon */}
				<div style={{
					width: '24px', height: '24px', borderRadius: '6px',
					display: 'flex', alignItems: 'center', justifyContent: 'center',
					flexShrink: 0, marginTop: '1px',
					backgroundColor: `${display.color}15`,
					boxShadow: node.status === 'running' ? `0 0 8px ${display.glowColor}` : undefined,
				}}>
					<Icon size={12} style={{ color: display.color }} />
				</div>

				{/* Text content */}
				<div style={{ flex: 1, minWidth: 0 }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
						<span style={{ fontSize: '11px', fontWeight: 600, color: display.color }}>
							{display.label}
						</span>
						<div style={{
							width: '6px', height: '6px', borderRadius: '50%',
							backgroundColor: statusColors[node.status],
							boxShadow: node.status === 'running' ? `0 0 4px ${statusColors[node.status]}` : undefined,
						}} />
						<span style={{ fontSize: '10px', color: 'var(--void-fg-4)' }}>
							{statusLabels[node.status]}
						</span>
					</div>
					<div style={{ fontSize: '11px', color: 'var(--void-fg-2)', lineHeight: 1.4 }}>
						{node.content}
					</div>
				</div>
			</div>

			{/* Children */}
			{expanded && hasChildren && (
				<div style={{ borderLeft: node.depth >= 0 ? '1px solid var(--void-border-2)' : 'none', marginLeft: `${node.depth * 20 + 20}px` }}>
					{node.children.map((child, index) => (
						<ThoughtNodeComponent
							key={child.id}
							node={child}
							isLast={index === node.children.length - 1}
						/>
					))}
				</div>
			)}
		</div>
	);
};

// Timeline view
const flattenTree = (node: ThoughtNode, result: ThoughtNode[] = []): ThoughtNode[] => {
	result.push(node);
	node.children.forEach(child => flattenTree(child, result));
	return result;
};

const TimelineView: React.FC<{ tree: ThoughtNode }> = ({ tree }) => {
	const nodes = flattenTree(tree);

	return (
		<div style={{ display: 'flex', flexDirection: 'column' }}>
			{nodes.map((node, index) => {
				const Icon = roleIcons[node.role];
				const display = roleDisplayConfig[node.role];

				return (
					<div key={node.id} style={{ display: 'flex', gap: '12px' }}>
						{/* Timeline */}
						<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
							<div style={{
								width: '24px', height: '24px', borderRadius: '50%',
								display: 'flex', alignItems: 'center', justifyContent: 'center',
								flexShrink: 0, zIndex: 1,
								backgroundColor: `${display.color}20`,
								border: `2px solid ${display.color}`,
								boxShadow: node.status === 'running' ? `0 0 10px ${display.glowColor}` : undefined,
							}}>
								<Icon size={10} style={{ color: display.color }} />
							</div>
							{index < nodes.length - 1 && (
								<div style={{
									width: '1px', flex: 1, minHeight: '16px',
									backgroundColor: node.status === 'completed' ? display.color : 'var(--void-border-2)',
									opacity: node.status === 'completed' ? 0.4 : 0.2,
								}} />
							)}
						</div>

						{/* Content */}
						<div style={{ paddingBottom: '16px', flex: 1, minWidth: 0 }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
								<span style={{ fontSize: '11px', fontWeight: 600, color: display.color }}>{display.label}</span>
								<span style={{ fontSize: '10px', color: 'var(--void-fg-4)' }}>{statusLabels[node.status]}</span>
							</div>
							<div style={{ fontSize: '11px', color: 'var(--void-fg-2)', lineHeight: 1.4 }}>
								{node.content}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
};

export const ThoughtTree: React.FC = () => {
	const [viewMode, setViewMode] = useState<'tree' | 'timeline'>('tree');

	return (
		<div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
			{/* Header */}
			<div style={{
				display: 'flex', alignItems: 'center', justifyContent: 'space-between',
				padding: '12px 16px',
				borderBottom: '1px solid var(--void-border-2)',
			}}>
				<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
					<GitBranch size={14} style={{ color: 'var(--void-fg-2)' }} />
					<span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--void-fg-1)' }}>Thought Process</span>
					<span style={{
						fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
						background: 'rgba(16,185,129,0.1)', color: '#34d399',
					}}>Preview</span>
				</div>
				{/* View mode toggle */}
				<div style={{
					display: 'flex', alignItems: 'center', gap: '2px',
					background: 'var(--void-bg-2)', borderRadius: '6px', padding: '2px',
				}}>
					{(['tree', 'timeline'] as const).map(mode => (
						<button
							key={mode}
							onClick={() => setViewMode(mode)}
							style={{
								padding: '3px 8px', borderRadius: '4px',
								background: viewMode === mode ? 'var(--void-bg-1)' : 'none',
								border: 'none', cursor: 'pointer',
								fontSize: '10px', fontWeight: viewMode === mode ? 500 : 400,
								color: viewMode === mode ? 'var(--void-fg-1)' : 'var(--void-fg-3)',
								transition: 'all 0.15s',
							}}
						>
							{mode.charAt(0).toUpperCase() + mode.slice(1)}
						</button>
					))}
				</div>
			</div>

			{/* Content */}
			<div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: '12px 16px' }}>
				{viewMode === 'tree' ? (
					<ThoughtNodeComponent node={demoThoughtTree} />
				) : (
					<TimelineView tree={demoThoughtTree} />
				)}
			</div>

			{/* Legend */}
			<div style={{
				display: 'flex', alignItems: 'center', gap: '12px',
				padding: '8px 16px',
				borderTop: '1px solid var(--void-border-2)',
				fontSize: '10px', color: 'var(--void-fg-4)',
			}}>
				{[
					{ label: 'Done', color: '#10b981' },
					{ label: 'Active', color: '#3b82f6' },
					{ label: 'Waiting', color: '#f59e0b' },
				].map(item => (
					<div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
						<div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: item.color }} />
						<span>{item.label}</span>
					</div>
				))}
			</div>
		</div>
	);
};
