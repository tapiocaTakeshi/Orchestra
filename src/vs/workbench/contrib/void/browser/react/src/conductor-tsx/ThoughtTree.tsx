/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Brain, Code, FileText, Search, Palette, GitBranch, Layers } from 'lucide-react';
import { AgentRole } from '../../../../common/voidSettingsTypes.js';
import { ThoughtNode, roleDisplayConfig } from './ConductorTypes.js';

const roleIcons: Record<AgentRole, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
	leader: Brain,
	coder: Code,
	planner: FileText,
	search: Search,
	design: Palette,
};

// Demo thought tree for visualization
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
			content: 'Architecture: React + D3.js, WebSocket for real-time data, responsive grid layout with CSS Grid',
			status: 'completed',
			depth: 1,
			children: [
				{
					id: 'search-1',
					role: 'search',
					content: 'Found: D3.js v7 integration patterns, WebSocket best practices, responsive dashboard examples',
					status: 'completed',
					depth: 2,
					children: [],
				},
			],
		},
		{
			id: 'code-1',
			role: 'coder',
			content: 'Implementing dashboard component with chart widgets and data binding layer',
			status: 'running',
			depth: 1,
			children: [
				{
					id: 'design-1',
					role: 'design',
					content: 'UI mockup: dark theme, card-based layout, gradient charts, glassmorphism panels',
					status: 'waiting',
					depth: 2,
					children: [],
				},
			],
		},
		{
			id: 'search-2',
			role: 'search',
			content: 'Performance optimization: virtual scrolling, memoization strategies, WebSocket connection pooling',
			status: 'waiting',
			depth: 1,
			children: [],
		},
	],
};

interface ThoughtNodeComponentProps {
	node: ThoughtNode;
	isLast?: boolean;
}

const ThoughtNodeComponent: React.FC<ThoughtNodeComponentProps> = ({ node, isLast = false }) => {
	const [expanded, setExpanded] = useState(true);
	const Icon = roleIcons[node.role];
	const display = roleDisplayConfig[node.role];
	const hasChildren = node.children.length > 0;

	return (
		<div className="void-relative">
			{/* Connection line from parent */}
			{node.depth > 0 && (
				<div
					className="void-absolute void-left-0 void-top-0 void-w-4"
					style={{
						borderLeft: `1px solid var(--void-border-2)`,
						borderBottom: `1px solid var(--void-border-2)`,
						height: '20px',
						marginLeft: `${(node.depth - 1) * 24 + 8}px`,
						borderBottomLeftRadius: '6px',
					}}
				/>
			)}

			{/* Vertical line for siblings */}
			{node.depth > 0 && !isLast && (
				<div
					className="void-absolute void-top-0 void-bottom-0"
					style={{
						borderLeft: `1px solid var(--void-border-2)`,
						marginLeft: `${(node.depth - 1) * 24 + 8}px`,
					}}
				/>
			)}

			{/* Node content */}
			<div
				className="void-flex void-items-start void-gap-2 void-py-1.5"
				style={{ paddingLeft: `${node.depth * 24}px` }}
			>
				{/* Expand/collapse button or dot */}
				{hasChildren ? (
					<button
						onClick={() => setExpanded(!expanded)}
						className="void-flex-shrink-0 void-mt-0.5 void-p-0.5 void-rounded void-text-void-fg-3 hover:void-text-void-fg-1 hover:void-bg-void-bg-2 void-transition-colors"
					>
						{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
					</button>
				) : (
					<div className="void-w-5 void-flex-shrink-0" />
				)}

				{/* Role icon */}
				<div
					className={`void-w-6 void-h-6 void-rounded void-flex void-items-center void-justify-center void-flex-shrink-0 void-mt-0.5
						${node.status === 'running' ? 'conductor-pulse' : ''}`}
					style={{
						backgroundColor: `${display.color}15`,
						boxShadow: node.status === 'running' ? `0 0 8px ${display.glowColor}` : undefined,
					}}
				>
					<Icon size={12} style={{ color: display.color }} />
				</div>

				{/* Content */}
				<div className="void-flex-1 void-min-w-0">
					<div className="void-flex void-items-center void-gap-2 void-mb-0.5">
						<span
							className="void-text-xs void-font-semibold"
							style={{ color: display.color }}
						>
							{display.label}
						</span>
						<div
							className={`void-w-1.5 void-h-1.5 void-rounded-full
								${node.status === 'running' ? 'conductor-pulse' : ''}`}
							style={{
								backgroundColor: node.status === 'completed' ? '#10b981'
									: node.status === 'running' ? '#3b82f6'
										: node.status === 'error' ? '#ef4444'
											: 'var(--void-fg-4)',
							}}
						/>
					</div>
					<div className="void-text-xs void-text-void-fg-2 void-leading-relaxed">
						{node.content}
					</div>
				</div>
			</div>

			{/* Children */}
			{expanded && hasChildren && (
				<div>
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

export const ThoughtTree: React.FC = () => {
	const [viewMode, setViewMode] = useState<'tree' | 'timeline'>('tree');

	return (
		<div className="void-flex void-flex-col void-h-full void-overflow-hidden">
			{/* Header */}
			<div className="void-flex void-items-center void-justify-between void-px-4 void-py-3 void-border-b void-border-void-border-2">
				<div className="void-flex void-items-center void-gap-2">
					<GitBranch size={14} className="void-text-void-fg-2" />
					<span className="void-text-sm void-text-void-fg-1 void-font-medium">Thought Process</span>
				</div>
				<div className="void-flex void-items-center void-gap-1 void-bg-void-bg-2 void-rounded-lg void-p-0.5">
					<button
						onClick={() => setViewMode('tree')}
						className={`void-px-2 void-py-1 void-rounded void-text-xs void-transition-colors
							${viewMode === 'tree' ? 'void-bg-void-bg-1 void-text-void-fg-1' : 'void-text-void-fg-3 hover:void-text-void-fg-1'}`}
					>
						Tree
					</button>
					<button
						onClick={() => setViewMode('timeline')}
						className={`void-px-2 void-py-1 void-rounded void-text-xs void-transition-colors
							${viewMode === 'timeline' ? 'void-bg-void-bg-1 void-text-void-fg-1' : 'void-text-void-fg-3 hover:void-text-void-fg-1'}`}
					>
						Timeline
					</button>
				</div>
			</div>

			{/* Content */}
			<div className="void-flex-1 void-overflow-y-auto void-p-3">
				{viewMode === 'tree' ? (
					<ThoughtNodeComponent node={demoThoughtTree} />
				) : (
					<TimelineView tree={demoThoughtTree} />
				)}
			</div>

			{/* Legend */}
			<div className="void-flex void-items-center void-gap-3 void-px-4 void-py-2 void-border-t void-border-void-border-2 void-text-xs void-text-void-fg-4">
				<div className="void-flex void-items-center void-gap-1">
					<div className="void-w-2 void-h-2 void-rounded-full void-bg-emerald-400" />
					<span>Done</span>
				</div>
				<div className="void-flex void-items-center void-gap-1">
					<div className="void-w-2 void-h-2 void-rounded-full void-bg-blue-400 conductor-pulse" />
					<span>Active</span>
				</div>
				<div className="void-flex void-items-center void-gap-1">
					<div className="void-w-2 void-h-2 void-rounded-full void-bg-amber-400" />
					<span>Waiting</span>
				</div>
			</div>
		</div>
	);
};

// Timeline view - shows sequential flow
const flattenTree = (node: ThoughtNode, result: ThoughtNode[] = []): ThoughtNode[] => {
	result.push(node);
	node.children.forEach(child => flattenTree(child, result));
	return result;
};

const TimelineView: React.FC<{ tree: ThoughtNode }> = ({ tree }) => {
	const nodes = flattenTree(tree);

	return (
		<div className="void-flex void-flex-col void-gap-0">
			{nodes.map((node, index) => {
				const Icon = roleIcons[node.role];
				const display = roleDisplayConfig[node.role];

				return (
					<div key={node.id} className="void-flex void-gap-3">
						{/* Timeline line */}
						<div className="void-flex void-flex-col void-items-center">
							<div
								className={`void-w-6 void-h-6 void-rounded-full void-flex void-items-center void-justify-center void-flex-shrink-0 void-z-10
									${node.status === 'running' ? 'conductor-pulse' : ''}`}
								style={{
									backgroundColor: `${display.color}20`,
									border: `2px solid ${display.color}`,
									boxShadow: node.status === 'running' ? `0 0 10px ${display.glowColor}` : undefined,
								}}
							>
								<Icon size={10} style={{ color: display.color }} />
							</div>
							{index < nodes.length - 1 && (
								<div
									className="void-w-px void-flex-1 void-min-h-[20px]"
									style={{
										backgroundColor: node.status === 'completed' ? display.color : 'var(--void-border-2)',
										opacity: node.status === 'completed' ? 0.4 : 0.2,
									}}
								/>
							)}
						</div>

						{/* Content */}
						<div className="void-pb-4 void-flex-1 void-min-w-0">
							<div className="void-flex void-items-center void-gap-2 void-mb-1">
								<span className="void-text-xs void-font-semibold" style={{ color: display.color }}>
									{display.label}
								</span>
								<span className="void-text-xs void-text-void-fg-4">
									{node.status === 'completed' ? 'Completed' :
										node.status === 'running' ? 'In Progress' :
											node.status === 'waiting' ? 'Queued' : 'Idle'}
								</span>
							</div>
							<div className="void-text-xs void-text-void-fg-2 void-leading-relaxed">
								{node.content}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
};
