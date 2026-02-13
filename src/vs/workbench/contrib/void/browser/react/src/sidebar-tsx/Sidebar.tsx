/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { useState } from 'react';
import { useIsDark } from '../util/services.js';

import '../styles.css'
import { SidebarChat } from './SidebarChat.js';
import ErrorBoundary from './ErrorBoundary.js';
import { ConductorView } from '../conductor-tsx/ConductorView.js';
import { PipelineBuilder } from '../conductor-tsx/PipelineBuilder.js';
import { ThoughtTree } from '../conductor-tsx/ThoughtTree.js';
import { ConductorMode } from '../conductor-tsx/ConductorMode.js';
import type { SidebarTab } from './OrchestraLogoButton.js';

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
			{/* Content - tab switching via Orchestra logo in SidebarHeader */}
			<div className="void-flex-1 void-overflow-hidden">
				<ErrorBoundary>
					{activeTab === 'chat' && <SidebarChat activeTab={activeTab} onTabChange={setActiveTab} />}
					{activeTab === 'pipeline' && <SidebarChat activeTab={activeTab} onTabChange={setActiveTab} viewOverride={<ConductorView />} />}
					{activeTab === 'builder' && <SidebarChat activeTab={activeTab} onTabChange={setActiveTab} viewOverride={<PipelineBuilder />} />}
					{activeTab === 'thoughts' && <SidebarChat activeTab={activeTab} onTabChange={setActiveTab} viewOverride={<ThoughtTree />} />}
					{activeTab === 'conductor' && <SidebarChat activeTab={activeTab} onTabChange={setActiveTab} viewOverride={<ConductorMode />} />}
				</ErrorBoundary>
			</div>
		</div>
	</div>
}
