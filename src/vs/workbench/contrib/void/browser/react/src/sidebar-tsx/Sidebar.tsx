/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useState } from 'react';
import { useIsDark } from '../util/services.js';
import { MessageSquare, Wrench } from 'lucide-react';

import '../styles.css'
import { SidebarChat } from './SidebarChat.js';
import ErrorBoundary from './ErrorBoundary.js';
import { PipelineBuilder } from '../conductor-tsx/PipelineBuilder.js';
import type { SidebarTab } from './OrchestraLogoButton.js';

const tabs: { id: SidebarTab; icon: React.ComponentType<{ size?: number }>; label: string }[] = [
	{ id: 'chat', icon: MessageSquare, label: 'Chat' },
	{ id: 'builder', icon: Wrench, label: 'Builder' },
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
			{/* Tab Bar */}
			<div style={{
				display: 'flex', alignItems: 'center',
				borderBottom: '1px solid var(--void-border-2)',
				padding: '0 4px',
				flexShrink: 0,
				gap: '1px',
			}}>
				{tabs.map(tab => {
					const Icon = tab.icon;
					const isActive = activeTab === tab.id;
					return (
						<button
							key={tab.id}
							onClick={() => setActiveTab(tab.id)}
							style={{
								display: 'flex', alignItems: 'center', justifyContent: 'center',
								gap: '4px',
								padding: '8px 0',
								flex: 1,
								background: 'none',
								border: 'none',
								borderBottom: isActive ? '2px solid var(--void-fg-1)' : '2px solid transparent',
								color: isActive ? 'var(--void-fg-1)' : 'var(--void-fg-3)',
								cursor: 'pointer',
								fontSize: '11px',
								fontWeight: isActive ? 600 : 400,
								transition: 'all 0.15s ease',
								opacity: isActive ? 1 : 0.6,
							}}
							title={tab.label}
						>
							<Icon size={14} />
							<span>{tab.label}</span>
						</button>
					);
				})}
			</div>

			{/* Content */}
			<div style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
				<ErrorBoundary>
					{activeTab === 'chat' && <SidebarChat activeTab={activeTab} onTabChange={setActiveTab} />}
					{activeTab === 'builder' && <SidebarChat activeTab={activeTab} onTabChange={setActiveTab} viewOverride={<PipelineBuilder />} />}
				</ErrorBoundary>
			</div>
		</div>
	</div>
}
