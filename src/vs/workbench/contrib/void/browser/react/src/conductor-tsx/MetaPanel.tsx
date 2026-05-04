/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import React, { useEffect, useState } from 'react';
import { Zap, DollarSign, Clock, CheckCircle, Users, TrendingUp } from 'lucide-react';
import { ConductorMetrics } from './ConductorTypes.js';

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

const formatCost = (cost: number): string => {
	if (cost < 0.01) return `<$0.01`;
	return `$${cost.toFixed(3)}`;
};

interface MetricItemProps {
	icon: React.ComponentType<{ size?: number; className?: string }>;
	label: string;
	value: string;
	color: string;
	subtext?: string;
}

const MetricItem: React.FC<MetricItemProps> = ({ icon: Icon, label, value, color, subtext }) => (
	<div className="void-flex void-flex-col void-items-center void-gap-1 void-flex-1 void-min-w-0">
		<div className="void-flex void-items-center void-gap-1">
			<Icon size={12} style={{ color }} />
			<span className="void-text-xs void-text-void-fg-3 void-truncate">{label}</span>
		</div>
		<div className="void-text-sm void-font-semibold void-text-void-fg-1">{value}</div>
		{subtext && (
			<span className="void-text-xs void-text-void-fg-4">{subtext}</span>
		)}
	</div>
);

interface MetaPanelProps {
	metrics: ConductorMetrics;
}

export const MetaPanel: React.FC<MetaPanelProps> = ({ metrics }) => {
	const [liveTime, setLiveTime] = useState(metrics.totalTime);

	useEffect(() => {
		setLiveTime(metrics.totalTime);
	}, [metrics.totalTime]);

	return (
		<div className="void-border-b void-border-void-border-2 void-bg-void-bg-1/50">
			{/* Main metrics row */}
			<div className="void-flex void-items-stretch void-px-2 void-py-3 void-gap-1">
				<MetricItem
					icon={Zap}
					label="Tokens"
					value={formatTokens(metrics.totalTokens)}
					color="#f59e0b"
				/>
				<div className="void-w-px void-bg-void-border-2 void-self-stretch" />
				<MetricItem
					icon={DollarSign}
					label="Cost"
					value={formatCost(metrics.estimatedCost)}
					color="#10b981"
				/>
				<div className="void-w-px void-bg-void-border-2 void-self-stretch" />
				<MetricItem
					icon={Clock}
					label="Time"
					value={formatDuration(liveTime)}
					color="#3b82f6"
				/>
				<div className="void-w-px void-bg-void-border-2 void-self-stretch" />
				<MetricItem
					icon={CheckCircle}
					label="Success"
					value={`${Math.round(metrics.successRate)}%`}
					color="#10b981"
					subtext={`${metrics.completedCount}/${metrics.agentCount}`}
				/>
			</div>

			{/* Progress bar */}
			<div className="void-h-1 void-bg-void-bg-2">
				<div
					className="void-h-full void-transition-all void-duration-500 void-ease-out"
					style={{
						width: `${metrics.successRate}%`,
						background: metrics.successRate === 100
							? 'linear-gradient(90deg, #10b981, #34d399)'
							: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
					}}
				/>
			</div>
		</div>
	);
};
