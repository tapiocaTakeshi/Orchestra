/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useState } from 'react';
import { useIsDark } from '../util/services.js';
import { MessageSquare, Workflow, Wrench, GitBranch, Music } from 'lucide-react';

import '../styles.css'
import { SidebarChat } from './SidebarChat.js';
import ErrorBoundary from './ErrorBoundary.js';
import { ConductorView } from '../conductor-tsx/ConductorView.js';
import { PipelineBuilder } from '../conductor-tsx/PipelineBuilder.js';
import { ThoughtTree } from '../conductor-tsx/ThoughtTree.js';
import { ConductorMode } from '../conductor-tsx/ConductorMode.js';

type SidebarTab = 'chat' | 'pipeline' | 'builder' | 'thoughts' | 'conductor';

const tabConfig: { id: SidebarTab; icon: React.ComponentType<{ size?: number; className?: string }>; label: string }[] = [
	{ id: 'chat', icon: MessageSquare, label: 'Chat' },
	{ id: 'pipeline', icon: Workflow, label: 'Pipeline' },
	{ id: 'builder', icon: Wrench, label: 'Builder' },
	{ id: 'thoughts', icon: GitBranch, label: 'Thoughts' },
	{ id: 'conductor', icon: Music, label: 'Conductor' },
];

export const Sidebar = ({ className }: { className: string }) => {

	const isDark = useIsDark()
	const [activeTab, setActiveTab] = useState<SidebarTab>('chat');

	return <div
		className={`@@void-scope ${isDark ? 'dark' : ''}`}
		style={{ width: '100%', height: '100%' }}
	>
		<div
			className={`
				w-full h-full
				bg-void-bg-2
				text-void-fg-1
				flex flex-col
			`}
		>
			{/* Tab bar */}
			<div className="void-flex void-items-center void-border-b void-border-void-border-2 void-bg-void-bg-1/30 void-px-1 void-flex-shrink-0">
				{tabConfig.map(tab => {
					const Icon = tab.icon;
					const isActive = activeTab === tab.id;
					return (
						<button
							key={tab.id}
							onClick={() => setActiveTab(tab.id)}
							className={`
								void-flex void-items-center void-gap-1 void-px-2.5 void-py-2 void-text-xs void-transition-all void-duration-200
								void-border-b-2 void-relative
								${isActive
									? 'void-text-void-fg-1 void-border-[#007FD4]'
									: 'void-text-void-fg-3 void-border-transparent hover:void-text-void-fg-2 hover:void-bg-void-bg-2/50'}
							`}
							title={tab.label}
						>
							<Icon size={13} />
							<span className="void-hidden sm:void-inline">{tab.label}</span>
						</button>
					);
				})}
			</div>

			{/* Content */}
			<div className="void-flex-1 void-overflow-hidden">
				<ErrorBoundary>
					{activeTab === 'chat' && <SidebarChat />}
					{activeTab === 'pipeline' && <ConductorView />}
					{activeTab === 'builder' && <PipelineBuilder />}
					{activeTab === 'thoughts' && <ThoughtTree />}
					{activeTab === 'conductor' && <ConductorMode />}
				</ErrorBoundary>
			</div>
		</div>
	</div>
}
